// Node tests for how the big flyers of the past fly (js/game/gliders.js, the 'glide' movement) and for the three
// species on it (haast_eagle.js, argentavis.js, pterosaur.js). The real mobs.js, gliders.js, animals.js, camera.js
// and world.js run on the flat world of support/flat_world.js, with towers, trees, hills and roofs put on it;
// only drawing and sound are left out, and each mob is built by its real model. Each frame is what the game does:
// updateAmbientMobs. Every loop here has its bound: so many frames, at 30 a second.
// Nothing here hands a mob, the game or the world to an assertion: a failed one would print the whole harness.
// Run with: node --test test/js/gliders.test.js
// With REPRO=1 in the environment it also prints what it measures.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC, JS } = require('./support/game.js');
const { EYE, Vector3, loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const log = (...args) => { if (process.env.REPRO) console.log(...args); };
const ctx = loadFlatGame({ listenersOf: ['js/game/animals.js'] });
const GLIDE = JSON.parse(vm.runInContext('JSON.stringify(GLIDE)', ctx));
const MODE = vm.runInContext('ANIMALS_MODE', ctx);
const behaviour = vm.runInContext('MOB_BEHAVIOURS.glide', ctx);
const bodyOf = (species) => JSON.parse(vm.runInContext(`(() => { const body = glidersBody('${species}'); return JSON.stringify({ ...body, across: [...body.across] }); })()`, ctx));
const source = fs.readFileSync(path.join(JS, 'game', 'gliders.js'), 'utf8');
const GLIDERS = Object.keys(ctx.MOB_SPECIES).filter((id) => ctx.MOB_SPECIES[id].movement === 'glide');
const FRAME = 1 / 30;
const SPREAD = ['soar', 'approach', 'warn'];
const info = (species) => ctx.getMobSpecies(species);
const comma = (number) => String(number).replace('.', ',');
// The eagle's name as its card says it (its apostrophe is the letter U+02BC: js/game/haast_eagle.js).
const EAGLE = vm.runInContext('BESTIARY_ENTRIES.haast_eagle.name', ctx);
const page = (id, lang) => {
    const name = fs.readdirSync(path.join(STATIC, 'guide')).find((file) => file.startsWith(`${id}_${lang}_`));
    return fs.readFileSync(path.join(STATIC, 'guide', name), 'utf8');
};

// ---- Worlds ----

// Cells to put on the flat world, as makeFlatWorld takes them.
function column(blocks, x, z, from, to, type) {
    for (let y = from; y <= to; y++) blocks[`${x},${y},${z}`] = type;
}
// A tower of stone 14 blocks high and two wide near its home, a pole, and five trees of several heights.
function townBlocks() {
    const blocks = {};
    for (let x = 4; x < 6; x++) for (let z = 3; z < 5; z++) column(blocks, x, z, 0, 13, 'stone');
    column(blocks, -5, -6, 0, 4, 'oak_wood');
    for (const [tx, tz, height] of [[8, -4, 6], [-4, 7, 9], [-8, -2, 12], [2, -9, 7]]) {
        column(blocks, tx, tz, 0, height - 1, 'oak_wood');
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy < 3; dy++) if (Math.abs(dx) + Math.abs(dz) + dy < 5) blocks[`${tx + dx},${height + dy},${tz + dz}`] = 'leaves';
    }
    return blocks;
}
// Hills of stone: the ground goes from 0 to 11 blocks high within a few blocks.
function hillBlocks() {
    const blocks = {};
    for (let x = -22; x <= 22; x++) for (let z = -22; z <= 22; z++) column(blocks, x, z, 0, Math.round(4 + 4 * Math.sin(x * 0.35) + 3 * Math.cos(z * 0.3)) - 1, 'stone');
    return blocks;
}

// The flat world with these blocks, the player standing at `player` (far from the flyers unless a test wants
// them near), and what a test needs of it. Looks at blocks are counted.
function makeSky({ blocks = {}, player = [44.5, 0.5], seed = 1 } = {}) {
    const g = makeFlatWorld(ctx, { x: player[0], z: player[1], blocks, seed });
    const game = g.game;
    const world = g.world;
    Object.assign(game, { eggsUsed: 0, getSelectedHeldItemType: () => null, offhandType: null, showHitIndicator() {}, consumeSelectedBlock() { game.eggsUsed++; return true; } });
    const real = world.getBlockId.bind(world);
    const counts = { looks: 0 };
    world.getBlockId = (x, y, z) => { counts.looks++; return real(x, y, z); };
    const free = (x, y, z) => game.glidersFree(Math.floor(x), Math.floor(y), Math.floor(z));
    const floorAt = (x, z) => g.cameraController.getFloorY(x, z, 60);
    // One on the ground at (x, z), as the server's word gives a revived one its body.
    const spawn = (species, x = 0.5, z = 0.5) => behaviour.spawnKept.call(game, species, new Vector3(x, floorAt(x, z), z), { variant: 0 });
    // A block put (or taken, with no type) while the game runs, as a player's edit reaches the loaded column.
    const setBlock = (x, y, z, type) => world.getColumnAt(x, z).set(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16, type ? world.registry.id(type) : 0);
    return { ...g, game, world, counts, free, floorAt, spawn, setBlock };
}

// What is wrong with where a flyer is, as lines (none when nothing is): its middle in a block, out of its range,
// or, while it flies with its wings spread, a point of its wings in a block.
function problemsOf(sky, mob) {
    const problems = [];
    const glider = mob.userData.glider;
    const body = glider.body;
    const { x, y, z } = mob.position;
    const at = `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)} (${glider.mode})`;
    if (!sky.free(x, y + GLIDE.feet, z) || !sky.free(x, y + body.height - GLIDE.feet, z)) problems.push(`its middle is in a block at ${at}`);
    const home = mob.userData.home;
    const away = Math.hypot(x - home.x, z - home.z);
    if (away > glider.range + 1e-6) problems.push(`it is ${away.toFixed(2)} blocks from its home at ${at}`);
    if (SPREAD.includes(glider.mode) && glider.badTotal === 0) {
        for (const across of body.across) {
            const wx = x - Math.sin(glider.heading) * across;
            const wz = z + Math.cos(glider.heading) * across;
            if (!sky.free(wx, y + GLIDE.feet, wz) || !sky.free(wx, y + body.height - GLIDE.feet, wz)) problems.push(`a point of its wings, ${across.toFixed(2)} across, is in a block at ${at}`);
        }
    }
    return problems;
}

