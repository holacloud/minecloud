// Node tests for the Titanotylopus (js/game/titanotylopus.js): the giant relative of the camel, tamed as a
// camel is, ridden with numbers of its own and lying down as a camel does. The real mobs.js, taming.js,
// riding.js, herd.js, camera.js and world.js run on a flat world (support/flat_world.js); only drawing and
// sound are left out. What every extinct animal has to be is asked of it by extinct_species.test.js.
// Run with: node --test test/js/titanotylopus.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame();
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `274_${lang}_Titanotylopus.md`), 'utf8');
const info = ctx.getMobSpecies('titanotylopus');

test('what it is: the camel\'s giant relative, tamed with what a camel eats, and what its page says of it', () => {
    const camel = ctx.getMobSpecies('camel');
    assert.equal(info.movement, undefined, 'it walks as any ground mob, so the server walks a kept one');
    assert.equal(info.ancestorOf, 'camel');
    assert.equal(info.grazer, true);
    assert.equal(info.hostile, undefined);
    assert.ok(info.restDrop > camel.restDrop, 'it lies down as the camel does, from higher');
    assert.deepEqual([...ctx.TAMING_DIET.titanotylopus.foods], [...ctx.TAMING_DIET.camel.foods], 'the food of a camel');
    assert.equal(ctx.TAMING_DIET.titanotylopus.chance, 1 / 3);
    assert.ok(ctx.Game.prototype.tamingCanTame.call({}, 'titanotylopus'));
    assert.deepEqual({ ...ctx.TRAPS_SPECIES.titanotylopus, baits: [...ctx.TRAPS_SPECIES.titanotylopus.baits] }, { baits: [] });

    // The numbers of its page are those of the code.
    const es = page('ES');
    const en = page('EN');
    const horse = ctx.getMobSpecies('horse').mount;
    const mount = info.mount;
    const blows = Math.ceil(info.maxHealth / 4);
    assert.ok(es.includes(`**${info.maxHealth} de vida**: ${blows} golpes a mano`) && en.includes(`**${info.maxHealth} health**: ${blows} hits bare-handed`));
    assert.ok(es.includes('con **1 de 3** por intento') && en.includes('with **1 in 3** per try'));
    for (const food of ctx.TAMING_DIET.camel.foods) assert.ok(es.includes(`\`${food}\``) && en.includes(`\`${food}\``), food);
    const comma = (value) => String(value).replace('.', ',');
    const gallop = Math.round(mount.speed * 1.25 * 10) / 10;
    const jump = Math.round(mount.jump * mount.jump / 40);
    assert.ok(en.includes(`| Your eyes, above the ground | **${mount.eyeHeight.toFixed(1)} blocks** | ${horse.eyeHeight.toFixed(1)} blocks |`));
    assert.ok(es.includes(`| Tus ojos, sobre el suelo | **${comma(mount.eyeHeight.toFixed(1))} bloques** | ${comma(horse.eyeHeight.toFixed(1))} bloques |`));
    assert.ok(en.includes(`| Speed, blocks per second | **${mount.speed}** | ${horse.speed} |`) && es.includes(`| Velocidad, bloques por segundo | **${comma(mount.speed)}** | ${horse.speed} |`));
    assert.ok(en.includes(`**${gallop}** | ${horse.speed * 1.25} |`) && es.includes(`**${comma(gallop)}** | ${comma(horse.speed * 1.25)} |`));
    assert.ok(en.includes(`about **${jump} blocks**`) && es.includes(`unos **${jump} bloques**`));
    // The rider's body is as tall as their eyes and a little more (setMount, js/camera.js): so many whole blocks.
    const room = Math.ceil(mount.eyeHeight + 0.2);
    assert.ok(en.includes(`**It needs ${room} free blocks of height**`) && es.includes(`**Necesita ${room} bloques libres de altura**`));
});

