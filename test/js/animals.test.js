// Node tests for the animals the server keeps, as a client sees them (js/game/animals.js, and what taming.js,
// riding.js and websocket.js do for them), against the frames pkg/network/animals.go writes. The real mobs.js,
// taming.js, herd.js, animals.js, camera.js and world.js run on a flat world; only drawing and sound are left out.
// Run with: node --test test/js/animals.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { ROOT, STATIC, JS, anyStub } = require('./support/game.js');
const print = require(path.join(JS, 'guidePrint.js'));
const plain = (value) => JSON.parse(JSON.stringify(value));

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
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

// The browser's localStorage, which a second page of the same test shares.
const storage = new Map();
const TAMED_KEY = 'minecloud-tamed-mobs';

function loadGame() {
    const THREE = new Proxy({ Vector3, Vector2: Vector3, Vector4: Vector3, Object3D, Group: Object3D, Mesh: class extends Object3D {} },
        { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const context = vm.createContext({
        console: { ...console, warn() {} }, performance: { now: () => 0 }, THREE, navigator: {}, requestAnimationFrame: () => 0,
        Worker: class { postMessage() {} terminate() {} }, setTimeout() {}, TextDecoder,
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
    for (const src of scripts) {
        // Of everything that listens to the mobs, only this file's listeners run here: the others need a whole game.
        if (src === 'js/game/animals.js') vm.runInContext('for (const key of Object.keys(MOB_EVENT_LISTENERS)) delete MOB_EVENT_LISTENERS[key];', context);
        vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
        if (src === 'js/game/animals.js') vm.runInContext('const ANIMALS_LISTENERS = { ...MOB_EVENT_LISTENERS };', context);
    }
    vm.runInContext(`for (const key of Object.keys(MOB_EVENT_LISTENERS)) delete MOB_EVENT_LISTENERS[key];
        Object.assign(MOB_EVENT_LISTENERS, ANIMALS_LISTENERS);
        Object.assign(this, { WorldRenderer, ChunkColumn, Game, CameraController, animalsReadFrame, animalsChaseOf, ANIMALS, ANIMALS_MODE, TAMING, MOB_BEHAVIOURS });
        FRAME_UPDATERS.length = 0;
        FRAME_UPDATERS.push(function (delta) { this.tamingUpdate(delta); });
        FRAME_UPDATERS.push(function (delta) { this.herdUpdate(delta); });
        FRAME_UPDATERS.push(function (delta) { this.animalsUpdate(delta); });`, context);
    return context;
}
const ctx = loadGame();
const MODE = ctx.ANIMALS_MODE;
const EYE = 1.62;
const ME = 'player_me';

function seedRandom(seed) {
    vm.runInContext(`(() => { let s = ${seed} >>> 0; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })()`, ctx);
}

// A flat world (grass with its top at y = 0) with the player at (x, z), connected, and nothing said by the
// server yet. `blocks` shapes it: 'x,y,z' cells. With `chunksArrive` false the ground comes only when asked.
function makeWorld({ x = 0.5, z = 0.5, blocks = {}, chunksArrive = true, seed = 1 } = {}) {
    seedRandom(seed);
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

    const sent = [];
    const said = [];
    const game = new ctx.Game();
    Object.assign(game, {
        world, scene, camera, cameraController, ambientMobs: [], mobSpawnedChunks: new Set(), mobSpawnTimer: 0,
        titleScreenOpen: false, respawnPending: false, weatherState: 'clear', timeOfDay: 0.3, otherPlayerMeshes: new Map(),
        network: { connected: true, playerId: ME, send: (type, payload) => sent.push([type, plain(payload)]) },
        playerName: 'Yo', creativeMode: false,
        getLocalPlayerPosition: () => camera.position,
        attachMobModel: (group) => {
            Object.assign(group.userData, { legs: [], arms: [], wings: [], tail: [], head: null, modelRoot: null, modelParts: {}, legAxis: 'x' });
            return { height: 1 };
        },
        createMobHealthBar: () => new Object3D(), updateMobHealthBar() {},
        isNightTime: () => false, playTone() {}, playNoiseBurst() {}, playPlaceSound() {}, offhandNoteStrike() {},
        receiveSystemMessage: (message) => said.push(message.text),
        spawnMobsForChunk() {}, updateNaturalSpawning() {}, updateDroppedTails() {}, updatePoison() {},
        updateShadowSpawning() {}, updateSmokePuffs() {}, tamingUpdateParticles() {}, tamingHearts() {}, tamingChirp() {}, tamingSmoke() {}
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
    if (chunksArrive) {
        for (let i = 0; i < 60; i++) {
            world.update(x, z);
            deliver();
        }
        assert.ok(world.getColumnAt(Math.floor(x), Math.floor(z)), 'the ground is there');
    }
    // The socket opens: what the game does on 'connected'.
    game.animalsForgetAll();

    const frame = (delta = 1 / 30, arrive = chunksArrive) => {
        game.updateAmbientMobs(delta);
        world.update(camera.position.x, camera.position.z);
        if (arrive) deliver();
    };
    const run = (seconds, delta = 1 / 30, arrive = chunksArrive) => {
        for (let t = 0; t < seconds - 1e-9; t += delta) frame(delta, arrive);
    };
    const hear = (told) => game.animalsOnFrame(frameOf(told));
    const mobOf = (id) => game.ambientMobs.find((mob) => mob.userData.animalId === id && mob.userData.animal) || null;
    const sentOf = (type) => sent.filter(([kind]) => kind === type).map(([, payload]) => payload);
    const avatar = (id, ax, az) => {
        const mesh = new Object3D();
        mesh.position.set(ax, 0, az);
        game.otherPlayerMeshes.set(id, mesh);
        return mesh;
    };
    return { game, world, camera, cameraController, frame, run, deliver, hear, mobOf, sent, sentOf, said, avatar };
}

// A frame as pkg/network/animals.go writes it, from places in blocks. A new animal: { id, species, at: [x, y, z],
// home, variant, mode, target (the page id of the player it is after, in chase mode), hurt, walk: [x, z], owner (its
// page id; '' while away), ownerName, extra, walked }. A change: { id, of: its home, home, place, walk, mode, target,
// hurt, owner, ownerName, extra }.
function frameOf({ fresh = [], changed = [], gone = [] }) {
    const out = [77, 67, 65, 49];
    const uvarint = (value) => {
        while (value >= 128) {
            out.push((value % 128) | 128);
            value = Math.floor(value / 128);
        }
        out.push(value);
    };
    const varint = (value) => uvarint(value < 0 ? -value * 2 - 1 : value * 2);
    const text = (value) => {
        const bytes = Buffer.from(value, 'utf8');
        uvarint(bytes.length);
        out.push(...bytes);
    };
    const quarter = (value) => Math.round(value * 4);
    const place = (at, home = [0, 0, 0]) => at.forEach((value, i) => varint(quarter(value) - quarter(home[i])));
    const walk = (to, home) => {
        varint(quarter(to[0]) - quarter(home[0]));
        varint(quarter(to[1]) - quarter(home[2]));
    };
    uvarint(fresh.length);
    for (const animal of fresh) {
        const home = animal.home || animal.at;
        uvarint(animal.id);
        text(animal.species);
        out.push(animal.variant || 0, animal.mode || 0);
        if (animal.mode === 4) text(animal.target || '');
        out.push((animal.walk ? 1 : 0) | (animal.owner !== undefined ? 2 : 0) | (animal.extra ? 4 : 0) | (animal.walked ? 8 : 0));
        place(home);
        place(animal.at, home);
        uvarint(animal.hurt || 0);
        if (animal.walk) walk(animal.walk, home);
        if (animal.owner !== undefined) {
            text(animal.owner);
            text(animal.ownerName || '');
        }
        if (animal.extra) text(JSON.stringify(animal.extra));
    }
    uvarint(changed.length);
    for (const change of changed) {
        const home = change.home || change.of;
        uvarint(change.id);
        out.push((change.home ? 1 : 0) | (change.place ? 2 : 0) | (change.walk ? 4 : 0) | (change.mode !== undefined ? 8 : 0) |
            (change.hurt !== undefined ? 16 : 0) | (change.owner !== undefined ? 32 : 0) | (change.extra !== undefined ? 64 : 0));
        if (change.home) place(change.home);
        if (change.place) place(change.place, home);
        if (change.walk) walk(change.walk, home);
        if (change.mode !== undefined) {
            out.push(change.mode);
            if (change.mode === 4) text(change.target || '');
        }
        if (change.hurt !== undefined) uvarint(change.hurt);
        if (change.owner !== undefined) {
            text(change.owner);
            text(change.ownerName || '');
        }
        if (change.extra !== undefined) text(change.extra ? JSON.stringify(change.extra) : '');
    }
    uvarint(gone.length);
    gone.forEach(uvarint);
    return new Uint8Array(out).buffer;
}

const pig = (id, x, z, more = {}) => ({ id, species: 'pig', at: [x, 0, z], walked: true, ...more });
// A hostile animal that the server walks: after nobody, unless `more` says the mode and whom.
const spider = (id, x, z, more = {}) => ({ id, species: 'spider', at: [x, 0, z], walked: true, ...more });

// ---- The frame ----

// The bytes of TestAFrameIsTheseBytes (pkg/network/animals_test.go): one frame, written there and read here.
const GOLDEN = '4d434131' + '03' +
    '07' + '03706967' + '020009' + '5080041b' + '040002' + '05' + '0c11' +
    'ac02' + '05686f727365' + '010106' + 'a101b404a006' + '000000' + '00' + '0b706c617965725f61623132' + '03416e61' + '0b7b22616765223a3132307d' +
    '09' + '06737069646572' + '0004' + '08706167655f416e61' + '08' + '10800410' + '080004' + '00' +
    '05' +
    '07' + '04' + '0c11' +
    '08' + '12' + '030002' + '09' +
    'ac02' + '69' + 'a201b8049f06' + '03' + '08706167655f416e61' + '03416e61' + '0b7b22616765223a3138307d' +
    '09' + '08' + '04' + '09706167655f4265746f' +
    '0a' + '0e' + '90010000' + '4000' + '00' +
    '02' + '05' + 'e807';

test('the frame the server writes is the frame this client reads: the same bytes in both tests', () => {
    const go = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'animals_test.go'), 'utf8');
    const block = /const animalsGoldenFrame = ([^]*?)\n\n/.exec(go);
    assert.ok(block, 'the golden frame of the Go test');
    assert.equal([...block[1].matchAll(/"([0-9a-f]+)"/g)].map((match) => match[1]).join(''), GOLDEN, 'the Go test and this one pin different bytes');

    const frame = plain(ctx.animalsReadFrame(new Uint8Array(Buffer.from(GOLDEN, 'hex')).buffer));
    assert.deepEqual(frame.fresh, [
        {
            id: 7, species: 'pig', variant: 2, mode: MODE.roam, target: '', home: { x: 10, y: 64, z: -3.5 }, place: { x: 0.5, y: 0, z: 0.25 }, hurt: 5,
            walk: { x: 6, z: -9 }, owned: false, session: '', ownerName: '', extra: '', walked: true
        },
        {
            id: 300, species: 'horse', variant: 1, mode: MODE.stay, target: '', home: { x: -20.25, y: 70.5, z: 100 }, place: { x: 0, y: 0, z: 0 }, hurt: 0,
            walk: null, owned: true, session: 'player_ab12', ownerName: 'Ana', extra: '{"age":120}', walked: false
        },
        // One that is after a player: whom comes right after its mode.
        {
            id: 9, species: 'spider', variant: 0, mode: MODE.chase, target: 'page_Ana', home: { x: 2, y: 64, z: 2 }, place: { x: 1, y: 0, z: 0.5 }, hurt: 0,
            walk: null, owned: false, session: '', ownerName: '', extra: '', walked: true
        }
    ]);
    assert.deepEqual(frame.changed, [
        { id: 7, walk: { x: 6, z: -9 } },
        { id: 8, place: { x: -0.5, y: 0, z: 0.25 }, hurt: 9 },
        { id: 300, home: { x: 20.25, y: 71, z: -100 }, mode: MODE.ridden, target: '', session: 'page_Ana', ownerName: 'Ana', extra: '{"age":180}' },
        // Another player to go after, and the end of a chase: where it left the animal, and its walk home.
        { id: 9, mode: MODE.chase, target: 'page_Beto' },
        { id: 10, place: { x: 18, y: 0, z: 0 }, walk: { x: 32, z: 0 }, mode: MODE.roam, target: '' }
    ]);
    assert.deepEqual(frame.gone, [5, 1000]);
});

test('what the test writes here is what the server writes, and a frame that is not whole is not read', () => {
    const written = frameOf({
        fresh: [
            { id: 7, species: 'pig', variant: 2, at: [10.5, 64, -3.25], home: [10, 64, -3.5], hurt: 5, walk: [11.5, -5.75], walked: true },
            { id: 300, species: 'horse', variant: 1, mode: MODE.stay, at: [-20.25, 70.5, 100], owner: 'player_ab12', ownerName: 'Ana', extra: { age: 120 } },
            { id: 9, species: 'spider', mode: MODE.chase, target: 'page_Ana', at: [3, 64, 2.5], home: [2, 64, 2], walked: true }
        ],
        changed: [
            { id: 7, of: [10, 64, -3.5], walk: [11.5, -5.75] },
            { id: 8, of: [5, 12, 0], place: [4.5, 12, 0.25], hurt: 9 },
            { id: 300, home: [20.25, 71, -100], mode: MODE.ridden, owner: 'page_Ana', ownerName: 'Ana', extra: { age: 180 } },
            { id: 9, of: [2, 64, 2], mode: MODE.chase, target: 'page_Beto' },
            { id: 10, of: [2, 64, 2], place: [20, 64, 2], walk: [10, 2], mode: MODE.roam }
        ],
        gone: [5, 1000]
    });
    assert.equal(Buffer.from(written).toString('hex'), GOLDEN);

    const bytes = Buffer.from(GOLDEN, 'hex');
    for (const cut of [3, 4, 9, 30, bytes.length - 1]) {
        assert.throws(() => ctx.animalsReadFrame(new Uint8Array(bytes.subarray(0, cut)).buffer), /animals:/, `cut at ${cut}`);
    }
    assert.throws(() => ctx.animalsReadFrame(new Uint8Array([...bytes, 0]).buffer), /left over/);
    assert.throws(() => ctx.animalsReadFrame(new Uint8Array(Buffer.from('MCK1....')).buffer), /not a frame/);
    // And the game goes on: a frame it cannot read changes nothing.
    const { game, mobOf, hear } = makeWorld();
    hear({ fresh: [pig(1, 4.5, 0.5)] });
    game.animalsOnFrame(new Uint8Array(bytes.subarray(0, 30)).buffer);
    assert.ok(mobOf(1));
    assert.equal(game.animalsKnown.size, 1);
});

test('a binary frame goes to whoever reads its kind: the animals by their magic, every other to the chunks', () => {
    const context = vm.createContext({ console: { log() {}, error() {} }, document: { getElementById: () => null }, WebSocket: function () {} });
    vm.runInContext(fs.readFileSync(path.join(JS, 'websocket.js'), 'utf8'), context);
    const client = vm.runInContext('new NetworkClient()', context);
    const heard = [];
    client.on('animalData', (buffer) => heard.push(['animals', buffer.byteLength]));
    client.on('chunkData', (buffer) => heard.push(['chunk', buffer.byteLength]));
    client.on('chat', (payload) => heard.push(['chat', payload.text]));
    client.connect('ws://nowhere');
    const binary = (text) => vm.runInContext(`new Uint8Array(${JSON.stringify([...Buffer.from(text)])}).buffer`, context);
    client.ws.onmessage({ data: binary('MCA1\u0000\u0000\u0000') });
    client.ws.onmessage({ data: binary('MCK1 and the rest of a chunk') });
    client.ws.onmessage({ data: binary('MC') });
    client.ws.onmessage({ data: '{"type":"chat","payload":{"text":"MCA1"}}' });
    assert.deepEqual(heard, [['animals', 7], ['chunk', 28], ['chunk', 2], ['chat', 'MCA1']]);

    const server = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'animals.go'), 'utf8');
    assert.match(server, /animalsMagic = "MCA1"/);
});

// ---- A body for each ----

test('an animal the server tells of gets a body, an ordinary mob marked as kept, and loses it when it is gone', () => {
    const { game, mobOf, hear, sent, run } = makeWorld();
    hear({ fresh: [pig(1, 4.5, 0.5, { hurt: 8 }), { id: 2, species: 'horse', variant: 2, mode: MODE.stay, at: [6.25, 0, -3.5], owner: 'player_ana', ownerName: 'Ana' }] });
    const one = mobOf(1);
    const two = mobOf(2);
    assert.ok(one && two && game.ambientMobs.length === 2);
    assert.deepEqual([one.position.x, one.position.y, one.position.z], [4.5, 0, 0.5]);
    assert.equal(one.userData.species, 'pig');
    assert.equal(one.userData.natural, false, 'never natural: it would leave with its chunk');
    assert.deepEqual([one.userData.animalMine, one.userData.animalForeign, one.userData.animalOwnerName], [false, true, null]);
    assert.equal(one.userData.health, one.userData.maxHealth - 4, 'half points of damage');
    assert.deepEqual([two.userData.variant, two.userData.animalForeign, two.userData.animalOwnerName, Boolean(two.userData.tamed)], [2, true, 'Ana', false],
        'somebody else\'s is no pet of this player: herd.js would walk it after the wrong one');
    assert.equal(two.userData.tamingSitting, true);

    // Told again (the server put this copy right): the same body, as it says now.
    hear({ fresh: [pig(1, 4.5, 0.5, { hurt: 2 })] });
    assert.equal(mobOf(1), one);
    assert.equal(game.ambientMobs.length, 2);
    assert.equal(one.userData.health, one.userData.maxHealth - 1);

    run(1);
    hear({ gone: [1, 99] });
    assert.equal(mobOf(1), null);
    assert.equal(one.parent, null);
    assert.deepEqual(game.ambientMobs, [two]);
    assert.deepEqual(sent, [], 'taken away on the server\'s word: nobody is told');

    // A new connection: every body goes, the server will tell again.
    game.animalsForgetAll();
    assert.deepEqual(game.ambientMobs, []);
    assert.equal(game.animalsKnown.size, 0);
    assert.deepEqual(sent, []);
});

test('an animal over ground that has not arrived waits for it, and stands on the floor that is there', () => {
    const blocks = {};
    // A hill four blocks high where the server thought the ground was at 0, and a cellar under a roof.
    for (let y = 0; y < 4; y++) blocks[`6,${y},0`] = 'stone';
    for (let x = 9; x <= 11; x++) for (let z = -1; z <= 1; z++) blocks[`${x},3,${z}`] = 'stone';
    const { game, mobOf, hear, run, world, deliver } = makeWorld({ chunksArrive: false, blocks });
    hear({ fresh: [pig(1, 4.5, 0.5), pig(2, 6.5, 0.5), pig(3, 10.5, 0.5), pig(4, 12.5, 0.5, { at: [12.5, 30, 0.5] })] });
    run(2);
    assert.deepEqual(game.ambientMobs, [], 'a mob over a chunk that is not there would fall for ever');
    assert.equal(game.animalsKnown.size, 4);
    for (let i = 0; i < 60; i++) {
        world.update(0.5, 0.5);
        deliver();
    }
    run(1, 1 / 30, true);
    assert.equal(mobOf(1).position.y, 0);
    assert.equal(mobOf(2).position.y, 4, 'not buried in the hill');
    assert.equal(mobOf(3).position.y, 0, 'in the cellar, not on its roof');
    assert.equal(mobOf(4).position.y, 0, 'down from where the ground once was');
});

test('what cannot be made of one mob gets no body, a movement says how its own is made, and none breaks the frame', () => {
    const { game, mobOf, hear, run } = makeWorld();
    assert.equal(typeof ctx.MOB_BEHAVIOURS.scuttle.spawnKept, 'function', 'the crab is the example of the hook');
    hear({
        fresh: [
            { id: 1, species: 'crab', at: [3.5, 0, 0.5], walked: true }, { id: 2, species: 'bee', at: [4.5, 0, 0.5] }, { id: 3, species: 'fish', at: [5.5, 0, 0.5] },
            { id: 4, species: 'fox', at: [6.5, 0, 0.5] }, { id: 5, species: 'no_such_species', at: [7.5, 0, 0.5] }, { id: 6, species: 'frog', at: [8.5, 0, 0.5] },
            // Nobody can have tamed a spider: whatever a client told the server, it is no pet here.
            { id: 7, species: 'spider', mode: MODE.follow, at: [9.5, 0, 0.5], owner: 'player_ana', ownerName: 'Ana' }
        ]
    });
    run(2);
    assert.ok(mobOf(1) && mobOf(1).userData.species === 'crab');
    assert.ok(mobOf(6), 'a frog is a body on the ground: it hops around its home by itself');
    for (const id of [2, 3, 4, 5, 7]) assert.equal(mobOf(id), null, `animal ${id}`);
    assert.equal(game.ambientMobs.length, 2);
    assert.equal(game.animalsWaiting.length, 0, 'nothing is looked at again every half second for ever');
    assert.equal(game.animalsCanKeep('pig', false), true);
    assert.equal(game.animalsCanKeep('pig', true), true);
    assert.equal(game.animalsCanKeep('fox', true), false);
});

// ---- Walking where the server says ----

test('a roaming animal never takes a step by itself: it stands until it is sent somewhere, walks there and stands again', () => {
    const { game, mobOf, hear, run, sent } = makeWorld();
    hear({ fresh: [pig(1, 4.5, 0.5)] });
    const mob = mobOf(1);
    run(30);
    assert.deepEqual([mob.position.x, mob.position.z], [4.5, 0.5], 'thirty seconds with nowhere to go');

    hear({ changed: [{ id: 1, of: [4.5, 0, 0.5], walk: [6.5, 2.25] }] });
    const goal = game.animalsGoal(mob);
    assert.deepEqual([goal.x, goal.z], [6.5, 2.25]);
    assert.equal(game.animalsGoal(mob), goal, 'the same vector every time: nothing is made for each frame');
    assert.equal(game.getMobGoal(mob, 1 / 30), goal, 'and it is the goal the mob gets');
    run(12);
    assert.ok(Math.hypot(mob.position.x - 6.5, mob.position.z - 2.25) <= ctx.ANIMALS.arrive + 1e-9, `it stopped at ${mob.position.x}, ${mob.position.z}`);
    const there = [mob.position.x, mob.position.z];
    run(20);
    assert.deepEqual([mob.position.x, mob.position.z], there);
    assert.deepEqual(sent, [], 'it got where it was sent: nothing to say');

    // Another walk before the first is over: it turns, and the first counts as done where the server holds it.
    hear({ changed: [{ id: 1, of: [4.5, 0, 0.5], walk: [2.5, 0.5] }] });
    run(2);
    hear({ changed: [{ id: 1, of: [4.5, 0, 0.5], walk: [6.5, -1.5] }] });
    run(20);
    assert.ok(Math.hypot(mob.position.x - 6.5, mob.position.z + 1.5) <= ctx.ANIMALS.arrive + 1e-9);
    assert.deepEqual(sent, []);

    // One the server does not walk (a hopper) is left to its own behaviour.
    hear({ fresh: [{ id: 2, species: 'frog', at: [-6.5, 0, 0.5] }] });
    assert.equal(game.animalsGoal(mobOf(2)), null);
    // And no wild mob is asked about: one look at a property.
    const wild = game.createMob('pig', new Vector3(-3, 0, -3));
    game.ambientMobs.push(wild);
    assert.equal(game.getMobGoal(wild, 1 / 30), null);
});

test('stopped by a wall it says where, once, after a wait of its own; told first by the server, it says nothing', () => {
    const blocks = {};
    for (let z = -6; z <= 6; z++) for (let y = 0; y < 2; y++) blocks[`6,${y},${z}`] = 'stone';
    const first = makeWorld({ blocks });
    first.hear({ fresh: [pig(1, 3.5, 0.5, { walk: [8.5, 0.5] })] });
    const mob = first.mobOf(1);
    first.run(5);
    assert.ok(mob.position.x > 5 && mob.position.x < 6, `it walked up to the wall: ${mob.position.x}`);
    first.run(10);
    assert.deepEqual(first.sentOf('animalAt'), [{ id: 1, x: Math.round(mob.position.x * 100) / 100, y: 0, z: 0.5, gx: 20, gz: 0 }]);
    assert.equal(first.sent.length, 1, 'once');
    // The server takes it: there it is, and this copy is there already.
    first.hear({ changed: [{ id: 1, of: [3.5, 0, 0.5], place: [mob.position.x, 0, 0.5] }] });
    first.run(10);
    assert.equal(first.sent.length, 1);
    // The next walk is another matter: blocked again, said again.
    first.hear({ changed: [{ id: 1, of: [3.5, 0, 0.5], walk: [8.5, 2.5] }] });
    first.run(15);
    assert.equal(first.sentOf('animalAt').length, 2);
    assert.deepEqual([first.sentOf('animalAt')[1].gx, first.sentOf('animalAt')[1].gz], [20, 8]);

    // Another client said it first: this one, whose turn had not come, keeps quiet and walks to where that one saw it stop.
    const second = makeWorld({ blocks, seed: 7 });
    second.hear({ fresh: [pig(1, 3.5, 0.5, { walk: [8.5, 0.5] })] });
    const copy = second.mobOf(1);
    for (let t = 0; t < 400 && copy.userData.animal.reportIn <= 0; t++) second.frame();
    assert.ok(copy.userData.animal.reportIn > 0, 'it found itself blocked and is waiting its turn');
    second.hear({ changed: [{ id: 1, of: [3.5, 0, 0.5], place: [5, 0, 2.5] }] });
    second.run(15);
    assert.deepEqual(second.sent, []);
    assert.ok(Math.hypot(copy.position.x - 5, copy.position.z - 2.5) <= ctx.ANIMALS.arrive + 1e-9, `it went to ${copy.position.x}, ${copy.position.z}`);
});

test('arriving two blocks higher than the server holds is said too, and a block of difference is not', () => {
    const blocks = {};
    for (let x = 5; x <= 12; x++) for (let z = -3; z <= 3; z++) blocks[`${x},0,${z}`] = 'stone';
    for (let x = 6; x <= 12; x++) for (let z = -3; z <= 3; z++) blocks[`${x},1,${z}`] = 'stone';
    const { mobOf, hear, run, sentOf, sent } = makeWorld({ blocks });
    hear({ fresh: [pig(1, 3.5, 0.5, { walk: [5.5, 0.5] })] });
    const mob = mobOf(1);
    run(15);
    assert.equal(mob.position.y, 1);
    assert.deepEqual(sent, [], 'one block up: as the server holds it, a block more or less');
    hear({ changed: [{ id: 1, of: [3.5, 0, 0.5], walk: [7.5, 0.5] }] });
    run(15);
    assert.equal(mob.position.y, 2);
    assert.deepEqual(sentOf('animalAt'), [{ id: 1, x: Math.round(mob.position.x * 100) / 100, y: 2, z: 0.5, gx: 16, gz: 0 }]);
});

// ---- Somebody else's ----

test('somebody else\'s follower walks to its owner\'s avatar and stops a few steps away; left far behind it is put next to it', () => {
    const { game, mobOf, hear, run, avatar, sent } = makeWorld();
    const ana = avatar('player_ana', 8.5, 0.5);
    hear({ fresh: [{ id: 5, species: 'sheep', mode: MODE.follow, at: [8.5, 0, 0.5], owner: 'player_ana', ownerName: 'Ana' }] });
    const mob = mobOf(5);
    const state = mob.userData.animal;
    assert.ok(Math.hypot(mob.position.x - 8.5, mob.position.z - 0.5) > 1.5, 'it appears by the avatar, not on it');
    assert.equal(Boolean(mob.userData.tamed), false);

    ana.position.set(12.5, 0, 4.5);
    run(40);
    const spot = [ana.position.x + state.ringX, ana.position.z + state.ringZ];
    assert.ok(Math.hypot(mob.position.x - spot[0], mob.position.z - spot[1]) <= ctx.ANIMALS.followStop + 1e-9, `at ${mob.position.x}, ${mob.position.z}`);
    const there = [mob.position.x, mob.position.z];
    run(10);
    assert.deepEqual([mob.position.x, mob.position.z], there, 'and stays while its owner does');

    // Its owner rides off: beyond 20 blocks the copy is put by the avatar, as the owner's own client does.
    ana.position.set(-25.5, 0, -20.5);
    run(0.2);
    assert.ok(Math.hypot(mob.position.x - (ana.position.x + state.ringX), mob.position.z - (ana.position.z + state.ringZ)) < 0.5);

    // The owner leaves the game (no page plays it) and their avatar goes: it waits where it is.
    game.otherPlayerMeshes.delete('player_ana');
    hear({ changed: [{ id: 5, of: [8.5, 0, 0.5], owner: '', ownerName: 'Ana' }] });
    const waits = [mob.position.x, mob.position.z];
    run(20);
    assert.deepEqual([mob.position.x, mob.position.z], waits);
    assert.equal(mob.userData.animalOwnerName, 'Ana');
    assert.equal(mob.userData.animalForeign, true);
    assert.deepEqual(sent, [], 'nothing of somebody else\'s animal is this client\'s to say');
});

test('a ridden animal is hidden under its rider and shows again where they get off; one told to stay sits at its place', () => {
    const { mobOf, hear, run, avatar } = makeWorld();
    const ana = avatar('player_ana', 6.5, 0.5);
    hear({ fresh: [{ id: 5, species: 'horse', mode: MODE.follow, at: [6.5, 0, 0.5], owner: 'player_ana', ownerName: 'Ana' }] });
    const mob = mobOf(5);
    hear({ changed: [{ id: 5, of: [6.5, 0, 0.5], mode: MODE.ridden }] });
    assert.equal(mob.visible, false, 'the avatar already carries the mount');
    ana.position.set(30.5, 0, -12.5);
    run(0.5);
    assert.deepEqual([mob.position.x, mob.position.z], [30.5, -12.5]);
    hear({ changed: [{ id: 5, of: [6.5, 0, 0.5], mode: MODE.follow }] });
    assert.equal(mob.visible, true);

    // Told to stay four blocks from where this copy stands: it walks there and sits.
    hear({ changed: [{ id: 5, home: [34.5, 0, -12.5], mode: MODE.stay }] });
    run(20);
    assert.ok(Math.hypot(mob.position.x - 34.5, mob.position.z + 12.5) <= ctx.ANIMALS.arrive + 1e-9);
    assert.equal(mob.userData.tamingSitting, true);
    assert.ok(mob.userData.resting > 0, 'sitting still');
    ana.position.set(40.5, 0, -12.5);
    run(10);
    assert.ok(Math.hypot(mob.position.x - 34.5, mob.position.z + 12.5) <= ctx.ANIMALS.arrive + 1e-9, 'it does not follow');
    hear({ changed: [{ id: 5, of: [34.5, 0, -12.5], mode: MODE.follow }] });
    run(30);
    assert.equal(mob.userData.tamingSitting, false);
    assert.ok(mob.position.x > 37, `it follows again: ${mob.position.x}`);
    // Sat down far from where this copy is (it lagged behind): no walking forty blocks at a sheep's pace.
    hear({ changed: [{ id: 5, home: [-2.5, 0, 3.5], mode: MODE.stay }] });
    run(0.2);
    assert.deepEqual([mob.position.x, mob.position.y, mob.position.z], [-2.5, 0, 3.5]);
});

test('somebody else\'s animal shows what its extra says: a baby\'s size, growing, and nothing an extra should not hold', () => {
    const { mobOf, hear, run } = makeWorld();
    hear({
        fresh: [
            { id: 1, species: 'sheep', mode: MODE.stay, at: [4.5, 0, 0.5], owner: 'player_ana', ownerName: 'Ana', extra: { age: 0 } },
            { id: 2, species: 'sheep', mode: MODE.stay, at: [6.5, 0, 0.5], owner: 'player_ana', ownerName: 'Ana', extra: { age: 'old', cooldown: {}, genetics: 'no' } },
            { id: 3, species: 'sheep', mode: MODE.stay, at: [8.5, 0, 0.5], owner: 'player_ana', ownerName: 'Ana', extra: ['not', 'an', 'object'] }
        ]
    });
    const baby = mobOf(1);
    assert.equal(baby.scale.x, ctx.TAMING.babyScale);
    assert.equal(mobOf(2).scale.x, 1);
    assert.equal(mobOf(3).scale.x, 1);
    run(30);
    assert.ok(baby.scale.x > ctx.TAMING.babyScale && baby.scale.x < 0.6, `growing between two words of its owner: ${baby.scale.x}`);
    hear({ changed: [{ id: 1, of: [4.5, 0, 0.5], extra: { age: 240 } }] });
    assert.ok(Math.abs(baby.scale.x - 0.9) < 1e-9);
    hear({ changed: [{ id: 1, of: [4.5, 0, 0.5], extra: null }] });
    assert.equal(baby.scale.x, 1, 'grown up');
});

// ---- After a player: the one the server says ----

// What the player of this client suffers, as mobs.js deals it.
function hurts(game) {
    const blows = [];
    const poisons = [];
    game.applyDamage = (amount, reason, type) => { blows.push([amount, reason, type]); };
    game.poisonPlayer = (ticks, source) => { poisons.push([ticks, source]); };
    return { blows, poisons };
}

test('a kept hostile animal that is after nobody never comes for the player of this client, as a wild one does', () => {
    const { game, mobOf, hear, run, sent, camera } = makeWorld();
    const { blows } = hurts(game);
    hear({ fresh: [spider(1, 3.5, 0.5)] });
    const kept = mobOf(1);
    assert.equal(kept.userData.hostile, false, 'each client would see it run at its own player');
    run(20);
    assert.deepEqual([kept.position.x, kept.position.z], [3.5, 0.5], 'three blocks from the player for twenty seconds');
    assert.deepEqual(blows, []);
    // Nor when the player walks into it.
    camera.position.set(3.2, EYE + 0.01, 0.5);
    run(5);
    assert.deepEqual([kept.position.x, kept.position.z], [3.5, 0.5]);
    assert.deepEqual(blows, []);
    // Sent on a walk past the player, it walks there at its pace and bites nobody on the way.
    camera.position.set(0.5, EYE + 0.01, 0.5);
    hear({ changed: [{ id: 1, of: [3.5, 0, 0.5], walk: [-2.5, 0.5] }] });
    run(4);
    assert.ok(Math.abs(kept.position.x - (3.5 - 4 * 0.38)) < 0.1, `a spider walks 0.38 blocks a second: ${kept.position.x}`);
    run(20);
    assert.ok(Math.hypot(kept.position.x + 2.5, kept.position.z - 0.5) <= ctx.ANIMALS.arrive + 1e-9);
    assert.deepEqual(blows, []);
    assert.deepEqual(sent, []);

    // A wild one in the same world does come and bite: that is what the kept one was spared from doing.
    const wild = game.createMob('spider', new Vector3(8.5, 0, 0.5));
    game.ambientMobs.push(wild);
    run(10);
    assert.ok(Math.hypot(wild.position.x - 0.5, wild.position.z - 0.5) < 1.2, `the wild one is at ${wild.position.x}`);
    assert.ok(blows.length > 0);
    // One the server does not walk (no circle: it only exists) is left as its species is, on each client.
    hear({ fresh: [{ id: 2, species: 'spider', at: [-9.5, 0, 6.5] }] });
    assert.equal(mobOf(2).userData.hostile, true);
});

test('an animal that is after this player comes for them as a wild one does, and bites through the usual path', () => {
    const { game, mobOf, hear, run, sent } = makeWorld();
    const { blows, poisons } = hurts(game);
    hear({ fresh: [spider(1, 10.5, 0.5, { mode: MODE.chase, target: ME })] });
    const mob = mobOf(1);
    assert.equal(mob.userData.hostile, true);
    run(4);
    assert.ok(Math.abs(mob.position.x - (10.5 - 4 * 1.25)) < 0.1, `it runs, 1.25 blocks a second: ${mob.position.x}`);
    assert.deepEqual(blows, []);
    run(6);
    assert.deepEqual(blows[0], [2, 'You were attacked by a spider', 'mob'], 'the blow of mobs.js, with the damage of its species');
    assert.ok(blows.length >= 2 && blows.length <= 3, `one every 1.2 seconds: ${blows.length}`);
    assert.deepEqual(sent, [], 'and nothing of all that is said to the server');

    // From further than its kind comes by itself (the server keeps a target up to half as far again), and
    // by day for one of the night: it still runs at its target, and what it does on reaching it is the same.
    hear({ fresh: [{ id: 2, species: 'scorpion', at: [0.5, 0, 12.5], walked: true, mode: MODE.chase, target: ME }] });
    const scorpion = mobOf(2);
    run(4);
    assert.ok(Math.abs(scorpion.position.z - (12.5 - 4 * 1.1)) < 0.1, `it runs from 12 blocks away: ${scorpion.position.z}`);
    assert.deepEqual(poisons, []);
    run(10);
    assert.deepEqual(poisons[0], [3, 'scorpion']);

    // The player dies with another still on its way, from further than its kind comes by itself: nobody
    // runs at where they fell, and nothing bites them, until the server calls the chase off.
    hear({ fresh: [spider(3, -19.5, 0.5, { mode: MODE.chase, target: ME })] });
    const late = mobOf(3);
    run(1);
    assert.ok(late.position.x > -19.5 + 1.1, `it was coming: ${late.position.x}`);
    const before = blows.length;
    game.respawnPending = true;
    const waits = [late.position.x, late.position.z];
    run(5);
    assert.deepEqual([late.position.x, late.position.z], waits);
    assert.equal(blows.length, before);
});

test('an animal that is after somebody else runs at their avatar, the same on every client, and hurts nobody here', () => {
    // The player of this client stands right between the animal and the one it is after.
    const { game, mobOf, hear, run, avatar, sent } = makeWorld();
    const { blows } = hurts(game);
    const ana = avatar('page_ana', 8.5, 0.5);
    hear({ fresh: [spider(1, -6.5, 0.5, { mode: MODE.chase, target: 'page_ana' })] });
    const mob = mobOf(1);
    assert.equal(mob.userData.hostile, false);
    const goal = game.animalsGoal(mob);
    assert.deepEqual([goal.x, goal.z, goal.speed], [8.5, 0.5, 1.25]);
    assert.equal(game.animalsGoal(mob), goal, 'the same vector every frame');
    run(4);
    assert.ok(Math.abs(mob.position.x - (-6.5 + 4 * 1.25)) < 0.1, `at the pace it runs on its target's own client: ${mob.position.x}`);
    run(10);
    assert.ok(Math.abs(Math.hypot(mob.position.x - 8.5, mob.position.z - 0.5) - ctx.ANIMALS.chaseStop) < 0.1, `it stops by the avatar: ${mob.position.x}`);
    // Its target moves: so does it.
    ana.position.set(8.5, 0, 6.5);
    run(6);
    assert.ok(Math.hypot(mob.position.x - 8.5, mob.position.z - 6.5) <= ctx.ANIMALS.chaseStop + 0.1);
    assert.deepEqual(blows, [], 'it ran through this player and never touched them');

    // The server gives it another target: this player. Now it is theirs to fear.
    hear({ changed: [{ id: 1, of: [-6.5, 0, 0.5], mode: MODE.chase, target: ME }] });
    assert.equal(mob.userData.hostile, true);
    run(10);
    assert.ok(blows.length > 0);
    // And one that is not around this client at all: it has nowhere to run to here, and waits.
    hear({ changed: [{ id: 1, of: [-6.5, 0, 0.5], mode: MODE.chase, target: 'page_far_away' }] });
    assert.equal(mob.userData.hostile, false);
    const before = blows.length;
    const waits = [mob.position.x, mob.position.z];
    run(10);
    assert.deepEqual([mob.position.x, mob.position.z], waits);
    assert.equal(blows.length, before);
    // Back to its avatar at a run, and then the chase is over: its walk home is a walk again.
    hear({ changed: [{ id: 1, of: [-6.5, 0, 0.5], mode: MODE.chase, target: 'page_ana' }] });
    run(8);
    assert.ok(Math.hypot(mob.position.x - 8.5, mob.position.z - 6.5) <= ctx.ANIMALS.chaseStop + 0.1);
    const from = [mob.position.x, mob.position.z];
    hear({ changed: [{ id: 1, of: [-6.5, 0, 0.5], place: [8.5, 0, 6.5], walk: [-0.5, 6.5], mode: MODE.roam }] });
    run(4);
    assert.ok(Math.abs(Math.hypot(mob.position.x - from[0], mob.position.z - from[1]) - 4 * 0.38) < 0.1, `it walks, it does not run: ${mob.position.x}`);
    assert.equal(blows.length, before);
    assert.deepEqual(sent, []);
});

test('told that the chase is over, it stops: it walks where the server sends it and is as peaceful as before', () => {
    const { game, mobOf, hear, run, sent, camera } = makeWorld();
    const { blows } = hurts(game);
    // Its home is 20 blocks east; it has come all this way after the player.
    hear({ fresh: [spider(1, 6.5, 0.5, { home: [20.5, 0, 0.5], mode: MODE.chase, target: ME })] });
    const mob = mobOf(1);
    run(2);
    assert.ok(mob.position.x < 4.2 && mob.position.x > 3.8, `on its way: ${mob.position.x}`);
    // The player left its leash, or died, or the server gave up: where it takes the animal to be, and its walk home.
    hear({ changed: [{ id: 1, of: [20.5, 0, 0.5], place: [4, 0, 0.5], walk: [12.5, 0.5], mode: MODE.roam }] });
    assert.equal(mob.userData.hostile, false);
    const turned = mob.position.x;
    run(4);
    assert.ok(Math.abs(mob.position.x - (turned + 4 * 0.38)) < 0.1, `it walks home, it does not run: ${mob.position.x}`);
    // The player goes after it and stands on its way: nothing.
    camera.position.set(mob.position.x + 0.6, EYE + 0.01, 0.5);
    run(30);
    assert.ok(Math.hypot(mob.position.x - 12.5, mob.position.z - 0.5) <= ctx.ANIMALS.arrive + 1e-9, `it is at ${mob.position.x}`);
    assert.deepEqual(blows, []);
    assert.deepEqual(sent, [], 'it got where it was sent: nothing to say');

    // Stopped by a wall on the way home, it says where as on any walk, though that is out of its circle.
    const blocks = {};
    for (let z = -6; z <= 6; z++) for (let y = 0; y < 2; y++) blocks[`10,${y},${z}`] = 'stone';
    const walled = makeWorld({ blocks });
    walled.hear({ fresh: [spider(1, 6.5, 0.5, { home: [20.5, 0, 0.5], mode: MODE.chase, target: ME })] });
    walled.run(1);
    walled.hear({ changed: [{ id: 1, of: [20.5, 0, 0.5], place: [5.25, 0, 0.5], walk: [12.5, 0.5], mode: MODE.roam }] });
    walled.run(40);
    const copy = walled.mobOf(1);
    assert.deepEqual(walled.sentOf('animalAt'), [{ id: 1, x: Math.round(copy.position.x * 100) / 100, y: 0, z: 0.5, gx: -32, gz: 0 }]);
    // The wall had stopped it on a walk, and its turn to say so had not come when it went after somebody:
    // that walk is over, and nothing is said of it while the chase lasts.
    const chased = makeWorld({ blocks });
    chased.hear({ fresh: [spider(1, 6.5, 0.5, { home: [20.5, 0, 0.5], walk: [12.5, 0.5] })] });
    const stopped = chased.mobOf(1);
    for (let t = 0; t < 900 && stopped.userData.animal.reportIn <= 0; t++) chased.frame();
    assert.ok(stopped.userData.animal.reportIn > 0, 'it found itself blocked and is waiting its turn');
    chased.hear({ changed: [{ id: 1, of: [20.5, 0, 0.5], mode: MODE.chase, target: 'page_far_away' }] });
    chased.run(20);
    assert.deepEqual(chased.sent, []);
});

test('/animal tells the server how a hostile species goes after players, and no species asks for more than it grants', () => {
    const { game, sent } = makeWorld();
    game.creativeMode = true;
    for (const species of ['spider', 'scorpion', 'cave_monster', 'pig', 'frog']) game.animalsCommand('animal', [species]);
    assert.deepEqual(sent.map(([, payload]) => [payload.species, payload.radius, payload.chase, payload.chaseDay, payload.chaseSpeed]), [
        // The distance of mobs.js when its species says none; less by day for one of the night.
        ['spider', 8, 16, 0, 1.25], ['scorpion', 8, 8, 3.5, 1.1], ['cave_monster', 8, 10, 0, 0.9],
        ['pig', 8, 0, 0, 0], ['frog', 0, 0, 0, 0]
    ]);
    assert.deepEqual(plain(ctx.animalsChaseOf(ctx.getMobSpecies('shadow'))), { chase: 0, chaseDay: 0, chaseSpeed: 0 }, 'the server does not walk it');
    assert.deepEqual(plain(ctx.animalsChaseOf(null)), { chase: 0, chaseDay: 0, chaseSpeed: 0 });

    // The server cuts a chase down to what its round can keep: a species that asks for more would go after
    // players from nearer than its page of the guide says.
    const server = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'animals.go'), 'utf8');
    const most = Number(/animalsMaxChase\s+= ([\d.]+)/.exec(server)[1]);
    assert.ok(most >= 16);
    for (const [id, info] of Object.entries(ctx.MOB_SPECIES)) {
        const { chase, chaseDay, chaseSpeed } = ctx.animalsChaseOf(info);
        assert.ok(chase <= most, `${id} comes from ${chase} blocks, and the server grants ${most}`);
        assert.ok(chaseDay <= chase && chaseSpeed <= 8, id);
        assert.equal(chase > 0, Boolean(info.hostile) && ctx.mobMovementIs(info.movement, 'walksToGoal'), id);
    }
});

