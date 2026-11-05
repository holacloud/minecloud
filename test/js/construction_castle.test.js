// Node tests for /build castle (js/game/construction_castle.js) and for what the builder does with a
// box bigger than what is loaded (js/game/constructions.js, world.js): the plan, its rotation, that
// everything can be walked to with a stricter fill than constructions.test.js, light, the site, the
// moat, undo, stopping and reconnecting.
// Run with: node --test test/js/construction_castle.test.js

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
    for (const file of ['extensions.js', 'chunkStore.js', 'blockShapes.js', 'chunkMesher.js', 'camera.js', 'mobSpecies.js', 'blockTextures.js', 'world.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, file), 'utf8'), context, { filename: file });
    }
    vm.runInContext('class Game {}; function resourcesDrawSprite() { return () => {}; } function resourcesDisplayMesh() { return null; }', context);
    for (const file of ['joinery.js', 'chemistry.js', 'electricity.js', 'blueprints.js', 'constructions.js', 'furniture.js', 'seating.js', 'storage.js', 'decor.js', 'mirrors.js', 'construction_castle.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    }
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, CameraController, BLOCK_SHAPES, Game, CONSTRUCTION_DESIGNS, constructionPlan, constructionLayout,
        CASTLE_GROUND, CASTLE_RIM, CASTLE_SIZE, CONSTRUCTION_RESEND, chunkIndex });`, context);
    return context;
}

const ctx = loadGame();
const G = ctx.CASTLE_GROUND;
const F = G + 1;
const MID = 60;
const SIZE = ctx.CASTLE_SIZE;
// The local 's' of a design turns to these with 0, 1, 2 and 3 quarter turns.
const LOOK_BY_TURNS = [[0, 1], [-1, 0], [0, -1], [1, 0]];
const FACINGS = ['n', 'e', 's', 'w'];
const DIRECTIONS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

// Local [x, feet, z] of everywhere a visitor must get to. The levels on the design would be the same list;
// they are here so the design stays only the drawing.
const LEVELS = {
    'the bank': [MID, F, 8],
    'the bridge': [MID, F, 15],
    'the way through the gate': [MID, F, 23],
    'the courtyard': [MID, F, 40],
    'the garden': [37, F, 34],
    'by the well': [37, F, 37],
    'the market': [72, F, 38],
    'the stables aisle': [35, F, 70],
    'a horse stall': [30, F, 67],
    'the forge': [88, F, 71],
    'behind the keep': [60, F, 90],
    'the room over the gate': [MID, F + 6, 23],
    'the roof of the gate': [MID, F + 12, 23],
    'the front wall walk, west': [38, F + 12, 22],
    'the front wall walk, east': [82, F + 12, 22],
    'the west wall walk': [22, F + 12, 40],
    'the east wall walk': [98, F + 12, 40],
    'the back wall walk': [40, F + 12, 98],
    'the west gallery': [23, F, 40],
    'the east gallery': [97, F, 80],
    'the back gallery': [80, F, 97],
    'the front gallery': [38, F, 23],
    'the great hall': [MID, F, 62],
    'the throne': [MID, F + 2, 73],
    'the kitchen': [MID, F, 79],
    'the dungeon': [55, G - 5, 71],
    'a dungeon cell': [56, G - 5, 66],
    'the bedroom corridor': [MID, G + 11, 66],
    'a bedroom in front': [52, G + 11, 60],
    'a bedroom, second in front': [62, G + 11, 60],
    'a bedroom, third in front': [71, G + 11, 60],
    'a bedroom in the middle': [46, G + 11, 72],
    'a bedroom, second': [55, G + 11, 72],
    'a bedroom, third': [66, G + 11, 72],
    'a bedroom, fourth': [72, G + 11, 72],
    'the royal chamber': [MID, G + 11, 82],
    'the library': [MID, G + 17, 66],
    'the armoury': [MID, G + 17, 79],
    'the chapel': [MID, G + 23, 70],
    'by the altar': [MID, G + 24, 83],
    'the battlements on the keep': [46, G + 35, 72]
};
for (const [name, cx, cz] of [['north-west', 24, 24], ['north-east', 96, 24], ['south-west', 24, 96], ['south-east', 96, 96]]) {
    for (const [floor, feet] of [['ground', F], ['first', F + 6], ['wall walk', F + 12], ['third', F + 18], ['top', F + 24]]) {
        LEVELS[`the ${name} tower, ${floor}`] = [cx + 3, feet, cz + 3 * (cz < MID ? 1 : -1)];
    }
}
for (const [name, cx, cz] of [['west', 22, 60], ['east', 98, 60], ['back', 60, 98], ['gate west', 51, 22], ['gate east', 69, 22]]) {
    for (const feet of [F, F + 6, F + 12, F + 18, F + 24]) LEVELS[`the ${name} tower, feet ${feet}`] = [cx - 3, feet, cz + 3];
}

// A flat world of stone with loaded chunks around the origin; ground(x, z) is the height of the top block.
function makeWorld(ground = () => 3, radius = 10) {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    world.getChunkMaterial = (type) => `material:${type}`;
    const stone = world.registry.id('stone');
    for (let cx = -radius; cx < radius; cx++) {
        for (let cz = -radius; cz < radius; cz++) {
            const column = new ctx.ChunkColumn(cx, cz);
            for (let lx = 0; lx < 16; lx++) {
                for (let lz = 0; lz < 16; lz++) {
                    const top = ground(cx * 16 + lx, cz * 16 + lz);
                    for (let y = -16; y <= top; y++) column.blocks[ctx.chunkIndex(lx, y, lz)] = stone;
                }
            }
            world.columns.set(world.chunkKey(cx, cz), column);
        }
    }
    return world;
}

function makeGame(world, { look = { x: 0, z: 1 }, at = { x: 0.5, y: 5.62, z: 0.5 } } = {}) {
    const game = new ctx.Game();
    const messages = [];
    const sent = [];
    Object.assign(game, {
        world,
        creativeMode: true,
        receiveSystemMessage: ({ text }) => messages.push(text),
        cameraController: { eyeHeight: 1.62, getPosition: () => at },
        getInteractionRay: () => ({ direction: new Vector3(look.x, 0, look.z) }),
        network: { connected: true, ws: { bufferedAmount: 0 }, send: (type, payload) => sent.push({ type, payload }) }
    });
    return { game, messages, sent };
}

function run(game, frames = 400000) {
    for (let i = 0; i < frames && (game.constructionJob || game.constructionWaiting || game.constructionScan); i++) game.constructionUpdate(1 / 60);
    assert.ok(!game.constructionJob && !game.constructionWaiting && !game.constructionScan, 'it ends');
}

// From a local (x, y, z) to the world, for a build with its anchor 3 ahead of (0, 0).
function toWorld(turns, baseY) {
    const [fx, fz] = LOOK_BY_TURNS[turns];
    const anchor = { x: fx * 3, z: fz * 3 };
    return ([x, y, z]) => [anchor.x + fx * z + fz * (x - MID), baseY + y, anchor.z + fz * z - fx * (x - MID)];
}

// The castle built, all 4 ways, once: the next tests read it. On flat ground 3, so the level is 3.
const built = new Map();
function buildTurned(turns) {
    if (!built.has(turns)) {
        const world = makeWorld();
        const [lx, lz] = LOOK_BY_TURNS[turns];
        const { game, sent, messages } = makeGame(world, { look: { x: lx, z: lz } });
        game.constructionCommand('build', ['castle']);
        run(game);
        const baseY = 3 - G;
        const layout = ctx.constructionLayout(ctx.constructionPlan('castle'), turns, { x: lx * 3, z: lz * 3 }, baseY, world.blockTypes);
        built.set(turns, { world, game, sent, messages, layout, baseY, at: toWorld(turns, baseY) });
    }
    return built.get(turns);
}

const blocks = makeWorld(() => 3, 1);
const defOf = (type) => blocks.blockTypes[type];
const baseOf = (type) => defOf(type).variantOf || type;
const stateOf = (type) => defOf(type).state || {};
const idOf = (type) => blocks.registry.id(type || 'air');

// Doors and gates open, as a visitor would open them.
function openAll(world, layout) {
    for (const cell of layout.cells) {
        const def = world.blockTypes[cell.type];
        if (def.state && def.state.open && def.shape !== 'trapdoor') {
            world.setEditedBlock(cell.x, cell.y, cell.z, world.getShapeStateType(def.variantOf || cell.type, { ...def.state, open: 'open' }));
        }
    }
}

// Everywhere a player can walk, with no jump. Stricter than the fill of constructions.test.js, which
// goes up full blocks (a point of the grid may land on top of one) and over panes (half a block a
// step is more than a pane is thick): here a step is a quarter of a block, a move only goes up what
// the camera steps up (0.55) with room for the body on both ends, and water stops it,
// so the moat is crossed by the bridge or not at all.
function walkTight(world, start, limit = () => true, targets = null) {
    const camera = { position: new Vector3(0, 0, 0), rotation: {} };
    const player = new ctx.CameraController(camera, { addEventListener() {} });
    // The same boxes, kept: the world does not change during a walk, and there are millions of asks.
    const boxes = new Map();
    player.setCollisionBoxGetter((x, y, z) => {
        const k = (x + 512) * 1048576 + (z + 512) * 512 + y + 64;
        let list = boxes.get(k);
        if (!list) boxes.set(k, list = world.getCollisionBoxes(x, y, z));
        return list;
    });
    const water = world.registry.id('water');
    const seen = new Set();
    const key = (x, z, feet) => (Math.round(x * 4) + 4096) * 16777216 * 8 + (Math.round(z * 4) + 4096) * 8192 + Math.round(feet * 16 + 512);
    const queue = [[start[0] + 0.5, start[2] + 0.5, start[1]]];
    seen.add(key(...queue[0]));
    assert.ok(player.canStandAt(queue[0][0], queue[0][1], start[1]), `the start is free: ${start}`);
    for (let head = 0; head < queue.length; head++) {
        const [x, z, feet] = queue[head];
        for (const [dx, dz] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
            const nx = x + dx;
            const nz = z + dz;
            if (!limit(nx, nz)) continue;
            const reach = feet + player.stepHeight;
            const floor = player.getSupportFloorY(nx, nz, reach, reach);
            if (floor > reach + 0.001 || floor < -40) continue;
            const stand = Math.max(floor, feet);
            if (!player.canStandAt(nx, nz, stand) || (stand > feet && !player.canStandAt(x, z, stand))) continue;
            if (world.getBlockId(Math.floor(nx), Math.floor(floor), Math.floor(nz)) === water) continue;
            const k = key(nx, nz, floor);
            if (seen.has(k)) continue;
            seen.add(k);
            queue.push([nx, nz, floor]);
            // Enough, when all that is asked is a list of places.
            if (targets && targets.delete(`${Math.floor(nx)},${Math.floor(floor)},${Math.floor(nz)}`) && targets.size === 0) return queue;
        }
    }
    return queue;
}

const reachedByTurn = new Map();
function reachedCells(turns) {
    if (!reachedByTurn.has(turns)) {
        const site = buildTurned(turns);
        openAll(site.world, site.layout);
        // The first turn in full, as the test of light reads it; the others just as far as they have to.
        const targets = turns === 0 ? null : new Set(Object.values(LEVELS).map(([x, feet, z]) => site.at([x, feet, z]).join(',')));
        const queue = walkTight(site.world, site.at([MID, F, 1]), () => true, targets);
        reachedByTurn.set(turns, { queue, cells: new Set(queue.map(([x, z, feet]) => `${Math.floor(x)},${Math.floor(feet)},${Math.floor(z)}`)) });
    }
    return reachedByTurn.get(turns);
}

// ---------------------------------------------------------------------------------------
// The plan

test('every block of the castle exists, it is about 100 x 100 and it is listed in creative only', () => {
    const plan = ctx.constructionPlan('castle');
    for (const type of new Set(plan.cells.map((cell) => cell.type))) {
        assert.ok(defOf(type), `${type} is not a block`);
        assert.ok(type === 'air' || blocks.registry.ids[type] !== undefined, `${type} is not a world block`);
        assert.ok(!defOf(type).itemOnly, `${type} is an item`);
    }
    assert.ok(defOf(plan.foundation));
    assert.ok(plan.cells.length > 40000 && plan.cells.length < 110000, `${plan.cells.length} cells`);
    const xs = plan.cells.map((cell) => cell.x);
    assert.equal(Math.max(...xs) - Math.min(...xs) + 1, 101);
    const types = new Set(plan.cells.map((cell) => baseOf(cell.type)));
    for (const type of ['water', 'iron_bars', 'stone_bricks', 'limestone', 'slate', 'basalt', 'oven', 'chest', 'bookshelf', 'chandelier', 'lantern', 'candle', 'dark_oak_door', 'iron_door', 'red_stained_glass', 'blue_stained_glass', 'red_carpet', 'red_curtain', 'bed', 'barrel', 'table', 'dark_oak_chair', 'bench', 'gold_block', 'dark_oak_fence_gate']) {
        assert.ok(types.has(type), type);
    }
    // The ovens are off, as a build cannot light them.
    for (const cell of plan.cells) {
        if (baseOf(cell.type) === 'oven') assert.equal(stateOf(cell.type).fire, 'off');
    }
    const shown = makeGame(makeWorld(() => 3, 1));
    shown.game.constructionCommand('build', []);
    assert.ok(shown.messages[0].includes('castle (Castle, 121 x 121, 72 high)'), shown.messages[0]);
    const hidden = makeGame(makeWorld(() => 3, 1));
    hidden.game.creativeMode = false;
    hidden.game.constructionCommand('build', ['castle']);
    assert.deepEqual(hidden.messages, ['Unknown command: /build']);
    assert.ok(!hidden.game.constructionWaiting && !hidden.game.constructionScan);
});

test('the castle is recognisable: towers, battlements, a keep over everything', () => {
    const plan = ctx.constructionPlan('castle');
    const grid = new Map(plan.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
    const top = (x, z) => {
        for (let y = plan.size[1] - 1; y >= 0; y--) {
            const type = grid.get(`${x},${y},${z}`);
            if (type && type !== 'air') return y;
        }
        return -1;
    };
    // The keep's roof stands well over the towers, which stand over the walls.
    assert.ok(top(MID, 72) > G + 40, `keep ${top(MID, 72)}`);
    assert.ok(top(24, 24) >= G + 26 && top(24, 24) < top(MID, 72));
    assert.ok(top(24, 40) < top(24, 24));
    // Crenellations: the parapet goes up and down along a wall.
    const parapet = [];
    for (let u = 32; u < 40; u++) parapet.push(top(20, u));
    assert.ok(new Set(parapet).size >= 2, `flat parapet ${parapet}`);
    // Buttresses stand out of the wall every few blocks.
    assert.ok(grid.has(`20,${G + 4},40`) && !grid.has(`20,${G + 4},41`));
    // Arrow slits: bars in the wall.
    assert.equal(grid.get(`22,${G + 2},44`), 'iron_bars');
    // A real gate: doors across the only way in.
    assert.equal(defOf(grid.get(`58,${F},20`)).shape, 'door');
    assert.equal(stateOf(grid.get(`58,${F},20`)).facing, 's');
});

test('all 4 turns: the footprint, the doors, the stairs, wall items, hanging items and two-high pieces', () => {
    const wallShapes = new Set(['painting', 'wall_mirror', 'wall_clock', 'wall_shelf', 'curtain']);
    const plan = ctx.constructionPlan('castle');
    for (let turns = 0; turns < 4; turns++) {
        const [fx, fz] = LOOK_BY_TURNS[turns];
        const anchor = { x: 3 * fx, z: 3 * fz };
        const layout = ctx.constructionLayout(plan, turns, anchor, 0, blocks.blockTypes);
        const grid = new Map(layout.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
        const typeAt = (x, y, z) => grid.get(`${x},${y},${z}`);
        const solidAt = (x, y, z) => {
            const type = typeAt(x, y, z);
            return Boolean(type) && type !== 'air' && blocks.registry.solid[idOf(type)] === 1;
        };
        const counts = { wall: 0, hanging: 0, doors: 0, tall: 0, stairs: 0 };
        layout.cells.forEach((cell, i) => {
            const source = plan.cells[i];
            const def = defOf(cell.type);
            const state = stateOf(cell.type);
            const where = `${cell.type} at ${source.x},${source.y},${source.z}, turned ${turns}`;
            assert.equal(cell.x, anchor.x + fx * source.z + fz * (source.x - MID));
            assert.equal(cell.z, anchor.z + fz * source.z - fx * (source.x - MID));
            const before = stateOf(source.type);
            if (before.facing) assert.equal(state.facing, FACINGS[(FACINGS.indexOf(before.facing) + turns) % 4], where);
            if (def.shape === 'stairs') counts.stairs++;
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
                    assert.ok(other && other !== 'air' && baseOf(other) === baseOf(cell.type), `incomplete: ${where}`);
                    if (state.half) assert.notEqual(stateOf(other).half, state.half, where);
                    else assert.notEqual(stateOf(other).part, state.part, where);
                    assert.equal(stateOf(other).facing, state.facing, where);
                }
                if (def.shape === 'door') counts.doors++;
                else counts.tall++;
            }
        });
        assert.ok(counts.wall >= 30 && counts.hanging >= 100 && counts.doors >= 40 && counts.tall >= 10 && counts.stairs >= 500, JSON.stringify(counts));
    }
});

test('the signs: Spanish, then English, short, and free of the walls', () => {
    const plan = ctx.constructionPlan('castle');
    const signs = plan.cells.filter((cell) => baseOf(cell.type) === 'sign');
    assert.ok(signs.length >= 8);
    const grid = new Map(plan.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
    for (const cell of signs) {
        const [es, en] = cell.meta.t.split(' // ');
        assert.ok(es && en, cell.meta.t);
        assert.ok(es.length <= 20 && en.length <= 20, cell.meta.t);
        assert.ok(Buffer.byteLength(cell.meta.t) <= 288);
        const [dx, dz] = DIRECTIONS[stateOf(cell.type).facing];
        for (const [x, y, z] of [[cell.x, cell.y + 1, cell.z], [cell.x + dx, cell.y, cell.z + dz], [cell.x + dx, cell.y + 1, cell.z + dz]]) {
            const type = grid.get(`${x},${y},${z}`);
            assert.ok(!type || type === 'air' || !blocks.registry.fullCube[idOf(type)], `${cell.meta.t}: ${type} in the way`);
        }
    }
});

test('every bed is whole: its foot in the cell away from where the head points', () => {
    const plan = ctx.constructionPlan('castle');
    const grid = new Map(plan.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
    const beds = plan.cells.filter((cell) => baseOf(cell.type) === 'bed' && stateOf(cell.type).part === 'head');
    assert.ok(beds.length >= 8);
    for (const bed of beds) {
        const [dx, dz] = DIRECTIONS[stateOf(bed.type).facing];
        assert.equal(grid.get(`${bed.x - dx},${bed.y},${bed.z - dz}`), bed.type.replace('head', 'foot'), `the foot of the bed at ${bed.x},${bed.y},${bed.z}`);
    }
    assert.equal(plan.cells.filter((cell) => baseOf(cell.type) === 'bed').length, 2 * beds.length);
});

// ---------------------------------------------------------------------------------------
// Walking

for (let turns = 0; turns < 4; turns++) {
    test(`turned ${turns}: from the gate one walks to every floor, tower and wall, without a jump`, () => {
        const { cells } = reachedCells(turns);
        const { at } = buildTurned(turns);
        const missed = [];
        for (const [name, [x, feet, z]] of Object.entries(LEVELS)) {
            const [wx, wy, wz] = at([x, feet, z]);
            if (!cells.has(`${wx},${wy},${wz}`)) missed.push(`${name} (${x},${feet},${z})`);
        }
        assert.deepEqual(missed, []);
    });
}

test('with the gate shut nobody walks in, and the moat stops whoever tries', () => {
    const site = buildTurned(0);
    const world = makeWorld();
    for (const { x, y, z, type } of site.sent.map(({ type: kind, payload }) => ({ ...payload, type: kind === 'blockPlace' ? payload.blockType : null }))) world.setEditedBlock(x, y, z, type);
    const queue = walkTight(world, site.at([MID, F, 1]));
    // Turned 0, local z is the world's less 3 and local x the world's plus the middle. The bank all
    // round is outside; inside the moat, only the berm in front of the gate.
    const local = queue.map(([x, z]) => [Math.floor(x) + MID, Math.floor(z) - 3]);
    assert.ok(local.some(([x, z]) => x === MID && z === 19), 'up to the gate');
    assert.deepEqual(local.filter(([x, z]) => x >= 19 && x <= 101 && z >= 21 && z <= 101).slice(0, 3), [], 'beyond it');
});

// ---------------------------------------------------------------------------------------
// Light

test('the inside is lit at night', () => {
    const site = buildTurned(0);
    const { world, layout } = site;
    const { queue } = reachedCells(0);
    const levels = new Map();
    const todo = [];
    const put = (x, y, z, level) => {
        levels.set(`${x},${y},${z}`, level);
        todo.push([x, y, z, level]);
    };
    for (const cell of layout.cells) {
        const level = world.registry.lightLevel[world.registry.id(cell.type)];
        if (level) put(cell.x, cell.y, cell.z, level);
    }
    for (let head = 0; head < todo.length; head++) {
        const [x, y, z, level] = todo[head];
        if (level <= 1) continue;
        for (const [sx, sy, sz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
            const nx = x + sx, ny = y + sy, nz = z + sz;
            if ((levels.get(`${nx},${ny},${nz}`) || 0) >= level - 1) continue;
            if (world.registry.fullCube[world.getBlockId(nx, ny, nz)]) continue;
            put(nx, ny, nz, level - 1);
        }
    }
    const { min } = layout;
    // The rooms, by name: eaves and the shade of walls are not rooms, and light there means nothing.
    // Local x0, z0, x1, z1 and the feet from and to.
    const rooms = [
        ['the keep', 44, 58, 76, 86, G - 5, G + 34],
        ['the way through the gate and the room over it', 58, 21, 62, 26, F, F + 6],
        ['the stables', 28, 65, 36, 85, F, F],
        ['the forge', 85, 65, 93, 77, F, F],
        ['the west gallery', 23, 31, 23, 89, F, F],
        ['the east gallery', 97, 31, 97, 89, F, F],
        ['the back gallery', 31, 97, 89, 97, F, F],
        ['the front gallery, west', 31, 23, 43, 23, F, F],
        ['the front gallery, east', 77, 23, 89, 23, F, F]
    ];
    for (const [cx, cz, top] of [[24, 24, F + 18], [96, 24, F + 18], [24, 96, F + 18], [96, 96, F + 18], [22, 60, F + 24], [98, 60, F + 24], [60, 98, F + 24], [51, 22, F + 18], [69, 22, F + 18]]) {
        rooms.push([`the tower at ${cx},${cz}`, cx - 3, cz - 3, cx + 3, cz + 3, F, top]);
    }
    const dark = new Set();
    let indoors = 0;
    const checked = new Set();
    for (const [fx, fz, feet] of queue) {
        const x = Math.floor(fx), y = Math.floor(feet), z = Math.floor(fz);
        const key = `${x},${y},${z}`;
        if (checked.has(key)) continue;
        checked.add(key);
        const [lx, ly, lz] = [x - min.x, y - min.y, z - min.z];
        const room = rooms.find(([, x0, z0, x1, z1, y0, y1]) => lx >= x0 && lx <= x1 && lz >= z0 && lz <= z1 && ly >= y0 && ly <= y1);
        if (!room) continue;
        indoors++;
        if ((levels.get(key) || 0) < 6) dark.add(`${room[0]}: ${lx},${ly},${lz}`);
    }
    assert.ok(indoors > 2000, `${indoors} cells indoors`);
    assert.deepEqual([...dark].sort().slice(0, 300), [], `${dark.size} dark cells (local)`);
});

// ---------------------------------------------------------------------------------------
// The moat

test('the moat is whole: water all round, a bed, banks, and only the bridge over it', () => {
    const { world, at } = buildTurned(0);
    const type = (x, y, z) => world.getBlockTypeAt(...at([x, y, z]));
    const isWater = (x, y, z) => type(x, y, z) === 'water';
    const [lo, hi] = [ctx.CASTLE_RIM + 2, SIZE - 1 - ctx.CASTLE_RIM - 2];
    let water = 0;
    for (let u = lo; u <= hi; u++) {
        for (const [x, z] of [[u, lo], [u, hi], [lo, u], [hi, u]]) {
        if (Math.abs(x - MID) === 3 && z < MID) continue;
            assert.ok(isWater(x, G - 1, z) || world.registry.solid[idOf(type(x, G - 1, z))], `${x},${z}: ${type(x, G - 1, z)}`);
            if (isWater(x, G - 1, z)) {
                water++;
                assert.ok(isWater(x, G - 3, z));
                assert.ok(world.registry.solid[world.getBlockId(...at([x, G - 4, z]))], 'a bed under it');
            }
        }
    }
    assert.ok(water > 300);
    // No water next to an empty cell or a hole at or below its surface, nor above it: it could not
    // spread even if water ever came to flow. Top is open, sides are stone, the bed is stone.
    const holes = [];
    for (let z = ctx.CASTLE_RIM; z < SIZE - ctx.CASTLE_RIM; z++) {
        for (let x = ctx.CASTLE_RIM; x < SIZE - ctx.CASTLE_RIM; x++) {
            for (let y = G - 3; y <= G - 1; y++) {
                if (!isWater(x, y, z)) continue;
                if (x === 37 && z === 40) continue;
                for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
                    const next = type(x + dx, y + dy, z + dz);
                    if (!next || (next !== 'water' && !world.registry.solid[idOf(next)])) holes.push(`${x + dx},${y + dy},${z + dz}: ${next}`);
                }
            }
        }
    }
    assert.deepEqual(holes.slice(0, 20), []);
});

// ---------------------------------------------------------------------------------------
// The site

function surfaceAt(world, x, z, from = 120) {
    for (let y = from; y >= -16; y--) {
        const type = world.getBlockTypeAt(x, y, z);
        if (type && type !== 'water') return y;
    }
    return null;
}

test('on rolling land it levels a plateau, grades the rim down to the terrain and keeps a road to the gate', () => {
    const roll = (x, z) => Math.round(8 + 4 * Math.sin(x / 19) + 3 * Math.cos(z / 23));
    const world = makeWorld(roll);
    const { game, messages } = makeGame(world, { at: { x: 0.5, y: roll(0, 0) + 2.62, z: 0.5 } });
    game.constructionCommand('build', ['castle']);
    run(game);
    assert.ok(!messages.some((text) => /Find/.test(text)), messages.join(' | '));
    // The level everywhere inside; the columns at the edge within 1 or 2 of the terrain.
    const anchor = { x: 0, z: 3 };
    const across = (x) => anchor.x + x - MID;
    const levels = [];
    for (let u = ctx.CASTLE_RIM; u < SIZE - ctx.CASTLE_RIM; u += 7) levels.push(surfaceAt(world, across(ctx.CASTLE_RIM), anchor.z + u));
    assert.equal(new Set(levels).size, 1, `the bank is level: ${levels}`);
    const level = levels[0];
    for (let z = 0; z < SIZE; z += 5) {
        const [ex, ez] = [across(0), anchor.z + z];
        assert.ok(Math.abs(surfaceAt(world, ex, ez) - roll(ex, ez)) <= 2, `edge at ${ex},${ez}`);
    }
    // No wall of earth: going in from the edge it changes by no more than the slope asks for.
    for (let z = 0; z < SIZE; z += 3) {
        for (let x = 0; x < ctx.CASTLE_RIM; x++) {
            const step = Math.abs(surfaceAt(world, across(x + 1), anchor.z + z) - surfaceAt(world, across(x), anchor.z + z));
            assert.ok(step <= 3, `a cliff of ${step} at local ${x},${z}`);
        }
    }
    // The road from where the player stands up to the bank: stairs, nothing higher than a step.
    openAll(world, ctx.constructionLayout(ctx.constructionPlan('castle'), 0, anchor, level - G, world.blockTypes));
    const box = (x, z) => z >= anchor.z - 2 && z <= anchor.z + 24 && Math.abs(x - anchor.x) <= 8;
    const queue = walkTight(world, [0, roll(0, 2) + 1, 2], box);
    const reached = new Set(queue.map(([x, z, feet]) => `${Math.floor(x)},${Math.floor(feet)},${Math.floor(z)}`));
    assert.ok(reached.has(`0,${level + 1},${anchor.z + 15}`), 'the bridge from the road');
    // Soil under the rim, no water left in the box, nothing floating.
    assert.equal(world.getBlockTypeAt(across(MID), level, anchor.z + ctx.CASTLE_RIM), 'cobblestone');
});

test('it refuses a mountain, a lake and a cliff before any block moves', () => {
    const cases = [
        ['a mountain', (x, z) => (z > 50 ? 110 : 3), /mountain|rises|flatter/],
        ['a high plateau across half the site', (x, z) => (z > 40 ? 40 : 3), /rises|flatter|earth/],
        ['a slope too long', (x, z) => Math.max(-14, Math.min(60, Math.round(z / 1.5))), /rises|flatter|earth/]
    ];
    for (const [name, ground, pattern] of cases) {
        const world = makeWorld(ground);
        const { game, messages, sent } = makeGame(world, { at: { x: 0.5, y: ground(0, 0) + 2.62, z: 0.5 } });
        game.constructionCommand('build', ['castle']);
        run(game);
        assert.equal(sent.length, 0, name);
        assert.ok(messages.some((text) => pattern.test(text)), `${name}: ${messages.join(' | ')}`);
        assert.equal(game.constructionUndo, undefined, name);
        assert.equal(world.keptChunks, null, name);
    }
    // A lake: water on most of the site.
    const world = makeWorld(() => -2);
    for (let cx = -10; cx < 10; cx++) {
        for (let cz = -10; cz < 10; cz++) {
            const column = world.columns.get(world.chunkKey(cx, cz));
            const water = world.registry.id('water');
            for (let lx = 0; lx < 16; lx++) {
                for (let lz = 0; lz < 16; lz++) {
                    for (let y = -1; y <= 3; y++) column.blocks[ctx.chunkIndex(lx, y, lz)] = water;
                }
            }
        }
    }
    const { game, messages, sent } = makeGame(world);
    game.constructionCommand('build', ['castle']);
    run(game);
    assert.equal(sent.length, 0);
    assert.ok(messages.some((text) => text.includes('mostly water')), messages.join(' | '));
});

test('a shore: the part in the water stands on fill down to the lake bed', () => {
    const lake = (x, z) => (x > 25 ? -1 : 3);
    const world = makeWorld(lake);
    const water = world.registry.id('water');
    for (let cx = -10; cx < 10; cx++) {
        for (let cz = -10; cz < 10; cz++) {
            const column = world.columns.get(world.chunkKey(cx, cz));
            for (let lx = 0; lx < 16; lx++) {
                for (let lz = 0; lz < 16; lz++) {
                    if (lake(cx * 16 + lx, cz * 16 + lz) === -1) {
                        for (let y = 0; y <= 2; y++) column.blocks[ctx.chunkIndex(lx, y, lz)] = water;
                    }
                }
            }
        }
    }
    const { game, messages, sent } = makeGame(world);
    game.constructionCommand('build', ['castle']);
    run(game);
    assert.ok(sent.length > 40000, messages.join(' | '));
    // Under the market, on the lake side, no water from the bed up: dirt holds it all.
    for (let y = 0; y <= 2; y++) assert.equal(world.getBlockTypeAt(30, y, 48), 'dirt', `${y}`);
});

// ---------------------------------------------------------------------------------------
// The large box

test('a box beyond the loaded area: it keeps and asks for its chunks, however long they take, and they stay', () => {
    const world = makeWorld(() => 3, 10);
    const stored = new Map();
    // Only what the player has around them, as a real client does.
    for (const [key, column] of world.columns) {
        const [cx, cz] = key.split(',').map(Number);
        if (Math.max(Math.abs(cx), Math.abs(cz)) > 6) {
            stored.set(key, column);
            world.columns.delete(key);
        }
    }
    const asked = [];
    const focus = [];
    world.setChunkSource({ connected: () => true, request: (chunks) => asked.push(...chunks), focus: (x, z, radius) => focus.push(radius) });
    world.lastPlayerChunkX = 0;
    world.lastPlayerChunkZ = 0;
    world.renderDistance = 4;
    const { game, messages, sent } = makeGame(world);
    game.constructionCommand('build', ['castle']);
    assert.ok(game.constructionWaiting);
    world.flushChunkRequests();
    const missing = stored.size;
    assert.ok(asked.length > 0 && asked.some(([, cz]) => cz > 6), `${asked.length} asked for, of ${missing}`);
    assert.ok(messages[0].includes('waiting'));
    assert.equal(world.isWithinRetention(0, 7), true, 'the far end of the box stays');
    assert.equal(world.isWithinRetention(0, 8), false);
    assert.equal(world.isWithinRetention(9, 0), false, 'beyond the box it does not');

    // The player has not moved: the server keeps the far requests; a focus says how far.
    world.update(0.5, 0.5);
    assert.ok(focus.at(-1) >= 7 && focus.at(-1) <= 16, `radius ${focus.at(-1)}`);
    // Crossing into another chunk does not unload what is kept.
    const near = world.columns.get(world.chunkKey(6, 6));
    world.update(16.5, 16.5);
    assert.equal(world.columns.get(world.chunkKey(6, 6)), near);

    // One chunk every 20 seconds is slow, but it is progress: it does not give up.
    const askedFor = asked.filter(([cx, cz]) => stored.has(world.chunkKey(cx, cz)));
    for (const [cx, cz] of askedFor) {
        const key = world.chunkKey(cx, cz);
        if (!stored.has(key)) continue;
        for (let t = 0; t < 20; t++) game.constructionUpdate(1);
        assert.ok(game.constructionWaiting, 'still waiting');
        world.columns.set(key, stored.get(key));
        world.generatingChunks.delete(key);
    }
    // Lost in a reconnection: it asks again by itself.
    const before = asked.length;
    for (const key of world.generatingChunks) world.generatingChunks.delete(key);
    const lost = world.chunkKey(0, 7);
    if (world.columns.has(lost)) world.columns.delete(lost);
    game.constructionUpdate(5);
    world.flushChunkRequests();
    assert.ok(asked.length > before, 'asks again');
    world.columns.set(lost, near);

    // Everything here: it reads the site over several frames, sending nothing yet.
    game.constructionUpdate(1 / 60);
    assert.ok(game.constructionScan, 'reads in slices');
    let frames = 0;
    while (game.constructionScan && frames < 100000) {
        assert.equal(sent.length, 0, 'nothing goes out before all is read');
        game.constructionUpdate(1 / 60);
        frames++;
    }
    assert.ok(frames > 5, `${frames} frames`);
    assert.ok(game.constructionJob);
    assert.equal(world.keptChunks, null, 'once read, the chunks are not needed');
    assert.ok(game.constructionJob.ops.length > 40000);

    // /build stop works at this size, and undo takes back what went out, through unloaded chunks.
    for (let i = 0; i < 300; i++) game.constructionUpdate(1 / 30);
    const done = game.constructionJob.done;
    assert.ok(done > 1000 && done < 8000, `${done}`);
    game.constructionCommand('build', ['stop']);
    assert.ok(!game.constructionJob);
    assert.equal(sent.length, done);
    assert.ok(messages.at(-1).includes(String(done)));
});

test('the rate holds at this size, and a backlog holds it back', () => {
    const world = makeWorld();
    const { game, sent } = makeGame(world);
    game.constructionCommand('build', ['castle']);
    while (game.constructionScan) game.constructionUpdate(1 / 60);
    const { rate } = ctx.CONSTRUCTION_DESIGNS.castle;
    let count = sent.length;
    for (let i = 0; i < 60; i++) game.constructionUpdate(1 / 60);
    assert.ok(Math.abs(sent.length - count - rate) <= 40, `${sent.length - count} in a second`);
    count = sent.length;
    game.constructionUpdate(10);
    assert.ok(sent.length - count <= 40, 'a slow frame does not send a burst');
    count = sent.length;
    game.network.ws.bufferedAmount = 1 << 20;
    game.constructionUpdate(1);
    assert.equal(sent.length, count);
    game.network.ws.bufferedAmount = 0;

    // What it touches is meshed in lumps: nothing from one frame to the next, everything every 2 seconds.
    world.activeChunks = new Set(world.columns.keys());
    world.immediateRebuildMs = 0;
    const job = game.constructionJob;
    job.meshed = 0;
    for (let i = 0; i < 60; i++) game.constructionUpdate(1 / 60);
    assert.equal(world.rebuildQueue.size, 0);
    assert.ok(job.held.size > 0);
    for (let i = 0; i < 70; i++) game.constructionUpdate(1 / 60);
    assert.ok(world.rebuildQueue.size > 0);
    assert.ok(job.held.size < world.rebuildQueue.size);
    assert.equal(world.heldRebuilds, null, 'only while the build places its own');
    // Stopping shows what it held.
    for (let i = 0; i < 30; i++) game.constructionUpdate(1 / 60);
    world.rebuildQueue.clear();
    game.constructionCommand('build', ['stop']);
    assert.ok(world.rebuildQueue.size > 0);
});

test('reconnecting mid-build sends the last blocks again and the build ends whole; undo is exact', () => {
    const ground = (x, z) => Math.round(4 + 2 * Math.sin(x / 15) + 2 * Math.cos(z / 15));
    const world = makeWorld(ground);
    const original = makeWorld(ground);
    // Things a player left in the way: a wall, a tree trunk, a sign, water.
    const litter = (w) => {
        w.setEditedBlock(20, 12, 40, 'planks');
        w.setEditedBlock(-30, 9, 80, 'wood');
        w.setEditedBlock(5, 8, 60, 'sign');
        w.setEditedBlock(-5, 8, 70, 'water');
    };
    litter(world);
    litter(original);
    world.signTextByKey.set(world.blockKey(5, 8, 60), 'hola');
    const server = makeWorld(ground);
    litter(server);
    const { game, sent, messages } = makeGame(world, { at: { x: 0.5, y: ground(0, 0) + 2.62, z: 0.5 } });
    game.constructionCommand('build', ['castle']);
    while (game.constructionScan) game.constructionUpdate(1 / 60);
    const total = game.constructionJob.ops.length;
    for (let i = 0; i < 2000; i++) game.constructionUpdate(1 / 30);
    assert.ok(game.constructionJob.done > ctx.CONSTRUCTION_RESEND);

    // The socket dies, holding the last 500 messages: the server never saw them. The world is
    // emptied on reconnecting, and that must not matter.
    const lostFrom = sent.length - 500;
    const delivered = sent.slice(0, lostFrom);
    game.network.connected = false;
    game.constructionUpdate(1);
    const held = game.constructionJob.done;
    for (const [key] of world.columns) world.columns.delete(key);
    game.network.ws = { bufferedAmount: 0 };
    game.network.connected = true;
    game.constructionUpdate(1 / 60);
    assert.ok(game.constructionJob.done <= held - ctx.CONSTRUCTION_RESEND + 40, 'it goes back');
    assert.equal(game.constructionUndo.applied.length, game.constructionJob.done);
    run(game);
    assert.ok(messages.some((text) => text.includes('finished')));
    const later = sent.slice(lostFrom + 500);
    const apply = (w, list) => {
        for (const { type, payload } of list) w.setEditedBlock(payload.x, payload.y, payload.z, type === 'blockPlace' ? payload.blockType : null);
    };
    apply(server, delivered);
    apply(server, later);
    // What reached the server is everything: same as a build that never stumbled.
    const clean = makeWorld(ground);
    litter(clean);
    const whole = makeGame(clean, { at: { x: 0.5, y: ground(0, 0) + 2.62, z: 0.5 } });
    whole.game.constructionCommand('build', ['castle']);
    run(whole.game);
    assert.equal(whole.sent.length, total);
    const compare = (a, b) => {
        const wrong = [];
        for (let x = -70; x <= 70; x += 1) {
            for (let z = -5; z <= 130; z += 1) {
                for (let y = -16; y < 90; y += 1) {
                    const [ta, tb] = [a.getBlockTypeAt(x, y, z), b.getBlockTypeAt(x, y, z)];
                    if (ta !== tb) wrong.push(`${x},${y},${z}: ${ta} / ${tb}`);
                }
            }
        }
        return wrong;
    };
    assert.deepEqual(compare(server, clean).slice(0, 10), []);

    // Undo, on the world that goes through the same messages: the server's copy ends as it began.
    sent.length = 0;
    game.constructionCommand('build', ['undo']);
    assert.equal(game.constructionJob.ops.length, total);
    run(game);
    apply(server, sent);
    assert.deepEqual(compare(server, original).slice(0, 10), []);
    assert.ok(sent.some(({ type, payload }) => type === 'blockPlace' && payload.blockType === 'sign' && payload.text === 'hola'));
});

test('stopping the undo half way leaves the rest undoable, and /build stop cancels the reading', () => {
    const world = makeWorld();
    const { game, messages, sent } = makeGame(world);
    game.constructionCommand('build', ['castle']);
    assert.ok(game.constructionScan);
    game.constructionCommand('build', ['castle']);
    assert.ok(messages.at(-1).includes('Still building'));
    game.constructionCommand('build', ['stop']);
    assert.ok(!game.constructionScan && !game.constructionJob && world.keptChunks === null);
    assert.equal(sent.length, 0);

    game.constructionCommand('build', ['castle']);
    while (game.constructionScan) game.constructionUpdate(1 / 60);
    for (let i = 0; i < 600; i++) game.constructionUpdate(1 / 30);
    game.constructionCommand('build', ['stop']);
    const done = sent.length;
    game.constructionCommand('build', ['undo']);
    assert.equal(game.constructionJob.ops.length, done);
    for (let i = 0; i < 100; i++) game.constructionUpdate(1 / 30);
    game.constructionCommand('build', ['stop']);
    game.constructionCommand('build', ['undo']);
    assert.ok(game.constructionJob.ops.length < done);
    run(game);
    assert.ok(messages.at(-1).includes('undone'));
    assert.equal(world.getBlockTypeAt(0, 3, 13), 'stone');
    assert.equal(world.getBlockTypeAt(0, 4, 13), null);
});
