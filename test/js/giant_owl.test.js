// Node tests for the Cuban giant owl (js/game/giant_owl.js): what it is, and what it does when struck: it
// turns on the player, spreads its wings as a warning, and kicks whoever is still within reach, throwing them
// back. The real mobs.js, camera.js and world.js run on a flat world (support/flat_world.js); only drawing
// and sound are left out. What every extinct animal has to be is asked of it by extinct_species.test.js.
// Nothing here hands a mob to an assertion: a failed one would print the whole harness.
// Run with: node --test test/js/giant_owl.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame({ listenersOf: ['js/game/giant_owl.js'], frameUpdates: ['giantOwlUpdate'] });
const O = JSON.parse(vm.runInContext('JSON.stringify(GIANT_OWL)', ctx));
const MODE = vm.runInContext('ANIMALS_MODE', ctx);
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', lang === 'ES' ? '282_ES_Búho_gigante_de_Cuba.md' : '282_EN_Cuban_giant_owl.md'), 'utf8');
const heading = (mob) => Math.PI / 2 - mob.rotation.y;
const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const comma = (number) => String(number).replace('.', ',');

// The player at (0.5, 0.5) and the owl `away` blocks from them along x, struck once with a bare hand.
function struck(away = 1.4) {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('giant_owl', 0.5 + away, 0.5);
    assert.equal(g.game.damageMobByPlayer(mob, 4), false);
    return { g, mob };
}

test('what it is: a neutral owl of the ground that nobody tames, and what its page says of it', () => {
    const info = ctx.getMobSpecies('giant_owl');
    assert.equal(info.movement, undefined, 'it walks as any ground mob, so the server walks a kept one');
    assert.equal(info.flyHeight, undefined, 'it does not fly');
    assert.equal(info.ancestorOf, 'owl');
    assert.equal(info.hostile, undefined, 'it starts nothing');
    assert.equal(info.nocturnal, undefined, 'and it walks at any hour: only its card says night');
    assert.equal(vm.runInContext('BESTIARY_ENTRIES.giant_owl.activity', ctx), 'Night');
    assert.equal(info.speed, ctx.getMobSpecies('goat').speed, 'as fast as a goat, which is what its page says');
    assert.equal(ctx.TAMING_DIET.giant_owl, undefined);
    assert.deepEqual({ ...ctx.TRAPS_SPECIES.giant_owl, baits: [...ctx.TRAPS_SPECIES.giant_owl.baits] }, { baits: [] });
    assert.ok(O.damage <= ctx.getMobSpecies('spider').attackDamage, 'no worse than the spider of today');

    // Its model: over a block tall, on legs as long as its body is deep, and every size a number of quarters of
    // a unit, so that every face gets its texels.
    const model = JSON.parse(vm.runInContext(`(() => {
        const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'feather' });
        VoxelModels.mobBuilders.giant_owl.call(VoxelModels, b, 0);
        const size = (name) => b.byName.get(name).size;
        return JSON.stringify({ odd: b.parts.filter((part) => !part.size.every((side) => side >= 0.25 && side * 4 === Math.round(side * 4))).map((part) => part.name),
            height: herdSpeciesBody('giant_owl').height, leg: size('legL')[1], body: size('body')[2] });
    })()`, ctx));
    assert.deepEqual(model.odd, []);
    assert.ok(Math.abs(model.height - 1.1) < 0.02, `${model.height} blocks tall`);
    assert.ok(model.leg >= model.body - 0.5, 'long legs');

    // The numbers of its page are those of the code.
    const es = page('ES');
    const en = page('EN');
    assert.ok(es.includes(`durante ${comma(O.warn)} segundos`) && en.includes(`for ${O.warn} seconds`), 'how long it warns');
    assert.ok(es.includes(`a menos de ${comma(O.reach)} bloques de él`) && en.includes(`within ${O.reach} blocks of it`), 'how near it kicks');
    assert.ok(es.includes(`A más de ${comma(O.reach)} bloques`) && en.includes(`more than ${O.reach} blocks away`));
    assert.ok(es.includes(`**${O.damage} de daño**`) && en.includes(`**${O.damage} damage**`));
    assert.equal(O.rest, 1, 'a second');
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 5, 6, 7, 8].map(blows), [4, 4, 3, 3, 2], 'bare-handed, and with a sword of wood, stone, iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 4 golpes a mano o con una [espada](71) de madera, 3 con la de piedra o la de hierro, 2 con la de oro`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 4 hits bare-handed or with a wooden [sword](71), 3 with a stone or an iron one, 2 with a golden one`));
    assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify([RESOURCE_DROPS.giant_owl, RESOURCE_SHEDS.giant_owl])', ctx)), [[['feather', 1, 3]], ['feather', 0.4, 8]]);
    assert.ok(es.includes('**de 1 a 3** `feather`') && en.includes('**1 to 3** `feather`'));
    assert.equal(info.variants, undefined);
    assert.ok(es.includes('Solo hay un color') && en.includes('There is one colour only'));
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.giant_owl)', ctx));
    assert.deepEqual(fossil, { source: 'rock', rarity: 'rare', weight: 1, water: 0, seconds: 45 });
    assert.ok(es.includes(`tarda **${fossil.seconds} segundos**`) && en.includes(`takes **${fossil.seconds} seconds**`));
});

