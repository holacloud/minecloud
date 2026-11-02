// Logic and sensors: levers, push buttons, pressure plates, sensors (daylight, proximity,
// rain) and logic gates (AND, OR, XOR, NOT, delay, latch) that switch electric networks.
// - The SERVER decides everything (pkg/network/logic.go), on the power tick (5 times a
//   second): a logic block is a switch in the wire. ON, it conducts and joins the networks
//   around it; OFF, it cuts them apart. Gates never conduct through their INPUT faces.
// - Inputs read a SIGNAL: the block touching the input face belongs to a network with power
//   available or with a switched-on logic block in it (a lever touching a gate is enough).
// - Gates face the way the player looks when placing them: the arrow on top points to the
//   output. AND, OR, XOR and the latch (SET left, RESET right) read their left and right
//   faces; NOT and the delay read their back face. Every other face conducts while on.
// - State lives in the block NAME (js/blockShapes.js states, set by the server and broadcast
//   with blockPlace): `lever:on`, `and_gate:e:on`, `delay_gate:n:3:off`,
//   `daylight_sensor:night:on`. LOGIC_KINDS mirrors logicKinds in logic.go
//   (test/js/logic.test.js checks it); each kind joins ELECTRIC_KINDS with role 'logic'.
// - Right click (not crouching) a lever, button, daylight sensor or delay: the client sends
//   `logicPress {x, y, z}` and the server toggles the lever, presses the button (1.5 s),
//   switches the sensor's day/night mode or cycles the delay (1-4 s). Hook for helpers (a
//   future copper golem): call `game.logicPress(position)`, or send the same message.
// - Pressure plates and proximity sensors notice players only (the server knows where players
//   are; mobs live on each client).
// Mixed into Game.prototype; hooked through js/extensions.js. Loaded after electricity.js.

const LOGIC_KINDS = {
    lever: { op: 'lever', states: 'power' },
    push_button: { op: 'button', states: 'power' },
    pressure_plate: { op: 'plate', states: 'power' },
    daylight_sensor: { op: 'daylight', states: 'mode,power' },
    proximity_sensor: { op: 'proximity', states: 'power' },
    rain_sensor: { op: 'rain', states: 'power' },
    and_gate: { op: 'and', states: 'facing,power' },
    or_gate: { op: 'or', states: 'facing,power' },
    xor_gate: { op: 'xor', states: 'facing,power' },
    not_gate: { op: 'not', states: 'facing,power' },
    delay_gate: { op: 'delay', states: 'facing,delay,power' },
    latch: { op: 'latch', states: 'facing,power' }
};

const LOGIC_STATE_VALUES = {
    power: ['off', 'on'],
    mode: ['day', 'night'],
    facing: ['n', 'e', 's', 'w'],
    delay: ['1', '2', '3', '4']
};

// Input faces of the gates, relative to their facing (as in logic.go).
const LOGIC_INPUTS = {
    and: ['left', 'right'], or: ['left', 'right'], xor: ['left', 'right'],
    not: ['back'], delay: ['back'], latch: ['left', 'right']
};

// What a right click does to each (the server does it; this only says which ones take it).
const LOGIC_PRESSABLE = new Set(['lever', 'button', 'daylight', 'delay']);
const LOGIC_GATE_OPS = ['and', 'or', 'xor', 'not', 'delay', 'latch'];
const LOGIC_SENSOR_OPS = ['daylight', 'proximity', 'rain'];
const LOGIC_PX = 1 / 16;

Object.keys(LOGIC_KINDS).forEach((id) => {
    ELECTRIC_KINDS[id] = { role: 'logic' };
});

// Logic kind of a block name (`and_gate:e:on` -> and_gate), or null.
function logicKindOf(type) {
    if (!type) return null;
    const base = String(type).split(':')[0];
    return LOGIC_KINDS[base] ? base : null;
}

// ---------------------------------------------------------------------------------------
// Textures

