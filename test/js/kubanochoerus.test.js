// Node tests for the Kubanochoerus (js/game/kubanochoerus.js): what it is, and what it does when struck:
// it turns on the player, lowers its head, and charges. The real mobs.js, camera.js and world.js run on a
// flat world (support/flat_world.js); only drawing and sound are left out. What every extinct animal has
// to be is asked of it by extinct_species.test.js.
// Run with: node --test test/js/kubanochoerus.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame({ listenersOf: ['js/game/kubanochoerus.js'], frameUpdates: ['kubanochoerusUpdate'] });
const K = JSON.parse(vm.runInContext('JSON.stringify(KUBANOCHOERUS)', ctx));
const MODE = vm.runInContext('ANIMALS_MODE', ctx);
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `269_${lang}_Kubanochoerus.md`), 'utf8');
const heading = (mob) => Math.PI / 2 - mob.rotation.y;
const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
// Its row of blocks, to stop it: a fence across its way, or a ditch three deep.
const line = (x, type, ys = [0]) => Object.fromEntries(ys.flatMap((y) => [-3, -2, -1, 0, 1, 2, 3].map((z) => [`${x},${y},${z}`, type])));

// The player at (0.5, 0.5) and the animal 4 blocks away along x, struck once with a bare hand.
function struck(options = {}) {
    const g = makeFlatWorld(ctx, options);
    const mob = g.spawn('kubanochoerus', 4.5, 0.5);
    assert.equal(g.game.damageMobByPlayer(mob, 4), false);
    return { g, mob };
}

test('what it is: a big neutral pig nobody tames, and what its page says of it', () => {
    const info = ctx.getMobSpecies('kubanochoerus');
    assert.equal(info.movement, undefined, 'it walks as any ground mob, so the server walks a kept one');
    assert.equal(info.ancestorOf, 'pig');
    assert.equal(info.hostile, undefined, 'it starts nothing');
    assert.equal(info.mount, undefined);
    assert.equal(ctx.TAMING_DIET.kubanochoerus, undefined);
    assert.equal(ctx.Game.prototype.tamingCanTame.call({}, 'kubanochoerus'), false);
    assert.deepEqual({ ...ctx.TRAPS_SPECIES.kubanochoerus, baits: [...ctx.TRAPS_SPECIES.kubanochoerus.baits] }, { baits: [] });
    assert.ok(info.maxHealth > 2 * ctx.getMobSpecies('pig').maxHealth - 1 && info.speed <= ctx.getMobSpecies('pig').speed);

    // The numbers of its page are those of the code.
    const comma = (number) => String(number).replace('.', ',');
    const es = page('ES');
    const en = page('EN');
    assert.ok(es.includes(`durante ${comma(K.aim)} segundos`) && en.includes(`for ${K.aim} seconds`), 'how long it aims');
    assert.ok(es.includes(`a ${K.pace} bloques por\n  segundo`) && en.includes(`at ${K.pace} blocks a second`), 'how fast it runs');
    assert.equal(Math.round(K.run * K.pace), 3);
    assert.ok(es.includes('unos 3 bloques') && en.includes('about 3 blocks'), 'how far');
    assert.ok(es.includes(`a menos de ${comma(K.reach)} bloques de ti`) && en.includes(`within ${K.reach} blocks of you`), 'how near the horn reaches');
    assert.ok(es.includes(`**${K.damage} de daño**`) && en.includes(`**${K.damage} damage**`));
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 6, 7, 8].map(blows), [6, 4, 4, 3], 'bare-handed, and with a sword of stone, iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 6 golpes a mano, 4 con una [espada](71) de piedra o de hierro, 3 con una de oro`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 6 hits bare-handed, 4 with a stone or an iron [sword](71), 3 with a golden one`));
    // How long it takes to revive is what its fossil says (js/game/fossils.js), and it is a land animal.
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.kubanochoerus)', ctx));
    assert.deepEqual(fossil, { source: 'rock', rarity: 'rare', weight: 1, water: 0, seconds: 45 });
    assert.ok(es.includes(`tarda **${fossil.seconds} segundos**`) && en.includes(`takes **${fossil.seconds} seconds**`));
    assert.ok(es.includes('no necesita agua') && en.includes('needs no water'));
    // And a shield takes its horn as it takes any blow that comes from somewhere (js/game/offhand.js, page 252).
    for (const lang of ['ES', 'EN']) {
        const shield = fs.readFileSync(path.join(STATIC, 'guide', fs.readdirSync(path.join(STATIC, 'guide')).find((name) => name.startsWith(`252_${lang}_`))), 'utf8');
        assert.ok(shield.includes('[Kubanochoerus](269)') && page(lang).includes('](252)'), lang);
    }
});

