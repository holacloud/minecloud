// Node tests for furniture (js/game/furniture.js, seating.js, storage.js, decor.js, mirrors.js): states and
// shapes, what joins what, placement, collisions, light levels, how stained glass is built,
// recipes, inventory icons, sitting, the panel's bookkeeping, and that the guide covers it all.
// Run with: node --test test/js
//
// Every script of index.html runs in one VM context (like the printable guide), with small
// stand-ins for the browser, so the real WorldRenderer, mesher and camera run.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const print = require(path.join(STATIC, 'js', 'guidePrint.js'));

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    applyAxisAngle(axis, angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return this.set(this.x * c + this.z * s, this.y, -this.x * s + this.z * c);
    }
}
class Material {
    constructor(options = {}) { Object.assign(this, options); }
    clone() { return Object.assign(new this.constructor(), this); }
    dispose() {}
}
function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}

const drawn = [];
function canvasStub() {
    const ctx = new Proxy({}, {
        get(target, key) {
            if (key in target) return target[key];
            return (...args) => {
                if (key === 'drawImage') drawn.push(args);
                return { data: new Uint8ClampedArray(4 * 4096 * 16), addColorStop() {} };
            };
        },
        set: (target, key, value) => { target[key] = value; return true; }
    });
    return { width: 16, height: 16, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,' };
}

function loadGame() {
    const storageData = new Map();
    const THREE = new Proxy({
        Vector3, Vector2: Vector3, Vector4: Vector3, MeshLambertMaterial: class extends Material {},
        MeshStandardMaterial: class extends Material {}, MeshBasicMaterial: class extends Material {},
        MultiplyBlending: 'multiply', FrontSide: 'front', DoubleSide: 'double', sRGBEncoding: 'srgb'
    }, { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const context = vm.createContext({
        console: { ...console, warn() {} }, Math, Map, WeakMap, Set, Object, Array, JSON, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array,
        Int8Array, Int16Array, Int32Array, Float32Array, Float64Array,
        performance: { now: () => context.now }, now: 0, THREE, navigator: {}, requestAnimationFrame: () => 0,
        Worker: class { postMessage() {} terminate() {} },
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; } },
        document: { createElement: (tag) => (tag === 'canvas' ? canvasStub() : anyStub()), addEventListener() {}, body: anyStub(), head: anyStub(), getElementById: () => null, querySelector: () => null },
        localStorage: { getItem: (key) => storageData.get(key) ?? null, setItem: (key, value) => storageData.set(key, value), removeItem: (key) => storageData.delete(key) }
    });
    context.window = context;
    vm.runInContext('class Game {}', context);
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1])
        .filter((src) => !/^(https?:)?\/\//.test(src) && !print.SKIP_SCRIPTS.test(src));
    for (const name of ['furniture', 'seating', 'storage', 'appliances', 'smelters', 'decor', 'mirrors']) assert.ok(scripts.includes(`js/game/${name}.js`), `index.html loads ${name}.js`);
    for (const src of scripts) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, LightField, CameraController, BLOCK_SHAPES, TEXTURE_PATTERNS, Game,
        GAME_CONTENT_HOOKS, MODAL_PANELS, FURNITURE_COLORS, STORAGE_KINDS, STORAGE_FREEZERS, ELECTRIC_KINDS, ITEM_TYPES, ANT_FOOD_ITEMS, ANT_FARM_FOODS,
        APPLIANCE_RECIPES, APPLIANCE_FUELS, APPLIANCE_CHILL, APPLIANCE_FREEZE, APPLIANCE_CHILL_SECONDS, APPLIANCE_FREEZE_SECONDS, APPLIANCE_ITEMS,
        applianceOvenTakes, applianceColdTable, applianceSlotProgress, storageSameStacks, storageOvenStatus, storagePercent, DECOR_PAINTINGS, DECOR_GLASS, shapeStateName, constructionTurnType,
        storageClickAmount, storageApplyOutcome, decorClockAngles, decorClockText, seatEyePosition, seatStandOffsets, STORAGE_MAX_STACK, STORAGE_MAX_AMOUNT,
        furnShelfBooks, FURN_SHELF_ROWS, BlockTextureFactory, isSignBlockType, isBedBlockType, ITEM_USE_HANDLERS, bedEyePosition, bedAvatarFeet, SEAT_YAW, getMobSpecies,
        mirrorFacesOf, mirrorViewOf, mirrorFaceCover, mirrorFaceDistance, mirrorFaceSight, mirrorLineClear, mirrorRankPlanes, mirrorPlaneBudget, mirrorPlanesToDraw, mirrorPlaneKey,
        mirrorQuadPositions, mirrorQuadNormals, mirrorTargetSize, mirrorRefreshInterval,
        MIRROR_RANGE, MIRROR_TARGET_MAX, APPLIANCE_FOUNDRY, APPLIANCE_FOUNDRY_FUELS, APPLIANCE_ARC, APPLIANCE_ARC_REDUCER, APPLIANCE_MACHINES,
        applianceMachineTakes, applianceRefusalNote, applianceRecipeLine, storageArcStatus, shapeStateName });`, context);
    return context;
}

const ctx = loadGame();

const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
const PIECES = ['oak_chair', 'birch_chair', 'dark_oak_chair', 'stool', 'bench', 'table', 'bedside_table', 'desk', 'chest', 'barrel', 'wardrobe', 'bookshelf',
    'wall_shelf', 'workbench', 'oven', 'foundry', 'arc_furnace', 'sink', 'fridge', 'chest_freezer', 'toilet', 'bathtub', 'candle', 'lantern', 'table_lamp', 'floor_lamp', 'chandelier', 'wall_clock', 'flower_pot', 'vase',
    'painting_sunset', 'painting_peaks', 'painting_meadow', 'painting_night', 'painting_shapes', 'painting_fish', 'wall_mirror'];
const ITEMS = [...PIECES, ...COLORS.flatMap((c) => [`${c}_sofa`, `${c}_stained_glass`, `${c}_stained_glass_pane`, `${c}_carpet`, `${c}_curtain`])];

function makeWorld() {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    const stone = world.registry.id('stone');
    for (const [cx, cz] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
        const column = new ctx.ChunkColumn(cx, cz);
        for (let lx = 0; lx < 16; lx++) {
            for (let lz = 0; lz < 16; lz++) {
                for (let y = -16; y <= 0; y++) column.set(lx, y, lz, stone);
            }
        }
        world.columns.set(world.chunkKey(cx, cz), column);
    }
    return world;
}
const put = (world, x, y, z, type) => world.getColumnAt(x, z).set(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16, world.registry.id(type));
const near = (a, b) => Math.abs(a - b) < 1e-6;
const contains = (boxes, [x, z]) => boxes.some((box) => x >= box[0] && x <= box[3] && z >= box[2] && z <= box[5]);

test('every item exists, is an item (not a state) and is placeable', () => {
    const world = makeWorld();
    for (const item of ITEMS) {
        const def = world.blockTypes[item];
        assert.ok(def, item);
        assert.ok(!def.variantOf && !def.itemOnly, `${item} is an item you can place`);
        assert.ok(def.name && typeof def.color === 'number', item);
        assert.ok(world.getBreakDurationForType(item) > 0, `${item} breaks`);
        assert.equal(world.getDropTypeForBlock(item), item, `${item} drops itself`);
    }
    // /give and the creative stock take every block that is not a state.
    const give = Object.keys(world.blockTypes).filter((type) => !world.blockTypes[type].variantOf);
    for (const item of ITEMS) assert.ok(give.includes(item), item);
});

test('states expand into the names the chunks store, and drop their item', () => {
    const world = makeWorld();
    assert.deepEqual(['oak_chair', 'oak_chair:e', 'oak_chair:s', 'oak_chair:w'].map((name) => Boolean(world.blockTypes[name])), [true, true, true, true]);
    for (const [state, item] of [['oak_chair:e', 'oak_chair'], ['wardrobe:upper:s', 'wardrobe'], ['oven:e:on', 'oven'], ['lantern:hanging', 'lantern'],
        ['floor_lamp:upper', 'floor_lamp'], ['bathtub:head:n', 'bathtub'], ['red_curtain:w:open', 'red_curtain'], ['red_sofa:w', 'red_sofa']]) {
        assert.equal(world.blockTypes[state].variantOf, item, state);
        assert.equal(world.getDropTypeForBlock(state), item, state);
        assert.equal(world.registry.name(world.registry.id(state)), state);
    }
    // The states of a construction turn with it (js/game/constructions.js).
    const blocks = world.blockTypes;
    assert.equal(ctx.constructionTurnType('oak_chair:e', 1, blocks), 'oak_chair:s');
    assert.equal(ctx.constructionTurnType('oak_chair', 1, blocks), 'oak_chair:e');
    assert.equal(ctx.constructionTurnType('wardrobe:upper:e', 2, blocks), 'wardrobe:upper:w');
    assert.equal(ctx.constructionTurnType('red_curtain:n:open', 1, blocks), 'red_curtain:e:open');
    assert.equal(ctx.constructionTurnType('oven:n:on', 3, blocks), 'oven:w:on');
    assert.equal(ctx.constructionTurnType('bathtub:head:s', 1, blocks), 'bathtub:head:w');
    assert.equal(ctx.constructionTurnType('lantern:hanging', 1, blocks), 'lantern:hanging');
    assert.equal(ctx.constructionTurnType('red_stained_glass_pane', 1, blocks), 'red_stained_glass_pane');
});

test('block types stay under the ids limit, and states reuse materials', () => {
    const world = makeWorld();
    assert.ok(world.registry.names.length < 65536);
    const keys = (prefix) => new Set(Object.keys(world.blockTypes).filter((t) => t === prefix || t.startsWith(`${prefix}:`)).map((t) => world.blockTypes[t].materialKey));
    // Plain wood and wool pieces show the material of what they are made of.
    assert.deepEqual([...keys('oak_chair')], ['planks']);
    assert.deepEqual([...keys('birch_chair')], ['birch_planks']);
    assert.deepEqual([...keys('table')], ['planks']);
    assert.deepEqual([...keys('red_carpet')], ['red_wool']);
    assert.deepEqual([...keys('red_curtain')], ['red_wool']);
    assert.deepEqual([...keys('red_stained_glass_pane')], ['red_stained_glass']);
    // Whatever its facing, a chest adds faces only once.
    const chests = ['chest', 'chest:e', 'chest:s', 'chest:w'].map((type) => world.getMaterial(type));
    const all = new Set(chests.flat());
    assert.equal(all.size, 3, 'side, top and front');
});

test('a front goes on the side the block faces', () => {
    const world = makeWorld();
    const front = world.getMaterial('chest')[5];
    const index = { 'chest': 5, 'chest:e': 0, 'chest:s': 4, 'chest:w': 1 };
    for (const [type, face] of Object.entries(index)) {
        const material = world.getMaterial(type);
        assert.equal(material[face], front, type);
        assert.equal(material.filter((entry) => entry === front).length, 1, type);
    }
    // Lit, only the front of the oven glows.
    const lit = world.getMaterial('oven:s:on');
    assert.ok(lit[4].emissiveIntensity > 0);
    assert.ok(!lit[0].emissiveIntensity);
    assert.ok(!world.getMaterial('oven:s:off')[4].emissiveIntensity);
    // Chunk materials keep sharing across facings too.
    assert.equal(world.getChunkMaterial('chest:e')[1], world.getChunkMaterial('chest:s')[1]);
});

test('tables, benches and sofas join their neighbours', () => {
    const world = makeWorld();
    const id = (type) => world.registry.id(type);
    const shapes = world.shapes;
    const mask = (type, n, e, s, w) => shapes.mask(id(type), id(n), id(e), id(s), id(w));
    assert.equal(mask('table', 'table', 'stone', 'air', 'table'), 1 | 8);
    assert.equal(mask('table', 'oak_chair', 'stone', 'air', 'desk'), 0);
    // On its own a table has four legs and a top; in a row, the inner legs go.
    assert.equal(shapes.boxes(id('table'), 0).length, 5);
    assert.equal(shapes.boxes(id('table'), 2).length, 3);
    assert.equal(shapes.boxes(id('table'), 15).length, 1);
    // A bench faces north, so its neighbours are east and west, and must face the same way.
    assert.equal(mask('bench', 'bench', 'bench', 'bench', 'bench'), 2 | 8);
    assert.equal(mask('bench:e', 'bench:e', 'bench:e', 'bench:e', 'bench:e'), 1 | 4);
    assert.equal(mask('bench', 'air', 'bench:s', 'air', 'bench:e'), 0);
    // A sofa loses its arm and feet on the joined side.
    const alone = shapes.boxes(id('red_sofa'), 0);
    const left = shapes.boxes(id('red_sofa'), 8);
    const both = shapes.boxes(id('red_sofa'), 2 | 8);
    assert.equal(alone.length, 9);
    assert.equal(left.length, 6);
    assert.equal(both.length, 3);
    assert.equal(mask('red_sofa', 'air', 'blue_sofa', 'air', 'air'), 0, 'different colours are different pieces');
    // Stained panes join panes of any colour, glass and solid blocks.
    assert.equal(mask('red_stained_glass_pane', 'blue_stained_glass_pane', 'glass_pane', 'stone', 'white_stained_glass'), 15);
    assert.equal(mask('red_stained_glass_pane', 'air', 'air', 'oak_chair', 'air'), 0);
    // Boxes stay in the cell.
    for (const type of ['bench', 'bench:e', 'red_sofa:s', 'table']) {
        for (let m = 0; m < 16; m++) {
            for (const box of shapes.boxes(id(type), m)) {
                assert.ok(box.every((value) => value >= -1e-9 && value <= 1 + 1e-9) && box[0] < box[3] && box[1] < box[4] && box[2] < box[5], `${type} ${m}`);
            }
        }
    }
});

test('shapes rotate, and fit in their cells', () => {
    const world = makeWorld();
    for (const type of Object.keys(world.blockTypes)) {
        const shapeName = world.blockTypes[type].shape;
        const id = world.registry.id(type);
        if (!ITEMS.includes(world.blockTypes[type].variantOf || type) || !shapeName) continue;
        for (const box of [...world.shapes.boxes(id, 0), ...world.shapes.collision(id, 0)]) {
            assert.ok(box.every((value) => value >= -1e-9 && value <= 1 + 1e-9), `${type}: ${box}`);
            assert.ok(box[0] < box[3] && box[1] < box[4] && box[2] < box[5], `${type}: ${box}`);
        }
    }
    // A chair facing north has its back at +z; facing east, at -x.
    const back = (type) => {
        const boxes = world.shapes.boxes(world.registry.id(type));
        const top = Math.max(...boxes.map((box) => box[4]));
        return boxes.filter((box) => box[4] === top)[0];
    };
    assert.ok(back('oak_chair')[2] > 0.5);
    assert.ok(back('oak_chair:e')[0] < 0.5);
    assert.ok(back('oak_chair:s')[2] < 0.5);
    assert.ok(back('oak_chair:w')[0] > 0.5);
});

test('placing: pieces face the player, walls and ceilings are asked for where they matter', () => {
    const world = makeWorld();
    const place = (type, x, y, z, click) => world.getPlacementBlocks(type, x, y, z, { normal: { x: 0, y: 1, z: 0 }, hit: { x, y, z }, look: { x: 0, y: -0.5, z: -1 }, ...click });
    // Looking north (-z): the chair looks back south.
    assert.deepEqual(JSON.parse(JSON.stringify(place('oak_chair', 3, 1, 3, {}))), [{ x: 3, y: 1, z: 3, blockType: 'oak_chair:s' }]);
    assert.equal(place('oak_chair', 3, 1, 3, { look: { x: 1, y: 0, z: 0 } })[0].blockType, 'oak_chair:w');
    // Wall items face out of the wall clicked (the normal), and refuse floors and ceilings.
    for (const item of ['wall_clock', 'painting_sunset', 'wall_shelf', 'wall_mirror']) {
        assert.equal(place(item, 3, 2, 3, {}), null, `${item} on a floor`);
        assert.equal(place(item, 3, 2, 3, { normal: { x: 0, y: -1, z: 0 } }), null, `${item} on a ceiling`);
        assert.equal(place(item, 3, 2, 3, { normal: { x: 1, y: 0, z: 0 } })[0].blockType, `${item}:e`);
        assert.equal(place(item, 3, 2, 3, { normal: { x: 0, y: 0, z: -1 } })[0].blockType, item, 'north is the default state');
        // Its back touches the wall: a wall to the west of a block facing east is at x = 0.
        const box = world.shapes.boxes(world.registry.id(`${item}:e`))[0];
        assert.ok(near(Math.min(...world.shapes.boxes(world.registry.id(`${item}:e`)).map((b) => b[0])), 0), item);
        assert.ok(box[3] <= 1);
    }
    // Lantern: stands, or hangs from the underside of a block.
    assert.equal(place('lantern', 3, 1, 3, {})[0].blockType, 'lantern');
    assert.equal(place('lantern', 3, 1, 3, { normal: { x: 0, y: -1, z: 0 } })[0].blockType, 'lantern:hanging');
    assert.ok(world.shapes.boxes(world.registry.id('lantern:hanging')).some((box) => near(box[4], 1)), 'its chain reaches the block above');
    // A chandelier only under a block.
    assert.equal(place('chandelier', 3, 1, 3, {}), null);
    put(world, 3, 2, 3, 'stone');
    assert.equal(place('chandelier', 3, 1, 3, { normal: { x: 0, y: -1, z: 0 } })[0].blockType, 'chandelier');
    // Tall pieces need the cell above, and take the same facing.
    assert.equal(place('wardrobe', 3, 1, 3, {}), null);
    const wardrobe = place('wardrobe', 4, 1, 3, {});
    assert.deepEqual(JSON.parse(JSON.stringify(wardrobe.map((part) => [part.y, part.blockType]))), [[1, 'wardrobe:lower:s'], [2, 'wardrobe:upper:s']]);
    assert.deepEqual(JSON.parse(JSON.stringify(place('floor_lamp', 4, 1, 3, {}).map((part) => part.blockType))), ['floor_lamp', 'floor_lamp:upper']);
    // A bathtub: foot here, head beyond it, away from the player, linked both ways.
    const tub = place('bathtub', 5, 1, 3, {});
    assert.deepEqual(JSON.parse(JSON.stringify(tub.map((part) => [part.x, part.z, part.blockType]))), [[5, 3, 'bathtub'], [5, 2, 'bathtub:head:n']]);
    put(world, 6, 1, 2, 'stone');
    assert.equal(place('bathtub', 6, 1, 3, {}), null, 'no room for the head');
    const linked = (type) => ctx.BLOCK_SHAPES[world.blockTypes[type].shape].linked(world.blockTypes[type].state);
    assert.deepEqual(JSON.parse(JSON.stringify(linked('bathtub'))), [[0, 0, -1]]);
    assert.deepEqual(JSON.parse(JSON.stringify(linked('bathtub:head:n'))), [[0, 0, 1]]);
    assert.deepEqual(JSON.parse(JSON.stringify(linked('wardrobe:upper:s'))), [[0, -1, 0]]);
});

test('collisions: seats hold you at seat height, small things let you through, nothing traps you', () => {
    const world = makeWorld();
    const collision = (type) => world.shapes.collision(world.registry.id(type), 0);
    for (const [type] of Object.entries(world.blockTypes).filter(([, def]) => def.seat && !def.variantOf)) {
        const top = Math.max(...collision(type).filter((box) => contains([box], [0.5, 0.5])).map((box) => box[4]));
        assert.ok(near(top, world.blockTypes[type].seat), `${type}: seat ${world.blockTypes[type].seat}, top ${top}`);
    }
    for (const type of ['candle', 'lantern', 'lantern:hanging', 'table_lamp', 'chandelier', 'wall_clock', 'wall_shelf', 'painting_sunset', 'red_curtain', 'red_curtain:e:open']) {
        assert.equal(collision(type).length, 0, type);
        assert.equal(world.registry.solid[world.registry.id(type)], 0, type);
    }
    // A carpet is a step you do not notice; you can walk onto it.
    const camera = { position: new Vector3(), rotation: {} };
    const controller = new ctx.CameraController(camera, {});
    assert.ok(collision('red_carpet')[0][4] < controller.stepHeight);
    // Tables and storage are solid, so you can stand on them and not inside them.
    for (const type of ['table', 'chest', 'wardrobe', 'bedside_table', 'oven', 'workbench']) assert.ok(collision(type).length > 0, type);
    // No piece turns its cell into a full cube for light or faces.
    for (const item of ITEMS) assert.equal(world.registry.fullCube[world.registry.id(item)], 0, item);
    // The bookshelf is a whole block to walk into and stand on, all the same.
    assert.deepEqual(JSON.parse(JSON.stringify(collision('bookshelf:e'))), [[0, 0, 0, 1, 1, 1]]);
});

test('the bookshelf: books of many sizes and colours, with gaps and some leaning, inside the frame', () => {
    const f = new ctx.BlockTextureFactory();
    const seed = f.seedFor('bookshelf', null);
    const books = ctx.FURN_SHELF_ROWS.map((_, row) => ctx.furnShelfBooks(f, seed, row));
    for (const [row, list] of books.entries()) {
        const [top, bottom] = ctx.FURN_SHELF_ROWS[row];
        assert.ok(list.length >= 5, `row ${row}: ${list.length} books`);
        for (const book of list) {
            assert.ok(book.x >= 2 && book.x + book.width <= 30, 'inside the frame');
            assert.ok(book.height > 0 && book.height <= bottom - top, 'under the shelf above');
            assert.ok(book.x + book.lean >= 2, 'its lean stays inside too');
        }
        for (let i = 1; i < list.length; i++) assert.ok(list[i].x >= list[i - 1].x + list[i - 1].width, 'they do not overlap at the foot');
    }
    const all = books.flat();
    assert.ok(new Set(all.map((book) => book.width)).size >= 2);
    assert.ok(new Set(all.map((book) => book.height)).size >= 3);
    assert.ok(new Set(all.map((book) => book.color)).size >= 4);
    assert.ok(new Set(all.map((book) => book.spine)).size >= 3);
    // Over a few seeds gaps and leaning books turn up, and the rows differ.
    let leaning = 0;
    for (let other = 0; other < 8; other++) {
        leaning += [0, 1].flatMap((row) => ctx.furnShelfBooks(f, other, row)).filter((book) => book.lean < 0).length;
        assert.notDeepEqual(ctx.furnShelfBooks(f, other, 0), ctx.furnShelfBooks(f, other + 1, 0));
    }
    assert.ok(leaning >= 4, `${leaning} leaning books`);
    const gaps = (list) => list.some((book, i) => i > 0 && book.x > list[i - 1].x + list[i - 1].width);
    assert.ok([0, 1, 2, 3, 4, 5, 6, 7].some((other) => gaps(ctx.furnShelfBooks(f, other, 1))));
    // Painted at the sizes of normal, RTX and Ultra: the frame stands out, the back of the shelf is
    // deep and dark, and the height map (the normal map) sees the difference.
    for (const size of [32, 128, 256]) {
        const s = f.createSurface(size, size > 32);
        ctx.TEXTURE_PATTERNS.bookshelf.paint(f, s, null, seed);
        const at = (u, v) => Math.floor(v * size) * size + Math.floor(u * size);
        const light = (i) => s.color[i * 3] + s.color[i * 3 + 1] + s.color[i * 3 + 2];
        assert.ok(s.height[at(0.01, 0.5)] > 0.9, 'frame');
        assert.ok(s.height[at(0.5, 0.5)] > 0.8, 'the shelf between the rows');
        let deep = 0;
        const seen = new Set();
        for (let i = 0; i < size * size; i++) {
            if (s.height[i] < 0.1) {
                deep++;
                assert.ok(light(i) < 200, 'the back is dark');
            }
            seen.add(`${Math.round(s.color[i * 3] / 16)},${Math.round(s.color[i * 3 + 1] / 16)},${Math.round(s.color[i * 3 + 2] / 16)}`);
        }
        assert.ok(deep > size * size * 0.05, 'there is depth above the books');
        assert.ok(seen.size > 12, `${seen.size} colours`);
    }
    assert.ok(ctx.TEXTURE_PATTERNS.bookshelf.rtx.normalScale > 1, 'RTX and Ultra feel the relief');
});

test('the bookshelf: books on the side that looks at you, plain wood on the rest; old ones keep theirs', () => {
    const world = makeWorld();
    const place = world.getPlacementBlocks('bookshelf', 3, 1, 3, { normal: { x: 0, y: 1, z: 0 }, hit: { x: 3, y: 1, z: 3 }, look: { x: 0, y: -0.5, z: -1 } });
    assert.equal(place[0].blockType, 'bookshelf:s');
    const front = world.getMaterial('bookshelf:n')[5];
    const planks = world.getMaterial('planks');
    const plain = Array.isArray(planks) ? planks[0] : planks;
    for (const [type, face] of Object.entries({ 'bookshelf:e': 0, 'bookshelf:w': 1, 'bookshelf:s': 4, 'bookshelf:n': 5 })) {
        const material = world.getMaterial(type);
        assert.equal(material[face], front, type);
        assert.equal(material.filter((entry) => entry === front).length, 1, type);
        assert.equal(world.getDropTypeForBlock(type), 'bookshelf');
    }
    assert.equal(world.getFaceTextureSpecs('bookshelf:e').top.pattern, 'planks');
    assert.equal(world.getFaceTextureSpecs('bookshelf:e').side.pattern, 'planks');
    assert.ok(plain, 'planks exist');
    // What a saved world has under the plain name stays as it was, and stays put when a build turns.
    assert.equal(world.getFaceTextureSpecs('bookshelf').side.pattern, 'bookshelf');
    assert.equal(world.getFaceTextureSpecs('bookshelf').top.pattern, 'planks');
    assert.equal(ctx.constructionTurnType('bookshelf', 1, world.blockTypes), 'bookshelf');
    assert.equal(ctx.constructionTurnType('bookshelf:e', 1, world.blockTypes), 'bookshelf:s');
});

test('lights use the block-light system, each at its level, with no power', () => {
    const world = makeWorld();
    const emitting = { candle: 9, table_lamp: 12, lantern: 13, 'lantern:hanging': 13, 'floor_lamp:upper': 14, chandelier: 14, 'oven:n:on': 11 };
    for (const [type, level] of Object.entries(emitting)) {
        assert.equal(world.registry.lightEmitter[world.registry.id(type)], 1, type);
        assert.equal(world.registry.lightLevel[world.registry.id(type)], level, type);
    }
    for (const type of ['oven', 'oven:e', 'floor_lamp', 'chest']) assert.equal(world.registry.lightEmitter[world.registry.id(type)], 0, type);
    assert.equal(world.registry.lightLevel[world.registry.id('torch')], 14, 'a torch as ever');
    assert.equal(world.blockTypes.candle.electric, undefined);

    put(world, 8, 3, 8, 'candle');
    const field = new ctx.LightField(world, 0, 0);
    assert.equal(field.get(8, 3, 8), 9);
    assert.equal(field.get(9, 3, 8), 8);
    assert.equal(field.get(8, 3, 11), 6);
    assert.equal(field.get(8, 3, 15), 2);
    // A brighter light beside it wins cell by cell.
    put(world, 12, 3, 8, 'lantern');
    const both = new ctx.LightField(world, 0, 0);
    assert.equal(both.get(12, 3, 8), 13);
    assert.equal(both.get(11, 3, 8), 12);
    assert.equal(both.get(8, 3, 8), 9, 'level 13 - 4 = 9');
});

test('stained glass is a filter in its own mesh, in every graphics mode', () => {
    for (const mode of ['normal', 'rtx', 'ultra']) {
        const world = makeWorld();
        if (mode !== 'normal') world.setRTXMode(true);
        if (mode === 'ultra') world.setUltraMode(true);
        for (const type of ['red_stained_glass', 'red_stained_glass_pane']) {
            const material = world.getChunkMaterial(type);
            assert.equal(material.blending, 'multiply', `${mode} ${type}`);
            assert.equal(material.transparent, true);
            assert.equal(material.depthWrite, false, 'it hides nothing behind it');
            assert.equal(material.fog, false);
            assert.equal(material.toneMapped, false);
            assert.equal(material.side, 'front', 'each ray filtered once per pane');
            assert.ok(!material.onBeforeCompile && !material.vertexColors, 'no baked light or ambient occlusion');
            assert.ok(material.map);
            assert.ok(material.constructor.name.length > 0);
        }
        assert.equal(world.getChunkMaterial('red_stained_glass'), world.getChunkMaterial('red_stained_glass_pane'), 'a pane shares its glass');
        assert.notEqual(world.getChunkMaterial('red_stained_glass'), world.getChunkMaterial('blue_stained_glass'));
    }

    const world = makeWorld();
    put(world, 3, 1, 3, 'red_stained_glass');
    put(world, 5, 1, 5, 'red_stained_glass_pane');
    put(world, 7, 1, 7, 'glass');
    const result = world.mesher.build(0, 0);
    const material = world.getChunkMaterial('red_stained_glass');
    assert.deepEqual(result.glass.map((bucket) => bucket.material), [material], 'only stained glass, in one bucket');
    assert.ok(!result.buckets.some((bucket) => bucket.material === material));
    assert.ok(result.glass[0].vertexCount > 0);
    // Plain glass stays as it was.
    assert.ok(result.buckets.some((bucket) => bucket.material === world.getChunkMaterial('glass')));

    // Light and sky pass; and a cube of it never stops panes joining it.
    const id = world.registry.id('red_stained_glass');
    assert.equal(world.registry.transparent[id], 1);
    assert.equal(world.registry.fullCube[id], 0);
    assert.equal(world.registry.filterGlass[id], 1);
    assert.equal(world.registry.filterGlass[world.registry.id('glass')], 0);
    // Only the faces toward air exist between glass of the same colour.
    put(world, 4, 1, 3, 'red_stained_glass');
    const joined = world.mesher.build(0, 0).glass[0];
    assert.ok(joined.positions.length > 0);
    assert.equal(ctx.DECOR_GLASS.length, 16);
    // The filter never blocks everything: even black lets a little through.
    for (const [, filter] of ctx.DECOR_GLASS) assert.ok(Math.max((filter >> 16) & 255, (filter >> 8) & 255, filter & 255) >= 0x50);
});

test('every item has a survival recipe from materials that exist', () => {
    const recipes = [];
    const game = new ctx.Game();
    const world = makeWorld();
    for (const hook of ctx.GAME_CONTENT_HOOKS) {
        // Only this feature's recipes matter here; other hooks may need a full game.
        const source = hook.toString();
        if (!/furnit|FURNITURE|DECOR_GLASS|Build Chest|Build Foundry|Stain|Wall Mirrors/.test(source)) continue;
        hook.call(game, { addItem() {}, addRecipe: (id, name, output, amount, inputs) => recipes.push({ id, name, output, amount, inputs }) });
    }
    const outputs = new Set(recipes.map((recipe) => recipe.output));
    for (const item of ITEMS) assert.ok(outputs.has(item), `recipe for ${item}`);
    const ids = recipes.map((recipe) => recipe.id);
    assert.equal(new Set(ids).size, ids.length, 'recipe ids are unique');
    for (const recipe of recipes) {
        assert.ok(recipe.amount >= 1 && recipe.name);
        assert.ok(recipe.inputs.length > 0, recipe.id);
        for (const input of recipe.inputs) {
            assert.ok(world.blockTypes[input.type], `${recipe.id}: ${input.type}`);
            assert.ok(input.amount >= 1);
        }
    }
    // No new base materials: everything but stained glass is made of what the game already had,
    // and stained glass of glass plus an element.
    const made = new Set(ITEMS);
    for (const recipe of recipes) {
        for (const input of recipe.inputs) {
            if (made.has(input.type)) assert.match(input.type, /stained_glass$/, `${recipe.id} uses ${input.type}`);
        }
    }
    const inputs = (id) => recipes.find((recipe) => recipe.id === id).inputs.map((input) => input.type).join(' ');
    assert.equal(inputs('blue_stained_glass'), 'glass element_co');
    assert.equal(inputs('cyan_stained_glass'), 'glass element_cu');
    // The mirror cube is the old block of the chemistry bench, now also in the C panel.
    assert.equal(inputs('mirror'), 'glass element_ag');
    assert.equal(inputs('wall_mirror'), 'mirror planks');
});

test('inventory icons draw every piece, and show a front where it has one', () => {
    const world = makeWorld();
    for (const item of ITEMS) {
        drawn.length = 0;
        assert.equal(world.getInventoryIconUrl(item), 'data:image/png;base64,', item);
        assert.ok(drawn.length > 0, `${item} draws something`);
        for (const args of drawn) {
            assert.ok(args.slice(1).every((value) => Number.isFinite(value)), `${item}: ${args.slice(1)}`);
        }
    }
    // Materials and icons exist for the three modes.
    const rtx = makeWorld();
    rtx.setRTXMode(true);
    assert.ok(rtx.getInventoryIconUrl('chest'));
    // The chest's icon shows its front on the face to the left.
    const spied = makeWorld();
    const seen = [];
    const generate = spied.generateFaceCanvas.bind(spied);
    spied.generateFaceCanvas = (spec) => { seen.push(spec.pattern); return generate(spec); };
    spied.getInventoryIconUrl('chest');
    assert.ok(seen.includes('chest_front') && seen.includes('chest_side') && seen.includes('chest_top'));
    // Each pattern the blocks name exists.
    for (const item of ITEMS) {
        const faces = spied.getFaceTextureSpecs(item);
        for (const face of Object.values(faces)) {
            if (face) assert.ok(spied.textureFactory.patterns()[face.pattern], `${item}: ${face.pattern}`);
        }
    }
});

// A game with just what sitting needs.
function makeSittingGame() {
    const world = makeWorld();
    const camera = { position: new Vector3(3.5, 1 + 1.62, 7), rotation: {} };
    const controller = new ctx.CameraController(camera, {});
    // In the world: the movement keys are the player's only with the pointer locked.
    controller.isLocked = true;
    controller.setCollisionBoxGetter((x, y, z) => world.getCollisionBoxes(x, y, z));
    controller.setBlockTypeGetter((x, y, z) => world.getBlockTypeAt(x, y, z));
    controller.spawnSettling = false;
    const game = new ctx.Game();
    const messages = [];
    Object.assign(game, {
        world, cameraController: controller, camera, otherPlayerMeshes: new Map(),
        getBlockDisplayName: (type) => world.blockTypes[type].name,
        getInteractionRay: () => ({ direction: new Vector3(0, 0, -1) }),
        playPlaceSound() {}, receiveSystemMessage: (message) => messages.push(message.text)
    });
    return { world, game, controller, camera, messages };
}

test('sitting: right click sits, no walking, Sneak stands you in front of the seat', () => {
    const { world, game, controller, camera } = makeSittingGame();
    put(world, 3, 1, 3, 'oak_chair:e');
    assert.equal(game.seatTrySit({ x: 3, y: 1, z: 3 }), true);
    assert.ok(game.seated);
    const eye = ctx.seatEyePosition(3, 1, 3, 0.5, 1.62);
    assert.ok(near(camera.position.y, eye.y) && near(camera.position.x, 3.5) && near(camera.position.z, 3.5));
    assert.ok(eye.y < 1 + 1.62, 'lower than standing on the floor');
    // Sitting turns you the way the chair looks (east, -PI/2).
    assert.ok(near(controller.yaw, -Math.PI / 2));

    // The keys and the touch joystick do nothing, and neither does a jump or a knock.
    controller.keys.forward = true;
    controller.moveInput.y = 1;
    controller.keys.jump = true;
    controller.knockbackX = 5;
    for (let i = 0; i < 30; i++) controller.update(1 / 30);
    assert.ok(near(camera.position.x, 3.5) && near(camera.position.z, 3.5) && near(camera.position.y, eye.y), 'did not move');
    controller.keys.forward = false;
    controller.keys.jump = false;
    controller.moveInput.y = 0;
    // Looking still works.
    controller.addLookDelta(100, 0);
    const before = controller.yaw;
    controller.update(1 / 30);
    assert.ok(!near(before - 100 * controller.lookSpeed, before));

    assert.equal(game.getMountState && game.getMountState().key, 'seat');
    game.seatStandUp();
    assert.equal(game.seated, null);
    assert.equal(controller.seat, null);
    assert.ok(near(camera.position.x, 4.5) && near(camera.position.z, 3.5), 'in front of the chair');
    assert.ok(near(camera.position.y, 1 + 1.62), 'on the floor');
    assert.equal(game.getMountState(), null);
});

test('sitting: a seat that goes, or moves, releases the player', () => {
    for (const change of ['air', 'stone', 'ram_arm:e:plain']) {
        const { world, game, controller, camera } = makeSittingGame();
        put(world, 3, 1, 3, 'oak_chair');
        game.seatTrySit({ x: 3, y: 1, z: 3 });
        game.seatUpdate();
        assert.ok(game.seated, 'still sitting while it stands');
        put(world, 3, 1, 3, change);
        game.seatUpdate();
        assert.equal(game.seated, null, change);
        assert.equal(controller.seat, null);
        for (let i = 0; i < 40; i++) controller.update(1 / 30);
        assert.ok(camera.position.y - 1.62 >= 1 - 1e-6, 'not stuck below the floor');
    }
    // The same chair turned another way still holds you.
    const { world, game } = makeSittingGame();
    put(world, 3, 1, 3, 'oak_chair');
    game.seatTrySit({ x: 3, y: 1, z: 3 });
    put(world, 3, 1, 3, 'oak_chair:e');
    game.seatUpdate();
    assert.ok(game.seated);
    // A teleport ends it.
    game.cameraController.setPosition({ x: 20, y: 30, z: 20 });
    game.seatUpdate();
    assert.equal(game.seated, null);
});

test('sitting: no room under a roof, and other blocks are not seats', () => {
    const { world, game, messages } = makeSittingGame();
    put(world, 3, 1, 3, 'stool');
    put(world, 3, 2, 3, 'stone');
    assert.equal(game.seatTrySit({ x: 3, y: 1, z: 3 }), true);
    assert.equal(game.seated, undefined);
    assert.match(messages[0], /no room/);
    put(world, 5, 1, 3, 'table');
    assert.equal(game.seatTrySit({ x: 5, y: 1, z: 3 }), false);
    for (const seat of ['oak_chair', 'birch_chair', 'dark_oak_chair', 'stool', 'bench', 'red_sofa', 'toilet']) assert.ok(world.blockTypes[seat].seat > 0, seat);
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.seatStandOffsets('n')[0])), [0, -1]);
});

// A game with just what the storage panel's bookkeeping needs; the panel itself is not built.
function makeStorageGame() {
    const sent = [];
    const game = new ctx.Game();
    const counts = { stone: 10, dirt: 5 };
    Object.assign(game, {
        world: makeWorld(), inventoryCounts: counts, inventory: ['stone', 'dirt'], network: { connected: true, send: (type, payload) => sent.push({ type, payload }), on() {} },
        getInventoryCount: (type) => counts[type] || 0,
        addInventory(type, amount) { counts[type] = (counts[type] || 0) + amount; },
        updateHotbarCounts() {}, refreshHeldItemMesh() {}, renderCraftingPanel() {}, renderInventoryPanel() {}, saveInventoryState() {},
        playPickupSound() {}, recapturePointerLock() {}, cameraController: { camera: { position: new Vector3(0, 1, 0) } },
        storageAt: { x: 0, y: 1, z: 0 }, storageMode: 0, storageSlots: [{ type: 'iron_ore', count: 7 }, {}]
    });
    game.storageLoadPending();
    return { game, sent, counts };
}

test('storage: items leave the inventory first, and what does not land comes back', () => {
    const { game, sent, counts } = makeStorageGame();
    game.storagePut('stone');
    assert.equal(counts.stone, 0, 'out at once');
    const [{ type, payload }] = sent;
    assert.equal(type, 'storagePut');
    assert.equal(payload.amount, 10);
    assert.match(payload.reqId, /^[A-Za-z0-9_-]{8,64}$/);
    assert.equal(game.storagePending.size, 1);
    // Only 7 fitted.
    game.storageOnResult({ reqId: payload.reqId, type: 'stone', amount: 7 });
    assert.equal(counts.stone, 3);
    assert.equal(game.storagePending.size, 0);
    // The same answer again does not pay twice.
    game.storageOnResult({ reqId: payload.reqId, type: 'stone', amount: 0 });
    assert.equal(counts.stone, 3);
    // Refused altogether (the chest was broken first): everything back.
    sent.length = 0;
    game.storageMode = 1;
    game.storagePut('dirt');
    assert.equal(counts.dirt, 4);
    game.storageOnResult({ reqId: sent[0].payload.reqId, amount: 0, reason: 'not a storage block' });
    assert.equal(counts.dirt, 5);
    // An answer that claims more than was asked cannot create items.
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.storageApplyOutcome({ op: 'take', amount: 2 }, 999))), { give: 2, moved: 2 });
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.storageApplyOutcome({ op: 'put', amount: 2 }, 999))), { give: 0, moved: 2 });
});

test('storage: taking adds only what the server says left the chest', () => {
    const { game, sent, counts } = makeStorageGame();
    game.storageMode = 10;
    game.storageTake(0);
    assert.equal(counts.iron_ore, undefined, 'nothing yet');
    assert.deepEqual(JSON.parse(JSON.stringify(sent[0].payload)), { x: 0, y: 1, z: 0, slot: 0, type: 'iron_ore', amount: 7, reqId: sent[0].payload.reqId });
    // Another player got there first and left 3.
    game.storageOnResult({ reqId: sent[0].payload.reqId, type: 'iron_ore', amount: 3 });
    assert.equal(counts.iron_ore, 3);
    // Empty slots, and clicks with no connection, send nothing.
    sent.length = 0;
    game.storageTake(1);
    game.network.connected = false;
    game.storageTake(0);
    game.storagePut('stone');
    assert.equal(sent.length, 0);
    assert.equal(counts.stone, 10);
});

test('storage: late answers are asked about, and survive a reload', () => {
    const { game, sent, counts } = makeStorageGame();
    ctx.now = 1000;
    game.storageMode = 0;
    game.storagePut('stone');
    const reqId = sent[0].payload.reqId;
    sent.length = 0;
    game.storageListening = true;
    game.storageAt = null;
    game.storageUpdate();
    assert.equal(sent.length, 0, 'not late yet');
    ctx.now = 6000;
    game.storageUpdate();
    assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), { type: 'storageSync', payload: { reqIds: [reqId] } });
    sent.length = 0;
    game.storageUpdate();
    assert.equal(sent.length, 0, 'not every frame');

    // A reload before the answer: the move is still known, and asked about at once.
    const reloaded = makeStorageGame();
    assert.equal(reloaded.game.storagePending.get(reqId).amount, 10);
    reloaded.counts.stone = 0;
    reloaded.game.storageAt = null;
    reloaded.game.storageListening = true;
    reloaded.game.storageUpdate();
    assert.equal(reloaded.sent[0].type, 'storageSync');
    reloaded.game.storageOnResult({ reqId, amount: 0, reason: 'lost' });
    assert.equal(reloaded.counts.stone, 10);
    assert.equal(makeStorageGame().game.storagePending.size, 0, 'and forgotten');
    ctx.now = 0;
});

test('storage: the panel closes when the chest goes or the player leaves, and is a modal panel', () => {
    const { game, sent } = makeStorageGame();
    put(game.world, 0, 1, 0, 'chest');
    game.storageListening = true;
    game.storageUpdate();
    assert.ok(game.storageAt);
    game.cameraController.camera.position.set(30, 1, 0);
    game.storageUpdate();
    assert.equal(game.storageAt, null);
    assert.deepEqual(sent.map((message) => message.type), ['storageClose']);

    game.storageAt = { x: 0, y: 1, z: 0 };
    game.cameraController.camera.position.set(0, 1, 0);
    put(game.world, 0, 1, 0, 'air');
    game.storageUpdate();
    assert.equal(game.storageAt, null);

    game.storageAt = { x: 0, y: 1, z: 0 };
    assert.ok(ctx.MODAL_PANELS.some((panel) => panel.isOpen.call(game)));
    game.storageOnClosed({ x: 0, y: 0, z: 0 });
    assert.equal(game.storageAt, null, 'a wardrobe closes from its lower cell');
    assert.ok(!ctx.MODAL_PANELS.some((panel) => panel.isOpen.call(game)));
});

test('storage: a late snapshot is ignored, contents of another chest too', () => {
    const { game } = makeStorageGame();
    game.storageRev = 5;
    game.storageOnContents({ x: 0, y: 1, z: 0, rev: 4, slots: [{ type: 'dirt', count: 1 }] });
    assert.equal(game.storageSlots[0].type, 'iron_ore');
    game.storageOnContents({ x: 9, y: 1, z: 0, rev: 6, slots: [{ type: 'dirt', count: 1 }] });
    assert.equal(game.storageSlots[0].type, 'iron_ore');
    game.storageOnContents({ x: 0, y: 1, z: 0, rev: 6, slots: [{ type: 'dirt', count: 1 }] });
    assert.equal(game.storageSlots[0].type, 'dirt');
});

test('storage: what a broken chest held lands as pickups, unknown items are skipped', () => {
    const { game } = makeStorageGame();
    const spawned = [];
    game.spawnPickup = (type, position, amount) => spawned.push([type, amount]);
    game.storageOnDrop({ x: 1, y: 2, z: 3, items: [{ type: 'stone', count: 7 }, { type: 'no_such_item', count: 2 }, { type: 'dirt', count: 0 }] });
    assert.deepEqual(spawned, [['stone', 7]]);
});

test('storage sizes match the server, and everything of two cells stays out of the rams', () => {
    const world = makeWorld();
    const go = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'storage.go'), 'utf8');
    const start = go.indexOf('var storageKinds');
    const kinds = {};
    for (const [, id, slots] of go.slice(start, go.indexOf('\n}\n', start)).matchAll(/"(\w+)":\s*(\d+)/g)) kinds[id] = Number(slots);
    assert.deepEqual(kinds, JSON.parse(JSON.stringify(ctx.STORAGE_KINDS)));
    for (const [id, slots] of Object.entries(kinds)) assert.equal(world.blockTypes[id].storageSlots, slots, id);
    assert.ok(kinds.wardrobe > kinds.chest && kinds.chest > kinds.barrel);
    assert.equal(Number(go.match(/storageMaxStack\s*=\s*(\d+)/)[1]), ctx.STORAGE_MAX_STACK);
    assert.equal(Number(go.match(/storageMaxAmount\s*=\s*(\d+)/)[1]), ctx.STORAGE_MAX_AMOUNT);
    assert.equal(ctx.storageClickAmount(0, 25), 25);
    assert.equal(ctx.storageClickAmount(10, 25), 10);
    assert.equal(ctx.storageClickAmount(10, 4), 4);
    assert.equal(ctx.storageClickAmount(0, 123456), ctx.STORAGE_MAX_AMOUNT);

    const mech = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'mechanics.go'), 'utf8');
    const fixed = mech.slice(mech.indexOf('var mechFixed'), mech.indexOf('\n}\n', mech.indexOf('var mechFixed')));
    const twoCells = new Set(Object.values(world.blockTypes).filter((def) => ITEMS.includes(def.variantOf) && ctx.BLOCK_SHAPES[def.shape] && ctx.BLOCK_SHAPES[def.shape].linked).map((def) => def.variantOf));
    assert.deepEqual([...twoCells].sort(), ['bathtub', 'floor_lamp', 'fridge', 'wardrobe']);
    for (const name of [...twoCells, ...Object.keys(kinds)]) assert.ok(fixed.includes(`"${name}": true`), name);
});

test('appliances: the tables match the server', () => {
    const go = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'appliances.go'), 'utf8');
    const table = (name) => {
        const start = go.indexOf(`var ${name} =`);
        assert.ok(start >= 0, name);
        return go.slice(start, go.indexOf('\n}\n', start));
    };
    const recipes = {};
    for (const [, food, out, amount, seconds] of table('ovenRecipes').matchAll(/"(\w+)":\s*\{Out: "(\w+)", In: (\d+), Seconds: (\d+)\}/g)) {
        recipes[food] = { out, in: Number(amount), seconds: Number(seconds) };
    }
    assert.deepEqual(recipes, JSON.parse(JSON.stringify(ctx.APPLIANCE_RECIPES)));
    const fuels = {};
    for (const [, fuel, seconds] of table('ovenFuels').matchAll(/"(\w+)":\s*(\d+)/g)) fuels[fuel] = Number(seconds);
    assert.deepEqual(fuels, JSON.parse(JSON.stringify(ctx.APPLIANCE_FUELS)));
    const changes = (name) => Object.fromEntries([...table(name).matchAll(/"(\w+)":\s*"(\w+)"/g)].map(([, from, to]) => [from, to]));
    assert.deepEqual(changes('chillChanges'), JSON.parse(JSON.stringify(ctx.APPLIANCE_CHILL)));
    assert.deepEqual(changes('freezeChanges'), JSON.parse(JSON.stringify(ctx.APPLIANCE_FREEZE)));
    assert.equal(Number(go.match(/chillSeconds\s*=\s*(\d+)/)[1]), ctx.APPLIANCE_CHILL_SECONDS);
    assert.equal(Number(go.match(/freezeSeconds\s*=\s*(\d+)/)[1]), ctx.APPLIANCE_FREEZE_SECONDS);

    const storage = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'storage.go'), 'utf8');
    const start = storage.indexOf('var storageFreezers');
    const freezers = {};
    for (const [, id, slots] of storage.slice(start, storage.indexOf('\n}\n', start)).matchAll(/"(\w+)":\s*(\d+)/g)) freezers[id] = Number(slots);
    assert.deepEqual(freezers, JSON.parse(JSON.stringify(ctx.STORAGE_FREEZERS)));
});

test('appliances: every item in the tables exists; fuels burn in the right order; nothing stays frozen for ever', () => {
    const world = makeWorld();
    for (const [food, recipe] of Object.entries(ctx.APPLIANCE_RECIPES)) {
        assert.ok(world.blockTypes[food], food);
        assert.ok(world.blockTypes[recipe.out], recipe.out);
        assert.ok(!ctx.APPLIANCE_FUELS[food], `${food} is food and fuel`);
    }
    for (const fuel of Object.keys(ctx.APPLIANCE_FUELS)) assert.ok(world.blockTypes[fuel], fuel);
    assert.ok(ctx.APPLIANCE_FUELS.coal_ore > ctx.APPLIANCE_FUELS.planks && ctx.APPLIANCE_FUELS.planks > ctx.APPLIANCE_FUELS.wood);
    for (const [from, to] of [...Object.entries(ctx.APPLIANCE_CHILL), ...Object.entries(ctx.APPLIANCE_FREEZE)]) {
        assert.ok(world.blockTypes[from], from);
        assert.ok(world.blockTypes[to], to);
    }
    for (const frozen of Object.values(ctx.APPLIANCE_FREEZE)) assert.ok(ctx.APPLIANCE_RECIPES[frozen], `no oven thaws ${frozen}`);
    assert.ok(ctx.applianceOvenTakes('raw_fish') && ctx.applianceOvenTakes('birch_planks') && ctx.applianceOvenTakes('ice'));
    assert.ok(!ctx.applianceOvenTakes('stone') && !ctx.applianceOvenTakes('cold_water'));
});

test('appliances: new items are ordinary items, with icons, food and a stock', () => {
    const world = makeWorld();
    const added = [];
    const game = new ctx.Game();
    for (const hook of ctx.GAME_CONTENT_HOOKS) {
        try { hook.call(game, { addItem: (item) => added.push(item), addRecipe() {} }); } catch (_error) { /* hooks that need a whole game */ }
    }
    for (const [id, item] of Object.entries(ctx.APPLIANCE_ITEMS)) {
        const def = world.blockTypes[id];
        assert.ok(def && def.itemOnly, `${id} is an item`);
        assert.ok(def.name && typeof def.drawIcon === 'function' && typeof def.consume === 'function', id);
        assert.ok(added.includes(id), `${id} joins the inventory (and so the creative stock)`);
        assert.ok(item.frozen ? !item.food : item.food > 0, id);
    }
    // A cold drink heals somewhat more than the normal one.
    for (const [from, to] of Object.entries(ctx.APPLIANCE_CHILL)) {
        assert.ok(ctx.APPLIANCE_ITEMS[to].food > { water_flask: 2, milk: 2, soda_water: 3 }[from], to);
        assert.equal(ctx.APPLIANCE_ITEMS[to].bottle, true, to);
    }
    assert.ok(ctx.APPLIANCE_ITEMS.cold_milk.cures, 'cold milk still cures');
    assert.ok(ctx.ANT_FOOD_ITEMS.includes('roast_mushroom') && ctx.ANT_FARM_FOODS.roast_mushroom > 0);
    for (const id of Object.keys(ctx.APPLIANCE_ITEMS).filter((item) => ctx.APPLIANCE_ITEMS[item].frozen)) {
        assert.ok(!ctx.ANT_FOOD_ITEMS.includes(id), `${id} is frozen: no one eats it`);
    }
});

test('appliances: frozen food says it needs thawing and is not used up; a cold drink heals and gives the glass back', () => {
    const game = new ctx.Game();
    const messages = [];
    let eaten = 0;
    const gained = [];
    Object.assign(game, {
        health: 10, maxHealth: 20, poison: { tick: 1 },
        receiveSystemMessage: ({ text }) => messages.push(text),
        consumeSelectedBlock: () => { eaten++; return true; },
        updateHealthUI() {}, playNoiseBurst() {}, playTone() {},
        addInventory: (type, amount) => gained.push([type, amount])
    });
    for (const id of ['ice', 'frozen_fish', 'frozen_cooked_fish', 'frozen_bread']) {
        assert.equal(game.applianceConsume(id), true);
        assert.match(messages.at(-1), /thaw/);
    }
    assert.equal(eaten, 0);
    assert.equal(game.health, 10);
    game.applianceConsume('cold_water');
    assert.equal(game.health, 13);
    assert.deepEqual(gained, [['glass', 1]]);
    assert.ok(game.poison, 'water does not cure');
    game.applianceConsume('cold_milk');
    assert.equal(game.health, 16);
    assert.equal(game.poison, null);
    game.applianceConsume('roast_mushroom');
    assert.equal(game.health, 20);
    assert.equal(gained.length, 2, 'food has no glass');
    assert.equal(eaten, 3);
    // Full: nothing used.
    game.applianceConsume('cold_soda');
    assert.equal(eaten, 3);
    assert.match(messages.at(-1), /full health/);
});

test('appliances: the blocks: storage, electricity, recipes, and the oven no longer toggles', () => {
    const world = makeWorld();
    assert.equal(ctx.BLOCK_SHAPES.oven.toggle, undefined, 'a right click opens it, nothing lights it by hand');
    assert.equal(world.blockTypes['oven:e:on'].storageSlots, 3);
    assert.equal(world.blockTypes['oven:e:off'].storageSlots, 3);
    assert.equal(world.blockTypes['oven:e:on'].dropType ?? 'oven', 'oven');
    assert.equal(world.blockTypes['fridge:upper:e'].storageSlots, 18);
    assert.equal(ctx.STORAGE_KINDS.chest_freezer, 36);
    for (const kind of ['fridge', 'chest_freezer']) {
        assert.ok(world.blockTypes[kind].electric, kind);
        assert.equal(ctx.ELECTRIC_KINDS[kind].role, 'consumer');
        assert.equal(ctx.ELECTRIC_KINDS[kind].watts, 30);
        assert.ok(!ctx.ELECTRIC_KINDS[kind].switch, 'no :on in a name that holds half and facing');
    }
    assert.ok(!world.blockTypes.oven.electric, 'the oven burns fuel');
    assert.ok(world.registry.lightEmitter[world.registry.id('oven:e:on')] > 0);
    assert.equal(world.registry.lightEmitter[world.registry.id('oven:e:off')], 0);
    assert.equal(world.registry.lightEmitter[world.registry.id('oven')], 0);
    const recipes = new Map();
    const game = new ctx.Game();
    for (const hook of ctx.GAME_CONTENT_HOOKS) {
        try { hook.call(game, { addItem() {}, addRecipe: (id, _name, output, amount, inputs) => recipes.set(id, { output, amount, inputs }) }); } catch (_error) { /* hooks that need a whole game */ }
    }
    assert.equal(recipes.get('chest_freezer').output, 'chest_freezer');
    for (const { type } of recipes.get('chest_freezer').inputs) assert.ok(world.blockTypes[type], type);
    assert.ok(recipes.has('cook_fish'), 'the old recipe stays, as another way to cook');
});

test('smelters: the tables match the server', () => {
    const go = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'appliances.go'), 'utf8');
    const table = (name) => {
        const start = go.indexOf(`var ${name} =`);
        assert.ok(start >= 0, name);
        return go.slice(start, go.indexOf('\n}\n', start));
    };
    const recipes = (name) => {
        const found = {};
        for (const [, food, fields] of table(name).matchAll(/"(\w+)":\s*\{([^}]*)\}/g)) {
            const recipe = { out: fields.match(/Out: "(\w+)"/)[1], in: Number(fields.match(/In: (\d+)/)[1]), seconds: Number(fields.match(/Seconds: (\d+)/)[1]) };
            const coal = fields.match(/Coal: (\d+)/);
            if (coal) recipe.coal = Number(coal[1]);
            recipe.yield = Number(fields.match(/Yield: (\d+)/)[1]);
            found[food] = recipe;
        }
        return found;
    };
    const sorted = (object) => Object.fromEntries(Object.entries(object).map(([key, entry]) => [key, { ...entry }]));
    assert.deepEqual(recipes('foundryRecipes'), sorted(JSON.parse(JSON.stringify(ctx.APPLIANCE_FOUNDRY))));
    assert.deepEqual(recipes('arcRecipes'), sorted(JSON.parse(JSON.stringify(ctx.APPLIANCE_ARC))));
    const fuels = {};
    for (const [, fuel, seconds] of table('foundryFuels').matchAll(/"(\w+)":\s*(\d+)/g)) fuels[fuel] = Number(seconds);
    assert.deepEqual(fuels, JSON.parse(JSON.stringify(ctx.APPLIANCE_FOUNDRY_FUELS)));
    assert.equal(go.match(/arcReducer = "(\w+)"/)[1], ctx.APPLIANCE_ARC_REDUCER);
    // The refusals the panel explains are those the server sends.
    const entries = [...table('machines').matchAll(/(\w+Kind):\s*\{Name: "([\w ]+)"/g)];
    assert.equal(entries.length, Object.keys(ctx.APPLIANCE_MACHINES).length);
    for (const [, constant, name] of entries) {
        const kind = go.match(new RegExp(`${constant}\\s*= "(\\w+)"`))[1];
        assert.equal(ctx.APPLIANCE_MACHINES[kind].refused, `not for the ${name}`);
        assert.ok(ctx.applianceRefusalNote(`not for the ${name}`));
    }
    assert.equal(ctx.applianceRefusalNote('full'), null);
    const mech = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'mechanics.go'), 'utf8');
    for (const kind of ['foundry', 'arc_furnace']) assert.ok(mech.includes(`"${kind}": true`), kind);
});

test('smelters: every item in the tables exists, the machines beat the C menu, and each panel lists only what fits', () => {
    const world = makeWorld();
    for (const table of [ctx.APPLIANCE_FOUNDRY, ctx.APPLIANCE_ARC]) {
        for (const [item, recipe] of Object.entries(table)) {
            assert.ok(world.blockTypes[item], item);
            assert.ok(world.blockTypes[recipe.out], recipe.out);
            assert.ok(world.blockTypes[recipe.out].drawIcon || world.blockTypes[recipe.out].color !== undefined, recipe.out);
        }
    }
    assert.ok(world.blockTypes[ctx.APPLIANCE_ARC_REDUCER]);
    // What the C menu gives for the same materials.
    const recipes = new Map();
    const game = new ctx.Game();
    for (const hook of ctx.GAME_CONTENT_HOOKS) {
        try { hook.call(game, { addItem() {}, addRecipe: (id, _name, output, amount, inputs) => recipes.set(id, { output, amount, inputs }) }); } catch (_error) { /* hooks that need a whole game */ }
    }
    const smeltStone = recipes.get('stone');
    assert.deepEqual([smeltStone.amount, smeltStone.inputs.find((input) => input.type === 'cobblestone').amount], [2, 1], 'the C recipe for stone is still there');
    const { sand, cobblestone } = ctx.APPLIANCE_FOUNDRY;
    assert.ok(cobblestone.yield / cobblestone.in > smeltStone.amount);
    assert.ok(sand.yield / sand.in > 2 / 3, '3 sand give 2 glass in the menu');
    const si = ctx.APPLIANCE_ARC.sand;
    assert.ok(si.yield / si.coal > 1, '1 coal gives 1 silicon in the menu');
    assert.deepEqual([si.in, si.coal], [1, 2], 'SiO2 + 2 C');
    // What goes where.
    assert.ok(ctx.applianceMachineTakes('foundry', 'sand') && ctx.applianceMachineTakes('foundry', 'coal_ore'));
    assert.ok(!ctx.applianceMachineTakes('foundry', 'planks') && !ctx.applianceMachineTakes('foundry', 'raw_fish'));
    assert.ok(ctx.applianceMachineTakes('arc_furnace', 'sand') && ctx.applianceMachineTakes('arc_furnace', 'coal_ore'));
    assert.ok(!ctx.applianceMachineTakes('arc_furnace', 'cobblestone') && !ctx.applianceMachineTakes('arc_furnace', 'planks'));
    assert.ok(ctx.applianceMachineTakes('oven', 'raw_fish') && !ctx.applianceMachineTakes('oven', 'sand'));
    assert.ok(!ctx.applianceMachineTakes('chest', 'sand'));
    const name = (type) => type;
    assert.equal(ctx.applianceRecipeLine('arc_furnace', 'sand', name), '1 sand and 2 coal_ore make 3 element_si in 20 s');
    assert.equal(ctx.applianceRecipeLine('foundry', 'sand', name), '3 sand make 4 glass in 12 s');
    assert.equal(ctx.applianceRecipeLine('foundry', 'dirt', name), '');
});

test('smelters: the blocks: storage, electricity, light, collision, icons and recipes', () => {
    const world = makeWorld();
    for (const name of ['foundry', 'foundry:e:off', 'foundry:e:on', 'arc_furnace', 'arc_furnace:e:off', 'arc_furnace:e:on']) {
        assert.equal(world.blockTypes[name].storageSlots, 3, name);
        assert.ok(world.registry.id(name) > 0, name);
    }
    assert.equal(world.blockTypes['foundry:e:on'].dropType, 'foundry');
    assert.equal(world.blockTypes['arc_furnace:e:on'].dropType, 'arc_furnace');
    assert.equal(ctx.STORAGE_KINDS.foundry, 3);
    assert.equal(ctx.STORAGE_KINDS.arc_furnace, 3);
    // The light is real block light, only while it runs.
    assert.equal(world.registry.lightLevel[world.registry.id('foundry:e:on')], 13);
    assert.equal(world.registry.lightLevel[world.registry.id('arc_furnace:e:on')], 14);
    for (const name of ['foundry', 'foundry:e:off', 'arc_furnace', 'arc_furnace:e:off']) assert.equal(world.registry.lightEmitter[world.registry.id(name)], 0, name);
    assert.ok(!world.blockTypes.foundry.electric, 'the foundry burns coal');
    assert.ok(world.blockTypes.arc_furnace.electric);
    assert.deepEqual({ ...ctx.ELECTRIC_KINDS.arc_furnace }, { role: 'consumer', watts: 150, onDemand: true });
    assert.ok(ctx.ELECTRIC_KINDS.arc_furnace.watts > ctx.ELECTRIC_KINDS.rtg.watts);
    assert.ok(ctx.ELECTRIC_KINDS.arc_furnace.watts <= 2 * ctx.ELECTRIC_KINDS.rtg.watts);
    // The foundry is a whole cube; the furnace stops you at its vessel, electrodes included, facing any way.
    assert.deepEqual([...world.shapes.collision(world.registry.id('foundry:e:off'))].map((box) => [...box]), [[0, 0, 0, 1, 1, 1]]);
    for (const facing of ['n', 'e', 's', 'w']) {
        const collision = world.shapes.collision(world.registry.id(ctx.shapeStateName('arc_furnace', ctx.BLOCK_SHAPES.arc_furnace, { facing, fire: 'off' })));
        assert.equal(collision.length, 1);
        assert.equal(collision[0][4], 1);
        const boxes = ctx.BLOCK_SHAPES.arc_furnace.boxes({ facing, fire: 'off' }, 0);
        assert.equal(boxes.filter((box) => box[1] >= 12 / 16).length, 3, 'three electrodes');
        for (const box of boxes) assert.ok(box[0] >= 0 && box[2] >= 0 && box[3] <= 1 && box[5] <= 1 && box[4] <= 1, 'inside its cell');
    }
    assert.deepEqual({ ...ctx.BLOCK_SHAPES.arc_furnace.iconState }, { facing: 's', fire: 'off' });
    for (const pattern of ['foundry_front_off', 'foundry_front_on', 'foundry_side', 'foundry_top_off', 'foundry_top_on', 'arc_furnace_side', 'arc_furnace_front_off', 'arc_furnace_front_on', 'arc_furnace_top_off', 'arc_furnace_top_on']) {
        assert.ok(ctx.TEXTURE_PATTERNS[pattern], pattern);
    }
    for (const item of ['foundry', 'arc_furnace']) assert.ok(world.getInventoryIconUrl(item), item);
    const recipes = new Map();
    const stock = [];
    const game = new ctx.Game();
    for (const hook of ctx.GAME_CONTENT_HOOKS) {
        try { hook.call(game, { addItem: (item) => stock.push(item), addRecipe: (id, _name, output, amount, inputs) => recipes.set(id, { output, amount, inputs }) }); } catch (_error) { /* hooks that need a whole game */ }
    }
    assert.ok(stock.includes('foundry') && stock.includes('arc_furnace'), 'in the creative stock and /give');
    for (const item of ['foundry', 'arc_furnace']) {
        const { output, amount, inputs } = recipes.get(item);
        assert.deepEqual([output, amount], [item, 1]);
        for (const { type } of inputs) assert.ok(world.blockTypes[type], type);
    }
    const needs = (item) => recipes.get(item).inputs.map((input) => input.type);
    for (const later of ['electric_motor', 'copper_wire', 'iron_block']) {
        assert.ok(needs('arc_furnace').includes(later), later);
        assert.ok(!needs('foundry').includes(later), `the foundry comes first: ${later}`);
    }
});

test('smelters: what the panel says and shows', () => {
    const foundry = ctx.APPLIANCE_MACHINES.foundry;
    assert.match(ctx.storageOvenStatus({ burn: 0 }, foundry), /No fire.*coal/);
    assert.match(ctx.storageOvenStatus({ burn: 9.5, burnMax: 80, cook: 2, cookMax: 12 }, foundry), /10 s.*smelting/);
    assert.match(ctx.storageOvenStatus({ burn: 9, burnMax: 80, cook: 0, cookMax: 0 }, foundry), /nothing to smelt/);
    const line = (contents) => ctx.storageArcStatus('arc_furnace', contents);
    assert.deepEqual({ ...line({ oven: { cookMax: 0 }, powered: false }) }.off, false, 'an idle furnace does not complain');
    assert.match(line({ oven: { cookMax: 0 } }).text, /no power until/);
    assert.match(line({ oven: { cookMax: 20, starting: true } }).text, /Asking.*150 W/);
    assert.equal(line({ oven: { cookMax: 20 }, powered: true }).off, false);
    assert.match(line({ oven: { cookMax: 20 }, powered: true }).text, /150 W/);
    assert.equal(line({ oven: { cookMax: 20 } }).off, true);
    assert.match(line({ oven: { cookMax: 20 } }).text, /^No power: needs 150 W/);
});

test('smelters: the panel draws each machine, with only what fits it on the player\'s side', () => {
    const fakeElement = () => {
        const classes = new Set();
        const classList = { add: (name) => classes.add(name), remove: (name) => classes.delete(name), toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), has: (name) => classes.has(name) };
        const element = { textContent: '', innerHTML: '', className: '', style: {}, classList, children: [] };
        element.append = (...children) => element.children.push(...children);
        element.appendChild = (child) => element.children.push(child);
        element.parentNode = element;
        return element;
    };
    const show = (kind, contents) => {
        const elements = new Map();
        const game = new ctx.Game();
        game.world = makeWorld();
        game.storagePanel = {
            querySelector(selector) {
                if (!elements.has(selector)) elements.set(selector, fakeElement());
                return elements.get(selector);
            },
            querySelectorAll: () => []
        };
        Object.assign(game, { storageAt: { x: 0, y: 0, z: 0 }, storageKind: kind, storageTab: '', storageTitle: kind, storageSlots: contents.slots, storageContents: contents,
            inventory: ['sand', 'coal_ore', 'planks', 'raw_fish', 'cobblestone', 'glass'], getInventoryCount: () => 5, getBlockDisplayName: (type) => type });
        game.storageRender();
        return (selector) => elements.get(selector);
    };
    const slots = [{ type: 'sand', count: 3 }, { type: 'coal_ore', count: 1 }, {}];
    const titles = (at) => at('#storage-items').children.length;

    let at = show('foundry', { slots, capacity: 3, oven: { burn: 40, burnMax: 80, cook: 6, cookMax: 12 } });
    assert.match(at('#storage-status').textContent, /40 s.*smelting.*3 sand make 4 glass in 12 s/);
    assert.equal(at('#storage-fire i').style.width, '50%');
    assert.equal(at('#storage-cook i').style.width, '50%');
    assert.equal(titles(at), 3, 'sand, coal, cobblestone: no planks, no fish, no glass');
    assert.match(at('#storage-items-title').textContent, /smelt/);

    at = show('arc_furnace', { slots, capacity: 3, oven: { burn: 0, burnMax: 0, cook: 5, cookMax: 20 } });
    assert.match(at('#storage-status').textContent, /^No power: needs 150 W.*1 sand and 2 coal_ore make 3 element_si in 20 s/);
    assert.ok(at('#storage-status').classList.has('off'));
    assert.equal(at('#storage-cook i').style.width, '25%');
    assert.ok(at('#storage-cook i').classList.has('paused'), 'the bar shows that it is held');
    assert.equal(titles(at), 2, 'sand and coal');

    at = show('arc_furnace', { slots, capacity: 3, powered: true, oven: { burn: 0, burnMax: 0, cook: 5, cookMax: 20 } });
    assert.match(at('#storage-status').textContent, /^Arc on, drawing 150 W/);
    assert.ok(!at('#storage-status').classList.has('off'));

    at = show('oven', { slots: [{ type: 'raw_fish', count: 1 }, {}, {}], capacity: 3, oven: { burn: 0, burnMax: 0, cook: 0, cookMax: 0 } });
    assert.equal(at('#storage-status').textContent, 'No fire: it lights by itself with food and fuel', 'the oven says what it said');
    assert.equal(titles(at), 3, 'coal, planks and fish');
});

test('appliances: what the panel works out', () => {
    assert.ok(ctx.storageSameStacks([{ type: 'stone', count: 1, chill: 3 }, {}], [{ type: 'stone', count: 1, chill: 30 }, {}]), 'progress is not a new stack');
    assert.ok(!ctx.storageSameStacks([{ type: 'stone', count: 1 }], [{ type: 'stone', count: 2 }]));
    assert.ok(!ctx.storageSameStacks([{ type: 'water_flask', count: 1 }], [{ type: 'ice', count: 1 }]));
    assert.ok(ctx.storageSameStacks(undefined, undefined));
    assert.ok(!ctx.storageSameStacks([{}], undefined));
    assert.match(ctx.storageOvenStatus({ burn: 0 }), /No fire/);
    assert.match(ctx.storageOvenStatus({ burn: 9.5, burnMax: 80, cook: 2, cookMax: 20 }), /10 s.*cooking/);
    assert.match(ctx.storageOvenStatus({ burn: 9, burnMax: 80, cook: 0, cookMax: 0 }), /nothing to cook/);
    assert.equal(ctx.storagePercent(5, 20), 25);
    assert.equal(ctx.storagePercent(5, 0), 0);
    assert.equal(ctx.storagePercent(50, 20), 100);
    assert.equal(ctx.applianceColdTable('fridge', '').seconds, 60);
    assert.equal(ctx.applianceColdTable('fridge', 'freezer').seconds, 120);
    assert.equal(ctx.applianceColdTable('chest_freezer', '').seconds, 120);
    assert.equal(ctx.applianceSlotProgress('fridge', '', { type: 'milk', count: 2, chill: 30 }), 0.5);
    assert.equal(ctx.applianceSlotProgress('fridge', '', { type: 'raw_fish', count: 2 }), null);
    assert.equal(ctx.applianceSlotProgress('fridge', 'freezer', { type: 'raw_fish', count: 2, chill: 60 }), 0.5);
    assert.equal(ctx.applianceSlotProgress('fridge', 'freezer', null), null);
});

test('storage: a fridge sends the compartment on show, and takes from it', () => {
    const { game, sent } = makeStorageGame();
    game.storageMode = 1;
    game.storageKind = 'fridge';
    game.storageTab = 'freezer';
    game.storageSlots = [{ type: 'stone', count: 3 }];
    game.storageContents = { freezer: [{ type: 'iron_ore', count: 2 }] };
    game.storageTake(0);
    assert.equal(sent.at(-1).payload.compartment, 'freezer');
    assert.equal(sent.at(-1).payload.type, 'iron_ore');
    game.storagePut('stone');
    assert.equal(sent.at(-1).payload.compartment, 'freezer');
    game.storageTab = '';
    game.storageTake(0);
    assert.equal(sent.at(-1).payload.compartment, undefined);
    assert.equal(sent.at(-1).payload.type, 'stone');
    // A snapshot brings both compartments.
    game.storageRev = -1;
    game.storageOnContents({ x: 0, y: 1, z: 0, rev: 1, slots: [{ type: 'dirt', count: 1 }], freezer: [{ type: 'ice', count: 4 }], cold: true, powered: true });
    assert.equal(game.storageSlots[0].type, 'dirt');
    game.storageTab = 'freezer';
    assert.equal(game.storageShownSlots()[0].type, 'ice');
    // A note for what an oven refuses, and the items come back.
    game.storageOnResult({ reqId: sent.at(-1).payload.reqId, amount: 0, reason: 'not for the oven' });
    assert.match(game.storageNote, /oven/);
});

test('the clock tells the game time', () => {
    const angles = (t) => JSON.parse(JSON.stringify(ctx.decorClockAngles(t)));
    // timeOfDay 0 is 06:00: the hour hand at 6 (half a turn), the minute hand at 12.
    assert.ok(near(angles(0).hour, Math.PI) && near(angles(0).minute, 0));
    assert.equal(ctx.decorClockText(0), '06:00');
    assert.equal(ctx.decorClockText(0.25), '12:00');
    assert.equal(ctx.decorClockText(0.75), '00:00');
    assert.equal(ctx.decorClockText(0.0625), '07:30');
    assert.ok(near(angles(0.0625).minute, Math.PI), 'half past: the minute hand at 6');
    // Its texture is at the key decorUpdateClock looks for, and it is not smaller than 32 px.
    const world = makeWorld();
    world.getMaterial('wall_clock:e');
    assert.ok(world.textures.has('base:albedo:wall_clock:null:'), [...world.textures.keys()].filter((k) => k.includes('clock')).join());
    assert.equal(world.getFaceTextureSpecs('wall_clock').front.minSize, 32);
    const game = new ctx.Game();
    Object.assign(game, { world, timeOfDay: 0 });
    assert.doesNotThrow(() => game.decorUpdateClock(2));
});

test('the guide covers the furniture, in both languages, from the indexes and the printed book', () => {
    const GUIDE = path.join(STATIC, 'guide');
    const names = fs.readdirSync(GUIDE);
    const pages = [223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234];
    const read = (name) => fs.readFileSync(path.join(GUIDE, name), 'utf8');
    for (const page of pages) {
        for (const lang of ['EN', 'ES']) assert.ok(names.some((name) => name.startsWith(`${page}_${lang}_`)), `${page} ${lang}`);
        assert.ok(print.SECTIONS.some(([from, to]) => page >= from && page <= to), `section for ${page}`);
    }
    assert.ok(!names.some((name) => name.startsWith('221_')), '221 stays unused');
    for (const lang of ['EN', 'ES']) {
        const contents = read(names.find((name) => name.startsWith(`0_${lang}_`)));
        const items = read(names.find((name) => name.startsWith(`48_${lang}_`)));
        assert.match(contents, /\(223\)/);
        for (const page of pages) assert.match(items, new RegExp(`\\(${page}\\)`));
        for (const page of pages.slice(1)) {
            const text = read(names.find((name) => name.startsWith(`${page}_${lang}_`)));
            assert.ok(text.includes('(item:') || text.includes('item:'), `${page} has pictures`);
        }
        // Every link of the new pages points to a page that exists.
        for (const page of pages) {
            const text = read(names.find((name) => name.startsWith(`${page}_${lang}_`)));
            for (const [, target] of text.matchAll(/\]\((\d+)\)/g)) {
                assert.ok(names.some((name) => name.startsWith(`${target}_${lang}_`)), `${page} ${lang} links to ${target}`);
            }
        }
        // Stained glass links the chemistry behind its colours.
        const glass = read(names.find((name) => name.startsWith(`229_${lang}_`)));
        for (const element of [163, 165, 172, 161]) assert.match(glass, new RegExp(`\\(${element}\\)`));
        // Mirrors and the chemistry page link each other, and the old page no longer says it is only a texture.
        assert.match(read(names.find((name) => name.startsWith(`232_${lang}_`))), /\(181\)/);
        assert.match(read(names.find((name) => name.startsWith(`181_${lang}_`))), /\(232\)/);
    }
    const readme = read('README.md');
    for (const page of pages) assert.match(readme, new RegExp(`^\\| ${page} \\|`, 'm'));
});

test('the guide covers the foundry and the arc furnace, in both languages, and the old pages point to them', () => {
    const GUIDE = path.join(STATIC, 'guide');
    const names = fs.readdirSync(GUIDE);
    const read = (name) => fs.readFileSync(path.join(GUIDE, name), 'utf8');
    const page = (id, lang) => read(names.find((name) => name.startsWith(`${id}_${lang}_`)));
    for (const lang of ['EN', 'ES']) {
        for (const id of [235, 236]) {
            assert.ok(print.SECTIONS.some(([from, to]) => id >= from && id <= to), `section for ${id}`);
            const text = page(id, lang);
            for (const [, target] of text.matchAll(/\]\((\d+)\)/g)) {
                assert.ok(names.some((name) => name.startsWith(`${target}_${lang}_`)), `${id} ${lang} links to ${target}`);
            }
            assert.match(page(0, lang), new RegExp(`\\(${id}\\)`));
            assert.match(page(48, lang), new RegExp(`\\(${id}\\)`));
        }
        assert.match(page(235, lang), /item:foundry/);
        assert.match(page(236, lang), /item:arc_furnace/);
        assert.match(page(236, lang), /150 W/);
        assert.match(page(236, lang), /SiO₂ \+ 2 C → Si \+ 2 CO/);
        // The yields in the text are those of the tables.
        for (const [id, table] of [[235, ctx.APPLIANCE_FOUNDRY], [236, ctx.APPLIANCE_ARC]]) {
            for (const [item, recipe] of Object.entries(table)) {
                const made = recipe.yield > 1 ? `\\*\\*${recipe.yield}\\*\\*` : `${recipe.yield}`;
                assert.match(page(id, lang), new RegExp(`${recipe.in} \`${item}\`.*${made} \`${recipe.out}\`.*\\b${recipe.seconds} s`), `${id} ${item}`);
            }
        }
        // The pages on what they make say so, and that the C recipes stay.
        assert.match(page(51, lang), /\(235\)/);
        assert.match(page(50, lang), /\(235\)/);
        assert.match(page(152, lang), /\(236\)/);
        assert.match(page(204, lang), /\(236\)/);
        assert.match(page(200, lang), /\(236\)/);
        assert.match(page(233, lang), /\(235\)/);
        for (const id of [235, 236]) assert.match(page(id, lang), lang === 'EN' ? /C menu/ : /menú C/);
    }
    const readme = read('README.md');
    for (const id of [235, 236]) assert.match(readme, new RegExp(`^\\| ${id} \\|`, 'm'));
});

