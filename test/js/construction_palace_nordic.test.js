// Node tests for /build palace_nordic (js/game/construction_palace_nordic.js): the plan fits its box and uses
// only blocks, every chest, barrel and wardrobe is stocked with what the server takes, the rooms and the
// science are there, the domes and towers stand where they should, everywhere a visitor must reach can be
// walked to from the road without a jump, the inside is lit at night, and the site takes ordinary ground.
// Run with: node --test test/js/construction_palace_nordic.test.js

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
    const game = ['block_edits.js', 'joinery.js', 'chemistry.js', 'electricity.js', 'blueprints.js', 'constructions.js', 'furniture.js', 'seating.js', 'storage.js', 'decor.js', 'mirrors.js', 'tabletop.js',
        'smelters.js', 'microbes.js', 'microscope_text.js', 'microscope.js', 'palace_decor.js', 'construction_castle.js', 'construction_palace_common.js', 'construction_palace_nordic.js'];
    for (const file of game) vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, CameraController, CONSTRUCTION_DESIGNS, constructionPlan, chunkIndex, SHAPE_DIRECTIONS,
        CONSTRUCTION_STOCK_MAX, CONSTRUCTION_STOCK_TOTAL, signBoardLayoutFor, PALACE_NORDIC_SIGNS, PALACE_NORDIC_SIZE, PALACE_NORDIC_GROUND });`, context);
    return context;
}

const ctx = loadGame();
const G = ctx.PALACE_NORDIC_GROUND;
const F = G + 1;
const U = G + 7;
const V = G + 13;
const plan = ctx.constructionPlan('palace_nordic');
const grid = new Map(plan.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell]));

// A flat world of stone up to the ground layer, loaded over the whole box; ground(x, z) is the top.
function makeWorld(ground = () => G) {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    world.getChunkMaterial = (type) => `material:${type}`;
    const stone = world.registry.id('stone');
    for (let cx = -1; cx < 10; cx++) {
        for (let cz = -1; cz < 10; cz++) {
            const column = new ctx.ChunkColumn(cx, cz);
            for (let lx = 0; lx < 16; lx++) {
                for (let lz = 0; lz < 16; lz++) {
                    const top = ground(cx * 16 + lx, cz * 16 + lz);
                    for (let y = -4; y <= top; y++) column.blocks[ctx.chunkIndex(lx, y, lz)] = stone;
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
const stateOf = (type) => defOf(type).state || {};
const typeAt = (x, y, z) => (grid.get(`${x},${y},${z}`) || {}).type;

// What the server takes (construction_stock.go): its names.
const GO = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'construction_stock.go'), 'utf8');
const GO_ITEMS = new Set([...GO.slice(GO.indexOf('range []string{'), GO.indexOf('} {', GO.indexOf('range []string{'))).matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));

// Local [x, feet, z] of everywhere a visitor must get to.
const LEVELS = {
    'the avenue': [65, F, 20],
    'the porch': [65, F, 36],
    'the vestibule': [65, F, 47],
    'the cloakroom': [48, F, 50],
    'the treasury': [82, F, 44],
    'the great hall': [65, F, 60],
    'by the west fireplace of the great hall': [43, F, 60],
    'the first floor landing': [65, U, 43],
    'the balcony': [65, U, 36],
    'the library': [48, U, 44],
    'the weather room': [82, U, 47],
    'the throne room': [65, U, 56],
    'the throne dais': [65, U + 2, 64],
    'the second floor landing': [65, V, 50],
    'the royal bedroom': [47, V, 46],
    'the royal washroom': [52, V, 44],
    'the east suite\'s salon': [80, V, 49],
    'the east suite\'s study': [78, V, 43],
    'the east bedroom': [86, V, 46],
    'the east suite\'s closet': [84, V, 51],
    'the east suite\'s washroom': [88, V, 51],
    'the kitchen': [28, F, 51],
    'the cold store': [27, F, 68],
    'the servants\' hall': [30, F, 86],
    'the laundry': [27, F, 99],
    'the west corridor upstairs': [34, U, 60],
    'a servants\' room': [27, U, 50],
    'the servants\' store': [27, U, 55],
    'the big servants\' room': [26, U, 62],
    'the sewing room': [23, U, 68],
    'the servants\' privy': [29, U, 69],
    'the housekeeper\'s room': [28, U, 90],
    'the linen store': [26, U, 98],
    'the Hall of Light': [103, F, 55],
    'the storeroom': [103, F, 67],
    'the sleigh workshop': [100, F, 82],
    'the east corridor upstairs': [96, U, 60],
    'the children\'s bedroom': [104, U, 66],
    'the children\'s washroom': [100, U, 65],
    'the guest bedroom': [104, U, 83],
    'the guest washroom': [100, U, 87],
    'the courtyard gallery': [50, F, 70],
    'the orangery': [60, F, 86],
    'the banya\'s changing room': [45, F, 87],
    'the plunge pool\'s room': [45, F, 91],
    'the steam room': [46, F, 97],
    'the upper bench of the steam room': [45, F + 1, 100],
    'the stables': [70, F, 108],
    'a stall': [61, F, 113],
    'the tack room': [44, F, 109],
    'the frozen pond': [38, F, 22],
    'the warming hut': [17, F, 19],
    'the ice garden': [96, F, 21],
    'inside the ice maze': [84, F, 19],
    'the sundial': [85, F, 86]
};
for (let k = 0; k <= 5; k++) LEVELS[`the bell tower, feet ${F + 6 * k}`] = [27, F + 6 * k, k === 5 ? 36 : 39];
for (let k = 0; k <= 8; k++) LEVELS[`the observatory tower, feet ${F + 6 * k}`] = [k === 8 ? 104 : 98, F + 6 * k, 94];

// Doors and gates open, as a visitor would open them.
function placeOpen(world) {
    for (const cell of plan.cells) {
        const def = world.blockTypes[cell.type];
        let type = cell.type;
        if (def.state && def.state.open && def.shape !== 'trapdoor') type = world.getShapeStateType(def.variantOf || type, { ...def.state, open: 'open' });
        world.setEditedBlock(cell.x, cell.y, cell.z, type);
    }
}

// Everywhere a player can walk with no jump, in quarter blocks, using the camera's own collision and step
// rules (as the castle's test): a move only goes up what the camera steps up, with room for the body on
// both ends; water stops it.
function walk(world, start) {
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
    for (let head = 0; head < queue.length; head++) {
        const [x, z, feet] = queue[head];
        for (const [dx, dz] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
            const nx = x + dx;
            const nz = z + dz;
            if (nx < -2 || nz < -2 || nx > plan.size[0] + 2 || nz > plan.size[2] + 2) continue;
            const reach = feet + player.stepHeight;
            const floor = player.getSupportFloorY(nx, nz, reach, reach);
            if (floor > reach + 0.001 || floor < -4) continue;
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
function visit() {
    if (!walked) {
        const world = makeWorld();
        placeOpen(world);
        const queue = walk(world, plan.start);
        walked = { world, queue, cells: new Set(queue.map(([x, z, feet]) => `${Math.floor(x)},${Math.floor(feet)},${Math.floor(z)}`)) };
    }
    return walked;
}

// ---------------------------------------------------------------------------------------
// The plan

test('the plan: 131 square, every cell in its box and a block, the palace inside the rim, quick to draw', () => {
    const design = ctx.CONSTRUCTION_DESIGNS.palace_nordic;
    assert.deepEqual([...design.size], [131, 84, 131]);
    assert.equal(design.anchorX, 65);
    assert.equal(typeof design.site, 'function');
    const started = Date.now();
    ctx.constructionPlan('palace_nordic');
    assert.ok(Date.now() - started < 3000, 'drawn in a few seconds at most');
    assert.ok(plan.cells.length > 40000 && plan.cells.length < 150000, `${plan.cells.length} cells`);
    for (const cell of plan.cells) {
        assert.ok(cell.x >= 12 && cell.x <= 118 && cell.z >= 12 && cell.z <= 118 && cell.y >= 0 && cell.y < 84, `${cell.type} at ${cell.x},${cell.y},${cell.z}`);
    }
    for (const type of new Set(plan.cells.map((cell) => cell.type))) {
        assert.ok(defOf(type) && !defOf(type).itemOnly && blocks.registry.ids[type] !== undefined, `${type} is not a block`);
    }
    const types = new Set(plan.cells.map((cell) => baseOf(cell.type)));
    for (const type of ['red_brick', 'yellow_brick', 'white_stucco', 'granite', 'dark_oak_stairs', 'spruce_stairs', 'packed_ice', 'snow_block', 'magma_rock', 'iron_bars',
        'gilded_throne', 'red_banner', 'yellow_banner', 'brown_carpet', 'white_carpet', 'bed', 'wardrobe', 'oven', 'barrel', 'chest', 'bookshelf', 'globe', 'astrolabe',
        'sundial', 'statue', 'fountain', 'chandelier', 'lantern', 'candle', 'glass', 'water', 'bathtub', 'spruce_fence_gate', 'blue_stained_glass_pane']) {
        assert.ok(types.has(type), type);
    }
    for (const cell of plan.cells) {
        if (baseOf(cell.type) === 'oven') assert.equal(stateOf(cell.type).fire, 'off');
    }
});

test('every chest, barrel and wardrobe is stocked, with several kinds of what the server takes', () => {
    const stocks = new Map(plan.stocks.map((stock) => [`${stock.x},${stock.y},${stock.z}`, stock]));
    let storage = 0;
    for (const cell of plan.cells) {
        const base = baseOf(cell.type);
        if (!['chest', 'barrel', 'wardrobe'].includes(base) || stateOf(cell.type).half === 'upper') continue;
        storage++;
        const stock = stocks.get(`${cell.x},${cell.y},${cell.z}`);
        assert.ok(stock, `an empty ${base} at ${cell.x},${cell.y},${cell.z}`);
        assert.ok(stock.items.length >= 2, `only one kind in the ${base} at ${cell.x},${cell.y},${cell.z}`);
    }
    assert.equal(storage, plan.stocks.length, 'a stock with no storage under it');
    assert.ok(storage >= 60, `${storage} chests, barrels and wardrobes`);
    for (const stock of plan.stocks) {
        const where = `${stock.x},${stock.y},${stock.z}`;
        let total = 0;
        for (const [type, count] of stock.items) {
            assert.ok(GO_ITEMS.has(type), `${where}: ${type} is not in stockItems (construction_stock.go)`);
            assert.ok(Number.isInteger(count) && count >= 1 && count <= ctx.CONSTRUCTION_STOCK_MAX, `${where}: ${count} ${type}`);
            total += count;
        }
        assert.ok(total <= ctx.CONSTRUCTION_STOCK_TOTAL, where);
    }
    const all = new Map();
    for (const stock of plan.stocks) {
        for (const [type, count] of stock.items) all.set(type, (all.get(type) || 0) + count);
    }
    for (const type of ['telescope', 'star_chart', 'thermometer', 'barometer', 'anemometer', 'warm_coat', 'fur', 'salted_fish', 'bread', 'gold_leaf', 'ruby']) {
        assert.ok(all.has(type), `nothing holds ${type}`);
    }
    // Treasure, but not a mountain of it.
    assert.ok(all.get('gold_block') <= 8 && all.get('ruby') <= 12, `${all.get('gold_block')} gold blocks, ${all.get('ruby')} rubies`);
});

test('the rooms: a throne on a dais facing the door, beds, ovens under a hearth, fires behind bars, the instruments', () => {
    const throne = plan.cells.filter((cell) => baseOf(cell.type) === 'gilded_throne');
    assert.equal(throne.length, 2);
    const seat = throne.find((cell) => stateOf(cell.type).half === 'lower');
    assert.deepEqual([seat.x, seat.y, seat.z], [65, U + 2, 65]);
    assert.equal(stateOf(seat.type).facing, 'n');
    const beds = plan.cells.filter((cell) => baseOf(cell.type) === 'bed' && stateOf(cell.type).part === 'head');
    assert.ok(beds.length >= 15, `${beds.length} beds`);
    for (const head of beds) {
        const [dx, dz] = ctx.SHAPE_DIRECTIONS[stateOf(head.type).facing];
        const foot = typeAt(head.x - dx, head.y, head.z - dz);
        assert.ok(foot && stateOf(foot).part === 'foot', `a bed without its foot at ${head.x},${head.y},${head.z}`);
    }
    assert.ok(plan.cells.filter((cell) => baseOf(cell.type) === 'oven').length >= 3);
    // Every glowing rock indoors sits behind bars or in a wall, never where a visitor could step on it.
    const magma = plan.cells.filter((cell) => cell.type === 'magma_rock');
    assert.ok(magma.length >= 40, `${magma.length} fires`);
    for (const cell of magma) {
        const over = typeAt(cell.x, cell.y + 1, cell.z);
        assert.ok(over && over !== 'air', `a fire open to the sky at ${cell.x},${cell.y},${cell.z}`);
    }
    const instruments = ['astrolabe', 'globe', 'sundial'].map((type) => plan.cells.filter((cell) => baseOf(cell.type) === type).length);
    assert.ok(instruments.every((n) => n >= 1), instruments.join(' '));
});

test('daily life: things on the tables, washrooms of a washroom\'s size, curtains some open and some closed', () => {
    const tops = ['open_book', 'book_stack', 'inkwell', 'scroll', 'meal_plate', 'fruit_bowl', 'tea_set', 'jug', 'chessboard', 'sewing_basket'];
    const found = plan.cells.filter((cell) => tops.includes(baseOf(cell.type)));
    assert.ok(found.length > 30, `${found.length} things on the tables`);
    for (const id of ['open_book', 'inkwell', 'meal_plate', 'jug', 'chessboard', 'sewing_basket', 'tea_set']) assert.ok(found.some((cell) => baseOf(cell.type) === id), id);
    // Each stands on a table, a desk, a bedside table, a workbench or a barrel.
    for (const cell of found) {
        const under = baseOf(typeAt(cell.x, cell.y - 1, cell.z) || 'air');
        assert.ok(['table', 'desk', 'bedside_table', 'workbench', 'barrel'].includes(under), `${cell.type} on ${under} at ${cell.x},${cell.y},${cell.z}`);
    }
    // Toilets in the small washrooms: the royal one, the east suite's, the children's, the guests' and two
    // in the servants' privy.
    assert.equal(plan.cells.filter((cell) => baseOf(cell.type) === 'toilet').length, 6);
    const curtains = plan.cells.filter((cell) => baseOf(cell.type).endsWith('_curtain'));
    const closed = curtains.filter((cell) => stateOf(cell.type).drawn === 'closed').length;
    assert.ok(curtains.length >= 40, `${curtains.length} curtains`);
    assert.ok(closed >= curtains.length * 0.15 && closed <= curtains.length * 0.6, `${closed} closed of ${curtains.length}`);
});

test('the signs: the palace\'s name at the gate, the science in the weather room, the observatory, by the pond and in the orangery', () => {
    const signs = plan.cells.filter((cell) => baseOf(cell.type) === 'sign');
    const texts = signs.map((cell) => cell.meta.t);
    for (const [key, [es, en]] of Object.entries(ctx.PALACE_NORDIC_SIGNS)) assert.ok(texts.includes(`${es} // ${en}`), key);
    const em = (letter) => (/[A-ZÁÉÍÓÚÑ]/.test(letter) ? 0.74 : /[mw]/.test(letter) ? 0.9 : /[.,:;il' ]/.test(letter) ? 0.3 : 0.6);
    const measureAt = (font) => (line) => Array.from(line).reduce((width, letter) => width + em(letter) * font, 0);
    const world = visit().world;
    for (const cell of signs) {
        const text = cell.meta.t;
        assert.ok(Buffer.byteLength(text) <= 288, `${Buffer.byteLength(text)} bytes: ${text}`);
        assert.equal(ctx.signBoardLayoutFor(text, measureAt).truncated, false, text);
        const [dx, dz] = ctx.SHAPE_DIRECTIONS[stateOf(cell.type).facing];
        for (const y of [cell.y, cell.y + 1]) assert.ok(!world.registry.fullCube[world.getBlockId(cell.x + dx, y, cell.z + dz)], `looks at a wall: ${text}`);
    }
    const near = (key, x0, x1, z0, z1, y) => {
        const [es] = ctx.PALACE_NORDIC_SIGNS[key];
        const cell = signs.find((sign) => sign.meta.t.startsWith(es));
        assert.ok(cell.x >= x0 && cell.x <= x1 && cell.z >= z0 && cell.z <= z1 && (y === undefined || cell.y === y), `${key} at ${cell.x},${cell.y},${cell.z}`);
    };
    near('entrance', 55, 75, 12, 20);
    for (const key of ['thermometer', 'snow', 'barometer', 'anemometer']) near(key, 76, 90, 42, 52, U);
    for (const key of ['aurora', 'telescope']) near(key, 95, 107, 91, 103, G + 49);
    near('ice', 22, 54, 28, 31);
    near('greenhouse', 52, 78, 76, 96);
});

