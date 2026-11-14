// Node tests for the Vegavis (js/game/vegavis.js): what it is, a small duck of the ground with nothing of its own
// but its body, and what its page says of it. What every extinct animal has to be is asked of it by
// extinct_species.test.js.
// Run with: node --test test/js/vegavis.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame();
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `278_${lang}_Vegavis.md`), 'utf8');

test('what it is: a peaceful bird of the ground, tamed with what a duck eats, and what its page says of it', () => {
    const info = ctx.getMobSpecies('vegavis');
    const duck = ctx.getMobSpecies('duck');
    assert.equal(info.movement, undefined, 'it walks as any ground mob, so the server walks a kept one');
    assert.equal(info.flyHeight, undefined);
    assert.equal(info.ancestorOf, 'duck');
    assert.equal(info.hostile, undefined);
    assert.equal(info.grazer, true, 'it dabbles when it stands still');
    assert.ok(info.speed < duck.speed && info.speed > duck.speed * 0.8, 'a little slower than a duck');
    assert.deepEqual([...ctx.TAMING_DIET.vegavis.foods], [...ctx.TAMING_DIET.duck.foods], 'what tames a duck');
    assert.equal(ctx.TAMING_DIET.vegavis.chance, 1 / 3);
    assert.ok(ctx.Game.prototype.tamingCanTame.call({}, 'vegavis'));
    assert.deepEqual({ ...ctx.TRAPS_SPECIES.vegavis, baits: [...ctx.TRAPS_SPECIES.vegavis.baits] }, { baits: [], cage: true });

    // Its model: half a block tall, lower and slimmer than the duck, with every size a number of quarters of a unit.
    const model = JSON.parse(vm.runInContext(`(() => {
        const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'feather' });
        VoxelModels.mobBuilders.vegavis.call(VoxelModels, b, 0);
        return JSON.stringify({ odd: b.parts.filter((part) => !part.size.every((side) => side >= 0.25 && side * 4 === Math.round(side * 4))).map((part) => part.name),
            height: herdSpeciesBody('vegavis').height, duck: herdSpeciesBody('duck').height });
    })()`, ctx));
    assert.deepEqual(model.odd, []);
    assert.equal(model.height, 0.5);
    assert.ok(model.height < model.duck);

    // The numbers of its page are those of the code.
    const es = page('ES');
    const en = page('EN');
    const blows = Math.ceil(info.maxHealth / 4);
    assert.ok(es.includes(`**${info.maxHealth} de vida**: ${blows} golpes a mano`) && en.includes(`**${info.maxHealth} health**: ${blows} hits bare-handed`));
    assert.ok(es.includes('con **1 de 3** por intento') && en.includes('with **1 in 3** per try'));
    assert.ok(es.includes(`Hay **${info.variants} colores**`) && en.includes(`There are **${info.variants} colours**`));
    assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify([RESOURCE_DROPS.vegavis, RESOURCE_SHEDS.vegavis, RESOURCE_MOLTERS.vegavis])', ctx)), [[['feather', 1, 2]], ['feather', 0.4, 8], true]);
    assert.ok(es.includes('Deja **1 o 2** `feather`') && en.includes('It leaves **1 or 2** `feather`'));
    assert.ok(es.includes('un **40 %**') && en.includes('a **40 %**') && es.includes('una cada 8 segundos') && en.includes('one every 8 seconds'));
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.vegavis)', ctx));
    assert.deepEqual(fossil, { source: 'rock', rarity: 'rare', weight: 1, water: 0, seconds: 45 });
    assert.ok(es.includes(`tarda **${fossil.seconds} segundos**`) && en.includes(`takes **${fossil.seconds} seconds**`));
    assert.ok(es.includes('no necesita agua') && en.includes('needs no water'));
});

test('it walks about its place and starts nothing: a blow makes it give a start, and no more', () => {
    const g = makeFlatWorld(ctx, { x: 2.5, z: 0.5 });
    const mob = g.spawn('vegavis', 4.5, 0.5);
    const from = { x: mob.position.x, z: mob.position.z };
    g.run(40);
    assert.ok(Math.hypot(mob.position.x - from.x, mob.position.z - from.z) > 0.3, 'it wanders');
    assert.equal(mob.position.y, 0, 'on the ground');
    assert.equal(g.game.damageMobByPlayer(mob, 4), false);
    g.run(10);
    assert.equal(g.hurt.length, 0, 'it never strikes back');
    assert.equal(g.game.damageMobByPlayer(mob, 4), true, 'two blows of a bare hand');
});
