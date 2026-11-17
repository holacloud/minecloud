// Writes pkg/web/static/guide/img/landscape.png: a still landscape of the game's world, blurred and darkened as
// the title screen blurs the live game (index.html: blur(8px) brightness(0.68) saturate(0.9) on the canvas),
// laid behind the guide's web pages (pkg/web/book.go). It is made once here and committed, as the pictures
// of the buildings are (tools/guideBuildPictures.js), so the pages need no filter and no script.
//     node tools/guideLandscape.js            writes the picture and says where it stood and why
//     node tools/guideLandscape.js --ascii    the same view unblurred, as letters, to check it without opening it
// test/js/guide_landscape.test.js fails while the committed picture is not what this makes today.
//
// How the picture is made:
// - The world is the generator's own (js/terrainGen.js: columnSurface, blockAt, treeAt, TREE_SHAPES), run in
//   a function scope of this process rather than in a VM context of its own: it is a pure script with no
//   browser in it, and its noise is some hundred times faster where its globals are plain variables.
// - Block colours are those of pkg/web/viewer_block_palette.json (the top face of each block); sky and fog are
//   the game's by day (js/game.js: 0x87CEEB, fog from 20 to 150 blocks).
// - The renderer is a height map seen from a person's eye (the "voxel space" way): each column of the picture
//   walks away from the eye and paints upwards from the highest row drawn so far. Heights are whole blocks,
//   so the steps show; the face of a step is darker than the top it carries, and tops are shaded by slope.
//   Water is flat at WATER_LEVEL; a tree is its trunk and the top of its canopy stamped into the map, after
//   the canopies of pkg/terrain/chunk.go (round, cone, flat, willow). Overhangs are not drawn.
// - Where to stand is chosen here: on a grid around the world's origin, the highest dry column near each
//   point, eight headings each, every view rendered small and scored (landscapeScore: sky, water, trees and
//   kinds of ground); the best is rendered at full size. Same code, same picture.
// - Then a blur of three box passes (a Gaussian of 8px on a 1280px wide screen), brightness 0.68 and saturation
//   0.9, in the order the browser applies them, and the PNG of tools/png.js as plain RGB.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pngEncode, pngDecode } = require('./png.js');

const ROOT = path.join(__dirname, '..');
const LANDSCAPE_FILE = path.join(ROOT, 'pkg', 'web', 'static', 'guide', 'img', 'landscape.png');
const LANDSCAPE_PALETTE = path.join(ROOT, 'pkg', 'web', 'viewer_block_palette.json');

const LANDSCAPE_WIDTH = 320;
const LANDSCAPE_HEIGHT = 180;
const LANDSCAPE_TRIAL = { width: 64, height: 36 };
// The title screen's filter, for a screen this wide.
const LANDSCAPE_SCREEN = 1280;
const LANDSCAPE_BLUR = 8;
const LANDSCAPE_BRIGHTNESS = 0.68;
const LANDSCAPE_SATURATION = 0.9;
// js/game.js: the sky by day and its fog; a field of view of 70 degrees, the game's default.
const LANDSCAPE_SKY = 0x87CEEB;
const LANDSCAPE_SKY_TOP = 0x5E9FD0;
const LANDSCAPE_FOG_NEAR = 20;
const LANDSCAPE_FOG_FAR = 150;
const LANDSCAPE_FOV = 70;
const LANDSCAPE_EYE = 1.62;
// Where the horizon falls, from the top of the picture.
const LANDSCAPE_HORIZON = 0.4;
// The places tried: every LANDSCAPE_STEP blocks up to LANDSCAPE_REACH each way, and the highest dry column
// within LANDSCAPE_NEAR of each.
const LANDSCAPE_REACH = 256;
const LANDSCAPE_STEP = 32;
const LANDSCAPE_NEAR = 12;
const LANDSCAPE_HEADINGS = 8;
// What the score asks for (shares of the picture).
const LANDSCAPE_WANT = { sky: [0.35, 0.45], water: [0.05, 0.25], trees: 0.08, kinds: 3, kindShare: 0.01 };

// What a cell of the map is, for the colours and for the letters of --ascii.
const LANDSCAPE_LETTERS = {
    sky: '.', water: '~', grass: 'g', sand: 's', stone: 'r', cobblestone: 'r', dirt: 'd', moss: 'm',
    snow_block: 'n', leaves: 'T', wood: 'w'
};

