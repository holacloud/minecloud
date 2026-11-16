// /build palace_oriental: the Cherry Blossom Palace, an imperial palace of East Asia in a cherry forest, in
// the spirit of the Forbidden City (an original plan, not a copy). Loaded after construction_palace_common.js;
// it only adds an entry to CONSTRUCTION_DESIGNS. Everything of this palace lives in this file (and its test,
// test/js/construction_palace_oriental.test.js).
// - The plan: a walled rectangle; a gate tower in the middle of the front wall; then one straight axis of
//   courts going back from it, each hall bigger and higher on white terraces than the one before: the outer
//   court with its stream and three bridges, the Gate of Harmony, the great court, the Hall of Supreme Harmony
//   (the throne, on three terraces under a roof of two tiers), the Palace of Heavenly Purity (audiences in
//   front, the emperor's rooms behind), and through a moon gate the imperial garden.
// - Either side of the axis, behind red walls, a band of side courts: on the west the kitchen and the banquet
//   hall, the granary and the treasury, the ancestral shrine and the consorts' residence; on the east the
//   servants' quarters and the stables, the library pavilion (two floors) and the prince's residence with its
//   bath.
// - The garden: a pond with the koi pavilion on it (its science room: koi colours are inherited, and breeders
//   choose the parents), a zigzag bridge and an arched one, rockeries, cherry trees, stone lanterns, a tea
//   pavilion, a pagoda of five floors and a greenhouse for plant breeding.
// - Halls (constructionPalaceOrientalHall): columns of red glazed tile (lacquer), screens of lattice between
//   them, a band of blue and green brackets, a coffered ceiling and a hipped roof of glazed tiles, yellow for
//   the emperor's halls and green for the rest, whose eaves curl up at the corners
//   (constructionPalaceOrientalRoof). Every floor above another is reached by stairs, never ladders.
// - Local x across (MID on the axis), z going in from the front (z = 0 nearest the player): walking in is 's'
//   in the facings of the blocks. The box mirrors across the axis with b.sym where the plan is symmetric.

const PALACE_ORIENTAL_SIZE = [137, 50, 161];
const PALACE_ORIENTAL_GROUND = 6;
const PALACE_ORIENTAL_RIM = 12;
const PALACE_ORIENTAL_MID = 68;

// The weathered paving of the courts, and the floors of the halls.
const PALACE_ORIENTAL_PAVING = [['stone_bricks', 70], ['stone', 18], ['cobblestone', 12]];

function constructionPalaceOrientalHas(b, x, y, z) {
    const [w, , d] = b.size;
    return b.cells.has((y * d + z) * w + (b.flipped ? w - 1 - x : x));
}

// The block drawn so far at a local cell, or undefined.
function constructionPalaceOrientalTypeAt(b, x, y, z) {
    const [w, , d] = b.size;
    const cell = b.cells.get((y * d + z) * w + (b.flipped ? w - 1 - x : x));
    return cell && cell.type;
}

// A hipped roof of glazed tiles (colour: 'yellow', 'green'...) over x0..x1, z0..z1 (the eaves included), its eave
// at layer y: a ring of slabs, then rings of stairs, one higher each, inwards to a ridge along the longer side.
// By the four corners the eave curls up (stairs turned outwards, a slab on the corner), the way the eaves of a
// Chinese hall flare. It stops before ring `stop` (a roof of two tiers: the clerestory stands there). The short
// side must be odd, so the ridge is one line. Returns the layer of the top of the ridge.
function constructionPalaceOrientalRoof(b, x0, z0, x1, z1, y, colour, stop = Infinity) {
    const tile = `${colour}_glazed_tile`;
    const stairs = `${tile}_stairs`;
    const slab = `${tile}_slab`;
    if (Math.min(x1 - x0, z1 - z0) % 2 !== 0) throw new Error(`A roof needs an odd side: ${x0},${z0} to ${x1},${z1}`);
    const outward = { s: 'n', n: 's', e: 'w', w: 'e' };
    let top = y;
    for (let k = 0; k < stop; k++) {
        const [ax, az, bx, bz] = [x0 + k, z0 + k, x1 - k, z1 - k];
        if (ax > bx || az > bz) break;
        const h = k <= 1 ? y : y + k - 1;
        top = h;
        if (az === bz || ax === bx) {
            // The ridge, a crest of slabs on it and a gold beast at each end.
            for (let z = az; z <= bz; z++) {
                for (let x = ax; x <= bx; x++) {
                    b.set(x, h, z, tile);
                    b.set(x, h + 1, z, slab);
                }
            }
            b.set(ax, h + 1, az, 'gold_block');
            b.set(bx, h + 1, bz, 'gold_block');
            return h + 1;
        }
        for (let z = az; z <= bz; z++) {
            for (let x = ax; x <= bx; x++) {
                if (x !== ax && x !== bx && z !== az && z !== bz) continue;
                const side = z === az ? 's' : z === bz ? 'n' : x === ax ? 'e' : 'w';
                if (k > 0) {
                    b.stairs(x, h, z, stairs, side);
                    continue;
                }
                const corner = (x === ax || x === bx) && (z === az || z === bz);
                const byCorner = ((z === az || z === bz) && Math.min(x - ax, bx - x) <= 2) || ((x === ax || x === bx) && Math.min(z - az, bz - z) <= 2);
                if (corner) {
                    b.stairs(x, h, z, stairs, outward[side]);
                    b.set(x, h + 1, z, slab);
                } else if (byCorner) {
                    b.stairs(x, h, z, stairs, outward[side]);
                } else {
                    b.set(x, h, z, slab);
                }
            }
        }
    }
    return top;
}

// The walls of a hall, layer by layer from its floor: 'w' red stucco, 's' a screen between the columns, 'b'
// dark wood (a beam). Its default for a height h: a sill, screens, two layers of stucco under the eaves.
function constructionPalaceOrientalRows(h) {
    return 'w' + 's'.repeat(h - 3) + 'ww';
}

// A hall: floor at layer y (feet at y + 1), walls x0..x1, z0..z1, h high, a column of red glazed tile every
// `bay` cells, screens between them (rows: see constructionPalaceOrientalRows), a band of painted brackets and a
// coffered ceiling at y + h + 1, the roof above, `over` out from the walls. upper > 0 gives it a second tier: a
// clerestory `upper` in from the walls and a smaller roof on it. floor(x, z) gives the floor's block.
function constructionPalaceOrientalHall(b, { x0, z0, x1, z1, y, h, roof = 'green', over = 2, upper = 0, bay = 3, screen = 'lattice_screen', rows, floor, ceiling = true }) {
    const pattern = rows || constructionPalaceOrientalRows(h);
    const floorOf = floor || (() => 'cherry_planks');
    for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
            const edge = x === x0 || x === x1 || z === z0 || z === z1;
            b.set(x, y, z, edge ? 'limestone' : floorOf(x, z));
            if (edge) {
                const column = ((x === x0 || x === x1) && ((z - z0) % bay === 0 || z === z1)) || ((z === z0 || z === z1) && ((x - x0) % bay === 0 || x === x1));
                for (let t = 1; t <= h; t++) {
                    const kind = pattern[t - 1] || 'w';
                    b.set(x, y + t, z, column ? 'red_glazed_tile' : kind === 's' ? screen : kind === 'b' ? 'dark_oak_planks' : 'red_stucco');
                }
                // The brackets: blue and green, gold over each column.
                b.set(x, y + h + 1, z, column ? 'gold_block' : (x + z) % 2 ? 'turquoise_glazed_tile' : 'blue_glazed_tile');
            } else if (ceiling) {
                const rib = (x - x0) % 3 === 0 || (z - z0) % 3 === 0;
                b.set(x, y + h + 1, z, rib ? 'dark_oak_planks' : (x + z) % 2 ? 'turquoise_glazed_tile' : 'blue_glazed_tile');
            }
        }
    }
    const yr = y + h + 2;
    if (!upper) return constructionPalaceOrientalRoof(b, x0 - over, z0 - over, x1 + over, z1 + over, yr, roof);
    const rings = over + upper;
    constructionPalaceOrientalRoof(b, x0 - over, z0 - over, x1 + over, z1 + over, yr, roof, rings);
    // The clerestory: red walls with lattice, from the lower roof to the upper one.
    const [cx0, cz0, cx1, cz1] = [x0 + upper, z0 + upper, x1 - upper, z1 - upper];
    const yc = yr + rings - 1;
    for (let yy = yr; yy <= yc; yy++) {
        for (let z = cz0; z <= cz1; z++) {
            for (let x = cx0; x <= cx1; x++) {
                if (x !== cx0 && x !== cx1 && z !== cz0 && z !== cz1) continue;
                const corner = (x === cx0 || x === cx1) && (z === cz0 || z === cz1);
                const band = yy === yc;
                b.set(x, yy, z, band ? ((x + z) % 2 ? 'turquoise_glazed_tile' : 'blue_glazed_tile') : corner ? 'red_glazed_tile' : yy === yc - 1 && (x + z) % 2 ? 'lattice_screen' : 'red_stucco');
            }
        }
    }
    return constructionPalaceOrientalRoof(b, cx0 - 1, cz0 - 1, cx1 + 1, cz1 + 1, yc + 1, roof);
}

// A terrace of white stone: limestone faces, a marble edge, a balustrade of pale fences with marble posts on the
// edge, but in the gaps (rectangles [x0, z0, x1, z1] where stairs come up). Its top layer is `top`; the inside is
// left hollow, nobody sees it.
function constructionPalaceOrientalTerrace(b, x0, z0, x1, z1, top, gaps = [], paving = 'limestone') {
    const G = PALACE_ORIENTAL_GROUND;
    const inGap = (x, z) => gaps.some(([gx0, gz0, gx1, gz1]) => x >= gx0 && x <= gx1 && z >= gz0 && z <= gz1);
    for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
            const edge = x === x0 || x === x1 || z === z0 || z === z1;
            if (edge) {
                for (let y = G + 1; y < top; y++) b.set(x, y, z, 'limestone');
                b.set(x, top, z, 'marble');
                if (!inGap(x, z)) {
                    const post = (x - x0) % 4 === 0 && (z === z0 || z === z1) || (z - z0) % 4 === 0 && (x === x0 || x === x1);
                    b.set(x, top + 1, z, post ? 'marble' : 'birch_fence');
                }
            } else {
                b.set(x, top, z, typeof paving === 'function' ? paving(x, z) : paving);
            }
        }
    }
}

// A flight of n stairs across x0..x1, the first at layer y and z, each one higher and one further in `facing`
// ('s': towards +z, 'n': towards -z), with stone under them down to layer `base`.
function constructionPalaceOrientalFlight(b, x0, x1, z, y, n, facing, stair = 'stone_brick_stairs', base = PALACE_ORIENTAL_GROUND + 1, fill = 'limestone') {
    const dz = facing === 's' ? 1 : -1;
    for (let i = 0; i < n; i++) {
        for (let x = x0; x <= x1; x++) {
            for (let yy = base; yy < y + i; yy++) b.set(x, yy, z + dz * i, fill);
            b.stairs(x, y + i, z + dz * i, stair, facing);
        }
    }
}

// A boundary wall, solid from the ground to layer top, with a little roof of yellow tiles along it: stairs on
// both edges and a ridge of slabs (along x when it runs along x).
function constructionPalaceOrientalWall(b, x0, z0, x1, z1, top, colour = 'yellow') {
    const G = PALACE_ORIENTAL_GROUND;
    const tile = `${colour}_glazed_tile`;
    const alongX = x1 - x0 >= z1 - z0;
    for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
            b.set(x, G + 1, z, 'limestone');
            for (let y = G + 2; y <= top; y++) b.set(x, y, z, 'red_stucco');
            const near = alongX ? z === z0 : x === x0;
            const far = alongX ? z === z1 : x === x1;
            if (near && !far) b.stairs(x, top + 1, z, `${tile}_stairs`, alongX ? 's' : 'e');
            else if (far && !near) b.stairs(x, top + 1, z, `${tile}_stairs`, alongX ? 'n' : 'w');
            else b.set(x, top + 1, z, tile);
            if (!near && !far || near && far) b.set(x, top + 2, z, `${tile}_slab`);
        }
    }
}

