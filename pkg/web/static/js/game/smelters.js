// The workshop's heavy machines: the foundry and the electric arc furnace. The kitchen's oven is for
// food; these make materials, in larger yields than the C menu, whose recipes all stay.
// - They are chests that do things, like the oven: right click to open (js/game/storage.js), and the
//   rules and tables run on the SERVER (pkg/network/appliances.go, mirrored in js/game/appliances.js).
//   This file only holds the blocks: shapes, textures, light and recipes.
// - The foundry is a brick and clay furnace that burns coal. It uses the oven's shape: a whole cube
//   with `fire` in the block name, set by the server alone (`foundry:e:on`).
// - The arc furnace is a steel vessel with three graphite electrodes through its roof. It runs on
//   150 W (`ELECTRIC_KINDS`), asked of the grid only while it has work, and takes coal as an
//   ingredient. `fire` here is the arc, on only while the grid really feeds it.
// Mixed into Game.prototype by nothing: hooked through js/extensions.js.

// ---------------------------------------------------------------------------------------
// Shape

// Written facing north, in sixteenths. Boxes cut what they show from one texture by height (see
// js/game/furniture.js): electrodes above 12, the roof from 10 to 12, the steel vessel below.
furnShape('arc_furnace', {
    states: [['facing', SHAPE_FACINGS], ['fire', ['off', 'on']]],
    boxes: [[1, 0, 1, 15, 10, 15], [2, 10, 2, 14, 12, 14], [5, 12, 5, 7, 16, 7], [9, 12, 5, 11, 16, 7], [7, 12, 9, 9, 16, 11], [6, 5, 0, 10, 7, 1]],
    collision: [[1, 0, 1, 15, 16, 15]],
    variant: (state, def) => (state.fire === 'on' ? def.lit : {}),
    materialKey: (state) => `${state.facing}:${state.fire}`,
    place: (ctx) => [{ dx: 0, dy: 0, dz: 0, state: { facing: furnFacePlayer(ctx), fire: 'off' } }],
    iconState: { facing: 's', fire: 'off' }
});

// ---------------------------------------------------------------------------------------
// Textures

const SMELTER_FLAME = (f, u, v, seed) => {
    const flame = f.fbm(u, v * 0.6, 4, 3, seed) + (v - 0.5) * 0.9;
    return flame > 0.75 ? f.rgb(0xfff0a0) : flame > 0.55 ? f.rgb(0xffa030) : f.rgb(0xc8401a);
};

// Courses of fired brick on clay mortar, with a clay collar and an iron band at the top.
function smelterBrick(f, s, u, v, seed) {
    if (v < 0.11) return { c: f.tone(s, f.rgb(0xb58a5e), (f.fbm(u, v, 3, 2, seed) - 0.5) * 0.25), h: 0.7 };
    if (v < 0.16) return { c: f.tone(s, f.rgb(0x3a3d42), (f.hash(Math.floor(u * 64), 3, seed) - 0.5) * 0.1), h: 0.9 };
    const row = (v - 0.16) / 0.84 * 5;
    const course = Math.floor(row);
    const along = (u * 2 + (course % 2 ? 0.5 : 0)) % 1;
    if (row - course < 0.14 || along < 0.07) return { c: f.tone(s, f.rgb(0xc8ae88), (f.hash(Math.floor(u * 64), course, seed) - 0.5) * 0.12), h: 0.25 };
    const soot = Math.max(0, 0.5 - v) * 0.5;
    const brick = f.tone(s, f.rgb(0xa2563a), (f.fbm(u + course, v, 3, 3, seed) - 0.5) * 0.3 + (f.hash(Math.floor(along * 2) + Math.floor(u * 2), course, seed) - 0.5) * 0.18 - soot);
    return { c: brick, h: 0.7 };
}

