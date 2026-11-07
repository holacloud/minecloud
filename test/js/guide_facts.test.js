// Node tests for what the guide says of the mobs, against the code that makes it true: how many there are,
// what the bestiary's panel says, who can be tamed, who really walks to a bait, where each one lives and what
// each one is called. A number or a list that drifts from the code fails here. Nothing here runs a browser.
// Run with: node --test test/js/guide_facts.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const JS = path.join(STATIC, 'js');
const GUIDE = path.join(STATIC, 'guide');
const read = (file) => fs.readFileSync(path.join(JS, file), 'utf8');
const guideFiles = fs.readdirSync(GUIDE);

function page(id, lang) {
    const file = guideFiles.find((name) => name.startsWith(`${id}_${lang}_`));
    return fs.readFileSync(path.join(GUIDE, file), 'utf8');
}

function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}

function loadGame() {
    const values = new Map();
    const context = vm.createContext({
        console, Math, performance: { now: () => 0 }, THREE: anyStub(), document: anyStub(), navigator: {},
        window: { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, addEventListener() {} },
        requestAnimationFrame: () => 1, cancelAnimationFrame() {}
    });
    vm.runInContext('class Game {}', context);
    for (const file of ['extensions.js', 'gameLang.js', 'chunkStore.js', 'blockShapes.js', 'mobSpecies.js']) vm.runInContext(read(file), context);
    for (const file of ['bestiary_text.js', 'bestiary.js', 'resources.js', 'taming.js', 'traps.js', 'furniture.js', 'storage.js', 'appliances.js', 'microbes.js', 'microscope_text.js']) {
        vm.runInContext(read(`game/${file}`), context, { filename: file });
    }
    vm.runInContext(`Object.assign(this, { MOB_SPECIES, BESTIARY_ENTRIES, BESTIARY_ENTRIES_ES, BESTIARY_TEXT, MICRO_SPECIES, MICRO_SPECIES_ES, MICROSCOPE_ITEMS_ES,
        TAMING_DIET, TAMING_GOAL_MOVEMENTS, TRAPS_SPECIES, TRAPS_NUDGE_MODES });`, context);
    return context;
}

const ctx = loadGame();
const mobIds = Object.keys(ctx.BESTIARY_ENTRIES);
const organismIds = Object.keys(ctx.MICRO_SPECIES);

// Each species a file of its own adds: the file that says so, and what it says.
const gameFiles = fs.readdirSync(path.join(JS, 'game')).filter((name) => name.endsWith('.js'));
const ownFile = {};
const ownDefinition = {};
for (const name of gameFiles) {
    for (const match of read(`game/${name}`).matchAll(/MOB_SPECIES\.([a-z_]+)\s*=\s*\{([\s\S]*?)\};/g)) {
        ownFile[match[1]] = name;
        ownDefinition[match[1]] = match[2];
    }
}

function info(id) {
    if (ctx.MOB_SPECIES[id]) return ctx.MOB_SPECIES[id];
    const body = ownDefinition[id];
    return { movement: (/movement:\s*'([a-z_]+)'/.exec(body) || [])[1], hostile: /hostile:\s*true/.test(body) };
}

const nameEs = (id) => ctx.BESTIARY_ENTRIES_ES[id].name;
const nameEn = (id) => ctx.BESTIARY_ENTRIES[id].name;
const sorted = (list) => [...list].sort();

// ---- How many ----