// ---------------------------------------------------------------------------------------
// Mirrors

const mirrorDef = (facing) => ({ mirrorSurface: 'wall', state: { facing } });
const noWalls = () => false;

test('mirrors: the cube keeps its name and chemistry source; both blocks say where they reflect', () => {
    const world = makeWorld();
    assert.equal(world.blockTypes.mirror.mirrorSurface, 'cube');
    assert.equal(world.blockTypes.mirror.name, 'Silver Mirror');
    assert.equal(world.blockTypes.wall_mirror.mirrorSurface, 'wall');
    assert.equal(world.blockTypes['wall_mirror:e'].mirrorSurface, 'wall');
    assert.equal(ctx.TEXTURE_PATTERNS.mirror.rtx.metalness, 1, 'shiny from afar in RTX and Ultra');
    assert.equal(ctx.TEXTURE_PATTERNS.wall_mirror.rtx.metalness, 1);
    assert.equal(ctx.mirrorFacesOf(world.blockTypes.stone, 0, 0, 0).length, 0);
});

test('mirrors: a wall mirror reflects from the front of its box, a cube from its six sides', () => {
    const world = makeWorld();
    for (const facing of ['n', 'e', 's', 'w']) {
        const type = facing === 'n' ? 'wall_mirror' : `wall_mirror:${facing}`;
        const [face] = ctx.mirrorFacesOf(world.blockTypes[type], 3, 4, 5);
        const box = world.shapes.boxes(world.registry.id(type))[0];
        const cell = [3, 4, 5];
        const low = cell[face.axis] + box[face.axis];
        const high = cell[face.axis] + box[face.axis + 3];
        assert.ok(near(face.at, face.sign > 0 ? high : low), `${facing}: on the side away from the wall`);
    }
    const faces = ctx.mirrorFacesOf(world.blockTypes.mirror, 3, 4, 5);
    assert.equal(faces.length, 6);
    assert.equal(new Set(faces.map(ctx.mirrorPlaneKey)).size, 6);
    const top = faces.find((face) => face.axis === 1 && face.sign > 0);
    assert.equal(top.at, 5);
});

