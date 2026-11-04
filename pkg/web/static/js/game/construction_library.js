// "/build library": a grand library, one more entry in CONSTRUCTION_DESIGNS (js/game/constructions.js).
// A ring of rooms and four storeys of galleries round a square atrium under a stained glass dome.
// - The plan is symmetric about x = 22. Going in from the near edge: the plaza (z 0..6), the steps
//   (7..10), the portico (11..14), the front wall (15), the two-storey hall (16..20), the shelves
//   of the front gallery (21, 22), its walk (23..25), the atrium (26..46), the walk of the back
//   gallery (47..49), its shelves (50, 51), the stair hall (52..58) and the back wall (59). Across,
//   the same ring: wall (1), side rooms (2..6), shelves (7, 8), walk (9..11), atrium (12..32).
// - A shelf wall is one layer of bookshelves against one layer of stone: no shelf has another shelf
//   behind it. A shaped block is only culled by a full cube (ChunkMesher), so the pilasters between
//   the bays, being cubes, also save the faces of the shelves beside them.
// - Stained glass (`transparent`) does not stop the sky (ChunkMesher.blocksSky): the atrium under
//   the dome is as bright as outdoors, in white, and what is coloured is the dome seen against the
//   sky. No block casts coloured light, so the floor below carries none: a mirror in the middle of
//   the floor shows the dome instead. Only the gold ribs and the marble under them stop the sky.
// - neon_lamp and argon_lamp glow but give no light (no `lightEmission`): they are accents here. All
//   the light at night comes from candles, table and floor lamps, lanterns and chandeliers.
// - Chests, barrels and wardrobes are empty: a build only places blocks.

// The floor layers of the four storeys: a visitor walks one higher. Eight apart, as the spiral
// stair climbs 8 per turn.
const LIBRARY_FLOORS = [4, 12, 20, 28];
const LIBRARY_ROOF = 36;
const LIBRARY_DOME = { x: 22, z: 36, base: 39, radius: 10.5, height: 11 };
// The rim of the dome goes round all 16 colours.
const LIBRARY_RIM = ['red', 'orange', 'yellow', 'lime', 'green', 'cyan', 'light_blue', 'blue', 'purple', 'magenta', 'pink', 'white', 'light_gray', 'gray', 'black', 'brown'];

// Where the columns of the atrium stand, on the ring x 11..33, z 25..47.
const LIBRARY_COLUMNS_X = [11, 17, 27, 33];
const LIBRARY_COLUMNS_Z = [25, 31, 41, 47];

// The glass of the dome at a point of it: h is the distance from the axis, v the height over its
// base, theta the bearing. An original pattern, a compass rose of knowledge seen from below: a sun in
// the crown, a star of eight long points faceted in red and magenta, a night sky with a few stars
// between the points, a thin cyan ring, and the rim going round all 16 colours.
function libraryDomeGlass(h, v, theta, x, z) {
    const { radius, height } = LIBRARY_DOME;
    const rho = Math.atan2(h, v * (radius / height)) / (Math.PI / 2);
    const turn = ((theta / (Math.PI * 2)) % 1 + 1) % 1;
    const facet = Math.floor(turn * 16);
    if (rho >= 0.82) return `${LIBRARY_RIM[facet]}_stained_glass`;
    if (rho >= 0.76) return 'cyan_stained_glass';
    if (rho < 0.09) return 'white_stained_glass';
    if (rho < 0.18) return 'yellow_stained_glass';
    if (rho < 0.24) return 'orange_stained_glass';
    // How far from a point of the star: 0 on a rib, 1 half way to the next one.
    const between = 1 - Math.abs(((turn * 8) % 1) * 2 - 1);
    const reach = 0.24 + 0.5 * (1 - between);
    if (rho < reach) return facet % 2 ? 'red_stained_glass' : 'magenta_stained_glass';
    const star = (((x * 73856093) ^ (z * 19349663)) >>> 0) % 7 === 0;
    return star ? 'light_blue_stained_glass' : 'blue_stained_glass';
}

// Whether a point of the dome is on one of its eight gold ribs (above the sun, which they end at).
function libraryDomeRib(h, v, theta) {
    const { radius, height } = LIBRARY_DOME;
    if (Math.atan2(h, v * (radius / height)) / (Math.PI / 2) < 0.2) return false;
    const off = ((theta / (Math.PI / 4)) % 1 + 1) % 1;
    return h * Math.sin(Math.min(off, 1 - off) * (Math.PI / 4)) < 0.36;
}

// Whether a cell is inside the dome's shell or on it.
function libraryDomeInside(x, y, z) {
    const { x: cx, z: cz, base, radius, height } = LIBRARY_DOME;
    return Math.hypot(x - cx, (y - base) * (radius / height), z - cz) <= radius;
}

// Whether a cell is the dome's skin: inside, with a neighbour outside. Closed: no gaps at the edges.
function libraryDomeSkin(x, y, z) {
    if (!libraryDomeInside(x, y, z)) return false;
    return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) => !libraryDomeInside(x + dx, y + dy, z + dz));
}

// The drawing tools every part uses, on top of the builder's. All of them mirror with b.sym.
function libraryTools(b) {
    const piece = (x, y, z, base, shape, facing) => b.shaped(x, y, z, base, shape, { facing: b.facing(facing) });
    return {
        piece,
        shelf: (x, y, z, facing) => piece(x, y, z, 'bookshelf', 'bookshelf', facing),
        chair: (x, y, z, facing) => piece(x, y, z, 'dark_oak_chair', 'chair', facing),
        sofa: (x, y, z, color, facing) => piece(x, y, z, `${color}_sofa`, 'sofa', facing),
        floorLamp(x, y, z) {
            b.shaped(x, y, z, 'floor_lamp', 'floor_lamp', { half: 'lower' });
            b.shaped(x, y + 1, z, 'floor_lamp', 'floor_lamp', { half: 'upper' });
        },
        lantern: (x, y, z, mount = 'hanging') => b.shaped(x, y, z, 'lantern', 'lantern', { mount }),
        curtain: (x, y, z, color, facing) => b.shaped(x, y, z, `${color}_curtain`, 'curtain', { facing: b.facing(facing), drawn: 'closed' }),
        wardrobe(x, y, z, facing) {
            b.shaped(x, y, z, 'wardrobe', 'wardrobe', { half: 'lower', facing: b.facing(facing) });
            b.shaped(x, y + 1, z, 'wardrobe', 'wardrobe', { half: 'upper', facing: b.facing(facing) });
        },
        // Stands on its post, looking the way the visitor comes from. Spanish, then English.
        sign: (x, y, z, facing, es, en) => b.set(x, y, z, shapeStateName('sign', BLOCK_SHAPES.sign, { facing: b.facing(facing), mount: 'post' }), { t: `${es} // ${en}` })
    };
}

