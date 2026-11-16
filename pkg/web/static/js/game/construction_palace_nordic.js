// /build palace_nordic: the Winter Palace of the Aurora, Russian and Nordic: red and ochre brick with white
// stucco trim on a granite plinth, steep dark wooden roofs, a cluster of striped onion domes round a gold one,
// carved wooden porches and galleries, fireplaces everywhere, an ice garden and a frozen pond in front; the
// physics of cold (snow that keeps warm, ice that floats, the thermometer) and the sky (the aurora, the telescope).
// Loaded after construction_palace_common.js; it only adds an entry to CONSTRUCTION_DESIGNS. Everything of this
// palace lives in this file (and its test, test/js/construction_palace_nordic.test.js).
//
// The plan, in local terms (x across, z away from the player, the front door looking 's'); the box is 131 square
// and the rim (12 columns) only earth, so everything stands in x, z = 12 .. 118. Floors every 6 layers: the
// ground layer G = 6, then 12, 18 and the attic at 24; a visitor's feet are one over a floor.
//
//   z 12..38   the front: the gate and the avenue (x 62..68) to the porch; the frozen pond with its skating
//              ice, a warming hut and an ice-fishing hole on the west; the ice garden (a maze, a bear, a
//              snowflake, ice spikes, an arch, a frozen fountain) on the east.
//   z 40..68   the main block (x 38..92), three floors and an attic under a hipped roof, five onion domes:
//              ground: vestibule with the grand stair, cloakroom (W), treasury (E), the great hall behind;
//              first: the landing, library (W), weather room (E), the throne room behind (two floors high);
//              second: the landing, the royal bedroom (W), the east bedroom (E). A balcony over the porch.
//   z 46..104  the west wing (x 20..37): kitchen, cold store, stair, servants' hall, laundry; upstairs the
//              servants' rooms and the linen store. A corridor runs along its courtyard side (x 33..35).
//   z 46..90   the east wing (x 93..110), its mirror: the Hall of Light (two floors high), the storeroom,
//              stair, sleigh workshop; upstairs the children's and the guest bedrooms.
//   bell tower (centre 30, 39) in front of the west wing: the clock and the bells, a green dome.
//   observatory tower (centre 101, 97) behind the east wing, the tallest: the telescope at the top.
//   z 69..104  the courtyard: a wooden gallery along the main block, the orangery (glass, x 52..78), the
//              banya with its steam room and cold plunge pool (x 40..50), a sundial.
//   z 106..116 the stables (x 40..90), with a tack room.
// Stairs are flights and the castle's spiral (constructionCastleSpiral), never ladders. Every fire is
// contained: glowing magma rock behind iron bars in a stone hearth.

const PALACE_NORDIC_SIZE = [131, 84, 131];
const PALACE_NORDIC_GROUND = 6;
const PALACE_NORDIC_RIM = 12;
const PALACE_NORDIC_MID = 65;
// More columns than the castle's: the box is bigger (7.5 a column, as the palaces' default).
const PALACE_NORDIC_EARTH = 128000;
// The weathered walls: red brick for the main block, ochre for the wings, granite for the plinth.
const PALACE_NORDIC_RED = [['red_brick', 84], ['brick', 16]];
const PALACE_NORDIC_OCHRE = [['yellow_brick', 86], ['orange_brick', 14]];
const PALACE_NORDIC_PLINTH = [['granite', 50], ['stone_bricks', 38], ['cobblestone', 12]];
const PALACE_NORDIC_SNOWY = [['snow_block', 65], ['packed_ice', 35]];

// The science, for children, in both languages: [Spanish, English].
const PALACE_NORDIC_SIGNS = {
    entrance: ['Palacio de Invierno de la Aurora', 'Winter Palace of the Aurora'],
    thermometer: ['Termómetro: con calor, el líquido se dilata y sube; con frío, se encoge.',
        'Thermometer: the liquid inside expands when warm and climbs the tube; when cold it shrinks and goes down.'],
    snow: ['La nieve abriga: el aire quieto entre sus copos apenas deja pasar el calor.',
        'Snow keeps things warm: still air is trapped between the flakes, and still air hardly lets heat through.'],
    ice: ['El hielo flota: al helarse, el agua ocupa más y es menos densa que el agua.',
        'Ice floats: freezing water forms crystals with gaps and takes more room, so ice is less dense than water.'],
    barometer: ['Barómetro: mide el peso del aire. Si la presión baja, suele llover.',
        'Barometer: it measures the weight of the air above. When the pressure falls, bad weather often comes.'],
    anemometer: ['Anemómetro: cuanto más fuerte sopla el viento, más deprisa gira.',
        'Anemometer: its cups spin in the wind; the faster they turn, the stronger it blows.'],
    aurora: ['Aurora: partículas del Sol llegan a los polos y hacen brillar el aire.',
        'Aurora: the Sun sends out particles that Earth steers to the poles; when they hit the air high up, it glows.'],
    telescope: ['Telescopio: junta más luz que tu ojo y muestra estrellas que no ves.',
        'Telescope: it gathers far more light than your eye, so it shows faint stars and the craters of the Moon.'],
    greenhouse: ['Invernadero: el vidrio deja entrar el Sol y guarda el calor dentro.',
        'Greenhouse: glass lets sunlight in and keeps the warm air inside, so plants grow here while it freezes outside.'],
    observatory: ['Observatorio: sube la escalera hasta lo más alto de la torre', 'Observatory: climb the stairs to the very top of the tower']
};

// Is something drawn at this cell already (in the builder's own terms, mirrored or not)?
function constructionPalaceNordicHas(b, x, y, z) {
    const [w, , d] = b.size;
    return b.cells.has((y * d + z) * w + (b.flipped ? w - 1 - x : x));
}

// The tabletop objects (js/game/tabletop.js) that turn with the piece; the plate, the bowl and the jug do not.
const PALACE_NORDIC_TOP_TURNS = new Set(['open_book', 'book_stack', 'inkwell', 'scroll', 'tea_set', 'chessboard', 'sewing_basket']);

// One of the small things of daily life on a table, desk or bedside table: in the cell (x, y, z) right over
// it, `facing` the way a person using it looks from (the desk's or the table's own facing).
function constructionPalaceNordicTop(b, x, y, z, id, facing = 's') {
    if (PALACE_NORDIC_TOP_TURNS.has(id)) b.shaped(x, y, z, id, id, { facing: b.facing(facing) });
    else b.set(x, y, z, id);
}

// A building's walls, two thick, from the ground layer to `top`, with its floors inside at the layers of
// `floors` and air between them. Outside: the granite plinth, the palette, white stucco bands at each floor
// and at the top and white quoins at the corners; inside, white plaster over a wooden wainscot.
function constructionPalaceNordicShell(b, { x0, z0, x1, z1, top, palette, floors, floor = 'spruce_planks' }) {
    const G = PALACE_NORDIC_GROUND;
    for (let y = G; y <= top; y++) {
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                const inX = x > x0 + 1 && x < x1 - 1;
                const inZ = z > z0 + 1 && z < z1 - 1;
                if (inX && inZ) {
                    b.set(x, y, z, floors.includes(y) ? floor : null);
                    continue;
                }
                const outer = x === x0 || x === x1 || z === z0 || z === z1;
                let type;
                if (y <= G + 1) type = constructionPalacePick(PALACE_NORDIC_PLINTH, x, y, z, 3);
                else if (floors.includes(y) || y === top) type = 'white_stucco';
                else if (!outer) type = floors.includes(y - 1) ? 'spruce_planks' : 'white_stucco';
                else if (!inX && !inZ) type = (y - G) % 2 ? 'white_stucco' : 'stone_bricks';
                else type = constructionPalacePick(palette, x, y, z, 5);
                b.set(x, y, z, type);
            }
        }
    }
}

// A cornice round a building at layer y: white stairs hung upside down on the face, where nothing is yet.
function constructionPalaceNordicCornice(b, x0, z0, x1, z1, y) {
    const put = (x, z, facing) => {
        if (!constructionPalaceNordicHas(b, x, y, z)) b.stairs(x, y, z, 'white_glazed_tile_stairs', facing, 'top');
    };
    for (let x = x0; x <= x1; x++) {
        put(x, z0 - 1, 's');
        put(x, z1 + 1, 'n');
    }
    for (let z = z0; z <= z1; z++) {
        put(x0 - 1, z, 'e');
        put(x1 + 1, z, 'w');
    }
}

// A small deep window in a wall two thick, as the north builds them against the cold: the pane in the outer
// layer at (x, z), the inner cell open, a white stucco frame round it and a little hood and sill outside (the
// carved surrounds of a Russian window). `out` is the way the wall looks outwards.
function constructionPalaceNordicWindow(b, x, z, y0, y1, out, pane = 'glass_pane') {
    const [ox, oz] = SHAPE_DIRECTIONS[out];
    const [px, pz] = [Math.abs(oz), Math.abs(ox)];
    const back = SHAPE_OPPOSITE[out];
    b.box(x, y0, z, x, y1, z, pane);
    b.box(x - ox, y0, z - oz, x - ox, y1, z - oz, null);
    for (const s of [-1, 1]) b.box(x + px * s, y0, z + pz * s, x + px * s, y1, z + pz * s, 'white_stucco');
    b.set(x, y0 - 1, z, 'white_stucco');
    b.set(x, y1 + 1, z, 'white_stucco');
    for (let s = -1; s <= 1; s++) b.stairs(x + ox + px * s, y1 + 1, z + oz + pz * s, 'white_glazed_tile_stairs', back);
    b.stairs(x + ox, y0 - 1, z + oz, 'stone_brick_stairs', back, 'top');
}

// Curtains in the deep opening of a window drawn by constructionPalaceNordicWindow (same x, z, rows and
// `out`): they hang in the inner cell against the pane. About a third are left closed, the rest open, the
// same for the whole window and chosen by where it is, so a row of windows (and the two sides of the palace)
// differ as if the residents had drawn them.
function constructionPalaceNordicCurtain(b, x, z, y0, y1, out, colour) {
    const { curtain } = constructionFurnisher(b);
    const [ox, oz] = SHAPE_DIRECTIONS[out];
    const drawn = constructionPalaceHash(x, y0, z, b.flipped ? 41 : 43) < 0.34 ? 'closed' : 'open';
    for (let y = y0; y <= y1; y++) curtain(x - ox, y, z - oz, colour, SHAPE_OPPOSITE[out], drawn);
}

// A door in the cell (x, y, z) and the way through the wall open behind it, along `facing`, `depth` cells in all.
function constructionPalaceNordicDoorway(b, x, y, z, facing, depth = 2, base = 'spruce_door') {
    const [dx, dz] = SHAPE_DIRECTIONS[facing];
    b.door(x, y, z, base, facing);
    for (let k = 1; k < depth; k++) b.box(x + dx * k, y, z + dz * k, x + dx * k, y + 1, z + dz * k, null);
}

// A stone hearth against a wall, its fire contained: glowing magma rock set in the wall behind iron bars, a
// mantel over them and the chimney breast up to the ceiling. (x, z) is the middle of its front, in the room;
// `facing` the way it looks into the room; 2 * wide + 1 cells of fire, a stone cheek each side.
function constructionPalaceNordicHearth(b, x, y, z, facing, ceiling, wide = 1) {
    const [fx, fz] = SHAPE_DIRECTIONS[facing];
    const [px, pz] = [Math.abs(fz), Math.abs(fx)];
    for (let s = -wide; s <= wide; s++) {
        const [ax, az] = [x + px * s, z + pz * s];
        b.box(ax - fx, y, az - fz, ax - fx, y + 1, az - fz, 'magma_rock');
        b.set(ax, y, az, 'iron_bars');
        b.set(ax, y + 1, az, null);
        b.stairs(ax, y + 2, az, 'stone_brick_stairs', SHAPE_OPPOSITE[facing], 'top');
        if (y + 3 <= ceiling - 1) b.box(ax, y + 3, az, ax, ceiling - 1, az, 'stone_bricks');
    }
    for (const s of [-wide - 1, wide + 1]) b.box(x + px * s, y, z + pz * s, x + px * s, ceiling - 1, z + pz * s, 'stone_bricks');
}

// A chandelier hung `chain` cells under a ceiling at layer `ceiling`.
function constructionPalaceNordicChandelier(b, x, ceiling, z, chain = 0) {
    if (chain > 0) b.box(x, ceiling - chain, z, x, ceiling - 1, z, 'dark_oak_fence');
    b.set(x, ceiling - chain - 1, z, 'chandelier');
}

// Standing lanterns round a room, on the floor along its walls every `step` cells from the corners, where
// nothing stands and no door or stair opens: candles and chandeliers are for looks, these keep the corners
// out of the dark. (x0, z0) .. (x1, z1) is the floor of the room, y the layer a visitor's feet are in.
function constructionPalaceNordicLight(b, x0, z0, x1, z1, y, step = 6) {
    const [w, , d] = b.size;
    const typeOf = (x, yy, z) => {
        const cell = b.cells.get((yy * d + z) * w + (b.flipped ? w - 1 - x : x));
        return cell ? cell.type : null;
    };
    const busy = (x, z) => {
        if (typeOf(x, y, z) || typeOf(x, y + 1, z) || !typeOf(x, y - 1, z)) return true;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const near = typeOf(x + dx, y, z + dz);
            if (near && /door|stairs|gate/.test(near)) return true;
            if (!typeOf(x + dx, y - 1, z + dz) && x + dx >= x0 && x + dx <= x1 && z + dz >= z0 && z + dz <= z1) return true;
        }
        return false;
    };
    const spots = new Set();
    const along = (a0, a1) => {
        const list = [];
        for (let a = a0; a <= a1; a += step) list.push(a);
        if (list[list.length - 1] !== a1) list.push(a1);
        return list;
    };
    for (const x of along(x0, x1)) {
        spots.add(`${x},${z0}`);
        spots.add(`${x},${z1}`);
    }
    for (const z of along(z0, z1)) {
        spots.add(`${x0},${z}`);
        spots.add(`${x1},${z}`);
    }
    for (const spot of spots) {
        const [x, z] = spot.split(',').map(Number);
        // Where the spot is taken, the next free cell along the wall.
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
            const [ax, az] = [x + dx, z + dz];
            if (ax < x0 || ax > x1 || az < z0 || az > z1 || busy(ax, az)) continue;
            b.shaped(ax, y, az, 'lantern', 'lantern', { mount: 'floor' });
            break;
        }
    }
}

// A wardrobe (two cells) and what it holds, within the server's limits.
function constructionPalaceNordicWardrobe(b, x, y, z, facing, items) {
    constructionPalaceStockCheck(items, (typeof STORAGE_KINDS === 'object' && STORAGE_KINDS.wardrobe) || 27);
    b.shaped(x, y, z, 'wardrobe', 'wardrobe', { half: 'lower', facing: b.facing(facing) });
    b.shaped(x, y + 1, z, 'wardrobe', 'wardrobe', { half: 'upper', facing: b.facing(facing) });
    b.stock(x, y, z, items);
}

