// Node tests for what a chunk that is not loaded does to things that check the blocks around them. getBlockId reads
// air there, so "the ground is gone" must only be concluded from a loaded chunk. The real ants.js, rabbit.js,
// beaver.js, mobs.js, camera.js and world.js run here; only drawing, sound and the worker that decodes chunks are
// simulated: `deliver` does what the chunk worker's reply does in world.js.
// Run with: node --test test/js/unloaded_chunks.test.js
// With REPRO=1 in the environment it also tells what happens at each step.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const print = require(path.join(STATIC, 'js', 'guidePrint.js'));
const log = (...args) => { if (process.env.REPRO) console.log(...args); };

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setY(y) { this.y = y; return this; }
    setScalar(s) { return this.set(s, s, s); }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    length() { return Math.hypot(this.x, this.y, this.z); }
    normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
    applyAxisAngle() { return this; }
    lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
    lerpVectors(a, b, t) { return this.copy(a).lerp(b, t); }
}
class Object3D {
    constructor() {
        this.position = new Vector3(); this.scale = new Vector3(1, 1, 1); this.rotation = new Vector3();
        this.userData = {}; this.children = []; this.visible = true; this.parent = null;
    }
    add(child) { this.children.push(child); child.parent = this; }
    remove(child) { this.children = this.children.filter((other) => other !== child); child.parent = null; }
    traverse(fn) { fn(this); this.children.forEach((child) => { if (child.traverse) child.traverse(fn); }); }
}
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

const storage = new Map();
function loadGame() {
    const THREE = new Proxy({ Vector3, Vector2: Vector3, Vector4: Vector3, Object3D, Group: Object3D, Mesh: class extends Object3D {} },
        { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const context = vm.createContext({
        console: { ...console, warn() {} }, performance: { now: () => 0 }, THREE, navigator: {}, requestAnimationFrame: () => 0,
        Worker: class { postMessage() {} terminate() {} }, setTimeout() {},
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; } },
        document: { createElement: (tag) => (tag === 'canvas' ? canvasStub() : anyStub()), addEventListener() {}, body: anyStub(), head: anyStub(), getElementById: () => null, querySelector: () => null },
        addEventListener() {},
        localStorage: {
            getItem: (key) => storage.get(key) ?? null,
            setItem: (key, value) => { storage.set(key, value); },
            removeItem: (key) => storage.delete(key)
        }
    });
    context.window = context;
    vm.runInContext('class Game {}', context);
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1])
        .filter((src) => !/^(https?:)?\/\//.test(src) && !print.SKIP_SCRIPTS.test(src));
    for (const src of scripts) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    vm.runInContext('Object.assign(this, { WorldRenderer, ChunkColumn, Game, CameraController, BEAVER_STORAGE_KEY });', context);
    return context;
}
const ctx = loadGame();

const EYE = 1.62;

// A flat world: grass with its top at y = 0. Chunks only come through `update` and `deliver`, as in the game.
function makeGame({ renderDistance = 4 } = {}) {
    const scene = new Object3D();
    const world = new ctx.WorldRenderer(scene);
    world.renderDistance = renderDistance;
    world.rebuildChunk = () => {};
    const grass = world.registry.id('grass');
    const requested = [];
    const removedByServer = new Set();
    const serverBlocks = new Map();
    world.setChunkSource({ connected: () => true, request: (chunks) => requested.push(...chunks), focus() {} });

    const camera = { position: new Vector3(0.5, EYE + 0.01, 0.5), rotation: {} };
    const cameraController = new ctx.CameraController(camera, { addEventListener() {} });
    cameraController.setGameplayCheck(() => true);
    cameraController.isLocked = true;
    cameraController.setBlockChecker((x, y, z) => world.hasSolidBlock(x, y, z));
    cameraController.setBlockTypeGetter((x, y, z) => world.getBlockTypeAt(x, y, z));
    cameraController.setBlockHeightGetter((x, y, z) => world.getCollisionHeight(x, y, z));
    cameraController.setCollisionBoxGetter((x, y, z) => world.getCollisionBoxes(x, y, z));
    cameraController.setColumnChecker((x, z) => world.getColumnAt(x, z));

    const messages = [];
    const game = new ctx.Game();
    Object.assign(game, {
        world, scene, camera, cameraController, ambientMobs: [], mobSpawnedChunks: new Set(), mobSpawnTimer: 0,
        titleScreenOpen: false, respawnPending: false, weatherState: 'clear', timeOfDay: 0.3, otherPlayerMeshes: new Map(),
        network: { connected: true, send() {} },
        getLocalPlayerPosition: () => camera.position,
        attachMobModel: () => ({ height: 1 }),
        buildRabbitBurrowModel(burrow) { burrow.object = new Object3D(); scene.add(burrow.object); },
        disposeRabbitBurrowModel(burrow) { scene.remove(burrow.object); burrow.object = null; },
        isNightTime: () => false, playTone() {}, playNoiseBurst() {}, playPlaceSound() {},
        maxHealth: 20, health: 20, wasOnGroundForDamage: false, lastSafePosition: null, lastSafePositionSaveTimer: 0,
        hitIndicator: { style: {} }, showHitIndicator() {}, stopMining() {}, resetMiningBlockVisual() {}, closeChatInput() {}, closeSignReader() {},
        renderer: { domElement: {} }, getInventoryCount: () => 0, getSelectedHeldItemType: () => null,
        antsRender() {}, antsRenderTrails() {}, antsFarmRender() {},
        receiveSystemMessage: ({ text }) => messages.push(text),
        // Natural spawning decides the chunks; of what a chunk spawns, only this test's species.
        spawnMobsForChunk(chunkX, chunkZ) { this.antsSpawnForChunk(chunkX, chunkZ, 'plains'); }
    });

    function columnFor(chunkX, chunkZ) {
        const column = new ctx.ChunkColumn(chunkX, chunkZ);
        for (let lx = 0; lx < 16; lx++) {
            for (let lz = 0; lz < 16; lz++) {
                for (let y = -16; y <= -1; y++) {
                    if (!removedByServer.has(`${chunkX * 16 + lx},${y},${chunkZ * 16 + lz}`)) column.set(lx, y, lz, grass);
                }
            }
        }
        for (const [cell, type] of serverBlocks) {
            const [x, y, z] = cell.split(',').map(Number);
            if (world.chunkKey(chunkX, chunkZ) === world.chunkKey(Math.floor(x / 16), Math.floor(z / 16))) {
                column.set(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16, world.registry.id(type));
            }
        }
        return column;
    }
    // What the chunk worker's reply does (world.js, processNextChunk), for everything asked for so far.
    function deliver() {
        for (const [chunkX, chunkZ] of requested.splice(0)) {
            const key = world.chunkKey(chunkX, chunkZ);
            world.generatingChunks.delete(key);
            if (!world.isWithinRetention(chunkX, chunkZ)) continue;
            world.columns.set(key, columnFor(chunkX, chunkZ));
            world.chunkBiomes.set(key, 'plains');
            world.generatedChunks.add(key);
        }
    }
    // One frame, in the game's order, with the mobs of this test.
    function frame(delta, { chunksArrive = true } = {}) {
        world.update(camera.position.x, camera.position.z);
        if (chunksArrive) deliver();
        game.updateNaturalSpawning(delta);
        for (const mob of [...game.ambientMobs]) {
            if (mob.userData.antColony) game.antsUpdateColony(mob, delta, camera.position);
        }
    }
    function run(seconds, options) {
        for (let t = 0; t < seconds; t += 0.1) frame(0.1, options);
    }
    function walkTo(x, z = camera.position.z, onStep = null) {
        const stepLength = 2;
        while (Math.abs(camera.position.x - x) > 0.01 || Math.abs(camera.position.z - z) > 0.01) {
            const dx = x - camera.position.x;
            const dz = z - camera.position.z;
            const distance = Math.hypot(dx, dz);
            const move = Math.min(stepLength, distance);
            camera.position.x += dx / distance * move;
            camera.position.z += dz / distance * move;
            run(0.4);
            if (onStep) onStep();
        }
    }
    // The player's part of a frame, in the game's order (game.js): physics, survival, then the chunks.
    function playerFrame(delta, { chunksArrive = true } = {}) {
        cameraController.update(delta);
        game.updateSurvival(delta);
        world.update(camera.position.x, camera.position.z);
        if (chunksArrive) deliver();
    }
    function playerRun(seconds, options) {
        for (let t = 0; t < seconds - 1e-9; t += 1 / 60) playerFrame(1 / 60, options);
    }
    return { game, world, camera, cameraController, messages, deliver, frame, run, walkTo, requested, removedByServer, serverBlocks, playerFrame, playerRun };
}

