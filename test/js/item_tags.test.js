// Node tests for the tags of the items (js/game/item_tags.js) and the search of the inventory and crafting
// (js/game/inventory.js): that every item of the real catalogue has a family, also those added later, that every
// recipe is found by what it makes, what a search means, and the chips. Every script of index.html runs in one VM
// context, with the real Game (without its init) and the real WorldRenderer; the page is a stand-in.
// Nothing here runs a browser: how the chips look and fit is checked only in the CSS.
// Run with: node --test test/js/item_tags.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const HTML = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');

function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    applyAxisAngle() { return this; }
}
class Material {
    constructor(options = {}) { Object.assign(this, options); }
    clone() { return Object.assign(new this.constructor(), this); }
    dispose() {}
}

function canvasStub() {
    const ctx = new Proxy({}, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'measureText') return () => ({ width: 1 });
            return () => ({ data: new Uint8ClampedArray(4 * 4096 * 16), addColorStop() {} });
        },
        set: (target, key, value) => { target[key] = value; return true; }
    });
    return { width: 16, height: 16, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,' };
}

function makeElement(id = '') {
    const classes = new Set();
    return {
        id, style: {}, dataset: {}, children: [], value: '', title: '', textContent: '', placeholder: '', focused: 0, listeners: {},
        // A chip as wide as its text, by the same fake measure everywhere.
        getBoundingClientRect() { return { width: 16 + this.textContent.length * 6 }; },
        removeChild(child) { this.children = this.children.filter((other) => other !== child); },
        classList: {
            add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name),
            toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name); return Boolean(on); }
        },
        set className(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach((name) => classes.add(name)); },
        get className() { return [...classes].join(' '); },
        set innerHTML(value) { this.children = []; this.html = value; },
        get innerHTML() { return this.html || ''; },
        appendChild(child) { this.children.push(child); return child; },
        addEventListener(type, listener) { (this.listeners[type] = this.listeners[type] || []).push(listener); },
        setAttribute() {}, removeAttribute() {}, querySelector: () => makeElement(), querySelectorAll: () => [], insertBefore(child) { return child; }, remove() {},
        focus() { this.focused++; },
        click() { (this.listeners.click || []).forEach((listener) => listener({})); }
    };
}

const elements = new Map();
const storedValues = new Map();
function load() {
    const THREE = new Proxy({
        Vector3, Vector2: Vector3, Vector4: Vector3, MeshLambertMaterial: class extends Material {},
        MeshStandardMaterial: class extends Material {}, MeshBasicMaterial: class extends Material {},
        MultiplyBlending: 'multiply', FrontSide: 'front', DoubleSide: 'double', sRGBEncoding: 'srgb'
    }, { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const document = {
        pointerLockElement: null, body: anyStub(), head: anyStub(), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
        createElement: (tag) => (tag === 'canvas' ? canvasStub() : makeElement()),
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, makeElement(id));
            return elements.get(id);
        }
    };
    const context = vm.createContext({
        console: { ...console, warn() {} }, Math, Map, WeakMap, Set, Object, Array, JSON, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array,
        Int8Array, Int16Array, Int32Array, Float32Array, Float64Array, THREE, document, navigator: {},
        performance: { now: () => 0 }, requestAnimationFrame: () => 0, Worker: class { postMessage() {} terminate() {} },
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; } },
        localStorage: { getItem: (key) => storedValues.get(key) ?? null, setItem: (key, value) => storedValues.set(key, value), removeItem: (key) => storedValues.delete(key) },
        location: { search: '', protocol: 'http:', host: 'test' }, URLSearchParams, prompt: () => 'Tester',
        setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {}, WebSocket: class {}, Audio: class {}, Image: class {}, AudioContext: class {},
        fetch: () => new Promise(() => {}), addEventListener() {}, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1
    });
    context.window = context;
    const scripts = [...HTML.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]).filter((src) => !/^(https?:)?\/\//.test(src));
    assert.ok(scripts.indexOf('js/game/item_tags.js') >= 0 && scripts.indexOf('js/game/item_tags.js') < scripts.indexOf('js/game/inventory.js'), 'the tags load before the panels');
    for (const src of scripts) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    vm.runInContext(`Object.assign(this, { Game, WorldRenderer, setGameLang, ITEM_TAG_FAMILIES, ITEM_TAG_COLORS, ITEM_TAG_ORDER, ITEM_TAG_TABLE, ITEM_TAG_NOT_ITEMS,
        itemTagsOf, itemTagsDerived, itemTagCatalogue, itemTagsFromTableOnly, itemTagIsFamily, itemTagParseQuery, itemTagMatches, itemTagChips, itemTagToggleInQuery,
        itemTagResolve, itemTagFold, itemTagFoldWord, itemTagLabel, ItemTagIndex, ITEM_TAG_SHORT, ITEM_TAG_BRIEF_MAX, ITEM_TAG_CHIP_GAP, itemTagFitChips });`, context);
    return context;
}

