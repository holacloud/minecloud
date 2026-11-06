// /build lab: a research institute of 56 x 52, three floors and a roof under an observatory dome, whose
// electrics run on the server's real grid (pkg/network/power.go, logic.go, mechanics.go, appliances.go).
// Registered into CONSTRUCTION_DESIGNS (constructions.js), which it uses as any other design.
// - Why several floors and not one long one: solar panels and telescopes want the sky, and a roof gives
//   them all of it; a lift and an atrium only mean something with height; and rooms stay a short walk
//   apart, which is what a tour of 20 rooms needs. It is wide as well, because the rooms are big.
// - Floors are 6 apart: the floor at y = F, 4 of air, a ceiling layer at F + 5 with the wires in it, and the
//   next floor. The roof is at y = 18. The lift goes to the roof, inside the observatory.
// - Going in from the near edge: plaza (z 0..9), the glass front (10), the atrium (11..25), the wall with
//   the periodic table (26), the cross corridor (27..29), the core (30..47), the back wall (48), the yard.
//   Across: the west wing (x 2..14), wall (15), corridor (16..18), the atrium and the core (19..36),
//   corridor (37..39), wall (40), the east wing (41..53).
// - The grid is all or nothing per network, and at most 512 blocks a network (powerMaxNetwork). So there
//   are ten separate networks, each with generators that cover its whole demand without counting on the
//   sun or the batteries, which a build leaves empty:
//     main      power hall: 6 rtg, 8 batteries, 24 solar panels, 2 turbines. The ground floor and the night
//               lights of the lobby and the east of the roof. The rtgs alone cover it. At 492 blocks with
//               everything on it is close to the limit: the terrace's west side burns oil for that reason.
//     floor 1, floor 2   6 rtg and 3 batteries each, in a cupboard in the core, with a main switch. The
//               lecture hall hangs from floor 1, genetics from the sample room's switch.
//     lift      1 rtg, as the apartments.
//     cold      2 rtg: 2 fridges and a freezer in the chemistry lab (90 W of 160 W).
//     arc       2 rtg touching the arc furnace (150 W of 160 W).
//     greenhouse 2 rtg, 4 grow lamps on a lever (120 W of 160 W).
//     bench     2 rtg, the logic benches of the experiment room.
//     overload  1 rtg, a bench made to black out: 3 lamps + motor is exactly 80 W, one lamp more is not.
//     plaza     1 water wheel in the pool, through a daylight sensor, 4 street lamps.
// - A lever in a line: the supply comes down a wall to it and the room's line goes back up 2 cells along,
//   so the two never touch (labSwitch). Levers start on (`lever:on`, which the grid takes as it is), and
//   every consumer starts under its bare name: the server renames it `:on` when it has power.
// - A build sends blocks and nothing else (constructionApply), so chests, barrels and fridges are EMPTY:
//   nothing in the game lets a plan fill them. The signs say what to get with /microkit and /give.
// - A telescope is not a block: it is an item raised by hand (astronomy.js). So: an open slit in the dome
//   and an open deck to use it from, and a telescope of blocks that says it is a model. A weather station
//   is a block (weather.js), so a real one stands on the terrace, in the open.
// - The lift moves a block outside the plan, so "/build undo" leaves a platform that is away from its plan
//   cell behind: bring the lift down first. Wheat that has grown is also not what the plan placed.
// Tests: test/js/construction_lab.test.js, and on the real grid pkg/network/construction_lab_test.go.

const LAB_STEP = 6;
const LAB_ROOF_Y = 18;
const LAB_SHAFT = { x: 28, z: 36 };
const LAB_WINCH_Y = 21;
// Each floor's colour: at the back of the shaft and on its sign.
const LAB_FLOORS = [
    ['white', 'Planta baja', 'Ground floor'], ['light_blue', 'Planta 1', 'Floor 1'], ['lime', 'Planta 2', 'Floor 2'], ['orange', 'Azotea', 'Roof']
];
// The periodic table: [symbol, period (1..6), group (1..18)]. Only the elements the game has.
const LAB_ELEMENTS = [
    ['h', 1, 1], ['he', 1, 18],
    ['li', 2, 1], ['be', 2, 2], ['b', 2, 13], ['c', 2, 14], ['n', 2, 15], ['o', 2, 16], ['f', 2, 17], ['ne', 2, 18],
    ['na', 3, 1], ['mg', 3, 2], ['al', 3, 13], ['si', 3, 14], ['p', 3, 15], ['s', 3, 16], ['cl', 3, 17], ['ar', 3, 18],
    ['k', 4, 1], ['ca', 4, 2], ['ti', 4, 4], ['cr', 4, 6], ['mn', 4, 7], ['fe', 4, 8], ['co', 4, 9], ['ni', 4, 10], ['cu', 4, 11], ['zn', 4, 12],
    ['ag', 5, 11], ['sn', 5, 14], ['i', 5, 17],
    ['w', 6, 6], ['pt', 6, 10], ['au', 6, 11], ['hg', 6, 12], ['pb', 6, 14]
];
// Three columns of a letter, five rows, top first.
const LAB_LETTERS = {
    L: ['#..', '#..', '#..', '#..', '###'],
    A: ['###', '#.#', '###', '#.#', '#.#'],
    B: ['##.', '#.#', '##.', '#.#', '##.']
};

// ---------------------------------------------------------------------------------------
// Drawing tools

function labTools(b) {
    const furn = constructionFurnisher(b);
    const marks = {};
    const t = {
        ...furn,
        marks,
        lamps: [],
        mark: (name, x, y, z) => { marks[name] = [x, y, z]; },
        // A short line of Spanish on the board; then, in the reader, more Spanish if needed, and English.
        sign: (x, y, z, facing, ...parts) => b.set(x, y, z, shapeStateName('sign', BLOCK_SHAPES.sign, { facing, mount: 'post' }), { t: parts.join(' // ') }),
        // A run of wire through these points, each leg straight.
        wire(...points) {
            if (points.length === 1) b.set(...points[0], 'copper_wire');
            for (let i = 0; i + 1 < points.length; i++) {
                const [x0, y0, z0] = points[i];
                const [x1, y1, z1] = points[i + 1];
                b.box(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), 'copper_wire');
            }
        },
        lever: (x, y, z, on = false) => b.shaped(x, y, z, 'lever', 'logic_lever', { power: on ? 'on' : 'off' }),
        button: (x, y, z) => b.shaped(x, y, z, 'push_button', 'logic_push_button', { power: 'off' }),
        plate: (x, y, z) => b.shaped(x, y, z, 'pressure_plate', 'logic_pressure_plate', { power: 'off' }),
        gate: (x, y, z, kind, facing) => b.shaped(x, y, z, kind, `logic_${kind}`, kind === 'delay_gate' ? { facing, delay: '2', power: 'off' } : { facing, power: 'off' }),
        daylight: (x, y, z, mode) => b.shaped(x, y, z, 'daylight_sensor', 'logic_daylight_sensor', { mode, power: 'off' }),
        // A lamp hanging on a post from the wire in the ceiling of floor F.
        pendant(x, F, z, room) {
            b.set(x, F + 4, z, 'wire_post');
            b.set(x, F + 3, z, 'electric_lamp');
            t.lamps.push({ room, at: [x, F + 3, z], night: false });
        },
        // A lamp on a longer post from the same ceiling, for where the floor is far under it.
        longPendant(x, F, z, lampY, room) {
            b.box(x, lampY + 1, z, x, F + 4, z, 'wire_post');
            b.set(x, lampY, z, 'electric_lamp');
            t.lamps.push({ room, at: [x, lampY, z], night: false });
        },
        // The lights of a room: from `from` [x, z] (where labSwitch came up) along to a spine at x = spine,
        // rails off it at each z, a lamp at each x of each rail.
        lampGrid(F, from, spine, zs, xs, room) {
            const y = F + 5;
            t.wire([from[0], y, from[1]], [spine, y, from[1]]);
            t.wire([spine, y, Math.min(...zs, from[1])], [spine, y, Math.max(...zs, from[1])]);
            for (const z of zs) {
                t.wire([Math.min(...xs, spine), y, z], [Math.max(...xs, spine), y, z]);
                for (const x of xs) t.pendant(x, F, z, room);
            }
        },
        // Lever at (x, F + 2, z) on an iron bracket, in a line along a wall: the supply comes down over it,
        // `along` (+1 or -1 in z) goes on 2 cells to where the room's line goes up. Returns that ceiling cell.
        // `from` is the x of the supply in the ceiling, which comes through the wall at this z.
        labSwitch(x, F, z, along, from, name) {
            t.wire([from, F + 5, z], [x, F + 5, z], [x, F + 3, z]);
            t.lever(x, F + 2, z, true);
            t.mark(`lever:${name}`, x, F + 2, z);
            for (const k of [0, 1, 2]) b.set(x, F + 1, z + along * k, 'iron_block');
            t.wire([x, F + 2, z + along], [x, F + 2, z + along * 2], [x, F + 5, z + along * 2]);
            return [x, F + 5, z + along * 2];
        },
        scope(x, y, z, facing, name) {
            b.shaped(x, y, z, 'microscope', 'microscope', { facing });
            t.mark(`scope:${name}`, x, y, z);
        },
        chair: (x, y, z, facing, wood = 'dark_oak') => furn.piece(x, y, z, `${wood}_chair`, 'chair', facing),
        door(x, y, z, base, facing, hinge) {
            b.box(x, y, z, x, y + 1, z, null);
            b.door(x, y, z, base, facing, hinge);
        }
    };
    return t;
}

// ---------------------------------------------------------------------------------------
// The shell

