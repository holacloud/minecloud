// Node tests for the Onychonycteris (js/game/onychonycteris.js): what it is, and its one habit: it flies
// low while it goes somewhere, and comes down and folds its wings when it has stood for a while. The real
// mobs.js, animals.js, camera.js and world.js run on a flat world (support/flat_world.js); only drawing and
// sound are left out. What every extinct animal has to be is asked of it by extinct_species.test.js.
// (A mob is never handed to assert.equal or deepEqual: a failure would print the whole of the harness.)
// Run with: node --test test/js/onychonycteris.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame({ listenersOf: ['js/game/onychonycteris.js'], frameUpdates: ['onychonycterisUpdate'] });
const O = JSON.parse(vm.runInContext('JSON.stringify(ONYCHONYCTERIS)', ctx));
const MODE = vm.runInContext('ANIMALS_MODE', ctx);
const FULL = ctx.getMobSpecies('onychonycteris').flyHeight;
// How far its hovering lifts and drops it (js/game/mobs.js).
const BOB = 0.18;
// A page as one line: where its sentences are broken is nobody's business.
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `283_${lang}_Onychonycteris.md`), 'utf8').replace(/\s+/g, ' ');
const flock = (g) => (g.game.onychonycterisFlock ? g.game.onychonycterisFlock.length : 0);
// How far over the ground (y = 0 on the flat world) its body is.
const up = (mob) => mob.position.y;
const landed = (mob) => mob.userData.flyHeight === 0 && Math.abs(mob.position.y) < 1e-9;

// One the server keeps and walks (js/game/animals.js): standing, or on its way to `walk`.
function kept(mob, walk = null) {
    Object.assign(mob.userData, { animalId: 9, animalForeign: true, animalMine: false, animalOwnerName: null });
    mob.userData.animal = { id: 9, species: 'onychonycteris', mode: MODE.roam, walked: true, walks: true, moving: Boolean(walk), targetX: walk ? walk.x : 0, targetZ: walk ? walk.z : 0, session: '' };
}