// A doorway through a wall (both its cells of thickness), w wide and h high from the ground, with a beam over it.
function constructionPalaceOrientalDoorway(b, x0, z0, x1, z1, h = 3) {
    const G = PALACE_ORIENTAL_GROUND;
    b.box(x0, G + 1, z0, x1, G + h, z1, null);
    b.box(x0, G + h + 1, z0, x1, G + h + 1, z1, 'red_glazed_tile');
}

// A moon gate: a round hole through a wall running along x, its middle at x = cx, layer G + 3, framed in white.
function constructionPalaceOrientalMoonGate(b, cx, z0, z1) {
    const G = PALACE_ORIENTAL_GROUND;
    for (let dy = -2; dy <= 3; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
            const d = Math.hypot(dx, dy);
            const y = G + 3 + dy;
            for (let z = z0; z <= z1; z++) {
                if (d <= 2.9) b.set(cx + dx, y, z, null);
                else if (d <= 3.9) b.set(cx + dx, y, z, 'white_stucco');
            }
        }
    }
    // The threshold, level with the ground.
    for (let z = z0; z <= z1; z++) b.box(cx - 2, G, z, cx + 2, G, z, 'marble');
}

// A stone lantern of the gardens: a base, a lantern standing in it, a cap.
function constructionPalaceOrientalStoneLantern(b, x, y, z) {
    b.set(x, y, z, 'stone_bricks');
    b.shaped(x, y + 1, z, 'lantern', 'lantern', { mount: 'floor' });
    b.set(x, y + 2, z, 'stone_bricks_slab');
}

// Lanterns hanging from the ceiling over layer y, every `step` cells, wherever the cells are free and there is
// something over them to hang from; `drop` lowers each on a cord (a chain of fences) that many cells, for a tall hall.
function constructionPalaceOrientalLanterns(b, x0, z0, x1, z1, y, step = 3, drop = 0) {
    const has = (x, yy, z) => constructionPalaceOrientalHas(b, x, yy, z);
    for (let z = z0; z <= z1; z += step) {
        for (let x = x0; x <= x1; x += step) {
            let free = has(x, y + 1, z);
            for (let yy = y - drop; free && yy <= y; yy++) free = !has(x, yy, z);
            if (!free) continue;
            for (let yy = y - drop + 1; yy <= y; yy++) b.set(x, yy, z, 'dark_oak_fence');
            b.shaped(x, y - drop, z, 'lantern', 'lantern', { mount: 'hanging' });
        }
    }
}

// A bathtub: the foot here, the head one block on the way it faces (as a bed).
function constructionPalaceOrientalBathtub(b, x, y, z, facing) {
    const [dx, dz] = SHAPE_DIRECTIONS[facing];
    b.shaped(x, y, z, 'bathtub', 'bathtub', { facing: b.facing(facing), part: 'foot' });
    b.shaped(x + dx, y, z + dz, 'bathtub', 'bathtub', { facing: b.facing(facing), part: 'head' });
}

// A wardrobe (two cells, storage) and what it holds once built, within the server's limits.
function constructionPalaceOrientalWardrobe(b, x, y, z, facing, items) {
    constructionPalaceStockCheck(items, (typeof STORAGE_KINDS === 'object' && STORAGE_KINDS.wardrobe) || 45);
    b.shaped(x, y, z, 'wardrobe', 'wardrobe', { half: 'lower', facing: b.facing(facing) });
    b.shaped(x, y + 1, z, 'wardrobe', 'wardrobe', { half: 'upper', facing: b.facing(facing) });
    b.stock(x, y, z, items);
}

function constructionPalaceOrientalThrone(b, x, y, z, base, facing) {
    b.shaped(x, y, z, base, 'throne', { half: 'lower', facing: b.facing(facing) });
    b.shaped(x, y + 1, z, base, 'throne', { half: 'upper', facing: b.facing(facing) });
}

// The tabletop objects (js/game/tabletop.js) that turn to face somebody; the rest have no facing.
const PALACE_ORIENTAL_TABLETOP_FACING = new Set(['open_book', 'book_stack', 'inkwell', 'scroll', 'tea_set', 'chessboard', 'sewing_basket']);

// Something left on a table, a desk or the floor: a letter half written, a meal half eaten, a game not finished.
// null leaves the surface bare.
function constructionPalaceOrientalTabletop(b, x, y, z, id, facing = 's') {
    if (!id) return;
    if (PALACE_ORIENTAL_TABLETOP_FACING.has(id)) b.shaped(x, y, z, id, id, { facing: b.facing(facing) });
    else b.set(x, y, z, id);
}

// One of `choices` (ids, or null for nothing), the same every time for that cell: rooms in a row differ.
function constructionPalaceOrientalTabletopPick(choices, x, y, z, salt) {
    return choices[Math.floor(constructionPalaceHash(x, y, z, salt) * choices.length) % choices.length];
}

// Paper screens slid across the windows of a room, as curtains are elsewhere: inside each bay of lattice
// between two columns of a hall's wall, a screen drawn across the whole bay, across half of it, or set aside,
// decided by the bay (roughly a third each). hall is what constructionPalaceOrientalHall was given; side is the
// wall ('n' z0, 's' z1, 'w' x0, 'e' x1); from..to limits it along the wall to the room. A cell where something
// already stands (a wardrobe, a mirror, a lamp) is left as it is.
function constructionPalaceOrientalShoji(b, hall, side, from, to, salt = 0) {
    const { x0, z0, x1, z1, y, h, bay = 3, screen = 'lattice_screen' } = hall;
    const pattern = hall.rows || constructionPalaceOrientalRows(h);
    const alongX = side === 'n' || side === 's';
    const start = alongX ? x0 : z0;
    const end = alongX ? x1 : z1;
    const wall = { n: z0, s: z1, w: x0, e: x1 }[side];
    const inner = wall + (side === 'n' || side === 'w' ? 1 : -1);
    const layers = [];
    for (let t = 1; t <= h; t++) if (pattern[t - 1] === 's') layers.push(y + t);
    const cell = (p) => (alongX ? [p, inner] : [inner, p]);
    for (let c = start; c < end; c += bay) {
        const bayCells = [];
        for (let p = c + 1; p < Math.min(c + bay, end); p++) if (p >= from && p <= to) bayCells.push(p);
        if (!bayCells.length) continue;
        const r = constructionPalaceHash(c, y, wall, salt + 29);
        const drawn = r < 0.34 ? bayCells : r < 0.67 ? bayCells.slice(0, Math.ceil(bayCells.length / 2)) : [];
        for (const p of drawn) {
            const [x, z] = cell(p);
            const [wx, wz] = alongX ? [p, wall] : [wall, p];
            // Only before a window: never across a door, nor where the bay is already taken.
            if (layers.some((yy) => constructionPalaceOrientalHas(b, x, yy, z) || constructionPalaceOrientalTypeAt(b, wx, yy, wz) !== screen)) continue;
            for (const yy of layers) b.set(x, yy, z, 'paper_screen');
        }
    }
}

// ---------------------------------------------------------------------------------------
// The parts of the plan, from the front to the back.

// The outer wall with its corner towers, the side walls between the axis and the side courts, the cross walls
// of the side courts and the wall of the garden, with their gates.
function constructionPalaceOrientalWalls(b) {
    const G = PALACE_ORIENTAL_GROUND;
    const top = G + 7;
    // The outer wall, 3 thick; the gate tower stands in its front.
    constructionPalaceOrientalWall(b, 20, 20, 46, 22, top);
    constructionPalaceOrientalWall(b, 90, 20, 116, 22, top);
    constructionPalaceOrientalWall(b, 20, 141, 116, 143, top);
    constructionPalaceOrientalWall(b, 20, 23, 22, 140, top);
    constructionPalaceOrientalWall(b, 114, 23, 116, 140, top);
    // A watch pavilion on each corner: columns and a double roof, on the wall.
    for (const [cx, cz] of [[21, 21], [115, 21], [21, 142], [115, 142]]) {
        for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) b.box(cx + dx, top + 1, cz + dz, cx + dx, top + 3, cz + dz, 'red_glazed_tile');
        b.box(cx - 2, top + 4, cz - 2, cx + 2, top + 4, cz + 2, 'blue_glazed_tile');
        constructionPalaceOrientalRoof(b, cx - 4, cz - 4, cx + 4, cz + 4, top + 5, 'yellow', 2);
        b.box(cx - 2, top + 5, cz - 2, cx + 2, top + 6, cz + 2, 'red_stucco');
        constructionPalaceOrientalRoof(b, cx - 3, cz - 3, cx + 3, cz + 3, top + 7, 'yellow');
    }
    // The walls of the axis, and their doors to the side courts.
    const inner = G + 5;
    constructionPalaceOrientalWall(b, 45, 23, 46, 109, inner);
    constructionPalaceOrientalWall(b, 90, 23, 91, 109, inner);
    // The cross walls of the side courts, and the wall of the garden.
    for (const z of [57, 81]) {
        constructionPalaceOrientalWall(b, 23, z, 44, z + 1, inner);
        constructionPalaceOrientalWall(b, 92, z, 113, z + 1, inner);
    }
    constructionPalaceOrientalWall(b, 23, 110, 113, 111, inner);
    b.sym(() => {
        for (const z of [40, 70, 96]) constructionPalaceOrientalDoorway(b, 45, z, 46, z + 1);
        for (const z of [57, 81]) constructionPalaceOrientalDoorway(b, 41, z, 42, z + 1);
        constructionPalaceOrientalDoorway(b, 33, 110, 34, 111);
    });
    constructionPalaceOrientalMoonGate(b, PALACE_ORIENTAL_MID, 110, 111);
}

