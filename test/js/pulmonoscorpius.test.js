// Node tests for the Pulmonoscorpius (js/game/pulmonoscorpius.js): what it is next to the scorpion of today,
// what its page says of it, and that it comes for the player by day and stings with its tail and its poison.
// It has no code of its own: the real ground movement of mobs.js runs on a flat world
// (support/flat_world.js); only drawing and sound are left out. What every extinct animal has to be is
// asked of it by extinct_species.test.js.
// Nothing here hands a mob to an assertion: a failed one would print the whole harness.
// Run with: node --test test/js/pulmonoscorpius.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame();
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `289_${lang}_Pulmonoscorpius.md`), 'utf8');
const comma = (number) => String(number).replace('.', ',');
const server = fs.readFileSync(path.join(STATIC, '..', '..', 'network', 'animals.go'), 'utf8');
const revival = fs.readFileSync(path.join(STATIC, '..', '..', 'network', 'revival.go'), 'utf8');

test('what it is: the scorpion of today, bigger, tougher and awake by day, and what its page says of it', () => {
    const info = ctx.getMobSpecies('pulmonoscorpius');
    const scorpion = ctx.getMobSpecies('scorpion');
    assert.equal(info.movement, undefined, 'it walks as any ground mob, so the server walks a kept one');
    assert.equal(info.ancestorOf, 'scorpion');
    assert.ok(info.hostile === true && info.tailStrike === true && scorpion.tailStrike === true);
    assert.equal(info.nocturnal, undefined, 'big eyes: it hunts by day too');
    assert.equal(scorpion.nocturnal, true);
    assert.ok(info.attackDamage > scorpion.attackDamage && info.poison > scorpion.poison && info.maxHealth > scorpion.maxHealth);
    const spider = ctx.getMobSpecies('spider');
    const monster = ctx.getMobSpecies('cave_monster');
    assert.ok(info.attackDamage >= spider.attackDamage && info.attackDamage <= monster.attackDamage && info.maxHealth <= monster.maxHealth && info.chaseDistance <= 20, 'in the range of the living hunters');
    assert.equal(ctx.TAMING_DIET.pulmonoscorpius, undefined);
    assert.deepEqual({ ...ctx.TRAPS_SPECIES.pulmonoscorpius, baits: [...ctx.TRAPS_SPECIES.pulmonoscorpius.baits] }, { baits: [] });

    // Bigger than the scorpion of the game, as it was: both measured as js/game/herd.js does.
    const body = (species) => JSON.parse(vm.runInContext(`JSON.stringify(herdSpeciesBody('${species}'))`, ctx));
    assert.ok(body('pulmonoscorpius').height > body('scorpion').height);
    const rig = vm.runInContext(`(() => {
        const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'fur' });
        const made = VoxelModels.mobBuilders.pulmonoscorpius.call(VoxelModels, b, 0);
        return JSON.stringify({ legs: made.legs.length, tail: made.tail.length, eyes: ['eyeL', 'eyeR'].map((name) => b.byName.get(name).size), quarters: b.parts.every((part) => part.size.every((side) => side >= 0.25 && side * 4 === Math.round(side * 4))) });
    })()`, ctx);
    assert.deepEqual(JSON.parse(rig), { legs: 8, tail: 6, eyes: [[2, 2, 2.5], [2, 2, 2.5]], quarters: true });

    // The numbers of its page are those of the code: its own, and the server's rule for letting go.
    const chase = JSON.parse(vm.runInContext('JSON.stringify(animalsChaseOf(getMobSpecies("pulmonoscorpius")))', ctx));
    assert.deepEqual(chase, { chase: info.chaseDistance, chaseDay: 0, chaseSpeed: info.chaseSpeed });
    const loose = Number(/animalsChaseLoose = ([\d.]+)/.exec(server)[1]);
    const radius = Number(/"pulmonoscorpius":\s*\{[^}]*Radius: ([\d.]+)/.exec(revival)[1]);
    const es = page('ES');
    const en = page('EN');
    assert.ok(es.includes(`a menos de **${info.chaseDistance} bloques**`) && en.includes(`within **${info.chaseDistance} blocks**`), 'from how far it comes');
    assert.ok(es.includes(`**Corre a ${comma(info.chaseSpeed)} bloques por segundo.**`) && en.includes(`**It runs at ${info.chaseSpeed} blocks a second.**`));
    assert.ok(es.includes(`**${info.attackDamage} de daño**`) && en.includes(`**${info.attackDamage} damage**`));
    assert.ok(es.includes(`**veneno**: ${info.poison} puntos más de daño`) && en.includes(`**poison**: ${info.poison} more points of damage`));
    assert.ok(es.includes(`a más de ${info.chaseDistance * loose} bloques de él, o a más de ${radius + info.chaseDistance * loose} bloques de su casa`));
    assert.ok(en.includes(`more than ${info.chaseDistance * loose} blocks from it, or more than ${radius + info.chaseDistance * loose} blocks from its home`));
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 5, 6, 7, 8].map(blows), [3, 3, 2, 2, 2], 'bare-handed, and with a sword of wood, stone, iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 3 golpes a mano o con [espada](71) de madera, 2 con una de piedra o mejor`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 3 hits bare-handed or with a wooden [sword](71), 2 with a stone one or better`));
    const drops = JSON.parse(vm.runInContext('JSON.stringify(RESOURCE_DROPS.pulmonoscorpius)', ctx));
    assert.deepEqual(drops, [['venom_sac', 1, 2], ['shell', 1, 1, 0.5]]);
    assert.ok(es.includes('**1 o 2** ![saco de veneno](item:venom_sac) `venom_sac` y, la mitad de las veces, 1 ![concha](item:shell) `shell`'));
    assert.ok(en.includes('**1 or 2** ![venom sac](item:venom_sac) `venom_sac` and, half the time, 1 ![shell](item:shell) `shell`'));
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.pulmonoscorpius)', ctx));
    assert.deepEqual(fossil, { source: 'rock', rarity: 'rare', weight: 1, water: 0, seconds: 45 });
    assert.ok(es.includes(`tarda **${fossil.seconds} segundos**`) && en.includes(`takes **${fossil.seconds} seconds**`));
});

