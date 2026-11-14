// Node tests for the fossils: js/terrainGen.js against pkg/terrain/fossils.go, the blocks and what breaking one
// gives (js/game/fossils.js), the fossil a species says when it registers and the items that come of it, and
// the guide. No species of the game has to have a fossil for any of this: the tests register their own, some
// before js/game/fossils.js loads and some after, as a species' <script> may be on either side of it.
// Run with: node --test test/js/fossils.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const { ROOT, STATIC, JS, readScript, anyStub } = require('./support/game.js');
const print = require(path.join(JS, 'guidePrint.js'));
const GUIDE = path.join(STATIC, 'guide');
const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');

const BLOCKS = ['fossil_rock', 'fossil_rock_rare', 'fossil_bones_skull', 'fossil_bones_spine', 'fossil_bones_tail', 'amber_rock', 'old_bones'];
const plain = (value) => JSON.parse(JSON.stringify(value));

// ---- The generator ----

function loadGenerator() {
    const context = vm.createContext({ Math });
    vm.runInContext(readScript('terrainGen.js'), context);
    vm.runInContext(`Object.assign(this, { columnSurface, blockAt, soilDepthAt, groundBlockAt, oreAt, isNaturalFossil, fossilPlanOf, BEDROCK_Y, WATER_LEVEL,
        FOSSIL_ROCK, FOSSIL_ROCK_RARE, AMBER_ROCK, OLD_BONES, SKELETON_BLOCKS, FOSSIL_FLOOR, FOSSIL_COMMON_TOP, FOSSIL_RARE_TOP, SKELETON_TOP, SKELETON_GAP_MIN,
        AMBER_BOTTOM, AMBER_TOP, OLD_BONES_MIN_DEPTH, OLD_BONES_MAX_DEPTH, OLD_BONES_BEACH_CHANCE, OLD_BONES_PLAINS_CHANCE, FOSSIL_COMMON_SLOTS, FOSSIL_COMMON_CHANCE,
        FOSSIL_RARE_CHANCE, SKELETON_CHANCE, AMBER_SLOTS, AMBER_CHANCE })`, context);
    return context;
}

test('terrainGen.js makes the same fossils as terrain.Generate, block for block', () => {
    const generator = loadGenerator();
    const go = read(ROOT, 'pkg', 'terrain', 'fossils_test.go');
    const fingerprint = go.match(/const fossilFingerprint = "([0-9a-f]{40})"/)[1];
    const [x0, z0, x1, z1] = go.match(/var fossilRegion = \[4\]int\{(-?\d+), (-?\d+), (-?\d+), (-?\d+)\}/).slice(1).map(Number);
    const hash = crypto.createHash('sha1');
    const seen = {};
    for (let x = x0; x < x1; x++) {
        for (let z = z0; z < z1; z++) {
            const surface = generator.columnSurface(x, z);
            const soil = generator.soilDepthAt(x, z, surface);
            for (let y = generator.BEDROCK_Y; y <= surface.height; y++) {
                const name = generator.blockAt(x, y, z, surface, soil);
                if (generator.isNaturalFossil(name)) {
                    seen[name] = (seen[name] || 0) + 1;
                    assert.ok(y < surface.height && y >= generator.FOSSIL_FLOOR, `${name} at y = ${y} of a column ${surface.height} high`);
                    assert.equal(generator.oreAt(x, y, z, surface, soil), '', `${name} in the place of an ore`);
                    const ground = generator.groundBlockAt(x, y, z, surface, soil);
                    assert.ok(name === 'old_bones' ? ground === 'dirt' || ground === 'sand' : ground === 'stone', `${name} in the place of ${ground}`);
                }
                hash.update(`${name}\n`);
            }
        }
    }
    for (const block of BLOCKS) assert.ok(seen[block] > 0, `no ${block} in the region`);
    assert.equal(hash.digest('hex'), fingerprint);
});

test('both generators have the same numbers, name by name', () => {
    const generator = loadGenerator();
    const go = read(ROOT, 'pkg', 'terrain', 'fossils.go');
    const constant = (name) => {
        const found = go.match(new RegExp(`^\\s*(?:const )?${name}\\s*= (.+?)(?:\\s*//.*)?$`, 'm'));
        assert.ok(found, `${name} in fossils.go`);
        return found[1].startsWith('"') ? JSON.parse(found[1]) : vm.runInNewContext(found[1]);
    };
    const pairs = {
        fossilRock: 'FOSSIL_ROCK', fossilRockRare: 'FOSSIL_ROCK_RARE', amberRock: 'AMBER_ROCK', oldBones: 'OLD_BONES', fossilFloor: 'FOSSIL_FLOOR',
        fossilCommonTop: 'FOSSIL_COMMON_TOP', fossilCommonSlots: 'FOSSIL_COMMON_SLOTS', fossilCommonChance: 'FOSSIL_COMMON_CHANCE', fossilRareTop: 'FOSSIL_RARE_TOP',
        fossilRareChance: 'FOSSIL_RARE_CHANCE', skeletonTop: 'SKELETON_TOP', skeletonChance: 'SKELETON_CHANCE', skeletonGapMin: 'SKELETON_GAP_MIN',
        amberBottom: 'AMBER_BOTTOM', amberTop: 'AMBER_TOP', amberSlots: 'AMBER_SLOTS', amberChance: 'AMBER_CHANCE', oldBonesMinDepth: 'OLD_BONES_MIN_DEPTH',
        oldBonesMaxDepth: 'OLD_BONES_MAX_DEPTH', oldBonesBeachChance: 'OLD_BONES_BEACH_CHANCE', oldBonesPlainsChance: 'OLD_BONES_PLAINS_CHANCE'
    };
    for (const [inGo, inJs] of Object.entries(pairs)) assert.equal(generator[inJs], constant(inGo), `${inGo} and ${inJs}`);
    assert.deepEqual(plain(generator.SKELETON_BLOCKS), [...go.match(/var skeletonBlocks = \[3\]string\{(.+)\}/)[1].matchAll(/"(\w+)"/g)].map((match) => match[1]));
    assert.deepEqual([generator.FOSSIL_ROCK, generator.FOSSIL_ROCK_RARE, ...generator.SKELETON_BLOCKS, generator.AMBER_ROCK, generator.OLD_BONES], BLOCKS);
    for (const block of BLOCKS) assert.ok(generator.isNaturalFossil(block), block);
    for (const other of ['stone', 'coal_ore', 'dirt', 'amber', 'fossil_trilobite', '']) assert.ok(!generator.isNaturalFossil(other), other);
});