// A chandelier on a chain of fences hanging from the block above `top`.
function libraryChandelier(b, x, y, z, top) {
    if (top > y) b.box(x, y + 1, z, x, top, z, 'dark_oak_fence');
    b.set(x, y, z, 'chandelier');
}

// ---------------------------------------------------------------------------------------
// The outside

function libraryPlaza(b, t) {
    // The paving, all round the building: a grid of marble on limestone, slate at the edge.
    for (let z = 0; z <= 14; z++) {
        for (let x = 0; x <= 44; x++) {
            const grid = x % 5 === 2 || z % 5 === 2;
            b.set(x, 0, z, x === 0 || x === 44 || z === 0 ? 'slate' : grid ? 'marble' : 'limestone');
        }
    }
    b.box(0, 0, 15, 0, 0, 59, 'slate');
    b.box(44, 0, 15, 44, 0, 59, 'slate');
    b.box(20, 0, 0, 24, 0, 6, 'marble');
    b.box(22, 0, 0, 22, 0, 6, 'basalt');

    // Benches, each looking at the way in between two flower pots, and lanterns on stone posts.
    b.sym(() => {
        for (const x0 of [4, 11]) {
            for (let x = x0; x <= x0 + 3; x++) t.piece(x, 1, 3, 'bench', 'bench', 'n');
            for (const x of [x0 - 1, x0 + 4]) b.set(x, 1, 3, 'flower_pot');
        }
        for (const x of [3, 9, 15, 19]) {
            b.box(x, 1, 1, x, 2, 1, 'stone_bricks');
            t.lantern(x, 3, 1, 'floor');
            if (x !== 19) {
                b.box(x, 1, 5, x, 2, 5, 'stone_bricks');
                t.lantern(x, 3, 5, 'floor');
            }
        }
        // Clipped hedges on the terraces beside the steps, with a pot at each end.
        b.walls(1, 1, 8, 5, 1, 13, 'stone_bricks');
        b.box(2, 1, 9, 4, 1, 12, 'leaves');
        for (const z of [8, 13]) {
            b.set(1, 2, z, 'flower_pot');
            b.set(5, 2, z, 'flower_pot');
        }
    });
}

function libraryPortico(b, t) {
    // The wide steps, with a cheek on each side that climbs with them.
    for (let k = 0; k < 4; k++) {
        const [y, z] = [1 + k, 7 + k];
        for (let x = 9; x <= 35; x++) b.stairs(x, y, z, 'stone_brick_stairs', 's');
        for (const x of [8, 36]) b.box(x, 1, z, x, y + 1, z, 'stone_bricks');
    }
    // Its floor, on a plinth.
    b.walls(6, 1, 11, 38, 3, 14, 'stone_bricks');
    b.box(6, 4, 11, 38, 4, 14, 'marble');
    b.box(20, 4, 11, 24, 4, 14, 'red_wool');

    b.sym(() => {
        // A balustrade where there are no steps below.
        b.box(6, 5, 11, 7, 5, 11, 'iron_bars');
        b.box(6, 5, 12, 6, 5, 14, 'iron_bars');
        b.set(7, 5, 13, 'flower_pot');
        b.set(8, 3, 7, 'flower_pot');
        b.set(8, 6, 10, 'flower_pot');
        // Columns two thick, from a stone base to a stone capital.
        for (const x of [8, 13, 18]) {
            b.box(x, 5, 11, x + 1, 5, 12, 'stone_bricks');
            b.box(x, 6, 11, x + 1, 28, 12, 'marble');
            b.box(x, 29, 11, x + 1, 29, 12, 'stone_bricks');
        }
        // Light in the portico.
        for (const x of [11, 16]) t.floorLamp(x, 5, 14);
        t.lantern(16, 29, 13);
        t.lantern(11, 29, 13);
    });
    t.lantern(22, 29, 13);

    // The entablature and the soffit under it.
    b.box(5, 30, 10, 39, 30, 15, 'stone_bricks');
    b.box(5, 31, 10, 39, 31, 10, 'marble');
    b.box(5, 31, 10, 5, 31, 15, 'marble');
    b.box(39, 31, 10, 39, 31, 15, 'marble');
    for (let x = 6; x <= 38; x += 2) b.set(x, 30, 10, 'limestone');

    // The pediment, closed behind, rising one up per two across to a ridge over the door.
    for (let x = 5; x <= 39; x++) {
        const dx = Math.min(x - 5, 39 - x);
        const y = 32 + Math.floor(dx / 2);
        for (let z = 10; z <= 15; z++) b.set(x, y, z, dx % 2 ? 'stone_bricks' : 'stone_bricks_slab');
        if (y > 32) {
            b.box(x, 32, 11, x, y - 1, 11, 'limestone');
            if (y > 39) b.box(x, 39, 15, x, y - 1, 15, 'limestone');
        }
    }
    // In its tympanum, an open book in gold, under a blue lamp.
    for (let k = 0; k <= 4; k++) {
        const y = 33 + Math.floor(k / 2);
        b.set(22 - k, y, 11, 'gold_block');
        b.set(22 + k, y, 11, 'gold_block');
    }
    b.set(22, 36, 11, 'argon_lamp');
}

