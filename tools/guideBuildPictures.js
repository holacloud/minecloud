// Writes pkg/web/static/guide/img/build_<design>.png: an isometric picture of each building of /build
// (CONSTRUCTION_DESIGNS, js/game/constructions.js and construction_*.js), which topics 307 to 320 of the guide
// open with. The pictures are made once here and committed, as pkg/web/viewer_block_palette.json is, so
// nothing is drawn at run time and the same file serves the game's book, the printable book and plain pages.
// Run it after changing a design:
//     node tools/guideBuildPictures.js              all fourteen
//     node tools/guideBuildPictures.js castle       one
//     node tools/guideBuildPictures.js --ascii castle   the picture as text, to check it without opening it
// test/js/guide_build_pictures.test.js fails while a committed picture is not what this makes today.
//
// How a picture is made:
// - The scripts of index.html run in a VM as for the palette (tools/viewerPalette.js), and the design's plan
//   is built as the tests do (constructionPlan). Only what the design places is drawn: no foundation, no
//   terrain around it.
// - The plan is turned (blueprintRotate, constructionTurnType) so that the corner of BUILD_PICTURE_CORNERS
//   comes nearest to the viewer. The picture is classic 2:1 pixel art: a block is a top rhombus `tile`
//   pixels wide and two side faces tile / 2 tall; the view direction is (1, 1, 1), so x + y + z is the depth
//   of a point and a depth buffer draws everything in the right order whatever the order of the cells.
// - A cell is the boxes the game itself draws for it (BlockShapeSet.boxes in js/blockShapes.js: slabs, stairs,
//   doors, fences and panes joined to their neighbours, beds, signs...). Plants and torches, which the game
//   draws as crossed planes, are a thin post; other blocks that are neither solid nor fluid (a ladder) too.
// - Colours are the average of each face's texture (faceColor of tools/viewerPalette.js), the top face lit,
//   the +z face medium and the +x face darker. Water, glass and stained glass are blended over what is behind
//   them. Faces against an opaque whole cube are skipped, so a block with its three visible faces covered
//   paints nothing. With a tile of 16 pixels or more each face gets a thin dark edge.
// - The PNG is written by hand (tools/png.js): 8-bit, indexed with transparency when 256 colours are enough,
//   else RGBA. Same input, same pixels on any machine (the test compares pixels; the bytes depend on the zlib
//   that Node carries).

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'pkg', 'web', 'static', 'guide', 'img');

// Which corner of the design's box the picture is seen from. Every design has its main entrance on its near
// edge (z = 0: "door towards the player", constructions.js), so the corner is that edge's end at x = 0 ('x0')
// or at the largest x ('x1'). An entrance in the middle shows from either; the Maya palace's way in is east of
// the middle (anchorX 87 of 141), so it is seen from that side.
const BUILD_PICTURE_CORNERS = {
    house: 'x0',
    hall: 'x0',
    cathedral: 'x0',
    showroom: 'x0',
    library: 'x0',
    apartments: 'x0',
    castle: 'x0',
    palace_andalusi: 'x0',
    palace_baroque: 'x0',
    palace_oriental: 'x0',
    palace_nordic: 'x0',
    palace_maya: 'x1',
    palace_volcanic: 'x0',
    lab: 'x0'
};

// The picture's width in pixels, as it is printed at about 125 mm.
const BUILD_PICTURE_MIN_WIDTH = 1400;
const BUILD_PICTURE_MAX_WIDTH = 1600;
const BUILD_PICTURE_PAD = 2;
// Shades of the faces, and of their edges; the tile from which edges are drawn.
const BUILD_PICTURE_SHADE = { top: 1, left: 0.8, right: 0.62 };
const BUILD_PICTURE_EDGE = 0.72;
const BUILD_PICTURE_EDGE_TILE = 16;
// Plants, torches and other thin things that are no box of the game.
const BUILD_PICTURE_POST = [6 / 16, 0, 6 / 16, 10 / 16, 10 / 16, 10 / 16];
// See-through blocks that say no opacity of their own (stained glass, panes).
const BUILD_PICTURE_GLASS_ALPHA = 0.55;

// ---------------------------------------------------------------------------------------
// The pure part: cells in, pixels out. A cell is { x, y, z, boxes: [[x0, y0, z0, x1, y1, z1], ...] (in the
// cell, from its minimum corner), top: [r, g, b], side: [r, g, b], alpha (1 opaque), cube (an opaque whole
// cube, which hides the faces of its neighbours), kind (cells of one kind and see-through hide each other's
// faces: the inside of a pond, of a window) }.