// ---- Blows ----

test('a blow on a kept animal is told to the server, the last one takes it out of the world, and nobody strikes a pet that is not theirs', () => {
    const { game, mobOf, hear, sent, sentOf, said } = makeWorld();
    game.getPlayerAttackDamage = () => 5;
    game.claimState = { spawn: null, claims: [{ id: 'c1', owner: 'Ana', minX: 20, minZ: -8, maxX: 36, maxZ: 8 }] };
    hear({
        fresh: [pig(1, 4.5, 0.5), { id: 2, species: 'sheep', mode: MODE.stay, at: [6.5, 0, 0.5], owner: 'player_ana', ownerName: 'Ana' },
            { id: 3, species: 'sheep', mode: MODE.stay, at: [8.5, 0, 0.5], owner: '', ownerName: '' }, pig(4, 24.5, 0.5)]
    });
    const wild = mobOf(1);
    game.interactWithMob(wild);
    assert.equal(wild.userData.health, wild.userData.maxHealth - 5);
    assert.deepEqual(sent, [['animalHurt', { id: 1, damage: 5 }]]);
    // Somebody else struck it too: the server's count is the one that stands.
    hear({ changed: [{ id: 1, of: [4.5, 0, 0.5], hurt: 18 }] });
    assert.equal(wild.userData.health, wild.userData.maxHealth - 9);

    // Ana's sheep, a sheep whose owner is away, and a pig with no owner in Ana's plot: not a scratch, and why.
    for (const id of [2, 3, 4]) {
        const mob = mobOf(id);
        game.interactWithMob(mob);
        assert.equal(mob.userData.health, mob.userData.maxHealth, `animal ${id}`);
    }
    assert.equal(sent.length, 1);
    assert.equal(said.length, 3);
    assert.match(said[0], /Ana/);
    assert.match(said[2], /Ana/, 'the plot\'s own line');
    // The admin strikes anything, as on the server.
    game.creativeMode = true;
    game.interactWithMob(mobOf(2));
    assert.deepEqual(sentOf('animalHurt')[1], { id: 2, damage: 5 });
    game.creativeMode = false;

    // The last blow: defeated here as any mob, and gone for everybody.
    game.interactWithMob(wild);
    assert.equal(wild.parent, null);
    assert.equal(mobOf(1), null);
    assert.deepEqual(sent.slice(2), [['animalHurt', { id: 1, damage: 5 }], ['animalGone', { id: 1 }]]);
    assert.equal(game.animalsKnown.has(1), false);
    // The server refuses (it was protected after all) and tells of it again: back it is.
    game.animalsOnRefused({ id: 1, gone: false });
    hear({ fresh: [pig(1, 4.5, 0.5, { hurt: 10 })] });
    assert.ok(mobOf(1) && mobOf(1) !== wild);
    assert.equal(mobOf(1).userData.health, wild.userData.maxHealth - 5);
});

