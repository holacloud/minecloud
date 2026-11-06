// The small world: the organisms seen through the microscope (js/game/microscope.js), what each sample
// holds, how they move, and how they are drawn. Nothing here touches the game or the page, so it runs
// on any canvas (a portrait in a card, a page of the guide) and under Node.
// - These are not mobs: they live in MICRO_SPECIES, not MOB_SPECIES, and exist only on a slide.
// - A source (a sample, an item, a smear) fixes which species a slide holds; the seed the server gave
//   the slide fixes how many there are and where (microPopulate). Every viewer sees the same. How they
//   move afterwards (microStep) is each client's own and is not synchronised.
// - Each species has draw(ctx, t, st): it paints in units where the organism is 100 long, centred, with
//   its front towards +x. microDrawOrganism places one on a field, microDrawPortrait fills a canvas.
// - Sizes: `size` is the real one, in words. `drawn` is its length on the slide in micrometres, truer
//   for the larger animals and a little generous for the smallest, which would be single pixels.
// MICRO_SAMPLES and MICRO_ITEMS mirror sampleVariants and microscopeItems in pkg/network/microscope.go
// (test/js/microscope.test.js checks them).

const MICRO_MAGNIFICATIONS = [40, 100, 400];
// Screen pixels per micrometre at each magnification, for a field 300 pixels in radius.
const MICRO_SCALE = { 40: 0.15, 100: 0.375, 400: 1.5 };
// How far out of focus an organism still looks sharp: the depth of field shrinks as the power grows.
const MICRO_DEPTH_OF_FIELD = { 40: 0.5, 100: 0.26, 400: 0.13 };
// How far the stage can be moved from the middle of the slide, in micrometres.
const MICRO_SLIDE_RADIUS = 1300;

// Seconds a slide takes to dry, the last stretch in which a tardigrade curls up, and its coming back.
const MICRO_DRY_SECONDS = 240;
const MICRO_TUN_SECONDS = 35;
const MICRO_REVIVE_SECONDS = 20;

// ---------------------------------------------------------------------------------------
// What each source holds (mirrors of the server's tables)

const MICRO_SAMPLES = {
    forest_lake: [
        { letter: 'a', weight: 0.325, species: ['rotifer', 'paramecium', 'spirogyra', 'diatom'] },
        { letter: 'b', weight: 0.175, species: ['tardigrade', 'rotifer', 'spirogyra', 'diatom'] },
        { letter: 'c', weight: 0.325, species: ['water_flea', 'paramecium', 'vorticella', 'spirogyra'] },
        { letter: 'd', weight: 0.175, species: ['tardigrade', 'vorticella', 'paramecium', 'diatom'] }
    ],
    mountain_lake: [
        { letter: 'a', weight: 0.25, species: ['amoeba', 'diatom'] },
        { letter: 'b', weight: 0.25, species: ['tardigrade', 'diatom'] },
        { letter: 'c', weight: 0.25, species: ['diatom'] },
        { letter: 'd', weight: 0.25, species: ['tardigrade', 'amoeba', 'diatom'] }
    ],
    plains_lake: [
        { letter: 'a', weight: 0.25, species: ['paramecium', 'euglena', 'cyanobacteria'] },
        { letter: 'b', weight: 0.25, species: ['water_flea', 'spirogyra', 'paramecium'] },
        { letter: 'c', weight: 0.25, species: ['amoeba', 'euglena', 'cyanobacteria'] },
        { letter: 'd', weight: 0.25, species: ['water_flea', 'amoeba', 'spirogyra'] }
    ],
    oasis: [
        { letter: 'a', weight: 0.25, species: ['euglena', 'cyanobacteria'] },
        { letter: 'b', weight: 0.25, species: ['euglena'] },
        { letter: 'c', weight: 0.25, species: ['cyanobacteria'] },
        { letter: 'd', weight: 0.25, species: ['cyanobacteria', 'euglena'] }
    ],
    moss: [
        { letter: 'a', weight: 0.2, species: ['tardigrade', 'rotifer', 'plant_cell'] },
        { letter: 'b', weight: 0.4, species: ['rotifer', 'plant_cell'] },
        { letter: 'c', weight: 0.2, species: ['tardigrade', 'plant_cell'] },
        { letter: 'd', weight: 0.2, species: ['tardigrade', 'rotifer'] }
    ]
};

// How each habitat's samples are called.
const MICRO_HABITAT_NAMES = {
    forest_lake: 'Forest Lake', mountain_lake: 'Mountain Lake', plains_lake: 'Plains Lake', oasis: 'Oasis', moss: 'Moss'
};

const MICRO_ITEMS = {
    cheek: ['animal_cell'],
    raw_fish: ['animal_cell'],
    dirt: ['soil_bacteria'],
    flower_red: ['yeast'],
    flower_yellow: ['yeast'],
    honeycomb: ['yeast'],
    milk: ['lactobacillus'],
    cheese: ['lactobacillus'],
    mushroom_red: ['mushroom_spore'],
    mushroom_brown: ['mushroom_spore'],
    wheat: ['plant_cell'],
    leaves: ['plant_cell'],
    spruce_leaves: ['plant_cell'],
    birch_leaves: ['plant_cell'],
    jungle_leaves: ['plant_cell'],
    dark_oak_leaves: ['plant_cell'],
    acacia_leaves: ['plant_cell'],
    cherry_leaves: ['plant_cell'],
    maple_leaves: ['plant_cell'],
    willow_leaves: ['plant_cell'],
    sample_still_water: ['soil_bacteria'],
    tardigrade_tube: ['tardigrade'],
    tardigrade_tun: ['tardigrade']
};
const MICRO_WOOL_SPECIES = ['soil_bacteria'];

// What lies on the slide with them and is not alive: only scenery.
const MICRO_MATERIALS = { dirt: 'grains', honeycomb: 'pollen', milk: 'fat', cheese: 'fat', wheat: 'starch' };

// A sample's item id for a habitat and letter.
function microSampleId(habitat, letter) {
    return `sample_${habitat}_${letter}`;
}

// The species a source holds, or null if it cannot go on a slide.
function microSpeciesOf(source) {
    if (MICRO_ITEMS[source]) return MICRO_ITEMS[source];
    if (/^[a-z_]+_wool$/.test(source)) return MICRO_WOOL_SPECIES;
    for (const [habitat, variants] of Object.entries(MICRO_SAMPLES)) {
        for (const variant of variants) {
            if (source === microSampleId(habitat, variant.letter)) return variant.species;
        }
    }
    return null;
}

// Whether a tube of this source comes back empty when it goes on a slide.
function microSourceInTube(source) {
    return source.startsWith('sample_') || source === 'tardigrade_tube' || source === 'tardigrade_tun';
}

// ---------------------------------------------------------------------------------------
// Small tools

function microRng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let z = a;
        z = Math.imul(z ^ (z >>> 15), z | 1);
        z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
        return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
}

function microLerp(a, b, t) {
    return a + (b - a) * t;
}

function microClamp01(value) {
    return Math.max(0, Math.min(1, value));
}

// A closed smooth curve through the points.
function microSmooth(ctx, points) {
    const n = points.length;
    ctx.beginPath();
    ctx.moveTo((points[n - 1][0] + points[0][0]) / 2, (points[n - 1][1] + points[0][1]) / 2);
    for (let i = 0; i < n; i++) {
        const next = points[(i + 1) % n];
        ctx.quadraticCurveTo(points[i][0], points[i][1], (points[i][0] + next[0]) / 2, (points[i][1] + next[1]) / 2);
    }
    ctx.closePath();
}

// An open smooth curve through the points.
function microCurve(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length - 1; i++) {
        ctx.quadraticCurveTo(points[i][0], points[i][1], (points[i][0] + points[i + 1][0]) / 2, (points[i][1] + points[i + 1][1]) / 2);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last[0], last[1]);
}

function microOval(ctx, x, y, rx, ry, rotation = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
}

function microFill(ctx, color) {
    ctx.fillStyle = color;
    ctx.fill();
}

function microStroke(ctx, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
}

// The speckles of a cell's inside, fixed for each seed.
function microGranules(ctx, seed, count, rx, ry, color, size) {
    const random = microRng(seed);
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2;
        const r = Math.sqrt(random());
        const dot = size * (0.6 + random() * 0.8);
        ctx.beginPath();
        ctx.ellipse(Math.cos(angle) * r * rx, Math.sin(angle) * r * ry, dot, dot, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ---------------------------------------------------------------------------------------
// The tardigrade

// The legs, as pure numbers: eight stubby ones, three pairs along the sides and a fourth at the back
// pointing backwards, each with four claws. `phase` runs the waves along the body, `unfold` is 1 when
// walking and 0 when they are pulled in. Exactly what is drawn (and tested).
function tardigradeLegs(phase, unfold = 1) {
    const legs = [];
    const anchors = [[25, 16], [6, 18.5], [-14, 18.5], [-40, 12]];
    for (const side of [1, -1]) {
        anchors.forEach(([x, y], pair) => {
            const wave = phase + pair * 1.15 + (side > 0 ? 0 : Math.PI);
            const swing = Math.sin(wave);
            const lift = Math.max(0, Math.cos(wave));
            const rear = pair === 3;
            const reach = (rear ? 11 : 12.5) * unfold * (1 - lift * 0.22);
            const tipX = x + (rear ? -reach * 0.92 : swing * 6 * unfold);
            const tipY = side * (y + (rear ? reach * 0.45 + swing * 2 * unfold : reach));
            const pointing = Math.atan2(tipY - side * y, tipX - x);
            const claws = [-0.62, -0.2, 0.2, 0.62].map((spread) => ({
                angle: pointing + spread,
                x: tipX + Math.cos(pointing + spread) * 4.2 * unfold,
                y: tipY + Math.sin(pointing + spread) * 4.2 * unfold
            }));
            legs.push({ side, pair, x, y: side * y, tipX, tipY, lift, claws });
        });
    }
    return legs;
}

// The half width of the body at x (from -50 at the back to +50 at the snout): five rounded segments
// with folds between them, as the plates of the cuticle make.
function tardigradeWidth(x) {
    const u = (x + 50) / 100;
    const shape = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 2.8)));
    const folds = 1 + 0.07 * Math.cos(u * Math.PI * 10);
    return 21 * shape * folds * (u > 0.78 ? microLerp(1, 0.8, (u - 0.78) / 0.22) : 1);
}

function microGutColor(gut, alpha) {
    const r = Math.round(microLerp(176, 74, gut));
    const g = Math.round(microLerp(128, 148, gut));
    const b = Math.round(microLerp(70, 58, gut));
    return `rgba(${r},${g},${b},${alpha})`;
}

