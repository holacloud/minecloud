// Fossils: the blocks the world hides in its rock, and the item each one gives when it is broken.
// - The server makes the blocks with the terrain (pkg/terrain/fossils.go, mirrored by js/terrainGen.js), and
//   only in land nobody has visited yet. There are seven, each in its own layer (guide, pages 262 and 263):
//       fossil_rock, fossil_rock_rare          a common or a rare fossil, in the deep rock
//       fossil_bones_skull, _spine, _tail      the three pieces of a skeleton, in a line inside one chunk
//       amber_rock                             amber, in the rock under the forest
//       old_bones                              recent bones, under the sand of a beach or the soil of a plain
// - A species says its fossil when it registers (the `fossil` field of registerSpecies, js/extensions.js). From
//   that alone it gets its items here: `fossil_<species>`, or `fossil_<species>_skull`, `_spine` and `_tail`
//   when it is a skeleton. Each item says the species it revives, its rarity and its piece.
// - Which animal is inside a block is worked out from where the block is (fossilSpeciesAt), so every player
//   finds the same one in the same block and the server needs no list of species. Breaking the block gives
//   the item, never the block (fossilItemAt, through the block's `dropAt`). While no species has a fossil of
//   that kind the block gives what it is made of: cobblestone, a piece of plain amber, dirt.
// - For the other files: FOSSIL_SPECIES (each species' fossil, whole, with its defaults filled in),
//   fossilItemsOf(species) and fossilBlocksOf(species), fossilSpeciesAt and fossilItemAt. The machine that
//   revives them mirrors `water`, `seconds` and the pieces on the server.
// Everything here is worked out when the scripts load; nothing runs per frame. Hooked through js/extensions.js.

// Where a fossil is found, which is also what kind of block holds it.
const FOSSIL_SOURCES = ['rock', 'amber', 'bones', 'skeleton'];
const FOSSIL_RARITIES = ['common', 'rare', 'legendary'];
// The pieces of a skeleton: the block's name says which one it is, and the species needs all three.
const FOSSIL_PIECES = ['skull', 'spine', 'tail'];
// How long a fossil takes to revive when its species does not say, by rarity, in seconds.
const FOSSIL_SECONDS = { common: 20, rare: 45, legendary: 120 };
const FOSSIL_FIELDS = ['source', 'rarity', 'weight', 'water', 'seconds'];

// The blocks of the generator and what each one is, besides its name and its looks:
//   pool    which species may be inside (fossilPoolOf)
//   source  the kind of fossil it holds, as a species says it
//   piece   the part of a skeleton it is
//   plain   what it gives while no species has a fossil of its kind
const FOSSIL_BLOCKS = {
    fossil_rock: { pool: 'rock_common', source: 'rock', plain: 'cobblestone', name: 'Fossil Rock', color: 0x8d897f, breakDuration: 1.2 },
    fossil_rock_rare: { pool: 'rock_rare', source: 'rock', plain: 'cobblestone', name: 'Rare Fossil Rock', color: 0x74767f, breakDuration: 1.3 },
    fossil_bones_skull: { pool: 'skeleton', source: 'skeleton', piece: 'skull', plain: 'cobblestone', name: 'Fossil Skull', color: 0x6f6a62, breakDuration: 1.4 },
    fossil_bones_spine: { pool: 'skeleton', source: 'skeleton', piece: 'spine', plain: 'cobblestone', name: 'Fossil Spine', color: 0x6f6a62, breakDuration: 1.4 },
    fossil_bones_tail: { pool: 'skeleton', source: 'skeleton', piece: 'tail', plain: 'cobblestone', name: 'Fossil Tail', color: 0x6f6a62, breakDuration: 1.4 },
    amber_rock: { pool: 'amber', source: 'amber', plain: 'amber', name: 'Amber Rock', color: 0xb9852f, breakDuration: 1.1, glow: 0.3 },
    old_bones: { pool: 'bones', source: 'bones', plain: 'dirt', name: 'Old Bones', color: 0x8a6a48, breakDuration: 0.5, category: 'soil' }
};

