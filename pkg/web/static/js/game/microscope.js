// The microscope, and the test tubes, slides and pipette that go with it. What lives on a slide is
// js/game/microbes.js; what a sample holds and what lies on each slide are decided on the SERVER
// (pkg/network/microscope.go), which also keeps the slide, shared by everyone looking at that block.
// - A test tube used on water or moss takes a sample and leaves the block where it is. The server says
//   what it became: the place fixes what it holds, so the same spot always gives the same.
// - A right click on a microscope opens its panel (crouch to build against it). A slide goes on the
//   stage with a sample, one of several other items, or a smear of your cheek; the empty tube comes back
//   and the slide comes back washed when it is taken off.
// - The field is drawn on a 2D canvas: drag moves the stage, the nosepiece (or a pinch) changes the
//   power, the slider (or the wheel) the focus. It needs light, as a real one does: the sun by day on a
//   block in the open, or anything that gives light right beside it (microscopeReadLight). Without
//   light the field is black and the panel says why.
// - A click on an organism identifies it (microscopeIdentified, the one call that says so, and the only
//   way into its card in the bestiary). With a
//   micropipette and an empty tube a tardigrade can be drawn off into the tube.
// - Left alone a slide dries in a game day. Only the tardigrades come through that, as tuns; a drop of
//   water from a flask brings them back in about 20 s. The freezer turns a tube into a tun too
//   (appliances.go), and a C recipe with a flask brings it back.
// - Items move in two steps, like a chest's (js/game/storage.js): out of the inventory first, and what
//   the answer says comes back. `microscopePending` survives a reload, and storageSync settles it.
// Mixed into Game.prototype; hooked through js/extensions.js.

const MICROSCOPE_PENDING_KEY = 'minecloud-microscope-pending';
const MICROSCOPE_KNOWN_KEY = 'minecloud-microscope-known';
// Blocks away at which an open panel closes (the server allows 9).
const MICROSCOPE_CLOSE_DISTANCE = 7;
// How often the light is looked at, and how often at the most the field is redrawn (seconds).
const MICROSCOPE_LIGHT_EVERY = 0.5;
const MICROSCOPE_FRAME = 1 / 30;
// How far a lamp can stand and still light the mirror, and how far a window can be.
const MICROSCOPE_LAMP_REACH = 2;
const MICROSCOPE_SKY_REACH = 2;
// What can light the mirror, once it has power. Off, its name has no ":on".
const MICROSCOPE_ELECTRIC_LIGHTS = ['light_bulb', 'electric_lamp'];
// The sun is too low to use below this much daylight.
const MICROSCOPE_MIN_DAYLIGHT = 0.3;

// A kit for testing: /microkit, only in creative mode, like /give.
const MICROSCOPE_KIT = [
    ['microscope', 1], ['test_tube', 12], ['glass_slide', 12], ['micropipette', 1], ['water_flask', 6], ['lantern', 2], ['candle', 4], ['moss', 8],
    ['sample_forest_lake_b', 2], ['sample_forest_lake_c', 2], ['sample_mountain_lake_d', 2], ['sample_plains_lake_a', 2], ['sample_plains_lake_b', 2], ['sample_oasis_a', 2],
    ['sample_moss_a', 2], ['sample_still_water', 2], ['tardigrade_tube', 2], ['tardigrade_tun', 2],
    ['dirt', 4], ['flower_red', 4], ['milk', 2], ['leaves', 4], ['mushroom_red', 2], ['raw_fish', 2], ['white_wool', 2], ['honeycomb', 2]
];

// The page of the microscope in the guide; the organisms carry their own (MICRO_SPECIES.page).
const MICROSCOPE_GUIDE_PAGE = 238;

// ---------------------------------------------------------------------------------------
// Pure helpers (also used by test/js/microscope.test.js)

// What an answer means for the inventory: the items to add, by type. `pending` holds what was taken out
// (given back on a refusal) and what a success gives; `result` stands for the item the server names.
function microscopeSettle(pending, outcome) {
    const done = Boolean(outcome && outcome.amount > 0);
    const items = {};
    for (const [type, count] of Object.entries(done ? pending.gives : pending.took)) {
        const real = type === 'result' ? outcome.type : type;
        if (real) items[real] = (items[real] || 0) + count;
    }
    return items;
}

// What each request takes out of the inventory and gives on success.
function microscopeRequestItems(op, source) {
    switch (op) {
        case 'sample': return { took: { test_tube: 1 }, gives: { result: 1 } };
        case 'prepare': {
            const took = { glass_slide: 1 };
            if (source !== 'cheek') took[source] = 1;
            // A tube comes back empty, and so does the bottle of the milk.
            const gives = microSourceInTube(source) ? { test_tube: 1 } : source === 'milk' ? { glass: 1 } : {};
            return { took, gives };
        }
        case 'clear': return { took: {}, gives: { glass_slide: 1 } };
        case 'drop': return { took: { water_flask: 1 }, gives: { glass: 1 } };
        case 'capture': return { took: { test_tube: 1 }, gives: { result: 1 } };
        default: return { took: {}, gives: {} };
    }
}

// What lights the mirror, from what was read about the place: daylight (0..1), whether the block is in
// the open, and the brightest lamp near it ({ level, name } or null). `level` is how bright the field
// is, from 0 (black) to 1.
function microscopeLightFrom(daylight, open, lamp) {
    const sun = open && daylight >= MICROSCOPE_MIN_DAYLIGHT ? 0.5 + daylight * 0.5 : 0;
    const candle = lamp ? 0.45 + (lamp.level / 14) * 0.5 : 0;
    if (sun <= 0 && candle <= 0) return { source: null, level: 0, name: '' };
    if (sun >= candle) return { source: 'sun', level: sun, name: 'daylight' };
    return { source: 'lamp', level: candle, name: lamp.name };
}

// Whether a block's cell lets the sun down onto (x, y, z): `blocks(x, y, z)` says what stops light. Open
// above it, or with an open column within reach and nothing in the way, as by a window.
function microscopeOpenToSky(blocks, top, x, y, z) {
    const clearAbove = (cx, cz) => {
        for (let cy = y + 1; cy <= top; cy++) {
            if (blocks(cx, cy, cz)) return false;
        }
        return true;
    };
    if (clearAbove(x, z)) return true;
    for (let dz = -MICROSCOPE_SKY_REACH; dz <= MICROSCOPE_SKY_REACH; dz++) {
        for (let dx = -MICROSCOPE_SKY_REACH; dx <= MICROSCOPE_SKY_REACH; dx++) {
            if ((!dx && !dz) || !clearAbove(x + dx, z + dz)) continue;
            const steps = Math.max(Math.abs(dx), Math.abs(dz));
            let clear = true;
            for (let i = 1; i <= steps && clear; i++) {
                clear = !blocks(x + Math.round((dx * i) / steps), y, z + Math.round((dz * i) / steps));
            }
            if (clear) return true;
        }
    }
    return false;
}

// What the panel says of a black field: `unlit` is the name of a lamp within reach that is off, if any.
function microscopeDarkLine(unlit) {
    if (unlit) return `The ${String(unlit).toLowerCase()} beside it has no power: it needs a generator or a battery touching it, or a wire to one.`;
    return 'Too dark to see anything. A microscope needs light: put it in the sun by day, or set a lamp, a candle or a lantern right beside it.';
}

// Whether this block name is an electric light that is off now.
function microscopeIsUnlitLamp(type) {
    return MICROSCOPE_ELECTRIC_LIGHTS.includes(type);
}