test('struck, it turns on the player, lowers its head and stands for a moment; then it runs at them: the horn hurts and shoves', () => {
    const { g, mob } = struck();
    const charge = mob.userData.kubanochoerusCharge;
    assert.equal(charge.phase, 'aim');
    assert.deepEqual([...g.game.kubanochoerusAngry], [mob]);
    const head = mob.userData.head;
    assert.ok(head && mob.userData.legs.length === 4, 'the real model, with its rig');
    const from = { x: mob.position.x, z: mob.position.z };

    // Time to step aside: it does not move yet.
    g.run(K.aim - 0.1);
    assert.equal(charge.phase, 'aim');
    assert.ok(Math.hypot(mob.position.x - from.x, mob.position.z - from.z) < 0.01, 'it stands while it aims');
    assert.ok(turn(heading(mob), Math.PI) < 0.15, 'facing the player');
    assert.ok(head.rotation.x > head.userData.baseRotation.x + 0.5, 'head down');
    assert.deepEqual(g.hurt, []);

    g.run(0.2);
    assert.equal(charge.phase, 'run');
    g.run(K.run);
    assert.equal(g.hurt.length, 1, 'one blow');
    assert.deepEqual({ ...g.hurt[0], source: null }, { amount: K.damage, reason: 'You were butted by a kubanochoerus', type: 'mob', source: null });
    assert.ok(Math.abs(g.hurt[0].source.x - mob.position.x) < 1e-9, 'from where it is, for a shield to read');
    assert.equal(g.shoved.length, 1);
    assert.ok(g.shoved[0].dirX < -0.99 && Math.abs(g.shoved[0].dirZ) < 0.1 && g.shoved[0].strength === K.shove, 'pushed on, the way it ran');
    const ran = from.x - mob.position.x;
    assert.ok(ran > 1.5 && ran <= K.run * K.pace + 0.01, `it ran ${ran} blocks`);
    assert.ok(Math.hypot(mob.position.x - g.camera.position.x, mob.position.z - g.camera.position.z) <= K.reach + K.pace / 30, 'and stopped where it reached them');
    assert.equal(charge.phase, 'rest');

    // Then it stands a moment, and it is over: the list is empty again.
    g.run(K.rest + 0.1);
    assert.equal(mob.userData.kubanochoerusCharge, null);
    assert.deepEqual([...g.game.kubanochoerusAngry], []);
    assert.equal(g.hurt.length, 1);
    assert.equal(g.game.getMobGoal(mob, 1 / 30), null, 'and it wanders as before');
});

test('whoever steps aside in time is missed: it runs at where they were', () => {
    const { g, mob } = struck();
    g.run(K.aim + 0.05);
    assert.equal(mob.userData.kubanochoerusCharge.phase, 'run');
    g.stand(0.5, 4.5);
    g.run(K.run + 0.2);
    assert.equal(mob.userData.kubanochoerusCharge.phase, 'rest');
    assert.ok(Math.abs(mob.position.z - 0.5) < 1e-9 && mob.position.x < 4.5 - 2.5, `straight on, past where they stood: ${mob.position.x}, ${mob.position.z}`);
    assert.ok(Math.abs(4.5 - mob.position.x - K.run * K.pace) <= K.pace / 30 + 1e-9, 'as far as it runs, give or take a frame');
    g.run(K.rest + 0.5);
    assert.deepEqual(g.hurt, []);
    assert.deepEqual(g.shoved, []);
    assert.equal(mob.userData.kubanochoerusCharge, null);
    // And from too far away it never gets there.
    const far = struck({ x: -3.5 });
    far.g.run(K.aim + K.run + 0.2);
    assert.equal(far.mob.userData.kubanochoerusCharge.phase, 'rest');
    assert.ok(far.mob.position.x > 4.5 - K.run * K.pace - 0.3, 'it stops short');
    far.g.run(3);
    assert.deepEqual(far.g.hurt, []);
});

