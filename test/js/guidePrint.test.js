// Node tests for the printable guide (guide-print.html, js/guidePrint.js): which topics it
// prints (never the secret ones), whole or by volumes (guide/volumes.json), its table of
// contents and index, how links cite topics, the covers, the report of pages, and that the game
// scripts it runs without a game load over a stub `class Game {}` and know every mob and item
// the topics and the covers draw.
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
const MANIFEST = JSON.parse(fs.readFileSync(path.join(GUIDE, 'volumes.json'), 'utf8'));

// What /guide/index.json lists (pkg/web/guide.go), built from the file names.
function guideIndex() {
    return fs.readdirSync(GUIDE).map((name) => name.match(/^([0-9A-Z]{1,8})_(EN|ES)_(.+)\.md$/)).filter(Boolean)
        .map(([name, raw, lang, title]) => {
            const secret = !/^\d+$/.test(raw);
            return { topic: secret ? raw : String(Number(raw)), secret, lang, title: title.replace(/_/g, ' '), path: `guide/${name}` };
        });
}

function publicSources() {
    return fs.readdirSync(GUIDE).filter((name) => /^\d+_(EN|ES)_.+\.md$/.test(name)).map((name) => fs.readFileSync(path.join(GUIDE, name), 'utf8'));
}

test('only public topics are printed, in numeric order, falling back to the other language', () => {
    const index = guideIndex();
    assert.ok(index.some((entry) => entry.secret), 'the guide has secret topics to leave out');
    for (const lang of ['ES', 'EN']) {
        const topics = print.publicTopics(index, lang);
        assert.ok(topics.length > 200);
        assert.ok(topics.every((topic) => /^\d+$/.test(topic.id)));
        assert.deepEqual(topics.map((topic) => topic.number), [...topics.map((topic) => topic.number)].sort((a, b) => a - b));
        assert.ok(topics.every((topic) => topic.lang === lang && !topic.fallback), `every topic exists in ${lang}`);
    }
    const topics = print.publicTopics([
        { topic: '2', lang: 'EN', title: 'Two', path: 'b' }, { topic: '1', lang: 'ES', title: 'Uno', path: 'a' },
        { topic: '1', lang: 'EN', title: 'One', path: 'c' }, { topic: 'UR29', secret: true, lang: 'ES', title: 'S', path: 'd' }
    ], 'ES');
    assert.deepEqual(topics.map((topic) => [topic.id, topic.title, topic.fallback]), [['1', 'Uno', false], ['2', 'Two', true]]);
});

test('the table of contents lists every public topic once, and nothing secret', () => {
    const rows = print.sectionRows(MANIFEST);
    for (const lang of ['ES', 'EN']) {
        const topics = print.publicTopics(guideIndex(), lang);
        const sections = print.sectionsFor(topics, lang, rows);
        assert.deepEqual(sections.flatMap((section) => section.topics.map((topic) => topic.id)), topics.map((topic) => topic.id));
        assert.ok(sections.every((section) => section.title));
        // Every public topic has a section of the manifest: none falls under "More topics" today.
        assert.deepEqual(sections.filter((section) => section.key === 'more').flatMap((section) => section.topics.map((topic) => topic.id)), []);
    }
    const secretCodes = guideIndex().filter((entry) => entry.secret).map((entry) => entry.topic);
    const toc = JSON.stringify(print.sectionsFor(print.publicTopics(guideIndex(), 'ES'), 'ES', rows));
    for (const code of secretCodes) assert.ok(!toc.includes(code), code);
    // A topic beyond every section still gets printed, under "More topics".
    const late = print.sectionsFor([{ id: '5', number: 5 }, { id: '900', number: 900 }], 'EN', [[0, 10, 'Lo básico', 'The basics']]);
    assert.deepEqual(late.map((section) => [section.title, section.topics.length]), [['The basics', 1], ['More topics', 1]]);
});

// ---- Volumes (guide/volumes.json)

// A manifest made here, so that closed and open volumes can both be tried.
function manifestOf(closed = [null, null, null]) {
    return {
        pages: { min: 250, max: 300 }, skip: [0], indexTopics: [0, 16],
        volumes: [
            { volume: 1, from: 0, to: 9, closed: closed[0], title: { ES: 'Uno', EN: 'One' }, sections: [[0, 4, 'A', 'A'], [5, 9, 'B', 'B']] },
            { volume: 2, from: 10, to: 19, closed: closed[1], title: { ES: 'Dos', EN: 'Two' }, sections: [[10, 19, 'C', 'C']] },
            { volume: 3, from: 20, to: null, closed: closed[2], title: { ES: 'Tres', EN: 'Three' }, sections: [[20, 25, 'D', 'D']] }
        ]
    };
}
const topicsOf = (numbers, lang = 'EN') => numbers.map((number) => ({ id: String(number), number, title: `${lang} topic ${number}`, lang }));

