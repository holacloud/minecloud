// Terrain viewer tile builder.
//
// A tile is TILE_SAMPLES x TILE_SAMPLES surface samples spaced `step = 2^lod` blocks apart,
// evaluated with the game's own generator (terrainGen.js). Only the surface is meshed:
// a top face per sample plus walls where neighbours are lower, so distant tiles read as
// groups of step x step columns. Heights snap to min(step, MAX_VERTICAL_STEP) so far
// terrain becomes 2x2x2, 4x4x4 and 8x8x8 cubes. Tile edges get skirts that hide cracks
// against neighbours drawn at another level of detail.

importScripts('/js/terrainGen.js');

const TILE_SAMPLES = 64;
const MAX_VERTICAL_STEP = 8;

const BLOCK_COLORS = {
    grass: [0x5f, 0x9a, 0x3a],
    dirt: [0x7a, 0x52, 0x33],
    sand: [0xdc, 0xcb, 0x8c],
    stone: [0x80, 0x80, 0x84],
    cobblestone: [0x6c, 0x6c, 0x6e],
    bedrock: [0x3a, 0x3a, 0x3c]
};
const SIDE_COLORS = { grass: BLOCK_COLORS.dirt };
const BIOME_COLORS = {
    plains: [0x8c, 0xc0, 0x5a],
    forest: [0x2f, 0x7a, 0x34],
    desert: [0xe6, 0xc8, 0x78],
    rocky: [0x8a, 0x86, 0x80]
};
const LEAF_COLORS = {
    wood: [0x4a, 0x8a, 0x34], spruce_wood: [0x2f, 0x5e, 0x34], birch_wood: [0x6a, 0x9c, 0x40],
    jungle_wood: [0x3a, 0x8c, 0x2a], dark_oak_wood: [0x2e, 0x5a, 0x22], cherry_wood: [0xea, 0xa3, 0xbe],
    maple_wood: [0xc8, 0x6a, 0x2a], willow_wood: [0x7e, 0xa8, 0x4e], acacia_wood: [0x6a, 0x8e, 0x2e]
};
const TRUNK_COLOR = [0x5e, 0x42, 0x26];

function heightColor(top) {
    // Low -> high: deep green, green, yellow-brown, grey, white.
    const stops = [[2, [40, 90, 60]], [8, [90, 150, 70]], [16, [170, 160, 90]], [26, [130, 120, 115]], [36, [240, 240, 240]]];
    if (top <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
        if (top <= stops[i][0]) {
            const [h0, c0] = stops[i - 1];
            const [h1, c1] = stops[i];
            const t = (top - h0) / (h1 - h0);
            return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
        }
    }
    return stops[stops.length - 1][1];
}

class MeshWriter {
    constructor() {
        this.positions = [];
        this.normals = [];
        this.colors = [];
        this.indices = [];
        this.vertexCount = 0;
    }

    // Quad from four corners (counter-clockwise seen from the front), one colour per corner.
    quad(corners, normal, colors) {
        const base = this.vertexCount;
        for (let i = 0; i < 4; i++) {
            const c = corners[i];
            this.positions.push(c[0], c[1], c[2]);
            this.normals.push(normal[0], normal[1], normal[2]);
            const color = colors[i];
            this.colors.push(color[0], color[1], color[2]);
        }
        this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        this.vertexCount += 4;
    }

    box(x0, y0, z0, x1, y1, z1, color, sideShade = 0.82) {
        const side = shade(color, sideShade);
        const bottom = shade(color, 0.6);
        const top = [color, color, color, color];
        const sides = [side, side, side, side];
        this.quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], top);
        this.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [bottom, bottom, bottom, bottom]);
        this.quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], sides);
        this.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], sides);
        this.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], sides);
        this.quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], sides);
    }

    pack() {
        return {
            positions: new Float32Array(this.positions),
            normals: new Int8Array(this.normals),
            colors: new Uint8Array(this.colors),
            indices: this.vertexCount > 65535 ? new Uint32Array(this.indices) : new Uint16Array(this.indices)
        };
    }
}

function shade(color, k) {
    return [Math.min(255, color[0] * k), Math.min(255, color[1] * k), Math.min(255, color[2] * k)];
}

function jitter(color, x, z) {
    const n = 0.94 + hash2(x, z, 4441) * 0.12;
    return shade(color, n);
}

function sampleColor(mode, sample) {
    if (mode === 'biome') return BIOME_COLORS[sample.biome];
    if (mode === 'height') return heightColor(sample.top);
    return BLOCK_COLORS[sample.block] || BLOCK_COLORS.stone;
}