const ctx = load();
ctx.Game.prototype.init = function () {};
const world = new ctx.WorldRenderer({ add() {}, remove() {} });
world.getInventoryIconUrl = () => '';
const blockTypes = world.blockTypes;
const catalogue = ctx.itemTagCatalogue(blockTypes);
const index = new ctx.ItemTagIndex(blockTypes);
const plain = (value) => JSON.parse(JSON.stringify(value));
// Arrays made inside the VM are of another realm: compare what they hold.
const same = (actual, expected, message) => assert.deepEqual(plain(actual), plain(expected), message);

function makeGame({ touch = false } = {}) {
    elements.clear();
    const game = new ctx.Game();
    game.world = world;
    game.touchControlsEnabled = touch;
    game.stopMining = () => {};
    game.closeChatInput = () => {};
    game.recapturePointerLock = () => {};
    game.renderer = { domElement: {} };
    return game;
}
const giveAll = (game) => {
    for (const id of catalogue) {
        if (!game.inventory.includes(id)) game.inventory.push(id);
        game.inventoryCounts[id] = 1;
    }
};
const el = (id) => ctx.document.getElementById(id);
const chipsOf = (panel) => el(`${panel}-tags`).children;
const chipTags = (panel) => chipsOf(panel).map((chip) => chip.dataset.tag);
const shownItems = () => el('inventory-grid').children.filter((child) => child.className.includes('inventory-item')).map((child) => child.title.split('\n')[0]);
const shownCards = () => el('crafting-recipes').children.filter((child) => child.className.includes('craft-card')).map((card) => card.children[1].textContent);
const typeIn = (game, panel, text) => {
    el(`${panel}-search`).value = text;
    game[`${panel}SearchTerm`] = text;
    if (panel === 'inventory') game.renderInventoryPanel(); else game.renderCraftingPanel();
};
const search = (query) => {
    const parsed = ctx.itemTagParseQuery(query);
    return catalogue.filter((id) => {
        const entry = index.entry(id);
        return ctx.itemTagMatches(parsed, entry.set, entry.text);
    });
};

// ---- Every item has a family ----

test('every item of the catalogue has a family tag, and what depends on the table is listed', (t) => {
    assert.ok(catalogue.length > 500, `the catalogue is really there: ${catalogue.length}`);
    const orphans = catalogue.filter((id) => !ctx.itemTagsOf(id, blockTypes).some(ctx.itemTagIsFamily));
    same(orphans, [], 'give these a rule in itemTagsDerived, or a line in ITEM_TAG_TABLE');
    const tableOnly = ctx.itemTagsFromTableOnly(blockTypes);
    t.diagnostic(`${catalogue.length} items, ${tableOnly.length} found only through the table: ${tableOnly.join(' ')}`);
    assert.ok(tableOnly.length < catalogue.length / 4, 'most tags come from the data');
});

test('an item added later is caught if nothing recognises it, and tagged if its data says what it is', () => {
    const later = { ...plain(Object.fromEntries(Object.entries(blockTypes).map(([id, def]) => [id, { name: def.name, variantOf: def.variantOf }]))) };
    later.flux_capacitor = { name: 'Flux Capacitor' };
    later.pink_marble_stairs = { name: 'Pink Marble Stairs', category: 'stone' };
    later.solar_toaster = { name: 'Solar Toaster', electric: true };
    same(plain(ctx.itemTagsOf('flux_capacitor', later)), [], 'no catch-all: this is what the test above fails on');
    same(plain(ctx.itemTagsOf('pink_marble_stairs', later)), ['building', 'stone', 'pink']);
    same(plain(ctx.itemTagsOf('solar_toaster', later)), ['electric']);
    // The index also takes what was registered after it was built.
    blockTypes.late_item = { name: 'Late Item', category: 'wool' };
    try {
        same(plain(new ctx.ItemTagIndex({ stone: blockTypes.stone }).entry('mystery').tags), []);
        same(plain(index.entry('late_item').tags), ['wool']);
    } finally {
        delete blockTypes.late_item;
    }
});

test('states have the tags of their item', () => {
    const states = Object.keys(blockTypes).filter((id) => blockTypes[id].variantOf);
    assert.ok(states.length > 500, `${states.length} states`);
    for (const id of states) same(plain(ctx.itemTagsOf(id, blockTypes)), plain(ctx.itemTagsOf(blockTypes[id].variantOf, blockTypes)), id);
    same(plain(ctx.itemTagsOf('red_curtain:w:open', blockTypes)), plain(ctx.itemTagsOf('red_curtain', blockTypes)));
});

test('the tables name only items and tags that exist, and every tag is in use', () => {
    const stale = [];
    for (const [tag, ids] of Object.entries(ctx.ITEM_TAG_TABLE)) {
        assert.ok(ctx.ITEM_TAG_FAMILIES[tag] || ctx.ITEM_TAG_COLORS[tag], `unknown tag ${tag}`);
        for (const id of ids) if (!blockTypes[id]) stale.push(`${tag}: ${id}`);
    }
    same(stale, []);
    const used = new Set(catalogue.flatMap((id) => [...ctx.itemTagsOf(id, blockTypes)]));
    same(ctx.ITEM_TAG_ORDER.filter((tag) => !used.has(tag)), []);
    same([...used].filter((tag) => !ctx.ITEM_TAG_ORDER.includes(tag)), []);
    for (const id of ctx.ITEM_TAG_NOT_ITEMS) assert.ok(blockTypes[id], id);
    same(plain(ctx.ITEM_TAG_NOT_ITEMS), ['air'], 'nothing else hides from the check');
});

