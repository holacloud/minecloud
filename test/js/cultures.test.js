// Node tests for cultures (js/game/cultures.js, js/game/cultures_text.js): the tables against the server
// (pkg/network/microbes.go, appliances.go, power.go), the items, blocks and recipes, what a request takes and
// gives, the panel in both languages on a small fake page, and that the plate and the curve draw. The growth
// itself runs on the server and is tested there (microbes_test.go). Nothing here runs a browser.
// Run with: node --test test/js/cultures.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const JS = path.join(ROOT, 'pkg', 'web', 'static', 'js');
const plain = (value) => JSON.parse(JSON.stringify(value));
const goMicrobes = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'microbes.go'), 'utf8');
const goAppliances = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'appliances.go'), 'utf8');
const goPower = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'power.go'), 'utf8');
const goStorage = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'storage.go'), 'utf8');

function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}

// A 2D context that remembers what was asked of it.
function recordingContext() {
    const calls = [];
    const target = { calls, measureText: (text) => ({ width: String(text).length * 6 }), createRadialGradient: () => ({ addColorStop() {} }) };
    return new Proxy(target, {
        get: (known, key) => (key in known ? known[key] : (...args) => { calls.push([key, ...args]); }),
        set: (known, key, value) => { calls.push(['set', key, value]); known[key] = value; return true; }
    });
}

// A very small page: elements with text, children, classes and listeners. A selector finds an element by
// what it was built with, or is made the first time it is asked for.
function fakeElement(tag = 'div') {
    const element = {
        tag, children: [], listeners: {}, style: {}, dataset: {}, title: '', value: '', disabled: false, className: '', width: 160, height: 160, clientWidth: 0,
        classList: {
            set: new Set(),
            add(name) { this.set.add(name); }, remove(name) { this.set.delete(name); },
            toggle(name, on) { if (on ?? !this.set.has(name)) this.set.add(name); else this.set.delete(name); }, contains(name) { return this.set.has(name); }
        },
        addEventListener(type, handler) { (this.listeners[type] = this.listeners[type] || []).push(handler); },
        appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
        append(...children) { for (const child of children) this.children.push(typeof child === 'string' ? Object.assign(fakeElement('#text'), { text: child }) : child); },
        getContext() { return element.context || (element.context = recordingContext()); },
        closest() { return null; },
        found: new Map(),
        querySelector(selector) {
            const match = all(element).find((child) => child !== element && matches(child, selector));
            if (match) return match;
            if (!element.found.has(selector)) element.found.set(selector, fakeElement(selector.startsWith('canvas') ? 'canvas' : 'div'));
            return element.found.get(selector);
        },
        querySelectorAll(selector) { return all(element).filter((child) => child !== element && matches(child, selector)); }
    };
    let text = '';
    Object.defineProperty(element, 'textContent', { get: () => text, set(value) { text = String(value); element.children = []; } });
    let inner = '';
    Object.defineProperty(element, 'innerHTML', { get: () => inner, set(value) { inner = value; element.children = []; element.found = new Map(); } });
    return element;
}
function all(element) {
    return [element, ...element.children.flatMap(all), ...[...element.found.values()].flatMap(all)];
}
function matches(element, selector) {
    if (selector.startsWith('.')) return element.className.split(/\s+/).includes(selector.slice(1));
    if (selector.startsWith('#')) return element.id === selector.slice(1);
    return element.tag === selector;
}
function allText(element) {
    return [element.textContent, element.text || '', element.title, ...element.children.map(allText), ...[...element.found.values()].map(allText)].join(' | ');
}

function storage() {
    const values = new Map([['minecloud-guide-lang', 'EN']]);
    return { values, getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

function loadModules() {
    const context = vm.createContext({
        console, Math, JSON, performance: { now: () => 0 }, window: { localStorage: storage(), addEventListener() {} },
        THREE: anyStub(), navigator: {}
    });
    context.document = { createElement: (tag) => fakeElement(tag), head: fakeElement(), body: fakeElement(), addEventListener() {}, getElementById: () => null, querySelector: () => null, pointerLockElement: null };
    vm.runInContext('class Game {}; function resourcesDrawSprite() { return () => {}; } function resourcesDisplayMesh() { return null; }', context);
    for (const file of ['extensions.js', 'gameLang.js', 'chunkStore.js', 'blockShapes.js', 'mobSpecies.js']) vm.runInContext(fs.readFileSync(path.join(JS, file), 'utf8'), context, { filename: file });
    for (const file of ['inventory.js', 'bestiary_text.js', 'bestiary.js', 'furniture.js', 'storage.js', 'appliances.js', 'smelters.js', 'electricity.js', 'microbes.js', 'microscope_text.js', 'microscope.js', 'cultures_text.js', 'cultures.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    }
    vm.runInContext(`Object.assign(this, { CULTURE_SPECIES, CULTURE_PLATES, CULTURE_ORDER, CULTURE_MODEL, CULTURE_TEXT, CULTURE_ITEMS, CULTURE_ITEMS_ES, CULTURE_KIT, CULTURE_GUIDE_PAGE,
        APPLIANCE_AUTOCLAVE, APPLIANCE_MACHINES, STORAGE_KINDS, ELECTRIC_KINDS, ITEM_TYPES, BLOCK_TYPES, BLOCK_SHAPES, GAME_CONTENT_HOOKS, MODAL_PANELS, ITEM_USE_HANDLERS, MICRO_SPECIES,
        cultureGamma, cultureInoculum, cultureHarvestOf, cultureRequestItems, cultureSettle, cultureGrowing, culturePowerLine, cultureDrawPlate, cultureDrawGraph, cultureColonies,
        cultureSay, cultureItemName, microscopeRequestItems, microscopeSourceHeld, microscopeSlideLine, MICRO_PLATES, MICRO_ITEMS, cultureLensView, cultureLensLines, cultureDrawLens, setGameLang, gameLang, Game });`, context);
    return context;
}

const ctx = loadModules();

function inLang(lang, work) {
    ctx.setGameLang(lang);
    try {
        return work();
    } finally {
        ctx.setGameLang('EN');
    }
}

function goTable(source, name) {
    const start = source.indexOf(`var ${name} =`);
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n}\n', start));
}

// ---- Mirrors of the server ----

test('the species, plates and order match the server', () => {
    const species = {};
    for (const [, id, fields] of goTable(goMicrobes, 'cultureSpecies').matchAll(/"(\w+)":\s*\{([^}]*)\}/g)) {
        const number = (key) => Number(fields.match(new RegExp(`${key}: ([\\d.]+)`))[1]);
        const entry = { tmin: number('Tmin'), topt: number('Topt'), tmax: number('Tmax'), rate: number('Rate'), item: fields.match(/Item: "(\w+)"/)[1] };
        if (/Light: true/.test(fields)) entry.light = true;
        if (/Penicillin: true/.test(fields)) entry.penicillin = true;
        species[id] = entry;
    }
    assert.deepEqual(species, plain(ctx.CULTURE_SPECIES));
    const plates = Object.fromEntries([...goTable(goMicrobes, 'culturePlates').matchAll(/"(\w+)":\s*(true|false)/g)].map(([, id, spores]) => [id, spores === 'true']));
    assert.deepEqual(plates, plain(ctx.CULTURE_PLATES));
    const order = [...goMicrobes.match(/var cultureOrder = \[\]string\{([^}]*)\}/)[1].matchAll(/"(\w+)"/g)].map((match) => match[1]);
    assert.deepEqual(order, plain(ctx.CULTURE_ORDER));
});

test('the constants of the model match the server', () => {
    const names = {
        logInoculum: 'cultureLogInoculum', logMax: 'cultureLogMax', logHarvest: 'cultureLogHarvest', logSpores: 'cultureLogSpores', lagWork: 'cultureLagWork',
        yield: 'cultureYield', maintenance: 'cultureMaintenance', death: 'cultureDeath', heatDeath: 'cultureHeatDeath', mouldHold: 'cultureMouldHold', mouldFrom: 'cultureMouldFrom',
        historyMax: 'cultureHistoryMax', historyEvery: 'cultureHistoryEvery', minTarget: 'incubatorMinTarget', maxTarget: 'incubatorMaxTarget',
        defaultTarget: 'incubatorDefaultTarget', settle: 'incubatorSettle'
    };
    assert.deepEqual(Object.keys(names).sort(), Object.keys(ctx.CULTURE_MODEL).sort());
    for (const [key, go] of Object.entries(names)) {
        const found = goMicrobes.match(new RegExp(`\\b${go}\\s+=\\s+([\\d.]+)`));
        assert.ok(found, go);
        assert.equal(Number(found[1]), ctx.CULTURE_MODEL[key], key);
    }
});

test('the autoclave, the storage sizes and the power match the server', () => {
    const recipes = {};
    for (const [, id, fields] of goTable(goAppliances, 'autoclaveRecipes').matchAll(/"(\w+)":\s*\{([^}]*)\}/g)) {
        recipes[id] = { out: fields.match(/Out: "(\w+)"/)[1], in: Number(fields.match(/In: (\d+)/)[1]), yield: Number(fields.match(/Yield: (\d+)/)[1]), seconds: Number(fields.match(/Seconds: (\d+)/)[1]) };
    }
    assert.deepEqual(recipes, plain(ctx.APPLIANCE_AUTOCLAVE));
    assert.match(goStorage, /"incubator":\s+3,/);
    assert.match(goStorage, /"autoclave":\s+3,/);
    assert.equal(ctx.STORAGE_KINDS.incubator, 3);
    assert.equal(ctx.BLOCK_TYPES.incubator.storageSlots, 3);
    assert.equal(ctx.BLOCK_TYPES.autoclave.storageSlots, 3);
    assert.match(goPower, /"incubator": \{Role: powerConsumer, Watts: 20, OnDemand: true\}/);
    assert.match(goPower, /"autoclave": \{Role: powerConsumer, Watts: 40, OnDemand: true\}/);
    assert.equal(ctx.ELECTRIC_KINDS.incubator.watts, 20);
    assert.ok(ctx.BLOCK_TYPES.incubator.electric && ctx.BLOCK_TYPES.autoclave.electric);
    assert.equal(ctx.APPLIANCE_MACHINES.autoclave.refused, 'not for the autoclave');
    // The server's messages are wired: registered from the mechanic's own file (pkg/network/registry.go).
    const microbes = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'microbes.go'), 'utf8');
    assert.match(microbes, /registerMessage\([^\n]*"cultureLoad", "cultureInoculate", "cultureHarvest", "cultureSet"\)/);
});

