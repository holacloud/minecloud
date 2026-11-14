// Node tests for the Glyptodon (js/game/glyptodon.js): the giant armadillo, tamed with grass, ridden slowly
// and low, whose armour takes half of what an animal does to its rider; and the sizes of the four big land
// animals of its wave (the mammoth, the triceratops, the deinotherium and it), which have to feel big next to
// a player and fit the health bar over them. The real mobs.js, taming.js, riding.js, herd.js, camera.js and
// world.js run on a flat world (support/flat_world.js); only drawing and sound are left out. What every
// extinct animal has to be is asked of it by extinct_species.test.js.
// Run with: node --test test/js/glyptodon.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC } = require('./support/game.js');
const { loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame();
const page = (lang) => fs.readFileSync(path.join(STATIC, 'guide', `301_${lang}_${lang === 'ES' ? 'Gliptodonte' : 'Glyptodon'}.md`), 'utf8');
const info = ctx.getMobSpecies('glyptodon');
// No assertion here is ever given a mob: when one fails, node prints both sides, and a mob of this harness
// is a graph of stand-ins with no end. Ask a yes or a no.
const rides = (g, mob) => g.game.ridingMob === mob;
const onFoot = (g) => !g.game.ridingMob;

test('what it is: a peaceful grazer, tamed with grass, a slow mount; and what its page says of it', () => {
    const horse = ctx.getMobSpecies('horse').mount;
    const mount = info.mount;
    assert.equal(info.movement, undefined, 'it walks as any ground mob, so the server walks a kept one');
    assert.equal(info.hostile, undefined);
    assert.equal(info.charge, undefined, 'it never charges');
    assert.equal(info.grazer, true);
    assert.ok(ctx.Game.prototype.tamingCanTame.call({}, 'glyptodon'));
    assert.deepEqual([...ctx.TRAPS_SPECIES.glyptodon.baits], []);
    assert.ok(mount.speed < horse.speed && mount.jump < horse.jump && info.speed < ctx.getMobSpecies('pig').speed, 'slow and steady');

    const es = page('ES');
    const en = page('EN');
    const comma = (value) => String(value).replace('.', ',');
    const diet = ctx.TAMING_DIET.glyptodon;
    assert.equal(diet.chance, 1 / 3);
    for (const food of diet.foods) {
        assert.ok(es.includes(`\`${food}\``) && en.includes(`\`${food}\``), food);
    }
    assert.ok(es.includes('con **1 de 3** por intento') && en.includes('with **1 in 3** per try'));
    const [hand, stone, iron, gold] = [4, 6, 7, 8].map((damage) => Math.ceil(info.maxHealth / damage));
    assert.ok(en.includes(`**${info.maxHealth} health**: ${hand} hits bare-handed, ${stone} with a stone [sword](71), ${iron} with an iron one, ${gold} with a golden one`));
    assert.ok(es.includes(`**${info.maxHealth} de vida**: ${hand} golpes a mano, ${stone} con una [espada](71) de piedra, ${iron} con una de hierro, ${gold} con una de oro`));
    const gallop = Math.round(mount.speed * 1.25 * 10) / 10;
    const jump = Math.round(mount.jump * mount.jump / 40);
    assert.ok(en.includes(`| Your eyes, above the ground | **${mount.eyeHeight.toFixed(1)} blocks** | ${horse.eyeHeight.toFixed(1)} blocks |`));
    assert.ok(es.includes(`| Tus ojos, sobre el suelo | **${comma(mount.eyeHeight.toFixed(1))} bloques** | ${comma(horse.eyeHeight.toFixed(1))} bloques |`));
    assert.ok(en.includes(`| Speed, blocks per second | **${mount.speed}** | ${horse.speed} |`) && es.includes(`| Velocidad, bloques por segundo | **${comma(mount.speed)}** | ${horse.speed} |`));
    assert.ok(en.includes(`**${gallop}** | ${horse.speed * 1.25} |`) && es.includes(`**${comma(gallop)}** | ${comma(horse.speed * 1.25)} |`));
    assert.equal(jump, 1);
    assert.ok(en.includes('about **1 block**') && es.includes('**1 bloque**, más o menos'));
    const room = Math.ceil(mount.eyeHeight + 0.2);
    assert.ok(en.includes(`**It needs ${room} free blocks of height**`) && es.includes(`**Necesita ${room} bloques libres de altura**`));
    const shield = vm.runInContext('GLYPTODON_SHIELD', ctx);
    assert.equal(shield, 0.5);
    assert.ok(en.includes('do **half the damage**') && es.includes('hacen **la mitad de daño**'));
});

test('it is ridden on the top of its shell, and under a roof 3 blocks up it is not', () => {
    const g = makeFlatWorld(ctx, { blocks: { '12,2,0': 'stone', '20,3,0': 'stone' } });
    const mob = g.spawn('glyptodon', 3.5, 0.5);
    const height = g.game.herdHeight(mob);
    assert.ok(info.mount.seat < height && info.mount.seat > height - 0.6, `the seat on its back: ${info.mount.seat} on ${height}`);
    assert.ok(Math.abs(info.mount.eyeHeight - info.mount.seat - 1.62) < 0.01, 'the eyes of somebody sitting there');
    g.game.raycastMob = () => mob;
    assert.equal(g.game.tryMountMob(), true);
    assert.ok(rides(g, mob), 'the player is on it');
    assert.ok(Math.abs(g.camera.position.y - info.mount.eyeHeight) < 0.02);
    g.run(1);
    g.game.dismount();
    assert.ok(onFoot(g));

    const under = (x) => {
        const low = g.spawn('glyptodon', x, 2.5);
        low.position.set(x, 0, 0.5);
        g.game.raycastMob = () => low;
        return low;
    };
    const low = under(12.5);
    assert.equal(g.game.tryMountMob(), true);
    assert.ok(onFoot(g) && !rides(g, low), 'two free blocks are not enough');
    const high = under(20.5);
    assert.equal(g.game.tryMountMob(), true);
    assert.ok(rides(g, high), 'three are');
    g.game.dismount();
});

test('its armour halves the blows of animals to its rider, and nothing else', () => {
    const g = makeFlatWorld(ctx);
    const mob = g.spawn('glyptodon', 3.5, 0.5);
    // Its own modifier, alone: the others (armour, shield) read an inventory this harness has not got.
    const modifiers = vm.runInContext('DAMAGE_MODIFIERS', ctx);
    const own = modifiers.find((modifier) => String(modifier).includes('glyptodon'));
    assert.ok(own, 'it registers one');
    const take = (amount, type) => own.call(g.game, amount, type, 'test', null);
    assert.equal(take(4, 'mob'), 4, 'on foot');
    g.game.raycastMob = () => mob;
    g.game.tryMountMob();
    assert.ok(rides(g, mob));
    assert.equal(take(4, 'mob'), 2, 'riding it');
    for (const type of ['fall', 'poison', 'lightning', 'void', 'other']) assert.equal(take(4, type), 4, type);
    g.game.dismount();
    const horse = g.spawn('horse', 8.5, 0.5);
    g.game.raycastMob = () => horse;
    g.game.tryMountMob();
    assert.ok(rides(g, horse));
    assert.equal(take(4, 'mob'), 4, 'a horse has no armour');
});

test('the four big ones feel big next to a player, and the health bar stands over them', () => {
    const g = makeFlatWorld(ctx);
    // (blocks tall: from, to; the player is 1.8)
    const sizes = { mammoth: [3.1, 3.5], deinotherium: [3.4, 3.8], triceratops: [2.5, 2.9], glyptodon: [1.3, 1.6] };
    for (const [id, [low, high]] of Object.entries(sizes)) {
        const mob = g.spawn(id, 3.5, 0.5 + Object.keys(sizes).indexOf(id) * 8);
        const height = g.game.herdHeight(mob);
        assert.ok(height > low && height < high, `${id} is ${height} blocks tall`);
        // The health bar floats over the top of the model as js/models.js measures it, without the turns of
        // its parts: the frill of the triceratops leans back, its tusks and horns curl, and each piece of
        // them hangs from the head at a place worked out once, so the measure stays in the range above.
        const bar = mob.userData.healthBar.position.y - 0.35;
        assert.ok(bar > low && bar < high, `${id}: the health bar at ${bar}`);
        assert.ok(g.game.herdRadius(mob) > 1.2 && g.game.herdRadius(mob) < 3.4, `${id} reaches ${g.game.herdRadius(mob)} from its middle`);
        assert.equal(mob.userData.legs.length, 4, id);
        assert.ok(Boolean(mob.userData.head && mob.userData.tail.length > 0), `${id}: the rig the shared animation moves`);
    }
});
