// Node tests for the volumes of the printable guide (pkg/web/static/guide/volumes.json, its lock
// and guide/volumes/; the rules are in guide/README.md, "Volumes"), with the code of
// tools/guideVolumes.js. The real files are held first; then, since nothing may be closed yet,
// the rules about closed volumes are tried on manifests and locks made here.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const tool = require(path.join(ROOT, 'tools', 'guideVolumes.js'));

const guide = tool.readGuide();

test('the manifest: numbered volumes whose ranges follow on, with words, a colour, a cover and sections, and every public topic in one', () => {
    assert.deepEqual(tool.checkManifest(guide.manifest, guide.publicIds), []);
});

test('every volume has the synopsis of its back cover in ES and EN, 50 to 90 words, saying "volume" and "topic"', () => {
    for (const volume of guide.manifest.volumes) {
        for (const [lang, volumeWord, topicWord] of [['ES', /\bvolumen\b/i, /\btemas?\b/i], ['EN', /\bvolume\b/i, /\btopics?\b/i]]) {
            const synopsis = volume.synopsis[lang];
            const words = tool.chapterWords(synopsis);
            assert.ok(words >= 50 && words <= 90, `volume ${volume.volume}, ${lang}: ${words} words`);
            assert.match(synopsis, volumeWord, `volume ${volume.volume}, ${lang}`);
            assert.match(synopsis, topicWord, `volume ${volume.volume}, ${lang}`);
            assert.ok(!/p[aá]gina|\bpages?\b/i.test(synopsis), `volume ${volume.volume}, ${lang}: a topic is never a page`);
        }
    }
});

test('the lock agrees with the manifest, and every volumes/ file comes in both languages', () => {
    assert.deepEqual(tool.checkLock(guide.manifest, guide.lock, guide.publicIds), []);
    assert.deepEqual(tool.checkVolumeFiles(guide.manifest, guide.volumeFiles), []);
});

test('every volume after the first opens with "Before you start" in ES and EN: a heading, 400 to 900 words, links to earlier volumes only, the same in both', () => {
    assert.deepEqual(tool.checkRecaps(guide.manifest, guide.publicIds, guide.recaps), []);
    for (const volume of guide.manifest.volumes.slice(1)) {
        assert.ok(tool.chapterLinks(guide.recaps[volume.volume].ES).length >= 5, `volume ${volume.volume}: a recap names the topics it recalls`);
    }
});

test('a topic of a closed volume that changed is told in the open volume\'s news or waived', () => {
    const changes = tool.reviewChanges(guide.manifest, guide.lock, guide.hashes, guide.news);
    assert.equal(tool.untoldMessage(guide.manifest, changes), '');
});

// ---- the rules, on data made here

// A synopsis of `count` words, for the back of a cover.
const wordsOf = (count, word = 'word') => Array.from({ length: count }, (_, i) => `${word}${i}`).join(' ');

function manifestOf(closed = [null, null, null]) {
    const volume = (n, from, to, sections) => ({
        volume: n, from, to, closed: closed[n - 1], title: { ES: `Tomo ${n}`, EN: `Book ${n}` }, blurb: { ES: 'Algo.', EN: 'Something.' },
        synopsis: { ES: wordsOf(60, 'palabra'), EN: wordsOf(60) },
        colour: '#336699', cover: { hero: 'mob:sheep', icons: ['item:a', 'item:b', 'item:c', 'item:d', 'item:e'] }, sections
    });
    return {
        pages: { min: 250, max: 300 }, skip: [0], indexTopics: [0, 5],
        volumes: [volume(1, 0, 9, [[0, 4, 'A', 'A'], [5, 9, 'B', 'B']]), volume(2, 10, 19, [[10, 19, 'C', 'C']]), volume(3, 20, null, [[20, 29, 'D', 'D']])]
    };
}
const IDS = [0, 1, 2, 3, 5, 8, 9, 10, 12, 19, 20, 24];
const hashesOf = (changed = {}) => Object.fromEntries(IDS.map((id) => [String(id), { ES: changed[id] && changed[id].ES || `es${id}`, EN: changed[id] && changed[id].EN || `en${id}` }]));

