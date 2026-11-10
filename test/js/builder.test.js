// Node tests for builder mode (js/game/builder.js): the palette (and that it is the server's list,
// pkg/network/builder.go), on and off at a plot's border, the choice kept in the browser, the hotbar and the
// inventory panel with the palette and the player's own items, what is left on walking out, placing without
// spending and with `palette: true`, no pickups for a palette type broken in builder mode and the usual ones
// otherwise, instant breaking, flight and no fall damage, and every line in ES and EN. Every script of index.html
// runs in one VM context, with the real Game (without its init) and the real WorldRenderer; the page is a
// stand-in. The server side is pkg/network/builder_test.go. Nothing here runs a browser.
// Run with: node --test test/js/builder.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const HTML = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
const SOURCE = fs.readFileSync(path.join(STATIC, 'js', 'game', 'builder.js'), 'utf8');
const GO = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'builder.go'), 'utf8');

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
        id, style: {}, dataset: {}, children: [], value: '', title: '', textContent: '', placeholder: '', listeners: {},
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
        focus() {},
        click() { (this.listeners.click || []).forEach((listener) => listener({ stopPropagation() {}, preventDefault() {} })); }
    };
}

const elements = new Map();
const stored = new Map();
const pauseRow = makeElement('pause-row');
function load() {
    const THREE = new Proxy({
        Vector3, Vector2: Vector3, Vector4: Vector3, MeshLambertMaterial: class extends Material {},
        MeshStandardMaterial: class extends Material {}, MeshBasicMaterial: class extends Material {},
        MultiplyBlending: 'multiply', FrontSide: 'front', DoubleSide: 'double', sRGBEncoding: 'srgb'
    }, { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const body = makeElement('body');
    const document = {
        pointerLockElement: null, body, head: anyStub(), addEventListener() {},
        querySelector: (selector) => (selector === '#pause-menu .pause-actions-main' ? pauseRow : null), querySelectorAll: () => [],
        createElement: (tag) => (tag === 'canvas' ? canvasStub() : makeElement()),
        getElementById(id) {
            if (id === 'settings-builder' || id === 'settings-claim-home') return pauseRow.children.find((child) => child.id === id) || null;
            if (id === 'claim-notice' || id === 'builder-indicator') return body.children.find((child) => child.id === id) || null;
            if (!elements.has(id)) elements.set(id, makeElement(id));
            return elements.get(id);
        }
    };
    const storage = { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)), removeItem: (key) => stored.delete(key) };
    const context = vm.createContext({
        console: { ...console, warn() {} }, Math, Map, WeakMap, Set, Object, Array, JSON, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array,
        Int8Array, Int16Array, Int32Array, Float32Array, Float64Array, THREE, document, navigator: { language: 'es-ES' },
        performance: { now: () => 0 }, requestAnimationFrame: () => 0, Worker: class { postMessage() {} terminate() {} },
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; } },
        localStorage: storage, location: { search: '', protocol: 'http:', host: 'test' }, URLSearchParams, prompt: () => 'Tester',
        setTimeout: (fn) => { fn(); return 0; }, clearTimeout() {}, setInterval() {}, clearInterval() {}, WebSocket: class {}, Audio: class {}, Image: class {}, AudioContext: class {},
        fetch: () => new Promise(() => {}), addEventListener() {}, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1
    });
    context.window = context;
    const scripts = [...HTML.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]).filter((src) => !/^(https?:)?\/\//.test(src));
    for (const src of scripts) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    vm.runInContext(`Object.assign(this, { Game, WorldRenderer, setGameLang, BUILDER_TEXT, BUILDER_FAMILIES, BUILDER_NOT_FAMILIES, BUILDER_NOT_ITEMS, BUILDER_MARGIN, builderPlotNear,
        builderPaletteOf, builderSay, itemTagsOf, itemTagCatalogue, claimRefusalText, FRAME_UPDATERS, DAMAGE_MODIFIERS });`, context);
    return context;
}

const ctx = load();
ctx.Game.prototype.init = function () {};
const realWorld = new ctx.WorldRenderer({ add() {}, remove() {} });
realWorld.getInventoryIconUrl = () => '';
const blockTypes = realWorld.blockTypes;
const plain = (value) => JSON.parse(JSON.stringify(value));
const flightUpdater = ctx.FRAME_UPDATERS.find((fn) => String(fn).includes('flightAllowed'));

