// Node tests for what the left hand does in work and in a fight (js/game/offhand.js): two tools mining, two swords,
// the shield against every kind of damage, what X does with all of these, that no sequence of moves makes a unit, and
// that tools give no light or reading. Every script of index.html runs in one VM context, with the real Game (without
// its init), the real WorldRenderer and its real catalogue and recipes; the page is a stand-in, so how it looks is for
// the game. Run with: node --test test/js/offhand_gear.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const JS = path.join(STATIC, 'js');
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
    setScalar(s) { return this.set(s, s, s); }
    multiplyScalar(s) { return this.set(this.x * s, this.y * s, this.z * s); }
    add(v) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    applyAxisAngle() { return this; }
}
class Object3D {
    constructor() { this.position = new Vector3(); this.rotation = new Vector3(); this.scale = new Vector3(1, 1, 1); this.userData = {}; this.children = []; }
    add(child) { this.children.push(child); return child; }
    remove(child) { this.children = this.children.filter((other) => other !== child); }
    traverse(fn) { fn(this); this.children.forEach((child) => child.traverse(fn)); }
}
class Material {
    constructor(options = {}) { Object.assign(this, options); }
    clone() { return Object.assign(new this.constructor(), this); }
    dispose() {}
}
class Mesh extends Object3D {
    constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
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
    return {
        id, style: {}, dataset: {}, children: [], value: '', title: '', textContent: '', listeners: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
        appendChild(child) { this.children.push(child); return child; }, append(...children) { this.children.push(...children); }, removeChild() {},
        addEventListener(type, listener) { this.listeners[type] = listener; }, setAttribute() {}, removeAttribute() {}, querySelector: () => makeElement(), querySelectorAll: () => [],
        insertBefore(child) { return child; }, remove() {}, focus() {}, click() {}, getBoundingClientRect: () => ({ width: 16 }), innerHTML: ''
    };
}

const elements = new Map();
const stored = new Map();
function load() {
    const THREE = new Proxy({
        Vector3, Vector2: Vector3, Vector4: Vector3, Group: Object3D, Mesh, MeshLambertMaterial: class extends Material {},
        MeshStandardMaterial: class extends Material {}, MeshBasicMaterial: class extends Material {}, MultiplyBlending: 'multiply', FrontSide: 'front', DoubleSide: 'double', sRGBEncoding: 'srgb'
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
        localStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) },
        location: { search: '', protocol: 'http:', host: 'test' }, URLSearchParams, prompt: () => 'Tester',
        setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {}, WebSocket: class {}, Audio: class {}, Image: class {}, AudioContext: class {},
        fetch: () => new Promise(() => {}), addEventListener() {}, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1
    });
    context.window = context;
    const scripts = [...HTML.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]).filter((src) => !/^(https?:)?\/\//.test(src));
    for (const src of scripts) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    vm.runInContext(`Object.assign(this, { Game, WorldRenderer, ITEM_TYPES, DAMAGE_MODIFIERS, OFFHAND_ITEMS, OFFHAND_PAIR_SPEED, OFFHAND_PAIR_TOOLS, PLAYER_SWORD_DAMAGE, PLAYER_BASE_DAMAGE,
        PLAYER_LEFT_SWORD_SHARE, SHIELD_FRONT_REDUCTION, SHIELD_FRONT_HALF_ANGLE, offhandCanHold, offhandSwap, offhandArmsOfSwing, shieldFacesSource, carriedLightOf, handsInList,
        carriedLampWithin, itemTagsOf, itemTagParseQuery, itemTagMatches, ItemTagIndex, itemTagCatalogue });`, context);
    return context;
}

const ctx = load();
ctx.Game.prototype.init = function () {};
const world = new ctx.WorldRenderer({ add() {}, remove() {} });
world.getInventoryIconUrl = () => '';
const blockTypes = world.blockTypes;
const plain = (value) => JSON.parse(JSON.stringify(value));

function makeGame(counts = {}, overrides = {}) {
    elements.clear();
    const game = new ctx.Game();
    const messages = [];
    const pickups = [];
    for (const [type, count] of Object.entries(counts)) {
        if (!game.inventory.includes(type)) game.inventory.push(type);
        game.inventoryCounts[type] = count;
    }
    // Only what the test says it has.
    for (const type of Object.keys(game.inventoryCounts)) if (!(type in counts)) game.inventoryCounts[type] = 0;
    Object.assign(game, {
        world, maxHealth: 20, health: 20, offhandType: null, cameraViewMode: 'first', hitIndicator: makeElement(), respawnPending: false,
        cameraController: { yaw: 0, eyeHeight: 1.6, keys: {}, getPosition: () => ({ x: 0, y: 10, z: 0, yaw: 0, pitch: 0 }), applyKnockback() {} },
        receiveSystemMessage: (message) => messages.push(message.text), playTone() {}, playNoiseBurst() {}, playPlaceSound() {},
        spawnPickup: (type, _at, amount) => pickups.push({ type, amount }), messages, pickups,
        camera: { position: new Vector3(0, 10, 0), getWorldDirection: (v) => v }, renderer: { domElement: {} }, stopMining() {}, resetMiningBlockVisual() {}, closeChatInput() {}, closeSignReader() {}
    }, overrides);
    game.selectedSlot = 0;
    return game;
}
const select = (game, type) => { game.selectedSlot = game.inventory.indexOf(type); };
// A game with `right` selected (one unit in the count, unless it is null) and `left` in the left hand.
function hands(right, left, overrides = {}) {
    const game = makeGame(right ? { [right]: 1 } : { stone: 0 }, overrides);
    game.offhandType = left || null;
    if (right) select(game, right);
    else game.selectedSlot = game.inventory.indexOf('stone');
    return game;
}
const owned = (game, type) => game.getInventoryCount(type) + (game.offhandType === type ? 1 : 0);

