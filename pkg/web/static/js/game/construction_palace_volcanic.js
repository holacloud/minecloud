// /build palace_volcanic: the Palace of the Volcano, a citadel of basalt, obsidian and glowing magma rock that
// climbs a cone of rock, with a hall of minerals for geology. Loaded after construction_palace_common.js; it
// only adds an entry to CONSTRUCTION_DESIGNS. Everything of this palace lives in this file (and its test,
// test/js/construction_palace_volcanic.test.js).
//
// The plan, in the local box (x across, z away from the player, the gate facing them):
// - A chasm with magma at its bottom runs across the front; a bridge crosses it to the gatehouse, which has a
//   guard room on each side of the passage and a gate chamber over it (the stair is in the west guard room).
// - The curtain wall is a hexagon round the middle of the box (PALACE_VOLCANIC_CZ), flat towards the front,
//   with bundles of basalt columns of different heights as buttresses and as bastions at its six corners,
//   the way basalt cracks into columns as it cools (the Giant's Causeway).
// - Inside the wall: the ward, paved in front and planted behind with what grows on ash (moss, shrubs,
//   charred trunks), a hot spring, and crags of rough rock round the podium, the rock the palace stands on.
// - The palace is a block on a podium 4 high: up the main stairs, a portico of columns, the great hall. Its
//   four wings close round a hexagonal crater courtyard with a sunken pool of magma behind iron bars and two
//   hot springs, ringed by a colonnade whose roof is a terrace of the first floor.
//   Ground floor (feet 13): kitchen, great hall, dining room (front); bath of hot springs, stair hall,
//   hall of minerals (west); treasury with its vault, stair hall, forge and foundry (east); the throne
//   room, two floors high, at the back, on the axis.
//   First floor (feet 20): servants and their washroom, library, guest suite (front); a corridor and four
//   rooms in each wing, the two big ones of each with a washroom and a closet behind.
//   Roof (feet 27): terraces with gardens all round, reached by the stair halls.
// - The keep, a hexagon with its points front and back, stands on the roof of the throne room: a stair
//   winds round a pier inside it (constructionCastleSpiral) past four rooms to a crown of pinnacles.
// - Floors: ward 8 (feet 9), podium 12, first floor 19, roof 26, keep floors every 6 from the roof.
//   Stairs are the only way up, never ladders; each flight ends level with the floor it reaches.

const PALACE_VOLCANIC_SIZE = [141, 72, 141];
const PALACE_VOLCANIC_GROUND = 8;
const PALACE_VOLCANIC_RIM = 12;
const PALACE_VOLCANIC_MID = 70;
// The middle of the hexagons: the curtain wall (radius PALACE_VOLCANIC_WALL_R) and the crater courtyard.
const PALACE_VOLCANIC_CZ = 74;
const PALACE_VOLCANIC_WALL_R = 54;
// Layers of the floors of the palace: the podium (ground floor), the first floor and the roof.
const PALACE_VOLCANIC_GF = 12;
const PALACE_VOLCANIC_1F = 19;
const PALACE_VOLCANIC_ROOF = 26;
// The keep: its middle, and the layers of its floors (the first is the roof of the throne room).
const PALACE_VOLCANIC_KEEP = [70, 95];
const PALACE_VOLCANIC_KEEP_FLOORS = [26, 32, 38, 44, 50];
// Dressed basalt masonry, a little weathered, and the rough rock of the crags and the chasm.
const PALACE_VOLCANIC_MASONRY = [['black_brick', 48], ['basalt', 28], ['gray_brick', 14], ['slate', 10]];
const PALACE_VOLCANIC_ROCK = [['basalt', 62], ['stone', 12], ['cobblestone', 12], ['obsidian', 8], ['granite', 6]];
// Ash soil of the gardens.
const PALACE_VOLCANIC_ASH = [['dirt', 44], ['moss', 26], ['basalt', 18], ['cobblestone', 12]];
const PALACE_VOLCANIC_STAIR = 'stone_brick_stairs';
// The tabletop objects (js/game/tabletop.js) that have no facing; the others are placed turned.
const PALACE_VOLCANIC_UNTURNED = ['meal_plate', 'fruit_bowl', 'jug'];

// How far (x, z) is from the middle of a hexagon of radius 1 with flat sides front and back (points east
// and west): under r means inside the hexagon of radius r.
function constructionPalaceVolcanicHex(dx, dz) {
    const ax = Math.abs(dx);
    const az = Math.abs(dz);
    return Math.max(az * 1.1547, ax + az * 0.57735);
}

// The same with its points front and back: the keep.
function constructionPalaceVolcanicHexPointed(dx, dz) {
    return constructionPalaceVolcanicHex(dz, dx);
}

// A pavement of hexagons of radius a, like the tops of basalt columns: how far a cell is from the middle of
// its own tile, as constructionPalaceVolcanicHex. Over a - 0.8 it is on a joint.
function constructionPalaceVolcanicCauseway(x, z, a) {
    const w = 1.5 * a;
    const h = Math.sqrt(3) * a;
    const c0 = Math.round(x / w);
    let best = Infinity;
    for (let c = c0 - 1; c <= c0 + 1; c++) {
        const off = Math.abs(c) % 2 ? h / 2 : 0;
        const r0 = Math.round((z - off) / h);
        for (let r = r0 - 1; r <= r0 + 1; r++) best = Math.min(best, constructionPalaceVolcanicHex(x - c * w, z - (r * h + off)));
    }
    return best;
}

// The tools every part of the palace draws with.
function constructionPalaceVolcanicKit(b) {
    const furn = constructionFurnisher(b);
    const kit = {
        furn,
        // Every cell of the box from (x0, y0, z0) to (x1, y1, z1): `type` is a name, null, or a function of the cell.
        fill(x0, y0, z0, x1, y1, z1, type) {
            for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
                for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
                    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) b.set(x, y, z, typeof type === 'function' ? type(x, y, z) : type);
                }
            }
        },
        masonry: (x, y, z) => constructionPalacePick(PALACE_VOLCANIC_MASONRY, x, y, z, 3),
        rock: (x, y, z) => constructionPalacePick(PALACE_VOLCANIC_ROCK, x, y, z, 5),
        wall(x0, y0, z0, x1, y1, z1) {
            kit.fill(x0, y0, z0, x1, y1, z1, kit.masonry);
        },
        // A pavement of hexagonal tiles: `tile` with joints of `joint`.
        causeway(x0, z0, x1, z1, y, tile, joint, a = 2.6) {
            kit.fill(x0, y, z0, x1, y, z1, (x, yy, z) => (constructionPalaceVolcanicCauseway(x, z, a) > a - 0.8 ? joint : tile));
        },
        stand: (x, y, z) => furn.lantern(x, y, z, 'floor'),
        hang: (x, y, z) => furn.lantern(x, y, z, 'hanging'),
        // A straight flight: `steps` stairs going up towards `facing`, the first at (x, y, z), `width` wide
        // towards side [sx, sz]. Under each stair it is filled from `base`; above it, three cells are cleared
        // for the head (which cuts the floor it climbs through). The last stair is level with the floor it
        // reaches.
        flight(x, y, z, facing, steps, width, [sx, sz], base, stair = PALACE_VOLCANIC_STAIR, under = 'black_brick') {
            const [dx, dz] = SHAPE_DIRECTIONS[facing];
            for (let i = 0; i < steps; i++) {
                for (let j = 0; j < width; j++) {
                    const [cx, cy, cz] = [x + dx * i + sx * j, y + i, z + dz * i + sz * j];
                    b.stairs(cx, cy, cz, stair, facing);
                    for (let yy = base; yy < cy; yy++) b.set(cx, yy, cz, under);
                    for (let yy = cy + 1; yy <= cy + 3; yy++) b.set(cx, yy, cz, null);
                }
            }
        },
        banner: (x, y, z, color, facing) => b.shaped(x, y, z, `${color}_banner`, 'banner', { facing: b.facing(facing) }),
        throne(x, y, z, facing) {
            b.shaped(x, y, z, 'obsidian_throne', 'throne', { half: 'lower', facing: b.facing(facing) });
            b.shaped(x, y + 1, z, 'obsidian_throne', 'throne', { half: 'upper', facing: b.facing(facing) });
        },
        wardrobe: (x, y, z, facing) => furn.tall(x, y, z, 'wardrobe', facing),
        piece: furn.piece,
        bed: (x, y, z, facing) => constructionPalaceBed(b, x, y, z, facing),
        chest: (x, y, z, facing, items) => constructionPalaceChest(b, x, y, z, facing, items),
        barrel: (x, y, z, items) => constructionPalaceChest(b, x, y, z, 'n', items, 'barrel'),
        sign: (x, y, z, facing, es, en, mount = 'post') => constructionPalaceSign(b, x, y, z, facing, es, en, mount),
        // A bathtub: its foot here, its head one cell towards `facing`.
        bathtub(x, y, z, facing) {
            const [dx, dz] = SHAPE_DIRECTIONS[facing];
            b.shaped(x, y, z, 'bathtub', 'bathtub', { part: 'foot', facing: b.facing(facing) });
            b.shaped(x + dx, y, z + dz, 'bathtub', 'bathtub', { part: 'head', facing: b.facing(facing) });
        },
        microscope: (x, y, z, facing) => b.shaped(x, y, z, 'microscope', 'microscope', { facing: b.facing(facing), stage: 'empty' }),
        // A tabletop object in the cell above a table, desk or bedside table: what someone left there.
        tabletop(x, y, z, id, facing = 's') {
            if (PALACE_VOLCANIC_UNTURNED.includes(id)) b.set(x, y, z, id);
            else b.shaped(x, y, z, id, id, { facing: b.facing(facing) });
        },
        // Nothing drawn in this cell yet (only outside b.sym).
        empty: (x, y, z) => !b.cells.has((y * b.size[2] + z) * b.size[0] + x),
        // Curtains over a window of the rooms upstairs, `facing` into the room, every cell of its rows `y0`
        // to `y1`; about a third of the windows have them drawn, fixed per window, and where something
        // stands in front of the glass they are open, gathered at the sides.
        drape(cells, y0, y1, color, facing, salt) {
            const clear = cells.every(([x, z]) => {
                for (let y = y0; y <= y1; y++) if (!kit.empty(x, y, z)) return false;
                return true;
            });
            const [x0, z0] = cells[0];
            const drawn = clear && constructionPalaceHash(x0, y0, z0, salt) < 0.4 ? 'closed' : 'open';
            for (const [x, z] of cells) {
                for (let y = y0; y <= y1; y++) if (kit.empty(x, y, z)) kit.furn.curtain(x, y, z, color, facing, drawn);
            }
        },
        // A column of basalt from y0 to y1, with a base of obsidian and a capital of copper.
        column(x, z, y0, y1) {
            b.set(x, y0, z, 'obsidian');
            kit.fill(x, y0 + 1, z, x, y1 - 1, z, 'basalt');
            b.set(x, y1, z, 'copper_block');
        },
        // A bundle of basalt columns standing on layer y0 round (cx, cz): each cell of `cells` ([dx, dz]) a
        // column whose height is `low` to `high`, fixed per cell.
        bundle(cx, cz, y0, cells, low, high, salt = 0) {
            for (const [dx, dz] of cells) {
                const top = y0 + low + Math.floor(constructionPalaceHash(cx + dx, 0, cz + dz, salt + 61) * (high - low + 1));
                kit.fill(cx + dx, y0, cz + dz, cx + dx, top, cz + dz, 'basalt');
            }
        },
        // A window in a wall along x (alongX) or along z: from u0 to u1, y0 to y1, glass with a coloured top.
        window(alongX, at, u0, u1, y0, y1, top = 'orange_stained_glass_pane') {
            for (let u = u0; u <= u1; u++) {
                for (let y = y0; y <= y1; y++) {
                    const type = y === y1 ? top : 'glass_pane';
                    if (alongX) b.set(u, y, at, type);
                    else b.set(at, y, u, type);
                }
            }
        }
    };
    return kit;
}

// ---------------------------------------------------------------------------------------
// Outside the wall: the land, the chasm and its bridge.

