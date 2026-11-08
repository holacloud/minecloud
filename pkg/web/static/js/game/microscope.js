// The microscope, and the test tubes, slides and pipette that go with it. What lives on a slide is
// js/game/microbes.js; what a sample holds and what lies on each slide are decided on the SERVER
// (pkg/network/microscope.go), which also keeps the slide, shared by everyone looking at that block.
// - A test tube used on water or moss takes a sample and leaves the block where it is. The server says
//   what it became: the place fixes what it holds, so the same spot always gives the same.
// - The panel only exists with a slide on it. A right click on a microscope (a tap, on a touch screen; crouch
//   to build against it) opens it if there is one: it is someone's, and is shown, never replaced. On a free
//   microscope, something a slide takes in the hand uses a slide and goes on it (the empty tube comes back),
//   a glass slide in the hand smears your own cheek, and anything else opens nothing and says what to do.
//   A culture plate is the one in the hand (js/game/plates.js): the server's answer carries its record
//   (prep.culture), and the field shows what is on that plate, as the incubator's lens does.
//   A Petri dish (MICRO_PLATES: a culture plate from the incubator, or a clean, unsterile or used one) goes
//   on the stage itself, with no slide: it never dries, takes no drop, stain or pipette, and comes back as
//   it went when it is taken off.
//   Taking the slide off gives it back washed and closes the panel. Closing it any other way leaves the
//   slide there, drying, for whoever looks next.
// - The field gets the room: the powers have a button each above the focus, every other tool is an icon in the
//   bar along the bottom (microscopeRenderTools), and
//   what is said about the field lies over it or beside it. The icons are always there, and one that cannot
//   be used now is greyed and says why when pressed. Stains and filters open a small popover
//   above their icon (microscopePop), which Escape closes before the panel.
// - The field is drawn on a 2D canvas: drag moves the stage, a power's button (or a pinch) changes the
//   power, the slider (or the wheel) the focus. It needs light, as a real one does: the sun by day on a
//   block in the open, or anything that gives light right beside it (microscopeReadLight). Without
//   light the field is black and says why.
// - A click on an organism identifies it (microscopeIdentified, the one call that says so, and the only
//   way into its card in the bestiary). With a
//   micropipette and an empty tube a tardigrade can be drawn off into the tube.
// - Left alone a slide dries in a game day. Only the tardigrades come through that, as tuns; a drop of
//   water from a flask brings them back in about 20 s. The freezer turns a tube into a tun too
//   (appliances.go), and a C recipe with a flask brings it back.
// - A stain (MICRO_STAINS) goes through the server and stays with the slide, for everyone looking. It fixes
//   the slide: what is on it stops, cannot be drawn off and does not come back with a drop, and the panel
//   says so before you pay for it.
// - A colour filter and the dark-field stop are this viewer's own and are not spent: picked from what the
//   player carries, and forgotten when the page reloads. A filter multiplies the colour of the light
//   (microscopeFieldTint). Dark-field paints the field black and keeps only what scatters light, so it
//   asks for far more light than the plain field (microscopeDarkfieldGain).
// - Items move in two steps, like a chest's (js/game/storage.js): out of the inventory first, and what
//   the answer says comes back. `microscopePending` survives a reload, and storageSync settles it.
// Mixed into Game.prototype; hooked through js/extensions.js.

const MICROSCOPE_PENDING_KEY = 'minecloud-microscope-pending';
const MICROSCOPE_KNOWN_KEY = 'minecloud-microscope-known';
// Blocks away at which an open panel closes (the server allows 9).
const MICROSCOPE_CLOSE_DISTANCE = 7;
// How long the server has to say what is on a microscope (milliseconds).
const MICROSCOPE_ASK_MS = 6000;
// How long a note stays over the field (milliseconds).
const MICROSCOPE_NOTE_MS = 8000;
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
// The colour of a flame's or lamp's light, as a filter multiplies it.
const MICROSCOPE_LAMP_TINT = [255, 217, 160];
// Dark-field throws away nearly all the light: below the first level there is hardly anything to see, and
// from the second it is as good as it gets. A bulb is at 0.70, a candle at 0.77, a lamp and the sun above 0.85.
const MICROSCOPE_DARKFIELD_DIM = 0.6;
const MICROSCOPE_DARKFIELD_FULL = 0.92;
const MICROSCOPE_DARKFIELD_LEAST = 0.1;

// A kit for testing: /microkit, only in creative mode, like /give.
const MICROSCOPE_KIT = [
    ['microscope', 1], ['test_tube', 12], ['glass_slide', 12], ['micropipette', 1], ['water_flask', 6], ['lantern', 2], ['candle', 4], ['moss', 8],
    ['sample_forest_lake_b', 2], ['sample_forest_lake_c', 2], ['sample_mountain_lake_d', 2], ['sample_plains_lake_a', 2], ['sample_plains_lake_b', 2], ['sample_oasis_a', 2],
    ['sample_moss_a', 2], ['sample_still_water', 2], ['tardigrade_tube', 2], ['tardigrade_tun', 2],
    ['dirt', 4], ['flower_red', 4], ['milk', 2], ['leaves', 4], ['wheat', 2], ['mushroom_red', 2], ['raw_fish', 2], ['white_wool', 2], ['honeycomb', 2],
    ['iodine_tincture', 4], ['methylene_blue', 4], ['darkfield_stop', 1],
    ['cobalt_glass', 1], ['red_stained_glass', 1], ['orange_stained_glass', 1], ['green_stained_glass', 1], ['light_blue_stained_glass', 1]
];

// The page of the microscope in the guide; the organisms carry their own (MICRO_SPECIES.page).
const MICROSCOPE_GUIDE_PAGE = 238;
const MICROSCOPE_STAIN_PAGE = 246;
const MICROSCOPE_LENS_PAGE = 247;

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

// The caption of each icon, in MICROSCOPE_TEXT.
const MICROSCOPE_CAPTIONS = {
    clear: 'capClear', drop: 'capDrop', capture: 'capCapture', stain: 'capStain', filter: 'capFilter', dark: 'capDark', guide: 'capGuide'
};

// What each reason of the server is called in MICROSCOPE_TEXT.
const MICROSCOPE_REFUSALS = {
    occupied: 'refusedOccupied', 'none left': 'refusedNoneLeft', gone: 'refusedGone', 'too far': 'refusedTooFar', 'not a microscope': 'refusedNotScope',
    'not for the microscope': 'refusedNotForSlide', 'not a stain': 'refusedNotStain', 'not a slide': 'refusedNotSlide', 'not water or moss': 'sampleNeeds', 'not water': 'filterAim', 'bad request': 'refusedBadRequest', lost: 'refusedLost', 'not yours': 'refusedNotYours'
};

// What the panel says when the server refuses.
function microscopeRefusalLine(op, reason) {
    if (!reason) return '';
    if (reason === 'stained') return microscopeSay(op === 'stain' ? 'refusedStainTwice' : 'refusedStained');
    return microscopeSay(MICROSCOPE_REFUSALS[reason] || 'refusedOther');
}