test('a fence in its way stops it, and it does not throw itself down a ditch', () => {
    const fenced = struck({ blocks: line(2, 'oak_fence') });
    fenced.g.run(3);
    // (The fence stands in the middle of its cell, from x = 2 to 3.)
    assert.ok(fenced.mob.position.x > 2.7, `it stopped at the fence: ${fenced.mob.position.x}`);
    assert.deepEqual(fenced.g.hurt, []);
    assert.equal(fenced.mob.userData.kubanochoerusCharge, null);

    const ditch = struck({ blocks: line(2, 'air', [-1, -2, -3]) });
    ditch.g.run(K.aim + K.run + 0.1);
    assert.equal(ditch.mob.userData.kubanochoerusCharge.phase, 'rest');
    assert.ok(ditch.mob.position.x >= 3 && ditch.mob.position.y === 0, `it stopped at the edge: ${ditch.mob.position.x}, ${ditch.mob.position.y}`);

    // One block up is a step it takes in its stride.
    const step = struck({ x: 0.5, blocks: { ...line(2, 'grass'), ...line(1, 'grass'), ...line(0, 'grass'), ...line(-1, 'grass') } });
    step.g.camera.position.y += 1;
    step.g.run(K.aim + K.run + 0.1);
    assert.equal(step.g.hurt.length, 1);
    assert.equal(step.mob.position.y, 1);
});

test('the blow that finishes it starts nothing, and one that is gone leaves the list', () => {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('kubanochoerus', 4.5, 0.5);
    assert.equal(g.game.damageMobByPlayer(mob, ctx.getMobSpecies('kubanochoerus').maxHealth), true);
    assert.equal(mob.userData.kubanochoerusCharge, undefined);
    assert.equal(g.game.kubanochoerusAngry, undefined, 'nothing is made until one is angry');
    g.run(1);

    const other = g.spawn('kubanochoerus', 4.5, 3.5);
    g.game.damageMobByPlayer(other, 4);
    g.run(0.2);
    g.game.removeMob(other);
    g.run(0.2);
    assert.deepEqual([...g.game.kubanochoerusAngry], []);
    assert.deepEqual(g.hurt, []);
});

test('struck again while it is at it: still one charge; struck afterwards: another', () => {
    const { g, mob } = struck();
    g.run(0.3);
    g.game.damageMobByPlayer(mob, 4);
    assert.equal(g.game.kubanochoerusAngry.length, 1);
    assert.ok(mob.userData.kubanochoerusCharge.timer < K.aim - 0.25, 'the second blow does not start it over');
    g.run(3);
    assert.equal(g.hurt.length, 1);
    g.game.damageMobByPlayer(mob, 4);
    assert.equal(mob.userData.kubanochoerusCharge.phase, 'aim');
    g.run(3);
    assert.equal(g.hurt.length, 2);
    // Nobody is charged on the title screen, nor while waiting to come back.
    g.game.damageMobByPlayer(mob, 4);
    g.game.respawnPending = true;
    g.run(0.1);
    assert.equal(mob.userData.kubanochoerusCharge, null);
});

test('it does not run out of the reach of its home', () => {
    const { g, mob } = struck();
    // Its home is behind it, nearly as far as it goes: the player is on the other side.
    mob.userData.home.set(4.5 + K.leash - 0.5, 0, 0.5);
    g.run(K.aim + K.run + 0.1);
    assert.ok(4.5 - mob.position.x <= 0.5 + 0.01, `it ran ${4.5 - mob.position.x}`);
    assert.deepEqual(g.hurt, []);
});

test('one the server walks stops its walk to charge: its goal is asked before the server\'s', () => {
    const { g, mob } = struck();
    Object.assign(mob.userData, { animalId: 9, animalForeign: true, animalMine: false, animalOwnerName: null });
    mob.userData.animal = { id: 9, mode: MODE.roam, walked: true, walks: true, moving: true, targetX: 4.5, targetZ: 8.5, session: '' };
    const goal = g.game.getMobGoal(mob, 1 / 30);
    assert.equal(goal, mob.userData.kubanochoerusCharge.goal);
    assert.equal(goal.stopDistance, Infinity, 'a goal it has always reached: mobs.js stands it still, facing it');
    assert.deepEqual([goal.x, goal.z], [g.camera.position.x, g.camera.position.z]);
    g.run(K.aim + K.run + K.rest + 0.2);
    assert.equal(g.hurt.length, 1);
    const walk = g.game.getMobGoal(mob, 1 / 30);
    assert.deepEqual([walk.x, walk.z], [4.5, 8.5], 'and then on with its walk');
});

test('left alone it starts nothing, however near the player stands', () => {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('kubanochoerus', 2.5, 0.5);
    g.run(20);
    assert.deepEqual(g.hurt, []);
    assert.equal(mob.userData.kubanochoerusCharge, undefined);
    assert.equal(g.game.kubanochoerusAngry, undefined);
});
