// Chemistry: the 36 element blocks react at a lab bench into real compounds and alloys.
// - Lab Bench (4 planks + 2 glass + 1 iron_ore): a placeable block; right click it to open the
//   lab, a modal panel with a periodic table of the elements you carry. Click an element to put
//   one atom (one element block) in the flask (and see it in the info bar, with a link to its
//   guide page), right click to take it out, or pick a known reaction from the list. When the
//   flask holds exactly a reaction, React consumes the blocks (and any container it needs) and
//   gives the product.
// - 30 reactions (CHEMISTRY_REACTIONS). Water, salt, silica and steel are known from the start;
//   the rest show as "???" until the player mixes the right atoms once, which discovers them
//   for good (localStorage). Element guide pages hint at them.
// - Products: drinks and remedies (G), salt and salted fish, steel tools a tier above gold,
//   bronze bells, fertilizer for wheat, a helium balloon for slow falls, glowing lamps and light
//   bulbs, mirrors, cobalt glass, dyes, baking soda, lime mortar, pyrite sparks, brass
//   telescopes, and collectibles (gems, solar cells, batteries, meteoric iron).
// - The 📖 buttons close the lab and open the guide at the element or product page.
// Mixed into Game.prototype; hooked through js/extensions.js. Guide pages 115-129, 139-190.

// [symbol, atomic number, group, period, category, English name]
const CHEMISTRY_ELEMENTS = [
    ['h', 1, 1, 1, 'nonmetal', 'Hydrogen'], ['he', 2, 18, 1, 'noble', 'Helium'],
    ['li', 3, 1, 2, 'alkali', 'Lithium'], ['be', 4, 2, 2, 'alkaline', 'Beryllium'],
    ['b', 5, 13, 2, 'metalloid', 'Boron'], ['c', 6, 14, 2, 'nonmetal', 'Carbon'],
    ['n', 7, 15, 2, 'nonmetal', 'Nitrogen'], ['o', 8, 16, 2, 'nonmetal', 'Oxygen'],
    ['f', 9, 17, 2, 'halogen', 'Fluorine'], ['ne', 10, 18, 2, 'noble', 'Neon'],
    ['na', 11, 1, 3, 'alkali', 'Sodium'], ['mg', 12, 2, 3, 'alkaline', 'Magnesium'],
    ['al', 13, 13, 3, 'post', 'Aluminium'], ['si', 14, 14, 3, 'metalloid', 'Silicon'],
    ['p', 15, 15, 3, 'nonmetal', 'Phosphorus'], ['s', 16, 16, 3, 'nonmetal', 'Sulfur'],
    ['cl', 17, 17, 3, 'halogen', 'Chlorine'], ['ar', 18, 18, 3, 'noble', 'Argon'],
    ['k', 19, 1, 4, 'alkali', 'Potassium'], ['ca', 20, 2, 4, 'alkaline', 'Calcium'],
    ['ti', 22, 4, 4, 'transition', 'Titanium'], ['cr', 24, 6, 4, 'transition', 'Chromium'],
    ['mn', 25, 7, 4, 'transition', 'Manganese'], ['fe', 26, 8, 4, 'transition', 'Iron'],
    ['co', 27, 9, 4, 'transition', 'Cobalt'], ['ni', 28, 10, 4, 'transition', 'Nickel'],
    ['cu', 29, 11, 4, 'transition', 'Copper'], ['zn', 30, 12, 4, 'transition', 'Zinc'],
    ['ag', 47, 11, 5, 'transition', 'Silver'], ['sn', 50, 14, 5, 'post', 'Tin'],
    ['i', 53, 17, 5, 'halogen', 'Iodine'], ['w', 74, 6, 6, 'transition', 'Tungsten'],
    ['pt', 78, 10, 6, 'transition', 'Platinum'], ['au', 79, 11, 6, 'transition', 'Gold'],
    ['hg', 80, 12, 6, 'transition', 'Mercury'], ['pb', 82, 14, 6, 'post', 'Lead']
];

const CHEMISTRY_CATEGORY_COLORS = {
    nonmetal: '#3f8f5a', noble: '#7a4fb0', alkali: '#b0503f', alkaline: '#b07a3a', metalloid: '#5f8a8a',
    halogen: '#3f7fb0', post: '#6a7383', transition: '#8a6a4a'
};

