// Node tests for the printable guide (guide-print.html, js/guidePrint.js): which pages it
// prints (never the secret ones), its table of contents, and that the game scripts it runs
// without a game load over a stub `class Game {}` and know every mob and item the pages draw.
// Run with: node --test test/js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const GUIDE = path.join(STATIC, 'guide');
const print = require(path.join(STATIC, 'js', 'guidePrint.js'));

// What /guide/index.json lists (pkg/web/guide.go), built from the file names.
function guideIndex() {
    return fs.readdirSync(GUIDE).map((name) => name.match(/^([0-9A-Z]{1,8})_(EN|ES)_(.+)\.md$/)).filter(Boolean)
        .map(([name, raw, lang, title]) => {
            const secret = !/^\d+$/.test(raw);
            return { page: secret ? raw : String(Number(raw)), secret, lang, title: title.replace(/_/g, ' '), path: `guide/${name}` };
        });
}

function publicSources() {
    return fs.readdirSync(GUIDE).filter((name) => /^\d+_(EN|ES)_.+\.md$/.test(name)).map((name) => fs.readFileSync(path.join(GUIDE, name), 'utf8'));
}

test('only public pages are printed, in numeric order, falling back to the other language', () => {
    const index = guideIndex();
    assert.ok(index.some((entry) => entry.secret), 'the guide has secret pages to leave out');
    for (const lang of ['ES', 'EN']) {
        const pages = print.publicPages(index, lang);
        assert.ok(pages.length > 200);
        assert.ok(pages.every((page) => /^\d+$/.test(page.id)));
        assert.deepEqual(pages.map((page) => page.number), [...pages.map((page) => page.number)].sort((a, b) => a - b));
        assert.ok(pages.every((page) => page.lang === lang && !page.fallback), `every page exists in ${lang}`);
    }
    const pages = print.publicPages([
        { page: '2', lang: 'EN', title: 'Two', path: 'b' }, { page: '1', lang: 'ES', title: 'Uno', path: 'a' },
        { page: '1', lang: 'EN', title: 'One', path: 'c' }, { page: 'UR29', secret: true, lang: 'ES', title: 'S', path: 'd' }
    ], 'ES');
    assert.deepEqual(pages.map((page) => [page.id, page.title, page.fallback]), [['1', 'Uno', false], ['2', 'Two', true]]);
});

test('the table of contents lists every public page once, and nothing secret', () => {
    for (const lang of ['ES', 'EN']) {
        const pages = print.publicPages(guideIndex(), lang);
        const sections = print.sectionsFor(pages, lang);
        assert.deepEqual(sections.flatMap((section) => section.pages.map((page) => page.id)), pages.map((page) => page.id));
        assert.ok(sections.every((section) => section.title));
    }
    const secretCodes = guideIndex().filter((entry) => entry.secret).map((entry) => entry.page);
    const toc = JSON.stringify(print.sectionsFor(print.publicPages(guideIndex(), 'ES'), 'ES'));
    for (const code of secretCodes) assert.ok(!toc.includes(code), code);
});

test('pagination: blocks flow into sheets and every chapter starts a new one', () => {
    const { sheets, starts } = print.paginate([
        { blocks: [{ height: 40 }, { height: 50 }, { height: 30 }] },
        { blocks: [{ height: 10 }] },
        { blocks: [{ height: 150 }, { height: 20 }] }
    ], 100);
    // Sheet 1 is the cover: the chapters start on sheets 2, 4 and 5.
    assert.deepEqual(starts, [2, 4, 5]);
    assert.deepEqual(sheets.map((sheet) => [sheet.number, sheet.chapter, sheet.pieces.map((piece) => piece.block)]),
        [[2, 0, [0, 1]], [3, 0, [2]], [4, 1, [0]], [5, 2, [0]], [6, 2, [1]]]);
});

test('pagination: tables split between rows (the header repeats), lists between items', () => {
    const table = { height: 4 + 10 + 6 * 20, chrome: 4, head: 10, rows: [20, 20, 20, 20, 20, 20] };
    const sheets = print.paginateChapter([{ height: 30 }, table, { height: 5 }], 100);
    // 30 used: 4 + 10 + 2 rows = 54 fits (a third would not); the other 4 rows go on with the
    // header again (4 + 10 + 80 = 94), and the 5 after them still fit.
    assert.deepEqual(sheets, [[{ block: 0 }, { block: 1, from: 0, to: 2 }], [{ block: 1, from: 2, to: 6 }, { block: 2 }]]);
    const list = { height: 2 + 5 * 30, chrome: 2, items: [30, 30, 30, 30, 30] };
    assert.deepEqual(print.paginateChapter([{ height: 50 }, list], 100), [[{ block: 0 }, { block: 1, from: 0, to: 1 }], [{ block: 1, from: 1, to: 4 }], [{ block: 1, from: 4, to: 5 }]]);
    // A row taller than a sheet still gets printed, alone.
    assert.deepEqual(print.paginateChapter([{ height: 10, chrome: 0, head: 5, rows: [200, 10] }], 100), [[{ block: 0, from: 0, to: 1 }], [{ block: 0, from: 1, to: 2 }]]);
});

