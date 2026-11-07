// Node tests for what the bestiary says (js/game/bestiary_text.js) in the language of the game
// (js/gameLang.js). A species, a label or an item shown that lacks a language fails here, and so does any
// English left on the panel when it is walked through in Spanish on a fake page. Nothing here runs a browser.
// Run with: node --test test/js/bestiary_text.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const JS = path.join(STATIC, 'js');
const read = (file) => fs.readFileSync(path.join(JS, file), 'utf8');

function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}

function storage() {
    const values = new Map([['minecloud-guide-lang', 'EN']]);
    return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)) };
}

// The real tables of the mechanics that feed the sheets, and the microscope's, as the game loads them.
function loadGame() {
    const context = vm.createContext({
        console, Math, performance: { now: () => 0 }, window: { localStorage: storage(), addEventListener() {} },
        THREE: anyStub(), document: anyStub(), navigator: {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {}
    });
    vm.runInContext('class Game {}', context);
    for (const file of ['extensions.js', 'gameLang.js', 'chunkStore.js', 'blockShapes.js', 'mobSpecies.js']) vm.runInContext(read(file), context);
    for (const file of ['bestiary_text.js', 'bestiary.js', 'resources.js', 'taming.js', 'traps.js', 'furniture.js', 'storage.js', 'appliances.js', 'microbes.js', 'microscope_text.js']) {
        vm.runInContext(read(`game/${file}`), context, { filename: file });
    }
    vm.runInContext(`Object.assign(this, { gameLang, setGameLang, Game, ITEM_TYPES, MOB_SPECIES, BESTIARY_ENTRIES, BESTIARY_ENTRIES_ES, BESTIARY_TEXT, BESTIARY_TEMPERAMENTS,
        BESTIARY_ACTIVITIES, BESTIARY_BIOMES, BESTIARY_ORGANISM_HINTS_ES, BESTIARY_ITEMS_ES, MICRO_SPECIES, MICRO_SPECIES_ES, MICROSCOPE_ITEMS_ES,
        TAMING_DIET, RESOURCE_DROPS, TRAPS_SPECIES, TRAPS_BAITS, TRAPS_HOOK_BAITS, trapsIsLured, bestiarySay, bestiaryItemNameEs });`, context);
    // The species other files add join the table here, without loading those files.
    for (const id of mobIdsInTheCode()) if (!context.MOB_SPECIES[id]) context.MOB_SPECIES[id] = ownSpeciesFacts(id);
    return context;
}

// Every species any file of the game defines, read from the code: one added tomorrow is here too.
// What decides who is tamed and who comes to a bait, from the definition in a species' own file.
function ownSpeciesFacts(id) {
    const dir = path.join(STATIC, 'js', 'game');
    for (const name of fs.readdirSync(dir)) {
        const match = new RegExp(`MOB_SPECIES\\.${id}\\s*=\\s*\\{([\\s\\S]*?)\\};`).exec(fs.readFileSync(path.join(dir, name), 'utf8'));
        if (!match) continue;
        const movement = /movement:\s*'([a-z_]+)'/.exec(match[1]);
        return { ...(movement ? { movement: movement[1] } : {}), ...(/hostile:\s*true/.test(match[1]) ? { hostile: true } : {}) };
    }
    return {};
}

function mobIdsInTheCode() {
    const ids = new Set();
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js')) {
                for (const match of fs.readFileSync(full, 'utf8').matchAll(/MOB_SPECIES\.([a-z_]+)\s*=\s*\{/g)) ids.add(match[1]);
            }
        }
    };
    walk(JS);
    const table = read('mobSpecies.js');
    const body = table.slice(table.indexOf('const MOB_SPECIES = {'), table.indexOf('};', table.indexOf('const MOB_SPECIES = {')));
    for (const match of body.matchAll(/^ {4}([a-z_]+): \{/gm)) ids.add(match[1]);
    return [...ids];
}

const ctx = loadGame();
const mobIds = Object.keys(ctx.MOB_SPECIES);
const organismIds = Object.keys(ctx.MICRO_SPECIES);

// Runs `work` with the game in this language, and leaves it in English.
function inLang(context, lang, work) {
    context.setGameLang(lang);
    try {
        return work();
    } finally {
        context.setGameLang('EN');
    }
}

// ---- Nothing missing ----

const isText = (value) => typeof value === 'string' && value.trim().length > 1;

// What is wrong with what these species say, in either language.
function problemsOf(context, mobs, organisms) {
    const problems = [];
    for (const id of mobs) {
        const en = context.BESTIARY_ENTRIES[id];
        const es = context.BESTIARY_ENTRIES_ES[id];
        if (!en) problems.push(`${id} has no English entry`);
        if (!es) problems.push(`${id} has no Spanish entry`);
        if (!en || !es) continue;
        for (const field of ['name', 'habitat', 'hint', 'description']) {
            if (!isText(en[field])) problems.push(`${id}.${field} has no English`);
            if (!isText(es[field])) problems.push(`${id}.${field} has no Spanish`);
            if (field !== 'name' && en[field] === es[field]) problems.push(`${id}.${field} is the same in both`);
        }
        if (!context.BESTIARY_TEMPERAMENTS[en.temperament]) problems.push(`${id}: temperament ${en.temperament} has no words`);
        if (en.activity !== 'Rain' && !context.BESTIARY_ACTIVITIES[en.activity]) problems.push(`${id}: activity ${en.activity} has no words`);
    }
    for (const id of organisms) {
        const en = context.MICRO_SPECIES[id];
        const es = context.MICRO_SPECIES_ES[id];
        if (!es) { problems.push(`${id} has no Spanish`); continue; }
        for (const field of ['name', 'where', 'fact', 'size']) {
            if (!isText(en[field])) problems.push(`${id}.${field} has no English`);
            if (!isText(es[field])) problems.push(`${id}.${field} has no Spanish`);
        }
        if (!isText(en.hint)) problems.push(`${id}.hint has no English`);
        if (!isText(context.BESTIARY_ORGANISM_HINTS_ES[id])) problems.push(`${id}.hint has no Spanish`);
    }
    return problems;
}