function labDrawShell(b, t) {
    const white = 'white_brick';
    // Ground: the paved plaza, the yard behind, a marble floor in the middle, plank and slate floors later.
    b.box(0, 0, 0, 55, 0, 9, 'stone_bricks');
    b.box(25, 0, 0, 30, 0, 9, 'slate');
    b.box(0, 0, 49, 55, 0, 51, 'grass');
    b.box(1, 0, 10, 54, 0, 48, 'concrete');

    for (const F of [0, 6, 12]) {
        if (F) b.box(1, F, 10, 54, F, 48, 'concrete');
        b.box(1, F + 5, 10, 54, F + 5, 48, 'concrete');
    }
    b.box(1, LAB_ROOF_Y, 10, 54, LAB_ROOF_Y, 48, 'slate');

    // Outer walls, stripes of colour at each floor with a line of light under them.
    b.walls(1, 1, 10, 54, 17, 48, white);
    for (const y of [6, 12, 18]) b.walls(1, y, 10, 54, y, 48, 'cyan_brick');
    for (const y of [5, 11, 17]) b.walls(1, y, 10, 54, y, 48, 'glow_block:k6500');
    b.walls(1, 1, 10, 54, 1, 48, 'light_gray_brick');
    for (const x of [1, 54]) for (const z of [10, 48]) b.box(x, 1, z, x, 19, z, 'concrete');

    // Windows: a band on every floor; the bands stop at piers, and at what has to be blank.
    const band = (F, x0, z0, x1, z1, type = 'glass') => b.box(x0, F + 2, z0, x1, F + 4, z1, type);
    for (const F of [0, 6, 12]) {
        for (const [x0, x1] of [[3, 13], [42, 52]]) {
            if (!(F < 12 && x0 === 3)) band(F, x0, 10, x1, 10); // the lecture hall has a screen against the front
            band(F, x0, 48, x1, 48);
        }
        for (const x of [1, 54]) {
            for (let z = 12; z <= 46; z++) {
                if (z % 4 === 0) continue;
                if (x === 1 && z <= 32 && F < 12) continue; // the tall windows of the hall, below
                if (x === 54 && F === 0 && z >= 27) continue; // the power hall has its panels on this wall
                band(F, x, z, x, z);
            }
        }
    }
    // The tall windows of the lecture hall.
    for (let z = 15; z <= 30; z += 4) b.box(1, 2, z, 1, 9, z + 1, 'glass');

    // The glass front of the atrium, mullions at the edges and either side of the door.
    b.box(19, 1, 10, 36, 17, 10, 'glass');
    b.box(19, 18, 10, 36, 18, 10, 'cyan_brick');
    for (const x of [19, 25, 30, 36]) b.box(x, 1, 10, x, 17, 10, 'concrete');
    for (const y of [5, 6, 11, 12]) b.box(19, y, 10, 36, y, 10, 'concrete');
    for (const y of [5, 11]) b.box(19, y, 10, 36, y, 10, 'glow_block:k6500');
    b.box(25, 3, 10, 30, 4, 10, 'concrete');
    b.box(26, 1, 10, 29, 2, 10, null);
    b.doubleDoor(26, 1, 10, 27, 10, 'dark_oak_door', 's');
    b.doubleDoor(28, 1, 10, 29, 10, 'dark_oak_door', 's');
    // A canopy over the door, on two columns. Its lamps are the plaza's.
    b.box(23, 5, 6, 32, 5, 9, 'concrete');
    b.box(23, 5, 6, 32, 5, 6, 'cyan_brick');
    for (const x of [23, 32]) b.box(x, 1, 6, x, 4, 6, 'marble');

    // The letters over the front: LAB on a dark panel.
    b.box(20, 19, 10, 35, 25, 10, 'blue_brick');
    b.box(20, 26, 10, 35, 26, 10, 'cyan_brick');

    // Holes in the slabs: the atrium, and the lecture hall takes two floors.
    for (const y of [5, 6, 11, 12, 17, 18]) b.box(19, y, 15, 36, y, 25, null);
    for (const y of [5, 6]) b.box(2, y, 11, 14, y, 32, null);

    // Walls of the corridors, which the rooms open from.
    for (const F of [0, 6, 12]) {
        for (const x of [15, 40]) b.box(x, F + 1, 11, x, F + 4, 47, 'white_brick');
        // The wall between the front and back rooms of the east wing; chemistry on floor 2 takes both.
        if (F < 12) b.box(41, F + 1, 26, 53, F + 4, 26, 'white_brick');
    }
    b.box(2, 1, 33, 14, 11, 33, 'white_brick');
    b.box(2, 13, 33, 14, 16, 33, 'white_brick');

    // Railings round the atrium on floors 1 and 2, and the bridge across the front.
    for (const F of [6, 12]) {
        for (let z = 14; z <= 25; z++) {
            b.set(18, F + 1, z, 'iron_bars');
            b.set(37, F + 1, z, 'iron_bars');
        }
        b.box(19, F + 1, 14, 36, F + 1, 14, 'iron_bars');
        // Up to the wall of the table, with no gap at its end.
        b.set(18, F + 1, 26, 'iron_bars');
        b.set(37, F + 1, 26, 'iron_bars');
    }

    // The wall of the periodic table, with the double door through it on the ground floor.
    b.box(19, 1, 26, 36, 17, 26, 'gray_brick');
    b.box(27, 1, 26, 28, 2, 26, null);
    b.doubleDoor(27, 1, 26, 28, 26, 'birch_door', 's');
    for (const [symbol, period, group] of LAB_ELEMENTS) b.set(18 + group, 14 - period, 26, `element_${symbol}`);
    // Mirrors each side of the door, a line of light over the table.
    b.box(19, 1, 26, 25, 4, 26, 'mirror');
    b.box(30, 1, 26, 36, 4, 26, 'mirror');
    b.box(19, 14, 26, 36, 14, 26, 'glow_block:rgb035');
    b.box(19, 7, 26, 36, 7, 26, 'glow_block:rgb035');

    // The roof over the atrium: a hip of glass on steel ribs.
    for (let k = 0; k <= 5; k++) {
        const y = LAB_ROOF_Y + k;
        const [x0, x1, z0, z1] = [19 + k, 36 - k, 14 + k, 25 - k];
        b.walls(x0, y, z0, x1, y, z1, 'glass');
        // Over the ring below too: it steps in, and there is no gap at the corners.
        if (k) b.walls(x0, y - 1, z0, x1, y - 1, z1, 'glass');
        for (const x of [x0, x1]) for (const z of [z0, z1]) b.box(x, k ? y - 1 : y, z, x, y, z, 'iron_block');
    }
    b.box(25, LAB_ROOF_Y + 5, 20, 30, LAB_ROOF_Y + 5, 20 - 1, 'glass');
    for (const x of [19, 36]) b.box(x, LAB_ROOF_Y, 14, x, LAB_ROOF_Y, 25, 'iron_block');
    for (const z of [14, 25]) b.box(19, LAB_ROOF_Y, z, 36, LAB_ROOF_Y, z, 'iron_block');

    // The parapet, broken by the letters' panel.
    b.walls(1, 19, 10, 54, 19, 48, 'white_brick');
    b.walls(1, 20, 10, 54, 20, 48, 'iron_bars');
    for (const x of [1, 54]) for (const z of [10, 48]) b.set(x, 20, z, 'concrete');
    b.box(20, 19, 10, 35, 19, 10, 'blue_brick');
    b.box(20, 20, 10, 35, 20, 10, 'blue_brick');
    // Written from the outside, looking at the front: x runs the other way.
    ['L', 'A', 'B'].forEach((letter, i) => {
        LAB_LETTERS[letter].forEach((row, r) => {
            [...row].forEach((on, c) => {
                if (on === '#') b.set(33 - i * 5 - c, 25 - r, 10, 'glow_block:k6500');
            });
        });
    });
}

// A helix up the middle of the atrium, of glow blocks: only something to look at, and it stands on a plinth.
function labDrawHelix(b) {
    const cx = 27.5;
    const cz = 19.5;
    b.box(24, 1, 16, 31, 1, 23, 'marble');
    b.box(25, 2, 17, 30, 2, 22, 'basalt');
    const strand = (phase, color) => {
        let last = null;
        for (let y = 3; y <= 22; y++) {
            const angle = (y - 3) * 0.6 + phase;
            const x = Math.round(cx + Math.cos(angle) * 2.5);
            const z = Math.round(cz + Math.sin(angle) * 2.5);
            // Steps sideways before going up, so it holds together face to face.
            if (last) {
                for (let px = last[0]; px !== x; px += Math.sign(x - px)) b.set(px, y, last[1], color);
                for (let pz = last[1]; pz !== z; pz += Math.sign(z - pz)) b.set(x, y, pz, color);
            }
            b.set(x, y, z, color);
            last = [x, z];
        }
    };
    strand(0, 'glow_block:rgb045');
    strand(Math.PI, 'glow_block:rgb503');
    for (let y = 4; y <= 22; y += 4) {
        const angle = (y - 3) * 0.6;
        const [ax, az] = [Math.round(cx + Math.cos(angle) * 2.5), Math.round(cz + Math.sin(angle) * 2.5)];
        const [ex, ez] = [Math.round(cx - Math.cos(angle) * 2.5), Math.round(cz - Math.sin(angle) * 2.5)];
        for (let x = Math.min(ax, ex); x <= Math.max(ax, ex); x++) b.set(x, y, az, 'glow_block:k5000');
        for (let z = Math.min(az, ez); z <= Math.max(az, ez); z++) b.set(ex, y, z, 'glow_block:k5000');
    }
    // A stem from the plinth to the helix, and it touches the roof at the top.
    b.box(27, 3, 19, 28, 3, 20, 'iron_block');
}

// ---------------------------------------------------------------------------------------
// The core: stairs, lift, each floor's cupboard, the toilets and the store.

function labDrawCore(b, t) {
    // Walls of the core on each floor and the cross corridor in front of it.
    for (const F of [0, 6, 12]) {
        b.box(19, F + 1, 30, 19, F + 4, 47, 'concrete');
        b.box(36, F + 1, 30, 36, F + 4, 47, 'concrete');
        b.box(19, F + 1, 30, 36, F + 4, 30, 'concrete');
        b.box(19, F + 1, 38, 25, F + 4, 38, 'concrete');
        b.box(25, F + 1, 31, 25, F + 4, 38, 'concrete');
        b.box(32, F + 1, 31, 32, F + 4, 38, 'concrete');
        b.box(19, F + 1, 38, 36, F + 4, 38, 'concrete');
        b.box(28, F + 1, 39, 28, F + 4, 47, 'concrete');
        // Ways in: the stairs and the lift's lobby are open to the corridor.
        b.box(21, F + 1, 30, 23, F + 3, 30, null);
        b.box(27, F + 1, 30, 29, F + 3, 30, null);
        t.door(34, F + 1, 30, 'oak_door', 's');
        // The toilets from the west corridor, the store from the east.
        t.door(19, F + 1, 43, 'birch_door', 'e');
        t.door(36, F + 1, 43, 'birch_door', 'w');
        b.box(20, F, 39, 27, F, 47, 'marble');
        b.box(26, F, 31, 31, F, 34, 'slate');
        // A sign in the lobby of the lift.
        labLiftSign(t, F);
    }
    labDrawStairs(b, t);
    labDrawLift(b, t);
    for (const F of [0, 6, 12]) {
        labDrawToilets(b, t, F);
        labDrawStore(b, t, F);
    }
}

// How the lift works, in its lobby on every floor.
function labLiftSign(t, F) {
    const [, es, en] = LAB_FLOORS[F / LAB_STEP];
    t.sign(31, F + 1, 34, 'w', `Ascensor: ${es}`, 'El bloque sobre la puerta lo llama. Dentro, verde a la azotea, rojo abajo; de camino, toca el bloque de tu planta.',
        `Lift, ${en}. The block over the door calls it. Inside, green to the roof, red to the ground; on the way, click your floor's block.`);
}

function labDrawStairs(b, t) {
    const stair = 'stone_brick_stairs';
    const flat = 'stone_bricks';
    for (const F of [0, 6, 12]) {
        // Up the west side, a landing at the end, back up the east side, a wall between.
        b.box(22, F + 1, 33, 22, F + 4, 35, 'concrete');
        b.box(20, F + 5, 34, 21, F + 6, 37, null);
        b.box(22, F + 5, 36, 24, F + 6, 37, null);
        b.box(23, F + 5, 33, 24, F + 6, 35, null);
        for (const x of [20, 21, 23, 24]) {
            if (x < 22) {
                b.stairs(x, F + 1, 33, stair, 's');
                b.stairs(x, F + 2, 34, stair, 's');
                b.stairs(x, F + 3, 35, stair, 's');
            } else {
                b.stairs(x, F + 4, 35, stair, 'n');
                b.stairs(x, F + 5, 34, stair, 'n');
                b.stairs(x, F + 6, 33, stair, 'n');
            }
        }
        b.box(20, F + 3, 36, 24, F + 3, 37, flat);
        // Nothing to crawl into under the landing and the upper flight.
        b.box(20, F + 1, 36, 24, F + 2, 37, 'concrete');
        if (!F) b.box(23, F + 1, 33, 24, F + 3, 35, 'concrete');
        // Light that needs no power, on the stairs at least.
        b.set(21, F + 4, 38, 'concrete');
        b.shaped(20, F + 4, 37, 'lantern', 'lantern', { mount: 'floor' });
        b.shaped(24, F + 4, 37, 'lantern', 'lantern', { mount: 'floor' });
    }
    // Round the top of the well, on the roof.
    const R = LAB_ROOF_Y;
    labLiftSign(t, R);
    b.box(20, R + 1, 33, 22, R + 1, 33, 'iron_bars');
    b.box(22, R + 1, 34, 22, R + 3, 35, 'concrete');
    b.box(20, R + 1, 38, 25, R + 3, 38, 'concrete');
    b.box(25, R + 1, 33, 25, R + 3, 37, 'concrete');
}