const TIERS = { wood: 1.45, stone: 1.9, iron: 2.6, gold: 3.2, steel: 3.6 };
const SWORDS = { wood: 5, stone: 6, iron: 7, gold: 8, steel: 9 };
const MATERIALS = Object.keys(TIERS);
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual}, expected ${expected}`);
// Seconds on a block of 10 s, far from the 0.08 s floor.
const time = (game, block) => game.getAdjustedBreakDuration(block, 10);

// ---- Two tools ----

test('the constants are what the guide says', () => {
    assert.equal(ctx.OFFHAND_PAIR_SPEED, 1.5);
    assert.equal(ctx.PLAYER_LEFT_SWORD_SHARE, 0.5);
    assert.equal(ctx.SHIELD_FRONT_REDUCTION, 0.5);
    assert.equal(ctx.SHIELD_FRONT_HALF_ANGLE, Math.PI / 3);
    assert.deepEqual(plain(ctx.OFFHAND_PAIR_TOOLS), ['pickaxe', 'shovel', 'axe']);
});

test('mining time: one tool, the same tool twice, and the right tool of each type', () => {
    for (const [tool, block] of [['pickaxe', 'stone'], ['shovel', 'dirt'], ['axe', 'wood']]) {
        for (const material of MATERIALS) {
            const id = `${material}_${tool}`;
            close(time(hands(id, null), block), 10 / TIERS[material], `${id} alone on ${block}`);
            close(time(hands(id, id), block), 10 / (TIERS[material] * 1.5), `${id} twice on ${block}`);
        }
    }
});

test('mining time: different materials, the worse one sets the speed, in whichever hand', (t) => {
    const rows = [];
    for (const right of MATERIALS) {
        for (const left of MATERIALS) {
            const seconds = time(hands(`${right}_pickaxe`, `${left}_pickaxe`), 'stone');
            close(seconds, 10 / (Math.min(TIERS[right], TIERS[left]) * 1.5), `${right} + ${left}`);
            rows.push(`${right}+${left}=${(10 / seconds).toFixed(3)}`);
        }
    }
    t.diagnostic(rows.join(' '));
    // The rule as it was decided: with a much worse tool, a good one is slower than on its own.
    assert.ok(time(hands('iron_pickaxe', 'wood_pickaxe'), 'stone') > time(hands('iron_pickaxe', null), 'stone'));
    assert.ok(time(hands('gold_pickaxe', 'stone_pickaxe'), 'stone') > time(hands('gold_pickaxe', null), 'stone'));
    assert.ok(time(hands('gold_pickaxe', 'iron_pickaxe'), 'stone') < time(hands('gold_pickaxe', null), 'stone'));
});

test('the wrong tool on a block gets nothing from the second one', () => {
    for (const [right, left, block] of [['iron_pickaxe', 'iron_pickaxe', 'dirt'], ['iron_pickaxe', 'iron_pickaxe', 'wood'], ['iron_shovel', 'iron_shovel', 'stone'], ['iron_axe', 'iron_axe', 'stone']]) {
        close(time(hands(right, left), block), time(hands(right, null), block), `${right} twice on ${block}`);
    }
});

test('only two of a type count', () => {
    const alone = time(hands('iron_pickaxe', null), 'stone');
    for (const left of ['iron_axe', 'iron_shovel', 'iron_sword', 'shield', 'torch', 'multimeter']) {
        close(time(hands('iron_pickaxe', left), 'stone'), alone, `iron_pickaxe with ${left}`);
    }
    // A sword in the right mines as it did, whatever the left holds.
    close(time(hands('iron_sword', 'iron_sword'), 'stone'), time(hands('iron_sword', null), 'stone'), 'two swords');
});

test('a tool in the left hand alone does not mine: the right hand is bare', () => {
    const bare = time(hands(null, null), 'stone');
    close(bare, 10, 'bare hand');
    close(time(hands(null, 'iron_pickaxe'), 'stone'), 10, 'pickaxe in the left only');
});

test('the last unit sent to the left no longer mines from the selected slot', () => {
    const game = makeGame({ iron_pickaxe: 1 });
    select(game, 'iron_pickaxe');
    close(time(game, 'stone'), 10 / 2.6, 'in the right');
    game.offhandSwapSelected();
    assert.equal(game.offhandType, 'iron_pickaxe');
    assert.equal(game.getSelectedBlockType(), 'iron_pickaxe', 'the slot still names it');
    assert.equal(game.getSelectedHeldItemType(), null);
    close(time(game, 'stone'), 10, 'the right hand is empty now');
    // The second one makes the pair.
    game.addInventory('iron_pickaxe', 1);
    close(time(game, 'stone'), 10 / (2.6 * 1.5), 'one in each hand');
});

test('hoes and shears stay out of the left hand, and so of the pair', () => {
    const tools = Object.entries(blockTypes).filter(([, def]) => def.toolType);
    assert.ok(tools.length >= 25, `${tools.length} tools in the catalogue`);
    for (const [id, def] of tools) {
        assert.equal(ctx.offhandCanHold(id), def.toolType !== 'hoe' && def.toolType !== 'shears', id);
    }
    close(time(hands('iron_hoe', 'iron_hoe'), 'leaves'), time(hands('iron_hoe', null), 'leaves'), 'a save cannot make a pair of hoes either');
    close(time(hands('iron_shears', 'iron_shears'), 'leaves'), time(hands('iron_shears', null), 'leaves'), 'nor of shears');
});

test('the floor of the mining time still holds', () => {
    assert.equal(hands('steel_pickaxe', 'steel_pickaxe').getAdjustedBreakDuration('stone', 0.1), 0.08);
});

test('a change of hands half way through a block changes its time', () => {
    const source = fs.readFileSync(path.join(JS, 'game', 'building.js'), 'utf8');
    assert.match(source, /this\.miningTargetDuration = breakDuration;\s*this\.bindMiningBlockVisual/);
});

test('the arms strike by turns: never both, and each in its half of the swing', () => {
    for (let phase = 0; phase < 40; phase++) {
        const swing = Math.sin(phase * 0.3);
        const arms = ctx.offhandArmsOfSwing(swing);
        assert.equal(Math.min(arms.right, arms.left), 0);
        assert.equal(Math.max(arms.right, arms.left), Math.abs(swing));
    }
    const hand = fs.readFileSync(path.join(JS, 'game.js'), 'utf8');
    assert.match(hand, /offhandPairMultiplier\(this\.getSelectedHeldItemType\(\), this\.miningTargetType\)/);
});

// ---- Two swords ----

test('the damage of a strike: every pair of swords', (t) => {
    const rows = [];
    for (const right of MATERIALS) {
        for (const left of MATERIALS) {
            const damage = hands(`${right}_sword`, `${left}_sword`).getPlayerAttackDamage();
            assert.equal(damage, SWORDS[right] + SWORDS[left] * 0.5, `${right} + ${left}`);
            assert.equal(damage * 2, Math.round(damage * 2), 'whole or half points');
            rows.push(`${right}+${left}=${damage}`);
        }
    }
    t.diagnostic(rows.join(' '));
});

test('the damage of a strike: everything that is not two swords', () => {
    const cases = [
        [null, null, 4], [null, 'gold_sword', 4], ['stone', 'gold_sword', 4], ['iron_pickaxe', 'gold_sword', 4], ['iron_pickaxe', 'iron_pickaxe', 4], ['torch', 'gold_sword', 4],
        ['iron_sword', null, 7], ['iron_sword', 'shield', 7], ['iron_sword', 'iron_axe', 7], ['iron_sword', 'torch', 7], ['steel_sword', null, 9], ['wood_sword', null, 5]
    ];
    for (const [right, left, damage] of cases) assert.equal(hands(right, left).getPlayerAttackDamage(), damage, `${right} / ${left}`);
    assert.equal(ctx.PLAYER_BASE_DAMAGE, 4);
    assert.deepEqual(plain(ctx.PLAYER_SWORD_DAMAGE), SWORDS, 'the table of one sword has not changed');
});

test('half points of damage work on a mob: its health and its death', () => {
    const game = hands('wood_sword', 'wood_sword');
    const mob = { userData: { maxHealth: 16, health: 16 } };
    assert.equal(game.damageMobByPlayer(mob), false);
    assert.equal(mob.userData.health, 8.5);
    assert.equal(game.damageMobByPlayer(mob), false);
    assert.equal(mob.userData.health, 1);
    assert.equal(game.damageMobByPlayer(mob), true);
    for (const file of ['mobs', 'mole', 'snake', 'owl', 'storm_golem', 'crab', 'shadows', 'fox']) {
        const source = fs.readFileSync(path.join(JS, 'game', `${file}.js`), 'utf8');
        assert.doesNotMatch(source, /Math\.(floor|round|ceil)\([^)]*\.health\b/, `${file} does not round a mob's health`);
        assert.doesNotMatch(source, /\.health\s*===/, `${file} does not compare it exactly`);
    }
});

