// Node tests for motor-driven mechanics (js/game/mechanics.js): rams, arms, the lift, the pure
// helpers that move the player, and that MECHANICS_KINDS mirrors mechanicsKinds in
// pkg/network/mechanics.go (the server's simulation).
// Run with: node --test test/js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const JS = path.join(ROOT, 'pkg', 'web', 'static', 'js');

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
}
class Stub { constructor() { this.attributes = {}; } setAttribute() {} addGroup() {} setIndex() {} computeBoundingBox() {} computeBoundingSphere() {} }

function loadGame() {
    const context = vm.createContext({
        console, Math, Map, Set, Object, Array, Uint8Array, Uint16Array, Int16Array, Int32Array, Float32Array,
        performance: { now: () => 0 },
        THREE: { Vector3, Vector4: Vector3, BoxGeometry: Stub, BufferGeometry: Stub, Float32BufferAttribute: Stub },
        Worker: class { postMessage() {} },
        document: { addEventListener() {} },
        requestAnimationFrame: () => 0
    });
    context.window = context;
    const files = ['extensions.js', 'chunkStore.js', 'blockShapes.js', 'chunkMesher.js', 'camera.js', 'mobSpecies.js', 'blockTextures.js', 'world.js'];
    for (const file of files) vm.runInContext(fs.readFileSync(path.join(JS, file), 'utf8'), context, { filename: file });
    vm.runInContext('class Game {}; function resourcesDrawSprite() { return () => {}; } function resourcesDisplayMesh() { return null; }', context);
    for (const file of ['electricity.js', 'logic.js', 'mechanics.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    }
    vm.runInContext(`this.WorldRenderer = WorldRenderer; this.ChunkColumn = ChunkColumn; this.ELECTRIC_KINDS = ELECTRIC_KINDS;
        this.MECHANICS_KINDS = MECHANICS_KINDS; this.TEXTURE_PATTERNS = TEXTURE_PATTERNS; this.BLOCK_SHAPES = BLOCK_SHAPES;
        this.mechRotateBox = mechRotateBox; this.mechRamBoxes = mechRamBoxes; this.mechArmBoxes = mechArmBoxes;
        this.mechFacingFromLook = mechFacingFromLook; this.mechLiftGlide = mechLiftGlide; this.mechBodyShift = mechBodyShift;
        this.Game = Game;`, context);
    return context;
}

const ctx = loadGame();

function makeWorld() {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    world.getChunkMaterial = (type) => `material:${type}`;
    const column = new ctx.ChunkColumn(0, 0);
    const stone = world.registry.id('stone');
    for (let lx = 0; lx < 16; lx++) {
        for (let lz = 0; lz < 16; lz++) column.set(lx, 0, lz, stone);
    }
    world.columns.set(world.chunkKey(0, 0), column);
    return world;
}

const round = (box) => Array.from(box, (v) => Math.round(v * 1000) / 1000);

test('the client table mirrors mechanics.go', () => {
    const go = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'mechanics.go'), 'utf8');
    const start = go.indexOf('var mechanicsKinds');
    const table = go.slice(start, go.indexOf('\n}\n', start));
    const kinds = {};
    for (const [, id, role, watts] of table.matchAll(/"(\w+)":\s*\{Role: power(\w+), Watts: ([\d.]+)\}/g)) {
        kinds[id] = { role: role.toLowerCase(), watts: Number(watts) };
    }
    assert.deepEqual(kinds, JSON.parse(JSON.stringify(ctx.MECHANICS_KINDS)));
    for (const id of Object.keys(kinds)) assert.equal(ctx.ELECTRIC_KINDS[id], ctx.MECHANICS_KINDS[id], id);
    // The lift's speed and rope match the server's.
    const js = fs.readFileSync(path.join(JS, 'game', 'mechanics.js'), 'utf8');
    assert.match(go, /liftStepTime = 400 \* time\.Millisecond/);
    assert.match(js, /MECH_LIFT_SPEED = 2\.5;/);
    assert.match(go, /liftMaxRope = 48/);
    assert.match(js, /MECH_LIFT_ROPE = 48;/);
});

test('every state is a world block with its textures', () => {
    const world = makeWorld();
    const names = ['motor_ram', 'motor_ram:u:in', 'motor_ram:e:out', 'sticky_ram', 'sticky_ram:d:out', 'ram_arm:n:plain',
        'ram_arm:u:sticky', 'lift_winch', 'lift_platform'];
    for (const name of names) {
        assert.ok(world.registry.id(name) > 0, name);
        for (const face of Object.values(world.getFaceTextureSpecs(name))) {
            assert.ok(ctx.TEXTURE_PATTERNS[face.pattern], `${name}: pattern ${face.pattern}`);
        }
    }
    assert.ok(world.blockTypes['motor_ram:e:out'].electric);
    assert.equal(world.blockTypes['motor_ram:e:out'].dropType, 'motor_ram');
    assert.equal(world.blockTypes['sticky_ram:u:out'].faces.top, 'mech_ram_front_sticky');
    assert.equal(world.blockTypes['ram_arm:e:plain'].dropType, null);
    assert.ok(world.blockTypes['ram_arm:e:plain'].variantOf, 'arms are no items');
    assert.ok(!world.blockTypes.lift_platform.electric, 'the platform is not part of a network');
    // 6 facings x in/out per ram.
    assert.equal(Object.keys(world.blockTypes).filter((name) => name.startsWith('motor_ram')).length, 12);
});

