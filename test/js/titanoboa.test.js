// Node tests for the Titanoboa (js/game/titanoboa.js): what it is, and its body: fifteen segments laid along
// the trail its head leaves. The real mobs.js, camera.js and world.js run on a flat world
// (support/flat_world.js); only drawing and sound are left out. What every extinct animal has to be is asked
// of it by extinct_species.test.js.
// Run with: node --test test/js/titanoboa.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame({ listenersOf: ['js/game/titanoboa.js'], frameUpdates: ['titanoboaUpdate'] });
const T = JSON.parse(vm.runInContext('JSON.stringify(TITANOBOA)', ctx));
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `284_${lang}_Titanoboa.md`), 'utf8');
const comma = (number) => String(number).replace('.', ',');
const round = (number) => Math.round(number * 1000) / 1000;

// Its joints as plain numbers: [[x, y, z], ...], from its head to the tip of its tail.
function jointsOf(mob) {
    const joints = mob.userData.titanoboa.joints;
    const list = [];
    for (let k = 0; k <= T.segments; k++) list.push([joints[k * 3], joints[k * 3 + 1], joints[k * 3 + 2]]);
    return list;
}
// How far apart two joints are on the ground.
const gap = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
// A world with the player far away (30 blocks: it sees nobody) and one titanoboa at (x, z).
function alone(x = 0.5, z = 0.5) {
    const g = makeFlatWorld(ctx, { x: 30.5, z: 0.5 });
    const mob = g.spawn('titanoboa', x, z);
    return { g, mob };
}

test('what it is: a hostile snake of the ground movement, seven blocks long, and what its page says of it', () => {
    const info = ctx.getMobSpecies('titanoboa');
    assert.equal(info.movement, undefined, 'it walks as any ground mob, so the server walks a kept one');
    assert.ok(ctx.mobMovementIs(info.movement, 'walksToGoal'));
    assert.equal(info.ancestorOf, 'snake');
    assert.equal(info.hostile, true);
    assert.equal(info.poison, undefined, 'it had no venom');
    assert.ok(info.chaseDistance <= 20 && info.chaseSpeed > info.speed);
    assert.equal(ctx.TAMING_DIET.titanoboa, undefined);
    assert.equal(ctx.Game.prototype.tamingCanTame.call({}, 'titanoboa'), false);
    assert.equal(JSON.stringify(ctx.TRAPS_SPECIES.titanoboa), '{"baits":[]}');
    // Fifteen segments and a head: about seven blocks, and no two neighbours of one size.
    assert.equal(T.widths.length, T.segments);
    assert.equal(T.heights.length, T.segments);
    for (let k = 1; k < T.segments; k++) assert.ok(T.widths[k] !== T.widths[k - 1] && T.heights[k] !== T.heights[k - 1], `segments ${k - 1} and ${k}`);
    const length = T.segments * T.spacing + 10 / 16;
    assert.ok(length > 6.8 && length < 7.4, `${length} blocks`);
    assert.ok(Math.max(...T.widths) / 16 > 0.6, 'as thick as a barrel');

    // The numbers of its page are those of the code.
    const es = page('ES');
    const en = page('EN');
    assert.ok(es.includes('**7 bloques de largo**') && en.includes('**7 blocks long**'));
    assert.ok(es.includes(`a menos de **${info.chaseDistance} bloques**`) && en.includes(`within **${info.chaseDistance} blocks**`), 'from how far it comes');
    assert.ok(es.includes(`a **${comma(info.chaseSpeed)} bloques por\n  segundo**`) && en.includes(`at **${info.chaseSpeed} blocks a second**`), 'how fast');
    assert.equal(info.speed, 0.5);
    assert.ok(es.includes('a medio bloque por segundo') && en.includes('at half a block a second'));
    assert.ok(es.includes(`a menos de ${T.rearAt} bloques`) && en.includes(`within ${T.rearAt} blocks`), 'when it rears');
    assert.ok(es.includes(`**${info.attackDamage} de daño**`) && en.includes(`**${info.attackDamage} damage**`));
    // When it lets go, and its leash: one and a half times its reach, and that beyond the 8 blocks of its circle
    // (pkg/network/animals.go: animalsChaseLoose; pkg/network/revival.go: Radius).
    const loose = 1.5 * info.chaseDistance;
    assert.ok(es.includes(`a más de ${loose} bloques de ella, o a más de ${8 + loose} de su casa`) && en.includes(`more than ${loose} blocks away from it, or more than ${8 + loose} from its home`));
    const blows = (damage) => Math.ceil(info.maxHealth / damage);
    assert.deepEqual([4, 6, 7, 8].map(blows), [7, 5, 4, 4], 'bare-handed, and with a sword of stone, iron and gold (js/game/mobs.js)');
    assert.ok(es.includes(`**${info.maxHealth} de vida**: 7 golpes a mano, 5 con una [espada](71) de piedra, 4 con una de hierro o de oro`));
    assert.ok(en.includes(`**${info.maxHealth} health**: 7 hits bare-handed, 5 with a stone [sword](71), 4 with an iron or a golden one`));
    assert.ok(es.includes(`Hay **${info.variants} colores**`) && en.includes(`There are **${info.variants} colours**`));
    const fossil = JSON.parse(vm.runInContext('JSON.stringify(FOSSIL_SPECIES.titanoboa)', ctx));
    assert.deepEqual(fossil, { source: 'rock', rarity: 'rare', weight: 1, water: 0, seconds: 45 });
    assert.ok(es.includes(`tarda **${fossil.seconds} segundos**`) && en.includes(`takes **${fossil.seconds} seconds**`));
    assert.ok(es.includes('no necesita agua') && en.includes('needs no water'));
    assert.ok(es.includes('](252)') && en.includes('](252)'), 'a shield takes its bite as any blow that comes from somewhere');
});