test('no written form means two tags, and both languages have every tag', () => {
    const seen = new Map();
    for (const tags of [ctx.ITEM_TAG_FAMILIES, ctx.ITEM_TAG_COLORS]) {
        for (const [tag, info] of Object.entries(tags)) {
            assert.ok(info.EN && info.ES, tag);
            assert.doesNotMatch(`${info.EN}${info.ES}`, /\s/, `${tag}: one word, it is typed after a #`);
            for (const word of new Set([tag, info.EN, info.ES, ...(info.also || [])].map(ctx.itemTagFoldWord))) {
                assert.ok(!seen.has(word), `${word}: ${tag} and ${seen.get(word)}`);
                seen.set(word, tag);
            }
        }
    }
});

test('families and colours say what they should', () => {
    const has = (id, ...tags) => {
        const found = [...ctx.itemTagsOf(id, blockTypes)];
        for (const tag of tags) assert.ok(found.includes(tag), `${id} is ${tag}: ${found}`);
    };
    const hasNot = (id, ...tags) => {
        const found = [...ctx.itemTagsOf(id, blockTypes)];
        for (const tag of tags) assert.ok(!found.includes(tag), `${id} is not ${tag}: ${found}`);
    };
    has('blue_brick', 'building', 'stone', 'blue');
    has('blue_wool', 'building', 'wool', 'blue');
    has('blue_stained_glass', 'building', 'glass', 'blue');
    has('blue_stained_glass_pane', 'building', 'glass', 'blue');
    has('light_blue_brick', 'light_blue');
    hasNot('light_blue_brick', 'blue');
    has('blue_carpet', 'decoration', 'wool', 'blue');
    hasNot('blue_carpet', 'building');
    has('blue_sofa', 'furniture', 'blue');
    hasNot('blue_sofa', 'building');
    has('cherry_planks', 'wood', 'building');
    has('oak_door', 'wood', 'building');
    has('iron_door', 'metal', 'building');
    hasNot('iron_door', 'stone');
    has('iron_ore', 'ore', 'stone');
    has('element_au', 'element', 'chemistry', 'metal');
    hasNot('element_h', 'metal');
    has('iron_pickaxe', 'tool');
    has('iron_sword', 'weapon');
    has('warm_coat', 'armor');
    has('cheese', 'food');
    has('milk', 'food', 'drink');
    has('fridge', 'furniture', 'storage', 'electric');
    hasNot('fridge', 'stone', 'building');
    has('chest', 'furniture', 'storage');
    hasNot('oven', 'storage');
    has('and_gate', 'logic', 'electric');
    has('lift_platform', 'mechanism', 'transport');
    has('candle', 'furniture', 'light');
    has('sheep_egg', 'egg');
    has('sample_moss_a', 'sample', 'microscope', 'science');
    has('wheat', 'farming', 'plant');
    has('wheat_2', 'farming', 'plant');
    has('flower_red', 'plant', 'red');
    has('flower_pot', 'decoration');
    hasNot('flower_pot', 'plant');
    has('painting_sunset', 'decoration');
    hasNot('painting_sunset', 'wood');
});

// ---- The recipes ----

test('every real recipe is found by the tags of what it makes', () => {
    const game = makeGame();
    assert.ok(game.craftingRecipes.length > 300, `${game.craftingRecipes.length} recipes`);
    const missing = game.craftingRecipes.filter((recipe) => !blockTypes[recipe.output.type] || !ctx.itemTagsOf(recipe.output.type, blockTypes).some(ctx.itemTagIsFamily));
    same(missing.map((recipe) => recipe.id), []);
    // Every slot of the real inventory too.
    same(game.inventory.filter((id) => !blockTypes[id] || !ctx.itemTagsOf(id, blockTypes).some(ctx.itemTagIsFamily)), []);

    game.craftingOpen = true;
    typeIn(game, 'crafting', '#building #blue');
    const cards = shownCards();
    assert.ok(cards.includes('Blue Brick') && cards.includes('Blue Wool'), `found: ${cards}`);
    assert.ok(!cards.includes('Blue Carpet') && !cards.includes('Red Brick'), `found: ${cards}`);
    // Tags look at what it makes, not at what it takes: bread is food, and what is made from food is not always.
    typeIn(game, 'crafting', '#food');
    assert.ok(shownCards().includes('Bread'));
    assert.ok(!shownCards().includes('Wheat Seeds'));
});

// ---- What a search means ----

test('tags combine as AND, and with free text', () => {
    const blueBuilding = search('#building #blue');
    same([...blueBuilding].sort(), ['blue_brick', 'blue_stained_glass', 'blue_stained_glass_pane', 'blue_wool', 'cobalt_glass'].sort());
    same(search('#blue brick'), ['blue_brick']);
    same(search('brick #blue'), ['blue_brick']);
    same(search('#blue #building brick'), ['blue_brick']);
    same(search('#food #building'), []);
});