test('struck, it turns on the player and spreads its wings; whoever stays within reach is kicked once, and thrown back', () => {
    const { g, mob } = struck();
    const threat = mob.userData.giantOwlThreat;
    assert.equal(threat.phase, 'warn');
    assert.equal(g.game.giantOwlAngry.length, 1);
    const { wingL, wingR, legL } = mob.userData.modelParts;
    assert.ok(wingL && wingR && legL && mob.userData.legs.length === 2, 'the real model, with its rig');
    const from = { x: mob.position.x, z: mob.position.z };

    // Time to step back: it stands, facing them, with its wings spread, and has not kicked yet.
    g.run(O.warn - 0.1);
    assert.equal(threat.phase, 'warn');
    assert.ok(Math.hypot(mob.position.x - from.x, mob.position.z - from.z) < 0.01, 'it stands while it warns');
    assert.ok(turn(heading(mob), Math.PI) < 0.25, 'facing the player');
    assert.ok(wingL.rotation.z > wingL.userData.baseRotation.z + O.wings * 0.8, 'left wing out');
    assert.ok(wingR.rotation.z < wingR.userData.baseRotation.z - O.wings * 0.8, 'right wing out');
    assert.equal(g.hurt.length, 0);
    assert.equal(g.shoved.length, 0);

    g.run(0.2);
    assert.equal(threat.phase, 'rest');
    assert.equal(g.hurt.length, 1, 'one kick');
    assert.deepEqual({ ...g.hurt[0], source: null }, { amount: O.damage, reason: 'You were kicked by a Cuban giant owl', type: 'mob', source: null });
    assert.ok(Math.abs(g.hurt[0].source.x - mob.position.x) < 1e-9, 'from where it is, for a shield to read');
    // Thrown away from it: the player is at lower x than the owl.
    assert.equal(g.shoved.length, 1);
    assert.ok(g.shoved[0].dirX < 0 && Math.abs(g.shoved[0].dirZ) < 1e-9 && g.shoved[0].strength === O.shove);
    assert.ok(legL.rotation.x < legL.userData.baseRotation.x - O.kick * 0.2, 'its leg is up');

    // Then it stands a moment with its wings folded, and it is over: the list is empty again.
    g.run(O.rest + 0.1);
    assert.ok(mob.userData.giantOwlThreat === null, 'the warning is over');
    assert.equal(g.game.giantOwlAngry.length, 0);
    assert.equal(g.hurt.length, 1);
    assert.ok(g.game.getMobGoal(mob, 1 / 30) === null, 'and it wanders as before');
});

