// Palace decor: the building materials and the furniture of the palaces (/build palace_*, the
// construction_palace_*.js files), and for everybody who builds one of their own. Loaded after
// furniture.js and decor.js, whose helpers it uses (furnShape, furnTallShape, furnBlock,
// furnPlaceOnWall, furnPaintBands, FURNITURE_COLORS).
// - Materials: sandstone (plain, cut, its stairs and slab), glazed tiles in six colours with their
//   stairs and slabs (for curved roofs and onion domes), lime stucco in white and red, magma rock
//   that glows, a block of snow and packed ice. Slabs are the plain half blocks of world.js
//   (`slabSource`, height 0.5); stairs are the shape of js/blockShapes.js, `<id>_stairs:<facing>:<half>`.
// - Furniture, shaped blocks written facing north in sixteenths as in furniture.js: four thrones two
//   cells tall (`gilded_throne:lower:s`, sat on in the lower half), a banner for each of the 16 colours
//   that hangs on the wall clicked (`red_banner:s`), a fountain, a wooden lattice screen and a paper
//   screen that join like panes, a marble bust on its pedestal (`statue:s`), and three instruments:
//   an astrolabe (`astrolabe:s`), a sundial and a globe (no facing: the gnomon of the sundial always
//   points north, as a real one must).
// - The sundial and the astrolabe are read with a right click: the sundial gives the hour by the
//   sun (none at night), the astrolabe how high the sun stands above the horizon.
// - Every recipe uses what a player can get in survival; the guide tells each next to its kin:
//   sandstone in topic 51, snow and packed ice in 52, glazed tiles in 57 (their stairs and slabs in
//   196 and 56), magma rock in 59 and 105, stucco in 183, thrones in 224, banners, the bust, the
//   globe and the fountain in 231, the screens in 198, the sundial and the astrolabe in 132.
// Mixed into Game.prototype; hooked through js/extensions.js.

// The glazed tiles: [id word, label, colour, what colours the glaze (element blocks and items)].
const PALACE_TILES = [
    ['blue', 'Blue', 0x2c5cb4, ['element_co']],
    ['white', 'White', 0xeceee9, ['element_sn']],
    ['yellow', 'Yellow', 0xe2b62c, ['element_pb']],
    ['green', 'Green', 0x3a8c46, ['element_cu']],
    ['red', 'Red', 0xb03428, ['rust_pigment']],
    ['turquoise', 'Turquoise', 0x2fb2a6, ['element_cu', 'baking_soda']]
];

// The thrones: [id, label, frame colour, cushion colour, what it is made of].
const PALACE_THRONES = [
    ['gilded_throne', 'Gilded Throne', 0xd8aa36, 0xa8242c, [{ type: 'gold_block', amount: 1 }, { type: 'red_wool', amount: 2 }, { type: 'dark_oak_planks', amount: 3 }]],
    ['lacquer_throne', 'Red Lacquer Throne', 0xa82a22, 0xe0b23a, [{ type: 'cherry_planks', amount: 4 }, { type: 'rust_pigment', amount: 1 }, { type: 'yellow_wool', amount: 2 }]],
    ['jade_throne', 'Jade Throne', 0x4f9c74, 0xe8e2c8, [{ type: 'marble', amount: 4 }, { type: 'element_cr', amount: 1 }, { type: 'white_wool', amount: 2 }]],
    ['obsidian_throne', 'Obsidian Throne', 0x231a33, 0x7e4cc2, [{ type: 'obsidian', amount: 4 }, { type: 'purple_wool', amount: 2 }]]
];

// Materials that are the same in every pattern below.
const PALACE_BRASS = 0xc9a23a;
const PALACE_MARBLE = 0xe6e2da;
const PALACE_WATER = 0x3d8fd0;
const PALACE_GLOSSY = { rtx: { roughness: 0.18, metalness: 0, normalScale: 0.25 } };

// ---------------------------------------------------------------------------------------
// Textures of the materials

