// The pictures of the buildings at the top of topics 307 to 320 (tools/guideBuildPictures.js): the painter on tiny
// hand-made designs, the PNG it writes, the fourteen committed files against what the tool makes today, and the
// topics that show them.
// Run with: node --test test/js/guide_build_pictures.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const tool = require('../../tools/guideBuildPictures.js');

const GUIDE = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'guide');
const RED = [200, 100, 50];
const GREEN = [60, 180, 90];
const BLUE = [40, 60, 220];
const CUBE = [[0, 0, 0, 1, 1, 1]];
const cube = (x, y, z, top = RED, side = GREEN) => ({ x, y, z, boxes: CUBE, top, side, alpha: 1, cube: true, kind: 'stone' });

// The pixel of a picture where the point (x, y, z) of its cells falls, as [r, g, b, a].
function pixelAt(picture, tile, x, y, z) {
    const px = Math.floor((x - z) * (tile / 2) + picture.originX);
    const py = Math.floor((x + z) * (tile / 4) - y * (tile / 2) + picture.originY);
    const o = (py * picture.width + px) * 4;
    return Array.from(picture.rgba.subarray(o, o + 4));
}
const shade = (colour, k) => colour.map((c) => Math.round(c * k));
const painted = (picture) => {
    let n = 0;
    for (let i = 3; i < picture.rgba.length; i += 4) if (picture.rgba[i]) n++;
    return n;
};
const hasColour = (picture, colour) => {
    for (let i = 0; i < picture.rgba.length; i += 4) {
        if (picture.rgba[i + 3] && picture.rgba[i] === colour[0] && picture.rgba[i + 1] === colour[1] && picture.rgba[i + 2] === colour[2]) return true;
    }
    return false;
};

test('one block: a top rhombus and two side faces, the top lightest, then the +z face, then the +x face', () => {
    const tile = 8;
    const picture = tool.buildPicturePaint([cube(0, 0, 0)], tile);
    assert.deepEqual(pixelAt(picture, tile, 0.5, 1, 0.5), [...shade(RED, tool.BUILD_PICTURE_SHADE.top), 255]);
    assert.deepEqual(pixelAt(picture, tile, 0.5, 0.5, 1), [...shade(GREEN, tool.BUILD_PICTURE_SHADE.left), 255]);
    assert.deepEqual(pixelAt(picture, tile, 1, 0.5, 0.5), [...shade(GREEN, tool.BUILD_PICTURE_SHADE.right), 255]);
    assert.ok(tool.BUILD_PICTURE_SHADE.top > tool.BUILD_PICTURE_SHADE.left && tool.BUILD_PICTURE_SHADE.left > tool.BUILD_PICTURE_SHADE.right);
    // A hexagon: the rhombus (8 x 4 / 2) and two faces of 4 x 4.
    assert.equal(painted(picture), 48);
    // Above the top and outside the hexagon, nothing.
    assert.equal(pixelAt(picture, tile, 0, 1.2, 0)[3], 0);
});

test('a tile of 16 or more gives each face a thin dark edge; a smaller one none', () => {
    const big = tool.buildPicturePaint([cube(0, 0, 0)], 16);
    assert.deepEqual(pixelAt(big, 16, 0.5, 1, 0.5).slice(0, 3), shade(RED, 1));
    assert.ok(hasColour(big, shade(RED, tool.BUILD_PICTURE_EDGE)), 'the edge of the top');
    assert.ok(!hasColour(tool.buildPicturePaint([cube(0, 0, 0)], 8), shade(RED, tool.BUILD_PICTURE_EDGE)));
});

