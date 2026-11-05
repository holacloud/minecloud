// Node tests for what players built in the terrain viewer's tiles (js/viewer/builtOverlay.js,
// builtBlocks.js and the real tile builder of tileWorker.js): the surface format, which tile shows
// which chunk, how columns become cells and boxes at each level of detail, that no seam or hole
// appears at a tile's edge, polling, and that having no server is just terrain.
// Run with: node --test test/js/viewerOverlay.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const VIEWER = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js', 'viewer');
const STATIC_JS = path.join(VIEWER, '..');
const overlay = require(path.join(VIEWER, 'builtOverlay.js'));

// BuiltBlocks expects builtOverlay.js as globals, as on the page.
function loadBuiltBlocks() {
    const context = vm.createContext({ console, setTimeout, clearTimeout, TextDecoder, Int32Array, Uint8Array, DataView, Math, Map, Set, Array, JSON, Promise, Error, Object, String, Float64Array });
    for (const file of ['builtOverlay.js', 'builtBlocks.js']) {
        vm.runInContext(fs.readFileSync(path.join(VIEWER, file), 'utf8'), context, { filename: file });
    }
    return vm.runInContext('BuiltBlocks', context);
}

// The real tile builder: importScripts stands in for the worker's.
function loadTileWorker() {
    const context = vm.createContext({ console, Math, Array, Float32Array, Float64Array, Int8Array, Int32Array, Uint8Array, Uint16Array, Uint32Array, Boolean, TextDecoder, DataView, String, Error });
    context.self = context;
    context.importScripts = (...urls) => {
        for (const url of urls) {
            const file = path.join(STATIC_JS, url.replace(/^\/js\//, ''));
            vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
        }
    };
    vm.runInContext(fs.readFileSync(path.join(VIEWER, 'tileWorker.js'), 'utf8'), context, { filename: 'tileWorker.js' });
    return context;
}
const worker = loadTileWorker();
const buildTile = vm.runInContext('buildTile', worker);
const columnSurface = vm.runInContext('columnSurface', worker);

// Writes the format of pkg/network/viewer.go.
function encodeSurface(names, chunks) {
    const out = [];
    const u16 = (v) => out.push(v & 255, (v >> 8) & 255);
    const u32 = (v) => { u16(v & 0xffff); u16((v >>> 16) & 0xffff); };
    for (const c of 'MCS1') out.push(c.charCodeAt(0));
    u16(names.length);
    for (const [name, color, flags] of names) {
        out.push(name.length, ...Buffer.from(name), (color >> 16) & 255, (color >> 8) & 255, color & 255, flags);
    }
    u16(chunks.length);
    for (const { x, z, version, columns } of chunks) {
        u32(x); u32(z); u32(version); u16(columns.length);
        for (const [index, y, name] of columns) { out.push(index); u16(y); u16(name); }
    }
    return Uint8Array.from(out).buffer;
}

const GOLD = 0xe4b83f;
const record = (x, z, top, color = GOLD, weight = 1) => [x, z, weight, top, color];
const records = (...list) => Int32Array.from(list.flat());
const baseJob = { lod: 0, tileX: 0, tileZ: 0, colorMode: 'blocks', trees: false };

// Heights of the top faces of a built tile, by local cell (x0, z0) -> y.
function topFaces(mesh) {
    const tops = new Map();
    const { positions, normals } = mesh;
    for (let v = 0; v < positions.length / 3; v += 4) {
        if (normals[v * 3 + 1] !== 1) continue;
        const xs = [0, 1, 2, 3].map((k) => positions[(v + k) * 3]);
        const zs = [0, 1, 2, 3].map((k) => positions[(v + k) * 3 + 2]);
        const key = `${Math.min(...xs)},${Math.min(...zs)}`;
        const y = positions[v * 3 + 1];
        if (!tops.has(key) || tops.get(key) < y) tops.set(key, y);
    }
    return tops;
}

// ---------------------------------------------------------------- geometry of tiles and chunks

test('the box step is as the header says, and always divides the cell', () => {
    for (let lod = 0; lod <= 9; lod++) {
        const step = 1 << lod;
        const box = overlay.overlayBoxStep(lod);
        assert.equal(step % box, 0, `lod ${lod}`);
        assert.ok(step / box <= 4, `lod ${lod} ratio`);
    }
    assert.equal(overlay.overlayBoxStep(0), 1);
    assert.equal(overlay.overlayBoxStep(2), 1);
    assert.equal(overlay.overlayBoxStep(4), 4);
    assert.equal(overlay.overlayBoxStep(overlay.OVERLAY_SUMMARY_LOD), 16);
    assert.equal(overlay.overlayBoxStep(9), 128);
});

test('a tile and the chunks it shows know each other, also around zero', () => {
    for (let lod = 0; lod <= 9; lod++) {
        for (const [chunkX, chunkZ] of [[0, 0], [-1, -1], [3, -7], [31, 32], [-64, 64], [1000, -1000]]) {
            const tiles = overlay.overlayTilesForChunk(lod, chunkX, chunkZ);
            assert.ok(tiles.length >= 1, `lod ${lod}`);
            for (const [tileX, tileZ] of tiles) {
                const range = overlay.overlayTileRange(lod, tileX, tileZ);
                assert.ok(chunkX >= range.minX && chunkX <= range.maxX && chunkZ >= range.minZ && chunkZ <= range.maxZ, `lod ${lod} tile ${tileX},${tileZ} chunk ${chunkX},${chunkZ}`);
            }
            // The tile right around the chunk's corner is among them.
            const size = 64 << lod;
            const own = [Math.floor(chunkX * 16 / size), Math.floor(chunkZ * 16 / size)];
            assert.ok(tiles.some(([x, z]) => x === own[0] && z === own[1]), `lod ${lod} own tile`);
        }
    }
});

test('a column on a tile edge also rebuilds the neighbour whose border sees it', () => {
    // Chunk 3 ends where lod-0 tile 0 does (64 blocks): tile 1 has it in its border.
    const tiles = overlay.overlayTilesForChunk(0, 3, 1);
    assert.deepEqual(tiles.map(String).sort(), ['0,0', '1,0'].sort());
    const middle = overlay.overlayTilesForChunk(0, 1, 1);
    assert.deepEqual(middle.map(String), ['0,0']);
});

test('a lod-0 tile asks for few chunks, and a far one is not asked for columns', () => {
    const range = overlay.overlayTileRange(0, 0, 0);
    assert.deepEqual(range, { minX: -1, minZ: -1, maxX: 4, maxZ: 4 });
});

// ---------------------------------------------------------------- the surface format

test('decodes the surface format, negative chunks and depths included', () => {
    const buffer = encodeSurface(
        [['stone_bricks', 0x7d7d7d, 0], ['water', 0x3d85c6, 2]],
        [{ x: -3, z: 7, version: 12, columns: [[0xfa, 40, 0], [0x01, -5, 1]] }, { x: 70000, z: -70000, version: 13, columns: [] }]
    );
    const { names, chunks } = overlay.overlayDecodeSurface(buffer);
    assert.deepEqual(names, ['stone_bricks', 'water']);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].x, -3);
    assert.equal(chunks[0].version, 12);
    assert.equal(chunks[1].z, -70000);
    assert.deepEqual({ ...overlay.overlayColumn(chunks[0].columns, 0) }, { lx: 10, lz: 15, y: 40, name: 0, color: 0x7d7d7d });
    const water = overlay.overlayColumn(chunks[0].columns, 1);
    assert.equal(water.y, -5);
    assert.equal(water.color, 0x3d85c6 | overlay.OVERLAY_FLUID_BIT);
});