// Sandstone: fine sand pressed in layers, which show on the sides as soft bands.
registerTexturePattern('palace_sandstone_side', (f, s, tint, seed) => {
    const base = f.rgb(tint ?? 0xd8c088);
    f.each(s, (x, y, u, v) => {
        const band = Math.sin((v * 5 + f.fbm(u, v, 3, 2, seed) * 0.8) * Math.PI * 2) * 0.5 + 0.5;
        const k = (band - 0.5) * 0.12 + (f.hash(x, y, seed) - 0.5) * 0.1 + (f.fbm(u, v, 6, 2, seed + 3) - 0.5) * 0.1;
        f.put(s, x, y, f.tone(s, base, k), 0.4 + band * 0.2);
    });
});
registerTexturePattern('palace_sandstone_top', (f, s, tint, seed) => {
    const base = f.rgb(tint ?? 0xd8c088);
    f.each(s, (x, y, u, v) => {
        const k = (f.fbm(u, v, 4, 3, seed) - 0.5) * 0.14 + (f.hash(x, y, seed) - 0.5) * 0.12;
        f.put(s, x, y, f.tone(s, base, k), 0.5);
    });
});
// Cut sandstone: smoothed, with a carved frame round each face.
registerTexturePattern('palace_cut_sandstone', (f, s, tint, seed) => {
    const base = f.rgb(tint ?? 0xdcc690);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        const edge = Math.min(u, 1 - u, v, 1 - v);
        let k = (f.fbm(u, v, 3, 2, seed) - 0.5) * 0.08 + (f.hash(x, y, seed) - 0.5) * 0.06;
        let h = 0.6;
        if (edge < 1.2 * px) { k -= 0.18; h = 0.3; }
        else if (edge > 2.2 * px && edge < 3.2 * px) { k -= 0.12; h = 0.35; }
        f.put(s, x, y, f.tone(s, base, k), h);
    });
});

// A glazed tile: four square tiles to a face, glossy, a pale joint of mortar, a star of a lighter
// glaze in the middle of each (the pattern a potter paints before firing).
registerTexturePattern('palace_glazed_tile', (f, s, tint, seed) => {
    const glaze = f.rgb(tint ?? 0x2c5cb4);
    const light = f.mix(glaze, [250, 250, 245], 0.45);
    const mortar = f.rgb(0xd8d2c4);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        const tu = (u * 2) % 1;
        const tv = (v * 2) % 1;
        if (Math.min(tu, 1 - tu, tv, 1 - tv) < 0.6 * px * 2) {
            f.put(s, x, y, f.tone(s, mortar, (f.hash(x, y, seed) - 0.5) * 0.08), 0.2);
            return;
        }
        const dx = Math.abs(tu - 0.5);
        const dy = Math.abs(tv - 0.5);
        const star = Math.min(dx + dy, Math.max(dx, dy) * 1.35) < 0.22;
        const shine = (tu + tv) % 1 < 0.08 ? 0.18 : 0;
        const k = (f.fbm(u, v, 4, 2, seed) - 0.5) * 0.08 + shine;
        f.put(s, x, y, f.tone(s, star ? light : glaze, k), 0.7);
    });
}, PALACE_GLOSSY);

// Lime stucco: smooth plaster with the strokes of the trowel.
registerTexturePattern('palace_stucco', (f, s, tint, seed) => {
    const base = f.rgb(tint ?? 0xf0ece2);
    f.each(s, (x, y, u, v) => {
        const stroke = f.stretchedNoise(u + v * 0.3, v, 3, 9, seed);
        const k = (stroke - 0.5) * 0.08 + (f.fbm(u, v, 5, 2, seed + 5) - 0.5) * 0.06 + (f.hash(x, y, seed) - 0.5) * 0.04;
        f.put(s, x, y, f.tone(s, base, k), 0.5);
    });
});

// Magma rock: dark basalt with cracks that glow orange.
registerTexturePattern('palace_magma_rock', (f, s, tint, seed) => {
    const rock = f.rgb(0x2a2426);
    const hot = f.rgb(0xff7a1c);
    const core = f.rgb(0xffd25a);
    f.each(s, (x, y, u, v) => {
        const cell = f.worley(u, v, 3, seed);
        const crack = cell.d2 - cell.d1;
        if (crack < 0.07) {
            f.put(s, x, y, crack < 0.03 ? core : hot, 0.2);
            return;
        }
        const k = (f.fbm(u, v, 5, 2, seed) - 0.5) * 0.3 + (f.hash(x, y, seed) - 0.5) * 0.12;
        f.put(s, x, y, f.tone(s, rock, k), 0.6);
    });
});

// Snow: white grains with a blue shadow here and there.
registerTexturePattern('palace_snow', (f, s, tint, seed) => {
    const base = f.rgb(0xf4f8fc);
    const shadow = f.rgb(0xd6e2f0);
    f.each(s, (x, y, u, v) => {
        const n = f.fbm(u, v, 4, 3, seed);
        const sparkle = f.hash(x, y, seed) > 0.93 ? 0.08 : 0;
        f.put(s, x, y, f.tone(s, f.mix(shadow, base, f.clamp01(n * 1.6)), sparkle - (f.hash(x, y, seed + 2) - 0.5) * 0.04), 0.5);
    });
});

// Packed ice: pale blue with long white cracks and air bubbles.
registerTexturePattern('palace_packed_ice', (f, s, tint, seed) => {
    const base = f.rgb(0x9cc8ec);
    const crack = f.rgb(0xeaf4fc);
    f.each(s, (x, y, u, v) => {
        const cell = f.worley(u, v, 2, seed);
        const line = cell.d2 - cell.d1 < 0.04;
        const bubble = f.worley(u, v, 7, seed + 9).d1 < 0.05;
        const k = (f.fbm(u, v, 3, 2, seed) - 0.5) * 0.12;
        f.put(s, x, y, line || bubble ? crack : f.tone(s, base, k), 0.7);
    });
}, PALACE_GLOSSY);

