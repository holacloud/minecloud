// Node tests for the dire wolf (js/game/dire_wolf.js): an extinct hunter on the built-in ground movement. The real
// mobs.js, taming.js, herd.js, camera.js and world.js run on a flat world (support/flat_world.js); only
// drawing and sound are left out. Here it is a wild one (from an egg or /mob), which goes after the player of
// its own browser; that a revived one goes after the player the server says is asked of every hostile
// species by animals.test.js, and that the server's row says its numbers by revival.test.js. What every
// extinct animal has to be is asked of it by extinct_species.test.js.
// No assertion is given a mob: a failed one would print it, and a mob of this harness has no end.
// Run with: node --test test/js/dire_wolf.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame();
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `271_${lang}_${lang === 'ES' ? 'Lobo_terrible' : 'Dire_wolf'}.md`), 'utf8');
const info = ctx.getMobSpecies('dire_wolf');
// From how many blocks it comes; what the server holds a kept one to (pkg/network/animals.go: its circle of
// 8 blocks, and a target let go at one and a half times that distance).
const REACH = 16;
const HOME = 8;
const LOOSE = 1.5;
const comma = (value) => String(value).replace('.', ',');
const away = (g, mob) => Math.hypot(mob.position.x - g.camera.position.x, mob.position.z - g.camera.position.z);

test('what it is: a hunter nobody tames, and what its page says of it', () => {
    assert.equal(info.movement, undefined, 'it walks as any ground mob, so the server walks a kept one');
    assert.equal(info.hiddenUntilDiscovered, true);
    assert.equal(info.ancestorOf, 'dog');
    assert.equal(info.hostile, true);
    assert.equal(info.nocturnal, undefined, 'by day and by night');
    assert.equal(info.chaseDistance || 16, REACH);
    assert.ok(info.chaseDistance === undefined || info.chaseDistance <= 20, 'no further than the server looks');
    assert.equal(ctx.TAMING_DIET['dire_wolf'], undefined);
    assert.equal(ctx.Game.prototype.tamingCanTame.call({}, 'dire_wolf'), false);
    assert.deepEqual([...ctx.TRAPS_SPECIES['dire_wolf'].baits], []);
    // What the server is told of it (animalsChaseOf, js/game/animals.js).
    assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(animalsChaseOf(getMobSpecies('dire_wolf')))", ctx)), { chase: REACH, chaseDay: 0, chaseSpeed: info.chaseSpeed });

    // The numbers of its page are those of the code.
    const es = page('ES');
    const en = page('EN');
    const blows = Math.ceil(info.maxHealth / 4);
    assert.ok(es.includes(`**${info.maxHealth} de vida**: ${blows} golpes a mano`) && en.includes(`**${info.maxHealth} health**: ${blows} hits bare-handed`), 'its health and the blows it takes');
    assert.ok(es.includes(`menos de **${REACH} bloques**`) && en.includes(`within **${REACH} blocks**`), 'from how far it comes');
    assert.ok(es.includes(`a ${comma(info.chaseSpeed)} bloques por segundo`) && en.includes(`at ${info.chaseSpeed} blocks a second`), 'how fast it runs');
    assert.ok(es.includes(`${info.attackDamage} de daño**`) && en.includes(`${info.attackDamage} damage**`), 'what its bite takes');
    const bites = Math.ceil(20 / info.attackDamage);
    assert.ok(es.includes(`son ${bites} `) && en.includes(`that is ${bites} `), 'how many of them a player stands');
    assert.ok(es.includes(`a más de ${LOOSE * REACH} bloques de él, o a más de ${HOME + LOOSE * REACH} bloques de su casa`), 'when it lets go, in Spanish');
    assert.ok(en.includes(`more than ${LOOSE * REACH} blocks from it, or more than ${HOME + LOOSE * REACH} blocks from its home`), 'when it lets go, in English');
    assert.ok(info.chaseSpeed < 4.5, 'a player on foot always gets away, as the page says');
});

test('a wild one comes for the player from inside its reach, at its run, and bites', () => {
    const g = makeFlatWorld(ctx);
    const start = REACH - 2;
    const mob = g.spawn('dire_wolf', 0.5 + start, 0.5);
    g.run(2);
    const run = start - away(g, mob);
    assert.ok(run > info.chaseSpeed * 2 - 0.6 && run < info.chaseSpeed * 2 + 0.2, `${run} blocks in 2 seconds`);
    assert.equal(g.hurt.length, 0, 'not there yet');
    // It gets there, and bites at most once every 1.2 seconds: so many bites in the seconds it has left.
    const arrives = (start - 1.2) / info.chaseSpeed;
    const seconds = Math.ceil(arrives) + 3;
    g.run(seconds - 2);
    assert.ok(away(g, mob) < 1.3, `it is ${away(g, mob)} blocks away`);
    const most = Math.floor((seconds - arrives) / 1.2) + 1;
    assert.ok(g.hurt.length >= 2 && g.hurt.length <= most, `${g.hurt.length} bites, at most ${most}`);
    assert.deepEqual({ amount: g.hurt[0].amount, reason: g.hurt[0].reason, type: g.hurt[0].type }, { amount: info.attackDamage, reason: 'You were attacked by a dire wolf', type: 'mob' });
});

test('from outside its reach it leaves the player alone', () => {
    const g = makeFlatWorld(ctx);
    const start = REACH + 5;
    const mob = g.spawn('dire_wolf', 0.5 + start, 0.5);
    g.run(4);
    assert.equal(g.hurt.length, 0);
    assert.ok(away(g, mob) > REACH, `it strolls, ${away(g, mob)} blocks away`);
});
