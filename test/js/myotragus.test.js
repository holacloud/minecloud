// Node tests for the Myotragus (js/game/myotragus.js): a relative of the goat that is tamed as a goat is
// and does nothing else a goat does: it neither leaps nor rams. The real mobs.js, taming.js, herd.js,
// camera.js and world.js run on a flat world (support/flat_world.js); only drawing and sound are left out.
// What every extinct animal has to be is asked of it by extinct_species.test.js.
// (A mob is never handed to assert.equal or deepEqual: a failure would print the whole of the harness.)
// Run with: node --test test/js/myotragus.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame();
// A page as one line: where its sentences are broken is nobody's business.
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `275_${lang}_Myotragus.md`), 'utf8').replace(/\s+/g, ' ');

test('what it is: the goat\'s little cousin, a slow grazer tamed with what a goat eats, and what its page says of it', () => {
    const info = ctx.getMobSpecies('myotragus');
    const goat = ctx.getMobSpecies('goat');
    assert.equal(info.movement, undefined, 'it walks as any ground mob, so the server walks a kept one');
    assert.equal(goat.movement, 'climb', 'and not as a goat: that movement is what leaps and rams (js/game/wildlife.js)');
    assert.equal(info.hiddenUntilDiscovered, true);
    assert.equal(info.ancestorOf, 'goat');
    assert.equal(info.grazer, true);
    assert.equal(info.hostile, undefined);
    assert.equal(info.mount, undefined);
    assert.equal(info.speed, goat.speed / 2, 'half the pace of a goat, as its page says');
    assert.equal(ctx.TAMING_DIET.myotragus.foods.join(), ctx.TAMING_DIET.goat.foods.join(), 'the food of a goat');
    assert.equal(ctx.TAMING_DIET.myotragus.chance, 1 / 3);
    assert.ok(ctx.Game.prototype.tamingCanTame.call({}, 'myotragus'));
    assert.equal(JSON.stringify(ctx.TRAPS_SPECIES.myotragus), '{"baits":[],"cage":true}');

    // The numbers of its page are those of the code.
    const es = page('ES');
    const en = page('EN');
    assert.equal([4, 5, 6, 7, 8].map((damage) => Math.ceil(info.maxHealth / damage)).join(), '3,2,2,2,2', 'bare-handed, and with any sword (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 3 golpes a mano, 2 con una [espada](71).`) && en.includes(`**${info.maxHealth} health**: 3 hits bare-handed, 2 with a [sword](71).`));
    assert.ok(es.includes('con **1 de 3** por intento') && en.includes('with **1 in 3** per try'));
    assert.ok(es.includes(`Hay **${info.variants} pelajes**`) && en.includes(`There are **${info.variants} coats**`));
    for (const food of ctx.TAMING_DIET.goat.foods) assert.ok(es.includes(`\`${food}\``) && en.includes(`\`${food}\``), food);
    // What it leaves, what the shears take, and no milk (js/game/resources.js).
    assert.equal(vm.runInContext('JSON.stringify([RESOURCE_DROPS.myotragus, RESOURCE_FURRY.myotragus, RESOURCE_MILKABLE.myotragus === undefined, RESOURCE_FUR_REGROW])', ctx), '[[["leather",1,1]],true,true,120]');
    assert.ok(es.includes('deja 1 ![cuero](item:leather) `leather`') && es.includes('da 1 ![pelo](item:fur) `fur`, y otro a los 120 segundos') && es.includes('No da leche'));
    assert.ok(en.includes('it leaves 1 ![leather](item:leather) `leather`') && en.includes('gives 1 ![fur](item:fur) `fur`, and another after 120 seconds') && en.includes('It gives no milk'));
    // How long it takes to revive is what its fossil says (js/game/fossils.js), and it is a land animal.
    assert.equal(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.myotragus)', ctx), '{"source":"rock","rarity":"rare","weight":1,"water":0,"seconds":45}');
    assert.ok(es.includes('tarda **45 segundos**') && en.includes('takes **45 seconds**'));
    assert.ok(es.includes('no necesita agua') && en.includes('needs no water'));
});

test('next to a goat it is tiny: it would fit under its belly', () => {
    const g = makeFlatWorld(ctx);
    const small = g.spawn('myotragus', 3.5, 0.5);
    const goat = g.spawn('goat', 6.5, 0.5);
    const height = g.game.herdHeight(small);
    assert.ok(height > 0.45 && height < 0.6, `${height} blocks tall`);
    assert.ok(height < g.game.herdHeight(goat) * 0.45);
    // The legs of the goat of js/models.js are 10 sixteenths of a block long: its belly is that high.
    assert.ok(height < 10 / 16, 'under the belly of a goat, as its page says');
    // Both coats are built, with the rig the shared animation moves.
    for (const variant of [0, 1]) {
        const mob = g.spawn('myotragus', 3.5, 3.5 + variant, { variant });
        assert.equal(mob.userData.legs.length, 4);
        assert.ok(mob.userData.head && mob.userData.tail.length === 1 && mob.userData.modelParts.earL && mob.userData.modelParts.teeth);
    }
});

test('it neither leaps nor rams, however long the player stands near: it keeps its feet on the ground', () => {
    // A ledge two blocks high beside it: a goat would be on top of it sooner or later.
    const blocks = {};
    for (let x = 6; x <= 8; x++) for (let z = -3; z <= 3; z++) for (const y of [0, 1]) blocks[`${x},${y},${z}`] = 'grass';
    const g = makeFlatWorld(ctx, { blocks });
    const mob = g.spawn('myotragus', 4.5, 0.5);
    let highest = 0;
    for (let second = 0; second < 60; second++) {
        g.run(1);
        highest = Math.max(highest, mob.position.y);
    }
    assert.equal(highest, 0, 'never off the ground, never up the ledge');
    assert.equal(g.hurt.length, 0);
    assert.equal(g.shoved.length, 0);
    assert.ok(mob.userData.ram === undefined && !mob.userData.airborne);
});

test('tamed, it follows and sits when asked', () => {
    const g = makeFlatWorld(ctx);
    const pet = g.spawn('myotragus', 8.5, 0.5, { tamed: true });
    g.run(40);
    assert.ok(Math.hypot(pet.position.x - g.camera.position.x, pet.position.z - g.camera.position.z) < 4, 'it came to its owner');
    assert.equal(g.game.tamingUse(pet, null), true);
    assert.equal(pet.userData.tamingSitting, true, 'an empty hand sits it');
    const before = { x: pet.position.x, z: pet.position.z };
    g.stand(20.5, 0.5);
    g.run(10);
    assert.ok(Math.hypot(pet.position.x - before.x, pet.position.z - before.z) < 0.01, 'and it waits there');
});