test('the manifest rules bite', () => {
    const problems = (change) => {
        const manifest = manifestOf();
        change(manifest);
        return tool.checkManifest(manifest, IDS).join('\n');
    };
    assert.deepEqual(tool.checkManifest(manifestOf(), IDS), []);
    assert.match(problems((m) => { m.volumes[1].volume = 5; }), /numbered 5/);
    assert.match(problems((m) => { m.volumes[1].from = 11; }), /not right after volume 1/);
    assert.match(problems((m) => { m.volumes[2].to = 40; }), /last one: its "to" must be null/);
    assert.match(problems((m) => { m.volumes[1].to = null; }), /needs a "to"/);
    assert.match(problems((m) => { m.volumes[1].closed = '2026-11-20'; }), /closed after an open one/);
    assert.match(problems((m) => { m.volumes[0].closed = 'yesterday'; }), /a date like/);
    assert.match(problems((m) => { m.volumes[0].closed = '2026-01-01'; m.volumes[1].closed = '2026-02-01'; m.volumes[2].closed = '2026-03-01'; }), /cannot be closed/);
    assert.match(problems((m) => { delete m.volumes[0].blurb.EN; }), /no blurb in EN/);
    assert.match(problems((m) => { m.volumes[0].title.ES = ' '; }), /no title in ES/);
    assert.match(problems((m) => { delete m.volumes[1].synopsis; }), /volume 2 has no synopsis in ES/);
    assert.match(problems((m) => { m.volumes[0].synopsis.EN = ''; }), /volume 1 has no synopsis in EN/);
    assert.match(problems((m) => { m.volumes[0].synopsis.ES = wordsOf(39); }), /synopsis in ES has 39 words: a synopsis has 40 to 100/);
    assert.match(problems((m) => { m.volumes[2].synopsis.EN = wordsOf(101); }), /volume 3: its synopsis in EN has 101 words/);
    assert.deepEqual(problems((m) => { m.volumes[0].synopsis = { ES: wordsOf(40), EN: wordsOf(100) }; }), '', '40 and 100 words are allowed');
    assert.match(problems((m) => { m.volumes[0].colour = 'green'; }), /colour/);
    assert.match(problems((m) => { m.volumes[0].cover.hero = 'torch'; }), /cover.hero/);
    assert.match(problems((m) => { m.volumes[0].cover.icons.pop(); }), /five items/);
    assert.match(problems((m) => { m.volumes[0].sections = [[0, 4, 'A', 'A'], [3, 9, 'B', 'B']]; }), /overlaps/);
    assert.match(problems((m) => { m.volumes[0].sections = [[5, 9, 'B', 'B'], [0, 4, 'A', 'A']]; }), /out of order/);
    assert.match(problems((m) => { m.volumes[0].sections = [[0, 12, 'A', 'A']]; }), /outside the volume/);
    assert.match(problems((m) => { m.volumes[0].sections = [[0, 4, 'A']]; }), /\[from, to, "ES", "EN"\]/);
    // An open volume may leave a topic out of its sections ("More topics"); a closed one may not.
    assert.deepEqual(problems((m) => { m.volumes[0].sections = [[0, 4, 'A', 'A']]; }), '');
    assert.match(problems((m) => { m.volumes[0].sections = [[0, 4, 'A', 'A']]; m.volumes[0].closed = '2026-11-20'; }), /cover all its topics: 5, 8, 9/);
    assert.match(problems((m) => { m.volumes[0].from = 1; }), /topics in no volume: 0/);
});

test('the lock: written for the closed volumes, a closed range never changes, a new close asks for lock', () => {
    const manifest = manifestOf(['2026-11-20', null, null]);
    const lock = tool.buildLock(manifest, hashesOf());
    assert.equal(lock.closedThrough, 1);
    assert.deepEqual(lock.volumes, [{ volume: 1, from: 0, to: 9, closed: '2026-11-20' }]);
    assert.deepEqual(Object.keys(lock.topics), ['0', '1', '2', '3', '5', '8', '9']);
    assert.deepEqual(lock.topics['8'], { ES: 'es8', EN: 'en8' });
    assert.deepEqual(lock.minor, {});
    assert.deepEqual(tool.checkLock(manifest, lock, IDS), []);
    assert.deepEqual(tool.checkLock(manifestOf(), tool.EMPTY_LOCK, IDS), [], 'nothing closed, nothing locked');

    const moved = manifestOf(['2026-11-20', null, null]);
    moved.volumes[0].to = 8;
    moved.volumes[1].from = 9;
    assert.match(tool.checkLock(moved, lock, IDS).join('\n'), /a closed volume never changes/);
    assert.match(tool.checkLock(manifestOf(), lock, IDS).join('\n'), /never opens again/);
    assert.match(tool.checkLock(manifest, tool.EMPTY_LOCK, IDS).join('\n'), /run node tools\/guideVolumes\.js lock/);
    assert.match(tool.checkLock(manifest, lock, [...IDS, 4]).join('\n'), /topic 4 is new but falls in closed volume 1/);
    assert.match(tool.checkLock(manifest, { closedThrough: 0 }, IDS).join('\n'), /needs closedThrough/);
});