test('the catalogue is the size the guide says, on every page that counts it', () => {
    const mobs = mobIds.length;
    const organisms = organismIds.length;
    assert.equal(mobs, 35);
    assert.equal(organisms, 16);
    assert.ok(page(5, 'ES').includes(`**${mobs} animales y criaturas** y **${organisms} organismos microscópicos**, ${mobs + organisms} tarjetas`));
    assert.ok(page(5, 'EN').includes(`**${mobs} animals and creatures** and **${organisms} microscopic organisms**, ${mobs + organisms} cards`));
    assert.ok(page('B31X', 'ES').includes(`**${mobs} de ${mobs}.**`));
    assert.ok(page('B31X', 'EN').includes(`**${mobs} of ${mobs}.**`));
    assert.ok(page('B31X', 'ES').includes(`## Las ${mobs}, por orden`));
    assert.ok(page('B31X', 'EN').includes(`## The ${mobs}, in order`));
    assert.ok(page(74, 'ES').includes(`de las ${mobs}!`));
    assert.match(page(74, 'EN'), new RegExp(`the ${mobs}!`));
    assert.ok(page(106, 'ES').includes(`**${mobs} especies**`));
    assert.ok(page(106, 'EN').includes(`**${mobs} species**`));
    for (const lang of ['ES', 'EN']) {
        const rows = [...page('B31X', lang).matchAll(/^\| \d+ \| !\[[^\]]*\]\(mob:([a-z_]+)\)/gm)].map((match) => match[1]);
        assert.deepEqual(sorted(rows), sorted(mobIds), `B31X ${lang}`);
        const index = [...page(16, lang).matchAll(/^\| !\[\]\(mob:([a-z_]+)\) \|/gm)].map((match) => match[1]);
        assert.deepEqual(sorted(index), sorted(mobIds), `16 ${lang}`);
    }
});

test('the ways of moving of page 104 are the ones in the code', () => {
    const modes = new Set(['ground']);
    for (const id of mobIds) if (info(id).movement) modes.add(info(id).movement);
    assert.equal(modes.size, 24, [...modes].join());
    for (const lang of ['ES', 'EN']) {
        const text = page(104, lang);
        const section = text.slice(text.indexOf('|---|'), text.indexOf('\n\n', text.indexOf('|---|')));
        assert.equal(section.split('\n').length - 1, modes.size, `104 ${lang}`);
        assert.ok(text.includes(`**${modes.size}**`), `104 ${lang}`);
        assert.ok(page(106, lang).includes(`**${modes.size} `), `106 ${lang}`);
    }
});

// ---- The bestiary's page ----

