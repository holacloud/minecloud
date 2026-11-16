// Node tests for the words of the in-game guide (pkg/web/static/guide/): an entry of the guide is a
// "tema" / "topic", and "página" / "page" is only a page of paper of the printed book, the browser's
// page or the bestiary's own last page. Every topic, secret ones included, and every chapter of
// guide/volumes/ are read; the guide's README.md is the developers' and is left alone.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const GUIDE = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'guide');
const VOLUMES = path.join(GUIDE, 'volumes');

// The only places where a Spanish text may say "página": each fragment is removed from a line
// before the line is searched, so it must be long enough to keep its sense.
const ALLOWED_ES = [
    'recargar la página', // the browser's page, which a reload loses (cages, jars, a dog's friendship)
    'páginas por hoja', // the print dialog's option, "2 páginas por hoja" (topic 1)
    'página de papel', // one side of paper of the printed book (topic 1)
    'páginas de papel', // the same, in the plural (topic 1)
    'su última página' // the bestiary's own last page, where its secret code is written (topics 5 and M0LE)
];

// The same for an English text and the word "page".
const ALLOWED_EN = [
    'the page reloads', // the browser's page, which a reload loses (cages, jars, a dog's friendship)
    'pages per sheet', // the print dialog's option, "2 pages per sheet" (topic 1)
    'page of paper', // one side of paper of the printed book (topic 1)
    'pages of paper', // the same, in the plural (topic 1)
    'its last page' // the bestiary's own last page, where its secret code is written (topics 5 and M0LE)
];

const WORD = {
    ES: { pattern: /p[áa]ginas?/i, allowed: ALLOWED_ES, advice: 'a topic of the guide is a "tema" (masculine: el tema, este tema); "página" is only a page of paper' },
    EN: { pattern: /\bpages?\b/i, allowed: ALLOWED_EN, advice: 'a topic of the guide is a "topic"; "page" is only a page of paper' }
};

// Every text a player reads: { file, language, text }.
function guideTexts() {
    const texts = [];
    for (const name of fs.readdirSync(GUIDE)) {
        const match = /^[0-9A-Z]+_(ES|EN)_.+\.md$/.exec(name);
        if (match) texts.push({ file: name, language: match[1], text: fs.readFileSync(path.join(GUIDE, name), 'utf8') });
    }
    for (const name of fs.readdirSync(VOLUMES)) {
        const match = /_(ES|EN)\.md$/.exec(name);
        if (match) texts.push({ file: 'volumes/' + name, language: match[1], text: fs.readFileSync(path.join(VOLUMES, name), 'utf8') });
    }
    return texts;
}

const TEXTS = guideTexts();

test('the guide is found: topics in both languages and the chapters of the volumes', () => {
    assert.ok(TEXTS.filter((t) => t.language === 'ES' && !t.file.startsWith('volumes/')).length > 200, 'Spanish topics');
    assert.ok(TEXTS.filter((t) => t.language === 'EN' && !t.file.startsWith('volumes/')).length > 200, 'English topics');
    assert.ok(TEXTS.some((t) => t.file.startsWith('volumes/')), 'chapters of the volumes');
});

test('no topic and no chapter calls a topic a "página" / "page"', () => {
    const problems = [];
    for (const { file, language, text } of TEXTS) {
        const word = WORD[language];
        text.split('\n').forEach((line, index) => {
            let rest = line;
            for (const phrase of word.allowed) rest = rest.split(phrase).join(' ');
            if (word.pattern.test(rest)) problems.push(`${file}:${index + 1}: ${line.trim()}\n    (${word.advice})`);
        });
    }
    assert.equal(problems.join('\n'), '');
});

test('every allowed phrase is still used by some text, so the lists do not rot', () => {
    for (const language of ['ES', 'EN']) {
        for (const phrase of WORD[language].allowed) {
            assert.ok(TEXTS.some((t) => t.language === language && t.text.includes(phrase)), `${language}: nothing says "${phrase}" any more: take it out of the list`);
        }
    }
});

// The game's own words for the guide (js/game/guide.js): the book's strings, read from its source
// and run in a box of their own, functions called with a number as the book calls them.
const GAME = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js', 'game');

function guideTextStrings() {
    const source = fs.readFileSync(path.join(GAME, 'guide.js'), 'utf8');
    const match = /const GUIDE_TEXT = (\{[\s\S]*?\n\});/.exec(source);
    assert.ok(match, 'GUIDE_TEXT is found in js/game/guide.js');
    const table = require('node:vm').runInNewContext(`(${match[1]})`, {});
    const strings = [];
    for (const language of Object.keys(table)) {
        for (const [key, value] of Object.entries(table[language])) {
            strings.push({ language, key, text: typeof value === 'function' ? String(value('12')) : String(value) });
        }
    }
    return strings;
}

test('no string of the book (GUIDE_TEXT) calls a topic a "página" / "page"', () => {
    const strings = guideTextStrings();
    assert.ok(strings.some((s) => s.language === 'ES') && strings.some((s) => s.language === 'EN'), 'both languages');
    const problems = strings.filter(({ language, text }) => WORD[language].pattern.test(text))
        .map(({ language, key, text }) => `${language}.${key}: ${text}\n    (${WORD[language].advice})`);
    assert.equal(problems.join('\n'), '');
});

// How a line of js/game names a topic the old way: by its number ("página 116", "page 116") or as a page of
// the guide ("la página de Genética de la guía", "the Genetics page of the guide", "a guide page").
const GAME_LINE_OLD_WORDS = [
    /p[áa]ginas? \d/i,
    /\bpages? \d/i,
    /p[áa]ginas?\b[^.;:]{0,40}\bde (la|esta) gu[íi]a/i,
    /\bpages?\b[^.;:]{0,40}\b(of|in) (the|this) guide\b/i,
    /\bguide(['’]s)? pages?\b/i
];

test('the patterns for the old word catch a sign that says it without a number, and leave a topic alone', () => {
    const old = (line) => GAME_LINE_OLD_WORDS.some((pattern) => pattern.test(line));
    assert.ok(old('prueba el cuaderno de cría y la página de Genética de la guía.'));
    assert.ok(old('try the breeding notebook and the Genetics page of the guide.'));
    assert.ok(old('// see guide page 251'));
    assert.ok(!old('prueba el cuaderno de cría y el tema de Genética de la guía.'));
    assert.ok(!old('try the breeding notebook and the Genetics topic of the guide.'));
    assert.ok(!old('it lasts until the page reloads; the guide says so'));
});

test('no file of js/game sends the player to "página 116" / "page 116" or to a "page of the guide" (a sign, a legend, a hint)', () => {
    const problems = [];
    const files = fs.readdirSync(GAME).filter((name) => name.endsWith('.js'));
    assert.ok(files.length > 50, 'the files of js/game are found');
    for (const name of files) {
        fs.readFileSync(path.join(GAME, name), 'utf8').split('\n').forEach((line, index) => {
            // Every line, comments too: the developers call a topic a topic as well.
            if (GAME_LINE_OLD_WORDS.some((pattern) => pattern.test(line))) problems.push(`js/game/${name}:${index + 1}: ${line.trim()}`);
        });
    }
    assert.equal(problems.join('\n'), '', 'a topic of the guide is a "tema" / "topic"');
});