test('whoever steps back in time is not kicked, and a blow from far away costs nothing', () => {
    const { g, mob } = struck();
    g.run(O.warn - 0.2);
    g.stand(mob.position.x - O.reach - 0.3, 0.5);
    g.run(O.rest + 1);
    assert.equal(g.hurt.length, 0);
    assert.equal(g.shoved.length, 0);
    assert.ok(mob.userData.giantOwlThreat === null);

    const far = struck(O.reach + 0.5);
    far.g.run(O.warn + O.rest + 0.5);
    assert.equal(far.g.hurt.length, 0, 'out of reach');
    assert.equal(far.g.game.giantOwlAngry.length, 0);
});

test('a second blow while it warns does not start again, the last blow starts nothing, and one in a cage does not spread its wings', () => {
    const { g, mob } = struck();
    const threat = mob.userData.giantOwlThreat;
    g.run(0.2);
    assert.equal(g.game.damageMobByPlayer(mob, 1), false);
    assert.ok(mob.userData.giantOwlThreat === threat, 'the same warning goes on');
    assert.equal(g.game.giantOwlAngry.length, 1);
    g.run(O.warn + O.rest + 0.5);
    assert.equal(g.hurt.length, 1);

    // The blow that finishes it.
    assert.equal(g.game.damageMobByPlayer(mob, 20), true);
    assert.ok(!mob.userData.giantOwlThreat);
    assert.equal(g.game.giantOwlAngry.length, 0);

    const caged = g.spawn('giant_owl', 1.5, 3.5);
    caged.userData.trapsCage = { position: caged.position.clone() };
    assert.equal(g.game.damageMobByPlayer(caged, 4), false);
    assert.ok(!caged.userData.giantOwlThreat);
});

test('one the server walks warns too, and its goal is asked before the server\'s; nothing is added twice to its wings', () => {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('giant_owl', 1.9, 0.5);
    // As js/game/animals.js marks the body of an animal with no owner that the server sent on a walk.
    Object.assign(mob.userData, { animalId: 7, animalForeign: true, animalMine: false, animalOwnerName: null });
    mob.userData.animal = { id: 7, species: 'giant_owl', mode: MODE.roam, walked: true, walks: true, moving: true, targetX: 1.9, targetZ: 6.5, session: '' };
    const walk = g.game.getMobGoal(mob, 1);
    assert.deepEqual([walk.x, walk.z], [1.9, 6.5], 'the server\'s walk');
    assert.equal(g.game.damageMobByPlayer(mob, 4), false);
    const own = g.game.getMobGoal(mob, 1);
    assert.deepEqual([own.x, own.z, own.stopDistance], [g.camera.position.x, g.camera.position.z, Infinity], 'its own: the player, reached already');
    const providers = [...ctx.MOB_GOAL_PROVIDERS].map(String);
    assert.ok(providers.findIndex((provider) => provider.includes('giantOwlGoal')) < providers.findIndex((provider) => provider.includes('animalsGoal')));

    // The opening is set from where the wing rests, each frame: frames the rig does not run change nothing.
    g.run(O.warn - 0.1);
    const wing = mob.userData.modelParts.wingL;
    const opened = wing.rotation.z;
    for (let i = 0; i < 5; i++) g.game.giantOwlUpdate(0);
    assert.equal(wing.rotation.z, opened);
    g.run(O.rest + 0.5);
    assert.equal(g.hurt.length, 1);
    const back = g.game.getMobGoal(mob, 1);
    assert.deepEqual([back.x, back.z], [1.9, 6.5], 'and back to its walk');
});

test('the line of its kick is in the language of the game', () => {
    const setLang = vm.runInContext('setGameLang', ctx);
    setLang('ES');
    try {
        const { g } = struck();
        g.run(O.warn + 0.1);
        assert.deepEqual(g.hurt.map((blow) => blow.reason), ['Te ha dado una patada un búho gigante de Cuba']);
    } finally {
        setLang('EN');
    }
});
