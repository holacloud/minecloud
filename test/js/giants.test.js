// Node tests for the two giants (js/game/diplodocus.js, js/game/tyrannosaurus.js): what they cost a tablet
// (parts, which are draw calls; the size of their texture; nothing made in what runs every frame; ten cost
// ten times one), their size next to the giraffe, a body that does not walk into walls, roofs or doorways
// and pushes the player out of its legs, the diplodocus eating from the treetops and carrying a rider high up,
// and the tyrannosaurus slow to turn, biting with its jaws and roaring before it charges. The real mobs.js,
// charge.js, riding.js, herd.js, camera.js and world.js run on a flat world (support/flat_world.js); only
// drawing and sound are left out. What every extinct animal has to be is asked by extinct_species.test.js.
// Run with: node --test test/js/giants.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { JS } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld, Vector3 } = require('./support/flat_world.js');

const ctx = loadFlatGame({ listenersOf: ['js/game/charge.js', 'js/game/diplodocus.js', 'js/game/tyrannosaurus.js'], frameUpdates: ['giantUpdate', 'chargeUpdate'] });
const run = (code) => vm.runInContext(code, ctx);
const DIPLO = ctx.getMobSpecies('diplodocus');
const REX = ctx.getMobSpecies('tyrannosaurus');
const MOUTH = run('DIPLODOCUS_MOUTH');
const HUNT = run('TYRANNOSAURUS');
// No assertion here is ever given a mob or the game: when one fails node prints both sides, and a mob of this
// harness is a graph of stand-ins with no end. Numbers, strings and yes or no only.

// A goal for one mob, asked first: (mob) => [x, z, speed, stopDistance] or null.
function steer(mob, where) {
    const provider = function (other) {
        if (other !== mob) return null;
        const to = where(other);
        if (!to) return null;
        return Object.assign(new Vector3(to[0], other.position.y, to[1]), { speed: to[2], stopDistance: to[3] ?? 0.3 });
    };
    ctx.MOB_GOAL_PROVIDERS.unshift(provider);
    return () => ctx.MOB_GOAL_PROVIDERS.splice(ctx.MOB_GOAL_PROVIDERS.indexOf(provider), 1);
}
// Standing still where it is, facing +z (models face +z, rotation.y = 0).
const standStill = (mob) => steer(mob, (m) => [m.position.x, m.position.z + 0.05, 0, 1]);

// What a model costs, read from its parts as the game builds it, in standard and in high quality.
function cost(id) {
    return JSON.parse(run(`(() => {
        const out = {};
        for (const hd of [false, true]) {
            const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd, defaultSurface: 'fur' });
            VoxelModels.mobBuilders['${id}'].call(VoxelModels, b, 0);
            const atlas = b.packAtlas();
            out[hd ? 'hd' : 'sd'] = Math.max(atlas.width, atlas.height);
            out.parts = b.parts.length;
        }
        return JSON.stringify(out);
    })()`));
}

test('what they cost: few parts (one draw call each), a texture no bigger than 512 (2048 in high quality)', () => {
    const giraffe = cost('giraffe');
    const plesiosaur = cost('plesiosaur');
    for (const id of ['diplodocus', 'tyrannosaurus']) {
        const own = cost(id);
        // Each part is one mesh with the species' one material (VoxelModelBuilder.build): one draw call.
        assert.ok(own.parts <= 32, `${id}: ${own.parts} parts (the giraffe has ${giraffe.parts}, the plesiosaur ${plesiosaur.parts})`);
        assert.ok(own.parts <= plesiosaur.parts + 4, `${id}: no more than a few parts over the plesiosaur's`);
        assert.ok(own.sd <= 512 && own.hd <= 2048, `${id}: a texture of ${own.sd} (${own.hd} in high quality)`);
    }
});

