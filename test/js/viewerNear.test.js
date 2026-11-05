// Node tests for the terrain viewer's near detail (js/viewer/nearBlocks.js and nearWorker.js): which
// chunks are chosen, the budgets, when things are disposed, that the block code loads only when
// needed, and that the real game scripts run in a worker's scope and mesh with the same groups as
// in the game.
// Run with: node --test test/js/viewerNear.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const STATIC = path.join(__dirname, '..', '..', 'pkg', 'web', 'static');
const VIEWER = path.join(STATIC, 'js', 'viewer');
const print = require(path.join(STATIC, 'js', 'guidePrint.js'));

// ---------------------------------------------------------------- a small three.js

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
}
class Attribute {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; }
    getX(i) { return this.array[i * this.itemSize]; }
    getY(i) { return this.array[i * this.itemSize + 1]; }
    getZ(i) { return this.array[i * this.itemSize + 2]; }
}
const geometriesDisposed = { count: 0 };
class BufferGeometry {
    constructor() { this.attributes = {}; this.groups = []; this.index = null; }
    setAttribute(name, attribute) { this.attributes[name] = attribute; return this; }
    setIndex(index) { this.index = Array.isArray(index) ? new Attribute(Uint32Array.from(index), 1) : index; return this; }
    addGroup(start, count, materialIndex) { this.groups.push({ start, count, materialIndex }); }
    computeBoundingBox() {
        const positions = this.attributes.position.array;
        const min = new Vector3(Infinity, Infinity, Infinity);
        const max = new Vector3(-Infinity, -Infinity, -Infinity);
        for (let i = 0; i < positions.length; i += 3) {
            min.set(Math.min(min.x, positions[i]), Math.min(min.y, positions[i + 1]), Math.min(min.z, positions[i + 2]));
            max.set(Math.max(max.x, positions[i]), Math.max(max.y, positions[i + 1]), Math.max(max.z, positions[i + 2]));
        }
        this.boundingBox = { min, max, getBoundingSphere: () => ({}) };
    }
    computeBoundingSphere() {}
    dispose() { geometriesDisposed.count++; }
}
class Mesh {
    constructor(geometry, material) { this.geometry = geometry; this.material = material; this.position = new Vector3(); this.rotation = new Vector3(); this.userData = {}; }
}
class Material {
    constructor(options = {}) { Object.assign(this, options); }
    clone() { return Object.assign(new this.constructor(), this); }
}
function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}
const threeParts = {
    Vector3, Vector2: Vector3, Vector4: Vector3, BufferGeometry, Mesh, MeshLambertMaterial: class extends Material {}, MeshStandardMaterial: class extends Material {}, MeshBasicMaterial: class extends Material {},
    BufferAttribute: Attribute, Float32BufferAttribute: class extends Attribute { constructor(list, itemSize) { super(Float32Array.from(list), itemSize); } },
    Box3: class { constructor(min, max) { this.min = min; this.max = max; } getBoundingSphere() { return {}; } }, Sphere: class {},
    Group: class {
        constructor() { this.children = []; this.position = new Vector3(); }
        add(child) { this.children.push(child); }
        updateMatrix() {}
    },
    DataTexture: class { constructor(data) { this.data = data; this.uploads = 0; } set needsUpdate(value) { if (value) this.uploads++; } },
    RGBAFormat: 1, NearestFilter: 2, sRGBEncoding: 'srgb', DoubleSide: 'double', FrontSide: 'front', MultiplyBlending: 'multiply'
};
const THREE = new Proxy(threeParts, { get: (known, key) => (key in known ? known[key] : anyStub()) });

const near = (() => {
    global.THREE = THREE;
    return require(path.join(VIEWER, 'nearBlocks.js'));
})();

// ---------------------------------------------------------------- the worker, for real

function globalsForScripts(extra) {
    return {
        console: { ...console, warn() {} }, Math, Map, WeakMap, Set, Object, Array, JSON, Promise, String, Error, Number, Boolean, Symbol,
        Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
        TextDecoder, Blob, Response, DecompressionStream, performance, setTimeout, clearTimeout, THREE, navigator: {}, ...extra
    };
}

// Only what a dedicated worker has: no window, document, localStorage or canvas until
// nearWorker.js provides its own stand-ins.
function loadWorker(responses) {
    const posted = [];
    const context = vm.createContext(globalsForScripts({
        postMessage: (message) => posted.push(message),
        addEventListener() {},
        fetch: async (url) => responses(url)
    }));
    context.self = context;
    context.importScripts = (...urls) => {
        for (const url of urls) {
            if (/^https?:/.test(url)) continue; // three.js: the small one above.
            const file = path.join(STATIC, url);
            vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: url });
        }
    };
    vm.runInContext(fs.readFileSync(path.join(VIEWER, 'nearWorker.js'), 'utf8'), context, { filename: 'nearWorker.js' });
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    context.onmessage({ data: { type: 'init', sources: near.nearGameScripts(html) } });
    assert.deepEqual(posted, [], 'the scripts load in a worker');
    return { context, posted, send: (data) => context.onmessage({ data }), world: () => vm.runInContext('nearWorld', context) };
}

