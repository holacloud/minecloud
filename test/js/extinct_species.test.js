// Node tests for what every extinct animal of the game has to be (`hiddenUntilDiscovered`, js/mobSpecies.js),
// whichever there are, so that one more needs no test of its own for any of this: a fossil to be found as,
// a model that is built and painted without a browser and stands in the world, a body as an animal the
// server keeps (js/game/animals.js), nothing that spawns it, its row for the traps, a mount only if it
// says how it is ridden, and its two guide pages with its portrait, the block its fossil is in and the
// pages that say how to find it and how to bring it back.
// What its card, its row of page 261, its foods and its baits have to say is asked by bestiary_text.test.js
// and guide_facts.test.js; this file does not ask it again. Made-up animals, each wrong in one thing, show
// that every rule here bites. Nothing runs a browser.
// Run with: node --test test/js/extinct_species.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { STATIC, JS, anyStub } = require('./support/game.js');
const print = require(path.join(JS, 'guidePrint.js'));
const GUIDE = path.join(STATIC, 'guide');
const plain = (value) => JSON.parse(JSON.stringify(value));

// ---- The game ----

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
}
function canvasStub() {
    const ctx = new Proxy({}, {
        get: (target, key) => (key in target ? target[key] : () => ({ data: new Uint8ClampedArray(4 * 4096), addColorStop() {} })),
        set: (target, key, value) => { target[key] = value; return true; }
    });
    return { width: 16, height: 16, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,' };
}

// What is read of a species' model, inside the game: its parts as the builder holds them, each face painted
// on a plain array as VoxelModelBuilder.paintAtlas does on a canvas, and the body js/game/herd.js reads from
// it. Everything comes back as text, to be read on this side.
const PROBE = `(function (id) {
    const info = MOB_SPECIES[id];
    const build = VoxelModels.mobBuilders[id];
    const out = { built: Boolean(build), variants: [], body: null };
    if (!build) return JSON.stringify(out);
    // A point turned as a part is (the rotation of a pivot is an Euler XYZ of THREE: about z, then y, then x).
    const turned = ([x, y, z], rotation) => {
        if (!rotation) return [x, y, z];
        let c = Math.cos(rotation[2]);
        let s = Math.sin(rotation[2]);
        [x, y] = [x * c - y * s, x * s + y * c];
        c = Math.cos(rotation[1]);
        s = Math.sin(rotation[1]);
        [x, z] = [x * c + z * s, -x * s + z * c];
        c = Math.cos(rotation[0]);
        s = Math.sin(rotation[0]);
        return [x, y * c - z * s, y * s + z * c];
    };
    for (let variant = 0; variant < (info.variants || 1); variant++) {
        const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'fur' });
        const seen = { variant, parts: 0, twice: [], orphans: [], unpainted: [], rig: {}, bottom: Infinity, atlas: [0, 0], error: null };
        out.variants.push(seen);
        try {
            const rig = build.call(VoxelModels, b, variant) || {};
            seen.parts = b.parts.length;
            const made = new Set();
            for (const part of b.parts) {
                if (part.parent && !made.has(part.parent)) seen.orphans.push((part.name || '(no name)') + ' hangs from ' + part.parent);
                if (part.name && made.has(part.name)) seen.twice.push(part.name);
                if (part.name) made.add(part.name);
                if (part.paint.color === undefined) seen.unpainted.push(part.name || '(no name)');
                // Its lowest corner, where it really is: turned and moved as each part it hangs from.
                for (let corner = 0; corner < 8; corner++) {
                    let point = [0, 1, 2].map((axis) => part.from[axis] + ((corner >> axis) & 1) * part.size[axis]);
                    for (let link = part; link; link = link.parent && b.byName.get(link.parent)) {
                        point = turned(point, link.rotation).map((value, axis) => value + link.pivot[axis]);
                    }
                    seen.bottom = Math.min(seen.bottom, point[1]);
                }
            }
            seen.bottom = Math.round(seen.bottom * 100) / 100;
            for (const [key, value] of Object.entries(rig)) {
                if (key === 'legAxis') continue;
                seen.rig[key] = (Array.isArray(value) ? value : [value]).filter((name) => !made.has(name)).map(String);
            }
            const atlas = b.packAtlas();
            seen.atlas = [atlas.width, atlas.height];
            const data = new Uint8ClampedArray(atlas.width * atlas.height * 4);
            b.parts.forEach((part, index) => {
                for (const face of FACE_ORDER) {
                    const rect = part.atlas[face];
                    const [w, h] = b.faceSize(part.size, face);
                    const painter = new FacePainter(data, atlas.width, rect.x, rect.y, w, h, b.texelsPerUnit, 31 + index * 7);
                    painter.fill(part.paint.color === undefined ? 0xff00ff : part.paint.color, part.paint.noise === undefined ? 0.05 : part.paint.noise);
                    if (part.paint.all) part.paint.all(painter, face);
                    if (part.paint.faces && part.paint.faces[face]) part.paint.faces[face](painter);
                }
            });
        } catch (error) {
            seen.error = String(error && error.message);
        }
    }
    out.body = herdSpeciesBody(id);
    return JSON.stringify(out);
})`;

// Every script of index.html but the game's own class, as the printed guide loads them. `extra` runs at the
// end: the made-up species of the last test.
function loadGame(extra = '') {
    const THREE = new Proxy({ Vector3, Vector2: Vector3, Vector4: Vector3 }, { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const context = vm.createContext({
        console: { ...console, warn() {} }, performance: { now: () => 0 }, THREE, navigator: {}, requestAnimationFrame: () => 0,
        Worker: class { postMessage() {} terminate() {} }, setTimeout() {},
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; } },
        document: { createElement: (tag) => (tag === 'canvas' ? canvasStub() : anyStub()), addEventListener() {}, body: anyStub(), head: anyStub(), getElementById: () => null, querySelector: () => null },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
    });
    context.window = context;
    vm.runInContext('class Game {}', context);
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]).filter((src) => !/^(https?:)?\/\//.test(src) && !print.SKIP_SCRIPTS.test(src));
    for (const src of scripts) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    if (extra) vm.runInContext(extra, context, { filename: 'made-up species' });
    vm.runInContext(`Object.assign(this, { Game, MOB_SPECIES, MOB_BEHAVIOURS, ITEM_TYPES, TAMING_DIET, TRAPS_SPECIES, FOSSIL_SPECIES, fossilItemsOf, fossilBlocksOf, mobMovementIs });
        this.probeModel = ${PROBE};`, context);
    return context;
}