// ---------------------------------------------------------------------------------------
// Blocks: the materials

registerBlockType('sandstone', {
    color: 0xD8C088, name: 'Sandstone', breakDuration: 0.8, category: 'stone',
    faces: { top: 'palace_sandstone_top', side: 'palace_sandstone_side', bottom: 'palace_sandstone_top' }
});
registerBlockType('cut_sandstone', {
    color: 0xDCC690, name: 'Cut Sandstone', breakDuration: 0.8, category: 'stone',
    faces: { top: 'palace_cut_sandstone', side: 'palace_cut_sandstone' }
});
registerBlockType('sandstone_stairs', { color: 0xD8C088, name: 'Sandstone Stairs', shape: 'stairs', textureOf: 'sandstone', breakDuration: 0.7, category: 'stone' });
registerBlockType('sandstone_slab', { color: 0xD8C088, name: 'Sandstone Slab', slabSource: 'sandstone', height: 0.5, breakDuration: 0.5, category: 'stone' });

PALACE_TILES.forEach(([word, label, color]) => {
    const tile = `${word}_glazed_tile`;
    registerBlockType(tile, { color, name: `${label} Glazed Tile`, breakDuration: 0.7, category: 'stone', faces: { top: { pattern: 'palace_glazed_tile', tint: color }, side: { pattern: 'palace_glazed_tile', tint: color } } });
    registerBlockType(`${tile}_stairs`, { color, name: `${label} Glazed Tile Stairs`, shape: 'stairs', textureOf: tile, breakDuration: 0.6, category: 'stone' });
    registerBlockType(`${tile}_slab`, { color, name: `${label} Glazed Tile Slab`, slabSource: tile, height: 0.5, breakDuration: 0.45, category: 'stone' });
});

registerBlockType('white_stucco', { color: 0xF0ECE2, name: 'White Lime Stucco', breakDuration: 0.6, category: 'stone', faces: { top: { pattern: 'palace_stucco', tint: 0xf0ece2 }, side: { pattern: 'palace_stucco', tint: 0xf0ece2 } } });
registerBlockType('red_stucco', { color: 0xB4483A, name: 'Red Lime Stucco', breakDuration: 0.6, category: 'stone', faces: { top: { pattern: 'palace_stucco', tint: 0xb4483a }, side: { pattern: 'palace_stucco', tint: 0xb4483a } } });
registerBlockType('magma_rock', {
    color: 0x3A2A26, name: 'Magma Rock', breakDuration: 1.1, category: 'stone', lightEmission: 10,
    faces: { top: { pattern: 'palace_magma_rock', glow: 0.8 }, side: { pattern: 'palace_magma_rock', glow: 0.8 } }
});
registerBlockType('snow_block', { color: 0xF4F8FC, name: 'Snow Block', breakDuration: 0.3, category: 'soil', faces: { top: 'palace_snow', side: 'palace_snow' } });
registerBlockType('packed_ice', { color: 0x9CC8EC, name: 'Packed Ice', breakDuration: 0.5, category: 'stone', faces: { top: 'palace_packed_ice', side: 'palace_packed_ice' } });

// ---------------------------------------------------------------------------------------
// Shapes of the furniture

// A throne, two cells tall: legs, a seat with its cushion, arms, and a back that goes on into the
// upper cell, where it ends in a crest. Sat on in the lower half (`seat` is only there).
furnTallShape('throne', {
    boxes: (half) => (half === 'lower'
        ? [[1, 0, 1, 3, 6, 3], [13, 0, 1, 15, 6, 3], [1, 0, 13, 3, 6, 15], [13, 0, 13, 15, 6, 15], [1, 6, 1, 15, 8, 15],
            [0, 8, 1, 2, 13, 13], [14, 8, 1, 16, 13, 13], [1, 8, 13, 15, 16, 16]]
        : [[1, 0, 13, 15, 10, 16], [3, 10, 13.5, 13, 13, 15.5], [6, 13, 13.5, 10, 15, 15.5], [0, 0, 13, 1, 12, 16], [15, 0, 13, 16, 12, 16]]),
    collision: (half) => (half === 'lower' ? [[0, 0, 1, 16, 8, 16], [1, 8, 13, 15, 16, 16]] : [[1, 0, 13, 15, 10, 16]]),
    iconBoxes: [[1, 0, 1, 15, 8, 15], [1, 8, 13, 15, 26, 16], [0, 8, 1, 2, 13, 13], [14, 8, 1, 16, 13, 13]]
});

