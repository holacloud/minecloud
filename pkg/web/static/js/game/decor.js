// Colour and decoration: stained glass (blocks and panes), carpets, curtains, wall paintings, a
// clock that shows the game's time, flower pots and vases.
// - Stained glass (`filterGlass`) multiplies what is behind it by its colour instead of painting
//   over it: see WorldRenderer.createFaceMaterial and ChunkMesher.build. It really tints, stays
//   see-through, and needs no sorting. A pane shares the material of its glass (`materialKey`).
// - Carpets and curtains are cut from the wool of their colour and use its material.
// - All the wall clocks in the world show one texture (the same time everywhere), redrawn once a
//   second only if a clock has been seen. Wall items attach to the wall clicked, as in
//   js/game/furniture.js, and stay when it is broken, like torches and signs.
// Mixed into Game.prototype; hooked through js/extensions.js. Loaded after furniture.js.

// [colour, filter (what share of each channel passes; near white lets most through), what tints
// it in real glass, as the element blocks of its recipe (see the guide's stained glass page)].
const DECOR_GLASS = [
    ['white', 0xeef1f3, ['sn']], ['orange', 0xffa34a, ['ag', 'fe']], ['magenta', 0xe65fe0, ['mn', 'co']], ['light_blue', 0x86c8ff, ['co', 'sn']],
    ['yellow', 0xffe95a, ['ag']], ['lime', 0xb2ec58, ['cr', 'sn']], ['pink', 0xffa6cc, ['au', 'sn']], ['gray', 0x8e9399, ['ni']],
    ['light_gray', 0xc6cacd, ['ni', 'sn']], ['cyan', 0x55d4dc, ['cu']], ['purple', 0xa864f2, ['mn']], ['blue', 0x5272ff, ['co']],
    ['brown', 0xb6804c, ['fe', 's']], ['green', 0x5abc52, ['cr']], ['red', 0xf25244, ['au']], ['black', 0x4c4e54, ['mn', 'fe']]
];

// ---------------------------------------------------------------------------------------
// Stained glass

// Lead along the edges of the block, a few lighter streaks. Fully opaque: as a filter, its colour
// is how much of what is behind passes.
registerTexturePattern('stained_glass', (f, s, tint, seed) => {
    const glass = f.rgb(tint ?? 0xffffff);
    const lead = f.rgb(0x3a3c40);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        if (Math.min(u, 1 - u, v, 1 - v) < 0.9 * px) {
            f.put(s, x, y, lead, 0.8);
            return;
        }
        const streak = Math.max(0, 1 - Math.abs(u - v * 0.6 - 0.2) / 0.05) * 0.1;
        const k = (f.fbm(u, v, 3, 2, seed) - 0.5) * 0.14 + streak;
        f.put(s, x, y, [Math.min(255, glass[0] * (1 + k)), Math.min(255, glass[1] * (1 + k)), Math.min(255, glass[2] * (1 + k))], 0.5);
    });
});

DECOR_GLASS.forEach(([color, filter]) => {
    const label = FURNITURE_COLORS.find(([id]) => id === color)[1];
    const faces = { top: { pattern: 'stained_glass', tint: filter }, side: { pattern: 'stained_glass', tint: filter } };
    registerBlockType(`${color}_stained_glass`, {
        color: filter, name: `${label} Stained Glass`, transparent: true, filterGlass: true, breakDuration: 0.22, faces
    });
    registerBlockType(`${color}_stained_glass_pane`, {
        color: filter, name: `${label} Stained Glass Pane`, shape: 'pane', transparent: true, filterGlass: true, breakDuration: 0.2,
        faces, materialKey: `${color}_stained_glass`
    });
});

// ---------------------------------------------------------------------------------------
// Carpets and curtains

furnShape('carpet', {
    facing: false,
    boxes: [[0, 0, 0, 16, 1, 16]]
});

