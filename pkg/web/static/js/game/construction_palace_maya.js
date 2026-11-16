// /build palace_maya: a Classic Maya royal palace in the jungle, in the spirit of Palenque and Tikal (no copy of
// either): limestone faced with lime stucco painted red and white, a little jade green, corbel vaults, friezes of
// step frets, roof combs; beside it a stepped pyramid with its temple, a ball court and a cenote. Its science is
// the Maya sky and numbers: an observatory tower, a calendar hall with the 20 day signs and a counting board.
// Loaded after construction_palace_common.js; it only adds an entry to CONSTRUCTION_DESIGNS. Everything of this
// palace lives in this file (and test/js/construction_palace_maya.test.js).
//
// The plan, in local x (across) and z (away from the player), y = PALACE_MAYA_GROUND the ground layer:
// - The way in (z 12..23): a paved plaza with two stelae, on the axis x = PALACE_MAYA_AXIS, which is where the
//   player stands, so the great stair is straight ahead. West of it a white road (sacbe) to the pyramid and the
//   cenote. Deliberately not symmetric, as a Maya city is not: the palace is the ordered part.
// - The great platform (x 53..121, z 28..118), two stepped tiers up to y = PALACE_MAYA_TOP, with the great stair
//   in front and a smaller one on the west side. On it, every building is a "range" (constructionPalaceMayaRange):
//   rooms 5 wide (3 for galleries) under a corbel vault, walls 3 high and then stepped in to a capstone, a medial
//   cornice, a frieze of step frets, a top cornice and, on the grand ones, a pierced roof comb.
//     z 30..42   the South Gallery: an open portico to the plaza and, behind its spine, the Audience Gallery,
//                with a guard room and a tribute store at the ends.
//     z 43..73   the Main Court, between the West Range (scribes, workshop, servants) and the East Range
//                (kitchen, cacao and honey store, treasury).
//     z 74..86   the Throne House: the throne room (a jade throne on a stone dais, on the axis) and, behind it,
//                the banquet hall.
//     z 87..117  the Tower Court (the four-storey observatory tower, a sundial, a ceiba) with the Calendar Hall
//                along its back; east of it the Royal Residence (bedrooms, small washrooms, a dressing room, a
//                sitting room, a schoolroom), the temazcal (steam bath) and a garden with a reservoir.
// - Daily life: things left on the tables (tabletop.js: a letter half written, a game half played, a meal half
//   eaten), stools pushed back, and cloth in the doorways, as the Maya hung it, some drawn back and some let down.
// - West of the platform: the Jaguar Temple, a pyramid of 7 tiers with its stair to the south and a temple with a
//   roof comb on top (x 12..46, z 27..70); behind it the ball court (x 14..44, z 80..112), on the same axis.
// - Stairs and landings are the only way up (no ladders), and every room is lit: lanterns hang from the first step
//   of each vault (constructionPalaceMayaLamps), chandeliers from the capstones, glowing hot stones in the bath.

const PALACE_MAYA_SIZE = [141, 56, 141];
const PALACE_MAYA_GROUND = 6;
const PALACE_MAYA_RIM = 12;
// The axis of the palace (the great stair, the passage through the galleries, the throne), straight ahead of the player.
const PALACE_MAYA_AXIS = 87;
// The floor layer of the great platform; people walk on it at PALACE_MAYA_TOP + 1.
const PALACE_MAYA_TOP = 10;
// The axis of the pyramid and the ball court.
const PALACE_MAYA_TEMPLE_AXIS = 29;

// Walls of the palace (fresh stucco), of the older pyramid and ball court (weathered, with the jungle on them), and paving.
const PALACE_MAYA_WALL = [['red_stucco', 90], ['limestone', 8], ['moss', 2]];
const PALACE_MAYA_OLD = [['red_stucco', 64], ['limestone', 26], ['moss', 10]];
const PALACE_MAYA_PAVING = [['limestone', 78], ['white_stucco', 16], ['cobblestone', 6]];

// The 20 day signs of the Maya calendar, in their order, each a glyph of two colours of wool and a layout (which
// of its 2 x 2 cells take the first colour): [name, what it stands for, first, second, layout].
const PALACE_MAYA_DAYS = [
    ['Imix', 'crocodile, water', 'blue', 'white', 'top'],
    ["Ik'", 'wind', 'white', 'cyan', 'checker'],
    ["Ak'bal", 'night', 'black', 'blue', 'top'],
    ["K'an", 'maize seed', 'yellow', 'lime', 'side'],
    ['Chikchan', 'serpent', 'green', 'red', 'checker'],
    ['Kimi', 'death', 'white', 'black', 'side'],
    ["Manik'", 'deer', 'brown', 'white', 'top'],
    ['Lamat', 'Venus, star', 'yellow', 'red', 'checker'],
    ['Muluk', 'water, jade', 'blue', 'green', 'side'],
    ['Ok', 'dog', 'brown', 'yellow', 'checker'],
    ['Chuwen', 'monkey', 'orange', 'brown', 'top'],
    ['Eb', 'road', 'light_gray', 'yellow', 'side'],
    ['Ben', 'reed', 'lime', 'yellow', 'top'],
    ['Ix', 'jaguar', 'yellow', 'black', 'checker'],
    ['Men', 'eagle', 'white', 'brown', 'side'],
    ['Kib', 'owl, wax', 'orange', 'yellow', 'checker'],
    ['Kaban', 'earth', 'brown', 'green', 'top'],
    ["Etz'nab", 'flint', 'gray', 'white', 'checker'],
    ['Kawak', 'storm', 'gray', 'light_blue', 'top'],
    ['Ajaw', 'lord, sun', 'yellow', 'white', 'side']
];

// ---------------------------------------------------------------------------------------
// Pieces

function constructionPalaceMayaHas(b, x, y, z) {
    const [w, h, d] = b.size;
    return x >= 0 && x < w && y >= 0 && y < h && z >= 0 && z < d && b.cells.has((y * d + z) * w + x);
}

// Sets a cell only where nothing is yet: cornices that stick out must not fill a neighbour's room.
function constructionPalaceMayaPut(b, x, y, z, type) {
    const [w, h, d] = b.size;
    if (x < 0 || x >= w || y < 0 || y >= h || z < 0 || z >= d || constructionPalaceMayaHas(b, x, y, z)) return;
    b.set(x, y, z, type);
}

// The outside face of a range, k layers above its floor and u along the face: the wall, the medial cornice, the
// frieze of step frets (two rows, the lower one shifted, so the pattern climbs) with a jade inlay now and then, and
// the top cornice.
function constructionPalaceMayaFace(k, u, x, y, z, wall, salt) {
    if (k <= 2) return constructionPalacePick(wall, x, y, z, salt);
    if (k === 3 || k >= 6) return 'white_stucco';
    const m = ((u % 6) + 6) % 6;
    if (k === 4) {
        if (u % 12 === 9) return 'green_glazed_tile';
        return (m + 5) % 6 < 3 ? 'red_stucco' : 'white_stucco';
    }
    return m < 3 ? 'red_stucco' : 'white_stucco';
}

// A corbel vault over the room (x0, z0)-(x1, z1), feet at f: three layers straight, then each layer one in from both
// long walls until a single row is left, closed by the capstone (the mass above). Lays its floor at f - 1.
function constructionPalaceMayaVault(b, x0, z0, x1, z1, f, floor) {
    const alongX = x1 - x0 >= z1 - z0;
    const width = alongX ? z1 - z0 + 1 : x1 - x0 + 1;
    for (let k = 0; ; k++) {
        const s = Math.max(0, k - 2);
        if (width - 2 * s < 1) break;
        const [ax0, ax1, az0, az1] = alongX ? [x0, x1, z0 + s, z1 - s] : [x0 + s, x1 - s, z0, z1];
        for (let z = az0; z <= az1; z++) {
            for (let x = ax0; x <= ax1; x++) b.set(x, f + k, z, null);
        }
    }
    for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) b.set(x, f - 1, z, typeof floor === 'function' ? floor(x, z) : floor);
    }
}

// A building: solid limestone from its floor (y) up to its roof, its faces painted, cornices round it, rooms carved
// out as vaults, doorways (each a rectangle of cells, h high), T-shaped windows (ik', the wind, as at Palenque: one
// cell over three, at [x, z] of a cell of the outer wall), and optionally a roof comb on a line of the roof.
function constructionPalaceMayaRange(b, { x0, z0, x1, z1, y, rooms = [], doors = [], windows = [], comb = null, wall = PALACE_MAYA_WALL, salt = 0 }) {
    const f = y + 1;
    for (let k = 0; k <= 6; k++) {
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                const edge = x === x0 || x === x1 || z === z0 || z === z1;
                const u = z === z0 || z === z1 ? x - x0 : z - z0;
                // Partitions are plastered white inside; the vault steps above them stay bare limestone.
                b.set(x, f + k, z, edge ? constructionPalaceMayaFace(k, u, x, f + k, z, wall, salt) : k <= 2 ? 'white_stucco' : 'limestone');
            }
        }
    }
    for (const k of [3, 6]) {
        for (let x = x0 - 1; x <= x1 + 1; x++) {
            constructionPalaceMayaPut(b, x, f + k, z0 - 1, 'white_stucco');
            constructionPalaceMayaPut(b, x, f + k, z1 + 1, 'white_stucco');
        }
        for (let z = z0; z <= z1; z++) {
            constructionPalaceMayaPut(b, x0 - 1, f + k, z, 'white_stucco');
            constructionPalaceMayaPut(b, x1 + 1, f + k, z, 'white_stucco');
        }
    }
    for (const room of rooms) constructionPalaceMayaVault(b, room.x0, room.z0, room.x1, room.z1, f, room.floor || 'white_stucco');
    for (const door of doors) {
        for (let k = 0; k < (door.h || 3); k++) {
            for (let z = door.z0; z <= door.z1; z++) {
                for (let x = door.x0; x <= door.x1; x++) b.set(x, f + k, z, null);
            }
        }
    }
    for (const [x, z] of windows) {
        const [dx, dz] = z === z0 || z === z1 ? [1, 0] : [0, 1];
        b.set(x, f + 1, z, null);
        for (let i = -1; i <= 1; i++) b.set(x + dx * i, f + 2, z + dz * i, null);
    }
    if (comb) constructionPalaceMayaComb(b, comb.x0, comb.z0, comb.x1, comb.z1, f + 7, comb.h);
}