// A hipped roof of stairs over the footprint x0..x1, z0..z1 (eaves included), rising one a ring from layer y;
// a ridge of `ridge` where the rings meet.
function constructionPalaceNordicHipRoof(b, x0, z0, x1, z1, y, stair, ridge) {
    for (let k = 0; ; k++) {
        const [ax, az, bx, bz] = [x0 + k, z0 + k, x1 - k, z1 - k];
        if (bx < ax || bz < az) return;
        if (bx === ax || bz === az) {
            b.box(ax, y + k, az, bx, y + k, bz, ridge);
            return;
        }
        for (let x = ax; x <= bx; x++) {
            b.stairs(x, y + k, az, stair, 's');
            b.stairs(x, y + k, bz, stair, 'n');
        }
        for (let z = az + 1; z < bz; z++) {
            b.stairs(ax, y + k, z, stair, 'e');
            b.stairs(bx, y + k, z, stair, 'w');
        }
    }
}

// A gable roof: u is the sloping axis (from u0 to u1, eaves included), v runs along the ridge (v0 to v1);
// alongX puts the ridge along x. `steep` layers a step: planks under each stair. The gable ends (the wall
// planes, v0 + 1 and v1 - 1) are filled with `gable`.
function constructionPalaceNordicGable(b, { u0, u1, v0, v1, y, stair, plank, gable, steep = 1, alongX = false }) {
    const at = (u, v) => (alongX ? [v, u] : [u, v]);
    const [low, high] = alongX ? ['s', 'n'] : ['e', 'w'];
    for (let k = 0; u0 + k <= u1 - k; k++) {
        const [a, c] = [u0 + k, u1 - k];
        for (let s = 0; s < steep; s++) {
            const yy = y + k * steep + s;
            const last = s === steep - 1;
            for (let v = v0; v <= v1; v++) {
                const [xa, za] = at(a, v);
                const [xc, zc] = at(c, v);
                if (a === c) b.set(xa, yy, za, plank);
                else if (last) {
                    b.stairs(xa, yy, za, stair, low);
                    b.stairs(xc, yy, zc, stair, high);
                } else {
                    b.set(xa, yy, za, plank);
                    b.set(xc, yy, zc, plank);
                }
            }
            if (!gable) continue;
            for (const v of [v0 + 1, v1 - 1]) {
                for (let u = a + 1; u <= c - 1; u++) {
                    const [x, z] = at(u, v);
                    b.set(x, yy, z, gable);
                }
            }
        }
    }
}

// A round drum of radius r from layer y0 to y1, one thick, with windows on four sides and a cornice on top;
// closed over at y1, where a dome sits.
function constructionPalaceNordicDrum(b, cx, cz, y0, y1, r, wall = 'white_stucco') {
    const inside = (dx, dz, rr) => Math.hypot(dx, dz) <= rr + 0.35;
    for (let dz = -r - 1; dz <= r + 1; dz++) {
        for (let dx = -r - 1; dx <= r + 1; dx++) {
            if (!inside(dx, dz, r)) {
                if (inside(dx, dz, r + 1) && !constructionPalaceNordicHas(b, cx + dx, y1, cz + dz)) {
                    const facing = Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 'w' : 'e') : (dz > 0 ? 'n' : 's');
                    b.stairs(cx + dx, y1, cz + dz, 'white_glazed_tile_stairs', facing, 'top');
                }
                continue;
            }
            const rim = !inside(dx + 1, dz, r) || !inside(dx - 1, dz, r) || !inside(dx, dz + 1, r) || !inside(dx, dz - 1, r);
            for (let y = y0; y < y1; y++) b.set(cx + dx, y, cz + dz, rim ? (y === y1 - 1 || y === y0 ? 'white_stucco' : wall) : null);
            b.set(cx + dx, y1, cz + dz, rim ? 'white_stucco' : 'spruce_planks');
        }
    }
    const lit = y1 - 4;
    for (const [dx, dz, out] of [[r, 0, 'e'], [-r, 0, 'w'], [0, r, 's'], [0, -r, 'n']]) {
        b.box(cx + dx, lit, cz + dz, cx + dx, lit + 2, cz + dz, 'glass_pane');
        const [ox, oz] = SHAPE_DIRECTIONS[out];
        b.stairs(cx + dx + ox, lit + 3, cz + dz + oz, 'white_glazed_tile_stairs', SHAPE_OPPOSITE[out]);
    }
}

// An onion dome on a drum of radius r, its base at layer y: it bulges out past the drum and tapers to a gold
// spire, built round of glazed tiles, their stairs where the surface leans (upside down under the bulge) and
// slabs at the very tip. Two colours wind round it in spiral stripes; the same twice for a plain one.
function constructionPalaceNordicOnion(b, cx, cz, y, r, colours) {
    const rmax = r + (r >= 3 ? 1.5 : 1);
    const height = Math.round(r * 2.4) + 3;
    const radius = (t) => {
        if (t < 0) return r;
        if (t > height) return -1;
        const u = t / height;
        if (u < 0.3) return r + (rmax - r) * Math.sin((u / 0.3) * (Math.PI / 2));
        return rmax * Math.pow(Math.cos(((u - 0.3) / 0.7) * (Math.PI / 2)), 1.3);
    };
    const solid = (t, dx, dz) => {
        const rr = radius(t);
        return rr >= 0 && Math.hypot(dx, dz) <= rr + 0.35;
    };
    const reach = Math.ceil(rmax) + 1;
    for (let t = 0; t <= height; t++) {
        for (let dz = -reach; dz <= reach; dz++) {
            for (let dx = -reach; dx <= reach; dx++) {
                if (!solid(t, dx, dz)) continue;
                const up = !solid(t + 1, dx, dz);
                const down = !solid(t - 1, dx, dz);
                const side = !solid(t, dx + 1, dz) || !solid(t, dx - 1, dz) || !solid(t, dx, dz + 1) || !solid(t, dx, dz - 1);
                if (!up && !down && !side) continue;
                const turn = (Math.atan2(dz, dx) / (2 * Math.PI) + 1) * 8 + t * 0.6;
                const tile = `${Math.floor(turn) % 2 ? colours[1] : colours[0]}_glazed_tile`;
                const inward = dx === 0 && dz === 0 ? null : Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 'w' : 'e') : (dz > 0 ? 'n' : 's');
                const [x, yy, z] = [cx + dx, y + t, cz + dz];
                if (up && down) b.set(x, yy, z, `${tile}_slab`);
                else if (inward && up) b.stairs(x, yy, z, `${tile}_stairs`, inward);
                else if (inward && down) b.stairs(x, yy, z, `${tile}_stairs`, inward, 'top');
                else b.set(x, yy, z, tile);
            }
        }
    }
    b.box(cx, y + height + 1, cz, cx, y + height + 3, cz, 'gold_block');
    return y + height + 3;
}

// A square tower, 13 across with walls two thick, centred at (cx, cz): its floors at the layers of `floors`,
// a spiral stair round a pier in the middle (constructionCastleSpiral: the landings meet every floor), small
// windows on the four sides (but `blind` ones) and lanterns on each floor. Its walls go up to `top`.
function constructionPalaceNordicTower(b, cx, cz, { floors, top, palette, blind = [], plainFloors = [] }) {
    const G = PALACE_NORDIC_GROUND;
    const last = floors[floors.length - 1];
    for (let y = G; y <= top; y++) {
        for (let dz = -6; dz <= 6; dz++) {
            for (let dx = -6; dx <= 6; dx++) {
                const [x, z] = [cx + dx, cz + dz];
                const m = Math.max(Math.abs(dx), Math.abs(dz));
                if (m <= 4) {
                    b.set(x, y, z, floors.includes(y) ? 'spruce_planks' : null);
                    continue;
                }
                const outer = m === 6;
                let type;
                if (y <= G + 1) type = constructionPalacePick(PALACE_NORDIC_PLINTH, x, y, z, 7);
                else if (floors.includes(y) || y === top) type = 'white_stucco';
                else if (!outer) type = floors.includes(y - 1) ? 'spruce_planks' : 'white_stucco';
                else if (Math.abs(dx) >= 5 && Math.abs(dz) >= 5) type = (y - G) % 2 ? 'white_stucco' : 'stone_bricks';
                else type = constructionPalacePick(palette, x, y, z, 9);
                b.set(x, y, z, type);
            }
        }
    }
    for (const y of floors) {
        if (y !== G) b.box(cx - 2, y, cz - 2, cx + 2, y, cz + 2, null);
    }
    constructionCastleSpiral(b, cx - 2, cz - 2, G, last, 'stone_brick_stairs', 'stone_bricks');
    b.box(cx - 1, last, cz - 1, cx + 1, last, cz + 1, 'spruce_planks');
    for (let i = 0; i < floors.length - 1; i++) {
        const f = floors[i];
        for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) b.shaped(cx + dx, f + 1, cz + dz, 'lantern', 'lantern', { mount: 'floor' });
        for (const [dx, dz] of [[-3, -3], [3, 3], [3, -3], [-3, 3]]) b.shaped(cx + dx, floors[i + 1] - 1, cz + dz, 'lantern', 'lantern', { mount: 'hanging' });
        if (plainFloors.includes(f)) continue;
        for (const [dx, dz, out] of [[1, 0, 'e'], [-1, 0, 'w'], [0, 1, 's'], [0, -1, 'n']]) {
            if (!blind.includes(out)) constructionPalaceNordicWindow(b, cx + dx * 6, cz + dz * 6, f + 2, f + 3, out);
        }
    }
}

// ---------------------------------------------------------------------------------------
// The grounds and the front gardens

function constructionPalaceNordicGrounds(b) {
    const [w, , d] = PALACE_NORDIC_SIZE;
    const G = PALACE_NORDIC_GROUND;
    const R = PALACE_NORDIC_RIM;
    // Where the gardens and the buildings are: the snow forest grows round them.
    const reserved = [[12, 12, 56, 34], [56, 12, 74, 38], [74, 12, 118, 40], [20, 31, 111, 105], [38, 104, 92, 118]];
    const free = (x, z) => !reserved.some(([ax, az, bx, bz]) => x >= ax - 1 && x <= bx + 1 && z >= az - 1 && z <= bz + 1);
    constructionPalaceGrounds(b, 'snow', { x0: R, z0: R, x1: w - 1 - R, z1: d - 1 - R, y: G, free, density: 0.06 });
}

// The gate, the avenue and the porch's way in.
function constructionPalaceNordicAvenue(b) {
    const G = PALACE_NORDIC_GROUND;
    const { lanternPost } = constructionFurnisher(b);
    const put = constructionPalacePut(b);
    for (let z = 12; z <= 32; z++) {
        b.box(63, G, z, 67, G, z, 'stone_bricks');
        b.set(62, G, z, 'granite');
        b.set(68, G, z, 'granite');
    }
    // The paths across the front: to the pond on the west and to the ice garden on the east.
    b.box(24, G, 31, 61, G, 32, 'cobblestone');
    b.box(69, G, 37, 97, G, 38, 'cobblestone');
    b.sym(() => {
        for (const z of [12, 19, 25]) lanternPost(61, G + 1, z, 'spruce_fence', 2);
        for (const z of [20, 27]) constructionPalaceTree(put, 'spruce', 58, G + 1, z, z);
        // The gate: two white pillars banded in red, each under a little green tent with a gold knob.
        b.box(58, G + 1, 12, 60, G + 6, 14, 'white_stucco');
        b.box(58, G + 3, 12, 60, G + 3, 14, 'red_brick');
        b.box(58, G + 6, 12, 60, G + 6, 14, 'red_brick');
        for (let x = 58; x <= 60; x++) {
            b.stairs(x, G + 7, 12, 'green_glazed_tile_stairs', 's');
            b.stairs(x, G + 7, 14, 'green_glazed_tile_stairs', 'n');
        }
        b.stairs(58, G + 7, 13, 'green_glazed_tile_stairs', 'e');
        b.stairs(60, G + 7, 13, 'green_glazed_tile_stairs', 'w');
        b.set(59, G + 7, 13, 'green_glazed_tile');
        b.set(59, G + 8, 13, 'gold_block');
        // The fence along the front, out to the edge of the grounds.
        for (let x = 12; x <= 57; x++) b.set(x, G + 1, 13, 'spruce_fence');
    });
    constructionPalaceSign(b, 61, G + 1, 16, 'n', ...PALACE_NORDIC_SIGNS.entrance);
}

// The frozen pond: skating ice over dark water, a cobbled shore, benches, a warming hut with a brazier and a
// hole for ice fishing; the sign of why ice floats.
function constructionPalaceNordicPond(b) {
    const G = PALACE_NORDIC_GROUND;
    const { piece, lantern, lanternPost } = constructionFurnisher(b);
    const [cx, cz, rx, rz] = [38, 22, 14, 7];
    for (let z = 13; z <= 31; z++) {
        for (let x = 22; x <= 54; x++) {
            const e = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
            if (e <= 1) {
                b.set(x, G, z, 'packed_ice');
                b.set(x, G - 1, z, 'water');
            } else if (e <= 1.35) b.set(x, G, z, 'cobblestone');
        }
    }
    // A hole in the ice for fishing, and the fisher's barrel on the shore.
    b.set(46, G, 24, 'water');
    for (const [x, z] of [[24, 30], [52, 30], [38, 14], [53, 22]]) lanternPost(x, G + 1, z, 'spruce_fence', 2);
    for (let x = 33; x <= 37; x++) piece(x, G + 1, 30, 'bench', 'bench', 'n');
    constructionPalaceChest(b, 49, G + 1, 30, 'n', [['raw_fish', 6], ['fishing_rod', 2], ['bread', 4]], 'barrel');
    constructionPalaceSign(b, 44, G + 1, 30, 's', ...PALACE_NORDIC_SIGNS.ice);

    // The warming hut: an open log pavilion on the west shore, a brazier in the middle, benches round it.
    b.box(13, G, 16, 21, G, 26, 'spruce_planks');
    for (const [x, z] of [[13, 16], [21, 16], [13, 26], [21, 26], [17, 26], [13, 21]]) b.box(x, G + 1, z, x, G + 4, z, 'spruce_wood');
    for (let x = 14; x <= 20; x++) {
        if (x < 16 || x > 18) b.set(x, G + 1, 16, 'spruce_fence');
        b.set(x, G + 1, 26, 'spruce_fence');
    }
    for (let z = 17; z <= 25; z++) {
        if (z !== 21) b.set(13, G + 1, z, 'spruce_fence');
        if (z < 20 || z > 22) b.set(21, G + 1, z, 'spruce_fence');
    }
    b.box(13, G + 5, 16, 21, G + 5, 26, 'spruce_planks');
    b.box(14, G + 5, 17, 20, G + 5, 25, null);
    b.box(15, G + 5, 21, 19, G + 5, 21, 'spruce_planks');
    constructionPalaceNordicHipRoof(b, 12, 15, 22, 27, G + 6, 'dark_oak_stairs', 'dark_oak_planks');
    constructionPalaceNordicOnion(b, 17, 21, G + 12, 1, ['blue', 'white']);
    b.set(17, G, 21, 'cobblestone');
    b.set(17, G + 1, 21, 'magma_rock');
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.set(17 + dx, G + 1, 21 + dz, 'iron_bars');
    b.set(17, G + 2, 21, 'stone_bricks_slab');
    for (let z = 19; z <= 23; z++) {
        piece(14, G + 1, z, 'bench', 'bench', 'e');
        piece(20, G + 1, z, 'bench', 'bench', 'w');
    }
    for (const x of [15, 19]) lantern(x, G + 4, 21);
    constructionPalaceChest(b, 14, G + 1, 17, 'e', [['warm_coat', 4], ['fur', 4], ['fishing_rod', 2], ['candle', 6]]);
    constructionPalaceChest(b, 14, G + 1, 25, 'e', [['honey_bottle', 6], ['bread', 8], ['cheese', 4]], 'barrel');
    constructionPalaceNordicTop(b, 14, G + 2, 25, 'jug');
}

