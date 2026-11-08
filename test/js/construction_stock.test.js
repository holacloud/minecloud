// Node tests for what a construction puts in its storage (b.stock, sent as constructionStock: constructions.js and
// pkg/network/construction_stock.go), with the lab's stock (LAB_STOCK, construction_lab.js): every item is real (the
// whole catalogue: every script of index.html runs in one VM context, as in item_tags.test.js) and one the server
// takes, within the server's limits, in a compartment that takes it, and none that would change or light in there.
// Where each entry lands in the 4 turns, and that it goes out after the build: construction_lab.test.js.
// Run with: node --test test/js/construction_stock.test.js

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
        append(...children) { this.children.push(...children); },
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
    for (const src of scripts) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    vm.runInContext(`Object.assign(this, { Game, WorldRenderer, itemTagCatalogue, CONSTRUCTION_DESIGNS, constructionPlan, LAB_STOCK, STORAGE_KINDS, STORAGE_FREEZERS,
        APPLIANCE_MACHINES, APPLIANCE_CHILL, APPLIANCE_FREEZE, CONSTRUCTION_STOCK_FILLS, CONSTRUCTION_STOCK_MAX, CONSTRUCTION_STOCK_TOTAL });`, context);
    return context;
}

const ctx = load();
ctx.Game.prototype.init = function () {};
const world = new ctx.WorldRenderer({ add() {}, remove() {} });
const blockTypes = world.blockTypes;
const catalogue = new Set(ctx.itemTagCatalogue(blockTypes));
const plain = (value) => JSON.parse(JSON.stringify(value));

// What the server takes (construction_stock.go): its list of names and its limits.
const GO = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'construction_stock.go'), 'utf8');
const GO_ITEMS = new Set([...GO.slice(GO.indexOf('range []string{'), GO.indexOf('} {', GO.indexOf('range []string{'))).matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));
const goConst = (name) => Number(GO.match(new RegExp(`${name}\\s*=\\s*(\\d+)`))[1]);

