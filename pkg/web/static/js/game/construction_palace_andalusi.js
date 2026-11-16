// /build palace_andalusi: a Nasrid palace in the desert, in the spirit of the Alhambra (not a copy of it).
// Loaded after construction_palace_common.js; it only adds an entry to CONSTRUCTION_DESIGNS. Everything of
// this palace lives in this file (and test/js/construction_palace_andalusi.test.js).
//
// Outside it is plain and low, as the Nasrid palaces were: a wall of sandstone and red lime with square
// crenellated towers, and one taller tower, the Comares kind, holding the throne hall. The beauty is
// inside, in courtyards that follow one another along axes that turn, never one symmetric block:
//   the gate (the middle of the near side) -> the entry court -> the lane (Calle Real) going west ->
//   the Court of the Myrtles, long, its pool between two hedges, running away from the gate to the
//   Comares tower -> beside it, at a right angle, the Court of the Lions, crossways, with its fountain and
//   four channels -> beyond, up three terraces, the garden (after the Generalife).
// Local coordinates as every design (constructions.js): x across, z away from the player (local 's' is
// deeper in, 'n' back towards the gate), y up. y = G is the ground layer, the ground floor stands on it
// (feet at G + 1); the upper storey has its floor at U = G + 6. Rooms are drawn by their inside: room()
// puts its walls one block round it, so two rooms with one block between them share that wall.
//
// The plan, ground floor (z grows upwards here, the gate is at the bottom):
//
//   z 125 |          [ Comares tower: throne hall ]                                     |
//         |  west    [ x 40-60, z 102-121          ] stair  store / treasury | garden: three terraces
//         |  wing:   [ Sala de la Barca  z 96-99   ] well   (library above)  | going up away from the gate,
//         |  kitchen,  north portico                vestibule                | orange trees, a channel,
//         |  stores,   COURT OF THE MYRTLES          baths (hammam)          | a pergola, a mirador
//         |  servants, pool and hedges, x 38-62      ------------------------+---------------------------
//         |  stair,                                  Hall of Tilings | Two Sisters (audience hall)
//         |  harem     south portico                 (science room)  | COURT OF THE LIONS  | Hall of Kings
//         |  (bedrooms above)                                        | x 87-109, z 57-71   | (banquet)
//         |                                                          | Abencerrajes, music room, pantry
//   z 39  |--------------------------- the lane (Calle Real) ---------------------------------------|
//         | oratory | Mexuar (council) | entry court, gate tower | guards | stables                     |
//   z 22  +------------------------------------ x 70: the gate --------------------------------------+
//
// Every floor is reached by stairs (no ladders): the west wing, the gate tower and the rooms south of the
// Court of the Lions have a straight flight to their upper storey, and a stair well beside the Comares
// tower climbs to the library and on to the tower's roof. Rooms are lit by hanging lamps on chains (a
// chandelier three blocks over the floor), lanterns and candles; each chest is stocked
// (constructionPalaceChest). The science room is the Hall of Tilings: four floors of the wallpaper
// symmetries, an astrolabe, a globe and a chest with star charts, and a sundial in the Court of the Lions.

const PALACE_ANDALUSI_SIZE = [141, 44, 141];
const PALACE_ANDALUSI_GROUND = 6;
const PALACE_ANDALUSI_UPPER = PALACE_ANDALUSI_GROUND + 6;
const PALACE_ANDALUSI_RIM = 12;
const PALACE_ANDALUSI_MID = 70;
// The outer walls: sandstone with patches of the red lime that gave the Alhambra its name ("the red one").
const PALACE_ANDALUSI_OUTER = [['sandstone', 70], ['red_stucco', 16], ['cut_sandstone', 14]];

// The glazed tile dados (zellige), by scheme: the tile at u along a wall, at height rel (1 or 2) over the floor.
const PALACE_ANDALUSI_DADOS = {
    blue: (u, rel) => (u % 6 === 0 ? 'green_glazed_tile' : (u + rel) % 2 ? 'blue_glazed_tile' : 'white_glazed_tile'),
    green: (u, rel) => (rel === 1 ? 'green_glazed_tile' : u % 3 === 1 ? 'yellow_glazed_tile' : 'white_glazed_tile'),
    turquoise: (u, rel) => (u % 4 === 0 ? 'blue_glazed_tile' : (u + rel) % 2 ? 'turquoise_glazed_tile' : 'white_glazed_tile'),
    royal: (u, rel) => `${rel === 1 ? ['blue', 'white', 'green', 'white'][u % 4] : ['white', 'turquoise', 'white', 'yellow'][u % 4]}_glazed_tile`,
    plain: (u, rel) => (rel === 1 ? 'cut_sandstone' : 'white_stucco')
};

// The things of js/game/tabletop.js that look the same from every side (placed without a facing).
const PALACE_ANDALUSI_TABLETOP_FLAT = new Set(['meal_plate', 'fruit_bowl', 'jug']);

// Eight-pointed stars on a grid of 7 (the symmetry the Hall of Tilings calls p4m): `c` gives the colours of
// the star, its heart, the small cross where four stars meet, and the ground between them.
function constructionPalaceAndalusiStar(x, z, c) {
    const dx = Math.abs((((x % 7) + 7) % 7) - 3);
    const dz = Math.abs((((z % 7) + 7) % 7) - 3);
    if (dx <= 1 && dz <= 1) return dx + dz === 0 ? c.heart : c.star;
    if ((dx === 0 || dz === 0) && dx + dz <= 3) return c.star;
    if (dx === 2 && dz === 2) return c.star;
    if (dx === 3 && dz === 3) return c.cross;
    return c.ground;
}

// The four floors of the Hall of Tilings: one motif with no symmetry of its own (a crooked hook in 4 x 4),
// repeated in the ways of four of the 17 wallpaper groups. True where the motif is.
const PALACE_ANDALUSI_MOTIF = new Set(['0,0', '1,0', '2,0', '0,1', '0,2', '1,2']);
function constructionPalaceAndalusiWallpaper(group, x, z) {
    const m = (v, n) => ((v % n) + n) % n;
    let a = m(x, 4);
    let c = m(z, 4);
    const cx = Math.floor(x / 4);
    const cz = Math.floor(z / 4);
    if (group === 'pm' && m(cx, 2) === 1) a = 3 - a;
    if (group === 'p2' && m(cx + cz, 2) === 1) {
        a = 3 - a;
        c = 3 - c;
    }
    if (group === 'p4') {
        const turns = [[0, 1], [3, 2]][m(cz, 2)][m(cx, 2)];
        for (let k = 0; k < turns; k++) [a, c] = [3 - c, a];
    }
    return PALACE_ANDALUSI_MOTIF.has(`${a},${c}`);
}

// A sign of the science room: a short title on the board, then a sentence or two in Spanish and English
// for the reader (as the lab's, construction_lab.js).
function constructionPalaceAndalusiSign(b, x, y, z, facing, title, es, en) {
    b.set(x, y, z, shapeStateName('sign', BLOCK_SHAPES.sign, { facing: b.facing(facing), mount: 'post' }), { t: `${title} // ${es} // ${en}` });
}

// The drawing tools the parts of the palace share, bound to one builder.
function constructionPalaceAndalusiTools(b) {
    const G = PALACE_ANDALUSI_GROUND;
    const [W, H, D] = b.size;
    const f = constructionFurnisher(b);
    const has = (x, y, z) => b.cells.has((y * D + z) * W + x);
    const outer = (x, y, z) => constructionPalacePick(PALACE_ANDALUSI_OUTER, x, y, z, 5);
    // The face of a decorated wall: tiles to rel 2, a carved band at 3, stucco, a carved cornice under the ceiling.
    const wallAt = (scheme, x, y, z, floorY, top) => {
        const rel = y - floorY;
        if (rel <= 0) return 'cut_sandstone';
        if (rel <= 2) return PALACE_ANDALUSI_DADOS[scheme](x + z, rel);
        if (rel === 3 || y === top) return 'cut_sandstone';
        return 'white_stucco';
    };
    const t = {
        f, has, outer, wallAt,
        put: constructionPalacePut(b),
        // A room by its inside, x0..x1 by z0..z1, its floor at layer y and its ceiling at y + h: walls one
        // block round it, emptied inside. floor and ceiling are a type or a function of (x, z).
        room(x0, z0, x1, z1, { y = G, h = 6, scheme = 'blue', floor = 'marble', ceiling = 'dark_oak_planks' } = {}) {
            for (let z = z0 - 1; z <= z1 + 1; z++) {
                for (let x = x0 - 1; x <= x1 + 1; x++) {
                    const wall = x < x0 || x > x1 || z < z0 || z > z1;
                    for (let yy = y + 1; yy < y + h; yy++) b.set(x, yy, z, wall ? wallAt(scheme, x, yy, z, y, y + h - 1) : null);
                    b.set(x, y, z, wall ? 'cut_sandstone' : typeof floor === 'function' ? floor(x, z) : floor);
                    b.set(x, y + h, z, wall ? 'cut_sandstone' : typeof ceiling === 'function' ? ceiling(x, z) : ceiling);
                }
            }
        },
        // An opening through a wall. along 'x': the wall runs along x and the opening covers x..x+width-1,
        // z..z+depth-1; along 'z' the other way round. Open to rel height - 1, then a pointed top of
        // upside-down stairs (an arch). door: a door type for the cells at depth doorAt.
        arch(x, z, along, width, floorY, { height = 3, depth = 1, door = null, doorAt = 0 } = {}) {
            const at = (i, d) => (along === 'x' ? [x + i, z + d] : [x + d, z + i]);
            for (let d = 0; d < depth; d++) {
                for (let i = 0; i < width; i++) {
                    const [cx, cz] = at(i, d);
                    const dist = Math.min(i, width - 1 - i);
                    const middle = width % 2 === 1 && dist === (width - 1) / 2;
                    const open = width === 1 ? height - 1 : height - 1 + dist + (middle ? 1 : 0);
                    for (let rel = 1; rel <= open; rel++) b.set(cx, floorY + rel, cz, null);
                    if (width > 1 && !middle) {
                        const facing = i < width / 2 ? (along === 'x' ? 'w' : 'n') : (along === 'x' ? 'e' : 's');
                        b.stairs(cx, floorY + open + 1, cz, 'sandstone_stairs', facing, 'top');
                    }
                }
            }
            if (!door) return;
            const into = along === 'x' ? 's' : 'e';
            if (width === 1) {
                const [dx0, dz0] = at(0, doorAt);
                b.door(dx0, floorY + 1, dz0, door, into);
            } else if (width === 2) {
                const [ax, az] = at(0, doorAt);
                const [bx, bz] = at(1, doorAt);
                b.doubleDoor(ax, floorY + 1, az, bx, bz, door, into);
            }
        },
        // A lattice window (mashrabiya) through a wall, rel0..rel1 over floorY: the screen in the cell at depth
        // `pane`, the others open (a deep wall shows its thickness).
        window(x, z, along, width, floorY, { rel0 = 2, rel1 = 3, depth = 1, pane = 0, type = 'lattice_screen' } = {}) {
            for (let d = 0; d < depth; d++) {
                for (let i = 0; i < width; i++) {
                    const [cx, cz] = along === 'x' ? [x + i, z + d] : [x + d, z + i];
                    for (let rel = rel0; rel <= rel1; rel++) b.set(cx, floorY + rel, cz, d === pane ? type : null);
                }
            }
        },
        // An arcade: columns at `posts` (x along a wall at z = fixed, or z along one at x = fixed), colH
        // high, arches between them, and a beam over everything up to rel beamTop.
        arcade(along, fixed, posts, floorY, { colH = 3, beamTop = 5, column = 'marble', beam = 'cut_sandstone' } = {}) {
            const cell = (u, rel, type) => (along === 'x' ? b.set(u, floorY + rel, fixed, type) : b.set(fixed, floorY + rel, u, type));
            const step = (u, rel, toLow) => {
                const facing = along === 'x' ? (toLow ? 'w' : 'e') : (toLow ? 'n' : 's');
                if (along === 'x') b.stairs(u, floorY + rel, fixed, 'sandstone_stairs', facing, 'top');
                else b.stairs(fixed, floorY + rel, u, 'sandstone_stairs', facing, 'top');
            };
            for (const p of posts) {
                for (let rel = 1; rel <= colH; rel++) cell(p, rel, column);
                for (let rel = colH + 1; rel <= beamTop; rel++) cell(p, rel, beam);
            }
            for (let k = 0; k + 1 < posts.length; k++) {
                const [p, q] = [posts[k], posts[k + 1]];
                for (let u = p + 1; u < q; u++) {
                    const dist = Math.min(u - p - 1, q - 1 - u);
                    const middle = (q - p - 1) % 2 === 1 && dist === (q - p - 2) / 2;
                    const top = colH + dist;
                    for (let rel = 1; rel < top; rel++) cell(u, rel, null);
                    if (middle) cell(u, top, null);
                    else step(u, top, u - p - 1 <= q - 1 - u);
                    for (let rel = top + 1; rel <= beamTop; rel++) cell(u, rel, beam);
                }
            }
        },
        // A coffered ceiling over x0..x1 by z0..z1: `rings` steps of upside-down stairs going in from the walls,
        // from layer y up, then the ceiling `top` (a type or a function of x, z) on layer y + rings.
        coffer(x0, z0, x1, z1, y, rings, stair, full, top) {
            for (let z = z0; z <= z1; z++) {
                for (let x = x0; x <= x1; x++) {
                    const r = Math.min(x - x0, x1 - x, z - z0, z1 - z);
                    for (let k = 0; k < rings; k++) {
                        if (r < k) b.set(x, y + k, z, full);
                        else if (r === k) {
                            const facing = x - x0 === r ? 'w' : x1 - x === r ? 'e' : z - z0 === r ? 'n' : 's';
                            b.stairs(x, y + k, z, stair, facing, 'top');
                        }
                    }
                    b.set(x, y + rings, z, typeof top === 'function' ? top(x, z) : top);
                }
            }
        },
        // A low hipped roof of terracotta, half a block up for each block in from the eaves, on layer y up,
        // flat on top once it is `cap` blocks in. Hollow: only its skin is drawn.
        roof(x0, z0, x1, z1, y, cap = 6) {
            for (let z = z0; z <= z1; z++) {
                for (let x = x0; x <= x1; x++) {
                    const i = Math.min(x - x0, x1 - x, z - z0, z1 - z, cap);
                    if (i % 2 === 1) b.set(x, y + (i - 1) / 2, z, 'brick');
                    else b.set(x, y + i / 2, z, 'brick_slab');
                }
            }
        },
        // Merlons on the ring of a rectangle at layer y, every other block.
        merlons(x0, z0, x1, z1, y, type) {
            for (let z = z0; z <= z1; z++) {
                for (let x = x0; x <= x1; x++) {
                    const edge = x === x0 || x === x1 || z === z0 || z === z1;
                    if (edge && (x + z) % 2 === 0) b.set(x, y, z, type || outer(x, y, z));
                }
            }
        },
        // A hanging lamp over (x, z): a chandelier three blocks over the floor at floorY, on a chain of fence up
        // to whatever is over it.
        lamp(x, z, floorY) {
            if (has(x, floorY + 4, z) && !has(x, floorY + 5, z)) return;
            b.set(x, floorY + 4, z, 'chandelier');
            for (let y = floorY + 5; y < H && !has(x, y, z); y++) b.set(x, y, z, 'dark_oak_fence');
        },
        // Lamps over a room on a grid no wider than 5, so that every cell of its floor is lit (a chandelier
        // gives 14; three down and five across leaves 6).
        lamps(x0, z0, x1, z1, floorY, skip = () => false) {
            const spread = (a0, a1) => {
                const n = Math.max(1, Math.ceil((a1 - a0 + 1) / 5));
                const out = [];
                for (let i = 0; i < n; i++) out.push(a0 + Math.round(((i + 0.5) * (a1 - a0 + 1)) / n - 0.5));
                return out;
            };
            for (const x of spread(x0, x1)) {
                for (const z of spread(z0, z1)) if (!skip(x, z)) t.lamp(x, z, floorY);
            }
        },
        // A straight flight of stairs from floor layer y up `rise` layers, going `facing` from (x, z), width 2
        // (to +x when it runs along z, to +z when it runs along x): `rise` steps, the last one in the upper
        // floor's layer, level with the landing beyond it. The floor over the steps is opened so that heads pass.
        flight(x, z, y, rise, facing, stair, width = 2) {
            const [dx, dz] = SHAPE_DIRECTIONS[facing];
            for (let k = 1; k <= rise; k++) {
                for (let wdt = 0; wdt < width; wdt++) {
                    const cx = x + dx * (k - 1) + (dx === 0 ? wdt : 0);
                    const cz = z + dz * (k - 1) + (dz === 0 ? wdt : 0);
                    b.stairs(cx, y + k, cz, stair, facing);
                    for (let yy = y + k + 1; yy <= y + rise + 2; yy++) b.set(cx, yy, cz, null);
                    for (let yy = y + 1; yy < y + k; yy++) b.set(cx, yy, cz, 'cut_sandstone');
                }
            }
        },
        // Carpet over a rectangle with a border of another colour.
        carpet(x0, z0, x1, z1, y, field, border) {
            for (let z = z0; z <= z1; z++) {
                for (let x = x0; x <= x1; x++) {
                    const edge = x === x0 || x === x1 || z === z0 || z === z1;
                    b.set(x, y, z, `${edge && border ? border : field}_carpet`);
                }
            }
        },
        // An oven, unlit, with something to bake and its fuel (each stack goes to its own slot).
        oven(x, y, z, facing, items = [['wheat', 6], ['coal_ore', 8]]) {
            f.oven(x, y, z, facing);
            constructionPalaceStockCheck(items, 3);
            b.stock(x, y, z, items);
        },
        // A wardrobe (it holds things too) with clothes in it.
        wardrobe(x, y, z, facing, items = [['warm_coat', 1], ['white_wool', 8], ['leather', 2]]) {
            f.tall(x, y, z, 'wardrobe', facing);
            constructionPalaceStockCheck(items, 45);
            b.stock(x, y, z, items);
        },
        sofa: (x, y, z, color, facing) => f.piece(x, y, z, `${color}_sofa`, 'sofa', facing),
        banner: (x, y, z, color, facing) => f.piece(x, y, z, `${color}_banner`, 'banner', facing),
        chair: (x, y, z, facing, wood = 'dark_oak') => f.piece(x, y, z, `${wood}_chair`, 'chair', facing),
        // One of `list` for this place, the same every time; a null in the list leaves the place bare.
        pick: (list, x, y, z, salt = 0) => list[Math.floor(constructionPalaceHash(x, y, z, salt) * list.length)],
        // Something left on a table, a desk or a bedside table (js/game/tabletop.js), in the cell over it:
        // a sign that somebody lives here and has just stepped out.
        tabletop(x, y, z, id, facing = 'n') {
            if (!id) return;
            if (PALACE_ANDALUSI_TABLETOP_FLAT.has(id)) b.set(x, y, z, id);
            else b.shaped(x, y, z, id, id, { facing: b.facing(facing) });
        },
        // Curtains over a window, from rel y0 to y1, across `width` cells along x or z from (x, z). Each
        // strip is drawn or open by itself (about a third drawn), as people left them.
        curtains(x, z, along, width, y0, y1, color, facing) {
            for (let i = 0; i < width; i++) {
                const [cx, cz] = along === 'x' ? [x + i, z] : [x, z + i];
                const drawn = constructionPalaceHash(cx, y0, cz, 29) < 0.34 ? 'closed' : 'open';
                for (let y = y0; y <= y1; y++) f.curtain(cx, y, cz, color, facing, drawn);
            }
        },
        throne(x, y, z, base, facing) {
            b.shaped(x, y, z, base, 'throne', { half: 'lower', facing: b.facing(facing) });
            b.shaped(x, y + 1, z, base, 'throne', { half: 'upper', facing: b.facing(facing) });
        },
        bathtub(x, y, z, facing) {
            const [dx, dz] = SHAPE_DIRECTIONS[facing];
            b.shaped(x, y, z, 'bathtub', 'bathtub', { part: 'foot', facing: b.facing(facing) });
            b.shaped(x + dx, y, z + dz, 'bathtub', 'bathtub', { part: 'head', facing: b.facing(facing) });
        },
        // A small orange tree: a short trunk, a round head of leaves and a few oranges in it.
        orange(x, y, z) {
            b.box(x, y, z, x, y + 1, z, 'wood');
            for (let dy = 2; dy <= 3; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dy === 3 && dx && dz) continue;
                        const fruit = dy === 2 && (dx || dz) && constructionPalaceHash(x + dx, y, z + dz, 61) < 0.22;
                        b.set(x + dx, y + dy, z + dz, fruit ? 'orange_wool' : 'leaves');
                    }
                }
            }
            b.set(x, y + 4, z, 'leaves');
        },
        // A cypress: a narrow green column.
        cypress(x, y, z, height = 5) {
            b.set(x, y, z, 'spruce_wood');
            b.box(x, y + 1, z, x, y + height, z, 'spruce_leaves');
        },
        // A small round basin with a fountain in its middle, standing on layer y.
        basin(x, y, z) {
            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    b.set(x + dx, y, z + dz, 'marble');
                    if (dx || dz) b.set(x + dx, y + 1, z + dz, 'white_glazed_tile_slab');
                }
            }
            b.set(x, y + 1, z, 'fountain');
        }
    };
    return t;
}