// The ice garden: paths in a cross round a frozen fountain, a maze of ice, ice spikes and snowmen, a polar bear
// of snow, an ice arch over the path and a great snowflake.
function constructionPalaceNordicIceGarden(b) {
    const G = PALACE_NORDIC_GROUND;
    const F = G + 1;
    const { lantern, lanternPost } = constructionFurnisher(b);
    const put = constructionPalacePut(b);
    b.box(95, G, 14, 97, G, 38, 'stone_bricks');
    b.box(76, G, 25, 116, G, 27, 'stone_bricks');
    // The frozen fountain on a round plaza, and four ice obelisks with a light on each.
    const [cx, cz] = [96, 26];
    for (let dz = -4; dz <= 4; dz++) {
        for (let dx = -4; dx <= 4; dx++) {
            const r = Math.hypot(dx, dz);
            if (r <= 4.4) b.set(cx + dx, G, cz + dz, 'stone_bricks');
            if (r > 1.6 && r <= 2.5) b.set(cx + dx, F, cz + dz, 'packed_ice');
        }
    }
    b.set(cx, F, cz, 'fountain');
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
        b.box(cx + dx, F, cz + dz, cx + dx, F + 3, cz + dz, 'packed_ice');
        lantern(cx + dx, F + 4, cz + dz, 'floor');
    }
    // The maze: two square rings of ice wall, their gaps on opposite sides, a crystal at the heart.
    const [mx, mz] = [85, 19];
    for (const [r, gap] of [[2, -1], [4, 1]]) {
        for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || (dx === 0 && dz === gap * r)) continue;
                b.box(mx + dx, F, mz + dz, mx + dx, F + 1, mz + dz, 'packed_ice');
            }
        }
    }
    b.box(mx, F, mz, mx, F + 2, mz, 'packed_ice');
    lantern(mx, F + 3, mz, 'floor');
    // Ice spikes and snowmen with black hats.
    for (const [x, z] of [[102, 16], [106, 20], [110, 15], [113, 21], [104, 22]]) constructionPalaceTree(put, 'ice_spike', x, F, z, x);
    for (const [x, z] of [[100, 19], [109, 18]]) {
        b.box(x, F, z, x, F + 2, z, 'snow_block');
        b.set(x, F + 3, z, 'black_wool');
    }
    // The bear: a body of snow on four legs, a head with ears, black eyes and nose.
    b.box(81, F + 1, 31, 86, F + 3, 33, 'snow_block');
    for (const [x, z] of [[81, 31], [81, 33], [86, 31], [86, 33]]) b.set(x, F, z, 'snow_block');
    b.box(87, F + 2, 31, 89, F + 4, 33, 'snow_block');
    b.set(90, F + 3, 32, 'snow_block');
    b.set(91, F + 3, 32, 'black_wool');
    b.set(89, F + 4, 31, 'black_wool');
    b.set(89, F + 4, 33, 'black_wool');
    b.set(88, F + 5, 31, 'snow_block');
    b.set(88, F + 5, 33, 'snow_block');
    // The arch of ice over the path.
    b.box(94, F, 33, 94, F + 3, 33, 'packed_ice');
    b.box(98, F, 33, 98, F + 3, 33, 'packed_ice');
    b.box(94, F + 4, 33, 98, F + 4, 33, 'packed_ice');
    b.set(96, F + 5, 33, 'packed_ice');
    // The snowflake: six-fold in a square grid, as near as it goes: arms along the axes with branches, short
    // ones on the diagonals.
    const [sx, sz] = [107, 33];
    b.set(sx, F, sz, 'packed_ice');
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let k = 1; k <= 4; k++) b.set(sx + dx * k, F, sz + dz * k, 'packed_ice');
        for (const s of [-1, 1]) {
            b.set(sx + dx * 2 + dz * s, F, sz + dz * 2 + dx * s, 'packed_ice');
            b.set(sx + dx * 3 + dz * s * 2, F, sz + dz * 3 + dx * s * 2, 'packed_ice');
        }
    }
    for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        for (let k = 1; k <= 2; k++) b.set(sx + dx * k, F, sz + dz * k, 'packed_ice');
    }
    for (const [x, z] of [[114, 36], [102, 37], [113, 30]]) constructionPalaceTree(put, 'spruce', x, F, z, z);
    for (const [x, z] of [[94, 15], [98, 15], [80, 24], [112, 24], [80, 28], [112, 28], [94, 37], [98, 30]]) lanternPost(x, F, z, 'spruce_fence', 2);
}

// ---------------------------------------------------------------------------------------
// The wings: ochre brick, two floors and a steep roof; a corridor along the courtyard side. Drawn as the west
// wing and its mirror, the east one, which is shorter: the observatory tower stands at its end.

function constructionPalaceNordicWings(b) {
    const G = PALACE_NORDIC_GROUND;
    const F = G + 1;
    const L1 = G + 6;
    const L2 = G + 12;
    const { lantern } = constructionFurnisher(b);
    b.sym(() => {
        const east = b.flipped;
        const zEnd = east ? 90 : 104;
        constructionPalaceNordicShell(b, { x0: 20, z0: 46, x1: 37, z1: zEnd, top: L2, palette: PALACE_NORDIC_OCHRE, floors: [G, L1, L2] });
        b.box(32, F, 48, 32, L2 - 1, zEnd - 2, 'white_stucco');
        b.box(33, G, 48, 35, G, zEnd - 2, 'dark_oak_planks');
        b.box(33, L1, 48, 35, L1, zEnd - 2, 'dark_oak_planks');
        for (const z of [72, 80]) b.box(22, F, z, 31, L2 - 1, z, 'white_stucco');
        b.box(22, F, 63, 31, L1 - 1, 63, 'white_stucco');
        for (let z = 51; z <= zEnd - 3; z += 6) {
            lantern(34, L1 - 1, z);
            lantern(34, L2 - 1, z);
        }
        // The stair between the two floors: six steps along x, the floor open over them, a rail round the hole.
        for (let k = 1; k <= 6; k++) {
            for (const z of [75, 76]) {
                b.stairs(31 - k, G + k, z, 'spruce_stairs', 'w');
                if (k > 1) b.box(31 - k, F, z, 31 - k, G + k - 1, z, 'spruce_planks');
            }
        }
        b.box(26, L1, 75, 30, L1, 76, null);
        for (let x = 26; x <= 31; x++) {
            b.set(x, L1 + 1, 74, 'spruce_fence');
            b.set(x, L1 + 1, 77, 'spruce_fence');
        }
        b.box(31, L1 + 1, 75, 31, L1 + 1, 76, 'spruce_fence');
        b.door(32, F, 75, 'spruce_door', 'w');
        b.door(32, L1 + 1, 78, 'spruce_door', 'w');
        lantern(23, L1 - 1, 78);
        lantern(28, L1 - 1, 73);
        lantern(23, L2 - 1, 73);
        lantern(29, L2 - 1, 79);
        // The roof, steep, of spruce; boarded gables.
        constructionPalaceNordicGable(b, { u0: 19, u1: 38, v0: 45, v1: zEnd + 1, y: L2 + 1, stair: 'spruce_stairs', plank: 'spruce_planks', gable: 'spruce_planks', steep: 2 });
        for (const z of [46, zEnd]) {
            const out = z === 46 ? 'n' : 's';
            if (!(z === 46 && !east)) constructionPalaceNordicWindow(b, 28, z, L2 + 3, L2 + 4, out);
        }
        // Windows on the corridor, over the courtyard.
        for (let z = 72; z <= zEnd - 4; z += 6) {
            if (z === 78 || z === 96 || z === 84) continue;
            constructionPalaceNordicWindow(b, 37, z, F + 1, F + 2, 'e');
            constructionPalaceNordicWindow(b, 37, z, L1 + 2, L1 + 3, 'e');
        }
        constructionPalaceNordicCornice(b, 20, 46, 37, zEnd, L1);
        constructionPalaceNordicCornice(b, 20, 46, 37, zEnd, L2);
        if (east) constructionPalaceNordicEastWing(b);
        else constructionPalaceNordicWestWing(b);
        for (const y of [F, L1 + 1]) {
            constructionPalaceNordicLight(b, 22, 73, 31, 79, y);
            constructionPalaceNordicLight(b, 33, 48, 35, zEnd - 2, y, 5);
        }
    });
}