test('a tag is written in either language, in any case, with or without accents', () => {
    const blueBuilding = search('#building #blue');
    for (const query of ['#construccion #azul', '#construcción #azul', '#CONSTRUCCIÓN #Azul', '#building #azul', '#construccion #blue', '#blue #construction']) {
        same(search(query), blueBuilding, query);
    }
    same(search('#electrico'), search('#electric'));
    same(search('#eléctrico'), search('#electric'));
    same(search('#quimica'), search('#chemistry'));
    same(search('#light_blue'), search('#light-blue'));
    same(search('#lightblue'), search('#azul-claro'));
    same(search('#marron'), search('#brown'));
});

test('a tag being written finds what it could be, and one that cannot be finds nothing', () => {
    same(search('#construc'), search('#building'));
    same(search('#buil'), search('#building'));
    same(search('#'), catalogue, 'only the #, nothing asked yet');
    same(search('#blue #'), search('#blue'));
    same(search('#nosuchtag'), []);
    same(search('#nosuchtag stone'), []);
    // A whole word means that tag only: red, not everything that starts with it.
    same(plain(ctx.itemTagResolve('red').tags), ['red']);
    assert.ok(ctx.itemTagResolve('a').tags.length > 1);
});

test('a search with no tag finds just what it found before', () => {
    const before = (query) => {
        const wanted = query.trim().toLowerCase();
        return catalogue.filter((id) => !wanted || `${id} ${blockTypes[id].name}`.toLowerCase().includes(wanted));
    };
    for (const query of ['', '   ', 'brick', 'BRICK', ' red ', 'red brick', 'red  brick', 'brick red', 'dark_oak', 'Dark Oak', 'iron', 'e', 'stained glass', 'a#b', 'x1', '(']) {
        same(search(query), before(query), `"${query}"`);
    }
    const game = makeGame();
    game.craftingOpen = true;
    const recipeBefore = (query) => game.craftingRecipes.filter((recipe) => [recipe.name, blockTypes[recipe.output.type].name, ...recipe.inputs.map((input) => blockTypes[input.type].name)]
        .join(' ').toLowerCase().includes(query)).map((recipe) => blockTypes[recipe.output.type].name);
    for (const query of ['torch', 'wool', 'fish', 'saw', 'coal ore']) {
        typeIn(game, 'crafting', query);
        same(shownCards(), recipeBefore(query), query);
    }
    // Free text in the crafting window also looks at the ingredients, tags at the result only.
    typeIn(game, 'crafting', '#tool iron ore');
    assert.ok(shownCards().includes('Iron Pickaxe'));
    assert.ok(!shownCards().includes('Iron Sword'), 'a sword is a weapon');
});

test('names are all plain text, so folding them changes nothing for who typed them', () => {
    for (const id of Object.keys(blockTypes)) {
        const name = blockTypes[id].name || id;
        assert.equal(ctx.itemTagFold(name), name.toLowerCase(), id);
    }
});

// ---- The chips ----

test('the chips are the tags of the results, and narrow as they do', () => {
    ctx.setGameLang('EN');
    const game = makeGame();
    giveAll(game);
    game.openInventoryPanel();
    const all = chipTags('inventory');
    same([...all].sort(), [...plain(ctx.ITEM_TAG_ORDER)].sort(), 'with all items, all tags are candidates');
    assert.equal(all[0], 'building', 'the one that splits them best');

    typeIn(game, 'inventory', '#blue');
    const blue = chipTags('inventory');
    assert.ok(blue.length < all.length);
    assert.equal(blue[0], 'blue');
    assert.ok(!blue.includes('red'), 'no red among the blue');
    assert.ok(blue.includes('furniture'));

    // One result: what it has narrows nothing, and only what is in the search stays, to take it away.
    typeIn(game, 'inventory', '#blue brick');
    same(chipTags('inventory'), ['blue']);

    typeIn(game, 'inventory', '#nosuchtag');
    same(chipTags('inventory'), []);
    assert.equal(el('inventory-grid').children[0].textContent, 'No items match your search');
    typeIn(game, 'inventory', '#blue #food');
    same(chipTags('inventory'), ['food', 'blue'], 'with no results, what is in the search can still be taken away');
});

test('a chip adds its tag to the search and takes it away, keeping the rest', () => {
    ctx.setGameLang('EN');
    const game = makeGame();
    giveAll(game);
    game.openInventoryPanel();
    const click = (panel, tag) => chipsOf(panel).find((chip) => chip.dataset.tag === tag).click();

    click('inventory', 'building');
    assert.equal(game.inventorySearchTerm, '#building ');
    assert.equal(el('inventory-search').value, '#building ');
    assert.ok(chipsOf('inventory').find((chip) => chip.dataset.tag === 'building').className.includes('active'));
    click('inventory', 'blue');
    assert.equal(game.inventorySearchTerm, '#building #blue ');
    same([...shownItems()].sort(), ['Blue Brick', 'Blue Stained Glass', 'Blue Stained Glass Pane', 'Blue Wool', 'Cobalt Glass']);
    click('inventory', 'building');
    assert.equal(game.inventorySearchTerm, '#blue ');
    click('inventory', 'blue');
    assert.equal(game.inventorySearchTerm, '');
    assert.equal(shownItems().length, catalogue.length);

    // With text, and typing after it. A tag in the other language is the same tag; one half written is finished.
    typeIn(game, 'inventory', 'brick');
    click('inventory', 'blue');
    assert.equal(game.inventorySearchTerm, 'brick #blue ');
    typeIn(game, 'inventory', '#azul brick');
    click('inventory', 'blue');
    assert.equal(game.inventorySearchTerm, 'brick ');
    typeIn(game, 'inventory', 'brick #blu');
    click('inventory', 'blue');
    assert.equal(game.inventorySearchTerm, 'brick #blue ');
    assert.equal(ctx.itemTagToggleInQuery('stone #', 'blue', 'ES'), 'stone #azul ');
});