// Runs the world for `seconds` and fails at the first frame anything is wrong with any of these flyers. Returns
// what each did: the seconds in each mode, how often it landed and took off, how high and how far it got, the
// longest step of one frame and the frames in which a step was refused.
function fly(sky, mobs, seconds, each = null) {
    const stats = mobs.map((mob) => ({
        mob, seconds: {}, landings: 0, takeoffs: 0, highest: -Infinity, farthest: 0, longest: 0, refused: 0, level: 0, soared: 0,
        mode: mob.userData.glider.mode, last: mob.position.clone()
    }));
    const frames = Math.round(seconds / FRAME);
    for (let frame = 1; frame <= frames; frame++) {
        sky.game.updateAmbientMobs(FRAME);
        for (const stat of stats) {
            const mob = stat.mob;
            const glider = mob.userData.glider;
            const position = mob.position;
            const wrong = problemsOf(sky, mob);
            assert.ok(wrong.length === 0, `${mob.userData.species} after ${(frame * FRAME).toFixed(2)} s: ${wrong.join('; ')}`);
            stat.seconds[glider.mode] = (stat.seconds[glider.mode] || 0) + FRAME;
            if (glider.mode !== stat.mode) {
                if (glider.mode === 'perch') stat.landings++;
                if (glider.mode === 'rise') stat.takeoffs++;
                stat.mode = glider.mode;
            }
            stat.highest = Math.max(stat.highest, position.y);
            stat.farthest = Math.max(stat.farthest, Math.hypot(position.x - mob.userData.home.x, position.z - mob.userData.home.z));
            stat.longest = Math.max(stat.longest, position.distanceTo(stat.last));
            stat.last.copy(position);
            if (glider.heldMove) stat.refused++;
            if (glider.mode === 'soar') {
                stat.soared++;
                if (position.y >= glider.cruiseY - 1.5) stat.level++;
            }
        }
        if (each) each(frame * FRAME);
    }
    for (const stat of stats) {
        log(stat.mob.userData.species, Object.entries(stat.seconds).map(([mode, time]) => `${mode} ${time.toFixed(0)}`).join(', '), '| landings', stat.landings, 'takeoffs', stat.takeoffs,
            'highest', stat.highest.toFixed(1), 'farthest', stat.farthest.toFixed(1), 'longest step', stat.longest.toFixed(3), 'refused', stat.refused, 'level', (stat.level / Math.max(1, stat.soared)).toFixed(2));
    }
    return stats;
}

// Runs frame by frame until `done()` or `seconds` have gone; returns the seconds it took, or -1.
function until(sky, seconds, done) {
    const frames = Math.round(seconds / FRAME);
    for (let frame = 1; frame <= frames; frame++) {
        sky.game.updateAmbientMobs(FRAME);
        if (done()) return frame * FRAME;
    }
    return -1;
}

// ---- What it is ----

test('the movement is registered with what the rest of the game asks of it, and three species fly by it', () => {
    for (const hook of ['update', 'interact', 'spawnCommand', 'spawnEgg', 'spawnKept']) assert.equal(typeof behaviour[hook], 'function', hook);
    assert.equal(behaviour.spawnForChunk, undefined, 'nothing spawns them');
    assert.equal(ctx.mobMovementIs('glide', 'bodiless'), true, 'the herd does not push what is in the air');
    for (const trait of ['walksToGoal', 'tameable', 'nudgedToBait', 'baitOwnWay', 'inWater', 'pointLike']) assert.equal(ctx.mobMovementIs('glide', trait), false, trait);
    assert.doesNotMatch(source, /getMobGoal\(/, 'it goes where it likes: the server does not walk it');
    assert.deepEqual(GLIDERS, ['haast_eagle', 'argentavis', 'pterosaur'], 'in the order index.html loads them');
    for (const id of GLIDERS) {
        assert.equal(info(id).hiddenUntilDiscovered, true, id);
        assert.equal(info(id).flyHeight, undefined, `${id}: how high it is, is the movement's business`);
        assert.equal(ctx.TAMING_DIET[id], undefined, `${id} is not tamed`);
        assert.deepEqual([...ctx.TRAPS_SPECIES[id].baits], [], id);
        assert.ok(!ctx.TRAPS_SPECIES[id].cage, `${id} goes in no cage`);
        assert.ok(ctx.Game.prototype.animalsCanKeep.call({}, id, false), `${id} can be kept by the server`);
    }
    assert.equal(info('haast_eagle').ancestorOf, 'eagle');
    assert.equal(info('argentavis').ancestorOf, 'vulture');
    assert.equal(info('pterosaur').ancestorOf, undefined);
    // One is hostile, and no worse than the spider of today; the other two are not.
    const spider = info('spider');
    assert.equal(info('haast_eagle').hostile, true);
    assert.ok(info('haast_eagle').attackDamage <= spider.attackDamage && info('haast_eagle').chaseDistance <= 20 && info('haast_eagle').chaseSpeed > info('haast_eagle').speed);
    assert.ok(!info('argentavis').hostile && !info('pterosaur').hostile);
    // js/mobSpecies.js names the movement where it lists them all.
    assert.match(fs.readFileSync(path.join(JS, 'mobSpecies.js'), 'utf8'), /'glide'[^\n]*\n[^\n]*js\/game\/gliders\.js/);
});

test('every glide field a species says is one the movement documents and reads, with what it gets by default', () => {
    const documented = [...source.matchAll(/^\/\/ {3}(glide[A-Za-z]+) /gm)].map((match) => match[1]);
    assert.deepEqual(documented, ['glideHeight', 'glideRange', 'glideAloft', 'glidePerch', 'glideBeat']);
    for (const field of documented) assert.ok(new RegExp(`info\\.${field}\\b`).test(source), `${field} is documented and never read`);
    for (const id of GLIDERS) {
        for (const field of Object.keys(info(id))) if (field.startsWith('glide')) assert.ok(documented.includes(field), `${id} says ${field}, which the movement does not read`);
        for (const field of ['glideAloft', 'glidePerch', 'glideBeat']) assert.ok(Array.isArray(info(id)[field]) && info(id)[field][0] < info(id)[field][1], `${id}.${field}`);
    }
    // What the header says a species gets when it says nothing.
    assert.match(source, new RegExp(`glideHeight .*\\(${GLIDE.height}\\)`));
    assert.match(source, new RegExp(`glideRange .*\\(${GLIDE.range}\\)`));
    assert.match(source, new RegExp(`glideAloft .*\\(\\[${GLIDE.aloft.join(', ')}\\]\\)`));
    assert.match(source, new RegExp(`glidePerch .*\\(\\[${GLIDE.perch.join(', ')}\\]\\)`));
    assert.match(source, new RegExp(`glideBeat .*\\(\\[${GLIDE.beat.join(', ')}\\]\\)`));
    // The argentavis is the slow, high and wide one; the eagle the nimble one.
    assert.ok(info('argentavis').speed < info('haast_eagle').speed && info('argentavis').glideHeight > info('haast_eagle').glideHeight);
    assert.ok(info('argentavis').glideBeat[0] > info('haast_eagle').glideBeat[1], 'the argentavis hardly beats its wings');
});

test('its body is read from its model: its wingspan, and the points along it that are kept out of the blocks', () => {
    const spans = { haast_eagle: 2.6, argentavis: 5, pterosaur: 5 };
    for (const id of GLIDERS) {
        const body = bodyOf(id);
        log(id, 'span', body.span.toFixed(2), 'height', body.height.toFixed(2), 'points', body.across.length);
        assert.ok(Math.abs(body.span - spans[id]) < 0.1, `${id} is ${body.span} blocks from tip to tip`);
        assert.ok(body.height > 0.5 && body.height < 1.3, `${id} is ${body.height} tall`);
        // Its middle first, then one to each side, out to nearly its tips, never a block apart.
        assert.equal(body.across[0], 0, id);
        const sorted = [...body.across].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i] - sorted[i - 1] <= 1 + 1e-6, `${id}: two points ${sorted[i] - sorted[i - 1]} apart`);
        assert.ok(Math.abs(sorted[0] + sorted[sorted.length - 1]) < 1e-6 && sorted[sorted.length - 1] > body.half * 0.9 && sorted[sorted.length - 1] < body.half, id);
    }
    assert.equal(vm.runInContext("glidersBody('argentavis') === glidersBody('argentavis')", ctx), true, 'measured once');
    // It turns by the size of its wings: the bigger, the slower, and the wider its tightest circle; and that
    // circle fits well inside its range.
    const sky = makeSky();
    const state = (id) => sky.spawn(id, 0.5, 0.5).userData.glider;
    const eagle = state('haast_eagle');
    const giant = state('argentavis');
    assert.ok(Math.abs(eagle.turnRate - GLIDE.turn / (1 + bodyOf('haast_eagle').half)) < 1e-9);
    assert.ok(giant.turnRate < eagle.turnRate && giant.tight > eagle.tight);
    for (const glider of [eagle, giant, state('pterosaur')]) {
        assert.ok(glider.tight * GLIDE.circle[1] < glider.range - GLIDE.margin, `its widest circle, ${(glider.tight * GLIDE.circle[1]).toFixed(1)}, in a range of ${glider.range}`);
    }
});

