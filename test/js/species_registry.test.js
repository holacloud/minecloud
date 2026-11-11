// Node tests for how a species and a movement say everything about themselves from their own file
// (registerSpecies, speciesFacet, mobMovementIs in js/extensions.js), so that no other file keeps a list
// of species or of movement names to remember.
// Run with: node --test test/js/species_registry.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js');
const read = (file) => fs.readFileSync(path.join(JS, file), 'utf8');
const gameFiles = fs.readdirSync(path.join(JS, 'game')).filter((name) => name.endsWith('.js'));

// The real extensions and the real catalogue, with nothing else of the game.
function load() {
    const context = vm.createContext({ window: {}, VoxelModels: { mobBuilders: {}, MOB_SURFACES: {} } });
    vm.runInContext(read('extensions.js'), context);
    vm.runInContext(read('mobSpecies.js'), context);
    vm.runInContext('Object.assign(this, { MOB_SPECIES, registerSpecies, speciesFacet, registerMobBehaviour, mobMovementIs })', context);
    return context;
}

const TRAITS = ['bodiless', 'walksToGoal', 'nudgedToBait', 'baitOwnWay', 'tameable', 'inWater', 'pointLike'];

test('a species registered before a table is in it when the table arrives, and one after goes straight in', () => {
    const ctx = load();
    const model = () => ({});
    ctx.registerSpecies('early', { info: { speed: 1, movement: 'ground' }, model, surface: 'skin', drops: [['shell', 1, 2]], furry: true });
    const drops = ctx.speciesFacet('drops', { sheep: [['white_wool', 1, 2]] });
    const furry = ctx.speciesFacet('furry', {});
    ctx.registerSpecies('late', { info: { speed: 2 }, drops: [['fur', 1, 1]] });

    assert.deepEqual(Object.keys(drops), ['sheep', 'early', 'late']);
    assert.deepEqual(Object.keys(furry), ['early']);
    assert.equal(ctx.MOB_SPECIES.early.speed, 1);
    assert.equal(ctx.VoxelModels.mobBuilders.early, model);
    assert.equal(ctx.VoxelModels.MOB_SURFACES.early, 'skin');
    assert.equal('late' in ctx.VoxelModels.mobBuilders, false);
});

test('a species that says something nobody reads, says nothing, or is there already, is refused aloud', () => {
    const ctx = load();
    assert.throws(() => ctx.registerSpecies('typo', { info: {}, drop: [] }), /unknown field drop/);
    assert.throws(() => ctx.registerSpecies('empty', { drops: [] }), /no info/);
    assert.throws(() => ctx.registerSpecies('sheep', { info: {} }), /already/);
    assert.equal('typo' in ctx.MOB_SPECIES, false, 'a refused species leaves nothing behind');
    ctx.speciesFacet('drops', {});
    assert.throws(() => ctx.speciesFacet('drops', {}), /owned twice/);
    assert.throws(() => ctx.speciesFacet('wings', {}), /unknown/);
});

test('a movement says its own traits; one with none, or unknown, has none; no movement is the ground one', () => {
    const ctx = load();
    ctx.registerMobBehaviour('scuttle', { walksToGoal: true, update() {} });
    assert.equal(ctx.mobMovementIs('scuttle', 'walksToGoal'), true);
    assert.equal(ctx.mobMovementIs('scuttle', 'bodiless'), false);
    assert.equal(ctx.mobMovementIs('made_up', 'bodiless'), false);
    assert.equal(ctx.mobMovementIs(undefined, 'tameable'), true);
    assert.equal(ctx.mobMovementIs('ground', 'walksToGoal'), true);
    assert.equal(ctx.mobMovementIs('swim', 'inWater'), true);
});

test('every trait asked anywhere is one extensions.js documents', () => {
    const documented = new Set(TRAITS);
    for (const trait of TRAITS) assert.match(read('extensions.js'), new RegExp(`^//   ${trait} `, 'm'), `${trait} is not documented`);
    for (const file of ['mobSpecies.js', ...gameFiles.map((name) => `game/${name}`)]) {
        for (const match of read(file).matchAll(/mobMovementIs\([^)]*?,\s*'([A-Za-z]+)'\)/g)) {
            assert.ok(documented.has(match[1]), `${file} asks for the trait ${match[1]}, which no movement says`);
        }
    }
});

test('every table of the game keyed by species is given to speciesFacet, and each field has its table', () => {
    const owned = new Set();
    for (const name of gameFiles) for (const match of read(`game/${name}`).matchAll(/speciesFacet\('([A-Za-z]+)'/g)) owned.add(match[1]);
    const fields = Object.keys(vm.runInContext('SPECIES_FACETS', load()));
    assert.deepEqual([...owned].sort(), [...fields].sort());
});

test('the lists of movement names are gone, and none comes back', () => {
    const names = /\b(HERD_NOT_BODIES|TRAPS_GOAL_MOVEMENTS|TRAPS_OWN_WAY_MOVEMENTS|TRAPS_NUDGE_MODES|TAMING_GOAL_MOVEMENTS|BESTIARY_POINT_MOVEMENTS)\b/;
    // A set or a list of quoted movement names: 'swim', 'swarm', 'glow'...
    const builtIn = "'(ground|swim|hop|climb|dart|amphibious|swarm|glow|stalk|flutter|soar)'";
    const listed = new RegExp(`\\[\\s*${builtIn}\\s*,\\s*${builtIn}`);
    for (const name of gameFiles) {
        const source = read(`game/${name}`);
        assert.doesNotMatch(source, names, name);
        assert.doesNotMatch(source, listed, `${name}: ask mobMovementIs(movement, trait) instead of listing movements`);
    }
});

test('a behaviour that says it walks to a goal asks getMobGoal, and one that asks says so', () => {
    for (const name of gameFiles) {
        const source = read(`game/${name}`);
        const says = /^\s*walksToGoal:\s*true/m.test(source);
        if (says) assert.ok(source.includes('getMobGoal('), `${name} says walksToGoal but never asks getMobGoal`);
    }
});

// ---- What every species does the same way (js/game/mobs.js) ----

test('a species counts its own with mobCount, and marks what the world spawns with mobMarkNatural', () => {
    for (const name of gameFiles) {
        const source = read(`game/${name}`);
        assert.doesNotMatch(source, /ambientMobs\.filter\(\(mob\) => mob\.userData\.species === [^)]+\)\.length/, `${name}: this.mobCount(species)`);
        if (name !== 'mobs.js') assert.doesNotMatch(source, /userData\.natural = true;/, `${name}: this.mobMarkNatural(mob, chunkX, chunkZ)`);
    }
});

test('a mob struck down by the player goes through defeatMobByPlayer, but for the two that fall their own way', () => {
    // The storm golem crumbles for a while before it is gone, and a caught wisp bursts: each emits by itself.
    const ownWay = ['mobs.js', 'storm_golem.js', 'wisp.js'];
    for (const name of gameFiles) {
        if (ownWay.includes(name)) continue;
        assert.doesNotMatch(read(`game/${name}`), /emitMobEvent\('defeated', mob, 'player'\)/, `${name}: damageMobByPlayer and defeatMobByPlayer (js/game/mobs.js)`);
    }
});