// The outer wall, its towers and the forecourt before the gate.
function constructionPalaceAndalusiPrecinct(b, t) {
    const G = PALACE_ANDALUSI_GROUND;
    const top = G + 10;
    // The wall, two blocks thick, round x 16..124, z 22..124.
    for (let y = G; y <= top; y++) {
        for (const [x0, z0, x1, z1] of [[16, 22, 124, 23], [16, 123, 124, 124], [16, 22, 17, 124], [123, 22, 124, 124]]) {
            for (let z = z0; z <= z1; z++) {
                for (let x = x0; x <= x1; x++) b.set(x, y, z, y === G + 4 ? 'cut_sandstone' : t.outer(x, y, z));
            }
        }
    }
    t.merlons(16, 22, 124, 124, top + 1);
    // Square towers standing out of it: the corners and along the sides, solid, higher, crenellated.
    const towers = [[12, 18], [123, 18], [12, 123], [123, 123], [12, 58], [12, 92], [123, 58], [123, 92], [36, 18], [99, 18]];
    for (const [x0, z0] of towers) {
        for (let y = G; y <= G + 13; y++) {
            for (let z = z0; z < z0 + 6; z++) {
                for (let x = x0; x < x0 + 6; x++) b.set(x, y, z, y === G + 4 || y === G + 12 ? 'cut_sandstone' : t.outer(x, y, z));
            }
        }
        t.merlons(x0, z0, x0 + 5, z0 + 5, G + 14);
        // A small window of lattice high on each tower, facing out.
        b.set(x0 + 2, G + 10, z0 < 30 ? z0 : z0 + 5, 'lattice_screen');
    }
    // The forecourt: a paved way from the road to the gate between palms, lamps, and the palace's name.
    for (let z = 12; z <= 15; z++) {
        for (let x = 66; x <= 74; x++) b.set(x, G, z, x === 66 || x === 74 ? 'sandstone' : 'cut_sandstone');
    }
    for (const x of [60, 80]) constructionPalaceTree(t.put, 'palm', x, G + 1, 15, 7);
    for (const x of [65, 75]) t.f.lanternPost(x, G + 1, 14, 'dark_oak_fence', 2);
    constructionPalaceSign(b, 67, G + 1, 13, 'n', 'Alcázar del Agua', 'Palace of Water');
}

// The gate tower: a passage under a horseshoe arch, a guard post on each side, a guard room upstairs.
function constructionPalaceAndalusiGate(b, t) {
    const G = PALACE_ANDALUSI_GROUND;
    const U = PALACE_ANDALUSI_UPPER;
    const { f } = t;
    for (let y = G; y <= U + 6; y++) {
        for (let z = 16; z <= 27; z++) {
            for (let x = 63; x <= 77; x++) {
                const edge = x === 63 || x === 77 || z === 16 || z === 27;
                b.set(x, y, z, edge || y === G || y === U || y === U + 6 ? (y === G + 4 ? 'cut_sandstone' : t.outer(x, y, z)) : null);
            }
        }
    }
    t.merlons(63, 16, 77, 27, U + 7);
    // The passage, 3 wide, and its arches at both ends: tiles round the outer one.
    t.room(69, 17, 71, 26, { h: 6, scheme: 'blue', floor: 'cut_sandstone', ceiling: 'dark_oak_planks' });
    t.arch(69, 16, 'x', 3, G, { height: 5 });
    t.arch(69, 27, 'x', 3, G, { height: 5 });
    for (let y = G + 1; y <= G + 7; y++) {
        for (const x of [67, 68, 72, 73]) b.set(x, y, 16, y <= G + 2 ? 'blue_glazed_tile' : 'white_glazed_tile');
    }
    b.box(67, G + 7, 16, 73, G + 7, 16, 'green_glazed_tile');
    for (const x of [67, 73]) {
        b.set(x, G + 3, 15, 'cut_sandstone');
        t.f.lantern(x, G + 4, 15, 'floor');
    }
    // The guard posts on each side, with doors into the passage.
    t.room(64, 17, 67, 26, { scheme: 'plain', floor: 'cut_sandstone' });
    t.room(73, 17, 76, 26, { scheme: 'plain', floor: 'cut_sandstone' });
    t.arch(68, 21, 'z', 1, G, { door: 'dark_oak_door' });
    t.arch(72, 21, 'z', 1, G);
    b.door(72, G + 1, 21, 'dark_oak_door', 'w');
    // Upstairs, over all of it: the guard room. The flight starts in the west post.
    t.room(64, 17, 76, 26, { y: U, scheme: 'plain', floor: 'spruce_planks' });
    t.flight(64, 18, G, 6, 's', 'sandstone_stairs');
    b.box(66, U + 1, 18, 66, U + 1, 22, 'lattice_screen');
    for (const x of [66, 74]) t.window(x, 16, 'x', 2, U, { rel0: 2, rel1: 3 });
    t.window(69, 27, 'x', 3, U, { rel0: 2, rel1: 3 });
    for (const z of [18, 21, 24]) constructionPalaceBed(b, 76, U + 1, z, 'e');
    b.set(70, U + 1, 23, 'table');
    b.set(71, U + 1, 23, 'table');
    t.chair(70, U + 1, 22, 's');
    t.chair(71, U + 1, 24, 'e');
    b.set(70, U + 2, 23, 'candle');
    // A game of chess the guards left when the watch changed.
    t.tabletop(71, U + 2, 23, 'chessboard', 'n');
    constructionPalaceChest(b, 68, U + 1, 26, 'n', [['torch', 16], ['bread', 8], ['cooked_fish', 6], ['candle', 6], ['leather', 4]]);
    f.piece(64, U + 1, 26, 'wall_shelf', 'wall_shelf', 'n');
    t.lamps(64, 17, 76, 26, U);
    // Below: a bench and a lantern in each post.
    for (const x0 of [64, 73]) {
        f.benches(x0, x0 + 3, G + 1, 26, 'n');
        t.lamps(x0, 17, x0 + 3, 26, G);
    }
    t.lamps(69, 17, 71, 26, G);
}

