// Node tests for the search of the inventory and crafting panels (js/game/inventory.js) on a small stand-in
// for the page: every opening starts empty, with the whole list, and the selected recipe is one on show.
// Run with: node --test test/js/panel_search.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js');
const read = (file) => fs.readFileSync(path.join(JS, file), 'utf8');

function makeElement(id = '') {
    const classes = new Set();
    const element = {
        id, style: {}, dataset: {}, children: [], value: '', title: '', textContent: '', focused: 0, listeners: {},
        classList: {
            add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name),
            toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name); return Boolean(on); }
        },
        set className(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach((name) => classes.add(name)); },
        get className() { return [...classes].join(' '); },
        set innerHTML(value) { this.children = []; this.html = value; },
        get innerHTML() { return this.html || ''; },
        appendChild(child) { this.children.push(child); return child; },
        addEventListener(type, listener) { (this.listeners[type] = this.listeners[type] || []).push(listener); },
        setAttribute() {},
        focus() { this.focused++; },
        click() { (this.listeners.click || []).forEach((listener) => listener({ preventDefault() {} })); }
    };
    return element;
}

function makeGame({ touch = false } = {}) {
    const elements = new Map();
    const document = {
        pointerLockElement: null,
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, makeElement(id));
            return elements.get(id);
        },
        createElement: () => makeElement()
    };
    const context = vm.createContext({ console, Math, document, window: { localStorage: { getItem: () => null, setItem() {} } } });
    vm.runInContext('class Game {}', context);
    vm.runInContext(read('game/inventory.js'), context, { filename: 'inventory.js' });
    const game = new (vm.runInContext('Game', context))();
    const block = (name) => ({ name, color: 0x808080 });
    Object.assign(game, {
        world: {
            blockTypes: { stone: block('Stone'), dirt: block('Dirt'), planks: block('Planks'), stick: block('Stick') },
            getInventoryIconUrl: () => ''
        },
        inventory: ['stone', 'dirt', 'planks'],
        inventoryCounts: { stone: 3, dirt: 2, planks: 1 },
        selectedSlot: 0, hotbarSize: 9, hotbarPinnedTypes: [], touchControlsEnabled: touch,
        craftingOpen: false, inventoryOpen: false, craftingSearchTerm: '', inventorySearchTerm: '', selectedCraftingRecipeId: null,
        craftingRecipes: [
            { id: 'sticks', name: 'Sticks', output: { type: 'stick', amount: 4 }, inputs: [{ type: 'planks', amount: 2 }] },
            { id: 'planks', name: 'Planks', output: { type: 'planks', amount: 4 }, inputs: [{ type: 'dirt', amount: 1 }] },
            { id: 'stone', name: 'Stone', output: { type: 'stone', amount: 1 }, inputs: [{ type: 'dirt', amount: 1 }] }
        ],
        stopMining() {}, closeChatInput() {}, recapturePointerLock() {}, renderer: { domElement: {} }
    });
    const search = (panel, text) => {
        // What the listener in js/game.js does for each key.
        document.getElementById(`${panel}-search`).value = text;
        game[`${panel}SearchTerm`] = text;
        if (panel === 'inventory') game.renderInventoryPanel(); else game.renderCraftingPanel();
    };
    const items = () => document.getElementById('inventory-grid').children.filter((child) => child.className.includes('inventory-item'));
    const recipes = () => document.getElementById('crafting-recipes').children.filter((child) => child.className.includes('craft-card'));
    return { game, document, search, items, recipes };
}

test('opening the inventory forgets the last search', () => {
    const { game, document, search, items } = makeGame();
    game.openInventoryPanel();
    assert.equal(items().length, 3);
    search('inventory', 'sto');
    assert.equal(items().length, 1);
    game.closeInventoryPanel();
    assert.equal(game.inventorySearchTerm, 'sto', 'closing touches nothing');
    game.openInventoryPanel();
    assert.equal(game.inventorySearchTerm, '');
    assert.equal(document.getElementById('inventory-search').value, '');
    assert.equal(items().length, 3);
    assert.equal(document.getElementById('inventory-search').focused, 2, 'the field still takes the keys');
});

test('opening the crafting window forgets the last search', () => {
    const { game, document, search, recipes } = makeGame();
    game.openCraftingPanel();
    assert.equal(recipes().length, 3);
    search('crafting', 'stone');
    assert.equal(recipes().length, 1);
    game.closeCraftingPanel();
    game.openCraftingPanel();
    assert.equal(game.craftingSearchTerm, '');
    assert.equal(document.getElementById('crafting-search').value, '');
    assert.equal(recipes().length, 3);
});

test('a search that hid the selected recipe leaves a visible one selected on the next opening', () => {
    const { game, document, search, recipes } = makeGame();
    game.openCraftingPanel();
    game.selectedCraftingRecipeId = 'planks';
    search('crafting', 'stone');
    assert.equal(game.selectedCraftingRecipeId, null, 'the hidden recipe is not left selected');
    assert.equal(document.getElementById('crafting-detail').classList.contains('visible'), false);
    game.closeCraftingPanel();
    game.openCraftingPanel();
    assert.equal(game.selectedCraftingRecipeId, 'sticks');
    assert.ok(recipes().some((card) => card.className.includes('selected')));
    assert.equal(document.getElementById('crafting-detail').classList.contains('visible'), true);
});

test('a selection the search left alone stays', () => {
    const { game, search } = makeGame();
    game.openCraftingPanel();
    game.selectedCraftingRecipeId = 'stone';
    search('crafting', 'stone');
    assert.equal(game.selectedCraftingRecipeId, 'stone');
    game.closeCraftingPanel();
    game.openCraftingPanel();
    assert.equal(game.selectedCraftingRecipeId, 'stone');
});

test('on a phone the field is emptied too, without popping up the keyboard', () => {
    const { game, document, search, items } = makeGame({ touch: true });
    game.openInventoryPanel();
    search('inventory', 'sto');
    game.closeInventoryPanel();
    game.openInventoryPanel();
    assert.equal(document.getElementById('inventory-search').value, '');
    assert.equal(items().length, 3);
    assert.equal(document.getElementById('inventory-search').focused, 0);
});