// The gate tower: a red platform across the front of the axis with three arched ways through it and a guard room
// each side, ramps of stairs up its back, and the watch hall on top under a roof of two tiers.
function constructionPalaceOrientalGate(b) {
    const G = PALACE_ORIENTAL_GROUND;
    const M = PALACE_ORIENTAL_MID;
    const f = constructionFurnisher(b);
    const top = G + 8;
    for (let z = 20; z <= 29; z++) {
        for (let x = 47; x <= 89; x++) {
            b.set(x, G + 1, z, 'limestone');
            for (let y = G + 2; y < top; y++) b.set(x, y, z, 'red_stucco');
            b.set(x, top, z, constructionPalacePick(PALACE_ORIENTAL_PAVING, x, top, z, 3));
            const edge = z === 20 || x === 47 || x === 89 || z === 29;
            if (edge) b.set(x, top + 1, z, z === 29 ? 'birch_fence' : 'red_stucco');
        }
    }
    // The three ways through: the emperor's in the middle, arched, and one each side.
    b.box(M - 2, G + 1, 20, M + 2, G + 4, 29, null);
    b.box(M - 1, G + 5, 20, M + 1, G + 5, 29, null);
    b.box(M - 2, G, 20, M + 2, G, 29, 'marble');
    b.sym(() => {
        b.box(61, G + 1, 20, 63, G + 3, 29, null);
        b.set(62, G + 4, 20, null);
        b.set(62, G + 4, 29, null);
        b.box(61, G, 20, 63, G, 29, 'stone_bricks');
        // Lanterns in the ways.
        f.lantern(62, G + 3, 24);
        f.lantern(M - 2, G + 4, 22);
        f.lantern(M - 2, G + 4, 26);
        // The guard room, west of the side way: two beds, a table, a chest and a barrel.
        b.box(53, G + 1, 23, 59, G + 4, 27, null);
        b.box(53, G, 23, 59, G, 27, 'spruce_planks');
        b.door(60, G + 1, 25, 'dark_oak_door', 'w');
        constructionPalaceBed(b, 53, G + 1, 23, 'w');
        constructionPalaceBed(b, 53, G + 1, 25, 'w');
        constructionPalaceOrientalWardrobe(b, 53, G + 1, 27, 'e', b.flipped ? [['warm_coat', 2], ['leather', 6], ['blue_wool', 8]] : [['warm_coat', 2], ['fur', 4], ['red_wool', 8]]);
        b.set(56, G + 1, 25, 'table');
        // The guards off duty: a game left mid-way on one side, supper on the other.
        constructionPalaceOrientalTabletop(b, 56, G + 2, 25, b.flipped ? 'meal_plate' : 'chessboard', 'e');
        b.set(56, G + 1, 24, 'stool');
        b.set(56, G + 1, 26, 'stool');
        f.piece(55, G + 3, 27, 'red_banner', 'banner', 'n');
        f.piece(57, G + 3, 23, 'yellow_banner', 'banner', 's');
        f.lantern(55, G + 4, 25);
        f.lantern(58, G + 4, 24);
        b.set(59, G + 1, 27, 'barrel');
        b.stock(59, G + 1, 27, b.flipped ? [['cold_water', 12], ['bread', 16], ['salted_fish', 10]] : [['bread', 16], ['cheese', 8], ['honey_bottle', 4]]);
        constructionPalaceChest(b, 59, G + 1, 23, 'w', b.flipped
            ? [['torch', 32], ['lantern', 6], ['candle', 12], ['leather', 8]]
            : [['torch', 32], ['lantern', 4], ['red_wool', 8], ['warm_coat', 2]]);
        // The ramp up the back of the platform, from beside the side way to its corner.
        for (let i = 0; i < 8; i++) {
            const x = 58 - i;
            for (let z = 30; z <= 31; z++) {
                for (let y = G + 1; y < G + 1 + i; y++) b.set(x, y, z, 'red_stucco');
                b.stairs(x, G + 1 + i, z, 'stone_brick_stairs', 'w');
            }
            b.set(x, G + 2 + i, 32, 'birch_fence');
            b.set(x, G + 1 + i, 32, i ? 'red_stucco' : 'limestone');
            for (let y = G + 2; y <= G + i; y++) b.set(x, y, 32, 'red_stucco');
        }
        for (let x = 47; x <= 50; x++) {
            for (let z = 30; z <= 32; z++) {
                for (let y = G + 1; y < top; y++) b.set(x, y, z, 'red_stucco');
                b.set(x, top, z, 'stone_bricks');
            }
            b.set(x, top + 1, 32, 'birch_fence');
            b.set(x, top + 1, 29, null);
        }
        b.set(47, top + 1, 30, 'birch_fence');
        b.set(47, top + 1, 31, 'birch_fence');
        f.lanternPost(48, top + 1, 21, 'dark_oak_fence', 1);
    });
    // The watch hall on the platform.
    constructionPalaceOrientalHall(b, { x0: 54, z0: 21, x1: 82, z1: 27, y: top, h: 5, roof: 'yellow', over: 2, upper: 1, bay: 4, floor: (x, z) => ((x + z) % 2 ? 'dark_oak_planks' : 'spruce_planks') });
    for (const x of [M - 1, M, M + 1]) b.door(x, top + 1, 27, 'cherry_door', 'n', x === M + 1 ? 'right' : 'left');
    b.sym(() => {
        b.door(56, top + 1, 27, 'cherry_door', 'n');
        // A long council table, banners, a drum (a barrel of red wool) and the watchman's chest.
        b.box(60, top + 1, 24, 64, top + 1, 24, 'table');
        // The council has just risen: a chair turned away, a map unrolled, an order half written.
        for (let x = 60; x <= 64; x++) {
            f.piece(x, top + 1, 23, 'dark_oak_chair', 'chair', x === 63 ? 'w' : 's');
            f.piece(x, top + 1, 25, 'dark_oak_chair', 'chair', 'n');
            if (x % 2 === 0) b.set(x, top + 2, 24, 'candle');
        }
        constructionPalaceOrientalTabletop(b, 61, top + 2, 24, 'scroll', 's');
        constructionPalaceOrientalTabletop(b, 63, top + 2, 24, b.flipped ? 'jug' : 'inkwell', 'n');
        for (const x of [58, 62, 66]) f.piece(x, top + 3, 22, x === 62 ? 'yellow_banner' : 'red_banner', 'banner', 's');
        b.set(56, top + 1, 22, 'vase');
        b.set(70, top + 1, 22, 'red_wool');
        b.set(70, top + 2, 22, 'red_carpet');
    });
    constructionPalaceOrientalLanterns(b, 56, 22, 80, 26, top + 5, 3, 1);
    constructionPalaceChest(b, 79, top + 1, 22, 's', [['telescope', 1], ['star_chart', 2], ['candle', 12], ['anemometer', 1]]);
    constructionPalaceChest(b, 57, top + 1, 26, 'n', [['barometer', 1], ['thermometer', 1], ['lantern', 4], ['bread', 8]]);
    f.lantern(M, top + 5, 24);
    constructionPalaceSign(b, M + 2, top + 1, 25, 's', 'Torre de vigía', 'Watch hall');
}

// The front: the plaza before the gate, its guardian lions, the name of the palace; the outer court behind the
// gate with its stream and three bridges; the Gate of Harmony on its terrace; the great court.
function constructionPalaceOrientalCourts(b) {
    const G = PALACE_ORIENTAL_GROUND;
    const M = PALACE_ORIENTAL_MID;
    const f = constructionFurnisher(b);
    // The plaza and the way in, paved.
    for (let z = 12; z <= 19; z++) {
        for (let x = 52; x <= 84; x++) b.set(x, G, z, Math.abs(x - M) <= 2 ? 'marble' : constructionPalacePick(PALACE_ORIENTAL_PAVING, x, G, z, 5));
    }
    // The courts of the axis, paved, the emperor's way of marble down the middle.
    for (let z = 29; z <= 108; z++) {
        for (let x = 47; x <= 89; x++) b.set(x, G, z, Math.abs(x - M) <= 2 ? 'marble' : constructionPalacePick(PALACE_ORIENTAL_PAVING, x, G, z, 7));
    }
    b.sym(() => {
        b.set(61, G + 1, 17, 'marble');
        f.piece(61, G + 2, 17, 'statue', 'statue', 'n');
        constructionPalaceOrientalStoneLantern(b, 55, G + 1, 14);
        constructionPalaceOrientalStoneLantern(b, 55, G + 1, 18);
    });
    constructionPalaceSign(b, M - 4, G + 1, 14, 'n', 'Palacio del Cerezo', 'Cherry Blossom Palace');

    // The golden stream across the outer court, between banks with balustrades, and its three bridges.
    for (let x = 48; x <= 88; x++) {
        for (let z = 35; z <= 37; z++) {
            b.set(x, G - 2, z, 'limestone');
            b.set(x, G - 1, z, 'water');
            b.set(x, G, z, 'water');
        }
        for (const z of [34, 38]) {
            b.set(x, G, z, 'limestone');
            b.set(x, G + 1, z, x % 4 === 0 ? 'marble' : 'birch_fence');
        }
    }
    for (const z of [35, 36, 37]) {
        b.set(47, G, z, 'limestone');
        b.set(89, G, z, 'limestone');
    }
    for (const [x0, x1] of [[65, 71], [58, 62], [74, 78]]) {
        for (let x = x0; x <= x1; x++) {
            const rail = x === x0 || x === x1;
            for (let z = 35; z <= 37; z++) {
                b.set(x, G + 1, z, 'marble');
                if (rail) b.set(x, G + 2, z, 'birch_fence');
            }
            if (!rail) {
                b.stairs(x, G + 1, 34, 'stone_brick_stairs', 's');
                b.stairs(x, G + 1, 38, 'stone_brick_stairs', 'n');
            }
        }
    }
    b.sym(() => {
        for (const z of [33, 41]) f.lanternPost(52, G + 1, z, 'dark_oak_fence', 2);
        for (const z of [44, 48, 54, 57]) f.lanternPost(49, G + 1, z, 'dark_oak_fence', 2);
    });

    // The Gate of Harmony: a hall on a terrace, open through the middle, lions before it.
    const gaps = [[64, 43, 72, 43], [64, 49, 72, 49]];
    constructionPalaceOrientalTerrace(b, 52, 43, 84, 49, G + 2, gaps, (x) => (Math.abs(x - M) <= 2 ? 'marble' : 'limestone'));
    constructionPalaceMirrorZ(b, 92, (m) => constructionPalaceOrientalFlight(b, 64, 72, m.z(41), G + 1, 2, m.facing('s')));
    constructionPalaceOrientalHall(b, { x0: 56, z0: 44, x1: 80, z1: 48, y: G + 2, h: 6, roof: 'yellow', over: 2, bay: 4, floor: (x, z) => ((x + z) % 2 ? 'stone_bricks' : 'limestone') });
    for (const z of [44, 48]) b.box(M - 2, G + 3, z, M + 2, G + 6, z, null);
    b.sym(() => {
        f.piece(62, G + 3, 42, 'statue', 'statue', 'n');
        b.set(62, G + 2, 42, 'marble');
        b.set(62, G + 1, 42, 'limestone');
        b.door(62, G + 3, 48, 'cherry_door', 's');
        f.benches(57, 59, G + 3, 45, 's');
        f.benches(57, 59, G + 3, 47, 'n');
        f.piece(58, G + 7, 47, 'red_banner', 'banner', 'n');
        f.piece(63, G + 7, 45, 'yellow_banner', 'banner', 's');
        b.set(57, G + 3, 47, 'vase');
    });
    constructionPalaceOrientalLanterns(b, 57, 46, 79, 46, G + 8, 3, 2);
    constructionPalaceSign(b, M + 3, G + 3, 43, 'n', 'Puerta de la Armonía', 'Gate of Harmony');
}

// The Hall of Supreme Harmony: three terraces of white stone, stairs up the front and the back with a carved
// dragon way between them, and the throne hall under a roof of two tiers.
function constructionPalaceOrientalSupremeHall(b) {
    const G = PALACE_ORIENTAL_GROUND;
    const M = PALACE_ORIENTAL_MID;
    const f = constructionFurnisher(b);
    const tiers = [[50, 61, 86, 87, G + 2], [52, 63, 84, 85, G + 4], [54, 65, 82, 83, G + 6]];
    for (const [x0, z0, x1, z1, top] of tiers) {
        constructionPalaceOrientalTerrace(b, x0, z0, x1, z1, top, [[M - 3, z0, M + 3, z0], [M - 3, z1, M + 3, z1]], (x, z) => ((x + z) % 2 ? 'limestone' : 'marble'));
    }
    constructionPalaceMirrorZ(b, 148, (m) => {
        for (let i = 0; i < 6; i++) {
            const z = m.z(59 + i);
            const y = G + 1 + i;
            for (const x of [M - 3, M - 2, M + 2, M + 3]) {
                for (let yy = G + 1; yy < y; yy++) b.set(x, yy, z, 'limestone');
                b.stairs(x, y, z, 'stone_brick_stairs', m.facing('s'));
            }
            // The dragon way: carved stone the emperor was carried over, not stepped on.
            for (let x = M - 1; x <= M + 1; x++) {
                for (let yy = G + 1; yy < y; yy++) b.set(x, yy, z, 'marble');
                b.set(x, y, z, x === M ? 'yellow_glazed_tile' : 'marble');
            }
        }
    });
    // Bronze cranes and incense burners on the terraces: lanterns on posts.
    b.sym(() => {
        for (const z of [66, 82]) f.lanternPost(55, G + 7, z, 'dark_oak_fence', 2);
        for (const z of [64, 84]) f.lanternPost(53, G + 5, z, 'dark_oak_fence', 1);
        f.lanternPost(51, G + 3, 62, 'dark_oak_fence', 1);
        f.lanternPost(51, G + 3, 86, 'dark_oak_fence', 1);
        b.set(60, G + 7, 66, 'marble');
        f.piece(60, G + 8, 66, 'statue', 'statue', 'n');
    });

    // The hall.
    const y = G + 6;
    const floor = (x, z) => (Math.abs(x - M) <= 1 && z <= 76 ? 'red_wool' : (x + z) % 2 ? 'slate' : 'stone_bricks');
    constructionPalaceOrientalHall(b, { x0: 56, z0: 67, x1: 80, z1: 81, y, h: 9, roof: 'yellow', over: 3, upper: 3, bay: 5, floor, rows: 'wsssssww' + 'w' });
    for (const x of [M - 1, M, M + 1]) b.door(x, y + 1, 67, 'cherry_door', 's', x === M + 1 ? 'right' : 'left');
    b.sym(() => {
        b.doubleDoor(63, y + 1, 67, 62, 67, 'cherry_door', 's');
        // Columns inside, gold at the top.
        for (const x of [60, 64]) {
            for (const z of [71, 74]) {
                b.box(x, y + 1, z, x, y + 8, z, 'red_glazed_tile');
                b.set(x, y + 9, z, 'gold_block');
            }
        }
        // Banners down the side walls, yellow and red.
        for (const z of [69, 72, 75, 78]) f.piece(57, y + 7, z, z % 2 ? 'yellow_banner' : 'red_banner', 'banner', 'e');
        // Incense burners and cranes by the dais.
        f.lanternPost(62, y + 1, 76, 'dark_oak_fence', 1);
        f.lanternPost(62, y + 1, 79, 'dark_oak_fence', 1);
        b.set(58, y + 1, 80, 'vase');
        b.set(58, y + 1, 68, 'vase');
        b.set(58, y + 1, 72, 'flower_pot');
        // Chandeliers on chains from the coffered ceiling.
        for (const z of [70, 75]) {
            b.set(62, y + 9, z, 'dark_oak_fence');
            b.set(62, y + 8, z, 'chandelier');
        }
    });
    for (const z of [70, 74]) {
        b.set(M, y + 9, z, 'dark_oak_fence');
        b.set(M, y + 8, z, 'chandelier');
    }
    // The dais: two steps of marble, the throne on the top one facing the doors, a gold screen behind it.
    b.box(M - 5, y + 1, 76, M + 5, y + 1, 80, 'marble');
    for (let x = M - 2; x <= M + 2; x++) b.stairs(x, y + 1, 76, 'stone_brick_stairs', 's');
    b.box(M - 3, y + 2, 78, M + 3, y + 2, 80, 'marble');
    for (let x = M - 1; x <= M + 1; x++) b.stairs(x, y + 2, 78, 'stone_brick_stairs', 's');
    b.box(M - 5, y + 2, 77, M + 5, y + 2, 77, 'red_carpet');
    constructionPalaceOrientalThrone(b, M, y + 3, 79, 'lacquer_throne', 'n');
    b.box(M - 3, y + 3, 80, M + 3, y + 6, 80, 'gold_block');
    b.box(M - 1, y + 7, 80, M + 1, y + 7, 80, 'gold_block');
    b.sym(() => {
        f.lanternPost(M - 2, y + 3, 79, 'dark_oak_fence', 1);
        b.set(M - 3, y + 3, 78, 'vase');
        f.piece(M - 4, y + 4, 80, 'yellow_banner', 'banner', 'n');
        b.set(M - 5, y + 2, 79, 'candle');
    });
    constructionPalaceChest(b, M + 4, y + 2, 80, 'n', [['gold_leaf', 16], ['ruby', 4], ['sapphire', 4], ['candle', 16]]);
    // Palace lanterns on long cords, down to above the heads.
    constructionPalaceOrientalLanterns(b, 58, 69, 78, 79, y + 9, 4, 5);
    constructionPalaceSign(b, M + 3, y + 1, 69, 'n', 'Salón de la Armonía Suprema', 'Hall of Supreme Harmony');
}

