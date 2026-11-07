// Procedural terrain generator shared by the game's chunk worker and the terrain viewer.
//
// All noise is a pure function of world coordinates and WORLD_SEED, so any part of the
// world can be evaluated independently and neighbouring areas always agree.

const WORLD_SEED = 20240611;
const WATER_LEVEL = 5;
const BEDROCK_Y = -14;

function hash2(x, z, seed) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul((seed + WORLD_SEED) | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function hash3(x, y, z, seed) {
    return hash2(x, Math.imul(z | 0, 31) + (y | 0) * 1013, seed);
}

function valueNoise(x, z, seed) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    const a = hash2(ix, iz, seed);
    const b = hash2(ix + 1, iz, seed);
    const c = hash2(ix, iz + 1, seed);
    const d = hash2(ix + 1, iz + 1, seed);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

// Fractal noise in [0, 1]. `scale` is the size in blocks of the largest feature.
function fbm(x, z, scale, octaves, seed) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let freq = 1 / scale;
    for (let o = 0; o < octaves; o++) {
        sum += valueNoise(x * freq, z * freq, seed + o * 101) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2.03;
    }
    return sum / norm;
}

function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Continuous biome weights; terrain height blends between them so biome borders are smooth.
function sampleClimate(x, z) {
    const temperature = fbm(x, z, 260, 3, 11);
    const moisture = fbm(x, z, 210, 3, 23);
    const continental = fbm(x, z, 240, 3, 37);

    const mountain = smoothstep(0.56, 0.72, continental);
    const desert = smoothstep(0.54, 0.64, temperature) * (1 - smoothstep(0.42, 0.52, moisture)) * (1 - mountain);
    const forest = smoothstep(0.5, 0.62, moisture) * (1 - desert) * (1 - mountain);
    const plains = Math.max(0, 1 - mountain - desert - forest);

    return { mountain, desert, forest, plains, continental };
}

function dominantBiome(climate) {
    let best = 'plains';
    let weight = climate.plains;
    if (climate.forest > weight) { best = 'forest'; weight = climate.forest; }
    if (climate.desert > weight) { best = 'desert'; weight = climate.desert; }
    if (climate.mountain > weight) { best = 'rocky'; }
    return best;
}

function terrainHeight(x, z, climate) {
    const hills = fbm(x, z, 64, 4, 51);
    const detail = fbm(x, z, 18, 2, 67);

    const plainsHeight = 5 + hills * 6 + detail * 1.5;
    const forestHeight = 5 + hills * 8 + detail * 2;
    const dunes = Math.abs(fbm(x, z, 28, 2, 79) - 0.5) * 2;
    const desertHeight = 4 + hills * 3 + dunes * 3;
    const ridges = 1 - Math.abs(fbm(x, z, 70, 4, 83) - 0.5) * 2;
    const mountainHeight = 7 + hills * 8 + ridges * ridges * 16 + detail * 2;

    let height = plainsHeight * climate.plains
        + forestHeight * climate.forest
        + desertHeight * climate.desert
        + mountainHeight * climate.mountain;

    // Lakes: carve gently below the water level, never inside mountains.
    const lake = fbm(x, z, 90, 3, 97);
    const lakeStrength = smoothstep(0.6, 0.72, lake) * (1 - climate.mountain);
    if (lakeStrength > 0) {
        height = lerp(height, WATER_LEVEL - 1 - lakeStrength * 3, lakeStrength);
    }

    return Math.floor(height);
}

const TREE_SHAPES = {
    wood: { trunk: [4, 6], canopy: 'round' },
    birch_wood: { trunk: [5, 7], canopy: 'round', radius: 1.6 },
    spruce_wood: { trunk: [6, 9], canopy: 'cone' },
    jungle_wood: { trunk: [7, 10], canopy: 'round', radius: 2.6 },
    dark_oak_wood: { trunk: [5, 7], canopy: 'round', radius: 2.8 },
    acacia_wood: { trunk: [4, 6], canopy: 'flat' },
    cherry_wood: { trunk: [4, 6], canopy: 'round', radius: 2.6 },
    maple_wood: { trunk: [5, 7], canopy: 'round', radius: 2.3 },
    willow_wood: { trunk: [5, 7], canopy: 'willow' }
};