function tardigradeOutline(ctx, shrink, widen) {
    const top = [];
    const bottom = [];
    for (let x = -50; x <= 50; x += 2.5) {
        const w = tardigradeWidth(x) * widen;
        top.push([x * shrink, -w]);
        bottom.unshift([x * shrink, w]);
    }
    microSmooth(ctx, [...top, ...bottom]);
}

function tardigradeDrawLeg(ctx, leg, alpha, dead) {
    ctx.lineCap = 'round';
    // The lobe: a stubby, soft cylinder, wider at its root.
    const mx = (leg.x + leg.tipX) / 2;
    const my = (leg.y + leg.tipY) / 2;
    const dx = leg.tipX - leg.x;
    const dy = leg.tipY - leg.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    microSmooth(ctx, [
        [leg.x + nx * 7, leg.y + ny * 7], [mx + nx * 6, my + ny * 6], [leg.tipX + nx * 4, leg.tipY + ny * 4],
        [leg.tipX + dx / length * 2.4, leg.tipY + dy / length * 2.4],
        [leg.tipX - nx * 4, leg.tipY - ny * 4], [mx - nx * 6, my - ny * 6], [leg.x - nx * 7, leg.y - ny * 7]
    ]);
    microFill(ctx, dead ? `rgba(180,172,150,${alpha})` : `rgba(214,190,146,${alpha})`);
    microStroke(ctx, `rgba(102,78,46,${alpha})`, 0.9);
    // Fold rings across the lobe.
    ctx.strokeStyle = `rgba(112,86,52,${alpha * 0.6})`;
    ctx.lineWidth = 0.5;
    for (const along of [0.35, 0.66]) {
        const cx = leg.x + dx * along;
        const cy = leg.y + dy * along;
        ctx.beginPath();
        ctx.moveTo(cx + nx * 5.4, cy + ny * 5.4);
        ctx.lineTo(cx - nx * 5.4, cy - ny * 5.4);
        ctx.stroke();
    }
    // Four hooked claws.
    ctx.strokeStyle = `rgba(52,40,26,${Math.min(1, alpha + 0.25)})`;
    ctx.lineWidth = 0.95;
    for (const claw of leg.claws) {
        const midX = (leg.tipX + claw.x) / 2 + Math.cos(claw.angle + Math.PI / 2) * 1.1;
        const midY = (leg.tipY + claw.y) / 2 + Math.sin(claw.angle + Math.PI / 2) * 1.1;
        ctx.beginPath();
        ctx.moveTo(leg.tipX, leg.tipY);
        ctx.quadraticCurveTo(midX, midY, claw.x, claw.y);
        ctx.stroke();
    }
}

// st: phase (of the walk), unfold (1 walking, 0 a tun), gut (0 pale, 1 full of green), stylet (0 in,
// 1 out and piercing), seed (its speckles).
function microDrawTardigrade(ctx, t, st = {}) {
    const unfold = microClamp01(st.unfold ?? 1);
    const phase = st.phase ?? t * 3.2;
    const gut = microClamp01(st.gut ?? 0);
    const seed = st.seed ?? 7;
    const shrink = microLerp(0.6, 1, unfold);
    const widen = microLerp(1.34, 1, unfold);
    const dead = Boolean(st.dead);

    // Legs below the body: shrinking towards it as they are drawn in.
    if (unfold > 0.04) {
        ctx.save();
        ctx.scale(shrink, widen);
        for (const leg of tardigradeLegs(phase, unfold)) tardigradeDrawLeg(ctx, leg, 0.5 + unfold * 0.42, dead);
        ctx.restore();
    }

    // The body: glassy, with the thicker cuticle showing at its edge.
    tardigradeOutline(ctx, shrink, widen);
    const body = ctx.createLinearGradient(0, -20 * widen, 0, 20 * widen);
    body.addColorStop(0, dead ? 'rgba(150,146,126,0.58)' : 'rgba(198,170,120,0.62)');
    body.addColorStop(0.5, dead ? 'rgba(198,194,170,0.42)' : 'rgba(238,222,178,0.42)');
    body.addColorStop(1, dead ? 'rgba(150,146,126,0.58)' : 'rgba(192,162,112,0.62)');
    ctx.fillStyle = body;
    ctx.fill();
    microStroke(ctx, 'rgba(92,70,42,0.85)', 1.1);

    ctx.save();
    tardigradeOutline(ctx, shrink, widen);
    ctx.clip();

    // The folds between segments, across the back.
    ctx.lineCap = 'round';
    for (const fold of [-30, -10, 10, 28]) {
        const x = fold * shrink;
        const w = tardigradeWidth(fold) * widen;
        ctx.beginPath();
        ctx.moveTo(x - 1.2, -w);
        ctx.quadraticCurveTo(x + 2.4, 0, x - 1.2, w);
        microStroke(ctx, 'rgba(116,90,56,0.42)', 1);
    }
    // A tun's skin is wrinkled all over.
    if (unfold < 0.7) {
        const wrinkles = 1 - unfold / 0.7;
        ctx.globalAlpha *= wrinkles;
        const random = microRng(seed + 5);
        for (let i = 0; i < 26; i++) {
            const x = (random() * 92 - 46) * shrink;
            const y = (random() * 44 - 22) * widen;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.quadraticCurveTo(x + 3, y + 2 - random() * 4, x + 3 + random() * 7, y + random() * 3 - 1.5);
            microStroke(ctx, 'rgba(84,64,38,0.42)', 0.8);
        }
        ctx.globalAlpha /= wrinkles;
    }

    // The gut, a broad dark sac the whole way back; a meal dyes it green from the front.
    const gutPoints = [];
    const gutEnd = (x) => Math.sqrt(Math.max(0, 1 - Math.pow((x + 12) / 28, 4)));
    for (let x = -40; x <= 16; x += 4) gutPoints.push([x * shrink, -(9 + 2 * Math.sin((x + 36) * 0.4)) * gutEnd(x) * widen]);
    for (let x = 16; x >= -40; x -= 4) gutPoints.push([x * shrink, (9 + 2 * Math.cos((x + 36) * 0.36)) * gutEnd(x) * widen]);
    microSmooth(ctx, gutPoints);
    const gutFill = ctx.createLinearGradient(14 * shrink, 0, -38 * shrink, 0);
    gutFill.addColorStop(0, microGutColor(gut, 0.72));
    gutFill.addColorStop(Math.max(0.01, gut), microGutColor(gut, 0.66));
    gutFill.addColorStop(1, microGutColor(gut * 0.35, 0.56));
    ctx.fillStyle = gutFill;
    ctx.fill();
    microStroke(ctx, 'rgba(90,70,40,0.35)', 0.7);

    // Storage cells: round, pale, floating in the body fluid.
    const random = microRng(seed);
    for (let i = 0; i < 46; i++) {
        const x = random() * 84 - 44;
        const w = tardigradeWidth(x) * 0.86;
        const y = (random() * 2 - 1) * w;
        const r = 0.55 + random() * 0.95;
        const drift = st.still ? 0 : Math.sin(t * 0.9 + i) * 0.5;
        microOval(ctx, (x + drift) * shrink, (y + drift * 0.6) * widen, r, r);
        microFill(ctx, 'rgba(250,240,208,0.55)');
        microStroke(ctx, 'rgba(120,96,60,0.4)', 0.35);
    }
    ctx.restore();

    // The head: a round muscular pharynx with its rods, the tube and the two stylets. A tun hides them.
    ctx.save();
    ctx.globalAlpha *= microLerp(0.3, 1, unfold);
    const head = 31 * shrink;
    microOval(ctx, head - 1, 0, 5.6 * shrink, 5.0 * widen);
    microFill(ctx, 'rgba(146,108,64,0.72)');
    microStroke(ctx, 'rgba(70,50,28,0.7)', 0.6);
    ctx.strokeStyle = 'rgba(60,42,22,0.75)';
    ctx.lineWidth = 0.55;
    for (const bar of [-0.5, 0, 0.5]) {
        ctx.beginPath();
        ctx.moveTo(head - 3.6 * shrink, bar * 6 * widen);
        ctx.lineTo(head + 1.8 * shrink, bar * 6 * widen);
        ctx.stroke();
    }
    const snout = 49 * shrink;
    const stylet = microClamp01(st.stylet ?? 0) * (st.still ? 0 : 0.5 + 0.5 * Math.abs(Math.sin(t * 6)));
    ctx.beginPath();
    ctx.moveTo(head + 4.2 * shrink, 0);
    ctx.lineTo(snout, 0);
    microStroke(ctx, 'rgba(62,44,24,0.78)', 1.1);
    ctx.strokeStyle = 'rgba(44,30,16,0.85)';
    ctx.lineWidth = 0.55;
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(head + 5 * shrink, side * 2.2 * widen);
        ctx.lineTo(snout + stylet * 7, side * 0.45);
        ctx.stroke();
    }
    // Eyespots, dark, on either side of the head.
    if (unfold > 0.2) {
        for (const side of [-1, 1]) {
            microOval(ctx, 40 * shrink, side * 8 * widen, 1.3, 1.05);
            microFill(ctx, 'rgba(32,22,18,0.88)');
        }
    }
    ctx.restore();
}

// The cuticle it has walked out of, with its eggs inside: moulting and laying are one thing here.
function microDrawTardigradeMolt(ctx, t, st = {}) {
    for (const leg of tardigradeLegs(st.phase ?? 0.8, 0.82)) tardigradeDrawLeg(ctx, leg, 0.24, true);
    tardigradeOutline(ctx, 1, 1);
    microFill(ctx, 'rgba(226,220,196,0.2)');
    microStroke(ctx, 'rgba(120,108,84,0.55)', 0.9);
    for (const fold of [-30, -10, 10, 28]) {
        const w = tardigradeWidth(fold);
        ctx.beginPath();
        ctx.moveTo(fold - 1, -w);
        ctx.quadraticCurveTo(fold + 2, 0, fold - 1, w);
        microStroke(ctx, 'rgba(120,108,84,0.3)', 0.7);
    }
    const random = microRng(st.seed ?? 3);
    const eggs = st.eggs ?? 5;
    for (let i = 0; i < eggs; i++) {
        const x = -30 + (i + random() * 0.6) * (56 / eggs);
        const y = (random() - 0.5) * 16;
        microOval(ctx, x, y, 6.2, 4.8, random() * 3);
        microFill(ctx, 'rgba(232,206,142,0.88)');
        microStroke(ctx, 'rgba(112,82,36,0.8)', 0.7);
        microOval(ctx, x - 0.8, y - 0.8, 2.6, 1.9);
        microFill(ctx, 'rgba(180,142,76,0.6)');
    }
}

