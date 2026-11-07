// Node tests for how followers share the room (js/game/herd.js). The real mobs.js, taming.js, wildlife.js, herd.js,
// camera.js and world.js run on a simulated flat world; only drawing and sound are left out. Each frame is what the
// game does: updateAmbientMobs moves the mobs and then runs taming and herd as frame updates.
// Run with: node --test test/js/herd.test.js
// With REPRO=1 in the environment it also prints what it measures.

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
    vm.runInContext('Object.assign(this, { WorldRenderer, ChunkColumn, Game, CameraController });', context);
    // Only what this test is about runs after the mobs (the others need a whole game).
    vm.runInContext(`FRAME_UPDATERS.length = 0;
        FRAME_UPDATERS.push(function (delta) { this.tamingUpdate(delta); });
        if (Game.prototype.herdUpdate) FRAME_UPDATERS.push(function (delta) { this.herdUpdate(delta); });`, context);
    return context;
}
const ctx = loadGame();

const EYE = 1.62;

// Same numbers every run.
function seedRandom(seed) {
    vm.runInContext(`(() => { let s = ${seed} >>> 0; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })()`, ctx);
}

// A flat world (grass with its top at y = 0) with the player at (x, z), standing and loaded. `blocks` and `removed`
// shape it before it arrives: 'x,y,z' cells.
function makeWorld({ x = 0.5, z = 0.5, blocks = {}, removed = () => false, renderDistance = 3, seed = 1 } = {}) {
    seedRandom(seed);
    const scene = new Object3D();
    const world = new ctx.WorldRenderer(scene);
    world.renderDistance = renderDistance;
    world.rebuildChunk = () => {};
    const grass = world.registry.id('grass');
    const requested = [];
    world.setChunkSource({ connected: () => true, request: (chunks) => requested.push(...chunks), focus() {} });

    const camera = { position: new Vector3(x, EYE + 0.01, z), rotation: {} };
    const cameraController = new ctx.CameraController(camera, { addEventListener() {} });
    cameraController.setGameplayCheck(() => true);
    cameraController.isLocked = true;
    cameraController.setBlockChecker((bx, by, bz) => world.hasSolidBlock(bx, by, bz));
    cameraController.setBlockTypeGetter((bx, by, bz) => world.getBlockTypeAt(bx, by, bz));
    cameraController.setBlockHeightGetter((bx, by, bz) => world.getCollisionHeight(bx, by, bz));
    cameraController.setCollisionBoxGetter((bx, by, bz) => world.getCollisionBoxes(bx, by, bz));
    cameraController.setColumnChecker((bx, bz) => world.getColumnAt(bx, bz));

    const game = new ctx.Game();
    Object.assign(game, {
        world, scene, camera, cameraController, ambientMobs: [], mobSpawnedChunks: new Set(), mobSpawnTimer: 0,
        titleScreenOpen: false, respawnPending: false, weatherState: 'clear', timeOfDay: 0.3, otherPlayerMeshes: new Map(),
        network: { connected: true, send() {} },
        playerName: 'me',
        getLocalPlayerPosition: () => camera.position,
        attachMobModel: (group) => {
            Object.assign(group.userData, { legs: [], arms: [], wings: [], tail: [], head: null, modelRoot: null, modelParts: {}, legAxis: 'x' });
            return { height: 1 };
        },
        createMobHealthBar: () => new Object3D(), updateMobHealthBar() {},
        emitMobEvent() {}, isNightTime: () => false, playTone() {}, playNoiseBurst() {}, playPlaceSound() {},
        receiveSystemMessage() {}, spawnMobsForChunk() {}, updateNaturalSpawning() {}, updateDroppedTails() {}, updatePoison() {},
        updateShadowSpawning() {}, updateSmokePuffs() {}, tamingSave() {}, tamingUpdateParticles() {}, tamingHearts() {}, tamingChirp() {}
    });

    function columnFor(chunkX, chunkZ) {
        const column = new ctx.ChunkColumn(chunkX, chunkZ);
        for (let lx = 0; lx < 16; lx++) {
            for (let lz = 0; lz < 16; lz++) {
                const wx = chunkX * 16 + lx;
                const wz = chunkZ * 16 + lz;
                for (let y = -16; y <= -1; y++) {
                    if (!removed(wx, y, wz)) column.set(lx, y, lz, grass);
                }
            }
        }
        for (const [cell, type] of Object.entries(blocks)) {
            const [bx, by, bz] = cell.split(',').map(Number);
            if (Math.floor(bx / 16) === chunkX && Math.floor(bz / 16) === chunkZ) {
                column.set(((bx % 16) + 16) % 16, by, ((bz % 16) + 16) % 16, world.registry.id(type));
            }
        }
        return column;
    }
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
    // The world loads over a few frames.
    for (let i = 0; i < 60; i++) {
        world.update(x, z);
        deliver();
    }
    assert.ok(world.getColumnAt(Math.floor(x), Math.floor(z)), 'the ground is there');

    const spawn = (species, sx, sz, { tamed = true, y = null } = {}) => {
        const floor = y ?? cameraController.getFloorY(sx, sz, 40);
        const mob = game.createMob(species, new Vector3(sx, floor, sz));
        if (tamed) game.tamingTame(mob, { quiet: true });
        else mob.userData.natural = true;
        game.ambientMobs.push(mob);
        return mob;
    };
    const frame = (delta = 1 / 30, { chunksArrive = true } = {}) => {
        game.updateAmbientMobs(delta);
        world.update(camera.position.x, camera.position.z);
        if (chunksArrive) deliver();
    };
    const run = (seconds, delta = 1 / 30, options) => {
        for (let t = 0; t < seconds - 1e-9; t += delta) frame(delta, options);
    };
    return { game, world, camera, cameraController, spawn, frame, run, deliver, requested };
}

