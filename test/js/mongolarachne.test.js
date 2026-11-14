// Node tests for the Mongolarachne (js/game/mongolarachne.js): what it is, and what it does when struck:
// it turns on the player, lifts its front legs as a warning, and bites whoever is still within reach.
// The real mobs.js, camera.js and world.js run on a flat world (support/flat_world.js); only drawing and
// sound are left out. What every extinct animal has to be is asked of it by extinct_species.test.js.
// Nothing here hands a mob to an assertion: a failed one would print the whole harness.
// Run with: node --test test/js/mongolarachne.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame({ listenersOf: ['js/game/mongolarachne.js'], frameUpdates: ['mongolarachneUpdate'] });
const M = JSON.parse(vm.runInContext('JSON.stringify(MONGOLARACHNE)', ctx));
const MODE = vm.runInContext('ANIMALS_MODE', ctx);
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `290_${lang}_Mongolarachne.md`), 'utf8');
const heading = (mob) => Math.PI / 2 - mob.rotation.y;
const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const comma = (number) => String(number).replace('.', ',');

// The player at (0.5, 0.5) and the spider `away` blocks from them along x, struck once with a bare hand.
function struck(away = 1.2) {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('mongolarachne', 0.5 + away, 0.5);
    assert.equal(g.game.damageMobByPlayer(mob, 4), false);
    return { g, mob };
}

test('what it is: a neutral spider nobody tames, and what its page says of it', () => {
    const info = ctx.getMobSpecies('mongolarachne');
    assert.equal(info.movement, undefined, 'it walks as any ground mob, so the server walks a kept one');
    assert.equal(info.ancestorOf, 'spider');
    assert.equal(info.hostile, undefined, 'it starts nothing');
    assert.equal(ctx.TAMING_DIET.mongolarachne, undefined);
    assert.deepEqual({ ...ctx.TRAPS_SPECIES.mongolarachne, baits: [...ctx.TRAPS_SPECIES.mongolarachne.baits] }, { baits: [], cage: true });
    assert.ok(info.maxHealth <= ctx.getMobSpecies('spider').maxHealth && M.damage < ctx.getMobSpecies('spider').attackDamage, 'no worse than the spider of today');

    // Every size of its model is a number of quarters of a unit, so that every face gets its texels (js/models.js).
    const quarters = vm.runInContext(`(() => {
        const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'fur' });
        VoxelModels.mobBuilders.mongolarachne.call(VoxelModels, b, 0);
        return b.parts.filter((part) => !part.size.every((side) => side >= 0.25 && side * 4 === Math.round(side * 4))).map((part) => part.name).join();
    })()`, ctx);
    assert.equal(quarters, '');

    // The numbers of its page are those of the code.
    const es = page('ES');
    const en = page('EN');
    assert.ok(es.includes(`durante ${comma(M.rear)} segundos`) && en.includes(`for ${M.rear} seconds`), 'how long it warns');
    assert.ok(es.includes(`a menos de ${comma(M.reach)} bloques de ella`) && en.includes(`within ${M.reach} blocks of it`), 'how near it bites');
    assert.ok(es.includes(`A más de ${comma(M.reach)} bloques`) && en.includes(`more than ${M.reach} blocks away`));
    assert.ok(es.includes(`**${M.damage} de daño**`) && en.includes(`**${M.damage} damage**`));
    assert.ok(M.rest > 1 && M.rest < 1.5, 'a little over a second');
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 5, 6, 7, 8].map(blows), [2, 2, 2, 2, 1], 'bare-handed, and with a sword of wood, stone, iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 2 golpes a mano o con una [espada](71); 1 con la espada de oro`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 2 hits bare-handed or with a [sword](71); 1 with a golden sword`));
    const drops = JSON.parse(vm.runInContext('JSON.stringify(RESOURCE_DROPS.mongolarachne)', ctx));
    assert.deepEqual(drops, [['white_wool', 1, 2]]);
    assert.ok(es.includes('**1 o 2** ![lana blanca](item:white_wool) `white_wool`') && en.includes('**1 or 2** ![white wool](item:white_wool) `white_wool`'));
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.mongolarachne)', ctx));
    assert.deepEqual(fossil, { source: 'rock', rarity: 'rare', weight: 1, water: 0, seconds: 45 });
    assert.ok(es.includes(`tarda **${fossil.seconds} segundos**`) && en.includes(`takes **${fossil.seconds} seconds**`));
});

