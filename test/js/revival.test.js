// Node tests for the revival machine (js/game/revival.js): its block, what its panel says in both languages,
// how its fossils move, and that the server's table of species (revivalSpecies in pkg/network/revival.go)
// says of every species with a fossil what its own file says. The species of the tests are made up: no
// species of the game has to have a fossil for any of this.
// Run with: node --test test/js/revival.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { ROOT, STATIC, JS, anyStub } = require('./support/game.js');
const print = require(path.join(JS, 'guidePrint.js'));
const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

const GO = read(ROOT, 'pkg', 'network', 'revival.go');
const GO_POWER = read(ROOT, 'pkg', 'network', 'power.go');

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

// Species that say a fossil, as a species' file does: one that walks, one that swims, a skeleton, and one
// with a movement of its own that walks to a goal.
const SPECIES = `
    registerSpecies('test_walker', { info: { eggColor: 0x555555, speed: 0.5, hiddenUntilDiscovered: true }, card: { name: 'Walker' }, cardEs: { name: 'Andador' }, fossil: { source: 'rock', rarity: 'rare' } });
    registerSpecies('test_swimmer', { info: { eggColor: 0x555555, speed: 0.7, movement: 'swim', hiddenUntilDiscovered: true }, fossil: { source: 'rock', rarity: 'common', water: 4 } });
    registerSpecies('test_giant', { info: { eggColor: 0x555555, speed: 0.3, hiddenUntilDiscovered: true }, fossil: { source: 'skeleton', rarity: 'legendary', seconds: 90 } });
    registerSpecies('test_hunter', { info: { eggColor: 0x555555, speed: 0.4, hostile: true, nocturnal: true, chaseDistance: 12, chaseSpeed: 1.5, attackDamage: 2, hiddenUntilDiscovered: true }, fossil: { source: 'rock', rarity: 'rare' } });
    registerMobBehaviour('test_scuttle', { walksToGoal: true, update() {} });
    registerSpecies('test_scuttler', { info: { eggColor: 0x555555, speed: 0.9, movement: 'test_scuttle', hiddenUntilDiscovered: true }, fossil: { source: 'amber', rarity: 'rare' } });
`;
// What the server's rows would have to say of them.
const ROWS = {
    test_walker: { Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.5, Chase: 0 },
    test_swimmer: { Pieces: 1, Water: 4, Seconds: 20, Radius: 0, Speed: 0.38, Chase: 0 },
    test_giant: { Pieces: 3, Water: 0, Seconds: 90, Radius: 8, Speed: 0.3, Chase: 0 },
    test_scuttler: { Pieces: 1, Water: 0, Seconds: 45, Radius: 12, Speed: 0.9, Chase: 0 },
    test_hunter: { Pieces: 1, Water: 0, Seconds: 45, Radius: 8, Speed: 0.4, Chase: 12, ChaseDay: 3.5, ChaseSpeed: 1.5 }
};

// Every script of index.html but the game's own class, as test/js/fossils.test.js loads them; `species` runs
// right after js/game/mobs.js, where a species' <script> goes.
function loadGame(species = '') {
    const THREE = new Proxy({ Vector3, Vector2: Vector3, Vector4: Vector3 }, { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const context = vm.createContext({
        console: { ...console, warn() {} }, performance: { now: () => 0 }, THREE, navigator: {}, requestAnimationFrame: () => 0, setTimeout: (run) => run(),
        Worker: class { postMessage() {} terminate() {} },
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; } },
        document: { createElement: (tag) => (tag === 'canvas' ? canvasStub() : anyStub()), addEventListener() {}, body: anyStub(), head: anyStub(), getElementById: () => null, querySelector: () => null },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
    });
    context.window = context;
    vm.runInContext('class Game {}', context);
    const html = read(STATIC, 'index.html');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]).filter((src) => !/^(https?:)?\/\//.test(src) && !print.SKIP_SCRIPTS.test(src));
    for (const src of scripts) {
        vm.runInContext(read(STATIC, src), context, { filename: src });
        if (src === 'js/game/mobs.js' && species) vm.runInContext(species, context, { filename: 'species of the tests' });
    }
    vm.runInContext(`Object.assign(this, { WorldRenderer, Game, MOB_SPECIES, ITEM_TYPES, BLOCK_TYPES, BLOCK_SHAPES, TEXTURE_PATTERNS, GAME_CONTENT_HOOKS, ITEM_USE_HANDLERS, MODAL_PANELS,
        NETWORK_HANDLERS, FOSSIL_SPECIES, FOSSIL_PIECES, STORAGE_KINDS, ELECTRIC_KINDS, REVIVAL_KIND, REVIVAL_PIECES, REVIVAL_TEXT, REVIVAL_GUIDE_PAGE, REVIVAL_HEAR_RANGE,
        REVIVAL_WITNESS_RANGE, fossilItemsOf, mobMovementIs, itemTagsOf, setGameLang, gameLang, revivalStatusLines, revivalProgress, revivalRefusalLine, revivalSpeciesOfItem,
        revivalIsComplete, revivalIsDone, revivalSay });`, context);
    return context;
}

// The game as it is, and the game with the species of the tests.
const real = loadGame();
const ctx = loadGame(SPECIES);
const world = new ctx.WorldRenderer({ add() {}, remove() {} });

// ---- The server's table ----

