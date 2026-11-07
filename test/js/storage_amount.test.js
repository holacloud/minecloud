// Node tests for the amount a click moves in a storage panel (js/game/storage.js): every panel starts at x1,
// whatever was picked in the one before. The panel's buttons are stand-ins; nothing here runs a browser.
// Run with: node --test test/js/storage_amount.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js');
const read = (file) => fs.readFileSync(path.join(JS, file), 'utf8');

function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}

function loadStorage() {
    const context = vm.createContext({
        console, Math, performance: { now: () => 0 }, THREE: anyStub(), document: anyStub(), navigator: {},
        window: { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {} }
    });
    context.localStorage = context.window.localStorage;
    vm.runInContext('class Game {}', context);
    for (const file of ['extensions.js', 'gameLang.js', 'chunkStore.js', 'blockShapes.js', 'mobSpecies.js', 'game/resources.js', 'game/furniture.js', 'game/storage.js', 'game/appliances.js']) {
        vm.runInContext(read(file), context, { filename: file });
    }
    vm.runInContext('Object.assign(this, { Game, STORAGE_AMOUNTS, STORAGE_DEFAULT_AMOUNT, storageClickAmount });', context);
    return context;
}

const ctx = loadStorage();

// The amount buttons as the panel has them: x1, x10, All.
function makePanel() {
    const amounts = ['1', '10', '0'].map((amount) => {
        const button = { dataset: { amount }, active: false };
        button.classList = { toggle: (name, on) => { if (name === 'active') button.active = on; } };
        return button;
    });
    return {
        amounts,
        classList: { add() {}, remove() {} },
        querySelector: () => anyStub(),
        querySelectorAll: (selector) => (selector === '.storage-amount' ? amounts : [])
    };
}

function makeGame() {
    const sent = [];
    const counts = { stone: 50 };
    const game = new ctx.Game();
    const panel = makePanel();
    Object.assign(game, {
        world: {
            getBlockTypeAt: () => 'chest',
            blockTypes: { chest: { name: 'Chest', storageSlots: 27 }, stone: { name: 'Stone' } },
            getInventoryIconUrl: () => ''
        },
        inventory: ['stone'], inventoryCounts: counts, storagePending: new Map(),
        network: { connected: true, send: (type, payload) => sent.push({ type, payload }), on() {} },
        getInventoryCount: (type) => counts[type] || 0,
        getBlockDisplayName: (type) => type,
        stopMining() {}, recapturePointerLock() {}, updateHotbarCounts() {}, refreshHeldItemMesh() {}, renderCraftingPanel() {},
        renderInventoryPanel() {}, saveInventoryState() {}, storageRenderProgress() {}, storageSavePending() {},
        renderer: { domElement: {} },
        storageBuildPanel() { this.storagePanel = panel; }
    });
    const activeAmount = () => panel.amounts.filter((button) => button.active).map((button) => button.dataset.amount);
    const open = (x = 0) => game.storageTryOpen({ x, y: 1, z: 0 });
    return { game, panel, sent, activeAmount, open };
}

test('x1 is the first amount and the default', () => {
    assert.equal(ctx.STORAGE_DEFAULT_AMOUNT, 1);
    assert.equal(ctx.STORAGE_AMOUNTS[0], 1);
});

test('a panel opened for the first time has x1 picked, and a click moves one', () => {
    const { game, sent, activeAmount, open } = makeGame();
    assert.equal(open(), true);
    assert.equal(game.storageMode, 1);
    assert.deepEqual(activeAmount(), ['1']);
    game.storagePut('stone');
    const put = sent.find((entry) => entry.type === 'storagePut');
    assert.equal(put.payload.amount, 1);
});

test('what was picked lasts while the panel is open, and not into the next one', () => {
    for (const picked of [10, 0]) {
        const { game, sent, activeAmount, open } = makeGame();
        open();
        game.storageMode = picked;
        game.storageRender();
        assert.deepEqual(activeAmount(), [String(picked)]);
        game.storagePut('stone');
        assert.equal(sent.find((entry) => entry.type === 'storagePut').payload.amount, picked === 0 ? 50 : 10);

        // The same chest again, and another one.
        game.storageClose();
        open();
        assert.equal(game.storageMode, 1, `after ${picked}, the same chest`);
        assert.deepEqual(activeAmount(), ['1']);
        game.storageMode = picked;
        game.storageClose();
        open(5);
        assert.equal(game.storageMode, 1, `after ${picked}, another chest`);
        assert.deepEqual(activeAmount(), ['1']);
    }
});

test('with no amount set at all a click still moves one', () => {
    const { game, sent } = makeGame();
    game.storageAt = { x: 0, y: 1, z: 0 };
    game.storageMode = undefined;
    game.storagePut('stone');
    assert.equal(sent.find((entry) => entry.type === 'storagePut').payload.amount, 1);
});
