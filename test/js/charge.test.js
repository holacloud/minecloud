// Node tests for the charge of the big neutral animals (js/game/charge.js): the mammoth and the triceratops,
// struck, turn on the player, lower their heads and charge once; they stop before their heads go into a
// fence or over a drop, and never far from home. The peaceful giants of the same wave (the deinotherium, the
// glyptodon) do nothing of the sort. The real mobs.js, camera.js and world.js run on a flat world
// (support/flat_world.js); only drawing and sound are left out. What every extinct animal has to be is asked
// of them by extinct_species.test.js.
// Run with: node --test test/js/charge.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame({ listenersOf: ['js/game/charge.js'], frameUpdates: ['chargeUpdate'] });
const MODE = require('node:vm').runInContext('ANIMALS_MODE', ctx);
const CHARGERS = { mammoth: { page: 296, es: 'Mamut', en: 'Mammoth' }, triceratops: { page: 297, es: 'Triceratops', en: 'Triceratops' } };
const rowOf = (id) => JSON.parse(JSON.stringify(ctx.getMobSpecies(id).charge));
// A page with its lines joined: what it says, wherever the lines break.
const page = (id, lang) => fs.readFileSync(path.join(STATIC, 'guide', `${CHARGERS[id].page}_${lang}_${CHARGERS[id][lang.toLowerCase()]}.md`), 'utf8').replace(/\s+/g, ' ');
const heading = (mob) => Math.PI / 2 - mob.rotation.y;
const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
// A row of blocks across its way: a fence, or a ditch three deep.
const line = (x, type, ys = [0]) => Object.fromEntries(ys.flatMap((y) => [-3, -2, -1, 0, 1, 2, 3].map((z) => [`${x},${y},${z}`, type])));

// The player at (0.5, 0.5) and the animal 6 blocks away along x, struck once with a bare hand.
function struck(id, options = {}) {
    const g = makeFlatWorld(ctx, options);
    const mob = g.spawn(id, 6.5, 0.5);
    assert.equal(g.game.damageMobByPlayer(mob, 4), false);
    return { g, mob };
}

test('what they are: two big neutral animals nobody tames, with the numbers their pages say', () => {
    const comma = (number) => String(number).replace('.', ',');
    for (const id of Object.keys(CHARGERS)) {
        const info = ctx.getMobSpecies(id);
        const row = rowOf(id);
        assert.equal(info.movement, undefined, `${id}: it walks as any ground mob, so the server walks a kept one`);
        assert.equal(info.hostile, undefined, `${id}: it starts nothing`);
        assert.equal(info.ancestorOf, undefined);
        assert.equal(ctx.TAMING_DIET[id], undefined);
        assert.deepEqual([...ctx.TRAPS_SPECIES[id].baits], []);
        assert.ok(row.reach > 2 && row.whisker < row.reach && row.damage <= 4 && row.leash <= 12, id);

        const es = page(id, 'ES');
        const en = page(id, 'EN');
        assert.ok(es.includes(`durante ${row.aim} segundo`) && en.includes(`for ${row.aim} second`), `${id}: how long it aims`);
        assert.ok(es.includes(`a ${comma(row.pace)} bloques por`) && en.includes(`at ${row.pace} blocks a second`), `${id}: how fast it runs`);
        assert.equal(Math.round(row.run * row.pace), 4);
        assert.ok(es.includes('unos 4 bloques') && en.includes('about 4 blocks'), `${id}: how far`);
        assert.ok(es.includes(`a menos de ${comma(row.reach)} bloques de ti`) && en.includes(`within ${row.reach} blocks of you`), `${id}: how near the blow reaches`);
        assert.ok(es.includes(`**${row.damage} de daño**`) && en.includes(`**${row.damage} damage**`), id);
        assert.ok(es.includes(`mira ${comma(row.whisker)} bloques por delante`) && en.includes(`it looks ${row.whisker} blocks ahead`), `${id}: where it looks for a wall`);
        // Bare-handed, and with a sword of stone, iron and gold (js/game/mobs.js).
        const [hand, stone, iron, gold] = [4, 6, 7, 8].map((damage) => Math.ceil(info.maxHealth / damage));
        assert.ok(es.includes(`**${info.maxHealth} de vida**: ${hand} golpes a mano, ${stone} con una [espada](71) de piedra, ${iron} con una de hierro, ${gold} con una de oro`), id);
        assert.ok(en.includes(`**${info.maxHealth} health**: ${hand} hits bare-handed, ${stone} with a stone [sword](71), ${iron} with an iron one, ${gold} with a golden one`), id);
        assert.ok(es.includes('](252)') && en.includes('](252)'), `${id}: a shield takes its blow`);
    }
    // The mammoth is a skeleton, and the commonest one.
    const fossil = ctx.getMobSpecies('mammoth') && require('node:vm').runInContext('JSON.stringify(FOSSIL_SPECIES.mammoth)', ctx);
    assert.deepEqual(JSON.parse(fossil), { source: 'skeleton', rarity: 'rare', weight: 6, water: 0, seconds: 45 });
    assert.ok(page('mammoth', 'EN').includes('**45 seconds**') && page('mammoth', 'ES').includes('**45 segundos**'));
});

