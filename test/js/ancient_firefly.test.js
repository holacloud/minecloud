// Node tests for the ancient firefly (js/game/ancient_firefly.js): what it is, how it holds itself in the
// air (it lands and shuts its wing covers when it has nowhere to go) and its light: lit at night and never
// by day, hung from its model so that it comes down with it, and still there after the model is built again.
// The real mobs.js, animals.js, camera.js and world.js run on a flat world (support/flat_world.js); only
// drawing and sound are left out. What every extinct animal has to be is asked of it by
// extinct_species.test.js.
// Nothing here hands a mob to an assertion: a failed one would print the whole harness.
// Run with: node --test test/js/ancient_firefly.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame({ listenersOf: ['js/game/ancient_firefly.js'], frameUpdates: ['ancientFireflyUpdate'] });
const F = JSON.parse(vm.runInContext('JSON.stringify(ANCIENT_FIREFLY)', ctx));
const MODE = vm.runInContext('ANIMALS_MODE', ctx);
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', lang === 'ES' ? '295_ES_Luciérnaga_antigua.md' : '295_EN_Ancient_firefly.md'), 'utf8');
const comma = (number) => String(number).replace('.', ',');

// A firefly the server keeps, with no owner and nowhere to go: it stands where it is (js/game/animals.js).
// The player is far away. `night` says what time it is.
function kept(night = false) {
    const g = makeFlatWorld(ctx, { x: 20.5, z: 0.5 });
    g.game.isNightTime = () => night;
    const mob = g.spawn('ancient_firefly', 2.5, 0.5);
    Object.assign(mob.userData, { animalId: 7, animalForeign: true, animalMine: false, animalOwnerName: null });
    mob.userData.animal = { id: 7, species: 'ancient_firefly', mode: MODE.roam, walked: true, walks: true, moving: false, targetX: 2.5, targetZ: 0.5, session: '' };
    return { g, mob, state: mob.userData.animal };
}
// How far over the floor (y = 0) its model is.
const height = (mob) => mob.position.y + mob.userData.modelRoot.position.y;

test('what it is: one peaceful beetle that hovers, and what its page says of it', () => {
    const info = ctx.getMobSpecies('ancient_firefly');
    assert.equal(info.movement, undefined, 'the ground movement, hovering: a body the server can keep and walk');
    assert.ok(ctx.mobMovementIs(info.movement, 'walksToGoal') && !ctx.mobMovementIs(info.movement, 'bodiless'));
    assert.equal(info.ancestorOf, 'firefly');
    assert.equal(info.hostile, undefined);
    assert.equal(ctx.TAMING_DIET.ancient_firefly, undefined);
    assert.deepEqual({ ...ctx.TRAPS_SPECIES.ancient_firefly, baits: [...ctx.TRAPS_SPECIES.ancient_firefly.baits] }, { baits: [], cage: true });
    assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(RESOURCE_DROPS.ancient_firefly)', ctx)), [['glow_dust', 1, 1]]);

    // Every size of its model is a number of quarters of a unit, so that every face gets its texels (js/models.js).
    const quarters = vm.runInContext(`(() => {
        const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'fur' });
        VoxelModels.mobBuilders.ancient_firefly.call(VoxelModels, b, 0);
        return b.parts.filter((part) => !part.size.every((side) => side >= 0.25 && side * 4 === Math.round(side * 4))).map((part) => part.name).join();
    })()`, ctx);
    assert.equal(quarters, '');

    const es = page('ES');
    const en = page('EN');
    assert.ok(info.flyHeight > 0.8 && info.flyHeight < 1, 'a little under a block');
    assert.ok(es.includes('a algo menos de 1 bloque del suelo') && en.includes('a little under 1 block above the ground'));
    assert.ok(es.includes(`lleva ${F.land} segundos sin tener adónde ir`) && en.includes(`nowhere to go for ${F.land} seconds`), 'when it lands');
    assert.ok(es.includes(`cada ${comma(F.every[0])} a ${comma(F.every[1])} segundos`) && en.includes(`every ${F.every[0]} to\n  ${F.every[1]} seconds`), 'how often it flares');
    assert.ok(F.blink > 0.8 && F.blink < 1, 'nearly a second');
    // Night is what the game calls night (js/game/environment.js): the hours of its page.
    const hours = (timeOfDay) => ctx.Game.prototype.isNightTime.call({ timeOfDay });
    assert.deepEqual([17.9, 18, 23, 0, 5.9, 6, 12].map((hour) => hours(((hour - 6 + 24) % 24) / 24)), [false, true, true, true, true, false, false]);
    assert.ok(es.includes('De **18:00 a 6:00**') && en.includes('From **18:00 to 6:00**'));
    assert.ok(es.includes('1 ![polvo luminoso](item:glow_dust) `glow_dust`') && en.includes('1 ![glow dust](item:glow_dust) `glow_dust`'));
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 5, 6, 7, 8].map(blows), [2, 2, 1, 1, 1], 'bare-handed, and with a sword of wood, stone, iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 2 golpes a mano o con [espada](71) de madera, 1 con una de piedra o mejor`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 2 hits bare-handed or with a wooden [sword](71), 1 with a stone one or better`));
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.ancient_firefly)', ctx));
    assert.deepEqual(fossil, { source: 'amber', rarity: 'rare', weight: 1, water: 0, seconds: 45 });
});

