// Node tests for /build palace_maya (js/game/construction_palace_maya.js): the plan and its size, that every block
// exists and stays in the box, what makes it Maya (corbel vaults, roof combs, the pyramid over everything), the rooms
// and what they hold, the calendar and the counting board, the observatory's windows, the stock against what the
// server takes, wall and hanging pieces, the signs, that every room and storey can be walked to from the road
// without a jump, that every room is lit at night, and the jungle site.
// Run with: node --test test/js/construction_palace_maya.test.js

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
    for (const file of ['block_edits.js', 'joinery.js', 'chemistry.js', 'electricity.js', 'blueprints.js', 'constructions.js', 'furniture.js', 'seating.js', 'storage.js', 'decor.js', 'mirrors.js',
        'smelters.js', 'microbes.js', 'microscope_text.js', 'microscope.js', 'palace_decor.js', 'tabletop.js', 'construction_castle.js', 'construction_palace_common.js', 'construction_palace_maya.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    }
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, CameraController, BLOCK_SHAPES, CONSTRUCTION_DESIGNS, constructionPlan, constructionLayout, chunkIndex,
        STORAGE_KINDS, CONSTRUCTION_STOCK_MAX, CONSTRUCTION_STOCK_TOTAL, CONSTRUCTION_PALACE_THEMES, PALACE_MAYA_SIZE, PALACE_MAYA_GROUND, PALACE_MAYA_TOP,
        PALACE_MAYA_AXIS, PALACE_MAYA_DAYS });`, context);
    return context;
}

const ctx = loadGame();
const G = ctx.PALACE_MAYA_GROUND;
const P = ctx.PALACE_MAYA_TOP;
const F = P + 1;
const A = ctx.PALACE_MAYA_AXIS;
const [W, H, D] = ctx.PALACE_MAYA_SIZE;
const DIRECTIONS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

const plan = ctx.constructionPlan('palace_maya');
const grid = new Map(plan.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell]));
const typeAt = (x, y, z) => (grid.get(`${x},${y},${z}`) || {}).type;

// A flat world of stone up to the ground layer, with the plan in it at its own coordinates: the box's layers up to
// G are ground, as on a levelled site. Doors open, as a visitor would open them.
function makeWorld() {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    world.getChunkMaterial = (type) => `material:${type}`;
    const stone = world.registry.id('stone');
    for (let cx = -1; cx <= Math.ceil(W / 16); cx++) {
        for (let cz = -1; cz <= Math.ceil(D / 16); cz++) {
            const column = new ctx.ChunkColumn(cx, cz);
            for (let lx = 0; lx < 16; lx++) {
                for (let lz = 0; lz < 16; lz++) {
                    for (let y = -16; y <= G; y++) column.blocks[ctx.chunkIndex(lx, y, lz)] = stone;
                }
            }
            world.columns.set(world.chunkKey(cx, cz), column);
        }
    }
    for (const cell of plan.cells) {
        const def = world.blockTypes[cell.type];
        let type = cell.type;
        if (def.state && def.state.open && def.shape !== 'trapdoor') type = world.getShapeStateType(def.variantOf || type, { ...def.state, open: 'open' });
        world.setEditedBlock(cell.x, cell.y, cell.z, type === 'air' ? null : type);
    }
    return world;
}

const world = makeWorld();
const defOf = (type) => world.blockTypes[type];
const baseOf = (type) => (defOf(type) && defOf(type).variantOf) || type;
const stateOf = (type) => defOf(type).state || {};
const idOf = (type) => world.registry.id(type || 'air');
const solidAt = (x, y, z) => {
    const type = typeAt(x, y, z);
    return Boolean(type) && type !== 'air' && world.registry.solid[idOf(type)] === 1;
};
const count = (base) => plan.cells.filter((cell) => baseOf(cell.type) === base).length;

const GO = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'construction_stock.go'), 'utf8');
const GO_ITEMS = new Set([...GO.slice(GO.indexOf('range []string{'), GO.indexOf('} {', GO.indexOf('range []string{'))).matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));

// Local [x, feet, z] of everywhere a visitor must get to.
const LEVELS = {
    'the plaza': [A, G + 1, 15],
    'the top of the great stair': [A, F, 29],
    'the portico': [70, F, 33],
    'the audience gallery': [82, F, 40],
    'the guard room': [59, F, 39],
    'the tribute store': [115, F, 39],
    'the main court': [A, F, 50],
    'the scribes\' room': [64, F, 48],
    'the workshop': [64, F, 58],
    'the servants\' room': [65, F, 67],
    'the kitchen': [110, F, 48],
    'the store': [110, F, 58],
    'the treasury': [110, F, 68],
    'the throne room': [75, F, 77],
    'the dais of the throne': [A, F + 1, 78],
    'the banquet hall': [A, F, 81],
    'the tower court': [80, F, 98],
    'the tower, ground storey': [66, F, 98],
    'the tower, first storey': [66, P + 6, 98],
    'the tower, second storey': [66, P + 11, 98],
    'the tower, observatory': [66, P + 16, 98],
    'the tower roof': [66, P + 21, 96],
    'the calendar hall': [70, F, 113],
    'the king\'s room': [95, F, 92],
    'the queen\'s room': [105, F, 92],
    'the princes\' room': [115, F, 92],
    'the king\'s dressing room': [93, F, 98],
    'the king\'s washroom': [98, F, 98],
    'the queen\'s washroom': [110, F, 92],
    'the sitting room': [105, F, 97],
    'the princes\' washroom': [112, F, 98],
    'the princes\' schoolroom': [116, F, 98],
    'the temazcal': [96, F, 108],
    'the garden': [110, F, 104],
    'the west walkway': [57, F, 80],
    'the foot of the west stair': [47, G + 1, 77],
    'the foot of the pyramid': [29, G + 1, 25],
    'the terrace of the temple': [29, G + 22, 49],
    'the temple': [29, G + 22, 54],
    'the ball court': [29, G + 1, 96],
    'by the cenote': [24, G + 1, 21]
};

// The rooms, local x0, z0, x1, z1 and feet from and to, for the test of light: eaves and porches are not rooms.
const ROOMS = [
    ['the portico', 56, 31, 118, 35, F, F], ['the audience gallery', 64, 37, 110, 41, F, F + 1], ['the guard room', 56, 37, 62, 41, F, F],
    ['the tribute store', 112, 37, 118, 41, F, F], ['the scribes\' room', 62, 44, 66, 53, F, F], ['the workshop', 62, 55, 66, 62, F, F],
    ['the servants\' room', 62, 64, 66, 71, F, F], ['the kitchen', 108, 44, 112, 53, F, F + 1], ['the store', 108, 55, 112, 62, F, F],
    ['the treasury', 108, 64, 112, 71, F, F], ['the throne room', 69, 75, 105, 79, F, F + 1], ['the banquet hall', 69, 81, 105, 85, F, F],
    ['the tower', 62, 94, 70, 102, F, P + 20], ['the calendar hall', 56, 111, 84, 115, F, F], ['the king\'s room', 91, 90, 99, 94, F, F],
    ['the queen\'s room', 101, 90, 107, 94, F, F], ['the queen\'s washroom', 109, 90, 111, 94, F, F], ['the princes\' room', 113, 90, 119, 94, F, F],
    ['the king\'s dressing room', 91, 96, 95, 100, F, F], ['the king\'s washroom', 97, 96, 99, 100, F, F], ['the sitting room', 101, 96, 109, 100, F, F],
    ['the princes\' washroom', 111, 96, 113, 100, F, F], ['the princes\' schoolroom', 115, 96, 119, 100, F, F], ['the temazcal', 93, 106, 99, 112, F, F],
    ['the temple', 26, 52, 32, 56, G + 22, G + 22]
];

// Everywhere a player can walk from the road, with no jump: the strict fill of construction_castle.test.js, a
// quarter of a block a step, up only what the camera steps up, with room for the body at both ends, never on water.
function walkTight(start) {
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
            if (nx < -1 || nz < -1 || nx > W + 1 || nz > D + 1) continue;
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
function reached() {
    if (!walked) {
        const queue = walkTight(plan.start);
        walked = { queue, cells: new Set(queue.map(([x, z, feet]) => `${Math.floor(x)},${Math.floor(feet)},${Math.floor(z)}`)) };
    }
    return walked;
}

// ---------------------------------------------------------------------------------------
// The plan

test('the Maya palace: its size, every block exists, nothing outside the box, the same every time and quick', () => {
    assert.equal(plan.label, 'Maya palace');
    assert.ok(W >= 121 && D >= 121 && W <= 141 && D <= 141, `${W} x ${D}`);
    assert.equal(plan.anchorX, A);
    assert.deepEqual([...plan.start], [A, G + 1, 1]);
    assert.ok(plan.cells.length > 40000 && plan.cells.length < 150000, `${plan.cells.length} cells`);
    for (const type of new Set(plan.cells.map((cell) => cell.type))) {
        assert.ok(defOf(type), `${type} is not a block`);
        assert.ok(world.registry.ids[type] !== undefined, `${type} is not a world block`);
        assert.ok(!defOf(type).itemOnly, `${type} is an item`);
    }
    for (const cell of plan.cells) {
        assert.ok(cell.x >= 0 && cell.x < W && cell.y >= 0 && cell.y < H && cell.z >= 0 && cell.z < D, `${cell.x},${cell.y},${cell.z}`);
    }
    // The rim is the site's: nothing of the palace on it.
    const rim = plan.cells.filter((cell) => Math.min(cell.x, cell.z, W - 1 - cell.x, D - 1 - cell.z) < 12);
    assert.deepEqual(rim.slice(0, 3).map((cell) => `${cell.type} ${cell.x},${cell.y},${cell.z}`), []);
    const start = Date.now();
    const again = ctx.constructionPlan('palace_maya');
    assert.ok(Date.now() - start < 3000, 'it draws in a moment');
    assert.equal(again.cells.length, plan.cells.length);
    assert.ok(again.cells.every((cell) => typeAt(cell.x, cell.y, cell.z) === cell.type), 'the same plan every time');
    assert.ok(!fs.readFileSync(path.join(JS, 'game', 'construction_palace_maya.js'), 'utf8').includes('Math.random'));
});

test('it looks Maya: corbel vaults, roof combs, red and white stucco with a little jade, the pyramid over everything', () => {
    // The throne room's vault, across z: straight walls, then a step in from each side, then a single row, then the capstone.
    assert.ok(!typeAt(80, F + 2, 75) && !typeAt(80, F + 2, 79));
    assert.ok(solidAt(80, F + 3, 75) && solidAt(80, F + 3, 79) && !typeAt(80, F + 3, 77));
    assert.ok(solidAt(80, F + 4, 76) && solidAt(80, F + 4, 78) && !typeAt(80, F + 4, 77));
    assert.ok(solidAt(80, F + 5, 77), 'the capstone');
    // Roof combs: pierced walls standing on the roofs of the throne house and the temple.
    const comb = [];
    for (let y = F + 7; y < F + 15; y++) {
        for (let x = 72; x <= 102; x++) comb.push(typeAt(x, y, 80) || 'hole');
    }
    assert.ok(comb.includes('hole') && comb.includes('red_stucco') && comb.includes('white_stucco'), 'a pierced comb of red and white');
    const top = (x, z) => {
        for (let y = H - 1; y >= 0; y--) {
            if (solidAt(x, y, z)) return y;
        }
        return -1;
    };
    const temple = Math.max(...[26, 27, 28, 29, 30, 31, 32].map((x) => top(x, 55)));
    assert.ok(temple >= G + 35, `the temple's comb at ${temple}`);
    assert.ok(temple > top(66, 98) && top(66, 98) > top(A, 80) && top(A, 80) > top(A, 50), 'pyramid > tower > throne house > court');
    assert.equal(top(66, 98) >= P + 21, true, 'the tower has four storeys and a roof');
    // The colours.
    const red = count('red_stucco');
    const white = count('white_stucco');
    const jade = count('green_glazed_tile');
    assert.ok(red > 3000 && white > 3000, `${red} red, ${white} white`);
    assert.ok(jade > 20 && jade < 0.05 * (red + white), `jade sparingly: ${jade}`);
    // The great stair is on the axis, and the ball court on the pyramid's.
    for (let z = 24; z <= 27; z++) assert.equal(defOf(typeAt(A, G + 1 + z - 24, z)).shape, 'stairs');
    assert.equal(typeAt(29, G, 96), 'green_glazed_tile', 'the middle marker of the ball court');
    assert.equal(typeAt(18, G - 1, 18), 'water', 'the cenote');
});

