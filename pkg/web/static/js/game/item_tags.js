// Tags of the items: families (#building, #food...) and colours (#blue...), to search in the inventory and in
// crafting, where `#building #blue brick` means building AND blue AND the text "brick".
// - Almost every tag comes from what the catalogue already says (itemTagsDerived): `category`, `food`, `electric`,
//   `toolType`..., and the pattern of the id (*_brick, *_stained_glass, sample_*...). A state (`oak_chair:e`)
//   has the tags of its item. ITEM_TAG_TABLE is for what no rule can know, and ITEM_TAG_EXCEPT for what a rule
//   gets wrong. There is no catch-all: an item that nothing recognises has no family, and
//   test/js/item_tags.test.js fails until it gets one.
// - A tag is written in either language, in any case, with or without accents, `-` or `_`. While it is being
//   written a beginning is enough (#const), and then it means any tag that starts like that. What is shown follows
//   gameLang().
// - All of it is worked out once, on start (ItemTagIndex): typing only compares what is already there.
// Loaded before js/game/inventory.js, which draws it; touches nothing but its own tables.

// id: labels of each language, then other words that also find it. In the order the chips show them.
const ITEM_TAG_FAMILIES = {
    building: { EN: 'building', ES: 'construcción', also: ['construction', 'build'] },
    wood: { EN: 'wood', ES: 'madera' },
    stone: { EN: 'stone', ES: 'piedra' },
    metal: { EN: 'metal', ES: 'metal' },
    ore: { EN: 'ore', ES: 'mineral', also: ['mena'] },
    glass: { EN: 'glass', ES: 'vidrio', also: ['cristal'] },
    wool: { EN: 'wool', ES: 'lana' },
    furniture: { EN: 'furniture', ES: 'mueble', also: ['muebles'] },
    storage: { EN: 'storage', ES: 'almacén' },
    light: { EN: 'light', ES: 'luz', also: ['iluminación'] },
    electric: { EN: 'electric', ES: 'eléctrico', also: ['electricity', 'electricidad'] },
    logic: { EN: 'logic', ES: 'lógica' },
    mechanism: { EN: 'mechanism', ES: 'mecanismo' },
    tool: { EN: 'tool', ES: 'herramienta' },
    weapon: { EN: 'weapon', ES: 'arma' },
    armor: { EN: 'armor', ES: 'armadura', also: ['armour', 'equipo'] },
    food: { EN: 'food', ES: 'comida', also: ['alimento'] },
    drink: { EN: 'drink', ES: 'bebida' },
    farming: { EN: 'farming', ES: 'cultivo', also: ['agricultura', 'huerto'] },
    plant: { EN: 'plant', ES: 'planta' },
    nature: { EN: 'nature', ES: 'naturaleza', also: ['terreno', 'terrain'] },
    animal: { EN: 'animal', ES: 'animal' },
    egg: { EN: 'egg', ES: 'huevo', also: ['mob', 'mob-egg', 'huevo-mob'] },
    fossil: { EN: 'fossil', ES: 'fósil', also: ['fossils', 'fósiles'] },
    bait: { EN: 'bait', ES: 'cebo' },
    chemistry: { EN: 'chemistry', ES: 'química' },
    element: { EN: 'element', ES: 'elemento' },
    science: { EN: 'science', ES: 'ciencia' },
    microscope: { EN: 'microscope', ES: 'microscopio' },
    sample: { EN: 'sample', ES: 'muestra' },
    decoration: { EN: 'decoration', ES: 'decoración', also: ['decor'] },
    transport: { EN: 'transport', ES: 'transporte' }
};