// The walls with their tall windows. On the windows of the rooms that want them, curtains.
function libraryShell(b, t) {
    b.walls(1, 1, 15, 43, 4, 59, 'stone_bricks');
    b.walls(1, 5, 15, 43, LIBRARY_ROOF, 59, 'limestone');
    b.walls(1, LIBRARY_ROOF + 1, 15, 43, LIBRARY_ROOF + 1, 59, 'limestone');
    b.walls(1, LIBRARY_ROOF + 2, 15, 43, LIBRARY_ROOF + 2, 59, 'stone_bricks_slab');
    // A band of stone at each floor and under the eaves.
    for (const y of [...LIBRARY_FLOORS.slice(1), LIBRARY_ROOF]) b.walls(1, y, 15, 43, y, 59, 'stone_bricks');

    const colors = { 4: 'red', 12: 'blue', 20: 'green', 28: 'purple' };
    b.sym(() => {
        // Marble pilasters, corner to corner.
        for (const z of [15, 24, 34, 44, 53, 59]) b.box(1, 5, z, 1, LIBRARY_ROOF - 1, z, 'marble');
        for (const x of [7, 13, 20]) b.box(x, 5, 59, x, LIBRARY_ROOF - 1, 59, 'marble');
        for (const z of [19, 29, 39, 49]) {
            for (const floor of LIBRARY_FLOORS) {
                b.box(1, floor + 2, z - 1, 1, floor + 6, z + 1, 'glass_pane');
                b.box(1, floor + 7, z - 1, 1, floor + 7, z + 1, 'limestone');
                for (let y = floor + 2; y <= floor + 6; y++) {
                    t.curtain(2, y, z - 1, colors[floor], 'e');
                    t.curtain(2, y, z + 1, colors[floor], 'e');
                }
            }
        }
        // The back: a window for each flight of the grand stairs.
        for (const x of [4, 10, 15, 18]) b.box(x, 22, 59, x, 26, 59, 'glass_pane');
        b.box(10, 6, 59, 10, 10, 59, 'glass_pane');
        b.box(18, 6, 59, 18, 10, 59, 'glass_pane');
        // The front: two tall windows each side of the door, lighting the hall; one row above them.
        for (const x0 of [11, 16]) {
            b.box(x0, 6, 15, x0 + 2, 18, 15, 'glass_pane');
            for (let y = 6; y <= 18; y++) {
                t.curtain(x0, y, 16, 'red', 's');
                t.curtain(x0 + 2, y, 16, 'red', 's');
            }
            b.box(x0, 22, 15, x0 + 2, 26, 15, 'glass_pane');
        }
    });
    // The great window at the back, over the landing: the colours of the rim in rows.
    for (let y = 14; y <= 26; y++) {
        for (let x = 21; x <= 23; x++) b.set(x, y, 59, `${LIBRARY_RIM[(y + Math.abs(x - 22)) % 12]}_stained_glass`);
    }

    // The door: two pairs of leaves in marble, a transom of glass in gold over them.
    b.box(19, 5, 15, 25, 19, 15, 'marble');
    b.doubleDoor(20, 5, 15, 21, 15, 'dark_oak_door', 's');
    b.doubleDoor(23, 5, 15, 24, 15, 'dark_oak_door', 's');
    b.box(20, 8, 15, 24, 8, 15, 'gold_block');
    for (let y = 9; y <= 18; y++) {
        for (let x = 20; x <= 24; x++) b.set(x, y, 15, `${LIBRARY_RIM[(Math.abs(x - 22) + y) % 8]}_stained_glass`);
    }
}

// ---------------------------------------------------------------------------------------
// The dome

function libraryDome(b) {
    const { x: cx, z: cz, base } = LIBRARY_DOME;
    const top = base + LIBRARY_DOME.height;
    // The roof layer closes the corners of the square atrium round the dome's circle, in pale glass:
    // an opaque corner or drum would keep the sky from the walks, whose sky is what reaches them
    // sideways from the columns of the atrium (ChunkMesher.skyAt). Under the foot of each rib a
    // marble pier; along the drum, among pale glass, lamps that only glow, orange and blue in turn.
    for (let z = 26; z <= 46; z++) {
        for (let x = 12; x <= 32; x++) {
            const inside = libraryDomeInside(x, base, z);
            const rim = inside && libraryDomeSkin(x, base, z);
            b.set(x, LIBRARY_ROOF, z, !inside || rim ? 'white_stained_glass' : null);
            if (!rim) continue;
            const pier = libraryDomeRib(Math.hypot(x - cx, z - cz), 0, Math.atan2(z - cz, x - cx));
            const lamp = (x + z) % 4 === 0 ? ((x + z) % 8 ? 'neon_lamp' : 'argon_lamp') : 'white_stained_glass';
            b.box(x, LIBRARY_ROOF, z, x, LIBRARY_ROOF + 1, z, pier ? 'marble' : 'white_stained_glass');
            b.set(x, LIBRARY_ROOF + 2, z, pier ? 'marble' : lamp);
        }
    }
    for (let y = base; y <= top; y++) {
        for (let z = cz - 11; z <= cz + 11; z++) {
            for (let x = cx - 11; x <= cx + 11; x++) {
                if (!libraryDomeSkin(x, y, z)) continue;
                const h = Math.hypot(x - cx, z - cz);
                const theta = Math.atan2(z - cz, x - cx);
                const v = y - base;
                b.set(x, y, z, libraryDomeRib(h, v, theta) ? 'gold_block' : libraryDomeGlass(h, v, theta, x, z));
            }
        }
    }
    // The crown, with a lamp that shows at night far away.
    b.set(cx, top, cz, 'gold_block');
    b.set(cx, top + 1, cz, 'gold_block');
    b.set(cx, top + 2, cz, 'neon_lamp');
    b.set(cx, top + 3, cz, 'gold_block');

    // Under the crown, a great chandelier in three tiers, the widest on top.
    const tiers = [[31, 4], [25, 3], [19, 2]];
    b.box(cx, tiers[2][0], cz, cx, top - 1, cz, 'dark_oak_fence');
    for (const [y, reach] of tiers) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            for (let k = 1; k <= reach; k++) b.set(cx + dx * k, y, cz + dz * k, 'dark_oak_fence');
            b.set(cx + dx * reach, y - 1, cz + dz * reach, 'chandelier');
        }
        b.set(cx, y, cz, 'gold_block');
    }
    b.set(cx, tiers[2][0] - 1, cz, 'chandelier');
}

// ---------------------------------------------------------------------------------------
// The ring: floors, shelf walls, columns, railings

// The cells of the shelf walls that are pilasters: every 5, centred on the middle of each side.
function libraryPilaster(along, middle) {
    return Math.abs(along - middle) % 5 === 2;
}

