// Node tests for the hell ant (js/game/hell_ant.js): what it is, that it goes after the player and bites as
// any hostile ground mob, and its one habit: jaws that shut upwards while it bites. The real mobs.js,
// camera.js and world.js run on a flat world (support/flat_world.js); only drawing and sound are left out.
// What every extinct animal has to be is asked of it by extinct_species.test.js.
// Nothing here hands a mob to an assertion: a failed one would print the whole harness.
// Run with: node --test test/js/hell_ant.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame({ listenersOf: ['js/game/hell_ant.js'], frameUpdates: ['hellAntUpdate'] });
const H = JSON.parse(vm.runInContext('JSON.stringify(HELL_ANT)', ctx));
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', lang === 'ES' ? '293_ES_Hormiga_infernal.md' : '293_EN_Hell_ant.md'), 'utf8');
const comma = (number) => String(number).replace('.', ',');
const server = fs.readFileSync(path.join(STATIC, '..', '..', 'network', 'animals.go'), 'utf8');
const revival = fs.readFileSync(path.join(STATIC, '..', '..', 'network', 'revival.go'), 'utf8');

test('what it is: one small hostile ant, weaker than any other hunter, and what its page says of it', () => {
    const info = ctx.getMobSpecies('hell_ant');
    assert.equal(info.movement, undefined, 'the ground movement: one ant, and nothing of the anthills');
    assert.equal(info.ancestorOf, 'ant');
    assert.equal(info.hostile, true);
    assert.equal(info.nocturnal, undefined);
    assert.equal(ctx.TAMING_DIET.hell_ant, undefined);
    assert.deepEqual({ ...ctx.TRAPS_SPECIES.hell_ant, baits: [...ctx.TRAPS_SPECIES.hell_ant.baits] }, { baits: [], cage: true });
    assert.equal(JSON.parse(vm.runInContext('JSON.stringify(RESOURCE_DROPS.hell_ant)', ctx)).length, 0, 'it leaves nothing');
    const spider = ctx.getMobSpecies('spider');
    assert.ok(info.attackDamage < spider.attackDamage && info.maxHealth < spider.maxHealth && info.chaseDistance <= 20, 'weak, and fair');

    // Every size of its model is a number of quarters of a unit, so that every face gets its texels (js/models.js).
    const quarters = vm.runInContext(`(() => {
        const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'fur' });
        VoxelModels.mobBuilders.hell_ant.call(VoxelModels, b, 0);
        return b.parts.filter((part) => !part.size.every((side) => side >= 0.25 && side * 4 === Math.round(side * 4))).map((part) => part.name).join();
    })()`, ctx);
    assert.equal(quarters, '');

    // The numbers of its page are those of the code: its own, and the server's rule for letting go.
    const chase = JSON.parse(vm.runInContext('JSON.stringify(animalsChaseOf(getMobSpecies("hell_ant")))', ctx));
    assert.deepEqual(chase, { chase: info.chaseDistance, chaseDay: 0, chaseSpeed: info.chaseSpeed });
    const loose = Number(/animalsChaseLoose = ([\d.]+)/.exec(server)[1]);
    const radius = Number(/"hell_ant":\s*\{[^}]*Radius: ([\d.]+)/.exec(revival)[1]);
    const es = page('ES');
    const en = page('EN');
    assert.ok(es.includes(`a menos de **${info.chaseDistance} bloques**`) && en.includes(`within **${info.chaseDistance} blocks**`), 'from how far it comes');
    assert.ok(es.includes(`**Corre a ${comma(info.chaseSpeed)} bloques por segundo.**`) && en.includes(`**It runs at ${info.chaseSpeed} blocks a second.**`));
    assert.ok(es.includes(`**${info.attackDamage} de\n  daño**`) && en.includes(`**${info.attackDamage} damage**`));
    assert.ok(es.includes(`son ${20 / info.attackDamage} mordiscos`) && en.includes(`that is ${20 / info.attackDamage} bites`));
    assert.ok(es.includes(`a más de ${info.chaseDistance * loose} bloques de ella, o a más de ${radius + info.chaseDistance * loose} bloques de su casa`));
    assert.ok(en.includes(`more than ${info.chaseDistance * loose} blocks from it, or more than ${radius + info.chaseDistance * loose} blocks from its home`));
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 5, 6, 7, 8].map(blows), [2, 2, 1, 1, 1], 'bare-handed, and with a sword of wood, stone, iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 2 golpes a mano o con [espada](71) de madera, 1 con una de piedra o mejor`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 2 hits bare-handed or with a wooden [sword](71), 1 with a stone one or better`));
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.hell_ant)', ctx));
    assert.deepEqual(fossil, { source: 'amber', rarity: 'rare', weight: 1, water: 0, seconds: 45 });
    assert.ok(es.includes(`tarda **${fossil.seconds} segundos**`) && en.includes(`takes **${fossil.seconds} seconds**`));
});