test('every machine, placed facing any way, settles on the server to a block the client registers', () => {
    // The table of the server's names (appliances_test.go checks it against settleOvenName).
    const goTest = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'appliances_test.go'), 'utf8');
    const settled = {};
    for (const [, placed, out, lit] of goTable(goTest, 'machineSettledNames').matchAll(/"([\w:]+)":\s*\{"([\w:]+)", "([\w:]+)"\}/g)) settled[placed] = [out, lit];
    const kinds = [...goTable(goAppliances, 'machines').matchAll(/(\w+Kind):\s*\{/g)].map(([, constant]) => goAppliances.match(new RegExp(`${constant}\\s*= "(\\w+)"`))[1]);
    assert.deepEqual(kinds.sort(), ['arc_furnace', 'autoclave', 'foundry', 'oven']);
    // The names the client registers: every state of every shaped block, as the world expands them.
    const types = Object.fromEntries(Object.entries(ctx.BLOCK_TYPES).map(([id, def]) => [id, { ...def }]));
    vm.runInContext('expandBlockStates', ctx)(types);
    const looks = { n: { x: 0, z: 1 }, e: { x: -1, z: 0 }, s: { x: 0, z: -1 }, w: { x: 1, z: 0 } };
    for (const kind of kinds) {
        const def = types[kind];
        assert.ok(def && def.storageSlots === 3, `${kind} is a block of three slots`);
        const shape = ctx.BLOCK_SHAPES[def.shape];
        assert.ok(shape.states.some(([key, values]) => key === 'fire' && values.join() === 'off,on'), `${kind} has the fire the server writes`);
        for (const [facing, look] of Object.entries(looks)) {
            const [{ state }] = shape.place({ look, x: 0, y: 0, z: 0 });
            assert.equal(state.facing, facing);
            const placed = vm.runInContext('shapeStateName', ctx)(kind, shape, state);
            assert.ok(types[placed], `${placed} is registered`);
            assert.ok(settled[placed], `${placed} is in the server's table`);
            for (const name of settled[placed]) assert.ok(types[name], `${kind} placed as ${placed} settles to ${name}, which the client knows`);
        }
    }
    // The other blocks with slots are never renamed by the server: it renames machines only.
    const chests = Object.entries(ctx.BLOCK_TYPES).filter(([, def]) => def.storageSlots).map(([id]) => id);
    assert.ok(chests.includes('incubator') && chests.includes('microscope'));
    for (const id of chests) assert.equal(kinds.includes(id), Boolean(ctx.APPLIANCE_MACHINES[id]), `${id}: a machine on both sides, or on neither`);
});

test('the temperature model is the one the server uses', () => {
    // Rosso's model: 1 at the optimum, 0 at the ends, and the values of a hand calculation.
    const yeast = ctx.CULTURE_SPECIES.yeast;
    assert.equal(ctx.cultureGamma(yeast.topt, yeast), 1);
    assert.equal(ctx.cultureGamma(yeast.tmin, yeast), 0);
    assert.equal(ctx.cultureGamma(yeast.tmax, yeast), 0);
    assert.ok(Math.abs(ctx.cultureGamma(10, yeast) - 0.1) < 1e-12, 'at 10 °C yeast grows at a tenth of its best');
    assert.match(goMicrobes, /num := \(t - kind\.Tmax\) \* \(t - kind\.Tmin\) \* \(t - kind\.Tmin\)/);
    assert.match(goMicrobes, /den := \(kind\.Topt - kind\.Tmin\) \* \(\(kind\.Topt-kind\.Tmin\)\*\(t-kind\.Topt\) - \(kind\.Topt-kind\.Tmax\)\*\(kind\.Topt\+kind\.Tmin-2\*t\)\)/);
});

// ---- Items and requests ----

