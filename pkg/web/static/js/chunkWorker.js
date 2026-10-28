// Terrain generation worker.
//
// Builds self-contained chunks from the shared generator (terrainGen.js): trees rooted in
// the surrounding margin are evaluated too, and only their blocks that fall inside this
// chunk are written. The result is a transferable Uint16Array column.

importScripts('/js/chunkStore.js', '/js/terrainGen.js');

const TREE_MARGIN = 3;

let ids = null;

function generateChunk(chunkX, chunkZ) {
    const column = new Uint16Array(CHUNK_VOLUME);
    const minX = chunkX * CHUNK_SIZE;
    const minZ = chunkZ * CHUNK_SIZE;
    const id = (type) => ids[type] ?? AIR_ID;
    const plantIds = new Set(['tall_grass', 'flower_red', 'flower_yellow', 'mushroom_red', 'mushroom_brown'].map(id));

    // Writes a block if it lies inside this chunk. `replace` controls what may be overwritten.
    const put = (x, y, z, type, replace = 'all') => {
        const lx = x - minX;
        const lz = z - minZ;
        if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE || y < WORLD_MIN_Y || y > WORLD_MAX_Y) return;
        const index = chunkIndex(lx, y, lz);
        const current = column[index];
        if (replace === 'air' && current !== AIR_ID && !plantIds.has(current)) return;
        column[index] = id(type);
    };

    function generateTree(x, y, z, woodType) {
        const leavesType = woodType === 'wood' ? 'leaves' : woodType.replace('_wood', '_leaves');
        const shape = TREE_SHAPES[woodType] || TREE_SHAPES.wood;
        const [minTrunk, maxTrunk] = shape.trunk;
        const trunkHeight = minTrunk + Math.floor(hash2(x, z, 2024) * (maxTrunk - minTrunk + 1));
        const top = y + trunkHeight;
        const solidLeaf = (lx, ly, lz) => put(lx, ly, lz, leavesType, 'air');
        // Ragged edges: drop a few outer leaves deterministically.
        const leaf = (lx, ly, lz) => {
            if (hash3(lx, ly, lz, 4242) < 0.12) return;
            solidLeaf(lx, ly, lz);
        };

        if (shape.canopy === 'cone') {
            for (let ly = top - trunkHeight + 2; ly <= top + 1; ly++) {
                const t = (top + 1 - ly) / (trunkHeight - 1);
                const radius = Math.round(0.4 + t * 2.4 - ((top - ly) % 2) * 0.6);
                for (let dx = -radius; dx <= radius; dx++) {
                    for (let dz = -radius; dz <= radius; dz++) {
                        if (Math.abs(dx) + Math.abs(dz) > radius + 0.5) continue;
                        if (dx === 0 && dz === 0 && ly < top) continue;
                        solidLeaf(x + dx, ly, z + dz);
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
                        else solidLeaf(x + dx, Math.round(centerY + dy), z + dz);
                    }
                }
            }
            if (shape.canopy === 'willow') {
                for (const [dx, dz] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2], [-2, 2], [2, -2]]) {
                    const length = 2 + Math.floor(hash2(x + dx, z + dz, 77) * 3);
                    for (let i = 0; i < length; i++) solidLeaf(x + dx, top - 1 - i, z + dz);
                }
            }
        }

        for (let ty = 0; ty < trunkHeight; ty++) {
            put(x, y + ty, z, woodType);
        }
    }

    // 1. Terrain, water and single-column decoration inside the chunk.
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const worldX = minX + lx;
            const worldZ = minZ + lz;
            const surface = columnSurface(worldX, worldZ);
            const { climate, biome, height, beach } = surface;
            const soilDepth = soilDepthAt(worldX, worldZ, surface);

            for (let y = BEDROCK_Y; y <= height; y++) {
                put(worldX, y, worldZ, blockAt(worldX, y, worldZ, surface, soilDepth));
            }

            for (let y = height + 1; y <= WATER_LEVEL; y++) {
                put(worldX, y, worldZ, 'water');
            }

            if (height < WATER_LEVEL) continue;

            const roll = hash2(worldX, worldZ, 999);
            const decorRoll = hash2(worldX, worldZ, 2048);
            const hasTree = treeAt(worldX, worldZ, { climate, biome, height, beach });
            if (hasTree) continue;

            if (biome === 'desert' && roll < 0.012) {
                const cactusHeight = 2 + Math.floor(hash2(worldX, worldZ, 3030) * 3);
                for (let cy = 0; cy < cactusHeight; cy++) put(worldX, height + 1 + cy, worldZ, 'cactus');
            } else if (biome === 'forest' && decorRoll < 0.08) {
                const plantType = decorRoll < 0.015 ? 'mushroom_red' : decorRoll < 0.03 ? 'mushroom_brown' : decorRoll < 0.04 ? 'flower_red' : decorRoll < 0.045 ? 'flower_yellow' : 'tall_grass';
                put(worldX, height + 1, worldZ, plantType);
            } else if (biome === 'plains' && !beach && decorRoll < 0.14) {
                // Flowers cluster in meadows instead of being sprinkled uniformly.
                const meadow = fbm(worldX, worldZ, 20, 2, 303);
                const plantType = meadow > 0.62 && decorRoll < 0.06 ? (decorRoll < 0.03 ? 'flower_red' : 'flower_yellow') : 'tall_grass';
                put(worldX, height + 1, worldZ, plantType);
            } else if (biome === 'rocky' && decorRoll < 0.012) {
                put(worldX, height + 1, worldZ, hash2(worldX, worldZ, 1888) < 0.5 ? 'mushroom_brown' : 'tall_grass');
            }
        }
    }

    // 2. Trees rooted inside the chunk or in its margin. Iterating in global (x, z) order keeps
    //    overlapping canopies consistent between the two chunks that share them.
    for (let worldX = minX - TREE_MARGIN; worldX < minX + CHUNK_SIZE + TREE_MARGIN; worldX++) {
        for (let worldZ = minZ - TREE_MARGIN; worldZ < minZ + CHUNK_SIZE + TREE_MARGIN; worldZ++) {
            const surface = columnSurface(worldX, worldZ);
            const woodType = treeAt(worldX, worldZ, surface);
            if (woodType) generateTree(worldX, surface.height + 1, worldZ, woodType);
        }
    }

    return column;
}