function colonies(game) {
    return game.ambientMobs.filter((mob) => mob.userData.antColony);
}

// An anthill made the way a released jar makes it: nothing brings it back but the player.
function jarAnthill(game, x, z) {
    const spot = game.antsSpotAt(x, z, 3);
    assert.ok(spot, 'there is soil for the anthill');
    const mob = game.antsSpawnColony(spot.position, 6, 1);
    mob.userData.antColony.size = 12;
    return mob;
}

test.beforeEach(() => storage.clear());

// ---- Wild anthills: nothing is saved, the chunk spawns them again ----

test('page load: a wild anthill is not saved anywhere, and the same chunk gives it back', () => {
    const first = makeGame();
    first.run(3);
    const before = colonies(first.game);
    log('[load] first visit, wild anthills:', before.map((mob) => [mob.position.x, mob.position.y, mob.position.z, mob.userData.antColony.size].join(',')));
    assert.ok(before.length > 0, 'the flat world has some anthills');
    assert.ok(before.every((mob) => mob.userData.natural));
    const saved = [...storage.keys()].filter((key) => storage.get(key).includes('antColony') || key.includes('anthill'));
    log('[load] keys in localStorage that mention an anthill:', saved, '; all keys:', [...storage.keys()]);
    assert.deepEqual(saved, []);

    const second = makeGame();
    assert.equal(colonies(second.game).length, 0, 'no chunks yet, and nothing restored: nothing to lose');
    second.run(3);
    const place = (mob) => `${mob.position.x},${mob.position.y},${mob.position.z},${mob.userData.antColony.size},${mob.userData.variant}`;
    log('[load] after a reload:', colonies(second.game).map(place));
    assert.deepEqual(colonies(second.game).map(place).sort(), before.map(place).sort(), 'same place, same size, same kind');
    assert.deepEqual(second.messages, []);
});

test('page load: a jar anthill does not outlive a reload at all, chunks or no chunks (it is not saved)', () => {
    const { game, run } = makeGame();
    run(1);
    jarAnthill(game, 3.5, 3.5);
    assert.equal(colonies(game).filter((mob) => !mob.userData.natural).length, 1);
    const reloaded = makeGame();
    reloaded.run(3);
    log('[load] jar anthills after a reload:', colonies(reloaded.game).filter((mob) => !mob.userData.natural).length, '(never saved: see the report)');
    assert.equal(colonies(reloaded.game).filter((mob) => !mob.userData.natural).length, 0);
});

// ---- Farm anthills: saved, and with no block check ----

test('page load: a saved ant farm keeps everything with no chunks at all, and with no ground under it', () => {
    const entry = {
        x: 3.5, y: 0, z: 3.5, facing: 1, queen: true, workers: 17, food: 0.8, dig: 2.5, layTimer: 30, variant: 1, age: 500,
        brood: [[0, 10, 0.5, 0.5]], nodes: [[10, 20], [30, 40]], edges: [[0, 1]], chambers: [[1, 0, 0]], tips: [1]
    };
    storage.set('minecloud-ants', JSON.stringify({ savedAt: Date.now(), farms: [entry] }));
    const { game, frame, world, run } = makeGame();
    for (let t = 0; t < 40; t += 0.25) {
        game.antsFarmUpdate(0.25);
        frame(0.25, { chunksArrive: false });
    }
    assert.equal(world.columns.size, 0, 'no chunk arrived');
    const saved = JSON.parse(storage.get('minecloud-ants')).farms;
    log('[farm] after 40 s with no chunks, saved:', saved.length, 'farm, queen', saved[0].queen, 'workers', saved[0].workers, 'nodes', saved[0].nodes.length);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].queen, true);
    assert.ok(saved[0].workers >= 17);
    assert.ok(saved[0].nodes.length >= 2);
    assert.equal(game.antFarms.length, 1);
    run(1);
    assert.ok(world.columns.size > 0);
    assert.equal(game.antFarms.length, 1, 'and it is still there when the chunks come');
});