test('a changed topic of a closed volume must be told in both news files, or waived; index and skipped topics are exempt', () => {
    const manifest = manifestOf(['2026-11-20', null, null]);
    const lock = tool.buildLock(manifest, hashesOf());
    const none = { ES: null, EN: null };
    assert.deepEqual(tool.reviewChanges(manifest, lock, hashesOf(), none), [], 'nothing changed');

    const changed = hashesOf({ 8: { ES: 'new' }, 3: { EN: 'new' }, 5: { ES: 'new' }, 0: { ES: 'new' } });
    const untold = tool.reviewChanges(manifest, lock, changed, none);
    assert.deepEqual(untold.map((change) => [change.id, change.langs.join(), change.volume, change.status]), [['3', 'EN', 1, 'untold'], ['8', 'ES', 1, 'untold']]);
    const message = tool.untoldMessage(manifest, untold);
    assert.match(message, /topic 3 \(EN\) of closed volume 1/);
    assert.match(message, /guide\/volumes\/2_news_ES\.md and _EN\.md/);
    assert.match(message, /node tools\/guideVolumes\.js minor 3 8/);

    // Told: a list item that starts with a link to the topic, in both languages.
    const news = { ES: '# Lo nuevo\n\n- [Día, noche y clima](8): el sol sale por el este.\n- Y más [cosas](3).\n', EN: '* [Day, night and weather](008): the sun rises in the east.\n' };
    assert.deepEqual([...tool.toldIds(news.ES)], ['8']);
    assert.deepEqual([...tool.toldIds(news.EN)], ['8']);
    const review = tool.reviewChanges(manifest, lock, changed, news);
    assert.deepEqual(review.map((change) => [change.id, change.status]), [['3', 'untold'], ['8', 'told']]);
    assert.equal(tool.reviewChanges(manifest, lock, changed, { ES: news.ES, EN: null }).find((change) => change.id === '8').status, 'untold', 'one language is not enough');

    // Waived: the present text, until it changes again.
    const waived = tool.waive(lock, changed, ['3']);
    assert.deepEqual(waived.minor['3'], { ES: 'es3', EN: 'new' });
    assert.equal(tool.reviewChanges(manifest, waived, changed, news).find((change) => change.id === '3').status, 'waived');
    const again = hashesOf({ 8: { ES: 'new' }, 3: { EN: 'newer' } });
    assert.equal(tool.reviewChanges(manifest, waived, again, news).find((change) => change.id === '3').status, 'untold');
    assert.throws(() => tool.waive(lock, changed, ['12']), /in no closed volume/);
    assert.equal(tool.untoldMessage(manifest, tool.reviewChanges(manifest, waived, changed, news)), '');
});

test('the volumes/ files: recap and news of a volume there is, always in pairs', () => {
    const manifest = manifestOf();
    assert.deepEqual(tool.checkVolumeFiles(manifest, ['2_recap_ES.md', '2_recap_EN.md', '3_news_EN.md', '3_news_ES.md']), []);
    assert.match(tool.checkVolumeFiles(manifest, ['2_recap_ES.md']).join('\n'), /write 2_recap_EN\.md too/);
    assert.match(tool.checkVolumeFiles(manifest, ['7_news_ES.md', '7_news_EN.md']).join('\n'), /there is no volume 7/);
    assert.match(tool.checkVolumeFiles(manifest, ['notes.txt']).join('\n'), /the files there are/);
});

