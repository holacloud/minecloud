// Node tests for /build apartments (js/game/construction_apartments.js): registration, all 4 turns,
// the walk to every room by the stairs alone, light at night, the undo, the lift's geometry, and that
// the data the Go test runs on the real grid (pkg/network/testdata) is this design.
// To write that data again: APARTMENTS_WRITE=1 node --test test/js/construction_apartments.test.js
// Run with: node --test test/js/construction_apartments.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js');
const TESTDATA = path.join(__dirname, '..', '..', 'pkg', 'network', 'testdata', 'apartments_lift.json');

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
    for (const file of ['extensions.js', 'chunkStore.js', 'blockShapes.js', 'chunkMesher.js', 'camera.js', 'mobSpecies.js', 'blockTextures.js', 'world.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, file), 'utf8'), context, { filename: file });
    }
    vm.runInContext('class Game {}; function resourcesDrawSprite() { return () => {}; } function resourcesDisplayMesh() { return null; }', context);
    // As in index.html, with what these flats and this lift are made of.
    for (const file of ['joinery.js', 'chemistry.js', 'electricity.js', 'logic.js', 'mechanics.js', 'blueprints.js', 'constructions.js', 'furniture.js', 'seating.js', 'storage.js', 'appliances.js', 'decor.js', 'mirrors.js', 'construction_apartments.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    }
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, CameraController, BLOCK_SHAPES, Game, CONSTRUCTION_DESIGNS, constructionPlan, constructionLayout,
        SHAPE_DIRECTIONS, ELECTRIC_KINDS, seatStandOffsets, APARTMENTS_SHAFT, APARTMENTS_WINCH_Y, APARTMENTS_STEP, APARTMENTS_HOME_FLOORS, APARTMENTS_ROOF_Y,
        apartmentsFlats, apartmentsFlatCell, apartmentsBedFoot });`, context);
    return context;
}

const ctx = loadGame();
const FACINGS = ['n', 'e', 's', 'w'];
const DIRECTIONS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
// The local 's' of a design turns to these with 0, 1, 2 and 3 quarter turns.
const LOOK_BY_TURNS = ['s', 'w', 'n', 'e'];
const TURNS = [0, 1, 2, 3];
const ANCHOR = { x: 3, z: -5 };
const NAME = 'apartments';

function makeWorld(radius = 4) {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    world.getChunkMaterial = (type) => `material:${type}`;
    const stone = world.registry.id('stone');
    for (let cx = -radius; cx < radius; cx++) {
        for (let cz = -radius; cz < radius; cz++) {
            const column = new ctx.ChunkColumn(cx, cz);
            for (let lx = 0; lx < 16; lx++) {
                for (let lz = 0; lz < 16; lz++) {
                    for (let y = -4; y <= 0; y++) column.set(lx, y, lz, stone);
                }
            }
            world.columns.set(world.chunkKey(cx, cz), column);
        }
    }
    return world;
}

const blocks = makeWorld(1);
const defOf = (type) => blocks.blockTypes[type];
const baseOf = (type) => defOf(type).variantOf || type;
const stateOf = (type) => defOf(type).state || {};
const PLAN = ctx.constructionPlan(NAME);
const { x: SX, z: SZ } = ctx.APARTMENTS_SHAFT;

// Where a turn puts a local cell (as checked by the rotation test in constructions.test.js).
function turned(turns, x, z) {
    const [fx, fz] = ctx.SHAPE_DIRECTIONS[LOOK_BY_TURNS[turns]];
    const across = x - PLAN.anchorX;
    return [ANCHOR.x + fx * z + fz * across, ANCHOR.z + fz * z - fx * across];
}

function layoutOf(turns) {
    const layout = ctx.constructionLayout(PLAN, turns, ANCHOR, 0, blocks.blockTypes);
    const grid = new Map(layout.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
    return { layout, typeAt: (x, y, z) => grid.get(`${x},${y},${z}`) };
}

// A door of the shaft: the walks below leave them shut, as the lift may not be behind them.
const isShaftDoor = (source) => source.x === SX && source.z === SZ - 1 && defOf(source.type).shape === 'door';

// The plan in the world as a visitor finds it: doors open, except those of the shaft.
function placeOpen(world, layout) {
    layout.cells.forEach((cell, index) => {
        const def = world.blockTypes[cell.type];
        let type = cell.type;
        if (def.state && def.state.open && def.shape !== 'trapdoor' && !isShaftDoor(PLAN.cells[index])) {
            type = world.getShapeStateType(def.variantOf || type, { ...def.state, open: 'open' });
        }
        world.setEditedBlock(cell.x, cell.y, cell.z, type);
    });
}

// Where a player can get on foot, stricter than the fill of constructions.test.js. No jump: a step is
// at most the camera's stepHeight (that one takes any floor under feet + stepHeight, a full block
// too). Hops of a quarter block, shorter than the body is wide, so that nobody passes through a pane.
function walkable(world, startX, startFeet, startZ, bounds) {
    const camera = { position: new Vector3(0, 0, 0), rotation: {} };
    const player = new ctx.CameraController(camera, { addEventListener() {} });
    player.setCollisionBoxGetter((x, y, z) => world.getCollisionBoxes(x, y, z));
    const seen = new Set();
    const key = (x, z, feet) => `${x},${z},${feet}`;
    const queue = [[startX + 0.5, startZ + 0.5, startFeet]];
    seen.add(key(...queue[0]));
    assert.ok(player.canStandAt(queue[0][0], queue[0][1], startFeet), 'the start is free');
    for (let head = 0; head < queue.length; head++) {
        const [x, z, feet] = queue[head];
        for (const [dx, dz] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
            const nx = x + dx;
            const nz = z + dz;
            if (nx < bounds.x0 || nx > bounds.x1 || nz < bounds.z0 || nz > bounds.z1) continue;
            const floor = player.getSupportFloorY(nx, nz, feet + player.stepHeight);
            if (floor < -8 || floor > feet + player.stepHeight + 0.001) continue;
            if (!player.canStandAt(nx, nz, Math.max(floor, feet))) continue;
            const k = key(nx, nz, floor);
            if (seen.has(k)) continue;
            seen.add(k);
            queue.push([nx, nz, floor]);
        }
    }
    return queue;
}

function walkTurned(turns) {
    const { layout } = layoutOf(turns);
    const world = makeWorld(4);
    placeOpen(world, layout);
    const [sx, sz] = turned(turns, PLAN.start[0], PLAN.start[2]);
    const bounds = { x0: layout.min.x - 0.75, x1: layout.min.x + layout.size[0] + 0.75, z0: layout.min.z - 0.75, z1: layout.min.z + layout.size[2] + 0.75 };
    return { world, layout, reached: walkable(world, sx, PLAN.start[1], sz, bounds) };
}

// The walk of each turn, once: the next tests read them.
const walks = new Map();
const walkOf = (turns) => {
    if (!walks.has(turns)) walks.set(turns, walkTurned(turns));
    return walks.get(turns);
};

test('it is registered and /build lists it, in creative mode only', () => {
    assert.ok(ctx.CONSTRUCTION_DESIGNS.apartments);
    const messages = [];
    const game = new ctx.Game();
    Object.assign(game, { creativeMode: true, receiveSystemMessage: ({ text }) => messages.push(text) });
    game.constructionCommand('build', []);
    assert.ok(messages[0].includes('apartments (Apartment block, 24 x 23, 53 high)'), messages[0]);
    assert.ok(['house', 'hall', 'cathedral', 'showroom'].every((name) => messages[0].includes(name)));
    game.creativeMode = false;
    game.constructionCommand('build', ['apartments']);
    assert.equal(messages[1], 'Unknown command: /build');
    assert.ok(!game.constructionJob && !game.constructionWaiting);
});

test('every block exists and fits the world, the box and the wait for chunks', () => {
    const [w, h, d] = PLAN.size;
    assert.deepEqual([w, d], [24, 23]);
    for (const cell of PLAN.cells) {
        const def = defOf(cell.type);
        assert.ok(def, `${cell.type} is not a block`);
        assert.ok(blocks.registry.ids[cell.type] !== undefined, `${cell.type} is not a world block`);
        assert.ok(!def.itemOnly, cell.type);
        assert.ok(cell.x >= 0 && cell.x < w && cell.y >= 0 && cell.y < h && cell.z >= 0 && cell.z < d);
    }
    assert.ok(h <= 64, 'it goes up from the ground with 192 blocks of world left');
    // Four chunks wide and deep at the most, like the others (only these need to be loaded).
    assert.ok(w <= 32 && d <= 32);
});

test('it has the homes asked for: every flat has its rooms, and they differ', () => {
    const flats = ctx.apartmentsFlats();
    assert.equal(new Set(flats.map((flat) => flat.n)).size, ctx.APARTMENTS_HOME_FLOORS);
    for (let n = 1; n <= ctx.APARTMENTS_HOME_FLOORS; n++) {
        const count = flats.filter((flat) => flat.n === n).length;
        assert.ok(count >= 2 && count <= 4, `floor ${n}: ${count} homes`);
    }
    const looks = new Set();
    const shapes = new Set();
    for (const flat of flats) {
        const xs = [flat.u0, flat.u0 + flat.width - 1];
        const zs = flat.side === 'front' ? [1, 9] : [14, 22];
        const inside = PLAN.cells.filter((cell) => cell.x >= xs[0] && cell.x <= xs[1] && cell.z >= zs[0] && cell.z <= zs[1] && cell.y > flat.F && cell.y < flat.F + 4);
        const has = (test) => inside.filter((cell) => test(baseOf(cell.type)));
        const wings = flat.loft ? 2 : 1;
        const need = {
            sofa: (b) => b.endsWith('_sofa'), carpet: (b) => b.endsWith('_carpet'), oven: (b) => b === 'oven', fridge: (b) => b === 'fridge',
            sink: (b) => b === 'sink', bed: (b) => b === 'bed', wardrobe: (b) => b === 'wardrobe', toilet: (b) => b === 'toilet',
            bathtub: (b) => b === 'bathtub', mirror: (b) => b === 'wall_mirror', curtain: (b) => b.endsWith('_curtain'), door: (b) => b.endsWith('_door')
        };
        for (const [what, match] of Object.entries(need)) assert.ok(has(match).length > 0, `${flat.name}: no ${what}`);
        assert.equal(has((b) => b === 'bed').length, 2 * wings, flat.name);
        assert.equal(has((b) => b === 'oven').length, 1, flat.name);
        assert.equal(has((b) => b === 'sink').length, 1 + wings, flat.name);
        for (const oven of has((b) => b === 'oven')) assert.equal(stateOf(oven.type).fire, 'off', 'unlit');
        const sofa = has((b) => b.endsWith('_sofa'))[0].type;
        looks.add(`${baseOf(sofa)} ${has((b) => b.endsWith('_curtain'))[0].type.split('_curtain')[0]}`);
        shapes.add(`${flat.width} ${flat.kitchen} ${flat.bath} ${flat.bed} ${flat.extra}`);
    }
    assert.ok(looks.size >= 5, `${looks.size} looks`);
    assert.ok(shapes.size >= 10, `${shapes.size} layouts`);
    // And a modern outside: glass, balconies with railings, a stripe. The lobby and the roof.
    const named = new Map();
    for (const cell of PLAN.cells) named.set(baseOf(cell.type), (named.get(baseOf(cell.type)) || 0) + 1);
    for (const type of ['concrete', 'glass', 'iron_bars', 'orange_brick', 'wall_shelf', 'wall_clock', 'flower_pot', 'bench', 'grass', 'sign']) assert.ok(named.get(type), type);
});

test('all 4 turns: footprint, doors, stairs, facing, wall items, hanging items, pieces of two cells', () => {
    const wallShapes = new Set(['painting', 'wall_mirror', 'wall_clock', 'wall_shelf', 'curtain']);
    const lift = { door: 0, stop: 0, stairs: 0 };
    for (const turns of TURNS) {
        const { layout, typeAt } = layoutOf(turns);
        const [w, h, d] = PLAN.size;
        assert.deepEqual([...layout.size], turns % 2 ? [d, h, w] : [w, h, d]);
        const solidAt = (x, y, z) => {
            const type = typeAt(x, y, z);
            return Boolean(type) && blocks.registry.solid[blocks.registry.id(type)] === 1;
        };
        const counts = { wall: 0, hanging: 0, linked: 0 };
        layout.cells.forEach((cell, index) => {
            const source = PLAN.cells[index];
            const def = defOf(cell.type);
            const state = stateOf(cell.type);
            const where = `${cell.type} at ${source.x},${source.y},${source.z}, turned ${turns}`;
            assert.equal(cell.y, source.y);
            const [ex, ez] = turned(turns, source.x, source.z);
            assert.deepEqual([cell.x, cell.z], [ex, ez], where);
            const before = stateOf(source.type).facing;
            if (FACINGS.includes(before)) {
                assert.equal(state.facing, FACINGS[(FACINGS.indexOf(before) + turns) % 4], where);
                assert.equal(baseOf(cell.type), baseOf(source.type));
            } else {
                assert.equal(cell.type, source.type);
            }
            if (wallShapes.has(def.shape)) {
                const [dx, dz] = DIRECTIONS[state.facing];
                assert.ok(solidAt(cell.x - dx, cell.y, cell.z - dz), `no wall behind ${where}`);
                counts.wall++;
            }
            if (def.shape === 'chandelier' || state.mount === 'hanging') {
                assert.ok(solidAt(cell.x, cell.y + 1, cell.z), `nothing above ${where}`);
                counts.hanging++;
            }
            const shape = def.shape && ctx.BLOCK_SHAPES[def.shape];
            if (shape && shape.linked) {
                for (const [dx, dy, dz] of shape.linked(state)) {
                    const other = typeAt(cell.x + dx, cell.y + dy, cell.z + dz);
                    assert.ok(other && baseOf(other) === baseOf(cell.type), `incomplete: ${where}`);
                    assert.equal(stateOf(other).facing, state.facing, where);
                }
                counts.linked++;
            }
            if (def.shape === 'door') lift.door++;
            if (def.shape === 'stairs') lift.stairs++;
            if (baseOf(cell.type) === 'lift_stop') lift.stop++;
        });
        assert.ok(counts.wall > 500 && counts.hanging > 200 && counts.linked > 200, JSON.stringify(counts));
        // The front door: both leaves ahead of the player, looking in, the way the player looks.
        const look = LOOK_BY_TURNS[turns];
        const near = layout.cells.filter((cell, index) => PLAN.cells[index].y <= 2 && PLAN.cells[index].z === 3 && defOf(cell.type).shape === 'door');
        assert.equal(near.length, 4);
        for (const cell of near) assert.equal(stateOf(cell.type).facing, look);
    }
    assert.ok(lift.door && lift.stop && lift.stairs);
});

test('each flat has its bed with a wall at its head and a free cell at its foot, for a bed of two cells', () => {
    const grid = new Map(PLAN.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
    const beds = PLAN.cells.filter((cell) => baseOf(cell.type) === 'bed' && stateOf(cell.type).part === 'head');
    assert.equal(beds.length, ctx.apartmentsFlats().reduce((sum, flat) => sum + (flat.loft ? 2 : 1), 0));
    for (const bed of beds) {
        const facing = stateOf(bed.type).facing;
        const [dx, dz] = DIRECTIONS[facing];
        const wall = grid.get(`${bed.x + dx},${bed.y},${bed.z + dz}`);
        assert.ok(wall && blocks.registry.solid[blocks.registry.id(wall)], `no wall at the head at ${bed.x},${bed.y},${bed.z}`);
        const [fx, fz] = ctx.apartmentsBedFoot(bed.x, bed.z, facing);
        assert.equal(grid.get(`${fx},${bed.y},${fz}`), bed.type.replace('head', 'foot'), `the foot of the bed at ${bed.x},${bed.y},${bed.z}`);
        assert.equal(grid.get(`${fx},${bed.y + 1},${fz}`), undefined);
    }
});

test('on foot, with the lift broken: every flat, floor and the roof from the door, in all 4 turns', () => {
    for (const turns of TURNS) {
        const { reached } = walkOf(turns);
        const cells = new Set(reached.map(([x, z, feet]) => `${Math.floor(x)},${Math.floor(feet)},${Math.floor(z)}`));
        for (const level of PLAN.levels) {
            const [x, z] = turned(turns, level.at[0], level.at[2]);
            assert.ok(cells.has(`${x},${level.at[1]},${z}`), `turned ${turns}: cannot reach ${level.name} (${level.at})`);
        }
        // Nobody on foot gets into the shaft above the lobby, with its doors shut.
        const [sx, sz] = turned(turns, SX, SZ);
        assert.ok(!reached.some(([x, z, feet]) => Math.floor(x) === sx && Math.floor(z) === sz && feet < ctx.APARTMENTS_ROOF_Y), 'in the shaft');
    }
});

test('what is used can be reached and sat on', () => {
    for (const turns of [0, 1]) {
        const { world, reached, layout } = walkOf(turns);
        const cells = new Set(reached.map(([x, z, feet]) => `${Math.floor(x)},${Math.floor(feet)},${Math.floor(z)}`));
        const near = (x, y, z, reach) => {
            for (let dz = -reach; dz <= reach; dz++) {
                for (let dx = -reach; dx <= reach; dx++) {
                    for (let dy = -2; dy <= 1; dy++) if (cells.has(`${x + dx},${y + dy},${z + dz}`)) return true;
                }
            }
            return false;
        };
        layout.cells.forEach((cell, index) => {
            const def = defOf(cell.type);
            const source = PLAN.cells[index];
            // The circuit's own buttons are looked at apart; the core is inside walls.
            if (def.electric && baseOf(cell.type) !== 'fridge') return;
            if (def.seat || def.storageSlots || baseOf(cell.type) === 'oven' || baseOf(cell.type) === 'fridge' || baseOf(cell.type) === 'sink') {
                assert.ok(near(cell.x, cell.y, cell.z, 1), `cannot reach ${cell.type} at ${source.x},${source.y},${source.z}, turned ${turns}`);
            }
            if (def.seat) {
                assert.ok(!world.registry.fullCube[world.getBlockId(cell.x, cell.y + 1, cell.z)], `no room to sit at ${source.x},${source.y},${source.z}`);
                const facing = def.state && def.state.facing ? def.state.facing : 'n';
                const stands = ctx.seatStandOffsets(facing).some(([dx, dz]) => cells.has(`${cell.x + dx},${cell.y},${cell.z + dz}`));
                assert.ok(stands, `nowhere to stand up from ${cell.type} at ${source.x},${source.y},${source.z}`);
            }
        });
    }
});

test('the lobby: the platform can be stepped on and the buttons reached from it and from the landing', () => {
    const { layout } = layoutOf(0);
    const world = makeWorld(4);
    // The lobby's shaft door open as well.
    layout.cells.forEach((cell) => {
        const def = world.blockTypes[cell.type];
        let type = cell.type;
        const liftDoor = def.shape === 'door' && cell.y > 2 && cell.x - layout.min.x === SX;
        if (def.state && def.state.open && def.shape !== 'trapdoor' && !liftDoor) type = world.getShapeStateType(def.variantOf || type, { ...def.state, open: 'open' });
        world.setEditedBlock(cell.x, cell.y, cell.z, type);
    });
    const [sx, sz] = turned(0, PLAN.start[0], PLAN.start[2]);
    const reached = walkable(world, sx, 1, sz, { x0: layout.min.x, x1: layout.min.x + 24, z0: layout.min.z, z1: layout.min.z + 23 });
    const [px, pz] = turned(0, SX, SZ);
    assert.ok(reached.some(([x, z, feet]) => Math.floor(x) === px && Math.floor(z) === pz && feet === 1), 'on the platform');
    const eyeOn = [px + 0.5, 1 + 1.62, pz + 0.5];
    const dist = (a, x, y, z) => Math.hypot(a[0] - x - 0.5, a[1] - y - 0.5, a[2] - z - 0.5);
    const reach = 4.5;
    const [ux, uz] = turned(0, SX + 1, SZ);
    assert.equal(baseOf(world.getBlockTypeAt(ux, 2, uz)), 'push_button');
    assert.ok(dist(eyeOn, ux, 2, uz) < reach);
    // The stop over the door, from the lobby's floor and from the platform.
    const [cx, cz] = turned(0, SX, SZ - 1);
    assert.equal(baseOf(world.getBlockTypeAt(cx, 3, cz)), 'lift_stop');
    const [lx, lz] = turned(0, SX, SZ - 2);
    assert.ok(reached.some(([x, z, feet]) => Math.floor(x) === lx && Math.floor(z) === lz && feet === 1));
    assert.ok(dist([lx + 0.5, 1 + 1.62, lz + 0.5], cx, 3, cz) < reach);
    assert.ok(dist(eyeOn, cx, 3, cz) < reach);
});

test('it is lit at night, by the lights it has', () => {
    const { world, reached, layout } = walkOf(0);
    const levels = new Map();
    const queue = [];
    const put = (x, y, z, level) => {
        levels.set(`${x},${y},${z}`, level);
        queue.push([x, y, z, level]);
    };
    for (const cell of layout.cells) {
        const level = world.registry.lightLevel[world.registry.id(cell.type)];
        if (level) put(cell.x, cell.y, cell.z, level);
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
    const opaque = (x, y, z) => {
        const id = world.getBlockId(x, y, z);
        return id && world.registry.solid[id] && !world.registry.transparent[id];
    };
    const dark = new Set();
    const { min, size } = layout;
    for (const [fx, fz, feet] of reached) {
        const x = Math.floor(fx), y = Math.floor(feet), z = Math.floor(fz);
        // The body of the building: balconies and the front have their lanterns, but are outside.
        if (x < min.x || x >= min.x + size[0] || z < min.z + 3 || z > min.z + 20) continue;
        let covered = false;
        for (let up = y + 2; up < size[1] && !covered; up++) covered = opaque(x, up, z);
        if (covered && (levels.get(`${x},${y},${z}`) || 0) < 6) dark.add(`${x - min.x},${y},${z - min.z}`);
    }
    assert.deepEqual([...dark], [], 'dark at night (local x,y,z)');
});

test('the signs: Spanish first, within what the server keeps, whole on their boards, with free floor', () => {
    const signs = PLAN.cells.filter((cell) => baseOf(cell.type) === 'sign');
    assert.ok(signs.length >= ctx.APARTMENTS_HOME_FLOORS + 3);
    const { world } = walkOf(0);
    const { layout } = layoutOf(0);
    // About what Arial Bold measures, letter by letter, in ems: on the wide side, not to fool anyone.
    const em = (letter) => (/[A-ZÁÉÍÓÚÑ]/.test(letter) ? 0.74 : /[mw]/.test(letter) ? 0.9 : /[.,:;il' ]/.test(letter) ? 0.3 : 0.6);
    const measureAt = (font) => (line) => Array.from(line).reduce((width, letter) => width + em(letter) * font, 0);
    layout.cells.forEach((cell, index) => {
        if (baseOf(cell.type) !== 'sign') return;
        const text = PLAN.cells[index].meta.t;
        const parts = text.split(' // ');
        const [es] = parts;
        assert.ok(es && parts.length >= 2 && parts[parts.length - 1], text);
        assert.ok(Buffer.byteLength(text) <= 288, text);
        const board = vm.runInContext('signBoardLayoutFor', ctx)(text, measureAt);
        assert.equal(board.truncated, false, text);
        assert.equal(board.lines.join(' '), es, `not what its board shows: ${es}`);
        const [dx, dz] = ctx.SHAPE_DIRECTIONS[world.blockTypes[cell.type].state.facing];
        assert.ok(!world.registry.fullCube[world.getBlockId(cell.x + dx, cell.y, cell.z + dz)], `looks at a wall: ${text}`);
    });
});

// ---------------------------------------------------------------------------------------
// The lift

test('the lift: platform, only air, the winch, within the rope; a stop and an iron door on each floor', () => {
    const grid = new Map(PLAN.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
    const typeAt = (x, y, z) => grid.get(`${x},${y},${z}`);
    const winch = ctx.APARTMENTS_WINCH_Y;
    assert.equal(typeAt(SX, 0, SZ), 'lift_platform');
    assert.equal(typeAt(SX, winch, SZ), 'lift_winch');
    for (let y = 1; y < winch; y++) assert.equal(typeAt(SX, y, SZ), undefined, `not air at ${y}`);
    // As mechanics.go: at most 48 of rope, stopping 2 below the winch.
    assert.ok(winch - 0 - 1 <= 48, 'rope at the bottom');
    const top = winch - 3;
    assert.equal(top, ctx.APARTMENTS_HOME_FLOORS * ctx.APARTMENTS_STEP, 'the top is the last floor of homes');
    // One more floor could not be reached: 48 is more than the 46 a platform can travel.
    assert.ok((ctx.APARTMENTS_HOME_FLOORS + 1) * ctx.APARTMENTS_STEP > 48 - 2);
    assert.equal(ctx.APARTMENTS_ROOF_Y, 48);

    for (let n = 0; n <= ctx.APARTMENTS_HOME_FLOORS; n++) {
        const F = n * ctx.APARTMENTS_STEP;
        // A door of the shaft on every floor, shut, and two cells of head room on the platform.
        assert.equal(baseOf(typeAt(SX, F + 1, SZ - 1)), 'iron_door');
        assert.equal(stateOf(typeAt(SX, F + 1, SZ - 1)).open, 'closed');
        assert.equal(baseOf(typeAt(SX, F + 2, SZ - 1)), 'iron_door');
        // The stop over it: 3 above the platform that stands level with the floor, as mechanics.go.
        assert.equal(typeAt(SX, F + 3, SZ - 1), 'lift_stop');
        // Green on all but the top, red on all but the lobby, each on its wool.
        const top = n === ctx.APARTMENTS_HOME_FLOORS;
        assert.equal(typeAt(SX + 1, F + 2, SZ) === 'push_button', !top);
        assert.equal(typeAt(SX + 1, F + 1, SZ), top ? 'concrete' : 'lime_wool');
        assert.equal(typeAt(SX - 1, F + 2, SZ) === 'push_button', n > 0);
        assert.equal(typeAt(SX - 1, F + 1, SZ), n > 0 ? 'red_wool' : 'concrete');
    }
    // What the old lift was made of is gone: this one is stops, two buses and one rtg.
    const bases = PLAN.cells.map((cell) => baseOf(cell.type));
    for (const gone of ['motor_ram', 'sticky_ram', 'latch', 'delay_gate', 'not_gate', 'or_gate', 'ram_arm', 'wire_post']) assert.ok(!bases.includes(gone), gone);
    assert.equal(bases.filter((base) => base === 'lift_stop').length, ctx.APARTMENTS_HOME_FLOORS + 2);
    const generators = PLAN.cells.filter((cell) => ctx.ELECTRIC_KINDS[baseOf(cell.type)] && ctx.ELECTRIC_KINDS[baseOf(cell.type)].role === 'generator');
    assert.deepEqual(generators.map((cell) => cell.type), ['rtg']);
});

test('riding: your floor\'s stop and the next one up are in reach, and green and red', () => {
    const grid = new Map(PLAN.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
    const reach = 4.5;
    for (let n = 0; n <= ctx.APARTMENTS_HOME_FLOORS; n++) {
        const F = n * ctx.APARTMENTS_STEP;
        const eye = [SX + 0.5, F + 1 + 1.62, SZ + 0.5];
        // The nearest point of a stop's face towards the shaft, or of a button's top.
        const toFace = (y) => Math.hypot(eye[0] - (SX + 0.5), eye[1] - Math.max(y, Math.min(y + 1, eye[1])), eye[2] - SZ);
        assert.ok(toFace(F + 3) < reach, `own stop, floor ${n}`);
        if (n < ctx.APARTMENTS_HOME_FLOORS) assert.ok(toFace(F + 3 + ctx.APARTMENTS_STEP) < reach, `the stop above, floor ${n}`);
        for (const dx of [1, -1]) {
            if (grid.get(`${SX + dx},${F + 2},${SZ}`) !== 'push_button') continue;
            assert.ok(Math.hypot(eye[0] - (SX + dx + 0.5), eye[1] - (F + 2 + 3 / 16), eye[2] - (SZ + 0.5)) < reach);
        }
    }
});

test('the stop locks the iron door under it, either half, and no other', () => {
    const world = makeWorld(1);
    const messages = [];
    const game = new ctx.Game();
    Object.assign(game, { world, receiveSystemMessage: ({ text }) => messages.push(text), getInteractionRay: () => ({ direction: new Vector3(0, 0, 1) }), network: { connected: false }, playNoiseBurst() {}, playTone() {} });
    const place = (x, type, stop) => {
        world.setEditedBlock(x, 1, 2, world.getShapeStateType(type, { half: 'lower', facing: 's', hinge: 'left', open: 'closed' }));
        world.setEditedBlock(x, 2, 2, world.getShapeStateType(type, { half: 'upper', facing: 's', hinge: 'left', open: 'closed' }));
        if (stop) world.setEditedBlock(x, 3, 2, 'lift_stop');
    };
    place(1, 'iron_door', true);
    place(3, 'iron_door', false);
    place(5, 'oak_door', true);
    for (const y of [1, 2]) {
        const before = world.getBlockTypeAt(1, y, 2);
        assert.equal(game.joineryToggle({ x: 1, y, z: 2 }), true, 'taken: no block is placed against it');
        assert.equal(world.getBlockTypeAt(1, y, 2), before);
    }
    assert.equal(messages.length, 2);
    game.joineryToggle({ x: 3, y: 1, z: 2 });
    assert.equal(stateOf(world.getBlockTypeAt(3, 1, 2)).open, 'open', 'an iron door with no stop opens by hand, as ever');
    game.joineryToggle({ x: 5, y: 1, z: 2 });
    assert.equal(stateOf(world.getBlockTypeAt(5, 1, 2)).open, 'open', 'a wooden one too');
});

// What pkg/network/construction_apartments_test.go places on the real grid, in each turn: every
// electric block and the platform, and where each button is.
function liftData() {
    const electric = (type) => Boolean(ctx.ELECTRIC_KINDS[baseOf(type)]);
    return TURNS.map((turns) => {
        const { layout } = layoutOf(turns);
        const cells = [];
        const buttons = { green: {}, red: {} };
        const stops = {};
        layout.cells.forEach((cell, index) => {
            const source = PLAN.cells[index];
            if (!electric(cell.type) && cell.type !== 'lift_platform' && baseOf(cell.type) !== 'iron_door') return;
            cells.push([cell.x, cell.y, cell.z, cell.type]);
            const n = Math.floor(source.y / ctx.APARTMENTS_STEP);
            const at = [cell.x, cell.y, cell.z];
            if (baseOf(cell.type) === 'push_button') buttons[source.x === SX + 1 ? 'green' : 'red'][n] = at;
            if (baseOf(cell.type) === 'lift_stop') {
                if (source.z === SZ - 1) stops[n] = at;
                else buttons.lobbyStop = at;
            }
        });
        const [sx, sz] = turned(turns, SX, SZ);
        return { turns, shaft: [sx, sz], winchY: ctx.APARTMENTS_WINCH_Y, floors: ctx.APARTMENTS_HOME_FLOORS, step: ctx.APARTMENTS_STEP, buttons, stops, cells };
    });
}

test('the data of the Go test on the real grid is this design', () => {
    const text = `${JSON.stringify(liftData())}\n`;
    if (process.env.APARTMENTS_WRITE) {
        fs.mkdirSync(path.dirname(TESTDATA), { recursive: true });
        fs.writeFileSync(TESTDATA, text);
    }
    assert.equal(fs.readFileSync(TESTDATA, 'utf8'), text, 'stale: see the top of this file');
});

// ---------------------------------------------------------------------------------------
// The command

function makeGame(world, look) {
    const game = new ctx.Game();
    const sent = [];
    const messages = [];
    Object.assign(game, {
        world,
        creativeMode: true,
        receiveSystemMessage: ({ text }) => messages.push(text),
        cameraController: { eyeHeight: 1.62, getPosition: () => ({ x: 0.5, y: 2.62, z: 0.5 }) },
        getInteractionRay: () => ({ direction: new Vector3(look.x, 0, look.z) }),
        network: { connected: true, ws: { bufferedAmount: 0 }, send: (type, payload) => sent.push({ type, payload }) }
    });
    return { game, sent, messages };
}

function run(game) {
    for (let i = 0; i < 400000 && (game.constructionJob || game.constructionWaiting); i++) game.constructionUpdate(1 / 60);
    assert.ok(!game.constructionJob && !game.constructionWaiting, 'it ends');
}

function snapshot(world) {
    const out = {};
    for (let x = -30; x <= 34; x++) {
        for (let z = -30; z <= 34; z++) {
            for (let y = -6; y <= 56; y++) {
                const type = world.getBlockTypeAt(x, y, z);
                if (type) out[`${x},${y},${z}`] = type;
            }
        }
    }
    return out;
}

test('/build apartments: it ends as planned, by blockPlace, the signs with their text, and undo restores', () => {
    const world = makeWorld(3);
    world.setEditedBlock(5, 3, 9, 'planks');
    const before = snapshot(world);
    const { game, sent, messages } = makeGame(world, { x: 0, z: 1 });
    game.constructionCommand('build', [NAME]);
    run(game);
    assert.ok(messages.some((text) => text.includes('finished')));
    assert.ok(sent.every(({ type }) => type === 'blockPlace' || type === 'blockBreak'), 'blocks and nothing else');
    const layout = ctx.constructionLayout(PLAN, 0, { x: 0, z: 3 }, 0, world.blockTypes);
    for (const cell of layout.cells) {
        assert.equal(world.getBlockTypeAt(cell.x, cell.y, cell.z), cell.type);
        if (cell.meta && cell.meta.t) assert.equal(world.getSignTextAt(cell.x, cell.y, cell.z), cell.meta.t);
    }
    // The electric blocks go out as any other: the server tracks them from these messages.
    const placed = new Set(sent.filter(({ type }) => type === 'blockPlace').map(({ payload }) => payload.blockType));
    for (const type of ['rtg', 'lift_winch', 'lift_platform', 'lift_stop', 'push_button']) assert.ok(placed.has(type), type);
    game.constructionCommand('build', ['undo']);
    run(game);
    assert.deepEqual(snapshot(world), before);
});