// ---- This player's own ----

test('an animal tamed here is offered to the server once, bound to the number it gets, and leaves the browser', () => {
    storage.clear();
    const { game, hear, run, sent, sentOf, mobOf } = makeWorld();
    const mob = game.createMob('pig', new Vector3(3.5, 0, 0.5));
    mob.userData.natural = true;
    game.ambientMobs.push(mob);
    run(6);
    assert.deepEqual(sent, [], 'a wild animal is nobody\'s business');
    assert.equal(storage.has(TAMED_KEY), false);

    game.tamingTame(mob);
    run(1.5);
    const asked = sentOf('animalKeep');
    assert.equal(asked.length, 1);
    assert.deepEqual({ ...asked[0], ref: 'x' }, { ref: 'x', species: 'pig', variant: mob.userData.variant, hurt: 0, extra: {} });
    assert.match(asked[0].ref, /^[a-z0-9]{1,16}$/);
    // Until the server answers it is the browser that keeps it, as it always did.
    assert.equal(JSON.parse(storage.get(TAMED_KEY)).length, 1);
    assert.equal(JSON.parse(storage.get(TAMED_KEY))[0].ref, asked[0].ref);
    run(12);
    assert.equal(sent.length, 1, 'asked once, however long the answer takes');

    game.animalsOnKept({ ref: asked[0].ref, id: 41 });
    assert.deepEqual([mob.userData.animalId, mob.userData.animalMine, mob.userData.animalForeign, mob.userData.animalOwnerName], [41, true, false, 'Yo']);
    // The server tells of it with its next round, as it tells everybody: no second body.
    hear({ fresh: [{ id: 41, species: 'pig', mode: MODE.follow, at: [0.5, 0, 0.5], owner: ME, ownerName: 'Yo' }] });
    assert.equal(game.ambientMobs.length, 1);
    assert.equal(mobOf(41), mob);
    assert.equal(mob.userData.tamed, true);
    run(6);
    assert.equal(storage.has(TAMED_KEY), false, 'the server has it: the browser forgets it');
    assert.equal(sent.length, 1, 'and with nothing happening, nothing is said');

    // It sits: said once, with where. It gets up: said once.
    game.tamingSetSitting(mob, true);
    run(1.5);
    const sat = sentOf('animalSet');
    assert.deepEqual(sat, [{ id: 41, mode: MODE.stay, x: Math.round(mob.position.x * 4) / 4, y: 0, z: Math.round(mob.position.z * 4) / 4 }]);
    run(20);
    assert.equal(sentOf('animalSet').length, 1);
    game.tamingSetSitting(mob, false);
    run(1.5);
    assert.deepEqual(sentOf('animalSet')[1], { id: 41, mode: MODE.follow });
    // Struck by its owner, then fed: the blow is told as a blow, the cure as what is left.
    game.getPlayerAttackDamage = () => 4;
    game.interactWithMob(mob);
    run(6);
    assert.deepEqual(sent.slice(-1), [['animalHurt', { id: 41, damage: 4 }]]);
    mob.userData.health += 2;
    run(6);
    assert.deepEqual(sent.slice(-1), [['animalSet', { id: 41, hurt: 2 }]]);
    assert.equal(sent.length, 5);
});