// Salts of fossilHash: one for the animal of a block, one for the animal of a chunk's skeleton.
const FOSSIL_SALT_BLOCK = 262;
const FOSSIL_SALT_SKELETON = 263;

// ---------------------------------------------------------------------------------------
// The species: FOSSIL_SPECIES[species] = { source, rarity, weight, water, seconds }

// The pool a species' fossil belongs to: the species that share a kind of block. Legendary rock fossils
// share the rare rock, and amber, old bones and skeletons each have one pool for every rarity: there a
// rarer species says so with a smaller `weight`.
function fossilPoolOf(source, rarity) {
    if (source !== 'rock') return source;
    return rarity === 'common' ? 'rock_common' : 'rock_rare';
}

// The 1 or 3 items that revive a species, in the order of FOSSIL_PIECES; none if it has no fossil.
function fossilItemsOf(species) {
    const fossil = FOSSIL_SPECIES[species];
    if (!fossil) return [];
    return fossil.source === 'skeleton' ? FOSSIL_PIECES.map((piece) => `fossil_${species}_${piece}`) : [`fossil_${species}`];
}

// The blocks a species' fossil is found in: one, or the three of a skeleton in the order of FOSSIL_PIECES.
function fossilBlocksOf(species) {
    const fossil = FOSSIL_SPECIES[species];
    if (!fossil) return [];
    const pool = fossilPoolOf(fossil.source, fossil.rarity);
    return Object.keys(FOSSIL_BLOCKS).filter((block) => FOSSIL_BLOCKS[block].pool === pool);
}

// What is wrong with the fossil a species says, in a line, or null. A misspelt one stops the game.
function fossilProblem(species, fossil) {
    const refuse = (what) => `registerSpecies ${species}: fossil: ${what}`;
    if (!fossil || typeof fossil !== 'object') return refuse('it is { source, rarity, weight, water, seconds }');
    for (const key of Object.keys(fossil)) {
        if (!FOSSIL_FIELDS.includes(key)) return refuse(`unknown field ${key}`);
    }
    if (!FOSSIL_SOURCES.includes(fossil.source)) return refuse(`source is one of ${FOSSIL_SOURCES.join(', ')}, not ${fossil.source}`);
    if (!FOSSIL_RARITIES.includes(fossil.rarity)) return refuse(`rarity is one of ${FOSSIL_RARITIES.join(', ')}, not ${fossil.rarity}`);
    if (fossil.weight !== undefined && !(Number.isFinite(fossil.weight) && fossil.weight > 0)) return refuse(`weight is a number over 0, not ${fossil.weight}`);
    if (fossil.water !== undefined && !(Number.isInteger(fossil.water) && fossil.water >= 0)) return refuse(`water is a whole number of blocks, not ${fossil.water}`);
    if (fossil.seconds !== undefined && !(Number.isFinite(fossil.seconds) && fossil.seconds > 0)) return refuse(`seconds is a number over 0, not ${fossil.seconds}`);
    const pieces = fossil.source === 'skeleton' ? FOSSIL_PIECES.map((piece) => `fossil_${species}_${piece}`) : [`fossil_${species}`];
    const taken = pieces.find((item) => FOSSIL_BLOCKS[item] || ITEM_TYPES[item] || BLOCK_TYPES[item]);
    if (taken) return refuse(`its item ${taken} is something else already`);
    return null;
}

const FOSSIL_SPECIES = {};
// The fossils that were refused: the game does not start with any (see registerGameContent below).
const FOSSIL_REFUSED = [];
let fossilPoolsReady = null;