test('a volume prints its range, never a skipped nor a secret topic, and the volumes together print every public topic once', () => {
    const manifest = manifestOf();
    const topics = topicsOf([0, 1, 2, 9, 10, 15, 19, 22, 30, 99]);
    const ids = (volume) => print.volumeTopics(topics, manifest, volume).map((topic) => topic.id);
    assert.deepEqual(ids(1), ['1', '2', '9']);
    assert.deepEqual(ids(2), ['10', '15', '19']);
    assert.deepEqual(ids(3), ['22', '30', '99'], 'the last volume takes every topic from its from on');
    assert.deepEqual(ids(null), ['1', '2', '9', '10', '15', '19', '22', '30', '99'], 'the whole book skips topic 0 too');
    assert.ok(print.volumeOfTopic(manifest, 20).volume === 3 && print.volumeOfTopic(manifest, 19).volume === 2);
    assert.deepEqual([...print.skipOf(null)], ['0'], 'without the manifest topic 0 is still left out');

    for (const lang of ['ES', 'EN']) {
        const real = print.publicTopics(guideIndex(), lang);
        const printed = MANIFEST.volumes.flatMap((volume) => print.volumeTopics(real, MANIFEST, volume.volume).map((topic) => topic.id));
        assert.deepEqual(printed, print.volumeTopics(real, MANIFEST, null).map((topic) => topic.id), lang);
        assert.deepEqual(printed, real.filter((topic) => !MANIFEST.skip.includes(topic.number)).map((topic) => topic.id));
        assert.ok(printed.every((id) => /^\d+$/.test(id)), 'no secret topic');
        assert.ok(!printed.includes('0'), 'topic 0 is the generated contents on paper');
    }
});

test('the contents of a volume are its own sections, from the manifest', () => {
    const real = print.publicTopics(guideIndex(), 'ES');
    // What the manifest says today, whatever its cuts and titles are: the tests of the rules use manifestOf.
    const [, two, three] = MANIFEST.volumes;
    const second = print.sectionsFor(print.volumeTopics(real, MANIFEST, 2), 'ES', print.sectionRows(MANIFEST, 2));
    assert.equal(second[0].title, two.sections[0][2]);
    assert.equal(second[0].topics[0].id, print.volumeTopics(real, MANIFEST, 2)[0].id);
    assert.ok(second.every((section) => section.key !== 'more'));
    const third = print.sectionsFor(print.volumeTopics(real, MANIFEST, 3), 'EN', print.sectionRows(MANIFEST, 3));
    assert.deepEqual([third[0].title, third[third.length - 1].title], [three.sections[0][3], three.sections[three.sections.length - 1][3]]);
    assert.equal(print.sectionRows(MANIFEST).length, MANIFEST.volumes.reduce((sum, volume) => sum + volume.sections.length, 0));
});

test('a link cites the guide number: bare in its volume and in the whole book, with the volume elsewhere, with + when that one may still move', () => {
    const open = manifestOf();
    assert.equal(print.linkLabel(open, '5', 1), '5', 'same volume');
    assert.equal(print.linkLabel(open, '5', 2), '5 · vol. 1', 'an earlier volume');
    assert.equal(print.linkLabel(open, '25', 1), '25 · vol. 3+', 'a later volume that is not closed');
    assert.equal(print.linkLabel(open, '15', 1), '15 · vol. 2+');
    const closed = manifestOf(['2026-11-20', '2027-03-01', null]);
    assert.equal(print.linkLabel(closed, '15', 1), '15 · vol. 2', 'a later volume that is closed');
    assert.equal(print.linkLabel(closed, '25', 2), '25 · vol. 3+');
    assert.equal(print.linkLabel(closed, '5', 3), '5 · vol. 1');
    assert.equal(print.linkLabel(open, '25', null), '25', 'the whole book');
    assert.equal(print.linkLabel(open, '007', null), '7');
    assert.ok(print.linkLabel(open, '0', 1) === null && print.linkLabel(open, '0', null) === null, 'a skipped topic is plain words');
    assert.equal(print.linkLabel(null, '12', null), '12', 'without the manifest');
});