function constructionPalaceVolcanicApproach(b, kit) {
    const G = PALACE_VOLCANIC_GROUND;
    const mid = PALACE_VOLCANIC_MID;
    const [w, , d] = PALACE_VOLCANIC_SIZE;
    const R = PALACE_VOLCANIC_RIM;
    const hexOf = (x, z) => constructionPalaceVolcanicHex(x - mid, z - PALACE_VOLCANIC_CZ);
    constructionPalaceGrounds(b, 'volcanic', {
        x0: R, z0: R, x1: w - 1 - R, z1: d - 1 - R, y: G,
        free: (x, z) => hexOf(x, z) > 60 && !(z <= 26 && Math.abs(x - mid) < 9) && !(z >= 12 && z <= 25)
    });

    // The chasm: across the front, narrowing at both ends, 6 deep, magma along its bottom.
    const inChasm = (x, z) => {
        const half = 3.6 - Math.max(0, Math.abs(x - mid) - 40) * 0.35 + constructionPalaceHash(x, 0, z < 18 ? 1 : 2, 71) * 1.1 - 0.55;
        return x >= 18 && x <= w - 19 && half > 0.4 && Math.abs(z - 18) <= half;
    };
    for (let z = 13; z <= 23; z++) {
        for (let x = 18; x <= w - 19; x++) {
            if (!inChasm(x, z)) continue;
            kit.fill(x, 3, z, x, G, z, 'air');
            const glow = Math.abs(z - 18) <= 1 && constructionPalaceHash(x, 2, z, 73) > 0.2;
            b.set(x, 2, z, glow ? 'magma_rock' : constructionPalaceHash(x, 2, z, 74) < 0.5 ? 'obsidian' : 'basalt');
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                if (!inChasm(x + dx, z + dz)) kit.fill(x + dx, 2, z + dz, x + dx, G - 1, z + dz, kit.rock);
            }
        }
    }

    // The bridge: a deck of basalt with a path of granite, low parapets of obsidian, a pier in the middle.
    for (let z = 12; z <= 23; z++) {
        for (let x = mid - 3; x <= mid + 3; x++) {
            const edge = Math.abs(x - mid) === 3;
            b.set(x, G, z, edge ? 'obsidian' : Math.abs(x - mid) <= 1 ? 'granite' : 'basalt');
            b.set(x, G - 1, z, 'black_brick');
            if (edge && z >= 14 && z <= 22) b.set(x, G + 1, z, 'obsidian');
        }
    }
    kit.fill(mid - 2, 2, 17, mid + 2, G - 2, 19, kit.rock);
    b.sym(() => {
        for (const z of [14, 18, 22]) {
            b.set(mid - 3, G + 2, z, 'dark_oak_fence');
            kit.stand(mid - 3, G + 3, z);
        }
        for (let z = 14; z <= 22; z++) b.stairs(mid - 4, G - 1, z, PALACE_VOLCANIC_STAIR, 'e', 'top');
    });
    kit.sign(mid - 5, G + 1, 12, 'n', 'Palacio del Volcán // Basalto, obsidiana y roca de magma. Dentro, la sala de los minerales.', 'Palace of the Volcano: basalt, obsidian and magma rock. Inside, the hall of minerals.');
}

// ---------------------------------------------------------------------------------------
// The curtain wall, its buttresses of columns and its six bastions.

function constructionPalaceVolcanicWall(b, kit) {
    const G = PALACE_VOLCANIC_GROUND;
    const mid = PALACE_VOLCANIC_MID;
    const cz = PALACE_VOLCANIC_CZ;
    const r = PALACE_VOLCANIC_WALL_R;
    const [w, , d] = PALACE_VOLCANIC_SIZE;
    const R = PALACE_VOLCANIC_RIM;
    const inside = (x, z) => x >= R && x <= w - 1 - R && z >= R && z <= d - 1 - R;
    for (let z = R; z <= d - 1 - R; z++) {
        for (let x = R; x <= w - 1 - R; x++) {
            const h = constructionPalaceVolcanicHex(x - mid, z - cz);
            if (h <= r - 3.5 || h > r) continue;
            b.set(x, G, z, 'basalt');
            for (let y = G + 1; y <= G + 9; y++) b.set(x, y, z, y <= G + 2 ? kit.rock(x, y, z) : y === G + 7 ? 'obsidian' : kit.masonry(x, y, z));
            if (h > r - 1.6 && (Math.floor(x / 2) + Math.floor(z / 2)) % 2 === 0) b.set(x, G + 10, z, kit.masonry(x, G + 10, z));
        }
    }
    // The six corners, each a bastion of columns higher in the middle, a glowing cap on the highest.
    const corners = [[mid - r, cz], [mid + r, cz], [mid - r / 2, cz - r * 0.866], [mid + r / 2, cz - r * 0.866], [mid - r / 2, cz + r * 0.866], [mid + r / 2, cz + r * 0.866]];
    for (const [vx, vz] of corners) {
        for (let z = Math.floor(vz - 6); z <= Math.ceil(vz + 6); z++) {
            for (let x = Math.floor(vx - 6); x <= Math.ceil(vx + 6); x++) {
                const dist = constructionPalaceVolcanicHex(x - vx, z - vz);
                if (dist > 4.6 || !inside(x, z)) continue;
                const top = G + 14 - Math.round(dist * 1.4) + Math.floor(constructionPalaceHash(x, 1, z, 81) * 3);
                kit.fill(x, G, z, x, top, z, 'basalt');
                if (dist < 1) b.set(x, top, z, 'magma_rock');
                else if (constructionPalaceHash(x, 2, z, 82) < 0.2) b.set(x, top, z, 'obsidian');
            }
        }
    }
    // Buttresses: a bundle of columns every few blocks along the outside, but by the gate and the corners.
    for (let k = 0; k < 64; k++) {
        const a = (k / 64) * Math.PI * 2;
        const [ux, uz] = [Math.cos(a), Math.sin(a)];
        const t = r / constructionPalaceVolcanicHex(ux, uz) + 1.4;
        const [bx, bz] = [Math.round(mid + ux * t), Math.round(cz + uz * t)];
        if (Math.abs(bx - mid) < 16 && bz < cz) continue;
        if (corners.some(([vx, vz]) => Math.hypot(bx - vx, bz - vz) < 8)) continue;
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
            const [x, z] = [bx + dx, bz + dz];
            if (!inside(x, z) || constructionPalaceVolcanicHex(x - mid, z - cz) <= r) continue;
            const top = G + 3 + Math.floor(constructionPalaceHash(x, 3, z, 83) * 7);
            kit.fill(x, G, z, x, top, z, 'basalt');
        }
    }
}

// ---------------------------------------------------------------------------------------
// The ward: paving, gardens on ash, the crags round the podium, a hot spring and a garden of ash.

// The podium the palace stands on: x0, z0, x1, z1 (layers 9 to 11, its top is PALACE_VOLCANIC_GF).
const PALACE_VOLCANIC_PODIUM = [40, 43, 100, 104];

function constructionPalaceVolcanicWard(b, kit) {
    const G = PALACE_VOLCANIC_GROUND;
    const mid = PALACE_VOLCANIC_MID;
    const cz = PALACE_VOLCANIC_CZ;
    const [px0, pz0, px1, pz1] = PALACE_VOLCANIC_PODIUM;
    const put = constructionPalacePut(b);
    const podiumDistance = (x, z) => Math.max(px0 - x, x - px1, pz0 - z, z - pz1, 0);
    for (let z = 30; z <= 120; z++) {
        for (let x = 16; x <= 124; x++) {
            const h = constructionPalaceVolcanicHex(x - mid, z - cz);
            if (h > PALACE_VOLCANIC_WALL_R - 3.5) continue;
            const pd = podiumDistance(x, z);
            if (pd === 0) continue;
            if (z < pz0 - 1 && x > 46 && x < 94) {
                b.set(x, G, z, constructionPalaceVolcanicCauseway(x, z, 3) > 2.2 ? 'basalt' : 'granite');
            } else if (pd >= 4 && pd <= 6) {
                b.set(x, G, z, pd === 5 ? 'granite' : 'basalt');
            } else if (pd > 6) {
                b.set(x, G, z, constructionPalacePick(PALACE_VOLCANIC_ASH, x, G, z, 91));
                // Hardy plants: moss, shrubs, grass, now and then a charred trunk or a column, never near the wall.
                const roll = constructionPalaceHash(x, G, z, 92);
                if (h < PALACE_VOLCANIC_WALL_R - 7 && pd > 8 && roll < 0.05) {
                    const kind = constructionPalacePick([['shrub:dark_oak_leaves', 5], ['grass', 6], ['flowers', 2], ['charred', 2], ['basalt_column', 1], ['boulder:obsidian', 1]], x, 0, z, 93);
                    constructionPalaceTree(put, kind, x, G + 1, z, 94);
                }
            } else {
                // The crags: the rock of the cone the palace stands on, highest against the podium.
                b.set(x, G, z, kit.rock(x, G, z));
                const frontStairs = z < pz0 && x >= mid - 12 && x <= mid + 12;
                if (!frontStairs) {
                    const height = Math.min(3, Math.round((4 - pd) * 1.1 + constructionPalaceHash(x, 4, z, 95) * 1.4 - 0.4));
                    if (height > 0) kit.fill(x, G + 1, z, x, G + height, z, kit.rock);
                }
            }
        }
    }

    // The hot spring of the ward (west): water in a ring of warm rock, columns to sit on.
    const [sx, sz] = [51, 36];
    for (let z = sz - 5; z <= sz + 5; z++) {
        for (let x = sx - 6; x <= sx + 6; x++) {
            const h = constructionPalaceVolcanicHex(x - sx, z - sz);
            if (h <= 3) {
                b.set(x, G, z, 'water');
                b.set(x, G - 1, z, 'water');
                b.set(x, G - 2, z, 'basalt');
            } else if (h <= 4.2) {
                b.set(x, G, z, (x + z) % 2 ? 'magma_rock' : 'obsidian');
            }
        }
    }
    kit.bundle(sx - 5, sz - 1, G + 1, [[0, 0], [0, 1], [-1, 0]], 0, 1, 1);
    kit.sign(sx + 4, G + 1, sz + 3, 'n', 'Fuente termal // El agua de lluvia baja por las grietas, la roca caliente del volcán la calienta y vuelve a salir.', 'Hot spring: rain seeps down cracks, the hot rock of the volcano warms it, and it comes back up.');

    // The garden of ash (east): moss and ash, charred trunks, a vent that glows, columns and shrubs.
    const [gx, gz] = [89, 36];
    for (let z = gz - 4; z <= gz + 4; z++) {
        for (let x = gx - 6; x <= gx + 6; x++) {
            if (constructionPalaceVolcanicHex(x - gx, z - gz) <= 5) b.set(x, G, z, constructionPalacePick([['moss', 3], ['dirt', 3], ['basalt', 1]], x, G, z, 96));
        }
    }
    constructionPalaceTree(put, 'magma_vent', gx, G + 1, gz, 97);
    constructionPalaceTree(put, 'charred', gx - 4, G + 1, gz - 1, 98);
    constructionPalaceTree(put, 'charred', gx + 4, G + 1, gz + 2, 99);
    for (const [x, z] of [[gx - 2, gz + 3], [gx + 2, gz - 3], [gx + 5, gz - 1], [gx - 5, gz + 1]]) constructionPalaceTree(put, 'shrub:dark_oak_leaves', x, G + 1, z, 100);
    kit.bundle(gx + 1, gz + 3, G + 1, [[0, 0], [1, 0], [0, 1]], 0, 2, 2);
    kit.barrel(gx + 6, G + 1, gz - 2, [['fertilizer', 8], ['wheat_seeds', 16], ['acacia_sapling', 4], ['water_bucket', 2], ['iron_hoe', 1]]);

    // Lamps along the forecourt.
    for (const x of [mid - 13, mid + 13]) {
        b.set(x, G + 1, 37, 'dark_oak_fence');
        b.set(x, G + 2, 37, 'dark_oak_fence');
        kit.stand(x, G + 3, 37);
    }
}

// ---------------------------------------------------------------------------------------
// The gatehouse: the passage, a guard room on each side, the gate chamber over them.