// A curtain hangs at the back of its cell, pleated. Right click draws it to one side and back.
registerBlockShape('curtain', {
    states: [['facing', SHAPE_FACINGS], ['drawn', ['closed', 'open']]],
    boxes(state) {
        const boxes = state.drawn === 'open'
            ? [[0, 0, 12.5, 2, 16, 15.5], [2, 0, 13.5, 4, 16, 16]]
            : [[0, 0, 14, 4, 16, 15], [4, 0, 15, 8, 16, 16], [8, 0, 14, 12, 16, 15], [12, 0, 15, 16, 16, 16]];
        return rotateShapeBoxes(furnBoxes(boxes), state.facing);
    },
    // Against a wall it hangs from that wall; otherwise it looks at the player.
    place(ctx) {
        const wall = Math.abs(ctx.normal.y) < 0.5;
        return [{ dx: 0, dy: 0, dz: 0, state: { facing: wall ? shapeFacingFromVector(ctx.normal.x, ctx.normal.z) : furnFacePlayer(ctx), drawn: 'closed' } }];
    },
    toggle: (state) => ({ ...state, drawn: state.drawn === 'open' ? 'closed' : 'open' }),
    iconState: { facing: 's', drawn: 'closed' }
});

FURNITURE_COLORS.forEach(([color, label, hex]) => {
    const wool = { textureOf: `${color}_wool`, materialKey: `${color}_wool`, category: 'wool', lightPasses: true };
    registerBlockType(`${color}_carpet`, { color: hex, name: `${label} Carpet`, shape: 'carpet', breakDuration: 0.12, ...wool });
    registerBlockType(`${color}_curtain`, { color: hex, name: `${label} Curtain`, shape: 'curtain', breakDuration: 0.15, solid: false, ...wool });
});

// ---------------------------------------------------------------------------------------
// Paintings

// Six small landscapes and shapes, each a function of (u, v) in the area inside the frame.
// Returns a colour. Written for this game; `noise` is the factory's tiling noise.
const DECOR_PAINTINGS = [
    ['painting_sunset', 'Sunset over the Bay', 0xe8804a, (f, u, v, n) => {
        if (v > 0.62) return f.mix(f.rgb(0x20506e), f.rgb(0x10283a), (v - 0.62) * 2.6 + n * 0.2);
        if (Math.hypot(u - 0.62, v - 0.52) < 0.13) return f.rgb(0xffe08a);
        if (v > 0.52 && u < 0.34 - (v - 0.52) * -1.2) return f.rgb(0x3a2c36);
        return f.mix(f.rgb(0xf6c05a), f.rgb(0xc8486a), 1 - v / 0.62 + n * 0.15);
    }],
    ['painting_peaks', 'Three Peaks', 0x7fa8c8, (f, u, v, n) => {
        const peak = (cx, h, w) => 1 - h + Math.abs(u - cx) * w;
        const ridge = Math.min(peak(0.26, 0.56, 1.5), peak(0.58, 0.72, 1.7), peak(0.86, 0.48, 1.4));
        if (v > 0.82) return f.mix(f.rgb(0x4e8a3e), f.rgb(0x3a6a30), n);
        if (v > ridge) return v < ridge + 0.09 ? f.rgb(0xf2f4f6) : f.mix(f.rgb(0x6c7480), f.rgb(0x4e5660), n);
        return f.mix(f.rgb(0xbfe0f4), f.rgb(0x6aa8dc), 1 - v + n * 0.1);
    }],
    ['painting_meadow', 'The Red Meadow', 0x6aa04a, (f, u, v, n) => {
        if (v < 0.42) return f.mix(f.rgb(0xd8ecf6), f.rgb(0x88c0e8), 1 - v * 2 + n * 0.2);
        const flower = f.hash(Math.floor(u * 14), Math.floor(v * 14), 11) > 0.84;
        if (flower && v > 0.5) return f.rgb(0xd8382e);
        return f.mix(f.rgb(0x7cb84e), f.rgb(0x4e8a36), (v - 0.42) * 1.5 + n * 0.25);
    }],
    ['painting_night', 'Night of Many Stars', 0x1c2a58, (f, u, v, n) => {
        if (v > 0.8) return f.rgb(0x10141c);
        const moon = Math.hypot(u - 0.74, v - 0.24);
        if (moon < 0.1 && Math.hypot(u - 0.7, v - 0.22) > 0.08) return f.rgb(0xf4e6a0);
        if (f.hash(Math.floor(u * 22), Math.floor(v * 22), 5) > 0.93) return f.rgb(0xf4f0d8);
        const swirl = Math.sin(u * 14 + Math.sin(v * 9) * 2.2 + n * 3) * 0.5 + 0.5;
        return f.mix(f.rgb(0x162052), f.rgb(0x2e4c96), swirl * (1 - v * 0.7));
    }],
    ['painting_shapes', 'Red, Blue, Yellow', 0xd8b83a, (f, u, v) => {
        if (Math.abs(u - 0.38) < 0.022 || Math.abs(v - 0.62) < 0.022 || (u > 0.38 && Math.abs(u - 0.74) < 0.022 && v > 0.62)) return f.rgb(0x16161a);
        if (u < 0.38 && v < 0.62) return f.rgb(0xc8362a);
        if (u >= 0.38 && v >= 0.62 && u > 0.74) return f.rgb(0xe8c834);
        if (u < 0.38) return f.rgb(0x2a50a8);
        return f.rgb(0xeee9dc);
    }],
    ['painting_fish', 'The Orange Fish', 0x3a9ab0, (f, u, v, n) => {
        const dx = (u - 0.5) / 0.3;
        const dy = (v - 0.5) / 0.16;
        if (dx * dx + dy * dy < 1) {
            if (Math.hypot(u - 0.66, v - 0.46) < 0.028) return f.rgb(0x16161a);
            return Math.sin(u * 34) > 0.4 ? f.rgb(0xf6efe0) : f.rgb(0xf0802e);
        }
        if (u < 0.28 && Math.abs(v - 0.5) < (0.28 - u) * 0.9) return f.rgb(0xf0802e);
        const bubble = f.hash(Math.floor(u * 10), Math.floor(v * 10), 3) > 0.92 && u > 0.72;
        return bubble ? f.rgb(0xc8ecf4) : f.mix(f.rgb(0x46b4c8), f.rgb(0x1c6a88), v + n * 0.2);
    }]
];

