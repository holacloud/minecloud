// Node tests for the Dunkleosteus (js/game/dunkleosteus.js): what it is, and that the 'cruise' movement of
// every sea animal (js/game/sea_animals.js) carries it as its page says: it goes for a player who is in its
// water and bites, and leaves alone one who is on the shore. The real mobs.js, sea_animals.js, camera.js and
// world.js run on a flat world with a pool dug in it (support/flat_world.js); only drawing and sound are
// left out. What every extinct animal has to be is asked of it by extinct_species.test.js, and how the
// movement itself works by sea_animals.test.js.
// Run with: node --test test/js/dunkleosteus.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame();
const SEA = JSON.parse(vm.runInContext('JSON.stringify(SEA)', ctx));
const body = JSON.parse(vm.runInContext("(() => { const b = seaAnimalsBody('dunkleosteus'); return JSON.stringify({ front: b.front, back: b.back, half: b.half, height: b.height, length: b.length }); })()", ctx));
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `288_${lang}_Dunkleosteus.md`), 'utf8');
const comma = (number) => String(number).replace('.', ',');

// A pool 20 by 14 and 4 deep, its water from y = -4 to y = -1.
const POOL = { x0: 0, x1: 20, z0: 0, z1: 14, depth: 4 };
function pool() {
    const blocks = {};
    for (let x = POOL.x0; x < POOL.x1; x++) for (let z = POOL.z0; z < POOL.z1; z++) for (let y = -POOL.depth; y <= -1; y++) blocks[`${x},${y},${z}`] = 'water';
    const g = makeFlatWorld(ctx, { x: -3.5, z: 7.5, blocks });
    g.world.addRipple = () => {};
    g.game.spawnSplash = () => {};
    g.game.getSelectedHeldItemType = () => null;
    const wet = (x, y, z) => g.world.getBlockTypeAt(Math.floor(x), Math.floor(y), Math.floor(z)) === 'water';
    // The player in the water at (x, z), up to the neck in it; or out of it, on the shore.
    const swim = (x, z) => { g.camera.position.set(x, -0.5, z); g.cameraController.isInWater = true; };
    const ashore = (x, z) => { g.camera.position.set(x, 1.62, z); g.cameraController.isInWater = false; };
    return { ...g, wet, swim, ashore };
}

test('what it is: a hostile armoured fish that swims with its tail, three and a half blocks long, and what its page says of it', () => {
    const info = ctx.getMobSpecies('dunkleosteus');
    assert.equal(info.movement, 'cruise');
    assert.equal(info.ancestorOf, 'fish');
    assert.equal(info.hostile, true);
    assert.equal(info.seaBreath, undefined, 'it has gills');
    assert.ok(info.chaseDistance <= 20 && info.chaseSpeed > info.speed);
    assert.equal(ctx.TAMING_DIET.dunkleosteus, undefined);
    assert.equal(JSON.stringify(ctx.TRAPS_SPECIES.dunkleosteus), '{"baits":[]}');
    // The server keeps it and does not walk it, so it tells no client whom it is after: each one's own player.
    assert.equal(JSON.stringify(vm.runInContext("animalsChaseOf(getMobSpecies('dunkleosteus'))", ctx)), '{"chase":0,"chaseDay":0,"chaseSpeed":0}');
    assert.ok(body.length > 3.2 && body.length < 3.8, `${body.length} blocks long`);
    assert.ok(Math.abs(body.front - body.back) < 0.4, 'its middle is the middle of it: that is what it turns about');

    // The numbers of its page are those of the code.
    const es = page('ES');
    const en = page('EN');
    assert.ok(es.includes('**3,5 bloques de largo**') && en.includes('**3.5 blocks long**'));
    assert.ok(es.includes(`a menos de **${info.chaseDistance} bloques**`) && en.includes(`within **${info.chaseDistance} blocks**`), 'from how far it comes');
    assert.ok(es.includes(`a\n  **${info.chaseSpeed} bloques por segundo**`) && en.includes(`at\n  **${info.chaseSpeed} blocks a second**`), 'how fast');
    assert.ok(es.includes(`**${info.attackDamage} de daño**, como mucho una vez cada ${comma(SEA.biteEvery)} segundos`) && en.includes(`**${info.attackDamage} damage**, at most once every ${SEA.biteEvery} seconds`));
    // A player swims at 0.55 of their walk (js/camera.js): a little faster than it comes.
    const camera = fs.readFileSync(path.join(STATIC, 'js', 'camera.js'), 'utf8');
    assert.ok(camera.includes('this.moveSpeed = 4.5;') && camera.includes('baseSpeed * (this.mount ? 0.35 : 0.55)'));
    assert.ok(4.5 * 0.55 > info.chaseSpeed && es.includes('Tú nadas un poco más rápido') && en.includes('You swim a little faster than that'));
    // How far it roams, and how far it follows: 3 blocks and its own length, and its reach beyond that.
    assert.equal(info.seaRange, undefined);
    assert.equal(Math.round(3 + body.length), 6);
    assert.equal(Math.round(3 + body.length + info.chaseDistance), 15);
    assert.ok(es.includes('más de unos 6 bloques') && es.includes('hasta unos 15 bloques') && en.includes('than about 6 blocks') && en.includes('up to about 15 blocks'));
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 6, 7, 8].map(blows), [8, 5, 5, 4], 'bare-handed, and with a sword of stone, iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 8 golpes a mano, 5 con una [espada](71) de piedra o de hierro, 4 con una de oro`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 8 hits bare-handed, 5 with a stone or an iron [sword](71), 4 with a golden one`));
    assert.ok(es.includes(`Hay **${info.variants} colores**`) && en.includes(`There are **${info.variants} colours**`));
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.dunkleosteus)', ctx));
    assert.deepEqual(fossil, { source: 'rock', rarity: 'rare', weight: 1, water: 60, seconds: 45 });
    assert.ok(es.includes(`**${fossil.water} bloques de agua**`) && en.includes(`**${fossil.water} blocks of water**`));
    assert.ok(es.includes(`tarda ${fossil.seconds} segundos`) && en.includes(`takes ${fossil.seconds} seconds`));
    assert.ok(es.includes('](252)') && en.includes('](252)'), 'a shield takes its bite as any blow that comes from somewhere');
});

