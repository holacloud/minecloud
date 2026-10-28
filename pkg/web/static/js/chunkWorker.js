// Terrain generation worker.
//
// All noise is a pure function of world coordinates and WORLD_SEED, so neighbouring
// chunks agree on the shared border (no seams) and structures such as trees may spill
// over into the next chunk.

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

self.onmessage = function(e) {
    const { chunkX, chunkZ, chunkSize } = e.data;
    const blocks = [];

    const setBlockData = (x, y, z, type) => {
        blocks.push(x, y, z, type);
    };

    function generateTree(x, y, z, woodType) {
        const leavesType = woodType === 'wood' ? 'leaves' : woodType.replace('_wood', '_leaves');
        const shape = TREE_SHAPES[woodType] || TREE_SHAPES.wood;
        const [minTrunk, maxTrunk] = shape.trunk;
        const trunkHeight = minTrunk + Math.floor(hash2(x, z, 2024) * (maxTrunk - minTrunk + 1));
        const top = y + trunkHeight;

        const leaf = (lx, ly, lz) => {
            // Ragged edges: drop a few outer leaves deterministically.
            if (hash3(lx, ly, lz, 4242) < 0.12) return;
            setBlockData(lx, ly, lz, leavesType);
        };

        if (shape.canopy === 'cone') {
            for (let ly = top - trunkHeight + 2; ly <= top + 1; ly++) {
                const t = (top + 1 - ly) / (trunkHeight - 1);
                const radius = Math.round(0.4 + t * 2.4 - ((top - ly) % 2) * 0.6);
                for (let dx = -radius; dx <= radius; dx++) {
                    for (let dz = -radius; dz <= radius; dz++) {
                        if (Math.abs(dx) + Math.abs(dz) > radius + 0.5) continue;
                        if (dx === 0 && dz === 0 && ly < top) continue;
                        setBlockData(x + dx, ly, z + dz, leavesType);
                    }
                }
            }
        } else if (shape.canopy === 'flat') {
            for (let dx = -3; dx <= 3; dx++) {
                for (let dz = -3; dz <= 3; dz++) {
                    const d = Math.hypot(dx, dz);
                    if (d > 3.2) continue;
                    leaf(x + dx, top, z + dz);
                    if (d < 1.8) leaf(x + dx, top + 1, z + dz);
                }
            }
        } else {
            const radius = shape.radius || 2.2;
            const centerY = top - 0.5;
            const r = Math.ceil(radius);
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    for (let dz = -r; dz <= r; dz++) {
                        const d = Math.hypot(dx, dy * 1.05, dz);
                        if (d > radius) continue;
                        if (dx === 0 && dz === 0 && dy < 1) continue;
                        if (d > radius - 0.8) leaf(x + dx, Math.round(centerY + dy), z + dz);
                        else setBlockData(x + dx, Math.round(centerY + dy), z + dz, leavesType);
                    }
                }
            }
            if (shape.canopy === 'willow') {
                for (const [dx, dz] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2], [-2, 2], [2, -2]]) {
                    const length = 2 + Math.floor(hash2(x + dx, z + dz, 77) * 3);
                    for (let i = 0; i < length; i++) setBlockData(x + dx, top - 1 - i, z + dz, leavesType);
                }
            }
        }

        for (let ty = 0; ty < trunkHeight; ty++) {
            setBlockData(x, y + ty, z, woodType);
        }
    }

    function generateCactus(x, y, z) {
        const cactusHeight = 2 + Math.floor(hash2(x, z, 3030) * 3);
        for (let cy = 0; cy < cactusHeight; cy++) {
            setBlockData(x, y + cy, z, 'cactus');
        }
    }

    for (let x = 0; x < chunkSize; x++) {
        for (let z = 0; z < chunkSize; z++) {
            const worldX = chunkX * chunkSize + x;
            const worldZ = chunkZ * chunkSize + z;
            const climate = sampleClimate(worldX, worldZ);
            const biome = dominantBiome(climate);
            const height = terrainHeight(worldX, worldZ, climate);
            const beach = biome !== 'rocky' && height <= WATER_LEVEL + 1 && fbm(worldX, worldZ, 40, 2, 131) > 0.35;
            const soilDepth = biome === 'rocky' ? 1 : 3 + Math.floor(hash2(worldX, worldZ, 141) * 2);

            for (let y = BEDROCK_Y; y <= height; y++) {
                let blockType;
                const depth = height - y;
                if (y === BEDROCK_Y || (y === BEDROCK_Y + 1 && hash3(worldX, y, worldZ, 5) < 0.5)) {
                    blockType = 'bedrock';
                } else if (depth > soilDepth) {
                    const oreRand = hash3(worldX, y, worldZ, 100);
                    if (oreRand < 0.018) blockType = 'coal_ore';
                    else if (oreRand < 0.024 && y < 4) blockType = 'iron_ore';
                    else if (oreRand < 0.026 && y < 1) blockType = 'gold_ore';
                    else blockType = 'stone';
                } else if (biome === 'desert' || beach) {
                    blockType = 'sand';
                } else if (biome === 'rocky') {
                    blockType = hash2(worldX, worldZ, 1700) < 0.25 + depth * 0.1 ? 'cobblestone' : 'stone';
                } else if (depth === 0 && height >= WATER_LEVEL) {
                    blockType = 'grass';
                } else {
                    blockType = 'dirt';
                }
                setBlockData(worldX, y, worldZ, blockType);
            }

            for (let y = height + 1; y <= WATER_LEVEL; y++) {
                setBlockData(worldX, y, worldZ, 'water');
            }

            if (height < WATER_LEVEL) continue;

            const roll = hash2(worldX, worldZ, 999);
            const treeChance = climate.forest * 0.045 + climate.plains * 0.006 + climate.mountain * 0.004;
            const decorRoll = hash2(worldX, worldZ, 2048);

            if (!beach && biome !== 'desert' && roll < treeChance) {
                const treeTypes = biome === 'forest'
                    ? ['wood', 'spruce_wood', 'birch_wood', 'jungle_wood', 'dark_oak_wood', 'cherry_wood', 'maple_wood', 'willow_wood']
                    : biome === 'rocky' ? ['spruce_wood'] : ['wood', 'birch_wood', 'acacia_wood', 'maple_wood'];
                // Neighbouring trees tend to share a species, which reads as groves.
                const grove = fbm(worldX, worldZ, 24, 1, 1777);
                const treeIndex = Math.floor(grove * treeTypes.length * 0.999);
                generateTree(worldX, height + 1, worldZ, treeTypes[treeIndex]);
            } else if (biome === 'desert' && roll < 0.012) {
                generateCactus(worldX, height + 1, worldZ);
            } else if (biome === 'forest' && decorRoll < 0.08) {
                const plantType = decorRoll < 0.015 ? 'mushroom_red' : decorRoll < 0.03 ? 'mushroom_brown' : decorRoll < 0.04 ? 'flower_red' : decorRoll < 0.045 ? 'flower_yellow' : 'tall_grass';
                setBlockData(worldX, height + 1, worldZ, plantType);
            } else if (biome === 'plains' && !beach && decorRoll < 0.14) {
                // Flowers cluster in meadows instead of being sprinkled uniformly.
                const meadow = fbm(worldX, worldZ, 20, 2, 303);
                const plantType = meadow > 0.62 && decorRoll < 0.06 ? (decorRoll < 0.03 ? 'flower_red' : 'flower_yellow') : 'tall_grass';
                setBlockData(worldX, height + 1, worldZ, plantType);
            } else if (biome === 'rocky' && decorRoll < 0.012) {
                setBlockData(worldX, height + 1, worldZ, hash2(worldX, worldZ, 1888) < 0.5 ? 'mushroom_brown' : 'tall_grass');
            }
        }
    }

    const centerX = chunkX * chunkSize + chunkSize / 2;
    const centerZ = chunkZ * chunkSize + chunkSize / 2;
    const biome = dominantBiome(sampleClimate(centerX, centerZ));
    self.postMessage({ chunkX, chunkZ, blocks, biome });
};