test('two blocks one behind the other: the near one wins whatever the order, and a hidden block paints nothing', () => {
    const tile = 8;
    // (1, 1, 1) falls exactly over (0, 0, 0) on the screen and is nearer.
    const far = cube(0, 0, 0, BLUE, BLUE);
    const near = cube(1, 1, 1);
    const a = tool.buildPicturePaint([far, near], tile);
    const b = tool.buildPicturePaint([near, far], tile);
    assert.ok(Buffer.from(a.rgba).equals(Buffer.from(b.rgba)), 'the same picture in either order');
    assert.ok(!hasColour(a, shade(BLUE, 1)) && !hasColour(a, shade(BLUE, tool.BUILD_PICTURE_SHADE.left)) && !hasColour(a, shade(BLUE, tool.BUILD_PICTURE_SHADE.right)));
    // Side by side along z, the far one shows its top and its +x face, not its +z face.
    const row = tool.buildPicturePaint([cube(0, 0, 0, BLUE, BLUE), cube(0, 0, 1)], tile);
    assert.ok(hasColour(row, shade(BLUE, 1)) && hasColour(row, shade(BLUE, tool.BUILD_PICTURE_SHADE.right)));
    assert.ok(!hasColour(row, shade(BLUE, tool.BUILD_PICTURE_SHADE.left)));
    // Covered on its three visible sides.
    const boxed = tool.buildPicturePaint([cube(0, 0, 0, BLUE, BLUE), cube(1, 0, 0), cube(0, 1, 0), cube(0, 0, 1)], tile);
    assert.ok(!hasColour(boxed, shade(BLUE, 1)) && !hasColour(boxed, shade(BLUE, tool.BUILD_PICTURE_SHADE.right)) && !hasColour(boxed, shade(BLUE, tool.BUILD_PICTURE_SHADE.left)));
});

test('a slab is half as tall: its top lower, its faces shorter', () => {
    const tile = 8;
    const slab = { x: 0, y: 0, z: 0, boxes: [[0, 0, 0, 1, 0.5, 1]], top: RED, side: GREEN, alpha: 1, cube: false, kind: 'slab' };
    const picture = tool.buildPicturePaint([slab], tile);
    assert.deepEqual(pixelAt(picture, tile, 0.5, 0.5, 0.5), [...shade(RED, 1), 255]);
    assert.equal(pixelAt(picture, tile, 0.5, 1.25, 0.5)[3], 0, 'nothing where a whole cube would have its top');
    assert.equal(painted(picture), 16 + 2 * 8);
});

test('glass is blended over what is behind it, and over nothing it is see-through', () => {
    const tile = 8;
    const glass = (x, y, z) => ({ x, y, z, boxes: CUBE, top: BLUE, side: BLUE, alpha: 0.5, cube: false, kind: 'glass' });
    const alone = tool.buildPicturePaint([glass(0, 0, 0)], tile);
    const top = pixelAt(alone, tile, 0.5, 1, 0.5);
    assert.deepEqual(top.slice(0, 3), BLUE);
    assert.equal(top[3], 128);
    // In front of a red block: half and half.
    const over = tool.buildPicturePaint([cube(0, 0, 0, RED, RED), glass(1, 1, 1)], tile);
    assert.deepEqual(pixelAt(over, tile, 1.5, 2, 1.5), [Math.round((BLUE[0] + RED[0]) / 2), Math.round((BLUE[1] + RED[1]) / 2), Math.round((BLUE[2] + RED[2]) / 2), 255]);
    // Behind a red block, nothing of it shows.
    const behind = tool.buildPicturePaint([glass(0, 0, 0), cube(1, 1, 1, RED, RED)], tile);
    assert.deepEqual(pixelAt(behind, tile, 1.5, 2, 1.5), [...RED, 255]);
    // Two panes of one window hide the face between them.
    const window = tool.buildPicturePaint([glass(0, 0, 0), glass(1, 0, 0)], tile);
    assert.equal(pixelAt(window, tile, 1, 1, 0.5)[3], 128, 'the shared face is not drawn twice');
});