// What is measured.
const bodyOf = (game, mob) => ({
    x: mob.position.x, z: mob.position.z, r: game.herdRadius(mob), bottom: mob.position.y, top: mob.position.y + game.herdHeight(mob)
});
function worstOverlap(game, mobs) {
    let worst = 0;
    for (let i = 0; i < mobs.length; i++) {
        const a = bodyOf(game, mobs[i]);
        for (let j = i + 1; j < mobs.length; j++) {
            const b = bodyOf(game, mobs[j]);
            if (a.top <= b.bottom || b.top <= a.bottom) continue;
            worst = Math.max(worst, a.r + b.r - Math.hypot(a.x - b.x, a.z - b.z));
        }
    }
    return worst;
}
// The ground each mob covers during `seconds`: nothing, if it really stands still.
function pathLengths(g, mobs, seconds) {
    const lengths = new Map(mobs.map((mob) => [mob, 0]));
    let last = new Map(mobs.map((mob) => [mob, [mob.position.x, mob.position.z]]));
    for (let t = 0; t < seconds; t += 1 / 30) {
        g.frame(1 / 30);
        const now = new Map();
        for (const mob of mobs) {
            const [x, z] = last.get(mob);
            lengths.set(mob, lengths.get(mob) + Math.hypot(mob.position.x - x, mob.position.z - z));
            now.set(mob, [mob.position.x, mob.position.z]);
        }
        last = now;
    }
    return lengths;
}
const maxOf = (values) => Math.max(0, ...values);
function largestEmptyArc(g, mobs) {
    const { x, z } = g.camera.position;
    const angles = mobs.map((mob) => Math.atan2(mob.position.z - z, mob.position.x - x)).sort((a, b) => a - b);
    let largest = 0;
    angles.forEach((angle, i) => {
        const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI;
        largest = Math.max(largest, next - angle);
    });
    return largest * 180 / Math.PI;
}
// Seconds until nobody's place is left to walk to, or Infinity.
function settle(g, mobs, limit = 120) {
    for (let t = 0; t < limit; t += 1 / 30) {
        g.frame(1 / 30);
        if (t > 1 && mobs.every((mob) => mob.userData.herd && mob.userData.herd.state === 'rest')) return t;
    }
    return Infinity;
}

const mixed = ['duck', 'sheep', 'pig', 'giraffe', 'camel', 'horse', 'dog', 'cat', 'goat', 'sheep', 'duck', 'pig', 'giraffe', 'horse', 'camel', 'sheep', 'dog', 'cat', 'goat', 'pig'];

test.beforeEach(() => storage.clear());

test('bodies: sizes come from the real models, and babies and big genes count', () => {
    const g = makeWorld();
    const { game } = g;
    const duck = g.spawn('duck', 3, 3);
    const giraffe = g.spawn('giraffe', 5, 5);
    const camel = g.spawn('camel', 7, 7);
    const sizes = Object.fromEntries(['duck', 'cat', 'macaw', 'goat', 'sheep', 'dog', 'horse', 'giraffe', 'pig', 'camel'].map((species) => {
        const mob = g.spawn(species, 9, 9);
        return [species, [game.herdRadius(mob), game.herdHeight(mob)].map((n) => Number(n.toFixed(2)))];
    }));
    log('[bodies] radius, height:', sizes);
    assert.ok(game.herdRadius(giraffe) > game.herdRadius(duck) + 0.15, 'a giraffe needs more room than a duck');
    assert.ok(game.herdRadius(camel) > game.herdRadius(duck));
    assert.ok(game.herdHeight(giraffe) > 3 && game.herdHeight(duck) < 1);
    const before = game.herdRadius(giraffe);
    giraffe.scale.setScalar(0.5);
    assert.ok(Math.abs(game.herdRadius(giraffe) - before / 2) < 1e-9, 'a baby takes half the room');
    giraffe.scale.setScalar(1.3);
    assert.ok(Math.abs(game.herdRadius(giraffe) - before * 1.3) < 1e-9, 'big genes take more');
});