// The world matrix of a camera at `eye` looking along `forward`, with no roll.
function mirrorCameraElements(eye, forward) {
    const length = Math.hypot(...forward);
    const f = forward.map((value) => value / length);
    let right = [-f[2], 0, f[0]];
    const rightLength = Math.hypot(...right) || 1;
    right = right.map((value) => value / rightLength);
    const up = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]];
    return [...right, 0, ...up, 0, ...f.map((value) => -value), 0, ...eye, 1];
}
// 70 degrees of field of view on a 16:9 screen, like the game's.
const mirrorView = (eye, forward) => ctx.mirrorViewOf({ matrixWorld: { elements: mirrorCameraElements(eye, forward) }, fov: 70, aspect: 16 / 9 });
const rankOf = (faces, eye, forward, opaque = noWalls, current = []) => Array.from(ctx.mirrorRankPlanes(faces, mirrorView(eye, forward), current, opaque), (plane) => plane.key);

test('mirrors: only a face that looks at the camera, on screen and in range, counts', () => {
    const [face] = ctx.mirrorFacesOf(mirrorDef('s'), 0, 1, 0); // silver looks to +z, at z = 1/16
    const looking = [0, 0, -1];
    const cover = (eye, forward) => ctx.mirrorFaceCover(face, mirrorView(eye, forward));
    assert.ok(cover([0.5, 1.5, 5], looking) > 0);
    assert.equal(cover([0.5, 1.5, -5], [0, 0, 1]), 0, 'from behind');
    assert.equal(cover([0.5, 1.5, 5], [0, 0, 1]), 0, 'looking away');
    assert.equal(cover([0.5, 1.5, 1], [0, 0, 1]), 0, 'right next to it, looking away: it is not on screen');
    assert.equal(rankOf([face], [0.5, 1.5, ctx.MIRROR_RANGE + 1], looking).length, 0, 'too far');
    assert.equal(rankOf([face], [0.5, 1.5, ctx.MIRROR_RANGE - 1], looking).length, 1, 'in range');
    // Filling the screen from a hand away; the nearer, the more.
    assert.ok(cover([0.5, 1.5, 0.2], looking) >= cover([0.5, 1.5, 1], looking));
    assert.ok(cover([0.5, 1.5, 1], looking) > cover([0.5, 1.5, 5], looking));
    // The area on screen is what it should be: 7/8 of a block square at 3.9375 blocks.
    const expected = ((14 / 16) / (3.9375 * Math.tan((35 * Math.PI) / 180) * 16 / 9) / 2) * ((14 / 16) / (3.9375 * Math.tan((35 * Math.PI) / 180)) / 2);
    assert.ok(Math.abs(cover([0.5, 1.5, 4], looking) - expected) < 1e-9);
    // Half of it off the side of the screen, half of the area.
    const whole = cover([0.5, 1.5, 4], looking);
    const edge = mirrorView([0.5, 1.5, 4], looking);
    const shifted = { ...edge, tanX: edge.tanX };
    const atEdge = 0.5 - edge.tanX * 3.9375;
    assert.ok(Math.abs(ctx.mirrorFaceCover(face, { ...shifted, eye: [atEdge, 1.5, 4] }) - whole / 2) < 1e-9);
});