// A species said its fossil: its defaults are filled in and its items made, at once, so that they are in the
// catalogue wherever the species' <script> is, before or after this one.
function fossilSpeciesAdded(species, fossil) {
    const problem = fossilProblem(species, fossil);
    if (problem) {
        delete FOSSIL_SPECIES[species];
        FOSSIL_REFUSED.push(problem);
        throw new Error(problem);
    }
    if (fossil.weight === undefined) fossil.weight = 1;
    if (fossil.water === undefined) fossil.water = 0;
    if (fossil.seconds === undefined) fossil.seconds = FOSSIL_SECONDS[fossil.rarity];
    if (fossil.source === 'skeleton') {
        for (const piece of FOSSIL_PIECES) registerItemType(`fossil_${species}_${piece}`, fossilItemDefinition(species, fossil, piece));
    } else {
        registerItemType(`fossil_${species}`, fossilItemDefinition(species, fossil, null));
    }
    fossilPoolsReady = null;
}

// The species that may be inside each kind of block: { species, weights, total } by pool. In the order of
// their ids, so that it is the same whatever order the scripts load in. Worked out once.
function fossilPools() {
    if (fossilPoolsReady) return fossilPoolsReady;
    const pools = {};
    for (const species of Object.keys(FOSSIL_SPECIES).sort()) {
        const fossil = FOSSIL_SPECIES[species];
        const key = fossilPoolOf(fossil.source, fossil.rarity);
        const pool = pools[key] || (pools[key] = { species: [], weights: [], total: 0 });
        pool.species.push(species);
        pool.weights.push(fossil.weight);
        pool.total += fossil.weight;
    }
    fossilPoolsReady = pools;
    return pools;
}

// A number in [0, 1) out of a cell of the world, the same for every player. It has nothing of the seed of
// the world in it, which only the server knows.
function fossilHash(x, y, z, salt) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 1013904223) ^ Math.imul(z | 0, 668265263) ^ Math.imul(salt | 0, 1274126177);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// The species inside the fossil block at (x, y, z), or null: none has a fossil of that kind, or the block is
// no fossil. A block picks among the species of its pool by their weights, from its own position; the three
// blocks of a skeleton pick from their chunk instead, so that they are the three pieces of one animal.
function fossilSpeciesAt(blockType, x, y, z) {
    const block = FOSSIL_BLOCKS[blockType];
    if (!block) return null;
    const pool = fossilPools()[block.pool];
    if (!pool) return null;
    const roll = block.piece
        ? fossilHash(Math.floor(x / CHUNK_SIZE), 0, Math.floor(z / CHUNK_SIZE), FOSSIL_SALT_SKELETON)
        : fossilHash(x, y, z, FOSSIL_SALT_BLOCK);
    let left = roll * pool.total;
    for (let i = 0; i < pool.species.length; i++) {
        left -= pool.weights[i];
        if (left < 0) return pool.species[i];
    }
    return pool.species[pool.species.length - 1];
}

// What breaking the fossil block at (x, y, z) gives: the fossil of the animal inside or, while no species
// has one of that kind, what the block is made of. Null if the block is no fossil. It is the `dropAt` of
// every fossil block, so the player and the robot get the same from the same block.
function fossilItemAt(blockType, x, y, z) {
    const block = FOSSIL_BLOCKS[blockType];
    if (!block) return null;
    const species = fossilSpeciesAt(blockType, x, y, z);
    if (!species) return block.plain;
    return block.piece ? `fossil_${species}_${block.piece}` : `fossil_${species}`;
}

// Whether a block is fossil rock: it sounds like stone under the pick (js/game/audio.js).
function fossilBlockIsRock(blockType) {
    const block = FOSSIL_BLOCKS[blockType];
    return Boolean(block) && block.source !== 'bones';
}

// ---------------------------------------------------------------------------------------
// The items

