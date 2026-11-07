// Cultures: agar plates, the incubator that grows them, the autoclave that sterilises the dishes, and the
// water filter. What lives on a plate is decided and kept on the SERVER (pkg/network/microbes.go): a few
// numbers per plate, ticked once a second while something grows. This file draws the panel, holds a copy of
// the server's tables to say what will happen, and has the blocks, items and recipes.
// - A right click on an incubator (a tap, on a touch screen; crouch to build against it) opens its panel:
//   three plates, the temperature inside and the one it is set to, whether it has power and light, and the
//   growth curve of the plate picked. Closing it leaves everything growing, for anyone.
// - A plate goes in from the inventory (an agar plate, or one poured on a dish that skipped the autoclave),
//   is inoculated with something that carries microbes (flowers carry yeast, milk lactobacilli, dirt soil
//   bacteria, a lake sample cyanobacteria, a culture its own kind), and comes out as a culture and a dirty
//   dish once it reached 10^6 cells, or as the dirty dish alone. Nothing ever changes in the inventory.
// - Items move in two steps, like a chest's (js/game/storage.js): out of the inventory first, and what the
//   answer says comes back. `culturePending` survives a reload, and storageSync settles it.
// - The autoclave is a machine like the arc furnace (js/game/appliances.js, APPLIANCE_MACHINES.autoclave):
//   its panel is a chest's. The water filter is a tube: dipped in water it takes a filtered sample
//   (js/game/microscope.js, the server's sampleTake).
// - Every word of the panel is in js/game/cultures_text.js, in both languages.
// CULTURE_SPECIES, CULTURE_PLATES, CULTURE_ORDER and CULTURE_MODEL mirror cultureSpecies, culturePlates,
// cultureOrder and the constants of pkg/network/microbes.go (test/js/cultures.test.js checks them).
// Mixed into Game.prototype; hooked through js/extensions.js.

const CULTURE_PENDING_KEY = 'minecloud-culture-pending';
// Blocks away at which an open panel closes (the server allows 9).
const CULTURE_CLOSE_DISTANCE = 7;
// How long the server has to answer an open (milliseconds), and how long to wait before sending a dial.
const CULTURE_OPEN_MS = 6000;
const CULTURE_DIAL_MS = 450;
const CULTURE_NOTE_MS = 8000;
// The incubator's page in the guide, and those of the curve and of sterilising.
const CULTURE_GUIDE_PAGE = 253;
const CULTURE_CURVE_PAGE = 254;
const CULTURE_STERILE_PAGE = 255;

// How each species grows on agar (cultureSpecies). tmin, topt, tmax in °C; rate per second in ln units.
const CULTURE_SPECIES = {
    yeast: { tmin: 5, topt: 30, tmax: 42, rate: 0.1, item: 'culture_yeast' },
    lactobacillus: { tmin: 15, topt: 42, tmax: 48, rate: 0.1, item: 'culture_lactobacillus', penicillin: true },
    soil_bacteria: { tmin: 10, topt: 30, tmax: 45, rate: 0.065, item: 'culture_soil', penicillin: true },
    cyanobacteria: { tmin: 15, topt: 28, tmax: 38, rate: 0.065, light: true, item: 'culture_cyano' },
    mould: { tmin: 4, topt: 23, tmax: 37, rate: 0.065, item: 'culture_mould' }
};
const CULTURE_ORDER = ['yeast', 'lactobacillus', 'soil_bacteria', 'cyanobacteria', 'mould'];
// The plates, and whether each carries mould spores.
const CULTURE_PLATES = { agar_plate: false, agar_plate_unsterile: true };
// The constants of the model, by the names of the server's.
const CULTURE_MODEL = {
    logInoculum: 3, logMax: 9, logHarvest: 6, logSpores: 1, lagWork: 2, yield: 0.6, maintenance: 0.0016, death: 0.02, heatDeath: 0.01,
    mouldHold: 0.8, mouldFrom: 4, historyMax: 64, historyEvery: 4, minTarget: 5, maxTarget: 45, defaultTarget: 30, settle: 20
};
// What each looks like on a plate.
const CULTURE_COLORS = {
    yeast: [238, 226, 192], lactobacillus: [246, 243, 234], soil_bacteria: [206, 182, 140], cyanobacteria: [63, 154, 114], mould: [62, 140, 122]
};

// A kit for testing: /culturekit, only in creative mode, like /give.
const CULTURE_KIT = [
    ['incubator', 2], ['autoclave', 1], ['agar_plate', 9], ['agar_plate_unsterile', 3], ['petri_dish', 6], ['used_dish', 3], ['water_filter', 4], ['test_tube', 6],
    ['flower_red', 4], ['flower_yellow', 4], ['milk', 3], ['dirt', 4], ['sample_plains_lake_a', 2], ['sample_plains_lake_c', 2], ['wheat', 6], ['water_flask', 6],
    ['rtg', 1], ['grow_lamp', 1], ['microscope', 1], ['glass_slide', 8], ['candle', 2]
];

// ---------------------------------------------------------------------------------------
// Pure helpers (also used by test/js/cultures.test.js)

// The cardinal temperature model with inflection (Rosso et al., 1993): 0 at and outside tmin and tmax, 1 at topt.
function cultureGamma(t, kind) {
    if (t <= kind.tmin || t >= kind.tmax) return 0;
    const num = (t - kind.tmax) * (t - kind.tmin) * (t - kind.tmin);
    const den = (kind.topt - kind.tmin) * ((kind.topt - kind.tmin) * (t - kind.topt) - (kind.topt - kind.tmax) * (kind.topt + kind.tmin - 2 * t));
    return den === 0 ? 0 : Math.max(0, Math.min(1, num / den));
}

// The species a source puts on a plate, or null if nothing it holds grows on agar.
function cultureInoculum(source) {
    const species = microSpeciesOf(source);
    if (!species) return null;
    return CULTURE_ORDER.find((id) => species.includes(id)) || null;
}

// Something has happened on the plate, so it cannot go back as a clean one.
function cultureTouched(plate) {
    return Boolean(plate && (plate.main || (plate.mould && (plate.mould.logN > CULTURE_MODEL.logSpores + 0.01 || plate.mould.lag < CULTURE_MODEL.lagWork))));
}

// What a plate gives if it comes out now: { item, also } (cultureHarvestOf).
function cultureHarvestOf(plateType, plate) {
    if (!cultureTouched(plate)) return { item: plateType, also: '' };
    if (plate.mould && plate.mould.logN >= CULTURE_MODEL.logHarvest) return { item: CULTURE_SPECIES.mould.item, also: 'used_dish' };
    if (plate.main && plate.main.logN >= CULTURE_MODEL.logHarvest) return { item: CULTURE_SPECIES[plate.main.species].item, also: 'used_dish' };
    return { item: 'used_dish', also: '' };
}