test('each strike with two swords is the other arm, and with one sword nothing changes', () => {
    const game = hands('iron_sword', 'gold_sword', { emitMobEvent() {} });
    const mob = { parent: null, userData: { species: 'spider' } };
    const arms = [];
    for (let i = 0; i < 5; i++) {
        game.interactWithMob(mob);
        arms.push(game.offhandStrikeArm);
        assert.equal(game.offhandStrikePose(0.01).arm, arms[i]);
    }
    assert.deepEqual(arms, ['right', 'left', 'right', 'left', 'right']);
    game.offhandStrikePose(1);
    assert.equal(game.offhandStrikePose(0.01), null, 'the strike ends');

    const single = hands('iron_sword', 'shield', { emitMobEvent() {} });
    single.interactWithMob(mob);
    assert.equal(single.offhandStrikePose(0.01), null);
    const bare = hands(null, 'iron_sword', { emitMobEvent() {} });
    bare.interactWithMob(mob);
    assert.equal(bare.offhandStrikePose(0.01), null);
});

// ---- The shield ----

// Where an attacker stands, `degrees` to the player's left of where a player at (0, 0) with `yaw` looks.
function attackerAt(yaw, degrees, distance = 1) {
    const angle = yaw + degrees * Math.PI / 180;
    return { x: -Math.sin(angle) * distance, z: -Math.cos(angle) * distance };
}
const FRONT = [0, 30, -30, 45, -45, 59, -59];
const NOT_FRONT = [61, -61, 90, -90, 135, -135, 180];