test('every species, the mobs and the organisms, says everything in both languages', () => {
    assert.ok(mobIds.length >= 35, `${mobIds.length} mobs found in the code`);
    assert.equal(organismIds.length, 16);
    assert.deepEqual(problemsOf(ctx, mobIds, organismIds), []);
    // Nothing is written for a species that is gone, either.
    assert.deepEqual(Object.keys(ctx.BESTIARY_ENTRIES).sort(), [...mobIds].sort());
    assert.deepEqual(Object.keys(ctx.BESTIARY_ENTRIES_ES).sort(), [...mobIds].sort());
    assert.deepEqual(Object.keys(ctx.BESTIARY_ORGANISM_HINTS_ES).sort(), [...organismIds].sort());
});

test('a species added tomorrow, in a file of its own, is caught untranslated', () => {
    const problems = problemsOf(ctx, [...mobIds, 'griffin'], organismIds);
    assert.ok(problems.includes('griffin has no English entry') && problems.includes('griffin has no Spanish entry'), problems.join());
    const copy = vm.createContext({ BESTIARY_ENTRIES: { griffin: { name: 'Griffin', habitat: 'Peaks', activity: 'Dusk', temperament: 'Grumpy', hint: 'Look up.', description: 'Big.' } },
        BESTIARY_ENTRIES_ES: { griffin: { name: 'Grifo', habitat: 'Peaks', hint: 'Mira arriba.', description: '' } }, BESTIARY_TEMPERAMENTS: ctx.BESTIARY_TEMPERAMENTS, BESTIARY_ACTIVITIES: ctx.BESTIARY_ACTIVITIES });
    const each = problemsOf(copy, ['griffin'], []);
    for (const problem of ['griffin.description has no Spanish', 'griffin.habitat is the same in both', 'griffin: temperament Grumpy has no words', 'griffin: activity Dusk has no words']) {
        assert.ok(each.includes(problem), `${problem}: ${each.join()}`);
    }
    // The scan of the code finds the species that live in their own files.
    for (const id of ['wisp', 'eel', 'ant', 'copper_golem', 'sheep']) assert.ok(mobIds.includes(id), id);
});

test('every label is in both languages, and they are not the same line', () => {
    const keys = Object.keys(ctx.BESTIARY_TEXT);
    assert.ok(keys.length > 25, `${keys.length} lines`);
    for (const key of keys) {
        const { ES, EN, ...rest } = ctx.BESTIARY_TEXT[key];
        assert.deepEqual(Object.keys(rest), [], key);
        assert.ok(ES, `${key} has no Spanish`);
        assert.ok(EN, `${key} has no English`);
        assert.equal(typeof ES, typeof EN, key);
        if (typeof ES === 'function') {
            assert.equal(ES.length, EN.length, `${key} takes the same arguments`);
            const args = ['AAA', 'BBB'].slice(0, ES.length);
            for (const arg of args) {
                // A species' name made from its English id is what Spanish must leave out.
                if (key !== 'genericName') assert.ok(ES(...args).includes(arg), `${key} ES leaves out ${arg}`);
                assert.ok(EN(...args).includes(arg), `${key} EN leaves out ${arg}`);
            }
            assert.notEqual(ES(...args), EN(...args), key);
        } else {
            assert.notEqual(ES, EN, key);
        }
    }
    for (const table of [ctx.BESTIARY_TEMPERAMENTS, ctx.BESTIARY_ACTIVITIES, ctx.BESTIARY_BIOMES]) {
        for (const [key, value] of Object.entries(table)) {
            assert.ok(isText(value.ES) && isText(value.EN), key);
            if (key !== 'Neutral') assert.notEqual(value.ES, value.EN, key);
        }
    }
});

test('no label is left over from a panel that is gone', () => {
    const code = read('game/bestiary.js') + read('game/bestiary_text.js');
    for (const key of Object.keys(ctx.BESTIARY_TEXT)) assert.ok(code.includes(`'${key}'`) || code.includes(`? '${key}'`), `${key} is said nowhere`);
});

test('the biomes of a generic card are the ones the spawn tables know', () => {
    const mobs = read('game/mobs.js');
    for (const biome of ['desert', 'forest', 'rocky', 'plains']) assert.match(mobs, new RegExp(`'${biome}'`), biome);
    assert.deepEqual(Object.keys(ctx.BESTIARY_BIOMES).sort(), ['desert', 'forest', 'plains', 'rocky']);
});

