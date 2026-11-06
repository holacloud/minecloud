// Node tests for the language of the game (js/gameLang.js) and what the microscope says in it
// (js/game/microscope_text.js). A line missing a language, or written straight into the panel's code, fails
// here. Nothing here runs a browser.
// Run with: node --test test/js/microscope_text.test.js

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

function storage(saved = {}) {
    const values = new Map(Object.entries(saved));
    return { values, getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)) };
}

function loadLang(saved, language) {
    const context = vm.createContext({ window: { localStorage: storage(saved) }, navigator: { language } });
    vm.runInContext(read('gameLang.js'), context);
    vm.runInContext('Object.assign(this, { gameLang, setGameLang, onGameLangChange, gameText })', context);
    return context;
}

function loadModules() {
    const context = vm.createContext({
        console, Math, performance: { now: () => 0 }, window: { localStorage: storage({ 'minecloud-guide-lang': 'EN' }), addEventListener() {} },
        THREE: anyStub(), document: anyStub(), navigator: {}
    });
    vm.runInContext('class Game {}; function resourcesDrawSprite() { return () => {}; } function resourcesDisplayMesh() { return null; }', context);
    for (const file of ['extensions.js', 'gameLang.js', 'chunkStore.js', 'blockShapes.js', 'mobSpecies.js']) vm.runInContext(read(file), context);
    for (const file of ['bestiary.js', 'furniture.js', 'storage.js', 'appliances.js', 'microbes.js', 'microscope_text.js', 'microscope.js']) {
        vm.runInContext(read(`game/${file}`), context, { filename: file });
    }
    vm.runInContext(`Object.assign(this, { gameLang, setGameLang, MICROSCOPE_TEXT, MICRO_SPECIES, MICRO_SPECIES_ES, MICRO_STAINS, MICRO_STAINS_ES, MICRO_ITEMS, MICRO_SAMPLES, MICROSCOPE_KIT,
        microscopeSay, microscopeItemNameEs, microscopeSpeciesText, microscopeStainNote, microscopeStainText, microscopeSampleId: microSampleId,
        microscopeRefusalLine, microscopeDarkLine, microscopeDarkfieldLine, microscopeFilterLine, microscopeStainWarning, microscopeSlideLine, microscopeTardigradeLine, Game });`, context);
    return context;
}

const ctx = loadModules();

// Runs `work` with the game in this language, and leaves it in English.
function inLang(lang, work) {
    ctx.setGameLang(lang);
    try {
        return work();
    } finally {
        ctx.setGameLang('EN');
    }
}

// ---- One setting ----

test('the language: the old key is kept, and the browser decides until the player does', () => {
    assert.equal(loadLang({ 'minecloud-guide-lang': 'ES' }, 'en-GB').gameLang(), 'ES', 'nobody loses their choice');
    assert.equal(loadLang({ 'minecloud-guide-lang': 'EN' }, 'es-ES').gameLang(), 'EN');
    assert.equal(loadLang({}, 'es-AR').gameLang(), 'ES');
    assert.equal(loadLang({}, 'en-US').gameLang(), 'EN');
    assert.equal(loadLang({}, 'est').gameLang(), 'EN', 'Estonian is not Spanish');
    assert.equal(loadLang({ 'minecloud-guide-lang': 'FR' }, 'es').gameLang(), 'ES', 'what cannot be read does not count');
});

test('the language: a change is saved, told, and only when it is a change', () => {
    const lang = loadLang({}, 'en');
    const heard = [];
    lang.onGameLangChange((value) => heard.push(value));
    assert.equal(lang.setGameLang('EN'), false);
    assert.equal(lang.setGameLang('FR'), false);
    assert.deepEqual(heard, []);
    assert.equal(lang.setGameLang('ES'), true);
    assert.deepEqual(heard, ['ES']);
    assert.equal(lang.gameLang(), 'ES');
    assert.equal(lang.window.localStorage.values.get('minecloud-guide-lang'), 'ES');
    assert.equal(lang.gameText({ ES: 'hola', EN: 'hello' }), 'hola');
});