test('page 5 quotes the panel in its own language, and not in the other', () => {
    const said = (lang) => {
        const text = ctx.BESTIARY_TEXT;
        return [text.pauseButton, text.close, text.factHabitat, text.factDiet, text.factDrops, text.factLures, text.factEncounters, text.factDefeated, text.factFirstSeen,
            text.factSize, text.factGroup, text.factIdentified, text.complete].map((line) => line[lang])
            .concat(text.newEntry[lang].trim(), text.discovered[lang](12, 51).replace(/<\/?b>/g, ''), text.seenFrom[lang](40));
    };
    for (const [lang, other] of [['ES', 'EN'], ['EN', 'ES']]) {
        const text = page(5, lang);
        for (const line of said(lang)) assert.ok(text.includes(line), `${lang} should say: ${line}`);
        for (const line of said(other)) {
            // Words spelled alike are not the other language.
            if (said(lang).includes(line)) continue;
            assert.ok(!new RegExp(`(^|[^\\p{L}])${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(text), `${lang} still says: ${line}`);
        }
    }
});

test('page 5 tells the notice of the complete notebook as the code does it', () => {
    const code = read('game/bestiary.js');
    // The notice and the code look at the mobs alone; the counter, at every card.
    assert.match(code, /!this\.bestiaryOrganism\(species\) && this\.bestiaryMobList\(\)\.every/);
    assert.match(code, /const complete = this\.bestiaryMobList\(\)\.every/);
    assert.match(code, /const list = this\.bestiarySpeciesList\(\);\s+const discovered = list\.filter/);
    assert.ok(page(5, 'ES').includes(ctx.BESTIARY_TEXT.discovered.ES(mobIds.length, mobIds.length + organismIds.length).replace(/<\/?b>/g, '')));
    assert.ok(page(5, 'EN').includes(ctx.BESTIARY_TEXT.discovered.EN(mobIds.length, mobIds.length + organismIds.length).replace(/<\/?b>/g, '')));
    for (const lang of ['ES', 'EN']) {
        assert.ok(page(5, lang).includes('(237)'), `${lang} links the small world`);
        assert.ok(page(5, lang).includes('(238)'), `${lang} links the microscope`);
        assert.ok(!page(5, lang).includes('B31X'), `${lang} gives the secret away`);
    }
});

// ---- Taming ----

const canTame = (id) => {
    const diet = ctx.TAMING_DIET[id];
    const { movement, hostile } = info(id);
    return Boolean(diet) && !hostile && (!movement || ctx.TAMING_GOAL_MOVEMENTS.includes(movement));
};

test('no behaviour opts in to taming: if one does, the guide has to say so', () => {
    for (const name of gameFiles) assert.doesNotMatch(read(`game/${name}`), /^\s*tameable:\s*true/m, name);
});

test('page 3 lists who can really be tamed, with their real foods and chances', () => {
    const tameable = mobIds.filter(canTame);
    assert.equal(tameable.length, 10, tameable.join());
    for (const [lang, name] of [['ES', nameEs], ['EN', nameEn]]) {
        const rows = [...page(3, lang).matchAll(/^\| ([^|`]+) \| (`[^|]+) \| (1\/\d) \|$/gm)];
        assert.deepEqual(sorted(rows.map((row) => row[1])), sorted(tameable.map(name)), `3 ${lang}`);
        for (const row of rows) {
            const id = tameable.find((candidate) => name(candidate) === row[1]);
            assert.deepEqual(row[2].match(/[a-z_]+/g), [...ctx.TAMING_DIET[id].foods], `${id} ${lang}`);
            assert.equal(1 / Number(row[3].slice(2)), ctx.TAMING_DIET[id].chance, `${id} ${lang}`);
        }
    }
});

test('page 3 says who has food written down but cannot be tamed; their cards no longer show it, so no warnings', () => {
    const untameable = mobIds.filter((id) => ctx.TAMING_DIET[id] && !canTame(id));
    assert.deepEqual(sorted(untameable), sorted(['crab', 'fox', 'mole', 'owl', 'rabbit']));
    for (const id of untameable) {
        assert.ok(page(3, 'ES').toLowerCase().includes(nameEs(id).toLowerCase()), `3 ES ${id}`);
        assert.ok(page(3, 'EN').toLowerCase().includes(nameEn(id).toLowerCase()), `3 EN ${id}`);
    }
    for (const lang of ['ES', 'EN']) {
        assert.doesNotMatch(page(3, lang), /Ojo con la Dieta|Careful with the Diet/, `3 ${lang}`);
        assert.doesNotMatch(page(5, lang), /también la enseñan|show one too/, `5 ${lang}`);
    }
    assert.doesNotMatch(read('../../../../GUIA.md'), /la enseñan/);
});

// ---- Baits ----

// Who walks to a bait: the ground mobs and the goat ask getMobGoal; hoppers, darters and amphibians get nudged
// (trapsUpdateLures); a behaviour of its own only comes if its update asks too. Bees and ants have their own way.
function walksToBait(id) {
    if (id === 'bee' || id === 'ant') return true;
    const { movement } = info(id);
    if (!movement || movement === 'climb' || ctx.TRAPS_NUDGE_MODES.includes(movement)) return true;
    return Boolean(ownFile[id]) && read(`game/${ownFile[id]}`).includes('getMobGoal(');
}

const drawnBy = (bait) => mobIds.filter((id) => ctx.TRAPS_SPECIES[id].baits.includes(bait) && walksToBait(id));
const BAITS = ['bait_seeds', 'bait_worms', 'bait_meat', 'bait_fish', 'bait_honey'];
const LISTED_ONLY = ['eagle', 'fish', 'fox', 'mole', 'owl', 'rabbit', 'snake', 'vulture'];

test('the species that have a bait written down but never walk to it are the ones the guide says', () => {
    assert.deepEqual(sorted(mobIds.filter((id) => ctx.TRAPS_SPECIES[id].baits.length && !walksToBait(id))), LISTED_ONLY);
});

test('pages 4, 93 and 96 list who really walks to each bait', () => {
    for (const lang of ['ES', 'EN']) {
        const name = lang === 'ES' ? nameEs : nameEn;
        const idOf = (word) => {
            const clean = word.trim().toLowerCase();
            const id = mobIds.find((candidate) => name(candidate).toLowerCase() === clean);
            assert.ok(id, `${lang}: who is "${word}"?`);
            return id;
        };
        const row = (text, bait) => new RegExp(`^\\| \`${bait}\` \\| (.*) \\|$`, 'm').exec(text);
        for (const bait of BAITS) {
            // Page 4: names in words; what is in brackets is a remark.
            const words = row(page(4, lang), bait)[1].replace(/\([^)]*\)/g, '').split(',');
            assert.deepEqual(sorted(words.map(idOf)), sorted(drawnBy(bait)), `4 ${lang} ${bait}`);
            // Page 93: with their pictures.
            const pictured = [...row(page(93, lang), bait)[1].matchAll(/\(mob:([a-z_]+)\)/g)].map((match) => match[1]);
            assert.deepEqual(sorted(pictured), sorted(drawnBy(bait)), `93 ${lang} ${bait}`);
            // Page 96: only those that also fit in a cage.
            const inCage = drawnBy(bait).filter((id) => ctx.TRAPS_SPECIES[id].cage);
            const cageRow = row(page(96, lang), bait);
            if (cageRow) assert.deepEqual(sorted(cageRow[1].split(',').map(idOf)), sorted(inCage), `96 ${lang} ${bait}`);
            else assert.deepEqual(inCage, [], `96 ${lang} ${bait}`);
        }
    }
});