test('every item and block is an ordinary one, with a name, an icon, a recipe or a source', () => {
    const items = [];
    const recipes = [];
    for (const hook of ctx.GAME_CONTENT_HOOKS) {
        // Only the hooks that add items and recipes: the others need a whole game.
        if (hook.length === 0) continue;
        hook.call({}, { addItem: (type) => items.push(type), addRecipe: (...recipe) => recipes.push(recipe) });
    }
    for (const id of ['incubator', 'autoclave', 'petri_dish', 'agar_plate', 'agar_plate_unsterile', 'used_dish', 'water_filter', 'sample_filtered',
        'culture_yeast', 'culture_lactobacillus', 'culture_soil', 'culture_cyano', 'culture_mould']) {
        assert.ok(items.includes(id), `${id} in the inventory`);
        assert.ok(ctx.ITEM_TYPES[id] || ctx.BLOCK_TYPES[id], id);
        assert.ok(ctx.CULTURE_ITEMS_ES[id], `${id} in Spanish`);
    }
    for (const kind of Object.values(ctx.CULTURE_SPECIES)) assert.ok(ctx.CULTURE_ITEMS[kind.item], kind.item);
    const recipe = (id) => recipes.find((entry) => entry[0] === id);
    assert.deepEqual(plain(recipe('incubator')[4]), [{ type: 'iron_ore', amount: 4 }, { type: 'glass', amount: 2 }, { type: 'thermometer', amount: 1 }]);
    assert.deepEqual(plain(recipe('autoclave')[4]), [{ type: 'iron_block', amount: 3 }, { type: 'glass', amount: 1 }]);
    assert.equal(recipe('petri_dish')[3], 2);
    assert.deepEqual(plain(recipe('agar_plate')[4]), [{ type: 'petri_dish', amount: 1 }, { type: 'wheat', amount: 1 }, { type: 'water_flask', amount: 1 }]);
    assert.deepEqual(plain(recipe('agar_plate_unsterile')[4]), [{ type: 'used_dish', amount: 1 }, { type: 'wheat', amount: 1 }, { type: 'water_flask', amount: 1 }]);
    assert.deepEqual(plain(recipe('water_filter')[4]), [{ type: 'sand', amount: 1 }, { type: 'coal_ore', amount: 1 }, { type: 'test_tube', amount: 1 }]);
    for (const [type] of ctx.CULTURE_KIT) assert.ok(ctx.ITEM_TYPES[type] || ctx.BLOCK_TYPES[type] || ['flower_red', 'flower_yellow', 'milk', 'dirt', 'wheat', 'water_flask', 'rtg', 'grow_lamp', 'candle'].includes(type), type);
});

test('what a request takes and gives, and nothing is lost on a refusal', () => {
    const load = ctx.cultureRequestItems('load', 'agar_plate');
    assert.deepEqual(plain(ctx.cultureSettle(load, { amount: 1, type: 'agar_plate' })), {});
    assert.deepEqual(plain(ctx.cultureSettle(load, { amount: 0, reason: 'occupied' })), { agar_plate: 1 });
    const milk = ctx.cultureRequestItems('inoculate', 'milk');
    assert.deepEqual(plain(ctx.cultureSettle(milk, { amount: 1 })), { glass: 1 }, 'the bottle comes back');
    const sample = ctx.cultureRequestItems('inoculate', 'sample_plains_lake_a');
    assert.deepEqual(plain(ctx.cultureSettle(sample, { amount: 1 })), { test_tube: 1 }, 'the tube comes back');
    assert.deepEqual(plain(ctx.cultureSettle(sample, { amount: 0, reason: 'nothing grows' })), { sample_plains_lake_a: 1 });
    // A culture plate is its own dish: it comes out alone.
    const harvest = ctx.cultureRequestItems('harvest');
    assert.deepEqual(plain(ctx.cultureSettle(harvest, { amount: 1, type: 'culture_yeast' })), { culture_yeast: 1 });
    assert.deepEqual(plain(ctx.cultureSettle(harvest, { amount: 1, type: 'used_dish' })), { used_dish: 1 });
    // A request saved before that, which still waits for an `also`, settles all the same.
    assert.deepEqual(plain(ctx.cultureSettle({ took: {}, gives: { result: 1, also: 1 } }, { amount: 1, type: 'culture_yeast', also: 'used_dish' })), { culture_yeast: 1, used_dish: 1 });
    assert.deepEqual(plain(ctx.cultureSettle(harvest, { amount: 0, reason: 'gone' })), {});
    // The filter is the tube that becomes the sample.
    assert.deepEqual(plain(ctx.microscopeRequestItems('sample', 'water_filter').took), { water_filter: 1 });
    assert.deepEqual(plain(ctx.microscopeRequestItems('sample').took), { test_tube: 1 });
});

test('what grows from what, and what a plate gives, as the server says', () => {
    assert.equal(ctx.cultureInoculum('flower_red'), 'yeast');
    assert.equal(ctx.cultureInoculum('milk'), 'lactobacillus');
    assert.equal(ctx.cultureInoculum('dirt'), 'soil_bacteria');
    assert.equal(ctx.cultureInoculum('sample_plains_lake_a'), 'cyanobacteria');
    assert.equal(ctx.cultureInoculum('sample_plains_lake_b'), null);
    assert.equal(ctx.cultureInoculum('tardigrade_tube'), null);
    assert.equal(ctx.cultureInoculum('stone'), null);
    for (const [id, kind] of Object.entries(ctx.CULTURE_SPECIES)) assert.equal(ctx.cultureInoculum(kind.item), id);
    assert.equal(ctx.cultureHarvestOf('agar_plate', { nutrient: 1 }), 'agar_plate');
    assert.equal(ctx.cultureHarvestOf('agar_plate', { main: { species: 'yeast', logN: 7 }, nutrient: 0.4 }), 'culture_yeast');
    assert.equal(ctx.cultureHarvestOf('agar_plate', { main: { species: 'yeast', logN: 4 }, nutrient: 0.9 }), 'used_dish');
    assert.equal(ctx.cultureHarvestOf('agar_plate_unsterile', { main: { species: 'lactobacillus', logN: 8 }, mould: { species: 'mould', logN: 6.5, lag: 0 }, nutrient: 0.1 }), 'culture_mould');
    assert.equal(ctx.cultureHarvestOf('agar_plate_unsterile', { mould: { species: 'mould', logN: 1, lag: 2 }, nutrient: 1 }), 'agar_plate_unsterile');
    // A dish is no inoculum, though it goes on a microscope.
    for (const dish of ['agar_plate', 'agar_plate_unsterile', 'used_dish']) assert.equal(ctx.cultureInoculum(dish), null, dish);
    // The power line follows what grows.
    assert.equal(ctx.culturePowerLine({ incubator: { plates: [null, null, null] } }).key, 'powerIdle');
    assert.equal(ctx.culturePowerLine({ powered: false, incubator: { plates: [{ main: { logN: 3 } }] } }).key, 'powerOff');
    assert.equal(ctx.culturePowerLine({ powered: true, incubator: { plates: [{ main: { logN: 3 } }] } }).key, 'powerOn');
});

// ---- Language ----

