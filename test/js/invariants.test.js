// Node tests for what nothing else checks about the game as a whole, each a mistake that makes no noise
// when it is made: a method named like another, a script nobody loads, a wrap around a method that is no
// longer there, a message the server does not know, a guide page in one language only.
// Run with: node --test test/js/invariants.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const JS = path.join(STATIC, 'js');
const GUIDE = path.join(STATIC, 'guide');
const NETWORK = path.join(ROOT, 'pkg', 'network');

function walk(dir, ext) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full, ext);
        return entry.name.endsWith(ext) ? [full] : [];
    });
}

const rel = (file) => path.relative(STATIC, file).split(path.sep).join('/');
const scripts = walk(JS, '.js');
const sourceOf = Object.fromEntries(scripts.map((file) => [rel(file), fs.readFileSync(file, 'utf8')]));
const pages = fs.readdirSync(STATIC).filter((name) => name.endsWith('.html'));
const htmlOf = Object.fromEntries(pages.map((name) => [name, fs.readFileSync(path.join(STATIC, name), 'utf8')]));
const scriptsOf = (html) => [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((match) => match[1]);
const gameScripts = scriptsOf(htmlOf['index.html']);

// ---- The methods of Game ----

// Every method of Game: those of the class (js/game.js) and those each file mixes in with
// Object.assign(Game.prototype, { ... }). All of them are written at four spaces.
function gameMethods() {
    const found = [];
    for (const src of gameScripts) {
        const lines = sourceOf[src].split('\n');
        let inside = false;
        lines.forEach((line, i) => {
            if (/^class Game\b/.test(line) || /Object\.assign\(Game\.prototype, \{\s*$/.test(line)) inside = true;
            else if (/^\}\)?;?\s*$/.test(line)) inside = false;
            if (!inside) return;
            const match = /^ {4}(?:async )?([A-Za-z_$][\w$]*)\([^)]*\) \{/.exec(line);
            if (match && match[1] !== 'constructor') found.push({ name: match[1], where: `${src}:${i + 1}` });
        });
    }
    return found;
}

const methods = gameMethods();
const methodNames = new Set(methods.map((method) => method.name));

test('the methods of Game are found where they are written', () => {
    assert.ok(methods.length > 1000, `only ${methods.length} methods found: has the way they are written changed?`);
    for (const name of ['init', 'initNetwork', 'placeBlockForAll', 'crabUpdate', 'claimsInit', 'copperGolemUpdate']) assert.ok(methodNames.has(name), name);
});

test('no two methods of Game have the same name: the second would silently replace the first', () => {
    const seen = new Map();
    const twice = [];
    for (const { name, where } of methods) {
        if (seen.has(name)) twice.push(`${name}: ${seen.get(name)} and ${where}`);
        else seen.set(name, where);
    }
    assert.deepEqual(twice, [], 'prefix a method with the name of its feature');
});

test('a method wrapped by another file exists: a wrap around a renamed method does nothing, and says nothing', () => {
    const missing = [];
    for (const src of gameScripts) {
        const source = sourceOf[src];
        const wrapped = [
            ...source.matchAll(/^\s*const \w+ = (?:Game\.prototype|proto)\.([A-Za-z_$][\w$]*);/gm),
            ...source.matchAll(/^\s*wrap\('([A-Za-z_$][\w$]*)'/gm)
        ].map((match) => match[1]);
        for (const name of wrapped) if (!methodNames.has(name)) missing.push(`${src} wraps ${name}`);
    }
    assert.deepEqual(missing, []);
});

// ---- The scripts ----

test('every script a page asks for exists, and none is asked for twice', () => {
    for (const [page, html] of Object.entries(htmlOf)) {
        const asked = scriptsOf(html);
        for (const src of asked) assert.ok(sourceOf[src] !== undefined, `${page} asks for ${src}`);
        assert.deepEqual(asked.filter((src, i) => asked.indexOf(src) !== i), [], `${page} loads a script twice`);
    }
});

test('every file of js/game is loaded by index.html: a feature without its <script> does not exist', () => {
    const unlisted = Object.keys(sourceOf).filter((src) => src.startsWith('js/game/') && !gameScripts.includes(src));
    assert.deepEqual(unlisted, []);
});

test('every other script is used by something: a page, a worker, or another script that loads it', () => {
    const everything = Object.values(htmlOf).join('\n') + Object.values(sourceOf).join('\n');
    const unused = Object.keys(sourceOf).filter((src) => !everything.includes(`"${src}"`) && !everything.includes(`'/${src}'`) && !everything.includes(`'${src}'`));
    assert.deepEqual(unused, []);
});

test('the extension points load first, and every feature after the game', () => {
    assert.equal(gameScripts[0], 'js/extensions.js');
    const game = gameScripts.indexOf('js/game.js');
    gameScripts.forEach((src, i) => {
        if (src.startsWith('js/game/')) assert.ok(i > game, `${src} loads before js/game.js`);
    });
});

// ---- What the client says and the server knows ----

// The types a client may send: registerMessage(spec, "a", "b") in pkg/network, each in an init()
// (websocket.go shortens its own to nowhere(handler, "a")).
function serverMessages() {
    const known = new Set();
    for (const file of walk(NETWORK, '.go').filter((name) => !name.endsWith('_test.go'))) {
        const source = fs.readFileSync(file, 'utf8');
        for (const line of source.split('\n')) {
            // The types are the strings that end the call: one line, or the last of a handler written out.
            if (!/\b(registerMessage|nowhere)\(/.test(line) && !/^\s*(\}+,|"[A-Za-z]+",)/.test(line)) continue;
            const tail = /((?:(?:,|^)\s*"[A-Za-z]+")+)\)$/.exec(line);
            if (tail) for (const type of tail[1].matchAll(/"([A-Za-z]+)"/g)) known.add(type[1]);
        }
    }
    return known;
}

test('every message the game sends is one the server has a handler for', () => {
    const known = serverMessages();
    assert.ok(known.size > 30 && known.has('blockPlace') && known.has('chat'), `only ${[...known].join()} found`);
    // Chunks are asked for and answered apart from the rest, before the handlers (readPump, chunks.go).
    for (const type of ['chunkRequest', 'chunkFocus']) {
        assert.ok(fs.readFileSync(path.join(NETWORK, 'chunks.go'), 'utf8').includes(`case "${type}":`), type);
        known.add(type);
    }
    const unknown = [];
    for (const src of gameScripts) {
        for (const match of sourceOf[src].matchAll(/\b(?:network|this)\.send\(\s*'([A-Za-z]+)'/g)) {
            if (!known.has(match[1])) unknown.push(`${src} sends ${match[1]}`);
        }
    }
    assert.deepEqual([...new Set(unknown)], []);
});

// ---- The guide ----

const guidePages = fs.readdirSync(GUIDE).filter((name) => /^[0-9A-Z]+_(ES|EN)_.+\.md$/.test(name));
const idOf = (name) => name.split('_')[0].replace(/^0+(?=\d)/, '');
const langOf = (name) => name.split('_')[1];

test('every guide page exists once in Spanish and once in English', () => {
    assert.ok(guidePages.length > 400, `${guidePages.length} pages`);
    const strays = fs.readdirSync(GUIDE).filter((name) => name.endsWith('.md') && name !== 'README.md' && !guidePages.includes(name));
    assert.deepEqual(strays, [], 'not named ID_XX_TITLE.md');
    for (const lang of ['ES', 'EN']) {
        const ids = guidePages.filter((name) => langOf(name) === lang).map(idOf);
        assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], `two ${lang} pages with one id`);
    }
    const es = new Set(guidePages.filter((name) => langOf(name) === 'ES').map(idOf));
    const en = new Set(guidePages.filter((name) => langOf(name) === 'EN').map(idOf));
    assert.deepEqual([...es].filter((id) => !en.has(id)), [], 'only in Spanish');
    assert.deepEqual([...en].filter((id) => !es.has(id)), [], 'only in English');
});