// Ana's plot around (100, 100) is mine; Beto's around (140, 100) has me as a guest; Cris's around (180, 100) is not.
function plots() {
    const plot = (id, owner, x, role) => ({ id, x, y: 64, z: 100, owner, ...role, minX: x - 8, minZ: 92, maxX: x + 8, maxZ: 108 });
    return {
        claims: [plot('clm_a', 'Ana', 100, { mine: true }), plot('clm_b', 'Beto', 140, { guest: true }), plot('clm_c', 'Cris', 180, {})],
        spawn: { minX: -16, minZ: -16, maxX: 15, maxZ: 15 }, radius: 8, gap: 8
    };
}

// A game standing at (x, z), with its own inventory, a world of a map of cells, and a network that records.
function makeGame({ x = 300, z = 300, own = { stone: 5, iron_ore: 3, bread: 2 }, keepStorage = false } = {}) {
    elements.clear();
    pauseRow.children.length = 0;
    if (!keepStorage) stored.clear();
    const cells = new Map();
    const world = Object.create(realWorld);
    Object.assign(world, {
        getBlockTypeAt: (cx, cy, cz) => cells.get(`${cx},${cy},${cz}`) || null,
        addBlock(block) { cells.set(`${block.x},${block.y},${block.z}`, block.blockType); return true; },
        removeBlockAt: (cx, cy, cz) => cells.delete(`${cx},${cy},${cz}`),
        getBlockPositionFromIntersection: (hit) => hit.position,
        createDisplayMesh: () => ({ position: { copy() {} }, rotation: { copy() {}, set() {} }, traverse() {} }),
        getDropLandingY: () => 64
    });
    const network = {
        connected: true, sent: [], handlers: new Map(),
        on(type, handler) { (this.handlers.get(type) || this.handlers.set(type, []).get(type)).push(handler); },
        send(type, payload) { this.sent.push([type, plain(payload)]); },
        emit(type, payload) { for (const handler of this.handlers.get(type) || []) handler(payload); }
    };
    const position = { x, y: 66.6, z };
    const game = new ctx.Game();
    Object.assign(game, {
        world, network, creativeMode: false, titleScreenOpen: false, messages: [],
        scene: { add() {}, remove() {} }, camera: { position, getWorldDirection: (v) => v.set(0, 0, -1) },
        cameraController: {
            getPosition: () => position, onGround: true, flying: false, flightAllowed: false, isInWater: false, isCrouching: false, eyeHeight: 1.62,
            canInteract: () => true, intersectsBody: () => false, intersectsBoxes: () => false
        },
        receiveSystemMessage(message) { this.messages.push(message.text); },
        renderCraftingPanel() {}, playPlaceSound() {}, playPickupSound() {}, showHitIndicator() {}, disposeMiningBlockVisual() {}, disposeObject3D() {},
        getLocalPlayerPosition: () => position, getInteractionRay: () => ({ direction: { x: 0, y: 0, z: -1 } }),
        tryUseItemOnMob: () => false, tryMountMob: () => false, renderer: { domElement: {} }, recapturePointerLock() {}
    });
    // The real prototype methods for what the stand-ins above replaced on the instance would hide.
    delete game.tryUseItemOnMob; delete game.tryMountMob;
    game.tryUseItemOnMobCalls = [];
    game.inventory = Object.keys(own);
    game.inventoryCounts = { ...own };
    game.selectedSlot = 0;
    game.hotbarPinnedTypes = [];
    game.hotbarPrimaryType = null;
    game.creativeLoad();
    game.builderLoad();
    game.initHotbar();
    game.claimsListen();
    game.builderListen();
    network.emit('claimList', plots());
    const frame = (delta = 1 / 60) => { game.claimUpdate(); game.builderUpdate(delta); flightUpdater.call(game, delta); };
    const moveTo = (nx, nz) => { position.x = nx; position.z = nz; frame(); };
    return { game, world, cells, network, position, frame, moveTo };
}

const slots = (game) => plain(game.getHotbarItems().map((item) => (item.palette ? `∞${item.type}` : `${item.type}×${item.count}`)));
const panel = (game) => {
    game.renderInventoryPanel();
    return ctx.document.getElementById('inventory-grid').children
        .filter((child) => child.className.includes('inventory-item'))
        .map((child) => `${child.title.split('\n')[0]} ${child.children[2].textContent}`);
};
const savedInventory = () => JSON.parse(stored.get('minecloud-inventory-state') || '{}');
const fallDamage = (game, amount = 6) => ctx.DAMAGE_MODIFIERS.reduce((current, modifier) => modifier.call(game, current, 'fall', 'fell', null), amount);