// 3x5 glyphs for the symbols on the gates (IEC style: & is AND, ≥1 is OR, =1 is XOR, 1 with
// a circle is NOT, SR the latch, an hourglass the delay).
const LOGIC_GLYPHS = {
    '&': ['.#.', '#.#', '.#.', '#.#', '.##'],
    '>': ['#..', '.#.', '#..', '...', '###'],
    '1': ['.#.', '##.', '.#.', '.#.', '###'],
    '=': ['...', '###', '...', '###', '...'],
    'S': ['###', '#..', '###', '..#', '###'],
    'R': ['##.', '#.#', '##.', '#.#', '#.#'],
    'H': ['###', '#.#', '.#.', '#.#', '###']
};
const LOGIC_SYMBOLS = { and: '&', or: '>1', xor: '=1', not: '1', latch: 'SR', delay: 'H' };

// (u, v) of a top texture to a gate's own frame: forward (the output) is lv = 0, its right
// hand lu = 1. Top faces map u to +x and v to +z (ChunkMesher.boxFaceUV), north is v = 0.
function logicLocal(u, v, facing) {
    switch (facing) {
        case 'e': return [v, 1 - u];
        case 's': return [1 - u, 1 - v];
        case 'w': return [1 - v, u];
        default: return [u, v];
    }
}

function logicGlyphHit(text, lu, lv) {
    const unit = LOGIC_PX;
    const width = text.length * 4 - 1;
    const x = Math.floor((lu - (0.5 - (width * unit) / 2)) / unit);
    const y = Math.floor((lv - (0.52 - (5 * unit) / 2)) / unit);
    if (x < 0 || x >= width || y < 0 || y >= 5 || x % 4 === 3) return false;
    const glyph = LOGIC_GLYPHS[text[Math.floor(x / 4)]];
    return Boolean(glyph) && glyph[y][x % 4] === '#';
}

// The top of a gate: a dark board with its symbol, copper input pads and the output arrow,
// both lit while the gate is on. The delay shows its seconds as dots.
function logicPaintGateTop(f, s, op, facing, on, delay, seed) {
    const board = f.rgb(0x323b46);
    const lit = f.rgb(0xff6a3a);
    const unlit = f.rgb(0x5a3029);
    const copper = f.rgb(on ? 0xf0a060 : 0xc87533);
    const ink = f.rgb(on ? 0xfff1c4 : 0xaab4be);
    const inputs = LOGIC_INPUTS[op];
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        const [lu, lv] = logicLocal(u, v, facing);
        let color = f.tone(s, board, (f.hash(x, y, seed) - 0.5) * 0.08);
        let h = 0.5;
        if (Math.min(u, 1 - u, v, 1 - v) < 1.2 * px) { color = f.tone(s, board, -0.25); h = 0.3; }
        // Output arrow at the front.
        if (lv > 0.05 && lv < 0.25 && Math.abs(lu - 0.5) < (lv - 0.05) * 1.1) { color = f.tone(s, on ? lit : unlit, 0); h = 0.9; }
        // Input pads on the input sides.
        const pad = (inputs.includes('left') && lu < 0.14 && Math.abs(lv - 0.55) < 0.1) ||
            (inputs.includes('right') && lu > 0.86 && Math.abs(lv - 0.55) < 0.1) ||
            (inputs.includes('back') && lv > 0.86 && Math.abs(lu - 0.5) < 0.1);
        if (pad) { color = f.tone(s, copper, 0.05); h = 0.8; }
        if (logicGlyphHit(LOGIC_SYMBOLS[op], lu, lv)) { color = ink; h = 0.85; }
        // NOT: the little circle of the inverted output.
        if (op === 'not' && Math.abs(Math.hypot(lu - 0.5, lv - 0.3) - 0.05) < 0.025) { color = ink; h = 0.85; }
        // Latch: S on the left, R on the right are its inputs; delay: one dot per second.
        if (op === 'delay' && Math.abs(lv - 12.5 / 16) < 0.03) {
            for (let i = 0; i < 4; i++) {
                if (Math.abs(lu - (5.5 + i * 2) / 16) < 0.03) { color = i < delay ? (on ? lit : f.rgb(0xd88a4a)) : f.rgb(0x1d2228); h = 0.8; }
            }
        }
        f.put(s, x, y, color, h);
    });
}