// ---------------------------------------------------------------------------------------
// The generator and the map.

// js/terrainGen.js in a function scope of this process: { columnSurface, blockAt, treeAt, TREE_SHAPES, ... }.
function landscapeGenerator() {
    const file = path.join(ROOT, 'pkg', 'web', 'static', 'js', 'terrainGen.js');
    const source = fs.readFileSync(file, 'utf8');
    const wrapped = `(function () {\n${source}\nreturn { columnSurface, blockAt, treeAt, hash2, hash3, TREE_SHAPES, WATER_LEVEL };\n})`;
    return vm.runInThisContext(wrapped, { filename: file })();
}

// The kinds of cell a map knows: index -> { name, rgb, letter, ground, tree }. Index 0 is the sky.
function landscapeKinds(palette) {
    const kinds = [{ name: 'sky', rgb: landscapeRgb(LANDSCAPE_SKY), letter: '.', ground: false, tree: false }];
    const index = new Map([['sky', 0]]);
    const of = (name) => {
        if (index.has(name)) return index.get(name);
        const entry = palette[name] || palette[name.split(':')[0]];
        const leaves = name === 'leaves' || name.endsWith('_leaves');
        const wood = name === 'wood' || name.endsWith('_wood');
        const letter = LANDSCAPE_LETTERS[name] || (leaves ? 'T' : wood ? 'w' : 'o');
        kinds.push({ name, rgb: landscapeRgb(entry ? entry[0] : 0x808080), letter, ground: name !== 'water' && !leaves && !wood, tree: leaves || wood });
        index.set(name, kinds.length - 1);
        return kinds.length - 1;
    };
    return { kinds, of };
}

function landscapeRgb(value) {
    return [(value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF];
}

// The top of a tree's canopy over each column around its trunk, as [dx, dz, height above the ground, leaf]
// (leaf false: the trunk), after generateTree in pkg/terrain/chunk.go. Worked out once a shape and height.
const landscapeCanopies = new Map();
function landscapeCanopy(shape, trunk) {
    const key = `${shape.canopy}:${shape.radius || 0}:${trunk}`;
    if (landscapeCanopies.has(key)) return landscapeCanopies.get(key);
    const top = trunk; // the canopy's top layer, counted from the first block above the ground
    const tops = new Map();
    const put = (dx, dz, y) => {
        const k = `${dx},${dz}`;
        if (!tops.has(k) || tops.get(k) < y) tops.set(k, y);
    };
    if (shape.canopy === 'cone') {
        for (let ly = 2; ly <= top + 1; ly++) {
            const t = (top + 1 - ly) / (trunk - 1);
            const radius = Math.round(0.4 + t * 2.4 - ((top - ly) % 2) * 0.6);
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) if (Math.abs(dx) + Math.abs(dz) <= radius + 0.5) put(dx, dz, ly);
            }
        }
    } else if (shape.canopy === 'flat') {
        for (let dx = -3; dx <= 3; dx++) {
            for (let dz = -3; dz <= 3; dz++) {
                const d = Math.hypot(dx, dz);
                if (d <= 3.2) put(dx, dz, d < 1.8 ? top + 1 : top);
            }
        }
    } else {
        const radius = shape.radius || 2.2;
        const r = Math.ceil(radius);
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.hypot(dx, dy * 1.05, dz) <= radius) put(dx, dz, Math.round(top - 0.5 + dy));
                }
            }
        }
    }
    const cells = [];
    for (const [k, y] of tops) {
        const [dx, dz] = k.split(',').map(Number);
        cells.push([dx, dz, y, true]);
    }
    if (!tops.has('0,0')) cells.push([0, 0, trunk - 1, false]);
    landscapeCanopies.set(key, cells);
    return cells;
}

