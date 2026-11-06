// Node tests for the microscope (js/game/microscope.js, js/game/microbes.js) and the moss of
// js/terrainGen.js: the tables against the server, what a slide holds, the logic of the panel, the
// tardigrade's states, and that everything draws. Nothing here runs a browser: how it looks and feels
// is tested in the game.
// Run with: node --test test/js/microscope.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const JS = path.join(STATIC, 'js');
const plain = (value) => JSON.parse(JSON.stringify(value));

function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}

// A 2D context that remembers what was asked of it.
function recordingContext() {
    const calls = [];
    const target = {
        calls, globalAlpha: 1,
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} })
    };
    return new Proxy(target, {
        get: (known, key) => (key in known ? known[key] : (...args) => { calls.push([key, ...args]); }),
        set: (known, key, value) => { known[key] = value; return true; }
    });
}

function balanced(ctx) {
    const count = (name) => ctx.calls.filter(([key]) => key === name).length;
    assert.equal(count('save'), count('restore'));
}

// The two modules on their own, as a page of the guide could use them. microscope.js needs the
// extension points and the furniture helpers, so those load first.
function loadModules() {
    const context = vm.createContext({
        console, Math, performance: { now: () => 0 }, window: { localStorage: { getItem: () => null, setItem() {} } },
        THREE: anyStub(), document: anyStub(), navigator: {}
    });
    context.window.addEventListener = () => {};
    vm.runInContext('class Game {}; function resourcesDrawSprite() { return () => {}; } function resourcesDisplayMesh() { return null; }', context);
    vm.runInContext(fs.readFileSync(path.join(JS, 'extensions.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(JS, 'chunkStore.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(JS, 'blockShapes.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(JS, 'mobSpecies.js'), 'utf8'), context);
    for (const file of ['bestiary.js', 'furniture.js', 'storage.js', 'appliances.js', 'microbes.js', 'microscope.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    }
    vm.runInContext(`Object.assign(this, { MICRO_SPECIES, MICRO_SAMPLES, MICRO_ITEMS, MICRO_MAGNIFICATIONS, MICRO_DRY_SECONDS, MICRO_REVIVE_SECONDS, MICRO_TUN_SECONDS, MICRO_SLIDE_RADIUS,
        ITEM_TYPES, BLOCK_TYPES, BLOCK_SHAPES, GAME_CONTENT_HOOKS, MODAL_PANELS, ITEM_USE_HANDLERS, STORAGE_KINDS, APPLIANCE_FREEZE, MICROSCOPE_KIT,
        microSpeciesOf, microSampleId, microSourceInTube, microPopulate, microScenery, microSlideStage, microUnfold, microFate, microBlur, microCanIdentify,
        microStep, tardigradeLegs, microDrawOrganism, microDrawPortrait, microDrawTardigrade, microDrawTardigradeMolt, microDrawSceneryItem,
        microscopeSettle, microscopeRequestItems, microscopeLightFrom, microscopeOpenToSky, microscopeClampStage, microscopeStepPower, microscopeScale, microscopeScaleBar,
        microscopePick, microscopeSlideLine, microscopeTardigradeLine, microscopeDrawField, microscopeDarkLine, microscopeIsUnlitLamp, Game, MOB_SPECIES, BESTIARY_ENTRIES, BESTIARY_STORAGE_KEY, MICROSCOPE_GUIDE_PAGE });`, context);
    return context;
}

const ctx = loadModules();
const goMicroscope = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'microscope.go'), 'utf8');
const goAppliances = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'appliances.go'), 'utf8');
const goStorage = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'storage.go'), 'utf8');

function goTable(name) {
    const start = goMicroscope.indexOf(`var ${name} =`);
    assert.ok(start >= 0, name);
    return goMicroscope.slice(start, goMicroscope.indexOf('\n}\n', start));
}

const list = (text) => [...text.matchAll(/"(\w+)"/g)].map((match) => match[1]);

// ---- Mirrors of the server ----

test('the samples match the server', () => {
    const table = goTable('sampleVariants');
    const read = {};
    for (const [, habitat, body] of table.matchAll(/"(\w+)": \{\n([\s\S]*?)\n\t\},/g)) {
        read[habitat] = [...body.matchAll(/\{"(\w)", ([\d.]+), \[\]string\{([^}]*)\}\}/g)].map(([, letter, weight, species]) => ({ letter, weight: Number(weight), species: list(species) }));
    }
    assert.deepEqual(read, plain(ctx.MICRO_SAMPLES));
});

test('what other things show matches the server', () => {
    const table = goTable('microscopeItems');
    const read = {};
    const constants = { sampleStill: 'sample_still_water', tardigradeTube: 'tardigrade_tube', tardigradeTun: 'tardigrade_tun' };
    for (const [, quoted, named, species] of table.matchAll(/(?:"(\w+)"|(\w+)):\s*\{([^}]*)\},/g)) {
        read[quoted || constants[named]] = list(species);
    }
    assert.deepEqual(read, plain(ctx.MICRO_ITEMS));
    assert.deepEqual(list(goMicroscope.match(/var microscopeWool = \[\]string\{([^}]*)\}/)[1]), plain(ctx.microSpeciesOf('red_wool')));
    assert.ok(ctx.microSpeciesOf('white_wool'));
    assert.equal(ctx.microSpeciesOf('wool_of_nothing'), null);
    assert.equal(ctx.microSpeciesOf('stone'), null);
    assert.equal(ctx.microSpeciesOf('sample_forest_lake_z'), null);
});

test('the times of a slide match the server', () => {
    assert.equal(Number(goMicroscope.match(/microscopeDrySeconds = ([\d.]+)/)[1]), ctx.MICRO_DRY_SECONDS);
    assert.equal(ctx.MICRO_DRY_SECONDS, 240);
    assert.equal(ctx.MICRO_REVIVE_SECONDS, 20);
});

test('the microscope is a chest of one slot, and the freezer makes a tun, on both sides', () => {
    assert.equal(ctx.STORAGE_KINDS.microscope, 1);
    assert.match(goStorage, /"microscope":\s+1,/);
    assert.equal(ctx.BLOCK_TYPES.microscope.storageSlots, 1);
    assert.equal(ctx.APPLIANCE_FREEZE.tardigrade_tube, 'tardigrade_tun');
    assert.match(goAppliances, /"tardigrade_tube":\s*"tardigrade_tun"/);
});

// ---- The plan's tables ----

test('the share of places with tardigrades is the plan\'s', () => {
    const want = { forest_lake: 0.35, mountain_lake: 0.5, plains_lake: 0, oasis: 0, moss: 0.6 };
    for (const [habitat, share] of Object.entries(want)) {
        const variants = ctx.MICRO_SAMPLES[habitat];
        assert.deepEqual(plain(variants.map((variant) => variant.letter)), ['a', 'b', 'c', 'd']);
        const total = variants.reduce((sum, variant) => sum + variant.weight, 0);
        const withThem = variants.filter((variant) => variant.species.includes('tardigrade')).reduce((sum, variant) => sum + variant.weight, 0);
        assert.ok(Math.abs(total - 1) < 1e-9, `${habitat} adds to ${total}`);
        assert.ok(Math.abs(withThem - share) < 1e-9, `${habitat} has ${withThem}`);
    }
});

test('the catalogue has the 16 organisms of the plan, with what a card needs', () => {
    const ids = Object.keys(ctx.MICRO_SPECIES).sort();
    assert.deepEqual(ids, ['amoeba', 'animal_cell', 'cyanobacteria', 'diatom', 'euglena', 'lactobacillus', 'mushroom_spore', 'paramecium', 'plant_cell', 'rotifer', 'soil_bacteria', 'spirogyra', 'tardigrade', 'vorticella', 'water_flea', 'yeast']);
    for (const [id, def] of Object.entries(ctx.MICRO_SPECIES)) {
        for (const field of ['name', 'latin', 'size', 'where', 'fact', 'hint']) assert.ok(typeof def[field] === 'string' && def[field].length > 2, `${id}.${field}`);
        assert.ok(ctx.MICRO_MAGNIFICATIONS.includes(def.mag), `${id}.mag`);
        assert.ok(def.drawn > 0, `${id}.drawn`);
        assert.equal(typeof def.draw, 'function', `${id}.draw`);
        assert.ok(['tun', 'cyst', 'dies'].includes(def.whenDry), `${id}.whenDry`);
    }
    const mags = { tardigrade: 40, water_flea: 40, rotifer: 100, paramecium: 100, amoeba: 100, vorticella: 100, euglena: 100, spirogyra: 100, plant_cell: 100, diatom: 400, cyanobacteria: 400, soil_bacteria: 400, yeast: 400, lactobacillus: 400, animal_cell: 400, mushroom_spore: 400 };
    for (const [id, mag] of Object.entries(mags)) assert.equal(ctx.MICRO_SPECIES[id].mag, mag, id);
});

test('every organism can be found on some slide, and where the plan says', () => {
    const where = {
        tardigrade: ['forest_lake', 'mountain_lake', 'moss'], rotifer: ['forest_lake', 'moss'], water_flea: ['plains_lake', 'forest_lake'],
        paramecium: ['plains_lake', 'forest_lake'], amoeba: ['plains_lake', 'mountain_lake'], vorticella: ['forest_lake'], euglena: ['plains_lake', 'oasis'],
        diatom: ['mountain_lake', 'forest_lake'], spirogyra: ['forest_lake', 'plains_lake'], cyanobacteria: ['plains_lake', 'oasis']
    };
    for (const [id, habitats] of Object.entries(where)) {
        for (const [habitat, variants] of Object.entries(ctx.MICRO_SAMPLES)) {
            const here = variants.some((variant) => variant.species.includes(id));
            // Moss also holds plant cells; those are not in this list.
            assert.equal(here, habitats.includes(habitat), `${id} in ${habitat}`);
        }
    }
    const items = { soil_bacteria: 'dirt', yeast: 'flower_red', lactobacillus: 'milk', plant_cell: 'wheat', animal_cell: 'cheek', mushroom_spore: 'mushroom_red' };
    for (const [id, source] of Object.entries(items)) assert.ok(ctx.microSpeciesOf(source).includes(id), source);
    for (const source of ['cheese', 'leaves', 'raw_fish', 'flower_yellow', 'mushroom_brown', 'white_wool', 'honeycomb']) assert.ok(ctx.microSpeciesOf(source), source);
    assert.deepEqual(plain(ctx.microSpeciesOf('sample_still_water')), ['soil_bacteria']);
});

