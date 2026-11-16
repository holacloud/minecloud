// Node tests for /build palace_baroque (js/game/construction_palace_baroque.js): the plan (its size, its blocks, a
// box it never leaves, its symmetry), the rooms a visitor must find (a throne, state beds, kitchens, a hall of
// mirrors, the optics cabinet and its instruments), the stock of every chest and barrel, the signs, that every floor
// can be walked to from the place d'armes without a jump, and that the inside is lit at night.
// Run with: node --test test/js/construction_palace_baroque.test.js

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
        localStorage: { getItem: () => null, setItem() {} },
        requestAnimationFrame: () => 0
    });
    context.window = context;
    for (const file of ['extensions.js', 'gameLang.js', 'chunkStore.js', 'blockShapes.js', 'chunkMesher.js', 'camera.js', 'mobSpecies.js', 'blockTextures.js', 'world.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, file), 'utf8'), context, { filename: file });
    }
    vm.runInContext('class Game {}; function resourcesDrawSprite() { return () => {}; } function resourcesDisplayMesh() { return null; }', context);
    const game = ['block_edits.js', 'joinery.js', 'chemistry.js', 'electricity.js', 'blueprints.js', 'constructions.js', 'furniture.js', 'seating.js', 'storage.js', 'decor.js', 'mirrors.js',
        'smelters.js', 'microbes.js', 'microscope_text.js', 'microscope.js', 'palace_decor.js', 'tabletop.js', 'construction_castle.js', 'construction_palace_common.js', 'construction_palace_baroque.js'];
    for (const file of game) vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, CameraController, CONSTRUCTION_DESIGNS, constructionPlan, chunkIndex, STORAGE_KINDS,
        PALACE_BAROQUE_SIZE, PALACE_BAROQUE_GROUND, PALACE_BAROQUE_MID, CONSTRUCTION_STOCK_MAX, CONSTRUCTION_STOCK_TOTAL });`, context);
    return context;
}

const ctx = loadGame();
const G = ctx.PALACE_BAROQUE_GROUND;
const F = G + 1;
const MID = ctx.PALACE_BAROQUE_MID;
const plan = ctx.constructionPlan('palace_baroque');
const grid = new Map(plan.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
const DIRECTIONS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

// A world of stone up to the palace's ground layer, the chunks under the box loaded; then the plan in it as a
// visitor finds it, every door and gate open.
function makeWorld() {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    world.getChunkMaterial = (type) => `material:${type}`;
    const stone = world.registry.id('stone');
    for (let cx = -1; cx <= 9; cx++) {
        for (let cz = -1; cz <= 9; cz++) {
            const column = new ctx.ChunkColumn(cx, cz);
            for (let lx = 0; lx < 16; lx++) {
                for (let lz = 0; lz < 16; lz++) {
                    for (let y = -4; y <= G; y++) column.blocks[ctx.chunkIndex(lx, y, lz)] = stone;
                }
            }
            world.columns.set(world.chunkKey(cx, cz), column);
        }
    }
    return world;
}
const blocks = makeWorld();
const defOf = (type) => blocks.blockTypes[type];
const baseOf = (type) => (defOf(type) && defOf(type).variantOf) || type;
const stateOf = (type) => (defOf(type) && defOf(type).state) || {};

let builtWorld = null;
function builtOpen() {
    if (builtWorld) return builtWorld;
    const world = makeWorld();
    for (const cell of plan.cells) {
        const def = world.blockTypes[cell.type];
        let type = cell.type === 'air' ? null : cell.type;
        if (def && def.state && def.state.open && def.shape !== 'trapdoor') type = world.getShapeStateType(def.variantOf || cell.type, { ...def.state, open: 'open' });
        world.setEditedBlock(cell.x, cell.y, cell.z, type);
    }
    builtWorld = world;
    return world;
}

// Everywhere a player can walk without a jump, with the camera's own collision and step: points a quarter of a
// block apart (as the castle's test), water stops it.
let walked = null;
function walk() {
    if (walked) return walked;
    const world = builtOpen();
    const camera = { position: new Vector3(0, 0, 0), rotation: {} };
    const player = new ctx.CameraController(camera, { addEventListener() {} });
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
    const start = [MID + 0.5, 13.5, F];
    assert.ok(player.canStandAt(start[0], start[1], start[2]), 'the start is free');
    const queue = [start];
    seen.add(key(...start));
    for (let head = 0; head < queue.length; head++) {
        const [x, z, feet] = queue[head];
        for (const [dx, dz] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
            const nx = x + dx;
            const nz = z + dz;
            if (nx < 0.3 || nz < 12 || nx > 140.7 || nz > 128.7) continue;
            const reach = feet + player.stepHeight;
            const floor = player.getSupportFloorY(nx, nz, reach, reach);
            if (floor > reach + 0.001 || floor < -2) continue;
            const stand = Math.max(floor, feet);
            if (!player.canStandAt(nx, nz, stand) || (stand > feet && !player.canStandAt(x, z, stand))) continue;
            if (world.getBlockId(Math.floor(nx), Math.floor(floor), Math.floor(nz)) === water) continue;
            const k = key(nx, nz, floor);
            if (seen.has(k)) continue;
            seen.add(k);
            queue.push([nx, nz, floor]);
        }
    }
    walked = { queue, cells: new Set(queue.map(([x, z, feet]) => `${Math.floor(x)},${Math.floor(feet)},${Math.floor(z)}`)) };
    return walked;
}

// [x, feet, z] of everywhere a visitor must get to.
const N = 13;
const A = 21;
const LEVELS = {
    'the place d\'armes': [MID, F, 14],
    'the forecourt': [MID, F, 25],
    'the marble court': [60, F, 40],
    'the vestibule': [MID, F, 52],
    'the garden salon': [MID, F, 68],
    'the west stair hall': [56, F, 58],
    'the baths': [24, F, 57],
    'the privy off the baths': [20, F, 52],
    'the bathroom off the baths': [20, F, 57],
    'the queen\'s closet': [30, N + 1, 60],
    'the queen\'s washroom': [35, N + 1, 60],
    'the king\'s closet': [110, N + 1, 60],
    'the king\'s washroom': [105, N + 1, 60],
    'the guard hall': [116, F, 58],
    'the banquet hall': [40, F, 70],
    'the library': [100, F, 65],
    'the kitchens': [35, 2, 58],
    'the cellar': [105, 2, 58],
    'the chapel nave': [28, F, 35],
    'before the altar': [28, F, 29],
    'the chapel tribune': [28, N + 1, 47],
    'the opera pit': [112, F, 38],
    'the stage': [112, F + 1, 27],
    'the royal box': [112, N + 1, 45],
    'the landing of the grand staircase': [52, N + 1, 60],
    'the east landing': [88, N + 1, 60],
    'the throne room': [MID, N + 1, 55],
    'on the dais': [68, N + 2, 46],
    'the Hall of Mirrors': [MID, N + 1, 67],
    'the gallery\'s west end': [44, N + 1, 67],
    'the treasury': [34, N + 1, 67],
    'the optics cabinet': [106, N + 1, 67],
    'the queen\'s bedchamber': [30, N + 1, 56],
    'the queen\'s antechamber': [42, N + 1, 58],
    'the king\'s bedchamber': [110, N + 1, 56],
    'the king\'s antechamber': [98, N + 1, 58],
    'the attic corridor': [MID, A + 1, 62],
    'a servant\'s room in front': [30, A + 1, 56],
    'a servant\'s room behind': [46, A + 1, 67],
    'a servant\'s room in the east': [110, A + 1, 56],
    'the servants\' hall': [MID, A + 1, 50],
    'the linen room': [MID, A + 1, 69],
    'the garden terrace': [MID, F, 75],
    'the allée': [MID, F, 88],
    'beside the Latona fountain': [64, F, 96],
    'by the canal': [62, F, 110],
    'the orangery': [26, F, 116],
    'the stables': [114, F, 116],
    'a parterre path': [46, F, 92]
};

// ---------------------------------------------------------------------------------------
// The plan

test('the palace: about 141 x 141 on the plains, every block exists, nothing outside the box', () => {
    const design = ctx.CONSTRUCTION_DESIGNS.palace_baroque;
    const [w, h, d] = plan.size;
    assert.ok(w >= 121 && d >= 121 && h >= 40, `${w} x ${h} x ${d}`);
    assert.equal(design.anchorX, MID);
    assert.equal(w, 2 * MID + 1, 'the axis is the middle of the box');
    assert.ok(plan.cells.length > 40000, `${plan.cells.length} cells`);
    for (const type of new Set(plan.cells.map((cell) => cell.type))) {
        assert.ok(defOf(type), `${type} is not a block`);
        assert.ok(blocks.registry.ids[type] !== undefined, `${type} is not a world block`);
        assert.ok(!defOf(type).itemOnly, `${type} is an item`);
    }
    for (const cell of plan.cells) {
        assert.ok(cell.x >= 0 && cell.x < w && cell.y >= 0 && cell.y < h && cell.z >= 0 && cell.z < d, `${cell.type} at ${cell.x},${cell.y},${cell.z}`);
    }
    // The rim is the site's: nothing drawn there.
    for (const cell of plan.cells) assert.ok(Math.min(cell.x, cell.z, w - 1 - cell.x, d - 1 - cell.z) >= 12, `${cell.type} on the rim at ${cell.x},${cell.z}`);
    // Ovens are placed unlit, as a build cannot light them.
    for (const cell of plan.cells) if (baseOf(cell.type) === 'oven') assert.equal(stateOf(cell.type).fire, 'off');
});

test('it is a baroque palace: symmetric about its axis, slate mansards with dormers, a dome, gold, a balustrade with busts', () => {
    // The roofs and walls are the same on both sides of the axis.
    const shell = new Set(['limestone', 'marble', 'slate', 'stone_bricks', 'gold_block', 'white_stucco']);
    let checked = 0;
    for (const cell of plan.cells) {
        if (cell.y < 22 || !shell.has(cell.type)) continue;
        const other = grid.get(`${2 * MID - cell.x},${cell.y},${cell.z}`);
        assert.ok(other && shell.has(other), `${cell.type} at ${cell.x},${cell.y},${cell.z} has ${other} opposite`);
        checked++;
    }
    assert.ok(checked > 8000, `${checked}`);
    const types = new Set(plan.cells.map((cell) => baseOf(cell.type)));
    for (const type of ['slate', 'marble', 'limestone', 'gold_block', 'white_glazed_tile_slab', 'statue', 'iron_bars', 'iron_door', 'glass_pane', 'wall_clock', 'fountain', 'water', 'leaves', 'flower_red', 'flower_yellow', 'chandelier']) {
        assert.ok(types.has(type), type);
    }
    // The dome and its lantern stand over everything.
    const top = Math.max(...plan.cells.map((cell) => cell.y));
    assert.ok(top >= 40, `top ${top}`);
    assert.equal(grid.get(`${MID},${top},54`), 'gold_block');
    // Dormers: a window in the slope of the mansard, on the garden side.
    const dormers = plan.cells.filter((cell) => cell.type === 'glass_pane' && cell.y > 26 && cell.z === 70);
    assert.ok(dormers.length >= 20, `${dormers.length}`);
    // The gilded gates on the axis are iron doors.
    for (const x of [68, 69, 71, 72]) assert.equal(baseOf(grid.get(`${x},${F},18`)), 'iron_door', `gate at ${x}`);
});

test('the rooms: a throne under a canopy, state beds, kitchens, the Hall of Mirrors, chapel, opera, library, stables', () => {
    const count = (test) => plan.cells.filter(test).length;
    const at = (x, y, z) => baseOf(grid.get(`${x},${y},${z}`));
    assert.equal(at(MID, N + 2, 46), 'gilded_throne', 'the throne on its dais');
    assert.equal(stateOf(grid.get(`${MID},${N + 2},46`)).facing, 's');
    assert.equal(at(MID, N + 6, 46), 'red_wool', 'its canopy');
    assert.ok(count((cell) => baseOf(cell.type) === 'bed') >= 70, 'beds');
    assert.ok(count((cell) => baseOf(cell.type) === 'oven') >= 8, 'ovens');
    // The Hall of Mirrors: one framed mirror in the middle of every arcade, few enough for the game to reflect
    // them well (js/game/mirrors.js), and none of the gallery's arcades without one.
    const gallery = plan.cells.filter((cell) => baseOf(cell.type) === 'wall_mirror' && cell.z === 63 && cell.x >= 43 && cell.x <= 97 && cell.y > N);
    assert.ok(gallery.length >= 24 && gallery.length <= 60, `${gallery.length} mirrors in the gallery`);
    for (let x = 44; x <= 96; x += 4) {
        if (x === 52 || x === 88) continue;
        assert.ok(gallery.some((cell) => cell.x === x), `the arcade at x = ${x} has its mirror`);
    }
    assert.ok(count((cell) => baseOf(cell.type) === 'wall_mirror') <= 70, 'mirrors in the whole palace');
    assert.ok(count((cell) => baseOf(cell.type) === 'chandelier') >= 60, 'chandeliers');
    assert.ok(count((cell) => baseOf(cell.type) === 'bookshelf') >= 100, 'the library');
    assert.ok(count((cell) => baseOf(cell.type) === 'bench') >= 60, 'benches of the chapel and the opera');
    assert.ok(count((cell) => baseOf(cell.type) === 'wardrobe') >= 20, 'wardrobes');
    assert.ok(count((cell) => baseOf(cell.type) === 'bathtub') >= 4, 'the baths');
    assert.ok(count((cell) => baseOf(cell.type) === 'spruce_fence_gate') >= 4, 'stalls');
    assert.ok(count((cell) => baseOf(cell.type) === 'white_glazed_tile_stairs' && cell.x >= 50 && cell.x <= 54) >= 30, 'the grand staircase');
    // The optics cabinet: silver mirrors, two facing wall mirrors, a prism, the seven colours, a globe and an astrolabe.
    const optics = plan.cells.filter((cell) => cell.x >= 99 && cell.x <= 113 && cell.z >= 63 && cell.z <= 72 && cell.y >= N && cell.y <= A);
    const kinds = new Set(optics.map((cell) => baseOf(cell.type)));
    for (const type of ['mirror', 'wall_mirror', 'glass', 'globe', 'astrolabe', 'candle', 'chest', 'sign', ...['red', 'orange', 'yellow', 'lime', 'light_blue', 'blue', 'purple'].map((c) => `${c}_carpet`)]) {
        assert.ok(kinds.has(type), `optics: ${type}`);
    }
    for (const c of ['red', 'orange', 'yellow', 'lime', 'light_blue', 'blue', 'purple']) assert.ok(kinds.has(`${c}_stained_glass_pane`), `the rainbow window: ${c}`);
    const telescope = plan.stocks.find((stock) => stock.items.some(([type]) => type === 'telescope'));
    assert.ok(telescope && telescope.x >= 99 && telescope.x <= 113 && telescope.y === N + 1, 'the telescope in a chest of the cabinet');
});

test('every chest and barrel holds something the server takes, a few kinds each, within its limits', () => {
    const go = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'construction_stock.go'), 'utf8');
    const items = new Set([...go.slice(go.indexOf('range []string{'), go.indexOf('} {', go.indexOf('range []string{'))).matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));
    const stocked = new Set(plan.stocks.map((stock) => `${stock.x},${stock.y},${stock.z}`));
    let storage = 0;
    for (const cell of plan.cells) {
        const def = defOf(cell.type);
        if (!['chest', 'barrel'].includes(baseOf(cell.type))) continue;
        storage++;
        assert.ok(stocked.has(`${cell.x},${cell.y},${cell.z}`), `an empty ${cell.type} at ${cell.x},${cell.y},${cell.z}`);
    }
    assert.ok(storage >= 50, `${storage} chests and barrels`);
    assert.equal(storage, plan.stocks.length);
    for (const stock of plan.stocks) {
        const where = `${stock.x},${stock.y},${stock.z}`;
        assert.ok(stock.items.length >= 2, `${where}: one kind only`);
        let total = 0;
        for (const [type, count] of stock.items) {
            assert.ok(items.has(type), `${where}: ${type} is not in stockItems`);
            assert.ok(count >= 1 && count <= ctx.CONSTRUCTION_STOCK_MAX, `${where}: ${count} ${type}`);
            total += count;
        }
        assert.ok(total <= ctx.CONSTRUCTION_STOCK_TOTAL, where);
        const kind = baseOf(grid.get(where));
        assert.ok(stock.items.length <= ctx.STORAGE_KINDS[kind], `${where}: ${stock.items.length} stacks in a ${kind}`);
    }
    // The treasury has gold and gems, but not a hoard.
    const treasure = plan.stocks.filter((stock) => stock.x >= 27 && stock.x <= 41 && stock.z >= 63 && stock.y === N + 1);
    const gold = treasure.flatMap((stock) => stock.items).filter(([type]) => type === 'gold_block').reduce((sum, [, count]) => sum + count, 0);
    assert.ok(treasure.length >= 3 && gold > 0 && gold <= 8, `${treasure.length} chests, ${gold} gold blocks`);
});

test('the signs: Spanish, then English, within 288 bytes, free in front; the entrance names the palace and the cabinet explains its science', () => {
    const signs = plan.cells.filter((cell) => baseOf(cell.type) === 'sign');
    assert.ok(signs.length >= 25, `${signs.length}`);
    for (const cell of signs) {
        const [es, en, more] = cell.meta.t.split(' // ');
        assert.ok(es && en && more === undefined, cell.meta.t);
        assert.ok(Buffer.byteLength(cell.meta.t) <= 288, `${Buffer.byteLength(cell.meta.t)}: ${cell.meta.t}`);
        const [dx, dz] = DIRECTIONS[stateOf(cell.type).facing];
        for (const [x, y, z] of [[cell.x, cell.y + 1, cell.z], [cell.x + dx, cell.y, cell.z + dz], [cell.x + dx, cell.y + 1, cell.z + dz]]) {
            const type = grid.get(`${x},${y},${z}`);
            assert.ok(!type || type === 'air' || !blocks.registry.fullCube[blocks.registry.id(type)], `${cell.meta.t}: ${type} in the way`);
        }
    }
    const texts = signs.map((cell) => cell.meta.t);
    assert.ok(texts.includes('Palacio barroco // Baroque palace'));
    const optics = signs.filter((cell) => cell.x >= 99 && cell.x <= 113 && cell.z >= 63 && cell.z <= 71).map((cell) => cell.meta.t);
    assert.ok(optics.some((t) => t.toLowerCase().includes('ángulo de entrada = ángulo de salida') && t.toLowerCase().includes('angle in = angle out')), 'reflection');
    assert.ok(optics.some((t) => /velas/.test(t) && /candlelight/.test(t)), 'mirrors and candles');
    assert.ok(optics.some((t) => /prisma/.test(t) && /prism/.test(t) && /colou?rs/.test(t)), 'the prism');
});

test('the rooms are lived in: things left on tables and desks, small washrooms, curtains some drawn and some open', () => {
    const TABLETOP = ['open_book', 'book_stack', 'inkwell', 'scroll', 'meal_plate', 'fruit_bowl', 'tea_set', 'jug', 'chessboard', 'sewing_basket'];
    const things = plan.cells.filter((cell) => TABLETOP.includes(baseOf(cell.type)));
    assert.ok(things.length >= 40, `${things.length} things on tables`);
    assert.ok(new Set(things.map((cell) => baseOf(cell.type))).size >= 9, 'of most kinds');
    // A letter half written on the queen's desk, a game of chess in the salon, a meal in the kitchens.
    assert.equal(baseOf(grid.get(`37,${N + 2},52`)), 'inkwell');
    assert.equal(baseOf(grid.get(`${MID},${F + 1},69`)), 'chessboard');
    assert.ok(things.some((cell) => baseOf(cell.type) === 'meal_plate' && cell.y === 3 && cell.x <= 45), 'a meal in the kitchens');
    // Every one stands on something: a table, a desk, a bedside table, or the floor by a chair.
    for (const cell of things) {
        const below = baseOf(grid.get(`${cell.x},${cell.y - 1},${cell.z}`) || 'air');
        assert.ok(['table', 'desk', 'bedside_table'].includes(below) || /planks$|carpet$/.test(below), `${cell.type} at ${cell.x},${cell.y},${cell.z} on ${below}`);
    }
    // The small rooms are small: the privy, the bathroom and each apartment's washroom, with what a washroom has.
    const inside = (x0, z0, x1, z1, y) => plan.cells.filter((cell) => cell.x >= x0 && cell.x <= x1 && cell.z >= z0 && cell.z <= z1 && cell.y === y).map((cell) => baseOf(cell.type));
    assert.ok(inside(19, 51, 21, 53, F).includes('toilet') && inside(19, 51, 21, 53, F).includes('sink'), 'the privy');
    assert.ok(inside(19, 55, 21, 58, F).includes('bathtub'), 'the bathroom');
    for (const [x0, x1] of [[33, 37], [103, 107]]) {
        const room = inside(x0, 59, x1, 61, N + 1);
        for (const type of ['toilet', 'sink', 'bathtub']) assert.ok(room.includes(type), `the washroom at x ${x0}..${x1}: ${type}`);
    }
    // Curtains: the windows of the bedchambers, antechambers, salon, banquet hall and library have them, some
    // drawn and most open.
    const curtains = plan.cells.filter((cell) => defOf(cell.type) && defOf(cell.type).shape === 'curtain');
    const closed = curtains.filter((cell) => stateOf(cell.type).drawn === 'closed').length;
    assert.ok(curtains.length >= 120, `${curtains.length} curtains`);
    assert.ok(closed >= curtains.length * 0.15 && closed <= curtains.length * 0.6, `${closed} of ${curtains.length} drawn`);
});

test('every bed is whole', () => {
    const beds = plan.cells.filter((cell) => baseOf(cell.type) === 'bed' && stateOf(cell.type).part === 'head');
    for (const bed of beds) {
        const [dx, dz] = DIRECTIONS[stateOf(bed.type).facing];
        assert.equal(grid.get(`${bed.x - dx},${bed.y},${bed.z - dz}`), bed.type.replace('head', 'foot'), `the foot of the bed at ${bed.x},${bed.y},${bed.z}`);
    }
    assert.equal(plan.cells.filter((cell) => baseOf(cell.type) === 'bed').length, 2 * beds.length);
});

// ---------------------------------------------------------------------------------------
// Walking and light

test('from the place d\'armes one walks to every room of every floor, the cellars, the attic and the garden', () => {
    const { cells } = walk();
    const missed = Object.entries(LEVELS).filter(([, at]) => !cells.has(at.join(','))).map(([name, at]) => `${name} (${at})`);
    assert.deepEqual(missed, []);
});

test('the inside is lit at night', () => {
    const world = builtOpen();
    const { queue } = walk();
    const levels = new Map();
    const todo = [];
    const put = (x, y, z, level) => {
        levels.set(`${x},${y},${z}`, level);
        todo.push([x, y, z, level]);
    };
    for (const cell of plan.cells) {
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
    // The buildings, as [x0, z0, x1, z1]: the corps, the wings, the orangery and the stables.
    const inside = [[19, 51, 121, 71], [59, 45, 81, 50], [19, 23, 37, 49], [103, 23, 121, 49], [15, 109, 31, 123], [109, 109, 125, 123]];
    const dark = new Set();
    const checked = new Set();
    for (const [fx, fz, feet] of queue) {
        const x = Math.floor(fx), y = Math.floor(feet), z = Math.floor(fz);
        const key = `${x},${y},${z}`;
        if (checked.has(key)) continue;
        checked.add(key);
        if (!inside.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)) continue;
        if ((levels.get(key) || 0) < 6) dark.add(key);
    }
    assert.ok(checked.size > 15000, `${checked.size} cells walked`);
    assert.deepEqual([...dark].sort().slice(0, 100), [], `${dark.size} dark cells`);
});