// Every item a sheet can list: the real diet, drops and baits.
function itemsShown() {
    const items = new Set();
    for (const diet of Object.values(ctx.TAMING_DIET)) for (const food of (diet && diet.foods) || []) items.add(food);
    for (const drops of Object.values(ctx.RESOURCE_DROPS)) for (const [item] of drops) items.add(item);
    for (const def of Object.values(ctx.TRAPS_SPECIES)) for (const bait of def.baits) items.add(bait);
    return [...items];
}

test('every item a sheet can list has a Spanish name, and the same one as the guide and the microscope', () => {
    const items = itemsShown();
    assert.ok(items.length >= 30, `${items.length} items`);
    for (const item of items) assert.ok(ctx.bestiaryItemNameEs(item), `${item} has no Spanish name`);
    assert.equal(ctx.bestiaryItemNameEs('no_such_thing'), null);
    // Both tables together.
    for (const [item, name] of Object.entries(ctx.BESTIARY_ITEMS_ES)) {
        if (ctx.MICROSCOPE_ITEMS_ES[item]) assert.equal(name, ctx.MICROSCOPE_ITEMS_ES[item], item);
    }
    // The guide's pictures of an item carry its name.
    const guide = guideText();
    for (const [item, name] of Object.entries(ctx.BESTIARY_ITEMS_ES)) {
        const alts = [...guide.matchAll(new RegExp(`!\\[([^\\]]+)\\]\\(item:${item}\\)`, 'g'))].map((match) => match[1].toLowerCase());
        if (alts.length) assert.ok(alts.includes(name.toLowerCase()), `${item}: ${name}, and the guide says ${alts.join(', ')}`);
    }
});

// ---- The names are the guide's ----

function guidePage(page) {
    const file = fs.readdirSync(path.join(STATIC, 'guide')).find((name) => name.startsWith(`${page}_ES_`));
    return fs.readFileSync(path.join(STATIC, 'guide', file), 'utf8');
}

function guideText() {
    const dir = path.join(STATIC, 'guide');
    return fs.readdirSync(dir).filter((name) => name.includes('_ES_')).map((name) => fs.readFileSync(path.join(dir, name), 'utf8')).join('\n');
}

test('every creature is called what the guide calls it', () => {
    const index = guidePage(16);
    const named = Object.fromEntries([...index.matchAll(/!\[\]\(mob:([a-z_]+)\) \| \[([^\]]+)\]\((\d+)\)/g)].map((match) => [match[1], { name: match[2], page: match[3] }]));
    // The bee's page covers the hive too, so its index row and its title say more than its card.
    const titled = { bee: 'Abeja' };
    for (const id of mobIds) {
        assert.ok(named[id], `${id} is not in the guide's index of mobs`);
        const name = ctx.BESTIARY_ENTRIES_ES[id].name;
        if (titled[id]) {
            assert.equal(name, titled[id], id);
            assert.ok(guidePage(named[id].page).split('\n')[0].includes(`# ${titled[id]}`), id);
        } else {
            assert.equal(name, named[id].name, id);
        }
    }
    const small = [237, 240, 242, 243, 244].map(guidePage).join('\n').toLowerCase();
    for (const id of organismIds) assert.ok(small.includes(ctx.MICRO_SPECIES_ES[id].name.toLowerCase()), `the guide does not say ${ctx.MICRO_SPECIES_ES[id].name}`);
});

test('a hint does not give away the name, in Spanish either', () => {
    // It says what it is made from: there is no other way to get one.
    const exempt = new Set(['copper_golem']);
    for (const id of mobIds) {
        if (exempt.has(id)) continue;
        const { name, hint } = ctx.BESTIARY_ENTRIES_ES[id];
        assert.ok(!hint.toLowerCase().includes(name.split(' ')[0].toLowerCase()), `${id}: ${hint}`);
    }
    for (const id of organismIds) {
        const word = ctx.MICRO_SPECIES_ES[id].name.split(' ')[0].toLowerCase();
        assert.ok(!ctx.BESTIARY_ORGANISM_HINTS_ES[id].toLowerCase().includes(word), id);
    }
});

test('the Spanish keeps the facts: numbers and punctuation', () => {
    for (const id of mobIds) {
        const en = ctx.BESTIARY_ENTRIES[id];
        const es = ctx.BESTIARY_ENTRIES_ES[id];
        assert.deepEqual(es.description.match(/\d+/g), en.description.match(/\d+/g), `${id} numbers`);
        for (const field of ['hint', 'description']) {
            assert.match(es[field], /^[¡¿A-ZÁÉÍÓÚÑ]/, `${id}.${field}`);
            assert.match(es[field], /\.$/, `${id}.${field}`);
        }
    }
    for (const id of organismIds) assert.match(ctx.BESTIARY_ORGANISM_HINTS_ES[id], /^[A-ZÁÉÍÓÚÑ].*\.$/, id);
});

// ---- A fake page ----