// The near band, south of the lane: the oratory, the Mexuar (where the council met), the entry court, the
// guards' quarters and the stables.
function constructionPalaceAndalusiFront(b, t) {
    const G = PALACE_ANDALUSI_GROUND;
    const { f } = t;
    const star = (c) => (x, z) => constructionPalaceAndalusiStar(x, z, c);

    // The oratory: two rows of columns, carpets in rows, a niche in the far wall (no writing, only its shape
    // and its tiles), a great lamp.
    t.room(18, 24, 32, 36, { scheme: 'green', floor: star({ star: 'green_glazed_tile', heart: 'white_glazed_tile', cross: 'turquoise_glazed_tile', ground: 'marble' }), ceiling: 'dark_oak_planks' });
    // The niche (mihrab): into the inner layer of the outer wall, horseshoe-topped, framed by tiles.
    for (let rel = 1; rel <= 3; rel++) b.box(24, G + rel, 23, 26, G + rel, 23, null);
    b.set(25, G + 4, 23, null);
    b.stairs(24, G + 4, 23, 'sandstone_stairs', 'w', 'top');
    b.stairs(26, G + 4, 23, 'sandstone_stairs', 'e', 'top');
    for (let rel = 1; rel <= 5; rel++) {
        b.set(23, G + rel, 24, rel <= 4 ? 'green_glazed_tile' : 'cut_sandstone');
        b.set(27, G + rel, 24, rel <= 4 ? 'green_glazed_tile' : 'cut_sandstone');
    }
    b.box(23, G + 5, 24, 27, G + 5, 24, 'turquoise_glazed_tile');
    b.set(25, G, 23, 'white_glazed_tile');
    for (const x of [22, 28]) {
        for (const z of [27, 30, 33]) b.box(x, G + 1, z, x, G + 3, z, 'marble');
    }
    for (const z of [26, 29, 32, 35]) t.carpet(19, z, 31, z, G + 1, z % 2 ? 'green' : 'red', null);
    t.carpet(23, 25, 27, 25, G + 1, 'red', null);
    for (const x of [19, 31]) t.window(x, 37, 'x', 2, G, { depth: 2, pane: 1 });
    t.lamps(18, 24, 32, 36, G);
    constructionPalaceChest(b, 32, G + 1, 25, 'w', [['candle', 16], ['lantern', 4], ['white_wool', 8]]);

    // The Mexuar: the council's hall, four columns holding a lantern of glass over the middle, benches along
    // the walls, and the sultan's seat of cushions on a step at the far end.
    t.room(34, 24, 53, 36, { scheme: 'royal', floor: star({ star: 'blue_glazed_tile', heart: 'yellow_glazed_tile', cross: 'green_glazed_tile', ground: 'white_glazed_tile' }) });
    for (const [x, z] of [[40, 28], [47, 28], [40, 33], [47, 33]]) b.box(x, G + 1, z, x, G + 5, z, 'marble');
    // The lantern: the ceiling opens over the columns into a little tower of glass.
    for (let z = 29; z <= 32; z++) {
        for (let x = 41; x <= 46; x++) {
            b.set(x, G + 6, z, null);
            b.set(x, G + 9, z, 'dark_oak_planks');
        }
    }
    for (let y = G + 6; y <= G + 8; y++) {
        for (let z = 28; z <= 33; z++) {
            for (let x = 40; x <= 47; x++) {
                if (x === 40 || x === 47 || z === 28 || z === 33) b.set(x, y, z, y === G + 6 ? 'cut_sandstone' : (x + z) % 2 ? 'yellow_stained_glass' : 'white_stucco');
            }
        }
    }
    b.box(40, G + 9, 28, 47, G + 9, 33, 'brick_slab');
    b.box(41, G + 9, 29, 46, G + 9, 32, 'dark_oak_planks');
    for (let x = 35; x <= 52; x++) {
        if (x < 42 || x > 45) {
            t.sofa(x, G + 1, 24, x % 2 ? 'red' : 'blue', 's');
        }
    }
    b.box(42, G + 1, 24, 45, G + 1, 25, 'cut_sandstone');
    for (const x of [43, 44]) t.sofa(x, G + 2, 24, 'red', 's');
    b.stairs(42, G + 1, 26, 'sandstone_stairs', 's');
    b.stairs(43, G + 1, 26, 'sandstone_stairs', 's');
    b.stairs(44, G + 1, 26, 'sandstone_stairs', 's');
    b.stairs(45, G + 1, 26, 'sandstone_stairs', 's');
    t.carpet(41, 27, 46, 34, G + 1, 'red', 'yellow');
    for (const [x, z] of [[35, 30], [52, 30]]) {
        b.set(x, G + 1, z, 'table');
        b.set(x, G + 2, z, 'candle');
    }
    t.banner(34, G + 4, 30, 'red', 'e');
    t.banner(53, G + 4, 30, 'green', 'w');
    constructionPalaceChest(b, 35, G + 1, 35, 'e', [['blueprint', 4], ['measuring_tape', 2], ['candle', 8], ['gold_leaf', 4]]);
    t.lamps(34, 24, 53, 36, G, (x, z) => x >= 40 && x <= 47 && z >= 28 && z <= 33);
    for (const [x, z] of [[43, 30], [44, 31]]) t.lamp(x, z, G);
    t.arch(33, 30, 'z', 2, G, {});

    // The entry court: open to the sky, paved, a fountain in its middle and two palms, an arcade along its far side.
    for (let z = 24; z <= 36; z++) {
        for (let x = 55; x <= 85; x++) {
            if (x >= 63 && x <= 77 && z <= 27) continue;
            const edge = x === 55 || x === 85 || z === 36;
            b.set(x, G, z, edge ? 'sandstone' : (x + z) % 4 === 0 ? 'marble' : 'cut_sandstone');
            for (let y = G + 1; y <= G + 8; y++) b.set(x, y, z, null);
        }
    }
    t.basin(70, G, 31);
    for (const x of [60, 80]) {
        b.set(x, G, 31, 'sand');
        constructionPalaceTree(t.put, 'palm', x, G + 1, 31, 11);
    }
    for (const [x, z] of [[56, 25], [84, 25], [56, 35], [84, 35]]) f.lanternPost(x, G + 1, z, 'dark_oak_fence', 2);
    // The court's far side: a wall with an arcade before it and the way out to the lane in the middle.
    for (let y = G + 1; y <= G + 7; y++) {
        for (let x = 55; x <= 85; x++) {
            b.set(x, y, 37, t.wallAt('blue', x, y, 37, G, G + 7));
            b.set(x, y, 38, t.outer(x, y, 38));
        }
    }
    t.arch(68, 37, 'x', 5, G, { height: 3, depth: 2 });
    t.arcade('x', 35, [55, 58, 61, 64, 67, 73, 76, 79, 82, 85], G, { beamTop: 4 });
    for (let x = 55; x <= 85; x++) {
        b.set(x, G + 5, 35, 'cut_sandstone');
        b.set(x, G + 5, 36, 'cut_sandstone');
        b.stairs(x, G + 6, 35, 'brick_stairs', 's');
        b.set(x, G + 6, 36, 'brick');
    }
    for (let x = 68; x <= 72; x++) {
        for (let rel = 1; rel <= 4; rel++) b.set(x, G + rel, 35, null);
    }
    t.lamps(56, 36, 84, 36, G, (x) => x >= 66 && x <= 74);
    // Doors into the Mexuar and the guards' quarters.
    t.arch(54, 31, 'z', 2, G, {});
    t.arch(86, 31, 'z', 2, G, {});

    // The guards' quarters: bunks, a table, their chests and barrels, a rack of lanterns.
    t.room(87, 24, 104, 36, { scheme: 'plain', floor: (x, z) => ((x + z) % 2 ? 'cut_sandstone' : 'sandstone'), ceiling: 'spruce_planks' });
    t.arch(86, 31, 'z', 2, G, {});
    for (const z of [25, 28, 31, 34]) {
        constructionPalaceBed(b, 104, G + 1, z, 'e');
        f.piece(103, G + 1, z + 1, 'bedside_table', 'bedside_table', 'w');
    }
    for (const z of [25, 28]) constructionPalaceBed(b, 88, G + 1, z, 'w');
    for (let z = 29; z <= 33; z++) b.set(95, G + 1, z, 'table');
    for (let z = 29; z <= 33; z++) {
        f.piece(94, G + 1, z, 'bench', 'bench', 'e');
        f.piece(96, G + 1, z, 'bench', 'bench', 'w');
    }
    for (const z of [29, 31, 33]) b.set(95, G + 2, z, 'candle');
    t.tabletop(95, G + 2, 30, 'jug');
    t.tabletop(95, G + 2, 32, 'meal_plate');
    constructionPalaceChest(b, 87, G + 1, 33, 'e', [['torch', 32], ['bread', 16], ['cooked_fish', 10], ['leather', 8], ['candle', 8]]);
    constructionPalaceChest(b, 87, G + 1, 35, 'e', [['bread', 24], ['cheese', 10], ['salted_fish', 12], ['water_flask', 6]], 'barrel');
    f.piece(92, G + 2, 36, 'wall_shelf', 'wall_shelf', 'n');
    t.banner(98, G + 3, 24, 'red', 's');
    t.window(90, 37, 'x', 2, G, { depth: 2, pane: 1 });
    t.window(99, 37, 'x', 2, G, { depth: 2, pane: 1 });
    t.lamps(87, 24, 104, 36, G);

    // The stables: stalls of fence along the outer wall, troughs of water, hay, a door wide for horses.
    t.room(106, 24, 122, 36, { scheme: 'plain', floor: (x, z) => (z <= 30 ? 'dirt' : 'cobblestone'), ceiling: 'spruce_planks' });
    for (const x of [109, 113, 117]) b.box(x, G + 1, 24, x, G + 1, 29, 'spruce_fence');
    b.box(106, G + 1, 30, 122, G + 1, 30, 'spruce_fence');
    for (const x of [107, 111, 115, 119]) {
        b.gate(x + 1, G + 1, 30, 'spruce_fence_gate', 's');
        b.set(x, G + 1, 24, 'water');
        b.set(x, G, 24, 'cobblestone');
        b.set(x + 1, G + 1, 25, 'yellow_wool');
        b.set(x + 1, G + 1, 24, 'yellow_wool');
    }
    for (const x of [107, 111, 115, 119]) b.set(x, G + 1, 24, 'water');
    constructionPalaceChest(b, 121, G + 1, 35, 'w', [['wheat', 64], ['wheat', 64], ['leather', 8], ['water_bucket', 2]], 'barrel');
    constructionPalaceChest(b, 121, G + 1, 33, 'w', [['wheat', 48], ['wheat_seeds', 16], ['fertilizer', 8]], 'barrel');
    constructionPalaceChest(b, 106, G + 1, 35, 'e', [['leather', 12], ['fishing_rod', 1], ['torch', 8], ['bread', 6]]);
    t.lamps(106, 31, 122, 36, G);
    t.lamps(106, 24, 122, 29, G);
    t.arch(105, 33, 'z', 2, G, {});
    t.arch(112, 37, 'x', 3, G, { depth: 2 });

    // The two roofs of the band: over the oratory and the Mexuar, over the guards and the stables.
    t.roof(16, 22, 54, 38, G + 7);
    t.roof(86, 22, 124, 38, G + 7);
    // The wall towards the lane: an outer skin, and the doors of the oratory and the Mexuar.
    for (let y = G + 1; y <= G + 6; y++) {
        for (let x = 17; x <= 54; x++) b.set(x, y, 38, t.outer(x, y, 38));
        for (let x = 86; x <= 123; x++) b.set(x, y, 38, t.outer(x, y, 38));
    }
    for (const [x0, x1] of [[17, 54], [86, 123]]) b.box(x0, G + 7, 37, x1, G + 7, 38, 'cut_sandstone');
    t.arch(24, 37, 'x', 3, G, { depth: 2, height: 4 });
    t.arch(43, 37, 'x', 3, G, { depth: 2, height: 4 });
    t.arch(112, 37, 'x', 3, G, { depth: 2, height: 4 });
    for (const x of [19, 31, 90, 99]) t.window(x, 37, 'x', 2, G, { depth: 2, pane: 1 });
}

// The lane (Calle Real) between the front band and the palaces: paved, lamps on posts.
function constructionPalaceAndalusiLane(b, t) {
    const G = PALACE_ANDALUSI_GROUND;
    for (let z = 39; z <= 42; z++) {
        for (let x = 18; x <= 122; x++) {
            b.set(x, G, z, z === 39 || z === 42 ? 'sandstone' : (x % 6 === 0 ? 'cobblestone' : 'cut_sandstone'));
            for (let y = G + 1; y <= G + 10; y++) b.set(x, y, z, null);
        }
    }
    for (const x of [21, 37, 57, 66, 76, 86, 106, 119]) t.f.lanternPost(x, G + 1, x % 2 ? 39 : 42, 'dark_oak_fence', 2);
    // The façades along the far side of the lane: an outer skin, a carved band and an eave of wood.
    for (let y = G + 1; y <= G + 6; y++) {
        for (let x = 17; x <= 123; x++) b.set(x, y, 43, y === G + 4 ? 'cut_sandstone' : t.outer(x, y, 43));
    }
    for (let x = 17; x <= 123; x++) {
        b.stairs(x, G + 7, 42, 'dark_oak_stairs', 's');
        b.set(x, G + 7, 43, 'dark_oak_planks');
    }
}