// ---- The palette ----

test('the palette is the server\'s list, item for item, and nothing scientific or useful beyond building is in it', () => {
    const palette = plain(ctx.builderPaletteOf(blockTypes));
    const server = [...GO.matchAll(/"([a-z0-9_]+)": true/g)].map((match) => match[1]);
    assert.deepEqual([...palette].sort(), [...server].sort(), 'js/game/builder.js and pkg/network/builder.go must list the same palette');
    assert.equal(palette.length, 243, 'a change of tags moved items in or out of the palette: check them and update both lists');
    for (const id of palette) {
        const tags = plain(ctx.itemTagsOf(id, blockTypes));
        assert.ok(tags.some((tag) => ctx.BUILDER_FAMILIES.includes(tag)), `${id} is building or decoration`);
        assert.ok(!tags.some((tag) => ctx.BUILDER_NOT_FAMILIES.includes(tag)), `${id}: ${tags}`);
        assert.ok(!blockTypes[id].itemOnly && !blockTypes[id].variantOf, id);
    }
    for (const id of ['stone', 'planks', 'glass', 'white_wool', 'oak_door', 'oak_stairs', 'torch', 'lantern', 'chest', 'barrel', 'wardrobe', 'bed', 'white_sofa',
        'red_carpet', 'red_curtain', 'painting_sunset', 'ladder', 'grass', 'glow_block', 'blue_stained_glass_pane']) assert.ok(palette.includes(id), `${id} is in`);
    for (const id of ['claim_marker', 'oven', 'foundry', 'arc_furnace', 'fridge', 'chest_freezer', 'microscope', 'incubator', 'autoclave', 'iron_ore', 'coal_ore',
        'bread', 'iron_pickaxe', 'iron_sword', 'battery', 'electric_lamp', 'neon_lamp', 'mirror', 'element_fe', 'cow_egg', 'wheat_seeds', 'farmland', 'firefly_jar',
        'sound_block', 'spray_paint', 'agar_plate', 'leaves', 'water']) assert.ok(!palette.includes(id), `${id} is out`);
});

// ---- On and off ----

test('it turns on walking into my plot or one I am a guest of, and off walking out, with a sign and a notice', () => {
    const { game, moveTo, frame } = makeGame();
    frame();
    assert.equal(game.builderActive, false);
    const sign = () => game.builderIndicator;
    moveTo(100.5, 100.5);
    assert.equal(game.builderActive, true);
    assert.ok(sign().classList.contains('visible') && !sign().classList.contains('dim'));
    assert.equal(sign().textContent, '🔨 Modo constructor');
    assert.match(ctx.document.getElementById('claim-notice').textContent, /Modo constructor/);
    moveTo(108.9, 100); // the last column of the plot
    assert.equal(game.builderActive, true);
    moveTo(109.1, 100); // the margin
    assert.equal(game.builderActive, true);
    moveTo(112.1, 100); // beyond it
    assert.equal(game.builderActive, false);
    assert.ok(!sign().classList.contains('visible'));
    assert.equal(ctx.document.getElementById('claim-notice').textContent, 'Te has alejado de la parcela: fin del modo constructor.');
    moveTo(140, 100);
    assert.equal(game.builderActive, true, 'as a guest');
    moveTo(180, 100);
    assert.equal(game.builderActive, false, 'someone else\'s plot');
    moveTo(0, 0);
    assert.equal(game.builderActive, false, 'the spawn zone');
    // Creative mode has everything already; and a plot that goes, ends it.
    moveTo(100, 100);
    game.creativeMode = true;
    frame();
    assert.equal(game.builderActive, false);
    game.creativeMode = false;
    frame();
    assert.equal(game.builderActive, true);
    game.network.emit('claimList', { claims: [], spawn: plots().spawn });
    frame();
    assert.equal(game.builderActive, false);
});