// A page element with what the bestiary uses of it, that finds what it holds and remembers what it is asked for.
function fakeElement(page) {
    const asked = new Map();
    let inner = '';
    let text = '';
    const element = {
        style: {}, dataset: {}, width: 200, height: 200, children: [], classes: new Set(), className: '', title: '', id: '', asked,
        classList: { add: (name) => element.classes.add(name), remove: (name) => element.classes.delete(name), toggle: (name, on) => (on ? element.classes.add(name) : element.classes.delete(name)) },
        get innerHTML() { return inner; },
        set innerHTML(value) { inner = value; text = ''; element.children = []; },
        get textContent() { return text; },
        set textContent(value) { text = value; if (value === '') element.children = []; },
        append(...children) { for (const child of children) typeof child === 'string' ? (text += child) : element.appendChild(child); },
        appendChild(child) { element.children.push(child); child.parentNode = element; return child; },
        removeChild(child) { element.children = element.children.filter((other) => other !== child); },
        addEventListener() {},
        getContext: () => anyStub(),
        toDataURL: () => 'data:image/png;base64,drawn',
        querySelector(selector) {
            const held = findIn(element, selector);
            if (held) return held;
            if (!asked.has(selector)) asked.set(selector, fakeElement(page));
            return asked.get(selector);
        }
    };
    if (page) page.push(element);
    return element;
}

function findIn(element, selector) {
    for (const child of element.children) {
        if (selector.startsWith('.') && child.className.split(' ').includes(selector.slice(1))) return child;
        const below = findIn(child, selector);
        if (below) return below;
    }
    return null;
}

// Everything a player can read on an element and what it holds, line by line. Portraits draw, they do not say.
function readable(element) {
    const own = [element.textContent, element.title, element.innerHTML.replace(/<[^>]*>/g, ' ').replace(/&middot;/g, '·')].filter(Boolean);
    return [...own, ...element.children.flatMap(readable), ...[...element.asked.values()].flatMap(readable)];
}

function fakeGame(context) {
    const pageElements = [];
    const made = () => fakeElement(pageElements);
    const row = made();
    const body = made();
    context.document = {
        createElement: made, head: made(), body, pointerLockElement: null, addEventListener() {}, exitPointerLock() {},
        getElementById: (id) => pageElements.find((element) => element.id === id) || null,
        querySelector: () => row
    };
    context.timers = [];
    context.setTimeout = (work) => { context.timers.push(work); return context.timers.length; };
    context.clearTimeout = () => {};
    const game = Object.create(context.Game.prototype);
    Object.assign(game, {
        said: [], playTone() {}, receiveSystemMessage(message) { this.said.push(message.text); }, closePauseMenu() {}, stopMining() {}, closeChatInput() {},
        recapturePointerLock() {}, updatePointerLockHint() {}, isGameplayActive: () => true, renderer: { domElement: made() }, guideShow() {},
        getBiomeSpawnTable: (biome) => (biome === 'forest' || biome === 'rocky' ? [['made_up_beast', 1]] : [])
    });
    game.bestiaryInstall();
    game.bestiaryPauseRow = row;
    return game;
}

const installed = fakeGame(ctx);

// Goes through the whole panel, every species known and not, handing over what it reads on each sheet.
function walkPanel(game, look) {
    const lines = () => readable(game.bestiaryPanel);
    game.bestiaryOpen = true;
    game.bestiaryData = {};
    game.bestiarySelected = null;
    game.bestiaryRender();
    look(lines(), 'nothing found yet');
    const all = game.bestiarySpeciesList();
    for (const id of all) {
        game.bestiarySelected = id;
        game.bestiaryRenderDetail();
        look(lines(), `${id}, not found`);
    }
    game.bestiaryStopPreview();
    for (const id of all) game.bestiaryData[id] = { firstSeen: '2026-03-05T12:00:00Z', encounters: 3, defeated: 1 };
    game.bestiarySelected = null;
    game.bestiaryRender();
    look(lines(), 'everything found');
    for (const id of all) {
        game.bestiarySelected = id;
        game.bestiaryRender();
        look(lines(), `${id}, found`);
    }
    game.bestiaryOpen = false;
    game.bestiaryStopPreview();
}

// The words the English of the bestiary uses, from its own tables. Spanish words that happen to be spelled
// the same are the only ones let through, each named here.
function englishWords(context) {
    const words = new Set();
    const add = (text) => { for (const word of String(text).toLowerCase().match(/[a-z]+/g) || []) words.add(word); };
    for (const entry of Object.values(context.BESTIARY_ENTRIES)) for (const value of Object.values(entry)) add(value);
    for (const def of Object.values(context.MICRO_SPECIES)) for (const field of ['name', 'where', 'fact', 'hint', 'size']) add(def[field]);
    for (const line of Object.values(context.BESTIARY_TEXT)) add(typeof line.EN === 'function' ? line.EN('', '') : line.EN);
    for (const table of [context.BESTIARY_TEMPERAMENTS, context.BESTIARY_ACTIVITIES, context.BESTIARY_BIOMES]) for (const value of Object.values(table)) add(value.EN);
    for (const item of itemsShown()) {
        add(item.replace(/_/g, ' '));
        if (context.ITEM_TYPES[item]) add(context.ITEM_TYPES[item].name);
    }
    return words;
}

const SPELLED_ALIKE = new Set(['a', 'no', 'cactus', 'oasis', 'golem', 'acacia', 'animal', 'neutral', 'shift', 'metal', 'hooke', 'robert', 'bacteria', 'gas', 'cm', 'alga', 'm', 'mm', 'real']);