// The extent of the cells on the screen, in pixels of a tile, before any offset.
function buildPictureExtent(cells, tile) {
    const half = tile / 2;
    const quarter = tile / 4;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const cell of cells) {
        for (const [x0, y0, z0, x1, y1, z1] of cell.boxes) {
            minX = Math.min(minX, (cell.x + x0 - cell.z - z1) * half);
            maxX = Math.max(maxX, (cell.x + x1 - cell.z - z0) * half);
            minY = Math.min(minY, (cell.x + x0 + cell.z + z0) * quarter - (cell.y + y1) * half);
            maxY = Math.max(maxY, (cell.x + x1 + cell.z + z1) * quarter - (cell.y + y0) * half);
        }
    }
    return { minX, maxX, minY, maxY };
}

// The largest even tile that keeps the picture within the width asked for (null if none fits).
function buildPictureTile(cells, minWidth = BUILD_PICTURE_MIN_WIDTH, maxWidth = BUILD_PICTURE_MAX_WIDTH) {
    const unit = buildPictureExtent(cells, 2);
    const span = unit.maxX - unit.minX;
    for (let tile = Math.floor((2 * (maxWidth - 2 * BUILD_PICTURE_PAD)) / span / 2) * 2; tile >= 2; tile -= 2) {
        const width = Math.ceil((span * tile) / 2) + 2 * BUILD_PICTURE_PAD;
        if (width <= maxWidth) return width >= minWidth ? tile : null;
    }
    return null;
}

