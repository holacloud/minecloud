// Node tests for how the animals of the sea live (js/game/sea_animals.js, the 'cruise' movement) and for the three
// species on it (trilobite.js, ammonite.js, plesiosaur.js). The real mobs.js, sea_animals.js, camera.js and world.js
// run on a simulated world of water, rock and glass; only drawing and sound are left out, and each mob gets the rig
// of its real model (its parts, with nothing to draw). Each frame is what the game does: updateAmbientMobs.
// Run with: node --test test/js/sea_animals.test.js
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
    setScalar(s) { return this.set(s, s, s); }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    length() { return Math.hypot(this.x, this.y, this.z); }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
    applyAxisAngle() { return this; }
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

// A hostile animal of the sea and a small one, made up: the game has none yet, and the movement has to be ready
// for the ones to come. Registered as a species' own file would, with a model of one box.
const FIXTURES = `
registerSpecies('made_up_shark', {
    info: { eggColor: 0x445566, tone: 90, maxHealth: 24, speed: 1.2, hostile: true, attackDamage: 3, chaseDistance: 9, movement: 'cruise', seaDepth: 0.5, hiddenUntilDiscovered: true },
    model(b) { b.part('body', { pivot: [0, 0, 0], from: [-5, 0, -20], size: [10, 10, 40] }); b.part('jaw', { parent: 'body', pivot: [0, 2, 16], from: [-4, -1, 0], size: [8, 1, 4] }); },
    trap: { baits: [] }
});
`;