test('the rooms are furnished: the jade throne on its dais, beds, ovens, codices, the instruments, light', () => {
    assert.equal(baseOf(typeAt(A, F + 1, 79)), 'jade_throne');
    assert.equal(stateOf(typeAt(A, F + 1, 79)).half, 'lower');
    assert.equal(stateOf(typeAt(A, F + 1, 79)).facing, 'n', 'it looks out over the court');
    assert.equal(baseOf(typeAt(A, F + 2, 79)), 'jade_throne');
    assert.ok(solidAt(A, F, 79), 'the dais');
    const beds = plan.cells.filter((cell) => baseOf(cell.type) === 'bed' && stateOf(cell.type).part === 'head');
    assert.ok(beds.length >= 12, `${beds.length} beds`);
    for (const bed of beds) {
        const [dx, dz] = DIRECTIONS[stateOf(bed.type).facing];
        assert.equal(typeAt(bed.x - dx, bed.y, bed.z - dz), bed.type.replace('head', 'foot'), `the foot of the bed at ${bed.x},${bed.y},${bed.z}`);
    }
    const ovens = plan.cells.filter((cell) => baseOf(cell.type) === 'oven');
    assert.ok(ovens.length >= 3 && ovens.every((cell) => stateOf(cell.type).fire === 'off'));
    for (const [base, least] of [['bookshelf', 20], ['wardrobe', 10], ['bench', 100], ['chandelier', 8], ['lantern', 150], ['candle', 15], ['sundial', 1],
        ['magma_rock', 10], ['water', 20], ['barrel', 10], ['chest', 15], ['table', 5], ['desk', 4], ['workbench', 4], ['jungle_door', 2]]) {
        assert.ok(count(base) >= least, `${count(base)} ${base}`);
    }
    // Banners of red, yellow and blue cloth.
    for (const colour of ['red', 'yellow', 'blue']) assert.ok(count(`${colour}_banner`) >= 6, colour);
    // The hot stones of the temazcal under its dome; the water of the reservoir has a floor.
    assert.equal(typeAt(96, P, 111), 'magma_rock');
    assert.ok(solidAt(96, F + 5, 109), 'the capstone of the dome');
    for (const cell of plan.cells.filter((other) => other.type === 'water' && other.y === P)) assert.ok(solidAt(cell.x, P - 1, cell.z), `water over nothing at ${cell.x},${cell.z}`);
});