test('the silhouette: onion domes of several colours on gold spires, the observatory over everything, steep roofs', () => {
    const top = (x, z) => {
        for (let y = plan.size[1] - 1; y >= 0; y--) if (grid.has(`${x},${y},${z}`)) return y;
        return -1;
    };
    const observatory = top(101, 97);
    assert.ok(observatory >= 75, `observatory ${observatory}`);
    for (const [x, z] of [[65, 54], [30, 39], [46, 47], [84, 61]]) {
        assert.ok(top(x, z) < observatory, `${x},${z} over the observatory`);
        assert.equal(typeAt(x, top(x, z), z), 'gold_block', `a gold spire at ${x},${z}`);
    }
    assert.ok(top(65, 54) > top(30, 39) && top(30, 39) > top(46, 47), 'the gold dome over the bell tower, the bell tower over the corner domes');
    const tiles = new Set(plan.cells.map((cell) => baseOf(cell.type)).filter((type) => /_glazed_tile/.test(type)).map((type) => type.split('_')[0]));
    for (const colour of ['blue', 'green', 'red', 'yellow', 'turquoise']) assert.ok(tiles.has(colour), colour);
    // A dome bulges past its drum: wider above its foot than at it.
    const width = (y) => plan.cells.filter((cell) => cell.y === y && cell.z === 54 && Math.abs(cell.x - 65) <= 8 && /_glazed_tile/.test(cell.type)).length;
    assert.ok(width(G + 18 + 26) > 0 && Math.max(width(G + 18 + 26), width(G + 18 + 27)) >= 2);
    // The wings' roofs rise two a step.
    assert.equal(baseOf(typeAt(21, G + 18, 80)), 'spruce_stairs');
    assert.equal(baseOf(typeAt(21, G + 17, 80)), 'spruce_planks');
});