test('reconnection: a farm stays too', () => {
    storage.set('minecloud-ants', JSON.stringify({ savedAt: Date.now(), farms: [{ x: 3.5, y: 0, z: 3.5, facing: 0, queen: true, workers: 9, food: 0.5, dig: 0, layTimer: 30, variant: 0, age: 1, brood: [], nodes: [], edges: [], chambers: [], tips: [] }] }));
    const { game, world, frame } = makeGame();
    game.antsFarmEnsure();
    world.resetFromServer();
    for (let t = 0; t < 20; t += 0.25) {
        game.antsFarmUpdate(0.25);
        frame(0.25, { chunksArrive: false });
    }
    game.antsFarmSave();
    const saved = JSON.parse(storage.get('minecloud-ants')).farms;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].queen, true);
});

// ---- Going away and coming back ----

test('going away: a wild anthill goes with its chunk and comes back with it (harmless, and not through the ground check)', () => {
    const { game, messages, run, walkTo } = makeGame();
    run(3);
    const before = colonies(game).find((mob) => mob.userData.natural);
    assert.ok(before, 'a chunk spawned one');
    const where = before.position.clone();
    const chunkKey = before.userData.spawnChunk;
    walkTo(400);
    log('[wild away] at x=400: anthills', colonies(game).length, ', its chunk loaded:', game.world.columns.has(chunkKey));
    assert.ok(!game.ambientMobs.includes(before), 'despawned as any wild mob');
    walkTo(0.5);
    run(3);
    const back = colonies(game).find((mob) => mob.userData.spawnChunk === chunkKey);
    log('[wild away] back at x=0: anthill in the same place:', Boolean(back && back.position.distanceTo(where) < 0.01));
    assert.ok(back);
    assert.ok(back.position.distanceTo(where) < 0.01);
    assert.deepEqual(messages.filter((text) => text.includes('anthill')), []);
});

test('going away and back: a jar anthill is still there', () => {
    const { game, camera, messages, run, walkTo, world } = makeGame();
    run(1);
    const mob = jarAnthill(game, 3.5, 3.5);
    run(1);
    walkTo(250);
    const key = world.chunkKey(0, 0);
    log('[jar away] at x=250: its chunk loaded:', world.columns.has(key), ', anthill in the game:', game.ambientMobs.includes(mob));
    assert.equal(world.columns.has(key), false, 'its chunk really went');
    assert.ok(game.ambientMobs.includes(mob), 'beyond 96 blocks nothing checks it');
    let gone = null;
    walkTo(0.5, 0.5, () => {
        if (!gone && !game.ambientMobs.includes(mob)) {
            gone = { x: camera.position.x, distance: Math.hypot(camera.position.x - mob.position.x, camera.position.z - mob.position.z), loaded: world.columns.has(key) };
        }
    });
    log('[jar away] on the way back:', gone ? `GONE at ${gone.distance.toFixed(1)} blocks from it, with its chunk loaded: ${gone.loaded}` : 'still there');
    assert.equal(gone, null, 'it must not vanish on the way back');
    assert.ok(game.ambientMobs.includes(mob));
    assert.deepEqual(messages.filter((text) => text.includes('anthill')), []);
});

test('a short render distance: a jar anthill survives its chunk going while within 96 blocks', () => {
    const { game, run, walkTo, world } = makeGame({ renderDistance: 2 });
    run(1);
    const mob = jarAnthill(game, 3.5, 3.5);
    walkTo(90);
    log('[rd 2] 86 blocks away: its chunk loaded:', world.columns.has(world.chunkKey(0, 0)), ', anthill in the game:', game.ambientMobs.includes(mob));
    assert.equal(world.columns.has(world.chunkKey(0, 0)), false);
    assert.ok(game.ambientMobs.includes(mob));
});

// ---- Reconnection ----

test('reconnection: anthills stay while the chunks come back, with no false message', () => {
    const { game, world, messages, run, camera } = makeGame();
    run(3);
    const jar = jarAnthill(game, camera.position.x + 3, camera.position.z + 3);
    const wild = colonies(game).filter((mob) => mob.userData.natural);
    assert.ok(wild.length > 0);
    log('[reconnect] before: wild', wild.length, ', jar 1, chunks', world.columns.size);

    world.resetFromServer();
    assert.equal(world.columns.size, 0);
    run(2, { chunksArrive: false });
    log('[reconnect] 2 s with no chunks: wild', colonies(game).filter((mob) => mob.userData.natural).length, ', jar', game.ambientMobs.includes(jar) ? 1 : 0, ', messages:', messages);
    assert.ok(game.ambientMobs.includes(jar), 'the jar anthill stays');
    assert.ok(wild.every((mob) => game.ambientMobs.includes(mob)), 'the wild ones stay');
    assert.deepEqual(messages, [], 'nobody told the player their anthill was destroyed');

    run(5);
    log('[reconnect] 5 s more with chunks: wild', colonies(game).filter((mob) => mob.userData.natural).length, ', chunks', world.columns.size);
    assert.ok(world.columns.size > 0);
    assert.ok(game.ambientMobs.includes(jar));
    assert.ok(wild.every((mob) => game.ambientMobs.includes(mob)));
});

// ---- Really losing the ground still takes it down ----

test('digging out the ground takes the anthill down, with its message', () => {
    const { game, world, messages, run, camera } = makeGame();
    run(1);
    const mob = jarAnthill(game, 3.5, 3.5);
    run(1);
    assert.ok(game.ambientMobs.includes(mob));
    world.removeBlockAt(3, -1, 3);
    run(1);
    log('[real] ground dug out: anthill in the game:', game.ambientMobs.includes(mob), ', messages:', messages, ', player at', camera.position.x);
    assert.ok(!game.ambientMobs.includes(mob));
    assert.deepEqual(messages, ['The anthill was destroyed and the ants scattered']);
});

test('building over it takes the anthill down', () => {
    const { game, world, run } = makeGame();
    run(1);
    const mob = jarAnthill(game, 3.5, 3.5);
    run(1);
    world.addBlock({ x: 3, y: 0, z: 3, blockType: 'stone' });
    run(1);
    assert.ok(!game.ambientMobs.includes(mob));
});

test('ground dug out while its chunk was away: the anthill goes when the chunk arrives, not before', () => {
    const { game, world, messages, run, frame, removedByServer } = makeGame();
    run(1);
    const mob = jarAnthill(game, 3.5, 3.5);
    run(1);
    world.resetFromServer();
    removedByServer.add('3,-1,3');
    run(2, { chunksArrive: false });
    assert.ok(game.ambientMobs.includes(mob), 'no chunk yet: no decision');
    assert.deepEqual(messages, []);
    frame(0.1);
    run(1);
    log('[real] dug out while away, once its chunk arrives: anthill in the game:', game.ambientMobs.includes(mob));
    assert.ok(!game.ambientMobs.includes(mob));
    assert.deepEqual(messages, ['The anthill was destroyed and the ants scattered']);
});

