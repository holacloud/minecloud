// Node tests for the guide's shared Markdown renderer (js/guideMarkdown.js), used by the
// in-game book (js/game/guide.js) and the printable guide (js/guidePrint.js).
// Run with: node --test test/js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const GUIDE = path.join(STATIC, 'guide');
const shared = require(path.join(STATIC, 'js', 'guideMarkdown.js'));

// The game's guide.js mixed into a stub Game, with the shared renderer as index.html loads it.
function loadBook(guideSource, withShared) {
    const context = vm.createContext({ console, Map, Set, Object, Array, String, Number, RegExp });
    vm.runInContext(`class Game {}
        function registerModalPanel() {}
        function registerGameContent() {}
        function getMobSpecies(species) { return { species }; }`, context);
    if (withShared) vm.runInContext(fs.readFileSync(path.join(STATIC, 'js', 'guideMarkdown.js'), 'utf8'), context);
    vm.runInContext(guideSource, context, { filename: 'guide.js' });
    const book = vm.runInContext('Object.create(Game.prototype)', context);
    // Item icons and mob portraits as recognisable fake URLs.
    book.world = { blockTypes: new Proxy({}, { get: (_t, key) => (String(key).startsWith('no_') ? undefined : {}) }), getInventoryIconUrl: (type) => `icon:${type}` };
    book.bestiaryPortraits = new Map();
    book.bestiaryRenderPortrait = (species) => `portrait:${species}`;
    return book;
}

function guidePages() {
    return fs.readdirSync(GUIDE).filter((name) => name.endsWith('.md') && name !== 'README.md')
        .map((name) => ({ name, source: fs.readFileSync(path.join(GUIDE, name), 'utf8') }));
}

const SAMPLE = [
    '# Title *one*', '', 'Text with **bold**, _em_, `co*de*`, [page 12](12), [code](27a2), [web](https://x.y) and ![i](item:torch).',
    '', '![A sheep](mob:sheep)', '![Book](img/book.png "Caption")', '![Odd](mob:Bad)', '',
    '- one', '  - nested ![x](item:no_such)', '  continued', '- two', '', '1. first', '2) second', '',
    '| A | B |', '|---|---|', '| ![s](mob:sheep) | [p](007) |', '', '> quote', '> - in list', '', '---', 'end <tag> & "q"'
].join('\n');

test('the shared renderer gives the same HTML as the in-game book always gave', (t) => {
    let oldSource;
    try {
        oldSource = execFileSync('git', ['show', '37ef7e1:pkg/web/static/js/game/guide.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (_error) {
        t.skip('git history not available');
        return;
    }
    const before = loadBook(oldSource, false);
    const after = loadBook(fs.readFileSync(path.join(STATIC, 'js', 'game', 'guide.js'), 'utf8'), true);
    const pages = guidePages();
    assert.ok(pages.length > 100);
    for (const page of [...pages, { name: 'sample', source: SAMPLE }]) {
        assert.equal(after.guideMarkdown(page.source), before.guideMarkdown(page.source), page.name);
    }
    for (const raw of ['007', '12', '27a2', 'UR29', '', 'too-long!', '123456789']) {
        assert.equal(after.guidePageId(raw), before.guidePageId(raw), raw);
    }
});

test('without an asset hook, mob: and item: sources are kept for the caller to draw', () => {
    const html = shared.createGuideMarkdown().markdown('![A sheep](mob:sheep)\n\nA ![t](item:torch) and ![b](img/book.png).');
    assert.match(html, /<img src="mob:sheep" alt="A sheep">/);
    assert.match(html, /<img src="item:torch" alt="t">/);
    assert.match(html, /<img src="guide\/img\/book.png" alt="b">/);
});

test('page ids: numbers lose their zeros, codes are capitals', () => {
    assert.equal(shared.guidePageIdOf('007'), '7');
    assert.equal(shared.guidePageIdOf(' c0m3t '), 'C0M3T');
    assert.equal(shared.guidePageIdOf('no!'), null);
});