function constructionPalaceVolcanicGatehouse(b, kit) {
    const G = PALACE_VOLCANIC_GROUND;
    const F = G + 1;
    const mid = PALACE_VOLCANIC_MID;
    const [x0, x1, z0, z1] = [mid - 11, mid + 11, 24, 35];
    const up = G + 6;
    const top = G + 12;
    kit.fill(x0, G + 1, z0, x1, top + 4, z1, null);
    kit.causeway(x0, z0, x1, z1, G, 'granite', 'basalt');
    kit.wall(x0, G + 1, z0, x1, top, z0);
    kit.wall(x0, G + 1, z1, x1, top, z1);
    kit.wall(x0, G + 1, z0, x0, top, z1);
    kit.wall(x1, G + 1, z0, x1, top, z1);
    kit.fill(x0 + 1, up, z0 + 1, x1 - 1, up, z1 - 1, 'dark_oak_planks');
    kit.fill(x0, top, z0, x1, top, z1, 'black_brick');
    for (let x = x0; x <= x1; x++) {
        b.set(x, G + 7, z0, 'obsidian');
        for (const z of [z0, z1]) {
            b.set(x, top + 1, z, 'black_brick');
            if (x % 2 === 0) b.set(x, top + 2, z, kit.masonry(x, top + 2, z));
        }
    }
    for (let z = z0; z <= z1; z++) {
        for (const x of [x0, x1]) {
            b.set(x, top + 1, z, 'black_brick');
            if (z % 2 === 0) b.set(x, top + 2, z, kit.masonry(x, top + 2, z));
        }
    }
    b.sym(() => {
        // The passage wall, and its door into the guard room.
        kit.wall(mid - 3, G + 1, z0 + 1, mid - 3, up - 1, z1 - 1);
        b.door(mid - 3, F, 30, 'dark_oak_door', 'w');
        // Arrow loops in the guard room, windows in the chamber, banners and columns outside.
        b.box(mid - 5, F + 1, z0, mid - 5, F + 2, z0, 'iron_bars');
        kit.window(true, z0, mid - 9, mid - 7, up + 2, up + 3);
        kit.window(true, z1, mid - 9, mid - 7, up + 2, up + 3, 'red_stained_glass_pane');
        kit.banner(mid - 5, up + 2, z0 - 1, 'red', 'n');
        kit.banner(mid - 5, up + 1, z0 - 1, 'orange', 'n');
        kit.bundle(mid - 10, 23, G + 1, [[0, 0], [1, 0], [2, 0], [3, 0]], 6, 13, 3);
        kit.hang(mid - 5, up - 1, 27);
        kit.hang(mid - 5, top - 1, 27);
        kit.hang(mid - 5, top - 1, 32);
        kit.stand(mid - 4, F, 34);
    });
    // The way through, 5 wide and 5 high, the raised portcullis in its head.
    for (const z of [z0, z1]) {
        kit.fill(mid - 2, F, z, mid + 2, F + 3, z, null);
        b.stairs(mid - 2, F + 4, z, PALACE_VOLCANIC_STAIR, 'e', 'top');
        b.stairs(mid + 2, F + 4, z, PALACE_VOLCANIC_STAIR, 'w', 'top');
        kit.fill(mid - 1, F + 4, z, mid + 1, F + 4, z, 'iron_bars');
        b.set(mid, F + 5, z, 'gold_block');
    }
    kit.fill(mid - 2, F, z0 + 1, mid + 2, F + 4, z1 - 1, null);
    for (const z of [25, 28, 31, 34]) kit.hang(mid, up - 1, z);
    kit.hang(x0 + 3, up - 1, 32);
    for (const [x, z] of [[62, 26], [62, 33], [66, 26], [66, 33], [74, 26], [74, 33], [78, 26], [78, 33]]) kit.stand(x, up + 1, z);

    // The west guard room: the stair to the chamber along its west wall, bunks, a table.
    kit.flight(x0 + 1, F, z0 + 2, 's', 6, 2, [1, 0], F);
    kit.fill(x0 + 3, up + 1, 27, x0 + 3, up + 1, 30, 'iron_bars');
    kit.fill(x0 + 1, up + 1, 27, x0 + 2, up + 1, 27, 'iron_bars');
    kit.bed(x0 + 4, F, z1 - 1, 's');
    kit.bed(x0 + 6, F, z1 - 1, 's');
    kit.chest(x0 + 5, F, z1 - 1, 'n', [['bread', 12], ['cooked_fish', 8], ['torch', 16], ['candle', 6]]);
    b.set(x0 + 5, F, 27, 'table');
    kit.stand(x0 + 5, F + 1, 27);
    b.set(x0 + 4, F, 27, 'stool');
    b.set(x0 + 6, F, 27, 'stool');
    b.set(x0 + 5, F, 26, 'table');
    kit.tabletop(x0 + 5, F + 1, 26, 'jug');
    kit.barrel(x0 + 7, F, z0 + 1, [['cold_water', 6], ['bread', 8]]);
    kit.stand(x0 + 3, F, z0 + 1);
    kit.sign(x0 + 7, F, 31, 'w', 'Cuerpo de guardia', 'Guard room');

    // The east guard room: bunks, a desk for the captain, a chest of lanterns.
    const e0 = mid + 4;
    kit.bed(e0 + 1, F, z1 - 1, 's');
    kit.bed(e0 + 3, F, z1 - 1, 's');
    kit.bed(e0 + 5, F, z1 - 1, 's');
    kit.chest(x1 - 1, F, z1 - 1, 'w', [['lantern', 4], ['leather', 6], ['torch', 12], ['bread', 8]]);
    kit.piece(e0 + 4, F, z0 + 2, 'desk', 'desk', 'n');
    kit.tabletop(e0 + 4, F + 1, z0 + 2, 'scroll', 'n');
    kit.piece(e0 + 4, F, z0 + 3, 'dark_oak_chair', 'chair', 'n');
    kit.furn.benches(e0 + 1, e0 + 2, F, z0 + 1, 's');
    kit.stand(e0, F, 27);
    kit.stand(x1 - 1, F, 30);
    kit.sign(e0, F, 31, 'e', 'Cuerpo de guardia', 'Guard room');

    // The gate chamber: a long table, benches, a barrel of torches.
    b.box(mid - 5, up + 1, 30, mid + 5, up + 1, 30, 'table');
    kit.furn.benches(mid - 5, mid + 5, up + 1, 29, 's');
    kit.furn.benches(mid - 5, mid + 5, up + 1, 31, 'n');
    for (const x of [mid - 4, mid, mid + 4]) b.set(x, up + 2, 30, 'candle');
    // The guards' supper and a game of chess left between watches.
    kit.tabletop(mid - 2, up + 2, 30, 'meal_plate');
    kit.tabletop(mid - 3, up + 2, 30, 'chessboard', 'n');
    kit.tabletop(mid + 2, up + 2, 30, 'jug');
    kit.barrel(x1 - 1, up + 1, z0 + 1, [['torch', 32], ['coal_ore', 16]]);
    kit.stand(x1 - 1, up + 1, z1 - 1);
    kit.stand(mid, up + 1, z0 + 1);
    kit.banner(mid, up + 3, z1 - 1, 'red', 'n');
}

// ---------------------------------------------------------------------------------------
// The palace: its podium, floors, walls, windows and doors, the main stairs and the portico.

// Windows of the outside walls, as [from, to] along each: ground floor and first floor. Where a partition
// meets a wall there is none.
const PALACE_VOLCANIC_WINDOWS = {
    front: { ground: [[45, 47], [51, 53], [57, 59], [63, 65], [75, 77], [81, 83], [87, 89], [93, 95]], first: [[45, 47], [51, 53], [57, 59], [63, 65], [75, 77], [81, 83], [87, 89], [93, 95]] },
    back: { ground: [[57, 59], [81, 83], [87, 89], [93, 95]], first: [[44, 46], [51, 53], [57, 59], [81, 83], [87, 89], [94, 96]] },
    west: { ground: [[51, 53], [57, 59], [63, 65], [69, 71], [75, 77], [81, 83]], first: [[51, 53], [57, 59], [63, 65], [69, 70], [75, 77], [81, 83], [87, 89], [93, 95], [99, 101]] },
    east: { ground: [[51, 53], [57, 59], [63, 65], [81, 83], [87, 89], [93, 95], [99, 101]], first: [[51, 53], [57, 59], [63, 65], [69, 70], [75, 77], [81, 83], [87, 89], [93, 95], [99, 101]] }
};

function constructionPalaceVolcanicShell(b, kit) {
    const G = PALACE_VOLCANIC_GROUND;
    const GF = PALACE_VOLCANIC_GF;
    const UF = PALACE_VOLCANIC_1F;
    const RF = PALACE_VOLCANIC_ROOF;
    const mid = PALACE_VOLCANIC_MID;
    const [px0, pz0, px1, pz1] = PALACE_VOLCANIC_PODIUM;
    // The podium: rough rock on its faces, a rim of obsidian round its top.
    for (let z = pz0; z <= pz1; z++) {
        for (let x = px0; x <= px1; x++) {
            const edge = Math.min(x - px0, px1 - x, z - pz0, pz1 - z);
            if (edge <= 1) kit.fill(x, G + 1, z, x, GF - 1, z, kit.rock);
            b.set(x, GF, z, edge === 0 ? 'obsidian' : 'black_brick');
        }
    }
    // Floors: hexagons of granite on the ground floor, dark oak upstairs, the roof of black brick. The
    // throne room has no first floor, and the roof is open over the terrace round the courtyard.
    kit.causeway(43, 49, 97, 101, GF, 'granite', 'basalt');
    kit.fill(43, UF, 49, 97, UF, 101, 'dark_oak_planks');
    kit.fill(55, UF, 88, 85, UF, 101, null);
    kit.fill(42, RF, 48, 98, RF, 102, 'black_brick');
    kit.fill(55, RF, 61, 85, RF, 86, null);

    // The outside walls: a plinth and a string course of obsidian.
    const outer = (x, y, z) => (y === GF + 1 || y === UF ? 'obsidian' : kit.masonry(x, y, z));
    kit.fill(42, GF + 1, 48, 98, RF - 1, 48, outer);
    kit.fill(42, GF + 1, 102, 98, RF - 1, 102, outer);
    kit.fill(42, GF + 1, 48, 42, RF - 1, 102, outer);
    kit.fill(98, GF + 1, 48, 98, RF - 1, 102, outer);
    // The walls inside: behind the front rooms, the wings, the front of the throne room.
    kit.wall(43, GF + 1, 60, 97, RF - 1, 60);
    kit.wall(55, GF + 1, 87, 85, RF - 1, 87);
    b.sym(() => {
        kit.wall(54, GF + 1, 49, 54, RF - 1, 101);
        // The stair hall, on the ground floor and the first.
        kit.wall(43, GF + 1, 78, 53, UF - 1, 78);
        kit.wall(43, GF + 1, 84, 53, UF - 1, 84);
        kit.wall(43, UF + 1, 78, 50, RF - 1, 78);
        kit.wall(43, UF + 1, 84, 50, RF - 1, 84);
        // Upstairs, the rooms of the wing along a corridor (x 51 to 53).
        kit.wall(50, UF + 1, 61, 50, RF - 1, 77);
        kit.wall(50, UF + 1, 85, 50, RF - 1, 101);
        kit.wall(43, UF + 1, 71, 49, RF - 1, 71);
        kit.wall(43, UF + 1, 92, 49, RF - 1, 92);
        // The two big bedrooms of each wing give their far end to a washroom (4 by 3) and a closet (2 by 3),
        // both opening off the bedroom; the back windows sit clear of the closet's wall.
        for (const [wall, z0, z1] of [[67, 68, 70], [98, 99, 101]]) {
            kit.wall(43, UF + 1, wall, 49, RF - 1, wall);
            kit.wall(47, UF + 1, z0, 47, RF - 1, z1);
            b.door(45, UF + 1, wall, 'dark_oak_door', 's');
            b.door(48, UF + 1, wall, 'dark_oak_door', 's', 'right');
        }
    });
    // The servants' room keeps its dormitory and gives a corner to their washroom (4 by 4).
    kit.wall(43, UF + 1, 55, 46, RF - 1, 55);
    kit.wall(47, UF + 1, 55, 47, RF - 1, 59);
    b.door(47, UF + 1, 57, 'dark_oak_door', 'w');
    // The guest room becomes a suite: a bedroom (6 by 6) and a dressing room in front, an antechamber and a
    // washroom (4 by 4) behind, by the doors from the corridor and the library.
    kit.wall(87, UF + 1, 55, 97, RF - 1, 55);
    kit.wall(91, UF + 1, 49, 91, RF - 1, 54);
    kit.wall(93, UF + 1, 56, 93, RF - 1, 59);
    b.door(92, UF + 1, 55, 'dark_oak_door', 'n');
    b.door(89, UF + 1, 55, 'dark_oak_door', 'n');
    b.door(93, UF + 1, 58, 'dark_oak_door', 'e');
    // The vault of the treasury (east wing).
    kit.wall(87, GF + 1, 66, 97, UF - 1, 66);

    // Columns on every face, a cornice of obsidian, a parapet with merlons, columns grouped at the corners.
    const along = [43, 49, 55, 61, 67, 73, 79, 85, 91, 97];
    for (const x of along) {
        if (x >= 54 && x <= 86) kit.column(x, 47, UF + 1, RF - 1);
        else kit.column(x, 47, GF + 1, RF - 1);
        kit.column(x, 103, GF + 1, RF - 1);
    }
    for (const z of [55, 61, 67, 73, 79, 85, 91, 97]) {
        kit.column(41, z, GF + 1, RF - 1);
        kit.column(99, z, GF + 1, RF - 1);
    }
    for (let x = 41; x <= 99; x++) {
        b.set(x, RF, 47, 'obsidian');
        b.set(x, RF, 103, 'obsidian');
    }
    for (let z = 47; z <= 103; z++) {
        b.set(41, RF, z, 'obsidian');
        b.set(99, RF, z, 'obsidian');
    }
    const parapet = (x, z, u) => {
        b.set(x, RF + 1, z, kit.masonry(x, RF + 1, z));
        if (u % 2 === 0) b.set(x, RF + 2, z, kit.masonry(x, RF + 2, z));
    };
    for (let x = 42; x <= 98; x++) {
        parapet(x, 48, x);
        parapet(x, 102, x);
    }
    for (let z = 49; z <= 101; z++) {
        parapet(42, z, z);
        parapet(98, z, z);
    }
    b.sym(() => {
        kit.bundle(41, 47, GF + 1, [[0, 0], [-1, 0], [0, -1], [-1, -1]], 15, 19, 4);
        kit.bundle(41, 103, GF + 1, [[0, 0], [-1, 0], [0, 1], [-1, 1]], 15, 19, 5);
    });
    // The point of the keep stands on a buttress of columns at the back.
    kit.fill(mid, GF + 1, 103, mid, RF, 103, 'basalt');
    kit.bundle(mid, 103, GF + 1, [[-1, 0], [1, 0]], 8, 11, 6);

    // Windows.
    const W = PALACE_VOLCANIC_WINDOWS;
    for (const [face, alongX, at] of [['front', true, 48], ['back', true, 102], ['west', false, 42], ['east', false, 98]]) {
        for (const [u0, u1] of W[face].ground) kit.window(alongX, at, u0, u1, GF + 2, GF + 4);
        for (const [u0, u1] of W[face].first) kit.window(alongX, at, u0, u1, UF + 2, UF + 4, 'red_stained_glass_pane');
    }

    // Doors and arches. The main door, framed in obsidian with a keystone of gold.
    kit.fill(mid - 1, GF + 1, 48, mid + 1, GF + 4, 48, null);
    kit.fill(mid - 2, GF + 5, 48, mid + 2, GF + 5, 48, 'obsidian');
    kit.fill(mid - 2, GF + 1, 48, mid - 2, GF + 4, 48, 'obsidian');
    kit.fill(mid + 2, GF + 1, 48, mid + 2, GF + 4, 48, 'obsidian');
    b.set(mid, GF + 5, 48, 'gold_block');
    // From the great hall to the gallery: an arch on the axis and a door each side.
    kit.fill(mid - 1, GF + 1, 60, mid + 1, GF + 4, 60, null);
    b.sym(() => {
        kit.fill(60, GF + 1, 60, 60, GF + 2, 60, null);
        // Kitchen and dining room to the great hall; the stair halls and the rooms at the back to the gallery.
        kit.fill(54, GF + 1, 54, 54, GF + 2, 55, null);
        kit.fill(54, GF + 1, 82, 54, GF + 2, 83, null);
        kit.fill(54, GF + 1, 92, 54, GF + 2, 93, null);
        kit.fill(44, GF + 1, 84, 44, GF + 2, 84, null);
        // Upstairs: the corridor to the front room, to the terrace, and windows on the throne room.
        b.door(52, UF + 1, 60, 'dark_oak_door', 'n');
        kit.fill(54, UF + 1, 65, 54, UF + 2, 66, null);
        kit.fill(54, UF + 1, 75, 54, UF + 2, 76, null);
        for (const z of [90, 96]) kit.fill(54, UF + 2, z, 54, UF + 3, z + 1, 'iron_bars');
        kit.fill(54, UF + 1, 57, 54, UF + 2, 57, null);
        // The doors of the four rooms of each wing.
        for (const z of [66, 75, 88, 97]) b.door(50, UF + 1, z, 'dark_oak_door', 'w');
        // Windows from the library to the terrace.
        kit.window(true, 60, 61, 63, UF + 2, UF + 4, 'orange_stained_glass_pane');
    });
    kit.fill(54, GF + 1, 68, 54, GF + 2, 69, null);
    b.door(86, GF + 1, 63, 'dark_oak_door', 'e');
    b.door(92, GF + 1, 66, 'iron_door', 's');
    kit.fill(mid - 2, GF + 1, 87, mid + 2, GF + 5, 87, null);
    kit.fill(mid - 1, UF + 1, 60, mid + 1, UF + 3, 60, null);
    b.door(mid, UF + 1, 48, 'dark_oak_door', 'n');
    // Windows of the great hall and of the throne room onto the gallery and the terrace.
    for (const [u0, u1] of [[57, 59], [63, 65], [75, 77], [81, 83]]) kit.window(true, 60, u0, u1, GF + 2, GF + 4);
    for (const [u0, u1] of [[57, 59], [63, 65], [75, 77], [81, 83]]) kit.window(true, 87, u0, u1, UF + 2, UF + 4, 'red_stained_glass_pane');

    // The main stairs, between bundles of columns, up to the portico.
    kit.flight(mid - 10, G + 1, pz0 - 4, 's', 4, 21, [1, 0], G + 1);
    b.sym(() => {
        const cells = [];
        for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -1; dx <= 1; dx++) cells.push([dx, dz]);
        }
        kit.bundle(mid - 12, pz0 - 2, G + 1, cells, 2, 7, 7);
    });
    // The portico: a floor of hexagons, six columns, a balcony on top for the library.
    kit.causeway(54, pz0, 86, 47, GF, 'granite', 'obsidian');
    for (const x of [55, 61, 67, 73, 79, 85]) kit.column(x, pz0, GF + 1, UF - 1);
    kit.fill(54, UF, pz0 - 1, 86, UF, 47, 'black_brick');
    for (let x = 54; x <= 86; x++) {
        b.set(x, UF, pz0 - 1, 'obsidian');
        b.set(x, UF + 1, pz0 - 1, 'obsidian');
    }
    for (let z = pz0 - 1; z <= 47; z++) {
        b.set(54, UF + 1, z, 'obsidian');
        b.set(86, UF + 1, z, 'obsidian');
    }
    for (const x of [55, 61, 67, 73, 79, 85]) kit.stand(x, UF + 2, pz0 - 1);
    for (const x of [58, 64, mid, 76, 82]) kit.hang(x, UF - 1, 45);
    for (const x of [57, 63, 77, 83]) kit.stand(x, GF + 1, 46);
    for (const x of [58, 64, 76, 82]) kit.stand(x, GF + 1, pz0);
    b.sym(() => {
        kit.banner(mid - 1, UF + 2, 47, 'red', 'n');
        kit.banner(mid - 1, UF + 3, 47, 'orange', 'n');
        kit.banner(mid - 3, GF + 3, 47, 'red', 'n');
        kit.banner(mid - 3, GF + 4, 47, 'orange', 'n');
    });
    // A stepped gable over the front, with a rose of red glass.
    for (let k = 0; k <= 4; k++) kit.fill(mid - 8 + 2 * k, RF + 1 + k, 48, mid + 8 - 2 * k, RF + 1 + k, 48, kit.masonry);
    kit.fill(mid - 1, RF + 2, 48, mid + 1, RF + 3, 48, 'red_stained_glass');
    b.set(mid, RF + 4, 48, 'orange_stained_glass');
    b.set(mid, RF + 6, 48, 'gold_block');
    kit.sign(mid - 6, GF + 1, 46, 'n', 'Gran salón // Arriba, la biblioteca.', 'Great hall. Upstairs, the library.');
}

