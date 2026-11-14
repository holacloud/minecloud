// Node tests for the meganeura (js/game/meganeura.js): what it is, and how it holds itself in the air: its four
// wings beat while it flies, the hind pair out of step with the front one; it comes down when it has nowhere to
// go and rests with its wings spread flat, as a dragonfly does; and it takes off to move or when struck. The
// real mobs.js, animals.js, camera.js and world.js run on a flat world (support/flat_world.js); only drawing and
// sound are left out. What every extinct animal has to be is asked of it by extinct_species.test.js.
// Nothing here hands a mob to an assertion: a failed one would print the whole harness.
// Run with: node --test test/js/meganeura.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame({ listenersOf: ['js/game/meganeura.js'], frameUpdates: ['meganeuraUpdate'] });
const M = JSON.parse(vm.runInContext('JSON.stringify(MEGANEURA)', ctx));
const MODE = vm.runInContext('ANIMALS_MODE', ctx);
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `300_${lang}_Meganeura.md`), 'utf8');

// One the server keeps, with no owner and nowhere to go: it stands where it is (js/game/animals.js). The
// player is far away.
function kept() {
    const g = makeFlatWorld(ctx, { x: 20.5, z: 0.5 });
    const mob = g.spawn('meganeura', 2.5, 0.5);
    Object.assign(mob.userData, { animalId: 9, animalForeign: true, animalMine: false, animalOwnerName: null });
    mob.userData.animal = { id: 9, species: 'meganeura', mode: MODE.roam, walked: true, walks: true, moving: false, targetX: 2.5, targetZ: 0.5, session: '' };
    return { g, mob, state: mob.userData.animal };
}
const height = (mob) => mob.position.y + mob.userData.modelRoot.position.y;

test('what it is: a peaceful giant griffinfly that hovers low, 0.7 blocks across the wings, and what its page says of it', () => {
    const info = ctx.getMobSpecies('meganeura');
    assert.equal(info.movement, undefined, 'the ground movement, hovering: a body the server can keep and walk');
    assert.ok(ctx.mobMovementIs(info.movement, 'walksToGoal') && !ctx.mobMovementIs(info.movement, 'bodiless'));
    assert.equal(info.hostile, undefined);
    assert.equal(info.ancestorOf, undefined);
    assert.equal(ctx.TAMING_DIET.meganeura, undefined);
    assert.equal(JSON.stringify(ctx.TRAPS_SPECIES.meganeura), '{"baits":[],"cage":true}');
    // Its wingspan, from the tip of one fore wing to the other, as built.
    const span = vm.runInContext(`(() => {
        const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'fur' });
        VoxelModels.mobBuilders.meganeura.call(VoxelModels, b, 0);
        const wing = b.byName.get('wingL');
        return 2 * (wing.pivot[0] + wing.from[0] + wing.size[0]) / 16;
    })()`, ctx);
    assert.ok(Math.abs(span - 0.7) < 0.03, `${span} blocks across the wings`);
    const es = page('ES');
    const en = page('EN');
    assert.ok(es.includes(`a ${String(info.flyHeight).replace('.', ',')} bloques del suelo`) && en.includes(`${info.flyHeight} blocks above the ground`), 'how high it flies');
    assert.ok(es.includes(`a ${String(info.speed).replace('.', ',')} bloques por segundo`) && en.includes(`at ${info.speed} blocks a\n  second`), 'how fast');
    assert.ok(es.includes(`lleva ${M.land} segundos sin tener adónde ir`) && en.includes(`nowhere to go for ${M.land} seconds`), 'when it lands');
    assert.ok(es.includes('**0,7 bloques**') && en.includes('**0.7 blocks**'));
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 5, 6, 7, 8].map(blows), [2, 2, 1, 1, 1]);
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 2 golpes a mano o con una [espada](71) de madera, 1 con una de piedra o mejor`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 2 hits bare-handed or with a wooden [sword](71), 1 with a stone one or better`));
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.meganeura)', ctx));
    assert.deepEqual(fossil, { source: 'rock', rarity: 'rare', weight: 1, water: 0, seconds: 45 });
    assert.ok(es.includes(`tarda **${fossil.seconds} segundos**`) && en.includes(`takes **${fossil.seconds}\n   seconds**`));
});

test('in the air its four wings beat, the two sides as in a mirror and the hind pair out of step with the front one', () => {
    const { g, mob } = kept();
    const info = ctx.getMobSpecies('meganeura');
    const parts = mob.userData.modelParts;
    assert.equal(mob.userData.wings.length, 4, 'its rig names the four: mobs.js leaves four alone');
    const beat = (wing) => wing.rotation.z - wing.userData.baseRotation.z;
    let apart = 0;
    for (let i = 0; i < 30; i++) {
        g.frame();
        assert.ok(Math.abs(beat(parts.wingL) + beat(parts.wingR)) < 1e-9, 'mirrored');
        assert.ok(Math.abs(beat(parts.wingL)) <= M.sweep + 1e-9);
        if (Math.abs(beat(parts.wingL) - beat(parts.hindWingL)) > 0.05) apart++;
    }
    assert.ok(apart > 20, 'the hind pair beats out of step');
    assert.ok(Math.abs(height(mob) - info.flyHeight) <= 0.19, `it hovers at ${height(mob)}`);
});

test('with nowhere to go it lands with its wings spread flat; sent somewhere, it takes off; struck, it stays up', () => {
    const { g, mob, state } = kept();
    const info = ctx.getMobSpecies('meganeura');
    const parts = mob.userData.modelParts;
    g.run(M.land - 0.5);
    assert.ok(mob.userData.meganeura.down < 0.01, 'not yet');
    g.run(0.5 + 3);
    assert.ok(mob.userData.meganeura.down > 0.99, 'down');
    assert.ok(Math.abs(height(mob)) < 0.01, `its feet on the floor: ${height(mob)}`);
    assert.ok(Math.abs(mob.position.y - info.flyHeight) <= 0.19, 'only its model came down: the mob is where the server has it');
    // Spread, not folded: the wings point out as in flight, flat and drooping a little, and still.
    for (const name of ['wingL', 'wingR', 'hindWingL', 'hindWingR']) {
        const wing = parts[name];
        assert.ok(Math.abs(wing.rotation.y - wing.userData.baseRotation.y) < 1e-9, `${name} spread`);
        assert.ok(Math.abs(wing.rotation.z - wing.userData.baseRotation.z) < 0.11, `${name} flat`);
    }
    const still = parts.wingL.rotation.z;
    g.run(1);
    assert.equal(parts.wingL.rotation.z, still, 'they do not beat on the ground');
    Object.assign(state, { moving: true, targetX: 8.5, targetZ: 0.5 });
    g.run(2.5);
    assert.ok(mob.userData.meganeura.down < 0.02 && Math.abs(height(mob) - info.flyHeight) <= 0.2, 'in the air again');
    assert.ok(mob.position.x > 3.5, 'and on its way');
    // A blow keeps it in the air for a while.
    Object.assign(state, { moving: false });
    g.run(M.land + 3);
    assert.ok(mob.userData.meganeura.down > 0.99);
    assert.equal(g.game.damageMobByPlayer(mob, 4), false);
    g.run(2);
    assert.ok(mob.userData.meganeura.down < 0.5, 'up it goes');
});