// ---- The guide and the files, as they are ----

const guideFiles = fs.readdirSync(GUIDE).map((name) => name.normalize('NFC'));
const gameFiles = fs.readdirSync(path.join(JS, 'game')).filter((name) => name.endsWith('.js'));
const realGuide = {
    readme: fs.readFileSync(path.join(GUIDE, 'README.md'), 'utf8'),
    // The name of the file of a page, or null where there is none.
    file: (id, lang) => guideFiles.find((name) => name.startsWith(`${id}_${lang}_`)) || null,
    page: (id, lang) => {
        const name = fs.readdirSync(GUIDE).find((file) => file.startsWith(`${id}_${lang}_`));
        return name ? fs.readFileSync(path.join(GUIDE, name), 'utf8') : null;
    },
    // The file a species is written in, as text: the one that registers it.
    source: (id) => {
        for (const name of gameFiles) {
            const text = fs.readFileSync(path.join(JS, 'game', name), 'utf8');
            if (new RegExp(`^registerSpecies\\('${id}',`, 'm').test(text)) return text;
        }
        return null;
    }
};

// ---- The rules ----

// The pages of the guide every extinct animal's page leads to: where its fossil is found, by the kind of
// fossil it is, and the machine that brings it back (demanded once that page is written).
const FOSSILS_PAGE = 262;
const AMBER_PAGE = 263;
const MACHINE_PAGE = 264;
const RIDING_PAGE = 7;
const LANGS = ['ES', 'EN'];
const RIG = ['legs', 'arms', 'wings', 'tail', 'head'];
// What a mount says for js/game/riding.js and js/camera.js to carry a rider.
const MOUNT = ['eyeHeight', 'seat', 'speed', 'autoJump', 'jump'];
// A model of an animal, the smallest insect and the biggest dinosaur among them: so many boxes (the bee has
// 5), and no bigger than this in blocks (the body js/game/herd.js reads: how far it reaches from its middle,
// and its top; a bee is 0.09 tall and a giraffe 3.75). `feet` is how far from y = 0, in sixteenths of a
// block, the lowest corner of what walks may be: the pig's is at 1 and a scorpion's at 1.5.
const SIZE = { partsMin: 5, partsMax: 160, reachMax: 12, heightMin: 0.04, heightMax: 12, atlasMax: 2048, feet: 2 };