test('rejects what is not a surface', () => {
    assert.throws(() => overlay.overlayDecodeSurface(Uint8Array.from([1, 2, 3, 4, 0, 0, 0, 0]).buffer));
});

test('records carry world positions and the first free height', () => {
    const columns = overlay.overlayDecodeSurface(encodeSurface([['x', 0x102030, 0]], [{ x: -1, z: 2, version: 1, columns: [[(3 << 4) | 5, 9, 0]] }])).chunks;
    const list = overlay.overlayRecordsFromColumns(columns);
    assert.deepEqual(Array.from(list), [-16 + 5, 32 + 3, 1, 10, 0x102030]);

    const far = overlay.overlayRecordsFromSummaries([{ x: 2, z: 3, raisedCount: 100, raisedTop: 30, raisedColor: GOLD, loweredCount: 0, loweredTop: 0, loweredColor: 0 }]);
    assert.deepEqual(Array.from(far), [40, 56, 100, 31, GOLD]);
    const both = overlay.overlayRecordsFromSummaries([{ x: 0, z: 0, raisedCount: 1, raisedTop: 9, raisedColor: 1, loweredCount: 2, loweredTop: 1, loweredColor: 2 }]);
    assert.equal(both.length, overlay.OVERLAY_RECORD_INTS * 2);
});

