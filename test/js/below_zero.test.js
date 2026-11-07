// Node tests for height 0, which is nothing special: the rock goes on below it down to bedrock, and the world down to
// WORLD_MIN_Y. The real placeBlock, bucket, mesher and light field run here, on stand-ins for the browser.
// Run with: node --test test/js/below_zero.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const print = require(path.join(STATIC, 'js', 'guidePrint.js'));

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
}
function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}
function canvasStub() {
    const ctx = new Proxy({}, {
        get: (target, key) => (key in target ? target[key] : () => ({ data: new Uint8ClampedArray(4 * 4096 * 16), addColorStop() {} })),
        set: (target, key, value) => { target[key] = value; return true; }
    });
    return { width: 16, height: 16, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,' };
}
function loadGame() {
    const THREE = new Proxy({ Vector3, Vector2: Vector3, Vector4: Vector3 }, { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const context = vm.createContext({
        console: { ...console, warn() {} }, performance: { now: () => 0 }, THREE, navigator: {}, requestAnimationFrame: () => 0,
        Worker: class { postMessage() {} terminate() {} },
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; } },
        document: { createElement: (tag) => (tag === 'canvas' ? canvasStub() : anyStub()), addEventListener() {}, body: anyStub(), head: anyStub(), getElementById: () => null, querySelector: () => null },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
    });
    context.window = context;
    vm.runInContext('class Game {}', context);
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1])
        .filter((src) => !/^(https?:)?\/\//.test(src) && !print.SKIP_SCRIPTS.test(src));
    for (const src of scripts) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    vm.runInContext('Object.assign(this, { WorldRenderer, ChunkColumn, LightField, Game, ITEM_USE_HANDLERS, WORLD_MIN_Y, WORLD_MAX_Y });', context);
    return context;
}
const ctx = loadGame();
const UP = { x: 0, y: 1, z: 0 };
const DOWN = { x: 0, y: -1, z: 0 };
const EAST = { x: 1, y: 0, z: 0 };

// Bedrock at y = -5 and rock up to y = 0, with a shaft dug at (8, 8) down to the bedrock.
function makeWorld() {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    const stone = world.registry.id('stone');
    const bedrock = world.registry.id('bedrock');
    for (const [cx, cz] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
        const column = new ctx.ChunkColumn(cx, cz);
        for (let lx = 0; lx < 16; lx++) {
            for (let lz = 0; lz < 16; lz++) {
                column.set(lx, -5, lz, bedrock);
                for (let y = -4; y <= 0; y++) column.set(lx, y, lz, stone);
            }
        }
        world.columns.set(world.chunkKey(cx, cz), column);
    }
    const shaft = world.columns.get(world.chunkKey(0, 0));
    for (let y = -4; y <= 0; y++) shaft.set(8, y, 8, 0);
    return world;
}

// A player with three of `item`, aiming at the cell `target`.
function makeGame(world, item, target, normal) {
    const sent = [];
    const counts = { [item]: 3 };
    const camera = { position: new Vector3(40, 10, 40), rotation: {} };
    const game = new ctx.Game();
    Object.assign(game, {
        world,
        cameraController: { eyeHeight: 1.62, yaw: 0, pitch: 0, intersectsBoxes: () => false, intersectsBody: () => false, isCrouching: false, camera },
        network: { connected: true, send: (type, payload) => sent.push({ type, payload }) },
        placeDistance: 6,
        hitIndicator: { style: {} },
        tryUseItemOnMob: () => false, tryMountMob: () => false,
        raycastBlock: () => ({ object: { userData: { blockPosition: target } }, faceIndex: 0, point: new Vector3(target.x + 0.5, target.y + 0.5, target.z + 0.5), face: { normal } }),
        getSelectedHeldItemType: () => item, getSelectedBlockType: () => item,
        getInventoryCount: (type) => counts[type] || 0,
        consumeSelectedBlock() { counts[item]--; },
        getItemDefinition: () => null,
        getInteractionRay: () => ({ origin: camera.position, reachOrigin: camera.position, direction: { x: 0, y: -0.5, z: -1 } }),
        getLocalPlayerPosition: () => camera.position,
        getLadderFacingFromNormal: () => 'px',
        playPlaceSound() {}, showHitIndicator() {}, saveRespawnPoint() {}, receiveSystemMessage() {},
        promptSignText: () => 'Hola'
    });
    return { game, sent, counts };
}
function place(world, item, target, normal) {
    const saved = ctx.ITEM_USE_HANDLERS.splice(0);
    try {
        const made = makeGame(world, item, target, normal);
        made.game.placeBlock();
        return made;
    } finally {
        ctx.ITEM_USE_HANDLERS.push(...saved);
    }
}

