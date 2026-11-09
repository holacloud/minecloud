// Node tests for the specimens of the microscope: the things with nothing alive in them that go on a slide
// (js/game/specimens.js, js/game/specimens_text.js, pkg/network/microscope_specimens.go). Every script of
// index.html runs in one VM context, with the real catalogue of items, so that each specimen is checked to
// be a real item. Drawings run on a context that records what is asked of it. Nothing here runs a browser.
// Run with: node --test test/js/microscope_specimens.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const HTML = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
const GO = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'microscope_specimens.go'), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

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
    vm.runInContext(`Object.assign(this, { WorldRenderer, setGameLang, gameLang, MICRO_SPECIMENS, MICRO_SPECIMEN_KINDS, MICRO_SPECIMEN_KIND_TEXT, MICRO_SPECIMEN_LOOK_TEXT,
        MICRO_SPECIMEN_TEXT_KEYS, MICRO_SPECIMEN_CACHE, MICRO_MAGNIFICATIONS, MICRO_SCALE, MICRO_ITEMS, microSpecimenOf, microSpecimenStain,
        microSpecimenScenery, microPaintSpecimen, microDrawSpecimen, microSpecimenText, microSpecimenLine, microSpeciesOf, microScenery, microscopeSlideLine,
        microscopeRequestItems, microscopeSourceHeld, microscopeDrawField });`, context);
    vm.runInContext('this.setMaker = (fn) => { microSpecimenCanvasMaker = fn; };', context);
    return context;
}

const ctx = load();
const world = new ctx.WorldRenderer({ add() {}, remove() {} });
const blockTypes = world.blockTypes;
const ids = Object.keys(ctx.MICRO_SPECIMENS);

// A 2D context that counts what is drawn. Through a MicroLens, anything the lens does not pass on would throw.
function recorder() {
    const calls = [];
    const target = {
        calls, globalAlpha: 1, lineWidth: 1, fillStyle: '', strokeStyle: '', lineCap: 'butt', lineJoin: 'miter', globalCompositeOperation: 'source-over',
        createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} })
    };
    return new Proxy(target, {
        get: (known, key) => (key in known ? known[key] : () => { calls.push(key); }),
        set: (known, key, value) => { known[key] = value; return true; }
    });
}
const drawn = (rec) => rec.calls.filter((name) => ['fill', 'stroke', 'fillRect', 'strokeRect'].includes(name)).length;

// ---- What goes on a slide ----

test('every specimen is a real item, and no shaped copy or tool sneaks in', () => {
    assert.deepEqual(ids.filter((id) => !blockTypes[id]), [], 'these are not items of the catalogue');
    assert.ok(ids.length >= 170, `${ids.length} specimens`);
    for (const id of ids) {
        assert.ok(!/_(stairs|slab|door|fence|fence_gate|trapdoor|egg|pickaxe|sword|axe|shovel|hoe|sofa|chair)$/.test(id), `${id} is a shape or a tool`);
        assert.equal(ctx.MICRO_ITEMS[id], undefined, `${id} is also a source of organisms`);
    }
});