// ---- Beaver dams: a saved plan ----

function beaverSite(cells) {
    return { center: { x: 8, y: 0, z: 8 }, cells, lodge: null };
}
test('a beaver dam plan does not lose its cells to a chunk that is not loaded', () => {
    const { game, world, run } = makeGame();
    run(1);
    const cells = [{ x: 3, y: 0, z: 3, type: 'wood', expect: 'water' }, { x: 4, y: 0, z: 3, type: 'wood', expect: 'water' }];
    storage.set(ctx.BEAVER_STORAGE_KEY, JSON.stringify([beaverSite(cells)]));
    const site = game.beaverLoadSites()[0];
    world.addBlock({ x: 3, y: 0, z: 3, blockType: 'water' });
    world.addBlock({ x: 4, y: 0, z: 3, blockType: 'water' });
    assert.equal(game.beaverNextCell(site).x, 3, 'loaded, and as planned');

    world.resetFromServer();
    world.edits.clear();
    const next = game.beaverNextCell(site);
    game.beaverSaveSites();
    const saved = JSON.parse(storage.get(ctx.BEAVER_STORAGE_KEY))[0].cells;
    log('[beaver] with its chunk not loaded: next', next, ', saved cells done:', saved.map((cell) => Boolean(cell.done)));
    assert.equal(next, null, 'nothing to build there for now');
    assert.deepEqual(saved.map((cell) => Boolean(cell.done)), [false, false], 'and the plan is intact');
});

test('a beaver site is not built blind: a cell that expects air waits for its chunk too', () => {
    const { game, run, world } = makeGame();
    run(1);
    const site = beaverSite([{ x: 3, y: 5, z: 3, type: 'wood', expect: null }]);
    assert.equal(game.beaverNextCell(site), site.cells[0]);
    world.resetFromServer();
    assert.equal(game.beaverNextCell(site), null);
    assert.ok(!site.cells[0].done);
});

test('a beaver plan still drops a cell whose spot really changed, and goes on past unloaded ones', () => {
    const { game, run, world } = makeGame();
    run(1);
    const far = { x: 900, y: 0, z: 900, type: 'wood', expect: 'water' };
    const changed = { x: 3, y: 0, z: 3, type: 'wood', expect: 'water' };
    const fine = { x: 4, y: 5, z: 3, type: 'wood', expect: null };
    const site = beaverSite([far, changed, fine]);
    world.addBlock({ x: 3, y: 0, z: 3, blockType: 'stone' });
    assert.equal(game.beaverNextCell(site), fine);
    assert.ok(!far.done, 'not loaded: kept for later');
    assert.ok(changed.done, 'loaded and different: dropped, as always');
});

test('a loose leaf stays while a chunk next to it, which may hold its trunk, is not loaded', () => {
    const { game, world, run } = makeGame();
    run(1);
    // The player's chunks are in; (-1, 0) goes, and the leaf is 2 blocks from its border.
    const leaf = { x: 1, y: 5, z: 8 };
    assert.equal(game.beaverLeafHeld(leaf), false, 'all loaded and no wood around: it falls');
    world.columns.delete(world.chunkKey(-1, 0));
    assert.equal(game.beaverLeafHeld(leaf), true, 'it may have a trunk there');
    run(1);
    world.addBlock({ x: 0, y: 3, z: 8, blockType: 'wood' });
    assert.equal(game.beaverLeafHeld(leaf), true, 'a real trunk holds it, as always');
});

// ---- Rabbit burrows ----

test('a rabbit burrow does not collapse because its chunk is away, and does when its ground goes', () => {
    const { game, world, run } = makeGame();
    run(1);
    const spot = game.rabbitBurrowSpot(3.5, 3.5, 3);
    assert.ok(spot);
    const burrow = game.createRabbitBurrow(spot);
    let surfaced = 0;
    game.rabbitSurface = () => { surfaced++; };
    game.startRabbitFlight = () => {};
    burrow.members.push({ userData: { burrow, hidden: true } });
    game.rabbitCheckBurrows(1);
    assert.ok(game.rabbitBurrows.includes(burrow));

    world.resetFromServer();
    game.rabbitCheckBurrows(1);
    log('[rabbit] chunk not loaded: burrow stands:', game.rabbitBurrows.includes(burrow), ', rabbits thrown out:', surfaced);
    assert.ok(game.rabbitBurrows.includes(burrow));
    assert.equal(surfaced, 0, 'a rabbit thrown out over no ground falls until it is removed at y < -30');

    run(1);
    game.rabbitCheckBurrows(1);
    assert.ok(game.rabbitBurrows.includes(burrow), 'its chunk is back and all is well');
    world.removeBlockAt(Math.floor(burrow.position.x), burrow.position.y - 1, Math.floor(burrow.position.z));
    game.rabbitCheckBurrows(1);
    assert.ok(!game.rabbitBurrows.includes(burrow));
    assert.equal(surfaced, 1);
});

// ---- The player, while the ground is not there ----
//
// On reconnecting, resetFromServer empties every chunk. getBlockId reads air there, and gravity goes on.

// A player standing on the flat ground, once the page has loaded.
function standingGame(options) {
    const g = makeGame(options);
    g.playerRun(2);
    assert.equal(g.cameraController.spawnSettling, false, 'landed after the page load');
    assert.equal(g.cameraController.onGround, true);
    return g;
}
const feet = ({ camera, cameraController }) => camera.position.y - cameraController.eyeHeight;
const near = (a, b, within = 0.01) => Math.abs(a - b) < within;

test('reconnection: however long the chunks take, the player stays on their feet', () => {
    log('[fall] delay until the chunks are back -> lowest feet, health, cause of death (ground at y = 0)');
    for (const seconds of [0.5, 1, 1.5, 3, 10]) {
        const g = standingGame();
        const { game, world } = g;
        world.resetFromServer();
        let lowest = feet(g);
        for (let t = 0; t < seconds; t += 1 / 60) {
            g.playerFrame(1 / 60, { chunksArrive: false });
            lowest = Math.min(lowest, feet(g));
        }
        g.deliver();
        for (let t = 0; t < 8; t += 1 / 60) {
            g.playerFrame(1 / 60);
            lowest = Math.min(lowest, feet(g));
        }
        log(`[fall] ${String(seconds).padStart(4)} s -> lowest ${lowest.toFixed(2)}, health ${game.health}/20, ${game.respawnPending ? `DEAD: ${game.deathReason}` : 'alive'}, standing at ${feet(g).toFixed(2)}`);
        assert.ok(near(lowest, 0), `${seconds} s: never left the ground, went down to ${lowest}`);
        assert.equal(game.health, 20, `${seconds} s`);
        assert.equal(game.respawnPending, false, `${seconds} s`);
        assert.ok(near(feet(g), 0), `${seconds} s`);
        assert.equal(g.cameraController.onGround, true, `${seconds} s`);
    }
});