// The key is the word in the id of the item (js/world.js colorNames).
const ITEM_TAG_COLORS = {
    white: { EN: 'white', ES: 'blanco' },
    light_gray: { EN: 'light-gray', ES: 'gris-claro', also: ['light-grey'] },
    gray: { EN: 'gray', ES: 'gris', also: ['grey'] },
    black: { EN: 'black', ES: 'negro' },
    brown: { EN: 'brown', ES: 'marrón', also: ['café'] },
    red: { EN: 'red', ES: 'rojo' },
    orange: { EN: 'orange', ES: 'naranja' },
    yellow: { EN: 'yellow', ES: 'amarillo' },
    lime: { EN: 'lime', ES: 'lima' },
    green: { EN: 'green', ES: 'verde' },
    cyan: { EN: 'cyan', ES: 'cian' },
    light_blue: { EN: 'light-blue', ES: 'azul-claro', also: ['celeste'] },
    blue: { EN: 'blue', ES: 'azul' },
    purple: { EN: 'purple', ES: 'morado', also: ['púrpura'] },
    magenta: { EN: 'magenta', ES: 'magenta' },
    pink: { EN: 'pink', ES: 'rosa' }
};

// The tags as they are written on the edge of a cell: [EN, ES], 6 characters at the most, so that two always fit the
// narrowest cell (86px). The families are beginnings of the tag, so that typing what is seen there finds it.
const ITEM_TAG_SHORT = {
    building: ['build', 'const.'], wood: ['wood', 'madera'], stone: ['stone', 'piedra'], metal: ['metal', 'metal'], ore: ['ore', 'miner.'], glass: ['glass', 'vidrio'],
    wool: ['wool', 'lana'], furniture: ['furn.', 'mueble'], storage: ['stor.', 'almac.'], light: ['light', 'luz'], electric: ['elec.', 'eléc.'], logic: ['logic', 'lógica'],
    mechanism: ['mech.', 'mecan.'], tool: ['tool', 'herr.'], weapon: ['weapon', 'arma'], armor: ['armor', 'armad.'], food: ['food', 'comida'], drink: ['drink', 'bebida'],
    farming: ['farm', 'cult.'], plant: ['plant', 'planta'], nature: ['nature', 'natur.'], animal: ['animal', 'animal'], egg: ['egg', 'huevo'], fossil: ['fossil', 'fósil'],
    bait: ['bait', 'cebo'],
    chemistry: ['chem.', 'quím.'], element: ['elem.', 'elem.'], science: ['sci.', 'cien.'], microscope: ['micro.', 'micro.'], sample: ['sample', 'muest.'],
    decoration: ['decor', 'decor.'], transport: ['trans.', 'trans.'],
    white: ['white', 'blanco'], light_gray: ['l.gray', 'gr.cl.'], gray: ['gray', 'gris'], black: ['black', 'negro'], brown: ['brown', 'marrón'], red: ['red', 'rojo'],
    orange: ['orange', 'naran.'], yellow: ['yellow', 'amar.'], lime: ['lime', 'lima'], green: ['green', 'verde'], cyan: ['cyan', 'cian'], light_blue: ['l.blue', 'az.cl.'],
    blue: ['blue', 'azul'], purple: ['purple', 'morado'], magenta: ['magen.', 'magen.'], pink: ['pink', 'rosa']
};
// How many fit the edge of a cell of each list (its CSS: .inventory-item, .craft-card).
const ITEM_TAG_BRIEF_MAX = { inventory: 2, crafting: 3 };
// The space between chips (its CSS: .panel-tags).
const ITEM_TAG_CHIP_GAP = 5;
// In a row of chips a family is worth this many colours: the icon already shows the colour.
const ITEM_TAG_FAMILY_WEIGHT = 2;

// In the catalogue, but not an item anybody can hold.
const ITEM_TAG_NOT_ITEMS = ['air'];