test('it can be turned off inside, from the pause menu or the sign, and the choice is kept in the browser', () => {
    let { game, moveTo, frame } = makeGame();
    moveTo(100, 100);
    const button = pauseRow.children.find((child) => child.id === 'settings-builder');
    assert.equal(button.textContent, 'Modo constructor: sí');
    button.click();
    assert.equal(game.builderActive, false);
    assert.equal(stored.get('minecloud-builder'), 'off');
    assert.equal(button.textContent, 'Modo constructor: no');
    const sign = game.builderIndicator;
    assert.ok(sign.classList.contains('visible') && sign.classList.contains('dim'), 'still shown, dim');
    assert.equal(sign.textContent, '🔨 Modo constructor apagado');
    frame();
    assert.equal(game.builderActive, false, 'it stays off inside');
    // Another page in this browser remembers it.
    ({ game, moveTo, frame } = makeGame({ keepStorage: true }));
    moveTo(100, 100);
    assert.equal(game.builderActive, false);
    // The sign turns it on again (on touch it is a button).
    game.builderIndicator.listeners.pointerdown[0]({ preventDefault() {} });
    assert.equal(game.builderActive, true);
    assert.equal(stored.get('minecloud-builder'), 'on');
    ctx.setGameLang('EN');
    try {
        assert.equal(pauseRow.children.find((child) => child.id === 'settings-builder').textContent, 'Builder mode: on');
        assert.equal(game.builderIndicator.textContent, '🔨 Builder mode');
    } finally {
        ctx.setGameLang('ES');
    }
});

// ---- The hotbar and the inventory ----

test('the hotbar and the panel show the palette with the player\'s own items outside it, and leave no trace on walking out', () => {
    const { game, moveTo } = makeGame();
    const before = JSON.stringify(savedInventory());
    assert.deepEqual(slots(game), ['stone×5', 'iron_ore×3', 'bread×2']);
    moveTo(100, 100);
    const shown = slots(game);
    assert.equal(shown[0], '∞stone', 'my stone\'s slot is the palette\'s now');
    assert.ok(shown.includes('iron_ore×3') && shown.includes('bread×2'));
    assert.ok(shown.includes('∞stone_bricks') && shown.includes('∞planks'));
    assert.equal(shown.length, game.hotbarSize);
    assert.equal(game.getSelectedBlockType(), 'stone', 'the hand keeps stone, from the palette');
    assert.equal(game.hotbarLabelText(), 'Stone · ∞');
    const listed = panel(game);
    assert.deepEqual(listed.slice(0, 2), ['Iron Ore x3', 'Bread x2'], 'own items first');
    assert.ok(listed.includes('Stone ∞') && listed.includes('Glass ∞') && listed.includes('Chest ∞'));
    assert.ok(!listed.includes('Stone x5'), 'my own stone waits, untouched');
    assert.equal(listed.length, 2 + 243);
    // A search finds palette items by their tags too.
    game.inventorySearchTerm = '#vidrio azul';
    assert.ok(panel(game).every((line) => /Blue/.test(line) && line.endsWith('∞')));
    game.inventorySearchTerm = '';
    panel(game);

    // Choosing from the panel puts it in the hand and first on the hotbar; choosing my own item, the same.
    const glass = ctx.document.getElementById('inventory-grid').children.find((child) => child.title.startsWith('Glass\n'));
    glass.click();
    assert.equal(game.getSelectedBlockType(), 'glass');
    assert.equal(slots(game)[0], '∞glass');
    game.selectHotbarSlot(slots(game).indexOf('iron_ore×3'));
    assert.equal(game.getSelectedBlockType(), 'iron_ore');
    assert.equal(game.builderSelected, null);
    game.selectHotbarSlot(0);
    assert.equal(game.getSelectedBlockType(), 'glass');
    game.stepHotbarSelection(1);
    assert.notEqual(game.getSelectedHeldItemType(), null);

    // Nothing of the palette reached the real inventory or its save.
    assert.deepEqual(plain(game.inventoryCounts), { stone: 5, iron_ore: 3, bread: 2 });
    assert.deepEqual(plain(game.inventory), ['stone', 'iron_ore', 'bread']);
    assert.ok(!JSON.stringify(savedInventory()).includes('glass') && !JSON.stringify(savedInventory()).includes('palette'));

    game.selectHotbarSlot(0); // glass, from the palette, in the hand
    moveTo(300, 300);
    assert.deepEqual(slots(game), ['stone×5', 'iron_ore×3', 'bread×2'], 'the hotbar is mine again');
    assert.ok(!['glass', 'stone_bricks'].includes(game.getSelectedBlockType()), 'no palette item in the hand');
    assert.deepEqual(panel(game), ['Stone x5', 'Iron Ore x3', 'Bread x2']);
    assert.equal(JSON.stringify({ ...savedInventory(), selectedSlot: undefined }), JSON.stringify({ ...JSON.parse(before), selectedSlot: undefined }));
});