test('a chip leaves the keys in the field on a desktop, and a phone without its keyboard', () => {
    ctx.setGameLang('EN');
    const desktop = makeGame();
    giveAll(desktop);
    desktop.openInventoryPanel();
    const search = el('inventory-search');
    const before = search.focused;
    const chip = chipsOf('inventory')[0];
    let prevented = false;
    chip.listeners.mousedown[0]({ preventDefault() { prevented = true; } });
    assert.ok(prevented, 'the button does not take the focus');
    chip.click();
    assert.equal(search.focused, before + 1);

    const phone = makeGame({ touch: true });
    giveAll(phone);
    phone.openInventoryPanel();
    chipsOf('inventory')[0].click();
    assert.equal(el('inventory-search').focused, 0);
    assert.equal(phone.inventorySearchTerm, '#building ');
    assert.equal(chipsOf('inventory')[0].type, 'button');
});

test('the chips work the same in crafting', () => {
    ctx.setGameLang('EN');
    const game = makeGame();
    game.openCraftingPanel();
    assert.ok(chipTags('crafting').includes('building'));
    assert.ok(game.selectedCraftingRecipeId);
    chipsOf('crafting').find((chip) => chip.dataset.tag === 'blue').click();
    assert.equal(game.craftingSearchTerm, '#blue ');
    assert.ok(shownCards().includes('Blue Brick'));
    assert.ok(!shownCards().includes('Red Brick'));
    assert.ok(chipTags('crafting').length < ctx.ITEM_TAG_ORDER.length);
    // Selected and hidden by the tag: the detail goes, as with any search.
    game.selectedCraftingRecipeId = 'red_brick';
    game.renderCraftingPanel();
    assert.equal(game.selectedCraftingRecipeId, null);
    // Opening again: empty, whole list (the search of before does not stay in the tags either).
    game.closeCraftingPanel();
    same(chipTags('crafting'), []);
    game.openCraftingPanel();
    assert.equal(game.craftingSearchTerm, '');
    assert.equal(shownCards().length, game.craftingRecipes.length);
    assert.ok(chipTags('crafting').includes('red'));
    assert.ok(!chipsOf('crafting').some((chip) => chip.className.includes('active')));
});

test('what is shown follows the language', () => {
    ctx.setGameLang('ES');
    const game = makeGame();
    giveAll(game);
    game.inventoryCounts.blue_brick = 3;
    game.openInventoryPanel();
    assert.equal(chipsOf('inventory')[0].textContent, '#construcción');
    assert.equal(el('inventory-search').placeholder, 'Buscar objetos o #etiquetas...');
    assert.ok(el('inventory-grid').children.some((item) => item.title === 'Blue Brick\n#construcción #piedra #azul'));
    chipsOf('inventory').find((chip) => chip.dataset.tag === 'blue').click();
    assert.equal(game.inventorySearchTerm, '#azul ');

    game.closeInventoryPanel();
    ctx.setGameLang('EN');
    game.openInventoryPanel();
    assert.equal(chipsOf('inventory')[0].textContent, '#building');
    assert.equal(el('inventory-search').placeholder, 'Search items or #tags...');

    game.openCraftingPanel();
    assert.equal(el('crafting-search').placeholder, 'Search recipes or #tags...');
    game.selectedCraftingRecipeId = 'blue_brick';
    game.renderCraftingPanel();
    const details = (children) => children.flatMap((child) => [child, ...details(child.children)]);
    const tagsBox = () => details(el('crafting-detail').children).find((child) => child.className === 'craft-detail-tags');
    assert.equal(tagsBox().textContent, '#building #stone #blue');
    ctx.setGameLang('ES');
    game.renderCraftingPanel();
    assert.equal(tagsBox().textContent, '#construcción #piedra #azul');
    assert.equal(chipsOf('crafting')[0].textContent, '#construcción', 'the chips too');
    ctx.setGameLang('EN');
});

// ---- The layout: only what the CSS says, nothing here draws it ----

