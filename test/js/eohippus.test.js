// Node tests for the Eohippus (js/game/eohippus.js): the ancestor of the horse, tamed as a horse is and
// never ridden. The real mobs.js, taming.js, riding.js, herd.js, camera.js and world.js run on a flat world
// (support/flat_world.js); only drawing and sound are left out. What every extinct animal has to be is
// asked of it by extinct_species.test.js.
// Run with: node --test test/js/eohippus.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame();
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `268_${lang}_Eohippus.md`), 'utf8');

test('what it is: the horse\'s ancestor, a grazer tamed with what a horse eats, and what its page says of it', () => {
    const info = ctx.getMobSpecies('eohippus');
    const horse = ctx.getMobSpecies('horse');
    assert.equal(info.movement, undefined, 'it walks as any ground mob, so the server walks a kept one');
    assert.equal(info.hiddenUntilDiscovered, true);
    assert.equal(info.ancestorOf, 'horse');
    assert.equal(info.grazer, true);
    assert.equal(info.hostile, undefined);
    assert.equal(info.mount, undefined, 'too small to ride');
    assert.ok(horse.mount, 'which the horse is not');
    assert.deepEqual([...ctx.TAMING_DIET.eohippus.foods], [...ctx.TAMING_DIET.horse.foods], 'the food of a horse');
    assert.equal(ctx.TAMING_DIET.eohippus.chance, 1 / 3);
    assert.ok(ctx.Game.prototype.tamingCanTame.call({}, 'eohippus'));
    assert.deepEqual({ ...ctx.TRAPS_SPECIES.eohippus, baits: [...ctx.TRAPS_SPECIES.eohippus.baits] }, { baits: [], cage: true });

    // The numbers of its page are those of the code.
    const es = page('ES');
    const en = page('EN');
    const blows = Math.ceil(info.maxHealth / 4);
    assert.ok(es.includes(`**${info.maxHealth} de vida**: ${blows} golpes a mano`) && en.includes(`**${info.maxHealth} health**: ${blows} hits bare-handed`));
    assert.ok(es.includes('con **1 de 3** por intento') && en.includes('with **1 in 3** per try'));
    assert.ok(es.includes(`Hay **${info.variants} pelajes**`) && en.includes(`There are **${info.variants} coats**`));
    assert.ok(info.speed > horse.speed, 'a little lighter on its feet than a walking horse, as the page says');
    for (const food of ctx.TAMING_DIET.horse.foods) assert.ok(es.includes(`\`${food}\``) && en.includes(`\`${food}\``), food);
    // How long it takes to revive is what its fossil says (js/game/fossils.js), and it is a land animal.
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.eohippus)', ctx));
    assert.deepEqual(fossil, { source: 'rock', rarity: 'rare', weight: 1, water: 0, seconds: 45 });
    assert.ok(es.includes(`tarda **${fossil.seconds} segundos**`) && en.includes(`takes **${fossil.seconds} seconds**`));
    assert.ok(es.includes('no necesita agua') && en.includes('needs no water'));
});

test('next to a horse it is the size of a small dog: a third as tall, and half as long', () => {
    const g = makeFlatWorld(ctx);
    const small = g.spawn('eohippus', 3.5, 0.5);
    const horse = g.spawn('horse', 6.5, 0.5);
    const dog = g.spawn('dog', 9.5, 0.5);
    const height = (mob) => g.game.herdHeight(mob);
    assert.ok(height(small) > 0.45 && height(small) < 0.7, `${height(small)} blocks tall`);
    assert.ok(height(small) < height(horse) * 0.4 && height(small) < height(dog));
    assert.ok(g.game.herdRadius(small) < g.game.herdRadius(horse) * 0.65);
    // Both colours are built, with the rig the shared animation moves.
    for (const variant of [0, 1]) {
        const mob = g.spawn('eohippus', 3.5, 3.5 + variant, { variant });
        assert.equal(mob.userData.legs.length, 4);
        assert.ok(mob.userData.head && mob.userData.tail.length === 1 && mob.userData.modelParts.earL && mob.userData.modelParts.earR);
    }
});

test('tamed, it follows and sits when asked; a right click never rides it', () => {
    const g = makeFlatWorld(ctx);
    const wild = g.spawn('eohippus', 4.5, 0.5);
    // Nothing to ride: riding.js turns the click down, whoever it is.
    g.game.raycastMob = () => wild;
    assert.equal(g.game.tryMountMob(), false);
    assert.equal(g.game.ridingMob, undefined);
    assert.equal(g.game.tamingUse(wild, null), false, 'an empty hand does nothing to a wild one');

    const pet = g.spawn('eohippus', 8.5, 0.5, { tamed: true });
    g.game.raycastMob = () => pet;
    assert.equal(g.game.tryMountMob(), false);
    g.run(30);
    assert.ok(Math.hypot(pet.position.x - g.camera.position.x, pet.position.z - g.camera.position.z) < 4, 'it came to its owner');
    assert.equal(g.game.tamingUse(pet, null), true);
    assert.equal(pet.userData.tamingSitting, true, 'an empty hand sits it, with no need to crouch: it is no mount');
    const before = { x: pet.position.x, z: pet.position.z };
    g.stand(20.5, 0.5);
    g.run(10);
    assert.ok(Math.hypot(pet.position.x - before.x, pet.position.z - before.z) < 0.01, 'and it waits there');
});