// A banner on a rod, against the wall clicked; its cloth ends in two points. Walked through.
furnShape('banner', {
    boxes: [[0, 15, 14, 16, 16, 16], [2, 4, 15, 14, 15, 16], [2, 1, 15, 7, 4, 16], [9, 1, 15, 14, 4, 16]],
    collision: [],
    place: furnPlaceOnWall
});

// A fountain: a round basin (a rim of four walls), water in it, and a column with a small bowl on
// top in the middle. The textures paint it by height: stone below, water above.
furnShape('fountain', {
    facing: false,
    boxes: [[0, 0, 0, 16, 1, 16], [0, 1, 0, 16, 6, 2], [0, 1, 14, 16, 6, 16], [0, 1, 2, 2, 6, 14], [14, 1, 2, 16, 6, 14], [2, 1, 2, 14, 5, 14],
        [7, 5, 7, 9, 11, 9], [5, 11, 5, 11, 12, 11], [7.5, 12, 7.5, 8.5, 15, 8.5]],
    collision: [[0, 0, 0, 16, 6, 16]]
});

// A bust on a pedestal: the base, the shoulders, the neck and the head.
furnShape('statue', {
    boxes: [[2, 0, 2, 14, 2, 14], [3, 2, 3, 13, 8, 13], [2, 8, 2, 14, 9, 14], [4, 9, 6, 12, 11, 11], [6.5, 11, 7, 9.5, 12, 10], [5.5, 12, 5.5, 10.5, 16, 10.5]],
    collision: [[2, 0, 2, 14, 16, 14]]
});

// An astrolabe on its stand: a brass disc standing up, face towards whoever placed it.
furnShape('astrolabe', {
    boxes: [[5, 0, 5, 11, 1, 11], [7.5, 1, 7.5, 8.5, 3, 8.5], [3, 3, 7.5, 13, 13, 8.5], [7, 13, 7.5, 9, 15, 8.5]],
    collision: [[3, 0, 5, 13, 15, 11]],
    iconFit: true
});

// A sundial: a stone pillar, the dial on top and the gnomon, a triangle along the north-south line whose
// sloping edge rises towards the north (local -z here, and the shape never turns).
furnShape('sundial', {
    facing: false,
    boxes: [[4, 0, 4, 12, 9, 12], [2, 9, 2, 14, 10, 14], [7.5, 10, 4, 8.5, 11, 12], [7.5, 11, 4, 8.5, 12, 10], [7.5, 12, 4, 8.5, 13, 8], [7.5, 13, 4, 8.5, 14, 6]],
    collision: [[2, 0, 2, 14, 10, 14]]
});

// A globe on a wooden stand: a foot, a post and the Earth as one cube, the way the world of the game
// is drawn (three crossed boxes trying to round it only looked like a cucumber).
furnShape('globe', {
    facing: false,
    boxes: [[5, 0, 5, 11, 1, 11], [7.5, 1, 7.5, 8.5, 4, 8.5], [3, 4, 3, 13, 14, 13]],
    collision: [[3, 0, 3, 13, 14, 13]],
    iconFit: true
});

// ---------------------------------------------------------------------------------------
// Textures of the furniture

// A throne by halves: wood or stone of its colour with a gold edge, the cushion where it is sat on,
// and on the back of the upper half a panel of the cushion's colour.
function palaceDecorPaintThrone(f, s, seed, frame, cushion, upper) {
    const wood = f.rgb(frame);
    const cloth = f.rgb(cushion);
    const gold = f.rgb(0xe8c24a);
    f.each(s, (x, y, u, v) => {
        const height = (1 - v) * 16;
        const panel = upper ? height < 9 && height > 1 && u > 0.2 && u < 0.8 : height > 6 && height < 8.5;
        const back = !upper && height > 9 && height < 15 && u > 0.2 && u < 0.8;
        if (panel || back) {
            f.put(s, x, y, f.tone(s, cloth, (f.fbm(u, v, 6, 2, seed) - 0.5) * 0.14), 0.4);
            return;
        }
        const trim = Math.abs(u - 0.15) < 0.04 || Math.abs(u - 0.85) < 0.04 || (upper && height > 9.5);
        f.put(s, x, y, trim ? f.tone(s, gold, (f.hash(x, y, seed) - 0.5) * 0.1) : f.tone(s, wood, (f.fbm(u, v, 4, 2, seed) - 0.5) * 0.16), trim ? 0.9 : 0.6);
    });
}
PALACE_THRONES.forEach(([id, , frame, cushion]) => {
    registerTexturePattern(`${id}_lower`, (f, s, tint, seed) => palaceDecorPaintThrone(f, s, seed, frame, cushion, false));
    registerTexturePattern(`${id}_upper`, (f, s, tint, seed) => palaceDecorPaintThrone(f, s, seed, frame, cushion, true));
});