// ---- Items, blocks, recipes ----

test('21 sample types, all named without giving away what is inside', () => {
    const samples = Object.keys(ctx.ITEM_TYPES).filter((id) => id.startsWith('sample_'));
    assert.equal(samples.length, 21);
    assert.ok(samples.includes('sample_still_water'));
    assert.equal(ctx.ITEM_TYPES.sample_forest_lake_a.name, 'Forest Lake Sample A');
    assert.equal(ctx.ITEM_TYPES.sample_moss_d.name, 'Moss Sample D');
    for (const id of samples) {
        assert.equal(ctx.microSourceInTube(id), true);
        assert.ok(!/tardigrade/i.test(ctx.ITEM_TYPES[id].name), id);
    }
    // All the variants of a habitat share a look.
    for (const [habitat, variants] of Object.entries(ctx.MICRO_SAMPLES)) {
        const colors = new Set(variants.map(({ letter }) => ctx.ITEM_TYPES[ctx.microSampleId(habitat, letter)].color));
        assert.equal(colors.size, 1, habitat);
    }
});

test('recipes are the plan\'s, and everything is in the inventory', () => {
    const recipes = {};
    const items = new Set();
    for (const hook of ctx.GAME_CONTENT_HOOKS) {
        hook.call(new Proxy({}, { get: () => () => {}, set: () => true }), {
            addItem: (type) => items.add(type),
            addRecipe: (id, name, output, amount, inputs) => { recipes[id] = { output, amount, inputs: Object.fromEntries(plain(inputs).map(({ type, amount: count }) => [type, count])) }; }
        });
    }
    assert.deepEqual(plain(recipes.microscope), { output: 'microscope', amount: 1, inputs: { glass: 2, copper_block: 1, iron_ore: 1, planks: 1 } });
    assert.deepEqual(plain(recipes.test_tube), { output: 'test_tube', amount: 3, inputs: { glass: 1 } });
    assert.deepEqual(plain(recipes.glass_slide), { output: 'glass_slide', amount: 4, inputs: { glass: 1 } });
    assert.deepEqual(plain(recipes.micropipette), { output: 'micropipette', amount: 1, inputs: { glass: 1, leather: 1 } });
    assert.deepEqual(plain(recipes.tardigrade_revive), { output: 'tardigrade_tube', amount: 1, inputs: { tardigrade_tun: 1, water_flask: 1 } });
    for (const id of Object.keys(ctx.ITEM_TYPES).filter((type) => type.startsWith('sample_'))) assert.ok(items.has(id), id);
    for (const id of ['moss', 'test_tube', 'glass_slide', 'micropipette', 'tardigrade_tube', 'tardigrade_tun']) assert.ok(items.has(id), id);
});

test('the kit holds only real things', () => {
    for (const [type, amount] of ctx.MICROSCOPE_KIT) {
        assert.ok(amount > 0);
        if (ctx.ITEM_TYPES[type] || ctx.BLOCK_TYPES[type]) continue;
        assert.ok(['water_flask', 'dirt', 'milk', 'leaves', 'flower_red', 'mushroom_red', 'raw_fish', 'white_wool', 'honeycomb', 'lantern', 'candle'].includes(type), type);
    }
    const sampled = ctx.MICROSCOPE_KIT.map(([type]) => type).filter((type) => type.startsWith('sample_') && ctx.microSpeciesOf(type).includes('tardigrade'));
    assert.ok(sampled.length >= 2, 'the kit has samples with tardigrades');
});

test('moss and the microscope are blocks of the game, and their scripts load after what they need', () => {
    assert.deepEqual(plain(ctx.BLOCK_TYPES.moss.faces), { top: 'moss_top', side: 'moss_side', bottom: 'dirt' });
    assert.equal(ctx.BLOCK_TYPES.microscope.shape, 'microscope');
    assert.ok(ctx.BLOCK_SHAPES.microscope);
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    const at = (name) => html.indexOf(`js/game/${name}.js`);
    assert.ok(at('microbes') > 0 && at('microscope') > at('microbes') && at('microbes') > at('storage') && at('microbes') > at('furniture'));
    assert.ok(!html.includes('terrainGen.js'), 'the game does not load the generator');
});

test('the microscope\'s panel is modal, and the click reaches it before a chest\'s', () => {
    assert.ok(ctx.MODAL_PANELS.some((panel) => panel.isOpen.call({ microscopeAt: { x: 0, y: 0, z: 0 } })));
    let opened = null;
    const game = {
        cameraController: { isCrouching: false },
        world: { getBlockPositionFromIntersection: () => ({ x: 1, y: 2, z: 3 }) },
        microscopeTryOpen(position) { opened = position; return true; }
    };
    assert.equal(ctx.ITEM_USE_HANDLERS[0].call(game, 'test_tube', {}), true);
    assert.deepEqual(plain(opened), { x: 1, y: 2, z: 3 });
    opened = null;
    game.cameraController.isCrouching = true;
    assert.equal(ctx.ITEM_USE_HANDLERS[0].call(game, null, {}), false);
    assert.equal(opened, null);
});

// ---- A slide: the same for everyone ----

test('a slide comes out the same for everyone, and only holds its source\'s species', () => {
    const a = plain(ctx.microPopulate('sample_forest_lake_b', 12345, 2));
    const b = plain(ctx.microPopulate('sample_forest_lake_b', 12345, 2));
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, plain(ctx.microPopulate('sample_forest_lake_b', 54321, 2)));
    const allowed = ctx.microSpeciesOf('sample_forest_lake_b');
    for (const org of a) {
        assert.ok(allowed.includes(org.species), org.species);
        assert.ok(org.depth >= 0 && org.depth <= 1);
    }
    assert.deepEqual(plain(ctx.microScenery('dirt', 9)), plain(ctx.microScenery('dirt', 9)));
    assert.equal(ctx.microScenery('red_wool', 9)[0].kind, 'fibre');
    // The species do not depend on the seed: only how many, and where.
    for (let seed = 0; seed < 50; seed++) {
        const present = new Set(ctx.microPopulate('sample_plains_lake_a', seed, 0).map((org) => org.species));
        assert.deepEqual([...present].sort(), ['cyanobacteria', 'euglena', 'paramecium']);
    }
});

test('the server\'s count of tardigrades decides how many are on the slide', () => {
    for (const count of [0, 1, 3]) {
        const organisms = ctx.microPopulate('sample_moss_a', 3, count);
        assert.equal(organisms.filter((org) => org.species === 'tardigrade').length, count);
    }
    assert.equal(ctx.microPopulate('dirt', 3, 0).filter((org) => org.species === 'tardigrade').length, 0);
    const tube = ctx.microPopulate('tardigrade_tube', 3, 1);
    assert.deepEqual(plain(tube.map((org) => org.species)), ['tardigrade']);
});

// ---- Drying, the tun, and coming back ----

test('a slide dries on the plan\'s clock', () => {
    assert.equal(ctx.microSlideStage(0), 'wet');
    assert.equal(ctx.microSlideStage(100), 'wet');
    assert.equal(ctx.microSlideStage(ctx.MICRO_DRY_SECONDS - ctx.MICRO_TUN_SECONDS), 'drying');
    assert.equal(ctx.microSlideStage(239.9), 'drying');
    assert.equal(ctx.microSlideStage(240), 'dry');
    assert.equal(ctx.microSlideStage(5, 5), 'reviving');
    assert.equal(ctx.microSlideStage(25, 25), 'wet');
    assert.equal(ctx.microSlideStage(300, 300), 'dry');
    // Another drop later on is only water: nobody curls up to open again.
    assert.equal(ctx.microSlideStage(1, 100), 'wet');
    assert.equal(ctx.microUnfold(1, 100), 1);
    assert.equal(ctx.microUnfold(10), 1);
    assert.equal(ctx.microUnfold(240), 0);
    assert.ok(ctx.microUnfold(230) > 0 && ctx.microUnfold(230) < 1);
    assert.equal(ctx.microUnfold(0, 0), 0);
    assert.equal(ctx.microUnfold(10, 10), 0.5);
    assert.equal(ctx.microUnfold(20, 20), 1);
});

test('when it dries, only the tardigrade comes through', () => {
    for (const id of Object.keys(ctx.MICRO_SPECIES)) {
        assert.equal(ctx.microFate(id, 10, false), 'alive', id);
        const dry = ctx.microFate(id, 240, false);
        const wetAgain = ctx.microFate(id, 30, true);
        if (id === 'tardigrade') {
            assert.equal(dry, 'alive');
            assert.equal(wetAgain, 'alive');
        } else {
            assert.ok(dry === 'cyst' || dry === 'dead', id);
            assert.equal(wetAgain, dry, id);
        }
    }
    assert.equal(ctx.microFate('rotifer', 240, false), 'cyst');
    assert.equal(ctx.microFate('paramecium', 240, false), 'dead');
});

