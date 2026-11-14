// Node tests for the dodo (js/game/dodo.js): what it is, and its one habit, walking up to whoever stands
// near. The real mobs.js, taming.js, animals.js, camera.js and world.js run on a flat world
// (support/flat_world.js); only drawing and sound are left out. What every extinct animal has to be is
// asked of it by extinct_species.test.js.
// Run with: node --test test/js/dodo.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { EYE, loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame();
const DODO = JSON.parse(vm.runInContext('JSON.stringify(DODO)', ctx));
const MODE = vm.runInContext('ANIMALS_MODE', ctx);
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `265_${lang}_Dodo.md`), 'utf8');
const distance = (mob, to) => Math.hypot(mob.position.x - to.x, mob.position.z - to.z);
// Where a mob looks, as the direction it would walk in (models face +z).
const heading = (mob) => Math.PI / 2 - mob.rotation.y;
const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test('what it is: a bird of the ground that anybody can tame, with no bait, and what its page says of it', () => {
    const info = ctx.getMobSpecies('dodo');
    assert.equal(info.movement, undefined, 'it walks as any ground mob, so the server walks a kept one');
    assert.ok(ctx.mobMovementIs(info.movement, 'walksToGoal') && ctx.mobMovementIs(info.movement, 'tameable'));
    assert.equal(info.hiddenUntilDiscovered, true);
    assert.equal(info.ancestorOf, undefined);
    assert.equal(info.mount, undefined);
    assert.equal(info.hostile, undefined);
    assert.deepEqual({ ...ctx.TAMING_DIET.dodo, foods: [...ctx.TAMING_DIET.dodo.foods] }, { foods: ['wheat_seeds', 'wheat', 'mushroom_brown', 'flower_red'], chance: 1 / 2 });
    assert.ok(ctx.Game.prototype.tamingCanTame.call({}, 'dodo'));
    assert.deepEqual({ ...ctx.TRAPS_SPECIES.dodo, baits: [...ctx.TRAPS_SPECIES.dodo.baits] }, { baits: [], cage: true });

    // The numbers of its page are those of the code.
    const comma = (number) => String(number).replace('.', ',');
    const es = page('ES');
    const en = page('EN');
    assert.ok(es.includes(`a menos de **${DODO.see} bloques**`) && en.includes(`within **${DODO.see} blocks**`), 'how near');
    assert.ok(es.includes(`Se para a ${comma(DODO.stop)} bloques`) && en.includes(`stops ${DODO.stop} blocks away`), 'how close');
    assert.ok(es.includes(`a menos de **${DODO.leash} bloques** del sitio donde vive`) && en.includes(`within **${DODO.leash} blocks** of the place where it lives`), 'how far from home');
    const blows = Math.ceil(info.maxHealth / 4);
    assert.ok(es.includes(`**${info.maxHealth} de vida**: ${blows} golpes a mano`) && en.includes(`**${info.maxHealth} health**: ${blows} hits bare-handed`));
    assert.ok(es.includes('con **1 de 2** por intento') && en.includes('with **1 in 2** per try'));
    assert.ok(es.includes(`Hay **${info.variants} colores**`) && en.includes(`There are **${info.variants} colours**`));
    // How long it takes to revive is what its fossil says (js/game/fossils.js), and it is a land animal.
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.dodo)', ctx));
    assert.deepEqual(fossil, { source: 'bones', rarity: 'rare', weight: 1, water: 0, seconds: 45 });
    assert.ok(es.includes(`tarda **${fossil.seconds} segundos**`) && en.includes(`takes **${fossil.seconds} seconds**`));
    assert.ok(es.includes('no necesita agua') && en.includes('needs no water'));
});

test('somebody stands near: it walks up to them, stops a step and a half away and looks up at them', () => {
    const g = makeFlatWorld(ctx);
    const dodo = g.spawn('dodo', 5.5, 0.5);
    assert.ok(distance(dodo, g.camera.position) < DODO.see);
    g.run(20);
    const gap = distance(dodo, g.camera.position);
    assert.ok(gap <= DODO.stop + 0.05 && gap > DODO.stop - 0.4, `it stands ${gap} from the player`);
    assert.ok(turn(heading(dodo), Math.atan2(g.camera.position.z - dodo.position.z, g.camera.position.x - dodo.position.x)) < 0.2, 'it faces them');
    assert.ok(dodo.userData.lookPitch < 0, 'and looks up');
    // It stays there for as long as they do, and goes with them when they walk about its home.
    const before = { x: dodo.position.x, z: dodo.position.z };
    g.run(10);
    assert.ok(distance(dodo, before) < 0.05, 'it stands still by them');
    g.stand(0.5, 5.5);
    g.run(20);
    assert.ok(distance(dodo, g.camera.position) <= DODO.stop + 0.05);
});