test('the PNG writer: indexed with few colours, RGBA with many, and both read back the same pixels', () => {
    const few = tool.buildPicturePaint([cube(0, 0, 0), cube(1, 0, 0)], 16);
    const bytes = tool.buildPictureEncode(few.width, few.height, few.rgba);
    assert.equal(bytes[25], 3, 'colour type 3');
    assert.ok(Buffer.from(tool.buildPictureDecode(bytes).rgba).equals(Buffer.from(few.rgba)));
    const width = 40;
    const height = 20;
    const many = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) many.set([i & 0xFF, (i >> 8) * 40, 7, 255], i * 4);
    const rgbaBytes = tool.buildPictureEncode(width, height, many);
    assert.equal(rgbaBytes[25], 6, 'colour type 6');
    assert.ok(Buffer.from(tool.buildPictureDecode(rgbaBytes).rgba).equals(Buffer.from(many)));
    assert.ok(tool.buildPictureEncode(width, height, many).equals(rgbaBytes), 'same input, same bytes');
});

// The designs, built once for the tests below.
const game = tool.buildPictureGame();
const DESIGNS = vm.runInContext('Object.keys(CONSTRUCTION_DESIGNS)', game.context);

test('every design has a corner to be seen from, and nothing else has one', () => {
    assert.deepEqual([...DESIGNS].sort(), Object.keys(tool.BUILD_PICTURE_CORNERS).sort());
    for (const corner of Object.values(tool.BUILD_PICTURE_CORNERS)) assert.ok(corner === 'x0' || corner === 'x1');
});

test('the committed pictures are valid, wide enough, within budget, and what the tool makes today', (t) => {
    const looks = tool.buildPictureLooks(game.world);
    let total = 0;
    for (const name of DESIGNS) {
        const file = tool.buildPictureFile(name);
        assert.ok(fs.existsSync(file), `${name}: no ${path.basename(file)}: run node tools/guideBuildPictures.js`);
        const bytes = fs.readFileSync(file);
        total += bytes.length;
        assert.ok(bytes.length < 400 * 1024, `${name}: ${bytes.length} bytes`);
        const committed = tool.buildPictureDecode(bytes);
        assert.ok(committed.width >= tool.BUILD_PICTURE_MIN_WIDTH && committed.width <= tool.BUILD_PICTURE_MAX_WIDTH, `${name}: ${committed.width} wide`);
        const { painted: share } = tool.buildPictureStats(committed);
        assert.ok(share > 0.25 && share < 0.9, `${name}: ${Math.round(share * 100)}% painted`);
        const today = tool.buildPicture(game, name, looks);
        assert.ok(today.width === committed.width && today.height === committed.height && Buffer.from(today.rgba).equals(Buffer.from(committed.rgba)),
            `${name}: the picture is out of date: run node tools/guideBuildPictures.js`);
        if (!today.bytes.equals(bytes)) t.diagnostic(`${name}: same pixels, other bytes (another zlib)`);
    }
    assert.ok(total < 4 * 1024 * 1024, `${total} bytes in all`);
});

test('topics 307 to 320 open with the picture of their building, in both languages', () => {
    const files = fs.readdirSync(GUIDE);
    const seen = new Set();
    for (let id = 307; id <= 320; id++) {
        for (const lang of ['ES', 'EN']) {
            const file = files.find((f) => f.startsWith(`${id}_${lang}_`) && f.endsWith('.md'));
            assert.ok(file, `${id} ${lang}`);
            const lines = fs.readFileSync(path.join(GUIDE, file), 'utf8').split('\n');
            const first = lines.find((line) => line.startsWith('!['));
            const match = /^!\[([^\]]+)\]\(img\/build_([a-z_]+)\.png\)$/.exec(first || '');
            assert.ok(match, `${file}: its first picture is ${first}`);
            assert.ok(DESIGNS.includes(match[2]), `${file}: no design ${match[2]}`);
            assert.ok(fs.existsSync(path.join(GUIDE, 'img', `build_${match[2]}.png`)), `${file}: no picture`);
            assert.ok(!lines.some((line) => /^!\[[^\]]*\]\(item:/.test(line)), `${file}: an item picture of its own line is left`);
            seen.add(match[2]);
        }
    }
    assert.equal(seen.size, DESIGNS.length, 'every design has its topic');
});
