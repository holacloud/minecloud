// Node tests for the Glow Block (js/game/glow_block.js): its states against the server, the snapping of
// the panel, that it gives no light and needs no power, the panel on a stand-in page, blueprints, and
// that the guide covers it. Run with: node --test test/js/glow_block.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const print = require(path.join(STATIC, 'js', 'guidePrint.js'));
const tool = require(path.join(ROOT, 'tools', 'viewerPalette.js'));
const plain = (value) => JSON.parse(JSON.stringify(value));

function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}
function canvasStub() {
    const ctx = new Proxy({}, {
        get: (target, key) => (key in target ? target[key] : () => ({ data: new Uint8ClampedArray(4 * 4096), addColorStop() {} })),
        set: (target, key, value) => { target[key] = value; return true; }
    });
    return { width: 16, height: 16, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,' };
}

function loadGame() {
    const THREE = new Proxy({ Vector3: class {}, Vector2: class {} }, { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const context = vm.createContext({
        console: { ...console, warn() {} }, performance: { now: () => context.now }, now: 1000, THREE, navigator: {}, requestAnimationFrame: () => 0,
        Worker: class { postMessage() {} terminate() {} },
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; } },
        document: { createElement: (tag) => (tag === 'canvas' ? canvasStub() : anyStub()), addEventListener() {}, body: anyStub(), head: anyStub(), getElementById: () => null, querySelector: () => null },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
    });
    context.window = context;
    vm.runInContext('class Game {}', context);
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1])
        .filter((src) => !/^(https?:)?\/\//.test(src) && !print.SKIP_SCRIPTS.test(src));
    assert.ok(scripts.includes('js/game/glow_block.js'));
    for (const src of scripts) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    vm.runInContext(`Object.assign(this, { GLOW_KELVINS, GLOW_LEVELS, GLOW_BLOCK, ELECTRIC_KINDS, BLOCK_TYPES, GAME_CONTENT_HOOKS, MODAL_PANELS, ITEM_USE_HANDLERS, TEXTURE_PATTERNS,
        glowLevelOf, glowNameOfRgb, glowNameOfKelvin, glowStateOf, glowColorOf, glowAllNames, glowDescribe, Game, WorldRenderer, constructionPlan });`, context);
    return context;
}

const ctx = loadGame();
const world = vm.runInContext('new WorldRenderer({ add() {}, remove() {} })', ctx);
const go = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'glow_block.go'), 'utf8');

test('the states match the server, and are 5 temperatures and 6 levels per channel', () => {
    assert.deepEqual(go.match(/glowKelvins = \[\]int\{([^}]*)\}/)[1].split(', ').map(Number), Object.keys(ctx.GLOW_KELVINS).map(Number));
    assert.equal(Number(go.match(/glowLevels\s+= (\d+)/)[1]), ctx.GLOW_LEVELS);
    assert.equal(ctx.GLOW_LEVELS, 6);
    const names = ctx.glowAllNames();
    assert.equal(names.length, 5 + 216);
    assert.equal(new Set(names).size, names.length);
    for (const name of names) {
        assert.ok(world.blockTypes[name], name);
        assert.ok(world.registry.id(name) > 0, name);
    }
});

test('sliders go to the nearest state, and a name says its colour', () => {
    assert.equal(ctx.glowLevelOf(0), 0);
    assert.equal(ctx.glowLevelOf(25), 0);
    assert.equal(ctx.glowLevelOf(26), 1);
    assert.equal(ctx.glowLevelOf(255), 5);
    assert.equal(ctx.glowLevelOf(999), 5);
    assert.equal(ctx.glowLevelOf(-9), 0);
    assert.equal(ctx.glowNameOfRgb(255, 0, 153), 'glow_block:rgb503');
    assert.equal(ctx.glowNameOfRgb(250, 10, 140), 'glow_block:rgb503');
    assert.deepEqual(plain(ctx.glowStateOf('glow_block:rgb503')), { rgb: [255, 0, 153] });
    assert.equal(ctx.glowColorOf('glow_block:rgb503'), 0xff0099);
    assert.equal(ctx.glowColorOf('glow_block:rgb000'), 0);
    assert.equal(ctx.glowColorOf('glow_block:rgb555'), 0xffffff);
    assert.equal(ctx.glowNameOfKelvin(3000), 'glow_block');
    assert.equal(ctx.glowNameOfKelvin(6500), 'glow_block:k6500');
    assert.equal(ctx.glowStateOf('glow_block').kelvin, 3000);
    assert.equal(ctx.glowStateOf('glow_block:k3000'), null);
    assert.equal(ctx.glowStateOf('glow_block:rgb600'), null);
    assert.equal(ctx.glowStateOf('stone'), null);
    assert.equal(ctx.glowDescribe('glow_block:k4000'), '4000 K');
    assert.match(ctx.glowDescribe('glow_block:rgb503'), /R 255 +G 0 +B 153/);
    // Warmer is redder: blue grows with the temperature.
    const kelvins = Object.keys(ctx.GLOW_KELVINS).map(Number);
    const blue = kelvins.map((k) => ctx.GLOW_KELVINS[k] & 255);
    assert.deepEqual(blue, [...blue].sort((a, b) => a - b));
});

