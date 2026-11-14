// Node tests for the megalodon (js/game/megalodon.js): what it is, and that the 'cruise' movement of every sea
// animal (js/game/sea_animals.js) carries it as its page says: a long body that cruises a lake, hunts a player
// who is in its water and bites, and leaves alone one who is on the shore. The real mobs.js, sea_animals.js,
// camera.js and world.js run on a flat world with a lake dug in it (support/flat_world.js); only drawing and
// sound are left out. What every extinct animal has to be is asked of it by extinct_species.test.js, and how the
// movement itself works (long bodies, closing in, prey) by sea_animals.test.js.
// Nothing here hands a mob to an assertion: a failed one would print the whole harness.
// Run with: node --test test/js/megalodon.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame();
const SEA = JSON.parse(vm.runInContext('JSON.stringify(SEA)', ctx));
const body = JSON.parse(vm.runInContext("(() => { const b = seaAnimalsBody('megalodon'); return JSON.stringify({ front: b.front, back: b.back, half: b.half, height: b.height, length: b.length }); })()", ctx));
const guide = fs.readdirSync(path.join(STATIC, 'guide')).map((name) => name.normalize('NFC'));
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', guide.find((name) => name.startsWith(`305_${lang}_`))), 'utf8');
const comma = (number) => String(number).replace('.', ',');

// A lake 32 by 22 and 4 deep, its water from y = -4 to y = -1.
const LAKE = { x1: 32, z1: 22, depth: 4 };
function lake() {
    const blocks = {};
    for (let x = 0; x < LAKE.x1; x++) for (let z = 0; z < LAKE.z1; z++) for (let y = -LAKE.depth; y <= -1; y++) blocks[`${x},${y},${z}`] = 'water';
    const g = makeFlatWorld(ctx, { x: -3.5, z: 11, blocks, seed: 31 });
    g.world.addRipple = () => {};
    g.game.spawnSplash = () => {};
    g.game.getSelectedHeldItemType = () => null;
    const wet = (x, y, z) => g.world.getBlockTypeAt(Math.floor(x), Math.floor(y), Math.floor(z)) === 'water';
    const swim = (x, z) => { g.camera.position.set(x, -0.5, z); g.cameraController.isInWater = true; };
    const ashore = (x, z) => { g.camera.position.set(x, 1.62, z); g.cameraController.isInWater = false; };
    return { ...g, wet, swim, ashore };
}

test('what it is: a hostile giant shark nine blocks long, and what its page says of it', () => {
    const info = ctx.getMobSpecies('megalodon');
    assert.equal(info.movement, 'cruise');
    assert.equal(info.ancestorOf, undefined, 'no living relative in the game');
    assert.equal(info.hostile, true);
    assert.equal(info.seaBreath, undefined, 'it has gills');
    assert.ok(info.chaseDistance <= 20 && info.chaseSpeed > info.speed);
    assert.equal(ctx.TAMING_DIET.megalodon, undefined);
    assert.equal(JSON.stringify(ctx.TRAPS_SPECIES.megalodon), '{"baits":[]}');
    assert.equal(JSON.stringify(vm.runInContext("animalsChaseOf(getMobSpecies('megalodon'))", ctx)), '{"chase":0,"chaseDay":0,"chaseSpeed":0}');
    assert.ok(Math.abs(body.length - 9) < 0.2, `${body.length} blocks long`);
    assert.ok(Math.abs(body.front - body.back) < 0.4, 'its middle is the middle of it: that is what it turns about');
    assert.ok(body.height > 2.3 && body.height < 2.7, `${body.height} tall with its fin`);
    assert.ok(body.length > SEA.long, 'a long body, for the movement');
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.megalodon)', ctx));
    assert.deepEqual(fossil, { source: 'skeleton', rarity: 'legendary', weight: 2, water: 300, seconds: 120 });

    // The numbers of its page are those of the code.
    const es = page('ES');
    const en = page('EN');
    assert.ok(es.split('\n')[0] === '# Megalodón' && en.split('\n')[0] === '# Megalodon');
    assert.ok(es.includes('**9 bloques de largo**') && en.includes('**9 blocks long**'));
    assert.ok(es.includes(`a menos de **${info.chaseDistance} bloques**`) && en.includes(`within **${info.chaseDistance} blocks**`), 'from how far it comes');
    assert.ok(es.includes(`**${comma(info.chaseSpeed)} bloques por segundo**`) && en.includes(`**${info.chaseSpeed} blocks a second**`), 'how fast');
    assert.ok(4.5 * 0.55 > info.chaseSpeed && es.includes('Tú nadas un poco más rápido') && en.includes('You swim a little faster than that'));
    assert.ok(es.includes(`**${info.attackDamage} de daño**, como mucho una vez cada ${comma(SEA.biteEvery)} segundos`) && en.includes(`**${info.attackDamage} damage**, at most once every ${SEA.biteEvery} seconds`));
    assert.equal(info.seaRange, undefined);
    assert.equal(Math.round(3 + body.length), 12);
    assert.equal(Math.round(3 + body.length + info.chaseDistance), 26);
    assert.ok(es.includes('más de unos 12 bloques') && es.includes('hasta unos 26 bloques') && en.includes('than about 12 blocks') && en.includes('up to about 26 blocks'));
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 6, 7, 8].map(blows), [20, 14, 12, 10], 'bare-handed, and with a sword of stone, iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 20 golpes a mano, 14 con una [espada](71) de piedra, 12 con una de hierro, 10 con una de oro`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 20 hits bare-handed, 14 with a stone [sword](71), 12 with an iron one, 10 with a golden one`));
    const drops = JSON.parse(vm.runInContext('JSON.stringify(RESOURCE_DROPS.megalodon)', ctx));
    assert.deepEqual(drops, [['raw_fish', 3, 6]]);
    assert.ok(es.includes('de **3 a 6**') && en.includes('**3 to 6**'));
    assert.ok(es.includes(`Hay **${info.variants} colores**`) && en.includes(`There are **${info.variants} colours**`));
    assert.ok(es.includes(`**${fossil.water} bloques de agua**`) && en.includes(`**${fossil.water} blocks of water**`));
    assert.ok(es.includes(`tarda ${fossil.seconds} segundos`) && en.includes(`takes ${fossil.seconds} seconds`));
    for (const piece of ['skull', 'spine', 'tail']) assert.ok(es.includes(`fossil_megalodon_${piece}`) && en.includes(`fossil_megalodon_${piece}`));
    // Its prey are what the movement lets it chase: the peaceful sea animals shorter than its share.
    const prey = vm.runInContext(`Object.keys(MOB_SPECIES).filter((id) => MOB_SPECIES[id].movement === 'cruise' && !MOB_SPECIES[id].hostile && seaAnimalsBody(id).length < seaAnimalsBody('megalodon').length * SEA.preyShare).sort().join()`, ctx);
    assert.equal(prey, 'ammonite,archelon,trilobite');
    assert.ok(es.includes('[arquelones](286), los\n  [amonites](267) y los [trilobites](266)') && en.includes('[archelons](286),\n  [ammonites](267) and [trilobites](266)'));
});

