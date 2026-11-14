// Node tests for the Nuralagus (js/game/nuralagus.js): a relative of the rabbit that does nothing a rabbit
// does: it walks, and it can be tamed. The real mobs.js, taming.js, herd.js, camera.js and world.js run on
// a flat world (support/flat_world.js); only drawing and sound are left out. What every extinct animal has
// to be is asked of it by extinct_species.test.js.
// (A mob is never handed to assert.equal or deepEqual: a failure would print the whole of the harness.)
// Run with: node --test test/js/nuralagus.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame();
// A page as one line: where its sentences are broken is nobody's business.
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `277_${lang}_Nuralagus.md`), 'utf8').replace(/\s+/g, ' ');

test('what it is: the rabbit\'s giant cousin, a slow walker that eats what a rabbit eats and, unlike it, is tamed', () => {
    const info = ctx.getMobSpecies('nuralagus');
    const rabbit = ctx.getMobSpecies('rabbit');
    assert.equal(info.movement, undefined, 'it walks as any ground mob, so the server walks a kept one');
    assert.equal(rabbit.movement, 'burrow', 'and not as a rabbit: that movement is what hops, digs and flees (js/game/rabbit.js)');
    assert.equal(info.hiddenUntilDiscovered, true);
    assert.equal(info.ancestorOf, 'rabbit');
    assert.equal(info.grazer, true);
    assert.equal(info.hostile, undefined);
    assert.equal(info.mount, undefined);
    assert.ok(info.speed < ctx.getMobSpecies('sheep').speed, 'slowly: slower than a sheep');
    assert.equal(ctx.TAMING_DIET.nuralagus.foods.join(), ctx.TAMING_DIET.rabbit.foods.join(), 'the food of a rabbit');
    assert.equal(ctx.TAMING_DIET.nuralagus.chance, 1 / 3);
    assert.ok(ctx.Game.prototype.tamingCanTame.call({}, 'nuralagus'));
    assert.equal(ctx.Game.prototype.tamingCanTame.call({}, 'rabbit'), false, 'which nobody does to a rabbit of today, as its page says');
    assert.equal(JSON.stringify(ctx.TRAPS_SPECIES.nuralagus), '{"baits":[],"cage":true}');

    // The numbers of its page are those of the code.
    const es = page('ES');
    const en = page('EN');
    assert.equal([4, 5, 6, 7, 8].map((damage) => Math.ceil(info.maxHealth / damage)).join(), '3,3,2,2,2', 'bare-handed, and with a sword of wood, stone, iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 3 golpes a mano, 2 con una [espada](71) de piedra o mejor`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 3 hits bare-handed, 2 with a stone [sword](71) or better`));
    assert.ok(es.includes('con **1 de 3** por intento') && en.includes('with **1 in 3** per try'));
    assert.ok(es.includes(`Hay **${info.variants} pelajes**`) && en.includes(`There are **${info.variants} coats**`));
    for (const food of ctx.TAMING_DIET.nuralagus.foods) assert.ok(es.includes(`\`${food}\``) && en.includes(`\`${food}\``), food);
    // What it leaves and what the shears take (js/game/resources.js).
    assert.equal(vm.runInContext('JSON.stringify([RESOURCE_DROPS.nuralagus, RESOURCE_FURRY.nuralagus, RESOURCE_FUR_REGROW])', ctx), '[[["fur",1,2]],true,120]');
    assert.ok(es.includes('deja **1 o 2** ![pelo](item:fur) `fur`') && es.includes('da 1 `fur`, y otro a los 120 segundos'));
    assert.ok(en.includes('it leaves **1 or 2** ![fur](item:fur) `fur`') && en.includes('gives 1 `fur`, and another after 120 seconds'));
    // How long it takes to revive is what its fossil says (js/game/fossils.js), and it is a land animal.
    assert.equal(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.nuralagus)', ctx), '{"source":"rock","rarity":"rare","weight":1,"water":0,"seconds":45}');
    assert.ok(es.includes('tarda **45 segundos**') && en.includes('takes **45 seconds**'));
    assert.ok(es.includes('no necesita agua') && en.includes('needs no water'));
});

test('next to a rabbit: a bigger body under shorter ears', () => {
    const g = makeFlatWorld(ctx);
    const giant = g.spawn('nuralagus', 3.5, 0.5);
    const height = g.game.herdHeight(giant);
    const radius = g.game.herdRadius(giant);
    // The rabbit of js/game/rabbit.js is measured from its model, as the giant is: no rabbit is made here
    // (it would dig its burrow).
    const rabbit = JSON.parse(vm.runInContext('JSON.stringify(herdSpeciesBody("rabbit"))', ctx));
    assert.ok(height > 0.5 && height < 0.65, `${height} blocks tall`);
    assert.ok(height < rabbit.height, 'lower than a rabbit to the tips of its ears');
    assert.ok(radius > rabbit.radius * 1.2, 'and a good deal longer');
    // Both coats are built, with the rig the shared animation moves: four legs to walk on.
    for (const variant of [0, 1]) {
        const mob = g.spawn('nuralagus', 3.5, 3.5 + variant, { variant });
        assert.equal(mob.userData.legs.length, 4);
        assert.ok(mob.userData.head && mob.userData.tail.length === 1 && mob.userData.modelParts.earL && mob.userData.modelParts.earR);
    }
});

test('it walks: never a hop, no burrow, and it does not bolt from a player who walks up to it', () => {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('nuralagus', 4.5, 0.5);
    let highest = 0;
    let furthest = 0;
    let last = { x: mob.position.x, z: mob.position.z };
    for (let tick = 0; tick < 120; tick++) {
        // The player keeps two blocks from it, wherever it goes: a rabbit would be gone at once.
        g.stand(mob.position.x + 2, mob.position.z);
        g.run(0.5);
        highest = Math.max(highest, mob.position.y);
        furthest = Math.max(furthest, Math.hypot(mob.position.x - last.x, mob.position.z - last.z));
        last = { x: mob.position.x, z: mob.position.z };
    }
    assert.equal(highest, 0, 'its feet never leave the ground');
    assert.ok(furthest <= ctx.getMobSpecies('nuralagus').speed * 0.5 + 1e-6, `never faster than its walk: ${furthest} blocks in half a second`);
    assert.ok(!g.game.rabbitBurrows || g.game.rabbitBurrows.length === 0, 'no burrow');
});

test('tamed, it follows and sits when asked', () => {
    const g = makeFlatWorld(ctx);
    const pet = g.spawn('nuralagus', 8.5, 0.5, { tamed: true });
    g.run(40);
    assert.ok(Math.hypot(pet.position.x - g.camera.position.x, pet.position.z - g.camera.position.z) < 4, 'it came to its owner');
    assert.equal(g.game.tamingUse(pet, null), true);
    assert.equal(pet.userData.tamingSitting, true, 'an empty hand sits it');
    const before = { x: pet.position.x, z: pet.position.z };
    g.stand(20.5, 0.5);
    g.run(10);
    assert.ok(Math.hypot(pet.position.x - before.x, pet.position.z - before.z) < 0.01, 'and it waits there');
});
