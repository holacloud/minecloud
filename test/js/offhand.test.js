// Node tests for the left hand (js/game/offhand.js): the slot's steps, what a save holds, that no unit is made or
// lost by a swap, a drop, a death, a chest or a recipe, the key, the light, the readings of either hand and what
// goes to other players. The game's own code runs on a stand-in for the browser: how it looks is for the game.
// Run with: node --test test/js/offhand.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const JS = path.join(STATIC, 'js');
const GUIDE = path.join(STATIC, 'guide');

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; this.w = 0; }
    set(x, y, z, w = 0) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
}
class Object3D {
    constructor() { this.position = new Vector3(); this.rotation = new Vector3(); this.userData = {}; this.children = []; this.visible = true; }
    add(child) { this.children.push(child); }
    remove(child) { this.children = this.children.filter((other) => other !== child); }
    traverse(fn) { fn(this); this.children.forEach((child) => child.traverse(fn)); }
}
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
    const stored = new Map();
    const THREE = new Proxy({ Vector3, Vector2: Vector3, Vector4: Vector3 }, { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const context = vm.createContext({
        console: { ...console, warn() {} }, Math, Map, WeakMap, Set, Object, Array, JSON, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array,
        Int8Array, Int16Array, Int32Array, Float32Array, Float64Array,
        performance: { now: () => 0 }, THREE, navigator: {}, requestAnimationFrame: () => 0, addEventListener() {},
        Worker: class { postMessage() {} terminate() {} },
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; } },
        document: { createElement: (tag) => (tag === 'canvas' ? canvasStub() : anyStub()), addEventListener() {}, body: anyStub(), head: anyStub(), getElementById: () => null, querySelector: () => null },
        localStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) }
    });
    context.window = context;
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]).filter((src) => !/^(https?:)?\/\//.test(src));
    assert.ok(scripts.includes('js/game/offhand.js'), 'index.html loads offhand.js');
    for (const src of scripts) {
        if (/voice\.js|guideMarkdown/.test(src)) continue;
        vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    }
    vm.runInContext(`Object.assign(this, { Game, WorldRenderer, NetworkClient, DAMAGE_MODIFIERS, BLOCK_TYPES, OFFHAND_ITEMS, offhandCanHold, offhandSend, offhandTakeBack, offhandSwap, offhandFromSave,
        handsInList, carriedLightOf, nearestCarriedLights, carriedLampWithin, CARRIED_REMOTE_LIGHTS });`, context);
    context.stored = stored;
    return context;
}

const ctx = loadGame();
const plain = (value) => JSON.parse(JSON.stringify(value));

const BLOCK_DEFS = {
    torch: { name: 'Torch' }, lantern: { name: 'Lantern' }, candle: { name: 'Candle' }, stone: { name: 'Stone' }, iron_hoe: { name: 'Iron Hoe', itemOnly: true },
    multimeter: { name: 'Multimeter', itemOnly: true }, thermometer: { name: 'Thermometer', itemOnly: true }, barometer: { name: 'Barometer', itemOnly: true },
    firefly_jar: { name: 'Firefly Jar', itemOnly: true }, helium_balloon: { name: 'Helium Balloon', itemOnly: true }
};

function makeGame(counts = {}, overrides = {}) {
    const game = Object.create(ctx.Game.prototype);
    const inventory = Object.keys(counts);
    const messages = [];
    const pickups = [];
    Object.assign(game, {
        inventory, inventoryCounts: { ...counts }, selectedSlot: 0, hotbarPinnedTypes: [], hotbarPrimaryType: null, hotbarSize: 8, offhandType: null,
        hotbarSlotElements: [], hotbarCountElements: [], craftingRecipes: [], inventoryOpen: false, craftingOpen: false, inventorySearchTerm: '', craftingSearchTerm: '',
        camera: { position: new Vector3(0, 10, 0), getWorldDirection: (v) => v },
        cameraController: { eyeHeight: 1.6, keys: {} }, otherPlayerMeshes: new Map(),
        world: { blockTypes: BLOCK_DEFS, getInventoryIconUrl: () => 'icon', createDisplayMesh: () => new Object3D() },
        receiveSystemMessage: (message) => messages.push(message.text), playTone() {}, playPlaceSound() {}, spawnPickup: (type, _at, amount) => pickups.push({ type, amount }),
        messages, pickups
    }, overrides);
    return game;
}
const select = (game, type) => { game.selectedSlot = game.inventory.indexOf(type); };
const owned = (game, type) => game.getInventoryCount(type) + (game.offhandType === type ? 1 : 0);

// ---- The steps ----

test('sending moves one unit and brings back what the hand held', () => {
    const state = { counts: { torch: 3, multimeter: 1 }, offhand: null };
    assert.equal(ctx.offhandSend(state, 'torch'), true);
    assert.deepEqual(plain(state), { counts: { torch: 2, multimeter: 1 }, offhand: 'torch' });
    assert.equal(ctx.offhandSend(state, 'multimeter'), true);
    assert.deepEqual(plain(state), { counts: { torch: 3, multimeter: 0 }, offhand: 'multimeter' });
});