// ---------------------------------------------------------------------------------------
// The other animals

// A bdelloid rotifer: the two discs of its crown spin, the jaws chew, the foot grips and the body
// stretches and shortens like a telescope.
function microDrawRotifer(ctx, t, st = {}) {
    const stretch = st.still ? 1 : 1 + Math.sin(t * 0.8 + (st.seed ?? 0)) * 0.1;
    ctx.save();
    ctx.scale(stretch, 2 - stretch);
    const rings = [[-50, 2.2], [-44, 3], [-37, 4.6], [-28, 7], [-16, 10.5], [-2, 14], [12, 15], [22, 12.5], [29, 8.5], [34, 9.5]];
    const top = rings.map(([x, w]) => [x, -w]);
    const bottom = rings.slice().reverse().map(([x, w]) => [x, w]);
    microSmooth(ctx, [...top, ...bottom]);
    const body = ctx.createLinearGradient(0, -14, 0, 14);
    body.addColorStop(0, 'rgba(198,190,142,0.62)');
    body.addColorStop(0.5, 'rgba(236,232,194,0.44)');
    body.addColorStop(1, 'rgba(194,186,138,0.62)');
    ctx.fillStyle = body;
    ctx.fill();
    microStroke(ctx, 'rgba(92,86,48,0.82)', 1);
    // The false rings of its telescoping trunk and foot.
    ctx.lineWidth = 0.55;
    ctx.strokeStyle = 'rgba(100,92,56,0.5)';
    for (const [x, w] of rings.slice(1, -2)) {
        ctx.beginPath();
        ctx.moveTo(x, -w);
        ctx.quadraticCurveTo(x + 1.4, 0, x, w);
        ctx.stroke();
    }
    // Stomach, the eaten green, and glands.
    microOval(ctx, -5, 0, 14, 7.5);
    microFill(ctx, 'rgba(146,158,84,0.62)');
    microOval(ctx, -20, 0, 6.5, 3.8);
    microFill(ctx, 'rgba(164,142,84,0.5)');
    // The jaws (mastax), two teeth that chew all the time.
    const chew = st.still ? 0.4 : (Math.sin(t * 9) + 1) / 2;
    microOval(ctx, 14, 0, 5.4, 5);
    microFill(ctx, 'rgba(152,124,76,0.72)');
    microStroke(ctx, 'rgba(70,52,30,0.72)', 0.5);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = 'rgba(44,32,18,0.9)';
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(11, side * (0.8 + chew));
        ctx.lineTo(17, side * (0.2 + chew * 0.5));
        ctx.stroke();
    }
    // Two toes and a spur.
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-49, side * 1);
        ctx.lineTo(-54, side * 3.2);
        microStroke(ctx, 'rgba(92,86,48,0.82)', 1.2);
    }
    // The two wheels of the crown.
    for (const side of [-1, 1]) {
        const cx = 39;
        const cy = side * 9.5;
        ctx.beginPath();
        ctx.moveTo(30, side * 3);
        ctx.quadraticCurveTo(33, cy, cx - 2, cy);
        microStroke(ctx, 'rgba(92,86,48,0.7)', 1.6);
        microOval(ctx, cx, cy, 9.5, 9.5);
        microFill(ctx, 'rgba(234,232,200,0.46)');
        microStroke(ctx, 'rgba(92,86,48,0.8)', 0.8);
        // The cilia beat one after another, which the eye reads as a wheel turning.
        const turn = st.still ? 0 : t * 8 * side;
        ctx.strokeStyle = 'rgba(70,64,36,0.8)';
        ctx.lineWidth = 0.6;
        for (let i = 0; i < 18; i++) {
            const angle = (i / 18) * Math.PI * 2;
            const bend = angle + 0.65;
            const pulse = st.still ? 0.3 : (Math.sin(i * 1.05 - turn) + 1) / 2;
            const length = 2.2 + pulse * 3.4;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * 9.5, cy + Math.sin(angle) * 9.5);
            ctx.lineTo(cx + Math.cos(bend) * (9.5 + length), cy + Math.sin(bend) * (9.5 + length));
            ctx.stroke();
        }
    }
    ctx.restore();
}

// A water flea (Daphnia), seen from the side: see-through, with its great black eye, its branched
// antennae that row it along in jumps, its gut, its beating heart and its eggs.
function microDrawWaterFlea(ctx, t, st = {}) {
    const row = st.still ? -0.2 : Math.sin(t * 7) * 0.45;
    // The carapace, with the long spine at the back.
    const shell = [[30, -22], [12, -31], [-12, -30], [-30, -22], [-41, -6], [-50, 13], [-37, 11], [-26, 25], [-4, 32], [16, 28], [28, 16], [33, 0]];
    microSmooth(ctx, shell);
    const fill = ctx.createRadialGradient(-2, 0, 6, -2, 0, 40);
    fill.addColorStop(0, 'rgba(232,226,176,0.36)');
    fill.addColorStop(1, 'rgba(182,178,120,0.52)');
    ctx.fillStyle = fill;
    ctx.fill();
    microStroke(ctx, 'rgba(84,80,40,0.82)', 1.1);
    // The net pattern of the shell.
    ctx.save();
    microSmooth(ctx, shell);
    ctx.clip();
    ctx.lineWidth = 0.28;
    ctx.strokeStyle = 'rgba(84,80,40,0.28)';
    for (let i = -4; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-14 + i * 11, -34);
        ctx.lineTo(14 + i * 11, 34);
        ctx.moveTo(14 + i * 11, -34);
        ctx.lineTo(-14 + i * 11, 34);
        ctx.stroke();
    }
    ctx.restore();
    // The head and its beak.
    microSmooth(ctx, [[26, -22], [37, -24], [46, -16], [47, -6], [43, 2], [39, 8], [32, 4], [26, -6]]);
    microFill(ctx, 'rgba(216,212,164,0.56)');
    microStroke(ctx, 'rgba(84,80,40,0.82)', 1);
    // The gut, curling down from the head, dark with green food.
    microCurve(ctx, [[34, -8], [18, -14], [-6, -14], [-26, -6], [-34, 6]]);
    microStroke(ctx, 'rgba(92,120,46,0.82)', 5);
    ctx.lineCap = 'round';
    microCurve(ctx, [[34, -8], [18, -14], [-6, -14], [-26, -6], [-34, 6]]);
    microStroke(ctx, 'rgba(136,160,70,0.42)', 2);
    // The eggs in the brood pouch, under the back of the shell.
    const random = microRng(st.seed ?? 2);
    for (let i = 0; i < 4; i++) {
        microOval(ctx, -19 + i * 8.5, -23 + random() * 2.5, 4.2, 3.6);
        microFill(ctx, 'rgba(198,150,70,0.72)');
        microStroke(ctx, 'rgba(110,76,30,0.62)', 0.45);
    }
    // The heart: it visibly beats, several times a second.
    const beat = st.still ? 0.8 : 0.82 + 0.3 * Math.pow(Math.max(0, Math.sin(t * 16)), 2);
    microOval(ctx, 16, -23, 4.2 * beat, 3.3 * beat);
    microFill(ctx, 'rgba(198,84,62,0.74)');
    microStroke(ctx, 'rgba(120,46,30,0.72)', 0.45);
    // The legs, fanning food in.
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
        const fan = st.still ? 0 : Math.sin(t * 12 + i * 0.9) * 2.4;
        const x = 8 - i * 8;
        ctx.beginPath();
        ctx.moveTo(x, 5);
        ctx.quadraticCurveTo(x - 1 + fan / 2, 16, x - 4 + fan, 24);
        microStroke(ctx, 'rgba(100,96,50,0.64)', 1.4);
    }
    // The eye: a black ball of lenses, which trembles.
    const tremble = st.still ? 0 : Math.sin(t * 13) * 0.8;
    microOval(ctx, 38 + tremble * 0.3, -14, 7, 7);
    microFill(ctx, 'rgba(20,18,22,0.96)');
    ctx.fillStyle = 'rgba(160,180,210,0.55)';
    for (let i = 0; i < 9; i++) {
        const angle = (i / 9) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(38 + tremble * 0.3 + Math.cos(angle) * 5.4, -14 + Math.sin(angle) * 5.4, 0.8, 0, Math.PI * 2);
        ctx.fill();
    }
    // The second antennae: its oars, two branches with bristles, from behind the head.
    ctx.lineCap = 'round';
    const base = [28, -12];
    for (const branch of [-1, 1]) {
        const swing = row + branch * 0.22 - 0.48;
        const elbow = [base[0] - 6, base[1] - 12 + row * 3];
        const tip = [elbow[0] - Math.cos(swing) * 24, elbow[1] + Math.sin(swing) * 24];
        ctx.beginPath();
        ctx.moveTo(base[0], base[1]);
        ctx.lineTo(elbow[0], elbow[1]);
        ctx.lineTo(tip[0], tip[1]);
        microStroke(ctx, 'rgba(96,90,46,0.86)', 2.1);
        ctx.strokeStyle = 'rgba(96,90,46,0.5)';
        ctx.lineWidth = 0.45;
        for (let k = 0.35; k <= 1; k += 0.13) {
            const x = microLerp(elbow[0], tip[0], k);
            const y = microLerp(elbow[1], tip[1], k);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 5, y - 7);
            ctx.stroke();
        }
    }
}

// ---------------------------------------------------------------------------------------
// The single cells that hunt and swim

function microCilia(ctx, outline, t, color, length, still) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.55;
    outline.forEach(([x, y, nx, ny], i) => {
        const beat = still ? 0.2 : Math.sin(t * 13 - i * 0.55);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + nx * length - ny * beat * 2, y + ny * length + nx * beat * 2);
        ctx.stroke();
    });
}