test('every part of a flyer is painted whole: sizes in quarters of a unit, wings built flat along x, and legs under its middle', () => {
    for (const id of GLIDERS) {
        const parts = JSON.parse(vm.runInContext(`(() => {
            const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'feather' });
            const rig = VoxelModels.mobBuilders.${id}.call(VoxelModels, b, 0);
            return JSON.stringify({ rig, parts: b.parts.map(({ name, parent, pivot, from, size, rotation }) => ({ name, parent, pivot, from, size, rotation })) });
        })()`, ctx));
        assert.ok(parts.parts.length >= 15 && parts.parts.length <= 40, `${id} has ${parts.parts.length} parts`);
        for (const part of parts.parts) for (const side of part.size) assert.ok(side >= 0.25 && Math.abs(side * 4 - Math.round(side * 4)) < 1e-9, `${id}.${part.name}: a side of ${side}`);
        assert.deepEqual(parts.rig.wings, ['wingL', 'wingR'], id);
        assert.deepEqual(parts.rig.legs, ['legL', 'legR'], id);
        const named = (name) => parts.parts.find((part) => part.name === name);
        for (const [side, sign] of [['L', 1], ['R', -1]]) {
            const wing = named(`wing${side}`);
            const tip = named(`wingTip${side}`);
            assert.ok(wing && tip && tip.parent === `wing${side}`, `${id}: wing${side} and its outer half`);
            assert.ok(!wing.rotation && !tip.rotation, `${id}: its wings are built spread and flat`);
            assert.ok(wing.size[0] > wing.size[1] * 8 && Math.sign(wing.pivot[0]) === sign && Math.abs(tip.pivot[0]) === wing.size[0], `${id}: wing${side} lies along x`);
            // Tipped up on its perch it turns about its feet: legs far from its middle would sink or float.
            assert.ok(Math.abs(named(`leg${side}`).pivot[2]) <= 1, `${id}: leg${side} is ${named(`leg${side}`).pivot[2]} from its middle`);
        }
    }
});

// ---- Never in a block, never out of its circle ----

test('over the open plain, ten minutes each: it circles at its height, comes down to perch and takes off again, and never leaves its range', () => {
    for (const [index, id] of GLIDERS.entries()) {
        const sky = makeSky({ seed: 3 + index });
        const mob = sky.spawn(id);
        const glider = mob.userData.glider;
        const [stat] = fly(sky, [mob], 600);
        const rest = info(id).glidePerch;
        const aloft = info(id).glideAloft;
        assert.ok(stat.takeoffs >= Math.floor(600 / (aloft[1] + rest[1] + 20)) && stat.landings >= stat.takeoffs - 1, `${id} took off ${stat.takeoffs} times and landed ${stat.landings}`);
        assert.ok(stat.seconds.soar > 300, `${id} circled for ${stat.seconds.soar.toFixed(0)} s of 600`);
        assert.ok(stat.seconds.perch > rest[0] * stat.landings * 0.9, `${id} sat for ${stat.seconds.perch.toFixed(0)} s in ${stat.landings} landings`);
        // Its height: what its species says over the ground (here at 0), give or take a block, nearly all the time.
        assert.ok(stat.highest < glider.height + 1.5 && stat.highest > glider.height - 1, `${id} got ${stat.highest.toFixed(1)} blocks up`);
        assert.ok(stat.level / stat.soared > 0.85, `${id} was up at its height ${((stat.level / stat.soared) * 100).toFixed(0)} % of its time in the air`);
        // Nothing in its way: no step is ever refused, it is never put anywhere, and it keeps off the edge.
        assert.equal(stat.refused, 0, id);
        assert.ok(stat.longest < Math.hypot(info(id).speed, GLIDE.stoop) * FRAME * 1.05, `${id} moved ${stat.longest.toFixed(3)} in one frame`);
        assert.ok(stat.farthest < glider.range - 0.3, `${id} got ${stat.farthest.toFixed(1)} blocks from its home, of ${glider.range}`);
        assert.ok(stat.farthest > glider.tight, `${id} only got ${stat.farthest.toFixed(1)} blocks from its home`);
    }
});

test('among a tower, a pole and trees it flies round what is high and over what is low: never a wing in a block', () => {
    for (const [index, id] of GLIDERS.entries()) {
        const sky = makeSky({ blocks: townBlocks(), seed: 11 + index });
        const mob = sky.spawn(id);
        const [stat] = fly(sky, [mob], 480);
        assert.ok(stat.takeoffs >= 2 && stat.landings >= 1, `${id} took off ${stat.takeoffs} times and landed ${stat.landings}`);
        assert.ok(stat.seconds.soar > 200, `${id} circled for ${stat.seconds.soar.toFixed(0)} s of 480`);
        // It is seldom stopped: it sees what is in its way in time to turn.
        assert.ok(stat.refused < stat.soared * 0.12, `${id} had a step refused in ${stat.refused} frames of ${stat.soared} in the air`);
    }
});

