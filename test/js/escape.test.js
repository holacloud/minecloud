// Node tests for Escape and the pointer lock (js/game/menus.js), on a stand-in for the browser: a fake page
// that answers lock requests as it is told. How real browsers answer is not tested here, only what the game
// does with each answer; test/js/pointerlock.test.js reads the sources for every exit of the lock.
// Run with: node --test test/js/escape.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js');
const read = (file) => fs.readFileSync(path.join(JS, file), 'utf8');

const flush = () => new Promise((resolve) => setImmediate(resolve));

function fakePage({ answer = 'grant', keyboard = null } = {}) {
    const listeners = { window: [], document: [] };
    const canvas = { locks: 0 };
    const page = { canvas, answer, listeners, timers: [] };
    const elements = new Map();
    const element = (id) => {
        if (!elements.has(id)) {
            const classes = new Set();
            elements.set(id, {
                id, style: {}, classes, textContent: '', value: '', blurred: 0,
                classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
                blur() { this.blurred++; if (document.activeElement === this) document.activeElement = document.body; },
                appendChild() {}, addEventListener() {}, focus() {}
            });
        }
        return elements.get(id);
    };
    const document = {
        pointerLockElement: null, fullscreenElement: null, body: element('body'), activeElement: null,
        getElementById: element, createElement: () => element(`made-${elements.size}`), querySelector: () => null, querySelectorAll: () => [],
        addEventListener: (type, listener) => listeners.document.push([type, listener]),
        exitPointerLock() {
            page.exits = (page.exits || 0) + 1;
            document.pointerLockElement = null;
            page.game && page.game.onPointerLockChange();
        }
    };
    document.activeElement = document.body;
    canvas.requestPointerLock = () => {
        canvas.locks++;
        if (page.answer === 'none') return undefined;
        if (page.answer === 'throw') throw new Error('not now');
        if (page.answer === 'never') return new Promise(() => {});
        if (page.answer === 'refuse') return Promise.reject(new Error('needs a gesture'));
        // Granted: it lands a moment later, as in a browser.
        return Promise.resolve().then(() => {
            document.pointerLockElement = canvas;
            page.game.onPointerLockChange();
        });
    };
    const context = vm.createContext({
        console, Math, Promise, performance: { now: () => page.now || 1000 },
        document, navigator: keyboard ? { keyboard } : {},
        window: { addEventListener: (type, listener, capture) => listeners.window.push([type, listener, capture]), localStorage: { getItem: () => null, setItem() {} } },
        setTimeout: (run, ms) => { const timer = { run, ms }; page.timers.push(timer); return timer; },
        clearTimeout: (timer) => { page.timers = page.timers.filter((other) => other !== timer); }
    });
    page.document = document;
    page.context = context;
    page.element = element;
    // Runs what is due by the clock of the test.
    page.tick = (upTo = Infinity) => {
        const due = page.timers.filter((timer) => timer.ms <= upTo);
        page.timers = page.timers.filter((timer) => timer.ms > upTo);
        due.forEach((timer) => timer.run());
    };
    vm.runInContext('class Game {}', context);
    for (const file of ['extensions.js', 'gameLang.js']) vm.runInContext(read(file), context);
    vm.runInContext(read('game/menus.js'), context);
    return page;
}

function makeGame(options) {
    const page = fakePage(options);
    const game = vm.runInContext('Object.create(Game.prototype)', page.context);
    page.game = game;
    Object.assign(game, {
        renderer: { domElement: page.canvas }, suppressPointerLockPauseUntil: 0,
        stopMining() {}, closeChatInput() { this.chatOpen = false; this.recapturePointerLock(); },
        closeSignReader() { this.signReaderOpen = false; this.recapturePointerLock(); },
        closeInventoryPanel() { this.inventoryOpen = false; this.recapturePointerLock(); },
        closeCraftingPanel() { this.craftingOpen = false; this.recapturePointerLock(); },
        updateSettingsUI() {}, updateTitleScreen() {}, togglePhotoMode() { this.photoMode = !this.photoMode; }
    });
    game.escapeInstall();
    game.keys = (type, event) => {
        const fired = { code: 'Escape', key: 'Escape', repeat: false, target: page.document.body, stopped: 0, prevented: 0, ...event, stopImmediatePropagation() { fired.stopped++; }, preventDefault() { fired.prevented++; } };
        for (const [kind, listener] of page.listeners.window) if (kind === type) listener(fired);
        return fired;
    };
    game.panel = (extra = {}) => {
        const panel = {
            open: true,
            isOpen() { return panel.open; },
            close() { panel.open = false; game.recapturePointerLock(); },
            ...extra
        };
        vm.runInContext('MODAL_PANELS', page.context).push(panel);
        return panel;
    };
    return { page, game };
}

