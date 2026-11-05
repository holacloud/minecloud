// /build castle: a walled castle of about 100 x 100, on a levelled site. Loaded after furniture.js,
// decor.js and constructions.js; it only adds an entry to CONSTRUCTION_DESIGNS.
// - The local box is CASTLE_SIZE square: the castle stands in the middle, and CASTLE_RIM columns all
//   round it are only earth, graded from the level of the castle to the terrain (constructionCastleSite).
// - y = CASTLE_GROUND is the ground layer of the courtyard; what is under it stays ground unless drawn,
//   so the moat and the dungeon are dug out and hardly cost a block.
// - From outside in, on each side (`r`, how far from the edge of the castle, x = CASTLE_RIM + r):
//   a bank, the moat, a berm, the curtain wall, the courtyard. Moat water does not flow in this game
//   (the server has no water simulation, and bucket.js says so): it stays where it is put.
// - Towers are octagons with a stone pier in the middle, stairs winding round it (2 up on each side,
//   8 a round: constructionCastleSpiral) and floors around that, so there is nothing to fall behind.
// - Stairs and landings are the only way up: no ladders, which would write world.json every time.
// - Beds go through constructionCastleBed only. Ovens and storage are empty furniture: /build only
//   places blocks. Candles, lanterns and chandeliers light without power.

const CASTLE_GROUND = 8;
const CASTLE_RIM = 10;
const CASTLE_SIZE = 121;
const CASTLE_HEIGHT = 72;
const CASTLE_MID = 60;
// How many blocks of earth a site may move, and how far above or below the castle's level it may be.
const CASTLE_MAX_EARTH = 110000;
const CASTLE_MAX_RELIEF = 34;
// The share of the site that may be water.
const CASTLE_MAX_WATER = 0.5;

// One bed; the head at (x, y, z), `facing` the way the head points (the wall, mostly), the foot in
// the cell away from it. Every bed in the castle goes through here.
function constructionCastleBed(b, x, y, z, facing) {
    const [dx, dz] = SHAPE_DIRECTIONS[facing];
    b.bed(x - dx, y, z - dz, facing);
}

// Stone with age on it: the same cell always gets the same block.
function constructionCastleStone(x, y, z) {
    const hash = (Math.imul(x + 3, 73856093) ^ Math.imul(y + 5, 19349663) ^ Math.imul(z + 7, 83492791)) >>> 0;
    const k = (hash >>> 7) % 100;
    if (k < 68) return 'stone_bricks';
    if (k < 86) return 'stone';
    return 'cobblestone';
}

function constructionCastleOctagon(dx, dz, r) {
    const [ax, az] = [Math.abs(dx), Math.abs(dz)];
    return ax <= r && az <= r && ax + az <= r + (r >> 1);
}

// Inwards from the rim of an octagon: the way a cell at (dx, dz) has its back to the middle.
function constructionCastleInward(dx, dz) {
    if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'w' : 'e';
    return dz > 0 ? 'n' : 's';
}

// A stair round a pier of 3 x 3, in the 5 x 5 from (x0, z0): 2 up and a landing on each side. Who
// stands on the landing of layer `base` + 8k has their feet at `base` + 8k + 1, at z0 + 4 by x0 and
// x0 + 1; `base` + 2 at x0 by z0 and z0 + 1; `base` + 4 at z0 by x0 + 3 and x0 + 4; `base` + 6 at x0 + 4
// by z0 + 3 and z0 + 4. Nothing above `top`. The first landing is not drawn: it is the floor.
function constructionCastleSpiral(b, x0, z0, base, top, stair, flat) {
    const cell = (x, y, z, type) => {
        if (y <= top) b.set(x, y, z, type);
    };
    const step = (x, y, z, facing) => {
        if (y <= top) b.stairs(x, y, z, stair, facing);
    };
    b.box(x0 + 1, base + 1, z0 + 1, x0 + 3, top, z0 + 3, flat);
    for (let y = base; y < top; y += 8) {
        step(x0, y + 1, z0 + 3, 'n');
        step(x0, y + 2, z0 + 2, 'n');
        cell(x0, y + 2, z0 + 1, flat);
        cell(x0, y + 2, z0, flat);
        step(x0 + 1, y + 3, z0, 'e');
        step(x0 + 2, y + 4, z0, 'e');
        cell(x0 + 3, y + 4, z0, flat);
        cell(x0 + 4, y + 4, z0, flat);
        step(x0 + 4, y + 5, z0 + 1, 's');
        step(x0 + 4, y + 6, z0 + 2, 's');
        cell(x0 + 4, y + 6, z0 + 3, flat);
        cell(x0 + 4, y + 6, z0 + 4, flat);
        step(x0 + 3, y + 7, z0 + 4, 'w');
        step(x0 + 2, y + 8, z0 + 4, 'w');
        cell(x0 + 1, y + 8, z0 + 4, flat);
        cell(x0, y + 8, z0 + 4, flat);
    }
}

// A cone of slate on rings of an octagon, from radius r up, ending in a gold tip and a flag.
function constructionCastleCone(b, cx, cz, y, r, flag) {
    for (let k = 0; k <= r; k++) {
        for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
                if (constructionCastleOctagon(dx, dz, r - k) && !constructionCastleOctagon(dx, dz, r - k - 1)) b.set(cx + dx, y + k, cz + dz, 'slate');
            }
        }
    }
    b.set(cx, y + r + 1, cz, 'gold_block');
    constructionCastleFlag(b, cx, y + r + 2, cz, flag);
}

function constructionCastleFlag(b, x, y, z, color) {
    b.box(x, y, z, x, y + 5, z, 'dark_oak_fence');
    b.box(x + 1, y + 3, z, x + 3, y + 5, z, `${color}_wool`);
    b.box(x + 2, y + 4, z, x + 3, y + 4, z, 'yellow_wool');
}

const CASTLE_TOWER_FLOORS = [0, 6, 12, 18, 24];

// A tower, centred at (cx, cz), 13 across. The floors are at the layers of CASTLE_TOWER_FLOORS over the
// ground, the wall walk at the third. roof: true for a room and a cone at the top, otherwise a platform
// with a parapet on corbels.
function constructionCastleTower(b, cx, cz, { roof = false, flag = 'red' } = {}) {
    const G = CASTLE_GROUND;
    const floors = CASTLE_TOWER_FLOORS.map((f) => G + f);
    const last = floors[floors.length - 1];
    const wallTop = roof ? last + 4 : last;
    for (let dz = -7; dz <= 7; dz++) {
        for (let dx = -7; dx <= 7; dx++) {
            const [x, z] = [cx + dx, cz + dz];
            if (constructionCastleOctagon(dx, dz, 6)) {
                b.box(x, G - 4, z, x, G - 1, z, 'basalt');
                b.set(x, G, z, 'cobblestone');
                // Air all the way up, for what stood here before: moat or wall.
                b.box(x, G + 1, z, x, last + 12, z, null);
                if (!constructionCastleOctagon(dx, dz, 4)) {
                    for (let y = G + 1; y <= wallTop; y++) b.set(x, y, z, y <= G + 2 ? 'basalt' : constructionCastleStone(x, y, z));
                    b.set(x, G + 12, z, 'limestone');
                } else {
                    for (const y of floors) {
                        if (y !== G) b.set(x, y, z, roof && y === last ? 'dark_oak_planks' : y === last ? 'stone_bricks' : 'spruce_planks');
                    }
                }
            } else if (constructionCastleOctagon(dx, dz, 7) && !roof) {
                // The parapet, out on corbels.
                b.stairs(x, last - 1, z, 'stone_brick_stairs', constructionCastleInward(dx, dz), 'top');
                b.set(x, last, z, 'stone_bricks');
                b.set(x, last + 1, z, 'stone_bricks');
                if ((dx + dz + 16) % 3 !== 0) b.box(x, last + 2, z, x, last + 3, z, constructionCastleStone(x, last + 2, z));
            }
        }
    }
    // The hole for the stairs in every floor, and the pier: the stairs draw it.
    for (const y of floors) {
        if (y !== G) b.box(cx - 2, y, cz - 2, cx + 2, y, cz + 2, null);
    }
    constructionCastleSpiral(b, cx - 2, cz - 2, G, last, 'stone_brick_stairs', 'stone_bricks');
    // A platform has no roof over its stairs; the pier ends in the floor.
    b.box(cx - 1, last, cz - 1, cx + 1, last, cz + 1, roof ? 'dark_oak_planks' : 'stone_bricks');

    // Arrow slits on the four sides of each floor: a dark recess, bars inside.
    for (const y of floors) {
        if (y === last && !roof) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            b.box(cx + dx * 6, y + 2, cz + dz * 6, cx + dx * 6, y + 3, cz + dz * 6, null);
            b.box(cx + dx * 5, y + 2, cz + dz * 5, cx + dx * 5, y + 3, cz + dz * 5, 'iron_bars');
        }
    }
    // Light: a lantern standing against the wall on each of the four sides of each floor, by the
    // doors and the slits, plus one hanging in each corner for the stairs.
    for (let i = 0; i < floors.length - 1; i++) {
        for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) b.shaped(cx + dx, floors[i] + 1, cz + dz, 'lantern', 'lantern', { mount: 'floor' });
        for (const [dx, dz] of [[-3, -3], [3, 3]]) b.shaped(cx + dx, floors[i + 1] - 1, cz + dz, 'lantern', 'lantern', { mount: 'hanging' });
    }

    if (roof) {
        for (let y = last + 1; y <= last + 3; y += 1) {
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                b.set(cx + dx * 6, y, cz + dz * 6, 'glass_pane');
                b.set(cx + dx * 5, y, cz + dz * 5, 'glass_pane');
            }
        }
        // A beam to hang the light from, the cone over it.
        for (let dz = -4; dz <= 4; dz++) {
            for (let dx = -4; dx <= 4; dx++) {
                if (constructionCastleOctagon(dx, dz, 4)) b.set(cx + dx, last + 5, cz + dz, 'dark_oak_planks');
            }
        }
        for (const [dx, dz] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) b.shaped(cx + dx, last + 4, cz + dz, 'lantern', 'lantern', { mount: 'hanging' });
        constructionCastleCone(b, cx, cz, last + 5, 7, flag);
    } else {
        constructionCastleFlag(b, cx, last + 1, cz, flag);
    }
}