test('the three pieces of a skeleton are planned inside one chunk, wherever the chunk is', () => {
    const generator = loadGenerator();
    let skeletons = 0;
    for (let cx = -60; cx < 60; cx++) {
        for (let cz = -60; cz < 60; cz++) {
            const plan = generator.fossilPlanOf(cx * 3, cz * 5 - 1);
            for (const [lx, y, lz, block] of plan.spots) {
                assert.ok(lx >= 0 && lx < 16 && lz >= 0 && lz < 16, `${block} at ${lx},${lz} leaves its chunk`);
                assert.ok(y >= generator.FOSSIL_FLOOR && y <= generator.AMBER_TOP, `${block} at y = ${y}`);
            }
            if (!plan.skeleton) continue;
            skeletons++;
            const [skull, spine, tail] = plan.spots;
            assert.deepEqual([skull[3], spine[3], tail[3]], plain(generator.SKELETON_BLOCKS));
            assert.ok(skull[1] === spine[1] && tail[1] === spine[1] && spine[1] <= generator.SKELETON_TOP, 'one height, deep');
            const gaps = [Math.abs(skull[0] - spine[0]) + Math.abs(skull[2] - spine[2]), Math.abs(tail[0] - spine[0]) + Math.abs(tail[2] - spine[2])];
            for (const gap of gaps) assert.ok(gap >= generator.SKELETON_GAP_MIN && gap <= generator.SKELETON_GAP_MIN + 1, `a gap of ${gap}`);
            assert.ok((skull[0] === spine[0] && tail[0] === spine[0]) || (skull[2] === spine[2] && tail[2] === spine[2]), 'in a line along x or z');
            assert.ok((skull[0] - spine[0]) * (tail[0] - spine[0]) + (skull[2] - spine[2]) * (tail[2] - spine[2]) < 0, 'the spine in the middle');
        }
    }
    assert.ok(skeletons > 300, `${skeletons} skeletons planned`);
});