// What each request takes out of the inventory and gives on success. `result` stands for the item the
// server names, and `also` for the second one it may add.
function cultureRequestItems(op, source) {
    switch (op) {
        case 'load': return { took: { [source]: 1 }, gives: {} };
        case 'inoculate': {
            // A tube comes back empty, and so does the bottle of the milk.
            const gives = microSourceInTube(source) ? { test_tube: 1 } : source === 'milk' ? { glass: 1 } : {};
            return { took: { [source]: 1 }, gives };
        }
        case 'harvest': return { took: {}, gives: { result: 1, also: 1 } };
        default: return { took: {}, gives: {} };
    }
}

// What an answer means for the inventory: the items to add, by type.
function cultureSettle(pending, outcome) {
    const done = Boolean(outcome && outcome.amount > 0);
    const items = {};
    for (const [type, count] of Object.entries(done ? pending.gives : pending.took)) {
        const real = type === 'result' ? outcome.type : type === 'also' ? outcome.also : type;
        if (real) items[real] = (items[real] || 0) + count;
    }
    return items;
}

// Whether anything on these plates can still change.
function cultureGrowing(plates) {
    return (plates || []).some((plate) => plate && ((plate.main && plate.main.logN > 0) || (plate.mould && plate.mould.logN > 0)));
}

// The line of power of an incubator: { key, off } for CULTURE_TEXT.
function culturePowerLine(contents) {
    const view = contents && contents.incubator;
    if (!view || !cultureGrowing(view.plates)) return { key: 'powerIdle', off: false };
    if (view.starting) return { key: 'powerAsking', off: false };
    return contents.powered ? { key: 'powerOn', off: false } : { key: 'powerOff', off: true };
}

function cultureRng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let z = a;
        z = Math.imul(z ^ (z >>> 15), z | 1);
        z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
        return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
}

function cultureRgba([r, g, b], alpha) {
    return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
}

// A colour faded towards grey: what is dying loses its colour.
function cultureFade(color, amount) {
    const grey = (color[0] + color[1] + color[2]) / 3;
    return color.map((c) => c + (grey * 0.8 - c) * amount);
}

// Where the colonies of a plate sit, the same every time for the same plate.
function cultureColonySpots(seed, count, radius) {
    const random = cultureRng(seed);
    const spots = [];
    for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2;
        const r = Math.sqrt(random()) * radius;
        spots.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r, size: 0.6 + random() * 0.8 });
    }
    return spots;
}

// How a population shows on a plate: nothing below 10^4.5, then colonies that grow and multiply, and from
// 10^8.7 a lawn over the whole agar.
function cultureColonies(logN) {
    if (!(logN > 4.5)) return { count: 0, grow: 0, lawn: 0 };
    const grow = Math.min(1, (logN - 4.5) / 4.2);
    return { count: Math.min(36, Math.floor(3 + grow * 33)), grow, lawn: Math.max(0, Math.min(1, (logN - 8.2) / 0.8)) };
}

// Draws a plate seen from above in a canvas of `size` pixels: the dish, the agar, and what grows on it.
// The mould's colonies clear a halo in bacteria that penicillin holds back: Fleming's plate.
function cultureDrawPlate(ctx, size, plateType, plate, seed) {
    const c = size / 2;
    const R = size * 0.46;
    ctx.clearRect(0, 0, size, size);
    // The dish.
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(214,232,240,0.35)';
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.025);
    ctx.strokeStyle = 'rgba(220,236,244,0.9)';
    ctx.stroke();
    if (!plateType) return;
    // The agar: amber, darker as it is eaten.
    const food = plate ? Math.max(0, Math.min(1, plate.nutrient)) : 1;
    const agar = [214 - (1 - food) * 40, 186 - (1 - food) * 50, 118 - (1 - food) * 40];
    const inner = R * 0.9;
    ctx.beginPath();
    ctx.arc(c, c, inner, 0, Math.PI * 2);
    ctx.fillStyle = cultureRgba(agar, 0.92);
    ctx.fill();
    if (!plate) return;
    const main = plate.main;
    const mould = plate.mould;
    const mouldShow = mould ? cultureColonies(mould.logN + 1) : { count: 0 };
    const mouldSpots = mould ? cultureColonySpots(seed + 7, Math.min(4, Math.max(1, Math.floor(mould.logN / 2.5))), inner * 0.6) : [];
    if (main) {
        const kind = CULTURE_SPECIES[main.species];
        const show = cultureColonies(main.logN);
        const color = cultureFade(CULTURE_COLORS[main.species], main.phase === 'death' ? 0.7 : 0);
        if (show.lawn > 0) {
            ctx.beginPath();
            ctx.arc(c, c, inner * 0.97, 0, Math.PI * 2);
            ctx.fillStyle = cultureRgba(color, 0.55 * show.lawn);
            ctx.fill();
        }
        for (const spot of cultureColonySpots(seed, show.count, inner * 0.86)) {
            ctx.beginPath();
            ctx.arc(c + spot.x, c + spot.y, Math.max(0.8, size * (0.012 + 0.03 * show.grow) * spot.size), 0, Math.PI * 2);
            ctx.fillStyle = cultureRgba(color, 0.95);
            ctx.fill();
            ctx.lineWidth = Math.max(0.5, size * 0.006);
            ctx.strokeStyle = cultureRgba(cultureFade(color, 0.3).map((v) => v * 0.7), 0.7);
            ctx.stroke();
        }
        // Where penicillin seeps out of the mould, bacteria do not grow: a clear ring of agar.
        if (kind && kind.penicillin && mould && mould.logN > CULTURE_MODEL.mouldFrom && show.count > 0) {
            const reach = size * 0.05 * Math.min(1, (mould.logN - CULTURE_MODEL.mouldFrom) / 4);
            for (const spot of mouldSpots) {
                ctx.beginPath();
                ctx.arc(c + spot.x, c + spot.y, size * (0.03 + 0.08 * mouldShow.grow) * spot.size + reach, 0, Math.PI * 2);
                ctx.fillStyle = cultureRgba(agar, 0.97);
                ctx.fill();
            }
        }
    }
    if (mould && mouldShow.count > 0) {
        const color = cultureFade(CULTURE_COLORS.mould, mould.phase === 'death' ? 0.6 : 0);
        for (const spot of mouldSpots) {
            const r = size * (0.03 + 0.08 * mouldShow.grow) * spot.size;
            // A white fringe of young threads round a blue-green velvet of spores.
            ctx.beginPath();
            ctx.arc(c + spot.x, c + spot.y, r * 1.18, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(244,246,240,0.92)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(c + spot.x, c + spot.y, r, 0, Math.PI * 2);
            ctx.fillStyle = cultureRgba(color, 0.95);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(c + spot.x - r * 0.25, c + spot.y - r * 0.25, r * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = cultureRgba(color.map((v) => Math.min(255, v + 40)), 0.6);
            ctx.fill();
        }
    }
}

// Draws the growth curve of a plate in a canvas of w x h: log10 of the cells (0 to 9) over its time, a line
// for what was sown and a dashed one for the mould, and the line of a culture at 10^6. `labels` are its words.
function cultureDrawGraph(ctx, w, h, plate, labels) {
    ctx.clearRect(0, 0, w, h);
    const left = 26;
    const right = 8;
    const top = 8;
    const bottom = 18;
    const gw = w - left - right;
    const gh = h - top - bottom;
    const yOf = (log) => top + gh * (1 - Math.max(0, Math.min(9, log)) / 9);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(left, top, gw, gh);
    ctx.font = '10px Consolas, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (const log of [0, 3, 6, 9]) {
        ctx.beginPath();
        ctx.moveTo(left, yOf(log));
        ctx.lineTo(left + gw, yOf(log));
        ctx.stroke();
        ctx.fillText(String(log), 6, yOf(log) + 3);
    }
    // The line a plate must reach to give a culture.
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(255,214,110,0.75)';
    ctx.beginPath();
    ctx.moveTo(left, yOf(CULTURE_MODEL.logHarvest));
    ctx.lineTo(left + gw, yOf(CULTURE_MODEL.logHarvest));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,214,110,0.85)';
    ctx.fillText(labels.harvest, left + gw - ctx.measureText(labels.harvest).width - 2, yOf(CULTURE_MODEL.logHarvest) - 3);
    const points = (plate && plate.history) || [];
    if (points.length < 1) return;
    const span = Math.max(points.length - 1, CULTURE_MODEL.historyMax / 2) * (plate.every || CULTURE_MODEL.historyEvery);
    const xOf = (i) => left + (gw * i * (plate.every || CULTURE_MODEL.historyEvery)) / span;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(labels.time(Math.round(span)), left + gw - 40, h - 5);
    ctx.fillText('0', left, h - 5);
    const series = [
        [0, plate.main ? CULTURE_COLORS[plate.main.species] : null, []],
        [1, CULTURE_COLORS.mould, [5, 3]]
    ];
    for (const [column, color, dash] of series) {
        if (!color) continue;
        ctx.setLineDash(dash);
        ctx.strokeStyle = cultureRgba(column === 0 && plate.main.species === 'lactobacillus' ? [200, 180, 230] : color, 1);
        ctx.lineWidth = 2;
        ctx.beginPath();
        let drawing = false;
        points.forEach((point, i) => {
            const value = point[column];
            if (value < 0) {
                drawing = false;
                return;
            }
            if (drawing) ctx.lineTo(xOf(i), yOf(value));
            else ctx.moveTo(xOf(i), yOf(value));
            drawing = true;
        });
        ctx.stroke();
    }
    ctx.setLineDash([]);
}