test('walking out with a palette type in the hand keeps that type in the hand if the player has some of their own', () => {
    const { game, moveTo } = makeGame({ own: { bread: 1, planks: 4 } });
    moveTo(100, 100);
    game.builderSelect('planks', true);
    moveTo(300, 300);
    assert.equal(game.getSelectedBlockType(), 'planks');
    assert.deepEqual(slots(game), ['bread×1', 'planks×4']);
});

test('a palette item never leaves the hand: not dropped, eaten, moved to the left hand, nor used on anything', () => {
    const { game, moveTo } = makeGame();
    moveTo(100, 100);
    game.builderSelect('glass');
    const pickups = game.pickups.size;
    game.dropSelectedBlock();
    game.eatSelectedItem();
    game.offhandSwapSelected();
    assert.equal(game.pickups.size, pickups);
    assert.equal(game.offhandType || null, null);
    assert.deepEqual(plain(game.inventoryCounts), { stone: 5, iron_ore: 3, bread: 2 });
    assert.equal(ctx.document.getElementById('claim-notice').textContent, 'Lo de la paleta no sale de la parcela.');
    // Uses see an empty hand (a glass block would milk a cow), and nothing is spent outside placing.
    assert.equal(game.builderWithEmptyHand(() => game.getSelectedHeldItemType()), null);
    assert.equal(game.consumeSelectedBlock(), false);
    assert.equal(game.getInventoryCount('glass'), 0, 'crafting and chests see none');
    assert.equal(game.canCraftRecipe({ inputs: [{ type: 'glass', amount: 1 }] }), false);
});

// ---- Placing and breaking ----

function aimAt(game, x, y, z) {
    game.raycastBlock = () => ({ position: { x, y, z }, face: { normal: { x: 0, y: 1, z: 0 } }, point: { x: x + 0.5, y: y + 1, z: z + 0.5 } });
}

test('placing from the palette spends nothing, says palette: true, and my own stack of that type stays as it was', () => {
    const { game, cells, network, moveTo } = makeGame();
    moveTo(100, 100);
    assert.equal(game.getSelectedBlockType(), 'stone');
    cells.set('101,64,101', 'grass');
    aimAt(game, 101, 64, 101);
    game.placeBlock();
    assert.equal(cells.get('101,65,101'), 'stone');
    assert.deepEqual(network.sent.filter(([type]) => type === 'blockPlace'), [['blockPlace', { x: 101, y: 65, z: 101, blockType: 'stone', palette: true }]]);
    assert.equal(game.inventoryCounts.stone, 5);
    game.builderSelect('glass');
    aimAt(game, 101, 65, 101);
    game.placeBlock();
    assert.equal(cells.get('101,66,101'), 'glass');
    assert.deepEqual(plain(game.inventoryCounts), { stone: 5, iron_ore: 3, bread: 2 });
    // My own item outside the palette is spent as always, and is not marked.
    game.selectInventoryType('iron_ore');
    aimAt(game, 101, 66, 101);
    game.placeBlock();
    assert.equal(game.inventoryCounts.iron_ore, 2);
    assert.deepEqual(network.sent.at(-1), ['blockPlace', { x: 101, y: 67, z: 101, blockType: 'iron_ore' }]);
    // Refused by the server: the cell back, nothing given.
    network.emit('claimRefused', { reason: 'builderOutside', blocks: [{ x: 101, y: 66, z: 101, blockType: '' }] });
    assert.equal(cells.get('101,66,101'), undefined);
    assert.equal(game.getInventoryCount('glass'), 0);
    assert.equal(ctx.document.getElementById('claim-notice').textContent, 'El modo constructor solo sirve dentro de tu parcela o de una en la que estés invitado.');
    assert.equal(ctx.claimRefusalText({ reason: 'palette' }), 'Eso no está en la paleta del modo constructor.');
    assert.equal(ctx.claimRefusalText({ reason: 'spawn' }), 'Zona de inicio: aquí no se puede cambiar nada.');
});

