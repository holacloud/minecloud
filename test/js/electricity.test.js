// Node tests for electricity (js/game/electricity.js): its blocks, shapes, light, and that
// ELECTRIC_KINDS mirrors powerKinds in pkg/network/power.go (the server's simulation).
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
    vm.runInContext(fs.readFileSync(path.join(JS, 'game', 'electricity.js'), 'utf8'), context, { filename: 'electricity.js' });
    vm.runInContext('this.WorldRenderer = WorldRenderer; this.ChunkColumn = ChunkColumn; this.LightField = LightField; this.ELECTRIC_KINDS = ELECTRIC_KINDS; this.electricKindOf = electricKindOf; this.Game = Game;', context);
    return context;
}

const ctx = loadGame();

function makeWorld() {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    world.getChunkMaterial = (type) => `material:${type}`;
    for (const [cx, cz] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
        const column = new ctx.ChunkColumn(cx, cz);
        const stone = world.registry.id('stone');
        for (let lx = 0; lx < 16; lx++) {
            for (let lz = 0; lz < 16; lz++) {
                for (let y = -16; y <= 0; y++) column.set(lx, y, lz, stone);
            }
        }
        world.columns.set(world.chunkKey(cx, cz), column);
    }
    return world;
}

test('the client table mirrors powerKinds in power.go', () => {
    const go = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'power.go'), 'utf8');
    const table = go.slice(go.indexOf('var powerKinds'), go.indexOf('}\n', go.indexOf('var powerKinds')));
    const serverKinds = {};
    for (const match of table.matchAll(/"(\w+)":\s*\{([^}]*)\}/g)) {
        const fields = {};
        for (const [, key, value] of match[2].matchAll(/(\w+):\s*("?[\w.]+"?)/g)) fields[key] = value.replace(/"/g, '');
        serverKinds[match[1]] = fields;
    }
    assert.deepEqual(Object.keys(serverKinds).sort(), Object.keys(ctx.ELECTRIC_KINDS).sort());
    const roles = { powerGenerator: 'generator', powerConductor: 'conductor', powerStorage: 'storage', powerConsumer: 'consumer', powerLogic: 'logic' };
    for (const [kind, client] of Object.entries(ctx.ELECTRIC_KINDS)) {
        const server = serverKinds[kind];
        assert.equal(roles[server.Role], client.role, `${kind} role`);
        assert.equal(Number(server.Watts || 0), client.watts || 0, `${kind} watts`);
        assert.equal(server.Source || undefined, client.source, `${kind} source`);
        assert.equal(Number(server.Capacity || 0), client.capacity || 0, `${kind} capacity`);
        assert.equal(Number(server.Levels || 0), client.levels || 0, `${kind} levels`);
        assert.equal(server.Switch === 'true', Boolean(client.switch), `${kind} switch`);
    }
});

test('every electric block and state is a world block', () => {
    const world = makeWorld();
    const names = ['copper_wire', 'wire_post', 'solar_panel', 'wind_turbine', 'water_wheel', 'water_wheel:z', 'hand_crank',
        'battery_block', 'battery_block:1', 'battery_block:4', 'electric_lamp', 'electric_lamp:on', 'grow_lamp:on', 'electric_motor:on',
        'rtg', 'light_bulb', 'light_bulb:on'];
    for (const name of names) {
        assert.ok(world.registry.id(name) > 0, name);
        assert.equal(ctx.electricKindOf(name), name.split(':')[0]);
        assert.ok(world.blockTypes[name].electric, `${name} is electric`);
    }
    assert.equal(world.blockTypes['electric_lamp:on'].dropType, 'electric_lamp');
    assert.equal(world.blockTypes['battery_block:3'].variantOf, 'battery_block');
    assert.equal(ctx.electricKindOf('stone'), null);
    assert.ok(world.blockTypes.multimeter.itemOnly);
});