// ---- The game ----

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
}
function canvasStub() {
    const ctx = new Proxy({}, {
        get: (target, key) => (key in target ? target[key] : () => ({ data: new Uint8ClampedArray(4 * 4096), addColorStop() {} })),
        set: (target, key, value) => { target[key] = value; return true; }
    });
    return { width: 16, height: 16, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,' };
}

// The species the tests add. `before` are said before js/game/fossils.js loads and `after` once every script
// has: a species' own file may be on either side.
const SPECIES_BEFORE = `
    registerSpecies('test_trilobite', { info: { eggColor: 0x555555 }, card: { name: 'Trilobite' }, fossil: { source: 'rock', rarity: 'common', weight: 3 } });
    registerSpecies('test_eohippus', { info: { eggColor: 0x555555 }, fossil: { source: 'rock', rarity: 'rare' }, card: { name: 'Eohippus' } });
    registerSpecies('test_ancient_bee', { info: { eggColor: 0x555555 }, card: { name: 'Ancient Bee' }, fossil: { source: 'amber', rarity: 'rare', seconds: 30 } });
    registerSpecies('test_plesiosaur', { info: { eggColor: 0x555555 }, card: { name: 'Plesiosaur' }, fossil: { source: 'skeleton', rarity: 'legendary', water: 24 } });
`;
const SPECIES_AFTER = `
    registerSpecies('test_ammonite', { info: { eggColor: 0x555555 }, fossil: { source: 'rock', rarity: 'common' } });
    registerSpecies('test_megalania', { info: { eggColor: 0x555555 }, fossil: { source: 'rock', rarity: 'legendary', weight: 0.25 } });
    registerSpecies('test_dodo', { info: { eggColor: 0x555555 }, card: { name: 'Dodo' }, fossil: { source: 'bones', rarity: 'rare' } });
    registerSpecies('test_mammoth', { info: { eggColor: 0x555555 }, card: { name: 'Mammoth' }, fossil: { source: 'skeleton', rarity: 'rare', weight: 3 } });
`;

// Every script of index.html but the game's own class, as the viewer's palette tool loads them. `before` runs
// right after js/game/mobs.js, `after` at the end, and `only` leaves the real species' fossils out (the test
// then knows every species there is).
function loadGame({ before = '', after = '', only = false } = {}) {
    const THREE = new Proxy({ Vector3, Vector2: Vector3, Vector4: Vector3 }, { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const context = vm.createContext({
        console: { ...console, warn() {} }, performance: { now: () => 0 }, THREE, navigator: {}, requestAnimationFrame: () => 0,
        Worker: class { postMessage() {} terminate() {} },
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; } },
        document: { createElement: (tag) => (tag === 'canvas' ? canvasStub() : anyStub()), addEventListener() {}, body: anyStub(), head: anyStub(), getElementById: () => null, querySelector: () => null },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
    });
    context.window = context;
    vm.runInContext('class Game {}', context);
    const html = read(STATIC, 'index.html');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]).filter((src) => !/^(https?:)?\/\//.test(src) && !print.SKIP_SCRIPTS.test(src));
    assert.ok(scripts.indexOf('js/game/mobs.js') < scripts.indexOf('js/game/fossils.js'), 'the fixtures said before fossils.js are said before it');
    for (const src of scripts) {
        vm.runInContext(read(STATIC, src), context, { filename: src });
        if (src === 'js/game/mobs.js' && before) vm.runInContext(before, context, { filename: 'species said before fossils.js' });
    }
    if (only) {
        vm.runInContext(`for (const species of Object.keys(FOSSIL_SPECIES)) {
                if (species.startsWith('test_')) continue;
                for (const item of fossilItemsOf(species)) delete ITEM_TYPES[item];
                delete FOSSIL_SPECIES[species];
            }
            fossilPoolsReady = null;`, context);
    }
    if (after) vm.runInContext(after, context, { filename: 'species said after fossils.js' });
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, Game, MOB_SPECIES, ITEM_TYPES, BLOCK_TYPES, TEXTURE_PATTERNS, GAME_CONTENT_HOOKS, SPECIES_FACETS,
        FOSSIL_SPECIES, FOSSIL_BLOCKS, FOSSIL_PIECES, FOSSIL_SECONDS, FOSSIL_SOURCES, FOSSIL_RARITIES, FOSSIL_REFUSED, BEAVER_NATURAL_BLOCKS,
        fossilItemsOf, fossilBlocksOf, fossilItemAt, fossilSpeciesAt, fossilPoolOf, fossilHash, fossilBlockIsRock, fossilProblem, itemTagsOf, registerSpecies });`, context);
    return context;
}

// The game as it is, and the game with only the species of the tests in its rock.
const real = loadGame();
const ctx = loadGame({ before: SPECIES_BEFORE, after: SPECIES_AFTER, only: true });
const world = new ctx.WorldRenderer({ add() {}, remove() {} });

test('every block the generator makes is a block of the game, with its own look, and in the viewer palette', () => {
    assert.deepEqual(Object.keys(ctx.FOSSIL_BLOCKS), BLOCKS);
    const palette = JSON.parse(read(ROOT, 'pkg', 'web', 'viewer_block_palette.json'));
    const colours = new Set();
    const factory = world.textureFactory;
    const stone = factory.createSurface(16, false);
    factory.patterns().stone(stone, null, 1);
    for (const block of BLOCKS) {
        const def = world.blockTypes[block];
        assert.ok(def && !def.itemOnly && world.registry.ids[block] > 0, `${block} is a block`);
        assert.equal(world.registry.solid[world.registry.ids[block]], 1, `${block} is solid`);
        assert.ok(def.breakDuration > 0 && !def.unbreakable, `${block} can be mined`);
        assert.ok(/^[A-Z]/.test(def.name), `${block} has an English name`);
        const faces = world.getFaceTextureSpecs(block);
        assert.equal(faces.side.pattern, block);
        assert.ok(ctx.TEXTURE_PATTERNS[block], `${block} has its texture`);
        // The texture is painted, and it is not plain rock: something shows on it.
        const surface = factory.createSurface(16, false);
        factory.patterns()[block](surface, null, 1);
        let different = 0;
        for (let i = 0; i < 256; i++) {
            if (Math.abs(surface.color[i * 3] - stone.color[i * 3]) + Math.abs(surface.color[i * 3 + 2] - stone.color[i * 3 + 2]) > 60) different++;
        }
        assert.ok(different >= 30, `${block}: only ${different} pixels of 256 are not rock`);
        assert.ok(palette[block], `${block}: run node tools/viewerPalette.js`);
        assert.equal(palette[block][1], 0, `${block} is solid from above`);
        colours.add(palette[block][0]);
        assert.ok(ctx.BEAVER_NATURAL_BLOCKS.has(block), `a beaver takes ${block} for something a player built`);
    }
    assert.equal(colours.size, BLOCKS.length, 'two fossil blocks with the same colour from afar');
    assert.ok(world.blockTypes.amber_rock.glow > 0, 'amber shows in a dark tunnel');
});

test('fossil rock is mined like rock, old bones like soil, and both sound like what they are', () => {
    const game = new ctx.Game();
    game.world = world;
    for (const block of BLOCKS.filter((name) => name !== 'old_bones')) {
        assert.ok(game.toolFitsBlock('stone_pickaxe', block), `a pickaxe on ${block}`);
        assert.ok(!game.toolFitsBlock('stone_shovel', block), `a shovel on ${block}`);
        assert.ok(ctx.fossilBlockIsRock(block), block);
        assert.ok(world.getBreakDurationForType(block) > world.getBreakDurationForType('stone'), `${block} is harder than stone`);
    }
    assert.ok(game.toolFitsBlock('stone_shovel', 'old_bones'));
    assert.ok(!ctx.fossilBlockIsRock('old_bones') && !ctx.fossilBlockIsRock('stone') && !ctx.fossilBlockIsRock('fossil_test_dodo'));
    assert.match(readScript('game/audio.js'), /fossilBlockIsRock\(blockType\)/);
    const sounds = [];
    game.playNoiseBurst = (sound) => sounds.push(sound);
    game.playTone = () => {};
    game.playMiningSound('fossil_rock');
    game.playMiningSound('stone');
    game.playMiningSound('old_bones');
    game.playMiningSound('dirt');
    assert.deepEqual(sounds[0], sounds[1]);
    assert.deepEqual(sounds[2], sounds[3]);
    assert.notDeepEqual(sounds[0], sounds[2]);
});

// ---- What a species says ----

test('a species says its fossil and gets its items, whichever side of fossils.js its script is', () => {
    const expected = {
        test_trilobite: { source: 'rock', rarity: 'common', weight: 3, water: 0, seconds: 20 },
        test_eohippus: { source: 'rock', rarity: 'rare', weight: 1, water: 0, seconds: 45 },
        test_ancient_bee: { source: 'amber', rarity: 'rare', weight: 1, water: 0, seconds: 30 },
        test_plesiosaur: { source: 'skeleton', rarity: 'legendary', weight: 1, water: 24, seconds: 120 },
        test_ammonite: { source: 'rock', rarity: 'common', weight: 1, water: 0, seconds: 20 },
        test_megalania: { source: 'rock', rarity: 'legendary', weight: 0.25, water: 0, seconds: 120 },
        test_dodo: { source: 'bones', rarity: 'rare', weight: 1, water: 0, seconds: 45 },
        test_mammoth: { source: 'skeleton', rarity: 'rare', weight: 3, water: 0, seconds: 45 }
    };
    assert.deepEqual(plain(ctx.FOSSIL_SPECIES), expected);
    assert.deepEqual(plain(ctx.FOSSIL_SECONDS), { common: 20, rare: 45, legendary: 120 });
    assert.deepEqual(plain(ctx.FOSSIL_PIECES), ['skull', 'spine', 'tail']);

    const names = {
        fossil_test_trilobite: 'Trilobite fossil', fossil_test_eohippus: 'Eohippus fossil', fossil_test_ancient_bee: 'Amber with ancient bee',
        fossil_test_plesiosaur_skull: 'Plesiosaur skull', fossil_test_plesiosaur_spine: 'Plesiosaur spine', fossil_test_plesiosaur_tail: 'Plesiosaur tail',
        // No card: the id, in words.
        fossil_test_ammonite: 'Test ammonite fossil', fossil_test_megalania: 'Test megalania fossil',
        fossil_test_dodo: 'Dodo bones', fossil_test_mammoth_skull: 'Mammoth skull', fossil_test_mammoth_spine: 'Mammoth spine', fossil_test_mammoth_tail: 'Mammoth tail'
    };
    const made = Object.keys(world.blockTypes).filter((id) => world.blockTypes[id].revives);
    assert.deepEqual(made.sort(), Object.keys(names).sort());
    for (const [species, fossil] of Object.entries(expected)) {
        const items = plain(ctx.fossilItemsOf(species));
        assert.deepEqual(items, fossil.source === 'skeleton' ? ['skull', 'spine', 'tail'].map((piece) => `fossil_${species}_${piece}`) : [`fossil_${species}`]);
        items.forEach((item, i) => {
            const def = world.blockTypes[item];
            assert.ok(def && def.itemOnly && def.solid === false, `${item} is an item of the catalogue`);
            assert.equal(def.name, names[item]);
            assert.equal(ctx.ITEM_TYPES[item].name, names[item]);
            assert.equal(def.revives, species);
            assert.equal(def.rarity, fossil.rarity);
            assert.equal(def.piece, fossil.source === 'skeleton' ? ['skull', 'spine', 'tail'][i] : undefined);
            assert.equal(def.fossilSource, fossil.source);
            assert.equal(typeof def.drawIcon, 'function');
            assert.equal(typeof def.displayMesh, 'function');
            assert.deepEqual(plain(ctx.itemTagsOf(item, world.blockTypes)), ['animal', 'fossil'], item);
            assert.match(item, /^[a-z0-9_]{1,64}$/, 'a chest takes it (storageItemName in pkg/network/storage.go)');
        });
    }
    assert.deepEqual(plain(ctx.fossilItemsOf('sheep')), []);
    assert.deepEqual(plain(ctx.fossilItemsOf('no_such_species')), []);
    // The species themselves are there as any other.
    for (const species of Object.keys(expected)) assert.ok(ctx.MOB_SPECIES[species] && world.blockTypes[`${species}_egg`], species);
});

test('an item draws the icon of its kind, with the mark of its rarity', () => {
    const drawn = (item) => {
        const fills = [];
        const context2d = { fillStyle: '', fillRect(x, y, w, h) { fills.push(`${this.fillStyle} ${x},${y},${w},${h}`); } };
        world.blockTypes[item].drawIcon(context2d, 48);
        return fills;
    };
    const icons = ['amber', 'fossil_test_trilobite', 'fossil_test_ancient_bee', 'fossil_test_dodo', 'fossil_test_plesiosaur_skull', 'fossil_test_plesiosaur_spine', 'fossil_test_plesiosaur_tail'].map((item) => drawn(item).join('|'));
    assert.equal(new Set(icons).size, icons.length, 'two kinds with one icon');
    for (const icon of icons) assert.ok(icon.length > 200, 'something is drawn');
    // Common, rare and legendary rock fossils differ only in the mark.
    const [common, rare, legendary] = ['fossil_test_trilobite', 'fossil_test_eohippus', 'fossil_test_megalania'].map(drawn);
    assert.ok(rare.length > common.length && legendary.length === rare.length);
    assert.deepEqual(rare.filter((fill) => !fill.startsWith('#5cb8ff')), common);
    assert.deepEqual(legendary.filter((fill) => !fill.startsWith('#ffd23f')), common);
});

test('every species of the game with a fossil has its items, and every such item its species', () => {
    for (const [name, game] of [['the game', real], ['the game with the species of the tests', ctx]]) {
        const catalogue = new game.WorldRenderer({ add() {}, remove() {} }).blockTypes;
        for (const [species, fossil] of Object.entries(game.FOSSIL_SPECIES)) {
            assert.ok(game.MOB_SPECIES[species], `${name}: ${species} has a fossil and is no species`);
            assert.ok(game.FOSSIL_SOURCES.includes(fossil.source) && game.FOSSIL_RARITIES.includes(fossil.rarity), `${name}: ${species}`);
            assert.ok(fossil.weight > 0 && Number.isInteger(fossil.water) && fossil.water >= 0 && fossil.seconds > 0, `${name}: ${species} has its defaults`);
            const items = game.fossilItemsOf(species);
            assert.equal(items.length, fossil.source === 'skeleton' ? 3 : 1);
            for (const item of items) {
                assert.ok(game.ITEM_TYPES[item], `${name}: ${item} was never made: ${species} says its fossil where js/game/fossils.js does not hear it`);
                assert.equal(catalogue[item].revives, species);
                assert.ok(!game.BLOCK_TYPES[item] && !game.FOSSIL_BLOCKS[item], `${item} is also a block`);
            }
        }
        for (const [item, def] of Object.entries(catalogue)) {
            if (def.revives) assert.ok(game.fossilItemsOf(def.revives).includes(item), `${name}: ${item} revives ${def.revives}, which has no such fossil`);
        }
        assert.deepEqual(plain(game.FOSSIL_REFUSED), [], name);
        // Plain amber is always there, and is nobody's fossil.
        assert.equal(catalogue.amber.name, 'Amber');
        assert.ok(catalogue.amber.itemOnly && !catalogue.amber.revives);
        assert.deepEqual(plain(game.itemTagsOf('amber', catalogue)), ['fossil']);
        for (const block of BLOCKS) assert.ok(game.itemTagsOf(block, catalogue).includes('fossil') && !game.itemTagsOf(block, catalogue).includes('building'), block);
    }
});

test('the content hook gives every fossil a place in the inventory, and no recipe', () => {
    const slots = [];
    const recipes = [];
    for (const hook of ctx.GAME_CONTENT_HOOKS.filter((candidate) => String(candidate).includes('FOSSIL_REFUSED'))) {
        hook.call({}, { addItem: (type) => slots.push(type), addRecipe: (...recipe) => recipes.push(recipe) });
    }
    assert.deepEqual(slots.sort(), ['amber', ...Object.keys(world.blockTypes).filter((id) => world.blockTypes[id].revives)].sort());
    assert.deepEqual(recipes, []);
});

test('a misspelt fossil is refused aloud, leaves nothing behind, and the game does not start', () => {
    const wrong = [
        [{ source: 'stone', rarity: 'rare' }, /source is one of rock, amber, bones, skeleton, not stone/],
        [{ source: 'rock' }, /rarity is one of common, rare, legendary, not undefined/],
        [{ source: 'rock', rarity: 'epic' }, /rarity is one of/],
        [{ source: 'rock', rarity: 'rare', wieght: 2 }, /unknown field wieght/],
        [{ source: 'rock', rarity: 'rare', weight: 0 }, /weight is a number over 0/],
        [{ source: 'rock', rarity: 'rare', weight: '2' }, /weight is a number over 0/],
        [{ source: 'skeleton', rarity: 'legendary', water: -1 }, /water is a whole number/],
        [{ source: 'skeleton', rarity: 'legendary', water: 2.5 }, /water is a whole number/],
        [{ source: 'rock', rarity: 'rare', seconds: 0 }, /seconds is a number over 0/],
        ['rock', /it is \{ source, rarity/],
        [null, /it is \{ source, rarity/]
    ];
    for (const where of ['before', 'after']) {
        wrong.forEach(([fossil, message], i) => {
            const say = `registerSpecies('test_wrong', { info: { eggColor: 1 }, drops: [['shell', 1, 1]], fossil: ${JSON.stringify(fossil)} });`;
            if (where === 'after') {
                // Its script comes after fossils.js: it is refused as it speaks.
                const game = loadGameOnce();
                assert.throws(() => vm.runInContext(say, game), (error) => /^registerSpecies test_wrong: fossil: /.test(error.message) && message.test(error.message), `${i}`);
                assert.ok(!game.MOB_SPECIES.test_wrong && !game.FOSSIL_SPECIES.test_wrong && !game.ITEM_TYPES.fossil_test_wrong && !game.ITEM_TYPES.fossil_test_wrong_skull, 'nothing of it is left');
                assert.equal(game.FOSSIL_REFUSED.length, i + 1);
                const hook = game.GAME_CONTENT_HOOKS.find((candidate) => String(candidate).includes('FOSSIL_REFUSED'));
                assert.throws(() => hook.call({}, { addItem() {}, addRecipe() {} }), /registerSpecies test_wrong: fossil: /, 'the game does not start');
            } else if (i < 3) {
                // Its script came before: fossils.js refuses it on loading, and still has its blocks and its hook.
                const game = vm.createContext({ window: {}, VoxelModels: { mobBuilders: {}, MOB_SURFACES: {} }, CHUNK_SIZE: 16, resourcesDrawSprite: () => () => {}, resourcesDisplayMesh() {} });
                vm.runInContext(readScript('extensions.js'), game);
                vm.runInContext(readScript('mobSpecies.js'), game);
                vm.runInContext(`${say} registerSpecies('test_fine', { info: { eggColor: 1 }, fossil: { source: 'rock', rarity: 'common' } });`, game);
                assert.throws(() => vm.runInContext(readScript('game/fossils.js'), game, { filename: 'game/fossils.js' }), message);
                vm.runInContext('Object.assign(this, { BLOCK_TYPES, ITEM_TYPES, GAME_CONTENT_HOOKS, FOSSIL_SPECIES, FOSSIL_REFUSED })', game);
                assert.deepEqual(Object.keys(game.BLOCK_TYPES), BLOCKS);
                assert.ok(game.ITEM_TYPES.amber && !game.ITEM_TYPES.fossil_test_wrong && !game.FOSSIL_SPECIES.test_wrong);
                // Its own hook among the others (js/mobSpecies.js has one too, for the ancestors).
                const hooks = game.GAME_CONTENT_HOOKS.filter((candidate) => String(candidate).includes('FOSSIL_REFUSED'));
                assert.equal(hooks.length, 1);
                assert.throws(() => hooks[0].call({}, { addItem() {}, addRecipe() {} }), /registerSpecies test_wrong: fossil: /, 'the game does not start');
            }
        });
    }
    // A species whose item would be one of the blocks, or an item that is there already.
    const game = loadGameOnce();
    assert.throws(() => vm.runInContext("registerSpecies('rock', { info: {}, fossil: { source: 'rock', rarity: 'common' } })", game), /its item fossil_rock is something else already/);
    assert.throws(() => vm.runInContext("registerSpecies('bones', { info: {}, fossil: { source: 'skeleton', rarity: 'rare' } })", game), /its item fossil_bones_skull is something else already/);
});

// One game for the test above, which only ever adds species that are refused.
let onceGame = null;
function loadGameOnce() {
    if (!onceGame) onceGame = loadGame();
    return onceGame;
}

test('speciesFacet tells its owner of every row, those said before and each one after', () => {
    const game = vm.createContext({ window: {}, VoxelModels: { mobBuilders: {}, MOB_SURFACES: {} } });
    vm.runInContext(readScript('extensions.js'), game);
    vm.runInContext(readScript('mobSpecies.js'), game);
    vm.runInContext(`
        const heard = [];
        registerSpecies('early', { info: {}, fossil: { source: 'rock', rarity: 'common' }, drops: [] });
        const table = {};
        speciesFacet('fossil', table, (id, row) => heard.push([id, row === table[id]]));
        speciesFacet('drops', {});
        registerSpecies('late', { info: {}, drops: [], fossil: { source: 'amber', rarity: 'rare' } });
        registerSpecies('none', { info: {}, drops: [] });
        this.heard = heard;
    `, game);
    assert.deepEqual(plain(game.heard), [['early', true], ['late', true]]);
});

// ---- Which animal is inside ----

test('with no species, a fossil block gives what it is made of, and never itself', () => {
    const none = loadGame({ only: true });
    const catalogue = new none.WorldRenderer({ add() {}, remove() {} });
    assert.deepEqual(Object.keys(none.FOSSIL_SPECIES), []);
    const plainDrops = { fossil_rock: 'cobblestone', fossil_rock_rare: 'cobblestone', fossil_bones_skull: 'cobblestone', fossil_bones_spine: 'cobblestone', fossil_bones_tail: 'cobblestone', amber_rock: 'amber', old_bones: 'dirt' };
    for (const block of BLOCKS) {
        for (const [x, y, z] of [[0, 0, 0], [5, -7, 9], [-300, 2, 4411]]) {
            assert.equal(none.fossilSpeciesAt(block, x, y, z), null);
            assert.equal(none.fossilItemAt(block, x, y, z), plainDrops[block]);
            assert.equal(catalogue.getDropTypeForBlock(block, x, y, z), plainDrops[block]);
        }
        assert.equal(catalogue.getDropTypeForBlock(block), plainDrops[block]);
        assert.ok(catalogue.blockTypes[plainDrops[block]], `${plainDrops[block]} exists`);
        assert.equal(catalogue.getDropTypeForBlock(catalogue.getDropTypeForBlock(block)), plainDrops[block] === 'amber' ? 'amber' : plainDrops[block], 'what it gives is not a fossil block');
    }
    assert.equal(none.fossilItemAt('stone', 1, 2, 3), null);
    assert.equal(none.fossilSpeciesAt('fossil_test_dodo', 1, 2, 3), null);
    // The world's own blocks are not asked by where they are.
    assert.equal(catalogue.getDropTypeForBlock('stone', 1, 2, 3), 'cobblestone');
    assert.equal(catalogue.getDropTypeForBlock('coal_ore', 1, 2, 3), 'coal_ore');
});

test('a block gives the fossil of one species of its own kind: always the same, by where it is', () => {
    const pools = {
        fossil_rock: ['test_ammonite', 'test_trilobite'], fossil_rock_rare: ['test_eohippus', 'test_megalania'],
        amber_rock: ['test_ancient_bee'], old_bones: ['test_dodo']
    };
    // The same species said in another order, all of them before fossils.js: nothing changes.
    const other = loadGame({ before: SPECIES_AFTER.trim().split('\n').reverse().join('\n') + SPECIES_BEFORE, only: true });
    for (const [block, species] of Object.entries(pools)) {
        const seen = new Set();
        for (let i = 0; i < 4000; i++) {
            const [x, y, z] = [(i * 37) % 501 - 250, (i % 14) - 11, (i * 91) % 733 - 366];
            const inside = ctx.fossilSpeciesAt(block, x, y, z);
            assert.ok(species.includes(inside), `${inside} in ${block}`);
            assert.equal(ctx.fossilSpeciesAt(block, x, y, z), inside);
            assert.equal(other.fossilSpeciesAt(block, x, y, z), inside, 'whatever order the species were said in');
            assert.equal(ctx.fossilItemAt(block, x, y, z), `fossil_${inside}`);
            assert.equal(world.getDropTypeForBlock(block, x, y, z), `fossil_${inside}`);
            seen.add(inside);
        }
        assert.deepEqual([...seen].sort(), species, `${block} gives every species of its kind`);
        // With no cell to ask about, what it is made of.
        assert.equal(world.getDropTypeForBlock(block), ctx.FOSSIL_BLOCKS[block].plain);
    }
    assert.equal(ctx.fossilPoolOf('rock', 'common'), 'rock_common');
    assert.equal(ctx.fossilPoolOf('rock', 'rare'), ctx.fossilPoolOf('rock', 'legendary'));
    for (const source of ['amber', 'bones', 'skeleton']) assert.equal(new Set(['common', 'rare', 'legendary'].map((rarity) => ctx.fossilPoolOf(source, rarity))).size, 1, source);
    // And the other way round: the blocks to dig for a species.
    for (const [block, species] of Object.entries(pools)) {
        for (const id of species) assert.deepEqual(plain(ctx.fossilBlocksOf(id)), [block]);
    }
    for (const id of ['test_plesiosaur', 'test_mammoth']) assert.deepEqual(plain(ctx.fossilBlocksOf(id)), ['fossil_bones_skull', 'fossil_bones_spine', 'fossil_bones_tail']);
    assert.deepEqual(plain(ctx.fossilBlocksOf('sheep')), []);
});

test('species are found as often as their weights say', () => {
    const count = (block, cells) => {
        const found = {};
        for (const [x, y, z] of cells) {
            const species = ctx.fossilSpeciesAt(block, x, y, z);
            found[species] = (found[species] || 0) + 1;
        }
        return found;
    };
    const volume = [];
    for (let x = -40; x < 40; x++) for (let z = -40; z < 40; z++) for (let y = -11; y <= 2; y += 3) volume.push([x * 7, y, z * 5]);
    const tunnel = [];
    for (let x = 0; x < 20000; x++) tunnel.push([x - 10000, -6, 12]);
    const shaft = [];
    for (let i = 0; i < 20000; i++) shaft.push([i % 16, -11 + (i % 14), Math.floor(i / 16)]);
    for (const [name, cells] of [['spread out', volume], ['along a tunnel', tunnel], ['in a strip of chunks', shaft]]) {
        // 3 to 1 in the common rock, 1 to 0.25 in the rare.
        const common = count('fossil_rock', cells);
        const share = common.test_trilobite / cells.length;
        assert.ok(share > 0.72 && share < 0.78, `${name}: ${JSON.stringify(common)}`);
        const rare = count('fossil_rock_rare', cells);
        const legendary = rare.test_megalania / cells.length;
        assert.ok(legendary > 0.18 && legendary < 0.22, `${name}: ${JSON.stringify(rare)}`);
    }
    // The hash itself: flat, and nothing like its neighbour.
    let sum = 0;
    let near = 0;
    const tenths = new Array(10).fill(0);
    for (let i = 0; i < 50000; i++) {
        const [x, y, z] = [(i % 200) - 100, (i % 13) - 11, Math.floor(i / 200) - 125];
        const value = ctx.fossilHash(x, y, z, 262);
        assert.ok(value >= 0 && value < 1);
        sum += value;
        tenths[Math.floor(value * 10)]++;
        if (Math.abs(value - ctx.fossilHash(x + 1, y, z, 262)) < 0.1) near++;
    }
    assert.ok(Math.abs(sum / 50000 - 0.5) < 0.01, `mean ${sum / 50000}`);
    for (const tenth of tenths) assert.ok(tenth > 4600 && tenth < 5400, `${tenths}`);
    assert.ok(near > 50000 * 0.17 && near < 50000 * 0.21, `${near} of 50000 next to their neighbour`);
});

test('the three blocks of a skeleton give the three pieces of one animal, which is the animal of their chunk', () => {
    const found = {};
    for (let cx = -30; cx < 30; cx++) {
        for (let cz = -30; cz < 30; cz++) {
            const cells = [[cx * 16 + 3, -9, cz * 16 + 5], [cx * 16 + 6, -9, cz * 16 + 5], [cx * 16 + 15, -4, cz * 16]];
            const species = ctx.fossilSpeciesAt('fossil_bones_skull', ...cells[0]);
            assert.ok(['test_mammoth', 'test_plesiosaur'].includes(species), species);
            ['skull', 'spine', 'tail'].forEach((piece, i) => {
                assert.equal(ctx.fossilSpeciesAt(`fossil_bones_${piece}`, ...cells[i]), species, 'one animal in the chunk');
                assert.equal(ctx.fossilItemAt(`fossil_bones_${piece}`, ...cells[i]), `fossil_${species}_${piece}`);
                assert.ok(ctx.fossilItemsOf(species).includes(world.getDropTypeForBlock(`fossil_bones_${piece}`, ...cells[i])));
            });
            // The three of a chunk are all the fossils the species needs.
            assert.deepEqual(['skull', 'spine', 'tail'].map((piece, i) => ctx.fossilItemAt(`fossil_bones_${piece}`, ...cells[i])), plain(ctx.fossilItemsOf(species)));
            found[species] = (found[species] || 0) + 1;
        }
    }
    // 3 to 1, by their weights.
    const share = found.test_mammoth / 3600;
    assert.ok(share > 0.71 && share < 0.79, JSON.stringify(found));
});

// ---- Breaking one ----

function makeWorld(blocks) {
    const stone = world.registry.id('stone');
    world.columns.clear();
    world.edits.clear();
    for (const [cx, cz] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
        const column = new ctx.ChunkColumn(cx, cz);
        for (let lx = 0; lx < 16; lx++) {
            for (let lz = 0; lz < 16; lz++) {
                for (let y = -14; y <= 0; y++) column.set(lx, y, lz, stone);
            }
        }
        world.columns.set(world.chunkKey(cx, cz), column);
    }
    for (const [x, y, z, block] of blocks) world.columns.get(world.chunkKey(Math.floor(x / 16), Math.floor(z / 16))).set(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16, world.registry.id(block));
    return world;
}

test('breaking a fossil block gives its fossil, never the block, to the player and to everybody the news', () => {
    const cells = [[3, -6, 4, 'fossil_rock'], [-5, -9, 7, 'fossil_rock_rare'], [8, -2, -3, 'amber_rock'], [2, -1, 2, 'old_bones'],
        [6, -8, 6, 'fossil_bones_skull'], [8, -8, 6, 'fossil_bones_spine'], [11, -8, 6, 'fossil_bones_tail'], [1, -3, 1, 'stone']];
    makeWorld(cells);
    const pickups = [];
    const sent = [];
    const game = new ctx.Game();
    Object.assign(game, {
        world, camera: { position: new Vector3(0, 30, 0) },
        disposeMiningBlockVisual() {}, showHitIndicator() {}, getExpansionBonusDrop: () => null,
        spawnPickup: (type, position, amount) => pickups.push({ type, amount }),
        spawnFallingBlockDrop: (type) => pickups.push({ type, amount: 1, falling: true }),
        sendBlockBreak: (x, y, z) => sent.push([x, y, z]),
        receiveSystemMessage() {}, farmingAfterBreak() {}
    });
    const given = [];
    for (const [x, y, z, block] of cells) {
        assert.equal(world.getBlockTypeAt(x, y, z), block);
        pickups.length = 0;
        assert.equal(game.finishBreakingBlock({ x, y, z }), true);
        assert.equal(world.getBlockTypeAt(x, y, z), null, `${block} is gone`);
        const drops = pickups.filter((pickup) => pickup.type !== undefined);
        assert.equal(drops.length, 1, `${block}: ${JSON.stringify(drops)}`);
        assert.equal(drops[0].amount, 1);
        if (block === 'stone') {
            assert.equal(drops[0].type, 'cobblestone');
            continue;
        }
        assert.equal(drops[0].type, ctx.fossilItemAt(block, x, y, z));
        assert.ok(world.blockTypes[drops[0].type].revives, `${block} gave ${drops[0].type}`);
        assert.ok(!BLOCKS.includes(drops[0].type));
        given.push(drops[0].type);
    }
    assert.deepEqual(sent, cells.map(([x, y, z]) => [x, y, z]));
    // The three pieces of the chunk's skeleton came out of its three blocks.
    assert.deepEqual(given.slice(4), plain(ctx.fossilItemsOf(world.blockTypes[given[4]].revives)));
    // Over the player's head it falls instead, and it is the same thing.
    makeWorld([[3, -6, 4, 'fossil_rock']]);
    game.camera.position.y = -20;
    pickups.length = 0;
    game.finishBreakingBlock({ x: 3, y: -6, z: 4 });
    assert.deepEqual(pickups, [{ type: given[0], amount: 1, falling: true }]);
});

test('the robot digs a fossil out as the player does: both say where the block was', () => {
    assert.match(readScript('game/building.js'), /const dropType = this\.world\.getDropTypeForBlock\(blockType, position\.x, position\.y, position\.z\);/);
    assert.match(readScript('game/robot.js'), /const drop = this\.world\.getDropTypeForBlock\(type, cell\.x, cell\.y, cell\.z\);/);
    // Nobody else turns a block into its drop without saying where it was, but for the crops, which have no fossils.
    for (const file of fs.readdirSync(path.join(JS, 'game'))) {
        for (const call of readScript(`game/${file}`).matchAll(/getDropTypeForBlock\(([^)]*)\)/g)) {
            assert.ok(call[1].split(',').length === 4 || (file === 'farming.js' && call[1] === 'crop'), `${file}: getDropTypeForBlock(${call[1]})`);
        }
    }
});

// ---- The guide ----

const page = (id, lang) => {
    const name = fs.readdirSync(GUIDE).find((file) => file.startsWith(`${id}_${lang}_`));
    assert.ok(name, `page ${id} ${lang}`);
    return read(GUIDE, name);
};
// A height as the guide writes it: with a real minus sign.
const height = (y) => `y = ${y < 0 ? `−${-y}` : y}`;
// The row of a table that starts with this cell.
const row = (text, first) => {
    const found = text.split('\n').find((line) => line.startsWith(`| ${first} |`));
    assert.ok(found, `no row "${first}"`);
    return found;
};

test('the guide: 262 and 263 in both languages, in the indexes, the catalogue and GUIA.md', () => {
    const titles = { 262: { ES: 'Fósiles', EN: 'Fossils' }, 263: { ES: 'Ámbar', EN: 'Amber' } };
    for (const id of [262, 263]) {
        for (const lang of ['ES', 'EN']) {
            assert.match(page(id, lang), new RegExp(`^# ${titles[id][lang]}\n`), `${id} ${lang}`);
            assert.ok(fs.readdirSync(GUIDE).includes(`${id}_${lang}_${titles[id][lang]}.md`.normalize('NFC')));
            for (const from of [0, 48]) assert.match(page(from, lang), new RegExp(`\\(${id}\\)`), `${from} ${lang} links to ${id}`);
            // A page of the world generator says what a saved world keeps, as the page on metals does.
            assert.match(page(id, lang), lang === 'ES' ? /que nadie ha visitado aún/ : /nobody has visited yet/, `${id} ${lang}`);
        }
        assert.match(read(GUIDE, 'README.md'), new RegExp(`^\\| ${id} \\| ${titles[id].ES} \\| ${titles[id].EN} \\|`, 'm'));
    }
    for (const lang of ['ES', 'EN']) {
        assert.match(page(262, lang), /\(263\)/);
        assert.match(page(263, lang), /\(262\)/);
    }
    const guia = read(ROOT, 'GUIA.md');
    assert.match(guia, /^## Fósiles y ámbar$/m);
    for (const said of ['262', '263', ...BLOCKS, '`amber`', 'fossilItemAt', 'fossilItemsOf', '`revives`', '`#fósil`']) assert.ok(guia.includes(said), `GUIA.md: ${said}`);
});