test('the calendar hall: the 20 day signs, two colours each and all different, and a counting board that reads 0, 3, 5, 12, 19', () => {
    const days = ctx.PALACE_MAYA_DAYS;
    assert.equal(days.length, 20);
    const seen = new Set();
    days.forEach((day, i) => {
        const slot = i < 10 ? i : 19 - i;
        const z = i < 10 ? 116 : 110;
        const cells = [];
        for (let dx = 0; dx < 2; dx++) {
            for (let dy = 0; dy < 2; dy++) cells.push(typeAt(56 + 3 * slot + dx, F + 1 + dy, z));
        }
        assert.ok(cells.every((type) => /_wool$/.test(type)), `${day[0]}: ${cells}`);
        assert.equal(new Set(cells).size, 2, day[0]);
        const look = cells.join(',');
        assert.ok(!seen.has(look), `${day[0]} looks like another sign`);
        seen.add(look);
    });
    // Dots and bars of black wool on the floor, a yellow shell for zero.
    [0, 3, 5, 12, 19].forEach((n, i) => {
        let black = 0;
        let shell = 0;
        for (let z = 112; z <= 115; z++) {
            for (let x = 58 + 5 * i; x < 62 + 5 * i; x++) {
                if (typeAt(x, P, z) === 'black_wool') black++;
                if (typeAt(x, P, z) === 'yellow_glazed_tile') shell++;
            }
        }
        assert.equal(black, Math.floor(n / 5) * 4 + (n % 5), `the number ${n}`);
        assert.equal(shell > 0, n === 0, `the shell of ${n}`);
    });
    // Twenty in the tower: a dot over a shell.
    assert.equal(typeAt(66, P, 100), 'black_wool');
    assert.equal(typeAt(66, P, 97), 'yellow_glazed_tile');
});