// The west wing: kitchens, stores and the servants below; upstairs the residence (harem), its bedrooms
// along a corridor that looks over the Court of the Myrtles through lattices.
function constructionPalaceAndalusiWest(b, t) {
    const G = PALACE_ANDALUSI_GROUND;
    const U = PALACE_ANDALUSI_UPPER;
    const { f } = t;
    const plainFloor = (x, z) => ((x + z) % 2 ? 'cut_sandstone' : 'sandstone');
    const starFloor = (x, z) => constructionPalaceAndalusiStar(x, z, { star: 'turquoise_glazed_tile', heart: 'yellow_glazed_tile', cross: 'blue_glazed_tile', ground: 'white_glazed_tile' });

    // Ground floor.
    t.room(18, 45, 35, 57, { scheme: 'plain', floor: plainFloor, ceiling: 'spruce_planks' });
    t.room(18, 59, 35, 70, { scheme: 'plain', floor: 'cobblestone', ceiling: 'spruce_planks' });
    t.room(18, 72, 35, 83, { scheme: 'green', floor: plainFloor, ceiling: 'spruce_planks' });
    t.room(18, 85, 35, 96, { scheme: 'blue', floor: 'marble' });
    t.room(18, 98, 35, 122, { scheme: 'turquoise', floor: starFloor });
    // The wall towards the court: a second layer, decorated on the court's side.
    for (let z = 44; z <= 123; z++) {
        for (let y = G + 1; y <= U + 6; y++) b.set(37, y, z, t.wallAt('blue', 37, y, z, G, U + 6));
    }
    // Upstairs: a hall over the stair, and five suites to the west of a corridor (x 32..35). A suite is a
    // bedroom by the outer wall, 7 by 8 (the royal one, the sultana's, runs the whole depth of its suite),
    // a closet or a nursery behind it, and beside the corridor a small washroom and the dressing room the
    // corridor's door opens into. zm is the corridor's door, zw the washroom's last row, zb the bedroom's,
    // zc the middle of the bedroom (its bed and its window).
    t.room(18, 45, 35, 122, { y: U, scheme: 'royal', floor: 'cherry_planks', ceiling: 'dark_oak_planks' });
    const suites = [[45, 55], [57, 67], [69, 83], [98, 108], [110, 122]].map(([z0, z1], i) => {
        const royal = z0 === 110;
        const zm = Math.floor((z0 + z1) / 2);
        const zb = royal ? z1 : Math.min(z1, z0 + 7);
        return { i, z0, z1, zm, royal, zb, zw: zm - 3, zc: Math.floor((z0 + zb) / 2), back: zb + 2 <= z1, nursery: z1 - zb > 4 };
    });
    for (const s of suites) {
        t.room(18, s.z0, 24, s.zb, { y: U, scheme: s.royal ? 'royal' : 'turquoise', floor: starFloor, ceiling: 'dark_oak_planks' });
        if (s.back) t.room(18, s.zb + 2, 24, s.z1, { y: U, scheme: s.nursery ? 'green' : 'plain', floor: 'cherry_planks', ceiling: 'dark_oak_planks' });
        t.room(26, s.z0, 30, s.zw, { y: U, scheme: 'turquoise', floor: 'white_glazed_tile', ceiling: 'white_stucco' });
        t.room(26, s.zw + 2, 30, s.z1, { y: U, scheme: s.royal ? 'royal' : 'green', floor: 'cherry_planks', ceiling: 'dark_oak_planks' });
    }
    t.room(18, 85, 35, 96, { y: U, scheme: 'royal', floor: 'marble', ceiling: 'dark_oak_planks' });
    // Doors: the ground floor rooms one after another, and into the court.
    for (const z of [58, 71, 84, 97]) t.arch(26, z, 'x', 3, G, {});
    t.arch(36, 76, 'z', 3, G, { depth: 2 });
    t.arch(36, 108, 'z', 3, G, { depth: 2, height: 4 });
    t.arch(26, 43, 'x', 2, G, { depth: 2, door: 'oak_door', doorAt: 0 });
    // Upstairs doors: the corridor through the hall's walls; each suite's dressing room off it, and from the
    // dressing room the bedroom and the washroom; the closet or the nursery from the bedroom.
    for (const z of [84, 97]) t.arch(32, z, 'x', 4, U, {});
    for (const s of suites) {
        t.arch(31, s.zm, 'z', 2, U, { door: s.royal ? 'cherry_door' : 'oak_door' });
        t.arch(25, s.zm, 'z', 1, U, { door: s.royal ? 'cherry_door' : 'oak_door' });
        t.arch(28, s.zw + 1, 'x', 1, U, { door: 'oak_door' });
        if (s.back) t.arch(21, s.zb + 1, 'x', 1, U, { door: 'oak_door' });
    }
    // The stair, against the west wall of its hall, a railing round its opening upstairs.
    t.flight(18, 87, G, 6, 's', 'sandstone_stairs');
    b.box(20, U + 1, 87, 20, U + 1, 91, 'lattice_screen');
    b.box(18, U + 1, 86, 19, U + 1, 86, 'lattice_screen');
    // Lattice windows: over the court from the corridor, out through the outer wall from the bedrooms.
    for (let z = 47; z <= 120; z += 4) {
        if (z >= 84 && z <= 97) continue;
        t.window(36, z, 'z', 2, U, { depth: 2, pane: 1 });
    }
    for (const s of suites) {
        t.window(16, s.zc - 1, 'z', 3, U, { depth: 2, pane: 0 });
        if (s.nursery) t.window(16, s.zb + 4, 'z', 2, U, { depth: 2, pane: 0 });
    }
    for (const z of [49, 64, 78, 112]) t.window(16, z, 'z', 2, G, { depth: 2, pane: 0, rel0: 3, rel1: 4 });

    // The kitchen: ovens along the outer wall, a long worktable, sinks, barrels of food.
    for (const z of [46, 48, 50, 52, 54]) t.oven(18, G + 1, z, 'e', z % 4 ? [['raw_fish', 8], ['coal_ore', 8]] : [['wheat', 9], ['planks', 8]]);
    for (const z of [47, 49, 51, 53]) b.set(18, G + 1, z, 'workbench');
    for (let z = 48; z <= 54; z++) b.set(26, G + 1, z, 'table');
    for (const z of [48, 51, 54]) b.set(26, G + 2, z, 'candle');
    // On the worktable: the cook's half-eaten bread and cheese, the fruit for the sultan's table, a jug.
    t.tabletop(26, G + 2, 49, 'meal_plate');
    t.tabletop(26, G + 2, 52, 'fruit_bowl');
    t.tabletop(26, G + 2, 53, 'jug');
    for (const x of [30, 32]) f.piece(x, G + 1, 45, 'sink', 'sink', 's');
    constructionPalaceChest(b, 35, G + 1, 46, 'w', [['bread', 32], ['cheese', 16], ['honey_bottle', 8], ['salt', 16]], 'barrel');
    constructionPalaceChest(b, 35, G + 1, 48, 'w', [['raw_fish', 16], ['salted_fish', 16], ['milk', 6], ['wheat', 32]], 'barrel');
    constructionPalaceChest(b, 35, G + 1, 50, 'w', [['cooked_fish', 12], ['roast_mushroom', 10], ['bread', 12], ['honey_bottle', 4]]);
    for (const x of [22, 28]) f.piece(x, G + 3, 57, 'wall_shelf', 'wall_shelf', 'n');
    t.lamps(18, 45, 35, 57, G);

    // The stores: rows of barrels and chests of what the palace keeps.
    const stores = [
        [['wheat', 64], ['wheat', 64], ['wheat_seeds', 32]],
        [['salt', 32], ['baking_soda', 8], ['honeycomb', 12]],
        [['bread', 24], ['cheese', 24], ['honey_bottle', 12]],
        [['soda_water', 8], ['water_flask', 12], ['milk', 8]],
        [['salted_fish', 32], ['raw_fish', 16], ['cooked_fish', 8]],
        [['coal_ore', 32], ['planks', 32], ['torch', 16]]
    ];
    const extras = [
        [['wheat', 48], ['honeycomb', 8]],
        [['sand', 32], ['quicklime', 8]],
        [['cheese', 16], ['honey_bottle', 8], ['salt', 8]],
        [['candle', 24], ['white_wool', 12]],
        [['salted_fish', 24], ['salt', 16]],
        [['cobblestone', 32], ['limestone', 16], ['sand', 16]]
    ];
    stores.forEach((items, i) => {
        constructionPalaceChest(b, 22 + (i % 3) * 5, G + 1, i < 3 ? 61 : 67, i < 3 ? 's' : 'n', items, 'barrel');
        constructionPalaceChest(b, 23 + (i % 3) * 5, G + 1, i < 3 ? 61 : 67, i < 3 ? 's' : 'n', extras[i], 'barrel');
    });
    constructionPalaceChest(b, 18, G + 1, 64, 'e', [['white_wool', 24], ['red_wool', 16], ['blue_wool', 16], ['yellow_wool', 8], ['green_wool', 8]]);
    constructionPalaceChest(b, 18, G + 1, 66, 'e', [['lantern', 6], ['candle', 24], ['glass', 12], ['bucket', 2]]);
    t.lamps(18, 59, 35, 70, G);

    // The servants' hall: a long table with benches, a sideboard.
    for (let x = 21; x <= 32; x++) {
        b.set(x, G + 1, 77, 'table');
        f.piece(x, G + 1, 76, 'bench', 'bench', 's');
        f.piece(x, G + 1, 78, 'bench', 'bench', 'n');
    }
    for (const x of [22, 26, 30]) b.set(x, G + 2, 77, 'candle');
    // Somebody's meal not finished, a jug: different down the table. A bench left pushed out.
    for (const x of [21, 23, 24, 25, 27, 28, 29, 31, 32]) t.tabletop(x, G + 2, 77, t.pick(['meal_plate', 'jug', null, null], x, G, 77, 83));
    constructionPalaceChest(b, 18, G + 1, 80, 'e', [['bread', 12], ['cheese', 8], ['cooked_fish', 8], ['honey_bottle', 4]]);
    f.piece(18, G + 3, 74, 'wall_shelf', 'wall_shelf', 'e');
    t.lamps(18, 72, 35, 83, G);

    // The stair hall: a bench, a statue, a chest of linen.
    t.lamps(18, 85, 35, 96, G, (x) => x <= 19);
    t.lamp(23, 88, G);
    constructionPalaceChest(b, 35, G + 1, 95, 'w', [['white_wool', 16], ['blue_wool', 8], ['candle', 8]]);
    f.piece(26, G + 1, 96, 'statue', 'statue', 'n');
    t.lamps(18, 85, 35, 96, U, (x) => x <= 20);
    t.lamp(23, 89, U);
    t.lamp(19, 95, U);

    // The harem's salon: cushions round a fountain, carpets, lattice screens, a chest of fine things.
    t.basin(26, G, 110);
    t.carpet(22, 102, 30, 106, G + 1, 'blue', 'white');
    t.carpet(22, 114, 30, 119, G + 1, 'red', 'yellow');
    for (let x = 20; x <= 32; x++) {
        if (x !== 26) {
            t.sofa(x, G + 1, 122, x % 2 ? 'magenta' : 'purple', 'n');
            t.sofa(x, G + 1, 98, x % 2 ? 'magenta' : 'purple', 's');
        }
    }
    for (const z of [101, 119]) {
        b.set(19, G + 1, z, 'table');
        b.set(19, G + 2, z, 'vase');
    }
    // A low table on the carpet with a game of chess half played, another with fruit and a jug of water,
    // and the embroidery somebody put down by the cushions.
    b.set(23, G + 1, 104, 'table');
    t.tabletop(23, G + 2, 104, 'chessboard', 'e');
    b.set(29, G + 1, 116, 'table');
    t.tabletop(29, G + 2, 116, 'fruit_bowl');
    b.set(28, G + 1, 116, 'table');
    t.tabletop(28, G + 2, 116, 'jug');
    b.set(21, G + 1, 121, 'table');
    t.tabletop(21, G + 2, 121, 'sewing_basket', 'n');
    constructionPalaceChest(b, 18, G + 1, 110, 'e', [['gold_leaf', 8], ['mirror', 2], ['honey_bottle', 6], ['red_wool', 8], ['yellow_wool', 8]]);
    t.banner(35, G + 4, 115, 'magenta', 'w');
    t.banner(35, G + 4, 104, 'purple', 'w');
    t.curtains(17, 112, 'z', 2, G + 3, G + 4, 'magenta', 'e');
    t.lamps(18, 98, 35, 122, G, (x, z) => Math.abs(x - 26) <= 1 && Math.abs(z - 110) <= 1);

    // Upstairs: the corridor and the hall, lit; the suites (see their plan above).
    t.lamps(32, 45, 35, 83, U);
    t.lamps(32, 98, 35, 122, U);
    for (const s of suites) {
        const { i, z0, z1, zm, zw, zb, zc, royal } = s;
        const colour = royal ? 'red' : ['blue', 'cyan', 'green', 'purple'][i % 4];
        // The bedroom: the bed under the window, its bedside table and lamp, the chest of linen, a carpet,
        // and a little table by the door with whatever was left on it.
        t.carpet(20, z0 + 1, 23, zb - 1, U + 1, colour, 'white');
        constructionPalaceBed(b, 18, U + 1, zc, 'w');
        if (royal) constructionPalaceBed(b, 18, U + 1, zc + 1, 'w');
        f.piece(18, U + 1, zc - 1, 'bedside_table', 'bedside_table', 'e');
        b.set(18, U + 2, zc - 1, 'table_lamp');
        constructionPalaceChest(b, 18, U + 1, zb, 'e', royal
            ? [['white_wool', 16], ['red_wool', 8], ['gold_leaf', 6], ['mirror', 1], ['warm_coat', 2]]
            : [['white_wool', 12], [['blue_wool', 'green_wool', 'yellow_wool', 'red_wool'][i % 4], 8], ['candle', 4], ['warm_coat', 1]]);
        b.set(24, U + 1, z0, 'table');
        t.chair(23, U + 1, z0, t.pick(['e', 'e', 's', 'n'], 23, U, z0, 71));
        t.tabletop(24, U + 2, z0, t.pick(['open_book', 'inkwell', 'sewing_basket', 'fruit_bowl', 'jug'], 24, U, z0, 73), 'w');
        t.banner(24, U + 3, zc, royal ? 'red' : 'cyan', 'w');
        t.curtains(17, zc - 1, 'z', 3, U + 2, U + 3, royal ? 'red' : 'white', 'e');
        t.lamps(18, z0, 24, zb, U);
        if (royal) {
            // The sultana's room is longer: a seat by the far wall, a low table with fruit, the globe.
            t.sofa(21, U + 1, z1, 'red', 'n');
            t.sofa(22, U + 1, z1, 'red', 'n');
            b.set(21, U + 1, z1 - 2, 'table');
            t.tabletop(21, U + 2, z1 - 2, 'fruit_bowl');
            b.set(24, U + 1, z1 - 1, 'globe');
        }
        // Behind it a closet (wardrobe, linen, a barrel of the room's candles and soap) or the nursery.
        if (s.nursery) {
            const zn = zb + 2;
            t.carpet(20, zn + 1, 23, z1 - 1, U + 1, 'yellow', 'white');
            constructionPalaceBed(b, 18, U + 1, zn + 3, 'w');
            f.piece(18, U + 1, zn + 2, 'bedside_table', 'bedside_table', 'e');
            b.set(18, U + 2, zn + 2, 'table_lamp');
            constructionPalaceChest(b, 18, U + 1, z1, 'e', [['white_wool', 12], ['yellow_wool', 8], ['honey_bottle', 2], ['candle', 4]]);
            b.set(24, U + 1, zn + 4, 'table');
            t.chair(23, U + 1, zn + 4, 'e');
            t.tabletop(24, U + 2, zn + 4, 'sewing_basket', 'w');
            t.curtains(17, zn + 2, 'z', 2, U + 2, U + 3, 'yellow', 'e');
            t.lamps(18, zn, 24, z1, U);
        } else if (s.back) {
            t.wardrobe(24, U + 1, z1, 'n', [['warm_coat', 1], ['white_wool', 8], ['leather', 2]]);
            constructionPalaceChest(b, 18, U + 1, z1, 'n', [['white_wool', 16], ['candle', 8], ['salt', 4]]);
            constructionPalaceChest(b, 19, U + 1, z1, 'n', [['baking_soda', 6], ['soda_water', 4], ['candle', 6]], 'barrel');
            t.lamps(18, zb + 2, 24, z1, U);
        }
        // The washroom: a bath, a toilet, a basin under a mirror.
        t.bathtub(26, U + 1, z0, 'e');
        f.piece(30, U + 1, z0, 'toilet', 'toilet', 'w');
        f.piece(30, U + 1, zw, 'sink', 'sink', 'w');
        f.piece(30, U + 2, zw, 'wall_mirror', 'wall_mirror', 'w');
        if (zw - z0 >= 3) constructionPalaceChest(b, 26, U + 1, zw, 'e', [['white_wool', 8], ['baking_soda', 4], ['salt', 4]]);
        t.lamps(26, z0, 30, zw, U);
        // The dressing room: the wardrobe, a mirror, a seat and a small table.
        t.wardrobe(30, U + 1, z1, 'w', royal ? [['warm_coat', 2], ['white_wool', 16], ['red_wool', 8], ['gold_leaf', 4]] : undefined);
        if (royal) t.wardrobe(30, U + 1, z1 - 1, 'w', [['white_wool', 12], ['yellow_wool', 8], ['warm_coat', 1]]);
        f.piece(26, U + 2, z1 - 1, 'wall_mirror', 'wall_mirror', 'e');
        t.sofa(27, U + 1, z1, royal ? 'red' : 'light_blue', 'n');
        b.set(26, U + 1, z1, 'table');
        t.tabletop(26, U + 2, z1, t.pick(['sewing_basket', 'jug', null, 'open_book'], 26, U, z1, 79), 'e');
        t.lamps(26, zm - 1, 30, z1, U);
    }

    // The roof, low and hipped, over the whole wing.
    t.roof(16, 43, 37, 124, U + 7);
}