test('every link from a guide page to another page leads to one, in its own language', () => {
    const broken = [];
    for (const lang of ['ES', 'EN']) {
        const ids = new Set(guidePages.filter((name) => langOf(name) === lang).map(idOf));
        for (const name of guidePages.filter((page) => langOf(page) === lang)) {
            const text = fs.readFileSync(path.join(GUIDE, name), 'utf8');
            for (const match of text.matchAll(/\]\(([0-9A-Z]{1,8})\)/g)) {
                if (!ids.has(match[1].replace(/^0+(?=\d)/, ''))) broken.push(`${name} -> ${match[1]}`);
            }
        }
    }
    assert.deepEqual(broken, []);
});

test('every public page has its row in the catalogue of the README, and the catalogue lists no page that is not there', () => {
    // (Ids are never reused, so a few are free: the numbers need not be consecutive.)
    const numbers = [...new Set(guidePages.map(idOf).filter((id) => /^\d+$/.test(id)).map(Number))].sort((a, b) => a - b);
    const readme = fs.readFileSync(path.join(GUIDE, 'README.md'), 'utf8');
    const rows = [...readme.matchAll(/^\| (\d+) \|/gm)].map((match) => Number(match[1]));
    // The curiosities (98 to 106) are listed by their own index, page 98, as the README says.
    assert.match(readme, /Page 98 is the curiosities index; curiosity pages follow from 99\./);
    const curiosity = (id) => id >= 98 && id <= 106;
    assert.deepEqual(numbers.filter((id) => !rows.includes(id) && !curiosity(id)), [], 'not in the catalogue');
    assert.deepEqual(rows.filter((id) => !numbers.includes(id)), [], 'in the catalogue, but there is no such page');
    assert.deepEqual(rows.filter((id, i) => rows.indexOf(id) !== i), [], 'twice in the catalogue');
});