// The rows of revivalSpecies in revival.go: { species: { Pieces, Water, Seconds, Radius, Speed, Chase } }, and
// ChaseDay and ChaseSpeed in the rows of the hostile ones.
function serverRows() {
    const start = GO.indexOf('var revivalSpecies');
    const table = GO.slice(start, GO.indexOf('\n}\n', start));
    const rows = {};
    for (const [, id, fields] of table.matchAll(/^\t"(\w+)":\s*\{([^}]*)\},$/gm)) {
        assert.ok(!rows[id], `${id} is there twice`);
        rows[id] = Object.fromEntries([...fields.matchAll(/(\w+):\s*([\d.]+)/g)].map(([, key, value]) => [key, Number(value)]));
    }
    return rows;
}

// What the server's rows say otherwise than the species of a game that have a fossil: one line for each, that
// names the row and the field to change. (That no row is left over is asked of the real game below.)
function revivalMirrorProblems(rows, game) {
    const problems = [];
    for (const [species, fossil] of Object.entries(game.FOSSIL_SPECIES)) {
        const where = `pkg/network/revival.go, revivalSpecies["${species}"]`;
        const row = rows[species];
        if (!row) {
            problems.push(`${where}: there is no such row, and ${species} has a fossil`);
            continue;
        }
        const info = game.MOB_SPECIES[species];
        const pieces = game.fossilItemsOf(species).length;
        if (row.Pieces !== pieces) problems.push(`${where}: Pieces is ${row.Pieces}, and its fossil is ${pieces}`);
        if (row.Water !== fossil.water) problems.push(`${where}: Water is ${row.Water}, and its fossil says ${fossil.water}`);
        if (row.Seconds !== fossil.seconds) problems.push(`${where}: Seconds is ${row.Seconds}, and its fossil says ${fossil.seconds}`);
        // The server walks only what walks to a goal (pkg/network/animals.go), at the pace of its species.
        const walks = game.mobMovementIs(info.movement, 'walksToGoal');
        if (walks && !(row.Radius > 0)) problems.push(`${where}: Radius is 0, and its movement (${info.movement || 'ground'}) walks to a goal: say how far from its home it roams`);
        if (!walks && row.Radius !== 0) problems.push(`${where}: Radius is ${row.Radius}, and its movement (${info.movement}) does not walk to a goal: 0`);
        if (walks && row.Speed !== info.speed) problems.push(`${where}: Speed is ${row.Speed}, and its info.speed is ${info.speed}`);
        // A hostile one that the server walks goes after one player, the same for everybody: the server is
        // told from how far and how fast, as /animal tells it (animalsChaseOf, js/game/animals.js).
        const chase = game.animalsChaseOf(info);
        for (const [field, wanted] of [['Chase', chase.chase], ['ChaseDay', chase.chaseDay], ['ChaseSpeed', chase.chaseSpeed]]) {
            if ((row[field] || 0) !== wanted) problems.push(`${where}: ${field} is ${row[field] || 0}, and its species says ${wanted} (animalsChaseOf)`);
        }
    }
    return problems;
}

test('the server has a row for each of the 41 species of the plan, with every column', () => {
    const rows = serverRows();
    assert.equal(Object.keys(rows).length, 41);
    for (const [id, row] of Object.entries(rows)) {
        assert.deepEqual(Object.keys(row).filter((key) => key !== 'ChaseDay' && key !== 'ChaseSpeed'), ['Pieces', 'Water', 'Seconds', 'Radius', 'Speed', 'Chase'], id);
        assert.ok(row.Chase > 0 || (!row.ChaseDay && !row.ChaseSpeed), `${id}: only one that chases says from how far by day and how fast`);
        assert.ok(row.Pieces === 1 || row.Pieces === 3, id);
        assert.match(`fossil_${id}_skull`, /^[a-z0-9_]{1,64}$/, 'a chest takes its items');
    }
    // What the master table says of a few; how each walks and chases is its species' to say (the mirror below).
    const fossilOf = ({ Pieces, Water, Seconds }) => ({ Pieces, Water, Seconds });
    assert.deepEqual(fossilOf(rows.trilobite), { Pieces: 1, Water: 4, Seconds: 20 });
    assert.deepEqual(fossilOf(rows.plesiosaur), { Pieces: 3, Water: 120, Seconds: 120 });
    assert.deepEqual(fossilOf(rows.mammoth), { Pieces: 3, Water: 0, Seconds: 45 });
    assert.deepEqual(fossilOf(rows.megalodon), { Pieces: 3, Water: 300, Seconds: 120 });
    assert.deepEqual(Object.keys(rows).filter((id) => rows[id].Pieces === 3).sort(), ['diplodocus', 'mammoth', 'megalodon', 'plesiosaur', 'tyrannosaurus']);
    assert.deepEqual(Object.keys(rows).filter((id) => rows[id].Water > 0).sort(), ['ammonite', 'anomalocaris', 'archelon', 'dunkleosteus', 'megalodon', 'plesiosaur', 'trilobite']);
});

test('every species of the game with a fossil has its row on the server, and the row says what its file says', () => {
    assert.deepEqual(revivalMirrorProblems(serverRows(), real), []);
    // And the other way round, now that the 41 are all here: no row for an animal the game does not have.
    assert.deepEqual(Object.keys(serverRows()).sort(), Object.keys(plain(real.FOSSIL_SPECIES)).sort());
    // The pieces of a skeleton have one order everywhere: it is the order of the machine's slots.
    const pieces = [...GO.match(/var revivalPieces = \[3\]string\{(.+)\}/)[1].matchAll(/"(\w+)"/g)].map((match) => match[1]);
    assert.deepEqual(pieces, plain(real.FOSSIL_PIECES));
    assert.deepEqual(pieces, plain(real.REVIVAL_PIECES));
    for (const game of [real, ctx]) {
        for (const species of Object.keys(game.FOSSIL_SPECIES)) {
            const items = plain(game.fossilItemsOf(species));
            assert.deepEqual(items, items.length === 1 ? [`fossil_${species}`] : pieces.map((piece) => `fossil_${species}_${piece}`), 'as revivalFossil reads them in revival.go');
        }
    }
});