test('a full cube that glows, with no light, no power, and one item', () => {
    for (const name of ['glow_block', 'glow_block:k6500', 'glow_block:rgb503']) {
        const def = world.blockTypes[name];
        const id = world.registry.id(name);
        assert.equal(def.glow, 1.6);
        assert.equal(world.registry.fullCube[id], 1, 'a full cube');
        assert.ok(!world.isLightEmitterType(name), 'it lights nothing');
        assert.equal(def.electric, undefined);
        assert.equal(ctx.ELECTRIC_KINDS[name.split(':')[0]], undefined);
    }
    assert.equal(world.blockTypes['glow_block:rgb503'].variantOf, 'glow_block');
    assert.equal(world.blockTypes['glow_block:rgb503'].dropType, 'glow_block');
    assert.equal(world.blockTypes.glow_block.variantOf, undefined);
    assert.equal(world.blockTypes.glow_block.name, 'Glow Block');
});

test('each colour is its own tint, with few pixels in every graphics mode', () => {
    const faces = world.getFaceTextureSpecs('glow_block:rgb503');
    assert.equal(faces.top.tint, 0xff0099);
    assert.equal(faces.side.pattern, 'glow_block');
    assert.equal(ctx.TEXTURE_PATTERNS.glow_block.maxSize, 32);
    const sizes = [];
    const generate = world.textureFactory.generate;
    world.textureFactory.generate = (pattern, options) => { sizes.push(options.size); return generate.call(world.textureFactory, pattern, options); };
    world.rtxModeEnabled = true;
    world.ultraModeEnabled = true;
    world.generateFaceTextures(faces.top);
    world.generateFaceTextures({ pattern: 'smooth', tint: 1 });
    world.rtxModeEnabled = false;
    world.ultraModeEnabled = false;
    world.textureFactory.generate = generate;
    assert.deepEqual(sizes, [32, 256], 'other patterns are as they were');
});

test('the viewer palette has the right colours', () => {
    const palette = JSON.parse(fs.readFileSync(tool.OUTPUT, 'utf8'));
    const channels = (color) => [(color >> 16) & 255, (color >> 8) & 255, color & 255];
    for (const name of ctx.glowAllNames()) assert.ok(palette[name] || palette[name.split(':')[0]], name);
    const [r, g, b] = channels(palette['glow_block:rgb500'][0]);
    assert.ok(r > 180 && g < 40 && b < 40, `red is ${r},${g},${b}`);
    const [r2, g2, b2] = channels(palette['glow_block:rgb005'][0]);
    assert.ok(b2 > 180 && r2 < 40 && g2 < 40, `blue is ${r2},${g2},${b2}`);
    assert.ok(channels(palette['glow_block:k2700'][0])[2] < channels(palette['glow_block:k6500'][0])[2], 'warm has less blue than cold');
    assert.equal(palette.glow_block[1], 0, 'solid');
});

test('the recipe uses ordinary things, and it is in the inventory and the showroom', () => {
    const recipes = {};
    const items = new Set();
    for (const hook of ctx.GAME_CONTENT_HOOKS.filter((candidate) => String(candidate).includes('GLOW_BLOCK'))) {
        hook.call(new Proxy({}, { get: () => () => {}, set: () => true }), {
            addItem: (type) => items.add(type),
            addRecipe: (id, name, output, amount, inputs) => { recipes[id] = { output, amount, inputs: plain(inputs) }; }
        });
    }
    assert.deepEqual(recipes.glow_block, { output: 'glow_block', amount: 1, inputs: [{ type: 'glass', amount: 1 }, { type: 'torch', amount: 1 }] });
    assert.ok(items.has('glow_block'));
    assert.ok(!items.has('glow_block:rgb503'));
    const plan = ctx.constructionPlan('showroom');
    const placed = new Set(plan.cells.map((cell) => cell.type));
    for (const type of ['glow_block', 'glow_block:k6500', 'glow_block:rgb503'.replace('503', '505')]) assert.ok(placed.has(type), type);
});