function libraryRing(b, t) {
    const [ground, first, second, third] = LIBRARY_FLOORS;
    const roof = LIBRARY_ROOF;

    // ---- The floors ----
    b.box(2, ground, 16, 42, ground, 58, 'dark_oak_planks');
    b.box(2, first, 21, 42, first, 58, 'dark_oak_planks');
    for (const floor of [first, second, third]) {
        b.box(2, floor, 16, 6, floor, 58, 'spruce_planks');
        b.box(38, floor, 16, 42, floor, 58, 'spruce_planks');
    }
    b.box(7, second, 16, 37, second, 58, 'dark_oak_planks');
    b.box(7, third, 16, 37, third, 58, 'dark_oak_planks');
    b.box(2, roof, 16, 42, roof, 58, 'slate');
    // The way through the middle of the upper floors, for the atrium and the stair hall's flights.
    for (const floor of [first, second, third]) b.box(12, floor, 26, 32, floor, 46, null);
    b.box(13, second, 52, 31, second, 58, null);

    b.sym(() => {
        // ---- Backing walls, one layer behind the shelves ----
        b.box(7, ground + 1, 16, 7, roof - 1, 53, 'limestone');
        b.box(7, first + 1, 21, 22, roof - 1, 21, 'limestone');
        b.box(7, first + 1, 51, 22, roof - 1, 51, 'limestone');
        b.box(7, first, 21, 22, first, 21, 'marble');
    });
    // Behind the back aisle of the ground floor, the wall of the map room and the lobbies.
    b.box(8, ground + 1, 49, 36, first - 1, 49, 'limestone');

    for (const floor of LIBRARY_FLOORS) {
        const y0 = floor + 1;
        const y1 = floor + 7;
        // ---- The bookshelves: the books are what you see ----
        b.sym(() => {
            for (let z = floor === ground ? 26 : 23; z <= (floor === ground ? 48 : 49); z++) {
                for (let y = y0; y <= y1; y++) {
                    if (libraryPilaster(z, 36)) b.set(8, y, z, 'dark_oak_wood');
                    else t.shelf(8, y, z, 'e');
                }
            }
        });
        if (floor !== ground) {
            for (let x = 9; x <= 35; x++) {
                for (let y = y0; y <= y1; y++) {
                    const pilaster = libraryPilaster(x, 22);
                    if (pilaster) {
                        b.set(x, y, 22, 'dark_oak_wood');
                        b.set(x, y, 50, 'dark_oak_wood');
                    } else {
                        t.shelf(x, y, 22, 's');
                        t.shelf(x, y, 50, 'n');
                    }
                }
            }
            for (const [x, z] of [[8, 22], [36, 22], [8, 50], [36, 50]]) b.box(x, y0, z, x, y1, z, 'dark_oak_wood');
            // ---- The gallery's edge in marble, and the railing on it ----
            for (let k = 11; k <= 33; k++) {
                for (const z of [25, 47]) {
                    b.set(k, floor, z, 'marble');
                    b.set(k, y0, z, 'iron_bars');
                }
            }
            for (let k = 25; k <= 47; k++) {
                for (const x of [11, 33]) {
                    b.set(x, floor, k, 'marble');
                    b.set(x, y0, k, 'iron_bars');
                }
            }
            // ---- Light along the walks: a lamp at each pilaster ----
            for (const z of [29, 43]) {
                t.floorLamp(9, y0, z);
                t.floorLamp(35, y0, z);
            }
            for (const x of [15, 20, 24, 29]) {
                t.floorLamp(x, y0, 23);
                t.floorLamp(x, y0, 49);
            }
            for (const [x, z] of [[9, 23], [35, 23], [9, 49], [35, 49]]) t.lantern(x, y1, z);
        }
    }

    // ---- The columns of the atrium, from the ground to the roof ----
    for (const x of LIBRARY_COLUMNS_X) {
        for (const z of [25, 47]) libraryColumn(b, x, z);
    }
    for (const z of LIBRARY_COLUMNS_Z) {
        for (const x of [11, 33]) libraryColumn(b, x, z);
    }
}

function libraryColumn(b, x, z) {
    b.box(x, LIBRARY_FLOORS[0] + 1, z, x, LIBRARY_ROOF - 1, z, 'marble');
    // A blue accent high on each storey; it glows and gives no light.
    for (const floor of LIBRARY_FLOORS) b.set(x, floor + 6, z, 'argon_lamp');
}

// A doorway 3 high through a wall or a shelf, and a marble lintel over it.
function libraryPortal(b, x0, x1, z0, z1, floor) {
    b.box(x0, floor + 1, z0, x1, floor + 3, z1, null);
    b.box(x0, floor + 4, z0, x1, floor + 4, z1, 'marble');
}

// ---------------------------------------------------------------------------------------
// The ground floor

function libraryHall(b, t) {
    const [floor, first, ceiling] = LIBRARY_FLOORS;
    const y = floor + 1;

    // ---- Marble: a check, a red runner up the middle, a pool of mirrors each side of it ----
    for (let z = 16; z <= 25; z++) {
        for (let x = 8; x <= 36; x++) b.set(x, floor, z, (x + z) % 2 ? 'marble' : 'basalt');
    }
    b.box(21, floor, 16, 23, floor, 25, 'red_wool');
    b.sym(() => {
        // The reflecting pool, flush with the floor so that you walk on the sky.
        b.box(10, floor, 16, 19, floor, 20, 'gold_block');
        b.box(11, floor, 17, 18, floor, 19, 'mirror');
        b.box(11, floor - 1, 17, 18, floor - 1, 19, 'stone_bricks');
        // A wall of mirrors at the end of the hall.
        b.box(7, y, 16, 7, y + 11, 20, 'marble');
        b.box(7, y + 1, 17, 7, y + 7, 19, 'mirror');
        // The columns under the gallery, and the two storeys of wall over them.
        for (const x of [12, 16, 20]) {
            b.box(x, y, 21, x, first - 1, 21, 'marble');
            b.box(x, first + 1, 21, x, ceiling - 1, 21, 'marble');
        }
        // Chandeliers from the high ceiling, and lamps on the floor.
        libraryChandelier(b, 14, 15, 18, ceiling - 1);
        t.floorLamp(9, y, 18);
        t.floorLamp(15, y, 24);
        t.floorLamp(20, y, 19);
        t.floorLamp(20, y, 23);
        // Reception: a long desk with a clerk's chair behind it and a lamp on it.
        for (let x = 11; x <= 17; x++) t.piece(x, y, 23, 'desk', 'desk', 's');
        for (const x of [12, 14, 16]) t.chair(x, y, 24, 'n');
        for (const x of [11, 15]) b.set(x, y + 1, 23, 'table_lamp');
        b.set(13, y + 1, 23, 'vase');
        b.set(17, y + 1, 23, 'candle');
        // A blue line high on the wall.
        for (const x of [14, 18]) b.box(x, ceiling - 2, 21, x, ceiling - 1, 21, 'argon_lamp');
    });
    libraryChandelier(b, 22, 15, 18, ceiling - 1);
    t.sign(20, y, 17, 'n', 'BIBLIOTECA', 'Library');
    t.sign(24, y, 25, 'n', 'LECTURA', 'Reading room');

    // A look down into the hall from the first gallery: an opening in the shelves, with a rail.
    b.box(21, first + 2, 21, 23, first + 5, 22, null);
    b.box(21, first + 1, 21, 23, first + 1, 21, 'iron_bars');
    b.box(21, first + 1, 22, 23, first + 1, 22, null);

    // Doors at the sides, to the two small rooms by the front.
    b.sym(() => {
        b.box(7, y, 23, 7, y + 1, 23, null);
        b.door(7, y, 23, 'dark_oak_door', 'w');
    });
}

