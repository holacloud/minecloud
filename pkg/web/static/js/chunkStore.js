// Shared voxel storage, loaded both by the page and by the terrain worker (importScripts).
//
// A chunk is a 16 x WORLD_HEIGHT x 16 column of uint16 block ids. Ids come from a
// BlockRegistry so per-block lookups are typed-array reads instead of string-keyed maps.

const CHUNK_SIZE = 16;
const WORLD_MIN_Y = -16;
const WORLD_HEIGHT = 256;
const WORLD_MAX_Y = WORLD_MIN_Y + WORLD_HEIGHT - 1;
const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
const AIR_ID = 0;

// Index layout: y-major, then z, then x.
function chunkIndex(lx, y, lz) {
    return ((y - WORLD_MIN_Y) * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
}

function floorDiv(value, size) {
    return Math.floor(value / size);
}

function localCoord(value) {
    return ((value % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
}

class BlockRegistry {
    constructor(blockTypes) {
        this.names = ['air'];
        this.ids = { air: AIR_ID };
        for (const name of Object.keys(blockTypes)) {
            if (name === 'air' || blockTypes[name].itemOnly) continue;
            this.ids[name] = this.names.length;
            this.names.push(name);
        }

        const count = this.names.length;
        this.solid = new Uint8Array(count);
        this.transparent = new Uint8Array(count);
        this.fluid = new Uint8Array(count);
        // Collision/visual height of solid blocks (1 for full cubes, 0.5 for slabs; for shaped
        // blocks, the top of their collision boxes, e.g. 1.5 for fences).
        this.height = new Float32Array(count);
        // Opaque full cubes: the only blocks that hide neighbouring faces and cast AO.
        this.fullCube = new Uint8Array(count);
        // Non-cube shapes (stairs, doors, fences...; js/blockShapes.js), meshed and collided as boxes.
        this.shaped = new Uint8Array(count);
        // Blocks that give torch light (torches, and `lightEmission` blocks such as lit lamps),
        // and how much: a level up to 14 (true in `lightEmission` means a torch's).
        this.lightEmitter = new Uint8Array(count);
        this.lightLevel = new Uint8Array(count);
        // Stained glass: meshed apart and drawn as a filter (see the chunk mesher).
        this.filterGlass = new Uint8Array(count);
        for (let id = 1; id < count; id++) {
            const def = blockTypes[this.names[id]];
            this.fluid[id] = def.fluid ? 1 : 0;
            this.solid[id] = !def.fluid && def.solid !== false ? 1 : 0;
            // `lightPasses`: sky and torch light go through it although its material is opaque.
            this.transparent[id] = def.transparent || def.lightPasses ? 1 : 0;
            this.shaped[id] = def.shape ? 1 : 0;
            this.height[id] = this.solid[id] ? (def.collisionHeight ?? def.height ?? 1) : 0;
            this.fullCube[id] = this.solid[id] && !this.transparent[id] && !this.shaped[id] && this.height[id] === 1 ? 1 : 0;
            this.lightEmitter[id] = this.names[id] === 'torch' || def.lightEmission ? 1 : 0;
            this.lightLevel[id] = this.lightEmitter[id] ? (typeof def.lightEmission === 'number' ? def.lightEmission : 14) : 0;
            this.filterGlass[id] = def.filterGlass ? 1 : 0;
        }
    }

    id(name) {
        return this.ids[name] ?? AIR_ID;
    }

    name(id) {
        return id === AIR_ID ? null : this.names[id] || null;
    }
}

class ChunkColumn {
    constructor(chunkX, chunkZ, blocks = null) {
        this.chunkX = chunkX;
        this.chunkZ = chunkZ;
        this.blocks = blocks || new Uint16Array(CHUNK_VOLUME);
        // Indices of light-emitting blocks; rebuilt lazily after edits.
        this.emitters = null;
        // Other cached block searches (findBlocks), by key; cleared after edits.
        this.found = null;
        // Highest non-air y; recomputed lazily after edits (null = unknown).
        this.cachedMaxY = null;
    }

    // Marks derived data stale after the block array changed.
    invalidate() {
        this.emitters = null;
        this.found = null;
        this.cachedMaxY = null;
    }

    get maxY() {
        if (this.cachedMaxY === null) {
            const layer = CHUNK_SIZE * CHUNK_SIZE;
            let top = WORLD_MIN_Y - 1;
            for (let index = this.blocks.length - 1; index >= 0; index--) {
                if (this.blocks[index] !== AIR_ID) {
                    top = Math.floor(index / layer) + WORLD_MIN_Y;
                    break;
                }
            }
            this.cachedMaxY = top;
        }
        return this.cachedMaxY;
    }

    // Indices of the light emitters: `emitters` is a block id or a flag array by id
    // (registry.lightEmitter). The list is cached, so always pass the same argument.
    getEmitters(emitters) {
        if (!this.emitters) this.emitters = this.scanBlocks(emitters);
        return this.emitters;
    }

    // Indices of the blocks flagged in `flags` (a Uint8Array by block id), cached under `key`
    // until the next edit.
    findBlocks(flags, key) {
        if (!this.found) this.found = new Map();
        let list = this.found.get(key);
        if (!list) {
            list = this.scanBlocks(flags);
            this.found.set(key, list);
        }
        return list;
    }

    scanBlocks(match) {
        const list = [];
        const single = typeof match === 'number';
        for (let index = 0; index < this.blocks.length; index++) {
            const id = this.blocks[index];
            if (single ? id === match : id !== AIR_ID && match[id] === 1) list.push(index);
        }
        return list;
    }

    get(lx, y, lz) {
        if (y < WORLD_MIN_Y || y > WORLD_MAX_Y) return AIR_ID;
        return this.blocks[chunkIndex(lx, y, lz)];
    }

    set(lx, y, lz, id) {
        if (y < WORLD_MIN_Y || y > WORLD_MAX_Y) return false;
        const index = chunkIndex(lx, y, lz);
        if (this.blocks[index] === id) return false;
        this.blocks[index] = id;
        this.invalidate();
        return true;
    }
}