// The west wing's rooms (local and world terms are the same here).
function constructionPalaceNordicWestWing(b) {
    const G = PALACE_NORDIC_GROUND;
    const F = G + 1;
    const L1 = G + 6;
    const L2 = G + 12;
    const U = L1 + 1;
    const { piece, lantern, oven } = constructionFurnisher(b);
    const win = (z, floor) => constructionPalaceNordicWindow(b, 20, z, floor === 0 ? F + 1 : U + 1, floor === 0 ? F + 2 : U + 2, 'w');
    b.box(22, F, 93, 31, L2 - 1, 93, 'white_stucco');
    for (const z of [57, 87]) b.box(22, U, z, 31, L2 - 1, z, 'white_stucco');
    for (const z of [50, 61, 82, 90, 98]) win(z, 0);
    for (const z of [52, 61, 67, 83, 90, 98]) win(z, 1);
    // Plain white curtains in the servants' rooms, the sewing room and the housekeeper's.
    for (const z of [52, 61, 67, 83, 90]) constructionPalaceNordicCurtain(b, 20, z, U + 1, U + 2, 'w', 'white');
    b.door(32, F, 57, 'spruce_door', 'w');
    b.door(32, F, 68, 'spruce_door', 'w');
    b.door(32, F, 85, 'spruce_door', 'w');
    b.door(32, F, 97, 'spruce_door', 'w');
    constructionPalaceNordicDoorway(b, 36, F, 99, 'e', 2);

    // The kitchen: a great cooking hearth, three ovens, the sink and the workbench, a long table, barrels.
    constructionPalaceNordicHearth(b, 22, F, 55, 'e', L1, 2);
    for (const x of [24, 25, 26]) oven(x, F, 48, 's');
    piece(27, F, 48, 'sink', 'sink', 's');
    b.set(28, F, 48, 'workbench');
    piece(28, F + 1, 48, 'wall_shelf', 'wall_shelf', 's');
    constructionPalaceChest(b, 30, F, 48, 's', [['salt', 16], ['wheat', 32], ['honey_bottle', 6], ['baking_soda', 4]]);
    b.box(26, F, 53, 27, F, 57, 'table');
    for (const z of [53, 55, 57]) {
        b.set(25, F, z, 'stool');
        b.set(z === 55 ? 29 : 28, F, z, 'stool');
    }
    b.set(26, F + 1, 54, 'candle');
    b.set(27, F + 1, 56, 'candle');
    // The cook's meal left half eaten, a jug, the fruit; one stool pushed back.
    constructionPalaceNordicTop(b, 26, F + 1, 56, 'meal_plate');
    constructionPalaceNordicTop(b, 27, F + 1, 54, 'jug');
    constructionPalaceNordicTop(b, 26, F + 1, 53, 'fruit_bowl');
    constructionPalaceChest(b, 23, F, 62, 'n', [['bread', 24], ['cheese', 12], ['milk', 6]], 'barrel');
    constructionPalaceChest(b, 25, F, 62, 'n', [['cooked_fish', 16], ['roast_mushroom', 12], ['raw_fish', 10]]);
    constructionPalaceChest(b, 27, F, 62, 'n', [['wheat', 48], ['wheat_seeds', 16]], 'barrel');
    constructionPalaceChest(b, 29, F, 62, 'n', [['honey_bottle', 8], ['soda_water', 8], ['salt', 8]], 'barrel');
    for (const [x, z] of [[25, 50], [29, 51], [25, 59], [29, 59]]) lantern(x, L1 - 1, z);

    // The cold store: walls lined with snow and ice, an ice floor, barrels of salted fish.
    for (let y = F; y < L1; y++) {
        for (let z = 64; z <= 71; z++) b.set(22, y, z, constructionPalacePick(PALACE_NORDIC_SNOWY, 22, y, z, 13));
        for (let x = 23; x <= 31; x++) {
            b.set(x, y, 64, constructionPalacePick(PALACE_NORDIC_SNOWY, x, y, 64, 13));
            b.set(x, y, 71, constructionPalacePick(PALACE_NORDIC_SNOWY, x, y, 71, 13));
        }
    }
    b.box(22, G, 64, 31, G, 71, 'packed_ice');
    b.box(22, L1, 64, 31, L1, 71, 'packed_ice');
    for (let z = 65; z <= 70; z++) {
        const fish = z % 2 ? [['salted_fish', 32], ['salt', 8]] : [['frozen_fish', 24], ['salted_fish', 16]];
        constructionPalaceChest(b, 23, F, z, 'e', fish, 'barrel');
    }
    constructionPalaceChest(b, 26, F, 65, 's', [['ice', 32], ['frozen_bread', 12], ['frozen_cooked_fish', 12]]);
    constructionPalaceChest(b, 28, F, 65, 's', [['cold_milk', 8], ['cold_water', 8], ['snow_block', 16], ['packed_ice', 8]]);
    b.box(30, F, 70, 31, F + 1, 70, 'packed_ice');
    lantern(27, L1 - 1, 68);
    lantern(30, L1 - 1, 66);

    // The servants' hall: a long table with benches, a hearth, their chests.
    constructionPalaceNordicHearth(b, 22, F, 86, 'e', L1, 1);
    b.box(26, F, 83, 27, F, 90, 'table');
    for (let z = 83; z <= 90; z++) {
        piece(25, F, z, 'bench', 'bench', 'e');
        piece(28, F, z, 'bench', 'bench', 'w');
    }
    for (const z of [84, 87, 90]) b.set(26 + (z % 2), F + 1, z, 'candle');
    // Supper half over: plates and jugs here and there along the table, some places already cleared.
    for (let z = 83; z <= 90; z++) {
        for (const x of [26, 27]) {
            if ([84, 87, 90].includes(z) && x === 26 + (z % 2)) continue;
            const h = constructionPalaceHash(x, F, z, 71);
            if (h < 0.3) constructionPalaceNordicTop(b, x, F + 1, z, 'meal_plate');
            else if (h < 0.45) constructionPalaceNordicTop(b, x, F + 1, z, 'jug');
        }
    }
    constructionPalaceChest(b, 31, F, 82, 'w', [['bread', 16], ['cheese', 8], ['candle', 12]]);
    constructionPalaceChest(b, 31, F, 92, 'w', [['white_wool', 16], ['warm_coat', 4], ['candle', 8]]);
    for (const [x, z] of [[24, 82], [30, 86], [24, 91], [30, 90]]) lantern(x, L1 - 1, z);

    // The laundry: wash tubs and sinks, linen, washing soda; the door out to the courtyard and the banya.
    for (const z of [95, 98]) {
        b.shaped(22, F, z, 'bathtub', 'bathtub', { part: 'foot', facing: b.facing('e') });
        b.shaped(23, F, z, 'bathtub', 'bathtub', { part: 'head', facing: b.facing('e') });
    }
    for (const z of [100, 101]) piece(22, F, z, 'sink', 'sink', 'e');
    constructionPalaceChest(b, 31, F, 95, 'w', [['white_wool', 32], ['blue_wool', 8], ['baking_soda', 8]]);
    constructionPalaceChest(b, 26, F, 102, 'n', [['bucket', 4], ['water_bucket', 2], ['salt', 4]], 'barrel');
    lantern(26, L1 - 1, 96);
    lantern(26, L1 - 1, 100);

    // Upstairs, the servants' rooms off the corridor, the housekeeper's and the linen store.
    b.door(32, U, 52, 'spruce_door', 'w');
    b.door(32, U, 64, 'spruce_door', 'w');
    b.door(32, U, 83, 'spruce_door', 'w');
    b.door(32, U, 90, 'spruce_door', 'w');
    b.door(32, U, 97, 'spruce_door', 'w');
    const warm = [['warm_coat', 2], ['fur', 2], ['white_wool', 4]];
    // Room for two (10 by 5); behind it the servants' store of firewood and candles.
    b.box(22, U, 53, 31, L2 - 1, 53, 'white_stucco');
    constructionPalaceBed(b, 22, U, 48, 'w');
    constructionPalaceBed(b, 22, U, 51, 'w');
    constructionPalaceChest(b, 22, U, 50, 'e', [['white_wool', 8], ['candle', 4], ['bread', 4]]);
    b.set(22, U + 1, 50, 'candle');
    constructionPalaceNordicWardrobe(b, 29, U, 48, 's', warm);
    b.box(25, U, 49, 27, U, 51, 'brown_carpet');
    lantern(27, L2 - 1, 50);
    b.door(32, U, 55, 'spruce_door', 'w');
    constructionPalaceChest(b, 22, U, 55, 'e', [['planks', 32], ['coal_ore', 32]], 'barrel');
    constructionPalaceChest(b, 22, U, 56, 'e', [['planks', 32], ['spruce_sapling', 4]], 'barrel');
    constructionPalaceChest(b, 25, U, 56, 'n', [['candle', 24], ['torch', 16], ['lantern', 2]]);
    constructionPalaceChest(b, 28, U, 56, 'n', [['salt', 8], ['honey_bottle', 4], ['bread', 8]]);
    lantern(27, L2 - 1, 55);
    // Room for four (10 by 8), with a table; behind it the sewing room and the servants' privy.
    b.box(22, U, 66, 31, L2 - 1, 66, 'white_stucco');
    b.box(27, U, 67, 27, L2 - 1, 71, 'white_stucco');
    for (const z of [58, 60, 63, 65]) constructionPalaceBed(b, 22, U, z, 'w');
    constructionPalaceChest(b, 22, U, 59, 'e', [['white_wool', 8], ['red_wool', 4], ['candle', 4]]);
    constructionPalaceChest(b, 22, U, 64, 'e', [['blue_wool', 8], ['leather', 4], ['candle', 4]]);
    b.box(27, U, 60, 28, U, 61, 'table');
    b.set(26, U, 60, 'stool');
    b.set(29, U, 61, 'stool');
    b.set(28, U, 62, 'stool');
    b.set(27, U + 1, 61, 'candle');
    constructionPalaceNordicTop(b, 28, U + 1, 60, 'jug');
    constructionPalaceNordicTop(b, 28, U + 1, 61, 'meal_plate');
    constructionPalaceNordicWardrobe(b, 28, U, 65, 'n', warm);
    constructionPalaceNordicWardrobe(b, 30, U, 65, 'n', warm);
    lantern(26, L2 - 1, 59);
    lantern(26, L2 - 1, 64);
    // The sewing room (5 by 5), by the window: a worktable and a chair, the wool in a chest.
    b.door(24, U, 66, 'spruce_door', 's');
    b.set(24, U, 69, 'table');
    piece(23, U, 69, 'oak_chair', 'chair', 'e');
    constructionPalaceNordicTop(b, 24, U + 1, 69, 'sewing_basket', 'w');
    constructionPalaceChest(b, 22, U, 71, 'e', [['white_wool', 16], ['red_wool', 8], ['blue_wool', 8], ['yellow_wool', 8]]);
    constructionPalaceChest(b, 26, U, 71, 'n', [['white_wool', 16], ['feather', 8], ['leather', 4]], 'barrel');
    lantern(25, L2 - 1, 68);
    lantern(23, L2 - 1, 70);
    // The servants' privy (4 by 5): two toilets, a wash tub, two basins.
    b.door(32, U, 69, 'spruce_door', 'w');
    for (const x of [28, 30]) piece(x, U, 71, 'toilet', 'toilet', 'n');
    for (const x of [28, 29]) piece(x, U, 67, 'sink', 'sink', 's');
    b.shaped(30, U, 67, 'bathtub', 'bathtub', { part: 'foot', facing: b.facing('e') });
    b.shaped(31, U, 67, 'bathtub', 'bathtub', { part: 'head', facing: b.facing('e') });
    lantern(29, L2 - 1, 69);
    // Room for two more.
    constructionPalaceBed(b, 22, U, 82, 'w');
    constructionPalaceBed(b, 22, U, 85, 'w');
    constructionPalaceNordicWardrobe(b, 26, U, 86, 'n', warm);
    lantern(27, L2 - 1, 83);
    // The housekeeper: a bed, a desk with a lamp, the keys' chest.
    constructionPalaceBed(b, 22, U, 89, 'w');
    piece(26, U, 92, 'desk', 'desk', 'n');
    b.set(26, U + 1, 92, 'table_lamp');
    piece(26, U, 91, 'oak_chair', 'chair', 's');
    constructionPalaceChest(b, 22, U, 91, 'e', [['candle', 16], ['blueprint', 2], ['measuring_tape', 1], ['white_wool', 8]]);
    lantern(28, L2 - 1, 89);
    // The linen store.
    for (const z of [95, 97, 99, 101]) constructionPalaceChest(b, 22, U, z, 'e', z < 98 ? [['white_wool', 48], ['blue_wool', 16]] : [['red_wool', 24], ['yellow_wool', 16], ['green_wool', 16]]);
    constructionPalaceChest(b, 28, U, 102, 'n', [['fur', 12], ['leather', 12], ['feather', 16]], 'barrel');
    lantern(26, L2 - 1, 97);
    lantern(26, L2 - 1, 100);
    const light = constructionPalaceNordicLight;
    for (const [z0, z1] of [[48, 62], [65, 70], [81, 92], [94, 102]]) light(b, z0 === 65 ? 23 : 22, z0, 31, z1, F);
    for (const [z0, z1] of [[48, 52], [54, 56], [58, 65], [81, 86], [88, 92], [94, 102]]) light(b, 22, z0, 31, z1, U);
}

// The east wing's rooms, drawn in the west wing's local terms (b.sym mirrors them): the outer wall is at
// x 20..21 here, the corridor at x 33..35.
function constructionPalaceNordicEastWing(b) {
    const G = PALACE_NORDIC_GROUND;
    const F = G + 1;
    const L1 = G + 6;
    const L2 = G + 12;
    const U = L1 + 1;
    const { piece, lantern, floorLamp } = constructionFurnisher(b);
    b.box(22, U, 63, 31, L2 - 1, 63, 'white_stucco');
    constructionPalaceNordicDoorway(b, 36, F, 80, 'e', 2);
    constructionPalaceSign(b, 34, F, 87, 's', ...PALACE_NORDIC_SIGNS.observatory);
    for (const z of [67, 84]) constructionPalaceNordicWindow(b, 20, z, F + 1, F + 2, 'w');
    for (const z of [67, 76, 84]) constructionPalaceNordicWindow(b, 20, z, U + 1, U + 2, 'w');
    constructionPalaceNordicCurtain(b, 20, 67, U + 1, U + 2, 'w', 'yellow');
    constructionPalaceNordicCurtain(b, 20, 84, U + 1, U + 2, 'w', 'white');

    // The Hall of Light, two floors high: rows of benches looking at a marble bust on a dais, stained glass,
    // candles and chandeliers. A hall for music and quiet; no writing on its walls.
    b.box(22, L1, 48, 31, L1, 62, null);
    for (let z = 48; z <= 62; z++) {
        for (let x = 22; x <= 31; x++) b.set(x, G, z, (x + z) % 2 ? 'marble' : 'blue_glazed_tile');
    }
    b.door(32, F, 51, 'spruce_door', 'w');
    b.door(32, F, 59, 'spruce_door', 'w');
    const glass = ['blue', 'yellow', 'light_blue', 'red', 'blue', 'yellow', 'light_blue', 'white'];
    for (const z of [50, 55, 60]) {
        for (let y = F + 2; y <= U + 4; y++) b.set(20, y, z, `${glass[(y + z) % glass.length]}_stained_glass_pane`);
        b.box(21, F + 2, z, 21, U + 4, z, null);
        for (const s of [-1, 1]) b.box(20, F + 2, z + s, 20, U + 4, z + s, 'white_stucco');
    }
    b.box(22, F, 53, 23, F, 57, 'marble');
    for (let z = 53; z <= 57; z++) b.stairs(24, F, z, 'stone_brick_stairs', 'w');
    piece(22, F + 1, 55, 'statue', 'statue', 'e');
    for (const z of [53, 54, 56, 57]) b.set(23, F + 1, z, 'candle');
    for (const x of [26, 28, 30]) {
        for (let z = 49; z <= 61; z++) {
            if (z >= 54 && z <= 56) continue;
            piece(x, F, z, 'bench', 'bench', 'w');
        }
    }
    for (const z of [49, 61]) floorLamp(23, F, z);
    for (const [x, z] of [[26, 51], [26, 59], [29, 55]]) constructionPalaceNordicChandelier(b, x, L2, z, 3);
    for (const [x, z] of [[22, 48], [22, 62], [31, 62], [27, 48]]) lantern(x, F, z, 'floor');
    for (const z of [50, 55, 60]) {
        b.set(32, U + 1, z, 'glass_pane');
        b.set(32, U + 2, z, 'glass_pane');
    }
    constructionPalaceChest(b, 31, F, 48, 's', [['candle', 48], ['lantern', 4], ['glow_dust', 8]]);

    // The storeroom of the household's metal and leather: chests and barrels in rows, the workbench.
    b.door(32, F, 68, 'spruce_door', 'w');
    constructionPalaceChest(b, 22, F, 65, 'e', [['iron_block', 4], ['copper_block', 4], ['brass_ingot', 12], ['bronze_ingot', 12]]);
    constructionPalaceChest(b, 22, F, 67, 'e', [['leather', 24], ['fur', 8], ['feather', 16]]);
    constructionPalaceChest(b, 22, F, 69, 'e', [['torch', 32], ['coal_ore', 32], ['iron_ore', 16]], 'barrel');
    constructionPalaceChest(b, 22, F, 71, 'e', [['copper_wrench', 2], ['measuring_tape', 2], ['copper_wire', 16], ['lantern', 4]]);
    b.set(26, F, 71, 'workbench');
    piece(26, F + 1, 71, 'wall_shelf', 'wall_shelf', 'n');
    b.box(29, F, 70, 31, F, 71, 'iron_block');
    b.set(31, F + 1, 71, 'copper_block');
    lantern(26, L1 - 1, 66);
    lantern(29, L1 - 1, 69);

    // The sleigh workshop: a sleigh of spruce on its runners, the workbench, tools and wood.
    b.door(32, F, 84, 'spruce_door', 'w');
    for (let x = 24; x <= 28; x++) {
        b.set(x, F, 83, 'spruce_fence');
        b.set(x, F, 86, 'spruce_fence');
    }
    b.box(24, F + 1, 83, 28, F + 1, 86, 'spruce_planks_slab');
    for (let z = 83; z <= 86; z++) {
        b.stairs(24, F + 1, z, 'spruce_stairs', 'w');
        b.stairs(28, F + 1, z, 'spruce_stairs', 'e');
    }
    b.box(29, F, 83, 29, F, 86, 'spruce_planks');
    b.box(29, F + 1, 83, 29, F + 1, 86, 'red_wool');
    b.set(22, F, 82, 'workbench');
    // The drawing of the sleigh on the bench, the work half done beside it.
    constructionPalaceNordicTop(b, 22, F + 1, 82, 'scroll', 'e');
    constructionPalaceChest(b, 22, F, 85, 'e', [['planks', 32], ['spruce_sapling', 8], ['iron_hoe', 1], ['fishing_rod', 2]]);
    constructionPalaceChest(b, 22, F, 88, 'e', [['leather', 8], ['red_wool', 8], ['candle', 8]], 'barrel');
    lantern(26, L1 - 1, 82);
    lantern(26, L1 - 1, 87);

    // Upstairs: the children's bedroom and the guest bedroom, 6 by 8 each; between each and the corridor a
    // little lobby with the coats (3 by 4) and a washroom (3 by 3).
    for (const [zWall, zLobby, zBath] of [[67, 70, 65], [85, 82, 87]]) {
        b.box(28, U, zWall < 80 ? 64 : 81, 28, L2 - 1, zWall < 80 ? 71 : 88, 'white_stucco');
        b.box(29, U, zWall, 31, L2 - 1, zWall, 'white_stucco');
        b.door(28, U, zLobby, 'spruce_door', 'w');
        b.door(30, U, zWall, 'spruce_door', zBath > zWall ? 's' : 'n');
        lantern(30, L2 - 1, zBath);
        lantern(30, L2 - 1, zLobby);
    }
    b.door(32, U, 69, 'spruce_door', 'w');
    b.door(32, U, 84, 'spruce_door', 'w');
    // The children's room: two beds, a lamp, the toy chest, a desk with its globe, a rug.
    constructionPalaceBed(b, 22, U, 65, 'w');
    constructionPalaceBed(b, 22, U, 70, 'w');
    piece(22, U, 66, 'bedside_table', 'bedside_table', 'e');
    b.set(22, U + 1, 66, 'table_lamp');
    constructionPalaceChest(b, 22, U, 68, 'e', [['star_chart', 1], ['measuring_tape', 1], ['bug_net', 1], ['feather', 8], ['blue_wool', 8]]);
    constructionPalaceNordicWardrobe(b, 26, U, 71, 'n', [['warm_coat', 2], ['fur', 2], ['yellow_wool', 4]]);
    b.box(24, U, 66, 27, U, 69, 'yellow_carpet');
    b.box(25, U, 67, 26, U, 68, 'blue_carpet');
    piece(26, U, 64, 'desk', 'desk', 's');
    constructionPalaceNordicTop(b, 26, U + 1, 64, 'book_stack', 's');
    piece(25, U, 65, 'oak_chair', 'chair', 'e');
    b.set(27, U, 64, 'globe');
    piece(24, U + 1, 71, 'painting_night', 'painting', 'n');
    lantern(25, L2 - 1, 66);
    lantern(25, L2 - 1, 69);
    // Its lobby and washroom.
    constructionPalaceNordicWardrobe(b, 31, U, 71, 'n', [['warm_coat', 2], ['fur', 2], ['white_wool', 2]]);
    constructionPalaceChest(b, 29, U, 68, 'e', [['snow_block', 8], ['feather', 4], ['yellow_wool', 4]]);
    b.shaped(29, U, 64, 'bathtub', 'bathtub', { part: 'foot', facing: b.facing('e') });
    b.shaped(30, U, 64, 'bathtub', 'bathtub', { part: 'head', facing: b.facing('e') });
    piece(31, U, 64, 'toilet', 'toilet', 's');
    piece(31, U, 66, 'sink', 'sink', 'w');
    // The guest bedroom: a double bed between lamps, a wardrobe with coats, a rug of fur.
    constructionPalaceBed(b, 22, U, 84, 'w');
    constructionPalaceBed(b, 22, U, 85, 'w');
    for (const z of [83, 86]) piece(22, U, z, 'bedside_table', 'bedside_table', 'e');
    b.set(22, U + 1, 83, 'table_lamp');
    constructionPalaceNordicTop(b, 22, U + 1, 86, 'open_book', 'e');
    constructionPalaceNordicWardrobe(b, 25, U, 88, 'n', [['warm_coat', 3], ['fur', 4], ['leather', 2]]);
    b.box(24, U, 83, 27, U, 86, 'white_carpet');
    b.box(25, U, 84, 26, U, 85, 'brown_carpet');
    piece(27, U + 1, 87, 'painting_peaks', 'painting', 'w');
    constructionPalaceNordicChandelier(b, 25, L2, 84);
    // Its lobby and washroom.
    constructionPalaceChest(b, 29, U, 81, 'e', [['white_wool', 8], ['red_wool', 4], ['mirror', 1], ['honey_bottle', 2]]);
    piece(31, U, 81, 'oak_chair', 'chair', 'w');
    b.shaped(29, U, 88, 'bathtub', 'bathtub', { part: 'foot', facing: b.facing('e') });
    b.shaped(30, U, 88, 'bathtub', 'bathtub', { part: 'head', facing: b.facing('e') });
    piece(31, U, 88, 'toilet', 'toilet', 'n');
    piece(31, U, 86, 'sink', 'sink', 'w');
    piece(31, U + 1, 86, 'wall_mirror', 'wall_mirror', 'w');
    const light = constructionPalaceNordicLight;
    for (const [z0, z1] of [[48, 62], [64, 71], [81, 88]]) light(b, 22, z0, 31, z1, F, z0 === 48 ? 5 : 6);
    for (const [z0, z1] of [[64, 71], [81, 88]]) light(b, 22, z0, 27, z1, U);
}