test('a wild one comes for the player from as far as it says, by day, and bites; further away it does not', () => {
    const info = ctx.getMobSpecies('hell_ant');
    const g = makeFlatWorld(ctx);
    const ant = g.spawn('hell_ant', 0.5 + info.chaseDistance - 1, 0.5);
    assert.equal(g.game.hellAntMobs.length, 1);
    // No more than 20 seconds of the game: it has 5 blocks to run at 1.4 a second.
    for (let i = 0; i < 20 * 30 && g.hurt.length === 0; i++) g.frame();
    assert.equal(g.hurt.length, 1, 'it reached them and bit');
    assert.deepEqual({ ...g.hurt[0], source: null }, { amount: info.attackDamage, reason: 'You were attacked by a hell ant', type: 'mob', source: null });
    assert.ok(Math.hypot(ant.position.x - 0.5, ant.position.z - 0.5) < 1.3);

    const far = makeFlatWorld(ctx);
    const other = far.spawn('hell_ant', 0.5 + info.chaseDistance + 14, 0.5);
    far.run(6);
    assert.equal(far.hurt.length, 0);
    assert.ok(Math.hypot(other.position.x - 0.5, other.position.z - 0.5) > info.chaseDistance, 'it never came');
});

test('its jaws shut upwards while it bites, and only work a little the rest of the time', () => {
    const g = makeFlatWorld(ctx);
    const ant = g.spawn('hell_ant', 2.5, 0.5);
    const jawL = ant.userData.modelParts.jawL;
    const jawR = ant.userData.modelParts.jawR;
    assert.ok(jawL && jawR && ant.userData.modelParts.horn && ant.userData.legs.length === 6, 'the real model: a horn, two scythes, six legs');
    const open = jawL.userData.baseRotation.x;

    g.run(0.5);
    assert.ok(Math.abs(jawL.rotation.x - open) <= H.chew + 1e-9 && jawL.rotation.x === jawR.rotation.x, 'held open, working a little');

    for (let i = 0; i < 20 * 30 && g.hurt.length === 0; i++) g.frame();
    assert.equal(g.hurt.length, 1);
    g.run(0.2);
    assert.ok(ant.userData.attackPose > 0, 'still in its bite');
    assert.ok(jawL.rotation.x < open - H.shut * 0.9 && jawR.rotation.x < open - H.shut * 0.9, 'shut: turned up, towards the horn');

    // The bite is over well before the next one (every 1.2 seconds): open again.
    g.run(0.6);
    assert.equal(g.hurt.length, 1);
    assert.ok(Math.abs(jawL.rotation.x - open) <= H.chew + 0.02, 'open again');

    // A model built again (a change of graphics) is moved too, and a hell ant that is gone leaves the list.
    g.game.attachMobModel(ant);
    const rebuilt = ant.userData.modelParts.jawL;
    assert.ok(rebuilt !== jawL);
    g.run(0.2);
    assert.ok(Math.abs(rebuilt.rotation.x - open) <= H.chew + 0.02 && rebuilt.rotation.x !== open);
    g.game.removeMob(ant);
    g.frame();
    assert.equal(g.game.hellAntMobs.length, 0);
});