function hurt(amount, type, source, { left = 'shield', yaw = 0, counts = {}, overrides = {} } = {}) {
    const game = makeGame(counts, overrides);
    game.offhandType = left;
    game.cameraController.yaw = yaw;
    game.cameraController.getPosition = () => ({ x: 0, y: 10, z: 0, yaw, pitch: 0 });
    game.applyDamage(amount, 'test', type, source);
    return 20 - game.health;
}

test('the front is where the player looks, at any yaw', () => {
    for (const yaw of [0, 1, Math.PI / 2, Math.PI, -2.4, 7]) {
        for (const degrees of FRONT) assert.equal(ctx.shieldFacesSource(yaw, { x: 0, z: 0 }, attackerAt(yaw, degrees)), true, `yaw ${yaw}, ${degrees} degrees`);
        for (const degrees of NOT_FRONT) assert.equal(ctx.shieldFacesSource(yaw, { x: 0, z: 0 }, attackerAt(yaw, degrees)), false, `yaw ${yaw}, ${degrees} degrees`);
    }
    // At yaw 0 the camera looks towards -z (js/camera.js): forward.applyAxisAngle(up, yaw) on (0, 0, -1).
    assert.equal(ctx.shieldFacesSource(0, { x: 0, z: 0 }, { x: 0, z: -2 }), true);
    assert.equal(ctx.shieldFacesSource(0, { x: 0, z: 0 }, { x: 0, z: 2 }), false);
    assert.equal(ctx.shieldFacesSource(0, { x: 3, z: 3 }, { x: 3, z: 1 }), true, 'from where the player is');
    assert.equal(ctx.shieldFacesSource(0, { x: 0, z: 0 }, null), false, 'no source');
    assert.equal(ctx.shieldFacesSource(0, { x: 0, z: 0 }, { x: 0, z: 0.01 }), false, 'no direction');
});

test('every damage type by angle: only a creature in front is halved', () => {
    const table = {
        mob: [5, 10], poison: [10, 10], fall: [10, 10], lightning: [10, 10], void: [10, 10], other: [10, 10]
    };
    for (const [type, [front, otherwise]] of Object.entries(table)) {
        for (const degrees of FRONT) assert.equal(hurt(10, type, attackerAt(0, degrees)), front, `${type} at ${degrees}`);
        for (const degrees of NOT_FRONT) assert.equal(hurt(10, type, attackerAt(0, degrees)), otherwise, `${type} at ${degrees}`);
        assert.equal(hurt(10, type, null), 10, `${type} with no source`);
    }
});

test('the shield only works in the left hand', () => {
    const front = attackerAt(0, 0);
    assert.equal(hurt(10, 'mob', front), 5);
    assert.equal(hurt(10, 'mob', front, { left: null }), 10, 'no shield');
    assert.equal(hurt(10, 'mob', front, { left: 'iron_sword' }), 10, 'something else');
    assert.equal(hurt(10, 'mob', front, { left: null, counts: { shield: 3 } }), 10, 'in the inventory');
    const right = makeGame({ shield: 1 });
    select(right, 'shield');
    right.applyDamage(10, 'test', 'mob', front);
    assert.equal(right.health, 10, 'in the right hand');
});

test('armour first, then the shield, whatever the amount', () => {
    const front = attackerAt(0, 0);
    const back = attackerAt(0, 180);
    const cases = [
        // attack, what is carried, in front, from behind
        [4, {}, 2, 4], [3, {}, 1.5, 3], [2, {}, 1, 2], [1, {}, 0.5, 1],
        [4, { warm_coat: 1 }, 1.5, 3], [3, { warm_coat: 1 }, 1, 2], [2, { warm_coat: 1 }, 0.5, 1], [1, { warm_coat: 1 }, 0.5, 1],
        [4, { scale_mail: 1 }, 1, 2], [3, { scale_mail: 1 }, 0.5, 1], [2, { scale_mail: 1 }, 0.5, 1], [1, { scale_mail: 1 }, 0.5, 1]
    ];
    for (const [amount, counts, inFront, behind] of cases) {
        const label = `${amount} with ${Object.keys(counts)[0] || 'nothing'}`;
        assert.equal(hurt(amount, 'mob', front, { counts }), inFront, `${label}, in front`);
        assert.equal(hurt(amount, 'mob', back, { counts }), behind, `${label}, behind`);
    }
    const order = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    assert.ok(order.indexOf('js/game/resources.js') < order.indexOf('js/game/offhand.js'), 'the modifiers run in the order the files load');
});