// The world as a page has it, to compare with.
function loadPageWorld() {
    const canvas = () => ({ width: 16, height: 16, getContext: () => new Proxy({}, { get: (target, key) => (key in target ? target[key] : () => ({ data: new Uint8ClampedArray(4 * 4096) })), set: (target, key, value) => { target[key] = value; return true; } }) });
    const context = vm.createContext(globalsForScripts({
        requestAnimationFrame: () => 0, Worker: class { postMessage() {} terminate() {} }, localStorage: { getItem: () => null, setItem() {} },
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); } },
        document: { createElement: (tag) => (tag === 'canvas' ? canvas() : anyStub()), addEventListener() {}, body: anyStub(), head: anyStub(), getElementById: () => null, querySelector: () => null }
    }));
    context.window = context;
    vm.runInContext('class Game {}', context);
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    for (const src of near.nearGameScripts(html)) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    return { context, world: vm.runInContext('new WorldRenderer({ add() {}, remove() {} })', context) };
}

// A chunk frame as pkg/world/codec.go writes it: `blocks` maps "lx,y,lz" to a name.
function chunkFrame(chunkX, chunkZ, blocks) {
    const names = ['air', ...new Set(Object.values(blocks))];
    const layers = 80;
    const raw = new Uint8Array(layers * 256);
    for (const [key, name] of Object.entries(blocks)) {
        const [lx, y, lz] = key.split(',').map(Number);
        raw[(y + 16) * 256 + lz * 16 + lx] = names.indexOf(name);
    }
    const head = [];
    for (const c of 'MCK1') head.push(c.charCodeAt(0));
    const int32 = Buffer.alloc(8);
    int32.writeInt32LE(chunkX, 0);
    int32.writeInt32LE(chunkZ, 4);
    head.push(...int32, 6, ...Buffer.from('plains'), names.length & 255, names.length >> 8);
    for (const name of names) head.push(name.length, ...Buffer.from(name));
    head.push(layers & 255, layers >> 8, 1);
    return Buffer.concat([Buffer.from(head), zlib.deflateRawSync(raw)]);
}

function chunksResponse(blocksOf, requests) {
    return (url) => {
        requests.push(url);
        const coords = new URL(url, 'http://x').searchParams.get('c').split(',').map(Number);
        const parts = [Buffer.from('MCB1'), Buffer.from([coords.length / 2, 0])];
        for (let i = 0; i < coords.length; i += 2) {
            const frame = chunkFrame(coords[i], coords[i + 1], blocksOf(coords[i], coords[i + 1]));
            const length = Buffer.alloc(4);
            length.writeUInt32LE(frame.length);
            parts.push(length, frame);
        }
        const body = Buffer.concat(parts);
        return { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) };
    };
}

const settle = async (check) => {
    for (let i = 0; i < 500 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 2));
    assert.ok(check(), 'it never happened');
};

// ---------------------------------------------------------------- choosing chunks

function row(x, z, extra = {}) {
    return { key: `${x},${z}`, x, z, columns: 10, raisedCount: 10, raisedTop: 20, loweredCount: 0, loweredTop: 0, ...extra };
}

test('the scripts left out are the same as in the printable guide', () => {
    assert.equal(near.NEAR_SKIP_SCRIPTS.source, print.SKIP_SCRIPTS.source);
    const html = '<script src="https://x/three.js"></script><script src="js/world.js"></script><script src="js/game.js"></script><script src="js/game/guide.js"></script><script src="js/game/water.js"></script>';
    assert.deepEqual(near.nearGameScripts(html), ['js/world.js', 'js/game/water.js']);
});

test('distance counts height over what is built', () => {
    assert.equal(near.nearChunkDistance(row(0, 0), 8, 20, 8), 0);
    assert.equal(near.nearChunkDistance(row(0, 0), 8, 50, 8), 30);
    assert.equal(near.nearChunkDistance(row(1, 0), 8, 20, 8), 8);
    assert.equal(near.nearChunkDistance(row(0, 0, { raisedCount: 0, loweredCount: 3, loweredTop: -2 }), 8, 8, 8), 10);
});

