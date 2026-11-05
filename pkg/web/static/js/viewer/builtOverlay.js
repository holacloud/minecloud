// What players built, painted over the viewer's terrain tiles: plain logic with no browser in it,
// loaded by the page (js/viewer/builtBlocks.js) and by the tile workers (js/viewer/tileWorker.js).
//
// The server sends only the columns whose top is not the generated one, so a column nobody touched
// keeps the tile's own terrain and an overlay can never open a seam against its neighbours. A
// "record" is a group of columns with one top: one column up close, a chunk's summary from far.
// A tile uses them in two layers, both at most as fine as the data:
//   - a sample cell mostly covered by records takes their height and colour, which is also how a
//     dug hole or a quarry goes down: a cell cannot sink for one hole in it;
//   - where records stand above their cell, boxes up to 4x finer than the cell keep the shape of
//     walls and towers, at their real height. From far, a box needs 1/16 of its area built, so
//     a lone post does not become a tower as wide as a box.
// Far tiles (lod >= OVERLAY_SUMMARY_LOD) use the chunk summaries of the list and fetch nothing.

const OVERLAY_TILE_SAMPLES = 64;
const OVERLAY_PAGE_CHUNKS = 16;
const OVERLAY_SUMMARY_LOD = 5;
const OVERLAY_CHUNK_SIZE = 16;
// Ints per record: world x, world z, weight in columns, top (first free height), colour.
const OVERLAY_RECORD_INTS = 5;
const OVERLAY_FLUID_BIT = 1 << 24;
// What a column's height is offset by when packed.
const OVERLAY_Y_OFFSET = 64;

// How wide a box of the upper layer is, in blocks.
function overlayBoxStep(lod) {
    const step = 1 << lod;
    return Math.max(lod >= OVERLAY_SUMMARY_LOD ? OVERLAY_CHUNK_SIZE : 1, step >> 2);
}

// The chunks whose columns a tile can show, itself and the one-sample border of its neighbours.
function overlayTileRange(lod, tileX, tileZ) {
    const step = 1 << lod;
    const size = OVERLAY_TILE_SAMPLES * step;
    return {
        minX: Math.floor((tileX * size - step) / OVERLAY_CHUNK_SIZE),
        minZ: Math.floor((tileZ * size - step) / OVERLAY_CHUNK_SIZE),
        maxX: Math.floor((tileX * size + size + step - 1) / OVERLAY_CHUNK_SIZE),
        maxZ: Math.floor((tileZ * size + size + step - 1) / OVERLAY_CHUNK_SIZE)
    };
}

// The tiles at this lod that show a chunk: the inverse of overlayTileRange.
function overlayTilesForChunk(lod, chunkX, chunkZ) {
    const step = 1 << lod;
    const size = OVERLAY_TILE_SAMPLES * step;
    const tiles = [];
    const minX = Math.floor((chunkX * OVERLAY_CHUNK_SIZE - step) / size);
    const maxX = Math.floor((chunkX * OVERLAY_CHUNK_SIZE + OVERLAY_CHUNK_SIZE - 1 + step) / size);
    const minZ = Math.floor((chunkZ * OVERLAY_CHUNK_SIZE - step) / size);
    const maxZ = Math.floor((chunkZ * OVERLAY_CHUNK_SIZE + OVERLAY_CHUNK_SIZE - 1 + step) / size);
    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) tiles.push([x, z]);
    }
    return tiles;
}

function overlayPageOf(chunk) {
    return Math.floor(chunk / OVERLAY_PAGE_CHUNKS);
}