test('what it is: a ground mob that hovers, as the server needs it, peaceful and nobody\'s pet, and what its page says of it', () => {
    const info = ctx.getMobSpecies('onychonycteris');
    const bat = ctx.getMobSpecies('bat');
    assert.equal(info.movement, undefined, 'the ground movement, which the server walks');
    assert.ok(ctx.mobMovementIs(info.movement, 'walksToGoal') && !ctx.mobMovementIs(info.movement, 'bodiless'));
    assert.ok(ctx.mobMovementIs(bat.movement, 'bodiless'), 'which the bat\'s own movement is not: it could not be kept');
    assert.equal(info.hiddenUntilDiscovered, true);
    assert.equal(info.ancestorOf, 'bat');
    assert.equal(info.hostile, undefined);
    assert.ok(info.flyHeight > 1 && info.flyHeight < ctx.getMobSpecies('macaw').flyHeight, 'low: under the macaw');
    assert.equal(ctx.TAMING_DIET.onychonycteris, undefined);
    assert.equal(ctx.Game.prototype.tamingCanTame.call({}, 'onychonycteris'), false);
    assert.equal(JSON.stringify(ctx.TRAPS_SPECIES.onychonycteris), '{"baits":[]}', 'no bait, no cage and no net');

    // The numbers of its page are those of the code.
    const comma = (number) => String(number).replace('.', ',');
    const es = page('ES');
    const en = page('EN');
    assert.ok(es.includes(`a ${comma(FULL)} bloques del suelo`) && en.includes(`${FULL} blocks over the ground`), 'how high');
    assert.ok(es.includes(`aletea en el sitio ${comma(O.hover)} segundos`) && en.includes(`beats its wings on the spot for ${O.hover} seconds`), 'how long before it lands');
    assert.equal([4, 5, 6].map((damage) => Math.ceil(info.maxHealth / damage)).join(), '2,2,1', 'bare-handed, and with a sword of wood and of stone (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 2 golpes a mano, 1 con una [espada](71) de piedra o mejor`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 2 hits bare-handed, 1 with a stone [sword](71) or better`));
    assert.ok(es.includes(`Hay **${info.variants} colores**`) && en.includes(`There are **${info.variants} colours**`));
    assert.equal(vm.runInContext('JSON.stringify(RESOURCE_DROPS.onychonycteris)', ctx), '[["leather",1,1,0.5]]');
    assert.ok(es.includes('Una de cada dos veces deja 1 ![cuero](item:leather) `leather`') && en.includes('One time in two it leaves 1 ![leather](item:leather) `leather`'));
    // How long it takes to revive is what its fossil says (js/game/fossils.js), and it is a land animal.
    assert.equal(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.onychonycteris)', ctx), '{"source":"rock","rarity":"rare","weight":1,"water":0,"seconds":45}');
    assert.ok(es.includes('tarda **45 segundos**') && en.includes('takes **45 seconds**'));
    assert.ok(es.includes('no necesita agua') && en.includes('needs no water'));
});

test('its model: wings in two pieces for the rig to beat, a claw on every finger, and feet on the ground', () => {
    const g = makeFlatWorld(ctx);
    for (const variant of [0, 1]) {
        const mob = g.spawn('onychonycteris', 3.5, 0.5 + variant * 2, { variant });
        const parts = mob.userData.modelParts;
        assert.equal(mob.userData.wings.length, 2);
        assert.ok(mob.userData.wings[0] === parts.wingL && mob.userData.wings[1] === parts.wingR, 'left first: the rig lifts the first one to its left');
        assert.ok(mob.userData.head && mob.userData.tail.length === 1 && mob.userData.legs.length === 2);
        for (const side of ['L', 'R']) {
            assert.ok(parts[`wingTip${side}`] && parts[`thumb${side}`], side);
            for (let finger = 0; finger < 4; finger++) assert.ok(parts[`claw${side}${finger}`], `claw${side}${finger}`);
        }
    }
    const mob = g.spawn('onychonycteris', 6.5, 0.5);
    assert.ok(g.game.herdHeight(mob) < 0.3 && g.game.herdRadius(mob) < 0.45, 'small');
    assert.equal(flock(g), 3, 'each one is on the list from the moment it is made');
});

test('with nowhere to go it beats its wings for a moment, comes down, and folds them', () => {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('onychonycteris', 4.5, 0.5);
    kept(mob);
    assert.equal(mob.userData.flyHeight, FULL);
    assert.ok(Math.abs(up(mob) - FULL) < 1e-9, 'it starts in the air');
    const parts = mob.userData.modelParts;

    // Still up, and its wings go: its step moves on although it goes nowhere.
    const step = mob.userData.stepPhase;
    g.run(O.hover - 0.2);
    assert.equal(mob.userData.flyHeight, FULL);
    assert.ok(Math.abs(up(mob) - FULL) <= BOB + 1e-9, `${up(mob)}`);
    assert.ok(mob.userData.stepPhase > step + 5, 'beating its wings on the spot');
    assert.equal(parts.wingL.rotation.y, 0, 'wings open');

    // Down it comes, a little at a time.
    g.run(0.2 + FULL / O.sink / 2);
    assert.ok(mob.userData.flyHeight > 0.2 && mob.userData.flyHeight < FULL - 0.2, `halfway: ${mob.userData.flyHeight}`);
    assert.ok(parts.wingL.rotation.y > 0.1 && parts.wingL.rotation.y < O.fold, 'folding as it sinks');
    g.run(FULL / O.sink / 2 + 0.3);
    assert.ok(landed(mob), `on the ground: ${mob.userData.flyHeight}, ${up(mob)}`);
    assert.equal(`${parts.wingL.rotation.y},${parts.wingR.rotation.y}`, `${O.fold},${-O.fold}`, 'arms back along the body');
    assert.equal(`${parts.wingTipL.rotation.y},${parts.wingTipR.rotation.y}`, `${O.tuck},${-O.tuck}`, 'hands folded over them');
    // And there it stays, where it was: nothing of this moves it over the ground.
    const phase = mob.userData.stepPhase;
    g.run(10);
    assert.ok(landed(mob));
    assert.equal(`${mob.position.x},${mob.position.z}`, '4.5,0.5');
    assert.equal(mob.userData.stepPhase, phase, 'at rest');
});

test('sent somewhere, it takes off, flies there low, and lands again', () => {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('onychonycteris', 4.5, 0.5);
    kept(mob);
    g.run(O.hover + FULL / O.sink + 0.5);
    assert.ok(landed(mob));

    kept(mob, { x: 4.5, z: 8.5 });
    g.run(FULL / O.rise + 0.2);
    assert.equal(mob.userData.flyHeight, FULL, 'up again in well under a second');
    assert.equal(mob.userData.modelParts.wingL.rotation.y, 0, 'wings open');
    // On its way: over the ground the whole time, as high as it flies and no higher.
    let highest = 0;
    let lowest = Infinity;
    for (let second = 0; second < 5; second++) {
        g.run(1);
        highest = Math.max(highest, up(mob));
        lowest = Math.min(lowest, up(mob));
    }
    assert.ok(highest <= FULL + BOB + 1e-9 && lowest >= FULL - BOB - 1e-9, `between ${lowest} and ${highest}`);
    g.run(6);
    assert.ok(Math.hypot(mob.position.x - 4.5, mob.position.z - 8.5) < 0.5, `it got there: ${mob.position.x}, ${mob.position.z}`);
    g.run(O.hover + FULL / O.sink + 0.5);
    assert.ok(landed(mob), 'and came down');
});

test('struck on the ground, it takes off at once and is a while before it lands again', () => {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('onychonycteris', 4.5, 0.5);
    kept(mob);
    g.run(O.hover + FULL / O.sink + 0.5);
    assert.ok(landed(mob));
    assert.equal(g.game.damageMobByPlayer(mob, 4), false);
    g.run(FULL / O.rise + 0.2);
    assert.equal(mob.userData.flyHeight, FULL);
    g.run(O.fright - 1);
    assert.equal(mob.userData.flyHeight, FULL, 'still up');
    g.run(1 + O.hover + FULL / O.sink + 0.5);
    assert.ok(landed(mob), 'then down again');
    assert.equal(g.hurt.length, 0, 'and it hurts nobody');
});

test('a wild one, which never stops, never comes down; and one that is gone leaves the list', () => {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('onychonycteris', 4.5, 0.5);
    for (let second = 0; second < 20; second++) {
        g.run(1);
        assert.equal(mob.userData.flyHeight, FULL, `second ${second}`);
    }
    assert.ok(Math.hypot(mob.position.x - 4.5, mob.position.z - 0.5) > 1, 'it went about');
    assert.equal(flock(g), 1);
    g.game.removeMob(mob);
    g.run(0.1);
    assert.equal(flock(g), 0);
});

test('a model built again (the graphics changed) is folded again on the next frame', () => {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('onychonycteris', 4.5, 0.5);
    kept(mob);
    g.run(O.hover + FULL / O.sink + 0.5);
    assert.ok(landed(mob));
    const before = mob.userData.modelParts.wingL;
    g.game.attachMobModel(mob);
    assert.ok(mob.userData.modelParts.wingL !== before, 'new parts');
    assert.equal(mob.userData.modelParts.wingL.rotation.y, 0, 'built with its wings open');
    g.frame();
    assert.equal(mob.userData.modelParts.wingL.rotation.y, O.fold);
    assert.equal(mob.userData.modelParts.wingTipR.rotation.y, -O.tuck);
});