test('over hills it keeps over the ground, and sits on them', () => {
    for (const [index, id] of ['haast_eagle', 'argentavis'].entries()) {
        const sky = makeSky({ blocks: hillBlocks(), seed: 21 + index });
        const mob = sky.spawn(id);
        assert.ok(mob.position.y > 3, 'it begins on the hill, not in it');
        // How far over the ground under it, once it is up: the first seconds of each flight are its climb.
        let lowest = Infinity;
        let near = 0;
        let up = 0;
        let since = 0;
        const [stat] = fly(sky, [mob], 420, () => {
            since = mob.userData.glider.mode === 'soar' ? since + FRAME : 0;
            if (since < 6) return;
            const over = mob.position.y - sky.floorAt(mob.position.x, mob.position.z);
            lowest = Math.min(lowest, over);
            up++;
            if (over < GLIDE.clear - 0.5) near++;
        });
        log(id, 'lowest over the ground', lowest.toFixed(2), 'near it', near, 'of', up);
        assert.ok(stat.takeoffs >= 2 && stat.landings >= 1, `${id} took off ${stat.takeoffs} times and landed ${stat.landings}`);
        assert.ok(lowest > 1, `${id} came within ${lowest.toFixed(2)} blocks of the ground under it`);
        // (These hills are steep: where the ground climbs faster than it can, it is nearer than it likes for a moment.)
        assert.ok(near < up * 0.08, `${id} was under ${GLIDE.clear - 0.5} blocks over the ground for ${near} frames of ${up}`);
        assert.ok(stat.refused < stat.soared * 0.05, `${id} had a step refused in ${stat.refused} frames`);
    }
});

test('made where there is a block (the ground changed), it comes out on top of it', () => {
    const blocks = {};
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) column(blocks, x, z, 0, 2, 'stone');
    const sky = makeSky({ blocks });
    const mob = behaviour.spawnKept.call(sky.game, 'haast_eagle', new Vector3(0.5, 0, 0.5), { variant: 0 });
    assert.ok(!sky.free(0.5, 0.1, 0.5), 'inside the stone');
    assert.ok(until(sky, 2, () => sky.free(mob.position.x, mob.position.y + 0.1, mob.position.z)) > 0);
    assert.equal(mob.position.y, 3);
    fly(sky, [mob], 60);
});

// ---- Roofs ----

// A roof of stone over the whole of its range at height y, put while the game runs.
function roof(sky, y, on = true, reach = 16) {
    for (let x = -reach; x <= reach; x++) for (let z = -reach; z <= reach; z++) sky.setBlock(x, y, z, on ? 'stone' : null);
}

test('a roof put over it in the air brings it down, gently, and it stays down until the sky is open again', () => {
    const sky = makeSky({ seed: 5 });
    const mob = sky.spawn('haast_eagle');
    const glider = mob.userData.glider;
    assert.ok(until(sky, 30, () => glider.mode === 'soar' && mob.position.y > 6) > 0, 'up it went');
    roof(sky, 12);
    // Within a few seconds it gives up and comes down: straight, no faster than a flutter, on to the ground.
    const gaveUp = until(sky, GLIDE.roofFor + 3, () => glider.mode === 'settle');
    assert.ok(gaveUp > 0 && gaveUp >= GLIDE.roofFor - 1, `it came down after ${gaveUp} s`);
    const from = mob.position.clone();
    let fastest = 0;
    let last = mob.position.y;
    const landed = until(sky, 12, () => {
        assert.ok(problemsOf(sky, mob).length === 0);
        fastest = Math.max(fastest, (last - mob.position.y) / FRAME);
        last = mob.position.y;
        return glider.mode === 'perch';
    });
    assert.ok(landed > 0, 'it landed');
    assert.ok(fastest <= GLIDE.settle + 1e-6, `it came down at ${fastest.toFixed(2)} blocks a second`);
    assert.ok(Math.hypot(mob.position.x - from.x, mob.position.z - from.z) < 1e-9 && mob.position.y === 0, 'straight down, on to the ground');
    // Under the roof it does not fly: it sits, however long.
    const [stat] = fly(sky, [mob], 120);
    assert.equal(stat.takeoffs, 0);
    assert.ok(stat.highest < 1.5, `it got ${stat.highest} up under the roof`);
    // The roof is taken away: up again.
    roof(sky, 12, false);
    assert.ok(until(sky, info('haast_eagle').glidePerch[1] + 12, () => glider.mode === 'soar') > 0, 'it flies again');
    fly(sky, [mob], 60);
});

test('one that sits under a small roof flutters out from under it and takes off; one shut in a room stays in it', () => {
    const sky = makeSky({ seed: 9 });
    const mob = sky.spawn('haast_eagle');
    const glider = mob.userData.glider;
    // A porch of 5 by 5, three blocks over its head.
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) sky.setBlock(x, 3, z, 'stone');
    const hopped = until(sky, 40, () => glider.mode === 'hop');
    assert.ok(hopped > 0, 'it sets off on a flutter');
    const landed = until(sky, 10, () => {
        assert.ok(problemsOf(sky, mob).length === 0);
        assert.ok(mob.position.y < 2, 'low, under the porch');
        return glider.mode === 'perch';
    });
    assert.ok(landed > 0);
    assert.ok(Math.max(Math.abs(mob.position.x - 0.5), Math.abs(mob.position.z - 0.5)) > 2.5 && mob.position.y === 0, 'out from under it, on the ground');
    assert.ok(until(sky, info('haast_eagle').glidePerch[1] + 5, () => glider.mode === 'soar') > 0, 'and from there it takes off');

    // A room with walls and a ceiling: no way out that it can see.
    const room = makeSky({ seed: 9 });
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
        room.setBlock(x, 4, z, 'stone');
        if (Math.max(Math.abs(x), Math.abs(z)) === 4) for (let y = 0; y < 4; y++) room.setBlock(x, y, z, 'stone');
    }
    const shut = behaviour.spawnKept.call(room.game, 'argentavis', new Vector3(0.5, 0, 0.5), { variant: 0 });
    const [stat] = fly(room, [shut], 180);
    assert.equal(shut.position.y, 0, 'on the floor of the room');
    assert.equal(stat.takeoffs, 0);
    assert.ok(Math.max(Math.abs(shut.position.x - 0.5), Math.abs(shut.position.z - 0.5)) < 3.5, 'still in the room');
});

// ---- The ways it comes to be ----