function labDrawLift(b, t) {
    const { x: sx, z: sz } = LAB_SHAFT;
    const at = (dx, y, dz, type) => b.set(sx + dx, y, sz + dz, type);
    const top = LAB_WINCH_Y - 3;
    b.box(sx - 3, 1, sz - 1, sx + 3, LAB_WINCH_Y + 2, sz + 2, 'concrete');
    b.box(sx, 1, sz, sx, LAB_WINCH_Y - 1, sz, null);
    b.set(sx, 0, sz, 'lift_platform');
    at(0, LAB_WINCH_Y, 0, 'lift_winch');
    // Its own rtg, behind the winch: touching nothing else electric.
    at(0, LAB_WINCH_Y, 1, 'rtg');

    // Green bus up the east side to the top of the highest stop.
    b.box(sx + 2, 2, sz, sx + 2, LAB_WINCH_Y + 1, sz, 'copper_wire');
    t.wire([sx + 2, LAB_WINCH_Y + 1, sz], [sx + 2, LAB_WINCH_Y + 1, sz - 1], [sx, LAB_WINCH_Y + 1, sz - 1]);
    // Red bus up the west side, to the top of the lobby's stop.
    b.box(sx - 2, 4, sz, sx - 2, top + 2, sz, 'copper_wire');
    t.wire([sx - 2, 4, sz], [sx - 2, 4, sz - 1], [sx, 4, sz - 1]);

    for (let n = 0; n <= 3; n++) {
        const F = n * LAB_STEP;
        // The door of the shaft and the stop over it, which holds the platform level with this floor.
        at(0, F + 1, -1, null);
        at(0, F + 2, -1, null);
        b.door(sx, F + 1, sz - 1, 'iron_door', 's');
        at(0, F + 3, -1, 'lift_stop');
        t.mark(`stop:${n}`, sx, F + 3, sz - 1);
        at(0, F + 1, 1, `${LAB_FLOORS[n][0]}_wool`);
        // A light in a niche, on the side the green bus does not take at the top.
        const niche = n === 3 ? -1 : 1;
        at(niche, F + 3, 0, null);
        b.shaped(sx + niche, F + 3, sz, 'lantern', 'lantern', { mount: 'hanging' });
        if (n < 3) {
            at(1, F + 1, 0, 'lime_wool');
            at(1, F + 2, 0, null);
            t.button(sx + 1, F + 2, sz);
            t.mark(`green:${n}`, sx + 1, F + 2, sz);
        }
        if (n > 0) {
            at(-1, F + 1, 0, 'red_wool');
            at(-1, F + 2, 0, null);
            t.button(sx - 1, F + 2, sz);
            t.mark(`red:${n}`, sx - 1, F + 2, sz);
        }
    }
    t.mark('winch', sx, LAB_WINCH_Y, sz);
    t.mark('platform', sx, 0, sz);
}

function labDrawToilets(b, t, F) {
    const { piece } = t;
    for (const x of [21, 24]) {
        piece(x, F + 1, 47, 'toilet', 'toilet', 'n');
        b.box(x + 1, F + 1, 45, x + 1, F + 3, 47, 'light_gray_brick');
    }
    for (const x of [21, 23, 25]) {
        piece(x, F + 1, 39, 'sink', 'sink', 's');
        piece(x, F + 2, 39, 'wall_mirror', 'wall_mirror', 's');
    }
    b.set(27, F + 1, 47, 'flower_pot');
    b.set(21, F + 2, 47, 'table_lamp');
    b.set(27, F + 2, 47, 'table_lamp');
}

// The store behind the core, from the east corridor: shelves, barrels, a chest. Only furniture.
function labDrawStore(b, t, F) {
    const { piece } = t;
    for (const x of [30, 31, 32, 33, 34, 35]) {
        piece(x, F + 1, 47, 'barrel', 'barrel', 'n');
        if (x % 2) piece(x, F + 3, 47, 'wall_shelf', 'wall_shelf', 'n');
    }
    piece(29, F + 1, 40, 'chest', 'chest', 'e');
    piece(29, F + 1, 41, 'chest', 'chest', 'e');
    b.set(35, F + 1, 39, 'flower_pot');
}

// The cupboard of an upper floor: 6 rtg and 3 batteries at the back, a lever as main switch, and the
// floor's supply up into the ceiling, from where that floor's lines start.
function labDrawCupboard(b, t, F, n) {
    const { piece } = t;
    for (const x of [33, 34, 35]) {
        b.box(x, F + 1, 37, x, F + 2, 37, 'rtg');
        b.set(x, F + 3, 37, 'battery_block');
    }
    t.mark(`rtg:floor${n}`, 33, F + 1, 37);
    t.wire([33, F + 4, 37]);
    b.box(33, F + 1, 35, 33, F + 3, 36, 'iron_block');
    t.lever(33, F + 4, 36, true);
    t.mark(`lever:floor${n}`, 33, F + 4, 36);
    t.wire([33, F + 4, 35], [33, F + 5, 35], [33, F + 5, 28]);
    piece(35, F + 1, 33, 'chest', 'chest', 'w');
    b.set(33, F + 1, 32, 'flower_pot');
    t.sign(35, F + 1, 35, 'w', `Cuadro: planta ${n}`, 'Seis RTG de 80 W, de día y de noche. La palanca alta corta la planta. Multímetro: /give multimeter, clic derecho en algo eléctrico.',
        `Floor ${n}'s board. 6 rtg of 80 W, day and night. The high lever cuts the floor. /give multimeter, right click anything electric.`);
    b.set(35, F + 2, 33, 'table_lamp');
}

// ---------------------------------------------------------------------------------------
// The ground floor

function labDrawLobby(b, t) {
    const { piece, sign } = t;
    // Marble and basalt under the atrium, the same under the bridge.
    for (let z = 11; z <= 25; z++) {
        for (let x = 16; x <= 39; x++) b.set(x, 0, z, (x + z) % 2 ? 'marble' : 'basalt');
    }
    b.box(26, 0, 11, 29, 0, 15, 'slate');
    b.box(27, 0, 16, 28, 0, 25, 'slate');
    b.box(16, 0, 26, 39, 0, 29, 'light_gray_brick');
    b.box(16, 0, 30, 18, 0, 47, 'light_gray_brick');
    b.box(37, 0, 30, 39, 0, 47, 'light_gray_brick');
    b.box(19, 0, 14, 19, 0, 25, 'glow_block:rgb035');
    b.box(36, 0, 14, 36, 0, 25, 'glow_block:rgb035');

    labDrawHelix(b);
    // Lanterns on the corners of the plinth: the back of the atrium has no ceiling to hang anything from.
    for (const x of [24, 31]) for (const z of [16, 23]) t.lantern(x, 2, z, 'floor');

    // The two flights up to floor 1, along the side of the atrium, with a landing in the gallery's gap.
    b.sym(() => {
        for (let k = 0; k < 6; k++) {
            for (const x of [19, 20, 21]) {
                if (k) b.box(x, 1, 24 - k, x, k, 24 - k, 'stone_bricks');
                b.stairs(x, 1 + k, 24 - k, 'stone_brick_stairs', 'n');
            }
            // A low wall on the side of the atrium, the railing on top.
            b.box(22, 1, 24 - k, 22, 1 + k, 24 - k, 'stone_bricks');
            b.set(22, 2 + k, 24 - k, 'iron_bars');
            // And on the corridor's side, up to the gallery's floor, which goes on from there.
            if (k <= 3) b.box(18, 1, 24 - k, 18, 1 + k, 24 - k, 'stone_bricks');
            if (k <= 2) b.set(18, 2 + k, 24 - k, 'iron_bars');
        }
        b.box(19, 6, 15, 22, 6, 18, 'marble');
        b.box(22, 7, 16, 22, 7, 18, 'iron_bars');
        b.box(19, 7, 15, 22, 7, 15, 'iron_bars');
        b.box(18, 7, 16, 18, 7, 18, null);
        // Nobody edges along the gallery's lip, over the flight.
        b.set(19, 7, 20, 'iron_bars');
        for (const z of [16, 18]) b.box(21, 1, z, 21, 5, z, 'marble');
        // A pot at each corner of the lobby's front.
        b.set(16, 1, 11, 'flower_pot');
        b.set(24, 1, 11, 'flower_pot');
        // Sofas under the bridge, looking in, at the sides of the door.
        for (let x = 18; x <= 21; x++) piece(x, 1, 11, 'cyan_sofa', 'sofa', 's');
        b.box(18, 1, 12, 21, 1, 13, 'light_blue_carpet');
    });
    b.set(19, 2, 12, 'vase');

    // The reception, ahead of the door on its left, with its computer of a lamp, and a chair behind it.
    for (let x = 31; x <= 34; x++) b.set(x, 1, 14, 'lab_bench');
    t.chair(32, 1, 13, 's', 'birch');
    b.set(32, 2, 14, 'table_lamp');
    b.set(34, 2, 14, 'vase');
    sign(29, 1, 15, 'n', 'Instituto: bienvenido', 'Abajo: aula, comedor, taller, central. Planta 1: microscopios. Planta 2: experimentos y química. Azotea: observatorio.',
        'Ground: lecture hall, canteen, workshop, power hall. 1: microscopes. 2: experiments, chemistry. Roof: observatory.');
    sign(24, 1, 25, 'n', 'Tabla periódica', 'Cada bloque es un elemento del juego, en su sitio. Faltan los que el juego no tiene. Guía, página 116.',
        'The periodic table: each block is an element the game has, in its place. Those it lacks are left blank. Guide, page 116.');
    sign(31, 1, 25, 'n', 'Doble hélice', 'Decoración: bloques luminosos, que no dan luz ni hacen nada. Pero es bonita.', 'A double helix of glow blocks: only decoration, they give no light and do nothing.');
    }

function labDrawLectureHall(b, t) {
    const { piece, sign } = t;
    // The stage on the floor at the front wall, and the seats rising to the door from floor 1 at the top.
    b.box(2, 0, 11, 14, 0, 32, 'spruce_planks');
    b.box(2, 0, 11, 14, 0, 17, 'dark_oak_planks');
    // Rows: each a step of one up, two deep, with the aisle's stairs; solid only under its top.
    for (let row = 0; row < 6; row++) {
        const y = 1 + row;
        const z = 18 + row * 2;
        b.box(2, Math.max(1, y - 1), z, 14, y, z + 1, 'spruce_planks');
        t.benches(3, 7, y + 1, z + 1, 'n');
        t.benches(10, 13, y + 1, z + 1, 'n');
        for (const x of [8, 9]) b.stairs(x, y, z, 'dark_oak_stairs', 's');
    }
    // The landing at the top is floor 1's level, y = 6.
    b.box(2, 5, 30, 14, 6, 32, 'spruce_planks');
    b.box(2, 6, 30, 14, 6, 32, 'dark_oak_planks');
    t.door(15, 7, 31, 'dark_oak_door', 'w');
    t.door(15, 1, 14, 'dark_oak_door', 'w');
    sign(11, 7, 30, 'e', 'Aula magna', 'Baja por el pasillo central. Clic derecho en un banco: te sientas; Agacharse: te levantas.', 'Lecture hall. Down the middle aisle. Right click a bench to sit, Sneak to stand.');

    // The screen on the wall at the front: the sun and its planets, in glow blocks. Only a picture.
    b.box(2, 2, 11, 14, 10, 11, 'black_brick');
    b.box(3, 3, 11, 13, 9, 11, 'glow_block:rgb001');
    const sun = [[4, 6], [4, 7], [4, 5], [3, 6], [5, 6]];
    for (const [x, y] of sun) b.set(x, y, 11, 'glow_block:rgb530');
    for (const [x, y, c] of [[7, 6, 'rgb421'], [9, 7, 'rgb135'], [11, 5, 'rgb510'], [12, 8, 'rgb542']]) b.set(x, y, 11, `glow_block:${c}`);
    // The lectern and a table with a demonstration on it.
    piece(5, 1, 14, 'desk', 'desk', 's');
    t.chair(5, 1, 13, 's');
    b.set(5, 2, 14, 'table_lamp');
    b.box(9, 1, 14, 11, 1, 14, 'lab_bench');
    b.set(9, 2, 14, 'vase');
    b.set(11, 2, 14, 'flower_pot');
    sign(13, 1, 16, 's', 'Hoy: el Sol y sus planetas', 'La pantalla es solo un dibujo con bloques luminosos.', 'Today: the sun and its planets. The screen is only a picture in glow blocks.');
    // Its lights hang from floor 1's supply, with the switch by the top door.
    const [, , lz] = t.labSwitch(14, 6, 28, -1, 16, 'hall');
    b.box(14, 6, 26, 14, 6, 27, 'spruce_planks');
    t.wire([14, 11, lz], [6, 11, lz]);
    t.wire([6, 11, 14], [6, 11, 31]);
    t.wire([11, 11, 14], [11, 11, lz]);
    t.wire([6, 11, 14], [11, 11, 14]);
    // Low over the stage, higher as the seats rise.
    for (const [z, lampY] of [[14, 4], [20, 6], [lz, 8]]) {
        t.longPendant(6, 6, z, lampY, 'hall');
        t.longPendant(11, 6, z, lampY, 'hall');
    }
    t.wire([11, 11, lz], [11, 11, 31]);
    t.longPendant(6, 6, 31, 9, 'hall');
    t.longPendant(11, 6, 31, 9, 'hall');
}