test('every line has both languages, the same shape in each, and the server\'s refusals are all said', () => {
    for (const [key, value] of Object.entries(ctx.CULTURE_TEXT)) {
        assert.deepEqual(Object.keys(value).sort(), ['EN', 'ES'], key);
        assert.equal(typeof value.ES, typeof value.EN, key);
        if (typeof value.EN === 'object') assert.deepEqual(Object.keys(value.ES).sort(), Object.keys(value.EN).sort(), key);
        if (typeof value.EN === 'string') assert.ok(value.ES && value.EN, key);
    }
    const reasons = new Set([...goMicrobes.matchAll(/(?:Reason: |refuse\()"([a-z ]+)"/g)].map((match) => match[1]));
    assert.ok(reasons.size >= 7, [...reasons].join());
    // A request with no good id is never answered, so it needs no words.
    reasons.delete('bad request');
    for (const reason of reasons) {
        assert.ok(ctx.CULTURE_TEXT.refused.EN[reason], `${reason} in English`);
        assert.ok(ctx.CULTURE_TEXT.refused.ES[reason], `${reason} in Spanish`);
    }
    // The panel writes no line of its own: every textContent comes from cultureSay or a name.
    const source = fs.readFileSync(path.join(JS, 'game', 'cultures.js'), 'utf8');
    assert.doesNotMatch(source, /textContent = '[A-Za-z]/);
    assert.doesNotMatch(source, /textContent = `[A-Za-z]/);
    // Script order: the text before the panel, and both after the microscope they use.
    const html = fs.readFileSync(path.join(ROOT, 'pkg', 'web', 'static', 'index.html'), 'utf8');
    assert.ok(html.indexOf('js/game/microscope.js') < html.indexOf('js/game/cultures_text.js') && html.indexOf('js/game/cultures_text.js') < html.indexOf('js/game/cultures.js'));
    // The autoclave's panel speaks both too.
    inLang('ES', () => {
        assert.equal(ctx.APPLIANCE_MACHINES.autoclave.captions[0], 'A esterilizar');
        assert.match(ctx.APPLIANCE_MACHINES.autoclave.status(40, { oven: { cookMax: 10 }, powered: false }).text, /Sin corriente/);
        assert.equal(ctx.cultureItemName('used_dish', 'Used Dish'), 'Placa usada (sucia)');
        assert.equal(ctx.cultureItemName('culture_yeast', 'Yeast Plate'), 'Placa de levadura');
    });
    assert.equal(ctx.APPLIANCE_MACHINES.autoclave.captions[0], 'To sterilise');
});

// ---- The panel ----

function panelGame() {
    const sent = [];
    const said = [];
    const game = Object.create(ctx.Game.prototype);
    Object.assign(game, {
        inventory: ['agar_plate', 'agar_plate_unsterile', 'milk', 'flower_red', 'stone', 'sample_plains_lake_b'],
        inventoryCounts: { agar_plate: 3, agar_plate_unsterile: 1, milk: 2, flower_red: 4, stone: 9, sample_plains_lake_b: 1 },
        world: {
            blockTypes: { ...ctx.BLOCK_TYPES, ...ctx.ITEM_TYPES, agar_plate: { name: 'Agar Plate' }, milk: { name: 'Milk' }, flower_red: { name: 'Red Flower' }, stone: { name: 'Stone' }, glass: { name: 'Glass' } },
            getBlockTypeAt: () => 'incubator:n', getInventoryIconUrl: () => 'data:,'
        },
        network: { connected: true, send: (type, payload) => sent.push([type, payload]), on() {} },
        renderer: { domElement: {} }, cameraController: { camera: { position: { x: 0.5, y: 1.5, z: 0.5 } } },
        touchControlsEnabled: false, culturePending: new Map(),
        receiveSystemMessage: (message) => said.push(message.text), stopMining() {}, recapturePointerLock() {}, updatePointerLockHint() {}, playPickupSound() {},
        updateHotbarCounts() {}, refreshHeldItemMesh() {}, renderCraftingPanel() {}, renderInventoryPanel() {}, saveInventoryState() {},
        getInventoryCount(type) { return this.inventoryCounts[type] || 0; },
        addInventory(type, count) { this.inventoryCounts[type] = this.getInventoryCount(type) + count; },
        getBlockDisplayName(type) { return (this.world.blockTypes[type] && this.world.blockTypes[type].name) || type; },
        storageNewRequestId() { this.reqs = (this.reqs || 0) + 1; return `request-${this.reqs}-abcdef`; }
    });
    return { game, sent, said };
}

const CONTENTS = {
    x: 0, y: 0, z: 0, rev: 4, capacity: 3, powered: true,
    slots: [{ type: 'agar_plate', count: 1 }, { type: 'agar_plate_unsterile', count: 1 }, {}],
    incubator: {
        inside: 29.6, target: 30, ambient: 14.2, lit: false,
        plates: [
            { main: { species: 'yeast', logN: 7.4, lag: 0, phase: 'growth' }, nutrient: 0.62, age: 120, history: [[3, -1], [3, -1], [3.4, -1], [4.6, -1], [6, -1], [7.4, -1]], every: 4, next: 2 },
            { main: { species: 'lactobacillus', logN: 5, lag: 0, phase: 'growth' }, mould: { species: 'mould', logN: 6.2, lag: 0, phase: 'growth' }, nutrient: 0.3, age: 300, history: [[3, 1], [4, 3], [5, 6.2]], every: 8, next: 1 },
            null
        ]
    }
};

test('the panel opens on an incubator, shows its plates, and speaks the language of the game', () => {
    for (const lang of ['EN', 'ES']) {
        inLang(lang, () => {
            const { game, sent } = panelGame();
            assert.ok(game.cultureTryOpen({ x: 0, y: 0, z: 0 }));
            assert.deepEqual(plain(sent[0]), ['storageOpen', { x: 0, y: 0, z: 0 }]);
            game.cultureOnContents(plain(CONTENTS));
            const text = allText(game.culturePanel);
            const say = (key, ...args) => ctx.cultureSay(key, ...args);
            for (const line of [say('title'), say('powerOn', 20), say('ambient', '14.2'), say('slot', 1), say('harvest'), say('load'), say('contaminated')]) assert.ok(text.includes(line), `${lang}: ${line}`);
            assert.ok(text.includes(lang === 'ES' ? 'Placa de levadura' : 'Yeast Plate'), `${lang} names what a plate gives`);
            // Nothing of the other language is left: no English line in Spanish.
            if (lang === 'ES') {
                for (const value of Object.values(ctx.CULTURE_TEXT)) {
                    if (typeof value.EN === 'string' && value.EN !== value.ES && value.EN.length > 8) assert.ok(!text.includes(value.EN), `English left: ${value.EN}`);
                }
            }
            // The plates and the curve were drawn.
            const canvases = game.culturePanel.querySelectorAll('canvas');
            assert.ok(canvases.length >= 3);
            assert.ok(canvases[0].context.calls.some(([name]) => name === 'arc'));
            const graph = game.culturePanel.querySelector('#culture-graph').getContext();
            assert.ok(graph.calls.some(([name]) => name === 'lineTo'));
            game.cultureClose();
            assert.equal(game.cultureAt, null);
        });
    }
});

test('the panel: load, inoculate, harvest and the dial go through requests that settle the inventory', () => {
    const { game, sent, said } = panelGame();
    game.cultureHold = () => {};
    game.cultureTryOpen({ x: 0, y: 0, z: 0 });
    game.cultureOnContents(plain(CONTENTS));
    // The chooser lists only what fits.
    game.cultureChoose('load', 2);
    assert.deepEqual(plain(game.cultureChoices('load')), ['agar_plate', 'agar_plate_unsterile']);
    assert.deepEqual(plain(game.cultureChoices('inoculate')), ['milk', 'flower_red']);
    game.cultureApply('load', 2, 'agar_plate');
    assert.equal(game.getInventoryCount('agar_plate'), 2, 'out of the inventory at once');
    const [type, payload] = sent[sent.length - 1];
    assert.equal(type, 'cultureLoad');
    assert.equal(payload.slot, 2);
    game.cultureOnOutcome({ reqId: payload.reqId, type: 'agar_plate', amount: 0, reason: 'occupied' });
    assert.equal(game.getInventoryCount('agar_plate'), 3, 'a refusal gives it back');
    // Harvest: the culture plate, which is its own dish.
    game.cultureApply('harvest', 0);
    const harvest = sent[sent.length - 1][1];
    game.cultureOnOutcome({ reqId: harvest.reqId, type: 'culture_yeast', amount: 1 });
    assert.equal(game.getInventoryCount('culture_yeast'), 1);
    assert.equal(game.getInventoryCount('used_dish'), 0);
    assert.ok(said.includes(ctx.cultureSay('gotCulture', 'Yeast Plate')), 'it says how to look at it');
    // Taking out closed the panel; the rest happens with it open again.
    game.cultureTryOpen({ x: 0, y: 0, z: 0 });
    game.cultureOnContents(plain({ ...CONTENTS, rev: 9 }));
    // Someone else's answer is not ours.
    game.cultureOnOutcome({ reqId: 'not-mine-123', type: 'stone', amount: 1 });
    assert.equal(game.getInventoryCount('stone'), 9);
    // The dial: moved here at once, sent once.
    game.cultureSetTarget(50);
    assert.equal(game.cultureTarget(), 45);
    game.cultureSendDial();
    assert.deepEqual(plain(sent[sent.length - 1][0]), 'cultureSet');
    assert.equal(sent[sent.length - 1][1].target, 45);
    // A pending request survives a reload.
    game.cultureApply('inoculate', 1, 'milk');
    const saved = JSON.parse(ctx.window.localStorage.getItem('minecloud-culture-pending'));
    assert.ok(saved.some((entry) => entry.op === 'inoculate'));
});

test('the incubator opens before a chest would, is a modal panel, and listens without taking from others', () => {
    const { game } = panelGame();
    assert.equal(ctx.ITEM_USE_HANDLERS.some((handler) => String(handler).includes('cultureTryOpen')), true);
    const ours = ctx.ITEM_USE_HANDLERS.findIndex((handler) => String(handler).includes('cultureTryOpen'));
    const chest = ctx.ITEM_USE_HANDLERS.findIndex((handler) => String(handler).includes('storageTryOpen'));
    assert.ok(ours < chest, 'before the chest');
    assert.ok(ctx.MODAL_PANELS.some((panel) => String(panel.close).includes('cultureClose')));
    // Escape closes the chooser first, then the panel.
    game.cultureTryOpen({ x: 0, y: 0, z: 0 });
    game.cultureChoose('load', 0);
    assert.equal(game.cultureEscape(), true);
    assert.equal(game.cultureEscape(), false);
    const source = fs.readFileSync(path.join(JS, 'game', 'cultures.js'), 'utf8');
    for (const type of ['storageResult', 'storageContents', 'storageClosed']) assert.ok(source.includes(`network.on('${type}'`), type);
    // Not connected: says so and opens nothing.
    const offline = panelGame();
    offline.game.network.connected = false;
    assert.ok(offline.game.cultureTryOpen({ x: 0, y: 0, z: 0 }));
    assert.equal(offline.game.cultureAt, undefined);
    assert.equal(offline.said.length, 1);
});

test('sowing is a small dialog over the panel: only what is carried, in the game\'s language, and Escape closes it first', () => {
    for (const lang of ['EN', 'ES']) {
        inLang(lang, () => {
            const { game, sent } = panelGame();
            const say = (key, ...args) => ctx.cultureSay(key, ...args);
            game.cultureTryOpen({ x: 0, y: 0, z: 0 });
            game.cultureOnContents(plain(CONTENTS));
            const box = game.cultureSowBox;
            assert.ok(box && box.id === 'culture-sow', 'a window of its own, not a part of the panel');
            assert.ok(!game.culturePanel.innerHTML.includes('culture-pop') && box.innerHTML.includes('culture-pop'), 'the panel holds no chooser to stretch it');
            assert.equal(box.classList.contains('visible'), false);
            game.cultureChoose('inoculate', 2);
            assert.equal(box.classList.contains('visible'), true);
            const text = allText(box);
            for (const line of [say('sowTitle', 3), say('chooseInoculum'), say('cancel'), say('sowClose')]) assert.ok(text.includes(line), `${lang}: ${line}`);
            assert.ok(!allText(game.culturePanel).includes(say('chooseInoculum')), 'the panel did not grow a list');
            if (lang === 'ES') {
                for (const value of Object.values(ctx.CULTURE_TEXT)) {
                    if (typeof value.EN === 'string' && value.EN !== value.ES && value.EN.length > 8) assert.ok(!text.includes(value.EN), `English left: ${value.EN}`);
                }
            }
            // Only what the player carries that grows: milk and the flower, not the stone or the lake sample.
            const choices = () => box.querySelector('#culture-pop').children.filter((child) => child.className === 'culture-choice');
            assert.equal(choices().length, 2);
            assert.ok(!text.includes('Stone'));
            // Escape closes the dialog first, and the panel stays.
            assert.equal(game.cultureEscape(), true);
            assert.equal(box.classList.contains('visible'), false);
            assert.ok(game.cultureAt);
            assert.equal(game.cultureEscape(), false);
            // The shade round it closes it; a click inside does not.
            game.cultureChoose('load', 2);
            assert.ok(allText(box).includes(say('loadTitle', 3)));
            box.listeners.click[0]({ target: {} });
            assert.equal(box.classList.contains('visible'), true);
            box.listeners.click[0]({ target: box });
            assert.equal(box.classList.contains('visible'), false);
            // Its ✕ closes it too.
            game.cultureChoose('load', 2);
            box.querySelector('.culture-sow-close').listeners.click[0]();
            assert.equal(box.classList.contains('visible'), false);
            // Picking one sends it and closes the dialog, with the panel still open.
            game.cultureChoose('inoculate', 2);
            const [first] = choices();
            first.listeners.click[0]();
            const [type, payload] = sent[sent.length - 1];
            assert.equal(type, 'cultureInoculate');
            assert.equal(payload.slot, 2);
            assert.equal(box.classList.contains('visible'), false);
            assert.ok(game.cultureAt);
            // With nothing to sow, it says what would do.
            game.inventoryCounts.milk = 0;
            game.inventoryCounts.flower_red = 0;
            game.cultureChoose('inoculate', 2);
            assert.equal(choices().length, 0);
            assert.ok(allText(box).includes(say('noInocula')));
            // Closing the panel takes the dialog with it.
            game.cultureClose();
            assert.equal(box.classList.contains('visible'), false);
        });
    }
});

test('a plate draws what grows on it: nothing, colonies, a lawn, and the clear ring round the mould', () => {
    assert.equal(ctx.cultureColonies(3).count, 0);
    assert.ok(ctx.cultureColonies(6).count > 0 && ctx.cultureColonies(6).lawn === 0);
    assert.ok(ctx.cultureColonies(9).lawn === 1);
    const draw = (plate, type = 'agar_plate') => {
        const c = recordingContext();
        ctx.cultureDrawPlate(c, 160, type, plate, 42);
        return c.calls;
    };
    const arcs = (calls) => calls.filter(([name]) => name === 'arc').length;
    assert.equal(arcs(draw(null, '')), 1, 'an empty slot is the dish alone');
    assert.equal(arcs(draw({ nutrient: 1 })), 2, 'a clean plate: dish and agar');
    assert.ok(arcs(draw({ main: { species: 'yeast', logN: 7 }, nutrient: 0.5 })) > 10);
    const spoilt = draw({ main: { species: 'lactobacillus', logN: 8 }, mould: { species: 'mould', logN: 7, lag: 0 }, nutrient: 0.2 });
    const free = draw({ main: { species: 'yeast', logN: 8 }, mould: { species: 'mould', logN: 7, lag: 0 }, nutrient: 0.2 });
    assert.ok(arcs(spoilt) > arcs(free), 'penicillin clears a ring round the mould in bacteria, not in yeast');
    // The same plate draws the same every time.
    assert.deepEqual(draw({ main: { species: 'yeast', logN: 7 }, nutrient: 0.5 }), draw({ main: { species: 'yeast', logN: 7 }, nutrient: 0.5 }));
});

test('what a plate shows is what comes out: colonies only from 10^6, and then a culture plate', () => {
    for (let log = 0; log <= 9; log += 0.25) {
        const shows = ctx.cultureColonies(log).count > 0;
        const sown = ctx.cultureHarvestOf('agar_plate', { main: { species: 'yeast', logN: log, lag: 0 }, nutrient: 0.5 });
        assert.equal(shows, sown === 'culture_yeast', `yeast at 10^${log}`);
        const mould = ctx.cultureHarvestOf('agar_plate_unsterile', { mould: { species: 'mould', logN: log, lag: 0 }, nutrient: 0.5 });
        assert.equal(shows, mould === 'culture_mould', `mould at 10^${log}`);
    }
    // The drawing agrees: no colony of mould below 10^6 (it used to show from 10^3.5, while the plate gave a dish).
    const arcs = (plate) => {
        const c = recordingContext();
        ctx.cultureDrawPlate(c, 160, 'agar_plate_unsterile', plate, 42);
        return c.calls.filter(([name]) => name === 'arc').length;
    };
    assert.equal(arcs({ mould: { species: 'mould', logN: 5.5, lag: 0 }, nutrient: 0.8 }), 2, 'dish and agar, and nothing to see');
    assert.ok(arcs({ mould: { species: 'mould', logN: 6.5, lag: 0 }, nutrient: 0.6 }) > 2);
});

test('the lens shows what lives on a plate now, from its numbers', () => {
    const count = (plate) => ctx.cultureLensView(plate, 9).cells.length;
    assert.equal(count({ nutrient: 1 }), 0, 'clean agar');
    assert.ok(count({ main: { species: 'yeast', logN: 3, lag: 2 }, nutrient: 1 }) >= 2, 'a fresh inoculum: a few cells');
    assert.ok(count({ main: { species: 'yeast', logN: 6, lag: 0 }, nutrient: 1 }) > count({ main: { species: 'yeast', logN: 3, lag: 0 }, nutrient: 1 }));
    assert.ok(count({ main: { species: 'yeast', logN: 9, lag: 0 }, nutrient: 1 }) > count({ main: { species: 'yeast', logN: 6, lag: 0 }, nutrient: 1 }));
    // Dying, most are pale; growing, none.
    const dying = ctx.cultureLensView({ main: { species: 'yeast', logN: 8, phase: 'death' }, nutrient: 0 }, 9).cells;
    assert.ok(dying.filter((cell) => cell.dead).length > dying.length / 2);
    assert.equal(ctx.cultureLensView({ main: { species: 'yeast', logN: 8, phase: 'growth' }, nutrient: 0.4 }, 9).cells.filter((cell) => cell.dead).length, 0);
    // The mould, and its clear ring in bacteria it holds back, not in yeast.
    const spoilt = ctx.cultureLensView({ main: { species: 'lactobacillus', logN: 8 }, mould: { species: 'mould', logN: 7, lag: 0 }, nutrient: 0.2 }, 9);
    assert.ok(spoilt.brushes.length >= 1 && spoilt.rings.length === spoilt.brushes.length);
    for (const cell of spoilt.cells) for (const ring of spoilt.rings) assert.ok(Math.hypot(cell.x - ring.x, cell.y - ring.y) >= ring.r, 'no bacterium inside a ring');
    const yeast = ctx.cultureLensView({ main: { species: 'yeast', logN: 8 }, mould: { species: 'mould', logN: 7, lag: 0 }, nutrient: 0.2 }, 9);
    assert.equal(yeast.rings.length, 0);
    // An unsterile plate not yet warm: its spores, waiting.
    assert.equal(ctx.cultureLensView({ mould: { species: 'mould', logN: 1, lag: 2 }, nutrient: 1 }, 9).brushes.length, 1);
    // The same plate, the same field; and it draws with the microscope's own organisms.
    const plate = { main: { species: 'soil_bacteria', logN: 6.4 }, mould: { species: 'mould', logN: 5, lag: 0 }, nutrient: 0.5 };
    assert.deepEqual(plain(ctx.cultureLensView(plate, 3)), plain(ctx.cultureLensView(plate, 3)));
    const c = recordingContext();
    const drawn = ctx.cultureDrawLens(c, 300, 300, plate, 3);
    assert.ok(drawn.cells.length > 0 && c.calls.length > drawn.cells.length * 3, 'it drew the cells');
    // The words, in both languages, say what can be seen by eye and why.
    for (const lang of ['EN', 'ES']) {
        inLang(lang, () => {
            const say = (p) => ctx.cultureLensLines(p, (id) => id).map(({ key, args }) => ctx.cultureSay(key, ...args)).join(' | ');
            assert.match(say({ main: { species: 'yeast', logN: 5.2, phase: 'growth' }, nutrient: 0.8 }), lang === 'ES' ? /placa usada/ : /used dish/);
            assert.match(say({ main: { species: 'yeast', logN: 7, phase: 'growth' }, nutrient: 0.5 }), lang === 'ES' ? /placa de cultivo/ : /culture plate/);
            assert.match(say({ main: { species: 'lactobacillus', logN: 7 }, mould: { species: 'mould', logN: 7, lag: 0 }, nutrient: 0.2 }), /penicil/);
            assert.ok(say({ nutrient: 1 }).length > 5);
        });
    }
});

function lookButton(game, slot) {
    const card = game.culturePanel.querySelectorAll('.culture-card')[slot];
    return card.querySelector('.culture-buttons').children.find((element) => element.textContent === ctx.cultureSay('look'));
}

test('the panel: "Look" opens the lens in its own window over the panel, live, and Escape closes it first', () => {
    for (const lang of ['EN', 'ES']) {
        inLang(lang, () => {
            const { game } = panelGame();
            game.cultureTryOpen({ x: 0, y: 0, z: 0 });
            game.cultureOnContents(plain(CONTENTS));
            const look = game.cultureLookBox;
            assert.ok(look && look.id === 'culture-look', 'a window of its own');
            assert.ok(ctx.document.body.children.includes(look) && !all(game.culturePanel).includes(look), 'on the page, not inside the panel');
            assert.ok(!look.classList.contains('visible'), 'shut until asked');
            assert.ok(lookButton(game, 1), `${lang}: every plate has its Look button`);
            lookButton(game, 1).listeners.click[0]();
            assert.ok(look.classList.contains('visible'));
            assert.ok(game.culturePanel.classList.contains('visible'), 'the panel stays under it');
            const plateName = game.cultureName('agar_plate_unsterile');
            assert.equal(look.querySelector('#culture-look-title').textContent, ctx.cultureSay('lensTitle', 2, plateName), 'its title names the plate');
            assert.ok(look.querySelector('#culture-look-title').textContent.includes(plateName));
            assert.equal(look.querySelector('.culture-look-close').title, ctx.cultureSay('lensClose'));
            assert.ok(allText(look).includes(ctx.cultureSay('lensRing', game.cultureSpeciesName('lactobacillus'))), `${lang}: the ring round the mould is said`);
            const lens = look.querySelector('#culture-lens').getContext();
            assert.ok(lens.calls.some(([name]) => name === 'arc'), 'the lens was drawn');
            // It keeps up with the server while open.
            const drawn = lens.calls.length;
            const later = plain(CONTENTS);
            later.rev = 5;
            later.incubator.plates[1].main.logN = 8.3;
            game.cultureOnContents(later);
            assert.ok(lens.calls.length > drawn, 'redrawn');
            assert.ok(allText(look).includes(ctx.cultureSay('lensMain', game.cultureSpeciesName('lactobacillus'), '8.3')), 'the new numbers are said');
            // Escape: the window first, the panel on the second press (as the modal panels ask it).
            const modal = ctx.MODAL_PANELS.find((panel) => String(panel.close).includes('cultureClose'));
            assert.equal(modal.escape.call(game), true);
            assert.ok(!look.classList.contains('visible'));
            assert.ok(game.cultureAt && game.culturePanel.classList.contains('visible'), 'the panel is still open');
            assert.equal(modal.escape.call(game), false, 'the next Escape closes the panel');
            // Its ✕ and the shade round it close it too; a click inside the window does not.
            lookButton(game, 1).listeners.click[0]();
            look.querySelector('.culture-look-close').listeners.click[0]();
            assert.ok(!look.classList.contains('visible'));
            lookButton(game, 1).listeners.click[0]();
            look.listeners.click[0]({ target: look });
            assert.ok(!look.classList.contains('visible'));
            lookButton(game, 1).listeners.click[0]();
            look.listeners.click[0]({ target: look.querySelector('#culture-lens') });
            assert.ok(look.classList.contains('visible'), 'a click inside the window leaves it');
            // A press in it does not reach the page (which would close the panel).
            let stopped = 0;
            look.listeners.mousedown[0]({ stopPropagation: () => stopped++ });
            assert.equal(stopped, 1);
            // The plate taken out, the lens goes.
            const gone = plain(CONTENTS);
            gone.rev = 6;
            gone.slots[1] = {};
            gone.incubator.plates[1] = null;
            game.cultureOnContents(gone);
            assert.ok(!look.classList.contains('visible'));
            // An empty slot has no Look.
            assert.ok(!lookButton(game, 2));
            // Closing the panel closes it.
            lookButton(game, 0).listeners.click[0]();
            assert.ok(look.classList.contains('visible'));
            game.cultureClose();
            assert.ok(!look.classList.contains('visible'), 'closing the panel closes it');
        });
    }
    // It fits a phone: a fixed window that scrolls inside, never the page.
    const source = fs.readFileSync(path.join(JS, 'game', 'cultures.js'), 'utf8');
    assert.match(source, /#culture-look\{position:fixed;inset:0/);
    assert.match(source, /\.culture-look-window\{[^}]*width:min\(340px,100%\);max-height:100%;overflow-y:auto/);
});

// A game with the real hotbar of js/game/inventory.js: only what draws is left out.
function handGame() {
    const made = panelGame();
    const { game } = made;
    for (const key of ['getInventoryCount', 'addInventory', 'updateHotbarCounts', 'saveInventoryState']) delete game[key];
    // The hotbar paints each slot in its item's colour.
    for (const [type, def] of Object.entries(game.world.blockTypes)) if (def.color === undefined) game.world.blockTypes[type] = { ...def, color: 0x808080 };
    made.relocks = 0;
    Object.assign(game, {
        hotbarSize: 9, selectedSlot: 4, hotbarPrimaryType: 'stone', hotbarPinnedTypes: ['stone', 'agar_plate', 'milk'], hotbarSlotElements: [], hotbarCountElements: [],
        getItemTagIndex() {}, recapturePointerLock() { made.relocks++; }
    });
    return made;
}

function withHotbarElement(work) {
    const before = ctx.document.getElementById;
    const hotbar = fakeElement();
    ctx.document.getElementById = (id) => (id === 'hotbar' ? hotbar : null);
    try {
        return work();
    } finally {
        ctx.document.getElementById = before;
    }
}

function takeOut(game, slot) {
    const card = game.culturePanel.querySelectorAll('.culture-card')[slot];
    const button = card.querySelector('.culture-buttons').children.find((element) => element.textContent === ctx.cultureSay('harvest'));
    assert.ok(button, 'the plate has its Take out button');
    button.listeners.click[0]();
}

test('"Take out": once the plate has arrived the panel closes, the pointer is taken again, and the plate is in the hand', () => {
    for (const lang of ['EN', 'ES']) {
        inLang(lang, () => withHotbarElement(() => {
            const made = handGame();
            const { game, sent, said } = made;
            game.cultureTryOpen({ x: 0, y: 0, z: 0 });
            game.cultureOnContents(plain(CONTENTS));
            takeOut(game, 0);
            const [type, payload] = sent[sent.length - 1];
            assert.equal(type, 'cultureHarvest');
            assert.equal(payload.slot, 0);
            // Nothing happens before the server answers.
            assert.ok(game.cultureAt && game.culturePanel.classList.contains('visible'), 'the panel waits for the answer');
            assert.equal(game.getSelectedBlockType(), 'stone');
            assert.equal(made.relocks, 0);
            // It arrives: a new item, into the hotbar and selected.
            game.cultureOnOutcome({ reqId: payload.reqId, type: 'culture_yeast', amount: 1 });
            assert.equal(game.cultureAt, null);
            assert.ok(!game.culturePanel.classList.contains('visible'));
            assert.equal(made.relocks, 1, 'the pointer is taken again, as other panels do');
            assert.ok(game.suppressPointerLockPauseUntil > 0, 'losing the pointer meanwhile opens no pause menu');
            assert.equal(sent[sent.length - 1][0], 'storageClose');
            assert.equal(game.getInventoryCount('culture_yeast'), 1);
            assert.equal(game.getSelectedBlockType(), 'culture_yeast', 'in the hand');
            const hotbar = plain(game.getHotbarInventoryIndexes().map((index) => game.inventory[index]));
            assert.equal(hotbar[0], 'culture_yeast', 'in the first hotbar slot');
            assert.ok(game.getHotbarItems()[0].selected, 'that slot selected');
            assert.ok(hotbar.includes('stone') && hotbar.includes('agar_plate'), 'nothing pushed out of a hotbar with room');
            assert.ok(said.includes(ctx.cultureSay('gotCulture', game.cultureName('culture_yeast'))), 'it says how to look at it under a microscope');
            const state = JSON.parse(ctx.window.localStorage.getItem('minecloud-inventory-state'));
            assert.equal(state.inventory[state.selectedSlot], 'culture_yeast', 'saved selected');
        }));
    }
});

test('"Take out": what is already in the hotbar goes to its first slot, selected; a refusal leaves the panel and says why', () => withHotbarElement(() => {
    const made = handGame();
    const { game, sent } = made;
    game.inventory.push('used_dish');
    game.inventoryCounts.used_dish = 2;
    game.hotbarPinnedTypes = ['stone', 'used_dish', 'agar_plate'];
    game.cultureTryOpen({ x: 0, y: 0, z: 0 });
    game.cultureOnContents(plain(CONTENTS));
    const order = plain(game.getHotbarInventoryIndexes());
    takeOut(game, 1);
    game.cultureOnOutcome({ reqId: sent[sent.length - 1][1].reqId, type: 'used_dish', amount: 1 });
    assert.equal(game.getInventoryCount('used_dish'), 3);
    assert.equal(game.getSelectedBlockType(), 'used_dish');
    const dish = game.inventory.indexOf('used_dish');
    assert.deepEqual(plain(game.getHotbarInventoryIndexes()), [dish, ...order.filter((index) => index !== dish)], 'the first slot, the others one along');
    assert.ok(game.getHotbarItems()[0].selected);
    assert.equal(game.cultureAt, null);

    // Refused: nothing comes, the panel stays, the reason is said, the hand is as it was.
    game.selectSlot(game.inventory.indexOf('stone'));
    game.cultureTryOpen({ x: 0, y: 0, z: 0 });
    game.cultureOnContents(plain({ ...CONTENTS, rev: 7 }));
    const relocks = made.relocks;
    takeOut(game, 0);
    game.cultureOnOutcome({ reqId: sent[sent.length - 1][1].reqId, type: '', amount: 0, reason: 'gone' });
    assert.ok(game.cultureAt && game.culturePanel.classList.contains('visible'), 'the panel stays');
    assert.equal(game.culturePanel.querySelector('#culture-note').textContent, ctx.CULTURE_TEXT.refused.EN.gone);
    assert.equal(game.getSelectedBlockType(), 'stone');
    assert.equal(made.relocks, relocks, 'the pointer stays free');

    // An answer resumed after a reload settles the inventory, but does not take the hand.
    ctx.window.localStorage.setItem('minecloud-culture-pending', JSON.stringify([{ reqId: 'request-old-abcdef', took: {}, gives: { result: 1 }, op: 'harvest' }]));
    game.cultureLoadPending();
    game.cultureOnOutcome({ reqId: 'request-old-abcdef', type: 'culture_yeast', amount: 1 });
    assert.equal(game.getInventoryCount('culture_yeast'), 1);
    assert.equal(game.getSelectedBlockType(), 'stone');
    assert.ok(game.cultureAt, 'the panel is left alone');
    ctx.window.localStorage.removeItem('minecloud-culture-pending');
}));

test('dishes and culture plates look and are called differently, and every one goes on a microscope', () => {
    const dishes = ['petri_dish', 'agar_plate', 'agar_plate_unsterile', 'used_dish', ...Object.values(ctx.CULTURE_SPECIES).map((kind) => kind.item)];
    const looks = new Set(dishes.map((id) => JSON.stringify([ctx.CULTURE_ITEMS[id].sprite, ctx.CULTURE_ITEMS[id].palette])));
    assert.equal(looks.size, dishes.length, 'no two share a look');
    const sprites = new Set(dishes.map((id) => ctx.CULTURE_ITEMS[id].sprite.join('')));
    assert.equal(sprites.size, dishes.length, 'no two share a drawing, only told apart by colour');
    for (const lang of ['EN', 'ES']) {
        inLang(lang, () => {
            const names = dishes.map((id) => ctx.cultureItemName(id, ctx.CULTURE_ITEMS[id].name));
            assert.equal(new Set(names).size, names.length, `${lang}: ${names.join(', ')}`);
        });
    }
    for (const kind of Object.values(ctx.CULTURE_SPECIES)) {
        assert.match(ctx.CULTURE_ITEMS[kind.item].name, / Plate$/, kind.item);
        assert.match(ctx.CULTURE_ITEMS_ES[kind.item], /^Placa de /, kind.item);
        // Each is drawn as a dish with colonies of its own colour, not as a vial.
        assert.ok(ctx.CULTURE_ITEMS[kind.item].sprite.some((row) => /g[A-Za-z]+g/.test(row)));
    }
    // On the microscope: with the plate in the hand, no slide; it comes back as it went.
    const goMicroscope = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'microscope.go'), 'utf8');
    const goPlates = goTable(goMicroscope, 'microscopePlates');
    assert.deepEqual([...goPlates.matchAll(/"(\w+)": true/g)].map((match) => match[1]).sort(), Object.keys(ctx.MICRO_PLATES).sort());
    for (const id of dishes.filter((dish) => dish !== 'petri_dish')) {
        assert.ok(ctx.MICRO_PLATES[id], `${id} goes on the stage`);
        assert.equal(ctx.microscopeSourceHeld(id), id, `${id} in the hand goes on a free microscope`);
        assert.deepEqual(plain(ctx.microscopeRequestItems('prepare', id)), { took: { [id]: 1 }, gives: {} }, `${id} needs no slide`);
    }
    assert.deepEqual(plain(ctx.microscopeRequestItems('prepare', 'dirt')), { took: { glass_slide: 1, dirt: 1 }, gives: {} }, 'a slide still takes its slide');
    assert.deepEqual(plain(ctx.microscopeRequestItems('clear')), { took: {}, gives: { result: 1 } }, 'what comes off is what the server names');
    assert.ok(ctx.microscopeSlideLine({ source: 'culture_mould' }, 9999).length > 0);
});

test('the guide has the pages of cultures, in both languages, and the indexes reach them', () => {
    const guide = path.join(ROOT, 'pkg', 'web', 'static', 'guide');
    const names = fs.readdirSync(guide);
    const pageOf = (id, lang) => fs.readFileSync(path.join(guide, names.find((name) => name.startsWith(`${id}_${lang}_`))), 'utf8');
    for (const lang of ['ES', 'EN']) {
        for (const id of [253, 254, 255]) {
            const page = pageOf(id, lang);
            assert.match(page, lang === 'ES' ? /## Ciencia y juego/ : /## Science and game/, `${id} ${lang} says what is true and what is simplified`);
            assert.match(page, lang === 'ES' ? /\*\*Es verdad:\*\*/ : /\*\*True:\*\*/);
            assert.match(page, lang === 'ES' ? /\*\*Lo simplifica el juego:\*\*/ : /\*\*Simplified by the game:\*\*/);
        }
        assert.match(pageOf(0, lang), /\(253\)/);
        assert.match(pageOf(48, lang), /\(253\)/);
        assert.match(pageOf(48, lang), /\(255\)/);
        // The recipes the page gives are the game's.
        const cultures = pageOf(253, lang);
        assert.match(cultures, /4 `iron_ore` \+ 2 `glass` \+ 1 `thermometer`/);
        assert.match(cultures, /1 `petri_dish` \+ 1 `wheat` \+ 1 `water_flask`/);
        // The table of temperatures is the server's.
        const curve = pageOf(254, lang);
        for (const kind of Object.values(ctx.CULTURE_SPECIES)) assert.ok(curve.includes(`| ${kind.tmin} °C | ${kind.topt} °C | ${kind.tmax} °C`), `${lang} ${kind.item}`);
        assert.ok(pageOf(255, lang).includes('(mob:mould)'));
    }
    assert.equal(ctx.CULTURE_GUIDE_PAGE, 253);
    assert.equal(ctx.MICRO_SPECIES.mould.page, 255);
});
