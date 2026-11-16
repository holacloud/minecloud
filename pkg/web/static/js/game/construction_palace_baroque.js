// /build palace_baroque: a French baroque palace on the plains, in the spirit of Versailles (not a copy of it):
// marble and limestone, slate mansards, a hall of mirrors, a formal garden with a grand canal; its science room
// is a cabinet of optics (reflection, mirrors that multiply candlelight, white light split into colours).
// Loaded after construction_palace_common.js; it only adds an entry to CONSTRUCTION_DESIGNS. Everything of this
// palace lives in this file (and test/js/construction_palace_baroque.test.js).
//
// The plan, strictly symmetric about x = 70 (b.sym draws the west half and its mirror), z growing away from the
// visitor, who arrives from z = 0:
//   z 12..17   the place d'armes, an avenue of limestone between rows of trees;
//   z 18       the gilded railing, iron bars between marble piers, with three gates of iron doors on the axis;
//   z 18..49   the cour d'honneur between the two wings, a marble court in front of the central pavilion;
//   z 22..50   the wings (x 18..38 and 102..122): the chapel (west) and the opera (east), each as tall as the
//              ground floor, the piano nobile and the attic, with a tribune and a royal box on the noble floor;
//   z 44..72   the corps de logis (x 18..122, the central pavilion x 58..82 coming forward to z = 44);
//   z 73..127  the garden: a terrace, the water parterre, parterres of hedges and flowers, the Latona fountain,
//              statues along the allée, the grand canal in a cross, bosquets, the orangery and the stables.
// Floor layers: 1 the cellars, 6 the ground floor, 13 the piano nobile, 21 the attic, 26 the roof (feet stand one
// above each). Rooms, by floor:
//   cellars   kitchens (west), wine and store cellar (east);
//   ground    vestibule, garden salon, the two grand staircases, baths (west), guard hall (east), banquet hall
//             (west, garden side), library (east, garden side), chapel nave, opera;
//   noble     throne room (over the vestibule), Hall of Mirrors (garden side), queen's apartment (west), king's
//             apartment (east), treasury and optics cabinet at the ends of the gallery, chapel tribune, royal box;
//   attic     servants' rooms off a long corridor, the servants' hall and the linen room in the middle.
// Two service stairs (x 19..25 and 115..121, z 60..71) go from the cellars to the attic; the grand staircases go
// from the ground floor to the piano nobile. Every room is lit (chandeliers, lanterns, candles).

const PALACE_BAROQUE_SIZE = [141, 48, 141];
const PALACE_BAROQUE_GROUND = 6;
const PALACE_BAROQUE_RIM = 12;
const PALACE_BAROQUE_MID = 70;
// The floor layers of the cellars, the piano nobile, the attic and the roof (the ground floor's is GROUND).
const PALACE_BAROQUE_CELLAR = 1;
const PALACE_BAROQUE_NOBLE = 13;
const PALACE_BAROQUE_ATTIC = 21;
const PALACE_BAROQUE_ROOF = 26;
// The service stairs: their lanes run along z from here (landings at both ends, see constructionPalaceBaroqueStairwell).
const PALACE_BAROQUE_STAIR_Z = 60;
// The seven colours white light splits into, in the order of a rainbow.
const PALACE_BAROQUE_SPECTRUM = ['red', 'orange', 'yellow', 'lime', 'light_blue', 'blue', 'purple'];

// Where a wall is in the rhythm of the facades: 0 a pilaster, 1 to 3 a window bay (2 its middle). Along x it
// counts from the axis, so both halves match; along z from the front of the wings.
function constructionPalaceBaroqueBay(x, z, alongX) {
    return alongX ? Math.abs(x - PALACE_BAROQUE_MID) % 4 : (((z - 22) % 4) + 4) % 4;
}

const PALACE_BAROQUE_INWARD = { n: 's', s: 'n', e: 'w', w: 'e' };

// One straight outer wall from (x0, z0) to (x1, z1), facing `out`: a rusticated ground floor (bands of stone
// bricks and limestone), a marble string course, the piano nobile with tall arched windows and a gold keystone,
// a marble band, the attic with small windows, a cornice and a balustrade with busts. Marble pilasters stand out
// of the wall between the bays and marble quoins at both ends. glass(x, y, z) is the pane of a window.
function constructionPalaceBaroqueFacade(b, x0, z0, x1, z1, out, glass = () => 'glass_pane') {
    const G = PALACE_BAROQUE_GROUND;
    const N = PALACE_BAROQUE_NOBLE;
    const A = PALACE_BAROQUE_ATTIC;
    const T = PALACE_BAROQUE_ROOF;
    const alongX = z0 === z1;
    const [ox, oz] = SHAPE_DIRECTIONS[out];
    const inward = PALACE_BAROQUE_INWARD[out];
    const [u0, u1] = alongX ? [x0, x1] : [z0, z1];
    for (let u = u0; u <= u1; u++) {
        const x = alongX ? u : x0;
        const z = alongX ? z0 : u;
        const corner = u === u0 || u === u1;
        const o = constructionPalaceBaroqueBay(x, z, alongX);
        for (let y = G; y <= T; y++) {
            let type = 'limestone';
            if (corner || y === N || y === A || y === T) type = 'marble';
            else if (y === G) type = 'stone_bricks';
            else if (y < N) type = y % 2 ? 'stone_bricks' : 'limestone';
            b.set(x, y, z, type);
        }
        // The top cornice runs over everything; the balustrade stands on the wall.
        if (!corner) b.stairs(x + ox, T, z + oz, 'stone_brick_stairs', inward, 'top');
        const statueHere = corner || (alongX ? Math.abs(x - PALACE_BAROQUE_MID) % 8 === 0 : (z - 22) % 8 === 0);
        if (corner || o === 0) {
            b.set(x, T + 1, z, 'marble');
            if (statueHere) b.shaped(x, T + 2, z, 'statue', 'statue', { facing: b.facing(out) });
        } else {
            b.set(x, T + 1, z, 'white_glazed_tile_slab');
        }
        if (corner) continue;
        if (o === 0) {
            b.set(x + ox, G + 1, z + oz, 'stone_bricks');
            for (let y = G + 2; y < T; y++) b.set(x + ox, y, z + oz, y === A - 1 ? 'gold_block' : 'marble');
            continue;
        }
        // Ground floor windows, three wide with a round head; the noble ones taller; the attic's small.
        for (let y = G + 2; y <= G + 4; y++) b.set(x, y, z, glass(x, y, z));
        if (o === 2) {
            b.set(x, G + 5, z, glass(x, G + 5, z));
            b.set(x, N - 1, z, 'marble');
        }
        for (let y = N + 1; y <= N + 5; y++) b.set(x, y, z, glass(x, y, z));
        if (o === 2) {
            b.set(x, N + 6, z, glass(x, N + 6, z));
            b.set(x, A - 1, z, 'gold_block');
            for (let y = A + 1; y <= A + 2; y++) b.set(x, y, z, glass(x, y, z));
        }
        // String courses standing out of the wall, under the windows of each floor.
        b.stairs(x + ox, N, z + oz, 'stone_brick_stairs', inward, 'top');
        b.stairs(x + ox, A, z + oz, 'stone_brick_stairs', inward, 'top');
    }
}

// A straight flight of `rise` stairs, `width` wide, from feet f0 at (x, z), climbing in `facing`; the second
// and further lanes lie towards +x (or +z). Filled below with `fill`, and three cells cleared over every step so
// that the floors above leave head room: dug out to 'air' down in the ground layers, where a cell left undrawn
// would keep its earth. Returns the cell where it arrives.
function constructionPalaceBaroqueFlight(b, x, z, facing, width, f0, rise, stairs, fill) {
    const [dx, dz] = SHAPE_DIRECTIONS[facing];
    const [ax, az] = [Math.abs(dz), Math.abs(dx)];
    for (let i = 0; i < rise; i++) {
        for (let k = 0; k < width; k++) {
            const cx = x + dx * i + ax * k;
            const cz = z + dz * i + az * k;
            const y = f0 + i;
            for (let fy = f0; fy < y; fy++) b.set(cx, fy, cz, fill);
            b.stairs(cx, y, cz, stairs, facing);
            for (let up = 1; up <= 3; up++) b.set(cx, y + up, cz, y + up <= PALACE_BAROQUE_GROUND ? 'air' : null);
        }
    }
    return [x + dx * rise, z + dz * rise];
}

// A service stair from the cellars to the attic, in a well x0..x0 + 6, z PALACE_BAROQUE_STAIR_Z .. + 11: two
// lanes three wide (x0..x0 + 2 and x0 + 4..x0 + 6) with a marble wall between them, landings two deep at both
// ends. Cellar to ground floor up lane A, on to the noble floor down lane B, to the attic up lane A again.
// The well's doors: cellar and noble floor at the near end, ground floor and attic at the far end.
function constructionPalaceBaroqueStairwell(b, x0) {
    const s = PALACE_BAROQUE_STAIR_Z;
    const G = PALACE_BAROQUE_GROUND;
    const N = PALACE_BAROQUE_NOBLE;
    const A = PALACE_BAROQUE_ATTIC;
    const { lantern } = constructionFurnisher(b);
    b.box(x0 + 3, PALACE_BAROQUE_CELLAR + 1, s + 2, x0 + 3, PALACE_BAROQUE_ROOF - 1, s + 9, 'iron_bars');
    constructionPalaceBaroqueFlight(b, x0, s + 2, 's', 3, PALACE_BAROQUE_CELLAR + 1, G - PALACE_BAROQUE_CELLAR, 'stone_brick_stairs', 'stone_bricks');
    constructionPalaceBaroqueFlight(b, x0 + 4, s + 9, 'n', 3, G + 1, N - G, 'stone_brick_stairs', 'stone_bricks');
    constructionPalaceBaroqueFlight(b, x0, s + 2, 's', 3, N + 1, A - N, 'stone_brick_stairs', 'stone_bricks');
    // Lanterns over every landing and over each flight where no head passes; the wall between the lanes is of
    // iron bars, so the light of one lane reaches the other. A rail where the ground floor opens over the first flight.
    for (const y of [G - 1, N - 1, A - 1, PALACE_BAROQUE_ROOF - 1]) {
        for (const x of [x0 + 1, x0 + 5]) {
            lantern(x, y, s);
            lantern(x, y, s + 11);
        }
    }
    lantern(x0 + 5, G - 1, s + 4);
    lantern(x0 + 5, G - 1, s + 8);
    lantern(x0 + 1, N - 1, s + 4);
    lantern(x0 + 5, A - 1, s + 5);
    lantern(x0 + 1, PALACE_BAROQUE_ROOF - 1, s + 7);
    lantern(x0 + 5, PALACE_BAROQUE_ROOF - 1, s + 6);
    lantern(x0 + 1, G - 1, s + 8);
    lantern(x0, N - 1, s + 8);
    lantern(x0 + 2, N - 1, s + 7);
    lantern(x0, A - 1, s + 3);
    lantern(x0, N - 1, s + 6);
    lantern(x0, N + 1, s, 'floor');
    lantern(x0 + 5, N + 1, s + 8, 'floor');
    lantern(x0 + 1, A + 1, s + 3, 'floor');
    b.box(x0, G + 1, s + 2, x0 + 2, G + 1, s + 2, 'iron_bars');
}

// The roofs: a mansard of slate over every block (steep below, gentler above, flat on top), inset two from the
// walls behind the balustrade, with dormers in its steep part and gilded cresting on top. rects are
// [x0, z0, x1, z1]; where they overlap the higher one wins, so the wings and the corps join in valleys.
function constructionPalaceBaroqueMansard(b, rects) {
    const T = PALACE_BAROQUE_ROOF;
    const profile = [T + 2, T + 4, T + 5, T + 6];
    const height = (x, z) => {
        let h = T;
        for (const [x0, z0, x1, z1] of rects) {
            if (x < x0 || x > x1 || z < z0 || z > z1) continue;
            const d = Math.min(x - x0, x1 - x, z - z0, z1 - z);
            h = Math.max(h, profile[Math.min(d, profile.length - 1)]);
        }
        return h;
    };
    const xs = rects.map((r) => [r[0], r[2]]).flat();
    const zs = rects.map((r) => [r[1], r[3]]).flat();
    for (let z = Math.min(...zs); z <= Math.max(...zs); z++) {
        for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
            const h = height(x, z);
            if (h === T) continue;
            const low = Math.min(height(x + 1, z), height(x - 1, z), height(x, z + 1), height(x, z - 1));
            for (let y = Math.max(T + 1, low + 1); y <= h; y++) b.set(x, y, z, 'slate');
        }
    }
    return height;
}