function englishIn(line, words) {
    // The scientific name is Latin in both languages, and the code of a secret page is a code.
    const plain = line.replace(/Tardigrada|Rotifera|Daphnia|Paramecium|Amoeba proteus|Vorticella|Euglena|Bacillariophyta|Spirogyra|Cyanobacteria|Bacillus|Saccharomyces|Lactobacillus|Cellula plantae|Cellula animalis|Basidiospora|B31X/g, '');
    const normal = plain.toLowerCase();
    // Word by word; an accent breaks a word, and that word is not English anyway.
    return (normal.match(/[a-záéíóúüñ]+/g) || []).filter((word) => words.has(word) && !SPELLED_ALIKE.has(word));
}

test('walking through the panel in Spanish, every species known and not, nothing English is left on it', () => {
    const words = englishWords(ctx);
    assert.ok(words.size > 400, `${words.size} English words to look for`);
    let looks = 0;
    inLang(ctx, 'ES', () => walkPanel(installed, (lines, step) => {
        looks++;
        assert.ok(lines.length > 0, step);
        for (const line of lines) assert.deepEqual(englishIn(line, words), [], `${step}: ${line}`);
    }));
    assert.equal(looks, 2 + 2 * (mobIds.length + organismIds.length));
    // And the same look in English does find it.
    let caught = 0;
    walkPanel(installed, (lines) => { caught += lines.filter((line) => englishIn(line, words).length).length; });
    assert.ok(caught > 1000, `the same look in English finds it: ${caught}`);
});

test('every English line of the tables is gone in Spanish, by its whole text as well', () => {
    const texts = new Set();
    for (const entry of Object.values(ctx.BESTIARY_ENTRIES)) for (const field of ['habitat', 'hint', 'description']) texts.add(entry[field]);
    for (const def of Object.values(ctx.MICRO_SPECIES)) for (const field of ['where', 'fact', 'hint']) texts.add(def[field]);
    inLang(ctx, 'ES', () => walkPanel(installed, (lines, step) => {
        const seen = lines.join('\n');
        for (const text of texts) assert.ok(!seen.includes(text), `${step}: ${text}`);
    }));
});

test('a sheet in Spanish, from top to bottom, with what other mechanics feed it', () => {
    const game = installed;
    inLang(ctx, 'ES', () => {
        game.bestiaryOpen = true;
        game.bestiaryData = { sheep: { firstSeen: '2026-03-05T12:00:00Z', encounters: 3, defeated: 1 } };
        game.bestiarySelected = 'sheep';
        game.bestiaryRender();
        const detail = game.bestiaryPanel.querySelector('#bestiary-detail');
        const seen = readable(detail).join(' | ');
        for (const said of ['Oveja', 'Temperamento: pasivo', 'Actividad: de día', 'Hábitat', 'Llanuras, rocas y bosques', 'Dieta', 'Hierba alta, Trigo, Flor amarilla, Hojas',
            'Botín', 'Lana blanca', 'Cebos', 'Cebo de semillas', 'Encuentros', 'Derrotados', 'Primer avistamiento', '< Volver']) assert.ok(seen.includes(said), `${said} in: ${seen}`);
        assert.match(seen, /5 mar 2026/);
        // The colour of a tag does not hang on the words.
        const tags = detail.children.find((child) => child.className === 'bestiary-tags');
        assert.equal(tags.children[0].className, 'bestiary-tag passive');
        game.bestiarySelected = 'storm_golem';
        game.bestiaryData.storm_golem = { encounters: 1 };
        game.bestiaryRender();
        assert.match(readable(game.bestiaryPanel.querySelector('#bestiary-detail')).join(' | '), /Temperamento: neutral \| Actividad: con lluvia/);
        // A microbe.
        game.bestiarySelected = 'tardigrade';
        game.bestiaryData.tardigrade = { encounters: 2 };
        game.bestiaryRender();
        const small = readable(game.bestiaryPanel.querySelector('#bestiary-detail')).join(' | ');
        for (const said of ['Tardígrado', 'Se ve desde 40×', 'Tamaño real', '0,3-0,5 mm', 'Grupo', 'Tardigrada', 'Vive en', 'Musgo húmedo', 'Identificaciones', '📖 En la guía']) assert.ok(small.includes(said), `${said} in: ${small}`);
        // Not found yet.
        game.bestiarySelected = 'rotifer';
        game.bestiaryRender();
        const dark = readable(game.bestiaryPanel.querySelector('#bestiary-detail')).join(' | ');
        assert.match(dark, /^.*\?\?\? \| Aún sin descubrir\. Solo se ve con un microscopio\. En un extremo.* Hábitat: Lagos de bosque y musgo\./);
        game.bestiaryOpen = false;
        game.bestiaryStopPreview();
    });
});

test('English still reads as it always did', () => {
    const game = installed;
    game.bestiaryOpen = true;
    game.bestiaryData = { sheep: { firstSeen: '2026-03-05T12:00:00Z', encounters: 3, defeated: 1 }, tardigrade: { encounters: 2 } };
    game.bestiarySelected = 'sheep';
    game.bestiaryRender();
    const panel = game.bestiaryPanel;
    assert.equal(panel.querySelector('#bestiary-progress').innerHTML, `<b>2</b> / ${mobIds.length + 16} discovered`);
    const seen = readable(panel.querySelector('#bestiary-detail')).join(' | ');
    for (const said of ['Sheep', 'Passive', 'Active: Day', 'Habitat', 'Plains, rocky hills and forests', 'Diet', 'Drops', 'Lured by', 'Encounters', 'Defeated', 'First seen', '< Back']) assert.ok(seen.includes(said), `${said} in: ${seen}`);
    assert.match(seen, /Mar 5, 2026/);
    assert.ok(readable(panel.querySelector('#bestiary-grid')).includes('Seen 3x'));
    assert.ok(readable(panel.querySelector('#bestiary-grid')).includes('Identified 2x'));
    game.bestiarySelected = 'storm_golem';
    game.bestiaryData.storm_golem = { encounters: 1 };
    game.bestiaryRender();
    assert.ok(readable(panel.querySelector('#bestiary-detail')).includes('Active in rain'));
    game.bestiaryOpen = false;
    game.bestiaryStopPreview();
});