test('struck, it turns on the player, lowers its head and stands; then it runs at them, and the blow hurts and throws', () => {
    for (const id of Object.keys(CHARGERS)) {
        const row = rowOf(id);
        const { g, mob } = struck(id);
        const run = mob.userData.chargeRun;
        assert.equal(run.phase, 'aim', id);
        assert.equal(g.game.chargeAngry.length, 1);
        const head = mob.userData.head;
        assert.ok(head && mob.userData.legs.length === 4, `${id}: the real model, with its rig`);
        const from = mob.position.x;

        g.run(row.aim - 0.1);
        assert.equal(run.phase, 'aim', id);
        assert.ok(Math.abs(mob.position.x - from) < 0.01, `${id} stands while it aims`);
        assert.ok(turn(heading(mob), Math.PI) < 0.15, `${id}: facing the player`);
        assert.ok(head.rotation.x > head.userData.baseRotation.x + 0.4, `${id}: head down`);
        assert.equal(g.hurt.length, 0);

        g.run(0.2);
        assert.equal(run.phase, 'run', id);
        g.run(row.run);
        assert.equal(g.hurt.length, 1, `${id}: one blow`);
        assert.equal(g.hurt[0].amount, row.damage);
        assert.equal(g.hurt[0].reason, row.reason);
        assert.equal(g.hurt[0].type, 'mob');
        assert.ok(Math.abs(g.hurt[0].source.x - mob.position.x) < 1e-9, 'from where it is, for a shield to read');
        assert.equal(g.shoved.length, 1);
        assert.ok(g.shoved[0].dirX < -0.99 && g.shoved[0].strength === row.shove && g.shoved[0].lift === row.lift, `${id}: thrown on, the way it ran`);
        const gap = mob.position.x - g.camera.position.x;
        // (It sees the player within reach before its step, and takes that step: a frame or two of running inside.)
        assert.ok(gap <= row.reach + 0.01 && gap > row.reach - 2 * row.pace / 30 - 0.01, `${id} stopped where its head reached them: ${gap}`);
        assert.equal(run.phase, 'rest');

        g.run(row.rest + 0.1);
        assert.ok(mob.userData.chargeRun === null, `${id}: it is over`);
        assert.equal(g.game.chargeAngry.length, 0);
        assert.equal(g.hurt.length, 1);
        assert.ok(g.game.getMobGoal(mob, 1 / 30) === null, `${id} wanders as before`);
    }
});

test('whoever steps aside in time is missed: it runs on to where they were, as far as it runs', () => {
    for (const id of Object.keys(CHARGERS)) {
        const row = rowOf(id);
        const { g, mob } = struck(id);
        g.run(row.aim + 0.05);
        assert.equal(mob.userData.chargeRun.phase, 'run', id);
        g.stand(0.5, 6.5);
        g.run(row.run + 0.2);
        assert.equal(mob.userData.chargeRun.phase, 'rest', id);
        assert.ok(Math.abs(mob.position.z - 0.5) < 1e-9, `${id}: straight on`);
        assert.ok(Math.abs(6.5 - mob.position.x - row.run * row.pace) <= row.pace / 30 + 1e-9, `${id}: as far as it runs, give or take a frame: ${6.5 - mob.position.x}`);
        g.run(row.rest + 0.5);
        assert.equal(g.hurt.length, 0);
        assert.equal(g.shoved.length, 0);
    }
});