// A paramecium: a slipper, furred with cilia in waves, with its groove, its great nucleus, its two
// star-shaped water pumps and the bubbles of what it has eaten.
function microDrawParamecium(ctx, t, st = {}) {
    const outline = [];
    const points = [];
    for (let i = 0; i < 56; i++) {
        const angle = (i / 56) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        // Blunt in front, a little pointed behind; the groove bites into one side.
        const rx = 50 * (cos > 0 ? 0.96 : 1);
        const ry = 19 * (1 + 0.14 * cos) - (sin > 0 && cos > -0.1 && cos < 0.8 ? 5 * Math.sin((cos + 0.1) / 0.9 * Math.PI) : 0);
        const x = cos * rx;
        const y = sin * ry;
        points.push([x, y]);
        const length = Math.hypot(cos / rx, sin / ry) || 1;
        outline.push([x, y, (cos / rx) / length, (sin / ry) / length]);
    }
    microCilia(ctx, outline, t, 'rgba(70,74,60,0.62)', 4.2, st.still);
    microSmooth(ctx, points);
    const fill = ctx.createRadialGradient(0, 0, 3, 0, 0, 52);
    fill.addColorStop(0, 'rgba(226,226,190,0.52)');
    fill.addColorStop(1, 'rgba(176,178,140,0.66)');
    ctx.fillStyle = fill;
    ctx.fill();
    microStroke(ctx, 'rgba(68,72,50,0.82)', 0.9);
    // Rows of cilia seen on its back.
    ctx.lineWidth = 0.28;
    ctx.strokeStyle = 'rgba(80,86,60,0.36)';
    for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-46, i * 2.4);
        ctx.quadraticCurveTo(0, i * 5.4, 46, i * 2.4);
        ctx.stroke();
    }
    // The oral groove and gullet.
    microCurve(ctx, [[34, 8], [18, 12], [4, 11], [-2, 6]]);
    microStroke(ctx, 'rgba(88,90,60,0.68)', 1.7);
    // The nuclei.
    microOval(ctx, -2, -3, 11, 7.6, 0.2);
    microFill(ctx, 'rgba(142,136,108,0.68)');
    microStroke(ctx, 'rgba(82,78,56,0.55)', 0.5);
    microOval(ctx, 7, -8, 2.4, 2);
    microFill(ctx, 'rgba(108,102,80,0.8)');
    // Food vacuoles.
    const random = microRng(st.seed ?? 11);
    for (let i = 0; i < 7; i++) {
        const x = random() * 66 - 36;
        const y = random() * 20 - 10;
        const r = 1.6 + random() * 2;
        microOval(ctx, x, y, r, r);
        microFill(ctx, i % 2 ? 'rgba(138,150,74,0.68)' : 'rgba(160,128,74,0.6)');
        microStroke(ctx, 'rgba(70,62,40,0.4)', 0.3);
    }
    // The two contractile vacuoles, filling and squeezing in turn.
    [-30, 30].forEach((x, i) => {
        const cycle = st.still ? 0.7 : (Math.sin(t * 1.5 + i * Math.PI) + 1) / 2;
        const r = 1.4 + cycle * 3.8;
        ctx.strokeStyle = 'rgba(96,120,136,0.5)';
        ctx.lineWidth = 0.42;
        for (let k = 0; k < 7; k++) {
            const angle = (k / 7) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(angle) * r, -5 + Math.sin(angle) * r);
            ctx.lineTo(x + Math.cos(angle) * (r + 5 * (1 - cycle) + 1), -5 + Math.sin(angle) * (r + 5 * (1 - cycle) + 1));
            ctx.stroke();
        }
        microOval(ctx, x, -5, r, r);
        microFill(ctx, 'rgba(210,232,240,0.78)');
        microStroke(ctx, 'rgba(90,114,128,0.58)', 0.38);
    });
}

// An amoeba: no shape of its own, it flows into blunt false feet, its clear rim around a grainy inside.
function microDrawAmoeba(ctx, t, st = {}) {
    const seed = (st.seed ?? 3) * 1.7;
    const time = st.still ? 0 : t;
    const points = [];
    for (let i = 0; i < 26; i++) {
        const angle = (i / 26) * Math.PI * 2;
        const lobes = Math.sin(angle * 3 + seed + time * 0.42) * 0.3 + Math.sin(angle * 5 - seed * 1.3 + time * 0.31) * 0.2 + Math.sin(angle * 2 + seed * 0.4 - time * 0.21) * 0.16;
        const r = 34 * (1 + Math.max(-0.42, lobes)) * (1 + Math.max(0, lobes) * 0.5);
        points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
    }
    microSmooth(ctx, points);
    microFill(ctx, 'rgba(216,214,178,0.46)');
    microStroke(ctx, 'rgba(92,92,62,0.72)', 0.85);
    microSmooth(ctx, points.map(([x, y]) => [x * 0.76, y * 0.76]));
    microFill(ctx, 'rgba(180,176,134,0.48)');
    ctx.save();
    microSmooth(ctx, points.map(([x, y]) => [x * 0.76, y * 0.76]));
    ctx.clip();
    microGranules(ctx, (st.seed ?? 3) + 40, 80, 42, 42, 'rgba(92,88,60,0.42)', 0.55);
    ctx.restore();
    // The nucleus, a food vacuole and the water pump.
    const drift = Math.sin(time * 0.3 + seed) * 3;
    microOval(ctx, -5 + drift, 3, 8.2, 7.2);
    microFill(ctx, 'rgba(126,120,92,0.72)');
    microStroke(ctx, 'rgba(70,66,46,0.6)', 0.5);
    microOval(ctx, 9 - drift, -7, 5, 5);
    microFill(ctx, 'rgba(136,152,76,0.64)');
    microStroke(ctx, 'rgba(70,84,40,0.5)', 0.35);
    microOval(ctx, -13, -10 + drift, 3.8, 3.8);
    microFill(ctx, 'rgba(158,132,82,0.56)');
    const pump = st.still ? 3 : 1.6 + (Math.sin(time * 1.3) + 1) * 1.9;
    microOval(ctx, 10, 9 + drift / 2, pump, pump);
    microFill(ctx, 'rgba(216,236,244,0.8)');
    microStroke(ctx, 'rgba(90,114,128,0.55)', 0.35);
}

// A vorticella: a bell on a long stalk stuck to the glass. Now and then the stalk springs into a coil
// and yanks the bell down, then slowly stretches out again. st.spring: 0 stretched, 1 coiled. Its foot
// is at the back (x = -50), the bell at the front.
function microDrawVorticella(ctx, t, st = {}) {
    const spring = microClamp01(st.spring ?? (st.still ? 1 : Math.max(0, Math.sin(t * 0.6) * 12 - 11)));
    const bellX = microLerp(26, -18, spring);
    const sway = st.still ? 0 : Math.sin(t * 0.7 + (st.seed ?? 0)) * 3 * (1 - spring);
    // The stalk, with the thread inside it that shortens; coiled, a tight zigzag.
    const points = [[-50, 0]];
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const coil = Math.sin(k * Math.PI * 12) * microLerp(0.4, 7.5, spring);
        points.push([microLerp(-50, bellX - 8, k), coil + sway * k]);
    }
    microCurve(ctx, points);
    ctx.lineCap = 'round';
    microStroke(ctx, 'rgba(112,114,76,0.76)', 2.1);
    microCurve(ctx, points);
    microStroke(ctx, 'rgba(226,226,190,0.72)', 0.7);
    ctx.save();
    ctx.translate(bellX, sway);
    // The bell, shut up tight when it has sprung.
    const open = 1 - spring * 0.6;
    const bell = [[-10, -3 * open], [-3, -11 * open], [8, -17 * open], [16, -21 * open], [19, -14 * open], [20, 0], [19, 14 * open], [16, 21 * open], [8, 17 * open], [-3, 11 * open], [-10, 3 * open]];
    microSmooth(ctx, bell);
    const fill = ctx.createLinearGradient(-10, 0, 20, 0);
    fill.addColorStop(0, 'rgba(182,184,142,0.66)');
    fill.addColorStop(1, 'rgba(228,228,194,0.48)');
    ctx.fillStyle = fill;
    ctx.fill();
    microStroke(ctx, 'rgba(76,80,52,0.82)', 0.9);
    // The curved nucleus and a few vacuoles.
    microCurve(ctx, [[-1, -8 * open], [8, -10 * open], [11, 0], [8, 10 * open], [-1, 8 * open]]);
    microStroke(ctx, 'rgba(124,118,86,0.76)', 2.4);
    const random = microRng((st.seed ?? 1) + 2);
    for (let i = 0; i < 5; i++) {
        const r = 1 + random() * 1.4;
        microOval(ctx, random() * 14 - 3, (random() * 16 - 8) * open, r, r);
        microFill(ctx, 'rgba(150,146,84,0.6)');
    }
    // The ring of cilia at its mouth, whirling food in.
    if (open > 0.5) {
        ctx.strokeStyle = 'rgba(70,74,50,0.72)';
        ctx.lineWidth = 0.55;
        for (let i = 0; i < 15; i++) {
            const y = -22 * open + (i / 14) * 44 * open;
            const beat = st.still ? 0 : Math.sin(t * 15 - i * 0.8);
            ctx.beginPath();
            ctx.moveTo(19 + (1 - Math.abs(y) / 22) * 1.4, y);
            ctx.lineTo(25.5 + beat, y + beat * 2.2 + (y > 0 ? 1.8 : -1.8));
            ctx.stroke();
        }
    }
    ctx.restore();
}

// ---------------------------------------------------------------------------------------
// The green ones

// A euglena: a green spindle that twists as it swims, its red eye-spot beside the root of its whip.
function microDrawEuglena(ctx, t, st = {}) {
    const bend = st.still ? 0 : Math.sin(t * 1.4 + (st.seed ?? 0)) * 3.5;
    // The flagellum, whipping ahead.
    const whip = [];
    for (let i = 0; i <= 14; i++) {
        const k = i / 14;
        whip.push([46 + k * 42, (st.still ? Math.sin(k * 5) * 2 : Math.sin(k * 8 - t * 13) * (1.2 + k * 5.4))]);
    }
    microCurve(ctx, whip);
    ctx.lineCap = 'round';
    microStroke(ctx, 'rgba(82,98,50,0.8)', 0.8);
    const points = [[48, 0], [32, -11 - bend * 0.3], [8, -15 + bend * 0.4], [-20, -12 - bend * 0.4], [-44, -3], [-52, 0], [-44, 3], [-20, 12 + bend * 0.4], [8, 15 - bend * 0.4], [32, 11 + bend * 0.3]];
    microSmooth(ctx, points);
    microFill(ctx, 'rgba(158,204,102,0.58)');
    microStroke(ctx, 'rgba(58,92,36,0.82)', 0.9);
    // The fine spiral lines of its skin.
    ctx.save();
    microSmooth(ctx, points);
    ctx.clip();
    ctx.strokeStyle = 'rgba(70,104,44,0.3)';
    ctx.lineWidth = 0.42;
    for (let i = -7; i <= 7; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 7 - 4, -16);
        ctx.lineTo(i * 7 + 4, 16);
        ctx.stroke();
    }
    ctx.restore();
    // Disc-shaped chloroplasts.
    const random = microRng((st.seed ?? 4) + 9);
    for (let i = 0; i < 18; i++) {
        const x = random() * 72 - 42;
        const y = (random() - 0.5) * 18;
        microOval(ctx, x, y, 3.3, 2, random() * 3);
        microFill(ctx, 'rgba(58,136,52,0.82)');
    }
    // The nucleus, the reservoir, and the red eye-spot.
    microOval(ctx, -7, 0, 7.5, 6.2);
    microFill(ctx, 'rgba(198,206,162,0.74)');
    microStroke(ctx, 'rgba(72,88,50,0.5)', 0.4);
    microOval(ctx, 36, 0, 4.2, 3.2);
    microFill(ctx, 'rgba(226,240,220,0.72)');
    microOval(ctx, 31, -4.2, 2.8, 1.9);
    microFill(ctx, 'rgba(208,40,28,0.94)');
}