function labDrawCanteen(b, t) {
    const { piece, sign, oven } = t;
    b.box(2, 0, 34, 14, 0, 47, 'birch_planks');
    t.door(15, 1, 38, 'birch_door', 'w');
    const [, , lz] = t.labSwitch(14, 0, 42, 1, 16, 'canteen');
    t.lampGrid(0, [14, lz], 8, [37, 44], [5, 11], 'canteen');
    // The long table, the chairs along it.
    for (const z of [37, 41]) {
        b.box(4, 1, z, 11, 1, z, 'table');
        for (let x = 4; x <= 11; x++) {
            t.chair(x, 1, z - 1, 's', 'birch');
            t.chair(x, 1, z + 1, 'n', 'birch');
        }
        b.set(6, 2, z, 'vase');
        b.set(9, 2, z, 'candle');
    }
    // The counter at the back.
    for (let x = 3; x <= 11; x++) b.set(x, 1, 47, 'lab_bench');
    oven(4, 1, 47, 'n');
    piece(6, 1, 47, 'sink', 'sink', 'n');
    b.set(8, 1, 47, 'workbench');
    piece(10, 1, 47, 'barrel', 'barrel', 'n');
    piece(5, 2, 34, 'wall_clock', 'wall_clock', 's');
    piece(9, 2, 34, 'painting_meadow', 'painting', 's');
    b.set(2, 1, 34, 'flower_pot');
    sign(13, 1, 37, 'w', 'Comedor', 'Horno y fregadero de verdad. El horno necesita carbón y comida: un plano solo pone bloques.', 'Canteen. A real oven and sink. The oven wants coal and food: a build only places blocks.');
}

function labDrawWorkshop(b, t) {
    const { piece, sign } = t;
    b.box(41, 0, 11, 53, 0, 25, 'slate');
    t.door(40, 1, 13, 'oak_door', 'e');
    const [, , lz] = t.labSwitch(41, 0, 16, 1, 39, 'workshop');
    t.lampGrid(0, [41, lz], 47, [14, 22], [44, 50], 'workshop');
    for (let x = 43; x <= 52; x++) b.set(x, 1, 25, 'lab_bench');
    b.set(44, 1, 25, 'workbench');
    b.set(47, 1, 25, 'workbench');
    piece(50, 1, 25, 'chest', 'chest', 'n');
    piece(51, 1, 25, 'chest', 'chest', 'n');
    for (const x of [44, 46, 48, 50]) piece(x, 3, 25, 'wall_shelf', 'wall_shelf', 'n');
    b.set(45, 2, 25, 'iron_block');
    b.set(46, 2, 25, 'copper_block');
    // The bench for trying circuits by hand: a crank and a bulb that need nothing else.
    b.box(45, 1, 14, 49, 1, 14, 'lab_bench');
    b.set(46, 2, 14, 'hand_crank');
    b.set(47, 2, 14, 'light_bulb');
    t.mark('crank', 46, 2, 14);
    t.lamps.push({ room: 'crank', at: [47, 2, 14], night: false, manual: true });
    t.chair(46, 1, 13, 's');
    sign(49, 1, 15, 's', 'Manivela: clic derecho', 'Clic derecho en la manivela: 100 W durante 4 segundos, y la bombilla luce mientras gires.', 'Right click the crank: 100 W for 4 seconds, and the bulb glows as long as you turn it.');
    piece(53, 1, 12, 'barrel', 'barrel', 'w');
    piece(53, 1, 13, 'barrel', 'barrel', 'w');
    sign(42, 1, 12, 's', 'Taller', 'Mesas de trabajo de verdad; el resto, herramientas y piezas de adorno.', 'Workshop: real crafting tables; the rest is ornament.');
}

// The power hall: the main network. 6 rtg, an isolator; 8 batteries; the riser to the roof; the main switch.
function labDrawPowerHall(b, t) {
    const { piece, sign } = t;
    b.box(41, 0, 27, 53, 0, 47, 'basalt');
    t.door(40, 1, 30, 'iron_door', 'e');
    // A window on the corridor, to see it from outside.
    b.box(40, 2, 34, 40, 4, 44, 'glass');
    // The rtgs and the bus on top of them, the isolator between them and the rest.
    b.box(42, 1, 46, 47, 1, 46, 'rtg');
    t.wire([42, 2, 46], [47, 2, 46]);
    t.mark('rtg:main', 43, 1, 46);
    b.set(48, 1, 46, 'iron_block');
    t.lever(48, 2, 46, true);
    t.mark('lever:rtg', 48, 2, 46);
    // The batteries, 2 rows; the bus along them.
    b.box(49, 1, 46, 52, 1, 47, 'battery_block');
    t.wire([49, 2, 46], [52, 2, 46]);
    t.mark('battery:main', 49, 1, 46);
    // The main switch: on the bus, the supply on over it.
    t.lever(50, 3, 46, true);
    t.mark('lever:main', 50, 3, 46);
    b.set(50, 4, 46, 'wire_post');
    t.wire([50, 5, 46], [39, 5, 46], [39, 5, 16]);
    t.wire([39, 5, 28], [16, 5, 28], [16, 5, 46]);
    // The hall's own light.
    const [, , lz] = t.labSwitch(41, 0, 33, 1, 39, 'powerhall');
    t.lampGrid(0, [41, lz], 47, [30, 36, 43], [45, 50], 'powerhall');
    // A panel of bulbs on the bus: lit while it has power, and a thing to probe.
    b.box(43, 1, 44, 43, 2, 44, 'iron_block');
    b.box(43, 3, 44, 43, 3, 45, 'copper_wire');
    b.set(43, 3, 46, 'copper_wire');
    b.set(44, 3, 44, 'light_bulb');
    t.lamps.push({ room: 'indicator', at: [44, 3, 44], night: false });
    b.set(44, 1, 44, 'iron_block');
    b.set(44, 2, 44, 'iron_block');
    // Transformers: only iron and copper, and they say so. The desk with a chest for the multimeter.
    for (const z of [30, 34, 38]) {
        b.box(52, 1, z, 53, 3, z + 1, 'iron_block');
        b.box(52, 4, z, 53, 4, z + 1, 'copper_block');
    }
    piece(44, 1, 29, 'desk', 'desk', 's');
    t.chair(44, 1, 28, 's');
    b.set(44, 2, 29, 'table_lamp');
    piece(47, 1, 27, 'chest', 'chest', 's');
    piece(48, 1, 27, 'chest', 'chest', 's');
    piece(49, 3, 27, 'wall_clock', 'wall_clock', 's');
    sign(42, 1, 32, 'e', 'Central eléctrica', '6 RTG (480 W), 8 baterías, 24 placas y 2 molinos en la azotea. Una red es todo o nada: demanda menor que generación.', 'Power hall. 6 rtg (480 W), 8 batteries, 24 panels and 2 turbines on the roof. A network is all or nothing: demand must stay under generation.');
    sign(46, 1, 44, 'n', 'RTG', 'La palanca baja del todo aísla los RTG: quedan el sol, el viento y las baterías. Mira el multímetro.', 'The lever by the rtgs isolates them: only sun, wind and batteries are left. Watch the multimeter.');
    sign(51, 1, 44, 'n', 'Interruptor general', 'La palanca alta corta la planta baja y las luces nocturnas. Las baterías se siguen cargando.', 'The high lever cuts the ground floor and the night lights. The batteries go on charging.');
    sign(51, 1, 33, 'w', 'Transformadores', 'Decoración: hierro y cobre, sin función.', 'Transformers: decoration, iron and copper with no function.');
}

// Lamps of the lobby that come on at night: a daylight sensor in the ceiling, between the supply and them.
function labDrawNightLights(b, t) {
    t.daylight(38, 5, 16, 'night');
    t.mark('sensor:lobby', 38, 5, 16);
    t.wire([37, 5, 16], [37, 5, 13], [18, 5, 13], [18, 5, 25]);
    t.wire([37, 5, 16], [37, 5, 25]);
    for (const [x, z] of [[18, 16], [18, 25], [37, 19], [37, 25], [22, 13], [33, 13], [27, 13], [18, 13], [37, 13]]) {
        b.set(x, 4, z, 'wire_post');
        b.set(x, 3, z, 'electric_lamp');
        t.lamps.push({ room: 'lobby', at: [x, 3, z], night: true });
    }
}

function labDrawGroundCorridors(b, t) {
    for (const [x, z] of [[16, 34], [16, 42], [39, 34], [39, 42], [24, 28], [32, 28]]) t.pendant(x, 0, z, 'ground corridor');
    t.wire([16, 5, 46], [16, 5, 47]);
    t.wire([39, 5, 46], [39, 5, 47]);
    labDrawLandingLights(b, t, 0);
    t.sign(18, 1, 28, 'e', 'Aula, comedor: este lado', 'Aula magna y comedor por este lado; central y taller por el otro.', 'Lecture hall and canteen this way; power hall and workshop the other.');
    // Light for the toilets and the store, off the back of the line.
    labDrawCoreBack(b, t, 0);
    // The cupboard of the ground floor holds no generators: the power hall does that.
    t.piece(35, 1, 33, 'chest', 'chest', 'w');
    t.piece(35, 1, 34, 'barrel', 'barrel', 'w');
    t.sign(33, 1, 32, 's', 'Archivo', 'Solo archivo. La electricidad de esta planta sale de la central.', 'Only an archive. This floor gets its power from the power hall.');
    t.lantern(35, 1, 36, 'floor');
}

// The toilets and the store: on each floor, a lamp off the corridor's line through the wall.
function labDrawCoreBack(b, t, F) {
    t.wire([16, F + 5, 44], [24, F + 5, 44]);
    t.pendant(24, F, 44, `core ${F}`);
    t.wire([39, F + 5, 44], [32, F + 5, 44]);
    t.pendant(32, F, 44, `core ${F}`);
    t.wire([22, F + 5, 44], [22, F + 5, 41]);
    t.pendant(22, F, 41, `core ${F}`);
    t.wire([32, F + 5, 44], [32, F + 5, 41]);
    t.pendant(32, F, 41, `core ${F}`);
}

// The landing of the stairs and the lobby of the lift, off the line in the cross corridor.
function labDrawLandingLights(b, t, F) {
    t.wire([22, F + 5, 28], [22, F + 5, 31]);
    t.pendant(22, F, 31, `core ${F}`);
    t.wire([28, F + 5, 28], [28, F + 5, 32]);
    t.pendant(28, F, 32, `core ${F}`);
}

// The plaza, in front: the pool with the water wheel that lights the street lamps, the other pool, trees.
function labDrawPlaza(b, t) {
    const { sign, piece } = t;
    b.sym(() => {
        b.walls(13, 1, 2, 22, 1, 7, 'stone_bricks');
        b.box(14, 0, 3, 21, 1, 6, 'water');
        // Trees at the corners, benches looking at the pool.
        b.box(4, 1, 4, 4, 4, 4, 'birch_wood');
        b.box(3, 5, 3, 5, 5, 5, 'birch_leaves');
        b.set(4, 6, 4, 'birch_leaves');
        b.box(9, 1, 5, 9, 3, 5, 'birch_wood');
        b.box(8, 4, 4, 10, 4, 6, 'birch_leaves');
        for (let z = 3; z <= 6; z++) piece(12, 1, z, 'bench', 'bench', 'e');
    });
    // The wheel, in the west pool, on water all round.
    b.set(16, 1, 5, shapeStateName('water_wheel', BLOCK_SHAPES.electric_wheel, { axis: 'z' }));
    t.mark('wheel', 16, 1, 5);
    t.wire([16, 0, 5], [16, 0, 6]);
    // The sensor in the foot of the rim, under a pane of glass to see it by.
    t.daylight(16, 0, 7, 'night');
    t.mark('sensor:plaza', 16, 0, 7);
    b.set(16, 1, 7, 'glass');
    // Under a kerb along the plaza, to the lamps each side of the path.
    t.wire([16, 0, 8], [31, 0, 8]);
    for (const [x, z] of [[24, 8], [31, 8], [24, 2], [31, 2]]) {
        t.wire([x, 0, 8], [x, 0, z]);
        b.box(x, 1, z, x, 3, z, 'wire_post');
        b.set(x, 4, z, 'electric_lamp');
        t.lamps.push({ room: 'plaza', at: [x, 4, z], night: true });
    }
    for (let x = 16; x <= 30; x++) if (x !== 24) b.set(x, 1, 8, 'stone_bricks_slab');
    for (let z = 3; z <= 7; z++) {
        for (const x of [24, 31]) b.set(x, 1, z, 'stone_bricks_slab');
    }
    sign(23, 1, 1, 'n', 'Laboratorio', 'Instituto de investigación. Clic derecho en un cartel: lo lees entero. /build undo lo quita todo; baja antes el ascensor.',
        'A research institute. Right click a sign to read all of it. /build undo takes it away: bring the lift down first.');
    sign(13, 2, 8, 'n', 'Rueda hidráulica', 'Da 105 W con agua a los lados. De noche un sensor enciende las 4 farolas, sin red ni pilas.', 'A water wheel: 105 W with water around it. At night a sensor lights the 4 street lamps, with no other supply.');
    b.set(13, 1, 8, 'stone_bricks');
    b.set(1, 1, 8, 'flower_pot');
    b.set(54, 1, 8, 'flower_pot');
    // The yard behind.
    b.box(52, 1, 50, 52, 3, 50, 'birch_wood');
    b.box(51, 4, 49, 53, 4, 51, 'birch_leaves');
    b.box(3, 1, 50, 3, 3, 50, 'birch_wood');
    b.box(2, 4, 49, 4, 4, 51, 'birch_leaves');
}