test('everywhere a visitor must reach can be walked to from the road, without a jump', () => {
    const { cells } = visit();
    for (const [name, at] of Object.entries(LEVELS)) assert.ok(cells.has(at.join(',')), `cannot reach ${name} (${at})`);
});

// The buildings, [x0, z0, x1, z1]: the main block, the wings, the towers, the banya, the stables. Outside them
// (under the balcony's eaves, a pavilion roof, the orangery's ribs) the night is allowed to be dark.
const BUILDINGS = [[38, 40, 92, 68], [20, 46, 37, 104], [93, 46, 110, 90], [24, 33, 36, 45], [95, 91, 107, 103], [40, 84, 50, 102], [40, 106, 90, 116]];

// The cells a visitor stands in indoors: inside a building, an opaque block overhead, and something solid
// along all four directions (as constructions.test.js).
function indoors({ world, queue }) {
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
    for (const [fx, fz, feet] of queue) {
        const x = Math.floor(fx), y = Math.floor(feet), z = Math.floor(fz);
        const key = `${x},${y},${z}`;
        if (cells.has(key) || !BUILDINGS.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)) continue;
        let covered = false;
        for (let up = y + 2; up < h && !covered; up++) covered = opaque(x, up, z);
        const inside = covered && closed(x, y, z, 1, 0) && closed(x, y, z, -1, 0) && closed(x, y, z, 0, 1) && closed(x, y, z, 0, -1);
        cells.set(key, inside ? [x, y, z] : null);
    }
    return [...cells.values()].filter(Boolean);
}