// ---------------------------------------------------------------------------------------
// The main block

function constructionPalaceNordicMain(b) {
    const G = PALACE_NORDIC_GROUND;
    const F = G + 1;
    const L1 = G + 6;
    const L2 = G + 12;
    const L3 = G + 18;
    const U = L1 + 1;
    const V = L2 + 1;
    const { piece, lantern, floorLamp, curtain } = constructionFurnisher(b);
    constructionPalaceNordicShell(b, { x0: 38, z0: 40, x1: 92, z1: 68, top: L3, palette: PALACE_NORDIC_RED, floors: [G, L1, L2, L3] });
    // The throne room is two floors high.
    b.box(40, L2, 54, 90, L2, 66, null);
    b.box(40, F, 53, 90, L3 - 1, 53, 'white_stucco');
    for (const x of [55, 75]) b.box(x, F, 42, x, L3 - 1, 52, 'white_stucco');

    // ---- The facade: windows, pilasters, the doors, cornices ----
    b.sym(() => {
        for (const x of [43, 47, 51]) {
            constructionPalaceNordicWindow(b, x, 40, F + 1, F + 2, 'n', b.flipped ? 'iron_bars' : 'glass_pane');
            constructionPalaceNordicWindow(b, x, 40, U + 1, U + 3, 'n');
            constructionPalaceNordicWindow(b, x, 40, V + 1, V + 2, 'n');
        }
        for (const x of [44, 50, 56]) {
            constructionPalaceNordicWindow(b, x, 68, F + 1, F + 2, 's');
            constructionPalaceNordicWindow(b, x, 68, U + 2, U + 7, 's');
        }
        constructionPalaceNordicWindow(b, 38, 43, F + 1, F + 2, 'w');
        constructionPalaceNordicWindow(b, 38, 43, U + 1, U + 3, 'w');
        constructionPalaceNordicWindow(b, 38, 43, V + 1, V + 2, 'w');
        // Curtains in the bedrooms, the library and the weather room, and the tall windows of the throne room.
        const colour = b.flipped ? 'blue' : 'red';
        for (const x of [43, 47, 51]) {
            constructionPalaceNordicCurtain(b, x, 40, V + 1, V + 2, 'n', colour);
            constructionPalaceNordicCurtain(b, x, 40, U + 1, U + 3, 'n', 'yellow');
        }
        constructionPalaceNordicCurtain(b, 38, 43, V + 1, V + 2, 'w', colour);
        constructionPalaceNordicCurtain(b, 38, 43, U + 1, U + 3, 'w', 'yellow');
        for (const x of [44, 50, 56]) constructionPalaceNordicCurtain(b, x, 68, U + 2, U + 7, 's', 'red');
        for (const x of [41, 45, 49, 53]) {
            b.set(x, F, 39, 'stone_bricks');
            b.box(x, F + 1, 39, x, L3 - 1, 39, 'white_stucco');
        }
        // Chimneys of the hearths in the end walls, up through the roof.
        for (const z of [46, 60]) {
            b.box(38, L3 + 1, z, 39, L3 + 6, z + 1, 'brick');
            b.box(38, L3 + 7, z, 39, L3 + 7, z + 1, 'stone_bricks_slab');
        }
    });
    b.box(63, F, 40, 67, F + 1, 41, null);
    b.box(65, F, 40, 65, F + 2, 41, 'white_stucco');
    b.doubleDoor(63, F, 40, 64, 40, 'dark_oak_door', 's');
    b.doubleDoor(66, F, 40, 67, 40, 'dark_oak_door', 's');
    b.box(65, U, 41, 65, U + 1, 41, null);
    b.door(65, U, 40, 'spruce_door', 'n');

    // ---- The vestibule and the grand stair ----
    for (let z = 42; z <= 52; z++) {
        for (let x = 56; x <= 74; x++) b.set(x, G, z, (x + z) % 2 ? 'marble' : 'basalt');
    }
    b.box(64, G, 42, 66, G, 52, 'red_wool');
    b.sym(() => {
        // Up to the first floor: along the side walls, towards the front.
        for (let k = 1; k <= 6; k++) {
            for (const x of [56, 57]) {
                b.stairs(x, G + k, 52 - k, 'spruce_stairs', 'n');
                if (k > 1) b.box(x, F, 52 - k, x, G + k - 1, 52 - k, 'spruce_planks');
            }
        }
        b.box(56, L1, 47, 57, L1, 51, null);
        b.box(58, U, 47, 58, U, 52, 'spruce_fence');
        b.box(56, U, 52, 57, U, 52, 'spruce_fence');
        // Up to the second floor: from the front landing, towards the back.
        for (let k = 1; k <= 6; k++) {
            for (const x of [60, 61]) {
                b.stairs(x, L1 + k, 42 + k, 'spruce_stairs', 's');
                if (k > 1) b.box(x, U, 42 + k, x, L1 + k - 1, 42 + k, 'spruce_planks');
            }
        }
        b.box(60, L2, 44, 61, L2, 47, null);
        b.box(59, V, 43, 59, V, 47, 'spruce_fence');
        b.box(62, V, 43, 62, V, 47, 'spruce_fence');
        b.box(60, V, 43, 61, V, 43, 'spruce_fence');
        piece(59, F, 43, 'statue', 'statue', 'e');
        lantern(59, F, 51, 'floor');
        piece(55 + 1, F + 2, 53 - 1, 'painting_peaks', 'painting', 'n');
        // Doors from the landings to the side rooms.
        b.door(55, F, 44, b.flipped ? 'iron_door' : 'spruce_door', 'w');
        b.door(55, U, 43, 'spruce_door', 'w');
        b.door(55, V, 50, 'spruce_door', 'w');
        constructionPalaceNordicChandelier(b, 63, L2, 49);
        lantern(57, L2 - 1, 44);
        lantern(58, L3 - 1, 50);
        lantern(57, L3 - 1, 43);
        piece(64 - 1, V + 1, 52, 'red_banner', 'banner', 'n');
    });
    constructionPalaceNordicChandelier(b, 65, L1, 45);
    constructionPalaceNordicChandelier(b, 65, L1, 50);
    constructionPalaceNordicChandelier(b, 65, L2, 47);
    constructionPalaceNordicChandelier(b, 65, L3, 48, 1);
    b.box(63, F, 53, 67, F + 2, 53, null);
    b.box(64, U, 53, 66, U + 2, 53, null);
    // Over the landing of the second floor, windows look down into the throne room.
    for (const x of [58, 72]) b.box(x, V + 1, 53, x, V + 2, 53, 'glass_pane');
    // The way out onto the balcony, and the lights of the landings.
    b.box(64, U, 42, 66, U, 42, 'red_carpet');

    constructionPalaceNordicGreatHall(b);
    constructionPalaceNordicThroneRoom(b);
    constructionPalaceNordicFrontRooms(b);
    constructionPalaceNordicPorch(b);
    // Standing lanterns round every room of the block, where the furniture leaves room.
    for (const y of [F, U, V]) {
        constructionPalaceNordicLight(b, 56, 42, 74, 52, y, 5);
        constructionPalaceNordicLight(b, 40, 42, 54, 52, y, 5);
        constructionPalaceNordicLight(b, 76, 42, 90, 52, y, 5);
    }
    constructionPalaceNordicLight(b, 40, 54, 90, 66, F, 5);
    constructionPalaceNordicLight(b, 40, 54, 90, 66, U, 5);

    // ---- Cornices, the roof and its domes ----
    for (const y of [L1, L2, L3]) constructionPalaceNordicCornice(b, 38, 40, 92, 68, y);
    constructionPalaceNordicHipRoof(b, 37, 39, 93, 69, L3 + 1, 'dark_oak_stairs', 'dark_oak_planks');
    constructionPalaceNordicDrum(b, 65, 54, L3 + 1, L3 + 23, 5);
    constructionPalaceNordicOnion(b, 65, 54, L3 + 24, 5, ['yellow', 'yellow']);
    const corners = [[46, 47, ['blue', 'white']], [84, 47, ['green', 'yellow']], [46, 61, ['red', 'white']], [84, 61, ['turquoise', 'white']]];
    for (const [cx, cz, colours] of corners) {
        constructionPalaceNordicDrum(b, cx, cz, L3 + 1, L3 + 14, 3);
        constructionPalaceNordicOnion(b, cx, cz, L3 + 15, 3, colours);
    }
}

// The great hall, on the ground floor behind the vestibule: two long tables, two great fireplaces at the ends,
// banners between the windows, the door out to the courtyard gallery.
function constructionPalaceNordicGreatHall(b) {
    const G = PALACE_NORDIC_GROUND;
    const F = G + 1;
    const L1 = G + 6;
    const { piece, lantern } = constructionFurnisher(b);
    for (let z = 54; z <= 66; z++) {
        for (let x = 40; x <= 90; x++) b.set(x, G, z, z === 54 || z === 66 || x === 40 || x === 90 ? 'dark_oak_planks' : 'spruce_planks');
    }
    b.box(64, G, 54, 66, G, 66, 'red_wool');
    b.door(65, F, 67, 'spruce_door', 's');
    b.box(65, F, 68, 65, F + 1, 68, null);
    b.sym(() => {
        constructionPalaceNordicDoorway(b, 39, F, 55, 'w', 4);
        constructionPalaceNordicHearth(b, 40, F, 60, 'e', L1, 2);
        for (const z0 of [57, 62]) {
            b.box(45, F, z0, 60, F, z0 + 1, 'table');
            for (let x = 45; x <= 60; x++) {
                // On the outer side of each table some chairs are pushed back or left turned.
                const [zOut, faceOut, zIn, faceIn] = z0 === 57 ? [z0 - 1, 's', z0 + 2, 'n'] : [z0 + 2, 'n', z0 - 1, 's'];
                const h = constructionPalaceHash(x, F, z0, b.flipped ? 73 : 79);
                piece(x, F, h < 0.15 ? zOut + (z0 === 57 ? -1 : 1) : zOut, 'dark_oak_chair', 'chair', h >= 0.15 && h < 0.25 ? (h < 0.2 ? 'e' : 'w') : faceOut);
                piece(x, F, zIn, 'dark_oak_chair', 'chair', faceIn);
                if (x % 3 === 0) b.set(x, F + 1, z0 + (x % 2), 'candle');
                // The feast half cleared: plates, jugs and bowls of fruit on some places.
                for (const z of [z0, z0 + 1]) {
                    if (x % 3 === 0 && z === z0 + (x % 2)) continue;
                    const t = constructionPalaceHash(x, F + 1, z, b.flipped ? 83 : 89);
                    if (t < 0.18) constructionPalaceNordicTop(b, x, F + 1, z, 'meal_plate');
                    else if (t < 0.27) constructionPalaceNordicTop(b, x, F + 1, z, 'jug');
                    else if (t < 0.32) constructionPalaceNordicTop(b, x, F + 1, z, 'fruit_bowl');
                }
            }
        }
        for (const x of [44, 52, 60]) constructionPalaceNordicChandelier(b, x, L1, 60);
        for (const x of [47, 53, 59]) {
            piece(x, F + 2, 66, x === 53 ? 'yellow_banner' : 'red_banner', 'banner', 'n');
            piece(x, F + 3, 66, x === 53 ? 'yellow_banner' : 'red_banner', 'banner', 'n');
        }
        for (const x of [42, 48, 54, 60]) constructionPalaceChest(b, x, F, 54, 's', x === 42 ? [['bread', 16], ['cheese', 8]] : x === 48 ? [['honey_bottle', 8], ['soda_water', 8]] : x === 54 ? [['cooked_fish', 12], ['salted_fish', 12]] : [['candle', 16], ['bread', 8]], 'barrel');
        for (const [x, z] of [[42, 56], [42, 64], [62, 55], [62, 65]]) lantern(x, L1 - 1, z);
    });
    constructionPalaceNordicChandelier(b, 65, L1, 57);
    constructionPalaceNordicChandelier(b, 65, L1, 63);
}