// ---------------------------------------------------------------------------------------
// Floor 1: microscopes, darkroom, samples, genetics, library

function labFloor1Supply(b, t) {
    const F = 6;
    const y = F + 5;
    labDrawCupboard(b, t, F, 1);
    t.wire([16, y, 28], [39, y, 28]);
    t.wire([39, y, 12], [39, y, 46]);
    t.wire([16, y, 12], [16, y, 46]);
    t.wire([16, y, 12], [39, y, 12]);
    for (const [x, z] of [[16, 18], [39, 18], [16, 36], [39, 36], [16, 44], [39, 44], [23, 12], [32, 12], [24, 28], [31, 28], [16, 27], [39, 27]]) t.pendant(x, F, z, 'floor 1 corridor');
    labDrawLandingLights(b, t, F);
    labDrawCoreBack(b, t, F);
    b.box(16, F, 11, 18, F, 25, 'spruce_planks');
    b.box(37, F, 11, 39, F, 25, 'spruce_planks');
    b.box(19, F, 11, 36, F, 13, 'spruce_planks');
    b.box(16, F, 26, 18, F, 29, 'light_blue_wool');
    b.box(37, F, 26, 39, F, 29, 'light_blue_wool');
    b.box(19, F, 27, 36, F, 29, 'light_blue_wool');
    b.box(16, F, 30, 18, F, 47, 'light_blue_wool');
    b.box(37, F, 30, 39, F, 47, 'light_blue_wool');
    t.sign(38, F + 1, 11, 's', 'Planta 1', 'Microscopios, cuarto oscuro, muestras y genética al este; biblioteca y aula al oeste.', 'Floor 1. Microscopes, darkroom, samples and genetics east; library and lecture hall west.');
}

function labDrawMicroscopy(b, t) {
    const { piece, sign } = t;
    const F = 6;
    const y = F + 1;
    b.box(41, F, 11, 53, F, 25, 'white_wool');
    t.door(40, y, 13, 'birch_door', 'e');
    sign(39, y, 15, 'w', 'Microscopios', 'Luz real: junto a la ventana, el sol; en la isla, lámparas; al fondo, una vela. Al lado, el cuarto oscuro.', 'Microscopes, with real light: the sun by the window, lamps on the island, a candle at the back. Next door, the darkroom.');
    const [, , lz] = t.labSwitch(41, F, 16, 1, 39, 'microscopy');
    t.lampGrid(F, [41, lz], 47, [14, 22], [44, 50], 'microscopy');
    // On to the island's bulb, past the lamp's post on this same line.
    t.wire([47, F + 5, lz], [48, F + 5, lz]);

    // The window bench: the sun and nothing else. A microscope here goes dark at night, and that is the lesson.
    for (let x = 42; x <= 52; x++) b.set(x, y, 11, 'lab_bench');
    for (const [x, name] of [[44, 'sun1'], [47, 'sun2'], [50, 'sun3']]) {
        t.scope(x, y + 1, 11, 's', name);
        t.chair(x, y, 12, 'n', 'birch');
    }
    b.set(42, y + 1, 11, 'vase');
    b.set(52, y + 1, 11, 'flower_pot');
    sign(52, y, 13, 'n', 'Junto a la ventana', 'Estos ven con el sol. De noche, negro: prueba en la isla o con una vela al lado.', 'These see by the sun. At night they go black: try the island, or set a candle beside one.');

    // The east window: another by the sun.
    for (let z = 14; z <= 24; z++) b.set(53, y, z, 'lab_bench');
    t.scope(53, y + 1, 21, 'w', 'sun4');
    t.chair(52, y, 21, 'e', 'birch');
    b.set(53, y + 1, 15, 'vase');

    // The island: two with a light of their own, off the room's line: a lamp and a bulb.
    for (let x = 44; x <= 50; x++) b.set(x, y, 18, 'lab_bench');
    t.scope(45, y + 1, 18, 's', 'lamp');
    b.set(46, y + 1, 18, 'electric_lamp');
    b.box(46, y + 2, 18, 46, F + 4, 18, 'wire_post');
    t.lamps.push({ room: 'microscopy', at: [46, y + 1, 18], night: false });
    t.scope(49, y + 1, 18, 's', 'bulb');
    b.set(48, y + 1, 18, 'light_bulb');
    b.box(48, y + 2, 18, 48, F + 4, 18, 'wire_post');
    t.lamps.push({ room: 'microscopy', at: [48, y + 1, 18], night: false });
    t.chair(45, y, 19, 'n', 'birch');
    t.chair(49, y, 19, 'n', 'birch');
    sign(47, y, 17, 'n', 'Lámpara y bombilla', 'La lámpara ilumina más que la bombilla: compáralas con campo oscuro (darkfield_stop). Guía 247.', 'A lamp is brighter than a bulb: compare them with dark-field (darkfield_stop). Guide 247.');

    // The back bench: a candle, shelves over it, and what to fetch.
    for (let x = 43; x <= 52; x++) b.set(x, y, 25, 'lab_bench');
    t.scope(45, y + 1, 25, 'n', 'candle');
    b.set(46, y + 1, 25, 'candle');
    t.chair(45, y, 24, 's', 'birch');
    for (const x of [48, 49, 50, 51]) piece(x, y + 2, 25, 'wall_shelf', 'wall_shelf', 'n');
    b.set(48, y + 1, 25, 'vase');
    piece(50, y + 1, 25, 'chest', 'chest', 'n');
    piece(51, y + 1, 25, 'chest', 'chest', 'n');
    sign(43, y, 24, 'e', 'Material: /microkit', 'Un plano no puede llenar un cofre: los cofres vienen vacíos. En modo creativo, /microkit trae tubos, portaobjetos, muestras y tinciones.',
        'A build cannot fill a chest: these are empty. In creative mode, /microkit gives tubes, slides, samples and stains.');
}

function labDrawDarkroom(b, t) {
    const { piece, sign } = t;
    const F = 6;
    const y = F + 1;
    // Walls, no windows, black floor; the door to the corridor.
    b.box(41, F, 27, 46, F, 34, 'black_wool');
    b.box(47, y, 27, 47, F + 4, 35, 'concrete');
    b.box(41, y, 35, 47, F + 4, 35, 'concrete');
    t.door(40, y, 32, 'dark_oak_door', 'e');
    sign(39, y, 33, 'w', 'Cuarto oscuro', 'Entra y cierra. Sin luz el microscopio se ve negro y su panel dice por qué. La palanca junto al rojo enciende su lámpara.',
        'Darkroom. Go in and shut the door. With no light the microscope is black, and its panel says why. The lever by the red light lights its lamp.');
    // The lever by the door, starting off: the room's whole lesson. A red glow to find it by (it lights nothing).
    t.wire([39, F + 5, 28], [41, F + 5, 28], [41, F + 3, 28]);
    t.lever(41, F + 2, 28, false);
    t.mark('lever:darkroom', 41, F + 2, 28);
    for (const z of [28, 29, 30]) b.set(41, F + 1, z, 'iron_block');
    t.wire([41, F + 2, 29], [41, F + 2, 30], [41, F + 5, 30], [44, F + 5, 30], [44, F + 5, 34]);
    b.set(40, F + 2, 28, 'glow_block:rgb500');
    b.set(40, F + 3, 28, 'glow_block:rgb500');
    // The bench at the back: the microscope and, right beside it, its lamp on a post from the ceiling.
    for (let x = 42; x <= 46; x++) b.set(x, y, 34, 'lab_bench');
    t.scope(43, y + 1, 34, 'n', 'dark');
    b.set(44, y + 1, 34, 'electric_lamp');
    b.box(44, y + 2, 34, 44, F + 4, 34, 'wire_post');
    t.mark('lamp:darkroom', 44, y + 1, 34);
    t.chair(43, y, 33, 's');
    b.set(46, y + 1, 34, 'glow_block:rgb500');
    piece(46, y, 28, 'barrel', 'barrel', 'w');
}

function labDrawSamples(b, t) {
    const { piece, sign } = t;
    const F = 6;
    const y = F + 1;
    b.box(41, F, 36, 53, F, 47, 'marble');
    t.door(40, y, 38, 'birch_door', 'e');
    const [, , lz] = t.labSwitch(41, F, 40, 1, 39, 'samples');
    t.lampGrid(F, [41, lz], 47, [39, 45], [44, 50], 'samples');
    t.wire([47, F + 5, lz], [50, F + 5, lz]);
    sign(39, y, 39, 'w', 'Muestras', 'Toma muestras con un tubo: del agua y del musgo, de verdad. Cofres y estantes para guardarlas.', 'Samples: dip a tube in the water or press it on the moss, for real. Chests and shelves to keep them.');
    // The tank: real water in a marble rim, and real moss. A test tube takes a sample from either.
    for (const x of [49, 50, 51, 52]) for (const z of [44, 45, 46]) b.set(x, y, z, 'marble');
    b.box(50, y, 45, 51, y, 45, 'water');
    t.mark('water', 50, y, 45);
    b.box(43, y, 47, 47, y, 47, 'moss');
    b.box(43, y + 1, 47, 45, y + 1, 47, 'moss');
    t.mark('moss', 44, y, 47);
    sign(48, y, 43, 'n', 'Agua y musgo reales', 'Tubo de ensayo en el agua o en el musgo: una muestra. Lo que traiga depende del sitio exacto.', 'Real water and moss. A test tube on either takes a sample, and what it holds depends on the exact spot.');
    // The store: a chest for each thing, shelves over.
    const kept = [
        ['Tubos: test_tube', 'Test tubes: /give test_tube.'], ['Portaobjetos: glass_slide', 'Slides: /give glass_slide.'],
        ['Pipeta: micropipette', 'Micropipette: /give micropipette.'], ['Yodo: iodine_tincture', 'Iodine: /give iodine_tincture. Guide 246.'],
        ['Azul: methylene_blue', 'Methylene blue: /give methylene_blue. Guide 246.'], ['Campo oscuro: darkfield_stop', 'Dark-field stop: /give darkfield_stop. Guide 247.']
    ];
    kept.forEach(([es, en], i) => {
        const z = 37 + i;
        if (z === 40 || z === 41 || z === 42) return;
        piece(53, y, z, 'chest', 'chest', 'w');
        sign(52, y, z, 'w', es, `Cofre vacío: un plano no llena cofres. ${en}`, `An empty chest: a build cannot fill one. ${en}`);
        piece(53, y + 2, z, 'wall_shelf', 'wall_shelf', 'w');
    });
    // The other three by the door side.
    kept.slice(3).forEach(([es, en], i) => {
        const x = 43 + i * 2;
        piece(x, y, 36, 'chest', 'chest', 's');
        sign(x + 1, y, 37, 's', es, `Cofre vacío: un plano no llena cofres. ${en}`, `An empty chest: a build cannot fill one. ${en}`);
        piece(x, y + 2, 36, 'wall_shelf', 'wall_shelf', 's');
    });
    b.box(42, y, 42, 46, y, 42, 'lab_bench');
    b.set(44, y + 1, 42, 'vase');
    b.set(45, y + 1, 42, 'vase');
    t.chair(44, y, 43, 'n', 'birch');
    // The way into the genetics room.
    t.door(50, y, 35, 'birch_door', 'n');
}

