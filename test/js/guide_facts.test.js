// Node tests for what the guide says of the mobs, against the code that makes it true: how many there are,
// what the bestiary's panel says, who can be tamed, who really walks to a bait, where each one lives and what
// each one is called. A number or a list that drifts from the code fails here. Nothing here runs a browser.
// Those numbers and lists are of the living species. An extinct animal (`hiddenUntilDiscovered`,
// js/mobSpecies.js) has its index in page 261 and rules of its own ("The extinct animals", below), checked for
// whichever there are: one more changes no page of the living, and no number here.
// Run with: node --test test/js/guide_facts.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { anyStub, loadSpeciesTables } = require('./support/game');

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

// The same, or null where there is no such page.
function pageIfAny(id, lang) {
    return guideFiles.some((name) => name.startsWith(`${id}_${lang}_`)) ? page(id, lang) : null;
}

function loadGame() {
    const values = new Map();
    const context = vm.createContext({
        console, Math, performance: { now: () => 0 }, THREE: anyStub(), document: anyStub(), navigator: {},
        window: { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, addEventListener() {} },
        requestAnimationFrame: () => 1, cancelAnimationFrame() {}
    });
    loadSpeciesTables(context, ['game/furniture.js', 'game/storage.js', 'game/appliances.js', 'game/microbes.js', 'game/microscope_text.js']);
    vm.runInContext(`Object.assign(this, { MOB_SPECIES, BESTIARY_ENTRIES, BESTIARY_ENTRIES_ES, BESTIARY_TEXT, MICRO_SPECIES, MICRO_SPECIES_ES, MICROSCOPE_ITEMS_ES,
        TAMING_DIET, TRAPS_SPECIES, trapsIsLured, mobMovementIs });`, context);
    return context;
}

const ctx = loadGame();
// Every species has its card. `mobIds` are the living ones, which is what the pages count and list.
const everyMobId = Object.keys(ctx.BESTIARY_ENTRIES);
const isExtinct = (id) => Boolean(ctx.MOB_SPECIES[id] && ctx.MOB_SPECIES[id].hiddenUntilDiscovered);
const mobIds = everyMobId.filter((id) => !isExtinct(id));
const extinctIds = everyMobId.filter(isExtinct);
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
    for (const match of read(`game/${name}`).matchAll(/^\s*registerSpecies\('([a-z_]+)',\s*\{\s*info:\s*\{([\s\S]*?)\},\n/gm)) {
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
    assert.equal(organisms, 17);
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
    // And the organisms, wherever they are counted.
    assert.ok(page(106, 'ES').includes(`**${organisms} organismos**`));
    assert.ok(page(106, 'EN').includes(`**${organisms} organisms**`));
    assert.ok(page('B31X', 'ES').includes(`Los ${organisms} organismos`));
    assert.ok(page('B31X', 'EN').includes(`The ${organisms} organisms`));
    const guia = fs.readFileSync(path.join(ROOT, 'GUIA.md'), 'utf8');
    assert.ok(guia.includes(`${mobs} animales y criaturas y ${organisms} organismos microscópicos, ${mobs + organisms} tarjetas`));
    assert.ok(guia.includes(`"${mobs} / ${mobs + organisms}"`) && guia.includes(`Los ${organisms} organismos`));
    for (const lang of ['ES', 'EN']) {
        const rows = [...page('B31X', lang).matchAll(/^\| \d+ \| !\[[^\]]*\]\(mob:([a-z_]+)\)/gm)].map((match) => match[1]);
        assert.deepEqual(sorted(rows), sorted(mobIds), `B31X ${lang}`);
        const index = [...page(16, lang).matchAll(/^\| !\[\]\(mob:([a-z_]+)\) \|/gm)].map((match) => match[1]);
        assert.deepEqual(sorted(index), sorted(mobIds), `16 ${lang}`);
    }
});