const storage = new Map([['minecloud-guide-lang', 'EN']]);
function loadGame() {
    const THREE = new Proxy({ Vector3, Vector2: Vector3, Vector4: Vector3, Object3D, Group: Object3D, Mesh: class extends Object3D {} },
        { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const context = vm.createContext({
        console: { ...console, warn() {} }, performance: { now: () => 0 }, THREE, navigator: {}, requestAnimationFrame: () => 0,
        Worker: class { postMessage() {} terminate() {} }, setTimeout() {},
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; } },
        document: { createElement: (tag) => (tag === 'canvas' ? canvasStub() : anyStub()), addEventListener() {}, body: anyStub(), head: anyStub(), getElementById: () => null, querySelector: () => null },
        addEventListener() {},
        localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); }, removeItem: (key) => storage.delete(key) }
    });
    context.window = context;
    vm.runInContext('class Game {}', context);
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1])
        .filter((src) => !/^(https?:)?\/\//.test(src) && !print.SKIP_SCRIPTS.test(src));
    for (const src of scripts) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    vm.runInContext(FIXTURES, context, { filename: 'fixtures' });
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, Game, CameraController, VoxelModels, VoxelModelBuilder, MOB_BEHAVIOURS, MOB_SPECIES,
        SEA, seaAnimalsBody, getMobSpecies, mobMovementIs, setGameLang, WATER_SURFACE_HEIGHT });
        // Nothing of the other features runs after the mobs: this is about how these swim.
        FRAME_UPDATERS.length = 0;`, context);
    return context;
}
const ctx = loadGame();
const SURFACE = ctx.WATER_SURFACE_HEIGHT;
const EYE = 1.62;
const SEA_SPECIES = Object.keys(ctx.MOB_SPECIES).filter((id) => ctx.MOB_SPECIES[id].movement === 'cruise');
const REAL_SPECIES = SEA_SPECIES.filter((id) => !id.startsWith('made_up'));
// The first three of them, which is what is pinned here by name and by number. What is a rule of the movement is
// checked for every species there is (REAL_SPECIES), so that the next sea animal is held to it too.
const FIRST = ['trilobite', 'ammonite', 'plesiosaur'];

// Same numbers every run.
function seedRandom(seed) {
    vm.runInContext(`(() => { let s = ${seed} >>> 0; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })()`, ctx);
}

// The rig of a species' real model, as VoxelModels.createMob gives it, with nothing to draw: every part is there,
// turned as the model turns it, so that what the movement does to the rig can be looked at.
function rigOf(species) {
    const build = ctx.VoxelModels.mobBuilders[species];
    const b = new ctx.VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'skin' });
    const rig = (build && build.call(ctx.VoxelModels, b, 0)) || {};
    const parts = {};
    for (const part of b.parts) {
        const node = new Object3D();
        if (part.rotation) node.rotation.set(...part.rotation);
        node.userData.baseRotation = node.rotation.clone();
        parts[part.name] = node;
    }
    const pick = (names) => (names || []).map((name) => parts[name]).filter(Boolean);
    return { modelRoot: new Object3D(), modelParts: parts, legs: pick(rig.legs), arms: pick(rig.arms), wings: pick(rig.wings), tail: pick(rig.tail), head: rig.head ? parts[rig.head] : null, legAxis: 'x' };
}

// A world of grass up to y = 0 (the top of the cells at y = -1), with water wherever `water(x, y, z)` says and
// whatever else `block(x, y, z)` names ('glass', 'stone', or 'air' for a hole). The player stands at `player`,
// out of the water unless the test says otherwise. Chunks arrive as in the game.
function makeSea({ water = () => false, block = () => null, player = [0.5, 0.5], seed = 1 } = {}) {
    seedRandom(seed);
    const scene = new Object3D();
    const world = new ctx.WorldRenderer(scene);
    world.renderDistance = 3;
    world.rebuildChunk = () => {};
    world.addRipple = () => {};
    const requested = [];
    world.setChunkSource({ connected: () => true, request: (chunks) => requested.push(...chunks), focus() {} });
    // Counted, to see what a swimmer costs.
    const real = world.getBlockTypeAt.bind(world);
    const counts = { looks: 0 };
    world.getBlockTypeAt = (x, y, z) => { counts.looks++; return real(x, y, z); };

    const camera = { position: new Vector3(player[0], EYE + 0.01, player[1]), rotation: {} };
    const cameraController = new ctx.CameraController(camera, { addEventListener() {} });
    cameraController.setGameplayCheck(() => true);
    cameraController.isLocked = true;
    cameraController.setBlockChecker((bx, by, bz) => world.hasSolidBlock(bx, by, bz));
    cameraController.setBlockTypeGetter((bx, by, bz) => real(bx, by, bz));
    cameraController.setBlockHeightGetter((bx, by, bz) => world.getCollisionHeight(bx, by, bz));
    cameraController.setCollisionBoxGetter((bx, by, bz) => world.getCollisionBoxes(bx, by, bz));
    cameraController.setColumnChecker((bx, bz) => world.getColumnAt(bx, bz));

    const said = [];
    const events = [];
    const hurt = [];
    const game = new ctx.Game();
    Object.assign(game, {
        world, scene, camera, cameraController, ambientMobs: [], mobSpawnedChunks: new Set(), mobSpawnTimer: 0,
        titleScreenOpen: false, respawnPending: false, weatherState: 'clear', timeOfDay: 0.3, otherPlayerMeshes: new Map(),
        network: { connected: true, send() {} }, playerName: 'me', eggsUsed: 0,
        getLocalPlayerPosition: () => camera.position,
        attachMobModel: (group) => { Object.assign(group.userData, rigOf(group.userData.modelSpecies || group.userData.species)); return { height: 1 }; },
        createMobHealthBar: () => new Object3D(), updateMobHealthBar() {}, getSelectedHeldItemType: () => null, offhandType: null,
        emitMobEvent: (event, mob) => events.push([event, mob]), isNightTime: () => false, playTone() {}, playNoiseBurst() {}, playPlaceSound() {},
        spawnSplash() {}, showHitIndicator() {}, consumeSelectedBlock() { game.eggsUsed++; return true; },
        applyDamage: (amount, reason, type) => hurt.push({ amount, reason, type }),
        receiveSystemMessage: ({ text }) => said.push(text), spawnMobsForChunk() {}, updateNaturalSpawning() {}, updateDroppedTails() {}, updatePoison() {},
        updateShadowSpawning() {}, updateSmokePuffs() {}
    });

    const extra = new Map();
    const typeAt = (x, y, z) => extra.get(`${x},${y},${z}`) ?? (water(x, y, z) ? 'water' : block(x, y, z) ?? (y <= -1 ? 'grass' : null));
    function columnFor(chunkX, chunkZ) {
        const column = new ctx.ChunkColumn(chunkX, chunkZ);
        for (let lx = 0; lx < 16; lx++) {
            for (let lz = 0; lz < 16; lz++) {
                for (let y = -16; y <= 12; y++) {
                    const type = typeAt(chunkX * 16 + lx, y, chunkZ * 16 + lz);
                    if (type && type !== 'air') column.set(lx, y, lz, world.registry.id(type));
                }
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
    for (let i = 0; i < 60; i++) {
        world.update(player[0], player[1]);
        deliver();
    }
    assert.ok(world.getColumnAt(Math.floor(player[0]), Math.floor(player[1])), 'the world is there');

    // A block put or taken while the game runs, as a player's edit reaches the loaded column.
    const setBlock = (x, y, z, type) => {
        extra.set(`${x},${y},${z}`, type || 'air');
        const column = world.getColumnAt(x, z);
        column.set(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16, type ? world.registry.id(type) : 0);
    };
    const wet = (x, y, z) => real(Math.floor(x), Math.floor(y), Math.floor(z)) === 'water';
    // In the water of the column at (x, z), at the depth the species likes; null where there is none.
    const spawn = (species, x, z, y = -1) => game.seaAnimalsSpawn(species, x, y, z);
    const frame = (delta = 1 / 30) => game.updateAmbientMobs(delta);
    // `each(t)` after every frame.
    const run = (seconds, each = null, delta = 1 / 30) => {
        for (let t = 0; t < seconds - 1e-9; t += delta) {
            frame(delta);
            if (each) each(t + delta);
        }
    };
    return { game, world, camera, cameraController, spawn, frame, run, said, events, hurt, counts, setBlock, wet };
}

// The surface of the water over a place, and its bed: the top of the highest cell of water of that column counted
// up from there (a little under the top of the cell), and the top of the block the lowest one rests on.
function waterOver(sea, x, y, z) {
    let top = Math.floor(y);
    while (sea.wet(x, top + 1, z)) top++;
    let bed = Math.floor(y);
    while (sea.wet(x, bed - 1, z)) bed--;
    return { surface: top + SURFACE, bed };
}

// What is wrong with where an animal is, as a list (empty when nothing): its middle out of the water, a point of
// its body in a wall or in the bed, its back over the surface. The points are those the movement itself keeps wet
// (seaAnimalsBody), found again here from where the mob is and where it points.
function bodyProblems(sea, mob) {
    const problems = [];
    const state = mob.userData.sea;
    const body = state.body;
    const { x, y, z } = mob.position;
    if (!sea.wet(x, y + 0.02, z)) return [`its middle is out of the water at ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`];
    const facing = state.heading + state.flip;
    for (let i = 0; i < body.points.length; i += 2) {
        const px = x + Math.cos(facing) * body.points[i] + Math.sin(facing) * body.points[i + 1];
        const pz = z + Math.sin(facing) * body.points[i] - Math.cos(facing) * body.points[i + 1];
        for (const py of [y + 0.02, y + body.height - 0.02]) {
            if (!sea.wet(px, py, pz)) problems.push(`a point of its body (${body.points[i].toFixed(2)} along, ${body.points[i + 1].toFixed(2)} across) is out of the water at ${px.toFixed(2)}, ${py.toFixed(2)}, ${pz.toFixed(2)}`);
        }
    }
    const { surface, bed } = waterOver(sea, x, y + 0.02, z);
    if (y + body.height > surface + 1e-6) problems.push(`its back is ${(y + body.height - surface).toFixed(3)} over the surface`);
    if (y < bed - 1e-6) problems.push(`it is ${(bed - y).toFixed(3)} into the bed`);
    return problems;
}

// Runs the sea for `seconds` and fails at the first frame anything is wrong with any of these animals. Returns
// what they did, each: how far it swam, how far it got from its home, and how often it changed the side it turns to.
function swim(sea, mobs, seconds, each = null) {
    const stats = mobs.map((mob) => ({ mob, swum: 0, farthest: 0, lowest: Infinity, highest: -Infinity, flips: 0, side: 0, last: mob.position.clone(), heading: mob.userData.sea.heading }));
    sea.run(seconds, (t) => {
        for (const stat of stats) {
            const mob = stat.mob;
            assert.deepEqual(bodyProblems(sea, mob), [], `${mob.userData.species} after ${t.toFixed(2)} s`);
            stat.swum += Math.hypot(mob.position.x - stat.last.x, mob.position.z - stat.last.z);
            stat.last.copy(mob.position);
            stat.farthest = Math.max(stat.farthest, Math.hypot(mob.position.x - mob.userData.home.x, mob.position.z - mob.userData.home.z));
            stat.lowest = Math.min(stat.lowest, mob.position.y);
            stat.highest = Math.max(stat.highest, mob.position.y);
            // A change of the side it turns to: a turn of some size one way after one the other way.
            const turned = mob.userData.sea.heading - stat.heading;
            stat.heading = mob.userData.sea.heading;
            const side = Math.abs(turned) < 1e-4 ? 0 : Math.sign(turned);
            if (side && stat.side && side !== stat.side) stat.flips++;
            if (side) stat.side = side;
        }
        if (each) each(t);
    });
    for (const stat of stats) log(stat.mob.userData.species, 'swam', stat.swum.toFixed(1), 'farthest', stat.farthest.toFixed(1), 'y', stat.lowest.toFixed(2), stat.highest.toFixed(2), 'turn flips', stat.flips);
    return stats;
}

// Tanks cut into the ground: water from y = -depth to y = -1, its surface a little under the ground.
const tank = (x0, x1, z0, z1, depth) => (x, y, z) => x >= x0 && x < x1 && z >= z0 && z < z1 && y >= -depth && y <= -1;
const openSea = (depth) => (x, y, z) => y >= -depth && y <= -1;

// ---- The body it is measured by ----

test('the body of each species is read from its model: the size the table of species asks for', () => {
    const size = (id) => {
        const body = ctx.seaAnimalsBody(id);
        log(id, 'front', body.front.toFixed(2), 'back', body.back.toFixed(2), 'half', body.half.toFixed(2), 'height', body.height.toFixed(2), 'points', body.points.length / 2);
        return body;
    };
    const trilobite = size('trilobite');
    assert.ok(Math.abs(trilobite.length - 0.45) < 0.06, `a trilobite is about 0.45 blocks long: ${trilobite.length}`);
    const ammonite = size('ammonite');
    // Its shell, without the tentacles: the three boxes of its disc.
    assert.ok(Math.abs(ammonite.height - 0.6) < 0.05, `the shell of an ammonite is about 0.6 blocks across: ${ammonite.height}`);
    const plesiosaur = size('plesiosaur');
    assert.ok(Math.abs(plesiosaur.length - 5) < 0.2, `a plesiosaur is about 5 blocks long: ${plesiosaur.length}`);
    // The points that have to stay wet: its middle first, then its spine from tail to nose, never further apart
    // than a block, and its two sides when it is broad.
    for (const id of SEA_SPECIES) {
        const body = ctx.seaAnimalsBody(id);
        assert.deepEqual([body.points[0], body.points[1]], [0, 0], id);
        const spine = [];
        for (let i = 2; i < body.points.length; i += 2) if (body.points[i + 1] === 0) spine.push(body.points[i]);
        assert.ok(spine[0] < 0 && spine[spine.length - 1] > 0, id);
        for (let i = 1; i < spine.length; i++) assert.ok(spine[i] - spine[i - 1] <= 1, `${id}: two points of its spine ${spine[i] - spine[i - 1]} apart`);
        assert.equal(body.points.length / 2 - 1 - spine.length, body.half * 0.85 > 0.4 ? 2 : 0, `${id}: its sides`);
    }
    assert.equal(ctx.seaAnimalsBody('plesiosaur'), plesiosaur, 'measured once');
});

test('every part of a sea animal is painted whole: sizes in quarters of a unit, or a line of it shows black', () => {
    // A face is allocated the texels its size rounds up to and painted the ones it rounds to (js/models.js): a size
    // that is not a multiple of a quarter of a unit leaves a row unpainted, which the game draws black.
    for (const id of REAL_SPECIES) {
        const b = new ctx.VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'skin' });
        ctx.VoxelModels.mobBuilders[id].call(ctx.VoxelModels, b, 0);
        assert.ok(b.parts.length >= 8 && b.parts.length <= 40, `${id} has ${b.parts.length} parts`);
        for (const part of b.parts) {
            for (const length of part.size) assert.ok(Math.abs(length * 4 - Math.round(length * 4)) < 1e-9 && length > 0, `${id}.${part.name}: a side of ${length}`);
            // And nothing of it under its feet, as it stands: the bed is at y = 0 for the movement. (A little leg
            // is splayed out, and does not hang as low as its box does before it is turned.)
            let y = part.pivot[1];
            for (let parent = part.parent && b.byName.get(part.parent); parent; parent = parent.parent && b.byName.get(parent.parent)) y += parent.pivot[1];
            assert.ok(y + part.from[1] >= -0.5, `${id}.${part.name} hangs ${-(y + part.from[1])} under its feet`);
        }
    }
});

// ---- Never out of the water ----

test('in a tank a little bigger than itself, each one turns about without ever leaving the water or going through a wall', () => {
    for (const [species, x1, z1, depth] of [['trilobite', 3, 2, 1], ['ammonite', 3, 3, 2], ['plesiosaur', 9, 7, 3], ['made_up_shark', 6, 5, 2]]) {
        const sea = makeSea({ water: tank(0, x1, 0, z1, depth), player: [-6.5, 0.5], seed: 7 });
        const mob = sea.spawn(species, x1 / 2, z1 / 2);
        assert.ok(mob, species);
        assert.equal(mob.userData.sea.badTotal, 0, `${species} fits where it appears`);
        const [stat] = swim(sea, [mob], 180);
        // It does not shake: it changes the side it turns to now and then, not many times a second.
        assert.ok(stat.flips < 180 * 0.8, `${species} changed the side it turns to ${stat.flips} times in 180 s`);
        assert.ok(stat.swum > 2, `${species} only swam ${stat.swum.toFixed(2)} blocks in 180 s`);
    }
});

test('in a big tank each one swims about, and still never touches the walls, the bed or the surface', () => {
    const sea = makeSea({ water: tank(-10, 12, -9, 9, 5), player: [-20.5, 0.5], seed: 3 });
    const mobs = [sea.spawn('trilobite', -6, -5), sea.spawn('ammonite', 4, 4), sea.spawn('plesiosaur', 1, 0), sea.spawn('made_up_shark', 6, -5)];
    const stats = swim(sea, mobs, 240);
    for (const stat of stats) {
        const info = ctx.getMobSpecies(stat.mob.userData.species);
        assert.ok(stat.swum > info.speed * 240 * 0.12, `${stat.mob.userData.species} swam ${stat.swum.toFixed(1)} blocks in 240 s at ${info.speed}`);
        assert.ok(stat.flips < 240 * 0.8, `${stat.mob.userData.species}: ${stat.flips} changes of side`);
    }
    // The plesiosaur uses its tank: it is seen at both ends of it.
    assert.ok(stats[2].farthest > 4, `the plesiosaur stayed within ${stats[2].farthest.toFixed(1)} blocks`);
});

test('each looks ahead by the size of its own body: the plesiosaur turns well before a wall, the trilobite close to it', () => {
    // Head on to the wall at x = 30 of a long tank, from where it cannot yet matter, with its home right by that
    // wall: what turns it is the wall, not how far it is from home.
    const gap = {};
    for (const species of ['trilobite', 'ammonite', 'plesiosaur', 'made_up_shark']) {
        const sea = makeSea({ water: tank(0, 30, 0, 14, 4), player: [-6.5, 0.5], seed: 19 });
        const mob = sea.spawn(species, 12, 7);
        const state = mob.userData.sea;
        mob.userData.home.set(28.5, mob.position.y, 7);
        Object.assign(state, { heading: 0, steer: 0, wander: 0, arc: 0, wanderTimer: 1e6, restTimer: 1e6, resting: false, idle: 0, breath: 1e6 });
        let turnedAt = null;
        let nearest = Infinity;
        let fastestTurn = 0;
        let heading = 0;
        let fastNear = 0;
        swim(sea, [mob], 90, () => {
            const nose = mob.position.x + Math.cos(state.heading) * state.lead;
            if (turnedAt === null && Math.abs(state.heading) > 0.15) turnedAt = 30 - nose;
            nearest = Math.min(nearest, 30 - nose);
            fastestTurn = Math.max(fastestTurn, Math.abs(state.heading - heading) * 30);
            heading = state.heading;
            // Right at the wall it is all but stopped: it never arrives at speed.
            if (30 - nose < 0.3 && Math.cos(state.heading) > 0.7) fastNear = Math.max(fastNear, state.speed);
        });
        log(species, 'begins its turn', turnedAt === null ? 'never' : turnedAt.toFixed(2), 'blocks from the wall; nearest', nearest.toFixed(2), 'fastest turn', fastestTurn.toFixed(2), 'of', state.turnRate.toFixed(2), 'rad/s');
        assert.ok(turnedAt !== null, `${species} never turned`);
        gap[species] = turnedAt;
        // No snap: it turns at the pace of its body, never faster.
        assert.ok(fastestTurn <= state.turnRate * 1.02, `${species} turned at ${fastestTurn.toFixed(2)} rad/s, and its body turns at ${state.turnRate.toFixed(2)}`);
        assert.ok(fastNear < state.cruise * 0.5, `${species} reached the wall at ${fastNear.toFixed(2)} blocks a second`);
        assert.ok(nearest >= 0, `${species} put its nose ${(-nearest).toFixed(2)} into the wall`);
    }
    assert.ok(gap.plesiosaur > 2.5, `the plesiosaur began to turn ${gap.plesiosaur.toFixed(2)} blocks from the wall`);
    assert.ok(gap.trilobite < 1.2, `the trilobite began to turn ${gap.trilobite.toFixed(2)} blocks from the wall`);
    assert.ok(gap.plesiosaur > gap.made_up_shark && gap.made_up_shark > gap.ammonite && gap.ammonite > gap.trilobite - 0.2, 'the longer the body, the earlier the turn');
    // And a long body turns more slowly than a short one.
    const rate = (id) => ctx.SEA.turn / (1 + ctx.seaAnimalsBody(id).length);
    assert.ok(rate('plesiosaur') < 0.7 && rate('trilobite') > 2);
});

test('a tank of glass over the ground holds them as rock does: nothing of them comes out through a pane', () => {
    // Water from y = 0 to y = 3 inside walls of glass, with air all around and over it.
    const inside = (x, z) => x >= 0 && x < 12 && z >= 0 && z < 9;
    const sea = makeSea({
        water: (x, y, z) => inside(x, z) && y >= 0 && y <= 3,
        block: (x, y, z) => (y >= 0 && y <= 4 && !inside(x, z) && x >= -1 && x <= 12 && z >= -1 && z <= 9 ? 'glass' : null),
        player: [-8.5, 0.5], seed: 11
    });
    const mobs = [sea.spawn('plesiosaur', 6, 4.5, 1), sea.spawn('ammonite', 2, 2, 1), sea.spawn('trilobite', 9, 7, 0)];
    for (const mob of mobs) assert.ok(mob);
    const stats = swim(sea, mobs, 200);
    // The breather found the air over its tank.
    assert.ok(stats[0].highest > 3 + SURFACE - ctx.seaAnimalsBody('plesiosaur').height - 0.2, `the plesiosaur got up to ${stats[0].highest.toFixed(2)}`);
});

// ---- Around its home ----

test('in the open sea each one stays within a few blocks of its home', () => {
    const sea = makeSea({ water: openSea(4), player: [0.5, 0.5], seed: 5 });
    sea.camera.position.y = 6;
    const mobs = FIRST.map((id, i) => sea.spawn(id, 8 + i * 9, -14));
    const stats = swim(sea, mobs, 400);
    for (const stat of stats) {
        const state = stat.mob.userData.sea;
        log(stat.mob.userData.species, 'range', state.range.toFixed(1), 'farthest', stat.farthest.toFixed(1));
        assert.ok(stat.farthest < state.range + state.body.length * 0.6 + 1.5, `${stat.mob.userData.species} got ${stat.farthest.toFixed(1)} blocks from its home, and its range is ${state.range.toFixed(1)}`);
        // And it does use that room: it is no statue.
        assert.ok(stat.farthest > state.range * 0.3, `${stat.mob.userData.species} never left its home by more than ${stat.farthest.toFixed(1)}`);
    }
});

// ---- Where each likes to be ----

test('the trilobite walks on the bed, up and down its steps, and the ammonite hangs in mid water', () => {
    // A bed in terraces: one block higher every four blocks towards +x, under four blocks of water at the deep end.
    const bedAt = (x) => -5 + Math.max(0, Math.min(3, Math.floor((x + 6) / 4)));
    const sea = makeSea({ water: (x, y, z) => y >= bedAt(x) + 1 - 1 && y <= -1 && y >= bedAt(x), player: [0.5, 30.5], seed: 9 });
    const trilobite = sea.spawn('trilobite', 0.5, 0.5);
    const ammonite = sea.spawn('ammonite', -4.5, -6.5);
    const levels = new Set();
    let offBed = 0;
    let frames = 0;
    swim(sea, [trilobite, ammonite], 400, () => {
        frames++;
        const { x, y, z } = trilobite.position;
        const { bed } = waterOver(sea, x, y + 0.02, z);
        levels.add(bed);
        // On the bed, but for the moment it takes to climb a step or to sink off one. (With its head on a step
        // and its tail over the edge, the bed it is on is the one under its head.)
        const state = trilobite.userData.sea;
        const ahead = waterOver(sea, x + Math.cos(state.heading) * state.lead, y + 0.02, z + Math.sin(state.heading) * state.lead);
        if (y - bed > 0.12 && y - ahead.bed > 0.12) offBed++;
        const depth = waterOver(sea, ammonite.position.x, ammonite.position.y + 0.02, ammonite.position.z);
        assert.ok(ammonite.position.y - depth.bed > 0.25, `the ammonite is on the bed: ${ammonite.position.y - depth.bed}`);
    });
    log('trilobite: beds', [...levels].join(), 'frames off the bed', offBed, 'of', frames);
    assert.ok(levels.size >= 2, `the trilobite stayed on one step of the bed: ${[...levels].join()}`);
    assert.ok(offBed < frames * 0.1, `the trilobite was off the bed ${offBed} frames of ${frames}`);
});

test('the plesiosaur comes up to breathe: its back at the surface, its head lifted out, and down again', () => {
    const sea = makeSea({ water: tank(-12, 12, -10, 10, 6), player: [-20.5, 0.5], seed: 2 });
    const mob = sea.spawn('plesiosaur', 0, 0);
    const state = mob.userData.sea;
    const body = state.body;
    const surface = -1 + SURFACE;
    let breaths = 0;
    let breathing = false;
    let lifted = 0;
    let deepest = Infinity;
    swim(sea, [mob], 200, () => {
        if (state.gulp > 0 && !breathing) {
            breaths++;
            // Its back just under the surface: its body does not come out, its head does.
            assert.ok(surface - (mob.position.y + body.height) < 0.2, `it breathes ${(surface - mob.position.y - body.height).toFixed(2)} under the surface`);
        }
        breathing = state.gulp > 0;
        if (breathing) lifted = Math.max(lifted, state.rise);
        else deepest = Math.min(deepest, mob.position.y);
    });
    const info = ctx.getMobSpecies('plesiosaur');
    log('breaths', breaths, 'lifted', lifted.toFixed(2), 'deepest', deepest.toFixed(2));
    assert.ok(breaths >= 2 && breaths <= Math.ceil(200 / info.seaBreath[0]) + 1, `${breaths} breaths in 200 s`);
    assert.ok(lifted > 0.9, `its neck only lifted ${lifted}`);
    assert.ok(deepest < surface - body.height - 1.5, 'between two breaths it goes down');

    // What lifting is: every joint of its neck tips up, enough for its head to clear the water.
    const neck = state.neck;
    assert.equal(neck.length, 5);
    state.gulp = 3;
    sea.run(1.5);
    let angle = 0;
    let height = 0;
    for (const joint of neck) {
        assert.ok(joint.rotation.x < joint.userData.baseRotation.x - 0.1, 'a joint of its neck tips up');
        angle -= joint.rotation.x;
        height += Math.sin(angle) * 5 / 16;
    }
    assert.ok(height > 0.6, `its head rises ${height.toFixed(2)} blocks over the base of its neck`);
});

test('under a roof with no air it does not try for long, and it does not die of it', () => {
    // Water to the very roof: nothing to breathe.
    const sea = makeSea({ water: (x, y, z) => x >= -8 && x < 8 && z >= -8 && z < 8 && y >= -5 && y <= -1, block: (x, y, z) => (y === 0 ? 'stone' : null), player: [-20.5, 0.5], seed: 4 });
    const mob = sea.spawn('plesiosaur', 0, 0);
    let gulps = 0;
    swim(sea, [mob], 150, () => { if (mob.userData.sea.gulp > 0) gulps++; });
    assert.equal(gulps, 0);
    assert.ok(sea.game.ambientMobs.includes(mob));
});

// ---- The ways it comes to be ----

test('spawnKept gives an animal the server keeps its body, in ambientMobs, in the water over the place told', () => {
    const sea = makeSea({ water: tank(0, 10, 0, 8, 4), player: [-6.5, 0.5] });
    const behaviour = ctx.MOB_BEHAVIOURS.cruise;
    assert.equal(typeof behaviour.spawnKept, 'function');
    for (const trait of ['inWater', 'bodiless']) assert.equal(ctx.mobMovementIs('cruise', trait), true, trait);
    for (const trait of ['walksToGoal', 'tameable', 'nudgedToBait']) assert.equal(ctx.mobMovementIs('cruise', trait), false, trait);
    for (const species of REAL_SPECIES) {
        assert.equal(sea.game.animalsCanKeep(species, false), true, `${species} can be kept with no owner`);
        // As js/game/animals.js calls it: the bed under the cell the machine put it in.
        const mob = behaviour.spawnKept.call(sea.game, species, new Vector3(5.5, -4, 4.5), { variant: 1 });
        assert.ok(mob && sea.game.ambientMobs.includes(mob), species);
        assert.equal(mob.userData.variant, 1);
        assert.equal(mob.userData.natural, undefined, 'never a wild one');
        assert.ok(Math.abs(mob.position.x - 5.5) < 1e-9 && Math.abs(mob.position.z - 4.5) < 1e-9, 'at the place');
        assert.ok(mob.userData.home.x === 5.5 && mob.userData.home.z === 4.5, 'which is its home');
        assert.deepEqual(bodyProblems(sea, mob).filter((line) => /middle|surface|bed/.test(line)), [], species);
    }
    const [trilobite, ammonite, plesiosaur] = sea.game.ambientMobs;
    assert.ok(trilobite.position.y < -3.9, 'the trilobite on the bed');
    assert.ok(ammonite.position.y > -3.5 && plesiosaur.position.y > -3.5, 'the others in mid water');
    // Told a cell of the water itself, or a place over it, it still goes in.
    assert.ok(behaviour.spawnKept.call(sea.game, 'ammonite', new Vector3(2.5, -2, 2.5), { variant: 0 }));
    assert.ok(behaviour.spawnKept.call(sea.game, 'ammonite', new Vector3(2.5, 0, 2.5), { variant: 0 }));
    // And on land there is no body: the place is asked again later (js/game/animals.js), never made dry.
    const before = sea.game.ambientMobs.length;
    assert.equal(behaviour.spawnKept.call(sea.game, 'plesiosaur', new Vector3(-3.5, 0, 0.5), { variant: 0 }), null);
    assert.equal(sea.game.ambientMobs.length, before);
    // They all live on from there.
    swim(sea, sea.game.ambientMobs.slice(1, 3), 30);
});

test('told of by the server, a revived one gets its body through js/game/animals.js and lives around the home the server says', () => {
    const sea = makeSea({ water: tank(0, 18, 0, 14, 4), player: [-6.5, 0.5], seed: 21 });
    const game = sea.game;
    game.network.playerId = 'me';
    game.animalsForgetAll();
    // What a frame of the server says of one the machine has just revived in the cell of water (3, -2, 2), near
    // a corner of its pool: nobody's, roaming, never walked (Radius 0), with a blow already taken.
    const told = (id, species, x, y, z) => ({ id, species, variant: 1, mode: 0, home: { x, y, z }, place: { x: 0, y: 0, z: 0 }, hurt: 8, walk: null, owned: false, session: '', ownerName: '', extra: '', walked: false });
    game.animalsNew(told(7, 'plesiosaur', 3.5, -2, 2.5));
    assert.equal(game.ambientMobs.length, 1);
    const mob = game.ambientMobs[0];
    const data = mob.userData;
    assert.equal(data.species, 'plesiosaur');
    assert.equal(data.animalId, 7);
    assert.equal(data.animalForeign, true, 'nothing here says where it goes: its own movement does');
    assert.deepEqual([data.home.x, data.home.y, data.home.z], [3.5, -2, 2.5], 'its home is the server\'s, the same for everybody');
    assert.equal(data.health, data.maxHealth - 4, 'and so is its health');
    assert.ok(sea.wet(mob.position.x, mob.position.y + 0.02, mob.position.z));
    assert.equal(game.getMobGoal(mob, 0), null, 'the server walks it nowhere');
    // Every frame as the game runs them: the mobs, then animals.js. It works its way out of the corner and
    // then lives around that home, never moved by anything but its own swimming.
    let farthest = 0;
    let jumps = 0;
    const last = mob.position.clone();
    for (let t = 0; t < 150; t += 1 / 30) {
        game.updateAmbientMobs(1 / 30);
        game.animalsUpdate(1 / 30);
        assert.ok(sea.wet(mob.position.x, mob.position.y + 0.02, mob.position.z));
        if (mob.position.distanceTo(last) > 0.3) jumps++;
        last.copy(mob.position);
        if (t > 30) {
            assert.deepEqual(bodyProblems(sea, mob), [], `after ${t.toFixed(1)} s`);
            farthest = Math.max(farthest, Math.hypot(mob.position.x - 3.5, mob.position.z - 2.5));
        }
    }
    assert.equal(jumps, 0, 'it is never put anywhere');
    assert.ok(farthest < data.sea.range + 5, `it got ${farthest.toFixed(1)} blocks from its home`);
    assert.deepEqual([data.home.x, data.home.y, data.home.z], [3.5, -2, 2.5]);

    // One whose water is not there (its pool was emptied before this player came): no body, and it is asked
    // again every half second until there is water.
    game.animalsNew(told(8, 'ammonite', 30.5, -2, 30.5));
    assert.equal(game.ambientMobs.length, 1);
    for (let i = 0; i < 60; i++) game.animalsUpdate(1 / 30);
    assert.equal(game.ambientMobs.length, 1);
    for (let x = 29; x <= 31; x++) for (let z = 29; z <= 31; z++) for (let y = -2; y <= -1; y++) sea.setBlock(x, y, z, 'water');
    for (let i = 0; i < 30; i++) game.animalsUpdate(1 / 30);
    assert.equal(game.ambientMobs.length, 2, 'the water is back, and so is it');
    assert.equal(game.ambientMobs[1].userData.animalId, 8);
});

test('/mob and an egg put it in the nearest water, and on dry land say that it needs water, in both languages', () => {
    const dry = makeSea({ player: [0.5, 0.5] });
    for (const [lang, words] of [['EN', /sea animal and needs water/], ['ES', /animal marino y necesita agua/]]) {
        ctx.setGameLang(lang);
        try {
            for (const species of REAL_SPECIES) {
                dry.said.length = 0;
                dry.game.spawnMobFromCommand([species]);
                assert.equal(dry.game.ambientMobs.length, 0, `${species} on dry land`);
                assert.equal(dry.said.length, 1);
                assert.match(dry.said[0], words, `${lang}: ${dry.said[0]}`);
                dry.said.length = 0;
                dry.game.spawnAnimalFromEgg(species, { x: 3, y: -1, z: 3 });
                assert.equal(dry.game.ambientMobs.length, 0);
                assert.match(dry.said[0], words);
                assert.equal(dry.game.eggsUsed, 0, 'the egg is kept');
            }
        } finally {
            ctx.setGameLang('EN');
        }
    }
    // The name is the card's, in the language of the game.
    ctx.setGameLang('ES');
    dry.said.length = 0;
    dry.game.spawnMobFromCommand(['plesiosaur']);
    ctx.setGameLang('EN');
    assert.match(dry.said[0], /^Plesiosaurio: /);

    // A pond that begins five blocks ahead (/mob looks three blocks in front of the player and ten around that).
    // Each appears in the nearest water where the whole of it fits: the small ones at the bank, the plesiosaur
    // out where it has room.
    const pond = makeSea({ water: tank(-6, 7, -18, -5, 3), player: [0.5, 0.5] });
    for (const species of FIRST) {
        pond.said.length = 0;
        pond.game.spawnMobFromCommand([species]);
        const mob = pond.game.ambientMobs[pond.game.ambientMobs.length - 1];
        assert.ok(mob && mob.userData.species === species, `${species}: ${pond.said.join()}`);
        assert.deepEqual(bodyProblems(pond, mob), [], species);
        assert.match(pond.said[0], /now swimming in the water/);
    }
    assert.equal(pond.game.ambientMobs.length, 3);
    assert.ok(pond.game.ambientMobs[0].position.z > -6, 'the trilobite in the first row of water');
    assert.ok(pond.game.ambientMobs[2].position.z < -6, 'the plesiosaur a little further out, where its flippers clear the bank');
    // An egg used on the bank, two blocks from the water.
    pond.game.spawnAnimalFromEgg('ammonite', { x: 0, y: -1, z: -3 });
    assert.equal(pond.game.ambientMobs.length, 4);
    assert.equal(pond.game.eggsUsed, 1);
    swim(pond, pond.game.ambientMobs, 20);
    // In a pond too small for the whole of it, it still goes in the water: where most of it fits.
    const puddle = makeSea({ water: tank(-1, 2, -6, -3, 2), player: [0.5, 0.5] });
    puddle.game.spawnMobFromCommand(['plesiosaur']);
    assert.equal(puddle.game.ambientMobs.length, 1);
    const stuck = puddle.game.ambientMobs[0];
    assert.ok(puddle.wet(stuck.position.x, stuck.position.y + 0.02, stuck.position.z));
    assert.ok(Math.abs(stuck.position.x - 0.5) < 1e-9 && Math.abs(stuck.position.z - -4.5) < 1e-9, 'in the middle of it');
});

test('one that appears where it does not fit only ever gets out: never further into the wall', () => {
    // A plesiosaur in the corner cell of a big tank: half of it is in the rock to begin with.
    const sea = makeSea({ water: tank(0, 16, 0, 14, 5), player: [-8.5, 0.5], seed: 6 });
    const mob = sea.spawn('plesiosaur', 0.5, 0.5);
    const state = mob.userData.sea;
    assert.ok(state.badTotal > 0, 'it does not fit there');
    let worst = state.badTotal;
    let free = -1;
    sea.run(90, (t) => {
        assert.ok(sea.wet(mob.position.x, mob.position.y + 0.02, mob.position.z), 'its middle stays in the water');
        const out = bodyProblems(sea, mob).filter((line) => /point of its body/.test(line)).length;
        assert.ok(state.badTotal <= worst, `it went further in after ${t.toFixed(1)} s: ${state.badTotal} > ${worst}`);
        worst = state.badTotal;
        if (out === 0 && free < 0) free = t;
    });
    log('free of the corner after', free.toFixed(1), 's');
    assert.ok(free >= 0 && free < 60, 'it works its way out');
    assert.deepEqual(bodyProblems(sea, mob), []);
});

// ---- Struck ----

test('struck, it takes the blow through damageMobByPlayer and darts away from the player; the last blow defeats it', () => {
    const sea = makeSea({ water: openSea(4), player: [0.5, 0.5], seed: 8 });
    const mob = sea.spawn('plesiosaur', 0.5, -3);
    const state = mob.userData.sea;
    sea.run(3);
    const from = Math.hypot(mob.position.x - 0.5, mob.position.z - 0.5);
    const health = mob.userData.health;
    ctx.MOB_BEHAVIOURS.cruise.interact.call(sea.game, mob);
    assert.equal(mob.userData.health, health - 4, 'a bare hand takes 4');
    assert.deepEqual(sea.events.filter(([event]) => event === 'damaged').length, 1, 'and animals.js hears it');
    assert.ok(state.flee > 0);
    let fastest = 0;
    swim(sea, [mob], 2.5, () => { fastest = Math.max(fastest, state.speed); });
    const info = ctx.getMobSpecies('plesiosaur');
    assert.ok(fastest > info.speed * 1.5, `it only reached ${fastest.toFixed(2)} blocks a second`);
    assert.ok(Math.hypot(mob.position.x - 0.5, mob.position.z - 0.5) > from + 1.5, 'away from the player');
    // Nine more blows: 40 of health.
    for (let i = 0; i < 8; i++) ctx.MOB_BEHAVIOURS.cruise.interact.call(sea.game, mob);
    assert.ok(sea.game.ambientMobs.includes(mob));
    sea.said.length = 0;
    ctx.MOB_BEHAVIOURS.cruise.interact.call(sea.game, mob);
    assert.ok(!sea.game.ambientMobs.includes(mob), 'gone');
    assert.deepEqual(sea.events.filter(([event]) => event === 'defeated').map(([, who]) => who), [mob], 'defeated once, through defeatMobByPlayer');
    assert.match(sea.said[0], /^Plesiosaur: /);
    // And the file does it no other way.
    const source = fs.readFileSync(path.join(STATIC, 'js', 'game', 'sea_animals.js'), 'utf8');
    assert.doesNotMatch(source, /userData\.health\s*-=|emitMobEvent\('defeated'|\.removeMob\(/);
});

test('a struck trilobite often rolls into a ball: it stays put, curled, and then makes off', () => {
    const sea = makeSea({ water: openSea(3), player: [0.5, 0.5], seed: 12 });
    const mob = sea.spawn('trilobite', 0.5, -2);
    const state = mob.userData.sea;
    // (More health than it has, to look at what it does blow after blow: a real one falls to the second.)
    assert.equal(mob.userData.maxHealth, 8);
    mob.userData.maxHealth = mob.userData.health = 40;
    sea.run(2);
    // The dice say ball (seaCurl is the chance).
    const info = ctx.getMobSpecies('trilobite');
    assert.ok(info.seaCurl > 0 && info.seaCurl < 1);
    vm.runInContext('Math.random = () => 0.01', ctx);
    ctx.MOB_BEHAVIOURS.cruise.interact.call(sea.game, mob);
    seedRandom(12);
    assert.ok(state.curl > 0, 'rolled up');
    const at = mob.position.clone();
    swim(sea, [mob], 2);
    assert.ok(Math.hypot(mob.position.x - at.x, mob.position.z - at.z) < 0.15, 'a ball does not walk');
    assert.ok(state.ball > 0.95);
    // Its plates curl under it, one after another, and its head folds the other way.
    const tail = mob.userData.tail;
    assert.equal(tail.length, 6);
    for (const plate of tail) assert.ok(plate.rotation.x < plate.userData.baseRotation.x - 0.3, 'a plate curls');
    assert.ok(mob.userData.head.rotation.x > mob.userData.head.userData.baseRotation.x + 0.5);
    // A blow on a ball does not make it a ball again for longer.
    const curl = state.curl;
    ctx.MOB_BEHAVIOURS.cruise.interact.call(sea.game, mob);
    assert.ok(state.curl <= curl);
    swim(sea, [mob], 6);
    assert.equal(state.curl <= 0, true, 'it opens');
    assert.ok(Math.hypot(mob.position.x - at.x, mob.position.z - at.z) > 0.3, 'and walks off');
    for (const plate of tail) assert.ok(Math.abs(plate.rotation.x - plate.userData.baseRotation.x) < 0.1, 'flat again');
    // With the other throw of the dice it runs.
    vm.runInContext('Math.random = () => 0.99', ctx);
    ctx.MOB_BEHAVIOURS.cruise.interact.call(sea.game, mob);
    seedRandom(13);
    assert.ok(state.curl <= 0 && state.flee > 0, 'no ball: away');
});

// ---- A hostile one ----

test('a hostile one goes for a player who is in the water and bites; a player on the shore is safe', () => {
    // A lake with a shore: water for x >= 0, land for x < 0.
    const sea = makeSea({ water: (x, y, z) => x >= 0 && y >= -4 && y <= -1, player: [-2.5, 0.5], seed: 10 });
    const shark = sea.spawn('made_up_shark', 6.5, 0.5);
    const state = shark.userData.sea;
    assert.equal(shark.userData.hostile, true);
    const info = ctx.getMobSpecies('made_up_shark');

    // On the shore, two blocks from the water and well within its sight: nothing, for a whole minute.
    sea.cameraController.isInWater = false;
    swim(sea, [shark], 60, () => assert.equal(state.hunting, false));
    assert.deepEqual(sea.hurt, [], 'safe on the shore');

    // In the water, four blocks out: it comes and bites, with its damage, again and again.
    sea.camera.position.set(4.5, -2 + EYE, 0.5);
    sea.cameraController.isInWater = true;
    let hunted = false;
    let nearest = Infinity;
    swim(sea, [shark], 20, () => {
        hunted = hunted || state.hunting;
        nearest = Math.min(nearest, Math.hypot(shark.position.x - 4.5, shark.position.z - 0.5));
    });
    log('bites', sea.hurt.length, 'nearest', nearest.toFixed(2));
    assert.ok(hunted, 'it goes for the player');
    assert.ok(sea.hurt.length >= 2, `${sea.hurt.length} bites in 20 s`);
    assert.ok(sea.hurt.length <= Math.ceil(20 / ctx.SEA.biteEvery), 'one bite at a time');
    for (const bite of sea.hurt) assert.deepEqual(bite, { amount: info.attackDamage, reason: 'You were bitten by a made up shark', type: 'mob' });

    // Back on the shore, right at the edge: it cannot follow, and it does not bite across the bank.
    sea.camera.position.set(-1.5, EYE, 0.5);
    sea.cameraController.isInWater = false;
    sea.hurt.length = 0;
    swim(sea, [shark], 40);
    assert.deepEqual(sea.hurt, []);
    assert.ok(shark.position.x > 0, 'it is still in its lake');

    // A dead player, or the title screen, is nobody to bite.
    sea.camera.position.set(4.5, -2 + EYE, 0.5);
    sea.cameraController.isInWater = true;
    sea.game.respawnPending = true;
    swim(sea, [shark], 10);
    assert.deepEqual(sea.hurt, []);

    // The peaceful ones never do, with the player among them.
    sea.game.respawnPending = false;
    const others = FIRST.map((id, i) => sea.spawn(id, 3.5 + i, 3.5));
    sea.game.ambientMobs = others;
    swim(sea, others, 30);
    assert.deepEqual(sea.hurt, []);
    for (const mob of others) assert.equal(mob.userData.hostile, false);
});

// ---- Its water taken away, and given back ----

test('with its pool emptied it lies on the ground and waits: it is not lost, and it swims again when the water is back', () => {
    const sea = makeSea({ water: tank(0, 4, 0, 3, 2), player: [-6.5, 0.5], seed: 14 });
    const mob = sea.spawn('ammonite', 2, 1.5);
    const state = mob.userData.sea;
    swim(sea, [mob], 5);
    for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) for (let y = -2; y <= -1; y++) sea.setBlock(x, y, z, null);
    sea.run(4);
    assert.equal(state.stranded, true);
    assert.ok(sea.game.ambientMobs.includes(mob), 'still there');
    assert.ok(Math.abs(mob.position.y - -2) < 0.01, `on the floor of the empty pool: ${mob.position.y}`);
    const at = mob.position.clone();
    sea.run(30);
    assert.ok(sea.game.ambientMobs.includes(mob), 'it does not die of it');
    assert.ok(Math.hypot(mob.position.x - at.x, mob.position.z - at.z) < 1e-9, 'and it goes nowhere');
    // A blow still counts.
    const health = mob.userData.health;
    ctx.MOB_BEHAVIOURS.cruise.interact.call(sea.game, mob);
    assert.equal(mob.userData.health, health - 4);
    // The water back.
    for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) for (let y = -2; y <= -1; y++) sea.setBlock(x, y, z, 'water');
    sea.run(1.5);
    assert.equal(state.stranded, false);
    const stats = swim(sea, [mob], 30);
    assert.ok(stats[0].swum > 0.5, 'it swims again');
});

test('a wall put in its way, or a block on its tail, is seen within a second or two and it goes round', () => {
    const sea = makeSea({ water: tank(0, 14, 0, 9, 4), player: [-6.5, 0.5], seed: 15 });
    const mob = sea.spawn('plesiosaur', 7, 4.5);
    swim(sea, [mob], 20);
    // A wall of stone across the middle of the tank, wherever the animal is not.
    const state = mob.userData.sea;
    for (let z = 0; z < 9; z++) {
        for (let y = -4; y <= -1; y++) {
            const x = mob.position.x < 7 ? 10 : 3;
            sea.setBlock(x, y, z, 'stone');
        }
    }
    // What was put may have caught a tip of it: from here on it only gets better.
    let worst = Infinity;
    sea.run(120, () => {
        assert.ok(sea.wet(mob.position.x, mob.position.y + 0.02, mob.position.z));
        if (state.recheck === ctx.SEA.recheck) {
            assert.ok(state.badTotal <= worst, 'never further into what was put');
            worst = state.badTotal;
        }
    });
    assert.equal(state.badTotal, 0);
});

// ---- What it costs ----

test('it looks at few blocks: a few times a second, and none at all on most frames', () => {
    const sea = makeSea({ water: openSea(5), player: [0.5, 0.5], seed: 16 });
    sea.camera.position.y = 6;
    const mobs = FIRST.map((id, i) => sea.spawn(id, -10 + i * 10, -12));
    sea.run(5);
    for (const mob of mobs) {
        sea.game.ambientMobs = [mob];
        sea.counts.looks = 0;
        let quiet = 0;
        let frames = 0;
        for (let i = 0; i < 60 * 60; i++) {
            const before = sea.counts.looks;
            sea.frame(1 / 60);
            frames++;
            if (sea.counts.looks === before) quiet++;
        }
        const each = sea.counts.looks / 60;
        log(mob.userData.species, 'looks at', each.toFixed(1), 'blocks a second;', ((quiet / frames) * 100).toFixed(0), '% of frames at none');
        // (A fish of the game looks at half a dozen every frame: some 360 a second.)
        assert.ok(each < 150, `${mob.userData.species} looks at ${each.toFixed(0)} blocks a second`);
        assert.ok(quiet / frames > 0.6, `${mob.userData.species} looks at blocks on ${frames - quiet} frames of ${frames}`);
    }
});

test('nothing is made on a frame: no vector, no list and no function in what runs every frame', () => {
    const source = fs.readFileSync(path.join(STATIC, 'js', 'game', 'sea_animals.js'), 'utf8');
    // (A bite and a breath do make the few numbers of their sound, when they happen.)
    for (const name of ['seaAnimalsUpdate', 'seaAnimalsSense', 'seaAnimalsMove', 'seaAnimalsFits', 'seaAnimalsProbe', 'seaAnimalsAnimate', 'seaAnimalsBreathe', 'seaAnimalsHunts', 'seaAnimalsColumn', 'seaAnimalsLookColumn', 'seaAnimalsAshore']) {
        const start = source.indexOf(`\n    ${name}(`);
        assert.ok(start > 0, name);
        const body = source.slice(start, source.indexOf('\n    },\n', start));
        assert.doesNotMatch(body, /\bnew [A-Z]|=>|\bfunction\b|\.clone\(\)|\.forEach\(|\.map\(|\.filter\(|=\s*\[|\{\s*[a-z]+:/, `${name} makes something`);
    }
});

// ---- What a species says ----

test('every sea field a species says is one the movement documents, and the three say what they are', () => {
    const source = fs.readFileSync(path.join(STATIC, 'js', 'game', 'sea_animals.js'), 'utf8');
    const documented = [...source.matchAll(/^\/\/ {3}(sea[A-Za-z]+) /gm)].map((match) => match[1]);
    assert.deepEqual(documented, ['seaDepth', 'seaBreath', 'seaJet', 'seaIdle', 'seaCurl', 'seaRange']);
    for (const field of documented) assert.ok(new RegExp(`info\\.${field}\\b`).test(source), `${field} is documented and never read`);
    for (const id of SEA_SPECIES) {
        for (const field of Object.keys(ctx.MOB_SPECIES[id])) if (field.startsWith('sea')) assert.ok(documented.includes(field), `${id} says ${field}, which the movement does not read`);
    }
    const info = (id) => ctx.MOB_SPECIES[id];
    assert.equal(info('trilobite').seaDepth, 'bed');
    assert.ok(info('ammonite').seaJet === true && typeof info('ammonite').seaDepth === 'number');
    assert.ok(Array.isArray(info('plesiosaur').seaBreath) && info('plesiosaur').seaBreath[0] < info('plesiosaur').seaBreath[1]);
    for (const id of FIRST) {
        assert.equal(info(id).hostile, undefined, `${id} is peaceful`);
        assert.equal(info(id).hiddenUntilDiscovered, true);
        assert.equal(info(id).ancestorOf, undefined);
    }
    assert.deepEqual(REAL_SPECIES.slice(0, 3), FIRST, 'in the order index.html loads them');
    // js/mobSpecies.js names the movement where it lists them all.
    assert.match(fs.readFileSync(path.join(STATIC, 'js', 'mobSpecies.js'), 'utf8'), /'cruise'[^\n]*\n[^\n]*js\/game\/sea_animals\.js/);
});

test('the ammonite goes shell first, in spurts; the plesiosaur beats its four flippers', () => {
    const sea = makeSea({ water: openSea(5), player: [0.5, 30.5], seed: 17 });
    const ammonite = sea.spawn('ammonite', 0.5, 0.5);
    const state = ammonite.userData.sea;
    // Its face looks one way and it travels the other: its model faces +z, turned half round from its heading.
    let spurts = 0;
    let coasting = 0;
    let moving = 0;
    let last = ammonite.position.clone();
    let wasFast = false;
    swim(sea, [ammonite], 60, () => {
        const dx = ammonite.position.x - last.x;
        const dz = ammonite.position.z - last.z;
        last = ammonite.position.clone();
        const step = Math.hypot(dx, dz);
        if (step > 1e-5) {
            moving++;
            // Where its tentacles point (the model's +z, by its rotation) against where it goes.
            const faceX = Math.sin(ammonite.rotation.y);
            const faceZ = Math.cos(ammonite.rotation.y);
            assert.ok((faceX * dx + faceZ * dz) / step < -0.9, 'it goes with its shell first');
        }
        const fast = state.speed > state.cruise;
        if (fast && !wasFast) spurts++;
        if (state.speed < state.cruise * 0.4) coasting++;
        wasFast = fast;
    });
    log('ammonite: spurts', spurts, 'frames coasting', coasting, 'moving', moving);
    assert.ok(spurts >= 8, `${spurts} spurts in a minute`);
    assert.ok(coasting > 300, 'and between two it coasts and hangs');
    // Its tentacles trail together in a spurt and open when it hangs.
    const arm = ammonite.userData.arms[0];
    assert.equal(ammonite.userData.arms.length, 6);
    state.thrust = 1;
    sea.game.seaAnimalsAnimate(ammonite, state, 0);
    const trailing = Math.abs(arm.rotation.x);
    state.thrust = 0;
    sea.game.seaAnimalsAnimate(ammonite, state, 0);
    assert.ok(trailing < Math.abs(arm.userData.baseRotation.x) * 0.6 && Math.abs(arm.rotation.x) > trailing, 'they close in a spurt');

    const plesiosaur = sea.spawn('plesiosaur', 12.5, 0.5);
    const wings = plesiosaur.userData.wings;
    assert.equal(wings.length, 4);
    const swing = wings.map(() => ({ low: Infinity, high: -Infinity }));
    let opposed = 0;
    let frames = 0;
    swim(sea, [plesiosaur], 20, () => {
        wings.forEach((wing, i) => {
            const lift = wing.rotation.z - wing.userData.baseRotation.z;
            swing[i].low = Math.min(swing[i].low, lift);
            swing[i].high = Math.max(swing[i].high, lift);
        });
        frames++;
        // Left and right of a pair mirror each other.
        if (Math.abs((wings[0].rotation.z - wings[0].userData.baseRotation.z) + (wings[1].rotation.z - wings[1].userData.baseRotation.z)) < 1e-9) opposed++;
    });
    for (const range of swing) assert.ok(range.high > 0.25 && range.low < -0.25, `a flipper only swings from ${range.low.toFixed(2)} to ${range.high.toFixed(2)}`);
    assert.equal(opposed, frames, 'the two of a pair beat together');
    // And its tail sways.
    assert.equal(plesiosaur.userData.tail.length, 3);
});
