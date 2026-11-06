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
    world.setChunkSource({ connected: () => true, request: (chunks) => requested.push(...chunks), focus() {} });

    const camera = { position: new Vector3(0.5, EYE + 0.01, 0.5), rotation: {} };
    const cameraController = new ctx.CameraController(camera, { addEventListener() {} });
    cameraController.setGameplayCheck(() => true);
    cameraController.setBlockChecker((x, y, z) => world.hasSolidBlock(x, y, z));
    cameraController.setBlockTypeGetter((x, y, z) => world.getBlockTypeAt(x, y, z));
    cameraController.setBlockHeightGetter((x, y, z) => world.getCollisionHeight(x, y, z));
    cameraController.setCollisionBoxGetter((x, y, z) => world.getCollisionBoxes(x, y, z));

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
    return { game, world, camera, cameraController, messages, deliver, frame, run, walkTo, requested, removedByServer };
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