// A roof comb (cresteria): a wall standing on the roof along a line, framed in red, pierced with square holes in
// rows, white figures between them, and a white crest.
function constructionPalaceMayaComb(b, x0, z0, x1, z1, y, h) {
    const length = Math.max(x1 - x0, z1 - z0) + 1;
    for (let u = 0; u < length; u++) {
        const [x, z] = x1 - x0 >= z1 - z0 ? [x0 + u, z0] : [x0, z0 + u];
        for (let v = 0; v < h; v++) {
            let type = 'red_stucco';
            if (v === h - 1) type = u % 2 ? 'white_stucco' : null;
            else if (u === 0 || u === length - 1 || v === 0) type = 'red_stucco';
            else if (u % 3 === 1 && v % 3 === 1) type = null;
            else if (u % 3 === 1 || v % 3 === 0) type = 'white_stucco';
            if (type) b.set(x, y + v, z, type);
        }
    }
}

// Lanterns hung from the first step of a vault, on both long sides, every 5 blocks: who stands anywhere in the room
// is within 7 of one (5 across and along, 2 down), which is light enough at night. skip(x, z) leaves a spot out.
function constructionPalaceMayaLamps(b, x0, z0, x1, z1, f, skip = () => false) {
    const { lantern } = constructionFurnisher(b);
    const alongX = x1 - x0 >= z1 - z0;
    const [a0, a1] = alongX ? [x0, x1] : [z0, z1];
    const sides = alongX ? [z0, z1] : [x0, x1];
    const spots = [];
    for (let t = a0 + 2; t <= a1 - 1; t += 5) spots.push(t);
    if (!spots.length) spots.push(Math.floor((a0 + a1) / 2));
    if (a1 - spots[spots.length - 1] > 2) spots.push(a1 - 1);
    for (const t of spots) {
        for (const s of sides) {
            const [x, z] = alongX ? [t, s] : [s, t];
            if (!skip(x, z)) lantern(x, f + 2, z, 'hanging');
        }
    }
}

// A stela: a carved slab 2 wide and 5 high on a step, its glyphs cells of red, white and now and then jade, with a
// small round altar in front of it, facing `facing`.
function constructionPalaceMayaStela(b, x, y, z, alongX, facing, salt) {
    const [fx, fz] = SHAPE_DIRECTIONS[facing];
    for (let i = -1; i <= 2; i++) {
        for (let j = -1; j <= 1; j++) b.set(alongX ? x + i : x + j, y, alongX ? z + j : z + i, 'limestone');
    }
    for (let i = 0; i < 2; i++) {
        for (let v = 1; v <= 5; v++) {
            const [cx, cz] = alongX ? [x + i, z] : [x, z + i];
            const roll = constructionPalaceHash(cx, y + v, cz, salt);
            let type = roll < 0.45 ? 'limestone' : roll < 0.72 ? 'red_stucco' : roll < 0.95 ? 'white_stucco' : 'green_glazed_tile';
            if (v === 5) type = 'white_stucco';
            b.set(cx, y + v, cz, type);
        }
    }
    // The altar, a drum of stone with a candle burning on it.
    const [ax, az] = alongX ? [x, z + 2 * fz] : [x + 2 * fx, z];
    b.set(ax, y + 1, az, 'limestone');
    b.set(ax, y + 2, az, 'candle');
}

// A brazier: a stone bowl on a post, with glowing embers (magma rock gives light and burns nobody).
function constructionPalaceMayaBrazier(b, x, y, z) {
    b.set(x, y, z, 'limestone');
    b.set(x, y + 1, z, 'magma_rock');
}

// A stair `width` wide climbing `steps` from y (its lowest step) towards `facing`, filled underneath down to `base`.
function constructionPalaceMayaStair(b, x, y, z, facing, steps, width, base, stair = 'sandstone_stairs') {
    const [fx, fz] = SHAPE_DIRECTIONS[facing];
    const [sx, sz] = [Math.abs(fz), Math.abs(fx)];
    for (let i = 0; i < steps; i++) {
        for (let j = 0; j < width; j++) {
            const cx = x + fx * i + sx * j;
            const cz = z + fz * i + sz * j;
            for (let yy = base; yy < y + i; yy++) b.set(cx, yy, cz, 'limestone');
            b.stairs(cx, y + i, cz, stair, facing);
        }
    }
}

// The side an open curtain looking towards `facing` gathers to, for a cell at the low (-1) or high (+1) end of an
// opening along the wall: towards the jamb. Seen from its front, the viewer's right is (fz, -fx) (js/game/decor.js).
function constructionPalaceMayaCurtainSide(facing, end) {
    const [fx, fz] = SHAPE_DIRECTIONS[facing];
    const along = fz !== 0 ? fz : -fx;
    return along * end > 0 ? 'right' : 'left';
}

// A doorway hung with cloth, as the Maya closed their rooms: the curtains stand in the doorway's own cells (x0, z0)
// to (x1, z1), h high, looking towards `facing` (out of the room they keep), so the cloth hangs at the face of the
// wall inside. Closed, the whole doorway is cloth; open, only the two outer columns, drawn back to the jambs.
function constructionPalaceMayaDoorCurtain(b, x0, z0, x1, z1, y, h, facing, colour, drawn) {
    const alongX = facing === 'n' || facing === 's';
    const [a0, a1] = alongX ? [x0, x1] : [z0, z1];
    for (let a = a0; a <= a1; a++) {
        const end = a1 === a0 ? 1 : a === a0 ? -1 : a === a1 ? 1 : 0;
        if (drawn === 'open' && end === 0) continue;
        const [x, z] = alongX ? [a, z0] : [x0, a];
        const side = drawn === 'open' ? constructionPalaceMayaCurtainSide(facing, end) : 'right';
        for (let k = 0; k < h; k++) b.shaped(x, y + k, z, `${colour}_curtain`, 'curtain', { facing: b.facing(facing), drawn, side });
    }
}

// The cloth of a T-shaped window (constructionPalaceMayaRange) at [x, z] of a wall cell, feet at f, looking out.
function constructionPalaceMayaWindowCurtain(b, x, z, f, facing, colour, drawn) {
    const alongX = facing === 'n' || facing === 's';
    const cells = [[0, 1], [0, 2], [-1, 2], [1, 2]];
    for (const [i, k] of cells) {
        const side = drawn === 'open' ? constructionPalaceMayaCurtainSide(facing, i === 0 ? 1 : i) : 'right';
        b.shaped(alongX ? x + i : x, f + k, alongX ? z : z + i, `${colour}_curtain`, 'curtain', { facing: b.facing(facing), drawn, side });
    }
}

// A small washroom of the residence, 3 x 5 (Palenque's palace had latrines over a channel of running water): the
// seat against one end, a basin of water sunk in the floor and a water jar at the other.
function constructionPalaceMayaWashroom(b, x0, z0, x1, z1, seatAtLowZ) {
    const P = PALACE_MAYA_TOP;
    const F = P + 1;
    const { piece } = constructionFurnisher(b);
    const [seatZ, farZ] = seatAtLowZ ? [z0, z1] : [z1, z0];
    piece(x1, F, seatZ, 'toilet', 'toilet', seatAtLowZ ? 's' : 'n');
    b.set(x1, P - 1, farZ, 'limestone');
    b.set(x1, P, farZ, 'water');
    b.set(x0, F, farZ, 'vase');
}

// ---------------------------------------------------------------------------------------
// The land: jungle grounds, the plaza, the roads, the cenote

function constructionPalaceMayaLand(b) {
    const G = PALACE_MAYA_GROUND;
    const R = PALACE_MAYA_RIM;
    const [w, , d] = PALACE_MAYA_SIZE;
    const A = PALACE_MAYA_AXIS;
    // Where nothing may grow: the plaza, the platform and its stairs, the pyramid, the ball court, the cenote, the roads.
    const kept = [[60, 12, 114, 27], [46, 21, 125, 122], [10, 25, 49, 72], [11, 73, 50, 115], [11, 11, 26, 26], [22, 16, 66, 27], [44, 22, 51, 80]];
    // A shrub may spread one column sideways: none on the last column before the rim, which is the site's.
    const free = (x, z) => x > R && x < w - 1 - R && !kept.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
    constructionPalaceGrounds(b, 'jungle', { x0: R, z0: R, x1: w - 1 - R, z1: d - 1 - R, y: G, free });
    const pave = (x0, z0, x1, z1, pattern) => {
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) b.set(x, G, z, pattern(x, z));
        }
    };
    const paving = (x, z) => constructionPalacePick(PALACE_MAYA_PAVING, x, G, z, 3);
    // The plaza: a white border and a white line on the axis, towards the stair.
    pave(66, 12, 108, 23, (x, z) => (x === 66 || x === 108 || z === 23 || Math.abs(x - A) === 3 ? 'white_stucco' : paving(x, z)));
    // The sacbe, a white road edged with limestone, to the foot of the pyramid; the small plaza there.
    pave(24, 19, 65, 23, (x, z) => (z === 19 || z === 23 ? 'limestone' : 'white_stucco'));
    pave(24, 19, 36, 26, paving);
    // The road between the pyramid and the platform, and the forecourt of the ball court and of the west stair.
    pave(46, 24, 48, 79, paving);
    pave(21, 74, 48, 79, paving);

    // The cenote: a round well of water in the limestone, two below the ground, with a rim and a gap to walk up to.
    const [cx, cz] = [18, 18];
    for (let z = cz - 6; z <= cz + 6; z++) {
        for (let x = cx - 6; x <= cx + 6; x++) {
            const r = Math.hypot(x - cx, z - cz);
            if (r <= 3.6) {
                b.set(x, G, z, 'air');
                b.set(x, G - 1, z, 'water');
                b.set(x, G - 2, z, 'water');
                b.set(x, G - 3, z, 'limestone');
            } else if (r <= 4.6) {
                b.set(x, G, z, 'limestone');
                b.set(x, G - 1, z, 'limestone');
                b.set(x, G - 2, z, 'limestone');
                if (r > 4.0 && !(x > cx && Math.abs(z - cz) <= 1)) b.set(x, G + 1, z, constructionPalacePick([['limestone', 6], ['moss', 3], ['cobblestone', 1]], x, G + 1, z, 5));
            } else if (r <= 6) {
                b.set(x, G, z, constructionPalacePick([['moss', 1], ['grass', 1]], x, G, z, 7));
            }
        }
    }
    constructionPalaceSign(b, cx + 5, G + 1, cz + 3, 'e', 'Cenote: un pozo natural. El techo de una cueva de caliza se hundió y dejó ver el agua de debajo.',
        'Cenote: a natural well. The roof of a limestone cave fell in and showed the water underneath.');
    for (const [x, z] of [[cx + 5, cz - 3], [cx - 3, cz + 5]]) b.lampPost(x, G + 1, z, 'jungle_fence', 2);

    // Two stelae on the plaza, either side of the axis, their altars towards the player; torches beside them.
    constructionPalaceMayaStela(b, A - 10, G, 17, true, 'n', 11);
    constructionPalaceMayaStela(b, A + 9, G, 17, true, 'n', 13);
    for (const x of [A - 13, A + 13]) b.lampPost(x, G + 1, 17, 'jungle_fence', 2);
    constructionPalaceSign(b, A - 4, G + 1, 13, 'n', 'Palacio maya', 'Maya palace');
    constructionPalaceSign(b, 34, G + 1, 24, 'n', 'Templo del Jaguar', 'Jaguar Temple');
}

