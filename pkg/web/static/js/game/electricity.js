// Electricity: generators, wires, batteries and consumers joined into networks.
// - The simulation runs on the SERVER (pkg/network/power.go), once a second, for everyone:
//   generation (W) from solar panels, wind turbines, water wheels and hand cranks; demand (W)
//   of lamps, grow lamps and motors; batteries (J) take the surplus or cover the deficit. A
//   network is all or nothing: when it cannot feed every consumer, all of them go off.
// - Electric blocks that touch on a face form one network (every electric block conducts;
//   copper wire and wire posts only carry it further). At most 512 blocks per network.
// - What players see travels in the block NAME, set by the server with a normal blockPlace:
//   `electric_lamp:on`, `grow_lamp:on`, `electric_motor:on`, `battery_block:1` .. `:4` (charge
//   in quarters). Lit lamps give torch light (registerBlockType `lightEmission`). The water
//   wheel's axis is a shape state (`water_wheel:z`).
// - Moving parts (turbine rotors, water wheels, motor fans) are client-side meshes found by
//   scanning the chunks near the player; turbines turn with weatherGetWind, as on the server.
// - Multimeter (item): right click an electric block to read its network (asks the server,
//   `powerProbe`); the reading refreshes every second while you hold it. Right click a hand
//   crank (not crouching) to turn it (`powerCrank`): 100 W for 4 s a turn, up to 12 s.
// - Game time runs fast (a day is 240 s), so the numbers are scaled for play: one small
//   generator fills a 3 kJ battery in about a day, which keeps a 10 W lamp lit 2.5 nights.
// - A motor that switches on opens the iron doors and trapdoors it touches; off, it closes
//   them. Lit grow lamps make wheat up to 4 blocks below them grow twice as fast.
// ELECTRIC_KINDS mirrors powerKinds in power.go (test/js/electricity.test.js checks it). Logic
// gates and sensors will join with role 'logic' (they conduct; see the report in power.go).
// Mixed into Game.prototype; hooked through js/extensions.js.

const ELECTRIC_KINDS = {
    copper_wire: { role: 'conductor' },
    wire_post: { role: 'conductor' },
    solar_panel: { role: 'generator', source: 'solar', watts: 40 },
    wind_turbine: { role: 'generator', source: 'wind', watts: 150 },
    water_wheel: { role: 'generator', source: 'water', watts: 105 },
    hand_crank: { role: 'generator', source: 'crank', watts: 100 },
    battery_block: { role: 'storage', capacity: 3000, rate: 200, levels: 4 },
    electric_lamp: { role: 'consumer', watts: 10, switch: true },
    grow_lamp: { role: 'consumer', watts: 30, switch: true },
    electric_motor: { role: 'consumer', watts: 50, switch: true }
};

const ELECTRIC_PX = 1 / 16;
const ELECTRIC_PROBE_INTERVAL = 1;
const ELECTRIC_ROTOR_SCAN = 1;
// Chunks around the player whose moving parts are drawn.
const ELECTRIC_ROTOR_CHUNKS = 2;

// Electric kind of a block name (`electric_lamp:on` -> `electric_lamp`), or null.
function electricKindOf(type) {
    if (!type) return null;
    const base = String(type).split(':')[0];
    return ELECTRIC_KINDS[base] ? base : null;
}

// ---------------------------------------------------------------------------------------
// Textures

registerTexturePattern('copper_wire', (f, s, tint, seed) => {
    const base = f.rgb(0xc87533);
    f.each(s, (x, y, u, v) => {
        // Twisted strands: diagonal stripes.
        const strand = ((u + v) * 6) % 1;
        const k = (strand < 0.5 ? 0.12 : -0.12) + (f.hash(x, y, seed) - 0.5) * 0.08;
        f.put(s, x, y, f.tone(s, base, k), strand < 0.5 ? 0.7 : 0.4);
    });
});

registerTexturePattern('solar_panel_top', (f, s, tint, seed) => {
    const cell = f.rgb(0x1f3470);
    const frame = f.rgb(0xc9ced4);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        const border = Math.min(u, 1 - u, v, 1 - v) < 1.2 * px;
        const grid = (u * 4) % 1 < 0.6 * px * 4 || (v * 4) % 1 < 0.6 * px * 4;
        if (border || grid) {
            f.put(s, x, y, f.tone(s, frame, border ? 0.05 : -0.1), 0.8);
            return;
        }
        const shine = Math.abs(u - v - 0.1) < 0.06 ? 0.35 : 0;
        const fingers = (v * 16) % 1 < 0.12 ? 0.12 : 0;
        f.put(s, x, y, f.tone(s, cell, shine + fingers + (f.hash(x, y, seed) - 0.5) * 0.08), 0.3);
    });
});

registerTexturePattern('solar_panel_side', (f, s, tint, seed) => {
    const frame = f.rgb(0xb8bec5);
    f.each(s, (x, y, u, v) => {
        f.put(s, x, y, f.tone(s, frame, (f.stretchedNoise(u, v, 2, 24, seed) - 0.5) * 0.12), 0.6);
    });
});

