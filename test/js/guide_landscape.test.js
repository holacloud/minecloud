// The landscape behind the guide's web pages (tools/guideLandscape.js, pkg/web/book.go): the committed picture
// against what the tool makes today, what it shows, and the pure parts (the blur, the tone, the renderer and
// the score) on tiny hand-made pictures and maps.
// Run with: node --test test/js/guide_landscape.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const tool = require('../../tools/guideLandscape.js');

const BUDGET = 120 * 1024;

// The mean [r, g, b] of the rows from y0 to y1 of an RGBA picture.
function meanOf(picture, y0, y1) {
    const sum = [0, 0, 0];
    let n = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = 0; x < picture.width; x++) {
            for (let c = 0; c < 3; c++) sum[c] += picture.rgba[(y * picture.width + x) * 4 + c];
            n++;
        }
    }
    return sum.map((value) => value / n);
}

test('the committed landscape is a valid PNG of its size, true colour, within budget, and what the tool makes today', (t) => {
    const bytes = fs.readFileSync(tool.LANDSCAPE_FILE);
    assert.ok(bytes.length < BUDGET, `${bytes.length} bytes`);
    assert.ok(bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])), 'the PNG signature');
    const committed = tool.pngDecode(bytes);
    assert.equal(committed.width, tool.LANDSCAPE_WIDTH);
    assert.equal(committed.height, tool.LANDSCAPE_HEIGHT);
    assert.equal(committed.colourType, 2, 'RGB, no alpha');
    const today = tool.landscapeMake();
    assert.ok(Buffer.from(today.rgba).equals(Buffer.from(committed.rgba)), 'the landscape is out of date: run node tools/guideLandscape.js');
    // The bytes depend on the zlib that Node carries; the pixels do not.
    if (!today.bytes.equals(bytes)) t.diagnostic('same pixels, other bytes (another zlib)');
    assert.ok(tool.landscapeMake().bytes.equals(today.bytes), 'same input, same bytes');
    t.diagnostic(tool.landscapeReport(today));
});

test('the landscape has the sky above and the land below, and shows what its score asks for', () => {
    const picture = tool.pngDecode(fs.readFileSync(tool.LANDSCAPE_FILE));
    const fifth = Math.round(picture.height / 5);
    const [tr, tg, tb] = meanOf(picture, 0, fifth);
    const [br, bg, bb] = meanOf(picture, picture.height - fifth, picture.height);
    assert.ok(tb - (tr + tg) / 2 > bb - (br + bg) / 2 + 20, `top ${[tr, tg, tb].map(Math.round)}, bottom ${[br, bg, bb].map(Math.round)}`);
    assert.ok(bg > bb || br > bb, 'the bottom is green or brown');
    // Darkened as the title screen: nothing near white.
    let brightest = 0;
    for (let i = 0; i < picture.rgba.length; i++) if (i % 4 !== 3) brightest = Math.max(brightest, picture.rgba[i]);
    assert.ok(brightest < 200, `${brightest}`);
    const { score } = tool.landscapeMake();
    const want = tool.LANDSCAPE_WANT;
    assert.ok(score.sky >= want.sky[0] && score.sky <= want.sky[1], `sky ${score.sky}`);
    assert.ok(score.water >= want.water[0] && score.water <= want.water[1], `water ${score.water}`);
    assert.ok(score.trees > 0.02, `trees ${score.trees}`);
    assert.ok(score.grounds >= want.kinds, `${score.grounds} kinds of ground`);
});

test('the blur keeps a flat picture as it is and the light of a dot, and is the Gaussian of the title screen', () => {
    assert.deepEqual(tool.landscapeBoxes(2), [3, 3, 5]);
    const width = 30;
    const height = 20;
    const flat = new Uint8Array(width * height * 3).fill(90);
    const blurredFlat = tool.landscapeBlur(flat, width, height, 2);
    assert.ok(blurredFlat.every((value) => Math.abs(value - 90) < 1e-9));
    const dot = new Uint8Array(width * height * 3);
    dot[(10 * width + 15) * 3 + 1] = 255;
    const blurredDot = tool.landscapeBlur(dot, width, height, 2);
    let green = 0;
    for (let i = 1; i < blurredDot.length; i += 3) green += blurredDot[i];
    assert.ok(Math.abs(green - 255) < 1e-6, `${green}`);
    assert.ok(blurredDot[(10 * width + 15) * 3 + 1] < 40 && blurredDot[(10 * width + 17) * 3 + 1] > 5, 'spread around the dot');
});

test('the tone darkens by multiplying and takes a little colour away, as brightness() and saturate()', () => {
    const rgb = Float64Array.from([200, 100, 50, 120, 120, 120]);
    const dark = tool.landscapeTone(rgb, 0.68, 1);
    assert.deepEqual(Array.from(dark), [136, 68, 34, 255, 82, 82, 82, 255]);
    const grey = tool.landscapeTone(rgb, 1, 0.9);
    assert.deepEqual(Array.from(grey.subarray(4)), [120, 120, 120, 255], 'a grey stays grey');
    assert.ok(grey[0] < 200 && grey[2] > 50, 'a colour comes nearer to grey');
});