// Metals among the elements of the periodic table (element_*).
const ITEM_TAG_METAL_ELEMENTS = /^(Li|Be|Na|Mg|Al|K|Ca|Ti|Cr|Mn|Fe|Co|Ni|Cu|Zn|Ag|Sn|W|Pt|Au|Hg|Pb)$/;
const ITEM_TAG_COLOR_PATTERN = new RegExp(`(?:^|_)(${Object.keys(ITEM_TAG_COLORS).sort((a, b) => b.length - a.length).join('|')})(?:_|$)`);
// Machines with slots, but nobody keeps things in them.
const ITEM_TAG_NOT_STORAGE = ['oven', 'foundry', 'arc_furnace', 'microscope', 'incubator', 'autoclave', 'revival_machine'];

// Patterns of the id: id -> what it says.
const ITEM_TAG_PATTERNS = [
    [/(^|_)bricks?(_slab|_stairs)?$/, ['stone', 'building']],
    [/_(slab|stairs|door|trapdoor|fence|fence_gate|bars)$/, ['building']],
    [/^(copper|iron|gold)_(block|door|trapdoor|bars)$/, ['metal']],
    [/_ingot$/, ['metal']],
    [/_ore$/, ['ore', 'stone']],
    [/(^|_)glass(_pane)?$/, ['glass', 'building']],
    [/_wool$/, ['wool', 'building']],
    [/_(carpet|curtain)$/, ['wool', 'decoration']],
    [/^painting_/, ['decoration']],
    [/_(chair|sofa)$/, ['furniture']],
    [/_(lamp|bulb)$|^(torch|lantern|chandelier|candle)$/, ['light']],
    [/_ram$/, ['mechanism']],
    [/^lift_/, ['mechanism', 'transport']],
    [/^sample_/, ['sample', 'science', 'microscope']],
    [/^culture_/, ['science', 'microscope']],
    [/^bait_/, ['bait']],
    [/_bucket$/, ['tool']],
    [/^flower_(?!pot$)|^mushroom_/, ['plant']]
];

// What only a person can tell: family -> items. Rules get the rest; `itemTagsFromTableOnly` lists who depends on this.
const ITEM_TAG_TABLE = {
    building: ['grass', 'dirt', 'sand', 'stone', 'cobblestone', 'wood', 'planks', 'ladder', 'claim_marker'],
    wood: ['wood', 'planks', 'ladder', 'sign', 'bed'],
    stone: ['stone', 'cobblestone', 'claim_marker'],
    metal: ['meteoric_iron', 'gold_leaf'],
    furniture: ['bed', 'stool', 'bench', 'table', 'bedside_table', 'desk', 'chest', 'barrel', 'wardrobe', 'bookshelf', 'wall_shelf', 'workbench', 'oven', 'sink', 'fridge',
        'chest_freezer', 'toilet', 'bathtub', 'candle', 'lantern', 'table_lamp', 'floor_lamp', 'chandelier', 'foundry', 'arc_furnace'],
    light: ['firefly_jar', 'glow_block'],
    electric: ['battery', 'solar_cell'],
    mechanism: ['electric_motor', 'hand_crank', 'water_wheel', 'wind_turbine', 'robot', 'copper_golem_core', 'sound_block'],
    tool: ['fishing_rod', 'bug_net', 'cage_trap', 'bucket', 'measuring_tape', 'blueprint', 'written_blueprint', 'multimeter', 'copper_wrench', 'spray_paint'],
    food: ['bread', 'salted_fish', 'frozen_fish', 'frozen_cooked_fish', 'frozen_bread'],
    drink: ['water_flask', 'soda_water'],
    farming: ['wheat', 'wheat_seeds', 'fertilizer', 'farmland', 'grow_lamp'],
    plant: ['leaves', 'tall_grass', 'cactus', 'wheat', 'wheat_seeds', 'moss'],
    nature: ['grass', 'dirt', 'sand', 'water', 'bedrock', 'ice'],
    animal: ['glow_dust', 'feather', 'leather', 'fur', 'milk', 'honeycomb', 'raw_fish', 'shell', 'scale', 'venom_sac', 'shadow_essence', 'ant_farm', 'ant_colony_jar',
        'eel_bucket', 'eel_tank', 'firefly_jar', 'breeding_notebook'],
    // The machine that takes the fossils is found with them (js/game/revival.js).
    fossil: ['revival_machine'],
    chemistry: ['water_flask', 'soda_water', 'salt', 'steel_ingot', 'bronze_ingot', 'brass_ingot', 'fertilizer', 'helium_balloon', 'rust_pigment', 'ruby', 'sapphire', 'solar_cell',
        'copper_sulfate', 'gold_leaf', 'baking_soda', 'quicklime', 'pyrite', 'iodine_tincture', 'fluorite', 'battery', 'meteoric_iron', 'lab_bench', 'neon_lamp', 'argon_lamp',
        'cobalt_glass', 'mirror', 'foundry', 'arc_furnace', 'methylene_blue'],
    science: ['thermometer', 'barometer', 'anemometer', 'telescope', 'star_chart', 'weather_station', 'breeding_notebook', 'multimeter', 'lab_bench', 'microscope', 'ant_farm',
        'test_tube', 'glass_slide', 'micropipette', 'tardigrade_tube', 'tardigrade_tun', 'methylene_blue', 'darkfield_stop',
        'incubator', 'autoclave', 'petri_dish', 'agar_plate', 'agar_plate_unsterile', 'used_dish', 'water_filter', 'revival_machine'],
    microscope: ['microscope', 'test_tube', 'glass_slide', 'micropipette', 'tardigrade_tube', 'tardigrade_tun', 'methylene_blue', 'darkfield_stop', 'moss',
        'incubator', 'autoclave', 'petri_dish', 'agar_plate', 'agar_plate_unsterile', 'used_dish', 'water_filter'],
    decoration: ['sign', 'flower_pot', 'vase', 'wall_clock', 'wall_mirror', 'mirror', 'sound_block', 'spray_paint', 'glow_block'],
    transport: ['ladder'],
    // Colours no id says.
    red: ['ruby'],
    blue: ['sapphire', 'cobalt_glass']
};