for (const [name, place] of [
    ['all from the same side', (i) => [12 + (i % 5) * 0.8, 0.5 + Math.floor(i / 5) * 1.2]],
    ['in a single file', (i) => [4 + i * 1.1, 0.5]],
    ['heaped on one point', () => [6.5, 6.5]],
    ['already around the player, all overlapping', (i) => [0.5 + Math.cos(i) * 0.6, 0.5 + Math.sin(i) * 0.6]]
]) {
    for (const seed of [1, 2, 3, 4]) test(`20 followers of all sizes, ${name} (seed ${seed}): they settle apart, around the player, and stand still`, () => {
        const g = makeWorld({ seed });
        const mobs = mixed.map((species, i) => g.spawn(species, ...place(i)));
        const seconds = settle(g, mobs);
        const overlap = worstOverlap(g.game, mobs);
        g.run(8); // the last to arrive nudged somebody, who goes back
        const paths = pathLengths(g, mobs, 10);
        const jitter = maxOf([...paths.values()]);
        const overlapAfter = worstOverlap(g.game, mobs);
        const arc = largestEmptyArc(g, mobs);
        const far = maxOf(mobs.map((mob) => Math.hypot(mob.position.x - g.camera.position.x, mob.position.z - g.camera.position.z)));
        const near = Math.min(...mobs.map((mob) => Math.hypot(mob.position.x - g.camera.position.x, mob.position.z - g.camera.position.z)));
        log(`[settle] ${name}: settled in ${seconds.toFixed(1)} s, worst overlap ${overlap.toFixed(3)} -> ${overlapAfter.toFixed(3)}, moved in the next 10 s at most ${jitter.toFixed(4)}, nearest ${near.toFixed(2)}, farthest ${far.toFixed(2)}, largest empty arc ${arc.toFixed(0)} deg`);
        assert.ok(seconds < 120, `everybody got to a place (${mobs.filter((mob) => mob.userData.herd.state !== 'rest').length} did not)`);
        assert.ok(overlapAfter < 0.05, `overlap ${overlapAfter}`);
        assert.ok(jitter < 0.01, `still moving after settling: ${jitter}`);
        assert.ok(arc < 120, `spread around the player, with a gap of ${arc}`);
        assert.ok(near > 1.5, 'nobody on top of the player');
        assert.ok(far < 10, 'nobody left far behind');
    });
}

test('at 10 frames a second, with hitches, it all works the same', () => {
    const g = makeWorld({ seed: 5 });
    const mobs = mixed.map((species, i) => g.spawn(species, 12 + (i % 5) * 0.8, 0.5 + Math.floor(i / 5) * 1.2));
    for (let t = 0; t < 90; t += 0.1) g.frame(Math.floor(t * 10) % 37 === 0 ? 0.3 : 0.1);
    const before = mobs.map((mob) => [mob.position.x, mob.position.z]);
    for (let t = 0; t < 10; t += 0.1) g.frame(0.1);
    const moved = maxOf(mobs.map((mob, i) => Math.hypot(mob.position.x - before[i][0], mob.position.z - before[i][1])));
    log(`[slow frames] overlap ${worstOverlap(g.game, mobs).toFixed(3)}, moved ${moved.toFixed(4)}`);
    assert.ok(worstOverlap(g.game, mobs) < 0.05);
    assert.ok(moved < 0.01);
});

test('20 giraffes: the outer ring is more than 6 blocks away and nobody takes that for being stuck', () => {
    const g = makeWorld({ renderDistance: 4 });
    const mobs = Array.from({ length: 20 }, (_, i) => g.spawn('giraffe', 3 + i * 0.5, 0.5));
    assert.ok(settle(g, mobs) < 120);
    let jumps = 0;
    const previous = new Map();
    for (let t = 0; t < 30; t += 1 / 30) {
        for (const mob of mobs) previous.set(mob, [mob.position.x, mob.position.z]);
        g.frame(1 / 30);
        for (const mob of mobs) {
            const [x, z] = previous.get(mob);
            if (Math.hypot(mob.position.x - x, mob.position.z - z) > 0.5) jumps++;
        }
    }
    const far = maxOf(mobs.map((mob) => Math.hypot(mob.position.x - 0.5, mob.position.z - 0.5)));
    log(`[giraffes] farthest ${far.toFixed(2)}, overlap ${worstOverlap(g.game, mobs).toFixed(3)}, teleports ${jumps}`);
    assert.equal(jumps, 0);
    assert.ok(worstOverlap(g.game, mobs) < 0.05);
});

test('a growing herd: one more animal only makes the others shuffle a little', () => {
    const g = makeWorld();
    const mobs = Array.from({ length: 8 }, (_, i) => g.spawn('sheep', 2 + i * 0.4, 0.5));
    assert.ok(settle(g, mobs) < 60);
    const newcomer = g.spawn('pig', 8, 8);
    const before = mobs.map((mob) => [mob.position.x, mob.position.z]);
    assert.ok(settle(g, [...mobs, newcomer]) < 60);
    const moved = mobs.map((mob, i) => Math.hypot(mob.position.x - before[i][0], mob.position.z - before[i][1]));
    log(`[newcomer] the others moved at most ${maxOf(moved).toFixed(2)}, overlap ${worstOverlap(g.game, [...mobs, newcomer]).toFixed(3)}`);
    assert.ok(worstOverlap(g.game, [...mobs, newcomer]) < 0.05);
    assert.ok(maxOf(moved) < 1.5, 'nobody crosses the ring');
});