test('a player in its water is hunted and bitten, its jaw opening as it bites; out of the water nothing reaches them', () => {
    const g = pool();
    const info = ctx.getMobSpecies('dunkleosteus');
    const mob = g.game.seaAnimalsSpawn('dunkleosteus', 4.5, -2, 7.5);
    assert.ok(mob, 'it has a body in the water');
    const sea = mob.userData.sea;
    // On the shore, right by its pool, for a whole minute: nothing.
    g.ashore(-1.5, 7.5);
    for (let i = 0; i < 30 * 60; i++) {
        g.frame();
        assert.ok(g.wet(mob.position.x, mob.position.y + 0.02, mob.position.z), `frame ${i}: its middle is out of the water`);
        assert.equal(sea.hunting, false);
    }
    assert.equal(g.hurt.length, 0);
    // In the water, within its reach: it comes, and bites.
    g.swim(Math.min(POOL.x1 - 2, mob.position.x + info.chaseDistance - 2), 7.5);
    const jaw = mob.userData.modelParts.jaw;
    let gape = 0;
    let frames = 0;
    for (; frames < 30 * 20 && g.hurt.length === 0; frames++) g.frame();
    assert.equal(g.hurt.length, 1, `no bite in ${frames / 30} seconds`);
    assert.equal(g.hurt[0].amount, info.attackDamage);
    assert.equal(g.hurt[0].reason, 'You were bitten by a dunkleosteus');
    assert.equal(g.hurt[0].type, 'mob');
    assert.equal(sea.hunting, true);
    for (let i = 0; i < 12; i++) {
        g.frame();
        gape = Math.max(gape, jaw.rotation.x - jaw.userData.baseRotation.x);
    }
    assert.ok(gape > 0.3, `its jaw opens ${gape}`);
    // It goes on biting whoever paddles about in its water (a circle of 2 blocks, at 1 block a second), no
    // faster than its page says.
    const centre = { x: g.camera.position.x - 2, z: g.camera.position.z };
    const times = [];
    for (let i = 0; i < 30 * 30; i++) {
        g.camera.position.set(centre.x + Math.cos(i / 60) * 2, -0.5, centre.z + Math.sin(i / 60) * 2);
        const before = g.hurt.length;
        g.frame();
        if (g.hurt.length > before) times.push(i / 30);
    }
    assert.ok(times.length >= 4, `${times.length} more bites in 30 seconds`);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= SEA.biteEvery - 0.05, `two bites ${times[i] - times[i - 1]} seconds apart`);
    assert.ok(g.hurt.every((bite) => bite.amount === info.attackDamage && bite.type === 'mob'));
    // One step on to the shore and it forgets them.
    g.ashore(-1.5, 7.5);
    const bites = g.hurt.length;
    g.run(20);
    assert.equal(g.hurt.length, bites);
    assert.equal(sea.hunting, false);
});

test('struck, it darts away; the eighth blow of a bare hand defeats it', () => {
    const g = pool();
    const mob = g.game.seaAnimalsSpawn('dunkleosteus', 8.5, -2, 7.5);
    g.ashore(8.5, -1.5);
    g.run(1);
    g.game.interactWithMob(mob);
    assert.equal(mob.userData.health, 26);
    assert.ok(mob.userData.sea.flee > 0, 'it makes off');
    for (let blow = 2; blow <= 7; blow++) g.game.interactWithMob(mob);
    assert.equal(mob.userData.health, 2);
    assert.ok(mob.parent !== null);
    g.game.interactWithMob(mob);
    assert.ok(mob.parent === null, 'defeated');
    assert.equal(g.game.ambientMobs.length, 0);
});