// A dormer in the steep foot of a mansard at (x, z), looking `out`: a window between limestone cheeks under a
// little gable of stairs.
function constructionPalaceBaroqueDormer(b, x, z, out) {
    const T = PALACE_BAROQUE_ROOF;
    const alongX = out === 'n' || out === 's';
    const at = (k, y, type) => (alongX ? b.set(x + k, y, z, type) : b.set(x, y, z + k, type));
    const step = (k, y, facing) => (alongX ? b.stairs(x + k, y, z, 'stone_brick_stairs', facing) : b.stairs(x, y, z + k, 'stone_brick_stairs', facing));
    for (let y = T + 1; y <= T + 3; y++) {
        at(-1, y, 'limestone');
        at(1, y, 'limestone');
    }
    at(0, T + 1, 'glass_pane');
    at(0, T + 2, 'glass_pane');
    at(0, T + 3, 'gold_block');
    step(-1, T + 4, alongX ? 'e' : 's');
    step(1, T + 4, alongX ? 'w' : 'n');
    at(0, T + 4, 'marble');
}

// A floor of a room: 'parquet' (the diagonal lattice of Versailles parquet), 'damier' (marble and basalt
// chequers), 'planks' or 'stone'.
function constructionPalaceBaroqueFloor(b, x0, z0, x1, z1, y, kind) {
    for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
            let type = 'spruce_planks';
            if (kind === 'parquet') type = (x + z) % 4 === 0 || (((x - z) % 4) + 4) % 4 === 0 ? 'dark_oak_planks' : 'planks';
            else if (kind === 'damier') type = (x + z) % 2 ? 'marble' : 'basalt';
            else if (kind === 'stone') type = (x + z) % 3 ? 'stone_bricks' : 'cobblestone';
            b.set(x, y, z, type);
        }
    }
}

// The helpers the rooms share: the furnisher's, a throne, chandeliers on chains, a canopy bed, a row of
// paintings, a sign.
function constructionPalaceBaroqueKit(b) {
    const kit = constructionFurnisher(b);
    const paintings = ['painting_sunset', 'painting_peaks', 'painting_meadow', 'painting_night', 'painting_shapes', 'painting_fish'];
    return {
        ...kit,
        chest: (x, y, z, facing, items) => constructionPalaceChest(b, x, y, z, facing, items),
        barrel: (x, y, z, items) => constructionPalaceChest(b, x, y, z, null, items, 'barrel'),
        sign: (x, y, z, facing, es, en, mount) => constructionPalaceSign(b, x, y, z, facing, es, en, mount),
        chair: (x, y, z, facing, wood = 'dark_oak') => kit.piece(x, y, z, `${wood}_chair`, 'chair', facing),
        sofa: (x, y, z, color, facing) => kit.piece(x, y, z, `${color}_sofa`, 'sofa', facing),
        banner: (x, y, z, color, facing) => kit.piece(x, y, z, `${color}_banner`, 'banner', facing),
        statue: (x, y, z, facing) => kit.piece(x, y, z, 'statue', 'statue', facing),
        mirror: (x, y, z, facing) => kit.piece(x, y, z, 'wall_mirror', 'wall_mirror', facing),
        // A thing left on a table, a desk or the floor by a chair (js/game/tabletop.js), turned when it has a
        // facing; none (null) leaves the surface bare.
        tabletop(x, y, z, id, facing) {
            if (!id) return;
            if (facing) b.shaped(x, y, z, id, id, { facing: b.facing(facing) });
            else b.set(x, y, z, id);
        },
        // A deterministic choice from [[value, weight], ...] for a cell, the same on both halves of b.sym only
        // where the cells are the same: it hashes the cell where the drawing lands, so rooms in a row differ.
        pick: (palette, x, y, z, salt) => constructionPalacePick(palette, b.flipped ? PALACE_BAROQUE_SIZE[0] - 1 - x : x, y, z, salt),
        shelf: (x, y, z, facing, height = 3) => {
            for (let k = 0; k < height; k++) kit.piece(x, y + k, z, 'bookshelf', 'bookshelf', facing);
        },
        painting: (x, y, z, facing, n) => kit.piece(x, y, z, paintings[((n % paintings.length) + paintings.length) % paintings.length], 'painting', facing),
        throne(x, y, z, facing) {
            b.shaped(x, y, z, 'gilded_throne', 'throne', { half: 'lower', facing: b.facing(facing) });
            b.shaped(x, y + 1, z, 'gilded_throne', 'throne', { half: 'upper', facing: b.facing(facing) });
        },
        // A chandelier at y hanging from the ceiling at `ceiling` on a gilt chain.
        chandelier(x, y, z, ceiling) {
            if (ceiling > y + 1) b.box(x, y + 1, z, x, ceiling - 1, z, 'iron_bars');
            b.set(x, y, z, 'chandelier');
        },
        bathtub(x, y, z, facing) {
            const [dx, dz] = SHAPE_DIRECTIONS[facing];
            b.shaped(x, y, z, 'bathtub', 'bathtub', { part: 'foot', facing: b.facing(facing) });
            b.shaped(x + dx, y, z + dz, 'bathtub', 'bathtub', { part: 'head', facing: b.facing(facing) });
        },
        // A state bed: two beds side by side with their heads at (x, z) and (x + 1, z) against the wall, facing
        // 'n' or 's' (the way the heads point), four gilded posts and a canopy of `color` wool and gold.
        stateBed(x, y, z, facing, color) {
            const [, dz] = SHAPE_DIRECTIONS[facing];
            constructionPalaceBed(b, x, y, z, facing);
            constructionPalaceBed(b, x + 1, y, z, facing);
            const zf = z - dz;
            for (const px of [x - 1, x + 2]) {
                for (const pz of [z, zf]) b.box(px, y, pz, px, y + 2, pz, 'birch_fence');
            }
            const [za, zb] = [Math.min(z, zf), Math.max(z, zf)];
            b.box(x - 1, y + 3, za, x + 2, y + 3, zb, 'gold_block');
            b.box(x, y + 3, za, x + 1, y + 3, zb, `${color}_wool`);
            b.box(x, y + 4, za, x + 1, y + 4, zb, `${color}_wool`);
            b.set(x - 1, y + 4, z, 'gold_block');
            b.set(x + 2, y + 4, z, 'gold_block');
        }
    };
}

// ---------------------------------------------------------------------------------------
// Outside the palace: the land, the place d'armes, the railing and its gates, the forecourt.

function constructionPalaceBaroqueApproach(b) {
    const G = PALACE_BAROQUE_GROUND;
    const F = G + 1;
    const R = PALACE_BAROQUE_RIM;
    const mid = PALACE_BAROQUE_MID;
    const last = PALACE_BAROQUE_SIZE[0] - 1 - R;
    const kit = constructionPalaceBaroqueKit(b);
    const put = constructionPalacePut(b);
    constructionPalaceGrounds(b, 'plains', { x0: R, z0: R, x1: last, z1: last, y: G, decor: false });
    // Along the sides of the palace, between it and the rim: lawns with shrubs and flowers.
    constructionPalaceGrounds(b, 'plains', { x0: R + 1, z0: 18, x1: 16, z1: 72, y: G, density: 0.12, salt: 3 });
    constructionPalaceGrounds(b, 'plains', { x0: 124, z0: 18, x1: last - 1, z1: 72, y: G, density: 0.12, salt: 5 });

    // The place d'armes: cobbles framed in stone bricks, the avenue of limestone on the axis.
    for (let z = R; z <= 17; z++) {
        for (let x = R; x <= last; x++) b.set(x, G, z, z === R || z === 17 || x % 8 === 6 ? 'stone_bricks' : 'cobblestone');
    }
    b.sym(() => {
        // Rows of clipped trees on grass squares, and lamps along the avenue.
        for (let x = 18; x <= 58; x += 8) {
            b.box(x - 1, G, 13, x + 1, G, 16, 'grass');
            constructionPalaceTree(put, 'oak', x, F, 14, x);
        }
        for (let z = 13; z <= 41; z += 4) {
            if (z >= 18 && z <= 21) continue;
            kit.lanternPost(64, F, z, 'dark_oak_fence', 2);
        }
    });

    // The forecourt: cobbles with a grid of stone bricks; the marble court before the central pavilion.
    for (let z = 18; z <= 49; z++) {
        for (let x = 18; x <= 122; x++) {
            if (z >= 22 && (x <= 38 || x >= 102)) continue;
            b.set(x, G, z, (x - mid) % 6 === 0 || z % 6 === 0 ? 'stone_bricks' : 'cobblestone');
        }
    }
    for (let z = 36; z <= 43; z++) {
        for (let x = 46; x <= 94; x++) b.set(x, G, z, (x + z) % 2 ? 'marble' : 'basalt');
    }
    for (let z = 45; z <= 49; z++) {
        for (let x = 39; x <= 57; x++) b.set(x, G, z, (x + z) % 2 ? 'marble' : 'basalt');
        for (let x = 83; x <= 101; x++) b.set(x, G, z, (x + z) % 2 ? 'marble' : 'basalt');
    }
    for (let z = R; z <= 35; z++) {
        for (let x = 66; x <= 74; x++) b.set(x, G, z, x === 66 || x === 74 ? 'stone_bricks' : 'limestone');
    }
    b.sym(() => {
        // Two lawns edged with box hedges, flowers inside, a bust at each corner.
        b.box(44, G, 23, 60, G, 33, 'grass');
        for (let x = 44; x <= 60; x++) {
            for (const z of [23, 33]) b.set(x, F, z, 'leaves');
        }
        for (let z = 24; z <= 32; z++) {
            b.set(44, F, z, 'leaves');
            b.set(60, F, z, 'leaves');
        }
        b.box(52, F, 23, 52, F, 23, null);
        b.box(52, F, 33, 52, F, 33, null);
        for (let z = 25; z <= 31; z++) {
            for (let x = 46; x <= 58; x++) {
                const ring = Math.abs(x - 52) + Math.abs(z - 28);
                if (ring === 4) b.set(x, F, z, 'leaves');
                else if (ring < 3) b.set(x, F, z, ring === 0 ? 'flower_yellow' : 'flower_red');
                else if ((x + z) % 3 === 0) b.set(x, F, z, 'flower_yellow');
            }
        }
        for (const [x, z] of [[43, 22], [61, 22], [43, 34], [61, 34]]) {
            b.set(x, F, z, 'marble');
            kit.statue(x, F + 1, z, 'n');
        }
        kit.lanternPost(41, F, 44, 'dark_oak_fence', 2);
        kit.lanternPost(41, F, 38, 'dark_oak_fence', 2);
    });

    // The equestrian monument in the middle of the court: a marble plinth, gold, a bust looking out.
    b.box(68, F, 28, 72, F, 32, 'marble');
    b.box(69, F + 1, 29, 71, F + 2, 31, 'marble');
    b.box(69, F + 3, 29, 71, F + 3, 31, 'gold_block');
    b.shaped(mid, F + 4, 30, 'statue', 'statue', { facing: 'n' });
    for (const [x, z] of [[68, 28], [72, 28], [68, 32], [72, 32]]) kit.lantern(x, F + 1, z, 'floor');

    // The railing across the front: iron bars between marble piers with gold caps, and on the axis three
    // gates of iron doors under a gilded crest.
    b.sym(() => {
        for (let x = 18; x <= 66; x++) {
            if (x % 4 === 2) {
                b.box(x, F, 18, x, F + 2, 18, 'marble');
                b.set(x, F + 3, 18, 'gold_block');
            } else {
                b.box(x, F, 18, x, F + 1, 18, 'iron_bars');
                if (x % 2 === 0) b.set(x, F + 2, 18, 'iron_bars');
            }
        }
        b.box(66, F, 18, 66, F + 4, 18, 'marble');
        b.set(66, F + 5, 18, 'gold_block');
        kit.statue(66, F + 6, 18, 'n');
        b.doubleDoor(68, F, 18, 69, 18, 'iron_door', 's');
        b.set(67, F, 18, 'iron_bars');
        b.set(67, F + 1, 18, 'iron_bars');
        b.box(67, F + 2, 18, 69, F + 2, 18, 'iron_bars');
        b.box(68, F + 3, 18, 69, F + 3, 18, 'iron_bars');
        b.set(67, F + 3, 18, 'gold_block');
    });
    b.box(mid, F, 18, mid, F + 3, 18, 'iron_bars');
    b.box(mid, F + 4, 18, mid, F + 5, 18, 'gold_block');
    b.set(mid, F + 6, 18, 'gold_block');
    kit.sign(64, F, 16, 'n', 'Palacio barroco', 'Baroque palace');
    kit.sign(76, F, 16, 'n', 'Patio de honor, palacio y jardín a la francesa', 'Cour d\'honneur, palace and French garden');
}

// ---------------------------------------------------------------------------------------
// The shell: floors, outer walls, partitions, doors and the stairs.