// What the player sees and the old pick (the nearest face, in a wide cosine) got wrong: each of these
// left the mirror being looked at with only its texture, however close it was.
test('mirrors: the plane on screen wins over a nearer one behind the camera or off screen', () => {
    const ahead = ctx.mirrorFacesOf(mirrorDef('s'), 0, 1, 0)[0];
    const key = ctx.mirrorPlaneKey(ahead);
    const north = [0, 0, -1];
    const behind = ctx.mirrorFacesOf(mirrorDef('n'), 0, 1, 8)[0];
    assert.deepEqual(rankOf([ahead, behind], [0.5, 1.5, 7], north), [key], 'a mirror 2 blocks behind you');
    const side = ctx.mirrorFacesOf(mirrorDef('w'), 7, 1, 5)[0];
    assert.deepEqual(rankOf([ahead, side], [0.5, 1.5, 9], north), [key], 'a nearer one past the edge of the screen');
    // The mirror beside you, reflecting until you turn: it does not hold on to the plane.
    const old = ctx.mirrorFacesOf(mirrorDef('e'), -3, 1, 4.5)[0];
    assert.deepEqual(rankOf([ahead, old], [0.5, 1.5, 7], north, noWalls, [ctx.mirrorPlaneKey(old)]), [key]);
});

test('mirrors: the plane that covers most of the screen wins, not the one with the nearest cell', () => {
    const north = [0, 0, -1];
    // One small mirror close by at the edge of the view; a whole wall further on, right in front.
    const small = ctx.mirrorFacesOf(mirrorDef('e'), -2, 1, 0)[0];
    const wall = [];
    for (let x = -4; x <= 5; x++) {
        for (let y = 0; y <= 3; y++) wall.push(ctx.mirrorFacesOf(mirrorDef('s'), x, y, -2)[0]);
    }
    for (const face of wall) assert.ok(ctx.mirrorFaceDistance(small, [0.5, 1.5, 3]) < ctx.mirrorFaceDistance(face, [0.5, 1.5, 3]));
    assert.equal(rankOf([small, ...wall], [0.5, 1.5, 3], north)[0], ctx.mirrorPlaneKey(wall[0]));
    assert.equal(rankOf([small, ...wall], [0.5, 1.5, 3], north).length, 2, 'the small one is next');
    // Up close, the small one fills the screen.
    assert.equal(rankOf([small, ...wall], [-1.2, 1.5, 0.5], [-1, 0, 0])[0], ctx.mirrorPlaneKey(small));
});