function columnSurface(worldX, worldZ) {
    const climate = sampleClimate(worldX, worldZ);
    const biome = dominantBiome(climate);
    const height = terrainHeight(worldX, worldZ, climate);
    const beach = biome !== 'rocky' && height <= WATER_LEVEL + 1 && fbm(worldX, worldZ, 40, 2, 131) > 0.35;
    return { climate, biome, height, beach };
}

function treeAt(worldX, worldZ, surface) {
    const { climate, biome, height, beach } = surface;
    if (height < WATER_LEVEL || beach || biome === 'desert') return null;
    const treeChance = climate.forest * 0.045 + climate.plains * 0.006 + climate.mountain * 0.004;
    if (hash2(worldX, worldZ, 999) >= treeChance) return null;
    const treeTypes = biome === 'forest'
        ? ['wood', 'spruce_wood', 'birch_wood', 'jungle_wood', 'dark_oak_wood', 'cherry_wood', 'maple_wood', 'willow_wood']
        : biome === 'rocky' ? ['spruce_wood'] : ['wood', 'birch_wood', 'acacia_wood', 'maple_wood'];
    // Neighbouring trees tend to share a species, which reads as groves.
    const grove = fbm(worldX, worldZ, 24, 1, 1777);
    return treeTypes[Math.floor(grove * treeTypes.length * 0.999)];
}

function soilDepthAt(worldX, worldZ, surface) {
    return surface.biome === 'rocky' ? 1 : 3 + Math.floor(hash2(worldX, worldZ, 141) * 2);
}

// How far from water moss grows, and the rest of its rule. Mirrors pkg/terrain/climate.go.
const MOSS_REACH = 4;
const MOSS_CHANCE = 0.6;
const MOSS_MAX_ABOVE = 3;
const MOSS_LAKE_NOISE = 0.56;
const MOSS_MOUNTAIN = 0.10;
const MOSS_FOREST = 0.5;
const MOSS_DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Whether the top of this column is moss: on the shore of a lake of forest or mountain. It only looks
// at the climate and the heights of the columns around it, which nothing else depends on. The noise
// of the lakes goes first, so almost every column is done with before any neighbour is evaluated.
function mossAt(worldX, worldZ, surface) {
    const { climate, height } = surface;
    if (climate.mountain < MOSS_MOUNTAIN && climate.forest < MOSS_FOREST) return false;
    if (height < WATER_LEVEL || height > WATER_LEVEL + MOSS_MAX_ABOVE) return false;
    if (hash2(worldX, worldZ, 1913) >= MOSS_CHANCE) return false;
    if (fbm(worldX, worldZ, 90, 3, 97) < MOSS_LAKE_NOISE) return false;
    for (let reach = 1; reach <= MOSS_REACH; reach++) {
        for (const [dx, dz] of MOSS_DIRECTIONS) {
            const x = worldX + dx * reach;
            const z = worldZ + dz * reach;
            if (terrainHeight(x, z, sampleClimate(x, z)) < WATER_LEVEL) return true;
        }
    }
    return false;
}