test('by day a wild one comes for the player from as far as it says, and its sting poisons', () => {
    const info = ctx.getMobSpecies('pulmonoscorpius');
    const g = makeFlatWorld(ctx);
    assert.equal(g.game.isNightTime(), false, 'it is day on the flat world');
    const mob = g.spawn('pulmonoscorpius', 0.5 + info.chaseDistance - 1, 0.5);
    // No more than 30 seconds of the game: it has 9 blocks to run at 1.2 a second.
    for (let i = 0; i < 30 * 30 && g.hurt.length === 0; i++) g.frame();
    assert.equal(g.hurt.length, 1, 'it reached them and stung');
    assert.deepEqual({ ...g.hurt[0], source: null }, { amount: info.attackDamage, reason: 'You were attacked by a pulmonoscorpius', type: 'mob', source: null });
    assert.equal(g.game.poison.ticks, info.poison);
    assert.ok(g.said.includes('You were poisoned by a pulmonoscorpius'));
    assert.ok(mob.userData.attackPose > 0 && mob.userData.tail.length === 6, 'and its tail is lunging (animateMobRig)');

    // A living scorpion, as far away and by day, stays where it is: it waits for the night.
    const calm = makeFlatWorld(ctx);
    const scorpion = calm.spawn('scorpion', 0.5 + ctx.getMobSpecies('scorpion').chaseDistance - 1, 0.5);
    calm.run(8);
    assert.equal(calm.hurt.length, 0);
    assert.ok(Math.hypot(scorpion.position.x - 0.5, scorpion.position.z - 0.5) > 1.5);
});