test('their size: the diplodocus 14 blocks long and 5 tall at the hips, the tyrannosaurus 8 by 4.2; the health bar over the back', () => {
    const g = makeFlatWorld(ctx);
    const giraffe = g.spawn('giraffe', -10.5, 0.5);
    const diplo = g.spawn('diplodocus', 0.5, 0.5);
    const rex = g.spawn('tyrannosaurus', 20.5, 0.5);
    const height = (mob) => g.game.herdHeight(mob);
    assert.ok(height(diplo) > 4.8 && height(diplo) < 5.3, `the diplodocus is ${height(diplo)} at the hips`);
    assert.ok(height(rex) > 4 && height(rex) < 4.4, `the tyrannosaurus is ${height(rex)} at the hips`);
    assert.ok(height(diplo) > height(giraffe) * 1.3, 'far over a giraffe');
    for (const mob of [diplo, rex]) {
        const bar = mob.userData.healthBar.position.y - 0.35;
        assert.ok(Math.abs(bar - height(mob)) < 0.01, `${mob.userData.species}: the bar over its back at ${bar}`);
        assert.ok(g.game.herdRadius(mob) <= 7.5, `${mob.userData.species}: it reaches ${g.game.herdRadius(mob)} from its middle`);
    }
    // Its head stands up among the leaves of a tree: 4 to 10 blocks over the ground in this world's trees.
    assert.ok(MOUTH.y > 5.5 && MOUTH.y < 7 && MOUTH.z > 5 && MOUTH.z < 7, `its mouth at ${MOUTH.y} up and ${MOUTH.z} ahead`);
    assert.equal(diplo.userData.legs.length, 4);
    assert.equal(rex.userData.legs.length, 2);
    assert.equal(rex.userData.arms.length, 2);
    assert.ok(diplo.userData.tail.length >= 8 && rex.userData.tail.length >= 5, 'tails of many pieces, swayed one by one');
});