test('mirrors: what is hidden behind a wall takes nothing away from what is seen', () => {
    const north = [0, 0, -1];
    const eye = [0.5, 1.5, 7];
    // Next door: nine faces nearer than the mirror in view, behind stone. The old pick spent its
    // eight line-of-sight checks on them and reflected nothing at all.
    const hidden = [];
    for (let i = 2; i <= 10; i++) hidden.push(ctx.mirrorFacesOf(mirrorDef('s'), -i, 1, 4)[0]);
    const seen = ctx.mirrorFacesOf(mirrorDef('s'), 0, 1, -4)[0];
    const stone = (x, y, z) => z === 5 && x !== 0;
    assert.deepEqual(rankOf([...hidden, seen], eye, north, stone), [ctx.mirrorPlaneKey(seen)]);
    // Many large faces out of sight on one plane do not use up the checks of the others.
    const many = [];
    for (let x = -6; x <= 6; x++) {
        for (let y = 0; y <= 4; y++) if (Math.abs(x) > 1) many.push(ctx.mirrorFacesOf(mirrorDef('s'), x, y, 4)[0]);
    }
    assert.deepEqual(rankOf(many, eye, north, stone), [], 'a plane all behind stone is not chosen');
    assert.deepEqual(rankOf([...many, seen], eye, north, stone), [ctx.mirrorPlaneKey(seen)]);
});