// The Palace of Heavenly Purity: on one terrace; the hall of audience in front, behind a wall of paper screens the
// emperor's bedchamber, his study on the west and his bath on the east.
function constructionPalaceOrientalResidence(b) {
    const G = PALACE_ORIENTAL_GROUND;
    const M = PALACE_ORIENTAL_MID;
    const f = constructionFurnisher(b);
    constructionPalaceOrientalTerrace(b, 52, 92, 84, 107, G + 2, [[64, 92, 72, 92], [64, 107, 72, 107]], (x, z) => ((x + z) % 2 ? 'limestone' : 'marble'));
    constructionPalaceMirrorZ(b, 199, (m) => constructionPalaceOrientalFlight(b, 64, 72, m.z(90), G + 1, 2, m.facing('s')));
    const y = G + 2;
    const floor = (x, z) => (z <= 99 ? (Math.abs(x - M) <= 1 ? 'red_wool' : (x + z) % 2 ? 'dark_oak_planks' : 'cherry_planks') : 'cherry_planks');
    const hall = { x0: 55, z0: 94, x1: 81, z1: 106, y, h: 6, roof: 'yellow', over: 2, upper: 2, bay: 5, floor };
    constructionPalaceOrientalHall(b, hall);
    for (const x of [M - 1, M, M + 1]) b.door(x, y + 1, 94, 'cherry_door', 's', x === M + 1 ? 'right' : 'left');
    b.door(M, y + 1, 106, 'cherry_door', 's');
    // The wall of screens between the audience and the rooms, and the walls of the side rooms.
    b.box(56, y + 1, 100, 80, y + 6, 100, 'paper_screen');
    b.box(56, y + 6, 100, 80, y + 6, 100, 'dark_oak_planks');
    for (const x of [61, 75]) {
        b.box(x, y + 1, 101, x, y + 5, 105, 'paper_screen');
        b.box(x, y + 6, 101, x, y + 6, 105, 'dark_oak_planks');
    }
    b.door(M, y + 1, 100, 'cherry_door', 's');
    b.door(61, y + 1, 103, 'cherry_door', 'w');
    b.door(75, y + 1, 103, 'cherry_door', 'e');

    // The hall of audience: the jade throne on a step, ministers' benches, banners.
    b.box(M - 3, y + 1, 98, M + 3, y + 1, 99, 'marble');
    for (let x = M - 1; x <= M + 1; x++) b.stairs(x, y + 1, 98, 'stone_brick_stairs', 's');
    constructionPalaceOrientalThrone(b, M, y + 2, 99, 'jade_throne', 'n');
    b.sym(() => {
        b.set(M - 2, y + 2, 99, 'vase');
        b.set(M - 3, y + 2, 98, 'candle');
        for (const z of [96, 97, 98]) f.piece(58, y + 1, z, 'bench', 'bench', 'e');
        f.piece(56, y + 5, 97, 'red_banner', 'banner', 'e');
        f.piece(60, y + 5, 95, 'yellow_banner', 'banner', 's');
        f.lantern(59, y + 6, 97);
        f.lantern(64, y + 6, 96);
        b.set(57, y + 1, 95, 'vase');
    });
    f.lantern(M, y + 6, 97);
    constructionPalaceChest(b, 79, y + 1, 99, 'n', [['blueprint', 4], ['star_chart', 2], ['gold_leaf', 8], ['candle', 8]]);

    // The bedchamber: a wide bed between screens, wardrobes, a dressing table.
    constructionPalaceBed(b, M, y + 1, 105, 's');
    constructionPalaceBed(b, M + 1, y + 1, 105, 's');
    for (const x of [M - 1, M + 2]) f.piece(x, y + 1, 105, 'bedside_table', 'bedside_table', 'n');
    b.set(M - 1, y + 2, 105, 'table_lamp');
    b.set(M + 2, y + 2, 105, 'table_lamp');
    constructionPalaceOrientalWardrobe(b, 62, y + 1, 105, 'e', [['yellow_wool', 16], ['warm_coat', 1], ['fur', 4], ['gold_leaf', 4]]);
    constructionPalaceOrientalWardrobe(b, 74, y + 1, 105, 'w', [['red_wool', 16], ['feather', 8], ['white_wool', 8]]);
    constructionPalaceOrientalWardrobe(b, 62, y + 1, 101, 'e', [['warm_coat', 2], ['fur', 8], ['leather', 4]]);
    b.box(M - 2, y + 1, 102, M + 3, y + 1, 103, 'yellow_carpet');
    f.piece(M + 4, y + 2, 105, 'wall_mirror', 'wall_mirror', 'n');
    f.piece(M - 3, y + 3, 105, 'painting_peaks', 'painting', 'n');
    constructionPalaceChest(b, 74, y + 1, 101, 'w', [['warm_coat', 2], ['fur', 6], ['yellow_wool', 12], ['red_wool', 12], ['feather', 8]]);
    // A low tea table by the bed, the tea poured and left.
    b.set(65, y + 1, 104, 'table');
    constructionPalaceOrientalTabletop(b, 65, y + 2, 104, 'tea_set', 'e');
    b.set(64, y + 1, 104, 'stool');
    f.lantern(M, y + 6, 102);
    f.lantern(65, y + 6, 104);
    f.lantern(71, y + 6, 104);

    // The study: a desk, shelves of books, the emperor's maps.
    // A letter half written on the desk, the chair pushed back and turned; a map unrolled on the table beside it.
    f.piece(58, y + 1, 105, 'desk', 'desk', 'n');
    f.piece(58, y + 1, 103, 'dark_oak_chair', 'chair', 'e');
    constructionPalaceOrientalTabletop(b, 58, y + 2, 105, 'inkwell', 'n');
    b.set(59, y + 1, 105, 'table');
    constructionPalaceOrientalTabletop(b, 59, y + 2, 105, 'scroll', 'n');
    for (const z of [101, 102, 103]) f.piece(56, y + 1, z, 'bookshelf', 'bookshelf', 'e');
    for (const z of [101, 102, 103]) f.piece(56, y + 2, z, 'bookshelf', 'bookshelf', 'e');
    b.set(60, y + 1, 105, 'globe');
    constructionPalaceChest(b, 56, y + 1, 105, 'e', [['star_chart', 3], ['blueprint', 6], ['measuring_tape', 1], ['candle', 8]]);
    f.lantern(58, y + 6, 103);

    // The bath: a tub, a basin, a mirror.
    constructionPalaceOrientalBathtub(b, 77, y + 1, 105, 'e');
    f.piece(80, y + 1, 102, 'sink', 'sink', 'w');
    f.piece(80, y + 2, 101, 'wall_mirror', 'wall_mirror', 'w');
    f.piece(80, y + 1, 101, 'toilet', 'toilet', 'w');
    constructionPalaceChest(b, 76, y + 1, 101, 'e', [['white_wool', 12], ['soda_water', 6], ['salt', 8], ['candle', 6]]);
    f.lantern(78, y + 6, 103);
    b.set(79, y + 1, 105, 'flower_pot');
    constructionPalaceOrientalLanterns(b, 56, 95, 80, 105, y + 6, 3, 1);
    // Screens across the windows of the bedchamber and the study, some drawn, some set aside.
    constructionPalaceOrientalShoji(b, hall, 's', 62, 74, 1);
    constructionPalaceOrientalShoji(b, hall, 's', 56, 60, 2);
    constructionPalaceOrientalShoji(b, hall, 'w', 101, 105, 3);
    constructionPalaceSign(b, M + 3, y + 1, 96, 'n', 'Palacio de la Pureza Celestial', 'Palace of Heavenly Purity');
}

