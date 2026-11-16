// Node tests for /build palace_volcanic (js/game/construction_palace_volcanic.js): the plan and its size,
// that every block exists and stays in the box, that every chest and barrel holds what the server takes,
// the rooms that make it a palace (the throne, beds, ovens, the hall of minerals and its labels), the signs,
// that every floor and room can be walked to from the road without a jump, and that the inside is lit at night.
// Run with: node --test test/js/construction_palace_volcanic.test.js

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
        'smelters.js', 'microbes.js', 'microscope_text.js', 'microscope.js', 'palace_decor.js', 'tabletop.js', 'construction_castle.js', 'construction_palace_common.js', 'construction_palace_volcanic.js'];
    for (const file of game) vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, CameraController, BLOCK_SHAPES, CONSTRUCTION_DESIGNS, constructionPlan, chunkIndex,
        CONSTRUCTION_STOCK_MAX, CONSTRUCTION_STOCK_TOTAL, PALACE_VOLCANIC_SIZE, PALACE_VOLCANIC_GROUND, PALACE_VOLCANIC_MID, PALACE_VOLCANIC_SAMPLES, PALACE_VOLCANIC_ELEMENTS });`, context);
    return context;
}

const ctx = loadGame();
const G = ctx.PALACE_VOLCANIC_GROUND;
const MID = ctx.PALACE_VOLCANIC_MID;
const [W, H, D] = ctx.PALACE_VOLCANIC_SIZE;
const DIRECTIONS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

const started = Date.now();
const plan = ctx.constructionPlan('palace_volcanic');
const elapsed = Date.now() - started;
const grid = new Map(plan.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));

// A flat world of stone up to the ground layer, with the box at the origin and its base at y = 0, so local
// and world coordinates are the same.
function makeWorld() {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    world.getChunkMaterial = (type) => `material:${type}`;
    const stone = world.registry.id('stone');
    for (let cx = -1; cx <= Math.ceil(W / 16); cx++) {
        for (let cz = -1; cz <= Math.ceil(D / 16); cz++) {
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
const stateOf = (type) => defOf(type).state || {};
const idOf = (type) => blocks.registry.id(type || 'air');

// The palace built on the flat world, its doors open as a visitor would open them.
let builtWorld = null;
function built() {
    if (!builtWorld) {
        builtWorld = makeWorld();
        for (const cell of plan.cells) {
            const def = builtWorld.blockTypes[cell.type];
            let type = cell.type === 'air' ? null : cell.type;
            if (def.state && def.state.open && def.shape !== 'trapdoor') type = builtWorld.getShapeStateType(def.variantOf || cell.type, { ...def.state, open: 'open' });
            builtWorld.setEditedBlock(cell.x, cell.y, cell.z, type);
        }
    }
    return builtWorld;
}

// Everywhere a player can walk without jumping (as test/js/construction_castle.test.js): a step is a quarter
// of a block, a move only goes up what the camera steps up, with room for the body at both ends; water stops it.
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
            if (nx < 0 || nx >= W || nz < -2 || nz >= D) continue;
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
function walk() {
    if (!walked) {
        const queue = walkTight(built(), plan.start);
        walked = { queue, cells: new Set(queue.map(([x, z, feet]) => `${Math.floor(x)},${Math.floor(feet)},${Math.floor(z)}`)) };
    }
    return walked;
}

// Local [x, feet, z] of everywhere a visitor must get to.
const LEVELS = {
    'the bridge': [MID, G + 1, 18],
    'the gate passage': [MID, G + 1, 30],
    'the west guard room': [64, G + 1, 28],
    'the east guard room': [76, G + 1, 28],
    'the gate chamber': [70, G + 7, 26],
    'the forecourt': [MID, G + 1, 37],
    'by the hot spring of the ward': [51, G + 1, 41],
    'the path round the palace, west': [35, G + 1, 74],
    'the path round the palace, behind': [MID, G + 1, 109],
    'the portico': [MID, 13, 45],
    'the great hall': [MID, 13, 54],
    'the kitchen': [46, 13, 50],
    'the dining room': [92, 13, 50],
    'the gallery': [57, 13, 74],
    'the crater courtyard': [MID, 13, 66],
    'the bath': [51, 13, 69],
    'the hall of minerals': [49, 13, 93],
    'the treasury': [90, 13, 62],
    'the vault': [92, 13, 70],
    'the forge': [90, 13, 97],
    'the throne room': [MID, 13, 90],
    'before the throne': [MID, 15, 97],
    'the west stair hall': [45, 13, 82],
    'the east stair hall': [95, 13, 82],
    'the servants\' room': [46, 20, 52],
    'the library': [65, 20, 50],
    'the guest room': [92, 20, 57],
    'the guest bedroom': [94, 20, 52],
    'the guest dressing room': [89, 20, 51],
    'the guest washroom': [95, 20, 58],
    'the servants\' washroom': [45, 20, 58],
    'the balcony': [MID, 20, 45],
    'the west corridor': [52, 20, 80],
    'the east corridor': [88, 20, 80],
    'the terrace round the courtyard': [57, 20, 74],
    'bedroom A': [46, 20, 64],
    'bedroom B': [45, 20, 75],
    'bedroom C': [46, 20, 88],
    'bedroom D': [46, 20, 95],
    'bedroom E': [94, 20, 64],
    'bedroom F': [95, 20, 75],
    'the study': [93, 20, 87],
    'bedroom H': [95, 20, 94],
    'the washroom of bedroom A': [45, 20, 69],
    'the closet of bedroom A': [48, 20, 69],
    'the washroom of bedroom D': [45, 20, 100],
    'the closet of bedroom D': [48, 20, 100],
    'the washroom of bedroom E': [95, 20, 69],
    'the closet of bedroom E': [92, 20, 69],
    'the washroom of bedroom H': [95, 20, 100],
    'the closet of bedroom H': [92, 20, 100],
    'the west roof': [44, 27, 70],
    'the front roof': [MID, 27, 55],
    'the east roof': [96, 27, 70],
    'the roof by the keep': [58, 27, 89],
    'the keep\'s antechamber': [66, 27, 95],
    'the royal bedchamber': [67, 33, 91],
    'the observatory': [67, 39, 91],
    'the watch room': [67, 45, 91],
    'the crown of the keep': [66, 51, 95]
};

// Rooms whose covered cells must be lit at night: name, x0, z0, x1, z1, lowest and highest feet.
const ROOMS = [
    ['the gatehouse', 60, 25, 80, 34, G + 1, G + 7],
    ['the portico', 54, 43, 86, 47, 13, 13],
    ['the kitchen', 43, 49, 53, 59, 13, 18],
    ['the great hall', 55, 49, 85, 59, 13, 18],
    ['the dining room', 87, 49, 97, 59, 13, 18],
    ['the bath', 43, 61, 53, 77, 13, 18],
    ['the west stair hall', 43, 79, 53, 83, 13, 26],
    ['the east stair hall', 87, 79, 97, 83, 13, 26],
    ['the hall of minerals', 43, 85, 53, 101, 13, 18],
    ['the treasury', 87, 61, 97, 77, 13, 18],
    ['the forge', 87, 85, 97, 101, 13, 18],
    ['the gallery', 55, 61, 85, 86, 13, 13],
    ['the throne room', 55, 88, 85, 101, 13, 16],
    ['the front rooms upstairs', 43, 49, 97, 59, 20, 25],
    ['the west wing upstairs', 43, 61, 53, 101, 20, 25],
    ['the east wing upstairs', 87, 61, 97, 101, 20, 25],
    ['the keep', 64, 88, 76, 102, 27, 46]
];

// ---------------------------------------------------------------------------------------
// The plan

test('the palace is a big design of real blocks, inside its box, on the volcanic site, and generates fast', () => {
    const design = ctx.CONSTRUCTION_DESIGNS.palace_volcanic;
    assert.ok(W >= 121 && D >= 121, `${W} x ${D}`);
    assert.equal(design.anchorX, MID);
    assert.ok(fs.readFileSync(path.join(JS, 'game', 'construction_palace_volcanic.js'), 'utf8').includes("theme: 'volcanic'"));
    assert.ok(elapsed < 5000, `${elapsed} ms`);
    assert.ok(plan.cells.length > 50000 && plan.cells.length < 250000, `${plan.cells.length} cells`);
    for (const type of new Set(plan.cells.map((cell) => cell.type))) {
        assert.ok(defOf(type), `${type} is not a block`);
        assert.ok(blocks.registry.ids[type] !== undefined, `${type} is not a world block`);
        assert.ok(!defOf(type).itemOnly, `${type} is an item`);
    }
    for (const { x, y, z, type } of plan.cells) assert.ok(x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D, `${type} at ${x},${y},${z}`);
    // The rim is the site's: nothing of the palace on it but the road's continuation, the sign and the bridge.
    const rim = 12;
    for (const { x, z, type } of plan.cells) assert.ok(x >= rim && x < W - rim && z >= rim && z < D - rim, `${type} on the rim at ${x},${z}`);
    // Ovens and foundries are placed unlit, as a build cannot light them.
    for (const cell of plan.cells) {
        if (['oven', 'foundry'].includes(baseOf(cell.type))) assert.equal(stateOf(cell.type).fire, 'off');
    }
});

test('the silhouette: a keep crowning everything, over the wings, over the curtain wall', () => {
    const top = (x, z) => {
        for (let y = H - 1; y >= 0; y--) {
            const type = grid.get(`${x},${y},${z}`);
            if (type && type !== 'air') return y;
        }
        return -1;
    };
    assert.ok(top(70, 95) > 55, `keep ${top(70, 95)}`);
    assert.ok(top(44, 70) >= 26 && top(44, 70) < top(70, 95), `wing ${top(44, 70)}`);
    // The curtain wall at the back, and a bastion of columns at a corner standing over it.
    assert.ok(top(70, 118) >= 16 && top(70, 118) < top(44, 70), `wall ${top(70, 118)}`);
    assert.ok(top(16, 74) > top(70, 118), `bastion ${top(16, 74)}`);
    // The lava pool is sunken, behind bars; the chasm has magma at its bottom under the bridge.
    assert.equal(grid.get(`70,11,72`), 'magma_rock');
    assert.ok(!grid.has('70,12,72'));
    assert.equal(baseOf(grid.get('74,13,74')), 'iron_bars');
    assert.ok(plan.cells.some((cell) => cell.type === 'magma_rock' && cell.y === 2 && cell.z >= 14 && cell.z <= 22));
    assert.equal(grid.get(`${MID},${G},18`), 'granite');
});

test('every chest and barrel is stocked with a few things the server takes, within its limits', () => {
    const go = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'construction_stock.go'), 'utf8');
    const start = go.indexOf('range []string{');
    const known = new Set([...go.slice(start, go.indexOf('} {', start)).matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));
    const stocked = new Map(plan.stocks.map((stock) => [`${stock.x},${stock.y},${stock.z}`, stock]));
    const storage = plan.cells.filter((cell) => ['chest', 'barrel'].includes(baseOf(cell.type)));
    assert.ok(storage.length >= 40, `${storage.length} chests and barrels`);
    for (const cell of storage) {
        const where = `${baseOf(cell.type)} at ${cell.x},${cell.y},${cell.z}`;
        const stock = stocked.get(`${cell.x},${cell.y},${cell.z}`);
        assert.ok(stock, `${where} is empty`);
        assert.ok(stock.items.length >= 2, `${where} holds one thing only`);
        let total = 0;
        for (const [type, count] of stock.items) {
            assert.ok(known.has(type), `${where}: ${type} is not in stockItems`);
            assert.ok(Number.isInteger(count) && count >= 1 && count <= ctx.CONSTRUCTION_STOCK_MAX, `${where}: ${count} ${type}`);
            total += count;
        }
        assert.ok(total <= ctx.CONSTRUCTION_STOCK_TOTAL, where);
    }
    assert.equal(plan.stocks.length, storage.length);
});

test('the rooms of a palace: a throne, beds, ovens and foundries, the forge, the bath, the library, the treasury', () => {
    const count = (base) => plan.cells.filter((cell) => baseOf(cell.type) === base).length;
    assert.equal(count('obsidian_throne'), 2);
    assert.ok(count('bed') >= 2 * 18, `${count('bed') / 2} beds`);
    assert.ok(count('oven') >= 5 && count('foundry') >= 2);
    assert.ok(count('wardrobe') >= 2 * 12);
    assert.ok(count('bookshelf') >= 60);
    assert.ok(count('chandelier') >= 8);
    assert.ok(count('lantern') >= 200, `${count('lantern')} lanterns`);
    assert.ok(count('water') >= 40);
    assert.ok(count('gold_block') >= 10 && count('copper_block') >= 30);
    for (const type of ['microscope', 'astrolabe', 'globe', 'statue', 'red_banner', 'orange_banner', 'red_stained_glass_pane', 'orange_stained_glass_pane', 'iron_door', 'dark_oak_door', 'red_carpet', 'table_lamp', 'desk', 'sink', 'workbench', 'iron_block']) {
        assert.ok(count(type) > 0, type);
    }
    // Every bed whole: its foot in the cell away from where the head points.
    for (const bed of plan.cells.filter((cell) => baseOf(cell.type) === 'bed' && stateOf(cell.type).part === 'head')) {
        const [dx, dz] = DIRECTIONS[stateOf(bed.type).facing];
        assert.equal(grid.get(`${bed.x - dx},${bed.y},${bed.z - dz}`), bed.type.replace('head', 'foot'), `the bed at ${bed.x},${bed.y},${bed.z}`);
    }
});

test('rooms of a size for what they are, and signs of daily life: things on the tables, curtains drawn and open', () => {
    const count = (base) => plan.cells.filter((cell) => baseOf(cell.type) === base).length;
    // Small washrooms for the residents beside the big bath hall: a toilet in each.
    assert.ok(count('toilet') >= 6, `${count('toilet')} toilets`);
    assert.ok(count('bathtub') >= 2 * 6, `${count('bathtub') / 2} bathtubs`);
    // The tabletop objects (js/game/tabletop.js), several kinds of them.
    const kinds = ['open_book', 'book_stack', 'inkwell', 'scroll', 'meal_plate', 'fruit_bowl', 'jug', 'chessboard', 'sewing_basket'];
    const objects = plan.cells.filter((cell) => kinds.includes(baseOf(cell.type)));
    assert.ok(objects.length > 25, `${objects.length} tabletop objects`);
    assert.ok(new Set(objects.map((cell) => baseOf(cell.type))).size >= 8);
    // Each stands on a table, a desk, a bedside table or a workbench, or (a sewing basket) on the floor.
    for (const cell of objects) {
        const below = baseOf(grid.get(`${cell.x},${cell.y - 1},${cell.z}`) || 'air');
        assert.ok(['table', 'desk', 'bedside_table', 'workbench'].includes(below) || baseOf(cell.type) === 'sewing_basket', `${cell.type} at ${cell.x},${cell.y},${cell.z} on ${below}`);
    }
    // Curtains: some drawn, more open.
    const curtains = plan.cells.filter((cell) => defOf(cell.type).shape === 'curtain');
    const closed = curtains.filter((cell) => stateOf(cell.type).drawn === 'closed').length;
    assert.ok(closed > 0 && closed < curtains.length / 2, `${closed} of ${curtains.length} curtains drawn`);
});

test('the hall of minerals: every rock and mineral in its case, with its label, and the lessons', () => {
    const signs = plan.cells.filter((cell) => baseOf(cell.type) === 'sign');
    const texts = signs.map((cell) => cell.meta.t);
    for (const [type, es, en] of [...ctx.PALACE_VOLCANIC_SAMPLES, ...ctx.PALACE_VOLCANIC_ELEMENTS]) {
        const shown = plan.cells.find((cell) => cell.type === type && cell.x >= 43 && cell.x <= 53 && cell.z >= 85 && cell.z <= 101 && cell.y === 14);
        assert.ok(shown, `${type} is not in a case`);
        assert.equal(grid.get(`${shown.x},15,${shown.z}`), 'glass', `${type} has no glass over it`);
        assert.ok(texts.includes(`${es} // ${en}`), `${type} has no label`);
    }
    const all = texts.join(' ');
    for (const words of ['ígneas', 'igneous', 'Sedimentarias', 'sedimentary', 'Metamórficas', 'metamorphic', 'mármol', 'marble', 'seis lados', 'six-sided', 'fósil', 'fossil', 'Pirita', 'Pyrite', 'ámbar', 'Amber', 'fluorita']) {
        assert.ok(all.includes(words), words);
    }
    // The chests of samples hold the minerals the cases cannot.
    const held = new Set(plan.stocks.flatMap((stock) => stock.items.map(([type]) => type)));
    for (const type of ['pyrite', 'fluorite', 'amber', 'fossil_trilobite', 'fossil_ammonite', 'meteoric_iron', 'basalt', 'granite', 'obsidian']) assert.ok(held.has(type), type);
});