test('the other modifiers do as they did with a shield in the hand', () => {
    assert.equal(hurt(5, 'fall', null, { counts: { feather_cape: 1 } }), 2, 'feather cape');
    assert.equal(hurt(20, 'void', null, { overrides: { creativeMode: true } }), 20, 'the void takes even a creative player');
    assert.equal(hurt(10, 'mob', attackerAt(0, 0), { overrides: { creativeMode: true } }), 0, 'creative');
    const immune = makeGame({}, { resourcesPoisonImmuneUntil: 1e12, resourcesNow: () => 0, poison: { ticks: 2 } });
    immune.offhandType = 'shield';
    immune.applyDamage(1, 'test', 'poison');
    assert.equal(immune.health, 20, 'antivenom');
});

test('half a point of health: the text and the bar say it, and it can kill', () => {
    const game = makeGame();
    game.offhandType = 'shield';
    game.applyDamage(1, 'test', 'mob', attackerAt(0, 0));
    assert.equal(game.health, 19.5);
    assert.equal(ctx.document.getElementById('health-value').textContent, '19.5/20');
    game.health = 0.5;
    game.applyDamage(1, 'test', 'mob', attackerAt(0, 0));
    assert.equal(game.health, 0);
    assert.equal(game.respawnPending, true);
});

test('a real attacker gives its position: a crab in front and behind, in the first and the third person', () => {
    const pinch = (mobZ, overrides = {}) => {
        const game = makeGame({}, overrides);
        game.offhandType = 'shield';
        const mob = { position: new Vector3(0, 10, mobZ), userData: { crab: {} } };
        game.crabPinch(mob, { x: 0, y: 10, z: 0 }, 1);
        return 20 - game.health;
    };
    assert.equal(pinch(-1), 0.5, 'in front');
    assert.equal(pinch(1), 1, 'behind');
    // The camera stands behind the player: what counts is the player.
    const third = { cameraViewMode: 'back', thirdPersonAnchor: new Vector3(0, 10, -3) };
    assert.equal(pinch(-1, third), 1, 'the crab is behind the avatar, in front of the camera');
    assert.equal(pinch(-5, third), 0.5);
});

test('which attacks give a source: all but those with no direction', () => {
    const calls = [];
    const gameDir = path.join(JS, 'game');
    for (const file of fs.readdirSync(gameDir)) {
        const source = fs.readFileSync(path.join(gameDir, file), 'utf8');
        for (const match of source.matchAll(/this\.applyDamage\(([^;]*)\);/g)) calls.push(`${file}: ${match[1]}`);
    }
    const withType = (type) => calls.filter((call) => call.includes(`'${type}'`));
    assert.equal(calls.length, withType('mob').length + withType('poison').length + withType('fall').length + withType('lightning').length + withType('void').length, calls.join('\n'));
    const mob = withType('mob');
    assert.equal(mob.length, 10, mob.join('\n'));
    const unsourced = mob.filter((call) => /'mob'$/.test(call)).map((call) => call.split(':')[0]).sort();
    assert.deepEqual(unsourced, ['ants.js', 'eel.js'], 'a swarm on your legs and a discharge have no front');
    for (const type of ['poison', 'fall', 'lightning', 'void']) {
        for (const call of withType(type)) assert.match(call, new RegExp(`'${type}'$`), 'these have no source');
    }
});

test('poison after a bite on the shield runs in full', () => {
    const game = makeGame();
    game.offhandType = 'shield';
    game.applyDamage(1, 'test', 'mob', attackerAt(0, 0));
    game.poisonPlayer(3, 'snake');
    for (let i = 0; i < 3; i++) game.updatePoison(1.5);
    assert.equal(game.health, 20 - 0.5 - 3);
});

// ---- The item ----

test('the shield is an item with a recipe, an icon, a model and its tags', () => {
    const def = blockTypes.shield;
    assert.ok(def && def.itemOnly && def.frontGuard === 0.5);
    assert.equal(def.toolType, undefined, 'not a tool: it mines and strikes as an empty hand');
    assert.equal(ctx.offhandCanHold('shield'), true);
    const game = makeGame({ planks: 5, iron_ore: 2 });
    const recipe = game.craftingRecipes.find((one) => one.id === 'shield');
    assert.deepEqual(plain(recipe.inputs), [{ type: 'planks', amount: 4 }, { type: 'iron_ore', amount: 2 }]);
    game.craftRecipe('shield');
    assert.equal(game.getInventoryCount('shield'), 1);
    assert.equal(game.getInventoryCount('planks'), 1);
    assert.equal(game.getInventoryCount('iron_ore'), 0);
    assert.equal(time(hands('shield', null), 'stone'), 10);
    assert.equal(hands('shield', null).getPlayerAttackDamage(), 4);

    let filled = 0;
    def.drawIcon({ set fillStyle(_value) {}, fillRect() { filled++; } }, 48);
    assert.ok(filled > 60, `${filled} cells of the icon`);
    const mesh = world.createDisplayMesh('shield', 0.24);
    assert.equal(mesh.userData.blockType, 'shield');
    assert.ok(mesh.children.length >= 10);
    assert.ok(mesh.children.every((box) => box.material && Number.isInteger(box.userData.viewLayer)));
});