// Where the metals are: everything here is explained in pkg/terrain/ores.go, which this mirrors, and
// the fingerprints in pkg/terrain/terrain_test.go hold the two together. All of it is a pure function
// of world position, so a vein that crosses a chunk border is the same vein on both sides.
const VEIN_CELL_XZ = 12;
const VEIN_CELL_Y = 6;
const VEIN_MARGIN = 2;
const VEIN_MAX_RISE = 1;
const VEIN_MAX_TOTAL = 0.5;
const VEIN_SKIN = 0.5;
const VEIN_SKIN_CHANCE = 0.65;
const VEIN_MAX_RADIUS2 = 3.61;
const VEIN_COVER_SOIL = 5;
const VEIN_COVER_ROCK = 3;
const VEIN_FLOOR = -12;
const VEIN_ZONE_HIGH = 4;
const VEIN_ZONE_MID = 0;
const VEIN_KINDS = {
    coal_ore: [1.9, 1],
    iron_ore: [1.7, 0.9],
    copper_ore: [1.6, 0.9],
    tin_ore: [1.5, 0.7],
    zinc_ore: [1.6, 0.8],
    lead_ore: [1.6, 0.8],
    silver_ore: [1.4, 0.5],
    gold_ore: [1.4, 0.35]
};
// By biome and depth [deep, mid, high]: the share of the cells that holds each ore.
const VEIN_TABLE = {
    plains: [
        [['iron_ore', 0.13], ['coal_ore', 0.07], ['zinc_ore', 0.05], ['lead_ore', 0.04], ['copper_ore', 0.02], ['gold_ore', 0.012]],
        [['coal_ore', 0.2], ['iron_ore', 0.09], ['zinc_ore', 0.03], ['lead_ore', 0.02], ['copper_ore', 0.015]],
        [['coal_ore', 0.25], ['iron_ore', 0.04]]
    ],
    forest: [
        [['iron_ore', 0.11], ['coal_ore', 0.11], ['zinc_ore', 0.03], ['lead_ore', 0.03], ['copper_ore', 0.02], ['gold_ore', 0.01]],
        [['coal_ore', 0.24], ['iron_ore', 0.07], ['zinc_ore', 0.015], ['lead_ore', 0.015], ['copper_ore', 0.01]],
        [['coal_ore', 0.28], ['iron_ore', 0.03]]
    ],
    desert: [
        [['copper_ore', 0.15], ['iron_ore', 0.08], ['lead_ore', 0.03], ['coal_ore', 0.02], ['zinc_ore', 0.02], ['gold_ore', 0.015]],
        [['copper_ore', 0.14], ['iron_ore', 0.06], ['coal_ore', 0.05], ['lead_ore', 0.01]],
        [['copper_ore', 0.08], ['iron_ore', 0.04], ['coal_ore', 0.04]]
    ],
    rocky: [
        [['iron_ore', 0.1], ['tin_ore', 0.08], ['lead_ore', 0.07], ['copper_ore', 0.06], ['gold_ore', 0.04], ['coal_ore', 0.03], ['silver_ore', 0.03]],
        [['iron_ore', 0.1], ['coal_ore', 0.08], ['copper_ore', 0.06], ['tin_ore', 0.06], ['lead_ore', 0.05], ['silver_ore', 0.015], ['gold_ore', 0.015]],
        [['coal_ore', 0.12], ['iron_ore', 0.1], ['tin_ore', 0.08], ['copper_ore', 0.06], ['lead_ore', 0.04], ['silver_ore', 0.01], ['gold_ore', 0.005]]
    ]
};
// Below y = 0 a gold vein is there only with a chance of depth / GOLD_DEPTH_SCALE.
const GOLD_DEPTH_SCALE = 30;
const GALENA_SILVER = 0.1;
const GALENA_ZINC = 0.14;
const GALENA_POCKET = 3;

const OUTCROP_CELL = 18;
const OUTCROP_MARGIN = 4;
const OUTCROP_MAX_TOTAL = 0.61;
const OUTCROP_REACH = 2;
const OUTCROP_SLOPE = 2;
const OUTCROP_EDGE = 0.75;
const OUTCROP_MIN_DEPTH = 2;
const OUTCROP_MAX_DEPTH = 3;
const OUTCROP_KINDS = {
    coal_ore: [3.2, 3],
    iron_ore: [2.8, 3],
    copper_ore: [2.6, 2],
    tin_ore: [2.2, 2],
    zinc_ore: [2.2, 2],
    lead_ore: [2.2, 2],
    silver_ore: [1.5, 1],
    gold_ore: [1.5, 1]
};
const OUTCROP_TABLE = {
    plains: [['coal_ore', 0.3], ['iron_ore', 0.22], ['copper_ore', 0.04], ['zinc_ore', 0.02], ['lead_ore', 0.02]],
    forest: [['coal_ore', 0.34], ['iron_ore', 0.2], ['copper_ore', 0.03], ['zinc_ore', 0.01], ['lead_ore', 0.01]],
    desert: [['copper_ore', 0.38], ['iron_ore', 0.14], ['coal_ore', 0.05], ['lead_ore', 0.02]],
    rocky: [['coal_ore', 0.16], ['iron_ore', 0.14], ['copper_ore', 0.07], ['tin_ore', 0.05], ['lead_ore', 0.03], ['zinc_ore', 0.015], ['silver_ore', 0.005], ['gold_ore', 0.007]]
};

function pickOre(table, roll) {
    let sum = 0;
    for (const [ore, chance] of table) {
        sum += chance;
        if (roll < sum) return ore;
    }
    return '';
}