test('mirrors: a block in front of the middle of a face does not hide the rest of it', () => {
    const face = ctx.mirrorFacesOf(mirrorDef('s'), 0, 1, 0)[0];
    const eye = [1.4, 1.5, 2.5];
    const blocked = (x, y, z) => x === 0 && z === 1;
    assert.equal(ctx.mirrorLineClear(blocked, eye, face.center), false, 'the line to its middle is blocked');
    const sight = ctx.mirrorFaceSight(face, eye, blocked);
    assert.ok(sight > 0 && sight < 1, `${sight} of it is seen`);
    assert.equal(rankOf([face], eye, [-0.3, 0, -1], blocked).length, 1);
    assert.equal(ctx.mirrorFaceSight(face, eye, noWalls), 1);
    assert.equal(ctx.mirrorFaceSight(face, eye, () => true), 0);
    // Its own wall, or the neighbour on its plane, never gets in the way.
    assert.equal(ctx.mirrorFaceSight(face, [0.5, 1.5, 3], (x, y, z) => z === -1), 1);
    assert.equal(ctx.mirrorFaceSight(face, [0.5, 1.5, 3], (x, y, z) => z === 0 && x !== 0), 1);
    const cube = ctx.mirrorFacesOf({ mirrorSurface: 'cube' }, 4, 1, 4);
    const self = (x, y, z) => x === 4 && y === 1 && z === 4;
    for (const side of cube) {
        const out = [4.5, 1.5, 4.5];
        out[side.axis] += side.sign * 3;
        assert.equal(ctx.mirrorFaceSight(side, out, self), 1, 'a cube does not hide its own face');
    }
});

test('mirrors: a plane in use is sticky, but only between planes on screen', () => {
    const north = [-1, 0, -1];
    const one = ctx.mirrorFacesOf(mirrorDef('s'), 0, 1, 0)[0];
    const two = ctx.mirrorFacesOf(mirrorDef('e'), -2, 1, 2)[0];
    const eye = [1.1, 1.5, 3.0625];
    const view = mirrorView(eye, north);
    const [a, b] = [ctx.mirrorFaceCover(one, view), ctx.mirrorFaceCover(two, view)];
    assert.ok(a > 0 && b > 0, `${a} and ${b}`);
    const big = a > b ? one : two;
    const small = a > b ? two : one;
    assert.ok(Math.max(a, b) / Math.min(a, b) < 1.4, `close enough for this test: ${a} and ${b}`);
    assert.equal(rankOf([one, two], eye, north)[0], ctx.mirrorPlaneKey(big));
    assert.equal(rankOf([one, two], eye, north, noWalls, [ctx.mirrorPlaneKey(small)])[0], ctx.mirrorPlaneKey(small));
});

test('mirrors: two planes when the frame time allows, never more, back to one under load', () => {
    const fast = 1 / 60;
    const slow = 1 / 20;
    let budget = { planes: 1, wait: 1 };
    budget = ctx.mirrorPlaneBudget(budget, fast, 0.5, false);
    assert.equal(budget.planes, 1, 'it waits for a moment first');
    budget = ctx.mirrorPlaneBudget(budget, fast, 0.6, false);
    assert.equal(budget.planes, 2);
    assert.equal(ctx.mirrorPlaneBudget(budget, fast, 0.1, false).planes, 2);
    budget = ctx.mirrorPlaneBudget(budget, slow, 0.05, false);
    assert.equal(budget.planes, 1, 'dropped');
    assert.ok(budget.wait > 5, 'and it stays there for a while');
    assert.equal(ctx.mirrorPlaneBudget(budget, fast, 1, false).planes, 1);
    assert.equal(ctx.mirrorPlaneBudget(budget, fast, budget.wait + 1, false).planes, 2);
    assert.equal(ctx.mirrorPlaneBudget({ planes: 1, wait: 0 }, 1 / 40, 0.1, false).planes, 1, 'not at 40 fps');
    assert.equal(ctx.mirrorPlaneBudget({ planes: 2, wait: 0 }, 1 / 40, 0.1, false).planes, 2, 'holds on at 40 fps');
    assert.equal(ctx.mirrorPlaneBudget({ planes: 1, wait: 0 }, fast, 0.1, true).planes, 1, 'a phone: one');
    // A second plane must be worth a pass, and the first only has to be seen.
    const planes = [{ cover: 0.0003 }, { cover: 0.0003 }];
    assert.equal(ctx.mirrorPlanesToDraw(planes, 2).length, 1);
    assert.equal(ctx.mirrorPlanesToDraw([{ cover: 0.3 }, { cover: 0.2 }, { cover: 0.1 }], 2).length, 2, 'the hard cap');
    assert.equal(ctx.mirrorPlanesToDraw([{ cover: 0.3 }, { cover: 0.2 }], 1).length, 1);
    assert.equal(ctx.mirrorPlanesToDraw([], 2).length, 0);
    assert.equal(ctx.mirrorRefreshInterval(true, false, true), 2, 'the second plane takes half the refreshes');
});

test('mirrors: quads are counter-clockwise from their silver side, in front of it and inside the frame', () => {
    const world = makeWorld();
    const faces = [...ctx.mirrorFacesOf(world.blockTypes.mirror, 0, 0, 0), ...['n', 'e', 's', 'w'].map((f) => ctx.mirrorFacesOf(mirrorDef(f), 2, 0, 2)[0])];
    for (const face of faces) {
        const p = ctx.mirrorQuadPositions([face]);
        assert.equal(p.length, 18);
        const a = [p[3] - p[0], p[4] - p[1], p[5] - p[2]];
        const b = [p[6] - p[0], p[7] - p[1], p[8] - p[2]];
        const normal = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        assert.equal(Math.sign(normal[face.axis]), face.sign, ctx.mirrorPlaneKey(face));
        assert.ok(near(normal[(face.axis + 1) % 3], 0) && near(normal[(face.axis + 2) % 3], 0));
        for (let i = 0; i < 6; i++) {
            const lift = (p[i * 3 + face.axis] - face.at) * face.sign;
            assert.ok(lift > 0 && lift < 0.01, 'just in front');
        }
    }
});

test('mirrors: the reflection has a hard cap in pixels and refreshes less when it can', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.mirrorTargetSize(3840, 2160, ctx.MIRROR_TARGET_MAX))), { width: 512, height: 288 });
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.mirrorTargetSize(800, 600, ctx.MIRROR_TARGET_MAX))), { width: 400, height: 300 }, 'half of a small screen');
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.mirrorTargetSize(100, 100, ctx.MIRROR_TARGET_MAX))), { width: 64, height: 64 });
    assert.equal(ctx.mirrorRefreshInterval(true, false), 1);
    assert.equal(ctx.mirrorRefreshInterval(false, false), 3);
    assert.equal(ctx.mirrorRefreshInterval(true, true), 2);
    assert.equal(ctx.mirrorRefreshInterval(false, true), 6);
});

// A game with a renderer that only counts, facing north from (0.5, 1.5, 5).
function mirrorGame(world, eye = [0.5, 1.5, 5]) {
    const game = new ctx.Game();
    const renders = [];
    const hand = { visible: true };
    const tag = { visible: true };
    const avatar = { visible: false, userData: { nameSprite: tag } };
    const stubMesh = () => ({ visible: false, geometry: { setAttribute() {}, computeBoundingSphere() {}, dispose() {} }, material: { uniforms: { reflection: {} } } });
    Object.assign(game, {
        world,
        scene: { add() {} },
        camera: {
            position: { x: eye[0], y: eye[1], z: eye[2] }, near: 0.1, far: 500, fov: 70, aspect: 16 / 9,
            matrixWorld: { elements: mirrorCameraElements(eye, [0, 0, -1]) },
            updateMatrixWorld() {},
            getWorldDirection: (v) => v.set(0, 0, -1)
        },
        renderer: {
            autoClear: true, outputEncoding: 'srgb', shadowMap: { autoUpdate: true }, state: { buffers: { depth: { setMask() {} } } },
            getDrawingBufferSize: (v) => v.set(1000, 500), getRenderTarget: () => null, setRenderTarget() {},
            render: () => renders.push({
                hand: hand.visible, avatar: avatar.visible, tag: tag.visible, shadows: game.renderer.shadowMap.autoUpdate,
                quads: game.mirrorSlots.some((slot) => slot.quads && slot.quads.visible), sheen: Boolean(game.mirrorSheen && game.mirrorSheen.visible)
            })
        },
        cameraViewMode: 'first', localPlayerAvatar: avatar, firstPersonHand: hand,
        updateLocalPlayerAvatar() {},
        mirrorsAimCamera() {},
        mirrorsBuildQuads(slot) {
            slot.textureMatrix = {};
            slot.quads = stubMesh();
        },
        mirrorsBuildSheen() { game.mirrorSheen = stubMesh(); },
        look(forward) { game.camera.matrixWorld.elements = mirrorCameraElements([game.camera.position.x, game.camera.position.y, game.camera.position.z], forward); }
    });
    return { game, renders, hand, tag, avatar };
}
const mirrorsShown = (game) => (game.mirrorSlots || []).filter((slot) => slot.quads && slot.quads.visible).length;
const mirrorsTargets = (game) => (game.mirrorSlots || []).filter((slot) => slot.target).length;

test('mirrors: with no mirror near, no pass, no quads, no sheen and no target', () => {
    const world = makeWorld();
    const { game, renders } = mirrorGame(world);
    for (let i = 0; i < 30; i++) game.mirrorsRender(0.05);
    assert.equal(renders.length, 0);
    assert.equal(game.mirrorSlots, undefined);
    assert.equal(game.mirrorSheen, undefined);
    assert.equal(game.mirrorFrameTime, undefined, 'not even the frame time is kept');
});

test('mirrors: looking at one draws one pass with the player in it, the hands out, and restores everything', () => {
    const world = makeWorld();
    put(world, 0, 1, 0, 'wall_mirror:s');
    const { game, renders, hand, tag, avatar } = mirrorGame(world);
    game.mirrorsRender(0.016);
    assert.equal(renders.length, 1, 'one pass per frame');
    assert.equal(mirrorsShown(game), 1);
    const [pass] = renders;
    assert.equal(pass.hand, false);
    assert.equal(pass.avatar, true);
    assert.equal(pass.tag, false);
    assert.equal(pass.shadows, false, 'the shadow map is not drawn again');
    assert.equal(pass.quads, false, 'no mirrors inside the mirror');
    assert.equal(hand.visible, true);
    assert.equal(avatar.visible, false, 'in first person the avatar is only in the mirror');
    assert.equal(tag.visible, true);
    assert.equal(game.renderer.shadowMap.autoUpdate, true);
    // Turning round: the pass stops at once, and the target goes after a while.
    game.look([0, 0, 1]);
    game.mirrorPickWait = 0;
    const count = renders.length;
    for (let i = 0; i < 40; i++) game.mirrorsRender(0.2);
    assert.equal(renders.length, count);
    assert.equal(mirrorsShown(game), 0);
    assert.equal(mirrorsTargets(game), 0);
});

test('mirrors: a mirror behind a wall, a plane in use and covered cube faces', () => {
    const world = makeWorld();
    put(world, 0, 1, 0, 'wall_mirror:s');
    put(world, 0, 1, 2, 'stone');
    const hidden = mirrorGame(world);
    hidden.game.mirrorsRender(0.016);
    assert.equal(hidden.renders.length, 0, 'behind stone');
    // A cube with stone on its south side shows no south face.
    put(world, 4, 1, 0, 'mirror');
    put(world, 4, 1, 1, 'stone');
    const { game } = mirrorGame(world);
    const faces = game.mirrorsGather([4.5, 1.5, 5]);
    assert.ok(!faces.some((face) => face.axis === 2 && face.sign > 0 && face.at === 1 && face.center[0] === 4.5));
    assert.ok(faces.some((face) => face.axis === 0 && face.center[0] === 5));
});

test('mirrors: a block placed or broken is seen by the next pick; the list does not go stale', () => {
    const world = makeWorld();
    const { game, renders } = mirrorGame(world);
    game.mirrorsRender(0.016);
    assert.equal(renders.length, 0);
    // The real path of a placed block, for what the list is cached on.
    world.setEditedBlock(0, 1, 0, 'wall_mirror:s');
    for (let i = 0; i < 7; i++) game.mirrorsRender(0.016);
    assert.ok(renders.length > 0, 'found within a pick');
    assert.equal(mirrorsShown(game), 1);
    world.setEditedBlock(0, 1, 0, null);
    for (let i = 0; i < 7; i++) game.mirrorsRender(0.016);
    assert.equal(mirrorsShown(game), 0);
    // In another column, at a negative coordinate.
    world.setEditedBlock(-1, 1, -1, 'wall_mirror:s');
    assert.equal(game.mirrorsGather([0, 1.5, 3]).filter((face) => face.center[0] === -0.5 && face.center[2] < 0).length, 1);
});