// ---------------------------------------------------------------------------------------
// Items (12x12 sprites; '.' is transparent)

const CULTURE_SPRITES = {
    dish: [
        '............',
        '............',
        '...gggggg...',
        '..gLLLLLLg..',
        '.gLLLLLLLLg.',
        '.gLLLHLLLLg.',
        '.gLLLLLLLLg.',
        '.gLLLLLLLLg.',
        '..gLLLLLLg..',
        '...gggggg...',
        '............',
        '............'
    ],
    plate: [
        '............',
        '............',
        '...gggggg...',
        '..gAAAAAAg..',
        '.gAAAAAAAAg.',
        '.gAAHAAADAg.',
        '.gAAAAAAAAg.',
        '.gADAAAAAAg.',
        '..gAAAAAAg..',
        '...gggggg...',
        '............',
        '............'
    ],
    vial: [
        '....cccc....',
        '....cccc....',
        '....gggg....',
        '....g..g....',
        '....g..g....',
        '....gLLg....',
        '....gLHg....',
        '....gLLg....',
        '....gLLg....',
        '....gLLg....',
        '.....gg.....',
        '............'
    ],
    filter: [
        '....gggg....',
        '....g..g....',
        '....gSSg....',
        '....gSSg....',
        '....gKKg....',
        '....gKKg....',
        '....gSSg....',
        '....gWWg....',
        '.....gg.....',
        '.....gg.....',
        '......g.....',
        '............'
    ]
};

const CULTURE_ITEMS = {
    petri_dish: { name: 'Petri Dish', sprite: CULTURE_SPRITES.dish, palette: { g: 0xcfe9f2, L: 0xeaf6fb, H: 0xffffff }, color: 0xeaf6fb },
    agar_plate: { name: 'Agar Plate', sprite: CULTURE_SPRITES.plate, palette: { g: 0xcfe9f2, A: 0xd8b874, H: 0xf0dca8, D: 0xd8b874 }, color: 0xd8b874 },
    agar_plate_unsterile: { name: 'Unsterile Agar Plate', sprite: CULTURE_SPRITES.plate, palette: { g: 0xb8c8cc, A: 0xc8aa70, H: 0xe2cc9c, D: 0x9aa48a }, color: 0xc8aa70 },
    used_dish: { name: 'Used Dish', sprite: CULTURE_SPRITES.plate, palette: { g: 0xb8c4c8, A: 0xb0a890, H: 0xc8c0a8, D: 0x8a9a7a }, color: 0xb0a890 },
    water_filter: { name: 'Water Filter', sprite: CULTURE_SPRITES.filter, palette: { g: 0xcfe9f2, S: 0xe0cc98, K: 0x2a2a2e, W: 0xa8d0e8 }, color: 0x2a2a2e },
    culture_yeast: { name: 'Yeast Culture', sprite: CULTURE_SPRITES.vial, palette: { c: 0xd8c8a0, g: 0xcfe9f2, L: 0xeee2c0, H: 0xfff8e8 }, color: 0xeee2c0 },
    culture_lactobacillus: { name: 'Lactobacillus Culture', sprite: CULTURE_SPRITES.vial, palette: { c: 0xb8a8d0, g: 0xcfe9f2, L: 0xf4f1ea, H: 0xffffff }, color: 0xf4f1ea },
    culture_soil: { name: 'Soil Bacteria Culture', sprite: CULTURE_SPRITES.vial, palette: { c: 0x8a6a44, g: 0xcfe9f2, L: 0xceb68c, H: 0xe8d8b8 }, color: 0xceb68c },
    culture_cyano: { name: 'Cyanobacteria Culture', sprite: CULTURE_SPRITES.vial, palette: { c: 0x2a6a50, g: 0xcfe9f2, L: 0x3f9a72, H: 0x7cc8a2 }, color: 0x3f9a72 },
    culture_mould: { name: 'Mould Culture', sprite: CULTURE_SPRITES.vial, palette: { c: 0x2a5a50, g: 0xcfe9f2, L: 0x3e8c7a, H: 0xf4f6f0 }, color: 0x3e8c7a }
};

