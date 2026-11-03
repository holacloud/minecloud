// Node tests for the touch controls' plain logic (js/touchInput.js): when they turn on, the
// joystick, the tap / hold / drag gesture, the look speed and the layout (no control may cover
// the hotbar or another control on common phone and tablet screens), plus the jump press of
// js/camera.js that the touch Jump button shares with Space (double tap to fly).
// Run with: node --test test/js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js');
const T = require(path.join(JS, 'touchInput.js'));

test('touch controls: phones and tablets yes, desktops and touchscreen laptops no', () => {
    assert.equal(T.shouldUseTouchControls({ coarse: true, anyFine: false, touchPoints: 5 }), true);
    // An iPad with a trackpad still has a coarse primary pointer.
    assert.equal(T.shouldUseTouchControls({ coarse: true, anyFine: true, touchPoints: 5 }), true);
    assert.equal(T.shouldUseTouchControls({ coarse: false, anyFine: true, touchPoints: 0 }), false);
    // A touchscreen laptop driven by a mouse keeps the desktop controls.
    assert.equal(T.shouldUseTouchControls({ coarse: false, anyFine: true, touchPoints: 10 }), false);
    assert.equal(T.shouldUseTouchControls({ coarse: false, anyFine: false, touchPoints: 1 }), true);
    // ?touch=1 / ?touch=0 win.
    assert.equal(T.shouldUseTouchControls({ coarse: false, anyFine: true, override: true }), true);
    assert.equal(T.shouldUseTouchControls({ coarse: true, anyFine: false, touchPoints: 5, override: false }), false);
});

test('joystick: dead zone, analog push, clamped knob, forward is up', () => {
    const still = T.touchJoystickVector(0, 0, 50);
    assert.equal(still.x, 0);
    assert.equal(still.y, 0);
    const tiny = T.touchJoystickVector(3, 0, 50);
    assert.equal(tiny.x, 0);
    assert.ok(tiny.magnitude > 0);
    const up = T.touchJoystickVector(0, -50, 50);
    assert.ok(Math.abs(up.x) < 1e-9);
    assert.ok(Math.abs(up.y - 1) < 1e-9);
    const half = T.touchJoystickVector(25, 0, 50);
    assert.ok(half.x > 0.3 && half.x < 0.5);
    // Beyond the ring the push stays at 1 and the knob at the edge.
    const far = T.touchJoystickVector(-300, 400, 50);
    assert.equal(far.magnitude, 1);
    assert.ok(Math.abs(Math.hypot(far.knobX, far.knobY) - 50) < 1e-9);
    assert.ok(Math.abs(Math.hypot(far.x, far.y) - 1) < 1e-9);
    assert.ok(far.y < 0 && far.x < 0);
});

test('look speed: about the same turn for a swipe across any screen', () => {
    const turn = (w, h) => Math.min(w, h) * T.touchLookScale(w, h) * 0.002;
    for (const [w, h] of [[390, 844], [844, 390], [768, 1024], [360, 640]]) {
        assert.ok(Math.abs(turn(w, h) - 2.1) < 0.01, `${w}x${h}`);
    }
});

test('double tap window', () => {
    assert.equal(T.isDoubleTap(1000, 1200), true);
    assert.equal(T.isDoubleTap(1000, 1400), false);
    assert.equal(T.isDoubleTap(-Infinity, 50), false);
});

test('gesture: a quick still touch is a tap and does not turn the view', () => {
    const g = new T.TouchGesture(100, 100, 0);
    assert.deepEqual(g.move(104, 103), { dx: 0, dy: 0 });
    assert.equal(g.poll(100), null);
    assert.equal(g.end(150), 'tap');
});

test('gesture: resting still becomes a hold (mine) once, and the view then follows', () => {
    const g = new T.TouchGesture(100, 100, 0);
    assert.equal(g.poll(200), null);
    assert.equal(g.poll(300), 'hold');
    assert.equal(g.poll(400), null);
    assert.deepEqual(g.move(103, 100), { dx: 3, dy: 0 });
    assert.equal(g.end(900), 'hold');
    // A release after the hold time without a frame in between still counts as a hold.
    assert.equal(new T.TouchGesture(0, 0, 0).end(1000), 'hold');
});

test('gesture: moving past the slop is a drag that turns by the whole movement', () => {
    const g = new T.TouchGesture(100, 100, 0);
    assert.deepEqual(g.move(106, 100), { dx: 0, dy: 0 });
    assert.deepEqual(g.move(115, 100), { dx: 15, dy: 0 });
    assert.deepEqual(g.move(120, 90), { dx: 5, dy: -10 });
    // A drag never turns into a hold or a tap.
    assert.equal(g.poll(5000), null);
    assert.equal(g.end(5000), 'drag');
});