test('nothing moves without a unit, or with an item the hand cannot take', () => {
    const state = { counts: { torch: 0, stone: 9 }, offhand: 'lantern' };
    assert.equal(ctx.offhandSend(state, 'torch'), false);
    assert.equal(ctx.offhandSend(state, 'stone'), false);
    assert.equal(ctx.offhandSend(state, 'constructor'), false, 'names on Object.prototype are not items');
    assert.deepEqual(plain(state), { counts: { torch: 0, stone: 9 }, offhand: 'lantern' });
});

test('taking back gives the unit to a count that may not exist yet', () => {
    const state = { counts: {}, offhand: 'candle' };
    assert.equal(ctx.offhandTakeBack(state), 'candle');
    assert.deepEqual(plain(state), { counts: { candle: 1 }, offhand: null });
    assert.equal(ctx.offhandTakeBack(state), null);
});

test('the X key: every case of what each hand holds', () => {
    const cases = [
        // right, left, counts -> outcome, select, left after, counts after
        [null, null, { torch: 0 }, 'nothing', null, null, { torch: 0 }],
        [null, 'torch', { torch: 0 }, 'taken', 'torch', null, { torch: 1 }],
        ['stone', 'torch', { stone: 5, torch: 0 }, 'refused', null, 'torch', { stone: 5, torch: 0 }],
        ['stone', null, { stone: 5 }, 'refused', null, null, { stone: 5 }],
        ['torch', null, { torch: 1 }, 'sent', null, 'torch', { torch: 0 }],
        ['torch', 'torch', { torch: 4 }, 'returned', null, null, { torch: 5 }],
        ['torch', 'multimeter', { torch: 2, multimeter: 0 }, 'swapped', 'multimeter', 'torch', { torch: 1, multimeter: 1 }]
    ];
    for (const [right, left, counts, outcome, chosen, leftAfter, countsAfter] of cases) {
        const state = { counts: { ...counts }, offhand: left };
        const result = ctx.offhandSwap(state, right);
        const label = `${right} / ${left}`;
        assert.equal(result.outcome, outcome, label);
        assert.equal(result.select, chosen, label);
        assert.equal(state.offhand, leftAfter, label);
        assert.deepEqual(plain(state.counts), countsAfter, label);
    }
});

test('no sequence of moves makes or loses a unit', () => {
    let seed = 12345;
    const random = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const types = ['torch', 'lantern', 'multimeter', 'stone'];
    const state = { counts: { torch: 2, lantern: 1, multimeter: 1, stone: 3 }, offhand: null };
    const total = () => types.reduce((sum, type) => sum + state.counts[type] + (state.offhand === type ? 1 : 0), 0);
    const perType = (type) => state.counts[type] + (state.offhand === type ? 1 : 0);
    const start = types.map(perType);
    for (let i = 0; i < 5000; i++) {
        const type = types[random(types.length)];
        const step = random(3);
        if (step === 0) ctx.offhandSend(state, type);
        else if (step === 1) ctx.offhandTakeBack(state);
        else ctx.offhandSwap(state, state.counts[type] > 0 ? type : null);
        assert.ok(types.every((one) => state.counts[one] >= 0), 'no count below zero');
        assert.equal(total(), 7);
    }
    assert.deepEqual(types.map(perType), start);
});

// ---- The game's own code ----

test('the key sends the selected item, and the right hand is empty after the last unit', () => {
    const game = makeGame({ torch: 1, stone: 2 });
    select(game, 'torch');
    game.offhandSwapSelected();
    assert.equal(game.offhandType, 'torch');
    assert.equal(game.getInventoryCount('torch'), 0);
    assert.equal(game.getSelectedHeldItemType(), null, 'the only torch is not in two hands');
    assert.deepEqual(game.messages, ['Left hand: Torch']);
});

test('a swap puts the other item in the right hand, on the hotbar', () => {
    const game = makeGame({ torch: 3, multimeter: 1 });
    select(game, 'multimeter');
    game.offhandSwapSelected();
    select(game, 'torch');
    game.offhandSwapSelected();
    assert.equal(game.offhandType, 'torch');
    assert.equal(game.getSelectedHeldItemType(), 'multimeter');
    assert.equal(game.getInventoryCount('torch'), 2);
    assert.equal(game.getInventoryCount('multimeter'), 1);
});

test('an item that cannot be held is refused and says so', () => {
    const game = makeGame({ iron_hoe: 1, torch: 1 });
    game.offhandType = 'lantern';
    select(game, 'iron_hoe');
    game.offhandSwapSelected();
    assert.equal(game.offhandType, 'lantern');
    assert.equal(game.getInventoryCount('iron_hoe'), 1);
    assert.match(game.messages[0], /Iron Hoe cannot be held/);
});