// The Court of the Myrtles, its porticoes, the Sala de la Barca and the Comares tower with the throne hall.
function constructionPalaceAndalusiMyrtles(b, t) {
    const G = PALACE_ANDALUSI_GROUND;
    const { f } = t;
    // The court: marble, a long pool between hedges of myrtle, a round fountain at each end.
    for (let z = 45; z <= 94; z++) {
        for (let x = 38; x <= 62; x++) {
            b.set(x, G, z, (x + z) % 5 === 0 && (x < 45 || x > 55) ? 'limestone' : 'marble');
            for (let y = G + 1; y <= G + 12; y++) b.set(x, y, z, null);
        }
    }
    for (let z = 51; z <= 87; z++) {
        for (let x = 45; x <= 55; x++) {
            const kerb = x === 45 || x === 55 || z === 51 || z === 87;
            if (kerb) b.set(x, G + 1, z, 'white_glazed_tile_slab');
            else {
                b.set(x, G - 2, z, 'marble');
                b.set(x, G - 1, z, 'water');
                b.set(x, G, z, 'water');
            }
        }
    }
    for (let z = 52; z <= 86; z++) {
        if (z >= 68 && z <= 70) continue;
        for (const x of [42, 43, 57, 58]) b.set(x, G + 1, z, 'leaves');
    }
    t.basin(50, G, 48);
    t.basin(50, G, 90);
    for (const [x, z] of [[39, 49], [61, 49], [39, 89], [61, 89], [39, 69], [61, 69]]) t.f.lanternPost(x, G + 1, z, 'dark_oak_fence', 2);

    // The porticoes: slender columns, a wider arch in the middle, a beam, a wooden ceiling, an eave.
    const posts = [38, 41, 44, 47, 53, 56, 59, 62];
    for (const [zc, z0, z1] of [[47, 45, 46], [91, 92, 94]]) {
        for (let z = z0; z <= z1; z++) {
            for (let x = 38; x <= 62; x++) {
                b.set(x, G, z, constructionPalaceAndalusiStar(x, z, { star: 'blue_glazed_tile', heart: 'yellow_glazed_tile', cross: 'green_glazed_tile', ground: 'white_glazed_tile' }));
                b.set(x, G + 6, z, 'dark_oak_planks');
            }
        }
        t.arcade('x', zc, posts, G, { colH: 3, beamTop: 5 });
        for (let x = 38; x <= 62; x++) {
            b.set(x, G + 6, zc, 'cut_sandstone');
            b.stairs(x, G + 7, zc + (zc === 47 ? 1 : -1), 'brick_stairs', zc === 47 ? 'n' : 's');
            for (let z = z0; z <= z1; z++) b.set(x, G + 7, z, 'brick');
            b.set(x, G + 7, zc, 'brick');
        }
        t.lamps(39, z0, 61, z1, G);
    }
    // The south portico's back wall and the door from the lane, on the axis.
    for (let y = G + 1; y <= G + 7; y++) {
        for (let x = 37; x <= 63; x++) b.set(x, y, 44, t.wallAt('royal', x, y, 44, G, G + 6));
    }
    t.arch(49, 43, 'x', 3, G, { depth: 2, height: 4 });
    for (const x of [41, 58]) t.window(x, 43, 'x', 2, G, { depth: 2, pane: 0 });
    // The north portico's back wall, its door to the Sala de la Barca; the court's east wall goes up to the eaves.
    for (let y = G + 1; y <= G + 9; y++) {
        for (let x = 37; x <= 63; x++) b.set(x, y, 95, t.wallAt('royal', x, y, 95, G, G + 8));
    }
    for (let z = 44; z <= 95; z++) {
        for (let y = G + 1; y <= G + 12; y++) b.set(63, y, z, t.wallAt('blue', 63, y, z, G, G + 12));
    }

    // The Sala de la Barca: a long room with a ceiling like an upturned boat.
    t.room(38, 96, 62, 99, { h: 9, scheme: 'royal', floor: 'marble' });
    for (let x = 38; x <= 62; x++) {
        b.stairs(x, G + 7, 96, 'dark_oak_stairs', 'n', 'top');
        b.stairs(x, G + 7, 99, 'dark_oak_stairs', 's', 'top');
        b.stairs(x, G + 8, 97, 'dark_oak_stairs', 'n', 'top');
        b.stairs(x, G + 8, 98, 'dark_oak_stairs', 's', 'top');
        b.set(x, G + 7, 97, null);
        b.set(x, G + 7, 98, null);
    }
    t.arch(49, 95, 'x', 3, G, { height: 4 });
    for (const x of [40, 60]) t.sofa(x, G + 1, 99, 'blue', 'n');
    for (const x of [44, 56]) {
        b.set(x, G + 1, 99, 'vase');
        f.piece(x, G + 1, 96, 'statue', 'statue', 's');
    }
    t.lamps(38, 96, 62, 99, G, (x) => x >= 48 && x <= 52);
    t.lamp(50, 98, G);

    // The Comares tower: two blocks of wall round the throne hall, higher than everything, crenellated.
    const tw = { x0: 38, z0: 100, x1: 62, z1: 125 };
    const roofY = G + 18;
    for (let y = G; y <= roofY + 1; y++) {
        for (let z = tw.z0; z <= tw.z1; z++) {
            for (let x = tw.x0; x <= tw.x1; x++) {
                const ring = Math.min(x - tw.x0, tw.x1 - x, z - tw.z0, tw.z1 - z);
                if (y === roofY + 1) {
                    if (ring === 0) b.set(x, y, z, t.outer(x, y, z));
                    else b.set(x, y, z, null);
                    continue;
                }
                if (ring <= 1 || y === G || y === roofY) b.set(x, y, z, y === G + 4 || y === G + 12 ? 'cut_sandstone' : y === roofY ? ((x + z) % 2 ? 'cut_sandstone' : 'marble') : t.outer(x, y, z));
                else b.set(x, y, z, null);
            }
        }
    }
    t.merlons(tw.x0, tw.z0, tw.x1, tw.z1, roofY + 2);
    // Inside: the throne hall, 21 by 20, tiled in stars, a coffered ceiling of wood (the seven heavens).
    const hall = { x0: 40, z0: 102, x1: 60, z1: 121 };
    t.room(hall.x0, hall.z0, hall.x1, hall.z1, {
        h: roofY - G, scheme: 'royal',
        floor: (x, z) => constructionPalaceAndalusiStar(x - 50, z - 111, { star: 'blue_glazed_tile', heart: 'yellow_glazed_tile', cross: 'green_glazed_tile', ground: 'white_glazed_tile' })
    });
    t.coffer(hall.x0, hall.z0, hall.x1, hall.z1, G + 14, 3, 'dark_oak_stairs', 'dark_oak_planks', (x, z) => {
        const s = constructionPalaceAndalusiStar(x - 50, z - 111, { star: 'cherry_planks', heart: 'yellow_glazed_tile', cross: 'gold_block', ground: 'dark_oak_planks' });
        return s;
    });
    // Over it, the paving of the roof terrace (the room drew its own ceiling there).
    for (let z = hall.z0; z <= hall.z1; z++) {
        for (let x = hall.x0; x <= hall.x1; x++) b.set(x, roofY, z, (x + z) % 2 ? 'cut_sandstone' : 'marble');
    }
    // The walls above the dado: bands of carved stucco and tile up to the coffers.
    for (let y = G + 6; y <= G + 13; y++) {
        for (let z = hall.z0 - 1; z <= hall.z1 + 1; z++) {
            for (let x = hall.x0 - 1; x <= hall.x1 + 1; x++) {
                const wall = x < hall.x0 || x > hall.x1 || z < hall.z0 || z > hall.z1;
                if (wall) b.set(x, y, z, y === G + 9 ? 'turquoise_glazed_tile' : y === G + 13 ? 'cut_sandstone' : 'white_stucco');
            }
        }
    }
    // The door from the Barca, tall; three miradors in the far wall, the middle one behind the throne.
    t.arch(49, 100, 'x', 3, G, { height: 5, depth: 2 });
    for (const x of [43, 49, 55]) {
        t.arch(x, 122, 'x', 3, G, { height: 4, depth: 3 });
        t.window(x, 125, 'x', 3, G, { rel0: 1, rel1: 4 });
        b.box(x, G, 122, x + 2, G, 124, 'marble');
    }
    // High windows of lattice on the sides, over the roofs round the tower.
    for (const z of [104, 109, 114, 119]) {
        t.window(38, z, 'z', 2, G, { rel0: 11, rel1: 12, depth: 2, pane: 0 });
        if (z > 109) t.window(61, z, 'z', 2, G, { rel0: 11, rel1: 12, depth: 2, pane: 1 });
    }
    // The dais and the throne, facing the door; busts, banners, cushions along the walls, a great carpet.
    for (let z = 115; z <= 121; z++) {
        for (let x = 45; x <= 55; x++) b.set(x, G + 1, z, z === 115 ? null : 'marble');
    }
    for (let x = 45; x <= 55; x++) b.stairs(x, G + 1, 115, 'white_glazed_tile_stairs', 's');
    t.carpet(46, 117, 54, 121, G + 2, 'red', 'yellow');
    t.throne(50, G + 2, 120, 'jade_throne', 'n');
    for (const x of [46, 54]) f.piece(x, G + 2, 120, 'statue', 'statue', 'n');
    for (const x of [48, 52]) b.set(x, G + 2, 121, 'vase');
    t.carpet(45, 104, 55, 113, G + 1, 'blue', 'red');
    for (let z = 103; z <= 120; z++) {
        if (z % 3 === 0) continue;
        t.sofa(40, G + 1, z, z % 2 ? 'red' : 'blue', 'e');
        t.sofa(60, G + 1, z, z % 2 ? 'red' : 'blue', 'w');
    }
    for (const z of [105, 111, 117]) {
        t.banner(39, G + 7, z, 'green', 'e');
        t.banner(61, G + 7, z, 'red', 'w');
    }
    for (const x of [42, 58]) t.banner(x, G + 7, 101, 'blue', 's');
    for (const x of [43, 55]) {
        t.sofa(x + 1, G + 1, 124, 'yellow', 'n');
        f.lantern(x, G + 1, 124, 'floor');
        f.lantern(x + 2, G + 1, 124, 'floor');
    }
    t.sofa(50, G + 1, 124, 'red', 'n');
    f.lantern(49, G + 1, 124, 'floor');
    f.lantern(51, G + 1, 124, 'floor');
    t.lamps(hall.x0, hall.z0, hall.x1, hall.z1, G, (x, z) => x >= 45 && x <= 55 && z >= 115);
    for (const x of [47, 53]) t.lamp(x, 118, G + 1);
    // The roof of the tower: a terrace, its door from the stair well (constructionPalaceAndalusiMiddle).
    for (const z of [107, 108]) b.set(62, roofY + 1, z, null);
    t.f.lanternPost(44, roofY + 1, 106, 'dark_oak_fence', 1);
    t.f.lanternPost(56, roofY + 1, 119, 'dark_oak_fence', 1);
}