// ---------------------------------------------------------------- cells and boxes

test('at lod 0 a cell is its column, exactly', () => {
    const raster = overlay.overlayRasterize(records(record(5, 7, 40)), 0, 0, 0);
    assert.deepEqual({ ...overlay.overlayCell(raster, 6, 8) }, { top: 40, color: GOLD });
    assert.equal(overlay.overlayCell(raster, 5, 8), null);
    assert.deepEqual(overlay.overlayBoxes(raster, new Float64Array(66 * 66), 6), []);
});

test('records out of the tile and its border are ignored', () => {
    const raster = overlay.overlayRasterize(records(record(-2, 0, 40), record(65, 0, 40), record(0, 70, 40)), 0, 0, 0);
    assert.equal(raster.count, 0);
    const border = overlay.overlayRasterize(records(record(-1, -1, 40), record(64, 64, 40)), 0, 0, 0);
    assert.equal(border.count, 2);
    assert.ok(overlay.overlayCell(border, 0, 0));
    assert.ok(overlay.overlayCell(border, 65, 65));
});

test('from further away a cell needs half of it covered to change', () => {
    // lod 2: cells of 4 x 4 columns.
    const few = records(record(0, 0, 3), record(1, 0, 3), record(2, 0, 3), record(3, 0, 3), record(0, 1, 3), record(1, 1, 3), record(2, 1, 3));
    assert.equal(overlay.overlayCell(overlay.overlayRasterize(few, 0, 0, 2), 1, 1), null, '7 of 16');
    const half = records(...[...Array(8).keys()].map((k) => record(k % 4, k >> 2, 3)));
    assert.equal(overlay.overlayCell(overlay.overlayRasterize(half, 0, 0, 2), 1, 1).top, 3, '8 of 16');
});

test('a hole does not sink a far cell, but a quarry does', () => {
    const hole = overlay.overlayRasterize(records(record(1, 1, -2)), 0, 0, 3);
    assert.equal(overlay.overlayCell(hole, 1, 1), null);
    const pit = [];
    for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) pit.push(record(x, z, -2));
    const quarry = overlay.overlayRasterize(records(...pit), 0, 0, 3);
    assert.equal(overlay.overlayCell(quarry, 1, 1).top, -2);
});

test('a wall one block thick stays as boxes, at its real height, thin as the box step', () => {
    // lod 3: cells of 8, boxes of 2; a wall along x = 3, 8 blocks long, 30 high.
    const wall = [];
    for (let z = 0; z < 8; z++) wall.push(record(3, z, 30));
    const raster = overlay.overlayRasterize(records(...wall), 0, 0, 3);
    assert.equal(overlay.overlayCell(raster, 1, 1), null);
    const tops = new Float64Array(66 * 66).fill(8);
    const boxes = overlay.overlayBoxes(raster, tops, 6);
    assert.equal(boxes.length, 4);
    for (const box of boxes) {
        assert.equal(box.top, 30);
        assert.equal(box.x0, 2);
        assert.equal(box.x1, 4);
        assert.equal(box.color, GOLD);
    }
});