// A battery side: a dark case with a gauge of four bars, lit from the bottom up to `level`.
function electricPaintBattery(f, s, level, seed) {
    const casing = f.rgb(0x2b2f36);
    const lit = f.rgb(0x5be36b);
    const dark = f.rgb(0x1d3324);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        let color = f.tone(s, casing, (f.hash(x, y, seed) - 0.5) * 0.08);
        let h = 0.55;
        if (Math.min(u, 1 - u, v, 1 - v) < 1.5 * px) { color = f.tone(s, casing, 0.25); h = 0.8; }
        // Gauge window between u 0.3-0.7, v 0.12-0.88.
        if (u > 0.3 && u < 0.7 && v > 0.12 && v < 0.88) {
            const t = (0.88 - v) / 0.76; // 0 at the bottom
            const bar = Math.floor(t * 4);
            const gap = (t * 4) % 1 < 0.18;
            if (gap) { color = f.rgb(0x111316); h = 0.2; }
            else { color = f.tone(s, bar < level ? lit : dark, (u - 0.5) * 0.3); h = 0.6; }
        }
        // A copper stripe and the bolt mark on the left.
        if (u < 0.22 && u > 0.1 && Math.abs(v - 0.5) < 0.18) {
            const bolt = Math.abs((u - 0.16) + (v - 0.5) * 0.35) < 0.03;
            if (bolt) { color = f.rgb(0xffd24a); h = 0.9; }
        }
        f.put(s, x, y, color, h);
    });
}

for (let level = 0; level <= 4; level++) {
    registerTexturePattern(`battery_side_${level}`, (f, s, tint, seed) => electricPaintBattery(f, s, level, seed));
}

registerTexturePattern('battery_top', (f, s, tint, seed) => {
    const casing = f.rgb(0x2b2f36);
    f.each(s, (x, y, u, v) => {
        let color = f.tone(s, casing, (f.hash(x, y, seed) - 0.5) * 0.08);
        let h = 0.5;
        const plus = Math.hypot(u - 0.3, v - 0.5);
        const minus = Math.hypot(u - 0.7, v - 0.5);
        if (plus < 0.13) { color = f.tone(s, f.rgb(0xc8382a), 0.2 - plus); h = 0.9; }
        if (minus < 0.13) { color = f.tone(s, f.rgb(0x9aa0a8), 0.1 - minus); h = 0.9; }
        f.put(s, x, y, color, h);
    });
});

// A lamp: a glass globe on a copper base; lit, it glows warm white.
function electricPaintLamp(f, s, on, seed) {
    const glass = f.rgb(on ? 0xfff0b8 : 0xb9b7a8);
    const base = f.rgb(0xb06a32);
    f.each(s, (x, y, u, v) => {
        if (v > 0.8) {
            const ring = Math.floor((v - 0.8) * 25) % 2 === 0;
            f.put(s, x, y, f.tone(s, base, ring ? 0.12 : -0.12), 0.7);
            return;
        }
        const d = Math.hypot(u - 0.5, (v - 0.42) * 1.1);
        let k = on ? 0.3 - d * 0.6 : -d * 0.4 + (f.hash(x, y, seed) - 0.5) * 0.06;
        // The filament: a little zigzag in the middle.
        if (Math.abs(u - 0.5) < 0.16 && Math.abs(v - 0.42) < 0.05 && ((u * 16) % 2 < 1)) k = on ? 0.6 : -0.35;
        f.put(s, x, y, f.tone(s, glass, k), 0.4);
    });
}
registerTexturePattern('electric_lamp_off', (f, s, tint, seed) => electricPaintLamp(f, s, false, seed));
registerTexturePattern('electric_lamp_on', (f, s, tint, seed) => electricPaintLamp(f, s, true, seed));

// A grow lamp: a panel of red and blue LEDs (the colours plants use most).
function electricPaintGrowLamp(f, s, on, seed) {
    const panel = f.rgb(0x2a2530);
    const red = f.rgb(on ? 0xff4a5a : 0x5a2a30);
    const blue = f.rgb(on ? 0x5a6aff : 0x2a2c55);
    f.each(s, (x, y, u, v) => {
        const cx = Math.floor(u * 4);
        const cy = Math.floor(v * 4);
        const d = Math.hypot(u * 4 - cx - 0.5, v * 4 - cy - 0.5);
        if (d < 0.3) {
            const led = (cx + cy) % 2 === 0 ? red : blue;
            f.put(s, x, y, f.tone(s, led, on ? 0.25 - d : -d * 0.5), 0.8);
            return;
        }
        f.put(s, x, y, f.tone(s, panel, (f.hash(x, y, seed) - 0.5) * 0.1), 0.5);
    });
}
registerTexturePattern('grow_lamp_off', (f, s, tint, seed) => electricPaintGrowLamp(f, s, false, seed));
registerTexturePattern('grow_lamp_on', (f, s, tint, seed) => electricPaintGrowLamp(f, s, true, seed));

// A motor: a steel housing with copper coils showing through slots; running, its light is green.
function electricPaintMotor(f, s, on, seed) {
    const steel = f.rgb(0x8d969e);
    const copper = f.rgb(0xc87533);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        let color = f.tone(s, steel, (f.stretchedNoise(u, v, 2, 20, seed) - 0.5) * 0.14);
        let h = 0.6;
        if (Math.min(u, 1 - u, v, 1 - v) < 1.5 * px) { color = f.tone(s, steel, -0.2); h = 0.4; }
        if (v > 0.3 && v < 0.7 && u > 0.12 && u < 0.88 && (u * 8) % 1 < 0.55) {
            color = f.tone(s, copper, ((v * 20) % 1 < 0.5 ? 0.1 : -0.1));
            h = 0.3;
        }
        if (Math.hypot(u - 0.82, v - 0.16) < 0.06) { color = f.rgb(on ? 0x6bff7a : 0x2a3a2c); h = 0.9; }
        f.put(s, x, y, color, h);
    });
}
registerTexturePattern('electric_motor_off', (f, s, tint, seed) => electricPaintMotor(f, s, false, seed));
registerTexturePattern('electric_motor_on', (f, s, tint, seed) => electricPaintMotor(f, s, true, seed));