test('the alphabetical index lists the volumes up to the one printed, in the language\'s order', () => {
    const manifest = manifestOf();
    const topics = [
        { id: '0', number: 0, title: 'Índice' }, { id: '3', number: 3, title: 'Árbol' }, { id: '4', number: 4, title: 'zorro' },
        { id: '12', number: 12, title: 'Ñu' }, { id: '13', number: 13, title: 'nube' }, { id: '21', number: 21, title: 'Oso' }
    ];
    const second = print.indexEntries(topics, manifest, 2, 'ES');
    assert.deepEqual(second.map((entry) => entry.title), ['Árbol', 'nube', 'Ñu', 'zorro'], 'never topic 0, never a later volume');
    assert.deepEqual(second.map((entry) => entry.label), ['3 · vol. 1', '13', '12', '4 · vol. 1']);
    assert.deepEqual(second.map((entry) => entry.letter), ['A', 'N', 'N', 'Z']);
    assert.deepEqual(print.indexEntries(topics, manifest, 1, 'ES').map((entry) => entry.id), ['3', '4']);
    const whole = print.indexEntries(topics, manifest, null, 'EN');
    assert.equal(whole.length, 5);
    assert.ok(whole.every((entry) => entry.label === entry.id), 'just the number in the whole book');
    assert.equal(print.indexLetter('¿Qué?'), 'Q');
    assert.equal(print.indexLetter('3D'), '#');

    // The real guide: volume 1 indexes only its own topics, the last one every public topic.
    const real = print.publicTopics(guideIndex(), 'ES');
    const firstIds = print.indexEntries(real, MANIFEST, 1, 'ES').map((entry) => Number(entry.id));
    assert.ok(firstIds.length > 90 && firstIds.every((id) => id >= 1 && id <= 106));
    const last = MANIFEST.volumes[MANIFEST.volumes.length - 1].volume;
    assert.equal(print.indexEntries(real, MANIFEST, last, 'ES').length, print.volumeTopics(real, MANIFEST, null).length);
});

test('the covers: edition line, tab, topics and the whole book', () => {
    const closed = manifestOf(['2026-11-20', null, null]);
    assert.equal(print.editionLine(closed.volumes[0], 'ES', '2027-01-05'), 'Edición cerrada el 20 de noviembre de 2026', 'its own date, not today');
    assert.equal(print.editionLine(closed.volumes[0], 'EN', '2027-01-05'), 'Edition closed on 20 November 2026');
    assert.equal(print.editionLine(closed.volumes[1], 'ES', '2027-01-05'), 'Edición provisional · 5 de enero de 2027');
    assert.equal(print.editionLine(null, 'EN', '2027-01-05'), 'Provisional edition · 5 January 2027');
    assert.deepEqual([1, 2, 3, 7, 8, 9].map(print.tabTop), [16, 42, 68, 172, 16, 42], 'a staircase, back to the top after the seventh');
    assert.ok(print.tabTop(7) + 22 <= 210 - 7, 'the lowest tab ends above the bottom of the frame');

    const topics = topicsOf([1, 2, 30]);
    // The real manifest, whatever its cuts and titles are today.
    const two = MANIFEST.volumes[1];
    const second = print.coverModel(MANIFEST, two, topics, 'ES', '2026-11-15');
    assert.equal(second.numeral, '2');
    assert.equal(second.label, 'Volumen');
    assert.equal(second.title, two.title.ES);
    assert.equal(second.topics, `Temas ${two.from} a ${two.to} de la guía`);
    assert.equal(second.colour, two.colour);
    assert.equal(second.icons.length, 5);
    assert.equal(second.tabTop, 42);
    const open = MANIFEST.volumes[MANIFEST.volumes.length - 1];
    const last = print.coverModel(MANIFEST, open, topics, 'EN', '2026-11-15');
    assert.equal(last.topics, `Guide topics ${open.from} onwards`);
    assert.equal(last.edition, 'Provisional edition · 15 November 2026');
    const whole = print.coverModel(MANIFEST, null, topics, 'EN', '2026-11-15');
    assert.ok(whole.numeral === null && whole.tabTop === null && whole.hero === null, 'no numeral, no tab, the book picture');
    assert.equal(whole.title, 'The complete guide');
    assert.equal(whole.colour, '#6b4528');
    assert.equal(whole.topics, 'Guide topics 1 to 30');
    const icons = (n) => MANIFEST.volumes.map((volume) => volume.cover.icons[n]);
    assert.deepEqual(whole.icons, [...icons(0), ...icons(1)].slice(0, 5), 'the first item of each volume, then the second');
    assert.equal(print.coverModel(MANIFEST, { ...MANIFEST.volumes[0], colour: 'red;}' }, topics, 'ES', '2026-11-15').colour, '#6b4528', 'only a colour #rrggbb reaches the CSS');
});