test('only chunks in the radius, nearest first', () => {
    const rows = [row(0, 0), row(20, 0), row(3, 0), row(-1, 0), row(0, 7)];
    const chosen = near.nearSelectChunks(rows, { x: 8, y: 22, z: 8 });
    assert.deepEqual(chosen.map((r) => r.key), ['0,0', '-1,0', '3,0', '0,7']);
});

test('a chunk shown stays until further: no flapping at the edge', () => {
    const edge = row(8, 0);
    const at = { x: 8, y: 22, z: 8 };
    const distance = near.nearChunkDistance(edge, at.x, at.y, at.z);
    assert.ok(distance > near.NEAR_RADIUS && distance < near.NEAR_KEEP_RADIUS);
    assert.deepEqual(near.nearSelectChunks([edge], at), []);
    assert.deepEqual(near.nearSelectChunks([edge], { ...at, active: new Set(['8,0']) }).map((r) => r.key), ['8,0']);
});

test('the chunk cap is hard, and keeps the nearest', () => {
    const rows = [];
    for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) rows.push(row(x, z));
    const chosen = near.nearSelectChunks(rows, { x: 8, y: 22, z: 8 });
    assert.equal(chosen.length, near.NEAR_MAX_CHUNKS);
    assert.equal(chosen[0].key, '0,0');
    const furthest = Math.max(...chosen.map((r) => near.nearChunkDistance(r, 8, 22, 8)));
    const left = rows.filter((r) => !chosen.includes(r));
    assert.ok(left.every((r) => near.nearChunkDistance(r, 8, 22, 8) >= furthest));
});

test('the draw call budget is hard, with real costs where known', () => {
    const rows = [row(0, 0), row(1, 0), row(2, 0), row(3, 0)];
    const costs = { '0,0': 300, '1,0': 300, '2,0': 300, '3,0': 1 };
    const chosen = near.nearSelectChunks(rows, { x: 8, y: 22, z: 8, drawCost: (key) => costs[key] });
    assert.deepEqual(chosen.map((r) => r.key), ['0,0', '1,0', '2,0'].slice(0, 3));
    const over = near.nearSelectChunks(rows, { x: 8, y: 22, z: 8, maxDrawCalls: 500, drawCost: (key) => costs[key] });
    assert.deepEqual(over.map((r) => r.key), ['0,0'], 'the walk stops, so nothing far takes a near one\'s place');
});

test('chunks changed only underground come after those that show', () => {
    const chosen = near.nearSelectChunks([row(0, 0, { columns: 0, raisedCount: 0 }), row(4, 0)], { x: 8, y: 22, z: 8 });
    assert.deepEqual(chosen.map((r) => r.key), ['4,0', '0,0']);
});

test('fades step and stop, and the mask wraps', () => {
    assert.equal(near.nearFadeStep(0, 1, near.NEAR_FADE_MS / 2), 0.5);
    assert.equal(near.nearFadeStep(0.9, 1, near.NEAR_FADE_MS), 1);
    assert.equal(near.nearFadeStep(0.1, 0, near.NEAR_FADE_MS), 0);
    assert.equal(near.nearMaskIndex(0, 0), 0);
    assert.equal(near.nearMaskIndex(1, 0), 4);
    assert.equal(near.nearMaskIndex(0, 1), 32 * 4);
    assert.equal(near.nearMaskIndex(-1, -1), (31 * 32 + 31) * 4);
    assert.equal(near.nearMaskIndex(32, 64), 0);
});

test('the mask goes in where a Lambert shader has its anchors, and reaches further than a chunk is kept', () => {
    const material = {};
    const uniforms = { nearMask: {}, nearCenter: {} };
    near.nearApplyMask(material, uniforms);
    const shader = {
        uniforms: {},
        vertexShader: '#include <common>\nvoid main() {\n#include <beginnormal_vertex>\n#include <begin_vertex>\n}',
        fragmentShader: '#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n}'
    };
    material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.nearMask, uniforms.nearMask);
    assert.match(shader.vertexShader, /objectNormal/);
    assert.ok(shader.vertexShader.indexOf('vNearColumn =') > shader.vertexShader.indexOf('<beginnormal_vertex>'));
    assert.match(shader.fragmentShader, /discard/);
    assert.equal(material.customProgramCacheKey(), 'viewer-near-mask');
    assert.ok(near.NEAR_KEEP_RADIUS / 16 + 2 < near.NEAR_MASK_REACH);
});

// ---------------------------------------------------------------- the manager

function fakeWorker() {
    return { posted: [], terminated: false, postMessage(message) { this.posted.push(message); }, terminate() { this.terminated = true; } };
}