test('the observatory: its east and west windows are on one line, and nothing stands between them', () => {
    const base = P + 15;
    for (const y of [base + 2, base + 3]) {
        for (let x = 60; x <= 72; x++) assert.ok(!solidAt(x, y, 98), `${typeAt(x, y, 98)} in the way at ${x},${y}`);
        assert.ok(solidAt(59 + 0, y, 96) || solidAt(60, y, 96), 'a wall beside the west window');
    }
    assert.ok(solidAt(60, base + 4, 98) && solidAt(72, base + 4, 98), 'lintels');
});

test('every chest and barrel holds a few stacks of what the server takes, and what fits the room', () => {
    // Ovens are storage too, but a build places them cold and empty, like any furniture (constructions.js).
    const storage = plan.cells.filter((cell) => ['chest', 'barrel'].includes(baseOf(cell.type)));
    assert.ok(storage.length >= 25, `${storage.length} chests and barrels`);
    const stockAt = new Map(plan.stocks.map((stock) => [`${stock.x},${stock.y},${stock.z}`, stock]));
    for (const cell of storage) {
        const where = `${cell.type} at ${cell.x},${cell.y},${cell.z}`;
        const stock = stockAt.get(`${cell.x},${cell.y},${cell.z}`);
        assert.ok(stock, `${where} is empty`);
        const items = [...stock.items, ...stock.freezer];
        assert.ok(items.length >= 3, `${where}: only ${items.length} stacks`);
        assert.ok(items.length <= (ctx.STORAGE_KINDS[baseOf(cell.type)] || 27), where);
        let total = 0;
        for (const [type, n] of items) {
            assert.ok(GO_ITEMS.has(type), `${where}: ${type} is not in stockItems (construction_stock.go)`);
            assert.ok(Number.isInteger(n) && n >= 1 && n <= ctx.CONSTRUCTION_STOCK_MAX, `${where}: ${n} ${type}`);
            total += n;
        }
        assert.ok(total <= ctx.CONSTRUCTION_STOCK_TOTAL, where);
    }
    assert.equal(plan.stocks.length, storage.length, 'no stock without its chest');
    const holds = (x0, z0, x1, z1, y0, y1, item) => plan.stocks.some((stock) => stock.x >= x0 && stock.x <= x1 && stock.z >= z0 && stock.z <= z1 && stock.y >= y0 && stock.y <= y1 &&
        stock.items.some(([type]) => type === item));
    assert.ok(holds(108, 44, 112, 53, F, F, 'bread') && holds(108, 44, 112, 53, F, F, 'wheat'), 'the kitchen has food');
    assert.ok(holds(108, 55, 112, 62, F, F, 'honey_bottle'), 'the store has honey');
    assert.ok(holds(108, 64, 112, 71, F, F, 'gold_leaf') && holds(108, 64, 112, 71, F, F, 'feather'), 'the treasury has gold and feathers');
    assert.ok(holds(62, 94, 70, 102, F, P + 20, 'star_chart'), 'the tower has star charts');
    assert.ok(holds(56, 111, 84, 115, F, F, 'star_chart'), 'so does the calendar hall');
    assert.ok(holds(91, 90, 119, 94, F, F, 'red_wool'), 'the bedrooms have cloth');
    // Treasure, but not a dragon's hoard.
    const gold = plan.stocks.flatMap((stock) => stock.items).filter(([type]) => /gold/.test(type)).reduce((sum, [, n]) => sum + n, 0);
    assert.ok(gold > 0 && gold <= 20, `${gold} of gold`);
});