// ---------------------------------------------------------------------------------------
// The great platform and its stairs

function constructionPalaceMayaPlatform(b) {
    const G = PALACE_MAYA_GROUND;
    const P = PALACE_MAYA_TOP;
    const A = PALACE_MAYA_AXIS;
    // Two tiers, each a shell (what is inside them is never seen): red faces, a white band where each one ends.
    const ring = (x0, z0, x1, z1, y, type) => {
        for (let x = x0; x <= x1; x++) {
            b.set(x, y, z0, type(x, y, z0));
            b.set(x, y, z1, type(x, y, z1));
        }
        for (let z = z0 + 1; z < z1; z++) {
            b.set(x0, y, z, type(x0, y, z));
            b.set(x1, y, z, type(x1, y, z));
        }
    };
    const red = (x, y, z) => constructionPalacePick(PALACE_MAYA_WALL, x, y, z, 21);
    ring(53, 28, 121, 118, G + 1, red);
    ring(53, 28, 121, 118, G + 2, () => 'white_stucco');
    ring(54, 29, 120, 117, G + 3, red);
    ring(54, 29, 120, 117, P, () => 'white_stucco');
    // The floor: limestone with white lines every 5, on the axis.
    for (let z = 30; z <= 116; z++) {
        for (let x = 55; x <= 119; x++) {
            b.set(x, P, z, (x - A) % 5 === 0 || z % 5 === 0 ? 'white_stucco' : constructionPalacePick(PALACE_MAYA_PAVING, x, P, z, 23));
        }
    }

    // The great stair: 21 wide on the axis, between two sloping balustrades (alfardas) ending in serpent heads.
    constructionPalaceMayaStair(b, A - 10, G + 1, 24, 's', 4, 21, G + 1);
    b.box(A - 10, G + 1, 28, A + 10, P - 1, 28, 'limestone');
    for (let x = A - 10; x <= A + 10; x++) b.set(x, P, 28, 'white_stucco');
    for (const x of [A - 11, A + 11]) {
        for (let z = 24; z <= 28; z++) {
            const top = z < 28 ? G + 2 + (z - 24) : P + 1;
            b.box(x, G + 1, z, x, top - 1, z, 'limestone');
            b.set(x, top, z, 'white_stucco');
        }
        b.set(x, G + 1, 23, 'red_stucco');
        b.set(x, G + 1, 22, 'red_stucco');
        b.set(x, G + 2, 23, 'green_glazed_tile');
        b.set(x, G + 2, 22, 'white_stucco');
    }
    // The west stair, towards the pyramid and the ball court.
    constructionPalaceMayaStair(b, 49, G + 1, 74, 'e', 4, 7, G + 1);
    b.box(53, G + 1, 74, 53, P, 80, 'limestone');
    for (const z of [73, 81]) {
        for (let x = 49; x <= 53; x++) {
            const top = x < 53 ? G + 2 + (x - 49) : P + 1;
            b.box(x, G + 1, z, x, top - 1, z, 'limestone');
            b.set(x, top, z, 'white_stucco');
        }
    }
    // Braziers at the corners of the platform and either side of the great stair.
    for (const [x, z] of [[56, 31], [118, 31], [56, 115], [118, 115]]) constructionPalaceMayaBrazier(b, x, P + 1, z);
}

// ---------------------------------------------------------------------------------------
// The South Gallery: the portico to the plaza and the Audience Gallery behind it

function constructionPalaceMayaGallery(b) {
    const P = PALACE_MAYA_TOP;
    const F = P + 1;
    const A = PALACE_MAYA_AXIS;
    const { piece } = constructionFurnisher(b);
    // Openings 3 wide between piers 2 wide, centred on the axis.
    const opening = (x) => (((x - (A - 1)) % 5) + 5) % 5 < 3;
    const doors = [];
    for (let x = A - 26; x <= A + 26; x++) {
        if (opening(x)) doors.push({ x0: x, z0: 30, x1: x, z1: 30 });
    }
    for (let x = A - 17; x <= A + 17; x++) {
        if (opening(x)) doors.push({ x0: x, z0: 42, x1: x, z1: 42 });
    }
    doors.push({ x0: A - 1, z0: 36, x1: A + 1, z1: 36 }, { x0: 59, z0: 36, x1: 59, z1: 36 }, { x0: 115, z0: 36, x1: 115, z1: 36 },
        { x0: 68, z0: 36, x1: 68, z1: 36 }, { x0: 106, z0: 36, x1: 106, z1: 36 }, { x0: 58, z0: 42, x1: 58, z1: 42 }, { x0: 116, z0: 42, x1: 116, z1: 42 });
    const mats = (x, z) => ((x + z) % 2 ? 'white_stucco' : 'limestone');
    constructionPalaceMayaRange(b, {
        x0: 55, z0: 30, x1: 119, z1: 42, y: P, salt: 31,
        rooms: [
            { x0: 56, z0: 31, x1: 118, z1: 35, floor: mats },
            { x0: 64, z0: 37, x1: 110, z1: 41, floor: (x, z) => (z === 39 ? 'red_stucco' : 'white_stucco') },
            { x0: 56, z0: 37, x1: 62, z1: 41 },
            { x0: 112, z0: 37, x1: 118, z1: 41 }
        ],
        doors,
        windows: [[55, 33], [119, 33], [55, 39], [119, 39]],
        comb: { x0: 60, z0: 36, x1: 114, z1: 36, h: 7 }
    });
    // A mask of the sun god over the passage, on the frieze: jade eyes, a red mouth.
    for (const x of [A - 1, A + 1]) b.set(x, F + 5, 30, 'green_glazed_tile');
    b.box(A - 1, F + 4, 30, A + 1, F + 4, 30, 'red_stucco');
    b.set(A, F + 5, 30, 'yellow_glazed_tile');
    constructionPalaceMayaLamps(b, 56, 31, 118, 35, F);
    constructionPalaceMayaLamps(b, 64, 37, 110, 41, F);
    constructionPalaceMayaLamps(b, 56, 37, 62, 41, F);
    constructionPalaceMayaLamps(b, 112, 37, 118, 41, F);

    // The portico: stone benches along the spine for those who wait, banners over them.
    const colours = ['red', 'yellow', 'blue'];
    for (const [x0, x1] of [[60, 66], [70, 84], [90, 104], [108, 114]]) {
        for (let x = x0; x <= x1; x++) piece(x, F, 35, 'bench', 'bench', 'n');
        for (let x = x0 + 1; x < x1; x += 3) piece(x, F + 1, 35, `${colours[(x >> 1) % 3]}_banner`, 'banner', 'n');
    }
    // The Audience Gallery: two raised stone benches where the lords receive, on mats, under banners; vases.
    for (const cx of [A - 11, A + 11]) {
        b.box(cx - 2, F, 37, cx + 2, F, 37, 'white_stucco');
        for (let x = cx - 2; x <= cx + 2; x++) piece(x, F + 1, 37, 'bench', 'bench', 's');
        for (let x = cx - 2; x <= cx + 2; x++) b.set(x, F, 38, 'red_carpet');
        piece(cx - 3, F + 1, 37, 'yellow_banner', 'banner', 's');
        piece(cx + 3, F + 1, 37, 'blue_banner', 'banner', 's');
        b.set(cx - 4, F, 37, 'vase');
        b.set(cx + 4, F, 37, 'flower_pot');
    }
    constructionPalaceChest(b, A + 5, F, 37, 's', [['white_wool', 32], ['salt', 32], ['feather', 16], ['honeycomb', 8], ['red_wool', 12]]);
    // The guard room, west.
    for (let z = 38; z <= 40; z++) piece(56, F, z, 'bench', 'bench', 'e');
    constructionPalaceChest(b, 62, F, 41, 'w', [['obsidian', 16], ['torch', 16], ['bread', 8], ['candle', 8]]);
    piece(62, F + 1, 38, 'red_banner', 'banner', 'w');
    constructionPalaceBed(b, 61, F, 37, 'n');
    // Off duty: a board game left half played and a jug of water on the table, a stool pushed back.
    b.box(59, F, 41, 60, F, 41, 'table');
    b.set(59, F + 1, 41, 'jug');
    piece(60, F + 1, 41, 'chessboard', 'chessboard', 'n');
    b.set(60, F, 40, 'stool');
    constructionPalaceMayaDoorCurtain(b, 59, 36, 59, 36, F, 3, 'n', 'red', 'open');
    // The tribute store, east: what the towns sent to the king.
    constructionPalaceChest(b, 118, F, 38, 'w', [['white_wool', 48], ['yellow_wool', 16], ['blue_wool', 16], ['feather', 24], ['salt', 24]]);
    constructionPalaceChest(b, 118, F, 40, 'w', [['honey_bottle', 16], ['honeycomb', 16], ['wheat', 64], ['obsidian', 12]]);
    constructionPalaceChest(b, 112, F, 41, 'e', [['jungle_sapling', 8], ['amber', 4], ['rust_pigment', 12], ['gold_ore', 4]], 'barrel');
    // The steward's desk: the list of what came in, half written.
    piece(114, F, 41, 'desk', 'desk', 'n');
    piece(114, F + 1, 41, 'inkwell', 'inkwell', 'n');
    b.set(113, F, 40, 'stool');
    constructionPalaceMayaDoorCurtain(b, 115, 36, 115, 36, F, 3, 'n', 'yellow', 'closed');
}