test('a baby tells its age in steps of a minute, not as a clock, and a mount that it is ridden at once', () => {
    storage.clear();
    const { game, run, sentOf, cameraController } = makeWorld();
    const baby = game.tamingSpawnBaby('sheep', new Vector3(3.5, 0, 0.5), 0, 0, 'Yo');
    game.tamingSaveSoon(); // as tamingBreed does
    run(1.5);
    const asked = sentOf('animalKeep');
    assert.deepEqual(asked[0].extra, { age: 0 });
    game.animalsOnKept({ ref: asked[0].ref, id: 7 });
    run(150);
    assert.deepEqual(sentOf('animalSet'), [{ id: 7, extra: { age: 60 } }, { id: 7, extra: { age: 120 } }]);
    baby.userData.tamingAge = ctx.TAMING.growTime - 1;
    run(8);
    assert.deepEqual(sentOf('animalSet').slice(2), [{ id: 7, extra: {} }], 'and that it has grown up');
    assert.equal(baby.scale.x, 1);

    const horse = game.createMob('horse', new Vector3(1.5, 0, 0.5));
    game.ambientMobs.push(horse);
    game.tamingTame(horse);
    run(1.5);
    game.animalsOnKept({ ref: sentOf('animalKeep')[1].ref, id: 8 });
    game.raycastMob = () => horse;
    cameraController.canStandAt = () => true;
    cameraController.setMount = () => {};
    game.playNeigh = () => {};
    const before = sentOf('animalSet').length;
    assert.equal(game.tryMountMob(), true);
    assert.deepEqual(sentOf('animalSet').slice(before), [{ id: 8, mode: MODE.ridden }], 'not a frame later: the others must not see two horses');
    game.dismount();
    assert.deepEqual(sentOf('animalSet').slice(before + 1), [{ id: 8, mode: MODE.follow }]);
});