test('reconnection: caught in the air, nothing builds up while waiting, and the rest of the jump is an ordinary short fall', () => {
    const g = standingGame();
    const { game, world, camera, cameraController: cc } = g;
    cc.velocityY = cc.jumpVelocity;
    cc.onGround = false;
    for (let t = 0; t < 0.2; t += 1 / 60) g.playerFrame(1 / 60);
    assert.equal(cc.onGround, false);
    const height = feet(g);
    assert.ok(height > 0.5, `in the air, at ${height}`);
    world.resetFromServer();
    const waitedFrom = camera.position.y;
    g.playerRun(5, { chunksArrive: false });
    log(`[air] 5 s without chunks from ${height.toFixed(2)} high: moved ${(camera.position.y - waitedFrom).toFixed(3)}, velocityY ${cc.velocityY}, landingSpeed ${cc.landingSpeed}`);
    assert.equal(camera.position.y, waitedFrom, 'it hangs there');
    assert.equal(cc.velocityY, 0, 'no speed gathered');
    assert.equal(cc.landingSpeed, 0, 'no landing owed');
    assert.equal(cc.onGround, false, 'it is not standing on anything');
    g.playerRun(3);
    assert.ok(near(feet(g), 0));
    assert.equal(game.health, 20);
});

test('reconnection: the fall that was going on starts over, from where it was, and the real drop still counts', () => {
    const g = standingGame();
    const { game, world, camera, cameraController: cc } = g;
    camera.position.y = 20 + cc.eyeHeight;
    cc.onGround = false;
    world.resetFromServer();
    g.playerRun(3, { chunksArrive: false });
    assert.ok(near(feet(g), 20));
    g.playerRun(4);
    log(`[high] 20 blocks above the ground when the chunks went: health ${game.health}/20`);
    assert.ok(near(feet(g), 0));
    assert.equal(game.respawnPending, true, 'twenty blocks are twenty blocks');
    assert.equal(game.deathReason, 'You died from fall damage');
});

// ---- It cannot be used to cheat: with the chunk loaded, nothing changes ----

test('a loaded column with nothing under the player still falls and kills', () => {
    const g = standingGame();
    const { game, world } = g;
    for (let y = -16; y <= -1; y++) {
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) world.removeBlockAt(dx, y, dz);
    }
    assert.ok(world.getColumnAt(0, 0));
    g.playerRun(4);
    log(`[void] dug out with the chunk loaded: feet ${feet(g).toFixed(1)}, ${game.respawnPending ? game.deathReason : 'alive'}`);
    assert.equal(game.respawnPending, true);
    assert.equal(game.deathReason, 'You fell into the void');
});

test('ground dug out while the chunk was away: the player waits, and falls for real when the chunk says so', () => {
    const g = standingGame();
    const { game, world, removedByServer } = g;
    for (let y = -16; y <= -1; y++) {
        for (let x = -16; x < 32; x++) for (let z = -16; z < 32; z++) removedByServer.add(`${x},${y},${z}`);
    }
    world.resetFromServer();
    g.playerRun(5, { chunksArrive: false });
    assert.ok(near(feet(g), 0), 'no chunk yet: no decision');
    assert.equal(game.respawnPending, false);
    g.playerRun(4);
    assert.equal(game.respawnPending, true);
    assert.equal(game.deathReason, 'You fell into the void');
});

test('already deep in the void when the chunks go: no death without a chunk, and no escape once it is back', () => {
    const g = standingGame();
    const { game, world, camera, removedByServer } = g;
    camera.position.y = -40;
    for (let y = -16; y <= -1; y++) removedByServer.add(`0,${y},0`);
    world.resetFromServer();
    g.playerRun(3, { chunksArrive: false });
    assert.equal(game.respawnPending, false);
    g.playerRun(0.2);
    assert.equal(game.respawnPending, true);
    assert.equal(game.deathReason, 'You fell into the void');
});

// ---- The last safe position ----

test('the last safe position never records a place in the air, and goes on once on the ground', () => {
    const g = standingGame();
    const { game, world, camera, cameraController: cc } = g;
    g.playerRun(1.5);
    const before = storage.get('minecloud-last-safe-position');
    assert.ok(before, 'standing, it was saved');
    camera.position.y += 6;
    cc.onGround = false;
    world.resetFromServer();
    g.playerRun(5, { chunksArrive: false });
    log('[safe] after 5 s hanging 6 blocks up:', storage.get('minecloud-last-safe-position') === before ? 'unchanged' : storage.get('minecloud-last-safe-position'));
    assert.equal(storage.get('minecloud-last-safe-position'), before);
    assert.equal(game.lastSafePosition.y, JSON.parse(before).y);
    g.playerRun(3);
    assert.ok(near(JSON.parse(storage.get('minecloud-last-safe-position')).y, cc.eyeHeight), 'and on the ground again it is the ground');
});

test('standing still through a reconnection does not record anything either', () => {
    const g = standingGame();
    g.playerRun(1.5);
    const before = storage.get('minecloud-last-safe-position');
    g.world.resetFromServer();
    g.playerRun(5, { chunksArrive: false });
    assert.equal(storage.get('minecloud-last-safe-position'), before);
});

// ---- Moving ----

test('reconnection: the player cannot walk or jump while nothing is loaded around them', () => {
    const g = standingGame();
    const { world, camera, cameraController: cc } = g;
    world.resetFromServer();
    const { x, y, z } = camera.position;
    cc.keys.forward = true;
    cc.keys.right = true;
    cc.keys.jump = true;
    g.playerRun(3, { chunksArrive: false });
    cc.keys.forward = cc.keys.right = cc.keys.jump = false;
    log(`[hold] 3 s pushing forward and jumping: moved ${Math.hypot(camera.position.x - x, camera.position.z - z).toFixed(3)} sideways, ${(camera.position.y - y).toFixed(3)} up`);
    assert.deepEqual([camera.position.x, camera.position.y, camera.position.z], [x, y, z]);
});