test('the order: active always, then what could be finished, then what narrows best, and never what narrows nothing', () => {
    const parsed = (query) => ctx.itemTagParseQuery(query);
    // building on 2 of 4 splits best; wood on 1 of 4 less; stone on all of them narrows nothing.
    const lists = [['building', 'stone'], ['building', 'stone'], ['wood', 'stone'], ['stone']];
    same(ctx.itemTagChips(parsed('rock'), lists), ['building', 'wood']);
    same(ctx.itemTagChips(parsed('#stone'), lists), ['stone', 'building', 'wood'], 'active goes first although it narrows nothing');
    same(ctx.itemTagChips(parsed('#ston'), lists), ['stone', 'building', 'wood'], 'half written, it can be finished');
    same(ctx.itemTagChips(parsed('#food'), lists), ['food', 'building', 'wood'], 'active goes first although no result has it');
    // Families count double: on the same split a family goes before a colour...
    same(ctx.itemTagChips(parsed('x'), [['blue', 'wood'], ['stone'], ['stone'], ['stone']]).slice(0, 2), ['wood', 'stone'], 'same split');
    same(ctx.itemTagChips(parsed('y'), [['wood', 'blue'], ['stone'], ['stone'], ['stone']]).at(-1), 'blue');
    // ...but a colour on half of them beats a family that hardly narrows.
    const many = Array.from({ length: 20 }, (_, i) => (i === 0 ? ['wood'] : i <= 10 ? ['red'] : ['pink']));
    assert.equal(ctx.itemTagChips(parsed('z'), many)[0], 'red');
    // A result with the tags of all of them leaves no chips at all.
    same(ctx.itemTagChips(parsed('q'), [['wood']]), []);
    same(ctx.itemTagChips(parsed('q'), []), []);
});

test('fitting: whole chips only, active first, narrower ones take the room left', () => {
    const fit = (widths, available, gap) => plain(ctx.itemTagFitChips(widths, available, gap));
    same(fit([50, 50, 50], 160, 5), [0, 1, 2], 'all fit');
    same(fit([50, 50, 50], 159, 5), [0, 1], 'one pixel short: out, not cut');
    same(fit([50, 50, 50], 105, 5), [0, 1], 'exactly');
    same(fit([50, 90, 20], 80, 5), [0, 2], 'a long one is left out, a short one after it fits');
    same(fit([200, 20], 100, 5), [1], 'not even the first');
    same(fit([], 100, 5), []);
    same(fit([10, 10], 0, 5), []);
    assert.equal(ctx.ITEM_TAG_CHIP_GAP, 5);
});

test('the row is fitted by measure, when the results change and when the window does', () => {
    ctx.setGameLang('EN');
    const game = makeGame();
    giveAll(game);
    let resized = null;
    const listen = ctx.window.addEventListener;
    ctx.window.addEventListener = (type, listener) => { if (type === 'resize') resized = listener; };
    const box = el('inventory-tags');
    box.clientWidth = 300;
    const measure = () => chipsOf('inventory').map((chip) => chip.getBoundingClientRect().width);
    const usedWidth = () => measure().reduce((sum, width) => sum + width, 0) + (chipsOf('inventory').length - 1) * ctx.ITEM_TAG_CHIP_GAP;
    try {
        game.openInventoryPanel();
    } finally {
        ctx.window.addEventListener = listen;
    }
    const wide = chipTags('inventory');
    assert.ok(wide.length > 1 && wide.length < ctx.ITEM_TAG_ORDER.length, `${wide}`);
    assert.equal(wide[0], 'building');
    assert.ok(usedWidth() <= 300, `${usedWidth()}`);

    // The window narrows, and widens.
    box.clientWidth = 120;
    resized();
    assert.ok(chipTags('inventory').length < wide.length);
    assert.ok(usedWidth() <= 120, `${usedWidth()}`);
    box.clientWidth = 300;
    resized();
    same(chipTags('inventory'), wide);

    // Nothing changed, nothing is touched: the same nodes stay, so a click on the way is not lost.
    const before = chipsOf('inventory')[0];
    resized();
    game.renderInventoryPanel();
    assert.equal(chipsOf('inventory')[0], before);

    // The results change. Active goes first even in a narrow row, and what is cut can still be typed.
    box.clientWidth = 120;
    typeIn(game, 'inventory', '#magenta');
    assert.equal(chipTags('inventory')[0], 'magenta');
    typeIn(game, 'inventory', '#sample');
    assert.equal(chipTags('inventory')[0], 'sample');
    assert.ok(shownItems().length > 0);
    assert.ok(usedWidth() <= 120);

    // Each label is measured once: fitting again does not lay out the page again.
    let measured = 0;
    const realCreate = ctx.document.createElement;
    ctx.document.createElement = (tag) => {
        const made = realCreate(tag);
        const rect = made.getBoundingClientRect;
        made.getBoundingClientRect = function () { measured++; return rect.call(this); };
        return made;
    };
    try {
        box.clientWidth = 400;
        resized();
        game.renderInventoryPanel();
        assert.equal(measured, 0);
    } finally {
        ctx.document.createElement = realCreate;
    }

    // Nothing is left behind from measuring, in the other list either.
    game.closeInventoryPanel();
    same(chipTags('inventory'), []);
    el('crafting-tags').clientWidth = 200;
    game.openCraftingPanel();
    assert.ok(chipTags('crafting').length > 0 && new Set(chipTags('crafting')).size === chipTags('crafting').length);
    assert.ok(chipTags('crafting').length < ctx.ITEM_TAG_ORDER.length);
});

// ---- On the edge of each cell ----