test('the snake\'s own movement could not carry it: it is written for the snake, and gives a kept animal no body', () => {
    const source = fs.readFileSync(path.join(STATIC, 'js', 'game', 'snake.js'), 'utf8');
    assert.ok(source.includes("getMobSpecies('snake')") && source.includes('SNAKE_SEGMENTS'), 'the snake is in it by name');
    const slither = vm.runInContext('MOB_BEHAVIOURS.slither', ctx);
    assert.equal(typeof slither.spawnKept, 'undefined');
    assert.ok(!ctx.mobMovementIs('slither', 'walksToGoal'));
});

test('it appears coiled: its whole body within three blocks of its head, belly on the ground, its head up', () => {
    const { g, mob } = alone();
    g.frame();
    const joints = jointsOf(mob);
    for (let k = 1; k <= T.segments; k++) {
        assert.ok(gap(joints[k], joints[0]) < 3.2, `joint ${k} is ${gap(joints[k], joints[0])} from its head`);
        if (k >= T.lift.length) assert.equal(round(joints[k][1]), 0, `joint ${k} lies on the ground`);
        const step = gap(joints[k], joints[k - 1]);
        assert.ok(step > T.spacing * 0.6 && step < T.spacing * 1.2, `joints ${k - 1} and ${k} are ${step} apart`);
    }
    assert.ok(joints[0][1] > T.low && joints[0][1] <= T.high + 1e-6, 'its head is up, as in its portrait');
    // Left alone, it lowers its head.
    const state = mob.userData.titanoboa;
    g.run(3);
    assert.ok(Math.abs(state.raise - T.low) < 0.05, `its head is ${state.raise} up`);
    assert.equal(mob.userData.modelParts.head.position.y, state.raise);
});

test('its body follows its head: every joint lies where the head has been, a segment apart, in waves', () => {
    const { g, mob } = alone();
    const been = [];
    let swung = 0;
    for (let i = 0; i < 30 * 45; i++) {
        g.frame();
        been.push(mob.position.x, mob.position.z);
        const joints = jointsOf(mob);
        for (let k = 1; k <= T.segments; k++) {
            const step = Math.hypot(joints[k][0] - joints[k - 1][0], joints[k][1] - joints[k - 1][1], joints[k][2] - joints[k - 1][2]);
            // Never stretched: there would be a gap in it. (Where its path doubles back they are nearer.)
            assert.ok(step < T.spacing * 1.7, `frame ${i}: joints ${k - 1} and ${k} are ${step} apart`);
        }
    }
    const state = mob.userData.titanoboa;
    assert.ok(state.travelled > 9, `it went ${state.travelled} blocks: more than its length`);
    assert.ok(state.count <= T.points, 'its trail is never longer than it keeps');
    // Now its whole body is on ground its head went over: no joint further from that path than its waves reach
    // (and than it makes way, where its head came back along it).
    const joints = jointsOf(mob);
    for (let k = 1; k <= T.segments; k++) {
        let nearest = Infinity;
        for (let i = 0; i < been.length; i += 2) nearest = Math.min(nearest, Math.hypot(joints[k][0] - been[i], joints[k][2] - been[i + 1]));
        assert.ok(nearest <= T.wave + T.berth + 0.12, `joint ${k} is ${nearest} from where its head went`);
        swung = Math.max(swung, nearest);
    }
    assert.ok(swung > T.wave * 0.5, `its body swings to the sides of its path: ${swung}`);
    // And each segment of its model is laid from its joint towards the next one, in the frame of the mob.
    const cos = Math.cos(mob.rotation.y);
    const sin = Math.sin(mob.rotation.y);
    for (let k = 0; k < T.segments; k++) {
        const segment = mob.userData.modelParts[`tail${k}`];
        const wx = mob.position.x + segment.position.x * cos + segment.position.z * sin;
        const wz = mob.position.z - segment.position.x * sin + segment.position.z * cos;
        assert.ok(Math.hypot(wx - joints[k][0], wz - joints[k][2]) < 1e-4 && Math.abs(mob.position.y + segment.position.y - joints[k][1]) < 1e-4, `segment ${k} starts at its joint`);
        assert.equal(segment.rotation.order, 'YXZ');
        // Its far end (its -z, turned by its yaw and then by the mob's) is at the next joint, unless its path
        // doubles back there and it is as short as a segment gets.
        const yaw = segment.rotation.y + mob.rotation.y;
        const reach = T.spacing * segment.scale.z * Math.cos(segment.rotation.x);
        if (segment.scale.z > 0.6) assert.ok(Math.hypot(wx - Math.sin(yaw) * reach - joints[k + 1][0], wz - Math.cos(yaw) * reach - joints[k + 1][2]) < 1e-3, `segment ${k} ends at the next joint`);
    }
});