function labDrawGenetics(b, t) {
    const { piece, sign } = t;
    const F = 6;
    const y = F + 1;
    b.box(48, F, 27, 53, F, 34, 'birch_planks');
    // Wheat at its four ages, on farmland: the server grows it. A grow lamp over it, off the room's supply.
    b.box(49, F, 28, 52, F, 28, 'farmland');
    [0, 1, 2, 3].forEach((stage, i) => b.set(49 + i, y, 28, `wheat_${stage}`));
    t.mark('wheat:genetics', 49, y, 28);
    // Its supply comes from the sample room's line, up the wall of the door.
    t.wire([50, F + 5, 42], [50, F + 5, 31], [50, F + 5, 28]);
    b.set(50, F + 4, 28, 'grow_lamp');
    t.mark('growlamp:genetics', 50, F + 4, 28);
    t.pendant(49, F, 32, 'genetics');
    t.wire([49, F + 5, 32], [50, F + 5, 32]);
    piece(53, y, 33, 'desk', 'desk', 'w');
    t.chair(52, y, 33, 'e');
    b.set(53, y + 1, 33, 'table_lamp');
    for (let k = 1; k <= 3; k++) piece(48, y + k - 1, 34, 'bookshelf', 'bookshelf', 'n');
    sign(49, y, 30, 'n', 'Genética', 'Trigo a sus cuatro edades, bajo una lámpara de cultivo: crece el doble de rápido.', 'Genetics. Wheat at its four ages under a grow lamp: it grows twice as fast.');
    sign(52, y, 30, 'n', 'Genes de un animal', 'Cada animal domado lleva tres: pelaje, tamaño y velocidad, uno de cada progenitor. Léelos con la libreta de cría. Guía 130.',
        'Each tamed animal carries three genes: coat, size and speed, one from each parent. Read them with a breeding notebook. Guide 130.');
    sign(52, y, 31, 'w', 'Cómo criar', 'Da de comer a dos adultos domados de la misma especie, a menos de 8 bloques: nace una cría. Guía 3.', 'Feed two tamed adults of a species, within 8 blocks: a baby is born. Guide 3.');
}

function labDrawLibrary(b, t) {
    const { piece, sign } = t;
    const F = 6;
    const y = F + 1;
    b.box(2, F, 34, 14, F, 47, 'dark_oak_planks');
    b.box(2, F + 1, 33, 14, F + 4, 33, 'white_brick');
    t.door(15, y, 36, 'dark_oak_door', 'w');
    sign(16, y, 37, 'e', 'Biblioteca', 'Lee la guía con la tecla de la guía; aquí solo hay estantes y silencio.', 'Library: only shelves and silence. The real book is the in-game guide.');
    const [, , lz] = t.labSwitch(14, F, 40, 1, 16, 'library');
    t.lampGrid(F, [14, lz], 8, [37, 44], [5, 11], 'library');
    // Shelves along both long walls; nothing standing in the way of the lamps.
    for (let x = 3; x <= 13; x++) {
        for (let k = 0; k < 3; k++) {
            piece(x, y + k, 47, 'bookshelf', 'bookshelf', 'n');
            piece(x, y + k, 34, 'bookshelf', 'bookshelf', 's');
        }
    }
    for (const z of [44, 45, 46]) {
        for (let k = 0; k < 3; k++) piece(14, y + k, z, 'bookshelf', 'bookshelf', 'w');
    }
    b.box(4, y, 40, 9, y, 41, 'table');
    for (let x = 4; x <= 9; x++) {
        t.chair(x, y, 39, 's');
        t.chair(x, y, 42, 'n');
    }
    b.set(5, y + 1, 40, 'table_lamp');
    b.set(8, y + 1, 41, 'table_lamp');
    piece(2, y + 1, 40, 'painting_night', 'painting', 'e');
    b.set(13, y, 35, 'flower_pot');
    b.set(2, y, 36, 'flower_pot');
}

// ---------------------------------------------------------------------------------------
// Floor 2: experiments, offices, chemistry

function labFloor2Supply(b, t) {
    const F = 12;
    const y = F + 5;
    labDrawCupboard(b, t, F, 2);
    t.wire([16, y, 28], [39, y, 28]);
    t.wire([39, y, 12], [39, y, 46]);
    t.wire([16, y, 12], [16, y, 46]);
    t.wire([16, y, 12], [39, y, 12]);
    for (const [x, z] of [[16, 18], [39, 18], [16, 36], [39, 36], [16, 44], [39, 44], [23, 12], [32, 12], [24, 28], [31, 28], [16, 25], [39, 27]]) t.pendant(x, F, z, 'floor 2 corridor');
    labDrawLandingLights(b, t, F);
    labDrawCoreBack(b, t, F);
    b.box(16, F, 11, 18, F, 25, 'spruce_planks');
    b.box(37, F, 11, 39, F, 25, 'spruce_planks');
    b.box(19, F, 11, 36, F, 13, 'spruce_planks');
    b.box(16, F, 26, 18, F, 29, 'lime_wool');
    b.box(37, F, 26, 39, F, 29, 'lime_wool');
    b.box(19, F, 27, 36, F, 29, 'lime_wool');
    b.box(16, F, 30, 18, F, 47, 'lime_wool');
    b.box(37, F, 30, 39, F, 47, 'lime_wool');
    t.sign(17, F + 1, 11, 's', 'Planta 2', 'Experimentos y oficinas al oeste; química y fundición al este. La puerta de experimentos se abre con la placa.', 'Floor 2. Experiments and offices west; chemistry and furnaces east. The experiments door opens by its plate.');
}

function labDrawExperiments(b, t) {
    const { piece, sign } = t;
    const F = 12;
    const y = F + 1;
    const top = y + 1;
    b.box(2, F, 11, 14, F, 32, 'light_gray_wool');

    // ---- The door: a motor beside it, a pressure plate on each side ----
    b.box(15, y, 28, 15, y + 1, 28, null);
    b.door(15, y, 28, 'iron_door', 'w');
    b.set(15, y, 29, 'electric_motor');
    t.mark('motor:door', 15, y, 29);
    t.mark('door:experiments', 15, y, 28);
    t.plate(14, y, 28);
    t.mark('plate:in', 14, y, 28);
    t.plate(16, y, 28);
    t.mark('plate:out', 16, y, 28);
    t.wire([14, y, 29]);
    t.wire([16, y, 29]);
    // The plates' supply: from the switch's feed above it, inside; from the ceiling, outside.
    t.wire([14, y, 27], [14, y + 2, 27]);
    t.wire([16, y, 27], [16, F + 5, 27]);
    sign(17, y, 26, 'e', 'Experimentos', 'Pisa la placa: un motor abre la puerta de hierro. Dentro, puertas lógicas, sensores y un banco para provocar un apagón.',
        'Experiments. Step on the plate: a motor opens the iron door. Inside: logic gates, sensors and a bench to cause a blackout on.');

    // ---- The room's light ----
    const [, , lz] = t.labSwitch(14, F, 26, -1, 16, 'experiments');
    t.lampGrid(F, [14, lz], 8, [15, lz], [6, 10], 'experiments');

    // ---- The benches of logic: their own 2 rtg in the corner ----
    b.box(2, y, 12, 4, y, 29, 'lab_bench');
    b.box(2, y, 30, 4, y, 31, 'lab_bench');
    b.box(5, y, 30, 14, y, 32, 'lab_bench');
    b.set(4, y, 32, 'lab_bench');
    b.set(2, y, 32, 'rtg');
    b.set(3, y, 32, 'rtg');
    t.mark('rtg:bench', 2, y, 32);
    // The first bench's bus, on the bench, fed from below at its end.
    t.wire([2, top, 12], [2, top, 29]);
    t.wire([2, y, 29], [2, y, 31]);
    // The second's, along the back wall.
    t.wire([3, top, 32], [14, top, 32]);

    const module = (z, kind, name, es, en) => {
        t.gate(3, top, z, kind, 'e');
        b.set(4, top, z, 'electric_lamp');
        t.mark(`lamp:${name}`, 4, top, z);
        t.lever(3, top, z - 1);
        t.mark(`${name}:a`, 3, top, z - 1);
        t.lever(3, top, z + 1);
        t.mark(`${name}:b`, 3, top, z + 1);
        sign(5, y, z, 'e', es, en);
    };
    module(13, 'and_gate', 'and', 'Y: las dos palancas', 'AND: the lamp lights with both levers on.');
    module(17, 'or_gate', 'or', 'O: una palanca basta', 'OR: the lamp lights with either lever on.');
    module(21, 'xor_gate', 'xor', 'XOR: solo una', 'XOR: the lamp lights with exactly one lever on.');
    // The latch: buttons, not levers. SET on one side, RESET on the other.
    t.gate(3, top, 25, 'latch', 'e');
    b.set(4, top, 25, 'electric_lamp');
    t.mark('lamp:latch', 4, top, 25);
    t.button(3, top, 24);
    t.mark('latch:set', 3, top, 24);
    t.button(3, top, 26);
    t.mark('latch:reset', 3, top, 26);
    sign(5, y, 25, 'e', 'Memoria: enciende y apaga', 'Latch: a button sets it and the lamp stays on, the other resets it.');
    // NOT: the lever at its back, the bus at its side, the lamp in front.
    t.gate(3, top, 29, 'not_gate', 's');
    t.lever(3, top, 28);
    t.mark('not:a', 3, top, 28);
    b.set(3, top, 30, 'electric_lamp');
    t.mark('lamp:not', 3, top, 30);
    sign(5, y, 29, 'e', 'NO: la palanca apaga', 'NOT: the lamp is on while the lever is off.');

    // Along the back wall, each off the second bus: delay, proximity, rain, and day and night.
    t.wire([7, top, 31]);
    t.gate(7, top, 30, 'delay_gate', 'e');
    t.lever(6, top, 30);
    t.mark('delay:a', 6, top, 30);
    b.set(8, top, 30, 'electric_lamp');
    t.mark('lamp:delay', 8, top, 30);
    const sensor = (x, base, name) => {
        b.shaped(x, top, 31, base, `logic_${base}`, { power: 'off' });
        b.set(x, top, 30, 'electric_lamp');
        t.mark(`lamp:${name}`, x, top, 30);
    };
    sensor(10, 'proximity_sensor', 'proximity');
    sensor(12, 'rain_sensor', 'rain');
    t.daylight(14, top, 31, 'day');
    b.set(14, top, 30, 'electric_lamp');
    t.mark('lamp:day', 14, top, 30);
    sign(7, y, 29, 'n', 'Retardo: 2 segundos', 'Delay: what the lever does reaches the lamp 2 seconds later. Right click it for 1 to 4.');
    sign(10, y, 29, 'n', 'Proximidad: acércate', 'Proximity: a player within 5 blocks lights it.');
    sign(12, y, 29, 'n', 'Lluvia', 'Rain sensor: on while it rains. Nearly always off: it rains on 1 day in 20.');
    sign(13, y, 29, 'n', 'Día', 'Daylight sensor: on by day. Right click it to swap to night.');

    // ---- The bench made to black out, with its own rtg ----
    b.box(12, y, 12, 14, y, 22, 'lab_bench');
    b.set(14, y, 12, 'rtg');
    t.mark('rtg:overload', 14, y, 12);
    t.wire([14, top, 12], [14, top, 22]);
    for (const z of [13, 15, 17]) {
        b.set(13, top, z, 'electric_lamp');
        t.mark(`lamp:overload${z}`, 13, top, z);
    }
    t.lever(13, top, 18);
    t.mark('overload:motor', 13, top, 18);
    b.set(12, top, 18, 'electric_motor');
    t.mark('motor:overload', 12, top, 18);
    t.lever(13, top, 20);
    t.mark('overload:lamp', 13, top, 20);
    b.set(12, top, 20, 'electric_lamp');
    t.mark('lamp:overload20', 12, top, 20);
    t.lever(13, top, 22);
    t.mark('overload:battery', 13, top, 22);
    b.set(12, top, 22, 'battery_block');
    t.mark('battery:overload', 12, top, 22);
    sign(11, y, 19, 'w', 'Apagón a propósito', 'Un RTG da 80 W. Tres lámparas (30) y el motor (50) llegan justo. Una lámpara más y se apaga TODO: todo o nada.',
        'One rtg gives 80 W. 3 lamps (30) and the motor (50) just fit. One lamp more and ALL of it goes out: all or nothing.');
    sign(11, y, 22, 'w', 'La batería salva', 'Con la tercera palanca se conecta una batería: si se ha cargado antes, cubre lo que falta.', 'The third lever brings in a battery: if it charged first, it covers what is missing.');

    // ---- A table in the middle with a chest for the meter ----
    b.box(7, y, 21, 9, y, 22, 'table');
    t.chair(8, y, 20, 's');
    t.chair(8, y, 23, 'n');
    piece(7, y + 1, 21, 'chest', 'chest', 's');
    b.set(9, y + 1, 22, 'table_lamp');
    sign(6, y, 20, 'n', 'Multímetro: /give multimeter', 'El cofre viene vacío. Con /give multimeter y clic derecho lees generación, demanda y baterías de una red.', 'The chest comes empty. /give multimeter, then right click to read a network: generation, demand and batteries.');
}