test('mirrors: a cube seen from its corner reflects on both sides, and the other sides of the room shine', () => {
    const world = makeWorld();
    put(world, 0, 1, 0, 'mirror');
    const { game, renders } = mirrorGame(world, [3, 3, 3]);
    game.look([-0.65, -0.4, -0.65]);
    game.mirrorBudget = { planes: 2, wait: 0 };
    game.mirrorFrameTime = 1 / 60;
    game.mirrorsRender(1 / 60);
    assert.equal(game.mirrorPlanes.length, 2, 'two sides on screen');
    assert.equal(renders.length, 2, 'two passes, the hard cap');
    assert.equal(mirrorsShown(game), 2);
    // The top is seen too: it does not reflect, it shines.
    assert.equal(game.mirrorSheen.visible, true);
    assert.ok(renders.every((pass) => !pass.quads && !pass.sheen), 'neither is in a reflection');
    // Standing still, it costs less; the second plane less than the first.
    for (let i = 0; i < 12; i++) game.mirrorsRender(1 / 60);
    assert.ok(renders.length <= 2 + 12 * (1 / 3 + 1 / 6) + 1, `${renders.length} passes`);
    // Under load it drops to one, and stays.
    for (let i = 0; i < 60; i++) game.mirrorsRender(1 / 15);
    assert.equal(game.mirrorPlanes.length, 1);
    assert.equal(mirrorsShown(game), 1);
    assert.equal(game.mirrorBudget.planes, 1);
});

test('mirrors: a plane that moves to another slot redraws, and ranks that swap draw nothing new', () => {
    const world = makeWorld();
    put(world, 0, 1, 0, 'mirror');
    const { game } = mirrorGame(world, [3, 3, 3]);
    game.look([-0.65, -0.4, -0.65]);
    game.mirrorBudget = { planes: 2, wait: 0 };
    game.mirrorFrameTime = 1 / 60;
    game.mirrorsRender(1 / 60);
    const before = game.mirrorSlots.map((slot) => slot.drawnKey);
    game.mirrorPlanes.reverse();
    game.mirrorsAssignSlots();
    assert.deepEqual(Array.from(game.mirrorSlots, (slot) => slot.plane.key), Array.from(before));
    // The sheen is the only thing that shows when nothing can reflect.
    const second = mirrorGame(world, [0.5, 1.5, 22]);
    second.game.mirrorsRender(0.016);
    assert.equal(second.renders.length, 0, 'too far to reflect');
});

test('mirrors: sheen quads carry the normal of their faces and show what does not reflect', () => {
    const world = makeWorld();
    const faces = [...ctx.mirrorFacesOf(world.blockTypes.mirror, 0, 0, 0)];
    const normals = ctx.mirrorQuadNormals(faces);
    const positions = ctx.mirrorQuadPositions(faces);
    assert.equal(normals.length, positions.length);
    faces.forEach((face, index) => {
        for (let vertex = 0; vertex < 6; vertex++) {
            const n = [0, 1, 2].map((k) => normals[index * 18 + vertex * 3 + k]);
            assert.equal(n[face.axis], face.sign);
            assert.equal(Math.hypot(...n), 1);
        }
    });
    // Looking at one wall with another mirror on a second wall too small to pay for a pass.
    put(world, 0, 1, 0, 'wall_mirror:s');
    put(world, 6, 1, 3, 'wall_mirror:w');
    const { game } = mirrorGame(world, [0.5, 1.5, 3.5]);
    game.look([0, 0, -1]);
    game.mirrorsRender(0.016);
    assert.equal(mirrorsShown(game), 1);
    assert.equal(game.mirrorSheen.visible, true, 'the mirror off to the side shines');
    // Behind you, or gone, it hides.
    world.setEditedBlock(6, 1, 3, null);
    game.mirrorPickWait = 0;
    game.mirrorsRender(0.016);
    assert.equal(game.mirrorSheen.visible, false);
});

// ---------------------------------------------------------------------------------------
// Signs

// A game with what placeBlock asks of it, clicking a face of `target` with `item` in hand. No item
// handler runs: they are for other tests. Returns what went to the server.
function makePlacingGame(world, item, target, normal, look = { x: 0, y: -0.5, z: -1 }) {
    const sent = [];
    const messages = [];
    const counts = { [item]: 3 };
    const game = new ctx.Game();
    const camera = { position: new Vector3(20, 3, 20), rotation: {} };
    Object.assign(game, {
        world,
        cameraController: { eyeHeight: 1.62, yaw: 0, pitch: 0, intersectsBoxes: () => false, intersectsBody: () => false, isCrouching: false, camera },
        network: { connected: true, send: (type, payload) => sent.push({ type, payload }) },
        placeDistance: 6,
        hitIndicator: { style: {} },
        tryUseItemOnMob: () => false, tryMountMob: () => false,
        raycastBlock: () => ({ object: { userData: { blockPosition: target } }, faceIndex: 0, point: new Vector3(target.x + 0.5, target.y + 1, target.z + 0.5), face: { normal } }),
        getSelectedHeldItemType: () => item, getSelectedBlockType: () => item,
        getInventoryCount: (type) => counts[type] || 0,
        consumeSelectedBlock() { counts[item]--; },
        getItemDefinition: () => null,
        getInteractionRay: () => ({ origin: camera.position, reachOrigin: camera.position, direction: look }),
        getLocalPlayerPosition: () => camera.position,
        playPlaceSound() {}, showHitIndicator() {}, saveRespawnPoint() {},
        receiveSystemMessage: ({ text }) => messages.push(text),
        promptSignText: () => 'Hola'
    });
    return { game, sent, messages, counts };
}
function withoutItemHandlers(run) {
    const saved = ctx.ITEM_USE_HANDLERS.splice(0);
    try {
        return run();
    } finally {
        ctx.ITEM_USE_HANDLERS.push(...saved);
    }
}

test('signs: on the ground a post that looks at the player, against a side a board on the wall', () => {
    const world = makeWorld();
    const place = (click) => world.getPlacementBlocks('sign', 3, 1, 3, { normal: { x: 0, y: 1, z: 0 }, hit: { x: 3, y: 1, z: 3 }, look: { x: 0, y: -0.5, z: -1 }, ...click })[0].blockType;
    assert.equal(place({}), 'sign:s:post');
    assert.equal(place({ look: { x: 1, y: -0.2, z: 0 } }), 'sign:w:post');
    assert.equal(place({ look: { x: -1, y: -0.2, z: 0 } }), 'sign:e:post');
    assert.equal(place({ look: { x: 0, y: -0.5, z: 1 } }), 'sign', 'north and post are the plain name');
    assert.equal(place({ normal: { x: 1, y: 0, z: 0 } }), 'sign:e:wall');
    assert.equal(place({ normal: { x: 0, y: 0, z: -1 } }), 'sign:n:wall');
    // A whole family under one item, all dropping it and sharing materials.
    const family = Object.keys(world.blockTypes).filter((type) => ctx.isSignBlockType(type));
    assert.equal(family.length, 8);
    for (const type of family) {
        assert.equal(world.getDropTypeForBlock(type), 'sign', type);
        assert.equal(world.getMaterial(type), world.getMaterial('sign'), type);
        assert.equal(world.registry.fullCube[world.registry.id(type)], 0, type);
    }
    assert.ok(!ctx.isSignBlockType('sign_post') && !ctx.isSignBlockType(null) && !ctx.isSignBlockType('stone'));
    // Only the post stops you; a wall board nothing, and it sits against its wall.
    const collision = (type) => JSON.parse(JSON.stringify(world.shapes.collision(world.registry.id(type))));
    assert.equal(collision('sign').length, 1);
    assert.ok(collision('sign')[0][3] - collision('sign')[0][0] < 0.25);
    assert.equal(collision('sign:e:wall').length, 0);
    assert.ok(near(Math.min(...world.shapes.boxes(world.registry.id('sign:e:wall')).map((box) => box[0])), 0), 'its back on the wall to the west');
    assert.equal(world.registry.solid[world.registry.id('sign:e:wall')], 0);
    // They turn with a build, and keep their mount.
    assert.equal(ctx.constructionTurnType('sign', 1, world.blockTypes), 'sign:e:post');
    assert.equal(ctx.constructionTurnType('sign:e:wall', 1, world.blockTypes), 'sign:s:wall');
    assert.equal(ctx.constructionTurnType('sign:w:post', 2, world.blockTypes), 'sign:e:post');
});

test('signs: a saved plain sign keeps its text and votes; every state keeps them; other blocks do not', () => {
    const world = makeWorld();
    world.rebuildAfterChange = () => {};
    const votes = { thumbup: 2, thumbdown: 0, heart: 0, happy: 0, star: 1 };
    world.loadBlocks({ blocks: { a: { x: 3, y: 1, z: 3, blockType: 'sign', text: 'old sign', votes } } });
    assert.equal(world.getSignTextAt(3, 1, 3), 'old sign');
    assert.equal(world.getSignVotesAt(3, 1, 3).star, 1);
    assert.equal(world.getBlockTypeAt(3, 1, 3), 'sign');
    for (const type of ['sign:e:post', 'sign:n:wall']) {
        world.loadBlocks({ blocks: { a: { x: 5, y: 1, z: 5, blockType: type, text: type, votes } } });
        assert.equal(world.getSignTextAt(5, 1, 5), type);
        world.addBlock({ x: 6, y: 1, z: 6, blockType: type, text: 'hello' });
        assert.equal(world.getSignTextAt(6, 1, 6), 'hello');
        // A vote comes back as the block with its new votes.
        world.addBlock({ x: 6, y: 1, z: 6, blockType: type, text: 'hello', votes });
        assert.equal(world.getSignVotesAt(6, 1, 6).thumbup, 2);
        world.removeBlockAt(6, 1, 6);
        assert.equal(world.getSignTextAt(6, 1, 6), '');
    }
    world.addBlock({ x: 6, y: 1, z: 6, blockType: 'sign:e:post', text: 'hello' });
    world.addBlock({ x: 6, y: 1, z: 6, blockType: 'stone' });
    assert.equal(world.getSignTextAt(6, 1, 6), '', 'gone with the sign');
});

test('signs: placing asks for the text in every state and sends it, and cancelling places nothing', () => {
    withoutItemHandlers(() => {
        const world = makeWorld();
        world.rebuildAfterChange = () => {};
        // On the floor, looking north, it comes out as a state that has its own name.
        const onFloor = makePlacingGame(world, 'sign', { x: 3, y: 0, z: 3 }, { x: 0, y: 1, z: 0 });
        onFloor.game.placeBlock();
        assert.equal(world.getBlockTypeAt(3, 1, 3), 'sign:s:post');
        assert.equal(world.getSignTextAt(3, 1, 3), 'Hola');
        assert.equal(onFloor.sent[0].payload.blockType, 'sign:s:post');
        assert.equal(onFloor.sent[0].payload.text, 'Hola');
        assert.equal(onFloor.counts.sign, 2);
        // Looking south it is the plain name, by the other path.
        const plain = makePlacingGame(world, 'sign', { x: 5, y: 0, z: 3 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -0.5, z: 1 });
        plain.game.placeBlock();
        assert.equal(world.getBlockTypeAt(5, 1, 3), 'sign');
        assert.equal(plain.sent[0].payload.text, 'Hola');
        const cancelled = makePlacingGame(world, 'sign', { x: 7, y: 0, z: 3 }, { x: 0, y: 1, z: 0 });
        cancelled.game.promptSignText = () => null;
        cancelled.game.placeBlock();
        assert.equal(world.getBlockTypeAt(7, 1, 3), null);
        assert.equal(cancelled.sent.length, 0);
        assert.equal(cancelled.counts.sign, 3);
        // The F key and the inspector read any state.
        const reader = new ctx.Game();
        const opened = [];
        Object.assign(reader, { world, breakDistance: 6, raycastBlock: () => ({ object: { userData: { blockPosition: { x: 3, y: 1, z: 3 } } }, faceIndex: 0 }), openSignReader: (text) => opened.push(text) });
        assert.equal(reader.tryReadSign(), true);
        assert.deepEqual(Array.from(opened), ['Hola']);
    });
});

test('signs: the board grows with the text and shows all of it; 288 bytes still fit', () => {
    const world = makeWorld();
    const short = world.signBoardLayout('Mine');
    const middle = world.signBoardLayout('Sheep farm to the north, past the old bridge and the mill');
    const long = world.signBoardLayout('Lorem ipsum dolor sit amet '.repeat(11).trim().slice(0, 288));
    assert.ok(short.width === 1 && short.height <= 0.6, 'a short text fits the post');
    assert.ok(middle.width > short.width && long.width >= middle.width && long.height > middle.height);
    assert.equal(short.lines.join(' '), 'Mine');
    assert.equal(long.truncated, false, '288 bytes are all on the board');
    // Letters stay readable: how wide one is on the board, in blocks.
    const letter = (layout) => layout.width / Math.max(...Array.from(layout.lines, (line) => line.length));
    assert.ok(letter(short) > 0.2);
    assert.ok(letter(long) > 0.04, `${letter(long)}`);
    // One long word breaks across lines rather than being lost.
    const word = world.signBoardLayout('x'.repeat(200));
    assert.equal(word.truncated, false);
    assert.equal(word.lines.join('').length, 200);
    // A translation after " // " is for the reader.
    assert.equal(world.signBoardLayout('Hola // Hello').lines.join(' '), 'Hola');
    assert.equal(world.signBoardLayout('see http://example.com/a').lines.join(' '), 'see http://example.com/a');
    // Something that would not fit ends in an ellipsis instead of being cut silently.
    const over = world.signBoardLayout('wide '.repeat(200));
    assert.equal(over.truncated, true);
    assert.ok(over.lines[over.lines.length - 1].endsWith('…'));
});

test('signs: the board reads from both sides, stands on its post, and keeps out of walls', () => {
    const world = makeWorld();
    const long = 'Bienvenido. Sigue la línea amarilla: pasa por todo y vuelve a la salida. F ante un cartel.';
    // A post in the open: centred on it, its foot halfway up the cell.
    const free = world.signBoardPlacement('sign', 3, 1, 3, long);
    assert.ok(free.width > 1 && near(free.x, 0) && near(free.z, 0));
    assert.ok(near(free.y - free.height / 2, 0.5));
    // The first state is a north-facing post: a wall to its east pushes the board west, and between
    // two walls it stays one block wide.
    put(world, 4, 1, 3, 'stone');
    const pushed = world.signBoardPlacement('sign', 3, 1, 3, long);
    assert.ok(pushed.x < 0 && near(pushed.x + pushed.width / 2, 0.5), 'its end at the wall');
    put(world, 2, 1, 3, 'stone');
    const tight = world.signBoardPlacement('sign', 3, 1, 3, long);
    assert.ok(near(tight.width, 1) && near(tight.x, 0));
    // A wall board lies against its wall: east-facing, on a wall to the west.
    const onWall = world.signBoardPlacement('sign:e:wall', 8, 1, 3, 'Mine');
    assert.ok(onWall.x < -0.4 && near(onWall.z, 0));
    assert.ok(near(onWall.y, 0.5));
    // A box with the text on both faces, the same picture, so neither is mirrored; a wall board's
    // back is plain. Aiming anywhere at it is aiming at the sign.
    const made = [];
    const realMesh = ctx.THREE.Mesh;
    ctx.THREE.Mesh = class { constructor(geometry, material) { this.geometry = geometry; this.material = material; this.userData = {}; made.push(this); } };
    ctx.THREE.BoxGeometry = class { constructor(...size) { this.size = size; } rotateY(angle) { this.turn = angle; } };
    ctx.THREE.MeshBasicMaterial = class extends Material {};
    try {
        const { mesh } = world.createSignLabel('Hola', 'sign:e:post', 9, 2, 4);
        assert.equal(mesh.material.length, 6);
        assert.equal(mesh.material[4], mesh.material[5]);
        assert.ok(mesh.material[4].map);
        assert.notEqual(mesh.material[0], mesh.material[4]);
        assert.equal(mesh.userData.isSignLabel, true);
        assert.deepEqual(JSON.parse(JSON.stringify(mesh.userData.blockPosition)), { x: 9, y: 2, z: 4 });
        assert.ok(near(mesh.geometry.turn, Math.PI / 2), 'turned in its geometry, for the face normals of a click');
        const { mesh: wall } = world.createSignLabel('Hola', 'sign:e:wall', 9, 2, 4);
        assert.notEqual(wall.material[5], wall.material[4]);
    } finally {
        ctx.THREE.Mesh = realMesh;
        delete ctx.THREE.BoxGeometry;
        delete ctx.THREE.MeshBasicMaterial;
    }
});

test('signs: nothing in the client or the server compares with the plain name any more', () => {
    const js = path.join(STATIC, 'js');
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith('.js') ? [path.join(dir, entry.name)] : []));
    for (const file of walk(js)) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, index) => {
            if (!/[=!]== 'sign'/.test(line)) return;
            // isSignBlockType itself, and the item in hand, which is never a state.
            const allowed = (file.endsWith('blockShapes.js') && /return type === 'sign'/.test(line)) || (file.endsWith('building.js') && /blockType === 'sign'/.test(line));
            assert.ok(allowed, `${path.relative(js, file)}:${index + 1}: ${line.trim()}`);
        });
    }
    const network = path.join(ROOT, 'pkg', 'network');
    for (const name of fs.readdirSync(network).filter((file) => file.endsWith('.go') && !file.endsWith('_test.go'))) {
        assert.ok(!/[=!]= "sign"/.test(fs.readFileSync(path.join(network, name), 'utf8').replace('base == "sign"', '')), name);
    }
});