// Moving the stage: it stays on the slide.
function microscopeClampStage(x, y) {
    const distance = Math.hypot(x, y);
    if (distance <= MICRO_SLIDE_RADIUS) return [x, y];
    return [(x / distance) * MICRO_SLIDE_RADIUS, (y / distance) * MICRO_SLIDE_RADIUS];
}

// The next power up (+1) or down (-1), staying on the nosepiece.
function microscopeStepPower(power, direction) {
    const index = MICRO_MAGNIFICATIONS.indexOf(power);
    return MICRO_MAGNIFICATIONS[Math.max(0, Math.min(MICRO_MAGNIFICATIONS.length - 1, index + direction))];
}

// Pixels per micrometre for a field of this radius.
function microscopeScale(power, radius) {
    return MICRO_SCALE[power] * (radius / 300);
}

// A scale bar: a round number of micrometres about a fifth of the field across.
function microscopeScaleBar(scale, radius) {
    const wanted = (radius * 0.4) / scale;
    const choices = [10, 20, 50, 100, 200, 500, 1000, 2000];
    const microns = choices.reduce((best, value) => (Math.abs(value - wanted) < Math.abs(best - wanted) ? value : best), choices[0]);
    return { microns, pixels: microns * scale, label: microns >= 1000 ? `${microns / 1000} mm` : `${microns} µm` };
}

// The organism under a point of the field, or null. Looks at the nearest in focus first.
function microscopePick(organisms, view, px, py) {
    let best = null;
    let bestScore = Infinity;
    for (const org of organisms) {
        const def = MICRO_SPECIES[org.species];
        const x = view.radius + (org.x - view.stageX) * view.scale;
        const y = view.radius + (org.y - view.stageY) * view.scale;
        const size = def.drawn * org.scale * view.scale;
        const distance = Math.hypot(px - x, py - y);
        if (distance > Math.max(size * 0.55, 15)) continue;
        const score = distance / Math.max(size, 15) + microBlur(org.depth, view.focus, view.power);
        if (score < bestScore) {
            bestScore = score;
            best = org;
        }
    }
    return best;
}

// A line about how a slide is doing.
function microscopeSlideLine(prep, age, woke = -1) {
    if (!prep) return '';
    const stage = microSlideStage(age, woke);
    if (stage === 'dry') return 'The slide has dried out. Add a drop of water: see who comes back.';
    if (stage === 'reviving') return `A drop of water: the tun is opening up (${Math.ceil(MICRO_REVIVE_SECONDS - woke)} s).`;
    if (stage === 'drying') return `The slide is drying out (${Math.ceil(MICRO_DRY_SECONDS - age)} s). Tardigrades curl up; the rest stop moving.`;
    return prep.revived ? `Wet again. Only tardigrades came through it. It dries in ${Math.ceil((MICRO_DRY_SECONDS - age) / 10) * 10} s.` : `Fresh. It dries in about ${Math.ceil((MICRO_DRY_SECONDS - age) / 10) * 10} s.`;
}

// What a tardigrade is doing, in words.
function microscopeTardigradeLine(org) {
    switch (org.action) {
        case 'eating': return 'It is piercing a green cell with its stylets, and its gut is turning green.';
        case 'molting': return 'It is shedding its skin, and leaving its eggs inside the old one.';
        case 'tun': return 'A tun: dried up, legs pulled in, its life all but stopped. This is cryptobiosis.';
        case 'folding': return 'It is pulling in its legs and curling up.';
        default: return 'It lumbers along on eight clawed legs.';
    }
}

// ---------------------------------------------------------------------------------------
// The field (a canvas context, and two smaller canvases for what is out of focus)

