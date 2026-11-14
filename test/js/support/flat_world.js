// A flat world to try what a mob does, for the test of a species: the real scripts of index.html (mobs.js,
// taming.js, herd.js, camera.js, world.js and the species' own) run in a VM, on grass with its top at y = 0,
// with a player standing on it. Only drawing and sound are left out; a mob is built by its real model.
// Not a test: `node --test 'test/js/*.test.js'` does not pick this folder up.
//
//   const ctx = loadFlatGame({ listenersOf: ['js/game/kubanochoerus.js'], frameUpdates: ['kubanochoerusUpdate'] });
//   const g = makeFlatWorld(ctx, { x: 0.5, z: 0.5, blocks: { '3,0,0': 'oak_fence' } });
//   const mob = g.spawn('kubanochoerus', 4.5, 0.5);
//   g.run(2);                       // two seconds of the game, at 30 frames a second
//   g.hurt, g.shoved, g.said        // what the player took, where they were pushed, what the chat said

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC, JS, anyStub } = require('./game.js');
const print = require(path.join(JS, 'guidePrint.js'));

const EYE = 1.62;

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
function canvasStub() {
    const ctx = new Proxy({}, {
        get: (target, key) => (key in target ? target[key] : () => ({ data: new Uint8ClampedArray(4 * 4096), addColorStop() {} })),
        set: (target, key, value) => { target[key] = value; return true; }
    });
    return { width: 16, height: 16, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,' };
}

// The game's scripts in a VM. Of everything that listens to the mobs (onMobEvent) only the listeners of the
// files in `listenersOf` are kept, and of what runs after the mobs each frame only taming, the herd and the
// methods of Game named in `frameUpdates`: the rest need a whole game.
function loadFlatGame({ listenersOf = [], frameUpdates = [] } = {}) {
    const THREE = new Proxy({ Vector3, Vector2: Vector3, Vector4: Vector3, Object3D, Group: Object3D, Mesh: class extends Object3D {} },
        { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const context = vm.createContext({
        console: { ...console, warn() {} }, performance: { now: () => 0 }, THREE, navigator: {}, requestAnimationFrame: () => 0,
        Worker: class { postMessage() {} terminate() {} }, setTimeout() {}, TextDecoder,
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; } },
        document: { createElement: (tag) => (tag === 'canvas' ? canvasStub() : anyStub()), addEventListener() {}, body: anyStub(), head: anyStub(), getElementById: () => null, querySelector: () => null },
        addEventListener() {},
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
    });
    context.window = context;
    vm.runInContext('class Game {}\nconst FLAT_WORLD_LISTENERS = {};', context);
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1])
        .filter((src) => !/^(https?:)?\/\//.test(src) && !print.SKIP_SCRIPTS.test(src));
    for (const src of listenersOf) assert.ok(scripts.includes(src), `${src} is not a script of index.html`);
    const forget = 'for (const key of Object.keys(MOB_EVENT_LISTENERS)) delete MOB_EVENT_LISTENERS[key];';
    for (const src of scripts) {
        const kept = listenersOf.includes(src);
        if (kept) vm.runInContext(forget, context);
        vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
        if (kept) vm.runInContext('for (const [event, list] of Object.entries(MOB_EVENT_LISTENERS)) (FLAT_WORLD_LISTENERS[event] = FLAT_WORLD_LISTENERS[event] || []).push(...list);', context);
    }
    vm.runInContext(`${forget}
        Object.assign(MOB_EVENT_LISTENERS, FLAT_WORLD_LISTENERS);
        FRAME_UPDATERS.length = 0;
        for (const name of ${JSON.stringify(['tamingUpdate', 'herdUpdate', ...frameUpdates])}) FRAME_UPDATERS.push(function (delta) { this[name](delta); });
        Object.assign(this, { WorldRenderer, ChunkColumn, Game, CameraController, MOB_SPECIES, MOB_GOAL_PROVIDERS, TAMING_DIET, TRAPS_SPECIES, getMobSpecies, mobMovementIs });`, context);
    return context;
}

