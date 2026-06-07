self.onmessage = function(e) {
    const { chunkX, chunkZ, chunkSize } = e.data;
    const blocks = [];
    
    function setBlockData(x, y, z, type) {
        blocks.push(x, y, z, type);
    }

    const seed = chunkX * 5741 + chunkZ * 28657;
    const rand = (x, z, offset = 0) => {
        const n = Math.sin(x * 12.9898 + z * 78.233 + seed + offset) * 43758.5453;
        return n - Math.floor(n);
    };

    const noise2D = (x, z, scale = 0.05) => {
        const ix = Math.floor(x * scale);
        const iz = Math.floor(z * scale);
        const fx = (x * scale) - ix;
        const fz = (z * scale) - iz;

        const a = rand(ix, iz);
        const b = rand(ix + 1, iz);
        const c = rand(ix, iz + 1);
        const d = rand(ix + 1, iz + 1);

        const ux = fx * fx * (3 - 2 * fx);
        const uz = fz * fz * (3 - 2 * fz);

        return a * (1 - ux) * (1 - uz) + b * ux * (1 - uz) + c * (1 - ux) * uz + d * ux * uz;
    };

    const getBiomeAt = (worldX, worldZ) => {
        const biomeNoise = noise2D(worldX + 420, worldZ - 310, 0.018);
        const forestNoise = noise2D(worldX - 180, worldZ + 250, 0.03);

        if (biomeNoise < 0.3) return 'desert';
        if (biomeNoise > 0.72) return 'rocky';
        if (forestNoise > 0.58) return 'forest';
        return 'plains';
    };

    function generateTree(x, y, z, woodType = 'wood') {
        const leavesType = woodType === 'wood' ? 'leaves' : woodType.replace('_wood', '_leaves');
        const trunkHeight = 4 + Math.floor(rand(x, z, 2024) * (woodType === 'dark_oak_wood' ? 3 : 2));

        for (let ty = 0; ty < trunkHeight; ty++) {
            setBlockData(x, y + ty, z, woodType);
        }

        const leavesStart = y + trunkHeight - 2;
        for (let ly = 0; ly < 3; ly++) {
            const radius = ly === 2 ? 1 : 2;
            for (let lx = -radius; lx <= radius; lx++) {
                for (let lz = -radius; lz <= radius; lz++) {
                    if (lx === 0 && lz === 0 && ly < 2) continue;
                    if (Math.abs(lx) === 2 && Math.abs(lz) === 2) continue;
                    setBlockData(x + lx, leavesStart + ly, z + lz, leavesType);
                }
            }
        }
    }

    function generateCactus(x, y, z) {
        const cactusHeight = 2 + Math.floor(rand(x, z, 3030) * 3);
        for (let cy = 0; cy < cactusHeight; cy++) {
            setBlockData(x, y + cy, z, 'cactus');
        }
    }

    function generateDecorPlant(x, y, z, type) {
        setBlockData(x, y, z, type);
    }

    for (let x = 0; x < chunkSize; x++) {
        for (let z = 0; z < chunkSize; z++) {
            const worldX = chunkX * chunkSize + x;
            const worldZ = chunkZ * chunkSize + z;
            const biome = getBiomeAt(worldX, worldZ);
            const waterLevel = 5;
            const lakeNoise = noise2D(worldX - 620, worldZ + 910, 0.022);

            let height;
            if (biome === 'desert') {
                height = Math.floor(noise2D(worldX, worldZ) * 5) + 2;
            } else if (biome === 'rocky') {
                height = Math.floor(noise2D(worldX, worldZ) * 10) + 4;
            } else if (biome === 'forest') {
                height = Math.floor(noise2D(worldX, worldZ) * 7) + 3;
            } else {
                height = Math.floor(noise2D(worldX, worldZ) * 8) + 3;
            }

            if (biome !== 'rocky' && lakeNoise > 0.68) {
                const lakeDepth = 1 + Math.floor((lakeNoise - 0.68) * 18);
                height = Math.min(height, waterLevel - lakeDepth);
            }

            for (let y = -5; y <= height; y++) {
                let blockType;
                if (y === -5) {
                    blockType = 'bedrock';
                } else if (y < height - 3 || (biome === 'rocky' && y < height - 1)) {
                    const oreRand = rand(worldX, worldZ, y * 100);
                    if (oreRand < 0.02) blockType = 'coal_ore';
                    else if (oreRand < 0.025) blockType = 'iron_ore';
                    else if (oreRand < 0.026) blockType = 'gold_ore';
                    else blockType = 'stone';
                } else if (biome === 'desert' && y >= height - 2) {
                    blockType = 'sand';
                } else if (biome === 'rocky' && y === height) {
                    blockType = rand(worldX, worldZ, 1700) < 0.65 ? 'stone' : 'cobblestone';
                } else if (y < height) {
                    blockType = 'dirt';
                } else {
                    if (biome === 'desert') {
                        blockType = 'sand';
                    } else if (biome === 'rocky') {
                        blockType = rand(worldX, worldZ, 2200) < 0.2 ? 'cobblestone' : 'stone';
                    } else {
                        const sandHeight = Math.floor(noise2D(worldX + 100, worldZ + 100, 0.1) * 3);
                        blockType = sandHeight <= 0 ? 'grass' : 'sand';
                    }
                }
                setBlockData(worldX, y, worldZ, blockType);
            }

            if (height < waterLevel) {
                for (let y = height + 1; y <= waterLevel; y++) {
                    setBlockData(worldX, y, worldZ, 'water');
                }
            }

            const treeChance = biome === 'forest' ? 0.032 : biome === 'plains' ? 0.012 : biome === 'rocky' ? 0.0025 : 0;
            const cactusChance = biome === 'desert' ? 0.022 : 0;
            const decorRoll = rand(worldX, worldZ, 2048);

            if (treeChance > 0 && rand(worldX, worldZ, 999) < treeChance && height >= 3) {
                const treeTypes = biome === 'forest'
                    ? ['wood', 'spruce_wood', 'birch_wood', 'jungle_wood', 'dark_oak_wood', 'cherry_wood', 'maple_wood', 'willow_wood']
                    : ['wood', 'birch_wood', 'acacia_wood', 'maple_wood'];
                const treeIndex = Math.floor(rand(worldX, worldZ, 1777) * treeTypes.length);
                generateTree(worldX, height + 1, worldZ, treeTypes[treeIndex]);
            } else if (cactusChance > 0 && rand(worldX, worldZ, 1499) < cactusChance && height >= 2) {
                generateCactus(worldX, height + 1, worldZ);
            } else if (biome === 'forest' && decorRoll < 0.06) {
                const plantType = decorRoll < 0.02 ? 'mushroom_red' : decorRoll < 0.035 ? 'mushroom_brown' : decorRoll < 0.048 ? 'flower_red' : decorRoll < 0.055 ? 'flower_yellow' : 'tall_grass';
                generateDecorPlant(worldX, height + 1, worldZ, plantType);
            } else if (biome === 'plains' && decorRoll < 0.08) {
                const plantType = decorRoll < 0.02 ? 'flower_red' : decorRoll < 0.038 ? 'flower_yellow' : 'tall_grass';
                generateDecorPlant(worldX, height + 1, worldZ, plantType);
            } else if (biome === 'rocky' && decorRoll < 0.018) {
                generateDecorPlant(worldX, height + 1, worldZ, rand(worldX, worldZ, 1888) < 0.5 ? 'mushroom_brown' : 'tall_grass');
            }
        }
    }

    self.postMessage({ chunkX, chunkZ, blocks });
};