function segmentDistance2(px, py, pz, bx, by, bz, length) {
    let t = 0;
    const along = px * bx + py * by + pz * bz;
    if (along > 0) {
        t = along / (bx * bx + by * by + bz * bz);
        if (t > length) t = length;
    }
    const dx = px - bx * t;
    const dy = py - by * t;
    const dz = pz - bz * t;
    return dx * dx + dy * dy + dz * dz;
}

function galenaMix(ore, x, y, z) {
    if (ore !== 'lead_ore') return ore;
    const mix = hash3(Math.floor(x / GALENA_POCKET), Math.floor(y / GALENA_POCKET), Math.floor(z / GALENA_POCKET), 3109);
    if (mix < GALENA_SILVER) return 'silver_ore';
    if (mix < GALENA_SILVER + GALENA_ZINC) return 'zinc_ore';
    return ore;
}

// What a whole vein is, decided from its first end; none if the floor of the world or the soil would
// cut it down to crumbs.
function veinOre(cellX, cellY, cellZ, x0, y0, z0, x1, y1, z1, roll) {
    if (y0 < VEIN_FLOOR) return '';
    const climate = sampleClimate(x0, z0);
    const biome = dominantBiome(climate);
    const zone = y0 >= VEIN_ZONE_HIGH ? 2 : y0 >= VEIN_ZONE_MID ? 1 : 0;
    const ore = pickOre(VEIN_TABLE[biome][zone], roll);
    if (!ore) return '';
    if (ore === 'gold_ore' && y0 < 0 && hash3(cellX, cellY, cellZ, 3110) >= -y0 / GOLD_DEPTH_SCALE) return '';
    const cover = biome === 'rocky' ? VEIN_COVER_ROCK : VEIN_COVER_SOIL;
    if (y1 > terrainHeight(x0, z0, climate) - cover) return '';
    if (y1 > terrainHeight(x1, z1, sampleClimate(x1, z1)) - cover) return '';
    return ore;
}

function veinOreAt(x, y, z) {
    const cellX = Math.floor(x / VEIN_CELL_XZ);
    const cellZ = Math.floor(z / VEIN_CELL_XZ);
    const shift = Math.floor(hash2(cellX, cellZ, 3100) * VEIN_CELL_Y);
    const cellY = Math.floor((y + shift) / VEIN_CELL_Y);
    const roll = hash3(cellX, cellY, cellZ, 3101);
    if (roll >= VEIN_MAX_TOTAL) return '';
    const span = VEIN_CELL_XZ - 2 * VEIN_MARGIN;
    const x0 = cellX * VEIN_CELL_XZ + VEIN_MARGIN + Math.floor(hash3(cellX, cellY, cellZ, 3102) * span);
    const z0 = cellZ * VEIN_CELL_XZ + VEIN_MARGIN + Math.floor(hash3(cellX, cellY, cellZ, 3103) * span);
    const y0 = cellY * VEIN_CELL_Y - shift + VEIN_MARGIN + Math.floor(hash3(cellX, cellY, cellZ, 3104) * (VEIN_CELL_Y - 2 * VEIN_MARGIN - VEIN_MAX_RISE + 1));
    const x1 = cellX * VEIN_CELL_XZ + VEIN_MARGIN + Math.floor(hash3(cellX, cellY, cellZ, 3105) * span);
    const z1 = cellZ * VEIN_CELL_XZ + VEIN_MARGIN + Math.floor(hash3(cellX, cellY, cellZ, 3106) * span);
    const y1 = y0 + Math.floor(hash3(cellX, cellY, cellZ, 3107) * (VEIN_MAX_RISE + 1));
    if (segmentDistance2(x - x0, y - y0, z - z0, x1 - x0, y1 - y0, z1 - z0, 1) > VEIN_MAX_RADIUS2) return '';
    const ore = veinOre(cellX, cellY, cellZ, x0, y0, z0, x1, y1, z1, roll);
    if (!ore) return '';
    const [radius, length] = VEIN_KINDS[ore];
    const d2 = segmentDistance2(x - x0, y - y0, z - z0, x1 - x0, y1 - y0, z1 - z0, length);
    if (d2 > radius * radius) return '';
    const core = radius - VEIN_SKIN;
    if (d2 > core * core && hash3(x, y, z, 3108) >= VEIN_SKIN_CHANCE) return '';
    return galenaMix(ore, x, y, z);
}