// A round-topped mouth in a clay surround; lit, the fire shows through the grate.
function smelterPaintFoundryFront(f, s, lit, seed) {
    f.each(s, (x, y, u, v) => {
        let { c, h } = smelterBrick(f, s, u, v, seed);
        const arch = v < 0.58 ? Math.hypot(u - 0.5, v - 0.58) : Math.abs(u - 0.5);
        const inMouth = arch < 0.26 && v < 0.9;
        const inClay = arch < 0.33 && v < 0.96 && v > 0.2;
        if (inClay) { c = f.tone(s, f.rgb(0xd8b78a), (f.fbm(u, v, 3, 3, seed) - 0.5) * 0.2); h = 0.85; }
        if (inMouth) {
            c = lit ? SMELTER_FLAME(f, u, v, seed) : f.tone(s, f.rgb(0x17110e), (f.hash(x, y, seed) - 0.5) * 0.2);
            h = 0.2;
            if (v > 0.74 && (u * 8) % 1 < 0.35) { c = f.rgb(lit ? 0x8a3a18 : 0x34363a); h = 0.6; }
        }
        f.put(s, x, y, c, h);
    });
}
registerTexturePattern('foundry_front_off', (f, s, tint, seed) => smelterPaintFoundryFront(f, s, false, seed));
registerTexturePattern('foundry_front_on', (f, s, tint, seed) => smelterPaintFoundryFront(f, s, true, seed));
registerTexturePattern('foundry_side', (f, s, tint, seed) => {
    f.each(s, (x, y, u, v) => {
        const { c, h } = smelterBrick(f, s, u, v, seed);
        f.put(s, x, y, c, h);
    });
});
// A clay cap round the flue, which shows the fire below it when lit.
function smelterPaintFoundryTop(f, s, lit, seed) {
    f.each(s, (x, y, u, v) => {
        const r = Math.hypot(u - 0.5, v - 0.5);
        let c = f.tone(s, f.rgb(0xb58a5e), (f.fbm(u, v, 4, 3, seed) - 0.5) * 0.28 - Math.max(0, 0.4 - r) * 0.5);
        let h = 0.7;
        if (r < 0.28) { c = f.tone(s, f.rgb(0x3a3d42), (f.hash(x, y, seed) - 0.5) * 0.1); h = 0.9; }
        if (r < 0.22) { c = lit ? SMELTER_FLAME(f, u, v, seed) : f.rgb(0x100c0a); h = 0.2; }
        f.put(s, x, y, c, h);
    });
}
registerTexturePattern('foundry_top_off', (f, s, tint, seed) => smelterPaintFoundryTop(f, s, false, seed));
registerTexturePattern('foundry_top_on', (f, s, tint, seed) => smelterPaintFoundryTop(f, s, true, seed));

// By height: graphite electrodes, a refractory roof, then water-cooled steel panels with ribs. On a
// front face, a door low down that shows the melt when the arc is on.
function smelterPaintArcSide(f, s, door, lit, seed) {
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        let c;
        let h = 0.6;
        if (v < 0.25) {
            c = f.tone(s, f.rgb(0x2b2c30), (f.stretchedNoise(u, v, 8, 2, seed) - 0.5) * 0.3);
            h = 0.35;
        } else if (v < 0.375) {
            c = f.tone(s, f.rgb(0x8c8378), (f.fbm(u, v, 4, 3, seed) - 0.5) * 0.3);
            h = 0.5;
        } else {
            const panel = (u * 4) % 1;
            c = f.tone(s, f.rgb(0x5f6a74), (panel < 0.1 ? -0.22 : (f.stretchedNoise(u, v, 2, 16, seed) - 0.5) * 0.16));
            h = panel < 0.1 ? 0.3 : 0.7;
            if (Math.abs(v - 0.42) < px || Math.abs(v - 0.92) < px) { c = f.tone(s, f.rgb(0x8d969e), 0.1); h = 1; }
        }
        if (door && u > 0.28 && u < 0.72 && v > 0.53 && v < 0.82) {
            const edge = Math.min(u - 0.28, 0.72 - u, v - 0.53, 0.82 - v) < 1.5 * px;
            c = edge ? f.rgb(0x8d969e) : lit ? (f.fbm(u, v, 4, 3, seed) > 0.5 ? f.rgb(0xfff4c8) : f.rgb(0xffb040)) : f.rgb(0x1a1c20);
            h = edge ? 1 : 0.2;
        }
        f.put(s, x, y, c, h);
    });
}
registerTexturePattern('arc_furnace_side', (f, s, tint, seed) => smelterPaintArcSide(f, s, false, false, seed));
registerTexturePattern('arc_furnace_front_off', (f, s, tint, seed) => smelterPaintArcSide(f, s, true, false, seed));
registerTexturePattern('arc_furnace_front_on', (f, s, tint, seed) => smelterPaintArcSide(f, s, true, true, seed));
// From above: a steel rim, the refractory roof, and the sooty middle the electrodes rise from. It is
// round so that the three electrodes fall on it whichever way the furnace faces.
function smelterPaintArcTop(f, s, lit, seed) {
    f.each(s, (x, y, u, v) => {
        const r = Math.hypot(u - 0.5, v - 0.5);
        let c = f.tone(s, f.rgb(0x5f6a74), (f.hash(x, y, seed) - 0.5) * 0.12);
        let h = 0.7;
        if (r < 0.5) { c = f.tone(s, f.rgb(0x8c8378), (f.fbm(u, v, 4, 3, seed) - 0.5) * 0.3); h = 0.5; }
        if (r < 0.28) { c = f.tone(s, f.rgb(0x26272a), (f.hash(x, y, seed) - 0.5) * 0.2); h = 0.3; }
        if (lit && r < 0.28) c = r < 0.13 ? f.rgb(0xf0f8ff) : r < 0.2 ? f.rgb(0xa8d8ff) : f.rgb(0x4a5a78);
        f.put(s, x, y, c, h);
    });
}
registerTexturePattern('arc_furnace_top_off', (f, s, tint, seed) => smelterPaintArcTop(f, s, false, seed));
registerTexturePattern('arc_furnace_top_on', (f, s, tint, seed) => smelterPaintArcTop(f, s, true, seed));