// atoms: element symbol -> how many blocks. outputs: the first one whose `needs` (extra items)
// the player carries is made. kind (CHEMISTRY_KINDS): what sort of product it is; only
// compounds, gems and devices show a formula. known: listed from the start; the rest appear as
// "???" until the player mixes them in the flask once (CHEMISTRY_STORAGE_KEY). page: the guide
// page of the product.
const CHEMISTRY_REACTIONS = [
    {
        id: 'water', name: 'Water', formula: 'H₂O', kind: 'compound', atoms: { h: 2, o: 1 }, color: '#5aa9e6', known: true, page: 118,
        note: 'Two hydrogen atoms bond to one oxygen atom.',
        outputs: [{ needs: { bucket: 1 }, type: 'water_bucket', amount: 1 }, { needs: { glass: 1 }, type: 'water_flask', amount: 1 }]
    },
    {
        id: 'salt', name: 'Table salt', formula: 'NaCl', kind: 'compound', atoms: { na: 1, cl: 1 }, color: '#f2f2ee', known: true, page: 119,
        note: 'A soft metal and a poisonous gas make the salt on your table.',
        outputs: [{ type: 'salt', amount: 4 }]
    },
    {
        id: 'silica', name: 'Silica glass', formula: 'SiO₂', kind: 'compound', atoms: { si: 1, o: 2 }, color: '#bfe8f5', known: true, page: 51,
        note: 'Silicon dioxide: sand and quartz, melted into glass.',
        outputs: [{ type: 'glass', amount: 4 }]
    },
    {
        id: 'steel', name: 'Steel', formula: 'Fe + C', kind: 'alloy', atoms: { fe: 1, c: 1 }, color: '#8d969e', known: true, page: 120,
        note: 'Iron with a little carbon (under 2 % by mass) is much harder than iron alone.',
        outputs: [{ type: 'steel_ingot', amount: 2 }]
    },
    {
        id: 'limestone', name: 'Limestone', formula: 'CaCO₃', kind: 'compound', atoms: { ca: 1, c: 1, o: 3 }, color: '#dad6bf', page: 59,
        note: 'Calcium carbonate: the stone of shells, chalk and marble.',
        outputs: [{ type: 'limestone', amount: 4 }]
    },
    {
        id: 'titanium_white', name: 'Titanium white', formula: 'TiO₂', kind: 'compound', atoms: { ti: 1, o: 2 }, color: '#ffffff', page: 67,
        note: 'Titanium dioxide is the white pigment of most paints.',
        outputs: [{ type: 'spray_paint', amount: 2 }]
    },
    {
        id: 'bronze', name: 'Bronze', formula: 'Cu + Sn', kind: 'alloy', atoms: { cu: 3, sn: 1 }, color: '#c08a4a', page: 121,
        note: 'Copper with some tin (about 12 % by mass): the metal of the Bronze Age, and of bells.',
        outputs: [{ type: 'bronze_ingot', amount: 2 }]
    },
    {
        id: 'ammonia', name: 'Ammonia', formula: 'NH₃', kind: 'compound', atoms: { n: 1, h: 3 }, color: '#bfe39a', page: 122,
        note: 'Plants need nitrogen; ammonia is the base of most fertilizers.',
        outputs: [{ type: 'fertilizer', amount: 4 }]
    },
    {
        id: 'potash', name: 'Potash', formula: 'KCl', kind: 'compound', atoms: { k: 1, cl: 1 }, color: '#f0d0c0', page: 122,
        note: 'Potassium chloride: plants need potassium as much as nitrogen.',
        outputs: [{ type: 'fertilizer', amount: 4 }]
    },
    {
        id: 'carbon_dioxide', name: 'Carbon dioxide', formula: 'CO₂', kind: 'compound', atoms: { c: 1, o: 2 }, color: '#d9f1ff', page: 123,
        note: 'Dissolved in water under pressure, it makes the bubbles of fizzy drinks.',
        outputs: [{ needs: { water_flask: 1 }, type: 'soda_water', amount: 1 }]
    },
    {
        id: 'helium', name: 'Helium', formula: 'He', kind: 'noble', atoms: { he: 1 }, color: '#f4d7ff', page: 124,
        note: 'A noble gas: it reacts with nothing, and it is lighter than air.',
        outputs: [{ type: 'helium_balloon', amount: 1 }]
    },
    {
        id: 'neon', name: 'Neon light', formula: 'Ne', kind: 'noble', atoms: { ne: 1 }, color: '#ff5a2a', page: 125,
        note: 'Electricity through neon gas glows red-orange.',
        outputs: [{ needs: { glass: 1 }, type: 'neon_lamp', amount: 4 }]
    },
    {
        id: 'argon', name: 'Argon light', formula: 'Ar + Hg', kind: 'noble', atoms: { ar: 1, hg: 1 }, color: '#4f7dff', page: 126,
        note: 'Argon with a drop of mercury glows blue: most "neon" signs that are not red.',
        outputs: [{ needs: { glass: 1 }, type: 'argon_lamp', amount: 4 }]
    },
    {
        id: 'rust', name: 'Red ochre', formula: 'Fe₂O₃', kind: 'compound', atoms: { fe: 2, o: 3 }, color: '#a8452a', page: 129,
        note: 'Iron oxide, rust: the red of ochre paints since the Stone Age.',
        outputs: [{ type: 'rust_pigment', amount: 2 }]
    },
    {
        id: 'ruby', name: 'Ruby', formula: 'Al₂O₃ : Cr', kind: 'gem', atoms: { al: 2, o: 3, cr: 1 }, color: '#d0204a', page: 175,
        note: 'Aluminium oxide (corundum) with a trace of chromium turns deep red.',
        outputs: [{ type: 'ruby', amount: 1 }]
    },
    {
        id: 'sapphire', name: 'Sapphire', formula: 'Al₂O₃ : Fe, Ti', kind: 'gem', atoms: { al: 2, o: 3, fe: 1, ti: 1 }, color: '#2a4fd0', page: 176,
        note: 'The same corundum with traces of iron and titanium turns blue.',
        outputs: [{ type: 'sapphire', amount: 1 }]
    },
    {
        id: 'solar_cell', name: 'Solar cell', formula: 'Si : B, P', kind: 'device', atoms: { si: 2, b: 1, p: 1 }, color: '#2a3f8a', page: 177,
        note: 'Silicon doped with boron on one side and phosphorus on the other turns light into electricity.',
        outputs: [{ type: 'solar_cell', amount: 1 }]
    },
    {
        id: 'copper_sulfate', name: 'Copper sulfate', formula: 'CuSO₄', kind: 'compound', atoms: { cu: 1, s: 1, o: 4 }, color: '#2f8fe0', page: 178,
        note: 'Blue vitriol: it grows into bright blue crystals.',
        outputs: [{ type: 'copper_sulfate', amount: 2 }]
    },
    {
        id: 'brass', name: 'Brass', formula: 'Cu + Zn', kind: 'alloy', atoms: { cu: 2, zn: 1 }, color: '#d8b24a', page: 179,
        note: 'Copper with zinc: golden, easy to shape, the metal of trumpets and telescopes.',
        outputs: [{ type: 'brass_ingot', amount: 2 }]
    },
    {
        id: 'gold_leaf', name: 'Gold leaf', formula: 'Au', kind: 'metal', atoms: { au: 1 }, color: '#f0c840', page: 180,
        note: 'Gold does not rust or react: it can be beaten thinner than a bubble.',
        outputs: [{ type: 'gold_leaf', amount: 8 }]
    },
    {
        id: 'mirror', name: 'Silver mirror', formula: 'Ag', kind: 'metal', atoms: { ag: 1 }, color: '#dfe6ee', page: 181,
        note: 'A thin layer of silver on the back of a glass reflects almost all light.',
        outputs: [{ needs: { glass: 1 }, type: 'mirror', amount: 2 }]
    },
    {
        id: 'baking_soda', name: 'Baking soda', formula: 'NaHCO₃', kind: 'compound', atoms: { na: 1, h: 1, c: 1, o: 3 }, color: '#f6f6f2', page: 182,
        note: 'Sodium bicarbonate releases CO₂ bubbles when heated: dough rises.',
        outputs: [{ type: 'baking_soda', amount: 4 }]
    },
    {
        id: 'quicklime', name: 'Quicklime', formula: 'CaO', kind: 'compound', atoms: { ca: 1, o: 1 }, color: '#ece8da', page: 183,
        note: 'Calcium oxide: mixed with water and sand it makes lime mortar.',
        outputs: [{ type: 'quicklime', amount: 2 }]
    },
    {
        id: 'pyrite', name: 'Pyrite', formula: 'FeS₂', kind: 'compound', atoms: { fe: 1, s: 2 }, color: '#c8a838', page: 184,
        note: 'Fool\'s gold: iron and sulfur in shiny golden cubes. Struck with steel, it sparks.',
        outputs: [{ type: 'pyrite', amount: 1 }]
    },
    {
        id: 'cobalt_glass', name: 'Cobalt glass', formula: 'SiO₂ : Co', kind: 'gem', atoms: { co: 1, si: 1, o: 2 }, color: '#1f3fb8', page: 185,
        note: 'A pinch of cobalt turns glass a deep blue.',
        outputs: [{ type: 'cobalt_glass', amount: 4 }]
    },
    {
        id: 'iodine', name: 'Iodine tincture', formula: 'I₂', kind: 'compound', atoms: { i: 2 }, color: '#7a3a1a', page: 186,
        note: 'Iodine atoms pair up into I₂; dissolved, it disinfects small wounds.',
        outputs: [{ needs: { glass: 1 }, type: 'iodine_tincture', amount: 1 }]
    },
    {
        id: 'light_bulb', name: 'Light bulb', formula: 'W + Ar', kind: 'device', atoms: { w: 1, ar: 1 }, color: '#ffd27a', page: 187,
        note: 'With current through it, a thin tungsten filament glows white-hot. The argon around it slows its wearing away.',
        outputs: [{ needs: { glass: 1 }, type: 'light_bulb', amount: 4 }]
    },
    {
        id: 'fluorite', name: 'Fluorite', formula: 'CaF₂', kind: 'compound', atoms: { ca: 1, f: 2 }, color: '#9a6ad8', page: 188,
        note: 'Calcium fluoride: purple crystals that glow under ultraviolet light.',
        outputs: [{ type: 'fluorite', amount: 1 }]
    },
    {
        id: 'battery', name: 'Lithium battery', formula: 'LiCoO₂', kind: 'device', atoms: { li: 1, co: 1, o: 2 }, color: '#3a8a5a', page: 189,
        note: 'Lithium cobalt oxide stores energy in the batteries of phones and laptops.',
        outputs: [{ type: 'battery', amount: 1 }]
    },
    {
        id: 'meteoric_iron', name: 'Meteoric iron', formula: 'Fe + Ni', kind: 'alloy', atoms: { fe: 1, ni: 1 }, color: '#7a8088', page: 190,
        note: 'Iron with nickel: the metal of meteorites, fallen from space.',
        outputs: [{ type: 'meteoric_iron', amount: 2 }]
    }
];

const CHEMISTRY_KINDS = {
    compound: 'Compound', alloy: 'Alloy', noble: 'Noble gas', metal: 'Pure metal', gem: 'Coloured crystal', device: 'Device'
};
const CHEMISTRY_STORAGE_KEY = 'minecloud-chemistry-discovered';
// Guide pages: the elements in atomic-number order from 139, the lab products.
const CHEMISTRY_ELEMENT_PAGE_START = 139;
const CHEMISTRY_PRODUCT_PAGES = {
    lab_bench: 117, water_flask: 118, water_bucket: 111, salt: 119, steel_ingot: 120, bronze_ingot: 121, fertilizer: 122,
    soda_water: 123, helium_balloon: 124, neon_lamp: 125, argon_lamp: 126, salted_fish: 127, steel_pickaxe: 128,
    steel_shovel: 128, steel_axe: 128, steel_sword: 128, rust_pigment: 129, ruby: 175, sapphire: 176, solar_cell: 177,
    copper_sulfate: 178, brass_ingot: 179, gold_leaf: 180, mirror: 181, baking_soda: 182, quicklime: 183, pyrite: 184,
    cobalt_glass: 185, iodine_tincture: 186, light_bulb: 187, fluorite: 188, battery: 189, meteoric_iron: 190,
    glass: 51, limestone: 59, spray_paint: 67
};

const CHEMISTRY_FLASK_LIMIT = 8;
const CHEMISTRY_FERTILIZABLE = ['wheat_0', 'wheat_1', 'wheat_2'];
const CHEMISTRY_BALLOON_FALL_SPEED = 2.2;
const CHEMISTRY_STEEL_TIER = 3.6;
const CHEMISTRY_STEEL_SWORD_DAMAGE = 9;

// Steel swords hit harder than gold ones (mobs.js reads this table by toolMaterial).
if (typeof PLAYER_SWORD_DAMAGE === 'object') PLAYER_SWORD_DAMAGE.steel = CHEMISTRY_STEEL_SWORD_DAMAGE;

// ---------------------------------------------------------------------------------------
// Textures