function fakePart(groups = 2) {
    return {
        positions: new Float32Array(12), normals: new Float32Array(12), uvs: new Float32Array(8), colors: new Float32Array(12), light: new Float32Array(4), sky: new Float32Array(4),
        indices: new Uint16Array([0, 1, 2, 0, 2, 3]), groups: Array.from({ length: groups }, (_, materialIndex) => ({ start: 0, count: 3, materialIndex })),
        materials: Array.from({ length: groups }, () => ['stone', -1]), box: [0, 0, 0, 16, 16, 16], renderOrder: 0
    };
}

function setup({ rows = [row(0, 0)], engine = null } = {}) {
    const worker = fakeWorker();
    const built = { enabled: true, rows: new Map(rows.map((r) => [r.key, r])) };
    const scene = { children: [], add(o) { this.children.push(o); }, remove(o) { this.children = this.children.filter((c) => c !== o); } };
    const world = { getChunkMaterial: () => ({ name: 'stone' }), getChunkAtlasMaterial: () => ({ name: 'atlas' }), createLadderMesh: () => new Mesh(new BufferGeometry(), {}) };
    let engineLoads = 0;
    const blocks = new near.NearBlocks({
        scene, built,
        createWorker: () => { blocks.lastWorker = fakeWorker(); return blocks.lastWorker; },
        loadEngine: engine || (async () => { engineLoads++; return { world, sources: ['js/world.js'] }; })
    });
    return { blocks, built, scene, worker, world, loads: () => engineLoads };
}

const meshResult = (key, x, z, rev = 0, groups = 2) => ({ type: 'mesh', key, x, z, rev, parts: [fakePart(groups)], ladders: [], ms: 5 });
const flush = () => new Promise((resolve) => setTimeout(resolve, 1));
const close = { x: 8, y: 25, z: 8 };
const farAbove = { x: 8, y: 2000, z: 8 };

test('flying far above loads nothing', async () => {
    const { blocks, loads } = setup();
    for (let t = 0; t < 2000; t += 100) blocks.update(t, farAbove);
    await flush();
    assert.equal(loads(), 0);
    assert.equal(blocks.state, 'idle');
    assert.match(blocks.statusLine(), /nothing in range/);
});

test('nothing built loads nothing, wherever the camera is', async () => {
    const { blocks, loads } = setup({ rows: [] });
    blocks.update(1000, close);
    await flush();
    assert.equal(loads(), 0);
});

test('the block code loads once, when the first chunk comes in range', async () => {
    const { blocks, loads } = setup();
    blocks.update(1000, close);
    assert.equal(blocks.state, 'loading');
    assert.match(blocks.statusLine(), /loading/);
    blocks.update(1300, close);
    await flush();
    assert.equal(loads(), 1);
    assert.equal(blocks.state, 'ready');
    blocks.update(1600, close);
    const worker = blocks.lastWorker;
    assert.equal(worker.posted[0].type, 'init');
    const want = worker.posted.find((m) => m.type === 'want');
    assert.deepEqual(want.list, [{ key: '0,0', x: 0, z: 0, rev: 0 }]);
    assert.deepEqual(want.near, ['0,0']);
    // The same wish is not sent again.
    blocks.update(1900, close);
    assert.equal(worker.posted.filter((m) => m.type === 'want').length, 1);
});

async function withChunk(setupResult, key = '0,0', x = 0, z = 0) {
    const { blocks } = setupResult;
    blocks.update(1000, close);
    await flush();
    blocks.update(1300, close);
    blocks.lastWorker.onmessage({ data: meshResult(key, x, z) });
    blocks.update(1310, close);
    return blocks;
}

test('a mesh goes up one per frame, and its tile fades out', async () => {
    const context = setup({ rows: [row(0, 0), row(1, 0)] });
    const { blocks, scene } = context;
    blocks.update(1000, close);
    await flush();
    blocks.update(1300, close);
    blocks.lastWorker.onmessage({ data: meshResult('0,0', 0, 0) });
    blocks.lastWorker.onmessage({ data: meshResult('1,0', 1, 0) });
    blocks.update(1310, close);
    assert.equal(blocks.active.size, 1);
    assert.equal(scene.children.length, 1);
    blocks.update(1320, close);
    assert.equal(blocks.active.size, 2);

    const before = blocks.maskData[near.nearMaskIndex(0, 0)];
    blocks.update(1320 + near.NEAR_FADE_MS / 2, close);
    const during = blocks.maskData[near.nearMaskIndex(0, 0)];
    assert.ok(during > before && during < 255, `mask ${before} -> ${during}`);
    for (let t = 1500; t < 2000; t += 50) blocks.update(t, close);
    assert.equal(blocks.maskData[near.nearMaskIndex(0, 0)], 255);
    assert.equal(blocks.uniforms.nearCenter.value.z, 1);
    assert.match(blocks.statusLine(), /<b>2<\/b> chunks · 4 draws/);
});