function constructionPalaceBaroqueShell(b) {
    const G = PALACE_BAROQUE_GROUND;
    const F = G + 1;
    const N = PALACE_BAROQUE_NOBLE;
    const A = PALACE_BAROQUE_ATTIC;
    const T = PALACE_BAROQUE_ROOF;
    const C = PALACE_BAROQUE_CELLAR;
    const s = PALACE_BAROQUE_STAIR_Z;
    const kit = constructionPalaceBaroqueKit(b);

    // The cellars, dug under the west and east ends: stone all round, then the rooms and the stair well.
    b.sym(() => {
        b.box(18, C, 50, 46, G - 1, 72, 'stone_bricks');
        b.box(19, C + 1, 51, 45, G - 1, 58, 'air');
        b.box(27, C + 1, 59, 45, G - 1, 61, 'air');
        b.box(19, C + 1, s, 25, G - 1, s + 11, 'air');
        constructionPalaceBaroqueFloor(b, 19, 51, 45, 61, C, 'stone');
    });

    // Floors of every storey, and the roof.
    const blocks = [[19, 51, 121, 71], [59, 45, 81, 50]];
    for (const [x0, z0, x1, z1] of blocks) {
        constructionPalaceBaroqueFloor(b, x0, z0, x1, z1, G, 'parquet');
        constructionPalaceBaroqueFloor(b, x0, z0, x1, z1, N, 'parquet');
        constructionPalaceBaroqueFloor(b, x0, z0, x1, z1, A, 'planks');
        b.box(x0, T, z0, x1, T, z1, 'stone_bricks');
    }
    b.sym(() => {
        constructionPalaceBaroqueFloor(b, 19, 23, 37, 49, G, 'damier');
        b.box(19, T, 23, 37, T, 49, 'stone_bricks');
        constructionPalaceBaroqueFloor(b, 19, 44, 37, 49, N, 'parquet');
    });

    // The outer walls. The chapel's windows are of stained glass.
    const chapelGlass = (x, y, z) => (x <= 38 && z <= 50 ? `${['blue', 'yellow', 'red', 'light_blue'][(y + z + x) % 4]}_stained_glass_pane` : 'glass_pane');
    constructionPalaceBaroqueFacade(b, 18, 22, 18, 72, 'w', chapelGlass);
    constructionPalaceBaroqueFacade(b, 122, 22, 122, 72, 'e');
    constructionPalaceBaroqueFacade(b, 18, 22, 38, 22, 'n', chapelGlass);
    constructionPalaceBaroqueFacade(b, 102, 22, 122, 22, 'n');
    constructionPalaceBaroqueFacade(b, 38, 22, 38, 50, 'e', chapelGlass);
    constructionPalaceBaroqueFacade(b, 102, 22, 102, 50, 'w');
    constructionPalaceBaroqueFacade(b, 38, 50, 58, 50, 'n');
    constructionPalaceBaroqueFacade(b, 82, 50, 102, 50, 'n');
    constructionPalaceBaroqueFacade(b, 58, 44, 58, 50, 'w');
    constructionPalaceBaroqueFacade(b, 82, 44, 82, 50, 'e');
    constructionPalaceBaroqueFacade(b, 58, 44, 82, 44, 'n');
    constructionPalaceBaroqueFacade(b, 18, 72, 122, 72, 's');

    // Partitions of white stucco. The wall between a wing and the corps; the middle wall of the corps (front
    // rooms and garden rooms); the walls of the service stairs; the rooms.
    const stucco = 'white_stucco';
    b.sym(() => {
        b.box(19, G, 50, 37, T, 50, 'limestone');
        b.box(26, G, s - 1, 26, A + 4, 71, stucco);
        b.box(19, G, s - 1, 25, A + 4, s - 1, stucco);
        for (const x of [46, 58]) b.box(x, F, 51, x, A - 1, 61, stucco);
        b.box(38, N + 1, 51, 38, A - 1, 61, stucco);
        b.box(58, F, 63, 58, N - 1, 71, stucco);
        b.box(42, N + 1, 63, 42, A - 1, 71, stucco);
        // The attic: a corridor along the middle, rooms in front and behind.
        b.box(27, A + 1, 60, 69, A + 4, 60, stucco);
        b.box(27, A + 1, 64, 69, A + 4, 64, stucco);
        for (const x of [34, 42, 50, 58]) {
            b.box(x, A + 1, 51, x, A + 4, 59, stucco);
            b.box(x, A + 1, 65, x, A + 4, 71, stucco);
        }
    });
    b.box(27, F, 62, 113, A - 1, 62, stucco);
    b.box(70, A + 1, 60, 70, A + 4, 60, stucco);
    b.box(70, A + 1, 64, 70, A + 4, 64, stucco);

    // The service stairs, at both ends.
    b.sym(() => constructionPalaceBaroqueStairwell(b, 19));

    // The grand staircases: a flight five wide of white glazed stairs from the ground floor to the piano
    // nobile, open above, a gilded balustrade round the opening, marble newels with lanterns at its foot.
    b.sym(() => {
        constructionPalaceBaroqueFlight(b, 50, 52, 's', 5, F, N - G, 'white_glazed_tile_stairs', 'marble');
        b.box(50, N, 51, 54, N, 57, null);
        for (const x of [49, 55]) {
            for (let z = 51; z <= 57; z++) b.set(x, N + 1, z, z % 3 === 0 ? 'gold_block' : 'iron_bars');
            b.set(x, F, 52, 'marble');
            kit.lantern(x, F + 1, 52, 'floor');
        }
    });

    // Doors. Ground floor: the three doors of the vestibule, the vestibule to the stair halls, the halls to
    // the baths and the guard hall and to the garden rooms, the garden salon to the banquet hall, the library
    // and the garden.
    const door = (x, y, z, facing, wood = 'birch_door', hinge = 'left') => {
        b.box(x, y, z, x, y + 1, z, null);
        b.door(x, y, z, wood, facing, hinge);
    };
    const doors = (ax, y, az, bx, bz, facing, wood = 'birch_door') => {
        b.box(Math.min(ax, bx), y, Math.min(az, bz), Math.max(ax, bx), y + 1, Math.max(az, bz), null);
        b.doubleDoor(ax, y, az, bx, bz, wood, facing);
    };
    const arch = (x0, y, z0, x1, z1, height) => b.box(x0, y, z0, x1, y + height - 1, z1, null);
    // The three main doors, in marble frames with fanlights, and the portico.
    for (const x of [68, 72]) {
        b.box(x, F, 43, x, F + 4, 43, null);
        b.box(x, F, 44, x, F + 3, 44, null);
    }
    b.box(PALACE_BAROQUE_MID, F, 43, PALACE_BAROQUE_MID, F + 4, 43, null);
    b.box(PALACE_BAROQUE_MID, F, 44, PALACE_BAROQUE_MID, F + 3, 44, null);
    b.sym(() => {
        door(68, F, 44, 's', 'dark_oak_door', 'left');
        b.set(68, F + 2, 44, 'yellow_stained_glass_pane');
        b.set(68, F + 3, 44, 'orange_stained_glass_pane');
        b.box(69, F, 44, 69, F + 4, 44, 'marble');
        b.box(67, F, 44, 67, F + 4, 44, 'marble');
        b.box(67, F + 4, 44, 69, F + 4, 44, 'marble');
        b.set(68, F + 4, 44, 'gold_block');
        // The portico: two pairs of columns carrying a balcony over the doors.
        for (const x of [64, 66]) {
            b.set(x, F, 42, 'stone_bricks');
            b.box(x, F + 1, 42, x, N - 2, 42, 'marble');
            b.set(x, N - 1, 42, 'gold_block');
        }
        b.box(63, N, 41, 69, N, 43, 'marble');
        for (let x = 63; x <= 69; x++) b.set(x, N + 1, 41, x % 3 === 0 ? 'gold_block' : 'iron_bars');
        b.box(63, N + 1, 42, 63, N + 1, 43, 'iron_bars');
    });
    b.box(PALACE_BAROQUE_MID, N, 41, PALACE_BAROQUE_MID, N, 43, 'marble');
    b.set(PALACE_BAROQUE_MID, N + 1, 41, 'gold_block');
    door(PALACE_BAROQUE_MID, F, 44, 's', 'dark_oak_door', 'left');
    b.set(PALACE_BAROQUE_MID, F + 2, 44, 'yellow_stained_glass_pane');
    b.set(PALACE_BAROQUE_MID, F + 3, 44, 'orange_stained_glass_pane');
    b.set(PALACE_BAROQUE_MID, F + 4, 44, 'gold_block');
    // To the garden: three doors in the middle of the garden front.
    b.sym(() => {
        door(68, F, 72, 'n', 'dark_oak_door', 'right');
        b.set(68, F + 2, 72, 'yellow_stained_glass_pane');
    });
    b.box(PALACE_BAROQUE_MID, F, 73, PALACE_BAROQUE_MID, F + 2, 73, null);
    door(PALACE_BAROQUE_MID, F, 72, 'n', 'dark_oak_door', 'right');
    b.set(PALACE_BAROQUE_MID, F + 2, 72, 'yellow_stained_glass_pane');
    b.box(69, F, 62, 71, F + 3, 62, null);
    b.sym(() => {
        doors(58, F, 54, 58, 55, 'w');
        doors(46, F, 54, 46, 55, 'w');
        doors(56, F, 62, 57, 62, 's');
        doors(58, F, 66, 58, 67, 'w');
        doors(26, F, s + 10, 26, s + 11, 'e');
        doors(26, C + 1, s, 26, s + 1, 'e', 'spruce_door');
        // The chapel and the opera open on the forecourt, under their tribune and box.
        doors(38, F, 47, 38, 48, 'w', 'dark_oak_door');
        b.set(38, F + 2, 47, 'gold_block');
        b.set(38, F + 2, 48, 'gold_block');
        // Piano nobile: the landing to the antechamber, the throne room and the gallery; the antechamber to the
        // bedroom; the bedroom to the stairs and to the tribune or the box.
        doors(46, N + 1, s, 46, s + 1, 'w');
        doors(58, N + 1, s, 58, s + 1, 'e');
        arch(51, N + 1, 62, 53, 62, 4);
        doors(38, N + 1, 55, 38, 56, 'w');
        doors(26, N + 1, s, 26, s + 1, 'e');
        doors(30, N + 1, 50, 31, 50, 'n');
        // The attic: the stairs to the corridor, and a door to every room.
        door(26, A + 1, 62, 'e', 'spruce_door');
        for (const x of [30, 38, 46, 54]) {
            door(x, A + 1, 60, 'n', 'spruce_door');
            door(x, A + 1, 64, 's', 'spruce_door');
        }
    });
    door(PALACE_BAROQUE_MID - 4, A + 1, 60, 'n', 'spruce_door');
    door(PALACE_BAROQUE_MID + 4, A + 1, 60, 'n', 'spruce_door');
    door(PALACE_BAROQUE_MID - 4, A + 1, 64, 's', 'spruce_door');
    door(PALACE_BAROQUE_MID + 4, A + 1, 64, 's', 'spruce_door');
    arch(69, N + 1, 62, 71, 62, 5);
    // The ends of the gallery: an iron door to the treasury, a gilded one to the optics cabinet.
    doors(42, N + 1, 66, 42, 67, 'w', 'iron_door');
    doors(98, N + 1, 66, 98, 67, 'e');

}

// ---------------------------------------------------------------------------------------
// The roofs: the mansards, their dormers and cresting, the pediments, the clock and the dome.