test('a palette type broken in builder mode drops nothing; anything else drops as always; breaking is instant', () => {
    const { game, cells, position, moveTo } = makeGame();
    position.y = 80; // over the cells: pickups, not falling blocks
    moveTo(100, 100);
    cells.set('100,64,100', 'stone_bricks');
    cells.set('101,64,100', 'iron_ore');
    cells.set('102,64,100', 'oak_door:upper:e');
    assert.equal(game.finishBreakingBlock({ x: 100, y: 64, z: 100 }), true);
    assert.equal(game.pickups.size, 0, 'a palette type: nothing');
    game.finishBreakingBlock({ x: 102, y: 64, z: 100 });
    assert.equal(game.pickups.size, 0, 'a state of a palette item: nothing');
    game.finishBreakingBlock({ x: 101, y: 64, z: 100 });
    assert.deepEqual([...game.pickups.values()].map((pickup) => pickup.type), ['iron_ore'], 'outside the palette: as always');
    assert.equal(game.getAdjustedBreakDuration('stone', 1.5), 0, 'instant');
    assert.equal(game.getAdjustedBreakDuration('bedrock', 0), 0, 'what cannot be broken still cannot');
    assert.ok(game.builderBreakWait > 0, 'one block at a time');
    // Out of builder mode, a palette type breaks and drops as always...
    moveTo(300, 300);
    assert.ok(game.getAdjustedBreakDuration('stone', 1.5) > 0);
    cells.set('300,64,300', 'stone_bricks');
    game.finishBreakingBlock({ x: 300, y: 64, z: 300 });
    assert.equal(game.pickups.size, 2);
});

test('a cell placed from the palette drops nothing later, even with builder mode off; my own blocks there do', () => {
    const { game, cells, position, moveTo } = makeGame();
    position.y = 80;
    moveTo(100, 100);
    cells.set('101,64,101', 'grass');
    aimAt(game, 101, 64, 101);
    game.placeBlock(); // stone from the palette at (101, 65, 101)
    game.builderToggle();
    assert.equal(game.builderActive, false);
    game.finishBreakingBlock({ x: 101, y: 65, z: 101 });
    assert.equal(game.pickups.size, 0, 'turning it off is no way to get blocks');
    assert.ok(JSON.parse(stored.get('minecloud-builder-placed')).length === 0, 'and the cell is forgotten');
    // Now my own stone in the same cell, with builder mode off: it drops.
    game.selectInventoryType('stone');
    game.placeBlock();
    assert.equal(game.inventoryCounts.stone, 4);
    game.finishBreakingBlock({ x: 101, y: 65, z: 101 });
    assert.deepEqual([...game.pickups.values()].map((pickup) => pickup.type), ['cobblestone']);
});

// ---- The margin around the plot ----

test('builder mode stays on in a margin of 3 blocks around the plot, on every side and corner, and goes off beyond it', () => {
    const { game, moveTo } = makeGame();
    assert.equal(ctx.BUILDER_MARGIN, 3);
    // Ana's plot is x 92..108, z 92..108: the margin is 89..91 and 109..111.
    for (const [x, z] of [[111.9, 100], [89.1, 100], [100, 111.9], [100, 89.1], [111.5, 111.5], [89.5, 89.5]]) {
        moveTo(300, 300);
        moveTo(x, z);
        assert.equal(game.builderActive, true, `${x},${z} is in the margin`);
        assert.ok(game.builderIndicator.classList.contains('visible'), 'with the sign');
        assert.ok(slots(game).includes('∞stone_bricks'), 'and the palette');
    }
    for (const [x, z] of [[112, 100], [88.9, 100], [100, 112], [100, 88.9], [112, 112]]) {
        moveTo(100, 100);
        moveTo(x, z);
        assert.equal(game.builderActive, false, `${x},${z} is beyond`);
    }
    // A guest's plot has its margin too; someone else's does not.
    moveTo(150, 100);
    assert.equal(game.builderActive, true, 'Beto\'s margin');
    moveTo(170, 100);
    assert.equal(game.builderActive, false, 'Cris\'s margin');
    moveTo(171, 100);
    assert.equal(game.builderActive, false);
    assert.equal(ctx.builderPlotNear(plots(), 0, 0), null, 'the spawn zone');
});

test('where two of my margins meet, the plot I am in or else the nearest is the one, and builder mode does not blink', () => {
    const { game, moveTo, network } = makeGame();
    const state = plots();
    // A plot of mine only 4 free columns east of Ana's (before the 8-block rule): 113..129.
    state.claims.push({ id: 'clm_d', x: 121, y: 64, z: 100, owner: 'Ana', mine: true, minX: 113, minZ: 92, maxX: 129, maxZ: 108 });
    network.emit('claimList', state);
    assert.equal(ctx.builderPlotNear(state, 110, 100).id, 'clm_a');
    assert.equal(ctx.builderPlotNear(state, 111, 100).id, 'clm_d');
    assert.equal(ctx.builderPlotNear(state, 108, 100).id, 'clm_a', 'inside a plot, that one');
    assert.equal(ctx.builderPlotNear(state, 113, 100).id, 'clm_d');
    moveTo(105, 100);
    const notices = [];
    const notice = game.claimNotice;
    game.claimNotice = (text) => { notices.push(text); return notice.call(game, text); };
    for (let x = 105; x <= 118; x += 0.5) {
        moveTo(x, 100);
        assert.equal(game.builderActive, true, `at ${x}`);
    }
    assert.ok(!notices.some((text) => /constructor/.test(text)), 'never turned off and on');
});

