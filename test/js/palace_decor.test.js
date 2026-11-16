// Node tests for the palaces' materials and furniture (js/game/palace_decor.js): every block is there with an
// English name and a recipe made of real items, the stairs, slabs and panes work like the others of their kind,
// the shapes stay in their cells (but the throne, two high), the throne is sat on below only, the sundial and the
// astrolabe tell what the sun says. Every script of index.html runs in one VM context, so the recipes are checked
// against the whole catalogue.
// Run with: node --test test/js/palace_decor.test.js

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
    vm.runInContext(`Object.assign(this, { WorldRenderer, Game, PALACE_TILES, PALACE_THRONES, FURNITURE_COLORS, itemTagsOf, gameLangSet: typeof gameLangSet === 'function' ? gameLangSet : null,
        palaceDecorSundialHours, palaceDecorSunAltitude });`, context);
    return context;
}

const ctx = load();
const world = new ctx.WorldRenderer({ add() {}, remove() {} });
const blockTypes = world.blockTypes;
const plain = (value) => JSON.parse(JSON.stringify(value));
const TILES = plain(ctx.PALACE_TILES).map(([word]) => `${word}_glazed_tile`);
const THRONES = plain(ctx.PALACE_THRONES).map(([id]) => id);
const BANNERS = plain(ctx.FURNITURE_COLORS).map(([color]) => `${color}_banner`);
const IDS = [
    'sandstone', 'cut_sandstone', 'sandstone_stairs', 'sandstone_slab',
    ...TILES.flatMap((tile) => [tile, `${tile}_stairs`, `${tile}_slab`]),
    'white_stucco', 'red_stucco', 'magma_rock', 'snow_block', 'packed_ice',
    ...THRONES, ...BANNERS, 'fountain', 'lattice_screen', 'paper_screen', 'statue', 'astrolabe', 'sundial', 'globe'
];

// The recipes, as the game gathers them when it starts.
function recipes() {
    const game = Object.create(ctx.Game.prototype);
    Object.assign(game, { inventory: [], inventoryCounts: {}, craftingRecipes: [], escapeInstall() {} });
    game.registerExpansionContent();
    return game.craftingRecipes;
}
const RECIPES = recipes();

test('every block is there, placeable, with an English name and the tags of what it is', () => {
    assert.equal(IDS.length, 54);
    for (const id of IDS) {
        const def = blockTypes[id];
        assert.ok(def, `${id} is missing`);
        assert.ok(!def.itemOnly && !def.variantOf, id);
        assert.ok(world.registry.ids[id] !== undefined, `${id} is not a world block`);
        assert.match(def.name, /^[A-Z][A-Za-z ]+$/, id);
        assert.ok(plain(ctx.itemTagsOf(id, blockTypes)).length > 0, `${id} has no tags`);
    }
    const tags = (id) => plain(ctx.itemTagsOf(id, blockTypes));
    assert.ok(tags('gilded_throne').includes('furniture') && !tags('gilded_throne').includes('building'));
    assert.ok(tags('red_banner').includes('decoration') && tags('red_banner').includes('red'));
    assert.ok(tags('astrolabe').includes('science') && tags('sundial').includes('science'));
    assert.ok(tags('turquoise_glazed_tile').includes('cyan') && tags('blue_glazed_tile').includes('blue'));
    assert.ok(tags('sandstone').includes('building') && tags('white_stucco').includes('building'));
    // Names that are no one else's.
    const names = new Map();
    for (const [id, def] of Object.entries(blockTypes)) {
        if (!def.variantOf && def.name) names.set(def.name, [...(names.get(def.name) || []), id]);
    }
    for (const id of IDS) assert.equal(names.get(blockTypes[id].name).length, 1, `${blockTypes[id].name}: ${names.get(blockTypes[id].name)}`);
});

test('each has a recipe of real items that are not its own, and the glazes and the stucco are the chemistry the guide tells', () => {
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
    const inputsOf = (id) => plain(RECIPES.find((r) => r.output.type === id).inputs.map((input) => input.type).sort());
    assert.deepEqual(inputsOf('blue_glazed_tile'), ['brick', 'element_co', 'sand']);
    assert.deepEqual(inputsOf('white_glazed_tile'), ['brick', 'element_sn', 'sand']);
    assert.deepEqual(inputsOf('green_glazed_tile'), ['brick', 'element_cu', 'sand']);
    assert.deepEqual(inputsOf('turquoise_glazed_tile'), ['baking_soda', 'brick', 'element_cu', 'sand']);
    assert.deepEqual(inputsOf('red_glazed_tile'), ['brick', 'rust_pigment', 'sand']);
    assert.deepEqual(inputsOf('white_stucco'), ['quicklime', 'sand', 'water_flask']);
    assert.deepEqual(inputsOf('red_stucco'), ['rust_pigment', 'white_stucco']);
    assert.deepEqual(inputsOf('sandstone'), ['sand']);
    // The recipe ids are no one else's.
    const ids = RECIPES.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
});