test('the player\'s own animals come from the server on coming in: tamed here for them alone, as they were left', () => {
    storage.clear();
    const { game, mobOf, hear, run, sent, camera } = makeWorld();
    hear({
        fresh: [
            { id: 1, species: 'sheep', mode: MODE.follow, at: [0.5, 0, 0.5], owner: ME, ownerName: 'Yo', hurt: 6 },
            { id: 2, species: 'horse', variant: 3, mode: MODE.stay, at: [6.25, 0, -3.5], owner: ME, ownerName: 'Yo' },
            { id: 3, species: 'sheep', mode: MODE.follow, at: [0.5, 0, 0.5], owner: ME, ownerName: 'Yo', extra: { age: 120, cooldown: 60 } },
            { id: 4, species: 'sheep', mode: MODE.follow, at: [3.5, 0, 0.5], owner: 'player_ana', ownerName: 'Ana' }
        ]
    });
    const [follower, sitter, baby, other] = [1, 2, 3, 4].map(mobOf);
    for (const mob of [follower, sitter, baby]) {
        assert.equal(mob.userData.tamed, true);
        assert.deepEqual([mob.userData.animalMine, mob.userData.animalForeign, mob.userData.animalOwnerName], [true, false, 'Yo']);
    }
    assert.equal(Boolean(other.userData.tamed), false);
    assert.equal(follower.userData.health, follower.userData.maxHealth - 3);
    assert.ok(Math.hypot(follower.position.x - 0.5, follower.position.z - 0.5) < 5, 'around the player, not on them');
    assert.notDeepEqual([follower.position.x, follower.position.z], [baby.position.x, baby.position.z], 'and not in one heap');
    assert.deepEqual([sitter.position.x, sitter.position.z, sitter.userData.tamingSitting, sitter.userData.variant], [6.25, -3.5, true, 3]);
    assert.ok(Math.abs(baby.scale.x - 0.7) < 1e-9, 'a baby of two minutes');
    assert.equal(baby.userData.tamingBreedCooldown, 60);
    assert.equal(game.animalsGoal(follower), null, 'taming.js walks it, as ever');

    run(30);
    assert.deepEqual(sent, [], 'they are as the server holds them: nothing to say');
    assert.equal(storage.has(TAMED_KEY), false, 'and nothing of theirs is in the browser');
    assert.deepEqual([sitter.position.x, sitter.position.z], [6.25, -3.5]);
    camera.position.set(10.5, EYE + 0.01, 10.5);
    run(40);
    assert.ok(Math.hypot(follower.position.x - 10.5, follower.position.z - 10.5) < 6, 'it follows its owner');
    assert.deepEqual([sitter.position.x, sitter.position.z], [6.25, -3.5]);
    assert.deepEqual(sent, [['animalSet', { id: 3, extra: { age: 180 } }]],
        'its steps are told to nobody: only, in more than a minute, that the baby is a minute older and has rested');

    // The server refuses what was said of one (it may not stay there): it tells it again, and that stands.
    game.tamingSetSitting(follower, true);
    run(1.5);
    assert.equal(sent.length, 2);
    game.animalsOnRefused({ id: 1, gone: false });
    hear({ fresh: [{ id: 1, species: 'sheep', mode: MODE.follow, at: [10.5, 0, 10.5], owner: ME, ownerName: 'Yo', hurt: 6 }] });
    assert.equal(follower.userData.tamingSitting, false);
    run(6);
    assert.equal(sent.length, 2, 'and it is not said again');
    // The server does not have one at all (it lost it): it is the browser's again, and offered again.
    game.animalsOnRefused({ id: 2, gone: true });
    assert.equal(sitter.userData.animalId, 0);
    run(6);
    assert.equal(sent[2][0], 'animalKeep');
    assert.equal(JSON.parse(storage.get(TAMED_KEY)).length, 1);
});