registerTexturePattern('electric_motor_top', (f, s, tint, seed) => {
    const steel = f.rgb(0x8d969e);
    f.each(s, (x, y, u, v) => {
        const d = Math.hypot(u - 0.5, v - 0.5);
        let k = (f.hash(x, y, seed) - 0.5) * 0.08;
        if (d < 0.38 && d > 0.08 && (d * 20) % 2 < 1) k -= 0.35; // fan grill
        if (d < 0.08) k += 0.2;
        f.put(s, x, y, f.tone(s, steel, k), 0.5);
    });
});

// ---------------------------------------------------------------------------------------
// Shapes

const ELECTRIC_WIRE_HEIGHT = 1.5 * ELECTRIC_PX;
const electricJoins = (def, other) => Boolean(other.def && other.def.electric);

// Copper wire: a flat strand on the floor that runs towards every electric neighbour.
registerBlockShape('electric_wire', {
    boxes(state, mask) {
        const h = ELECTRIC_WIRE_HEIGHT;
        const boxes = [[6.5 * ELECTRIC_PX, 0, 6.5 * ELECTRIC_PX, 9.5 * ELECTRIC_PX, h, 9.5 * ELECTRIC_PX]];
        SHAPE_FACINGS.forEach((dir) => {
            if (mask & SHAPE_MASK[dir]) boxes.push(rotateShapeBox([7 * ELECTRIC_PX, 0, 0, 9 * ELECTRIC_PX, h, 7 * ELECTRIC_PX], dir));
        });
        return boxes;
    },
    collision() {
        return [];
    },
    connects: electricJoins,
    iconMask: SHAPE_MASK.e | SHAPE_MASK.w
});

// Wire post: a copper pole to carry the current up and down, with feet towards wires.
registerBlockShape('electric_post', {
    boxes(state, mask) {
        const boxes = [[6 * ELECTRIC_PX, 0, 6 * ELECTRIC_PX, 10 * ELECTRIC_PX, 1, 10 * ELECTRIC_PX]];
        SHAPE_FACINGS.forEach((dir) => {
            if (mask & SHAPE_MASK[dir]) boxes.push(rotateShapeBox([7 * ELECTRIC_PX, 0, 0, 9 * ELECTRIC_PX, ELECTRIC_WIRE_HEIGHT, 6 * ELECTRIC_PX], dir));
        });
        return boxes;
    },
    collision() {
        return [[6 * ELECTRIC_PX, 0, 6 * ELECTRIC_PX, 10 * ELECTRIC_PX, 1, 10 * ELECTRIC_PX]];
    },
    connects: electricJoins,
    iconMask: SHAPE_MASK.e | SHAPE_MASK.w
});

// Solar panel: a thin slab.
registerBlockShape('electric_panel', {
    boxes() {
        return [[0, 0, 0, 1, 3 * ELECTRIC_PX, 1]];
    }
});

// Wind turbine: the lower part of the mast; the rest of the mast, the nacelle and the rotor
// are a moving mesh above it (electricCreateRotor).
registerBlockShape('electric_mast', {
    boxes() {
        return [[6 * ELECTRIC_PX, 0, 6 * ELECTRIC_PX, 10 * ELECTRIC_PX, 1, 10 * ELECTRIC_PX], [4 * ELECTRIC_PX, 0, 4 * ELECTRIC_PX, 12 * ELECTRIC_PX, 2 * ELECTRIC_PX, 12 * ELECTRIC_PX]];
    }
});

// Water wheel: the frame and the axle (the wheel itself turns as a mesh). axis x: the axle
// runs east-west and the wheel stands in a north-south plane.
registerBlockShape('electric_wheel', {
    states: [['axis', ['x', 'z']]],
    boxes(state) {
        const boxes = [
            [0, 7 * ELECTRIC_PX, 7 * ELECTRIC_PX, 1, 9 * ELECTRIC_PX, 9 * ELECTRIC_PX],
            [0, 0, 6 * ELECTRIC_PX, 2 * ELECTRIC_PX, 9 * ELECTRIC_PX, 10 * ELECTRIC_PX],
            [14 * ELECTRIC_PX, 0, 6 * ELECTRIC_PX, 1, 9 * ELECTRIC_PX, 10 * ELECTRIC_PX]
        ];
        return state.axis === 'z' ? rotateShapeBoxes(boxes, 'e') : boxes;
    },
    collision() {
        return [[0, 0, 0, 1, 1, 1]];
    },
    place(ctx) {
        // The wheel faces the player who places it (its axle runs across their view).
        const facing = shapeFacingFromVector(ctx.look.x, ctx.look.z);
        return [{ dx: 0, dy: 0, dz: 0, state: { axis: facing === 'n' || facing === 's' ? 'z' : 'x' } }];
    },
    iconState: { axis: 'x' }
});