test('creative stock has one item, not 221', () => {
    const counts = {};
    const game = Object.create(ctx.Game.prototype);
    Object.assign(game, {
        world, inventoryCounts: counts, ensureInventorySlot() {}, getInventoryCount: (type) => counts[type] || 0,
        updateHotbarCounts() {}, refreshHeldItemMesh() {}, renderCraftingPanel() {}, renderInventoryPanel() {}, saveInventoryState() {}
    });
    game.creativeStock();
    assert.ok(counts.glow_block > 0);
    assert.equal(counts['glow_block:rgb503'], undefined);
});

// ---- The panel ----

function fakeElement() {
    const listeners = {};
    const found = new Map();
    const element = {
        style: {}, dataset: {}, value: '0', textContent: '', innerHTML: '', classes: new Set(),
        classList: { add: (name) => element.classes.add(name), remove: (name) => element.classes.delete(name), toggle: (name, on) => (on ? element.classes.add(name) : element.classes.delete(name)) },
        appendChild(child) { return child; },
        addEventListener(type, listener) { (listeners[type] = listeners[type] || []).push(listener); },
        fire(type, event = {}) { for (const listener of listeners[type] || []) listener({ preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...event }); },
        querySelector(selector) {
            if (!found.has(selector)) found.set(selector, fakeElement());
            return found.get(selector);
        },
        querySelectorAll(selector) {
            if (selector !== '[data-kelvin]') return [];
            if (!found.has(selector)) {
                found.set(selector, Object.keys(ctx.GLOW_KELVINS).map((kelvin) => {
                    const button = fakeElement();
                    button.dataset.kelvin = kelvin;
                    return button;
                }));
            }
            return found.get(selector);
        }
    };
    return element;
}

function panelGame() {
    const keydown = [];
    ctx.document = {
        pointerLockElement: null, head: fakeElement(), body: fakeElement(), exitPointerLock() {}, createElement: () => fakeElement(),
        addEventListener: (type, listener) => { if (type === 'keydown') keydown.push(listener); }
    };
    const game = Object.create(ctx.Game.prototype);
    const blocks = new Map([['0,1,0', 'glow_block']]);
    const sent = [];
    Object.assign(game, {
        keydown, sent, blocks, cameraController: { isCrouching: false, camera: { position: { x: 1, y: 2, z: 1 } } }, renderer: { domElement: {} },
        network: { connected: true, send: (type, payload) => sent.push([type, plain(payload)]) },
        world: { getBlockTypeAt: (x, y, z) => blocks.get(`${x},${y},${z}`) || null, getBlockPositionFromIntersection: () => ({ x: 0, y: 1, z: 0 }) },
        stopMining() {}, recapturePointerLock() {}, updatePointerLockHint() {}, receiveSystemMessage() {}
    });
    const handler = ctx.ITEM_USE_HANDLERS.find((candidate) => String(candidate).includes('glowTryOpen'));
    assert.equal(handler.call(game, null, {}), true);
    return game;
}

test('the panel: modal, shows the colour, and tells the server what is chosen', () => {
    const game = panelGame();
    const panel = game.glowPanel;
    assert.ok(panel.classes.has('visible'));
    assert.ok(ctx.MODAL_PANELS.some((entry) => entry.isOpen.call(game)));
    assert.ok(game.suppressPointerLockPauseUntil > ctx.now, 'no pause menu');
    assert.equal(panel.querySelector('#glow-value').textContent, '3000 K');
    assert.equal(panel.querySelector('#glow-preview').style.background, '#ffb46b');

    // A temperature.
    panel.querySelectorAll('[data-kelvin]')[4].fire('click');
    assert.deepEqual(game.sent.at(-1), ['glowSet', { x: 0, y: 1, z: 0, blockType: 'glow_block:k6500' }]);
    assert.equal(panel.querySelector('#glow-value').textContent, '6500 K');
    assert.ok(panel.querySelectorAll('[data-kelvin]')[4].classes.has('active'));

    // A colour: too soon to send, the preview goes at once, and the last one goes when it can.
    panel.querySelector('#glow-r').value = '255';
    panel.querySelector('#glow-g').value = '0';
    panel.querySelector('#glow-b').value = '153';
    panel.querySelector('#glow-b').fire('input');
    assert.equal(game.sent.length, 1);
    assert.equal(panel.querySelector('#glow-preview').style.background, '#ff0099');
    assert.match(panel.querySelector('#glow-value').textContent, /R 255/);
    assert.equal(panel.querySelector('#glow-r-value').textContent, '255');
    ctx.now += 200;
    game.glowUpdate();
    assert.deepEqual(game.sent.at(-1), ['glowSet', { x: 0, y: 1, z: 0, blockType: 'glow_block:rgb503' }]);
    assert.equal(game.sent.length, 2);
    game.glowClose();
    assert.equal(game.glowAt, null);
    assert.ok(!panel.classes.has('visible'));
});