test('the server accepts exactly the specimens the client draws', () => {
    const list = (name) => [...GO.match(new RegExp(`var ${name} = \\[\\]string\\{([\\s\\S]*?)\\n\\}`))[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    const colors = list('specimenColors');
    const suffixes = [...GO.match(/range \[\]string\{([^}]*)\}/)[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    const server = new Set(list('specimenItems'));
    for (const color of colors) for (const suffix of suffixes) server.add(color + suffix);
    assert.deepEqual([...server].sort(), [...ids].sort());
    assert.deepEqual(colors.filter((color) => !blockTypes[`${color}_carpet`]), []);
});

test('a specimen holds nobody, is drawn as its own layers, and goes on a slide as other items do', () => {
    for (const id of ids) {
        assert.deepEqual(plain(ctx.microSpeciesOf(id)), [], id);
        assert.equal(ctx.microscopeSourceHeld(id), id, `${id} is held to the microscope`);
        const scenery = plain(ctx.microScenery(id, 99));
        const kind = ctx.MICRO_SPECIMEN_KINDS[ctx.MICRO_SPECIMENS[id].kind];
        assert.equal(scenery.length, kind.layers.length, id);
        assert.ok(scenery.every((item) => item.kind === 'specimen' && item.specimen === id && item.seed === 99), id);
    }
    assert.deepEqual(plain(ctx.microscopeRequestItems('prepare', 'granite')), { took: { glass_slide: 1, granite: 1 }, gives: {} });
    assert.deepEqual(plain(ctx.microscopeRequestItems('prepare', 'honey_bottle')), { took: { glass_slide: 1, honey_bottle: 1 }, gives: { glass: 1 } }, 'the bottle comes back');
    assert.equal(ctx.microSpecimenOf('bedrock'), null);
    assert.equal(ctx.microSpecimenOf('toString'), null, 'nothing from the prototype');
});

// ---- Drawings ----

test('every specimen draws something at every power, through both stains and dark-field, and stays balanced', () => {
    for (const id of ids) {
        const kind = ctx.MICRO_SPECIMEN_KINDS[ctx.MICRO_SPECIMENS[id].kind];
        for (const power of ctx.MICRO_MAGNIFICATIONS) {
            const scale = ctx.MICRO_SCALE[power];
            const half = 300 / scale;
            for (const look of [{}, { stain: 'iodine_tincture' }, { stain: 'methylene_blue' }, { dark: true }]) {
                let total = 0;
                kind.layers.forEach((_depth, layer) => {
                    const rec = recorder();
                    ctx.microPaintSpecimen(rec, id, layer, 7, -half, -half, half, half, scale, { power, ...look });
                    total += drawn(rec);
                    assert.equal(rec.calls.filter((c) => c === 'save').length, rec.calls.filter((c) => c === 'restore').length, `${id} ${power}`);
                });
                assert.ok(total > 0, `${id} at ${power}x ${JSON.stringify(look)} draws nothing`);
            }
        }
    }
});

test('the same slide is drawn the same for everyone, and another seed differs', () => {
    const run = (seed) => {
        const rec = recorder();
        ctx.microPaintSpecimen(rec, 'granite', 0, seed, -1000, -1000, 1000, 1000, 0.375, { power: 100 });
        return rec.calls.join();
    };
    assert.equal(run(5), run(5));
    assert.notEqual(run(5), run(6));
});

test('the field keeps a drawn sheet, and draws again only when the stage leaves it or the view changes', () => {
    let made = 0;
    let painted = 0;
    ctx.setMaker((width, height) => {
        made++;
        const rec = recorder();
        const context = new Proxy(rec, { get: (t, k) => (k === 'clearRect' ? () => { painted++; } : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
        return { width, height, getContext: () => context };
    });
    ctx.MICRO_SPECIMEN_CACHE.length = 0;
    const item = plain(ctx.microSpecimenScenery('basalt', 3))[0];
    const target = recorder();
    const view = { radius: 300, scale: ctx.MICRO_SCALE[400], power: 400, stageX: 0, stageY: 0, stain: '', dark: 0 };
    ctx.microDrawSpecimen(target, item, view);
    ctx.microDrawSpecimen(target, item, view);
    ctx.microDrawSpecimen(target, item, { ...view, stageX: 40 });
    assert.equal(painted, 1, 'a small move stays inside the sheet');
    assert.equal(target.calls.filter((c) => c === 'drawImage').length, 3, 'one drawImage a frame');
    ctx.microDrawSpecimen(target, item, { ...view, stageX: 400 });
    assert.equal(painted, 2, 'a long move draws it again');
    ctx.microDrawSpecimen(target, item, { ...view, stageX: 400, stain: 'methylene_blue' });
    ctx.microDrawSpecimen(target, item, { ...view, stageX: 400, stain: 'methylene_blue', dark: 0.8 });
    ctx.microDrawSpecimen(target, item, { ...view, stageX: 400, stain: 'methylene_blue', dark: 0.8, power: 1000, scale: ctx.MICRO_SCALE[1000] });
    assert.equal(painted, 5, 'a stain, dark-field and the power each draw it again');
    assert.equal(made, 1, 'the canvas itself is kept');
});

test('the field draws each specimen layer from its cached sheet', () => {
    ctx.setMaker((width, height) => ({ width, height, getContext: () => recorder() }));
    ctx.MICRO_SPECIMEN_CACHE.length = 0;
    const target = recorder();
    const soft = { ctx: recorder(), canvas: { width: 200, height: 200 } };
    const view = { radius: 300, scale: ctx.MICRO_SCALE[100], power: 100, stageX: 0, stageY: 0, focus: 0.5, light: { level: 1, source: 'sun' }, t: 0, age: 0, revived: false, stain: '', dark: 0 };
    ctx.microscopeDrawField(target, soft, soft, view, [], ctx.microScenery('sand', 1));
    const straight = target.calls.filter((c) => c === 'drawImage').length;
    const blurred = soft.ctx.calls.filter((c) => c === 'drawImage').length;
    assert.ok(straight >= 1 && straight + blurred >= 3, `${straight} sharp, ${blurred} soft`);
});

// ---- Stains ----

const STARCHY = ['wood', 'bread', 'seed', 'plant', 'paper'];
const NUCLEI = ['seed', 'plant', 'muscle'];
const INERT = ['sand', 'crystals', 'ice', 'rock', 'obsidian', 'coal', 'ore', 'metal', 'gold_leaf', 'gem', 'shell', 'solar', 'filament', 'wire', 'mirror', 'glass'];

test('the stain table: iodine finds starch, methylene blue nuclei; minerals, metals and glass take nothing; salts dissolve', () => {
    for (const id of ids) {
        const kind = ctx.MICRO_SPECIMENS[id].kind;
        const iodine = plain(ctx.microSpecimenStain(id, 'iodine_tincture'));
        const blue = plain(ctx.microSpecimenStain(id, 'methylene_blue'));
        assert.ok(iodine && blue, `${id} has no entry for a stain`);
        assert.equal(Boolean(iodine.starch), STARCHY.includes(kind), `${id}: iodine and starch`);
        assert.ok(!blue.starch, `${id}: methylene blue shows no starch`);
        assert.ok(!iodine.nucleus, `${id}: iodine paints no nucleus blue`);
        assert.equal(Boolean(blue.nucleus), NUCLEI.includes(kind), `${id}: nuclei`);
        if (INERT.includes(kind)) {
            assert.equal(iodine.amount, 0, `${id} takes iodine`);
            assert.equal(blue.amount, 0, `${id} takes methylene blue`);
        }
    }
    for (const id of ['salt', 'baking_soda', 'copper_sulfate']) {
        assert.ok(ctx.microSpecimenStain(id, 'methylene_blue').dissolve && ctx.microSpecimenStain(id, 'iodine_tincture').dissolve, `${id} dissolves`);
    }
    for (const id of ['element_s', 'fluorite', 'pyrite', 'granite']) assert.ok(!ctx.microSpecimenStain(id, 'methylene_blue').dissolve, `${id} does not dissolve`);
    // The blue-black ink of starch is painted only under iodine.
    const ink = (stain) => {
        const sets = [];
        const rec = recorder();
        const watched = new Proxy(rec, { set: (t, k, v) => { if (k === 'fillStyle') sets.push(v); t[k] = v; return true; }, get: (t, k) => t[k] });
        ctx.microPaintSpecimen(watched, 'wheat_seeds', 0, 3, -150, -150, 150, 150, 1.5, { power: 400, stain });
        return sets.filter((value) => value === 'rgba(26,20,60,0.96)').length;
    };
    assert.ok(ink('iodine_tincture') > 20, 'starch goes blue-black');
    assert.equal(ink('methylene_blue'), 0);
    assert.equal(ink(''), 0);
});

// ---- What the panel says ----

test('every specimen says what it is, and what each power and each stain shows, in both languages', () => {
    for (const id of ids) {
        const es = plain(ctx.microSpecimenText(id, 'ES'));
        const en = plain(ctx.microSpecimenText(id, 'EN'));
        for (const key of ctx.MICRO_SPECIMEN_TEXT_KEYS) {
            assert.ok(es[key] && es[key].length > 4, `${id} ES ${key}`);
            assert.ok(en[key] && en[key].length > 4, `${id} EN ${key}`);
            assert.notEqual(es[key], en[key], `${id} ${key} is not translated`);
        }
    }
    for (const table of [ctx.MICRO_SPECIMEN_KIND_TEXT, ctx.MICRO_SPECIMEN_LOOK_TEXT]) {
        for (const [name, entry] of Object.entries(table)) {
            for (const [key, said] of Object.entries(entry)) assert.ok(said.ES && said.EN, `${name}.${key} lacks a language`);
        }
    }
    const usedLooks = new Set(ids.map((id) => ctx.MICRO_SPECIMENS[id].look));
    assert.deepEqual(Object.keys(ctx.MICRO_SPECIMEN_LOOK_TEXT).filter((look) => !usedLooks.has(look)), [], 'texts of no specimen');
    assert.deepEqual([...usedLooks].filter((look) => !ctx.MICRO_SPECIMEN_LOOK_TEXT[look]), [], 'specimens with no text');
    assert.deepEqual(Object.keys(ctx.MICRO_SPECIMEN_KINDS).filter((kind) => !ctx.MICRO_SPECIMEN_KIND_TEXT[kind]), []);
});

test('the slide line of a specimen follows the power and the stain, in the language of the game', () => {
    const prep = { source: 'granite', seed: 1, age: 300 };
    ctx.setGameLang('EN');
    const at40 = ctx.microscopeSlideLine(prep, 300, -1, 40);
    const at400 = ctx.microscopeSlideLine(prep, 300, -1, 400);
    assert.match(at40, /^Granite/);
    assert.match(at40, /40×/);
    assert.notEqual(at40, at400);
    assert.doesNotMatch(at40, /dr(y|ies)/i, 'a specimen does not dry out');
    assert.match(ctx.microscopeSlideLine({ ...prep, stain: 'methylene_blue' }, 300, -1, 40), /Nothing changes/);
    ctx.setGameLang('ES');
    assert.match(ctx.microscopeSlideLine(prep, 300, -1, 100), /^Granito/);
    ctx.setGameLang('EN');
    assert.match(ctx.microSpecimenLine('wheat_seeds', 400, 'iodine_tincture'), /blue-black/);
});
