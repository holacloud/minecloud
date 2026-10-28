// Chunk decoder worker.
//
// The server generates and stores the world; this worker turns its binary chunk frames
// (format documented in pkg/world/codec.go) into Uint16Array columns of local block ids.
// Block names travel in a per-chunk palette, so server and client never need to agree on
// numeric ids.

importScripts('/js/chunkStore.js');

let ids = null;
const unknownBlocks = new Set();

function readString(view, bytes, state) {
    const length = view.getUint8(state.offset);
    const text = new TextDecoder().decode(bytes.subarray(state.offset + 1, state.offset + 1 + length));
    state.offset += 1 + length;
    return text;
}

async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decode(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'MCK1') {
        throw new Error('Not a chunk frame');
    }
    const state = { offset: 4 };
    const chunkX = view.getInt32(state.offset, true);
    const chunkZ = view.getInt32(state.offset + 4, true);
    state.offset += 8;
    const biome = readString(view, bytes, state);

    const paletteSize = view.getUint16(state.offset, true);
    state.offset += 2;
    const palette = new Uint16Array(paletteSize);
    for (let i = 0; i < paletteSize; i++) {
        const name = readString(view, bytes, state);
        const id = ids[name];
        if (id === undefined && !unknownBlocks.has(name)) {
            unknownBlocks.add(name);
            console.warn(`Unknown block type from server: ${name}`);
        }
        palette[i] = id ?? AIR_ID;
    }

    const layers = view.getUint16(state.offset, true);
    const width = view.getUint8(state.offset + 2);
    state.offset += 3;
    const raw = await inflate(bytes.subarray(state.offset));

    const blocks = new Uint16Array(CHUNK_VOLUME);
    const count = layers * CHUNK_SIZE * CHUNK_SIZE;
    if (width === 1) {
        for (let i = 0; i < count; i++) blocks[i] = palette[raw[i]];
    } else {
        const indices = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        for (let i = 0; i < count; i++) blocks[i] = palette[indices.getUint16(i * 2, true)];
    }
    return { chunkX, chunkZ, blocks, biome };
}

self.onmessage = async (e) => {
    const message = e.data;
    if (message.type === 'init') {
        ids = message.ids;
        return;
    }
    try {
        const chunk = await decode(message.buffer);
        self.postMessage({ type: 'chunk', ...chunk }, [chunk.blocks.buffer]);
    } catch (error) {
        console.error('Failed to decode chunk', error);
    }
};