test('pages 4, 93 and 96 name the ones that do not come, and page 4 and 96 who fits in a cage', () => {
    const fit = mobIds.filter((id) => ctx.TRAPS_SPECIES[id].cage);
    for (const lang of ['ES', 'EN']) {
        const name = lang === 'ES' ? nameEs : nameEn;
        for (const id of LISTED_ONLY) {
            if (id === 'fish') continue;
            assert.ok(page(4, lang).toLowerCase().includes(name(id).toLowerCase()), `4 ${lang} ${id}`);
            assert.ok(page(93, lang).toLowerCase().includes(name(id).toLowerCase()), `93 ${lang} ${id}`);
        }
        const whole = page(96, lang);
        const start = whole.indexOf(lang === 'ES' ? '## Quién cabe' : '## Who fits');
        const table = whole.slice(start, whole.indexOf('\n\n', whole.indexOf('|---|', start)));
        assert.deepEqual(sorted([...table.matchAll(/\(mob:([a-z_]+)\)/g)].map((match) => match[1])), sorted(fit), `96 ${lang}`);
        const line = /\*\*(?:Caben|Fit inside):\*\*([\s\S]*?)\./.exec(page(4, lang))[1].toLowerCase();
        for (const id of fit) assert.ok(line.includes(name(id).toLowerCase()), `4 ${lang} ${id}`);
    }
});

// ---- Where they live ----

// What the spawn code says, biome by biome: the tables of getBiomeSpawnTable, spawnBiomes and the spawners of their own.
function spawnBiomes() {
    const mobs = read('game/mobs.js');
    const body = mobs.slice(mobs.indexOf('getBiomeSpawnTable(biome) {'), mobs.indexOf('emitMobEvent(event'));
    const where = {};
    const add = (id, biome) => { (where[id] = where[id] || new Set()).add(biome); };
    for (const [biome, label] of [['desert', "case 'desert':"], ['forest', "case 'forest':"], ['rocky', "case 'rocky':"], ['plains', 'default:']]) {
        const line = body.slice(body.indexOf(label), body.indexOf('\n', body.indexOf(label)));
        const rows = [...line.matchAll(/\['([a-z_]+)', \d+\]/g)];
        assert.ok(rows.length >= 5, biome);
        for (const row of rows) add(row[1], biome);
    }
    for (const [id, definition] of Object.entries(ownDefinition)) {
        const table = /spawnBiomes:\s*\{([^}]*)\}/.exec(definition);
        if (table) for (const match of table[1].matchAll(/([a-z]+):/g)) add(id, match[1]);
    }
    // The spawners of their own, each with the line that makes it so.
    const own = {
        snake: ['snake.js', "if (biome !== 'desert' && biome !== 'rocky') return;", ['desert', 'rocky']],
        vulture: ['vulture.js', "if (biome !== 'desert' && biome !== 'rocky') return;", ['desert', 'rocky']],
        owl: ['owl.js', "if (biome !== 'forest' && biome !== 'plains') return;", ['forest', 'plains']],
        beaver: ['beaver.js', "if (biome !== 'forest' && biome !== 'plains') return;", ['forest', 'plains']],
        rabbit: ['rabbit.js', "const chance = biome === 'forest' ? 0.25 : biome === 'desert' ? 0.06 : 0.3;", ['forest', 'desert', 'plains']],
        ant: ['ants.js', '{ plains: 0.2, forest: 0.18, desert: 0.14 }', ['plains', 'forest', 'desert']]
    };
    for (const [id, [file, line, biomes]] of Object.entries(own)) {
        assert.ok(read(`game/${file}`).includes(line), `${file} changed: ${line}`);
        for (const biome of biomes) add(id, biome);
    }
    return where;
}