test('nobody near, or too far up or down: it has no goal of its own, and wanders', () => {
    const g = makeFlatWorld(ctx, { x: 30.5, z: 0.5 });
    const dodo = g.spawn('dodo', 5.5, 0.5);
    assert.equal(g.game.dodoGoal(dodo, 1), null);
    g.stand(5.5 + DODO.see + 0.5, 0.5);
    assert.equal(g.game.dodoGoal(dodo, 1), null, 'a little too far');
    g.stand(5.5 + DODO.see - 0.5, 0.5);
    const goal = g.game.dodoGoal(dodo, 1);
    assert.ok(goal && goal.x === g.camera.position.x && goal.z === g.camera.position.z && goal.stopDistance === DODO.stop);
    // On a roof over it, or down a hole.
    g.camera.position.y = EYE + DODO.tall + 0.5;
    assert.equal(g.game.dodoGoal(dodo, 1), null);
    g.camera.position.y = EYE - DODO.tall - 0.5;
    assert.equal(g.game.dodoGoal(dodo, 1), null);
    g.camera.position.y = EYE + DODO.tall - 0.5;
    assert.ok(g.game.dodoGoal(dodo, 1));
    // Nobody is there on the title screen, nor while the player waits to come back.
    g.game.titleScreenOpen = true;
    assert.equal(g.game.dodoGoal(dodo, 1), null);
    g.game.titleScreenOpen = false;
    g.game.respawnPending = true;
    assert.equal(g.game.dodoGoal(dodo, 1), null);
});

test('it does not leave the surroundings of its home for anybody', () => {
    const g = makeFlatWorld(ctx, { x: 9.5, z: 0.5 });
    const dodo = g.spawn('dodo', 4.5, 0.5);
    dodo.userData.home.set(0.5, 0, 0.5);
    assert.ok(distance(dodo, g.camera.position) < DODO.see && distance({ position: dodo.userData.home }, g.camera.position) > DODO.leash);
    assert.equal(g.game.dodoGoal(dodo, 1), null, 'the player is near it, and too far from where it lives');
    g.stand(0.5 + DODO.leash - 0.5, 0.5);
    assert.ok(g.game.dodoGoal(dodo, 1));
    // Led about inside that circle it goes along, and so it is never taken out of it: it stops short of
    // somebody who is inside, and somebody outside is nobody to it.
    for (const [x, z] of [[7.5, 0.5], [5.5, 5.5], [1.5, 5.5], [-3.5, 3.5], [-5.5, -1], [-1.5, -5], [0.5, -7]]) {
        g.stand(x, z);
        g.run(30);
        assert.ok(distance(dodo, g.camera.position) <= DODO.stop + 0.05, `it came to the player at ${x}, ${z}`);
        assert.ok(distance(dodo, dodo.userData.home) < DODO.leash, `${distance(dodo, dodo.userData.home)} from its home`);
    }
    g.stand(0.5, -DODO.leash - 0.5);
    assert.ok(distance(dodo, g.camera.position) < DODO.see);
    assert.equal(g.game.dodoGoal(dodo, 1), null, 'one step out of the circle, and it does not follow');
});

test('with several players it goes to the nearest, this one or another: every client picks the same one', () => {
    const g = makeFlatWorld(ctx);
    const dodo = g.spawn('dodo', 5.5, 0.5);
    const other = g.avatar('other', 5.5, 3.5);
    let goal = g.game.dodoGoal(dodo, 1);
    assert.deepEqual([goal.x, goal.z], [5.5, 3.5], 'the other player is nearer');
    other.position.set(5.5, 0, -5);
    goal = g.game.dodoGoal(dodo, 1);
    assert.deepEqual([goal.x, goal.z], [g.camera.position.x, g.camera.position.z], 'now this one is');
    // With this player away, it still goes to the other, as it does on the other's screen.
    g.stand(40.5, 0.5);
    goal = g.game.dodoGoal(dodo, 1);
    assert.deepEqual([goal.x, goal.z], [5.5, -5]);
    g.run(20);
    assert.ok(distance(dodo, other.position) <= DODO.stop + 0.05);
    // An avatar that is not shown (its player rides or sits out of sight) is nobody.
    other.visible = false;
    assert.equal(g.game.dodoGoal(dodo, 1), null);
});