test('the check bites: species made up with their rows right, and then wrong one thing at a time', () => {
    assert.deepEqual(Object.keys(ctx.FOSSIL_SPECIES).filter((id) => id.startsWith('test_')).sort(), Object.keys(ROWS).sort());
    const rows = { ...serverRows(), ...ROWS };
    assert.deepEqual(revivalMirrorProblems(rows, ctx), []);
    const wrong = (species, change, said) => {
        const problems = revivalMirrorProblems({ ...rows, [species]: { ...ROWS[species], ...change } }, ctx);
        assert.equal(problems.length, 1, `${species} ${JSON.stringify(change)}: ${problems.join('; ')}`);
        assert.ok(problems[0].startsWith(`pkg/network/revival.go, revivalSpecies["${species}"]: `), problems[0]);
        assert.match(problems[0], said);
    };
    wrong('test_giant', { Pieces: 1 }, /Pieces is 1, and its fossil is 3/);
    wrong('test_walker', { Pieces: 3 }, /Pieces is 3, and its fossil is 1/);
    wrong('test_swimmer', { Water: 0 }, /Water is 0, and its fossil says 4/);
    wrong('test_walker', { Water: 9 }, /Water is 9, and its fossil says 0/);
    wrong('test_giant', { Seconds: 120 }, /Seconds is 120, and its fossil says 90/);
    wrong('test_walker', { Radius: 0 }, /Radius is 0, and its movement \(ground\) walks to a goal/);
    wrong('test_scuttler', { Radius: 0 }, /Radius is 0, and its movement \(test_scuttle\) walks to a goal/);
    wrong('test_swimmer', { Radius: 8 }, /Radius is 8, and its movement \(swim\) does not walk to a goal: 0/);
    wrong('test_walker', { Speed: 0.38 }, /Speed is 0.38, and its info.speed is 0.5/);
    wrong('test_hunter', { Chase: 0 }, /Chase is 0, and its species says 12/);
    wrong('test_hunter', { ChaseDay: 0 }, /ChaseDay is 0, and its species says 3.5/);
    wrong('test_hunter', { ChaseSpeed: 1 }, /ChaseSpeed is 1, and its species says 1.5/);
    wrong('test_walker', { Chase: 16 }, /Chase is 16, and its species says 0/);
    // What does not walk is not walked: its speed is nobody's business.
    assert.deepEqual(revivalMirrorProblems({ ...rows, test_swimmer: { ...ROWS.test_swimmer, Speed: 3 } }, ctx), []);
    const { test_giant: _gone, ...without } = rows;
    assert.deepEqual(revivalMirrorProblems(without, ctx), ['pkg/network/revival.go, revivalSpecies["test_giant"]: there is no such row, and test_giant has a fossil']);
});

// ---- The block ----

test('the machine is a block that keeps three fossils, runs on electricity and has the two names the server gives it', () => {
    const def = ctx.BLOCK_TYPES.revival_machine;
    assert.equal(ctx.REVIVAL_KIND, 'revival_machine');
    assert.match(GO, /revivalKind = "revival_machine"/);
    assert.match(GO, /return revivalKind \+ ":on"/);
    assert.equal(def.name, 'Revival Machine');
    assert.equal(def.storageSlots, 3);
    assert.equal(ctx.STORAGE_KINDS.revival_machine, 3);
    assert.equal(plain(ctx.REVIVAL_PIECES).length, 3);
    assert.ok(def.electric, 'wires join it');
    for (const name of ['revival_machine', 'revival_machine:on']) {
        assert.ok(world.registry.ids[name] > 0, `${name} is a block of the world`);
        assert.equal(world.blockTypes[name].storageSlots, 3, name);
        assert.ok(world.blockTypes[name].electric, name);
    }
    const on = world.blockTypes['revival_machine:on'];
    assert.equal(on.variantOf, 'revival_machine');
    assert.equal(on.dropType, 'revival_machine', 'broken at work it gives a machine');
    assert.ok(on.lightEmission > 0 && !world.blockTypes.revival_machine.lightEmission, 'it glows only while it works');
    assert.notEqual(world.getFaceTextureSpecs('revival_machine:on').side.pattern, world.getFaceTextureSpecs('revival_machine').side.pattern);
    // No state of it but those two: a name the server never writes would be a block nobody can have.
    assert.deepEqual(Object.keys(world.blockTypes).filter((name) => name.split(':')[0] === 'revival_machine').sort(), ['revival_machine', 'revival_machine:on']);
    for (const pattern of ['revival_machine_side', 'revival_machine_side_on', 'revival_machine_top', 'revival_machine_top_on']) assert.ok(ctx.TEXTURE_PATTERNS[pattern], pattern);

    // A consumer of 100 W that asks only while it works, with its top for the signal, on both sides.
    assert.deepEqual(plain(ctx.ELECTRIC_KINDS.revival_machine), { role: 'consumer', watts: 100, onDemand: true, signalTop: true });
    assert.match(GO_POWER, /"revival_machine": \{Role: powerConsumer, Watts: 100, OnDemand: true, SignalTop: true\}/);

    const game = new ctx.Game();
    game.world = world;
    assert.ok(game.toolFitsBlock('stone_pickaxe', 'revival_machine'));
    const tags = plain(ctx.itemTagsOf('revival_machine', world.blockTypes));
    for (const tag of ['electric', 'fossil', 'science']) assert.ok(tags.includes(tag), `${tag}: ${tags}`);
    for (const tag of ['storage', 'building', 'stone']) assert.ok(!tags.includes(tag), `not ${tag}: ${tags}`);
    assert.deepEqual(plain(ctx.itemTagsOf('revival_machine:on', world.blockTypes)), tags);
});