function labDrawOffices(b, t) {
    const { piece, sign } = t;
    const F = 12;
    const y = F + 1;
    b.box(2, F, 34, 14, F, 47, 'birch_planks');
    t.door(15, y, 34, 'oak_door', 'w');
    sign(16, y, 33, 'e', 'Despachos', 'Tres despachos para quien dirige el instituto.', 'Three offices for whoever runs the institute.');
    b.box(2, y, 36, 14, F + 4, 36, 'white_brick');
    const [, , lz] = t.labSwitch(14, F, 38, 1, 16, 'offices');
    void lz;
    t.wire([14, F + 5, 40], [3, F + 5, 40]);
    for (const x of [8, 3]) t.pendant(x, F, 40, 'offices');
    t.wire([8, F + 5, 40], [8, F + 5, 35]);
    t.pendant(8, F, 35, 'offices');
    t.pendant(12, F, 40, 'offices');
    for (const x of [6, 11]) b.box(x, y, 37, x, F + 4, 47, 'white_brick');
    [[4, 'peaks', 'Geología'], [8, 'night', 'Astronomía'], [13, 'fish', 'Biología']].forEach(([x, painting, name], i) => {
        t.door(x, y, 36, 'oak_door', 's');
        piece(x, y, 46, 'desk', 'desk', 'n');
        t.chair(x, y, 45, 's');
        b.set(x, y + 1, 46, 'table_lamp');
        const shelfX = i === 2 ? 12 : x - 1;
        for (let k = 0; k < 3; k++) piece(shelfX, y + k, 47, 'bookshelf', 'bookshelf', 'n');
        piece(x, y + 2, 37, `painting_${painting}`, 'painting', 's');
        b.set(i === 2 ? 12 : x + 1, y, 38, 'flower_pot');
        sign(x + 1 === 14 ? 12 : x + 1, y, 35, 'n', `Despacho: ${name}`, 'Solo muebles, y buenas vistas.', 'Only furniture, and a good view.');
    });
}

function labDrawChemistry(b, t) {
    const { piece, sign, tall, oven } = t;
    const F = 12;
    const y = F + 1;
    b.box(41, F, 11, 53, F, 32, 'white_wool');
    b.box(41, y, 33, 53, F + 4, 33, 'white_brick');
    t.door(40, y, 13, 'birch_door', 'e');
    sign(39, y, 15, 'w', 'Química', 'Mesas de laboratorio de verdad, nevera y congelador en la red, y al fondo horno, fundición y arco.', 'Chemistry. Real lab benches, a fridge and a freezer on the grid, and at the back the oven, foundry and arc.');
    const [, , lz] = t.labSwitch(41, F, 16, 1, 39, 'chemistry');
    t.lampGrid(F, [41, lz], 47, [14, 20, 28], [44, 50], 'chemistry');

    // Two long islands of real lab benches, with what stands on a bench in the game: vases as flasks.
    for (const z of [15, 22]) {
        for (let x = 43; x <= 51; x++) b.set(x, y, z, 'lab_bench');
        for (const x of [44, 46, 49]) t.chair(x, y, z + 1, 'n', 'birch');
        b.set(44, y + 1, z, 'vase');
        b.set(46, y + 1, z, 'vase');
        b.set(47, y + 1, z, 'neon_lamp');
        b.set(49, y + 1, z, 'argon_lamp');
        b.set(51, y + 1, z, 'table_lamp');
    }
    piece(48, y, 22, 'sink', 'sink', 's');
    piece(48, y, 15, 'sink', 'sink', 's');
    sign(45, y, 14, 'n', 'Mesa de laboratorio', 'Clic derecho: la tabla, el matraz y 30 reacciones de verdad. Frascos: /give water_flask. Guía 117.', 'Right click: the table, the flask and 30 real reactions. Flasks: /give water_flask. Guide 117.');
    sign(50, y, 14, 'n', 'Elementos: en el atrio', 'La tabla periódica está en el muro del atrio, visible desde el puente. Guía 116.', 'The periodic table is on the wall of the atrium, seen from the bridge. Guide 116.');

    // The cold chain against the back: 2 rtg, 2 fridges, a freezer, all touching and nothing else.
    b.set(42, y, 32, 'rtg');
    b.set(43, y, 32, 'rtg');
    t.mark('rtg:cold', 42, y, 32);
    tall(44, y, 32, 'fridge', 'n');
    t.mark('fridge:1', 44, y, 32);
    tall(45, y, 32, 'fridge', 'n');
    t.mark('fridge:2', 45, y, 32);
    piece(46, y, 32, 'chest_freezer', 'chest_freezer', 'n');
    t.mark('freezer', 46, y, 32);
    sign(47, y, 31, 'n', 'Frío de verdad', 'Dos neveras y un congelador con su RTG: 90 W de 160. Enfría y congela lo que metas. Vienen vacíos.', 'Real cold: 2 fridges and a freezer on their rtgs, 90 W of 160. They chill and freeze what you put in. They come empty.');
    piece(50, y, 32, 'chest', 'chest', 'n');
    piece(51, y, 32, 'barrel', 'barrel', 'n');
    for (const x of [50, 51, 52]) piece(x, y + 2, 32, 'wall_shelf', 'wall_shelf', 'n');
    for (const z of [20, 24, 28]) piece(53, y + 2, z, 'wall_shelf', 'wall_shelf', 'w');

    // ---- The hot bay ----
    b.box(41, F, 34, 53, F, 47, 'slate');
    t.door(46, y, 33, 'iron_door', 's');
    const [, , hz] = t.labSwitch(41, F, 36, 1, 39, 'hotbay');
    t.door(40, y, 40, 'iron_door', 'e');
    t.lampGrid(F, [41, hz], 47, [hz, 44], [44, 50], 'hotbay');
    // The arc: 2 rtg touching it.
    b.set(46, y, 47, 'rtg');
    b.set(48, y, 47, 'rtg');
    t.mark('rtg:arc', 46, y, 47);
    b.shaped(47, y, 47, 'arc_furnace', 'arc_furnace', { facing: 'n', fire: 'off' });
    t.mark('arc', 47, y, 47);
    sign(47, y, 45, 'n', 'Horno de arco', 'Pide 150 W solo cuando trabaja, y sus 2 RTG dan 160. Mena de hierro y carbón: acero. Guía 236.', 'It asks for 150 W only while it works, and its 2 rtg give 160. Iron ore and coal make steel. Guide 236.');
    // The foundry and the oven under a hood.
    b.shaped(43, y, 47, 'foundry', 'oven', { facing: 'n', fire: 'off' });
    t.mark('foundry', 43, y, 47);
    oven(51, y, 47, 'n');
    t.mark('oven', 51, y, 47);
    for (const x of [43, 51]) {
        b.box(x, y + 2, 47, x, F + 4, 47, 'brick');
        b.set(x, y + 1, 47, 'brick');
    }
    sign(43, y, 45, 'n', 'Fundición', 'Quema carbón. Viene vacía y apagada.', 'Foundry: it burns coal. It comes empty and cold.');
    sign(51, y, 45, 'n', 'Horno', 'Con comida y carbón cocina de verdad: solo el servidor lo enciende.', 'Oven: with food and coal it really cooks, and only the server lights it.');
    piece(42, y, 42, 'chest', 'chest', 'e');
    piece(42, y, 43, 'chest', 'chest', 'e');
}

// ---------------------------------------------------------------------------------------
// The roof

// A column of the drum: octagon of 18 across, centred on (27.5, 38.5).
function labInDrum(x, z, r = 8.5) {
    const [dx, dz] = [Math.abs(x - 27.5), Math.abs(z - 38.5)];
    return dx <= r && dz <= r && dx + dz <= r + 4;
}

function labDrawObservatory(b, t) {
    const { piece, sign } = t;
    const R = LAB_ROOF_Y;
    const wallTop = R + 6;
    // The floor, the drum.
    for (let z = 30; z <= 47; z++) {
        for (let x = 19; x <= 36; x++) {
            if (!labInDrum(x, z)) continue;
            const rim = !labInDrum(x, z, 7.5);
            const under = b.cells.get((R * b.size[2] + z) * b.size[0] + x);
            if (under && under.type === 'slate') b.set(x, R, z, (x + z) % 2 ? 'dark_oak_planks' : 'spruce_planks');
            if (rim) {
                b.box(x, R + 1, z, x, wallTop, z, 'white_brick');
                b.box(x, R + 3, z, x, R + 4, z, 'glass');
                b.set(x, wallTop, z, 'cyan_brick');
            }
        }
    }
    // The dome, with a slit open to the sky from over the middle towards the front.
    const cy = wallTop;
    const radius = 8.9;
    for (let z = 29; z <= 48; z++) {
        for (let x = 18; x <= 37; x++) {
            for (let y = cy + 1; y <= cy + 10; y++) {
                const d = Math.hypot(x - 27.5, y - cy, z - 38.5);
                if (d > radius || d < radius - 1.3 || !labInDrum(x, z)) continue;
                const slit = x >= 26 && x <= 29 && z <= 42;
                if (slit) continue;
                b.set(x, y, z, x === 25 || x === 30 ? 'iron_block' : (x + z) % 8 === 0 ? 'light_gray_brick' : 'white_brick');
            }
        }
    }
    // The way out to the terrace, in front.
    for (const x of [27, 28]) b.box(x, R + 1, 30, x, R + 2, 30, null);
    b.doubleDoor(27, R + 1, 30, 28, 30, 'dark_oak_door', 'n');
    b.box(27, R + 3, 30, 28, R + 4, 30, 'white_brick');

    // The model: a telescope of blocks on its pier, aimed up through the slit. Only a model.
    b.box(28, R + 1, 43, 28, R + 2, 43, 'iron_block');
    b.box(27, R + 1, 43, 27, R + 2, 43, 'iron_block');
    const tube = [[43, 3], [42, 4], [41, 5], [40, 6], [39, 7], [38, 8], [37, 9]];
    tube.forEach(([z, dy], i) => {
        for (const x of [27, 28]) {
            b.set(x, R + dy, z, i === 0 ? 'black_brick' : i === tube.length - 1 ? 'glass' : 'copper_block');
            if (i > 0) b.set(x, R + dy - 1, z, i === 1 ? 'copper_block' : 'copper_block');
        }
    });
    t.mark('model:telescope', 28, R + 5, 41);
    sign(29, R + 1, 44, 's', 'Telescopio: maqueta', 'Decoración de bloques, no funciona. El de verdad es un objeto: /give telescope, clic derecho lo levanta, desde aquí o la terraza.',
        'A model, in blocks: it does not work. The real one is an item: /give telescope, right click raises it, here or on the deck.');
    // Standing here the sky is open: this is where to use the real one.
    b.box(26, R, 40, 29, R, 41, 'glow_block:rgb200');
    t.mark('open:slit', 26, R + 1, 41);
    sign(30, R + 1, 41, 'w', 'Mira arriba: cielo abierto', 'La rendija deja el cielo a la vista. Con /give star_chart, un telescopio y una noche clara dibujas constelaciones. Guía 133.',
        'Look up: open sky through the slit. With /give star_chart, a telescope and a clear night you chart the constellations. Guide 133.');

    // Desks round the wall, a chest for telescopes and charts, books, a red light kind to night eyes.
    piece(32, R + 1, 44, 'desk', 'desk', 'w');
    t.chair(31, R + 1, 44, 'e');
    b.set(32, R + 2, 44, 'candle');
    piece(21, R + 1, 44, 'chest', 'chest', 'e');
    sign(22, R + 1, 43, 's', 'Telescopios: /give telescope', 'Cofre vacío: un plano no llena cofres, y un telescopio no es un bloque. También /give star_chart.', 'An empty chest: a build cannot fill one, and a telescope is not a block. Also /give star_chart.');
    for (const z of [40, 41, 42]) {
        for (let k = 0; k < 2; k++) piece(20, R + 1 + k, z, 'bookshelf', 'bookshelf', 'e');
    }
    piece(26, R + 3, 38 + 1, 'painting_night', 'painting', 's');
    for (const [x, z] of [[33, 40], [22, 40], [24, 45], [31, 46], [33, 33]]) t.lantern(x, R + 1, z, 'floor');
    b.set(30, R + 1, 34, 'flower_pot');
    t.lantern(22, R + 1, 32, 'floor');
    t.lantern(30, R + 1, 32, 'floor');
}