// A banner: wool of its colour, a gold border, a gold lozenge in the middle; the rod at the top is brass.
registerTexturePattern('palace_banner', (f, s, tint, seed) => {
    const cloth = f.rgb(tint ?? 0xb93a32);
    const gold = f.rgb(0xe2b844);
    const rod = f.rgb(PALACE_BRASS);
    f.each(s, (x, y, u, v) => {
        const height = (1 - v) * 16;
        if (height >= 15) {
            f.put(s, x, y, f.tone(s, rod, (f.hash(x, y, seed) - 0.5) * 0.1), 0.9);
            return;
        }
        const border = u < 0.19 || u > 0.81 || height > 13.5 || (height < 5 && height > 3.6);
        const lozenge = Math.abs(u - 0.5) * 1.3 + Math.abs(height - 9.5) / 8 < 0.28;
        const k = (f.fbm(u, v, 8, 2, seed) - 0.5) * 0.12 + (f.hash(x, y, seed) - 0.5) * 0.08;
        f.put(s, x, y, f.tone(s, border || lozenge ? gold : cloth, k), border ? 0.7 : 0.5);
    });
});

// The fountain: from the side, stone up to the rim and water above it (the jet); from above, the
// stone rim round the water and the bowl.
registerTexturePattern('palace_fountain_side', (f, s, tint, seed) => {
    const stone = f.rgb(PALACE_MARBLE);
    const water = f.rgb(PALACE_WATER);
    f.each(s, (x, y, u, v) => {
        const height = (1 - v) * 16;
        if (height < 6 || (height >= 11 && height < 12)) {
            f.put(s, x, y, f.tone(s, stone, (f.fbm(u, v, 4, 2, seed) - 0.5) * 0.1), 0.6);
            return;
        }
        const ripple = Math.sin((u * 3 + v * 12 + f.fbm(u, v, 4, 2, seed)) * Math.PI * 2) * 0.12;
        f.put(s, x, y, f.tone(s, water, ripple), 0.3);
    });
}, PALACE_GLOSSY);
registerTexturePattern('palace_fountain_top', (f, s, tint, seed) => {
    const stone = f.rgb(PALACE_MARBLE);
    const water = f.rgb(PALACE_WATER);
    f.each(s, (x, y, u, v) => {
        const edge = Math.min(u, 1 - u, v, 1 - v);
        const inner = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5));
        if (edge < 2 / 16 || (inner < 3 / 16 && inner > 1.2 / 16)) {
            f.put(s, x, y, f.tone(s, stone, (f.fbm(u, v, 4, 2, seed) - 0.5) * 0.1), 0.6);
            return;
        }
        const r = Math.hypot(u - 0.5, v - 0.5);
        f.put(s, x, y, f.tone(s, water, Math.sin(r * 60 - seed) * 0.08), 0.3);
    });
}, PALACE_GLOSSY);

// The lattice screen (a mashrabiya): turned wooden bars in a grid of diamonds; the gaps are cut out.
registerTexturePattern('palace_lattice', (f, s, tint, seed) => {
    const wood = f.rgb(tint ?? 0x6a4428);
    f.each(s, (x, y, u, v) => {
        const a = ((u + v) * 3) % 1;
        const b = ((u - v + 4) * 3) % 1;
        const frame = Math.min(u, 1 - u, v, 1 - v) < 0.07;
        const bar = Math.abs(a - 0.5) < 0.13 || Math.abs(b - 0.5) < 0.13;
        const knot = Math.hypot(((u * 3) % 1) - 0.5, ((v * 3) % 1) - 0.5) < 0.16;
        if (!frame && !bar && !knot) {
            f.put(s, x, y, wood, 0, 0);
            return;
        }
        f.put(s, x, y, f.tone(s, wood, (f.hash(x, y, seed) - 0.5) * 0.12 + (knot ? 0.08 : 0)), 0.8);
    });
}, { sprite: true });

// The paper screen (a shoji): a light wooden grid over pale paper.
registerTexturePattern('palace_paper_screen', (f, s, tint, seed) => {
    const wood = f.rgb(0xc89a62);
    const paper = f.rgb(0xf4eedc);
    f.each(s, (x, y, u, v) => {
        const grid = Math.min(u, 1 - u, v, 1 - v) < 0.06 || Math.abs((u * 2) % 1 - 0.5) > 0.47 || Math.abs((v * 3) % 1 - 0.5) > 0.47;
        const k = grid ? (f.hash(x, y, seed) - 0.5) * 0.1 : (f.fbm(u, v, 8, 2, seed) - 0.5) * 0.05;
        f.put(s, x, y, f.tone(s, grid ? wood : paper, k), grid ? 0.8 : 0.4);
    });
});