test('page 74: the egg that tall grass and leaves give is of a living species, any of them', () => {
    const context = vm.createContext({ console, Math: Object.create(Math), performance: { now: () => 0 }, THREE: anyStub(), document: anyStub(), navigator: {}, window: { addEventListener() {} } });
    loadSpeciesTables(context, ['game/building.js']);
    vm.runInContext('Object.assign(this, { MOB_SPECIES, registerSpecies, Game })', context);
    for (const id of mobIds) if (!context.MOB_SPECIES[id]) context.MOB_SPECIES[id] = {};
    context.registerSpecies('made_up_boa', { info: { hiddenUntilDiscovered: true } });
    const all = Object.keys(context.MOB_SPECIES);
    assert.ok(all.length > mobIds.length);
    // Every draw there is: the one that gives an egg, then the one that picks the species.
    const eggs = new Set();
    for (const leaf of ['tall_grass', 'leaves']) {
        for (let i = 0; i < all.length * 4; i++) {
            const draws = leaf === 'leaves' ? [0.5, 0, (i + 0.5) / (all.length * 4)] : [0, (i + 0.5) / (all.length * 4)];
            context.Math.random = () => draws.shift();
            eggs.add(context.Game.prototype.getExpansionBonusDrop(leaf));
        }
    }
    assert.deepEqual(sorted(eggs), sorted(mobIds.map((id) => `${id}_egg`)));
    assert.equal(eggs.size, 35);
});

test('the ways of moving of page 104 are the ones in the code', () => {
    // Of every species, the extinct ones too: one that moves in a way of its own adds a row.
    const modes = new Set(['ground']);
    for (const id of everyMobId) if (info(id).movement) modes.add(info(id).movement);
    assert.equal(modes.size, 26, [...modes].join());
    for (const lang of ['ES', 'EN']) {
        const text = page(104, lang);
        const section = text.slice(text.indexOf('|---|'), text.indexOf('\n\n', text.indexOf('|---|')));
        assert.equal(section.split('\n').length - 1, modes.size, `104 ${lang}`);
        assert.ok(text.includes(`**${modes.size}**`), `104 ${lang}`);
        assert.ok(page(106, lang).includes(`**${modes.size} `), `106 ${lang}`);
    }
});

// ---- The bestiary's page ----

// What the panel says of the extinct animals: the title of their section and the words of its count, the line of a
// secret sheet, the tag, and the tree.
function extinctSaid(lang) {
    const text = ctx.BESTIARY_TEXT;
    const counted = text.extinctProgress[lang]('', '').replace(/<\/?b>/g, '').replace(/^[\s/]+/, '');
    return [text.extinctTitle, text.extinctSecret, text.extinctTag, text.lineageTitle, text.lineageLiving].map((line) => line[lang]).concat(counted);
}

test('page 5 quotes the panel in its own language, and not in the other', () => {
    const said = (lang) => {
        const text = ctx.BESTIARY_TEXT;
        return [text.pauseButton, text.close, text.factHabitat, text.factDiet, text.factDrops, text.factLures, text.factHookBait, text.factEncounters, text.factDefeated, text.factFirstSeen,
            text.factSize, text.factGroup, text.factIdentified, text.complete].map((line) => line[lang])
            .concat(text.newEntry[lang].trim(), text.discovered[lang](12, 52).replace(/<\/?b>/g, ''), text.seenFrom[lang](40), extinctSaid(lang));
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
    // The notice and the code look at the living mobs alone; the counter, at them and the organisms; neither, at
    // the extinct animals (test/js/bestiary_text.test.js sees it happen).
    assert.match(code, /bestiaryMobList\(\) \{\s+return this\.bestiaryEveryMob\(\)\.filter\(\(id\) => !mobSpeciesIsExtinct\(id\)\);/);
    assert.match(code, /const living = this\.bestiaryMobList\(\);\s+if \(living\.includes\(species\) && living\.every/);
    assert.match(code, /const mobs = this\.bestiaryMobList\(\);[\s\S]{0,400}const counted = \[\.\.\.mobs, \.\.\.this\.bestiaryOrganismList\(\)\];[\s\S]{0,300}const complete = mobs\.every\(known\)/);
    assert.match(code, /bestiarySay\('discovered', counted\.filter\(known\)\.length, counted\.length\)/);
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
    return Boolean(diet) && !hostile && ctx.mobMovementIs(movement, 'tameable');
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
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'GUIA.md'), 'utf8'), /la enseñan/);
});

// ---- Baits ----