// The world as a height map around the origin, filled lazily in tiles of 16 by 16: for each column, the top of
// what stands there (`top`, the y of the face the eye sees), the ground's height (`ground`, for the shading)
// and its kind. cell(x, z) gives the index of a column, or -1 outside.
function landscapeWorld(generator, kindsOf, half = LANDSCAPE_REACH + LANDSCAPE_NEAR + LANDSCAPE_FOG_FAR + 8) {
    const tiles = Math.ceil((half * 2) / 16);
    const size = tiles * 16;
    const origin = -tiles * 8;
    const top = new Int16Array(size * size);
    const ground = new Int16Array(size * size);
    const kind = new Uint8Array(size * size);
    const tree = new Array(tiles * tiles); // per tile, the trees on it: [x, z, wood, height]
    const based = new Uint8Array(tiles * tiles);
    const stamped = new Uint8Array(tiles * tiles);
    const water = kindsOf('water');
    const { WATER_LEVEL, TREE_SHAPES } = generator;

    const base = (tx, tz) => {
        const t = tz * tiles + tx;
        if (based[t]) return;
        based[t] = 1;
        tree[t] = [];
        for (let lz = 0; lz < 16; lz++) {
            for (let lx = 0; lx < 16; lx++) {
                const x = origin + tx * 16 + lx;
                const z = origin + tz * 16 + lz;
                const i = (tz * 16 + lz) * size + tx * 16 + lx;
                const surface = generator.columnSurface(x, z);
                ground[i] = surface.height;
                if (surface.height < WATER_LEVEL) {
                    top[i] = WATER_LEVEL + 1;
                    kind[i] = water;
                    continue;
                }
                top[i] = surface.height + 1;
                kind[i] = kindsOf(generator.blockAt(x, surface.height, z, surface));
                const wood = generator.treeAt(x, z, surface);
                if (wood) {
                    const shape = TREE_SHAPES[wood] || TREE_SHAPES.wood;
                    const height = shape.trunk[0] + Math.floor(generator.hash2(x, z, 2024) * (shape.trunk[1] - shape.trunk[0] + 1));
                    tree[t].push([x, z, wood, height, surface.height]);
                }
            }
        }
    };

    // A tile's own columns with the canopies of the trees on it and on the tiles around it.
    const stamp = (tx, tz) => {
        const t = tz * tiles + tx;
        if (stamped[t]) return;
        stamped[t] = 1;
        const x0 = origin + tx * 16;
        const z0 = origin + tz * 16;
        for (let nz = tz - 1; nz <= tz + 1; nz++) {
            for (let nx = tx - 1; nx <= tx + 1; nx++) {
                if (nx < 0 || nz < 0 || nx >= tiles || nz >= tiles) continue;
                base(nx, nz);
                for (const [x, z, wood, height, y] of tree[nz * tiles + nx]) {
                    const leaves = kindsOf(wood === 'wood' ? 'leaves' : wood.replace('_wood', '_leaves'));
                    const trunk = kindsOf(wood);
                    for (const [dx, dz, above, leaf] of landscapeCanopy(TREE_SHAPES[wood] || TREE_SHAPES.wood, height)) {
                        const cx = x + dx;
                        const cz = z + dz;
                        if (cx < x0 || cz < z0 || cx >= x0 + 16 || cz >= z0 + 16) continue;
                        const i = (cz - origin) * size + (cx - origin);
                        // The trunk starts on the block above the ground; a face's y is one above its block.
                        const face = y + 1 + above + 1;
                        if (face > top[i]) {
                            top[i] = face;
                            kind[i] = leaf ? leaves : trunk;
                        }
                    }
                }
            }
        }
    };

    const cell = (x, z) => {
        const cx = x - origin;
        const cz = z - origin;
        if (cx < 0 || cz < 0 || cx >= size || cz >= size) return -1;
        stamp(cx >> 4, cz >> 4);
        return cz * size + cx;
    };
    return { cell, top, ground, kind, size, origin };
}

// ---------------------------------------------------------------------------------------
// The renderer and the score: pure, on any map with cell(), top, ground and kind.