test('the signs: Spanish, then English, within what a sign holds, the palace named at the road', () => {
    const signs = plan.cells.filter((cell) => baseOf(cell.type) === 'sign');
    assert.ok(signs.length >= 40, `${signs.length} signs`);
    for (const cell of signs) {
        const parts = cell.meta.t.split(' // ');
        assert.ok(parts.length >= 2 && parts.every(Boolean), cell.meta.t);
        assert.ok(Buffer.byteLength(cell.meta.t) <= 288, `${Buffer.byteLength(cell.meta.t)} bytes: ${cell.meta.t}`);
        if (stateOf(cell.type).mount === 'wall') {
            const [dx, dz] = DIRECTIONS[stateOf(cell.type).facing];
            assert.ok(blocks.registry.solid[idOf(grid.get(`${cell.x - dx},${cell.y},${cell.z - dz}`))], `nothing behind ${cell.meta.t}`);
        }
    }
    const road = signs.find((cell) => cell.z < 20);
    assert.ok(road && road.meta.t.startsWith('Palacio del Volcán') && road.meta.t.includes('Palace of the Volcano'));
});

test('wall pieces have their wall, hanging lights their ceiling, and two-high pieces both halves', () => {
    const wallShapes = new Set(['painting', 'wall_mirror', 'wall_clock', 'wall_shelf', 'curtain', 'banner']);
    const solidAt = (x, y, z) => {
        const type = grid.get(`${x},${y},${z}`);
        return Boolean(type) && type !== 'air' && blocks.registry.solid[idOf(type)] === 1;
    };
    for (const cell of plan.cells) {
        const def = defOf(cell.type);
        const state = stateOf(cell.type);
        const where = `${cell.type} at ${cell.x},${cell.y},${cell.z}`;
        if (wallShapes.has(def.shape)) {
            const [dx, dz] = DIRECTIONS[state.facing];
            assert.ok(solidAt(cell.x - dx, cell.y, cell.z - dz), `no wall behind ${where}`);
        }
        if (def.shape === 'chandelier' || state.mount === 'hanging') assert.ok(solidAt(cell.x, cell.y + 1, cell.z), `nothing above ${where}`);
        if (state.mount === 'floor' || ['candle', 'table_lamp'].includes(def.shape)) {
            const below = grid.get(`${cell.x},${cell.y - 1},${cell.z}`);
            assert.ok(below || cell.y - 1 <= G, `${where} stands on nothing`);
        }
        const shape = def.shape && ctx.BLOCK_SHAPES[def.shape];
        if (shape && shape.linked) {
            for (const [dx, dy, dz] of shape.linked(state)) {
                const other = grid.get(`${cell.x + dx},${cell.y + dy},${cell.z + dz}`);
                assert.ok(other && baseOf(other) === baseOf(cell.type), `incomplete: ${where}`);
            }
        }
    }
});