test('the pets a browser saved before the server kept any come back, are handed over once, and leave the browser', () => {
    storage.clear();
    const old = [
        { species: 'sheep', variant: 0, x: 3.5, y: 0, z: 0.5, sitting: true, age: null, cooldown: 0, owner: 'Yo' },
        { species: 'horse', variant: 2, x: -2.5, y: 0, z: 1.5, sitting: false, age: 100, cooldown: 30, owner: 'Yo' },
        // Far from where the player is now: it waits in the browser until they walk there, as it always did.
        { species: 'pig', variant: 0, x: 900.5, y: 0, z: 0.5, sitting: true, age: null, cooldown: 0, owner: 'Yo' },
        { species: 'no_such_species', variant: 0, x: 1, y: 0, z: 1 }
    ];
    storage.set(TAMED_KEY, JSON.stringify(old));
    const first = makeWorld();
    first.run(1.5);
    assert.equal(first.game.ambientMobs.length, 2, 'restored as before');
    const asked = first.sentOf('animalKeep');
    assert.deepEqual(asked.map((ask) => [ask.species, ask.variant, ask.extra]), [['sheep', 0, {}], ['horse', 2, { age: 60, cooldown: 60 }]]);
    assert.notEqual(asked[0].ref, asked[1].ref);
    const saved = JSON.parse(storage.get(TAMED_KEY));
    assert.equal(saved.length, 3, 'nothing leaves the browser before the server has it');
    assert.deepEqual(saved.map((entry) => entry.ref).slice(0, 2), asked.map((ask) => ask.ref));

    // The page is closed before any answer: the same pets are offered under the same names, so the server keeps each once.
    const second = makeWorld();
    second.run(1.5);
    assert.deepEqual(second.sentOf('animalKeep').map((ask) => ask.ref), asked.map((ask) => ask.ref));

    second.game.animalsOnKept({ ref: asked[0].ref, id: 11 });
    second.game.animalsOnKept({ ref: asked[1].ref, id: 12 });
    second.run(1.5);
    const sheep = second.mobOf(11);
    assert.deepEqual(second.sentOf('animalSet'), [{ id: 11, mode: MODE.stay, x: 3.5, y: 0, z: 0.5 }], 'the one that sat is told to stay where it sits');
    assert.equal(sheep.userData.tamingSitting, true);
    const left = JSON.parse(storage.get(TAMED_KEY));
    assert.deepEqual(left.map((entry) => entry.species), ['pig'], 'only the one that is not back yet is still the browser\'s');

    // A third visit: the two are the server's to tell of, and nothing is offered twice.
    const third = makeWorld();
    third.run(6);
    assert.deepEqual(third.sent, []);
    assert.equal(third.game.ambientMobs.length, 0);

    // The last one, once the player is where it was left.
    storage.set(TAMED_KEY, JSON.stringify(left.map((entry) => ({ ...entry, x: 5.5 }))));
    const fourth = makeWorld();
    fourth.run(1.5);
    fourth.game.animalsOnKept({ ref: fourth.sentOf('animalKeep')[0].ref, id: 13 });
    fourth.run(1.5);
    assert.equal(storage.has(TAMED_KEY), false, 'the key is gone with the last of them');
});