// The reading room under the dome.
function libraryAtrium(b, t) {
    const floor = LIBRARY_FLOORS[0];
    const y = floor + 1;
    // A floor of marble and basalt in the atrium and the walks round it; a runner to the stairs.
    for (let z = 26; z <= 46; z++) {
        for (let x = 12; x <= 32; x++) b.set(x, floor, z, Math.abs(x - 22) % 4 === 0 || Math.abs(z - 36) % 4 === 0 ? 'basalt' : 'marble');
    }
    b.box(9, floor, 26, 11, floor, 48, 'marble');
    b.box(33, floor, 26, 35, floor, 48, 'marble');
    b.box(9, floor, 47, 35, floor, 48, 'marble');
    b.box(21, floor, 26, 23, floor, 38, 'red_wool');

    // In the middle under the dome a round mirror in the floor, with a gold rim: look down and see it.
    for (let z = 33; z <= 39; z++) {
        for (let x = 19; x <= 25; x++) {
            const d = Math.hypot(x - 22, z - 36);
            if (d < 2.5) {
                b.set(x, floor, z, 'mirror');
                // Something under it: a mirror cube reflects on every side that is not against a cube.
                b.set(x, floor - 1, z, 'stone_bricks');
            }
            else if (d < 3.5) b.set(x, floor, z, 'gold_block');
        }
    }

    b.sym(() => {
        // Long joined desks along the side, a chair at every other one.
        for (let z = 27; z <= 45; z++) t.piece(13, y, z, 'desk', 'desk', 'w');
        for (let z = 28; z <= 44; z += 2) t.chair(12, y, z, 'e');
        for (let z = 29; z <= 45; z += 4) b.set(13, y + 1, z, 'table_lamp');
        // A long joined table up the room, chairs on both sides, lamps on it.
        b.box(17, y, 27, 18, y, 37, 'table');
        for (let z = 28; z <= 36; z += 2) {
            t.chair(16, y, z, 'e');
            t.chair(19, y, z, 'w');
        }
        for (const z of [28, 32, 36]) b.set(17, y + 1, z, 'table_lamp');
        for (const z of [30, 34]) b.set(18, y + 1, z, 'candle');
        // Lamps along the shelves and by the stairs.
        for (const z of [28, 36, 44]) t.floorLamp(9, y, z);
        t.floorLamp(15, y, 40);
        t.floorLamp(12, y, 47);
        t.floorLamp(20, y, 47);
        for (const z of [26, 32, 38]) t.floorLamp(20, y, z);
        // Lanterns on the rail of the stair.
        for (const k of [2, 5]) t.lantern(18, y + k + 2, 39 + k, 'floor');
    });

    // ---- The grand stair up to the first gallery, seven wide, straight on from the door ----
    for (let k = 0; k < 8; k++) {
        const z = 39 + k;
        for (let x = 19; x <= 25; x++) b.stairs(x, y + k, z, 'dark_oak_stairs', 's');
        for (const x of [18, 26]) {
            b.box(x, y, z, x, y + k, z, 'marble');
            b.set(x, y + k + 1, z, 'iron_bars');
        }
    }
    b.box(19, y, 46, 25, y + 6, 46, 'limestone');
    // Where it arrives, no railing.
    b.box(19, LIBRARY_FLOORS[1] + 1, 47, 25, LIBRARY_FLOORS[1] + 1, 47, null);
    // At its foot, two lanterns on the cheeks.
    for (const x of [18, 26]) {
        b.box(x, y, 39, x, y + 2, 39, 'marble');
        t.lantern(x, y + 3, 39, 'floor');
    }
    t.sign(24, y, 37, 'n', 'GALERÍAS', 'Galleries');

    // ---- Portals from the walks to the rooms beside ----
    b.sym(() => {
        libraryPortal(b, 7, 8, 35, 37, floor);
        t.lantern(8, floor + 3, 36);
    });
}

// The map room behind the stair: a floor that is a map, and a globe of blocks in the middle of it.
function libraryMapRoom(b, t) {
    const floor = LIBRARY_FLOORS[0];
    const y = floor + 1;
    const cx = 22;
    const cz = 54;
    const land = (u, v) => Math.sin(u * 2.1 + 1) + Math.sin(v * 2.7 + u) + Math.sin((u - v) * 1.3) > 0.7;
    // The walls: round it the two lobbies of the stairs; the way in, on the axis.
    b.sym(() => b.box(14, y, 50, 14, LIBRARY_FLOORS[1] - 1, 58, 'limestone'));
    libraryPortal(b, 21, 23, 49, 49, floor);
    for (let z = 50; z <= 58; z++) {
        for (let x = 15; x <= 29; x++) b.set(x, floor, z, land(x * 0.5, z * 0.5) ? 'lime_wool' : 'blue_wool');
    }
    // The globe, on a gold foot: oceans and continents, white at the poles, and a ring round it.
    b.set(cx, y, cz, 'gold_block');
    const radius = 2.6;
    for (let gy = -3; gy <= 3; gy++) {
        for (let gz = -3; gz <= 3; gz++) {
            for (let gx = -3; gx <= 3; gx++) {
                if (Math.hypot(gx, gy, gz) > radius) continue;
                const pole = Math.abs(gy) >= 2 && Math.hypot(gx, gz) < 1.5;
                const type = pole ? 'white_wool' : land(gx + gy * 0.7, gz - gy * 0.4) ? 'green_wool' : 'blue_wool';
                b.set(cx + gx, y + 3 + gy, cz + gz, type);
            }
        }
    }
    b.sym(() => {
        // Map tables, candles on them, and paintings of far places on the walls.
        b.box(16, y, 52, 17, y, 56, 'table');
        b.set(16, y + 1, 53, 'candle');
        b.set(17, y + 1, 55, 'candle');
        t.floorLamp(15, y, 50);
        t.floorLamp(15, y, 58);
        t.floorLamp(19, y, 58);
        t.piece(16, y + 2, 50, 'painting_peaks', 'painting', 's');
        t.piece(17, y + 2, 50, 'painting_meadow', 'painting', 's');
        t.piece(18, y + 2, 50, 'painting_sunset', 'painting', 's');
    });
    t.sign(20, y, 50, 'e', 'MAPAS', 'Map room');
}

// ---------------------------------------------------------------------------------------
// The rooms beside

// The small rooms by the front on the ground floor: x 2..6, z 16..24, a wall at z = 25.
function libraryPress(b, t) {
    const floor = LIBRARY_FLOORS[0];
    const y = floor + 1;
    b.box(2, y, 25, 6, LIBRARY_FLOORS[1] - 1, 25, 'limestone');
    for (let z = 16; z <= 22; z++) t.sofa(2, y, z, z < 19 ? 'green' : 'brown', 'e');
    for (const z of [17, 21]) {
        t.piece(6, y + 2, z, 'wall_shelf', 'wall_shelf', 'w');
        t.piece(6, y + 2, z - 1, 'wall_shelf', 'wall_shelf', 'w');
    }
    b.set(4, y, 18, 'table');
    b.set(4, y + 1, 18, 'table_lamp');
    b.set(4, y, 21, 'table');
    b.set(4, y + 1, 21, 'vase');
    t.floorLamp(6, y, 24);
    t.sign(5, y, 23, 'e', 'PRENSA', 'Periodicals');
}

function libraryCloakroom(b, t) {
    const floor = LIBRARY_FLOORS[0];
    const y = floor + 1;
    b.box(2, y, 25, 6, LIBRARY_FLOORS[1] - 1, 25, 'limestone');
    for (let z = 16; z <= 23; z++) {
        if (z !== 19) t.wardrobe(2, y, z, 'e');
    }
    for (const z of [17, 21]) t.floorLamp(6, y, z);
    b.set(5, y, 24, 'stool');
    t.sign(5, y, 23, 'e', 'ROPERO', 'Cloakroom');
}