test('the short forms are short, in both languages, and lead back to their tag', () => {
    for (const tag of ctx.ITEM_TAG_ORDER) {
        const short = ctx.ITEM_TAG_SHORT[tag];
        assert.ok(short, tag);
        for (const word of short) {
            assert.ok(word.length <= 6, `${tag}: ${word}`);
            assert.doesNotMatch(word, /\s/, word);
        }
    }
    for (const tag of Object.keys(ctx.ITEM_TAG_FAMILIES)) {
        for (const word of ctx.ITEM_TAG_SHORT[tag]) assert.ok(plain(ctx.itemTagResolve(word.replace(/\.$/, '')).tags).includes(tag), `${tag}: ${word}`);
    }
});

test('a cell says the most specific families, in the language, and colours only with room', () => {
    assert.equal(index.brief('blue_brick', 2, 'EN'), 'stone build', 'the rarest family first, and the icon already says blue');
    assert.equal(index.brief('blue_brick', 2, 'ES'), 'piedra const.');
    assert.equal(index.brief('blue_brick', 3, 'EN'), 'stone build blue', 'a colour takes a free place');
    assert.equal(index.brief('oak_chair', 2, 'EN'), 'furn. wood');
    assert.equal(index.brief('iron_ore', 2, 'ES'), 'miner. piedra');
    assert.equal(index.brief('sample_moss_a', 2, 'EN'), 'sample micro.');
    assert.equal(index.brief('sheep_egg', 3, 'EN'), 'egg', 'what it has, no more');
    assert.equal(index.brief('red_curtain:w:open', 2, 'EN'), index.brief('red_curtain', 2, 'EN'));
    assert.deepEqual(ctx.ITEM_TAG_BRIEF_MAX.inventory, 2);
    assert.deepEqual(ctx.ITEM_TAG_BRIEF_MAX.crafting, 3);
    for (const id of catalogue) {
        for (const lang of ['EN', 'ES']) {
            const words = index.brief(id, 2, lang);
            assert.ok(words && words.length <= 13, `${id}: ${words}`);
        }
    }
});

test('the cells of both lists carry them, with no extra nodes, and a click on the cell still does its job', (t) => {
    ctx.setGameLang('ES');
    const game = makeGame();
    giveAll(game);
    game.openInventoryPanel();
    const cells = el('inventory-grid').children.filter((child) => child.className.includes('inventory-item'));
    const brick = cells.find((cell) => cell.title.startsWith('Blue Brick'));
    assert.equal(brick.dataset.tags, 'piedra const.');
    assert.equal(brick.children.length, 3, 'icon, name and count, as before');
    assert.equal(brick.title, 'Blue Brick\n#construcción #piedra #azul', 'the tooltip keeps the full list');
    assert.ok(cells.every((cell) => cell.dataset.tags), 'all of them');
    brick.click();
    assert.equal(game.inventoryOpen, false, 'it picks the item and closes, as before');
    const bytes = cells.reduce((sum, cell) => sum + cell.dataset.tags.length, 0);
    t.diagnostic(`${cells.length} inventory cells: 0 extra nodes, 1 attribute each, ${bytes} characters in all (${(bytes / cells.length).toFixed(1)} each)`);

    game.openCraftingPanel();
    const cards = el('crafting-recipes').children.filter((child) => child.className.includes('craft-card'));
    const card = cards.find((other) => other.children[1].textContent === 'Blue Brick');
    assert.equal(card.dataset.tags, 'piedra const. azul');
    assert.equal(card.children.length, 3);
    card.click();
    assert.equal(game.selectedCraftingRecipeId, 'blue_brick');
    ctx.setGameLang('EN');
    game.renderCraftingPanel();
    assert.equal(el('crafting-recipes').children.find((other) => other.children[1].textContent === 'Blue Brick').dataset.tags, 'stone build blue');
});

test('working out the words of every cell costs next to nothing', (t) => {
    const fresh = new ctx.ItemTagIndex(blockTypes);
    const clock = () => Number(process.hrtime.bigint()) / 1e6;
    let started = clock();
    for (const id of catalogue) fresh.brief(id, 2, 'ES');
    const first = clock() - started;
    started = clock();
    for (const id of catalogue) fresh.brief(id, 2, 'ES');
    const again = clock() - started;
    t.diagnostic(`${catalogue.length} cells: ${first.toFixed(2)} ms the first time, ${again.toFixed(3)} ms after that`);
    assert.ok(first < 500 && again < 50);
});