test('a lone post does not make a far box', () => {
    // lod 6: boxes of 16 x 16 need 16 columns of it.
    const post = overlay.overlayRasterize(records(record(5, 5, 90, GOLD, 1)), 0, 0, 6);
    assert.deepEqual(overlay.overlayBoxes(post, new Float64Array(66 * 66).fill(8), 6), []);
    const tower = overlay.overlayRasterize(records(record(5, 5, 90, GOLD, 16)), 0, 0, 6);
    assert.equal(overlay.overlayBoxes(tower, new Float64Array(66 * 66).fill(8), 6).length, 1);
});

test('boxes only keep walls that can be seen, and edge walls go below the terrain', () => {
    // Two boxes side by side at lod 4 (boxes of 4), at the tile's first cell.
    const block = [];
    for (let x = 0; x < 8; x++) for (let z = 0; z < 4; z++) block.push(record(x, z, 30));
    const raster = overlay.overlayRasterize(records(...block), 0, 0, 4);
    const boxes = overlay.overlayBoxes(raster, new Float64Array(66 * 66).fill(8), 6);
    assert.equal(boxes.length, 2);
    const left = boxes.find((box) => box.x0 === 0);
    const directions = left.walls.map(([di, dj]) => `${di},${dj}`).sort();
    assert.deepEqual(directions, ['-1,0', '0,-1', '0,1'].sort(), 'no wall between them');
    const edge = left.walls.find(([di]) => di === -1);
    assert.equal(edge[2], 8 - 6, 'on the tile edge it goes a skirt below');
    const inner = left.walls.find(([, dj]) => dj === 1);
    assert.equal(inner[2], 8, 'inside it stops at the ground');
});

test('colours go to linear light for the vertex attribute', () => {
    assert.deepEqual(overlay.overlayVertexColor(0xffffff), [255, 255, 255]);
    assert.deepEqual(overlay.overlayVertexColor(0), [0, 0, 0]);
    const [r, g, b] = overlay.overlayVertexColor(0x808080 | overlay.OVERLAY_FLUID_BIT);
    assert.ok(r === g && g === b && r < 0x80 && r > 40, `grey ${r}`);
});

// ---------------------------------------------------------------- the real tile builder

test('a tile with no records is exactly the terrain tile', () => {
    const plain = buildTile({ ...baseJob, trees: true });
    const empty = buildTile({ ...baseJob, trees: true, overlay: new Int32Array(0) });
    assert.equal(plain.hasOverlay, false);
    assert.deepEqual(Array.from(empty.land.positions), Array.from(plain.land.positions));
    assert.deepEqual(Array.from(empty.land.colors), Array.from(plain.land.colors));
});

test('only the columns with records change, at any level of detail', () => {
    for (const lod of [0, 1, 3]) {
        const job = { ...baseJob, lod };
        const plain = topFaces(buildTile(job).land);
        const step = 1 << lod;
        const cover = [];
        for (let x = 0; x < step; x++) for (let z = 0; z < step; z++) cover.push(record(10 * step + x, 10 * step + z, 60));
        const built = topFaces(buildTile({ ...job, overlay: records(...cover) }).land);
        const key = `${10 * step},${10 * step}`;
        assert.equal(built.get(key), Math.round(60 / Math.min(step, 8)) * Math.min(step, 8), `lod ${lod}`);
        let different = 0;
        for (const [cell, y] of plain) {
            if (built.get(cell) !== y) different++;
        }
        assert.equal(different, 1, `lod ${lod}: ${different} cells differ`);
    }
});

test('the top of a built column has its block colour, in linear light', () => {
    const tile = buildTile({ ...baseJob, overlay: records(record(3, 3, 80)) });
    const { positions, colors } = tile.land;
    let found = null;
    for (let v = 0; v < positions.length / 3; v++) {
        if (positions[v * 3 + 1] === 80) {
            found = Array.from(colors.slice(v * 3, v * 3 + 3));
            break;
        }
    }
    assert.deepEqual(found, overlay.overlayVertexColor(GOLD));
    assert.equal(tile.hasOverlay, true);
    assert.ok(tile.maxTop >= 80);
});