// The throne room on the first floor, two floors high: the gilded throne on a dais under red and gold
// banners, fur rugs, columns of spruce, two great fireplaces, tall windows on the courtyard.
function constructionPalaceNordicThroneRoom(b) {
    const G = PALACE_NORDIC_GROUND;
    const L1 = G + 6;
    const L3 = G + 18;
    const U = L1 + 1;
    const { piece, lantern, floorLamp } = constructionFurnisher(b);
    for (let z = 54; z <= 66; z++) {
        for (let x = 40; x <= 90; x++) {
            const border = z === 54 || z === 66 || x === 40 || x === 90;
            b.set(x, L1, z, border ? 'blue_glazed_tile' : (x + z) % 2 ? 'marble' : 'white_glazed_tile');
        }
    }
    b.box(64, U, 54, 66, U, 60, 'red_carpet');
    b.box(63, U, 54, 63, U, 60, 'yellow_carpet');
    b.box(67, U, 54, 67, U, 60, 'yellow_carpet');
    // The dais in two steps and the throne, a gold frame behind it.
    for (let x = 59; x <= 71; x++) {
        b.stairs(x, U, 61, 'stone_brick_stairs', 's');
        b.box(x, U, 62, x, U, 66, 'marble');
    }
    for (let x = 60; x <= 70; x++) {
        b.stairs(x, U + 1, 63, 'stone_brick_stairs', 's');
        b.box(x, U + 1, 64, x, U + 1, 66, 'marble');
    }
    b.box(63, U + 2, 64, 67, U + 2, 64, 'red_carpet');
    b.shaped(65, U + 2, 65, 'gilded_throne', 'throne', { half: 'lower', facing: b.facing('n') });
    b.shaped(65, U + 3, 65, 'gilded_throne', 'throne', { half: 'upper', facing: b.facing('n') });
    b.box(63, U + 2, 66, 63, U + 6, 66, 'gold_block');
    b.box(67, U + 2, 66, 67, U + 6, 66, 'gold_block');
    b.box(63, U + 7, 66, 67, U + 7, 66, 'gold_block');
    for (let y = U + 4; y <= U + 6; y++) {
        piece(64, y, 66, 'red_banner', 'banner', 'n');
        piece(65, y, 66, 'yellow_banner', 'banner', 'n');
        piece(66, y, 66, 'red_banner', 'banner', 'n');
    }
    b.sym(() => {
        constructionPalaceNordicHearth(b, 40, U, 60, 'e', L3, 2);
        // Columns of spruce with white capitals, a lantern at the foot of each.
        for (const x of [46, 54]) {
            for (const z of [56, 64]) {
                b.box(x, U, z, x, L3 - 2, z, 'spruce_wood');
                b.set(x, L3 - 1, z, 'white_stucco');
                lantern(x + 1, U, z, 'floor');
            }
        }
        // Fur rugs: white with a brown border.
        for (let z = 57; z <= 63; z++) {
            for (let x = 47; x <= 53; x++) b.set(x, U, z, x === 47 || x === 53 || z === 57 || z === 63 ? 'brown_carpet' : 'white_carpet');
        }
        for (const x of [47, 53, 59]) {
            for (let y = U + 3; y <= U + 6; y++) piece(x, y, 66, x === 53 ? 'yellow_banner' : 'red_banner', 'banner', 'n');
        }
        for (const x of [44, 56]) {
            for (let y = U + 3; y <= U + 6; y++) piece(x, y, 54, 'red_banner', 'banner', 's');
        }
        floorLamp(58, U, 62);
        for (const x of [48, 56]) constructionPalaceNordicChandelier(b, x, L3, 60, 3);
        for (const [x, z] of [[42, 55], [42, 65], [60, 55]]) lantern(x, U, z, 'floor');
        b.set(41, U + 2, 56, 'stone_bricks');
        piece(42, U + 2, 56, 'painting_sunset', 'painting', 'e');
    });
    constructionPalaceNordicChandelier(b, 65, L3, 58, 3);
    for (const [x, y, z] of [[61, U + 2, 65], [69, U + 2, 65], [59, U + 1, 62], [71, U + 1, 62], [62, U, 56], [68, U, 56], [62, U, 60], [68, U, 60]]) lantern(x, y, z, 'floor');
    for (const [x, z] of [[62, 64], [68, 64]]) b.set(x, U + 2, z, 'candle');
    for (const z of [55, 59]) lantern(65, L3 - 1, z);
}

// The rooms at the front of the main block, each floor a pair: cloakroom and treasury, library and weather
// room, the royal bedroom and the east bedroom.
function constructionPalaceNordicFrontRooms(b) {
    const G = PALACE_NORDIC_GROUND;
    const F = G + 1;
    const L1 = G + 6;
    const L2 = G + 12;
    const L3 = G + 18;
    const U = L1 + 1;
    const V = L2 + 1;
    const { piece, lantern, floorLamp, curtain } = constructionFurnisher(b);
    const S = PALACE_NORDIC_SIGNS;
    b.sym(() => {
        // A hearth in the end wall on every floor, the three flues in one chimney.
        constructionPalaceNordicHearth(b, 40, F, 47, 'e', L1, 1);
        constructionPalaceNordicHearth(b, 40, U, 47, 'e', L2, 1);
        constructionPalaceNordicHearth(b, 40, V, 47, 'e', L3, 1);
        constructionPalaceNordicDoorway(b, 39, U, 50, 'w', 4);
    });

    // The cloakroom: where coats and furs wait, benches to pull boots on, a mirror.
    for (const x of [42, 44, 46, 48]) constructionPalaceNordicWardrobe(b, x, F, 52, 'n', [['warm_coat', 4], ['fur', 4], ['leather', 2]]);
    for (let x = 43; x <= 52; x++) piece(x, F, 42, 'bench', 'bench', 's');
    constructionPalaceChest(b, 52, F, 52, 'n', [['warm_coat', 8], ['fur', 12], ['white_wool', 16], ['leather', 8]]);
    constructionPalaceChest(b, 54, F, 52, 'n', [['candle', 16], ['lantern', 4], ['torch', 16]]);
    b.box(44, F, 46, 51, F, 49, 'brown_carpet');
    b.box(45, F, 47, 50, F, 48, 'white_carpet');
    piece(54, F + 1, 47, 'wall_mirror', 'wall_mirror', 'w');
    constructionPalaceNordicChandelier(b, 47, L1, 47);
    lantern(53, L1 - 1, 44);
    lantern(53, L1 - 1, 50);

    // The library: shelves along the walls, a reading table with chairs, a desk with a lamp, the globe.
    for (let x = 42; x <= 54; x++) {
        if (x === 47 || x === 43 || x === 51) continue;
        for (let y = U; y <= U + 2; y++) piece(x, y, 52, 'bookshelf', 'bookshelf', 'n');
    }
    for (let x = 42; x <= 54; x++) {
        if (x === 43 || x === 47 || x === 51) continue;
        for (let y = U; y <= U + 1; y++) piece(x, y, 42, 'bookshelf', 'bookshelf', 's');
    }
    b.box(46, U, 46, 50, U, 48, 'table');
    for (const x of [46, 48, 50]) {
        piece(x, U, 45, 'dark_oak_chair', 'chair', 's');
        piece(x, U, 49, 'dark_oak_chair', 'chair', 'n');
    }
    b.set(47, U + 1, 47, 'candle');
    b.set(49, U + 1, 47, 'candle');
    // Somebody was reading here: a book open, a pile of others, a map unrolled; a chair left turned.
    constructionPalaceNordicTop(b, 48, U + 1, 46, 'open_book', 'n');
    constructionPalaceNordicTop(b, 50, U + 1, 48, 'book_stack', 'e');
    constructionPalaceNordicTop(b, 46, U + 1, 48, 'scroll', 's');
    piece(50, U, 45, 'dark_oak_chair', 'chair', 'e');
    piece(53, U, 46, 'desk', 'desk', 'w');
    b.set(53, U + 1, 46, 'table_lamp');
    piece(52, U, 46, 'dark_oak_chair', 'chair', 'e');
    b.set(53, U, 49, 'globe');
    constructionPalaceChest(b, 43, U, 52, 'n', [['star_chart', 4], ['blueprint', 6], ['breeding_notebook', 3], ['candle', 16]]);
    constructionPalaceChest(b, 51, U, 52, 'n', [['astrolabe', 1], ['globe', 1], ['measuring_tape', 2], ['blueprint', 4]]);
    b.box(44, U, 50, 50, U, 50, 'red_carpet');
    constructionPalaceNordicChandelier(b, 48, L2, 47);
    lantern(43, L2 - 1, 44);
    lantern(53, L2 - 1, 51);

    // The royal bedroom: a great bed between lamps under drapes, wardrobes of furs, a desk, a rug, the hearth.
    // The ruler's room keeps its size; its front corner by the door is the royal washroom (4 by 4).
    constructionPalaceBed(b, 46, V, 52, 's');
    constructionPalaceBed(b, 47, V, 52, 's');
    for (const x of [45, 48]) {
        piece(x, V, 52, 'bedside_table', 'bedside_table', 'n');
        b.set(x, V + 1, 52, 'table_lamp');
    }
    curtain(44, V, 52, 'red', 'n', 'open');
    curtain(49, V, 52, 'red', 'n');
    piece(46, V + 2, 52, 'painting_meadow', 'painting', 'n');
    constructionPalaceNordicWardrobe(b, 48, V, 42, 's', [['warm_coat', 4], ['fur', 8], ['leather', 4]]);
    constructionPalaceNordicWardrobe(b, 49, V, 42, 's', [['warm_coat', 2], ['fur', 6], ['red_wool', 4]]);
    constructionPalaceChest(b, 46, V, 49, 'n', [['white_wool', 8], ['red_wool', 8], ['candle', 8], ['mirror', 1]]);
    b.box(44, V, 44, 49, V, 48, 'white_carpet');
    b.box(45, V, 45, 48, V, 47, 'brown_carpet');
    piece(53, V, 50, 'desk', 'desk', 'w');
    constructionPalaceNordicTop(b, 53, V + 1, 50, 'inkwell', 'w');
    piece(52, V, 51, 'oak_chair', 'chair', 'n');
    // Tea by the fire: a small table and a chair turned to the hearth.
    b.set(42, V, 50, 'table');
    constructionPalaceNordicTop(b, 42, V + 1, 50, 'tea_set', 's');
    piece(42, V, 51, 'oak_chair', 'chair', 'w');
    floorLamp(42, V, 43);
    constructionPalaceNordicChandelier(b, 47, L3, 47);
    lantern(53, L3 - 1, 51);
    // The royal washroom: a tub under the front wall, the toilet, a basin with its mirror.
    b.box(50, V, 42, 50, L3 - 1, 46, 'white_stucco');
    b.box(51, V, 46, 54, L3 - 1, 46, 'white_stucco');
    b.door(50, V, 44, 'spruce_door', 'e');
    b.shaped(53, V, 42, 'bathtub', 'bathtub', { part: 'foot', facing: b.facing('e') });
    b.shaped(54, V, 42, 'bathtub', 'bathtub', { part: 'head', facing: b.facing('e') });
    piece(51, V, 42, 'toilet', 'toilet', 's');
    piece(54, V, 44, 'sink', 'sink', 'w');
    piece(54, V + 1, 44, 'wall_mirror', 'wall_mirror', 'w');
    lantern(52, L3 - 1, 44);

    // The treasury, behind an iron door and barred windows: chests of gold and gems, gold under glass.
    for (let z = 42; z <= 52; z++) {
        for (let x = 76; x <= 90; x++) b.set(x, G, z, (x + z) % 2 ? 'gold_block' : 'marble');
    }
    constructionPalaceChest(b, 85, F, 52, 'n', [['gold_ore', 12], ['gold_leaf', 16], ['gold_block', 2]]);
    constructionPalaceChest(b, 87, F, 52, 'n', [['ruby', 6], ['sapphire', 6], ['amber', 4]]);
    constructionPalaceChest(b, 89, F, 52, 'n', [['meteoric_iron', 3], ['brass_ingot', 8], ['bronze_ingot', 8]]);
    for (const [x, z] of [[80, 46], [84, 46], [80, 49], [84, 49]]) {
        b.set(x, F, z, 'marble');
        b.set(x, F + 1, z, 'gold_block');
        b.set(x, F + 2, z, 'glass');
    }
    piece(82, F, 52, 'statue', 'statue', 'n');
    for (const x of [79, 81, 83, 85]) piece(x, F + 2, 52, 'yellow_banner', 'banner', 'n');
    constructionPalaceNordicChandelier(b, 83, L1, 47);
    lantern(77, L1 - 1, 51);
    lantern(88, L1 - 1, 44);

    // The weather room: the instruments in their chests, a desk with a log, the globe, what each one means.
    piece(77, U, 44, 'desk', 'desk', 'e');
    piece(78, U, 44, 'oak_chair', 'chair', 'w');
    // The weather log, today's line half written.
    constructionPalaceNordicTop(b, 77, U + 1, 44, 'inkwell', 'e');
    constructionPalaceChest(b, 89, U, 52, 'n', [['thermometer', 3], ['barometer', 2], ['anemometer', 2], ['measuring_tape', 1]]);
    constructionPalaceChest(b, 87, U, 52, 'n', [['water_flask', 4], ['glass', 4], ['snow_block', 8], ['ice', 8]]);
    constructionPalaceChest(b, 85, U, 52, 'n', [['sundial', 1], ['star_chart', 2], ['candle', 8]]);
    b.set(83, U, 52, 'globe');
    piece(80, U + 2, 52, 'wall_clock', 'wall_clock', 'n');
    constructionPalaceSign(b, 80, U, 46, 's', ...S.thermometer);
    constructionPalaceSign(b, 84, U, 46, 's', ...S.snow);
    constructionPalaceSign(b, 80, U, 49, 'n', ...S.barometer);
    constructionPalaceSign(b, 84, U, 49, 'n', ...S.anemometer);
    // A barometer and a thermometer on the wall, as blocks: a column of glass, red inside, on a board.
    b.box(78, U + 1, 52, 78, U + 2, 52, 'glass');
    b.set(78, U, 52, 'red_wool');
    constructionPalaceNordicChandelier(b, 83, L2, 47);
    lantern(89, L2 - 1, 44);
    lantern(77, L2 - 1, 51);

    // The east suite, the heir's, in five rooms where there was one: from the landing a small salon (6 by 7)
    // with a game of chess left half played; off it a study (6 by 3) and the bedroom (8 by 7) by the hearth;
    // behind the bedroom a dressing closet (3 by 3) and a washroom (4 by 3).
    b.box(82, V, 42, 82, L3 - 1, 52, 'white_stucco');
    b.box(83, V, 49, 89, L3 - 1, 49, 'white_stucco');
    b.box(86, V, 50, 86, L3 - 1, 52, 'white_stucco');
    b.box(76, V, 45, 81, L3 - 1, 45, 'white_stucco');
    b.door(82, V, 47, 'spruce_door', 'e');
    b.door(78, V, 45, 'spruce_door', 'n');
    b.door(84, V, 49, 'spruce_door', 's');
    b.door(88, V, 49, 'spruce_door', 's');
    // The salon: a sofa, the chess table between two chairs, one pushed back.
    for (const z of [47, 48]) piece(76, V, z, 'blue_sofa', 'sofa', 'e');
    b.box(77, V, 47, 80, V, 51, 'blue_carpet');
    b.set(78, V, 48, 'table');
    constructionPalaceNordicTop(b, 78, V + 1, 48, 'chessboard', 's');
    piece(78, V, 47, 'oak_chair', 'chair', 's');
    piece(79, V, 50, 'oak_chair', 'chair', 'w');
    piece(81, V + 2, 50, 'painting_night', 'painting', 'w');
    lantern(77, L3 - 1, 50);
    // The study: a desk under the window's light, a chest of papers, shelves.
    piece(81, V, 43, 'desk', 'desk', 'w');
    constructionPalaceNordicTop(b, 81, V + 1, 43, 'inkwell', 'w');
    piece(80, V, 43, 'oak_chair', 'chair', 'e');
    constructionPalaceChest(b, 76, V, 44, 'e', [['white_wool', 8], ['blue_wool', 8], ['candle', 6], ['blueprint', 2]]);
    for (const x of [76, 77]) piece(x, V, 42, 'bookshelf', 'bookshelf', 's');
    lantern(79, L3 - 1, 43);
    // The bedroom: a double bed between bedside tables, a sofa at the fire, a rug.
    constructionPalaceBed(b, 83, V, 43, 'w');
    constructionPalaceBed(b, 83, V, 44, 'w');
    for (const z of [42, 45]) piece(83, V, z, 'bedside_table', 'bedside_table', 'e');
    b.set(83, V + 1, 42, 'table_lamp');
    constructionPalaceNordicTop(b, 83, V + 1, 45, 'open_book', 'e');
    for (const z of [46, 47]) piece(88, V, z, 'blue_sofa', 'sofa', 'e');
    b.box(85, V, 43, 87, V, 47, 'blue_carpet');
    piece(86, V + 2, 48, 'painting_peaks', 'painting', 'n');
    constructionPalaceNordicChandelier(b, 86, L3, 45);
    lantern(89, L3 - 1, 43);
    // The closet: furs and coats.
    constructionPalaceNordicWardrobe(b, 83, V, 52, 'n', [['warm_coat', 3], ['fur', 4], ['blue_wool', 4]]);
    constructionPalaceNordicWardrobe(b, 85, V, 52, 'n', [['warm_coat', 2], ['fur', 2], ['leather', 2]]);
    constructionPalaceChest(b, 85, V, 50, 'w', [['white_wool', 8], ['red_wool', 4], ['mirror', 1]]);
    lantern(84, L3 - 1, 51);
    // The washroom.
    b.shaped(89, V, 52, 'bathtub', 'bathtub', { part: 'foot', facing: b.facing('e') });
    b.shaped(90, V, 52, 'bathtub', 'bathtub', { part: 'head', facing: b.facing('e') });
    piece(87, V, 52, 'toilet', 'toilet', 'n');
    piece(90, V, 50, 'sink', 'sink', 'w');
    piece(90, V + 1, 50, 'wall_mirror', 'wall_mirror', 'w');
    lantern(88, L3 - 1, 51);
}