// The bust: polished marble, and on its front, at the height of the head, a face.
registerTexturePattern('palace_marble', (f, s, tint, seed) => {
    const base = f.rgb(tint ?? PALACE_MARBLE);
    f.each(s, (x, y, u, v) => {
        const vein = Math.abs(Math.sin((u * 2 + v * 3 + f.fbm(u, v, 3, 3, seed) * 2.5) * Math.PI)) < 0.06 ? -0.14 : 0;
        f.put(s, x, y, f.tone(s, base, vein + (f.hash(x, y, seed) - 0.5) * 0.05), 0.6);
    });
}, PALACE_GLOSSY);
registerTexturePattern('palace_statue_front', (f, s, tint, seed) => {
    const base = f.rgb(PALACE_MARBLE);
    f.each(s, (x, y, u, v) => {
        const height = (1 - v) * 16;
        let k = (f.hash(x, y, seed) - 0.5) * 0.05;
        if (height > 12 && height < 16) {
            const eye = Math.abs(height - 14.4) < 0.4 && Math.abs(Math.abs(u - 0.5) - 0.09) < 0.04;
            const nose = Math.abs(u - 0.5) < 0.025 && height > 13.2 && height < 14.4;
            const mouth = Math.abs(height - 12.7) < 0.25 && Math.abs(u - 0.5) < 0.07;
            if (eye || mouth) k -= 0.3;
            if (nose) k -= 0.15;
        }
        f.put(s, x, y, f.tone(s, base, k), 0.6);
    });
}, PALACE_GLOSSY);

// The astrolabe's face: the brass plate with its rings of degrees and the star pointers of the rete.
registerTexturePattern('palace_astrolabe', (f, s, tint, seed) => {
    const brass = f.rgb(PALACE_BRASS);
    const dark = f.rgb(0x5a4418);
    f.each(s, (x, y, u, v) => {
        const height = (1 - v) * 16;
        // The disc spans heights 3 to 13 (its box): centre at 8.
        const dx = (u - 0.5) * 16;
        const dy = height - 8;
        const r = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        let k = (f.hash(x, y, seed) - 0.5) * 0.1;
        if (r > 4.2 && r < 4.6) k -= 0.35;
        if (r > 4.6 && Math.abs(Math.sin(angle * 18)) < 0.25) k -= 0.25;
        if (r < 3 && (Math.abs(Math.sin(angle * 3)) < 0.12 || Math.abs(r - 2) < 0.25)) k -= 0.3;
        if (r < 0.5) k += 0.25;
        f.put(s, x, y, k < -0.28 ? dark : f.tone(s, brass, k), 0.8);
    });
}, { rtx: { roughness: 0.35, metalness: 0.9, normalScale: 0.3 } });
registerTexturePattern('palace_brass', (f, s, tint, seed) => furnPaintBands(f, s, seed, [[0, PALACE_BRASS]]));

// The sundial, seen from above: the bronze dial with its hour lines fanning out from the gnomon's foot,
// on stone.
registerTexturePattern('palace_sundial_top', (f, s, tint, seed) => {
    const stone = f.rgb(0xb8b2a6);
    const bronze = f.rgb(0xb4823c);
    const line = f.rgb(0x3a2a14);
    f.each(s, (x, y, u, v) => {
        const edge = Math.min(u, 1 - u, v, 1 - v);
        if (edge < 2 / 16) {
            f.put(s, x, y, f.tone(s, stone, (f.hash(x, y, seed) - 0.5) * 0.1), 0.6);
            return;
        }
        // From the foot of the gnomon (the south end of its edge), lines for the hours, every 15 degrees.
        const angle = Math.atan2(u - 0.5, -(v - 0.78)) * 180 / Math.PI;
        const onLine = Math.abs(angle) <= 95 && Math.abs(angle / 15 - Math.round(angle / 15)) < 0.08 && v < 0.8;
        f.put(s, x, y, onLine ? line : f.tone(s, bronze, (f.fbm(u, v, 4, 2, seed) - 0.5) * 0.14), onLine ? 0.3 : 0.7);
    });
});
registerTexturePattern('palace_sundial_side', (f, s, tint, seed) => furnPaintBands(f, s, seed, [[0, 0xb8b2a6], [9, 0xb4823c], [10, 0x6a4a24]]));

// The globe: blue seas and green and ochre land; the stand is wood.
registerTexturePattern('palace_globe', (f, s, tint, seed) => {
    const sea = f.rgb(0x2f6cb0);
    const land = f.rgb(0x5c9a48);
    const desert = f.rgb(0xc8a45a);
    const wood = f.rgb(0x6a4428);
    f.each(s, (x, y, u, v) => {
        const height = (1 - v) * 16;
        if (height < 4) {
            f.put(s, x, y, f.tone(s, wood, (f.hash(x, y, seed) - 0.5) * 0.12), 0.7);
            return;
        }
        const n = f.fbm(u, v, 3, 3, seed);
        const c = n > 0.56 ? (f.fbm(u, v, 6, 2, seed + 4) > 0.55 ? desert : land) : sea;
        f.put(s, x, y, f.tone(s, c, (f.hash(x, y, seed) - 0.5) * 0.08), n > 0.56 ? 0.6 : 0.4);
    });
});