// Between the two courts: the Hall of Tilings (the science room), the baths, the vestibule of the stair,
// the stair well up to the library and the Comares roof, the treasury and the royal store.
function constructionPalaceAndalusiMiddle(b, t) {
    const G = PALACE_ANDALUSI_GROUND;
    const U = PALACE_ANDALUSI_UPPER;
    const { f } = t;

    // ---- The Hall of Tilings ----
    // Four panels of floor, each one motif repeated in one of the ways of the wallpaper groups: slid (p1),
    // mirrored (pm), turned half round (p2), turned a quarter at a time (p4); the walls in stars (p4m).
    const panels = [
        { group: 'p1', x0: 65, z0: 46, colour: 'blue_glazed_tile' },
        { group: 'pm', x0: 73, z0: 46, colour: 'green_glazed_tile' },
        { group: 'p2', x0: 65, z0: 52, colour: 'red_glazed_tile' },
        { group: 'p4', x0: 73, z0: 52, colour: 'turquoise_glazed_tile' }
    ];
    t.room(64, 45, 81, 57, {
        h: 7, scheme: 'royal',
        floor: (x, z) => {
            const panel = panels.find((p) => x >= p.x0 && x < p.x0 + 8 && z >= p.z0 && z < p.z0 + 5);
            if (!panel) return 'cut_sandstone';
            return constructionPalaceAndalusiWallpaper(panel.group, x - panel.x0, z - panel.z0) ? panel.colour : 'white_glazed_tile';
        },
        ceiling: (x, z) => constructionPalaceAndalusiStar(x, z, { star: 'cherry_planks', heart: 'yellow_glazed_tile', cross: 'spruce_planks', ground: 'dark_oak_planks' })
    });
    for (let y = G + 1; y <= G + 5; y++) {
        for (let x = 63; x <= 82; x++) {
            for (const z of [44, 58]) {
                if (y <= G + 4) b.set(x, y, z, constructionPalaceAndalusiStar(x, y - G + 2, { star: 'blue_glazed_tile', heart: 'yellow_glazed_tile', cross: 'green_glazed_tile', ground: 'white_glazed_tile' }));
            }
        }
    }
    t.arch(63, 50, 'z', 3, G, {});
    t.arch(82, 54, 'z', 3, G, {});
    t.arch(72, 43, 'x', 2, G, { depth: 2, door: 'oak_door' });
    // The instruments: an astrolabe on a pedestal, a globe, a desk with a lamp, the chest of star charts.
    b.set(68, G + 1, 51, 'cut_sandstone');
    f.piece(68, G + 2, 51, 'astrolabe', 'astrolabe', 'e');
    b.set(77, G + 1, 51, 'globe');
    f.piece(80, G + 1, 47, 'desk', 'desk', 'w');
    t.chair(79, G + 1, 48, 'n');
    b.set(80, G + 2, 47, 'table_lamp');
    // A table of the astronomer's work in progress: a chart unrolled, the books he was reading.
    b.set(80, G + 1, 55, 'table');
    b.set(79, G + 1, 55, 'table');
    t.tabletop(80, G + 2, 55, 'scroll', 'w');
    t.tabletop(79, G + 2, 55, 'book_stack', 'n');
    constructionPalaceChest(b, 81, G + 1, 49, 'w', [['star_chart', 4], ['astrolabe', 1], ['sundial', 1], ['globe', 1], ['telescope', 1], ['measuring_tape', 2], ['blue_glazed_tile', 16], ['white_glazed_tile', 16]]);
    f.piece(64, G + 1, 47, 'bookshelf', 'bookshelf', 'e');
    // The signs, each by what it explains.
    constructionPalaceAndalusiSign(b, 72, G + 1, 51, 'n', 'Teselaciones',
        'Una teselación cubre un suelo con piezas iguales, sin huecos ni montones. Los artistas nazaríes las hacían con azulejos.',
        'A tessellation covers a floor with matching tiles, with no gaps and no overlaps. Nasrid artists made them with glazed tiles.');
    constructionPalaceAndalusiSign(b, 73, G + 1, 51, 'n', 'Simetría',
        'Solo hay 17 maneras de repetir un dibujo en un plano: deslizarlo, girarlo o reflejarlo. Aquí ves cuatro, una en cada cuadro.',
        'There are only 17 ways to repeat a pattern on a flat surface: slide it, turn it or mirror it. Here are four, one in each panel.');
    constructionPalaceAndalusiSign(b, 69, G + 1, 50, 'n', 'Astrolabio',
        'Mide lo alto que está el sol sobre el horizonte. Con ese ángulo y la fecha se sabía la hora. Clic derecho.',
        'It measures how high the sun stands above the horizon. From that angle and the date people knew the time. Right click.');
    constructionPalaceAndalusiSign(b, 77, G + 1, 50, 'n', 'Globo',
        'La Tierra es una esfera. Un globo la muestra sin estirarla; un mapa plano siempre deforma algo.',
        'The Earth is a sphere. A globe shows it without stretching it; a flat map always distorts something.');
    const labels = [
        ['Deslizar', 'p1: el dibujo solo se desliza, sin girar ni reflejarse.', 'p1: the pattern only slides, never turning or mirroring.'],
        ['Espejo', 'pm: cada columna es el reflejo de la de al lado, como en un espejo.', 'pm: each column is the mirror image of the next one.'],
        ['Media vuelta', 'p2: una pieza sí y otra no, el dibujo da media vuelta.', 'p2: every other tile, the pattern turns half way round.'],
        ['Cuarto de vuelta', 'p4: cuatro piezas giran un cuarto de vuelta alrededor de un punto: un molinillo.', 'p4: four tiles turn a quarter turn each round one point, like a pinwheel.']
    ];
    panels.forEach((p, i) => constructionPalaceAndalusiSign(b, p.x0 + (i % 2 ? 7 : 0), G + 1, p.z0 === 46 ? 45 : 57, p.z0 === 46 ? 's' : 'n', ...labels[i]));
    t.lamps(64, 45, 81, 57, G);

    // ---- The baths ----
    // The rest hall (Sala de las Camas): cushions round a fountain, two storeys, a lantern of glass on top.
    t.room(64, 59, 81, 69, { h: 9, scheme: 'turquoise', floor: (x, z) => constructionPalaceAndalusiStar(x, z, { star: 'turquoise_glazed_tile', heart: 'white_glazed_tile', cross: 'blue_glazed_tile', ground: 'marble' }) });
    for (let z = 62; z <= 66; z++) {
        for (let x = 70; x <= 75; x++) b.set(x, G + 9, z, (x + z) % 2 ? 'light_blue_stained_glass' : 'white_stained_glass');
    }
    t.basin(72, G, 64);
    for (let x = 65; x <= 80; x++) {
        if (x === 72 || x === 67 || x === 68) continue;
        t.sofa(x, G + 1, 59, x % 2 ? 'cyan' : 'white', 's');
        t.sofa(x, G + 1, 69, x % 2 ? 'cyan' : 'white', 'n');
    }
    constructionPalaceChest(b, 81, G + 1, 61, 'w', [['white_wool', 24], ['salt', 8], ['baking_soda', 6], ['water_flask', 6], ['honey_bottle', 4]]);
    t.lamps(64, 59, 81, 69, G, (x, z) => Math.abs(x - 72) <= 1 && Math.abs(z - 64) <= 1);
    t.arch(63, 63, 'z', 3, G, {});
    t.arch(82, 63, 'z', 3, G, {});
    // The warm room and the hot room: vaults with star-shaped skylights, pools, the floor warmed from below.
    const skylights = (x0, z0, x1, z1) => {
        for (let z = z0 + 2; z <= z1 - 2; z += 4) {
            for (let x = x0 + 2; x <= x1 - 2; x += 4) {
                for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) b.set(x + dx, G + 6, z + dz, dx || dz ? 'yellow_stained_glass' : 'blue_stained_glass');
            }
        }
    };
    t.room(64, 71, 72, 86, { scheme: 'blue', floor: 'marble', ceiling: 'white_stucco' });
    t.room(74, 71, 81, 86, { scheme: 'blue', floor: 'marble', ceiling: 'white_stucco' });
    skylights(64, 71, 72, 86);
    skylights(74, 71, 81, 86);
    const pool = (x0, z0, x1, z1) => {
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                if (x === x0 || x === x1 || z === z0 || z === z1) b.set(x, G + 1, z, 'white_glazed_tile_slab');
                else {
                    b.set(x, G - 2, z, 'blue_glazed_tile');
                    b.set(x, G - 1, z, 'water');
                    b.set(x, G, z, 'water');
                }
            }
        }
    };
    pool(66, 76, 70, 82);
    pool(75, 74, 80, 83);
    for (const z of [72, 85]) {
        for (let x = 74; x <= 81; x += 7) b.set(x, G, z, 'magma_rock');
    }
    for (let z = 73; z <= 84; z++) {
        if (z % 3) {
            f.piece(64, G + 1, z, 'bench', 'bench', 'e');
            f.piece(72, G + 1, z, 'bench', 'bench', 'w');
        }
    }
    t.arch(67, 70, 'x', 2, G, {});
    t.arch(73, 78, 'z', 2, G, {});
    t.lamps(64, 71, 72, 86, G);
    t.lamps(74, 71, 81, 86, G);
    for (const [x, z] of [[65, 74], [65, 84], [71, 74], [71, 84], [74, 72], [81, 72], [74, 85], [81, 85]]) f.lantern(x, G + 1, z, 'floor');

    // ---- The vestibule of the stair ----
    t.room(64, 88, 81, 98, { scheme: 'green', floor: (x, z) => constructionPalaceAndalusiStar(x, z, { star: 'green_glazed_tile', heart: 'yellow_glazed_tile', cross: 'white_glazed_tile', ground: 'marble' }) });
    t.arch(63, 92, 'z', 3, G, {});
    t.arch(63, 97, 'z', 2, G, {});
    t.arch(82, 93, 'z', 2, G, { door: 'oak_door' });
    for (const x of [70, 78]) f.piece(x, G + 1, 88, 'statue', 'statue', 's');
    t.sofa(73, G + 1, 88, 'green', 's');
    t.sofa(74, G + 1, 88, 'green', 's');
    t.lamps(64, 88, 81, 98, G);

    // ---- The treasury and the royal store, with the library over them ----
    t.room(68, 100, 81, 109, { scheme: 'royal', floor: (x, z) => ((x + z) % 2 ? 'gold_block' : 'marble'), ceiling: 'dark_oak_planks' });
    t.room(63, 111, 81, 122, { scheme: 'plain', floor: 'cut_sandstone', ceiling: 'spruce_planks' });
    t.arch(74, 99, 'x', 2, G, { door: 'iron_door' });
    t.arch(74, 110, 'x', 2, G, { door: 'oak_door' });
    t.arch(82, 116, 'z', 2, G, {});
    constructionPalaceChest(b, 81, G + 1, 104, 'w', [['gold_leaf', 32], ['ruby', 6], ['sapphire', 5], ['gold_block', 2]]);
    constructionPalaceChest(b, 81, G + 1, 106, 'w', [['brass_ingot', 12], ['bronze_ingot', 12], ['amber', 3], ['cobalt_glass', 6], ['gold_ore', 8]]);
    constructionPalaceChest(b, 68, G + 1, 104, 'e', [['fluorite', 6], ['pyrite', 8], ['marble', 8], ['obsidian', 4], ['meteoric_iron', 1]]);
    for (const x of [71, 78]) f.piece(x, G + 1, 109, 'statue', 'statue', 'n');
    b.set(74, G + 1, 107, 'gold_block');
    b.set(75, G + 1, 107, 'gold_block');
    b.set(74, G + 2, 107, 'vase');
    t.lamps(68, 100, 81, 109, G);
    [
        [['red_wool', 32], ['blue_wool', 32], ['yellow_wool', 16], ['green_wool', 16]],
        [['rust_pigment', 8], ['cobalt_glass', 8], ['gold_leaf', 8], ['honeycomb', 8]],
        [['white_glazed_tile', 32], ['blue_glazed_tile', 32], ['white_stucco', 24], ['sandstone', 24]],
        [['candle', 32], ['lantern', 8], ['glass', 16]]
    ].forEach((items, i) => constructionPalaceChest(b, 65 + i * 4, G + 1, 122, 'n', items, i % 2 ? 'chest' : 'barrel'));
    t.lamps(63, 111, 81, 122, G);

    // ---- The stair well, beside the tower: up to the library (U) and on to the Comares roof ----
    // Three flights of 6 round a 4-wide well: up along the west half, back along the east half, up again.
    for (let y = G; y <= G + 21; y++) {
        for (let z = 99; z <= 109; z++) {
            for (let x = 62; x <= 67; x++) {
                const edge = x === 62 || x === 67 || z === 99 || z === 109;
                if (edge) {
                    if (x !== 62 || y > G + 18) b.set(x, y, z, y === G + 4 ? 'cut_sandstone' : t.outer(x, y, z));
                } else b.set(x, y, z, y === G ? 'cut_sandstone' : null);
            }
        }
    }
    b.box(62, G + 22, 99, 67, G + 22, 109, 'cut_sandstone');
    t.merlons(62, 99, 67, 109, G + 23);
    const flat = 'cut_sandstone';
    // Each flight's last step is level with its landing: the landing is the rest of that end.
    t.flight(63, 102, G, 6, 's', 'sandstone_stairs');
    b.box(63, G + 6, 108, 66, G + 6, 108, flat);
    b.box(65, G + 6, 107, 66, G + 6, 107, flat);
    t.flight(65, 106, G + 6, 6, 'n', 'sandstone_stairs');
    b.box(63, G + 12, 100, 66, G + 12, 100, flat);
    b.box(63, G + 12, 101, 64, G + 12, 101, flat);
    t.flight(63, 102, G + 12, 6, 's', 'sandstone_stairs');
    b.box(63, G + 18, 108, 66, G + 18, 108, flat);
    b.box(65, G + 18, 107, 66, G + 18, 107, flat);
    // Under the second flight and the first landing, solid: a wall beside the first flight.
    b.box(65, G + 1, 102, 66, G + 5, 108, flat);
    b.box(63, G + 1, 108, 64, G + 5, 108, flat);
    for (const y of [G, G + 6, G + 12, G + 18]) {
        const z = y === G || y === G + 12 ? 100 : 108;
        f.lantern(y === G + 12 ? 66 : 63, y + 1, z, 'floor');
    }
    f.lantern(66, G + 1, 101, 'floor');
    f.lantern(66, G + 7, 107, 'floor');
    f.lantern(63, G + 19, 107, 'floor');
    f.lantern(66, G + 13, 100, 'floor');
    f.lantern(66, G + 6, 104, 'floor');
    t.lamp(65, 104, G + 12);
    for (const y of [G + 3, G + 9, G + 15]) t.window(67, 104, 'z', 1, y, { rel0: 0, rel1: 1 });
    t.arch(64, 99, 'x', 3, G, {});
    for (const z of [107, 108]) {
        b.set(67, U + 1, z, null);
        b.set(67, U + 2, z, null);
        b.set(62, G + 19, z, null);
        b.set(62, G + 20, z, null);
    }

    // The library, over the treasury and the store: shelves along the walls, desks under lattice windows
    // over the garden, the chest of charts and plans.
    t.room(68, 100, 81, 122, { y: U, scheme: 'green', floor: (x, z) => ((x + z) % 2 ? 'cherry_planks' : 'dark_oak_planks'), ceiling: (x, z) => constructionPalaceAndalusiStar(x, z, { star: 'cherry_planks', heart: 'gold_block', cross: 'spruce_planks', ground: 'dark_oak_planks' }) });
    for (const z of [107, 108]) {
        b.set(67, U + 1, z, null);
        b.set(67, U + 2, z, null);
    }
    for (let z = 101; z <= 121; z++) {
        if (z === 107 || z === 108) continue;
        f.piece(68, U + 1, z, 'bookshelf', 'bookshelf', 'e');
        f.piece(68, U + 2, z, 'bookshelf', 'bookshelf', 'e');
    }
    for (let x = 70; x <= 79; x++) {
        f.piece(x, U + 1, 122, 'bookshelf', 'bookshelf', 'n');
        f.piece(x, U + 1, 100, 'bookshelf', 'bookshelf', 's');
    }
    // Desks under the windows, each as its reader left it: a letter half written, a book open, a chair
    // pushed back or turned to talk.
    const desks = { 103: ['candle', 'e', 80], 108: ['inkwell', 'e', 79], 113: ['open_book', 's', 80], 118: ['candle', 'n', 79] };
    for (const z of [103, 108, 113, 118]) {
        const [top, facing, chairX] = desks[z];
        t.window(82, z, 'z', 2, U, { rel0: 2, rel1: 3 });
        f.piece(81, U + 1, z, 'desk', 'desk', 'w');
        t.chair(chairX, U + 1, z, facing);
        if (top === 'candle') b.set(81, U + 2, z, 'candle');
        else t.tabletop(81, U + 2, z, top, 'w');
    }
    for (let z = 104; z <= 118; z += 2) b.set(75, U + 1, z, 'table');
    for (const z of [104, 112, 118]) b.set(75, U + 2, z, 'table_lamp');
    t.tabletop(75, U + 2, 106, 'open_book', 'e');
    t.tabletop(75, U + 2, 110, 'scroll', 'e');
    t.tabletop(75, U + 2, 114, 'book_stack', 'w');
    b.set(73, U + 1, 110, 'globe');
    constructionPalaceChest(b, 78, U + 1, 121, 'n', [['star_chart', 6], ['blueprint', 8], ['breeding_notebook', 2], ['candle', 12]]);
    constructionPalaceChest(b, 72, U + 1, 121, 'n', [['telescope', 1], ['measuring_tape', 2], ['thermometer', 1], ['barometer', 1], ['candle', 8]]);
    t.lamps(68, 100, 81, 122, U);

    // Roofs: hipped over the Hall of Tilings, the vestibule and the library; flat over the baths, their
    // skylights showing.
    t.roof(63, 44, 82, 58, G + 8);
    t.roof(63, 87, 82, 99, G + 7);
    t.roof(67, 99, 82, 123, U + 7);
    t.roof(63, 109, 67, 123, G + 7);
}