registerTexturePattern('lab_bench_top', (f, s, tint, seed) => {
    // White lab tiles with dark grout, a little Bunsen burner ring and a stain.
    const tile = f.rgb(0xe8ecee);
    const groutColor = f.rgb(0x6b7378);
    f.each(s, (x, y, u, v) => {
        const cell = s.size / 4;
        const grout = Math.max(1, cell * 0.06);
        const edge = x % cell < grout || y % cell < grout;
        const n = f.fbm(u, v, 6, 2, seed) - 0.5;
        if (edge) {
            f.put(s, x, y, f.tone(s, groutColor, n * 0.2), 0.3);
            return;
        }
        let c = f.tone(s, tile, n * 0.08);
        const ring = Math.hypot(u - 0.7, v - 0.3);
        if (ring > 0.1 && ring < 0.15) c = f.tone(s, f.rgb(0x2f3438), 0);
        const stain = Math.hypot(u - 0.28, v - 0.7);
        if (stain < 0.1) c = f.mix(c, f.rgb(0x7fc8a0), 0.45 * (1 - stain / 0.1));
        f.put(s, x, y, c, 0.6);
    });
});

registerTexturePattern('lab_bench_side', (f, s, tint, seed) => {
    // A wooden cabinet: a white worktop edge, two doors with handles.
    const wood = f.rgb(0x8a5a32);
    f.each(s, (x, y, u, v) => {
        const grain = f.fbm(u * 0.3, v * 3, 8, 2, seed) - 0.5;
        if (v < 0.14) {
            f.put(s, x, y, f.tone(s, f.rgb(0xe8ecee), v < 0.03 ? 0.05 : -0.05), 0.7);
            return;
        }
        let c = f.tone(s, wood, grain * 0.3);
        const frame = u < 0.07 || u > 0.93 || v > 0.92 || (u > 0.47 && u < 0.53);
        if (frame) c = f.tone(s, wood, -0.28);
        const handle = v > 0.48 && v < 0.6 && ((u > 0.38 && u < 0.43) || (u > 0.57 && u < 0.62));
        if (handle) c = f.rgb(0xc8cdd2);
        f.put(s, x, y, c, frame ? 0.35 : handle ? 0.9 : 0.55);
    });
});

// A glowing tube bent in loops on a dark backing, inside a metal frame.
function chemistryPaintLamp(f, s, tube, seed) {
    const glow = f.rgb(tube);
    const dark = f.rgb(0x1b1d24);
    const frame = f.rgb(0x5a5f66);
    const white = f.rgb(0xffffff);
    f.each(s, (x, y, u, v) => {
        if (u < 0.08 || u > 0.92 || v < 0.08 || v > 0.92) {
            f.put(s, x, y, f.tone(s, frame, (f.hash(x, y, seed) - 0.5) * 0.1), 0.7);
            return;
        }
        // Three horizontal runs joined by half loops at alternate ends.
        let d = Infinity;
        if (u >= 0.2 && u <= 0.8) [0.28, 0.53, 0.78].forEach((row) => { d = Math.min(d, Math.abs(v - row)); });
        if (u < 0.2) d = Math.min(d, Math.abs(Math.hypot(u - 0.2, v - 0.655) - 0.125));
        if (u > 0.8) d = Math.min(d, Math.abs(Math.hypot(u - 0.8, v - 0.405) - 0.125));
        const width = Math.max(0.045, 0.6 / s.size);
        if (d < width) {
            f.put(s, x, y, f.mix(glow, white, d < width * 0.4 ? 0.55 : 0.1), 0.85);
        } else {
            // A soft halo around the tube on the backing.
            const halo = Math.max(0, 1 - (d - width) / 0.12);
            f.put(s, x, y, f.mix(dark, glow, halo * 0.45), 0.3);
        }
    });
}

registerTexturePattern('neon_lamp', (f, s, tint, seed) => chemistryPaintLamp(f, s, 0xff5a2a, seed));
registerTexturePattern('argon_lamp', (f, s, tint, seed) => chemistryPaintLamp(f, s, 0x4f7dff, seed));

// Silvered glass in a dark frame, with a soft diagonal sheen.
registerTexturePattern('mirror', (f, s, tint, seed) => {
    const silver = f.rgb(0xc9d3dc);
    const frame = f.rgb(0x4a3a2a);
    f.each(s, (x, y, u, v) => {
        if (u < 0.08 || u > 0.92 || v < 0.08 || v > 0.92) {
            f.put(s, x, y, f.tone(s, frame, (f.fbm(u, v, 8, 2, seed) - 0.5) * 0.3), 0.75);
            return;
        }
        const sheen = Math.max(0, 1 - Math.abs(u + v - 0.9) / 0.12) * 0.5 + Math.max(0, 1 - Math.abs(u + v - 1.15) / 0.05) * 0.35;
        f.put(s, x, y, f.mix(f.tone(s, silver, (v - 0.5) * 0.2), [255, 255, 255], sheen), 0.5);
    });
}, { rtx: { roughness: 0.06, metalness: 1, normalScale: 0.05 } });

// Deep blue glass, a little darker at the edges.
registerTexturePattern('cobalt_glass', (f, s, tint, seed) => {
    const blue = f.rgb(0x2a4fd0);
    f.each(s, (x, y, u, v) => {
        const edge = u < 0.06 || u > 0.94 || v < 0.06 || v > 0.94;
        const streak = Math.max(0, 1 - Math.abs(u - v * 0.6 - 0.15) / 0.05) * 0.4;
        const c = edge ? f.tone(s, blue, -0.35) : f.mix(f.tone(s, blue, (f.fbm(u, v, 4, 2, seed) - 0.5) * 0.15), [200, 220, 255], streak);
        f.put(s, x, y, c, edge ? 0.7 : 0.5);
    });
});

// ---------------------------------------------------------------------------------------
// Blocks

registerBlockType('lab_bench', {
    color: 0x8a5a32, name: 'Lab Bench', breakDuration: 0.8, category: 'wood',
    faces: { top: 'lab_bench_top', side: 'lab_bench_side', bottom: 'lab_bench_side' }
});
registerBlockType('neon_lamp', {
    color: 0xff5a2a, name: 'Neon Lamp', breakDuration: 0.3, glow: 1.8,
    faces: { top: 'neon_lamp', side: 'neon_lamp' }
});
registerBlockType('argon_lamp', {
    color: 0x4f7dff, name: 'Argon Lamp', breakDuration: 0.3, glow: 1.8,
    faces: { top: 'argon_lamp', side: 'argon_lamp' }
});
// The light bulb is an electric consumer: it lives in js/game/electricity.js.
registerBlockType('mirror', {
    color: 0xc9d3dc, name: 'Silver Mirror', breakDuration: 0.25, mirrorSurface: 'cube', // js/game/mirrors.js
    faces: { top: 'mirror', side: 'mirror' }
});
registerBlockType('cobalt_glass', {
    color: 0x2a4fd0, name: 'Cobalt Glass', breakDuration: 0.22, transparent: true, opacity: 0.6,
    faces: { top: 'cobalt_glass', side: 'cobalt_glass' }
});

// ---------------------------------------------------------------------------------------
// Items