// ---------------------------------------------------------------------------------------
// Blocks

furnBlock('foundry', {
    color: 0xA2563A, name: 'Foundry', shape: 'oven', breakDuration: 1.1, category: 'stone', storageSlots: 3,
    faces: { top: 'foundry_top_off', side: 'foundry_side', bottom: 'foundry_side', front: 'foundry_front_off' },
    lit: { lightEmission: 13, faces: { top: { pattern: 'foundry_top_on', glow: 1 }, side: 'foundry_side', bottom: 'foundry_side', front: { pattern: 'foundry_front_on', glow: 1 } } }
});
furnBlock('arc_furnace', {
    color: 0x5F6A74, name: 'Electric Arc Furnace', shape: 'arc_furnace', breakDuration: 1.3, category: 'stone', storageSlots: 3, electric: true,
    faces: { top: 'arc_furnace_top_off', side: 'arc_furnace_side', bottom: 'arc_furnace_side', front: 'arc_furnace_front_off' },
    lit: { lightEmission: 14, faces: { top: { pattern: 'arc_furnace_top_on', glow: 1 }, side: 'arc_furnace_side', bottom: 'arc_furnace_side', front: { pattern: 'arc_furnace_front_on', glow: 1 } } }
});

const ORE_HAND_SMELTING = [
    ['copper_ore', 'copper_block', 'Copper Ore'],
    ['tin_ore', 'element_sn', 'Tin Ore'],
    ['zinc_ore', 'element_zn', 'Zinc Ore'],
    ['lead_ore', 'element_pb', 'Lead Ore'],
    ['silver_ore', 'element_ag', 'Silver Ore']
];

// So that what is mined can go to the lab bench, which only takes element blocks. There is no way back.
const METAL_TO_ELEMENT = [
    ['copper_block', 'element_cu', 'CU', 'Copper Block'],
    ['iron_block', 'element_fe', 'FE', 'Iron Block'],
    ['gold_block', 'element_au', 'AU', 'Gold Block']
];

registerGameContent(({ addItem, addRecipe }) => {
    ['foundry', 'arc_furnace'].forEach(addItem);
    addRecipe('foundry', 'Build Foundry', 'foundry', 1, [{ type: 'brick', amount: 8 }, { type: 'cobblestone', amount: 4 }, { type: 'iron_ore', amount: 2 }, { type: 'coal_ore', amount: 1 }]);
    // Later in the game: it takes a motor's worth of electrical work first.
    addRecipe('arc_furnace', 'Build Electric Arc Furnace', 'arc_furnace', 1, [{ type: 'iron_block', amount: 4 }, { type: 'electric_motor', amount: 1 }, { type: 'copper_wire', amount: 8 }, { type: 'coal_ore', amount: 3 }, { type: 'brick', amount: 4 }]);
    // Smelting by hand, so nobody is stuck before the first foundry: it gives half what the foundry
    // gives (APPLIANCE_FOUNDRY), and it burns a whole coal for each ore.
    for (const [ore, metal, name] of ORE_HAND_SMELTING) {
        addRecipe(`smelt_${ore}`, `Smelt ${name}`, metal, 1, [{ type: ore, amount: 1 }, { type: 'coal_ore', amount: 1 }]);
    }
    for (const [block, element, symbol, name] of METAL_TO_ELEMENT) {
        addRecipe(`${element}_from_block`, `Extract ${symbol} from ${name}`, element, 1, [{ type: block, amount: 1 }]);
    }
});