// ---------------------------------------------------------------------------------------
// The crater courtyard: a sunken pool of magma behind bars, channels of magma, two hot springs, a colonnade
// whose roof is the terrace of the first floor.

function constructionPalaceVolcanicCourtyard(b, kit) {
    const GF = PALACE_VOLCANIC_GF;
    const UF = PALACE_VOLCANIC_1F;
    const [cx, cz] = [PALACE_VOLCANIC_MID, PALACE_VOLCANIC_CZ];
    const ring = [];
    const springs = [[cx - 6, cz + 4], [cx + 6, cz + 4]];
    for (let z = 61; z <= 86; z++) {
        for (let x = 55; x <= 85; x++) {
            const [dx, dz] = [x - cx, z - cz];
            const h = constructionPalaceVolcanicHex(dx, dz);
            if (h > 10) {
                // The gallery and, over it, the terrace.
                b.set(x, GF, z, h <= 11 ? 'obsidian' : constructionPalaceVolcanicCauseway(x, z, 2.2) > 1.4 ? 'basalt' : 'granite');
                b.set(x, UF, z, h <= 11 ? 'obsidian' : constructionPalaceVolcanicCauseway(x, z, 2.2) > 1.4 ? 'obsidian' : 'basalt');
                if (h <= 11) {
                    b.set(x, UF + 1, z, 'obsidian');
                    ring.push([x, z, Math.atan2(dz, dx)]);
                }
                continue;
            }
            b.set(x, UF, z, null);
            const spring = springs.find(([sx, sz]) => constructionPalaceVolcanicHex(x - sx, z - sz) <= 2.2);
            const spoke = h > 5.5 && h < 9.4 && (Math.abs(dz) < 0.5 || Math.abs(dx * 0.866 - dz * 0.5) < 0.5 || Math.abs(dx * 0.866 + dz * 0.5) < 0.5);
            if (h <= 3.6) {
                b.set(x, GF - 2, z, 'basalt');
                b.set(x, GF - 1, z, 'magma_rock');
                b.set(x, GF, z, null);
            } else if (h <= 4.8) {
                b.set(x, GF, z, 'obsidian');
                b.set(x, GF + 1, z, 'iron_bars');
            } else if (spring) {
                const inner = constructionPalaceVolcanicHex(x - spring[0], z - spring[1]) <= 1.2;
                b.set(x, GF, z, inner ? 'water' : 'magma_rock');
                if (inner) {
                    b.set(x, GF - 1, z, 'water');
                    b.set(x, GF - 2, z, 'basalt');
                }
            } else if (spoke) {
                b.set(x, GF, z, 'magma_rock');
            } else {
                b.set(x, GF, z, constructionPalaceVolcanicCauseway(x, z, 2.2) > 1.4 ? 'granite' : 'basalt');
            }
        }
    }
    // A plug of basalt columns rising out of the magma.
    kit.bundle(cx, cz, GF - 1, [[0, 0]], 4, 4, 8);
    b.set(cx, GF + 4, cz, 'magma_rock');
    kit.bundle(cx, cz, GF - 1, [[1, 0], [-1, 0], [0, 1], [0, -1]], 1, 2, 9);
    // The colonnade: a column every third cell of the ring, the axis left open.
    ring.sort((a, c) => a[2] - c[2]);
    ring.forEach(([x, z], i) => {
        if (i % 3 === 0 && Math.abs(x - cx) > 1) kit.column(x, z, GF + 1, UF - 1);
    });
    // Seats of columns by the springs, lanterns on the parapet.
    for (const [sx, sz] of springs) kit.bundle(sx, sz - 3, GF + 1, [[0, 0], [1, 0], [-1, 0]], 0, 0, 10);
    for (const [x, z] of [[cx - 11, cz], [cx + 11, cz], [cx, cz - 9], [cx, cz + 9]]) kit.stand(x, UF + 2, z);
    // Lanterns along the walls of the gallery.
    for (const x of [57, 63, 66, 74, 77, 83]) {
        kit.stand(x, GF + 1, 61);
        kit.stand(x, GF + 1, 86);
    }
    for (const z of [64, 72, 79, 86]) {
        kit.stand(55, GF + 1, z);
        kit.stand(85, GF + 1, z);
    }
    kit.stand(cx - 10, GF + 1, cz - 6);
    kit.stand(cx + 10, GF + 1, cz - 6);
    kit.hang(cx, UF - 1, cz - 10);
    kit.sign(cx, GF + 1, cz - 7, 'n', 'Lago de lava // La lava es roca fundida, a más de 1000 °C. Al enfriarse se vuelve basalto u obsidiana.', 'Lava lake: lava is molten rock, hotter than 1000 °C. As it cools it turns into basalt or obsidian.');
    kit.sign(springs[0][0] + 3, GF + 1, springs[0][1], 'w', 'Aguas termales // La roca caliente calienta el agua que se filtra.', 'Hot springs: hot rock warms the water that seeps down.');
}

// ---------------------------------------------------------------------------------------
// The two stair halls (one in each wing, drawn once and mirrored) and their rails.

function constructionPalaceVolcanicStairHalls(b, kit) {
    const GF = PALACE_VOLCANIC_GF;
    const UF = PALACE_VOLCANIC_1F;
    const RF = PALACE_VOLCANIC_ROOF;
    b.sym(() => {
        // Up from the ground floor along z 80 and 81, going east, to the first floor at x 51 to 53.
        kit.flight(44, GF + 1, 80, 'e', 7, 2, [0, 1], GF + 1);
        // On up along z 82 and 83, going west, to the roof at x 43.
        kit.flight(50, UF + 1, 82, 'w', 7, 2, [0, 1], UF + 1);
        // Rails round the openings.
        kit.fill(47, UF + 1, 79, 49, UF + 1, 79, 'iron_bars');
        kit.fill(45, RF + 1, 81, 47, RF + 1, 81, 'iron_bars');
        kit.fill(45, RF + 1, 84, 47, RF + 1, 84, 'iron_bars');
        kit.fill(48, RF + 1, 82, 48, RF + 1, 83, 'iron_bars');
        // Light on each flight and landing.
        kit.stand(43, GF + 1, 79);
        kit.stand(53, GF + 1, 79);
        kit.stand(43, GF + 1, 83);
        kit.hang(46, UF - 1, 83);
        kit.stand(53, UF + 1, 79);
        kit.stand(51, UF + 1, 83);
        kit.hang(44, RF - 1, 80);
        kit.hang(48, RF - 1, 80);
        kit.stand(43, RF + 1, 81);
        kit.stand(43, UF + 1, 83);
    });
}

// ---------------------------------------------------------------------------------------
// The ground floor: kitchen, great hall and dining room in front; bath, hall of minerals, treasury and forge
// in the wings.