test('leaving the radius fades the tile back, then frees the geometry', async () => {
    const context = setup();
    const blocks = await withChunk(context);
    for (let t = 1400; t < 2000; t += 50) blocks.update(t, close);
    const disposedBefore = geometriesDisposed.count;

    const away = { x: 5000, y: 25, z: 5000 };
    blocks.update(2300, away);
    assert.equal(blocks.active.size, 1, 'still there while the tile returns');
    assert.equal(geometriesDisposed.count, disposedBefore);
    for (let t = 2350; t < 3000; t += 50) blocks.update(t, away);
    assert.equal(blocks.active.size, 0);
    assert.equal(context.scene.children.length, 0);
    assert.equal(geometriesDisposed.count, disposedBefore + 1);
    assert.equal(blocks.maskData[near.nearMaskIndex(0, 0)], 0);
    assert.equal(blocks.uniforms.nearCenter.value.z, 0);
    assert.ok(blocks.lastWorker.posted.some((m) => m.type === 'forget' && m.key === '0,0'), 'it can be meshed again');
});

test('coming back before the fade ends keeps the chunk', async () => {
    const blocks = await withChunk(setup());
    for (let t = 1400; t < 2000; t += 50) blocks.update(t, close);
    blocks.update(2300, { x: 5000, y: 25, z: 5000 });
    blocks.update(2350, { x: 5000, y: 25, z: 5000 });
    blocks.update(2600, close);
    assert.equal(blocks.active.size, 1);
    assert.equal(blocks.active.get('0,0').leaving, false);
});

test('going back and forth does not pile up memory', async () => {
    const context = setup();
    const blocks = await withChunk(context);
    let t = 2000;
    const away = { x: 5000, y: 25, z: 5000 };
    const disposedBefore = geometriesDisposed.count;
    for (let round = 0; round < 50; round++) {
        for (let i = 0; i < 20; i++, t += 50) blocks.update(t, away);
        assert.equal(blocks.active.size, 0);
        t += 300;
        blocks.update(t, close);
        blocks.lastWorker.onmessage({ data: meshResult('0,0', 0, 0) });
        t += 10;
        blocks.update(t, close);
        assert.equal(blocks.active.size, 1);
    }
    assert.equal(geometriesDisposed.count - disposedBefore, 50);
    assert.equal(context.scene.children.length, 1);
    assert.equal(blocks.finished.length, 0);
});

test('a result nobody wants any more is dropped and forgotten', async () => {
    const context = setup();
    const { blocks, scene } = context;
    blocks.update(1000, close);
    await flush();
    blocks.update(1300, close);
    blocks.update(1600, { x: 5000, y: 25, z: 5000 });
    blocks.lastWorker.onmessage({ data: meshResult('0,0', 0, 0) });
    blocks.update(1610, { x: 5000, y: 25, z: 5000 });
    assert.equal(blocks.active.size, 0);
    assert.equal(scene.children.length, 0);
    assert.ok(blocks.lastWorker.posted.some((m) => m.type === 'forget'));
});

test('a change meshes the chunk and its neighbours again, swapping the mesh with no fade', async () => {
    const context = setup({ rows: [row(0, 0)] });
    const blocks = await withChunk(context);
    for (let t = 1400; t < 2000; t += 50) blocks.update(t, close);
    const disposedBefore = geometriesDisposed.count;

    blocks.onChanged([row(0, 0)]);
    assert.deepEqual(blocks.lastWorker.posted.find((m) => m.type === 'invalidate').keys, ['0,0']);
    blocks.update(2300, close);
    const want = blocks.lastWorker.posted.filter((m) => m.type === 'want').pop();
    assert.deepEqual(want.list, [{ key: '0,0', x: 0, z: 0, rev: 1 }]);

    // An old result is not used, the new one replaces the old mesh.
    blocks.lastWorker.onmessage({ data: meshResult('0,0', 0, 0, 0) });
    blocks.update(2310, close);
    assert.equal(blocks.active.get('0,0').rev, 0);
    blocks.lastWorker.onmessage({ data: meshResult('0,0', 0, 0, 1) });
    blocks.update(2320, close);
    assert.equal(blocks.active.get('0,0').rev, 1);
    assert.equal(blocks.active.get('0,0').fade, 1);
    assert.equal(geometriesDisposed.count, disposedBefore + 1);
    assert.equal(context.scene.children.length, 1);
});