test('the guide tells of the post, the wall board and the text on both sides, in both languages', () => {
    const guide = path.join(STATIC, 'guide');
    const read = (name) => fs.readFileSync(path.join(guide, name), 'utf8');
    assert.match(read('64_EN_Sign.md'), /post with a board/);
    assert.match(read('64_EN_Sign.md'), /wall board/);
    assert.match(read('64_EN_Sign.md'), /from both sides/);
    assert.match(read('64_ES_Cartel.md'), /poste de madera con un tablero/);
    assert.match(read('64_ES_Cartel.md'), /tablero de pared/);
    assert.match(read('64_ES_Cartel.md'), /por los dos lados/);
});

// ---------------------------------------------------------------------------------------
// Beds

function makeBedGame(night = false) {
    const parts = makeSittingGame();
    const sleeps = [];
    const tones = [];
    Object.assign(parts.game, {
        isNightTime: () => night,
        network: { connected: true, requestSleep: () => sleeps.push(1) },
        playTone: (tone) => tones.push(tone)
    });
    return { ...parts, sleeps, tones };
}
const avatarStub = () => {
    const axis = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
    return {
        position: new Vector3(),
        rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
        userData: { avatarParts: { head: { rotation: axis() }, leftLeg: { rotation: axis() }, rightLeg: { rotation: axis() }, leftArm: { rotation: axis() }, rightArm: { rotation: axis() } } }
    };
};

test('beds: a frame, a mattress and a pillow at the head, in the same name, with the mattress to stand on', () => {
    const world = makeWorld();
    const place = (look) => world.getPlacementBlocks('bed', 3, 1, 3, { normal: { x: 0, y: 1, z: 0 }, hit: { x: 3, y: 1, z: 3 }, look })[0].blockType;
    assert.equal(place({ x: 0, y: -0.5, z: -1 }), 'bed', 'head away from you: north is the plain name');
    assert.equal(place({ x: 1, y: -0.5, z: 0 }), 'bed:e');
    assert.equal(place({ x: 0, y: -0.5, z: 1 }), 'bed:s');
    assert.equal(place({ x: -1, y: -0.5, z: 0 }), 'bed:w');
    assert.equal(world.blockTypes.bed.state.facing, 'n', 'a saved bed is one of them');
    assert.equal(world.blockTypes.bed.name, 'Bed');
    for (const type of ['bed', 'bed:e', 'bed:s', 'bed:w']) {
        assert.equal(world.getDropTypeForBlock(type), 'bed');
        const boxes = JSON.parse(JSON.stringify(world.shapes.boxes(world.registry.id(type))));
        assert.ok(boxes.length >= 4 && boxes.every((box) => box[0] >= 0 && box[3] <= 1 && box[2] >= 0 && box[5] <= 1), type);
        assert.deepEqual(JSON.parse(JSON.stringify(world.shapes.collision(world.registry.id(type)))), [[0, 0, 0, 1, 9 / 16, 1]]);
        assert.equal(world.registry.solid[world.registry.id(type)], 1);
    }
    // The pillow, the box above the mattress, is at the head; the top is painted to match.
    const pillow = (type) => world.shapes.boxes(world.registry.id(type)).reduce((a, b) => (b[4] > a[4] ? b : a));
    assert.ok(pillow('bed')[5] < 0.5);
    assert.ok(pillow('bed:s')[2] > 0.5);
    assert.ok(pillow('bed:e')[0] > 0.5);
    assert.ok(pillow('bed:w')[3] < 0.5);
    const f = new ctx.BlockTextureFactory();
    const whiteAt = (pattern, u, v) => {
        const s = f.createSurface(32, false);
        f.patterns()[pattern](s, null, 7);
        const i = Math.floor(v * 32) * 32 + Math.floor(u * 32);
        return s.color[i * 3 + 2] > 150;
    };
    assert.ok(whiteAt('bed_top_n', 0.5, 0.2) && !whiteAt('bed_top_n', 0.5, 0.8));
    assert.ok(whiteAt('bed_top_s', 0.5, 0.8) && !whiteAt('bed_top_s', 0.5, 0.2));
    assert.ok(whiteAt('bed_top_e', 0.8, 0.5) && !whiteAt('bed_top_e', 0.2, 0.5));
    assert.ok(whiteAt('bed_top_w', 0.2, 0.5) && !whiteAt('bed_top_w', 0.8, 0.5));
    assert.equal(world.getFaceTextureSpecs('bed:e').top.pattern, 'bed_top_e');
    assert.equal(world.getFaceTextureSpecs('bed').top.pattern, 'bed_top_n');
    // They turn with a build.
    assert.equal(ctx.constructionTurnType('bed', 1, world.blockTypes), 'bed:e');
    assert.equal(ctx.constructionTurnType('bed:w', 1, world.blockTypes), 'bed');
    assert.ok(!ctx.isBedBlockType('bedrock') && ctx.isBedBlockType('bed:e') && ctx.isBedBlockType('bed'));
});

test('beds: right click lies you down at the pillow looking up; no walking; Sneak gets you up', () => {
    const { world, game, controller, camera, messages, sleeps } = makeBedGame(false);
    put(world, 3, 1, 3, 'bed:e');
    assert.equal(game.seatTrySit({ x: 3, y: 1, z: 3 }), true);
    assert.ok(game.seated && game.seated.lying);
    const eye = ctx.bedEyePosition(3, 1, 3, 9 / 16, 'e');
    assert.ok(near(camera.position.x, eye.x) && near(camera.position.y, eye.y) && near(camera.position.z, eye.z));
    assert.ok(eye.x > 3.5, 'towards the head');
    assert.ok(eye.y < 2, 'low, inside its cell');
    assert.ok(controller.pitch > 0.8, 'looking up');
    assert.ok(near(controller.yaw, Math.PI / 2), 'towards the foot, to the west');
    // By day: you rest. Time goes on: the server is not asked.
    assert.equal(sleeps.length, 0);
    assert.ok(messages.some((text) => /Sneak gets up/.test(text)));
    assert.ok(messages.includes('You can only sleep at night'));
    controller.keys.forward = true;
    controller.moveInput.y = 1;
    controller.keys.jump = true;
    for (let i = 0; i < 30; i++) controller.update(1 / 30);
    assert.ok(near(camera.position.x, eye.x) && near(camera.position.y, eye.y), 'did not move');
    controller.keys.forward = false;
    controller.keys.jump = false;
    controller.moveInput.y = 0;
    assert.equal(game.getMountState().key, 'bed');
    game.seatStandUp();
    assert.equal(game.seated, null);
    assert.equal(controller.seat, null);
    assert.equal(controller.pitch, 0);
    assert.ok(near(camera.position.y, 1 + 1.62), 'on the floor beside it');
    assert.equal(game.getMountState(), null);
});

test('beds: at night lying down asks to sleep, once, through the same path; F asks again', () => {
    const { world, game, sleeps, messages } = makeBedGame(true);
    put(world, 3, 1, 3, 'bed');
    game.raycastBlock = () => ({ object: { userData: { blockPosition: { x: 3, y: 1, z: 3 } } }, faceIndex: 0 });
    assert.equal(game.trySleepInBed(), true);
    assert.ok(game.seated && game.seated.lying);
    assert.equal(sleeps.length, 1);
    assert.ok(!messages.includes('You can only sleep at night'));
    // Lying, looking up at nothing: F still works.
    game.raycastBlock = () => null;
    assert.equal(game.trySleepInBed(), true);
    assert.equal(sleeps.length, 2);
    // And right click on the same bed.
    game.seatTrySit({ x: 3, y: 1, z: 3 });
    assert.equal(sleeps.length, 3);
    // Offline the night ends here, as it did.
    const alone = makeBedGame(true);
    put(alone.world, 3, 1, 3, 'bed');
    alone.game.network = { connected: false };
    alone.game.timeOfDay = 0.9;
    alone.game.seatTrySit({ x: 3, y: 1, z: 3 });
    assert.equal(alone.game.timeOfDay, 0);
    assert.equal(alone.game.weatherState, 'clear');
    // Looking at something else, F is for the next thing.
    const other = makeBedGame(true);
    put(other.world, 3, 1, 3, 'stone');
    other.game.raycastBlock = () => ({ object: { userData: { blockPosition: { x: 3, y: 1, z: 3 } } }, faceIndex: 0 });
    assert.equal(other.game.trySleepInBed(), false);
    other.game.raycastBlock = () => null;
    assert.equal(other.game.trySleepInBed(), false);
});

test('beds: a bed that goes releases you, a saved one works, a roof or someone else stops you', () => {
    for (const change of ['air', 'stone']) {
        const { world, game, controller, camera } = makeBedGame();
        put(world, 3, 1, 3, 'bed');
        game.seatTrySit({ x: 3, y: 1, z: 3 });
        game.seatUpdate();
        assert.ok(game.seated, 'still lying while it stands');
        put(world, 3, 1, 3, change);
        game.seatUpdate();
        assert.equal(game.seated, null, change);
        assert.equal(controller.seat, null);
        for (let i = 0; i < 40; i++) controller.update(1 / 30);
        assert.ok(camera.position.y - 1.62 >= 1 - 1e-6, 'not stuck below the floor');
    }
    const roofed = makeBedGame();
    put(roofed.world, 3, 1, 3, 'bed');
    put(roofed.world, 3, 2, 3, 'stone');
    roofed.game.seatTrySit({ x: 3, y: 1, z: 3 });
    assert.equal(roofed.game.seated, undefined);
    assert.match(roofed.messages[0], /no room to lie down/);
    // Another player in it, whose body sticks out of the cell.
    const shared = makeBedGame();
    put(shared.world, 3, 1, 3, 'bed');
    const eye = ctx.bedEyePosition(3, 1, 3, 9 / 16, 'n');
    shared.game.otherPlayerMeshes.set('x', { position: new Vector3(3.5, 1.7, 5.3), userData: { seatEye: eye } });
    shared.game.seatTrySit({ x: 3, y: 1, z: 3 });
    assert.equal(shared.game.seated, undefined);
    assert.match(shared.messages[0], /already lying/);
    // A sitter's chair is still theirs.
    const chair = makeBedGame();
    put(chair.world, 3, 1, 3, 'oak_chair');
    chair.game.otherPlayerMeshes.set('x', { position: new Vector3(3.5, 1.2, 3.5), userData: { seatEye: { x: 3.5, y: 2.45, z: 3.5 } } });
    chair.game.seatTrySit({ x: 3, y: 1, z: 3 });
    assert.equal(chair.game.seated, undefined);
    assert.match(chair.messages[0], /already sitting/);
    // Sitting is what it was.
    const seat = makeBedGame();
    put(seat.world, 3, 1, 3, 'oak_chair');
    seat.game.seatTrySit({ x: 3, y: 1, z: 3 });
    assert.equal(seat.game.getMountState().key, 'seat');
    assert.ok(!seat.game.seated.lying);
});

test('beds: others see you flat on it: the head on the pillow, and upright again afterwards', () => {
    const game = new ctx.Game();
    for (const [facing, head] of Object.entries({ n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] })) {
        const eye = ctx.bedEyePosition(3, 1, 3, 9 / 16, facing);
        const yaw = ctx.SEAT_YAW[facing];
        const feet = ctx.bedAvatarFeet(eye, yaw);
        // The feet are a body's length from the eye, away from the head, at a mattress's height.
        assert.ok(near(feet.x, eye.x - head[0] * 1.55) && near(feet.z, eye.z - head[1] * 1.55), facing);
        assert.ok(feet.y > 1 + 9 / 16 && feet.y < eye.y, 'on the mattress, under the eye');
        // The model's local -z goes to the head (see poseLying): rotated about y by the body's yaw.
        assert.ok(near(-Math.sin(yaw), head[0]) && near(-Math.cos(yaw), head[1]), facing);
        const avatar = avatarStub();
        game.poseLying(avatar, yaw, feet);
        assert.equal(avatar.rotation.order, 'YXZ');
        assert.ok(near(avatar.rotation.x, -Math.PI / 2) && near(avatar.rotation.y, yaw));
        assert.ok(near(avatar.position.x, feet.x) && near(avatar.position.y, feet.y) && near(avatar.position.z, feet.z));
        game.poseUpright(avatar);
        assert.equal(avatar.rotation.x, 0);
        assert.equal(avatar.rotation.order, 'XYZ');
    }
    // Standing avatars are left alone.
    const standing = avatarStub();
    standing.rotation.x = 0.3;
    game.poseUpright(standing);
    assert.equal(standing.rotation.x, 0.3);
    // A remote player, from what playerMove says: the key no species answers to.
    const remote = new ctx.Game();
    const avatar = avatarStub();
    avatar.position.lerp = () => avatar.position;
    Object.assign(avatar.userData, { initialized: true, appearanceKey: 'same', lastPosition: new Vector3(), targetPosition: new Vector3() });
    Object.assign(remote, {
        otherPlayerMeshes: new Map([['p', avatar]]), remotePlayerNames: new Map(),
        normalizeHairStyle: (style) => style, getPlayerAppearance: () => ({ key: 'same' }), updateAvatarNameTag() {}, updateAvatarHeldItem() {},
        normalizePlayerAction: (action) => action, applyAvatarHeadPitch() {}, syncRemoteMount() {}, animatePlayerAvatar() {}, applyAvatarAction() {}
    });
    assert.ok(!ctx.getMobSpecies('bed'), 'no mob answers to the key');
    const yaw = ctx.SEAT_YAW.e;
    const eye = ctx.bedEyePosition(3, 1, 3, 9 / 16, 'e');
    remote.updateOtherPlayer({ id: 'p', ...eye, yaw: 0, pitch: 1, mount: 'bed', mountYaw: yaw });
    const feet = ctx.bedAvatarFeet(eye, yaw);
    assert.ok(near(avatar.userData.targetPosition.x, feet.x) && near(avatar.userData.targetPosition.y, feet.y));
    assert.deepEqual(JSON.parse(JSON.stringify(avatar.userData.seatEye)), JSON.parse(JSON.stringify(eye)));
    remote.updateRemotePlayers(0.016);
    assert.ok(near(avatar.rotation.x, -Math.PI / 2) && near(avatar.rotation.y, yaw));
    assert.ok(near(avatar.position.x, feet.x) && near(avatar.position.z, feet.z));
    // They get up: on their feet at once, under their eye as anyone.
    remote.updateOtherPlayer({ id: 'p', x: 5.5, y: 2.62, z: 3.5, yaw: 0, pitch: 0, mount: '', mountYaw: 0 });
    remote.updateRemotePlayers(0.016);
    assert.equal(avatar.rotation.x, 0);
    assert.equal(avatar.userData.seatEye, null);
    assert.ok(near(avatar.userData.targetPosition.y, 1));
});

test('beds: placing one binds the respawn point in every direction, and breaking that one unbinds it', () => {
    withoutItemHandlers(() => {
        for (const [look, type] of [[{ x: 0, y: -0.5, z: -1 }, 'bed'], [{ x: 1, y: -0.5, z: 0 }, 'bed:e'], [{ x: 0, y: -0.5, z: 1 }, 'bed:s'], [{ x: -1, y: -0.5, z: 0 }, 'bed:w']]) {
            const world = makeWorld();
            world.rebuildAfterChange = () => {};
            const { game, sent, messages } = makePlacingGame(world, 'bed', { x: 3, y: 0, z: 3 }, { x: 0, y: 1, z: 0 }, look);
            game.placeBlock();
            assert.equal(world.getBlockTypeAt(3, 1, 3), type);
            assert.equal(sent[0].payload.blockType, type);
            assert.ok(messages.includes('Respawn point updated to your bed'), type);
            assert.ok(near(game.respawnPoint.x, 3.5) && near(game.respawnPoint.z, 3.5), type);
            assert.ok(near(game.respawnPoint.y, 1 + 1 + 1.62), 'on top of it, as it was');
            assert.equal(game.isRespawnBoundToBlock({ x: 3, y: 1, z: 3 }), true);
        }
    });
    const source = fs.readFileSync(path.join(STATIC, 'js', 'game', 'building.js'), 'utf8');
    assert.match(source, /isBedBlockType\(blockType\) && this\.isRespawnBoundToBlock\(position\)/, 'any state of the bed unbinds');
});

test('beds: lying goes through the item-use handler, and crouching still builds against it', () => {
    const { world, game } = makeBedGame();
    put(world, 3, 1, 3, 'bed:s');
    const handler = ctx.ITEM_USE_HANDLERS.find((candidate) => /seatTrySit/.test(candidate.toString()));
    const hit = { object: { userData: { blockPosition: { x: 3, y: 1, z: 3 } } }, faceIndex: 0 };
    game.cameraController.isCrouching = true;
    assert.equal(handler.call(game, 'stone', hit), false);
    assert.equal(game.seated, undefined);
    game.cameraController.isCrouching = false;
    assert.equal(handler.call(game, 'stone', hit), true);
    assert.ok(game.seated.lying);
});

test('the guide tells how to lie down, in both languages', () => {
    const guide = path.join(STATIC, 'guide');
    const read = (name) => fs.readFileSync(path.join(guide, name), 'utf8');
    assert.match(read('63_EN_Bed.md'), /## Lying down/);
    assert.match(read('63_EN_Bed.md'), /Sneak/);
    assert.match(read('63_ES_Cama.md'), /## Tumbarse/);
    assert.match(read('63_ES_Cama.md'), /Agacharte/);
});