// A diatom: a glass shell of two halves, ruled with lines as fine as anything in nature. Half of them
// are boats (pennate), half round boxes (centric): st.variant.
function microDrawDiatom(ctx, t, st = {}) {
    const round = Boolean((st.variant ?? 0) % 2);
    if (round) {
        microOval(ctx, 0, 0, 40, 40);
        microFill(ctx, 'rgba(204,190,128,0.58)');
        microStroke(ctx, 'rgba(84,70,30,0.88)', 1.1);
        ctx.strokeStyle = 'rgba(92,76,34,0.42)';
        ctx.lineWidth = 0.42;
        for (let i = 0; i < 44; i++) {
            const angle = (i / 44) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * 9, Math.sin(angle) * 9);
            ctx.lineTo(Math.cos(angle) * 38.5, Math.sin(angle) * 38.5);
            ctx.stroke();
        }
        for (const r of [9, 18, 30]) {
            microOval(ctx, 0, 0, r, r);
            microStroke(ctx, 'rgba(92,76,34,0.36)', 0.4);
        }
        const random = microRng((st.seed ?? 8) + 1);
        for (let i = 0; i < 12; i++) {
            const angle = random() * Math.PI * 2;
            const r = 12 + random() * 22;
            microOval(ctx, Math.cos(angle) * r, Math.sin(angle) * r, 3.8, 2.8, random() * 3);
            microFill(ctx, 'rgba(146,104,30,0.72)');
        }
        microOval(ctx, -13, -14, 12, 7, -0.7);
        microFill(ctx, 'rgba(255,255,244,0.3)');
        return;
    }
    const points = [[50, 0], [33, -10], [8, -15], [-8, -15], [-33, -10], [-50, 0], [-33, 10], [-8, 15], [8, 15], [33, 10]];
    microSmooth(ctx, points);
    microFill(ctx, 'rgba(204,188,124,0.6)');
    microStroke(ctx, 'rgba(84,70,30,0.9)', 1.1);
    ctx.save();
    microSmooth(ctx, points);
    ctx.clip();
    // Rows of pores either side of the slit.
    ctx.strokeStyle = 'rgba(88,72,32,0.46)';
    ctx.lineWidth = 0.42;
    for (let x = -46; x <= 46; x += 2.6) {
        const lean = x * 0.12;
        ctx.beginPath();
        ctx.moveTo(x, -2);
        ctx.lineTo(x + lean, -16);
        ctx.moveTo(x, 2);
        ctx.lineTo(x + lean, 16);
        ctx.stroke();
    }
    ctx.restore();
    // The slit, and the plastids either side of the nucleus.
    ctx.beginPath();
    ctx.moveTo(-44, 0);
    ctx.lineTo(44, 0);
    microStroke(ctx, 'rgba(74,60,24,0.7)', 0.8);
    for (const x of [-22, 22]) {
        microOval(ctx, x, 0, 13, 6.2);
        microFill(ctx, 'rgba(146,104,30,0.72)');
    }
    microOval(ctx, 0, 0, 4.2, 4.2);
    microFill(ctx, 'rgba(214,208,170,0.8)');
    microOval(ctx, -10, -7, 18, 2.2, -0.05);
    microFill(ctx, 'rgba(255,255,244,0.34)');
}

// Spirogyra: a thread of long cells, each with its emerald ribbon of chloroplast wound in a spiral,
// studded with pyrenoids, and its nucleus hung in the middle.
function microDrawSpirogyra(ctx, t) {
    const cells = 4;
    const cellLength = 100 / cells;
    const half = 7.5;
    for (let i = 0; i < cells; i++) {
        const x0 = -50 + i * cellLength;
        ctx.beginPath();
        ctx.rect(x0, -half, cellLength, half * 2);
        microFill(ctx, 'rgba(208,232,180,0.42)');
        microStroke(ctx, 'rgba(58,92,48,0.82)', 0.72);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, -half, cellLength, half * 2);
        ctx.clip();
        // The back turns of the ribbon, faint, then the front ones.
        const ribbon = (front) => {
            const points = [];
            for (let k = 0; k <= 40; k++) {
                const a = k / 40;
                const angle = a * Math.PI * 2 * 2.5 + i * 2.1 + 0.02 * t;
                if ((Math.cos(angle) > 0) !== front) {
                    if (points.length > 1) {
                        microCurve(ctx, points);
                        microStroke(ctx, front ? 'rgba(46,146,56,0.92)' : 'rgba(70,160,80,0.36)', 2.3);
                    }
                    points.length = 0;
                    continue;
                }
                points.push([x0 + a * cellLength, Math.sin(angle) * half * 0.94]);
            }
            if (points.length > 1) {
                microCurve(ctx, points);
                microStroke(ctx, front ? 'rgba(46,146,56,0.92)' : 'rgba(70,160,80,0.36)', 2.3);
            }
        };
        ctx.lineCap = 'round';
        ribbon(false);
        ribbon(true);
        // Pyrenoids, bright beads on the front of the ribbon.
        for (let k = 0.08; k < 1; k += 0.14) {
            const angle = k * Math.PI * 2 * 2.5 + i * 2.1 + 0.02 * t;
            if (Math.cos(angle) <= 0) continue;
            microOval(ctx, x0 + k * cellLength, Math.sin(angle) * half * 0.94, 0.95, 0.95);
            microFill(ctx, 'rgba(218,248,196,0.92)');
        }
        // The nucleus.
        microOval(ctx, x0 + cellLength / 2, 0, 2.2, 1.9);
        microFill(ctx, 'rgba(190,190,150,0.72)');
        microStroke(ctx, 'rgba(90,96,60,0.6)', 0.3);
        ctx.restore();
    }
}

// Cyanobacteria: bacteria that make their food from light, in blue-green strings of beads that slowly
// sway, with the larger, paler cells that fix nitrogen here and there.
function microDrawCyanobacteria(ctx, t, st = {}) {
    const seed = st.seed ?? 5;
    const random = microRng(seed);
    const curl = random() * 2 + 1;
    const beads = 15;
    const special = 3 + Math.floor(random() * 8);
    for (let i = 0; i < beads; i++) {
        const k = i / (beads - 1);
        const x = -48 + k * 96;
        const y = Math.sin(k * curl * 3 + seed + (st.still ? 0 : t * 0.5)) * 11;
        const heterocyst = i === special;
        const r = heterocyst ? 4.6 : 3.4 + random() * 0.3;
        microOval(ctx, x, y, r, r * 0.92);
        microFill(ctx, heterocyst ? 'rgba(200,216,160,0.8)' : 'rgba(58,142,132,0.86)');
        microStroke(ctx, heterocyst ? 'rgba(90,108,70,0.8)' : 'rgba(22,84,86,0.72)', 0.42);
    }
}

// ---------------------------------------------------------------------------------------
// Bacteria, yeast, and what can be seen of tissues

// A rod-shaped soil bacterium with a whip at one end.
function microDrawSoilBacteria(ctx, t, st = {}) {
    microCurve(ctx, [[34, 0], [52, st.still ? 4 : Math.sin(t * 14) * 10], [72, st.still ? -4 : Math.sin(t * 14 + 2) * 12], [92, st.still ? 2 : Math.sin(t * 14 + 4) * 10]]);
    microStroke(ctx, 'rgba(60,54,44,0.52)', 2);
    microRodPath(ctx, -40, 40, 15);
    microFill(ctx, 'rgba(142,122,92,0.78)');
    microStroke(ctx, 'rgba(58,46,32,0.88)', 3);
    microOval(ctx, -8, -3, 22, 5);
    microFill(ctx, 'rgba(86,72,52,0.46)');
}