test('a mesh that would break the draw call budget stays out', async () => {
    const context = setup({ rows: [row(0, 0), row(1, 0)] });
    const { blocks, scene } = context;
    blocks.update(1000, close);
    await flush();
    blocks.update(1300, close);
    blocks.lastWorker.onmessage({ data: meshResult('0,0', 0, 0, 0, near.NEAR_MAX_DRAW_CALLS - 1) });
    blocks.update(1310, close);
    blocks.lastWorker.onmessage({ data: meshResult('1,0', 1, 0, 0, 5) });
    blocks.update(1320, close);
    assert.equal(blocks.active.size, 1);
    assert.equal(scene.children.length, 1);
    assert.ok(blocks.drawCalls() <= near.NEAR_MAX_DRAW_CALLS);
    // And the next selection knows.
    blocks.update(1600, close);
    assert.deepEqual([...blocks.wanted.keys()], ['0,0']);
});

test('the checkbox takes everything away, and brings it back', async () => {
    const context = setup();
    const blocks = await withChunk(context);
    const worker = blocks.lastWorker;
    blocks.setEnabled(false);
    assert.equal(worker.terminated, true);
    for (let t = 1400; t < 2500; t += 50) blocks.update(t, close);
    assert.equal(blocks.active.size, 0);
    assert.equal(context.scene.children.length, 0);
    assert.match(blocks.statusLine(), /off/);

    blocks.setEnabled(true);
    blocks.update(2600, close);
    assert.notEqual(blocks.lastWorker, worker, 'a new worker');
    assert.equal(blocks.lastWorker.posted[0].type, 'init');
    assert.ok(blocks.lastWorker.posted.some((m) => m.type === 'want'));
});

test('built blocks off means no near detail either', async () => {
    const context = setup();
    const blocks = await withChunk(context);
    context.built.enabled = false;
    blocks.onChanged([row(0, 0)]);
    for (let t = 1400; t < 2500; t += 50) blocks.update(t, close);
    assert.equal(blocks.active.size, 0);
    assert.equal(blocks.statusLine(), '');
});

test('block code that cannot load leaves the overlay, nothing thrown', async () => {
    const { blocks } = setup({ engine: async () => { throw new Error('offline'); } });
    blocks.update(1000, close);
    await flush();
    assert.equal(blocks.state, 'failed');
    assert.doesNotThrow(() => blocks.update(1300, close));
    assert.match(blocks.statusLine(), /unavailable/);
});

test('a worker that dies, or cannot start, leaves the overlay too', async () => {
    const first = setup();
    await withChunk(first);
    first.blocks.lastWorker.onerror({ message: 'boom' });
    assert.equal(first.blocks.state, 'failed');
    assert.doesNotThrow(() => first.blocks.update(3000, close));

    const second = setup();
    await withChunk(second);
    second.blocks.lastWorker.onmessage({ data: { type: 'failed', reason: 'no scripts' } });
    assert.equal(second.blocks.state, 'failed');
});

test('materials come from the world by the worker\'s tokens', () => {
    const { blocks } = setup();
    const side = { name: 'side' };
    const top = { name: 'top' };
    blocks.world = {
        getChunkMaterial: (type) => (type === 'grass' ? [side, side, top, side, side, side] : top),
        getChunkAtlasMaterial: () => 'atlas'
    };
    assert.equal(blocks.resolveMaterial(['grass', 2]), top);
    assert.equal(blocks.resolveMaterial(['grass', 0]), side);
    assert.equal(blocks.resolveMaterial(['stone', -1]), top);
    assert.equal(blocks.resolveMaterial(['bookshelf', 'atlas']), 'atlas');
});

// ---------------------------------------------------------------- the real scripts, in a worker

// A small build, with what the mesher sorts differently: cubes, a shape, a plant, glass, water.
function testBuild() {
    const blocks = {};
    for (let lx = 0; lx < 16; lx++) {
        for (let lz = 0; lz < 16; lz++) {
            blocks[`${lx},3,${lz}`] = 'stone';
            blocks[`${lx},4,${lz}`] = 'grass';
        }
    }
    blocks['2,5,2'] = 'stone_bricks';
    blocks['3,5,2'] = 'glass';
    blocks['4,5,2'] = 'red_stained_glass';
    blocks['5,5,2'] = 'water';
    blocks['6,5,2'] = 'tall_grass';
    blocks['7,5,2'] = 'torch';
    blocks['8,5,2'] = 'planks';
    blocks['9,5,2'] = 'ladder';
    blocks['10,5,2'] = 'sign';
    blocks['11,5,2'] = 'red_wool';
    return blocks;
}

test('the game\'s scripts run in a worker, with the same blocks as the page', () => {
    const { world } = loadWorker(() => { throw new Error('no fetch'); });
    const page = loadPageWorld();
    const inWorker = world();
    assert.deepEqual(Array.from(inWorker.registry.names), Array.from(page.world.registry.names));
    assert.ok(inWorker.registry.names.length > 1000);
});