test('an answer lost with a connection keeps one animal, not two; and what the server will not keep stays in the browser', () => {
    storage.clear();
    const { game, hear, run, sent, sentOf, mobOf, said } = makeWorld();
    const mob = game.createMob('pig', new Vector3(3.5, 0, 0.5));
    game.ambientMobs.push(mob);
    game.tamingTame(mob);
    run(1.5);
    const ref = sentOf('animalKeep')[0].ref;
    // The server took it, but the answer never came: a new connection, and it tells of the animal as this player's.
    game.animalsForgetAll();
    assert.deepEqual(game.ambientMobs, [mob], 'what was tamed here and is not bound yet stays');
    hear({ fresh: [{ id: 41, species: 'pig', mode: MODE.follow, at: [0.5, 0, 0.5], owner: ME, ownerName: 'Yo' }] });
    assert.equal(game.ambientMobs.length, 2);
    run(1.5);
    assert.equal(sentOf('animalKeep').length, 2);
    assert.equal(sentOf('animalKeep')[1].ref, ref, 'asked again under the same name');
    game.animalsOnKept({ ref, id: 41 });
    assert.deepEqual(game.ambientMobs, [mob], 'the body it had all along is the one that stays');
    assert.equal(mobOf(41), mob);
    assert.equal(sentOf('animalGone').length, 0);

    // The server keeps as many as it can: this one lives on in the browser, and is not asked about again.
    const more = game.createMob('pig', new Vector3(2.5, 0, 2.5));
    game.ambientMobs.push(more);
    game.tamingTame(more);
    run(1.5);
    game.animalsOnKept({ ref: sentOf('animalKeep')[2].ref, error: 'full' });
    run(12);
    assert.equal(sentOf('animalKeep').length, 3);
    assert.equal(said.length, 1);
    assert.equal(JSON.parse(storage.get(TAMED_KEY)).length, 1);
    // Asked from the title screen ("later"): asked again.
    const third = game.createMob('pig', new Vector3(2.5, 0, -2.5));
    game.ambientMobs.push(third);
    game.tamingTame(third);
    run(1.5);
    game.animalsOnKept({ ref: sentOf('animalKeep')[3].ref, error: 'later' });
    run(6);
    assert.equal(sentOf('animalKeep').length, 5);
    // Defeated before the answer came: the server is told to forget it.
    const before = sent.length;
    game.removeMob(third);
    game.animalsOnKept({ ref: sentOf('animalKeep')[4].ref, id: 77 });
    assert.deepEqual(sent.slice(before), [['animalGone', { id: 77 }]]);
});