function constructionPalaceBaroqueRoofs(b) {
    const T = PALACE_BAROQUE_ROOF;
    const mid = PALACE_BAROQUE_MID;
    const kit = constructionPalaceBaroqueKit(b);
    const height = constructionPalaceBaroqueMansard(b, [
        [20, 52, 120, 70],
        [20, 24, 36, 52], [104, 24, 120, 52],
        [60, 46, 80, 52]
    ]);
    // Dormers wherever a facade's bay has its middle and the slope there is the foot of its own roof.
    for (let x = 24; x <= 116; x++) {
        if (constructionPalaceBaroqueBay(x, 0, true) !== 2) continue;
        if (height(x, 70) === T + 2 && height(x, 71) === T) constructionPalaceBaroqueDormer(b, x, 70, 's');
        if (x > 38 && x < 102 && (x < 58 || x > 82) && height(x, 52) === T + 2) constructionPalaceBaroqueDormer(b, x, 52, 'n');
    }
    b.sym(() => {
        for (let z = 26; z <= 66; z += 4) {
            if (height(20, z) === T + 2) constructionPalaceBaroqueDormer(b, 20, z, 'w');
            if (z < 50 && height(36, z) === T + 2) constructionPalaceBaroqueDormer(b, 36, z, 'e');
        }
        for (const x of [24, 32]) constructionPalaceBaroqueDormer(b, x, 24, 'n');
        // Cresting along the ridges: iron bars with gilded finials.
        for (let z = 28; z <= 48; z++) b.set(28, T + 7, z, z % 4 === 0 ? 'gold_block' : 'iron_bars');
        // The pediment over each wing's front, a bust on top.
        for (let k = 0; k <= 3; k++) {
            for (let x = 22 + 2 * k; x <= 34 - 2 * k; x++) b.set(x, T + 1 + k, 22, k === 0 || x <= 23 + 2 * k || x >= 33 - 2 * k ? 'marble' : 'limestone');
        }
        b.set(28, T + 3, 22, 'gold_block');
        kit.statue(28, T + 5, 22, 'n');
    });
    for (let x = 24; x <= 116; x++) {
        if (x >= 63 && x <= 77) continue;
        b.set(x, T + 7, 61, Math.abs(x - mid) % 4 === 0 ? 'gold_block' : 'iron_bars');
    }

    // The pediment of the central pavilion with the palace clock in a gold frame.
    for (let k = 0; k <= 5; k++) {
        for (let x = 60 + 2 * k; x <= 80 - 2 * k; x++) {
            const edge = k === 0 || x <= 61 + 2 * k || x >= 79 - 2 * k;
            b.set(x, T + 1 + k, 44, edge ? 'marble' : 'limestone');
        }
    }
    b.box(69, T + 2, 44, 71, T + 4, 44, 'gold_block');
    kit.piece(mid, T + 3, 43, 'wall_clock', 'wall_clock', 'n');
    kit.statue(mid, T + 7, 44, 'n');
    for (const x of [60, 80]) kit.statue(x, T + 2, 44, 'n');
    b.box(61, T + 1, 45, 79, T + 1, 45, 'slate');

    // The dome over the throne room: a drum with windows and pilasters, a slate dome with gilded ribs, a
    // lantern of glass and a gold finial.
    const [cx, cz] = [mid, 54];
    for (let dz = -7; dz <= 7; dz++) {
        for (let dx = -7; dx <= 7; dx++) {
            const r = Math.hypot(dx, dz);
            if (r > 6.4) continue;
            for (let y = T + 1; y <= T + 8; y++) b.set(cx + dx, y, cz + dz, null);
            if (r <= 5.4) continue;
            for (let y = T + 1; y <= T + 7; y++) {
                const rib = Math.abs(dx) === Math.abs(dz) || dx === 0 || dz === 0;
                let type = rib ? 'marble' : 'limestone';
                if (!rib && y >= T + 3 && y <= T + 5) type = 'glass_pane';
                if (y === T + 7) type = 'marble';
                b.set(cx + dx, y, cz + dz, type);
            }
        }
    }
    for (let dy = 0; dy <= 6; dy++) {
        for (let dz = -6; dz <= 6; dz++) {
            for (let dx = -6; dx <= 6; dx++) {
                const r = Math.hypot(dx, dy, dz);
                if (r > 6.4 || r <= 5.3) continue;
                const rib = dx === 0 || dz === 0 || Math.abs(dx) === Math.abs(dz);
                b.set(cx + dx, T + 8 + dy, cz + dz, rib ? 'gold_block' : 'slate');
            }
        }
    }
    const top = T + 14;
    for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
            const corner = dx && dz;
            b.set(cx + dx, top, cz + dz, 'marble');
            b.set(cx + dx, top + 1, cz + dz, corner ? 'marble' : dx || dz ? 'glass_pane' : null);
            b.set(cx + dx, top + 2, cz + dz, 'gold_block');
        }
    }
    b.set(cx, top + 1, cz, 'lantern');
    b.set(cx, top + 3, cz, 'gold_block');
    b.set(cx, top + 4, cz, 'gold_block');
}

// ---------------------------------------------------------------------------------------
// The cellars: the kitchens under the west end, the wine and store cellar under the east end.

function constructionPalaceBaroqueCellars(b) {
    const f = PALACE_BAROQUE_CELLAR + 1;
    const ceiling = PALACE_BAROQUE_GROUND;
    const kit = constructionPalaceBaroqueKit(b);
    // The kitchens: a row of ovens under a brick hood along the front wall, sinks and workbenches, a long
    // table in the middle, the larder.
    for (let x = 20; x <= 36; x++) {
        if (x % 2 === 0) kit.oven(x, f, 51, 's');
        else b.set(x, f, 51, 'brick');
        b.set(x, f + 2, 51, 'brick');
        b.set(x, f + 3, 51, 'brick');
    }
    b.box(20, f + 1, 51, 36, f + 1, 51, 'air');
    for (let x = 21; x <= 35; x += 2) b.set(x, f + 1, 51, 'candle');
    for (let x = 38; x <= 44; x += 2) kit.piece(x, f, 51, 'sink', 'sink', 's');
    b.set(39, f, 51, 'workbench');
    b.set(41, f, 51, 'workbench');
    b.set(43, f, 51, 'workbench');
    for (let x = 26; x <= 40; x++) {
        b.set(x, f, 55, 'table');
        b.set(x, f, 56, 'table');
        if (x % 3 === 0) {
            kit.piece(x, f, 54, 'stool', 'stool', 'n');
            kit.piece(x, f, 57, 'stool', 'stool', 'n');
        }
    }
    b.set(28, f + 1, 55, 'vase');
    b.set(33, f + 1, 56, 'candle');
    b.set(38, f + 1, 55, 'candle');
    // The servants' meal, half eaten, the jugs still out, fruit waiting to go up to the banquet hall.
    kit.tabletop(30, f + 1, 56, 'meal_plate');
    kit.tabletop(31, f + 1, 55, 'jug');
    kit.tabletop(34, f + 1, 55, 'fruit_bowl');
    kit.tabletop(36, f + 1, 55, 'meal_plate');
    kit.tabletop(39, f + 1, 56, 'jug');
    kit.chest(19, f, 53, 'e', [['bread', 24], ['cheese', 12], ['honey_bottle', 8], ['salt', 16]]);
    kit.chest(19, f, 55, 'e', [['wheat', 32], ['milk', 8], ['roast_mushroom', 10], ['baking_soda', 4]]);
    kit.barrel(19, f, 57, [['cooked_fish', 16], ['salted_fish', 16], ['raw_fish', 12]]);
    kit.barrel(19, f, 52, [['wheat', 48], ['wheat_seeds', 16]]);
    kit.chest(45, f, 58, 'w', [['bread', 16], ['honey_bottle', 6], ['cheese', 8], ['candle', 12]]);
    kit.barrel(45, f, 53, [['cold_water', 12], ['milk', 12], ['soda_water', 8]]);
    for (let x = 28; x <= 44; x += 2) kit.piece(x, f + 1, 61, 'wall_shelf', 'wall_shelf', 'n');
    for (let x = 29; x <= 43; x += 4) b.set(x, f, 61, 'flower_pot');
    kit.piece(32, f + 2, 61, 'wall_clock', 'wall_clock', 'n');
    kit.sign(30, f, 59, 'w', 'Cocinas', 'Kitchens');
    for (const [x, z] of [[22, 54], [22, 57], [29, 53], [29, 58], [36, 53], [36, 58], [43, 53], [43, 58], [31, 60], [41, 60]]) kit.lantern(x, ceiling - 1, z);

    // The cellar: rows of barrels (wine of the palace: water, milk, soda, honey) and chests of stores.
    const stores = [
        [['cold_water', 16], ['honey_bottle', 8]], [['milk', 16], ['cheese', 12]], [['soda_water', 16], ['cold_soda', 8]],
        [['honey_bottle', 12], ['honeycomb', 8]], [['salted_fish', 20], ['salt', 12]], [['wheat', 40], ['bread', 12]]
    ];
    let n = 0;
    for (const z of [52, 54, 56]) {
        for (const x of [99, 103]) {
            kit.barrel(x, f, z, stores[n % stores.length]);
            n++;
        }
    }
    for (let x = 108; x <= 120; x += 2) {
        kit.barrel(x, f, 51, stores[n % stores.length]);
        n++;
    }
    kit.chest(121, f, 55, 'w', [['cheese', 16], ['bread', 16], ['honey_bottle', 8], ['candle', 16]]);
    kit.chest(121, f, 57, 'w', [['frozen_fish', 8], ['ice', 16], ['salt', 16], ['salted_fish', 12]]);
    kit.chest(95, f, 61, 'n', [['coal_ore', 32], ['planks', 32], ['torch', 16], ['lantern', 4]]);
    for (let x = 98; x <= 112; x += 3) b.set(x, f, 60, 'table');
    // The cellarer's list of what is in the barrels, and his jug.
    kit.tabletop(101, f + 1, 60, 'scroll', 'n');
    kit.tabletop(107, f + 1, 60, 'jug');
    kit.sign(110, f, 59, 'e', 'Bodega', 'Cellar');
    for (const [x, z] of [[100, 53], [100, 57], [106, 54], [112, 54], [118, 54], [106, 58], [112, 58], [118, 58], [99, 60], [109, 60]]) kit.lantern(x, ceiling - 1, z);
}

// ---------------------------------------------------------------------------------------
// The ground floor of the corps: vestibule, garden salon, stair halls, baths, guard hall, banquet hall, library.