const SCREENS = [
    // Phones in portrait and landscape, with notches / home indicators, and tablets.
    [320, 568, {}], [568, 320, {}],
    [360, 640, {}], [640, 360, {}],
    [360, 800, { top: 24 }], [800, 360, { left: 24 }],
    [375, 667, {}], [667, 375, {}],
    [390, 844, { top: 47, bottom: 34 }], [844, 390, { left: 47, right: 47, bottom: 21 }],
    [393, 852, { top: 59, bottom: 34 }], [852, 393, { left: 59, right: 59, bottom: 21 }],
    [412, 915, { top: 24 }], [915, 412, { left: 24 }],
    [430, 932, { top: 59, bottom: 34 }], [932, 430, { left: 59, right: 59, bottom: 21 }],
    [768, 1024, { top: 24, bottom: 20 }], [1024, 768, { top: 24, bottom: 20 }],
    [820, 1180, { top: 24, bottom: 20 }], [1180, 820, { top: 24, bottom: 20 }]
];

test('layout: no control overlaps the hotbar or another control', () => {
    for (const [width, height, insets] of SCREENS) {
        const layout = T.computeTouchLayout({ width, height, insets });
        const rects = T.touchLayoutRects(layout, width, height);
        const names = Object.keys(rects);
        for (let i = 0; i < names.length; i++) {
            for (let j = i + 1; j < names.length; j++) {
                assert.ok(!T.touchRectsOverlap(rects[names[i]], rects[names[j]]),
                    `${names[i]} overlaps ${names[j]} on ${width}x${height}`);
            }
        }
    }
});

test('layout: everything on screen, inside the safe area, and big enough for a thumb', () => {
    for (const [width, height, insets] of SCREENS) {
        const layout = T.computeTouchLayout({ width, height, insets });
        const rects = T.touchLayoutRects(layout, width, height);
        for (const [name, rect] of Object.entries(rects)) {
            const where = `${name} on ${width}x${height}`;
            assert.ok(rect.left >= (insets.left || 0), where);
            assert.ok(rect.right <= width - (insets.right || 0), where);
            assert.ok(rect.top >= (insets.top || 0), where);
            assert.ok(rect.bottom <= height - (insets.bottom || 0), where);
        }
        assert.ok(layout.slot >= 32, `slot on ${width}x${height}`);
        assert.ok(layout.button >= 52, `button on ${width}x${height}`);
        assert.equal(layout.hotbarWidth, T.touchHotbarWidth(layout.slot));
        assert.ok(layout.chatMaxHeight >= 48);
    }
});

test('layout: portrait phones stack the controls above the hotbar; wide screens put it between', () => {
    assert.equal(T.computeTouchLayout({ width: 390, height: 844 }).stacked, true);
    const wide = T.computeTouchLayout({ width: 844, height: 390, insets: { left: 47, right: 47, bottom: 21 } });
    assert.equal(wide.stacked, false);
    assert.ok(wide.slot >= 44);
    // Stacked: the controls start above the hotbar.
    const tall = T.computeTouchLayout({ width: 390, height: 844, insets: { bottom: 34 } });
    assert.ok(tall.controlsBottom >= tall.hotbarBottom + tall.hotbarHeight);
    assert.ok(tall.hotbarBottom >= 34);
});

// js/camera.js with a stub document, for the jump press shared by Space and the touch button.
function loadCameraController() {
    const context = vm.createContext({ console, Math, performance: { now: () => 0 }, document: { addEventListener() {} } });
    vm.runInContext(fs.readFileSync(path.join(JS, 'camera.js'), 'utf8') + '\nthis.CameraController = CameraController;', context);
    return new context.CameraController({ position: { x: 0, y: 0, z: 0 } }, {});
}

test('jump: a double tap toggles flight only where it is allowed', () => {
    const controller = loadCameraController();
    controller.pressJump(1000);
    controller.pressJump(1100);
    assert.equal(controller.flying, false);
    assert.equal(controller.jumpPressedAt, 1100);

    controller.flightAllowed = true;
    controller.pressJump(2000);
    assert.equal(controller.flying, false);
    controller.pressJump(2200);
    assert.equal(controller.flying, true);
    // A third quick press starts a new pair instead of toggling again.
    controller.pressJump(2300);
    assert.equal(controller.flying, true);
    controller.pressJump(2400);
    assert.equal(controller.flying, false);
    // Slow presses never toggle; riding never flies.
    controller.pressJump(5000);
    controller.pressJump(5600);
    assert.equal(controller.flying, false);
    controller.mount = { eyeHeight: 2 };
    controller.pressJump(7000);
    controller.pressJump(7100);
    assert.equal(controller.flying, false);
});

test('joystick drive: vertical axis walks, horizontal axis turns, separate dead zones', () => {
    const straight = T.touchJoystickDrive({ x: 0.1, y: 1 });
    assert.equal(straight.turn, 0);
    assert.equal(straight.forward, 1);
    const right = T.touchJoystickDrive({ x: 1, y: 0 });
    assert.equal(right.forward, 0);
    assert.equal(right.turn, 1);
    const halfLeft = T.touchJoystickDrive({ x: -0.59, y: 0 });
    assert.ok(halfLeft.turn < -0.2 && halfLeft.turn > -0.3);
    assert.deepEqual(T.touchJoystickDrive({ x: 0, y: 0 }), { forward: 0, turn: 0 });
});