test('its light is where the lantern of its model is', () => {
    // The lantern as the model builds it: where its middle is, in sixteenths of a block, and how big.
    const lantern = JSON.parse(vm.runInContext(`(() => {
        const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'fur' });
        VoxelModels.mobBuilders.ancient_firefly.call(VoxelModels, b, 0);
        const part = b.byName.get('lantern');
        const body = b.byName.get(part.parent);
        return JSON.stringify({ middle: [0, 1, 2].map((axis) => body.pivot[axis] + part.pivot[axis] + part.from[axis] + part.size[axis] / 2), size: part.size });
    })()`, ctx));
    lantern.middle.forEach((value, axis) => assert.ok(Math.abs(value - F.at[axis]) < 1e-9, `axis ${axis}: ${value} and ${F.at[axis]}`));
    lantern.size.forEach((value, axis) => assert.ok(F.size[axis] > value && F.size[axis] <= value + 0.5, `the box of light wraps the lantern: axis ${axis}`));
});

test('by day nothing of its light is drawn; at night it comes on, hung from its model', () => {
    const day = kept(false);
    day.g.run(3);
    const dark = day.mob.userData.ancientFirefly;
    assert.ok(dark.box.visible === false && dark.glow === 0, 'unlit by day');

    const { g, mob } = kept(true);
    assert.equal(g.game.ancientFireflyMobs.length, 1);
    g.run(0.1);
    const light = mob.userData.ancientFirefly;
    assert.ok(light.glow > 0 && light.glow < 0.2, 'it comes on little by little');
    g.run(F.dusk * 4);
    assert.ok(light.glow > 0.95 && light.box.visible === true, 'lit');
    assert.ok(light.box.parent === mob.userData.modelRoot, 'on its model');
    assert.deepEqual([light.box.position.x, light.box.position.y, light.box.position.z], F.at.map((value) => value / 16));
    assert.equal(mob.userData.glowMaterials.length, 1, 'its material is disposed of with the mob (js/game/mobs.js)');
    assert.ok(light.period >= F.every[0] && light.period <= F.every[1]);

    // A change of graphics builds its model again: the light moves to the new one.
    const before = mob.userData.modelRoot;
    g.game.attachMobModel(mob);
    assert.ok(mob.userData.modelRoot !== before);
    g.frame();
    assert.ok(light.box.parent === mob.userData.modelRoot && light.box.visible === true, 'still lit, on the new model');
    assert.ok(mob.userData.ancientFirefly === light, 'the same light: nothing is made twice');

    // Dawn: out again.
    g.game.isNightTime = () => false;
    g.run(F.dusk * 5);
    assert.ok(light.box.visible === false, 'out by day');
});