function constructionPalaceBaroqueGroundFloor(b) {
    const G = PALACE_BAROQUE_GROUND;
    const F = G + 1;
    const N = PALACE_BAROQUE_NOBLE;
    const mid = PALACE_BAROQUE_MID;
    const top = N - 1;
    const kit = constructionPalaceBaroqueKit(b);

    // The vestibule: marble chequers, two rows of columns, busts between them, three chandeliers.
    constructionPalaceBaroqueFloor(b, 59, 45, 81, 61, G, 'damier');
    b.box(mid - 1, F, 46, mid + 1, F, 61, 'red_carpet');
    b.sym(() => {
        for (const z of [47, 51, 55, 59]) {
            b.box(63, F, z, 63, top, z, 'marble');
            b.set(63, top, z, 'gold_block');
        }
        for (const z of [47, 51, 59]) kit.statue(60, F, z, 'e');
        for (const z of [49, 57]) kit.floorLamp(60, F, z);
        kit.banner(59, F + 3, 45, 'blue', 'e');
        kit.banner(59, F + 3, 61, 'blue', 'e');
    });
    for (const z of [48, 54, 60]) kit.chandelier(mid, F + 3, z, N);
    kit.sign(mid + 2, F, 46, 'n', 'Vestíbulo', 'Vestibule');

    // The garden salon: sofas round a fountain, orange trees in boxes in the corners.
    constructionPalaceBaroqueFloor(b, 59, 63, 81, 71, G, 'damier');
    b.set(mid, F, 66, 'fountain');
    b.sym(() => {
        kit.sofa(66, F, 65, 'blue', 'e');
        kit.sofa(66, F, 67, 'blue', 'e');
        for (const [x, z] of [[60, 64], [60, 70]]) {
            b.set(x, F, z, 'dark_oak_planks');
            b.set(x, F + 1, z, 'wood');
            b.box(x, F + 2, z, x, F + 3, z, 'leaves');
        }
        kit.painting(59, F + 2, 68, 'e', 1);
    });
    kit.chandelier(mid, F + 3, 69, N);
    kit.sign(mid + 3, F, 64, 'n', 'Salón del jardín', 'Garden salon');
    // A game of chess left half played under the chandelier, one player's chair turned away.
    b.set(mid, F, 69, 'table');
    kit.tabletop(mid, F + 1, 69, 'chessboard', 'n');
    kit.chair(mid - 1, F, 69, 'e');
    kit.chair(mid + 1, F, 69, 's');

    // The stair halls: statues and lamps beside the flight, banners on the walls.
    b.sym(() => {
        for (const z of [52, 58]) kit.statue(47, F, z, 'e');
        kit.floorLamp(57, F, 58);
        kit.banner(47, F + 3, 51, 'red', 'e');
        kit.chandelier(50, PALACE_BAROQUE_NOBLE + 3, 53, PALACE_BAROQUE_ATTIC);
        kit.chandelier(54, PALACE_BAROQUE_NOBLE + 3, 53, PALACE_BAROQUE_ATTIC);
        kit.chandelier(52, PALACE_BAROQUE_NOBLE + 3, 56, PALACE_BAROQUE_ATTIC);
        kit.painting(47, F + 2, 60, 'e', 2);
    });
    kit.sign(56, F, 53, 'e', 'Gran escalera', 'Grand staircase');

    // The baths (west): a bath hall for the court, a marble basin with a fountain, its dressing corner, basins
    // with mirrors. Behind a wall at x = 22, under the west windows, two small rooms off it: a privy (a toilet
    // and a basin, 3 x 3) and a bathroom (a tub and a basin, 3 x 4), the curtain of the privy drawn.
    constructionPalaceBaroqueFloor(b, 19, 51, 45, 58, G, 'damier');
    constructionPalaceBaroqueFloor(b, 27, 59, 45, 61, G, 'damier');
    b.box(22, F, 51, 22, N - 1, 58, 'white_stucco');
    b.box(19, F, 54, 21, N - 1, 54, 'white_stucco');
    for (const z of [52, 56]) {
        b.box(22, F, z, 22, F + 1, z, null);
        b.door(22, F, z, 'birch_door', 'w', 'left');
    }
    kit.piece(19, F, 53, 'toilet', 'toilet', 'e');
    kit.piece(20, F, 51, 'sink', 'sink', 's');
    kit.mirror(20, F + 1, 51, 's');
    for (let y = F + 1; y <= F + 3; y++) kit.curtain(19, y, 52, 'white', 'e', 'closed');
    kit.bathtub(19, F, 56, 'n');
    kit.piece(20, F, 58, 'sink', 'sink', 'n');
    kit.mirror(20, F + 1, 58, 'n');
    kit.chest(19, F, 58, 'e', [['white_wool', 8], ['soda_water', 4], ['cold_water', 4]]);
    for (let y = F + 1; y <= F + 3; y++) kit.curtain(19, y, 56, 'white', 'e', 'open');
    b.box(29, F, 52, 39, F, 57, 'marble');
    b.box(30, F, 53, 38, F, 56, 'water');
    b.set(34, F, 54, 'marble');
    b.set(34, F + 1, 54, 'fountain');
    for (const [x, z] of [[29, 52], [39, 52], [29, 57], [39, 57]]) kit.statue(x, F + 1, z, 'n');
    kit.bathtub(24, F, 51, 'e');
    for (const x of [42, 44]) {
        kit.piece(x, F, 51, 'sink', 'sink', 's');
        kit.mirror(x, F + 1, 51, 's');
    }
    kit.sofa(27, F, 61, 'white', 'n');
    kit.sofa(28, F, 61, 'white', 'n');
    kit.tall(23, F, 58, 'wardrobe', 'n');
    kit.chest(44, F, 61, 'n', [['white_wool', 16], ['salt', 8], ['soda_water', 6], ['cold_water', 6]]);
    kit.sign(43, F, 57, 'e', 'Baños', 'Baths');

    // The guard hall (east): benches, a table, wardrobes for the guards, banners.
    // Some chairs pushed back from the table or turned, as the guards left them; a game of chess between two
    // watches, their supper and a jug.
    for (let x = 98; x <= 110; x++) {
        b.set(x, F, 55, 'table');
        if (x % 2 === 0) {
            const out = constructionPalaceHash(x, F, 55, 31);
            kit.chair(x, F, out < 0.3 ? 53 : 54, 's');
            kit.chair(x, F, out > 0.7 ? 57 : 56, out > 0.85 ? 'e' : 'n');
        }
    }
    b.set(100, F + 1, 55, 'candle');
    b.set(106, F + 1, 55, 'candle');
    kit.tabletop(103, F + 1, 55, 'chessboard', 'n');
    kit.tabletop(99, F + 1, 55, 'meal_plate');
    kit.tabletop(108, F + 1, 55, 'jug');
    kit.benches(112, 120, F, 51, 's');
    for (const x of [96, 100, 104]) kit.tall(x, F, 61, 'wardrobe', 'n');
    kit.chest(108, F, 61, 'n', [['torch', 32], ['lantern', 6], ['leather', 12], ['bread', 16]]);
    kit.chest(110, F, 61, 'n', [['candle', 24], ['warm_coat', 4], ['measuring_tape', 2], ['iron_block', 2]]);
    for (const z of [53, 57]) kit.banner(121, F + 3, z, 'blue', 'w');
    for (const z of [53, 57]) kit.banner(95, F + 3, z, 'red', 'e');
    kit.sign(97, F, 57, 'w', 'Sala de guardias', 'Guard hall');

    // The banquet hall (west, garden side): one long table set with candles, chairs both sides, the king's
    // and queen's chairs at its head, sideboards and paintings.
    for (let x = 31; x <= 53; x++) {
        b.set(x, F, 66, 'table');
        b.set(x, F, 67, 'table');
        if (x % 2) {
            kit.chair(x, F, 65, 's');
            kit.chair(x, F, x === 45 || x === 37 ? 69 : 68, x === 45 ? 'e' : 'n');
            b.set(x, F + 1, x % 4 === 1 ? 66 : 67, 'candle');
        } else if (x % 8 === 0) {
            kit.tabletop(x, F + 1, 66, 'fruit_bowl');
        } else if (x % 4 === 0) {
            b.set(x, F + 1, 66, 'vase');
        }
    }
    kit.chair(30, F, 66, 'e', 'oak');
    kit.chair(30, F, 67, 'e', 'oak');
    kit.chair(54, F, 66, 'w', 'oak');
    kit.chair(54, F, 67, 'w', 'oak');
    for (const x of [33, 41, 49]) {
        kit.chest(x, F, 63, 's', [['candle', 16], ['bread', 12], ['cheese', 8], ['honey_bottle', 6]]);
        b.set(x + 1, F, 63, 'flower_pot');
    }
    for (let k = 0; k < 6; k++) kit.painting(29 + 5 * k, F + 2, 63, 's', k);
    for (const x of [32, 38, 44, 50, 56]) kit.chandelier(x, F + 3, 67, N);
    kit.sign(55, F, 64, 'e', 'Comedor de gala', 'Banquet hall');

    // The library (east, garden side): bookshelves along the walls, desks and reading tables, a globe.
    for (let x = 86; x <= 112; x++) {
        if (x !== 88) kit.shelf(x, F, 63, 's', 4);
    }
    for (let z = 64; z <= 68; z++) kit.shelf(113, F, z, 'w', 4);
    for (const x of [86, 94, 102, 110]) {
        if (constructionPalaceBaroqueBay(x, 72, true) === 0) kit.shelf(x, F, 71, 'n', 5);
    }
    for (const x of [90, 98, 106]) {
        b.box(x, F, 67, x + 2, F, 68, 'table');
        kit.chair(x - 1, F, 67, 'e');
        kit.chair(x + 3, F, 68, x === 106 ? 's' : 'w');
        b.set(x + 1, F + 1, 67, 'candle');
        kit.piece(x, F + 1, 68, 'table_lamp', 'table_lamp', 'n');
    }
    // A reader has left a book open by the lamp and a pile beside it; a map lies on the next table; the
    // third is bare.
    kit.tabletop(92, F + 1, 68, 'open_book', 'w');
    kit.tabletop(92, F + 1, 67, 'book_stack', 'w');
    kit.tabletop(100, F + 1, 68, 'scroll', 'w');
    kit.tabletop(98, F + 1, 67, 'open_book', 'e');
    b.set(95, F, 70, 'globe');
    kit.piece(100, F, 70, 'desk', 'desk', 'n');
    kit.chair(100, F, 69, 's');
    kit.tabletop(100, F + 1, 70, 'inkwell', 'n');
    kit.chest(101, F, 70, 'n', [['star_chart', 6], ['blueprint', 8], ['breeding_notebook', 2], ['candle', 12]]);
    kit.chest(88, F, 64, 's', [['star_chart', 4], ['blueprint', 4], ['measuring_tape', 2], ['globe', 1]]);
    kit.sign(85, F, 69, 'w', 'Biblioteca', 'Library');

    // Curtains at the garden windows of the banquet hall, the salon and the library, a pair to each window
    // (the window whose middle is x), about one in three drawn against the sun.
    b.sym(() => {
        for (let x = 28; x <= 64; x += 4) {
            const color = x > 58 ? 'blue' : b.flipped ? 'green' : 'red';
            const drawn = kit.pick([['closed', 1], ['open', 2]], x, F, 71, 59);
            for (let y = F + 1; y <= F + 3; y++) {
                kit.curtain(x - 1, y, 71, color, 'n', drawn);
                kit.curtain(x + 1, y, 71, color, 'n', drawn);
            }
        }
    });
}

// ---------------------------------------------------------------------------------------
// The piano nobile: throne room, Hall of Mirrors, apartments, treasury and the optics cabinet.

function constructionPalaceBaroqueNoble(b) {
    const N = PALACE_BAROQUE_NOBLE;
    const F = N + 1;
    const A = PALACE_BAROQUE_ATTIC;
    const top = A - 1;
    const mid = PALACE_BAROQUE_MID;
    const kit = constructionPalaceBaroqueKit(b);

    // The throne room over the vestibule: the throne on a dais of two steps under a canopy of red and gold,
    // its back to the gold of the middle window; a red carpet from the gallery's arch; banners and chandeliers.
    b.box(mid - 1, F, 49, mid + 1, F, 61, 'red_carpet');
    for (let x = mid - 4; x <= mid + 4; x++) {
        b.stairs(x, F, 48, 'white_glazed_tile_stairs', 'n');
        b.box(x, F, 45, x, F, 47, 'marble');
    }
    b.box(mid - 2, F + 1, 47, mid + 2, F + 1, 47, 'red_carpet');
    b.box(mid - 1, F + 1, 45, mid + 1, F + 1, 46, 'red_carpet');
    kit.throne(mid, F + 1, 46, 's');
    b.box(mid - 1, F, 44, mid + 1, top, 44, 'gold_block');
    b.box(mid - 1, F + 2, 44, mid + 1, F + 4, 44, 'red_wool');
    b.box(mid - 3, F + 5, 45, mid + 3, F + 5, 47, 'gold_block');
    b.box(mid - 2, F + 5, 45, mid + 2, F + 5, 46, 'red_wool');
    b.sym(() => {
        for (let y = F + 1; y <= F + 4; y++) kit.curtain(mid - 3, y, 47, 'red', 's', 'open');
        b.box(mid - 3, F + 1, 45, mid - 3, F + 4, 45, 'gold_block');
        kit.statue(mid - 5, F, 46, 's');
        for (const z of [50, 54, 58]) {
            kit.banner(59, F + 3, z, z === 54 ? 'blue' : 'red', 'e');
            kit.sofa(59, F, z, 'red', 'e');
            kit.floorLamp(60, F, z + 2);
        }
    });
    for (const z of [50, 55, 60]) kit.chandelier(mid, F + 3, z, A);
    kit.sign(mid + 3, F, 60, 's', 'Salón del trono', 'Throne room');

    // The Hall of Mirrors: the arcades face the windows on the garden, gilded pilasters between them, a row of
    // chandeliers and candelabra, parquet. Each arcade is panelled in white stucco over a marble dado under a
    // gilded frieze, with one tall mirror in a gilded frame in its middle: few enough that the game reflects
    // them well (js/game/mirrors.js reflects one or two planes and at most 256 faces), many enough to read as
    // a hall of mirrors as one walks down it.
    for (let x = 43; x <= 97; x++) {
        const o = constructionPalaceBaroqueBay(x, 0, true);
        if (x >= 69 && x <= 71) continue;
        if ((x >= 51 && x <= 53) || (x >= 87 && x <= 89)) continue;
        if (o === 0) {
            b.box(x, F, 63, x, top - 1, 63, 'marble');
            b.set(x, top, 63, 'gold_block');
            continue;
        }
        b.set(x, F, 63, 'marble');
        b.set(x, top - 1, 63, 'gold_block');
        b.set(x, top, 63, 'gold_block');
        if (o === 2) {
            // The mirror stands in a niche of the panelling, against the wall behind, its frame gilded.
            for (let y = F + 1; y <= F + 3; y++) kit.mirror(x, y, 63, 's');
            b.set(x, F + 4, 63, 'gold_block');
        } else {
            b.box(x, F + 1, 63, x, F + 4, 63, 'white_stucco');
        }
    }
    for (let x = 43; x <= 97; x++) {
        if (constructionPalaceBaroqueBay(x, 0, true) === 2) {
            kit.chandelier(x, F + 3, 65, A);
            kit.chandelier(x, F + 3, 69, A);
        }
        if (constructionPalaceBaroqueBay(x, 0, true) === 0) {
            kit.floorLamp(x, F, 71);
            b.set(x, top, 71, 'gold_block');
        }
    }
    for (let x = 43; x <= 97; x += 8) {
        if (x === 67 || x === 75) continue;
        b.set(x, F, 64, 'marble');
        b.set(x, F + 1, 64, 'vase');
    }
    kit.sign(mid + 3, F, 64, 's', 'Galería de los espejos', 'Hall of Mirrors');

    // The queen's apartment (west) and the king's (east): a bedchamber with a state bed behind a gilded rail,
    // wardrobes, a dressing table with a mirror, a desk; an antechamber with sofas, paintings and a clock.
    b.sym(() => {
        const queen = !b.flipped;
        const color = queen ? 'blue' : 'red';
        // The bedchamber, x 19..37: the bed against the front wall behind its rail, wardrobes along the end wall,
        // a desk, a dressing table; the door to the tribune or the box at x 30..31 stays clear.
        b.box(20, F, 51, 27, F, 57, `${color}_carpet`);
        kit.stateBed(23, F, 51, 'n', color);
        for (let x = 20; x <= 27; x++) b.set(x, F, 55, x === 20 || x === 27 ? 'gold_block' : x === 23 || x === 24 ? null : 'iron_bars');
        kit.piece(21, F, 51, 'bedside_table', 'bedside_table', 's');
        b.set(21, F + 1, 51, 'candle');
        kit.piece(26, F, 51, 'bedside_table', 'bedside_table', 's');
        kit.tabletop(26, F + 1, 51, queen ? 'open_book' : 'book_stack', 's');
        kit.tall(19, F, 54, 'wardrobe', 'e');
        kit.tall(19, F, 56, 'wardrobe', 'e');
        kit.chest(19, F, 58, 'e', queen
            ? [['blue_wool', 16], ['white_wool', 16], ['feather', 8], ['warm_coat', 2]]
            : [['red_wool', 16], ['white_wool', 16], ['fur', 6], ['warm_coat', 2]]);
        // The queen has left a letter half written and pushed her chair back; on the king's desk, a map.
        kit.piece(37, F, 52, 'desk', 'desk', 'w');
        kit.chair(36, F, 52, queen ? 's' : 'e', 'birch');
        kit.tabletop(37, F + 1, 52, queen ? 'inkwell' : 'scroll', 'w');
        b.set(37, F, 53, 'globe');
        kit.sofa(33, F, 51, color, 's');
        kit.sofa(34, F, 51, color, 's');
        if (queen) kit.tabletop(35, F, 51, 'sewing_basket', 's');
        // Curtains at the two windows on the park, drawn or open as each was left.
        for (const z of [52, 56]) {
            const drawn = kit.pick([['closed', 1], ['open', 2]], 19, F, z, 41);
            for (let y = F; y <= F + 4; y++) {
                kit.curtain(19, y, z - 1, color, 'e', drawn);
                kit.curtain(19, y, z + 1, color, 'e', drawn);
            }
        }
        kit.painting(37, F + 2, 57, 'w', queen ? 2 : 4);
        kit.piece(34, F + 3, 51, 'wall_clock', 'wall_clock', 's');
        kit.floorLamp(20, F, 52);
        // Behind the bedchamber, along the middle wall (x 27..37, z 59..61), the closet and the private
        // washroom: a wall at z = 58 with a door to each, and one between them at x = 32. The closet holds
        // the wardrobes and the dressing table and is the servants' way in, by the door of the service stair.
        b.box(27, F, 58, 37, top, 58, 'white_stucco');
        b.box(32, F, 59, 32, top, 61, 'white_stucco');
        for (const x of [29, 35]) {
            b.box(x, F, 58, x, F + 1, 58, null);
            b.door(x, F, 58, 'birch_door', 'n', 'left');
        }
        kit.tall(28, F, 61, 'wardrobe', 'n');
        kit.tall(29, F, 61, 'wardrobe', 'n');
        kit.piece(31, F, 61, 'table', 'table', 'n');
        kit.mirror(31, F + 1, 61, 'n');
        kit.chair(31, F, 60, 's', 'birch');
        kit.tabletop(30, F, 61, queen ? 'sewing_basket' : null, 'n');
        // The washroom, 5 x 3: a bathtub, a basin under a mirror, a toilet.
        kit.bathtub(33, F, 61, 'e');
        kit.piece(37, F, 61, 'toilet', 'toilet', 'w');
        kit.piece(37, F, 59, 'sink', 'sink', 'w');
        kit.mirror(37, F + 1, 59, 'w');
        b.set(35, F, 61, 'flower_pot');
        // The antechamber, x 39..45.
        for (const z of [52, 53]) kit.sofa(45, F, z, color, 'w');
        // Tea set out in the queen's antechamber, a game of chess waiting in the king's.
        b.set(42, F, 53, 'table');
        kit.tabletop(42, F + 1, 53, queen ? 'tea_set' : 'chessboard', queen ? 'w' : 'n');
        kit.chair(41, F, 53, 'e', 'birch');
        kit.chair(43, F, 53, queen ? 's' : 'w', 'birch');
        for (const x of [40, 44]) {
            const drawn = kit.pick([['closed', 1], ['open', 2]], x, F, 51, 43);
            for (let y = F; y <= F + 4; y++) {
                kit.curtain(x - 1, y, 51, color, 's', drawn);
                kit.curtain(x + 1, y, 51, color, 's', drawn);
            }
        }
        kit.painting(39, F + 2, 58, 'e', queen ? 0 : 3);
        kit.painting(45, F + 2, 57, 'w', queen ? 5 : 1);
        kit.piece(42, F + 3, 51, 'wall_clock', 'wall_clock', 's');
        b.set(40, F, 51, 'flower_pot');
        kit.statue(39, F, 61, 'e');
        kit.floorLamp(44, F, 61);
    });
    kit.sign(41, F, 58, 'e', 'Aposentos de la reina', 'Queen\'s apartment');
    kit.sign(99, F, 58, 'w', 'Aposentos del rey', 'King\'s apartment');

    // The treasury at the west end of the gallery: chests of gold and gems on a dais, crowns of gold on
    // marble pedestals, glass cases.
    b.box(28, F, 64, 40, F, 70, 'purple_carpet');
    kit.chest(30, F, 71, 'n', [['gold_leaf', 32], ['gold_ore', 16], ['gold_block', 4]]);
    kit.chest(34, F, 71, 'n', [['ruby', 12], ['sapphire', 12], ['amber', 6], ['fluorite', 6]]);
    kit.chest(38, F, 71, 'n', [['brass_ingot', 16], ['bronze_ingot', 16], ['pyrite', 8], ['gold_leaf', 16]]);
    for (const x of [28, 32, 36, 40]) {
        b.set(x, F, 64, 'marble');
        b.set(x, F + 1, 64, x % 8 === 0 ? 'gold_block' : 'vase');
    }
    for (const z of [65, 68]) {
        b.set(27, F, z, 'gold_block');
        b.set(27, F + 1, z, 'glass');
    }
    kit.banner(27, F + 3, 66, 'purple', 'e');
    kit.banner(27, F + 3, 69, 'yellow', 'e');
    kit.floorLamp(40, F, 70);
    kit.sign(40, F, 65, 'e', 'Tesoro', 'Treasury');

    constructionPalaceBaroqueOptics(b);
}