const PLAN = ctx.constructionPlan('lab');
const GRID = new Map(PLAN.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
const kindAt = ({ x, y, z }) => {
    const type = GRID.get(`${x},${y},${z}`);
    return type && (blockTypes[type].variantOf || type);
};
const STOCK = plain(ctx.LAB_STOCK).map(([x, y, z, room, items, freezer = []]) => ({ x, y, z, room, items, freezer }));

test('the server and the client agree on the limits, and the server knows every name it lists as an item', () => {
    assert.equal(goConst('stockMaxStack'), ctx.CONSTRUCTION_STOCK_MAX);
    assert.equal(goConst('stockMaxItems'), ctx.CONSTRUCTION_STOCK_TOTAL);
    assert.ok(goConst('stockMaxFills') >= ctx.CONSTRUCTION_STOCK_FILLS);
    assert.ok(GO_ITEMS.size > 50, `${GO_ITEMS.size}`);
    assert.ok(catalogue.size > 500, `the catalogue is really there: ${catalogue.size}`);
    const unknown = [...GO_ITEMS].filter((id) => !catalogue.has(id));
    assert.deepEqual(unknown, [], 'names in stockItems that are not items of the game');
});

test('the lab: every item exists and the server takes it, in stacks and totals within the limits', () => {
    assert.equal(STOCK.length, PLAN.stocks.length);
    for (const stock of STOCK) {
        const where = `${stock.room} at ${stock.x},${stock.y},${stock.z}`;
        const all = [...stock.items, ...stock.freezer];
        assert.ok(all.length > 0, where);
        for (const [type, count] of all) {
            assert.ok(catalogue.has(type) && blockTypes[type] && !blockTypes[type].variantOf, `${where}: ${type} is not an item`);
            assert.ok(GO_ITEMS.has(type), `${where}: ${type} is not in stockItems (construction_stock.go)`);
            assert.ok(Number.isInteger(count) && count >= 1 && count <= ctx.CONSTRUCTION_STOCK_MAX, `${where}: ${count} ${type}`);
        }
        const total = all.reduce((sum, [, count]) => sum + count, 0);
        assert.ok(total <= ctx.CONSTRUCTION_STOCK_TOTAL, `${where}: ${total} items`);
    }
});

test('the lab: each in a compartment that takes it, and nothing that would change or light by itself in there', () => {
    const machines = plain(ctx.APPLIANCE_MACHINES);
    for (const stock of STOCK) {
        const kind = kindAt(stock);
        const where = `${stock.room} at ${stock.x},${stock.y},${stock.z} (${kind})`;
        assert.ok(ctx.STORAGE_KINDS[kind], `${where}: not storage`);
        assert.ok(!['microscope', 'incubator', 'autoclave'].includes(kind), `${where}: a slide or a plate moves only with what is on it`);
        assert.ok(stock.items.length <= ctx.STORAGE_KINDS[kind], where);
        assert.ok(stock.freezer.length <= (ctx.STORAGE_FREEZERS[kind] || 0), `${where}: no such compartment`);
        const machine = machines[kind];
        if (machine) {
            // Only what burns, or the arc's coal: with nothing to work on, nothing lights.
            assert.equal(stock.items.length, 1, where);
            const [type] = stock.items[0];
            assert.ok((machine.fuels && machine.fuels[type]) || machine.reducer === type, `${where}: ${type}`);
        }
        // Cold furniture: only what stays as it is, so that /build undo knows what is still in there.
        if (kind === 'fridge') {
            for (const [type] of stock.items) assert.ok(!ctx.APPLIANCE_CHILL[type], `${where}: ${type} would chill`);
        }
        const frozen = kind === 'chest_freezer' ? stock.items : stock.freezer;
        for (const [type] of frozen) assert.ok(!ctx.APPLIANCE_FREEZE[type], `${where}: ${type} would freeze`);
    }
});

test('the lab: every room asked for has its things, and it is a well-stocked lab, not an endless one', () => {
    const byRoom = {};
    for (const stock of STOCK) {
        byRoom[stock.room] = byRoom[stock.room] || new Set();
        for (const [type] of [...stock.items, ...stock.freezer]) byRoom[stock.room].add(type);
    }
    const want = {
        microscopy: ['test_tube', 'glass_slide', 'micropipette', 'iodine_tincture', 'methylene_blue', 'darkfield_stop', 'agar_plate', 'petri_dish', 'sample_moss_a'],
        samples: ['test_tube', 'glass_slide', 'micropipette', 'iodine_tincture', 'methylene_blue', 'darkfield_stop'],
        chemistry: ['element_h', 'element_o', 'element_na', 'element_cl', 'element_si', 'element_fe', 'element_c', 'glass', 'water_flask', 'cold_water', 'ice', 'frozen_fish'],
        workshop: ['copper_wire', 'multimeter', 'light_bulb', 'electric_lamp', 'battery', 'lever', 'and_gate'],
        experiments: ['multimeter', 'and_gate', 'not_gate', 'latch'],
        canteen: ['bread', 'cooked_fish', 'coal_ore'],
        library: ['blueprint'],
        office: ['star_chart', 'breeding_notebook'],
        greenhouse: ['wheat_seeds', 'fertilizer'],
        observatory: ['telescope', 'star_chart']
    };
    for (const [room, items] of Object.entries(want)) {
        for (const type of items) assert.ok(byRoom[room] && byRoom[room].has(type), `${room}: ${type}`);
    }
    const total = STOCK.reduce((sum, stock) => sum + [...stock.items, ...stock.freezer].reduce((n, [, count]) => n + count, 0), 0);
    assert.ok(total > 500 && total < 2500, `${total} items in all`);
    // Not a chest of every chest: a few are left for the players.
    const storage = PLAN.cells.filter((cell) => ctx.STORAGE_KINDS[blockTypes[cell.type].variantOf || cell.type] && blockTypes[cell.type].state?.half !== 'upper');
    assert.ok(STOCK.length < storage.length, `${STOCK.length} of ${storage.length}`);
});