function constructionPalaceVolcanicGroundFloor(b, kit) {
    const GF = PALACE_VOLCANIC_GF;
    const F = GF + 1;
    const UF = PALACE_VOLCANIC_1F;
    const mid = PALACE_VOLCANIC_MID;
    const { oven } = kit.furn;

    // The kitchen: four ovens under a hood, a pit of magma to roast over, the table, barrels and a chest.
    kit.fill(43, GF, 49, 53, GF, 59, (x, y, z) => ((x + z) % 2 ? 'slate' : 'granite'));
    for (let z = 51; z <= 54; z++) oven(43, F, z, 'e');
    kit.fill(43, F + 2, 50, 43, UF - 1, 55, 'black_brick');
    kit.fill(44, F + 4, 50, 44, UF - 1, 55, 'black_brick');
    kit.fill(45, GF, 57, 46, GF, 58, 'magma_rock');
    for (let z = 56; z <= 59; z++) {
        b.set(44, F, z, 'iron_bars');
        b.set(47, F, z, 'iron_bars');
    }
    kit.fill(45, F, 56, 46, F, 56, 'iron_bars');
    kit.piece(49, F, 49, 'sink', 'sink', 's');
    b.set(50, F, 49, 'workbench');
    kit.piece(50, F + 1, 49, 'wall_shelf', 'wall_shelf', 's');
    kit.chest(52, F, 49, 's', [['bread', 16], ['cheese', 8], ['cooked_fish', 12], ['salted_fish', 8], ['honey_bottle', 4], ['roast_mushroom', 8]]);
    kit.barrel(43, F, 49, [['wheat', 32], ['salt', 8], ['baking_soda', 4]]);
    kit.barrel(44, F, 49, [['milk', 6], ['cold_water', 6], ['water_bucket', 2]]);
    kit.barrel(43, F, 59, [['raw_fish', 12], ['salted_fish', 12], ['fish_egg', 4]]);
    kit.fill(48, F, 52, 50, F, 53, 'table');
    for (const x of [48, 50]) {
        b.set(x, F, 51, 'stool');
        b.set(x, F, 54, 'stool');
    }
    kit.stand(49, F + 1, 52);
    b.set(48, F + 1, 53, 'flower_pot');
    kit.tabletop(50, F + 1, 53, 'meal_plate');
    kit.tabletop(50, F + 1, 52, 'jug');
    kit.tabletop(48, F + 1, 52, 'fruit_bowl');
    kit.stand(53, F, 59);
    kit.stand(53, F, 51);
    kit.stand(45, F, 49);
    kit.stand(43, F, 56);
    kit.hang(48, UF - 1, 57);
    kit.sign(52, F, 56, 'w', 'Cocina // Los hornos y el pozo de magma: aquí se cocina con el calor del volcán.', 'Kitchen: the ovens and the magma pit cook with the heat of the volcano.');

    // The great hall: two long tables, a red carpet on the axis, channels of magma along the walls,
    // chandeliers and banners.
    kit.causeway(55, 49, 85, 59, GF, 'granite', 'basalt');
    for (let z = 50; z <= 58; z++) {
        b.set(56, GF, z, 'magma_rock');
        b.set(84, GF, z, 'magma_rock');
    }
    b.sym(() => {
        kit.fill(58, F, 54, 66, F, 54, 'table');
        kit.furn.benches(58, 66, F, 53, 's');
        kit.furn.benches(58, 66, F, 55, 'n');
        for (const x of [59, 62, 65]) b.set(x, F + 1, 54, 'candle');
        // What is left of the last meal, different along each table.
        for (const x of [60, 61, 63, 64, 66]) {
            const left = constructionPalacePick([['meal_plate', 3], ['jug', 2], ['fruit_bowl', 2], ['', 4]], x, b.flipped ? 1 : 0, 54, 31);
            if (left) kit.tabletop(x, F + 1, 54, left);
        }
        for (const x of [60, 64]) b.set(x, UF - 1, 54, 'chandelier');
        for (const x of [61, 79]) {
            kit.banner(x, F + 3, 49, 'red', 's');
            kit.banner(x, F + 2, 49, 'orange', 's');
        }
        kit.banner(57, F + 3, 59, 'orange', 'n');
        kit.banner(66, F + 3, 59, 'red', 'n');
        kit.stand(55, F, 49);
        kit.stand(55, F, 59);
        kit.stand(62, F, 50);
        kit.stand(62, F, 58);
        kit.stand(67, F, 51);
        kit.stand(67, F, 57);
        kit.piece(57, F, 51, 'statue', 'statue', 'e');
    });
    for (let z = 49; z <= 59; z++) {
        for (let x = mid - 1; x <= mid + 1; x++) b.set(x, F, z, 'red_carpet');
    }
    b.set(mid, UF - 1, 51, 'chandelier');
    b.set(mid, UF - 1, 57, 'chandelier');

    // The dining room: a table for ten under a chandelier, a sideboard, paintings.
    kit.causeway(87, 49, 97, 59, GF, 'basalt', 'obsidian', 2);
    kit.fill(89, F, 53, 95, F, 55, 'table');
    for (const x of [90, 92, 94]) {
        kit.piece(x, F, 52, 'dark_oak_chair', 'chair', 's');
        kit.piece(x, F, 56, 'dark_oak_chair', 'chair', 'n');
    }
    kit.piece(88, F, 54, 'dark_oak_chair', 'chair', 'e');
    kit.piece(96, F, 54, 'dark_oak_chair', 'chair', 'w');
    for (const x of [90, 92, 94]) b.set(x, F + 1, 54, 'candle');
    kit.tabletop(90, F + 1, 53, 'meal_plate');
    kit.tabletop(94, F + 1, 55, 'meal_plate');
    kit.tabletop(93, F + 1, 53, 'jug');
    kit.tabletop(89, F + 1, 55, 'fruit_bowl');
    // Somebody got up from that plate and left the chair turned.
    kit.piece(94, F, 56, 'dark_oak_chair', 'chair', 'e');
    b.set(91, F + 1, 53, 'vase');
    b.set(92, UF - 1, 54, 'chandelier');
    kit.barrel(97, F, 49, [['soda_water', 6], ['honey_bottle', 6], ['cold_milk', 4]]);
    kit.chest(97, F, 59, 'w', [['bread', 8], ['cheese', 6], ['honey_bottle', 4], ['candle', 8]]);
    kit.piece(93, F + 2, 59, 'painting_peaks', 'painting', 'n');
    kit.piece(90, F + 2, 59, 'painting_night', 'painting', 'n');
    kit.piece(97, F + 1, 52, 'wall_shelf', 'wall_shelf', 'w');
    for (const [x, z] of [[87, 49], [87, 59], [95, 49], [96, 57]]) kit.stand(x, F, z);
    kit.sign(87, F, 56, 'e', 'Comedor', 'Dining room');

    // The bath of hot springs: two pools in a frame of warm rock, benches, towels.
    kit.causeway(43, 61, 53, 77, GF, 'basalt', 'granite', 2);
    for (const [z0, z1] of [[63, 67], [71, 75]]) {
        for (let z = z0 - 1; z <= z1 + 1; z++) {
            for (let x = 44; x <= 50; x++) {
                const edge = z === z0 - 1 || z === z1 + 1 || x === 44 || x === 50;
                if (edge) b.set(x, GF, z, (x + z) % 2 ? 'magma_rock' : 'obsidian');
                else {
                    b.set(x, GF, z, 'water');
                    b.set(x, GF - 1, z, 'water');
                    b.set(x, GF - 2, z, 'basalt');
                }
            }
        }
    }
    for (let z = 63; z <= 66; z++) kit.piece(52, F, z, 'bench', 'bench', 'w');
    for (let z = 72; z <= 75; z++) kit.piece(52, F, z, 'bench', 'bench', 'w');
    kit.chest(43, F, 77, 'e', [['white_wool', 16], ['soda_water', 4], ['candle', 6]]);
    kit.wardrobe(43, F, 61, 'e');
    kit.bundle(43, 69, F, [[0, 0], [0, 1]], 1, 3, 11);
    for (const [x, z] of [[53, 61], [53, 77], [47, 69], [50, 61], [43, 75]]) kit.stand(x, F, z);
    kit.hang(47, UF - 1, 65);
    kit.hang(47, UF - 1, 73);
    kit.sign(52, F, 70, 'w', 'Baños termales // El agua sale caliente de la roca del volcán, con sales disueltas.', 'Hot spring baths: the water comes out of the volcanic rock warm, with salts dissolved in it.');

    constructionPalaceVolcanicMineralHall(b, kit);

    // The treasury: an anteroom with the keeper's desk, and through the iron door the vault.
    kit.causeway(87, 61, 97, 65, GF, 'granite', 'basalt', 2);
    kit.fill(87, GF, 67, 97, GF, 77, (x, y, z) => ((x + z) % 4 === 0 ? 'gold_block' : 'obsidian'));
    kit.piece(94, F, 61, 'desk', 'desk', 's');
    kit.piece(94, F, 62, 'dark_oak_chair', 'chair', 'n');
    b.set(94, F + 1, 61, 'candle');
    b.set(95, F, 61, 'table');
    kit.tabletop(95, F + 1, 61, 'inkwell', 's');
    kit.piece(97, F, 65, 'statue', 'statue', 'w');
    kit.stand(88, F, 61);
    kit.stand(97, F, 61);
    kit.stand(88, F, 65);
    kit.sign(90, F, 64, 'w', 'Tesoro', 'Treasury');
    kit.chest(97, F, 69, 'w', [['gold_ore', 16], ['gold_leaf', 12], ['gold_block', 4]]);
    kit.chest(97, F, 71, 'w', [['ruby', 6], ['sapphire', 6], ['amber', 4]]);
    kit.chest(97, F, 73, 'w', [['meteoric_iron', 3], ['brass_ingot', 12], ['bronze_ingot', 12]]);
    for (const [x, y, z] of [[87, F, 77], [88, F, 77], [87, F + 1, 77], [87, F, 76]]) b.set(x, y, z, 'gold_block');
    for (const [x, y, z] of [[97, F, 77], [96, F, 77], [97, F + 1, 77]]) b.set(x, y, z, 'copper_block');
    b.set(97, F, 76, 'iron_block');
    kit.piece(87, F, 68, 'statue', 'statue', 'e');
    for (const [x, z] of [[90, 67], [94, 67], [87, 72], [96, 75], [92, 77], [92, 72]]) kit.stand(x, F, z);

    // The forge and foundry: the hearth of magma under its hood, two foundries and an oven, anvils of iron,
    // a trough to cool the metal, barrels of ore and chests of ingots and tools.
    kit.causeway(87, 85, 97, 101, GF, 'basalt', 'obsidian', 2);
    kit.fill(95, F, 88, 97, F, 91, 'black_brick');
    kit.fill(96, F, 89, 96, F, 90, 'magma_rock');
    kit.fill(95, F + 3, 88, 97, UF - 1, 91, 'black_brick');
    b.shaped(97, F, 93, 'foundry', 'oven', { facing: 'w', fire: 'off' });
    b.shaped(97, F, 94, 'foundry', 'oven', { facing: 'w', fire: 'off' });
    oven(97, F, 96, 'w');
    b.set(92, F, 90, 'iron_block');
    b.set(92, F, 95, 'iron_block');
    kit.fill(89, GF, 89, 89, GF, 90, 'water');
    b.set(89, GF - 1, 89, 'basalt');
    b.set(89, GF - 1, 90, 'basalt');
    b.set(88, F, 101, 'workbench');
    b.set(89, F, 101, 'workbench');
    kit.piece(88, F + 1, 101, 'wall_shelf', 'wall_shelf', 'n');
    kit.tabletop(89, F + 1, 101, 'scroll', 'n');
    kit.barrel(97, F, 98, [['coal_ore', 32], ['iron_ore', 24]]);
    kit.barrel(97, F, 99, [['copper_ore', 24], ['tin_ore', 24], ['gold_ore', 6]]);
    kit.barrel(97, F, 100, [['sand', 32], ['quicklime', 8]]);
    kit.chest(93, F, 101, 'n', [['brass_ingot', 16], ['bronze_ingot', 16], ['iron_block', 4], ['copper_block', 4]]);
    kit.chest(94, F, 101, 'n', [['copper_wrench', 2], ['bucket', 2], ['iron_hoe', 1], ['copper_wire', 16], ['meteoric_iron', 1]]);
    for (const [x, y, z] of [[87, F, 86], [87, F + 1, 86], [88, F, 86]]) b.set(x, y, z, 'copper_block');
    b.set(87, F, 87, 'iron_block');
    for (const [x, z] of [[87, 92], [87, 99], [92, 86], [94, 97], [91, 101], [97, 101], [90, 94], [97, 92]]) kit.stand(x, F, z);
    kit.sign(88, F, 94, 'w', 'Fragua y fundición // Del mineral se saca el metal: hierro, cobre, estaño y oro.', 'Forge and foundry: metal is won from ore here: iron, copper, tin and gold.');
}

// The hall of minerals (the science room): cases of rocks and minerals along two walls, each with its
// label; signs on the three families of rocks, on the columns of basalt and on fossils; a model of basalt
// columns; chests of samples; a microscope.
const PALACE_VOLCANIC_SAMPLES = [
    // Along the west wall (x 43), from the door of the stair hall: [block, Spanish, English].
    ['basalt', 'Basalto // Ígnea: lava que se enfrió deprisa, en la superficie. Grano muy fino.', 'Basalt: igneous. Lava that cooled fast at the surface. Very fine grain.'],
    ['granite', 'Granito // Ígnea: magma que se enfrió despacio, muy hondo. Por eso sus cristales son grandes.', 'Granite: igneous. Magma that cooled slowly, deep down, so its crystals grew big.'],
    ['obsidian', 'Obsidiana // Ígnea: lava que se enfrió tan deprisa que no formó cristales. Es un vidrio.', 'Obsidian: igneous. Lava that cooled so fast it made no crystals. It is a glass.'],
    ['magma_rock', 'Roca de magma // Roca tan caliente que brilla. Al enfriarse será basalto.', 'Magma rock: rock so hot it glows. When it cools it will be basalt.'],
    ['limestone', 'Caliza // Sedimentaria: conchas de animales marinos apretadas en capas.', 'Limestone: sedimentary. Shells of sea animals pressed into layers.'],
    ['sandstone', 'Arenisca // Sedimentaria: granos de arena pegados, capa sobre capa.', 'Sandstone: sedimentary. Grains of sand cemented together, layer on layer.'],
    ['sand', 'Arena // Roca rota en granos por el agua y el viento. Con el tiempo, arenisca.', 'Sand: rock broken into grains by water and wind. In time, sandstone.'],
    ['coal_ore', 'Carbón // Sedimentaria: restos de plantas enterradas hace millones de años.', 'Coal: sedimentary. Remains of plants buried millions of years ago.'],
    ['marble', 'Mármol // Metamórfica: caliza transformada por el calor y la presión.', 'Marble: metamorphic. Limestone changed by heat and pressure.'],
    ['slate', 'Pizarra // Metamórfica: barro apretado y calentado. Se parte en láminas.', 'Slate: metamorphic. Mud squeezed and heated. It splits into sheets.'],
    ['iron_ore', 'Mena de hierro // Roca con hierro. En el horno se separa el metal.', 'Iron ore: rock with iron in it. A furnace sets the metal free.'],
    ['copper_ore', 'Mena de cobre // Roca con cobre, a veces con manchas verdes.', 'Copper ore: rock with copper, sometimes with green stains.'],
    ['gold_ore', 'Mena de oro // El oro casi no se mezcla con nada: está en la roca como metal puro.', 'Gold ore: gold hardly mixes with anything, so it sits in the rock as pure metal.'],
    ['tin_ore', 'Mena de estaño // Estaño y cobre juntos dan el bronce.', 'Tin ore: tin and copper together make bronze.']
];
// Along the north wall (z 101): the elements that the rocks are made of.
const PALACE_VOLCANIC_ELEMENTS = [
    ['element_si', 'Silicio // Con el oxígeno forma casi todas las rocas de la corteza.', 'Silicon: with oxygen it makes almost every rock of the crust.'],
    ['element_fe', 'Hierro // El metal de la mena de hierro, y del centro de la Tierra.', 'Iron: the metal of iron ore, and of the centre of the Earth.'],
    ['element_cu', 'Cobre // El metal de la mena de cobre.', 'Copper: the metal of copper ore.'],
    ['element_sn', 'Estaño // El metal de la mena de estaño.', 'Tin: the metal of tin ore.'],
    ['element_au', 'Oro // El metal que ya está puro en la roca.', 'Gold: the metal found already pure in the rock.'],
    ['element_ag', 'Plata // Otro metal precioso de las menas.', 'Silver: another precious metal of ores.'],
    ['element_s', 'Azufre // Sale amarillo por las grietas de los volcanes. Huele a huevo podrido.', 'Sulfur: it comes out yellow from volcanic vents. It smells of rotten eggs.']
];