test('the worker meshes a chunk with the groups and the faces of the game', async () => {
    const requests = [];
    const worker = loadWorker(chunksResponse((x, z) => (x === 5 && z === 5 ? testBuild() : {}), requests));
    worker.send({ type: 'want', list: [{ key: '5,5', x: 5, z: 5, rev: 3 }] });
    await settle(() => worker.posted.length > 0);
    const message = worker.posted[0];
    assert.equal(message.type, 'mesh');
    assert.equal(message.key, '5,5');
    assert.equal(message.rev, 3);
    assert.equal(requests.length, 1);
    assert.equal(new URL(requests[0], 'http://x').searchParams.get('c').split(',').length, 18, 'itself and 8 neighbours');

    // Build the same in a page's world, the way the game does.
    const { context, world } = loadPageWorld();
    const pageColumn = vm.runInContext('new ChunkColumn(5, 5)', context);
    const index = vm.runInContext('chunkIndex', context);
    for (const [key, name] of Object.entries(testBuild())) {
        const [lx, y, lz] = key.split(',').map(Number);
        pageColumn.blocks[index(lx, y, lz)] = world.registry.id(name);
    }
    world.columns.set(world.chunkKey(5, 5), pageColumn);
    const result = world.mesher.build(5, 5);
    const ChunkMesher = vm.runInContext('ChunkMesher', context);
    const pageSolid = ChunkMesher.toMesh(result.buckets);

    const solid = message.parts[0];
    assert.equal(solid.positions.length, pageSolid.geometry.attributes.position.array.length, 'same faces');
    assert.deepEqual(Array.from(solid.indices), Array.from(pageSolid.geometry.index.array));
    assert.deepEqual(Array.from(solid.positions), Array.from(pageSolid.geometry.attributes.position.array));
    assert.equal(solid.groups.length, pageSolid.geometry.groups.length, 'same draw calls');

    // Every token points to the material the page has for that group.
    const realMaterials = pageSolid.material;
    solid.materials.forEach(([type, face], i) => {
        const material = face === 'atlas' ? world.getChunkAtlasMaterial(type) : world.getChunkMaterial(type);
        const resolved = Array.isArray(material) ? material[Math.max(0, face)] : material;
        assert.equal(resolved, realMaterials[i], `group ${i}: ${type} ${face}`);
    });

    assert.equal(message.parts.length, 3, 'solid, water, glass');
    assert.equal(message.parts[2].renderOrder, 60);
    assert.deepEqual(JSON.parse(JSON.stringify(message.ladders)), [{ x: 9, y: 5, z: 2, facing: 'px' }], 'a ladder against the solid block next to it');
    for (const part of message.parts) {
        assert.ok(part.positions instanceof Object && part.positions.length > 0);
        assert.equal(part.box.length, 6);
    }
});

test('faces against a chunk shown too are hidden; against one that stays a tile they stay, closing any slit', async () => {
    const wall = { '15,5,8': 'stone' };
    const next = { '0,5,8': 'stone' };
    const meshWith = async (blocksOf, near) => {
        const worker = loadWorker(chunksResponse(blocksOf, []));
        worker.send({ type: 'want', list: [{ key: '0,0', x: 0, z: 0, rev: 0 }], near });
        await settle(() => worker.posted.length > 0);
        return worker.posted[0].parts[0].positions.length;
    };
    const alone = await meshWith((x, z) => (x === 0 && z === 0 ? wall : {}), ['0,0', '1,0']);
    const nextToShown = await meshWith((x, z) => (x === 0 && z === 0 ? wall : x === 1 && z === 0 ? next : {}), ['0,0', '1,0']);
    assert.equal(nextToShown, alone - 4 * 3, 'as in the game');
    const nextToTile = await meshWith((x, z) => (x === 0 && z === 0 ? wall : x === 1 && z === 0 ? next : {}), ['0,0']);
    assert.equal(nextToTile, alone, 'the face stays');
});

test('light from a torch in the next chunk still reaches, tile or not', async () => {
    const blocks = { '15,5,8': 'stone' };
    const torch = { '1,5,8': 'torch' };
    const worker = loadWorker(chunksResponse((x, z) => (x === 0 && z === 0 ? blocks : x === 1 && z === 0 ? torch : {}), []));
    worker.send({ type: 'want', list: [{ key: '0,0', x: 0, z: 0, rev: 0 }], near: ['0,0'] });
    await settle(() => worker.posted.length > 0);
    assert.ok(Math.max(...worker.posted[0].parts[0].light) > 0);
});