// ---- Who hears it ----

test('Escape is heard first of all, on the window, before anything a panel installs', () => {
    const { page } = makeGame();
    const [type, , capture] = page.listeners.window[0];
    assert.equal(type, 'keydown');
    assert.equal(capture, true);
    const game = read('game.js');
    assert.ok(game.indexOf('this.escapeInstall();') > 0 && game.indexOf('this.escapeInstall();') < game.indexOf('GAME_CONTENT_HOOKS.forEach'), 'before the hooks');
    assert.ok(game.indexOf('GAME_CONTENT_HOOKS.forEach') < game.indexOf('this.initInput();'), 'and before the game\'s own keys');
});

test('with a panel open Escape closes it, whatever has the focus, and nothing else hears it', () => {
    for (const target of [{ tagName: 'INPUT', type: 'text' }, { tagName: 'INPUT', type: 'range' }, { tagName: 'SELECT' }, { tagName: 'CANVAS' }, { tagName: 'BUTTON' }, { tagName: 'BODY' }]) {
        const { game } = makeGame();
        const panel = game.panel();
        const event = game.keys('keydown', { target });
        assert.equal(panel.open, false, target.tagName);
        assert.equal(event.stopped, 1, 'a field\'s stopPropagation or a panel\'s own listener never comes into it');
        assert.equal(event.prevented, 1);
    }
});

test('it closes only one thing for each press: a held key closes no more', () => {
    const { game } = makeGame();
    const panel = game.panel();
    const event = game.keys('keydown', { repeat: true });
    assert.equal(panel.open, true);
    assert.equal(event.stopped, 1, 'and it goes nowhere else either');
});

test('with nothing open it is not stopped: the rest of the game decides', () => {
    const { game } = makeGame();
    const event = game.keys('keydown');
    assert.equal(event.stopped, 0);
    assert.equal(event.prevented, 0);
    assert.equal(game.keys('keydown', { code: 'KeyW', key: 'w' }).stopped, 0);
});

test('every kind of window goes through the same door, the top one first', () => {
    const { game } = makeGame();
    const order = [];
    game.closePauseMenu = () => { game.pauseOpen = false; order.push('pause'); };
    const panel = game.panel({ close() { panel.open = false; order.push('panel'); } });
    Object.assign(game, { pauseOpen: true, craftingOpen: true, inventoryOpen: true, signReaderOpen: true, chatOpen: true, appearanceMenuOpen: true });
    const steps = [];
    while (game.isMenuOpen()) {
        game.keys('keydown');
        game.keys('keyup');
        steps.push([game.appearanceMenuOpen, game.chatOpen, game.signReaderOpen, game.inventoryOpen, game.craftingOpen, panel.open, game.pauseOpen].filter(Boolean).length);
        if (steps.length > 10) assert.fail('it never ends');
    }
    assert.deepEqual(steps, [6, 5, 4, 3, 2, 1, 0]);
    assert.deepEqual(order, ['panel', 'pause']);
});

test('a popover closes first, and the panel on the second press', () => {
    const { game } = makeGame();
    let popover = true;
    const panel = game.panel({ escape() { const was = popover; popover = false; return was; } });
    game.keys('keydown');
    assert.equal(popover, false);
    assert.equal(panel.open, true, 'the panel is still there');
    game.keys('keyup');
    game.keys('keydown');
    assert.equal(panel.open, false);
});