function constructionPalaceVolcanicMineralHall(b, kit) {
    const GF = PALACE_VOLCANIC_GF;
    const F = GF + 1;
    const UF = PALACE_VOLCANIC_1F;
    kit.causeway(43, 85, 53, 101, GF, 'granite', 'obsidian', 2);
    // A case: the sample on a plinth of obsidian, glass over and in front of it, its label below.
    const caseAt = (x, z, [fx, fz], facing, [type, es, en]) => {
        b.set(x, F, z, 'obsidian');
        b.set(x, F + 1, z, type);
        b.set(x, F + 2, z, 'glass');
        b.set(x + fx, F + 1, z + fz, 'glass_pane');
        b.set(x + fx, F + 2, z + fz, 'glass_pane');
        kit.sign(x + fx, F, z + fz, facing, es, en, 'wall');
    };
    PALACE_VOLCANIC_SAMPLES.forEach((sample, i) => caseAt(43, 86 + i, [1, 0], 'e', sample));
    PALACE_VOLCANIC_ELEMENTS.forEach((sample, i) => caseAt(46 + i, 101, [0, -1], 'n', sample));
    kit.fill(43, F + 3, 86, 43, UF - 1, 99, 'obsidian');
    kit.fill(46, F + 3, 101, 52, F + 3, 101, 'obsidian');
    // The families of rocks, on the east wall.
    const lessons = [
        [86, 'Tres familias de rocas // Ígneas: lava o magma enfriados. Sedimentarias: capas de arena, barro o conchas. Metamórficas: cambiadas por calor y presión.', 'Three families: igneous (cooled lava), sedimentary (layers of sand, mud, shells), metamorphic (changed by heat and pressure).'],
        [88, 'Rocas ígneas // Basalto: se enfrió deprisa fuera. Granito: despacio, muy hondo. Obsidiana: tan deprisa que es vidrio.', 'Igneous rocks. Basalt: cooled fast outside. Granite: slowly, deep down. Obsidian: so fast it is glass.'],
        [96, 'Rocas sedimentarias // Arena, barro y conchas se depositan en capas. Con el peso de las de arriba se vuelven roca.', 'Sedimentary rocks: sand, mud and shells settle in layers; the weight above turns them to rock.'],
        [98, 'Rocas metamórficas // El calor y la presión cambian una roca sin fundirla: la caliza se vuelve mármol.', 'Metamorphic rocks: heat and pressure change a rock without melting it; limestone becomes marble.'],
        [100, '¿Qué es un fósil? // Un ser vivo enterrado en barro. En millones de años, los minerales lo vuelven piedra.', 'What is a fossil? A living thing buried in mud. Over millions of years, minerals turn it to stone.']
    ];
    for (const [z, es, en] of lessons) kit.sign(53, F + 1, z, 'w', es, en, 'wall');
    // A model of basalt columns, with its sign.
    kit.bundle(48, 89, F, [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]], 0, 3, 12);
    kit.sign(50, F, 91, 'e', 'Columnas de basalto // Al enfriarse, la lava encoge y se agrieta en prismas de seis lados, como el barro al secarse.', 'Basalt columns: cooling lava shrinks and cracks into six-sided prisms, like mud drying.');
    // Chests of samples, each labelled on its lid.
    const samples = [
        [95, [['pyrite', 6], ['fluorite', 6], ['meteoric_iron', 2], ['gold_ore', 3]], 'Pirita y fluorita // Pirita: hierro y azufre, el oro de los tontos. Fluorita: calcio y flúor. Y hierro de un meteorito.', 'Pyrite (iron and sulfur, fool\'s gold), fluorite (calcium and fluorine) and iron from a meteorite.'],
        [96, [['fossil_trilobite', 2], ['fossil_ammonite', 2], ['amber', 3], ['limestone', 8]], 'Fósiles y ámbar // Trilobites y amonites del mar antiguo. El ámbar es resina de árbol endurecida.', 'Fossils and amber: trilobites and ammonites of ancient seas. Amber is hardened tree resin.'],
        [97, [['basalt', 8], ['granite', 8], ['obsidian', 8], ['marble', 8], ['limestone', 8], ['sandstone', 8]], 'Rocas para llevarse // Una de cada familia.', 'Rocks to take: one of each family.']
    ];
    for (const [z, items, es, en] of samples) {
        kit.chest(46, F, z, 'e', items);
        kit.sign(46, F + 1, z, 'e', es, en);
    }
    // The microscope on its desk, and the instruments of a geologist.
    kit.piece(51, F, 97, 'desk', 'desk', 'w');
    kit.microscope(51, F + 1, 97, 'w');
    b.set(50, F, 97, 'stool');
    b.set(51, F, 96, 'table');
    kit.tabletop(51, F + 1, 96, 'open_book', 'w');
    kit.chest(52, F, 99, 'w', [['measuring_tape', 2], ['thermometer', 2], ['glass_slide', 8], ['test_tube', 4], ['blueprint', 2]]);
    for (const [x, z] of [[52, 85], [45, 85], [52, 92], [48, 94], [45, 99], [48, 86], [53, 101]]) kit.stand(x, F, z);
    for (const z of [88, 93, 98]) kit.hang(47, UF - 1, z);
    kit.sign(52, F, 94, 'e', 'Sala de los minerales // Rocas ígneas, sedimentarias y metamórficas, minerales y fósiles.', 'Hall of minerals: igneous, sedimentary and metamorphic rocks, minerals and fossils.');
}

// ---------------------------------------------------------------------------------------
// The throne room, two floors high, at the back on the axis.

function constructionPalaceVolcanicThroneRoom(b, kit) {
    const GF = PALACE_VOLCANIC_GF;
    const F = GF + 1;
    const RF = PALACE_VOLCANIC_ROOF;
    const mid = PALACE_VOLCANIC_MID;
    kit.causeway(55, 88, 85, 101, GF, 'granite', 'basalt', 2.2);
    for (let z = 88; z <= 94; z++) {
        b.set(mid - 8, GF, z, 'magma_rock');
        b.set(mid + 8, GF, z, 'magma_rock');
        for (let x = mid - 1; x <= mid + 1; x++) b.set(x, F, z, 'red_carpet');
    }
    // The dais: steps of red tile up to a platform, columns at its sides, the throne of obsidian.
    kit.fill(mid - 7, F, 97, mid + 7, F + 1, 101, (x, y, z) => (y === F + 1 && (z === 97 || Math.abs(x - mid) === 7) ? 'obsidian' : 'black_brick'));
    kit.flight(mid - 5, F, 95, 's', 2, 11, [1, 0], F, 'red_glazed_tile_stairs');
    b.sym(() => {
        kit.bundle(mid - 6, 95, F, [[0, 0], [-1, 0], [0, 1], [-1, 1]], 1, 4, 13);
        kit.piece(mid - 3, F + 2, 99, 'red_sofa', 'sofa', 'n');
        b.set(mid - 4, F + 2, 100, 'gold_block');
        kit.stand(mid - 4, F + 3, 100);
        kit.stand(mid - 6, F + 2, 98);
    });
    kit.throne(mid, F + 2, 99, 'n');
    kit.stand(mid - 2, F + 2, 98);
    kit.stand(mid + 2, F + 2, 98);
    for (let x = mid - 1; x <= mid + 1; x++) b.set(x, F + 2, 98, 'red_carpet');
    // Behind it, columns like organ pipes, highest in the middle, glowing and gilded at the top.
    for (let x = mid - 7; x <= mid + 7; x++) {
        const dx = Math.abs(x - mid);
        const top = Math.min(RF - 2, F + 5 + (7 - dx) + Math.floor(constructionPalaceHash(x, 5, 101, 14) * 2));
        kit.fill(x, F + 2, 101, x, top, 101, 'basalt');
        b.set(x, top, 101, dx === 0 ? 'gold_block' : dx % 2 ? 'basalt' : 'magma_rock');
    }
    // Two rows of columns, banners, busts, lanterns.
    b.sym(() => {
        for (const z of [90, 94, 98]) kit.column(59, z, F, RF - 1);
        for (const z of [90, 98]) {
            kit.banner(55, F + 5, z, 'red', 'e');
            kit.banner(55, F + 4, z, 'orange', 'e');
        }
        kit.banner(55, F + 5, 94, 'orange', 'e');
        kit.banner(55, F + 4, 94, 'red', 'e');
        kit.piece(mid - 6, F, 88, 'statue', 'statue', 's');
        for (const z of [89, 93, 97, 101]) kit.stand(56, F, z);
        for (const z of [89, 93]) kit.stand(mid - 4, F, z);
        kit.stand(61, F, 96);
        for (const z of [91, 95]) b.set(mid - 5, RF - 1, z, 'chandelier');
    });
    b.set(mid, RF - 1, 92, 'chandelier');
    kit.sign(mid - 3, F, 88, 'n', 'Salón del trono', 'Throne room');
}

// The washroom of a bedroom of the west wing (drawn mirrored for the east): x 43 to 46, z z0 to z0 + 2, its
// door at x 45 in the wall in front. A tub along that wall, a toilet under the window, a basin under a mirror.
function constructionPalaceVolcanicWashroom(b, kit, z0, F) {
    kit.bathtub(43, F, z0, 'e');
    kit.piece(43, F, z0 + 2, 'toilet', 'toilet', 'e');
    kit.piece(46, F, z0 + 2, 'sink', 'sink', 'w');
    kit.piece(46, F + 1, z0 + 2, 'wall_mirror', 'wall_mirror', 'w');
    kit.barrel(46, F, z0, [['white_wool', 4], ['cold_water', 2]]);
    kit.stand(46, F + 1, z0);
}

// ---------------------------------------------------------------------------------------
// The first floor: servants, library and guest suite in front; a corridor and four rooms in each wing.

