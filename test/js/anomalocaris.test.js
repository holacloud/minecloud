// Node tests for the anomalocaris (js/game/anomalocaris.js): what it is, and that the 'cruise' movement of every
// sea animal (js/game/sea_animals.js) carries it as its page says: it nips a player who is in its water, leaves
// alone one on the shore, and chases the trilobites of its water without hurting them. The real mobs.js,
// sea_animals.js, camera.js and world.js run on a flat world with a pond dug in it (support/flat_world.js); only
// drawing and sound are left out. What every extinct animal has to be is asked of it by
// extinct_species.test.js, and how the movement itself works by sea_animals.test.js.
// Nothing here hands a mob to an assertion: a failed one would print the whole harness.
// Run with: node --test test/js/anomalocaris.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame();
const SEA = JSON.parse(vm.runInContext('JSON.stringify(SEA)', ctx));
const body = JSON.parse(vm.runInContext("(() => { const b = seaAnimalsBody('anomalocaris'); return JSON.stringify({ front: b.front, back: b.back, half: b.half, height: b.height, length: b.length }); })()", ctx));
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `299_${lang}_Anomalocaris.md`), 'utf8');
const comma = (number) => String(number).replace('.', ',');

// A pond 10 by 8 and 2 deep, its water from y = -2 to y = -1.
function pond() {
    const blocks = {};
    for (let x = 0; x < 10; x++) for (let z = 0; z < 8; z++) for (let y = -2; y <= -1; y++) blocks[`${x},${y},${z}`] = 'water';
    const g = makeFlatWorld(ctx, { x: -3.5, z: 4, blocks, seed: 41 });
    g.world.addRipple = () => {};
    g.game.spawnSplash = () => {};
    g.game.getSelectedHeldItemType = () => null;
    const wet = (x, y, z) => g.world.getBlockTypeAt(Math.floor(x), Math.floor(y), Math.floor(z)) === 'water';
    const swim = (x, z) => { g.camera.position.set(x, 0.3, z); g.cameraController.isInWater = true; };
    const ashore = (x, z) => { g.camera.position.set(x, 1.62, z); g.cameraController.isInWater = false; };
    return { ...g, wet, swim, ashore };
}

test('what it is: a hostile hunter of the Cambrian one block long, and what its page says of it', () => {
    const info = ctx.getMobSpecies('anomalocaris');
    assert.equal(info.movement, 'cruise');
    assert.equal(info.ancestorOf, undefined);
    assert.equal(info.hostile, true);
    assert.equal(info.attackDamage, 1, 'a weak bite');
    assert.ok(info.chaseDistance <= 20 && info.chaseSpeed > info.speed);
    assert.equal(ctx.TAMING_DIET.anomalocaris, undefined);
    assert.equal(JSON.stringify(ctx.TRAPS_SPECIES.anomalocaris), '{"baits":[]}');
    assert.ok(Math.abs(body.length - 1) < 0.1, `${body.length} blocks long`);
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.anomalocaris)', ctx));
    assert.deepEqual(fossil, { source: 'rock', rarity: 'rare', weight: 1, water: 16, seconds: 45 });

    const es = page('ES');
    const en = page('EN');
    assert.ok(es.includes('**1 bloque de\nlargo**') && en.includes('**1 block long**'));
    assert.ok(es.includes(`a menos de **${info.chaseDistance} bloques**`) && en.includes(`within **${info.chaseDistance} blocks**`));
    assert.ok(es.includes(`**${comma(info.chaseSpeed)} bloques por segundo**`) && en.includes(`**${info.chaseSpeed} blocks a second**`));
    assert.ok(es.includes(`**${info.attackDamage} de daño**, como mucho una vez cada ${comma(SEA.biteEvery)} segundos`) && en.includes(`**${info.attackDamage} damage**, at most once every ${SEA.biteEvery} seconds`));
    assert.equal(Math.round(3 + body.length), 4);
    assert.equal(Math.round(3 + body.length + info.chaseDistance), 10);
    assert.ok(es.includes('más de unos 4 bloques') && es.includes('hasta unos 10 bloques') && en.includes('than about 4 blocks') && en.includes('up to about 10 blocks'));
    assert.ok(es.includes(`hasta a ${SEA.preyDistance} bloques`) && en.includes(`up to ${SEA.preyDistance} blocks away`));
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 5, 6, 7, 8].map(blows), [2, 2, 2, 2, 1]);
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 2 golpes a mano o con una [espada](71) de madera, de piedra o de hierro, 1 con una de oro`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 2 hits bare-handed or with a wooden, stone or iron [sword](71), 1 with a golden one`));
    assert.ok(es.includes(`Hay **${info.variants} colores**`) && en.includes(`There are **${info.variants} colours**`));
    assert.ok(es.includes(`**${fossil.water} bloques de agua**`) && en.includes(`**${fossil.water} blocks of water**`));
    assert.ok(es.includes(`tarda ${fossil.seconds} segundos`) && en.includes(`takes ${fossil.seconds} seconds`));
    // The trilobite is the one thing it may chase.
    const prey = vm.runInContext(`Object.keys(MOB_SPECIES).filter((id) => MOB_SPECIES[id].movement === 'cruise' && !MOB_SPECIES[id].hostile && seaAnimalsBody(id).length < seaAnimalsBody('anomalocaris').length * SEA.preyShare).join()`, ctx);
    assert.equal(prey, 'trilobite');
});

