// Node tests for /build (js/game/constructions.js): the designs, their rotation, that every level
// can be walked to with the real collision rules of camera.js, the light inside, and the command:
// creative only, batched, waiting for chunks, reaching the server, and the undo.
// Run with: node --test test/js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js');

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
    for (const file of ['joinery.js', 'chemistry.js', 'blueprints.js', 'constructions.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    }
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, CameraController, BLOCK_SHAPES, Game, CONSTRUCTION_DESIGNS,
        constructionPlan, constructionLayout, constructionTurnType, constructionDiff, constructionFindGround,
        CONSTRUCTION_RATE, CONSTRUCTION_FRAME_MAX, SHAPE_DIRECTIONS });`, context);
    return context;
}

const ctx = loadGame();
const NAMES = Object.keys(ctx.CONSTRUCTION_DESIGNS);
const FACINGS = ['n', 'e', 's', 'w'];
// The local 's' of a design turns to these with 0, 1, 2 and 3 quarter turns.
const LOOK_BY_TURNS = ['s', 'w', 'n', 'e'];

// A world of loaded chunks around the origin; ground(x, z) is the height of the top block.
function makeWorld(ground = () => 0, radius = 6) {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    world.getChunkMaterial = (type) => `material:${type}`;
    const stone = world.registry.id('stone');
    for (let cx = -radius; cx < radius; cx++) {
        for (let cz = -radius; cz < radius; cz++) {
            const column = new ctx.ChunkColumn(cx, cz);
            for (let lx = 0; lx < 16; lx++) {
                for (let lz = 0; lz < 16; lz++) {
                    const top = ground(cx * 16 + lx, cz * 16 + lz);
                    for (let y = -4; y <= top; y++) column.set(lx, y, lz, stone);
                }
            }
            world.columns.set(world.chunkKey(cx, cz), column);
        }
    }
    return world;
}

// The plan in the world as a visitor finds it: doors and gates open, as they would open them.
function placeOpen(world, plan) {
    for (const cell of plan.cells) {
        const def = world.blockTypes[cell.type];
        let type = cell.type;
        if (def.state && def.state.open && def.shape !== 'trapdoor') {
            type = world.getShapeStateType(def.variantOf || type, { ...def.state, open: 'open' });
        }
        world.setEditedBlock(cell.x, cell.y, cell.z, type);
    }
}

// Everywhere a player can get by walking, with no jumping: a flood fill over points two per block
// along each side, using the camera's own collision and step rules.
function walkable(world, startX, startFeet, startZ) {
    const camera = { position: new Vector3(0, 0, 0), rotation: {} };
    const player = new ctx.CameraController(camera, { addEventListener() {} });
    player.setCollisionBoxGetter((x, y, z) => world.getCollisionBoxes(x, y, z));
    const seen = new Set();
    const key = (x, z, feet) => `${x},${z},${feet}`;
    const queue = [[startX + 0.25, startZ + 0.25, startFeet]];
    seen.add(key(...queue[0]));
    assert.ok(player.canStandAt(queue[0][0], queue[0][1], startFeet), 'the start is free');
    for (let head = 0; head < queue.length; head++) {
        const [x, z, feet] = queue[head];
        for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
            const nx = x + dx;
            const nz = z + dz;
            const floor = player.getSupportFloorY(nx, nz, feet + player.stepHeight);
            if (floor < -8) continue;
            // Level or down: walks across at this height, then drops. Up: a step, with head room.
            if (!player.canStandAt(nx, nz, Math.max(floor, feet))) continue;
            const k = key(nx, nz, floor);
            if (seen.has(k)) continue;
            seen.add(k);
            queue.push([nx, nz, floor]);
        }
    }
    return queue;
}

test('every block in the designs exists and can be placed', () => {
    const world = makeWorld(() => 0, 1);
    for (const name of NAMES) {
        const plan = ctx.constructionPlan(name);
        assert.ok(plan.cells.length > 100, name);
        const types = new Set(plan.cells.map((cell) => cell.type));
        types.add(plan.foundation);
        for (const type of types) {
            const def = world.blockTypes[type];
            assert.ok(def, `${name}: ${type} is not a block`);
            assert.ok(world.registry.ids[type] !== undefined, `${name}: ${type} is not a world block`);
            assert.ok(!def.itemOnly, `${name}: ${type} is an item`);
        }
    }
});

test('the designs have the sizes and materials asked for, and differ', () => {
    const count = {};
    const blocks = {};
    for (const name of NAMES) {
        const plan = ctx.constructionPlan(name);
        count[name] = plan.cells.length;
        blocks[name] = new Set(plan.cells.map((cell) => cell.type));
        for (const cell of plan.cells) {
            assert.ok(cell.x >= 0 && cell.x < plan.size[0] && cell.y >= 0 && cell.y < plan.size[1] && cell.z >= 0 && cell.z < plan.size[2]);
        }
    }
    const { house, hall, cathedral } = ctx.CONSTRUCTION_DESIGNS;
    assert.ok(house.size[0] <= 11 && house.size[2] <= 14);
    assert.ok(hall.size[0] >= 20 && hall.size[2] >= 15);
    assert.ok(cathedral.size[0] >= 25 && cathedral.size[2] >= 50);
    const tallest = ctx.constructionPlan('cathedral').cells.reduce((top, cell) => Math.max(top, cell.y), 0);
    assert.ok(tallest >= 30, `towers ${tallest} high`);
    assert.ok(count.house < count.hall && count.hall < count.cathedral);
    // Every wall material is different.
    assert.ok(blocks.house.has('birch_planks') && !blocks.hall.has('birch_planks') && !blocks.cathedral.has('birch_planks'));
    assert.ok(blocks.hall.has('brick') && !blocks.cathedral.has('brick'));
    assert.ok(blocks.cathedral.has('limestone') && !blocks.hall.has('limestone') && !blocks.house.has('limestone'));
    // The basics of the house, the glass of the cathedral.
    for (const type of ['bed', 'lab_bench', 'torch', 'glass_pane', 'grass']) assert.ok(blocks.house.has(type), type);
    for (const type of ['cobalt_glass', 'glass', 'gold_block', 'neon_lamp']) assert.ok(blocks.cathedral.has(type), type);
    assert.ok(blocks.house.has('dark_oak_stairs:e:bottom') && blocks.house.has('dark_oak_stairs:w:bottom'), 'a roof of stairs');
});

test('the box turns with the look: footprint, anchor and states in all 4 directions', () => {
    const world = makeWorld(() => 0, 1);
    for (const name of NAMES) {
        const plan = ctx.constructionPlan(name);
        const [w, h, d] = plan.size;
        const def = (type) => world.blockTypes[type];
        for (let turns = 0; turns < 4; turns++) {
            const [fx, fz] = ctx.SHAPE_DIRECTIONS[LOOK_BY_TURNS[turns]];
            const anchor = { x: 40, z: -30 };
            const layout = ctx.constructionLayout(plan, turns, anchor, 7, world.blockTypes);
            assert.deepEqual([...layout.size], turns % 2 ? [d, h, w] : [w, h, d]);
            plan.cells.forEach((source, i) => {
                const cell = layout.cells[i];
                assert.ok(cell.x >= layout.min.x && cell.x < layout.min.x + layout.size[0]);
                assert.ok(cell.z >= layout.min.z && cell.z < layout.min.z + layout.size[2]);
                assert.equal(cell.y, 7 + source.y);
                // Where a turn puts it: z grows the way the player looks, starting at the anchor.
                const across = source.x - plan.anchorX;
                assert.equal(cell.x, anchor.x + fx * source.z + fz * across, `${name} ${turns} x`);
                assert.equal(cell.z, anchor.z + fz * source.z - fx * across, `${name} ${turns} z`);
                // And its facing turned the same way, nothing else.
                const before = def(source.type).state;
                if (before && before.facing) {
                    const after = def(cell.type).state;
                    assert.equal(after.facing, FACINGS[(FACINGS.indexOf(before.facing) + turns) % 4]);
                    assert.equal(def(cell.type).variantOf || cell.type, def(source.type).variantOf || source.type);
                    for (const key of ['half', 'hinge', 'open']) assert.equal(after[key], before[key]);
                } else {
                    assert.equal(cell.type, source.type);
                }
            });
        }
    }
});

test('the front door faces the player, its halves one above the other', () => {
    const world = makeWorld(() => 0, 1);
    for (const name of NAMES) {
        const plan = ctx.constructionPlan(name);
        const all = plan.cells.filter((cell) => world.blockTypes[cell.type].shape === 'door');
        const nearest = Math.min(...all.map((cell) => cell.z));
        const doors = all.filter((cell) => cell.z === nearest);
        assert.ok(doors.length >= 2, name);
        for (const door of doors) {
            const { state } = world.blockTypes[door.type];
            assert.equal(state.facing, 's', `${name}: it looks in, the way the player does`);
            assert.equal(state.open, 'closed');
            if (state.half === 'lower') {
                const upper = doors.find((other) => other.x === door.x && other.y === door.y + 1);
                assert.ok(upper && world.blockTypes[upper.type].state.half === 'upper', name);
            }
        }
        // Everyone reaches the door through a doorway two high: both its cells are door cells.
        for (const door of all) {
            const half = world.blockTypes[door.type].state.half;
            const y = half === 'lower' ? door.y + 1 : door.y - 1;
            assert.ok(all.some((other) => other.x === door.x && other.y === y && other.z === door.z), `${name}: half a door`);
        }
    }
});

// Everywhere a visitor can walk in each design, once: the next tests read it.
const visited = new Map();
function visit(name) {
    if (!visited.has(name)) {
        const plan = ctx.constructionPlan(name);
        const world = makeWorld(() => 0, 5);
        placeOpen(world, plan);
        visited.set(name, { plan, world, reached: walkable(world, plan.start[0], plan.start[1], plan.start[2]) });
    }
    return visited.get(name);
}

test('every level can be walked to from outside the door, without a jump', () => {
    for (const name of NAMES) {
        const { plan, reached } = visit(name);
        const cells = new Set(reached.map(([x, z, feet]) => `${Math.floor(x)},${Math.floor(feet)},${Math.floor(z)}`));
        for (const level of plan.levels) {
            assert.ok(cells.has(level.at.join(',')), `${name}: cannot reach ${level.name} (${level.at})`);
        }
    }
});

test('turned, every level can still be walked to', () => {
    const blockTypes = makeWorld(() => 0, 1).blockTypes;
    for (const name of NAMES) {
        const plan = ctx.constructionPlan(name);
        for (let turns = 1; turns < 4; turns++) {
            const anchor = { x: 3, z: -5 };
            const layout = ctx.constructionLayout(plan, turns, anchor, 0, blockTypes);
            const world = makeWorld(() => 0, 5);
            placeOpen(world, layout);
            const [fx, fz] = ctx.SHAPE_DIRECTIONS[LOOK_BY_TURNS[turns]];
            // Local (x, y, z) in the world: as checked in the rotation test above.
            const at = ([x, y, z]) => [anchor.x + fx * z + fz * (x - plan.anchorX), y, anchor.z + fz * z - fx * (x - plan.anchorX)];
            const [sx, sy, sz] = at(plan.start);
            const cells = new Set(walkable(world, sx, sy, sz).map(([x, z, feet]) => `${Math.floor(x)},${Math.floor(feet)},${Math.floor(z)}`));
            for (const level of plan.levels) {
                assert.ok(cells.has(at(level.at).join(',')), `${name} turned ${turns}: cannot reach ${level.name}`);
            }
        }
    }
});

test('the cathedral has at least three levels above each other, and a stair in each tower', () => {
    const { reached } = visit('cathedral');
    const heights = new Set(reached.map(([, , feet]) => feet));
    for (const feet of [1, 9, 17, 33]) assert.ok(heights.has(feet), `nobody walks at ${feet}`);
});

// The cells a visitor stands in inside the building: an opaque block overhead, and something solid
// (a wall, a window) along all four directions. Not the eaves, or the arcades of a plaza.
function indoors({ plan, world, reached }) {
    const [w, h, d] = plan.size;
    const solid = (x, y, z) => world.registry.solid[world.getBlockId(x, y, z)] === 1;
    const opaque = (x, y, z) => {
        const id = world.getBlockId(x, y, z);
        return id && world.registry.solid[id] && !world.registry.transparent[id];
    };
    const closed = (x, y, z, dx, dz) => {
        for (let i = 1; x + dx * i >= 0 && x + dx * i < w && z + dz * i >= 0 && z + dz * i < d; i++) {
            if (solid(x + dx * i, y, z + dz * i) || solid(x + dx * i, y + 1, z + dz * i)) return true;
        }
        return false;
    };
    const cells = new Map();
    for (const [fx, fz, feet] of reached) {
        const x = Math.floor(fx), y = Math.floor(feet), z = Math.floor(fz);
        const key = `${x},${y},${z}`;
        if (cells.has(key) || x < 0 || x >= w || z < 0 || z >= d) continue;
        let covered = false;
        for (let up = y + 2; up < h && !covered; up++) covered = opaque(x, up, z);
        const inside = covered && closed(x, y, z, 1, 0) && closed(x, y, z, -1, 0) && closed(x, y, z, 0, 1) && closed(x, y, z, 0, -1);
        cells.set(key, inside ? [x, y, z] : null);
    }
    return [...cells.values()].filter(Boolean);
}

test('the inside is lit by torches at night', () => {
    for (const name of NAMES) {
        const site = visit(name);
        const { plan, world } = site;
        // As in chunkMesher.js: one level less per block, stopped by opaque cubes.
        const levels = new Map();
        const queue = [];
        const put = (x, y, z, level) => {
            levels.set(`${x},${y},${z}`, level);
            queue.push([x, y, z, level]);
        };
        for (const cell of plan.cells) {
            if (cell.type === 'torch') put(cell.x, cell.y, cell.z, 14);
        }
        for (let head = 0; head < queue.length; head++) {
            const [x, y, z, level] = queue[head];
            if (level <= 1) continue;
            for (const [sx, sy, sz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
                const nx = x + sx, ny = y + sy, nz = z + sz;
                if ((levels.get(`${nx},${ny},${nz}`) || 0) >= level - 1) continue;
                if (world.registry.fullCube[world.getBlockId(nx, ny, nz)]) continue;
                put(nx, ny, nz, level - 1);
            }
        }
        const dark = indoors(site).filter(([x, y, z]) => (levels.get(`${x},${y},${z}`) || 0) < 6);
        assert.deepEqual(dark.map((cell) => cell.join(',')), [], `${name}: dark at night`);
    }
});

test('daylight reaches the rooms too', () => {
    for (const name of NAMES) {
        const site = visit(name);
        const { world, plan } = site;
        // As ChunkMesher.skyAt: open sky within 3 columns of the cell, or a roof less than 4 up.
        const top = new Map();
        const topOf = (x, z) => {
            const key = `${x},${z}`;
            if (!top.has(key)) {
                let y = plan.size[1] + 8;
                while (y > -8) {
                    const id = world.getBlockId(x, y, z);
                    if (id && world.registry.solid[id] && !world.registry.transparent[id]) break;
                    y--;
                }
                top.set(key, y);
            }
            return top.get(key);
        };
        const sky = (x, y, z) => {
            let light = y > topOf(x, z) ? 1 : Math.max(0, 1 - (topOf(x, z) - y) / 4);
            for (let dz = -3; dz <= 3; dz++) {
                for (let dx = -3; dx <= 3; dx++) {
                    if (y > topOf(x + dx, z + dz)) light = Math.max(light, 1 - Math.max(Math.abs(dx), Math.abs(dz)) * 0.22);
                }
            }
            return light;
        };
        // The stair towers are the exception: their torches light them by day as well.
        const rooms = indoors(site).filter(([x, , z]) => !(name === 'cathedral' && (x <= 7 || x >= 21) && z <= 10));
        const dark = rooms.filter(([x, y, z]) => sky(x, y, z) <= 0);
        assert.deepEqual(dark.map((cell) => cell.join(',')), [], `${name}: dark by day`);
    }
});

// ---------------------------------------------------------------------------------------
// The command

// A game with the mixin and the world; `sent` is what the server receives.
function makeGame(world, { creative = true, look = { x: 0, z: 1 }, at = { x: 0.5, y: 2.62, z: 0.5 } } = {}) {
    const game = new ctx.Game();
    const messages = [];
    const sent = [];
    Object.assign(game, {
        world,
        creativeMode: creative,
        receiveSystemMessage: ({ text }) => messages.push(text),
        cameraController: { eyeHeight: 1.62, getPosition: () => at },
        getInteractionRay: () => ({ direction: new Vector3(look.x, 0, look.z) }),
        network: { connected: true, ws: { bufferedAmount: 0 }, send: (type, payload) => sent.push({ type, payload }) }
    });
    return { game, messages, sent };
}

function run(game, frames = 200000) {
    for (let i = 0; i < frames && (game.constructionJob || game.constructionWaiting); i++) game.constructionUpdate(1 / 60);
    assert.ok(!game.constructionJob && !game.constructionWaiting, 'it ends');
}

function snapshot(world) {
    const out = {};
    for (let x = -24; x <= 32; x++) {
        for (let z = -24; z <= 32; z++) {
            for (let y = -6; y <= 44; y++) {
                const type = world.getBlockTypeAt(x, y, z);
                if (type) out[`${x},${y},${z}`] = type;
            }
        }
    }
    return out;
}

// What the server (and every other client) does with the messages.
function replay(world, sent) {
    for (const { type, payload } of sent) {
        world.setEditedBlock(payload.x, payload.y, payload.z, type === 'blockPlace' ? payload.blockType : null);
    }
}

test('outside creative mode it answers like a command that does not exist', () => {
    const world = makeWorld(() => 0, 1);
    const { game, messages, sent } = makeGame(world, { creative: false });
    for (const args of [[], ['house'], ['undo'], ['stop']]) game.constructionCommand('build', args);
    assert.deepEqual(messages, Array(4).fill('Unknown command: /build'));
    assert.equal(sent.length, 0);
    assert.ok(!game.constructionJob && !game.constructionWaiting);
});

test('/build alone lists the options, and so does an unknown name', () => {
    const world = makeWorld(() => 0, 1);
    const { game, messages } = makeGame(world);
    game.constructionCommand('build', []);
    game.constructionCommand('build', ['constructor']);
    assert.equal(messages.length, 2);
    for (const text of messages) {
        for (const name of [...NAMES, 'undo']) assert.ok(text.includes(name), text);
    }
    assert.ok(!game.constructionJob);
});

test('a build reaches the server in batches, door to the player, and undo restores everything', () => {
    // A slope, and a few things a player put on it.
    const slope = (x, z) => Math.floor((x + z) / 4);
    const decorate = (world) => {
        world.setEditedBlock(3, 5, 8, 'wood');
        world.setEditedBlock(3, 7, 5, 'planks');
        world.setEditedBlock(4, 9, 9, 'sign');
        world.setEditedBlock(-1, 1, 6, 'water');
    };
    const world = makeWorld(slope, 3);
    decorate(world);
    world.signTextByKey.set(world.blockKey(4, 9, 9), 'hello');
    const before = snapshot(world);

    const { game, messages, sent } = makeGame(world);
    game.constructionCommand('build', ['house']);
    assert.ok(game.constructionJob);
    const total = game.constructionJob.ops.length;

    // Batches: no frame sends more than the cap, a second no more than the rate.
    let count = sent.length;
    game.constructionUpdate(10);
    assert.ok(sent.length - count <= ctx.CONSTRUCTION_FRAME_MAX);
    count = sent.length;
    for (let i = 0; i < 60; i++) game.constructionUpdate(1 / 60);
    assert.ok(sent.length - count <= ctx.CONSTRUCTION_RATE + 40, `${sent.length - count} in a second`);

    // A backlog on the socket, or no connection, holds it back; nothing is lost.
    count = sent.length;
    game.network.ws.bufferedAmount = 1 << 20;
    game.constructionUpdate(1);
    assert.equal(sent.length, count);
    game.network.ws.bufferedAmount = 0;
    game.network.connected = false;
    game.constructionUpdate(1);
    assert.equal(sent.length, count);
    game.network.connected = true;

    run(game);
    assert.equal(sent.length, total);
    assert.ok(messages.some((text) => text.includes('finished')));
    assert.ok(messages.some((text) => /% \(/.test(text)), 'a progress line');

    // The door is a few blocks ahead, on the ground under that spot, and faces the player.
    const baseY = slope(0, 3);
    const door = world.blockTypes[world.getBlockTypeAt(0, baseY + 1, 3 + 4)];
    assert.equal(door.shape, 'door');
    assert.equal(door.state.facing, 's');

    // Another player, or the server after a restart, ends up with the same world.
    const other = makeWorld(slope, 3);
    decorate(other);
    replay(other, sent);
    assert.deepEqual(snapshot(other), snapshot(world));

    // Nothing floats (every column solid from the terrain up to the floor) and the terrain inside is gone.
    const plan = ctx.constructionPlan('house');
    const layout = ctx.constructionLayout(plan, 0, { x: 0, z: 3 }, baseY, world.blockTypes);
    const [x0, z0] = [layout.min.x, layout.min.z];
    for (let x = x0; x < x0 + layout.size[0]; x++) {
        for (let z = z0; z < z0 + layout.size[2]; z++) {
            for (let y = slope(x, z) + 1; y <= baseY; y++) assert.ok(world.hasSolidBlock(x, y, z), `hole at ${x},${y},${z}`);
        }
    }
    const wanted = new Set(layout.cells.map((cell) => `${cell.x},${cell.y},${cell.z}`));
    for (let x = x0; x < x0 + layout.size[0]; x++) {
        for (let z = z0; z < z0 + layout.size[2]; z++) {
            for (let y = baseY + 1; y < baseY + layout.size[1]; y++) {
                if (!wanted.has(`${x},${y},${z}`)) assert.equal(world.getBlockTypeAt(x, y, z), null, `left at ${x},${y},${z}`);
            }
        }
    }

    // Undo: back to the old world cell by cell, with the sign's text; once only.
    sent.length = 0;
    game.constructionCommand('build', ['undo']);
    run(game);
    assert.deepEqual(snapshot(world), before);
    assert.equal(world.getSignTextAt(4, 9, 9), 'hello');
    assert.ok(sent.some(({ type, payload }) => type === 'blockPlace' && payload.blockType === 'sign' && payload.text === 'hello'));
    replay(other, sent);
    assert.deepEqual(snapshot(other), before);
    messages.length = 0;
    game.constructionCommand('build', ['undo']);
    assert.deepEqual(messages, ['Nothing to undo']);
});

test('/build stop keeps what is done, and undo takes back only that', () => {
    const world = makeWorld(() => 0, 3);
    const before = snapshot(world);
    const { game, sent, messages } = makeGame(world);
    game.constructionCommand('build', ['house']);
    game.constructionUpdate(0.1);
    const done = game.constructionJob.done;
    assert.ok(done > 0);
    // A second build has to wait for the first.
    game.constructionCommand('build', ['hall']);
    assert.ok(messages.at(-1).includes('Still building'));
    game.constructionCommand('build', ['stop']);
    assert.ok(!game.constructionJob);
    assert.notDeepEqual(snapshot(world), before);
    assert.equal(sent.length, done);
    game.constructionCommand('build', ['undo']);
    assert.equal(game.constructionJob.ops.length, done);
    // Stopping the undo half way leaves the rest of it undoable.
    game.constructionUpdate(0.05);
    game.constructionCommand('build', ['stop']);
    game.constructionCommand('build', ['undo']);
    run(game);
    assert.deepEqual(snapshot(world), before);
});

test('leaving creative mode stops a build', () => {
    const world = makeWorld(() => 0, 3);
    const { game, sent } = makeGame(world);
    game.constructionCommand('build', ['house']);
    game.constructionUpdate(0.1);
    const count = sent.length;
    game.creativeMode = false;
    game.constructionUpdate(1);
    assert.equal(sent.length, count);
    assert.ok(!game.constructionJob);
});

test('it turns with the look', () => {
    for (const [look, dx, dz, facing] of [[{ x: 1, z: 0.2 }, 1, 0, 'e'], [{ x: -1, z: 0 }, -1, 0, 'w'], [{ x: 0.1, z: -1 }, 0, -1, 'n'], [{ x: 0, z: 1 }, 0, 1, 's']]) {
        const world = makeWorld(() => 0, 3);
        const { game } = makeGame(world, { look });
        game.constructionCommand('build', ['house']);
        run(game);
        const door = world.blockTypes[world.getBlockTypeAt(dx * 7, 1, dz * 7)];
        assert.equal(door.shape, 'door', facing);
        assert.equal(door.state.facing, facing);
    }
});

test('it waits for chunks that are not loaded, and gives up if they never come', () => {
    const world = makeWorld(() => 0, 3);
    const chunk = world.columns.get(world.chunkKey(0, 0));
    world.columns.delete(world.chunkKey(0, 0));
    const { game, messages, sent } = makeGame(world);
    game.constructionCommand('build', ['house']);
    assert.ok(game.constructionWaiting && !game.constructionJob);
    assert.ok(world.generatingChunks.has(world.chunkKey(0, 0)), 'it asks for the chunk');
    game.constructionUpdate(1);
    assert.equal(sent.length, 0);
    assert.ok(messages.some((text) => text.includes('waiting')));
    // It arrives: the build starts.
    world.columns.set(world.chunkKey(0, 0), chunk);
    game.constructionUpdate(1 / 60);
    assert.ok(game.constructionJob);
    run(game);
    assert.ok(sent.length > 100);

    world.columns.delete(world.chunkKey(0, 0));
    const later = makeGame(world);
    later.game.constructionCommand('build', ['house']);
    for (let t = 0; t < 40; t++) later.game.constructionUpdate(1);
    assert.ok(!later.game.constructionWaiting && !later.game.constructionJob);
    assert.ok(later.messages.some((text) => text.includes('did not load')));
    assert.equal(later.sent.length, 0);
});

test('a build in water stands on the surface, its foundation down to the sea floor', () => {
    const world = makeWorld(() => -2, 3);
    for (let x = -20; x < 30; x++) {
        for (let z = -20; z < 30; z++) {
            for (let y = -1; y <= 3; y++) world.setEditedBlock(x, y, z, 'water');
        }
    }
    const { game } = makeGame(world, { at: { x: 0.5, y: 8, z: 0.5 } });
    game.constructionCommand('build', ['house']);
    run(game);
    assert.equal(world.blockTypes[world.getBlockTypeAt(0, 4, 7)].shape, 'door');
    assert.equal(world.getBlockTypeAt(0, -1, 7), 'cobblestone');
});
