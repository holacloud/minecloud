// Procedural terrain generator shared by the game's chunk worker and the terrain viewer.
//
// All noise is a pure function of world coordinates and WORLD_SEED, so any part of the
// world can be evaluated independently and neighbouring areas always agree.

const WORLD_SEED = 20240611;
const WATER_LEVEL = 5;
const BEDROCK_Y = -5;

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

// Block type of a terrain cell at or below the column surface.
function blockAt(worldX, y, worldZ, surface, soilDepth = soilDepthAt(worldX, worldZ, surface)) {
    const { biome, height, beach } = surface;
    const depth = height - y;
    if (y === BEDROCK_Y || (y === BEDROCK_Y + 1 && hash3(worldX, y, worldZ, 5) < 0.5)) return 'bedrock';
    if (depth > soilDepth) {
        const oreRand = hash3(worldX, y, worldZ, 100);
        if (oreRand < 0.018) return 'coal_ore';
        if (oreRand < 0.024 && y < 4) return 'iron_ore';
        if (oreRand < 0.026 && y < 1) return 'gold_ore';
        return 'stone';
    }
    if (biome === 'desert' || beach) return 'sand';
    if (biome === 'rocky') return hash2(worldX, worldZ, 1700) < 0.25 + depth * 0.1 ? 'cobblestone' : 'stone';
    if (depth === 0 && height >= WATER_LEVEL) return 'grass';
    return 'dirt';
}