// Pixel-art icons (12x12, drawn by resourcesDrawSprite of js/game/resources.js). `G` is the mark of a rare or
// a legendary fossil, in a corner; a common one has none.
const FOSSIL_SPRITES = {
    rock: [
        '..........GG',
        '..SSSSSSSSGG',
        '.SSbbbbbbSS.',
        '.SbSSSSSSbS.',
        '.SbSbbbbSbS.',
        '.SbSbSSbSbS.',
        '.SbSbSbbSbS.',
        '.SbSbSSSSbS.',
        '.SbSbbbbbSs.',
        '.SbSSSSSSss.',
        '..Ssssssss..',
        '............'
    ],
    amber: [
        '..........GG',
        '....AAAA..GG',
        '...AhhAAA...',
        '..AhAAAAAA..',
        '..AhAAiAAA..',
        '.AAAiAiAiAA.',
        '.AAAAiiiAAA.',
        '.AAAiAiAiAA.',
        '..AAAAiAAa..',
        '..aAAAAAaa..',
        '...aaaaaa...',
        '............'
    ],
    bones: [
        '..........GG',
        '.bb......bGG',
        '.bbb....bbb.',
        '..bbb..bbb..',
        '...bbbbbd...',
        '....bbbd....',
        '....bbbd....',
        '...bbbbbd...',
        '..bbd..bbd..',
        '.bbd....bbd.',
        '.bd......bd.',
        '............'
    ],
    skull: [
        '..........GG',
        '...bbbbbb.GG',
        '..bbbbbbbb..',
        '.bbbbbbbbbb.',
        '.bb..bb..bb.',
        '.bb..bb..bb.',
        '.bbbb..bbbd.',
        '..bbbbbbbd..',
        '..bb.bb.bd..',
        '..bd.bd.bd..',
        '............',
        '............'
    ],
    spine: [
        '..........GG',
        '.....bb...GG',
        '..bbbbbbbb..',
        '.b...bb...b.',
        '..bbbbbbbb..',
        '.b...bb...b.',
        '..bbbbbbbb..',
        '.b...bb...b.',
        '..bbbbbbbb..',
        '.....bd.....',
        '.....bd.....',
        '............'
    ],
    tail: [
        '..........GG',
        '..........GG',
        '............',
        '.bb.........',
        '.bb.bb......',
        '.bb.bb.bb...',
        'bbbbbbbbbbb.',
        '.bd.bd.bd...',
        '.bd.bd......',
        '.bd.........',
        '............',
        '............'
    ]
};
const FOSSIL_PALETTE = { S: 0x8f8b83, s: 0x6c6862, b: 0xe9dfc4, d: 0xb9ab8a, A: 0xf0a020, h: 0xffe9a8, a: 0xb46a12, i: 0x2a1a0c };
const FOSSIL_RARITY_MARKS = { rare: 0x5cb8ff, legendary: 0xffd23f };
const FOSSIL_ITEM_COLORS = { rock: 0x8f8b83, amber: 0xf0a020, bones: 0xd9cfb4, skeleton: 0xd9cfb4 };