test('with nowhere to go it lands and shuts its wing covers, lantern and all; sent somewhere, it takes off', () => {
    const { g, mob, state } = kept(true);
    const info = ctx.getMobSpecies('ancient_firefly');
    const parts = mob.userData.modelParts;
    assert.ok(parts.coverL && parts.coverR && parts.wingL && parts.wingR && parts.lantern, 'the real model');
    g.run(1);
    assert.ok(Math.abs(height(mob) - info.flyHeight) <= 0.19, `it hovers at ${height(mob)}`);
    assert.ok(parts.coverL.rotation.x === parts.coverL.userData.baseRotation.x && parts.wingL.scale.x === 1, 'covers lifted, wings out');

    g.run(F.land + 3);
    assert.equal(mob.userData.ancientFirefly.down, 1);
    assert.ok(Math.abs(height(mob)) < 0.01, `its feet on the floor: ${height(mob)}`);
    assert.ok(Math.abs(mob.position.y - info.flyHeight) <= 0.19, 'only its model came down: the mob is where the server has it');
    assert.ok(parts.coverL.rotation.x === 0 && parts.coverL.rotation.y === 0 && parts.coverR.rotation.y === 0, 'covers shut over its back');
    assert.ok(parts.wingL.scale.x < 0.06 && parts.wingR.scale.x < 0.06 && parts.wingL.rotation.z === 0, 'wings drawn in, and still');
    assert.ok(parts.wingL.visible === false && parts.wingR.visible === false, 'and out of sight under the covers');
    assert.ok(mob.userData.ancientFirefly.box.parent === mob.userData.modelRoot && mob.userData.ancientFirefly.box.visible === true, 'and its light came down with it');

    // Frames in which the rig does not run change nothing: its height is set, not added to.
    const landed = mob.userData.modelRoot.position.y;
    for (let i = 0; i < 5; i++) g.game.ancientFireflyUpdate(0);
    assert.equal(mob.userData.modelRoot.position.y, landed);

    Object.assign(state, { moving: true, targetX: 8.5, targetZ: 0.5 });
    g.run(3);
    assert.equal(mob.userData.ancientFirefly.down, 0);
    assert.ok(Math.abs(height(mob) - info.flyHeight) <= 0.2 && mob.position.x > 3.2, 'in the air again, and on its way');
    assert.ok(parts.wingL.scale.x === 1 && parts.wingL.visible === true && parts.coverL.rotation.x === parts.coverL.userData.baseRotation.x);
});

test('struck on the ground it takes off for a while; one in a cage hangs in it; one that is gone leaves the list', () => {
    const { g, mob } = kept();
    const info = ctx.getMobSpecies('ancient_firefly');
    g.run(F.land + 3);
    assert.equal(mob.userData.ancientFirefly.down, 1);
    assert.equal(g.game.damageMobByPlayer(mob, 4), false);
    // What js/game/mobs.js does to a struck ground mob: a hop.
    mob.userData.bounceVelocity = 2.4;
    let lowest = Infinity;
    for (let i = 0; i < 30 * (F.startle + F.land - 1); i++) {
        g.frame();
        if (i > 75) lowest = Math.min(lowest, height(mob));
    }
    assert.equal(mob.userData.ancientFirefly.down, 0, 'still in the air');
    assert.ok(lowest > info.flyHeight - 0.25, `it never sank: ${lowest}`);
    g.run(1 + 3);
    assert.equal(mob.userData.ancientFirefly.down, 1, 'and then it comes down again');

    mob.userData.trapsCage = { position: mob.position.clone() };
    g.frame();
    assert.equal(mob.userData.ancientFirefly.down, 0, 'it does not land through the floor of its cage');
    g.game.removeMob(mob);
    g.frame();
    assert.equal(g.game.ancientFireflyMobs.length, 0);
});
