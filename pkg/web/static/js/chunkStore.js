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
        for (let id = 1; id < count; id++) {
            const def = blockTypes[this.names[id]];
            this.fluid[id] = def.fluid ? 1 : 0;
            this.solid[id] = !def.fluid && def.solid !== false ? 1 : 0;
            this.transparent[id] = def.transparent ? 1 : 0;
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
        return true;
    }
}