function constructionPalaceVolcanicFirstFloor(b, kit) {
    const UF = PALACE_VOLCANIC_1F;
    const F = UF + 1;
    const RF = PALACE_VOLCANIC_ROOF;
    const mid = PALACE_VOLCANIC_MID;
    const { curtain, floorLamp } = kit.furn;
    const lamp = (x, z) => {
        kit.piece(x, F, z, 'bedside_table', 'bedside_table', 'n');
        b.set(x, F + 1, z, 'table_lamp');
    };

    // The servants' room: three beds, wardrobes, their table, and their washroom in the corner.
    for (const z of [50, 52, 54]) kit.bed(43, F, z, 'w');
    kit.wardrobe(47, F, 49, 's');
    kit.wardrobe(48, F, 49, 's');
    kit.chest(51, F, 49, 's', [['white_wool', 12], ['red_wool', 6], ['bread', 8], ['candle', 8]]);
    kit.barrel(53, F, 49, [['wheat', 16], ['cold_water', 4], ['bread', 6]]);
    kit.fill(49, F, 55, 51, F, 55, 'table');
    b.set(50, F, 54, 'stool');
    b.set(52, F, 56, 'stool');
    kit.stand(49, F + 1, 55);
    kit.tabletop(50, F + 1, 55, 'meal_plate');
    kit.tabletop(51, F + 1, 55, 'jug');
    for (const [x, z] of [[53, 52], [43, 51], [48, 59], [46, 53]]) kit.stand(x, F, z);
    kit.sign(51, F, 58, 'w', 'Cuarto del servicio', 'Servants\' room');
    // Their washroom: a tub, a basin, a toilet, a barrel of towels and water.
    kit.bathtub(44, F, 56, 'e');
    kit.piece(43, F, 57, 'sink', 'sink', 'e');
    kit.piece(43, F, 59, 'toilet', 'toilet', 'e');
    kit.barrel(46, F, 59, [['white_wool', 8], ['cold_water', 4]]);
    kit.stand(46, F + 1, 59);

    // The library: shelves on every wall, rows of shelves, a long reading table with lamps, a globe and an
    // astrolabe.
    kit.fill(55, UF, 49, 85, UF, 59, (x, y, z) => ((x + z) % 2 ? 'dark_oak_planks' : 'spruce_planks'));
    const shelf = (x, z, facing, height = 3) => {
        for (let y = F; y < F + height; y++) kit.piece(x, y, z, 'bookshelf', 'bookshelf', facing);
    };
    b.sym(() => {
        for (const x of [55, 56, 60, 61, 62, 66, 67, 68]) shelf(x, 49, 's');
        for (const x of [55, 56, 57, 58, 59, 65, 66, 67, 68]) shelf(x, 59, 'n');
        for (let z = 52; z <= 56; z++) {
            shelf(60, z, 'w', 2);
            shelf(61, z, 'e', 2);
        }
        kit.piece(mid - 2, F, 53, 'dark_oak_chair', 'chair', 's');
        kit.piece(mid - 4, F, 53, 'dark_oak_chair', 'chair', 's');
        kit.piece(mid - 2, F, 55, 'dark_oak_chair', 'chair', 'n');
        kit.piece(mid - 4, F, 55, 'dark_oak_chair', 'chair', 'n');
        b.set(mid - 3, F + 1, 54, 'table_lamp');
        for (const [x, z] of [[57, 51], [57, 57], [64, 51], [64, 57], [58, 54], [63, 54]]) kit.stand(x, F, z);
        kit.banner(55, F + 3, 52, 'red', 'e');
    });
    kit.fill(mid - 5, F, 54, mid + 5, F, 54, 'table');
    kit.piece(mid, F + 1, 54, 'astrolabe', 'astrolabe', 's');
    // Readers have left their books open, a pile to go back to, a scroll and a note half written.
    kit.tabletop(mid - 4, F + 1, 54, 'open_book', 'n');
    kit.tabletop(mid - 1, F + 1, 54, 'scroll', 's');
    kit.tabletop(mid + 2, F + 1, 54, 'inkwell', 's');
    kit.tabletop(mid + 5, F + 1, 54, 'book_stack', 'n');
    kit.piece(mid + 4, F, 55, 'dark_oak_chair', 'chair', 'e');
    b.set(mid, F, 51, 'globe');
    for (let z = 49; z <= 59; z++) {
        for (let x = mid - 1; x <= mid + 1; x++) {
            if (z !== 54 && !(x === mid && z === 51)) b.set(x, F, z, 'red_carpet');
        }
    }
    kit.chest(mid - 2, F, 58, 'n', [['star_chart', 4], ['blueprint', 6], ['breeding_notebook', 2], ['candle', 12]]);
    kit.chest(mid + 2, F, 58, 'n', [['telescope', 1], ['barometer', 1], ['thermometer', 1], ['measuring_tape', 2], ['globe', 1], ['sundial', 1]]);
    kit.sign(mid + 3, F, 50, 's', 'Biblioteca', 'Library');
    kit.stand(mid - 2, F, 50);
    kit.stand(mid + 2, F, 50);

    // The guest suite (east, in front). The bedroom: a bed between lamps, a desk, a chest.
    kit.fill(93, F, 50, 95, F, 53, 'orange_carpet');
    kit.bed(97, F, 52, 'e');
    lamp(97, 51);
    lamp(97, 53);
    kit.wardrobe(92, F, 49, 's');
    kit.piece(94, F, 49, 'desk', 'desk', 's');
    kit.piece(94, F, 50, 'dark_oak_chair', 'chair', 'n');
    kit.tabletop(94, F + 1, 49, 'inkwell', 's');
    kit.chest(97, F, 54, 'w', [['red_wool', 6], ['warm_coat', 1], ['bread', 4], ['candle', 4]]);
    for (const [x, z] of [[92, 51], [95, 54]]) kit.stand(x, F, z);
    // The dressing room: wardrobes, a chest of clothes, a mirror, a stool.
    kit.wardrobe(87, F, 49, 's');
    kit.wardrobe(88, F, 49, 's');
    kit.chest(90, F, 49, 's', [['white_wool', 8], ['fur', 2], ['leather', 2]]);
    kit.piece(87, F + 1, 53, 'wall_mirror', 'wall_mirror', 'e');
    b.set(88, F, 53, 'stool');
    kit.tabletop(88, F, 52, 'sewing_basket', 'e');
    kit.stand(90, F, 54);
    kit.stand(87, F, 51);
    // The antechamber: a sofa, a table for two, the painting.
    kit.piece(87, F, 58, 'red_sofa', 'sofa', 'e');
    b.set(90, F, 58, 'table');
    kit.piece(89, F, 58, 'dark_oak_chair', 'chair', 'e');
    kit.piece(91, F, 59, 'dark_oak_chair', 'chair', 'w');
    kit.piece(90, F + 2, 59, 'painting_sunset', 'painting', 'n');
    kit.stand(92, F, 59);
    kit.hang(89, RF - 1, 57);
    kit.tabletop(90, F + 1, 58, 'chessboard', 'e');
    kit.sign(87, F, 56, 'e', 'Cuarto de invitados', 'Guest room');
    // The washroom: a bath, a basin under a mirror, a toilet.
    kit.bathtub(96, F, 56, 'e');
    kit.piece(94, F, 59, 'sink', 'sink', 'n');
    kit.piece(94, F + 1, 59, 'wall_mirror', 'wall_mirror', 'n');
    kit.piece(97, F, 59, 'toilet', 'toilet', 'w');
    kit.hang(95, RF - 1, 58);

    // The corridors of the wings.
    b.sym(() => {
        for (const z of [62, 70, 81, 90, 99]) kit.stand(53, F, z);
        kit.banner(51, F + 2, 101, 'red', 'n');
    });

    // The bedrooms. West: A (z 61 to 70), B (72 to 77), C (85 to 91), D (93 to 101). East: E, F, the
    // study G, and H.
    const room = (x0, x1, z0, z1, carpet) => kit.fill(x0 + 1, F, z0 + 1, x1 - 1, F, z1 - 1, `${carpet}_carpet`);
    // A: two beds; behind it, its washroom and a closet.
    room(44, 49, 61, 66, 'red');
    kit.bed(43, F, 63, 'w');
    kit.bed(43, F, 65, 'w');
    lamp(43, 62);
    lamp(43, 64);
    lamp(43, 66);
    kit.wardrobe(49, F, 62, 'w');
    kit.tabletop(43, F + 1, 64, 'book_stack', 'e');
    kit.chest(47, F, 61, 's', [['red_wool', 8], ['warm_coat', 1], ['candle', 4]]);
    kit.piece(46, F + 2, 61, 'painting_peaks', 'painting', 's');
    for (const [x, z] of [[49, 64], [45, 61]]) kit.stand(x, F, z);
    constructionPalaceVolcanicWashroom(b, kit, 68, F);
    kit.wardrobe(49, F, 69, 'w');
    kit.chest(49, F, 70, 'w', [['white_wool', 6], ['fur', 2], ['candle', 4]]);
    kit.hang(48, RF - 1, 69);
    // B: one bed and a desk.
    kit.bed(43, F, 74, 'w');
    lamp(43, 73);
    kit.wardrobe(49, F, 72, 'w');
    kit.piece(46, F, 77, 'desk', 'desk', 'n');
    kit.piece(46, F, 76, 'dark_oak_chair', 'chair', 'e');
    kit.tabletop(46, F + 1, 77, 'inkwell', 'n');
    kit.chest(43, F, 77, 'e', [['yellow_wool', 8], ['feather', 6], ['candle', 4]]);
    for (const [x, z] of [[49, 77], [45, 72]]) kit.stand(x, F, z);
    // C: one bed.
    kit.bed(43, F, 87, 'w');
    lamp(43, 86);
    kit.wardrobe(49, F, 85, 'w');
    kit.chest(43, F, 91, 'e', [['blue_wool', 6], ['fur', 2], ['honey_bottle', 2]]);
    room(44, 49, 85, 91, 'orange');
    b.set(47, F, 89, 'table');
    kit.piece(47, F, 90, 'dark_oak_chair', 'chair', 'n');
    kit.tabletop(47, F + 1, 89, 'jug');
    for (const [x, z] of [[49, 91], [45, 85]]) kit.stand(x, F, z);
    // D: two beds, a sofa, a painting; behind it, its washroom and a linen closet.
    kit.bed(43, F, 94, 'w');
    kit.bed(43, F, 96, 'w');
    lamp(43, 93);
    lamp(43, 95);
    lamp(43, 97);
    kit.wardrobe(49, F, 93, 'w');
    kit.tabletop(43, F + 1, 95, 'open_book', 'e');
    kit.chest(47, F, 93, 's', [['white_wool', 8], ['leather', 3], ['candle', 6]]);
    kit.piece(47, F, 97, 'black_sofa', 'sofa', 'n');
    kit.piece(47, F + 2, 97, 'painting_night', 'painting', 'n');
    for (const [x, z] of [[49, 95], [45, 93]]) kit.stand(x, F, z);
    constructionPalaceVolcanicWashroom(b, kit, 99, F);
    kit.chest(49, F, 100, 'w', [['white_wool', 12], ['red_wool', 6], ['candle', 6]]);
    kit.chest(49, F, 101, 'w', [['blue_wool', 8], ['yellow_wool', 8], ['fur', 2]]);
    kit.hang(48, RF - 1, 100);
    // E: two beds; behind it, its washroom and a closet.
    room(90, 97, 61, 66, 'orange');
    kit.bed(97, F, 63, 'e');
    kit.bed(97, F, 65, 'e');
    lamp(97, 62);
    lamp(97, 64);
    lamp(97, 66);
    kit.wardrobe(91, F, 62, 'e');
    kit.tabletop(97, F + 1, 64, 'fruit_bowl');
    kit.chest(93, F, 61, 's', [['blue_wool', 8], ['warm_coat', 1], ['candle', 4]]);
    for (const [x, z] of [[91, 64], [95, 61]]) kit.stand(x, F, z);
    b.sym(() => {
        if (b.flipped) constructionPalaceVolcanicWashroom(b, kit, 68, F);
    });
    kit.wardrobe(91, F, 69, 'e');
    kit.chest(91, F, 70, 'e', [['green_wool', 6], ['leather', 2], ['candle', 4]]);
    kit.hang(92, RF - 1, 69);
    // F: one bed.
    kit.bed(97, F, 74, 'e');
    lamp(97, 73);
    kit.wardrobe(91, F, 72, 'e');
    kit.chest(97, F, 77, 'w', [['green_wool', 6], ['fishing_rod', 1], ['feather', 4]]);
    kit.piece(94, F, 76, 'dark_oak_chair', 'chair', 'w');
    kit.tabletop(93, F, 76, 'sewing_basket', 'w');
    for (const [x, z] of [[91, 77], [95, 72]]) kit.stand(x, F, z);
    // G: the study, with books, a globe and an astrolabe.
    for (const z of [85, 86, 87]) {
        kit.piece(97, F, z, 'bookshelf', 'bookshelf', 'w');
        kit.piece(97, F + 1, z, 'bookshelf', 'bookshelf', 'w');
    }
    kit.piece(94, F, 89, 'desk', 'desk', 'w');
    kit.piece(95, F, 89, 'dark_oak_chair', 'chair', 'w');
    b.set(94, F + 1, 89, 'table_lamp');
    b.set(94, F, 88, 'table');
    kit.tabletop(94, F + 1, 88, 'scroll', 'w');
    b.set(92, F, 86, 'globe');
    kit.piece(97, F, 91, 'astrolabe', 'astrolabe', 'w');
    kit.chest(91, F, 91, 'e', [['blueprint', 4], ['star_chart', 2], ['measuring_tape', 1], ['candle', 6]]);
    for (const [x, z] of [[91, 85], [96, 91], [93, 91]]) kit.stand(x, F, z);
    // H: a bed, a sofa; behind it, its washroom and a closet.
    room(91, 97, 92, 98, 'red');
    kit.bed(97, F, 95, 'e');
    lamp(97, 94);
    lamp(97, 96);
    kit.wardrobe(91, F, 93, 'e');
    kit.chest(93, F, 93, 's', [['red_wool', 6], ['fur', 2], ['candle', 4]]);
    kit.piece(94, F, 97, 'red_sofa', 'sofa', 'n');
    b.set(94, F, 96, 'table');
    kit.tabletop(94, F + 1, 96, 'meal_plate');
    floorLamp(96, F, 97);

    // Curtains on the windows of the rooms; none in the stair halls, the corridors or over the throne room.
    // The washrooms' are white.
    const washrooms = { west: [57, 69, 99], east: [57, 69, 99], front: [], back: [44, 94] };
    const corridors = { west: [81], east: [81], front: [], back: [51, 57, 81, 87] };
    for (const [face, at, facing, color, salt] of [['west', 43, 'e', 'red', 41], ['east', 97, 'w', 'orange', 42], ['front', 49, 's', 'red', 43], ['back', 101, 'n', 'red', 44]]) {
        for (const [u0, u1] of PALACE_VOLCANIC_WINDOWS[face].first) {
            if (corridors[face].includes(u0)) continue;
            const cells = [];
            for (let u = u0; u <= u1; u++) cells.push(face === 'west' || face === 'east' ? [at, u] : [u, at]);
            kit.drape(cells, F + 1, F + 3, washrooms[face].includes(u0) ? 'white' : color, facing, salt);
        }
    }
    for (const [x, z] of [[96, 93], [92, 95]]) kit.stand(x, F, z);
    b.sym(() => {
        if (b.flipped) constructionPalaceVolcanicWashroom(b, kit, 99, F);
    });
    kit.wardrobe(91, F, 100, 'e');
    kit.chest(91, F, 101, 'e', [['white_wool', 8], ['leather', 2], ['candle', 4]]);
    kit.hang(92, RF - 1, 100);
}