Object.entries(CULTURE_ITEMS).forEach(([id, item]) => {
    registerItemType(id, { color: item.color, name: item.name, drawIcon: resourcesDrawSprite(item.sprite, item.palette), displayMesh: resourcesDisplayMesh });
});
// A filtered sample is a tube of clear water, like the others.
microscopeItem('sample_filtered', 'Filtered Sample', MICROSCOPE_TUBE, { L: 0xd4ecf6, H: 0xf4fbff }, 0xd4ecf6);

// ---------------------------------------------------------------------------------------
// Blocks

// The incubator: a steel cabinet with a glass door, shelves and a small display. Facing north as the rest.
furnShape('incubator', {
    boxes: [[1, 0, 1, 15, 14, 15], [3, 14, 3, 13, 15, 13]],
    collision: [[1, 0, 1, 15, 15, 15]]
});

// The autoclave: a round steel vessel on a stand, with its lid, gauge and valve.
furnShape('autoclave', {
    boxes: [[2, 0, 2, 14, 2, 14], [3, 2, 3, 13, 11, 13], [2, 11, 2, 14, 12.5, 14], [6, 12.5, 6, 10, 13.5, 10], [7.4, 13.5, 7.4, 8.6, 15.5, 8.6], [6.5, 6, 2.2, 9.5, 9, 3]],
    collision: [[2, 0, 2, 14, 15, 14]]
});

// White enamel, a little worn at the edges.
function culturePaintEnamel(f, s, u, v, seed, base) {
    const edge = Math.min(u, 1 - u, v, 1 - v) < 0.05;
    return f.tone(s, f.rgb(base), edge ? -0.22 : (f.fbm(u, v, 4, 2, seed) - 0.5) * 0.06);
}

registerTexturePattern('incubator_side', (f, s, tint, seed) => {
    f.each(s, (x, y, u, v) => f.put(s, x, y, culturePaintEnamel(f, s, u, v, seed, 0xe4e8ea), 0.6));
}, { rtx: { roughness: 0.4, metalness: 0.15, normalScale: 0.3 } });

// The door: a glass window over shelves of plates, and a red display at the top.
registerTexturePattern('incubator_front', (f, s, tint, seed) => {
    f.each(s, (x, y, u, v) => {
        let c = culturePaintEnamel(f, s, u, v, seed, 0xe4e8ea);
        let h = 0.6;
        const glass = u > 0.14 && u < 0.86 && v > 0.24 && v < 0.9;
        if (v > 0.07 && v < 0.17 && u > 0.55 && u < 0.86) { c = f.rgb(v > 0.09 && v < 0.15 && u > 0.58 && u < 0.83 ? 0xd2382c : 0x22252a); h = 0.4; }
        if (glass) {
            c = f.tone(s, f.rgb(0x9cc4d2), (f.hash(x, y, seed) - 0.5) * 0.05);
            h = 0.9;
            // Shelves, each with plates on it.
            for (const shelf of [0.45, 0.65, 0.85]) {
                if (Math.abs(v - shelf) < 0.012) c = f.rgb(0x8a9298);
                if (v > shelf - 0.06 && v < shelf - 0.012) {
                    const k = ((u - 0.14) / 0.72) * 3;
                    if (Math.abs(k - Math.floor(k) - 0.5) < 0.38) c = f.rgb(shelf === 0.65 ? 0xd8b874 : 0xe6d4a0);
                }
            }
            if (u + (1 - v) * 0.4 > 0.5 && u + (1 - v) * 0.4 < 0.56) c = f.tone(s, c, 0.25);
        }
        if (Math.abs(u - 0.09) < 0.02 && v > 0.45 && v < 0.7) { c = f.rgb(0x9aa2a8); h = 0.8; }
        f.put(s, x, y, c, h);
    });
}, { rtx: { roughness: 0.3, metalness: 0.2, normalScale: 0.3 } });

// Brushed steel, for the autoclave; with a gauge on the front.
function culturePaintSteel(f, s, u, v, seed) {
    return f.tone(s, f.rgb(0xb4bcc2), (Math.sin(v * 90 + f.fbm(u, v, 3, 2, seed) * 6) * 0.04) + (f.hash(Math.floor(u * s.size), Math.floor(v * s.size), seed) - 0.5) * 0.05);
}
registerTexturePattern('autoclave_side', (f, s, tint, seed) => {
    f.each(s, (x, y, u, v) => {
        let c = culturePaintSteel(f, s, u, v, seed);
        if (v > 0.84 || (v > 0.2 && v < 0.24)) c = f.tone(s, c, -0.25);
        f.put(s, x, y, c, 0.8);
    });
}, { rtx: { roughness: 0.25, metalness: 0.85, normalScale: 0.25 } });
registerTexturePattern('autoclave_front', (f, s, tint, seed) => {
    f.each(s, (x, y, u, v) => {
        let c = culturePaintSteel(f, s, u, v, seed);
        if (v > 0.84 || (v > 0.2 && v < 0.24)) c = f.tone(s, c, -0.25);
        const r = Math.hypot(u - 0.5, v - 0.47);
        if (r < 0.12) {
            c = f.rgb(r > 0.1 ? 0x30343a : 0xf2f0e6);
            const angle = Math.atan2(v - 0.47, u - 0.5);
            if (r < 0.09 && Math.abs(angle + 0.6) < 0.12) c = f.rgb(0xc0302a);
        }
        f.put(s, x, y, c, 0.8);
    });
}, { rtx: { roughness: 0.25, metalness: 0.85, normalScale: 0.25 } });
registerTexturePattern('autoclave_top', (f, s, tint, seed) => {
    f.each(s, (x, y, u, v) => {
        const r = Math.hypot(u - 0.5, v - 0.5);
        let c = culturePaintSteel(f, s, u, v, seed);
        if (r > 0.3 && r < 0.33) c = f.tone(s, c, -0.3);
        if (r < 0.06) c = f.rgb(0x2c2f34);
        f.put(s, x, y, c, 0.8);
    });
}, { rtx: { roughness: 0.25, metalness: 0.85, normalScale: 0.25 } });

furnBlock('incubator', {
    color: 0xE4E8EA, name: 'Incubator', shape: 'incubator', breakDuration: 0.8, category: 'stone', storageSlots: 3, electric: true,
    faces: { top: 'incubator_side', side: 'incubator_side', bottom: 'incubator_side', front: 'incubator_front' }
});
furnBlock('autoclave', {
    color: 0xB4BCC2, name: 'Autoclave', shape: 'autoclave', breakDuration: 1, category: 'stone', storageSlots: 3, electric: true,
    faces: { top: 'autoclave_top', side: 'autoclave_side', bottom: 'autoclave_side', front: 'autoclave_front' }
});

