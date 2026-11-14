// Node tests for the Archelon (js/game/archelon.js): what it is, and that the 'cruise' movement of every sea
// animal (js/game/sea_animals.js) carries it as its page says: it rows about its pool, comes up to breathe
// and hurts nobody. The real mobs.js, sea_animals.js, camera.js and world.js run on a flat world with a pool
// dug in it (support/flat_world.js); only drawing and sound are left out. What every extinct animal has to
// be is asked of it by extinct_species.test.js, and how the movement itself works by sea_animals.test.js.
// Run with: node --test test/js/archelon.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame();
const SEA = JSON.parse(vm.runInContext('JSON.stringify(SEA)', ctx));
const body = JSON.parse(vm.runInContext("(() => { const b = seaAnimalsBody('archelon'); return JSON.stringify({ front: b.front, back: b.back, half: b.half, height: b.height, length: b.length }); })()", ctx));
const guide = fs.readdirSync(path.join(STATIC, 'guide')).map((name) => name.normalize('NFC'));
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', guide.find((name) => name.startsWith(`286_${lang}_`))), 'utf8');
const comma = (number) => String(number).replace('.', ',');

// A pool 16 by 14 and 4 deep, its water from y = -4 to y = -1, with the player standing on its shore.
const POOL = { x0: 0, x1: 16, z0: 0, z1: 14, depth: 4 };
function pool() {
    const blocks = {};
    for (let x = POOL.x0; x < POOL.x1; x++) for (let z = POOL.z0; z < POOL.z1; z++) for (let y = -POOL.depth; y <= -1; y++) blocks[`${x},${y},${z}`] = 'water';
    const g = makeFlatWorld(ctx, { x: -3.5, z: 7.5, blocks });
    g.world.addRipple = () => {};
    g.game.spawnSplash = () => {};
    g.game.getSelectedHeldItemType = () => null;
    const wet = (x, y, z) => g.world.getBlockTypeAt(Math.floor(x), Math.floor(y), Math.floor(z)) === 'water';
    return { ...g, wet };
}

test('what it is: a peaceful turtle of the sea that breathes air, three blocks long, and what its page says of it', () => {
    const info = ctx.getMobSpecies('archelon');
    assert.equal(info.movement, 'cruise');
    assert.equal(info.ancestorOf, 'turtle');
    assert.equal(info.hostile, undefined);
    assert.equal(info.attackDamage, undefined);
    assert.deepEqual([...info.seaBreath], [45, 80]);
    assert.equal(ctx.TAMING_DIET.archelon, undefined);
    assert.equal(JSON.stringify(ctx.TRAPS_SPECIES.archelon), '{"baits":[]}');
    // Its body, as the movement reads it from its model: its length, its flippers and its shell.
    assert.ok(body.length > 2.9 && body.length < 3.3, `${body.length} blocks long`);
    assert.ok(body.half * 2 > 3.3 && body.half * 2 < 3.9, `${body.half * 2} blocks from flipper tip to flipper tip`);
    assert.ok(body.height > 0.7 && body.height < 1, `${body.height} blocks tall`);
    assert.ok(Math.abs(body.front - body.back) < 0.6, 'its middle is the middle of it: that is what it turns about');

    // The numbers of its page are those of the code.
    const es = page('ES');
    const en = page('EN');
    assert.ok(es.split('\n')[0] === '# Arquelón' && en.split('\n')[0] === '# Archelon');
    assert.ok(es.includes('**3 bloques de largo**') && en.includes('**3 blocks long**'));
    assert.ok(es.includes('unos **3,5 de punta a punta de las aletas**') && en.includes('about **3.5 from flipper tip to flipper tip**'));
    assert.equal(info.speed, 0.75);
    assert.ok(es.includes('a tres cuartos de bloque por segundo') && en.includes('at three quarters of a block a second'));
    assert.ok(es.includes(`cada ${info.seaBreath[0]} a ${info.seaBreath[1]} segundos`) && en.includes(`every ${info.seaBreath[0]} to ${info.seaBreath[1]} seconds`), 'how often it breathes');
    assert.ok(Math.round(SEA.gulp) === 3 && es.includes('unos 3 segundos') && en.includes('some 3 seconds'), 'how long its head is out');
    // How far it roams: 3 blocks and its own length, when its species does not say (js/game/sea_animals.js).
    assert.equal(info.seaRange, undefined);
    assert.equal(Math.round(3 + body.length), 6);
    assert.ok(es.includes('más de unos 6 bloques') && en.includes('than about 6 blocks'));
    assert.ok(SEA.burst > 2 && es.includes('a más del doble de su velocidad') && en.includes('at more than twice its speed'));
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 7, 8].map(blows), [7, 4, 4], 'bare-handed, and with a sword of iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 7 golpes a mano (4 con una [espada](71) de hierro o de oro)`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 7 hits bare-handed (4 with an iron or a golden [sword](71))`));
    assert.ok(es.includes(`Hay **${info.variants} colores**`) && en.includes(`There are **${info.variants} colours**`));
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.archelon)', ctx));
    assert.deepEqual(fossil, { source: 'rock', rarity: 'rare', weight: 1, water: 60, seconds: 45 });
    assert.ok(es.includes(`**${fossil.water} bloques de agua**`) && en.includes(`**${fossil.water} blocks of water**`));
    assert.ok(es.includes(`tarda ${fossil.seconds} segundos`) && en.includes(`takes ${fossil.seconds} seconds`));
});