// A view: { x, z, eye, heading } (heading in eighths of a turn, 0 looking along +z). Gives { width, height,
// kinds: Uint8Array of the kind of each pixel (0 for the sky), rgb: Uint8Array of its colour }.
function landscapeRender(map, kinds, view, width, height, { fine = true } = {}) {
    const pixels = new Uint8Array(width * height);
    const rgb = new Uint8Array(width * height * 3);
    const angle = (view.heading / LANDSCAPE_HEADINGS) * Math.PI * 2;
    const forward = [Math.sin(angle), Math.cos(angle)];
    // y up and x, z as the game has them (Three.js): looking along +z, the right hand is towards -x.
    const right = [-Math.cos(angle), Math.sin(angle)];
    const focal = (height / 2) / Math.tan((LANDSCAPE_FOV / 2) * Math.PI / 180);
    const horizon = Math.round(height * LANDSCAPE_HORIZON);
    const sky = landscapeRgb(LANDSCAPE_SKY);
    const skyTop = landscapeRgb(LANDSCAPE_SKY_TOP);
    const fog = sky;
    const growth = fine ? 0.006 : 0.02;
    for (let column = 0; column < width; column++) {
        const t = (column + 0.5 - width / 2) / focal;
        const dx = forward[0] + right[0] * t;
        const dz = forward[1] + right[1] * t;
        let lowest = height; // the highest row drawn so far is the one above `lowest`
        let previousTop = null;
        let previousCell = -1;
        let step = fine ? 0.1 : 0.25;
        for (let depth = 1; depth < LANDSCAPE_FOG_FAR && lowest > 0; depth += step, step = Math.max(step, depth * growth)) {
            const i = map.cell(Math.floor(view.x + 0.5 + dx * depth), Math.floor(view.z + 0.5 + dz * depth));
            if (i < 0) break;
            if (i === previousCell) continue;
            const top = map.top[i];
            const row = Math.max(0, Math.ceil(horizon + ((view.eye - top) / depth) * focal));
            if (row < lowest) {
                const k = map.kind[i];
                const base = kinds[k].rgb;
                const mist = Math.max(0, Math.min(1, (depth - LANDSCAPE_FOG_NEAR) / (LANDSCAPE_FOG_FAR - LANDSCAPE_FOG_NEAR)));
                const lit = landscapeShade(map, i, kinds[k].name === 'water');
                // A rise shows its face below its top: the face is darker.
                const face = previousTop !== null && top > previousTop ? 0.78 : lit;
                for (let y = row; y < lowest; y++) {
                    const shade = y === row ? lit : face;
                    const o = y * width + column;
                    pixels[o] = k;
                    for (let c = 0; c < 3; c++) rgb[o * 3 + c] = Math.round(base[c] * shade * (1 - mist) + fog[c] * mist);
                }
                lowest = row;
            }
            previousTop = top;
            previousCell = i;
        }
        // The sky: deeper at the top, the fog's colour at the horizon and below it.
        for (let y = 0; y < lowest; y++) {
            const up = Math.max(0, Math.min(1, (horizon - y) / horizon));
            const o = y * width + column;
            pixels[o] = 0;
            for (let c = 0; c < 3; c++) rgb[o * 3 + c] = Math.round(sky[c] + (skyTop[c] - sky[c]) * up);
        }
    }
    return { width, height, kinds: pixels, rgb };
}

// Light on a top by its slope, from the north-west as a low sun; water is flat.
function landscapeShade(map, i, flat) {
    if (flat) return 1;
    const size = map.size;
    const at = (j) => (j >= 0 && j < map.ground.length ? map.ground[j] : map.ground[i]);
    const slope = (at(i - 1) - at(i + 1)) * 0.06 + (at(i - size) - at(i + size)) * 0.04;
    return Math.max(0.8, Math.min(1.12, 1 + slope));
}

// How good a view is: { sky, water, trees, kinds (shares of the picture and the number of kinds of ground that
// cover at least LANDSCAPE_WANT.kindShare), and parts of 0 to 1 for each, and their total }.
function landscapeScore(picture, kinds) {
    const count = new Array(kinds.length).fill(0);
    for (let i = 0; i < picture.kinds.length; i++) count[picture.kinds[i]]++;
    const total = picture.kinds.length;
    let water = 0;
    let trees = 0;
    let grounds = 0;
    kinds.forEach((kind, k) => {
        if (kind.name === 'water') water += count[k];
        if (kind.tree) trees += count[k];
        if (kind.ground && count[k] >= total * LANDSCAPE_WANT.kindShare) grounds++;
    });
    const share = { sky: count[0] / total, water: water / total, trees: trees / total };
    const within = (value, [low, high]) => Math.max(0, 1 - Math.max(low - value, value - high, 0) / 0.1);
    const parts = {
        sky: within(share.sky, LANDSCAPE_WANT.sky),
        water: within(share.water, LANDSCAPE_WANT.water),
        trees: Math.min(1, share.trees / LANDSCAPE_WANT.trees),
        kinds: Math.min(1, grounds / LANDSCAPE_WANT.kinds)
    };
    return { ...share, grounds, parts, total: parts.sky + parts.water + parts.trees + parts.kinds };
}