test('rams turn to six facings and stay inside their cell', () => {
    // North: the plate at z = 0; up: at y = 1; down: at y = 0; east: at x = 1.
    const plate = [0, 0, 0, 1, 1, 0.25];
    assert.deepEqual(round(ctx.mechRotateBox(plate, 'u')), [0, 0.75, 0, 1, 1, 1]);
    assert.deepEqual(round(ctx.mechRotateBox(plate, 'd')), [0, 0, 0, 1, 0.25, 1]);
    assert.deepEqual(round(ctx.mechRotateBox(plate, 'e')), [0.75, 0, 0, 1, 1, 1]);
    for (const facing of ['n', 'e', 's', 'w', 'u', 'd']) {
        for (const arm of ['in', 'out']) {
            for (const box of [...ctx.mechRamBoxes({ facing, arm }), ...ctx.mechArmBoxes(facing)]) {
                for (let i = 0; i < 3; i++) {
                    assert.ok(box[i] >= 0 && box[i + 3] <= 1 && box[i] < box[i + 3], `${facing} ${arm}: ${box}`);
                }
            }
        }
    }
    // The arm's rod meets the ram's: an arm facing up has its plate on top.
    assert.ok(ctx.mechArmBoxes('u').some((box) => box[4] === 1 && box[1] > 0.7 && box[3] - box[0] === 1));
});

test('a ram faces the player who places it', () => {
    assert.equal(ctx.mechFacingFromLook({ x: 0, y: -0.9, z: 0.1 }), 'u');
    assert.equal(ctx.mechFacingFromLook({ x: 0, y: 0.9, z: 0.1 }), 'd');
    assert.equal(ctx.mechFacingFromLook({ x: 1, y: 0, z: 0.1 }), 'w');
    assert.equal(ctx.mechFacingFromLook({ x: 0, z: -1 }), 's');
    assert.equal(ctx.BLOCK_SHAPES.mech_ram.place({ look: { x: 0, y: -1, z: 0 } })[0].state.facing, 'u');
});

test('the platform glides at the lift speed and catches up when far behind', () => {
    assert.equal(ctx.mechLiftGlide(0, 1, 0.1), 0.25 * 1.05);
    assert.equal(ctx.mechLiftGlide(0.9, 1, 0.1), 1);
    assert.equal(ctx.mechLiftGlide(5, 4, 0.1), 5 - 0.25 * 1.05);
    assert.ok(ctx.mechLiftGlide(0, 2, 0.1) > 0.4, 'faster when two blocks behind');
    assert.equal(ctx.mechLiftGlide(0, 10, 0.1), 10, 'jumps when very far');
    // Over the 0.4 s of one server step it covers the block.
    let y = 0;
    for (let i = 0; i < 24; i++) y = ctx.mechLiftGlide(y, 1, 1 / 60);
    assert.equal(y, 1);
});

test('a push carries the player standing on it and shoves one in its way', () => {
    const push = { kind: 'push', dir: [1, 0, 0], moved: [[3, 0, 0]], filled: [[4, 0, 0], [3, 0, 0]] };
    const body = (x, feet, z) => ({ x, feet, z, r: 0.16, height: 1.8 });
    // Standing on the pushed block (its top is y = 1).
    assert.deepEqual([...ctx.mechBodyShift(push, body(3.5, 1, 0.5))], [1, 0, 0]);
    // Standing where the block lands.
    assert.deepEqual([...ctx.mechBodyShift(push, body(4.5, 0, 0.5))], [1, 0, 0]);
    // Beside it, or above it in the air: untouched.
    assert.equal(ctx.mechBodyShift(push, body(5.5, 0, 0.5)), null);
    assert.equal(ctx.mechBodyShift(push, body(3.5, 2.5, 0.5)), null);
    // A ram pushing up lifts the player on top.
    const up = { kind: 'push', dir: [0, 1, 0], moved: [[0, 1, 0]], filled: [[0, 2, 0], [0, 1, 0]] };
    assert.deepEqual([...ctx.mechBodyShift(up, body(0.5, 2, 0.5))], [0, 1, 0]);
});

test('the player collides with the gliding platform, not with its block', () => {
    const world = makeWorld();
    world.setEditedBlock(2, 5, 2, 'lift_platform');
    // The platform draws nothing in its chunk, but other players and mobs collide with it.
    const id = world.registry.id('lift_platform');
    assert.equal(world.shapes.boxes(id).length, 0);
    assert.deepEqual([...world.shapes.collision(id)[0]], [0, 0, 0, 1, 1, 1]);
    const game = new ctx.Game();
    game.world = world;
    game.mechCars = new Map([['2,2', { x: 2, y: 5, z: 2, shown: 4.25 }]]);
    const base = (x, y, z) => world.getCollisionBoxes(x, y, z);
    assert.deepEqual(Array.from(game.mechanicsCollision(base, 2, 5, 2), round), [[0, 0, 0, 1, 0.25, 1]]);
    assert.deepEqual(Array.from(game.mechanicsCollision(base, 2, 4, 2), round), [[0, 0.25, 0, 1, 1, 1]]);
    assert.equal(game.mechanicsCollision(base, 2, 6, 2).length, 0);
    // Other columns are untouched.
    assert.equal(game.mechanicsCollision(base, 3, 0, 2).length, 1);
});