test('in its lake it cruises without ever leaving the water; a player in it is hunted and bitten, one on the shore is safe', () => {
    const g = lake();
    const info = ctx.getMobSpecies('megalodon');
    const mob = g.game.seaAnimalsSpawn('megalodon', 16, -2, 11);
    assert.ok(mob, 'it has a body in the water');
    const sea = mob.userData.sea;
    g.ashore(-1.5, 11);
    let swum = 0;
    const last = mob.position.clone();
    for (let i = 0; i < 30 * 60; i++) {
        g.frame();
        assert.ok(g.wet(mob.position.x, mob.position.y + 0.02, mob.position.z), `frame ${i}: its middle is out of the water`);
        assert.ok(sea.hunting === false);
        swum += Math.hypot(mob.position.x - last.x, mob.position.z - last.z);
        last.copy(mob.position);
    }
    assert.equal(g.hurt.length, 0, 'safe on the shore');
    assert.ok(swum > info.speed * 60 * 0.6, `it swam ${swum.toFixed(1)} blocks in a minute`);
    // In the water, within its reach: it comes and bites, its jaw opening.
    g.swim(mob.position.x + 6, 11);
    const jaw = mob.userData.modelParts.jaw;
    let gape = 0;
    for (let i = 0; i < 30 * 60; i++) {
        g.frame();
        gape = Math.max(gape, jaw.rotation.x - jaw.userData.baseRotation.x);
    }
    assert.ok(g.hurt.length >= 3, `${g.hurt.length} bites in a minute`);
    assert.ok(g.hurt.every((bite) => bite.amount === info.attackDamage && bite.type === 'mob' && bite.reason === 'You were bitten by a megalodon'));
    assert.ok(gape > 0.3, `its jaw opens ${gape}`);
    // One step on to the shore and it forgets them.
    g.ashore(-1.5, 11);
    const bites = g.hurt.length;
    g.run(20);
    assert.equal(g.hurt.length, bites);
    assert.ok(sea.hunting === false);
});

test('struck, it darts away; it takes twenty blows of a bare hand', () => {
    const g = lake();
    const mob = g.game.seaAnimalsSpawn('megalodon', 16, -2, 11);
    g.ashore(16, -1.5);
    g.run(1);
    g.game.interactWithMob(mob);
    assert.equal(mob.userData.health, 76);
    assert.ok(mob.userData.sea.flee > 0, 'it makes off');
    for (let blow = 2; blow <= 19; blow++) g.game.interactWithMob(mob);
    assert.equal(mob.userData.health, 4);
    assert.ok(mob.parent !== null);
    g.game.interactWithMob(mob);
    assert.ok(mob.parent === null, 'defeated');
});

test('its model: a shark, with a tail of three joints that sways, a jaw that opens, and its fins', () => {
    const parts = JSON.parse(vm.runInContext(`(() => {
        const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'skin' });
        const rig = VoxelModels.mobBuilders.megalodon.call(VoxelModels, b, 0);
        return JSON.stringify({ names: b.parts.map((part) => part.name), rig });
    })()`, ctx));
    for (const name of ['head', 'snout', 'jaw', 'dorsal', 'caudalUp', 'caudalDown', 'pectoralL', 'pectoralR']) assert.ok(parts.names.includes(name), name);
    assert.deepEqual(parts.rig.tail, ['tail0', 'tail1', 'tail2']);
    assert.equal(parts.rig.wings, undefined, 'no flippers: a shark swims with its tail, and its body swings against it');
});
