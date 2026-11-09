// Node tests for culture plates that are each themselves (js/game/plates.js, and the paths in
// js/game/inventory.js, storage.js, microscope.js and cultures.js that move them): each plate its own slot
// with its own icon and tooltip, saved with the counts and back after a reload, old plain plates kept, every
// move (a chest both ways, a refusal, a reload with a move on its way, Q and the pickup, the microscope,
// sowing, harvesting) moving exactly that plate, and random sequences of all of it against a stand-in server
// that never duplicates one. The server's own checks are tested in pkg/network/plates_test.go.
// Run with: node --test test/js/plates.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const JS = path.join(ROOT, 'pkg', 'web', 'static', 'js');

function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}

// A 2D context that writes down where it drew circles on its canvas (`drawn`), so drawings can be told apart.
function recordingContext(canvas) {
    const target = { measureText: (text) => ({ width: String(text).length * 6 }), createRadialGradient: () => ({ addColorStop() {} }) };
    return new Proxy(target, {
        get: (known, key) => (key in known ? known[key] : (...args) => { if (key === 'arc' && canvas) canvas.drawn = `${canvas.drawn || ''}${args.slice(0, 3).map((n) => Math.round(n)).join(',')};`; }),
        set: () => true
    });
}

function fakeElement(tag = 'div') {
    const classes = new Set();
    const element = {
        tag, children: [], listeners: {}, style: {}, dataset: {}, title: '', value: '', disabled: false, width: 160, height: 160, clientWidth: 0,
        classList: {
            add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name),
            toggle: (name, on) => { if (on ?? !classes.has(name)) classes.add(name); else classes.delete(name); }
        },
        set className(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach((name) => classes.add(name)); },
        get className() { return [...classes].join(' '); },
        addEventListener(type, handler) { (this.listeners[type] = this.listeners[type] || []).push(handler); },
        appendChild(child) { this.children.push(child); return child; },
        append(...children) { for (const child of children) this.children.push(typeof child === 'string' ? { text: child, children: [] } : child); },
        getContext() { return recordingContext(element); },
        // A canvas "draws" to a URL that names what it was drawn from, so icons can be told apart.
        toDataURL() { return `data:plate,${element.drawn || ''}`; },
        querySelector: (selector) => element.found(selector),
        querySelectorAll: () => [],
        focus() {}, setAttribute() {}, removeChild() {}, getBoundingClientRect: () => ({ width: 10 })
    };
    const found = new Map();
    element.found = (selector) => {
        if (!found.has(selector)) found.set(selector, fakeElement());
        return found.get(selector);
    };
    let text = '';
    Object.defineProperty(element, 'textContent', { get: () => text, set(value) { text = String(value); element.children = []; } });
    let inner = '';
    Object.defineProperty(element, 'innerHTML', { get: () => inner, set(value) { inner = value; element.children = []; } });
    return element;
}

