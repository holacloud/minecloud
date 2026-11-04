// Node tests for logic and sensors (js/game/logic.js): its blocks and states, and that
// LOGIC_KINDS mirrors logicKinds in pkg/network/logic.go (the server's simulation).
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
    for (const file of ['electricity.js', 'logic.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    }
    vm.runInContext(`this.WorldRenderer = WorldRenderer; this.ChunkColumn = ChunkColumn; this.ELECTRIC_KINDS = ELECTRIC_KINDS;
        this.LOGIC_KINDS = LOGIC_KINDS; this.LOGIC_STATE_VALUES = LOGIC_STATE_VALUES; this.LOGIC_INPUTS = LOGIC_INPUTS;
        this.TEXTURE_PATTERNS = TEXTURE_PATTERNS; this.BLOCK_SHAPES = BLOCK_SHAPES; this.logicLocal = logicLocal;
        this.ITEM_USE_HANDLERS = ITEM_USE_HANDLERS; this.Game = Game;`, context);
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

const GO = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'logic.go'), 'utf8');

function goTable(name) {
    const start = GO.indexOf(`var ${name}`);
    return GO.slice(start, GO.indexOf('\n}\n', start));
}

test('the client tables mirror logic.go', () => {
    const kinds = {};
    for (const [, id, op, states] of goTable('logicKinds').matchAll(/"(\w+)":\s*\{Op: "(\w+)", States: "([\w,]+)"\}/g)) {
        kinds[id] = { op, states };
    }
    assert.deepEqual(kinds, JSON.parse(JSON.stringify(ctx.LOGIC_KINDS)));
    const values = {};
    for (const [, key, list] of goTable('logicStateValues').matchAll(/"(\w+)":\s*\{([^}]*)\}/g)) {
        values[key] = [...list.matchAll(/"(\w+)"/g)].map((m) => m[1]);
    }
    assert.deepEqual(values, JSON.parse(JSON.stringify(ctx.LOGIC_STATE_VALUES)));
    const inputs = {};
    for (const [, op, list] of goTable('logicInputs').matchAll(/"(\w+)":\s*\{([^}]*)\}/g)) {
        inputs[op] = [...list.matchAll(/"(\w+)"/g)].map((m) => m[1]);
    }
    assert.deepEqual(inputs, JSON.parse(JSON.stringify(ctx.LOGIC_INPUTS)));
    for (const id of Object.keys(ctx.LOGIC_KINDS)) assert.equal(ctx.ELECTRIC_KINDS[id].role, 'logic', id);
});

test('every state is a world block with its textures', () => {
    const world = makeWorld();
    const names = ['lever', 'lever:on', 'push_button:on', 'pressure_plate:on', 'daylight_sensor', 'daylight_sensor:night:on',
        'proximity_sensor:on', 'rain_sensor:on', 'and_gate', 'and_gate:e:on', 'or_gate:s:off', 'xor_gate:w:on', 'not_gate:n:on',
        'delay_gate', 'delay_gate:n:3:off', 'delay_gate:w:4:on', 'latch:e:on', 'lift_stop', 'lift_stop:called:off', 'lift_stop:free:on', 'lift_stop:called:on'];
    for (const name of names) {
        assert.ok(world.registry.id(name) > 0, name);
        const def = world.blockTypes[name];
        assert.ok(def.electric, `${name} is electric`);
        assert.equal(def.dropType ?? name, name.split(':')[0]);
        for (const face of Object.values(world.getFaceTextureSpecs(name))) {
            assert.ok(ctx.TEXTURE_PATTERNS[face.pattern], `${name}: pattern ${face.pattern}`);
        }
    }
    assert.equal(world.blockTypes['and_gate:e:on'].variantOf, 'and_gate');
    // Every combination of a gate's states exists (4 facings x 2, delays x 4 more).
    const gates = Object.keys(world.blockTypes).filter((name) => name.startsWith('delay_gate'));
    assert.equal(gates.length, 32);
});

test('gates face where the player looks, and the arrow is drawn there', () => {
    const shape = ctx.BLOCK_SHAPES.logic_and_gate;
    assert.equal(shape.place({ look: { x: 1, z: 0.2 } })[0].state.facing, 'e');
    assert.equal(ctx.BLOCK_SHAPES.logic_delay_gate.place({ look: { x: 0, z: -1 } })[0].state.delay, '1');
    // The output edge of a gate facing east is the +x edge of its top (u = 1).
    assert.deepEqual([...ctx.logicLocal(0.95, 0.5, 'e')].map((v) => Math.round(v * 100) / 100), [0.5, 0.05]);
    assert.deepEqual([...ctx.logicLocal(0.5, 0.95, 's')].map((v) => Math.round(v * 100) / 100), [0.5, 0.05]);
    // Right hand of a gate facing north is east (lu = 1 at u = 1), as in logic.go.
    assert.equal(ctx.logicLocal(0.9, 0.5, 'n')[0], 0.9);
});