for (const op of LOGIC_GATE_OPS) {
    for (const facing of LOGIC_STATE_VALUES.facing) {
        for (const power of LOGIC_STATE_VALUES.power) {
            const delays = op === 'delay' ? LOGIC_STATE_VALUES.delay : [''];
            for (const delay of delays) {
                registerTexturePattern(`logic_top_${op}_${facing}_${power}${delay ? `_${delay}` : ''}`,
                    (f, s, tint, seed) => logicPaintGateTop(f, s, op, facing, power === 'on', Number(delay || 0), seed));
            }
        }
    }
}

// Sides of boards and sensors: slate with a lit stripe while on.
function logicPaintSide(f, s, on, seed) {
    const board = f.rgb(0x3a434e);
    f.each(s, (x, y, u, v) => {
        let color = f.tone(s, board, (f.hash(x, y, seed) - 0.5) * 0.1);
        if (v > 0.78 && v < 0.9) color = f.rgb(on ? 0x7dff8a : 0x24402a);
        f.put(s, x, y, color, 0.5);
    });
}
registerTexturePattern('logic_side_off', (f, s, tint, seed) => logicPaintSide(f, s, false, seed));
registerTexturePattern('logic_side_on', (f, s, tint, seed) => logicPaintSide(f, s, true, seed));

// Sensor tops: a glass window with an icon (sun or moon, radar rings, rain drops), bright
// while on.
function logicPaintSensorTop(f, s, op, mode, on, seed) {
    const frame = f.rgb(0x8a6a44);
    const glass = f.rgb(on ? 0x5d7fa6 : 0x2c3a4c);
    const icon = f.rgb(on ? 0xffe27a : 0x7f8a96);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        if (Math.min(u, 1 - u, v, 1 - v) < 2 * px) {
            f.put(s, x, y, f.tone(s, frame, (f.hash(x, y, seed) - 0.5) * 0.15), 0.7);
            return;
        }
        let color = f.tone(s, glass, (u + v) % 0.5 < 0.06 ? 0.2 : (f.hash(x, y, seed) - 0.5) * 0.06);
        let h = 0.3;
        const d = Math.hypot(u - 0.5, v - 0.5);
        if (op === 'daylight' && mode !== 'night') {
            if (d < 0.14 || (d < 0.3 && Math.abs(Math.sin(Math.atan2(v - 0.5, u - 0.5) * 4)) < 0.25)) { color = icon; h = 0.8; }
        } else if (op === 'daylight') {
            if (d < 0.2 && Math.hypot(u - 0.58, v - 0.44) > 0.16) { color = icon; h = 0.8; }
        } else if (op === 'proximity') {
            if (d < 0.07 || Math.abs(d - 0.2) < 0.03 || Math.abs(d - 0.34) < 0.03) { color = on ? f.rgb(0x7dff8a) : icon; h = 0.8; }
        } else {
            for (const [cx, cy] of [[0.3, 0.3], [0.65, 0.4], [0.4, 0.68], [0.72, 0.74]]) {
                const dx = u - cx;
                const dy = v - cy;
                if (Math.hypot(dx, dy * 0.8) < 0.07 || (dy < 0 && dy > -0.14 && Math.abs(dx) < (dy + 0.14) * 0.45)) {
                    color = f.rgb(on ? 0x8fd0ff : 0x5a6a7a);
                    h = 0.8;
                }
            }
        }
        f.put(s, x, y, color, h);
    });
}
for (const op of LOGIC_SENSOR_OPS) {
    for (const mode of op === 'daylight' ? LOGIC_STATE_VALUES.mode : ['']) {
        for (const power of LOGIC_STATE_VALUES.power) {
            registerTexturePattern(`logic_${op}_top_${mode}_${power}`, (f, s, tint, seed) => logicPaintSensorTop(f, s, op, mode, power === 'on', seed));
        }
    }
}