function memoryStorage(values = new Map([['minecloud-guide-lang', 'EN']])) {
    return { values, getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

// The game's files in a page of their own, sharing `storage` (the browser's localStorage) with any other.
function loadGame(storage = memoryStorage()) {
    const elements = new Map();
    const context = vm.createContext({
        console, Math, JSON, performance: { now: () => 1e9 }, window: { localStorage: storage, addEventListener() {} },
        THREE: anyStub(), navigator: {}
    });
    context.document = {
        createElement: (tag) => {
            const element = fakeElement(tag);
            return element;
        },
        head: fakeElement(), body: fakeElement(), addEventListener() {}, querySelector: () => null, pointerLockElement: null,
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, fakeElement());
            return elements.get(id);
        }
    };
    vm.runInContext('class Game {}; function resourcesDrawSprite() { return () => {}; } function resourcesDisplayMesh() { return null; }', context);
    for (const file of ['extensions.js', 'gameLang.js', 'chunkStore.js', 'blockShapes.js', 'mobSpecies.js']) vm.runInContext(fs.readFileSync(path.join(JS, file), 'utf8'), context, { filename: file });
    for (const file of ['item_tags.js', 'inventory.js', 'offhand.js', 'bestiary_text.js', 'bestiary.js', 'furniture.js', 'storage.js', 'appliances.js', 'smelters.js', 'electricity.js', 'microbes.js', 'microscope_text.js', 'microscope.js', 'cultures_text.js', 'cultures.js', 'plates.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    }
    const Game = vm.runInContext('Game', context);
    const game = new Game();
    const sent = [];
    const blockTypes = vm.runInContext('ITEM_TYPES', context);
    const types = Object.fromEntries(Object.entries(blockTypes).map(([id, def]) => [id, { color: 0x808080, ...def }]));
    Object.assign(types, { stone: { name: 'Stone', color: 0x808080 }, glass_slide: { name: 'Glass Slide', color: 0xffffff }, milk: types.milk || { name: 'Milk', color: 0xffffff } });
    Object.assign(game, {
        world: { blockTypes: types, getInventoryIconUrl: (type) => `icon:${type}`, createDisplayMesh: () => ({ position: { copy() {} }, rotation: { copy() {}, set() {} } }) },
        inventory: [], inventoryCounts: {}, selectedSlot: 0, hotbarSize: 9, hotbarPinnedTypes: [], hotbarSlotElements: [], hotbarCountElements: [],
        inventoryOpen: true, inventorySearchTerm: '', craftingOpen: false, craftingSearchTerm: '', craftingRecipes: [],
        network: { connected: true, send: (type, payload) => sent.push({ type, payload: JSON.parse(JSON.stringify(payload)) }), on() {} },
        pickups: new Map(), pickupIdCounter: 0, scene: { add() {}, remove() {} }, disposeObject3D() {},
        camera: { position: { x: 0, y: 2, z: 0 }, getWorldDirection: (v) => v },
        cameraController: { eyeHeight: 1.6, camera: { position: { x: 0, y: 2, z: 0 } }, getPosition: () => ({ x: 0, y: 2, z: 0 }) },
        playPlaceSound() {}, playPickupSound() {}, playTone() {}, receiveSystemMessage(message) { (game.messages = game.messages || []).push(message.text); },
        refreshHeldItemMesh() {}, renderCraftingPanel() {}, offhandRenderHud() {}, offhandDecorateItem() {}, offhandRefreshMesh() {},
        stopMining() {}, closeChatInput() {}, recapturePointerLock() {}, updatePointerLockHint() {}, renderer: { domElement: {} },
        touchControlsEnabled: false
    });
    // THREE is a stand-in: a vector that only keeps what is needed here.
    context.THREE = { Vector3: class { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } clone() { return this; } multiplyScalar() { return this; } add() { return this; } }, Euler: class {} };
    game.storageLoadPending();
    game.microscopeLoadPending();
    game.cultureLoadPending();
    game.restoreInventoryState();
    return { game, context, sent, storage, elements };
}

let idCounter = 0;
// A grant as the server sends it.
function grant(type = 'culture_yeast', logN = 7, mould = 0, seed = 0) {
    idCounter++;
    const hex = (n, width) => n.toString(16).padStart(width, '0');
    const species = { culture_yeast: 'yeast', culture_lactobacillus: 'lactobacillus', culture_soil: 'soil_bacteria', culture_cyano: 'cyanobacteria', culture_mould: 'mould' }[type];
    return {
        id: hex(idCounter, 24), token: hex(idCounter * 7919 + 1, 32), type,
        culture: { main: { species, logN, lag: 0, phase: 'stationary' }, ...(mould ? { mould: { species: 'mould', logN: mould, lag: 0, phase: 'growth' } } : {}), nutrient: 0.4, age: 100, every: 4, next: 0, seed: seed || 1000 + idCounter }
    };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test('only culture plates are plates of their own; a grant is only what the server can send', () => {
    const { context } = loadGame();
    for (const type of ['culture_yeast', 'culture_lactobacillus', 'culture_soil', 'culture_cyano', 'culture_mould']) assert.ok(context.plateIdentified(type), type);
    for (const type of ['agar_plate', 'agar_plate_unsterile', 'used_dish', 'petri_dish', 'stone']) assert.ok(!context.plateIdentified(type), `${type} stacks as any item`);
    const g = grant();
    assert.deepEqual(plain(context.plateEntryOf(g)), g);
    assert.equal(context.plateEntryOf({ ...g, id: 'x' }), null);
    assert.equal(context.plateEntryOf({ ...g, token: '' }), null);
    assert.equal(context.plateEntryOf({ ...g, type: 'stone' }), null);
    // The left hand holds no plate: it can never be where a move would not find it.
    const offhand = vm.runInContext('OFFHAND_ITEMS', context);
    assert.ok(!Object.keys(offhand).some((type) => context.plateIdentified(type) || type.startsWith('agar') || type === 'used_dish'));
});

test('each plate is its own slot with its own icon and summary, saved with the counts and back after a reload', () => {
    const storage = memoryStorage();
    const { game, elements } = loadGame(storage);
    const a = grant('culture_yeast', 7.2);
    const b = grant('culture_yeast', 6.4);
    const c = grant('culture_lactobacillus', 8.1, 6.3);
    game.plateAdd(a);
    game.plateAdd(b);
    game.plateAdd(c);
    game.addInventory('agar_plate', 4);
    assert.equal(game.getInventoryCount('culture_yeast'), 2);
    assert.deepEqual([...game.platesOf('culture_yeast')].map((entry) => entry.id), [a.id, b.id]);
    game.renderInventoryPanel();
    const shown = elements.get('inventory-grid').children.filter((child) => child.className.includes('inventory-item'));
    // Two yeast plates, one lactobacillus plate, and the agar plates as one stack.
    assert.equal(shown.length, 4);
    const yeast = shown.filter((item) => item.title.startsWith('Yeast Plate'));
    assert.equal(yeast.length, 2);
    assert.match(yeast[0].title, /Yeast: 10\^7\.2 cells/);
    assert.match(yeast[1].title, /Yeast: 10\^6\.4 cells/);
    assert.match(shown.find((item) => item.title.startsWith('Lactobacillus Plate')).title, /Mould: 10\^6\.3 cells\nA clear ring round the mould/);
    const icons = yeast.map((item) => item.children[0].style.backgroundImage);
    assert.notEqual(icons[0], icons[1], 'each draws its own colonies');
    assert.ok(icons.every((icon) => icon.startsWith('url(data:plate')));
    assert.equal(shown.find((item) => item.title.startsWith('Sterile Agar Plate')).children[2].textContent, 'x4');
    // Clicking one puts that one in the hand.
    yeast[1].listeners.click[0]();
    assert.equal(game.plateHeld('culture_yeast').id, b.id);

    // A reload: the same plates in the same order, and the same one in the hand.
    const again = loadGame(storage).game;
    assert.deepEqual(plain(again.platesOf('culture_yeast')), plain([a, b].map((g) => ({ id: g.id, token: g.token, type: g.type, culture: g.culture }))));
    assert.equal(again.plateHeld('culture_yeast').id, b.id);
    assert.equal(again.getInventoryCount('culture_yeast'), 2);
    assert.equal(again.getInventoryCount('agar_plate'), 4);
    assert.ok(!again.plateEntries.agar_plate, 'agar plates have no records');
});

test('a saved inventory that claims more plates than it has, or plates that are not grants, is cut back', () => {
    const storage = memoryStorage();
    const a = grant();
    const b = grant();
    storage.setItem('minecloud-inventory-state', JSON.stringify({
        inventory: ['culture_yeast'], counts: { culture_yeast: 1 },
        plates: { culture_yeast: [a, b, { id: 'nope', token: 'x', type: 'culture_yeast' }, a], culture_mould: [{ ...grant('culture_mould'), type: 'culture_yeast' }] }
    }));
    const { game } = loadGame(storage);
    assert.deepEqual([...game.platesOf('culture_yeast')].map((entry) => entry.id), [a.id]);
    assert.equal(game.platesOf('culture_mould').length, 0);
});

test('old plain plates keep working: all alike, one stack in the inventory and in a chest panel, and they go as plain items', () => {
    const storage = memoryStorage();
    storage.setItem('minecloud-inventory-state', JSON.stringify({ inventory: ['culture_soil'], counts: { culture_soil: 3 } }));
    const { game, sent, elements } = loadGame(storage);
    assert.equal(game.plateLegacyCount('culture_soil'), 3);
    game.renderInventoryPanel();
    const shown = elements.get('inventory-grid').children.filter((child) => child.className.includes('inventory-item'));
    assert.equal(shown.length, 1);
    assert.ok(shown.every((item) => /An old plate/.test(item.title) && item.children[2].textContent === 'x3'));
    game.storageAt = { x: 1, y: 2, z: 3 };
    game.storageMode = 0;
    game.storagePut('culture_soil');
    const put = sent.find((message) => message.type === 'storagePut');
    assert.equal(put.payload.amount, 3);
    assert.equal(put.payload.plate, undefined);
    assert.equal(game.getInventoryCount('culture_soil'), 0);
    // The server answers with the plates it made of them, when they come back out.
    const made = [grant('culture_soil'), grant('culture_soil')];
    game.storagePending.set('take-old', { op: 'take', type: 'culture_soil', amount: 2, at: 0 });
    game.storageOnResult({ reqId: 'take-old', type: 'culture_soil', amount: 2, plates: made });
    assert.equal(game.getInventoryCount('culture_soil'), 2);
    assert.deepEqual([...game.platesOf('culture_soil')].map((entry) => entry.id), made.map((g) => g.id));
});

test('a chest: the plate picked goes in as itself, a refusal or a lost request gives that one back, a take brings it back named', () => {
    const storage = memoryStorage();
    const { game, sent } = loadGame(storage);
    const a = grant();
    const b = grant();
    game.plateAdd(a);
    game.plateAdd(b);
    game.storageAt = { x: 0, y: 0, z: 0 };
    game.storageMode = 0;
    game.storagePut('culture_yeast', game.platesOf('culture_yeast')[1]);
    const put = sent.pop();
    assert.deepEqual([put.type, put.payload.plate, put.payload.token, put.payload.amount], ['storagePut', b.id, b.token, 1]);
    assert.deepEqual([...game.platesOf('culture_yeast')].map((entry) => entry.id), [a.id]);
    assert.equal(game.getInventoryCount('culture_yeast'), 1);
    // Refused: b comes back, the same plate.
    game.storageOnResult({ reqId: put.payload.reqId, type: 'culture_yeast', amount: 0, reason: 'full' });
    assert.deepEqual([...game.platesOf('culture_yeast')].map((entry) => entry.id), [a.id, b.id]);
    // Again, and the page reloads before the answer: the move is saved with its plate.
    game.storagePut('culture_yeast', game.platesOf('culture_yeast')[1]);
    const second = sent.pop();
    const reloaded = loadGame(storage).game;
    assert.equal(reloaded.getInventoryCount('culture_yeast'), 1);
    assert.ok(reloaded.storagePending.get(second.payload.reqId).plate.id === b.id);
    reloaded.storageOnResult({ reqId: second.payload.reqId, amount: 0, reason: 'lost' });
    assert.deepEqual([...reloaded.platesOf('culture_yeast')].map((entry) => entry.id), [a.id, b.id]);
    // Accepted: it is gone; the answer coming twice changes nothing.
    reloaded.storageAt = { x: 0, y: 0, z: 0 };
    reloaded.storagePut('culture_yeast', reloaded.platesOf('culture_yeast')[0]);
    const third = sent.length ? sent.pop() : null;
    const reqId = [...reloaded.storagePending.keys()][0];
    reloaded.storageOnResult({ reqId, amount: 1 });
    reloaded.storageOnResult({ reqId, amount: 1 });
    assert.deepEqual([...reloaded.platesOf('culture_yeast')].map((entry) => entry.id), [b.id]);
    assert.equal(reloaded.getInventoryCount('culture_yeast'), 1);
    void third;
    // Taking a plate out of a chest names it, one at a time whatever the amount picked.
    reloaded.storageSlots = [{ type: 'culture_yeast', count: 1, plate: a.id }];
    reloaded.storageContents = { slots: reloaded.storageSlots, cultures: { [a.id]: a.culture } };
    reloaded.storageMode = 0;
    const net = [];
    reloaded.network.send = (type, payload) => net.push({ type, payload });
    reloaded.storageTake(0);
    assert.deepEqual([net[0].payload.plate, net[0].payload.amount], [a.id, 1]);
    const back = { ...a, token: 'f'.repeat(32) };
    reloaded.storageOnResult({ reqId: net[0].payload.reqId, type: 'culture_yeast', amount: 1, plates: [back] });
    assert.deepEqual([...reloaded.platesOf('culture_yeast')].map((entry) => [entry.id, entry.token]), [[b.id, b.token], [a.id, back.token]]);
});

test('Q drops the plate in the hand, and picking it up gives that plate back', () => {
    const { game } = loadGame();
    const a = grant();
    const b = grant();
    game.plateAdd(a);
    game.plateAdd(b);
    game.plateSelect('culture_yeast', b.id);
    game.selectedSlot = game.inventory.indexOf('culture_yeast');
    game.dropSelectedBlock();
    assert.deepEqual([...game.platesOf('culture_yeast')].map((entry) => entry.id), [a.id]);
    const [pickup] = [...game.pickups.values()];
    assert.equal(pickup.plate.id, b.id);
    game.collectPickup(pickup.id);
    assert.deepEqual([...game.platesOf('culture_yeast')].map((entry) => entry.id), [a.id, b.id]);
    assert.equal(game.getInventoryCount('culture_yeast'), 2);
    // A broken chest's plates are pickups of their own, each the plate the server handed over.
    const spilt = grant('culture_cyano');
    game.storageOnDrop({ x: 0, y: 0, z: 0, items: [{ type: 'culture_cyano', count: 1, grant: spilt }, { type: 'stone', count: 5 }] });
    for (const id of [...game.pickups.keys()]) game.collectPickup(id);
    assert.deepEqual([...game.platesOf('culture_cyano')].map((entry) => entry.id), [spilt.id]);
    assert.equal(game.getInventoryCount('stone'), 5);
});

test('the microscope takes the plate in the hand, gives it back if refused, and back with its new token when taken off', () => {
    const { game, sent } = loadGame();
    const a = grant('culture_mould', 7, 0);
    game.plateAdd(a);
    game.microscopeRequest('microscopePrepare', 'prepare', { x: 0, y: 0, z: 0, source: 'culture_mould' }, 'culture_mould');
    const prepare = sent.pop();
    assert.deepEqual([prepare.payload.plate, prepare.payload.token], [a.id, a.token]);
    assert.equal(game.getInventoryCount('culture_mould'), 0);
    game.microscopeOnOutcome({ reqId: prepare.payload.reqId, amount: 0, reason: 'occupied' });
    assert.deepEqual([...game.platesOf('culture_mould')].map((entry) => entry.id), [a.id]);
    game.microscopeRequest('microscopePrepare', 'prepare', { x: 0, y: 0, z: 0, source: 'culture_mould' }, 'culture_mould');
    game.microscopeOnOutcome({ reqId: sent.pop().payload.reqId, type: 'culture_mould', amount: 1 });
    assert.equal(game.getInventoryCount('culture_mould'), 0);
    game.microscopeRequest('microscopeClear', 'clear', { x: 0, y: 0, z: 0 });
    const back = { ...a, token: 'e'.repeat(32) };
    game.microscopeOnOutcome({ reqId: sent.pop().payload.reqId, type: 'culture_mould', amount: 1, plates: [back] });
    assert.deepEqual([...game.platesOf('culture_mould')].map((entry) => entry.token), [back.token]);
    assert.equal(game.getInventoryCount('culture_mould'), 1);
});

test('sowing a plate uses up the one picked; a harvest brings the new plate, into the hand', () => {
    const { game, sent } = loadGame();
    const a = grant('culture_yeast', 7);
    const b = grant('culture_yeast', 8);
    game.plateAdd(a);
    game.plateAdd(b);
    game.cultureAt = { x: 0, y: 0, z: 0 };
    game.culturePanel = fakeElement();
    game.cultureLookBox = fakeElement();
    game.cultureApply('inoculate', 0, 'culture_yeast', b.id);
    const sow = sent.pop();
    assert.deepEqual([sow.type, sow.payload.plate, sow.payload.token], ['cultureInoculate', b.id, b.token]);
    assert.deepEqual([...game.platesOf('culture_yeast')].map((entry) => entry.id), [a.id]);
    game.cultureOnOutcome({ reqId: sow.payload.reqId, amount: 0, reason: 'inoculated' });
    assert.deepEqual([...game.platesOf('culture_yeast')].map((entry) => entry.id), [a.id, b.id]);
    // A plain one is picked as plain, never as one with a record.
    game.addInventory('culture_yeast', 1);
    game.cultureApply('inoculate', 1, 'culture_yeast', false);
    const plainSow = sent.pop();
    assert.equal(plainSow.payload.plate, undefined);
    assert.equal(game.platesOf('culture_yeast').length, 2);
    assert.equal(game.plateLegacyCount('culture_yeast'), 0);
    // The harvest: a new plate, in the hand.
    const grown = grant('culture_yeast', 6.8);
    game.cultureApply('harvest', 2);
    const harvest = sent.pop();
    game.cultureOnOutcome({ reqId: harvest.payload.reqId, type: 'culture_yeast', amount: 1, plates: [grown] });
    assert.equal(game.plateHeld('culture_yeast').id, grown.id);
    assert.equal(game.getInventoryCount('culture_yeast'), 3);
});

test('the microscope shows a plate as the lens does: the same cells, the same dead, the same brushes', () => {
    const { context } = loadGame();
    for (const [type, logN, mould, phase] of [['culture_yeast', 7.5, 0, 'stationary'], ['culture_lactobacillus', 8.2, 6.4, 'death'], ['culture_mould', 6.6, 0, 'growth']]) {
        const g = grant(type, logN, mould);
        g.culture.main.phase = phase;
        const lens = context.cultureLensView(g.culture, g.culture.seed);
        const stage = context.cultureStagePopulation(g.culture, g.culture.seed);
        const count = (list, species, dead) => list.filter((o) => o.species === species && (dead === undefined || Boolean(o.dead) === dead)).length;
        const species = g.culture.main.species;
        assert.equal(count(stage, species), count(lens.cells, species), `${type}: cells`);
        assert.equal(count(stage, species, true), count(lens.cells, species, true), `${type}: dead cells`);
        assert.equal(stage.filter((o) => o.species === 'mould').length, lens.brushes.length + count(lens.cells, 'mould'), `${type}: mould`);
        assert.ok(stage.length > 0);
        // The same plate, the same field; another plate, another field.
        assert.deepEqual(plain(context.cultureStagePopulation(g.culture, g.culture.seed)), plain(stage));
        assert.notDeepEqual(plain(context.cultureStagePopulation(g.culture, g.culture.seed + 1)).map((o) => o.x), plain(stage).map((o) => o.x));
    }
    // The seed of a plate saved without one is where the server and the panel both put it.
    assert.equal(context.cultureSlotSeed(10, -4, 2), (((10 * 73856093) ^ (-4 * 19349663) ^ (2 * 83492791)) >>> 0));
});

test('random moves of plates through the inventory, chests, Q, reloads and refusals never make or lose one', () => {
    for (let round = 0; round < 25; round++) {
        let seed = round * 7919 + 13;
        const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
        const storage = memoryStorage();
        let { game, sent } = loadGame(storage);
        // A stand-in server: a chest of plates by id, and tokens it checks as the real one does.
        const server = { tokens: new Map(), chest: [], log: new Map() };
        const all = new Set();
        for (let i = 0; i < 5; i++) {
            const g = grant(['culture_yeast', 'culture_soil'][i % 2], 6 + i * 0.5);
            server.tokens.set(g.id, g.token);
            all.add(g.id);
            game.plateAdd(g);
        }
        game.storageAt = { x: 0, y: 0, z: 0 };
        const answer = (message) => {
            const p = message.payload;
            if (server.log.has(p.reqId)) return server.log.get(p.reqId);
            let outcome;
            if (message.type === 'storagePut') {
                const ok = p.plate && server.tokens.get(p.plate) === p.token && server.chest.length < 3;
                if (ok) { server.tokens.set(p.plate, ''); server.chest.push({ id: p.plate, type: p.type }); }
                outcome = { reqId: p.reqId, type: p.type, amount: ok ? 1 : 0, ...(ok ? {} : { reason: 'full' }) };
            } else {
                const index = server.chest.findIndex((slot) => slot.id === p.plate);
                if (index < 0) outcome = { reqId: p.reqId, amount: 0, reason: 'gone' };
                else {
                    const [slot] = server.chest.splice(index, 1);
                    const token = (Math.floor(random() * 1e15).toString(16) + 'a'.repeat(32)).slice(0, 32);
                    server.tokens.set(slot.id, token);
                    const holder = all.has(slot.id) ? slot : null;
                    outcome = { reqId: p.reqId, type: slot.type, amount: 1, plates: [{ id: holder.id, token, type: slot.type, culture: { seed: 1, nutrient: 1 } }] };
                }
            }
            server.log.set(p.reqId, outcome);
            return outcome;
        };
        const inFlight = [];
        for (let step = 0; step < 80; step++) {
            const roll = random();
            const held = Object.values(game.plateEntries).flat();
            if (roll < 0.3 && held.length) {
                game.storagePut(held[Math.floor(random() * held.length)].type, held[Math.floor(random() * held.length)]);
                if (sent.length) inFlight.push(sent.pop());
            } else if (roll < 0.5 && server.chest.length) {
                const slot = server.chest[Math.floor(random() * server.chest.length)];
                game.storageSlots = server.chest.map((s) => ({ type: s.type, count: 1, plate: s.id }));
                game.storageTab = '';
                game.storageTake(game.storageSlots.findIndex((s) => s.plate === slot.id));
                if (sent.length) inFlight.push(sent.pop());
            } else if (roll < 0.7 && inFlight.length) {
                // An answer arrives (some twice), or is lost and the sync kills the move.
                const message = inFlight.splice(Math.floor(random() * inFlight.length), 1)[0];
                if (random() < 0.15 && !server.log.has(message.payload.reqId)) {
                    server.log.set(message.payload.reqId, { reqId: message.payload.reqId, amount: 0, reason: 'lost' });
                }
                const outcome = answer(message);
                game.storageOnResult(outcome);
                if (random() < 0.3) game.storageOnResult(outcome);
            } else if (roll < 0.8 && held.length) {
                const entry = held[Math.floor(random() * held.length)];
                game.plateSelect(entry.type, entry.id);
                game.selectedSlot = game.inventory.indexOf(entry.type);
                game.dropSelectedBlock();
                for (const id of [...game.pickups.keys()]) if (random() < 0.8) game.collectPickup(id);
            } else if (roll < 0.9) {
                // The page reloads: what was on the ground is gone with it, as any pickup.
                for (const pickup of game.pickups.values()) if (pickup.plate) all.delete(pickup.plate.id);
                ({ game, sent } = loadGame(storage));
                game.storageAt = { x: 0, y: 0, z: 0 };
            }
            // Every plate is in one place: the inventory, a move on its way, the chest, or the ground.
            const places = new Map();
            const count = (id) => places.set(id, (places.get(id) || 0) + 1);
            for (const entry of Object.values(game.plateEntries).flat()) count(entry.id);
            for (const pending of game.storagePending.values()) if (pending.plate) count(pending.plate.id);
            for (const slot of server.chest) count(slot.id);
            for (const pickup of game.pickups.values()) if (pickup.plate) count(pickup.plate.id);
            for (const message of inFlight) if (message.type === 'storageTake' && server.chest.every((slot) => slot.id !== message.payload.plate) && !server.log.has(message.payload.reqId)) void 0;
            for (const [id, n] of places) assert.equal(n, 1, `round ${round} step ${step}: ${id} is in ${n} places`);
            const counted = Object.entries(game.plateEntries).reduce((sum, [type, list]) => sum + list.length, 0);
            assert.equal(counted, game.getInventoryCount('culture_yeast') + game.getInventoryCount('culture_soil'), 'the count and the plates agree');
            for (const entry of Object.values(game.plateEntries).flat()) assert.equal(server.tokens.get(entry.id), entry.token, 'what the client holds, the server agrees it holds');
        }
    }
});

// The hotbar of js/game/inventory.js, drawn into the stand-in page.
function hotbarOf(game, elements) {
    game.initHotbar();
    return elements.get('hotbar').children.filter((child) => child.className.includes('hotbar-slot')).map((slot) => ({
        icon: slot.style.backgroundImage, count: slot.children[1].textContent, selected: slot.classList.contains('selected'), empty: slot.classList.contains('empty'), title: slot.title
    }));
}

// The items of the inventory panel, as drawn.
function panelItems(game, elements) {
    game.renderInventoryPanel();
    return elements.get('inventory-grid').children.filter((child) => child.className.includes('inventory-item'));
}

test('picking a plate in the inventory puts that one plate in the first slot only, never every plate of its type', () => {
    const { game, elements } = loadGame();
    const plates = Array.from({ length: 24 }, (_v, i) => grant('culture_mould', 3 + i * 0.2));
    for (const g of plates) game.plateAdd(g);
    game.addInventory('stone', 5);
    game.addInventory('agar_plate', 3);
    // Plates nobody put on the hotbar stay in the inventory.
    let bar = hotbarOf(game, elements);
    assert.deepEqual(bar.filter((slot) => !slot.empty).map((slot) => slot.icon), ['url(icon:stone)', 'url(icon:agar_plate)']);
    // The tenth plate picked: slot 1 is that plate, the rest move one along, no other plate comes.
    panelItems(game, elements).filter((item) => item.title.startsWith('Mould Plate'))[9].listeners.click[0]();
    bar = hotbarOf(game, elements);
    assert.deepEqual(bar.filter((slot) => !slot.empty).map((slot) => slot.icon), [`url(${game.plateIconUrl(plates[9])})`, 'url(icon:stone)', 'url(icon:agar_plate)']);
    assert.deepEqual(bar.map((slot) => slot.selected), bar.map((_slot, n) => n === 0));
    assert.equal(game.plateHeld('culture_mould').id, plates[9].id);
    // Another one: it goes first, and the one before moves to slot 2.
    panelItems(game, elements).filter((item) => item.title.startsWith('Mould Plate'))[3].listeners.click[0]();
    bar = hotbarOf(game, elements);
    assert.deepEqual(bar.filter((slot) => !slot.empty).map((slot) => slot.icon), [plates[3], plates[9]].map((g) => `url(${game.plateIconUrl(g)})`).concat(['url(icon:stone)', 'url(icon:agar_plate)']));
    // Any other item, as always: picked, it goes to slot 1.
    panelItems(game, elements).find((item) => item.title.split('\n')[0] === game.getBlockDisplayName('agar_plate')).listeners.click[0]();
    bar = hotbarOf(game, elements);
    assert.equal(bar[0].icon, 'url(icon:agar_plate)');
    assert.ok(bar[0].selected);
    assert.equal(bar.filter((slot) => !slot.empty).length, 4);
});

test('the hotbar shows each plate put on it as its own slot, and every single-unit slot is picked by its key and the wheel, across a reload', () => {
    const storage = memoryStorage();
    let { game, elements } = loadGame(storage);
    const plates = [grant('culture_yeast', 7.2), grant('culture_yeast', 6.4), grant('culture_yeast', 5.1), grant('culture_yeast', 8.3)];
    for (const g of plates) game.plateAdd(g);
    game.addInventory('stone', 5);
    game.addInventory('agar_plate', 3);
    // Picked in the panel from the last to the first, so they end up in order in slots 1 to 4.
    for (const g of [...plates].reverse()) panelItems(game, elements).find((item) => item.title.startsWith('Yeast Plate') && item.children[0].style.backgroundImage === `url(${game.plateIconUrl(g)})`).listeners.click[0]();
    let bar = hotbarOf(game, elements);
    assert.equal(bar.length, 9);
    // Four yeast plates, four slots; the stone and the agar plates one stack each, as before.
    const ids = plates.map((g) => g.id);
    assert.deepEqual(bar.slice(0, 4).map((slot) => slot.icon), plates.map((g) => `url(${game.plateIconUrl(g)})`));
    assert.equal(new Set(bar.slice(0, 4).map((slot) => slot.icon)).size, 4, 'each draws its own colonies');
    assert.ok(bar.slice(0, 4).every((slot) => slot.count === '1' && slot.icon.startsWith('url(data:plate')));
    assert.match(bar[1].title, /Yeast: 10\^6\.4 cells/);
    assert.deepEqual(bar.slice(4, 6).map((slot) => [slot.icon, slot.count]), [['url(icon:stone)', '5'], ['url(icon:agar_plate)', '3']]);
    assert.ok(bar.slice(6).every((slot) => slot.empty));

    // A number key (selectHotbarSlot, as game.js calls it) holds that plate, and nothing moves.
    for (let i = 0; i < 4; i++) {
        assert.equal(game.selectHotbarSlot(i), true);
        assert.equal(game.plateHeld('culture_yeast').id, ids[i]);
        assert.equal(game.getSelectedHeldItemType(), 'culture_yeast');
        bar = hotbarOf(game, elements);
        assert.deepEqual(bar.map((slot) => slot.selected), bar.map((_slot, n) => n === i), `only slot ${i + 1} is selected`);
        assert.deepEqual(bar.slice(0, 4).map((slot) => slot.icon), plates.map((g) => `url(${game.plateIconUrl(g)})`), 'the slots keep their order');
    }
    // The inventory panel marks the same one.
    game.renderInventoryPanel();
    const shown = elements.get('inventory-grid').children.filter((child) => child.className.includes('inventory-item'));
    assert.deepEqual(shown.filter((item) => item.title.startsWith('Yeast Plate')).map((item) => item.className.includes('selected')), [false, false, false, true]);

    // The third plate in the hand, and a reload: the same plate in the same slot.
    game.selectHotbarSlot(2);
    ({ game, elements } = loadGame(storage));
    assert.equal(game.plateHeld('culture_yeast').id, ids[2]);
    bar = hotbarOf(game, elements);
    assert.deepEqual(bar.map((slot) => slot.selected), bar.map((_slot, n) => n === 2));
    assert.deepEqual([...game.platesOf('culture_yeast')].map((entry) => entry.id), ids);

    // The wheel goes plate by plate, then on to the stone, and back.
    game.stepHotbarSelection(1);
    assert.equal(game.plateHeld('culture_yeast').id, ids[3]);
    game.stepHotbarSelection(1);
    assert.equal(game.getSelectedHeldItemType(), 'stone');
    game.stepHotbarSelection(-1);
    assert.deepEqual([game.getSelectedHeldItemType(), game.plateHeld('culture_yeast').id], ['culture_yeast', ids[3]]);
    game.stepHotbarSelection(-1);
    assert.equal(game.plateHeld('culture_yeast').id, ids[2]);

    // A plate that arrives while one is held stays in the inventory; the hand keeps its plate.
    const extra = grant('culture_yeast', 4.4);
    game.plateAdd(extra);
    assert.equal(game.plateHeld('culture_yeast').id, ids[2]);
    bar = hotbarOf(game, elements);
    assert.equal(bar[4].icon, 'url(icon:stone)');
    assert.equal(bar.filter((slot) => !slot.empty).length, 6, 'four plates, the stone, the agar plates');
    assert.deepEqual(bar.map((slot) => slot.selected), bar.map((_slot, n) => n === 2));
    // The left hand takes no plate: X refuses it, and the hand keeps it.
    game.offhandSwapSelected();
    assert.equal(game.offhandType || null, null);
    assert.equal(game.plateHeld('culture_yeast').id, ids[2]);
});

test('using a plate from the hotbar takes that one only: its slot goes, the others stay, the hand takes the next', () => {
    const { game, elements, sent } = loadGame();
    const plates = [grant('culture_mould', 7), grant('culture_mould', 6), grant('culture_mould', 5), grant('culture_mould', 4)];
    for (const g of plates) game.plateAdd(g);
    // On the hotbar in order, slots 1 to 4 (each goes first, so the last goes on first).
    for (const g of [...plates].reverse()) game.promoteTypeToHotbar('culture_mould', g.id);
    hotbarOf(game, elements);
    const icon = (g) => `url(${game.plateIconUrl(g)})`;
    // The microscope takes the plate in the hand: the one of the slot picked.
    game.selectHotbarSlot(1);
    game.microscopeRequest('microscopePrepare', 'prepare', { x: 0, y: 0, z: 0, source: 'culture_mould' }, 'culture_mould');
    assert.equal(sent.pop().payload.plate, plates[1].id);
    let bar = hotbarOf(game, elements);
    assert.deepEqual(bar.slice(0, 3).map((slot) => slot.icon), [plates[0], plates[2], plates[3]].map(icon));
    assert.ok(bar[3].empty);
    assert.equal(game.plateHeld('culture_mould').id, plates[2].id, 'the one now in that slot');
    assert.deepEqual(bar.map((slot) => slot.selected), bar.map((_slot, n) => n === 1));
    // Q drops the plate of the selected slot.
    game.selectHotbarSlot(2);
    game.dropSelectedBlock();
    assert.equal([...game.pickups.values()][0].plate.id, plates[3].id);
    assert.deepEqual([...game.platesOf('culture_mould')].map((entry) => entry.id), [plates[0].id, plates[2].id]);
    assert.equal(game.plateHeld('culture_mould').id, plates[2].id, 'the last one gone: the hand takes the one before');
    // The incubator sows the one in the hand when none is named.
    game.cultureAt = { x: 0, y: 0, z: 0 };
    game.culturePanel = fakeElement();
    game.cultureLookBox = fakeElement();
    game.selectHotbarSlot(0);
    game.cultureApply('inoculate', 0, 'culture_mould');
    assert.equal(sent.pop().payload.plate, plates[0].id);
    assert.deepEqual([...game.platesOf('culture_mould')].map((entry) => entry.id), [plates[2].id]);
    bar = hotbarOf(game, elements);
    assert.equal(bar[0].icon, icon(plates[2]));
    assert.ok(bar[0].selected);
});

test('a short hotbar keeps the plates picked last; plain plates are one stack; keys, the wheel and a tap pick every slot', () => {
    const { game, elements } = loadGame();
    game.hotbarSize = 4;
    const plates = Array.from({ length: 6 }, (_v, i) => grant('culture_soil', 4 + i * 0.5));
    for (const g of plates) game.plateAdd(g);
    game.addInventory('stone', 2);
    // An old plain plate: one stack of plain ones, on the hotbar like any item.
    game.inventoryCounts.culture_soil += 1;
    const icon = (g) => `url(${game.plateIconUrl(g)})`;
    let bar = hotbarOf(game, elements);
    assert.deepEqual(bar.map((slot) => [slot.icon, slot.count]), [['url(icon:culture_soil)', '1'], ['url(icon:stone)', '2'], ['', ''], ['', '']]);
    const soil = () => panelItems(game, elements).filter((item) => item.title.startsWith('Soil'));
    assert.equal(soil().length, 7);
    for (let i = 5; i >= 0; i--) soil()[i].listeners.click[0]();
    bar = hotbarOf(game, elements);
    assert.deepEqual(bar.map((slot) => slot.icon), plates.slice(0, 4).map(icon));
    // The sixth picked again: slot 1, the others one along, the last one off the bar.
    soil()[5].listeners.click[0]();
    assert.equal(game.plateHeld('culture_soil').id, plates[5].id);
    bar = hotbarOf(game, elements);
    assert.deepEqual(bar.map((slot) => slot.icon), [plates[5], plates[0], plates[1], plates[2]].map(icon));
    assert.deepEqual(bar.map((slot) => slot.selected), [true, false, false, false]);
    // Every slot by its number key, each a single plate: that one in the hand and that slot lit.
    for (const [n, g] of [[3, plates[2]], [1, plates[0]], [2, plates[1]], [0, plates[5]]]) {
        assert.equal(game.selectHotbarSlot(n), true);
        assert.equal(game.plateHeld('culture_soil').id, g.id);
        bar = hotbarOf(game, elements);
        assert.deepEqual(bar.map((slot) => slot.selected), bar.map((_slot, i) => i === n), `key ${n + 1}`);
    }
    // The wheel walks them all, round the end, both ways.
    const walked = [];
    for (let i = 0; i < 4; i++) {
        game.stepHotbarSelection(1);
        walked.push(game.plateHeld('culture_soil').id);
    }
    assert.deepEqual(walked, [plates[0], plates[1], plates[2], plates[5]].map((g) => g.id));
    game.stepHotbarSelection(-1);
    assert.equal(game.plateHeld('culture_soil').id, plates[2].id);
    // The plain stack, picked in the panel: slot 1, the hand holds a plain plate, and Q drops it as plain.
    soil()[6].listeners.click[0]();
    assert.equal(game.plateHandKey('culture_soil'), null);
    bar = hotbarOf(game, elements);
    assert.deepEqual([bar[0].icon, bar[0].selected], ['url(icon:culture_soil)', true]);
    game.dropSelectedBlock();
    assert.equal([...game.pickups.values()][0].plate, undefined);
    assert.equal(game.platesOf('culture_soil').length, 6);
    assert.equal(game.plateLegacyCount('culture_soil'), 0);
    // Its slot goes to the plate the hand now holds, already on the bar: the stone fills the end.
    bar = hotbarOf(game, elements);
    assert.deepEqual(bar.map((slot) => slot.icon), [icon(plates[5]), icon(plates[0]), icon(plates[1]), 'url(icon:stone)']);
    assert.deepEqual(bar.map((slot) => slot.selected), [true, false, false, false]);
    // A phone: tapping a slot holds that plate.
    game.touchControlsEnabled = true;
    hotbarOf(game, elements);
    elements.get('hotbar').children[2].listeners.pointerdown[0]({ preventDefault() {} });
    assert.equal(game.plateHeld('culture_soil').id, plates[1].id);
    elements.get('hotbar').children[3].listeners.pointerdown[0]({ preventDefault() {} });
    assert.equal(game.getSelectedHeldItemType(), 'stone');
});

test('the label over the hotbar names what the hand holds, a plate with its summary, in Spanish and English', () => {
    const { game, elements, context } = loadGame();
    const mould = grant('culture_mould', 8.2);
    const yeast = grant('culture_yeast', 6.4, 5.1);
    game.plateAdd(mould);
    game.plateAdd(yeast);
    game.addInventory('stone', 5);
    game.addInventory('agar_plate', 2);
    game.promoteTypeToHotbar('culture_yeast', yeast.id);
    game.promoteTypeToHotbar('culture_mould', mould.id);
    hotbarOf(game, elements);
    const label = () => [game.hotbarLabelElement.textContent, game.hotbarLabelElement.classList.contains('empty')];
    // Every selection change: keys, the wheel.
    game.selectHotbarSlot(0);
    assert.deepEqual(label(), ['Mould Plate · 10⁸', false]);
    game.stepHotbarSelection(1);
    assert.deepEqual(label(), ['Yeast Plate · 10⁶ · mould 10⁵', false]);
    game.selectHotbarSlot(3);
    assert.deepEqual(label(), [game.getBlockDisplayName('agar_plate'), false]);
    game.selectHotbarSlot(2);
    assert.deepEqual(label(), ['Stone', false]);
    // The game in Spanish: the names that have it, at once.
    context.setGameLang('ES');
    assert.deepEqual(label(), ['Stone', false], 'a name with no Spanish stays as it is');
    game.selectHotbarSlot(3);
    assert.deepEqual(label(), ['Placa de agar estéril', false]);
    game.selectHotbarSlot(1);
    assert.deepEqual(label(), ['Placa de levadura · 10⁶ · moho 10⁵', false]);
    game.selectHotbarSlot(0);
    assert.deepEqual(label(), ['Placa de moho · 10⁸', false]);
    // A plain plate is only its name; nothing in the hand, no label.
    assert.equal(context.hotbarPlateSummary('Placa de moho', null, 'ES'), 'Placa de moho');
    game.dropSelectedBlock();
    game.selectHotbarSlot(game.getHotbarItems().findIndex((item) => item.type === 'stone'));
    game.inventoryCounts.stone = 0;
    game.updateHotbarCounts();
    assert.deepEqual(label(), ['', true]);
    context.setGameLang('EN');
});

test('taking from the autoclave\'s result slot closes the panel and puts it in the hand, in the first hotbar slot; other slots and chests do not', () => {
    const { game, elements, sent } = loadGame();
    let relocks = 0;
    game.recapturePointerLock = () => { relocks++; };
    game.addInventory('stone', 5);
    game.addInventory('agar_plate', 1);
    game.addInventory('milk', 1);
    game.promoteTypeToHotbar('milk');
    game.selectSlot(game.inventory.indexOf('stone'));
    hotbarOf(game, elements);
    const open = (kind) => {
        game.storageAt = { x: 0, y: 0, z: 0 };
        game.storageKind = kind;
        game.storageTab = '';
        game.storageNote = '';
        game.storageSlots = [{ type: 'used_dish', count: 1 }, null, { type: 'petri_dish', count: 2 }];
    };
    const take = (slot, answer) => {
        game.storageMode = 0;
        game.storageTake(slot);
        const message = sent.pop();
        assert.equal(message.type, 'storageTake');
        game.storageOnResult({ reqId: message.payload.reqId, type: message.payload.type, ...answer });
    };
    // Its first slot: into the inventory only, the panel stays, the hand as it was.
    open('autoclave');
    take(0, { amount: 1 });
    assert.equal(game.getInventoryCount('used_dish'), 1);
    assert.ok(game.storageAt, 'the panel stays');
    assert.equal(game.getSelectedHeldItemType(), 'stone');
    // Refused: nothing comes, the panel stays and says why, the pointer stays free.
    take(2, { amount: 0, reason: 'gone' });
    assert.ok(game.storageAt);
    assert.match(game.storageNote, /no longer there/);
    assert.equal(game.getSelectedHeldItemType(), 'stone');
    assert.equal(relocks, 0);
    // Its result: on the answer the panel closes, the pointer is taken again, and the dishes are in slot 1.
    take(2, { amount: 2 });
    assert.equal(game.storageAt, null);
    assert.equal(sent.pop().type, 'storageClose');
    assert.equal(relocks, 1);
    assert.equal(game.getInventoryCount('petri_dish'), 2);
    assert.equal(game.getSelectedHeldItemType(), 'petri_dish');
    const bar = hotbarOf(game, elements);
    assert.deepEqual([bar[0].icon, bar[0].count, bar[0].selected], ['url(icon:petri_dish)', '2', true]);
    assert.deepEqual(bar.slice(1, 3).map((slot) => slot.icon), ['url(icon:milk)', 'url(icon:stone)'], 'the others one along');
    // A chest's third slot is only a chest's slot.
    game.selectSlot(game.inventory.indexOf('stone'));
    open('chest');
    take(2, { amount: 2 });
    assert.ok(game.storageAt);
    assert.equal(game.getInventoryCount('petri_dish'), 4);
    assert.equal(game.getSelectedHeldItemType(), 'stone');
});

test('a culture plate harvested from the incubator is in the hand as itself, in the first hotbar slot', () => {
    const { game, elements } = loadGame();
    game.addInventory('stone', 5);
    const old = grant('culture_yeast', 5);
    game.plateAdd(old);
    game.promoteTypeToHotbar('culture_yeast', old.id);
    game.promoteTypeToHotbar('stone');
    game.cultureAt = { x: 0, y: 0, z: 0 };
    game.culturePanel = fakeElement();
    game.cultureLookBox = fakeElement();
    const fresh = grant('culture_yeast', 8.4);
    game.culturePending.set('harvest-1', { took: {}, gives: { result: 1 }, op: 'harvest', at: 0, hold: true });
    game.cultureOnOutcome({ reqId: 'harvest-1', type: 'culture_yeast', amount: 1, plates: [fresh] });
    assert.equal(game.cultureAt, null, 'the panel closes');
    assert.equal(game.plateHeld('culture_yeast').id, fresh.id);
    const bar = hotbarOf(game, elements);
    assert.deepEqual(bar.slice(0, 3).map((slot) => [slot.icon, slot.selected]), [[`url(${game.plateIconUrl(fresh)})`, true], ['url(icon:stone)', false], [`url(${game.plateIconUrl(old)})`, false]]);
    assert.equal(game.hotbarLabelText(), 'Yeast Plate · 10⁸');
});

test('a hotbar saved before each plate was its own entry: a plate type becomes the plate that was in the hand', () => {
    const storage = memoryStorage();
    const a = grant('culture_yeast', 6);
    const b = grant('culture_yeast', 7);
    storage.setItem('minecloud-inventory-state', JSON.stringify({
        inventory: ['stone', 'culture_yeast', 'agar_plate'], counts: { stone: 4, culture_yeast: 2, agar_plate: 1 },
        plates: { culture_yeast: [a, b] }, plateHand: { culture_yeast: b.id }, selectedSlot: 1,
        hotbarPrimaryType: 'culture_yeast', hotbarPinnedTypes: ['culture_yeast', 'stone']
    }));
    let { game, elements } = loadGame(storage);
    let bar = hotbarOf(game, elements);
    assert.deepEqual(bar.filter((slot) => !slot.empty).map((slot) => slot.icon), [`url(${game.plateIconUrl(b)})`, 'url(icon:stone)', 'url(icon:agar_plate)']);
    assert.ok(bar[0].selected);
    // Saved again in the new format, it is not taken for an old one at the next load.
    game.selectHotbarSlot(1);
    ({ game, elements } = loadGame(storage));
    assert.deepEqual(plain(game.hotbarPinnedTypes), [`culture_yeast@${b.id}`, 'stone']);
    assert.equal(game.getSelectedHeldItemType(), 'stone');
    assert.equal(JSON.parse(storage.getItem('minecloud-inventory-state')).hotbarVersion, 2);
});

test('game.js sends the number keys and the wheel through the hotbar slots, not through the types', () => {
    const source = fs.readFileSync(path.join(JS, 'game.js'), 'utf8');
    const keys = source.slice(source.indexOf('    onKeyDown(event) {'), source.indexOf('    onWheel(event) {'));
    const wheel = source.slice(source.indexOf('    onWheel(event) {'), source.indexOf('    onWindowResize() {'));
    assert.match(keys, /this\.selectHotbarSlot\(slot\)/);
    assert.match(wheel, /this\.stepHotbarSelection\(direction\)/);
    assert.doesNotMatch(source, /getHotbarSlotInventoryIndex|getHotbarInventoryIndexes/);
});