test('spawnKept gives an animal the server keeps its body, in ambientMobs, on the ground at the place told, and it takes off from there', () => {
    const sky = makeSky();
    for (const [index, id] of GLIDERS.entries()) {
        const x = -6.5 + index * 6;
        const mob = behaviour.spawnKept.call(sky.game, id, new Vector3(x, 0, 2.5), { variant: 1 });
        assert.ok(mob && sky.game.ambientMobs.includes(mob), id);
        assert.equal(mob.userData.variant, 1);
        assert.equal(mob.userData.natural, undefined, 'never a wild one');
        assert.deepEqual([mob.position.x, mob.position.y, mob.position.z], [x, 0, 2.5], 'at the place');
        assert.deepEqual([mob.userData.home.x, mob.userData.home.z], [x, 2.5], 'which is its home');
        assert.equal(mob.userData.glider.mode, 'perch', 'on the ground to begin with');
        assert.ok(mob.userData.glider.fold === 1, 'its wings folded');
    }
    const mobs = [...sky.game.ambientMobs];
    assert.equal(mobs.length, 3);
    const up = until(sky, 8, () => mobs.every((mob) => mob.userData.glider.mode !== 'perch'));
    assert.ok(up > 1.5, `they all take off within a few seconds: ${up}`);
    fly(sky, mobs, 60);
});

test('told of by the server, a revived one gets its body through js/game/animals.js and lives around the home the server says', () => {
    const sky = makeSky({ blocks: townBlocks(), seed: 31 });
    const game = sky.game;
    game.network.playerId = 'me';
    game.animalsForgetAll();
    // What a frame of the server says of one the machine has just revived: nobody's, roaming, never walked (its
    // Radius is 0), with a blow already taken.
    const told = (id, species, x, y, z) => ({ id, species, variant: 0, mode: MODE.roam, home: { x, y, z }, place: { x: 0, y: 0, z: 0 }, hurt: 8, walk: null, owned: false, session: '', ownerName: '', extra: '', walked: false });
    game.animalsNew(told(7, 'argentavis', 1.5, 0, -2.5));
    assert.equal(game.ambientMobs.length, 1);
    const mob = game.ambientMobs[0];
    const data = mob.userData;
    assert.equal(data.species, 'argentavis');
    assert.equal(data.animalId, 7);
    assert.equal(data.animalForeign, true, 'nothing here says where it goes: its own movement does');
    assert.deepEqual([data.home.x, data.home.y, data.home.z], [1.5, 0, -2.5], 'its home is the server\'s, the same for everybody');
    assert.deepEqual([mob.position.x, mob.position.y, mob.position.z], [1.5, 0, -2.5]);
    assert.equal(data.health, data.maxHealth - 4, 'and so is its health');
    assert.ok(game.getMobGoal(mob, 0) === null, 'the server walks it nowhere');
    // Every frame as the game runs them: the mobs, then animals.js. It lives around that home.
    const [stat] = fly(sky, [mob], 240, () => game.animalsUpdate(FRAME));
    assert.ok(stat.takeoffs >= 1 && stat.seconds.soar > 100);
    assert.ok(stat.longest < Math.hypot(info('argentavis').speed, GLIDE.stoop) * FRAME * 1.05, 'it is never put anywhere');
    assert.deepEqual([data.home.x, data.home.y, data.home.z], [1.5, 0, -2.5]);
    // The server's row of each: nothing walks it (Radius 0), and nothing chases for it (the dive is each client's).
    const go = fs.readFileSync(path.join(STATIC, '..', '..', 'network', 'revival.go'), 'utf8');
    for (const id of GLIDERS) {
        const row = new RegExp(`^\\t"${id}":\\s*\\{([^}]*)\\},$`, 'm').exec(go);
        assert.ok(row, id);
        assert.match(row[1], /Radius: 0,/, id);
        assert.match(row[1], /Chase: 0\b/, id);
        assert.match(row[1], new RegExp(`Speed: ${info(id).speed},`), id);
        assert.deepEqual(JSON.parse(vm.runInContext(`JSON.stringify(animalsChaseOf(getMobSpecies('${id}')))`, ctx)), { chase: 0, chaseDay: 0, chaseSpeed: 0 }, id);
    }
});

test('/mob and an egg put it on the ground, perched, and say so in the language of the game', () => {
    const sky = makeSky({ player: [0.5, 0.5] });
    const game = sky.game;
    const setLang = vm.runInContext('setGameLang', ctx);
    try {
        for (const [lang, words] of [['EN', /^Pterosaur: here it is, and it will soon take off$/], ['ES', /^Pterosaurio: ya está aquí, y pronto echará a volar$/]]) {
            setLang(lang);
            sky.said.length = 0;
            game.spawnMobFromCommand(['pterosaur']);
            assert.equal(sky.said.length, 1);
            assert.match(sky.said[0], words);
        }
    } finally {
        setLang('EN');
    }
    assert.equal(game.ambientMobs.length, 2);
    const mob = game.ambientMobs[0];
    assert.deepEqual([mob.position.x, mob.position.y, mob.position.z], [0.5, 0, -2.5], 'three blocks ahead of the player');
    assert.equal(mob.userData.glider.mode, 'perch');
    // An egg used on the top of a block.
    sky.said.length = 0;
    game.spawnAnimalFromEgg('haast_eagle', { x: 5, y: -1, z: 5 });
    assert.equal(game.ambientMobs.length, 3);
    const hatched = game.ambientMobs[2];
    assert.deepEqual([hatched.position.x, hatched.position.y, hatched.position.z], [5.5, 0, 5.5]);
    assert.equal(game.eggsUsed, 1);
    assert.ok(sky.said[0].startsWith(`${EAGLE}: `));
    // Where there is no ground, nothing is made and the egg is kept.
    sky.said.length = 0;
    sky.cameraController.getFloorY = () => -100;
    game.spawnAnimalFromEgg('haast_eagle', { x: 5, y: -1, z: 5 });
    game.spawnMobFromCommand(['argentavis']);
    assert.equal(game.ambientMobs.length, 3);
    assert.equal(game.eggsUsed, 1);
    assert.deepEqual(sky.said, [`${EAGLE}: there is no ground to put it on`, 'Argentavis: there is no ground to put it on']);
});

// ---- Struck ----

test('struck on the ground, it takes the blow through damageMobByPlayer, takes off at once and stays up; the last blow defeats it', () => {
    const sky = makeSky({ player: [1.5, 0.5], seed: 4 });
    const game = sky.game;
    const mob = sky.spawn('argentavis', 2.5, 0.5);
    const glider = mob.userData.glider;
    const events = [];
    const emit = game.emitMobEvent;
    game.emitMobEvent = function (event, ...args) { events.push(event); return emit.call(this, event, ...args); };
    assert.equal(glider.mode, 'perch');
    game.interactWithMob(mob);
    assert.equal(mob.userData.health, info('argentavis').maxHealth - 4, 'a bare hand takes 4');
    assert.deepEqual(events, ['hit', 'damaged']);
    assert.equal(glider.mode, 'rise', 'up at once');
    assert.equal(glider.fright, GLIDE.fright);
    // It stays in the air for as long as its fright lasts, and more: no perch is looked for.
    const [stat] = fly(sky, [mob], GLIDE.fright - 1);
    assert.equal(stat.landings, 0);
    assert.ok(glider.mode === 'soar' && mob.position.y > 5);
    // Struck in the air it does not come down: it beats its wings and climbs away.
    game.interactWithMob(mob);
    assert.ok(glider.mode === 'soar' && glider.flapFor > 2);
    // The blows that are left: the last one defeats it, as any mob, with a line in the language of the game.
    const blows = Math.ceil(info('argentavis').maxHealth / 4);
    for (let i = 2; i < blows - 1; i++) game.interactWithMob(mob);
    assert.ok(game.ambientMobs.includes(mob));
    sky.said.length = 0;
    game.interactWithMob(mob);
    assert.ok(!game.ambientMobs.includes(mob) && mob.parent === null, 'gone');
    assert.deepEqual(events.slice(-3), ['damaged', 'defeated', 'removed']);
    assert.deepEqual(sky.said, ['Argentavis: you defeated it']);
});

