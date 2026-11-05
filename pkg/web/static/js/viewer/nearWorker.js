// Meshes the viewer's near chunks off the main thread (see js/viewer/nearBlocks.js), with the game's
// own scripts: the block types with every extension's, the chunk decoder and the chunk mesher.
//
// There is no page here, so the materials the mesher sorts faces by are tokens: the WorldRenderer
// runs its real material logic (which faces and blocks share one) over createFaceMaterial below,
// so a chunk gets the same groups, and the same draw calls, as in the game. A token says how to
// ask the page for the real material.
//
// The worker keeps the columns it fetched, neighbours too (for faces, ambient occlusion and light
// across borders), up to NEAR_COLUMN_CAP, and meshes one chunk of the latest wish list at a time.

const NEAR_THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
// A column is 128 KB here: this is 12 MB at most.
const NEAR_COLUMN_CAP = 96;
const NEAR_CHUNKS_PER_REQUEST = 16;
const NEAR_RETRY_MS = 5000;

// What the game's scripts expect at load time and never use here.
self.window = self;
self.Game = class Game {};
self.Worker = class { postMessage() {} terminate() {} };
self.document = { createElement: () => ({ getContext: () => null }), addEventListener() {}, getElementById: () => null, querySelector: () => null };

class NearMaterialToken {
    constructor() {
        this.ref = null;
    }

    clone() {
        return this;
    }
}

let nearWorld = null;
let nearWish = [];
let nearWishKeys = new Set();
let nearBusy = false;
const nearDone = new Map();
const nearRetryAt = new Map();

// The block world, with tokens for materials.
function nearMakeWorld() {
    const world = new WorldRenderer({ add() {}, remove() {} });
    world.createFaceMaterial = () => new NearMaterialToken();
    const label = (material, type) => {
        if (Array.isArray(material)) {
            material.forEach((token, face) => { token.ref = token.ref || [type, face]; });
        } else {
            material.ref = material.ref || [type, -1];
        }
        return material;
    };
    const getChunkMaterial = world.getChunkMaterial.bind(world);
    world.getChunkMaterial = (type) => label(getChunkMaterial(type), type);
    const getChunkAtlasMaterial = world.getChunkAtlasMaterial.bind(world);
    world.getChunkAtlasMaterial = (type) => {
        const material = getChunkAtlasMaterial(type);
        material.ref = material.ref || [type, 'atlas'];
        return material;
    };
    nearKeepBorderFaces(world);
    return world;
}

// Next to a chunk that stays a tile, the mesher must not hide a face against the real block there:
// the tile, whole blocks coarser perhaps, may not reach as high, and there would be a slit to see
// through. So what the mesher reads of such a neighbour for its faces counts as air. Light and sky
// come from the columns themselves, and are not touched.
function nearKeepBorderFaces(world) {
    const mesher = world.mesher;
    const fillPadded = mesher.fillPadded.bind(mesher);
    mesher.fillPadded = (chunkX, chunkZ) => {
        fillPadded(chunkX, chunkZ);
        const size = mesher.paddedSize;
        for (let pz = 0; pz < size; pz++) {
            for (let px = 0; px < size; px++) {
                const dx = px === 0 ? -1 : px === size - 1 ? 1 : 0;
                const dz = pz === 0 ? -1 : pz === size - 1 ? 1 : 0;
                if ((dx === 0 && dz === 0) || nearWishKeys.has(world.chunkKey(chunkX + dx, chunkZ + dz))) continue;
                for (let y = WORLD_MIN_Y; y <= mesher.topY; y++) mesher.padded[mesher.paddedIndex(px, y, pz)] = AIR_ID;
            }
        }
    };
}

// A ladder's facing is not in the chunk: it is against the first solid block next to it.
function nearLadderFacing(world, x, y, z) {
    const solid = (bx, bz) => world.registry.solid[world.getBlockId(bx, y, bz)] === 1;
    if (solid(x - 1, z)) return 'px';
    if (solid(x + 1, z)) return 'nx';
    if (solid(x, z - 1)) return 'pz';
    if (solid(x, z + 1)) return 'nz';
    return 'pz';
}

// The arrays of a mesh from ChunkMesher.toMesh, ready to go to the page.
function nearPackMesh(mesh, renderOrder) {
    const { geometry } = mesh;
    const box = geometry.boundingBox;
    return {
        positions: geometry.attributes.position.array,
        normals: geometry.attributes.normal.array,
        uvs: geometry.attributes.uv.array,
        colors: geometry.attributes.color.array,
        light: geometry.attributes.blockLight.array,
        sky: geometry.attributes.skyLight.array,
        indices: geometry.index.array,
        groups: geometry.groups.map(({ start, count, materialIndex }) => ({ start, count, materialIndex })),
        materials: mesh.material.map((material) => (Array.isArray(material) ? material[0] : material).ref),
        box: [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z],
        renderOrder
    };
}

function nearBuffers(part) {
    return [part.positions.buffer, part.normals.buffer, part.uvs.buffer, part.colors.buffer, part.light.buffer, part.sky.buffer, part.indices.buffer];
}