test('the language: blocked storage breaks nothing', () => {
    const context = vm.createContext({ window: { get localStorage() { throw new Error('blocked'); } }, navigator: { language: 'es' } });
    vm.runInContext(read('gameLang.js'), context);
    assert.equal(vm.runInContext('gameLang()', context), 'ES');
    assert.equal(vm.runInContext('setGameLang("EN")', context), true);
    assert.equal(vm.runInContext('gameLang()', context), 'EN');
});

test('the guide and the pause menu are the same setting, and nothing else keeps its own', () => {
    const guide = read('game/guide.js');
    assert.doesNotMatch(guide, /guideLang|minecloud-guide-lang|GUIDE_LANGS/);
    assert.match(guide, /setGameLang\(button\.dataset\.lang\)/);
    assert.match(guide, /onGameLangChange\(\(\) => \{\s+if \(this\.guideOpen\) this\.guideRender\(\);/);
    const menus = read('game/menus.js');
    assert.match(menus, /setGameLang\(languageSelect\.value\)/);
    assert.match(menus, /onGameLangChange\(\(lang\) => \{ languageSelect\.value = lang; \}\)/);
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    assert.match(html, /<select id="settings-language">\s+<option value="ES">Español<\/option>\s+<option value="EN">English<\/option>/);
    assert.ok(html.indexOf('js/gameLang.js') > html.indexOf('js/extensions.js') && html.indexOf('js/gameLang.js') < html.indexOf('js/game.js"'));
    assert.ok(html.indexOf('js/game/microscope_text.js') > html.indexOf('js/game/microbes.js') && html.indexOf('js/game/microscope_text.js') < html.indexOf('js/game/microscope.js'));
});

test('an open panel changes language at once', () => {
    const microscope = read('game/microscope.js');
    assert.match(microscope, /onGameLangChange\(\(\) => this\.microscopeOnLang\(\)\)/);
    let rendered = 0;
    const game = Object.create(ctx.Game.prototype);
    game.microscopePanel = null;
    game.microscopeRenderControls = () => rendered++;
    game.microscopeWriteLabels = () => rendered++;
    game.microscopeOnLang();
    assert.equal(rendered, 0, 'never opened: nothing to do');
    game.microscopePanel = {};
    game.microscopeShownSpecies = 'tardigrade||0';
    game.microscopeOnLang();
    assert.equal(rendered, 2);
    assert.equal(game.microscopeShownSpecies, null, 'its card is written again');
});

// ---- Nothing missing ----

test('every line of the panel is in both languages, and they are not the same line', () => {
    const same = new Set(['stainCount']);
    const keys = Object.keys(ctx.MICROSCOPE_TEXT);
    assert.ok(keys.length > 60, `${keys.length} lines`);
    for (const key of keys) {
        const { ES, EN, ...rest } = ctx.MICROSCOPE_TEXT[key];
        assert.deepEqual(Object.keys(rest), [], key);
        assert.ok(ES, `${key} has no Spanish`);
        assert.ok(EN, `${key} has no English`);
        assert.equal(typeof ES, typeof EN, key);
        if (typeof ES === 'function') {
            assert.equal(ES.length, EN.length, `${key} takes the same arguments`);
            const args = ['AAA', 'BBB', 'CCC'].slice(0, ES.length);
            for (const arg of args) {
                assert.ok(ES(...args).includes(arg), `${key} ES leaves out ${arg}`);
                assert.ok(EN(...args).includes(arg), `${key} EN leaves out ${arg}`);
            }
            if (!same.has(key)) assert.notEqual(ES(...args), EN(...args), key);
        } else if (!same.has(key)) {
            assert.notEqual(ES, EN, key);
        }
    }
});

test('every organism, in all it says, is in Spanish', () => {
    const species = Object.keys(ctx.MICRO_SPECIES);
    assert.equal(species.length, 16);
    assert.deepEqual(Object.keys(ctx.MICRO_SPECIES_ES).sort(), [...species].sort());
    for (const id of species) {
        const es = ctx.MICRO_SPECIES_ES[id];
        for (const field of ['name', 'size', 'where', 'fact']) assert.ok(typeof es[field] === 'string' && es[field].length > 2, `${id}.${field}`);
        // Sizes are the same numbers, with a Spanish decimal comma.
        const numbers = (text) => text.replace(/,/g, '.').match(/[\d.]+/g);
        assert.deepEqual(numbers(es.size), numbers(ctx.MICRO_SPECIES[id].size), `${id} size`);
        assert.doesNotMatch(es.size, /\d\.\d/, `${id} decimal comma`);
        assert.notEqual(es.fact, ctx.MICRO_SPECIES[id].fact, id);
        for (const stain of Object.keys(ctx.MICRO_STAINS)) {
            assert.ok(es.notes[stain] && es.notes[stain].length > 20, `${id} ${stain}`);
            assert.notEqual(es.notes[stain], ctx.MICRO_SPECIES[id].stains[stain].note, `${id} ${stain}`);
        }
    }
    assert.deepEqual(Object.keys(ctx.MICRO_STAINS_ES).sort(), Object.keys(ctx.MICRO_STAINS).sort());
    for (const def of Object.values(ctx.MICRO_STAINS_ES)) {
        for (const field of ['name', 'the', 'shows', 'gets']) assert.ok(def[field], field);
    }
    // The science says what the English says.
    assert.match(ctx.MICRO_SPECIES_ES.spirogyra.notes.iodine_tincture, /almidón.*pirenoide/);
    assert.match(ctx.MICRO_SPECIES_ES.euglena.notes.iodine_tincture, /paramilón, no es almidón/);
    assert.match(ctx.MICRO_SPECIES_ES.animal_cell.notes.iodine_tincture, /glucógeno/);
    assert.match(ctx.MICRO_SPECIES_ES.tardigrade.fact, /barrilito/);
});

test('the bestiary keeps the English, whole: no card is half translated', () => {
    const def = ctx.MICRO_SPECIES.tardigrade;
    assert.equal(def.name, 'Tardigrade');
    const bestiary = read('game/bestiary.js');
    assert.doesNotMatch(bestiary, /MICRO_SPECIES_ES|microscopeSay|microscopeSpeciesText|gameLang/);
    const game = Object.create(ctx.Game.prototype);
    const entry = inLang('ES', () => game.bestiaryEntry('tardigrade'));
    assert.equal(entry.name, 'Tardigrade');
    assert.equal(entry.description, def.fact);
    assert.equal(entry.habitat, def.where);
    assert.match(entry.hint, /^Only a microscope shows it/);
    inLang('ES', () => assert.equal(ctx.microscopeSpeciesText('tardigrade').name, 'Tardígrado'));
});

test('every item the panel can name has a Spanish name', () => {
    const named = new Set(ctx.MICROSCOPE_KIT.map(([type]) => type));
    for (const type of Object.keys(ctx.MICRO_ITEMS)) if (type !== 'cheek') named.add(type);
    for (const [habitat, variants] of Object.entries(ctx.MICRO_SAMPLES)) {
        for (const { letter } of variants) named.add(ctx.microscopeSampleId(habitat, letter));
    }
    // The filters and wools, by the colours decor.js makes.
    const decor = read('game/decor.js');
    const table = decor.slice(decor.indexOf('const DECOR_GLASS'), decor.indexOf('];', decor.indexOf('const DECOR_GLASS')));
    const colors = [...table.matchAll(/\['([a-z_]+)', 0x/g)].map((match) => match[1]);
    assert.equal(colors.length, 16);
    for (const color of colors) {
        for (const kind of ['stained_glass', 'stained_glass_pane', 'wool']) named.add(`${color}_${kind}`);
    }
    // What can light the mirror: every block that gives light.
    // The bulb and the grow lamp are made from a table of electricity.js, not one call each.
    for (const type of ['torch', 'light_bulb', 'grow_lamp']) named.add(type);
    for (const file of ['furniture.js', 'smelters.js', 'electricity.js']) {
        const text = read(`game/${file}`);
        for (const match of text.matchAll(/(?:furnBlock|registerBlockType)\('([a-z_]+)'[\s\S]*?\n\}\);/g)) {
            if (match[0].includes('lightEmission')) named.add(match[1]);
        }
    }
    for (const type of ['light_bulb', 'grow_lamp', 'electric_lamp', 'candle', 'lantern', 'oven', 'foundry', 'arc_furnace', 'chandelier', 'floor_lamp', 'table_lamp']) assert.ok(named.has(type), `${type} is looked at`);
    // What is only in the kit and never named by the panel.
    for (const type of ['microscope', 'moss']) named.delete(type);
    for (const type of named) assert.ok(ctx.microscopeItemNameEs(type), `${type} has no Spanish name`);
    assert.equal(ctx.microscopeItemNameEs('sample_forest_lake_b'), 'Muestra de lago de bosque B');
    assert.equal(ctx.microscopeItemNameEs('red_stained_glass'), 'Vidriera roja');
    assert.equal(ctx.microscopeItemNameEs('red_stained_glass_pane'), 'Panel de vidriera roja');
    assert.equal(ctx.microscopeItemNameEs('white_wool'), 'Lana blanca');
    assert.equal(ctx.microscopeItemNameEs('no_such_thing'), null);
});

test('every refusal of the server is said, in both languages', () => {
    const go = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'microscope.go'), 'utf8');
    const reasons = new Set([...go.matchAll(/(?:Reason: |refuse\()"([a-z ]+)"/g)].map((match) => match[1]));
    reasons.add('lost');
    assert.ok(reasons.size >= 9, [...reasons].join());
    for (const reason of reasons) {
        for (const op of ['prepare', 'stain', 'capture']) {
            const en = ctx.microscopeRefusalLine(op, reason);
            const es = inLang('ES', () => ctx.microscopeRefusalLine(op, reason));
            assert.ok(en && es, `${op} ${reason}`);
            assert.notEqual(en, es, `${op} ${reason}`);
            assert.notEqual(en, ctx.MICROSCOPE_TEXT.refusedOther.EN, `${reason} has its own line`);
        }
    }
    assert.equal(ctx.microscopeRefusalLine('prepare', ''), '');
    assert.equal(ctx.microscopeRefusalLine('prepare', 'something new'), ctx.MICROSCOPE_TEXT.refusedOther.EN, 'a reason to come is never shown raw');
    inLang('ES', () => assert.match(ctx.microscopeRefusalLine('prepare', 'occupied'), /Ya hay un portaobjetos/));
});

// ---- Lines put together, in Spanish ----

test('the lines put together read right in Spanish', () => {
    inLang('ES', () => {
        assert.match(ctx.microscopeDarkLine(null), /necesita luz/);
        assert.match(ctx.microscopeDarkLine('Bombilla'), /^La bombilla de al lado no tiene corriente/);
        assert.match(ctx.microscopeStainWarning('methylene_blue'), /núcleos.*fija el portaobjetos para siempre.*no volverá con una gota/);
        assert.match(ctx.microscopeSlideLine({ stain: 'iodine_tincture' }, 30), /^Teñido con Tintura de yodo y fijado/);
        assert.match(ctx.microscopeSlideLine({}, 10), /^Recién hecho/);
        assert.match(ctx.microscopeSlideLine({ revived: true }, 10), /^Mojado otra vez/);
        assert.match(ctx.microscopeSlideLine({}, 300), /se ha secado/);
        assert.match(ctx.microscopeSlideLine({}, 5, 5), /barrilito se está abriendo \(15 s\)/);
        assert.match(ctx.microscopeTardigradeLine({ action: 'tun' }), /criptobiosis/);
        assert.match(ctx.microscopeDarkfieldLine({ source: 'lamp', level: 0.7, name: 'Bombilla' }), /muy tenue.*\(bombilla\)/);
        assert.match(ctx.microscopeDarkfieldLine({ source: 'sun', level: 1, name: 'daylight' }), /luz del día/);
        assert.match(ctx.microscopeDarkfieldLine(null), /sin luz/);
        const orange = [0xff, 0xa3, 0x4a];
        assert.match(ctx.microscopeFilterLine('Vidriera naranja', orange, 'methylene_blue'), /^Vidriera naranja: el azul de metileno se ve más oscuro/);
        assert.match(ctx.microscopeFilterLine('Vidriera azul', [0x52, 0x72, 0xff], 'methylene_blue'), /se apaga/);
        assert.match(ctx.microscopeFilterLine('Vidriera azul', [0x52, 0x72, 0xff], ''), /solo deja pasar la luz de su color/);
        assert.match(ctx.microscopeStainNote('animal_cell', 'methylene_blue'), /núcleo azul oscuro/);
    });
    assert.match(ctx.microscopeDarkLine(null), /needs light/);
    assert.equal(ctx.microscopeStainText('methylene_blue').the, 'Methylene Blue');
});

// ---- Nothing written straight into the code ----

test('the panel\'s code writes no words of its own: they all come from the tables', () => {
    const code = read('game/microscope.js');
    const panel = code.slice(code.indexOf('Object.assign(Game.prototype, {'), code.indexOf('registerModalPanel({'));
    // Every text it sets is a table's, or a number or a name it was given.
    for (const match of panel.matchAll(/\.(?:textContent|title)\s*=\s*(['"`])(.*?)\1\s*[;,]/g)) {
        assert.ok(match[2] === '' || !/[A-Za-z]{3}/.test(match[2].replace(/\$\{[^}]*\}/g, '')), `written in the code: ${match[0]}`);
    }
    for (const match of panel.matchAll(/microscopeNote\s*=\s*(['"`])(.+?)\1/g)) assert.fail(`a note written in the code: ${match[0]}`);
    for (const match of panel.matchAll(/receiveSystemMessage\(\{ text: (['"`])(.+?)\1/g)) {
        assert.match(match[2], /^Unknown command/, `a message written in the code: ${match[0]}`);
    }
    // And the words in the page itself, between its tags.
    const html = panel.slice(panel.indexOf('panel.innerHTML = `'), panel.indexOf('document.body.appendChild(panel)'));
    const words = html.replace(/<[^>]*>/g, ' ').replace(/\$\{[\s\S]*?\}\s*\)?\.?[a-z]*\(?['"]?['"]?\)?\}?/g, ' ');
    assert.doesNotMatch(words, /[A-Za-z]{3,} [A-Za-z]{2,}/, 'a sentence in the page');
    assert.doesNotMatch(html, /title="[A-Za-z]/, 'a tooltip in the page');
    // The helpers too: from the requests to the end of the pure part, only keys.
    const helpers = code.slice(code.indexOf('// What each reason of the server'), code.indexOf('// The field (a canvas context'));
    assert.doesNotMatch(helpers, /return `[^`]*[a-z]{3} [a-z]{2,}/, 'a sentence in a helper');
    assert.doesNotMatch(helpers, /return '[A-Z][a-z]+ /, 'a sentence in a helper');
});

test('the Spanish uses the guide\'s words', () => {
    const guide = fs.readdirSync(path.join(STATIC, 'guide'));
    const es = (page) => fs.readFileSync(path.join(STATIC, 'guide', guide.find((name) => name.startsWith(`${page}_ES_`))), 'utf8').toLowerCase();
    const words = es(238) + es(241) + es(246) + es(247);
    for (const word of ['portaobjetos', 'platina', 'tinción', 'campo oscuro', 'diafragma', 'barrilito', 'farol', 'vela', 'bombilla', 'frotis', 'vidriera']) {
        assert.ok(words.includes(word), `the guide says ${word}`);
        const said = JSON.stringify(Object.fromEntries(Object.entries(ctx.MICROSCOPE_TEXT).map(([key, value]) => [key, String(value.ES)])))
            + JSON.stringify(vm.runInContext('MICROSCOPE_ITEMS_ES', ctx)) + JSON.stringify(ctx.MICRO_SPECIES_ES);
        assert.ok(said.toLowerCase().includes(word) || word === 'vidriera', `the panel says ${word}`);
    }
});
