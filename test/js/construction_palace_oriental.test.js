// Node tests for /build palace_oriental (js/game/construction_palace_oriental.js): the plan (its size, its blocks,
// the halls and rooms it must have), what its chests and barrels hold against what the server takes, the signs,
// the pieces of two cells, that every hall, room, terrace and floor of the pagoda can be walked to from the road
// without a jump, light at night in the rooms, and the whole build on flat ground.
// Run with: node --test test/js/construction_palace_oriental.test.js

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
        'smelters.js', 'microbes.js', 'microscope_text.js', 'microscope.js', 'palace_decor.js', 'tabletop.js', 'construction_castle.js', 'construction_palace_common.js', 'construction_palace_oriental.js'];
    for (const file of game) vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, CameraController, BLOCK_SHAPES, Game, CONSTRUCTION_DESIGNS, constructionPlan, chunkIndex,
        CONSTRUCTION_STOCK_MAX, CONSTRUCTION_STOCK_TOTAL, PALACE_ORIENTAL_SIZE, PALACE_ORIENTAL_GROUND, PALACE_ORIENTAL_MID });`, context);
    return context;
}

const ctx = loadGame();
const G = ctx.PALACE_ORIENTAL_GROUND;
const F = G + 1;
const MID = ctx.PALACE_ORIENTAL_MID;
const DIRECTIONS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

// A flat world of stone, its top at layer `top`, with loaded chunks from -radius to radius chunks.
function makeWorld(top = G, radius = 10, from = -radius) {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    world.getChunkMaterial = (type) => `material:${type}`;
    const stone = world.registry.id('stone');
    for (let cx = from; cx < radius; cx++) {
        for (let cz = from; cz < radius; cz++) {
            const column = new ctx.ChunkColumn(cx, cz);
            for (let lx = 0; lx < 16; lx++) {
                for (let lz = 0; lz < 16; lz++) {
                    for (let y = -8; y <= top; y++) column.blocks[ctx.chunkIndex(lx, y, lz)] = stone;
                }
            }
            world.columns.set(world.chunkKey(cx, cz), column);
        }
    }
    return world;
}

const blocks = makeWorld(3, 1);
const defOf = (type) => blocks.blockTypes[type];
const baseOf = (type) => (defOf(type) && defOf(type).variantOf) || type;
const stateOf = (type) => defOf(type).state || {};
const idOf = (type) => blocks.registry.id(type || 'air');

const plan = ctx.constructionPlan('palace_oriental');
const grid = new Map(plan.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
const typeAt = (x, y, z) => grid.get(`${x},${y},${z}`);
const solidAt = (x, y, z) => {
    const type = typeAt(x, y, z);
    return Boolean(type) && blocks.registry.solid[idOf(type)] === 1;
};

// Local [x, feet, z] of everywhere a visitor must get to.
const LEVELS = {
    'the plaza': [MID, F, 15],
    'the way through the gate': [MID, F, 24],
    'the west guard room': [58, F, 25],
    'the east guard room': [78, F, 25],
    'the top of the gate tower': [49, G + 9, 30],
    'the watch hall': [62, G + 9, 26],
    'the outer court': [MID, F, 31],
    'over the middle bridge': [MID, G + 2, 36],
    'over a side bridge': [60, G + 2, 36],
    'the Gate of Harmony': [60, G + 3, 46],
    'the great court': [60, F, 55],
    'the Hall of Supreme Harmony': [60, G + 7, 69],
    'before the throne': [MID, G + 8, 77],
    'beside the throne': [67, G + 9, 79],
    'behind the hall': [60, F, 89],
    'the hall of audience': [62, G + 3, 97],
    'the bedchamber': [66, G + 3, 102],
    'the study': [59, G + 3, 102],
    'the emperor\'s bath': [78, G + 3, 102],
    'the kitchen': [35, F, 28],
    'the banquet hall': [33, F, 45],
    'the well': [41, F, 27],
    'the granary': [35, F, 63],
    'the treasury': [32, F, 67],
    'the ancestral shrine': [32, F, 76],
    'the consorts\' sitting room': [30, F, 90],
    'a consort\'s bedroom': [30, F, 98],
    'the other consort\'s bedroom': [37, F, 98],
    'the servants\' quarters': [100, F, 30],
    'the stables': [100, F, 48],
    'a stall': [107, F, 48],
    'the library': [100, F, 66],
    'upstairs in the library': [100, G + 7, 72],
    'the music room': [99, F, 90],
    'the prince\'s bedroom': [105, F, 99],
    'the prince\'s dressing room': [100, F, 95],
    'the bath house': [100, F, 99],
    'the imperial garden': [MID, F, 116],
    'the zigzag bridge': [47, F, 119],
    'the koi pavilion': [46, F, 125],
    'on the glass floor': [45, F, 124],
    'the top of the arched bridge': [57, G + 3, 125],
    'the tea pavilion': [74, G + 2, 128],
    'the greenhouse': [104, F, 135]
};
for (let k = 0; k < 5; k++) LEVELS[`the pagoda, floor ${k + 1}`] = [100, G + 2 + 5 * k, 125];

// The rooms, for the light: local x0, z0, x1, z1 and the feet from and to.
const ROOMS = [
    ['the west guard room', 53, 23, 59, 27, F, F],
    ['the east guard room', 77, 23, 83, 27, F, F],
    ['the watch hall', 55, 22, 81, 26, G + 9, G + 9],
    ['the Gate of Harmony', 57, 45, 79, 47, G + 3, G + 3],
    ['the Hall of Supreme Harmony', 57, 68, 79, 80, G + 7, G + 9],
    ['the Palace of Heavenly Purity', 56, 95, 80, 105, G + 3, G + 4],
    ['the kitchen', 27, 26, 39, 36, F, F],
    ['the banquet hall', 27, 43, 39, 53, F, F],
    ['the granary and the treasury', 27, 61, 37, 69, F, F],
    ['the shrine', 28, 76, 36, 78, F, F],
    ['the west residence', 27, 87, 39, 101, F, F],
    ['the servants\' quarters', 97, 26, 109, 36, F, F],
    ['the stables', 97, 43, 109, 53, F, F],
    ['the library', 97, 62, 109, 76, F, G + 7],
    ['the east residence', 97, 87, 109, 101, F, F],
    ['the koi pavilion', 42, 123, 50, 127, F, F],
    ['the pagoda', 97, 123, 103, 129, G + 2, G + 22]
];

// ---------------------------------------------------------------------------------------
// The plan

test('the palace generates in its box, every block exists, and it is at least as big as the castle', () => {
    const [w, h, d] = plan.size;
    assert.ok(w >= 121 && d >= 121, `${w} x ${d}`);
    for (const cell of plan.cells) {
        assert.ok(cell.x >= 0 && cell.x < w && cell.y >= 0 && cell.y < h && cell.z >= 0 && cell.z < d, `${cell.type} at ${cell.x},${cell.y},${cell.z}`);
    }
    for (const type of new Set(plan.cells.map((cell) => cell.type))) {
        assert.ok(defOf(type) && !defOf(type).itemOnly && blocks.registry.ids[type] !== undefined, `${type} is not a block`);
    }
    assert.ok(plan.cells.length > 40000 && plan.cells.length < 160000, `${plan.cells.length} cells`);
    // The same plan every time: no randomness.
    assert.equal(ctx.constructionPlan('palace_oriental').cells.length, plan.cells.length);
    // The ovens are off, as a build cannot light them.
    for (const cell of plan.cells) {
        if (baseOf(cell.type) === 'oven') assert.equal(stateOf(cell.type).fire, 'off');
    }
});

test('the palace is recognisable: glazed roofs that rise to the throne hall, terraces, a pagoda over everything in the garden', () => {
    const types = new Set(plan.cells.map((cell) => baseOf(cell.type)));
    for (const type of ['yellow_glazed_tile_stairs', 'yellow_glazed_tile_slab', 'green_glazed_tile_stairs', 'red_glazed_tile', 'red_stucco', 'lattice_screen', 'paper_screen',
        'marble', 'limestone', 'birch_fence', 'gold_block', 'lacquer_throne', 'jade_throne', 'water', 'glass', 'chandelier', 'lantern', 'candle', 'bed', 'wardrobe', 'oven', 'barrel',
        'chest', 'bookshelf', 'desk', 'bathtub', 'red_banner', 'yellow_banner', 'statue', 'cherry_wood', 'cherry_leaves', 'globe', 'astrolabe', 'cherry_door']) {
        assert.ok(types.has(type), type);
    }
    const top = (x, z) => {
        for (let y = plan.size[1] - 1; y >= 0; y--) if (typeAt(x, y, z)) return y;
        return -1;
    };
    // Each hall of the axis stands higher than the one before it, the throne hall highest; the pagoda higher still.
    const gate = top(MID, 24);
    const harmony = top(MID, 46);
    const supreme = top(MID, 74);
    const purity = top(MID, 100);
    assert.ok(harmony < supreme && purity < supreme && gate < supreme, `${gate} ${harmony} ${supreme} ${purity}`);
    assert.ok(top(100, 126) > supreme, `pagoda ${top(100, 126)}`);
    // The throne faces the doors, on its dais, before a gold screen.
    const throne = typeAt(MID, G + 9, 79);
    assert.equal(baseOf(throne), 'lacquer_throne');
    assert.equal(stateOf(throne).facing, 'n');
    assert.equal(typeAt(MID, G + 9, 80), 'gold_block');
    // The roofs curl up at the corners: a stair turned outwards under a slab.
    assert.equal(baseOf(typeAt(53, G + 18, 64)), 'yellow_glazed_tile_slab');
    // Three terraces under the hall.
    assert.equal(typeAt(50, G + 2, 74), 'marble');
    assert.equal(typeAt(52, G + 4, 74), 'marble');
    assert.equal(typeAt(54, G + 6, 74), 'marble');
});

test('the rooms are furnished: beds and wardrobes, ovens, books, a treasury, a bath, the koi breeders\' things', () => {
    const count = (base) => plan.cells.filter((cell) => baseOf(cell.type) === base).length;
    assert.ok(count('bed') >= 2 * 14, `${count('bed') / 2} beds`);
    assert.ok(count('wardrobe') >= 2 * 8, `${count('wardrobe') / 2} wardrobes`);
    assert.ok(count('oven') >= 4);
    assert.ok(count('bookshelf') >= 60, `${count('bookshelf')} shelves`);
    assert.ok(count('bathtub') >= 4);
    assert.ok(count('lantern') + count('chandelier') >= 150, `${count('lantern')} lanterns`);
    const stockAt = (x, y, z) => plan.stocks.find((stock) => stock.x === x && stock.y === y && stock.z === z);
    const koi = plan.stocks.filter((stock) => stock.x >= 41 && stock.x <= 51 && stock.z >= 122 && stock.z <= 128).flatMap((stock) => stock.items.map(([type]) => type));
    for (const type of ['fish_egg', 'fishing_rod', 'raw_fish', 'breeding_notebook']) assert.ok(koi.includes(type), type);
    const treasury = stockAt(27, F, 66);
    assert.ok(treasury && treasury.items.some(([type]) => type === 'gold_leaf'));
    assert.ok(plan.stocks.length >= 40, `${plan.stocks.length} stocked`);
});

// The rooms people live in, inside their walls: local x0, z0, x1, z1 and the layer of the windows' screens.
const LIVED_ROOMS = [
    ['the emperor\'s bedchamber', 62, 101, 74, 105, G + 4],
    ['the consorts\' sitting room', 27, 87, 39, 92, F + 1],
    ['a consort\'s bedroom', 27, 94, 32, 101, F + 1],
    ['the other consort\'s bedroom', 34, 94, 39, 101, F + 1],
    ['the music room', 97, 87, 109, 92, F + 1],
    ['the prince\'s bedroom', 104, 94, 109, 101, F + 1]
];

test('the bath is a small room and the bedrooms are of a size to live in', () => {
    // The prince's bath: its screens close it to 6 by 4, with the dressing room of 6 by 3 in front.
    for (let x = 97; x <= 102; x++) assert.ok(['paper_screen', 'cherry_door'].includes(baseOf(typeAt(x, F, 97))), `${x}: ${typeAt(x, F, 97)}`);
    const inBath = (base) => plan.cells.some((cell) => baseOf(cell.type) === base && cell.x >= 97 && cell.x <= 102 && cell.z >= 98 && cell.z <= 101 && cell.y === F);
    for (const base of ['bathtub', 'toilet', 'sink']) assert.ok(inBath(base), base);
    assert.equal(baseOf(typeAt(102, F, 95)), 'wardrobe');
    // No bedroom but the emperor's is wider than 7 or deeper than 8.
    for (const [name, x0, z0, x1, z1] of LIVED_ROOMS.slice(2)) {
        if (/bedroom/.test(name)) assert.ok(Math.min(x1 - x0, z1 - z0) + 1 <= 7 && Math.max(x1 - x0, z1 - z0) + 1 <= 8, name);
    }
});

test('signs of daily life: things left on the tables, and screens across some windows but not all', () => {
    const tabletop = ['open_book', 'book_stack', 'inkwell', 'scroll', 'meal_plate', 'fruit_bowl', 'tea_set', 'jug', 'chessboard', 'sewing_basket'];
    const left = plan.cells.filter((cell) => tabletop.includes(baseOf(cell.type)));
    assert.ok(left.length > 25, `${left.length} things left about`);
    const kinds = new Set(left.map((cell) => baseOf(cell.type)));
    assert.ok(kinds.size >= 8 && kinds.has('tea_set'), [...kinds].join(' '));
    assert.ok(left.filter((cell) => baseOf(cell.type) === 'tea_set').length >= 4);
    // Each stands on something (a table, a desk, an altar) or on the floor, never in the air.
    for (const cell of left) assert.ok(typeAt(cell.x, cell.y - 1, cell.z), `${cell.type} at ${cell.x},${cell.y},${cell.z} floats`);
    // The windows of the rooms: a paper screen drawn inside the lattice, or nothing.
    let drawn = 0;
    let open = 0;
    for (const [name, x0, z0, x1, z1, y] of LIVED_ROOMS) {
        let here = 0;
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                const walls = [[x0 - 1, z, x === x0], [x1 + 1, z, x === x1], [x, z0 - 1, z === z0], [x, z1 + 1, z === z1]];
                for (const [wx, wz, edge] of walls) {
                    if (!edge || typeAt(wx, y, wz) !== 'lattice_screen') continue;
                    const inside = typeAt(x, y, z);
                    if (inside === 'paper_screen') { drawn++; here++; }
                    else if (!inside) open++;
                }
            }
        }
        assert.ok(here > 0, `no screen drawn in ${name}`);
    }
    assert.ok(drawn >= 10 && open >= 10, `${drawn} drawn, ${open} open`);
    assert.ok(drawn / (drawn + open) > 0.2 && drawn / (drawn + open) < 0.8, `${drawn} drawn, ${open} open`);
});

// What the server takes (construction_stock.go): its names.
const GO = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'construction_stock.go'), 'utf8');
const GO_ITEMS = new Set([...GO.slice(GO.indexOf('range []string{'), GO.indexOf('} {', GO.indexOf('range []string{'))).matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));

test('every chest, barrel and wardrobe is stocked, with a few different things the server takes', () => {
    const stocked = new Set(plan.stocks.map((stock) => `${stock.x},${stock.y},${stock.z}`));
    for (const cell of plan.cells) {
        // Ovens stay empty: their fire and what they cook are the server's.
        const state = stateOf(cell.type);
        if (defOf(cell.type).storageSlots && baseOf(cell.type) !== 'oven' && state.half !== 'upper') assert.ok(stocked.has(`${cell.x},${cell.y},${cell.z}`), `${cell.type} at ${cell.x},${cell.y},${cell.z} is empty`);
    }
    for (const stock of plan.stocks) {
        const where = `${stock.x},${stock.y},${stock.z}`;
        const cell = typeAt(stock.x, stock.y, stock.z);
        assert.ok(cell && defOf(cell).storageSlots, `${where}: no storage there`);
        assert.ok(stock.items.length <= defOf(cell).storageSlots, where);
        assert.ok(new Set(stock.items.map(([type]) => type)).size >= 3, `${where}: ${JSON.stringify(stock.items)}`);
        for (const [type, count] of stock.items) {
            assert.ok(GO_ITEMS.has(type), `${where}: ${type} is not in stockItems`);
            assert.ok(Number.isInteger(count) && count >= 1 && count <= ctx.CONSTRUCTION_STOCK_MAX, `${where}: ${count} ${type}`);
        }
        assert.ok(stock.items.reduce((sum, [, count]) => sum + count, 0) <= ctx.CONSTRUCTION_STOCK_TOTAL, where);
    }
});

test('the signs: Spanish, then English, within 288 bytes, out of the walls; the name at the entrance and the science of the koi', () => {
    const signs = plan.cells.filter((cell) => baseOf(cell.type) === 'sign');
    assert.ok(signs.length >= 20, `${signs.length} signs`);
    for (const cell of signs) {
        const [es, en] = cell.meta.t.split(' // ');
        assert.ok(es && en, cell.meta.t);
        assert.ok(Buffer.byteLength(cell.meta.t) <= 288, cell.meta.t);
        const [dx, dz] = DIRECTIONS[stateOf(cell.type).facing];
        for (const [x, y, z] of [[cell.x, cell.y + 1, cell.z], [cell.x + dx, cell.y, cell.z + dz], [cell.x + dx, cell.y + 1, cell.z + dz]]) {
            const type = typeAt(x, y, z);
            assert.ok(!type || !blocks.registry.fullCube[idOf(type)], `${cell.meta.t}: ${type} in the way`);
        }
    }
    const texts = signs.map((cell) => cell.meta.t);
    assert.ok(texts.some((t) => t.startsWith('Palacio del Cerezo') && signs.find((cell) => cell.meta.t === t).z < 22));
    assert.ok(texts.some((t) => /genes/.test(t) && /padres/.test(t) && /parents/.test(t)));
    assert.ok(texts.some((t) => /eligen/.test(t) && /choose/.test(t)));
    assert.ok(texts.some((t) => /Genética/.test(t) && /Genetics/.test(t)));
    assert.ok(texts.some((t) => /polen/.test(t) && /pollen/.test(t)));
});

test('pieces of two cells are whole, wall pieces have a wall, hanging ones something to hang from', () => {
    const wallShapes = new Set(['painting', 'wall_mirror', 'wall_clock', 'wall_shelf', 'banner']);
    let doors = 0;
    for (const cell of plan.cells) {
        const def = defOf(cell.type);
        const state = stateOf(cell.type);
        const where = `${cell.type} at ${cell.x},${cell.y},${cell.z}`;
        if (wallShapes.has(def.shape)) {
            const [dx, dz] = DIRECTIONS[state.facing];
            assert.ok(solidAt(cell.x - dx, cell.y, cell.z - dz), `no wall behind ${where}`);
        }
        if (def.shape === 'chandelier' || state.mount === 'hanging') assert.ok(solidAt(cell.x, cell.y + 1, cell.z), `nothing above ${where}`);
        const shape = def.shape && ctx.BLOCK_SHAPES[def.shape];
        if (shape && shape.linked) {
            for (const [dx, dy, dz] of shape.linked(state)) {
                const other = typeAt(cell.x + dx, cell.y + dy, cell.z + dz);
                assert.ok(other && baseOf(other) === baseOf(cell.type), `incomplete: ${where}`);
                assert.equal(stateOf(other).facing, state.facing, where);
            }
            if (def.shape === 'door') doors++;
        }
    }
    assert.ok(doors >= 2 * 40, `${doors / 2} doors`);
});

// ---------------------------------------------------------------------------------------
// Walking and light

// The plan in a flat world with its ground at G, as a visitor finds it: doors and gates open.
function placed() {
    const world = makeWorld(G, 11, -1);
    for (const cell of plan.cells) {
        const def = world.blockTypes[cell.type];
        let type = cell.type;
        if (def.state && def.state.open && def.shape !== 'trapdoor') type = world.getShapeStateType(def.variantOf || type, { ...def.state, open: 'open' });
        world.setEditedBlock(cell.x, cell.y, cell.z, type);
    }
    return world;
}

// Everywhere a player can walk, with no jump: quarter-block steps, a step up only as high as the camera steps,
// room for the body at both ends, and never into water (as in test/js/construction_castle.test.js).
function walkTight(world, start) {
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
    const queue = [[start[0] + 0.5, start[2] + 0.5, start[1]]];
    seen.add(key(...queue[0]));
    assert.ok(player.canStandAt(queue[0][0], queue[0][1], start[1]), `the start is free: ${start}`);
    const [w, , d] = plan.size;
    for (let head = 0; head < queue.length; head++) {
        const [x, z, feet] = queue[head];
        for (const [dx, dz] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
            const nx = x + dx;
            const nz = z + dz;
            if (nx < 0 || nz < 0 || nx > w || nz > d) continue;
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
        }
    }
    return queue;
}

let walked = null;
function walk() {
    if (!walked) {
        const world = placed();
        const queue = walkTight(world, plan.start);
        walked = { world, queue, cells: new Set(queue.map(([x, z, feet]) => `${Math.floor(x)},${Math.floor(feet)},${Math.floor(z)}`)) };
    }
    return walked;
}

test('from the road one walks to every hall, room, terrace, bridge and floor, without a jump', () => {
    const { cells } = walk();
    const missed = [];
    for (const [name, [x, feet, z]] of Object.entries(LEVELS)) {
        if (!cells.has(`${x},${feet},${z}`)) missed.push(`${name} (${x},${feet},${z})`);
    }
    assert.deepEqual(missed, []);
});

test('the rooms are lit at night', () => {
    const { world, queue } = walk();
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
    const dark = new Set();
    const checked = new Set();
    let indoors = 0;
    for (const [fx, fz, feet] of queue) {
        const x = Math.floor(fx), y = Math.floor(feet), z = Math.floor(fz);
        const key = `${x},${y},${z}`;
        if (checked.has(key)) continue;
        checked.add(key);
        const room = ROOMS.find(([, x0, z0, x1, z1, y0, y1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1 && y >= y0 && y <= y1);
        if (!room) continue;
        indoors++;
        if ((levels.get(key) || 0) < 6) dark.add(`${room[0]}: ${key}`);
    }
    assert.ok(indoors > 2000, `${indoors} cells indoors`);
    assert.deepEqual([...dark].sort().slice(0, 100), [], `${dark.size} dark cells`); 
});

// ---------------------------------------------------------------------------------------
// The build

test('on flat ground the site is accepted and the whole palace goes out, with its stock', () => {
    const world = makeWorld(3, 12);
    const game = new ctx.Game();
    const messages = [];
    const sent = [];
    Object.assign(game, {
        world,
        creativeMode: true,
        receiveSystemMessage: ({ text }) => messages.push(text),
        cameraController: { eyeHeight: 1.62, getPosition: () => ({ x: 0.5, y: 5.62, z: 0.5 }) },
        getInteractionRay: () => ({ direction: new Vector3(0, 0, 1) }),
        network: { connected: true, ws: { bufferedAmount: 0 }, send: (type, payload) => sent.push({ type, payload }) }
    });
    game.constructionCommand('build', ['palace_oriental']);
    for (let i = 0; i < 2000000 && (game.constructionJob || game.constructionWaiting || game.constructionScan); i++) game.constructionUpdate(1 / 60);
    assert.ok(!game.constructionJob && !game.constructionWaiting && !game.constructionScan, 'it ends');
    assert.ok(!messages.some((text) => /Find|fit/.test(text)), messages.join(' | '));
    const placedCount = sent.filter(({ type }) => type === 'blockPlace').length;
    assert.ok(placedCount > 40000, `${placedCount} blocks placed: ${messages.join(' | ')}`);
    const stock = sent.filter(({ type }) => type === 'constructionStock').flatMap(({ payload }) => payload.fills || []);
    assert.equal(stock.length, plan.stocks.length);
});