// ---- A hostile one ----

// The eagle up on its circles with the player standing at `player`, near its home, in the open.
function hunt(player, seed = 2, blocks = {}) {
    const sky = makeSky({ player, seed, blocks });
    const mob = sky.spawn('haast_eagle');
    const glider = mob.userData.glider;
    return { sky, mob, glider };
}

test('a hostile one cries, dives once at a player under it, strikes with its talons and climbs away for a good while', () => {
    const { sky, mob, glider } = hunt([3.5, 2.5]);
    assert.equal(mob.userData.hostile, true);
    const warned = until(sky, 60, () => glider.mode === 'warn');
    assert.ok(warned > 0, 'it sees the player');
    assert.deepEqual(sky.said, [`${EAGLE}: it screeches and dives at you. Step aside, or get under a roof!`]);
    assert.equal(sky.hurt.length, 0);
    assert.ok(mob.position.y > sky.camera.position.y, 'from above');
    // The cry comes first: time to step aside.
    const dived = until(sky, GLIDE.warn + 0.5, () => glider.mode === 'swoop');
    assert.ok(Math.abs(dived - GLIDE.warn) < 0.1, `it dives ${dived} s after its cry`);
    assert.equal(sky.hurt.length, 0);
    // Down it comes, fast, with nothing of it in a block; it strikes once and is off.
    let fastest = 0;
    const last = mob.position.clone();
    const struck = until(sky, GLIDE.swoopFor + 1, () => {
        assert.ok(problemsOf(sky, mob).length === 0);
        fastest = Math.max(fastest, mob.position.distanceTo(last) / FRAME);
        last.copy(mob.position);
        return glider.mode !== 'swoop';
    });
    assert.ok(struck > 0 && struck < GLIDE.swoopFor, `the dive lasted ${struck} s`);
    assert.ok(Math.abs(fastest - info('haast_eagle').chaseSpeed) < 0.01, `it dived at ${fastest.toFixed(2)} blocks a second`);
    assert.equal(sky.hurt.length, 1, 'one blow');
    assert.deepEqual({ ...sky.hurt[0], source: null }, { amount: info('haast_eagle').attackDamage, reason: `${EAGLE}: its talons struck you`, type: 'mob', source: null });
    assert.ok(Math.hypot(sky.hurt[0].source.x - sky.camera.position.x, sky.hurt[0].source.z - sky.camera.position.z) <= GLIDE.talons, 'from where it is, for a shield to read');
    assert.equal(glider.mode, 'soar');
    // Away it climbs, and it does not dive again for a good while, though the player has not moved.
    const [stat] = fly(sky, [mob], GLIDE.swoopEvery[0] - 1);
    assert.equal(sky.hurt.length, 1);
    assert.ok(!stat.seconds.warn && !stat.seconds.swoop);
    assert.ok(mob.position.y > 5, 'back up');
    // And then it does, again and again, never more often than that, and saying so no more than once a minute.
    fly(sky, [mob], 180);
    assert.ok(sky.hurt.length >= 3 && sky.hurt.length <= 1 + Math.ceil(180 / GLIDE.swoopEvery[0]), `${sky.hurt.length} blows in ${GLIDE.swoopEvery[0] + 180} s`);
    assert.ok(sky.said.length >= 2 && sky.said.length <= 5, `${sky.said.length} lines`);
});

test('whoever steps aside when it dives is missed: it comes at where they are, not at where they will be', () => {
    const { sky, mob, glider } = hunt([3.5, 2.5], 6);
    assert.ok(until(sky, 60, () => glider.mode === 'swoop') > 0);
    // The player runs across its way, as fast as they walk, until it has gone by.
    const side = Math.atan2(mob.position.z - sky.camera.position.z, mob.position.x - sky.camera.position.x) + Math.PI / 2;
    const over = until(sky, GLIDE.swoopFor + 1, () => {
        sky.camera.position.x += Math.cos(side) * 4.5 * FRAME;
        sky.camera.position.z += Math.sin(side) * 4.5 * FRAME;
        return glider.mode !== 'swoop';
    });
    assert.ok(over > 0);
    assert.equal(sky.hurt.length, 0, 'missed');
    assert.equal(glider.mode, 'soar');
});

test('a player with a roof over them is never dived at, nor one far from its home, nor one on the title screen; and a peaceful one dives at nobody', () => {
    // Under a porch three blocks up.
    const blocks = {};
    for (let x = 2; x <= 4; x++) for (let z = 1; z <= 3; z++) blocks[`${x},3,${z}`] = 'stone';
    const porch = hunt([3.5, 2.5], 2, blocks);
    let [stat] = fly(porch.sky, [porch.mob], 240);
    assert.ok(!stat.seconds.warn && !stat.seconds.swoop && porch.sky.hurt.length === 0 && porch.sky.said.length === 0, 'safe under a roof');
    assert.ok(stat.seconds.soar > 120);
    // Just outside its range.
    const far = hunt([0.5 + info('haast_eagle').glideRange + 0.5, 0.5]);
    [stat] = fly(far.sky, [far.mob], 240);
    assert.ok(!stat.seconds.warn && far.sky.hurt.length === 0, 'out of its range');
    // Nobody is there on the title screen, nor while the player waits to come back.
    const title = hunt([3.5, 2.5]);
    title.sky.game.titleScreenOpen = true;
    [stat] = fly(title.sky, [title.mob], 120);
    assert.ok(!stat.seconds.warn && title.sky.hurt.length === 0);
    title.sky.game.titleScreenOpen = false;
    title.sky.game.respawnPending = true;
    [stat] = fly(title.sky, [title.mob], 120);
    assert.ok(!stat.seconds.warn && title.sky.hurt.length === 0);
    // The two that are not hostile, with a player right under them.
    const calm = makeSky({ player: [3.5, 2.5], seed: 8 });
    const mobs = [calm.spawn('argentavis'), calm.spawn('pterosaur', -3.5, 0.5)];
    for (const mob of mobs) assert.equal(mob.userData.hostile, false);
    for (const each of fly(calm, mobs, 300)) assert.ok(!each.seconds.warn && !each.seconds.swoop);
    assert.equal(calm.hurt.length, 0);
    assert.equal(calm.said.length, 0);
});

