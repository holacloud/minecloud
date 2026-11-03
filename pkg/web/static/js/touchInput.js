// Plain logic behind the touch controls (js/game/touch.js): whether to show them, the
// joystick's response, the look gesture (tap / hold / drag) and the on-screen layout, so the
// buttons never cover the hotbar. No DOM here; loaded before game.js and by the Node tests.

// Touch controls for phones and tablets (a coarse primary pointer, or touch with no fine
// pointer at all), not for touchscreen laptops driven by a mouse. `override` comes from
// ?touch=1 / ?touch=0 in the URL.
function shouldUseTouchControls({ coarse = false, anyFine = true, touchPoints = 0, override = null } = {}) {
    if (override === true || override === false) return override;
    if (coarse) return true;
    return touchPoints > 0 && !anyFine;
}

// Joystick knob offset (dx, dy, in px from the centre, screen y down) to a move vector:
// x right, y forward, length 0..1. Inside the dead zone it is zero; past it the length grows
// from 0 so small pushes walk smoothly. `magnitude` is the clamped push, for sprinting.
function touchJoystickVector(dx, dy, radius, deadZone = 0.12) {
    const distance = Math.hypot(dx, dy);
    if (radius <= 0 || distance === 0) return { x: 0, y: 0, magnitude: 0, knobX: 0, knobY: 0 };
    const magnitude = Math.min(1, distance / radius);
    const knobX = dx / distance * magnitude * radius;
    const knobY = dy / distance * magnitude * radius;
    if (magnitude <= deadZone) return { x: 0, y: 0, magnitude, knobX, knobY };
    const strength = (magnitude - deadZone) / (1 - deadZone);
    return { x: dx / distance * strength, y: -dy / distance * strength, magnitude, knobX, knobY };
}

// The joystick drives like a vehicle: its vertical axis walks forward and back, its horizontal
// axis turns the body. Each axis has its own dead zone so walking straight never drifts into a
// turn, and the turn grows with the square of the push for fine aiming. Returns
// { forward, turn } in -1..1, turn > 0 to the right.
function touchJoystickDrive(vector, deadZone = 0.18) {
    const axis = (value) => {
        const size = Math.abs(value);
        if (size <= deadZone) return 0;
        return Math.sign(value) * Math.min(1, (size - deadZone) / (1 - deadZone));
    };
    const forward = axis(vector.y);
    const turn = axis(vector.x);
    return { forward, turn: Math.sign(turn) * turn * turn };
}

// How much a finger drag turns the view, as "mouse pixels" per screen pixel (the camera then
// applies the look sensitivity). A swipe across the short side of the screen turns about
// 120 degrees at sensitivity 1, whatever the screen size.
function touchLookScale(width, height) {
    const shortSide = Math.max(240, Math.min(width, height));
    return 1050 / shortSide;
}

// Whether two presses `previousAt` and `now` (ms) make a double tap.
function isDoubleTap(previousAt, now, windowMs = 300) {
    return now - previousAt >= 0 && now - previousAt < windowMs;
}

const TOUCH_GESTURE_DEFAULTS = { slop: 10, holdMs: 260 };

// One finger on the world: a quick tap uses / places, holding still mines, dragging looks.
// start(), then move() for every pointer move (returns the look delta to apply), poll() every
// frame (returns 'hold' once when the finger has rested long enough) and end() on release
// ('tap', 'hold' or 'drag'). Until the finger travels `slop` px the view stays put, so taps
// land where the crosshair was; once holding, the view follows the finger at once.
class TouchGesture {
    constructor(x, y, now, options = {}) {
        this.slop = options.slop ?? TOUCH_GESTURE_DEFAULTS.slop;
        this.holdMs = options.holdMs ?? TOUCH_GESTURE_DEFAULTS.holdMs;
        this.startX = x;
        this.startY = y;
        this.lastX = x;
        this.lastY = y;
        this.startedAt = now;
        this.state = 'pending';
    }

    move(x, y) {
        let dx = x - this.lastX;
        let dy = y - this.lastY;
        if (this.state === 'pending') {
            if (Math.hypot(x - this.startX, y - this.startY) < this.slop) return { dx: 0, dy: 0 };
            this.state = 'drag';
            // The whole way from the touch point, so the view does not lag behind the finger.
            dx = x - this.startX;
            dy = y - this.startY;
        }
        this.lastX = x;
        this.lastY = y;
        return { dx, dy };
    }

    poll(now) {
        if (this.state !== 'pending' || now - this.startedAt < this.holdMs) return null;
        this.state = 'hold';
        return 'hold';
    }

    end(now) {
        if (this.state === 'pending') {
            this.poll(now);
            if (this.state === 'pending') return 'tap';
        }
        return this.state;
    }
}