// The optics cabinet at the east end of the Hall of Mirrors (x 99..113, z 63..71). A visitor comes in from the
// gallery and walks along z 66..67; the exhibits stand either side, a sign before each:
//   north-east: a low wall of silver mirrors with the path of a ray laid on the floor in carpet, from a
//               lantern to the mirror and on to a bust, and the normal in white between them;
//   north-west: two mirrors face to face with candles between them;
//   south:      a glass prism by a clear window spreading a fan of the seven colours on the floor, and the
//               next window in stained glass in rainbow order; a desk, a globe, an astrolabe, the chest with
//               the telescope.
function constructionPalaceBaroqueOptics(b) {
    const N = PALACE_BAROQUE_NOBLE;
    const F = N + 1;
    const A = PALACE_BAROQUE_ATTIC;
    const kit = constructionPalaceBaroqueKit(b);

    // Reflection: angle in = angle out. A lantern, the ray to the mirror and away from it in yellow, the normal
    // (the line square to the mirror) in white, and a bust where the ray arrives.
    b.box(103, F, 63, 109, F + 1, 63, 'mirror');
    kit.lantern(104, F, 65, 'floor');
    b.set(105, F, 64, 'yellow_carpet');
    b.set(107, F, 64, 'yellow_carpet');
    b.set(106, F, 64, 'white_carpet');
    b.set(106, F, 65, 'white_carpet');
    kit.statue(108, F, 65, 'w');
    kit.sign(110, F, 65, 's', 'Reflexión: la luz rebota en el espejo con el mismo ángulo con que llega. Ángulo de entrada = ángulo de salida.',
        'Reflection: light bounces off a mirror at the same angle it arrives. Angle in = angle out.');

    // Two mirrors face to face and candles between them.
    kit.mirror(99, F, 64, 'e');
    kit.mirror(99, F + 1, 64, 'e');
    b.box(102, F, 63, 102, F + 2, 65, 'marble');
    kit.mirror(101, F, 64, 'w');
    kit.mirror(101, F + 1, 64, 'w');
    b.set(100, F, 64, 'table');
    b.set(100, F + 1, 64, 'candle');
    b.set(100, F, 63, 'candle');
    kit.sign(100, F, 65, 's', 'Cada espejo devuelve la luz de las velas: la galería parece tener el doble. Dos espejos enfrentados repiten la llama sin fin.',
        'Each mirror sends the candlelight back, so the gallery looks twice as bright. Two facing mirrors repeat the flame again and again.');

    // White light into colours: the prism by the clear window, its fan of colours, the rainbow window.
    b.set(108, F, 71, 'marble');
    b.set(108, F + 1, 71, 'glass');
    for (let k = 0; k < 7; k++) b.set(105 + k, F, 69, `${PALACE_BAROQUE_SPECTRUM[k]}_carpet`);
    for (let k = 0; k < 5; k++) b.set(106 + k, F, 70, `${PALACE_BAROQUE_SPECTRUM[Math.round(k * 1.5)]}_carpet`);
    for (let x = 111; x <= 113; x++) {
        for (let y = F; y <= F + 6; y++) b.set(x, y, 72, `${PALACE_BAROQUE_SPECTRUM[y - F]}_stained_glass_pane`);
    }
    kit.sign(104, F, 69, 'n', 'La luz blanca es una mezcla de colores. El prisma desvía cada color un poco distinto y los separa, como el arcoíris.',
        'White light is a mix of colours. A prism bends each colour by a different amount and spreads them out, like a rainbow.');

    // The instruments.
    b.set(101, F, 70, 'globe');
    kit.piece(103, F, 71, 'desk', 'desk', 'n');
    kit.piece(103, F + 1, 71, 'astrolabe', 'astrolabe', 'n');
    b.set(105, F, 71, 'table');
    kit.tabletop(105, F + 1, 71, 'inkwell', 'n');
    kit.chest(100, F, 71, 'n', [['telescope', 2], ['mirror', 6], ['glass', 12], ['cobalt_glass', 4], ['star_chart', 3], ['candle', 12]]);
    kit.chest(113, F, 64, 'w', [['mirror', 4], ['glass', 8], ['measuring_tape', 2], ['candle', 8]]);
    kit.piece(113, F + 2, 67, 'painting_night', 'painting', 'w');
    kit.floorLamp(112, F, 70);
    kit.sign(99, F, 68, 'n', 'Gabinete de óptica', 'Optics cabinet');
}

// ---------------------------------------------------------------------------------------
// The attic: servants' rooms off the corridor, the servants' hall and the linen room in the middle.

function constructionPalaceBaroqueAttic(b) {
    const A = PALACE_BAROQUE_ATTIC;
    const F = A + 1;
    const top = PALACE_BAROQUE_ROOF - 1;
    const mid = PALACE_BAROQUE_MID;
    const kit = constructionPalaceBaroqueKit(b);
    b.box(27, F, 62, 113, F, 62, 'brown_carpet');
    for (let x = 30; x <= 110; x += 6) kit.lantern(x, top, 62);
    // A room of two servants: two beds, a wardrobe, a chest of linen, a stool and a lantern.
    const room = (x0, z0, front, n) => {
        const back = front ? z0 : z0 + 6;
        const facing = front ? 'n' : 's';
        constructionPalaceBed(b, x0, F, back, facing);
        constructionPalaceBed(b, x0 + 5, F, back, facing);
        kit.tall(x0 + 2, F, back, 'wardrobe', front ? 's' : 'n');
        const z = front ? z0 + 3 : z0 + 3;
        kit.chest(x0 + 5, F, z, 'w', [['white_wool', 8], ['bread', 6], ['candle', 6], n % 2 ? ['warm_coat', 1] : ['leather', 4]]);
        kit.piece(x0, F, z, 'stool', 'stool', 'n');
        b.set(x0 + 1, F, z, 'table');
        kit.tabletop(x0 + 1, F + 1, z, kit.pick([['jug', 3], ['meal_plate', 2], ['sewing_basket', 2], ['open_book', 1], [null, 3]], x0, F, z, 47), front ? 's' : 'n');
        kit.lantern(x0 + 3, top, z);
        b.set(x0 + 3, F, back, 'flower_pot');
    };
    let n = 0;
    b.sym(() => {
        for (const x0 of [27, 35, 43, 51]) {
            room(x0, 51, true, n++);
            room(x0, 65, false, n++);
        }
    });
    // The servants' hall over the throne room: a long table, benches, a dresser of food.
    for (let x = 62; x <= 78; x++) {
        b.set(x, F, 53, 'table');
        if (x % 2 === 0) b.set(x, F + 1, 53, 'candle');
        else kit.tabletop(x, F + 1, 53, constructionPalacePick([['meal_plate', 3], ['jug', 2], ['fruit_bowl', 1], [null, 3]], x, F, 53, 53));
    }
    kit.benches(62, 78, F, 52, 's');
    kit.benches(62, 78, F, 54, 'n');
    kit.chest(60, F, 48, 'e', [['bread', 20], ['cheese', 10], ['milk', 6], ['honey_bottle', 4]]);
    kit.chest(80, F, 48, 'w', [['candle', 20], ['lantern', 4], ['white_wool', 8]]);
    for (const x of [62, 70, 78]) kit.lantern(x, top, 50);
    for (const x of [60, 70, 80]) kit.lantern(x, top, 58);
    kit.sign(mid, F, 58, 's', 'Sala del servicio', 'Servants\' hall');
    // The linen room behind it.
    for (const x of [60, 63, 77, 80]) kit.tall(x, F, 71, 'wardrobe', 'n');
    kit.chest(66, F, 71, 'n', [['white_wool', 32], ['blue_wool', 16], ['red_wool', 16], ['yellow_wool', 8]]);
    kit.chest(74, F, 71, 'n', [['white_wool', 32], ['green_wool', 12], ['feather', 12], ['leather', 8]]);
    b.box(66, F, 67, 74, F, 68, 'table');
    // Mending under way: two sewing baskets, and the list of the linen.
    kit.tabletop(67, F + 1, 67, 'sewing_basket', 's');
    kit.tabletop(72, F + 1, 68, 'sewing_basket', 'n');
    kit.tabletop(74, F + 1, 67, 'scroll', 's');
    for (const x of [62, 70, 78]) kit.lantern(x, top, 68);
    kit.sign(mid, F, 66, 'n', 'Lencería', 'Linen room');
}