// ---------------------------------------------------------------------------------------
// The West and East Ranges, either side of the Main Court

function constructionPalaceMayaRanges(b) {
    const P = PALACE_MAYA_TOP;
    const F = P + 1;
    const { piece, tall, oven } = constructionFurnisher(b);
    const tiles = (x, z) => ((x + z) % 2 ? 'limestone' : 'white_stucco');

    // West: scribes, workshop, servants; their doors to the court.
    constructionPalaceMayaRange(b, {
        x0: 61, z0: 43, x1: 67, z1: 72, y: P, salt: 41,
        rooms: [{ x0: 62, z0: 44, x1: 66, z1: 53, floor: tiles }, { x0: 62, z0: 55, x1: 66, z1: 62 }, { x0: 62, z0: 64, x1: 66, z1: 71 }],
        doors: [{ x0: 67, z0: 47, x1: 67, z1: 49 }, { x0: 67, z0: 58, x1: 67, z1: 60 }, { x0: 67, z0: 66, x1: 67, z1: 68 }, { x0: 61, z0: 58, x1: 61, z1: 58 }],
        windows: [[61, 48], [61, 60], [61, 67]]
    });
    for (const [z0, z1] of [[44, 53], [55, 62], [64, 71]]) constructionPalaceMayaLamps(b, 62, z0, 66, z1, F);
    // The scribes' room: codices on the shelves, desks with their stools, a mat.
    for (let z = 45; z <= 52; z++) {
        if (z === 48 || z === 49) continue;
        b.set(62, F, z, 'bookshelf');
        b.set(62, F + 1, z, 'bookshelf');
    }
    // One scribe has left a page half painted and his stool pushed back; the other works by candlelight. A codex
    // lies open on the table, more piled beside it.
    piece(65, F, 45, 'desk', 'desk', 'w');
    piece(65, F + 1, 45, 'inkwell', 'inkwell', 'w');
    b.set(63, F, 46, 'stool');
    piece(65, F, 51, 'desk', 'desk', 'w');
    b.set(64, F, 51, 'stool');
    b.set(65, F + 1, 51, 'candle');
    b.box(65, F, 52, 66, F, 52, 'table');
    piece(65, F + 1, 52, 'open_book', 'open_book', 'w');
    piece(66, F + 1, 52, 'book_stack', 'book_stack', 'w');
    for (let z = 47; z <= 50; z++) b.set(64, F, z, 'yellow_carpet');
    constructionPalaceChest(b, 66, F, 53, 'w', [['star_chart', 2], ['rust_pigment', 12], ['white_stucco', 8], ['feather', 12], ['candle', 8]]);
    constructionPalaceSign(b, 63, F, 44, 's', 'Escribas: pintaban los códices en papel de corteza de higuera cubierto de cal.',
        'Scribes painted the codices on fig-bark paper coated with lime.');
    // The workshop: carvers of obsidian and stone, weavers at their looms.
    b.set(62, F, 56, 'workbench');
    b.set(62, F, 61, 'workbench');
    b.box(65, F, 56, 66, F, 56, 'table');
    b.set(64, F, 56, 'stool');
    b.set(66, F + 1, 56, 'vase');
    piece(65, F + 1, 56, 'sewing_basket', 'sewing_basket', 'w');
    constructionPalaceChest(b, 66, F, 62, 'n', [['obsidian', 24], ['basalt', 16], ['white_wool', 32], ['yellow_wool', 16], ['feather', 16], ['rust_pigment', 8]]);
    constructionPalaceChest(b, 62, F, 62, 'e', [['planks', 32], ['jungle_sapling', 4], ['granite', 12]], 'barrel');
    piece(66, F + 1, 61, 'orange_banner', 'banner', 'w');
    // The servants' room: four beds, a bench, a chest.
    for (const z of [64, 66, 69, 71]) constructionPalaceBed(b, 62, F, z, 'w');
    for (let z = 64; z <= 65; z++) piece(66, F, z, 'bench', 'bench', 'w');
    constructionPalaceChest(b, 66, F, 71, 'w', [['white_wool', 12], ['bread', 8], ['candle', 6]]);
    // Their table: a meal half eaten, a jug.
    b.box(66, F, 69, 66, F, 70, 'table');
    b.set(66, F + 1, 69, 'jug');
    b.set(66, F + 1, 70, 'meal_plate');
    b.set(65, F, 70, 'stool');
    // Cloth in the doorways to the court: the scribes' and the workshop's drawn back, the servants' let down.
    constructionPalaceMayaDoorCurtain(b, 67, 47, 67, 49, F, 3, 'e', 'yellow', 'open');
    constructionPalaceMayaDoorCurtain(b, 67, 58, 67, 60, F, 3, 'e', 'orange', 'open');
    constructionPalaceMayaDoorCurtain(b, 67, 66, 67, 68, F, 3, 'e', 'white', 'closed');

    // East: kitchen, the cacao and honey store, the treasury (the only room with a door).
    constructionPalaceMayaRange(b, {
        x0: 107, z0: 43, x1: 113, z1: 72, y: P, salt: 43,
        rooms: [{ x0: 108, z0: 44, x1: 112, z1: 53, floor: 'limestone' }, { x0: 108, z0: 55, x1: 112, z1: 62 }, { x0: 108, z0: 64, x1: 112, z1: 71, floor: tiles }],
        doors: [{ x0: 107, z0: 47, x1: 107, z1: 49 }, { x0: 107, z0: 58, x1: 107, z1: 60 }, { x0: 107, z0: 67, x1: 107, z1: 67, h: 2 }, { x0: 113, z0: 51, x1: 113, z1: 51 }],
        windows: [[113, 46], [113, 48], [113, 58]]
    });
    for (const [z0, z1] of [[44, 53], [55, 62], [64, 71]]) constructionPalaceMayaLamps(b, 108, z0, 112, z1, F);
    // The kitchen: ovens, a hearth of three stones round glowing embers, the grinding stone, barrels of maize.
    for (const z of [44, 45, 46]) oven(112, F, z, 'w');
    b.set(110, P, 50, 'magma_rock');
    for (const [x, z] of [[109, 50], [111, 50], [110, 51]]) b.set(x, F, z, 'cobblestone_slab');
    b.set(112, F, 49, 'workbench');
    b.box(111, F, 53, 112, F, 53, 'table');
    b.set(111, F + 1, 53, 'vase');
    b.set(112, F + 1, 53, 'meal_plate');
    b.set(112, F + 1, 49, 'fruit_bowl');
    constructionPalaceChest(b, 108, F, 44, 'e', [['wheat', 64], ['wheat', 64], ['wheat_seeds', 32], ['salt', 16]], 'barrel');
    constructionPalaceChest(b, 108, F, 53, 'e', [['bread', 32], ['cooked_fish', 16], ['raw_fish', 16], ['roast_mushroom', 12], ['honey_bottle', 8]], 'barrel');
    constructionPalaceChest(b, 108, F, 45, 'e', [['bread', 24], ['honey_bottle', 6], ['quicklime', 8], ['water_bucket', 2], ['bucket', 2]]);
    constructionPalaceSign(b, 109, F, 53, 'n', 'Nixtamal: el maíz se cocía con cal. Así alimenta más y se muele mejor.',
        'Nixtamal: maize was cooked with lime. That makes it more nourishing and easier to grind.');
    // The store: maize, honey of the stingless bees, cacao (its beans were money), salt.
    for (const z of [55, 56, 61, 62]) {
        const goods = z < 60 ? [['honey_bottle', 32], ['honeycomb', 24], ['wheat', 64]] : [['wheat', 64], ['salt', 48], ['wheat_seeds', 24]];
        constructionPalaceChest(b, 112, F, z, 'w', goods, 'barrel');
    }
    constructionPalaceChest(b, 108, F, 62, 'e', [['honey_bottle', 24], ['bread', 16], ['cheese', 4], ['milk', 4]], 'barrel');
    constructionPalaceMayaDoorCurtain(b, 107, 58, 107, 60, F, 3, 'w', 'brown', 'open');
    constructionPalaceSign(b, 108, F, 56, 'e', 'Cacao y miel: el cacao se bebía con espuma y sus granos servían de dinero. La miel era de abejas sin aguijón.',
        'Cacao and honey: cacao was drunk frothy and its beans were money. The honey came from stingless bees.');
    // The treasury: jade, feathers of the quetzal, pyrite for mirrors, a little gold; the door shut.
    b.door(107, F, 67, 'jungle_door', 'e');
    constructionPalaceChest(b, 112, F, 65, 'w', [['obsidian', 16], ['amber', 8], ['feather', 32], ['gold_leaf', 4], ['pyrite', 12], ['mirror', 1]]);
    constructionPalaceChest(b, 112, F, 70, 'w', [['white_wool', 32], ['red_wool', 16], ['blue_wool', 16], ['yellow_wool', 16], ['salt', 16], ['gold_ore', 3]]);
    for (const z of [67, 68]) {
        b.set(112, F, z, 'limestone');
        b.set(112, F + 1, z, z === 67 ? 'green_glazed_tile' : 'gold_block');
    }
    piece(108, F + 1, 65, 'green_banner', 'banner', 'e');
    piece(108, F + 1, 70, 'green_banner', 'banner', 'e');
    tall(110, F, 71, 'wardrobe', 'n');
}

// ---------------------------------------------------------------------------------------
// The Throne House: the throne room on the axis and the banquet hall behind it

