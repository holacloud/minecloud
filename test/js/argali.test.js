// Node tests for the giant argali (js/game/argali.js): what it is, and what a ram does when struck: it
// turns on the player, lowers its horns, stamps and rams. The real mobs.js, camera.js and world.js run on a
// flat world (support/flat_world.js); only drawing and sound are left out. What every extinct animal has to
// be is asked of it by extinct_species.test.js.
// (A mob is never handed to assert.equal or deepEqual: a failure would print the whole of the harness.)
// Run with: node --test test/js/argali.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame({ listenersOf: ['js/game/argali.js'], frameUpdates: ['argaliUpdate'] });
const A = JSON.parse(vm.runInContext('JSON.stringify(ARGALI)', ctx));
const MODE = vm.runInContext('ANIMALS_MODE', ctx);
// A page as one line: where its sentences are broken is nobody's business.
const page = (lang, title) => fs.readFileSync(path.join(STATIC, 'guide', `276_${lang}_${title}.md`), 'utf8').replace(/\s+/g, ' ');
const heading = (mob) => Math.PI / 2 - mob.rotation.y;
const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
// Its row of blocks, to stop it: a fence across its way, or a ditch three deep.
const line = (x, type, ys = [0]) => Object.fromEntries(ys.flatMap((y) => [-3, -2, -1, 0, 1, 2, 3].map((z) => [`${x},${y},${z}`, type])));
const angry = (g) => (g.game.argaliAngry ? g.game.argaliAngry.length : 0);
const phase = (mob) => (mob.userData.argaliRam ? mob.userData.argaliRam.phase : null);

// The player at (0.5, 0.5) and the animal 4 blocks away along x, struck once with a bare hand.
function struck(options = {}) {
    const g = makeFlatWorld(ctx, options);
    const mob = g.spawn('argali', 4.5, 0.5);
    assert.equal(g.game.damageMobByPlayer(mob, 4), false);
    return { g, mob };
}