// ---- How it looks ----

test('it beats its wings to rise and holds them out to glide, leans into its turns, and folds them on its perch', () => {
    const sky = makeSky({ seed: 14 });
    const mob = sky.spawn('argentavis');
    const glider = mob.userData.glider;
    const data = mob.userData;
    const [wingL, wingR] = data.wings;
    const tipL = data.modelParts.wingTipL;
    assert.ok(wingL && wingR && tipL && data.modelParts.fingerL4, 'the real model, with its rig');
    sky.game.updateAmbientMobs(FRAME);
    // On the ground: folded back along its body, upright, the outer half over the inner, and its body tipped up.
    assert.ok(Math.abs(wingL.rotation.y - GLIDE.foldBack) < 1e-6 && Math.abs(wingR.rotation.y + GLIDE.foldBack) < 1e-6);
    assert.ok(Math.abs(wingL.rotation.x - GLIDE.foldUp) < 1e-6 && Math.abs(tipL.rotation.y - GLIDE.tuck) < 1e-6);
    assert.ok(Math.abs(mob.rotation.x - GLIDE.stance) < 1e-6 && mob.rotation.z === 0);
    // Rising: they open and beat, up and down, both together.
    assert.ok(until(sky, 8, () => glider.mode === 'rise') > 0);
    let low = Infinity;
    let high = -Infinity;
    assert.ok(until(sky, 6, () => {
        if (glider.fold < 0.2) {
            low = Math.min(low, wingL.rotation.z);
            high = Math.max(high, wingL.rotation.z);
            assert.ok(Math.abs(wingL.rotation.z + wingR.rotation.z) < 1e-9, 'the two wings mirror each other');
        }
        return glider.mode === 'soar' && mob.position.y > glider.cruiseY - 1;
    }) > 0);
    assert.ok(high - low > GLIDE.stroke, `its wings went from ${low.toFixed(2)} to ${high.toFixed(2)}`);
    assert.ok(glider.flap > 0.9, 'beating all the way up');
    // Gliding: once it is up they are held out, still, a little raised; and it leans into its circle.
    assert.ok(until(sky, 12, () => glider.flap === 0 && glider.fold < 0.01) > 0, 'it stops beating');
    assert.ok(Math.abs(wingL.rotation.z - GLIDE.dihedral) < 0.01 && Math.abs(wingL.rotation.y) < 0.01 && Math.abs(wingL.rotation.x) < 0.02, 'held out');
    let leaned = 0;
    let glided = 0;
    let beats = 0;
    let beating = false;
    const frames = 60 * 30;
    for (let frame = 0; frame < frames && glider.mode === 'soar'; frame++) {
        sky.game.updateAmbientMobs(FRAME);
        if (glider.flap === 0) glided++;
        if (glider.flap > 0.5 && !beating) beats++;
        beating = glider.flap > 0.5;
        if (Math.abs(glider.turning) > 0.2 && Math.sign(mob.rotation.z) === Math.sign(glider.turning) && Math.abs(mob.rotation.z) > 0.1) leaned++;
    }
    assert.ok(glided > frames * 0.5, `it glided for ${glided} frames of ${frames}`);
    assert.ok(beats >= 1 && beats <= 60 / info('argentavis').glideBeat[0] + 1, `${beats} bursts of wingbeats in a minute`);
    assert.ok(leaned > frames * 0.5, `it leaned into its turn for ${leaned} frames of ${frames}`);
    assert.ok(Math.abs(mob.rotation.z) <= 0.6);
});

// ---- What it costs ----

test('it looks at few blocks: a few times a second, and at none at all on most frames', () => {
    const sky = makeSky({ blocks: townBlocks(), seed: 16 });
    for (const id of GLIDERS) {
        sky.game.ambientMobs = [];
        const mob = sky.spawn(id);
        const glider = mob.userData.glider;
        assert.ok(until(sky, 40, () => glider.mode === 'soar' && mob.position.y > glider.cruiseY - 1) > 0, id);
        sky.counts.looks = 0;
        let quiet = 0;
        const frames = 60 * 60;
        for (let frame = 0; frame < frames; frame++) {
            const before = sky.counts.looks;
            sky.game.updateAmbientMobs(1 / 60);
            if (sky.counts.looks === before) quiet++;
        }
        const each = sky.counts.looks / 60;
        log(id, 'looks at', each.toFixed(0), 'blocks a second;', ((quiet / frames) * 100).toFixed(0), '% of frames at none');
        // (A fish of the game looks at half a dozen every frame: some 360 a second.)
        assert.ok(each < 260, `${id} looks at ${each.toFixed(0)} blocks a second`);
        // (A wide one has seven points to keep out of the blocks, and each looks when it crosses into a cell.)
        assert.ok(quiet / frames > 0.45, `${id} looks at blocks on ${frames - quiet} frames of ${frames}`);
    }
});