// ---------------------------------------------------------------------------------------
// Blocks: the furniture

PALACE_THRONES.forEach(([id, label, frame]) => {
    const faces = (half) => ({ top: `${id}_${half}`, side: `${id}_${half}`, bottom: `${id}_lower` });
    furnBlock(id, {
        color: frame, name: label, shape: 'throne', breakDuration: 0.9, category: 'wood',
        faces: faces('lower'),
        halves: { lower: { faces: faces('lower'), seat: 0.5 }, upper: { faces: faces('upper') } }
    });
});

FURNITURE_COLORS.forEach(([color, label, hex]) => {
    furnBlock(`${color}_banner`, {
        color: hex, name: `${label} Banner`, shape: 'banner', breakDuration: 0.15, solid: false, category: 'wool',
        faces: { top: { pattern: 'palace_banner', tint: hex }, side: { pattern: 'palace_banner', tint: hex } }
    });
});

furnBlock('fountain', {
    color: PALACE_WATER, name: 'Fountain', shape: 'fountain', breakDuration: 0.9, category: 'stone',
    faces: { top: 'palace_fountain_top', side: 'palace_fountain_side', bottom: 'palace_marble' }
});
registerBlockType('lattice_screen', {
    color: 0x6A4428, name: 'Lattice Screen', shape: 'pane', faces: { top: 'palace_lattice', side: 'palace_lattice' }, cutout: true,
    lightPasses: true, breakDuration: 0.4, category: 'wood'
});
registerBlockType('paper_screen', {
    color: 0xF4EEDC, name: 'Paper Screen', shape: 'pane', faces: { top: 'palace_paper_screen', side: 'palace_paper_screen' },
    transparent: true, opacity: 0.85, lightPasses: true, breakDuration: 0.25, category: 'wood'
});
furnBlock('statue', {
    color: PALACE_MARBLE, name: 'Marble Bust', shape: 'statue', breakDuration: 1.0, category: 'stone',
    faces: { top: 'palace_marble', side: 'palace_marble', front: 'palace_statue_front' }
});
furnBlock('astrolabe', {
    color: PALACE_BRASS, name: 'Astrolabe', shape: 'astrolabe', breakDuration: 0.4, category: 'stone', palaceInstrument: 'astrolabe',
    faces: { top: 'palace_brass', side: 'palace_brass', front: 'palace_astrolabe' }
});
furnBlock('sundial', {
    color: 0xB4823C, name: 'Sundial', shape: 'sundial', breakDuration: 0.9, category: 'stone', palaceInstrument: 'sundial',
    faces: { top: 'palace_sundial_top', side: 'palace_sundial_side' }
});
furnBlock('globe', {
    color: 0x2F6CB0, name: 'Globe', shape: 'globe', breakDuration: 0.4, category: 'wood',
    faces: { top: 'palace_globe', side: 'palace_globe', bottom: 'planks' }
});

// ---------------------------------------------------------------------------------------
// Recipes