const CHEMISTRY_SPRITES = {
    salt: [
        '............',
        '............',
        '.....w......',
        '....wWw.....',
        '...wWWWw.w..',
        '..wWWsWWwWw.',
        '..WWWWWsWWW.',
        '.wWsWWWWWWWw',
        '.WWWWWsWWWsW',
        'wWWsWWWWWWWW',
        'SSSSSSSSSSSS',
        '............'
    ],
    ingot: [
        '............',
        '............',
        '............',
        '...HHHHHHH..',
        '..HhhhhhhhM.',
        '.HhhhhhhhMM.',
        '.MMMMMMMMMD.',
        '.MmmmmmmmmD.',
        '.MmmmmmmmmD.',
        '.DDDDDDDDDD.',
        '............',
        '............'
    ],
    fertilizer: [
        '............',
        '....TT.TT...',
        '.....TTT....',
        '....SSSSS...',
        '...SSSSSSS..',
        '..SSGGGGGSS.',
        '..SSGgGgGSS.',
        '..SSGGGGGSS.',
        '..SSSSSSSSS.',
        '..SSSSSSSSS.',
        '...sssssss..',
        '............'
    ],
    balloon: [
        '...RRRRR....',
        '..RRhRRRR...',
        '.RRhRRRRRR..',
        '.RRRRRRRRR..',
        '.RRRRRRRRR..',
        '.RRRRRRRRd..',
        '..RRRRRRd...',
        '...RRRRd....',
        '.....kk.....',
        '.....s......',
        '......s.....',
        '.....s......'
    ],
    gem: [
        '............',
        '............',
        '...HHHHHH...',
        '..HhhhhhhM..',
        '.HhhGGhhhMM.',
        '.MMMMMMMMMM.',
        '..MmmmmmmD..',
        '...MmmmmD...',
        '....MmmD....',
        '.....MD.....',
        '............',
        '............'
    ],
    cube: [
        '............',
        '.....HHHHHH.',
        '....HhhhhHM.',
        '...HhhhhHMM.',
        '..MMMMMMMMM.',
        '..MmmmmmmMD.',
        '..MmGmmmmMD.',
        '..MmmmmmmMD.',
        '..MmmmmmmD..',
        '..DDDDDDD...',
        '............',
        '............'
    ],
    sheet: [
        '............',
        '..HHHHHHH...',
        '..HhhhhhhH..',
        '..HhhHhhhhH.',
        '..HhhhhhHhH.',
        '.HhhhhhhhhH.',
        '.HhhHhhhhhH.',
        '.HhhhhhhhH..',
        '.HhhhhhHhH..',
        '..HHHHHHH...',
        '............',
        '............'
    ],
    solar: [
        '............',
        '.FFFFFFFFFF.',
        '.FBbBBbBBbF.',
        '.FbbbbbbbbF.',
        '.FBbBBbBBbF.',
        '.FBbBBbBBbF.',
        '.FbbbbbbbbF.',
        '.FBbBBbBBbF.',
        '.FBbBBbBBbF.',
        '.FFFFFFFFFF.',
        '............',
        '............'
    ],
    battery: [
        '............',
        '.....TT.....',
        '....CCCC....',
        '....BBBB....',
        '....BhBB....',
        '....BhBB....',
        '....BhBB....',
        '....GGGG....',
        '....BhBB....',
        '....BBBB....',
        '....CCCC....',
        '............'
    ],
    soda: [
        '....CCCC....',
        '....CCCC....',
        '.....GG.....',
        '.....GG.....',
        '....GLbG....',
        '...GLLLbG...',
        '..GbLHLLLG..',
        '..GLLHLbLG..',
        '..GLbLLLLG..',
        '..GLLLLbLG..',
        '...GbLLLG...',
        '....GGGG....'
    ]
};
const CHEMISTRY_BOTTLE = (typeof RESOURCE_SPRITES === 'object' && RESOURCE_SPRITES.bottle) || CHEMISTRY_SPRITES.soda;
const CHEMISTRY_FISH = (typeof RESOURCE_SPRITES === 'object' && RESOURCE_SPRITES.fish) || CHEMISTRY_SPRITES.ingot;

// food: health restored (G); bottle: the glass comes back.
const CHEMISTRY_ITEMS = {
    water_flask: { color: 0x3d85c6, name: 'Water Flask', sprite: CHEMISTRY_BOTTLE, palette: { C: 0x8a6034, G: 0xcfe9f2, L: 0x5aa9e6, H: 0xcfeaff }, food: 2, bottle: true },
    soda_water: { color: 0x6aa9c9, name: 'Soda Water', sprite: CHEMISTRY_SPRITES.soda, palette: { C: 0x5a5f66, G: 0xcfe9f2, L: 0xa9dcf2, H: 0xffffff, b: 0xffffff }, food: 3, bottle: true },
    salt: { color: 0x9aa3a8, name: 'Salt', sprite: CHEMISTRY_SPRITES.salt, palette: { W: 0xf4f4f0, w: 0xffffff, s: 0xc9d1d6, S: 0x7d858b } },
    salted_fish: { color: 0x5f7280, name: 'Salted Fish', sprite: CHEMISTRY_FISH, palette: { B: 0xc9d3d6, b: 0xf6f3ea, E: 0x16181c, T: 0x9fb2bc, F: 0x9fb2bc }, food: 8 },
    steel_ingot: { color: 0x6d757c, name: 'Steel Ingot', sprite: CHEMISTRY_SPRITES.ingot, palette: { H: 0xe3e8ec, h: 0xb9c1c8, M: 0x8d969e, m: 0x9aa3ab, D: 0x5a6168 } },
    bronze_ingot: { color: 0x8a5a2a, name: 'Bronze Ingot', sprite: CHEMISTRY_SPRITES.ingot, palette: { H: 0xf0c890, h: 0xd9a35e, M: 0xb07a3a, m: 0xc08a4a, D: 0x7a4f22 } },
    fertilizer: { color: 0x6b8f3a, name: 'Fertilizer', sprite: CHEMISTRY_SPRITES.fertilizer, palette: { S: 0xc9a86a, s: 0x9a7c48, G: 0x5f9e3a, g: 0xe8f0d0, T: 0x6b4a2b } },
    helium_balloon: { color: 0xd0457a, name: 'Helium Balloon', sprite: CHEMISTRY_SPRITES.balloon, palette: { R: 0xe8508a, h: 0xffc2da, d: 0xa8305e, k: 0xa8305e, s: 0xe8e8e8 },
        describe: 'while you hold it, you fall slowly and take no fall damage' },
    rust_pigment: { color: 0x8a3a22, name: 'Red Ochre', sprite: CHEMISTRY_SPRITES.salt, palette: { W: 0xa8452a, w: 0xc8603a, s: 0x7a2f1a, S: 0x5a4a40 } },
    ruby: { color: 0x8a1030, name: 'Ruby', sprite: CHEMISTRY_SPRITES.gem, palette: { H: 0xff8aa8, h: 0xe0305a, G: 0xffffff, M: 0xc01840, m: 0xa01038, D: 0x700a26 },
        describe: 'aluminium oxide with a trace of chromium. A gem to collect' },
    sapphire: { color: 0x1a2f8a, name: 'Sapphire', sprite: CHEMISTRY_SPRITES.gem, palette: { H: 0x8aa8ff, h: 0x3a5fe0, G: 0xffffff, M: 0x2040c0, m: 0x1a35a0, D: 0x0f2070 },
        describe: 'aluminium oxide with traces of iron and titanium. A gem to collect' },
    solar_cell: { color: 0x1a2a5a, name: 'Solar Cell', sprite: CHEMISTRY_SPRITES.solar, palette: { F: 0xc8cdd2, B: 0x2a3f8a, b: 0x8aa0c8 },
        describe: 'doped silicon that turns light into electricity. Keep it for when machines arrive' },
    copper_sulfate: { color: 0x1f6fb0, name: 'Copper Sulfate', sprite: CHEMISTRY_SPRITES.cube, palette: { H: 0x9ad8ff, h: 0x4aa8f0, G: 0xd8f0ff, M: 0x2f8fe0, m: 0x2a7ac8, D: 0x1a5590 } },
    brass_ingot: { color: 0x9a7a2a, name: 'Brass Ingot', sprite: CHEMISTRY_SPRITES.ingot, palette: { H: 0xfff0a0, h: 0xe8c860, M: 0xc8a040, m: 0xd8b24a, D: 0x8a6a22 } },
    gold_leaf: { color: 0xa8862a, name: 'Gold Leaf', sprite: CHEMISTRY_SPRITES.sheet, palette: { H: 0xc89a2a, h: 0xf6d860 } },
    baking_soda: { color: 0xa0a8b0, name: 'Baking Soda', sprite: CHEMISTRY_SPRITES.salt, palette: { W: 0xfafaf6, w: 0xffffff, s: 0xe0e4e8, S: 0x6a8ab0 } },
    quicklime: { color: 0x9a9888, name: 'Quicklime', sprite: CHEMISTRY_SPRITES.salt, palette: { W: 0xece8da, w: 0xfaf8ee, s: 0xc8c4b4, S: 0x7a7668 } },
    pyrite: { color: 0x8a7020, name: 'Pyrite', sprite: CHEMISTRY_SPRITES.cube, palette: { H: 0xfff0a0, h: 0xe8d070, G: 0xffffff, M: 0xc8a838, m: 0xb89830, D: 0x7a6420 } },
    iodine_tincture: { color: 0x5a2a12, name: 'Iodine Tincture', sprite: CHEMISTRY_BOTTLE, palette: { C: 0xe8e8e8, G: 0xcfe9f2, L: 0x7a3a1a, H: 0xc8783a }, food: 4, bottle: true },
    fluorite: { color: 0x5a3a8a, name: 'Fluorite', sprite: CHEMISTRY_SPRITES.cube, palette: { H: 0xd8b8ff, h: 0xb08ae8, G: 0x9ae8c8, M: 0x9a6ad8, m: 0x8a5ac8, D: 0x5a3a8a },
        describe: 'calcium fluoride, the crystal that gave fluorescence its name. A mineral to collect' },
    battery: { color: 0x2a5a3a, name: 'Lithium Battery', sprite: CHEMISTRY_SPRITES.battery, palette: { T: 0xc8cdd2, C: 0x8a9096, B: 0x3a8a5a, h: 0x8ad8a8, G: 0xe8e8e8 },
        describe: 'lithium cobalt oxide stores energy. Keep it for when machines arrive' },
    meteoric_iron: { color: 0x4a5058, name: 'Meteoric Iron', sprite: CHEMISTRY_SPRITES.ingot, palette: { H: 0xc8ccd2, h: 0x9aa0a8, M: 0x6a7078, m: 0x7a8088, D: 0x3a4048 },
        describe: 'iron and nickel, like the metal of meteorites. A rarity to collect' }
};