test('turning on the spot and small steps do not stir them', () => {
    const g = makeWorld();
    const mobs = Array.from({ length: 10 }, (_, i) => g.spawn('sheep', 2 + i * 0.4, 0.5));
    assert.ok(settle(g, mobs) < 60);
    for (const yaw of [0, 1, 2, 3]) {
        g.camera.position.yaw = yaw;
        g.camera.position.x += 0.1;
        g.camera.position.z -= 0.05;
        g.run(0.5);
    }
    const paths = pathLengths(g, mobs, 3);
    log(`[small steps] moved at most ${maxOf([...paths.values()]).toFixed(4)}`);
    assert.ok(maxOf([...paths.values()]) < 0.01);
});

test('walking away with the herd, then stopping: they catch up and spread again', () => {
    const g = makeWorld({ renderDistance: 4 });
    const mobs = mixed.map((species, i) => g.spawn(species, 2 + (i % 5), 2 + Math.floor(i / 5)));
    g.run(10);
    for (let t = 0; t < 12; t += 1 / 30) {
        g.camera.position.x += 2 / 30;
        g.frame(1 / 30);
    }
    const seconds = settle(g, mobs);
    const overlap = worstOverlap(g.game, mobs);
    log(`[walk] after walking 24 blocks: settled in ${seconds.toFixed(1)} s, overlap ${overlap.toFixed(3)}, largest empty arc ${largestEmptyArc(g, mobs).toFixed(0)} deg`);
    assert.ok(seconds < 120);
    assert.ok(overlap < 0.05);
});

// ---- Walls, ledges, water ----

function room(half, height = 3) {
    const blocks = {};
    for (let i = -half; i <= half; i++) {
        for (let y = 0; y < height; y++) {
            blocks[`${i},${y},${-half}`] = 'stone';
            blocks[`${i},${y},${half}`] = 'stone';
            blocks[`${-half},${y},${i}`] = 'stone';
            blocks[`${half},${y},${i}`] = 'stone';
        }
    }
    return blocks;
}
const inside = (mob, half) => Math.abs(mob.position.x - 0.5) < half + 0.5 && Math.abs(mob.position.z - 0.5) < half + 0.5;

test('a small closed room: nobody goes through the walls, they do what they can, and it ends in stillness', () => {
    const half = 4; // 7 x 7 free cells
    const g = makeWorld({ blocks: room(half) });
    const mobs = Array.from({ length: 12 }, (_, i) => g.spawn(['sheep', 'pig', 'horse'][i % 3], -2.5 + (i % 4) * 1.5, -2.5 + Math.floor(i / 4) * 1.5));
    let escaped = 0;
    let inWall = 0;
    for (let t = 0; t < 90; t += 1 / 30) {
        g.frame(1 / 30);
        for (const mob of mobs) {
            if (!inside(mob, half)) escaped++;
            if (g.world.hasSolidBlock(Math.floor(mob.position.x), Math.floor(mob.position.y + 0.2), Math.floor(mob.position.z))) inWall++;
        }
    }
    const paths = pathLengths(g, mobs, 10);
    const overlap = worstOverlap(g.game, mobs);
    log(`[room] escaped ${escaped}, in a wall ${inWall}, overlap ${overlap.toFixed(3)}, moved in 10 s at most ${maxOf([...paths.values()]).toFixed(3)}, states ${mobs.map((mob) => mob.userData.herd.state[0]).join('')}`);
    assert.equal(escaped, 0);
    assert.equal(inWall, 0);
    assert.ok(overlap < 0.1, `overlap ${overlap}`);
    assert.ok(maxOf([...paths.values()]) < 1.5, 'at most an occasional try');
});

test('a corridor: the places that would be inside its walls move to where there is room', () => {
    const blocks = {};
    for (let i = -24; i <= 24; i++) {
        for (let y = 0; y < 3; y++) {
            blocks[`${i},${y},-2`] = 'stone';
            blocks[`${i},${y},3`] = 'stone';
        }
    }
    const g = makeWorld({ blocks });
    const mobs = Array.from({ length: 6 }, (_, i) => g.spawn('sheep', 3 + i * 1.5, 0.5));
    g.run(60);
    const paths = pathLengths(g, mobs, 10);
    log(`[corridor] z: ${mobs.map((mob) => mob.position.z.toFixed(2)).join(' ')}, x: ${mobs.map((mob) => mob.position.x.toFixed(2)).join(' ')}, overlap ${worstOverlap(g.game, mobs).toFixed(3)}, moved ${maxOf([...paths.values()]).toFixed(3)}`);
    assert.ok(mobs.every((mob) => mob.position.z > -1 && mob.position.z < 3), 'inside the corridor');
    assert.ok(worstOverlap(g.game, mobs) < 0.1);
    assert.ok(maxOf([...paths.values()]) < 1.5);
});

test('a wall between a follower and the player: it does not pass through, nor tread on the spot for ever', () => {
    const blocks = {};
    for (let i = -24; i <= 24; i++) for (let y = 0; y < 4; y++) blocks[`3,${y},${i}`] = 'stone';
    const g = makeWorld({ blocks });
    const mob = g.spawn('sheep', 4.6, 0.5);
    g.run(1);
    let crossed = false;
    for (let t = 0; t < 30; t += 1 / 30) {
        g.frame(1 / 30);
        if (mob.position.x < 4) crossed = true;
    }
    log(`[wall] at x ${mob.position.x.toFixed(2)}, state ${mob.userData.herd.state}`);
    assert.equal(crossed, false);
});