test('a building is walled down to its neighbours, with bounds that contain it', () => {
    const height = 90;
    const tile = buildTile({ ...baseJob, overlay: records(record(20, 20, height)) });
    const { positions, normals } = tile.land;
    const sides = new Set();
    for (let v = 0; v < positions.length / 3; v += 4) {
        if (normals[v * 3 + 1] !== 0) continue;
        const ys = [0, 1, 2, 3].map((k) => positions[(v + k) * 3 + 1]);
        if (Math.max(...ys) === height) sides.add(`${normals[v * 3]},${normals[v * 3 + 2]}`);
    }
    assert.equal(sides.size, 4);
    assert.ok(tile.maxTop >= height);
});

test('no gap at the edge between two tiles: a pit there is walled by the neighbour', () => {
    // Dig a column at the last row of lod-0 tile 0: x = 63. The cell x = 64 belongs to tile 1, and
    // must wall the pit: tile 1 only knows through its border sample.
    const z = 30;
    const surface = columnSurface(64, z);
    const groundTop = surface.height + 1;
    const pitTop = groundTop - 8;
    const pit = records(record(63, z, pitTop));
    const left = buildTile({ ...baseJob, overlay: pit });
    assert.equal(topFaces(left.land).get(`63,${z}`), pitTop);
    const right = buildTile({ ...baseJob, tileX: 1, overlay: pit });

    // Tile 1's quad facing -x at x = 0 and z = 30 reaches down to the pit's floor.
    const { positions, normals } = right.land;
    let lowest = Infinity;
    for (let v = 0; v < positions.length / 3; v += 4) {
        if (normals[v * 3] !== -1) continue;
        const xs = [0, 1, 2, 3].map((k) => positions[(v + k) * 3]);
        const zs = [0, 1, 2, 3].map((k) => positions[(v + k) * 3 + 2]);
        if (Math.max(...xs) !== 0 || Math.min(...xs) !== 0 || Math.min(...zs) !== z) continue;
        lowest = Math.min(lowest, ...[0, 1, 2, 3].map((k) => positions[(v + k) * 3 + 1]));
    }
    assert.ok(lowest <= pitTop, `the wall ends at ${lowest}, the pit's floor is ${pitTop}`);
});

test('a dug column below sea level is dry; natural water around stays', () => {
    // Find a sea column with no overlay.
    let found = null;
    for (let tileX = -8; tileX < 8 && !found; tileX++) {
        for (let tileZ = -8; tileZ < 8 && !found; tileZ++) {
            const plain = buildTile({ ...baseJob, tileX, tileZ });
            if (plain.water && plain.water.positions.length > 3 * 4 * 4) found = { tileX, tileZ, plain };
        }
    }
    assert.ok(found, 'some water near the origin');
    const { tileX, tileZ, plain } = found;
    const lx = plain.water.positions[0] < plain.water.positions[3] ? plain.water.positions[0] : plain.water.positions[3];
    const lz = Math.min(plain.water.positions[2], plain.water.positions[8]);
    const dry = buildTile({ ...baseJob, tileX, tileZ, overlay: records(record(tileX * 64 + lx, tileZ * 64 + lz, -3)) });
    assert.equal(dry.water.indices.length, plain.water.indices.length - 6);
    assert.equal(topFaces(dry.land).get(`${lx},${lz}`), -3);
});

test('built water sits at the water surface in its column', () => {
    const tile = buildTile({ ...baseJob, overlay: records(record(4, 4, 30, 0x3d85c6 | overlay.OVERLAY_FLUID_BIT)) });
    assert.equal(topFaces(tile.land).get('4,4'), 29.875);
    const far = buildTile({ ...baseJob, lod: 3, overlay: records(...[...Array(64).keys()].map((k) => record(k % 8, k >> 3, 30, overlay.OVERLAY_FLUID_BIT))) });
    assert.ok(Number.isInteger(topFaces(far.land).get('0,0')));
});