// What each request takes out of the inventory and gives on success.
function microscopeRequestItems(op, source) {
    switch (op) {
        // A filter is a tube too, of sand and charcoal, and it is the filter that becomes the sample.
        case 'sample': return { took: { [source === 'water_filter' ? 'water_filter' : 'test_tube']: 1 }, gives: { result: 1 } };
        case 'prepare': {
            // A plate goes on the stage itself, with no slide.
            if (MICRO_PLATES[source]) return { took: { [source]: 1 }, gives: {} };
            const took = { glass_slide: 1 };
            if (source !== 'cheek') took[source] = 1;
            // A tube comes back empty, and so does the bottle of the milk.
            const gives = microSourceInTube(source) ? { test_tube: 1 } : source === 'milk' ? { glass: 1 } : {};
            return { took, gives };
        }
        // A slide comes back washed, a plate as it went: the server names which.
        case 'clear': return { took: {}, gives: { result: 1 } };
        case 'drop': return { took: { water_flask: 1 }, gives: { glass: 1 } };
        case 'capture': return { took: { test_tube: 1 }, gives: { result: 1 } };
        // The bottle is used up and its glass comes back; refused, the whole bottle does.
        case 'stain': return { took: { [source]: 1 }, gives: { glass: 1 } };
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
    return { source: 'lamp', level: candle, name: lamp.name, type: lamp.type };
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
    return unlit ? microscopeSay('darkUnlit', String(unlit).toLowerCase()) : microscopeSay('darkLine');
}

// Whether the player holding this has something a slide takes. The smear of a cheek is no item.
function microscopeObservable(type) {
    return Boolean(type) && type !== 'cheek' && Boolean(microSpeciesOf(type));
}

// What goes on a slide if this is in the hand on a free microscope, or null. A slide alone is a smear.
function microscopeSourceHeld(type) {
    if (type === 'glass_slide') return 'cheek';
    return microscopeObservable(type) ? type : null;
}

// Whether this block name is an electric light that is off now.
function microscopeIsUnlitLamp(type) {
    return MICROSCOPE_ELECTRIC_LIGHTS.includes(type);
}

// What a block's glass lets through, as [r, g, b], or null if it is not a colour filter. A pane is as good
// as a block: stained glass says of itself that its colour is how much of what is behind it passes.
function microscopeFilterColor(type, blockTypes) {
    const def = blockTypes[type];
    if (!def || !(type === 'cobalt_glass' || def.filterGlass) || typeof def.color !== 'number') return null;
    return [(def.color >> 16) & 255, (def.color >> 8) & 255, def.color & 255];
}

// What the light in the field is in the end, as [r, g, b], or null if it stays white. The lamp's colour and
// the filter's multiply, as the light goes through one after the other.
function microscopeFieldTint(source, filter) {
    const lamp = source === 'lamp' ? MICROSCOPE_LAMP_TINT : null;
    if (!lamp && !filter) return null;
    const base = lamp || [255, 255, 255];
    const pass = filter || [255, 255, 255];
    return [0, 1, 2].map((i) => Math.round((base[i] * pass[i]) / 255));
}

// How much of a dark-field image there is with the field's light at this level, from 0 to 1.
function microscopeDarkfieldGain(level) {
    if (!(level > 0)) return 0;
    const gain = (level - MICROSCOPE_DARKFIELD_DIM) / (MICROSCOPE_DARKFIELD_FULL - MICROSCOPE_DARKFIELD_DIM);
    return Math.max(MICROSCOPE_DARKFIELD_LEAST, Math.min(1, gain));
}

// What the panel says of dark-field with this light, as microscopeLightFrom gives it.
function microscopeDarkfieldLine(light) {
    if (!light || light.level <= 0) return microscopeSay('darkNoLight');
    const gain = microscopeDarkfieldGain(light.level);
    const from = light.source === 'sun' ? microscopeSay('darkFromSun') : microscopeSay('darkFromLamp', String(light.name).toLowerCase());
    if (gain < 0.4) return microscopeSay('darkDim', from);
    if (gain < 0.8) return microscopeSay('darkFaint', from);
    return microscopeSay('darkBright', from);
}

// How much a colour stands out on the bright field under a filter: 0 is not at all, 1 is black on white.
function microscopeDyeContrast(dye, filter) {
    const brightness = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;
    const ground = brightness(filter);
    if (ground <= 0) return 0;
    return 1 - brightness([0, 1, 2].map((i) => (dye[i] * filter[i]) / 255)) / ground;
}

// What the panel says of a filter, and of what it does to the stain on the slide if there is one.
function microscopeFilterLine(name, filter, stain) {
    const dye = stain && MICRO_STAINS[stain];
    if (!dye) return microscopeSay('filterAlone', name);
    const called = microscopeStainText(stain).the;
    const change = microscopeDyeContrast(dye.dye, filter) - microscopeDyeContrast(dye.dye, [255, 255, 255]);
    if (change > 0.03) return microscopeSay('filterDarker', name, called);
    if (change < -0.03) return microscopeSay('filterFades', name, called);
    return microscopeSay('filterSame', name, called);
}

// What a stain costs, said before it is paid.
function microscopeStainWarning(stain) {
    return microscopeSay('stainWarning', microscopeStainText(stain).shows);
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
    if (MICRO_PLATES[prep.source]) return microscopeSay('plateOnStage');
    if (prep.stain) return microscopeSay('slideStained', MICRO_STAINS[prep.stain] ? microscopeStainText(prep.stain).the : prep.stain);
    const stage = microSlideStage(age, woke);
    if (stage === 'dry') return microscopeSay('slideDry');
    if (stage === 'reviving') return microscopeSay('slideReviving', Math.ceil(MICRO_REVIVE_SECONDS - woke));
    if (stage === 'drying') return microscopeSay('slideDrying', Math.ceil(MICRO_DRY_SECONDS - age));
    return microscopeSay(prep.revived ? 'slideRevived' : 'slideFresh', Math.ceil((MICRO_DRY_SECONDS - age) / 10) * 10);
}

// What a tardigrade is doing, in words.
function microscopeTardigradeLine(org) {
    switch (org.action) {
        case 'eating': return microscopeSay('tardigradeEating');
        case 'molting': return microscopeSay('tardigradeMolting');
        case 'tun': return microscopeSay('tardigradeTun');
        case 'folding': return microscopeSay('tardigradeFolding');
        default: return microscopeSay('tardigradeWalking');
    }
}

// ---------------------------------------------------------------------------------------
// The field (a canvas context, and two smaller canvases for what is out of focus)

// Draws what is on the slide. view: radius, power, scale, stageX, stageY, focus, light, t, age, revived,
// selected, and if they apply stain (its id), tint (the [r, g, b] of microscopeFieldTint, or null) and dark
// (microscopeDarkfieldGain; 0 is the plain bright field). `soft` holds { ctx, canvas } at a third and
// `softer` at a sixth of the size.
function microscopeDrawField(ctx, soft, softer, view, organisms, scenery) {
    const { radius, scale, stageX, stageY, focus, power, light, t, stain } = view;
    const dark = view.dark > 0;
    const look = { stain, dark };
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
    if (dark) {
        // No direct light gets in: only what the things on the slide scatter, added up.
        ctx.fillStyle = '#000';
    } else {
        // The bright, pale field of a lit microscope.
        const ground = ctx.createRadialGradient(radius, radius, radius * 0.1, radius, radius, radius);
        ground.addColorStop(0, '#f6f6e6');
        ground.addColorStop(0.75, '#e6e8d0');
        ground.addColorStop(1, '#bfc2a4');
        ctx.fillStyle = ground;
    }
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
        place((c) => microDrawSceneryItem(c, item, x, y, scale, look), item.depth);
    }
    for (const org of organisms) {
        const def = MICRO_SPECIES[org.species];
        const px = def.drawn * org.scale * scale;
        for (const molt of org.molts || []) {
            const mx = radius + (molt.x - stageX) * scale;
            const my = radius + (molt.y - stageY) * scale;
            place((target) => {
                const c = stain || dark ? microLens(target, def.stains[stain] || null, dark, 70 / Math.max(px, 1)) : target;
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
        const fate = org.dead ? 'dead' : microFate(org.species, view.age, view.revived);
        const st = { seed: org.seed, variant: org.variant, fate, spring: org.spring, phase: org.phase, stain, dark };
        if (org.species === 'tardigrade') {
            Object.assign(st, { unfold: org.unfold ?? 1, gut: org.gut, stylet: org.stylet, still: (org.unfold ?? 1) < 0.1 });
        } else if (fate !== 'alive' || view.age >= MICRO_DRY_SECONDS) {
            st.still = true;
        }
        // On a stained slide even the clock of each drawing stops.
        const clock = stain ? org.phase : t + org.phase;
        place((c) => microDrawOrganism(c, org.species, x, y, px, org.rot, clock, st), org.depth);
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
    if (dark) ctx.globalCompositeOperation = 'lighter';
    paintSoft(layers[0], softer, 6, 0.55);
    paintSoft(layers[1], soft, 3, 0.85);
    for (const draw of layers[2]) draw(ctx);
    if (dark) ctx.globalCompositeOperation = 'source-over';

    const selected = view.selected;
    if (selected) {
        const def = MICRO_SPECIES[selected.species];
        const ring = Math.max(def.drawn * selected.scale * scale * 0.62, 16);
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(radius + (selected.x - stageX) * scale, radius + (selected.y - stageY) * scale, ring, 0, Math.PI * 2);
        ctx.strokeStyle = dark ? 'rgba(170,215,255,0.9)' : 'rgba(30,90,170,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // The colour and strength of the light, and the dark edge of the lens.
    const tint = view.tint || microscopeFieldTint(light.source, null);
    if (tint) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = 'source-over';
    }
    const strength = dark ? view.dark : light.level;
    if (strength < 1) {
        ctx.fillStyle = `rgba(0,0,0,${1 - strength})`;
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
    ctx.fillStyle = dark ? 'rgba(226,230,236,0.8)' : 'rgba(16,18,14,0.82)';
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
// A dropper bottle of dye.
const MICROSCOPE_DROPPER = [
    '.....rr.....',
    '.....rr.....',
    '....rrrr....',
    '....gggg....',
    '...g....g...',
    '..gLLLLLLg..',
    '..gHLLLLLg..',
    '..gHLLLLLg..',
    '..gLLLLLLg..',
    '..gLLLLLLg..',
    '...gggggg...',
    '............'
];
// A clear disc with a black centre: the light can only get round its edge.
const MICROSCOPE_STOP = [
    '............',
    '....GGGG....',
    '..GGLLLLGG..',
    '..GLKKKKLG..',
    '.GLKKHKKKLG.',
    '.GLKHKKKKLG.',
    '.GLKKKKKKLG.',
    '.GLKKKKKKLG.',
    '..GLKKKKLG..',
    '..GGLLLLGG..',
    '....GGGG....',
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
microscopeItem('methylene_blue', 'Methylene Blue', MICROSCOPE_DROPPER, { r: 0x3a3d44, g: 0xcfe9f2, L: 0x1f4fb4, H: 0x6f9fe8 }, 0x1f4fb4);
microscopeItem('darkfield_stop', 'Dark-field Stop', MICROSCOPE_STOP, { G: 0x9fc6d4, L: 0xdff2f8, K: 0x16171a, H: 0x3a3c42 }, 0x16171a);

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
    ['moss', 'test_tube', 'glass_slide', 'micropipette', 'sample_still_water', 'tardigrade_tube', 'tardigrade_tun', 'methylene_blue', 'darkfield_stop'].forEach(addItem);
    for (const [habitat, variants] of Object.entries(MICRO_SAMPLES)) {
        for (const { letter } of variants) addItem(microSampleId(habitat, letter));
    }
    addRecipe('microscope', 'Build Microscope', 'microscope', 1, [{ type: 'glass', amount: 2 }, { type: 'copper_block', amount: 1 }, { type: 'iron_ore', amount: 1 }, { type: 'planks', amount: 1 }]);
    addRecipe('microscope_iron', 'Build Microscope (Iron)', 'microscope', 1, [{ type: 'glass', amount: 2 }, { type: 'iron_ore', amount: 2 }, { type: 'planks', amount: 1 }]);
    addRecipe('test_tube', 'Blow Test Tubes', 'test_tube', 3, [{ type: 'glass', amount: 1 }]);
    addRecipe('glass_slide', 'Cut Glass Slides', 'glass_slide', 4, [{ type: 'glass', amount: 1 }]);
    addRecipe('micropipette', 'Make Micropipette', 'micropipette', 1, [{ type: 'glass', amount: 1 }, { type: 'leather', amount: 1 }]);
    addRecipe('tardigrade_revive', 'Revive Tardigrade Tun', 'tardigrade_tube', 1, [{ type: 'tardigrade_tun', amount: 1 }, { type: 'water_flask', amount: 1 }]);
    // Not the real synthesis, which takes more than coal and sulfur (guide, page 246): only what stands for it.
    addRecipe('methylene_blue', 'Mix Methylene Blue', 'methylene_blue', 1, [{ type: 'coal_ore', amount: 1 }, { type: 'element_s', amount: 1 }, { type: 'water_flask', amount: 1 }]);
    addRecipe('darkfield_stop', 'Make Dark-field Stop', 'darkfield_stop', 1, [{ type: 'glass_slide', amount: 1 }, { type: 'coal_ore', amount: 1 }]);
});

// ---------------------------------------------------------------------------------------
// The panel

const MICROSCOPE_CSS = `
#microscope-panel{position:fixed;inset:max(6px,env(safe-area-inset-top)) max(6px,env(safe-area-inset-right)) max(6px,env(safe-area-inset-bottom)) max(6px,env(safe-area-inset-left));margin:auto;max-width:1060px;max-height:860px;display:none;flex-direction:column;gap:5px;padding:7px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(8,12,20,.95);color:#fff;font-family:'Consolas',monospace;z-index:275;box-sizing:border-box;overflow:hidden;touch-action:none}
#microscope-panel.visible{display:flex}
#microscope-panel button{padding:0 8px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:700 13px/1.1 'Consolas',monospace;cursor:pointer;touch-action:manipulation}
#microscope-panel button.active{background:rgba(120,190,255,.4);border-color:rgba(160,210,255,.8)}
#microscope-panel .micro-head{flex:0 0 auto;display:flex;align-items:center;gap:8px}
#microscope-panel h3{font-size:14px;margin:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#microscope-panel .micro-close{min-width:40px;min-height:32px}
#micro-light{font-size:12px;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.1);white-space:nowrap;max-width:60%;overflow:hidden;text-overflow:ellipsis}
#micro-light.off{background:rgba(255,160,60,.25);color:#ffc27a}
.micro-body{flex:1 1 0;min-height:0;container-type:size;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;gap:5px}
.micro-stage{grid-area:1/1;position:relative;min-width:0;min-height:0;container-type:size;display:flex;align-items:center;justify-content:center}
#micro-readout{grid-area:1/1;position:relative;min-width:0;min-height:0;pointer-events:none}
#micro-field{display:block;width:min(100%,60vh);aspect-ratio:1;width:calc(min(100cqw,100cqh) - 14px);height:calc(min(100cqw,100cqh) - 14px);border-radius:50%;background:#000;box-shadow:0 0 0 5px #17191d,0 0 0 7px rgba(255,255,255,.14);touch-action:none;cursor:grab}
#micro-field:active{cursor:grabbing}
#micro-lines{position:absolute;top:0;left:0;right:0;display:flex;flex-direction:column;align-items:flex-start;gap:3px;pointer-events:none;font-size:12px;line-height:1.25}
#micro-lines>div{padding:3px 7px;border-radius:7px;background:rgba(8,12,20,.76)}
#micro-lines>div:empty{display:none}
#micro-note{color:#ffe9a8}
#micro-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:0 max(8px,calc(50cqw - 44cqh));pointer-events:none;text-align:center;font-size:13px;line-height:1.35}
#micro-center>div{padding:6px 10px;border-radius:9px;background:rgba(8,12,20,.8)}
#micro-center>div:empty{display:none}
#micro-center #micro-dark-note{color:#ffc27a}
#micro-hint{display:none}
#micro-info{position:absolute;left:0;right:0;bottom:0;display:none;gap:8px;padding:6px 8px;border-radius:9px;background:rgba(8,12,20,.86);line-height:1.28;font-size:12px;max-height:46%;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;pointer-events:auto}
#micro-info.visible{display:flex}
#micro-portrait{flex:0 0 52px;width:52px;height:52px;border-radius:7px}
.micro-info-text{flex:1;min-width:0}
#micro-info .micro-name{font-weight:700;font-size:13px}
#micro-info .micro-latin{font-style:italic;opacity:.7;font-weight:400}
#micro-info .micro-meta{opacity:.8;font-size:11px}
#micro-info .micro-fact{margin-top:2px}
#microscope-panel .micro-read{flex:0 0 auto;align-self:flex-start;min-width:36px;min-height:32px}
.micro-bottom{grid-area:2/1;position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:3px 10px}
.micro-optics{flex:1 1 220px;display:flex;flex-direction:column;gap:3px;min-width:0}
#micro-powers{display:flex;gap:3px}
#microscope-panel #micro-powers button{flex:1 1 0;min-width:0;min-height:30px;padding:0 2px}
#microscope-panel #micro-powers button.active{background:rgba(120,190,255,.75);border-color:#cfe8ff;color:#06121f}
.micro-focus-wrap{display:flex;align-items:center;gap:6px;font-size:11px;min-width:0}
#micro-focus{flex:1;min-width:0;height:24px;margin:0;accent-color:#8fd0f5}
#micro-bar{flex:1 1 300px;display:flex;justify-content:center;gap:3px;min-width:0}
#microscope-panel .micro-tool{flex:1 1 0;min-width:0;max-width:64px;min-height:44px;padding:2px 1px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px}
#microscope-panel .micro-tool.off{opacity:.38;cursor:help}
.micro-ico{display:block;width:26px;height:26px;background:center/contain no-repeat;image-rendering:pixelated;font:700 13px/26px 'Consolas',monospace;text-align:center;white-space:nowrap}
.micro-glyph{font-size:20px}
.micro-cap{display:block;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:400 10px/1.1 system-ui,sans-serif}
.micro-pop{position:absolute;bottom:calc(100% + 5px);left:0;width:min(320px,100%);max-height:min(62vh,360px);box-sizing:border-box;display:none;flex-direction:column;gap:6px;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:rgba(16,22,34,.98);font-size:12px;line-height:1.32;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;z-index:2}
.micro-pop.visible{display:flex}
.micro-pop .micro-row{display:flex;flex-wrap:wrap;gap:5px}
.micro-pop .micro-row button{flex:1 1 auto;min-height:40px}
#microscope-panel .micro-choice{display:flex;align-items:center;gap:7px;width:100%;min-height:40px;text-align:left;font-weight:400;font-size:12px}
.micro-choice .micro-ico{flex:0 0 26px}
#micro-filters,#micro-stain-choices{display:flex;flex-direction:column;gap:4px}
#micro-stain-warn{color:#ffe9a8}
/* Wide screens: the field is as tall as the room below the title, on the left; all the rest is a column on the right,
   the description above and the controls at its foot. The column never gets narrower than 340px or 45% of the panel. */
@media (min-aspect-ratio:5/4){
#microscope-panel{max-width:1320px}
.micro-body{grid-template-columns:auto minmax(0,1fr);column-gap:10px}
.micro-stage{grid-area:1/1/3/2;width:min(100cqh,calc(100cqw - min(340px,45cqw) - 10px))}
#micro-readout{grid-area:1/2;display:flex;flex-direction:column;gap:6px;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;pointer-events:auto}
#micro-lines{position:static;flex:0 0 auto}
#micro-lines>div{background:rgba(255,255,255,.06)}
#micro-hint.visible{display:flex;flex-direction:column;gap:6px;margin:auto 0;padding:0 12px;text-align:center;font-size:13px;line-height:1.4}
#micro-hint-light{opacity:.65;font-size:12px}
#micro-hint-light:empty{display:none}
#micro-info{position:static;flex:0 0 auto;max-height:none;overflow:visible}
#micro-info.visible{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:4px 10px;align-items:start}
.micro-info-text{display:contents}
#micro-portrait{grid-area:1/1/3/2}
#micro-info .micro-name{grid-area:1/2}
#micro-info .micro-meta{grid-area:2/2}
#microscope-panel .micro-read{grid-area:1/3/3/4}
#micro-info .micro-fact{grid-column:1/-1}
.micro-bottom{grid-area:2/2;flex-direction:column;flex-wrap:nowrap;align-items:stretch;gap:5px}
.micro-optics,#micro-bar{flex:0 0 auto}
#microscope-panel .micro-tool{max-width:84px}
.micro-pop{max-height:min(62vh,360px,calc(100cqh - 116px))}
}
/* With height to spare (not a phone on its side) the description can be read from further away. */
@media (min-aspect-ratio:5/4) and (min-height:560px){
#micro-info{font-size:14px;line-height:1.42}
#micro-lines{font-size:13px}
#micro-portrait{flex-basis:96px;width:96px;height:96px}
#micro-info .micro-name{font-size:17px}
#micro-info .micro-meta{font-size:12.5px}
#micro-info .micro-fact{margin-top:6px}
}
`;

Object.assign(Game.prototype, {
    microscopeLoadPending() {
        this.microscopePending = new Map();
        this.microscopeNextSync = 0;
        try {
            const saved = JSON.parse(window.localStorage.getItem(MICROSCOPE_PENDING_KEY) || '[]');
            for (const entry of saved) {
                if (entry && entry.reqId && entry.took && entry.gives) this.microscopePending.set(entry.reqId, { took: entry.took, gives: entry.gives, op: entry.op, at: 0, ...(entry.plate ? { plate: entry.plate } : {}) });
            }
        } catch (_error) {
            // Nothing readable: nothing to resume.
        }
        this.microscopeMoveKnown();
    },

    microscopeSavePending() {
        try {
            const entries = [...this.microscopePending.entries()].map(([reqId, entry]) => ({ reqId, took: entry.took, gives: entry.gives, op: entry.op, ...(entry.plate ? { plate: entry.plate } : {}) }));
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
            this.receiveSystemMessage({ text: microscopeSay('notConnected') });
            return false;
        }
        const { took, gives } = microscopeRequestItems(op, source);
        for (const [type, count] of Object.entries(took)) {
            if (this.getInventoryCount(type) < count) return false;
        }
        // A culture plate goes on the stage as the one in the hand, named, and comes back as itself if refused
        // (js/game/plates.js). A plain one (no record yet) goes as any item.
        const plate = op === 'prepare' && this.plateHeld && plateIdentified(source) ? this.plateHeld(source) : null;
        if (plate) delete took[source];
        for (const [type, count] of Object.entries(took)) this.inventoryCounts[type] = this.getInventoryCount(type) - count;
        if (plate) this.plateTakeOut(source, plate.id);
        const reqId = this.storageNewRequestId();
        this.microscopePending.set(reqId, { took, gives, op, at: performance.now(), ...(plate ? { plate } : {}) });
        this.microscopeSavePending();
        this.microscopeInventoryChanged();
        this.network.send(message, { ...payload, reqId, ...(plate ? { plate: plate.id, token: plate.token } : {}) });
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
        // A plate refused comes back as itself; one taken off the stage comes back with its new token.
        if (pending.plate && !(outcome.amount > 0) && this.plateAdd) this.plateAdd(pending.plate);
        if (this.plateSettle) this.plateSettle(outcome.amount > 0 ? outcome : null, items, { front: true });
        for (const [type, count] of Object.entries(items)) {
            if (count > 0 && this.world.blockTypes[type]) this.addInventory(type, count);
        }
        this.microscopeInventoryChanged();
        if (outcome.amount > 0) {
            this.playPickupSound();
            if (pending.op === 'prepare') {
                const ready = MICRO_PLATES[outcome.type] ? microscopeSay('plateReady', this.microscopeName(outcome.type))
                    : microscopeSay('slideReady', outcome.type === 'cheek' ? microscopeSay('cheek') : this.microscopeName(outcome.type));
                // The panel may be waiting for the news of the slide, which can come after this.
                if (this.microscopeAsking) this.microscopeAsking.note = ready;
                this.microscopeNote = ready;
                this.microscopeRenderLines();
            }
            if (pending.op === 'sample') this.receiveSystemMessage({ text: microscopeSay('tookSample', this.microscopeName(outcome.type)) });
        } else if (pending.op === 'sample') {
            const why = { 'too far': 'sampleTooFar', 'not water': 'filterAim' }[outcome.reason] || 'sampleNeeds';
            this.receiveSystemMessage({ text: microscopeSay(why) });
        } else if (this.microscopeAt) {
            this.microscopeNote = microscopeRefusalLine(pending.op, outcome.reason);
            this.microscopeRenderLines();
        } else if (this.microscopeAsking && this.microscopeAsking.preparing) {
            this.microscopeStopAsking(microscopeRefusalLine(pending.op, outcome.reason));
        } else if (microscopeRefusalLine(pending.op, outcome.reason)) {
            // Nothing open to say it on (a slide that could not be taken off, say).
            this.receiveSystemMessage({ text: microscopeRefusalLine(pending.op, outcome.reason) });
        }
    },

    // ---- Taking samples ----

    microscopeTakeSample(hit, filter = null) {
        const water = this.bucketFindWater();
        let at = water;
        if (!at && hit && !filter) {
            const position = this.world.getBlockPositionFromIntersection(hit);
            if (position && this.world.getBlockTypeAt(position.x, position.y, position.z) === 'moss') at = position;
        }
        if (!at) {
            this.receiveSystemMessage({ text: microscopeSay(filter ? 'filterAim' : 'sampleAim') });
            return true;
        }
        if (!this.microscopeRequest('sampleTake', 'sample', { x: at.x, y: at.y, z: at.z, ...(filter ? { source: filter } : {}) }, filter)) return true;
        if (water) this.bucketAfterUse(at.x, at.y, at.z);
        else {
            this.playPlaceSound('moss');
            this.placeActionTimer = 0.35;
            this.showHitIndicator();
        }
        return true;
    },

    // ---- Opening and closing ----

    // A right click. The panel only exists with a slide on it, and only the server knows whether there is
    // one, so this asks, and the game goes on until the answer (microscopeOnContents). `held`: the item in
    // the hand, which decides what happens if the stage is free (microscopeOnFree).
    microscopeTryOpen(position, held = null) {
        const type = this.world.getBlockTypeAt(position.x, position.y, position.z);
        if (!type || storageBaseName(type) !== 'microscope') return false;
        if (!this.network || !this.network.connected) {
            this.receiveSystemMessage({ text: microscopeSay('notConnected') });
            return true;
        }
        if (this.microscopeAsking) return true;
        const at = { x: position.x, y: position.y, z: position.z };
        this.microscopeAsking = { ...at, held, preparing: false, note: '', at: performance.now() };
        this.network.send('storageOpen', at);
        return true;
    },

    // The stage is free: what is in the hand goes on a slide, a slide alone smears a cheek, and with anything
    // else there is no panel to open, only what to do.
    microscopeOnFree(asking) {
        const source = microscopeSourceHeld(asking.held);
        // A plate needs no slide: it goes on the stage itself.
        if (!MICRO_PLATES[source] && this.getInventoryCount('glass_slide') <= 0) {
            this.microscopeStopAsking(microscopeSay('needSlide'));
            return;
        }
        if (!source) {
            this.microscopeStopAsking(microscopeSay(this.touchControlsEnabled ? 'askHowTouch' : 'askHow'));
            return;
        }
        asking.preparing = true;
        if (!this.microscopeRequest('microscopePrepare', 'prepare', { x: asking.x, y: asking.y, z: asking.z, source }, source)) this.microscopeStopAsking('');
    },

    // No panel after all. Whatever opened since has its own conversation with the server.
    microscopeStopAsking(line) {
        this.microscopeAsking = null;
        if (this.network && this.network.connected && !this.storageAt) this.network.send('storageClose', {});
        if (line) this.receiveSystemMessage({ text: line });
    },

    microscopeShowPanel(asking) {
        this.microscopeBuildPanel();
        this.microscopeAt = { x: asking.x, y: asking.y, z: asking.z };
        this.microscopeContents = null;
        this.microscopeRev = -1;
        this.microscopePrep = null;
        this.microscopeOrganisms = [];
        this.microscopeScenery = [];
        this.microscopeSelected = null;
        // Someone's slide is there already: it is shown, never replaced.
        this.microscopeNote = asking.note || (!asking.preparing && microscopeSourceHeld(asking.held) ? microscopeSay('slideAlreadyOn') : '');
        this.microscopePower = this.microscopePower || 40;
        this.microscopeFocus = this.microscopeFocus ?? 0.5;
        this.microscopeStainAsked = null;
        this.microscopePop = null;
        this.microscopeStage = [0, 0];
        this.microscopeLightTimer = 0;
        this.microscopeOpenedAt = performance.now();
        this.stopMining();
        // Losing the pointer lock would otherwise open the pause menu.
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.microscopePanel.classList.add('visible');
        this.microscopeResizeField();
        this.microscopeReadLight();
        this.updatePointerLockHint();
    },

    // Taking the slide off is the end of looking: it comes back washed, and back to the game.
    microscopeTakeOff() {
        if (!this.microscopeAt || !this.microscopeRequest('microscopeClear', 'clear', { ...this.microscopeAt })) return;
        this.microscopePrep = null;
        this.microscopeClose();
    },

    microscopeClose() {
        if (!this.microscopeAt) return;
        // Once, the first time: what stays on a microscope goes on drying, for anyone.
        if (this.microscopePrep && !MICRO_PLATES[this.microscopePrep.source] && !this.microscopeToldKept) {
            this.microscopeToldKept = true;
            this.receiveSystemMessage({ text: microscopeSay('slideKept') });
        }
        this.microscopeAt = null;
        this.microscopeContents = null;
        this.microscopeClosePop();
        this.microscopePanel.classList.remove('visible');
        if (this.network && this.network.connected) this.network.send('storageClose', {});
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        this.recapturePointerLock();
        this.updatePointerLockHint();
    },

    // ---- Messages from the server ----

    microscopeOnContents(contents) {
        const asking = this.microscopeAsking;
        if (asking && contents && Array.isArray(contents.slots) && contents.x === asking.x && contents.y === asking.y && contents.z === asking.z) {
            if (!contents.microscope) {
                // Free, for the first time of asking; while preparing, its answer is on the way.
                if (!asking.preparing) this.microscopeOnFree(asking);
                return;
            }
            this.microscopeAsking = null;
            this.microscopeShowPanel(asking);
        }
        const at = this.microscopeAt;
        if (!at || !contents || !Array.isArray(contents.slots)) return;
        if (contents.x !== at.x || contents.y !== at.y || contents.z !== at.z) return;
        if (contents.rev < this.microscopeRev) return;
        this.microscopeRev = contents.rev;
        this.microscopeContents = contents;
        const prep = contents.microscope || null;
        // Taken off by someone else: with no slide there is no panel.
        if (!prep) {
            this.microscopePrep = null;
            this.microscopeClose();
            this.receiveSystemMessage({ text: microscopeSay('slideTakenOff') });
            return;
        }
        const before = this.microscopePrep;
        // Someone else may have stained it, or taken it off, while this was being asked.
        if (prep.stain) {
            this.microscopeStainAsked = null;
            if (this.microscopePop === 'stain') this.microscopePop = null;
        }
        const same = before && prep.source === before.source && prep.seed === before.seed && (prep.plate || '') === (before.plate || '');
        this.microscopePrep = prep;
        this.microscopeAgeAt = performance.now();
        if (!same) {
            const left = Math.max(0, (prep.tardigrades || 0) - (prep.taken || 0));
            // A culture plate shows what its record says is on it, as the incubator's lens does (js/game/cultures.js).
            this.microscopeOrganisms = prep.culture && typeof cultureStagePopulation === 'function'
                ? cultureStagePopulation(prep.culture, prep.seed)
                : microPopulate(prep.source, prep.seed, left);
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
        const asking = this.microscopeAsking;
        if (asking && where && where.x === asking.x && where.y === asking.y && where.z === asking.z) {
            this.microscopeAsking = null;
            this.receiveSystemMessage({ text: microscopeSay('refusedTooFar') });
            return;
        }
        const at = this.microscopeAt;
        if (at && where && where.x === at.x && where.y === at.y && where.z === at.z) this.microscopeClose();
    },

    // Seconds since the slide was last wetted, by the server's reckoning.
    microscopeAge() {
        // A plate's agar keeps it moist: it never dries on the stage.
        if (!this.microscopePrep || MICRO_PLATES[this.microscopePrep.source]) return 0;
        if (this.microscopePrep.stain) return this.microscopePrep.age;
        return this.microscopePrep.age + (performance.now() - this.microscopeAgeAt) / 1000;
    },

    // Seconds since a drop last ended a drought, or negative if none has.
    microscopeWoke() {
        if (!this.microscopePrep || !(this.microscopePrep.woke >= 0)) return -1;
        if (this.microscopePrep.stain) return this.microscopePrep.woke;
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
                    if (microscopeIsUnlitLamp(type) && !unlit) unlit = type;
                    if (!type || !world.isLightEmitterType(type)) continue;
                    const level = world.registry.lightLevel[world.registry.id(type)];
                    if (!lamp || level > lamp.level) {
                        const def = world.blockTypes[type];
                        lamp = { level, name: this.getBlockDisplayName(def.variantOf || type), type: def.variantOf || type };
                    }
                }
            }
        }
        // A light in the hand, held near it (js/game/offhand.js).
        const carried = this.carriedLampNear(at);
        if (carried && (!lamp || carried.level > lamp.level)) lamp = carried;
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
        const asking = this.microscopeAsking;
        if (asking && !this.isGameplayActive()) this.microscopeStopAsking('');
        else if (asking && now - asking.at > MICROSCOPE_ASK_MS) this.microscopeStopAsking(microscopeSay('askTimeout'));
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
            // The drop's icon follows the slide as it dries.
            if (this.microscopePrep && microSlideStage(this.microscopeAge(), this.microscopeWoke()) !== this.microscopeSlideStageShown) this.microscopeRenderTools();
            if (this.microscopeNote && now - this.microscopeNoteAt > MICROSCOPE_NOTE_MS) this.microscopeNote = '';
            this.microscopeRenderLines();
        }
        this.microscopeClock = (this.microscopeClock || 0) + delta;
        this.microscopeFrameLeft = (this.microscopeFrameLeft || 0) - delta;
        if (this.microscopeFrameLeft > 0) return;
        const step = Math.min(0.1, MICROSCOPE_FRAME - this.microscopeFrameLeft);
        this.microscopeFrameLeft = MICROSCOPE_FRAME;
        const world = { age: this.microscopeAge(), woke: this.microscopeWoke(), revived: Boolean(this.microscopePrep && this.microscopePrep.revived), organisms: this.microscopeOrganisms, stain: this.microscopeStain() };
        for (const org of this.microscopeOrganisms) microStep(org, step, world);
        this.microscopeDraw(world);
        this.microscopeRenderSelected();
    },

    microscopeView(world) {
        const radius = this.microscopeCanvas.width / 2;
        const light = this.microscopeLight;
        return {
            radius, power: this.microscopePower, scale: microscopeScale(this.microscopePower, radius),
            stageX: this.microscopeStage[0], stageY: this.microscopeStage[1], focus: this.microscopeFocus,
            light, t: this.microscopeClock || 0, age: world.age, revived: world.revived, selected: this.microscopeSelected,
            stain: world.stain,
            tint: microscopeFieldTint(light && light.source, this.microscopeFilter ? this.microscopeFilter.rgb : null),
            dark: this.microscopeDark && light ? microscopeDarkfieldGain(light.level) : 0
        };
    },

    // The stain on the slide, or an empty string.
    microscopeStain() {
        return (this.microscopePrep && this.microscopePrep.stain) || '';
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
            this.microscopeNote = microscopeSay('clickDark');
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
            this.microscopeNote = microscopeSay('tooSmall', this.microscopePower);
        } else if (verdict === 'blur') {
            this.microscopeNote = microscopeSay('outOfFocus');
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

    // An item's name as this panel says it. Only here: the inventory keeps calling it what it did.
    microscopeName(type) {
        return (gameLang() === 'ES' && microscopeItemNameEs(type)) || this.getBlockDisplayName(type);
    },

    // The language changed: what is on the panel changes now.
    microscopeOnLang() {
        if (!this.microscopePanel) return;
        this.microscopeWriteLabels();
        this.microscopeShownSpecies = null;
        this.microscopeRenderControls();
    },

    // The labels that are always the same, in the language of the game.
    microscopeWriteLabels() {
        const panel = this.microscopePanel;
        panel.querySelector('h3').textContent = microscopeSay('title');
        panel.querySelector('.micro-close').title = microscopeSay('close');
        panel.querySelector('.micro-focus-label').textContent = microscopeSay('focus');
        panel.querySelector('.micro-focus-wrap').title = microscopeSay('focusTip');
        panel.querySelectorAll('[data-power]').forEach((button) => { button.title = microscopeSay('powerTip', button.dataset.power); });
        panel.querySelector('.micro-read').title = microscopeSay('speciesGuideTip');
        panel.querySelector('#micro-hint-text').textContent = microscopeSay('fieldHint');
        panel.querySelector('.micro-tools-read').textContent = microscopeSay('toolsGuide');
        panel.querySelector('.micro-stain-read').textContent = microscopeSay('stainGuide');
        panel.querySelector('.micro-stain-no').textContent = microscopeSay('notThisSlide');
        panel.querySelector('#micro-stain-title').textContent = microscopeSay('stainAbout');
        for (const [name, caption] of Object.entries(MICROSCOPE_CAPTIONS)) {
            panel.querySelector(`.micro-${name}`).querySelector('.micro-cap').textContent = microscopeSay(caption);
        }
    },

    microscopeBuildPanel() {
        if (this.microscopePanel) return;
        const style = document.createElement('style');
        style.textContent = MICROSCOPE_CSS;
        document.head.appendChild(style);
        const panel = document.createElement('div');
        panel.id = 'microscope-panel';
        const tool = (name, glyph = '') => `<button type="button" class="micro-tool micro-${name}"><span class="micro-ico${glyph ? ' micro-glyph' : ''}">${glyph}</span><span class="micro-cap"></span></button>`;
        panel.innerHTML = `
            <div class="micro-head">
                <h3></h3>
                <div id="micro-light"></div>
                <button class="micro-close" type="button">✕</button>
            </div>
            <div class="micro-body">
                <div class="micro-stage">
                    <canvas id="micro-field" width="520" height="520"></canvas>
                    <div id="micro-center">
                        <div id="micro-dark-note"></div>
                    </div>
                </div>
                <div id="micro-readout">
                    <div id="micro-lines">
                        <div id="micro-slide-line"></div>
                        <div id="micro-tool-line"></div>
                        <div id="micro-note"></div>
                    </div>
                    <div id="micro-hint">
                        <div id="micro-hint-text"></div>
                        <div id="micro-hint-light"></div>
                    </div>
                    <div id="micro-info">
                        <canvas id="micro-portrait" width="168" height="168"></canvas>
                        <div class="micro-info-text">
                            <div class="micro-name"></div>
                            <div class="micro-meta"></div>
                            <div class="micro-fact"></div>
                            <div class="micro-state micro-fact"></div>
                        </div>
                        <button type="button" class="micro-read">📖</button>
                    </div>
                </div>
                <div class="micro-bottom">
                    <div id="micro-pop-stain" class="micro-pop">
                        <div id="micro-stain-title"></div>
                        <div id="micro-stain-choices">
                            ${Object.keys(MICRO_STAINS).map((stain) => `<button type="button" class="micro-choice micro-stain-${stain}"><span class="micro-ico"></span><span class="micro-choice-name"></span></button>`).join('')}
                        </div>
                        <div id="micro-stain-warn"></div>
                        <div class="micro-row" id="micro-stain-confirm">
                            <button type="button" class="micro-stain-yes"></button>
                            <button type="button" class="micro-stain-no"></button>
                        </div>
                        <button type="button" class="micro-stain-read" style="min-height:32px"></button>
                    </div>
                    <div id="micro-pop-filter" class="micro-pop">
                        <div id="micro-filters"></div>
                        <button type="button" class="micro-tools-read" style="min-height:32px"></button>
                    </div>
                    <div class="micro-optics">
                        <div id="micro-powers">
                            ${MICRO_MAGNIFICATIONS.map((power) => `<button type="button" data-power="${power}">${power}×</button>`).join('')}
                        </div>
                        <label class="micro-focus-wrap"><span class="micro-focus-label"></span><input id="micro-focus" type="range" min="0" max="100" step="1"></label>
                    </div>
                    <div id="micro-bar">
                        ${tool('clear')}${tool('drop')}${tool('capture')}${tool('stain')}${tool('filter')}${tool('dark')}${tool('guide', '📖')}
                    </div>
                </div>
            </div>`;
        document.body.appendChild(panel);
        this.microscopePanel = panel;
        this.microscopeWriteLabels();
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
        panel.querySelector('.micro-read').addEventListener('click', () => {
            if (this.microscopeSelected) this.microscopeOpenGuide(MICRO_SPECIES[this.microscopeSelected.species].page);
        });
        panel.querySelector('#micro-focus').addEventListener('input', (event) => this.microscopeSetFocus(Number(event.target.value) / 100));
        panel.querySelectorAll('[data-power]').forEach((button) => button.addEventListener('click', () => this.microscopeSetPower(Number(button.dataset.power))));
        this.microscopeBindTool('clear', () => this.microscopeTakeOff());
        this.microscopeBindTool('drop', () => this.microscopeSend('microscopeDrop', 'drop'));
        this.microscopeBindTool('capture', () => this.microscopeSend('microscopeCapture', 'capture'));
        this.microscopeBindTool('dark', () => this.microscopeToggleDark());
        this.microscopeBindTool('stain', () => this.microscopeTogglePop('stain'));
        this.microscopeBindTool('filter', () => this.microscopeTogglePop('filter'));
        this.microscopeBindTool('guide', () => this.microscopeOpenGuide(MICROSCOPE_GUIDE_PAGE));
        panel.querySelector('.micro-tools-read').addEventListener('click', () => this.microscopeOpenGuide(MICROSCOPE_LENS_PAGE));
        panel.querySelector('.micro-stain-read').addEventListener('click', () => this.microscopeOpenGuide(MICROSCOPE_STAIN_PAGE));
        for (const stain of Object.keys(MICRO_STAINS)) {
            panel.querySelector(`.micro-stain-${stain}`).addEventListener('click', () => this.microscopeAskStain(stain));
        }
        panel.querySelector('.micro-stain-yes').addEventListener('click', () => this.microscopeApplyStain());
        panel.querySelector('.micro-stain-no').addEventListener('click', () => {
            this.microscopeStainAsked = null;
            this.microscopeRenderControls();
        });
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
        // Escape closes an open popover first (microscopeEscape). E or Escape close it; arrows move the stage; nothing reaches the game.
        document.addEventListener('keydown', (event) => {
            if (!this.microscopeAt) return;
            event.stopImmediatePropagation();
            if (event.code === 'Escape' || event.code === 'KeyE') {
                event.preventDefault();
                if (!event.repeat && !(event.code === 'Escape' && this.microscopeEscape())) this.microscopeClose();
                return;
            }
            const pan = { ArrowLeft: [24, 0], ArrowRight: [-24, 0], ArrowUp: [0, 24], ArrowDown: [0, -24] }[event.code];
            if (pan) {
                event.preventDefault();
                this.microscopeMoveStage(pan[0], pan[1]);
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
            if (this.microscopePop) {
                this.microscopeClosePop();
                this.microscopeRenderControls();
            }
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
        const size = Math.max(240, Math.min(800, Math.round((box.width || 480) * ratio)));
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
        // The server would refuse it too; there is no point in taking the items out for that.
        if (this.microscopeStain() && (op === 'drop' || op === 'capture')) {
            this.microscopeNote = microscopeRefusalLine(op, 'stained');
            this.microscopeRenderLines();
            return;
        }
        this.microscopeRequest(message, op, { ...this.microscopeAt });
    },

    // ---- Stains ----

    // The first press only asks, in the popover: a stain cannot be undone.
    microscopeAskStain(stain) {
        if (!this.microscopeAt || !this.microscopePrep || this.microscopeStain() || !MICRO_STAINS[stain]) return;
        if (this.getInventoryCount(stain) <= 0) {
            this.microscopeNote = microscopeSay('stainNoBottle', microscopeStainText(stain).the, microscopeStainText(stain).gets);
            this.microscopeRenderLines();
            return;
        }
        this.microscopePop = 'stain';
        this.microscopeStainAsked = stain;
        this.microscopeRenderControls();
    },

    microscopeApplyStain() {
        const stain = this.microscopeStainAsked;
        this.microscopeClosePop();
        if (stain && this.microscopeAt && this.microscopePrep && !this.microscopeStain()) {
            this.microscopeRequest('microscopeStain', 'stain', { ...this.microscopeAt, source: stain }, stain);
        }
        this.microscopeRenderControls();
    },

    // ---- The popovers ----

    microscopeTogglePop(which) {
        const was = this.microscopePop;
        this.microscopeClosePop();
        if (was !== which) this.microscopePop = which;
        this.microscopeRenderControls();
    },

    microscopeClosePop() {
        this.microscopePop = null;
        this.microscopeStainAsked = null;
    },

    // Escape: what is open inside the panel goes first. Says whether there was anything.
    microscopeEscape() {
        if (!this.microscopePop) return false;
        this.microscopeClosePop();
        this.microscopeRenderControls();
        return true;
    },

    // A popover sits above its icon, as far along as it fits in the bar.
    microscopePlacePop(pop, name) {
        const button = this.microscopePanel.querySelector(`.micro-${name}`);
        const bar = this.microscopePanel.querySelector('.micro-bottom');
        const room = (bar.clientWidth || 0) - (pop.offsetWidth || 0);
        pop.style.left = `${Math.max(0, Math.min((button.offsetLeft || 0), room))}px`;
    },

    // ---- What this viewer puts in the light ----

    microscopeToggleDark() {
        if (!this.microscopeDark && this.getInventoryCount('darkfield_stop') <= 0) {
            this.microscopeNote = microscopeSay('darkNeedsStop');
            this.microscopeRenderLines();
            return;
        }
        this.microscopeDark = !this.microscopeDark;
        this.playTone({ frequency: 240, duration: 0.05, type: 'square', volume: 0.012, release: 0.05 });
        this.microscopeRenderControls();
    },

    // type: a filter the player carries, or null for none.
    microscopeSetFilter(type) {
        const rgb = type ? microscopeFilterColor(type, this.world.blockTypes) : null;
        if (type && (!rgb || this.getInventoryCount(type) <= 0)) return;
        this.microscopeFilter = type ? { type, rgb } : null;
        this.microscopeClosePop();
        this.microscopeRenderControls();
    },

    // What the player carries that can be a filter.
    microscopeFilterChoices() {
        return this.inventory.filter((type) => this.getInventoryCount(type) > 0 && microscopeFilterColor(type, this.world.blockTypes));
    },

    // A press on an icon: what it does, or if it cannot be used now, says why. That works on a touch screen,
    // which has no tooltips, as a disabled button would not.
    microscopeBindTool(name, action) {
        const button = this.microscopePanel.querySelector(`.micro-${name}`);
        button.addEventListener('click', () => {
            if (!button.dataset.reason) {
                action();
                return;
            }
            this.microscopeNote = button.dataset.reason;
            this.microscopeRenderLines();
        });
    },

    // One icon of the bar. reason greys it and says why. item: the game's own icon.
    microscopeSetTool(name, { reason = '', tip = '', active = false, item = null }) {
        const button = this.microscopePanel.querySelector(`.micro-${name}`);
        button.classList.toggle('off', Boolean(reason));
        button.classList.toggle('active', active);
        button.dataset.reason = reason;
        button.title = reason || tip;
        if (item) button.querySelector('.micro-ico').style.backgroundImage = `url(${this.world.getInventoryIconUrl(item)})`;
    },

    microscopeRenderTools() {
        const panel = this.microscopePanel;
        // What is no longer in the inventory is no longer in the light.
        if (this.microscopeDark && this.getInventoryCount('darkfield_stop') <= 0) this.microscopeDark = false;
        if (this.microscopeFilter && this.getInventoryCount(this.microscopeFilter.type) <= 0) this.microscopeFilter = null;
        const prep = this.microscopePrep;
        const stained = this.microscopeStain();

        // A plate on the stage is no slide: it comes back as it went, and takes no drop, stain or pipette.
        const plate = prep && MICRO_PLATES[prep.source] ? prep.source : null;
        this.microscopeSetTool('clear', { tip: microscopeSay(plate ? 'takeOffPlate' : 'takeOff'), item: plate || 'glass_slide' });
        const flasks = this.getInventoryCount('water_flask');
        // A drop is for a slide that is drying or dry: on a wet one it would only spend the flask.
        const stage = microSlideStage(this.microscopeAge(), this.microscopeWoke());
        this.microscopeSlideStageShown = stage;
        this.microscopeSetTool('drop', {
            tip: microscopeSay('dropReady'), item: 'water_flask',
            reason: plate ? microscopeSay('plateNoDrop') : stained ? microscopeSay('dropStained') : stage === 'wet' || stage === 'reviving' ? microscopeSay('dropStillWet') : flasks > 0 ? '' : microscopeSay('dropNeedsFlask')
        });
        // Its reason says nothing of what is on the slide: only the one in the ring can be drawn off.
        const tardigrade = Boolean(this.microscopeSelected) && this.microscopeSelected.species === 'tardigrade';
        const pipette = this.getInventoryCount('micropipette') > 0;
        const tube = this.getInventoryCount('test_tube') > 0;
        this.microscopeSetTool('capture', {
            tip: microscopeSay('captureReady'), item: 'micropipette',
            reason: plate ? microscopeSay('plateNoCapture') : !tardigrade ? microscopeSay('captureSelect') : stained ? microscopeSay('captureStained') : !pipette ? microscopeSay('captureNeedsPipette') : !tube ? microscopeSay('captureNeedsTube') : ''
        });
        const bottles = Object.keys(MICRO_STAINS).filter((stain) => this.getInventoryCount(stain) > 0);
        this.microscopeSetTool('stain', {
            tip: microscopeSay('stainTip'), active: this.microscopePop === 'stain' || Boolean(stained),
            item: stained || this.microscopeStainAsked || bottles[0] || 'iodine_tincture',
            reason: plate ? microscopeSay('plateNoStain') : stained ? microscopeSay('refusedStainTwice') : bottles.length ? '' : microscopeSay('stainNoneCarried')
        });
        const choices = this.microscopeFilterChoices();
        const filter = this.microscopeFilter;
        this.microscopeSetTool('filter', {
            tip: filter ? microscopeSay('filterIs', this.microscopeName(filter.type)) : microscopeSay('filterTip'),
            active: this.microscopePop === 'filter' || Boolean(filter), item: filter ? filter.type : choices[0] || 'cobalt_glass',
            reason: choices.length ? '' : microscopeSay('filterNoneCarried')
        });
        this.microscopeSetTool('dark', {
            tip: microscopeSay(this.microscopeDark ? 'darkOn' : 'darkOff'), active: Boolean(this.microscopeDark), item: 'darkfield_stop',
            reason: this.microscopeDark || this.getInventoryCount('darkfield_stop') > 0 ? '' : microscopeSay('darkNeedsStop')
        });
        this.microscopeSetTool('guide', { tip: microscopeSay('guideTip') });
        // A popover with nothing left to offer goes.
        if (this.microscopePop === 'stain' && (!prep || plate || stained || !bottles.length)) this.microscopeClosePop();
        if (this.microscopePop === 'filter' && !choices.length && !filter) this.microscopeClosePop();
        this.microscopeRenderFilters(choices);
        this.microscopeRenderStain(bottles);
    },

    // The filter's popover: none, and what the player carries.
    microscopeRenderFilters(choices) {
        const panel = this.microscopePanel;
        const pop = panel.querySelector('#micro-pop-filter');
        const open = this.microscopePop === 'filter';
        pop.classList.toggle('visible', open);
        if (!open) return;
        const list = panel.querySelector('#micro-filters');
        list.innerHTML = '';
        const row = (text, type, icon) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'micro-choice';
            button.classList.toggle('active', (this.microscopeFilter ? this.microscopeFilter.type : null) === type);
            const picture = document.createElement('span');
            picture.className = 'micro-ico';
            if (icon) picture.style.backgroundImage = `url(${icon})`;
            const name = document.createElement('span');
            name.textContent = text;
            button.appendChild(picture);
            button.appendChild(name);
            button.addEventListener('click', () => this.microscopeSetFilter(type));
            list.appendChild(button);
        };
        row(microscopeSay('none'), null, null);
        for (const type of choices) row(this.microscopeName(type), type, this.world.getInventoryIconUrl(type));
        this.microscopePlacePop(pop, 'filter');
    },

    // The stain's popover: only the bottles the player has, then the warning and the confirmation.
    microscopeRenderStain(bottles) {
        const panel = this.microscopePanel;
        const pop = panel.querySelector('#micro-pop-stain');
        const open = this.microscopePop === 'stain';
        pop.classList.toggle('visible', open);
        if (!open) return;
        const asked = this.microscopeStainAsked;
        for (const stain of Object.keys(MICRO_STAINS)) {
            const button = panel.querySelector(`.micro-stain-${stain}`);
            button.style.display = bottles.includes(stain) ? '' : 'none';
            button.classList.toggle('active', asked === stain);
            button.querySelector('.micro-choice-name').textContent = microscopeSay('stainCount', microscopeStainText(stain).name, this.getInventoryCount(stain));
            button.querySelector('.micro-ico').style.backgroundImage = `url(${this.world.getInventoryIconUrl(stain)})`;
        }
        panel.querySelector('#micro-stain-warn').textContent = asked ? microscopeStainWarning(asked) : '';
        panel.querySelector('#micro-stain-confirm').style.display = asked ? '' : 'none';
        if (asked) panel.querySelector('.micro-stain-yes').textContent = microscopeSay('stainIt', microscopeStainText(asked).the);
        this.microscopePlacePop(pop, 'stain');
    },

    // What changes rarely: which icons, who is in the ring.
    microscopeRenderControls() {
        const panel = this.microscopePanel;
        if (!panel || !this.microscopeAt) return;
        panel.querySelector('#micro-focus').value = Math.round(this.microscopeFocus * 100);
        panel.querySelectorAll('[data-power]').forEach((button) => button.classList.toggle('active', Number(button.dataset.power) === this.microscopePower));
        this.microscopeRenderTools();
        this.microscopeRenderLines();
        this.microscopeRenderInfo();
    },

    // The lines of text that follow the clock and the light.
    microscopeRenderLines() {
        const panel = this.microscopePanel;
        if (!panel || !this.microscopeAt) return;
        const light = this.microscopeLight;
        const dark = !light || light.level <= 0;
        const indicator = panel.querySelector('#micro-light');
        indicator.classList.toggle('off', dark);
        const darkLine = dark ? microscopeDarkLine(this.microscopeUnlit && this.microscopeName(this.microscopeUnlit)) : '';
        if (dark) {
            indicator.textContent = `⚠ ${microscopeSay('lightShortOff')}`;
            indicator.title = darkLine;
        } else if (light.source === 'sun') {
            indicator.textContent = `☀ ${microscopeSay('lightShortSun')}`;
            indicator.title = microscopeSay('lightSun');
        } else {
            indicator.textContent = `🕯 ${this.microscopeLightName()}`;
            indicator.title = microscopeSay('lightLamp', this.microscopeLightName());
        }
        // With nothing selected the column says what is catching the light; in the dark, the field already does.
        panel.querySelector('#micro-hint-light').textContent = dark ? '' : indicator.title;
        // How to light it is a lesson: it stays in the middle of the black field, in full.
        panel.querySelector('#micro-dark-note').textContent = darkLine;
        const prep = this.microscopePrep;
        panel.querySelector('#micro-slide-line').textContent = prep ? microscopeSlideLine(prep, this.microscopeAge(), this.microscopeWoke()) : '';
        const note = this.microscopeNote || '';
        if (note !== this.microscopeNoteShown) {
            this.microscopeNoteShown = note;
            this.microscopeNoteAt = performance.now();
        }
        panel.querySelector('#micro-note').textContent = note;
        // Dark-field first: how well it works is what changes as the light does.
        const tool = this.microscopeDark
            ? microscopeDarkfieldLine(light && { ...light, name: this.microscopeLightName() })
            : this.microscopeFilter ? microscopeFilterLine(this.microscopeName(this.microscopeFilter.type), this.microscopeFilter.rgb, this.microscopeStain()) : '';
        panel.querySelector('#micro-tool-line').textContent = tool;
    },

    // The name of what is lighting the mirror.
    microscopeLightName() {
        const light = this.microscopeLight;
        return light && light.type ? this.microscopeName(light.type) : (light && light.name) || '';
    },

    microscopeRenderInfo() {
        const panel = this.microscopePanel;
        const info = panel.querySelector('#micro-info');
        const org = this.microscopeSelected;
        info.classList.toggle('visible', Boolean(org));
        panel.querySelector('#micro-hint').classList.toggle('visible', !org);
        if (!org) {
            this.microscopeShownSpecies = null;
            return;
        }
        const def = MICRO_SPECIES[org.species];
        const stain = this.microscopeStain();
        const shown = `${org.species}|${stain}|${this.microscopeDark ? 1 : 0}`;
        if (this.microscopeShownSpecies !== shown) {
            this.microscopeShownSpecies = shown;
            const said = microscopeSpeciesText(org.species);
            info.querySelector('.micro-name').innerHTML = `${said.name} <span class="micro-latin">${def.latin}</span>`;
            info.querySelector('.micro-meta').textContent = `${said.size}. ${said.where}.`;
            info.querySelector('.micro-fact').textContent = said.fact;
            const portrait = panel.querySelector('#micro-portrait');
            microDrawPortrait(portrait.getContext('2d'), org.species, portrait.width, portrait.height, 1.3, { stain, dark: Boolean(this.microscopeDark) });
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
        const stain = this.microscopeStain();
        if (stain) text = microscopeStainNote(org.species, stain);
        else if (org.species === 'tardigrade') text = microscopeTardigradeLine(org);
        else if (microFate(org.species, age, revived) === 'cyst') text = microscopeSay('cyst');
        else if (microFate(org.species, age, revived) === 'dead') text = microscopeSay('deadDry');
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
        this.receiveSystemMessage({ text: microscopeSay('kitGiven') });
    }
});

registerModalPanel({
    isOpen() { return Boolean(this.microscopeAt); },
    close() { this.microscopeClose(); },
    escape() { return this.microscopeEscape(); }
});

// Before a chest would see it: the microscope has its own panel, not the panel of a chest.
ITEM_USE_HANDLERS.unshift(function (itemType, hit) {
    if (!hit || this.cameraController.isCrouching) return false;
    const position = this.world.getBlockPositionFromIntersection(hit);
    return Boolean(position) && this.microscopeTryOpen(position, itemType);
});

registerItemUseHandler(function (item, hit) {
    if (item === 'water_filter') return this.microscopeTakeSample(hit, 'water_filter');
    return item === 'test_tube' ? this.microscopeTakeSample(hit) : false;
});

registerGameContent(function () {
    this.microscopeLoadPending();
    onGameLangChange(() => this.microscopeOnLang());
});

registerFrameUpdate(function (delta) {
    this.microscopeUpdate(delta);
});