test('the panel: closing sends what was pending, and walking away closes it', () => {
    const game = panelGame();
    game.glowChoose('glow_block:k2700');
    game.glowChoose('glow_block:k4000');
    game.glowClose();
    assert.equal(game.sent.at(-1)[1].blockType, 'glow_block:k4000');

    const far = panelGame();
    far.cameraController.camera.position.x = 40;
    far.glowUpdate();
    assert.equal(far.glowAt, null);

    const broken = panelGame();
    broken.blocks.clear();
    broken.glowUpdate();
    assert.equal(broken.glowAt, null);

    // Other blocks are none of its business, and crouching builds against it.
    const other = panelGame();
    other.glowClose();
    other.blocks.set('0,1,0', 'stone');
    assert.equal(other.glowTryOpen({ x: 0, y: 1, z: 0 }), false);
    other.blocks.set('0,1,0', 'glow_block:rgb111');
    other.cameraController.isCrouching = true;
    const handler = ctx.ITEM_USE_HANDLERS.find((candidate) => String(candidate).includes('glowTryOpen'));
    assert.equal(handler.call(other, null, {}), false);
});

test('the panel: another player\'s change shows, and no key reaches the game', () => {
    const game = panelGame();
    ctx.now += 1000;
    game.blocks.set('0,1,0', 'glow_block:rgb005');
    game.glowUpdate();
    assert.equal(game.glowName, 'glow_block:rgb005');
    assert.equal(game.glowPanel.querySelector('#glow-b').value, '255');

    let stopped = 0;
    const key = (code) => game.keydown.forEach((listener) => listener({ code, stopImmediatePropagation() { stopped++; }, preventDefault() {} }));
    key('KeyW');
    assert.ok(stopped > 0 && game.glowAt);
    key('Escape');
    assert.equal(game.glowAt, null);
});

test('a bad name asked of the panel does nothing', () => {
    const game = panelGame();
    const before = game.sent.length;
    game.glowChoose('glow_block:rgb999');
    assert.equal(game.sent.length, before);
    assert.equal(game.glowName, 'glow_block');
});

// ---- The guide ----

test('the guide covers it in both languages, from the index, and says what it does not do', () => {
    const GUIDE = path.join(STATIC, 'guide');
    const names = fs.readdirSync(GUIDE);
    const read = (page, lang) => fs.readFileSync(path.join(GUIDE, names.find((name) => name.startsWith(`${page}_${lang}_`))), 'utf8');
    assert.ok(print.SECTIONS.some(([from, to]) => from <= 245 && 245 <= to));
    for (const lang of ['ES', 'EN']) {
        const page = read(245, lang);
        assert.match(page, /item:glow_block/);
        assert.match(page, /1 `glass` \+ 1 `torch`/);
        assert.match(page, lang === 'EN' ? /lights nothing/ : /No ilumina nada/);
        assert.match(page, /\(238\)/);
        assert.match(page, lang === 'EN' ? /colour is lost/ : /color se pierde/);
        assert.match(page, /216/);
        for (const [, target] of page.matchAll(/\]\((\d+)\)/g)) assert.ok(names.some((name) => name.startsWith(`${target}_${lang}_`)), target);
        assert.match(read(48, lang), /\(245\)/);
    }
    assert.match(fs.readFileSync(path.join(GUIDE, 'README.md'), 'utf8'), /^\| 245 \|/m);
    assert.match(fs.readFileSync(path.join(ROOT, 'GUIA.md'), 'utf8'), /^## Bloque luminoso$/m);
});