test('pushing each other at a wall does not put anybody through it, not even through a thin fence', () => {
    const blocks = {};
    for (let i = -24; i <= 24; i++) blocks[`3,0,${i}`] = 'oak_fence';
    const g = makeWorld({ blocks });
    const mobs = Array.from({ length: 6 }, () => g.spawn('horse', 2.7, 0.5));
    g.run(40);
    log(`[fence] x: ${mobs.map((mob) => mob.position.x.toFixed(2)).join(' ')}`);
    assert.ok(mobs.every((mob) => mob.position.x < 3.375), 'all on this side of the posts and rails');
    assert.ok(worstOverlap(g.game, mobs) < 0.1);
});

test('a ledge: places over the drop are not used and being pushed does not throw anybody off', () => {
    const removed = (x, y) => x >= 5; // a pit, all the way down
    const g = makeWorld({ removed, renderDistance: 3 });
    const mobs = Array.from({ length: 10 }, () => g.spawn('sheep', 4.5, 0.5));
    let lowest = 0;
    for (let t = 0; t < 60; t += 1 / 30) {
        g.frame(1 / 30);
        for (const mob of mobs) lowest = Math.min(lowest, mob.position.y);
    }
    const paths = pathLengths(g, mobs, 10);
    log(`[ledge] lowest y ${lowest.toFixed(3)}, largest x ${maxOf(mobs.map((mob) => mob.position.x)).toFixed(2)}, overlap ${worstOverlap(g.game, mobs).toFixed(3)}, moved ${maxOf([...paths.values()]).toFixed(3)}`);
    assert.ok(lowest > -0.01, `fell to ${lowest}`);
    assert.ok(mobs.every((mob) => mob.position.x < 5));
    assert.ok(worstOverlap(g.game, mobs) < 0.1);
    assert.ok(maxOf([...paths.values()]) < 1.5);
});

// A push held on for ten seconds, with nothing else going on.
function shove(g, mob, px, pz) {
    const body = { mob, herd: { px, pz } };
    for (let i = 0; i < 300; i++) g.game.herdApplyPush(body, 1 / 30);
}

test('a push alone does not climb a step, go through a fence, over a ledge, into water or over an unloaded chunk', () => {
    const blocks = {};
    for (let z = -24; z <= 24; z++) {
        blocks[`3,0,${z}`] = 'stone';
        blocks[`-4,0,${z}`] = 'oak_fence';
    }
    for (let x = -20; x <= 20; x++) for (let y = -2; y <= -1; y++) blocks[`${x},${y},-6`] = 'water';
    const g = makeWorld({ blocks, removed: (x, y, z) => z >= 6 });
    const position = (mob) => `${mob.position.x.toFixed(2)},${mob.position.y.toFixed(2)},${mob.position.z.toFixed(2)}`;

    const atStep = g.spawn('sheep', 2.5, 0.5);
    shove(g, atStep, 0.9, 0);
    log('[push] step', position(atStep));
    assert.ok(atStep.position.x < 3 && atStep.position.y === 0, 'stays below the step');

    const atFence = g.spawn('sheep', -2.5, 0.5);
    shove(g, atFence, -0.9, 0);
    log('[push] fence', position(atFence));
    assert.ok(atFence.position.x > -3.375, 'stays on its side');

    const atLedge = g.spawn('sheep', 0.5, 5.5);
    shove(g, atLedge, 0, 0.9);
    log('[push] ledge', position(atLedge));
    assert.ok(atLedge.position.z < 6 && atLedge.position.y === 0, 'stays up');

    const atPond = g.spawn('sheep', 0.5, -4.5);
    shove(g, atPond, 0, -0.9);
    log('[push] pond', position(atPond));
    assert.ok(atPond.position.z > -5, 'stays dry');

    const atStepDiagonal = g.spawn('sheep', 2.5, 2.5);
    shove(g, atStepDiagonal, 0.6, 0.6);
    log('[push] sliding along the step', position(atStepDiagonal));
    assert.ok(atStepDiagonal.position.x < 3 && atStepDiagonal.position.z > 3.5, 'slides along it');

    const edge = makeWorld({ renderDistance: 1 });
    edge.world.update = () => {};
    edge.world.columns.delete(edge.world.chunkKey(1, 0));
    const atEdge = edge.spawn('sheep', 15.5, 8.5);
    shove(edge, atEdge, 0.9, 0);
    log('[push] unloaded chunk', position(atEdge));
    assert.ok(atEdge.position.x < 16 && atEdge.position.y === 0, 'stays on what is loaded');
});