test('Shift + X and the panel put it away, and the panel button sends without closing', () => {
    const game = makeGame({ torch: 2, stone: 1 });
    select(game, 'stone');
    game.offhandSendType('torch');
    assert.equal(game.offhandType, 'torch');
    assert.equal(game.getSelectedHeldItemType(), 'stone', 'the right hand does not change');
    game.offhandSwapSelected(true);
    assert.equal(game.offhandType, null);
    assert.equal(game.getInventoryCount('torch'), 2);
    game.offhandPutAway();
    assert.equal(game.getInventoryCount('torch'), 2, 'an empty hand gives nothing back');
});

test('dropping with Q never reaches the unit in the hand', () => {
    const game = makeGame({ torch: 2 });
    select(game, 'torch');
    game.offhandSwapSelected();
    game.dropSelectedBlock();
    game.dropSelectedBlock();
    assert.equal(game.pickups.length, 1, 'only what was in the count falls');
    assert.equal(game.getInventoryCount('torch'), 0);
    assert.equal(game.offhandType, 'torch');
});

test('placing the last torch of the count leaves the one in the hand', () => {
    const game = makeGame({ torch: 2 });
    select(game, 'torch');
    game.offhandSwapSelected();
    assert.equal(game.consumeSelectedBlock(), true);
    assert.equal(game.consumeSelectedBlock(), false);
    assert.equal(game.offhandType, 'torch');
    assert.equal(owned(game, 'torch'), 1);
});

test('a recipe cannot spend the unit in the hand', () => {
    const recipe = { id: 'lamp', name: 'Lamp', output: { type: 'lantern', amount: 1 }, inputs: [{ type: 'torch', amount: 1 }] };
    const game = makeGame({ torch: 1, lantern: 0 }, { craftingRecipes: [recipe] });
    select(game, 'torch');
    game.offhandSwapSelected();
    assert.equal(game.canCraftRecipe(recipe), false);
    game.craftRecipe('lamp');
    assert.equal(game.offhandType, 'torch');
    assert.equal(game.getInventoryCount('lantern'), 0);
    game.addInventory('torch', 1);
    game.craftRecipe('lamp');
    assert.equal(game.getInventoryCount('lantern'), 1);
    assert.equal(game.getInventoryCount('torch'), 0);
    assert.equal(game.offhandType, 'torch', 'the last one in the count was spent, not the one in the hand');
});

test('a chest takes all of the count and nothing of the hand', () => {
    const sent = [];
    const game = makeGame({ torch: 4 }, {
        storageAt: { x: 1, y: 2, z: 3 }, storageMode: 0, storagePending: new Map(),
        network: { connected: true, send: (kind, payload) => sent.push({ kind, payload }) }
    });
    select(game, 'torch');
    game.offhandSwapSelected();
    game.storagePut('torch');
    const amount = sent[0].payload.amount;
    assert.ok(amount >= 1 && amount <= 3);
    assert.equal(owned(game, 'torch') + amount, 4, 'what went to the chest and what stayed still add up');
    assert.equal(game.offhandType, 'torch');
});

test('dying and coming back changes neither the hand nor the counts', () => {
    const game = makeGame({ torch: 3 }, {
        maxHealth: 20, health: 1, stopMining() {}, resetMiningBlockVisual() {}, closeChatInput() {}, closeSignReader() {}, updateDeathScreen() {},
        updateHealthUI() {}, saveLastSafePosition() {}, flashDamageIndicator() {},
        cameraController: { eyeHeight: 1.6, keys: {}, setPosition() {}, getPosition: () => ({ x: 0, y: 0, z: 0 }), velocityY: 0 }
    });
    select(game, 'torch');
    game.offhandSwapSelected();
    game.applyDamage(99, 'You died', 'void');
    assert.equal(game.respawnPending, true);
    game.respawnPlayer();
    assert.equal(game.offhandType, 'torch');
    assert.equal(game.getInventoryCount('torch'), 2);
});

test('the save keeps the hand, in one piece with the counts', () => {
    const game = makeGame({ torch: 5, stone: 1 });
    select(game, 'torch');
    game.offhandSwapSelected();
    game.saveInventoryState();
    const saved = JSON.parse(ctx.stored.get('minecloud-inventory-state'));
    assert.equal(saved.offhand, 'torch');
    assert.equal(saved.counts.torch, 4);

    const back = makeGame({ torch: 0, stone: 0 });
    back.restoreInventoryState();
    assert.equal(back.offhandType, 'torch');
    assert.equal(owned(back, 'torch'), 5);
    assert.equal(back.getInventoryCount('stone'), 1);
});

test('saves from before the left hand, and bad ones, leave it empty', () => {
    const counts = { torch: 3 };
    for (const saved of [undefined, null, 7, '', {}, []]) assert.equal(ctx.offhandFromSave(saved, counts), null);
    assert.deepEqual(plain(counts), { torch: 3 });

    ctx.stored.set('minecloud-inventory-state', JSON.stringify({ inventory: ['torch'], counts: { torch: 3 } }));
    const game = makeGame({ torch: 0 });
    game.restoreInventoryState();
    assert.equal(game.offhandType, null);
    assert.equal(game.getInventoryCount('torch'), 3);
});