// The Court of the Lions: its arcade all round, the fountain of the twelve lions and four channels, the two
// pavilions, and the halls round it: Abencerrajes and the bedrooms over it, Two Sisters, the Hall of Kings.
function constructionPalaceAndalusiLions(b, t) {
    const G = PALACE_ANDALUSI_GROUND;
    const U = PALACE_ANDALUSI_UPPER;
    const { f } = t;
    const cx = 98;
    const cz = 64;
    const mirror = (x) => 2 * cx - x;

    // ---- The rooms south of the court, one storey over another ----
    const south = [[83, 88], [90, 106], [108, 113], [115, 122]];
    for (const [x0, x1] of south) t.room(x0, 45, x1, 51, { scheme: x0 === 90 ? 'royal' : 'turquoise', floor: x0 === 115 ? 'cut_sandstone' : 'marble' });
    for (const [x0, x1] of south) {
        t.room(x0, 45, x1, 51, {
            y: U, scheme: 'royal', floor: (x, z) => constructionPalaceAndalusiStar(x, z, { star: 'red_glazed_tile', heart: 'yellow_glazed_tile', cross: 'blue_glazed_tile', ground: 'white_glazed_tile' })
        });
    }
    // The sultan's rooms upstairs: an antechamber (x 90..96), an arch, the bedchamber, and in its corner his
    // washroom (x 104..106, z 49..51). The way on to the prince's room keeps to the near wall, by one door.
    for (let y = U + 1; y <= U + 5; y++) {
        for (let z = 45; z <= 51; z++) b.set(97, y, z, t.wallAt('royal', 97, y, z, U, U + 5));
    }
    t.arch(97, 47, 'z', 3, U, {});
    t.room(104, 49, 106, 51, { y: U, scheme: 'turquoise', floor: 'white_glazed_tile', ceiling: 'white_stucco' });
    t.arch(103, 50, 'z', 1, U, { door: 'oak_door' });
    for (const x of [89, 107, 114]) {
        t.arch(x, 47, 'z', 2, G, {});
        t.arch(x, 47, 'z', x === 107 ? 1 : 2, U, { door: 'cherry_door' });
    }
    t.flight(83, 46, G, 6, 's', 'sandstone_stairs');
    b.box(85, U + 1, 46, 85, U + 1, 50, 'lattice_screen');
    b.box(83, U + 1, 45, 84, U + 1, 45, 'lattice_screen');
    // Abencerrajes: a music room of cushions round a little fountain, under a star-shaped lantern.
    t.basin(98, G, 48);
    for (let x = 91; x <= 105; x++) {
        if (Math.abs(x - 98) > 1) t.sofa(x, G + 1, 45, x % 2 ? 'orange' : 'yellow', 's');
    }
    t.carpet(92, 50, 104, 51, G + 1, 'orange', 'red');
    t.lamps(90, 45, 106, 51, G, (x, z) => Math.abs(x - 98) <= 1 && Math.abs(z - 48) <= 1);
    t.lamps(83, 45, 88, 51, G, (x) => x <= 84);
    t.lamp(87, 47, G);
    // The music room: cushions, a table, lamps.
    for (let x = 108; x <= 113; x++) t.sofa(x, G + 1, 45, 'blue', 's');
    b.set(110, G + 1, 48, 'table');
    b.set(111, G + 1, 48, 'table');
    b.set(110, G + 2, 48, 'candle');
    t.tabletop(111, G + 2, 48, 'open_book', 's');
    t.lamps(108, 45, 113, 51, G);
    // The pantry beside the Hall of Kings: an oven, a sink, barrels of what is served.
    t.oven(122, G + 1, 46, 'w', [['raw_fish', 6], ['coal_ore', 8]]);
    f.piece(122, G + 1, 48, 'sink', 'sink', 'w');
    constructionPalaceChest(b, 115, G + 1, 45, 's', [['bread', 24], ['cheese', 12], ['honey_bottle', 8], ['soda_water', 6]], 'barrel');
    constructionPalaceChest(b, 116, G + 1, 45, 's', [['cooked_fish', 16], ['roast_mushroom', 8], ['milk', 4], ['cold_water', 6]], 'barrel');
    b.set(118, G + 1, 48, 'table');
    b.set(119, G + 1, 48, 'table');
    t.tabletop(118, G + 2, 48, 'meal_plate');
    t.tabletop(119, G + 2, 48, 'fruit_bowl');
    t.lamps(115, 45, 122, 51, G);
    // Upstairs: the landing, the sultan's bedroom, the prince's and the princesses'.
    t.lamps(83, 45, 88, 51, U, (x) => x <= 85);
    t.lamp(87, 48, U);
    const bedroom = (x0, x1, colour, beds) => {
        for (let k = 0; k < beds; k++) constructionPalaceBed(b, x0 + 1 + k * 3, U + 1, 45, 'n');
        t.wardrobe(x1, U + 1, 45, 'w');
        f.piece(x0, U + 1, 45, 'bedside_table', 'bedside_table', 's');
        b.set(x0, U + 2, 45, 'table_lamp');
        t.carpet(x0 + 1, 48, x1 - 1, 50, U + 1, colour, 'white');
        t.lamps(x0, 45, x1, 51, U);
    };
    // The sultan's antechamber: his seat, a game of chess left half played between two cushions, a mirror.
    t.carpet(91, 46, 95, 50, U + 1, 'red', 'yellow');
    t.throne(93, U + 1, 45, 'gilded_throne', 's');
    b.set(93, U + 1, 50, 'table');
    t.tabletop(93, U + 2, 50, 'chessboard', 'e');
    t.sofa(92, U + 1, 50, 'red', 'e');
    t.sofa(94, U + 1, 50, 'red', 'w');
    f.piece(90, U + 2, 50, 'wall_mirror', 'wall_mirror', 'e');
    t.lamps(90, 45, 96, 51, U);
    // His bedchamber: a wide bed, a jug of water by it, a desk with a letter he has not finished.
    t.carpet(99, 48, 102, 50, U + 1, 'red', 'white');
    for (const x of [100, 101]) constructionPalaceBed(b, x, U + 1, 45, 'n');
    f.piece(99, U + 1, 45, 'bedside_table', 'bedside_table', 's');
    b.set(99, U + 2, 45, 'table_lamp');
    f.piece(102, U + 1, 45, 'bedside_table', 'bedside_table', 's');
    t.tabletop(102, U + 2, 45, 'jug');
    t.wardrobe(106, U + 1, 45, 'w');
    constructionPalaceChest(b, 106, U + 1, 46, 'w', [['white_wool', 16], ['red_wool', 12], ['warm_coat', 2], ['gold_leaf', 8], ['mirror', 1]]);
    f.piece(102, U + 1, 51, 'desk', 'desk', 'n');
    t.chair(102, U + 1, 49, 's');
    t.tabletop(102, U + 2, 51, 'inkwell', 'n');
    t.lamps(98, 45, 106, 51, U, (x, z) => x >= 103 && z >= 48);
    // His washroom.
    t.bathtub(104, U + 1, 51, 'e');
    f.piece(106, U + 1, 51, 'toilet', 'toilet', 'w');
    f.piece(106, U + 1, 49, 'sink', 'sink', 'w');
    f.piece(106, U + 2, 49, 'wall_mirror', 'wall_mirror', 'w');
    t.lamps(104, 49, 106, 51, U);
    bedroom(108, 113, 'blue', 1);
    constructionPalaceChest(b, 113, U + 1, 50, 'w', [['blue_wool', 12], ['white_wool', 8], ['warm_coat', 1], ['telescope', 1]]);
    b.set(108, U + 1, 51, 'table');
    t.chair(109, U + 1, 51, 'n');
    t.tabletop(108, U + 2, 51, 'scroll', 'e');
    bedroom(115, 122, 'pink', 2);
    constructionPalaceChest(b, 122, U + 1, 50, 'w', [['white_wool', 12], ['yellow_wool', 8], ['red_wool', 6], ['warm_coat', 2]]);
    b.set(115, U + 1, 51, 'table');
    t.chair(116, U + 1, 51, 'w');
    t.tabletop(115, U + 2, 51, 'sewing_basket', 'e');
    for (const x of [86, 98, 111, 119]) t.window(x, 43, 'x', 1, U, { depth: 2, pane: 0 });
    for (const [x, colour] of [[98, 'red'], [111, 'blue'], [119, 'pink']]) t.curtains(x, 44, 'x', 1, U + 2, U + 3, colour, 's');

    // ---- The court and its gallery ----
    for (let z = 53; z <= 75; z++) {
        for (let x = 83; x <= 113; x++) {
            const inCourt = x >= 87 && x <= 109 && z >= 57 && z <= 71;
            b.set(x, G, z, inCourt ? ((x + z) % 2 ? 'marble' : 'limestone') : constructionPalaceAndalusiStar(x, z, { star: 'blue_glazed_tile', heart: 'white_glazed_tile', cross: 'yellow_glazed_tile', ground: 'marble' }));
            for (let y = G + 1; y <= G + 12; y++) b.set(x, y, z, null);
            if (!inCourt) b.set(x, G + 5, z, 'dark_oak_planks');
        }
    }
    // The outer walls of the gallery, decorated, with the eaves over the columns.
    for (let y = G + 1; y <= G + 6; y++) {
        for (let x = 82; x <= 114; x++) {
            b.set(x, y, 52, t.wallAt('blue', x, y, 52, G, G + 6));
            b.set(x, y, 76, t.wallAt('blue', x, y, 76, G, G + 6));
        }
        for (let z = 52; z <= 76; z++) {
            b.set(82, y, z, t.wallAt('blue', 82, y, z, G, G + 6));
            b.set(114, y, z, t.wallAt('blue', 114, y, z, G, G + 6));
        }
    }
    // Columns, single and paired, with a wider arch on each axis.
    const across = [86, 89, 92, 95, 96, 100, 101, 104, 107, 110];
    const along = [56, 59, 60, 68, 69, 72];
    for (const z of [56, 72]) t.arcade('x', z, across, G, { colH: 3, beamTop: 4 });
    for (const x of [86, 110]) {
        t.arcade('z', x, along.slice(0, 3), G, { colH: 3, beamTop: 4 });
        t.arcade('z', x, along.slice(3), G, { colH: 3, beamTop: 4 });
    }
    for (let x = 86; x <= 110; x++) {
        for (const z of [56, 72]) {
            b.set(x, G + 5, z, 'cut_sandstone');
            b.stairs(x, G + 6, z, 'brick_stairs', z === 56 ? 's' : 'n');
        }
    }
    for (let z = 56; z <= 72; z++) {
        for (const x of [86, 110]) {
            b.set(x, G + 5, z, 'cut_sandstone');
            b.stairs(x, G + 6, z, 'brick_stairs', x === 86 ? 'e' : 'w');
        }
    }
    for (let z = 52; z <= 76; z++) {
        for (let x = 82; x <= 114; x++) {
            const inGallery = !(x >= 87 && x <= 109 && z >= 57 && z <= 71) && !(x >= 86 && x <= 110 && z >= 56 && z <= 72);
            if (inGallery) b.set(x, G + 6, z, 'brick');
        }
    }
    // The pavilions, one at each end of the court's long axis: four columns, a pyramid of green tiles.
    for (const side of [1, -1]) {
        const px = (x) => (side === 1 ? x : mirror(x));
        for (let z = 60; z <= 68; z++) {
            for (let x = 86; x <= 90; x++) b.set(px(x), G + 4, z, 'cut_sandstone');
        }
        for (let z = 61; z <= 67; z++) {
            for (let x = 86; x <= 89; x++) {
                for (let y = G + 1; y <= G + 3; y++) b.set(px(x), y, z, null);
            }
        }
        for (const [x, z] of [[87, 61], [89, 61], [87, 67], [89, 67], [89, 64]]) {
            if (x === 89 && z === 64) continue;
            b.box(px(x), G + 1, z, px(x), G + 3, z, 'marble');
        }
        for (let k = 0; k <= 2; k++) {
            for (let z = 60 + k; z <= 68 - k; z++) {
                for (let x = 86 + k; x <= 90 - k; x++) {
                    const edge = x === 86 + k || x === 90 - k || z === 60 + k || z === 68 - k;
                    if (!edge) continue;
                    const facing = x === 86 + k ? 'e' : x === 90 - k ? 'w' : z === 60 + k ? 's' : 'n';
                    b.stairs(px(x), G + 5 + k, z, 'green_glazed_tile_stairs', side === 1 ? facing : facing === 'e' ? 'w' : facing === 'w' ? 'e' : facing);
                }
            }
        }
        b.box(px(88), G + 7, 63, px(88), G + 7, 65, 'green_glazed_tile');
        b.set(px(88), G + 8, 64, 'gold_block');
        t.basin(px(88), G, 64);
    }
    // The fountain: a basin of twelve lions round a pedestal, water round them, a rim, and a channel to each side.
    for (let dz = -5; dz <= 5; dz++) {
        for (let dx = -5; dx <= 5; dx++) {
            const d = Math.hypot(dx, dz);
            const [x, z] = [cx + dx, cz + dz];
            if (d <= 1.5) {
                b.set(x, G, z, 'marble');
                b.set(x, G + 1, z, dx || dz ? 'white_glazed_tile_slab' : 'marble');
            } else if (d <= 2.3) {
                b.set(x, G, z, 'marble');
                const facing = Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 'e' : 'w') : (dz > 0 ? 's' : 'n');
                b.stairs(x, G + 1, z, 'sandstone_stairs', facing);
            } else if (d <= 3.6) {
                b.set(x, G - 2, z, 'marble');
                b.set(x, G - 1, z, 'water');
                b.set(x, G, z, 'water');
            } else if (d <= 4.5) {
                b.set(x, G, z, 'marble');
                if (dx && dz) b.set(x, G + 1, z, 'white_glazed_tile_slab');
                else {
                    b.set(x, G - 1, z, 'marble');
                    b.set(x, G, z, 'water');
                }
            }
        }
    }
    b.set(cx, G + 2, cz, 'fountain');
    const channel = (x, z) => {
        b.set(x, G - 1, z, 'marble');
        b.set(x, G, z, 'water');
    };
    for (let x = 89; x <= 93; x++) {
        channel(x, cz);
        channel(mirror(x), cz);
    }
    for (let z = 57; z <= 59; z++) {
        channel(cx, z);
        channel(cx, 2 * cz - z);
    }
    for (const [x, z] of [[88, 58], [108, 58], [88, 70], [108, 70]]) b.set(x, G + 1, z, 'flower_pot');
    // The sundial in the court, in the sun, and its sign.
    b.set(92, G + 1, 59, 'sundial');
    constructionPalaceAndalusiSign(b, 91, G + 1, 58, 'w', 'Reloj de sol',
        'La sombra del gnomon gira con el sol y marca la hora. Al mediodía es la más corta. Clic derecho para leerlo.',
        'The shadow of the gnomon turns with the sun and shows the hour. At noon it is the shortest. Right click to read it.');
    // Lamps in the gallery, and on posts in the court for the night.
    t.lamps(83, 53, 85, 75, G);
    t.lamps(111, 53, 113, 75, G);
    t.lamps(86, 53, 110, 55, G);
    t.lamps(86, 73, 110, 75, G);
    for (const [x, z] of [[90, 59], [106, 59], [90, 69], [106, 69]]) f.lanternPost(x, G + 1, z, 'dark_oak_fence', 2);
    // Doors from the gallery into the halls round it.
    t.arch(97, 52, 'x', 3, G, { height: 4 });
    t.arch(85, 52, 'x', 2, G, {});
    t.arch(110, 52, 'x', 2, G, {});
    t.arch(97, 76, 'x', 3, G, { height: 4 });
    for (const z of [57, 63, 69]) t.arch(114, z, 'z', 3, G, { height: 4 });

    // ---- The Hall of the Two Sisters: the audience hall, high, its dome of stepped tiles round a star of glass ----
    t.room(89, 77, 107, 89, { h: 13, scheme: 'royal', floor: (x, z) => constructionPalaceAndalusiStar(x - cx, z - 83, { star: 'blue_glazed_tile', heart: 'yellow_glazed_tile', cross: 'green_glazed_tile', ground: 'white_glazed_tile' }) });
    t.coffer(89, 77, 107, 89, G + 9, 4, 'turquoise_glazed_tile_stairs', 'white_stucco', (x, z) => (Math.abs(x - cx) + Math.abs(z - 83) <= 2 ? 'yellow_stained_glass' : 'white_stucco'));
    for (let y = G + 6; y <= G + 8; y++) {
        for (let z = 76; z <= 90; z++) {
            for (let x = 88; x <= 108; x++) {
                if (x === 88 || x === 108 || z === 76 || z === 90) b.set(x, y, z, y === G + 7 ? 'turquoise_glazed_tile' : 'white_stucco');
            }
        }
    }
    t.room(83, 77, 87, 89, { scheme: 'turquoise', floor: 'marble' });
    t.room(109, 77, 113, 89, { scheme: 'turquoise', floor: 'marble' });
    t.arch(97, 76, 'x', 3, G, { height: 4 });
    t.arch(88, 82, 'z', 3, G, {});
    t.arch(108, 82, 'z', 3, G, {});
    t.arch(97, 90, 'x', 3, G, { height: 4 });
    for (const x of [93, 102]) t.window(x, 90, 'x', 2, G, { rel0: 1, rel1: 3 });
    t.basin(cx, G, 83);
    t.carpet(91, 78, 105, 80, G + 1, 'blue', 'yellow');
    t.carpet(91, 86, 105, 88, G + 1, 'blue', 'yellow');
    for (let z = 78; z <= 88; z++) {
        if (z === 82 || z === 83 || z === 84) continue;
        t.sofa(89, G + 1, z, 'blue', 'e');
        t.sofa(107, G + 1, z, 'blue', 'w');
    }
    t.lamps(89, 77, 107, 89, G, (x, z) => Math.abs(x - cx) <= 1 && Math.abs(z - 83) <= 1);
    for (const x0 of [83, 109]) {
        for (let z = 78; z <= 88; z += 2) t.sofa(x0 + (x0 === 83 ? 0 : 4), G + 1, z, 'cyan', x0 === 83 ? 'e' : 'w');
        t.lamps(x0, 77, x0 + 4, 89, G);
    }
    for (const x of [92, 104]) t.banner(x, G + 4, 77, 'blue', 's');

    // ---- The Hall of Kings: the banquet hall, alcoves on the court, a ceiling painted in red and white ----
    t.room(115, 53, 122, 75, { h: 7, scheme: 'royal', floor: 'marble', ceiling: (x, z) => ((x + z) % 3 === 0 ? 'red_wool' : (x + z) % 3 === 1 ? 'white_wool' : 'yellow_wool') });
    for (const z of [57, 63, 69]) t.arch(114, z, 'z', 3, G, { height: 4 });
    for (let z = 56; z <= 72; z++) {
        b.set(118, G + 1, z, 'table');
        b.set(119, G + 1, z, 'table');
        // The chairs as the guests left them: most at the table, a few turned away from it.
        if (z % 2 === 0) {
            t.chair(117, G + 1, z, t.pick(['e', 'e', 'e', 'n'], 117, G, z, 89));
            t.chair(120, G + 1, z, t.pick(['w', 'w', 'w', 's'], 120, G, z, 89));
        }
        if (z % 4 === 0) b.set(118, G + 2, z, 'candle');
        if (z % 4 === 2) b.set(119, G + 2, z, 'vase');
        // What is left of the banquet: plates, fruit, jugs.
        if (z % 4 === 0) t.tabletop(119, G + 2, z, t.pick(['meal_plate', 'fruit_bowl', 'jug', null], 119, G, z, 97));
        if (z % 4 === 2) t.tabletop(118, G + 2, z, t.pick(['meal_plate', 'fruit_bowl', 'jug', null], 118, G, z, 97));
    }
    t.throne(118, G + 1, 74, 'lacquer_throne', 'n');
    constructionPalaceChest(b, 122, G + 1, 54, 'w', [['bread', 16], ['cheese', 12], ['honey_bottle', 8], ['cooked_fish', 12]]);
    for (const z of [58, 64, 70]) t.banner(122, G + 4, z, 'red', 'w');
    t.lamps(115, 53, 122, 75, G);
    t.arch(118, 52, 'x', 2, G, {});
    // Beyond it, off the Hall of Kings: a small privy (4 by 4) and the store of the banquet's linen and
    // candles; behind them the chamberlain's office, which opens from the east alcove of the Two Sisters.
    t.room(115, 77, 118, 80, { scheme: 'turquoise', floor: 'marble' });
    t.room(120, 77, 122, 80, { scheme: 'plain', floor: 'cut_sandstone', ceiling: 'spruce_planks' });
    t.room(115, 82, 122, 89, { scheme: 'green', floor: (x, z) => ((x + z) % 2 ? 'cherry_planks' : 'dark_oak_planks') });
    t.arch(116, 76, 'x', 1, G, { door: 'oak_door' });
    t.arch(121, 76, 'x', 1, G, { door: 'oak_door' });
    t.arch(114, 85, 'z', 1, G, { door: 'oak_door' });
    t.bathtub(115, G + 1, 80, 'e');
    f.piece(118, G + 1, 80, 'toilet', 'toilet', 'w');
    f.piece(118, G + 1, 78, 'sink', 'sink', 'w');
    f.piece(118, G + 2, 78, 'wall_mirror', 'wall_mirror', 'w');
    constructionPalaceChest(b, 115, G + 1, 78, 'e', [['white_wool', 16], ['soda_water', 4], ['salt', 4]]);
    t.lamps(115, 77, 118, 80, G);
    constructionPalaceChest(b, 122, G + 1, 78, 'w', [['white_wool', 32], ['red_wool', 16], ['yellow_wool', 8]]);
    constructionPalaceChest(b, 122, G + 1, 80, 'w', [['candle', 32], ['lantern', 4], ['glass', 8]]);
    constructionPalaceChest(b, 120, G + 1, 80, 'e', [['honey_bottle', 8], ['soda_water', 8], ['cold_water', 8]], 'barrel');
    t.lamps(120, 77, 122, 80, G);
    // The office: a desk with a letter half written and the chair pushed back from it, the guest lists and
    // plans on a table, shelves of books, the chest of his papers, a window onto the land outside.
    f.piece(122, G + 1, 85, 'desk', 'desk', 'w');
    t.chair(120, G + 1, 85, 'e');
    t.tabletop(122, G + 2, 85, 'inkwell', 'w');
    for (const x of [117, 118]) b.set(x, G + 1, 84, 'table');
    t.chair(117, G + 1, 83, 'w');
    t.tabletop(117, G + 2, 84, 'scroll', 's');
    t.tabletop(118, G + 2, 84, 'book_stack', 's');
    for (let x = 116; x <= 121; x++) f.piece(x, G + 1, 89, 'bookshelf', 'bookshelf', 'n');
    constructionPalaceChest(b, 115, G + 1, 89, 'e', [['blueprint', 8], ['measuring_tape', 1], ['candle', 8], ['breeding_notebook', 1]]);
    t.window(123, 87, 'z', 2, G, { depth: 2, pane: 1 });
    t.lamps(115, 82, 122, 89, G);

    // Roofs: hipped over the halls, a tall one over the Two Sisters.
    t.roof(82, 43, 123, 52, U + 7);
    t.roof(114, 52, 123, 90, G + 8);
    t.roof(82, 76, 88, 90, G + 7);
    t.roof(108, 76, 114, 90, G + 7);
    t.roof(88, 76, 108, 90, G + 14);
    for (let z = 81; z <= 85; z++) {
        for (let x = 96; x <= 100; x++) {
            if (Math.abs(x - cx) + Math.abs(z - 83) <= 2) {
                for (let y = G + 14; y <= G + 19; y++) b.set(x, y, z, null);
            }
        }
    }
}