test('the G key says what it does and spends nothing; /give and creative stock find it', () => {
    const game = makeGame({ shield: 1 });
    select(game, 'shield');
    assert.equal(game.eatSelectedItem(), true);
    assert.match(game.messages[0], /left hand/);
    assert.equal(game.getInventoryCount('shield'), 1);

    const creative = makeGame({}, { creativeMode: true });
    creative.creativeGive('give', ['shield', '2']);
    assert.equal(creative.getInventoryCount('shield'), 2);
    creative.creativeStock();
    assert.equal(creative.getInventoryCount('shield'), 999);
    const outside = makeGame();
    outside.creativeGive('give', ['shield']);
    assert.equal(outside.getInventoryCount('shield'), 0);
});

test('its tags: #armor and #armadura find it, and the tools keep theirs', () => {
    const tags = (id) => plain(ctx.itemTagsOf(id, blockTypes));
    assert.ok(tags('shield').includes('armor'));
    assert.ok(tags('iron_pickaxe').includes('tool'));
    assert.ok(tags('iron_sword').includes('weapon'));
    const index = new ctx.ItemTagIndex(blockTypes);
    const find = (query) => {
        const parsed = ctx.itemTagParseQuery(query);
        return ctx.itemTagCatalogue(blockTypes).filter((id) => {
            const entry = index.entry(id);
            return ctx.itemTagMatches(parsed, entry.set, entry.text);
        });
    };
    for (const query of ['#armor', '#armadura', '#armour shield']) assert.ok(find(query).includes('shield'), query);
    assert.deepEqual(plain(find('#armor')).sort(), ['feather_cape', 'scale_mail', 'shield', 'warm_coat']);
});

// ---- X, and everything else that moves a unit ----