test('what it is: a big neutral sheep nobody tames, and what its page says of it', () => {
    const info = ctx.getMobSpecies('argali');
    const sheep = ctx.getMobSpecies('sheep');
    assert.equal(info.movement, undefined, 'it walks as any ground mob, so the server walks a kept one');
    assert.equal(info.hiddenUntilDiscovered, true);
    assert.equal(info.ancestorOf, 'sheep');
    assert.equal(info.hostile, undefined, 'it starts nothing');
    assert.equal(info.mount, undefined);
    assert.equal(info.variants, undefined, 'one colour');
    assert.equal(ctx.TAMING_DIET.argali, undefined);
    assert.equal(ctx.Game.prototype.tamingCanTame.call({}, 'argali'), false);
    assert.equal(JSON.stringify(ctx.TRAPS_SPECIES.argali), '{"baits":[]}', 'no bait, and too big for a cage');
    assert.ok(info.maxHealth > sheep.maxHealth && info.speed > sheep.speed, 'bigger than a sheep, and a little lighter on its feet');

    // The numbers of its page are those of the code.
    const comma = (number) => String(number).replace('.', ',');
    const es = page('ES', 'Argali_gigante');
    const en = page('EN', 'Giant_argali');
    assert.ok(es.includes(`durante ${comma(A.aim)} segundos`) && en.includes(`for ${A.aim} seconds`), 'how long it stamps');
    assert.ok(es.includes(`a ${A.pace} bloques por segundo`) && en.includes(`at ${A.pace} blocks a second`), 'how fast it runs');
    assert.equal(Math.round(A.run * A.pace), 4);
    assert.ok(es.includes('unos 4 bloques') && en.includes('about 4 blocks'), 'how far');
    assert.ok(es.includes(`a menos de ${comma(A.reach)} bloques de ti`) && en.includes(`within ${A.reach} blocks of you`), 'how near the horns reach');
    assert.ok(es.includes(`**${A.damage} de daño**`) && en.includes(`**${A.damage} damage**`));
    assert.ok(A.rest > 1 && A.rest < 1.5, 'it stands "a little over a second"');
    // The goat throws with 9 (js/game/wildlife.js): the page says the argali throws further.
    const goat = /applyKnockback\(Math\.cos\(data\.facing\), Math\.sin\(data\.facing\), (\d+), (\d+)\)/.exec(fs.readFileSync(path.join(STATIC, 'js', 'game', 'wildlife.js'), 'utf8'));
    assert.ok(goat && A.shove > Number(goat[1]) && A.lift >= Number(goat[2]), 'further than a goat');
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.equal([4, 5, 6, 7, 8].map(blows).join(), '5,4,4,3,3', 'bare-handed, and with a sword of wood, stone, iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 5 golpes a mano, 4 con una [espada](71) de madera o de piedra, 3 con una de hierro o de oro`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 5 hits bare-handed, 4 with a wooden or a stone [sword](71), 3 with an iron or a golden one`));
    // What it leaves, and what the shears take (js/game/resources.js).
    assert.equal(vm.runInContext('JSON.stringify([RESOURCE_DROPS.argali, RESOURCE_FURRY.argali, RESOURCE_FUR_REGROW])', ctx), '[[["leather",1,2],["fur",1,2]],true,120]');
    assert.ok(es.includes('Deja **1 o 2** ![cuero](item:leather) `leather` y **1 o 2** ![pelo](item:fur) `fur`') && es.includes('da 1 `fur`, y otro a los 120 segundos'));
    assert.ok(en.includes('It leaves **1 or 2** ![leather](item:leather) `leather` and **1 or 2** ![fur](item:fur) `fur`') && en.includes('gives 1 `fur`, and another after 120 seconds'));
    // How long it takes to revive is what its fossil says (js/game/fossils.js), and it is a land animal.
    assert.equal(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.argali)', ctx), '{"source":"rock","rarity":"rare","weight":1,"water":0,"seconds":45}');
    assert.ok(es.includes('tarda **45 segundos**') && en.includes('takes **45 seconds**'));
    assert.ok(es.includes('no necesita agua') && en.includes('needs no water'));
    // And it says that the argali is not gone, as its file does.
    assert.ok(es.includes('todavía vive') && en.includes('still lives'));
});

test('it is a ram: taller than a sheep, with two horns of five pieces each on the head its neck carries', () => {
    const g = makeFlatWorld(ctx);
    const ram = g.spawn('argali', 3.5, 0.5);
    const sheep = g.spawn('sheep', 6.5, 0.5);
    // (What measures a model does not turn its parts: the curl of the horns counts as if it stood a little
    // straighter than it does. Its horns end 1.4 blocks up.)
    const height = g.game.herdHeight(ram);
    assert.ok(height > 1.25 && height < 1.6, `${height} blocks tall`);
    assert.ok(height > g.game.herdHeight(sheep) * 1.3);
    assert.ok(ram.userData.healthBar.position.y < 2, 'and its health bar is just over its horns, not a block above them');
    const parts = ram.userData.modelParts;
    assert.equal(ram.userData.legs.length, 4);
    assert.ok(ram.userData.head === parts.neck, 'the rig swings the neck: head and horns go with it');
    for (const side of ['L', 'R']) for (let piece = 0; piece < 5; piece++) assert.ok(parts[`horn${side}${piece}`], `horn${side}${piece}`);
});

test('struck, it turns on the player, lowers its horns and stamps; then it runs at them: the horns hurt a little and throw far', () => {
    const { g, mob } = struck();
    assert.equal(phase(mob), 'aim');
    assert.equal(angry(g), 1);
    assert.ok(g.game.argaliAngry[0] === mob);
    const neck = mob.userData.head;
    const from = { x: mob.position.x, z: mob.position.z };

    // Time to step aside: it does not move yet.
    g.run(A.aim - 0.1);
    assert.equal(phase(mob), 'aim');
    assert.ok(Math.hypot(mob.position.x - from.x, mob.position.z - from.z) < 0.01, 'it stands while it stamps');
    assert.ok(turn(heading(mob), Math.PI) < 0.15, 'facing the player');
    assert.ok(neck.rotation.x > neck.userData.baseRotation.x + 0.45, 'horns down');
    assert.equal(g.hurt.length, 0);

    g.run(0.2);
    assert.equal(phase(mob), 'run');
    g.run(A.run);
    assert.equal(g.hurt.length, 1, 'one blow');
    assert.equal(JSON.stringify({ ...g.hurt[0], source: null }), JSON.stringify({ amount: A.damage, reason: 'You were rammed by a giant argali', type: 'mob', source: null }));
    assert.ok(Math.abs(g.hurt[0].source.x - mob.position.x) < 1e-9, 'from where it is, for a shield to read');
    assert.equal(g.shoved.length, 1);
    assert.ok(g.shoved[0].dirX < -0.99 && Math.abs(g.shoved[0].dirZ) < 0.1, 'pushed on, the way it ran');
    assert.equal(`${g.shoved[0].strength},${g.shoved[0].lift}`, `${A.shove},${A.lift}`);
    const ran = from.x - mob.position.x;
    assert.ok(ran > 1.5 && ran <= A.run * A.pace + 0.01, `it ran ${ran} blocks`);
    assert.ok(Math.hypot(mob.position.x - g.camera.position.x, mob.position.z - g.camera.position.z) <= A.reach + A.pace / 30, 'and stopped where it reached them');
    assert.equal(phase(mob), 'rest');

    // Then it stands a moment, and it is over: the list is empty again.
    g.run(A.rest + 0.1);
    assert.equal(phase(mob), null);
    assert.equal(angry(g), 0);
    assert.equal(g.hurt.length, 1);
    assert.ok(g.game.getMobGoal(mob, 1 / 30) === null, 'and it wanders as before');
});

test('whoever steps aside in time is missed: it runs at where they were', () => {
    const { g, mob } = struck();
    g.run(A.aim + 0.05);
    assert.equal(phase(mob), 'run');
    g.stand(0.5, 4.5);
    g.run(A.run + 0.2);
    assert.equal(phase(mob), 'rest');
    assert.ok(Math.abs(mob.position.z - 0.5) < 1e-9 && mob.position.x < 4.5 - 2.5, `straight on, past where they stood: ${mob.position.x}, ${mob.position.z}`);
    assert.ok(Math.abs(4.5 - mob.position.x - A.run * A.pace) <= A.pace / 30 + 1e-9, 'as far as it runs, give or take a frame');
    g.run(A.rest + 0.5);
    assert.equal(g.hurt.length, 0);
    assert.equal(g.shoved.length, 0);
    assert.equal(phase(mob), null);
    // And from too far away it never gets there.
    const far = struck({ x: -4.5 });
    far.g.run(A.aim + A.run + 0.2);
    assert.equal(phase(far.mob), 'rest');
    assert.ok(far.mob.position.x > 4.5 - A.run * A.pace - 0.3, 'it stops short');
    far.g.run(3);
    assert.equal(far.g.hurt.length, 0);
});

test('a fence in its way stops it, and it does not throw itself down a ditch', () => {
    const fenced = struck({ blocks: line(2, 'oak_fence') });
    fenced.g.run(3);
    // (The fence stands in the middle of its cell, from x = 2 to 3.)
    assert.ok(fenced.mob.position.x > 2.7, `it stopped at the fence: ${fenced.mob.position.x}`);
    assert.equal(fenced.g.hurt.length, 0);
    assert.equal(phase(fenced.mob), null);

    const ditch = struck({ blocks: line(2, 'air', [-1, -2, -3]) });
    ditch.g.run(A.aim + A.run + 0.1);
    assert.equal(phase(ditch.mob), 'rest');
    assert.ok(ditch.mob.position.x >= 3 && ditch.mob.position.y === 0, `it stopped at the edge: ${ditch.mob.position.x}, ${ditch.mob.position.y}`);

    // One block up is a step it takes in its stride.
    const step = struck({ x: 0.5, blocks: { ...line(2, 'grass'), ...line(1, 'grass'), ...line(0, 'grass'), ...line(-1, 'grass') } });
    step.g.camera.position.y += 1;
    step.g.run(A.aim + A.run + 0.1);
    assert.equal(step.g.hurt.length, 1);
    assert.equal(step.mob.position.y, 1);
});

test('the blow that finishes it starts nothing, and one that is gone leaves the list', () => {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('argali', 4.5, 0.5);
    assert.equal(g.game.damageMobByPlayer(mob, ctx.getMobSpecies('argali').maxHealth), true);
    assert.equal(phase(mob), null);
    assert.ok(g.game.argaliAngry === undefined, 'nothing is made until one is angry');
    g.run(1);

    const other = g.spawn('argali', 4.5, 3.5);
    g.game.damageMobByPlayer(other, 4);
    g.run(0.2);
    assert.equal(angry(g), 1);
    g.game.removeMob(other);
    g.run(0.2);
    assert.equal(angry(g), 0);
    assert.equal(g.hurt.length, 0);
});

test('struck again while it is at it: still one ram; struck afterwards: another', () => {
    const { g, mob } = struck();
    g.run(0.3);
    g.game.damageMobByPlayer(mob, 4);
    assert.equal(angry(g), 1);
    assert.ok(mob.userData.argaliRam.timer < A.aim - 0.25, 'the second blow does not start it over');
    g.run(3);
    assert.equal(g.hurt.length, 1);
    g.game.damageMobByPlayer(mob, 4);
    assert.equal(phase(mob), 'aim');
    g.run(3);
    assert.equal(g.hurt.length, 2);
    // Nobody is rammed on the title screen, nor while waiting to come back.
    g.game.damageMobByPlayer(mob, 4);
    g.game.respawnPending = true;
    g.run(0.1);
    assert.equal(phase(mob), null);
    assert.equal(angry(g), 0);
});

test('it does not run out of the reach of its home', () => {
    const { g, mob } = struck();
    // Its home is behind it, nearly as far as it goes: the player is on the other side.
    mob.userData.home.set(4.5 + A.leash - 0.5, 0, 0.5);
    g.run(A.aim + A.run + 0.1);
    assert.ok(4.5 - mob.position.x <= 0.5 + 0.01, `it ran ${4.5 - mob.position.x}`);
    assert.equal(g.hurt.length, 0);
});

test('one the server walks stops its walk to ram: its goal is asked before the server\'s', () => {
    const { g, mob } = struck();
    Object.assign(mob.userData, { animalId: 9, animalForeign: true, animalMine: false, animalOwnerName: null });
    mob.userData.animal = { id: 9, species: 'argali', mode: MODE.roam, walked: true, walks: true, moving: true, targetX: 4.5, targetZ: 8.5, session: '' };
    const goal = g.game.getMobGoal(mob, 1 / 30);
    assert.ok(goal === mob.userData.argaliRam.goal);
    assert.equal(goal.stopDistance, Infinity, 'a goal it has always reached: mobs.js stands it still, facing it');
    assert.equal(`${goal.x},${goal.z}`, `${g.camera.position.x},${g.camera.position.z}`);
    g.run(A.aim + A.run + A.rest + 0.2);
    assert.equal(g.hurt.length, 1);
    const walk = g.game.getMobGoal(mob, 1 / 30);
    assert.equal(`${walk.x},${walk.z}`, '4.5,8.5', 'and then on with its walk');
});

test('left alone it starts nothing, however near the player stands', () => {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('argali', 2.5, 0.5);
    g.run(20);
    assert.equal(g.hurt.length, 0);
    assert.equal(phase(mob), null);
    assert.ok(g.game.argaliAngry === undefined);
});