test('pagination: headings are never left alone at the bottom of a sheet', () => {
    const heading = { height: 10, keepWithNext: true };
    // 85 used; the heading (10) fits but the paragraph after it (20) does not: both move on.
    assert.deepEqual(print.paginateChapter([{ height: 85 }, heading, { height: 20 }], 100), [[{ block: 0 }], [{ block: 1 }, { block: 2 }]]);
    // Two headings in a row travel together with the first row of the table that follows.
    const table = { height: 60, chrome: 0, head: 10, rows: [25, 25] };
    assert.deepEqual(print.paginateChapter([{ height: 50 }, heading, heading, table], 100),
        [[{ block: 0 }], [{ block: 1 }, { block: 2 }, { block: 3, from: 0, to: 2 }]]);
    // A heading followed by something taller than any sheet stays where it fits.
    assert.deepEqual(print.paginateChapter([{ height: 50 }, heading, { height: 300 }], 100), [[{ block: 0 }, { block: 1 }], [{ block: 2 }]]);
    // A figure (atomic) never splits: it moves to the next sheet whole.
    assert.deepEqual(print.paginateChapter([{ height: 60 }, { height: 60 }], 100), [[{ block: 0 }], [{ block: 1 }]]);
});

// Browser stand-ins loose enough for the scripts to load and draw into nothing.
function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}
function canvasStub() {
    const ctx = new Proxy({}, {
        get: (target, key) => (key in target ? target[key] : () => ({ data: new Uint8ClampedArray(4 * 4096 * 16), addColorStop() {} })),
        set: (target, key, value) => { target[key] = value; return true; }
    });
    return { width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,' };
}

test('the game scripts run without a game and know every mob and item the pages draw', () => {
    const context = vm.createContext({
        console: { ...console, warn() {} }, Math, Map, Set, Object, Array, JSON, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array,
        Int8Array, Int16Array, Int32Array, Float32Array, Float64Array,
        performance: { now: () => 0 }, THREE: anyStub(), navigator: {}, requestAnimationFrame: () => 0,
        Worker: class { postMessage() {} terminate() {} },
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; } },
        document: { createElement: (tag) => (tag === 'canvas' ? canvasStub() : anyStub()), addEventListener() {}, body: anyStub(), head: anyStub(), getElementById: () => null, querySelector: () => null }
    });
    context.window = context;
    vm.runInContext('class Game {}', context);
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1])
        .filter((src) => !/^(https?:)?\/\//.test(src) && !print.SKIP_SCRIPTS.test(src));
    assert.ok(scripts.includes('js/world.js') && scripts.includes('js/game/bestiary.js'));
    assert.ok(!scripts.includes('js/game.js') && !scripts.includes('js/game/guide.js'));
    for (const src of scripts) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    vm.runInContext('this.printWorld = new WorldRenderer({}); this.printGame = Game; this.printModels = VoxelModels;', context);

    const refs = (kind) => new Set(publicSources().flatMap((source) => [...source.matchAll(new RegExp(`\\]\\(${kind}:([a-z0-9_]+)\\)`, 'g'))].map((match) => match[1])));
    for (const item of refs('item')) {
        assert.ok(context.printWorld.blockTypes[item], `item:${item}`);
        assert.doesNotThrow(() => context.printWorld.getInventoryIconUrl(item), `icon of ${item}`);
    }
    for (const species of refs('mob')) assert.ok(context.printModels.mobBuilders[species], `mob:${species}`);
    assert.equal(typeof context.printGame.prototype.bestiaryRenderPortrait, 'function');
});

// Stacks a booklet's folios, folds them and reads it like a book: the outer folio's front right
// half is the first page; then each spread is (back left of folio i, ...) down to the centre.
function readFolded(booklet) {
    const n = booklet.folios;
    const fronts = booklet.sides.filter((side) => !side.back);
    const backs = booklet.sides.filter((side) => side.back);
    const order = [];
    for (let i = 0; i < n; i++) order.push(fronts[i].right, backs[i].left);
    for (let i = n - 1; i >= 0; i--) order.push(backs[i].right, fronts[i].left);
    return order;
}

test('booklet imposition: folded folios read in order, the last booklet only as long as needed', () => {
    const booklets = print.bookletImposition(24, 6);
    assert.equal(booklets.length, 1);
    assert.equal(booklets[0].folios, 6);
    // Outer folio: 24 | 1 on the front, 2 | 23 on the back (1-based).
    assert.deepEqual(booklets[0].sides[0], { folio: 0, back: false, left: 23, right: 0 });
    assert.deepEqual(booklets[0].sides[1], { folio: 0, back: true, left: 1, right: 22 });
    assert.deepEqual(readFolded(booklets[0]), [...Array(24).keys()]);

    const many = print.bookletImposition(57, 6);
    assert.deepEqual(many.map((booklet) => booklet.folios), [6, 6, 3]);
    assert.deepEqual(many.map((booklet) => booklet.first), [0, 24, 48]);
    const pages = many.flatMap(readFolded);
    // Every page once, in order, then the blanks at the very end of the last booklet.
    assert.deepEqual(pages.slice(0, 57), [...Array(57).keys()]);
    assert.deepEqual(pages.slice(57), [null, null, null]);
    for (const booklet of many) assert.equal(booklet.sides.length, booklet.folios * 2);
    assert.deepEqual(print.bookletImposition(0, 6), []);
    assert.deepEqual(print.bookletImposition(1, 6)[0].sides[0], { folio: 0, back: false, left: null, right: 0 });
});