const BIOME_WORDS = {
    ES: { plains: /llanura|prado/i, forest: /bosque/i, rocky: /roca|montaña/i, desert: /desierto/i },
    EN: { plains: /plain|grassland/i, forest: /forest/i, rocky: /rock|mountain/i, desert: /desert/i }
};

test('every card names the biomes its spawn code uses, and no other', () => {
    const where = spawnBiomes();
    assert.ok(Object.keys(where).length >= 20);
    for (const [id, biomes] of Object.entries(where)) {
        for (const [lang, entry] of [['ES', ctx.BESTIARY_ENTRIES_ES[id]], ['EN', ctx.BESTIARY_ENTRIES[id]]]) {
            for (const [biome, words] of Object.entries(BIOME_WORDS[lang])) {
                assert.equal(words.test(entry.habitat), biomes.has(biome), `${id} ${lang}: "${entry.habitat}", spawn code says ${[...biomes].join()}`);
            }
        }
    }
});

test('no card sends you to a place the world does not have, and the wisp is anywhere', () => {
    for (const id of mobIds) {
        assert.doesNotMatch(ctx.BESTIARY_ENTRIES[id].habitat, /cave|savanna|wetland/i, id);
        assert.doesNotMatch(ctx.BESTIARY_ENTRIES_ES[id].habitat, /cueva|sabana|humedal/i, id);
    }
    assert.match(ctx.BESTIARY_ENTRIES.wisp.habitat, /^Anywhere/);
    assert.match(ctx.BESTIARY_ENTRIES_ES.wisp.habitat, /^Cualquier/);
    assert.match(read('game/wisp.js'), /if \(plain && Math\.random\(\) < 0\.4\) this\.wispSpawnAt/, 'it can appear with no water or drop near');
});

// ---- One name per thing ----

test('one name per thing in Spanish', () => {
    const spanish = guideFiles.filter((name) => name.includes('_ES_')).map((name) => fs.readFileSync(path.join(GUIDE, name), 'utf8')).join('\n');
    const code = read('game/bestiary_text.js') + read('game/microscope_text.js');
    for (const text of [spanish, code]) {
        assert.doesNotMatch(text, /gólem/i);
        assert.doesNotMatch(text, /bastoncillo/i);
        assert.doesNotMatch(text, /de la selva/i);
    }
    assert.equal(ctx.MICROSCOPE_ITEMS_ES.jungle_leaves, 'Hojas de jungla');
});

test('an index row of page 16 and the title of its page say the same, and the small world calls an organism what its card does', () => {
    for (const lang of ['ES', 'EN']) {
        for (const row of page(16, lang).matchAll(/^\| !\[\]\(mob:[a-z_]+\) \| \[([^\]]+)\]\((\d+)\)/gm)) {
            assert.equal(`# ${row[1]}`, page(row[2], lang).split('\n')[0], `${lang} ${row[1]}`);
        }
    }
    const table = [...page(237, 'ES').matchAll(/^\| !\[\]\(mob:([a-z_]+)\) \| ([^|]+) \|/gm)];
    assert.equal(table.length, organismIds.length);
    for (const row of table) assert.equal(row[2], ctx.MICRO_SPECIES_ES[row[1]].name, row[1]);
});

// ---- What recent work made false ----

test('nothing says the bestiary is English only, or that ores keep to a single depth', () => {
    assert.doesNotMatch(page(238, 'ES'), /bestiario aún está en inglés/);
    assert.doesNotMatch(page(237, 'ES'), /nombre en inglés/);
    assert.doesNotMatch(page(99, 'ES'), /hierro solo/);
    assert.doesNotMatch(page(99, 'EN'), /iron only/);
    assert.doesNotMatch(page(112, 'ES'), /se guarda en (tu|el) navegador/);
    assert.ok(page(238, 'ES').includes('1000×') && page(238, 'EN').includes('1000×'));
});