test('touch controls too: the joystick and the Jump button do nothing while waiting, and work again after', () => {
    const g = standingGame();
    const { world, camera, cameraController: cc } = g;
    cc.setTouchControlsEnabled(true);
    world.resetFromServer();
    const { x, y, z } = camera.position;
    cc.setMoveInput(0.7, 0.7);
    cc.setTouchJump(true);
    g.playerRun(2, { chunksArrive: false });
    assert.deepEqual([camera.position.x, camera.position.y, camera.position.z], [x, y, z]);
    cc.setTouchJump(false);
    g.playerRun(1);
    assert.ok(Math.hypot(camera.position.x - x, camera.position.z - z) > 1, 'the same joystick walks once the ground is there');
    cc.setMoveInput(0, 0);
    assert.ok(near(feet(g), 0));
});

test('reconnection: the look still works while waiting', () => {
    const g = standingGame();
    const { world, cameraController: cc } = g;
    world.resetFromServer();
    cc.addLookDelta(100, 0);
    const yaw = cc.yaw;
    g.playerRun(0.1, { chunksArrive: false });
    assert.notEqual(cc.yaw, yaw);
    assert.equal(g.camera.rotation.y, cc.yaw);
});

test('crouching while waiting moves the view, not the feet', () => {
    const g = standingGame();
    const { world, camera, cameraController: cc } = g;
    world.resetFromServer();
    g.playerRun(0.2, { chunksArrive: false });
    const before = feet(g);
    cc.keys.crouch = true;
    g.playerRun(0.2, { chunksArrive: false });
    assert.ok(near(feet(g), before));
    assert.ok(near(camera.position.y, before + cc.crouchingEyeHeight));
    cc.keys.crouch = false;
    g.playerRun(0.2, { chunksArrive: false });
    assert.ok(near(feet(g), before));
});

test('the edge of the loaded area: the player stops at it, slides along it, and goes on when the chunk comes', () => {
    const g = standingGame({ renderDistance: 1 });
    const { game, world, camera, cameraController: cc } = g;
    // Forward is -z here: the next chunk that way has not come yet.
    camera.position.set(8.5, cc.eyeHeight, -14.5);
    g.playerRun(0.2);
    world.columns.delete(world.chunkKey(0, -2));
    world.columns.delete(world.chunkKey(1, -2));
    world.columns.delete(world.chunkKey(-1, -2));
    world.generatedChunks.delete(world.chunkKey(0, -2));
    cc.keys.forward = true;
    for (let t = 0; t < 2; t += 1 / 60) {
        cc.update(1 / 60);
        game.updateSurvival(1 / 60);
    }
    log(`[edge] walking at the unloaded chunk (it starts at z = -16): stopped at z = ${camera.position.z.toFixed(3)}, feet ${feet(g).toFixed(2)}`);
    assert.ok(camera.position.z >= -16, 'still on the loaded side');
    assert.ok(camera.position.z < -15.9, 'right up to the border');
    assert.ok(near(feet(g), 0));
    assert.equal(cc.onGround, true, 'and standing on the loaded column');
    assert.equal(game.health, 20);

    cc.keys.right = true;
    const x = camera.position.x;
    for (let t = 0; t < 0.5; t += 1 / 60) cc.update(1 / 60);
    assert.ok(camera.position.x > x + 1, 'a diagonal slides along the border');
    cc.keys.right = false;

    world.columns.set(world.chunkKey(0, -2), new ctx.ChunkColumn(0, -2));
    const grass = world.registry.id('grass');
    for (let lx = 0; lx < 16; lx++) for (let lz = 0; lz < 16; lz++) world.columns.get(world.chunkKey(0, -2)).set(lx, -1, lz, grass);
    for (let t = 0; t < 0.5; t += 1 / 60) cc.update(1 / 60);
    assert.ok(camera.position.z < -16.5, 'the chunk came: the walk goes on');
    assert.ok(near(feet(g), 0));
    cc.keys.forward = false;
});

test('a shove does not push the player off the loaded area, nor stay stored while waiting', () => {
    const g = standingGame({ renderDistance: 1 });
    const { world, camera, cameraController: cc } = g;
    camera.position.set(8.5, cc.eyeHeight, -15.95);
    g.playerRun(0.1);
    world.columns.delete(world.chunkKey(0, -2));
    cc.onGround = true;
    cc.applyKnockback(0, -1, 9, 0);
    for (let t = 0; t < 0.5; t += 1 / 60) cc.update(1 / 60);
    assert.ok(camera.position.z >= -16, `held at ${camera.position.z}`);
    world.resetFromServer();
    cc.applyKnockback(1, 0, 9, 5);
    const { x, y } = camera.position;
    for (let t = 0; t < 0.5; t += 1 / 60) cc.update(1 / 60);
    assert.equal(camera.position.x, x);
    assert.equal(camera.position.y, y);
    assert.equal(cc.knockbackX, 0);
    assert.equal(cc.velocityY, 0);
});

test('waiting, the player does not wander over the unknown, but a step onto a loaded chunk is always good', () => {
    const g = standingGame({ renderDistance: 1 });
    const { game, world, camera, cameraController: cc } = g;
    camera.position.set(14.5, cc.eyeHeight, 8.5);
    g.playerRun(0.1);
    world.columns.delete(world.chunkKey(0, 0));
    const before = camera.position.x;
    cc.keys.right = true;
    for (let t = 0; t < 1; t += 1 / 60) cc.update(1 / 60);
    assert.equal(camera.position.x, before, '1.5 blocks from the loaded chunk: it waits');
    camera.position.x = 15.98;
    for (let t = 0; t < 1; t += 1 / 60) {
        cc.update(1 / 60);
        game.updateSurvival(1 / 60);
    }
    cc.keys.right = false;
    assert.ok(camera.position.x > 16, 'out, on the loaded chunk next door');
    assert.ok(near(feet(g), 0));
    assert.equal(cc.onGround, true);
    assert.equal(game.health, 20);
});

// ---- Other ways of being in the world ----

test('page load: the spawn still waits for its chunk and floats down, with no damage', () => {
    const g = makeGame();
    const { game, camera, cameraController: cc } = g;
    camera.position.set(0.5, 40, 0.5);
    g.playerRun(5, { chunksArrive: false });
    assert.equal(camera.position.y, 40);
    assert.equal(cc.spawnSettling, true);
    g.playerRun(6);
    assert.equal(cc.spawnSettling, false);
    assert.ok(near(feet(g), 0));
    assert.equal(game.health, 20);
});