test('a kept animal with no owner can be tamed: the server is asked for it, and it is the player\'s or not as it answers', () => {
    storage.clear();
    const { game, hear, run, sentOf, mobOf, said } = makeWorld();
    game.claimState = { spawn: null, claims: [{ id: 'c1', owner: 'Ana', minX: 20, minZ: -8, maxX: 36, maxZ: 8 }] };
    hear({ fresh: [pig(1, 3.5, 0.5), pig(2, 5.5, 0.5), pig(3, 24.5, 0.5), { id: 4, species: 'pig', mode: MODE.stay, at: [7.5, 0, 0.5], owner: 'player_ana', ownerName: 'Ana' }] });
    let eaten = 0;
    game.consumeSelectedBlock = () => { eaten++; return true; };
    vm.runInContext('Math.random = () => 0', ctx);
    assert.equal(game.tamingUse(mobOf(4), 'wheat'), true);
    assert.equal(game.tamingUse(mobOf(3), 'wheat'), true);
    assert.equal(said.length, 2, 'Ana\'s pig, and the pig of Ana\'s plot: why not');
    assert.match(said[0], /Ana/);
    assert.equal(eaten, 0, 'and no food spent');
    assert.equal(Boolean(mobOf(4).userData.tamed) || Boolean(mobOf(3).userData.tamed), false);

    for (const id of [1, 2]) assert.equal(game.tamingUse(mobOf(id), 'wheat'), true);
    assert.equal(mobOf(1).userData.tamed, true);
    assert.equal(said.length, 4);
    run(1.5);
    const asked = sentOf('animalAdopt');
    assert.deepEqual(asked.map((ask) => ask.id), [1, 2]);
    assert.equal(sentOf('animalKeep').length, 0, 'not kept a second time');

    game.animalsOnKept({ ref: asked[0].ref, id: 1 });
    hear({ changed: [{ id: 1, home: [0.5, 0, 0.5], mode: MODE.follow, owner: ME, ownerName: 'Yo' }] });
    const mine = mobOf(1);
    assert.deepEqual([mine.userData.tamed, mine.userData.animalMine, mine.userData.animalForeign], [true, true, false]);
    assert.equal(game.animalsGoal(mine), null);
    // Somebody was quicker with the other one.
    game.animalsOnKept({ ref: asked[1].ref, error: 'owned' });
    hear({ changed: [{ id: 2, home: [9.5, 0, 0.5], mode: MODE.follow, owner: 'player_ana', ownerName: 'Ana' }] });
    const theirs = mobOf(2);
    assert.deepEqual([theirs.userData.tamed, theirs.userData.animalForeign, theirs.userData.animalOwnerName], [false, true, 'Ana']);
    assert.equal(said.length, 5, 'and the player is told it did not stay');
    run(6);
    assert.equal(sentOf('animalAdopt').length, 2);
});

// ---- /animal ----

test('/animal asks the server for a roaming animal next to the player, in creative mode and for nobody else', () => {
    const { game, sent, said } = makeWorld();
    game.animalsCommand('animal', ['pig']);
    assert.deepEqual(sent, []);
    assert.deepEqual(said, ['Unknown command: /animal'], 'as any command that does not exist');

    game.creativeMode = true;
    game.animalsCommand('animal', ['pig']);
    game.animalsCommand('animal', ['goat', '20']);
    game.animalsCommand('animal', ['frog']);
    assert.deepEqual(sent.map(([type, payload]) => [type, payload.species, payload.radius, payload.y]), [
        ['animalSummon', 'pig', 8, 0], ['animalSummon', 'goat', 20, 0],
        // A hopper does not walk where it is told: it only exists, around its home.
        ['animalSummon', 'frog', 0, 0]
    ]);
    assert.ok(Math.hypot(sent[0][1].x - 0.5, sent[0][1].z - 0.5) <= 2.01, 'two steps from the player');
    assert.equal(sent[0][1].speed, 0.38, 'its pace, for the server to give it time to arrive');
    game.animalsCommand('animal', ['bee']);
    game.animalsCommand('animal', []);
    assert.equal(sent.length, 3);
    assert.match(said[1], /pig/);
    // (As whole words: a species may have one of them inside its name, as beelzebufo has.)
    assert.doesNotMatch(said[1], /\b(bee|fish)\b/);

    const social = fs.readFileSync(path.join(JS, 'game', 'social.js'), 'utf8');
    assert.match(social, /case 'animal':\s+this\.animalsCommand\(normalized, args\);/);
});