test('nothing is made in what runs every frame, and ten giants cost ten times one', () => {
    const perFrame = ['giantUpdate', 'giantHoldBack', 'giantHoldRider', 'giantWayBlocked', 'giantCellBlocked', 'giantStep', 'giantPushPlayer', 'diplodocusBrowse', 'diplodocusLeavesSide', 'tyrannosaurusHunt', 'tyrannosaurusCharging', 'tyrannosaurusAfterMe'];
    for (const name of perFrame) {
        const source = String(ctx.Game.prototype[name]);
        assert.ok(!/\bnew\b|\.map\(|\.filter\(|\.slice\(|\.concat\(|\.\.\.|=>/.test(source), `${name} makes something every frame`);
    }

    // Vectors made by the whole walk of the mobs (js/game/mobs.js makes a few for every mob, whatever its
    // species): ten diplodocus make no more than ten pigs.
    const known = run('THREE');
    const Plain = known.Vector3;
    let made = 0;
    known.Vector3 = class extends Plain { constructor(...args) { super(...args); made++; } };
    const madeBy = (species, count) => {
        const g = makeFlatWorld(ctx);
        for (let i = 0; i < count; i++) g.spawn(species, -27.5 + (i % 5) * 14, i < 5 ? -14.5 : 15.5);
        g.run(1);
        made = 0;
        let lookups = 0;
        const boxes = g.cameraController.getCellBoxes.bind(g.cameraController);
        g.cameraController.getCellBoxes = (...cell) => { lookups++; return boxes(...cell); };
        g.run(10);
        return { made, lookups };
    };
    try {
        const pigs = madeBy('pig', 10);
        const giants = madeBy('diplodocus', 10);
        const one = madeBy('diplodocus', 1);
        assert.ok(giants.made <= pigs.made, `ten diplodocus made ${giants.made} vectors in 300 frames, ten pigs ${pigs.made}`);
        assert.ok(giants.lookups <= one.lookups * 10 * 1.2 + 3000, `ten looked at ${giants.lookups} cells, one at ${one.lookups}`);
    } finally {
        known.Vector3 = Plain;
    }
});

// A row of blocks across its way at x, from z = -4 to 4.
const across = (x, type, ys) => Object.fromEntries(ys.flatMap((y) => [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((z) => [`${x},${y},${z}`, type])));

test('a giant stops with its chest short of a wall and of a doorway too low for it, where a pig walks on', () => {
    const walk = (species, blocks) => {
        const g = makeFlatWorld(ctx, { x: 0.5, z: -30.5, blocks });
        const mob = g.spawn(species, 0.5, 0.5);
        const done = steer(mob, () => [20, 0.5, 2]);
        g.run(8);
        done();
        return mob.position.x;
    };
    const wall = across(6, 'stone', [0, 1]);
    assert.ok(walk('pig', wall) > 5, 'a pig walks up to the wall');
    const diplo = walk('diplodocus', wall);
    assert.ok(diplo < 6 - DIPLO.giant.front + 0.6 && diplo > 2, `the diplodocus stops ${6 - diplo} blocks from the wall`);
    // A lintel 3 blocks up (a doorway): room for a pig, none for a body 5 blocks tall.
    const lintel = across(6, 'stone', [2]);
    assert.ok(walk('pig', lintel) > 10, 'a pig walks under it');
    assert.ok(walk('diplodocus', lintel) < 6, 'the diplodocus does not');
    assert.ok(walk('tyrannosaurus', lintel) < 6, 'nor the tyrannosaurus');
    // A ledge of one block is a step; a ditch four deep is not.
    assert.ok(walk('diplodocus', across(6, 'stone', [0])) > 10, 'it steps up one block');
    const ditch = { ...across(6, 'air', [-1, -2, -3, -4]), ...across(7, 'air', [-1, -2, -3, -4]) };
    assert.ok(walk('diplodocus', ditch) < 6, 'it does not walk into a ditch 4 deep');
});

test('the player is pushed out of its legs and its body, and may stand under its belly', () => {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('diplodocus', 0.5, 0.5);
    const done = standStill(mob);
    // Inside its left front leg (x 11/16 out, z 15/16 forward of its middle).
    g.stand(0.5 + 11 / 16, 0.5 + 15 / 16);
    g.run(0.2);
    const leg = DIPLO.giant.boxes[1];
    const lx = g.camera.position.x - 0.5;
    const lz = g.camera.position.z - 0.5;
    assert.ok(lx < leg[0] - 0.29 || lx > leg[1] + 0.29 || lz < leg[4] - 0.29 || lz > leg[5] + 0.29, `out of the leg: ${lx}, ${lz}`);
    // Under its belly, between the legs: 2.4 blocks of room over a player 1.8 tall.
    g.stand(0.5, 0.5);
    g.run(0.5);
    assert.ok(Math.abs(g.camera.position.x - 0.5) < 0.01 && Math.abs(g.camera.position.z - 0.5) < 0.01, 'left alone under it');
    done();
});

test('the diplodocus eats from the treetops: with leaves at its mouth it raises its neck and chews, and takes no block', () => {
    const cell = [Math.floor(0.5), Math.floor(MOUTH.y), Math.floor(0.5 + MOUTH.z)];
    const g = makeFlatWorld(ctx, { x: -6.5, z: 0.5, blocks: { [cell.join(',')]: 'leaves' } });
    const mob = g.spawn('diplodocus', 0.5, 0.5);
    const done = standStill(mob);
    let eats = false;
    let chews = 0;
    for (let i = 0; i < 120; i++) {
        g.frame();
        if (mob.userData.diplodocusEating > 0) eats = true;
        chews = Math.max(chews, mob.userData.modelParts.jaw.rotation.x - mob.userData.modelParts.jaw.userData.baseRotation.x);
    }
    assert.ok(eats, 'it found the leaves');
    assert.ok(chews > 0.2, 'its jaw went');
    assert.ok(mob.userData.lookPitch < 0, 'its neck up');
    assert.equal(g.world.getBlockTypeAt(cell[0], cell[1], cell[2]), 'leaves', 'the leaves are still there');
    done();

    const bare = makeFlatWorld(ctx, { x: -6.5, z: 0.5 });
    const alone = bare.spawn('diplodocus', 0.5, 0.5);
    const stop = standStill(alone);
    bare.run(4);
    assert.ok(!(alone.userData.diplodocusEating > 0), 'no leaves, nothing to eat');
    stop();
});

test('the diplodocus is tamed with leaves and ridden from high on its back, never into a wall', () => {
    assert.ok(ctx.Game.prototype.tamingCanTame.call({}, 'diplodocus'));
    assert.ok(ctx.TAMING_DIET.diplodocus.foods.includes('leaves'));
    const mount = DIPLO.mount;
    const horse = ctx.getMobSpecies('horse').mount;
    assert.ok(mount.speed < horse.speed / 2, 'very slow');
    assert.ok(Math.abs(mount.eyeHeight - mount.seat - 1.62) < 0.01, 'the eyes of somebody sitting there');

    // A roof 7 blocks up leaves 7 free cells: room (the rider's body is the eyes and 0.2 more); 6 do not.
    const g = makeFlatWorld(ctx, { blocks: { '30,6,0': 'stone', '40,7,0': 'stone', ...across(-8, 'stone', [0, 1]) } });
    const mob = g.spawn('diplodocus', 3.5, 0.5);
    assert.ok(mount.seat < g.game.herdHeight(mob) && mount.seat > g.game.herdHeight(mob) - 0.6, 'on its back');
    g.game.raycastMob = () => mob;
    assert.equal(g.game.tryMountMob(), true);
    assert.ok(g.game.ridingMob === mob, 'riding it');
    assert.ok(Math.abs(g.camera.position.y - mount.eyeHeight) < 0.02, `eyes ${g.camera.position.y} over the ground`);
    // Facing the wall at x = -8 and pushed towards it: it stops with its chest short of it.
    mob.rotation.y = -Math.PI / 2;
    mob.userData.direction = Math.PI;
    for (let i = 0; i < 120; i++) {
        g.camera.position.x -= 0.1;
        g.frame();
    }
    assert.ok(g.camera.position.x > -8 + DIPLO.giant.front - 0.6, `held at x = ${g.camera.position.x}, the wall at -8`);
    g.game.dismount();
    assert.ok(!g.game.ridingMob, 'off');

    const under = (x) => {
        const giant = g.spawn('diplodocus', x, 2.5);
        giant.position.set(x, 0, 0.5);
        g.game.raycastMob = () => giant;
        g.game.tryMountMob();
        const rides = g.game.ridingMob === giant;
        if (rides) g.game.dismount();
        return rides;
    };
    assert.ok(!under(30.5), 'six free blocks are not enough');
    assert.ok(under(40.5), 'seven are');
});

test('the tyrannosaurus roars and charges in a straight line at a player in front of it, and bites with its jaws', () => {
    // The player 9 blocks in front of it (it faces +z).
    const g = makeFlatWorld(ctx, { x: 0.5, z: 9.5 });
    const rex = g.spawn('tyrannosaurus', 0.5, 0.5);
    rex.userData.tyrannosaurusHunting = true;
    let charged = false;
    let calm = true;
    for (let i = 0; i < 90 && !charged; i++) {
        g.frame();
        if (rex.userData.chargeRun) {
            charged = true;
            calm = rex.userData.hostile === false;
        }
    }
    assert.ok(charged, 'it charged');
    assert.ok(calm, 'and the chase of the walk is off while it does, so that the line does not bend');
    assert.equal(rex.userData.chargeRun.phase, 'aim', 'it roars first');
    g.run(4);
    const hit = g.hurt.find((blow) => blow.reason === REX.charge.reason);
    assert.ok(hit && hit.amount === REX.charge.damage, 'the charge reached a player who stood still');
    g.run(3);
    assert.ok(!rex.userData.chargeRun && rex.userData.hostile === true, 'and then it hunts again');

    // Stepping aside during the roar: the line goes past.
    const h = makeFlatWorld(ctx, { x: 0.5, z: 9.5 });
    const second = h.spawn('tyrannosaurus', 0.5, 0.5);
    second.userData.tyrannosaurusHunting = true;
    for (let i = 0; i < 90 && !(second.userData.chargeRun && second.userData.chargeRun.phase === 'run'); i++) h.frame();
    h.stand(7.5, 9.5);
    h.run(2);
    assert.ok(!h.hurt.some((blow) => blow.reason === REX.charge.reason), 'whoever stepped aside is missed');

    // The bite: at its jaws, with no charge (too near for one).
    const k = makeFlatWorld(ctx, { x: 0.5, z: 0.5 + HUNT.jaws });
    const biter = k.spawn('tyrannosaurus', 0.5, 0.5);
    biter.userData.tyrannosaurusHunting = true;
    k.run(2);
    const bites = k.hurt.filter((blow) => blow.reason === 'You were bitten by a tyrannosaurus');
    assert.ok(bites.length >= 1 && bites[0].amount === HUNT.biteDamage, 'bitten');
    assert.ok(HUNT.biteDamage > 4 && REX.charge.damage < 10, 'more than any living mob, less than half of a player');
});

test('the tyrannosaurus is slow to turn, and a player at its side is not bitten', () => {
    const g = makeFlatWorld(ctx, { x: 3.5, z: 0.5 });
    const rex = g.spawn('tyrannosaurus', 0.5, 0.5);
    rex.userData.tyrannosaurusHunting = true;
    rex.userData.tyrannosaurusRest = 99;
    g.run(0.5);
    assert.ok(Math.abs(rex.rotation.y) <= HUNT.turn * 0.5 + 0.05, `it turned ${rex.rotation.y} in half a second`);
    assert.equal(g.hurt.length, 0, 'not bitten from the side');
    assert.ok(REX.chaseDistance <= 20 && REX.chaseSpeed < 4.5, 'it comes from no further than 20 blocks, and a walking player outruns it');
});

test('every name of their files is theirs: no method of Game is written twice', () => {
    const source = ['diplodocus', 'tyrannosaurus'].map((id) => fs.readFileSync(path.join(JS, 'game', `${id}.js`), 'utf8')).join('\n');
    assert.ok(!/spawnForChunk|chunkRandom\(|mobMarkNatural\(/.test(source));
});