// As generated today: bedrock at y = -14, stone up to y = 0, and a shaft at (8, 8) to the bedrock.
function makeDeepWorld() {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    const stone = world.registry.id('stone');
    const bedrock = world.registry.id('bedrock');
    for (const [cx, cz] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
        const column = new ctx.ChunkColumn(cx, cz);
        for (let lx = 0; lx < 16; lx++) {
            for (let lz = 0; lz < 16; lz++) {
                column.set(lx, -14, lz, bedrock);
                for (let y = -13; y <= 0; y++) column.set(lx, y, lz, stone);
            }
        }
        world.columns.set(world.chunkKey(cx, cz), column);
    }
    const shaft = world.columns.get(world.chunkKey(0, 0));
    for (let y = -13; y <= 0; y++) shaft.set(8, y, 8, 0);
    return world;
}

test('a block goes on bedrock at the bottom of the deep rock, and against its walls', () => {
    const world = makeDeepWorld();
    const { sent } = place(world, 'cobblestone', { x: 8, y: -14, z: 8 }, UP);
    assert.equal(world.getBlockTypeAt(8, -13, 8), 'cobblestone');
    assert.equal(sent[0].payload.y, -13);
    for (const y of [-12, -9, -6]) {
        const wall = makeDeepWorld();
        const made = place(wall, 'cobblestone', { x: 7, y, z: 8 }, EAST);
        assert.equal(wall.getBlockTypeAt(8, y, 8), 'cobblestone', `y=${y}`);
        assert.equal(made.sent[0].payload.y, y);
    }
});

test('bedrock at y = -14 breaks for nobody, and a block does not take its place', () => {
    const world = makeDeepWorld();
    assert.equal(world.getBreakDurationForType(world.getBlockTypeAt(3, -14, 3)), null);
    const { sent } = place(world, 'cobblestone', { x: 8, y: -13, z: 8 }, DOWN);
    assert.equal(world.getBlockTypeAt(8, -14, 8), 'bedrock');
    assert.equal(sent.length, 0);
});

test('a drop lands on what is under it at any depth, not at the old floor', () => {
    const landing = (world, y) => {
        const game = new ctx.Game();
        game.world = world;
        return game.getDropLandingY(8.5, 8.5, y);
    };
    const shaft = makeDeepWorld();
    assert.equal(landing(shaft, 0), -13, 'all the way down the shaft');
    assert.equal(landing(shaft, -7), -13, 'mined below the old floor: it used to come back up to y = -4');
    assert.equal(landing(shaft, -13), -13);
    shaft.addBlock({ x: 8, y: -9, z: 8, blockType: 'cobblestone' });
    assert.equal(landing(shaft, -3), -8, 'on the first thing in its way');
    assert.equal(landing(shaft, -10), -13, 'and from under it, on what is below');

    // In a column with no floor at all, it stays inside the world.
    const empty = makeDeepWorld();
    for (let y = -14; y <= 0; y++) empty.columns.get(empty.chunkKey(0, 0)).set(8, y, 8, 0);
    assert.equal(landing(empty, 0), ctx.WORLD_MIN_Y);
});

