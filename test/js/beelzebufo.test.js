// Node tests for Beelzebufo (js/game/beelzebufo.js): what it is, that it hops as the frog does, and what it
// does when struck: it turns on the player, opens its mouth and jumps at them. The real mobs.js,
// wildlife.js, camera.js and world.js run on a flat world (support/flat_world.js); only drawing and sound
// are left out. What every extinct animal has to be is asked of it by extinct_species.test.js.
// Run with: node --test test/js/beelzebufo.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { EYE, loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame({ listenersOf: ['js/game/beelzebufo.js'], frameUpdates: ['beelzebufoUpdate'] });
const B = JSON.parse(vm.runInContext('JSON.stringify(BEELZEBUFO)', ctx));
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `287_${lang}_Beelzebufo.md`), 'utf8');
const comma = (number) => String(number).replace('.', ',');
const away = (mob, g) => Math.hypot(mob.position.x - g.camera.position.x, mob.position.z - g.camera.position.z);
const phase = (mob) => (mob.userData.beelzebufoAnger ? mob.userData.beelzebufoAnger.phase : 'calm');

// The player at (0.5, 0.5) and the frog `gap` blocks away along x, struck once as the game strikes a mob:
// a bare hand takes 4, and the frog's movement hops it away (interactWithMob, js/game/mobs.js).
function struck(gap = 2, options = {}) {
    const g = makeFlatWorld(ctx, options);
    g.game.getSelectedHeldItemType = () => null;
    const mob = g.spawn('beelzebufo', 0.5 + gap, 0.5);
    g.frame();
    g.game.interactWithMob(mob);
    return { g, mob };
}
// Frames until its anger is in `wanted` (or over), at most `seconds`: how many went by.
function until(g, mob, wanted, seconds = 6) {
    let frames = 0;
    while (phase(mob) !== wanted && frames < seconds * 30) {
        g.frame();
        frames++;
    }
    assert.equal(phase(mob), wanted, `after ${frames} frames`);
    return frames;
}

test('what it is: a frog of the frog\'s movement that nobody tames, and what its page says of it', () => {
    const info = ctx.getMobSpecies('beelzebufo');
    assert.equal(info.movement, 'hop');
    assert.ok(!ctx.mobMovementIs('hop', 'walksToGoal') && !ctx.mobMovementIs('hop', 'bodiless'), 'the server keeps it and does not walk it: each client hops its own');
    assert.ok(ctx.Game.prototype.animalsCanKeep.call({}, 'beelzebufo', false));
    assert.equal(info.ancestorOf, 'frog');
    assert.equal(info.hostile, undefined, 'it starts nothing');
    assert.equal(ctx.TAMING_DIET.beelzebufo, undefined);
    assert.equal(ctx.Game.prototype.tamingCanTame.call({}, 'beelzebufo'), false);
    assert.equal(JSON.stringify(ctx.TRAPS_SPECIES.beelzebufo), '{"baits":[]}');
    // Its model has the parts the frog's movement moves, under the frog's names, and a head that opens.
    const g = makeFlatWorld(ctx, { x: 30.5, z: 0.5 });
    const parts = g.spawn('beelzebufo', 0.5, 0.5).userData.modelParts;
    for (const name of ['body', 'thighL', 'thighR', 'footL', 'footR', 'armL', 'armR', 'throat', 'head', 'jaw']) assert.ok(parts[name], name);

    // The numbers of its page are those of the code.
    const es = page('ES');
    const en = page('EN');
    assert.ok(es.includes(`gruñe durante ${comma(B.gape)} segundos`) && en.includes(`growls for ${B.gape} seconds`), 'how long it shows its mouth');
    assert.ok(es.includes(`hasta ${B.leap} bloques`) && en.includes(`up to ${B.leap} blocks`), 'how far it jumps');
    assert.ok(es.includes(`a menos de ${comma(B.reach)} bloques de ti`) && en.includes(`within ${B.reach} blocks of you`), 'how near its mouth has to land');
    assert.ok(es.includes(`**${B.damage} de daño**`) && en.includes(`**${B.damage} damage**`));
    assert.ok(es.includes(`a más de ${B.sight} bloques`) && en.includes(`more than ${B.sight} blocks away`), 'from how far it lets it be');
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 6, 7, 8].map(blows), [4, 3, 3, 2], 'bare-handed, and with a sword of stone, iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 4 golpes a mano, 3 con una [espada](71) de piedra o de hierro, 2 con una de oro`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 4 hits bare-handed, 3 with a stone or an iron [sword](71), 2 with a golden one`));
    assert.ok(es.includes(`Hay\n**${info.variants} colores**`) && en.includes(`There are **${info.variants} colours**`));
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.beelzebufo)', ctx));
    assert.deepEqual(fossil, { source: 'rock', rarity: 'rare', weight: 1, water: 0, seconds: 45 });
    assert.ok(es.includes(`tarda **${fossil.seconds} segundos**`) && en.includes(`takes **${fossil.seconds} seconds**`));
    assert.ok(es.includes('no necesita agua') && en.includes('needs no water'));
    assert.ok(es.includes('](252)') && en.includes('](252)'), 'a shield takes its bite as any blow that comes from somewhere');
    // How long a hop is in the air, which is what makes its jump land where it aims (js/game/wildlife.js).
    const air = vm.runInContext('BEELZEBUFO_AIRTIME', ctx);
    assert.ok(Math.abs(air - 2 * 4.6 / 18) < 1e-9);
    const hop = fs.readFileSync(path.join(STATIC, 'js', 'game', 'wildlife.js'), 'utf8');
    assert.ok(hop.includes('const up = rise > 0.2 ? 6.6 : 4.6;') && hop.includes('velocity.y -= 18 * delta;'), 'the frog still hops as BEELZEBUFO_AIRTIME says');
});