// Hand crank: a box with a handle on top.
registerBlockShape('electric_crank', {
    boxes() {
        return [
            [3 * ELECTRIC_PX, 0, 3 * ELECTRIC_PX, 13 * ELECTRIC_PX, 7 * ELECTRIC_PX, 13 * ELECTRIC_PX],
            [7 * ELECTRIC_PX, 7 * ELECTRIC_PX, 7 * ELECTRIC_PX, 9 * ELECTRIC_PX, 12 * ELECTRIC_PX, 9 * ELECTRIC_PX],
            [7 * ELECTRIC_PX, 11 * ELECTRIC_PX, 7 * ELECTRIC_PX, 14 * ELECTRIC_PX, 13 * ELECTRIC_PX, 9 * ELECTRIC_PX],
            [12 * ELECTRIC_PX, 13 * ELECTRIC_PX, 7 * ELECTRIC_PX, 14 * ELECTRIC_PX, 1, 9 * ELECTRIC_PX]
        ];
    }
});

// ---------------------------------------------------------------------------------------
// Blocks

function electricDrawTurbineIcon(ctx, size) {
    ctx.fillStyle = '#e8ecef';
    ctx.fillRect(size * 0.46, size * 0.36, size * 0.08, size * 0.6);
    ctx.fillStyle = '#b8bec5';
    ctx.fillRect(size * 0.4, size * 0.3, size * 0.2, size * 0.1);
    ctx.save();
    ctx.translate(size * 0.5, size * 0.33);
    for (let i = 0; i < 3; i++) {
        ctx.rotate(Math.PI * 2 / 3);
        ctx.fillStyle = '#f6f8fa';
        ctx.beginPath();
        ctx.ellipse(0, -size * 0.17, size * 0.045, size * 0.17, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#9aa3ab';
        ctx.stroke();
    }
    ctx.fillStyle = '#5a6168';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function electricDrawWheelIcon(ctx, size) {
    const c = size / 2;
    ctx.fillStyle = '#3d85c6';
    ctx.fillRect(size * 0.06, size * 0.72, size * 0.88, size * 0.22);
    ctx.strokeStyle = '#7a5530';
    ctx.lineWidth = size * 0.05;
    ctx.beginPath();
    ctx.arc(c, c, size * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = size * 0.035;
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        ctx.strokeStyle = '#8b6234';
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(c + Math.cos(a) * size * 0.34, c + Math.sin(a) * size * 0.34);
        ctx.stroke();
        ctx.fillStyle = '#b48a56';
        ctx.save();
        ctx.translate(c + Math.cos(a) * size * 0.38, c + Math.sin(a) * size * 0.38);
        ctx.rotate(a);
        ctx.fillRect(-size * 0.07, -size * 0.03, size * 0.14, size * 0.06);
        ctx.restore();
    }
    ctx.fillStyle = '#4a4f55';
    ctx.beginPath();
    ctx.arc(c, c, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
}

const ELECTRIC_COPPER = { pattern: 'copper_wire' };
const ELECTRIC_WHITE = { pattern: 'metal', tint: 0xe8ecef };

registerBlockType('copper_wire', {
    color: 0xC87533, name: 'Copper Wire', shape: 'electric_wire', solid: false, lightPasses: true, breakDuration: 0.1,
    category: 'electric', electric: true, faces: { top: ELECTRIC_COPPER, side: ELECTRIC_COPPER }
});
registerBlockType('wire_post', {
    color: 0xC87533, name: 'Wire Post', shape: 'electric_post', lightPasses: true, breakDuration: 0.3,
    category: 'electric', electric: true, faces: { top: ELECTRIC_COPPER, side: ELECTRIC_COPPER }
});
registerBlockType('solar_panel', {
    color: 0x1F3470, name: 'Solar Panel', shape: 'electric_panel', lightPasses: true, breakDuration: 0.4,
    category: 'electric', electric: true, faces: { top: 'solar_panel_top', side: 'solar_panel_side', bottom: 'solar_panel_side' }
});
registerBlockType('wind_turbine', {
    color: 0xE8ECEF, name: 'Wind Turbine', shape: 'electric_mast', lightPasses: true, breakDuration: 0.6,
    category: 'electric', electric: true, faces: { top: ELECTRIC_WHITE, side: ELECTRIC_WHITE },
    drawBlockIcon: electricDrawTurbineIcon
});
registerBlockType('water_wheel', {
    color: 0xB48A56, name: 'Water Wheel', shape: 'electric_wheel', lightPasses: true, breakDuration: 0.6,
    category: 'electric', electric: true, faces: { top: { pattern: 'planks', tintOf: 'planks' }, side: { pattern: 'planks', tintOf: 'planks' } },
    drawBlockIcon: electricDrawWheelIcon
});
registerBlockType('hand_crank', {
    color: 0xB48A56, name: 'Hand Crank', shape: 'electric_crank', lightPasses: true, breakDuration: 0.4,
    category: 'electric', electric: true, faces: { top: { pattern: 'metal', tint: 0x8d969e }, side: { pattern: 'planks', tintOf: 'planks' } }
});
registerBlockType('battery_block', {
    color: 0x2B2F36, name: 'Battery Block', breakDuration: 0.7, category: 'electric', electric: true,
    faces: { top: 'battery_top', side: 'battery_side_0', bottom: 'battery_top' }
});
for (let level = 1; level <= 4; level++) {
    registerBlockType(`battery_block:${level}`, {
        color: 0x2B2F36, name: 'Battery Block', breakDuration: 0.7, category: 'electric', electric: true,
        faces: { top: 'battery_top', side: `battery_side_${level}`, bottom: 'battery_top' },
        variantOf: 'battery_block', dropType: 'battery_block', batteryLevel: level
    });
}
// Consumers: an "off" block (the item) and an ":on" variant set by the server.
[
    ['electric_lamp', 'Electric Lamp', 0xD8D2B8, 'electric_lamp_off', 'electric_lamp_on', 'electric_lamp_off', 'electric_lamp_on', 1.4],
    ['grow_lamp', 'Grow Lamp', 0x7A3A8A, 'grow_lamp_off', 'grow_lamp_on', 'grow_lamp_off', 'grow_lamp_on', 1.1],
    ['electric_motor', 'Electric Motor', 0x8D969E, 'electric_motor_off', 'electric_motor_on', 'electric_motor_top', 'electric_motor_top', 0]
].forEach(([id, name, color, offSide, onSide, offTop, onTop, glow]) => {
    registerBlockType(id, {
        color, name, breakDuration: 0.4, category: 'electric', electric: true,
        faces: { top: offTop, side: offSide, bottom: offTop }
    });
    registerBlockType(`${id}:on`, {
        color, name, breakDuration: 0.4, category: 'electric', electric: true,
        faces: { top: onTop, side: onSide, bottom: onTop },
        variantOf: id, dropType: id, powered: true,
        ...(glow ? { glow, lightEmission: true } : {})
    });
});

// ---------------------------------------------------------------------------------------
// Items and recipes

const ELECTRIC_MULTIMETER_SPRITE = [
    '...RR..BB...',
    '...RR..BB...',
    '...R....B...',
    '..YYYYYYYY..',
    '..YggggggY..',
    '..YgGGGGgY..',
    '..YggggggY..',
    '..YYYYYYYY..',
    '..YYYDDYYY..',
    '..YYDKKDYY..',
    '..YYYDDYYY..',
    '..YYYYYYYY..'
];
registerItemType('multimeter', {
    color: 0xF2C230, name: 'Multimeter',
    drawIcon: resourcesDrawSprite(ELECTRIC_MULTIMETER_SPRITE, { R: 0xc8382a, B: 0x2a2a2c, Y: 0xf2c230, g: 0x2f4a3a, G: 0x9ef0a8, D: 0x3a3a3c, K: 0x8d969e }),
    displayMesh: resourcesDisplayMesh
});

registerGameContent(function ({ addRecipe }) {
    addRecipe('copper_wire', 'Draw Copper Wire', 'copper_wire', 12, [{ type: 'copper_block', amount: 1 }]);
    addRecipe('wire_post', 'Build Wire Posts', 'wire_post', 2, [{ type: 'copper_wire', amount: 4 }, { type: 'planks', amount: 1 }]);
    addRecipe('solar_panel', 'Build Solar Panels (Solar Cells)', 'solar_panel', 2, [{ type: 'solar_cell', amount: 2 }, { type: 'glass', amount: 1 }, { type: 'iron_ore', amount: 1 }]);
    // Without the lab: raw silicon blocks (synthesised from stone and coal) under glass.
    addRecipe('solar_panel_silicon', 'Build Solar Panel (Silicon)', 'solar_panel', 1, [{ type: 'element_si', amount: 2 }, { type: 'glass', amount: 1 }, { type: 'copper_wire', amount: 2 }, { type: 'iron_ore', amount: 1 }]);
    addRecipe('wind_turbine', 'Build Wind Turbine', 'wind_turbine', 1, [{ type: 'iron_ore', amount: 3 }, { type: 'planks', amount: 3 }, { type: 'copper_block', amount: 1 }]);
    addRecipe('water_wheel', 'Build Water Wheel', 'water_wheel', 1, [{ type: 'planks', amount: 6 }, { type: 'copper_block', amount: 1 }]);
    addRecipe('hand_crank', 'Build Hand Crank', 'hand_crank', 1, [{ type: 'planks', amount: 2 }, { type: 'iron_ore', amount: 1 }, { type: 'copper_wire', amount: 2 }]);
    addRecipe('battery_block_lithium', 'Build Battery Block (Lithium)', 'battery_block', 2, [{ type: 'battery', amount: 2 }, { type: 'iron_ore', amount: 2 }, { type: 'copper_wire', amount: 2 }]);
    addRecipe('battery_block', 'Build Battery Block (Copper and Iron)', 'battery_block', 1, [{ type: 'copper_block', amount: 2 }, { type: 'iron_block', amount: 2 }, { type: 'coal_ore', amount: 1 }]);
    addRecipe('electric_lamp', 'Build Electric Lamps', 'electric_lamp', 2, [{ type: 'light_bulb', amount: 1 }, { type: 'glass', amount: 1 }, { type: 'copper_wire', amount: 1 }]);
    addRecipe('electric_lamp_carbon', 'Build Electric Lamp (Carbon Filament)', 'electric_lamp', 1, [{ type: 'glass', amount: 1 }, { type: 'coal_ore', amount: 1 }, { type: 'copper_wire', amount: 2 }]);
    addRecipe('grow_lamp', 'Build Grow Lamp', 'grow_lamp', 1, [{ type: 'neon_lamp', amount: 1 }, { type: 'argon_lamp', amount: 1 }, { type: 'copper_wire', amount: 1 }]);
    addRecipe('grow_lamp_simple', 'Build Grow Lamp (from Lamps)', 'grow_lamp', 1, [{ type: 'electric_lamp', amount: 2 }, { type: 'glass', amount: 1 }]);
    addRecipe('electric_motor', 'Build Electric Motor', 'electric_motor', 1, [{ type: 'iron_ore', amount: 2 }, { type: 'copper_block', amount: 1 }, { type: 'copper_wire', amount: 2 }]);
    addRecipe('multimeter', 'Build Multimeter', 'multimeter', 1, [{ type: 'copper_wire', amount: 2 }, { type: 'iron_ore', amount: 1 }, { type: 'glass', amount: 1 }]);
});

// ---------------------------------------------------------------------------------------
// Clicks

registerItemUseHandler(function (item, hit) {
    return this.electricUse(item, hit);
});

registerFrameUpdate(function (delta) {
    this.electricUpdate(delta);
});

// Watts with one decimal below 100 (0.5 W, 12.5 W, 150 W).
function electricWatts(watts) {
    const value = Math.abs(watts) < 100 ? Math.round(watts * 10) / 10 : Math.round(watts);
    return `${value} W`;
}

// Energy in J or kJ, with watt-hours: "6.2 kJ (1.72 Wh)".
function electricEnergy(joules) {
    const main = joules < 1000 ? `${Math.round(joules)} J` : `${(joules / 1000).toFixed(1)} kJ`;
    return `${main} (${(joules / 3600).toFixed(2)} Wh)`;
}

function electricDuration(seconds) {
    if (seconds < 90) return `${Math.round(seconds)} s`;
    return `${Math.round(seconds / 60)} min`;
}

Object.assign(Game.prototype, {
    electricUse(item, hit) {
        if (item === 'multimeter') {
            const position = hit ? this.world.getBlockPositionFromIntersection(hit) : null;
            const type = position ? this.world.getBlockTypeAt(position.x, position.y, position.z) : null;
            if (!electricKindOf(type)) {
                this.electricProbeTarget = null;
                this.electricReport = null;
                this.electricRenderPanel('Multimeter', [['Tip', 'right click a wire, generator, battery or lamp']]);
                this.electricPanelHold = 3;
                return true;
            }
            this.electricProbeTarget = { x: position.x, y: position.y, z: position.z };
            this.electricReport = null;
            this.electricProbeTimer = 0;
            this.playTone({ frequency: 1800, duration: 0.05, type: 'square', volume: 0.012 });
            return true;
        }
        if (!hit || this.cameraController.isCrouching) return false;
        const position = this.world.getBlockPositionFromIntersection(hit);
        if (!position || electricKindOf(this.world.getBlockTypeAt(position.x, position.y, position.z)) !== 'hand_crank') return false;
        if (this.network && this.network.connected) this.network.send('powerCrank', position);
        this.playNoiseBurst({ duration: 0.18, volume: 0.025, highpass: 500, lowpass: 2600 });
        this.playTone({ frequency: 90, endFrequency: 180, duration: 0.25, type: 'sawtooth', volume: 0.012 });
        this.placeActionTimer = 0.25;
        this.showHitIndicator();
        return true;
    },

    electricListen() {
        if (this.electricListening || !this.network) return;
        this.electricListening = true;
        this.network.on('powerProbe', (report) => {
            if (!report || !this.electricProbeTarget) return;
            const target = this.electricProbeTarget;
            if (report.x !== target.x || report.y !== target.y || report.z !== target.z) return;
            this.electricReport = report;
            this.electricShowReport();
        });
    },

    electricUpdate(delta) {
        this.electricListen();
        this.electricUpdateRotors(delta);

        const holding = this.getSelectedHeldItemType() === 'multimeter' && this.isGameplayActive();
        if (!holding) {
            this.electricProbeTarget = null;
            this.electricRenderPanel(null);
            return;
        }
        if (this.electricPanelHold > 0) {
            this.electricPanelHold -= delta;
            if (this.electricPanelHold <= 0 && !this.electricProbeTarget) this.electricRenderPanel(null);
        }
        if (!this.electricProbeTarget) return;
        this.electricProbeTimer = (this.electricProbeTimer || 0) - delta;
        if (this.electricProbeTimer > 0) return;
        this.electricProbeTimer = ELECTRIC_PROBE_INTERVAL;
        const target = this.electricProbeTarget;
        if (!electricKindOf(this.world.getBlockTypeAt(target.x, target.y, target.z))) {
            this.electricProbeTarget = null;
            this.electricRenderPanel('Multimeter', [['Reading', 'the block is gone']]);
            this.electricPanelHold = 3;
            return;
        }
        if (!this.network || !this.network.connected) {
            this.electricRenderPanel('Multimeter', [['Offline', 'electricity runs on the server: join a world to measure it']]);
            return;
        }
        this.network.send('powerProbe', target);
        if (!this.electricReport) this.electricRenderPanel('Multimeter', [['Reading', '...']]);
    },

    electricKindName(kind) {
        const def = this.world.blockTypes[kind];
        return def ? def.name : kind;
    },

    // The multimeter's reading: the network's generation, demand, storage and blocks.
    electricShowReport() {
        const r = this.electricReport;
        if (!r) return;
        if (!r.found) {
            this.electricRenderPanel('Multimeter', [['Reading', 'not connected yet (wait a second)']]);
            return;
        }
        const kind = ELECTRIC_KINDS[r.kind] || {};
        const lines = [];
        if (kind.role === 'generator') lines.push(['This block', `${this.electricKindName(r.kind)} giving ${electricWatts(r.own)}`]);
        else if (kind.role === 'consumer') lines.push(['This block', `${this.electricKindName(r.kind)} using ${electricWatts(-r.own)} of ${electricWatts(kind.watts)}`]);
        else if (kind.role === 'storage') lines.push(['This block', `battery with ${electricEnergy(r.own)}`]);
        else lines.push(['This block', this.electricKindName(r.kind)]);
        if (r.tooBig) {
            lines.push(['Network', `${r.blocks} blocks: too big (max ${r.maxBlocks}), it does not work`]);
            this.electricRenderPanel('Multimeter', lines);
            return;
        }
        const sources = Object.entries(r.sources || {}).filter(([, watts]) => watts > 0.05)
            .map(([source, watts]) => `${source} ${electricWatts(watts)}`).join(', ');
        lines.push(['Generation', `${electricWatts(r.generation)}${sources ? ` (${sources})` : ''}`]);
        lines.push(['Demand', electricWatts(r.demand)]);
        const balance = r.generation - r.demand;
        lines.push(['Balance', `${balance >= 0 ? '+' : ''}${electricWatts(balance)}`]);
        if (r.capacity > 0) {
            const percent = Math.round((r.stored / r.capacity) * 100);
            lines.push(['Stored', `${electricEnergy(r.stored)} of ${electricEnergy(r.capacity)}, ${percent} %`]);
            if (r.powered && balance < 0 && r.stored > 0) lines.push(['Batteries last', `about ${electricDuration(r.stored / -balance)}`]);
            else if (balance > 0 && r.stored < r.capacity) lines.push(['Full in', `about ${electricDuration((r.capacity - r.stored) / Math.min(balance, ELECTRIC_KINDS.battery_block.rate * (r.counts.battery_block || 1)))}`]);
        }
        let status = 'no consumers';
        if (r.demand > 0) status = r.powered ? 'ON: every consumer has power' : 'OFF: not enough power (blackout)';
        lines.push(['Status', status]);
        const counts = Object.entries(r.counts || {}).sort((a, b) => b[1] - a[1])
            .map(([name, count]) => `${count} ${this.electricKindName(name)}`).join(', ');
        lines.push(['Network', `${r.blocks} blocks: ${counts}`]);
        this.electricRenderPanel('Multimeter', lines);
    },

    electricPanel() {
        if (!this.electricPanelElement) {
            const panel = document.createElement('div');
            panel.id = 'electric-panel';
            panel.style.cssText = 'position:absolute;right:10px;bottom:84px;width:min(320px,calc(100vw - 20px));padding:8px 10px;' +
                'border-radius:10px;background:rgba(0,0,0,0.5);color:#fff;font:12px/1.35 Consolas,monospace;z-index:111;' +
                'opacity:0;transition:opacity 0.12s ease;pointer-events:none';
            document.body.appendChild(panel);
            this.electricPanelElement = panel;
        }
        return this.electricPanelElement;
    },

    electricRenderPanel(title, lines = []) {
        if (!title && !this.electricPanelElement) return;
        const panel = this.electricPanel();
        if (!title) {
            panel.style.opacity = '0';
            return;
        }
        panel.innerHTML = '';
        const heading = document.createElement('div');
        heading.style.cssText = 'color:#ffd36b;margin-bottom:2px';
        heading.textContent = title;
        panel.appendChild(heading);
        lines.forEach(([label, value]) => {
            const row = document.createElement('div');
            const name = document.createElement('span');
            name.style.color = '#9ec7ef';
            name.textContent = `${label}: `;
            row.append(name, value);
            panel.appendChild(row);
        });
        panel.style.opacity = '1';
    },

    // ---- Moving parts ------------------------------------------------------------------

    electricRotorFlags() {
        const registry = this.world.registry;
        if (this.electricRotorRegistry !== registry) {
            this.electricRotorRegistry = registry;
            this.electricRotorFlagArray = new Uint8Array(registry.names.length);
            registry.names.forEach((name, id) => {
                const kind = electricKindOf(name);
                if (kind === 'wind_turbine' || kind === 'water_wheel' || name === 'electric_motor:on') {
                    this.electricRotorFlagArray[id] = 1;
                }
            });
        }
        return this.electricRotorFlagArray;
    },

    electricBox(parent, color, x, y, z, sx, sy, sz) {
        if (!this.electricBoxGeometry) {
            this.electricBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
            this.electricMaterials = new Map();
        }
        let material = this.electricMaterials.get(color);
        if (!material) {
            material = new THREE.MeshLambertMaterial({ color });
            this.electricMaterials.set(color, material);
        }
        const mesh = new THREE.Mesh(this.electricBoxGeometry, material);
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        mesh.castShadow = Boolean(this.rtxModeEnabled);
        parent.add(mesh);
        return mesh;
    },

    electricCreateRotor(kind, type, x, y, z) {
        const group = new THREE.Group();
        const rotor = { kind, type, group, x, y, z, angle: 0, yaw: null };
        if (kind === 'wind_turbine') {
            // The rest of the mast, the nacelle that turns into the wind, and three blades.
            group.position.set(x + 0.5, y, z + 0.5);
            this.electricBox(group, 0xe8ecef, 0, 1.5, 0, 0.2, 1, 0.2);
            const head = new THREE.Group();
            head.position.y = 2.05;
            this.electricBox(head, 0xdfe4e8, 0, 0, -0.05, 0.3, 0.3, 0.6);
            const blades = new THREE.Group();
            blades.position.z = 0.3;
            this.electricBox(blades, 0xb8bec5, 0, 0, 0.03, 0.14, 0.14, 0.12);
            for (let i = 0; i < 3; i++) {
                const arm = new THREE.Group();
                arm.rotation.z = i * Math.PI * 2 / 3;
                this.electricBox(arm, 0xf6f8fa, 0, 0.62, 0, 0.16, 1.1, 0.04);
                blades.add(arm);
            }
            head.add(blades);
            group.add(head);
            rotor.head = head;
            rotor.spinner = blades;
            rotor.axis = 'z';
        } else if (kind === 'water_wheel') {
            // A wheel of 8 paddles in the block, turning about its axle.
            group.position.set(x + 0.5, y + 0.5, z + 0.5);
            const def = this.world.blockTypes[type];
            const wheel = new THREE.Group();
            for (let i = 0; i < 8; i++) {
                const arm = new THREE.Group();
                arm.rotation.x = i * Math.PI / 4;
                this.electricBox(arm, 0x8b6234, 0, 0.22, 0, 0.06, 0.44, 0.05);
                this.electricBox(arm, 0xb48a56, 0, 0.4, 0, 0.6, 0.18, 0.05);
                this.electricBox(arm, 0x7a5530, 0, 0.44, 0.0, 0.66, 0.04, 0.2);
                wheel.add(arm);
            }
            group.add(wheel);
            if (def && def.state && def.state.axis === 'z') group.rotation.y = Math.PI / 2;
            rotor.spinner = wheel;
            rotor.axis = 'x';
        } else {
            // A running motor: a fan spinning on its top.
            group.position.set(x + 0.5, y + 1.02, z + 0.5);
            const fan = new THREE.Group();
            this.electricBox(fan, 0x5a6168, 0, 0.02, 0, 0.1, 0.06, 0.1);
            for (let i = 0; i < 4; i++) {
                const arm = new THREE.Group();
                arm.rotation.y = i * Math.PI / 2;
                const blade = this.electricBox(arm, 0xc87533, 0.17, 0.03, 0, 0.26, 0.02, 0.1);
                blade.rotation.x = 0.35;
                fan.add(arm);
            }
            group.add(fan);
            rotor.spinner = fan;
            rotor.axis = 'y';
        }
        this.scene.add(group);
        return rotor;
    },

    electricUpdateRotors(delta) {
        if (!this.world || !this.world.registry || !this.scene || !this.camera) return;
        if (!this.electricRotors) this.electricRotors = new Map();
        this.electricRotorTimer = (this.electricRotorTimer || 0) - delta;
        if (this.electricRotorTimer <= 0) {
            this.electricRotorTimer = ELECTRIC_ROTOR_SCAN;
            this.electricScanRotors();
        }
        for (const rotor of this.electricRotors.values()) {
            let speed = 0;
            if (rotor.kind === 'wind_turbine') {
                const wind = this.weatherGetWind ? this.weatherGetWind({ x: rotor.x + 0.5, y: rotor.y + 2, z: rotor.z + 0.5 }) : { x: 0, z: 0, speed: 0 };
                // The rotor faces into the wind (local +z points upwind).
                if (wind.speed > 0.3) {
                    const target = Math.atan2(-wind.x, -wind.z);
                    if (rotor.yaw === null) rotor.yaw = target;
                    const difference = Math.atan2(Math.sin(target - rotor.yaw), Math.cos(target - rotor.yaw));
                    rotor.yaw += difference * Math.min(1, delta * 0.8);
                    rotor.head.rotation.y = rotor.yaw;
                }
                speed = wind.speed < 1 ? wind.speed * 0.2 : wind.speed * 0.55;
            } else if (rotor.kind === 'water_wheel') {
                speed = rotor.wet ? 1.6 : 0;
            } else {
                speed = 16;
            }
            rotor.angle = (rotor.angle + speed * delta) % (Math.PI * 2);
            rotor.spinner.rotation[rotor.axis] = rotor.angle;
        }
    },

    // Finds the turbines, wheels and running motors near the player and keeps one mesh each.
    electricScanRotors() {
        const flags = this.electricRotorFlags();
        const world = this.world;
        const { chunkX, chunkZ } = world.getChunkCoords(Math.floor(this.camera.position.x), Math.floor(this.camera.position.z));
        const seen = new Set();
        for (let dx = -ELECTRIC_ROTOR_CHUNKS; dx <= ELECTRIC_ROTOR_CHUNKS; dx++) {
            for (let dz = -ELECTRIC_ROTOR_CHUNKS; dz <= ELECTRIC_ROTOR_CHUNKS; dz++) {
                const key = world.chunkKey(chunkX + dx, chunkZ + dz);
                const column = world.columns.get(key);
                if (!column || !world.activeChunks.has(key)) continue;
                for (const index of column.findBlocks(flags, 'electricRotors')) {
                    const x = (chunkX + dx) * CHUNK_SIZE + index % CHUNK_SIZE;
                    const z = (chunkZ + dz) * CHUNK_SIZE + Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE;
                    const y = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE)) + WORLD_MIN_Y;
                    const type = world.registry.name(column.blocks[index]);
                    const kind = electricKindOf(type);
                    const rotorKey = `${x},${y},${z}`;
                    seen.add(rotorKey);
                    let rotor = this.electricRotors.get(rotorKey);
                    if (rotor && rotor.type !== type) {
                        this.scene.remove(rotor.group);
                        rotor = null;
                    }
                    if (!rotor) {
                        rotor = this.electricCreateRotor(kind, type, x, y, z);
                        this.electricRotors.set(rotorKey, rotor);
                    }
                    if (kind === 'water_wheel') {
                        rotor.wet = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]
                            .some(([ox, oy, oz]) => world.getBlockTypeAt(x + ox, y + oy, z + oz) === 'water');
                    }
                }
            }
        }
        for (const [key, rotor] of this.electricRotors) {
            if (seen.has(key)) continue;
            this.scene.remove(rotor.group);
            this.electricRotors.delete(key);
        }
    }
});