// The west side courts: the kitchen and the banquet hall, the granary and the treasury, the ancestral shrine, the
// consorts' residence.
function constructionPalaceOrientalWestCourts(b) {
    const G = PALACE_ORIENTAL_GROUND;
    const f = constructionFurnisher(b);
    const path = (x0, z0, x1, z1) => {
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) b.set(x, G, z, constructionPalacePick(PALACE_ORIENTAL_PAVING, x, G, z, 11));
        }
    };
    path(41, 23, 44, 109);
    path(26, 71, 40, 74);
    path(26, 105, 40, 109);

    // The kitchen: ovens on a brick hearth along the west wall, a sink, chopping tables, barrels of food.
    constructionPalaceOrientalHall(b, { x0: 26, z0: 25, x1: 40, z1: 37, y: G, h: 5, roof: 'green', floor: (x, z) => constructionPalacePick([['stone_bricks', 3], ['brick', 1]], x, G, z, 13) });
    b.door(40, G + 1, 30, 'dark_oak_door', 'w');
    for (let z = 26; z <= 36; z++) b.set(27, G + 3, z, 'brick');
    for (const z of [27, 29, 31, 33]) {
        f.oven(27, G + 1, z, 'e');
        b.set(27, G + 2, z, 'brick');
    }
    for (const z of [28, 30, 32]) {
        b.set(27, G + 1, z, 'brick');
        b.set(27, G + 2, z, 'flower_pot');
    }
    f.piece(27, G + 1, 35, 'sink', 'sink', 'e');
    b.set(27, G + 1, 36, 'workbench');
    for (let z = 29; z <= 33; z++) {
        b.set(32, G + 1, z, 'table');
        b.set(33, G + 1, z, 'table');
    }
    for (const z of [29, 31, 33]) {
        b.set(31, G + 1, z, 'stool');
        b.set(34, G + 1, z, 'stool');
    }
    b.set(32, G + 2, 30, 'vase');
    b.set(33, G + 2, 32, 'candle');
    b.set(32, G + 2, 33, 'candle');
    // The cooks' own meal, half eaten between the chopping, fruit waiting to be cut, a jug of water.
    constructionPalaceOrientalTabletop(b, 33, G + 2, 30, 'meal_plate');
    constructionPalaceOrientalTabletop(b, 32, G + 2, 31, 'fruit_bowl');
    constructionPalaceOrientalTabletop(b, 33, G + 2, 33, 'jug');
    const kitchenBarrels = [
        [[['wheat', 32], ['salt', 16], ['honeycomb', 8]]],
        [[['raw_fish', 16], ['salted_fish', 16], ['cooked_fish', 8]]],
        [[['bread', 32], ['cheese', 12], ['milk', 6]]],
        [[['honey_bottle', 8], ['roast_mushroom', 12], ['cold_water', 12]]]
    ];
    kitchenBarrels.forEach(([items], i) => constructionPalaceChest(b, 30 + 2 * i, G + 1, 36, 'n', items, 'barrel'));
    constructionPalaceChest(b, 39, G + 1, 26, 'w', [['bread', 24], ['cheese', 8], ['honey_bottle', 6], ['cooked_fish', 12]]);
    constructionPalaceChest(b, 37, G + 1, 26, 's', [['coal_ore', 32], ['planks', 32], ['bucket', 2], ['water_flask', 4]]);
    f.piece(39, G + 3, 36, 'wall_shelf', 'wall_shelf', 'n');
    constructionPalaceOrientalLanterns(b, 28, 26, 39, 36, G + 5);
    constructionPalaceSign(b, 41, G + 1, 28, 'e', 'Cocina imperial', 'Imperial kitchen');

    // The banquet hall: long low tables, benches, lanterns.
    constructionPalaceOrientalHall(b, { x0: 26, z0: 42, x1: 40, z1: 54, y: G, h: 5, roof: 'green', floor: (x, z) => ((x + z) % 2 ? 'cherry_planks' : 'dark_oak_planks') });
    b.door(40, G + 1, 47, 'dark_oak_door', 'w');
    for (const x of [30, 35]) {
        for (let z = 44; z <= 52; z++) {
            b.set(x, G + 1, z, 'table');
            if (z % 3 === 0) b.set(x, G + 2, z, 'candle');
            else if (z % 3 === 1) b.set(x, G + 2, z, 'vase');
            // Between the candles and the vases, what the guests have left: tea, fruit, a plate.
            else constructionPalaceOrientalTabletop(b, x, G + 2, z, constructionPalaceOrientalTabletopPick(['tea_set', 'fruit_bowl', 'meal_plate', null], x, G, z, 31), x === 30 ? 'e' : 'w');
        }
        for (let z = 44; z <= 52; z++) {
            f.piece(x - 1, G + 1, z, 'bench', 'bench', 'e');
            f.piece(x + 1, G + 1, z, 'bench', 'bench', 'w');
        }
    }
    b.box(29, G, 43, 37, G, 43, 'red_carpet');
    constructionPalaceOrientalThrone(b, 33, G + 1, 53, 'gilded_throne', 'n');
    f.piece(33, G + 3, 53, 'red_banner', 'banner', 'n');
    f.piece(27, G + 3, 48, 'painting_sunset', 'painting', 'e');
    constructionPalaceChest(b, 27, G + 1, 53, 'e', [['honey_bottle', 12], ['cheese', 12], ['bread', 24], ['soda_water', 8]]);
    constructionPalaceOrientalLanterns(b, 27, 43, 39, 53, G + 5);
    constructionPalaceSign(b, 41, G + 1, 45, 'e', 'Salón de banquetes', 'Banquet hall');
    // The well, between the two.
    b.box(42, G + 1, 39, 44, G + 1, 41, 'stone_bricks');
    b.set(43, G + 1, 40, 'water');
    b.box(43, G - 3, 40, 43, G, 40, 'water');
    b.set(42, G + 2, 39, 'dark_oak_fence');
    b.set(44, G + 2, 39, 'dark_oak_fence');
    b.box(42, G + 3, 39, 44, G + 3, 39, 'dark_oak_planks');
    f.lantern(43, G + 2, 39);

    // The granary (front) and the treasury (back), one building with a wall between them.
    constructionPalaceOrientalHall(b, { x0: 26, z0: 60, x1: 38, z1: 70, y: G, h: 5, roof: 'green', floor: () => 'spruce_planks', screen: 'iron_bars', rows: 'wwsww' });
    b.box(27, G + 1, 65, 37, G + 5, 65, 'red_stucco');
    b.door(38, G + 1, 62, 'dark_oak_door', 'w');
    b.door(38, G + 1, 67, 'dark_oak_door', 'w');
    const granary = [
        [['wheat', 64], ['wheat_seeds', 32], ['honeycomb', 8]],
        [['salt', 32], ['salted_fish', 24], ['honeycomb', 12]],
        [['wheat', 48], ['bread', 16], ['cheese', 12]],
        [['planks', 48], ['candle', 16], ['torch', 32]]
    ];
    granary.forEach((items, i) => constructionPalaceChest(b, 27, G + 1, 61 + i, 'e', items, 'barrel'));
    constructionPalaceChest(b, 30, G + 1, 61, 's', [['wheat_seeds', 32], ['fertilizer', 8], ['iron_hoe', 2], ['cherry_sapling', 4]]);
    b.box(32, G + 1, 61, 34, G + 2, 61, 'yellow_wool');
    b.box(33, G + 3, 61, 33, G + 3, 61, 'yellow_wool');
    constructionPalaceOrientalLanterns(b, 28, 61, 37, 64, G + 5);
    // The treasury: chests of gold and gems, gold ingots stacked, a guardian bust.
    constructionPalaceChest(b, 27, G + 1, 66, 'e', [['gold_leaf', 32], ['gold_ore', 12], ['ruby', 6], ['sapphire', 6]]);
    constructionPalaceChest(b, 27, G + 1, 68, 'e', [['bronze_ingot', 16], ['brass_ingot', 12], ['amber', 6], ['rust_pigment', 8]]);
    constructionPalaceChest(b, 30, G + 1, 69, 'n', [['gold_block', 2], ['white_glazed_tile', 16], ['blue_glazed_tile', 16], ['cobalt_glass', 8]]);
    b.box(33, G + 1, 69, 34, G + 1, 69, 'gold_block');
    b.set(33, G + 2, 69, 'gold_block');
    constructionPalaceOrientalWardrobe(b, 36, G + 1, 69, 'n', [['gold_leaf', 12], ['amber', 4], ['brass_ingot', 8], ['cobalt_glass', 4]]);
    b.set(27, G + 1, 67, 'marble');
    f.piece(27, G + 2, 67, 'statue', 'statue', 'e');
    constructionPalaceOrientalLanterns(b, 28, 66, 37, 69, G + 5);
    constructionPalaceSign(b, 39, G + 1, 61, 'e', 'Granero', 'Granary');
    constructionPalaceSign(b, 39, G + 1, 69, 'e', 'Tesoro imperial', 'Imperial treasury');

    // The ancestral shrine: an altar with candles and incense, the ancestors' tablets, red banners.
    constructionPalaceOrientalHall(b, { x0: 27, z0: 75, x1: 37, z1: 79, y: G, h: 5, roof: 'yellow', floor: (x, z) => ((x + z) % 2 ? 'slate' : 'stone_bricks') });
    b.door(32, G + 1, 75, 'cherry_door', 's');
    b.box(30, G + 1, 78, 34, G + 1, 78, 'marble');
    for (const x of [30, 32, 34]) b.set(x, G + 2, 78, 'candle');
    // Fruit offered to the ancestors, as families still do, between flowers.
    constructionPalaceOrientalTabletop(b, 31, G + 2, 78, 'fruit_bowl');
    b.set(33, G + 2, 78, 'flower_pot');
    f.piece(32, G + 3, 78, 'red_banner', 'banner', 'n');
    for (const x of [29, 35]) {
        f.piece(x, G + 3, 78, 'yellow_banner', 'banner', 'n');
        f.lanternPost(x, G + 1, 77, 'dark_oak_fence', 1);
    }
    b.set(28, G + 1, 76, 'vase');
    b.set(36, G + 1, 76, 'vase');
    constructionPalaceChest(b, 28, G + 1, 78, 'e', [['candle', 32], ['honey_bottle', 6], ['gold_leaf', 8], ['red_wool', 8]]);
    constructionPalaceOrientalLanterns(b, 28, 76, 36, 78, G + 5);
    constructionPalaceSign(b, 30, G + 1, 74, 'n', 'Santuario de los antepasados', 'Ancestral shrine');

    // The consorts' residence: a sitting room in front, two bedrooms behind a wall of paper screens.
    const consorts = { x0: 26, z0: 86, x1: 40, z1: 102, y: G, h: 5, roof: 'green', floor: (x, z) => ((x + z) % 2 ? 'cherry_planks' : 'birch_planks') };
    constructionPalaceOrientalHall(b, consorts);
    b.door(33, G + 1, 86, 'cherry_door', 's');
    b.door(40, G + 1, 90, 'cherry_door', 'w');
    b.box(27, G + 1, 93, 39, G + 5, 93, 'paper_screen');
    b.box(33, G + 1, 94, 33, G + 5, 101, 'paper_screen');
    b.door(30, G + 1, 93, 'cherry_door', 's');
    b.door(36, G + 1, 93, 'cherry_door', 's');
    // The sitting room: a low table on a carpet, cushions (stools), a zither on a table, scrolls.
    b.box(30, G + 1, 88, 36, G + 1, 91, 'pink_carpet');
    b.box(32, G + 1, 89, 34, G + 1, 90, 'table');
    b.set(33, G + 2, 89, 'vase');
    b.set(32, G + 2, 90, 'candle');
    // Tea for two, poured, and the embroidery put down beside it to drink.
    constructionPalaceOrientalTabletop(b, 34, G + 2, 90, 'tea_set', 'n');
    constructionPalaceOrientalTabletop(b, 34, G + 2, 89, 'sewing_basket', 's');
    for (const x of [32, 34]) {
        b.set(x, G + 1, 88, 'stool');
        b.set(x, G + 1, 91, 'stool');
    }
    f.piece(27, G + 3, 89, 'painting_meadow', 'painting', 'e');
    f.piece(39, G + 3, 88, 'painting_night', 'painting', 'w');
    b.set(27, G + 1, 87, 'flower_pot');
    b.set(39, G + 1, 92, 'flower_pot');
    constructionPalaceChest(b, 27, G + 1, 92, 'e', [['red_wool', 16], ['white_wool', 16], ['yellow_wool', 8], ['candle', 8]]);
    constructionPalaceOrientalLanterns(b, 27, 88, 39, 92, G + 5);
    for (const side of ['n', 'w', 'e']) constructionPalaceOrientalShoji(b, consorts, side, side === 'n' ? 27 : 87, side === 'n' ? 39 : 92, 5);
    for (const [x0, x1, wardrobe] of [[27, 32, 27], [34, 39, 39]]) {
        const mid = (x0 + x1) >> 1;
        constructionPalaceBed(b, mid, G + 1, 101, 's');
        f.piece(mid + 1, G + 1, 101, 'bedside_table', 'bedside_table', 'n');
        b.set(mid + 1, G + 2, 101, 'table_lamp');
        constructionPalaceOrientalWardrobe(b, wardrobe, G + 1, 97, wardrobe === 27 ? 'e' : 'w', wardrobe === 27 ? [['red_wool', 12], ['white_wool', 8], ['feather', 4]] : [['blue_wool', 12], ['yellow_wool', 8], ['fur', 2]]);
        f.piece(wardrobe, G + 3, 99, 'wall_mirror', 'wall_mirror', wardrobe === 27 ? 'e' : 'w');
        constructionPalaceChest(b, wardrobe, G + 1, 95, wardrobe === 27 ? 'e' : 'w', wardrobe === 27
            ? [['warm_coat', 1], ['white_wool', 12], ['fur', 4], ['feather', 6]]
            : [['warm_coat', 1], ['blue_wool', 12], ['fur', 4], ['honey_bottle', 2]]);
        b.box(mid - 1, G + 1, 96, mid + 1, G + 1, 98, 'red_carpet');
        // A small table by the screens, a stool at it, and on it what each consort was busy with.
        const tx = wardrobe === 27 ? 32 : 34;
        b.set(tx, G + 1, 95, 'table');
        b.set(tx + (wardrobe === 27 ? -1 : 1), G + 1, 95, 'stool');
        constructionPalaceOrientalTabletop(b, tx, G + 2, 95, wardrobe === 27 ? 'sewing_basket' : 'open_book', 'n');
        constructionPalaceOrientalLanterns(b, x0, 95, x1, 101, G + 5);
        // The windows: screens drawn, half drawn or set aside.
        constructionPalaceOrientalShoji(b, consorts, wardrobe === 27 ? 'w' : 'e', 94, 101, x0);
        constructionPalaceOrientalShoji(b, consorts, 's', x0, x1, x0 + 1);
    }
    constructionPalaceSign(b, 31, G + 1, 85, 'n', 'Residencia del oeste', 'West residence');
    for (const [x, z] of [[29, 106], [37, 106]]) constructionPalaceOrientalStoneLantern(b, x, G + 1, z);
}