// The carved porch at the front door and the balcony over it, under a little tented roof with a red dome.
function constructionPalaceNordicPorch(b) {
    const G = PALACE_NORDIC_GROUND;
    const F = G + 1;
    const L1 = G + 6;
    const U = L1 + 1;
    const { piece, lantern } = constructionFurnisher(b);
    b.box(59, G, 33, 71, G, 39, 'stone_bricks');
    b.box(63, G, 33, 67, G, 39, 'granite');
    for (const [x, z] of [[59, 33], [71, 33], [63, 33], [67, 33], [59, 39], [71, 39]]) b.box(x, F, z, x, L1 - 1, z, 'spruce_wood');
    b.sym(() => {
        for (let x = 60; x <= 62; x++) b.set(x, F, 33, 'spruce_fence');
        for (let z = 34; z <= 38; z++) b.set(59, F, z, 'spruce_fence');
        for (let z = 35; z <= 37; z++) piece(60, F, z, 'bench', 'bench', 'e');
        for (let x = 60; x <= 62; x++) b.stairs(x, L1 - 1, 33, 'spruce_stairs', 's', 'top');
        lantern(62, L1 - 1, 36);
    });
    // The balcony: a carved rail, posts, a beam and the tent roof.
    b.box(59, L1, 33, 71, L1, 39, 'spruce_planks');
    for (let x = 59; x <= 71; x++) b.set(x, U, 33, 'spruce_fence');
    for (let z = 34; z <= 39; z++) {
        b.set(59, U, z, 'spruce_fence');
        b.set(71, U, z, 'spruce_fence');
    }
    for (const [x, z] of [[59, 33], [71, 33], [59, 39], [71, 39]]) b.box(x, U, z, x, U + 3, z, 'spruce_wood');
    b.box(60, U + 3, 36, 70, U + 3, 36, 'spruce_planks');
    lantern(65, U + 2, 36);
    for (const x of [60, 70]) {
        lantern(x, U, 34, 'floor');
        lantern(x, U, 39, 'floor');
    }
    constructionPalaceNordicHipRoof(b, 58, 32, 72, 39, U + 4, 'dark_oak_stairs', 'dark_oak_planks');
    constructionPalaceNordicOnion(b, 65, 35, U + 8, 2, ['red', 'white']);
}

// ---------------------------------------------------------------------------------------
// The towers

// The bell tower in front of the west wing: the clock on four faces, the bells in an open belfry, a green
// onion dome.
function constructionPalaceNordicBellTower(b) {
    const G = PALACE_NORDIC_GROUND;
    const [cx, cz] = [30, 39];
    const floors = [G, G + 6, G + 12, G + 18, G + 24, G + 30];
    const belfry = G + 30;
    const { lantern } = constructionFurnisher(b);
    constructionPalaceNordicTower(b, cx, cz, { floors, top: belfry, palette: PALACE_NORDIC_RED, blind: ['s'], plainFloors: [G + 24] });
    constructionPalaceNordicDoorway(b, cx + 4, G + 1, cz + 5, 's', 4);
    constructionPalaceNordicDoorway(b, cx + 4, G + 7, cz + 5, 's', 4);
    // The clock faces: a white dial, gold in the middle, black hands at ten past twelve.
    for (const [dx, dz, ux, uz] of [[0, -6, -1, 0], [0, 6, 1, 0], [-6, 0, 0, 1], [6, 0, 0, -1]]) {
        for (let v = -2; v <= 2; v++) {
            for (let u = -2; u <= 2; u++) {
                if (u * u + v * v > 6) continue;
                b.set(cx + dx + ux * u, belfry - 3 + v, cz + dz + uz * u, 'white_glazed_tile');
            }
        }
        b.set(cx + dx, belfry - 3, cz + dz, 'gold_block');
        b.set(cx + dx, belfry - 2, cz + dz, 'black_wool');
        b.set(cx + dx, belfry - 1, cz + dz, 'black_wool');
        b.set(cx + dx + ux, belfry - 3, cz + dz + uz, 'black_wool');
    }
    // The belfry: piers at the corners, arches open between them, beams with the bells.
    for (let y = belfry + 1; y <= belfry + 5; y++) {
        for (let dz = -6; dz <= 6; dz++) {
            for (let dx = -6; dx <= 6; dx++) {
                const m = Math.max(Math.abs(dx), Math.abs(dz));
                if (m < 5) continue;
                const pier = Math.abs(dx) >= 4 && Math.abs(dz) >= 4;
                if (pier || y === belfry + 5) b.set(cx + dx, y, cz + dz, pier && (y - G) % 2 ? 'white_stucco' : y === belfry + 5 ? 'white_stucco' : 'red_brick');
                else if (y === belfry + 4) b.set(cx + dx, y, cz + dz, m === 6 ? 'white_glazed_tile_slab' : null);
                else if (y === belfry + 1 && m === 5) b.set(cx + dx, y, cz + dz, 'dark_oak_fence');
            }
        }
    }
    for (let k = -4; k <= 4; k++) {
        b.set(cx + k, belfry + 4, cz, 'dark_oak_planks');
        b.set(cx, belfry + 4, cz + k, 'dark_oak_planks');
    }
    for (const [dx, dz] of [[-3, 0], [3, 0], [0, 3], [0, -3]]) {
        b.set(cx + dx, belfry + 3, cz + dz, 'dark_oak_fence');
        b.set(cx + dx, belfry + 2, cz + dz, dx === 0 && dz === 3 ? 'gold_block' : 'copper_block');
    }
    for (const [dx, dz] of [[-4, -4], [4, 4], [-4, 4], [4, -4]]) lantern(cx + dx, belfry + 1, cz + dz, 'floor');
    lantern(cx + 2, belfry + 1, cz - 4, 'floor');
    b.box(cx - 6, belfry + 6, cz - 6, cx + 6, belfry + 6, cz + 6, 'white_stucco');
    constructionPalaceNordicCornice(b, cx - 6, cz - 6, cx + 6, cz + 6, belfry + 6);
    for (const [dx, dz] of [[-5, -5], [5, 5], [-5, 5], [5, -5]]) {
        b.set(cx + dx, belfry + 7, cz + dz, 'green_glazed_tile');
        b.set(cx + dx, belfry + 8, cz + dz, 'gold_block');
    }
    constructionPalaceNordicDrum(b, cx, cz, belfry + 7, belfry + 11, 4);
    constructionPalaceNordicOnion(b, cx, cz, belfry + 12, 4, ['green', 'yellow']);
    // The clock room under the belfry, its works on the walls.
    b.shaped(cx, G + 26, cz - 4, 'wall_clock', 'wall_clock', { facing: b.facing('s') });
    b.shaped(cx - 4, G + 26, cz, 'wall_clock', 'wall_clock', { facing: b.facing('e') });
}

// The observatory tower behind the east wing, the tallest: eight floors of stair, then the round room of
// glass at the top with the telescope and the star charts, and a blue dome with gold stripes.
function constructionPalaceNordicObservatory(b) {
    const G = PALACE_NORDIC_GROUND;
    const [cx, cz] = [101, 97];
    const floors = [G, G + 6, G + 12, G + 18, G + 24, G + 30, G + 36, G + 42, G + 48];
    const top = G + 48;
    const O = top + 1;
    const { piece, lantern } = constructionFurnisher(b);
    constructionPalaceNordicTower(b, cx, cz, { floors, top: top + 5, palette: [['stone_bricks', 60], ['blue_brick', 40]], blind: ['n'] });
    // The way in from the east wing's corridor, on both its floors.
    constructionPalaceNordicDoorway(b, cx - 4, G + 1, cz - 8, 's', 4);
    constructionPalaceNordicDoorway(b, cx - 4, G + 7, cz - 8, 's', 4);
    // Wide windows all round the top room: the sky on every side.
    for (let y = O + 1; y <= O + 3; y++) {
        for (let dz = -6; dz <= 6; dz++) {
            for (let dx = -6; dx <= 6; dx++) {
                const m = Math.max(Math.abs(dx), Math.abs(dz));
                if (m < 5 || (Math.abs(dx) > 3 && Math.abs(dz) > 3)) continue;
                b.set(cx + dx, y, cz + dz, m === 6 ? 'glass_pane' : null);
            }
        }
    }
    b.box(cx - 6, top + 6, cz - 6, cx + 6, top + 6, cz + 6, 'stone_bricks');
    constructionPalaceNordicCornice(b, cx - 6, cz - 6, cx + 6, cz + 6, top + 6);
    for (const [dx, dz] of [[-5, -5], [5, 5], [-5, 5], [5, -5]]) {
        b.set(cx + dx, top + 7, cz + dz, 'blue_glazed_tile');
        b.box(cx + dx, top + 8, cz + dz, cx + dx, top + 9, cz + dz, 'gold_block');
    }
    constructionPalaceNordicOnion(b, cx, cz, top + 7, 5, ['blue', 'yellow']);
    // The observatory: the telescope in its chest and one on its tripod at the north window, the star charts,
    // the astrolabe and the globe, a desk; the aurora and the telescope explained.
    constructionPalaceChest(b, cx + 4, O, cz - 4, 'w', [['telescope', 2], ['star_chart', 6], ['candle', 12], ['lantern', 2]]);
    constructionPalaceChest(b, cx - 4, O, cz + 4, 'e', [['star_chart', 4], ['astrolabe', 1], ['meteoric_iron', 2], ['warm_coat', 4]]);
    b.set(cx, O, cz + 4, 'dark_oak_fence');
    b.set(cx, O + 1, cz + 4, 'copper_block');
    b.set(cx, O + 2, cz + 5, 'copper_block');
    piece(cx - 4, O, cz - 1, 'desk', 'desk', 'e');
    constructionPalaceNordicTop(b, cx - 4, O + 1, cz - 1, 'scroll', 'e');
    piece(cx - 3, O, cz - 1, 'oak_chair', 'chair', 'w');
    piece(cx - 4, O, cz + 1, 'astrolabe', 'astrolabe', 'e');
    b.set(cx + 4, O, cz + 4, 'globe');
    constructionPalaceSign(b, cx + 4, O, cz + 1, 'w', ...PALACE_NORDIC_SIGNS.aurora);
    constructionPalaceSign(b, cx - 2, O, cz + 4, 'n', ...PALACE_NORDIC_SIGNS.telescope);
    for (const [dx, dz] of [[-4, -4], [4, 4], [-4, 4], [4, -4]]) lantern(cx + dx, top + 5, cz + dz);
    for (const [dx, dz] of [[0, -4], [-4, 0], [4, -2]]) lantern(cx + dx, O, cz + dz, 'floor');
}

// ---------------------------------------------------------------------------------------
// The courtyard: the gallery, the orangery, the banya, the stables, a sundial

