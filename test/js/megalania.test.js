// Node tests for the Megalania (js/game/megalania.js): what it is, that it hunts as any hostile ground mob,
// and its one habit, the tongue it flicks. The real mobs.js, camera.js and world.js run on a flat world
// (support/flat_world.js); only drawing and sound are left out. What every extinct animal has to be is asked
// of it by extinct_species.test.js.
// Run with: node --test test/js/megalania.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame({ listenersOf: ['js/game/megalania.js'], frameUpdates: ['megalaniaUpdate'] });
const M = JSON.parse(vm.runInContext('JSON.stringify(MEGALANIA)', ctx));
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `285_${lang}_Megalania.md`), 'utf8');
const comma = (number) => String(number).replace('.', ',');

test('what it is: a hostile lizard of the ground movement, four blocks long, and what its page says of it', () => {
    const info = ctx.getMobSpecies('megalania');
    assert.equal(info.movement, undefined, 'it walks as any ground mob, so the server walks a kept one');
    assert.ok(ctx.mobMovementIs(info.movement, 'walksToGoal'));
    assert.equal(info.ancestorOf, 'lizard');
    assert.equal(info.hostile, true);
    assert.equal(info.poison, undefined, 'no venom in the game: nobody knows if it had any');
    assert.ok(info.chaseDistance <= 20 && info.chaseSpeed > info.speed);
    assert.ok(info.keepDistance < 1.2, 'it stops where its bite still reaches (js/game/mobs.js bites within 1.2)');
    assert.equal(ctx.TAMING_DIET.megalania, undefined);
    assert.equal(ctx.Game.prototype.tamingCanTame.call({}, 'megalania'), false);
    assert.equal(JSON.stringify(ctx.TRAPS_SPECIES.megalania), '{"baits":[]}');

    // The numbers of its page are those of the code.
    const es = page('ES');
    const en = page('EN');
    assert.ok(es.includes('**4 bloques de largo**') && en.includes('**4 blocks long**'));
    assert.ok(es.includes(`a menos de **${info.chaseDistance} bloques**`) && en.includes(`within **${info.chaseDistance} blocks**`), 'from how far it comes');
    assert.ok(es.includes(`a **${comma(info.chaseSpeed)} bloques por\n  segundo**`) && en.includes(`at **${info.chaseSpeed} blocks a second**`), 'how fast');
    assert.ok(es.includes(`**${info.attackDamage} de daño**`) && en.includes(`**${info.attackDamage} damage**`));
    // When it lets go, and its leash (pkg/network/animals.go: animalsChaseLoose; pkg/network/revival.go: Radius).
    const loose = 1.5 * info.chaseDistance;
    assert.ok(es.includes(`a más de ${loose} bloques de él, o a más de ${8 + loose} de su casa`) && en.includes(`more than ${loose} blocks away from it, or more than ${8 + loose} from its home`));
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 6, 7, 8].map(blows), [5, 4, 3, 3], 'bare-handed, and with a sword of stone, iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 5 golpes a mano, 4 con una [espada](71) de piedra, 3 con una de hierro o de oro`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 5 hits bare-handed, 4 with a stone [sword](71), 3 with an iron or a golden one`));
    assert.ok(es.includes(`Hay **${info.variants} colores**`) && en.includes(`There are **${info.variants} colours**`));
    assert.ok(Math.abs(M.flick - 0.5) < 0.1 && es.includes('medio segundo cada pocos segundos') && en.includes('for half a second every few seconds'));
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.megalania)', ctx));
    assert.deepEqual(fossil, { source: 'rock', rarity: 'rare', weight: 1, water: 0, seconds: 45 });
    assert.ok(es.includes(`tarda **${fossil.seconds} segundos**`) && en.includes(`takes **${fossil.seconds} seconds**`));
    assert.ok(es.includes('no necesita agua') && en.includes('needs no water'));
    assert.ok(es.includes('](252)') && en.includes('](252)'), 'a shield takes its bite as any blow that comes from somewhere');
});

test('its tongue is in its mouth most of the time, and comes out for half a second every few seconds', () => {
    const g = makeFlatWorld(ctx, { x: 40.5, z: 0.5 });
    const mob = g.spawn('megalania', 0.5, 0.5);
    const tongue = mob.userData.modelParts.tongue;
    let out = 0;
    let flicks = 0;
    let was = false;
    const frames = 30 * 60;
    for (let i = 0; i < frames; i++) {
        g.frame();
        assert.ok(tongue.scale.z > 0 && tongue.scale.z <= 1);
        if (tongue.visible) out++;
        if (tongue.visible && !was) flicks++;
        was = tongue.visible;
    }
    // A flick every 2.5 to 6 seconds (and one more, at most, for when the first comes).
    assert.ok(flicks >= 60 / (M.flickEvery[1] + M.flick) - 1 && flicks <= 60 / M.flickEvery[0] + 1, `${flicks} flicks in a minute`);
    assert.ok(out / frames < 0.2 && out > 0, `its tongue is out ${out} frames of ${frames}`);
    // Its model is built again for another graphics mode: the tongue it has now is the one that moves.
    g.game.attachMobModel(mob);
    const fresh = mob.userData.modelParts.tongue;
    assert.ok(fresh !== tongue);
    let seen = false;
    for (let i = 0; i < 30 * 15 && !seen; i++) {
        g.frame();
        seen = fresh.visible && fresh.scale.z > 0.5;
    }
    assert.ok(seen, 'the new tongue flicks');
});

test('it comes for a player who is near, its tongue going all the time, stops where its mouth reaches and bites', () => {
    const g = makeFlatWorld(ctx, { x: 0.5, z: 0.5 });
    const info = ctx.getMobSpecies('megalania');
    const mob = g.spawn('megalania', 8.5, 0.5);
    const tongue = mob.userData.modelParts.tongue;
    let flicks = 0;
    let was = false;
    let frames = 0;
    for (; frames < 30 * 12 && g.hurt.length === 0; frames++) {
        g.frame();
        if (tongue.visible && !was) flicks++;
        was = tongue.visible;
    }
    assert.equal(g.hurt.length, 1);
    assert.equal(g.hurt[0].amount, info.attackDamage);
    assert.equal(g.hurt[0].reason, 'You were attacked by a megalania');
    assert.equal(g.hurt[0].type, 'mob');
    const seconds = frames / 30;
    assert.ok(flicks >= seconds / (M.flickEvery[1] / M.hurry + M.flick) - 1, `${flicks} flicks in ${seconds} seconds of hunting`);
    g.run(6);
    const reach = Math.hypot(mob.position.x - 0.5, mob.position.z - 0.5);
    assert.ok(reach < 1.2 && reach > info.keepDistance - 0.1, `it stands ${reach} from the player`);
    assert.ok(g.hurt.length >= 4 && g.hurt.length <= 7, `${g.hurt.length} bites`);
});

test('gone, it is no longer looked at', () => {
    const g = makeFlatWorld(ctx, { x: 40.5, z: 0.5 });
    const mob = g.spawn('megalania', 0.5, 0.5);
    g.spawn('megalania', 3.5, 0.5);
    g.frame();
    assert.equal(g.game.megalaniaAlive.length, 2);
    g.game.removeMob(mob);
    g.frame();
    assert.equal(g.game.megalaniaAlive.length, 1);
});