test('a pet goes with its owner and one in a cage stays in it: its own goal says nothing', () => {
    const g = makeFlatWorld(ctx);
    const pet = g.spawn('dodo', 4.5, 0.5, { tamed: true });
    assert.equal(g.game.dodoGoal(pet, 1), null);
    assert.notEqual(g.game.getMobGoal(pet, 1), null, 'the goal of a pet is taming.js\'s');
    assert.equal(pet.userData.dodoTowards, undefined);
    const caged = g.spawn('dodo', 4.5, 2.5);
    caged.userData.trapsCage = { position: caged.position.clone() };
    assert.equal(g.game.dodoGoal(caged, 1), null);
});

test('it looks for somebody twice a second, not every frame, and makes one vector for its goal', () => {
    const g = makeFlatWorld(ctx);
    const dodo = g.spawn('dodo', 5.5, 0.5);
    let looks = 0;
    const find = g.game.dodoFindFriend;
    g.game.dodoFindFriend = function (mob) { looks++; return find.call(this, mob); };
    g.run(4);
    assert.ok(looks >= 7 && looks <= 9, `${looks} looks in 4 seconds`);
    const goal = dodo.userData.dodoTowards;
    g.run(4);
    assert.equal(dodo.userData.dodoTowards, goal);
    // A pig, or any other mob, costs one comparison.
    const pig = g.spawn('pig', -4.5, 0.5);
    looks = 0;
    g.game.dodoFindFriend = function () { looks++; return false; };
    for (let i = 0; i < 30; i++) g.game.getMobGoal(pig, 1 / 30);
    assert.equal(looks, 0);
});

test('a dodo the server walks goes where the server says, and to whoever comes near: its goal is asked first', () => {
    const g = makeFlatWorld(ctx, { x: 30.5, z: 0.5 });
    const dodo = g.spawn('dodo', 5.5, 0.5);
    // As js/game/animals.js marks the body of an animal with no owner that the server sent on a walk.
    Object.assign(dodo.userData, { animalId: 7, animalForeign: true, animalMine: false, animalOwnerName: null });
    dodo.userData.animal = { id: 7, mode: MODE.roam, walked: true, walks: true, moving: true, targetX: 5.5, targetZ: 6.5, session: '' };
    const walk = g.game.getMobGoal(dodo, 1);
    assert.deepEqual([walk.x, walk.z], [5.5, 6.5], 'nobody is near: the server\'s walk');
    g.stand(2.5, 0.5);
    const friend = g.game.getMobGoal(dodo, 1);
    assert.equal(friend, dodo.userData.dodoTowards);
    assert.deepEqual([friend.x, friend.z], [2.5, 0.5], 'somebody came: up to them');
    g.stand(30.5, 0.5);
    assert.deepEqual([g.game.getMobGoal(dodo, 1).x, g.game.getMobGoal(dodo, 1).z], [5.5, 6.5], 'they left: back to its walk');
    // Whatever order the scripts load in, its goal is ahead of the one of animals.js.
    const providers = [...ctx.MOB_GOAL_PROVIDERS].map(String);
    const own = providers.findIndex((provider) => provider.includes('dodoGoal'));
    const servers = providers.findIndex((provider) => provider.includes('animalsGoal'));
    assert.ok(own >= 0 && servers >= 0 && own < servers);
});

test('struck, it does not run away: it stays by whoever hit it', () => {
    const g = makeFlatWorld(ctx);
    const dodo = g.spawn('dodo', 3.5, 0.5);
    g.run(6);
    const lethal = g.game.damageMobByPlayer(dodo, 4);
    assert.equal(lethal, false);
    assert.equal(dodo.userData.health, ctx.getMobSpecies('dodo').maxHealth - 4);
    g.run(10);
    assert.ok(distance(dodo, g.camera.position) <= DODO.stop + 0.05);
});