// ---------------------------------------------------------------------------------------
// Walking and light

test('from the road one walks to every room, every floor, the roof and the top of the keep, without a jump', () => {
    const { cells } = walk();
    const missed = Object.entries(LEVELS).filter(([, at]) => !cells.has(at.join(','))).map(([name, at]) => `${name} (${at})`);
    assert.deepEqual(missed, []);
});

test('the inside is lit at night', () => {
    const world = built();
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
    // Covered: an opaque block somewhere over the head.
    const covered = (x, y, z) => {
        for (let up = y + 2; up < H; up++) {
            const id = world.getBlockId(x, up, z);
            if (id && world.registry.solid[id] && !world.registry.transparent[id]) return true;
        }
        return false;
    };
    const dark = new Set();
    const checked = new Set();
    let indoors = 0;
    for (const [fx, fz, feet] of queue) {
        const x = Math.floor(fx), y = Math.floor(feet), z = Math.floor(fz);
        const key = `${x},${y},${z}`;
        if (checked.has(key)) continue;
        checked.add(key);
        const room = ROOMS.find(([, x0, z0, x1, z1, y0, y1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1 && y >= y0 && y <= y1);
        if (!room || !covered(x, y, z)) continue;
        indoors++;
        if ((levels.get(key) || 0) < 6) dark.add(`${room[0]}: ${key}`);
    }
    assert.ok(indoors > 3000, `${indoors} cells indoors`);
    assert.deepEqual([...dark].sort().slice(0, 200), [], `${dark.size} dark cells`);
});
