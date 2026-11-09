// Node tests for curtains (js/game/decor.js, opened by joineryToggle in js/game/joinery.js): a click
// draws the whole vertical strip, up to 10, in one message; gaps and other facings end the strip.
// Run with: node --test test/js/curtains.test.js
//
// Every script of index.html runs in one VM context with small stand-ins for the browser, so the
// real WorldRenderer, block states and toggle run.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const print = require(path.join(STATIC, 'js', 'guidePrint.js'));

function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}
function canvasStub() {
    const ctx = new Proxy({}, {
        get: (target, key) => (key in target ? target[key] : () => ({ data: new Uint8ClampedArray(4 * 4096), addColorStop() {} })),
        set: (target, key, value) => { target[key] = value; return true; }
    });
    return { width: 16, height: 16, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,' };
}

function loadGame() {
    const THREE = new Proxy({ Vector3: class {}, Vector2: class {} }, { get: (known, key) => (key in known ? known[key] : anyStub()) });
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
    vm.runInContext('Object.assign(this, { WorldRenderer, ChunkColumn, BLOCK_SHAPES, Game, CURTAIN_STRIP_LIMIT, curtainStripCells });', context);
    return context;
}

const ctx = loadGame();
const plain = (value) => JSON.parse(JSON.stringify(value));

function makeWorld() {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    for (const [cx, cz] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) world.columns.set(world.chunkKey(cx, cz), new ctx.ChunkColumn(cx, cz));
    world.addBlock = (block) => { world.setEditedBlock(block.x, block.y, block.z, block.blockType); return true; };
    return world;
}

function makeGame(world) {
    const sent = [];
    const game = Object.create(ctx.Game.prototype);
    Object.assign(game, {
        world,
        network: { connected: true, send: (type, payload) => sent.push([type, plain(payload)]) },
        getInteractionRay: () => ({ direction: { x: 0, y: 0, z: -1 } }),
        playNoiseBurst() {}, playTone() {}, receiveSystemMessage() {}
    });
    return { game, sent };
}

const curtain = (world, color, facing, drawn, side) => {
    const state = { facing, drawn };
    if (side) state.side = side;
    return world.getShapeStateType(`${color}_curtain`, state);
};
const hang = (world, ys, color = 'red', facing = 's', drawn = 'closed', x = 3, z = 4) => {
    for (const y of ys) world.setEditedBlock(x, y, z, curtain(world, color, facing, drawn));
};
const drawnAt = (world, y, x = 3, z = 4) => {
    const def = world.blockTypes[world.getBlockTypeAt(x, y, z)];
    return def && def.shape === 'curtain' ? def.state.drawn : null;
};
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

test('a lone curtain opens by itself, with the plain blockPlace as before', () => {
    const world = makeWorld();
    hang(world, [5]);
    const { game, sent } = makeGame(world);
    assert.equal(game.joineryToggle({ x: 3, y: 5, z: 4 }), true);
    assert.equal(drawnAt(world, 5), 'open');
    assert.deepEqual(sent, [['blockPlace', { x: 3, y: 5, z: 4, blockType: 'red_curtain:s:open' }]]);
});

test('a strip of 3 opens together from the middle, in one curtainStrip message', () => {
    const world = makeWorld();
    hang(world, [4, 5, 6]);
    const { game, sent } = makeGame(world);
    game.joineryToggle({ x: 3, y: 5, z: 4 });
    assert.deepEqual([4, 5, 6].map((y) => drawnAt(world, y)), ['open', 'open', 'open']);
    assert.equal(sent.length, 1);
    assert.equal(sent[0][0], 'curtainStrip');
    assert.deepEqual(sent[0][1].blocks.map((b) => b.y).sort(), [4, 5, 6]);
    // And closes together again, from the top one.
    game.joineryToggle({ x: 3, y: 6, z: 4 });
    assert.deepEqual([4, 5, 6].map((y) => drawnAt(world, y)), ['closed', 'closed', 'closed']);
});

test('all end where the clicked one goes, whatever each was before; colours stay', () => {
    const world = makeWorld();
    hang(world, [1], 'blue');
    hang(world, [2], 'red', 's', 'open');
    hang(world, [3], 'yellow');
    const { game } = makeGame(world);
    game.joineryToggle({ x: 3, y: 1, z: 4 });
    assert.deepEqual([1, 2, 3].map((y) => world.getBlockTypeAt(3, y, 4)), ['blue_curtain:s:open', 'red_curtain:s:open', 'yellow_curtain:s:open']);
    game.joineryToggle({ x: 3, y: 2, z: 4 });
    assert.deepEqual([1, 2, 3].map((y) => drawnAt(world, y)), ['closed', 'closed', 'closed']);
});

test('a strip of 10 moves whole; of 12 only the 10 nearest the click', () => {
    assert.equal(ctx.CURTAIN_STRIP_LIMIT, 10);
    const ten = makeWorld();
    hang(ten, range(1, 10));
    const a = makeGame(ten);
    a.game.joineryToggle({ x: 3, y: 1, z: 4 });
    assert.deepEqual(range(1, 10).map((y) => drawnAt(ten, y)), Array(10).fill('open'));
    assert.equal(a.sent[0][1].blocks.length, 10);

    // From the bottom of 12: the two at the top stay.
    const twelve = makeWorld();
    hang(twelve, range(1, 12));
    const b = makeGame(twelve);
    b.game.joineryToggle({ x: 3, y: 1, z: 4 });
    assert.deepEqual(range(1, 12).map((y) => drawnAt(twelve, y)), [...Array(10).fill('open'), 'closed', 'closed']);
    assert.equal(b.sent.length, 1);
    assert.equal(b.sent[0][1].blocks.length, 10);

    // From the 4th of 12: 3 below, itself, 6 above; the top two stay.
    const middle = makeWorld();
    hang(middle, range(1, 12));
    makeGame(middle).game.joineryToggle({ x: 3, y: 4, z: 4 });
    assert.deepEqual(range(1, 12).map((y) => drawnAt(middle, y)), [...Array(10).fill('open'), 'closed', 'closed']);
    // From the 6th, alternating up and down, nearest first: 2 to 11, one left at each end.
    const sixth = makeWorld();
    hang(sixth, range(1, 12));
    makeGame(sixth).game.joineryToggle({ x: 3, y: 6, z: 4 });
    assert.deepEqual(range(1, 12).map((y) => drawnAt(sixth, y)), ['closed', ...Array(10).fill('open'), 'closed']);
    // From the 7th: 3 to 12.
    const seventh = makeWorld();
    hang(seventh, range(1, 12));
    makeGame(seventh).game.joineryToggle({ x: 3, y: 7, z: 4 });
    assert.deepEqual(range(1, 12).map((y) => drawnAt(seventh, y)), ['closed', 'closed', ...Array(10).fill('open')]);
});

test('a gap stops the strip, and so does any other block', () => {
    const world = makeWorld();
    hang(world, [1, 2, 4, 5]);
    world.setEditedBlock(3, 6, 4, 'stone');
    hang(world, [7]);
    const { game } = makeGame(world);
    game.joineryToggle({ x: 3, y: 2, z: 4 });
    assert.deepEqual([1, 2, 4, 5, 7].map((y) => drawnAt(world, y)), ['open', 'open', 'closed', 'closed', 'closed']);
    game.joineryToggle({ x: 3, y: 4, z: 4 });
    assert.deepEqual([1, 2, 4, 5, 7].map((y) => drawnAt(world, y)), ['open', 'open', 'open', 'open', 'closed']);
});

test('curtains that face another way do not join, nor do the ones beside', () => {
    const world = makeWorld();
    hang(world, [1, 2], 'red', 's');
    hang(world, [3], 'red', 'e');
    hang(world, [4], 'red', 's');
    hang(world, [1, 2], 'red', 's', 'closed', 4, 4);
    const { game } = makeGame(world);
    game.joineryToggle({ x: 3, y: 1, z: 4 });
    assert.deepEqual([1, 2, 3, 4].map((y) => drawnAt(world, y)), ['open', 'open', 'closed', 'closed']);
    assert.deepEqual([1, 2].map((y) => drawnAt(world, y, 4, 4)), ['closed', 'closed']);
});

test('what the server says of a strip is applied, air included', () => {
    const world = makeWorld();
    hang(world, [1, 2]);
    const { game } = makeGame(world);
    world.removeBlockAt = (x, y, z) => world.setEditedBlock(x, y, z, null);
    game.curtainApplyStrip({ blocks: [{ x: 3, y: 1, z: 4, blockType: 'red_curtain:s:open' }, { x: 3, y: 2, z: 4, blockType: '' }] });
    assert.equal(drawnAt(world, 1), 'open');
    assert.equal(world.getBlockTypeAt(3, 2, 4), null);
});

test('every player hears the strip: the game listens to curtainStrip', () => {
    const source = fs.readFileSync(path.join(STATIC, 'js', 'game.js'), 'utf8');
    assert.ok(source.includes("network.on('curtainStrip'"));
});