test('left alone it only hops about, near its home, and hurts nobody, however near they stand', () => {
    const g = makeFlatWorld(ctx, { x: 2.5, z: 0.5 });
    const mob = g.spawn('beelzebufo', 0.5, 0.5);
    let hops = 0;
    let wasUp = false;
    let furthest = 0;
    for (let i = 0; i < 30 * 120; i++) {
        g.frame();
        if (mob.userData.airborne && !wasUp) hops++;
        wasUp = Boolean(mob.userData.airborne);
        furthest = Math.max(furthest, Math.hypot(mob.position.x - 0.5, mob.position.z - 0.5));
    }
    assert.ok(hops > 15, `${hops} hops in two minutes`);
    assert.ok(furthest < 13, `it went ${furthest} blocks from its home at the most`);
    assert.equal(g.hurt.length, 0);
    assert.equal(phase(mob), 'calm');
    assert.ok(!g.game.beelzebufoAngry || g.game.beelzebufoAngry.length === 0);
    assert.equal(mob.userData.modelParts.head.rotation.x, mob.userData.modelParts.head.userData.baseRotation.x, 'its mouth is shut');
});

test('struck, it hops away, turns on the player and shows its open mouth; then it jumps at them and bites', () => {
    const { g, mob } = struck();
    assert.equal(mob.userData.health, 12);
    assert.equal(phase(mob), 'land');
    assert.ok(mob.userData.airborne, 'the frog\'s movement hops it away from the blow first');
    until(g, mob, 'gape');
    assert.ok(!mob.userData.airborne && away(mob, g) > 2.5, `it landed ${away(mob, g)} blocks away`);
    // It stands, facing the player, its mouth opening, for as long as its page says.
    const head = mob.userData.modelParts.head;
    const stood = { x: mob.position.x, z: mob.position.z };
    const frames = until(g, mob, 'leap');
    assert.ok(Math.abs(frames / 30 - B.gape) < 0.07, `it showed its mouth for ${frames / 30} seconds`);
    assert.ok(head.rotation.x < head.userData.baseRotation.x - 0.6, 'its mouth is wide open');
    const towards = Math.atan2(g.camera.position.z - stood.z, g.camera.position.x - stood.x);
    assert.ok(Math.abs(Math.atan2(Math.sin(mob.userData.facing - towards), Math.cos(mob.userData.facing - towards))) < 0.01, 'it faces the player');
    assert.ok(mob.userData.airborne, 'and it is in the air');
    assert.equal(g.hurt.length, 0);
    // It comes down on the player, who has not moved: the bite.
    until(g, mob, 'shut');
    assert.equal(g.hurt.length, 1);
    assert.equal(g.hurt[0].amount, B.damage);
    assert.equal(g.hurt[0].reason, 'You were bitten by a beelzebufo');
    assert.equal(g.hurt[0].type, 'mob');
    assert.ok(away(mob, g) < 1, `it landed ${away(mob, g)} blocks from the player`);
    until(g, mob, 'calm', 2);
    assert.equal(head.rotation.x, head.userData.baseRotation.x, 'its mouth is shut again');
    assert.equal(g.game.beelzebufoAngry.length, 0);
    // One bite for one blow: left alone again, it hurts nobody.
    g.run(20);
    assert.equal(g.hurt.length, 1);
});