// Requests are queued and always served nearest-to-the-player first; chunks that fell out
// of range before being generated are dropped (and reported, so they can be requested again).
const pending = new Map();
let focus = { chunkX: 0, chunkZ: 0, radius: Infinity };
let scheduled = false;
// Zero-delay yield (nested setTimeout(0) calls get clamped to 4 ms).
const yieldChannel = new MessageChannel();
yieldChannel.port1.onmessage = () => processNext();

function distanceToFocus(request) {
    return Math.max(Math.abs(request.chunkX - focus.chunkX), Math.abs(request.chunkZ - focus.chunkZ));
}

function scheduleNext() {
    if (scheduled || pending.size === 0) return;
    scheduled = true;
    // Yield between chunks so focus updates arriving meanwhile reorder the queue.
    yieldChannel.port2.postMessage(null);
}

function processNext() {
    scheduled = false;
    let next = null;
    for (const request of pending.values()) {
        if (!next || distanceToFocus(request) < distanceToFocus(next)) next = request;
    }
    if (!next) return;
    pending.delete(`${next.chunkX},${next.chunkZ}`);

    const { chunkX, chunkZ } = next;
    const blocks = generateChunk(chunkX, chunkZ);
    const centerX = chunkX * CHUNK_SIZE + CHUNK_SIZE / 2;
    const centerZ = chunkZ * CHUNK_SIZE + CHUNK_SIZE / 2;
    const biome = dominantBiome(sampleClimate(centerX, centerZ));
    self.postMessage({ type: 'chunk', chunkX, chunkZ, blocks, biome }, [blocks.buffer]);
    scheduleNext();
}

self.onmessage = function(e) {
    const message = e.data;
    if (message.type === 'init') {
        ids = message.ids;
    } else if (message.type === 'focus') {
        focus = message;
        for (const [key, request] of pending) {
            if (distanceToFocus(request) <= focus.radius) continue;
            pending.delete(key);
            self.postMessage({ type: 'dropped', chunkX: request.chunkX, chunkZ: request.chunkZ });
        }
    } else if (message.type === 'generate') {
        pending.set(`${message.chunkX},${message.chunkZ}`, { chunkX: message.chunkX, chunkZ: message.chunkZ });
    }
    scheduleNext();
};