test('water: places in a pond are not used and nobody is pushed in', () => {
    const blocks = {};
    for (let x = 5; x <= 20; x++) for (let z = -20; z <= 20; z++) blocks[`${x},-1,${z}`] = 'water';
    const g = makeWorld({ blocks });
    const mobs = Array.from({ length: 10 }, () => g.spawn('sheep', 4.4, 0.5));
    let wet = 0;
    for (let t = 0; t < 60; t += 1 / 30) {
        g.frame(1 / 30);
        for (const mob of mobs) {
            if (g.game.findWaterSurface(mob.position.x, mob.position.y + 0.1, mob.position.z) !== null) wet++;
        }
    }
    log(`[water] frames in the water ${wet}, largest x ${maxOf(mobs.map((mob) => mob.position.x)).toFixed(2)}, overlap ${worstOverlap(g.game, mobs).toFixed(3)}`);
    assert.equal(wet, 0);
    assert.ok(worstOverlap(g.game, mobs) < 0.1);
});

// ---- Everybody else ----

test('a seated animal stays where it was told, and the others go around it', () => {
    const g = makeWorld();
    const seated = g.spawn('sheep', 2.9, 0.5);
    g.game.tamingSetSitting(seated, true);
    const mobs = Array.from({ length: 10 }, (_, i) => g.spawn('pig', 8 + i * 0.3, 0.5));
    const where = [seated.position.x, seated.position.z];
    g.run(90);
    const all = [seated, ...mobs];
    log(`[seated] moved ${Math.hypot(seated.position.x - where[0], seated.position.z - where[1]).toFixed(4)}, overlap ${worstOverlap(g.game, all).toFixed(3)}`);
    assert.deepEqual([seated.position.x, seated.position.z], where);
    assert.ok(worstOverlap(g.game, all) < 0.1);
    g.game.tamingSetSitting(seated, false);
    g.run(30);
    assert.ok(worstOverlap(g.game, all) < 0.05, 'standing up again it joins them');
});

test('a resting wild animal in the way does not budge, and a grazing one is not pushed', () => {
    const g = makeWorld();
    const camel = g.spawn('camel', 2.8, 0.5, { tamed: false });
    camel.userData.resting = 1000;
    camel.userData.moveTimer = 1000;
    const mobs = Array.from({ length: 8 }, (_, i) => g.spawn('sheep', 7 + i * 0.3, 0.5));
    const where = [camel.position.x, camel.position.z];
    g.run(60);
    log(`[wild rest] moved ${Math.hypot(camel.position.x - where[0], camel.position.z - where[1]).toFixed(4)}, overlap ${worstOverlap(g.game, [camel, ...mobs]).toFixed(3)}`);
    assert.deepEqual([camel.position.x, camel.position.z], where);
    assert.ok(worstOverlap(g.game, [camel, ...mobs]) < 0.05);
});

test('wild animals: with followers about or not, herd.js does not change where they go', () => {
    const track = (withHerd) => {
        const g = makeWorld({ seed: 7 });
        if (!withHerd) g.game.herdUpdate = () => {};
        const wild = Array.from({ length: 12 }, (_, i) => g.spawn('sheep', 20 + i * 0.5, 20, { tamed: false }));
        g.run(60);
        return wild.map((mob) => [mob.position.x, mob.position.z].join());
    };
    assert.deepEqual(track(true), track(false));
});

test('a world with no tamed animals costs nothing beyond one look', () => {
    const g = makeWorld();
    Array.from({ length: 30 }, (_, i) => g.spawn('sheep', 5 + i * 0.3, 5, { tamed: false }));
    let grids = 0;
    g.game.herdBuildGrid = () => { grids++; };
    g.run(2);
    assert.equal(grids, 0);
});

test('riding: the mount is not pushed, the herd keeps a ring around horse and rider', () => {
    const g = makeWorld();
    const { game, camera, cameraController: cc } = g;
    const horse = g.spawn('horse', 0.5, 0.5);
    game.animateMount = () => {};
    cc.setMount(ctx.getMobSpecies('horse').mount);
    camera.position.set(0.5, cc.eyeHeight, 0.5);
    game.ridingMob = horse;
    horse.userData.rider = true;
    horse.userData.clop = 0;
    const mobs = Array.from({ length: 10 }, (_, i) => g.spawn('sheep', 3 + i * 0.3, 0.5));
    assert.ok(settle(g, mobs) < 80);
    const near = Math.min(...mobs.map((mob) => Math.hypot(mob.position.x - horse.position.x, mob.position.z - horse.position.z)));
    log(`[riding] nearest to the mount ${near.toFixed(2)}, overlap ${worstOverlap(game, [horse, ...mobs]).toFixed(3)}, horse at ${horse.position.x},${horse.position.z}`);
    assert.ok(worstOverlap(game, [horse, ...mobs]) < 0.05);
    assert.equal(horse.position.x, camera.position.x);
    assert.equal(horse.position.z, camera.position.z);

    game.ridingMob = null;
    horse.userData.rider = false;
    assert.ok(settle(g, [horse, ...mobs]) < 80, 'dismounted, it joins the herd');
    assert.ok(worstOverlap(game, [horse, ...mobs]) < 0.05);
});