test('wires join logic blocks; plates are walked over; levers show their handle', () => {
    const world = makeWorld();
    world.setEditedBlock(2, 1, 2, 'copper_wire');
    world.setEditedBlock(3, 1, 2, 'and_gate:e:on');
    assert.equal(world.getShapeMask(world.registry.id('copper_wire'), 2, 1, 2), 2);
    assert.equal(world.shapes.collision(world.registry.id('pressure_plate'), 0).length, 0);
    const up = world.shapes.boxes(world.registry.id('lever:on'), 0)[1];
    const down = world.shapes.boxes(world.registry.id('lever'), 0)[1];
    assert.ok(up[4] > down[4], 'the handle is up while on');
});

test('the lift stop: a whole block with its own look in each state, an icon and a recipe', () => {
    const world = makeWorld();
    const looks = { lift_stop: 'lift_stop_free', 'lift_stop:called:off': 'lift_stop_called', 'lift_stop:free:on': 'lift_stop_here', 'lift_stop:called:on': 'lift_stop_here' };
    for (const [name, pattern] of Object.entries(looks)) {
        assert.equal(world.getFaceTextureSpecs(name).side.pattern, pattern, name);
        assert.equal(world.getFaceTextureSpecs(name).top.pattern, 'lift_stop_top', name);
        assert.deepEqual([...world.shapes.boxes(world.registry.id(name), 0)[0]], [0, 0, 0, 1, 1, 1]);
    }
    assert.equal(world.registry.solid[world.registry.id('lift_stop')], 1);
    assert.equal(world.registry.fullCube[world.registry.id('lift_stop')], 1, 'it hides and shades like the wall around it');
    // Item, not state: in the creative stock and /give. The states are not items.
    assert.ok(!world.blockTypes.lift_stop.variantOf);
    assert.equal(world.blockTypes['lift_stop:called:on'].variantOf, 'lift_stop');
    assert.equal(world.blockTypes.lift_stop.name, 'Lift Stop');
    // The icon is drawn by its shape, from its idle state (as world.js does for shaped blocks).
    assert.ok(world.registry.shaped[world.registry.id('lift_stop')]);
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.BLOCK_SHAPES.logic_lift_stop.iconState)), { call: 'free', power: 'off' });
    // Made of what a player already has when building a winch.
    const recipes = [];
    vm.runInContext('GAME_CONTENT_HOOKS', ctx).forEach((hook) => hook.call({}, { addItem() {}, addRecipe: (...args) => recipes.push(args) }));
    const recipe = recipes.find(([id]) => id === 'lift_stop');
    assert.equal(recipe[2], 'lift_stop');
    assert.equal(recipe[3], 2);
    assert.deepEqual(JSON.parse(JSON.stringify(recipe[4])).map(({ type }) => type).sort(), ['copper_wire', 'glass', 'iron_ore']);
});

test('the lift stop on the multimeter', () => {
    const status = vm.runInContext('logicStopStatus', ctx);
    assert.match(status('lift_stop'), /free/);
    assert.match(status('lift_stop:called:off'), /coming/);
    assert.match(status('lift_stop:free:on'), /here/);
    assert.match(status('lift_stop:called:on'), /here/);
});

test('a right click on a lift stop calls the lift', () => {
    const world = makeWorld();
    world.setEditedBlock(4, 1, 4, 'lift_stop');
    const sent = [];
    const game = new ctx.Game();
    Object.assign(game, {
        world,
        cameraController: { isCrouching: false },
        network: { connected: true, send: (type, payload) => sent.push([type, payload]) },
        playNoiseBurst() {}, playTone() {}, showHitIndicator() {}
    });
    world.getBlockPositionFromIntersection = (hit) => hit.position;
    const handler = ctx.ITEM_USE_HANDLERS[ctx.ITEM_USE_HANDLERS.length - 1];
    assert.equal(handler.call(game, null, { position: { x: 4, y: 1, z: 4 } }), true);
    assert.deepEqual(JSON.parse(JSON.stringify(sent)), [['logicPress', { x: 4, y: 1, z: 4 }]]);
});

test('a right click on a lever asks the server', () => {
    const world = makeWorld();
    world.setEditedBlock(4, 1, 4, 'lever');
    world.setEditedBlock(5, 1, 4, 'and_gate');
    const sent = [];
    const game = new ctx.Game();
    Object.assign(game, {
        world,
        cameraController: { isCrouching: false },
        network: { connected: true, send: (type, payload) => sent.push([type, payload]) },
        playNoiseBurst() {}, playTone() {}, showHitIndicator() {}
    });
    world.getBlockPositionFromIntersection = (hit) => hit.position;
    const handler = ctx.ITEM_USE_HANDLERS[ctx.ITEM_USE_HANDLERS.length - 1];
    assert.equal(handler.call(game, null, { position: { x: 4, y: 1, z: 4 } }), true);
    assert.deepEqual(JSON.parse(JSON.stringify(sent)), [['logicPress', { x: 4, y: 1, z: 4 }]]);
    // Gates without a setting are not pressed (a block can be placed against them).
    assert.equal(handler.call(game, null, { position: { x: 5, y: 1, z: 4 } }), false);
});