// Lever: a stone base, a wooden handle with a red knob (the top of the side texture).
registerTexturePattern('logic_lever_side', (f, s, tint, seed) => {
    const stone = f.rgb(0x8a8a8c);
    const wood = f.rgb(0x9a6a3a);
    const knob = f.rgb(0xc8382a);
    f.each(s, (x, y, u, v) => {
        if (v > 0.875) f.put(s, x, y, f.tone(s, stone, (f.hash(x, y, seed) - 0.5) * 0.2), 0.5);
        else if (v < 0.4) f.put(s, x, y, f.tone(s, knob, (f.hash(x, y, seed) - 0.5) * 0.1), 0.8);
        else f.put(s, x, y, f.tone(s, wood, ((u * 8) % 1 < 0.5 ? 0.06 : -0.06)), 0.6);
    });
});
registerTexturePattern('logic_lever_top', (f, s, tint, seed) => {
    const stone = f.rgb(0x8a8a8c);
    const knob = f.rgb(0xc8382a);
    const wood = f.rgb(0x9a6a3a);
    f.each(s, (x, y, u, v) => {
        // The handle's strip (x 7-9 px): red where the knob of the raised handle is, wood elsewhere.
        if (u > 7 / 16 && u < 9 / 16 && v > 9 / 16) {
            f.put(s, x, y, f.tone(s, v < 11 / 16 || v > 13 / 16 ? knob : wood, 0), 0.8);
            return;
        }
        f.put(s, x, y, f.tone(s, stone, (f.hash(x, y, seed) - 0.5) * 0.2), 0.5);
    });
});

// Button: a red cap that brightens while pressed. Plate: a stone slab with a lit rim.
function logicPaintButton(f, s, on, seed) {
    const red = f.rgb(on ? 0xff5a44 : 0xb8322a);
    f.each(s, (x, y, u, v) => {
        const d = Math.hypot(u - 0.5, v - 0.5);
        f.put(s, x, y, f.tone(s, red, 0.15 - d * 0.4 + (f.hash(x, y, seed) - 0.5) * 0.06), 0.7);
    });
}
registerTexturePattern('logic_button_off', (f, s, tint, seed) => logicPaintButton(f, s, false, seed));
registerTexturePattern('logic_button_on', (f, s, tint, seed) => logicPaintButton(f, s, true, seed));

function logicPaintPlate(f, s, on, seed) {
    const stone = f.rgb(0x9a9a9c);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        const rim = Math.min(u, 1 - u, v, 1 - v) < 2.5 * px;
        const color = rim ? f.rgb(on ? 0xffd36b : 0x6e6e70) : f.tone(s, stone, (f.hash(x, y, seed) - 0.5) * 0.14);
        f.put(s, x, y, color, rim ? 0.8 : 0.5);
    });
}
registerTexturePattern('logic_plate_off', (f, s, tint, seed) => logicPaintPlate(f, s, false, seed));
registerTexturePattern('logic_plate_on', (f, s, tint, seed) => logicPaintPlate(f, s, true, seed));

// ---------------------------------------------------------------------------------------
// Shapes (one per kind, with the kind's states) and blocks

const LOGIC_GATE_HEIGHT = 3 * LOGIC_PX;
const LOGIC_SENSOR_HEIGHT = 6 * LOGIC_PX;

function logicStates(id) {
    return LOGIC_KINDS[id].states.split(',').map((key) => [key, LOGIC_STATE_VALUES[key]]);
}