// The east side courts: the servants' quarters and the stables, the library pavilion of two floors, the prince's
// residence with its bath.
function constructionPalaceOrientalEastCourts(b) {
    const G = PALACE_ORIENTAL_GROUND;
    const f = constructionFurnisher(b);
    const path = (x0, z0, x1, z1) => {
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) b.set(x, G, z, constructionPalacePick(PALACE_ORIENTAL_PAVING, x, G, z, 17));
        }
    };
    path(92, 23, 95, 109);
    path(96, 59, 110, 60);
    path(96, 105, 110, 109);

    // The servants' quarters: a dormitory of eight beds, wardrobes, a table.
    constructionPalaceOrientalHall(b, { x0: 96, z0: 25, x1: 110, z1: 37, y: G, h: 5, roof: 'green', floor: () => 'spruce_planks' });
    b.door(96, G + 1, 30, 'dark_oak_door', 'e');
    for (const z of [29, 31, 33, 35]) constructionPalaceBed(b, 109, G + 1, z, 'e');
    for (const x of [99, 101, 103, 105]) constructionPalaceBed(b, x, G + 1, 26, 'n');
    constructionPalaceOrientalWardrobe(b, 109, G + 1, 27, 'w', [['white_wool', 12], ['leather', 4], ['warm_coat', 2]]);
    constructionPalaceOrientalWardrobe(b, 107, G + 1, 26, 's', [['blue_wool', 12], ['fur', 4], ['warm_coat', 2]]);
    b.box(102, G + 1, 31, 104, G + 1, 32, 'table');
    for (const x of [102, 104]) {
        b.set(x, G + 1, 30, 'stool');
        b.set(x, G + 1, 33, 'stool');
    }
    b.set(103, G + 2, 31, 'candle');
    // The servants' supper, a jug, and a mending basket.
    constructionPalaceOrientalTabletop(b, 102, G + 2, 32, 'meal_plate');
    constructionPalaceOrientalTabletop(b, 104, G + 2, 31, 'jug');
    constructionPalaceOrientalTabletop(b, 104, G + 2, 32, 'sewing_basket', 'n');
    constructionPalaceChest(b, 97, G + 1, 36, 'e', [['white_wool', 16], ['blue_wool', 8], ['bread', 16], ['candle', 12]]);
    constructionPalaceChest(b, 109, G + 1, 36, 'w', [['leather', 8], ['warm_coat', 2], ['fur', 6], ['torch', 16]]);
    constructionPalaceChest(b, 97, G + 1, 26, 'e', [['bucket', 2], ['salt', 8], ['cold_water', 8], ['honey_bottle', 4]]);
    constructionPalaceOrientalLanterns(b, 97, 26, 109, 36, G + 5);
    constructionPalaceSign(b, 95, G + 1, 28, 'w', 'Cuarto del servicio', 'Servants\' quarters');

    // The stables: stalls behind fences, hay (yellow wool), troughs of water.
    constructionPalaceOrientalHall(b, { x0: 96, z0: 42, x1: 110, z1: 54, y: G, h: 5, roof: 'green', floor: (x, z) => (x >= 105 ? 'moss' : 'cobblestone'), rows: 'bssww' });
    b.box(96, G + 1, 47, 96, G + 3, 49, null);
    b.box(96, G, 47, 96, G, 49, 'cobblestone');
    for (let z = 43; z <= 53; z++) b.set(105, G + 1, z, 'dark_oak_fence');
    for (const z of [46, 50]) b.box(106, G + 1, z, 109, G + 1, z, 'dark_oak_fence');
    for (const z of [44, 48, 52]) {
        b.gate(105, G + 1, z, 'dark_oak_fence_gate', 'e');
        b.set(109, G, z, 'water');
        b.set(109, G + 1, z + 1, 'yellow_wool');
    }
    b.box(97, G + 1, 43, 98, G + 2, 43, 'yellow_wool');
    b.box(97, G + 1, 53, 98, G + 1, 53, 'yellow_wool');
    constructionPalaceChest(b, 97, G + 1, 45, 'e', [['wheat', 48], ['leather', 8], ['water_bucket', 1], ['iron_hoe', 1]]);
    constructionPalaceChest(b, 97, G + 1, 51, 'e', [['wheat', 48], ['wheat_seeds', 16], ['bucket', 2]], 'barrel');
    constructionPalaceOrientalLanterns(b, 97, 43, 109, 53, G + 5);
    constructionPalaceSign(b, 95, G + 1, 45, 'w', 'Caballerizas', 'Stables');

    // The library pavilion: two floors, stairs along the west wall, books everywhere.
    const rows = 'wsswww' + 'wssww';
    constructionPalaceOrientalHall(b, { x0: 96, z0: 61, x1: 110, z1: 77, y: G, h: 11, roof: 'green', over: 2, upper: 2, rows, floor: (x, z) => ((x + z) % 2 ? 'spruce_planks' : 'dark_oak_planks') });
    const y2 = G + 6;
    for (let z = 62; z <= 76; z++) {
        for (let x = 97; x <= 109; x++) b.set(x, y2, z, (x + z) % 2 ? 'spruce_planks' : 'dark_oak_planks');
    }
    b.door(103, G + 1, 61, 'dark_oak_door', 's');
    b.door(96, G + 1, 63, 'dark_oak_door', 'e');
    for (let i = 0; i < 6; i++) {
        for (const x of [97, 98]) {
            for (let yy = G + 1; yy < G + 1 + i; yy++) b.set(x, yy, 66 + i, 'dark_oak_planks');
            b.stairs(x, G + 1 + i, 66 + i, 'dark_oak_stairs', 's');
        }
    }
    b.box(97, y2, 68, 98, y2, 70, null);
    b.box(97, y2 + 1, 67, 98, y2 + 1, 67, 'birch_fence');
    b.box(99, y2 + 1, 67, 99, y2 + 1, 70, 'birch_fence');
    // Downstairs: the reading room. Shelves along the walls, desks, a globe and an astrolabe.
    for (let x = 98; x <= 109; x++) {
        if (x === 103) continue;
        f.piece(x, G + 1, 76, 'bookshelf', 'bookshelf', 'n');
        f.piece(x, G + 2, 76, 'bookshelf', 'bookshelf', 'n');
    }
    for (let z = 63; z <= 74; z++) {
        f.piece(109, G + 1, z, 'bookshelf', 'bookshelf', 'w');
        if (z % 3) f.piece(109, G + 2, z, 'bookshelf', 'bookshelf', 'w');
    }
    for (const [x, z] of [[102, 65], [105, 65], [102, 70], [105, 70]]) {
        f.piece(x, G + 1, z, 'desk', 'desk', 's');
        f.piece(x, G + 1, z - 1, 'dark_oak_chair', 'chair', 's');
        // Some readers have left their books open, others only a candle.
        const left = constructionPalaceOrientalTabletopPick(['open_book', 'book_stack', 'inkwell', null], x, G, z, 37);
        if (left) constructionPalaceOrientalTabletop(b, x, G + 2, z, left, 'n');
        else b.set(x, G + 2, z, 'candle');
    }
    b.set(101, G + 1, 73, 'globe');
    f.piece(106, G + 1, 73, 'astrolabe', 'astrolabe', 'n');
    constructionPalaceChest(b, 97, G + 1, 62, 'e', [['star_chart', 4], ['blueprint', 8], ['breeding_notebook', 2], ['measuring_tape', 2]]);
    constructionPalaceChest(b, 108, G + 1, 62, 'w', [['candle', 24], ['astrolabe', 1], ['globe', 1], ['sundial', 1]]);
    constructionPalaceOrientalLanterns(b, 100, 62, 109, 76, G + 5);
    f.lantern(98, G + 5, 63);
    f.lantern(98, G + 5, 75);
    f.lantern(99, G + 5, 66);
    f.lantern(98, G + 5, 73);
    // Upstairs: stacks of books in rows, a reading table under the windows.
    for (const z of [65, 69, 73]) {
        for (let x = 102; x <= 108; x++) {
            f.piece(x, y2 + 1, z, 'bookshelf', 'bookshelf', 'all');
            f.piece(x, y2 + 2, z, 'bookshelf', 'bookshelf', 'all');
        }
    }
    b.box(99, y2 + 1, 74, 100, y2 + 1, 75, 'table');
    b.set(99, y2 + 2, 74, 'candle');
    constructionPalaceOrientalTabletop(b, 100, y2 + 2, 74, 'open_book', 'e');
    constructionPalaceOrientalTabletop(b, 99, y2 + 2, 75, 'book_stack', 'e');
    f.piece(101, y2 + 1, 75, 'dark_oak_chair', 'chair', 'w');
    f.piece(97, y2 + 3, 63, 'wall_shelf', 'wall_shelf', 'e');
    constructionPalaceChest(b, 97, y2 + 1, 75, 'e', [['star_chart', 2], ['telescope', 1], ['thermometer', 1], ['barometer', 1]]);
    constructionPalaceOrientalLanterns(b, 97, 62, 109, 76, y2 + 5);
    for (const z of [67, 71, 75]) f.lantern(105, y2 + 5, z);
    constructionPalaceSign(b, 101, G + 1, 60, 'n', 'Pabellón de la biblioteca', 'Library pavilion');

    // The prince's residence: a music room in front; behind it the bedroom and the bath house.
    const prince = { x0: 96, z0: 86, x1: 110, z1: 102, y: G, h: 5, roof: 'green', floor: (x, z) => ((x + z) % 2 ? 'cherry_planks' : 'spruce_planks') };
    constructionPalaceOrientalHall(b, prince);
    b.door(103, G + 1, 86, 'cherry_door', 's');
    b.door(96, G + 1, 90, 'cherry_door', 'e');
    b.box(97, G + 1, 93, 109, G + 5, 93, 'paper_screen');
    b.box(103, G + 1, 94, 103, G + 5, 101, 'paper_screen');
    b.door(100, G + 1, 93, 'cherry_door', 's');
    b.door(106, G + 1, 93, 'cherry_door', 's');
    // The music room.
    b.box(101, G + 1, 88, 105, G + 1, 91, 'light_blue_carpet');
    b.box(102, G + 1, 89, 104, G + 1, 89, 'table');
    b.set(103, G + 2, 89, 'vase');
    // Tea on the table and a song copied out halfway.
    constructionPalaceOrientalTabletop(b, 102, G + 2, 89, 'tea_set', 's');
    constructionPalaceOrientalTabletop(b, 104, G + 2, 89, 'scroll', 's');
    for (const x of [102, 104]) b.set(x, G + 1, 90, 'stool');
    f.piece(109, G + 3, 89, 'painting_peaks', 'painting', 'w');
    f.piece(97, G + 3, 91, 'painting_fish', 'painting', 'e');
    constructionPalaceChest(b, 109, G + 1, 92, 'w', [['blue_wool', 12], ['yellow_wool', 12], ['candle', 8], ['honey_bottle', 4]]);
    constructionPalaceOrientalLanterns(b, 97, 87, 109, 92, G + 5);
    for (const side of ['n', 'w', 'e']) constructionPalaceOrientalShoji(b, prince, side, side === 'n' ? 97 : 87, side === 'n' ? 109 : 92, 7);
    // West of the screens, a dressing room (6 by 3) in front and the bath (6 by 4) behind it: a bath of the
    // whole 6 by 8 was far bigger than a prince's washroom ever was.
    b.box(97, G + 1, 97, 102, G + 5, 97, 'paper_screen');
    b.door(100, G + 1, 97, 'cherry_door', 's');
    // The dressing room: a wardrobe, a stool before a mirror, the towels' chest.
    constructionPalaceOrientalWardrobe(b, 102, G + 1, 95, 'w', [['blue_wool', 8], ['white_wool', 8], ['warm_coat', 1]]);
    b.set(97, G + 1, 95, 'stool');
    f.piece(97, G + 2, 95, 'wall_mirror', 'wall_mirror', 'e');
    constructionPalaceChest(b, 102, G + 1, 94, 'w', [['white_wool', 16], ['soda_water', 6], ['salt', 8]]);
    // The bath: a tub, a basin under a mirror, a toilet.
    constructionPalaceOrientalBathtub(b, 98, G + 1, 100, 'e');
    f.piece(102, G + 1, 99, 'sink', 'sink', 'w');
    f.piece(102, G + 2, 99, 'wall_mirror', 'wall_mirror', 'w');
    f.piece(97, G + 1, 98, 'toilet', 'toilet', 'e');
    b.set(97, G + 1, 101, 'flower_pot');
    b.set(102, G + 1, 101, 'vase');
    constructionPalaceOrientalLanterns(b, 97, 94, 102, 101, G + 5);
    // Each side of the screens has its own light.
    f.lantern(101, G + 5, 96);
    f.lantern(98, G + 5, 98);
    // The bedroom, east.
    constructionPalaceBed(b, 106, G + 1, 101, 's');
    f.piece(107, G + 1, 101, 'bedside_table', 'bedside_table', 'n');
    b.set(107, G + 2, 101, 'table_lamp');
    constructionPalaceOrientalWardrobe(b, 109, G + 1, 97, 'w', [['green_wool', 12], ['warm_coat', 1], ['leather', 4]]);
    f.piece(109, G + 3, 99, 'wall_mirror', 'wall_mirror', 'w');
    constructionPalaceChest(b, 109, G + 1, 95, 'w', [['warm_coat', 1], ['fur', 4], ['green_wool', 12], ['feather', 6]]);
    b.box(105, G + 1, 96, 107, G + 1, 98, 'green_carpet');
    // The prince's lessons: a desk by the screens, the chair turned from it, his books piled on it.
    f.piece(104, G + 1, 95, 'desk', 'desk', 'e');
    f.piece(105, G + 1, 95, 'dark_oak_chair', 'chair', 's');
    constructionPalaceOrientalTabletop(b, 104, G + 2, 95, 'book_stack', 'e');
    constructionPalaceOrientalLanterns(b, 104, 94, 109, 101, G + 5);
    constructionPalaceOrientalShoji(b, prince, 'e', 94, 101, 8);
    constructionPalaceOrientalShoji(b, prince, 's', 104, 109, 9);
    constructionPalaceSign(b, 101, G + 1, 85, 'n', 'Residencia del este', 'East residence');
    for (const [x, z] of [[99, 106], [107, 106]]) constructionPalaceOrientalStoneLantern(b, x, G + 1, z);
}