registerGameContent(({ addItem, addRecipe }) => {
    ['incubator', 'autoclave', ...Object.keys(CULTURE_ITEMS), 'sample_filtered'].forEach(addItem);
    addRecipe('incubator', 'Build Incubator', 'incubator', 1, [{ type: 'iron_ore', amount: 4 }, { type: 'glass', amount: 2 }, { type: 'thermometer', amount: 1 }]);
    addRecipe('autoclave', 'Build Autoclave', 'autoclave', 1, [{ type: 'iron_block', amount: 3 }, { type: 'glass', amount: 1 }]);
    addRecipe('petri_dish', 'Blow Petri Dishes', 'petri_dish', 2, [{ type: 'glass', amount: 1 }]);
    // Wheat stands for the nutrients, as the guide says (page 253): agar itself is a seaweed's jelly.
    addRecipe('agar_plate', 'Pour Agar Plate', 'agar_plate', 1, [{ type: 'petri_dish', amount: 1 }, { type: 'wheat', amount: 1 }, { type: 'water_flask', amount: 1 }]);
    // On a dish that skipped the autoclave: it looks the same, and it carries mould spores.
    addRecipe('agar_plate_unsterile', 'Pour Agar Plate on a Used Dish', 'agar_plate_unsterile', 1, [{ type: 'used_dish', amount: 1 }, { type: 'wheat', amount: 1 }, { type: 'water_flask', amount: 1 }]);
    addRecipe('water_filter', 'Make Water Filter', 'water_filter', 1, [{ type: 'sand', amount: 1 }, { type: 'coal_ore', amount: 1 }, { type: 'test_tube', amount: 1 }]);
});

// ---------------------------------------------------------------------------------------
// The panel

const CULTURE_CSS = `
#culture-panel{position:fixed;inset:max(6px,env(safe-area-inset-top)) max(6px,env(safe-area-inset-right)) max(6px,env(safe-area-inset-bottom)) max(6px,env(safe-area-inset-left));margin:auto;width:min(820px,calc(100vw - 12px));max-height:calc(100% - 12px);height:fit-content;display:none;flex-direction:column;gap:8px;padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(8,12,20,.95);color:#fff;font-family:'Consolas',monospace;z-index:275;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y}
#culture-panel.visible{display:flex}
#culture-panel button{min-height:40px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:700 13px/1.1 'Consolas',monospace;cursor:pointer;touch-action:manipulation}
#culture-panel button:disabled{opacity:.38;cursor:default}
#culture-panel button.active{background:rgba(120,190,255,.4);border-color:rgba(160,210,255,.8)}
#culture-panel .culture-head{display:flex;align-items:center;gap:8px}
#culture-panel h3{font-size:16px;margin:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.culture-temp{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px}
.culture-big{font-size:26px;font-weight:700;min-width:96px}
.culture-big small{display:block;font-size:11px;font-weight:400;opacity:.7}
.culture-dial{display:flex;align-items:center;gap:6px;flex:1 1 260px;min-width:0}
#culture-target{flex:1;min-width:80px;height:28px;accent-color:#ffb36b}
#culture-target-value{min-width:56px;text-align:center;font-weight:700}
.culture-lines{font-size:12px;line-height:1.35;display:flex;flex-direction:column;gap:2px}
.culture-lines .off{color:#ffc27a}
.culture-plates{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.culture-card{display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);min-width:0;cursor:pointer}
.culture-card.picked{border-color:rgba(160,210,255,.8);background:rgba(120,190,255,.1)}
.culture-card canvas{width:100%;max-width:120px;aspect-ratio:1;height:auto}
.culture-card .culture-name{font-weight:700;font-size:12px;text-align:center;min-height:15px}
.culture-card .culture-info{font-size:11px;line-height:1.3;text-align:center;opacity:.85;min-height:42px;overflow-wrap:anywhere}
.culture-card .culture-buttons{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;width:100%}
.culture-card .culture-buttons button{flex:1 1 70px;min-width:0;font-size:12px;padding:0 4px}
#culture-graph-title{font-size:12px;opacity:.8}
#culture-graph{width:100%;height:150px;display:block}
#culture-note{font-size:12px;color:#ffe9a8;min-height:15px}
#culture-hint{font-size:12px;opacity:.7;line-height:1.35}
#culture-pop{display:none;flex-direction:column;gap:6px;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:rgba(16,22,34,.98);font-size:12px;line-height:1.32}
#culture-pop.visible{display:flex}
#culture-pop .culture-choice{display:flex;align-items:center;gap:8px;width:100%;text-align:left;font-weight:400;font-size:12px}
#culture-pop .culture-choice i{flex:0 0 26px;width:26px;height:26px;background:center/contain no-repeat;image-rendering:pixelated}
@media (max-width:420px){.culture-card .culture-info{font-size:10px}.culture-big{font-size:22px;min-width:80px}}
`;