function logicShape(id) {
    const op = LOGIC_KINDS[id].op;
    const states = logicStates(id);
    const iconState = Object.fromEntries(states.map(([key, values]) => [key, values[0]]));
    const on = (state) => state.power === 'on';
    const shape = { states, iconState };
    if (op === 'lever') {
        // A stone base; the handle stands up while on and lies flat while off. (Kept off the
        // middle of the base so the base's top stays drawn: see ChunkMesher.faceBuried.)
        shape.boxes = (state) => [
            [4 * LOGIC_PX, 0, 3 * LOGIC_PX, 12 * LOGIC_PX, 2 * LOGIC_PX, 13 * LOGIC_PX],
            on(state) ? [7 * LOGIC_PX, 2 * LOGIC_PX, 9 * LOGIC_PX, 9 * LOGIC_PX, 12 * LOGIC_PX, 11 * LOGIC_PX]
                : [7 * LOGIC_PX, 2 * LOGIC_PX, 9 * LOGIC_PX, 9 * LOGIC_PX, 4 * LOGIC_PX, 16 * LOGIC_PX]
        ];
        shape.collision = () => [[4 * LOGIC_PX, 0, 3 * LOGIC_PX, 12 * LOGIC_PX, 2 * LOGIC_PX, 13 * LOGIC_PX]];
        return shape;
    }
    if (op === 'button') {
        shape.boxes = (state) => [[5 * LOGIC_PX, 0, 5 * LOGIC_PX, 11 * LOGIC_PX, (on(state) ? 1 : 3) * LOGIC_PX, 11 * LOGIC_PX]];
        shape.materialKey = (state) => state.power;
        shape.variant = (state) => ({ faces: { top: `logic_button_${state.power}`, side: `logic_button_${state.power}` }, ...(on(state) ? { glow: 0.5 } : {}) });
        return shape;
    }
    if (op === 'plate') {
        shape.boxes = (state) => [[LOGIC_PX, 0, LOGIC_PX, 15 * LOGIC_PX, (on(state) ? 0.5 : 1) * LOGIC_PX, 15 * LOGIC_PX]];
        shape.collision = () => [];
        shape.materialKey = (state) => state.power;
        shape.variant = (state) => ({ faces: { top: `logic_plate_${state.power}`, side: `logic_plate_${state.power}` } });
        return shape;
    }
    if (LOGIC_SENSOR_OPS.includes(op)) {
        shape.boxes = () => [[0, 0, 0, 1, LOGIC_SENSOR_HEIGHT, 1]];
        shape.materialKey = (state) => `${state.mode || ''}_${state.power}`;
        shape.variant = (state) => ({
            faces: { top: `logic_${op}_top_${state.mode || ''}_${state.power}`, side: `logic_side_${state.power}`, bottom: 'logic_side_off' },
            ...(on(state) ? { glow: 0.35 } : {})
        });
        return shape;
    }
    // Gates: a thin board; its arrow faces where the player looked when placing it.
    shape.boxes = () => [[0, 0, 0, 1, LOGIC_GATE_HEIGHT, 1]];
    shape.materialKey = (state) => `${state.facing}_${state.power}_${state.delay || ''}`;
    shape.variant = (state) => ({
        faces: {
            top: `logic_top_${op}_${state.facing}_${state.power}${state.delay ? `_${state.delay}` : ''}`,
            side: `logic_side_${state.power}`, bottom: 'logic_side_off'
        },
        ...(on(state) ? { glow: 0.45 } : {})
    });
    shape.place = (ctx) => [{
        dx: 0, dy: 0, dz: 0,
        state: { ...iconState, facing: shapeFacingFromVector(ctx.look.x, ctx.look.z) }
    }];
    return shape;
}

const LOGIC_BLOCKS = [
    // [id, name, colour, extra fields]
    ['lever', 'Lever', 0x9A6A3A, { faces: { top: 'logic_lever_top', side: 'logic_lever_side' } }],
    ['push_button', 'Push Button', 0xB8322A, {}],
    ['pressure_plate', 'Pressure Plate', 0x9A9A9C, { solid: false }],
    ['daylight_sensor', 'Daylight Sensor', 0x5D7FA6, {}],
    ['proximity_sensor', 'Proximity Sensor', 0x3A434E, {}],
    ['rain_sensor', 'Rain Sensor', 0x5A6A7A, {}],
    ['and_gate', 'AND Gate', 0x323B46, {}],
    ['or_gate', 'OR Gate', 0x323B46, {}],
    ['xor_gate', 'XOR Gate', 0x323B46, {}],
    ['not_gate', 'NOT Gate', 0x323B46, {}],
    ['delay_gate', 'Delay', 0x323B46, {}],
    ['latch', 'Latch (Memory)', 0x323B46, {}]
];