function microRodPath(ctx, x0, x1, r) {
    ctx.beginPath();
    ctx.arc(x1 - r, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.arc(x0 + r, 0, r, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
}

// Yeast: oval cells, often with a daughter growing from one end, which is how they multiply.
function microDrawYeast(ctx, t, st = {}) {
    const budding = (st.variant ?? 0) % 3 !== 0;
    const grow = st.still ? 0.8 : 0.65 + 0.14 * Math.sin(t * 0.15 + (st.seed ?? 0));
    if (budding) {
        microOval(ctx, 34, -12, 24 * grow, 20 * grow, -0.3);
        microFill(ctx, 'rgba(224,206,162,0.68)');
        microStroke(ctx, 'rgba(92,72,38,0.86)', 2);
    }
    microOval(ctx, -8, 3, 36, 29);
    microFill(ctx, 'rgba(222,204,158,0.7)');
    microStroke(ctx, 'rgba(92,72,38,0.9)', 2.2);
    microOval(ctx, -14, -2, 13, 11);
    microFill(ctx, 'rgba(244,240,222,0.76)');
    microStroke(ctx, 'rgba(120,100,62,0.5)', 1);
    microOval(ctx, 8, 10, 6.5, 6);
    microFill(ctx, 'rgba(130,104,60,0.6)');
}

// Lactobacillus: long thin rods joined in chains, the bacteria that turn milk into yoghurt and cheese.
function microDrawLactobacillus(ctx, t, st = {}) {
    const rods = 2 + ((st.variant ?? 0) % 2);
    const length = 100 / rods;
    const kink = ((st.seed ?? 2) % 5) * 0.03;
    for (let i = 0; i < rods; i++) {
        ctx.save();
        ctx.translate(-50 + (i + 0.5) * length, Math.abs(i - (rods - 1) / 2) * kink * 30);
        ctx.rotate((i - (rods - 1) / 2) * kink);
        microRodPath(ctx, -length / 2 + 0.2, length / 2 - 0.2, 5.2);
        microFill(ctx, 'rgba(168,136,180,0.78)');
        microStroke(ctx, 'rgba(82,58,96,0.9)', 1.4);
        ctx.restore();
    }
}

// A leaf's cell: its stiff wall, the chloroplasts carried round the edge by the moving cytoplasm, the
// nucleus pressed aside by the great clear vacuole. Drawn side by side they make the tissue.
function microDrawPlantCell(ctx, t, st = {}) {
    const seed = st.seed ?? 6;
    const random = microRng(seed);
    const jitter = () => (random() - 0.5) * 4;
    const corners = [[-50 + jitter(), -36 + jitter()], [50 + jitter(), -36 + jitter()], [50 + jitter(), 36 + jitter()], [-50 + jitter(), 36 + jitter()]];
    ctx.beginPath();
    corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    microFill(ctx, 'rgba(218,238,190,0.46)');
    microStroke(ctx, 'rgba(70,92,44,0.9)', 2.8);
    ctx.beginPath();
    corners.forEach(([x, y], i) => (i ? ctx.lineTo(x * 0.92, y * 0.88) : ctx.moveTo(x * 0.92, y * 0.88)));
    ctx.closePath();
    microStroke(ctx, 'rgba(116,146,76,0.46)', 0.7);
    // The vacuole.
    microOval(ctx, 2, 0, 34, 21);
    microFill(ctx, 'rgba(236,246,226,0.42)');
    // The chloroplasts stream round: an old experiment with pond weed.
    const flow = st.still ? 0 : t * 0.05;
    const count = 24;
    for (let i = 0; i < count; i++) {
        const k = (i / count + flow + random() * 0.012) % 1;
        const edge = k * 4;
        const side = Math.floor(edge);
        const along = edge - side;
        let x;
        let y;
        if (side === 0) { x = -41 + along * 82; y = -27; } else if (side === 1) { x = 41; y = -27 + along * 54; } else if (side === 2) { x = 41 - along * 82; y = 27; } else { x = -41; y = 27 - along * 54; }
        const inset = random() * 3.4;
        microOval(ctx, x * (1 - inset / 50), y * (1 - inset / 34), 4.6, 3, side % 2 ? 1.4 : 0.1);
        microFill(ctx, 'rgba(60,150,58,0.88)');
        microStroke(ctx, 'rgba(36,94,38,0.46)', 0.3);
    }
    microOval(ctx, -28, 11, 7.2, 6.4);
    microFill(ctx, 'rgba(172,170,126,0.74)');
    microStroke(ctx, 'rgba(90,92,58,0.66)', 0.6);
    microOval(ctx, -27, 10, 2.2, 2.1);
    microFill(ctx, 'rgba(92,88,58,0.82)');
}

// A cell of a cheek or a fish: thin, flat, irregular, no wall, a round nucleus in the middle.
function microDrawAnimalCell(ctx, t, st = {}) {
    const seed = st.seed ?? 12;
    const random = microRng(seed);
    const points = [];
    for (let i = 0; i < 11; i++) {
        const angle = (i / 11) * Math.PI * 2;
        const r = 36 + random() * 15;
        points.push([Math.cos(angle) * r, Math.sin(angle) * r * 0.86]);
    }
    microSmooth(ctx, points);
    microFill(ctx, 'rgba(216,200,206,0.54)');
    microStroke(ctx, 'rgba(114,88,108,0.78)', 1);
    // Creases of a thin sheet.
    ctx.lineWidth = 0.42;
    ctx.strokeStyle = 'rgba(120,96,116,0.42)';
    for (let i = 0; i < 3; i++) {
        const y = random() * 50 - 25;
        ctx.beginPath();
        ctx.moveTo(-30 + random() * 10, y);
        ctx.quadraticCurveTo(0, y + random() * 12 - 6, 26 + random() * 10, y + random() * 12 - 6);
        ctx.stroke();
    }
    ctx.save();
    microSmooth(ctx, points);
    ctx.clip();
    microGranules(ctx, seed + 3, 70, 44, 38, 'rgba(120,96,112,0.38)', 0.55);
    ctx.restore();
    microOval(ctx, 2, -1, 11.5, 10.5);
    microFill(ctx, 'rgba(116,76,126,0.72)');
    microStroke(ctx, 'rgba(70,40,80,0.72)', 0.6);
    microOval(ctx, 4, 1, 3, 2.8);
    microFill(ctx, 'rgba(70,40,84,0.74)');
}

// A mushroom's spore: dark, smooth and thick-walled, with the little scar where it left the gill.
function microDrawSpore(ctx, t, st = {}) {
    const lean = ((st.variant ?? 0) % 4) * 0.06;
    microOval(ctx, 0, 0, 44, 28, lean);
    microFill(ctx, 'rgba(84,58,40,0.9)');
    microStroke(ctx, 'rgba(36,22,14,0.95)', 3);
    microOval(ctx, -8, -8, 15, 6, lean);
    microFill(ctx, 'rgba(176,146,110,0.48)');
    microOval(ctx, 42, 0, 4.2, 3.2);
    microFill(ctx, 'rgba(36,22,14,0.95)');
}

// What most of them become when the slide dries: a round thick-walled cyst.
function microDrawCyst(ctx, t, st = {}) {
    microOval(ctx, 0, 0, 34, 32);
    microFill(ctx, 'rgba(128,112,78,0.72)');
    microStroke(ctx, 'rgba(58,46,26,0.92)', 3);
    ctx.save();
    microOval(ctx, 0, 0, 31, 29);
    ctx.clip();
    microGranules(ctx, (st.seed ?? 2) + 20, 22, 30, 28, 'rgba(58,46,26,0.5)', 1.2);
    ctx.restore();
}

// ---------------------------------------------------------------------------------------
// The catalogue

// name, latin, size: as a card says it. drawn: length on the slide (micrometres). mag: the power needed
// to tell what it is. where: in words. fact: a true thing about it. hint: what an undiscovered card says,
// without giving it away. page: its page in the guide. dot: its colour when it is only a
// speck. count, spread: how many on a slide and how far from the middle (micrometres). move: how it gets
// about (microStep). whenDry: 'cyst' or 'dies' as the slide dries. algae: what a tardigrade can eat.
const MICRO_SPECIES = {
    tardigrade: {
        name: 'Tardigrade', latin: 'Tardigrada', size: '0.3-0.5 mm', drawn: 400, mag: 40,
        where: 'Damp moss, and cold or shady water near it',
        fact: 'Dried up, it curls into a "tun" and can wait for years; tuns have survived the vacuum of space. Add a drop of water and it walks again.',
        hint: 'Something lumbers on stubby legs, through water and wet green places.', page: 240,
        dot: '#a58a5a', count: [1, 3], spread: 820, move: 'crawl', whenDry: 'tun', draw: microDrawTardigrade
    },
    rotifer: {
        name: 'Rotifer', latin: 'Rotifera', size: '0.1-0.5 mm', drawn: 340, mag: 100,
        where: 'Forest lakes and moss',
        fact: 'Its crown of cilia looks like two turning wheels. It is an animal, with a brain and jaws, yet smaller than some single cells.',
        hint: 'Two little wheels seem to spin at one end of it.', page: 237,
        dot: '#b2aa74', count: [2, 5], spread: 820, move: 'swim', speed: 42, whenDry: 'cyst', draw: microDrawRotifer
    },
    water_flea: {
        name: 'Water Flea', latin: 'Daphnia', size: '1-3 mm', drawn: 1300, mag: 40,
        where: 'Plains and forest lakes',
        fact: 'It is so transparent that you can watch its heart beat, and it moves in jumps by rowing with its antennae. It is a crustacean, not a flea.',
        hint: 'It moves in jumps, and you can see right through it.', page: 237,
        dot: '#8e8a50', count: [1, 3], spread: 1000, move: 'hop', speed: 170, whenDry: 'dies', draw: microDrawWaterFlea
    },
    paramecium: {
        name: 'Paramecium', latin: 'Paramecium', size: '0.1-0.3 mm', drawn: 230, mag: 100,
        where: 'Plains and forest lakes',
        fact: 'One cell covered in thousands of beating cilia. When it bumps into something it backs off, turns and tries again, with no nerves at all.',
        hint: 'A tiny slipper backs away from whatever it bumps into.', page: 243,
        dot: '#a6a884', count: [5, 10], spread: 800, move: 'bounce', speed: 90, whenDry: 'dies', draw: microDrawParamecium
    },
    amoeba: {
        name: 'Amoeba', latin: 'Amoeba proteus', size: '0.2-0.7 mm', drawn: 280, mag: 100,
        where: 'Plains and mountain lakes',
        fact: 'It has no fixed shape. It pushes out false feet to creep along, and flows round its food to swallow it.',
        hint: 'It never keeps the same shape for long.', page: 243,
        dot: '#a8a47c', count: [2, 5], spread: 760, move: 'ooze', speed: 9, whenDry: 'cyst', draw: microDrawAmoeba
    },
    vorticella: {
        name: 'Vorticella', latin: 'Vorticella', size: 'bell 30-150 µm', drawn: 240, mag: 100,
        where: 'Forest lakes',
        fact: 'Its stalk has a spring inside: at a touch it coils in a few thousandths of a second, among the fastest movements of any cell.',
        hint: 'A little bell on a stalk springs back at a touch.', page: 243,
        dot: '#a4a878', count: [4, 8], spread: 420, move: 'stalk', whenDry: 'dies', draw: microDrawVorticella
    },
    euglena: {
        name: 'Euglena', latin: 'Euglena', size: '15-500 µm', drawn: 72, mag: 100,
        where: 'Plains lakes and oases',
        fact: 'It makes food from sunlight like a plant and swims like an animal; in the dark it can live on what it soaks up from the water. Its red eye-spot helps it find the light.',
        hint: 'A green swimmer with a small red dot.', page: 243,
        dot: '#5e9c4c', count: [8, 16], spread: 520, move: 'swim', speed: 34, whenDry: 'cyst', draw: microDrawEuglena
    },
    diatom: {
        name: 'Diatom', latin: 'Bacillariophyta', size: '2-200 µm', drawn: 72, mag: 400,
        where: 'Mountain and forest lakes',
        fact: 'A single alga in a shell of glass. Diatoms make about a fifth of all the oxygen produced on Earth, and their old shells pile up into rock.',
        hint: 'A tiny jewel box, finely ruled. It takes your strongest lens.', page: 243,
        dot: '#a68c44', count: [12, 22], spread: 330, move: 'glide', speed: 5, whenDry: 'dies', draw: microDrawDiatom
    },
    spirogyra: {
        name: 'Spirogyra', latin: 'Spirogyra', size: 'threads of many cm', drawn: 520, mag: 100,
        where: 'Forest and plains lakes',
        fact: 'The slimy green threads of a pond. Each cell holds a spiral ribbon of chloroplast, and two threads lying side by side can join through little bridges to breed.',
        hint: 'Green threads, with something wound in a spiral inside them.', page: 243,
        dot: '#4c9a4c', count: [4, 8], spread: 780, move: 'drift', speed: 1.5, whenDry: 'dies', algae: true, draw: microDrawSpirogyra
    },
    cyanobacteria: {
        name: 'Cyanobacteria', latin: 'Cyanobacteria', size: 'cells 1-10 µm', drawn: 100, mag: 400,
        where: 'Plains lakes and oases',
        fact: 'Bacteria that make food from sunlight. Their ancestors filled the air with oxygen, and live on inside every plant cell as chloroplasts.',
        hint: 'Blue-green beads on a string. It takes your strongest lens.', page: 244,
        dot: '#3c8a84', count: [14, 24], spread: 300, move: 'drift', speed: 2.5, whenDry: 'dies', algae: true, draw: microDrawCyanobacteria
    },
    soil_bacteria: {
        name: 'Soil Bacteria', latin: 'Bacillus', size: '1-5 µm', drawn: 8, mag: 400,
        where: 'Soil, and a little of any still water',
        fact: 'A teaspoon of good soil can hold as many of them as there are people on Earth. With the fungi, they rot what dies and give its food back to the plants.',
        hint: 'Tiny rods, too small for all but your strongest lens.', page: 244,
        dot: '#6e5c44', count: [40, 70], spread: 230, move: 'wriggle', speed: 12, whenDry: 'dies', draw: microDrawSoilBacteria
    },
    yeast: {
        name: 'Yeast', latin: 'Saccharomyces', size: '5-10 µm', drawn: 14, mag: 400,
        where: 'Flowers and honey',
        fact: 'A fungus of a single cell that multiplies by budding. Its bubbles of gas are what makes bread rise.',
        hint: 'Small ovals, some with a smaller oval growing out of them.', page: 244,
        dot: '#b09a70', count: [22, 38], spread: 200, move: 'still', whenDry: 'dies', draw: microDrawYeast
    },
    lactobacillus: {
        name: 'Lactobacillus', latin: 'Lactobacillus', size: '2-10 µm', drawn: 28, mag: 400,
        where: 'Milk and cheese',
        fact: 'A friendly bacterium that turns the sugar of milk into acid: that is how we get yoghurt and cheese.',
        hint: 'Slim rods joined in chains, wherever milk has been.', page: 244,
        dot: '#8a6c9c', count: [20, 36], spread: 220, move: 'still', whenDry: 'dies', draw: microDrawLactobacillus
    },
    plant_cell: {
        name: 'Plant Cell', latin: 'Cellula plantae', size: '20-100 µm', drawn: 110, mag: 100,
        where: 'Leaves, wheat and moss',
        fact: 'A stiff wall and green chloroplasts, which make its food from light. Robert Hooke named cells in 1665, as they reminded him of little rooms.',
        hint: 'Little green-walled rooms, side by side.', page: 242,
        dot: '#5ea050', count: [28, 42], spread: 0, layout: 'tissue', move: 'still', whenDry: 'dies', algae: true, draw: microDrawPlantCell
    },
    animal_cell: {
        name: 'Animal Cell', latin: 'Cellula animalis', size: '10-60 µm', drawn: 72, mag: 400,
        where: 'A smear of your own cheek, and raw fish',
        fact: 'Thin, with no wall and a dark nucleus holding its DNA. Your cheek sheds cells like these all the time, and makes new ones.',
        hint: 'You carry millions of them around with you.', page: 242,
        dot: '#987a90', count: [8, 14], spread: 170, move: 'still', whenDry: 'dies', draw: microDrawAnimalCell
    },
    mushroom_spore: {
        name: 'Mushroom Spores', latin: 'Basidiospora', size: '5-15 µm', drawn: 12, mag: 400,
        where: 'Mushrooms',
        fact: 'A mushroom is only the fruit of a fungus: one can release billions of spores, each a single cell that does the work of a seed, and the wind takes them.',
        hint: 'Dark specks that fall from under a cap.', page: 244,
        dot: '#54402c', count: [40, 70], spread: 220, move: 'still', whenDry: 'dies', draw: microDrawSpore
    }
};

// ---------------------------------------------------------------------------------------
// A slide

function microRange(random, [low, high]) {
    return low + Math.floor(random() * (high - low + 1));
}

// A random point in a disc.
function microInDisc(random, radius) {
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * radius;
    return [Math.cos(angle) * r, Math.sin(angle) * r];
}

// Who is on the slide and where, the same for everyone who looks: a list of organisms, in numbers.
// `tardigrades` is how many the server says are still there.
function microPopulate(source, seed, tardigrades = 0) {
    const species = microSpeciesOf(source) || [];
    const random = microRng((seed ^ 0x5bd1e995) >>> 0);
    const organisms = [];
    for (const id of species) {
        const def = MICRO_SPECIES[id];
        const count = id === 'tardigrade' ? tardigrades : (source === 'sample_still_water' ? 8 + Math.floor(random() * 8) : microRange(random, def.count));
        const columns = Math.ceil(Math.sqrt(count * 1.3));
        for (let i = 0; i < count; i++) {
            // Tissue lies in rows, wall to wall; anything else is scattered about the middle.
            const [x, y] = def.layout === 'tissue'
                ? [(i % columns - (columns - 1) / 2) * def.drawn + (random() - 0.5) * 5, (Math.floor(i / columns) - (columns - 1) / 2) * def.drawn * 0.76 + (random() - 0.5) * 5]
                : microInDisc(random, def.spread);
            organisms.push({
                index: organisms.length, species: id, x, y,
                depth: def.layout === 'tissue' ? 0.5 : random(),
                rot: def.layout === 'tissue' ? 0 : random() * Math.PI * 2,
                seed: Math.floor(random() * 1000),
                variant: Math.floor(random() * 6),
                scale: 0.85 + random() * 0.3,
                phase: random() * Math.PI * 2,
                timer: random() * 6,
                // A rare tardigrade sheds its skin some time after the slide is first looked at.
                moltAt: id === 'tardigrade' && random() < 0.25 ? 30 + random() * 70 : null,
                gut: 0, action: 'walking', cooldown: 8 + random() * 14
            });
        }
    }
    return organisms;
}

// What lies about on a slide and is not alive: specks, and what the source itself is made of. Numbers
// only, like microPopulate, and the same for everyone.
function microScenery(source, seed) {
    const random = microRng((seed ^ 0x2f6e2b1) >>> 0);
    const kind = /_wool$/.test(source) ? 'fibre' : MICRO_MATERIALS[source] || 'speck';
    const counts = { speck: 28, grains: 26, pollen: 16, fat: 46, starch: 34, fibre: 7 };
    const spreads = { speck: 1100, grains: 520, pollen: 300, fat: 240, starch: 240, fibre: 420 };
    const items = [];
    for (let i = 0; i < counts[kind]; i++) {
        const [x, y] = microInDisc(random, spreads[kind]);
        items.push({ kind, x, y, depth: random(), rot: random() * Math.PI * 2, seed: Math.floor(random() * 1000), size: random() });
    }
    return items;
}

// How far along a slide is: 'wet', 'drying' (the last stretch), 'dry', and 'reviving' (just after a
// drop ended a drought). age: seconds since it was wetted; woke: since a drop last ended a drought, or
// negative if none has.
function microSlideStage(age, woke = -1) {
    if (age >= MICRO_DRY_SECONDS) return 'dry';
    if (woke >= 0 && woke < MICRO_REVIVE_SECONDS) return 'reviving';
    if (age >= MICRO_DRY_SECONDS - MICRO_TUN_SECONDS) return 'drying';
    return 'wet';
}

// How unfolded a tardigrade's legs are: 1 walking, 0 a tun.
function microUnfold(age, woke = -1) {
    const stage = microSlideStage(age, woke);
    if (stage === 'dry') return 0;
    if (stage === 'reviving') return microClamp01(woke / MICRO_REVIVE_SECONDS);
    if (stage === 'drying') return microClamp01((MICRO_DRY_SECONDS - age) / MICRO_TUN_SECONDS);
    return 1;
}

// What has become of a species on this slide: 'alive', 'cyst' or 'dead'. A tardigrade always lives.
function microFate(speciesId, age, revived) {
    const def = MICRO_SPECIES[speciesId];
    if (def.whenDry === 'tun') return 'alive';
    if (revived || age >= MICRO_DRY_SECONDS) return def.whenDry === 'cyst' ? 'cyst' : 'dead';
    return 'alive';
}

// How far out of focus: 0 is sharp, 1 is where it starts to go, past 2 it is a blur.
function microBlur(depth, focus, magnification) {
    return Math.abs(depth - focus) / MICRO_DEPTH_OF_FIELD[magnification];
}

// Whether this species can be told apart like this: 'ok', 'low' (needs more power), 'blur'.
function microCanIdentify(speciesId, magnification, blur) {
    if (magnification < MICRO_SPECIES[speciesId].mag) return 'low';
    return blur > 1.5 ? 'blur' : 'ok';
}

// ---------------------------------------------------------------------------------------
// How they move: one organism for dt seconds. `world` holds { age, woke, revived, organisms } and is only
// read. The tardigrade alone has states; the rest only go about.

const MICRO_ROAM_RADIUS = 1100;

function microTurnBack(org, x, y) {
    if (Math.hypot(x, y) > MICRO_ROAM_RADIUS) org.rot = Math.atan2(-y, -x) + (Math.sin(org.phase) * 0.4);
}

function microStepTardigrade(org, dt, world) {
    const unfold = microUnfold(world.age, world.woke);
    org.unfold = unfold;
    org.gut = Math.max(0, (org.gut || 0) - dt * 0.004);
    org.stylet = 0;
    if (unfold < 0.5) {
        org.action = unfold <= 0 ? 'tun' : 'folding';
        return;
    }
    org.moltClock = (org.moltClock || 0) + dt;
    if (org.action === 'molting') {
        org.actionLeft -= dt;
        org.phase += dt * 0.4;
        if (org.actionLeft <= 0) {
            // It walks out of the old skin, leaving the eggs inside.
            org.molts = [...(org.molts || []), { x: org.x, y: org.y, rot: org.rot, seed: org.seed + 1 }];
            org.action = 'walking';
            org.moltAt = null;
            org.cooldown = 10;
        }
        return;
    }
    if (org.action === 'eating') {
        org.actionLeft -= dt;
        org.stylet = 1;
        org.gut = Math.min(1, org.gut + dt * 0.11);
        org.phase += dt * 0.6;
        if (org.actionLeft <= 0) {
            org.action = 'walking';
            org.cooldown = 24;
        }
        return;
    }
    org.action = 'walking';
    org.cooldown = Math.max(0, org.cooldown - dt);
    if (org.moltAt !== null && org.moltAt !== undefined && org.moltClock >= org.moltAt) {
        org.action = 'molting';
        org.actionLeft = 7;
        return;
    }
    // Next to an alga, it stops to pierce it and drink it.
    if (org.cooldown <= 0 && world.organisms) {
        for (const other of world.organisms) {
            if (!MICRO_SPECIES[other.species].algae || microFate(other.species, world.age, world.revived) !== 'alive') continue;
            const dx = other.x - org.x;
            const dy = other.y - org.y;
            const distance = Math.hypot(dx, dy);
            if (distance < 190) {
                org.rot = Math.atan2(dy, dx);
                org.action = 'eating';
                org.actionLeft = 12;
                return;
            }
        }
    }
    // A clumsy walk: it lurches with its legs, and wanders.
    org.timer -= dt;
    if (org.timer <= 0) {
        org.timer = 2 + (org.seed % 7) * 0.6;
        org.turn = (Math.sin(org.phase * 3.1 + org.seed) * 0.7);
    }
    org.rot += (org.turn || 0) * dt;
    org.phase += dt * 3.2;
    const lurch = 0.45 + 0.55 * Math.abs(Math.sin(org.phase));
    const speed = 26 * lurch * unfold;
    org.x += Math.cos(org.rot) * speed * dt;
    org.y += Math.sin(org.rot) * speed * dt;
    microTurnBack(org, org.x, org.y);
}

function microStep(org, dt, world) {
    if (org.species === 'tardigrade') {
        microStepTardigrade(org, dt, world);
        return;
    }
    const def = MICRO_SPECIES[org.species];
    if (microFate(org.species, world.age, world.revived) !== 'alive') return;
    const speed = def.speed || 0;
    const slow = world.age >= MICRO_DRY_SECONDS - MICRO_TUN_SECONDS ? microClamp01((MICRO_DRY_SECONDS - world.age) / MICRO_TUN_SECONDS) : 1;
    org.timer -= dt;
    switch (def.move) {
        case 'swim':
            if (org.timer <= 0) {
                org.timer = 1.5 + (org.seed % 5) * 0.7;
                org.turn = Math.sin(org.phase * 2.3 + org.seed) * 0.8;
                org.phase += 1.7;
            }
            org.rot += (org.turn || 0) * dt;
            org.x += Math.cos(org.rot) * speed * slow * dt;
            org.y += Math.sin(org.rot) * speed * slow * dt;
            break;
        case 'bounce':
            // Straight runs with a spin, then a back-up and a new heading, as a paramecium does.
            if (org.timer <= 0) {
                org.timer = 2 + (org.seed % 6) * 0.5;
                org.backing = 0.5;
                org.phase += 2.1;
            }
            if (org.backing > 0) {
                org.backing -= dt;
                org.rot += dt * 3.6 * Math.sin(org.phase);
                org.x -= Math.cos(org.rot) * speed * 0.5 * slow * dt;
                org.y -= Math.sin(org.rot) * speed * 0.5 * slow * dt;
            } else {
                org.x += Math.cos(org.rot) * speed * slow * dt;
                org.y += Math.sin(org.rot) * speed * slow * dt;
            }
            break;
        case 'hop': {
            // A jump, and it sinks a little until the next one.
            if (org.timer <= 0) {
                org.timer = 0.7 + (org.seed % 4) * 0.25;
                org.boost = 1;
                org.phase += 1.3;
                org.rot += Math.sin(org.phase * 1.9) * 0.5;
            }
            org.boost = Math.max(0, (org.boost || 0) - dt * 3.4);
            org.x += Math.cos(org.rot) * speed * org.boost * slow * dt;
            org.y += Math.sin(org.rot) * speed * org.boost * slow * dt + 8 * dt;
            break;
        }
        case 'ooze':
        case 'glide':
        case 'drift':
        case 'wriggle':
            org.phase += dt;
            org.rot += Math.sin(org.phase * 0.7 + org.seed) * dt * (def.move === 'wriggle' ? 2.4 : 0.05);
            org.x += Math.cos(org.rot) * speed * slow * dt;
            org.y += Math.sin(org.rot) * speed * slow * dt;
            break;
        case 'stalk':
            // It springs back at random and stretches out slowly.
            if (org.timer <= 0) {
                org.timer = 5 + (org.seed % 9);
                org.spring = 1;
            }
            org.spring = Math.max(0, (org.spring || 0) - dt * 0.42);
            break;
        default:
            break;
    }
    if (speed) microTurnBack(org, org.x, org.y);
}

// ---------------------------------------------------------------------------------------
// Drawing them

// One organism, of `px` pixels long at (x, y), its front towards `rot`. Works on any canvas context.
function microDrawOrganism(ctx, speciesId, x, y, px, rot, t, st = {}) {
    const def = MICRO_SPECIES[speciesId];
    if (!def) return;
    ctx.save();
    ctx.translate(x, y);
    if (px < 3) {
        ctx.fillStyle = def.dot;
        ctx.fillRect(-0.6, -0.6, Math.max(1, px * 0.8), Math.max(1, px * 0.5));
        ctx.restore();
        return;
    }
    ctx.rotate(rot);
    ctx.scale(px / 100, px / 100);
    if (st.fate === 'cyst') {
        // Shut up in a ball far smaller than the animal was.
        ctx.scale(Math.min(1, 0.45 + 14 / px), Math.min(1, 0.45 + 14 / px));
        microDrawCyst(ctx, t, st);
    } else if (st.fate === 'dead') {
        ctx.globalAlpha *= 0.42;
        def.draw(ctx, t, { ...st, still: true, dead: true });
    } else {
        def.draw(ctx, t, st);
    }
    ctx.restore();
}

// A species alone in the middle of a canvas of this size, on the pale ground of the microscope. For
// bestiary cards and guide pages; `t` animates it.
function microDrawPortrait(ctx, speciesId, width, height, t = 0, st = {}) {
    ctx.save();
    // ground: false leaves it on nothing, for a silhouette.
    if (st.ground !== false) {
        const ground = ctx.createRadialGradient(width / 2, height / 2, 2, width / 2, height / 2, Math.max(width, height) * 0.7);
        ground.addColorStop(0, '#f4f4e2');
        ground.addColorStop(1, '#cfd2b4');
        ctx.fillStyle = ground;
        ctx.fillRect(0, 0, width, height);
    }
    microDrawOrganism(ctx, speciesId, width / 2, height / 2, Math.min(width, height * 1.5) * 0.72, 0, t, { seed: 3, variant: 1, ...st });
    ctx.restore();
}

// What lies about the slide, drawn in screen units (`scale` pixels per micrometre).
function microDrawSceneryItem(ctx, item, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(item.rot);
    ctx.scale(scale, scale);
    switch (item.kind) {
        case 'grains': {
            // Mineral grains of soil, sharp-edged, some of them clear as quartz.
            const r = 14 + item.size * 34;
            const random = microRng(item.seed);
            const points = [];
            for (let i = 0; i < 7; i++) {
                const angle = (i / 7) * Math.PI * 2;
                const reach = r * (0.72 + random() * 0.4);
                points.push([Math.cos(angle) * reach, Math.sin(angle) * reach]);
            }
            ctx.beginPath();
            points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
            ctx.closePath();
            microFill(ctx, item.seed % 3 ? 'rgba(120,98,70,0.62)' : 'rgba(216,206,176,0.5)');
            microStroke(ctx, 'rgba(62,48,30,0.72)', 1.2 / scale * 0.5);
            break;
        }
        case 'pollen': {
            const r = 12 + item.size * 8;
            microOval(ctx, 0, 0, r, r);
            microFill(ctx, 'rgba(226,176,60,0.72)');
            microStroke(ctx, 'rgba(124,84,18,0.8)', 0.9);
            ctx.strokeStyle = 'rgba(124,84,18,0.7)';
            ctx.lineWidth = 0.7;
            for (let i = 0; i < 14; i++) {
                const angle = (i / 14) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
                ctx.lineTo(Math.cos(angle) * (r + 3), Math.sin(angle) * (r + 3));
                ctx.stroke();
            }
            break;
        }
        case 'fat': {
            const r = 2 + item.size * 7;
            microOval(ctx, 0, 0, r, r);
            microFill(ctx, 'rgba(250,246,226,0.72)');
            microStroke(ctx, 'rgba(120,112,84,0.62)', 0.6);
            break;
        }
        case 'starch': {
            const r = 6 + item.size * 9;
            microOval(ctx, 0, 0, r, r * 0.8);
            microFill(ctx, 'rgba(238,232,206,0.72)');
            microStroke(ctx, 'rgba(112,102,74,0.66)', 0.6);
            microOval(ctx, 0, 0, r * 0.45, r * 0.32);
            microStroke(ctx, 'rgba(112,102,74,0.42)', 0.42);
            break;
        }
        case 'fibre': {
            // A hair of wool, with the overlapping scales that make it felt.
            const length = 420 + item.size * 300;
            ctx.beginPath();
            ctx.moveTo(-length / 2, -9);
            ctx.lineTo(length / 2, -9);
            ctx.lineTo(length / 2, 9);
            ctx.lineTo(-length / 2, 9);
            ctx.closePath();
            microFill(ctx, 'rgba(226,212,170,0.56)');
            microStroke(ctx, 'rgba(112,96,62,0.72)', 1);
            ctx.strokeStyle = 'rgba(112,96,62,0.46)';
            ctx.lineWidth = 0.8;
            for (let x0 = -length / 2 + 10; x0 < length / 2; x0 += 16) {
                ctx.beginPath();
                ctx.moveTo(x0, -9);
                ctx.quadraticCurveTo(x0 + 8, 0, x0 - 2, 9);
                ctx.stroke();
            }
            break;
        }
        default: {
            const r = 1.5 + item.size * 5;
            microOval(ctx, 0, 0, r, r * 0.7);
            microFill(ctx, 'rgba(96,90,66,0.46)');
        }
    }
    ctx.restore();
}