// ---------------------------------------------------------------------------------------
// The wings: the chapel (west) and the opera (east).

function constructionPalaceBaroqueWings(b) {
    const G = PALACE_BAROQUE_GROUND;
    const F = G + 1;
    const N = PALACE_BAROQUE_NOBLE;
    const T = PALACE_BAROQUE_ROOF;
    const kit = constructionPalaceBaroqueKit(b);
    const balustrade = (x0, x1, z) => {
        for (let x = x0; x <= x1; x++) b.set(x, N + 1, z, x % 3 === 0 ? 'gold_block' : 'iron_bars');
    };

    // The chapel, three storeys tall: marble piers, benches facing the altar, the royal tribune over the door
    // with the organ, stained glass.
    b.box(27, F, 29, 29, F, 43, 'red_carpet');
    for (let x = 22; x <= 34; x++) {
        b.set(x, F, 27, 'marble');
        b.stairs(x, F, 28, 'white_glazed_tile_stairs', 'n');
    }
    b.box(22, F, 23, 34, F, 26, 'marble');
    b.box(26, F + 1, 24, 30, F + 1, 24, 'marble');
    b.box(27, F + 2, 24, 29, F + 2, 24, 'gold_block');
    for (const x of [26, 30]) b.set(x, F + 2, 24, 'candle');
    b.set(28, F + 3, 24, 'candle');
    kit.lantern(24, F + 1, 25, 'floor');
    kit.lantern(32, F + 1, 25, 'floor');
    for (const [x, color] of [[21, 'white'], [25, 'yellow'], [31, 'yellow'], [35, 'white']]) kit.banner(x, F + 4, 23, color, 's');
    for (const z of [30, 32, 34, 36, 38, 40]) {
        kit.benches(21, 25, F, z, 'n');
        kit.benches(31, 35, F, z, 'n');
    }
    for (const z of [26, 30, 34, 38, 42]) {
        for (const x of [20, 36]) {
            b.box(x, F, z, x, T - 1, z, 'marble');
            b.set(x, N, z, 'gold_block');
        }
    }
    for (const z of [29, 35, 41]) kit.chandelier(28, N + 4, z, T);
    for (const z of [32, 38]) {
        kit.chandelier(22, N - 1, z, T);
        kit.chandelier(34, N - 1, z, T);
    }
    for (const [x, z] of [[22, 46], [28, 46], [34, 46]]) kit.lantern(x, N - 1, z);
    kit.chandelier(28, N - 2, 26, T);
    kit.sign(35, F, 46, 'e', 'Capilla', 'Chapel');
    // The tribune: a gilded balustrade over the nave, the queen's door, sofas, the organ pipes.
    balustrade(19, 37, 44);
    for (const x of [25, 26, 27, 29, 30, 31]) kit.sofa(x, N + 1, 46, 'red', 'n');
    for (const [x, h] of [[20, 7], [21, 9], [22, 11], [23, 9], [24, 7], [32, 7], [33, 9], [34, 11], [35, 9], [36, 7]]) {
        b.box(x, N + 1, 49, x, N + h, 49, x % 2 ? 'copper_block' : 'iron_block');
    }
    b.box(20, N + 1, 48, 24, N + 1, 48, 'dark_oak_planks');
    b.box(32, N + 1, 48, 36, N + 1, 48, 'dark_oak_planks');
    kit.chandelier(28, N + 5, 47, T);
    kit.chandelier(22, N + 5, 46, T);
    kit.chandelier(34, N + 5, 46, T);
    kit.chest(37, N + 1, 48, 'w', [['candle', 32], ['lantern', 6], ['white_wool', 8]]);
    kit.sign(28, N + 1, 45, 's', 'Tribuna real', 'Royal tribune');

    // The opera: a stage with its proscenium of gold and red curtains, scenery, footlights; the pit of benches;
    // the royal box over the door.
    for (let z = 23; z <= 30; z++) {
        for (let x = 103; x <= 121; x++) b.set(x, F, z, 'spruce_planks');
    }
    for (let x = 110; x <= 114; x++) b.stairs(x, F, 31, 'spruce_stairs', 'n');
    for (const x of [104, 120]) {
        b.box(x, F, 31, x, N + 3, 31, 'marble');
        b.set(x, N + 4, 31, 'gold_block');
    }
    b.box(104, N + 5, 31, 120, N + 6, 31, 'gold_block');
    b.box(105, N + 4, 31, 119, N + 4, 31, 'red_wool');
    for (let y = F + 1; y <= N + 3; y++) {
        for (const x of [105, 106, 118, 119]) kit.curtain(x, y, 30, 'red', 'n', 'open');
    }
    for (const x of [106, 108, 116, 118]) b.set(x, F + 1, 30, 'candle');
    for (const [x, n] of [[106, 1], [110, 2], [114, 0], [118, 4]]) kit.painting(x, F + 3, 23, 's', n);
    for (const x of [107, 117]) {
        b.box(x, F + 1, 25, x, F + 3, 25, 'oak_fence');
        b.box(x - 1, F + 4, 24, x + 1, F + 5, 26, 'leaves');
    }
    b.set(112, F + 1, 25, 'fountain');
    kit.chest(121, F + 1, 24, 'w', [['red_wool', 16], ['yellow_wool', 16], ['feather', 12], ['blue_wool', 8]]);
    kit.chandelier(109, N + 3, 27, T);
    kit.chandelier(115, N + 3, 27, T);
    b.box(111, F, 33, 113, F, 43, 'red_carpet');
    for (const z of [34, 36, 38, 40, 42]) {
        kit.benches(105, 110, F, z, 'n');
        kit.benches(114, 119, F, z, 'n');
    }
    for (const z of [26, 30, 34, 38, 42]) {
        for (const x of [104, 120]) {
            b.box(x, F, z, x, T - 1, z, 'marble');
            b.set(x, N, z, 'gold_block');
        }
    }
    for (const z of [35, 41]) kit.chandelier(112, N + 4, z, T);
    for (const z of [35, 41]) {
        kit.chandelier(106, N - 1, z, T);
        kit.chandelier(118, N - 1, z, T);
    }
    for (const [x, z] of [[106, 46], [112, 46], [118, 46]]) kit.lantern(x, N - 1, z);
    kit.sign(105, F, 46, 'w', 'Ópera', 'Opera');
    balustrade(103, 121, 44);
    for (const x of [109, 110, 111, 113, 114, 115]) kit.sofa(x, N + 1, 46, 'red', 'n');
    kit.throne(112, N + 1, 47, 'n');
    for (const x of [104, 120]) kit.banner(x, N + 3, 49, 'red', 'n');
    kit.chandelier(106, N + 5, 47, T);
    kit.chandelier(118, N + 5, 47, T);
    kit.chandelier(112, N + 6, 45, T);
    kit.sign(116, N + 1, 45, 's', 'Palco real', 'Royal box');
}

// ---------------------------------------------------------------------------------------
// The garden behind the palace.

function constructionPalaceBaroqueGarden(b) {
    const G = PALACE_BAROQUE_GROUND;
    const F = G + 1;
    const mid = PALACE_BAROQUE_MID;
    const last = PALACE_BAROQUE_SIZE[2] - 1 - PALACE_BAROQUE_RIM;
    const kit = constructionPalaceBaroqueKit(b);
    const put = constructionPalacePut(b);
    const basin = (x0, z0, x1, z1) => {
        b.box(x0, G, z0, x1, G, z1, 'marble');
        b.walls(x0, F, z0, x1, F, z1, 'marble');
        b.box(x0 + 1, G, z0 + 1, x1 - 1, G, z1 - 1, 'water');
    };

    // The terrace along the garden front, paved, with a balustrade and orange trees in boxes.
    for (let z = 73; z <= 77; z++) {
        for (let x = 14; x <= 126; x++) b.set(x, G, z, z === 77 || x % 8 === 6 ? 'stone_bricks' : 'limestone');
    }
    b.sym(() => {
        for (let x = 18; x <= 64; x++) {
            if (x >= 28 && x <= 32) continue;
            b.set(x, F, 77, x % 4 === 2 ? 'marble' : 'white_glazed_tile_slab');
            if (x % 16 === 2) kit.statue(x, F + 1, 77, 's');
        }
        for (let x = 22; x <= 58; x += 6) {
            b.set(x, F, 74, 'dark_oak_planks');
            b.set(x, F + 1, 74, 'wood');
            b.box(x, F + 2, 74, x, F + 3, 74, 'leaves');
        }
        kit.lanternPost(28, F, 77, 'dark_oak_fence', 2);
        kit.lanternPost(32, F, 77, 'dark_oak_fence', 2);
    });

    // The allée down the axis to the canal, limestone, busts on pedestals both sides; cross paths.
    for (let z = 78; z <= 105; z++) {
        for (let x = 66; x <= 74; x++) b.set(x, G, z, x === 66 || x === 74 ? 'stone_bricks' : 'limestone');
    }
    for (const z0 of [88, 104]) {
        for (let z = z0; z <= z0 + 1; z++) {
            for (let x = 14; x <= 126; x++) b.set(x, G, z, 'limestone');
        }
    }
    for (let z = 78; z <= 127; z++) {
        for (const x of [36, 104]) b.set(x, G, z, 'limestone');
    }
    b.sym(() => {
        for (let z = 79; z <= 103; z += 4) {
            if (z >= 94 && z <= 100) continue;
            b.set(65, F, z, 'marble');
            kit.statue(65, F + 1, z, 'e');
        }
        for (const z of [81, 101]) kit.lanternPost(64, F, z, 'dark_oak_fence', 2);
    });

    // The water parterre: two long basins with a fountain each and busts at their corners.
    b.sym(() => {
        basin(44, 79, 62, 86);
        b.set(53, G, 82, 'marble');
        b.set(53, F, 82, 'marble');
        b.set(53, F + 1, 82, 'fountain');
        b.set(53, G, 83, 'marble');
        b.set(53, F, 83, 'fountain');
        for (const [x, z] of [[44, 79], [62, 79], [44, 86], [62, 86]]) kit.statue(x, F + 1, z, 's');
    });

    // The parterres de broderie: box hedges in a pattern of diamonds, red and yellow flowers inside them,
    // gravel round them, a fountain in the middle of each.
    b.sym(() => {
        const [x0, z0, x1, z1] = [30, 90, 62, 102];
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                const u = x - x0;
                const v = z - z0;
                const edge = u === 0 || v === 0 || x === x1 || z === z1;
                const gap = Math.abs(x - 46) <= 1 || Math.abs(z - 96) <= 0;
                b.set(x, G, z, 'grass');
                if (edge) {
                    if (!gap) b.set(x, F, z, 'leaves');
                    continue;
                }
                const cu = ((u + 4) % 8) - 4;
                const cv = ((v + 2) % 8) - 4;
                const ring = Math.abs(cu) + Math.abs(cv);
                if (ring === 3) b.set(x, F, z, 'leaves');
                else if (ring === 0) b.set(x, F, z, 'flower_yellow');
                else if (ring === 1) b.set(x, F, z, 'flower_red');
                else if (ring >= 6 && (u + v) % 2 === 0) b.set(x, F, z, 'flower_yellow');
            }
        }
        for (let z = z0; z <= z1; z++) {
            for (let x = 45; x <= 47; x++) {
                b.set(x, G, z, 'limestone');
                b.set(x, F, z, null);
            }
        }
        for (let x = x0 + 1; x < x1; x++) {
            b.set(x, G, 96, 'limestone');
            b.set(x, F, 96, null);
        }
        b.box(45, G, 95, 47, G, 97, 'marble');
        b.set(46, F, 96, 'fountain');
    });

    // The Latona fountain on the axis: a round basin, a stepped marble island, a fountain and four busts.
    for (let dz = -5; dz <= 5; dz++) {
        for (let dx = -5; dx <= 5; dx++) {
            const r = Math.hypot(dx, dz);
            if (r > 5.5) continue;
            b.set(mid + dx, G, 96 + dz, r > 4.5 ? 'marble' : 'water');
            if (r > 4.5) b.set(mid + dx, F, 96 + dz, 'marble');
        }
    }
    b.box(mid - 1, G, 95, mid + 1, F, 97, 'marble');
    b.set(mid, F + 1, 96, 'fountain');
    for (const [x, z, facing] of [[mid - 1, 95, 'n'], [mid + 1, 95, 'n'], [mid - 1, 97, 's'], [mid + 1, 97, 's']]) kit.statue(x, F + 1, z, facing);

    // The grand canal, a cross of water framed in limestone, with lamps along it.
    const arms = [[64, 107, 76, last], [38, 113, 102, 118]];
    for (const [x0, z0, x1, z1] of arms) {
        for (let z = z0 - 1; z <= Math.min(last, z1 + 1); z++) {
            for (let x = x0 - 1; x <= x1 + 1; x++) {
                b.set(x, G, z, 'limestone');
                b.set(x, F, z, 'stone_bricks_slab');
            }
        }
    }
    for (const [x0, z0, x1, z1] of arms) {
        b.box(x0, G, z0, x1, G, z1, 'water');
        b.box(x0, F, z0, x1, F, z1, null);
    }
    b.sym(() => {
        for (let z = 108; z <= 126; z += 6) kit.lanternPost(61, F, z, 'dark_oak_fence', 2);
        for (let x = 40; x <= 60; x += 10) {
            kit.lanternPost(x, F, 110, 'dark_oak_fence', 2);
            kit.lanternPost(x, F, 121, 'dark_oak_fence', 2);
        }
    });

    // Bosquets either side: trees in rows on the lawn, shrubs between them.
    b.sym(() => {
        for (let z = 80; z <= 100; z += 6) {
            for (const x of [17, 23, 29]) constructionPalaceTree(put, z % 12 === 8 ? 'birch' : 'oak', x, F, z, x + z);
        }
        for (const [x0, z0] of [[40, 108], [52, 108], [40, 122], [52, 122]]) {
            constructionPalaceTree(put, 'oak', x0, F, z0 + (z0 > 115 ? 2 : 0), x0);
        }
        for (let z = 79; z <= 103; z += 2) {
            if (z === 89) continue;
            b.set(14, F, z, 'leaves');
        }
    });

    constructionPalaceBaroqueGardenHouses(b);
}