test('its faces are painted: a cap, a glass with something in it and a base, and another picture while it works', () => {
    const factory = world.textureFactory;
    const paint = (pattern, size = 16) => {
        const surface = factory.createSurface(size, false);
        factory.patterns()[pattern](surface, null, 1);
        return surface;
    };
    const pixel = (surface, x, y) => [0, 1, 2].map((channel) => surface.color[(y * surface.size + x) * 3 + channel]);
    const differ = (a, b) => {
        let count = 0;
        for (let i = 0; i < a.size * a.size; i++) {
            if (Math.abs(a.color[i * 3] - b.color[i * 3]) + Math.abs(a.color[i * 3 + 1] - b.color[i * 3 + 1]) + Math.abs(a.color[i * 3 + 2] - b.color[i * 3 + 2]) > 40) count++;
        }
        return count;
    };
    const side = paint('revival_machine_side');
    const sideOn = paint('revival_machine_side_on');
    for (const surface of [side, sideOn, paint('revival_machine_top'), paint('revival_machine_top_on'), paint('revival_machine_side', 64), paint('revival_machine_top_on', 128)]) {
        // A shade may go a little past white before it is written to the texture, which clamps it.
        for (const value of surface.color) assert.ok(Number.isFinite(value) && value >= 0 && value < 400, `every pixel is a colour: ${value}`);
    }
    // By height, as its boxes are: steel at the top and at the bottom, and the liquid between, which is green.
    const [capR, capG, capB] = pixel(side, 8, 0);
    assert.ok(Math.abs(capR - capG) < 30 && Math.abs(capG - capB) < 40, `the cap is steel: ${[capR, capG, capB]}`);
    const [liquidR, liquidG] = pixel(side, 4, 9);
    assert.ok(liquidG > liquidR + 40, `the liquid is green: ${pixel(side, 4, 9)}`);
    const [baseR, baseG, baseB] = pixel(side, 1, 15);
    assert.ok(Math.abs(baseR - baseG) < 30 && Math.abs(baseG - baseB) < 40, `the base is steel: ${[baseR, baseG, baseB]}`);
    // Something pale floats in it.
    let pale = 0;
    for (let y = 3; y < 12; y++) for (let x = 3; x < 13; x++) if (pixel(side, x, y).every((value) => value > 170)) pale++;
    assert.ok(pale >= 6, `${pale} pale pixels in the glass`);
    // At work the glass is another picture, and so is the socket on top; the cap and the base are the same.
    assert.ok(differ(side, sideOn) >= 60, `${differ(side, sideOn)} pixels of the side change`);
    assert.ok(differ(paint('revival_machine_top'), paint('revival_machine_top_on')) >= 8, 'the socket lights up');
    const [onR, onG] = pixel(sideOn, 4, 9);
    assert.ok(onG > liquidG + 30 && onG > onR, 'the liquid glows');
});

test('it is made of things the game has, and is in the inventory', () => {
    const items = [];
    const recipes = [];
    const hooks = { addItem: (type) => items.push(type), addRecipe: (id, name, output, amount, inputs) => recipes.push({ id, name, output, amount, inputs }) };
    // Each hook with a game that is anything at all: what matters here is what they add.
    for (const hook of ctx.GAME_CONTENT_HOOKS) {
        try {
            hook.call(anyStub(), hooks);
        } catch (_error) {
            // A hook that needs the whole game: not the machine's.
        }
    }
    assert.ok(items.includes('revival_machine'));
    const recipe = recipes.filter((entry) => entry.output === 'revival_machine');
    assert.equal(recipe.length, 1);
    assert.equal(recipe[0].amount, 1);
    assert.deepEqual(plain(recipe[0].inputs), [
        { type: 'iron_block', amount: 4 }, { type: 'glass', amount: 4 }, { type: 'copper_wire', amount: 6 }, { type: 'electric_motor', amount: 1 }, { type: 'water_bucket', amount: 1 }
    ]);
    for (const { type } of recipe[0].inputs) {
        assert.ok(world.blockTypes[type], `${type} exists`);
        assert.ok(type === 'water_bucket' || recipes.some((entry) => entry.output === type) || !world.blockTypes[type].itemOnly, `${type} can be had`);
    }
});