// Who walks to a bait: the ground mobs and the goat ask getMobGoal; hoppers, darters and amphibians get nudged
// (trapsUpdateLures); a behaviour of its own only comes if its update asks too. Bees and ants have their own way.
function walksToBait(id) {
    if (id === 'bee' || id === 'ant') return true;
    const { movement } = info(id);
    if (!movement || movement === 'climb' || ctx.mobMovementIs(movement, 'nudgedToBait')) return true;
    return Boolean(ownFile[id]) && read(`game/${ownFile[id]}`).includes('getMobGoal(');
}

const drawnBy = (bait) => mobIds.filter((id) => ctx.TRAPS_SPECIES[id].baits.includes(bait) && walksToBait(id));
const BAITS = ['bait_seeds', 'bait_worms', 'bait_meat', 'bait_fish', 'bait_honey'];
const LISTED_ONLY = ['eagle', 'fish', 'fox', 'mole', 'owl', 'rabbit', 'snake', 'vulture'];

test('the species that have a bait written down but never walk to it are the ones the guide says', () => {
    assert.deepEqual(sorted(mobIds.filter((id) => ctx.TRAPS_SPECIES[id].baits.length && !walksToBait(id))), LISTED_ONLY);
});

test('what cards and notices promise (trapsIsLured) is what the code does: read from each behaviour', () => {
    for (const id of everyMobId) {
        // The species other files add are not loaded here: they join the table with what their file says.
        if (!ctx.MOB_SPECIES[id]) ctx.MOB_SPECIES[id] = info(id);
        assert.equal(ctx.trapsIsLured(id), ctx.TRAPS_SPECIES[id].baits.length > 0 && walksToBait(id), id);
    }
});