test('in its pool it rows about without ever leaving the water, comes up to breathe, and hurts nobody who swims with it', () => {
    const g = pool();
    const mob = g.game.seaAnimalsSpawn('archelon', 8.5, -2, 7.5);
    assert.ok(mob, 'it has a body in the water');
    const sea = mob.userData.sea;
    // Somebody swims in its pool the whole time.
    g.camera.position.set(4.5, -1.2, 3.5);
    g.cameraController.isInWater = true;
    const info = ctx.getMobSpecies('archelon');
    let breaths = 0;
    let gulping = false;
    let lifted = 0;
    let travelled = 0;
    let last = { x: mob.position.x, z: mob.position.z };
    for (let i = 0; i < 30 * 200; i++) {
        g.frame();
        assert.ok(g.wet(mob.position.x, mob.position.y + 0.02, mob.position.z), `frame ${i}: its middle is out of the water`);
        assert.ok(mob.position.x > POOL.x0 && mob.position.x < POOL.x1 && mob.position.z > POOL.z0 && mob.position.z < POOL.z1);
        travelled += Math.hypot(mob.position.x - last.x, mob.position.z - last.z);
        last = { x: mob.position.x, z: mob.position.z };
        if (sea.gulp > 0 && !gulping) breaths++;
        gulping = sea.gulp > 0;
        if (gulping) lifted = Math.max(lifted, sea.rise);
    }
    assert.ok(breaths >= 2 && breaths <= Math.ceil(200 / info.seaBreath[0]) + 1, `${breaths} breaths in 200 seconds`);
    assert.ok(lifted > 0.9, `its head came out: ${lifted}`);
    assert.ok(travelled > 40, `it swam ${travelled} blocks`);
    assert.equal(g.hurt.length, 0);
    assert.equal(sea.hunting, false);
    // Its neck is what lifts its head, and its flippers are what the movement beats.
    assert.equal(sea.neck.length, 1);
    assert.equal(mob.userData.wings.length, 4);
});

test('struck, it darts away; the seventh blow of a bare hand defeats it', () => {
    const g = pool();
    const mob = g.game.seaAnimalsSpawn('archelon', 8.5, -2, 7.5);
    g.camera.position.set(8.5, 1.62, -1.5);
    g.run(1);
    g.game.interactWithMob(mob);
    assert.equal(mob.userData.health, 24);
    assert.ok(mob.userData.sea.flee > 0, 'it makes off');
    for (let blow = 2; blow <= 6; blow++) g.game.interactWithMob(mob);
    assert.equal(mob.userData.health, 4);
    assert.ok(mob.parent !== null);
    g.game.interactWithMob(mob);
    assert.ok(mob.parent === null, 'defeated');
    assert.equal(g.game.ambientMobs.length, 0);
});