// Paints the cells: { width, height, rgba (Uint8Array), originX, originY } where originX, originY is where the
// point (0, 0, 0) of the cells falls on the picture.
function buildPicturePaint(cells, tile) {
    const half = tile / 2;
    const quarter = tile / 4;
    const extent = buildPictureExtent(cells, tile);
    const originX = BUILD_PICTURE_PAD - Math.floor(extent.minX);
    const originY = BUILD_PICTURE_PAD - Math.floor(extent.minY);
    const width = Math.ceil(extent.maxX) + originX + BUILD_PICTURE_PAD;
    const height = Math.ceil(extent.maxY) + originY + BUILD_PICTURE_PAD;
    const rgba = new Uint8Array(width * height * 4);
    const depth = new Float64Array(width * height).fill(-Infinity);
    const edges = tile >= BUILD_PICTURE_EDGE_TILE;

    // Who stands next to whom: a face against an opaque whole cube, or against see-through of its own kind,
    // is never seen.
    const byCell = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    for (const cell of cells) byCell.set(key(cell.x, cell.y, cell.z), cell);
    const hides = (cell, dx, dy, dz) => {
        const other = byCell.get(key(cell.x + dx, cell.y + dy, cell.z + dz));
        return Boolean(other) && (other.cube || (cell.alpha < 1 && other.alpha < 1 && other.kind === cell.kind));
    };

    const faces = [];
    for (const cell of cells) {
        const hideTop = hides(cell, 0, 1, 0);
        const hideLeft = hides(cell, 0, 0, 1);
        const hideRight = hides(cell, 1, 0, 0);
        if (hideTop && hideLeft && hideRight && cell.boxes.every((b) => b[0] === 0 && b[2] === 0 && b[3] === 1 && b[4] === 1 && b[5] === 1)) continue;
        for (const box of cell.boxes) {
            const [x0, y0, z0, x1, y1, z1] = box;
            const ax0 = cell.x + x0, ay0 = cell.y + y0, az0 = cell.z + z0;
            const ax1 = cell.x + x1, ay1 = cell.y + y1, az1 = cell.z + z1;
            const order = ax0 + ax1 + ay0 + ay1 + az0 + az1;
            if (!(y1 >= 1 && hideTop)) faces.push({ cell, face: 'top', box: [ax0, ay0, az0, ax1, ay1, az1], order });
            if (!(z1 >= 1 && hideLeft)) faces.push({ cell, face: 'left', box: [ax0, ay0, az0, ax1, ay1, az1], order });
            if (!(x1 >= 1 && hideRight)) faces.push({ cell, face: 'right', box: [ax0, ay0, az0, ax1, ay1, az1], order });
        }
    }
    // Opaque faces first in any order (the depth buffer sorts them), then see-through ones from back to front.
    const opaque = faces.filter((f) => f.cell.alpha >= 1);
    const clear = faces.filter((f) => f.cell.alpha < 1).sort((a, b) => a.order - b.order);

    const shadeOf = (cell, face, edge) => {
        const base = face === 'top' ? cell.top : cell.side;
        const k = BUILD_PICTURE_SHADE[face] * (edge ? BUILD_PICTURE_EDGE : 1);
        return [Math.round(base[0] * k), Math.round(base[1] * k), Math.round(base[2] * k)];
    };

    const drawFace = ({ cell, face, box }) => {
        const [x0, y0, z0, x1, y1, z1] = box;
        // The face's corners on the screen, for the pixels to try.
        let corners;
        if (face === 'top') corners = [[x0, y1, z0], [x1, y1, z0], [x0, y1, z1], [x1, y1, z1]];
        else if (face === 'left') corners = [[x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [x1, y1, z1]];
        else corners = [[x1, y0, z0], [x1, y0, z1], [x1, y1, z0], [x1, y1, z1]];
        let px0 = Infinity, px1 = -Infinity, py0 = Infinity, py1 = -Infinity;
        for (const [x, y, z] of corners) {
            const sx = (x - z) * half + originX;
            const sy = (x + z) * quarter - y * half + originY;
            px0 = Math.min(px0, sx); px1 = Math.max(px1, sx); py0 = Math.min(py0, sy); py1 = Math.max(py1, sy);
        }
        const plain = shadeOf(cell, face, false);
        const dark = shadeOf(cell, face, true);
        const alpha = cell.alpha;
        // Edges about a pixel wide: a unit along x or z is `half` pixels across, a unit of y `half` pixels up.
        const edgeXZ = 1 / half;
        const edgeY = 1 / half;
        for (let py = Math.max(0, Math.floor(py0)); py < Math.min(height, Math.ceil(py1)); py++) {
            for (let px = Math.max(0, Math.floor(px0)); px < Math.min(width, Math.ceil(px1)); px++) {
                // a = x - z and b = x + z - 2y of the pixel's centre.
                const a = (px + 0.5 - originX) / half;
                const b = (py + 0.5 - originY) / quarter;
                let u, v, d, uLo, uHi, vLo, vHi, uEdge, vEdge;
                if (face === 'top') {
                    u = (a + b + 2 * y1) / 2; v = (b + 2 * y1 - a) / 2; d = u + y1 + v;
                    uLo = x0; uHi = x1; vLo = z0; vHi = z1; uEdge = edgeXZ; vEdge = edgeXZ;
                } else if (face === 'left') {
                    u = a + z1; v = (u + z1 - b) / 2; d = u + v + z1;
                    uLo = x0; uHi = x1; vLo = y0; vHi = y1; uEdge = edgeXZ; vEdge = edgeY;
                } else {
                    u = x1 - a; v = (x1 + u - b) / 2; d = x1 + v + u;
                    uLo = z0; uHi = z1; vLo = y0; vHi = y1; uEdge = edgeXZ; vEdge = edgeY;
                }
                if (u < uLo || u >= uHi || v < vLo || v >= vHi) continue;
                const i = py * width + px;
                if (d <= depth[i]) continue;
                const edge = edges && (u - uLo < uEdge || uHi - u <= uEdge || v - vLo < vEdge || vHi - v <= vEdge);
                const color = edge ? dark : plain;
                const o = i * 4;
                if (alpha >= 1) {
                    depth[i] = d;
                    rgba[o] = color[0]; rgba[o + 1] = color[1]; rgba[o + 2] = color[2]; rgba[o + 3] = 255;
                } else {
                    // Over what is there, which may be nothing.
                    const below = rgba[o + 3] / 255;
                    const out = alpha + below * (1 - alpha);
                    for (let c = 0; c < 3; c++) rgba[o + c] = Math.round((color[c] * alpha + rgba[o + c] * below * (1 - alpha)) / out);
                    rgba[o + 3] = Math.round(out * 255);
                }
            }
        }
    };
    for (const face of opaque) drawFace(face);
    for (const face of clear) drawFace(face);
    return { width, height, rgba, originX, originY };
}

// ---------------------------------------------------------------------------------------
// PNG: tools/png.js, shared with tools/guideLandscape.js.

const { pngEncode: buildPictureEncode, pngDecode: buildPictureDecode } = require('./png.js');

// What the tool prints of a picture: its share of painted pixels and its number of colours.
function buildPictureStats({ width, height, rgba }) {
    let painted = 0;
    const colours = new Set();
    for (let i = 0; i < width * height; i++) {
        if (rgba[i * 4 + 3] === 0) continue;
        painted++;
        colours.add(((rgba[i * 4] << 24) | (rgba[i * 4 + 1] << 16) | (rgba[i * 4 + 2] << 8) | rgba[i * 4 + 3]) >>> 0);
    }
    return { painted: painted / (width * height), colours: colours.size };
}

// The picture reduced to `columns` characters by brightness (a character is about twice as tall as wide);
// a space where less than a third is painted.
function buildPictureAscii({ width, height, rgba }, columns = 100) {
    const ramp = '@%#*+=-:.';
    const cell = width / columns;
    const rows = Math.ceil(height / (cell * 2));
    const lines = [];
    for (let r = 0; r < rows; r++) {
        let line = '';
        for (let c = 0; c < columns; c++) {
            let count = 0, painted = 0, light = 0;
            for (let y = Math.floor(r * cell * 2); y < Math.min(height, Math.floor((r + 1) * cell * 2)); y++) {
                for (let x = Math.floor(c * cell); x < Math.min(width, Math.floor((c + 1) * cell)); x++) {
                    const o = (y * width + x) * 4;
                    count++;
                    if (rgba[o + 3] < 128) continue;
                    painted++;
                    light += 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
                }
            }
            if (!count || painted * 3 < count) line += ' ';
            else line += ramp[Math.min(ramp.length - 1, Math.floor((light / painted / 256) * ramp.length))];
        }
        lines.push(line.replace(/\s+$/, ''));
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------------------
// The game's side: a design to the cells of the pure part.

// The game's scripts in a VM, once: { context, world }.
function buildPictureGame() {
    const { loadContext, loadWorld } = require('./viewerPalette.js');
    const context = loadContext();
    return { context, world: loadWorld(context) };
}

// How each block type looks in a picture: { top, side, alpha, cube, kind, post, shaped }, worked out once.
function buildPictureLooks(world) {
    const { faceColor } = require('./viewerPalette.js');
    const looks = new Map();
    const rgb = (value) => [(value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF];
    return (type) => {
        let look = looks.get(type);
        if (look) return look;
        const def = world.blockTypes[type];
        const id = world.registry.ids[type];
        const specs = world.getFaceTextureSpecs(type);
        const fallback = def.color || 0x808080;
        const fluid = world.registry.fluid[id] === 1;
        const solid = world.registry.solid[id] === 1;
        const shaped = world.registry.shaped[id] === 1;
        let alpha = 1;
        if (def.filterGlass) alpha = def.opacity || BUILD_PICTURE_GLASS_ALPHA;
        else if (def.opacity && def.opacity < 1) alpha = def.opacity;
        else if (def.transparent && /glass/.test(def.variantOf || type)) alpha = BUILD_PICTURE_GLASS_ALPHA;
        // Stained glass is its filter's colour; its texture is mostly the lead.
        const top = def.filterGlass ? rgb(fallback) : rgb(faceColor(world, specs.top, fallback));
        const side = def.filterGlass ? rgb(fallback) : rgb(faceColor(world, specs.side, fallback));
        look = {
            id, top, side, alpha, shaped,
            cube: world.registry.fullCube[id] === 1,
            kind: def.variantOf || type,
            post: !fluid && !solid && !shaped
        };
        looks.set(type, look);
        return look;
    };
}

// The design turned so that its picture corner is nearest: { size, cells: [{ x, y, z, type }] }.
function buildPictureTurned(context, plan, corner) {
    const run = (code) => vm.runInContext(code, context);
    const [w] = plan.size;
    const wanted = corner === 'x1' ? { x: w - 1, z: 0 } : { x: 0, z: 0 };
    let turns = 0;
    for (; turns < 4; turns++) {
        const turned = run('blueprintRotate')(plan.size, [{ x: wanted.x, y: 0, z: wanted.z }], turns);
        const [tw, , td] = turned.size;
        if (turned.cells[0].x === tw - 1 && turned.cells[0].z === td - 1) break;
    }
    const blockTypes = run('BLOCK_TYPES');
    const turnType = run('constructionTurnType');
    const { size, cells } = run('blueprintRotate')(plan.size, plan.cells, turns);
    // A design may say 'air' to keep a cell empty (the build clears it): nothing to draw.
    const solid = cells.filter((cell) => cell.type !== 'air');
    return { size, turns, cells: solid.map((cell) => ({ x: cell.x, y: cell.y, z: cell.z, type: turnType(cell.type, turns, blockTypes) })) };
}

// The cells of the pure part for a turned design: boxes as the game draws them, joined to their neighbours.
function buildPictureCells(world, looks, turned) {
    const [w, h, d] = turned.size;
    const ids = new Uint16Array(w * h * d);
    const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= w || y >= h || z >= d ? 0 : ids[(y * d + z) * w + x]);
    for (const cell of turned.cells) ids[(cell.y * d + cell.z) * w + cell.x] = looks(cell.type).id;
    return turned.cells.map((cell) => {
        const look = looks(cell.type);
        let boxes;
        if (look.post) boxes = [BUILD_PICTURE_POST];
        else if (look.shaped) {
            const mask = world.shapes.mask(look.id, at(cell.x, cell.y, cell.z - 1), at(cell.x + 1, cell.y, cell.z), at(cell.x, cell.y, cell.z + 1), at(cell.x - 1, cell.y, cell.z));
            boxes = world.shapes.boxes(look.id, mask).map((box) => [box[0], box[1], box[2], box[3], Math.min(box[4], 1), box[5]]);
        } else boxes = world.shapes.boxes(look.id);
        if (!boxes.length) boxes = [BUILD_PICTURE_POST];
        return { x: cell.x, y: cell.y, z: cell.z, boxes, top: look.top, side: look.side, alpha: look.alpha, cube: look.cube, kind: look.kind };
    });
}

// One design's picture: { name, bytes, width, height, tile, turns, rgba, entrance: [x, y] in pixels }.
function buildPicture(game, name, looks = buildPictureLooks(game.world)) {
    const plan = vm.runInContext(`constructionPlan(${JSON.stringify(name)})`, game.context);
    const corner = BUILD_PICTURE_CORNERS[name];
    if (!corner) throw new Error(`No corner for ${name} in BUILD_PICTURE_CORNERS`);
    const turned = buildPictureTurned(game.context, plan, corner);
    const cells = buildPictureCells(game.world, looks, turned);
    const tile = buildPictureTile(cells);
    if (!tile) throw new Error(`${name}: no tile gives a picture ${BUILD_PICTURE_MIN_WIDTH} to ${BUILD_PICTURE_MAX_WIDTH} wide`);
    const picture = buildPicturePaint(cells, tile);
    // Where the player stands to start (outside the entrance), on the picture.
    const [start] = vm.runInContext('blueprintRotate', game.context)(plan.size, [{ x: plan.start[0], y: plan.start[1], z: plan.start[2] }], turned.turns).cells;
    const entrance = [
        Math.round((start.x + 0.5 - start.z - 0.5) * (tile / 2) + picture.originX),
        Math.round((start.x + start.z + 1) * (tile / 4) - start.y * (tile / 2) + picture.originY)
    ];
    return { name, tile, turns: turned.turns, entrance, ...picture, bytes: buildPictureEncode(picture.width, picture.height, picture.rgba) };
}

function buildPictureFile(name) {
    return path.join(OUT_DIR, `build_${name}.png`);
}

module.exports = {
    BUILD_PICTURE_CORNERS, BUILD_PICTURE_MIN_WIDTH, BUILD_PICTURE_MAX_WIDTH, BUILD_PICTURE_SHADE, BUILD_PICTURE_EDGE,
    buildPictureExtent, buildPictureTile, buildPicturePaint, buildPictureEncode, buildPictureDecode, buildPictureStats,
    buildPictureAscii, buildPictureGame, buildPictureLooks, buildPicture, buildPictureFile, OUT_DIR
};

if (require.main === module) {
    const args = process.argv.slice(2);
    const ascii = args.includes('--ascii');
    const game = buildPictureGame();
    const all = vm.runInContext('Object.keys(CONSTRUCTION_DESIGNS)', game.context);
    const names = args.filter((arg) => !arg.startsWith('--'));
    for (const name of names) if (!all.includes(name)) throw new Error(`No design ${name}: ${all.join(', ')}`);
    const looks = buildPictureLooks(game.world);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    let total = 0;
    for (const name of names.length ? names : all) {
        const picture = buildPicture(game, name, looks);
        const stats = buildPictureStats(picture);
        total += picture.bytes.length;
        const where = `entrance at column ${Math.round((picture.entrance[0] / picture.width) * 100)} of 100, row ${Math.round((picture.entrance[1] / picture.width) * 50)}`;
        console.log(`${name}: ${picture.width}x${picture.height}, tile ${picture.tile}, ${picture.turns} turns, ${(picture.bytes.length / 1024).toFixed(1)} KB, ` +
            `${(stats.painted * 100).toFixed(1)}% painted, ${stats.colours} colours, ${where}`);
        if (ascii) console.log(buildPictureAscii(picture));
        else fs.writeFileSync(buildPictureFile(name), picture.bytes);
    }
    if (!ascii) console.log(`${(total / 1024).toFixed(1)} KB in all: ${path.relative(ROOT, OUT_DIR)}`);
}