test('pages 4, 5, 93 and GUIA.md no longer say that cards or notices name those who do not come', () => {
    for (const lang of ['ES', 'EN']) {
        assert.doesNotMatch(page(4, lang), /aunque su ficha|even\s+though their sheet/, `4 ${lang}`);
        assert.doesNotMatch(page(5, lang), /también los enseñan|show them too/, `5 ${lang}`);
        assert.doesNotMatch(page(93, lang), /lista más larga|lista larga|longer list/, `93 ${lang}`);
    }
    const guia = fs.readFileSync(path.join(ROOT, 'GUIA.md'), 'utf8');
    assert.doesNotMatch(guia, /aunque su ficha|los enseñan pero/);
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

// ---- The extinct animals ----

// A row of their index (page 261): its portrait, its name linked to its page, the living species it is the ancestor
// of with its portrait and its page (a dash, if none), and the day it arrived.
const EXTINCT_ROW = /^\| !\[\]\(mob:([a-z_]+)\) \| \[([^\]]+)\]\((\d+)\) \| (.+?) \| (\d{4}-\d{2}-\d{2}) \|$/gm;
const EXTINCT_HEAD = { ES: '| | Animal extinto | Antepasado de | Llegó |', EN: '| | Extinct animal | Ancestor of | Arrived |' };

// What is wrong with what the guide says of these extinct species. `facts` says of each what the code does: its
// name in a language, the living species it names, its foods and its baits. `read(id, lang)` gives a page, or null.
function extinctGuideProblems(ids, facts, read) {
    const problems = [];
    const rowsOf = (lang) => Object.fromEntries([...read(261, lang).matchAll(EXTINCT_ROW)].map((row) => [row[1], { name: row[2], page: row[3], kin: row[4], arrived: row[5] }]));
    for (const lang of ['ES', 'EN']) {
        const rows = rowsOf(lang);
        if (!read(261, lang).includes(`${EXTINCT_HEAD[lang]}\n|---|---|---|---|\n`)) problems.push(`261 ${lang}: the head of its table is gone`);
        if (read(261, lang).split('\n').filter((line) => line.startsWith('| ![')).length !== Object.keys(rows).length) problems.push(`261 ${lang}: a row is not written as the others, or is there twice`);
        for (const id of Object.keys(rows)) if (!ids.includes(id)) problems.push(`261 ${lang} lists ${id}, which is no extinct animal`);
        const pageOfLiving = Object.fromEntries([...read(16, lang).matchAll(/^\| !\[\]\(mob:([a-z_]+)\) \| \[[^\]]+\]\((\d+)\)/gm)].map((row) => [row[1], row[2]]));
        for (const id of ids) {
            const row = rows[id];
            if (!row) { problems.push(`261 ${lang} has no row for ${id}`); continue; }
            // One name per thing: its row, the title of its page and its card.
            if (row.name !== facts.name(id, lang)) problems.push(`261 ${lang}: ${id} is called "${row.name}", and its card "${facts.name(id, lang)}"`);
            const living = facts.ancestorOf(id);
            const kin = /^!\[\]\(mob:([a-z_]+)\) \[([^\]]+)\]\((\d+)\)$/.exec(row.kin);
            if (!living && row.kin !== '—') problems.push(`261 ${lang}: ${id} is the ancestor of nothing in the game: a dash`);
            if (living && !(kin && kin[1] === living && kin[3] === pageOfLiving[living] && kin[2].toLowerCase() === facts.name(living, lang).toLowerCase())) {
                problems.push(`261 ${lang}: ${id} is the ancestor of ${living}: ![](mob:${living}) [${facts.name(living, lang)}](${pageOfLiving[living]})`);
            }
            const own = read(row.page, lang);
            if (!own) { problems.push(`261 ${lang}: there is no page ${row.page} for ${id}`); continue; }
            if (own.split('\n')[0] !== `# ${row.name}`) problems.push(`${row.page} ${lang}: its title is not "${row.name}", as its row of 261 says`);
            // What tames it and what brings it over is said on its own page, by id (`wheat`) or with its picture
            // (item:wheat): the shared pages are of the living.
            for (const item of [...facts.foods(id), ...facts.baits(id)]) {
                if (!own.includes(`\`${item}\``) && !own.includes(`(item:${item})`)) problems.push(`${row.page} ${lang}: the page of ${id} does not name ${item}`);
            }
        }
        for (const [number, row] of [[16, /^\| !\[\]\(mob:([a-z_]+)\) \|/gm], ['B31X', /^\| \d+ \| !\[[^\]]*\]\(mob:([a-z_]+)\)/gm]]) {
            for (const match of read(number, lang).matchAll(row)) if (ids.includes(match[1])) problems.push(`${number} ${lang} lists ${match[1]}: an extinct animal goes in 261`);
        }
    }
    const es = rowsOf('ES');
    const en = rowsOf('EN');
    for (const id of ids) if (es[id] && en[id] && (es[id].page !== en[id].page || es[id].arrived !== en[id].arrived)) problems.push(`261: ${id} has another page or another date in each language`);
    return problems;
}

const extinctFacts = {
    name: (id, lang) => (lang === 'ES' ? nameEs(id) : nameEn(id)),
    ancestorOf: (id) => ctx.MOB_SPECIES[id].ancestorOf,
    foods: (id) => (ctx.TAMING_DIET[id] ? [...ctx.TAMING_DIET[id].foods] : []),
    baits: (id) => (ctx.TRAPS_SPECIES[id] ? [...ctx.TRAPS_SPECIES[id].baits] : [])
};

test('page 261 lists the extinct animals and no other: each with its page, whose ancestor it is and its date, in both languages', () => {
    assert.deepEqual(extinctGuideProblems(extinctIds, extinctFacts, pageIfAny), []);
});