test('a saved item that can no longer be held goes back to the inventory', () => {
    ctx.stored.set('minecloud-inventory-state', JSON.stringify({ inventory: ['stone'], counts: { stone: 2 }, offhand: 'stone' }));
    const game = makeGame({ stone: 0 });
    game.restoreInventoryState();
    assert.equal(game.offhandType, null);
    assert.equal(game.getInventoryCount('stone'), 3);
});

test('a saved item this game does not know is pruned like any other', () => {
    const game = makeGame({ torch: 1 });
    game.offhandType = 'lantern';
    game.world = { blockTypes: { torch: {} } };
    game.pruneUnknownInventoryTypes();
    assert.equal(game.offhandType, null);
});

// ---- The key ----

function press(game, code, extra = {}) {
    const event = { code, key: '', repeat: false, shiftKey: false, target: {}, preventDefault() {}, ...extra };
    game.onKeyDown(event);
}

test('X runs in play, and Shift + X puts away', () => {
    const calls = [];
    const game = makeGame({ torch: 1 }, { isGameplayActive: () => true, offhandSwapSelected: (clear) => calls.push(clear) });
    press(game, 'KeyX');
    press(game, 'KeyX', { shiftKey: true });
    assert.deepEqual(calls, [false, true]);
});

test('X does nothing while typing, in a panel, on repeat or out of play', () => {
    const calls = [];
    const make = (overrides = {}) => makeGame({ torch: 1 }, { isGameplayActive: () => true, offhandSwapSelected: () => calls.push(1), ...overrides });
    press(make(), 'KeyX', { target: { tagName: 'INPUT', type: 'text' } });
    press(make(), 'KeyX', { repeat: true });
    press(make({ inventoryOpen: true }), 'KeyX');
    press(make({ craftingOpen: true }), 'KeyX');
    press(make({ chatOpen: true }), 'KeyX');
    press(make({ isGameplayActive: () => false }), 'KeyX');
    assert.deepEqual(calls, []);
});

test('nothing else in the game listens to X', () => {
    const files = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js')) files.push(full);
    });
    walk(JS);
    const users = files.filter((file) => fs.readFileSync(file, 'utf8').includes("'KeyX'"));
    assert.deepEqual(users.map((file) => path.relative(JS, file)), ['game.js']);
});

// ---- Light ----

test('the stronger light of the two hands counts, the right hand on a tie', () => {
    assert.equal(ctx.carriedLightOf(null, null), null);
    assert.equal(ctx.carriedLightOf('stone', 'multimeter'), null);
    assert.deepEqual(plain(ctx.carriedLightOf('stone', 'torch')), { type: 'torch', level: 14, hand: 'left' });
    assert.deepEqual(plain(ctx.carriedLightOf('candle', 'torch')), { type: 'torch', level: 14, hand: 'left' });
    assert.deepEqual(plain(ctx.carriedLightOf('lantern', 'candle')), { type: 'lantern', level: 13, hand: 'right' });
    assert.deepEqual(plain(ctx.carriedLightOf('torch', 'torch')), { type: 'torch', level: 14, hand: 'right' });
    assert.equal(ctx.carriedLightOf('constructor', 'toString'), null, 'a name from another client is not a light');
});

test('the levels are those of the same blocks placed', () => {
    assert.equal(ctx.OFFHAND_ITEMS.candle.level, ctx.BLOCK_TYPES.candle.lightEmission);
    assert.equal(ctx.OFFHAND_ITEMS.lantern.level, ctx.BLOCK_TYPES.lantern.lightEmission);
    assert.equal(ctx.OFFHAND_ITEMS.torch.level, 14, 'a torch gives 14 (registry default)');
});

function lightGame(counts, overrides = {}) {
    const lights = [];
    const game = makeGame(counts, {
        heldTorchLight: { intensity: 0, distance: 8, position: { x: 0.45 } },
        ...overrides
    });
    game.world.setCarriedLights = (list) => lights.push(plain(list));
    game.world = { ...game.world };
    return { game, lights };
}

test('a torch in the left hand gives what a torch in the right always did, on the left', () => {
    const { game, lights } = lightGame({ stone: 1, torch: 0 });
    game.offhandType = 'torch';
    game.carriedLightUpdate();
    assert.equal(game.heldTorchLight.intensity, 1.45);
    assert.equal(game.heldTorchLight.distance, 8);
    assert.equal(game.heldTorchLight.position.x, -0.45);
    assert.deepEqual(lights.at(-1), [{ x: 0, y: 10, z: 0, level: 14 }]);

    game.offhandType = null;
    game.inventoryCounts.torch = 1;
    select(game, 'torch');
    game.carriedLightUpdate();
    assert.equal(game.heldTorchLight.intensity, 1.45);
    assert.equal(game.heldTorchLight.position.x, 0.45);
});

test('with no light in hand the point light is off: shadows look at that', () => {
    const { game, lights } = lightGame({ stone: 1 });
    game.carriedLightUpdate();
    assert.equal(game.heldTorchLight.intensity, 0);
    assert.deepEqual(lights.at(-1), []);
    const shadows = fs.readFileSync(path.join(JS, 'game', 'shadows.js'), 'utf8');
    assert.match(shadows, /heldTorchLight\.intensity > 0/);
});