// Sides of the castle, each drawn from `at(r, u)`: r from the outer edge going in, u along it.
const CASTLE_SIDES = [
    { at: (r, u) => [u, CASTLE_RIM + r], inn: 's' },
    { at: (r, u) => [u, CASTLE_SIZE - 1 - CASTLE_RIM - r], inn: 'n' },
    { at: (r, u) => [CASTLE_RIM + r, u], inn: 'e' },
    { at: (r, u) => [CASTLE_SIZE - 1 - CASTLE_RIM - r, u], inn: 'w' }
];

// A stretch of curtain wall: r = 11 to 14, u0 to u1. A gallery runs inside it at the foot, with bars
// in the arrow slits; above it the wall is two skins, and on top a walk with a parapet out on corbels.
function constructionCastleCurtain(b, side, u0, u1) {
    const G = CASTLE_GROUND;
    const put = (r, y, u, type) => {
        const [x, z] = side.at(r, u);
        b.set(x, y, z, type === 'stone' ? constructionCastleStone(x, y, z) : type);
    };
    const stairs = (r, y, u, facing, half) => {
        const [x, z] = side.at(r, u);
        b.stairs(x, y, z, 'stone_brick_stairs', facing, half);
    };
    for (let u = u0; u <= u1; u++) {
        for (let r = 11; r <= 14; r++) put(r, G, u, 'cobblestone');
        for (let y = G + 1; y <= G + 3; y++) {
            put(11, y, u, y === G + 1 ? 'basalt' : 'stone');
            put(12, y, u, 'stone');
            put(14, y, u, 'stone');
        }
        for (let r = 11; r <= 14; r++) put(r, G + 4, u, 'stone');
        for (let y = G + 5; y <= G + 11; y++) {
            put(11, y, u, y === G + 5 ? 'limestone' : 'stone');
            put(14, y, u, 'stone');
        }
        // The walk, its low wall on the courtyard side, the parapet on the outside.
        for (let r = 10; r <= 14; r++) put(r, G + 12, u, r === 10 ? 'stone' : 'stone_bricks');
        stairs(10, G + 11, u, side.inn, 'top');
        put(14, G + 13, u, 'stone_bricks_slab');
        put(10, G + 13, u, 'stone');
        if (((u % 4) + 4) % 4 < 2) {
            put(10, G + 14, u, 'stone');
            put(10, G + 15, u, 'stone_bricks_slab');
        }
        // Buttresses, stepping back.
        if (u % 8 === 0) {
            for (let y = G + 1; y <= G + 9; y++) put(10, y, u, y <= G + 2 ? 'basalt' : 'stone');
            stairs(10, G + 10, u, side.inn);
            for (let y = G + 1; y <= G + 4; y++) put(9, y, u, y <= G + 2 ? 'basalt' : 'stone');
            stairs(9, G + 5, u, side.inn);
        }
        // Arrow slits: at the gallery, a recess and bars; higher up, dark stone in the shape of one.
        if (u % 8 === 4) {
            put(11, G + 2, u, 'air');
            put(11, G + 3, u, 'air');
            put(12, G + 2, u, 'iron_bars');
            put(12, G + 3, u, 'iron_bars');
            put(11, G + 8, u, 'basalt');
            put(11, G + 9, u, 'basalt');
        }
        if (u % 8 === 0) {
            const [x, z] = side.at(13, u);
            b.shaped(x, G + 3, z, 'lantern', 'lantern', { mount: 'hanging' });
        }
    }
}

// Openings in a tower: to the wall walk (3 high from `feet`), or a gallery (2 high), at `cells`.
function constructionCastleOpening(b, cells, feet, height) {
    for (const [x, z] of cells) {
        b.box(x, feet, z, x, feet + height - 1, z, null);
    }
}

// The moat, in the r = 2 to 8 ring, three deep with its surface a step below the ground, in a bed and
// banks of stone. It has no outlet to anywhere and needs none: water stays.
function constructionCastleMoat(b) {
    const G = CASTLE_GROUND;
    const [x0, x1] = [CASTLE_RIM, CASTLE_SIZE - 1 - CASTLE_RIM];
    for (let z = x0; z <= x1; z++) {
        for (let x = x0; x <= x1; x++) {
            const r = Math.min(x - x0, x1 - x, z - x0, x1 - z);
            b.set(x, G, z, 'grass');
            if (r === 1 || r === 9) {
                b.box(x, G - 4, z, x, G - 1, z, 'stone_bricks');
                b.set(x, G, z, 'stone_bricks');
            } else if (r >= 2 && r <= 8) {
                b.set(x, G - 4, z, 'cobblestone');
                b.box(x, G - 3, z, x, G - 1, z, 'water');
                b.set(x, G, z, 'air');
            }
        }
    }
}

// The bridge, the gatehouse and the two round towers beside it: the only way in.
function constructionCastleGate(b) {
    const G = CASTLE_GROUND;
    const F = G + 1;
    const mid = CASTLE_MID;
    // The deck over the moat on stone piers, rails and lamps; the road on the bank.
    for (let z = 10; z <= 19; z++) {
        for (let x = mid - 2; x <= mid + 2; x++) b.set(x, G, z, z <= 11 || z === 19 ? 'cobblestone' : 'spruce_planks');
    }
    b.sym(() => {
        for (let z = 12; z <= 18; z++) {
            b.set(mid - 3, G, z, 'spruce_planks');
            b.set(mid - 3, F, z, 'dark_oak_fence');
        }
        for (const z of [12, 15, 18]) {
            b.box(mid - 3, G - 3, z, mid - 3, G - 1, z, 'stone_bricks');
            b.box(mid - 3, F, z, mid - 3, F + 1, z, 'dark_oak_fence');
            b.set(mid - 3, F + 2, z, 'torch');
        }
    });

    b.sym(() => constructionCastleTower(b, mid - 9, 22, { flag: 'blue' }));

    // The body between the towers: x = mid - 3 to mid + 3, z = 20 to 26.
    b.box(mid - 3, G, 20, mid + 3, G, 26, 'cobblestone');
    b.box(mid - 3, G + 1, 20, mid + 3, G + 11, 26, 'air');
    b.sym(() => {
        for (let y = G + 1; y <= G + 11; y++) {
            for (let z = 20; z <= 26; z++) b.set(mid - 3, y, z, constructionCastleStone(mid - 3, y, z));
        }
        // Into the room over the gate, and onto its roof, from the towers.
        for (const x of [mid - 3, mid - 4, mid - 5]) {
            constructionCastleOpening(b, [[x, 21], [x, 22], [x, 23]], F + 12, 3);
            constructionCastleOpening(b, [[x, 21], [x, 22], [x, 23]], F + 6, 3);
        }
    });
    // The floor of the room, and the vault of the way through under it; the room's two end walls.
    b.box(mid - 2, G + 6, 20, mid + 2, G + 6, 26, 'dark_oak_planks');
    for (let x = mid - 3; x <= mid + 3; x++) {
        for (const z of [20, 26]) {
            for (let y = G + 7; y <= G + 11; y++) b.set(x, y, z, constructionCastleStone(x, y, z));
        }
    }
    for (const [x, z] of [[mid, 20], [mid, 26]]) {
        b.box(x - 1, G + 9, z, x + 1, G + 10, z, 'iron_bars');
    }
    for (const x of [mid - 2, mid + 2]) {
        for (const z of [22, 25]) b.shaped(x, G + 5, z, 'lantern', 'lantern', { mount: 'hanging' });
    }
    b.box(mid - 2, G + 12, 20, mid + 2, G + 12, 26, 'dark_oak_planks');
    b.shaped(mid - 1, G + 11, 23, 'lantern', 'lantern', { mount: 'hanging' });
    b.shaped(mid + 1, G + 11, 23, 'lantern', 'lantern', { mount: 'hanging' });

    // The gate: two pairs of doors with a stone pier between them, a portcullis drawn up over them.
    b.box(mid - 3, G + 1, 20, mid + 3, G + 5, 20, 'stone_bricks');
    b.box(mid - 2, G + 3, 20, mid + 2, G + 5, 20, 'iron_bars');
    b.box(mid, G + 1, 20, mid, G + 5, 20, 'limestone');
    b.doubleDoor(mid - 2, F, 20, mid - 1, 20, 'dark_oak_door', 's');
    b.doubleDoor(mid + 1, F, 20, mid + 2, 20, 'dark_oak_door', 's');
    // The way out to the courtyard: an open arch.
    b.box(mid - 3, G + 4, 26, mid + 3, G + 5, 26, 'limestone');
    b.sym(() => b.set(mid - 3, G + 3, 26, 'limestone'));

    // Machicolations and battlements across the top, front and back, with a banner over the gate.
    b.sym(() => {
        for (let x = mid - 3; x <= mid; x++) {
            b.stairs(x, G + 11, 19, 'stone_brick_stairs', 's', 'top');
            b.set(x, G + 12, 19, 'stone_bricks');
            b.set(x, G + 13, 19, 'stone_bricks');
            if ((x + 40) % 2) b.box(x, G + 14, 19, x, G + 15, 19, 'stone_bricks');
            b.set(x, G + 12, 26, 'stone_bricks');
            b.set(x, G + 13, 26, 'stone_bricks');
            if ((x + 40) % 2) b.set(x, G + 14, 26, 'stone_bricks');
        }
    });
    for (let y = G + 6; y <= G + 10; y++) {
        b.set(mid, y, 19, y === G + 8 ? 'yellow_wool' : 'red_wool');
    }
    b.box(mid - 1, G + 7, 19, mid - 1, G + 9, 19, 'red_wool');
    b.box(mid + 1, G + 7, 19, mid + 1, G + 9, 19, 'red_wool');
    b.box(mid - 2, G + 5, 19, mid + 2, G + 5, 19, 'limestone');
    b.box(mid - 2, G + 11, 19, mid + 2, G + 11, 19, 'limestone');
}