test('the X key with tools, swords and the shield', () => {
    const cases = [
        // right, left, counts -> outcome, select, left after, counts after
        ['iron_pickaxe', null, { iron_pickaxe: 1 }, 'sent', null, 'iron_pickaxe', { iron_pickaxe: 0 }],
        ['iron_pickaxe', null, { iron_pickaxe: 2 }, 'sent', null, 'iron_pickaxe', { iron_pickaxe: 1 }],
        ['iron_pickaxe', 'iron_pickaxe', { iron_pickaxe: 1 }, 'returned', null, null, { iron_pickaxe: 2 }],
        ['iron_pickaxe', 'wood_pickaxe', { iron_pickaxe: 1, wood_pickaxe: 0 }, 'swapped', 'wood_pickaxe', 'iron_pickaxe', { iron_pickaxe: 0, wood_pickaxe: 1 }],
        [null, 'iron_pickaxe', { iron_pickaxe: 0 }, 'taken', 'iron_pickaxe', null, { iron_pickaxe: 1 }],
        ['iron_sword', 'torch', { iron_sword: 1, torch: 0 }, 'swapped', 'torch', 'iron_sword', { iron_sword: 0, torch: 1 }],
        ['shield', null, { shield: 1 }, 'sent', null, 'shield', { shield: 0 }],
        [null, 'shield', { shield: 0 }, 'taken', 'shield', null, { shield: 1 }],
        ['iron_axe', 'shield', { iron_axe: 1, shield: 0 }, 'swapped', 'shield', 'iron_axe', { iron_axe: 0, shield: 1 }],
        ['iron_hoe', 'shield', { iron_hoe: 1, shield: 0 }, 'refused', null, 'shield', { iron_hoe: 1, shield: 0 }],
        ['iron_shears', null, { iron_shears: 1 }, 'refused', null, null, { iron_shears: 1 }],
        ['fishing_rod', 'iron_pickaxe', { fishing_rod: 1, iron_pickaxe: 0 }, 'refused', null, 'iron_pickaxe', { fishing_rod: 1, iron_pickaxe: 0 }]
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

test('one pickaxe: X leaves the right hand empty, and Q, a recipe and a chest cannot reach it', () => {
    const recipe = { id: 'test', name: 'Test', output: { type: 'stone', amount: 1 }, inputs: [{ type: 'iron_pickaxe', amount: 1 }] };
    const sent = [];
    const game = makeGame({ iron_pickaxe: 1, stone: 0 }, {
        craftingRecipes: [recipe], storageAt: { x: 1, y: 2, z: 3 }, storageMode: 0, storagePending: new Map(),
        network: { connected: true, send: (kind, payload) => sent.push({ kind, payload }) }
    });
    select(game, 'iron_pickaxe');
    game.offhandSwapSelected();
    assert.equal(game.offhandType, 'iron_pickaxe');
    assert.equal(game.getSelectedHeldItemType(), null);
    assert.ok(!game.getHotbarInventoryIndexes().includes(game.inventory.indexOf('iron_pickaxe')), 'the hotbar does not offer it');
    game.dropSelectedBlock();
    assert.equal(game.pickups.length, 0, 'Q drops nothing');
    assert.equal(game.canCraftRecipe(recipe), false);
    game.craftRecipe('test');
    assert.equal(game.getInventoryCount('stone'), 0);
    game.storagePut('iron_pickaxe');
    assert.equal(sent.length, 0, 'a chest gets nothing');
    assert.equal(game.consumeSelectedBlock(), false);
    assert.equal(owned(game, 'iron_pickaxe'), 1);
    game.offhandSwapSelected();
    assert.equal(game.offhandType, null);
    assert.equal(game.getSelectedHeldItemType(), 'iron_pickaxe', 'X again takes it back');
});

test('two pickaxes: the panel button and X make the pair, Shift + X undoes it, and it survives a save', () => {
    const game = makeGame({ iron_pickaxe: 2 });
    select(game, 'iron_pickaxe');
    game.offhandSendType('iron_pickaxe');
    assert.equal(game.getSelectedHeldItemType(), 'iron_pickaxe');
    close(time(game, 'stone'), 10 / 3.9, 'a pair');
    game.saveInventoryState();
    const saved = JSON.parse(stored.get('minecloud-inventory-state'));
    assert.equal(saved.offhand, 'iron_pickaxe');
    assert.equal(saved.counts.iron_pickaxe, 1);
    const back = makeGame();
    back.restoreInventoryState();
    assert.equal(back.offhandType, 'iron_pickaxe');
    assert.equal(owned(back, 'iron_pickaxe'), 2);
    game.offhandSwapSelected(true);
    assert.equal(game.offhandType, null);
    assert.equal(game.getInventoryCount('iron_pickaxe'), 2);
});

test('no random sequence of moves in the real game makes or loses a unit', () => {
    let seed = 987654;
    const random = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
    const types = ['iron_pickaxe', 'wood_pickaxe', 'iron_sword', 'gold_sword', 'iron_axe', 'iron_shovel', 'shield', 'torch', 'multimeter', 'iron_hoe', 'iron_shears', 'stone', 'fishing_rod'];
    const start = Object.fromEntries(types.map((type) => [type, 1 + random(3)]));
    const game = makeGame(start);
    const dropped = {};
    const added = {};
    game.spawnPickup = (type, _at, amount) => { dropped[type] = (dropped[type] || 0) + amount; };
    const recipe = { id: 'test', name: 'Test', output: { type: 'stone', amount: 1 }, inputs: [{ type: 'iron_pickaxe', amount: 1 }] };
    game.craftingRecipes = [recipe];
    const steps = { x: 0, shift: 0, panel: 0, q: 0, pick: 0, craft: 0, save: 0, select: 0 };
    for (let i = 0; i < 4000; i++) {
        const type = types[random(types.length)];
        switch (random(9)) {
            case 0: case 1: game.offhandSwapSelected(); steps.x++; break;
            case 2: game.offhandSwapSelected(true); steps.shift++; break;
            case 3: game.offhandSendType(type); steps.panel++; break;
            case 4: game.dropSelectedBlock(); steps.q++; break;
            case 5: game.addInventory(type, 1); added[type] = (added[type] || 0) + 1; steps.pick++; break;
            case 6: if (game.canCraftRecipe(recipe)) { game.craftRecipe('test'); added.stone = (added.stone || 0) + 1; added.iron_pickaxe = (added.iron_pickaxe || 0) - 1; steps.craft++; } break;
            case 7: game.saveInventoryState(); game.offhandType = JSON.parse(stored.get('minecloud-inventory-state')).offhand; steps.save++; break;
            default: select(game, type); steps.select++;
        }
        for (const one of types) {
            assert.ok(game.getInventoryCount(one) >= 0, `${one} below zero`);
            const expected = start[one] + (added[one] || 0) - (dropped[one] || 0);
            assert.equal(owned(game, one), expected, `${one} at step ${i}`);
        }
    }
    assert.ok(Object.values(steps).every((count) => count > 0), JSON.stringify(steps));
});

// ---- What tools do not do ----

test('tools and the shield give no light and read nothing', () => {
    const gear = ['iron_pickaxe', 'iron_sword', 'iron_axe', 'wood_shovel', 'steel_sword', 'shield'];
    for (const type of gear) {
        assert.equal(ctx.carriedLightOf(null, type), null, type);
        assert.equal(ctx.carriedLightOf(type, type), null, type);
        assert.equal(plain(ctx.carriedLightOf('candle', type)).type, 'candle', type);
        assert.equal(plain(ctx.carriedLightOf(type, 'torch')).hand, 'left', type);
        assert.equal(ctx.OFFHAND_ITEMS[type].level, undefined, type);
        assert.deepEqual(plain(ctx.handsInList(type, type, ['thermometer', 'barometer', 'anemometer', 'multimeter'])), [], type);
        const game = hands(type, type);
        assert.equal(game.carriedLampNear({ x: 0, y: 10, z: 0 }), null, type);
        assert.equal(game.handsHold('helium_balloon'), false, type);
        assert.equal(game.handsHold('torch'), false, type);
    }
});

test('what looks for a held item looks at the hands: a tool in the left is not a rod, nor the rod a tool', () => {
    const game = hands('fishing_rod', 'iron_pickaxe');
    assert.equal(game.getSelectedHeldItemType(), 'fishing_rod');
    assert.equal(ctx.offhandCanHold('fishing_rod'), false);
    assert.equal(game.handsHold('fishing_rod'), true);
    assert.equal(game.getPlayerAttackDamage(), 4);
    close(time(game, 'stone'), 10, 'the rod does not mine with the left hand tool');
    // Nothing else walks the inventory or the hotbar for a tool, or reads the left hand for one.
    const gameDir = path.join(JS, 'game');
    const readers = fs.readdirSync(gameDir).filter((file) => /\.toolType\b/.test(fs.readFileSync(path.join(gameDir, file), 'utf8'))).sort();
    assert.deepEqual(readers, ['copper_golem.js', 'farming.js', 'inventory.js', 'item_tags.js', 'mobs.js', 'offhand.js']);
    for (const file of ['copper_golem.js', 'farming.js']) {
        const source = fs.readFileSync(path.join(gameDir, file), 'utf8');
        assert.doesNotMatch(source, /offhandType/, `${file} only asks about the right hand`);
    }
    const hotbarReaders = fs.readdirSync(gameDir).filter((file) => /getHotbarInventoryIndexes/.test(fs.readFileSync(path.join(gameDir, file), 'utf8'))).sort();
    assert.deepEqual(hotbarReaders, ['inventory.js', 'offhand.js']);
});

test('other players: a tool or a shield is drawn on the arm, gives no light, and an unknown type is nothing', () => {
    const game = makeGame();
    const arm = new Object3D();
    const avatar = { userData: { avatarParts: { leftArm: arm } } };
    game.offhandApplyRemote(avatar, { heldItem: 'stone', offhandItem: 'iron_pickaxe' });
    assert.equal(avatar.userData.offhandItemType, 'iron_pickaxe');
    assert.equal(arm.children.length, 1);
    assert.equal(arm.children[0].scale.x, -1, 'a tool in the left is the right one seen in a mirror');
    assert.equal(avatar.userData.carriedLevel, 0);
    game.offhandApplyRemote(avatar, { heldItem: 'stone', offhandItem: 'shield' });
    assert.equal(arm.children.length, 1);
    assert.equal(arm.children[0].scale.x, 0.18 * 2.2, 'the shield is not mirrored');
    assert.equal(avatar.userData.carriedLevel, 0);
    for (const refused of ['iron_hoe', 'not_an_item', 'constructor']) {
        game.offhandApplyRemote(avatar, { heldItem: 'stone', offhandItem: refused });
        assert.equal(avatar.userData.offhandItemType, null, refused);
    }
    assert.equal(arm.children.length, 0);
});

test('the first-person left hand: tools mirrored, the shield in layers, over the world', () => {
    const anchor = new Object3D();
    const game = makeGame({}, { firstPersonOffhandAnchor: anchor });
    game.offhandType = 'iron_pickaxe';
    game.offhandRefreshMesh();
    assert.equal(anchor.children[0].scale.x, -1);
    game.offhandType = 'shield';
    game.offhandRefreshMesh();
    assert.equal(anchor.children.length, 1);
    const boxes = anchor.children[0].children;
    assert.ok(boxes.every((box) => box.material.depthTest === false && box.renderOrder >= 9999), 'drawn over the world in every mode');
    // The outside of the boss behind the boards, the straps in front.
    const order = (color) => boxes.find((box) => box.material.color === color).renderOrder;
    assert.ok(order(0xc8cdd2) < order(0x9a6b3c) && order(0x9a6b3c) < order(0x8f979e) && order(0x8f979e) < order(0x4a2f1b));
    for (const mode of [{ rtxModeEnabled: true }, { rtxModeEnabled: false }]) {
        assert.ok(world.createDisplayMaterial.call(mode, 0xffffff), 'both materials exist');
    }
});

test('the guide says it, in both languages', () => {
    const GUIDE = path.join(STATIC, 'guide');
    const files = fs.readdirSync(GUIDE);
    for (const lang of ['ES', 'EN']) {
        const read = (prefix) => fs.readFileSync(path.join(GUIDE, files.find((file) => file.startsWith(`${prefix}_${lang}_`))), 'utf8');
        const left = read('251');
        assert.match(left, /1,5|1\.5/);
        assert.match(left, /\(252\)/);
        assert.match(left, /`iron_hoe`|`hoe`/);
        const shield = read('252');
        assert.match(shield, /item:shield/);
        assert.match(shield, /`planks`/);
        assert.match(shield, /`iron_ore`/);
        assert.match(shield, /50 %/);
        for (const page of ['0', '48', '9']) assert.match(read(page), /\(252\)/, `page ${page} in ${lang}`);
        assert.match(read('91'), /\(252\)/);
    }
    assert.match(fs.readFileSync(path.join(GUIDE, 'README.md'), 'utf8'), /\| 252 \|/);
    const guia = fs.readFileSync(path.join(ROOT, 'GUIA.md'), 'utf8');
    assert.doesNotMatch(guia, /No hay escudo/);
    assert.match(guia, /`shield`/);
});