test('whoever steps aside while it shows its mouth is missed: it jumps at where they were when it took off', () => {
    const { g, mob } = struck();
    until(g, mob, 'gape');
    until(g, mob, 'leap');
    const aimed = { x: g.camera.position.x, z: g.camera.position.z };
    g.stand(aimed.x, aimed.z + 2);
    until(g, mob, 'shut');
    assert.equal(g.hurt.length, 0);
    assert.ok(Math.hypot(mob.position.x - aimed.x, mob.position.z - aimed.z) < 1, 'it came down where the player was');
    // And one who was never near enough is left alone: too far when it has turned round, or up on a wall.
    const far = struck();
    far.g.stand(0.5 - B.sight, 0.5);
    until(far.g, far.mob, 'calm');
    assert.equal(far.g.hurt.length, 0);
    const high = struck();
    until(high.g, high.mob, 'gape');
    until(high.g, high.mob, 'leap');
    high.g.camera.position.y = EYE + B.tall + 1;
    until(high.g, high.mob, 'shut');
    assert.equal(high.g.hurt.length, 0, 'it jumped under them');
});

test('its jump is never longer than its page says, it is not provoked twice at once, and the last blow ends it', () => {
    const { g, mob } = struck(3);
    until(g, mob, 'gape');
    const from = { x: mob.position.x, z: mob.position.z };
    assert.ok(away(mob, g) > B.leap + 1 && away(mob, g) < B.sight, `${away(mob, g)} blocks away: further than it jumps`);
    // Struck again while it is at it: nothing new.
    assert.equal(g.game.damageMobByPlayer(mob, 4), false);
    assert.equal(g.game.beelzebufoAngry.length, 1);
    until(g, mob, 'leap');
    until(g, mob, 'shut');
    const jumped = Math.hypot(mob.position.x - from.x, mob.position.z - from.z);
    assert.ok(jumped > B.leap - 0.3 && jumped < B.leap + 0.2, `it jumped ${jumped} blocks`);
    assert.equal(g.hurt.length, 0, 'short of the player');
    until(g, mob, 'calm', 2);
    // Two more blows: the fourth is the last (16 health, 4 a blow), and what is gone is angry at nobody.
    g.game.interactWithMob(mob);
    assert.equal(phase(mob), 'land');
    g.game.interactWithMob(mob);
    assert.ok(mob.parent === null, 'defeated');
    g.frame();
    assert.equal(g.game.beelzebufoAngry.length, 0);
    assert.equal(g.game.ambientMobs.length, 0);
    assert.equal(g.hurt.length, 0);
});

test('on the title screen, or while the player waits to come back, it bites nobody', () => {
    for (const flag of ['titleScreenOpen', 'respawnPending']) {
        const { g, mob } = struck();
        until(g, mob, 'gape');
        g.game[flag] = true;
        g.frame();
        assert.equal(phase(mob), 'calm', flag);
        assert.equal(mob.userData.modelParts.head.rotation.x, mob.userData.modelParts.head.userData.baseRotation.x);
        g.run(5);
        assert.equal(g.hurt.length, 0, flag);
    }
});