test('the guide puts every fossil where the generator does, and says how many there are', () => {
    const g = loadGenerator();
    const pinned = read(ROOT, 'pkg', 'terrain', 'fossils_test.go');
    // What the Go test pins, per chunk. The guide says the rare fossil and the amber as so many chunks out of
    // five, and the skeleton and the old bones as one in so many.
    const pinnedAt = (what) => {
        const found = pinned.match(new RegExp(`${what}", [^,]+, ([0-9./]+)\\)`));
        assert.ok(found, what);
        return vm.runInNewContext(found[1]);
    };
    const rare = Math.round(pinnedAt('rare fossil blocks per chunk') * 5);
    const skeleton = Math.round(1 / pinnedAt('skeletons per chunk'));
    const amber = Math.round(pinnedAt('forest chunks with amber') * 5);
    const beach = Math.round(1 / g.OLD_BONES_BEACH_CHANCE);
    const plains = Math.round(1 / g.OLD_BONES_PLAINS_CHANCE);
    assert.deepEqual([rare, skeleton, amber, beach, plains], [4, 14, 2, 110, 1500]);
    assert.equal(g.FOSSIL_RARE_CHANCE * 5, rare, 'a rare fossil in so many chunks out of five');
    const commonBlocks = pinnedAt('common fossil blocks per chunk');
    assert.equal(commonBlocks, 4.7);
    // Three chances of a pocket, each likely: two or three of them come out in nearly every chunk.
    const pocket = g.FOSSIL_COMMON_CHANCE;
    assert.equal(g.FOSSIL_COMMON_SLOTS, 3);
    assert.equal(pocket, 0.9);
    assert.ok(pocket ** 3 + 3 * pocket ** 2 * (1 - pocket) > 0.95, 'two or three pockets in nearly every chunk');

    const words = {
        ES: { common: 'Fósil común', rare: 'Fósil raro', skeleton: 'Esqueleto', bones: 'Huesos recientes', span: (a, b) => `de ${height(a)} a ${height(b)}`,
            oneChunkIn: (n) => `1 de cada ${n} chunks`, outOfFive: (n) => `${n} de cada 5 chunks`, pocket: 'dos o tres bolsas en casi todos los chunks, de 1 a 3 bloques cada una', depth: 'de 1 a 3 bloques bajo el suelo',
            columns: `1 columna de cada ${beach}; en la llanura, 1 de cada ${plains}`, line: /en línea recta y a la misma altura/, gaps: /a 2 o 3 bloques de la columna, y la cola a otros 2 o 3/,
            reach: /hasta 6 bloques/, plain: /la roca da solo `cobblestone` y los huesos recientes dan `dirt`/, amberSpan: `de ${height(g.AMBER_BOTTOM)} a ${height(g.AMBER_TOP)}`,
            above: new RegExp(`se acaban en ${height(g.FOSSIL_COMMON_TOP)}\\.`), forest: /solo bajo el \*\*bosque\*\*/, amberChunks: `${amber} de cada 5 chunks de bosque`,
            amberPlain: /da un trozo de `amber` liso/, cover: /al menos \*\*un bloque de piedra encima\*\*/, guiaAmber: `${amber} de cada 5 chunks de bosque` },
        EN: { common: 'Common fossil', rare: 'Rare fossil', skeleton: 'Skeleton', bones: 'Recent bones', span: (a, b) => `from ${height(a)} to ${height(b)}`,
            oneChunkIn: (n) => `1 chunk out of ${n}`, outOfFive: (n) => `${n} chunks out of 5`, pocket: 'two or three pockets in nearly every chunk, of 1 to 3 blocks each', depth: '1 to 3 blocks under the ground',
            columns: `1 column in ${beach}; on a plain, 1 in ${plains}`, line: /in a straight line and at the same height/, gaps: /2 or 3 blocks from the spine, and the tail another 2 or 3/,
            reach: /up to 6 blocks/, plain: /the rock gives only `cobblestone` and recent bones give `dirt`/, amberSpan: `from ${height(g.AMBER_BOTTOM)} to ${height(g.AMBER_TOP)}`,
            above: new RegExp(`end at ${height(g.FOSSIL_COMMON_TOP)}\\.`), forest: /only under the \*\*forest\*\*/, amberChunks: `${amber} forest chunks out of 5`,
            amberPlain: /gives a plain piece of `amber`/, cover: /at least \*\*one block of stone over it\*\*/ }
    };
    assert.equal(g.OLD_BONES_MIN_DEPTH, 1);
    assert.equal(g.OLD_BONES_MAX_DEPTH, 3);
    assert.equal(2 * (g.SKELETON_GAP_MIN + 1), 6, 'from one end of a skeleton to the other, at the most');
    for (const lang of ['ES', 'EN']) {
        const w = words[lang];
        const fossils = page(262, lang);
        for (const block of BLOCKS.filter((name) => name !== 'amber_rock')) assert.ok(fossils.includes(`| ![](item:${block}) | \`${block}\` |`), `${lang} ${block}`);
        assert.ok(row(fossils, w.common).includes(w.span(g.FOSSIL_FLOOR, g.FOSSIL_COMMON_TOP)) && row(fossils, w.common).includes(w.pocket), `${lang}: ${row(fossils, w.common)}`);
        assert.ok(row(fossils, w.rare).includes(w.span(g.FOSSIL_FLOOR, g.FOSSIL_RARE_TOP)) && row(fossils, w.rare).includes(w.outOfFive(rare)), `${lang}: ${row(fossils, w.rare)}`);
        assert.ok(row(fossils, w.skeleton).includes(w.span(g.FOSSIL_FLOOR, g.SKELETON_TOP)) && row(fossils, w.skeleton).includes(w.oneChunkIn(skeleton)), `${lang}: ${row(fossils, w.skeleton)}`);
        assert.ok(row(fossils, w.bones).includes(w.depth) && row(fossils, w.bones).includes(w.columns), `${lang}: ${row(fossils, w.bones)}`);
        assert.ok(fossils.includes(height(g.BEDROCK_Y)) && fossils.includes(height(g.WATER_LEVEL)), `${lang}: the floor and the water`);
        for (const said of [w.line, w.gaps, w.reach, w.plain]) assert.match(fossils, said, lang);
        assert.ok(!fossils.includes('amber_rock'), `${lang}: amber has its own page`);

        const amberPage = page(263, lang);
        for (const item of ['amber_rock', 'amber']) assert.ok(amberPage.includes(`| ![](item:${item}) | \`${item}\` |`), `${lang} ${item}`);
        assert.ok(amberPage.includes(w.amberSpan) && amberPage.includes(w.amberChunks), lang);
        for (const said of [w.above, w.forest, w.amberPlain, w.cover]) assert.match(amberPage, said, lang);
    }
    // GUIA.md has the same numbers.
    const guia = read(ROOT, 'GUIA.md');
    const section = guia.slice(guia.indexOf('## Fósiles y ámbar'), guia.indexOf('## Bloque luminoso'));
    assert.ok(row(section, '`fossil_rock`').includes(words.ES.span(g.FOSSIL_FLOOR, g.FOSSIL_COMMON_TOP)));
    const comma = (number) => String(number).replace('.', ',');
    for (const said of ['dos o tres bolsas en casi todos los chunks', `(tres intentos al ${pocket * 100} %)`, `unos ${comma(commonBlocks)} bloques por chunk`]) {
        assert.ok(row(section, '`fossil_rock`').includes(said), `GUIA.md: ${said}`);
    }
    assert.ok(row(section, '`fossil_rock_rare`').includes(words.ES.span(g.FOSSIL_FLOOR, g.FOSSIL_RARE_TOP)) && row(section, '`fossil_rock_rare`').includes(words.ES.outOfFive(rare)));
    assert.ok(row(section, '`fossil_bones_skull`, `fossil_bones_spine`, `fossil_bones_tail`').includes(words.ES.span(g.FOSSIL_FLOOR, g.SKELETON_TOP)));
    assert.ok(row(section, '`fossil_bones_skull`, `fossil_bones_spine`, `fossil_bones_tail`').includes(words.ES.oneChunkIn(skeleton)));
    assert.ok(row(section, '`amber_rock`').includes(words.ES.amberSpan) && row(section, '`amber_rock`').includes(words.ES.guiaAmber));
    assert.ok(row(section, '`old_bones`').includes(`1 columna de cada ${beach} en la playa, 1 de cada ${plains} en la llanura`));
    assert.ok(section.includes(height(g.FOSSIL_FLOOR)));
    for (const [rarity, seconds] of Object.entries(plain(ctx.FOSSIL_SECONDS))) assert.ok(row(section, '`seconds`').includes(String(seconds)), `${rarity}: ${seconds} s`);
    assert.ok(row(section, '`source`').includes(plain(ctx.FOSSIL_SOURCES).map((source) => `\`${source}\``).slice(0, 2).join(', ')));
    for (const word of [...plain(ctx.FOSSIL_SOURCES), ...plain(ctx.FOSSIL_RARITIES)]) assert.ok(section.includes(`\`${word}\``), word);
});

test('extensions.js and CLAUDE.md say how a species gets a fossil', () => {
    const extensions = readScript('extensions.js');
    for (const field of ['source', 'rarity', 'weight', 'water', 'seconds']) assert.match(extensions, new RegExp(`^//   ${field} `, 'm'), `${field} is not documented`);
    assert.match(extensions, /^\/\/   dropAt\(type, x, y, z\)/m);
    assert.match(read(ROOT, 'CLAUDE.md'), /fossil: \{ source, rarity/);
});