test('a saved chunk with the old floor next to a new one meshes, walled where the rock ends', () => {
    const world = makeDeepWorld();
    const stone = world.registry.id('stone');
    const bedrock = world.registry.id('bedrock');
    // Chunk (-1, 0) was saved when bedrock lay at y = -5: nothing under it.
    const old = world.columns.get(world.chunkKey(-1, 0));
    for (let lx = 0; lx < 16; lx++) {
        for (let lz = 0; lz < 16; lz++) {
            for (let y = ctx.WORLD_MIN_Y; y < -5; y++) old.set(lx, y, lz, 0);
            old.set(lx, -5, lz, bedrock);
            old.set(lx, -4, lz, (lx + lz) % 2 ? bedrock : stone);
        }
    }
    const westFacesAt = (y) => {
        let count = 0;
        for (const bucket of world.mesher.build(0, 0).buckets) {
            for (let t = 0; t < bucket.indices.length / 3; t++) {
                if (bucket.blocks[t * 3] !== 0 || bucket.blocks[t * 3 + 1] !== y) continue;
                if (bucket.normals[bucket.indices[t * 3] * 3] === -1) count++;
            }
        }
        return count;
    };
    assert.doesNotThrow(() => { world.mesher.build(0, 0); world.mesher.build(-1, 0); });
    assert.ok(westFacesAt(-9) > 0, 'the new rock shows a wall to the empty space under the old floor');
    assert.equal(westFacesAt(-3), 0, 'above the old floor the two sides meet as ever');
    assert.equal(world.getBlockTypeAt(-1, -5, 0), 'bedrock');
    assert.equal(world.getBlockTypeAt(-1, -6, 0), null, 'the old chunk is left as it was saved');
});

test('a block goes on the bottom of a hole, on top of bedrock, under height 0', () => {
    const world = makeWorld();
    const { sent, counts } = place(world, 'cobblestone', { x: 8, y: -5, z: 8 }, UP);
    assert.equal(world.getBlockTypeAt(8, -4, 8), 'cobblestone');
    assert.equal(counts.cobblestone, 2);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, 'blockPlace');
    assert.equal(sent[0].payload.y, -4, 'the server is told the real height');
});

test('a block goes against the wall of a hole at every height under 0, and at 0 as ever', () => {
    for (const y of [-4, -3, -2, -1, 0]) {
        const world = makeWorld();
        const { sent } = place(world, 'cobblestone', { x: 7, y, z: 8 }, EAST);
        assert.equal(world.getBlockTypeAt(8, y, 8), 'cobblestone', `y=${y}`);
        assert.equal(sent.length, 1, `y=${y}`);
    }
});

test('what has its own rules goes under 0 too: doors, ladders, seats, signs', () => {
    const door = makeWorld();
    const doorMade = place(door, 'oak_door', { x: 8, y: -5, z: 8 }, UP);
    assert.match(door.getBlockTypeAt(8, -4, 8), /^oak_door/);
    assert.match(door.getBlockTypeAt(8, -3, 8), /^oak_door/, 'both halves');
    assert.equal(doorMade.sent.length, 2);

    const ladder = makeWorld();
    const ladderMade = place(ladder, 'ladder', { x: 7, y: -3, z: 8 }, EAST);
    assert.equal(ladder.getBlockTypeAt(8, -3, 8), 'ladder');
    assert.equal(ladderMade.sent[0].payload.y, -3);

    const chair = makeWorld();
    place(chair, 'oak_chair', { x: 8, y: -5, z: 8 }, UP);
    assert.match(chair.getBlockTypeAt(8, -4, 8), /^oak_chair/);

    const sign = makeWorld();
    const signMade = place(sign, 'sign', { x: 8, y: -5, z: 8 }, UP);
    assert.match(sign.getBlockTypeAt(8, -4, 8), /^sign/);
    assert.equal(signMade.sent[0].payload.text, 'Hola');
});

test('a block does not go outside the world, at either end', () => {
    const bottom = makeWorld();
    const under = place(bottom, 'cobblestone', { x: 3, y: ctx.WORLD_MIN_Y, z: 3 }, DOWN);
    assert.equal(under.sent.length, 0, 'not below the last layer');
    assert.equal(under.counts.cobblestone, 3, 'and it costs nothing');

    const top = makeWorld();
    const over = place(top, 'cobblestone', { x: 3, y: ctx.WORLD_MAX_Y, z: 3 }, UP);
    assert.equal(over.sent.length, 0, 'not above the last layer');

    // The last layer itself is in the world.
    const last = makeWorld();
    const inside = place(last, 'cobblestone', { x: 3, y: ctx.WORLD_MIN_Y + 1, z: 3 }, DOWN);
    assert.equal(last.getBlockTypeAt(3, ctx.WORLD_MIN_Y, 3), 'cobblestone');
    assert.equal(inside.sent.length, 1);
});