// A flat world (grass with its top at y = 0) with the player at (x, z), standing and loaded. `blocks` shapes
// it: 'x,y,z' cells. Math.random gives the same numbers every run.
function makeFlatWorld(ctx, { x = 0.5, z = 0.5, blocks = {}, seed = 1 } = {}) {
    vm.runInContext(`(() => { let s = ${seed} >>> 0; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })()`, ctx);
    const scene = new Object3D();
    const world = new ctx.WorldRenderer(scene);
    world.renderDistance = 3;
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

    const said = [];
    const hurt = [];
    const shoved = [];
    cameraController.applyKnockback = (dirX, dirZ, strength, lift) => shoved.push({ dirX, dirZ, strength, lift });
    const game = new ctx.Game();
    Object.assign(game, {
        world, scene, camera, cameraController, ambientMobs: [], mobSpawnedChunks: new Set(), mobSpawnTimer: 0, mobTextureCache: new Map(),
        titleScreenOpen: false, respawnPending: false, weatherState: 'clear', timeOfDay: 0.3, otherPlayerMeshes: new Map(),
        network: { connected: false, send() {} }, playerName: 'me', creativeMode: false,
        getLocalPlayerPosition: () => camera.position,
        createModelMaterial: () => ({ dispose() {} }), tagModelMeshes() {},
        createMobHealthBar: () => new Object3D(), updateMobHealthBar() {},
        isNightTime: () => false, playTone() {}, playNoiseBurst() {}, playPlaceSound() {}, offhandNoteStrike() {},
        receiveSystemMessage: (message) => said.push(message.text),
        applyDamage: (amount, reason, type, source) => hurt.push({ amount, reason, type, source: source ? { x: source.x, z: source.z } : null }),
        spawnMobsForChunk() {}, updateNaturalSpawning() {}, updateDroppedTails() {}, updatePoison() {},
        updateShadowSpawning() {}, updateSmokePuffs() {}, tamingSave() {}, tamingUpdateParticles() {}, tamingHearts() {}, tamingChirp() {}, tamingSmoke() {}
    });

    function columnFor(chunkX, chunkZ) {
        const column = new ctx.ChunkColumn(chunkX, chunkZ);
        for (let lx = 0; lx < 16; lx++) {
            for (let lz = 0; lz < 16; lz++) {
                for (let y = -16; y <= -1; y++) column.set(lx, y, lz, grass);
            }
        }
        for (const [cell, type] of Object.entries(blocks)) {
            const [bx, by, bz] = cell.split(',').map(Number);
            if (Math.floor(bx / 16) !== chunkX || Math.floor(bz / 16) !== chunkZ) continue;
            const lx = ((bx % 16) + 16) % 16;
            const lz = ((bz % 16) + 16) % 16;
            // 'air' digs a hole in the grass.
            column.set(lx, by, lz, type === 'air' ? 0 : world.registry.id(type));
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

    // A mob on the ground at (sx, sz): wild and no chunk's (it stays when the player walks off), or tamed.
    const spawn = (species, sx, sz, { tamed = false, variant = 0 } = {}) => {
        const mob = game.createMob(species, new Vector3(sx, cameraController.getFloorY(sx, sz, 40), sz), { variant });
        if (tamed) game.tamingTame(mob, { quiet: true });
        game.ambientMobs.push(mob);
        return mob;
    };
    // Another player, as this client sees them: an avatar with its feet at (ax, 0, az).
    const avatar = (id, ax, az) => {
        const mesh = new Object3D();
        mesh.position.set(ax, 0, az);
        game.otherPlayerMeshes.set(id, mesh);
        return mesh;
    };
    // The player of this browser, put somewhere else.
    const stand = (px, pz) => camera.position.set(px, EYE + 0.01, pz);
    const frame = (delta = 1 / 30) => {
        game.updateAmbientMobs(delta);
        world.update(camera.position.x, camera.position.z);
        deliver();
    };
    const run = (seconds, delta = 1 / 30) => {
        for (let t = 0; t < seconds - 1e-9; t += delta) frame(delta);
    };
    return { game, world, camera, cameraController, spawn, avatar, stand, frame, run, said, hurt, shoved };
}

module.exports = { EYE, Vector3, Object3D, loadFlatGame, makeFlatWorld };