test('a species with no entry gets a generic card in the language of the game, with nothing of its id', () => {
    const context = loadGame();
    const game = fakeGame(context);
    context.MOB_SPECIES.made_up_beast = {};
    context.MOB_SPECIES.other_beast = { hostile: true, nocturnal: true };
    const words = new Set(['made', 'up', 'beast', 'other', ...englishWords(context)]);
    inLang(context, 'ES', () => {
        const entry = game.bestiaryEntry('made_up_beast');
        assert.equal(entry.name, 'Criatura nueva');
        assert.equal(entry.habitat, 'Bosques, Roca');
        game.getBiomeSpawnTable = () => [];
        assert.equal(game.bestiaryEntry('other_beast').habitat, 'Desconocido');
        assert.equal(game.bestiaryEntry('other_beast').hint, 'Sigue explorando: ya aparecerá.');
        walkPanel(game, (lines, step) => {
            if (!/beast|nothing|everything/.test(step)) return;
            for (const line of lines) assert.deepEqual(englishIn(line, words), [], `${step}: ${line}`);
        });
        game.bestiaryOpen = true;
        game.bestiarySelected = 'other_beast';
        game.bestiaryData.other_beast = { encounters: 1 };
        game.bestiaryRender();
        const seen = readable(game.bestiaryPanel.querySelector('#bestiary-detail')).join(' | ');
        assert.match(seen, /Temperamento: hostil \| Actividad: de noche/);
        assert.match(seen, /Aún se sabe poco de esta criatura\./);
        game.bestiaryOpen = false;
    });
    game.getBiomeSpawnTable = (biome) => (biome === 'desert' ? [['made_up_beast', 1]] : []);
    const entry = game.bestiaryEntry('made_up_beast');
    assert.equal(entry.name, 'Made Up Beast');
    assert.equal(entry.habitat, 'Deserts');
    assert.equal(entry.description, 'Little is known about this creature yet.');
});

// ---- The change of language ----

test('a change of language applies at once to the open panel, to the pause button and to the notice', () => {
    const context = loadGame();
    const game = fakeGame(context);
    const panel = game.bestiaryPanel;
    assert.equal(panel.querySelector('h3').textContent, 'Bestiary');
    assert.equal(panel.querySelector('.bestiary-close').textContent, 'Close');
    assert.doesNotMatch(panel.innerHTML, />[A-Za-z]/, 'no words in the page itself');
    const button = context.document.getElementById('settings-bestiary');
    assert.equal(button.textContent, 'Bestiary (B)');
    assert.equal(game.bestiaryPauseRow.children[0], button);
    // Closed: the pause menu holds the selector, so its button must follow.
    context.setGameLang('ES');
    assert.equal(button.textContent, 'Bestiario (B)');
    assert.equal(panel.querySelector('h3').textContent, 'Bestiario');
    context.setGameLang('EN');

    // Open, on a microbe whose drawing is alive: the words change, the drawing goes on.
    game.bestiaryOpen = true;
    game.bestiaryData = { tardigrade: { encounters: 1 } };
    game.bestiarySelected = 'tardigrade';
    game.bestiaryRender();
    const canvas = game.bestiaryOrganismCanvas;
    assert.ok(canvas);
    assert.ok(readable(panel.querySelector('#bestiary-detail')).includes('Tardigrade'));
    context.setGameLang('ES');
    assert.equal(panel.querySelector('h3').textContent, 'Bestiario');
    assert.equal(panel.querySelector('.bestiary-close').textContent, 'Cerrar');
    assert.match(panel.querySelector('#bestiary-progress').innerHTML, /descubiertas/);
    assert.ok(readable(panel.querySelector('#bestiary-detail')).includes('Tardígrado'));
    assert.ok(readable(panel.querySelector('#bestiary-grid')).includes('Tardígrado'));
    assert.equal(game.bestiaryOrganismCanvas, canvas, 'the drawing is the same one');
    context.setGameLang('EN');
    assert.ok(readable(panel.querySelector('#bestiary-detail')).includes('Tardigrade'));
    assert.equal(game.bestiaryOrganismCanvas, canvas);
    game.bestiaryOpen = false;
    game.bestiaryStopPreview();

    // Closed, nothing is drawn for nobody.
    let rendered = 0;
    game.bestiaryRender = () => rendered++;
    context.setGameLang('ES');
    assert.equal(rendered, 0);
    delete game.bestiaryRender;

    // The notice, in the language of the moment; on screen, it changes too; gone, it is left alone.
    const voices = [];
    game.playTone = () => voices.push(1);
    game.bestiaryEncounter('sheep');
    const toast = context.document.getElementById('bestiary-toast');
    assert.equal(game.bestiaryToastSpecies, 'sheep');
    assert.ok(readable(toast).includes('Oveja'));
    assert.ok(readable(toast).includes('Nueva entrada en el bestiario: '));
    context.setGameLang('EN');
    assert.ok(readable(toast).includes('Sheep'));
    assert.ok(readable(toast).includes('New bestiary entry: '));
    for (const work of context.timers.splice(0)) work();
    assert.equal(game.bestiaryToastSpecies, null);
    assert.ok(!toast.classes.has('visible'));
    context.setGameLang('ES');
    assert.ok(readable(toast).includes('Sheep'), 'it has gone: nobody reads it');
    context.setGameLang('EN');
});