test('the row and the cells, in the CSS', () => {
    const rule = (selector) => {
        const found = HTML.match(new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.#]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
        assert.ok(found, selector);
        return found[1];
    };
    const tags = rule('.panel-tags');
    assert.match(tags, /flex:\s*none/);
    assert.match(tags, /flex-wrap:\s*nowrap/);
    assert.match(tags, /[^-]height:\s*26px/, 'one row, also when empty');
    assert.match(tags, /overflow:\s*hidden/, 'no scrollbar');
    assert.match(tags, new RegExp(`gap:\\s*${ctx.ITEM_TAG_CHIP_GAP}px`), 'the gap the fitting counts on');
    assert.doesNotMatch(tags, /max-height|overflow-y|auto|scroll/);
    assert.doesNotMatch(HTML, /\.panel-tags:empty/, 'it must keep its width to be measured');
    assert.match(rule('.panel-tag'), /flex:\s*none/, 'a chip is not squeezed, or it would be measured wrong');
    assert.match(rule('body.touch-ui .panel-tag'), /height:\s*32px/);
    assert.match(rule('body.touch-ui .panel-tags'), /[^-]height:\s*32px/);
    assert.doesNotMatch(rule('body.touch-ui .panel-tags'), /max-height|auto|scroll/);

    const edge = HTML.match(/\.inventory-item\[data-tags\]::after,\s*\.craft-card\[data-tags\]::after\s*\{([^}]*)\}/);
    assert.ok(edge, 'one rule for the edge of both lists');
    assert.match(edge[1], /content:\s*attr\(data-tags\)/);
    assert.match(edge[1], /position:\s*absolute/);
    assert.match(edge[1], /[^-]height:\s*11px/, 'one line');
    assert.match(edge[1], /overflow:\s*hidden/);
    assert.match(edge[1], /font:\s*9px\/11px/);
    assert.doesNotMatch(edge[1], /nowrap|ellipsis/, 'a word that does not fit wraps away whole');
    for (const cell of ['.inventory-item', '.craft-card']) {
        assert.match(rule(cell), /position:\s*relative/, cell);
        assert.match(rule(`${cell}[data-tags]`.replace(/[\[\]]/g, '\\$&')), /padding-bottom:\s*16px/, `${cell} keeps its content clear of them`);
    }
    assert.match(rule('body.touch-ui #crafting-recipes'), /min-height:/, 'the list keeps some room, and the panel scrolls');
    for (const panel of ['inventory', 'crafting']) {
        assert.match(HTML, new RegExp(`id="${panel}-search"[^>]*>\\s*<div id="${panel}-tags" class="panel-tags">`), `${panel}: right under the field`);
    }
});

test('the search fields keep their keys: Escape closes, and nothing reaches the game', () => {
    const game = fs.readFileSync(path.join(STATIC, 'js', 'game.js'), 'utf8');
    for (const panel of ['craftingSearch', 'inventorySearch']) {
        const listener = game.match(new RegExp(`${panel}\\.addEventListener\\('keydown'[\\s\\S]*?\\}\\);`))[0];
        assert.match(listener, /Escape/);
        assert.match(listener, /stopPropagation/);
    }
});

// ---- Speed ----

test('tags are worked out fast, and typing costs next to nothing', (t) => {
    const many = {};
    const colors = Object.keys(ctx.ITEM_TAG_COLORS);
    for (let i = 0; i < 20000; i++) many[`${colors[i % colors.length]}_thing_${i}_brick`] = { name: `Thing ${i} Brick`, category: 'stone' };
    const clock = () => Number(process.hrtime.bigint()) / 1e6;

    const started = clock();
    const big = new ctx.ItemTagIndex(many);
    const buildMs = clock() - started;

    const realStarted = clock();
    new ctx.ItemTagIndex(blockTypes);
    t.diagnostic(`the real catalogue, ${Object.keys(blockTypes).length} entries with their states: ${(clock() - realStarted).toFixed(1)} ms to build`);

    const ids = Object.keys(many);
    const queries = ['#building #blue', '#blue brick', 'thing 1999', '#construccion', '#b', 'nothing'];
    const typed = clock();
    let found = 0;
    for (let round = 0; round < 50; round++) {
        for (const query of queries) {
            ctx.itemTagParseQuery(`${query}`);
            const parsed = ctx.itemTagParseQuery(query);
            const tagLists = [];
            for (const id of ids) {
                const entry = big.entry(id);
                if (ctx.itemTagMatches(parsed, entry.set, entry.text)) { found++; tagLists.push(entry.tags); }
            }
            ctx.itemTagChips(parsed, tagLists);
        }
    }
    const perSearch = (clock() - typed) / (50 * queries.length);
    t.diagnostic(`20000 items: ${buildMs.toFixed(1)} ms to build, ${perSearch.toFixed(2)} ms per search with its chips (${found} found)`);
    // Very loose: this is a machine that may be busy, and a real catalogue has 1651.
    assert.ok(buildMs < 3000, `${buildMs} ms`);
    assert.ok(perSearch < 100, `${perSearch} ms`);
});

// ---- The guide ----

test('the guide lists every family and colour in its language', () => {
    const guide = path.join(STATIC, 'guide');
    const page = (lang) => fs.readFileSync(path.join(guide, fs.readdirSync(guide).find((name) => name.startsWith(`11_${lang}_`))), 'utf8');
    for (const lang of ['ES', 'EN']) {
        const text = page(lang);
        for (const tag of ctx.ITEM_TAG_ORDER) assert.ok(text.includes(`\`#${(ctx.ITEM_TAG_FAMILIES[tag] || ctx.ITEM_TAG_COLORS[tag])[lang]}\``), `${lang}: ${tag}`);
    }
    const guia = fs.readFileSync(path.join(ROOT, 'GUIA.md'), 'utf8');
    assert.match(guia, /## Etiquetas/);
    for (const tag of Object.keys(ctx.ITEM_TAG_FAMILIES)) assert.ok(guia.includes(`\`#${ctx.ITEM_TAG_FAMILIES[tag].ES}\``), tag);
});
