// Node tests for /build palace_andalusi (js/game/construction_palace_andalusi.js): the plan (its size, its
// blocks, the box), the rooms a Nasrid palace must have and what they hold, the signs, the beds, that a
// visitor walks from the road to every room and floor without a jump, and that the rooms are lit at night.
// Run with: node --test test/js/construction_palace_andalusi.test.js

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
        'smelters.js', 'microbes.js', 'microscope_text.js', 'microscope.js', 'palace_decor.js', 'tabletop.js', 'construction_castle.js', 'construction_palace_common.js', 'construction_palace_andalusi.js'];
    for (const file of game) vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, CameraController, BLOCK_SHAPES, Game, CONSTRUCTION_DESIGNS, constructionPlan, constructionLayout,
        chunkIndex, CONSTRUCTION_STOCK_MAX, CONSTRUCTION_STOCK_TOTAL, PALACE_ANDALUSI_SIZE, PALACE_ANDALUSI_GROUND, PALACE_ANDALUSI_UPPER, PALACE_ANDALUSI_MID });`, context);
    return context;
}

const ctx = loadGame();
const G = ctx.PALACE_ANDALUSI_GROUND;
const U = ctx.PALACE_ANDALUSI_UPPER;
const F = G + 1;
const UF = U + 1;
const MID = ctx.PALACE_ANDALUSI_MID;
const DIRECTIONS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const plan = ctx.constructionPlan('palace_andalusi');

// A flat world whose top block is at `top`, with chunks loaded over the whole box (local x, z = world x, z).
function makeWorld(top) {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    world.getChunkMaterial = (type) => `material:${type}`;
    const stone = world.registry.id('stone');
    for (let cx = -1; cx <= 9; cx++) {
        for (let cz = -1; cz <= 9; cz++) {
            const column = new ctx.ChunkColumn(cx, cz);
            for (let lx = 0; lx < 16; lx++) {
                for (let lz = 0; lz < 16; lz++) {
                    for (let y = -4; y <= top; y++) column.blocks[ctx.chunkIndex(lx, y, lz)] = stone;
                }
            }
            world.columns.set(world.chunkKey(cx, cz), column);
        }
    }
    return world;
}

const blocks = makeWorld(0);
const defOf = (type) => blocks.blockTypes[type];
const baseOf = (type) => (defOf(type) && defOf(type).variantOf) || type;
const stateOf = (type) => defOf(type).state || {};
const idOf = (type) => blocks.registry.id(type || 'air');
const grid = new Map(plan.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));

// The palace as a visitor finds it, unturned: on flat ground level with its ground layer, doors open.
let builtWorld = null;
function built() {
    if (!builtWorld) {
        const world = makeWorld(G);
        for (const cell of plan.cells) {
            const def = world.blockTypes[cell.type];
            let type = cell.type;
            if (def.state && def.state.open && def.shape !== 'trapdoor') type = world.getShapeStateType(def.variantOf || type, { ...def.state, open: 'open' });
            world.setEditedBlock(cell.x, cell.y, cell.z, type);
        }
        builtWorld = world;
    }
    return builtWorld;
}

// Everywhere a player walks without a jump, in quarters of a block, with the camera's own step and
// collision; water stops it (as the castle's test, test/js/construction_castle.test.js).
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
    for (let head = 0; head < queue.length; head++) {
        const [x, z, feet] = queue[head];
        for (const [dx, dz] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
            const nx = x + dx;
            const nz = z + dz;
            if (nx < 0 || nz < 0 || nx > 141 || nz > 141) continue;
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
    return queue;
}

let walked = null;
function reached() {
    if (!walked) {
        const queue = walkTight(built(), plan.start);
        walked = { queue, cells: new Set(queue.map(([x, z, feet]) => `${Math.floor(x)},${Math.floor(feet)},${Math.floor(z)}`)) };
    }
    return walked;
}

// Local [x, feet, z] of every place a visitor must get to.
const LEVELS = {
    'the forecourt': [MID, F, 14],
    'the gate passage': [MID, F, 21],
    'a guard post in the gate': [66, F, 25],
    'the guard room over the gate': [72, UF, 20],
    'the entry court': [65, F, 33],
    'the oratory': [25, F, 30],
    'the Mexuar': [37, F, 30],
    'the guards\' quarters': [100, F, 30],
    'the stables': [114, F, 33],
    'a horse stall': [112, F, 27],
    'the lane, west': [20, F, 40],
    'the lane, east': [120, F, 41],
    'the kitchen': [30, F, 52],
    'the stores': [26, F, 64],
    'the servants\' hall': [26, F, 81],
    'the stair hall of the west wing': [26, F, 90],
    'the harem\'s salon': [24, F, 108],
    'the hall upstairs in the west wing': [26, UF, 90],
    'the corridor upstairs, south': [33, UF, 50],
    'the corridor upstairs, north': [33, UF, 115],
    'the first bedroom': [24, UF, 47],
    'the second bedroom': [24, UF, 59],
    'the third bedroom': [24, UF, 72],
    'the fourth bedroom': [24, UF, 101],
    'the royal bedroom': [24, UF, 112],
    'a dressing room': [28, UF, 53],
    'a washroom of the west wing': [28, UF, 46],
    'a closet': [21, UF, 54],
    'the nursery': [21, UF, 80],
    'the royal washroom': [28, UF, 111],
    'the south portico': [50, F, 46],
    'the Court of the Myrtles': [40, F, 70],
    'the far end of the pool': [50, F, 92],
    'the Sala de la Barca': [45, F, 97],
    'the throne hall': [50, F, 108],
    'before the throne': [50, F + 1, 118],
    'a mirador of the throne hall': [44, F, 123],
    'the Hall of Tilings': [72, F, 49],
    'the rest hall of the baths': [70, F, 61],
    'the warm room': [65, F, 72],
    'the hot room': [77, F, 72],
    'the vestibule': [72, F, 93],
    'the treasury': [72, F, 103],
    'the royal store': [72, F, 115],
    'the stair well at the library': [64, UF, 108],
    'the stair well, half way up': [64, G + 13, 100],
    'the library': [72, UF, 110],
    'the roof of the Comares tower': [50, G + 19, 110],
    'the Court of the Lions': [92, F, 62],
    'the west gallery of the Lions': [84, F, 64],
    'the east gallery of the Lions': [112, F, 64],
    'a pavilion': [88, F, 62],
    'by the sundial': [93, F, 59],
    'the Abencerrajes': [95, F, 50],
    'the music room': [110, F, 50],
    'the pantry': [118, F, 50],
    'the landing over the Abencerrajes': [87, UF, 49],
    'the sultan\'s antechamber': [95, UF, 49],
    'the sultan\'s bedchamber': [101, UF, 48],
    'the sultan\'s washroom': [104, UF, 50],
    'the prince\'s bedroom': [110, UF, 49],
    'the princesses\' bedroom': [118, UF, 49],
    'the Two Sisters': [93, F, 85],
    'an alcove of the Two Sisters': [85, F, 85],
    'the Hall of Kings': [116, F, 64],
    'the privy': [116, F, 78],
    'the linen store': [121, F, 78],
    'the chamberlain\'s office': [118, F, 86],
    'the garden, first terrace': [90, F, 96],
    'the garden, second terrace': [90, F + 1, 104],
    'the garden, beyond the long pool': [90, F + 1, 108],
    'the mirador of the garden': [100, F + 2, 119]
};

// The rooms, by their inside: name, local x0, z0, x1, z1 and the feet from and to.
const ROOMS = [
    ['the gate passage', 69, 17, 71, 26, F, F],
    ['the guard posts', 64, 17, 67, 26, F, F],
    ['the east guard post', 73, 17, 76, 26, F, F],
    ['the guard room', 64, 17, 76, 26, UF, UF],
    ['the oratory', 18, 24, 32, 36, F, F],
    ['the Mexuar', 34, 24, 53, 36, F, F],
    ['the guards\' quarters', 87, 24, 104, 36, F, F],
    ['the stables', 106, 24, 122, 36, F, F],
    ['the west wing', 18, 45, 35, 122, F, UF],
    ['the south portico', 38, 45, 62, 46, F, F],
    ['the north portico', 38, 92, 62, 94, F, F],
    ['the Sala de la Barca', 38, 96, 62, 99, F, F],
    ['the throne hall', 40, 102, 60, 124, F, F + 1],
    ['the Hall of Tilings', 64, 45, 81, 57, F, F],
    ['the baths', 64, 59, 81, 86, F, F],
    ['the vestibule', 64, 88, 81, 98, F, F],
    ['the treasury', 68, 100, 81, 109, F, F],
    ['the royal store', 63, 111, 81, 122, F, F],
    ['the stair well', 63, 100, 66, 108, F, G + 19],
    ['the library', 68, 100, 81, 122, UF, UF],
    ['the rooms south of the Lions', 83, 45, 122, 51, F, UF],
    ['the gallery of the Lions', 83, 53, 113, 55, F, F],
    ['the gallery of the Lions, far side', 83, 73, 113, 75, F, F],
    ['the gallery of the Lions, west', 83, 53, 85, 75, F, F],
    ['the gallery of the Lions, east', 111, 53, 113, 75, F, F],
    ['the Two Sisters and its alcoves', 83, 77, 113, 89, F, F],
    ['the Hall of Kings', 115, 53, 122, 75, F, F],
    ['the privy', 115, 77, 118, 80, F, F],
    ['the linen store', 120, 77, 122, 80, F, F],
    ['the chamberlain\'s office', 115, 82, 122, 89, F, F],
    ['the mirador of the garden', 95, 116, 109, 122, F + 2, F + 2]
];

// ---------------------------------------------------------------------------------------
// The plan

test('the palace: its size, its blocks, all inside its box, on a desert site', () => {
    const design = ctx.CONSTRUCTION_DESIGNS.palace_andalusi;
    const [w, h, d] = design.size;
    assert.ok(w >= 121 && d >= 121, `${w} x ${d}`);
    assert.equal(design.rate, 480);
    assert.equal(typeof design.site, 'function');
    assert.ok(plan.cells.length > 40000 && plan.cells.length < 200000, `${plan.cells.length} cells`);
    for (const type of new Set(plan.cells.map((cell) => cell.type))) {
        assert.ok(defOf(type) && !defOf(type).itemOnly && blocks.registry.ids[type] !== undefined, `${type} is not a block`);
    }
    for (const cell of plan.cells) assert.ok(cell.x >= 0 && cell.x < w && cell.y >= 0 && cell.y < h && cell.z >= 0 && cell.z < d, `${cell.type} at ${cell.x},${cell.y},${cell.z}`);
    // Nothing but the theme's ground on the rim: the site grades it.
    const rim = plan.cells.filter((cell) => Math.min(cell.x, cell.z, w - 1 - cell.x, d - 1 - cell.z) < 12);
    assert.deepEqual(rim.map((cell) => `${cell.type} ${cell.x},${cell.y},${cell.z}`).slice(0, 5), []);
    // It is made the same each time.
    assert.equal(ctx.constructionPlan('palace_andalusi').cells.length, plan.cells.length);
});

test('it looks Nasrid: sandstone and red lime outside, stucco and glazed tiles inside, lattices, water, a tall tower', () => {
    const counts = new Map();
    for (const cell of plan.cells) counts.set(baseOf(cell.type), (counts.get(baseOf(cell.type)) || 0) + 1);
    for (const [type, least] of [['sandstone', 2000], ['red_stucco', 300], ['cut_sandstone', 2000], ['white_stucco', 2000], ['blue_glazed_tile', 500], ['white_glazed_tile', 500],
        ['green_glazed_tile', 100], ['turquoise_glazed_tile', 100], ['lattice_screen', 100], ['water', 300], ['marble', 1000], ['leaves', 100], ['brick', 500], ['fountain', 8]]) {
        assert.ok((counts.get(type) || 0) >= least, `${type}: ${counts.get(type) || 0}`);
    }
    const top = (x, z) => {
        for (let y = plan.size[1] - 1; y >= 0; y--) if (grid.has(`${x},${y},${z}`)) return y;
        return -1;
    };
    // The Comares tower stands over everything else; the outer wall is crenellated.
    assert.ok(top(38, 110) >= G + 20, `the tower ${top(38, 110)}`);
    for (const [x, z] of [[26, 70], [100, 64], [70, 30]]) assert.ok(top(x, z) < top(38, 110) - 3, `${x},${z}: ${top(x, z)}`);
    const merlons = [];
    for (let x = 40; x < 50; x++) merlons.push(top(x, 22));
    assert.ok(new Set(merlons).size >= 2, `flat wall ${merlons}`);
});

test('the rooms of a palace: a throne, beds, ovens, a library, baths, the science room and its instruments', () => {
    const types = new Map();
    for (const cell of plan.cells) types.set(baseOf(cell.type), (types.get(baseOf(cell.type)) || 0) + 1);
    for (const [type, least] of [['jade_throne', 2], ['bed', 30], ['oven', 6], ['bookshelf', 40], ['wardrobe', 16], ['sink', 4], ['bathtub', 2], ['toilet', 1], ['table', 40],
        ['chandelier', 100], ['lantern', 40], ['candle', 20], ['astrolabe', 1], ['sundial', 1], ['globe', 2], ['statue', 8], ['iron_door', 2], ['oak_door', 10], ['magma_rock', 2]]) {
        assert.ok((types.get(type) || 0) >= least, `${type}: ${types.get(type) || 0}`);
    }
    const sofas = [...types.keys()].filter((type) => type.endsWith('_sofa')).reduce((sum, type) => sum + types.get(type), 0);
    const carpets = [...types.keys()].filter((type) => type.endsWith('_carpet')).reduce((sum, type) => sum + types.get(type), 0);
    const banners = [...types.keys()].filter((type) => type.endsWith('_banner')).reduce((sum, type) => sum + types.get(type), 0);
    assert.ok(sofas > 150 && carpets > 500 && banners > 15, `${sofas} sofas, ${carpets} carpets, ${banners} banners`);
    // The throne in the throne hall, facing the door; the instruments in the Hall of Tilings and the court.
    const throne = plan.cells.find((cell) => baseOf(cell.type) === 'jade_throne' && stateOf(cell.type).half === 'lower');
    assert.deepEqual([throne.x, throne.y, throne.z, stateOf(throne.type).facing], [50, G + 2, 120, 'n']);
    const at = (type) => plan.cells.filter((cell) => baseOf(cell.type) === type).map((cell) => [cell.x, cell.z]);
    assert.ok(at('astrolabe').every(([x, z]) => x >= 64 && x <= 81 && z >= 45 && z <= 57));
    assert.ok(at('sundial').every(([x, z]) => x >= 87 && x <= 109 && z >= 57 && z <= 71), 'the sundial in the Court of the Lions, under the sky');
    // The ovens are off, as a build cannot light them.
    for (const cell of plan.cells) if (baseOf(cell.type) === 'oven') assert.equal(stateOf(cell.type).fire, 'off');
});

// What the server takes (construction_stock.go): its names.
const GO = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'construction_stock.go'), 'utf8');
const GO_ITEMS = new Set([...GO.slice(GO.indexOf('range []string{'), GO.indexOf('} {', GO.indexOf('range []string{'))).matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));

test('every chest and barrel is stocked, with a few things the server takes, and the rooms hold what they should', () => {
    const stocks = new Map(plan.stocks.map((stock) => [`${stock.x},${stock.y},${stock.z}`, stock]));
    const storage = plan.cells.filter((cell) => defOf(cell.type).storageSlots && stateOf(cell.type).half !== 'upper');
    assert.ok(storage.length >= 40, `${storage.length} chests and barrels`);
    for (const cell of storage) {
        const stock = stocks.get(`${cell.x},${cell.y},${cell.z}`);
        assert.ok(stock, `an empty ${cell.type} at ${cell.x},${cell.y},${cell.z}`);
        assert.ok(stock.items.length >= 2, `only one thing in the ${cell.type} at ${cell.x},${cell.y},${cell.z}`);
    }
    assert.equal(stocks.size, storage.length);
    for (const stock of plan.stocks) {
        for (const [type, count] of stock.items) {
            assert.ok(GO_ITEMS.has(type), `${type} at ${stock.x},${stock.y},${stock.z} is not in stockItems`);
            assert.ok(count >= 1 && count <= ctx.CONSTRUCTION_STOCK_MAX);
        }
        assert.ok(stock.items.reduce((sum, [, count]) => sum + count, 0) <= ctx.CONSTRUCTION_STOCK_TOTAL);
    }
    const inside = (x0, z0, x1, z1) => plan.stocks.filter((s) => s.x >= x0 && s.x <= x1 && s.z >= z0 && s.z <= z1).flatMap((s) => s.items.map(([type]) => type));
    assert.ok(inside(64, 45, 81, 57).includes('star_chart') && inside(64, 45, 81, 57).includes('astrolabe'), 'the science room\'s chest');
    assert.ok(inside(18, 45, 35, 57).includes('bread'), 'the kitchen');
    assert.ok(inside(68, 100, 81, 109).includes('ruby') && inside(68, 100, 81, 109).includes('gold_leaf'), 'the treasury');
    assert.ok(inside(68, 100, 81, 122).includes('star_chart'), 'the library');
    // Treasure, but not absurd amounts of it.
    const gold = plan.stocks.flatMap((s) => s.items).filter(([type]) => type === 'gold_block').reduce((sum, [, n]) => sum + n, 0);
    assert.ok(gold > 0 && gold <= 4, `${gold} gold blocks`);
});

test('the signs: the palace\'s name at the gate, short titles, both languages, and the science explained', () => {
    const signs = plan.cells.filter((cell) => baseOf(cell.type) === 'sign');
    const entrance = signs.find((cell) => cell.z < 22);
    assert.ok(entrance && entrance.meta.t === 'Alcázar del Agua // Palace of Water', entrance && entrance.meta.t);
    const science = signs.filter((cell) => cell.meta.t.split(' // ').length === 3);
    assert.ok(science.length >= 9, `${science.length} signs that explain`);
    for (const word of ['Teselaciones', 'Simetría', 'Astrolabio', 'Reloj de sol', 'Globo']) assert.ok(science.some((cell) => cell.meta.t.startsWith(word)), word);
    for (const cell of signs) {
        const parts = cell.meta.t.split(' // ');
        assert.ok(parts.every((part) => part.length > 0), cell.meta.t);
        assert.ok(parts[0].length <= 20, `the board of ${cell.meta.t}`);
        assert.ok(Buffer.byteLength(cell.meta.t) <= 288, `too long: ${cell.meta.t}`);
        // Free in front: nothing full where the reader stands.
        const [dx, dz] = DIRECTIONS[stateOf(cell.type).facing];
        const front = grid.get(`${cell.x + dx},${cell.y},${cell.z + dz}`);
        assert.ok(!front || !blocks.registry.fullCube[idOf(front)], `${cell.meta.t}: ${front} in front of it`);
    }
});

test('every bed is whole, every two-cell piece too, every wall piece has its wall and every hanging lamp its hook', () => {
    const wallShapes = new Set(['painting', 'wall_mirror', 'wall_clock', 'wall_shelf', 'curtain', 'banner']);
    const solidAt = (x, y, z) => {
        const type = grid.get(`${x},${y},${z}`);
        return Boolean(type) && blocks.registry.solid[idOf(type)] === 1;
    };
    let beds = 0;
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
                const other = grid.get(`${cell.x + dx},${cell.y + dy},${cell.z + dz}`);
                assert.ok(other && baseOf(other) === baseOf(cell.type), `incomplete: ${where}`);
            }
            if (def.shape === 'bed' && state.part === 'head') beds++;
        }
    }
    assert.ok(beds >= 15, `${beds} beds`);
});

// The width and depth of the floor of the room around (x, z) at feet y: everything a player could stand in
// that is not behind a wall or a door, measured by the box round it (furniture does not shrink it).
function roomBox(x, y, z) {
    const seen = new Set([`${x},${z}`]);
    const todo = [[x, z]];
    let [x0, x1, z0, z1] = [x, x, z, z];
    while (todo.length && seen.size < 600) {
        const [cx, cz] = todo.pop();
        for (const [dx, dz] of Object.values(DIRECTIONS)) {
            const [nx, nz] = [cx + dx, cz + dz];
            if (seen.has(`${nx},${nz}`)) continue;
            const type = grid.get(`${nx},${y},${nz}`);
            if (type && (blocks.registry.fullCube[idOf(type)] || defOf(type).shape === 'door')) continue;
            seen.add(`${nx},${nz}`);
            todo.push([nx, nz]);
            [x0, x1, z0, z1] = [Math.min(x0, nx), Math.max(x1, nx), Math.min(z0, nz), Math.max(z1, nz)];
        }
    }
    return [x1 - x0 + 1, z1 - z0 + 1];
}

test('rooms the size of what they are for: small washrooms and privy, bedrooms of 7 by 8 but the royal ones', () => {
    const fits = (name, [x, y, z], most, least = [3, 3]) => {
        const [w, d] = roomBox(x, y, z);
        const [a, b] = [Math.min(w, d), Math.max(w, d)];
        assert.ok(a <= most[0] && b <= most[1] && a >= least[0] && b >= least[1], `${name}: ${w} by ${d}`);
    };
    for (const z of [47, 59, 72, 101]) fits(`the bedroom at z ${z}`, [24, UF, z], [7, 8], [5, 6]);
    for (const z of [46, 58, 70, 99, 111]) fits(`the washroom at z ${z}`, [28, UF, z], [5, 5]);
    fits('the nursery', [21, UF, 80], [7, 7]);
    fits('the privy', [116, F, 78], [4, 5]);
    fits('the sultan\'s washroom', [105, UF, 50], [4, 5]);
    fits('the prince\'s bedroom', [110, UF, 49], [7, 8], [5, 6]);
});

test('daily life: things left on the tables, chairs pushed back, curtains some drawn and some open', () => {
    const ids = ['open_book', 'book_stack', 'inkwell', 'scroll', 'meal_plate', 'fruit_bowl', 'tea_set', 'jug', 'chessboard', 'sewing_basket'];
    const tops = plan.cells.filter((cell) => ids.includes(baseOf(cell.type)));
    assert.ok(tops.length > 40, `${tops.length} things on the tables`);
    assert.ok(new Set(tops.map((cell) => baseOf(cell.type))).size >= 8, 'of many kinds');
    for (const cell of tops) {
        const under = grid.get(`${cell.x},${cell.y - 1},${cell.z}`);
        assert.ok(under && ['table', 'desk', 'bedside_table'].includes(baseOf(under)), `${cell.type} at ${cell.x},${cell.y},${cell.z} stands on ${under}`);
    }
    const curtains = plan.cells.filter((cell) => defOf(cell.type).shape === 'curtain');
    const closed = curtains.filter((cell) => stateOf(cell.type).drawn === 'closed').length;
    assert.ok(curtains.length >= 30 && closed >= curtains.length / 5 && closed <= curtains.length / 2, `${closed} of ${curtains.length} curtains drawn`);
});

// ---------------------------------------------------------------------------------------
// Walking and light

test('from the road one walks to every court, room and floor, up to the roof of the tower, without a jump', () => {
    const { cells } = reached();
    const missed = Object.entries(LEVELS).filter(([, at]) => !cells.has(at.join(','))).map(([name, at]) => `${name} (${at})`);
    assert.deepEqual(missed, []);
    const heights = new Set([...cells].map((key) => Number(key.split(',')[1])));
    for (const feet of [F, UF, G + 19]) assert.ok(heights.has(feet), `nobody walks at ${feet}`);
});

test('the inside is lit at night', () => {
    const world = built();
    const { queue } = reached();
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
        if ((levels.get(key) || 0) < 6) dark.add(`${room[0]}: ${x},${y},${z}`);
    }
    assert.ok(indoors > 5000, `${indoors} cells indoors`);
    assert.deepEqual([...dark].sort().slice(0, 200), [], `${dark.size} dark cells`);
});