test('the microscope tells the door about its popover', () => {
    const code = read('game/microscope.js');
    assert.match(code, /registerModalPanel\(\{[\s\S]*?escape\(\) \{ return this\.microscopeEscape\(\); \}/);
});

test('a field left with the focus does not keep the keys once its panel is gone', () => {
    const { page, game } = makeGame();
    const box = page.element('inventory-search');
    page.document.activeElement = box;
    game.inventoryOpen = true;
    game.keys('keydown', { target: box });
    assert.equal(game.inventoryOpen, false);
    assert.equal(box.blurred, 1);
    // With a menu still behind it, the focus is that menu's business.
    const behind = makeGame();
    const other = behind.page.element('x');
    behind.page.document.activeElement = other;
    Object.assign(behind.game, { inventoryOpen: true, pauseOpen: true });
    behind.game.keys('keydown', { target: other });
    assert.equal(other.blurred, 0);
});

// ---- Getting the pointer back ----

test('after closing with Escape the pointer comes back when the key is up, with no pause menu and no click', async () => {
    const { page, game } = makeGame();
    const panel = game.panel();
    game.keys('keydown');
    assert.equal(panel.open, false);
    page.tick(0);
    await flush();
    assert.equal(page.canvas.locks, 0, 'not while the key is down: a browser would take it back');
    game.updatePointerLockHint();
    assert.equal(game.pointerLockHint.style.display, 'none', 'and no hint for that instant');
    game.keys('keyup');
    assert.equal(page.canvas.locks, 1);
    await flush();
    assert.equal(page.document.pointerLockElement, page.canvas);
    assert.ok(!game.pauseOpen);
    assert.equal(game.pointerLockHint.style.display, 'none');
});

test('if the key is never heard coming up, the pointer does not wait for ever', async () => {
    const { page, game } = makeGame();
    game.panel();
    game.keys('keydown');
    assert.equal(page.canvas.locks, 0);
    page.tick();
    assert.equal(page.canvas.locks, 1);
    await flush();
    assert.equal(page.document.pointerLockElement, page.canvas);
    assert.equal(game.escapeHeld, false);
});

test('losing the window while it is held counts as coming up', () => {
    const { page, game } = makeGame();
    game.panel();
    game.keys('keydown');
    game.keys('blur');
    assert.equal(game.escapeHeld, false);
    assert.equal(page.canvas.locks, 1);
});

test('another panel opened while waiting keeps the pointer free', () => {
    const { page, game } = makeGame();
    game.panel();
    game.keys('keydown');
    game.panel();
    game.keys('keyup');
    assert.equal(page.canvas.locks, 0);
});

test('where the browser refuses: no pause menu, no error, and a hint to click', async () => {
    for (const answer of ['refuse', 'throw']) {
        const { page, game } = makeGame({ answer });
        game.panel();
        game.keys('keydown');
        game.keys('keyup');
        assert.equal(page.canvas.locks, 1);
        await flush();
        assert.equal(page.document.pointerLockElement, null);
        assert.ok(!game.pauseOpen, answer);
        assert.equal(game.pointerLockPending, false, answer);
        assert.equal(game.pointerLockHint.style.display, 'block', answer);
        assert.equal(game.pointerLockHint.textContent, 'Click to play');
        // The click asks again, now with a gesture.
        page.answer = 'grant';
        game.recapturePointerLockFromGesture();
        assert.equal(page.canvas.locks, 2);
        await flush();
        assert.equal(page.document.pointerLockElement, page.canvas);
        assert.equal(game.pointerLockHint.style.display, 'none');
    }
});

test('a browser that gives no answer, or never answers, does not leave it stuck', async () => {
    for (const [answer, wait] of [['none', 300], ['never', 3000]]) {
        const { page, game } = makeGame({ answer });
        game.panel();
        game.keys('keydown');
        game.keys('keyup');
        assert.equal(game.pointerLockPending, true, answer);
        assert.equal(page.timers.filter((timer) => timer.ms === wait).length, 1, answer);
        page.tick();
        await flush();
        assert.equal(game.pointerLockPending, false, answer);
        assert.equal(game.pointerLockHint.style.display, 'block', answer);
        assert.ok(!game.pauseOpen);
    }
});

test('the pause menu opened by Escape in play closes with Escape, and the refused pointer asks for a click', async () => {
    const { page, game } = makeGame({ answer: 'refuse' });
    const menu = page.element('pause-menu');
    game.closePauseMenu = vm.runInContext('Game.prototype.closePauseMenu', page.context);
    page.document.pointerLockElement = page.canvas;
    // The browser keeps the key: all the page hears is that the lock is gone.
    page.document.pointerLockElement = null;
    game.onPointerLockChange();
    assert.equal(game.pauseOpen, true);
    assert.ok(menu.classes.has('visible'));
    game.keys('keydown');
    assert.equal(game.pauseOpen, false);
    assert.ok(!menu.classes.has('visible'));
    game.keys('keyup');
    await flush();
    assert.ok(!game.pauseOpen, 'it does not come back by surprise');
    assert.equal(game.pointerLockHint.style.display, 'block');
});

// ---- A menu never stays open with the pointer locked ----

test('a lock that lands on a menu that has opened since goes straight back', async () => {
    const { page, game } = makeGame();
    game.recapturePointerLock(false);
    assert.equal(page.canvas.locks, 1, 'on its way');
    game.inventoryOpen = true;
    await flush();
    assert.equal(page.document.pointerLockElement, null, 'freed');
    assert.equal(page.exits, 1);
    assert.ok(!game.pauseOpen);
});

test('and each frame looks, whatever way it came about', () => {
    const { page, game } = makeGame();
    const frame = vm.runInContext('FRAME_UPDATERS', page.context).at(-1);
    page.document.pointerLockElement = page.canvas;
    frame.call(game);
    assert.equal(page.document.pointerLockElement, page.canvas, 'in play it stays');
    game.panel();
    frame.call(game);
    assert.equal(page.document.pointerLockElement, null);
    assert.ok(!game.pauseOpen, 'and that is no pause');
});

test('nothing asks for the pointer with a window open', () => {
    const { page, game } = makeGame();
    for (const flag of ['appearanceMenuOpen', 'chatOpen', 'signReaderOpen', 'inventoryOpen', 'craftingOpen', 'pauseOpen', 'titleScreenOpen', 'respawnPending']) {
        game[flag] = true;
        game.recapturePointerLock(false);
        assert.equal(page.canvas.locks, 0, flag);
        game[flag] = false;
    }
    const panel = game.panel();
    game.recapturePointerLock(false);
    assert.equal(page.canvas.locks, 0);
    panel.open = false;
    game.touchControlsEnabled = true;
    game.recapturePointerLock(false);
    assert.equal(page.canvas.locks, 0, 'a touch screen never had it');
});

// ---- Every window of the game ----

test('every window frees the pointer on opening', () => {
    const opening = {
        'game/inventory.js': ['openInventoryPanel() {', 'openCraftingPanel() {'],
        'game/social.js': ['openChatInput(prefill', 'this.signReaderOpen = true;'],
        'game/menus.js': ['openPauseMenu() {'],
        'game/guide.js': ['guideShow(id'], 'game/bestiary.js': ['bestiaryShow() {'], 'game/blueprints.js': ['blueprintShow() {'],
        'game/robot.js': ['this.robotPanelOpen = true;'], 'game/genetics.js': ['this.geneticsOpen = true;'], 'game/astronomy.js': ['this.astroChartOpen = true;'],
        'game/chemistry.js': ['this.chemistryOpen = true;'], 'game/storage.js': ['this.storageOpenedAt ='], 'game/glow_block.js': ['this.glowAt ='],
        'game/microscope.js': ['microscopeShowPanel(asking) {'], 'game/cultures.js': ['cultureTryOpen(position) {'], 'game/cinematic.js': ['this.cinematicPanelOpen = true;']
    };
    for (const [file, marks] of Object.entries(opening)) {
        const text = read(file);
        for (const mark of marks) {
            const at = text.indexOf(mark);
            assert.ok(at >= 0, `${file}: ${mark}`);
            const near = text.slice(at, at + 1800);
            assert.match(near, /document\.exitPointerLock\(\)/, `${file}: ${mark}`);
        }
    }
    // Every modal panel in the game is on that list, or has no pointer to free.
    const dir = path.join(JS, 'game');
    const panels = fs.readdirSync(dir).filter((name) => /registerModalPanel\(\{/.test(fs.readFileSync(path.join(dir, name), 'utf8')));
    for (const name of panels) assert.ok(`game/${name}` in opening || name === 'touch.js', `${name} is not checked`);
    assert.ok(panels.length >= 12, panels.join());
});

// ---- The odd ones ----

test('Escape behind the title screen does not leave a pause menu waiting unseen', () => {
    const game = read('game.js');
    const method = game.slice(game.indexOf('    onKeyDown(event) {'), game.indexOf('    onWheel(event) {'));
    assert.ok(method.indexOf('if (this.titleScreenOpen) return;') > 0);
    assert.ok(method.indexOf('if (this.titleScreenOpen) return;') < method.indexOf('this.togglePauseMenu();'));
});

test('the pause menu leaves photo mode, which would hide it', () => {
    const { game } = makeGame();
    game.photoMode = true;
    game.openPauseMenu();
    assert.equal(game.photoMode, false);
    assert.equal(game.pauseOpen, true);
    // A shot uses photo mode and has its own Escape.
    const shot = makeGame();
    Object.assign(shot.game, { photoMode: true, cinematic: {} });
    shot.game.openPauseMenu();
    assert.equal(shot.game.photoMode, true);
});

test('in fullscreen it asks Chromium for Escape, and copes without it', async () => {
    const asked = [];
    const keyboard = { lock(keys) { asked.push(keys); return Promise.reject(new Error('no')); }, unlock() { asked.push('unlock'); } };
    const { page, game } = makeGame({ keyboard });
    page.document.fullscreenElement = {};
    game.syncKeyboardLock();
    await flush();
    assert.deepEqual(JSON.parse(JSON.stringify(asked)), [['Escape']]);
    page.document.fullscreenElement = null;
    game.syncKeyboardLock();
    assert.equal(asked[1], 'unlock');
    const without = makeGame();
    without.page.document.fullscreenElement = {};
    without.game.syncKeyboardLock();
    assert.match(read('game/menus.js'), /'fullscreenchange', \(\) => \{\s+this\.updateSettingsUI\(\);\s+this\.syncKeyboardLock\(\);/);
});