// Its head taken by hand along a path, a frame at a time, as the ground movement takes it: `legs` are
// [heading, blocks] (radians from +x towards +z), at half a block a second.
function crawl(g, mob, legs) {
    const far = { x: mob.position.x + 60, y: 1.62, z: mob.position.z };
    for (const [heading, blocks] of legs) {
        for (let i = 0; i < Math.round(blocks * 60); i++) {
            mob.position.x += Math.cos(heading) / 60;
            mob.position.z += Math.sin(heading) / 60;
            mob.rotation.y = Math.PI / 2 - heading;
            g.game.titanoboaPose(mob, 1 / 30, far);
        }
    }
}

test('its head turns right round and comes back along its body: the body makes way and lies in a hairpin, never folded over itself', () => {
    for (const back of [Math.PI, Math.PI * 0.97, -Math.PI * 0.93]) {
        const { g, mob } = alone();
        crawl(g, mob, [[0, 9], [back, 3.5]]);
        const joints = jointsOf(mob);
        // Half of it still runs out and half comes back: were it folded, the two halves would lie on one line.
        const tip = Math.max(...joints.map((joint) => joint[0]));
        assert.ok(tip > mob.position.x + 1.2, 'its body still reaches out to where it turned');
        let nearest = Infinity;
        for (let i = 0; i <= T.segments; i++) {
            for (let j = i + 4; j <= T.segments; j++) {
                // Two stretches of it side by side, away from the bend itself.
                if (joints[i][0] > tip - 1.3 || joints[j][0] > tip - 1.3) continue;
                nearest = Math.min(nearest, gap(joints[i], joints[j]));
            }
        }
        assert.ok(nearest > T.berth - 2 * T.wave - 0.05 && nearest < Infinity, `turned ${back}: two stretches of its body are ${nearest} apart`);
        // Its neck is where its head went: only what lay there before has moved.
        for (let k = 0; k < 3; k++) assert.ok(Math.abs((joints[k][2] - mob.position.z) * Math.cos(back) - (joints[k][0] - mob.position.x) * Math.sin(back)) < T.wave + 0.02, `joint ${k} is on its way`);
        for (let k = 1; k <= T.segments; k++) {
            const step = gap(joints[k], joints[k - 1]);
            assert.ok(step < T.spacing * 1.7, `turned ${back}: joints ${k - 1} and ${k} are ${step} apart`);
        }
    }
    // Going straight, or round a bend, nothing of it is moved aside: its body is on its head's way.
    const { g, mob } = alone();
    crawl(g, mob, [[0, 5], [Math.PI / 2, 5]]);
    const joints = jointsOf(mob);
    for (let k = 0; k <= T.segments; k++) {
        const off = Math.min(Math.abs(joints[k][2] - 0.5), Math.abs(joints[k][0] - 5.5));
        assert.ok(off < T.wave + 0.1, `joint ${k} is ${off} off its head's way`);
    }
    assert.equal(mob.userData.titanoboa.side, 0);
});