// Inside a wooden frame.
function decorPaintFramed(f, s, seed, paint) {
    const wood = f.rgb(0x5a3e22);
    const px = 1 / 16;
    f.each(s, (x, y, u, v) => {
        const edge = Math.min(u, 1 - u, v, 1 - v);
        if (edge < px * 1.2) {
            f.put(s, x, y, f.tone(s, wood, edge < px * 0.6 ? 0.2 : -0.1), 0.85);
            return;
        }
        const n = f.fbm(u, v, 4, 2, seed);
        const c = paint(f, (u - px) / (1 - 2 * px), (v - px) / (1 - 2 * px), n);
        // Brush strokes.
        const k = (f.stretchedNoise(u, v, 18, 3, seed) - 0.5) * 0.14;
        f.put(s, x, y, [c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k)], 0.5 + k);
    });
}

furnShape('painting', {
    boxes: [[0, 0, 15, 16, 16, 16]],
    place: furnPlaceOnWall
});

registerTexturePattern('painting_back', (f, s, tint, seed) => {
    const wood = f.rgb(0x5a3e22);
    f.each(s, (x, y, u, v) => f.put(s, x, y, furnWood(f, s, wood, u, v, seed), 0.5));
});

DECOR_PAINTINGS.forEach(([id, name, color, paint]) => {
    registerTexturePattern(id, (f, s, tint, seed) => decorPaintFramed(f, s, seed, paint));
    furnBlock(id, {
        color, name: `Painting: ${name}`, shape: 'painting', breakDuration: 0.2, category: 'wood', solid: false,
        faces: { top: 'painting_back', side: 'painting_back', front: { pattern: id, minSize: 32 } }
    });
});

// ---------------------------------------------------------------------------------------
// The wall clock

const DECOR_CLOCK_SPEC = { pattern: 'wall_clock', minSize: 32 };

// Hours since midnight: timeOfDay 0 is dawn, 06:00 (js/game/environment.js).
function decorClockHours(timeOfDay) {
    return (((timeOfDay * 24 + 6) % 24) + 24) % 24;
}

// Angles of the hands, clockwise from 12, in radians.
function decorClockAngles(timeOfDay) {
    const hours = decorClockHours(timeOfDay);
    return { hour: ((hours % 12) / 12) * Math.PI * 2, minute: ((hours % 1)) * Math.PI * 2 };
}