test('nothing is made on a frame: no vector, no list and no function in what runs every frame or at every look', () => {
    // (A cry and a beat do make the few numbers of their sound, when they happen: glidersCry, glidersWhoosh.)
    for (const name of ['glidersFree', 'glidersGround', 'glidersOpenSky', 'glidersClearLine', 'glidersTop', 'glidersFits', 'glidersTry', 'glidersProbe', 'glidersUpdate', 'glidersSense',
        'glidersFly', 'glidersNewCircle', 'glidersChoosePerch', 'glidersPerchLook', 'glidersRise', 'glidersRiseLook', 'glidersSettle', 'glidersLand', 'glidersFindOpen', 'glidersHop',
        'glidersLookForPrey', 'glidersDive', 'glidersSwoop', 'glidersPullUp', 'glidersAnimate', 'glidersPose']) {
        const start = source.indexOf(`\n    ${name}(`);
        assert.ok(start > 0, name);
        const body = source.slice(start, source.indexOf('\n    },\n', start));
        assert.doesNotMatch(body, /\bnew [A-Z]|=>|\bfunction\b|\.clone\(\)|\.forEach\(|\.map\(|\.filter\(|=\s*\[|\{\s*[a-z]+:/, `${name} makes something`);
    }
});

// ---- What the guide says ----

test('the pages of the three say of their flight what the code does, in both languages', () => {
    const pages = { haast_eagle: 280, argentavis: 281, pterosaur: 298 };
    // A page as one line: a sentence may be broken anywhere.
    const text = (id, lang) => page(pages[id], lang).replace(/\s+/g, ' ');
    const blows = (id) => [4, 5, 6, 7, 8].map((damage) => Math.ceil(info(id).maxHealth / damage));
    for (const id of GLIDERS) {
        const es = text(id, 'ES');
        const en = text(id, 'EN');
        const species = info(id);
        const said = (spanish, english, what) => assert.ok(es.includes(spanish) && en.includes(english), `${id}, ${what}: "${spanish}" / "${english}"`);
        said(`a unos **${species.glideHeight} bloques** del suelo`, `about **${species.glideHeight} blocks** over the ground`, 'how high');
        said(`Nunca se aleja más de ${species.glideRange} bloques de su casa`, `It never goes more than ${species.glideRange} blocks from its home`, 'how far');
        said(`Tras ${species.glideAloft.join(' a ')} segundos en el aire`, `After ${species.glideAloft.join(' to ')} seconds in the air`, 'how long in the air');
        said(`se queda allí de ${species.glidePerch.join(' a ')} segundos`, `sits there for ${species.glidePerch.join(' to ')} seconds`, 'how long on its perch');
        assert.ok(es.includes(`ada ${species.glideBeat.join(' a ')} segundos`) && en.includes(`very ${species.glideBeat.join(' to ')} seconds`), `${id}, how often it beats its wings`);
        said(`sube **${GLIDE.liftoff} bloques** en vertical`, `rises **${GLIDE.liftoff} blocks** straight up`, 'its take-off');
        said(`cielo abierto a menos de ${GLIDE.hopReach} bloques`, `open sky within ${GLIDE.hopReach} blocks`, 'the flutter out from under a roof');
        said(`a los ${GLIDE.roofFor} segundos`, `after ${GLIDE.roofFor} seconds`, 'a roof put over it');
        said(`por lo menos ${GLIDE.fright} segundos`, `at least ${GLIDE.fright} seconds`, 'struck');
        said(`**${species.maxHealth} de vida**: ${blows(id)[0]} golpes a mano`, `**${species.maxHealth} health**: ${blows(id)[0]} hits bare-handed`, 'its health');
        said('Le basta **una pieza** y tarda **45 segundos**', '**One piece** is enough and it takes **45 seconds**', 'its revival');
        said(`\`/mob ${id}\``, `\`/mob ${id}\``, 'the command');
        said(`\`${id}_egg\`: aparece sobre el bloque`, `\`${id}_egg\`: it appears on the block`, 'its egg');
    }
    assert.deepEqual([blows('haast_eagle'), blows('argentavis'), blows('pterosaur')], [[4, 4, 3, 3, 2], [5, 4, 4, 3, 3], [4, 4, 3, 3, 2]], 'bare-handed, and with a sword of wood, stone, iron and gold');
    for (const id of ['haast_eagle', 'pterosaur']) {
        assert.ok(text(id, 'ES').includes('4 golpes a mano o con una [espada](71) de madera, 3 con la de piedra o la de hierro, 2 con la de oro'), id);
        assert.ok(text(id, 'EN').includes('4 hits bare-handed or with a wooden [sword](71), 3 with a stone or an iron one, 2 with a golden one'), id);
    }
    assert.ok(text('argentavis', 'ES').includes('5 golpes a mano, 4 con [espada](71) de madera o de piedra, 3 con la de hierro o la de oro'));
    assert.ok(text('argentavis', 'EN').includes('5 hits bare-handed, 4 with a wooden or a stone [sword](71), 3 with an iron or a golden one'));
    // Their wings, as the model measures them.
    assert.ok(text('haast_eagle', 'ES').includes('En el juego miden 2,6 bloques') && text('haast_eagle', 'EN').includes('In the game they measure 2.6 blocks'));
    for (const id of ['argentavis', 'pterosaur']) assert.ok(/\*\*(alas de )?5 bloques\*\*/.test(text(id, 'ES')) && /\*\*(wings of )?5\s+blocks\*\*/.test(text(id, 'EN')), id);
    // What they leave.
    const drops = (id) => JSON.parse(vm.runInContext(`JSON.stringify([RESOURCE_DROPS.${id}, RESOURCE_SHEDS.${id} || null])`, ctx));
    assert.deepEqual(drops('haast_eagle'), [[['feather', 2, 3]], ['feather', 0.5, 8]]);
    assert.deepEqual(drops('argentavis'), [[['feather', 2, 4]], ['feather', 0.5, 8]]);
    assert.deepEqual(drops('pterosaur'), [[['leather', 1, 2]], null]);
    assert.ok(text('haast_eagle', 'ES').includes('Deja **2 o 3** `feather`') && text('haast_eagle', 'EN').includes('It leaves **2 or 3** `feather`'));
    assert.ok(text('argentavis', 'ES').includes('Deja **de 2 a 4** `feather`') && text('argentavis', 'EN').includes('It leaves **2 to 4** `feather`'));
    assert.ok(text('pterosaur', 'ES').includes('Deja **1 o 2** ![cuero](item:leather) `leather`') && text('pterosaur', 'EN').includes('It leaves **1 or 2** ![leather](item:leather) `leather`'));
    for (const id of ['haast_eagle', 'argentavis']) assert.ok(text(id, 'ES').includes('un **50 %**') && text(id, 'EN').includes('a **50 %**'), id);
    assert.ok(text('pterosaur', 'ES').includes(`Hay **${info('pterosaur').variants} colores**`) && text('pterosaur', 'EN').includes(`There are **${info('pterosaur').variants} colours**`));

    // The eagle's dive.
    const eagle = info('haast_eagle');
    const es = text('haast_eagle', 'ES');
    const en = text('haast_eagle', 'EN');
    assert.ok(es.includes(`a menos de **${eagle.chaseDistance} bloques**`) && en.includes(`within **${eagle.chaseDistance} blocks** of it`), 'from how far');
    assert.ok(es.includes(`${comma(GLIDE.warn)} segundos después **se lanza**`) && en.includes(`${GLIDE.warn} seconds later **it dives**`), 'the time to step aside');
    assert.ok(es.includes(`a **${eagle.chaseSpeed} bloques por segundo**`) && en.includes(`at **${eagle.chaseSpeed} blocks a second**`), 'how fast');
    assert.ok(es.includes(`**${eagle.attackDamage} de daño**`) && en.includes(`**${eagle.attackDamage} damage**`));
    assert.ok(es.includes(`durante ${GLIDE.swoopEvery.join(' a ')} segundos`) && en.includes(`for ${GLIDE.swoopEvery.join(' to ')} seconds`), 'how long before the next');
    assert.ok(es.includes(`hasta ${GLIDE.roof} bloques por encima de tu cabeza`) && en.includes(`up to ${GLIDE.roof} blocks over your head`), 'the roof that saves you');
    assert.ok(es.includes(`a menos de ${eagle.glideRange} bloques de su casa`) && en.includes(`keep ${eagle.glideRange} blocks away from its home`));
    // The other two say that they dive at nobody.
    for (const id of ['argentavis', 'pterosaur']) assert.ok(text(id, 'ES').includes('no se lanza a por nadie') && text(id, 'EN').includes('it dives at nobody'), id);
});