// A tiny palette and the kinds of the map made of it.
const PALETTE = { grass: [0x62943A, 0], sand: [0xDCCB8C, 0], stone: [0x7A7A7D, 0], water: [0x3C7AFA, 2], leaves: [0x4E8F36, 0], wood: [0x906A39, 0] };

// A hand-made map: flat ground at height 6 (its face at y 7), sand and stone in stripes across the view, a
// lake on the right, and one tall tree straight ahead.
function handMap({ lake = true } = {}) {
    const kinds = tool.landscapeKinds(PALETTE);
    const size = 400;
    const origin = -200;
    const top = new Int16Array(size * size).fill(7);
    const ground = new Int16Array(size * size).fill(6);
    const kind = new Uint8Array(size * size).fill(kinds.of('grass'));
    for (let z = origin; z < origin + size; z++) {
        for (let x = origin; x < origin + size; x++) {
            const i = (z - origin) * size + (x - origin);
            if (z >= 8 && z < 14) kind[i] = kinds.of('sand');
            if (z >= 30 && z < 40) kind[i] = kinds.of('stone');
            if (lake && x > 2 && z > 4 && z < 30) { kind[i] = kinds.of('water'); top[i] = 6; ground[i] = 3; }
            if (Math.abs(x) <= 1 && z >= 15 && z <= 17) { kind[i] = kinds.of('leaves'); top[i] = 14; }
        }
    }
    const cell = (x, z) => (x < origin || z < origin || x >= origin + size || z >= origin + size ? -1 : (z - origin) * size + (x - origin));
    return { map: { cell, top, ground, kind, size, origin }, kinds };
}

test('the renderer puts the horizon level, the sky above and the land below, and the score reads them', () => {
    const { map, kinds } = handMap();
    const view = { x: 0, z: 0, eye: 7 + 1.62, heading: 0 };
    const picture = tool.landscapeRender(map, kinds.kinds, view, 80, 45);
    // Every column: sky down to the same row near 40% of the height, land under it.
    const firstLand = [];
    for (let x = 0; x < 80; x++) {
        let y = 0;
        while (y < 45 && picture.kinds[y * 80 + x] === 0) y++;
        firstLand.push(y);
        for (let below = y; below < 45; below++) assert.ok(picture.kinds[below * 80 + x] !== 0, `sky under the land at ${x}, ${below}`);
    }
    const plain = firstLand.filter((y, x) => x < 30 || x > 50);
    assert.ok(Math.max(...plain) - Math.min(...plain) <= 1, `a level horizon: ${plain}`);
    assert.ok(Math.min(...plain) >= 17 && Math.min(...plain) <= 20, `at ${Math.min(...plain)} of 45`);
    assert.ok(Math.min(...firstLand) < Math.min(...plain), 'the tree rises over the horizon');
    // The sky is lighter at the horizon than at the top.
    assert.ok(picture.rgb[(16 * 80) * 3 + 2] > picture.rgb[2] || picture.rgb[(16 * 80) * 3] > picture.rgb[0]);
    const score = tool.landscapeScore(picture, kinds.kinds);
    assert.ok(score.sky > 0.35 && score.sky < 0.47, `sky ${score.sky}`);
    assert.ok(score.water > 0.05, `water ${score.water}`);
    assert.ok(score.trees > 0, `trees ${score.trees}`);
    assert.equal(score.grounds, 3);
    assert.equal(score.parts.kinds, 1);
    const drier = handMap({ lake: false });
    const dry = tool.landscapeScore(tool.landscapeRender(drier.map, drier.kinds.kinds, view, 80, 45), drier.kinds.kinds);
    assert.equal(dry.water, 0);
    assert.ok(dry.parts.water < score.parts.water, 'no water scores less');
});

test('the score: each part is whole within what it asks for and less outside', () => {
    const { kinds } = handMap();
    const picture = (shares) => {
        const pixels = new Uint8Array(1000);
        let at = 0;
        for (const [name, share] of shares) pixels.fill(name === 'sky' ? 0 : kinds.of(name), at, (at += Math.round(share * 1000)));
        return { kinds: pixels };
    };
    const good = tool.landscapeScore(picture([['sky', 0.4], ['water', 0.1], ['leaves', 0.1], ['grass', 0.2], ['sand', 0.1], ['stone', 0.1]]), kinds.kinds);
    assert.deepEqual(good.parts, { sky: 1, water: 1, trees: 1, kinds: 1 });
    assert.equal(good.total, 4);
    const poor = tool.landscapeScore(picture([['sky', 0.7], ['grass', 0.295], ['sand', 0.005]]), kinds.kinds);
    assert.equal(poor.parts.sky, 0, 'far too much sky');
    assert.ok(Math.abs(poor.parts.water - 0.5) < 1e-9, 'no water is half a part');
    assert.equal(poor.parts.trees, 0);
    assert.equal(poor.grounds, 1, 'a kind of ground under 1% does not count');
});