// Meshes a chunk whose column and neighbours are loaded: the parts of world.rebuildChunk.
function nearMeshChunk(world, chunkX, chunkZ) {
    const result = world.mesher.build(chunkX, chunkZ);
    const parts = [];
    const add = (buckets, renderOrder) => {
        const mesh = buckets.length ? ChunkMesher.toMesh(buckets) : null;
        if (mesh) parts.push(nearPackMesh(mesh, renderOrder));
    };
    add(result.buckets, 0);
    add(result.water ? [result.water] : [], 0);
    // As in the game: stained glass goes after the other see-through things.
    add(result.glass, 60);
    const ladders = result.special
        .filter(({ type }) => type === 'ladder')
        .map(({ x, y, z }) => ({ x: x - chunkX * CHUNK_SIZE, y, z: z - chunkZ * CHUNK_SIZE, facing: nearLadderFacing(world, x, y, z) }));
    return { parts, ladders };
}

function nearAround(chunkX, chunkZ) {
    const keys = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) keys.push([chunkX + dx, chunkZ + dz]);
    }
    return keys;
}

// The envelope of pkg/network/viewer_chunks.go: the frames of a chunks response.
function nearSplitFrames(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'MCB1') throw new Error('Not a chunks response');
    const count = view.getUint16(4, true);
    const frames = [];
    let offset = 6;
    for (let i = 0; i < count; i++) {
        const length = view.getUint32(offset, true);
        offset += 4;
        frames.push(buffer.slice(offset, offset + length));
        offset += length;
    }
    return frames;
}

async function nearLoadColumns(world, coords) {
    const missing = coords.filter(([x, z]) => !world.columns.has(world.chunkKey(x, z)));
    for (let i = 0; i < missing.length; i += NEAR_CHUNKS_PER_REQUEST) {
        const batch = missing.slice(i, i + NEAR_CHUNKS_PER_REQUEST);
        const response = await fetch(`/viewer-api/chunks?c=${batch.flat().join(',')}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        for (const frame of nearSplitFrames(await response.arrayBuffer())) {
            const { chunkX, chunkZ, blocks } = await decode(frame);
            world.columns.set(world.chunkKey(chunkX, chunkZ), new ChunkColumn(chunkX, chunkZ, blocks));
        }
    }
}

// Forgets the oldest columns over the cap, except the ones in use. A Map keeps insertion order,
// and a column in use goes to the end.
function nearTrimColumns(world, inUse) {
    for (const [x, z] of inUse) {
        const key = world.chunkKey(x, z);
        const column = world.columns.get(key);
        if (column) {
            world.columns.delete(key);
            world.columns.set(key, column);
        }
    }
    for (const key of world.columns.keys()) {
        if (world.columns.size <= NEAR_COLUMN_CAP) break;
        world.columns.delete(key);
    }
}

function nearNextJob(now) {
    return nearWish.find((job) => nearDone.get(job.key) !== job.rev && !(nearRetryAt.get(job.key) > now));
}

async function nearPump() {
    if (nearBusy || !nearWorld) return;
    nearBusy = true;
    try {
        for (;;) {
            const job = nearNextJob(performance.now());
            if (!job) break;
            const around = nearAround(job.x, job.z);
            try {
                await nearLoadColumns(nearWorld, around);
                // The wish list may have moved on while waiting for the network.
                if (!nearWish.includes(job)) continue;
                const start = performance.now();
                const { parts, ladders } = nearMeshChunk(nearWorld, job.x, job.z);
                const ms = performance.now() - start;
                nearDone.set(job.key, job.rev);
                nearTrimColumns(nearWorld, around);
                self.postMessage({ type: 'mesh', key: job.key, x: job.x, z: job.z, rev: job.rev, parts, ladders, ms }, parts.flatMap(nearBuffers));
            } catch (error) {
                console.warn('[viewer] near chunk', job.key, error);
                nearRetryAt.set(job.key, performance.now() + NEAR_RETRY_MS);
                setTimeout(nearPump, NEAR_RETRY_MS);
            }
        }
    } finally {
        nearBusy = false;
    }
}

function nearOnMessage(e) {
    const message = e.data;
    if (message.type === 'want') {
        nearWish = message.list;
        // `near` is every chunk shown as blocks, also those already meshed and not in the list.
        nearWishKeys = new Set(message.near || message.list.map((job) => job.key));
        nearPump();
    } else if (message.type === 'invalidate') {
        for (const key of message.keys) nearWorld.columns.delete(key);
    } else if (message.type === 'forget') {
        nearDone.delete(message.key);
    }
}

// Runs the game's scripts. chunkDecoder.js brings chunkStore.js with it, and sets a message
// handler that this one replaces.
function nearInit(sources) {
    importScripts(NEAR_THREE_URL, '/js/chunkDecoder.js');
    for (const src of sources) {
        if (/(^|\/)chunkStore\.js$/.test(src)) continue;
        try {
            importScripts(`/${src}`);
        } catch (error) {
            console.warn('[viewer] could not load in the worker', src, error);
        }
    }
    nearWorld = nearMakeWorld();
    ids = nearWorld.registry.ids;
    self.onmessage = nearOnMessage;
}

self.onmessage = (e) => {
    if (e.data.type !== 'init') return;
    try {
        nearInit(e.data.sources);
    } catch (error) {
        self.postMessage({ type: 'failed', reason: String(error) });
    }
};