test('the message of the full notebook is in the language of the game', () => {
    const context = loadGame();
    const game = fakeGame(context);
    for (const id of game.bestiaryMobList()) game.bestiaryData[id] = { encounters: 1 };
    delete game.bestiaryData.sheep;
    inLang(context, 'ES', () => {
        game.bestiaryEncounter('sheep');
        for (const work of context.timers.splice(0)) work();
        assert.ok(game.said.includes('¡Tu bestiario está completo! Hay algo escrito en su última página...'), game.said.join());
        game.bestiaryOpen = true;
        game.bestiaryRender();
        assert.match(game.bestiaryPanel.querySelector('#bestiary-progress').innerHTML, /en la última página, con tinta desvaída: <b>B31X<\/b>/);
        game.bestiaryOpen = false;
    });
});

// ---- Nothing written straight into the code ----

test('the panel\'s code writes no words of its own: they all come from the tables', () => {
    const code = read('game/bestiary.js');
    const panel = code.slice(code.indexOf('Object.assign(Game.prototype, {'), code.indexOf('registerModalPanel({'));
    for (const match of panel.matchAll(/\.(?:textContent|title|alt)\s*=\s*(['"`])(.*?)\1\s*[;,]/g)) {
        assert.ok(!/[A-Za-z]{2}/.test(match[2].replace(/\$\{[^}]*\}/g, '')), `written in the code: ${match[0]}`);
    }
    assert.doesNotMatch(panel, /addFact\(['"`]/, 'a label in the code');
    assert.doesNotMatch(panel, /\.append\(['"`][A-Za-z]/, 'a line in the code');
    assert.doesNotMatch(panel, /receiveSystemMessage\(\{ text: ['"`]/, 'a message in the code');
    assert.doesNotMatch(panel, /\|\| ['"`][A-Z][a-z]+/, 'a fallback in the code');
    const html = panel.slice(panel.indexOf('panel.innerHTML = `') + 19, panel.indexOf("panel.querySelector('.bestiary-close')"));
    assert.doesNotMatch(html.replace(/<[^>]*>/g, ' '), /[A-Za-z]{2}/, 'words in the page itself');
    assert.doesNotMatch(html, /title="[A-Za-z]/, 'a tooltip in the page');
});

test('it is loaded by the game, before the bestiary and without touching the printed guide', () => {
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    assert.ok(html.indexOf('js/game/bestiary_text.js') > html.indexOf('js/gameLang.js'));
    assert.ok(html.indexOf('js/game/bestiary_text.js') < html.indexOf('js/game/bestiary.js'));
    // The guide's pictures take a portrait by id: nothing there depends on the language.
    const code = read('game/bestiary.js');
    const portrait = code.slice(code.indexOf('bestiaryRenderPortrait(species) {'), code.indexOf('// An organism\'s sheet'));
    assert.doesNotMatch(portrait, /bestiarySay|gameLang|bestiaryEntry/);
    assert.doesNotMatch(code.slice(0, code.indexOf('Object.assign(Game.prototype, {')), /gameLang\(|bestiarySay\(/, 'nothing at load time');
});

// What a found species' sheet reads, line by line.
function sheetOf(game, id) {
    game.bestiaryOpen = true;
    game.bestiaryData = { [id]: { firstSeen: '2026-03-05T12:00:00Z', encounters: 1, defeated: 0 } };
    game.bestiarySelected = id;
    game.bestiaryRender();
    const lines = readable(game.bestiaryPanel.querySelector('#bestiary-detail'));
    game.bestiaryOpen = false;
    return lines;
}

test('a sheet shows a diet only where it tames: never on the species tamingCanTame turns down', () => {
    const game = installed;
    const shown = { ES: [], EN: [] };
    for (const lang of ['ES', 'EN']) {
        inLang(ctx, lang, () => {
            for (const id of Object.keys(ctx.BESTIARY_ENTRIES)) {
                const hasDiet = sheetOf(game, id).includes(ctx.bestiarySay('factDiet'));
                assert.equal(hasDiet, game.tamingCanTame(id), `${lang} ${id}`);
                if (hasDiet) shown[lang].push(id);
            }
        });
    }
    assert.deepEqual(shown.ES, shown.EN);
    assert.deepEqual(shown.EN.slice().sort(), ['camel', 'cat', 'dog', 'duck', 'giraffe', 'goat', 'horse', 'macaw', 'pig', 'sheep']);
    for (const id of ['fox', 'rabbit', 'owl', 'mole', 'crab']) {
        assert.ok(ctx.TAMING_DIET[id].foods.length > 0, `${id}: the table itself stays as it was`);
        assert.equal(game.tamingCanTame(id), false, id);
    }
});

test('offering food to a species that cannot be tamed is still turned down, and not spent', () => {
    const game = installed;
    for (const [id, food] of [['fox', 'raw_fish'], ['rabbit', 'tall_grass'], ['owl', 'raw_fish'], ['mole', 'mushroom_brown'], ['crab', 'raw_fish']]) {
        let spent = 0;
        game.consumeSelectedBlock = () => { spent++; return true; };
        const mob = { userData: { species: id }, position: { x: 0, y: 0, z: 0 } };
        assert.equal(game.tamingUse(mob, food), false, id);
        assert.equal(spent, 0, id);
    }
});

const NEVER_COME = ['fox', 'rabbit', 'owl', 'vulture', 'eagle', 'snake', 'mole', 'fish'];

test('a sheet shows baits only on species that come to them, and fish theirs as hook bait', () => {
    const game = installed;
    assert.deepEqual(Object.keys(ctx.TRAPS_SPECIES).filter((id) => ctx.TRAPS_SPECIES[id].baits.length && !ctx.trapsIsLured(id)).sort(), NEVER_COME.slice().sort());
    for (const [lang, hookLabel, worms, fishBait] of [['ES', 'Cebo de anzuelo', 'Cebo de gusanos', 'Cebo de pescado'], ['EN', 'Hook bait', 'Worm Bait', 'Fish Bait']]) {
        inLang(ctx, lang, () => {
            for (const id of Object.keys(ctx.BESTIARY_ENTRIES)) {
                const lines = sheetOf(game, id);
                const baits = ctx.TRAPS_SPECIES[id].baits;
                assert.equal(lines.includes(ctx.bestiarySay('factLures')), ctx.trapsIsLured(id), `${lang} ${id}`);
                assert.equal(lines.includes(hookLabel), id === 'fish', `${lang} ${id}`);
                if (ctx.trapsIsLured(id)) assert.ok(baits.length > 0, id);
            }
            const fish = sheetOf(game, 'fish').join(' | ');
            assert.ok(fish.includes(hookLabel), lang);
            assert.ok(fish.includes(worms), `${lang}: ${worms}`);
            assert.ok(fish.includes(fishBait), `${lang}: ${fishBait}`);
        });
    }
    assert.deepEqual([...ctx.TRAPS_HOOK_BAITS], ['bait_worms', 'bait_fish']);
});

test('the table stays as it was: those who never come still have their bait, and nibble it in passing', () => {
    assert.deepEqual([...ctx.TRAPS_SPECIES.fox.baits], ['bait_meat']);
    assert.deepEqual([...ctx.TRAPS_SPECIES.rabbit.baits], ['bait_seeds']);
    assert.deepEqual([...ctx.TRAPS_SPECIES.owl.baits], ['bait_meat']);
    assert.deepEqual([...ctx.TRAPS_SPECIES.vulture.baits], ['bait_meat']);
    assert.deepEqual([...ctx.TRAPS_SPECIES.eagle.baits], ['bait_fish']);
    assert.deepEqual([...ctx.TRAPS_SPECIES.snake.baits], ['bait_meat']);
    assert.deepEqual([...ctx.TRAPS_SPECIES.mole.baits], ['bait_worms']);
    assert.deepEqual([...ctx.TRAPS_SPECIES.fish.baits], ['bait_worms']);
    const bait = { type: 'bait_meat', amount: 1, position: { x: 1, y: 0, z: 0, clone() { return this; } }, group: { parent: {} }, biteTimer: 1 };
    const fox = { position: { x: 0, y: 0, z: 0 }, userData: { species: 'fox', home: { copy() {} }, stepPhase: 0 } };
    const game = Object.create(ctx.Game.prototype);
    Object.assign(game, { ambientMobs: [fox], trapsBaits: [bait], camera: { position: { x: 0, z: 0 } }, playNoiseBurst() {} });
    game.trapsUpdateLures(1);
    assert.ok(bait.amount < 1, 'within 1.4 blocks the fox nibbles');
    assert.ok(fox.userData.trapsLinger, 'and stays around');
});

test('the chat notice names only those who come to the bait', () => {
    const said = [];
    const spot = { x: 0, y: 0, z: 0, clone() { return this; } };
    const game = Object.create(ctx.Game.prototype);
    Object.assign(game, {
        trapsBaits: [], trapsJars: [], trapsCages: [], trapsGroundSpot: () => spot, trapsCreateBait() {}, consumeSelectedBlock() {}, playPlaceSound() {},
        trapsAfterUse() {}, trapsItemName: (type) => type, receiveSystemMessage: ({ text }) => said.push(text),
        formatItemName: (id) => id.replace(/_/g, ' ')
    });
    const lures = (type) => {
        said.length = 0;
        game.trapsPlaceBait(type, {});
        return /Lures: (.*)$/.exec(said[0])[1].split(', ').sort();
    };
    assert.deepEqual(lures('bait_meat'), ['ant', 'cat', 'cave monster', 'dog', 'spider']);
    assert.deepEqual(lures('bait_worms'), ['duck', 'frog', 'lizard', 'pig', 'scorpion', 'turtle']);
    assert.deepEqual(lures('bait_fish'), ['cat', 'crab', 'turtle']);
    assert.deepEqual(lures('bait_seeds'), ['ant', 'beaver', 'camel', 'duck', 'giraffe', 'goat', 'horse', 'macaw', 'pig', 'sheep']);
    assert.deepEqual(lures('bait_honey'), ['ant', 'bee']);
});
