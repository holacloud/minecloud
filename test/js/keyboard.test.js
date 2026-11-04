// Node tests for the keyboard against text fields: what is typed in a panel never moves the player
// or fires a shortcut, and no key stays held behind a panel. The real CameraController runs, with
// stand-ins for the document. Run with: node --test test/js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js');
const read = (file) => fs.readFileSync(path.join(JS, file), 'utf8');

function makeController() {
    const listeners = {};
    const document = {
        pointerLockElement: null,
        addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); }
    };
    const anyStub = () => new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
    const context = vm.createContext({ document, performance: { now: () => 0 }, THREE: anyStub(), console, Math });
    vm.runInContext(`${read('camera.js')}\nthis.CameraController = CameraController; this.isTextEntryTarget = isTextEntryTarget;`, context, { filename: 'camera.js' });
    const dom = {};
    const controller = new context.CameraController({ position: { x: 0, y: 0, z: 0, set() {} }, rotation: {} }, dom);
    const fire = (type, code, target) => {
        const event = { code, target, repeat: false, prevented: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
        (listeners[type] || []).forEach((fn) => fn(event));
        return event;
    };
    const lock = (locked) => {
        document.pointerLockElement = locked ? dom : null;
        (listeners.pointerlockchange || []).forEach((fn) => fn());
    };
    return { controller, fire, lock, context };
}

const SEARCH = { tagName: 'INPUT', type: 'text' };
const MOVEMENT = { KeyW: 'forward', KeyS: 'backward', KeyA: 'left', KeyD: 'right', Space: 'jump', ShiftLeft: 'crouch', ShiftRight: 'crouch' };

test('typing in a panel\'s search does not move the player, with or without the pointer', () => {
    for (const locked of [false, true]) {
        const { controller, fire, lock } = makeController();
        lock(locked);
        for (const [code, key] of Object.entries(MOVEMENT)) {
            const event = fire('keydown', code, SEARCH);
            assert.equal(controller.keys[key], false, `${code}, locked: ${locked}`);
            assert.equal(event.prevented, false, `${code} still reaches the field`);
        }
    }
});

test('a text field on a touch screen with a keyboard takes the keys too', () => {
    const { controller, fire } = makeController();
    controller.setTouchControlsEnabled(true);
    const event = fire('keydown', 'KeyW', SEARCH);
    assert.equal(controller.keys.forward, false);
    assert.equal(event.prevented, false, 'the letter is typed');
});

test('with the pointer locked the keys move the player as ever, whatever keeps the focus', () => {
    const { controller, fire, lock } = makeController();
    lock(true);
    for (const target of [null, { tagName: 'BODY' }, { tagName: 'INPUT', type: 'range' }, { tagName: 'INPUT', type: 'color' }]) {
        for (const [code, key] of Object.entries(MOVEMENT)) {
            const event = fire('keydown', code, target);
            assert.equal(controller.keys[key], true, code);
            assert.equal(event.prevented, true, code);
            fire('keyup', code, target);
            assert.equal(controller.keys[key], false, code);
        }
    }
});

test('a key held when a panel takes the pointer lets go; the release is heard from anywhere', () => {
    const { controller, fire, lock } = makeController();
    lock(true);
    fire('keydown', 'KeyW', null);
    fire('keydown', 'ShiftLeft', null);
    controller.sprintLatch = true;
    lock(false);
    assert.equal(controller.keys.forward, false);
    assert.equal(controller.keys.crouch, false);
    assert.equal(controller.sprintLatch, false);
    // Pressed behind the panel: nothing, and nothing when the pointer comes back.
    fire('keydown', 'KeyW', null);
    assert.equal(controller.keys.forward, false);
    lock(true);
    assert.equal(controller.keys.forward, false);
    // Pressed in the world, let go in a field.
    fire('keydown', 'KeyA', null);
    fire('keyup', 'KeyA', SEARCH);
    assert.equal(controller.keys.left, false);
});

test('a panel with no pointer lock to lose (touch) stops the keys and lets go of them, not of the Sneak latch', () => {
    const { controller, fire } = makeController();
    let active = true;
    controller.setTouchControlsEnabled(true);
    controller.setGameplayCheck(() => active);
    fire('keydown', 'KeyD', null);
    controller.keys.crouch = true;
    assert.equal(controller.keys.right, true);
    active = false;
    assert.equal(controller.keysReachPlayer(), false);
    controller.releaseKeys();
    assert.equal(controller.keys.right, false);
    assert.equal(controller.keys.crouch, true);
    fire('keydown', 'KeyS', null);
    assert.equal(controller.keys.backward, false);
    assert.match(read('camera.js'), /update\(delta\) \{\s*if \(!this\.keysReachPlayer\(\)\) this\.releaseKeys\(\);/, 'every frame');
    assert.match(read('game.js'), /setGameplayCheck\(\(\) => this\.isGameplayActive\(\)\)/);
});

test('what counts as typing', () => {
    const { context } = makeController();
    const typed = [{ tagName: 'INPUT', type: 'text' }, { tagName: 'INPUT', type: 'number' }, { tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'DIV', isContentEditable: true }];
    for (const target of typed) assert.equal(context.isTextEntryTarget(target), true, JSON.stringify(target));
    const not = [null, undefined, { tagName: 'BODY' }, { tagName: 'SELECT' }, { tagName: 'INPUT', type: 'range' }, { tagName: 'INPUT', type: 'color' }, { tagName: 'INPUT', type: 'checkbox' }, { tagName: 'CANVAS' }];
    for (const target of not) assert.equal(context.isTextEntryTarget(target), false, JSON.stringify(target));
});

test('the shortcuts of the game wait for the text fields and for gameplay', () => {
    const game = read('game.js');
    const method = game.slice(game.indexOf('    onKeyDown(event) {'), game.indexOf('    onWheel(event) {'));
    const guard = method.indexOf('if (isTextEntryTarget(event.target)) return;');
    assert.ok(guard > 0, 'onKeyDown leaves text fields alone');
    assert.ok(guard < method.indexOf("event.code === 'KeyC'"), 'before the first shortcut');
    assert.ok(method.indexOf("if (event.code === 'Escape'") < guard, 'Escape still closes the panel');
    const active = method.indexOf('if (!this.isGameplayActive())');
    assert.ok(active > 0 && active < method.indexOf("event.code === 'KeyF'"), 'nothing fires behind a menu');
});

test('the panels with fields of their own stop every key at the window while they are open', () => {
    const anchors = {
        'game/robot.js': "if (!this.robotPanelOpen) return;\n            const typing",
        'game/cinematic.js': 'if (this.cinematicPanelOpen) {\n            const typing',
        'game/guide.js': 'if (this.guideOpen) {\n            const typing',
        'game/blueprints.js': 'if (this.blueprintOpen) {\n            if (event.code ==='
    };
    for (const [file, anchor] of Object.entries(anchors)) {
        const text = read(file);
        const listener = text.indexOf(anchor);
        assert.ok(listener >= 0, file);
        assert.match(text.slice(listener, listener + 1400), /stopImmediatePropagation/, file);
    }
});