test('the tardigrade: walking, eating, curling up and coming back', () => {
    const org = plain(ctx.microPopulate('tardigrade_tube', 11, 1))[0];
    Object.assign(org, { moltAt: null, cooldown: 0 });
    const world = { age: 10, revived: false, organisms: [org] };
    const x = org.x;
    const y = org.y;
    for (let i = 0; i < 60; i++) ctx.microStep(org, 0.1, world);
    assert.equal(org.action, 'walking');
    assert.ok(Math.hypot(org.x - x, org.y - y) > 20, 'it walked');

    // By an alga it stops, pierces it, and its gut goes green.
    const alga = plain(ctx.microPopulate('sample_oasis_c', 2, 0))[0];
    Object.assign(alga, { x: org.x + 60, y: org.y });
    org.cooldown = 0;
    const world2 = { age: 10, revived: false, organisms: [org, alga] };
    ctx.microStep(org, 0.1, world2);
    assert.equal(org.action, 'eating');
    for (let i = 0; i < 40; i++) ctx.microStep(org, 0.1, world2);
    assert.equal(org.stylet, 1);
    assert.ok(org.gut > 0.3, `gut ${org.gut}`);
    for (let i = 0; i < 100; i++) ctx.microStep(org, 0.1, world2);
    assert.equal(org.action, 'walking');

    // A dead alga is no meal.
    Object.assign(org, { cooldown: 0, action: 'walking' });
    ctx.microStep(org, 0.1, { age: 10, revived: true, organisms: [org, alga] });
    assert.notEqual(org.action, 'eating');

    // Dry: it curls up and does not move.
    const before = [org.x, org.y];
    ctx.microStep(org, 1, { age: 240, revived: false, organisms: [org] });
    assert.equal(org.action, 'tun');
    assert.equal(org.unfold, 0);
    assert.deepEqual([org.x, org.y], before);
    assert.match(ctx.microscopeTardigradeLine(org), /cryptobiosis/);

    // A drop: it unfolds over about 20 s, and walks off.
    ctx.microStep(org, 0.1, { age: 2, woke: 2, revived: true, organisms: [org] });
    assert.ok(org.unfold < 0.5);
    ctx.microStep(org, 0.1, { age: 19, woke: 19, revived: true, organisms: [org] });
    assert.ok(org.unfold > 0.9);
    ctx.microStep(org, 0.1, { age: 21, woke: 21, revived: true, organisms: [org] });
    assert.equal(org.action, 'walking');
});

test('the tardigrade sheds its skin and leaves its eggs in it', () => {
    const org = plain(ctx.microPopulate('tardigrade_tube', 11, 1))[0];
    Object.assign(org, { moltAt: 1, cooldown: 100 });
    const world = { age: 10, revived: false, organisms: [org] };
    for (let i = 0; i < 20; i++) ctx.microStep(org, 0.1, world);
    assert.equal(org.action, 'molting');
    const at = [org.x, org.y];
    for (let i = 0; i < 80; i++) ctx.microStep(org, 0.1, world);
    assert.equal(org.molts.length, 1);
    assert.deepEqual([org.molts[0].x, org.molts[0].y], at);
    assert.equal(org.action, 'walking');
    assert.equal(org.moltAt, null);
});

test('the tardigrade has eight legs and four claws on each', () => {
    const legs = ctx.tardigradeLegs(1.3, 1);
    assert.equal(legs.length, 8);
    assert.equal(legs.filter((leg) => leg.side > 0).length, 4);
    assert.equal(legs.filter((leg) => leg.pair === 3).length, 2);
    for (const leg of legs) {
        assert.equal(leg.claws.length, 4);
        // Each leg ends beyond its root, on its own side (the back pair points backwards).
        if (leg.pair === 3) assert.ok(leg.tipX < leg.x);
        else assert.ok(Math.sign(leg.tipY) === leg.side && Math.abs(leg.tipY) > Math.abs(leg.y));
    }
    // Waves: the legs of a side are not all in step.
    const lifts = ctx.tardigradeLegs(0.7, 1).filter((leg) => leg.side > 0).map((leg) => leg.lift.toFixed(3));
    assert.ok(new Set(lifts).size > 1);
    // Pulled in for a tun: the legs have no reach left.
    for (const leg of ctx.tardigradeLegs(1, 0)) {
        assert.ok(Math.hypot(leg.tipX - leg.x, leg.tipY - leg.y) < 0.001);
    }
});

// ---- The lens ----

test('focus: what is at another depth blurs, and more so at high power', () => {
    assert.equal(ctx.microBlur(0.5, 0.5, 40), 0);
    assert.ok(ctx.microBlur(0.9, 0.5, 400) > ctx.microBlur(0.9, 0.5, 100));
    assert.ok(ctx.microBlur(0.9, 0.5, 100) > ctx.microBlur(0.9, 0.5, 40));
});

test('what can be told apart at each power', () => {
    assert.equal(ctx.microCanIdentify('tardigrade', 40, 0), 'ok');
    assert.equal(ctx.microCanIdentify('paramecium', 40, 0), 'low');
    assert.equal(ctx.microCanIdentify('paramecium', 100, 0), 'ok');
    assert.equal(ctx.microCanIdentify('soil_bacteria', 100, 0), 'low');
    assert.equal(ctx.microCanIdentify('soil_bacteria', 400, 0), 'ok');
    assert.equal(ctx.microCanIdentify('tardigrade', 400, 3), 'blur');
});

test('at each power, the tardigrade is seen as the plan says', () => {
    const size = (power) => ctx.MICRO_SPECIES.tardigrade.drawn * ctx.microscopeScale(power, 300);
    assert.ok(size(40) >= 40, 'seen already at 40×');
    assert.ok(size(100) >= 120, 'shows off at 100×');
    const bacterium = ctx.MICRO_SPECIES.soil_bacteria.drawn * ctx.microscopeScale(400, 300);
    assert.ok(bacterium >= 8 && bacterium < 30, `bacteria at 400× are ${bacterium} px`);
});

test('the nosepiece, the stage and the scale bar', () => {
    assert.equal(ctx.microscopeStepPower(40, 1), 100);
    assert.equal(ctx.microscopeStepPower(400, 1), 400);
    assert.equal(ctx.microscopeStepPower(40, -1), 40);
    assert.deepEqual(plain(ctx.microscopeClampStage(10, 20)), [10, 20]);
    const [x, y] = ctx.microscopeClampStage(99999, 0);
    assert.equal(Math.round(Math.hypot(x, y)), ctx.MICRO_SLIDE_RADIUS);
    const bar = ctx.microscopeScaleBar(ctx.microscopeScale(100, 300), 300);
    assert.ok(bar.pixels > 40 && bar.pixels < 300);
    assert.equal(ctx.microscopeScaleBar(0.15, 300).label, '1 mm');
    assert.equal(ctx.microscopeScaleBar(1.5, 300).label, '100 µm');
});

test('picking: the organism under the finger, the sharp one first', () => {
    const view = { radius: 300, scale: 0.375, stageX: 0, stageY: 0, focus: 0.5, power: 100 };
    const sharp = { species: 'paramecium', x: 0, y: 0, scale: 1, depth: 0.5 };
    const blurred = { species: 'paramecium', x: 8, y: 0, scale: 1, depth: 0.95 };
    assert.equal(ctx.microscopePick([blurred, sharp], view, 303, 300), sharp);
    assert.equal(ctx.microscopePick([sharp], view, 600, 600), null);
    // A moved stage moves what is under a point.
    assert.equal(ctx.microscopePick([sharp], { ...view, stageX: 400 }, 300, 300), null);
    assert.equal(ctx.microscopePick([sharp], { ...view, stageX: 400 }, 150, 300), sharp);
});

// ---- The light ----

test('no light, no image: sun by day in the open, or a lamp beside it', () => {
    assert.equal(ctx.microscopeLightFrom(1, false, null).level, 0);
    assert.equal(ctx.microscopeLightFrom(0, true, null).level, 0);
    assert.equal(ctx.microscopeLightFrom(0.1, true, null).source, null);
    const sun = ctx.microscopeLightFrom(1, true, null);
    assert.equal(sun.source, 'sun');
    assert.equal(sun.level, 1);
    assert.ok(ctx.microscopeLightFrom(0.5, true, null).level < 1);
    const candle = ctx.microscopeLightFrom(0, false, { level: 9, name: 'Candle' });
    assert.equal(candle.source, 'lamp');
    assert.equal(candle.name, 'Candle');
    const lantern = ctx.microscopeLightFrom(0, false, { level: 13, name: 'Lantern' });
    assert.ok(lantern.level > candle.level && lantern.level <= 1);
    // At noon outdoors the sun is what counts, and at night the lamp.
    assert.equal(ctx.microscopeLightFrom(1, true, { level: 9, name: 'Candle' }).source, 'sun');
    assert.equal(ctx.microscopeLightFrom(0, true, { level: 9, name: 'Candle' }).source, 'lamp');
});

test('in the open: under the sky, by a window; not under a roof or by a wall', () => {
    const open = (solid) => ctx.microscopeOpenToSky((x, y, z) => solid.has(`${x},${y},${z}`), 40, 0, 5, 0);
    assert.equal(open(new Set()), true);
    // A roof overhead that spreads past the reach.
    const roof = new Set();
    for (let x = -4; x <= 4; x++) {
        for (let z = -4; z <= 4; z++) roof.add(`${x},9,${z}`);
    }
    assert.equal(open(roof), false);
    // A hole in that roof beside it, nothing between: the light comes in.
    const hole = new Set(roof);
    hole.delete('2,9,0');
    assert.equal(open(hole), true);
    // The same hole with a wall in the way.
    const walled = new Set(hole);
    walled.add('1,5,0');
    assert.equal(open(walled), false);
});

// ---- What the server's answers do to the inventory ----