// The surface format of pkg/network/viewer.go: each chunk's columns as a pair of ints per column,
// [lz<<4|lx | (y + OVERLAY_Y_OFFSET)<<8 | name index<<18, rgb | OVERLAY_FLUID_BIT]; `names` is
// only for telling which block a column shows.
function overlayDecodeSurface(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'MCS1') throw new Error('Not a surface response');
    let offset = 4;
    const nameCount = view.getUint16(offset, true);
    offset += 2;
    const names = new Array(nameCount);
    const colors = new Int32Array(nameCount);
    const decoder = new TextDecoder();
    for (let i = 0; i < nameCount; i++) {
        const length = bytes[offset];
        names[i] = decoder.decode(bytes.subarray(offset + 1, offset + 1 + length));
        offset += 1 + length;
        const fluid = bytes[offset + 3] & 2 ? OVERLAY_FLUID_BIT : 0;
        colors[i] = (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2] | fluid;
        offset += 4;
    }
    const chunkCount = view.getUint16(offset, true);
    offset += 2;
    const chunks = [];
    for (let c = 0; c < chunkCount; c++) {
        const x = view.getInt32(offset, true);
        const z = view.getInt32(offset + 4, true);
        const version = view.getUint32(offset + 8, true);
        const count = view.getUint16(offset + 12, true);
        offset += 14;
        const columns = new Int32Array(count * 2);
        for (let i = 0; i < count; i++) {
            const y = view.getInt16(offset + 1, true);
            const name = view.getUint16(offset + 3, true);
            columns[i * 2] = bytes[offset] | ((y + OVERLAY_Y_OFFSET) << 8) | (name << 18);
            columns[i * 2 + 1] = colors[name];
            offset += 5;
        }
        chunks.push({ x, z, version, columns });
    }
    return { names, chunks };
}

// Reads one packed column of a chunk.
function overlayColumn(columns, i) {
    const packed = columns[i * 2];
    return { lx: packed & 15, lz: (packed >> 4) & 15, y: ((packed >> 8) & 1023) - OVERLAY_Y_OFFSET, name: packed >>> 18, color: columns[i * 2 + 1] };
}

// Records of a tile close enough for columns: `chunks` is a list of { x, z, columns }.
function overlayRecordsFromColumns(chunks) {
    let total = 0;
    for (const chunk of chunks) total += chunk.columns.length / 2;
    const records = new Int32Array(total * OVERLAY_RECORD_INTS);
    let at = 0;
    for (const chunk of chunks) {
        const baseX = chunk.x * OVERLAY_CHUNK_SIZE;
        const baseZ = chunk.z * OVERLAY_CHUNK_SIZE;
        for (let i = 0; i < chunk.columns.length; i += 2) {
            const packed = chunk.columns[i];
            records[at++] = baseX + (packed & 15);
            records[at++] = baseZ + ((packed >> 4) & 15);
            records[at++] = 1;
            records[at++] = ((packed >> 8) & 1023) - OVERLAY_Y_OFFSET + 1;
            records[at++] = chunk.columns[i + 1];
        }
    }
    return records;
}

// Records of a far tile: `rows` are the entries of the changes list (see BuiltBlocks), each giving
// up to two records, what stands up and what is dug.
function overlayRecordsFromSummaries(rows) {
    let total = 0;
    for (const row of rows) total += (row.raisedCount > 0 ? 1 : 0) + (row.loweredCount > 0 ? 1 : 0);
    const records = new Int32Array(total * OVERLAY_RECORD_INTS);
    let at = 0;
    const write = (row, weight, top, color) => {
        records[at++] = row.x * OVERLAY_CHUNK_SIZE + 8;
        records[at++] = row.z * OVERLAY_CHUNK_SIZE + 8;
        records[at++] = weight;
        records[at++] = top + 1;
        records[at++] = color;
    };
    for (const row of rows) {
        if (row.raisedCount > 0) write(row, row.raisedCount, row.raisedTop, row.raisedColor);
        if (row.loweredCount > 0) write(row, row.loweredCount, row.loweredTop, row.loweredColor);
    }
    return records;
}

// Sorts a tile's records into its sample cells and boxes. Cell indices are those of the tile
// builder's samples: 0 and n + 1 are the border, which belongs to the neighbouring tiles.
function overlayRasterize(records, originX, originZ, lod) {
    const step = 1 << lod;
    const n = OVERLAY_TILE_SAMPLES;
    const size = n + 2;
    const boxStep = overlayBoxStep(lod);
    const ratio = step / boxStep;
    const fineSize = size * ratio;
    const raster = {
        step, ratio, boxStep, size, fineSize, n,
        weight: new Int32Array(size * size),
        sumTop: new Float64Array(size * size),
        maxTop: new Int32Array(size * size),
        color: new Int32Array(size * size),
        fineWeight: new Int32Array(fineSize * fineSize),
        fineTop: new Int32Array(fineSize * fineSize),
        fineColor: new Int32Array(fineSize * fineSize),
        count: 0
    };
    const left = originX - step;
    const back = originZ - step;
    for (let r = 0; r < records.length; r += OVERLAY_RECORD_INTS) {
        const x = records[r] - left;
        const z = records[r + 1] - back;
        const weight = records[r + 2];
        const top = records[r + 3];
        const color = records[r + 4];
        const span = size * step;
        if (x < 0 || z < 0 || x >= span || z >= span) continue;
        raster.count++;

        const cell = Math.floor(z / step) * size + Math.floor(x / step);
        if (raster.weight[cell] === 0 || top > raster.maxTop[cell]) {
            raster.maxTop[cell] = top;
            raster.color[cell] = color;
        }
        raster.weight[cell] += weight;
        raster.sumTop[cell] += top * weight;

        const fine = Math.floor(z / boxStep) * fineSize + Math.floor(x / boxStep);
        if (raster.fineWeight[fine] === 0 || top > raster.fineTop[fine]) {
            raster.fineTop[fine] = top;
            raster.fineColor[fine] = color;
        }
        raster.fineWeight[fine] += weight;
    }
    return raster;
}