test('the rules of page 261 bite: made-up extinct animals with everything right, and then wrong one thing at a time', () => {
    const made = { made_up_dawn_horse: { ES: 'Caballo del alba', EN: 'Dawn Horse' }, made_up_boa: { ES: 'Fictoboa', EN: 'Fictoboa' } };
    const facts = {
        name: (id, lang) => (made[id] ? made[id][lang] : extinctFacts.name(id, lang)),
        ancestorOf: (id) => (made[id] ? (id === 'made_up_dawn_horse' ? 'horse' : undefined) : extinctFacts.ancestorOf(id)),
        foods: (id) => (made[id] ? (id === 'made_up_dawn_horse' ? ['tall_grass', 'wheat'] : []) : extinctFacts.foods(id)),
        baits: (id) => (made[id] ? (id === 'made_up_dawn_horse' ? ['bait_seeds'] : []) : extinctFacts.baits(id))
    };
    const ids = [...extinctIds, ...Object.keys(made)];
    const rows = {
        ES: ['| ![](mob:made_up_dawn_horse) | [Caballo del alba](9001) | ![](mob:horse) [Caballo](34) | 2026-11-20 |', '| ![](mob:made_up_boa) | [Fictoboa](9002) | — | 2026-11-21 |'],
        EN: ['| ![](mob:made_up_dawn_horse) | [Dawn Horse](9001) | ![](mob:horse) [Horse](34) | 2026-11-20 |', '| ![](mob:made_up_boa) | [Fictoboa](9002) | — | 2026-11-21 |']
    };
    // The guide as it is, with their two rows in the index and their two pages; `change` rewrites a page of it.
    const problems = (change = {}) => {
        const pages = {
            '9001 ES': '# Caballo del alba\n\n![Caballo del alba](mob:made_up_dawn_horse)\n\nSe domestica con `tall_grass` o `wheat`, y acude al ![](item:bait_seeds) cebo de semillas.\n',
            '9001 EN': '# Dawn Horse\n\n![Dawn Horse](mob:made_up_dawn_horse)\n\nTamed with `tall_grass` or `wheat`; it comes to ![](item:bait_seeds) seed bait.\n',
            '9002 ES': '# Fictoboa\n', '9002 EN': '# Fictoboa\n'
        };
        for (const lang of ['ES', 'EN']) pages[`261 ${lang}`] = page(261, lang).replace('|---|---|---|---|\n', `|---|---|---|---|\n${rows[lang].join('\n')}\n`);
        for (const [key, rewrite] of Object.entries(change)) pages[key] = rewrite(pages[key] ?? page(...key.split(' ')));
        return extinctGuideProblems(ids, facts, (id, lang) => pages[`${id} ${lang}`] ?? pageIfAny(id, lang));
    };
    assert.deepEqual(problems(), []);
    const wrong = [
        [{ '261 EN': (text) => text.replace(`${rows.EN[1]}\n`, '') }, ['261 EN has no row for made_up_boa']],
        [{ '261 ES': (text) => text.replace('[Caballo del alba]', '[Caballo del amanecer]') }, ['261 ES: made_up_dawn_horse is called "Caballo del amanecer", and its card "Caballo del alba"', '9001 ES: its title is not "Caballo del amanecer", as its row of 261 says']],
        [{ '9002 EN': () => '# The boa that never was\n' }, ['9002 EN: its title is not "Fictoboa", as its row of 261 says']],
        [{ '261 ES': (text) => text.replace('[Fictoboa](9002)', '[Fictoboa](9003)') }, ['261 ES: there is no page 9003 for made_up_boa', '261: made_up_boa has another page or another date in each language']],
        [{ '261 EN': (text) => text.replace('[Horse](34)', '[Horse](33)') }, ['261 EN: made_up_dawn_horse is the ancestor of horse: ![](mob:horse) [Horse](34)']],
        [{ '261 ES': (text) => text.replace('![](mob:horse) [Caballo](34)', '—') }, ['261 ES: made_up_dawn_horse is the ancestor of horse: ![](mob:horse) [Caballo](34)']],
        [{ '261 EN': (text) => text.replace('(9002) | —', '(9002) | ![](mob:snake) [Snake](42)') }, ['261 EN: made_up_boa is the ancestor of nothing in the game: a dash']],
        [{ '261 ES': (text) => text.replace('2026-11-21', 'ayer') }, ['261 ES: a row is not written as the others, or is there twice', '261 ES has no row for made_up_boa']],
        [{ '261 EN': (text) => text.replace(rows.EN[1], '| ![](mob:sheep) | [Sheep](17) | — | 2026-05-15 |\n' + rows.EN[1]) }, ['261 EN lists sheep, which is no extinct animal']],
        [{ '9001 EN': (text) => text.replace('`wheat`', 'wheat seeds') }, ['9001 EN: the page of made_up_dawn_horse does not name wheat']],
        [{ '9001 ES': (text) => text.replace('item:bait_seeds', 'item:bait_meat') }, ['9001 ES: the page of made_up_dawn_horse does not name bait_seeds']],
        [{ '16 ES': (text) => `${text}\n| ![](mob:made_up_boa) | [Fictoboa](9002) | una serpiente | 2026-11-21 |\n` }, ['16 ES lists made_up_boa: an extinct animal goes in 261']],
        [{ 'B31X EN': (text) => `${text}\n| 36 | ![Fictoboa](mob:made_up_boa) [Fictoboa](9002) | 21 November 2026 |\n` }, ['B31X EN lists made_up_boa: an extinct animal goes in 261']],
        [{ '261 EN': (text) => text.replace(EXTINCT_HEAD.EN, '| | Animal | Ancestor of | Arrived |') }, ['261 EN: the head of its table is gone']]
    ];
    for (const [change, expected] of wrong) assert.deepEqual(problems(change), expected, Object.keys(change).join());
});