// One stall of a market: a counter between posts, what it sells on it, an awning in stripes.
function constructionCastleStall(b, x0, z, colors, goods) {
    const G = CASTLE_GROUND;
    const F = G + 1;
    for (const x of [x0, x0 + 4]) {
        b.box(x, F, z, x, F + 2, z, 'dark_oak_fence');
        b.box(x, F, z + 3, x, F + 2, z + 3, 'dark_oak_fence');
    }
    b.box(x0 + 1, F, z, x0 + 3, F, z, 'spruce_planks');
    goods.forEach((good, i) => b.set(x0 + 1 + i, F + 1, z, good));
    for (let dz = -1; dz <= 3; dz++) {
        for (let x = x0; x <= x0 + 4; x++) b.set(x, F + 3, z + dz, x % 2 ? colors[0] : colors[1]);
    }
    b.shaped(x0 + 1, F + 2, z + 1, 'lantern', 'lantern', { mount: 'hanging' });
    b.shaped(x0 + 3, F + 2, z + 1, 'lantern', 'lantern', { mount: 'hanging' });
    b.set(x0 + 2, F, z + 2, 'barrel');
}

// The courtyard: paths, a garden with the well on the left, stalls on the right, stables and a forge
// beside the keep.
function constructionCastleCourtyard(b, sign) {
    const G = CASTLE_GROUND;
    const F = G + 1;
    const mid = CASTLE_MID;
    const lamp = (x, z, height = 2) => b.lampPost(x, F, z, 'dark_oak_fence', height);

    // ---- Paths: from the gate to the keep, round the keep, and to every tower door. ----
    b.box(mid - 3, G, 27, mid + 3, G, 55, 'cobblestone');
    b.box(25, G, 53, 95, G, 55, 'cobblestone');
    b.box(39, G, 53, 41, G, 91, 'cobblestone');
    b.box(79, G, 53, 81, G, 91, 'cobblestone');
    b.box(39, G, 89, 81, G, 91, 'cobblestone');
    b.box(29, G, 59, 41, G, 61, 'cobblestone');
    b.box(79, G, 59, 91, G, 61, 'cobblestone');
    b.box(mid - 1, G, 89, mid + 1, G, 92, 'cobblestone');
    for (const z of [28, 44]) {
        for (const x of [mid - 4, mid + 4]) lamp(x, z);
    }

    // ---- The garden, on the left of the gate. ----
    const [gx0, gx1, gz0, gz1] = [28, 46, 29, 51];
    b.box(gx0, G, gz0, gx1, G, gz1, 'grass');
    for (let x = gx0; x <= gx1; x++) {
        for (const z of [gz0, gz1]) {
            if (x !== 37) b.set(x, F, z, 'leaves');
        }
    }
    for (let z = gz0; z <= gz1; z++) {
        for (const x of [gx0, gx1]) {
            if (z !== 40) b.set(x, F, z, 'leaves');
        }
    }
    b.box(36, G, gz0, 38, G, gz1, 'cobblestone');
    b.box(gx0, G, 39, gx1, G, 41, 'cobblestone');
    for (const [x0, z0] of [[30, 31], [40, 31], [30, 43], [40, 43]]) {
        for (let z = z0; z <= z0 + 6; z++) {
            for (let x = x0; x <= x0 + 4; x++) {
                b.set(x, G, z, 'dirt');
                b.set(x, F, z, (x + z) % 3 === 0 ? 'flower_red' : (x + z) % 3 === 1 ? 'flower_yellow' : 'tall_grass');
            }
        }
        // A small tree in the middle of the bed.
        const [tx, tz] = [x0 + 2, z0 + 3];
        b.box(tx, F, tz, tx, F + 3, tz, 'wood');
        b.box(tx - 2, F + 3, tz - 1, tx + 2, F + 4, tz + 1, 'leaves');
        b.box(tx - 1, F + 3, tz - 2, tx + 1, F + 4, tz + 2, 'leaves');
        b.set(tx, F + 3, tz, 'wood');
        b.set(tx, F + 5, tz, 'leaves');
    }
    for (const [x, z, facing] of [[35, 37, 'e'], [35, 43, 'e'], [39, 37, 'w'], [39, 43, 'w']]) b.shaped(x, F, z, 'bench', 'bench', { facing });
    lamp(35, 35, 2);
    lamp(39, 35, 2);

    // ---- The well, where the garden's paths cross. ----
    b.box(36, G, 39, 38, G, 41, 'stone_bricks');
    b.walls(36, F, 39, 38, F, 41, 'stone_bricks');
    b.box(37, G - 3, 40, 37, F - 1, 40, 'water');
    b.set(37, G - 4, 40, 'stone_bricks');
    for (const [x, z] of [[36, 39], [38, 39], [36, 41], [38, 41]]) b.box(x, F + 1, z, x, F + 2, z, 'dark_oak_fence');
    for (let z = 38; z <= 42; z++) {
        b.stairs(35, F + 3, z, 'dark_oak_stairs', 'e');
        b.stairs(39, F + 3, z, 'dark_oak_stairs', 'w');
        b.box(36, F + 4, z, 38, F + 4, z, 'dark_oak_planks');
    }
    // The path goes round it.
    b.box(35, G, 38, 39, G, 38, 'cobblestone');
    b.box(35, G, 42, 39, G, 42, 'cobblestone');
    b.box(35, G, 39, 35, G, 41, 'cobblestone');
    b.box(39, G, 39, 39, G, 41, 'cobblestone');

    // ---- The market, on the right of the gate. ----
    const goods = [['flower_red', 'mushroom_red', 'vase'], ['flower_pot', 'mushroom_brown', 'flower_yellow'], ['vase', 'flower_pot', 'mushroom_red']];
    let stall = 0;
    for (const z of [33, 42]) {
        for (const x0 of [70, 77, 84]) {
            const colors = [['red_wool', 'white_wool'], ['blue_wool', 'white_wool'], ['green_wool', 'yellow_wool']][stall % 3];
            constructionCastleStall(b, x0, z, colors, goods[stall % 3]);
            stall++;
        }
    }
    b.box(68, G, 30, 91, G, 48, 'cobblestone');
    for (let z = 30; z <= 48; z += 2) {
        for (let x = 68 + (z % 4 ? 1 : 0); x <= 91; x += 2) b.set(x, G, z, 'stone_bricks');
    }
    lamp(67, 30, 3);
    lamp(92, 30, 3);
    lamp(67, 48, 3);
    lamp(92, 48, 3);

    // ---- The stables, behind the garden: a brick and timber hall with stalls open to the east. ----
    const [sx0, sx1, sz0, sz1] = [27, 37, 64, 86];
    b.box(sx0, G, sz0, sx1, G, sz1, 'spruce_planks');
    b.box(sx0, F, sz0, sx1, F + 3, sz0, 'brick');
    b.box(sx0, F, sz1, sx1, F + 3, sz1, 'brick');
    b.box(sx0, F, sz0, sx0, F + 3, sz1, 'brick');
    b.box(sx0, F, sz0, sx0, F, sz1, 'cobblestone');
    for (let z = sz0; z <= sz1; z += 5) {
        // The stalls: a partition, a gate towards the aisle, hay and a trough.
        b.box(sx0 + 1, F, z, sx0 + 5, F + 1, z, 'dark_oak_fence');
        b.box(sx0 + 5, F, z, sx0 + 5, F + 3, z, 'dark_oak_wood');
        b.box(sx1, F, z, sx1, F + 3, z, 'dark_oak_wood');
        if (z === sz1) continue;
        b.box(sx0 + 5, F, z + 1, sx0 + 5, F, z + 4, 'dark_oak_fence');
        b.gate(sx0 + 5, F, z + 2, 'dark_oak_fence_gate', 'w');
        b.box(sx0 + 1, F, z + 1, sx0 + 1, F, z + 2, 'yellow_wool');
        b.set(sx0 + 1, F, z + 3, 'barrel');
        b.shaped(sx0 + 3, F + 3, z + 2, 'lantern', 'lantern', { mount: 'hanging' });
    }
    b.box(sx1, F + 3, sz0, sx1, F + 3, sz1, 'dark_oak_wood');
    b.box(sx0, F + 4, sz0, sx1, F + 4, sz1, 'dark_oak_planks');
    for (let z = sz0 + 2; z <= sz1 - 2; z += 5) b.shaped(sx1 - 2, F + 3, z, 'lantern', 'lantern', { mount: 'hanging' });
    b.shaped(sx1 - 2, F, sz1 - 1, 'lantern', 'lantern', { mount: 'floor' });
    for (let k = 0; k <= 6; k++) {
        for (let z = sz0 - 1; z <= sz1 + 1; z++) {
            b.stairs(sx0 - 1 + k, F + 4 + k, z, 'dark_oak_stairs', 'e');
            b.stairs(sx1 + 1 - k, F + 4 + k, z, 'dark_oak_stairs', 'w');
        }
        if (k > 0) {
            for (const z of [sz0, sz1]) b.box(sx0 + k, F + 4 + k, z, sx1 - k, F + 4 + k, z, 'birch_planks');
        }
    }
    sign(38, F, 62, 'n', 'Establos', 'Stables');

    // ---- The forge, across from them: stone below, brick above, a chimney; ovens as its fires. ----
    const [fx0, fx1, fz0, fz1] = [84, 94, 64, 78];
    b.box(fx0, G, fz0, fx1, G, fz1, 'cobblestone');
    b.walls(fx0, F, fz0, fx1, F + 1, fz1, 'cobblestone');
    b.walls(fx0, F + 2, fz0, fx1, F + 4, fz1, 'brick');
    b.box(fx0 + 1, F + 5, fz0 + 1, fx1 - 1, F + 5, fz1 - 1, 'dark_oak_planks');
    for (let k = 0; k <= 6; k++) {
        for (let z = fz0 - 1; z <= fz1 + 1; z++) {
            b.stairs(fx0 - 1 + k, F + 5 + k, z, 'dark_oak_stairs', 'e');
            b.stairs(fx1 + 1 - k, F + 5 + k, z, 'dark_oak_stairs', 'w');
        }
        if (k > 0) {
            for (const z of [fz0, fz1]) b.box(fx0 + k, F + 5 + k, z, fx1 - k, F + 5 + k, z, 'brick');
        }
    }
    b.box(fx0, F, 71, fx0, F + 2, 71, null);
    b.box(fx0, F, 70, fx0, F + 2, 70, 'dark_oak_wood');
    b.box(fx0, F, 72, fx0, F + 2, 72, 'dark_oak_wood');
    b.door(fx0, F, 71, 'spruce_door', 'e');
    b.set(fx0, F + 2, 71, 'dark_oak_wood');
    for (const z of [67, 75]) {
        b.box(fx0, F + 2, z, fx0, F + 3, z, 'glass_pane');
        b.box(fx1, F + 2, z, fx1, F + 3, z, 'glass_pane');
    }
    for (const z of [fz0 + 1, fz0 + 2, fz0 + 3]) b.shaped(fx1 - 1, F, z, 'oven', 'oven', { facing: 'w', fire: 'off' });
    b.box(fx1 - 1, F + 1, fz0 + 1, fx1 - 1, F + 12, fz0 + 3, 'brick');
    b.set(fx1 - 1, F + 13, fz0 + 2, 'brick');
    b.set(fx1 - 3, F, fz0 + 2, 'workbench');
    for (const z of [fz1 - 1, fz1 - 2]) {
        b.set(fx1 - 1, F, z, 'barrel');
        b.shaped(fx1 - 2, F, z, 'chest', 'chest', { facing: 'w' });
    }
    for (const [x, z] of [[fx0 + 2, 66], [fx0 + 2, 76], [fx1 - 3, 71]]) b.shaped(x, F, z, 'lantern', 'lantern', { mount: 'floor' });
    sign(82, F, 62, 'n', 'Forja', 'Forge');

    lamp(mid - 21, 92, 2);
    lamp(mid + 21, 92, 2);
    sign(mid + 4, F, 50, 'n', 'Torre del homenaje', 'The keep');
    sign(mid - 4, F, 30, 'n', 'Jardín y pozo', 'Garden and well');
    sign(mid + 4, F, 30, 'n', 'Mercado', 'Market');
}