// The species as its bestiary card calls it (js/game/bestiary.js), or its id in words.
function fossilSpeciesName(species) {
    const card = SPECIES_FACETS.card && SPECIES_FACETS.card[species];
    if (card && card.name) return card.name;
    return species.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

// "Trilobite fossil", "Amber with ancient bee", "Dodo bones", "Plesiosaur skull".
function fossilItemName(species, source, piece) {
    const name = fossilSpeciesName(species);
    if (source === 'amber') return `Amber with ${name.toLowerCase()}`;
    if (source === 'bones') return `${name} bones`;
    if (source === 'skeleton') return `${name} ${piece}`;
    return `${name} fossil`;
}

// The item of a species' fossil, or of one piece of its skeleton: `revives` is the species, `piece` only a
// skeleton has. The name is read when the catalogue is built, when every species has said its card,
// whichever of the two scripts came first.
function fossilItemDefinition(species, fossil, piece) {
    const mark = FOSSIL_RARITY_MARKS[fossil.rarity];
    return {
        color: FOSSIL_ITEM_COLORS[fossil.source],
        get name() { return fossilItemName(species, fossil.source, piece); },
        revives: species,
        rarity: fossil.rarity,
        ...(piece ? { piece } : {}),
        fossilSource: fossil.source,
        drawIcon: resourcesDrawSprite(FOSSIL_SPRITES[piece || fossil.source], mark === undefined ? FOSSIL_PALETTE : { ...FOSSIL_PALETTE, G: mark }),
        displayMesh: resourcesDisplayMesh
    };
}

// Plain amber, with nothing inside: what amber rock gives while no species is found in amber. A pretty
// stone and no more; the amber of an insect is that species' fossil.
registerItemType('amber', {
    color: FOSSIL_ITEM_COLORS.amber, name: 'Amber', fossilSource: 'amber',
    drawIcon: resourcesDrawSprite(FOSSIL_SPRITES.amber, { ...FOSSIL_PALETTE, i: FOSSIL_PALETTE.A }),
    displayMesh: resourcesDisplayMesh
});

// ---------------------------------------------------------------------------------------
// The blocks

// What is pressed into each rock, 16 x 16: it has to read at a glance in the classic 16 pixel look.
const FOSSIL_IMPRINTS = {
    // A coiled shell: the common fossil.
    fossil_rock: [
        '................',
        '................',
        '......####......',
        '.....###.###....',
        '....##.....##...',
        '...##..###..##..',
        '...#..#...#..#..',
        '...#..#.#.##.#..',
        '...#..#.#..#.##.',
        '...##..##.##.#..',
        '....##....#..#..',
        '.##..#####..##..',
        '..##.......##...',
        '...##.....##....',
        '....#######.....',
        '................'
    ],
    // A footprint of three toes: the rare one.
    fossil_rock_rare: [
        '................',
        '.......##.......',
        '.......##.......',
        '..##...##...##..',
        '..##...##...##..',
        '..###..##..###..',
        '...##..##..##...',
        '...###.##.###...',
        '....########....',
        '....########....',
        '.....######.....',
        '.....######.....',
        '......####......',
        '......####......',
        '................',
        '................'
    ],
    fossil_bones_skull: [
        '................',
        '................',
        '.....######.....',
        '...##########...',
        '..############..',
        '..############..',
        '..##...##...##..',
        '..##...##...##..',
        '..#####..#####..',
        '...####..####...',
        '....########....',
        '....##.##.##....',
        '....##.##.##....',
        '................',
        '................',
        '................'
    ],
    fossil_bones_spine: [
        '................',
        '.......##.......',
        '..####.##.####..',
        '.#.....##.....#.',
        '..####.##.####..',
        '.#.....##.....#.',
        '..####.##.####..',
        '.#.....##.....#.',
        '..####.##.####..',
        '.#.....##.....#.',
        '..####.##.####..',
        '.#.....##.....#.',
        '...###.##.###...',
        '.......##.......',
        '.......##.......',
        '................'
    ],
    fossil_bones_tail: [
        '................',
        '................',
        '................',
        '................',
        '.###............',
        '.###.###........',
        '.###.###.###....',
        '###############.',
        '###############.',
        '.###.###.###....',
        '.###.###........',
        '.###............',
        '................',
        '................',
        '................',
        '................'
    ],
    // A bone lying whole and the end of another: recent bones, still bone.
    old_bones: [
        '................',
        '................',
        '.##........##...',
        '####......####..',
        '.############...',
        '.############...',
        '####......####..',
        '.##........##...',
        '................',
        '................',
        '.........##.....',
        '........####....',
        '.........####...',
        '..........####..',
        '...........###..',
        '................'
    ]
};

// How much of an imprint covers a point of a face, from 0 to 1: its cells, blended between their middles, so
// that the same drawing has soft edges in the high-resolution modes and is exact at 16 pixels.
function fossilImprintAt(rows, u, v) {
    const gx = u * 16 - 0.5;
    const gy = v * 16 - 0.5;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const cell = (x, y) => (x >= 0 && x < 16 && y >= 0 && y < 16 && rows[y][x] === '#' ? 1 : 0);
    return cell(x0, y0) * (1 - fx) * (1 - fy) + cell(x0 + 1, y0) * fx * (1 - fy) + cell(x0, y0 + 1) * (1 - fx) * fy + cell(x0 + 1, y0 + 1) * fx * fy;
}

// Paints an imprint over what the surface already has: pale as old bone, sunk a little into the face, with
// a dark line under it and to its right so that it stands out of rock of any colour.
function fossilPaintImprint(f, s, rows, bone, seed) {
    const shift = 1 / 16;
    f.each(s, (x, y, u, v) => {
        if (fossilImprintAt(rows, u, v) >= 0.5) {
            f.put(s, x, y, f.tone(s, bone, (f.hash(x, y, seed + 7) - 0.5) * 0.12), 0.22);
        } else if (fossilImprintAt(rows, u - shift, v - shift) >= 0.5) {
            const i = (y * s.size + x) * 3;
            s.color[i] *= 0.55;
            s.color[i + 1] *= 0.55;
            s.color[i + 2] *= 0.58;
            s.height[y * s.size + x] = 0.12;
        }
    });
}

const FOSSIL_BONE = 0xe6dcc0;
// The rock each imprint is in: plain stone for the common fossil, darker slate for the rare one and for the
// skeletons, which lie deeper.
const FOSSIL_ROCK_TINTS = { fossil_rock: 0x7d7d7f, fossil_rock_rare: 0x62656e, fossil_bones_skull: 0x6a6660, fossil_bones_spine: 0x6a6660, fossil_bones_tail: 0x6a6660 };

for (const [id, tint] of Object.entries(FOSSIL_ROCK_TINTS)) {
    registerTexturePattern(id, (f, s, _tint, seed) => {
        f.patterns().stone(s, tint, seed);
        fossilPaintImprint(f, s, FOSSIL_IMPRINTS[id], f.rgb(FOSSIL_BONE), seed);
    }, { rtx: { roughness: 0.9, metalness: 0, normalScale: 0.8 } });
}

registerTexturePattern('old_bones', (f, s, _tint, seed) => {
    f.patterns().dirt(s, null, seed);
    fossilPaintImprint(f, s, FOSSIL_IMPRINTS.old_bones, f.rgb(0xf0e8d2), seed);
}, { rtx: { roughness: 0.95, metalness: 0, normalScale: 0.8 } });

// Amber in the rock: big drops the colour of honey, each with a dark rim and a bright spot where the light
// catches it. The block glows a little, so it shows in a dark tunnel.
registerTexturePattern('amber_rock', (f, s, _tint, seed) => {
    f.patterns().stone(s, 0x7d7d7f, seed);
    const amber = f.rgb(0xffa51e);
    const rim = f.rgb(0x7a430a);
    const shine = f.rgb(0xfff2c0);
    f.each(s, (x, y, u, v) => {
        const w = f.worley(u, v, 2, seed + 31);
        const drop = 0.3 + f.hash(w.id, 9, seed) * 0.1;
        if (w.d1 > drop + 0.07) return;
        if (w.d1 > drop) {
            f.put(s, x, y, rim, 0.7);
            return;
        }
        const t = 1 - w.d1 / drop;
        f.put(s, x, y, t > 0.7 ? shine : f.tone(s, amber, -0.16 + t * 0.3), 0.85 + t * 0.15);
    });
}, { rtx: { roughness: 0.35, metalness: 0, normalScale: 0.6 } });

for (const [id, block] of Object.entries(FOSSIL_BLOCKS)) {
    registerBlockType(id, {
        color: block.color, name: block.name, breakDuration: block.breakDuration,
        category: block.category || 'stone',
        ...(block.glow ? { glow: block.glow } : {}),
        faces: { top: id, side: id, bottom: id },
        fossilSource: block.source,
        // Never the block: the fossil inside it, by where it is; `dropType` is for whoever asks with no cell.
        dropType: block.plain,
        dropAt: fossilItemAt
    });
}

registerGameContent(({ addItem }) => {
    // A fossil that was refused stopped the script that said it, and the game does not start with one.
    if (FOSSIL_REFUSED.length) throw new Error(FOSSIL_REFUSED.join('\n'));
    addItem('amber');
    for (const species of Object.keys(FOSSIL_SPECIES)) fossilItemsOf(species).forEach(addItem);
});

// Every species that said its fossil so far, and each one to come (js/extensions.js). Last of all: a
// species refused here stops this script, with everything above already in place.
speciesFacet('fossil', FOSSIL_SPECIES, fossilSpeciesAdded);