test('the radioisotope generator is a steady, glowing full cube', () => {
    const world = makeWorld();
    assert.deepEqual({ ...ctx.ELECTRIC_KINDS.rtg }, { role: 'generator', source: 'radioisotope', watts: 80 });
    const rtg = world.blockTypes.rtg;
    assert.equal(rtg.name, 'Radioisotope Generator');
    assert.ok(rtg.glow > 0 && !rtg.shape, 'a glowing full cube');
    // Its glow is on its own texture: it does not light the world like a lamp.
    assert.ok(!world.isLightEmitterType('rtg'));
});

test('lit lamps give light, unlit ones do not', () => {
    const world = makeWorld();
    assert.ok(world.isLightEmitterType('torch'));
    assert.ok(world.isLightEmitterType('electric_lamp:on'));
    assert.ok(world.isLightEmitterType('grow_lamp:on'));
    assert.ok(!world.isLightEmitterType('electric_lamp'));
    assert.ok(!world.isLightEmitterType('electric_motor:on'));

    world.setEditedBlock(3, 1, 3, 'electric_lamp');
    assert.equal(new ctx.LightField(world, 0, 0).get(3, 2, 3), 0);
    world.setEditedBlock(3, 1, 3, 'electric_lamp:on');
    const light = new ctx.LightField(world, 0, 0);
    assert.equal(light.get(3, 2, 3), 13);
    assert.ok(world.hasLightEmitterNear(5, 1, 5));
});

test('a bulb: dull and dark without power, a dim light with it, and still the same item', () => {
    const world = makeWorld();
    assert.deepEqual({ ...ctx.ELECTRIC_KINDS.light_bulb }, { role: 'consumer', watts: 5, switch: true });
    const off = world.blockTypes.light_bulb;
    const on = world.blockTypes['light_bulb:on'];
    assert.ok(!off.glow && !off.lightEmission && !off.variantOf);
    assert.ok(on.glow > 0);
    assert.equal(on.variantOf, 'light_bulb');
    assert.equal(on.dropType, 'light_bulb');
    assert.ok(!world.isLightEmitterType('light_bulb'));
    assert.ok(world.isLightEmitterType('light_bulb:on'));
    const level = (type) => world.registry.lightLevel[world.registry.id(type)];
    assert.equal(level('light_bulb:on'), 7);
    assert.equal(level('electric_lamp:on'), 14);

    world.setEditedBlock(3, 1, 3, 'light_bulb');
    assert.equal(new ctx.LightField(world, 0, 0).get(3, 2, 3), 0);
    world.setEditedBlock(3, 1, 3, 'light_bulb:on');
    assert.equal(new ctx.LightField(world, 0, 0).get(3, 2, 3), 6);
});

test('wires join electric neighbours only', () => {
    const world = makeWorld();
    world.setEditedBlock(2, 1, 2, 'copper_wire');
    world.setEditedBlock(3, 1, 2, 'battery_block');
    world.setEditedBlock(2, 1, 1, 'cobblestone');
    world.setEditedBlock(1, 1, 2, 'electric_lamp:on');
    const wire = world.registry.id('copper_wire');
    // East (battery) and west (lamp), not north (cobblestone).
    assert.equal(world.getShapeMask(wire, 2, 1, 2), 2 | 8);
    assert.equal(world.shapes.boxes(wire, 2 | 8).length, 3);
    // You walk over wires.
    assert.equal(world.shapes.collision(wire, 0).length, 0);
});

test('the water wheel axis follows the player', () => {
    const world = makeWorld();
    const shape = vm.runInContext('BLOCK_SHAPES.electric_wheel', ctx);
    assert.equal(shape.place({ look: { x: 0, z: -1 } })[0].state.axis, 'z');
    assert.equal(shape.place({ look: { x: 1, z: 0.2 } })[0].state.axis, 'x');
    assert.ok(world.registry.id('water_wheel:z') > 0);
});