test('a weaker light reaches less and is dimmer', () => {
    const { game } = lightGame({ stone: 1 });
    game.offhandType = 'candle';
    game.carriedLightUpdate();
    assert.ok(Math.abs(game.heldTorchLight.intensity - 1.45 * 9 / 14) < 1e-9);
    assert.ok(Math.abs(game.heldTorchLight.distance - 8 * 9 / 14) < 1e-9);
});

test('other players take the two slots left, nearest first, within range', () => {
    const sources = [{ x: 30, y: 0, z: 0, level: 14 }, { x: 5, y: 0, z: 0, level: 9 }, { x: 10, y: 0, z: 0, level: 13 }, { x: 41, y: 0, z: 0, level: 14 }];
    assert.deepEqual(plain(ctx.nearestCarriedLights(0, 0, 0, sources)).map((one) => one.x), [5, 10]);
    assert.deepEqual(plain(ctx.nearestCarriedLights(0, 0, 0, sources.slice(3))), []);
    assert.equal(ctx.CARRIED_REMOTE_LIGHTS, 2);

    const avatar = (x, level) => { const one = new Object3D(); one.position.set(x, 0, 0); one.userData.carriedLevel = level; return one; };
    const { game, lights } = lightGame({ stone: 1 }, { otherPlayerMeshes: new Map([['a', avatar(30, 14)], ['b', avatar(5, 9)], ['c', avatar(2, 0)]]) });
    game.offhandType = 'torch';
    game.carriedLightUpdate();
    assert.deepEqual(lights.at(-1).map((one) => [one.x, one.level]), [[0, 14], [5, 9], [30, 14]]);
    assert.equal(lights.at(-1)[1].y, 1.1, 'at the hand, not at the feet');
});

test('the terrain shader gets the slots: reach by level, free ones at zero', () => {
    const world = { carriedLights: { value: [new Vector3(), new Vector3(), new Vector3()] } };
    ctx.WorldRenderer.prototype.setCarriedLights.call(world, [{ x: 1, y: 2, z: 3, level: 14 }, { x: 4, y: 5, z: 6, level: 7 }]);
    const [first, second, third] = world.carriedLights.value;
    assert.deepEqual([first.x, first.y, first.z, first.w], [1, 2, 3, 9]);
    assert.equal(second.w, 4.5);
    assert.equal(third.w, 0);
    ctx.WorldRenderer.prototype.setCarriedLights.call(world, []);
    assert.equal(first.w, 0);
});