test('flight and no fall damage in the margin; beyond it flight ends and the fall is harmless', () => {
    const { game, moveTo } = makeGame();
    const controller = game.cameraController;
    moveTo(110.5, 100);
    assert.equal(controller.flightAllowed, true);
    assert.equal(fallDamage(game), 0);
    controller.flying = true;
    controller.onGround = false;
    moveTo(111.5, 104);
    assert.equal(controller.flying, true, 'still flying in the margin');
    moveTo(112.5, 104);
    assert.equal(controller.flying, false);
    assert.equal(controller.flightAllowed, false);
    assert.equal(game.builderSafeFall, true);
    assert.equal(fallDamage(game), 0);
});

test('from the margin, palette placements go into the plot; one aimed at a margin cell is refused before it is sent', () => {
    const { game, cells, network, moveTo } = makeGame();
    moveTo(110.5, 100.5); // in the margin, east of the plot
    assert.equal(game.getSelectedBlockType(), 'stone', 'from the palette');
    // The plot's east wall, built from outside: against its last column's face.
    cells.set('109,64,100', 'grass'); // a margin block to click on
    game.raycastBlock = () => ({ position: { x: 109, y: 64, z: 100 }, face: { normal: { x: -1, y: 0, z: 0 } }, point: { x: 109, y: 64.5, z: 100.5 } });
    game.placeBlock();
    assert.equal(cells.get('108,64,100'), 'stone');
    assert.deepEqual(network.sent.filter(([type]) => type === 'blockPlace'), [['blockPlace', { x: 108, y: 64, z: 100, blockType: 'stone', palette: true }]]);
    // Onto the margin: nothing placed, nothing sent, and why.
    aimAt(game, 109, 64, 100);
    game.placeBlock();
    assert.equal(cells.get('109,65,100'), undefined);
    assert.equal(network.sent.filter(([type]) => type === 'blockPlace').length, 1);
    assert.equal(ctx.document.getElementById('claim-notice').textContent, 'Lo de la paleta solo va dentro de la parcela, no en el margen de alrededor.');
    assert.ok(!JSON.stringify([...game.builderPlaced]).includes('109,65,100'), 'not remembered as placed');
    const marginNotice = () => ctx.document.getElementById('claim-notice').textContent;
    const said = 'Lo de la paleta solo va dentro de la parcela, no en el margen de alrededor.';
    // A piece of several cells (a door) with one of them in the margin: refused whole.
    ctx.document.getElementById('claim-notice').textContent = '';
    game.claimNoticeText = null;
    assert.equal(game.builderPartsAllowed([{ x: 108, y: 64, z: 104 }, { x: 108, y: 65, z: 104 }]), true);
    assert.equal(game.builderPartsAllowed([{ x: 108, y: 64, z: 104 }, { x: 109, y: 64, z: 104 }]), false);
    assert.equal(marginNotice(), said);
    ctx.document.getElementById('claim-notice').textContent = '';
    game.claimNoticeText = null;
    // From inside, over the plot's edge into the margin: refused too.
    moveTo(107.5, 100.5);
    game.builderSelect('glass');
    cells.set('108,64,101', 'grass');
    game.raycastBlock = () => ({ position: { x: 108, y: 64, z: 101 }, face: { normal: { x: 1, y: 0, z: 0 } }, point: { x: 109, y: 64.5, z: 101.5 } });
    game.placeBlock();
    assert.equal(cells.get('109,64,101'), undefined);
    assert.equal(network.sent.filter(([type]) => type === 'blockPlace').length, 1);
    assert.equal(marginNotice(), said);
    // My own items, not from the palette, place in the margin as anywhere outside a plot.
    game.selectInventoryType('iron_ore');
    aimAt(game, 109, 64, 100);
    game.placeBlock();
    assert.equal(cells.get('109,65,100'), 'iron_ore');
    assert.deepEqual(network.sent.at(-1), ['blockPlace', { x: 109, y: 65, z: 100, blockType: 'iron_ore' }]);
});