test('flying: a flyer goes on flying through a reconnection, and over what is not loaded', () => {
    const g = standingGame();
    const { game, world, camera, cameraController: cc } = g;
    cc.flightAllowed = true;
    cc.flying = true;
    camera.position.y = 30;
    world.resetFromServer();
    const { x, z } = camera.position;
    g.playerRun(1, { chunksArrive: false });
    assert.equal(cc.flying, true, 'not brought down');
    assert.equal(camera.position.y, 30);
    cc.keys.forward = true;
    cc.keys.jump = true;
    g.playerRun(1, { chunksArrive: false });
    cc.keys.forward = cc.keys.jump = false;
    log(`[fly] 1 s up and ahead with no chunks: ${(z - camera.position.z).toFixed(1)} ahead, y ${camera.position.y.toFixed(1)}`);
    assert.ok(z - camera.position.z > 5, 'it moves');
    assert.equal(camera.position.x, x);
    assert.ok(camera.position.y > 30);

    cc.flying = false;
    const y = camera.position.y;
    g.playerRun(2, { chunksArrive: false });
    assert.equal(camera.position.y, y, 'stopping flying over nothing known hangs there, too');
    assert.equal(game.respawnPending, false);
});

test('flying down past the void depth with no chunk: no death until the chunk says so', () => {
    const g = standingGame();
    const { game, world, camera, cameraController: cc } = g;
    cc.flightAllowed = true;
    cc.flying = true;
    world.resetFromServer();
    camera.position.y = -40;
    g.playerRun(2, { chunksArrive: false });
    assert.equal(game.respawnPending, false);
});

test('seated: a reconnection does not stand the player up, and the seat stays where it was', () => {
    const g = standingGame();
    const { game, world, camera, cameraController: cc, serverBlocks } = g;
    world.addBlock({ x: 3, y: 0, z: 3, blockType: 'planks' });
    serverBlocks.set('3,0,3', 'planks');
    const seat = { x: 3.5, y: 1.2, z: 3.5 };
    game.seated = { x: 3, y: 0, z: 3, base: 'planks', facing: 'n', avatarYaw: 0 };
    cc.setSeat(seat);
    const frame = (options) => {
        cc.update(1 / 60);
        game.seatUpdate();
        game.updateSurvival(1 / 60);
        world.update(camera.position.x, camera.position.z);
        if (options.chunksArrive) g.deliver();
    };
    frame({ chunksArrive: true });
    assert.ok(game.seated);
    world.resetFromServer();
    for (let i = 0; i < 180; i++) frame({ chunksArrive: false });
    log('[seat] 3 s with no chunks: still seated:', Boolean(game.seated), ', eye at y', camera.position.y);
    assert.ok(game.seated, 'still sitting');
    assert.equal(cc.seat, seat);
    assert.equal(camera.position.y, seat.y);
    assert.equal(game.health, 20);
    for (let i = 0; i < 60; i++) frame({ chunksArrive: true });
    assert.ok(game.seated, 'and the same seat came back');
    assert.equal(camera.position.y, seat.y);
});

test('seated: a seat really gone while away ends the sitting once its chunk says so', () => {
    const g = standingGame();
    const { game, world, camera, cameraController: cc } = g;
    world.addBlock({ x: 3, y: 0, z: 3, blockType: 'planks' });
    game.seated = { x: 3, y: 0, z: 3, base: 'planks', facing: 'n', avatarYaw: 0 };
    cc.setSeat({ x: 3.5, y: 1.2, z: 3.5 });
    world.resetFromServer();
    game.seatUpdate();
    assert.ok(game.seated);
    g.playerRun(0.1);
    assert.ok(world.getColumnAt(3, 3));
    game.seatUpdate();
    assert.equal(game.seated, null, 'the server sends no seat there');
    assert.equal(cc.seat, null);
});

test('riding: horse and rider wait together and go on after', () => {
    const g = standingGame();
    const { game, world, camera, cameraController: cc } = g;
    const horse = game.createMob('horse', new Vector3(0.5, 0, 0.5));
    game.ambientMobs.push(horse);
    game.animateMount = () => {};
    camera.position.set(0.5, 0 + cc.eyeHeight, 0.5);
    assert.equal(game.tryMountMob === undefined, false);
    cc.setMount(ctx.getMobSpecies('horse').mount);
    camera.position.y = cc.eyeHeight;
    game.ridingMob = horse;
    horse.userData.rider = true;
    horse.userData.clop = 0;
    g.playerRun(0.2);
    const frame = (chunksArrive) => {
        g.playerFrame(1 / 60, { chunksArrive });
        game.updateRiddenMob(horse, 1 / 60);
    };
    world.resetFromServer();
    const { x, y, z } = camera.position;
    cc.keys.forward = true;
    for (let i = 0; i < 180; i++) frame(false);
    log(`[ride] 3 s galloping with no chunks: moved ${Math.hypot(camera.position.x - x, camera.position.z - z).toFixed(3)}, horse at y ${horse.position.y.toFixed(2)}`);
    assert.deepEqual([camera.position.x, camera.position.y, camera.position.z], [x, y, z]);
    assert.ok(near(horse.position.y, 0), 'the horse does not fall');
    for (let i = 0; i < 60; i++) frame(true);
    cc.keys.forward = false;
    assert.ok(z - camera.position.z > 2, 'and it gallops on');
    assert.ok(near(horse.position.y, 0));
    assert.equal(game.health, 20);
});

test('in water: a swimmer waits at the same depth, and swims again when the water is back', () => {
    const g = standingGame();
    const { game, world, camera, cameraController: cc, serverBlocks } = g;
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) for (let y = 0; y < 4; y++) serverBlocks.set(`${x},${y},${z}`, 'water');
    world.resetFromServer();
    g.deliver();
    world.update(camera.position.x, camera.position.z);
    g.deliver();
    camera.position.y = 2 + cc.eyeHeight;
    cc.velocityY = -1;
    g.playerRun(0.1);
    assert.equal(cc.isInWater, true);
    world.resetFromServer();
    const y = camera.position.y;
    g.playerRun(3, { chunksArrive: false });
    assert.equal(camera.position.y, y);
    assert.equal(cc.isInWater, false, 'no water known around it');
    g.playerRun(0.1);
    assert.equal(cc.isInWater, true);
    assert.ok(y - camera.position.y < 0.5, 'and it goes on sinking slowly');
    assert.equal(game.health, 20);
});