test('it stops before its head goes into a fence or over a ditch, and climbs a step in its stride', () => {
    for (const id of Object.keys(CHARGERS)) {
        const row = rowOf(id);
        // Its fence is across the way 3 blocks from the player: the animal stops with its head short of it.
        const fenced = struck(id, { blocks: line(3, 'oak_fence') });
        fenced.g.run(row.aim + row.run + 0.1);
        assert.equal(fenced.mob.userData.chargeRun.phase, 'rest', id);
        // (The post stands in the middle of its cell, from x = 3.375 to 3.625.)
        assert.ok(fenced.mob.position.x - row.whisker > 3.6, `${id} stopped short of the fence: ${fenced.mob.position.x}`);
        assert.ok(fenced.mob.position.x - row.whisker < 3.9, `${id} stopped close to it: ${fenced.mob.position.x}`);
        fenced.g.run(row.rest + 0.1);
        assert.equal(fenced.g.hurt.length, 0);
        assert.ok(fenced.mob.userData.chargeRun === null, id);

        const ditch = struck(id, { blocks: line(3, 'air', [-1, -2, -3]) });
        ditch.g.run(row.aim + row.run + 0.1);
        assert.equal(ditch.mob.userData.chargeRun.phase, 'rest', id);
        assert.ok(ditch.mob.position.x - row.whisker >= 3.99 && ditch.mob.position.y === 0, `${id} stopped at the edge: ${ditch.mob.position.x}`);

        // One block up is a step, wherever it is.
        const blocks = {};
        for (let x = -2; x <= 3; x++) Object.assign(blocks, line(x, 'grass'));
        const step = struck(id, { blocks });
        step.g.camera.position.y += 1;
        step.g.run(row.aim + row.run + 0.1);
        assert.equal(step.g.hurt.length, 1, id);
        assert.equal(step.mob.position.y, 1);
    }
});

test('it does not run out of the reach of its home, and one that is finished or gone starts nothing', () => {
    const { g, mob } = struck('mammoth');
    const row = rowOf('mammoth');
    mob.userData.home.set(6.5 + row.leash - 0.5, 0, 0.5);
    g.run(row.aim + row.run + 0.1);
    assert.ok(6.5 - mob.position.x <= 0.5 + 0.01, `it ran ${6.5 - mob.position.x}`);
    assert.equal(g.hurt.length, 0);

    const h = makeFlatWorld(ctx);
    const dead = h.spawn('triceratops', 6.5, 0.5);
    assert.equal(h.game.damageMobByPlayer(dead, ctx.getMobSpecies('triceratops').maxHealth), true);
    assert.equal(dead.userData.chargeRun, undefined);
    assert.equal(h.game.chargeAngry, undefined, 'nothing is made until one is angry');
    const other = h.spawn('mammoth', 6.5, 3.5);
    h.game.damageMobByPlayer(other, 4);
    h.run(0.2);
    h.game.removeMob(other);
    h.run(0.2);
    assert.equal(h.game.chargeAngry.length, 0);
    assert.equal(h.hurt.length, 0);
});

test('one the server walks stops its walk to charge: its goal is asked before the server\'s', () => {
    const { g, mob } = struck('triceratops');
    const row = rowOf('triceratops');
    Object.assign(mob.userData, { animalId: 9, animalForeign: true, animalMine: false, animalOwnerName: null });
    mob.userData.animal = { id: 9, mode: MODE.roam, walked: true, walks: true, moving: true, targetX: 6.5, targetZ: 8.5, session: '' };
    const goal = g.game.getMobGoal(mob, 1 / 30);
    assert.ok(goal === mob.userData.chargeRun.goal, 'its own goal');
    assert.equal(goal.stopDistance, Infinity);
    g.run(row.aim + row.run + row.rest + 0.2);
    assert.equal(g.hurt.length, 1);
    const walk = g.game.getMobGoal(mob, 1 / 30);
    assert.deepEqual([walk.x, walk.z], [6.5, 8.5], 'and then on with its walk');
});

test('left alone they start nothing, and the peaceful giants never charge', () => {
    const g = makeFlatWorld(ctx);
    const mobs = ['mammoth', 'triceratops', 'deinotherium', 'glyptodon'].map((id, i) => g.spawn(id, 4.5, 0.5 + i * 6));
    g.run(10);
    assert.equal(g.hurt.length, 0);
    assert.equal(g.game.chargeAngry, undefined);
    g.game.damageMobByPlayer(mobs[2], 4);
    g.game.damageMobByPlayer(mobs[3], 4);
    g.run(4);
    assert.equal(g.hurt.length, 0);
    assert.equal(g.game.chargeAngry, undefined);
});