test('the report of pages per volume: sections, sums, over the maximum, and one line per topic', () => {
    const manifest = manifestOf();
    manifest.pages.max = 10;
    const topics = topicsOf([0, 1, 2, 9, 10, 15, 22]);
    const pagesById = { 1: 3, 2: 4, 9: 5, 10: 2, 22: 1 };
    const summary = print.volumePages(manifest, topics, pagesById, 'EN');
    assert.deepEqual(summary.map((volume) => [volume.volume, volume.pages, volume.measured, volume.topics, volume.over]),
        [[1, 12, 3, 3, true], [2, 2, 1, 2, false], [3, 1, 1, 1, false]]);
    assert.deepEqual(summary[0].sections.map((section) => [section.title, section.from, section.to, section.pages]), [['A', 1, 2, 7], ['B', 9, 9, 5]]);
    const text = print.pagesReportText({ manifest, topics, pagesById, lang: 'EN', paper: 'A5', font: 'clear',
        shown: { volume: null, pages: 22, front: 4, guide: 15, back: 3 } });
    const lines = text.split('\n');
    assert.equal(lines[0], 'MineCloud printable guide: pages per volume');
    assert.ok(lines.includes('Language: EN') && lines.includes('Paper: A5') && lines.includes('Font: clear'));
    assert.ok(lines.includes('Shown: the whole book, 22 pages = 4 front + 15 of topics + 3 back'));
    assert.ok(lines.includes('Volume 1, topics 0 to 9, "One": 12 pages of topics (3 of 3 topics measured) OVER 10'));
    assert.ok(lines.includes('Volume 3, topics 20 onwards, "Three": 1 pages of topics (1 of 1 topics measured)'));
    assert.ok(lines.includes('  B, 9 to 9: 5 pages (1 of 1 topics)'));
    assert.ok(lines.includes('Volume 2, topics 10 to 19, "Two": 2 pages of topics (1 of 2 topics measured)'), 'what is not measured yet is said');
    const table = lines.slice(lines.indexOf('id\tpages') + 1).filter(Boolean);
    assert.deepEqual(table, ['1\t3', '2\t4', '9\t5', '10\t2', '22\t1']);
});

test('pagination: blocks flow into pages and every chapter starts a new one', () => {
    const { pages, starts } = print.paginate([
        { blocks: [{ height: 40 }, { height: 50 }, { height: 30 }] },
        { blocks: [{ height: 10 }] },
        { blocks: [{ height: 150 }, { height: 20 }] }
    ], 100);
    // Page 1 is the cover: the chapters start on pages 2, 4 and 5.
    assert.deepEqual(starts, [2, 4, 5]);
    assert.deepEqual(pages.map((page) => [page.number, page.chapter, page.pieces.map((piece) => piece.block)]),
        [[2, 0, [0, 1]], [3, 0, [2]], [4, 1, [0]], [5, 2, [0]], [6, 2, [1]]]);
});

test('pagination: tables split between rows (the header repeats), lists between items', () => {
    const table = { height: 4 + 10 + 6 * 20, chrome: 4, head: 10, rows: [20, 20, 20, 20, 20, 20] };
    const pages = print.paginateChapter([{ height: 30 }, table, { height: 5 }], 100);
    // 30 used: 4 + 10 + 2 rows = 54 fits (a third would not); the other 4 rows go on with the
    // header again (4 + 10 + 80 = 94), and the 5 after them still fit.
    assert.deepEqual(pages, [[{ block: 0 }, { block: 1, from: 0, to: 2 }], [{ block: 1, from: 2, to: 6 }, { block: 2 }]]);
    const list = { height: 2 + 5 * 30, chrome: 2, items: [30, 30, 30, 30, 30] };
    assert.deepEqual(print.paginateChapter([{ height: 50 }, list], 100), [[{ block: 0 }, { block: 1, from: 0, to: 1 }], [{ block: 1, from: 1, to: 4 }], [{ block: 1, from: 4, to: 5 }]]);
    // A row taller than a page still gets printed, alone.
    assert.deepEqual(print.paginateChapter([{ height: 10, chrome: 0, head: 5, rows: [200, 10] }], 100), [[{ block: 0, from: 0, to: 1 }], [{ block: 0, from: 1, to: 2 }]]);
});