test('struck, it turns on the player and lifts its front legs; whoever stays within reach is bitten once', () => {
    const { g, mob } = struck();
    const threat = mob.userData.mongolarachneThreat;
    assert.equal(threat.phase, 'rear');
    assert.equal(g.game.mongolarachneAngry.length, 1);
    const legL = mob.userData.modelParts.legL0;
    const legR = mob.userData.modelParts.legR0;
    assert.ok(legL && legR && mob.userData.legs.length === 8, 'the real model, with its rig');
    const from = { x: mob.position.x, z: mob.position.z };

    // Time to step back: it stands, facing them, with its front legs up, and has not bitten yet.
    g.run(M.rear - 0.1);
    assert.equal(threat.phase, 'rear');
    assert.ok(Math.hypot(mob.position.x - from.x, mob.position.z - from.z) < 0.01, 'it stands while it warns');
    assert.ok(turn(heading(mob), Math.PI) < 0.2, 'facing the player');
    assert.ok(legL.rotation.z > legL.userData.baseRotation.z + M.lift * 0.8, 'left front leg up');
    assert.ok(legR.rotation.z < legR.userData.baseRotation.z - M.lift * 0.8, 'right front leg up');
    assert.ok(mob.userData.modelRoot.rotation.x < -0.2, 'and the front of its body');
    assert.equal(g.hurt.length, 0);

    g.run(0.2);
    assert.equal(threat.phase, 'rest');
    assert.equal(g.hurt.length, 1, 'one bite');
    assert.deepEqual({ ...g.hurt[0], source: null }, { amount: M.damage, reason: 'You were bitten by a mongolarachne', type: 'mob', source: null });
    assert.ok(Math.abs(g.hurt[0].source.x - mob.position.x) < 1e-9, 'from where it is, for a shield to read');

    // Then it stands a moment with its legs down, and it is over: the list is empty again.
    g.run(M.rest + 0.1);
    assert.ok(mob.userData.mongolarachneThreat === null, 'the warning is over');
    assert.equal(g.game.mongolarachneAngry.length, 0);
    assert.equal(mob.userData.modelRoot.rotation.x, 0);
    assert.equal(g.hurt.length, 1);
    assert.ok(g.game.getMobGoal(mob, 1 / 30) === null, 'and it wanders as before');
});

test('whoever steps back in time is not bitten, and a blow from far away costs nothing', () => {
    const { g, mob } = struck();
    g.run(M.rear - 0.2);
    g.stand(mob.position.x - M.reach - 0.3, 0.5);
    g.run(M.rest + 1);
    assert.equal(g.hurt.length, 0);
    assert.ok(mob.userData.mongolarachneThreat === null);

    const far = struck(M.reach + 0.5);
    far.g.run(M.rear + M.rest + 0.5);
    assert.equal(far.g.hurt.length, 0, 'out of reach');
    assert.equal(far.g.game.mongolarachneAngry.length, 0);
});

test('a second blow while it warns does not start again, the last blow starts nothing, and one in a cage does not rear', () => {
    const { g, mob } = struck();
    const threat = mob.userData.mongolarachneThreat;
    g.run(0.2);
    assert.equal(g.game.damageMobByPlayer(mob, 1), false);
    assert.ok(mob.userData.mongolarachneThreat === threat, 'the same warning goes on');
    assert.equal(g.game.mongolarachneAngry.length, 1);
    g.run(M.rear + M.rest + 0.5);
    assert.equal(g.hurt.length, 1);

    // The blow that finishes it.
    assert.equal(g.game.damageMobByPlayer(mob, 10), true);
    assert.ok(!mob.userData.mongolarachneThreat);
    assert.equal(g.game.mongolarachneAngry.length, 0);

    const caged = g.spawn('mongolarachne', 1.5, 3.5);
    caged.userData.trapsCage = { position: caged.position.clone() };
    assert.equal(g.game.damageMobByPlayer(caged, 4), false);
    assert.ok(!caged.userData.mongolarachneThreat);
});

test('one the server walks warns too, and its goal is asked before the server\'s; nothing is added twice to its legs', () => {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('mongolarachne', 1.7, 0.5);
    // As js/game/animals.js marks the body of an animal with no owner that the server sent on a walk.
    Object.assign(mob.userData, { animalId: 7, animalForeign: true, animalMine: false, animalOwnerName: null });
    mob.userData.animal = { id: 7, species: 'mongolarachne', mode: MODE.roam, walked: true, walks: true, moving: true, targetX: 1.7, targetZ: 6.5, session: '' };
    const walk = g.game.getMobGoal(mob, 1);
    assert.deepEqual([walk.x, walk.z], [1.7, 6.5], 'the server\'s walk');
    assert.equal(g.game.damageMobByPlayer(mob, 4), false);
    const own = g.game.getMobGoal(mob, 1);
    assert.deepEqual([own.x, own.z, own.stopDistance], [g.camera.position.x, g.camera.position.z, Infinity], 'its own: the player, reached already');
    const providers = [...ctx.MOB_GOAL_PROVIDERS].map(String);
    assert.ok(providers.findIndex((provider) => provider.includes('mongolarachneGoal')) < providers.findIndex((provider) => provider.includes('animalsGoal')));

    // The lift is set from where the leg rests, each frame: frames the rig does not run change nothing.
    g.run(M.rear - 0.1);
    const leg = mob.userData.modelParts.legL0;
    const lifted = leg.rotation.z;
    for (let i = 0; i < 5; i++) g.game.mongolarachneUpdate(0);
    assert.equal(leg.rotation.z, lifted);
    g.run(M.rest + 0.5);
    assert.equal(g.hurt.length, 1);
    const back = g.game.getMobGoal(mob, 1);
    assert.deepEqual([back.x, back.z], [1.7, 6.5], 'and back to its walk');
});