function constructionPalaceMayaThroneHouse(b) {
    const P = PALACE_MAYA_TOP;
    const F = P + 1;
    const A = PALACE_MAYA_AXIS;
    const { piece, lantern } = constructionFurnisher(b);
    const opening = (x) => (((x - (A - 1)) % 5) + 5) % 5 < 3;
    const doors = [];
    for (let x = A - 16; x <= A + 16; x++) {
        if (opening(x)) doors.push({ x0: x, z0: 74, x1: x, z1: 74 });
    }
    // No door behind the throne: the banquet hall is reached round it, and left on the axis.
    doors.push({ x0: A - 12, z0: 80, x1: A - 10, z1: 80 }, { x0: A + 10, z0: 80, x1: A + 12, z1: 80 }, { x0: A - 1, z0: 86, x1: A + 1, z1: 86 });
    constructionPalaceMayaRange(b, {
        x0: 68, z0: 74, x1: 106, z1: 86, y: P, salt: 51,
        rooms: [
            { x0: 69, z0: 75, x1: 105, z1: 79, floor: (x, z) => (Math.abs(x - A) <= 1 ? 'red_stucco' : (x + z) % 2 ? 'white_stucco' : 'limestone') },
            { x0: 69, z0: 81, x1: 105, z1: 85, floor: (x) => (x % 4 === 0 ? 'red_stucco' : 'white_stucco') }
        ],
        doors,
        windows: [[72, 86], [78, 86], [96, 86], [102, 86], [68, 83], [106, 83]],
        comb: { x0: 72, z0: 80, x1: 102, z1: 80, h: 9 }
    });
    // A great mask on the frieze over the middle: the throne's own face to the court.
    for (const x of [A - 2, A + 2]) b.set(x, F + 5, 74, 'green_glazed_tile');
    b.box(A - 1, F + 4, 74, A + 1, F + 4, 74, 'red_stucco');
    b.set(A, F + 5, 74, 'yellow_glazed_tile');

    // The dais: one high, white stucco with jade at its corners, a stair on its front; the jade throne on it,
    // looking out over the court; banners of red, yellow and blue cloth behind; nobles' benches either side.
    b.box(A - 5, F, 77, A + 5, F, 79, 'white_stucco');
    for (const x of [A - 5, A + 5]) b.set(x, F, 77, 'green_glazed_tile');
    for (let x = A - 3; x <= A + 3; x++) b.stairs(x, F, 76, 'white_glazed_tile_stairs', 's');
    b.shaped(A, F + 1, 79, 'jade_throne', 'throne', { half: 'lower', facing: b.facing('n') });
    b.shaped(A, F + 2, 79, 'jade_throne', 'throne', { half: 'upper', facing: b.facing('n') });
    for (const [dx, colour] of [[-5, 'red'], [-3, 'yellow'], [-1, 'blue'], [1, 'blue'], [3, 'yellow'], [5, 'red']]) piece(A + dx, F + 2, 79, `${colour}_banner`, 'banner', 'n');
    for (const x of [A - 2, A + 2]) b.set(x, F + 1, 79, 'vase');
    for (let x = 69; x <= 73; x++) piece(x, F, 79, 'bench', 'bench', 'n');
    for (let x = 101; x <= 105; x++) piece(x, F, 79, 'bench', 'bench', 'n');
    for (let z = 75; z <= 76; z++) {
        for (let x = A - 1; x <= A + 1; x++) b.set(x, F, z, 'red_carpet');
    }
    for (const x of [71, 103]) piece(x, F + 1, 79, 'green_banner', 'banner', 'n');
    for (const x of [69, 105]) {
        b.set(x, F, 75, 'flower_pot');
        b.set(x, F, 77, 'vase');
    }
    constructionPalaceMayaLamps(b, 69, 75, 105, 79, F, (x, z) => z === 79 && Math.abs(x - A) <= 6);
    lantern(A, F + 4, 77, 'hanging');
    b.set(A - 3, F + 4, 77, 'chandelier');
    b.set(A + 3, F + 4, 77, 'chandelier');
    constructionPalaceSign(b, A + 7, F, 76, 'n', 'Sala del trono', 'Throne room');

    // The banquet hall: two long tables with benches, barrels of balche (a mead of honey), chandeliers.
    for (const [x0, x1] of [[71, 84], [90, 103]]) {
        b.table(x0, x1, F, 83, 83, 'jungle_fence');
        for (let x = x0 + 1; x < x1; x++) {
            piece(x, F, 82, 'bench', 'bench', 's');
            piece(x, F, 84, 'bench', 'bench', 'n');
            if (x % 3 === 0) b.set(x, F + 1, 83, x % 2 ? 'candle' : 'vase');
            else {
                // What is left of the feast: plates, fruit, jugs, here and there.
                const roll = constructionPalaceHash(x, F + 1, 83, 57);
                if (roll < 0.3) b.set(x, F + 1, 83, 'meal_plate');
                else if (roll < 0.45) b.set(x, F + 1, 83, 'fruit_bowl');
                else if (roll < 0.6) b.set(x, F + 1, 83, 'jug');
            }
        }
        b.set(Math.floor((x0 + x1) / 2), F + 4, 83, 'chandelier');
    }
    constructionPalaceChest(b, 69, F, 85, 'e', [['honey_bottle', 12], ['bread', 16], ['cooked_fish', 12]], 'barrel');
    constructionPalaceChest(b, 105, F, 85, 'w', [['honey_bottle', 12], ['wheat', 32], ['salt', 8]], 'barrel');
    for (const x of [74, 80, 94, 100]) piece(x, F + 1, 85, `${x < A ? 'red' : 'blue'}_banner`, 'banner', 'n');
    constructionPalaceMayaLamps(b, 69, 81, 105, 85, F);
}

// ---------------------------------------------------------------------------------------
// The courts: the Main Court and the Tower Court

function constructionPalaceMayaCourts(b) {
    const P = PALACE_MAYA_TOP;
    const F = P + 1;
    const A = PALACE_MAYA_AXIS;
    // The Main Court: a round altar on the axis with five jade stones round it (the four corners of the world and
    // its middle), two stelae, braziers, a ceiba in a planter.
    for (let z = 55; z <= 59; z++) {
        for (let x = A - 2; x <= A + 2; x++) {
            if (Math.abs(x - A) + Math.abs(z - 57) <= 3) b.set(x, P, z, 'red_stucco');
        }
    }
    for (const [x, z] of [[A, 57], [A - 4, 53], [A + 4, 53], [A - 4, 61], [A + 4, 61]]) b.set(x, P, z, 'green_glazed_tile');
    b.box(A - 1, F, 56, A + 1, F, 58, 'limestone');
    b.set(A, F + 1, 57, 'candle');
    constructionPalaceMayaStela(b, A - 11, P, 52, true, 's', 61);
    constructionPalaceMayaStela(b, A + 10, P, 52, true, 's', 63);
    for (const [x, z] of [[71, 46], [103, 46], [71, 70], [103, 70]]) constructionPalaceMayaBrazier(b, x, F, z);
    // Flowers along the ranges.
    for (let z = 45; z <= 71; z++) {
        if (z % 4 !== 1 || (z >= 46 && z <= 50) || (z >= 57 && z <= 61) || (z >= 65 && z <= 69)) continue;
        b.set(68, F, z, 'flower_pot');
        b.set(106, F, z, 'flower_pot');
    }

    // The Tower Court: a ceiba (the sacred tree of the middle of the world) in a planter, a sundial, braziers, a stela.
    b.box(81, P, 92, 85, P, 96, 'grass');
    constructionPalaceTree(constructionPalacePut(b), 'jungle', 83, F, 94, 71);
    b.set(78, F, 102, 'sundial');
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.set(78 + dx, P, 102 + dz, 'white_stucco');
    constructionPalaceSign(b, 78, F, 104, 's', 'Reloj de sol: la sombra marca la hora; a mediodía es la más corta. Clic derecho para leerlo.',
        'Sundial: the shadow tells the time; at noon it is shortest. Right click to read it.');
    constructionPalaceMayaStela(b, 56, P, 96, false, 'e', 73);
    for (const [x, z] of [[75, 90], [87, 90], [75, 107], [87, 107]]) constructionPalaceMayaBrazier(b, x, F, z);
}

// ---------------------------------------------------------------------------------------
// The tower: four storeys and a roof, an observatory