function buildTile({ lod, tileX, tileZ, colorMode, trees }) {
    const step = 1 << lod;
    const verticalStep = Math.min(step, MAX_VERTICAL_STEP);
    const n = TILE_SAMPLES;
    const size = n + 2;
    const originX = tileX * n * step;
    const originZ = tileZ * n * step;
    const samples = new Array(size * size);
    let minTop = Infinity;
    let maxTop = -Infinity;
    let blocks = 0;

    // Samples include a one-sample border so walls at the tile edge know their neighbours.
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const worldX = originX + (i - 1) * step + (step >> 1);
            const worldZ = originZ + (j - 1) * step + (step >> 1);
            const surface = columnSurface(worldX, worldZ);
            const top = Math.max(verticalStep, Math.round((surface.height + 1) / verticalStep) * verticalStep);
            const sample = {
                worldX, worldZ, surface, top,
                biome: surface.biome,
                block: blockAt(worldX, surface.height, worldZ, surface)
            };
            samples[j * size + i] = sample;
            if (i > 0 && j > 0 && i <= n && j <= n) {
                minTop = Math.min(minTop, top);
                maxTop = Math.max(maxTop, top);
                blocks += (top - BEDROCK_Y) * step * step;
            }
        }
    }

    const land = new MeshWriter();
    const water = new MeshWriter();
    const waterTop = WATER_LEVEL + 0.875;
    const skirt = verticalStep * 2 + 4;
    const at = (i, j) => samples[j * size + i];
    const directions = [
        { di: 1, dj: 0, normal: [1, 0, 0] },
        { di: -1, dj: 0, normal: [-1, 0, 0] },
        { di: 0, dj: 1, normal: [0, 0, 1] },
        { di: 0, dj: -1, normal: [0, 0, -1] }
    ];

    for (let j = 1; j <= n; j++) {
        for (let i = 1; i <= n; i++) {
            const sample = at(i, j);
            const x0 = (i - 1) * step;
            const z0 = (j - 1) * step;
            const x1 = x0 + step;
            const z1 = z0 + step;
            const top = sample.top;
            let color = sampleColor(colorMode, sample);
            if (colorMode === 'blocks' && lod > 0 && sample.block === 'grass') {
                // Without individual trees, forests read as darker canopy from afar.
                color = shade(color, 1 - sample.surface.climate.forest * 0.35);
            }
            const topColor = jitter(color, sample.worldX, sample.worldZ);
            land.quad([[x0, top, z1], [x1, top, z1], [x1, top, z0], [x0, top, z0]], [0, 1, 0], [topColor, topColor, topColor, topColor]);

            const sideBase = colorMode === 'blocks' ? (SIDE_COLORS[sample.block] || color) : color;
            for (const { di, dj, normal } of directions) {
                const neighbor = at(i + di, j + dj);
                const edge = i + di < 1 || i + di > n || j + dj < 1 || j + dj > n;
                let bottom = neighbor.top;
                if (edge) bottom = Math.min(bottom, top) - skirt;
                if (bottom >= top) continue;

                const upper = shade(sideBase, 0.86);
                const lower = shade(sideBase, 0.55);
                let corners;
                if (di === 1) corners = [[x1, bottom, z1], [x1, bottom, z0], [x1, top, z0], [x1, top, z1]];
                else if (di === -1) corners = [[x0, bottom, z0], [x0, bottom, z1], [x0, top, z1], [x0, top, z0]];
                else if (dj === 1) corners = [[x0, bottom, z1], [x1, bottom, z1], [x1, top, z1], [x0, top, z1]];
                else corners = [[x1, bottom, z0], [x0, bottom, z0], [x0, top, z0], [x1, top, z0]];
                land.quad(corners, normal, [lower, lower, upper, upper]);
            }

            if (top < waterTop) {
                const w = [58, 127, 196];
                water.quad([[x0, waterTop, z1], [x1, waterTop, z1], [x1, waterTop, z0], [x0, waterTop, z0]], [0, 1, 0], [w, w, w, w]);
            }

            if (trees && lod === 0) {
                const woodType = treeAt(sample.worldX, sample.worldZ, sample.surface);
                if (woodType) addTree(land, x0, top, z0, sample.worldX, sample.worldZ, woodType);
            }
        }
    }

    return {
        land: land.pack(),
        water: water.vertexCount ? water.pack() : null,
        minTop: Math.min(minTop, WATER_LEVEL) - skirt,
        maxTop: maxTop + (trees && lod === 0 ? 12 : 0),
        blocks,
        columns: n * n * step * step
    };
}

// Simplified tree: trunk plus a canopy box sized like the game's tree shapes.
function addTree(writer, x0, groundTop, z0, worldX, worldZ, woodType) {
    const shape = TREE_SHAPES[woodType] || TREE_SHAPES.wood;
    const [minTrunk, maxTrunk] = shape.trunk;
    const trunkHeight = minTrunk + Math.floor(hash2(worldX, worldZ, 2024) * (maxTrunk - minTrunk + 1));
    const top = groundTop + trunkHeight;
    const leaves = LEAF_COLORS[woodType] || LEAF_COLORS.wood;
    writer.box(x0, groundTop, z0, x0 + 1, top, z0 + 1, TRUNK_COLOR);
    if (shape.canopy === 'cone') {
        writer.box(x0 - 2, top - trunkHeight + 2, z0 - 2, x0 + 3, top - 1, z0 + 3, leaves);
        writer.box(x0 - 1, top - 1, z0 - 1, x0 + 2, top + 2, z0 + 2, leaves);
    } else if (shape.canopy === 'flat') {
        writer.box(x0 - 3, top, z0 - 3, x0 + 4, top + 2, z0 + 4, leaves);
    } else {
        const r = Math.round(shape.radius || 2.2);
        writer.box(x0 - r, top - r, z0 - r, x0 + r + 1, top + r, z0 + r + 1, leaves);
    }
}

self.onmessage = (e) => {
    const job = e.data;
    const result = buildTile(job);
    const transfer = [
        result.land.positions.buffer, result.land.normals.buffer, result.land.colors.buffer, result.land.indices.buffer
    ];
    if (result.water) {
        transfer.push(result.water.positions.buffer, result.water.normals.buffer, result.water.colors.buffer, result.water.indices.buffer);
    }
    self.postMessage({ id: job.id, ...result }, transfer);
};
