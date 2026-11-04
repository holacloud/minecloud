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
    for (const name of ['furniture', 'seating', 'storage', 'decor', 'mirrors']) assert.ok(scripts.includes(`js/game/${name}.js`), `index.html loads ${name}.js`);
    for (const src of scripts) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, LightField, CameraController, BLOCK_SHAPES, TEXTURE_PATTERNS, Game,
        GAME_CONTENT_HOOKS, MODAL_PANELS, FURNITURE_COLORS, STORAGE_KINDS, DECOR_PAINTINGS, DECOR_GLASS, shapeStateName, constructionTurnType,
        storageClickAmount, storageApplyOutcome, decorClockAngles, decorClockText, seatEyePosition, seatStandOffsets, STORAGE_MAX_STACK, STORAGE_MAX_AMOUNT,
        furnShelfBooks, FURN_SHELF_ROWS, BlockTextureFactory,
        mirrorFacesOf, mirrorFaceInView, mirrorLineClear, mirrorPickFace, mirrorPlaneKey, mirrorQuadPositions, mirrorTargetSize, mirrorRefreshInterval,
        MIRROR_RANGE, MIRROR_TARGET_MAX });`, context);
    return context;
}

const ctx = loadGame();

const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
const PIECES = ['oak_chair', 'birch_chair', 'dark_oak_chair', 'stool', 'bench', 'table', 'bedside_table', 'desk', 'chest', 'barrel', 'wardrobe', 'bookshelf',
    'wall_shelf', 'workbench', 'oven', 'sink', 'fridge', 'toilet', 'bathtub', 'candle', 'lantern', 'table_lamp', 'floor_lamp', 'chandelier', 'wall_clock', 'flower_pot', 'vase',
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
        if (!/furnit|FURNITURE|DECOR_GLASS|Build Chest|Stain|Wall Mirrors/.test(source)) continue;
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
    const pages = [223, 224, 225, 226, 227, 228, 229, 230, 231, 232];
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

test('mirrors: only a face that looks at the camera, in view and in range, reflects', () => {
    const [face] = ctx.mirrorFacesOf(mirrorDef('s'), 0, 1, 0); // silver looks to +z, at z = 1/16
    const looking = [0, 0, -1];
    assert.ok(ctx.mirrorFaceInView(face, [0.5, 1.5, 5], looking));
    assert.ok(!ctx.mirrorFaceInView(face, [0.5, 1.5, -5], [0, 0, 1]), 'from behind');
    assert.ok(!ctx.mirrorFaceInView(face, [0.5, 1.5, 5], [0, 0, 1]), 'looking away');
    assert.ok(ctx.mirrorFaceInView(face, [0.5, 1.5, 1], [0, 0, 1]), 'right next to it, whatever the view');
    assert.ok(!ctx.mirrorFaceInView(face, [0.5, 1.5, ctx.MIRROR_RANGE + 1], looking), 'too far');
});

test('mirrors: the nearest visible plane wins, walls hide faces, and the plane in use is sticky', () => {
    const near1 = ctx.mirrorFacesOf(mirrorDef('s'), 0, 1, 0)[0];
    const far1 = ctx.mirrorFacesOf(mirrorDef('s'), 0, 1, -6)[0];
    const eye = [0.5, 1.5, 5];
    const looking = [0, 0, -1];
    assert.equal(ctx.mirrorPickFace([far1, near1], eye, looking, null, noWalls), near1);
    assert.equal(ctx.mirrorPickFace([], eye, looking, null, noWalls), null);
    // A wall between the camera and the near mirror: the far one is hidden by it too.
    const wallAt2 = (x, y, z) => z === 2;
    assert.equal(ctx.mirrorLineClear(wallAt2, eye, near1.center), false);
    assert.equal(ctx.mirrorLineClear(noWalls, eye, near1.center), true);
    assert.equal(ctx.mirrorPickFace([far1, near1], eye, looking, null, wallAt2), null);
    // Beside the nearest, a mirror that is slightly further but already in use stays.
    const side = ctx.mirrorFacesOf(mirrorDef('s'), 2, 1, -0)[0];
    const sideways = ctx.mirrorFacesOf(mirrorDef('e'), -3, 1, 1)[0];
    const from = [1.5, 1.5, 4];
    const keys = [side, sideways].map(ctx.mirrorPlaneKey);
    assert.notEqual(keys[0], keys[1]);
    const dir = [-0.5, 0, -0.85];
    const first = ctx.mirrorPickFace([side, sideways], from, dir, null, noWalls);
    assert.equal(first, side);
    assert.equal(ctx.mirrorPickFace([side, sideways], from, dir, keys[1], noWalls), sideways);
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
function mirrorGame(world) {
    const game = new ctx.Game();
    const renders = [];
    const hand = { visible: true };
    const tag = { visible: true };
    const avatar = { visible: false, userData: { nameSprite: tag } };
    Object.assign(game, {
        world,
        scene: { add() {} },
        camera: {
            position: { x: 0.5, y: 1.5, z: 5 }, near: 0.1, far: 500, matrixWorld: {},
            updateMatrixWorld() {},
            getWorldDirection: (v) => v.set(0, 0, -1)
        },
        renderer: {
            autoClear: true, outputEncoding: 'srgb', shadowMap: { autoUpdate: true }, state: { buffers: { depth: { setMask() {} } } },
            getDrawingBufferSize: (v) => v.set(1000, 500), getRenderTarget: () => null, setRenderTarget() {},
            render: () => renders.push({ hand: hand.visible, avatar: avatar.visible, tag: tag.visible, shadows: game.renderer.shadowMap.autoUpdate })
        },
        cameraViewMode: 'first', localPlayerAvatar: avatar, firstPersonHand: hand,
        updateLocalPlayerAvatar() {},
        mirrorsAimCamera() {},
        mirrorsBuildQuads() {
            game.mirrorQuads = { visible: false, geometry: { setAttribute() {}, computeBoundingSphere() {} }, material: { uniforms: { reflection: {} } } };
        }
    });
    return { game, renders, hand, tag, avatar };
}

test('mirrors: with no mirror near, no pass, no quads and no target', () => {
    const world = makeWorld();
    const { game, renders } = mirrorGame(world);
    for (let i = 0; i < 30; i++) game.mirrorsRender(0.05);
    assert.equal(renders.length, 0);
    assert.equal(game.mirrorQuads, undefined);
    assert.equal(game.mirrorTarget, undefined);
});

test('mirrors: looking at one draws one pass with the player in it, the hands out, and restores everything', () => {
    const world = makeWorld();
    put(world, 0, 1, 0, 'wall_mirror:s');
    const { game, renders, hand, tag, avatar } = mirrorGame(world);
    game.mirrorsRender(0.016);
    assert.equal(renders.length, 1, 'one pass per frame');
    assert.equal(game.mirrorQuads.visible, true);
    const [pass] = renders;
    assert.equal(pass.hand, false);
    assert.equal(pass.avatar, true);
    assert.equal(pass.tag, false);
    assert.equal(pass.shadows, false, 'the shadow map is not drawn again');
    assert.equal(hand.visible, true);
    assert.equal(avatar.visible, false, 'in first person the avatar is only in the mirror');
    assert.equal(tag.visible, true);
    assert.equal(game.renderer.shadowMap.autoUpdate, true);
    // Turning round: the pass stops at once, and the target goes after a while.
    game.camera.getWorldDirection = (v) => v.set(0, 0, 1);
    const count = renders.length;
    for (let i = 0; i < 40; i++) game.mirrorsRender(0.2);
    assert.equal(renders.length, count);
    assert.equal(game.mirrorQuads.visible, false);
    assert.equal(game.mirrorTarget, null);
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