test('the inside is lit at night: candles, lanterns, chandeliers and the fires', () => {
    const site = visit();
    const { world } = site;
    const levels = new Map();
    const queue = [];
    const put = (x, y, z, level) => {
        levels.set(`${x},${y},${z}`, level);
        queue.push([x, y, z, level]);
    };
    for (const cell of plan.cells) {
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
    const rooms = indoors(site);
    assert.ok(rooms.length > 4000, `${rooms.length} cells indoors`);
    const dark = rooms.filter(([x, y, z]) => (levels.get(`${x},${y},${z}`) || 0) < 6);
    assert.deepEqual(dark.map((cell) => cell.join(',')), [], 'dark at night');
});

test('the site: ordinary rolling ground is levelled, a mountain is refused', () => {
    const design = ctx.CONSTRUCTION_DESIGNS.palace_nordic;
    const world = makeWorld();
    const run = (ground) => {
        const steps = design.site({
            readType: (x, y, z) => (y <= ground(x, z) ? 'stone' : null),
            blockTypes: world.blockTypes,
            min: { x: -65, z: 3 },
            size: design.size,
            turns: 0,
            anchor: { x: 0, z: 3 },
            fromY: ground(0, 0) + 1
        });
        let step = steps.next();
        while (!step.done) step = steps.next();
        return step.value;
    };
    const rolling = run((x, z) => Math.round(8 + 3 * Math.sin(x / 13) + 3 * Math.cos(z / 17)));
    assert.ok(!rolling.refuse, rolling.refuse);
    assert.equal(typeof rolling.grade, 'function');
    const mountain = run((x, z) => (z > 60 ? 70 : 8));
    assert.ok(mountain.refuse, 'a mountain is refused');
});