// The children's corner, on the ground floor at x 2..6: a floor of coloured carpets, sofas, a mural.
function libraryChildren(b, t) {
    const floor = LIBRARY_FLOORS[0];
    const y = floor + 1;
    const rainbow = LIBRARY_RIM.filter((color) => color !== 'black' && color !== 'gray');
    for (let z = 26; z <= 52; z++) {
        for (let x = 2; x <= 6; x++) b.set(x, y, z, `${rainbow[(Math.floor(z / 3) + Math.floor(x / 2)) % rainbow.length]}_carpet`);
    }
    // The mural: all the paintings, three rows of them along the wall.
    const paintings = ['sunset', 'peaks', 'meadow', 'night', 'shapes', 'fish'];
    for (let z = 39; z <= 51; z++) {
        for (let row = 0; row < 3; row++) {
            t.piece(6, y + 2 + row, z, `painting_${paintings[(z + row * 2) % paintings.length]}`, 'painting', 'w');
        }
    }
    for (let z = 26; z <= 33; z++) {
        for (let row = 0; row < 3; row++) {
            t.piece(6, y + 2 + row, z, `painting_${paintings[(z + row) % paintings.length]}`, 'painting', 'w');
        }
    }
    // A line of lamps over it that glow orange and blue.
    for (let z = 39; z <= 51; z++) b.set(7, y + 5, z, z % 2 ? 'neon_lamp' : 'argon_lamp');
    // Sofas under the windows, a low table, stools, low shelves at the end at a child's height.
    for (const [z0, z1, color] of [[27, 31, 'orange'], [37, 41, 'cyan'], [46, 50, 'magenta']]) {
        for (let z = z0; z <= z1; z++) t.sofa(2, y, z, color, 'e');
        const middle = (z0 + z1) >> 1;
        b.set(4, y, middle, 'table');
        b.set(4, y + 1, middle, 'table_lamp');
        for (const dz of [-1, 1]) b.set(5, y, middle + dz, 'stool');
    }
    for (let x = 2; x <= 6; x++) {
        for (let k = y; k <= y + 2; k++) {
            t.shelf(x, k, 52, 'n');
            t.shelf(x, k, 26, 's');
        }
    }
    b.set(2, y + 3, 52, 'flower_pot');
    b.set(6, y + 3, 52, 'flower_pot');
    for (const z of [29, 44]) t.lantern(4, LIBRARY_FLOORS[1] - 1, z);
    t.floorLamp(6, y, 34);
    t.floorLamp(6, y, 44);
    t.sign(5, y, 34, 's', 'INFANTIL', 'Children');
}

// A long reading room in a side band: a joined table up the middle, chairs, lamps.
function libraryReadingBand(b, t, floor, z0, z1, sofa) {
    const y = floor + 1;
    const runs = [[z0, 33], [39, z1]];
    for (const [start, end] of runs) {
        for (let z = start; z <= end; z++) b.set(4, y, z, 'table');
        for (let z = start + 1; z < end; z += 2) {
            t.chair(3, y, z, 'e');
            t.chair(5, y, z, 'w');
        }
        for (let z = start + 1; z <= end; z += 4) b.set(4, y + 1, z, 'table_lamp');
    }
    // Sofas by the portal, to sit with a book.
    for (let z = 35; z <= 37; z++) t.sofa(2, y, z, sofa, 'e');
    // Shelves on the end walls.
    for (let x = 2; x <= 6; x++) {
        for (let k = y; k <= y + 2; k++) t.shelf(x, k, z1, 'n');
    }
}

// The quiet study: desks along the inner wall, each with a chair and a lamp, clocks over them.
function libraryQuietStudy(b, t, floor, z0, z1) {
    const y = floor + 1;
    for (let z = z0; z <= z1; z += 3) {
        if (z >= 33 && z <= 39) continue;
        t.piece(6, y, z, 'desk', 'desk', 'w');
        t.chair(5, y, z, 'e');
        b.set(6, y + 1, z, 'table_lamp');
        t.piece(6, y + 3, z, 'wall_clock', 'wall_clock', 'w');
    }
    // Candles on low stands along the windows.
    for (let z = z0 + 1; z <= z1; z += 6) {
        b.set(3, y, z, 'bedside_table');
        b.set(3, y + 1, z, 'candle');
    }
    for (const z of [z0, z1]) t.floorLamp(2, y, z);
    t.floorLamp(3, y, 36);
    t.sign(5, y, 34, 's', 'SILENCIO', 'Quiet study');
}

// Archive rooms in a side band: small rooms in a row, door after door, chests and barrels.
function libraryArchive(b, t, floor) {
    const y = floor + 1;
    const rooms = [[16, 24], [26, 33], [35, 43], [45, 52]];
    for (const z of [25, 34, 44]) {
        b.box(2, y, z, 6, floor + 7, z, 'limestone');
        b.box(4, y, z, 4, y + 1, z, null);
    }
    for (const [z0, z1] of rooms) {
        for (let z = z0; z <= z1; z++) {
            t.piece(2, y, z, 'chest', 'chest', 'e');
            b.set(6, y, z, 'barrel');
            if (!(z % 2) && (z < 35 || z > 37)) b.set(6, y + 1, z, 'barrel');
        }
        const middle = (z0 + z1) >> 1;
        t.floorLamp(5, y, middle);
        t.lantern(4, floor + 7, middle);
    }
    // The way in from the gallery.
    for (let z = 35; z <= 37; z++) b.box(6, y, z, 6, y + 2, z, null);
}

// The long rooms over the hall, z 16..20, x 8..36.
function libraryLongRoom(b, t, floor, paintings) {
    const y = floor + 1;
    b.sym(() => {
        b.box(10, y, 18, 19, y, 18, 'table');
        for (let x = 11; x < 19; x += 2) {
            t.chair(x, y, 17, 's');
            t.chair(x, y, 19, 'n');
        }
        for (let x = 11; x <= 19; x += 4) b.set(x, y + 1, 18, 'table_lamp');
        t.floorLamp(8, y, 16);
        t.floorLamp(8, y, 20);
        t.floorLamp(20, y, 16);
        if (paintings) {
            ['night', 'peaks', 'fish', 'shapes', 'meadow', 'sunset'].forEach((name, i) => {
                t.piece(9 + i * 2, y + 3, 16, `painting_${name}`, 'painting', 's');
                t.piece(9 + i * 2, y + 3, 20, `painting_${name}`, 'painting', 'n');
            });
        }
    });
    libraryPortal(b, 21, 23, 21, 22, floor);
    libraryChandelier(b, 22, y + 5, 18, floor + 7);
    t.sign(20, y, 20, 'e', 'SALA LARGA', 'Long room');
}

// ---------------------------------------------------------------------------------------
// The stairs