// The koi pavilion on the pond: the garden's science room. A glass floor over the water, the breeders' chests
// and their record table, and signs about how colours are inherited.
function constructionPalaceOrientalKoiPavilion(b) {
    const G = PALACE_ORIENTAL_GROUND;
    const f = constructionFurnisher(b);
    // The deck over the water, a railing round it but where the bridges land.
    for (let z = 121; z <= 129; z++) {
        for (let x = 40; x <= 52; x++) {
            b.set(x, G, z, 'dark_oak_planks');
            if (x === 40 || x === 52 || z === 121 || z === 129) {
                const landing = (z === 121 && x >= 47 && x <= 49) || (x === 52 && z >= 124 && z <= 126);
                if (!landing) b.set(x, G + 1, z, 'birch_fence');
            }
        }
    }
    for (const [x, z] of [[40, 121], [52, 121], [40, 129], [52, 129]]) b.box(x, G - 2, z, x, G - 1, z, 'dark_oak_wood');
    constructionPalaceOrientalHall(b, { x0: 41, z0: 122, x1: 51, z1: 128, y: G, h: 4, roof: 'green', over: 2, bay: 4, rows: 'wssw', floor: (x, z) => (x >= 43 && x <= 49 && z >= 124 && z <= 126 ? 'glass' : 'cherry_planks') });
    b.door(46, G + 1, 122, 'cherry_door', 's');
    b.door(51, G + 1, 125, 'cherry_door', 'w');
    // Under the glass the water is deeper: a koi can be watched from above.
    for (let z = 124; z <= 126; z++) {
        for (let x = 43; x <= 49; x++) b.set(x, G - 3, z, 'water');
    }
    // The breeders' chests along the back, their record table, a lamp.
    constructionPalaceChest(b, 42, G + 1, 127, 'n', [['fish_egg', 16], ['raw_fish', 12], ['bucket', 2], ['water_bucket', 2]]);
    constructionPalaceChest(b, 44, G + 1, 127, 'n', [['fishing_rod', 3], ['fish_egg', 12], ['cooked_fish', 6], ['bug_net', 1]]);
    f.piece(47, G + 1, 127, 'desk', 'desk', 's');
    f.piece(47, G + 1, 126, 'oak_chair', 'chair', 'n');
    b.set(48, G + 1, 127, 'table');
    b.set(48, G + 2, 127, 'table_lamp');
    b.set(47, G + 2, 127, 'candle');
    constructionPalaceChest(b, 50, G + 1, 127, 'n', [['breeding_notebook', 3], ['measuring_tape', 1], ['thermometer', 1], ['candle', 8]]);
    f.piece(42, G + 3, 123, 'painting_fish', 'painting', 's');
    f.piece(50, G + 3, 123, 'painting_fish', 'painting', 's');
    constructionPalaceOrientalLanterns(b, 43, 123, 49, 127, G + 4, 3);
    f.lantern(46, G + 4, 125);
    // The signs, one or two sentences each, Spanish then English.
    constructionPalaceSign(b, 42, G + 1, 123, 's', 'Pabellón de las carpas', 'Koi pavilion');
    constructionPalaceSign(b, 42, G + 1, 125, 'e',
        'Cada carpa recibe genes de su madre y de su padre. Los genes deciden sus colores: por eso las crías se parecen a sus padres.',
        'Each koi gets genes from its mother and its father. Genes decide its colours, so the young look like their parents.');
    constructionPalaceSign(b, 50, G + 1, 123, 's',
        'Los criadores eligen qué carpas tienen crías. Cruzando colores raros, generación tras generación, salen colores nuevos.',
        'Breeders choose which koi have young. Crossing rare colours, generation after generation, they get new colours.');
    constructionPalaceSign(b, 50, G + 1, 124, 'w',
        'En MineCloud también crías animales y ves sus genes: prueba el cuaderno de cría y el tema de Genética de la guía.',
        'In MineCloud you breed animals and see their genes too: try the breeding notebook and the Genetics topic of the guide.');
}

// The pagoda: five floors of 9 by 9, eaves of green tile round each, stairs up along the west wall and the east
// wall by turns, a yellow roof and a gold spire on top.
function constructionPalaceOrientalPagoda(b, cx, cz) {
    const G = PALACE_ORIENTAL_GROUND;
    const f = constructionFurnisher(b);
    const [x0, z0, x1, z1] = [cx - 4, cz - 4, cx + 4, cz + 4];
    b.box(x0 - 1, G + 1, z0 - 1, x1 + 1, G + 1, z1 + 1, 'limestone');
    b.set(cx, G + 1, z0 - 2, 'stone_bricks_slab');
    const floors = 5;
    for (let k = 0; k < floors; k++) {
        const y = G + 1 + 5 * k;
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                const edge = x === x0 || x === x1 || z === z0 || z === z1;
                b.set(x, y, z, edge ? 'limestone' : (x + z) % 2 ? 'dark_oak_planks' : 'spruce_planks');
                if (!edge) continue;
                const column = (x === x0 || x === x1) && (z === z0 || z === z1 || z === cz) || (z === z0 || z === z1) && x === cx;
                for (let t = 1; t <= 4; t++) {
                    const window = !column && (t === 2 || t === 3) && (Math.abs(x - cx) === 2 || Math.abs(z - cz) === 2);
                    b.set(x, y + t, z, column ? 'red_glazed_tile' : window ? 'lattice_screen' : 'red_stucco');
                }
            }
        }
        // The eave round this floor: slabs, stairs against the wall, curled corners.
        const ye = y + 5;
        constructionPalaceOrientalRoof(b, x0 - 2, z0 - 2, x1 + 2, z1 + 2, ye, 'green', 2);
        for (let z = z0 - 1; z <= z1 + 1; z++) {
            for (let x = x0 - 1; x <= x1 + 1; x++) {
                if (x === x0 - 1 || x === x1 + 1 || z === z0 - 1 || z === z1 + 1) b.set(x, ye - 1, z, (x + z) % 2 ? 'turquoise_glazed_tile' : 'blue_glazed_tile');
            }
        }
        for (const [dx, dz] of [[0, 0], [-2, -2], [2, -2], [-2, 2], [2, 2]]) f.lantern(cx + dx, y + 4, cz + dz);
        if (k === floors - 1) continue;
        // The stairs to the next floor; the floor above is drawn by the next round, then holed here.
        const west = k % 2 === 0;
        const sx = west ? x0 + 1 : x1 - 1;
        for (let i = 0; i < 5; i++) {
            const z = west ? z0 + 2 + i : z1 - 2 - i;
            for (let yy = y + 1; yy < y + 1 + i; yy++) b.set(sx, yy, z, 'dark_oak_planks');
        }
    }
    // The ceiling of the top floor and the roof with its spire.
    const yTop = G + 1 + 5 * floors;
    for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
            if (x === x0 || x === x1 || z === z0 || z === z1) b.set(x, yTop, z, (x + z) % 2 ? 'turquoise_glazed_tile' : 'blue_glazed_tile');
            else b.set(x, yTop, z, 'dark_oak_planks');
        }
    }
    const peak = constructionPalaceOrientalRoof(b, x0 - 2, z0 - 2, x1 + 2, z1 + 2, yTop + 1, 'yellow');
    b.box(cx, peak + 1, cz, cx, peak + 3, cz, 'gold_block');
    b.set(cx, peak + 4, cz, 'copper_block');
    // Now the stairs and the holes over them (the floors are all drawn).
    for (let k = 0; k < floors - 1; k++) {
        const y = G + 1 + 5 * k;
        const west = k % 2 === 0;
        const sx = west ? x0 + 1 : x1 - 1;
        const zAt = (i) => (west ? z0 + 2 + i : z1 - 2 - i);
        for (let i = 0; i < 5; i++) b.stairs(sx, y + 1 + i, zAt(i), 'dark_oak_stairs', west ? 's' : 'n');
        // A hole in the floor above the last three stairs, for the head.
        for (let i = 1; i <= 3; i++) b.set(sx, y + 5, zAt(i), null);
        // A railing round the hole, on the floor above.
        b.set(sx, y + 6, zAt(0), 'birch_fence');
        const inner = sx + (west ? 1 : -1);
        for (let i = 0; i <= 3; i++) b.set(inner, y + 6, zAt(i), 'birch_fence');
    }
    b.door(cx, G + 2, z0, 'cherry_door', 's');
    // On each floor something to see: an altar with a bust, benches at the windows, a lookout's chest at the top.
    b.set(cx, G + 2, z1 - 1, 'marble');
    f.piece(cx, G + 3, z1 - 1, 'statue', 'statue', 'n');
    b.set(cx - 1, G + 2, z1 - 1, 'candle');
    b.set(cx + 1, G + 2, z1 - 1, 'candle');
    for (let k = 1; k < floors; k++) {
        const y = G + 1 + 5 * k;
        f.piece(cx, y + 1, k % 2 ? z0 + 1 : z1 - 1, 'bench', 'bench', k % 2 ? 'n' : 's');
        b.set(cx + (k % 2 ? 2 : -2), y + 1, cz, 'flower_pot');
    }
    constructionPalaceChest(b, cx - 2, G + 1 + 5 * (floors - 1) + 1, z0 + 1, 's', [['telescope', 1], ['star_chart', 2], ['candle', 8]]);
    constructionPalaceSign(b, cx - 2, G + 1, z0 - 3, 'n', 'Pagoda de cinco pisos', 'Five-storey pagoda');
}