test('its panel opens before a chest would, and closes as a window of the game', () => {
    const source = (handler) => String(handler);
    const mine = ctx.ITEM_USE_HANDLERS.findIndex((handler) => source(handler).includes('revivalTryOpen'));
    const chest = ctx.ITEM_USE_HANDLERS.findIndex((handler) => source(handler).includes('storageTryOpen'));
    assert.ok(mine >= 0 && chest >= 0 && mine < chest, `${mine} before ${chest}`);
    assert.ok(ctx.MODAL_PANELS.some((panel) => source(panel.close).includes('revivalClose')));
    const heard = [...ctx.NETWORK_HANDLERS].filter(([, handler]) => source(handler).includes('revival')).map(([type]) => type);
    assert.deepEqual(heard.sort(), ['revivalDone', 'storageClosed', 'storageContents', 'storageResult']);
    // It has no message of its own to send: its fossils are a chest's.
    const sent = [...read(JS, 'game', 'revival.js').matchAll(/\.send\('(\w+)'/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(sent)].sort(), ['storageClose', 'storageOpen']);
    assert.match(GO, /createMessage\("revivalDone", made\)/);
});

// ---- The panel ----

const said = (view, name = '???') => plain(ctx.revivalStatusLines(view, name, 100)).map((line) => `${line.state}: ${line.text}`);
const inLang = (lang, run) => {
    const before = ctx.gameLang();
    ctx.setGameLang(lang);
    try {
        return run();
    } finally {
        ctx.setGameLang(before);
    }
};
const base = { signal: false, powered: false, done: 0, seconds: 0, crowdMax: 12, crowdRange: 32 };

test('the panel says what is missing in plain words, in both languages', () => {
    const cases = [
        ['an empty machine', { ...base },
            ['missing: Pon un fósil en la máquina', 'missing: Necesita una señal encima: pon una palanca sobre la máquina y actívala',
                'info: Gasta 100 W solo mientras trabaja. La corriente entra por los lados o por debajo: arriba va la señal'],
            ['missing: Put a fossil in the machine', 'missing: Needs a signal on top: put a lever on the machine and switch it on',
                'info: It draws 100 W only while it works. Power comes in through its sides or from below: the top is for the signal']],
        ['a skeleton with one piece', { ...base, species: 'test_giant', missing: ['spine', 'tail'], seconds: 90, signal: true },
            ['missing: Faltan la columna y la cola', 'ok: Señal encima: encendida', 'info: Gasta 100 W solo mientras trabaja. La corriente entra por los lados o por debajo: arriba va la señal'],
            ['missing: The spine and the tail are missing', 'ok: Signal on top: on', 'info: It draws 100 W only while it works. Power comes in through its sides or from below: the top is for the signal']],
        ['pieces of two animals', { ...base, mixed: true, signal: true },
            ['missing: Los fósiles son de animales distintos: deja solo los de uno', 'ok: Señal encima: encendida',
                'info: Gasta 100 W solo mientras trabaja. La corriente entra por los lados o por debajo: arriba va la señal'],
            ['missing: The fossils are of different animals: leave those of only one', 'ok: Signal on top: on',
                'info: It draws 100 W only while it works. Power comes in through its sides or from below: the top is for the signal']],
        ['a sea animal in a puddle, among too many', { ...base, species: 'test_swimmer', seconds: 20, water: 60, waterHas: 12, signal: true, crowded: true },
            ['ok: Fósiles completos: ???', 'ok: Señal encima: encendida', 'missing: Necesita agua: 12 de 60 bloques unidos, tocando la máquina',
                'missing: Hay demasiados animales cerca (12 o más a menos de 32 bloques): llévate alguno más lejos',
                'info: Gasta 100 W solo mientras trabaja. La corriente entra por los lados o por debajo: arriba va la señal', 'info: Tardará 20 s'],
            ['ok: Fossils complete: ???', 'ok: Signal on top: on', 'missing: Needs water: 12 of 60 joined blocks, touching the machine',
                'missing: Too many animals nearby (12 or more within 32 blocks): take some further away',
                'info: It draws 100 W only while it works. Power comes in through its sides or from below: the top is for the signal', 'info: It will take 20 s']],
        ['ready but for the signal', { ...base, species: 'test_swimmer', seconds: 20, water: 4, waterHas: 4 },
            ['ok: Fósiles completos: ???', 'missing: Necesita una señal encima: pon una palanca sobre la máquina y actívala', 'ok: Agua: 4 de 4 bloques',
                'info: Gasta 100 W solo mientras trabaja. La corriente entra por los lados o por debajo: arriba va la señal', 'info: Tardará 20 s'],
            ['ok: Fossils complete: ???', 'missing: Needs a signal on top: put a lever on the machine and switch it on', 'ok: Water: 4 of 4 blocks',
                'info: It draws 100 W only while it works. Power comes in through its sides or from below: the top is for the signal', 'info: It will take 20 s']],
        ['started, and the grid has not answered', { ...base, species: 'test_walker', seconds: 45, working: true, starting: true },
            ['ok: Fósiles completos: ???', 'info: Pidiendo 100 W a la red...', 'info: Reviviendo: 0 de 45 s'],
            ['ok: Fossils complete: ???', 'info: Asking the network for 100 W...', 'info: Reviving: 0 of 45 s']],
        ['working', { ...base, species: 'test_walker', seconds: 45, working: true, powered: true, done: 12 },
            ['ok: Fósiles completos: ???', 'ok: Con corriente: gasta 100 W', 'info: Reviviendo: 12 de 45 s'],
            ['ok: Fossils complete: ???', 'ok: Powered: drawing 100 W', 'info: Reviving: 12 of 45 s']],
        ['no power', { ...base, species: 'test_walker', seconds: 45, working: true, done: 12 },
            ['ok: Fósiles completos: ???', 'missing: Necesita corriente: 100 W, por un lado o por debajo. Espera, y conserva lo que lleva hecho', 'info: Reviviendo: 12 de 45 s'],
            ['ok: Fossils complete: ???', 'missing: Needs power: 100 W, through a side or from below. It waits, and keeps what it has done', 'info: Reviving: 12 of 45 s']],
        ['done, with nowhere to put it', { ...base, species: 'test_walker', seconds: 45, working: true, done: 45, noRoom: true },
            ['ok: Fósiles completos: ???', 'missing: No hay sitio para el animal: despeja un hueco junto a la máquina'],
            ['ok: Fossils complete: ???', 'missing: There is no room for the animal: clear a space next to the machine']],
        ['done, and its water has gone', { ...base, species: 'test_swimmer', seconds: 20, water: 4, waterHas: 1, working: true, done: 20 },
            ['ok: Fósiles completos: ???', 'missing: Necesita agua: 1 de 4 bloques unidos, tocando la máquina'],
            ['ok: Fossils complete: ???', 'missing: Needs water: 1 of 4 joined blocks, touching the machine']],
        ['done, in water with no room', { ...base, species: 'test_swimmer', seconds: 20, water: 4, waterHas: 4, working: true, done: 20, noRoom: true },
            ['ok: Fósiles completos: ???', 'missing: No hay sitio para el animal en el agua que toca la máquina'],
            ['ok: Fossils complete: ???', 'missing: There is no room for the animal in the water the machine touches']],
        ['done', { ...base, species: 'test_walker', seconds: 45, working: true, done: 45 },
            ['ok: Fósiles completos: ???', 'info: Listo: el animal está a punto de aparecer'],
            ['ok: Fossils complete: ???', 'info: Done: the animal is about to appear']]
    ];
    for (const [what, view, es, en] of cases) {
        assert.deepEqual(inLang('ES', () => said(view)), es, `${what}, in Spanish`);
        assert.deepEqual(inLang('EN', () => said(view)), en, `${what}, in English`);
    }
    // One piece missing, and a name once it is known.
    assert.deepEqual(inLang('ES', () => said({ ...base, species: 'test_giant', missing: ['skull'] }))[0], 'missing: Falta el cráneo');
    assert.deepEqual(inLang('EN', () => said({ ...base, species: 'test_giant', missing: ['skull'] }))[0], 'missing: The skull is missing');
    assert.deepEqual(inLang('EN', () => said({ ...base, species: 'test_giant', missing: ['skull', 'spine', 'tail'].slice(1) }))[0], 'missing: The spine and the tail are missing');
    assert.deepEqual(inLang('ES', () => said({ ...base, species: 'test_walker', seconds: 45 }, 'Andador'))[0], 'ok: Fósiles completos: Andador');
    assert.deepEqual(said(null), []);
    // Every line has both languages, and says something.
    for (const [key, line] of Object.entries(ctx.REVIVAL_TEXT)) {
        assert.deepEqual(Object.keys(line).sort(), ['EN', 'ES'], key);
        for (const lang of ['ES', 'EN']) assert.ok(line[lang] && (typeof line[lang] !== 'string' || line[lang].length > 2), `${key} ${lang}`);
    }
    // The bar.
    assert.equal(ctx.revivalProgress(null), 0);
    assert.equal(ctx.revivalProgress({ ...base, seconds: 45, done: 9 }), 0, 'not started');
    assert.equal(ctx.revivalProgress({ ...base, seconds: 45, done: 9, working: true }), 0.2);
    assert.equal(ctx.revivalProgress({ ...base, seconds: 45, done: 50, working: true }), 1);
    assert.equal(inLang('ES', () => ctx.revivalRefusalLine('not for the revival machine')), 'La máquina solo admite fósiles');
    assert.equal(inLang('EN', () => ctx.revivalRefusalLine('full')), 'That slot holds another fossil: take it out first');
    assert.match(GO, /return 0, "not for the revival machine", true/);
});

test('what the server tells a panel has the fields the panel reads', () => {
    const view = GO.slice(GO.indexOf('type revivalView struct'), GO.indexOf('\n}\n', GO.indexOf('type revivalView struct')));
    const fields = [...view.matchAll(/`json:"(\w+)(?:,omitempty)?"`/g)].map((match) => match[1]);
    assert.deepEqual(fields.sort(), ['crowdMax', 'crowdRange', 'crowded', 'done', 'missing', 'mixed', 'noRoom', 'powered', 'seconds', 'signal', 'species', 'starting', 'water', 'waterHas', 'working']);
    const source = read(JS, 'game', 'revival.js');
    for (const field of fields) assert.match(source, new RegExp(`view\\.${field}\\b`), `the panel never reads ${field}`);
    assert.match(read(ROOT, 'pkg', 'network', 'storage.go'), /Revival \*revivalView `json:"revival,omitempty"`/);
    assert.match(source, /this\.revivalContents\.revival/);
});

// A game with a machine at (2, 3, 4), a player next to it, and what it sends kept.
function makeGame(counts = {}) {
    const game = new ctx.Game();
    const sent = [];
    const told = [];
    const sounds = [];
    Object.assign(game, {
        world, inventory: Object.keys(counts), inventoryCounts: { ...counts }, storagePending: new Map(), revivalRequests: new Set(), revivalAt: { x: 2, y: 3, z: 4 }, revivalRev: -1,
        network: { connected: true, send: (type, payload) => sent.push({ type, payload }) },
        cameraController: { camera: { position: { x: 2.5, y: 5, z: 4.5 } } },
        updateHotbarCounts() {}, refreshHeldItemMesh() {}, renderCraftingPanel() {}, renderInventoryPanel() {}, saveInventoryState() {}, playPickupSound() {},
        revivalRender() { this.rendered = (this.rendered || 0) + 1; }, revivalRenderStatus() { this.statusDrawn = (this.statusDrawn || 0) + 1; },
        receiveSystemMessage: (message) => told.push(message.text), playTone: (tone) => sounds.push(tone.frequency), playNoiseBurst: () => sounds.push('crackle'),
        spawnMiningParticles: (type) => sounds.push(`sparks of ${type}`), breakParticleGeometry: {},
        bestiaryInstalled: true, bestiaryData: {}, bestiaryEncounter(species) { this.bestiaryData[species] = { encounters: 1 }; this.met = [...(this.met || []), species]; }
    });
    return { game, sent, told, sounds };
}

test('fossils go in one at a time and come out whole, as the items of a chest do', () => {
    const { game, sent } = makeGame({ fossil_test_walker: 2, stone: 5 });
    assert.equal(ctx.revivalSpeciesOfItem('fossil_test_walker', world.blockTypes), 'test_walker');
    assert.equal(ctx.revivalSpeciesOfItem('fossil_test_giant_spine', world.blockTypes), 'test_giant');
    for (const other of ['stone', 'amber', 'fossil_rock', 'no_such_item']) assert.equal(ctx.revivalSpeciesOfItem(other, world.blockTypes), null, other);

    game.revivalPut('stone');
    assert.equal(sent.length, 0, 'only fossils are offered to the machine');
    game.revivalPut('fossil_test_walker');
    assert.equal(sent.length, 1);
    const put = sent[0];
    assert.equal(put.type, 'storagePut');
    assert.deepEqual({ ...put.payload, reqId: null }, { x: 2, y: 3, z: 4, type: 'fossil_test_walker', amount: 1, reqId: null });
    assert.equal(game.getInventoryCount('fossil_test_walker'), 1, 'out of the inventory first');
    assert.deepEqual(plain(game.storagePending.get(put.payload.reqId)), { op: 'put', type: 'fossil_test_walker', amount: 1, at: 0 });

    // Refused: the fossil comes back, and the panel says why.
    inLang('EN', () => {
        game.storageOnResult({ reqId: put.payload.reqId, type: 'fossil_test_walker', amount: 0, reason: 'full' });
        game.revivalOnResult({ reqId: put.payload.reqId, type: 'fossil_test_walker', amount: 0, reason: 'full' });
    });
    assert.equal(game.getInventoryCount('fossil_test_walker'), 2);
    assert.equal(game.revivalNote, 'That slot holds another fossil: take it out first');
    // An answer to somebody else's request says nothing here.
    game.revivalNote = '';
    game.revivalOnResult({ reqId: 'another-request', amount: 0, reason: 'full' });
    assert.equal(game.revivalNote, '');

    // What a slot holds comes out, all of it.
    game.revivalOnContents({ x: 2, y: 3, z: 4, rev: 5, slots: [{ type: 'fossil_test_walker', count: 3 }, {}, {}], revival: { ...base, species: 'test_walker' } });
    game.revivalTake(0);
    const take = sent[1];
    assert.equal(take.type, 'storageTake');
    assert.deepEqual({ ...take.payload, reqId: null }, { x: 2, y: 3, z: 4, slot: 0, type: 'fossil_test_walker', amount: 3, reqId: null });
    game.storageOnResult({ reqId: take.payload.reqId, type: 'fossil_test_walker', amount: 3 });
    assert.equal(game.getInventoryCount('fossil_test_walker'), 5);
    game.revivalTake(1);
    assert.equal(sent.length, 2, 'an empty slot gives nothing');
});

test('the panel follows what the server says of its own machine, and redraws its cells only when the fossils change', () => {
    const { game } = makeGame();
    const contents = (rev, count, view = {}) => ({ x: 2, y: 3, z: 4, rev, slots: [{ type: 'fossil_test_walker', count }, {}, {}], revival: { ...base, species: 'test_walker', seconds: 45, ...view } });
    game.revivalOnContents(contents(3, 1));
    assert.deepEqual([game.rendered, game.statusDrawn], [1, undefined]);
    // The same fossils, a second more of work: only the lines and the bar.
    game.revivalOnContents(contents(4, 1, { working: true, done: 1 }));
    assert.deepEqual([game.rendered, game.statusDrawn], [1, 1]);
    assert.equal(game.revivalContents.revival.done, 1);
    game.revivalOnContents(contents(5, 2));
    assert.deepEqual([game.rendered, game.statusDrawn], [2, 1]);
    // Late news, another block's, or nobody's panel: nothing.
    game.revivalOnContents(contents(2, 9));
    game.revivalOnContents({ ...contents(9, 9), x: 7 });
    assert.equal(game.revivalContents.slots[0].count, 2);
    game.revivalAt = null;
    game.revivalOnContents(contents(10, 9));
    assert.equal(game.rendered, 2);
});

test('an animal is "???" until the player has seen one alive', () => {
    const { game } = makeGame();
    assert.equal(game.revivalNameOf('test_walker'), '???');
    assert.equal(game.revivalNameOf(''), '');
    // A species this game does not have (the server's table has rows ahead of it) is as much of a secret.
    assert.equal(game.revivalNameOf('no_such_species'), '???');
    game.bestiaryData.test_walker = { encounters: 1 };
    assert.equal(inLang('EN', () => game.revivalNameOf('test_walker')), 'Walker');
    assert.equal(inLang('ES', () => game.revivalNameOf('test_walker')), 'Andador');
    // With no card, its id in words.
    game.bestiaryData.test_giant = { encounters: 1 };
    assert.equal(game.revivalNameOf('test_giant'), 'Test giant');
    // A living animal is no secret.
    assert.equal(inLang('EN', () => game.revivalNameOf('sheep')), 'Sheep');
});

test('whoever stands by when an animal comes back has seen it, hears it and is told', () => {
    const made = { x: 2, y: 3, z: 4, species: 'test_walker', id: 7, at: [3.5, 3, 4.5] };
    const near = makeGame();
    inLang('EN', () => near.game.revivalOnDone(made));
    assert.deepEqual(near.game.met, ['test_walker'], 'its card is a secret no more');
    assert.deepEqual(near.told, ['The machine has brought an animal back to life: Walker!']);
    assert.deepEqual(near.sounds.filter((sound) => typeof sound === 'number'), [523, 659, 784, 1047]);
    assert.equal(near.sounds.filter((sound) => sound === 'sparks of revival_machine:on').length, 6);
    // The second one is no discovery: the bestiary counts it when it is seen, as any animal.
    inLang('EN', () => near.game.revivalOnDone(made));
    assert.deepEqual(near.game.met, ['test_walker']);

    // Further than a witness: the sound, and no more.
    const heard = makeGame();
    heard.game.cameraController.camera.position.x = 2.5 + ctx.REVIVAL_WITNESS_RANGE + 2;
    heard.game.revivalOnDone(made);
    assert.ok(heard.sounds.length > 0);
    assert.equal(heard.game.met, undefined);
    assert.deepEqual(heard.told, []);
    // Out of earshot (the server tells from further away than that), or nonsense: nothing.
    const far = makeGame();
    far.game.cameraController.camera.position.x = 2.5 + ctx.REVIVAL_HEAR_RANGE + 1;
    far.game.revivalOnDone(made);
    far.game.revivalOnDone(null);
    far.game.revivalOnDone({ x: 2, y: 3, z: 4 });
    assert.deepEqual([far.sounds.length, far.told.length, far.game.met], [0, 0, undefined]);
    const range = Number(GO.match(/revivalTellRange = ([\d.]+)/)[1]);
    assert.ok(range >= ctx.REVIVAL_HEAR_RANGE, 'the server tells everybody who could hear it');
    // A species this game does not have: no card to discover, and nothing breaks.
    const odd = makeGame();
    odd.game.revivalOnDone({ ...made, species: 'megalodon_of_later' });
    assert.equal(odd.game.met, undefined);
    assert.equal(odd.told.length, 1);
});

// ---- The guide ----

test('page 264 says of the machine what the code does, in both languages', () => {
    const guide = path.join(STATIC, 'guide');
    const page = (id, lang) => read(guide, fs.readdirSync(guide).find((name) => name.startsWith(`${id}_${lang}_`)));
    assert.equal(ctx.REVIVAL_GUIDE_PAGE, 264);
    const constant = (name) => Number(GO.match(new RegExp(`${name}\\s*= ([\\d.]+)`))[1]);
    const rows = serverRows();
    for (const lang of ['ES', 'EN']) {
        const text = page(264, lang);
        assert.equal(text.split('\n')[0], lang === 'ES' ? '# Máquina de revivir' : '# Revival machine');
        assert.ok(text.includes('`revival_machine`') && text.includes('(item:revival_machine)'));
        assert.ok(text.includes(`**${ctx.ELECTRIC_KINDS.revival_machine.watts} W**`), `${lang}: its watts`);
        assert.ok(text.includes('4 `iron_block` + 4 `glass` + 6 `copper_wire` + 1 `electric_motor` + 1 `water_bucket`'), `${lang}: its recipe`);
        // Enough is enough, and how far its water is looked at.
        assert.ok(text.includes(`**${constant('revivalCrowdMax')}**`) && text.includes(`**${constant('revivalCrowdRange')}**`), `${lang}: how many animals are too many`);
        assert.ok(text.includes(`**${constant('revivalWaterReach')}**`), `${lang}: how far the water counts`);
        // The times by rarity, and the water of each size of sea animal.
        for (const seconds of [20, 45, 120]) assert.ok(text.includes(`**${seconds} s**`), `${lang}: ${seconds} s`);
        for (const water of new Set(Object.values(rows).map((row) => row.Water).filter((water) => water > 0))) assert.ok(text.includes(`**${water}**`), `${lang}: ${water} blocks of water`);
        // Where it leads, and who leads to it.
        for (const to of [262, 263, 261, 207, 204]) assert.ok(text.includes(`](${to})`), `264 ${lang} links ${to}`);
        for (const from of [0, 48, 261, 262, 263, 204]) assert.ok(page(from, lang).includes('](264)'), `${from} ${lang} links 264`);
    }
    const guia = read(ROOT, 'GUIA.md');
    const section = guia.slice(guia.indexOf('\n## Máquina de revivir\n'), guia.indexOf('\n## Bloque luminoso\n'));
    assert.ok(section.length > 500, 'GUIA.md has its section');
    for (const word of ['revival_machine', '100 W', 'revivalDone', 'revivalSpecies', '264']) assert.ok(section.includes(word), `GUIA.md: ${word}`);
});