// The spiral stair in the back corner, x 2..6, z 54..58, up from the ground floor to the roof. It
// climbs 2 per side round a hollow core, so it comes back over its door every 8. Each door is at
// (7, 58), onto the lobby of the grand stair; the last one, onto the roof.
function librarySpiral(b) {
    const stair = 'stone_brick_stairs';
    const trim = 'stone_bricks';
    const roof = LIBRARY_ROOF;
    const top = roof + 3;
    b.box(2, LIBRARY_FLOORS[0] + 1, 54, 6, top, 58, null);
    b.box(1, LIBRARY_FLOORS[0] + 1, 53, 7, top, 53, 'limestone');
    b.box(7, LIBRARY_FLOORS[0] + 1, 53, 7, top, 59, 'limestone');
    b.box(1, roof, 53, 1, top, 59, 'limestone');
    b.box(1, roof, 59, 7, top, 59, 'limestone');
    b.walls(3, LIBRARY_FLOORS[0] + 1, 55, 5, top, 57, trim);
    b.box(1, top + 1, 53, 7, top + 1, 59, trim);
    for (const base of LIBRARY_FLOORS) {
        // Two up, then two flat with a corner to turn at, four times.
        b.stairs(6, base + 1, 57, stair, 'n');
        b.stairs(6, base + 2, 56, stair, 'n');
        b.box(6, base + 2, 54, 6, base + 2, 55, trim);
        b.set(6, base + 3, 54, 'torch');
        b.stairs(5, base + 3, 54, stair, 'w');
        b.stairs(4, base + 4, 54, stair, 'w');
        b.box(2, base + 4, 54, 3, base + 4, 54, trim);
        b.stairs(2, base + 5, 55, stair, 's');
        b.stairs(2, base + 6, 56, stair, 's');
        b.box(2, base + 6, 57, 2, base + 6, 58, trim);
        b.set(2, base + 7, 58, 'torch');
        b.stairs(3, base + 7, 58, stair, 'e');
        b.stairs(4, base + 8, 58, stair, 'e');
        b.box(5, base + 8, 58, 6, base + 8, 58, trim);
        // A slit to the outside, and the door of this storey.
        b.box(1, base + 3, 56, 1, base + 4, 56, 'glass_pane');
        b.box(7, base + 1, 58, 7, base + 2, 58, null);
    }
    b.box(7, roof + 1, 58, 7, roof + 2, 58, null);
    // At the top the stair stops: a wall where the next flight would go, not a railing's ledge to fall off.
    b.box(6, roof + 1, 57, 6, roof + 2, 57, trim);
    b.box(6, roof, 57, 6, roof, 57, trim);
    // And a light at the bottom, where it is dark under the first turn.
    b.set(2, LIBRARY_FLOORS[0] + 1, 57, 'torch');
    // The floor of the ground storey under the stair.
    b.box(2, LIBRARY_FLOORS[0], 54, 6, LIBRARY_FLOORS[0], 58, trim);
}

// The grand stair of the upper floors, in the back band, one of two mirrored wings: from the landing
// on the axis at the first floor up the back lane, to a landing at the far end at the second, and
// back along the front lane to the landing on the axis at the third. Three wide, a wall between.
function libraryGrandStair(b) {
    const [, first, second, third] = LIBRARY_FLOORS;
    const stairs = 'dark_oak_stairs';
    // Over the front lane, the floor of the third storey is open, with a rail round the hole.
    b.box(13, third, 52, 20, third, 54, null);
    for (let k = 0; k < 8; k++) {
        for (let z = 56; z <= 58; z++) b.stairs(20 - k, first + 1 + k, z, stairs, 'w');
        for (let z = 52; z <= 54; z++) b.stairs(13 + k, second + 1 + k, z, stairs, 'e');
    }
    // The wall between the lanes, the end of the space under the back lane.
    b.box(13, first + 1, 55, 20, third - 1, 55, 'limestone');
    b.box(12, first + 1, 56, 12, second - 1, 58, 'limestone');
    b.box(13, third + 1, 55, 20, third + 1, 55, 'limestone');
    b.box(12, third + 1, 52, 12, third + 1, 55, 'iron_bars');
    // The landings of the second floor at each end.
    b.box(8, second, 52, 12, second, 58, 'dark_oak_planks');
}

// The doors from the galleries to the stair hall, and its lobbies at the far ends.
function libraryStairDoors(b, t) {
    const [ground, first, second, third] = LIBRARY_FLOORS;
    libraryPortal(b, 21, 23, 50, 51, first);
    libraryPortal(b, 21, 23, 50, 51, third);
    b.sym(() => {
        libraryPortal(b, 9, 11, 50, 51, second);
        libraryPortal(b, 9, 11, 49, 49, ground);
        // Light on the lobbies, the landings and along the lanes.
        for (const floor of [ground, first, second, third]) t.floorLamp(8, floor + 1, 54);
        t.floorLamp(13, ground + 1, 52);
        t.floorLamp(20, first + 1, 52);
        t.floorLamp(13, first + 1, 53);
        t.floorLamp(12, second + 1, 56);
        t.floorLamp(16, third + 1, 57);
    });
    // The landings on the axis.
    t.floorLamp(21, first + 1, 58);
    t.floorLamp(23, first + 1, 58);
    t.floorLamp(21, third + 1, 58);
    t.floorLamp(23, third + 1, 58);
    // What each lane sees at its turn.
    b.sym(() => {
        libraryChandelier(b, 16, second + 1, 57, third - 1);
        libraryChandelier(b, 16, third + 1, 53, LIBRARY_ROOF - 1);
        libraryChandelier(b, 10, third - 2, 55, third - 1);
    });
    libraryChandelier(b, 22, third - 4, 55, third - 1);
    libraryChandelier(b, 22, LIBRARY_ROOF - 2, 55, LIBRARY_ROOF - 1);
    t.sign(22, first + 1, 56, 'n', 'ESCALERA', 'Grand stairs');
}

// The small room in the other back corner, x 38..42, z 54..58, at each storey: chests and barrels.
function libraryCornerRooms(b, t) {
    b.box(37, LIBRARY_FLOORS[0] + 1, 53, 43, LIBRARY_ROOF - 1, 53, 'limestone');
    b.box(37, LIBRARY_FLOORS[0] + 1, 53, 37, LIBRARY_ROOF - 1, 59, 'limestone');
    for (const floor of LIBRARY_FLOORS) {
        const y = floor + 1;
        b.box(37, y, 58, 37, y + 1, 58, null);
        b.door(37, y, 58, 'dark_oak_door', 'e');
        for (let z = 54; z <= 58; z++) {
            t.piece(42, y, z, 'chest', 'chest', 'w');
            t.piece(42, y + 1, z, 'chest', 'chest', 'w');
        }
        for (let x = 38; x <= 41; x++) {
            b.set(x, y, 54, 'barrel');
            if (x % 2) b.set(x, y + 1, 54, 'barrel');
        }
        t.floorLamp(38, y, 56);
    }
    t.sign(41, LIBRARY_FLOORS[0] + 1, 58, 'w', 'ARCHIVO', 'Archive');
}

