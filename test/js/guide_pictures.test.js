// The pictures of mobs and items that the guide's web pages show (pkg/web/book.go), drawn once by the game's
// engine in headless Chrome (tools/guidePictures.js) and kept in pkg/web/static/guide/pic/: every picture a
// public topic asks for has its file, each a PNG of the size the game draws with something on it, none left
// that nothing asks for, no two mobs alike, all within the budget; and the parts of the tool that need no
// browser. This test never starts one.
// Run with: node --test test/js/guide_pictures.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tool = require('../../tools/guidePictures.js');
const { pngEncode } = require('../../tools/png.js');

const STATIC = path.join(__dirname, '..', '..', 'pkg', 'web', 'static');
const RUN = 'node tools/guidePictures.js --missing (it needs Google Chrome; see its header)';

// A square picture of a size: `paint(x, y)` gives the [r, g, b, a] of each pixel.
function picture(size, paint) {
    const rgba = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) rgba.set(paint(x, y), (y * size + x) * 4);
    }
    return pngEncode(size, size, rgba);
}

test('the references of a topic, and which topics are public', () => {
    assert.deepEqual(tool.referencesOf('# Sheep\n\n![Sheep](mob:sheep)\n\n| ![](item:torch) | ![a](item:torch "lit") | ![](img/x.png) |\n' +
        'A [link](mob:not_a_picture) and `item:code` and ![](item:wool_red).'), ['mob:sheep', 'item:torch', 'item:wool_red']);
    assert.equal(tool.isPublicTopicFile('34_EN_Horse.md'), true);
    assert.equal(tool.isPublicTopicFile('0_ES_Índice.md'), true);
    assert.equal(tool.isPublicTopicFile('27A2_EN_Secret.md'), false);
    assert.equal(tool.isPublicTopicFile('UR29_ES_Secreto.md'), false);
    assert.equal(tool.isPublicTopicFile('README.md'), false);
});