test('a block broken in the margin is not under the palette rules: it takes its time, drops, and protection is as before', () => {
    const { game, cells, position, moveTo } = makeGame();
    position.y = 80;
    moveTo(110.5, 100.5);
    assert.equal(game.builderActive, true);
    cells.set('110,64,100', 'stone_bricks');
    cells.set('100,64,100', 'stone_bricks');
    assert.ok(game.getAdjustedBreakDuration('stone_bricks', 1.5, { x: 110, y: 64, z: 100 }) > 0, 'not instant in the margin');
    assert.equal(game.getAdjustedBreakDuration('stone_bricks', 1.5, { x: 100, y: 64, z: 100 }), 0, 'instant inside');
    assert.equal(game.finishBreakingBlock({ x: 110, y: 64, z: 100 }), true);
    assert.deepEqual([...game.pickups.values()].map((pickup) => pickup.type), ['stone_bricks'], 'it drops');
    assert.equal(game.builderBreakWait, 0, 'no builder pause after it');
    game.finishBreakingBlock({ x: 100, y: 64, z: 100 });
    assert.equal(game.pickups.size, 1, 'inside the plot: nothing, as before');
    // Nobody's ground: no refusal there, as before; someone else's plot is still refused.
    assert.equal(game.claimRefusalAt(110, 100), null);
    assert.deepEqual(plain(game.claimRefusalAt(180, 100)), { reason: 'claim', owner: 'Cris' });
});

// ---- Flight and falls ----

test('flight and no fall damage in builder mode; walking out in the air lands without harm, once', () => {
    const { game, moveTo, frame } = makeGame();
    const controller = game.cameraController;
    frame();
    assert.equal(controller.flightAllowed, false);
    assert.ok(fallDamage(game) > 0);
    moveTo(100, 100);
    assert.equal(controller.flightAllowed, true);
    assert.equal(fallDamage(game), 0);
    controller.flying = true;
    controller.onGround = false;
    moveTo(120, 100);
    assert.equal(controller.flying, false, 'flight ends at the border');
    assert.equal(controller.flightAllowed, false);
    assert.equal(game.builderSafeFall, true);
    frame(); frame();
    assert.equal(fallDamage(game), 0, 'the landing does no harm');
    assert.ok(fallDamage(game) > 0, 'only that one');
    // Or it ends on the ground, after a moment there.
    moveTo(100, 100);
    controller.onGround = false;
    moveTo(120, 100);
    controller.onGround = true;
    for (let i = 0; i < 40; i++) frame();
    assert.equal(game.builderSafeFall, false);
    assert.ok(fallDamage(game) > 0);
    // Creative mode keeps its own flight.
    game.creativeMode = true;
    frame();
    assert.equal(controller.flightAllowed, true);
});

test('touch reuses the creative flight controls: a double tap on Jump, with Up and Down', () => {
    const touch = fs.readFileSync(path.join(STATIC, 'js', 'game', 'touch.js'), 'utf8');
    assert.match(touch, /controller\.pressJump\(\)/);
    assert.match(touch, /flying \? 'Up' : 'Jump'/);
    assert.match(fs.readFileSync(path.join(STATIC, 'js', 'game', 'cinematic.js'), 'utf8'), /flightAllowed = Boolean\(this\.creativeMode \|\| this\.builderActive\)/);
});

// ---- Nothing missing ----

test('every line is in both languages, different, and used; it loads after claims.js', () => {
    const keys = Object.keys(ctx.BUILDER_TEXT);
    for (const key of keys) {
        const { ES, EN, ...rest } = ctx.BUILDER_TEXT[key];
        assert.deepEqual(Object.keys(rest), [], key);
        assert.ok(ES && EN, `${key} in both`);
        assert.notEqual(ES, EN, key);
        assert.ok(SOURCE.split(`'${key}'`).length > 1 || SOURCE.includes(`'${key}' :`) || new RegExp(`\\b${key}\\b`).test(SOURCE.split('const BUILDER_TEXT')[1].split('};').slice(1).join('};')), `${key} is said nowhere`);
    }
    for (const [, key] of SOURCE.matchAll(/builderSay\('(\w+)'/g)) assert.ok(ctx.BUILDER_TEXT[key], `builderSay('${key}') has no line`);
    const scripts = [...HTML.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(scripts.indexOf('js/game/builder.js') > scripts.indexOf('js/game/claims.js'));
    assert.ok(scripts.indexOf('js/game/builder.js') > scripts.indexOf('js/game/building.js'));
});