// The roof: the parapet all round it is the shell's. A walk round the drum, lanterns, skylights.
function libraryRoof(b, t) {
    const y = LIBRARY_ROOF + 1;
    for (const x of [14, 22, 30]) b.box(x - 1, LIBRARY_ROOF, 17, x + 1, LIBRARY_ROOF, 19, 'glass');
    b.sym(() => {
        for (const z of [20, 30, 40, 50]) t.lantern(3, y, z, 'floor');
        // Over the top floor's rooms, which have the sky and floors below them have not.
        for (const z of [19, 29, 39, 49]) b.box(3, LIBRARY_ROOF, z - 1, 5, LIBRARY_ROOF, z + 1, 'glass');
    });
    t.sign(9, y, 57, 'e', 'AZOTEA', 'Roof');
}

// ---------------------------------------------------------------------------------------

function constructionLibrary(b) {
    const t = libraryTools(b);
    const [ground, first, second, third] = LIBRARY_FLOORS;
    const east = (draw) => {
        b.flipped = true;
        draw();
        b.flipped = false;
    };

    libraryPlaza(b, t);
    libraryPortico(b, t);
    libraryRing(b, t);
    libraryShell(b, t);
    libraryDome(b);
    libraryHall(b, t);
    libraryAtrium(b, t);
    libraryMapRoom(b, t);
    librarySpiral(b);
    b.sym(() => libraryGrandStair(b));
    libraryStairDoors(b, t);
    libraryCornerRooms(b, t);

    // ---- The side bands ----
    libraryPress(b, t);
    east(() => libraryCloakroom(b, t));
    libraryChildren(b, t);
    east(() => {
        libraryReadingBand(b, t, ground, 27, 52, 'red');
        t.floorLamp(6, ground + 1, 30);
        t.floorLamp(6, ground + 1, 46);
        t.floorLamp(2, ground + 1, 28);
        t.floorLamp(2, ground + 1, 44);
        t.sign(5, ground + 1, 34, 's', 'LECTURA', 'Reading room');
    });
    // First floor: to the west a long reading room, to the east the quiet study.
    libraryReadingBand(b, t, first, 18, 52, 'blue');
    for (const z of [20, 30, 45]) {
        t.floorLamp(6, first + 1, z);
        t.floorLamp(2, first + 1, z + 4);
    }
    t.sign(5, first + 1, 34, 's', 'LECTURA', 'Reading room');
    east(() => libraryQuietStudy(b, t, first, 17, 52));
    // Second floor: archives on both sides.
    b.sym(() => libraryArchive(b, t, second));
    t.sign(5, second + 1, 38, 'e', 'ARCHIVO', 'Archive');
    // Third floor: more reading, high up, and the rare books.
    libraryReadingBand(b, t, third, 18, 52, 'purple');
    for (const z of [20, 30, 45]) {
        t.floorLamp(6, third + 1, z);
        t.floorLamp(2, third + 1, z + 4);
    }
    east(() => {
        libraryReadingBand(b, t, third, 18, 52, 'brown');
        for (const z of [20, 30, 45]) {
            t.floorLamp(6, third + 1, z);
            t.floorLamp(2, third + 1, z + 4);
        }
    });

    // The long rooms in front, over the hall.
    libraryLongRoom(b, t, second, false);
    libraryLongRoom(b, t, third, true);

    // ---- The ways through the shelves to the bands, on each upper floor ----
    for (const floor of [first, second, third]) {
        b.sym(() => {
            libraryPortal(b, 7, 8, 35, 37, floor);
            t.lantern(8, floor + 3, 36);
        });
    }

    libraryRoof(b, t);
}

CONSTRUCTION_DESIGNS.library = {
    label: 'Grand library',
    size: [45, 54, 60],
    foundation: 'stone_bricks',
    anchorX: 22,
    start: [22, 1, 1],
    levels: [
        { name: 'the portico', at: [22, 5, 13] },
        { name: 'the entrance hall', at: [22, 5, 18] },
        { name: 'the reception', at: [13, 5, 25] },
        { name: 'the reading room', at: [22, 5, 30] },
        { name: 'the periodicals', at: [5, 5, 20] },
        { name: 'the cloakroom', at: [39, 5, 20] },
        { name: "the children's corner", at: [4, 5, 36] },
        { name: 'the east reading room', at: [40, 5, 36] },
        { name: 'the map room', at: [22, 5, 51] },
        { name: 'the ground floor archive', at: [39, 5, 56] },
        { name: 'the foot of the spiral stair', at: [6, 5, 58] },
        { name: 'the first gallery, west', at: [10, 13, 36] },
        { name: 'the first gallery, east', at: [34, 13, 36] },
        { name: 'the first gallery, front', at: [22, 13, 24] },
        { name: 'the first gallery, back', at: [22, 13, 48] },
        { name: 'the first floor landing', at: [22, 13, 54] },
        { name: 'the first floor reading room', at: [4, 13, 36] },
        { name: 'the quiet study', at: [40, 13, 36] },
        { name: 'the first floor archive', at: [39, 13, 56] },
        { name: 'the second gallery, west', at: [10, 21, 36] },
        { name: 'the second gallery, east', at: [34, 21, 36] },
        { name: 'the second gallery, front', at: [22, 21, 24] },
        { name: 'the second gallery, back', at: [22, 21, 48] },
        { name: 'the second floor landing, west', at: [10, 21, 54] },
        { name: 'the second floor landing, east', at: [34, 21, 54] },
        { name: 'the long room', at: [22, 21, 18] },
        { name: 'the west archives', at: [4, 21, 36] },
        { name: 'the east archives', at: [40, 21, 36] },
        { name: 'the far west archive', at: [4, 21, 18] },
        { name: 'the far east archive', at: [40, 21, 50] },
        { name: 'the second floor corner archive', at: [39, 21, 56] },
        { name: 'the third gallery, west', at: [10, 29, 36] },
        { name: 'the third gallery, east', at: [34, 29, 36] },
        { name: 'the third gallery, front', at: [22, 29, 24] },
        { name: 'the third gallery, back', at: [22, 29, 48] },
        { name: 'the third floor landing', at: [22, 29, 54] },
        { name: 'the upper long room', at: [22, 29, 18] },
        { name: 'the third floor reading room, west', at: [3, 29, 36] },
        { name: 'the third floor reading room, east', at: [41, 29, 36] },
        { name: 'the third floor corner archive', at: [39, 29, 56] },
        { name: 'the roof', at: [8, 37, 58] },
        { name: 'the far side of the roof', at: [38, 37, 20] }
    ],
    generate: constructionLibrary
};