test('the recap rules bite', () => {
    const manifest = manifestOf();
    const words = (count) => Array.from({ length: count }, (_, i) => `palabra${i}`).join(' ');
    const recap = (title, links, count = 500) => `${title}\n\n${links.map((id) => `[página](${id})`).join(' ')} ${words(count)}\n`;
    const good = () => ({ 2: { ES: recap('# Antes de empezar', [1, 8]), EN: recap('# Before you start', [8, 1]) }, 3: { ES: recap('# Antes', [12, 3]), EN: recap('# Before', [3, 12]) } });
    const problems = (change) => {
        const recaps = good();
        change(recaps);
        return tool.checkRecaps(manifest, IDS, recaps).join('\n');
    };
    assert.deepEqual(tool.checkRecaps(manifest, IDS, good()), []);
    assert.match(problems((r) => { r[3].EN = null; }), /3_recap_EN\.md is missing/);
    assert.match(problems((r) => { r[2].ES = recap('Antes de empezar', [1, 8]); }), /2_recap_ES\.md must start with its "# heading"/);
    assert.match(problems((r) => { r[2].EN = recap('# Before you start', [8, 1], 300); }), /2_recap_EN\.md has \d+ words/);
    assert.match(problems((r) => { r[2].EN = recap('# Before you start', [8, 1], 1000); }), /2_recap_EN\.md has \d+ words/);
    assert.match(problems((r) => { r[2].ES = recap('# Antes de empezar', [1, 8, 12]); r[2].EN = recap('# Before you start', [1, 8, 12]); }), /topic 12 of volume 2: only to earlier volumes/);
    assert.match(problems((r) => { r[3].ES = recap('# Antes', [12, 3, 24]); r[3].EN = recap('# Before', [12, 3, 24]); }), /topic 24 of volume 3/);
    assert.match(problems((r) => { r[2].ES = recap('# Antes de empezar', [1, 8, 0]); r[2].EN = recap('# Before you start', [1, 8, 0]); }), /topic 0, which is never printed/);
    assert.match(problems((r) => { r[2].ES = recap('# Antes de empezar', [1, 8, 4]); r[2].EN = recap('# Before you start', [1, 8, 4]); }), /topic 4, which does not exist/);
    assert.match(problems((r) => { r[2].ES = recap('# Antes de empezar', [1, '27A2']); }), /links to "27A2"/);
    assert.match(problems((r) => { r[2].EN = recap('# Before you start', [8]); }), /2_recap_ES\.md links to 1 and _EN\.md does not/);
    // Pictures are not links, nor words; a link counts by its text.
    assert.deepEqual(tool.chapterLinks('![](item:torch) [Fabricar](11) ![Pico](68) y [otra vez](11), [y](8)'), ['11', '8']);
    assert.equal(tool.chapterWords('# Título\n\n![](item:torch) Una **antorcha** ([Antorcha](62)): 1 `wood` + 1 `coal_ore` → 4.'), 9);
});

test('the sha1 of a topic, 12 hex characters', () => {
    assert.equal(tool.hashText(Buffer.from('hola')), '99800b85d338', 'as sha1sum says');
    assert.match(tool.hashText(Buffer.from('')), /^[0-9a-f]{12}$/);
});

test('the tool on a guide folder: lock once a volume is closed, then a change is untold until it is waived', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-volumes-'));
    try {
        const manifest = manifestOf(['2026-11-20', null, null]);
        manifest.volumes[0].sections = [[0, 9, 'A', 'A']];
        fs.writeFileSync(path.join(dir, 'volumes.json'), JSON.stringify(manifest));
        for (const [id, lang] of [[1, 'ES'], [1, 'EN'], [12, 'ES'], [12, 'EN']]) fs.writeFileSync(path.join(dir, `${id}_${lang}_Topic.md`), `# Topic ${id}\n`);
        const quiet = () => {};
        assert.equal(tool.main(['lock'], dir, quiet), 0);
        const lock = JSON.parse(fs.readFileSync(path.join(dir, 'volumes.lock.json'), 'utf8'));
        assert.deepEqual([lock.closedThrough, Object.keys(lock.topics)], [1, ['1']]);
        assert.throws(() => tool.main(['lock'], dir, quiet), /nothing new was closed/);
        assert.equal(tool.main([], dir, quiet), 0);
        fs.writeFileSync(path.join(dir, '1_ES_Topic.md'), '# Topic 1, now different\n');
        fs.writeFileSync(path.join(dir, '12_ES_Topic.md'), '# Topic 12 of the open volume may change\n');
        const said = [];
        assert.equal(tool.main([], dir, (line) => said.push(line)), 1);
        assert.ok(said.includes('  1 (ES), volume 1: UNTOLD'));
        assert.equal(tool.main(['minor', '1'], dir, quiet), 0);
        assert.equal(tool.main([], dir, quiet), 0);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