// ---------------------------------------------------------------------------------------
// The filter of the title screen.

// The widths of three box passes that together blur as a Gaussian of `sigma` (the usual recipe).
function landscapeBoxes(sigma) {
    const ideal = Math.sqrt((12 * sigma * sigma) / 3 + 1);
    let low = Math.floor(ideal);
    if (low % 2 === 0) low--;
    const high = low + 2;
    const lows = Math.round((12 * sigma * sigma - 3 * low * low - 4 * 3 * low - 3 * 3) / (-4 * low - 4));
    return [0, 1, 2].map((n) => (n < lows ? low : high));
}

// One box pass along rows (or columns), the edges repeated: a flat picture stays as it is.
function landscapeBoxPass(source, target, width, height, box, vertical) {
    const r = (box - 1) / 2;
    const lines = vertical ? width : height;
    const length = vertical ? height : width;
    const at = (line, n) => (vertical ? (n * width + line) : (line * width + n)) * 3;
    for (let line = 0; line < lines; line++) {
        for (let c = 0; c < 3; c++) {
            let sum = 0;
            for (let n = -r; n <= r; n++) sum += source[at(line, Math.max(0, Math.min(length - 1, n))) + c];
            for (let n = 0; n < length; n++) {
                target[at(line, n) + c] = sum / box;
                sum += source[at(line, Math.min(length - 1, n + r + 1)) + c] - source[at(line, Math.max(0, n - r)) + c];
            }
        }
    }
}

// RGB floats blurred by a Gaussian of `sigma` pixels, as three box passes each way.
function landscapeBlur(rgb, width, height, sigma) {
    let source = Float64Array.from(rgb);
    let target = new Float64Array(rgb.length);
    for (const box of landscapeBoxes(sigma)) {
        for (const vertical of [false, true]) {
            landscapeBoxPass(source, target, width, height, box, vertical);
            [source, target] = [target, source];
        }
    }
    return source;
}

// brightness() then saturate() of CSS filters (the matrices of the Filter Effects spec), to RGBA bytes.
function landscapeTone(rgb, brightness, saturation) {
    const s = saturation;
    const m = [
        0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s
    ];
    const out = new Uint8Array((rgb.length / 3) * 4);
    for (let p = 0; p < rgb.length / 3; p++) {
        const r = rgb[p * 3] * brightness;
        const g = rgb[p * 3 + 1] * brightness;
        const b = rgb[p * 3 + 2] * brightness;
        for (let c = 0; c < 3; c++) out[p * 4 + c] = Math.max(0, Math.min(255, Math.round(m[c * 3] * r + m[c * 3 + 1] * g + m[c * 3 + 2] * b)));
        out[p * 4 + 3] = 255;
    }
    return out;
}

// ---------------------------------------------------------------------------------------
// The choice of the view, and the picture.

// Every place and heading tried, rendered small: the best { view, score }.
function landscapeChoose(generator, map, kinds) {
    let best = null;
    for (let gz = -LANDSCAPE_REACH; gz <= LANDSCAPE_REACH; gz += LANDSCAPE_STEP) {
        for (let gx = -LANDSCAPE_REACH; gx <= LANDSCAPE_REACH; gx += LANDSCAPE_STEP) {
            // High ground: the highest dry column near the point (the first of equals, row by row).
            let place = null;
            for (let z = gz - LANDSCAPE_NEAR; z <= gz + LANDSCAPE_NEAR; z += 2) {
                for (let x = gx - LANDSCAPE_NEAR; x <= gx + LANDSCAPE_NEAR; x += 2) {
                    const i = map.cell(x, z);
                    if (map.ground[i] < generator.WATER_LEVEL || kinds.kinds[map.kind[i]].tree) continue;
                    if (!place || map.ground[i] > place.ground) place = { x, z, ground: map.ground[i] };
                }
            }
            if (!place) continue;
            for (let heading = 0; heading < LANDSCAPE_HEADINGS; heading++) {
                const view = { x: place.x, z: place.z, eye: place.ground + 1 + LANDSCAPE_EYE, heading };
                const picture = landscapeRender(map, kinds.kinds, view, LANDSCAPE_TRIAL.width, LANDSCAPE_TRIAL.height, { fine: false });
                const score = landscapeScore(picture, kinds.kinds);
                if (!best || score.total > best.score.total) best = { view, score };
            }
        }
    }
    return best;
}