test('wall pieces hang on walls, lanterns from ceilings, and two-cell pieces are whole', () => {
    const wallShapes = new Set(['painting', 'wall_mirror', 'wall_clock', 'wall_shelf', 'curtain', 'banner']);
    const counts = { wall: 0, hanging: 0, linked: 0 };
    for (const cell of plan.cells) {
        const def = defOf(cell.type);
        const state = stateOf(cell.type);
        const where = `${cell.type} at ${cell.x},${cell.y},${cell.z}`;
        if (wallShapes.has(def.shape) || (def.shape === 'sign' && state.mount === 'wall')) {
            const [dx, dz] = DIRECTIONS[state.facing];
            // A curtain hung in a doorway or a window has no wall behind it, but a jamb at one side at least
            // (or more cloth), and a lintel over the strip it is part of.
            const inOpening = () => {
                const sideOk = (sx, sz) => solidAt(cell.x + sx, cell.y, cell.z + sz) || defOf(typeAt(cell.x + sx, cell.y, cell.z + sz) || 'air')?.shape === 'curtain';
                let y = cell.y + 1;
                while (defOf(typeAt(cell.x, y, cell.z) || 'air')?.shape === 'curtain') y++;
                return solidAt(cell.x, y, cell.z) && (sideOk(dz, dx) || sideOk(-dz, -dx));
            };
            assert.ok(solidAt(cell.x - dx, cell.y, cell.z - dz) || (def.shape === 'curtain' && inOpening()), `no wall behind ${where}`);
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
    }
    assert.ok(counts.wall >= 50 && counts.hanging >= 150 && counts.linked >= 40, JSON.stringify(counts));
});

test('the signs: Spanish, then English, within the 288 bytes of a sign, readable from the front; the science is there', () => {
    const signs = plan.cells.filter((cell) => baseOf(cell.type) === 'sign');
    assert.ok(signs.length >= 20, `${signs.length} signs`);
    for (const cell of signs) {
        const [es, en] = cell.meta.t.split(' // ');
        assert.ok(es && en && cell.meta.t.split(' // ').length === 2, cell.meta.t);
        assert.ok(Buffer.byteLength(cell.meta.t) <= 288, `${Buffer.byteLength(cell.meta.t)} bytes: ${cell.meta.t}`);
        const [dx, dz] = DIRECTIONS[stateOf(cell.type).facing];
        for (const [x, y, z] of [[cell.x + dx, cell.y, cell.z + dz], [cell.x + dx, cell.y + 1, cell.z + dz]]) {
            const type = typeAt(x, y, z);
            assert.ok(!type || !world.registry.fullCube[idOf(type)], `${es}: ${type} in front of it`);
        }
    }
    const texts = signs.map((cell) => cell.meta.t).join('\n');
    assert.ok(texts.includes('Palacio maya // Maya palace'));
    for (const fact of ['a dot is 1 and a bar is 5', 'invented zero', '584 days', 'due east', '260 days', '365 days', 'steam', 'latex', 'limestone cave', 'lime']) {
        assert.ok(texts.includes(fact), fact);
    }
    // The entrance sign stands by the way in, readable from the road.
    const entrance = signs.find((cell) => cell.meta.t === 'Palacio maya // Maya palace');
    assert.ok(entrance.z < 20 && Math.abs(entrance.x - A) <= 5 && stateOf(entrance.type).facing === 'n');
});

test('rooms of their size: the king\'s room large, the other bedrooms smaller, small washrooms, and every room furnished', () => {
    // A room x0..x1 by z0..z1 inside: open at head height all over, and walled round (doors and windows aside).
    const roomIs = (name, x0, z0, x1, z1) => {
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) assert.ok(!world.registry.fullCube[idOf(typeAt(x, F + 2, z))], `${name}: ${typeAt(x, F + 2, z)} at ${x},${z}`);
        }
        const ring = [];
        for (let x = x0; x <= x1; x++) ring.push([x, z0 - 1], [x, z1 + 1]);
        for (let z = z0; z <= z1; z++) ring.push([x0 - 1, z], [x1 + 1, z]);
        const walled = ring.filter(([x, z]) => solidAt(x, F + 1, z)).length;
        assert.ok(walled >= 0.7 * ring.length, `${name}: walled ${walled} of ${ring.length}`);
        for (const [x, z] of [[x0 - 1, z0], [x1 + 1, z1], [x0, z0 - 1], [x1, z1 + 1]]) assert.ok(solidAt(x, F + 3, z), `${name}: wall at ${x},${z}`);
    };
    roomIs('the king\'s room', 91, 90, 99, 94);
    roomIs('the queen\'s room', 101, 90, 107, 94);
    roomIs('the princes\' room', 113, 90, 119, 94);
    for (const [name, x0, z0, x1, z1] of [['the queen\'s washroom', 109, 90, 111, 94], ['the king\'s washroom', 97, 96, 99, 100], ['the princes\' washroom', 111, 96, 113, 100]]) {
        roomIs(name, x0, z0, x1, z1);
        assert.ok((x1 - x0 + 1) * (z1 - z0 + 1) <= 20, `${name} is small`);
        let seat = 0;
        let basin = 0;
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                if (baseOf(typeAt(x, F, z)) === 'toilet') seat++;
                if (typeAt(x, P, z) === 'water') basin++;
            }
        }
        assert.ok(seat === 1 && basin === 1, `${name}: ${seat} seats, ${basin} basins`);
    }
    // Each bedroom but the king's is at most 7 x 5 inside; each room of the residence has something in it.
    const residence = [[91, 90, 99, 94], [101, 90, 107, 94], [109, 90, 111, 94], [113, 90, 119, 94], [91, 96, 95, 100], [97, 96, 99, 100], [101, 96, 109, 100], [111, 96, 113, 100], [115, 96, 119, 100]];
    for (const [x0, z0, x1, z1] of residence) {
        const things = plan.cells.filter((cell) => cell.y === F && cell.x >= x0 && cell.x <= x1 && cell.z >= z0 && cell.z <= z1 && !/_carpet$/.test(cell.type));
        assert.ok(things.length >= 2, `the room at ${x0},${z0} is nearly empty`);
    }
});