test('an extinct animal never appears by itself: no biome for its card to name, and nothing in its file that spawns it', () => {
    const where = spawnBiomes();
    for (const id of extinctIds) {
        assert.ok(ownFile[id], `${id}: write registerSpecies('${id}', {\\n    info: { ... },\\n as js/game/crab.js does, so that it is found`);
        assert.equal(where[id], undefined, `${id} has spawnBiomes`);
        assert.doesNotMatch(read(`game/${ownFile[id]}`), /\bspawnForChunk\b|\bmobMarkNatural\(|\bchunkRandom\(/, `${ownFile[id]} spawns something by itself`);
    }
    // Nor does any of them take a row of the living: who is tamed (page 3) and who comes to a bait (4, 93, 96).
    for (const lang of ['ES', 'EN']) {
        for (const number of [3, 4, 93, 96, 74]) for (const id of extinctIds) assert.ok(!page(number, lang).includes(`(mob:${id})`), `${number} ${lang}: ${id}`);
    }
});

test('pages 5 and 261 tell of the extinct animals as the panel does, and never how many there are', () => {
    const escaped = (line) => line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const [lang, other] of [['ES', 'EN'], ['EN', 'ES']]) {
        for (const number of [5, 261]) {
            const text = page(number, lang);
            for (const line of extinctSaid(lang)) assert.ok(text.includes(line), `${number} ${lang} should say: ${line}`);
            for (const line of extinctSaid(other)) assert.ok(!new RegExp(`(^|[^\\p{L}])${escaped(line)}([^\\p{L}]|$)`, 'u').test(text), `${number} ${lang} still says: ${line}`);
            // A number of them would be wrong the day one more arrives.
            assert.doesNotMatch(text, /\d+ (animales extintos|extinct animals)/i, `${number} ${lang}`);
            assert.ok(!text.includes('B31X'), `${number} ${lang} gives the secret away`);
        }
        // The section of page 5 on them has no number at all but those of its links.
        const whole = page(5, lang);
        const start = whole.indexOf(`\n## ${ctx.BESTIARY_TEXT.extinctTitle[lang]}\n`);
        assert.ok(start > 0, `5 ${lang} has its section`);
        assert.doesNotMatch(whole.slice(start, whole.indexOf('\n## ', start + 1)).replace(/\]\(\d+\)/g, ']'), /\d/, `5 ${lang}`);
        // And the pages lead to one another.
        for (const [from, to] of [[5, 261], [16, 261], [0, 261], [261, 5], [261, 16]]) assert.ok(page(from, lang).includes(`](${to})`), `${from} ${lang} links ${to}`);
    }
    const guia = fs.readFileSync(path.join(ROOT, 'GUIA.md'), 'utf8');
    const section = guia.slice(guia.indexOf('\n### Animales extintos\n'), guia.indexOf('\n## Cultivos\n'));
    for (const line of extinctSaid('ES')) assert.ok(section.includes(line), `GUIA.md should say: ${line}`);
    for (const field of ['hiddenUntilDiscovered', 'ancestorOf']) assert.ok(section.includes(field), field);
    assert.doesNotMatch(section, /\d+ animales extintos/i);
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
    // The table of 237 has the organisms of its time; the mould came with cultures (255).
    assert.equal(table.length, organismIds.filter((id) => ctx.MICRO_SPECIES[id].page <= 247).length);
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