Object.entries(CHEMISTRY_ITEMS).forEach(([id, item]) => {
    registerItemType(id, {
        color: item.color,
        name: item.name,
        drawIcon: resourcesDrawSprite(item.sprite, item.palette),
        displayMesh: resourcesDisplayMesh,
        ...(item.food ? { consume(type) { return this.chemistryConsume(type); } } : {}),
        ...(item.describe ? { consume(type) { return this.chemistryDescribe(type); } } : {})
    });
});

// Steel tools: drawn like the other tools (toolType / toolMaterial), one tier above gold.
['pickaxe', 'shovel', 'axe', 'sword'].forEach((tool) => {
    registerItemType(`steel_${tool}`, {
        color: 0x8d969e, name: `Steel ${tool.charAt(0).toUpperCase()}${tool.slice(1)}`,
        toolType: tool, toolMaterial: 'steel', miningTier: CHEMISTRY_STEEL_TIER
    });
});

registerGameContent(function ({ addItem, addRecipe }) {
    addRecipe('lab_bench', 'Build Lab Bench', 'lab_bench', 1, [{ type: 'planks', amount: 4 }, { type: 'glass', amount: 2 }, { type: 'iron_ore', amount: 1 }]);
    addRecipe('salted_fish', 'Cure Fish with Salt', 'salted_fish', 1, [{ type: 'raw_fish', amount: 1 }, { type: 'salt', amount: 1 }]);
    ['pickaxe', 'shovel', 'axe', 'sword'].forEach((tool) => {
        const name = `Forge Steel ${tool.charAt(0).toUpperCase()}${tool.slice(1)}`;
        addRecipe(`steel_${tool}`, name, `steel_${tool}`, 1, [{ type: 'steel_ingot', amount: tool === 'sword' ? 2 : 3 }, { type: 'wood', amount: 1 }]);
    });
    addRecipe('bronze_bell', 'Cast Bronze Bells', 'sound_block', 2, [{ type: 'bronze_ingot', amount: 1 }, { type: 'planks', amount: 1 }]);
    addRecipe('ochre_wool', 'Dye Wool with Red Ochre', 'red_wool', 2, [{ type: 'rust_pigment', amount: 1 }, { type: 'white_wool', amount: 2 }]);
    addRecipe('copper_sulfate_wool', 'Dye Wool with Copper Sulfate', 'blue_wool', 2, [{ type: 'copper_sulfate', amount: 1 }, { type: 'white_wool', amount: 2 }]);
    addRecipe('gold_leaf_block', 'Press Gold Leaf into a Block', 'gold_block', 1, [{ type: 'gold_leaf', amount: 4 }]);
    addRecipe('soda_bread', 'Bake Soda Bread', 'bread', 2, [{ type: 'wheat', amount: 2 }, { type: 'baking_soda', amount: 1 }]);
    addRecipe('lime_mortar', 'Lay Stone Bricks with Lime Mortar', 'stone_bricks', 6, [{ type: 'quicklime', amount: 1 }, { type: 'cobblestone', amount: 4 }]);
    addRecipe('pyrite_torch', 'Strike Pyrite Sparks into Torches', 'torch', 4, [{ type: 'pyrite', amount: 1 }, { type: 'wood', amount: 1 }]);
    if (ITEM_TYPES.telescope) {
        addRecipe('telescope_brass', 'Craft Telescope (Brass)', 'telescope', 1, [{ type: 'glass', amount: 2 }, { type: 'brass_ingot', amount: 1 }, { type: 'planks', amount: 2 }]);
    }
    addItem('water_flask');
    addItem('salt');
    this.chemistryInstall();
});

registerItemUseHandler(function (item, hit) {
    return this.chemistryUse(item, hit);
});

registerModalPanel({
    isOpen() { return Boolean(this.chemistryOpen); },
    close() { this.chemistryClose(); }
});

registerDamageModifier(function (amount, type) {
    return type === 'fall' && this.handsHold('helium_balloon') ? 0 : amount;
});

// The balloon holds you up: falling speed is capped while it is in your hand.
registerFrameUpdate(function () {
    const camera = this.cameraController;
    if (!camera || camera.mount || !this.handsHold('helium_balloon')) return;
    if (camera.velocityY < -CHEMISTRY_BALLOON_FALL_SPEED) camera.velocityY = -CHEMISTRY_BALLOON_FALL_SPEED;
});

const CHEMISTRY_CSS = `
#chemistry-panel{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(980px,calc(100vw - 28px));height:min(86vh,700px);display:none;flex-direction:column;gap:10px;padding:16px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(8,12,20,.94);color:#fff;font-family:'Consolas',monospace;z-index:275;box-sizing:border-box}
#chemistry-panel.visible{display:flex}
#chemistry-panel .chem-header{display:flex;align-items:center;gap:12px}
#chemistry-panel h3{font-size:16px;margin:0;flex:1}
#chemistry-panel .chem-hint{color:#a9bdd5;font-size:11px}
#chemistry-panel button{height:30px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;font:700 12px/1 'Consolas',monospace;cursor:pointer}
#chemistry-panel button:disabled{opacity:.4;cursor:default}
#chemistry-panel button.chem-react{background:rgba(70,180,110,.35);border-color:rgba(159,227,180,.6);height:36px;font-size:14px;padding:0 22px}
#chemistry-panel .chem-body{display:flex;gap:14px;flex:1;min-height:0}
#chemistry-panel .chem-left{flex:1;display:flex;flex-direction:column;gap:10px;min-width:0;overflow:auto}
#chem-table{display:grid;grid-template-columns:repeat(18,minmax(0,1fr));gap:3px}
.chem-cell{aspect-ratio:1;border-radius:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;font-size:clamp(9px,1.4vw,14px);font-weight:700;cursor:pointer;border:1px solid rgba(255,255,255,.18);user-select:none;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.chem-cell.gap{background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.04);cursor:default}
.chem-cell.empty{opacity:.32}
.chem-cell .chem-z{position:absolute;top:1px;left:3px;font-size:clamp(6px,.8vw,9px);font-weight:400;opacity:.85}
.chem-cell .chem-n{position:absolute;bottom:1px;right:3px;font-size:clamp(6px,.8vw,9px);font-weight:400;color:#ffe9a8}
.chem-cell .chem-in{position:absolute;top:-5px;right:-5px;min-width:15px;height:15px;border-radius:8px;background:#9fe3b4;color:#0b1a10;font-size:10px;line-height:15px;text-align:center;text-shadow:none}
.chem-cell:not(.gap):not(.empty):hover{outline:2px solid rgba(151,212,255,.8)}
.chem-legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:10px;color:#c7d7ec}
.chem-legend span{display:inline-flex;align-items:center;gap:4px}
.chem-legend i{display:inline-block;width:10px;height:10px;border-radius:3px}
.chem-bench{display:flex;gap:16px;align-items:center;padding:12px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}
.chem-flask{width:70px;height:90px;flex:none;position:relative}
.chem-flask .neck{position:absolute;left:26px;top:0;width:18px;height:30px;border:2px solid rgba(220,240,255,.7);border-bottom:none;border-radius:3px 3px 0 0}
.chem-flask .body{position:absolute;left:4px;top:28px;width:58px;height:58px;border:2px solid rgba(220,240,255,.7);border-radius:50%;overflow:hidden;background:rgba(255,255,255,.04)}
.chem-flask .liquid{position:absolute;left:0;right:0;bottom:0;height:0;background:#5aa9e6;transition:height .35s,background .5s}
.chem-flask .bubble{position:absolute;bottom:-8px;width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.75);opacity:0}
#chemistry-panel.reacting .chem-flask .bubble{animation:chem-bubble .9s ease-in infinite}
#chemistry-panel.reacting .chem-flask{animation:chem-shake .12s linear 6}
@keyframes chem-bubble{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-60px);opacity:0}}
@keyframes chem-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-2px) rotate(-2deg)}75%{transform:translateX(2px) rotate(2deg)}}
.chem-flask .flash{position:absolute;inset:-14px;border-radius:50%;opacity:0;pointer-events:none}
#chemistry-panel.done .chem-flask .flash{animation:chem-flash .7s ease-out}
@keyframes chem-flash{0%{opacity:.9;transform:scale(.6)}100%{opacity:0;transform:scale(1.5)}}
.chem-mix{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}
.chem-equation{font-size:18px;font-weight:700;min-height:24px}
.chem-equation .arrow{color:#9fe3b4}
.chem-info{font-size:12px;color:#c7d7ec;line-height:1.4;min-height:34px}
.chem-info b{color:#fff}
.chem-info .bad{color:#ffb4b4}
.chem-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.chem-result{font-size:12px;color:#9fe3b4;display:flex;align-items:center;gap:6px;min-height:28px}
.chem-result img{width:26px;height:26px;image-rendering:pixelated}
#chem-reactions{width:300px;flex:none;display:flex;flex-direction:column;gap:6px;overflow:auto;min-height:0}
.chem-reaction{display:flex;gap:8px;align-items:center;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);cursor:pointer;font-size:11px}
.chem-reaction.selected{border-color:rgba(151,212,255,.9);box-shadow:0 0 0 2px rgba(151,212,255,.22)}
.chem-reaction.ready{background:rgba(70,180,110,.14)}
.chem-reaction img{width:28px;height:28px;flex:none;image-rendering:pixelated;border-radius:4px}
.chem-reaction .t{font-weight:700;font-size:12px}
.chem-reaction .e{color:#a9bdd5}
.chem-progress{color:#a9bdd5;font-size:12px}
.chem-progress b{color:#9fe3b4}
.chem-element{display:flex;align-items:center;gap:10px;font-size:12px;color:#c7d7ec;min-height:30px;padding:4px 8px;border-radius:8px;background:rgba(255,255,255,.04)}
.chem-element .sym{font-size:18px;font-weight:700;color:#fff;min-width:30px;text-align:center;border-radius:5px;padding:2px 4px}
.chem-element .txt{flex:1;min-width:0}
#chemistry-panel button.chem-book{height:26px;padding:0 8px;font-size:12px;flex:none}
.chem-reaction .chem-book{margin-left:auto}
.chem-reaction > div{min-width:0}
.chem-reaction.hidden{cursor:default;color:#7d8ba0;background:rgba(255,255,255,.025)}
.chem-reaction.hidden .q{width:28px;height:28px;flex:none;border-radius:4px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-weight:700;color:#5d6b80}
#chemistry-toast{position:fixed;left:50%;top:14%;transform:translate(-50%,-10px);padding:10px 18px;border-radius:10px;border:1px solid rgba(159,227,180,.4);background:rgba(8,12,20,.9);color:#fff;font:700 14px 'Consolas',monospace;pointer-events:none;z-index:300;opacity:0;transition:opacity .4s,transform .4s}
#chemistry-toast.visible{opacity:1;transform:translate(-50%,0)}
#chemistry-toast span{color:#9fe3b4}
@media (max-width:720px){#chemistry-panel .chem-body{flex-direction:column}#chem-reactions{width:auto;max-height:30vh}}
`;