test('signs of daily life: things on the tables, stools pushed back, cloth in the doorways some drawn back and some let down', () => {
    const TABLETOP = ['open_book', 'book_stack', 'inkwell', 'scroll', 'meal_plate', 'fruit_bowl', 'tea_set', 'jug', 'chessboard', 'sewing_basket'];
    const objects = plan.cells.filter((cell) => TABLETOP.includes(baseOf(cell.type)));
    assert.ok(objects.length > 25, `${objects.length} things on the tables`);
    assert.ok(new Set(objects.map((cell) => baseOf(cell.type))).size >= 8, 'of many kinds');
    // Each stands on something (a table, a desk, a bedside table, a workbench) or on the floor, never in the air.
    for (const cell of objects) assert.ok(solidAt(cell.x, cell.y - 1, cell.z) || defOf(typeAt(cell.x, cell.y - 1, cell.z) || 'air')?.shape, `${cell.type} in the air at ${cell.x},${cell.y},${cell.z}`);
    // The tables of the banquet hall are not all laid alike.
    const feast = objects.filter((cell) => cell.z === 83 && cell.y === F + 1);
    assert.ok(feast.length >= 5 && new Set(feast.map((cell) => baseOf(cell.type))).size >= 2, `${feast.length} on the banquet tables`);
    // Curtains: some open and some closed, about a third closed, and the washrooms' let down.
    const curtains = plan.cells.filter((cell) => defOf(cell.type).shape === 'curtain');
    const closed = curtains.filter((cell) => stateOf(cell.type).drawn === 'closed').length;
    assert.ok(curtains.length >= 40, `${curtains.length} curtains`);
    assert.ok(closed > 0.2 * curtains.length && closed < 0.5 * curtains.length, `${closed} of ${curtains.length} closed`);
    for (const [x, z] of [[96, 98], [108, 92], [114, 98]]) assert.equal(stateOf(typeAt(x, F, z)).drawn, 'closed', `the washroom door at ${x},${z}`);
    // An open doorway leaves its middle free and gathers the cloth to the jambs.
    assert.ok(!typeAt(95, F, 89), 'the middle of the king\'s doorway is free');
    assert.notEqual(stateOf(typeAt(94, F, 89)).side, stateOf(typeAt(96, F, 89)).side, 'drawn back to both sides');
});