// The whole making: { view, score, picture (unblurred), rgba (the final pixels), bytes, kinds }.
function landscapeMake({ width = LANDSCAPE_WIDTH, height = LANDSCAPE_HEIGHT } = {}) {
    const generator = landscapeGenerator();
    const kinds = landscapeKinds(JSON.parse(fs.readFileSync(LANDSCAPE_PALETTE, 'utf8')));
    const map = landscapeWorld(generator, kinds.of);
    const { view } = landscapeChoose(generator, map, kinds);
    const picture = landscapeRender(map, kinds.kinds, view, width, height);
    const score = landscapeScore(picture, kinds.kinds);
    const sigma = LANDSCAPE_BLUR * (width / LANDSCAPE_SCREEN);
    const rgba = landscapeTone(landscapeBlur(picture.rgb, width, height, sigma), LANDSCAPE_BRIGHTNESS, LANDSCAPE_SATURATION);
    return { view, score, picture, rgba, kinds: kinds.kinds, bytes: pngEncode(width, height, rgba, { opaque: true }) };
}

// The unblurred picture as letters (LANDSCAPE_LETTERS), `columns` wide: the kind most pixels of each cell are.
function landscapeAscii(picture, kinds, columns = 100) {
    const cell = picture.width / columns;
    const rows = Math.round(picture.height / (cell * 2));
    const lines = [];
    for (let r = 0; r < rows; r++) {
        let line = '';
        for (let c = 0; c < columns; c++) {
            const count = new Map();
            for (let y = Math.floor(r * cell * 2); y < Math.min(picture.height, Math.floor((r + 1) * cell * 2)); y++) {
                for (let x = Math.floor(c * cell); x < Math.floor((c + 1) * cell); x++) {
                    const letter = kinds[picture.kinds[y * picture.width + x]].letter;
                    count.set(letter, (count.get(letter) || 0) + 1);
                }
            }
            let best = ' ';
            let most = 0;
            for (const [letter, n] of count) if (n > most) { best = letter; most = n; }
            line += best;
        }
        lines.push(line);
    }
    return lines.join('\n');
}

function landscapeReport({ view, score, bytes }) {
    const pct = (value) => `${(value * 100).toFixed(1)}%`;
    const headings = ['+z (south)', 'south-east', '+x (east)', 'north-east', '-z (north)', 'north-west', '-x (west)', 'south-west'];
    return `standing at x ${view.x}, z ${view.z}, eye at y ${view.eye.toFixed(2)}, looking ${headings[view.heading]} (heading ${view.heading} of 8)\n` +
        `sky ${pct(score.sky)} (part ${score.parts.sky.toFixed(2)}), water ${pct(score.water)} (${score.parts.water.toFixed(2)}), ` +
        `trees ${pct(score.trees)} (${score.parts.trees.toFixed(2)}), ${score.grounds} kinds of ground (${score.parts.kinds.toFixed(2)}): ` +
        `score ${score.total.toFixed(2)} of 4\n${(bytes.length / 1024).toFixed(1)} KB`;
}

module.exports = {
    LANDSCAPE_FILE, LANDSCAPE_WIDTH, LANDSCAPE_HEIGHT, LANDSCAPE_WANT, LANDSCAPE_SKY,
    landscapeGenerator, landscapeKinds, landscapeWorld, landscapeRender, landscapeScore, landscapeBoxes, landscapeBlur,
    landscapeTone, landscapeChoose, landscapeMake, landscapeAscii, landscapeReport, pngDecode
};

if (require.main === module) {
    const made = landscapeMake();
    console.log(landscapeReport(made));
    if (process.argv.includes('--ascii')) console.log(landscapeAscii(made.picture, made.kinds));
    else {
        fs.writeFileSync(LANDSCAPE_FILE, made.bytes);
        console.log(path.relative(ROOT, LANDSCAPE_FILE));
    }
}