test('its model: two spiny arms that wave, eyes on stalks, five pairs of flaps and a tail fan', () => {
    const rig = JSON.parse(vm.runInContext(`(() => {
        const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'skin' });
        const rig = VoxelModels.mobBuilders.anomalocaris.call(VoxelModels, b, 0);
        return JSON.stringify({ rig, names: b.parts.map((part) => part.name) });
    })()`, ctx));
    assert.deepEqual(rig.rig.arms, ['armL', 'armTipL', 'armR', 'armTipR']);
    assert.equal(rig.rig.wings.length, 10);
    assert.deepEqual(rig.rig.tail, ['tail']);
    for (const name of ['eyeL', 'eyeR', 'stalkL', 'stalkR', 'mouth', 'fanL', 'fanR']) assert.ok(rig.names.includes(name), name);
    assert.equal(rig.names.filter((name) => name.startsWith('spine')).length, 8);
});

test('a player in its pond is nipped, even keeping still; on the shore nothing reaches them', () => {
    const g = pond();
    const info = ctx.getMobSpecies('anomalocaris');
    const mob = g.game.seaAnimalsSpawn('anomalocaris', 3.5, -2, 4);
    g.ashore(-1.5, 4);
    for (let i = 0; i < 30 * 30; i++) {
        g.frame();
        assert.ok(g.wet(mob.position.x, mob.position.y + 0.02, mob.position.z), `frame ${i}: its middle is out of the water`);
    }
    assert.equal(g.hurt.length, 0);
    g.swim(6.5, 4);
    g.run(60);
    assert.ok(g.hurt.length >= 8, `${g.hurt.length} nips in a minute at a swimmer who keeps still`);
    assert.ok(g.hurt.every((bite) => bite.amount === info.attackDamage && bite.reason === 'You were bitten by an anomalocaris'));
    g.ashore(-1.5, 4);
    const nips = g.hurt.length;
    g.run(20);
    assert.equal(g.hurt.length, nips);
});

test('it chases the trilobites of its pond and snaps at them; they get away unhurt, and it does not die of it', () => {
    const g = pond();
    g.ashore(-1.5, 4);
    const mob = g.game.seaAnimalsSpawn('anomalocaris', 2.5, -2, 4);
    const trilobites = [g.game.seaAnimalsSpawn('trilobite', 7.5, -2, 2.5), g.game.seaAnimalsSpawn('trilobite', 7.5, -2, 5.5)];
    const sea = mob.userData.sea;
    let snaps = 0;
    for (let i = 0; i < 30 * 120; i++) {
        g.frame();
        if (sea.bite > 0.44) snaps++;
    }
    assert.ok(snaps >= 2, `${snaps} snaps in two minutes`);
    for (const trilobite of trilobites) {
        assert.ok(trilobite.parent !== null, 'still there');
        assert.equal(trilobite.userData.health, trilobite.userData.maxHealth, 'unhurt');
    }
    assert.equal(g.hurt.length, 0);
});