// Storeys 5 high (k = 0 is the platform's own floor); walls 2 thick. Flights climb along the south wall (even
// storeys, towards +x) and the north wall (odd storeys, towards -x), each filled underneath, with a railing round
// the hole it leaves in the floor above. Windows on the east and west faces sit on one line (z = 98) and nothing
// stands in it, so the sun of an equinox shines straight through the top storey.
function constructionPalaceMayaTower(b) {
    const P = PALACE_MAYA_TOP;
    const { piece, lantern } = constructionFurnisher(b);
    const [x0, z0, x1, z1] = [60, 92, 72, 104];
    const top = P + 20;
    for (let y = P + 1; y <= top; y++) {
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                const ring = Math.min(x - x0, x1 - x, z - z0, z1 - z);
                if (ring >= 2) continue;
                const v = (y - P) % 5;
                b.set(x, y, z, ring === 1 ? 'white_stucco' : v === 0 ? 'white_stucco' : constructionPalacePick(PALACE_MAYA_WALL, x, y, z, 81));
            }
        }
    }
    // The floors of the storeys and the roof; the cornices that mark each one outside.
    for (let k = 1; k <= 4; k++) {
        const y = P + 5 * k;
        for (let z = z0 + 2; z <= z1 - 2; z++) {
            for (let x = x0 + 2; x <= x1 - 2; x++) b.set(x, y, z, (x + z) % 2 ? 'limestone' : 'white_stucco');
        }
        for (let x = x0 - 1; x <= x1 + 1; x++) {
            constructionPalaceMayaPut(b, x, y, z0 - 1, 'white_stucco');
            constructionPalaceMayaPut(b, x, y, z1 + 1, 'white_stucco');
        }
        for (let z = z0; z <= z1; z++) {
            constructionPalaceMayaPut(b, x0 - 1, y, z, 'white_stucco');
            constructionPalaceMayaPut(b, x1 + 1, y, z, 'white_stucco');
        }
    }
    // The parapet of the roof, white, with red posts at the corners.
    for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
            if (Math.min(x - x0, x1 - x, z - z0, z1 - z) === 0) b.set(x, top + 1, z, 'white_stucco');
        }
    }
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) b.set(x, top + 2, z, 'red_stucco');
    // The door, east, to the court; T-shaped windows (ik', the wind) on the east and west faces of every storey.
    b.box(x1 - 1, P + 1, 97, x1, P + 3, 99, null);
    for (let k = 0; k < 4; k++) {
        const base = P + 5 * k;
        for (const [wx0, wx1] of k === 0 ? [[x0, x0 + 1]] : [[x0, x0 + 1], [x1 - 1, x1]]) {
            b.box(wx0, base + 2, 98, wx1, base + 3, 98, null);
            b.box(wx0, base + 3, 97, wx1, base + 3, 99, null);
        }
    }
    // The flights.
    for (let k = 0; k < 4; k++) {
        const base = P + 5 * k;
        const even = k % 2 === 0;
        for (let i = 0; i < 5; i++) {
            const x = even ? 64 + i : 68 - i;
            const z = even ? 94 : 102;
            for (let y = base + 1; y < base + 1 + i; y++) b.set(x, y, z, 'limestone');
            b.stairs(x, base + 1 + i, z, 'sandstone_stairs', even ? 'e' : 'w');
        }
        const above = base + 5;
        const hole = even ? [[64, 94], [65, 94], [66, 94], [67, 94]] : [[65, 102], [66, 102], [67, 102], [68, 102]];
        for (const [x, z] of hole) b.set(x, above, z, null);
        const rail = even ? [[64, 95], [65, 95], [66, 95], [67, 95], [63, 94]] : [[65, 101], [66, 101], [67, 101], [68, 101], [69, 102]];
        for (const [x, z] of rail) b.set(x, above + 1, z, 'jungle_fence');
    }
    // Light on every storey: a chandelier in the middle, four lanterns round it, hung from the floor above.
    for (let k = 0; k < 4; k++) {
        const base = P + 5 * k;
        b.set(66, base + 4, 98, 'chandelier');
        for (const [x, z] of [[64, 96], [68, 96], [64, 100], [68, 100]]) lantern(x, base + 4, z, 'hanging');
    }
    const feet = (k) => P + 5 * k + 1;

    // Ground storey: the number twenty on the floor, a dot over a shell, between red lines.
    for (let z = 96; z <= 100; z++) {
        for (let x = 65; x <= 67; x++) b.set(x, P, z, 'limestone');
    }
    for (let x = 64; x <= 68; x++) {
        b.set(x, P, 95, 'red_stucco');
        b.set(x, P, 101, 'red_stucco');
    }
    b.box(64, P, 99, 68, P, 99, 'red_stucco');
    b.box(65, P, 97, 67, P, 97, 'yellow_glazed_tile');
    b.set(66, P, 96, 'yellow_glazed_tile');
    b.set(66, P, 100, 'black_wool');
    constructionPalaceSign(b, 68, feet(0), 102, 'n', 'Veinte: un punto arriba (una veintena) y una concha abajo (cero unidades). Como nuestro 10, pero de 20 en 20.',
        'Twenty: a dot on top (one twenty) and a shell below (no units). Like our 10, but counting in twenties.');
    constructionPalaceSign(b, x1 + 1, P + 2, 96, 'e', 'Observatorio', 'Observatory', 'wall');
    for (const z of [100, 101]) piece(70, feet(0), z, 'bench', 'bench', 'w');

    // First storey: Venus. Codices on the shelves, a desk, a chest of star charts.
    for (const z of [96, 97, 99, 100]) {
        b.set(62, feet(1), z, 'bookshelf');
        b.set(62, feet(1) + 1, z, 'bookshelf');
    }
    piece(66, feet(1), 100, 'desk', 'desk', 'n');
    b.set(65, feet(1), 99, 'stool');
    piece(66, feet(1) + 1, 100, 'open_book', 'open_book', 'n');
    constructionPalaceChest(b, 63, feet(1), 101, 'e', [['star_chart', 4], ['candle', 8], ['feather', 6], ['rust_pigment', 4]]);
    constructionPalaceSign(b, 68, feet(1), 97, 'e', 'Venus vuelve al mismo sitio del cielo cada 584 días. Los mayas lo anotaron en sus libros, como el Códice de Dresde.',
        'Venus comes back to the same place in the sky every 584 days. The Maya wrote it in their books, like the Dresden Codex.');

    // Second storey: the Sun. The astronomer's bed (they watched all night), a desk, a chest.
    constructionPalaceBed(b, 70, feet(2), 100, 'e');
    piece(70, feet(2), 99, 'bedside_table', 'bedside_table', 'w');
    b.set(70, feet(2) + 1, 99, 'candle');
    constructionPalaceChest(b, 70, feet(2), 96, 'w', [['star_chart', 3], ['white_wool', 8], ['candle', 6], ['honey_bottle', 2]]);
    piece(67, feet(2), 97, 'desk', 'desk', 'n');
    b.set(67, feet(2), 96, 'stool');
    piece(67, feet(2) + 1, 97, 'scroll', 'scroll', 'n');
    constructionPalaceSign(b, 64, feet(2), 97, 'w', 'El Sol no sale siempre por el mismo sitio: en verano sale más al norte y en invierno más al sur.',
        'The Sun does not always rise in the same place: further north in summer, further south in winter.');

    // Third storey: the observatory. A yellow line on the floor from window to window, a stool to watch from.
    for (let x = 62; x <= 70; x++) b.set(x, feet(3) - 1, 98, 'yellow_glazed_tile');
    b.set(63, feet(3), 97, 'stool');
    constructionPalaceChest(b, 63, feet(3), 100, 'e', [['star_chart', 6], ['candle', 6], ['sundial', 1]]);
    constructionPalaceSign(b, 64, feet(3), 96, 'w', 'En los equinoccios el Sol sale justo por el este y se pone justo por el oeste. Los mayas alineaban ventanas y puertas con él para saber la fecha.',
        'At the equinoxes the Sun rises due east and sets due west. The Maya lined up windows and doors with it to know the date.');

    // The roof: lanterns at the corners, a sign.
    for (const [x, z] of [[62, 94], [70, 94], [62, 100], [70, 100]]) lantern(x, top + 1, z, 'floor');
    constructionPalaceSign(b, 66, top + 1, 98, 'n', 'Aquí miraban el cielo de noche, sin telescopio: solo con los ojos y mucha paciencia.',
        'Here they watched the night sky with no telescope: only their eyes and a lot of patience.');
}

// ---------------------------------------------------------------------------------------
// The Calendar Hall: the 20 day signs on its walls, a counting board on its floor

function constructionPalaceMayaCalendar(b) {
    const P = PALACE_MAYA_TOP;
    const F = P + 1;
    constructionPalaceMayaRange(b, {
        x0: 55, z0: 110, x1: 85, z1: 117, y: P, salt: 91,
        rooms: [{ x0: 56, z0: 111, x1: 84, z1: 115, floor: 'white_stucco' }],
        doors: [{ x0: 64, z0: 110, x1: 64, z1: 110 }, { x0: 70, z0: 110, x1: 70, z1: 110 }, { x0: 76, z0: 110, x1: 76, z1: 110 }],
        comb: { x0: 58, z0: 116, x1: 82, z1: 116, h: 6 }
    });
    // The glyphs, 2 x 2 each with a gap between: the first ten along the back wall from west to east, the other ten
    // along the front wall from east to west, so the cycle goes round the room. The doors are in gaps.
    PALACE_MAYA_DAYS.forEach(([, , first, second, layout], i) => {
        const back = i < 10;
        const slot = back ? i : 19 - i;
        const gx = 56 + 3 * slot;
        const z = back ? 116 : 110;
        for (let dx = 0; dx < 2; dx++) {
            for (let dy = 0; dy < 2; dy++) {
                const firstHere = layout === 'top' ? dy === 1 : layout === 'side' ? dx === 0 : (dx + dy) % 2 === 0;
                b.set(gx + dx, F + 1 + dy, z, `${firstHere ? first : second}_wool`);
            }
        }
    });
    // The counting board: 0, 3, 5, 12 and 19 in Maya numbers, read from the doors (bars near, dots beyond them).
    for (let z = 111; z <= 115; z++) {
        for (let x = 57; x <= 82; x++) b.set(x, P, z, z === 111 || x === 57 || x === 82 ? 'red_stucco' : 'limestone');
    }
    [0, 3, 5, 12, 19].forEach((n, i) => {
        const gx = 58 + 5 * i;
        if (n === 0) {
            for (const [dx, dz] of [[1, 0], [2, 0], [0, 1], [3, 1], [1, 2], [2, 2]]) b.set(gx + dx, P, 112 + dz, 'yellow_glazed_tile');
            return;
        }
        const bars = Math.floor(n / 5);
        for (let r = 0; r < bars; r++) {
            for (let dx = 0; dx < 4; dx++) b.set(gx + dx, P, 112 + r, 'black_wool');
        }
        for (const dx of [1, 2, 0, 3].slice(0, n % 5)) b.set(gx + dx, P, 112 + bars, 'black_wool');
    });
    // Lanterns in front of the gaps only, so none hides a glyph.
    const { lantern } = constructionFurnisher(b);
    for (const x of [58, 64, 70, 76, 82]) {
        lantern(x, F + 2, 111, 'hanging');
        lantern(x, F + 2, 115, 'hanging');
    }
    b.set(70, F + 4, 113, 'chandelier');
    constructionPalaceSign(b, 56, F + 1, 113, 'e', 'Números mayas: un punto vale 1 y una barra vale 5. Contaban de 20 en 20, con dedos de manos y pies. En el suelo: 0, 3, 5, 12 y 19.',
        'Maya numbers: a dot is 1 and a bar is 5. They counted in twenties, fingers and toes. On the floor: 0, 3, 5, 12 and 19.', 'wall');
    constructionPalaceSign(b, 84, F + 1, 113, 'w', 'La concha es el cero. Los mayas inventaron el cero por su cuenta, hace más de 1.500 años.',
        'The shell is zero. The Maya invented zero on their own, more than 1,500 years ago.', 'wall');
    constructionPalaceSign(b, 64, F + 1, 115, 'n', "Los 20 signos de los días están en las paredes. Con los números del 1 al 13 forman un calendario de 260 días: el Tzolk'in.",
        "The 20 day signs are on the walls. With the numbers 1 to 13 they make a calendar of 260 days: the Tzolk'in.", 'wall');
    constructionPalaceSign(b, 76, F + 1, 115, 'n', "El año del Sol, el Haab', tenía 365 días: 18 meses de 20 días y 5 días más.",
        "The year of the Sun, the Haab', had 365 days: 18 months of 20 days and 5 more days.", 'wall');
    constructionPalaceChest(b, 84, F, 111, 'w', [['star_chart', 4], ['candle', 8], ['blueprint', 2], ['measuring_tape', 1]]);
    constructionPalaceSign(b, 67, F, 109, 'n', 'Sala del calendario', 'Calendar hall');
}

// ---------------------------------------------------------------------------------------
// The Royal Residence