// Whether the ground falls away from this column at 45 degrees or more.
function steepAt(x, z, surface) {
    for (const [dx, dz] of [[OUTCROP_REACH, 0], [-OUTCROP_REACH, 0], [0, OUTCROP_REACH], [0, -OUTCROP_REACH]]) {
        const nx = x + dx;
        const nz = z + dz;
        if (surface.height - terrainHeight(nx, nz, sampleClimate(nx, nz)) >= OUTCROP_SLOPE) return true;
    }
    return false;
}

// Whether anything grows on this column: the same rolls as Generate in pkg/terrain/chunk.go.
function decoratedAt(x, z, surface) {
    if (treeAt(x, z, surface)) return true;
    const decorRoll = hash2(x, z, 2048);
    switch (surface.biome) {
        case 'desert': return hash2(x, z, 999) < 0.012;
        case 'forest': return decorRoll < 0.08;
        case 'plains': return decorRoll < 0.14;
        case 'rocky': return decorRoll < 0.012;
        default: return false;
    }
}

function outcropOreAt(x, y, z, surface) {
    const cellX = Math.floor(x / OUTCROP_CELL);
    const cellZ = Math.floor(z / OUTCROP_CELL);
    const roll = hash2(cellX, cellZ, 3200);
    if (roll >= OUTCROP_MAX_TOTAL) return '';
    const span = OUTCROP_CELL - 2 * OUTCROP_MARGIN;
    const x0 = cellX * OUTCROP_CELL + OUTCROP_MARGIN + Math.floor(hash2(cellX, cellZ, 3201) * span);
    const z0 = cellZ * OUTCROP_CELL + OUTCROP_MARGIN + Math.floor(hash2(cellX, cellZ, 3202) * span);
    const dx = x - x0;
    const dz = z - z0;
    const d2 = dx * dx + dz * dz;
    if (d2 > OUTCROP_MARGIN * OUTCROP_MARGIN) return '';
    if (surface.height < WATER_LEVEL || surface.beach) return '';
    const ore = pickOre(OUTCROP_TABLE[dominantBiome(sampleClimate(x0, z0))], roll);
    if (!ore) return '';
    const [radius, depth] = OUTCROP_KINDS[ore];
    if (d2 > radius * radius) return '';
    const d = Math.sqrt(d2);
    if (d > radius - 1 && hash2(x, z, 3203) >= OUTCROP_EDGE) return '';
    const deep = Math.max(OUTCROP_MIN_DEPTH, depth - Math.floor((d / radius) * depth));
    if (surface.height - y >= deep) return '';
    if (surface.biome !== 'rocky' && !steepAt(x, z, surface)) return '';
    if (decoratedAt(x, z, surface)) return '';
    return galenaMix(ore, x, y, z);
}

// The ore at a cell of a column at or below its surface, or ''.
function oreAt(x, y, z, surface, soilDepth) {
    if (y === BEDROCK_Y || (y === BEDROCK_Y + 1 && hash3(x, y, z, 5) < 0.5)) return '';
    const depth = surface.height - y;
    if (depth < OUTCROP_MAX_DEPTH) {
        const ore = outcropOreAt(x, y, z, surface);
        if (ore) return ore;
    }
    return depth > soilDepth ? veinOreAt(x, y, z) : '';
}

// Block type of a terrain cell at or below the column surface.
function blockAt(worldX, y, worldZ, surface, soilDepth = soilDepthAt(worldX, worldZ, surface)) {
    if (y === surface.height && !surface.beach && surface.biome !== 'desert' && mossAt(worldX, worldZ, surface)) return 'moss';
    return oreAt(worldX, y, worldZ, surface, soilDepth) || groundBlockAt(worldX, y, worldZ, surface, soilDepth);
}

// What a terrain cell is made of where no moss and no ore is: the rock and the soil, which nothing
// about ores ever changes.
function groundBlockAt(worldX, y, worldZ, surface, soilDepth) {
    const { biome, height, beach } = surface;
    const depth = height - y;
    if (y === BEDROCK_Y || (y === BEDROCK_Y + 1 && hash3(worldX, y, worldZ, 5) < 0.5)) return 'bedrock';
    if (depth > soilDepth) return 'stone';
    if (biome === 'desert' || beach) return 'sand';
    if (biome === 'rocky') return hash2(worldX, worldZ, 1700) < 0.25 + depth * 0.1 ? 'cobblestone' : 'stone';
    if (depth === 0 && height >= WATER_LEVEL) return 'grass';
    return 'dirt';
}