// Where everything goes on a width x height screen (CSS px) with the given safe-area insets.
// The joystick sits bottom-left, the action buttons (2 x 2) bottom-right, the sprint button
// above the joystick. On wide screens the hotbar fits between them; otherwise it takes the
// bottom row and the controls rise above it ("stacked"). All values are px.
const TOUCH_HOTBAR_SLOTS = 8;
const TOUCH_HOTBAR_GAP = 4;
// Hotbar padding + border on each side.
const TOUCH_HOTBAR_FRAME = 6;

function touchHotbarWidth(slot) {
    return TOUCH_HOTBAR_SLOTS * slot + (TOUCH_HOTBAR_SLOTS - 1) * TOUCH_HOTBAR_GAP + 2 * TOUCH_HOTBAR_FRAME;
}

function computeTouchLayout({ width, height, insets = {} }) {
    const top = insets.top || 0;
    const right = insets.right || 0;
    const bottom = insets.bottom || 0;
    const left = insets.left || 0;
    const pad = 12;
    const gap = 12;
    const shortSide = Math.min(width, height);
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const button = Math.round(clamp(shortSide * 0.15, 52, 70));
    const buttonGap = 10;
    const clusterWidth = 2 * button + buttonGap;
    const clusterHeight = 2 * button + buttonGap;
    const joystick = Math.round(clamp(shortSide * 0.32, 104, 150));
    const sprint = Math.round(button * 0.72);
    const sideLeft = left + pad;
    const sideRight = right + pad;

    // Side by side: the hotbar between the joystick and the buttons, centred on the screen.
    const reserve = Math.max(left, right) + pad + Math.max(joystick, clusterWidth) + gap;
    const between = width - 2 * reserve;
    const wideSlot = Math.min(52, Math.floor((between - touchHotbarWidth(0)) / TOUCH_HOTBAR_SLOTS));
    const stacked = wideSlot < 36;

    let slot;
    let hotbarBottom;
    let controlsBottom;
    if (stacked) {
        // As wide as the screen allows, but not so tall that a short screen loses its middle.
        const fit = Math.floor((width - left - right - 2 * pad - touchHotbarWidth(0)) / TOUCH_HOTBAR_SLOTS);
        slot = Math.max(28, Math.min(52, fit, Math.floor(height * 0.1)));
        hotbarBottom = Math.max(bottom, 4) + 6;
        controlsBottom = hotbarBottom + slot + 2 * TOUCH_HOTBAR_FRAME + 14;
    } else {
        slot = wideSlot;
        hotbarBottom = bottom + pad;
        controlsBottom = bottom + pad;
    }
    const hotbarHeight = slot + 2 * TOUCH_HOTBAR_FRAME;
    const hotbarWidth = touchHotbarWidth(slot);
    // The top bar (menu, inventory and chat buttons) and the chat log below it.
    const topBar = top + 8;
    const topButton = 44;
    const chatTop = topBar + topButton + 8;
    const controlsTop = height - (controlsBottom + Math.max(joystick + 10 + sprint, clusterHeight));
    const chatMaxHeight = Math.max(48, Math.min(180, controlsTop - chatTop - 8));

    return {
        stacked, slot, hotbarBottom, hotbarHeight, hotbarWidth, controlsBottom,
        joystick, button, buttonGap, clusterWidth, clusterHeight, sprint,
        sideLeft, sideRight, topBar, topButton, chatTop, chatMaxHeight
    };
}

// The layout's boxes as { left, top, right, bottom } in screen px (y down), to check overlaps.
function touchLayoutRects(layout, width, height) {
    const fromBottom = (left, bottomOffset, w, h) => ({ left, right: left + w, bottom: height - bottomOffset, top: height - bottomOffset - h });
    const hotbarLeft = (width - layout.hotbarWidth) / 2;
    return {
        hotbar: fromBottom(hotbarLeft, layout.hotbarBottom, layout.hotbarWidth, layout.hotbarHeight),
        joystick: fromBottom(layout.sideLeft, layout.controlsBottom, layout.joystick, layout.joystick),
        sprint: fromBottom(layout.sideLeft, layout.controlsBottom + layout.joystick + 10, layout.sprint, layout.sprint),
        buttons: fromBottom(width - layout.sideRight - layout.clusterWidth, layout.controlsBottom, layout.clusterWidth, layout.clusterHeight),
        topBar: { left: layout.sideLeft, right: layout.sideLeft + 3 * layout.topButton + 16, top: layout.topBar, bottom: layout.topBar + layout.topButton }
    };
}

function touchRectsOverlap(a, b) {
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        shouldUseTouchControls, touchJoystickVector, touchJoystickDrive, touchLookScale, isDoubleTap, TouchGesture,
        computeTouchLayout, touchLayoutRects, touchRectsOverlap, touchHotbarWidth
    };
}