test('bedrock breaks for nobody, and a block does not take its place', () => {
    const world = makeWorld();
    assert.equal(world.getBreakDurationForType('bedrock'), null);
    const { sent } = place(world, 'cobblestone', { x: 3, y: -4, z: 3 }, DOWN);
    assert.equal(world.getBlockTypeAt(3, -5, 3), 'bedrock');
    assert.equal(sent.length, 0);
});

test('a bucket pours under height 0, and not below the world', () => {
    const pour = (world, target, normal) => {
        const { game, sent } = makeGame(world, 'water_bucket', target, normal);
        const swaps = [];
        game.bucketSwap = (from, to) => swaps.push([from, to]);
        game.bucketAfterUse = () => {};
        game.bucketPour({ object: { userData: { blockPosition: target } }, faceIndex: 0, point: new Vector3(), face: { normal } });
        return { sent, swaps };
    };
    const world = makeWorld();
    const poured = pour(world, { x: 8, y: -5, z: 8 }, UP);
    assert.equal(world.getBlockTypeAt(8, -4, 8), 'water');
    assert.equal(poured.sent[0].payload.y, -4);
    assert.equal(poured.swaps.length, 1, 'the bucket is empty now');

    const below = pour(makeWorld(), { x: 3, y: ctx.WORLD_MIN_Y, z: 3 }, DOWN);
    assert.equal(below.sent.length, 0);
    assert.equal(below.swaps.length, 0, 'the water stays in the bucket');
});

test('a block under 0 is drawn, can be aimed at, and takes the dark of the rock and the light of a torch', () => {
    const world = makeWorld();
    world.addBlock({ x: 8, y: -3, z: 8, blockType: 'cobblestone' });
    const faces = (y) => {
        const seen = new Map();
        for (const bucket of world.mesher.build(0, 0).buckets) {
            for (let t = 0; t < bucket.indices.length / 3; t++) {
                if (bucket.blocks[t * 3] !== 8 || bucket.blocks[t * 3 + 1] !== y || bucket.blocks[t * 3 + 2] !== 8) continue;
                const a = bucket.indices[t * 3];
                const vertex = [bucket.positions[a * 3 + 1], bucket.normals[a * 3 + 1], bucket.sky[a], bucket.light[a]];
                seen.set(vertex[1], vertex);
            }
        }
        return seen;
    };
    // Rock on all four sides, air above and below: the mesher makes those two faces, at the real height.
    const dark = faces(-3);
    assert.deepEqual([...dark.keys()].sort(), [-1, 1]);
    for (const [, [y]] of dark) assert.ok(y === -3 || y === -2, `drawn at y=${y}`);
    assert.equal(dark.get(1)[2], 1, 'the shaft is open: its floor sees the sky');
    assert.equal(dark.get(1)[3], 0, 'no torch yet');

    // Roofed over, with rock all around, it fades with the depth under the roof.
    world.addBlock({ x: 8, y: 0, z: 8, blockType: 'stone' });
    assert.ok(faces(-3).get(1)[2] < 1);

    world.addBlock({ x: 8, y: -1, z: 8, blockType: 'torch' });
    const field = new ctx.LightField(world, 0, 0);
    assert.equal(field.get(8, -1, 8), world.registry.lightLevel[world.registry.id('torch')]);
    assert.ok(field.get(8, -2, 8) > 0, 'torchlight goes down the shaft');
    assert.ok(faces(-3).get(1)[3] > 0, 'and reaches the face below it');
});

test('a torch at the very bottom of the world lights without leaving its array', () => {
    const world = makeWorld();
    world.addBlock({ x: 3, y: ctx.WORLD_MIN_Y, z: 3, blockType: 'torch' });
    const field = new ctx.LightField(world, 0, 0);
    assert.ok(field.get(3, ctx.WORLD_MIN_Y, 3) > 0);
    assert.equal(field.get(3, ctx.WORLD_MIN_Y - 1, 3), 0);
    assert.doesNotThrow(() => world.mesher.build(0, 0));
});