test('pagination: headings are never left alone at the bottom of a page', () => {
    const heading = { height: 10, keepWithNext: true };
    // 85 used; the heading (10) fits but the paragraph after it (20) does not: both move on.
    assert.deepEqual(print.paginateChapter([{ height: 85 }, heading, { height: 20 }], 100), [[{ block: 0 }], [{ block: 1 }, { block: 2 }]]);
    // Two headings in a row travel together with the first row of the table that follows.
    const table = { height: 60, chrome: 0, head: 10, rows: [25, 25] };
    assert.deepEqual(print.paginateChapter([{ height: 50 }, heading, heading, table], 100),
        [[{ block: 0 }], [{ block: 1 }, { block: 2 }, { block: 3, from: 0, to: 2 }]]);
    // A heading followed by something taller than any page stays where it fits.
    assert.deepEqual(print.paginateChapter([{ height: 50 }, heading, { height: 300 }], 100), [[{ block: 0 }, { block: 1 }], [{ block: 2 }]]);
    // A figure (atomic) never splits: it moves to the next page whole.
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

test('the game scripts run without a game and know every mob and item the topics draw', () => {
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
    vm.runInContext('this.printWorld = new WorldRenderer({}); this.printGame = Game; this.printModels = VoxelModels; this.printOrganisms = MICRO_SPECIES;', context);

    const refs = (kind) => new Set(publicSources().flatMap((source) => [...source.matchAll(new RegExp(`\\]\\(${kind}:([a-z0-9_]+)\\)`, 'g'))].map((match) => match[1])));
    for (const item of refs('item')) {
        assert.ok(context.printWorld.blockTypes[item], `item:${item}`);
        assert.doesNotThrow(() => context.printWorld.getInventoryIconUrl(item), `icon of ${item}`);
    }
    const portraits = Object.create(context.printGame.prototype);
    for (const species of refs('mob')) {
        // The organisms have no voxel model: their portrait is a drawing, and needs no game and no WebGL.
        assert.ok(context.printModels.mobBuilders[species] || context.printOrganisms[species], `mob:${species}`);
        if (context.printOrganisms[species]) assert.match(portraits.bestiaryRenderPortrait(species), /^data:image\/png/, species);
    }
    assert.ok(refs('mob').has('tardigrade'), 'the organisms are in the printed topics');
    // The covers draw what the manifest names: every hero a mob, an item or a model the game builds, every icon an
    // item the game knows.
    for (const volume of MANIFEST.volumes) {
        const [heroKind, hero] = volume.cover.hero.split(':');
        assert.ok(['mob', 'item', 'model'].includes(heroKind), `the hero of volume ${volume.volume}`);
        if (heroKind === 'mob') assert.ok(context.printModels.mobBuilders[hero] || context.printOrganisms[hero], `mob:${hero} (volume ${volume.volume})`);
        else if (heroKind === 'item') assert.ok(context.printWorld.blockTypes[hero] && context.printWorld.getInventoryIconUrl(hero), `item:${hero} (volume ${volume.volume})`);
        else {
            // A model is built by the game without a world and without a robot (robotPortraitModel) and drawn on
            // the bestiary's stage. THREE is a stand-in here: what is held is that both exist and run.
            assert.equal(typeof portraits[`${hero}PortraitModel`], 'function', `model:${hero} (volume ${volume.volume}) has its builder`);
            assert.equal(typeof portraits.bestiaryRenderObject, 'function', 'the bestiary draws any model');
            assert.doesNotThrow(() => portraits.bestiaryRenderObject(portraits[`${hero}PortraitModel`]()), `model:${hero} is built and drawn`);
        }
        for (const icon of volume.cover.icons) {
            const [kind, name] = icon.split(':');
            assert.equal(kind, 'item', icon);
            assert.ok(context.printWorld.blockTypes[name], `${icon} (volume ${volume.volume})`);
            assert.doesNotThrow(() => context.printWorld.getInventoryIconUrl(name), `icon of ${name}`);
        }
    }
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
