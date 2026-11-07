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
    const target = { calls, measureText: (text) => ({ width: String(text).length * 6 }) };
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
    for (const file of ['bestiary_text.js', 'bestiary.js', 'furniture.js', 'storage.js', 'appliances.js', 'electricity.js', 'microbes.js', 'microscope_text.js', 'microscope.js', 'cultures_text.js', 'cultures.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    }
    vm.runInContext(`Object.assign(this, { CULTURE_SPECIES, CULTURE_PLATES, CULTURE_ORDER, CULTURE_MODEL, CULTURE_TEXT, CULTURE_ITEMS, CULTURE_ITEMS_ES, CULTURE_KIT, CULTURE_GUIDE_PAGE,
        APPLIANCE_AUTOCLAVE, APPLIANCE_MACHINES, STORAGE_KINDS, ELECTRIC_KINDS, ITEM_TYPES, BLOCK_TYPES, BLOCK_SHAPES, GAME_CONTENT_HOOKS, MODAL_PANELS, ITEM_USE_HANDLERS, MICRO_SPECIES,
        cultureGamma, cultureInoculum, cultureHarvestOf, cultureRequestItems, cultureSettle, cultureGrowing, culturePowerLine, cultureDrawPlate, cultureDrawGraph, cultureColonies,
        cultureSay, cultureItemName, microscopeRequestItems, setGameLang, gameLang, Game });`, context);
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
    // The server's messages are wired.
    const websocket = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'websocket.go'), 'utf8');
    assert.match(websocket, /"cultureLoad", "cultureInoculate", "cultureHarvest", "cultureSet":/);
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
    const harvest = ctx.cultureRequestItems('harvest');
    assert.deepEqual(plain(ctx.cultureSettle(harvest, { amount: 1, type: 'culture_yeast', also: 'used_dish' })), { culture_yeast: 1, used_dish: 1 });
    assert.deepEqual(plain(ctx.cultureSettle(harvest, { amount: 1, type: 'used_dish' })), { used_dish: 1 });
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
    assert.deepEqual(plain(ctx.cultureHarvestOf('agar_plate', { nutrient: 1 })), { item: 'agar_plate', also: '' });
    assert.deepEqual(plain(ctx.cultureHarvestOf('agar_plate', { main: { species: 'yeast', logN: 7 }, nutrient: 0.4 })), { item: 'culture_yeast', also: 'used_dish' });
    assert.deepEqual(plain(ctx.cultureHarvestOf('agar_plate', { main: { species: 'yeast', logN: 4 }, nutrient: 0.9 })), { item: 'used_dish', also: '' });
    assert.deepEqual(plain(ctx.cultureHarvestOf('agar_plate_unsterile', { main: { species: 'lactobacillus', logN: 8 }, mould: { species: 'mould', logN: 6.5, lag: 0 }, nutrient: 0.1 })), { item: 'culture_mould', also: 'used_dish' });
    assert.deepEqual(plain(ctx.cultureHarvestOf('agar_plate_unsterile', { mould: { species: 'mould', logN: 1, lag: 2 }, nutrient: 1 })), { item: 'agar_plate_unsterile', also: '' });
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
        assert.equal(ctx.cultureItemName('used_dish', 'Used Dish'), 'Placa sucia');
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
            assert.ok(text.includes(lang === 'ES' ? 'Cultivo de levadura' : 'Yeast Culture'), `${lang} names what a plate gives`);
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
    const { game, sent } = panelGame();
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
    // Harvest: the culture and the dish.
    game.cultureApply('harvest', 0);
    const harvest = sent[sent.length - 1][1];
    game.cultureOnOutcome({ reqId: harvest.reqId, type: 'culture_yeast', also: 'used_dish', amount: 1 });
    assert.equal(game.getInventoryCount('culture_yeast'), 1);
    assert.equal(game.getInventoryCount('used_dish'), 1);
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