test('a request takes its items first, and the answer settles them', () => {
    const sample = ctx.microscopeRequestItems('sample');
    assert.deepEqual(plain(sample.took), { test_tube: 1 });
    assert.deepEqual(plain(ctx.microscopeSettle(sample, { amount: 1, type: 'sample_moss_b' })), { sample_moss_b: 1 });
    assert.deepEqual(plain(ctx.microscopeSettle(sample, { amount: 0, reason: 'too far' })), { test_tube: 1 });

    // A sample on a slide: the tube comes back; a refusal gives both back.
    const tube = ctx.microscopeRequestItems('prepare', 'sample_oasis_a');
    assert.deepEqual(plain(tube.took), { glass_slide: 1, sample_oasis_a: 1 });
    assert.deepEqual(plain(ctx.microscopeSettle(tube, { amount: 1, type: 'sample_oasis_a' })), { test_tube: 1 });
    assert.deepEqual(plain(ctx.microscopeSettle(tube, { amount: 0 })), { glass_slide: 1, sample_oasis_a: 1 });
    // An item on a slide is spent; a smear takes only the slide.
    const item = ctx.microscopeRequestItems('prepare', 'dirt');
    assert.deepEqual(plain(ctx.microscopeSettle(item, { amount: 1, type: 'dirt' })), {});
    assert.deepEqual(plain(ctx.microscopeRequestItems('prepare', 'cheek').took), { glass_slide: 1 });
    assert.deepEqual(plain(ctx.microscopeSettle(ctx.microscopeRequestItems('prepare', 'milk'), { amount: 1, type: 'milk' })), { glass: 1 });
    // The slide comes back when it is taken off.
    const clear = ctx.microscopeRequestItems('clear');
    assert.deepEqual(plain(clear.took), {});
    assert.deepEqual(plain(ctx.microscopeSettle(clear, { amount: 1, type: 'glass_slide' })), { glass_slide: 1 });
    assert.deepEqual(plain(ctx.microscopeSettle(clear, { amount: 0 })), {});
    // The drop: flask for bottle.
    const drop = ctx.microscopeRequestItems('drop');
    assert.deepEqual(plain(ctx.microscopeSettle(drop, { amount: 1, type: 'water_flask' })), { glass: 1 });
    assert.deepEqual(plain(ctx.microscopeSettle(drop, { amount: 0 })), { water_flask: 1 });
    // A capture: an empty tube for what the server says it holds.
    const capture = ctx.microscopeRequestItems('capture');
    assert.deepEqual(plain(ctx.microscopeSettle(capture, { amount: 1, type: 'tardigrade_tun' })), { tardigrade_tun: 1 });
    assert.deepEqual(plain(ctx.microscopeSettle(capture, { amount: 0 })), { test_tube: 1 });
});

test('the commands: /microkit answers like an unknown command outside creative mode', () => {
    const said = [];
    const game = Object.create(ctx.Game.prototype);
    game.creativeMode = false;
    game.receiveSystemMessage = (message) => said.push(message.text);
    game.addInventory = () => assert.fail('it gave something');
    game.microscopeKit('microkit');
    assert.deepEqual(said, ['Unknown command: /microkit']);
    const given = {};
    game.creativeMode = true;
    game.addInventory = (type, amount) => { given[type] = amount; };
    game.microscopeKit('microkit');
    assert.equal(given.microscope, 1);
    assert.ok(given.test_tube > 0 && given.glass_slide > 0 && given.micropipette > 0 && given.lantern > 0);
    const social = fs.readFileSync(path.join(JS, 'game', 'social.js'), 'utf8');
    assert.match(social, /case 'microkit':\s+this\.microscopeKit\(normalized\);/);
});

// ---- Everything draws ----

