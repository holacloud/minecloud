// Node tests for the ancient bee (js/game/ancient_bee.js): what it is, and how it holds itself in the air:
// its wings beat while it flies, it comes down and folds them when it has nowhere to go, and it takes off
// to move or when struck. The real mobs.js, animals.js, camera.js and world.js run on a flat world
// (support/flat_world.js); only drawing and sound are left out. What every extinct animal has to be is
// asked of it by extinct_species.test.js.
// Nothing here hands a mob to an assertion: a failed one would print the whole harness.
// Run with: node --test test/js/ancient_bee.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame({ listenersOf: ['js/game/ancient_bee.js'], frameUpdates: ['ancientBeeUpdate'] });
const B = JSON.parse(vm.runInContext('JSON.stringify(ANCIENT_BEE)', ctx));
const MODE = vm.runInContext('ANIMALS_MODE', ctx);
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', lang === 'ES' ? '294_ES_Abeja_antigua.md' : '294_EN_Ancient_bee.md'), 'utf8');

// A bee the server keeps, with no owner and nowhere to go: it stands where it is (js/game/animals.js).
// The player is far away.
function kept(species = 'ancient_bee') {
    const g = makeFlatWorld(ctx, { x: 20.5, z: 0.5 });
    const mob = g.spawn(species, 2.5, 0.5);
    Object.assign(mob.userData, { animalId: 7, animalForeign: true, animalMine: false, animalOwnerName: null });
    mob.userData.animal = { id: 7, species, mode: MODE.roam, walked: true, walks: true, moving: false, targetX: 2.5, targetZ: 0.5, session: '' };
    return { g, mob, state: mob.userData.animal };
}
// How far over the floor (y = 0) its model is.
const height = (mob) => mob.position.y + mob.userData.modelRoot.position.y;

test('what it is: one peaceful bee that hovers, with no colony, and what its page says of it', () => {
    const info = ctx.getMobSpecies('ancient_bee');
    assert.equal(info.movement, undefined, 'the ground movement, hovering: a body the server can keep and walk');
    assert.ok(ctx.mobMovementIs(info.movement, 'walksToGoal') && !ctx.mobMovementIs(info.movement, 'bodiless'));
    assert.equal(info.ancestorOf, 'bee');
    assert.equal(info.hostile, undefined);
    assert.equal(info.attackDamage, undefined, 'it stings nobody');
    assert.equal(ctx.TAMING_DIET.ancient_bee, undefined);
    assert.deepEqual({ ...ctx.TRAPS_SPECIES.ancient_bee, baits: [...ctx.TRAPS_SPECIES.ancient_bee.baits] }, { baits: [], cage: true });
    assert.equal(JSON.parse(vm.runInContext('JSON.stringify(RESOURCE_DROPS.ancient_bee)', ctx)).length, 0, 'no honey, no comb');

    // Every size of its model is a number of quarters of a unit, so that every face gets its texels (js/models.js).
    const quarters = vm.runInContext(`(() => {
        const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'fur' });
        VoxelModels.mobBuilders.ancient_bee.call(VoxelModels, b, 0);
        return b.parts.filter((part) => !part.size.every((side) => side >= 0.25 && side * 4 === Math.round(side * 4))).map((part) => part.name).join();
    })()`, ctx);
    assert.equal(quarters, '');

    const es = page('ES');
    const en = page('EN');
    assert.ok(es.includes(`a ${info.flyHeight} bloque del suelo`) && en.includes(`${info.flyHeight} block above the ground`), 'how high it flies');
    assert.ok(es.includes(`lleva ${B.land} segundos sin tener adónde ir`) && en.includes(`nowhere to go for ${B.land} seconds`), 'when it lands');
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 5, 6, 7, 8].map(blows), [2, 2, 1, 1, 1], 'bare-handed, and with a sword of wood, stone, iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 2 golpes a mano o con [espada](71) de madera, 1 con una de piedra o mejor`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 2 hits bare-handed or with a wooden [sword](71), 1 with a stone one or better`));
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.ancient_bee)', ctx));
    assert.deepEqual(fossil, { source: 'amber', rarity: 'rare', weight: 1, water: 0, seconds: 45 });
    assert.ok(es.includes(`tarda **${fossil.seconds} segundos**`) && en.includes(`takes **${fossil.seconds} seconds**`));
});