// ---------------------------------------------------------------------------------------
// The roof: gardens of hardy plants in beds of ash soil, seats of columns and lamps.

function constructionPalaceVolcanicRoof(b, kit) {
    const RF = PALACE_VOLCANIC_ROOF;
    const T = RF + 1;
    const put = constructionPalacePut(b);
    // The inner parapet, round the open terrace over the courtyard's gallery.
    for (let x = 54; x <= 86; x++) {
        b.set(x, T, 60, 'obsidian');
        b.set(x, T, 87, 'obsidian');
    }
    for (let z = 60; z <= 87; z++) {
        b.set(54, T, z, 'obsidian');
        b.set(86, T, z, 'obsidian');
    }
    // A bed of ash soil with an edge of obsidian, and hardy plants in it.
    const bed = (x0, z0, x1, z1, salt) => {
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                const edge = x === x0 || x === x1 || z === z0 || z === z1;
                b.set(x, T, z, edge ? 'obsidian' : constructionPalacePick([['dirt', 3], ['moss', 2]], x, T, z, salt));
                if (edge) continue;
                const roll = constructionPalaceHash(x, T, z, salt);
                if (roll < 0.3) put(x, T + 1, z, 'dark_oak_leaves', true);
                else if (roll < 0.5) put(x, T + 1, z, 'tall_grass', true);
                else if (roll < 0.58) put(x, T + 1, z, roll < 0.54 ? 'flower_red' : 'flower_yellow', true);
            }
        }
    };
    b.sym(() => {
        bed(45, 63, 50, 75, 21);
        bed(45, 87, 50, 99, 22);
        bed(57, 50, 64, 57, 23);
        bed(57, 91, 61, 100, 24);
        // A charred trunk in each long bed, seats of columns, lamps.
        constructionPalaceTree(put, 'charred', 47, T + 1, 69, 25);
        constructionPalaceTree(put, 'charred', 48, T + 1, 93, 26);
        kit.bundle(52, 70, T, [[0, 0], [0, 1], [0, 2]], 0, 1, 15);
        kit.bundle(66, 52, T, [[0, 0], [1, 0], [0, 1]], 0, 1, 16);
        for (const [x, z] of [[44, 50], [44, 62], [44, 76], [52, 86], [44, 100], [56, 89], [56, 101], [52, 58]]) {
            b.set(x, T, z, 'dark_oak_fence');
            kit.stand(x, T + 1, z);
        }
    });
    kit.barrel(PALACE_VOLCANIC_MID, T, 50, [['fertilizer', 6], ['spruce_sapling', 4], ['acacia_sapling', 4], ['water_bucket', 2]]);
}

// ---------------------------------------------------------------------------------------
// The keep: a hexagon with its points front and back on the roof of the throne room. A stair winds round a
// pier inside it past the antechamber, the royal bedchamber, the observatory and the watch room, up to a
// platform crowned by pinnacles that glow and a canopy of copper and gold over the head of the stair.

function constructionPalaceVolcanicKeep(b, kit) {
    const [cx, cz] = PALACE_VOLCANIC_KEEP;
    const floors = PALACE_VOLCANIC_KEEP_FLOORS;
    const base = floors[0];
    const last = floors[floors.length - 1];
    for (let z = cz - 9; z <= cz + 9; z++) {
        for (let x = cx - 9; x <= cx + 9; x++) {
            const h = constructionPalaceVolcanicHexPointed(x - cx, z - cz);
            if (h > 8) continue;
            if (h > 6.5) {
                for (let y = base + 1; y < last; y++) b.set(x, y, z, floors.includes(y) ? 'obsidian' : kit.masonry(x, y, z));
                b.set(x, last, z, 'copper_block');
                b.set(x, last + 1, z, kit.masonry(x, last + 1, z));
                if ((x + z) % 2 === 0) b.set(x, last + 2, z, kit.masonry(x, last + 2, z));
            } else {
                for (const y of floors) {
                    if (y !== base) b.set(x, y, z, y === last ? 'black_brick' : 'dark_oak_planks');
                }
            }
        }
    }
    for (const y of floors) {
        if (y !== base) kit.fill(cx - 2, y, cz - 2, cx + 2, y, cz + 2, null);
    }
    constructionCastleSpiral(b, cx - 2, cz - 2, base, last, PALACE_VOLCANIC_STAIR, 'black_brick');
    kit.fill(cx - 1, last, cz - 1, cx + 1, last, cz + 1, 'black_brick');
    // The door from the roof, and windows on all six faces of every floor.
    b.door(cx - 6, base + 1, cz, 'dark_oak_door', 'e');
    floors.slice(0, -1).forEach((y, i) => {
        const glass = i % 2 ? 'red_stained_glass_pane' : 'orange_stained_glass_pane';
        for (const [x, z] of [[cx - 6, cz], [cx + 6, cz], [cx - 3, cz - 6], [cx + 3, cz - 6], [cx - 3, cz + 6], [cx + 3, cz + 6]]) {
            if (y === base && x === cx - 6) continue;
            kit.fill(x, y + 2, z, x, y + 3, z, glass);
        }
        // Light: a lantern on the floor in four corners, two hanging from the floor above.
        for (const [x, z] of [[cx - 4, cz - 3], [cx + 4, cz - 3], [cx - 4, cz + 3], [cx + 4, cz + 3]]) kit.stand(x, y + 1, z);
        for (const [x, z] of [[cx, cz - 5], [cx, cz + 5], [cx - 3, cz]]) kit.hang(x, floors[i + 1] - 1, z);
    });
    const [ante, chamber, observatory, watch] = floors.map((y) => y + 1);
    // The antechamber: banners, busts, a bench.
    for (const z of [cz - 2, cz + 2]) {
        kit.banner(cx - 5, ante + 2, z, 'red', 'e');
        kit.banner(cx + 5, ante + 2, z, 'orange', 'w');
    }
    kit.piece(cx, ante, cz - 5, 'statue', 'statue', 's');
    kit.piece(cx, ante, cz + 5, 'statue', 'statue', 'n');
    kit.furn.benches(cx + 4, cx + 4, ante, cz, 'w');
    kit.sign(cx - 4, ante, cz - 2, 'e', 'Torre del homenaje // Sube: el dormitorio real, el observatorio, la guardia y la corona.', 'The keep. Up: the royal bedchamber, the observatory, the watch and the crown.');
    // The royal bedchamber.
    kit.bed(cx + 5, chamber, cz - 1, 'e');
    kit.bed(cx + 5, chamber, cz, 'e');
    for (const z of [cz - 2, cz + 1]) {
        kit.piece(cx + 5, chamber, z, 'bedside_table', 'bedside_table', 'w');
        b.set(cx + 5, chamber + 1, z, 'table_lamp');
    }
    kit.wardrobe(cx - 4, chamber, cz - 4, 'e');
    kit.wardrobe(cx - 4, chamber, cz + 4, 'e');
    kit.chest(cx, chamber, cz - 5, 's', [['red_wool', 12], ['fur', 4], ['warm_coat', 2], ['gold_leaf', 4]]);
    kit.fill(cx + 3, chamber, cz - 2, cx + 3, chamber, cz + 1, 'red_carpet');
    kit.banner(cx + 6 - 1, chamber + 3, cz + 3, 'red', 'w');
    kit.piece(cx, chamber, cz + 5, 'red_sofa', 'sofa', 'n');
    b.set(cx, chamber, cz + 4, 'table');
    kit.tabletop(cx, chamber + 1, cz + 4, 'fruit_bowl');
    kit.tabletop(cx + 5, chamber + 1, cz - 2, 'open_book', 'w');
    // Curtains at the two windows of the flat sides: one drawn, one open.
    for (const y of [chamber + 1, chamber + 2]) {
        kit.furn.curtain(cx + 5, y, cz, 'red', 'w', 'closed');
        kit.furn.curtain(cx - 5, y, cz, 'red', 'e', 'open');
    }
    // The observatory: a desk with its chair, a globe, an astrolabe and the instruments.
    kit.piece(cx + 4, observatory, cz - 2, 'desk', 'desk', 'w');
    kit.piece(cx + 3, observatory, cz - 2, 'dark_oak_chair', 'chair', 'e');
    b.set(cx + 4, observatory + 1, cz - 2, 'table_lamp');
    b.set(cx + 4, observatory, cz - 1, 'table');
    kit.tabletop(cx + 4, observatory + 1, cz - 1, 'scroll', 'w');
    b.set(cx - 4, observatory, cz - 1, 'globe');
    kit.piece(cx - 4, observatory, cz + 1, 'astrolabe', 'astrolabe', 'e');
    kit.chest(cx, observatory, cz - 5, 's', [['telescope', 1], ['star_chart', 6], ['barometer', 1], ['anemometer', 1], ['thermometer', 1]]);
    kit.sign(cx + 4, observatory, cz + 2, 'w', 'Observatorio', 'Observatory');
    // The watch room: benches, a chest of lights, a barrel.
    kit.furn.benches(cx - 4, cx - 4, watch, cz - 1, 'e');
    kit.piece(cx - 4, watch, cz + 1, 'bench', 'bench', 'e');
    b.set(cx - 4, watch, cz, 'table');
    kit.tabletop(cx - 4, watch + 1, cz, 'chessboard', 'e');
    kit.chest(cx, watch, cz + 5, 'n', [['candle', 16], ['lantern', 4], ['torch', 32], ['glow_dust', 8]]);
    kit.barrel(cx + 4, watch, cz + 2, [['bread', 8], ['cold_water', 6]]);
    // The platform: rails round the stairwell, a pinnacle at each point, the canopy over the stair.
    const top = last + 1;
    kit.fill(cx - 3, top, cz - 2, cx - 3, top, cz + 1, 'iron_bars');
    kit.fill(cx - 2, top, cz - 3, cx + 2, top, cz - 3, 'iron_bars');
    kit.fill(cx + 3, top, cz - 2, cx + 3, top, cz + 2, 'iron_bars');
    kit.fill(cx, top, cz + 3, cx + 2, top, cz + 3, 'iron_bars');
    for (const [x, z] of [[cx, cz - 8], [cx, cz + 8], [cx - 6, cz - 4], [cx + 6, cz - 4], [cx - 6, cz + 4], [cx + 6, cz + 4]]) {
        kit.fill(x, top, z, x, top + 4, z, 'obsidian');
        b.set(x, top + 5, z, 'magma_rock');
    }
    for (const [x, z] of [[cx - 3, cz - 3], [cx + 3, cz - 3], [cx - 3, cz + 3], [cx + 3, cz + 3]]) kit.fill(x, top, z, x, top + 3, z, 'obsidian');
    kit.fill(cx - 3, top + 4, cz - 3, cx + 3, top + 4, cz + 3, (x, y, z) => (Math.abs(x - cx) === 3 || Math.abs(z - cz) === 3 ? 'copper_block' : 'black_brick'));
    kit.fill(cx - 2, top + 5, cz - 2, cx + 2, top + 5, cz + 2, 'copper_block');
    kit.fill(cx - 1, top + 6, cz - 1, cx + 1, top + 6, cz + 1, 'copper_block');
    kit.fill(cx, top + 7, cz, cx, top + 8, cz, 'gold_block');
    for (const [x, z] of [[cx - 2, cz - 2], [cx + 2, cz - 2], [cx - 2, cz + 2], [cx + 2, cz + 2]]) kit.hang(x, top + 3, z);
}

function constructionPalaceVolcanic(b) {
    const kit = constructionPalaceVolcanicKit(b);
    constructionPalaceVolcanicApproach(b, kit);
    constructionPalaceVolcanicWall(b, kit);
    constructionPalaceVolcanicWard(b, kit);
    constructionPalaceVolcanicGatehouse(b, kit);
    constructionPalaceVolcanicShell(b, kit);
    constructionPalaceVolcanicCourtyard(b, kit);
    constructionPalaceVolcanicStairHalls(b, kit);
    constructionPalaceVolcanicGroundFloor(b, kit);
    constructionPalaceVolcanicThroneRoom(b, kit);
    constructionPalaceVolcanicFirstFloor(b, kit);
    constructionPalaceVolcanicRoof(b, kit);
    constructionPalaceVolcanicKeep(b, kit);
}

CONSTRUCTION_DESIGNS.palace_volcanic = {
    label: 'Volcanic palace',
    size: PALACE_VOLCANIC_SIZE,
    foundation: 'dirt',
    anchorX: PALACE_VOLCANIC_MID,
    groundY: PALACE_VOLCANIC_GROUND,
    rate: 480,
    start: [PALACE_VOLCANIC_MID, PALACE_VOLCANIC_GROUND + 1, 1],
    levels: [],
    site: constructionPalaceSite({ label: 'Volcanic palace', theme: 'volcanic', groundY: PALACE_VOLCANIC_GROUND, rim: PALACE_VOLCANIC_RIM }),
    generate: constructionPalaceVolcanic
};
