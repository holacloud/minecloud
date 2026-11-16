// Node tests for the tabletop objects (js/game/tabletop.js): every one is a placeable block with an English
// name, the decoration tag and a recipe of real items; its boxes stay in the cell and low enough to stand on
// a table; those with a facing turn, the others never do; the tops are painted from the parts and turn with
// the piece; the white and black chess pieces keep their colours on every side.
// Run with: node --test test/js/tabletop.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { anyStub, loadScripts } = require('./support/game.js');

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
}

function load() {
    const THREE = new Proxy({ Vector3, Vector2: Vector3, Vector4: Vector3 }, { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const context = vm.createContext({
        console: { ...console, warn() {} }, Math, Map, WeakMap, Set, Object, Array, JSON, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array,
        Int8Array, Int16Array, Int32Array, Float32Array, Float64Array, THREE, document: anyStub(), navigator: {},
        performance: { now: () => 0 }, requestAnimationFrame: () => 0, Worker: class { postMessage() {} },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, location: { search: '', protocol: 'http:', host: 'test' }, URLSearchParams,
        setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {}, WebSocket: class {}, Audio: class {}, Image: class {}, AudioContext: class {},
        fetch: () => new Promise(() => {}), addEventListener() {}, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1
    });
    context.window = context;
    loadScripts(context, () => true);
    vm.runInContext(`Object.assign(this, { WorldRenderer, Game, TABLETOP_OBJECTS, TEXTURE_PATTERNS, BlockTextureFactory, itemTagsOf, tabletopLocal, tabletopTopPart, tabletopSidePart });`, context);
    return context;
}

const ctx = load();
const world = new ctx.WorldRenderer({ add() {}, remove() {} });
const blockTypes = world.blockTypes;
const plain = (value) => JSON.parse(JSON.stringify(value));
const IDS = ['open_book', 'book_stack', 'inkwell', 'scroll', 'meal_plate', 'fruit_bowl', 'tea_set', 'jug', 'chessboard', 'sewing_basket'];
const FACING = ['open_book', 'book_stack', 'inkwell', 'scroll', 'tea_set', 'chessboard', 'sewing_basket'];

function recipes() {
    const game = Object.create(ctx.Game.prototype);
    Object.assign(game, { inventory: [], inventoryCounts: {}, craftingRecipes: [], escapeInstall() {} });
    game.registerExpansionContent();
    return game.craftingRecipes;
}
const RECIPES = recipes();

test('every object is a placeable block with an English name of its own and the decoration tag', () => {
    assert.deepEqual(Object.keys(ctx.TABLETOP_OBJECTS).sort(), [...IDS].sort());
    const names = new Map();
    for (const [id, def] of Object.entries(blockTypes)) {
        if (!def.variantOf && def.name) names.set(def.name, (names.get(def.name) || 0) + 1);
    }
    for (const id of IDS) {
        const def = blockTypes[id];
        assert.ok(def, `${id} is missing`);
        assert.ok(!def.itemOnly && !def.variantOf, id);
        assert.ok(world.registry.ids[id] !== undefined, `${id} is not a world block`);
        assert.match(def.name, /^[A-Z][A-Za-z ]+$/, id);
        assert.equal(names.get(def.name), 1, def.name);
        const tags = plain(ctx.itemTagsOf(id, blockTypes));
        assert.ok(tags.includes('decoration'), `${id}: ${tags}`);
    }
});

test('each has a recipe of real items that are not its own', () => {
    for (const id of IDS) {
        const recipe = RECIPES.find((r) => r.output.type === id);
        assert.ok(recipe, `${id} has no recipe`);
        assert.ok(recipe.output.amount >= 1, id);
        for (const input of recipe.inputs) {
            assert.ok(blockTypes[input.type] && !blockTypes[input.type].variantOf, `${id}: ${input.type} is not an item`);
            assert.notEqual(input.type, id);
            assert.ok(Number.isInteger(input.amount) && input.amount > 0, id);
        }
    }
    const ids = RECIPES.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
});

test('the boxes stay in the cell and low enough to stand on a table, in every state', () => {
    for (const [name, def] of Object.entries(blockTypes)) {
        const base = def.variantOf || name;
        if (!IDS.includes(base)) continue;
        const id = world.registry.id(name);
        const boxes = world.shapes.boxes(id, 0);
        assert.ok(boxes.length > 0, name);
        for (const box of boxes) {
            for (let i = 0; i < 3; i++) assert.ok(box[i] >= 0 && box[i + 3] <= 1 && box[i] < box[i + 3], `${name}: ${box}`);
            assert.ok(box[4] <= 0.5 + 1e-9, `${name} rises to ${box[4]}`);
        }
        const collision = world.shapes.collision ? world.shapes.collision(id, 0) : null;
        if (collision) for (const box of collision) assert.ok(box[4] <= 0.5 + 1e-9 && box[1] >= 0, `${name}: collision ${box}`);
    }
    // The chessboard is a flat board with its pieces; the plate is low.
    const top = (name) => Math.max(...world.shapes.boxes(world.registry.id(name), 0).map((box) => box[4]));
    assert.ok(top('chessboard') <= 6 / 16);
    assert.ok(Math.min(...world.shapes.boxes(world.registry.id('chessboard'), 0).map((box) => box[4])) <= 2 / 16);
    assert.ok(top('meal_plate') <= 4 / 16);
});

test('those with a facing turn, the others never do', () => {
    for (const id of IDS) {
        const turns = FACING.includes(id);
        for (const facing of ['e', 's', 'w']) assert.equal(Boolean(blockTypes[`${id}:${facing}`]), turns, `${id}:${facing}`);
    }
    for (const id of FACING) {
        const north = plain(world.shapes.boxes(world.registry.id(id), 0));
        const east = plain(world.shapes.boxes(world.registry.id(`${id}:e`), 0));
        assert.notDeepEqual(north, east, `${id} looks the same turned east`);
        // Each facing paints its own top, so the materials differ too.
        assert.notEqual(blockTypes[id].materialKey, blockTypes[`${id}:e`].materialKey, id);
        assert.notEqual(blockTypes[`${id}:e`].faces.top.pattern, blockTypes[`${id}:w`].faces.top.pattern, id);
    }
});

test('a top is painted as the highest part over it, and turns with the piece', () => {
    const board = ctx.TABLETOP_OBJECTS.chessboard;
    // The white king stands at column 10, row 3 of the board facing north.
    const king = ctx.tabletopTopPart(board.parts, 10.5, 3.5);
    assert.equal(king.color, 0xf4f0e4);
    // Turned east, the same point of the world is another of the board's; turned back it is the king.
    for (const facing of ['n', 'e', 's', 'w']) {
        const world = { n: [10.5, 3.5], e: [12.5, 10.5], s: [5.5, 12.5], w: [3.5, 5.5] }[facing];
        const [x, z] = plain(ctx.tabletopLocal(world[0], world[1], facing));
        assert.ok(Math.abs(x - 10.5) < 1e-9 && Math.abs(z - 3.5) < 1e-9, `${facing}: ${x}, ${z}`);
    }
    const plate = ctx.TABLETOP_OBJECTS.meal_plate;
    assert.equal(ctx.tabletopTopPart(plate.parts, 6, 6).color, 0xb07a3a, 'the bread lies on the plate');
});

test('the white and the black chess pieces keep their colours on every side', () => {
    const board = ctx.TABLETOP_OBJECTS.chessboard;
    for (const part of board.parts.slice(1)) {
        const [x0, y0, z0, x1, y1, z1] = part.box;
        const h = (y0 + y1) / 2;
        for (const u of [(x0 + x1) / 2, 16 - (x0 + x1) / 2, (z0 + z1) / 2, 16 - (z0 + z1) / 2]) {
            assert.equal(ctx.tabletopSidePart(board.parts, u, h).color, part.color, `piece at ${x0}, ${z0} seen at u ${u}`);
        }
    }
});

test('every top and side paints, with more than one colour', () => {
    const f = new ctx.BlockTextureFactory();
    const names = Object.keys(ctx.TEXTURE_PATTERNS).filter((name) => name.startsWith('tabletop_'));
    assert.equal(names.length, IDS.length + FACING.length * 4 + (IDS.length - FACING.length));
    for (const name of names) {
        const s = f.createSurface(32, false);
        ctx.TEXTURE_PATTERNS[name].paint(f, s, null, 7);
        const seen = new Set();
        for (let i = 0; i < 32 * 32; i++) seen.add(`${Math.round(s.color[i * 3] / 32)},${Math.round(s.color[i * 3 + 1] / 32)},${Math.round(s.color[i * 3 + 2] / 32)}`);
        assert.ok(seen.size > 1, `${name}: ${seen.size} colours`);
    }
});