// South, behind the doors to the walkway: the king's room (the big one), the queen's room and her washroom, the
// princes' room. North, through the spine: the king's dressing room and washroom, the sitting room, the princes'
// washroom and schoolroom. Bedrooms 7 x 5 but the king's 9 x 5, washrooms 3 x 5, every doorway hung with cloth.
const PALACE_MAYA_RESIDENCE_ROOMS = [
    // [x0, z0, x1, z1]: south row, then north row.
    [91, 90, 99, 94], [101, 90, 107, 94], [109, 90, 111, 94], [113, 90, 119, 94],
    [91, 96, 95, 100], [97, 96, 99, 100], [101, 96, 109, 100], [111, 96, 113, 100], [115, 96, 119, 100]
];

function constructionPalaceMayaResidence(b) {
    const P = PALACE_MAYA_TOP;
    const F = P + 1;
    const { piece, tall } = constructionFurnisher(b);
    const rooms = PALACE_MAYA_RESIDENCE_ROOMS.map(([x0, z0, x1, z1]) => ({ x0, z0, x1, z1, floor: (x, z) => ((x + z) % 3 ? 'white_stucco' : 'limestone') }));
    const washroomDoors = [{ x0: 96, z0: 98, x1: 96, z1: 98, h: 2 }, { x0: 108, z0: 92, x1: 108, z1: 92, h: 2 }, { x0: 114, z0: 98, x1: 114, z1: 98, h: 2 }];
    constructionPalaceMayaRange(b, {
        x0: 90, z0: 89, x1: 120, z1: 101, y: P, salt: 101,
        rooms,
        doors: [{ x0: 94, z0: 89, x1: 96, z1: 89 }, { x0: 104, z0: 89, x1: 106, z1: 89 }, { x0: 114, z0: 89, x1: 116, z1: 89 },
            { x0: 95, z0: 95, x1: 95, z1: 95 }, { x0: 105, z0: 95, x1: 105, z1: 95 }, { x0: 115, z0: 95, x1: 115, z1: 95 }, ...washroomDoors],
        windows: [[120, 92], [120, 98], [98, 101], [103, 101], [107, 101], [117, 101]],
        comb: { x0: 93, z0: 95, x1: 117, z1: 95, h: 6 }
    });
    for (const room of rooms) constructionPalaceMayaLamps(b, room.x0, room.z0, room.x1, room.z1, F);
    // The cloth in the doorways, some drawn back and some let down (the washrooms' always).
    constructionPalaceMayaDoorCurtain(b, 94, 89, 96, 89, F, 3, 'n', 'red', 'open');
    constructionPalaceMayaDoorCurtain(b, 104, 89, 106, 89, F, 3, 'n', 'blue', 'open');
    constructionPalaceMayaDoorCurtain(b, 114, 89, 116, 89, F, 3, 'n', 'yellow', 'open');
    constructionPalaceMayaDoorCurtain(b, 95, 95, 95, 95, F, 3, 'n', 'white', 'closed');
    constructionPalaceMayaDoorCurtain(b, 105, 95, 105, 95, F, 3, 'n', 'blue', 'open');
    constructionPalaceMayaDoorCurtain(b, 115, 95, 115, 95, F, 3, 'n', 'yellow', 'open');
    constructionPalaceMayaDoorCurtain(b, 96, 98, 96, 98, F, 2, 'w', 'white', 'closed');
    constructionPalaceMayaDoorCurtain(b, 108, 92, 108, 92, F, 2, 'w', 'white', 'closed');
    constructionPalaceMayaDoorCurtain(b, 114, 98, 114, 98, F, 2, 'e', 'white', 'closed');
    constructionPalaceMayaWindowCurtain(b, 120, 92, F, 'e', 'yellow', 'closed');
    constructionPalaceMayaWindowCurtain(b, 103, 101, F, 's', 'green', 'open');
    constructionPalaceMayaWindowCurtain(b, 107, 101, F, 's', 'green', 'open');

    // The king's room: the bed against the spine, a mat, his wardrobe and chest, and at the desk a letter half
    // written, the stool pushed back.
    for (const x of [92, 93]) constructionPalaceBed(b, x, F, 94, 's');
    piece(94, F, 94, 'bedside_table', 'bedside_table', 'n');
    b.set(94, F + 1, 94, 'candle');
    for (let x = 92; x <= 94; x++) b.set(x, F, 92, 'red_carpet');
    tall(98, F, 90, 'wardrobe', 's');
    constructionPalaceChest(b, 99, F, 91, 'w', [['red_wool', 16], ['white_wool', 16], ['feather', 12], ['amber', 4], ['mirror', 1]]);
    piece(99, F, 94, 'desk', 'desk', 'w');
    piece(99, F + 1, 94, 'inkwell', 'inkwell', 'w');
    b.set(98, F, 93, 'stool');
    piece(91, F + 1, 92, 'red_banner', 'banner', 'e');
    piece(99, F + 1, 92, 'red_banner', 'banner', 'w');
    constructionPalaceSign(b, 97, F, 92, 'w', 'Habitación del rey', "The king's room");
    // The queen's room: her bed, her wardrobe and chest, a stool with the sewing basket beside it.
    for (const x of [102, 103]) constructionPalaceBed(b, x, F, 94, 's');
    piece(104, F, 94, 'bedside_table', 'bedside_table', 'n');
    b.set(104, F + 1, 94, 'candle');
    for (let x = 102; x <= 104; x++) b.set(x, F, 92, 'blue_carpet');
    tall(107, F, 90, 'wardrobe', 'w');
    constructionPalaceChest(b, 101, F, 90, 'e', [['blue_wool', 16], ['yellow_wool', 12], ['amber', 4], ['mirror', 1], ['candle', 4]]);
    b.set(106, F, 93, 'stool');
    piece(107, F, 93, 'sewing_basket', 'sewing_basket', 'w');
    piece(101, F + 1, 92, 'blue_banner', 'banner', 'e');
    // Her washroom.
    constructionPalaceMayaWashroom(b, 109, 90, 111, 94, false);
    // The princes' room: two beds with a bedside table each, books piled on one, a wardrobe, a chest.
    for (const x of [117, 118]) constructionPalaceBed(b, x, F, 94, 's');
    piece(116, F, 94, 'bedside_table', 'bedside_table', 'n');
    piece(116, F + 1, 94, 'book_stack', 'book_stack', 'n');
    piece(119, F, 94, 'bedside_table', 'bedside_table', 'n');
    b.set(119, F + 1, 94, 'candle');
    for (let x = 114; x <= 116; x++) b.set(x, F, 92, 'yellow_carpet');
    tall(113, F, 93, 'wardrobe', 'e');
    constructionPalaceChest(b, 113, F, 90, 'e', [['white_wool', 16], ['green_wool', 8], ['bread', 6], ['candle', 4]]);
    piece(119, F + 1, 93, 'red_banner', 'banner', 'w');

    // North. The king's dressing room: wardrobes, a mirror, the chest of cloth, embroidery left on the bench.
    for (const x of [92, 94]) tall(x, F, 100, 'wardrobe', 'n');
    piece(91, F + 1, 98, 'wall_mirror', 'wall_mirror', 'e');
    constructionPalaceChest(b, 91, F, 96, 'e', [['white_wool', 32], ['red_wool', 16], ['yellow_wool', 16], ['blue_wool', 16], ['green_wool', 8], ['feather', 16]]);
    b.set(95, F, 100, 'workbench');
    piece(95, F + 1, 100, 'sewing_basket', 'sewing_basket', 'n');
    b.set(95, F, 99, 'stool');
    // His washroom, with the sign.
    constructionPalaceMayaWashroom(b, 97, 96, 99, 100, true);
    constructionPalaceSign(b, 97, F + 1, 100, 'n', 'Letrina: en el palacio de Palenque había retretes de piedra sobre un canal de agua corriente que se llevaba lo sucio.',
        'Latrine: the palace of Palenque had stone seats over a channel of running water that carried the dirt away.', 'wall');
    // The sitting room: benches round a table with a game left half played, a jug, a vase.
    for (let x = 102; x <= 108; x++) {
        if (x !== 105) piece(x, F, 100, 'bench', 'bench', 'n');
    }
    b.box(104, F, 98, 106, F, 98, 'table');
    b.set(104, F + 1, 98, 'vase');
    piece(105, F + 1, 98, 'chessboard', 'chessboard', 'n');
    b.set(106, F + 1, 98, 'jug');
    piece(101, F + 1, 98, 'yellow_banner', 'banner', 'e');
    piece(109, F + 1, 98, 'yellow_banner', 'banner', 'w');
    b.set(109, F, 96, 'flower_pot');
    // The princes' washroom, and their schoolroom: a codex open on the desk, a map on the table, codices on the shelf.
    constructionPalaceMayaWashroom(b, 111, 96, 113, 100, true);
    piece(118, F, 100, 'desk', 'desk', 'n');
    piece(118, F + 1, 100, 'open_book', 'open_book', 'n');
    b.set(118, F, 99, 'stool');
    b.set(116, F, 100, 'table');
    piece(116, F + 1, 100, 'scroll', 'scroll', 'n');
    b.set(117, F, 98, 'stool');
    for (const y of [F, F + 1]) b.set(119, y, 96, 'bookshelf');
    constructionPalaceChest(b, 119, F, 100, 'w', [['feather', 8], ['rust_pigment', 6], ['candle', 6], ['star_chart', 1]]);
    piece(119, F + 1, 97, 'painting_meadow', 'painting', 'w');
}

// ---------------------------------------------------------------------------------------
// The temazcal, a steam bath: a low dome, hot stones and water, benches