// The garden after the Generalife: three terraces going up away from the palace, orange trees in beds edged
// with myrtle, cypresses, a channel along the axis, a long pool with a bridge, a pergola, a mirador on top.
function constructionPalaceAndalusiGarden(b, t) {
    const G = PALACE_ANDALUSI_GROUND;
    const { f } = t;
    const ax = 102;
    const pebbles = (x, z) => ((x * 3 + z) % 5 === 0 ? 'basalt' : 'limestone');
    const terraces = [[91, 100, 0], [102, 111, 1], [113, 122, 2]];
    for (const [z0, z1, up] of terraces) {
        for (let z = z0; z <= z1; z++) {
            for (let x = 83; x <= 122; x++) {
                const bed = Math.abs(x - ax) > 3 && x > 84 && x < 121 && z > z0 && z < z1;
                for (let k = 0; k <= up; k++) b.set(x, G + k, z, k < up ? 'sandstone' : bed ? 'grass' : pebbles(x, z));
                for (let y = G + up + 1; y <= G + 12; y++) b.set(x, y, z, null);
            }
        }
    }
    // The retaining walls and the stairs up them on the axis.
    for (let x = 83; x <= 122; x++) {
        b.set(x, G + 1, 101, 'cut_sandstone');
        b.box(x, G + 1, 112, x, G + 2, 112, 'cut_sandstone');
    }
    for (let x = ax - 2; x <= ax + 2; x++) {
        b.stairs(x, G + 1, 101, 'sandstone_stairs', 's');
        b.stairs(x, G + 2, 112, 'sandstone_stairs', 's');
        b.set(x, G + 1, 112, 'cut_sandstone');
    }
    // The first terrace: a channel on the axis with a fountain at its head and a bridge, beds of orange trees.
    for (let z = 93; z <= 99; z++) {
        b.set(ax, G - 1, z, 'marble');
        b.set(ax, G, z, 'water');
        b.set(ax - 1, G, z, 'marble');
        b.set(ax + 1, G, z, 'marble');
    }
    b.set(ax, G + 1, 96, 'sandstone_slab');
    t.basin(ax, G, 92);
    for (const x of [87, 92, 112, 117]) {
        for (const z of [94, 98]) t.orange(x, G + 1, z);
    }
    for (let x = 85; x <= 120; x++) {
        if (Math.abs(x - ax) <= 4) continue;
        for (const z of [92, 99]) if (x % 6 !== 2) b.set(x, G + 1, z, 'leaves');
    }
    for (const x of [85, 98, 106, 120]) for (const z of [92, 99]) t.cypress(x, G + 1, z, 4);
    for (const [x, z] of [[90, 96], [95, 93], [109, 97], [114, 95], [119, 93]]) b.set(x, G + 1, z, z % 2 ? 'flower_red' : 'flower_yellow');
    // The second terrace: a long pool across it with jets of water at its edges, a bridge on the axis, beds.
    for (let x = 86; x <= 119; x++) {
        b.set(x, G, 106, 'marble');
        b.set(x, G + 1, 106, 'water');
        for (const z of [105, 107]) b.set(x, G + 1, z, 'marble');
    }
    for (let x = ax - 2; x <= ax + 2; x++) b.set(x, G + 2, 106, 'sandstone_slab');
    for (const x of [86, 119]) b.set(x, G + 2, 106, 'sandstone_slab');
    for (const x of [89, 95, 109, 115]) {
        t.orange(x, G + 2, 103);
        t.orange(x, G + 2, 110);
    }
    // A pergola along the second terrace's far side: posts and a roof of leaves.
    for (let x = 84; x <= 121; x++) {
        if (Math.abs(x - ax) <= 2) continue;
        if (x % 4 === 0) b.box(x, G + 2, 109, x, G + 4, 109, 'dark_oak_fence');
        for (let z = 108; z <= 111; z++) if (!t.has(x, G + 5, z)) b.set(x, G + 5, z, 'leaves');
    }
    constructionPalaceChest(b, 84, G + 2, 108, 'e', [['acacia_sapling', 6], ['cherry_sapling', 4], ['fertilizer', 16], ['wheat_seeds', 16], ['iron_hoe', 1], ['water_bucket', 2]]);
    // The third terrace: the mirador, a pavilion with an arcade looking down the garden, cushions inside.
    const top = G + 2;
    for (let z = 115; z <= 122; z++) {
        for (let x = 94; x <= 110; x++) b.set(x, top, z, constructionPalaceAndalusiStar(x - ax, z, { star: 'green_glazed_tile', heart: 'yellow_glazed_tile', cross: 'blue_glazed_tile', ground: 'white_glazed_tile' }));
    }
    for (let y = top + 1; y <= top + 5; y++) {
        for (let z = 115; z <= 122; z++) {
            for (const x of [94, 110]) b.set(x, y, z, t.wallAt('green', x, y, z, top, top + 5));
        }
    }
    t.arcade('x', 115, [94, 97, 100, 104, 107, 110], top, { colH: 3, beamTop: 5 });
    b.box(94, top + 6, 115, 110, top + 6, 122, 'dark_oak_planks');
    t.roof(93, 114, 111, 123, top + 7);
    for (const z of [117, 120]) t.window(123, z, 'z', 2, G, { depth: 2, pane: 1, rel0: 4, rel1: 5 });
    for (let x = 96; x <= 108; x++) if (x !== ax) t.sofa(x, top + 1, 122, x % 2 ? 'green' : 'white', 'n');
    t.carpet(97, 117, 107, 120, top + 1, 'green', 'yellow');
    b.set(ax, top + 1, 118, 'fountain');
    t.lamps(95, 116, 109, 122, top);
    for (const x of [86, 90, 114, 118]) {
        t.orange(x, top + 1, 117);
        t.cypress(x + 2, top + 1, 121, 5);
    }
    // Lamps on posts along the paths.
    for (const [x, z, y] of [[99, 95, G + 1], [105, 95, G + 1], [99, 104, G + 2], [105, 104, G + 2], [99, 114, G + 3], [105, 114, G + 3]]) f.lanternPost(x, y, z, 'dark_oak_fence', 1);
}

function constructionPalaceAndalusi(b) {
    const [w, , d] = PALACE_ANDALUSI_SIZE;
    const G = PALACE_ANDALUSI_GROUND;
    const R = PALACE_ANDALUSI_RIM;
    const t = constructionPalaceAndalusiTools(b);
    constructionPalaceGrounds(b, 'desert', { x0: R, z0: R, x1: w - 1 - R, z1: d - 1 - R, y: G, decor: false });
    constructionPalaceAndalusiPrecinct(b, t);
    constructionPalaceAndalusiLane(b, t);
    constructionPalaceAndalusiFront(b, t);
    constructionPalaceAndalusiGate(b, t);
    constructionPalaceAndalusiWest(b, t);
    constructionPalaceAndalusiMyrtles(b, t);
    constructionPalaceAndalusiMiddle(b, t);
    constructionPalaceAndalusiLions(b, t);
    constructionPalaceAndalusiGarden(b, t);
}

CONSTRUCTION_DESIGNS.palace_andalusi = {
    label: 'Andalusian palace',
    size: PALACE_ANDALUSI_SIZE,
    foundation: 'dirt',
    anchorX: PALACE_ANDALUSI_MID,
    groundY: PALACE_ANDALUSI_GROUND,
    rate: 480,
    start: [PALACE_ANDALUSI_MID, PALACE_ANDALUSI_GROUND + 1, 1],
    levels: [],
    site: constructionPalaceSite({ label: 'Andalusian palace', theme: 'desert', groundY: PALACE_ANDALUSI_GROUND, rim: PALACE_ANDALUSI_RIM }),
    generate: constructionPalaceAndalusi
};