test('it comes for a player who is near, rears, and bites when its head reaches them: its bite is all it has', () => {
    const g = makeFlatWorld(ctx, { x: 0.5, z: 0.5 });
    const info = ctx.getMobSpecies('titanoboa');
    const mob = g.spawn('titanoboa', 0.5 + info.chaseDistance - 2, 0.5);
    const state = () => mob.userData.titanoboa;
    g.frame();
    const far = Math.hypot(mob.position.x - 0.5, mob.position.z - 0.5);
    assert.ok(far > T.rearAt && !state().hunting, 'too far to rear yet');
    let rearedAt = null;
    for (let i = 0; i < 30 * 12 && g.hurt.length === 0; i++) {
        g.frame();
        if (rearedAt === null && state().hunting) rearedAt = Math.hypot(mob.position.x - 0.5, mob.position.z - 0.5);
    }
    assert.ok(rearedAt !== null && rearedAt <= T.rearAt && rearedAt > T.rearAt - 0.3, `it reared ${rearedAt} blocks away`);
    assert.ok(state().raise > T.high - 0.1, `its head is ${state().raise} up`);
    assert.equal(g.hurt.length, 1);
    assert.equal(g.hurt[0].amount, info.attackDamage);
    assert.equal(g.hurt[0].reason, 'You were attacked by a titanoboa');
    assert.equal(g.hurt[0].type, 'mob');
    const reach = Math.hypot(mob.position.x - 0.5, mob.position.z - 0.5);
    assert.ok(reach < 1.2 && reach > info.keepDistance - 0.1, `its head stops ${reach} from the player`);
    // As it bites, its head darts forward with its neck, and its jaw opens.
    const parts = mob.userData.modelParts;
    let dart = 0;
    let gape = 0;
    for (let i = 0; i < 12; i++) {
        g.frame();
        dart = Math.max(dart, parts.head.position.z);
        gape = Math.max(gape, parts.jaw.rotation.x);
        assert.ok(Math.hypot(parts.tail0.position.x, parts.tail0.position.z - parts.head.position.z) < 1e-6, 'its neck goes with its head');
    }
    assert.ok(dart > T.lunge * 0.8 && gape > 0.35, `it darts ${dart} and opens ${gape}`);
    // It bites again and again, no faster than any ground mob, and nothing else of it hurts.
    g.run(6);
    assert.ok(g.hurt.length >= 4 && g.hurt.length <= 7, `${g.hurt.length} bites in 6 seconds and a bit`);
    assert.ok(g.hurt.every((blow) => blow.amount === info.attackDamage && blow.type === 'mob'));
    // On the title screen, or while the player waits to come back, it rears at nobody.
    g.game.titleScreenOpen = true;
    g.run(1);
    assert.equal(state().hunting, false);
});

test('put somewhere else, given another model, or gone: it coils again there, finds its new segments, and is forgotten', () => {
    const { g, mob } = alone();
    g.run(20);
    const state = mob.userData.titanoboa;
    assert.ok(state.travelled > 4);
    // Further than it could have crawled in a frame: the server, or a command, put it there.
    mob.position.x += 40;
    g.frame();
    assert.equal(state.travelled, 0);
    const joints = jointsOf(mob);
    for (let k = 1; k <= T.segments; k++) assert.ok(gap(joints[k], joints[0]) < 3.2, `joint ${k} came with it`);
    // Another graphics mode builds its model again (attachMobModel, js/game/mobs.js).
    const before = mob.userData.modelParts.tail3;
    g.game.attachMobModel(mob);
    const after = mob.userData.modelParts.tail3;
    assert.ok(after !== before);
    g.frame();
    assert.ok(state.segments[3] === after, 'it lays the segments of the model it has now');
    assert.equal(after.rotation.order, 'YXZ');
    // Hidden (as js/game/animals.js hides a kept one), nothing is laid; gone, it is no longer looked at.
    mob.visible = false;
    const lastX = state.lastX;
    g.run(2);
    assert.equal(state.lastX, lastX);
    mob.visible = true;
    g.frame();
    assert.ok(state.lastX !== lastX);
    const list = g.game.titanoboaAlive;
    assert.equal(list.length, 1);
    g.game.removeMob(mob);
    g.frame();
    assert.equal(list.length, 0);
    assert.equal(g.game.ambientMobs.length, 0);
});

test('nothing is made on a frame: its trail, its joints and its segments are the same arrays from start to end', () => {
    const { g, mob } = alone();
    g.frame();
    const state = mob.userData.titanoboa;
    const { trail, joints, segments } = state;
    assert.equal(trail.length, T.points * 3);
    assert.equal(joints.length, (T.segments + 1) * 3);
    g.run(30);
    assert.ok(state.trail === trail && state.joints === joints && state.segments === segments);
    assert.equal(segments.length, T.segments);
    // And what runs every frame names no vector, no list and no function of its own.
    const source = fs.readFileSync(path.join(STATIC, 'js', 'game', 'titanoboa.js'), 'utf8');
    const pose = source.slice(source.indexOf('    titanoboaPose(mob, delta, player) {'));
    assert.ok(pose.length > 2000);
    for (const made of ['new THREE', 'new Float32Array', '=> ', 'function (', '.map(', '.filter(', '.slice(', '[...']) {
        assert.ok(!pose.includes(made), `titanoboaPose makes something every frame: ${made}`);
    }
});