test('a chunk is meshed once, again when told, and the wish list decides what is next', async () => {
    const requests = [];
    const worker = loadWorker(chunksResponse(() => ({ '1,5,1': 'stone' }), requests));
    const job = (x, rev = 0) => ({ key: `${x},0`, x, z: 0, rev });
    worker.send({ type: 'want', list: [job(0), job(4)] });
    await settle(() => worker.posted.length === 2);
    assert.deepEqual(worker.posted.map((m) => m.key), ['0,0', '4,0']);

    worker.send({ type: 'want', list: [job(0), job(4)] });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(worker.posted.length, 2, 'already done');

    worker.send({ type: 'forget', key: '0,0' });
    worker.send({ type: 'want', list: [job(0)] });
    await settle(() => worker.posted.length === 3);
    assert.equal(worker.posted[2].key, '0,0');

    // A new version: its column is fetched anew; the neighbours in memory are not.
    const before = requests.length;
    worker.send({ type: 'invalidate', keys: ['0,0'] });
    worker.send({ type: 'want', list: [job(0, 1)] });
    await settle(() => worker.posted.length === 4);
    assert.equal(worker.posted[3].rev, 1);
    assert.equal(requests.length, before + 1);
    assert.equal(new URL(requests[before], 'http://x').searchParams.get('c'), '0,0');
});

test('columns kept in the worker stay under the cap', async () => {
    const worker = loadWorker(chunksResponse(() => ({ '1,5,1': 'stone' }), []));
    const list = [];
    for (let x = 0; x < 40; x++) list.push({ key: `${x * 3},0`, x: x * 3, z: 0, rev: 0 });
    worker.send({ type: 'want', list });
    await settle(() => worker.posted.length === 40);
    assert.ok(worker.world().columns.size <= vm.runInContext('NEAR_COLUMN_CAP', worker.context));
});

test('a failed fetch tries again later and the worker keeps working', async () => {
    let fail = true;
    const good = chunksResponse(() => ({ '1,5,1': 'stone' }), []);
    const worker = loadWorker((url) => {
        if (fail) return { ok: false, status: 503 };
        return good(url);
    });
    worker.send({ type: 'want', list: [{ key: '0,0', x: 0, z: 0, rev: 0 }] });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(worker.posted.length, 0);
    fail = false;
    worker.send({ type: 'want', list: [{ key: '4,0', x: 4, z: 0, rev: 0 }] });
    await settle(() => worker.posted.length === 1);
    assert.equal(worker.posted[0].key, '4,0');
});

// ---------------------------------------------------------------- the same page

test('the viewer\'s scripts and the game\'s can live on one page', () => {
    const { context } = loadPageWorldWithViewer();
    assert.equal(vm.runInContext('typeof WorldRenderer + typeof TerrainViewer + typeof NearBlocks + typeof columnSurface', context), 'functionfunctionfunctionfunction');
    // Nothing of the game's replaced what the viewer uses.
    assert.equal(vm.runInContext('hash2(5, 7, 11)', context), hash2FromTerrainGen());
});

function hash2FromTerrainGen() {
    const context = vm.createContext({ Math });
    vm.runInContext(fs.readFileSync(path.join(STATIC, 'js', 'terrainGen.js'), 'utf8'), context);
    return vm.runInContext('hash2(5, 7, 11)', context);
}

function loadPageWorldWithViewer() {
    const context = vm.createContext(globalsForScripts({
        requestAnimationFrame: () => 0, Worker: class { postMessage() {} terminate() {} }, localStorage: { getItem: () => null, setItem() {} },
        ImageData: class {}, addEventListener() {}, document: { createElement: () => anyStub(), addEventListener() {}, body: anyStub(), head: anyStub(), getElementById: () => null, querySelector: () => null }
    }));
    context.window = context;
    const html = fs.readFileSync(path.join(STATIC, 'viewer.html'), 'utf8');
    const own = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]).filter((src) => !/^(https?:)?\/\//.test(src));
    assert.ok(own.includes('js/viewer/nearBlocks.js') && own.includes('js/terrainGen.js'));
    for (const src of own) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    vm.runInContext('window.Game = class Game {};', context);
    const game = near.nearGameScripts(fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8'));
    // These throw on any name declared twice.
    for (const src of game) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    return { context };
}

test('the page loads the near code only as a small file', () => {
    const html = fs.readFileSync(path.join(STATIC, 'viewer.html'), 'utf8');
    for (const heavy of ['world.js', 'chunkMesher.js', 'blockShapes.js', 'chunkStore.js', 'js/game/']) assert.ok(!html.includes(heavy), `${heavy} on the page from the start`);
    assert.match(html, /id="near"/);
    assert.match(html, /id="built"/);
});