// The keep: limestone on a dark plinth, x = 42 to 78, z = 56 to 88, walls 2 thick, a stair in its first
// corner from the dungeon to the roof. Floor layers over the ground: 0 the great hall and the kitchen,
// 10 the bedrooms, 16 the library and the armoury, 22 the chapel, 34 the roof and its battlements.
function constructionCastleKeep(b, sign) {
    const G = CASTLE_GROUND;
    const F = G + 1;
    const mid = CASTLE_MID;
    const [x0, x1, z0, z1] = [42, 78, 56, 88];
    const [ix0, ix1, iz0, iz1] = [44, 76, 58, 86];
    const roofY = G + 34;
    const floors = [G, G + 10, G + 16, G + 22, roofY];
    const hang = (x, y, z) => b.shaped(x, y, z, 'lantern', 'lantern', { mount: 'hanging' });
    const piece = (x, y, z, base, shape, facing) => b.shaped(x, y, z, base, shape, { facing: b.facing(facing) });
    const chair = (x, y, z, facing, wood = 'dark_oak') => piece(x, y, z, `${wood}_chair`, 'chair', facing);
    const tall = (x, y, z, base, facing) => {
        b.shaped(x, y, z, base, base, { half: 'lower', facing: b.facing(facing) });
        b.shaped(x, y + 1, z, base, base, { half: 'upper', facing: b.facing(facing) });
    };
    const curtain = (x, y, z, color, facing) => b.shaped(x, y, z, `${color}_curtain`, 'curtain', { facing: b.facing(facing), drawn: 'closed' });
    const shelves = (x, y, z, facing, height = 3) => {
        for (let k = 0; k < height; k++) piece(x, y + k, z, 'bookshelf', 'bookshelf', facing);
    };
    const chandelier = (x, y, z, chain) => {
        b.box(x, y + 1, z, x, y + chain, z, 'dark_oak_fence');
        b.set(x, y, z, 'chandelier');
    };

    // ---- The shell ----
    for (let y = G; y <= roofY; y++) {
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                if (x > x0 + 1 && x < x1 - 1 && z > z0 + 1 && z < z1 - 1) continue;
                const corner = (x <= x0 + 1 || x >= x1 - 1) && (z <= z0 + 1 || z >= z1 - 1);
                let type = corner ? 'stone_bricks' : 'limestone';
                if (y <= G + 2) type = 'basalt';
                else if (y === G + 10 || y === G + 22) type = 'stone_bricks';
                b.set(x, y, z, type);
            }
        }
    }
    for (const y of floors) {
        const type = y === G ? 'stone_bricks' : y === roofY ? 'stone_bricks' : 'dark_oak_planks';
        b.box(ix0, y, iz0, ix1, y, iz1, type);
    }
    // Pilasters up the outside, ending in a step.
    for (let u = x0 + 6; u < x1; u += 6) {
        for (const [z, inn] of [[z0 - 1, 's'], [z1 + 1, 'n']]) {
            if (Math.abs(u - mid) < 6 && z === z0 - 1) continue;
            b.box(u, G, z, u, roofY - 4, z, u % 12 === 0 ? 'stone_bricks' : 'limestone');
            b.stairs(u, roofY - 3, z, 'stone_brick_stairs', inn);
        }
    }
    for (let u = z0 + 6; u < z1; u += 6) {
        for (const [x, inn] of [[x0 - 1, 'e'], [x1 + 1, 'w']]) {
            b.box(x, G, u, x, roofY - 4, u, u % 12 === 0 ? 'stone_bricks' : 'limestone');
            b.stairs(x, roofY - 3, u, 'stone_brick_stairs', inn);
        }
    }

    // ---- The way in: a pair of doors each side of a pier, a porch, steps ----
    b.box(mid - 2, F, z0, mid - 1, F + 1, z0 + 1, null);
    b.box(mid + 1, F, z0, mid + 2, F + 1, z0 + 1, null);
    b.box(mid - 2, F, z0 + 1, mid + 2, F + 2, z0 + 1, null);
    b.doubleDoor(mid - 2, F, z0, mid - 1, z0, 'dark_oak_door', 's');
    b.doubleDoor(mid + 1, F, z0, mid + 2, z0, 'dark_oak_door', 's');
    b.box(mid - 3, F + 2, z0, mid + 3, F + 2, z0, 'marble');
    b.box(mid - 2, F + 3, z0, mid + 2, F + 6, z0, 'glass_pane');
    b.box(mid, F, z0, mid, F + 6, z0, 'marble');
    b.box(mid - 3, F, z0, mid - 3, F + 6, z0, 'marble');
    b.box(mid + 3, F, z0, mid + 3, F + 6, z0, 'marble');
    b.box(mid - 2, F + 3, z0 + 1, mid + 2, F + 6, z0 + 1, null);
    b.box(mid - 3, F + 7, z0, mid + 3, F + 7, z0, 'marble');
    b.sym(() => {
        b.box(mid - 5, F, z0 - 3, mid - 5, F + 3, z0 - 1, 'stone_bricks');
        b.stairs(mid - 5, F + 4, z0 - 3, 'stone_brick_stairs', 's');
        b.stairs(mid - 5, F + 4, z0 - 2, 'stone_brick_stairs', 's');
        b.set(mid - 5, F + 4, z0 - 1, 'stone_bricks');
        b.lampPost(mid - 4, F, z0 - 3, 'dark_oak_fence', 2);
    });

    // ---- Windows: tall on the hall, lower ones up the floors ----
    const glassThrough = (x, z, y0, y1, dx, dz) => {
        b.box(x, y0, z, x, y1, z, 'glass_pane');
        b.box(x + dx, y0, z + dz, x + dx, y1, z + dz, null);
    };
    b.sym(() => {
        for (let z = iz0 + 8; z <= 74; z += 6) glassThrough(x0, z, F + 2, F + 7, 1, 0);
        for (const z of [79, 83]) glassThrough(x0, z, F + 1, F + 3, 1, 0);
    });
    b.sym(() => {
        for (const [y0, y1] of [[G + 12, G + 14], [G + 18, G + 20]]) {
            for (let z = iz0 + 8; z <= iz1 - 2; z += 6) glassThrough(x0, z, y0, y1, 1, 0);
        }
    });
    for (const [y0, y1] of [[G + 12, G + 14], [G + 18, G + 20]]) {
        for (let x = ix0 + 8; x <= ix1 - 2; x += 6) {
            glassThrough(x, z0, y0, y1, 0, 1);
            glassThrough(x, z1, y0, y1, 0, -1);
        }
    }

    // ---- The great hall ----
    const hallEnd = 74;
    b.box(ix0, F, hallEnd + 1, ix1, G + 9, hallEnd + 1, 'stone_bricks');
    for (let z = iz0; z <= hallEnd; z++) {
        for (let x = ix0; x <= ix1; x++) {
            if ((x + z) % 2) b.set(x, G, z, 'marble');
        }
    }
    b.box(mid - 2, F, iz0 + 2, mid + 2, F, hallEnd - 5, 'red_carpet');
    for (const x of [mid - 2, mid + 2]) b.box(x, F, iz0 + 2, x, F, hallEnd - 5, 'yellow_carpet');
    b.sym(() => {
        // Two long joined tables, chairs along both sides, candles on them.
        for (let z = 60; z <= 69; z++) {
            b.box(mid - 7, F, z, mid - 6, F, z, 'table');
            chair(mid - 8, F, z, 'e');
            chair(mid - 5, F, z, 'w');
            if (z % 2 === 0) b.set(mid - 7, F + 1, z, 'candle');
            if (z % 2 === 1) b.set(mid - 6, F + 1, z, 'candle');
        }
        chair(mid - 7, F, 59, 's');
        chair(mid - 6, F, 70, 'n');
        // Columns with stone bands, a banner on each, sconces between.
        for (const z of [60, 66, 72]) {
            b.box(mid - 13, F, z, mid - 13, G + 9, z, 'limestone');
            b.set(mid - 13, F + 3, z, 'stone_bricks');
            b.set(mid - 13, F + 7, z, 'stone_bricks');
            for (let y = F + 4; y <= F + 6; y++) curtain(mid - 12, y, z, z === 66 ? 'yellow' : 'red', 'e');
        }
        for (const z of [63, 69]) {
            b.set(ix0, F + 2, z, 'stone_bricks');
            b.set(ix0, F + 3, z, 'torch');
        }
        // Three chandeliers each side, on chains.
        for (const z of [62, 68, 73]) chandelier(mid - 5, G + 5, z, 4);
        for (const z of [65, 71]) chandelier(ix0 + 2, G + 6, z, 3);
        // Floor lamps down the side aisle and by the door: chandeliers are high up, this is a tall room.
        for (const [x, z] of [[mid - 10, 65], [mid - 10, 69], [mid - 10, 73], [mid - 8, 58], [ix0 + 1, 73], [mid - 3, 69]]) {
            b.shaped(x, F, z, 'floor_lamp', 'floor_lamp', { half: 'lower' });
            b.shaped(x, F + 1, z, 'floor_lamp', 'floor_lamp', { half: 'upper' });
        }
    });
    chandelier(mid, G + 4, 66, 5);
    chandelier(mid, G + 6, 60, 3);

    // The dais, in two steps, and the throne with a gold back and banners behind it.
    for (let x = mid - 8; x <= mid + 8; x++) {
        b.stairs(x, F, hallEnd - 4, 'stone_brick_stairs', 's');
        b.box(x, F, hallEnd - 3, x, F, hallEnd, 'marble');
        b.stairs(x, F + 1, hallEnd - 2, 'stone_brick_stairs', 's');
        b.box(x, F + 1, hallEnd - 1, x, F + 1, hallEnd, 'marble');
    }
    b.box(mid - 1, F + 2, hallEnd - 1, mid + 1, F + 2, hallEnd - 1, 'red_carpet');
    chair(mid, F + 2, hallEnd, 'n');
    b.box(mid - 1, F + 2, hallEnd, mid - 1, F + 4, hallEnd, 'gold_block');
    b.box(mid + 1, F + 2, hallEnd, mid + 1, F + 4, hallEnd, 'gold_block');
    b.box(mid - 1, F + 5, hallEnd, mid + 1, F + 5, hallEnd, 'gold_block');
    b.box(mid, F + 3, hallEnd, mid, F + 4, hallEnd, 'purple_wool');
    b.sym(() => {
        for (let y = F + 2; y <= F + 7; y++) curtain(mid - 4, y, hallEnd, 'purple', 'n');
        for (let y = F + 2; y <= F + 7; y++) curtain(mid - 7, y, hallEnd, 'red', 'n');
        b.set(mid - 2, F + 2, hallEnd, 'candle');
    });
    sign(mid + 5, F, 58, 's', 'Gran salón', 'Great hall');

    // ---- The kitchen, behind the hall; two doors at the ends of the dais' wall ----
    b.box(ix0, G, hallEnd + 2, ix1, G, iz1, 'brick');
    b.sym(() => {
        b.box(mid - 12, F, hallEnd + 1, mid - 12, F + 2, hallEnd + 1, null);
        b.door(mid - 12, F, hallEnd + 1, 'spruce_door', 's');
        b.set(mid - 12, F + 2, hallEnd + 1, 'stone_bricks');
    });
    // Ovens in a row along the back wall, with a hood of brick over them.
    for (let x = mid - 10; x <= mid + 10; x++) {
        if (x % 3 === 0) b.shaped(x, F, iz1, 'oven', 'oven', { facing: 'n', fire: 'off' });
        else b.set(x, F, iz1, 'brick');
        b.box(x, F + 2, iz1, x, G + 9, iz1, 'brick');
    }
    b.stairs(mid - 11, F + 2, iz1, 'brick_stairs', 'e');
    b.stairs(mid + 11, F + 2, iz1, 'brick_stairs', 'w');
    // A long work table, stools, a sink, barrels, cupboards and a bench to work at.
    for (let x = mid - 8; x <= mid + 8; x++) {
        if (x === mid) continue;
        b.set(x, F, 81, 'table');
        if (x % 4 === 0) b.set(x, F + 1, 81, 'candle');
        if (x % 3 === 1) b.set(x, F, 80, 'stool');
    }
    b.sym(() => {
        piece(ix0, F, 77, 'sink', 'sink', 'e');
        for (const z of [79, 80, 81]) b.set(ix0, F, z, 'barrel');
        for (const z of [83, 84]) piece(ix0, F, z, 'chest', 'chest', 'e');
        b.set(ix0 + 1, F, 86, 'barrel');
        b.set(ix0, F, 86, 'barrel');
        for (const x of [ix0 + 2, ix0 + 8, mid - 5]) {
            for (const z of [78, 84]) chandelier(x, F + 3, z, G + 9 - F - 3);
        }
        chandelier(mid - 11, F + 3, 81, G + 9 - F - 3);
    });
    b.set(mid, F, 78, 'workbench');
    chandelier(mid, F + 3, 79, G + 9 - F - 3);
    chandelier(mid, F + 3, 84, G + 9 - F - 3);
    sign(mid + 3, F, 77, 'n', 'Cocina', 'Kitchen');

    // ---- The bedrooms, floor 10: a corridor along the front, a spine down the middle ----
    const bedFloor = G + 10;
    const bedFeet = bedFloor + 1;
    const ceil = G + 15;
    const corridor = [65, 67];
    const partition = (ax, az, bx, bz) => b.box(ax, bedFeet, az, bx, ceil, bz, 'birch_planks');
    b.box(ix0, bedFloor, corridor[0], ix1, bedFloor, corridor[1], 'spruce_planks');
    b.box(ix0, bedFeet, corridor[0], ix1, bedFeet, corridor[1], 'blue_carpet');
    for (let x = ix0 + 4; x <= ix1; x += 8) chandelier(x, ceil - 2, 66, 2);
    // A room: its walls are drawn from the corridor; light, a bed and what goes with it.
    const bedroom = (rx0, rz0, rx1, rz1, doorX, doorZ, doorFacing, carpet, bedAtX, bedFacing) => {
        b.box(rx0, bedFeet, rz0, rx1, bedFeet, rz1, `${carpet}_carpet`);
        b.box(doorX, bedFeet, doorZ, doorX, bedFeet + 2, doorZ, null);
        b.set(doorX, bedFeet + 2, doorZ, 'birch_planks');
        b.door(doorX, bedFeet, doorZ, 'oak_door', doorFacing);
        const [fx, fz] = SHAPE_DIRECTIONS[bedFacing];
        const zMid = Math.floor((rz0 + rz1) / 2);
        const bedZ = bedFacing === 'n' ? rz0 : bedFacing === 's' ? rz1 : zMid;
        constructionCastleBed(b, bedAtX, bedFeet, bedZ, bedFacing);
        // The bedside table to one side of the head, a lamp on it.
        const [sideX, sideZ] = [bedAtX - fz, bedZ + fx];
        piece(sideX, bedFeet, sideZ, 'bedside_table', 'bedside_table', SHAPE_OPPOSITE[bedFacing]);
        b.set(sideX, bedFeet + 1, sideZ, 'table_lamp');
        chandelier(Math.floor((rx0 + rx1) / 2), ceil - 2, zMid, 2);
        b.shaped(rx1, bedFeet, rz1, 'lantern', 'lantern', { mount: 'floor' });
    };
    // North row, against the front wall, doors on the corridor.
    partition(ix0 + 6, corridor[0] - 1, ix1, corridor[0] - 1);
    partition(ix0 + 6, iz0, ix0 + 6, corridor[0] - 1);
    for (const wx of [59, 68]) partition(wx, iz0, wx, corridor[0] - 1);
    bedroom(51, iz0, 58, 63, 55, 64, 'n', 'green', 54, 'n');
    bedroom(60, iz0, 67, 63, 63, 64, 'n', 'cyan', 61, 'n');
    bedroom(69, iz0, 76, 63, 72, 64, 'n', 'pink', 74, 'n');
    tall(52, bedFeet, 63, 'wardrobe', 's');
    piece(57, bedFeet, 63, 'chest', 'chest', 'n');
    tall(66, bedFeet, 63, 'wardrobe', 's');
    piece(65, bedFeet, 58, 'chest', 'chest', 's');
    tall(70, bedFeet, 63, 'wardrobe', 's');
    piece(70, bedFeet, 58, 'chest', 'chest', 's');
    // South row, across the corridor, each side of the spine to the royal chamber.
    const south = [68, 76];
    partition(ix0, south[0], 58, south[0]);
    partition(62, south[0], ix1, south[0]);
    partition(ix0, south[1] + 1, ix1, south[1] + 1);
    for (const wx of [52, 58, 62, 69]) partition(wx, south[0], wx, south[1] + 1);
    b.box(59, bedFloor, south[0], 61, bedFloor, south[1] + 1, 'dark_oak_planks');
    b.box(59, bedFeet, south[0], 61, bedFeet, south[1], 'blue_carpet');
    chandelier(60, ceil - 2, 72, 2);
    bedroom(44, 69, 51, 76, 48, 68, 's', 'light_blue', 47, 's');
    bedroom(53, 69, 57, 76, 55, 68, 's', 'orange', 55, 's');
    bedroom(63, 69, 68, 76, 65, 68, 's', 'yellow', 65, 's');
    bedroom(70, 69, 76, 76, 73, 68, 's', 'lime', 73, 's');
    tall(44, bedFeet, 71, 'wardrobe', 'e');
    piece(50, bedFeet, 69, 'chest', 'chest', 's');
    tall(53, bedFeet, 71, 'wardrobe', 'e');
    tall(68, bedFeet, 71, 'wardrobe', 'w');
    tall(76, bedFeet, 71, 'wardrobe', 'w');
    piece(70, bedFeet, 69, 'chest', 'chest', 's');
    // The royal chamber, across the back, its door at the end of the spine.
    b.box(ix0, bedFeet, 78, ix1, bedFeet, 86, 'purple_carpet');
    b.box(60, bedFeet, 77, 60, bedFeet + 2, 77, null);
    b.door(60, bedFeet, 77, 'dark_oak_door', 's');
    b.set(60, bedFeet + 2, 77, 'birch_planks');
    for (const x of [mid - 2, mid + 2]) constructionCastleBed(b, x, bedFeet, iz1, 's');
    piece(mid, bedFeet, iz1, 'bedside_table', 'bedside_table', 'n');
    b.set(mid, bedFeet + 1, iz1, 'table_lamp');
    b.sym(() => {
        for (const x of [mid - 5, mid - 9]) {
            for (const y of [bedFeet + 1, bedFeet + 2]) curtain(x, y, iz1, 'purple', 'n');
        }
        tall(ix0, bedFeet, 82, 'wardrobe', 'e');
        piece(ix0, bedFeet, 84, 'chest', 'chest', 'e');
        chandelier(ix0 + 3, ceil - 2, 83, 2);
        chandelier(mid - 8, ceil - 2, 83, 2);
        chandelier(mid - 6, ceil - 2, 79, 2);
        chandelier(mid - 3, ceil - 2, 82, 2);
    });
    chandelier(ix1 - 3, ceil - 2, 79, 2);
    piece(ix0 + 3, bedFeet, 79, 'desk', 'desk', 'n');
    chair(ix0 + 3, bedFeet, 80, 'n');
    b.set(ix0 + 3, bedFeet + 1, 79, 'table_lamp');
    b.set(ix1 - 2, bedFeet, 80, 'stool');
    piece(mid + 4, bedFeet + 2, 77 + 1, 'painting_sunset', 'painting', 's');
    piece(mid - 4, bedFeet + 2, 77 + 1, 'painting_peaks', 'painting', 's');

    // ---- The library, floor 16: rows of shelves, desks, and the armoury behind an iron door ----
    const libFloor = G + 16;
    const libFeet = libFloor + 1;
    const libCeil = G + 21;
    b.box(ix0, libFloor, iz0, ix1, libFloor, iz1, 'spruce_planks');
    b.box(ix0 + 6, libFloor, 58, ix1, libFloor, 73, 'dark_oak_planks');
    b.box(mid - 2, libFeet, iz0, mid + 2, libFeet, 73, 'red_carpet');
    b.sym(() => {
        for (const z of [60, 64, 68, 72]) {
            // The first row stops short of the stair's corner.
            for (let x = z === 60 ? mid - 9 : mid - 12; x <= mid - 4; x++) shelves(x, libFeet, z, z % 8 ? 's' : 'n');
            // The last aisle ends at the armoury's wall (z 74).
            chandelier(mid - 8, libCeil - 2, Math.min(z + 2, 73), 2);
            if (z > 60) chandelier(ix0 + 2, libCeil - 2, z, 2);
        }
        chandelier(mid - 3, libCeil - 2, 60, 2);
        chandelier(mid - 3, libCeil - 2, 68, 2);
    });
    chandelier(ix1 - 3, libCeil - 2, 58, 2);
    chandelier(mid - 8, libCeil - 2, 58, 2);
    for (const z of [62, 70]) {
        piece(mid, libFeet, z, 'desk', 'desk', 'n');
        chair(mid, libFeet, z + 1, 'n');
        b.set(mid, libFeet + 1, z, 'table_lamp');
    }
    sign(mid + 2, libFeet, 59, 's', 'Biblioteca', 'Library');
    // The armoury.
    b.box(ix0, libFeet, 74, ix1, libCeil, 74, 'stone_bricks');
    b.box(mid, libFeet, 74, mid, libFeet + 1, 74, null);
    b.door(mid, libFeet, 74, 'iron_door', 's');
    b.box(ix0, libFloor, 75, ix1, libFloor, iz1, 'stone_bricks');
    b.sym(() => {
        for (let x = ix0; x <= mid - 2; x += 2) {
            piece(x, libFeet, iz1, 'chest', 'chest', 'n');
            piece(x + 1, libFeet, iz1, 'barrel', 'barrel', 'n');
        }
        for (const z of [76, 79, 82]) {
            piece(ix0, libFeet, z, 'chest', 'chest', 'e');
            piece(ix0, libFeet + 1, z + 1, 'wall_shelf', 'wall_shelf', 'e');
            b.set(ix0, libFeet, z + 1, 'stone_bricks');
        }
        // Racks of iron down the middle.
        for (const z of [78, 82]) {
            b.box(mid - 12, libFeet, z, mid - 4, libFeet, z, 'iron_bars');
            b.box(mid - 12, libFeet + 1, z, mid - 4, libFeet + 1, z, 'dark_oak_fence');
            chandelier(mid - 8, libCeil - 2, z + 2, 2);
            chandelier(mid - 2, libCeil - 2, z, 2);
            chandelier(ix0 + 2, libCeil - 2, z, 2);
        }
        chandelier(mid - 7, libCeil - 2, 76, 2);
    });
    sign(mid + 2, libFeet, 76, 's', 'Armería', 'Armoury');

    // ---- The chapel, floor 22: a tall nave, pews, an altar and stained glass all round ----
    const chapelFloor = G + 22;
    const nave = chapelFloor + 1;
    const vault = roofY - 1;
    b.box(ix0, chapelFloor, iz0, ix1, chapelFloor, iz1, 'stone_bricks');
    for (let z = iz0; z <= iz1; z++) {
        for (let x = mid - 4; x <= mid + 4; x++) b.set(x, chapelFloor, z, (x + z) % 2 ? 'marble' : 'basalt');
    }
    b.box(mid - 1, nave, iz0 + 1, mid + 1, nave, 81, 'red_carpet');
    const lancets = ['red', 'blue', 'yellow', 'green', 'purple', 'cyan'];
    b.sym(() => {
        lancets.forEach((color, i) => {
            const z = 61 + i * 4;
            for (const x of [x0, x0 + 1]) {
                const accent = lancets[(i + 2) % lancets.length];
                b.box(x, nave + 2, z, x, nave + 8, z, `${color}_stained_glass`);
                b.set(x, nave + 5, z, `${accent}_stained_glass`);
                b.set(x, nave + 9, z, `${accent}_stained_glass`);
            }
        });
        for (let z = 60; z <= 80; z += 3) {
            for (let x = mid - 9; x <= mid - 3; x++) b.stairs(x, nave, z, 'dark_oak_stairs', 'n');
        }
        for (const z of [62, 68, 74, 80]) {
            b.box(ix0 + 1, nave, z, ix0 + 1, nave + 9, z, 'limestone');
            chandelier(mid - 7, nave + 5, z, vault - nave - 5);
        }
        for (let z = 60; z <= 84; z += 4) b.lampPost(ix0 + 3, nave, z, 'dark_oak_fence', 1);
        // Candle stands at the ends of the pews, along the aisle, and in front of the first row.
        for (let z = 61; z <= 79; z += 6) b.lampPost(mid - 2, nave, z, 'dark_oak_fence', 1);
        b.lampPost(mid - 7, nave, 58, 'dark_oak_fence', 1);
    });
    // The altar on its steps, candles, a cross of gold, and the rose above.
    for (let x = mid - 8; x <= mid + 8; x++) {
        b.stairs(x, nave, 82, 'stone_brick_stairs', 's');
        b.box(x, nave, 83, x, nave, iz1, 'marble');
    }
    b.box(mid - 2, nave + 1, 84, mid + 2, nave + 1, 84, 'marble');
    b.box(mid - 2, nave + 2, 84, mid + 2, nave + 2, 84, 'stone_bricks_slab');
    for (const x of [mid - 2, mid + 2]) b.set(x, nave + 3, 84, 'candle');
    b.box(mid, nave + 1, iz1, mid, nave + 6, iz1, 'gold_block');
    b.box(mid - 1, nave + 4, iz1, mid + 1, nave + 4, iz1, 'gold_block');
    b.sym(() => {
        b.lampPost(mid - 4, nave + 1, 85, 'dark_oak_fence', 1);
        b.set(mid - 2, nave + 1, 86, 'candle');
    });
    const roseColors = ['red', 'blue', 'yellow', 'green', 'purple', 'cyan', 'orange', 'magenta'];
    const roseY = nave + 8;
    for (let y = roseY - 3; y <= roseY + 3; y++) {
        for (let x = mid - 3; x <= mid + 3; x++) b.set(x, y, iz1 + 1, 'air');
    }
    for (let y = roseY - 5; y <= roseY + 3; y++) {
        for (let x = mid - 6; x <= mid + 6; x++) {
            const d = Math.hypot(x - mid, y - roseY);
            if (d > 5.4) continue;
            const sector = Math.floor(((Math.atan2(y - roseY, x - mid) + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 8;
            let type = 'stone_bricks';
            if (d < 1) type = 'neon_lamp';
            else if (d < 2.5) type = `${roseColors[sector]}_stained_glass`;
            else if (d < 4.4) type = `${roseColors[(sector + 3) % 8]}_stained_glass`;
            b.set(x, y, z1, type);
            b.set(x, y, z1 - 1, d < 4.4 ? 'air' : type);
        }
    }
    // The same on the front wall, smaller, and light from it.
    for (let y = roseY - 3; y <= roseY + 3; y++) {
        for (let x = mid - 3; x <= mid + 3; x++) {
            const d = Math.hypot(x - mid, y - roseY);
            if (d > 3.4) continue;
            b.set(x, y, z0, d < 1 ? 'argon_lamp' : `${roseColors[(x + y + 40) % 8]}_stained_glass`);
            b.set(x, y, z0 + 1, 'air');
        }
    }
    sign(mid + 3, nave, 59, 's', 'Capilla', 'Chapel');

    // ---- The stair: in the first corner, its own walls, doors on each floor; after the rooms, as it cuts through them ----
    b.box(ix0, G - 5, iz0, ix0 + 4, roofY, iz0 + 4, 'air');
    b.box(ix0 - 2, G - 6, iz0 - 2, ix0 + 6, G - 6, iz0 + 6, 'basalt');
    for (let y = G - 5; y <= roofY; y++) {
        for (let z = iz0 - 2; z <= iz0 + 5; z++) {
            b.set(ix0 + 5, y, z, 'stone_bricks');
            if (y < G) {
                b.set(ix0 - 1, y, z, 'stone_bricks');
                b.set(ix0 - 2, y, z, 'stone_bricks');
            }
        }
        for (let x = ix0 - 2; x <= ix0 + 5; x++) {
            b.set(x, y, iz0 + 5, 'stone_bricks');
            if (y < G) {
                b.set(x, y, iz0 - 1, 'stone_bricks');
                b.set(x, y, iz0 - 2, 'stone_bricks');
            }
        }
    }
    constructionCastleSpiral(b, ix0, iz0, G - 6, roofY, 'stone_brick_stairs', 'stone_bricks');
    b.set(ix0 + 2, G - 5, iz0 + 4, 'torch');
    for (let y = G - 4; y <= roofY; y += 8) {
        b.set(ix0, y + 3, iz0 + 1, 'torch');
        b.set(ix0 + 4, y + 7 > roofY ? y + 1 : y + 7, iz0 + 4, 'torch');
    }
    const door = (x, feet, z, facing, base = 'spruce_door') => {
        b.box(x, feet, z, x, feet + 2, z, null);
        b.set(x, feet + 2, z, 'stone_bricks');
        b.door(x, feet, z, base, facing);
    };
    door(ix0 + 1, G - 5, iz0 + 5, 's', 'iron_door');
    door(ix0 + 5, F, iz0 + 3, 'e');
    door(ix0 + 1, G + 11, iz0 + 5, 's');
    door(ix0 + 5, G + 17, iz0 + 3, 'e');
    door(ix0 + 5, G + 23, iz0, 'e');
    door(ix0 + 1, roofY + 1, iz0 + 5, 's');

    // ---- The roof: a walk, the parapet on corbels all round, a turret at each corner, a slate roof ----
    const parapet = roofY + 1;
    for (let x = x0 - 1; x <= x1 + 1; x++) {
        for (let z = z0 - 1; z <= z1 + 1; z++) {
            const rim = x === x0 - 1 || x === x1 + 1 || z === z0 - 1 || z === z1 + 1;
            if (!rim) {
                if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && (x <= x0 + 1 || x >= x1 - 1 || z <= z0 + 1 || z >= z1 - 1)) b.set(x, roofY, z, 'stone_bricks');
                continue;
            }
            const inn = x === x0 - 1 ? 'e' : x === x1 + 1 ? 'w' : z === z0 - 1 ? 's' : 'n';
            b.stairs(x, roofY - 1, z, 'stone_brick_stairs', inn, 'top');
            b.set(x, roofY, z, 'stone_bricks');
            b.set(x, parapet, z, 'limestone');
            if ((x + z + 120) % 4 < 2) b.box(x, parapet + 1, z, x, parapet + 2, z, 'stone_bricks');
        }
    }
    // The turrets, hollow; the one with the stair has its door onto the walk.
    b.sym(() => {
        for (const [tz0, tz1] of [[z0, z0 + 7], [z1 - 7, z1]]) {
            for (let y = parapet; y <= roofY + 10; y++) {
                for (let z = tz0; z <= tz1; z++) {
                    for (let x = x0; x <= x0 + 7; x++) {
                        const edge = x === x0 || x === x0 + 7 || z === tz0 || z === tz1;
                        if (edge) b.set(x, y, z, y === roofY + 10 ? 'stone_bricks' : 'limestone');
                    }
                }
            }
            b.box(x0, roofY + 11, tz0, x0 + 7, roofY + 11, tz1, 'slate');
            // Slits.
            for (const y of [roofY + 4, roofY + 7]) {
                b.box(x0 + 3, y, tz0, x0 + 4, y + 1, tz0, 'iron_bars');
                b.box(x0, y, tz0 + 3, x0, y + 1, tz0 + 4, 'iron_bars');
            }
            const r = 4;
            for (let k = 0; k <= r; k++) {
                b.walls(x0 + k, roofY + 12 + k * 2, tz0 + k, x0 + 7 - k, roofY + 12 + k * 2, tz1 - k, 'slate');
                b.walls(x0 + k, roofY + 13 + k * 2, tz0 + k, x0 + 7 - k, roofY + 13 + k * 2, tz1 - k, 'slate');
            }
        }
    });
    b.box(ix0, roofY + 1, iz0, ix0 + 4, roofY + 9, iz0 + 4, null);
    constructionCastleFlagsOnTurrets(b, x0, x1, z0, z1, roofY);
    door(ix0 + 1, roofY + 1, iz0 + 5, 's');
    b.set(ix0, roofY + 3, iz0 + 1, 'torch');
    b.set(ix0 + 4, roofY + 3, iz0 + 3, 'torch');

    // The slate roof over the chapel, hipped, with its finial.
    for (let k = 0; k <= 10; k++) {
        const y = parapet + k;
        const [rx0, rx1, rz0, rz1] = [50 + k, 70 - k, 60 + k, 84 - k];
        for (let x = rx0; x <= rx1; x++) {
            b.stairs(x, y, rz0, 'stone_brick_stairs', 's');
            b.stairs(x, y, rz1, 'stone_brick_stairs', 'n');
        }
        for (let z = rz0; z <= rz1; z++) {
            b.stairs(rx0, y, z, 'stone_brick_stairs', 'e');
            b.stairs(rx1, y, z, 'stone_brick_stairs', 'w');
        }
        for (const x of [rx0, rx1]) {
            for (const z of [rz0, rz1]) b.set(x, y, z, 'slate');
        }
        if (k < 10) {
            for (let x = rx0 + 1; x < rx1; x++) {
                for (const z of [rz0 + 1, rz1 - 1]) b.set(x, y, z, 'slate');
            }
            for (let z = rz0 + 1; z < rz1; z++) {
                for (const x of [rx0 + 1, rx1 - 1]) b.set(x, y, z, 'slate');
            }
        }
    }
    b.box(mid, parapet + 10, 70, mid, parapet + 10, 74, 'slate');
    b.set(mid, parapet + 11, 72, 'gold_block');
    constructionCastleFlag(b, mid, parapet + 12, 72, 'purple');
    sign(52, parapet, 58, 'n', 'Almenas', 'Battlements');
}

function constructionCastleFlagsOnTurrets(b, x0, x1, z0, z1, roofY) {
    const top = roofY + 22;
    for (const [x, z, color] of [[x0 + 3, z0 + 3, 'red'], [x1 - 3, z0 + 3, 'blue'], [x0 + 3, z1 - 3, 'blue'], [x1 - 3, z1 - 3, 'red']]) {
        constructionCastleFlag(b, x, top - 2, z, color);
    }
}

// The dungeon: dug out under the hall, a corridor with iron-barred cells either side.
function constructionCastleDungeon(b, sign) {
    const G = CASTLE_GROUND;
    const floor = G - 6;
    const feet = floor + 1;
    const ceil = G - 1;
    const [x0, x1, z0, z1] = [44, 70, 64, 78];
    b.box(x0 - 1, floor, z0 - 1, x1 + 1, ceil, z1 + 1, 'stone_bricks');
    b.box(x0, floor, z0, x1, floor, z1, 'cobblestone');
    b.box(x0, feet, z0, x1, ceil - 1, z1, 'air');
    const corridor = [70, 72];
    const lantern = (x, z) => b.shaped(x, ceil - 1, z, 'lantern', 'lantern', { mount: 'hanging' });
    b.box(x0, feet, 64, x0 + 3, ceil - 1, 72, 'air');
    b.box(x0 + 4, feet, z0, x1, ceil - 1, corridor[0] - 1, 'stone_bricks');
    b.box(x0 + 4, feet, corridor[1] + 1, x1, ceil - 1, z1, 'stone_bricks');
    b.box(x0, feet, corridor[1] + 1, x0 + 3, ceil - 1, z1, 'stone_bricks');
    // Cells of 4 x 4, on both sides of the corridor, each behind a wall of bars and a door of iron.
    for (let x = x0 + 5; x + 3 <= x1 - 1; x += 5) {
        for (const [z, door, facing] of [[65, corridor[0] - 1, 'n'], [corridor[1] + 2, corridor[1] + 1, 's']]) {
            b.box(x, feet, z, x + 3, ceil - 1, z + 3, 'air');
            b.box(x, feet, door, x + 3, feet + 2, door, 'iron_bars');
            b.box(x + 1, feet, door, x + 1, feet + 1, door, null);
            b.door(x + 1, feet, door, 'iron_door', facing);
            b.set(x + 1, feet + 2, door, 'iron_bars');
            b.set(x + 3, feet, facing === 'n' ? z : z + 3, 'white_wool');
            lantern(x + 1, z + 1);
            lantern(x + 2, z + 2);
        }
    }
    for (let x = x0 + 2; x <= x1; x += 6) lantern(x, 71);
    lantern(x0 + 2, 66);
    b.box(x1 - 1, feet, corridor[0], x1, feet, corridor[1], 'cobblestone');
    b.set(x0 + 3, feet, 65, 'barrel');
    sign(x0 + 2, feet, 69, 's', 'Mazmorra', 'Dungeon');
}

// Everything drawn in the local box. Order matters: what comes later replaces what is there.
function constructionCastle(b) {
    const G = CASTLE_GROUND;
    const F = G + 1;
    const mid = CASTLE_MID;
    // A short sign, on its post: Spanish, then English. `facing` is the way it looks.
    const sign = (x, y, z, facing, es, en) => b.set(x, y, z, shapeStateName('sign', BLOCK_SHAPES.sign, { facing, mount: 'post' }), { t: `${es} // ${en}` });

    constructionCastleMoat(b);

    // ---- The curtain walls, between the towers ----
    const [front, back, west, east] = CASTLE_SIDES;
    constructionCastleCurtain(b, front, 31, 44);
    constructionCastleCurtain(b, front, 76, 89);
    constructionCastleCurtain(b, back, 31, 53);
    constructionCastleCurtain(b, back, 67, 89);
    constructionCastleCurtain(b, west, 31, 53);
    constructionCastleCurtain(b, west, 67, 89);
    constructionCastleCurtain(b, east, 31, 53);
    constructionCastleCurtain(b, east, 67, 89);

    // ---- The towers: four at the corners, walkable on top; three in the middle of the sides, roofed ----
    const low = 24;
    const high = CASTLE_SIZE - 1 - low;
    const walk = F + 12;
    for (const [cx, cz, sx, sz, flag] of [[low, low, -1, -1, 'red'], [high, low, 1, -1, 'blue'], [low, high, -1, 1, 'blue'], [high, high, 1, 1, 'red']]) {
        constructionCastleTower(b, cx, cz, { flag });
        // Onto the two wall walks, and into the two galleries.
        const toZ = [5, 6].flatMap((d) => [1, 2, 3].map((k) => [cx + sx * (k - 1), cz - sz * d]));
        const toX = [5, 6].flatMap((d) => [1, 2, 3].map((k) => [cx - sx * d, cz + sz * (k - 1)]));
        constructionCastleOpening(b, toZ, walk, 3);
        constructionCastleOpening(b, toX, walk, 3);
        constructionCastleOpening(b, [5, 6].map((d) => [cx - sx, cz - sz * d]), F, 2);
        constructionCastleOpening(b, [5, 6].map((d) => [cx - sx * d, cz - sz]), F, 2);
        // The door, from the courtyard.
        const doorZ = cz - sz * 3;
        b.box(cx - sx * 5, F, doorZ, cx - sx * 6, F + 1, doorZ, null);
        b.door(cx - sx * 6, F, doorZ, 'dark_oak_door', sx < 0 ? 'w' : 'e');
    }
    for (const [cx, cz, along, facing, flag] of [[22, mid, 'z', 'w', 'yellow'], [CASTLE_SIZE - 1 - 22, mid, 'z', 'e', 'yellow'], [mid, CASTLE_SIZE - 1 - 22, 'x', 's', 'yellow']]) {
        constructionCastleTower(b, cx, cz, { roof: true, flag });
        const [dx, dz] = SHAPE_DIRECTIONS[facing];
        for (const side of [-1, 1]) {
            for (const d of [5, 6]) {
                for (const k of [-1, 0, 1]) {
                    const [x, z] = along === 'z' ? [cx + k, cz + side * d] : [cx + side * d, cz + k];
                    constructionCastleOpening(b, [[x, z]], walk, 3);
                }
                const [gx, gz] = along === 'z' ? [cx - dx, cz + side * d] : [cx + side * d, cz - dz];
                constructionCastleOpening(b, [[gx, gz]], F, 2);
            }
        }
        // The door, from the courtyard: the side opposite its facing.
        b.box(cx - dx * 5, F, cz - dz * 5, cx - dx * 6, F + 1, cz - dz * 6, null);
        b.door(cx - dx * 6, F, cz - dz * 6, 'dark_oak_door', facing);
    }

    constructionCastleGate(b);
    // The walks from the gate towers along the front wall, and the galleries.
    for (const cx of [mid - 9, mid + 9]) {
        const side = cx < mid ? -1 : 1;
        for (const d of [5, 6]) {
            for (const z of [21, 22, 23]) constructionCastleOpening(b, [[cx + side * d, z]], walk, 3);
            constructionCastleOpening(b, [[cx + side * d, 23]], F, 2);
        }
        b.box(cx, F, 28, cx, F + 1, 27, null);
        b.door(cx, F, 28, 'dark_oak_door', 'n');
    }
    for (const x of [mid - 9, mid + 9]) b.box(x, F, 27, x, F + 1, 27, null);

    constructionCastleCourtyard(b, sign);
    constructionCastleDungeon(b, sign);
    constructionCastleKeep(b, sign);

    sign(mid - 4, F, 10, 'n', 'Castillo', 'Castle');
}

// Where the castle goes on the land. The ground is levelled at the middle height of the site, within
// reach of a walkable road from where the player stands; the rim is graded from that level to the
// terrain at the edge of the box, cutting into hills and building up over valleys, so no wall of earth
// shows; a site that would take too much earth, or is mostly water, is refused before any block moves.
function* constructionCastleSite({ readType, blockTypes, min, size, turns, anchor, fromY }) {
    const [w, , d] = size;
    const G = CASTLE_GROUND;
    const label = 'Castle';
    const scanTop = Math.min(WORLD_MAX_Y, fromY + 80);
    const heights = new Int16Array(w * d);
    const counts = new Map();
    let waterColumns = 0;
    for (let z = 0; z < d; z++) {
        for (let x = 0; x < w; x++) {
            let y = scanTop;
            let type = null;
            for (; y >= WORLD_MIN_Y; y--) {
                type = readType(min.x + x, y, min.z + z);
                if (type === 'water' || constructionIsGround(type, blockTypes)) break;
            }
            if (y === scanTop && type !== 'water') return { refuse: `${label}: there is a mountain in the way. Find open ground` };
            heights[z * w + x] = y;
            if (type === 'water') waterColumns++;
            counts.set(y, (counts.get(y) || 0) + 1);
        }
        yield;
    }
    if (waterColumns > CASTLE_MAX_WATER * w * d) return { refuse: `${label}: this is mostly water (${Math.round((100 * waterColumns) / (w * d))} %). Find a shore, or dry ground` };

    const anchorGround = constructionFindGround(readType, anchor.x, anchor.z, fromY, blockTypes);
    if (anchorGround === null) return { refuse: `${label}: there is no ground ahead of you` };
    let seen = 0;
    let middle = anchorGround;
    for (const y of [...counts.keys()].sort((a, b) => a - b)) {
        seen += counts.get(y);
        if (seen * 2 >= w * d) {
            middle = y;
            break;
        }
    }
    // The road climbs one a column at most.
    const reach = CASTLE_RIM - 2;
    const level = Math.max(anchorGround - reach, Math.min(anchorGround + reach, middle));
    const baseY = level - G;

    let earth = 0;
    let relief = 0;
    for (let i = 0; i < heights.length; i++) {
        earth += Math.abs(heights[i] - level);
        relief = Math.max(relief, Math.abs(heights[i] - level));
    }
    if (relief > CASTLE_MAX_RELIEF) return { refuse: `${label}: the land here rises or falls ${relief} blocks from the castle's level. Find flatter ground` };
    if (earth > CASTLE_MAX_EARTH) return { refuse: `${label}: levelling this site means moving ${earth} blocks of earth. Find flatter ground` };

    const [fx, fz] = SHAPE_DIRECTIONS[CONSTRUCTION_FACINGS[(CONSTRUCTION_FACINGS.indexOf('s') + turns) % 4]];
    const stairs = (facing) => constructionTurnType(shapeStateName('cobblestone_stairs', BLOCK_SHAPES.stairs, { facing, half: 'bottom' }), turns, blockTypes);
    // The road's height at a local z: from the terrain where the player stands up or down to the level.
    const roadTop = (z) => Math.round(anchorGround + ((level - anchorGround) * (z + 1)) / (CASTLE_RIM + 1));
    const grade = (x, z) => {
        const lx = x - min.x;
        const lz = z - min.z;
        const rim = Math.min(lx, w - 1 - lx, lz, d - 1 - lz);
        if (rim >= CASTLE_RIM) return null;
        // In local terms: how far in from the near edge, and across its middle.
        const away = fx * (x - anchor.x) + fz * (z - anchor.z);
        const across = fz * (x - anchor.x) - fx * (z - anchor.z);
        if (away >= 0 && away < CASTLE_RIM && Math.abs(across) <= 2) {
            const top = roadTop(away);
            const up = roadTop(away - 1) < top;
            const down = roadTop(away + 1) < top;
            return { top, type: up ? stairs('s') : down ? stairs('n') : 'cobblestone', keep: false, soil: 'dirt' };
        }
        const ground = heights[lz * w + lx];
        const top = Math.round(level + ((ground - level) * (CASTLE_RIM - rim)) / (CASTLE_RIM + 1));
        return { top, type: 'grass', keep: top === ground, soil: 'dirt' };
    };
    return { baseY, grade };
}

CONSTRUCTION_DESIGNS.castle = {
    label: 'Castle',
    size: [CASTLE_SIZE, CASTLE_HEIGHT, CASTLE_SIZE],
    foundation: 'dirt',
    anchorX: CASTLE_MID,
    groundY: CASTLE_GROUND,
    rate: 480,
    start: [CASTLE_MID, CASTLE_GROUND + 1, 1],
    levels: [],
    site: constructionCastleSite,
    generate: constructionCastle
};