test('what only a secret topic shows is never drawn', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-pictures-test-'));
    try {
        fs.writeFileSync(path.join(dir, '5_EN_Public.md'), '![](mob:sheep) ![](item:torch)');
        fs.writeFileSync(path.join(dir, '5_ES_Publico.md'), '![](mob:sheep) ![](item:stone)');
        fs.writeFileSync(path.join(dir, '27A2_EN_Secret.md'), '![](mob:hidden_thing) ![](item:torch)');
        fs.writeFileSync(path.join(dir, 'README.md'), '![](mob:readme_thing)');
        const references = tool.collectReferences(dir);
        assert.deepEqual([...references.keys()], ['item:stone', 'item:torch', 'mob:sheep']);
        assert.deepEqual(references.get('mob:sheep'), ['5_EN_Public.md', '5_ES_Publico.md']);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('the file of a picture, and back', () => {
    assert.equal(tool.pictureFileName('mob:sheep'), 'mob_sheep.png');
    assert.equal(tool.pictureFileName('item:wool_red'), 'item_wool_red.png');
    assert.equal(tool.pictureFileName('img/x.png'), null);
    assert.equal(tool.pictureFileName('mob:../x'), null);
    assert.equal(tool.pictureRefOf('item_wool_red.png'), 'item:wool_red');
    assert.equal(tool.pictureRefOf('landscape.png'), null);
});

test('a picture is judged by its numbers', () => {
    const size = tool.PICTURES_SIZE.item;
    const blank = picture(size, () => [0, 0, 0, 0]);
    const speck = picture(size, (x, y) => (x < 2 && y < 2 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
    const flat = picture(size, () => [90, 90, 90, 255]);
    const blot = picture(size, (x, y) => ((x - 32) ** 2 + (y - 32) ** 2 < 400 ? [255, 59, 213, 255] : [0, 0, 0, 0]));
    const shaded = picture(size, (x, y) => ((x - 32) ** 2 + (y - 32) ** 2 < 400 ? [x * 3, 100, y * 3, 255] : [0, 0, 0, 0]));
    const judge = (kind, bytes) => tool.judgePicture(kind, tool.measurePicture(bytes));
    assert.match(judge('item', blank), /^blank/);
    assert.match(judge('item', speck), /^blank/);
    assert.equal(judge('item', flat), 'all one colour');
    // An item may be a blot of one colour (the spray paint); a mob on the lit stage never is.
    assert.equal(judge('item', blot), null);
    assert.equal(judge('item', shaded), null);
    assert.equal(judge('mob', shaded), `${size}x${size}, not 200x200`);
    assert.equal(judge('mob', picture(200, (x, y) => ((x - 100) ** 2 + (y - 100) ** 2 < 900 ? [255, 59, 213, 255] : [0, 0, 0, 0]))), 'a shape of one flat colour');
    assert.match(judge('item', Buffer.from('not a png')), /^not a PNG/);
    const measure = tool.measurePicture(shaded);
    assert.ok(measure.painted > 0.3 && measure.painted < 0.31, `painted ${measure.painted}`);
    assert.equal(measure.digest, tool.measurePicture(shaded).digest);
    assert.notEqual(measure.digest, tool.measurePicture(blot).digest);
});

test('the page of the tool loads Three.js as the game and the printable guide do, and the painter', () => {
    const three = /<script src="(https:\/\/[^"]*three[^"]*\.js)"><\/script>/;
    const game = three.exec(fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8'))[1];
    assert.equal(three.exec(fs.readFileSync(path.join(STATIC, 'guide-print.html'), 'utf8'))[1], game);
    const page = tool.picturesPageHtml(game);
    assert.ok(page.includes(`<script src="${game}"></script>`));
    assert.ok(page.indexOf('class Game {}') < page.indexOf('js/guideEngine.js'), 'the stub Game comes before the painter');
    assert.ok(!fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8').includes('guideEngine.js'), 'the game does not load the painter');
});

test('every picture a public topic asks for has its file, as the game draws it', () => {
    const references = tool.collectReferences();
    assert.ok(references.size > 500, `${references.size} pictures`);
    const missing = [...references.keys()].filter((ref) => !fs.existsSync(path.join(tool.PICTURES_DIR, tool.pictureFileName(ref))));
    assert.deepEqual(missing, [], `pictures with no file: run ${RUN}`);
    const refused = [];
    const mobs = new Map();
    const twins = [];
    let total = 0;
    let mobBytes = 0;
    for (const ref of references.keys()) {
        const kind = ref.split(':')[0];
        const bytes = fs.readFileSync(path.join(tool.PICTURES_DIR, tool.pictureFileName(ref)));
        total += bytes.length;
        const measure = tool.measurePicture(bytes);
        const reason = tool.judgePicture(kind, measure);
        if (reason) refused.push(`${ref}: ${reason}`);
        if (kind !== 'mob') continue;
        mobBytes += bytes.length;
        if (mobs.has(measure.digest)) twins.push(`${ref} and ${mobs.get(measure.digest)}`);
        mobs.set(measure.digest, ref);
    }
    assert.deepEqual(refused, [], `pictures that are not good enough: run node tools/guidePictures.js --only <them>`);
    assert.deepEqual(twins, [], 'mobs with the same pixels');
    assert.ok(total <= tool.PICTURES_BUDGET, `the pictures weigh ${total} bytes`);
    assert.ok(mobBytes <= tool.PICTURES_MOB_BUDGET, `the mobs weigh ${mobBytes} bytes`);
});

test('no file is left that nothing asks for', () => {
    const references = tool.collectReferences();
    const extra = fs.readdirSync(tool.PICTURES_DIR).filter((name) => !references.has(tool.pictureRefOf(name)));
    assert.deepEqual(extra, [], 'files in guide/pic that no public topic shows: node tools/guidePictures.js removes them');
});