function decorClockText(timeOfDay) {
    const hours = decorClockHours(timeOfDay);
    const hh = Math.floor(hours);
    const mm = Math.floor((hours - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// The dial: cream, twelve marks, a wooden rim; the hands are drawn on it afterwards.
registerTexturePattern('wall_clock', (f, s, tint, seed) => {
    const wood = f.rgb(0x5a3e22);
    const dial = f.rgb(0xf0e8d4);
    const mark = f.rgb(0x2a2a2e);
    f.each(s, (x, y, u, v) => {
        const dx = u - 0.5;
        const dy = v - 0.5;
        const r = Math.hypot(dx, dy);
        if (r > 0.34) {
            f.put(s, x, y, furnWood(f, s, wood, u, v, seed), 0.8);
            return;
        }
        const angle = Math.atan2(dx, -dy) / (Math.PI * 2) * 12;
        const onMark = r > 0.26 && r < 0.32 && Math.abs(angle - Math.round(angle)) < 0.2;
        f.put(s, x, y, onMark ? mark : f.tone(s, dial, (f.hash(x, y, seed) - 0.5) * 0.04), onMark ? 0.3 : 0.5);
    });
});

function decorDrawHand(ctx, size, angle, length, width, color) {
    const cx = size / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cx);
    ctx.lineTo(cx + Math.sin(angle) * length * size, cx - Math.cos(angle) * length * size);
    ctx.stroke();
}

furnShape('wall_clock', {
    boxes: [[2, 2, 15, 14, 14, 16]],
    place: furnPlaceOnWall,
    iconFit: true
});

furnBlock('wall_clock', {
    color: 0xf0e8d4, name: 'Wall Clock', shape: 'wall_clock', breakDuration: 0.25, category: 'wood', solid: false,
    faces: { top: 'painting_back', side: 'painting_back', front: DECOR_CLOCK_SPEC }
});

Object.assign(Game.prototype, {
    // Redraws the hands on the one texture all clocks show, if any clock has used it yet.
    decorUpdateClock(delta) {
        this.decorClockWait = (this.decorClockWait || 0) - delta;
        if (this.decorClockWait > 0 || !this.world) return;
        this.decorClockWait = 1;
        const world = this.world;
        const texture = world.textures.get(`${world.rtxModeEnabled ? 'rtx' : 'base'}:albedo:wall_clock:null:`);
        if (!texture || !texture.image) return;
        const canvas = texture.image;
        // The clean dial, kept the first time this canvas (one per graphics mode) is drawn on.
        if (!canvas.decorClean) {
            canvas.decorClean = document.createElement('canvas');
            canvas.decorClean.width = canvas.width;
            canvas.decorClean.height = canvas.height;
            canvas.decorClean.getContext('2d').drawImage(canvas, 0, 0);
        }
        const ctx = canvas.getContext('2d');
        ctx.drawImage(canvas.decorClean, 0, 0);
        const { hour, minute } = decorClockAngles(this.timeOfDay);
        decorDrawHand(ctx, canvas.width, hour, 0.16, Math.max(1.5, canvas.width * 0.05), '#1c1c20');
        decorDrawHand(ctx, canvas.width, minute, 0.25, Math.max(1, canvas.width * 0.03), '#1c1c20');
        texture.needsUpdate = true;
    }
});

registerFrameUpdate(function (delta) {
    this.decorUpdateClock(delta);
});

// ---------------------------------------------------------------------------------------
// Flower pot and vase

furnShape('flower_pot', {
    facing: false,
    boxes: [[5, 0, 5, 11, 6, 11], [7, 6, 7, 9, 10, 9], [5, 9, 7, 11, 11, 9], [7, 9, 5, 9, 11, 11], [6, 11, 6, 10, 14, 10]],
    collision: [[5, 0, 5, 11, 6, 11]],
    iconFit: true
});
registerTexturePattern('flower_pot_side', (f, s, tint, seed) => furnPaintBands(f, s, seed, [[0, 0xb0603a], [6, 0x4e8f36], [11, 0xd8382e]]));
registerTexturePattern('flower_pot_top', (f, s, tint, seed) => {
    f.each(s, (x, y, u, v) => {
        const r = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5));
        const c = r < 0.08 ? 0xe8c840 : r < 0.126 ? 0xd8382e : r < 0.15 ? 0x4e8f36 : 0xb0603a;
        f.put(s, x, y, f.tone(s, f.rgb(c), (f.hash(x, y, seed) - 0.5) * 0.1), 0.5);
    });
});