test('in the air its wings beat, the two sides as in a mirror, whether it goes somewhere or not', () => {
    const { g, mob } = kept();
    const info = ctx.getMobSpecies('ancient_bee');
    assert.equal(g.game.ancientBeeMobs.length, 1);
    const parts = mob.userData.modelParts;
    assert.ok(parts.wingL && parts.wingR && parts.hindWingL && parts.hindWingR, 'the real model: two pairs of wings');
    assert.equal(mob.userData.wings.length, 0, 'not in the rig: mobs.js only flaps a wing while its owner moves');
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
        g.frame();
        seen.add(parts.wingL.rotation.z.toFixed(3));
        const beat = parts.wingL.rotation.z - parts.wingL.userData.baseRotation.z;
        assert.ok(Math.abs(parts.wingR.rotation.z - parts.wingR.userData.baseRotation.z + beat) < 1e-9, 'mirrored');
        assert.ok(Math.abs(beat) <= B.sweep + 1e-9);
    }
    assert.ok(seen.size > 10, 'it stands in the air, and its wings do not');
    assert.ok(Math.abs(height(mob) - info.flyHeight) <= 0.19, `it hovers at ${height(mob)}`);
});

test('with nowhere to go it lands and folds its wings; sent somewhere, it takes off', () => {
    const { g, mob, state } = kept();
    const info = ctx.getMobSpecies('ancient_bee');
    const parts = mob.userData.modelParts;
    g.run(B.land - 0.5);
    assert.ok(mob.userData.ancientBee.down < 0.01 && Math.abs(height(mob) - info.flyHeight) <= 0.19, 'not yet');
    g.run(0.5 + 3);
    assert.ok(mob.userData.ancientBee.down > 0.99, 'down');
    assert.ok(Math.abs(height(mob)) < 0.01, `its feet on the floor: ${height(mob)}`);
    assert.ok(Math.abs(mob.position.y - info.flyHeight) <= 0.19, 'only its model came down: the mob is where the server has it');
    assert.ok(Math.abs(parts.wingL.rotation.z) < 0.01 && Math.abs(parts.wingR.rotation.z) < 0.01, 'wings flat');
    assert.ok(parts.wingL.rotation.y > 1.3 && parts.wingR.rotation.y < -1.3 && parts.hindWingL.rotation.y > 1.3, 'and folded back');
    const still = parts.wingL.rotation.z;
    g.run(1);
    assert.equal(parts.wingL.rotation.z, still, 'they do not beat on the ground');

    // Frames in which the rig does not run change nothing: its height is set, not added to.
    const landed = mob.userData.modelRoot.position.y;
    for (let i = 0; i < 5; i++) g.game.ancientBeeUpdate(0);
    assert.equal(mob.userData.modelRoot.position.y, landed);

    // The server sends it on a walk: up, and off.
    Object.assign(state, { moving: true, targetX: 8.5, targetZ: 0.5 });
    g.run(2.5);
    assert.ok(mob.userData.ancientBee.down < 0.02 && Math.abs(height(mob) - info.flyHeight) <= 0.2, 'in the air again');
    assert.ok(mob.position.x > 3.5, 'and on its way');
    assert.ok(Math.abs(parts.wingL.rotation.y - parts.wingL.userData.baseRotation.y) < 0.03, 'wings out');
});

test('struck on the ground it takes off and stays up for a while; a blow never drags it down to the floor', () => {
    const { g, mob } = kept();
    const info = ctx.getMobSpecies('ancient_bee');
    g.run(B.land + 3);
    assert.ok(mob.userData.ancientBee.down > 0.99);
    assert.equal(g.game.damageMobByPlayer(mob, 4), false);
    // What js/game/mobs.js does to a struck ground mob: a hop.
    mob.userData.bounceVelocity = 2.4;
    let lowest = Infinity;
    for (let i = 0; i < 30 * (B.startle + B.land - 1); i++) {
        g.frame();
        if (i > 60) lowest = Math.min(lowest, height(mob));
    }
    assert.ok(mob.userData.ancientBee.down < 0.02, 'still in the air');
    assert.ok(lowest > info.flyHeight - 0.25, `it never sank: ${lowest}`);
    assert.ok(mob.userData.bounceVelocity === 0, 'the fall of the hop is dropped');
    g.run(1 + 3);
    assert.ok(mob.userData.ancientBee.down > 0.99, 'and then it comes down again');
});

test('one in a cage hangs in it, and one that is gone leaves the list', () => {
    const { g, mob } = kept();
    g.run(B.land + 3);
    mob.userData.trapsCage = { position: mob.position.clone() };
    g.frame();
    assert.equal(mob.userData.ancientBee.down, 0);
    g.run(B.land + 3);
    assert.equal(mob.userData.ancientBee.down, 0, 'it does not land through the floor of its cage');
    g.game.removeMob(mob);
    g.frame();
    assert.equal(g.game.ancientBeeMobs.length, 0);
});