// The orangery (west) and the stables (east) at the ends of the canal's arms: long low buildings of limestone
// under slate, tall windows on the canal. Orange trees in boxes winter in the orangery; the stables have stalls
// with straw, barrels of oats and the harness.
function constructionPalaceBaroqueGardenHouses(b) {
    const G = PALACE_BAROQUE_GROUND;
    const F = G + 1;
    const kit = constructionPalaceBaroqueKit(b);
    const [x0, z0, x1, z1] = [14, 108, 32, 124];
    const roof = G + 7;
    b.sym(() => {
        b.box(x0, G, z0, x1, roof, z1, 'limestone');
        b.box(x0 + 1, F, z0 + 1, x1 - 1, roof - 1, z1 - 1, null);
        b.box(x0 + 1, G, z0 + 1, x1 - 1, G, z1 - 1, 'stone_bricks');
        for (let z = z0; z <= z1; z += 4) {
            b.box(x1, F, z, x1, roof - 1, z, 'marble');
            b.box(x0, F, z, x0, roof - 1, z, 'marble');
        }
        for (let z = z0 + 1; z < z1; z++) {
            if ((z - z0) % 4 === 0) continue;
            b.box(x1, F + 1, z, x1, roof - 2, z, 'glass_pane');
            b.box(x0, F + 2, z, x0, roof - 2, z, 'glass_pane');
        }
        for (let x = x0; x <= x1; x++) {
            for (const z of [z0, z1]) {
                if ((x - x0) % 4 === 2) b.box(x, F + 1, z, x, roof - 2, z, 'glass_pane');
            }
            b.stairs(x, roof, z0 - 1, 'stone_brick_stairs', 's', 'top');
            b.stairs(x, roof, z1 + 1, 'stone_brick_stairs', 'n', 'top');
        }
        // A slate mansard on top.
        for (let k = 0; k <= 3; k++) b.walls(x0 + 1 + k, roof + 1 + k, z0 + 1 + k, x1 - 1 - k, roof + 1 + k, z1 - 1 - k, 'slate');
        b.box(x0 + 5, roof + 4, z0 + 5, x1 - 5, roof + 4, z1 - 5, 'slate');
        for (let x = x0 + 5; x <= x1 - 5; x++) b.set(x, roof + 5, 116, x % 4 === 0 ? 'gold_block' : 'iron_bars');
        // The door on the canal, under a gold keystone.
        b.box(x1, F, 115, x1, F + 2, 117, 'marble');
        b.box(x1, F, 116, x1, F + 1, 116, null);
        b.door(x1, F, 116, 'dark_oak_door', 'w');
        b.set(x1, F + 2, 116, 'gold_block');
        b.box(x1 + 1, G, 115, x1 + 3, G, 117, 'limestone');
        for (const z of [111, 116, 121]) kit.lantern(23, roof - 1, z);
        for (const z of [111, 121]) kit.lantern(29, roof - 1, z);
        for (const z of [111, 121]) kit.lantern(17, roof - 1, z);
    });

    // The orangery: orange trees in boxes in two rows, benches between them, the gardener's things.
    for (let z = 110; z <= 122; z += 4) {
        for (const x of [17, 23]) {
            b.set(x, F, z, 'dark_oak_planks');
            b.set(x, F + 1, z, 'wood');
            b.box(x - 1, F + 2, z - 1, x + 1, F + 3, z + 1, 'leaves');
            b.set(x, F + 4, z, 'leaves');
            b.set(x, F + 2, z, 'wood');
        }
    }
    for (const z of [112, 120]) kit.benches(27, 29, F, z, 'w');
    kit.chest(15, F, 116, 'e', [['acacia_sapling', 6], ['cherry_sapling', 4], ['fertilizer', 16], ['wheat_seeds', 16], ['iron_hoe', 1]]);
    kit.barrel(15, F, 114, [['water_bucket', 4], ['bucket', 4], ['fertilizer', 12]]);
    kit.barrel(15, F, 118, [['honeycomb', 8], ['honey_bottle', 6], ['wheat_seeds', 24]]);
    for (const z of [110, 122]) b.set(31, F, z, 'flower_pot');
    kit.sign(30, F, 117, 'e', 'Orangerie', 'Orangery');

    // The stables: four stalls along the far wall behind a fence with gates, straw, water and oats in each, the
    // tack room by the door.
    for (let z = 109; z <= 123; z++) {
        for (let x = 121; x <= 125; x++) b.set(x, F, z, 'yellow_carpet');
        if (z === 110 || z === 114 || z === 118 || z === 122) b.gate(120, F, z, 'spruce_fence_gate', 'e');
        else b.set(120, F, z, 'spruce_fence');
    }
    for (const z of [112, 116, 120]) b.box(121, F, z, 125, F, z, 'spruce_fence');
    for (const z of [109, 113, 117, 121]) b.set(125, F, z, 'water');
    for (const z of [111, 115, 119]) kit.barrel(125, F, z, [['wheat', 48], ['wheat_seeds', 16]]);
    kit.barrel(125, F, 123, [['wheat', 32], ['water_bucket', 2]]);
    for (const z of [110, 113]) kit.piece(109, F + 1, z, 'wall_shelf', 'wall_shelf', 'e');
    kit.chest(109, F, 112, 'e', [['leather', 16], ['bucket', 4], ['wheat', 32], ['fishing_rod', 1]]);
    kit.chest(109, F, 120, 'e', [['leather', 8], ['water_bucket', 3], ['torch', 8], ['lantern', 2]]);
    b.set(109, F, 122, 'workbench');
    kit.sign(110, F, 117, 'w', 'Caballerizas', 'Stables');
}

// The last pass: every room gets chandeliers hung low on a lattice (light fades a level a block, so a chandelier
// under a high ceiling lights the ceiling and not the floor), wherever no light is near already and the cell and
// its chain are free. Rooms as [x0, z0, x1, z1, feet, ceiling], both halves listed.
function constructionPalaceBaroqueLights(b) {
    const [w, , d] = PALACE_BAROQUE_SIZE;
    const G = PALACE_BAROQUE_GROUND;
    const N = PALACE_BAROQUE_NOBLE;
    const A = PALACE_BAROQUE_ATTIC;
    const T = PALACE_BAROQUE_ROOF;
    const C = PALACE_BAROQUE_CELLAR;
    const typeAt = (x, y, z) => {
        const cell = b.cells.get((y * d + z) * w + x);
        return cell ? cell.type : null;
    };
    const lit = /^(chandelier|lantern|floor_lamp|torch)/;
    const near = (x, z, feet, ceiling) => {
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1 + Math.abs(dz); dx <= 1 - Math.abs(dz); dx++) {
                for (let y = feet; y < Math.min(ceiling, feet + 4); y++) {
                    if (lit.test(typeAt(x + dx, y, z + dz) || '')) return true;
                }
            }
        }
        return false;
    };
    const free = (x, y, z, ceiling) => {
        for (let k = y; k < ceiling; k++) if (typeAt(x, k, z) && typeAt(x, k, z) !== 'air') return false;
        return true;
    };
    const half = [
        // Cellars.
        [19, 51, 45, 58, C + 1, G], [27, 59, 45, 61, C + 1, G],
        // Ground floor.
        [59, 45, 81, 61, G + 1, N], [59, 63, 81, 71, G + 1, N], [47, 51, 49, 61, G + 1, N], [55, 51, 57, 61, G + 1, N], [50, 59, 54, 61, G + 1, N],
        [19, 51, 45, 58, G + 1, N], [27, 59, 45, 61, G + 1, N], [27, 63, 57, 71, G + 1, N],
        // Piano nobile.
        [59, 45, 81, 61, N + 1, A], [19, 51, 37, 58, N + 1, A], [47, 50, 49, 57, N + 1, A], [55, 50, 57, 57, N + 1, A], [27, 59, 31, 61, N + 1, A], [33, 59, 37, 61, N + 1, A], [39, 51, 45, 61, N + 1, A], [47, 58, 57, 61, N + 1, A],
        [27, 63, 41, 71, N + 1, A], [43, 63, 97, 71, N + 1, A],
        // Attic.
        [27, 61, 69, 63, A + 1, T], [59, 45, 81, 59, A + 1, T], [59, 65, 81, 71, A + 1, T],
        [19, 51, 33, 59, A + 1, T], [35, 51, 41, 59, A + 1, T], [43, 51, 49, 59, A + 1, T], [51, 51, 57, 59, A + 1, T],
        [27, 65, 33, 71, A + 1, T], [35, 65, 41, 71, A + 1, T], [43, 65, 49, 71, A + 1, T], [51, 65, 57, 71, A + 1, T],
        // The chapel and the opera: the nave, under the tribune, the tribune.
        [19, 23, 37, 43, G + 1, T], [19, 44, 37, 49, G + 1, N], [19, 44, 37, 49, N + 1, T],
        // The orangery and the stables.
        [15, 109, 31, 123, G + 1, G + 7]
    ];
    const rooms = [];
    for (const [x0, z0, x1, z1, feet, ceiling] of half) {
        rooms.push([x0, z0, x1, z1, feet, ceiling]);
        if (x0 + x1 !== 2 * PALACE_BAROQUE_MID) rooms.push([w - 1 - x1, z0, w - 1 - x0, z1, feet, ceiling]);
    }
    rooms.push([99, 63, 113, 71, N + 1, A]);
    // The privy and the bathroom off the baths, on the west side only (the guard hall has none).
    rooms.push([19, 51, 21, 53, G + 1, N], [19, 55, 21, 58, G + 1, N]);
    for (const [x0, z0, x1, z1, feet, ceiling] of rooms) {
        const y = feet + 2;
        const nx = Math.ceil((x1 - x0 + 1) / 6);
        const nz = Math.ceil((z1 - z0 + 1) / 6);
        for (let i = 0; i < nx; i++) {
            for (let j = 0; j < nz; j++) {
                const px = x0 + Math.floor(((i + 0.5) * (x1 - x0 + 1)) / nx);
                const pz = z0 + Math.floor(((j + 0.5) * (z1 - z0 + 1)) / nz);
                if (near(px, pz, feet, ceiling)) continue;
                for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                    const [x, z] = [px + dx, pz + dz];
                    if (x < x0 || x > x1 || z < z0 || z > z1 || !free(x, y, z, ceiling)) continue;
                    if (ceiling > y + 1) b.box(x, y + 1, z, x, ceiling - 1, z, 'iron_bars');
                    b.set(x, y, z, 'chandelier');
                    break;
                }
            }
        }
    }
}

function constructionPalaceBaroque(b) {
    constructionPalaceBaroqueApproach(b);
    constructionPalaceBaroqueShell(b);
    constructionPalaceBaroqueRoofs(b);
    constructionPalaceBaroqueCellars(b);
    constructionPalaceBaroqueGroundFloor(b);
    constructionPalaceBaroqueNoble(b);
    constructionPalaceBaroqueAttic(b);
    constructionPalaceBaroqueWings(b);
    constructionPalaceBaroqueGarden(b);
    constructionPalaceBaroqueLights(b);
}

CONSTRUCTION_DESIGNS.palace_baroque = {
    label: 'Baroque palace',
    size: PALACE_BAROQUE_SIZE,
    foundation: 'dirt',
    anchorX: PALACE_BAROQUE_MID,
    groundY: PALACE_BAROQUE_GROUND,
    rate: 480,
    start: [PALACE_BAROQUE_MID, PALACE_BAROQUE_GROUND + 1, 1],
    levels: [],
    site: constructionPalaceSite({ label: 'Baroque palace', theme: 'plains', groundY: PALACE_BAROQUE_GROUND, rim: PALACE_BAROQUE_RIM }),
    generate: constructionPalaceBaroque
};