// The first layer: what a sample cell becomes, or null if records do not cover most of it. At
// lod 0 the cell is one column, with its exact top.
function overlayCell(raster, i, j) {
    const cell = j * raster.size + i;
    const weight = raster.weight[cell];
    if (weight === 0 || weight * 2 < raster.step * raster.step) return null;
    return { top: raster.step === 1 ? raster.maxTop[cell] : Math.round(raster.sumTop[cell] / weight), color: raster.color[cell] };
}

// The second layer: boxes standing above their cells. `tops` holds the height each sample cell
// ended up with (size * size), and `skirt` how far an edge wall goes below its neighbour, as in the
// tile builder. A box is { x0, z0, x1, z1, top, color, walls: [[di, dj, bottom], ...] } in the
// tile's own coordinates.
function overlayBoxes(raster, tops, skirt) {
    if (raster.step === 1) return [];
    const { fineSize, ratio, boxStep, size, n } = raster;
    const minArea = boxStep * boxStep / 16;
    const standing = (fi, fj) => {
        const fine = fj * fineSize + fi;
        const terrain = tops[Math.floor(fj / ratio) * size + Math.floor(fi / ratio)];
        const weight = raster.fineWeight[fine];
        return weight > 0 && weight >= minArea && raster.fineTop[fine] > terrain ? raster.fineTop[fine] : terrain;
    };
    const boxes = [];
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let fj = ratio; fj < ratio * (n + 1); fj++) {
        for (let fi = ratio; fi < ratio * (n + 1); fi++) {
            const terrain = tops[Math.floor(fj / ratio) * size + Math.floor(fi / ratio)];
            const top = standing(fi, fj);
            if (top <= terrain) continue;
            const walls = [];
            for (const [di, dj] of directions) {
                const ni = fi + di;
                const nj = fj + dj;
                const edge = ni < ratio || nj < ratio || ni >= ratio * (n + 1) || nj >= ratio * (n + 1);
                let bottom = standing(ni, nj);
                if (edge) bottom = Math.min(bottom, terrain) - skirt;
                if (bottom < top) walls.push([di, dj, bottom]);
            }
            const x0 = (fi - ratio) * boxStep;
            const z0 = (fj - ratio) * boxStep;
            boxes.push({ x0, z0, x1: x0 + boxStep, z1: z0 + boxStep, top, color: raster.fineColor[fj * fineSize + fi], walls });
        }
    }
    return boxes;
}

// The palette's colours are what a texture shows on screen, but vertex colours are multiplied in as
// linear light, so a colour goes through this to look the same as the real block's texture.
const OVERLAY_LINEAR = Array.from({ length: 256 }, (_, value) => {
    const c = value / 255;
    return Math.round((c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)) * 255);
});

function overlayVertexColor(color) {
    return [OVERLAY_LINEAR[(color >> 16) & 255], OVERLAY_LINEAR[(color >> 8) & 255], OVERLAY_LINEAR[color & 255]];
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        OVERLAY_TILE_SAMPLES, OVERLAY_PAGE_CHUNKS, OVERLAY_SUMMARY_LOD, OVERLAY_RECORD_INTS, OVERLAY_FLUID_BIT,
        overlayBoxStep, overlayTileRange, overlayTilesForChunk, overlayPageOf, overlayDecodeSurface, overlayColumn,
        overlayRecordsFromColumns, overlayRecordsFromSummaries, overlayRasterize, overlayCell, overlayBoxes, overlayVertexColor
    };
}