furnShape('vase', {
    facing: false,
    boxes: [[6, 0, 6, 10, 1, 10], [5, 1, 5, 11, 6, 11], [6, 6, 6, 10, 8, 10], [7, 8, 7, 9, 10, 9], [6, 10, 6, 10, 11, 10]],
    collision: [[5, 0, 5, 11, 11, 11]],
    iconFit: true
});
registerTexturePattern('vase_side', (f, s, tint, seed) => {
    const blue = f.rgb(0x2f5fb0);
    const white = f.rgb(0xeef0f2);
    f.each(s, (x, y, u, v) => {
        const height = (1 - v) * 16;
        const pattern = height > 2.5 && height < 5 && Math.sin(u * 40 + height * 1.5) > 0.2;
        const stripe = Math.abs(height - 6) < 0.5 || height > 10;
        f.put(s, x, y, f.tone(s, pattern || stripe ? white : blue, (f.hash(x, y, seed) - 0.5) * 0.06), 0.6);
    });
}, { rtx: { roughness: 0.25, metalness: 0, normalScale: 0.2 } });

furnBlock('flower_pot', {
    color: 0xB0603A, name: 'Flower Pot', shape: 'flower_pot', breakDuration: 0.15,
    faces: { top: 'flower_pot_top', side: 'flower_pot_side', bottom: 'flower_pot_side' }
});
furnBlock('vase', {
    color: 0x2F5FB0, name: 'Vase', shape: 'vase', breakDuration: 0.15,
    faces: { top: 'vase_side', side: 'vase_side' }
});

// ---------------------------------------------------------------------------------------
// Recipes

registerGameContent(function ({ addRecipe }) {
    DECOR_GLASS.forEach(([color, , elements]) => {
        const label = FURNITURE_COLORS.find(([id]) => id === color)[1];
        addRecipe(`${color}_stained_glass`, `Stain ${label} Glass`, `${color}_stained_glass`, 4,
            [{ type: 'glass', amount: 4 }, ...elements.map((symbol) => ({ type: `element_${symbol}`, amount: 1 }))]);
        addRecipe(`${color}_stained_glass_pane`, `Cut ${label} Stained Glass Panes`, `${color}_stained_glass_pane`, 8, [{ type: `${color}_stained_glass`, amount: 3 }]);
    });
    FURNITURE_COLORS.forEach(([color, label]) => {
        addRecipe(`${color}_carpet`, `Weave ${label} Carpet`, `${color}_carpet`, 3, [{ type: `${color}_wool`, amount: 2 }]);
        addRecipe(`${color}_curtain`, `Sew ${label} Curtains`, `${color}_curtain`, 2, [{ type: `${color}_wool`, amount: 3 }]);
    });
    const dyes = { painting_sunset: 'flower_red', painting_peaks: 'cobalt_glass', painting_meadow: 'flower_red', painting_night: 'coal_ore', painting_shapes: 'flower_yellow', painting_fish: 'flower_yellow' };
    DECOR_PAINTINGS.forEach(([id, name]) => {
        addRecipe(id, `Paint ${name}`, id, 1, [{ type: 'planks', amount: 1 }, { type: 'white_wool', amount: 1 }, { type: dyes[id], amount: 1 }]);
    });
    addRecipe('wall_clock', 'Build Wall Clock', 'wall_clock', 1, [{ type: 'planks', amount: 2 }, { type: 'copper_block', amount: 1 }, { type: 'iron_ore', amount: 1 }]);
    addRecipe('flower_pot', 'Plant a Flower Pot', 'flower_pot', 1, [{ type: 'brick', amount: 2 }, { type: 'dirt', amount: 1 }, { type: 'flower_red', amount: 1 }]);
    addRecipe('vase', 'Shape a Vase', 'vase', 1, [{ type: 'brick', amount: 2 }, { type: 'sand', amount: 1 }, { type: 'element_co', amount: 1 }]);
});