function constructionPalaceNordicCourtyard(b) {
    const G = PALACE_NORDIC_GROUND;
    const F = G + 1;
    const { lantern, lanternPost } = constructionFurnisher(b);
    const put = constructionPalacePut(b);
    // Paths: from the great hall to the orangery and on to the stables, across the courtyard, to the banya.
    b.box(64, G, 69, 66, G, 75, 'cobblestone');
    b.box(64, G, 97, 66, G, 105, 'cobblestone');
    b.box(38, G, 72, 92, G, 73, 'cobblestone');
    b.box(38, G, 74, 39, G, 103, 'cobblestone');
    b.box(44, G, 74, 46, G, 83, 'cobblestone');
    b.box(90, G, 74, 92, G, 80, 'cobblestone');
    b.box(82, G, 84, 88, G, 90, 'cobblestone');
    b.box(84, G, 74, 86, G, 83, 'cobblestone');
    b.set(85, F, 87, 'sundial');
    for (const [x, z] of [[83, 85], [87, 89], [63, 74], [67, 74], [40, 80], [91, 76]]) lanternPost(x, F, z, 'spruce_fence', 2);
    for (const [x, z] of [[42, 78], [86, 96], [81, 77]]) constructionPalaceTree(put, 'spruce', x, F, z, x + z);

    // The gallery along the courtyard side of the main block: carved posts, a rail, a lean-to roof.
    b.box(38, G, 69, 92, G, 71, 'spruce_planks');
    for (let x = 40; x <= 90; x += 5) {
        if (x !== 65) b.box(x, F, 71, x, F + 3, 71, 'spruce_wood');
    }
    for (let x = 38; x <= 92; x++) {
        if ((x - 40) % 5 !== 0 && (x < 63 || x > 67) && x > 38 && x < 92) b.set(x, F, 71, 'spruce_fence');
        b.stairs(x, F + 4, 71, 'spruce_stairs', 'n');
        b.stairs(x, F + 5, 70, 'spruce_stairs', 'n');
        b.stairs(x, F + 6, 69, 'spruce_stairs', 'n');
    }
    for (let x = 42; x <= 90; x += 8) lantern(x, F + 4, 70);

    constructionPalaceNordicOrangery(b);
    constructionPalaceNordicBanya(b);
    constructionPalaceNordicStables(b);
}

// The orangery: glass on a stone plinth under a glass roof on spruce ribs, beds of flowers, small trees and
// cacti, a fountain, heaters of magma rock behind bars: a summer in the snow.
function constructionPalaceNordicOrangery(b) {
    const G = PALACE_NORDIC_GROUND;
    const F = G + 1;
    const { lantern } = constructionFurnisher(b);
    const [x0, x1, z0, z1] = [52, 78, 76, 96];
    b.box(x0 + 1, G, z0 + 1, x1 - 1, G, z1 - 1, 'grass');
    b.box(x0 + 1, G, 85, x1 - 1, G, 87, 'stone_bricks');
    b.box(64, G, z0 + 1, 66, G, z1 - 1, 'stone_bricks');
    for (let y = G; y <= G + 6; y++) {
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
                const post = (z === z0 || z === z1 ? (x - x0) % 4 === 0 : (z - z0) % 4 === 0) || ((x === x0 || x === x1) && (z === z0 || z === z1));
                b.set(x, y, z, y <= F ? 'stone_bricks' : post || y === G + 6 ? 'spruce_wood' : 'glass');
            }
        }
    }
    for (let k = 0; z0 + k <= z1 - k; k++) {
        const y = G + 7 + k;
        for (let x = x0; x <= x1; x++) {
            const type = (x - x0) % 5 === 0 ? 'spruce_planks' : 'glass';
            b.set(x, y, z0 + k, type);
            b.set(x, y, z1 - k, type);
        }
        for (let z = z0 + k + 1; z < z1 - k; z++) {
            b.set(x0, y, z, 'glass');
            b.set(x1, y, z, 'glass');
        }
    }
    b.box(x0 + 1, G + 7, 86, x1 - 1, G + 7, 86, 'spruce_planks');
    for (const x of [55, 60, 70, 75]) lantern(x, G + 6, 86);
    b.door(65, F, z0, 'spruce_door', 's');
    b.door(65, F, z1, 'spruce_door', 'n');
    b.set(65, F, 86, 'fountain');
    for (const [x, z, f] of [[62, 86, 'e'], [68, 86, 'w']]) b.shaped(x, F, z, 'bench', 'bench', { facing: b.facing(f) });
    // The beds: flowers and grass, a little tree in each, cacti in a corner, pots along the south wall.
    for (let z = z0 + 1; z <= z1 - 1; z++) {
        for (let x = x0 + 1; x <= x1 - 1; x++) {
            if ((z >= 85 && z <= 87) || (x >= 64 && x <= 66)) continue;
            const h = constructionPalaceHash(x, F, z, 61);
            if (h < 0.22) b.set(x, F, z, 'flower_red');
            else if (h < 0.44) b.set(x, F, z, 'flower_yellow');
            else if (h < 0.6) b.set(x, F, z, 'tall_grass');
        }
    }
    for (const [x, z] of [[58, 81], [72, 81], [58, 91], [72, 91]]) {
        b.box(x, F, z, x, F + 1, z, 'cherry_wood');
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) b.box(x + dx, F + 2, z + dz, x + dx, F + 3, z + dz, 'cherry_leaves');
        }
        b.set(x, F + 4, z, 'cherry_leaves');
    }
    for (const [x, z, h] of [[54, 94, 2], [55, 93, 1], [53, 92, 3]]) b.box(x, F, z, x, F + h - 1, z, 'cactus');
    for (let x = 54; x <= 62; x += 2) b.set(x, F, z0 + 1, 'flower_pot');
    for (const [x, z] of [[53, 78], [77, 78], [77, 94]]) {
        b.set(x, F, z, 'magma_rock');
        b.set(x + (x === x0 + 1 ? 1 : -1), F, z, 'iron_bars');
        b.set(x, F, z + (z === z0 + 2 ? 1 : -1), 'iron_bars');
        b.set(x, F + 1, z, 'stone_bricks_slab');
    }
    constructionPalaceSign(b, 63, F, 78, 's', ...PALACE_NORDIC_SIGNS.greenhouse);
    constructionPalaceChest(b, 53, F, 86, 'e', [['spruce_sapling', 8], ['cherry_sapling', 4], ['fertilizer', 16], ['wheat_seeds', 16], ['water_bucket', 2], ['iron_hoe', 1]]);
}

// The banya: a log house with a changing room, a cold plunge pool and a steam room with a stove of hot stones.
function constructionPalaceNordicBanya(b) {
    const G = PALACE_NORDIC_GROUND;
    const F = G + 1;
    const { piece, lantern } = constructionFurnisher(b);
    const [x0, x1, z0, z1] = [40, 50, 84, 102];
    b.box(x0, G, z0, x1, G, z1, 'spruce_planks');
    for (let y = F; y <= G + 6; y++) {
        b.walls(x0, y, z0, x1, y, z1, 'spruce_wood');
        // The log ends stick out at the corners, every other course.
        if (y % 2) {
            for (const [x, z] of [[x0 - 1, z0], [x1 + 1, z0], [x0 - 1, z1], [x1 + 1, z1], [x0, z0 - 1], [x1, z0 - 1], [x0, z1 + 1], [x1, z1 + 1]]) b.set(x, y, z, 'spruce_wood');
        }
    }
    b.box(x0 + 1, G + 6, z0 + 1, x1 - 1, G + 6, z1 - 1, 'spruce_planks');
    constructionPalaceNordicGable(b, { u0: x0 - 1, u1: x1 + 1, v0: z0 - 1, v1: z1 + 1, y: G + 7, stair: 'dark_oak_stairs', plank: 'dark_oak_planks', gable: 'spruce_planks' });
    for (const z of [90, 95]) {
        b.box(x0 + 1, F, z, x1 - 1, G + 5, z, 'spruce_planks');
        b.door(45, F, z, 'spruce_door', 's');
    }
    b.door(45, F, z0, 'spruce_door', 's');
    for (const z of [87, 92, 98]) {
        b.set(x0, F + 2, z, 'glass_pane');
        b.set(x1, F + 2, z, 'glass_pane');
    }
    // The changing room.
    for (let z = 86; z <= 88; z++) piece(41, F, z, 'bench', 'bench', 'e');
    constructionPalaceChest(b, 49, F, 85, 'w', [['white_wool', 24], ['warm_coat', 2], ['fur', 2]]);
    constructionPalaceChest(b, 49, F, 89, 'w', [['cold_water', 12], ['honey_bottle', 6], ['soda_water', 6]], 'barrel');
    constructionPalaceNordicTop(b, 49, F + 1, 89, 'jug');
    lantern(45, G + 5, 87);
    // The plunge pool, two deep, cold as the snow outside: blocks of ice in the corners.
    for (let x = 42; x <= 48; x++) {
        for (const z of [92, 93]) {
            b.set(x, G, z, 'water');
            b.set(x, G - 1, z, 'water');
            b.set(x, G - 2, z, 'stone_bricks');
        }
    }
    for (let x = 41; x <= 49; x++) {
        b.set(x, G - 1, 91, 'stone_bricks');
        b.set(x, G - 1, 94, 'stone_bricks');
    }
    for (const z of [92, 93]) {
        b.set(41, G - 1, z, 'stone_bricks');
        b.set(49, G - 1, z, 'stone_bricks');
    }
    b.set(41, F, 91, 'packed_ice');
    b.set(41, F, 94, 'packed_ice');
    lantern(45, G + 5, 91);
    lantern(45, G + 5, 94);
    lantern(49, G + 5, 93);
    // The steam room: a stove of hot stones behind bars, two tiers of benches.
    b.box(41, F, 96, 42, F, 97, 'magma_rock');
    b.box(43, F, 96, 43, F, 97, 'iron_bars');
    b.box(41, F, 98, 42, F, 98, 'iron_bars');
    b.box(41, F + 1, 96, 42, F + 1, 97, 'cobblestone');
    b.box(41, F + 2, 96, 41, G + 13, 96, 'cobblestone');
    for (let x = 43; x <= 48; x++) piece(x, F, 99, 'bench', 'bench', 'n');
    b.set(49, F, 99, 'spruce_planks_slab');
    b.box(41, F, 100, 49, F, 101, 'spruce_planks');
    for (let x = 41; x <= 49; x++) piece(x, F + 1, 101, 'bench', 'bench', 'n');
    lantern(46, G + 5, 98);
    constructionPalaceNordicLight(b, 41, 85, 49, 89, F, 4);
    constructionPalaceNordicLight(b, 41, 96, 49, 98, F, 4);
}

// The stables behind the courtyard: a long timber barn, stalls with straw and water along the north wall, the
// aisle, a tack room at the west end.
function constructionPalaceNordicStables(b) {
    const G = PALACE_NORDIC_GROUND;
    const F = G + 1;
    const { lantern } = constructionFurnisher(b);
    const [x0, x1, z0, z1] = [40, 90, 106, 116];
    b.box(x0, G, z0, x1, G, z1, 'cobblestone');
    for (let y = F; y <= G + 6; y++) {
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
                const post = (z === z0 || z === z1) ? (x - x0) % 5 === 0 : true;
                b.set(x, y, z, y === F ? 'cobblestone' : post || y === G + 6 ? 'spruce_wood' : 'spruce_planks');
            }
        }
    }
    b.box(x0 + 1, G + 6, z0 + 1, x1 - 1, G + 6, z1 - 1, 'spruce_planks');
    constructionPalaceNordicGable(b, { u0: z0 - 1, u1: z1 + 1, v0: x0 - 1, v1: x1 + 1, y: G + 7, stair: 'spruce_stairs', plank: 'spruce_planks', gable: 'spruce_planks', alongX: true });
    b.doubleDoor(64, F, z0, 65, z0, 'spruce_door', 's');
    // The stalls: fences between, a gate each, straw and a trough of water.
    for (let x = 48; x <= 88; x += 4) {
        for (let z = 112; z <= 115; z++) b.set(x, F, z, 'spruce_fence');
        b.set(x, F, 111, 'spruce_fence');
        if (x < 88) {
            for (let k = 1; k <= 3; k++) {
                b.set(x + k, F, 111, k === 2 ? null : 'spruce_fence');
                if (k === 2) b.gate(x + k, F, 111, 'spruce_fence_gate', 's');
                b.box(x + k, G, 112, x + k, G, 115, 'cobblestone');
                b.box(x + k, F, 112, x + k, F, 114, 'yellow_carpet');
            }
            b.set(x + 2, F, 115, 'water');
            b.set(x + 1, F + 2, z1, 'glass_pane');
        }
    }
    for (let x = 52; x <= 88; x += 6) lantern(x, G + 5, 108);
    for (let x = 50; x <= 86; x += 4) lantern(x, G + 5, 114);
    // The tack room.
    b.box(47, F, 107, 47, G + 5, 110, 'spruce_planks');
    b.door(47, F, 109, 'spruce_door', 'w');
    constructionPalaceChest(b, 41, F, 107, 'e', [['leather', 12], ['red_wool', 8], ['blue_wool', 8]]);
    constructionPalaceChest(b, 41, F, 109, 'e', [['wheat', 64], ['wheat_seeds', 16]], 'barrel');
    constructionPalaceChest(b, 41, F, 111, 'e', [['wheat', 64], ['water_bucket', 2]], 'barrel');
    constructionPalaceChest(b, 41, F, 113, 'e', [['bucket', 3], ['feather', 8], ['candle', 8]]);
    lantern(44, G + 5, 110);
    lantern(44, G + 5, 114);
    constructionPalaceNordicLight(b, 41, 107, 46, 115, F, 4);
    constructionPalaceNordicLight(b, 48, 107, 89, 110, F, 6);
}

// ---------------------------------------------------------------------------------------

function constructionPalaceNordic(b) {
    constructionPalaceNordicGrounds(b);
    constructionPalaceNordicAvenue(b);
    constructionPalaceNordicPond(b);
    constructionPalaceNordicIceGarden(b);
    constructionPalaceNordicWings(b);
    constructionPalaceNordicMain(b);
    constructionPalaceNordicBellTower(b);
    constructionPalaceNordicObservatory(b);
    constructionPalaceNordicCourtyard(b);
}

CONSTRUCTION_DESIGNS.palace_nordic = {
    label: 'Winter palace',
    size: PALACE_NORDIC_SIZE,
    foundation: 'dirt',
    anchorX: PALACE_NORDIC_MID,
    groundY: PALACE_NORDIC_GROUND,
    rate: 480,
    start: [PALACE_NORDIC_MID, PALACE_NORDIC_GROUND + 1, 1],
    levels: [],
    site: constructionPalaceSite({ label: 'Winter palace', theme: 'snow', groundY: PALACE_NORDIC_GROUND, rim: PALACE_NORDIC_RIM, maxEarth: PALACE_NORDIC_EARTH }),
    generate: constructionPalaceNordic
};