// Draws what is on the slide. view: radius, power, scale, stageX, stageY, focus, light, t, age, revived,
// selected. `soft` holds { ctx, canvas } at a third and `softer` at a sixth of the size.
function microscopeDrawField(ctx, soft, softer, view, organisms, scenery) {
    const { radius, scale, stageX, stageY, focus, power, light, t } = view;
    const size = radius * 2;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.clip();
    if (!light || light.level <= 0) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, size, size);
        ctx.restore();
        return;
    }
    // The bright, pale field of a lit microscope.
    const ground = ctx.createRadialGradient(radius, radius, radius * 0.1, radius, radius, radius);
    ground.addColorStop(0, '#f6f6e6');
    ground.addColorStop(0.75, '#e6e8d0');
    ground.addColorStop(1, '#bfc2a4');
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, size, size);

    // Sorted by how far out of focus: the blurred ones are painted small and stretched.
    const layers = [[], [], []];
    const place = (draw, depth) => {
        const blur = microBlur(depth, focus, power);
        layers[blur < 1 ? 2 : blur < 2 ? 1 : 0].push(draw);
    };
    for (const item of scenery) {
        const x = radius + (item.x - stageX) * scale;
        const y = radius + (item.y - stageY) * scale;
        if (Math.hypot(x - radius, y - radius) > radius + 700 * scale) continue;
        place((c) => microDrawSceneryItem(c, item, x, y, scale), item.depth);
    }
    for (const org of organisms) {
        const def = MICRO_SPECIES[org.species];
        const px = def.drawn * org.scale * scale;
        for (const molt of org.molts || []) {
            const mx = radius + (molt.x - stageX) * scale;
            const my = radius + (molt.y - stageY) * scale;
            place((c) => {
                c.save();
                c.translate(mx, my);
                c.rotate(molt.rot);
                c.scale(px / 100, px / 100);
                microDrawTardigradeMolt(c, t, { seed: molt.seed });
                c.restore();
            }, org.depth);
        }
        const x = radius + (org.x - stageX) * scale;
        const y = radius + (org.y - stageY) * scale;
        if (Math.hypot(x - radius, y - radius) > radius + px) continue;
        const fate = microFate(org.species, view.age, view.revived);
        const st = { seed: org.seed, variant: org.variant, fate, spring: org.spring, phase: org.phase };
        if (org.species === 'tardigrade') {
            Object.assign(st, { unfold: org.unfold ?? 1, gut: org.gut, stylet: org.stylet, still: (org.unfold ?? 1) < 0.1 });
        } else if (fate !== 'alive' || view.age >= MICRO_DRY_SECONDS) {
            st.still = true;
        }
        place((c) => microDrawOrganism(c, org.species, x, y, px, org.rot, t + org.phase, st), org.depth);
    }
    const paintSoft = (layer, buffer, factor, alpha) => {
        if (layer.length === 0 || !buffer) return;
        buffer.ctx.clearRect(0, 0, buffer.canvas.width, buffer.canvas.height);
        buffer.ctx.save();
        buffer.ctx.scale(1 / factor, 1 / factor);
        for (const draw of layer) draw(buffer.ctx);
        buffer.ctx.restore();
        ctx.globalAlpha = alpha;
        ctx.drawImage(buffer.canvas, 0, 0, size, size);
        ctx.globalAlpha = 1;
    };
    paintSoft(layers[0], softer, 6, 0.55);
    paintSoft(layers[1], soft, 3, 0.85);
    for (const draw of layers[2]) draw(ctx);

    const selected = view.selected;
    if (selected) {
        const def = MICRO_SPECIES[selected.species];
        const ring = Math.max(def.drawn * selected.scale * scale * 0.62, 16);
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(radius + (selected.x - stageX) * scale, radius + (selected.y - stageY) * scale, ring, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(30,90,170,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // The colour and strength of the light, and the dark edge of the lens.
    if (light.source === 'lamp') {
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = '#ffd9a0';
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = 'source-over';
    }
    if (light.level < 1) {
        ctx.fillStyle = `rgba(0,0,0,${1 - light.level})`;
        ctx.fillRect(0, 0, size, size);
    }
    const edge = ctx.createRadialGradient(radius, radius, radius * 0.78, radius, radius, radius);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, size, size);

    const bar = microscopeScaleBar(scale, radius);
    const barX = radius - bar.pixels / 2;
    const barY = size - radius * 0.14;
    ctx.fillStyle = 'rgba(16,18,14,0.82)';
    ctx.fillRect(barX, barY, bar.pixels, 3);
    ctx.font = `${Math.round(Math.max(11, radius * 0.045))}px Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(bar.label, radius, barY - 5);
    ctx.restore();
}

// ---------------------------------------------------------------------------------------
// Items

const MICROSCOPE_TUBE = [
    '....cccc....',
    '....gggg....',
    '....g..g....',
    '....g..g....',
    '....g..g....',
    '....gLLg....',
    '....gHLg....',
    '....gLLg....',
    '....gLLg....',
    '....gLLg....',
    '.....gg.....',
    '............'
];
const MICROSCOPE_TUBE_ANIMAL = [
    '....cccc....',
    '....gggg....',
    '....g..g....',
    '....g..g....',
    '....gLLg....',
    '....gBLg....',
    '...bgBBgb...',
    '....gBBg....',
    '...bgBBgb...',
    '....gLLg....',
    '.....gg.....',
    '............'
];
const MICROSCOPE_TUBE_TUN = [
    '....cccc....',
    '....gggg....',
    '....g..g....',
    '....g..g....',
    '....g..g....',
    '....g..g....',
    '....gBBg....',
    '....gBBg....',
    '....gbBg....',
    '....g..g....',
    '.....gg.....',
    '............'
];
const MICROSCOPE_SLIDE = [
    '............',
    '............',
    '............',
    'GGGGGGGGGGGG',
    'GWWLLLLLLLLG',
    'GWWLLLHLLLLG',
    'GWWLLLLHLLLG',
    'GWWLLLLLLLLG',
    'GGGGGGGGGGGG',
    '............',
    '............',
    '............'
];
const MICROSCOPE_PIPETTE = [
    '........rr..',
    '.......rrrr.',
    '.......rrrr.',
    '.......grr..',
    '......gLg...',
    '.....gLg....',
    '....gLg.....',
    '...gLg......',
    '...gg.......',
    '..gg........',
    '.g..........',
    '............'
];
const MICROSCOPE_TUBE_COLORS = { c: 0x8a6034, g: 0xcfe9f2 };
const MICROSCOPE_LIQUIDS = {
    forest_lake: { L: 0x7a9a5a, H: 0xa8c488 },
    mountain_lake: { L: 0x8fc4d8, H: 0xc8e6ee },
    plains_lake: { L: 0x8ca878, H: 0xb8cca8 },
    oasis: { L: 0x6ab8a8, H: 0xa8dcd0 },
    moss: { L: 0x4f7f30, H: 0x7fae4e }
};

function microscopeItem(id, name, sprite, palette, color) {
    registerItemType(id, { color, name, drawIcon: resourcesDrawSprite(sprite, { ...MICROSCOPE_TUBE_COLORS, ...palette }), displayMesh: resourcesDisplayMesh });
}

microscopeItem('test_tube', 'Test Tube', MICROSCOPE_TUBE, { L: undefined, H: undefined }, 0xcfe9f2);
microscopeItem('glass_slide', 'Glass Slide', MICROSCOPE_SLIDE, { G: 0x9fc6d4, L: 0xdff2f8, H: 0xffffff, W: 0xf4f4ec }, 0xdff2f8);
microscopeItem('micropipette', 'Micropipette', MICROSCOPE_PIPETTE, { r: 0xb0483c, L: 0xeaf6fb }, 0xb0483c);
microscopeItem('sample_still_water', 'Still Water Sample', MICROSCOPE_TUBE, { L: 0x8fbad8, H: 0xcfe6f2 }, 0x8fbad8);
microscopeItem('tardigrade_tube', 'Tardigrade in a Tube', MICROSCOPE_TUBE_ANIMAL, { L: 0x9cc8d8, B: 0xc8a264, b: 0x7a5c30 }, 0xc8a264);
microscopeItem('tardigrade_tun', 'Tardigrade Tun', MICROSCOPE_TUBE_TUN, { B: 0x9a7a44, b: 0x5e4620 }, 0x9a7a44);

// All the variants of a habitat look alike, and the letter says nothing about what is inside.
for (const [habitat, variants] of Object.entries(MICRO_SAMPLES)) {
    for (const { letter } of variants) {
        microscopeItem(microSampleId(habitat, letter), `${MICRO_HABITAT_NAMES[habitat]} Sample ${letter.toUpperCase()}`, MICROSCOPE_TUBE, MICROSCOPE_LIQUIDS[habitat], MICROSCOPE_LIQUIDS[habitat].L);
    }
}

// ---------------------------------------------------------------------------------------
// Moss

function microscopeMossColor(f, s, u, v, seed) {
    const clump = f.fbm(u, v, 5, 3, seed);
    const fine = f.hash(Math.floor(u * s.size), Math.floor(v * s.size), seed);
    const base = clump > 0.55 ? 0x5f9238 : clump > 0.42 ? 0x4b7f2e : 0x3a6a26;
    return { c: f.tone(s, f.rgb(base), (fine - 0.5) * 0.28), h: 0.45 + clump * 0.5 + (fine - 0.5) * 0.2 };
}

registerTexturePattern('moss_top', (f, s, tint, seed) => {
    f.each(s, (x, y, u, v) => {
        const { c, h } = microscopeMossColor(f, s, u, v, seed);
        f.put(s, x, y, c, h);
    });
}, { rtx: { roughness: 0.95, metalness: 0, normalScale: 0.9 } });

// Moss hanging over the edge of the soil.
registerTexturePattern('moss_side', (f, s, tint, seed) => {
    f.each(s, (x, y, u, v) => {
        const hang = 0.28 + f.fbm(u, 0.5, 6, 2, seed) * 0.32;
        if (v < hang) {
            const { c, h } = microscopeMossColor(f, s, u, v, seed);
            f.put(s, x, y, c, h);
        } else {
            f.put(s, x, y, f.tone(s, f.rgb(0x6f4b2e), (f.fbm(u, v, 5, 3, seed + 7) - 0.5) * 0.35), 0.5);
        }
    });
}, { rtx: { roughness: 0.95, metalness: 0, normalScale: 0.9 } });

registerBlockType('moss', {
    color: 0x4B7F2E, name: 'Moss', breakDuration: 0.35, category: 'soil',
    faces: { top: 'moss_top', side: 'moss_side', bottom: 'dirt' }
});

// ---------------------------------------------------------------------------------------
// The microscope

// A foot, a pillar with its curved arm, the stage with the mirror under it, and the body tube with its
// nosepiece and eyepiece. Written facing north, as the rest of the furniture.
furnShape('microscope', {
    boxes: [
        [4, 0, 3, 12, 1.5, 13], [6.5, 1.5, 10, 9.5, 9, 12], [7, 9, 7.5, 9, 11, 12],
        [4.5, 5.5, 3.5, 11.5, 6.5, 10], [6.5, 2.5, 5, 9.5, 3, 8],
        [6.5, 7.5, 4.5, 9.5, 8.5, 8], [7, 8.5, 5, 9, 14, 7.5], [7.4, 14, 5.4, 8.6, 16, 7]
    ],
    collision: [[4, 0, 3, 12, 16, 13]],
    iconFit: true
});

// By height: the black eyepiece, the brass tube, then black enamel with a brass band on the foot.
registerTexturePattern('microscope_side', (f, s, tint, seed) => {
    f.each(s, (x, y, u, v) => {
        let c;
        let h = 0.7;
        if (v < 0.125) { c = f.tone(s, f.rgb(0x1c1d22), (f.hash(x, y, seed) - 0.5) * 0.08); } else if (v < 0.46) {
            c = f.tone(s, f.rgb(0xc69a48), (Math.sin(u * 18) * 0.12) + (f.hash(x, y, seed) - 0.5) * 0.08);
            h = 0.9;
        } else if (v < 0.54) { c = f.rgb(0x8d969e); h = 1; } else {
            c = f.tone(s, f.rgb(0x2b2d33), (f.hash(x, y, seed) - 0.5) * 0.08);
            if (v > 0.9) c = f.rgb(0x1f2024);
        }
        f.put(s, x, y, c, h);
    });
}, { rtx: { roughness: 0.32, metalness: 0.65, normalScale: 0.3 } });
registerTexturePattern('microscope_top', (f, s, tint, seed) => {
    f.each(s, (x, y, u, v) => {
        const r = Math.hypot(u - 0.5, v - 0.42);
        const c = r < 0.06 ? f.rgb(0xf4f4ec) : r < 0.12 ? f.rgb(0xc69a48) : f.tone(s, f.rgb(0x2b2d33), (f.hash(x, y, seed) - 0.5) * 0.08);
        f.put(s, x, y, c, r < 0.12 ? 0.9 : 0.7);
    });
}, { rtx: { roughness: 0.32, metalness: 0.65, normalScale: 0.3 } });

furnBlock('microscope', {
    color: 0x2B2D33, name: 'Microscope', shape: 'microscope', breakDuration: 0.5, category: 'stone', storageSlots: 1,
    faces: { top: 'microscope_top', side: 'microscope_side', bottom: 'microscope_side' }
});

registerGameContent(({ addItem, addRecipe }) => {
    ['moss', 'test_tube', 'glass_slide', 'micropipette', 'sample_still_water', 'tardigrade_tube', 'tardigrade_tun'].forEach(addItem);
    for (const [habitat, variants] of Object.entries(MICRO_SAMPLES)) {
        for (const { letter } of variants) addItem(microSampleId(habitat, letter));
    }
    addRecipe('microscope', 'Build Microscope', 'microscope', 1, [{ type: 'glass', amount: 2 }, { type: 'copper_block', amount: 1 }, { type: 'iron_ore', amount: 1 }, { type: 'planks', amount: 1 }]);
    addRecipe('test_tube', 'Blow Test Tubes', 'test_tube', 3, [{ type: 'glass', amount: 1 }]);
    addRecipe('glass_slide', 'Cut Glass Slides', 'glass_slide', 4, [{ type: 'glass', amount: 1 }]);
    addRecipe('micropipette', 'Make Micropipette', 'micropipette', 1, [{ type: 'glass', amount: 1 }, { type: 'leather', amount: 1 }]);
    addRecipe('tardigrade_revive', 'Revive Tardigrade Tun', 'tardigrade_tube', 1, [{ type: 'tardigrade_tun', amount: 1 }, { type: 'water_flask', amount: 1 }]);
});

// ---------------------------------------------------------------------------------------
// The panel

const MICROSCOPE_CSS = `
#microscope-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(980px,calc(100vw - 16px));max-height:calc(100% - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom));display:none;flex-direction:column;gap:10px;padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(8,12,20,.95);color:#fff;font-family:'Consolas',monospace;z-index:275;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y}
#microscope-panel.visible{display:flex}
#microscope-panel .micro-head{display:flex;align-items:center;gap:8px}
#microscope-panel h3{font-size:16px;margin:0;flex:1}
#microscope-panel h4{font-size:12px;margin:2px 0;opacity:.75;font-weight:400}
#microscope-panel button{min-width:44px;min-height:40px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:700 13px/1.1 'Consolas',monospace;cursor:pointer;touch-action:manipulation}
#microscope-panel button.active{background:rgba(120,190,255,.4);border-color:rgba(160,210,255,.8)}
#microscope-panel button:disabled{opacity:.4;cursor:default}
.micro-body{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}
.micro-eye{flex:0 1 auto;width:min(520px,100%,calc(100vh - 130px));min-width:220px;margin:0 auto}
#micro-field{display:block;width:100%;aspect-ratio:1;border-radius:50%;background:#000;box-shadow:0 0 0 6px #17191d,0 0 0 8px rgba(255,255,255,.14);touch-action:none;cursor:grab}
#micro-field:active{cursor:grabbing}
.micro-side{flex:1 1 280px;min-width:240px;display:flex;flex-direction:column;gap:9px;font-size:13px}
.micro-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.micro-row button{flex:1}
#micro-focus{flex:1;min-width:120px;height:32px;accent-color:#8fd0f5}
#micro-light{padding:7px 9px;border-radius:8px;background:rgba(255,255,255,.06);line-height:1.35}
#micro-light.off{background:rgba(255,160,60,.16);color:#ffc27a}
#micro-slide-line{line-height:1.35;opacity:.86;min-height:17px}
#micro-info{display:none;gap:9px;padding:9px;border-radius:9px;background:rgba(255,255,255,.06);line-height:1.34}
#micro-info.visible{display:flex}
#micro-portrait{flex:0 0 84px;width:84px;height:84px;border-radius:8px}
#micro-info .micro-name{font-weight:700;font-size:14px}
#micro-info .micro-latin{font-style:italic;opacity:.7;font-weight:400}
#micro-info .micro-meta{opacity:.8;font-size:12px}
#micro-info .micro-fact{margin-top:4px;font-size:12px}
#micro-info button{margin-top:6px;width:100%}
#micro-note{font-size:12px;min-height:15px;color:#ffe9a8;line-height:1.3}
#micro-sources{display:grid;grid-template-columns:repeat(auto-fill,minmax(50px,1fr));gap:5px;max-height:26vh;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y}
.micro-cell{position:relative;aspect-ratio:1;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05) center/72% no-repeat;cursor:pointer;touch-action:manipulation}
.micro-cell:hover{border-color:rgba(255,255,255,.55)}
.micro-cell span{position:absolute;right:3px;bottom:2px;font-size:11px;text-shadow:0 1px 2px #000}
`;

Object.assign(Game.prototype, {
    microscopeLoadPending() {
        this.microscopePending = new Map();
        this.microscopeNextSync = 0;
        try {
            const saved = JSON.parse(window.localStorage.getItem(MICROSCOPE_PENDING_KEY) || '[]');
            for (const entry of saved) {
                if (entry && entry.reqId && entry.took && entry.gives) this.microscopePending.set(entry.reqId, { took: entry.took, gives: entry.gives, op: entry.op, at: 0 });
            }
        } catch (_error) {
            // Nothing readable: nothing to resume.
        }
        this.microscopeMoveKnown();
    },

    microscopeSavePending() {
        try {
            const entries = [...this.microscopePending.entries()].map(([reqId, entry]) => ({ reqId, took: entry.took, gives: entry.gives, op: entry.op }));
            window.localStorage.setItem(MICROSCOPE_PENDING_KEY, JSON.stringify(entries));
        } catch (_error) {
            // Blocked storage: it lasts until the page reloads.
        }
    },

    // The one call that says "this organism has been identified": it goes in the bestiary.
    microscopeIdentified(speciesId) {
        if (MICRO_SPECIES[speciesId] && this.bestiaryInstalled) this.bestiaryEncounter(speciesId);
    },

    // What the first version of this panel kept on its own moves into the bestiary, once.
    microscopeMoveKnown() {
        try {
            const known = JSON.parse(window.localStorage.getItem(MICROSCOPE_KNOWN_KEY) || 'null');
            if (!known || !this.bestiaryInstalled) return;
            for (const id of known) {
                if (MICRO_SPECIES[id] && !this.bestiaryData[id]) this.bestiaryRecord(id).encounters = 1;
            }
            this.bestiarySave();
            window.localStorage.removeItem(MICROSCOPE_KNOWN_KEY);
        } catch (_error) {
            // Nothing readable: nothing to move.
        }
    },

    // ---- Requests ----

    // Sends a request: what it uses leaves the inventory now, and the answer settles the rest.
    microscopeRequest(message, op, payload, source) {
        if (!this.network || !this.network.connected) {
            this.receiveSystemMessage({ text: 'Not connected: the microscope lives on the server' });
            return false;
        }
        const { took, gives } = microscopeRequestItems(op, source);
        for (const [type, count] of Object.entries(took)) {
            if (this.getInventoryCount(type) < count) return false;
        }
        for (const [type, count] of Object.entries(took)) this.inventoryCounts[type] = this.getInventoryCount(type) - count;
        const reqId = this.storageNewRequestId();
        this.microscopePending.set(reqId, { took, gives, op, at: performance.now() });
        this.microscopeSavePending();
        this.microscopeInventoryChanged();
        this.network.send(message, { ...payload, reqId });
        return true;
    },

    microscopeInventoryChanged() {
        this.updateHotbarCounts();
        this.refreshHeldItemMesh();
        this.renderCraftingPanel();
        this.renderInventoryPanel();
        this.saveInventoryState();
        this.microscopeRenderControls();
    },

    // An answer, to any request of this file, whichever message brought it. Anything else (a chest's) is
    // not ours and is left alone.
    microscopeOnOutcome(outcome) {
        const pending = outcome && this.microscopePending.get(outcome.reqId);
        if (!pending) return;
        this.microscopePending.delete(outcome.reqId);
        this.microscopeSavePending();
        const items = microscopeSettle(pending, outcome);
        for (const [type, count] of Object.entries(items)) {
            if (count > 0 && this.world.blockTypes[type]) this.addInventory(type, count);
        }
        this.microscopeInventoryChanged();
        if (outcome.amount > 0) {
            this.playPickupSound();
            if (pending.op === 'sample') this.receiveSystemMessage({ text: `You took a ${this.getBlockDisplayName(outcome.type)}` });
        } else if (pending.op === 'sample') {
            this.receiveSystemMessage({ text: outcome.reason === 'too far' ? 'That is too far away' : 'A sample needs water or moss' });
        } else {
            this.microscopeNote = outcome.reason === 'occupied' ? 'There is already a slide on the stage' : outcome.reason === 'none left' ? 'There is none left on this slide' : '';
            this.microscopeRenderLines();
        }
    },

    // ---- Taking samples ----

    microscopeTakeSample(hit) {
        const water = this.bucketFindWater();
        let at = water;
        if (!at && hit) {
            const position = this.world.getBlockPositionFromIntersection(hit);
            if (position && this.world.getBlockTypeAt(position.x, position.y, position.z) === 'moss') at = position;
        }
        if (!at) {
            this.receiveSystemMessage({ text: 'Aim at water or moss to take a sample' });
            return true;
        }
        if (!this.microscopeRequest('sampleTake', 'sample', { x: at.x, y: at.y, z: at.z })) return true;
        if (water) this.bucketAfterUse(at.x, at.y, at.z);
        else {
            this.playPlaceSound('moss');
            this.placeActionTimer = 0.35;
            this.showHitIndicator();
        }
        return true;
    },

    // ---- Opening and closing ----

    microscopeTryOpen(position) {
        const type = this.world.getBlockTypeAt(position.x, position.y, position.z);
        if (!type || storageBaseName(type) !== 'microscope') return false;
        if (!this.network || !this.network.connected) {
            this.receiveSystemMessage({ text: 'Not connected: the microscope lives on the server' });
            return true;
        }
        this.microscopeBuildPanel();
        this.microscopeAt = { x: position.x, y: position.y, z: position.z };
        this.microscopeContents = null;
        this.microscopeRev = -1;
        this.microscopePrep = null;
        this.microscopeOrganisms = [];
        this.microscopeScenery = [];
        this.microscopeSelected = null;
        this.microscopeNote = '';
        this.microscopePower = this.microscopePower || 40;
        this.microscopeFocus = this.microscopeFocus ?? 0.5;
        this.microscopeStage = [0, 0];
        this.microscopeLightTimer = 0;
        this.microscopeOpenedAt = performance.now();
        this.stopMining();
        // Losing the pointer lock would otherwise open the pause menu.
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.microscopePanel.classList.add('visible');
        this.microscopeResizeField();
        this.network.send('storageOpen', { ...this.microscopeAt });
        this.microscopeReadLight();
        this.microscopeRenderControls();
        this.updatePointerLockHint();
        return true;
    },

    microscopeClose() {
        if (!this.microscopeAt) return;
        this.microscopeAt = null;
        this.microscopeContents = null;
        this.microscopePanel.classList.remove('visible');
        if (this.network && this.network.connected) this.network.send('storageClose', {});
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        this.recapturePointerLock();
        this.updatePointerLockHint();
    },

    // ---- Messages from the server ----

    microscopeOnContents(contents) {
        const at = this.microscopeAt;
        if (!at || !contents || !Array.isArray(contents.slots)) return;
        if (contents.x !== at.x || contents.y !== at.y || contents.z !== at.z) return;
        if (contents.rev < this.microscopeRev) return;
        this.microscopeRev = contents.rev;
        this.microscopeContents = contents;
        const prep = contents.microscope || null;
        const before = this.microscopePrep;
        const same = prep && before && prep.source === before.source && prep.seed === before.seed;
        this.microscopePrep = prep;
        this.microscopeAgeAt = performance.now();
        if (!prep) {
            this.microscopeOrganisms = [];
            this.microscopeScenery = [];
            this.microscopeSelected = null;
        } else if (!same) {
            const left = Math.max(0, (prep.tardigrades || 0) - (prep.taken || 0));
            this.microscopeOrganisms = microPopulate(prep.source, prep.seed, left);
            this.microscopeScenery = microScenery(prep.source, prep.seed);
            this.microscopeSelected = null;
            this.microscopeStage = [0, 0];
        } else {
            // A tardigrade has been drawn off, here or by someone else: the one in the ring first.
            const left = Math.max(0, (prep.tardigrades || 0) - (prep.taken || 0));
            let extra = this.microscopeOrganisms.filter((org) => org.species === 'tardigrade').length - left;
            while (extra-- > 0) {
                const selected = this.microscopeSelected && this.microscopeSelected.species === 'tardigrade' ? this.microscopeSelected : null;
                const gone = selected || this.microscopeOrganisms.find((org) => org.species === 'tardigrade');
                this.microscopeOrganisms = this.microscopeOrganisms.filter((org) => org !== gone);
                if (gone === this.microscopeSelected) this.microscopeSelected = null;
            }
        }
        this.microscopeRenderControls();
    },

    microscopeOnClosed(where) {
        const at = this.microscopeAt;
        if (at && where && where.x === at.x && where.y === at.y && where.z === at.z) this.microscopeClose();
    },

    // Seconds since the slide was last wetted, by the server's reckoning.
    microscopeAge() {
        if (!this.microscopePrep) return 0;
        return this.microscopePrep.age + (performance.now() - this.microscopeAgeAt) / 1000;
    },

    // Seconds since a drop last ended a drought, or negative if none has.
    microscopeWoke() {
        if (!this.microscopePrep || !(this.microscopePrep.woke >= 0)) return -1;
        return this.microscopePrep.woke + (performance.now() - this.microscopeAgeAt) / 1000;
    },

    // ---- The light ----

    // What lights the mirror now: only reads what the world already knows.
    microscopeReadLight() {
        const at = this.microscopeAt;
        if (!at) return;
        const world = this.world;
        let lamp = null;
        let unlit = null;
        for (let dy = -MICROSCOPE_LAMP_REACH; dy <= MICROSCOPE_LAMP_REACH; dy++) {
            for (let dz = -MICROSCOPE_LAMP_REACH; dz <= MICROSCOPE_LAMP_REACH; dz++) {
                for (let dx = -MICROSCOPE_LAMP_REACH; dx <= MICROSCOPE_LAMP_REACH; dx++) {
                    const type = world.getBlockTypeAt(at.x + dx, at.y + dy, at.z + dz);
                    if (microscopeIsUnlitLamp(type) && !unlit) unlit = this.getBlockDisplayName(type);
                    if (!type || !world.isLightEmitterType(type)) continue;
                    const level = world.registry.lightLevel[world.registry.id(type)];
                    if (!lamp || level > lamp.level) {
                        const def = world.blockTypes[type];
                        lamp = { level, name: this.getBlockDisplayName(def.variantOf || type) };
                    }
                }
            }
        }
        const registry = world.registry;
        const blocks = (x, y, z) => {
            const id = world.getBlockId(x, y, z);
            return id !== 0 && registry.solid[id] === 1 && registry.transparent[id] === 0;
        };
        const open = microscopeOpenToSky(blocks, Math.min(WORLD_MAX_Y, at.y + 96), at.x, at.y, at.z);
        const light = microscopeLightFrom(this.daylight ?? 1, open, lamp);
        const changed = !this.microscopeLight || this.microscopeLight.source !== light.source || this.microscopeLight.name !== light.name || this.microscopeUnlit !== unlit;
        this.microscopeLight = light;
        this.microscopeUnlit = unlit;
        if (changed) this.microscopeRenderControls();
    },

    // ---- Every frame ----

    microscopeUpdate(delta) {
        if (!this.network) return;
        if (!this.microscopeListening) {
            this.microscopeListening = true;
            this.network.on('storageResult', (outcome) => this.microscopeOnOutcome(outcome));
            this.network.on('sampleResult', (outcome) => this.microscopeOnOutcome(outcome));
            this.network.on('storageContents', (contents) => this.microscopeOnContents(contents));
            this.network.on('storageClosed', (where) => this.microscopeOnClosed(where));
        }
        // Answers that are late: the server replies from its log, or kills what never arrived.
        const now = performance.now();
        if (this.microscopePending && this.microscopePending.size > 0 && this.network.connected && now >= this.microscopeNextSync) {
            const late = [...this.microscopePending.entries()].filter(([, entry]) => now - entry.at >= STORAGE_SYNC_AFTER).map(([id]) => id);
            if (late.length > 0) {
                this.microscopeNextSync = now + STORAGE_SYNC_EVERY;
                this.network.send('storageSync', { reqIds: late.slice(0, STORAGE_SYNC_MAX) });
            }
        }
        const at = this.microscopeAt;
        if (!at) return;
        const block = this.world.getBlockTypeAt(at.x, at.y, at.z);
        const eye = this.cameraController.camera.position;
        const far = Math.hypot(eye.x - at.x - 0.5, eye.y - at.y - 0.5, eye.z - at.z - 0.5) > MICROSCOPE_CLOSE_DISTANCE;
        if (!block || storageBaseName(block) !== 'microscope' || far || !this.network.connected || this.respawnPending) {
            this.microscopeClose();
            return;
        }
        this.microscopeLightTimer -= delta;
        if (this.microscopeLightTimer <= 0) {
            this.microscopeLightTimer = MICROSCOPE_LIGHT_EVERY;
            this.microscopeReadLight();
            this.microscopeRenderLines();
        }
        this.microscopeClock = (this.microscopeClock || 0) + delta;
        this.microscopeFrameLeft = (this.microscopeFrameLeft || 0) - delta;
        if (this.microscopeFrameLeft > 0) return;
        const step = Math.min(0.1, MICROSCOPE_FRAME - this.microscopeFrameLeft);
        this.microscopeFrameLeft = MICROSCOPE_FRAME;
        const world = { age: this.microscopeAge(), woke: this.microscopeWoke(), revived: Boolean(this.microscopePrep && this.microscopePrep.revived), organisms: this.microscopeOrganisms };
        for (const org of this.microscopeOrganisms) microStep(org, step, world);
        this.microscopeDraw(world);
        this.microscopeRenderSelected();
    },

    microscopeView(world) {
        const radius = this.microscopeCanvas.width / 2;
        return {
            radius, power: this.microscopePower, scale: microscopeScale(this.microscopePower, radius),
            stageX: this.microscopeStage[0], stageY: this.microscopeStage[1], focus: this.microscopeFocus,
            light: this.microscopeLight, t: this.microscopeClock || 0, age: world.age, revived: world.revived, selected: this.microscopeSelected
        };
    },

    microscopeDraw(world) {
        microscopeDrawField(this.microscopeContext, this.microscopeSoft, this.microscopeSofter, this.microscopeView(world), this.microscopeOrganisms, this.microscopeScenery);
    },

    // ---- The stage, by hand ----

    microscopeMoveStage(dx, dy) {
        const radius = this.microscopeCanvas.width / 2;
        const scale = microscopeScale(this.microscopePower, radius);
        this.microscopeStage = microscopeClampStage(this.microscopeStage[0] - dx / scale, this.microscopeStage[1] - dy / scale);
    },

    microscopeSetPower(power) {
        if (power === this.microscopePower) return;
        this.microscopePower = power;
        this.playTone({ frequency: 240, duration: 0.05, type: 'square', volume: 0.012, release: 0.05 });
        this.microscopeRenderControls();
    },

    microscopeSetFocus(value) {
        this.microscopeFocus = Math.max(0, Math.min(1, value));
        const slider = this.microscopePanel.querySelector('#micro-focus');
        if (Number(slider.value) !== Math.round(this.microscopeFocus * 100)) slider.value = Math.round(this.microscopeFocus * 100);
    },

    // A click or a tap on the field: what is under it gets identified, if it can be told apart.
    microscopeClickField(canvasX, canvasY) {
        if (!this.microscopeLight || this.microscopeLight.level <= 0) {
            this.microscopeNote = 'You cannot see a thing: it needs light.';
            this.microscopeRenderLines();
            return;
        }
        const radius = this.microscopeCanvas.width / 2;
        const view = { radius, scale: microscopeScale(this.microscopePower, radius), stageX: this.microscopeStage[0], stageY: this.microscopeStage[1], focus: this.microscopeFocus, power: this.microscopePower };
        const org = microscopePick(this.microscopeOrganisms, view, canvasX, canvasY);
        if (!org) {
            this.microscopeSelected = null;
            this.microscopeNote = '';
            this.microscopeRenderControls();
            return;
        }
        const verdict = microCanIdentify(org.species, this.microscopePower, microBlur(org.depth, this.microscopeFocus, this.microscopePower));
        if (verdict === 'low') {
            this.microscopeNote = `Too small to tell what that is at ${this.microscopePower}×: use more power.`;
        } else if (verdict === 'blur') {
            this.microscopeNote = 'It is out of focus: turn the focus until it is sharp.';
        } else {
            this.microscopeNote = '';
            this.microscopeSelected = org;
            // Each one counts once, however many times it is looked at.
            if (!org.identified) {
                org.identified = true;
                this.microscopeIdentified(org.species);
            }
        }
        this.microscopeRenderControls();
    },

    // ---- The panel ----

    microscopeBuildPanel() {
        if (this.microscopePanel) return;
        const style = document.createElement('style');
        style.textContent = MICROSCOPE_CSS;
        document.head.appendChild(style);
        const panel = document.createElement('div');
        panel.id = 'microscope-panel';
        panel.innerHTML = `
            <div class="micro-head">
                <h3>Microscope</h3>
                <button class="micro-guide" type="button" title="The microscope, in the guide">📖</button>
                <button class="micro-close" type="button" aria-label="Close">✕</button>
            </div>
            <div class="micro-body">
                <div class="micro-eye"><canvas id="micro-field" width="520" height="520"></canvas></div>
                <div class="micro-side">
                    <div id="micro-light"></div>
                    <div class="micro-row" id="micro-powers">
                        ${MICRO_MAGNIFICATIONS.map((power) => `<button type="button" data-power="${power}">${power}×</button>`).join('')}
                    </div>
                    <div class="micro-row"><label for="micro-focus">Focus</label><input id="micro-focus" type="range" min="0" max="100" step="1"></div>
                    <div id="micro-slide-line"></div>
                    <div id="micro-info">
                        <canvas id="micro-portrait" width="168" height="168"></canvas>
                        <div>
                            <div class="micro-name"></div>
                            <div class="micro-meta"></div>
                            <div class="micro-fact"></div>
                            <div class="micro-state micro-fact"></div>
                            <button type="button" class="micro-capture"></button>
                            <button type="button" class="micro-read">📖 In the guide</button>
                        </div>
                    </div>
                    <div id="micro-note"></div>
                    <div id="micro-stage-actions" class="micro-row">
                        <button type="button" class="micro-drop"></button>
                        <button type="button" class="micro-clear">Take the slide off</button>
                    </div>
                    <div id="micro-prepare">
                        <h4 id="micro-prepare-title"></h4>
                        <div class="micro-row" style="margin-bottom:6px"><button type="button" class="micro-cheek">Smear of your cheek</button></div>
                        <div id="micro-sources"></div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(panel);
        this.microscopePanel = panel;
        const canvas = panel.querySelector('#micro-field');
        this.microscopeCanvas = canvas;
        this.microscopeContext = canvas.getContext('2d');
        const buffer = () => {
            const made = document.createElement('canvas');
            return { canvas: made, ctx: made.getContext('2d') };
        };
        this.microscopeSoft = buffer();
        this.microscopeSofter = buffer();

        panel.querySelector('.micro-close').addEventListener('click', () => this.microscopeClose());
        panel.querySelector('.micro-guide').addEventListener('click', () => this.microscopeOpenGuide(MICROSCOPE_GUIDE_PAGE));
        panel.querySelector('.micro-read').addEventListener('click', () => {
            if (this.microscopeSelected) this.microscopeOpenGuide(MICRO_SPECIES[this.microscopeSelected.species].page);
        });
        panel.querySelectorAll('[data-power]').forEach((button) => button.addEventListener('click', () => this.microscopeSetPower(Number(button.dataset.power))));
        panel.querySelector('#micro-focus').addEventListener('input', (event) => this.microscopeSetFocus(Number(event.target.value) / 100));
        panel.querySelector('.micro-drop').addEventListener('click', () => this.microscopeSend('microscopeDrop', 'drop'));
        panel.querySelector('.micro-clear').addEventListener('click', () => this.microscopeSend('microscopeClear', 'clear'));
        panel.querySelector('.micro-capture').addEventListener('click', () => this.microscopeSend('microscopeCapture', 'capture'));
        panel.querySelector('.micro-cheek').addEventListener('click', () => this.microscopePrepareSlide('cheek'));
        // Clicks inside the panel must not reach the game (which would try to grab the pointer).
        panel.addEventListener('mousedown', (event) => event.stopPropagation());
        panel.addEventListener('pointerdown', (event) => event.stopPropagation());
        panel.addEventListener('contextmenu', (event) => event.preventDefault());
        this.microscopeInstallField(canvas);

        // Clicking outside closes it, except the click that opened it and what a phone makes up after a tap.
        document.addEventListener('mousedown', (event) => {
            if (!this.microscopeAt || performance.now() - this.microscopeOpenedAt < 150) return;
            if (this.touchControlsEnabled && this.touchIsEmulatedMouse(event)) return;
            this.microscopeClose();
        });
        // E or Escape close it; arrows move the stage, + and - change the power; nothing reaches the game.
        document.addEventListener('keydown', (event) => {
            if (!this.microscopeAt) return;
            event.stopImmediatePropagation();
            if (event.code === 'Escape' || event.code === 'KeyE') {
                event.preventDefault();
                if (!event.repeat) this.microscopeClose();
                return;
            }
            const pan = { ArrowLeft: [24, 0], ArrowRight: [-24, 0], ArrowUp: [0, 24], ArrowDown: [0, -24] }[event.code];
            if (pan) {
                event.preventDefault();
                this.microscopeMoveStage(pan[0], pan[1]);
            } else if (event.key === '+' || event.key === '=') {
                this.microscopeSetPower(microscopeStepPower(this.microscopePower, 1));
            } else if (event.key === '-') {
                this.microscopeSetPower(microscopeStepPower(this.microscopePower, -1));
            }
        }, true);
        window.addEventListener('resize', () => {
            if (this.microscopeAt) this.microscopeResizeField();
        });
    },

    // Mouse and touch on the field: one finger or the mouse drags, a tap identifies, two fingers pinch.
    microscopeInstallField(canvas) {
        const pointers = new Map();
        let pinchFrom = 0;
        let moved = 0;
        let downAt = 0;
        const toCanvas = (event) => {
            const box = canvas.getBoundingClientRect();
            return [(event.clientX - box.left) * (canvas.width / box.width), (event.clientY - box.top) * (canvas.height / box.height)];
        };
        const spread = () => {
            const [a, b] = [...pointers.values()];
            return Math.hypot(a[0] - b[0], a[1] - b[1]);
        };
        canvas.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
            pointers.set(event.pointerId, toCanvas(event));
            if (pointers.size === 1) {
                moved = 0;
                downAt = performance.now();
            } else if (pointers.size === 2) {
                pinchFrom = spread();
                moved = 99;
            }
        });
        canvas.addEventListener('pointermove', (event) => {
            const was = pointers.get(event.pointerId);
            if (!was) return;
            const now = toCanvas(event);
            pointers.set(event.pointerId, now);
            if (pointers.size === 1) {
                moved += Math.hypot(now[0] - was[0], now[1] - was[1]);
                this.microscopeMoveStage(now[0] - was[0], now[1] - was[1]);
            } else if (pointers.size === 2) {
                const ratio = spread() / (pinchFrom || 1);
                if (ratio > 1.4 || ratio < 0.7) {
                    this.microscopeSetPower(microscopeStepPower(this.microscopePower, ratio > 1 ? 1 : -1));
                    pinchFrom = spread();
                }
            }
        });
        const release = (event) => {
            const was = pointers.get(event.pointerId);
            if (!was) return;
            pointers.delete(event.pointerId);
            if (event.type === 'pointerup' && pointers.size === 0 && moved < 8 && performance.now() - downAt < 450) {
                this.microscopeClickField(was[0], was[1]);
            }
        };
        canvas.addEventListener('pointerup', release);
        canvas.addEventListener('pointercancel', release);
        canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            this.microscopeSetFocus(this.microscopeFocus - Math.sign(event.deltaY) * 0.04);
        }, { passive: false });
    },

    // The canvas matches its size on the screen, so that it stays sharp and clicks fall in the right place.
    microscopeResizeField() {
        const canvas = this.microscopeCanvas;
        const box = canvas.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const size = Math.max(240, Math.min(760, Math.round((box.width || 480) * ratio)));
        if (canvas.width !== size) {
            canvas.width = size;
            canvas.height = size;
        }
        // Painted a third and a sixth of the size, and stretched: that is the blur of what is out of focus.
        for (const [buffer, factor] of [[this.microscopeSoft, 3], [this.microscopeSofter, 6]]) {
            if (buffer.canvas.width !== Math.ceil(size / factor)) {
                buffer.canvas.width = Math.ceil(size / factor);
                buffer.canvas.height = Math.ceil(size / factor);
            }
        }
    },

    microscopeSend(message, op) {
        if (!this.microscopeAt) return;
        this.microscopeRequest(message, op, { ...this.microscopeAt });
    },

    microscopePrepareSlide(source) {
        if (!this.microscopeAt) return;
        if (this.getInventoryCount('glass_slide') <= 0) {
            this.microscopeNote = 'You need a Glass Slide (C: 1 glass makes 4).';
            this.microscopeRenderLines();
            return;
        }
        this.microscopeRequest('microscopePrepare', 'prepare', { ...this.microscopeAt, source }, source);
    },

    // What changes rarely: which buttons, what can go on a slide, who is in the ring.
    microscopeRenderControls() {
        const panel = this.microscopePanel;
        if (!panel || !this.microscopeAt) return;
        panel.querySelectorAll('[data-power]').forEach((button) => button.classList.toggle('active', Number(button.dataset.power) === this.microscopePower));
        const slider = panel.querySelector('#micro-focus');
        slider.value = Math.round(this.microscopeFocus * 100);
        const prep = this.microscopePrep;
        panel.querySelector('#micro-stage-actions').style.display = prep ? '' : 'none';
        panel.querySelector('#micro-prepare').style.display = prep ? 'none' : '';
        if (prep) {
            const drop = panel.querySelector('.micro-drop');
            const flasks = this.getInventoryCount('water_flask');
            drop.disabled = flasks <= 0;
            drop.textContent = flasks > 0 ? 'Add a drop of water' : 'A drop needs a Water Flask';
        } else {
            const slides = this.getInventoryCount('glass_slide');
            panel.querySelector('#micro-prepare-title').textContent = slides > 0
                ? `Prepare a slide (${slides} Glass Slide${slides === 1 ? '' : 's'}): pick what goes on it`
                : 'Prepare a slide: you need a Glass Slide (C: 1 glass makes 4)';
            panel.querySelector('.micro-cheek').disabled = slides <= 0;
            const list = panel.querySelector('#micro-sources');
            list.innerHTML = '';
            this.inventory.filter((type) => this.getInventoryCount(type) > 0 && microSpeciesOf(type) && type !== 'cheek' && this.world.blockTypes[type]).forEach((type) => {
                const cell = document.createElement('div');
                cell.className = 'micro-cell';
                cell.title = this.getBlockDisplayName(type);
                cell.style.backgroundImage = `url(${this.world.getInventoryIconUrl(type)})`;
                const label = document.createElement('span');
                label.textContent = this.getInventoryCount(type);
                cell.appendChild(label);
                cell.addEventListener('click', () => this.microscopePrepareSlide(type));
                list.appendChild(cell);
            });
        }
        this.microscopeRenderLines();
        this.microscopeRenderInfo();
    },

    // The lines of text that follow the clock and the light.
    microscopeRenderLines() {
        const panel = this.microscopePanel;
        if (!panel || !this.microscopeAt) return;
        const light = this.microscopeLight;
        const line = panel.querySelector('#micro-light');
        const dark = !light || light.level <= 0;
        line.classList.toggle('off', dark);
        if (dark) line.textContent = microscopeDarkLine(this.microscopeUnlit);
        else if (light.source === 'sun') line.textContent = 'The mirror is catching the daylight.';
        else line.textContent = `The mirror is catching the light of the ${light.name}.`;
        const prep = this.microscopePrep;
        panel.querySelector('#micro-slide-line').textContent = prep ? microscopeSlideLine(prep, this.microscopeAge(), this.microscopeWoke()) : 'There is no slide on the stage.';
        panel.querySelector('#micro-note').textContent = this.microscopeNote || '';
    },

    microscopeRenderInfo() {
        const panel = this.microscopePanel;
        const info = panel.querySelector('#micro-info');
        const org = this.microscopeSelected;
        info.classList.toggle('visible', Boolean(org));
        if (!org) {
            this.microscopeShownSpecies = null;
            return;
        }
        const def = MICRO_SPECIES[org.species];
        if (this.microscopeShownSpecies !== org.species) {
            this.microscopeShownSpecies = org.species;
            info.querySelector('.micro-name').innerHTML = `${def.name} <span class="micro-latin">${def.latin}</span>`;
            info.querySelector('.micro-meta').textContent = `${def.size}. ${def.where}.`;
            info.querySelector('.micro-fact').textContent = def.fact;
            const portrait = panel.querySelector('#micro-portrait');
            microDrawPortrait(portrait.getContext('2d'), org.species, portrait.width, portrait.height, 1.3);
        }
        const capture = info.querySelector('.micro-capture');
        const tardigrade = org.species === 'tardigrade';
        capture.style.display = tardigrade ? '' : 'none';
        if (tardigrade) {
            const pipette = this.getInventoryCount('micropipette') > 0;
            const tube = this.getInventoryCount('test_tube') > 0;
            capture.disabled = !pipette || !tube;
            capture.textContent = pipette && tube ? 'Draw it off into a tube' : pipette ? 'To keep it you need an empty Test Tube' : 'To keep it you need a Micropipette';
        }
        this.microscopeRenderSelected();
    },

    // What the one in the ring is doing, as it changes.
    microscopeRenderSelected() {
        const org = this.microscopeSelected;
        if (!org || !this.microscopePanel) return;
        const box = this.microscopePanel.querySelector('.micro-state');
        const age = this.microscopeAge();
        const revived = Boolean(this.microscopePrep && this.microscopePrep.revived);
        let text = '';
        if (org.species === 'tardigrade') text = microscopeTardigradeLine(org);
        else if (microFate(org.species, age, revived) === 'cyst') text = 'It has shut itself in a cyst.';
        else if (microFate(org.species, age, revived) === 'dead') text = 'The drying has killed it.';
        if (box.textContent !== text) box.textContent = text;
    },

    // Closes the panel and opens the book at `page`; closing the book returns to the game.
    microscopeOpenGuide(page) {
        if (typeof this.guideShow !== 'function') return;
        this.microscopeClose();
        this.guideShow(String(page));
    },

    // /microkit: everything for trying the microscope, in creative mode only.
    microscopeKit(command) {
        if (!this.creativeMode) {
            this.receiveSystemMessage({ text: `Unknown command: /${command}` });
            return;
        }
        for (const [type, amount] of MICROSCOPE_KIT) this.addInventory(type, amount);
        this.receiveSystemMessage({ text: 'Microscope kit: microscope, tubes, slides, pipette, a lantern and samples' });
    }
});

registerModalPanel({
    isOpen() { return Boolean(this.microscopeAt); },
    close() { this.microscopeClose(); }
});

// Before a chest would see it: the microscope has its own panel, not the panel of a chest.
ITEM_USE_HANDLERS.unshift(function (itemType, hit) {
    if (!hit || this.cameraController.isCrouching) return false;
    const position = this.world.getBlockPositionFromIntersection(hit);
    return Boolean(position) && this.microscopeTryOpen(position);
});

registerItemUseHandler(function (item, hit) {
    return item === 'test_tube' ? this.microscopeTakeSample(hit) : false;
});

registerGameContent(function () {
    this.microscopeLoadPending();
});

registerFrameUpdate(function (delta) {
    this.microscopeUpdate(delta);
});