test('on a ladder: it waits, and holds on again when the ladder is back', () => {
    const g = standingGame();
    const { world, camera, cameraController: cc, serverBlocks } = g;
    for (let y = 0; y < 8; y++) serverBlocks.set(`0,${y},0`, 'ladder');
    world.resetFromServer();
    g.deliver();
    world.update(camera.position.x, camera.position.z);
    g.deliver();
    camera.position.y = 5 + cc.eyeHeight;
    g.playerRun(0.1);
    assert.equal(cc.isOnLadder, true);
    world.resetFromServer();
    const y = camera.position.y;
    g.playerRun(3, { chunksArrive: false });
    assert.equal(camera.position.y, y);
    g.playerRun(0.5);
    assert.equal(camera.position.y, y, 'a ladder holds whoever does not press anything');
    assert.equal(cc.isOnLadder, true);
});

test('on a lift platform high up: the player waits on it, and stands on it again', () => {
    const g = standingGame();
    const { game, world, camera, cameraController: cc, serverBlocks } = g;
    serverBlocks.set('0,9,0', 'lift_platform');
    world.resetFromServer();
    g.deliver();
    world.update(camera.position.x, camera.position.z);
    g.deliver();
    camera.position.y = 10 + cc.eyeHeight;
    g.playerRun(0.2);
    assert.ok(near(feet(g), 10), 'standing on it');
    world.resetFromServer();
    g.playerRun(3, { chunksArrive: false });
    assert.ok(near(feet(g), 10), 'waiting at its height');
    g.playerRun(1);
    assert.ok(near(feet(g), 10), 'and on it again');
    assert.equal(cc.onGround, true);
    assert.equal(game.health, 20);
});

test('the connection drops again: a minute with no chunks costs nothing, and the next connection brings them', () => {
    const g = standingGame();
    const { game, world, camera, cameraController: cc } = g;
    g.playerRun(1.5);
    const safe = storage.get('minecloud-last-safe-position');
    world.resetFromServer();
    for (let t = 0; t < 60; t += 0.05) {
        cc.update(0.05);
        game.updateSurvival(0.05);
        world.update(camera.position.x, camera.position.z);
    }
    log(`[drop] 60 s: feet ${feet(g).toFixed(2)}, health ${game.health}/20, safe position ${storage.get('minecloud-last-safe-position') === safe ? 'unchanged' : 'CHANGED'}`);
    assert.ok(near(feet(g), 0));
    assert.equal(game.health, 20);
    assert.equal(game.respawnPending, false);
    assert.equal(storage.get('minecloud-last-safe-position'), safe);
    g.requested.length = 0;
    world.resetFromServer();
    g.playerRun(1);
    assert.ok(world.getColumnAt(0, 0));
    assert.equal(cc.onGround, true);
    assert.ok(near(feet(g), 0));
});

test('the game tells its controller about the chunks (this harness replaces that part of game.js)', () => {
    const source = fs.readFileSync(path.join(STATIC, 'js', 'game.js'), 'utf8');
    assert.match(source, /cameraController\.setColumnChecker\(\(x, z\) => this\.world\.getColumnAt\(x, z\)\)/);
});

test('with no way to know about chunks (a controller on its own), physics is what it always was', () => {
    const camera = { position: new Vector3(0.5, 10, 0.5), rotation: {} };
    const cc = new ctx.CameraController(camera, { addEventListener() {} });
    cc.setGameplayCheck(() => true);
    cc.spawnSettling = false;
    for (let t = 0; t < 0.5; t += 1 / 60) cc.update(1 / 60);
    assert.ok(camera.position.y < 9);
});

// ---- What else stands on the world ----

// A creature on the flat ground, its animations left out: only where it is matters here. What runs after the
// creatures in updateAmbientMobs needs a whole game, so a failure there is not this test's business.
function creature(species, { tamed = false } = {}) {
    const g = makeGame();
    const { game, world, camera } = g;
    game.spawnMobsForChunk = () => {};
    g.run(1);
    const mob = game.createMob(species, new Vector3(4.5, 0, 4.5));
    mob.userData.natural = !tamed;
    if (tamed) {
        mob.userData.tamed = true;
        mob.userData.owner = 'me';
    }
    game.ambientMobs.push(mob);
    const step = (seconds, chunksArrive) => {
        for (let t = 0; t < seconds; t += 0.05) {
            try {
                game.updateAmbientMobs(0.05);
            } catch (_error) { /* see above */ }
            world.update(camera.position.x, camera.position.z);
            if (chunksArrive) g.deliver();
        }
    };
    return { ...g, mob, step };
}

for (const [species, tamed] of [['goat', true], ['goat', false], ['frog', false], ['turtle', false], ['lizard', false], ['eel', false], ['sheep', true], ['rabbit', false], ['snake', false]]) {
    test(`reconnection: a ${tamed ? 'tamed' : 'wild'} ${species} does not fall through the world`, () => {
        const { mob, step, world, game } = creature(species, { tamed });
        step(1, true);
        const before = mob.position.y;
        world.resetFromServer();
        step(4, false);
        log(`[mobs] ${tamed ? 'tamed' : 'wild '} ${species.padEnd(7)}: y ${before.toFixed(2)} -> ${mob.position.y.toFixed(2)} after 4 s with no chunks`);
        assert.ok(game.ambientMobs.includes(mob), 'still in the game');
        assert.ok(mob.position.y > before - 0.5, `at y ${mob.position.y}`);
        step(4, true);
        assert.ok(mob.position.y > -2, `after the chunks, at y ${mob.position.y}`);
    });
}

test('the copper golem: no gravity without a floor, and its own update still runs to catch up with its builder', () => {
    const { game, world, mob, step } = creature('copper_golem', { tamed: true });
    world.resetFromServer();
    mob.userData.copper = { velocityY: 0 };
    mob.position.y = 3;
    game.copperGolemFall(mob, 1);
    assert.equal(mob.position.y, 3, 'it stays');
    let updates = 0;
    game.copperGolemUpdate = () => { updates++; };
    step(0.5, false);
    assert.ok(updates > 0, 'it can still come to the player: copperGolemCatchUp lives there');
});

test('a robot: it does not move into what is not loaded, and has no gravity to fall by', () => {
    const { game, world } = creature('sheep');
    world.resetFromServer();
    const robot = { x: 2, y: 5, z: 2, dir: 0 };
    const result = game.robotMove(robot, 'ahead', 0.3);
    log('[robot] moving with no chunk:', result);
    assert.equal(result.ok, false);
    assert.match(result.error, /not loaded/);
    assert.equal(robot.y, 5);
});