test('the shader needs no remeshing, and a torch there is the old torch', () => {
    const source = fs.readFileSync(path.join(JS, 'world.js'), 'utf8');
    assert.doesNotMatch(source, /heldLightPosition|heldLightStrength|setHeldLight/);
    assert.match(source, /uniform vec4 carriedLights\[3\]/);
    // Before: pow(clamp(1 - d / 9), 2) * 0.9. Now reach = 14 * 9 / 14 = 9, and strength = reach * 0.1.
    assert.match(source, /carried \* carried \* carriedLights\[i\]\.w \* 0\.1/);
    assert.match(source, /light\.level \* 9 \/ 14/);
    const offhand = fs.readFileSync(path.join(JS, 'game', 'offhand.js'), 'utf8');
    assert.doesNotMatch(offhand, /\.invalidate\(|\.setBlock|markDirty/);
});

test('a microscope counts a light in the hand only when near', () => {
    const torch = ctx.carriedLightOf('torch', null);
    const at = { x: 0, y: 0, z: 0 };
    assert.equal(ctx.carriedLampWithin(null, { x: 0, y: 1, z: 0 }, at), null);
    assert.deepEqual(plain(ctx.carriedLampWithin(torch, { x: 2, y: 1.6, z: 1 }, at)), { level: 14, type: 'torch' });
    assert.equal(ctx.carriedLampWithin(torch, { x: 4, y: 1.6, z: 0 }, at), null);
});

test('the microscope reads it, in the dark and with the game\'s own sums', () => {
    const game = makeGame({ stone: 1 }, { microscopeAt: { x: 0, y: 0, z: 0 }, daylight: 0, microscopeRenderControls() {} });
    game.world = {
        blockTypes: BLOCK_DEFS, getBlockTypeAt: () => null, isLightEmitterType: () => false, getBlockId: () => 1,
        registry: { solid: [0, 1], transparent: [0, 0], lightLevel: [0, 0], id: () => 0 }
    };
    game.camera.position.set(1, 1, 1);
    game.microscopeReadLight();
    assert.equal(game.microscopeLight.source, null, 'nothing in hand: black');
    game.offhandType = 'candle';
    game.microscopeReadLight();
    assert.equal(game.microscopeLight.source, 'lamp');
    assert.equal(game.microscopeLight.name, 'Candle');
    assert.ok(Math.abs(game.microscopeLight.level - (0.45 + (9 / 14) * 0.5)) < 1e-9);
    game.camera.position.set(9, 1, 1);
    game.microscopeReadLight();
    assert.equal(game.microscopeLight.source, null, 'held too far away');
});

// ---- Readings ----

test('the same instrument in both hands reads once, two different ones both', () => {
    const list = ['thermometer', 'barometer', 'anemometer'];
    assert.deepEqual(plain(ctx.handsInList('thermometer', 'thermometer', list)), ['thermometer']);
    assert.deepEqual(plain(ctx.handsInList('thermometer', 'barometer', list)), ['thermometer', 'barometer']);
    assert.deepEqual(plain(ctx.handsInList('stone', 'barometer', list)), ['barometer']);
    assert.deepEqual(plain(ctx.handsInList(null, null, list)), []);
});

function weatherGame(counts, left) {
    const panels = [];
    const game = makeGame(counts, {
        isGameplayActive: () => true, weatherRaycastStation: () => null, weatherDescribe: (item) => [[item, '1']],
        weatherRenderPanel: (title, lines) => panels.push([title, lines ? plain(lines) : lines])
    });
    game.offhandType = left;
    game.weatherRefreshPanel();
    return panels.at(-1);
}

test('the weather panel reads either hand, in one panel', () => {
    assert.deepEqual(weatherGame({ stone: 1 }, 'thermometer'), ['Thermometer', [['thermometer', '1']]]);
    assert.deepEqual(weatherGame({ thermometer: 1 }, 'thermometer'), ['Thermometer', [['thermometer', '1']]]);
    assert.deepEqual(weatherGame({ thermometer: 1 }, 'barometer'), ['Thermometer + Barometer', [['thermometer', '1'], ['barometer', '1']]]);
    assert.equal(weatherGame({ stone: 1 }, null)[0], null);
    assert.equal(weatherGame({ stone: 1 }, 'torch')[0], null);
});

test('the weather panel moves above the multimeter\'s when both show', () => {
    const weather = { style: { opacity: '1', bottom: '84px' } };
    const multimeter = { style: { opacity: '1' }, offsetHeight: 100 };
    const game = makeGame({}, { weatherPanelElement: weather, electricPanelElement: multimeter });
    game.weatherStackPanel();
    assert.equal(weather.style.bottom, '190px');
    multimeter.style.opacity = '0';
    game.weatherStackPanel();
    assert.equal(weather.style.bottom, '84px');
});

function meterGame(counts, left, lookingAt) {
    const sent = [];
    const panels = [];
    const game = makeGame(counts, {
        isGameplayActive: () => true, electricListen() {}, electricUpdateRotors() {}, breakDistance: 4.5,
        raycastBlock: () => (lookingAt.block ? { block: lookingAt.block } : null),
        network: { connected: true, send: (kind, payload) => sent.push([kind, plain(payload)]) },
        electricRenderPanel: (title) => panels.push(title)
    });
    game.world = { ...game.world, getBlockPositionFromIntersection: (hit) => hit.block, getBlockTypeAt: (x) => (x === 1 ? 'copper_wire' : 'stone') };
    game.offhandType = left;
    return { game, sent, panels };
}

test('a multimeter in the left hand reads what the player looks at, without a click', () => {
    const look = { block: { x: 1, y: 0, z: 0 } };
    const { game, sent, panels } = meterGame({ stone: 1 }, 'multimeter', look);
    game.electricUpdate(0.3);
    assert.deepEqual(sent, [['powerProbe', { x: 1, y: 0, z: 0 }]]);
    assert.equal(panels.at(-1), 'Multimeter');

    look.block = { x: 2, y: 0, z: 0 };
    game.electricUpdate(0.3);
    assert.equal(game.electricProbeTarget, null, 'not an electric block: no reading');
    assert.equal(panels.at(-1), null);

    look.block = null;
    sent.length = 0;
    game.electricUpdate(0.3);
    assert.deepEqual(sent, []);
});

test('a multimeter in the right hand alone still waits for the click', () => {
    const { game, sent } = meterGame({ multimeter: 1 }, null, { block: { x: 1, y: 0, z: 0 } });
    game.electricUpdate(0.3);
    assert.deepEqual(sent, []);
    assert.equal(game.electricProbeTarget ?? null, null);
});

test('the same multimeter in both hands probes once a second, not twice', () => {
    const { game, sent } = meterGame({ multimeter: 1 }, 'multimeter', { block: { x: 1, y: 0, z: 0 } });
    for (let i = 0; i < 4; i++) game.electricUpdate(0.25);
    assert.equal(sent.length, 1);
});

test('leaving play stops the readings', () => {
    const { game, panels } = meterGame({ stone: 1 }, 'multimeter', { block: { x: 1, y: 0, z: 0 } });
    game.electricUpdate(0.3);
    game.isGameplayActive = () => false;
    game.electricUpdate(0.3);
    assert.equal(game.electricProbeTarget, null);
    assert.equal(panels.at(-1), null);
});

test('a balloon in the left hand saves from a fall', () => {
    const fall = (left, right) => {
        const game = makeGame(right ? { [right]: 1 } : { stone: 1 });
        game.offhandType = left;
        return ctx.DAMAGE_MODIFIERS.reduce((amount, modifier) => modifier.call(game, amount, 'fall', 'x'), 5);
    };
    assert.equal(fall('helium_balloon'), 0);
    assert.equal(fall(null, 'helium_balloon'), 0);
    assert.ok(fall('torch') > 0);
});

test('a torch in the left hand smokes the bees while the right takes the honeycomb', () => {
    const angered = [];
    const hive = { userData: { colony: { anger: 5 } }, position: new Vector3() };
    const game = makeGame({ stone: 1 }, { resourcesDrop() {}, playNoiseBurst() {}, provokeColony: (one) => angered.push(one) });
    game.offhandType = 'torch';
    game.resourcesTakeHoneycomb(hive, 'stone', 1e9);
    assert.equal(hive.userData.colony.anger, 0);
    assert.deepEqual(angered, []);
});

// ---- Drawing and the network ----

test('the left hand\'s item is the right hand\'s mirrored, and rebuilt when the mode changes', () => {
    const anchor = new Object3D();
    const game = makeGame({ stone: 1 }, { firstPersonOffhandAnchor: anchor, disposeObject3D() {} });
    game.offhandType = 'multimeter';
    game.refreshHeldItemMesh();
    const first = anchor.children[0];
    assert.deepEqual([first.position.x, first.position.y, first.position.z], [-0.34, -0.14, -0.02]);
    assert.deepEqual([first.rotation.x, first.rotation.y, first.rotation.z], [0.24, -0.64, -0.08]);
    assert.equal(first.renderOrder, 10001);

    game.refreshHeldItemMesh();
    assert.equal(anchor.children[0], first, 'not rebuilt when nothing changed');
    game.refreshHeldItemMesh(true);
    assert.notEqual(anchor.children[0], first, 'RTX and Ultra rebuild it (forceRebuild)');
    assert.equal(anchor.children.length, 1);

    game.offhandType = null;
    game.refreshHeldItemMesh();
    assert.equal(anchor.children.length, 0);
});

test('avatars carry it on the left arm, and the right arm stays the right hand\'s', () => {
    const leftArm = new Object3D();
    const rightArm = new Object3D();
    const avatar = new Object3D();
    avatar.userData.avatarParts = { leftArm, rightArm };
    const game = makeGame({}, { disposeObject3D() {} });
    game.updateAvatarOffhandItem(avatar, 'torch');
    assert.equal(leftArm.children.length, 1);
    assert.equal(rightArm.children.length, 0);
    game.updateAvatarOffhandItem(avatar, 'torch');
    assert.equal(leftArm.children.length, 1);
    game.updateAvatarOffhandItem(avatar, null);
    assert.equal(leftArm.children.length, 0);
});

test('another player\'s hand: old clients send nothing, and only what can be held is drawn', () => {
    const avatar = new Object3D();
    avatar.userData.avatarParts = { leftArm: new Object3D() };
    const game = makeGame({}, { disposeObject3D() {} });

    game.offhandApplyRemote(avatar, { heldItem: 'stone' });
    assert.equal(avatar.userData.offhandItemType ?? null, null);
    assert.equal(avatar.userData.carriedLevel, 0);

    game.offhandApplyRemote(avatar, { heldItem: 'stone', offhandItem: 'torch' });
    assert.equal(avatar.userData.offhandItemType, 'torch');
    assert.equal(avatar.userData.carriedLevel, 14);

    for (const bad of ['stone', 'constructor', 'no_such_item', 42, null]) {
        game.offhandApplyRemote(avatar, { offhandItem: bad });
        assert.equal(avatar.userData.offhandItemType, null, String(bad));
    }

    game.offhandApplyRemote(avatar, { heldItem: 'lantern' });
    assert.equal(avatar.userData.carriedLevel, 13, 'a light in the right hand reaches the terrain too');
});

test('playerMove says what the left hand holds, and old calls still work', () => {
    const client = Object.create(ctx.NetworkClient.prototype);
    const sent = [];
    client.send = (kind, payload) => sent.push([kind, plain(payload)]);
    client.updatePosition({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, 'stone', '', null, 'torch');
    client.updatePosition({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, 'stone');
    assert.equal(sent[0][1].offhandItem, 'torch');
    assert.equal(sent[0][1].heldItem, 'stone');
    assert.equal(sent[1][1].offhandItem, '');
});

test('the mirrors and third person go through the avatar that gets the item', () => {
    const avatars = fs.readFileSync(path.join(JS, 'game', 'avatars.js'), 'utf8');
    const local = avatars.slice(avatars.indexOf('updateLocalPlayerAvatar(anchor'), avatars.indexOf('updateAvatarHeldItem(avatar, type)'));
    assert.match(local, /updateAvatarOffhandItem\(this\.localPlayerAvatar, this\.offhandType\)/);
    const mirrors = fs.readFileSync(path.join(JS, 'game', 'mirrors.js'), 'utf8');
    assert.match(mirrors, /this\.updateLocalPlayerAvatar\(this\.camera\.position, delta\)/);
    assert.match(mirrors, /\[this\.firstPersonHand, this\.firstPersonLeftHand\]/, 'the first-person hands stay out of a reflection');
});

// ---- The panel, touch and the guide ----

function fakeElement(tag = 'div') {
    const classes = new Set();
    const listeners = {};
    return {
        tag, style: {}, children: [], attributes: {}, listeners, parentNode: null, textContent: '', innerHTML: '',
        classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), contains: (name) => classes.has(name) },
        appendChild(child) { child.parentNode = this; this.children.push(child); },
        append(...more) { more.forEach((child) => this.appendChild(child)); },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(type, fn) { listeners[type] = fn; }
    };
}

test('only what can be held gets the L in the panel, and it does not close the panel', () => {
    const realCreate = ctx.document.createElement;
    ctx.document.createElement = (tag) => fakeElement(tag);
    try {
        const game = makeGame({ torch: 2, stone: 1 });
        const stone = fakeElement();
        const torch = fakeElement();
        game.offhandDecorateItem(stone, 'stone');
        game.offhandDecorateItem(torch, 'torch');
        assert.equal(stone.children.length, 0);
        assert.equal(torch.children[0].textContent, 'L');
        let stopped = false;
        torch.children[0].listeners.click({ stopPropagation: () => { stopped = true; } });
        assert.equal(stopped, true);
        assert.equal(game.offhandType, 'torch');
    } finally {
        ctx.document.createElement = realCreate;
    }
});

test('the slot in the panel shows the hand, and a click puts it back', () => {
    const realCreate = ctx.document.createElement;
    const realGet = ctx.document.getElementById;
    const row = fakeElement();
    ctx.document.createElement = (tag) => fakeElement(tag);
    ctx.document.getElementById = (id) => (id === 'inventory-offhand' ? row : null);
    try {
        const game = makeGame({ torch: 1 });
        game.offhandType = 'candle';
        game.offhandRenderHud();
        const slot = row.children[0];
        assert.match(row.children[1].textContent, /Candle/);
        row.children.length = 0;
        slot.listeners.click();
        assert.equal(game.offhandType, null);
        assert.equal(game.getInventoryCount('candle'), 1);
        assert.ok(game.inventory.includes('candle'), 'it has a place in the inventory again');
    } finally {
        ctx.document.createElement = realCreate;
        ctx.document.getElementById = realGet;
    }
});

test('touch has a button and a menu entry, and the layout leaves room for it', () => {
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    assert.match(html, /id="touch-offhand-button"/);
    assert.match(html, /id="inventory-offhand"/);
    const touch = fs.readFileSync(path.join(JS, 'game', 'touch.js'), 'utf8');
    assert.match(touch, /touch-offhand-button'\), \(\) => this\.offhandSwapSelected\(\)/);
    assert.match(touch, /'Left hand', \(\) => this\.offhandSwapSelected\(\)/);
    const buttons = (html.match(/<div id="touch-topbar">[\s\S]*?<\/div>/)[0].match(/<button/g) || []).length;
    const { computeTouchLayout, touchLayoutRects } = require(path.join(JS, 'touchInput.js'));
    const layout = computeTouchLayout(800, 400);
    const rect = touchLayoutRects(layout, 800, 400).topBar;
    assert.equal(rect.right - rect.left, buttons * layout.topButton + (buttons - 1) * 8);
});

test('the guide has the page in both languages, and it agrees with the game', () => {
    const files = fs.readdirSync(GUIDE);
    for (const lang of ['ES', 'EN']) {
        const name = files.find((file) => file.startsWith(`251_${lang}_`));
        assert.ok(name, `page 251 in ${lang}`);
        const page = fs.readFileSync(path.join(GUIDE, name), 'utf8');
        for (const item of Object.keys(ctx.OFFHAND_ITEMS)) assert.match(page, new RegExp(`\`${item}\``), `${item} in ${lang}`);
        assert.match(page, /\*\*X\*\*/);
        for (const [item, def] of Object.entries(ctx.OFFHAND_ITEMS)) {
            if (def.level) assert.match(page, new RegExp(`\`${item}\` \\| [^|]*${def.level}`), `${item}'s level in ${lang}`);
        }
        const contents = fs.readFileSync(path.join(GUIDE, files.find((file) => file.startsWith(`0_${lang}_`))), 'utf8');
        const items = fs.readFileSync(path.join(GUIDE, files.find((file) => file.startsWith(`48_${lang}_`))), 'utf8');
        const controls = fs.readFileSync(path.join(GUIDE, files.find((file) => file.startsWith(`10_${lang}_`))), 'utf8');
        for (const index of [contents, items, controls]) assert.match(index, /\(251\)/);
    }
    assert.match(fs.readFileSync(path.join(GUIDE, 'README.md'), 'utf8'), /\| 251 \|/);
    assert.match(fs.readFileSync(path.join(ROOT, 'GUIA.md'), 'utf8'), /## La mano izquierda/);
    assert.match(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'), /`X`: move the selected light/);
});