test('a tree stops being drawn on a column that lost it', () => {
    let found = null;
    for (let tileX = 0; tileX < 12 && !found; tileX++) {
        for (let tileZ = 0; tileZ < 12 && !found; tileZ++) {
            const withTrees = buildTile({ ...baseJob, tileX, tileZ, trees: true });
            const without = buildTile({ ...baseJob, tileX, tileZ, trees: false });
            if (withTrees.land.positions.length > without.land.positions.length) found = { tileX, tileZ, withTrees };
        }
    }
    assert.ok(found, 'a tile with trees near the origin');
    const { tileX, tileZ, withTrees } = found;
    const treeAt = vm.runInContext('treeAt', worker);
    let root = null;
    for (let x = tileX * 64; x < tileX * 64 + 64 && !root; x++) {
        for (let z = tileZ * 64; z < tileZ * 64 + 64 && !root; z++) {
            if (treeAt(x, z, columnSurface(x, z))) root = [x, z];
        }
    }
    const cut = buildTile({ ...baseJob, tileX, tileZ, trees: true, overlay: records(record(root[0], root[1], columnSurface(root[0], root[1]).height + 1)) });
    assert.ok(cut.land.positions.length < withTrees.land.positions.length);
});

test('a far tile shows a castle from chunk summaries, and height colouring still works', () => {
    const rows = [];
    for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) rows.push({ x, z, raisedCount: 200, raisedTop: 49, raisedColor: GOLD, loweredCount: 0, loweredTop: 0, loweredColor: 0 });
    const list = overlay.overlayRecordsFromSummaries(rows);
    const tile = buildTile({ ...baseJob, lod: 6, overlay: list.slice() });
    assert.equal(tile.hasOverlay, true);
    assert.equal(tile.maxTop, 50, 'the real height');
    const plain = buildTile({ ...baseJob, lod: 6 });
    assert.ok(tile.land.positions.length > plain.land.positions.length);
    const heights = buildTile({ ...baseJob, lod: 6, colorMode: 'height', overlay: list.slice() });
    assert.equal(heights.maxTop, 50);
});

// ---------------------------------------------------------------- polling

function jsonResponse(body) {
    const text = JSON.stringify(body);
    return { ok: true, status: 200, text: async () => text, json: async () => body };
}
function binaryResponse(buffer) {
    return { ok: true, status: 200, arrayBuffer: async () => buffer };
}
function row(x, z, version, columns = 3) {
    return [x, z, version, columns, columns, 40, GOLD, 0, 0, 0];
}
const list = (epoch, version, chunks, more = false, next = version) => ({ epoch, version, next, more, scanning: false, chunks });

function fakeServer(handler) {
    const seen = [];
    return { seen, fetchImpl: async (url) => { seen.push(url); return handler(url); } };
}

test('the first poll loads the whole list, page by page, and tells which chunks came', async () => {
    const BuiltBlocks = loadBuiltBlocks();
    const server = fakeServer((url) => {
        if (url.endsWith('since=0')) return jsonResponse(list('e1', 3, [row(0, 0, 1), row(1, 0, 2)], true, 2));
        return jsonResponse(list('e1', 3, [row(2, 0, 3)]));
    });
    const told = [];
    const built = new BuiltBlocks({ fetchImpl: server.fetchImpl, schedule: false, onChanged: (rows) => told.push(...rows) });
    await built.poll();
    assert.equal(built.available, true);
    assert.equal(built.settled, true);
    assert.equal(built.rows.size, 3);
    assert.deepEqual(server.seen, ['/viewer-api/changes?since=0', '/viewer-api/changes?since=2']);
    assert.deepEqual(told.map((r) => r.x), [0, 1, 2]);
    assert.equal(built.since, 3);
    assert.equal(built.columnTotal, 9);
});

test('a later poll only reports what is new, and an edited chunk counts once', async () => {
    const BuiltBlocks = loadBuiltBlocks();
    let answer = jsonResponse(list('e1', 1, [row(0, 0, 1, 5)]));
    const told = [];
    const built = new BuiltBlocks({ fetchImpl: async () => answer, schedule: false, onChanged: (rows) => told.push(rows.length) });
    await built.poll();
    answer = jsonResponse(list('e1', 1, []));
    await built.poll();
    assert.deepEqual(told, [1], 'nothing new, nobody told');
    answer = jsonResponse(list('e1', 2, [row(0, 0, 2, 7)]));
    await built.poll();
    assert.deepEqual(told, [1, 1]);
    assert.equal(built.rows.size, 1);
    assert.equal(built.columnTotal, 7);
});