test('babies stay around their parent, apart from it and from each other', () => {
    const g = makeWorld();
    const { game } = g;
    const parent = g.spawn('horse', 3, 0.5);
    const others = [g.spawn('sheep', 5, 2), g.spawn('sheep', 5, -2)];
    const babies = Array.from({ length: 4 }, (_, i) => {
        const baby = game.tamingSpawnBaby('horse', new Vector3(3.2, 0, 0.5 + i * 0.1), 0, 0, 'me');
        baby.userData.tamingParent = parent;
        return baby;
    });
    const all = [parent, ...others, ...babies];
    g.run(60);
    const paths = pathLengths(g, all, 10);
    const far = maxOf(babies.map((baby) => Math.hypot(baby.position.x - parent.position.x, baby.position.z - parent.position.z)));
    log(`[babies] baby radius ${game.herdRadius(babies[0]).toFixed(2)}, farthest from the parent ${far.toFixed(2)}, overlap ${worstOverlap(game, all).toFixed(3)}, moved ${maxOf([...paths.values()]).toFixed(4)}`);
    assert.ok(worstOverlap(game, all) < 0.05);
    assert.ok(far < 3);
    assert.ok(maxOf([...paths.values()]) < 0.5);
});

test('two in love still get together, however big they are', () => {
    const g = makeWorld();
    const { game } = g;
    const a = g.spawn('giraffe', 3, 0.5);
    const b = g.spawn('giraffe', 6, 0.5);
    Array.from({ length: 4 }, (_, i) => g.spawn('sheep', 4.5, -2 + i));
    g.run(10);
    a.userData.tamingLove = 60;
    b.userData.tamingLove = 60;
    let born = false;
    for (let t = 0; t < 40 && !born; t += 1 / 30) {
        g.frame(1 / 30);
        born = game.ambientMobs.length > 6;
    }
    log(`[love] baby born: ${born}, parents ${a.position.distanceTo(b.position).toFixed(2)} apart`);
    assert.ok(born, `a baby was born (they are ${a.position.distanceTo(b.position)} apart)`);
    g.run(40);
    assert.ok(worstOverlap(game, game.ambientMobs) < 0.05);
});

test('flying followers: their own ring up there, over the others\' heads but not through a giraffe', () => {
    const g = makeWorld();
    const macaws = Array.from({ length: 8 }, () => g.spawn('macaw', 4, 4));
    const sheep = Array.from({ length: 4 }, () => g.spawn('sheep', 4, -4));
    const giraffe = g.spawn('giraffe', -4, 0.5);
    const all = [...macaws, ...sheep, giraffe];
    assert.ok(settle(g, all) < 90);
    const paths = pathLengths(g, macaws, 10);
    const heights = macaws.map((mob) => mob.position.y);
    log(`[macaws] heights ${Math.min(...heights).toFixed(2)}..${maxOf(heights).toFixed(2)}, overlap ${worstOverlap(g.game, all).toFixed(3)}, moved ${maxOf([...paths.values()]).toFixed(4)}`);
    assert.ok(worstOverlap(g.game, all) < 0.05);
    assert.ok(maxOf([...paths.values()]) < 0.01);
    assert.ok(Math.min(...heights) > 1.9, 'still flying');
});

test('goats, with their own way of walking, settle as well', () => {
    const g = makeWorld();
    const goats = Array.from({ length: 10 }, (_, i) => g.spawn('goat', 6 + i * 0.2, 0.5));
    const seconds = settle(g, goats);
    g.run(3);
    const paths = pathLengths(g, goats, 10);
    log(`[goats] settled in ${seconds.toFixed(1)} s, overlap ${worstOverlap(g.game, goats).toFixed(3)}, moved ${maxOf([...paths.values()]).toFixed(4)}`);
    assert.ok(seconds < 60);
    assert.ok(worstOverlap(g.game, goats) < 0.05);
    assert.ok(maxOf([...paths.values()]) < 0.01);
});

test('the friendly dog, walked by mobs.js, is not pushed, and the others keep out of its way', () => {
    const g = makeWorld();
    const { game } = g;
    const dog = g.spawn('dog', 6, 6, { tamed: false });
    const mobs = Array.from({ length: 8 }, (_, i) => g.spawn('sheep', 4 + i * 0.3, 0.5));
    assert.ok(settle(g, mobs) < 90);
    g.run(10);
    log(`[dog] following: ${game.followingDog === dog}, ${Math.hypot(dog.position.x - 0.5, dog.position.z - 0.5).toFixed(2)} from the player, overlap ${worstOverlap(game, [dog, ...mobs]).toFixed(3)}`);
    assert.equal(game.followingDog, dog);
    assert.ok(worstOverlap(game, [dog, ...mobs]) < 0.05);
});

// ---- Left behind ----

test('left far behind, they catch up on free spots, not in one heap', () => {
    const g = makeWorld({ renderDistance: 4 });
    const mobs = mixed.slice(0, 14).map((species, i) => g.spawn(species, 3 + i * 0.3, 0.5));
    g.run(5);
    g.camera.position.x += 34;
    g.camera.position.z += 3;
    g.run(1 / 30 * 3);
    const overlap = worstOverlap(g.game, mobs);
    const far = maxOf(mobs.map((mob) => Math.hypot(mob.position.x - g.camera.position.x, mob.position.z - g.camera.position.z)));
    log(`[catch up] right after: farthest ${far.toFixed(2)}, overlap ${overlap.toFixed(3)}`);
    assert.ok(far < 12, 'they all came');
    assert.ok(overlap < 0.05, `overlap ${overlap}`);
    assert.ok(mobs.every((mob) => Math.abs(mob.position.y) < 0.01));
    assert.ok(settle(g, mobs) < 60);
});