// What a rule says and is not so: family -> items. (A painting is mined like wood; that does not make it wood.)
const ITEM_TAG_EXCEPT = {
    wood: /^(painting_.*|wall_clock|weather_station|lab_bench)$/
};

// A piece of furniture, a machine or a lamp is made of materials, but it is not something to build walls with.
// Nor is the rock of a fossil: it is mined like stone, and what comes out of it is the fossil.
const ITEM_TAG_NOT_BUILDING = ['furniture', 'decoration', 'science', 'microscope', 'electric', 'light', 'fossil'];
const ITEM_TAG_NOT_STONE = [...ITEM_TAG_NOT_BUILDING, 'metal'];

function itemTagFold(text) {
    return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// The words of a tag compare without separators: light-blue, light_blue, lightblue.
function itemTagFoldWord(text) {
    return itemTagFold(text).replace(/[-_]/g, '');
}

function itemTagInfo(tag) {
    return ITEM_TAG_FAMILIES[tag] || ITEM_TAG_COLORS[tag] || null;
}

// Every written form of every tag. It is checked that no two tags share one.
const ITEM_TAG_WORDS = (() => {
    const words = new Map();
    for (const tags of [ITEM_TAG_FAMILIES, ITEM_TAG_COLORS]) {
        for (const [tag, info] of Object.entries(tags)) {
            for (const word of [tag, info.EN, info.ES, ...(info.also || [])]) words.set(itemTagFoldWord(word), tag);
        }
    }
    return words;
})();
const ITEM_TAG_ORDER = [...Object.keys(ITEM_TAG_FAMILIES), ...Object.keys(ITEM_TAG_COLORS)];
const ITEM_TAG_RANK = new Map(ITEM_TAG_ORDER.map((tag, rank) => [tag, rank]));
const ITEM_TAG_EXPLICIT = (() => {
    const explicit = new Map();
    for (const [tag, ids] of Object.entries(ITEM_TAG_TABLE)) {
        for (const id of ids) {
            if (!explicit.has(id)) explicit.set(id, []);
            explicit.get(id).push(tag);
        }
    }
    return explicit;
})();

function itemTagIsFamily(tag) {
    return Boolean(ITEM_TAG_FAMILIES[tag]);
}

// `#blue` in the language of the game, or the bare word.
function itemTagWord(tag, lang = gameLang()) {
    const info = itemTagInfo(tag);
    return info ? info[lang] || info.EN : tag;
}

function itemTagLabel(tag, lang = gameLang()) {
    return `#${itemTagWord(tag, lang)}`;
}

// What the data of an item says, without ITEM_TAG_TABLE.
function itemTagsDerived(id, def) {
    const tags = new Set();
    const category = def && def.category;
    if (category === 'stone') tags.add('stone').add('building');
    if (category === 'wood') tags.add('wood').add('building');
    if (category === 'wool') tags.add('wool');
    if (category === 'leaves') tags.add('plant');
    if (category === 'soil') tags.add('nature').add('building');
    if (category === 'element') tags.add('element').add('chemistry').add('building');
    if (category === 'electric' || (def && def.electric)) tags.add('electric');
    if (def) {
        if (def.elementSymbol && ITEM_TAG_METAL_ELEMENTS.test(def.elementSymbol)) tags.add('metal');
        if (def.logicKind) tags.add('logic');
        if (def.toolType) tags.add(def.toolType === 'sword' ? 'weapon' : 'tool');
        if (def.armour || def.fallGuard || def.frontGuard) tags.add('armor');
        if (def.food) tags.add('food');
        if (def.bottle) tags.add('drink');
        if (def.eggSpecies) tags.add('egg');
        if (def.fossilSource) tags.add('fossil');
        if (def.revives) tags.add('animal');
        if (def.saplingWood || def.cropStage !== undefined) tags.add('plant').add('farming');
        if (def.ore) tags.add('ore');
        if (def.seat) tags.add('furniture');
        if (def.storageSlots && !ITEM_TAG_NOT_STORAGE.includes(id)) tags.add('storage');
        if (def.lightEmission) tags.add('light');
    }
    for (const [pattern, says] of ITEM_TAG_PATTERNS) {
        if (pattern.test(id)) says.forEach((tag) => tags.add(tag));
    }
    const color = id.match(ITEM_TAG_COLOR_PATTERN);
    if (color) tags.add(color[1]);
    return tags;
}

// The tags of an item, in the order they are shown. Pass the catalogue so a state finds its item.
function itemTagsOf(id, blockTypes) {
    const def = blockTypes[id];
    const base = def && def.variantOf ? def.variantOf : String(id).split(':')[0];
    if (base !== id) return itemTagsOf(base, blockTypes);
    const tags = itemTagsDerived(id, def);
    for (const tag of ITEM_TAG_EXPLICIT.get(id) || []) tags.add(tag);
    const fromTable = ITEM_TAG_EXPLICIT.get(id) || [];
    const has = (list) => list.some((tag) => tags.has(tag));
    if (has(ITEM_TAG_NOT_BUILDING) && !fromTable.includes('building')) tags.delete('building');
    if (has(ITEM_TAG_NOT_STONE) && !fromTable.includes('stone') && !tags.has('ore')) tags.delete('stone');
    for (const [tag, pattern] of Object.entries(ITEM_TAG_EXCEPT)) {
        if (pattern.test(id)) tags.delete(tag);
    }
    return [...tags].sort((a, b) => ITEM_TAG_RANK.get(a) - ITEM_TAG_RANK.get(b));
}

// The items of the catalogue that have a tag: all but the states and ITEM_TAG_NOT_ITEMS.
function itemTagCatalogue(blockTypes) {
    return Object.keys(blockTypes).filter((id) => !blockTypes[id].variantOf && !ITEM_TAG_NOT_ITEMS.includes(id));
}

// Items no rule recognises, whose family is there only thanks to ITEM_TAG_TABLE.
function itemTagsFromTableOnly(blockTypes) {
    return itemTagCatalogue(blockTypes).filter((id) => ![...itemTagsDerived(id, blockTypes[id])].some(itemTagIsFamily));
}

// An item's tags from what says the most of it to what says the least: families, the rarest first, and then colours.
function itemTagBriefTags(tags, counts) {
    const rank = (tag) => (itemTagIsFamily(tag) ? 0 : 1e6) + (counts.get(tag) || 0);
    return [...tags].sort((a, b) => rank(a) - rank(b) || ITEM_TAG_RANK.get(a) - ITEM_TAG_RANK.get(b));
}

// Each item's tags and text, worked out once.
class ItemTagIndex {
    constructor(blockTypes) {
        this.blockTypes = blockTypes;
        this.entries = new Map();
        for (const id of Object.keys(blockTypes)) this.entry(id);
    }

    // Asks for what a later registration may have added, too.
    entry(id) {
        let entry = this.entries.get(id);
        if (!entry) {
            const def = this.blockTypes[id];
            const tags = itemTagsOf(id, this.blockTypes);
            entry = { tags, set: new Set(tags), text: itemTagFold(`${id} ${def ? def.name : id}`), briefs: {} };
            this.entries.set(id, entry);
        }
        return entry;
    }

    // How many items of the catalogue have each tag: the fewer, the more it says of one of them.
    tagCounts() {
        if (!this.counts) {
            this.counts = new Map();
            for (const id of itemTagCatalogue(this.blockTypes)) {
                for (const tag of this.entry(id).tags) this.counts.set(tag, (this.counts.get(tag) || 0) + 1);
            }
        }
        return this.counts;
    }

    // The words on the edge of an item's cell: its most specific families, then colours, up to `max`. Worked out once.
    brief(id, max, lang = gameLang()) {
        const entry = this.entry(id);
        const key = `${lang}${max}`;
        if (entry.briefs[key] === undefined) {
            const column = lang === 'ES' ? 1 : 0;
            entry.briefs[key] = itemTagBriefTags(entry.tags, this.tagCounts()).slice(0, max).map((tag) => ITEM_TAG_SHORT[tag][column]).join(' ');
        }
        return entry.briefs[key];
    }
}

// Which tags a written word is: the one it names exactly or, while it is being written, all that start like it.
function itemTagResolve(word) {
    const folded = itemTagFoldWord(word);
    if (!folded) return { exact: null, tags: [] };
    const exact = ITEM_TAG_WORDS.get(folded);
    if (exact) return { exact, tags: [exact] };
    const tags = new Set();
    for (const [known, tag] of ITEM_TAG_WORDS) {
        if (known.startsWith(folded)) tags.add(tag);
    }
    return { exact: null, tags: [...tags] };
}

let itemTagLastQuery = null;
let itemTagLastParsed = null;

// A search, taken apart: `groups`, for each #word the tags that satisfy it; `exact`, the tags named in full;
// `partial`, those a #word still being written could become;
// `text`, the rest, in one piece as it always was; `impossible`, a #word that is no tag.
function itemTagParseQuery(query) {
    if (query === itemTagLastQuery) return itemTagLastParsed;
    const raw = String(query).trim();
    const groups = [];
    const exact = [];
    const partial = [];
    const rest = [];
    let impossible = false;
    let anyTag = false;
    for (const word of raw.split(/\s+/)) {
        if (!word.startsWith('#')) {
            if (word) rest.push(word);
            continue;
        }
        anyTag = true;
        if (word.length === 1) continue;
        const resolved = itemTagResolve(word.slice(1));
        if (resolved.tags.length === 0) impossible = true;
        groups.push(resolved.tags);
        if (resolved.exact) exact.push(resolved.exact);
        else partial.push(...resolved.tags);
    }
    const parsed = { groups, exact, partial, impossible, text: itemTagFold(anyTag ? rest.join(' ') : raw), empty: !raw };
    itemTagLastQuery = query;
    itemTagLastParsed = parsed;
    return parsed;
}

// Whether an item with this set of tags and this text is what was asked. Text is optional for what has its own.
function itemTagMatches(parsed, tagSet, text) {
    if (parsed.impossible) return false;
    for (const group of parsed.groups) {
        let found = false;
        for (let i = 0; i < group.length; i++) {
            if (tagSet.has(group[i])) { found = true; break; }
        }
        if (!found) return false;
    }
    return !parsed.text || text.includes(parsed.text);
}

// The chips for some results, the most useful first, as only one row of them is shown:
// 1. Those named in the search, always, to take them away.
// 2. Those a #word being written could become, to finish it.
// 3. The rest by how well they split the results: count * (total - count), best at half of them. One that all the
//    results have narrows nothing and is left out; one that a single result has says little. Families count double,
//    so colours come after unless the families on show would hardly narrow anything.
function itemTagChips(parsed, tagLists) {
    const counts = new Map();
    for (const tags of tagLists) {
        for (let i = 0; i < tags.length; i++) counts.set(tags[i], (counts.get(tags[i]) || 0) + 1);
    }
    const total = tagLists.length;
    const score = (tag) => {
        const count = counts.get(tag);
        return count * (total - count) * (itemTagIsFamily(tag) ? ITEM_TAG_FAMILY_WEIGHT : 1);
    };
    const best = (a, b) => score(b) - score(a) || ITEM_TAG_RANK.get(a) - ITEM_TAG_RANK.get(b);
    const named = ITEM_TAG_ORDER.filter((tag) => parsed.exact.includes(tag));
    const taken = new Set(named);
    const finishing = parsed.partial.filter((tag) => counts.has(tag) && !taken.has(tag));
    const unique = [...new Set(finishing)].sort(best);
    unique.forEach((tag) => taken.add(tag));
    const others = [...counts.keys()].filter((tag) => !taken.has(tag) && counts.get(tag) < total).sort(best);
    return [...named, ...unique, ...others];
}

// Which chips fit a row of `available` pixels, given their widths in order: the indexes kept. Chips are whole: one
// that does not fit is left out, and a narrower one after it may still take the room.
function itemTagFitChips(widths, available, gap = ITEM_TAG_CHIP_GAP) {
    const kept = [];
    let used = 0;
    for (let i = 0; i < widths.length; i++) {
        const needed = (kept.length ? gap : 0) + widths[i];
        if (used + needed > available) continue;
        used += needed;
        kept.push(i);
    }
    return kept;
}

// The search with a tag added, or taken away if it was there. A #word still being written that could be the tag
// is finished rather than left behind. It ends in a space, ready for typing more.
function itemTagToggleInQuery(query, tag, lang = gameLang()) {
    const words = String(query).trim().split(/\s+/).filter(Boolean);
    const isThis = (word) => word.startsWith('#') && itemTagResolve(word.slice(1)).exact === tag;
    let next;
    if (words.some(isThis)) {
        next = words.filter((word) => !isThis(word));
    } else {
        next = words.slice();
        const last = next[next.length - 1];
        if (last && last.startsWith('#') && (last === '#' || (!itemTagResolve(last.slice(1)).exact && itemTagResolve(last.slice(1)).tags.includes(tag)))) next.pop();
        next.push(itemTagLabel(tag, lang));
    }
    return next.length ? `${next.join(' ')} ` : '';
}

// The placeholders of the search fields.
function itemTagSearchHint(what, lang = gameLang()) {
    const hints = {
        items: { ES: 'Buscar objetos o #etiquetas...', EN: 'Search items or #tags...' },
        recipes: { ES: 'Buscar recetas o #etiquetas...', EN: 'Search recipes or #tags...' }
    };
    return hints[what][lang] || hints[what].EN;
}