// ---------------------------------------------------------------------------------------
// Walking and light

test('from the road one walks without a jump to every court, room, stair and storey, and up the pyramid', () => {
    const { cells } = reached();
    const missed = Object.entries(LEVELS).filter(([, [x, feet, z]]) => !cells.has(`${x},${feet},${z}`)).map(([name, at]) => `${name} (${at})`);
    assert.deepEqual(missed, []);
});

test('every room is lit at night', () => {
    const levels = new Map();
    const todo = [];
    const put = (x, y, z, level) => {
        levels.set(`${x},${y},${z}`, level);
        todo.push([x, y, z, level]);
    };
    for (const cell of plan.cells) {
        const level = world.registry.lightLevel[idOf(cell.type)];
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
    const dark = [];
    const visited = new Set();
    const checked = new Set();
    for (const [fx, fz, feet] of reached().queue) {
        const x = Math.floor(fx), y = Math.floor(feet), z = Math.floor(fz);
        const key = `${x},${y},${z}`;
        if (checked.has(key)) continue;
        checked.add(key);
        const room = ROOMS.find(([, x0, z0, x1, z1, y0, y1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1 && y >= y0 && y <= y1);
        if (!room) continue;
        visited.add(room[0]);
        if ((levels.get(key) || 0) < 6) dark.push(`${room[0]}: ${key}`);
    }
    assert.deepEqual(ROOMS.map(([name]) => name).filter((name) => !visited.has(name)), [], 'rooms nobody walked into');
    assert.ok(checked.size > 2000);
    assert.deepEqual(dark.slice(0, 50), [], `${dark.length} dark cells`);
});

// ---------------------------------------------------------------------------------------
// The site

test('it stands on a jungle site, levelled on flat ground, its rim graded with the jungle ground and a road', () => {
    assert.ok(fs.readFileSync(path.join(JS, 'game', 'construction_palace_maya.js'), 'utf8').includes("theme: 'jungle'"));
    const jungle = ctx.CONSTRUCTION_PALACE_THEMES.jungle;
    const steps = plan.site({
        readType: (x, y) => (y <= 3 ? 'grass' : null), blockTypes: world.blockTypes, min: { x: -A, z: 3 }, size: plan.size, turns: 0,
        anchor: { x: 0, z: 3 }, fromY: 5
    });
    let result;
    for (let step = steps.next(); ; step = steps.next()) {
        if (step.done) {
            result = step.value;
            break;
        }
    }
    assert.ok(!result.refuse, result.refuse);
    assert.equal(result.baseY, 3 - G);
    const road = result.grade(0, 3 + 5);
    assert.equal(road.type, jungle.road);
    const ground = result.grade(-A + 3, 3 + 60);
    assert.ok(jungle.ground.some(([type]) => type === ground.type), ground.type);
});