test('stuck far behind a wall for good: the teleport still gets it out, to a free spot', () => {
    const blocks = {};
    for (let i = -30; i <= 30; i++) for (let y = 0; y < 4; y++) blocks[`8,${y},${i}`] = 'stone';
    const g = makeWorld({ blocks, renderDistance: 3 });
    const herd = Array.from({ length: 5 }, (_, i) => g.spawn('sheep', 2.5, -2 + i));
    g.run(20);
    const lost = g.spawn('sheep', 12, 0.5);
    g.run(35);
    log(`[stuck] x ${lost.position.x.toFixed(2)}, overlap ${worstOverlap(g.game, [...herd, lost]).toFixed(3)}`);
    assert.ok(lost.position.x < 8, 'it came');
    assert.ok(worstOverlap(g.game, [...herd, lost]) < 0.05);
});

// ---- Chunks that are not loaded ----

test('reconnection: the herd waits as it is, nobody falls or wanders, and goes on when the chunks are back', () => {
    const g = makeWorld();
    const mobs = mixed.slice(0, 12).map((species, i) => g.spawn(species, 3 + i * 0.3, 0.5));
    assert.ok(settle(g, mobs) < 90);
    const before = mobs.map((mob) => [mob.position.x, mob.position.y, mob.position.z]);
    g.world.resetFromServer();
    g.run(5, 1 / 30, { chunksArrive: false });
    const moved = mobs.map((mob, i) => Math.hypot(mob.position.x - before[i][0], mob.position.y - before[i][1], mob.position.z - before[i][2]));
    log(`[reconnect] moved at most ${maxOf(moved)} in 5 s with no chunks`);
    assert.equal(maxOf(moved), 0);
    g.run(5);
    assert.ok(g.world.columns.size > 0);
    assert.ok(mobs.every((mob) => Math.abs(mob.position.y) < 0.01));
    assert.ok(worstOverlap(g.game, mobs) < 0.05);
});

test('the edge of the loaded area: no place beyond it, no push over it, and whoever is out there waits', () => {
    const g = makeWorld({ x: 0.5, z: 0.5, renderDistance: 1 });
    const { world, game } = g;
    const frozenKey = world.chunkKey(1, 0);
    world.columns.delete(frozenKey);
    world.generatedChunks.delete(frozenKey);
    const originalUpdate = world.update.bind(world);
    world.update = () => {}; // that chunk stays away
    g.camera.position.set(13.5, EYE + 0.01, 8.5);
    const beyond = g.spawn('sheep', 18.5, 8.5, { y: 0 });
    g.game.tamingSetSitting(beyond, true);
    const where = [beyond.position.x, beyond.position.y, beyond.position.z];
    const mobs = Array.from({ length: 10 }, () => g.spawn('sheep', 15.2, 8.5));
    for (let t = 0; t < 40; t += 1 / 30) {
        g.frame(1 / 30, { chunksArrive: false });
        assert.ok(mobs.every((mob) => mob.position.x < 16), 'nobody over the edge');
    }
    log(`[edge] largest x ${maxOf(mobs.map((mob) => mob.position.x)).toFixed(2)}, overlap ${worstOverlap(game, mobs).toFixed(3)}`);
    assert.deepEqual([beyond.position.x, beyond.position.y, beyond.position.z], where);
    assert.ok(worstOverlap(game, mobs) < 0.1);
    world.update = originalUpdate;
});

// ---- Cost ----

test('the neighbour checks grow with the herd, not with its square', () => {
    const measure = (count) => {
        const g = makeWorld({ renderDistance: 4 });
        const side = Math.ceil(Math.sqrt(count));
        const mobs = Array.from({ length: count }, (_, i) => g.spawn('sheep', -20 + (i % side) * 1.7, -20 + Math.floor(i / side) * 1.7));
        g.run(1);
        g.game.herdChecks = 0;
        let ticks = 0;
        const tick = g.game.herdTick.bind(g.game);
        let spent = 0n;
        g.game.herdTick = (dt) => {
            ticks++;
            const start = process.hrtime.bigint();
            tick(dt);
            spent += process.hrtime.bigint() - start;
        };
        g.run(3);
        return { count, perFollower: g.game.herdChecks / ticks / mobs.length, msPerTick: Number(spent) / 1e6 / ticks };
    };
    const small = measure(20);
    const big = measure(200);
    log(`[cost] 20 followers: ${small.perFollower.toFixed(1)} candidates each per tick, ${small.msPerTick.toFixed(3)} ms a tick; 200: ${big.perFollower.toFixed(1)}, ${big.msPerTick.toFixed(3)} ms`);
    assert.ok(big.perFollower < 200 / 3, 'bounded by how many fit nearby, not by the size of the herd');
});