registerGameContent(function ({ addRecipe }) {
    addRecipe('sandstone', 'Press Sandstone', 'sandstone', 2, [{ type: 'sand', amount: 4 }]);
    addRecipe('cut_sandstone', 'Cut Sandstone', 'cut_sandstone', 4, [{ type: 'sandstone', amount: 4 }]);
    addRecipe('sandstone_stairs', 'Cut Sandstone Stairs', 'sandstone_stairs', 4, [{ type: 'sandstone', amount: 3 }]);
    addRecipe('sandstone_slab', 'Cut Sandstone Slab', 'sandstone_slab', 2, [{ type: 'sandstone', amount: 1 }]);
    PALACE_TILES.forEach(([word, label, , colourants]) => {
        const tile = `${word}_glazed_tile`;
        addRecipe(tile, `Glaze ${label} Tiles`, tile, 4, [{ type: 'brick', amount: 2 }, { type: 'sand', amount: 1 }, ...colourants.map((type) => ({ type, amount: 1 }))]);
        addRecipe(`${tile}_stairs`, `Cut ${label} Glazed Tile Stairs`, `${tile}_stairs`, 4, [{ type: tile, amount: 3 }]);
        addRecipe(`${tile}_slab`, `Cut ${label} Glazed Tile Slab`, `${tile}_slab`, 2, [{ type: tile, amount: 1 }]);
    });
    addRecipe('white_stucco', 'Mix White Lime Stucco', 'white_stucco', 4, [{ type: 'quicklime', amount: 1 }, { type: 'sand', amount: 2 }, { type: 'water_flask', amount: 1 }]);
    addRecipe('red_stucco', 'Mix Red Lime Stucco', 'red_stucco', 4, [{ type: 'white_stucco', amount: 4 }, { type: 'rust_pigment', amount: 1 }]);
    addRecipe('magma_rock', 'Heat Magma Rock', 'magma_rock', 4, [{ type: 'basalt', amount: 4 }, { type: 'glow_dust', amount: 1 }]);
    addRecipe('snow_block', 'Crush Ice into Snow', 'snow_block', 1, [{ type: 'ice', amount: 2 }]);
    addRecipe('packed_ice', 'Pack Ice', 'packed_ice', 1, [{ type: 'ice', amount: 4 }]);

    PALACE_THRONES.forEach(([id, label, , , inputs]) => addRecipe(id, `Build ${label}`, id, 1, inputs));
    FURNITURE_COLORS.forEach(([color, label]) => {
        addRecipe(`${color}_banner`, `Sew ${label} Banner`, `${color}_banner`, 1, [{ type: `${color}_wool`, amount: 2 }, { type: 'gold_leaf', amount: 1 }]);
    });
    addRecipe('fountain', 'Build Fountain', 'fountain', 1, [{ type: 'marble', amount: 4 }, { type: 'water_bucket', amount: 1 }]);
    addRecipe('lattice_screen', 'Carve Lattice Screens', 'lattice_screen', 6, [{ type: 'dark_oak_planks', amount: 3 }]);
    addRecipe('paper_screen', 'Make Paper Screens', 'paper_screen', 4, [{ type: 'birch_planks', amount: 1 }, { type: 'wheat', amount: 3 }]);
    addRecipe('statue', 'Carve Marble Bust', 'statue', 1, [{ type: 'marble', amount: 3 }]);
    addRecipe('astrolabe', 'Make Astrolabe', 'astrolabe', 1, [{ type: 'brass_ingot', amount: 2 }]);
    addRecipe('sundial', 'Build Sundial', 'sundial', 1, [{ type: 'stone', amount: 3 }, { type: 'bronze_ingot', amount: 1 }]);
    addRecipe('globe', 'Make Globe', 'globe', 1, [{ type: 'planks', amount: 2 }, { type: 'blue_wool', amount: 1 }, { type: 'brass_ingot', amount: 1 }]);
});

// ---------------------------------------------------------------------------------------
// Reading the instruments

// Hours since midnight by the sun, to the nearest quarter (timeOfDay 0 is dawn, 06:00: decorClockHours).
function palaceDecorSundialHours(timeOfDay) {
    const hours = (((timeOfDay * 24 + 6) % 24) + 24) % 24;
    return Math.round(hours * 4) / 4;
}

// How high the sun stands, in whole degrees: negative under the horizon. sunY is the height of the
// unit vector towards it (Game.sunDirection, js/game/environment.js).
function palaceDecorSunAltitude(sunY) {
    return Math.round(Math.asin(Math.max(-1, Math.min(1, sunY))) * 180 / Math.PI);
}

Object.assign(Game.prototype, {
    // What the instrument in a cell says, or null when that cell holds none.
    palaceDecorReading(type) {
        const def = type && this.world.blockTypes[type];
        const instrument = def && def.palaceInstrument;
        if (instrument === 'sundial') {
            if (!((this.sunHeight || 0) > 0.05)) return gameText({ ES: 'El reloj de sol no da sombra: sin sol no hay hora.', EN: 'The sundial casts no shadow: without the sun there is no hour.' });
            const hours = palaceDecorSundialHours(this.timeOfDay || 0);
            const hh = Math.floor(hours);
            const mm = Math.round((hours - hh) * 60);
            const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
            return gameText({ ES: `La sombra del gnomon marca las ${time}.`, EN: `The gnomon's shadow points to ${time}.` });
        }
        if (instrument === 'astrolabe') {
            const altitude = palaceDecorSunAltitude(this.sunDirection ? this.sunDirection.y : 0);
            if (altitude >= 0) return gameText({ ES: `El astrolabio mide el sol a ${altitude}° sobre el horizonte.`, EN: `The astrolabe measures the sun ${altitude}° above the horizon.` });
            return gameText({ ES: `El sol está ${-altitude}° bajo el horizonte: de noche, el astrolabio se apunta a las estrellas.`, EN: `The sun is ${-altitude}° below the horizon: at night an astrolabe is aimed at the stars.` });
        }
        return null;
    }
});

// A right click on a sundial or an astrolabe reads it (crouch to build against it).
registerItemUseHandler(function (itemType, hit) {
    if (!hit || this.cameraController.isCrouching) return false;
    const position = this.world.getBlockPositionFromIntersection(hit);
    const type = position && this.world.getBlockTypeAt(position.x, position.y, position.z);
    const text = this.palaceDecorReading(type);
    if (!text) return false;
    this.receiveSystemMessage({ text });
    this.placeActionTimer = 0.25;
    return true;
});