Object.assign(Game.prototype, {
    cultureLoadPending() {
        this.culturePending = new Map();
        this.cultureNextSync = 0;
        try {
            const saved = JSON.parse(window.localStorage.getItem(CULTURE_PENDING_KEY) || '[]');
            for (const entry of saved) {
                if (entry && entry.reqId && entry.took && entry.gives) this.culturePending.set(entry.reqId, { took: entry.took, gives: entry.gives, op: entry.op, at: 0 });
            }
        } catch (_error) {
            // Nothing readable: nothing to resume.
        }
    },

    cultureSavePending() {
        try {
            const entries = [...this.culturePending.entries()].map(([reqId, entry]) => ({ reqId, took: entry.took, gives: entry.gives, op: entry.op }));
            window.localStorage.setItem(CULTURE_PENDING_KEY, JSON.stringify(entries));
        } catch (_error) {
            // Blocked storage: it lasts until the page reloads.
        }
    },

    // A name in the language of the game.
    cultureName(type) {
        return cultureItemName(type, this.getBlockDisplayName(type));
    },

    cultureSpeciesName(id) {
        const text = typeof microscopeSpeciesText === 'function' ? microscopeSpeciesText(id) : null;
        return text ? text.name : id;
    },

    // ---- Requests ----

    // Sends a request: what it uses leaves the inventory now, and the answer settles the rest.
    cultureRequest(message, op, payload, source) {
        if (!this.network || !this.network.connected) {
            this.receiveSystemMessage({ text: cultureSay('notConnected') });
            return false;
        }
        const { took, gives } = cultureRequestItems(op, source);
        for (const [type, count] of Object.entries(took)) {
            if (this.getInventoryCount(type) < count) return false;
        }
        for (const [type, count] of Object.entries(took)) this.inventoryCounts[type] = this.getInventoryCount(type) - count;
        const reqId = this.storageNewRequestId();
        this.culturePending.set(reqId, { took, gives, op, at: performance.now() });
        this.cultureSavePending();
        this.cultureInventoryChanged();
        this.network.send(message, { ...payload, reqId });
        return true;
    },

    cultureInventoryChanged() {
        this.updateHotbarCounts();
        this.refreshHeldItemMesh();
        this.renderCraftingPanel();
        this.renderInventoryPanel();
        this.saveInventoryState();
        if (this.cultureChoosing) this.cultureRenderPop();
    },

    // An answer to any request of this file. Anything else (a chest's, the microscope's) is left alone.
    cultureOnOutcome(outcome) {
        const pending = outcome && this.culturePending && this.culturePending.get(outcome.reqId);
        if (!pending) return;
        this.culturePending.delete(outcome.reqId);
        this.cultureSavePending();
        const items = cultureSettle(pending, outcome);
        for (const [type, count] of Object.entries(items)) {
            if (count > 0 && this.world.blockTypes[type]) this.addInventory(type, count);
        }
        this.cultureInventoryChanged();
        if (outcome.amount > 0) {
            this.playPickupSound();
            if (pending.op === 'harvest') {
                const line = outcome.also ? cultureSay('gotCulture', this.cultureName(outcome.type)) : outcome.type === 'used_dish' ? cultureSay('gotDish') : '';
                if (line) this.cultureSetNote(line);
            }
        } else if (outcome.reason) {
            const lines = CULTURE_TEXT.refused[gameLang()];
            const line = lines[outcome.reason] || lines.other;
            if (this.cultureAt) this.cultureSetNote(line);
            else this.receiveSystemMessage({ text: line });
        }
    },

    cultureSetNote(line) {
        this.cultureNote = line;
        this.cultureNoteAt = performance.now();
        this.cultureRenderLines();
    },

    // ---- Opening and closing ----

    // Returns whether the click was on an incubator.
    cultureTryOpen(position) {
        const type = this.world.getBlockTypeAt(position.x, position.y, position.z);
        if (!type || storageBaseName(type) !== 'incubator') return false;
        if (!this.network || !this.network.connected) {
            this.receiveSystemMessage({ text: cultureSay('notConnected') });
            return true;
        }
        this.cultureBuildPanel();
        this.cultureAt = { x: position.x, y: position.y, z: position.z };
        this.cultureContents = null;
        this.cultureRev = -1;
        this.culturePicked = this.culturePicked ?? 0;
        this.cultureChoosing = null;
        this.cultureDial = null;
        this.cultureNote = '';
        this.cultureOpenedAt = performance.now();
        this.stopMining();
        // Losing the pointer lock would otherwise open the pause menu.
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.culturePanel.classList.add('visible');
        this.network.send('storageOpen', { ...this.cultureAt });
        this.cultureRender();
        this.updatePointerLockHint();
        return true;
    },

    cultureClose() {
        if (!this.cultureAt) return;
        this.cultureSendDial();
        this.cultureAt = null;
        this.cultureContents = null;
        this.cultureChoosing = null;
        this.culturePanel.classList.remove('visible');
        if (this.network && this.network.connected) this.network.send('storageClose', {});
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        this.recapturePointerLock();
        this.updatePointerLockHint();
    },

    // Escape closes the chooser first, then the panel.
    cultureEscape() {
        if (this.cultureChoosing) {
            this.cultureChoosing = null;
            this.cultureRenderPop();
            return true;
        }
        return false;
    },

    // ---- Messages from the server ----

    cultureOnContents(contents) {
        const at = this.cultureAt;
        if (!at || !contents || !Array.isArray(contents.slots)) return;
        if (contents.x !== at.x || contents.y !== at.y || contents.z !== at.z) return;
        if (contents.rev < this.cultureRev) return;
        this.cultureRev = contents.rev;
        this.cultureContents = contents;
        this.cultureRender();
    },

    cultureOnClosed(where) {
        const at = this.cultureAt;
        if (at && where && where.x === at.x && where.y === at.y && where.z === at.z) this.cultureClose();
    },

    // ---- Every frame ----

    cultureUpdate() {
        if (!this.network) return;
        if (!this.cultureListening) {
            this.cultureListening = true;
            this.network.on('storageResult', (outcome) => this.cultureOnOutcome(outcome));
            this.network.on('storageContents', (contents) => this.cultureOnContents(contents));
            this.network.on('storageClosed', (where) => this.cultureOnClosed(where));
        }
        const now = performance.now();
        if (this.culturePending && this.culturePending.size > 0 && this.network.connected && now >= this.cultureNextSync) {
            const late = [...this.culturePending.entries()].filter(([, entry]) => now - entry.at >= STORAGE_SYNC_AFTER).map(([id]) => id);
            if (late.length > 0) {
                this.cultureNextSync = now + STORAGE_SYNC_EVERY;
                this.network.send('storageSync', { reqIds: late.slice(0, STORAGE_SYNC_MAX) });
            }
        }
        const at = this.cultureAt;
        if (!at) return;
        if (this.cultureDial && now - this.cultureDial.at > CULTURE_DIAL_MS) this.cultureSendDial();
        if (this.cultureNote && now - this.cultureNoteAt > CULTURE_NOTE_MS) {
            this.cultureNote = '';
            this.cultureRenderLines();
        }
        if (!this.cultureContents && now - this.cultureOpenedAt > CULTURE_OPEN_MS) {
            this.cultureClose();
            this.receiveSystemMessage({ text: cultureSay('timeout') });
            return;
        }
        const block = this.world.getBlockTypeAt(at.x, at.y, at.z);
        const eye = this.cameraController.camera.position;
        const far = Math.hypot(eye.x - at.x - 0.5, eye.y - at.y - 0.5, eye.z - at.z - 0.5) > CULTURE_CLOSE_DISTANCE;
        if (!block || storageBaseName(block) !== 'incubator' || far || !this.network.connected || this.respawnPending) this.cultureClose();
    },

    // ---- Actions ----

    cultureTarget() {
        if (this.cultureDial) return this.cultureDial.target;
        const view = this.cultureContents && this.cultureContents.incubator;
        return view ? view.target : CULTURE_MODEL.defaultTarget;
    },

    // The dial moves at once here; the server hears once it stops.
    cultureSetTarget(value) {
        const target = Math.round(Math.max(CULTURE_MODEL.minTarget, Math.min(CULTURE_MODEL.maxTarget, value)));
        this.cultureDial = { target, at: performance.now() };
        this.cultureRenderTemp();
    },

    cultureSendDial() {
        const dial = this.cultureDial;
        if (!dial || !this.cultureAt) return;
        this.cultureDial = null;
        const view = this.cultureContents && this.cultureContents.incubator;
        if (view && view.target === dial.target) return;
        if (view) view.target = dial.target;
        this.cultureRequest('cultureSet', 'set', { ...this.cultureAt, target: dial.target });
    },

    cultureChoose(op, slot) {
        this.culturePicked = slot;
        this.cultureChoosing = { op, slot };
        this.cultureRender();
    },

    cultureApply(op, slot, source) {
        this.cultureChoosing = null;
        const messages = { load: 'cultureLoad', inoculate: 'cultureInoculate', harvest: 'cultureHarvest' };
        this.cultureRequest(messages[op], op, { ...this.cultureAt, slot, ...(source ? { source } : {}) }, source);
        this.cultureRender();
    },

    // What can go in the chooser now: plates, or what carries something that grows.
    cultureChoices(op) {
        return this.inventory.filter((type) => this.getInventoryCount(type) > 0 && this.world.blockTypes[type] &&
            (op === 'load' ? Object.prototype.hasOwnProperty.call(CULTURE_PLATES, type) : Boolean(cultureInoculum(type))));
    },

    cultureOpenGuide(page = CULTURE_GUIDE_PAGE) {
        if (typeof this.guideShow !== 'function') return;
        this.cultureClose();
        this.guideShow(String(page));
    },

    // ---- Drawing ----

    cultureBuildPanel() {
        if (this.culturePanel) return;
        const style = document.createElement('style');
        style.textContent = CULTURE_CSS;
        document.head.appendChild(style);
        const panel = document.createElement('div');
        panel.id = 'culture-panel';
        panel.innerHTML = `
            <div class="culture-head">
                <h3></h3>
                <button class="culture-guide" type="button"></button>
                <button class="culture-close" type="button">✕</button>
            </div>
            <div class="culture-temp">
                <div class="culture-big" id="culture-inside"></div>
                <div class="culture-dial">
                    <button class="culture-colder" type="button">−</button>
                    <input id="culture-target" type="range" min="${CULTURE_MODEL.minTarget}" max="${CULTURE_MODEL.maxTarget}" step="1">
                    <button class="culture-warmer" type="button">+</button>
                    <div id="culture-target-value"></div>
                </div>
            </div>
            <div class="culture-lines" id="culture-lines"></div>
            <div class="culture-plates" id="culture-plates"></div>
            <div id="culture-pop"></div>
            <div id="culture-note"></div>
            <div id="culture-graph-title"></div>
            <canvas id="culture-graph" width="760" height="150"></canvas>
            <div id="culture-hint"></div>`;
        panel.querySelector('.culture-close').addEventListener('click', () => this.cultureClose());
        panel.querySelector('.culture-guide').addEventListener('click', () => this.cultureOpenGuide());
        panel.querySelector('.culture-colder').addEventListener('click', () => this.cultureSetTarget(this.cultureTarget() - 1));
        panel.querySelector('.culture-warmer').addEventListener('click', () => this.cultureSetTarget(this.cultureTarget() + 1));
        panel.querySelector('#culture-target').addEventListener('input', (event) => this.cultureSetTarget(Number(event.target.value)));
        // Three cards, built once: what changes is drawn into them.
        const plates = panel.querySelector('#culture-plates');
        for (let slot = 0; slot < STORAGE_KINDS.incubator; slot++) {
            const card = document.createElement('div');
            card.className = 'culture-card';
            card.dataset.slot = slot;
            card.innerHTML = `<div class="culture-name"></div><canvas width="160" height="160"></canvas><div class="culture-info"></div><div class="culture-buttons"></div>`;
            card.addEventListener('click', (event) => {
                if (event.target.closest('button')) return;
                this.culturePicked = slot;
                this.cultureRender();
            });
            plates.appendChild(card);
        }
        // Clicks inside the panel must not reach the game (which would try to grab the pointer).
        panel.addEventListener('mousedown', (event) => event.stopPropagation());
        panel.addEventListener('pointerdown', (event) => event.stopPropagation());
        document.body.appendChild(panel);
        this.culturePanel = panel;
        // Clicking outside closes it, like the other panels; not the click that opened it, nor the mouse
        // event a phone makes up after a tap (phones close it with its ✕).
        document.addEventListener('mousedown', (event) => {
            if (!this.cultureAt || performance.now() - this.cultureOpenedAt < 150) return;
            if (this.touchControlsEnabled && this.touchIsEmulatedMouse(event)) return;
            this.cultureClose();
        });
        // E closes it too; nothing else reaches the game while it is open. Escape goes through the modal panels.
        document.addEventListener('keydown', (event) => {
            if (!this.cultureAt || event.code === 'Escape') return;
            if (event.code === 'KeyE') {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (!event.repeat) this.cultureClose();
                return;
            }
            event.stopImmediatePropagation();
        }, true);
    },

    cultureRender() {
        const panel = this.culturePanel;
        if (!panel || !this.cultureAt) return;
        panel.querySelector('h3').textContent = cultureSay('title');
        panel.querySelector('.culture-guide').textContent = cultureSay('guide');
        panel.querySelector('.culture-guide').title = cultureSay('guideTip');
        panel.querySelector('.culture-close').title = cultureSay('close');
        panel.querySelector('.culture-colder').title = cultureSay('colder');
        panel.querySelector('.culture-warmer').title = cultureSay('warmer');
        panel.querySelector('#culture-hint').textContent = cultureSay('hint');
        this.cultureRenderTemp();
        this.cultureRenderLines();
        this.cultureRenderPlates();
        this.cultureRenderPop();
        this.cultureRenderGraph();
    },

    cultureRenderTemp() {
        const panel = this.culturePanel;
        if (!panel || !this.cultureAt) return;
        const view = this.cultureContents && this.cultureContents.incubator;
        const inside = panel.querySelector('#culture-inside');
        inside.innerHTML = '';
        inside.append(view ? `${view.inside.toFixed(1)} °C` : '…');
        const label = document.createElement('small');
        label.textContent = cultureSay('inside');
        inside.appendChild(label);
        const target = this.cultureTarget();
        const slider = panel.querySelector('#culture-target');
        if (Number(slider.value) !== target) slider.value = String(target);
        panel.querySelector('#culture-target-value').textContent = `${cultureSay('target')} ${target} °C`;
    },

    cultureRenderLines() {
        const panel = this.culturePanel;
        if (!panel || !this.cultureAt) return;
        const lines = panel.querySelector('#culture-lines');
        lines.innerHTML = '';
        const contents = this.cultureContents;
        const view = contents && contents.incubator;
        panel.querySelector('#culture-note').textContent = this.cultureNote || '';
        if (!view) return;
        const watts = ELECTRIC_KINDS.incubator.watts;
        const power = culturePowerLine(contents);
        const add = (text, off = false) => {
            const line = document.createElement('div');
            line.textContent = text;
            if (off) line.className = 'off';
            lines.appendChild(line);
        };
        add(cultureSay(power.key, watts), power.off);
        add(cultureSay('ambient', view.ambient.toFixed(1)));
        const needsLight = (view.plates || []).some((plate) => plate && plate.main && CULTURE_SPECIES[plate.main.species] && CULTURE_SPECIES[plate.main.species].light);
        if (needsLight || view.lit) add(cultureSay(view.lit ? 'lightYes' : 'lightNo'), !view.lit);
    },

    cultureRenderPlates() {
        const panel = this.culturePanel;
        const contents = this.cultureContents;
        const view = contents && contents.incubator;
        panel.querySelectorAll('.culture-card').forEach((card) => {
            const slot = Number(card.dataset.slot);
            const plateType = contents && contents.slots[slot] && contents.slots[slot].count > 0 ? contents.slots[slot].type : '';
            const plate = view && view.plates ? view.plates[slot] : null;
            card.classList.toggle('picked', slot === this.culturePicked);
            card.querySelector('.culture-name').textContent = cultureSay('slot', slot + 1);
            const seed = ((this.cultureAt.x * 73856093) ^ (this.cultureAt.z * 19349663) ^ (slot * 83492791)) >>> 0;
            const canvas = card.querySelector('canvas');
            cultureDrawPlate(canvas.getContext('2d'), canvas.width, plateType, plate, seed);
            card.querySelector('.culture-info').textContent = this.cultureCardInfo(plateType, plate, view);
            const buttons = card.querySelector('.culture-buttons');
            buttons.innerHTML = '';
            const button = (text, action, disabled = false) => {
                const element = document.createElement('button');
                element.type = 'button';
                element.textContent = text;
                element.disabled = disabled || !contents;
                element.addEventListener('click', action);
                buttons.appendChild(element);
            };
            if (!plateType) {
                button(cultureSay('load'), () => this.cultureChoose('load', slot));
            } else {
                if (!plate || !plate.main) button(cultureSay('inoculate'), () => this.cultureChoose('inoculate', slot));
                button(cultureSay('harvest'), () => this.cultureApply('harvest', slot));
            }
        });
    },

    // The words under a plate: what is on it, what it is doing, and what it gives now.
    cultureCardInfo(plateType, plate, view) {
        if (!plateType) return cultureSay('empty');
        const lines = [];
        const pop = plate && (plate.main || plate.mould);
        if (!plate || !plate.main) lines.push(this.cultureName(plateType));
        if (plate && plate.main) {
            lines.push(cultureSay('sown', this.cultureSpeciesName(plate.main.species)));
        } else if (!CULTURE_PLATES[plateType]) {
            lines.push(cultureSay('plateSterile'));
        } else {
            lines.push(cultureSay('plateWaiting'));
        }
        if (pop) {
            const phases = CULTURE_TEXT.phase[gameLang()];
            if (plate.main) lines.push(`${phases[plate.main.phase] || phases.lag}, ${cultureSay('logN', plate.main.logN.toFixed(1))}`);
            if (plate.mould && plate.mould.logN >= 4.5) lines.push(cultureSay('contaminated'));
            if (plate.main && view) {
                const kind = CULTURE_SPECIES[plate.main.species];
                lines.push(cultureSay('rateAt', this.cultureSpeciesName(plate.main.species), Math.round(cultureGamma(view.inside, kind) * 100), view.inside.toFixed(0)));
            }
            lines.push(cultureSay('nutrient', Math.round(plate.nutrient * 100)));
        }
        const out = cultureHarvestOf(plateType, plate);
        if (out.item === plateType) lines.push(cultureSay('givesPlate', this.cultureName(plateType)));
        else if (out.also) lines.push(cultureSay('gives', this.cultureName(out.item)));
        else lines.push(cultureSay('givesDish'));
        return lines.join(' · ');
    },

    cultureRenderPop() {
        const panel = this.culturePanel;
        if (!panel) return;
        const pop = panel.querySelector('#culture-pop');
        const choosing = this.cultureChoosing;
        pop.classList.toggle('visible', Boolean(choosing && this.cultureAt));
        pop.innerHTML = '';
        if (!choosing || !this.cultureAt) return;
        const title = document.createElement('div');
        const choices = this.cultureChoices(choosing.op);
        title.textContent = choices.length === 0 ? cultureSay(choosing.op === 'load' ? 'noPlates' : 'noInocula') : cultureSay(choosing.op === 'load' ? 'chooseLoad' : 'chooseInoculum');
        pop.appendChild(title);
        for (const type of choices) {
            const choice = document.createElement('button');
            choice.type = 'button';
            choice.className = 'culture-choice';
            const icon = document.createElement('i');
            icon.style.backgroundImage = `url(${this.world.getInventoryIconUrl(type)})`;
            const species = choosing.op === 'inoculate' ? cultureInoculum(type) : null;
            const words = document.createElement('span');
            words.textContent = `${this.cultureName(type)} ×${this.getInventoryCount(type)}${species ? `: ${cultureSay('carries', this.cultureSpeciesName(species))}` : ''}`;
            choice.append(icon, words);
            choice.addEventListener('click', () => this.cultureApply(choosing.op, choosing.slot, type));
            pop.appendChild(choice);
        }
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = cultureSay('cancel');
        cancel.addEventListener('click', () => {
            this.cultureChoosing = null;
            this.cultureRenderPop();
        });
        pop.appendChild(cancel);
    },

    cultureRenderGraph() {
        const panel = this.culturePanel;
        const view = this.cultureContents && this.cultureContents.incubator;
        const plate = view && view.plates ? view.plates[this.culturePicked] : null;
        const canvas = panel.querySelector('#culture-graph');
        const width = Math.max(240, Math.round(canvas.clientWidth || 760));
        if (canvas.width !== width) canvas.width = width;
        const title = plate && plate.history && plate.history.length > 0 ? `${cultureSay('graphTitle')}: ${cultureSay('slot', this.culturePicked + 1)}` : cultureSay('graphEmpty');
        panel.querySelector('#culture-graph-title').textContent = title;
        cultureDrawGraph(canvas.getContext('2d'), canvas.width, canvas.height, plate, { harvest: cultureSay('graphHarvest'), time: (s) => cultureSay('graphTime', s) });
    },

    // /culturekit: everything for trying cultures, in creative mode only.
    cultureKit(command) {
        if (!this.creativeMode) {
            this.receiveSystemMessage({ text: `Unknown command: /${command}` });
            return;
        }
        for (const [type, amount] of CULTURE_KIT) this.addInventory(type, amount);
        this.receiveSystemMessage({ text: cultureSay('kitGiven') });
    }
});

registerModalPanel({
    isOpen() { return Boolean(this.cultureAt); },
    close() { this.cultureClose(); },
    escape() { return this.cultureEscape(); }
});

// Before a chest would see it: the incubator has its own panel, not the panel of a chest.
ITEM_USE_HANDLERS.unshift(function (itemType, hit) {
    if (!hit || this.cameraController.isCrouching) return false;
    const position = this.world.getBlockPositionFromIntersection(hit);
    return Boolean(position) && this.cultureTryOpen(position);
});

registerGameContent(function () {
    this.cultureLoadPending();
    onGameLangChange(() => this.cultureRender());
});

registerFrameUpdate(function () {
    this.cultureUpdate();
});