test('every organism draws on any canvas, in any state, and its numbers stay real', () => {
    const states = [{}, { still: true }, { fate: 'dead' }, { fate: 'cyst' }, { seed: 999, variant: 5 }, { unfold: 0 }, { unfold: 0.4, gut: 1, stylet: 1 }, { spring: 1 }];
    for (const id of Object.keys(ctx.MICRO_SPECIES)) {
        for (const st of states) {
            for (const px of [1, 30, 400]) {
                const canvas = recordingContext();
                ctx.microDrawOrganism(canvas, id, 50, 50, px, 0.7, 3.2, st);
                balanced(canvas);
                for (const [name, ...args] of canvas.calls) {
                    for (const arg of args) {
                        if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${id} ${name} ${JSON.stringify(st)}`);
                    }
                }
            }
        }
        const portrait = recordingContext();
        ctx.microDrawPortrait(portrait, id, 200, 120, 1);
        balanced(portrait);
        assert.ok(portrait.calls.length > 5, id);
    }
    const molt = recordingContext();
    ctx.microDrawTardigradeMolt(molt, 0, { eggs: 4 });
    balanced(molt);
    for (const kind of ['speck', 'grains', 'pollen', 'fat', 'starch', 'fibre']) {
        const canvas = recordingContext();
        ctx.microDrawSceneryItem(canvas, { kind, x: 0, y: 0, rot: 1, size: 0.5, seed: 3 }, 10, 10, 1);
        balanced(canvas);
    }
});

test('the drawn tardigrade really has 8 legs with their claws', () => {
    const canvas = recordingContext();
    ctx.microDrawTardigrade(canvas, 1, {});
    balanced(canvas);
    // Each leg's claws are curves from its tip: 8 legs, 4 claws, 32 curves that start at a tip.
    const legs = ctx.tardigradeLegs(1 * 3.2, 1);
    let claws = 0;
    for (let i = 0; i < canvas.calls.length - 1; i++) {
        const [name, x, y] = canvas.calls[i];
        if (name === 'moveTo' && canvas.calls[i + 1][0] === 'quadraticCurveTo' && legs.some((leg) => Math.abs(leg.tipX - x) < 1e-6 && Math.abs(leg.tipY - y) < 1e-6)) claws++;
    }
    assert.equal(claws, 32);
});

test('the field: black without light, painted with it', () => {
    const buffer = () => ({ canvas: { width: 100, height: 100 }, ctx: recordingContext() });
    const organisms = plain(ctx.microPopulate('sample_moss_a', 5, 2));
    const scenery = plain(ctx.microScenery('sample_moss_a', 5));
    const view = { radius: 150, power: 100, scale: ctx.microscopeScale(100, 150), stageX: 0, stageY: 0, focus: 0.5, t: 1, age: 3, revived: false, selected: organisms[0] };

    const dark = recordingContext();
    ctx.microscopeDrawField(dark, buffer(), buffer(), { ...view, light: { source: null, level: 0 } }, organisms, scenery);
    balanced(dark);
    assert.equal(dark.fillStyle, '#000');
    assert.equal(dark.calls.filter(([name]) => name === 'fillRect').length, 1, 'only the black');
    assert.equal(dark.calls.filter(([name]) => name === 'drawImage').length, 0);

    const lit = recordingContext();
    ctx.microscopeDrawField(lit, buffer(), buffer(), { ...view, light: { source: 'lamp', level: 0.7 } }, organisms, scenery);
    balanced(lit);
    assert.ok(lit.calls.length > 100);
});

// ---- Moss, against the generator on the server ----

function loadGenerator() {
    const context = vm.createContext({ Math });
    vm.runInContext(fs.readFileSync(path.join(JS, 'terrainGen.js'), 'utf8'), context);
    vm.runInContext('Object.assign(this, { columnSurface, blockAt, soilDepthAt, groundBlockAt, mossAt, treeAt, WATER_LEVEL })', context);
    return context;
}

test('moss: terrainGen.js gives exactly what terrain.Generate gives', () => {
    const generator = loadGenerator();
    const go = fs.readFileSync(path.join(ROOT, 'pkg', 'terrain', 'terrain_test.go'), 'utf8');
    const fingerprint = go.match(/const mossFingerprint = "([0-9a-f]{40})"/)[1];
    const [x0, z0, x1, z1] = go.match(/var mossRegion = \[4\]int\{(-?\d+), (-?\d+), (-?\d+), (-?\d+)\}/).slice(1).map(Number);
    const hash = crypto.createHash('sha1');
    let moss = 0;
    for (let x = x0; x < x1; x++) {
        for (let z = z0; z < z1; z++) {
            const surface = generator.columnSurface(x, z);
            const name = generator.blockAt(x, surface.height, z, surface);
            if (name === 'moss') moss++;
            hash.update(`${name}\n`);
        }
    }
    assert.ok(moss >= 20, `${moss} moss blocks`);
    assert.equal(hash.digest('hex'), fingerprint);
});

test('moss: its constants are the same on both sides', () => {
    const go = fs.readFileSync(path.join(ROOT, 'pkg', 'terrain', 'climate.go'), 'utf8');
    const js = fs.readFileSync(path.join(JS, 'terrainGen.js'), 'utf8');
    for (const [goName, jsName] of [['mossReach', 'MOSS_REACH'], ['mossChance', 'MOSS_CHANCE'], ['mossMaxAbove', 'MOSS_MAX_ABOVE'], ['mossLakeNoise', 'MOSS_LAKE_NOISE'], ['mossMountain', 'MOSS_MOUNTAIN'], ['mossForest', 'MOSS_FOREST']]) {
        const inGo = Number(go.match(new RegExp(`${goName}\\s*=\\s*([\\d.]+)`))[1]);
        const inJs = Number(js.match(new RegExp(`const ${jsName} = ([\\d.]+)`))[1]);
        assert.equal(inGo, inJs, goName);
    }
});

test('moss only replaces the top of a column, and the viewer has its colour', () => {
    const generator = loadGenerator();
    let seen = 0;
    for (let x = -60; x < 120; x++) {
        for (let z = 40; z < 260; z++) {
            const surface = generator.columnSurface(x, z);
            const soil = generator.soilDepthAt(x, z, surface);
            if (generator.blockAt(x, surface.height, z, surface, soil) !== 'moss') continue;
            seen++;
            assert.notEqual(generator.blockAt(x, surface.height - 1, z, surface, soil), 'moss');
            assert.ok(['grass', 'stone', 'cobblestone', 'dirt'].includes(generator.groundBlockAt(x, surface.height, z, surface, soil)));
        }
    }
    assert.ok(seen > 20);
    const worker = fs.readFileSync(path.join(JS, 'viewer', 'tileWorker.js'), 'utf8');
    assert.match(worker, /moss: \[/, 'tiles would paint it as stone');
    const palette = JSON.parse(fs.readFileSync(path.join(ROOT, 'pkg', 'web', 'viewer_block_palette.json'), 'utf8'));
    const [color, flags] = palette.moss;
    assert.equal(flags, 0);
    assert.ok(((color >> 8) & 255) > ((color >> 16) & 255) && ((color >> 8) & 255) > (color & 255), 'moss is green');
    assert.ok(palette.microscope, 'the microscope is in the palette');
});

// ---- The panel, on a small stand-in for the page ----

function fakeElement() {
    const listeners = {};
    const found = new Map();
    const element = {
        style: {}, dataset: {}, width: 520, height: 520, value: '50', textContent: '', innerHTML: '', title: '', disabled: false, children: [],
        classes: new Set(),
        classList: {
            add: (...names) => names.forEach((name) => element.classes.add(name)),
            remove: (...names) => names.forEach((name) => element.classes.delete(name)),
            toggle: (name, on) => (on ? element.classes.add(name) : element.classes.delete(name))
        },
        appendChild(child) { element.children.push(child); return child; },
        addEventListener(type, listener) { (listeners[type] = listeners[type] || []).push(listener); },
        fire(type, event = {}) { for (const listener of listeners[type] || []) listener({ preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...event }); },
        querySelector(selector) {
            if (!found.has(selector)) found.set(selector, fakeElement());
            return found.get(selector);
        },
        querySelectorAll(selector) {
            if (selector !== '[data-power]') return [];
            if (!found.has(selector)) {
                found.set(selector, ctx.MICRO_MAGNIFICATIONS.map((power) => {
                    const button = fakeElement();
                    button.dataset.power = String(power);
                    return button;
                }));
            }
            return found.get(selector);
        },
        getContext() { return element.context || (element.context = recordingContext()); },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 520, height: 520 }),
        setPointerCapture() {}
    };
    return element;
}

function panelGame({ lamp = false } = {}) {
    const keydown = [];
    ctx.document = {
        pointerLockElement: null, head: fakeElement(), body: fakeElement(), exitPointerLock() {},
        createElement: () => fakeElement(),
        addEventListener: (type, listener) => { if (type === 'keydown') keydown.push(listener); }
    };
    const blocks = new Map([['0,1,0', 'microscope:e']]);
    if (lamp) blocks.set('1,1,0', 'candle');
    const game = Object.create(ctx.Game.prototype);
    const said = [];
    const counts = { test_tube: 3, glass_slide: 2, micropipette: 1, water_flask: 1, sample_moss_a: 1, dirt: 5, glass: 0 };
    const network = {
        connected: true, sent: [], handlers: {},
        on(type, listener) { (this.handlers[type] = this.handlers[type] || []).push(listener); },
        send(type, payload) { this.sent.push([type, plain(payload)]); },
        last() { return this.sent[this.sent.length - 1]; },
        deliver(type, payload) { for (const listener of this.handlers[type] || []) listener(payload); }
    };
    Object.assign(game, {
        network, daylight: 1, inventory: Object.keys(counts), inventoryCounts: counts, said, keydown,
        cameraController: { isCrouching: false, camera: { position: { x: 1, y: 2, z: 1 } } },
        renderer: { domElement: {} },
        world: {
            blockTypes: { 'microscope:e': { variantOf: 'microscope' }, candle: {}, test_tube: {}, glass_slide: {}, sample_moss_a: {}, dirt: {}, glass: {}, water_flask: {}, tardigrade_tube: {}, tardigrade_tun: {} },
            registry: { solid: [0, 1], transparent: [0, 0], lightLevel: { 7: 9 }, id: () => 7 },
            getBlockTypeAt: (x, y, z) => blocks.get(`${x},${y},${z}`) || null,
            getBlockId: () => 0,
            isLightEmitterType: (type) => type === 'candle',
            getBlockPositionFromIntersection: () => ({ x: 0, y: 1, z: 0 }),
            getInventoryIconUrl: () => 'icon.png'
        },
        getInventoryCount: (type) => counts[type] || 0,
        addInventory(type, amount = 1) { counts[type] = (counts[type] || 0) + amount; },
        getBlockDisplayName: (type) => type,
        receiveSystemMessage: (message) => said.push(message.text),
        updateHotbarCounts() {}, refreshHeldItemMesh() {}, renderCraftingPanel() {}, renderInventoryPanel() {}, saveInventoryState() {},
        playTone() {}, playPickupSound() {}, playPlaceSound() {}, showHitIndicator() {}, stopMining() {}, recapturePointerLock() {}, updatePointerLockHint() {}
    });
    ctx.window.devicePixelRatio = 1;
    game.identified = [];
    game.microscopeIdentified = (id) => game.identified.push(id);
    game.microscopeLoadPending();
    game.microscopeUpdate(0.016);
    return game;
}

function openPanel(game) {
    assert.equal(ctx.ITEM_USE_HANDLERS[0].call(game, null, {}), true);
    assert.deepEqual(game.network.last(), ['storageOpen', { x: 0, y: 1, z: 0 }]);
    return game.microscopePanel;
}

function slide(game, prep) {
    game.network.deliver('storageContents', {
        x: 0, y: 1, z: 0, capacity: 1, slots: prep ? [{ type: 'glass_slide', count: 1 }] : [{}], rev: (game.microscopeRev || 0) + 1,
        ...(prep ? { microscope: { seed: 42, age: 1, woke: -1, tardigrades: 1, ...prep } } : {})
    });
}

test('the panel: black and saying why with no light, lit by a candle beside it', () => {
    const dark = panelGame();
    dark.world.getBlockId = () => 1; // A roof over everything.
    const panel = openPanel(dark);
    assert.ok(panel.classes.has('visible'));
    assert.equal(dark.microscopeLight.level, 0);
    const line = panel.querySelector('#micro-light');
    assert.match(line.textContent, /needs light/);
    assert.ok(line.classes.has('off'));
    slide(dark, { source: 'tardigrade_tube' });
    dark.microscopeFrameLeft = 0;
    dark.microscopeUpdate(0.1);
    assert.equal(dark.microscopeContext.fillStyle, '#000');
    dark.microscopeClickField(260, 260);
    assert.match(panel.querySelector('#micro-note').textContent, /needs light/);

    const candle = panelGame({ lamp: true });
    candle.world.getBlockId = () => 1;
    const litPanel = openPanel(candle);
    assert.equal(candle.microscopeLight.source, 'lamp');
    assert.match(litPanel.querySelector('#micro-light').textContent, /candle/);
    assert.ok(!litPanel.querySelector('#micro-light').classes.has('off'));

    const sunny = panelGame();
    openPanel(sunny);
    assert.equal(sunny.microscopeLight.source, 'sun');
    // Night falls while it is open, and it goes dark.
    sunny.daylight = 0;
    sunny.microscopeLightTimer = 0;
    sunny.microscopeUpdate(0.05);
    assert.equal(sunny.microscopeLight.level, 0);
});

test('the panel: preparing a slide, and the answers settling the inventory', () => {
    const game = panelGame();
    const panel = openPanel(game);
    const counts = game.inventoryCounts;
    assert.ok(game.microscopeSoft.canvas.width > 0 && game.microscopeSoft.canvas.width === Math.ceil(game.microscopeCanvas.width / 3), 'the blur buffers have the right size');
    slide(game, null);
    const sources = panel.querySelector('#micro-sources').children.map((cell) => cell.title);
    assert.ok(sources.includes('sample_moss_a') && sources.includes('dirt') && !sources.includes('test_tube'), sources.join());

    panel.querySelector('#micro-sources').children.find((cell) => cell.title === 'sample_moss_a').fire('click');
    const [type, payload] = game.network.last();
    assert.equal(type, 'microscopePrepare');
    assert.equal(payload.source, 'sample_moss_a');
    assert.equal(counts.glass_slide, 1);
    assert.equal(counts.sample_moss_a, 0);
    game.network.deliver('storageResult', { reqId: payload.reqId, type: 'sample_moss_a', amount: 1 });
    assert.equal(counts.test_tube, 4, 'the tube came back');
    assert.equal(game.microscopePending.size, 0);

    slide(game, { source: 'sample_moss_a', tardigrades: 2 });
    assert.ok(game.microscopeOrganisms.some((org) => org.species === 'tardigrade'));
    assert.equal(panel.querySelector('#micro-prepare').style.display, 'none');

    // A drop swaps the flask for its bottle.
    panel.querySelector('.micro-drop').fire('click');
    const drop = game.network.last();
    assert.equal(drop[0], 'microscopeDrop');
    assert.equal(counts.water_flask, 0);
    game.network.deliver('storageResult', { reqId: drop[1].reqId, type: 'water_flask', amount: 1 });
    assert.equal(counts.glass, 1);

    // Taken off, the slide comes back washed.
    panel.querySelector('.micro-clear').fire('click');
    const clear = game.network.last();
    assert.equal(clear[0], 'microscopeClear');
    game.network.deliver('storageResult', { reqId: clear[1].reqId, type: 'glass_slide', amount: 1 });
    assert.equal(counts.glass_slide, 2);
    slide(game, null);
    assert.equal(game.microscopeOrganisms.length, 0);
    assert.equal(game.microscopePrep, null);
});

test('the panel: a refused or lost request gives everything back, also after a reload', () => {
    const game = panelGame();
    const panel = openPanel(game);
    const counts = game.inventoryCounts;
    slide(game, null);
    panel.querySelector('.micro-cheek').fire('click');
    const { reqId } = game.network.last()[1];
    assert.equal(counts.glass_slide, 1);
    // Late: it asks, and the server's log (or its "lost") settles it.
    const now = ctx.performance.now;
    ctx.performance.now = () => 100000;
    game.microscopeUpdate(0.016);
    ctx.performance.now = now;
    assert.deepEqual(game.network.last(), ['storageSync', { reqIds: [reqId] }]);
    game.network.deliver('storageResult', { reqId, amount: 0, reason: 'occupied' });
    assert.equal(counts.glass_slide, 2);
    assert.match(panel.querySelector('#micro-note').textContent, /already a slide/);
    // An answer that is not ours, a chest's, changes nothing.
    game.network.deliver('storageResult', { reqId: 'someone-elses', type: 'dirt', amount: 3 });
    assert.equal(counts.dirt, 5);
});

test('the panel: touch and mouse on the field', () => {
    const game = panelGame();
    const panel = openPanel(game);
    const field = panel.querySelector('#micro-field');
    slide(game, { source: 'tardigrade_tube' });
    const org = game.microscopeOrganisms[0];
    Object.assign(org, { x: 0, y: 0, depth: 0.5, moltAt: null });
    game.microscopeFocus = 0.5;
    const radius = game.microscopeCanvas.width / 2;
    const down = (id, x, y) => field.fire('pointerdown', { pointerId: id, clientX: x, clientY: y });
    const move = (id, x, y) => field.fire('pointermove', { pointerId: id, clientX: x, clientY: y });
    const up = (id, x, y) => field.fire('pointerup', { type: 'pointerup', pointerId: id, clientX: x, clientY: y });

    // A tap on it identifies it.
    down(1, radius, radius);
    up(1, radius, radius);
    assert.equal(game.microscopeSelected, org);
    assert.equal(game.identified.length, 1);
    assert.equal(game.identified[0], 'tardigrade');
    assert.ok(panel.querySelector('#micro-info').classes.has('visible'));
    assert.match(panel.querySelector('#micro-info').querySelector('.micro-capture').textContent, /Draw it off/);

    // A drag moves the stage and identifies nothing.
    const stage = [...game.microscopeStage];
    down(1, 100, 100);
    move(1, 160, 100);
    up(1, 160, 100);
    assert.ok(game.microscopeStage[0] < stage[0], 'it follows the finger');
    assert.equal(game.microscopeStage[1], stage[1]);

    // A pinch changes the power, one step for each stretch.
    assert.equal(game.microscopePower, 40);
    down(1, 200, 260);
    down(2, 300, 260);
    move(2, 400, 260);
    assert.equal(game.microscopePower, 100);
    field.fire('pointercancel', { type: 'pointercancel', pointerId: 2 });
    field.fire('pointercancel', { type: 'pointercancel', pointerId: 1 });
    assert.equal(game.microscopeSelected, org, 'a pinch is not a tap');

    // The buttons, and the wheel and the slider for the focus.
    panel.querySelectorAll('[data-power]')[2].fire('click');
    assert.equal(game.microscopePower, 400);
    field.fire('wheel', { deltaY: 100 });
    assert.ok(game.microscopeFocus > 0.5 - 0.05 && game.microscopeFocus < 0.5);
    panel.querySelector('#micro-focus').fire('input', { target: { value: '80' } });
    assert.equal(game.microscopeFocus, 0.8);
    game.microscopeSetPower(100);
    game.microscopeStage = [0, 0];

    // Too small for this power, or out of focus: it says what to do.
    game.microscopeOrganisms.push({ species: 'soil_bacteria', x: 0, y: 0, depth: 0.8, scale: 1, seed: 1, variant: 0, phase: 0, timer: 1, rot: 0 });
    org.depth = 0.1;
    game.microscopeClickField(radius, radius);
    assert.match(panel.querySelector('#micro-note').textContent, /more power/);
    game.microscopeOrganisms.pop();
    game.microscopeClickField(radius, radius);
    assert.match(panel.querySelector('#micro-note').textContent, /out of focus/);
});

test('the panel: drawing a tardigrade off takes it from the slide for everyone', () => {
    const game = panelGame();
    const panel = openPanel(game);
    const counts = game.inventoryCounts;
    slide(game, { source: 'sample_moss_a', tardigrades: 2 });
    const first = game.microscopeOrganisms.find((org) => org.species === 'tardigrade');
    game.microscopeSelected = first;
    game.microscopeRenderControls();
    panel.querySelector('.micro-capture').fire('click');
    const capture = game.network.last();
    assert.equal(capture[0], 'microscopeCapture');
    assert.equal(counts.test_tube, 2);
    game.network.deliver('storageResult', { reqId: capture[1].reqId, type: 'tardigrade_tube', amount: 1 });
    assert.equal(counts.tardigrade_tube, 1);
    slide(game, { source: 'sample_moss_a', tardigrades: 2, taken: 1 });
    assert.equal(game.microscopeOrganisms.filter((org) => org.species === 'tardigrade').length, 1);
    assert.equal(game.microscopeSelected, null);
    assert.ok(!game.microscopeOrganisms.includes(first), 'the one in the ring is the one that went');
    // Without a pipette, it says so and cannot.
    counts.micropipette = 0;
    game.microscopeSelected = game.microscopeOrganisms.find((org) => org.species === 'tardigrade');
    game.microscopeRenderControls();
    const button = panel.querySelector('#micro-info').querySelector('.micro-capture');
    assert.ok(button.disabled);
    assert.match(button.textContent, /Micropipette/);
});

test('the panel: dry, wet again, and closing', () => {
    const game = panelGame();
    const panel = openPanel(game);
    slide(game, { source: 'sample_moss_a', tardigrades: 1, age: 500 });
    game.microscopeFrameLeft = 0;
    game.microscopeUpdate(0.1);
    assert.match(panel.querySelector('#micro-slide-line').textContent, /dried out/);
    assert.equal(game.microscopeOrganisms.find((org) => org.species === 'tardigrade').action, 'tun');
    game.microscopeLightTimer = 0;
    slide(game, { source: 'sample_moss_a', tardigrades: 1, age: 2, woke: 2, revived: true });
    game.microscopeFrameLeft = 0;
    game.microscopeUpdate(0.1);
    assert.match(panel.querySelector('#micro-slide-line').textContent, /opening up/);

    // Walking away closes it; so does the block going, or the server saying so.
    game.cameraController.camera.position.x = 30;
    game.microscopeUpdate(0.016);
    assert.equal(game.microscopeAt, null);
    assert.deepEqual(game.network.last(), ['storageClose', {}]);
    assert.ok(!panel.classes.has('visible'));
    game.cameraController.camera.position.x = 1;
    openPanel(game);
    game.network.deliver('storageClosed', { x: 0, y: 1, z: 0 });
    assert.equal(game.microscopeAt, null);

    // While it is open, no key reaches the game; E and Escape close it.
    openPanel(game);
    let stopped = 0;
    const key = (code, key_) => game.keydown.forEach((listener) => listener({ code, key: key_, stopImmediatePropagation() { stopped++; }, preventDefault() {} }));
    key('KeyW', 'w');
    assert.ok(stopped >= 1);
    assert.ok(game.microscopeAt);
    key('Equal', '+');
    assert.equal(game.microscopePower, 100);
    key('Escape', 'Escape');
    assert.equal(game.microscopeAt, null);
});

test('a test tube: on water, on moss, on anything else', () => {
    const game = panelGame();
    let water = { x: 4, y: 5, z: 6 };
    game.bucketFindWater = () => water;
    game.bucketAfterUse = () => {};
    const handler = ctx.ITEM_USE_HANDLERS.find((candidate) => String(candidate).includes("'test_tube'"));
    assert.equal(handler.call(game, 'dirt', null), false);
    assert.equal(handler.call(game, 'test_tube', null), true);
    const [type, payload] = game.network.last();
    assert.equal(type, 'sampleTake');
    assert.deepEqual([payload.x, payload.y, payload.z], [4, 5, 6]);
    assert.equal(game.inventoryCounts.test_tube, 2);
    game.world.blockTypes.sample_forest_lake_b = {};
    game.network.deliver('sampleResult', { reqId: payload.reqId, type: 'sample_forest_lake_b', amount: 1 });
    assert.equal(game.inventoryCounts.sample_forest_lake_b, 1);
    assert.equal(game.inventoryCounts.test_tube, 2);
    assert.match(game.said[game.said.length - 1], /sample_forest_lake_b/);

    water = null;
    game.world.getBlockPositionFromIntersection = () => ({ x: 9, y: 9, z: 9 });
    game.world.getBlockTypeAt = (x) => (x === 9 ? 'moss' : null);
    handler.call(game, 'test_tube', {});
    assert.deepEqual([game.network.last()[1].x, game.network.last()[0]], [9, 'sampleTake']);
    game.network.deliver('sampleResult', { reqId: game.network.last()[1].reqId, amount: 0, reason: 'too far' });
    assert.equal(game.inventoryCounts.test_tube, 2, 'the tube comes back');

    game.world.getBlockTypeAt = () => 'stone';
    const sent = game.network.sent.length;
    handler.call(game, 'test_tube', {});
    assert.equal(game.network.sent.length, sent);
    assert.match(game.said[game.said.length - 1], /water or moss/);
});

// ---- One bestiary ----

// A page element with what the bestiary's sheet uses of it.
function sheetElement() {
    const element = fakeElement();
    let inner = '';
    Object.defineProperty(element, 'innerHTML', { get: () => inner, set(value) { inner = value; element.children = []; } });
    let text = '';
    Object.defineProperty(element, 'textContent', { get: () => text, set(value) { text = value; if (value === '') element.children = []; } });
    element.append = (...children) => element.children.push(...children);
    element.appendChild = (child) => { element.children.push(child); child.parentNode = element; return child; };
    element.removeChild = (child) => { element.children = element.children.filter((other) => other !== child); };
    element.toDataURL = () => 'data:image/png;base64,drawn';
    return element;
}

function allText(element) {
    return [element.textContent, ...element.children.map(allText)].join(' ');
}

function bestiaryGame() {
    const toasts = [];
    const panel = sheetElement();
    const found = new Map();
    panel.querySelector = (selector) => {
        if (!found.has(selector)) found.set(selector, sheetElement());
        return found.get(selector);
    };
    ctx.document = {
        createElement: () => sheetElement(), getElementById: () => null, querySelector: () => null,
        head: sheetElement(), body: sheetElement(), addEventListener() {}
    };
    ctx.requestAnimationFrame = () => 1;
    ctx.cancelAnimationFrame = () => {};
    ctx.setTimeout = () => 0;
    const game = Object.create(ctx.Game.prototype);
    Object.assign(game, {
        bestiaryInstalled: true, bestiaryOpen: true, bestiarySelected: null, bestiaryPortraits: new Map(), bestiaryPortraitQueue: [], bestiaryData: {},
        bestiarySeenMobs: new WeakSet(), bestiaryPanel: panel, toasts, said: [],
        bestiaryAnnounce(species) { toasts.push(species); },
        bestiarySave() {}, playTone() {}, receiveSystemMessage(message) { this.said.push(message.text); }
    });
    return game;
}

test('the organisms are cards of the one bestiary, and not mobs', () => {
    const game = bestiaryGame();
    const list = game.bestiarySpeciesList();
    const organisms = Object.keys(ctx.MICRO_SPECIES);
    assert.equal(organisms.length, 16);
    for (const id of organisms) {
        assert.ok(list.includes(id), id);
        assert.equal(ctx.MOB_SPECIES[id], undefined, `${id} must not be a mob`);
        assert.equal(ctx.BESTIARY_ENTRIES[id], undefined, id);
    }
    for (const id of Object.keys(ctx.MOB_SPECIES)) assert.ok(list.includes(id), id);
    assert.equal(new Set(list).size, list.length);
    assert.equal(ctx.BESTIARY_STORAGE_KEY, 'minecloud-bestiary');
});

test('only the microscope discovers an organism, with a toast the first time', () => {
    const game = bestiaryGame();
    // The scan goes through the mobs of the world: there is no organism among them, whatever is near.
    game.titleScreenOpen = false;
    game.camera = { position: anyStub(), getWorldDirection() {} };
    game.ambientMobs = [];
    game.bestiaryScan();
    assert.deepEqual(plain(game.bestiaryData), {});
    assert.ok(!fs.readFileSync(path.join(JS, 'game', 'bestiary.js'), 'utf8').match(/MICRO_SPECIES[^\n]*ambientMobs/));

    game.microscopeIdentified('tardigrade');
    assert.deepEqual([...game.toasts], ['tardigrade']);
    assert.equal(game.bestiaryData.tardigrade.encounters, 1);
    game.microscopeIdentified('tardigrade');
    assert.equal(game.toasts.length, 1);
    assert.equal(game.bestiaryData.tardigrade.encounters, 2);
    game.microscopeIdentified('sheep');
    game.microscopeIdentified('no_such_thing');
    assert.equal(game.bestiaryData.sheep, undefined);
    assert.equal(game.bestiaryData.no_such_thing, undefined);
    // Before the bestiary is there, it does nothing and breaks nothing.
    game.bestiaryInstalled = false;
    game.microscopeIdentified('rotifer');
    assert.equal(game.bestiaryData.rotifer, undefined);
});

test('the first version\'s list of what was identified moves into the bestiary, once', () => {
    const game = bestiaryGame();
    const stored = new Map([['minecloud-microscope-known', JSON.stringify(['tardigrade', 'yeast', 'bogus'])]]);
    const before = ctx.window.localStorage;
    ctx.window.localStorage = { getItem: (key) => stored.get(key) ?? null, setItem() {}, removeItem: (key) => stored.delete(key) };
    game.bestiaryData.yeast = { encounters: 5 };
    game.microscopeMoveKnown();
    ctx.window.localStorage = before;
    assert.equal(game.bestiaryData.tardigrade.encounters, 1);
    assert.equal(game.bestiaryData.yeast.encounters, 5);
    assert.equal(game.bestiaryData.bogus, undefined);
    assert.equal(stored.size, 0);
});

test('a hint does not give away the name, like any other card', () => {
    const game = bestiaryGame();
    for (const [id, def] of Object.entries(ctx.MICRO_SPECIES)) {
        const entry = game.bestiaryEntry(id);
        const word = def.name.split(' ')[0].toLowerCase();
        assert.ok(!entry.hint.toLowerCase().includes(word), `${id}: ${entry.hint}`);
        assert.match(entry.hint, /microscope/);
    }
});

test('an unknown card is a silhouette with a hint; a known one, its drawing', () => {
    const game = bestiaryGame();
    game.bestiaryRender();
    const grid = game.bestiaryPanel.querySelector('#bestiary-grid');
    const card = grid.children.find((child) => child.dataset.species === 'tardigrade');
    assert.ok(card.className.includes('unknown'));
    assert.equal(card.children[1].textContent, '???');
    assert.equal(card.children[0].children[0].src, 'data:image/png;base64,drawn');
    // The silhouette is painted on nothing: the CSS of an unknown card turns it black.
    assert.ok(game.bestiaryOrganismUrls.has('tardigrade:shape'));
    assert.ok(!game.bestiaryOrganismUrls.has('tardigrade:colour'));

    game.bestiarySelected = 'tardigrade';
    game.bestiaryRenderDetail();
    const detail = game.bestiaryPanel.querySelector('#bestiary-detail');
    assert.match(allText(detail), /\?\?\?/);
    assert.match(allText(detail), /Only a microscope shows it/);
    assert.doesNotMatch(allText(detail), /Tardigrade/);

    game.microscopeIdentified('tardigrade');
    game.bestiaryRender();
    const known = game.bestiaryPanel.querySelector('#bestiary-grid').children.find((child) => child.dataset.species === 'tardigrade');
    assert.ok(!known.className.includes('unknown'));
    assert.equal(known.children[1].textContent, 'Tardigrade');
    assert.equal(known.children[2].textContent, 'Identified 1x');
    assert.ok(game.bestiaryOrganismUrls.has('tardigrade:colour'));
});

test('the sheet of an organism: animated drawing and real size, nothing that does not apply', () => {
    const game = bestiaryGame();
    game.microscopeIdentified('rotifer');
    game.bestiarySelected = 'rotifer';
    game.bestiaryRenderDetail();
    const detail = game.bestiaryPanel.querySelector('#bestiary-detail');
    const text = allText(detail);
    assert.match(text, /Real size/);
    assert.match(text, /0\.1-0\.5 mm/);
    assert.match(text, /Rotifera/);
    assert.match(text, /Identified/);
    for (const label of ['Defeated', 'Diet', 'Drops', 'Lured by', 'Encounters', 'Passive', 'Active:']) assert.ok(!text.includes(label), label);
    const preview = detail.children.find((child) => child.className === 'bestiary-preview');
    assert.equal(preview.children.length, 1);
    assert.equal(preview.children[0], game.bestiaryOrganismCanvas);
    assert.equal(game.bestiaryPreviewSpecies, 'rotifer');
    // It is drawn, and goes on being drawn; the WebGL stage is never asked for.
    assert.ok(game.bestiaryOrganismCanvas.context.calls.length > 20);
    assert.equal(game.bestiaryStageState, undefined);
    // Rendering again keeps the same canvas running, and leaving stops it.
    const canvas = game.bestiaryOrganismCanvas;
    game.bestiaryRenderDetail();
    assert.equal(game.bestiaryOrganismCanvas, canvas);
    game.bestiaryStopPreview();
    assert.equal(game.bestiaryOrganismCanvas, null);
    assert.equal(game.bestiaryPreviewSpecies, null);
});

test('a mob\'s sheet and the notebook of the mobs are as they were', () => {
    const game = bestiaryGame();
    const mobs = game.bestiaryMobList();
    assert.ok(!mobs.includes('tardigrade'));
    // All the organisms: no complete notebook, no message and no code.
    for (const id of Object.keys(ctx.MICRO_SPECIES)) game.microscopeIdentified(id);
    assert.equal(game.said.length, 0);
    game.bestiaryRender();
    assert.doesNotMatch(game.bestiaryPanel.querySelector('#bestiary-progress').innerHTML, /B31X/);
    // All the mobs and no organism: the code, as ever.
    const other = bestiaryGame();
    for (const id of mobs) other.bestiaryData[id] = { encounters: 1 };
    other.bestiaryRender();
    assert.match(other.bestiaryPanel.querySelector('#bestiary-progress').innerHTML, /B31X/);
    assert.match(other.bestiaryPanel.querySelector('#bestiary-progress').innerHTML, new RegExp(`/ ${mobs.length + 16} discovered`));
});

test('portraits for the guide and the printed book need no game and no WebGL', () => {
    const game = Object.create(ctx.Game.prototype);
    ctx.document = { createElement: () => sheetElement() };
    for (const id of Object.keys(ctx.MICRO_SPECIES)) {
        assert.match(game.bestiaryRenderPortrait(id), /^data:image\/png/, id);
    }
    assert.equal(game.bestiaryStageState, undefined);
    // Same drawing asked twice is drawn once.
    assert.equal(game.bestiaryRenderPortrait('yeast'), game.bestiaryRenderPortrait('yeast'));
});

test('the book finds an organism\'s portrait through mob:', () => {
    const context = vm.createContext({ Math, console, THREE: anyStub(), document: anyStub(), window: { localStorage: { getItem: () => null } }, performance: { now: () => 0 } });
    vm.runInContext('class Game {}', context);
    for (const file of ['extensions.js', 'mobSpecies.js', 'guideMarkdown.js']) vm.runInContext(fs.readFileSync(path.join(JS, file), 'utf8'), context);
    for (const file of ['bestiary.js', 'microbes.js', 'guide.js']) vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context);
    const game = vm.runInContext('Object.create(Game.prototype)', context);
    game.bestiaryPortraits = new Map();
    game.bestiaryRenderPortrait = (species) => `portrait of ${species}`;
    assert.equal(game.guideAssetUrl('mob:tardigrade'), 'portrait of tardigrade');
    assert.equal(game.guideAssetUrl('mob:sheep'), 'portrait of sheep');
    assert.equal(game.guideAssetUrl('mob:unicorn'), '');
    assert.match(game.guideMarkdown('![A water bear](mob:tardigrade)'), /<img src="portrait of tardigrade" alt="A water bear">/);
});

// ---- The guide ----

const GUIDE = path.join(STATIC, 'guide');
const guideNames = fs.readdirSync(GUIDE);
const guidePage = (page, lang) => {
    const name = guideNames.find((candidate) => candidate.startsWith(`${page}_${lang}_`));
    assert.ok(name, `page ${page} ${lang}`);
    return fs.readFileSync(path.join(GUIDE, name), 'utf8');
};
const SMALL_WORLD = [237, 238, 239, 240, 241, 242, 243, 244];

test('the guide: 237 to 244 in both languages, with the plan\'s titles, in the printed book', () => {
    const titles = {
        ES: ['El mundo pequeño', 'El microscopio', 'Cómo tomar una muestra', 'Tardígrados', 'Criptobiosis', 'Células vegetales y animales', 'Protozoos y algas', 'Bacterias: casi todas son amigas'],
        EN: ['The small world', 'The microscope', 'How to take a sample', 'Tardigrades', 'Cryptobiosis', 'Plant and animal cells', 'Protozoa and algae', 'Bacteria: nearly all are friends']
    };
    const print = require(path.join(JS, 'guidePrint.js'));
    SMALL_WORLD.forEach((page, i) => {
        for (const lang of ['ES', 'EN']) assert.equal(guidePage(page, lang).split('\n')[0], `# ${titles[lang][i]}`);
        assert.ok(print.SECTIONS.some(([from, to]) => page >= from && page <= to), `section for ${page}`);
    });
    assert.ok(!guideNames.some((name) => name.startsWith('245_')));
    assert.ok(!guideNames.some((name) => name.startsWith('221_')), '221 stays free');
    // File names go through go:embed, which takes no colon.
    assert.ok(!guideNames.some((name) => name.includes(':')));
    const readme = fs.readFileSync(path.join(GUIDE, 'README.md'), 'utf8');
    for (const page of SMALL_WORLD) assert.match(readme, new RegExp(`^\\| ${page} \\|`, 'm'));
    const guia = fs.readFileSync(path.join(ROOT, 'GUIA.md'), 'utf8');
    assert.match(guia, /^## Microscopio y tardígrados$/m);
});

test('the guide: every link, picture and id is real, and they are linked from the old pages', () => {
    for (const lang of ['ES', 'EN']) {
        for (const page of SMALL_WORLD) {
            const text = guidePage(page, lang);
            for (const [, target] of text.matchAll(/\]\((\d+)\)/g)) assert.ok(guideNames.some((name) => name.startsWith(`${target}_${lang}_`)), `${page} ${lang} links to ${target}`);
            for (const [, species] of text.matchAll(/\(mob:([a-z0-9_]+)\)/g)) assert.ok(ctx.MICRO_SPECIES[species], `${page} ${lang}: mob:${species}`);
        }
        const contents = guidePage(0, lang);
        for (const page of SMALL_WORLD) assert.match(contents, new RegExp(`\\(${page}\\)`), `contents ${lang}`);
        const items = guidePage(48, lang);
        for (const page of [238, 239, 240, 241]) assert.match(items, new RegExp(`\\(${page}\\)`), `items ${lang}`);
        assert.match(guidePage(5, lang), /\(237\)/);
        assert.match(guidePage(16, lang), /\(237\)/);
        assert.match(guidePage(52, lang), /\(239\)/);
        assert.match(guidePage(228, lang), /\(238\)/);
        assert.match(guidePage(234, lang), /\(241\)/);
        // Every organism has a picture on its page, and its page links back to where to start.
        for (const [id, def] of Object.entries(ctx.MICRO_SPECIES)) {
            assert.ok(SMALL_WORLD.includes(def.page), id);
            assert.ok(guidePage(def.page, lang).includes(`(mob:${id})`), `${id} on page ${def.page} ${lang}`);
            assert.ok(guidePage(237, lang).includes(`(mob:${id})`), `${id} in the overview ${lang}`);
        }
    }
    assert.equal(ctx.MICROSCOPE_GUIDE_PAGE, 238);
});

test('the guide says what the game does', () => {
    for (const lang of ['ES', 'EN']) {
        const scope = guidePage(238, lang);
        // The recipes.
        assert.match(scope, /2 `glass` \+ 1 `copper_block` \+ 1 `iron_ore` \+ 1 `planks`/);
        assert.match(scope, /1 `glass` \+ 1 `leather`/);
        const sample = guidePage(239, lang);
        // The shares of the plan, and never which letter.
        assert.match(sample, lang === 'EN' ? /half/ : /mitad/);
        assert.doesNotMatch(sample, /sample_[a-z_]+_[b-d]/);
        const dry = guidePage(241, lang);
        assert.match(dry, /240/);
        assert.match(dry, /water_flask/);
        assert.match(dry, /tardigrade_tun/);
        // Science and game apart, on every page; and that real ones live almost everywhere.
        for (const page of SMALL_WORLD) assert.match(guidePage(page, lang), lang === 'EN' ? /Simplified in the game/ : /Lo simplifica el juego/, `${page} ${lang}`);
        assert.match(sample, lang === 'EN' ? /almost everywhere/ : /casi en todas partes/);
        assert.match(guidePage(240, lang), lang === 'EN' ? /almost everywhere/ : /casi en todas partes/);
        // Real water is not the game's water.
        assert.match(sample, lang === 'EN' ? /never drink/ : /no la bebas nunca/);
    }
    // No secret page of its own, and no reward.
    assert.ok(!guideNames.some((name) => /^[0-9A-Z]*[A-Z][0-9A-Z]*_(EN|ES)_.*(ardigrad|ardígrad|icro)/.test(name)));
});

// ---- Lit by a bulb ----

test('a bulb shows the slide, dimmer than a lamp or the sun', () => {
    const level = (lamp) => ctx.microscopeLightFrom(0, false, lamp).level;
    const bulb = level({ level: 7, name: 'Light Bulb' });
    const lamp = level({ level: 14, name: 'Electric Lamp' });
    assert.ok(bulb >= 0.6, `usable at ${bulb}`);
    assert.ok(lamp - bulb >= 0.2, `visibly dimmer: ${bulb} and ${lamp}`);
    assert.ok(ctx.microscopeLightFrom(1, true, null).level - bulb >= 0.25);
    assert.equal(ctx.microscopeLightFrom(0, false, { level: 7, name: 'Light Bulb' }).source, 'lamp');
});

test('a dark field says when a lamp beside it has no power', () => {
    assert.match(ctx.microscopeDarkLine(null), /needs light/);
    assert.match(ctx.microscopeDarkLine('Light Bulb'), /^The light bulb beside it has no power: it needs a generator or a battery/);
    assert.equal(ctx.microscopeIsUnlitLamp('light_bulb'), true);
    assert.equal(ctx.microscopeIsUnlitLamp('electric_lamp'), true);
    assert.equal(ctx.microscopeIsUnlitLamp('light_bulb:on'), false);
    assert.equal(ctx.microscopeIsUnlitLamp('candle'), false);
    assert.equal(ctx.microscopeIsUnlitLamp(null), false);

    const game = panelGame();
    game.world.getBlockId = () => 1; // A roof over everything.
    game.world.blockTypes.light_bulb = {};
    const at = game.world.getBlockTypeAt;
    game.world.getBlockTypeAt = (x, y, z) => (x === 1 && y === 1 && z === 0 ? 'light_bulb' : at(x, y, z));
    const panel = openPanel(game);
    assert.equal(game.microscopeLight.level, 0);
    const line = panel.querySelector('#micro-light');
    assert.match(line.textContent, /light_bulb beside it has no power/);
    assert.ok(line.classes.has('off'));

    // It gets power: lit, and the message goes.
    game.world.getBlockTypeAt = (x, y, z) => (x === 1 && y === 1 && z === 0 ? 'light_bulb:on' : at(x, y, z));
    game.world.isLightEmitterType = (type) => type === 'light_bulb:on';
    game.world.blockTypes['light_bulb:on'] = { variantOf: 'light_bulb' };
    game.microscopeLightTimer = 0;
    game.microscopeUpdate(0.05);
    assert.equal(game.microscopeLight.source, 'lamp');
    assert.match(line.textContent, /catching the light of the light_bulb/);
    assert.equal(game.microscopeUnlit, null);
});

test('the guide tells how the bulb works, in both languages', () => {
    for (const lang of ['ES', 'EN']) {
        const bulb = guidePage(187, lang);
        assert.match(bulb, /5 W/);
        assert.match(bulb, /\(204\)/);
        assert.match(bulb, /\(238\)/);
        assert.match(bulb, /3422/);
        assert.doesNotMatch(bulb, /by itself|por sí misma/);
        assert.match(guidePage(204, lang), /`light_bulb` \| \*\*5 W\*\*/);
        assert.match(guidePage(238, lang), /\(187\)/);
    }
    assert.doesNotMatch(fs.readFileSync(path.join(JS, 'game', 'chemistry.js'), 'utf8'), /registerBlockType\('light_bulb'/);
});