function constructionPalaceMayaTemazcal(b) {
    const P = PALACE_MAYA_TOP;
    const F = P + 1;
    const { piece, lantern } = constructionFurnisher(b);
    const [x0, z0, x1, z1] = [92, 105, 100, 113];
    // Layer j: the ring at inset max(0, j - 1) is solid and what is inside it is empty, up to the capstone.
    for (let j = 0; j <= 5; j++) {
        const s = Math.max(0, j - 1);
        for (let z = z0 + s; z <= z1 - s; z++) {
            for (let x = x0 + s; x <= x1 - s; x++) {
                const ring = Math.min(x - x0, x1 - x, z - z0, z1 - z) === s;
                if (ring || s === 4) b.set(x, F + j, z, j === 1 ? 'red_stucco' : 'white_stucco');
            }
        }
    }
    b.box(96, F, z0, 96, F + 1, z0, null);
    // The floor; the hot stones in the back, glowing; the water to pour on them; benches either side.
    for (let z = z0 + 1; z < z1; z++) {
        for (let x = x0 + 1; x < x1; x++) b.set(x, P, z, 'limestone');
    }
    for (let x = 95; x <= 97; x++) b.set(x, P, 111, 'magma_rock');
    for (const [x, z] of [[93, 111], [93, 112], [99, 111], [99, 112]]) {
        b.set(x, P - 1, z, 'limestone');
        b.set(x, P, z, 'water');
    }
    for (let z = 106; z <= 109; z++) {
        piece(93, F, z, 'bench', 'bench', 'e');
        piece(99, F, z, 'bench', 'bench', 'w');
    }
    for (const x of [94, 98]) lantern(x, F, 106, 'floor');
    constructionPalaceChest(b, 96, F, 112, 'n', [['water_bucket', 2], ['bucket', 2], ['white_wool', 8], ['cold_water', 4]], 'barrel');
    constructionPalaceSign(b, 97, F, 104, 'n', 'Temazcal, un baño de vapor: el agua echada sobre piedras muy calientes se convierte en vapor.',
        'Temazcal, a steam bath: water poured on very hot stones turns into steam.');

    // The garden: flowers along the residence, a reservoir of still water with a white rim, shrubs at its corners.
    for (let x = 104; x <= 119; x++) {
        b.set(x, P, 103, 'grass');
        b.set(x, F, 103, x % 2 ? 'flower_red' : 'flower_yellow');
    }
    for (let z = 106; z <= 115; z++) {
        for (let x = 105; x <= 118; x++) {
            const rim = x === 105 || x === 118 || z === 106 || z === 115;
            if (rim) b.set(x, P, z, 'white_stucco');
            else {
                b.set(x, P - 1, z, 'limestone');
                b.set(x, P, z, 'water');
            }
        }
    }
    for (const [x, z] of [[104, 105], [119, 105], [104, 116], [119, 116]]) {
        b.set(x, P, z, 'moss');
        b.set(x, F, z, 'jungle_leaves');
    }
}

// ---------------------------------------------------------------------------------------
// The Jaguar Temple: a pyramid of seven tiers with a temple on top

function constructionPalaceMayaPyramid(b) {
    const G = PALACE_MAYA_GROUND;
    const C = PALACE_MAYA_TEMPLE_AXIS;
    const { piece } = constructionFurnisher(b);
    // Tier k: 3 high, 2 in from the one under it on every side. Only its outer 3 rings are drawn: nobody sees in.
    for (let k = 0; k < 7; k++) {
        const [x0, x1, z0, z1] = [12 + 2 * k, 46 - 2 * k, 36 + 2 * k, 70 - 2 * k];
        for (let v = 0; v < 3; v++) {
            const y = G + 1 + 3 * k + v;
            for (let z = z0; z <= z1; z++) {
                for (let x = x0; x <= x1; x++) {
                    const d = Math.min(x - x0, x1 - x, z - z0, z1 - z);
                    if (d > 2 && !(k === 6 && v === 2)) continue;
                    let type;
                    if (v === 2 && d > 0) type = constructionPalacePick([['limestone', 8], ['moss', 2]], x, y, z, 111);
                    else if (v === 2) type = constructionPalacePick([['white_stucco', 7], ['limestone', 3]], x, y, z, 113);
                    else type = constructionPalacePick(PALACE_MAYA_OLD, x, y, z, 115);
                    b.set(x, y, z, type);
                }
            }
        }
    }
    // The stair, 7 wide, from the plaza to the top terrace, between balustrades.
    constructionPalaceMayaStair(b, C - 3, G + 1, 27, 's', 21, 7, G + 1);
    for (const x of [C - 4, C + 4]) {
        for (let z = 27; z <= 47; z++) {
            const top = G + 2 + (z - 27);
            b.box(x, G + 1, z, x, top - 1, z, 'limestone');
            b.set(x, top, z, 'white_stucco');
        }
    }
    // The temple: one vaulted room behind three doorways, a roof comb, braziers on the terrace.
    const T = G + 21;
    constructionPalaceMayaRange(b, {
        x0: C - 4, z0: 51, x1: C + 4, z1: 57, y: T, wall: PALACE_MAYA_OLD, salt: 117,
        rooms: [{ x0: C - 3, z0: 52, x1: C + 3, z1: 56, floor: (x, z) => (x === C ? 'red_stucco' : 'limestone') }],
        doors: [{ x0: C - 2, z0: 51, x1: C - 2, z1: 51 }, { x0: C, z0: 51, x1: C, z1: 51 }, { x0: C + 2, z0: 51, x1: C + 2, z1: 51 }],
        comb: { x0: C - 3, z0: 55, x1: C + 3, z1: 55, h: 8 }
    });
    constructionPalaceMayaLamps(b, C - 3, 52, C + 3, 56, T + 1);
    b.box(C - 1, T + 1, 56, C + 1, T + 1, 56, 'limestone');
    b.set(C, T + 1, 56, 'red_stucco');
    b.set(C - 1, T + 2, 56, 'candle');
    b.set(C + 1, T + 2, 56, 'candle');
    b.set(C, T + 2, 56, 'vase');
    piece(C - 2, T + 2, 56, 'red_banner', 'banner', 'n');
    piece(C + 2, T + 2, 56, 'red_banner', 'banner', 'n');
    constructionPalaceChest(b, C - 3, T + 1, 56, 'e', [['obsidian', 8], ['amber', 6], ['feather', 12], ['honeycomb', 4], ['candle', 8], ['gold_leaf', 2]]);
    constructionPalaceChest(b, C + 3, T + 1, 56, 'w', [['candle', 16], ['jungle_sapling', 4], ['rust_pigment', 8]], 'barrel');
    for (const x of [C - 4, C + 4]) constructionPalaceMayaBrazier(b, x, T + 1, 49);
    for (const x of [C - 5, C + 5]) constructionPalaceMayaBrazier(b, x, G + 1, 27);
}

// ---------------------------------------------------------------------------------------
// The ball court

// An alley 7 wide between two long buildings, whose sides slope down to it like benches and then rise as walls with a
// stone ring high in the middle of each; wider end zones, so the plan is an I; three markers down the middle.
function constructionPalaceMayaBallCourt(b) {
    const G = PALACE_MAYA_GROUND;
    const C = PALACE_MAYA_TEMPLE_AXIS;
    const [z0, z1] = [84, 108];
    for (let z = 80; z <= 112; z++) {
        for (let x = C - 8; x <= C + 8; x++) b.set(x, G, z, constructionPalacePick(PALACE_MAYA_PAVING, x, G, z, 121));
    }
    for (const z of [88, 96, 104]) {
        b.set(C, G, z, 'green_glazed_tile');
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.set(C + dx, G, z + dz, 'red_stucco');
    }
    for (const side of [-1, 1]) {
        const at = (n) => C + side * n;
        const up = side < 0 ? 'w' : 'e';
        for (let z = z0; z <= z1; z++) {
            b.stairs(at(4), G + 1, z, 'sandstone_stairs', up);
            b.set(at(5), G + 1, z, 'limestone');
            b.stairs(at(5), G + 2, z, 'sandstone_stairs', up);
            b.box(at(6), G + 1, z, at(6), G + 2, z, 'limestone');
            b.stairs(at(6), G + 3, z, 'sandstone_stairs', up);
        }
        // The building: a shell with its top at G + 8, the wall to the alley red with a frieze, white cornices.
        const [bx0, bx1] = side < 0 ? [C - 15, C - 7] : [C + 7, C + 15];
        for (let y = G + 1; y <= G + 8; y++) {
            for (let z = z0; z <= z1; z++) {
                for (let x = bx0; x <= bx1; x++) {
                    const edge = x === bx0 || x === bx1 || z === z0 || z === z1;
                    if (!edge && y < G + 8) continue;
                    const k = y - G - 1;
                    let type = constructionPalacePick(PALACE_MAYA_OLD, x, y, z, 123);
                    if (y === G + 8) type = edge ? 'white_stucco' : 'limestone';
                    else if (k >= 5) type = constructionPalaceMayaFace(k - 1, z - z0, x, y, z, PALACE_MAYA_OLD, 125);
                    b.set(x, y, z, type);
                }
            }
        }
        // The ring: stone round a hole, standing out from the wall, high over the bench.
        for (let dy = 0; dy < 3; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dy !== 1 || dz !== 0) b.set(at(6), G + 5 + dy, 96 + dz, 'limestone');
            }
        }
        b.set(at(7), G + 9, 96, 'green_glazed_tile');
    }
    for (const [x, z] of [[C - 8, 81], [C + 8, 81], [C - 8, 111], [C + 8, 111]]) b.lampPost(x, G + 1, z, 'jungle_fence', 2);
    constructionPalaceSign(b, C + 6, G + 1, 80, 'n', 'Juego de pelota. La pelota era de hule: mezclaban el látex de un árbol con el jugo de una enredadera para que botara.',
        'Ball court. The ball was rubber: they mixed the latex of a tree with the juice of a vine to make it bounce.');
}

// ---------------------------------------------------------------------------------------

function constructionPalaceMaya(b) {
    constructionPalaceMayaLand(b);
    constructionPalaceMayaPlatform(b);
    constructionPalaceMayaGallery(b);
    constructionPalaceMayaRanges(b);
    constructionPalaceMayaThroneHouse(b);
    constructionPalaceMayaCourts(b);
    constructionPalaceMayaTower(b);
    constructionPalaceMayaCalendar(b);
    constructionPalaceMayaResidence(b);
    constructionPalaceMayaTemazcal(b);
    constructionPalaceMayaPyramid(b);
    constructionPalaceMayaBallCourt(b);
}

CONSTRUCTION_DESIGNS.palace_maya = {
    label: 'Maya palace',
    size: PALACE_MAYA_SIZE,
    foundation: 'dirt',
    anchorX: PALACE_MAYA_AXIS,
    groundY: PALACE_MAYA_GROUND,
    rate: 480,
    start: [PALACE_MAYA_AXIS, PALACE_MAYA_GROUND + 1, 1],
    levels: [],
    site: constructionPalaceSite({ label: 'Maya palace', theme: 'jungle', groundY: PALACE_MAYA_GROUND, rim: PALACE_MAYA_RIM }),
    generate: constructionPalaceMaya
};