LOGIC_BLOCKS.forEach(([id, name, color, extra]) => {
    registerBlockShape(`logic_${id}`, logicShape(id));
    registerBlockType(id, {
        color, name, shape: `logic_${id}`, lightPasses: true, breakDuration: 0.3, category: 'electric', electric: true,
        logicKind: id, ...extra
    });
});

// ---------------------------------------------------------------------------------------
// Recipes: cheap; the gates are silicon chips (element_si).

registerGameContent(function ({ addRecipe }) {
    addRecipe('lever', 'Build Levers', 'lever', 2, [{ type: 'planks', amount: 1 }, { type: 'cobblestone', amount: 1 }, { type: 'copper_wire', amount: 1 }]);
    addRecipe('push_button', 'Build Push Buttons', 'push_button', 2, [{ type: 'cobblestone', amount: 1 }, { type: 'copper_wire', amount: 1 }]);
    addRecipe('pressure_plate', 'Build Pressure Plates', 'pressure_plate', 2, [{ type: 'cobblestone', amount: 2 }, { type: 'copper_wire', amount: 1 }]);
    addRecipe('daylight_sensor', 'Build Daylight Sensor', 'daylight_sensor', 1, [{ type: 'glass', amount: 1 }, { type: 'planks', amount: 1 }, { type: 'copper_wire', amount: 2 }]);
    addRecipe('proximity_sensor', 'Build Proximity Sensor', 'proximity_sensor', 1, [{ type: 'iron_ore', amount: 1 }, { type: 'glass', amount: 1 }, { type: 'copper_wire', amount: 2 }]);
    addRecipe('rain_sensor', 'Build Rain Sensor', 'rain_sensor', 1, [{ type: 'cobblestone', amount: 1 }, { type: 'copper_wire', amount: 3 }]);
    [['and_gate', 'AND Gates'], ['or_gate', 'OR Gates'], ['xor_gate', 'XOR Gates'], ['not_gate', 'NOT Gates'], ['delay_gate', 'Delays']].forEach(([id, label]) => {
        addRecipe(id, `Build ${label}`, id, 2, [{ type: 'element_si', amount: 1 }, { type: 'copper_wire', amount: 2 }, { type: 'cobblestone', amount: 1 }]);
    });
    addRecipe('latch', 'Build Latch (Memory)', 'latch', 1, [{ type: 'element_si', amount: 2 }, { type: 'copper_wire', amount: 2 }, { type: 'cobblestone', amount: 1 }]);
});

// ---------------------------------------------------------------------------------------
// Right click

registerItemUseHandler(function (item, hit) {
    if (!hit || this.cameraController.isCrouching) return false;
    const position = this.world.getBlockPositionFromIntersection(hit);
    const kind = position ? logicKindOf(this.world.getBlockTypeAt(position.x, position.y, position.z)) : null;
    if (!kind || !LOGIC_PRESSABLE.has(LOGIC_KINDS[kind].op)) return false;
    this.logicPress(position);
    this.placeActionTimer = 0.25;
    this.showHitIndicator();
    return true;
});

Object.assign(Game.prototype, {
    // Presses the logic block at `position` as a right click does (players, and helpers such as
    // a future copper golem). The server makes the change and tells everyone. Returns whether
    // there was something to press.
    logicPress(position) {
        const type = this.world.getBlockTypeAt(position.x, position.y, position.z);
        const kind = logicKindOf(type);
        if (!kind || !LOGIC_PRESSABLE.has(LOGIC_KINDS[kind].op)) return false;
        if (!this.network || !this.network.connected) {
            this.receiveSystemMessage({ text: 'Switches and gates run on the server: join a world to use them' });
            return false;
        }
        this.network.send('logicPress', { x: position.x, y: position.y, z: position.z });
        const op = LOGIC_KINDS[kind].op;
        if (op === 'lever') {
            this.playNoiseBurst({ duration: 0.06, volume: 0.03, highpass: 1200, lowpass: 5000 });
            this.playTone({ frequency: 520, endFrequency: 380, duration: 0.06, type: 'square', volume: 0.012 });
        } else {
            this.playTone({ frequency: op === 'button' ? 900 : 1400, duration: 0.05, type: 'square', volume: 0.012 });
        }
        return true;
    }
});
