// Node tests for the Callichimaera (js/game/callichimaera.js): what it is, what its page says of it, and
// what its model has to show: eyes far too big, four oars the rig rows with, and a body longer than wide,
// since it walks forwards on the ground movement and not sideways as the crab does. It has no code of its
// own to try; what every extinct animal has to be is asked of it by extinct_species.test.js.
// Run with: node --test test/js/callichimaera.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame();
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `291_${lang}_Callichimaera.md`), 'utf8');

test('what it is: a peaceful walker nobody tames, not a crab that scuttles, and what its page says of it', () => {
    const info = ctx.getMobSpecies('callichimaera');
    assert.equal(info.movement, undefined, 'the ground movement: forwards, and the server walks a kept one');
    assert.equal(ctx.getMobSpecies('crab').movement, 'scuttle');
    assert.equal(info.ancestorOf, 'crab');
    assert.equal(info.hostile, undefined);
    assert.equal(ctx.TAMING_DIET.callichimaera, undefined);
    assert.deepEqual({ ...ctx.TRAPS_SPECIES.callichimaera, baits: [...ctx.TRAPS_SPECIES.callichimaera.baits] }, { baits: [], cage: true });

    const es = page('ES');
    const en = page('EN');
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 5, 6, 7, 8].map(blows), [2, 2, 1, 1, 1], 'bare-handed, and with a sword of wood, stone, iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 2 golpes a mano o con [espada](71) de madera, 1 con una de piedra o mejor`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 2 hits bare-handed or with a wooden [sword](71), 1 with a stone one or better`));
    assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(RESOURCE_DROPS.callichimaera)', ctx)), [['shell', 1, 1]]);
    assert.ok(es.includes('Deja 1 ![concha](item:shell) `shell`') && en.includes('It leaves 1 ![shell](item:shell) `shell`'));
    assert.equal(info.variants, 2);
    assert.ok(es.includes('Hay **2 colores**') && en.includes('There are **2 colours**'));
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.callichimaera)', ctx));
    assert.deepEqual(fossil, { source: 'rock', rarity: 'rare', weight: 1, water: 0, seconds: 45 });
    assert.ok(es.includes(`tarda **${fossil.seconds} segundos**`) && en.includes(`takes **${fossil.seconds} seconds**`));
    assert.ok(es.includes('no necesita agua') && en.includes('needs no water'));
});

test('its model: two eyes that together are wider than its body, four oars and a tail for the rig, a shell longer than wide', () => {
    const model = JSON.parse(vm.runInContext(`(() => {
        const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'fur' });
        const rig = VoxelModels.mobBuilders.callichimaera.call(VoxelModels, b, 0);
        const size = (name) => b.byName.get(name).size;
        return JSON.stringify({
            rig, body: size('body'), eye: size('eyeL'), paddles: ['paddleL0', 'paddleR0', 'paddleL1', 'paddleR1'].map(size),
            quarters: b.parts.every((part) => part.size.every((side) => side >= 0.25 && side * 4 === Math.round(side * 4)))
        });
    })()`, ctx));
    assert.ok(model.eye[0] * 2 > model.body[0], 'huge eyes');
    assert.ok(model.body[2] > model.body[0], 'longer than wide: no crab');
    for (const paddle of model.paddles) assert.ok(paddle[2] >= 4 * paddle[1] && paddle[0] > paddle[2], 'a wide, flat blade');
    assert.deepEqual(model.rig.legs.slice(0, 4), ['legL0', 'legR0', 'legL1', 'legR1'], 'the oars are the first legs the rig swings');
    assert.equal(model.rig.legAxis, 'y', 'to and fro, as oars');
    assert.deepEqual(model.rig.tail, ['tail', 'tailTip']);
    assert.ok(model.quarters, 'every size a number of quarters of a unit, so every face gets its texels');
});

test('on the flat world it goes the way it faces: forwards, where a crab goes sideways', () => {
    const g = makeFlatWorld(ctx, { x: 30.5, z: 0.5 });
    const mob = g.spawn('callichimaera', 2.5, 0.5);
    const from = { x: mob.position.x, z: mob.position.z };
    // Up to 20 seconds for it to have walked a block from where it began.
    let went = 0;
    for (let i = 0; i < 20 * 30 && went < 1; i++) {
        const before = { x: mob.position.x, z: mob.position.z };
        g.frame();
        const step = Math.hypot(mob.position.x - before.x, mob.position.z - before.z);
        if (step > 1e-6 && i > 30) {
            // Models face +z, and a mob's rotation turns that to where it goes (js/game/mobs.js).
            const facing = Math.PI / 2 - mob.rotation.y;
            const going = Math.atan2(mob.position.z - before.z, mob.position.x - before.x);
            const off = Math.abs(Math.atan2(Math.sin(facing - going), Math.cos(facing - going)));
            assert.ok(off < 1.2, `frame ${i}: it faces ${facing.toFixed(2)} and goes ${going.toFixed(2)}`);
        }
        went = Math.hypot(mob.position.x - from.x, mob.position.z - from.z);
    }
    assert.ok(went >= 1, `it walked ${went} blocks`);
    assert.ok(Math.abs(mob.position.y) < 0.01, 'on the ground');
});