test('a restarted server is a new list: everything is reloaded', async () => {
    const BuiltBlocks = loadBuiltBlocks();
    let epoch = 'first';
    const server = fakeServer((url) => {
        if (epoch === 'first') return jsonResponse(list('first', 9, [row(5, 5, 9)]));
        return jsonResponse(list('second', 2, url.endsWith('since=0') ? [row(7, 7, 2)] : []));
    });
    const told = [];
    const built = new BuiltBlocks({ fetchImpl: server.fetchImpl, schedule: false, onChanged: (rows) => told.push(...rows.map((r) => r.key)) });
    await built.poll();
    epoch = 'second';
    told.length = 0;
    await built.poll();
    assert.deepEqual([...built.rows.keys()], ['7,7']);
    assert.ok(told.includes('5,5'), 'the old chunk is rebuilt away');
    assert.ok(told.includes('7,7'));
    assert.equal(built.since, 2);
});

for (const [name, failure] of [
    ['a network error', async () => { throw new Error('no route'); }],
    ['a 404 from a plain file server', async () => ({ ok: false, status: 404 })],
    ['a page that is not JSON', async () => ({ ok: true, status: 200, text: async () => '<html>' })]
]) {
    test(`${name} means terrain only, and nothing thrown`, async () => {
        const BuiltBlocks = loadBuiltBlocks();
        const built = new BuiltBlocks({ fetchImpl: failure, schedule: false });
        await built.poll();
        assert.equal(built.available, false);
        assert.equal(built.settled, true);
        assert.equal(built.readyForTile(0, 0, 0), true);
        assert.equal(built.recordsForTile(0, 0, 0), null);
        assert.equal(built.columnAt(0, 0), null);
        assert.match(built.statusLine(), /no server/);
    });
}

test('losing the server keeps what was known', async () => {
    const BuiltBlocks = loadBuiltBlocks();
    let up = true;
    const built = new BuiltBlocks({ schedule: false, fetchImpl: async () => { if (!up) throw new Error('down'); return jsonResponse(list('e', 1, [row(0, 0, 1)])); } });
    await built.poll();
    up = false;
    await built.poll();
    assert.equal(built.rows.size, 1);
    assert.match(built.statusLine(), /not answering/);
});

test('a near tile waits for its page; a far one uses the list; both then have records', async () => {
    const BuiltBlocks = loadBuiltBlocks();
    const surface = encodeSurface([['gold_block', GOLD, 0]], [{ x: 1, z: 1, version: 1, columns: [[0, 50, 0]] }]);
    const server = fakeServer((url) => (url.includes('changes') ? jsonResponse(list('e', 1, [row(1, 1, 1, 1)])) : binaryResponse(surface)));
    let pagesArrived = 0;
    const built = new BuiltBlocks({ fetchImpl: server.fetchImpl, schedule: false, onPages: () => pagesArrived++ });
    await built.poll();

    assert.equal(built.readyForTile(6, 0, 0), true, 'far tiles need no columns');
    const far = built.recordsForTile(6, 0, 0);
    assert.deepEqual(Array.from(far), [24, 24, 1, 41, GOLD]);

    assert.equal(built.readyForTile(0, 0, 0), false);
    assert.equal(built.readyForTile(0, 0, 0), false, 'asked only once');
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(server.seen.filter((url) => url.includes('surface')).length, 1);
    assert.equal(server.seen.find((url) => url.includes('surface')), '/viewer-api/surface?x0=0&z0=0&x1=15&z1=15');
    assert.ok(pagesArrived >= 1);
    assert.equal(built.readyForTile(0, 0, 0), true);
    assert.deepEqual(Array.from(built.recordsForTile(0, 0, 0)), [16, 16, 1, 51, GOLD]);
    assert.deepEqual({ ...built.columnAt(16, 16) }, { y: 50, name: 'gold_block' });
    assert.equal(built.columnAt(17, 16), null);

    assert.equal(built.readyForTile(0, 5, 5), true, 'a tile with nothing built waits for nothing');
    assert.equal(built.recordsForTile(0, 5, 5), null);
});