test('stairs, slabs and panes are made like the others of their kind', () => {
    for (const base of ['sandstone', ...TILES]) {
        const stairs = blockTypes[`${base}_stairs`];
        assert.equal(stairs.shape, 'stairs');
        assert.equal(stairs.textureOf, base);
        const turned = blockTypes[`${base}_stairs:e:top`];
        assert.ok(turned && turned.variantOf === `${base}_stairs` && turned.state.facing === 'e' && turned.state.half === 'top', base);
        const slab = blockTypes[`${base}_slab`];
        assert.equal(slab.height, 0.5);
        assert.equal(slab.slabSource, base);
        assert.equal(world.registry.height[world.registry.id(`${base}_slab`)], 0.5);
    }
    for (const id of ['lattice_screen', 'paper_screen']) assert.equal(blockTypes[id].shape, 'pane');
    assert.ok(blockTypes.lattice_screen.cutout);
    assert.equal(blockTypes.magma_rock.lightEmission, 10);
    assert.ok(world.registry.lightLevel[world.registry.id('magma_rock')] > 0);
});

test('the shapes: in their cells, every state; the throne two high and sat on below; banners on walls; the sundial never turns', () => {
    const shapes = world.shapes;
    for (const [name, def] of Object.entries(blockTypes)) {
        const base = def.variantOf || name;
        if (!IDS.includes(base) || !def.shape || def.shape === 'stairs' || def.shape === 'pane') continue;
        const boxes = shapes.boxes(world.registry.id(name), 0);
        assert.ok(boxes.length > 0, name);
        for (const box of boxes) {
            for (let i = 0; i < 3; i++) assert.ok(box[i] >= 0 && box[i + 3] <= 1 && box[i] < box[i + 3], `${name}: ${box}`);
        }
    }
    for (const id of THRONES) {
        assert.equal(blockTypes[`${id}:lower:e`].seat, 0.5, id);
        assert.equal(blockTypes[`${id}:upper:e`].seat, undefined, id);
        assert.equal(blockTypes[id].shape, 'throne');
    }
    for (const id of BANNERS) {
        assert.equal(blockTypes[id].solid, false);
        assert.ok(blockTypes[`${id}:w`], id);
    }
    assert.ok(!blockTypes['sundial:e'] && !blockTypes['globe:e'] && !blockTypes['fountain:e']);
    assert.ok(blockTypes['statue:e'] && blockTypes['astrolabe:w']);
    // The gnomon rises towards the north (-z): its highest box is at the north end of the dial.
    const gnomon = shapes.boxes(world.registry.id('sundial'), 0).filter((box) => box[0] > 0.4 && box[3] < 0.6);
    const top = gnomon.reduce((a, b) => (b[4] > a[4] ? b : a));
    assert.ok(top[2] <= 0.3 && top[5] <= 0.5, `${top}`);
});

test('the sundial gives the hour by the sun and nothing at night; the astrolabe how high the sun stands', () => {
    assert.equal(ctx.palaceDecorSundialHours(0), 6);
    assert.equal(ctx.palaceDecorSundialHours(0.25), 12);
    assert.equal(ctx.palaceDecorSundialHours(0.25 + 1 / 96), 12.25);
    assert.equal(ctx.palaceDecorSunAltitude(1), 90);
    assert.equal(ctx.palaceDecorSunAltitude(0.5), 30);
    assert.equal(ctx.palaceDecorSunAltitude(-0.5), -30);
    const game = Object.create(ctx.Game.prototype);
    game.world = world;
    Object.assign(game, { timeOfDay: 0.25, sunHeight: 1, sunDirection: new Vector3(0, 0.5, 0.8) });
    assert.match(game.palaceDecorReading('sundial'), /12:00/);
    assert.match(game.palaceDecorReading('astrolabe'), /30°/);
    Object.assign(game, { timeOfDay: 0.75, sunHeight: -1, sunDirection: new Vector3(0, -0.5, 0.8) });
    assert.doesNotMatch(game.palaceDecorReading('sundial'), /\d\d:\d\d/);
    assert.match(game.palaceDecorReading('astrolabe'), /30°/);
    assert.equal(game.palaceDecorReading('globe'), null);
    assert.equal(game.palaceDecorReading('stone'), null);
    assert.equal(game.palaceDecorReading(null), null);
});