const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// What is wrong with these species, in lines. `game` is a loaded game and `guide` what is read of the guide
// and of the files (realGuide, or the made-up one of the last test).
function extinctProblems(game, ids, guide) {
    const problems = [];
    for (const id of ids) {
        const info = game.MOB_SPECIES[id];
        const say = (what) => problems.push(`${id}: ${what}`);
        const movement = info.movement || 'ground';
        const behaviour = game.MOB_BEHAVIOURS[movement];

        // Its fossil, and the items that come of it.
        const fossil = game.FOSSIL_SPECIES[id];
        if (!fossil) say('it has no fossil: nobody could find it and bring it back (fossil: { source, rarity } in registerSpecies)');
        else if (!game.fossilItemsOf(id).length || !game.fossilItemsOf(id).every((item) => game.ITEM_TYPES[item])) say('the items of its fossil were never made');

        // Its model.
        const model = JSON.parse(game.probeModel(id));
        if (!model.built) say('it has no model: it would be drawn as a pig');
        for (const seen of model.variants) {
            const which = model.variants.length > 1 ? ` (variant ${seen.variant})` : '';
            if (seen.error) { say(`its model${which} is not built without a browser: ${seen.error}`); continue; }
            if (seen.parts < SIZE.partsMin || seen.parts > SIZE.partsMax) say(`its model${which} has ${seen.parts} parts: from ${SIZE.partsMin} to ${SIZE.partsMax}`);
            for (const name of seen.twice) say(`its model${which} has two parts called ${name}: the second takes the place of the first`);
            for (const orphan of seen.orphans) say(`in its model${which} ${orphan}, which is not made before it`);
            for (const name of seen.unpainted) say(`the part ${name} of its model${which} has no colour: it would be magenta`);
            for (const [key, missing] of Object.entries(seen.rig)) {
                if (!RIG.includes(key)) say(`its rig${which} says ${key}, which nothing moves: ${RIG.join(', ')}`);
                else if (missing.length) say(`its rig${which} names ${key}: ${missing.join(', ')}, and there is no such part`);
            }
            if (Math.max(...seen.atlas) > SIZE.atlasMax) say(`its model${which} needs a texture of ${seen.atlas.join(' x ')}`);
            // What walks stands on the ground: its feet are at y = 0. (What hovers has its tail where it likes.)
            if (game.mobMovementIs(movement, 'walksToGoal') && !info.flyHeight && Math.abs(seen.bottom) > SIZE.feet) say(`its model${which} has its feet at y = ${seen.bottom}, and the ground is at 0`);
        }
        if (model.built && model.variants.every((seen) => !seen.error)) {
            const radius = Number(model.body.radius.toFixed(2));
            const height = Number(model.body.height.toFixed(2));
            if (!(radius > 0 && radius <= SIZE.reachMax)) say(`it reaches ${radius} blocks from its middle: no more than ${SIZE.reachMax}`);
            if (!(height >= SIZE.heightMin && height <= SIZE.heightMax)) say(`it is ${height} blocks tall: from ${SIZE.heightMin} to ${SIZE.heightMax}`);
        }

        // Its body as an animal the server keeps, which is what a revived one is.
        if (behaviour && typeof behaviour.spawnKept !== 'function') say(`its movement, ${movement}, has a behaviour with no spawnKept: a revived one would have no body`);
        else if (!behaviour && game.mobMovementIs(movement, 'bodiless')) say(`its movement, ${movement}, is not a body on the ground: a revived one would have no body`);
        else if (!game.Game.prototype.animalsCanKeep.call({}, id, false)) say('the server could not keep one (animalsCanKeep, js/game/animals.js)');
        if (game.mobMovementIs(movement, 'walksToGoal') && !(info.speed > 0)) say('it walks where the server sends it and has no speed');

        // Nothing spawns it.
        const source = guide.source(id);
        if (!source) say("its file was not found: registerSpecies('<id>', { at the start of a line, in a file of js/game");
        else if (/\bspawnForChunk\b|\bmobMarkNatural\(|\bchunkRandom\(|\bspawnBiomes\b/.test(source)) say('its file spawns something by itself');
        if (info.spawnBiomes) say('it has spawnBiomes');

        // Its row for the traps.
        const trap = game.TRAPS_SPECIES[id];
        if (!trap || !Array.isArray(trap.baits)) say('it has no trap row: at least trap: { baits: [] }');

        // A mount says how it is ridden: with its own numbers, on its own back, by whoever tamed it.
        if (info.mount !== undefined) {
            const mount = info.mount || {};
            const lacking = MOUNT.filter((field) => !(Number.isFinite(mount[field]) && mount[field] > 0));
            if (lacking.length) say(`its mount does not say ${lacking.join(', ')}`);
            else {
                if (model.body && mount.seat > model.body.height) say(`its rider would sit ${mount.seat} blocks up, over an animal ${Number(model.body.height.toFixed(2))} tall`);
                if (mount.eyeHeight <= mount.seat) say('its rider would look out from under the seat');
            }
            if (Object.entries(game.MOB_SPECIES).some(([other, theirs]) => other !== id && theirs.mount === info.mount)) say('its mount is that of another species: it says its own');
            if (!game.TAMING_DIET[id] || !game.Game.prototype.tamingCanTame.call({}, id)) say('it has a mount and cannot be tamed: only its owner rides an animal the server keeps');
            for (const lang of LANGS) {
                const page = pageOf(guide, game, id, lang);
                if (page && !page.text.includes(`](${RIDING_PAGE})`)) say(`its ${lang} page does not say how it is ridden: a link to page ${RIDING_PAGE}`);
            }
        }

        // Its two pages of the guide.
        for (const lang of LANGS) {
            const page = pageOf(guide, game, id, lang);
            if (!page) { say(`it has no ${lang} page under the id the catalogue of the README gives it`); continue; }
            if (!new RegExp(`^!\\[[^\\]]+\\]\\(mob:${id}\\)$`, 'm').test(page.text)) say(`its ${lang} page (${page.id}) does not show its portrait: ![name](mob:${id}) on a line of its own`);
            for (const block of fossil ? game.fossilBlocksOf(id) : []) {
                if (!page.text.includes(`\`${block}\``) && !page.text.includes(`(item:${block})`)) say(`its ${lang} page (${page.id}) does not name the block its fossil is in: \`${block}\``);
            }
            const found = fossil && fossil.source === 'amber' ? AMBER_PAGE : FOSSILS_PAGE;
            if (!page.text.includes(`](${found})`)) say(`its ${lang} page (${page.id}) does not link the page that says where its fossil is found (${found})`);
            if (guide.file(MACHINE_PAGE, lang) && !page.text.includes(`](${MACHINE_PAGE})`)) say(`its ${lang} page (${page.id}) does not link the revival machine (${MACHINE_PAGE})`);
        }
    }
    // And nothing alive has a fossil.
    for (const id of Object.keys(game.FOSSIL_SPECIES)) {
        const info = game.MOB_SPECIES[id];
        if (!info || !info.hiddenUntilDiscovered) problems.push(`${id}: it has a fossil and is no extinct animal (hiddenUntilDiscovered: true)`);
    }
    return problems;
}

// The page of a species in a language: the one whose row of the README's catalogue has the names of its two
// cards for titles, in a file called after it. Null where the row, or the file, is missing.
function pageOf(guide, game, id, lang) {
    const cards = vm.runInContext('({ en: BESTIARY_ENTRIES, es: BESTIARY_ENTRIES_ES })', game);
    const en = cards.en[id] && cards.en[id].name;
    const es = cards.es[id] && cards.es[id].name;
    if (!en || !es) return null;
    const rows = [...guide.readme.matchAll(new RegExp(`^\\| (\\d+) \\| ${escaped(es)} \\| ${escaped(en)} \\|`, 'gm'))];
    if (rows.length !== 1) return null;
    const page = rows[0][1];
    const title = lang === 'ES' ? es : en;
    if (guide.file(page, lang) !== `${page}_${lang}_${title.replace(/ /g, '_')}.md`.normalize('NFC')) return null;
    return { id: page, text: guide.page(page, lang) };
}

// ---- The animals there are ----

const real = loadGame();
const extinctIds = Object.keys(real.MOB_SPECIES).filter((id) => real.MOB_SPECIES[id].hiddenUntilDiscovered);

test('the extinct animals of the game are found, each from the file that registers it', () => {
    // Read from the files, as text: a species the game does not load would be in neither list of the other tests.
    const written = [];
    for (const name of gameFiles) {
        const text = fs.readFileSync(path.join(JS, 'game', name), 'utf8');
        for (const match of text.matchAll(/^registerSpecies\('([a-z_]+)',\s*\{\s*info:\s*\{([\s\S]*?)\},\n/gm)) {
            if (/\bhiddenUntilDiscovered:\s*true\b/.test(match[2])) written.push(match[1]);
        }
    }
    assert.deepEqual([...extinctIds].sort(), written.sort());
    for (const id of extinctIds) assert.match(id, /^[a-z][a-z0-9_]*$/, id);
});

test('every extinct animal has its fossil, a model that stands in the world, a body the server can keep, and its pages', () => {
    assert.deepEqual(extinctProblems(real, extinctIds, realGuide), []);
});

test('what is measured of a model is what the game would build: the pig and the horse, read the same way', () => {
    // The probe against two models everybody knows, so that a rule about sizes means what it says.
    const pig = JSON.parse(real.probeModel('pig'));
    assert.equal(pig.variants.length, 1);
    assert.deepEqual(plain({ ...pig.variants[0], atlas: null }), { variant: 0, parts: 10, twice: [], orphans: [], unpainted: [], rig: { legs: [], head: [], tail: [] }, bottom: 1, atlas: null, error: null });
    assert.ok(pig.variants[0].bottom <= SIZE.feet, 'the feet of the pig are a sixteenth of a block over the ground: that much is let through');
    // Up to the tips of its ears, and from its middle to the end of its snout.
    assert.deepEqual(pig.body, { radius: 13.5 / 16, height: 1 });
    const horse = JSON.parse(real.probeModel('horse'));
    assert.equal(horse.variants.length, 4);
    assert.ok(horse.body.height > 1.4 && horse.body.height < 2.2 && horse.body.radius > 0.5 && horse.body.radius < 1.2, JSON.stringify(horse.body));
    assert.deepEqual(JSON.parse(real.probeModel('no_such_species')), { built: false, variants: [], body: null });
});

// ---- The rules bite ----

// One made-up animal with everything right, and then the same with one thing wrong each time. Their models
// and their movements are registered in a game of their own; their pages and their files are made up here.
const MADE_UP = `
    function madeUpModel(b) {
        b.part('body', { pivot: [0, 0, 0], from: [-3, 6, -6], size: [6, 6, 12], paint: { color: 0x8a6a4a } });
        b.part('head', { parent: 'body', pivot: [0, 10, 6], from: [-2, -2, 0], size: [4, 4, 4], paint: { color: 0x8a6a4a, faces: { front: (p) => VoxelModels.eyes(p, 1, 0.5) } } });
        const legs = VoxelModels.quadLegs(b, { color: 0x5a4a3a, size: [2, 6, 2], hipY: 6, x: 2, zFront: 4, zBack: -4 });
        return { legs, head: 'head' };
    }
    // (id, the fields it says otherwise, those of its info, the fields it leaves out)
    const madeUp = (id, change = {}, info = {}, without = []) => {
        const species = {
            info: { eggColor: 0x8a6a4a, speed: 0.4, maxHealth: 12, hiddenUntilDiscovered: true, ...info },
            model: madeUpModel, surface: 'fur', trap: { baits: [] }, fossil: { source: 'rock', rarity: 'rare' },
            card: { name: 'Made ' + id.slice(8), habitat: 'Nowhere, 5 million years ago', activity: 'Day', temperament: 'Passive', description: 'It never was.' },
            cardEs: { name: 'Hecho ' + id.slice(8), habitat: 'En ninguna parte, hace 5 millones de años', description: 'Nunca existió.' },
            ...change
        };
        for (const field of without) delete species[field];
        registerSpecies(id, species);
    };
    madeUp('made_up_good');
    madeUp('made_up_amber', { fossil: { source: 'amber', rarity: 'rare' } });
    madeUp('made_up_bones', { fossil: { source: 'skeleton', rarity: 'legendary' } });
    madeUp('made_up_fossilless', {}, {}, ['fossil']);
    registerSpecies('made_up_alive', { info: { eggColor: 0x8a6a4a, speed: 0.4 }, model: madeUpModel, fossil: { source: 'rock', rarity: 'common' } });
    madeUp('made_up_pig', {}, {}, ['model']);
    madeUp('made_up_drawn', { model: (b) => { madeUpModel(b); new Image().decode(); } });
    madeUp('made_up_smudge', { model: (b) => { madeUpModel(b); b.part('spot', { parent: 'body', pivot: [0, 12, 0], size: [2, 1, 2], paint: { color: 0x111111, all: (p) => p.blotch(1) } }); } });
    madeUp('made_up_stump', { model: (b) => { b.part('body', { pivot: [0, 0, 0], from: [-3, 0, -3], size: [6, 6, 6], paint: { color: 0x8a6a4a } }); return {}; } });
    madeUp('made_up_twice', { model: (b) => { const rig = madeUpModel(b); b.part('head', { parent: 'body', pivot: [0, 12, 0], size: [2, 2, 2], paint: { color: 0x8a6a4a } }); return rig; } });
    madeUp('made_up_orphan', { model: (b) => { b.part('horn', { parent: 'head', pivot: [0, 2, 2], size: [1, 3, 1], paint: { color: 0xffffff } }); return madeUpModel(b); } });
    madeUp('made_up_magenta', { model: (b) => { const rig = madeUpModel(b); b.part('horn', { parent: 'head', pivot: [0, 2, 2], size: [1, 3, 1] }); return rig; } });
    madeUp('made_up_rig', { model: (b) => { madeUpModel(b); return { legs: ['legFL', 'legFR', 'legBL', 'legBR'], head: 'neck', tail: ['tail', 'tailTip'], fins: ['body'] }; } }, { variants: 2 });
    madeUp('made_up_giant', { model: (b) => { const rig = madeUpModel(b); b.part('neck', { parent: 'body', pivot: [0, 12, 0], size: [40, 3200, 40], paint: { color: 0x8a6a4a } }); return rig; } });
    madeUp('made_up_floating', { model: (b) => { b.part('cloud', { pivot: [0, 30, 0], size: [1, 1, 1], paint: { color: 0xffffff } }); b.part('body', { parent: 'cloud', pivot: [0, 0, 0], from: [-3, 6, -6], size: [6, 6, 12], paint: { color: 0x8a6a4a } }); b.part('head', { parent: 'body', pivot: [0, 10, 6], size: [4, 4, 4], paint: { color: 0x8a6a4a } }); VoxelModels.quadLegs(b, { color: 0x5a4a3a, size: [2, 6, 2], hipY: 6, x: 2, zFront: 4, zBack: -4 }); return {}; } });
    madeUp('made_up_hoverer', { model: (b) => { const rig = madeUpModel(b); b.part('tail', { parent: 'body', pivot: [0, 8, -6], from: [-1, -12, -1], size: [2, 12, 2], paint: { color: 0x5a4a3a } }); return { ...rig, tail: ['tail'] }; } }, { flyHeight: 2 });
    madeUp('made_up_sprawler', { model: (b) => {
        b.part('body', { pivot: [0, 0, 0], from: [-3, 4, -4], size: [6, 3, 8], paint: { color: 0x3a2a1a } });
        b.part('head', { parent: 'body', pivot: [0, 5, 4], from: [-1.5, -1, 0], size: [3, 2, 2], paint: { color: 0x3a2a1a } });
        // Legs made lying along x and turned down, as a spider's: where they are made says nothing of where they end.
        const legs = [[1, 2], [1, -2], [-1, 2], [-1, -2]].map(([side, z], i) => {
            b.part('leg' + i, { parent: 'body', pivot: [3 * side, 5, z], from: [side > 0 ? 0 : -6, -0.5, -0.5], size: [6, 1, 1], paint: { color: 0x2a1a0a }, rotation: [0, 0, -0.95 * side] });
            return 'leg' + i;
        });
        return { legs, head: 'head', legAxis: 'y' };
    } });
    madeUp('made_up_swimmer', {}, { movement: 'swim' });
    registerMobBehaviour('made_up_glide', { update() {} });
    madeUp('made_up_glider', {}, { movement: 'made_up_glide' });
    registerMobBehaviour('made_up_paddle', { walksToGoal: true, update(mob, delta) { this.getMobGoal(mob, delta); }, spawnKept() { return null; } });
    madeUp('made_up_paddler', {}, { movement: 'made_up_paddle' });
    madeUp('made_up_still', {}, { speed: 0 });
    madeUp('made_up_wild', {});
    madeUp('made_up_trapless', {}, {}, ['trap']);
    madeUp('made_up_steed', { diet: { foods: ['wheat'], chance: 1 / 3 } }, { mount: { eyeHeight: 1.6, seat: 0.7, speed: 6, autoJump: 7, jump: 9 } });
    madeUp('made_up_nag', {}, { mount: MOB_SPECIES.horse.mount });
    madeUp('made_up_perch', { diet: { foods: ['wheat'], chance: 1 / 3 } }, { mount: { eyeHeight: 1.2, seat: 2.5, speed: 6, jump: 9 } });
    madeUp('made_up_tower', { diet: { foods: ['wheat'], chance: 1 / 3 } }, { mount: { eyeHeight: 2, seat: 2.5, speed: 6, autoJump: 7, jump: 9 } });
    madeUp('made_up_pageless');
    madeUp('made_up_faceless');
    madeUp('made_up_blockless');
    madeUp('made_up_lost');
    madeUp('made_up_machineless');
    madeUp('made_up_misfiled');
    madeUp('made_up_fileless');
`;

test('the rules bite: a made-up animal with everything right, and then with one thing wrong at a time', () => {
    const game = loadGame(MADE_UP);
    const ids = Object.keys(game.MOB_SPECIES).filter((id) => id.startsWith('made_up_') && game.MOB_SPECIES[id].hiddenUntilDiscovered);
    assert.equal(ids.length, 33);
    // Their pages, from 9001 on, in the order of `ids`: right for every one, and then spoilt for a few.
    const number = (id) => 9001 + ids.indexOf(id);
    const names = (id) => ({ ES: `Hecho ${id.slice(8)}`, EN: `Made ${id.slice(8)}` });
    const pages = {};
    const sources = {};
    let readme = '| Id | ES | EN | Items / topic |\n|---|---|---|---|\n';
    for (const id of ids) {
        const source = game.FOSSIL_SPECIES[id] ? game.FOSSIL_SPECIES[id].source : 'rock';
        const blocks = game.fossilBlocksOf(id).map((block, i) => (i % 2 ? `![](item:${block})` : `\`${block}\``)).join(', ');
        for (const lang of LANGS) {
            pages[`${number(id)} ${lang}`] = `# ${names(id)[lang]}\n\n![${names(id)[lang]}](mob:${id})\n\nIn ${blocks}: see [the page](${source === 'amber' ? AMBER_PAGE : FOSSILS_PAGE}) and [the machine](${MACHINE_PAGE}).\n` +
                (game.MOB_SPECIES[id].mount ? `It is ridden as [a horse](${RIDING_PAGE}).\n` : '');
        }
        readme += `| ${number(id)} | ${names(id).ES} | ${names(id).EN} | made up |\n`;
        sources[id] = `registerSpecies('${id}', {\n    info: { hiddenUntilDiscovered: true },\n});\n`;
    }
    const spoil = (id, lang, rewrite) => { pages[`${number(id)} ${lang}`] = rewrite(pages[`${number(id)} ${lang}`]); };
    readme = readme.replace(`| ${number('made_up_pageless')} | Hecho pageless | Made pageless | made up |\n`, '');
    delete pages[`${number('made_up_misfiled')} EN`];
    spoil('made_up_faceless', 'ES', (text) => text.replace('![Hecho faceless](mob:made_up_faceless)', 'Un retrato: ![](mob:made_up_faceless).'));
    spoil('made_up_blockless', 'EN', (text) => text.replace('`fossil_rock_rare`', 'the rare fossil rock'));
    spoil('made_up_bones', 'ES', (text) => text.replace('![](item:fossil_bones_spine)', 'la columna'));
    spoil('made_up_lost', 'EN', (text) => text.replace(`](${FOSSILS_PAGE})`, `](${AMBER_PAGE})`));
    spoil('made_up_amber', 'ES', (text) => text.replace(`](${AMBER_PAGE})`, `](${FOSSILS_PAGE})`));
    spoil('made_up_machineless', 'ES', (text) => text.replace(`[the machine](${MACHINE_PAGE})`, 'the machine'));
    spoil('made_up_steed', 'EN', (text) => text.replace(`](${RIDING_PAGE})`, ']'));
    sources.made_up_wild += 'this.mobMarkNatural(mob, chunkX, chunkZ);\n';
    delete sources.made_up_fileless;
    const guide = {
        readme,
        file: (id, lang) => {
            if (Number(id) === MACHINE_PAGE) return `${MACHINE_PAGE}_${lang}_Machine.md`;
            const owner = ids.find((species) => number(species) === Number(id));
            return owner && pages[`${id} ${lang}`] ? `${id}_${lang}_${names(owner)[lang].replace(/ /g, '_')}.md` : null;
        },
        page: (id, lang) => pages[`${id} ${lang}`] ?? null,
        source: (id) => sources[id] ?? null
    };
    const found = extinctProblems(game, ids, guide);
    const of = (id) => found.filter((line) => line.startsWith(`${id}: `)).map((line) => line.slice(id.length + 2));
    const expected = {
        made_up_good: [],
        made_up_fileless: ["its file was not found: registerSpecies('<id>', { at the start of a line, in a file of js/game"],
        made_up_amber: [`its ES page (${number('made_up_amber')}) does not link the page that says where its fossil is found (${AMBER_PAGE})`],
        made_up_bones: [`its ES page (${number('made_up_bones')}) does not name the block its fossil is in: \`fossil_bones_spine\``],
        made_up_fossilless: ['it has no fossil: nobody could find it and bring it back (fossil: { source, rarity } in registerSpecies)'],
        made_up_pig: ['it has no model: it would be drawn as a pig'],
        made_up_drawn: ['its model is not built without a browser: Image is not defined'],
        made_up_smudge: ['its model is not built without a browser: p.blotch is not a function'],
        made_up_stump: ['its model has 1 parts: from 5 to 160'],
        made_up_twice: ['its model has two parts called head: the second takes the place of the first'],
        made_up_orphan: ['in its model horn hangs from head, which is not made before it'],
        made_up_magenta: ['the part horn of its model has no colour: it would be magenta'],
        made_up_rig: [0, 1].flatMap((variant) => [`its rig (variant ${variant}) names head: neck, and there is no such part`, `its rig (variant ${variant}) names tail: tail, tailTip, and there is no such part`,
            `its rig (variant ${variant}) says fins, which nothing moves: legs, arms, wings, tail, head`]),
        made_up_giant: ['its model needs a texture of 2048 x 8192', 'it is 200.75 blocks tall: from 0.04 to 12'],
        made_up_floating: ['its model has its feet at y = 30, and the ground is at 0'],
        // Its tail hangs under its feet, and it hovers; its legs are made flat and turned down to the ground.
        made_up_hoverer: [],
        made_up_sprawler: [],
        made_up_swimmer: ['its movement, swim, is not a body on the ground: a revived one would have no body'],
        made_up_glider: ['its movement, made_up_glide, has a behaviour with no spawnKept: a revived one would have no body'],
        made_up_paddler: [],
        made_up_still: ['it walks where the server sends it and has no speed'],
        made_up_wild: ['its file spawns something by itself'],
        made_up_trapless: ['it has no trap row: at least trap: { baits: [] }'],
        made_up_steed: [`its EN page does not say how it is ridden: a link to page ${RIDING_PAGE}`],
        made_up_nag: ['its mount is that of another species: it says its own', 'it has a mount and cannot be tamed: only its owner rides an animal the server keeps'],
        made_up_perch: ['its mount does not say autoJump'],
        made_up_tower: ['its rider would sit 2.5 blocks up, over an animal 0.75 tall', 'its rider would look out from under the seat'],
        made_up_pageless: ['it has no ES page under the id the catalogue of the README gives it', 'it has no EN page under the id the catalogue of the README gives it'],
        made_up_misfiled: ['it has no EN page under the id the catalogue of the README gives it'],
        made_up_faceless: [`its ES page (${number('made_up_faceless')}) does not show its portrait: ![name](mob:made_up_faceless) on a line of its own`],
        made_up_blockless: [`its EN page (${number('made_up_blockless')}) does not name the block its fossil is in: \`fossil_rock_rare\``],
        made_up_lost: [`its EN page (${number('made_up_lost')}) does not link the page that says where its fossil is found (${FOSSILS_PAGE})`],
        made_up_machineless: [`its ES page (${number('made_up_machineless')}) does not link the revival machine (${MACHINE_PAGE})`]
    };
    for (const id of ids) assert.deepEqual(of(id), expected[id] ?? [], id);
    assert.deepEqual(found.filter((line) => !ids.some((id) => line.startsWith(`${id}: `))), ['made_up_alive: it has a fossil and is no extinct animal (hiddenUntilDiscovered: true)']);

    // Until the page of the machine is written, no page has to link it; and the real animals pass in this game too.
    const before = { ...guide, file: (id, lang) => (Number(id) === MACHINE_PAGE ? null : guide.file(id, lang)) };
    assert.deepEqual(extinctProblems(game, ['made_up_machineless', 'made_up_paddler'], before).filter((line) => !line.startsWith('made_up_alive')), []);
    assert.deepEqual(extinctProblems(game, extinctIds, realGuide).filter((line) => !line.startsWith('made_up_alive')), []);
});