test('it is far taller than a camel, and its rider sits on its back, in front of the hump', () => {
    const g = makeFlatWorld(ctx);
    const giant = g.spawn('titanotylopus', 3.5, 0.5);
    const camel = g.spawn('camel', 8.5, 0.5);
    const height = g.game.herdHeight(giant);
    assert.ok(height > 3.2 && height < 3.6, `${height} blocks tall`);
    assert.ok(height > g.game.herdHeight(camel) * 1.5);
    assert.equal(giant.userData.legs.length, 4);
    assert.ok(Boolean(giant.userData.head && giant.userData.tail.length === 1 && giant.userData.modelParts.earL && giant.userData.modelParts.earR), 'the rig the shared animation moves');
    // The seat is the ridge of its back, less what a rider's legs hang (js/game/riding.js seats them at the
    // middle of the model): the hump is all behind that middle.
    const hump = giant.userData.modelParts.hump;
    assert.ok(hump.position.z < 0, 'the hump stands behind the rider');
    assert.ok(info.mount.seat > 1.7 && info.mount.seat < 2.1 && Math.abs(info.mount.eyeHeight - info.mount.seat - 1.62) < 0.01, 'the eyes of somebody sitting there');
});

// No assertion here is ever given a mob (`assert.equal(game.ridingMob, null)`): when such a one fails, node
// writes its message by printing the mob, which in this harness is a graph of stand-ins and of the whole
// world with no end, and the test eats all the memory of the machine instead of failing. Ask a yes or a no.
const rides = (g, mob) => g.game.ridingMob === mob;
const onFoot = (g) => !g.game.ridingMob;

test('a wild one is ridden with a right click, if there is room over it, and Shift gets off', () => {
    // A stone 3 cells over the ground in one column and 4 in another: a roof too low, and one just high enough.
    const g = makeFlatWorld(ctx, { blocks: { '12,3,0': 'stone', '20,4,0': 'stone' } });
    const mob = g.spawn('titanotylopus', 3.5, 0.5);
    g.game.raycastMob = () => mob;
    assert.equal(g.game.tryMountMob(), true);
    assert.ok(rides(g, mob), 'the player is on it');
    assert.equal(g.cameraController.eyeHeight, info.mount.eyeHeight);
    assert.ok(Math.abs(g.camera.position.y - info.mount.eyeHeight) < 0.02, 'the eye is up at the saddle');
    assert.ok(g.said.some((line) => line.startsWith('Riding a titanotylopus')), 'the game says so');
    g.run(1);
    assert.ok(Math.hypot(mob.position.x - g.camera.position.x, mob.position.z - g.camera.position.z) < 0.01, 'the mount is under its rider');
    assert.ok(Math.abs(mob.position.y) < 0.01, 'on the ground');
    g.game.dismount();
    assert.ok(onFoot(g), 'Shift got the player off');
    assert.ok(g.cameraController.eyeHeight < 2, 'on foot again');

    // The helper stands a mob on the highest floor of its column, which under a roof is the roof: each of
    // these is made beside its roof and then put on the ground under it.
    const under = (x) => {
        const giant = g.spawn('titanotylopus', x, 2.5);
        giant.position.set(x, 0, 0.5);
        g.game.raycastMob = () => giant;
        return giant;
    };
    // Under a roof 3 blocks up there is no room for both; with 4 free blocks there is.
    const low = under(12.5);
    assert.equal(g.game.tryMountMob(), true, 'the click is taken');
    assert.ok(onFoot(g) && !rides(g, low), 'and refused');
    assert.ok(g.said.includes('There is no room to ride the titanotylopus here'), 'with its line');
    assert.ok(g.cameraController.eyeHeight < 2, 'the player is as tall as before');
    const high = under(20.5);
    assert.equal(g.game.tryMountMob(), true);
    assert.ok(rides(g, high), 'with 4 free blocks it is ridden');
    g.game.dismount();
    assert.ok(onFoot(g), 'and left');
});

test('tamed: crouching, an empty hand makes it lie down with its legs folded; standing, the click is for riding', () => {
    const g = makeFlatWorld(ctx);
    const pet = g.spawn('titanotylopus', 4.5, 0.5, { tamed: true });
    g.cameraController.isCrouching = false;
    assert.equal(g.game.tamingUse(pet, null), false, 'riding.js takes it');
    g.cameraController.isCrouching = true;
    assert.equal(g.game.tamingUse(pet, null), true);
    assert.equal(pet.userData.tamingSitting, true);
    g.run(4);
    assert.ok(pet.userData.restBlend > 0.9, 'it is down');
    assert.ok(Math.abs(pet.userData.modelRoot.position.y + info.restDrop) < 0.2, 'its belly near the ground');
    assert.ok(Math.abs(Math.abs(pet.userData.legs[0].rotation.x) - Math.PI / 2) < 0.2, 'and its legs folded');
});