Object.assign(Game.prototype, {
    chemistryInstall() {
        if (this.chemistryInstalled) return;
        this.chemistryInstalled = true;
        this.chemistryOpen = false;
        this.chemistryFlask = {};
        this.chemistryBusy = false;
        this.chemistrySelected = null;
        this.chemistryDiscovered = this.chemistryLoadDiscovered();
        const style = document.createElement('style');
        style.textContent = CHEMISTRY_CSS;
        document.head.appendChild(style);
        this.chemistryBuildPanel();
        // Capture phase: runs before the game's own key handlers.
        window.addEventListener('keydown', (event) => this.chemistryOnKeyDown(event), true);
    },

    chemistryLoadDiscovered() {
        const known = new Set(CHEMISTRY_REACTIONS.filter((reaction) => reaction.known).map((reaction) => reaction.id));
        try {
            const saved = JSON.parse(window.localStorage.getItem(CHEMISTRY_STORAGE_KEY) || '[]');
            if (Array.isArray(saved)) saved.forEach((id) => known.add(id));
        } catch (_error) { /* storage unavailable or corrupt */ }
        return known;
    },

    chemistryIsKnown(reaction) {
        return reaction.known || this.chemistryDiscovered.has(reaction.id);
    },

    // The first time a reaction's atoms are mixed it is discovered, and remembered for good.
    chemistryDiscover(reaction) {
        if (this.chemistryIsKnown(reaction)) return;
        this.chemistryDiscovered.add(reaction.id);
        try {
            const found = [...this.chemistryDiscovered].filter((id) => !CHEMISTRY_REACTIONS.some((r) => r.id === id && r.known));
            window.localStorage.setItem(CHEMISTRY_STORAGE_KEY, JSON.stringify(found));
        } catch (_error) { /* storage full or blocked: it lasts until the page reloads */ }
        [0, 120, 240, 360].forEach((delay, i) => setTimeout(() => {
            this.playTone({ frequency: 660 * Math.pow(1.19, i), duration: 0.1, type: 'sine', volume: 0.02, attack: 0.01, release: 0.14 });
        }, delay));
        this.chemistryToast(`New reaction discovered: <span>${reaction.name}</span>`);
        this.receiveSystemMessage({ text: `Lab: you discovered a new reaction, ${reaction.name} (${this.chemistryFormatMix(reaction.atoms)})` });
    },

    chemistryToast(html) {
        let toast = document.getElementById('chemistry-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'chemistry-toast';
            document.body.appendChild(toast);
        }
        toast.innerHTML = html;
        toast.classList.add('visible');
        clearTimeout(this.chemistryToastTimer);
        this.chemistryToastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
    },

    chemistryElementPage(symbol) {
        return CHEMISTRY_ELEMENT_PAGE_START + CHEMISTRY_ELEMENTS.findIndex((element) => element[0] === symbol);
    },

    chemistryProductPage(reaction) {
        const output = this.chemistryOutput(reaction) || reaction.outputs[reaction.outputs.length - 1];
        return reaction.page || CHEMISTRY_PRODUCT_PAGES[output.type] || 115;
    },

    // Closes the lab and opens the book at `page`; closing the book returns to the game.
    chemistryOpenGuide(page) {
        if (typeof this.guideShow !== 'function') return;
        this.chemistryOpen = false;
        this.chemistryPanel.classList.remove('visible', 'reacting', 'done');
        this.guideShow(String(page));
    },

    chemistryBookButton(page, title) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chem-book';
        button.title = title;
        button.textContent = '📖';
        button.addEventListener('mousedown', (event) => event.stopPropagation());
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            this.chemistryOpenGuide(page);
        });
        return button;
    },

    chemistryElement(symbol) {
        return CHEMISTRY_ELEMENTS.find((element) => element[0] === symbol);
    },

    chemistryCount(type) {
        return this.getInventoryCount(type);
    },

    chemistryBuildPanel() {
        const panel = document.createElement('div');
        panel.id = 'chemistry-panel';
        const legend = Object.entries({
            nonmetal: 'Nonmetal', noble: 'Noble gas', alkali: 'Alkali metal', alkaline: 'Alkaline earth',
            metalloid: 'Metalloid', halogen: 'Halogen', transition: 'Transition metal', post: 'Other metal'
        }).map(([key, label]) => `<span><i style="background:${CHEMISTRY_CATEGORY_COLORS[key]}"></i>${label}</span>`).join('');
        panel.innerHTML = `
            <div class="chem-header">
                <h3>Chemistry Lab</h3>
                <div class="chem-progress"></div>
                <div class="chem-hint">Click an element to add an atom &middot; right click to take it out</div>
                <button class="chem-close" type="button">Close</button>
            </div>
            <div class="chem-body">
                <div class="chem-left">
                    <div id="chem-table"></div>
                    <div class="chem-legend">${legend}</div>
                    <div class="chem-element"></div>
                    <div class="chem-bench">
                        <div class="chem-flask">
                            <div class="flash"></div>
                            <div class="neck"></div>
                            <div class="body"><div class="liquid"></div>
                                <div class="bubble" style="left:12px;animation-delay:0s"></div>
                                <div class="bubble" style="left:26px;animation-delay:.3s"></div>
                                <div class="bubble" style="left:40px;animation-delay:.15s"></div>
                                <div class="bubble" style="left:20px;animation-delay:.55s"></div>
                            </div>
                        </div>
                        <div class="chem-mix">
                            <div class="chem-equation"></div>
                            <div class="chem-info"></div>
                            <div class="chem-actions">
                                <button class="chem-react" type="button">React</button>
                                <button class="chem-clear" type="button">Empty flask</button>
                                <div class="chem-result"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="chem-reactions"></div>
            </div>`;
        panel.querySelector('.chem-close').addEventListener('click', () => this.chemistryClose());
        panel.querySelector('.chem-clear').addEventListener('click', () => {
            this.chemistryFlask = {};
            this.chemistryRender();
        });
        panel.querySelector('.chem-react').addEventListener('click', () => this.chemistryReact());
        panel.addEventListener('mousedown', (event) => event.stopPropagation());
        panel.addEventListener('pointerdown', (event) => event.stopPropagation());
        panel.addEventListener('contextmenu', (event) => event.preventDefault());

        const table = panel.querySelector('#chem-table');
        for (let period = 1; period <= 6; period++) {
            for (let group = 1; group <= 18; group++) {
                const element = CHEMISTRY_ELEMENTS.find((e) => e[2] === group && e[3] === period);
                const cell = document.createElement('div');
                cell.className = 'chem-cell gap';
                if (element) {
                    const [symbol, z, , , category, name] = element;
                    cell.className = 'chem-cell';
                    cell.dataset.symbol = symbol;
                    cell.title = `${name} (${z})`;
                    cell.style.background = CHEMISTRY_CATEGORY_COLORS[category];
                    cell.innerHTML = `<span class="chem-z">${z}</span>${symbol.charAt(0).toUpperCase() + symbol.slice(1)}<span class="chem-n"></span>`;
                    cell.addEventListener('mousedown', (event) => {
                        event.preventDefault();
                        this.chemistrySelected = symbol;
                        this.chemistryAddAtom(symbol, event.button === 2 ? -1 : 1);
                        this.chemistryRenderElement();
                    });
                }
                table.appendChild(cell);
            }
        }
        document.body.appendChild(panel);
        this.chemistryPanel = panel;
        // A click outside closes it, but not the right click on the bench that just opened it.
        document.addEventListener('mousedown', () => {
            if (this.chemistryOpen && performance.now() - this.chemistryOpenedAt > 250) this.chemistryClose();
        });
    },

    chemistryOnKeyDown(event) {
        if (!this.chemistryOpen) return;
        if (event.code === 'Escape' && !event.repeat) this.chemistryClose();
        event.preventDefault();
        event.stopImmediatePropagation();
    },

    chemistryShow() {
        if (this.chemistryOpen) return;
        this.chemistryOpen = true;
        this.chemistryOpenedAt = performance.now();
        this.stopMining();
        this.closeChatInput();
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.chemistryPanel.querySelector('.chem-result').innerHTML = '';
        this.chemistryPanel.classList.add('visible');
        this.chemistryRender();
        this.updatePointerLockHint();
        this.playTone({ frequency: 520, duration: 0.05, type: 'triangle', volume: 0.018, release: 0.06 });
    },

    chemistryClose() {
        if (!this.chemistryOpen) return;
        this.chemistryOpen = false;
        this.chemistryPanel.classList.remove('visible', 'reacting', 'done');
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        this.recapturePointerLock();
        this.updatePointerLockHint();
    },

    chemistryAddAtom(symbol, delta) {
        if (this.chemistryBusy) return;
        const flask = this.chemistryFlask;
        const current = flask[symbol] || 0;
        const total = Object.values(flask).reduce((sum, n) => sum + n, 0);
        if (delta > 0) {
            if (total >= CHEMISTRY_FLASK_LIMIT) return;
            if (!this.creativeMode && current >= this.chemistryCount(`element_${symbol}`)) {
                this.chemistryInfo(`You have no more <b>${this.chemistryElement(symbol)[5]}</b> blocks: craft them with C (Synthesize ${symbol.toUpperCase()} Block).`, true);
                return;
            }
        }
        const next = Math.max(0, current + delta);
        if (next === current) return;
        if (next === 0) delete flask[symbol]; else flask[symbol] = next;
        this.playTone({ frequency: delta > 0 ? 700 + total * 40 : 420, duration: 0.04, type: 'sine', volume: 0.018, release: 0.05 });
        this.chemistryRender();
    },

    // The reaction whose atoms match the flask exactly, or null.
    chemistryMatch(flask = this.chemistryFlask) {
        const keys = Object.keys(flask);
        return CHEMISTRY_REACTIONS.find((reaction) => {
            const atoms = Object.keys(reaction.atoms);
            return atoms.length === keys.length && atoms.every((symbol) => flask[symbol] === reaction.atoms[symbol]);
        }) || null;
    },

    chemistryHas(type, amount) {
        return this.creativeMode || this.chemistryCount(type) >= amount;
    },

    // The output this player can make now (container available), or null.
    chemistryOutput(reaction) {
        return reaction.outputs.find((output) => Object.entries(output.needs || {})
            .every(([type, amount]) => this.chemistryHas(type, amount))) || null;
    },

    // What the reaction lacks: element blocks and containers.
    chemistryMissing(reaction) {
        const missing = [];
        Object.entries(reaction.atoms).forEach(([symbol, amount]) => {
            const have = this.creativeMode ? amount : this.chemistryCount(`element_${symbol}`);
            if (have < amount) missing.push(`${amount - have} ${symbol.charAt(0).toUpperCase() + symbol.slice(1)}`);
        });
        if (!this.chemistryOutput(reaction)) {
            missing.push(reaction.outputs.map((output) => Object.keys(output.needs || {}).map((type) => this.getBlockDisplayName(type)).join(' + ')).join(' or '));
        }
        return missing;
    },

    // In the order the atoms were given: a reaction's own order (Fe + C), or the order clicked.
    chemistryFormatMix(flask) {
        const parts = Object.keys(flask).filter((symbol) => flask[symbol])
            .map((symbol) => `${flask[symbol] > 1 ? `${flask[symbol]} ` : ''}${symbol.charAt(0).toUpperCase() + symbol.slice(1)}`);
        return parts.join(' + ');
    },

    // Compounds, gems and devices show their formula; alloys, metals and noble gases, their name.
    chemistryShowsFormula(reaction) {
        return reaction.kind === 'compound' || reaction.kind === 'gem' || reaction.kind === 'device';
    },

    chemistryProductLabel(reaction) {
        return this.chemistryShowsFormula(reaction) ? `${reaction.formula} (${reaction.name})` : reaction.name;
    },

    chemistryIcon(type) {
        try {
            return this.world.getInventoryIconUrl(type);
        } catch (_error) {
            return '';
        }
    },

    chemistryInfo(html, bad = false) {
        const info = this.chemistryPanel.querySelector('.chem-info');
        info.innerHTML = bad ? `<span class="bad">${html}</span>` : html;
    },

    // The info bar under the table: the last element clicked, with its guide page.
    chemistryRenderElement() {
        const bar = this.chemistryPanel.querySelector('.chem-element');
        bar.innerHTML = '';
        const element = this.chemistrySelected && this.chemistryElement(this.chemistrySelected);
        if (!element) {
            bar.textContent = 'Click an element to see what it is; 📖 opens its page in the guide.';
            return;
        }
        const [symbol, z, group, period, category, name] = element;
        const families = {
            nonmetal: 'nonmetal', noble: 'noble gas', alkali: 'alkali metal', alkaline: 'alkaline earth metal',
            metalloid: 'metalloid', halogen: 'halogen', transition: 'transition metal', post: 'other metal'
        };
        const sym = document.createElement('span');
        sym.className = 'sym';
        sym.style.background = CHEMISTRY_CATEGORY_COLORS[category];
        sym.textContent = symbol.charAt(0).toUpperCase() + symbol.slice(1);
        const text = document.createElement('span');
        text.className = 'txt';
        const count = this.creativeMode ? '∞' : this.chemistryCount(`element_${symbol}`);
        text.innerHTML = `<b>${name}</b> &middot; atomic number ${z} &middot; group ${group}, period ${period} &middot; ${families[category]} &middot; you have ${count}`;
        bar.appendChild(sym);
        bar.appendChild(text);
        bar.appendChild(this.chemistryBookButton(this.chemistryElementPage(symbol), `${name} in the guide`));
    },

    chemistryRender() {
        if (!this.chemistryPanel) return;
        const known = CHEMISTRY_REACTIONS.filter((reaction) => this.chemistryIsKnown(reaction)).length;
        this.chemistryPanel.querySelector('.chem-progress').innerHTML = `<b>${known}</b> / ${CHEMISTRY_REACTIONS.length} reactions`;
        this.chemistryRenderElement();
        const panel = this.chemistryPanel;
        const flask = this.chemistryFlask;
        panel.querySelectorAll('.chem-cell[data-symbol]').forEach((cell) => {
            const symbol = cell.dataset.symbol;
            const count = this.chemistryCount(`element_${symbol}`);
            cell.classList.toggle('empty', !this.creativeMode && count <= 0);
            cell.querySelector('.chem-n').textContent = this.creativeMode ? '∞' : count > 0 ? String(count) : '';
            let badge = cell.querySelector('.chem-in');
            if (flask[symbol]) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'chem-in';
                    cell.appendChild(badge);
                }
                badge.textContent = String(flask[symbol]);
            } else if (badge) {
                badge.remove();
            }
        });

        const match = this.chemistryMatch();
        if (match) this.chemistryDiscover(match);
        const total = Object.values(flask).reduce((sum, n) => sum + n, 0);
        const equation = panel.querySelector('.chem-equation');
        const liquid = panel.querySelector('.chem-flask .liquid');
        liquid.style.height = `${Math.min(100, total / CHEMISTRY_FLASK_LIMIT * 100)}%`;
        liquid.style.background = match ? match.color : 'rgba(200,220,240,.45)';
        panel.querySelector('.chem-flask .flash').style.background = `radial-gradient(circle, ${match ? match.color : '#ffffff'} 0%, transparent 70%)`;
        const react = panel.querySelector('.chem-react');
        if (total === 0) {
            equation.innerHTML = '';
            this.chemistryInfo('The flask is empty. Add atoms from the table, or pick a reaction on the right.');
            react.disabled = true;
        } else if (!match) {
            equation.innerHTML = `${this.chemistryFormatMix(flask)} <span class="arrow">→</span> ?`;
            const noble = Object.keys(flask).some((symbol) => ['he', 'ne', 'ar'].includes(symbol));
            this.chemistryInfo(noble
                ? 'Nothing happens: noble gases (He, Ne, Ar) hardly ever react with anything.'
                : 'Nothing happens with this mix. Check the amounts: every reaction needs exact proportions.');
            react.disabled = true;
        } else {
            const output = this.chemistryOutput(match);
            const outputName = output ? this.getBlockDisplayName(output.type) : this.getBlockDisplayName(match.outputs[0].type);
            equation.innerHTML = `${this.chemistryFormatMix(match.atoms)} <span class="arrow">→</span> ${this.chemistryProductLabel(match)} `;
            equation.appendChild(this.chemistryBookButton(this.chemistryProductPage(match), `${match.name} in the guide`));
            const missing = this.chemistryMissing(match);
            const needs = output && output.needs ? ` &middot; uses ${Object.entries(output.needs).map(([type, n]) => `${n} ${this.getBlockDisplayName(type)}`).join(', ')}` : '';
            const text = `<b>${CHEMISTRY_KINDS[match.kind]}:</b> ${match.note}<br>Makes <b>${output ? output.amount : match.outputs[0].amount} ${outputName}</b>${needs}`;
            this.chemistryInfo(missing.length ? `${text}<br><span class="bad">Missing: ${missing.join(', ')}</span>` : text);
            react.disabled = missing.length > 0 || this.chemistryBusy;
        }

        const list = panel.querySelector('#chem-reactions');
        list.innerHTML = '';
        CHEMISTRY_REACTIONS.forEach((reaction) => {
            const row = document.createElement('div');
            if (!this.chemistryIsKnown(reaction)) {
                // Undiscovered: only how many different elements it takes.
                const kinds = Object.keys(reaction.atoms).length;
                row.className = 'chem-reaction hidden';
                row.innerHTML = `<span class="q">?</span><div><div class="t">???</div>` +
                    `<div class="e">${kinds} element${kinds > 1 ? 's' : ''} &middot; mix them to discover it</div></div>`;
                list.appendChild(row);
                return;
            }
            const ready = this.chemistryMissing(reaction).length === 0;
            row.className = `chem-reaction${match === reaction ? ' selected' : ''}${ready ? ' ready' : ''}`;
            const product = (this.chemistryOutput(reaction) || reaction.outputs[reaction.outputs.length - 1]).type;
            const formula = this.chemistryShowsFormula(reaction) ? ` → ${reaction.formula}` : '';
            row.innerHTML = `<img alt="" src="${this.chemistryIcon(product)}"><div><div class="t">${reaction.name}</div>` +
                `<div class="e">${this.chemistryFormatMix(reaction.atoms)}${formula}</div></div>`;
            row.appendChild(this.chemistryBookButton(this.chemistryProductPage(reaction), `${reaction.name} in the guide`));
            row.addEventListener('click', () => {
                if (this.chemistryBusy) return;
                this.chemistryFlask = { ...reaction.atoms };
                this.chemistryRender();
            });
            list.appendChild(row);
        });
    },

    chemistryTake(type, amount) {
        if (this.creativeMode) return;
        this.inventoryCounts[type] = Math.max(0, this.chemistryCount(type) - amount);
    },

    chemistryReact() {
        const reaction = this.chemistryMatch();
        if (!reaction || this.chemistryBusy || this.chemistryMissing(reaction).length) return;
        const output = this.chemistryOutput(reaction);
        if (!output) return;
        Object.entries(reaction.atoms).forEach(([symbol, amount]) => this.chemistryTake(`element_${symbol}`, amount));
        Object.entries(output.needs || {}).forEach(([type, amount]) => this.chemistryTake(type, amount));
        this.addInventory(output.type, output.amount);
        this.chemistryAnimate(reaction, output);
    },

    chemistryAnimate(reaction, output) {
        const panel = this.chemistryPanel;
        this.chemistryBusy = true;
        panel.classList.remove('done');
        panel.classList.add('reacting');
        panel.querySelector('.chem-result').innerHTML = '';
        panel.querySelector('.chem-react').disabled = true;
        // Bubbling, then a rising chime.
        this.playNoiseBurst({ duration: 0.8, volume: 0.016, highpass: 1800, lowpass: 6000 });
        [0, 140, 280].forEach((delay, i) => setTimeout(() => {
            this.playTone({ frequency: 520 * Math.pow(1.26, i), duration: 0.12, type: 'triangle', volume: 0.022, attack: 0.01, release: 0.12 });
        }, 700 + delay));
        setTimeout(() => {
            this.chemistryBusy = false;
            panel.classList.remove('reacting');
            panel.classList.add('done');
            const name = this.getBlockDisplayName(output.type);
            panel.querySelector('.chem-result').innerHTML =
                `<img alt="" src="${this.chemistryIcon(output.type)}"> +${output.amount} ${name}`;
            this.receiveSystemMessage({ text: `Lab: ${this.chemistryFormatMix(reaction.atoms)} → ${this.chemistryProductLabel(reaction)} · you made ${output.amount} ${name}` });
            // Keep the same mix ready while there is enough for another round.
            if (this.chemistryMissing(reaction).length) this.chemistryFlask = {};
            this.chemistryRender();
            setTimeout(() => panel.classList.remove('done'), 800);
        }, 1100);
    },

    // Right click: open the bench, fertilize a crop.
    chemistryUse(item, hit) {
        if (!hit) return false;
        const position = this.world.getBlockPositionFromIntersection(hit);
        if (!position) return false;
        const target = this.world.getBlockTypeAt(position.x, position.y, position.z);
        if (target === 'lab_bench') {
            this.chemistryShow();
            return true;
        }
        if (item === 'fertilizer') return this.chemistryFertilize(position, target);
        return false;
    },

    // One growth stage at once; the server keeps tracking the crop from the new stage.
    chemistryFertilize(position, target) {
        if (!CHEMISTRY_FERTILIZABLE.includes(target)) {
            const text = target === 'wheat_3' ? 'This wheat is already ripe' : 'Fertilizer works on growing wheat: right click a young crop';
            this.receiveSystemMessage({ text });
            return true;
        }
        if (typeof this.farmingSetBlock !== 'function' || this.getInventoryCount('fertilizer') <= 0) return true;
        const next = `wheat_${Number(target.slice(-1)) + 1}`;
        if (!this.farmingSetBlock(position, next)) return true;
        this.consumeSelectedBlock();
        this.playTone({ frequency: 660, duration: 0.08, type: 'sine', volume: 0.02, release: 0.1, endFrequency: 990 });
        this.playNoiseBurst({ duration: 0.12, volume: 0.012, highpass: 1200, lowpass: 4000 });
        return true;
    },

    // G key on the drinks and the salted fish.
    chemistryConsume(type) {
        const item = CHEMISTRY_ITEMS[type];
        if (!item || !item.food) return false;
        if (this.health >= this.maxHealth) {
            this.receiveSystemMessage({ text: 'You are already at full health' });
            return true;
        }
        if (!this.consumeSelectedBlock()) return false;
        const healed = Math.min(item.food, this.maxHealth - this.health);
        this.health = Math.min(this.maxHealth, this.health + item.food);
        this.updateHealthUI();
        if (item.bottle) {
            this.addInventory('glass', 1);
            this.playNoiseBurst({ duration: type === 'soda_water' ? 0.5 : 0.3, volume: 0.018, highpass: type === 'soda_water' ? 2000 : 300, lowpass: type === 'soda_water' ? 7000 : 1400 });
        } else {
            this.playTone({ frequency: 600, duration: 0.05, type: 'triangle', volume: 0.025, release: 0.05 });
        }
        const verb = item.bottle ? 'drank' : 'ate';
        const fizz = type === 'soda_water' ? ' (fizz!)' : '';
        this.receiveSystemMessage({ text: `You ${verb} ${item.name}${fizz} and recovered ${healed} health` });
        return true;
    },

    // G key on gear and collectibles: what it is.
    chemistryDescribe(type) {
        const item = CHEMISTRY_ITEMS[type];
        if (!item || !item.describe) return false;
        this.receiveSystemMessage({ text: `${item.name}: ${item.describe}` });
        return true;
    }
});