// The imperial garden behind the moon gate: the pond and the koi pavilion with its two bridges, rockeries, cherry
// trees, stone lanterns, the tea pavilion, the pagoda and the greenhouse.
function constructionPalaceOrientalGarden(b) {
    const G = PALACE_ORIENTAL_GROUND;
    const M = PALACE_ORIENTAL_MID;
    const f = constructionFurnisher(b);
    const put = constructionPalacePut(b);
    const pond = (x, z) => ((x - 46) / 16.5) ** 2 + ((z - 125) / 9.5) ** 2 <= 1;
    // Paths of stone from the moon gate.
    const path = (x0, z0, x1, z1) => {
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) b.set(x, G, z, constructionPalacePick([['stone_bricks', 5], ['cobblestone', 2], ['moss', 1]], x, G, z, 19));
        }
    };
    path(M - 1, 112, M + 1, 118);
    path(37, 112, 112, 113);
    path(M - 1, 118, M + 1, 136);
    path(66, 124, 92, 125);
    path(84, 126, 85, 136);
    path(32, 112, 35, 113);
    path(99, 114, 101, 119);
    path(107, 114, 108, 132);
    path(104, 131, 108, 132);
    // The pond: three deep, a bed of sand, a shore of stone and rockeries.
    for (let z = 113; z <= 137; z++) {
        for (let x = 27; x <= 65; x++) {
            if (pond(x, z)) {
                b.set(x, G - 3, z, 'sand');
                for (let y = G - 2; y <= G; y++) b.set(x, y, z, 'water');
            } else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => pond(x + dx, z + dz))) {
                b.set(x, G, z, 'limestone');
            }
        }
    }
    constructionPalaceOrientalKoiPavilion(b);
    // The zigzag bridge from the garden path to the pavilion: low, plank, rails over the water.
    const zig = new Set();
    const lay = (x0, z0, x1, z1) => {
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) zig.add(`${x},${z}`);
        }
    };
    lay(44, 114, 45, 118);
    lay(44, 118, 50, 119);
    lay(48, 119, 49, 120);
    for (const key of zig) {
        const [x, z] = key.split(',').map(Number);
        b.set(x, G, z, 'dark_oak_planks');
        b.set(x, G - 1, z, 'dark_oak_wood');
    }
    for (const key of zig) {
        const [x, z] = key.split(',').map(Number);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const [nx, nz] = [x + dx, z + dz];
            if (zig.has(`${nx},${nz}`) || !pond(nx, nz) || (nz >= 121 && nx >= 40 && nx <= 52)) continue;
            b.set(nx, G + 1, nz, 'birch_fence');
        }
    }
    // The arched bridge from the pavilion to the east shore.
    const arch = [[53, 1, 'e'], [54, 2, 'e'], [55, 2, null], [56, 2, null], [57, 2, null], [58, 2, null], [59, 2, null], [60, 2, null], [61, 2, 'w'], [62, 1, 'w']];
    for (const [x, rise, facing] of arch) {
        for (let z = 124; z <= 127; z++) {
            const y = G + rise;
            const rail = z === 124 || z === 127;
            for (let yy = G + 1; yy < y; yy++) b.set(x, yy, z, 'marble');
            if (rail) {
                b.set(x, y, z, 'marble');
                b.set(x, y + 1, z, 'birch_fence');
            } else if (facing) b.stairs(x, y, z, 'stone_brick_stairs', facing);
            else b.set(x, y, z, 'marble');
        }
    }
    for (let z = 124; z <= 127; z++) {
        b.set(63, G, z, 'stone_bricks');
        b.set(64, G, z, 'stone_bricks');
        b.set(65, G, z, 'stone_bricks');
    }
    // Rockeries: boulders of three stones round the shore, and in the west a high rock that steps down to the
    // water, moss on its top.
    const rocks = [[29, 117, 'granite'], [31, 133, 'limestone'], [38, 136, 'stone'], [58, 116, 'granite'], [62, 132, 'limestone'], [27, 125, 'stone'], [54, 135, 'granite']];
    for (const [x, z, stone] of rocks) constructionPalaceTree(put, `boulder:${stone}`, x, G + 1, z, x * 7 + z);
    b.box(24, G + 1, 127, 25, G + 5, 131, 'granite');
    b.box(24, G + 6, 128, 25, G + 6, 130, 'moss');
    b.box(26, G + 1, 128, 26, G + 4, 130, 'granite');
    b.box(27, G + 1, 128, 27, G + 2, 130, 'granite');
    b.box(28, G + 1, 129, 28, G + 1, 129, 'granite');
    // Cherry trees round the garden.
    const trees = [[30, 138], [60, 139], [74, 117], [82, 138], [91, 117], [111, 121], [76, 139], [26, 115]];
    // The tea pavilion: an open pavilion of four columns by the path, a table, stools and a chest.
    const [tx0, tz0, tx1, tz1] = [72, 127, 78, 133];
    for (let z = tz0; z <= tz1; z++) {
        for (let x = tx0; x <= tx1; x++) b.set(x, G + 1, z, x === tx0 || x === tx1 || z === tz0 || z === tz1 ? 'marble' : 'cherry_planks');
    }
    b.set(75, G + 1, tz0 - 1, 'stone_bricks_slab');
    for (const [x, z] of [[tx0, tz0], [tx1, tz0], [tx0, tz1], [tx1, tz1]]) b.box(x, G + 2, z, x, G + 5, z, 'red_glazed_tile');
    for (let z = tz0; z <= tz1; z++) {
        for (let x = tx0; x <= tx1; x++) {
            const edge = x === tx0 || x === tx1 || z === tz0 || z === tz1;
            b.set(x, G + 6, z, edge ? ((x + z) % 2 ? 'turquoise_glazed_tile' : 'blue_glazed_tile') : 'dark_oak_planks');
        }
    }
    constructionPalaceOrientalRoof(b, tx0 - 2, tz0 - 2, tx1 + 2, tz1 + 2, G + 7, 'yellow');
    for (const x of [tx0 + 1, tx1 - 1]) b.box(x, G + 2, tz1, x, G + 2, tz1, 'birch_fence');
    b.set(75, G + 2, 130, 'table');
    // The tea is poured and the cups are still on the table.
    constructionPalaceOrientalTabletop(b, 75, G + 3, 130, 'tea_set', 's');
    for (const [x, z] of [[74, 130], [76, 130], [75, 131]]) b.set(x, G + 2, z, 'stool');
    constructionPalaceChest(b, 77, G + 2, 132, 'w', [['honey_bottle', 8], ['cold_water', 8], ['milk', 4], ['cheese', 6]]);
    f.lantern(75, G + 5, 130);
    f.lantern(73, G + 5, 128);
    f.lantern(77, G + 5, 128);
    constructionPalaceSign(b, 73, G + 2, 129, 'e', 'Pabellón del té', 'Tea pavilion');

    // The pagoda, east.
    constructionPalaceOrientalPagoda(b, 100, 126);

    // The greenhouse in the north-east corner: glass on a stone base, beds of red and yellow flowers, saplings,
    // and the gardener's chest.
    const [gx0, gz0, gx1, gz1] = [100, 133, 112, 139];
    for (let z = gz0; z <= gz1; z++) {
        for (let x = gx0; x <= gx1; x++) {
            const edge = x === gx0 || x === gx1 || z === gz0 || z === gz1;
            b.set(x, G, z, edge ? 'limestone' : 'stone_bricks');
            if (edge) {
                b.set(x, G + 1, z, 'limestone');
                b.box(x, G + 2, z, x, G + 4, z, 'glass');
            }
            b.set(x, G + 5, z, 'glass');
        }
    }
    b.door(104, G + 1, gz0, 'birch_door', 's');
    for (let x = gx0 + 1; x <= gx1 - 1; x++) {
        if (x === 104) continue;
        b.set(x, G, gz1 - 1, 'grass');
        b.set(x, G + 1, gz1 - 1, x % 2 ? 'flower_red' : 'flower_yellow');
    }
    for (let z = gz0 + 1; z <= gz1 - 2; z++) {
        b.set(gx1 - 1, G, z, 'grass');
        b.set(gx1 - 1, G + 1, z, z % 2 ? 'flower_red' : 'tall_grass');
    }
    b.set(gx0 + 1, G + 1, gz0 + 1, 'flower_pot');
    b.set(gx0 + 2, G + 1, gz0 + 1, 'flower_pot');
    f.piece(gx0 + 2, G + 1, gz0 + 3, 'desk', 'desk', 'w');
    b.set(gx0 + 2, G + 2, gz0 + 3, 'flower_pot');
    constructionPalaceChest(b, gx0 + 1, G + 1, gz0 + 4, 'e', [['cherry_sapling', 8], ['wheat_seeds', 24], ['fertilizer', 12], ['iron_hoe', 1], ['water_bucket', 1]]);
    f.lanternPost(gx0 + 5, G + 1, gz0 + 3, 'birch_fence', 1);
    f.lanternPost(gx0 + 9, G + 1, gz0 + 3, 'birch_fence', 1);
    constructionPalaceSign(b, gx0 + 6, G + 1, gz0 + 1, 's',
        'Para criar plantas nuevas, el jardinero lleva el polen de una flor a otra. Las semillas heredan genes de las dos plantas.',
        'To breed new plants, gardeners carry pollen from one flower to another. The seeds get genes from both plants.');
    // An orchard of cherries beside it, in rows.
    for (const x of [89, 95]) trees.push([x, 138]);

    // Stone lanterns along the paths.
    for (const [x, z] of [[M - 3, 115], [M + 3, 115], [M - 3, 121], [M + 3, 121], [M - 3, 134], [M + 3, 134], [88, 122], [92, 118], [110, 116], [38, 115], [56, 114]]) {
        constructionPalaceOrientalStoneLantern(b, x, G + 1, z);
    }
    for (const [x, z] of trees) constructionPalaceTree(put, 'cherry', x, G + 1, z, x + z);
    constructionPalaceSign(b, M + 2, G + 1, 113, 'n', 'Jardín imperial', 'Imperial garden');
}

function constructionPalaceOriental(b) {
    const [w, , d] = PALACE_ORIENTAL_SIZE;
    const G = PALACE_ORIENTAL_GROUND;
    const R = PALACE_ORIENTAL_RIM;
    // The land: grass and moss everywhere inside the rim, cherry trees in the belt round the walls.
    constructionPalaceGrounds(b, 'cherry', { x0: R, z0: R, x1: w - 1 - R, z1: d - 1 - R, y: G, decor: false });
    for (const [x0, x1] of [[R, 19], [117, w - 1 - R]]) {
        constructionPalaceGrounds(b, 'cherry', { x0, z0: 24, x1, z1: d - 1 - R, y: G, density: 0.06, salt: x0 });
    }
    constructionPalaceGrounds(b, 'cherry', { x0: R, z0: 144, x1: w - 1 - R, z1: d - 1 - R, y: G, density: 0.05, salt: 3 });
    constructionPalaceOrientalWalls(b);
    constructionPalaceOrientalGate(b);
    constructionPalaceOrientalCourts(b);
    constructionPalaceOrientalSupremeHall(b);
    constructionPalaceOrientalResidence(b);
    constructionPalaceOrientalWestCourts(b);
    constructionPalaceOrientalEastCourts(b);
    constructionPalaceOrientalGarden(b);
}

CONSTRUCTION_DESIGNS.palace_oriental = {
    label: 'Oriental palace',
    size: PALACE_ORIENTAL_SIZE,
    foundation: 'dirt',
    anchorX: PALACE_ORIENTAL_MID,
    groundY: PALACE_ORIENTAL_GROUND,
    rate: 480,
    start: [PALACE_ORIENTAL_MID, PALACE_ORIENTAL_GROUND + 1, 1],
    levels: [],
    site: constructionPalaceSite({ label: 'Oriental palace', theme: 'cherry', groundY: PALACE_ORIENTAL_GROUND, rim: PALACE_ORIENTAL_RIM }),
    generate: constructionPalaceOriental
};