function labDrawGreenhouse(b, t) {
    const { sign, piece } = t;
    const R = LAB_ROOF_Y;
    const y = R + 1;
    // Walls and roof of glass on an iron frame; the soil in the roof slab.
    b.walls(3, y, 12, 14, R + 5, 28, 'glass');
    for (const x of [3, 14]) for (const z of [12, 28]) b.box(x, y, z, x, R + 5, z, 'iron_block');
    b.box(3, R + 6, 12, 14, R + 6, 28, 'glass');
    b.box(5, R + 7, 15, 12, R + 7, 25, 'glass');
    for (let z = 12; z <= 28; z += 4) for (const x of [3, 14]) b.box(x, y, z, x, R + 5, z, 'iron_block');
    b.box(4, R, 13, 13, R, 27, 'grass');
    b.box(8, R, 13, 9, R, 27, 'slate');
    // Rows of wheat, every age; the server grows them.
    for (const [x0, x1] of [[4, 7], [10, 13]]) {
        b.box(x0, R, 14, x1, R, 26, 'farmland');
        for (let z = 14; z <= 26; z++) {
            for (let x = x0; x <= x1; x++) b.set(x, y, z, `wheat_${(x + z) % 3}`);
        }
    }
    t.mark('wheat', 5, y, 16);
    // Grow lamps at 4 over the wheat, on a wire under the glass; 2 rtg at the end of the aisle, a lever on them.
    b.set(8, y, 27, 'rtg');
    b.set(9, y, 27, 'rtg');
    t.mark('rtg:grow', 8, y, 27);
    t.lever(8, y + 1, 27, true);
    t.mark('lever:grow', 8, y + 1, 27);
    b.box(8, y + 2, 27, 8, R + 5, 27, 'wire_post');
    t.wire([8, R + 6, 27], [8, R + 6, 19], [6, R + 6, 19], [6, R + 6, 15]);
    t.wire([6, R + 6, 19], [6, R + 6, 23]);
    t.wire([8, R + 6, 19], [11, R + 6, 19], [11, R + 6, 15]);
    t.wire([11, R + 6, 19], [11, R + 6, 23]);
    for (const [x, z] of [[6, 16], [6, 22], [11, 16], [11, 22]]) {
        b.set(x, R + 5, z, 'grow_lamp');
        t.mark(`growlamp:${x}:${z}`, x, R + 5, z);
    }
    b.set(4, y, 13, 'flower_pot');
    t.door(14, y, 13, 'oak_door', 'w');
    sign(15, y, 15, 'e', 'Invernadero', 'Trigo de verdad bajo lámparas de cultivo: crece el doble de rápido. Palanca sobre los RTG, al fondo.', 'Greenhouse. Real wheat under grow lamps: it grows twice as fast. The lever is on the rtgs at the far end.');
    piece(10, y, 27, 'chest', 'chest', 'n');
    t.lantern(9, y, 15, 'floor');
    t.lantern(8, y, 25, 'floor');
    t.lantern(12, R + 1, 13, 'floor');
    t.lantern(5, R + 1, 13, 'floor');
    t.lantern(5, R + 1, 27, 'floor');
    t.lantern(12, R + 1, 27, 'floor');
}

// The terrace: solar field, wind turbines, night lights, stargazing deck, the weather station.
function labDrawTerrace(b, t) {
    const { sign, piece } = t;
    const R = LAB_ROOF_Y;
    const y = R + 1;
    // Decks.
    for (const [x0, z0, x1, z1] of [[15, 11, 40, 13], [15, 14, 18, 29], [37, 14, 40, 29], [19, 26, 36, 29]]) b.box(x0, R, z0, x1, R, z1, 'spruce_planks');
    // The riser comes up in the east corner. 24 panels; everything above them is sky.
    b.box(46, y, 44, 51, y, 47, 'solar_panel');
    t.mark('solar', 46, y, 44);
    t.wire([52, y, 47]);
    sign(45, y, 43, 'w', 'Placas solares', '24 placas de 40 W a la red principal: 960 W con sol alto, nada de noche. Cargan las baterías.', '24 panels of 40 W on the main network: 960 W with the sun high, nothing at night. They charge the batteries.');
    // Along the east edge to the two turbines.
    t.wire([53, y, 46], [53, y, 33]);
    for (const z of [40, 33]) {
        b.box(53, y + 1, z, 53, y + 4, z, 'wire_post');
        b.set(53, y + 5, z, 'wind_turbine');
        t.mark(`turbine:${z}`, 53, y + 5, z);
    }
    sign(52, y, 36, 'w', 'Molinos', 'Hasta 150 W cada uno, con el viento que haga. Cuanto más altos, más viento.', 'Turbines: up to 150 W each, with whatever wind there is. The higher, the more wind.');
    // Night lights of the terrace: a sensor off the same supply.
    t.daylight(52, y, 41, 'night');
    t.mark('sensor:terrace', 52, y, 41);
    t.wire([53, y, 41]);
    t.wire([51, y, 41], [41, y, 41], [41, y, 28], [38, y, 28], [38, y, 15]);
    for (const [x, z] of [[46, 41], [41, 34], [38, 22], [38, 15]]) {
        b.box(x, y + 1, z, x, y + 2, z, 'wire_post');
        b.set(x, y + 3, z, 'electric_lamp');
        t.lamps.push({ room: 'terrace', at: [x, y + 3, z], night: true });
    }
    // The rest of the terrace on oil: the main network is at its size (powerMaxNetwork) with these.
    for (const [x, z] of [[30, 12], [24, 12], [17, 16], [17, 26], [38, 12]]) b.lampPost(x, y, z, 'dark_oak_fence', 2);
    // The deck for the sky: benches looking out, and the real instruments in a chest.
    for (let x = 20; x <= 25; x++) piece(x, y, 28, 'bench', 'bench', 'n');
    for (let x = 30; x <= 35; x++) piece(x, y, 28, 'bench', 'bench', 'n');
    piece(31, y, 29, 'chest', 'chest', 'n');
    sign(29, y, 27, 'n', 'Mirador de estrellas', 'Cielo abierto en todas direcciones. El telescopio es un objeto de la mano: /give telescope.', 'A deck for the stars: open sky all round. The telescope is a hand item: /give telescope.');
    // A real weather station on its pad, under the open sky so that the gauge fills.
    b.box(38, R, 17, 39, R, 18, 'marble');
    b.shaped(39, y, 17, 'weather_station', 'weather_station', { half: 'lower' });
    b.shaped(39, y + 1, 17, 'weather_station', 'weather_station', { half: 'upper' });
    t.mark('station', 39, y, 17);
    sign(39, y, 19, 's', 'Estación meteorológica', 'Estación de verdad: mírala para las lecturas, clic derecho para el informe. Se monta otra con /give weather_station.',
        'A real weather station: look at it for the readings, right click for the report. Set up another with /give weather_station.');
    // The back terrace: a garden where nobody is working.
    b.box(2, R, 30, 18, R, 47, 'grass');
    b.box(15, R, 30, 18, R, 47, 'spruce_planks');
    for (const [x, z] of [[4, 32], [12, 44]]) {
        b.box(x, y, z, x, y + 2, z, 'birch_wood');
        b.box(x - 1, y + 3, z - 1, x + 1, y + 3, z + 1, 'birch_leaves');
    }
    b.box(6, y, 38, 9, y, 39, 'table');
    for (let x = 6; x <= 9; x++) {
        t.chair(x, y, 37, 's', 'birch');
        t.chair(x, y, 40, 'n', 'birch');
    }
    b.set(7, y + 1, 38, 'candle');
    for (const [x, z] of [[3, 45], [13, 31], [8, 46], [16, 45]]) b.lampPost(x, y, z, 'dark_oak_fence', 2);
    for (const [x, z] of [[3, 37], [13, 38], [5, 42]]) b.set(x, y, z, x % 2 ? 'flower_red' : 'flower_yellow');
    // East of the drum, a walkway to the panels.
    b.box(37, R, 30, 45, R, 47, 'spruce_planks');
    b.box(41, R, 29, 45, R, 29, 'spruce_planks');
    for (const [x, z] of [[43, 31], [43, 46]]) b.lampPost(x, y, z, 'dark_oak_fence', 2);
    b.lampPost(39, y, 45, 'dark_oak_fence', 2);
    b.lampPost(16, y, 13, 'dark_oak_fence', 2);
}

// ---------------------------------------------------------------------------------------
// The building

function constructionLab(b) {
    const t = labTools(b);
    labDrawShell(b, t);
    labDrawCore(b, t);
    labDrawLobby(b, t);
    labDrawLectureHall(b, t);
    labDrawCanteen(b, t);
    labDrawWorkshop(b, t);
    labDrawPowerHall(b, t);
    labDrawNightLights(b, t);
    labDrawGroundCorridors(b, t);
    labFloor1Supply(b, t);
    labDrawMicroscopy(b, t);
    labDrawDarkroom(b, t);
    labDrawSamples(b, t);
    labDrawGenetics(b, t);
    labDrawLibrary(b, t);
    labFloor2Supply(b, t);
    labDrawExperiments(b, t);
    labDrawOffices(b, t);
    labDrawChemistry(b, t);
    labDrawTerrace(b, t);
    labDrawObservatory(b, t);
    labDrawGreenhouse(b, t);
    labDrawPlaza(b, t);
    // The riser, on a post from the corner of the batteries to the roof, through the floors it passes.
    b.box(53, 1, 47, 53, 19, 47, 'wire_post');
    b.labTools = t;
}

// What the tests read: where each thing is, and the lamps with their rooms.
function labPlanMarks() {
    const b = new ConstructionBuilder(CONSTRUCTION_DESIGNS.lab.size);
    constructionLab(b);
    return { marks: b.labTools.marks, lamps: b.labTools.lamps };
}

CONSTRUCTION_DESIGNS.lab = {
    label: 'Research institute',
    size: [56, 36, 52],
    foundation: 'stone_bricks',
    anchorX: 27,
    rate: 480,
    start: [27, 1, 4],
    levels: [
        { name: 'the plaza', at: [27, 1, 8] },
        { name: 'the lobby', at: [27, 1, 13] },
        { name: 'the back of the atrium', at: [22, 1, 25] },
        { name: 'the cross corridor', at: [27, 1, 28] },
        { name: 'the lift lobby', at: [28, 1, 33] },
        { name: 'the lecture hall stage', at: [8, 1, 15] },
        { name: 'the canteen', at: [12, 1, 44] },
        { name: 'the workshop', at: [47, 1, 18] },
        { name: 'the power hall', at: [47, 1, 40] },
        { name: 'the toilets', at: [24, 1, 42] },
        { name: 'the store', at: [32, 1, 42] },
        { name: 'floor 1, west gallery', at: [17, 7, 20] },
        { name: 'floor 1, east gallery', at: [38, 7, 20] },
        { name: 'floor 1, the bridge', at: [27, 7, 12] },
        { name: 'floor 1, top of the lecture hall', at: [10, 7, 31] },
        { name: 'floor 1, its cupboard', at: [34, 7, 33] },
        { name: 'the microscopes', at: [47, 7, 15] },
        { name: 'the darkroom', at: [44, 7, 31] },
        { name: 'the sample room', at: [47, 7, 44] },
        { name: 'genetics', at: [50, 7, 32] },
        { name: 'the library', at: [11, 7, 38] },
        { name: 'floor 2, west gallery', at: [17, 13, 20] },
        { name: 'floor 2, the bridge', at: [27, 13, 12] },
        { name: 'floor 2, east corridor', at: [38, 13, 44] },
        { name: 'the experiments', at: [8, 13, 25] },
        { name: 'the offices corridor', at: [9, 13, 35] },
        { name: 'an office', at: [4, 13, 40] },
        { name: 'another office', at: [8, 13, 40] },
        { name: 'the third office', at: [13, 13, 40] },
        { name: 'chemistry', at: [47, 13, 18] },
        { name: 'the hot bay', at: [47, 13, 40] },
        { name: 'the observatory', at: [24, 19, 33] },
        { name: 'under the slit', at: [26, 19, 41] },
        { name: 'the deck', at: [27, 19, 28] },
        { name: 'the terrace in front', at: [27, 19, 12] },
        { name: 'the greenhouse', at: [8, 19, 20] },
        { name: 'the roof garden', at: [10, 19, 43] },
        { name: 'the solar field walkway', at: [43, 19, 40] }
    ],
    darkRooms: [[41, 27, 46, 34]],
    generate: constructionLab
};