test('a page that changes is read again, and a failed one does not hold tiles back', async () => {
    const BuiltBlocks = loadBuiltBlocks();
    let surfaceFails = false;
    let answer = jsonResponse(list('e', 1, [row(1, 1, 1, 1)]));
    const reads = [];
    const built = new BuiltBlocks({
        schedule: false,
        fetchImpl: async (url) => {
            if (url.includes('changes')) return answer;
            reads.push(url);
            if (surfaceFails) throw new Error('down');
            return binaryResponse(encodeSurface([['s', GOLD, 0]], [{ x: 1, z: 1, version: reads.length, columns: [[0, 50 + reads.length, 0]] }]));
        }
    });
    await built.poll();
    built.readyForTile(0, 0, 0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(reads.length, 1);

    answer = jsonResponse(list('e', 2, [row(1, 1, 2, 1)]));
    await built.poll();
    assert.equal(built.readyForTile(0, 0, 0), false, 'stale now');
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(reads.length, 2);
    assert.equal(built.columnAt(16, 16).y, 52);

    answer = jsonResponse(list('e', 3, [row(1, 1, 3, 1)]));
    surfaceFails = true;
    await built.poll();
    built.readyForTile(0, 0, 0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(built.readyForTile(0, 0, 0), true, 'failed: go on with what there is');
    assert.deepEqual(Array.from(built.recordsForTile(0, 0, 0)).slice(0, 2), [16, 16], 'the last known columns stay');
});

test('a chunk with no columns left paints nothing', async () => {
    const BuiltBlocks = loadBuiltBlocks();
    const built = new BuiltBlocks({ schedule: false, fetchImpl: async () => jsonResponse(list('e', 1, [[1, 1, 1, 0, 0, 0, 0, 0, 0, 0]])) });
    await built.poll();
    assert.equal(built.recordsForTile(7, 0, 0), null);
});

test('turning it off tells every tile, and no tile waits or gets records', async () => {
    const BuiltBlocks = loadBuiltBlocks();
    const told = [];
    const built = new BuiltBlocks({ schedule: false, fetchImpl: async () => jsonResponse(list('e', 1, [row(0, 0, 1), row(1, 1, 1)])), onChanged: (rows) => told.push(rows.length) });
    await built.poll();
    built.setEnabled(false);
    assert.deepEqual(told, [2, 2]);
    assert.equal(built.readyForTile(0, 0, 0), true);
    assert.equal(built.recordsForTile(7, 0, 0), null);
    assert.match(built.statusLine(), /hidden/);
    built.setEnabled(true);
    assert.deepEqual(told, [2, 2, 2]);
    assert.ok(built.recordsForTile(7, 0, 0));
});

test('nothing built: an empty list is a plain world', async () => {
    const BuiltBlocks = loadBuiltBlocks();
    const built = new BuiltBlocks({ schedule: false, fetchImpl: async () => jsonResponse(list('e', 0, [])) });
    await built.poll();
    assert.equal(built.available, true);
    assert.equal(built.recordsForTile(0, 0, 0), null);
    assert.equal(built.readyForTile(0, 0, 0), true);
    assert.match(built.statusLine(), /<b>0<\/b> chunks/);
});

// ---------------------------------------------------------------- the same names on the page

test('the viewer scripts keep their own constants in step', () => {
    const worker = fs.readFileSync(path.join(VIEWER, 'tileWorker.js'), 'utf8');
    const viewer = fs.readFileSync(path.join(VIEWER, 'terrainViewer.js'), 'utf8');
    const samples = (source) => Number(source.match(/const TILE_SAMPLES = (\d+)/)[1]);
    assert.equal(samples(worker), overlay.OVERLAY_TILE_SAMPLES);
    assert.equal(samples(viewer), overlay.OVERLAY_TILE_SAMPLES);
});
