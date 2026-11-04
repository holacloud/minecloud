// /build apartments: a modern block, 24 x 18 with balconies on both sides, a lobby, 11 floors of homes,
// a roof terrace with a garden, stairs on every floor and a real lift. Registered into
// CONSTRUCTION_DESIGNS (constructions.js), which it uses as any other design: no change to the builder.
// - Floors are 4 apart (a slab and 3 of air): floor n stands on the slab at y = 4n. The lobby is n = 0,
//   the roof n = 12 (y = 48).
// - Why the lift ends at floor 11 and the last flight is stairs only: a winch holds at most 48 blocks
//   of rope and stops 2 under itself (liftMaxRope and liftHeadroom in mechanics.go), so a platform
//   travels 46 blocks at the most. Floors are 4 apart: 11 steps are 44, 12 would be 48. So the
//   platform goes from y = 0 to y = 44 and the winch is at y = 47.
// - How a lift that only knows "up with power, down without" stops at a floor. A winch finds its
//   platform by looking down through air, and a platform coming down rests on the first thing that
//   is not air (mechanics.go). So each floor has a motor ram in the shaft wall, one block under the
//   slab: its arm out, the platform coming down rests on it, level with that floor. An arm above the
//   platform would cut the rope instead, so no arm is out while the winch runs, and the lift can only
//   stop on its way DOWN: it always rises to the top first, then comes back to the floor chosen.
// - The circuit, all of it real blocks on the real rules of logic.go:
//   Each floor remembers "stop here" in a latch that joins the ram to the ram bus. The latch hangs
//   between the shaft and the bus, its SET fed by the floor's buttons, its RESET by the clear bus.
//   The raise bus starts a climb: a latch in the machine room on the roof switches on (through a
//   1 s delay, so that the arms are in before it pulls) the winch's own rtg, and a NOT gate on the
//   same latch cuts the ram bus's rtg, which pulls every arm in. The press also goes down a line of
//   seven 4 s delays (28 s: 44 blocks take 17.6 s at best, 26.4 s on the slowest ticks), which resets
//   the latch: the arms come out, one second later the winch lets go, and the platform comes down
//   onto the arm chosen, or to the lobby if there is none.
// - Buttons: on a landing, in the wall by the door, "call" (clears, climbs, and 4 s later selects
//   this floor, once the clearing is over: that is what the delay in front of its latch is for).
//   In the shaft, seen from the platform, above a green block "stop here" (selects, nothing else: click it
//   as you pass, up or down) and above a red block "down" (clears: the arm goes in and it falls to the next arm or
//   the lobby). The lobby's door has "call" (clears) and the platform there "up" (climbs).
//   A second "stop here" is fine, as the highest arm catches the platform and the ram bus has
//   80 W for two 40 W rams. A third one blacks out the ram bus: every arm goes in and the platform
//   ends in the lobby, which "down" or the next climb puts right. "Stop here" for a floor already
//   passed puts an arm over the platform and it hangs between floors: "down" lets it go.
// - Power: the winch (60 W) has its own rtg behind the 1 s delay; the rams have another behind the NOT
//   gate. Nothing else in the building is on them, and buttons and gates draw nothing.
// - Fridges are not powered, so they are plain cupboards: at 80 W for 30 W each, it would take a
//   generator for every two kitchens, and they have nothing to chill when a build leaves them empty.
//   Ovens are unlit and empty, storage is empty: a build sends blocks and nothing else.
// - The lift moves blocks outside the plan, so "/build undo" leaves a platform or arm that is away
//   from its plan cell behind: bring the lift down to the lobby first.
// Every bed goes through apartmentsBed, signs through apartmentsSign. Tests: test/js/construction_apartments.test.js,
// and the lift on the real grid: pkg/network/construction_apartments_test.go.

const APARTMENTS_STEP = 4;
const APARTMENTS_HOME_FLOORS = 11;
const APARTMENTS_ROOF_Y = APARTMENTS_STEP * (APARTMENTS_HOME_FLOORS + 1);
// The shaft's column. The core around it is x 14..22, z 13..19; the stairs x 12..13, z 14..17.
const APARTMENTS_SHAFT = { x: 17, z: 14 };
const APARTMENTS_WINCH_Y = 47;
// Each floor's colour: on its corridor's carpet, on the back wall of the shaft, on its sign.
const APARTMENTS_FLOOR_COLORS = [
    ['white', 'blanco', 'white'], ['yellow', 'amarillo', 'yellow'], ['orange', 'naranja', 'orange'], ['red', 'rojo', 'red'],
    ['pink', 'rosa', 'pink'], ['magenta', 'magenta', 'magenta'], ['purple', 'morado', 'purple'], ['blue', 'azul', 'blue'],
    ['light_blue', 'celeste', 'light blue'], ['cyan', 'turquesa', 'cyan'], ['lime', 'lima', 'lime'], ['green', 'verde', 'green']
];
const APARTMENTS_STYLES = [
    { sofa: 'blue', carpet: 'light_gray', curtain: 'white', floor: 'birch_planks', bath: 'marble', wall: 'white_wool', wood: 'birch', rug: 'light_blue', painting: 'peaks' },
    { sofa: 'gray', carpet: 'orange', curtain: 'gray', floor: 'dark_oak_planks', bath: 'slate', wall: 'light_gray_wool', wood: 'dark_oak', rug: 'yellow', painting: 'sunset' },
    { sofa: 'green', carpet: 'lime', curtain: 'yellow', floor: 'planks', bath: 'marble', wall: 'white_brick', wood: 'oak', rug: 'green', painting: 'meadow' },
    { sofa: 'red', carpet: 'black', curtain: 'red', floor: 'spruce_planks', bath: 'basalt', wall: 'birch_planks', wood: 'dark_oak', rug: 'pink', painting: 'shapes' },
    { sofa: 'purple', carpet: 'magenta', curtain: 'purple', floor: 'birch_planks', bath: 'slate', wall: 'light_gray_brick', wood: 'birch', rug: 'purple', painting: 'night' },
    { sofa: 'cyan', carpet: 'white', curtain: 'light_blue', floor: 'cherry_planks', bath: 'marble', wall: 'white_wool', wood: 'oak', rug: 'cyan', painting: 'fish' },
    { sofa: 'black', carpet: 'red', curtain: 'orange', floor: 'maple_planks', bath: 'basalt', wall: 'gray_brick', wood: 'dark_oak', rug: 'light_gray', painting: 'sunset' }
];

// A bed: head at (x, z), against the wall `facing` looks at, and its foot the next cell the other
// way (where apartmentsBedFoot says), which every bedroom leaves free.
function apartmentsBed(b, x, y, z, facing) {
    const [fx, fz] = apartmentsBedFoot(x, z, facing);
    b.bed(fx, y, fz, facing);
}

function apartmentsBedFoot(x, z, facing) {
    const [dx, dz] = SHAPE_DIRECTIONS[facing];
    return [x - dx, z - dz];
}

// A short line of Spanish on the board; then, in the reader, more Spanish if needed, and English.
function apartmentsSign(b, x, y, z, facing, ...parts) {
    b.set(x, y, z, shapeStateName('sign', BLOCK_SHAPES.sign, { facing, mount: 'post' }), { t: parts.join(' // ') });
}

// ---------------------------------------------------------------------------------------
// The homes: what each floor holds, from which the plan and the test's walk are both made.

// A flat in its own frame: u along the corridor (0 to width - 1), v from the corridor wall (v = 0) to
// the outside wall (v = 7), its balcony at v = 8 and 9. `mirror` turns u around.
function apartmentsFlats() {
    const flats = [];
    for (let n = 1; n <= APARTMENTS_HOME_FLOORS; n++) {
        const F = n * APARTMENTS_STEP;
        // Floors 5 and 11 have one big home at the front; the others two, the wall between them moving.
        const loft = n === 5 || n === 11;
        const fronts = loft ? [[1, 22]] : n % 2 ? [[1, 10], [12, 11]] : [[1, 11], [13, 10]];
        const add = (side, u0, width, mirror, index) => flats.push({
            n, F, side, u0, width, mirror, loft: width > 12,
            name: `floor ${n} ${side}${index ? ' east' : ''}`,
            style: APARTMENTS_STYLES[(n * 3 + index * 2 + (side === 'back' ? 5 : 0)) % APARTMENTS_STYLES.length],
            // What changes from home to home, beyond the colours.
            kitchen: width > 12 || (n + index + (side === 'back' ? 1 : 0)) % 2 ? 'wall' : 'side',
            bath: (n + index * 2 + (side === 'back' ? 2 : 0)) % 3,
            bed: (n + index) % 2,
            extra: (n + index * 3 + (side === 'back' ? 1 : 0)) % 4
        });
        fronts.forEach(([u0, width], index) => add('front', u0, width, (n + index) % 2 === 0, index));
        add('back', 1, 10, n % 3 === 0, 0);
    }
    return flats;
}

// Where things are in a flat, as cells of its own frame: the rooms between the wing or wings.
function apartmentsFlatFrame(flat) {
    const { width, loft, kitchen } = flat;
    if (loft) return { first: 5, last: 16, door: 5, balcony: 15, wings: [{ wall: 4, sign: -1 }, { wall: 17, sign: 1 }] };
    const last = width - 6;
    const door = kitchen === 'wall' && last < 5 ? 0 : 1;
    return { first: 0, last, door, balcony: last, wings: [{ wall: last + 1, sign: 1 }] };
}

function apartmentsFlatCell(flat, u, v) {
    const x = flat.mirror ? flat.u0 + flat.width - 1 - u : flat.u0 + u;
    const z = flat.side === 'front' ? 10 - v : 13 + v;
    return [x, z];
}

// The places every visitor must be able to walk to, one per room.
function apartmentsLevels() {
    const levels = [
        { name: 'the lobby', at: [11, 1, 8] },
        { name: 'the common room', at: [8, 1, 15] },
        { name: 'the roof terrace', at: [10, 49, 8] },
        { name: 'the roof garden', at: [9, 49, 18] },
        { name: 'the machine room', at: [16, 49, 15] }
    ];
    for (let n = 1; n <= APARTMENTS_HOME_FLOORS; n++) {
        levels.push({ name: `the corridor of floor ${n}`, at: [10, n * APARTMENTS_STEP + 1, 11] });
    }
    for (const flat of apartmentsFlats()) {
        const frame = apartmentsFlatFrame(flat);
        const place = (name, u, v) => {
            const [x, z] = apartmentsFlatCell(flat, u, v);
            levels.push({ name: `${flat.name}, ${name}`, at: [x, flat.F + 1, z] });
        };
        place('kitchen and living room', frame.door, 1);
        place('balcony', frame.balcony, 8);
        frame.wings.forEach(({ wall, sign }, i) => {
            place(`bathroom ${i + 1}`, wall + sign, 1);
            place(`bedroom ${i + 1}`, wall + sign, 5);
        });
    }
    return levels;
}

function apartmentsDrawFlat(b, flat) {
    const { F, side, style } = flat;
    const frame = apartmentsFlatFrame(flat);
    const { first, last } = frame;
    const at = (u, v) => apartmentsFlatCell(flat, u, v);
    const put = (u, y, v, type) => {
        const [x, z] = at(u, v);
        b.set(x, y, z, type);
    };
    const boxUV = (u0, v0, u1, v1, y0, y1, type) => {
        for (let u = Math.min(u0, u1); u <= Math.max(u0, u1); u++) {
            for (let v = v0; v <= v1; v++) {
                for (let y = y0; y <= y1; y++) put(u, y, v, type);
            }
        }
    };
    const toward = {
        in: side === 'front' ? 'n' : 's',
        out: side === 'front' ? 's' : 'n',
        right: flat.mirror ? 'w' : 'e',
        left: flat.mirror ? 'e' : 'w'
    };
    const piece = (u, y, v, base, shape, facing, state = {}) => {
        const [x, z] = at(u, v);
        b.shaped(x, y, z, base, shape, { facing: toward[facing], ...state });
    };
    const tall = (u, v, base, facing) => {
        piece(u, F + 1, v, base, base, facing, { half: 'lower' });
        piece(u, F + 2, v, base, base, facing, { half: 'upper' });
    };
    const lantern = (u, y, v) => {
        const [x, z] = at(u, v);
        b.shaped(x, y, z, 'lantern', 'lantern', { mount: 'hanging' });
    };
    const floorLamp = (u, v) => {
        const [x, z] = at(u, v);
        b.shaped(x, F + 1, z, 'floor_lamp', 'floor_lamp', { half: 'lower' });
        b.shaped(x, F + 2, z, 'floor_lamp', 'floor_lamp', { half: 'upper' });
    };
    const door = (u, v, facing, base) => {
        const [x, z] = at(u, v);
        b.box(x, F + 1, z, x, F + 2, z, null);
        b.door(x, F + 1, z, base, toward[facing]);
    };

    // ---- Floors, and the glass of the outside wall ----
    boxUV(0, 1, flat.width - 1, 6, F, F, style.floor);
    boxUV(0, 7, flat.width - 1, 7, F + 1, F + 3, 'glass');

    // ---- The living room and its kitchen ----
    boxUV(first, 3, Math.min(first + 3, last), 5, F + 1, F + 1, `${style.carpet}_carpet`);
    if (flat.kitchen === 'wall') {
        // Along the corridor wall, next to the flat's door.
        door(frame.door, 0, 'in', 'spruce_door');
        tall(frame.door + 1, 1, 'fridge', 'in');
        piece(frame.door + 2, F + 1, 1, 'oven', 'oven', 'in', { fire: 'off' });
        piece(frame.door + 3, F + 1, 1, 'sink', 'sink', 'in');
        if (frame.door + 4 < last) put(frame.door + 4, F + 1, 1, 'table');
        // The sofa along the wall, looking across the room (a big home's stands by the window instead).
        if (!flat.loft) for (let v = 3; v <= 5; v++) piece(first, F + 1, v, `${style.sofa}_sofa`, 'sofa', 'right');
        put(first + 2, F + 1, 4, 'table');
        put(first + 2, F + 2, 4, flat.extra % 2 ? 'vase' : 'candle');
    } else {
        // Along the side wall, the door beside it.
        door(frame.door, 0, 'in', 'birch_door');
        tall(first, 1, 'fridge', 'right');
        piece(first, F + 1, 2, 'oven', 'oven', 'right', { fire: 'off' });
        piece(first, F + 1, 3, 'sink', 'sink', 'right');
        // The sofa in the room, looking out of the window.
        for (let u = first; u <= Math.min(first + 2, last - 2); u++) piece(u, F + 1, 5, `${style.sofa}_sofa`, 'sofa', 'in');
        put(first + 1, F + 1, 3, 'table');
        put(first + 1, F + 2, 3, 'vase');
    }
    // Light, with what the room has room for.
    lantern(first + 2, F + 3, 3);
    lantern(last - 1, F + 3, 4);
    if (flat.extra === 0) floorLamp(last, 3);
    else if (flat.extra === 1) put(last, F + 1, 3, 'flower_pot');
    else if (flat.extra === 2) for (let y = F + 1; y <= F + 2; y++) piece(last, y, 3, 'bookshelf', 'bookshelf', 'left');
    else {
        piece(last, F + 1, 3, `${style.wood}_chair`, 'chair', 'left');
        put(last, F + 1, 2, 'flower_pot');
    }
    if (flat.loft) {
        // The big homes have a table for six, a desk and more sofa.
        for (let u = 9; u <= 12; u++) {
            put(u, F + 1, 3, 'table');
            piece(u, F + 1, 2, `${style.wood}_chair`, 'chair', 'in');
            piece(u, F + 1, 4, `${style.wood}_chair`, 'chair', 'out');
        }
        for (let u = 9; u <= 12; u++) piece(u, F + 1, 6, `${style.sofa}_sofa`, 'sofa', 'out');
        piece(14, F + 1, 2, 'desk', 'desk', 'in');
        piece(14, F + 1, 3, `${style.wood}_chair`, 'chair', 'out');
        put(14, F + 2, 2, 'table_lamp');
        lantern(11, F + 3, 3);
    }

    // ---- The windows have curtains: not over the balcony door, some drawn back. ----
    for (let u = first; u <= last; u++) {
        if (u === frame.balcony) continue;
        for (const y of [F + 2, F + 3]) {
            piece(u, y, 6, `${style.curtain}_curtain`, 'curtain', 'out', { drawn: (u + flat.n) % 3 ? 'open' : 'closed' });
        }
    }

    // ---- The balcony: its door, a railing, a pot, somewhere to sit, a light ----
    door(frame.balcony, 7, 'in', 'dark_oak_door');
    {
        const [, outer] = at(0, 9);
        const low = Math.min(...[first - 1, last + 1].map((u) => at(u, 9)[0]));
        const high = Math.max(...[first - 1, last + 1].map((u) => at(u, 9)[0]));
        b.box(low, F + 1, outer, high, F + 1, outer, 'iron_bars');
        boxUV(first - 1, 8, first - 1, 8, F + 1, F + 1, 'iron_bars');
        boxUV(last + 1, 8, last + 1, 8, F + 1, F + 1, 'iron_bars');
    }
    put(first, F + 1, 8, 'flower_pot');
    if (flat.extra % 2) piece(first + 1, F + 1, 8, `${style.wood}_chair`, 'chair', 'in');
    else piece(first + 1, F + 1, 8, 'bench', 'bench', 'in');
    lantern(frame.balcony, F + 3, 8);

    // ---- The private wing, or two: a bathroom on the corridor side, a bedroom on the window side ----
    frame.wings.forEach(({ wall, sign }, i) => {
        const k = (n) => wall + sign * n;
        const far = sign > 0 ? 'right' : 'left';
        const near = sign > 0 ? 'left' : 'right';
        boxUV(wall, 1, wall, 6, F + 1, F + 3, style.wall);
        boxUV(k(1), 3, k(4), 3, F + 1, F + 3, style.wall);
        boxUV(k(1), 1, k(4), 2, F, F, style.bath);
        // A sill under the bedroom's window.
        boxUV(k(1), 7, k(4), 7, F + 1, F + 1, 'concrete');
        boxUV(wall, 7, wall, 7, F + 1, F + 3, 'concrete');
        door(wall, 1, far, 'birch_door');
        door(wall, 5, far, 'oak_door');
        // The other wing of a big home varies too.
        const bath = (flat.bath + i) % 3;
        const bedLayout = (flat.bed + i) % 2;

        // Toilet, bathtub, sink with a mirror on the wall over it.
        const bathtub = (n0, v) => {
            piece(k(n0), F + 1, v, 'bathtub', 'bathtub', far, { part: 'foot' });
            piece(k(n0 + 1), F + 1, v, 'bathtub', 'bathtub', far, { part: 'head' });
        };
        const sink = (n, v) => {
            piece(k(n), F + 1, v, 'sink', 'sink', 'out');
            piece(k(n), F + 2, v, 'wall_mirror', 'wall_mirror', 'out');
            piece(k(n), F + 3, v, 'wall_mirror', 'wall_mirror', 'out');
        };
        if (bath === 0) {
            bathtub(1, 2);
            piece(k(3), F + 1, 2, 'toilet', 'toilet', 'out');
            sink(4, 2);
        } else if (bath === 1) {
            sink(2, 2);
            bathtub(3, 2);
            piece(k(4), F + 1, 1, 'toilet', 'toilet', 'in');
        } else {
            piece(k(1), F + 1, 2, 'toilet', 'toilet', 'out');
            sink(2, 2);
            bathtub(3, 1);
        }
        lantern(k(2), F + 3, 1);

        // Bed, wardrobe, bedside table with a lamp. The bed keeps the next cell free (apartmentsBed).
        const bedAt = (n, v, facing) => {
            const [x, z] = at(k(n), v);
            apartmentsBed(b, x, F + 1, z, toward[facing]);
        };
        if (bedLayout === 0) {
            bedAt(4, 5, far);
            piece(k(4), F + 1, 4, 'bedside_table', 'bedside_table', near);
            put(k(4), F + 2, 4, 'table_lamp');
            tall(k(2), 4, 'wardrobe', 'in');
        } else {
            bedAt(3, 4, 'out');
            piece(k(4), F + 1, 4, 'bedside_table', 'bedside_table', 'in');
            put(k(4), F + 2, 4, 'table_lamp');
            tall(k(4), 6, 'wardrobe', near);
        }
        for (const n of [1, 2]) put(k(n), F + 1, 6, `${style.rug}_carpet`);
        for (const n of [1, 2, 3]) {
            for (const y of [F + 2, F + 3]) piece(k(n), y, 6, `${style.curtain}_curtain`, 'curtain', 'out', { drawn: n === 2 ? 'closed' : 'open' });
        }
        lantern(k(2), F + 3, 5);
        piece(k(1), F + 3, 4, `painting_${style.painting}`, 'painting', 'in');
    });
    // On the living room's side wall: a painting or the clock, over the sofa.
    if (flat.extra % 2) piece(first, F + 3, 5, 'wall_clock', 'wall_clock', 'right');
    else piece(first, F + 3, 5, `painting_${style.painting}`, 'painting', 'right');
}

// ---------------------------------------------------------------------------------------
// The lift: the core of solid concrete, the shaft through it, and the circuit (see the header).

function apartmentsDrawLift(b) {
    const { x: sx, z: sz } = APARTMENTS_SHAFT;
    const at = (dx, y, dz, type) => b.set(sx + dx, y, sz + dz, type);
    const wire = (dx, y, dz) => at(dx, y, dz, 'copper_wire');
    const gate = (dx, y, dz, base, facing, delay) => {
        const state = delay ? { facing, delay: String(delay), power: 'off' } : { facing, power: 'off' };
        b.shaped(sx + dx, y, sz + dz, base, `logic_${base}`, state);
    };
    const button = (dx, y, dz) => b.shaped(sx + dx, y, sz + dz, 'push_button', 'logic_push_button', { power: 'off' });

    b.box(sx - 3, 1, sz - 1, sx + 5, APARTMENTS_WINCH_Y, sz + 5, 'concrete');
    b.box(sx, 1, sz, sx, APARTMENTS_WINCH_Y - 1, sz, null);
    b.set(sx, 0, sz, 'lift_platform');
    at(0, APARTMENTS_WINCH_Y, 0, 'lift_winch');

    // ---- The three buses, up the core: raise, clear, and the rams' power ----
    b.box(sx + 3, 2, sz, sx + 3, APARTMENTS_ROOF_Y + 1, sz, 'copper_wire');
    b.box(sx - 2, 2, sz + 1, sx - 2, APARTMENTS_ROOF_Y + 1, sz + 1, 'copper_wire');
    b.box(sx, APARTMENTS_STEP, sz + 3, sx, APARTMENTS_WINCH_Y - 1, sz + 3, 'copper_wire');

    for (let n = 0; n <= APARTMENTS_HOME_FLOORS; n++) {
        const F = n * APARTMENTS_STEP;
        // The doors of the shaft are closed until someone opens them: there may be no platform behind.
        at(0, F + 1, -1, null);
        at(0, F + 2, -1, null);
        b.door(sx, F + 1, sz - 1, 'spruce_door', 's');
        // The colour of this floor at the back of the shaft; a light in a niche; the buttons' colours.
        at(0, F + 1, 1, `${APARTMENTS_FLOOR_COLORS[n][0]}_wool`);
        at(1, F + 1, 0, 'lime_wool');
        at(-1, F + 1, 0, 'red_wool');
        at(-1, F + 3, 0, null);
        b.shaped(sx - 1, F + 3, sz, 'lantern', 'lantern', { mount: 'hanging' });

        if (n === 0) {
            // The lobby: "up" on the platform's side, on the raise bus; "call" at the door, on the clear bus.
            at(1, 2, 0, null);
            button(1, 2, 0);
            wire(2, 2, 0);
            at(-1, 2, -1, null);
            button(-1, 2, -1);
            wire(-1, 2, 0);
            wire(-1, 2, 1);
            continue;
        }

        // The ram under the floor, and over it the latch that joins it to the ram bus.
        b.shaped(sx, F - 1, sz + 1, 'motor_ram', 'mech_ram', { facing: 'n', arm: 'in' });
        gate(0, F, 1, 'latch', 's');
        wire(0, F, 2);
        // SET on its east side, RESET on its west side.
        wire(1, F, 1);
        wire(-1, F, 1);

        // "Call" on the landing, on a post down into the slab: there it feeds a 4 s delay to this
        // floor's SET and a 1 s delay to the raise bus, so a press does not join the floors' lines.
        at(1, F + 2, -1, null);
        button(1, F + 2, -1);
        at(1, F + 1, -1, 'wire_post');
        wire(1, F, -1);
        gate(1, F, 0, 'delay_gate', 's', 4);
        gate(2, F, -1, 'delay_gate', 'e', 1);
        wire(3, F, -1);

        // "Stop here" to the same SET, "down" to the clear bus.
        at(1, F + 2, 0, null);
        button(1, F + 2, 0);
        wire(1, F + 2, 1);
        wire(1, F + 1, 1);
        at(-1, F + 2, 0, null);
        button(-1, F + 2, 0);
        wire(-1, F + 2, 1);
    }
}

// The machine room on the roof, over the core: y is the floor of the room. See the header.
function apartmentsDrawMachines(b) {
    const { x: sx, z: sz } = APARTMENTS_SHAFT;
    const y = APARTMENTS_ROOF_Y + 1;
    const at = (dx, h, dz, type) => b.set(sx + dx, h, sz + dz, type);
    const wire = (dx, dz) => at(dx, y, dz, 'copper_wire');
    const gate = (dx, dz, base, facing, delay) => {
        const state = delay ? { facing, delay: String(delay), power: 'off' } : { facing, power: 'off' };
        b.shaped(sx + dx, y, sz + dz, base, `logic_${base}`, state);
    };

    // The raise bus, to the latch's SET and along to the timer and the clear bus.
    for (const dx of [3, 2, 1, 0, -1]) wire(dx, -1);
    gate(-2, -1, 'or_gate', 's');
    wire(-2, 0);

    // The timer: seven delays of 4 s, along one side, back on the other.
    for (let dz = 0; dz <= 4; dz++) gate(0, dz, 'delay_gate', 's', 4);
    for (const dx of [0, 1, 2, 3]) wire(dx, 5);
    wire(3, 4);
    gate(3, 3, 'delay_gate', 'n', 4);
    gate(3, 2, 'delay_gate', 'n', 4);

    // The latch: "the lift is climbing". Behind it the 1 s delay to the winch's rtg, in front of it
    // the NOT gate to the rams' rtg.
    gate(3, 1, 'latch', 'e');
    gate(2, 1, 'delay_gate', 'w', 1);
    at(2, y + 1, 1, 'rtg');
    gate(4, 1, 'not_gate', 'e');
    at(4, y + 1, 1, 'rtg');

    // Down from the delay to the winch, through what is solid in the core.
    at(2, y - 1, 1, 'copper_wire');
    for (const [dx, dz] of [[2, 1], [2, 2], [1, 2], [0, 2], [0, 1]]) at(dx, APARTMENTS_WINCH_Y, dz, 'copper_wire');

    // Down from the NOT gate to the top of the ram bus.
    at(4, y - 1, 1, 'copper_wire');
    at(4, APARTMENTS_WINCH_Y, 1, 'copper_wire');
    for (const [dx, dz] of [[4, 1], [4, 2], [4, 3], [3, 3], [2, 3], [1, 3]]) at(dx, APARTMENTS_WINCH_Y - 1, dz, 'copper_wire');
}

// ---------------------------------------------------------------------------------------
// The building

function constructionApartments(b) {
    const roof = APARTMENTS_ROOF_Y;
    const lantern = (x, y, z, mount = 'hanging') => b.shaped(x, y, z, 'lantern', 'lantern', { mount });
    const piece = (x, y, z, base, shape, facing) => b.shaped(x, y, z, base, shape, { facing });
    const stripe = 'orange_brick';

    // ---- The ground: a paved front, a planter on each side of the path, grass behind ----
    b.box(0, 0, 0, 23, 0, 2, 'stone_bricks');
    b.box(10, 0, 0, 13, 0, 2, 'slate');
    b.box(0, 0, 21, 23, 0, 22, 'grass');
    for (const x0 of [2, 15]) {
        b.box(x0, 0, 1, x0 + 6, 0, 1, 'grass');
        for (let x = x0; x <= x0 + 6; x++) b.set(x, 1, 1, x % 2 ? 'flower_red' : 'flower_yellow');
    }
    b.lampPost(9, 1, 1, 'dark_oak_fence', 2);
    b.lampPost(14, 1, 1, 'dark_oak_fence', 2);

    // ---- Slabs, the outside walls, the balconies' slabs and the stripes along their edges ----
    for (let n = 0; n <= APARTMENTS_HOME_FLOORS + 1; n++) {
        const F = n * APARTMENTS_STEP;
        b.box(0, F, 3, 23, F, 20, 'concrete');
        if (n > 0) {
            b.box(0, F, 1, 23, F, 2, 'concrete');
            b.box(0, F, 1, 23, F, 1, stripe);
            b.box(0, F, 21, 10, F, 22, 'concrete');
            b.box(0, F, 22, 10, F, 22, stripe);
            b.box(11, F, 20, 23, F, 20, stripe);
            b.box(0, F, 3, 0, F, 20, stripe);
            b.box(23, F, 3, 23, F, 20, stripe);
        }
        if (n > APARTMENTS_HOME_FLOORS) break;
        b.walls(0, F + 1, 3, 23, F + 3, 20, 'concrete');
        // The walls along the corridor, the lobby having only the one at the back.
        b.box(1, F + 1, 13, 22, F + 3, 13, 'concrete');
        if (n > 0) b.box(1, F + 1, 10, 22, F + 3, 10, 'concrete');
        // Windows down the sides, at eye height.
        for (const x of [0, 23]) {
            for (const z of [5, 6, 7, 8]) b.set(x, F + 2, z, 'glass_pane');
            if (x === 0) for (const z of [15, 16, 17, 18]) b.set(x, F + 2, z, 'glass_pane');
        }
    }

    // ---- The stairs: half a turn per floor, 2 up one way, a landing, 2 up the other. ----
    for (let n = 0; n <= APARTMENTS_HOME_FLOORS; n++) {
        const F = n * APARTMENTS_STEP;
        b.box(11, F + 1, 13, 11, F + 3, 19, 'concrete');
        b.box(11, F + 1, 18, 13, F + 3, 19, 'concrete');
        b.box(12, F + 1, 13, 13, F + 2, 13, null);
        b.stairs(12, F + 1, 15, 'stone_brick_stairs', 's');
        b.stairs(12, F + 2, 16, 'stone_brick_stairs', 's');
        b.box(12, F + 2, 17, 13, F + 2, 17, 'stone_bricks');
        b.stairs(13, F + 3, 16, 'stone_brick_stairs', 'n');
        // The well through the slab above, then the last step sits in it.
        b.box(12, F + 4, 15, 13, F + 4, 17, null);
        b.stairs(13, F + 4, 15, 'stone_brick_stairs', 'n');
    }

    apartmentsDrawLift(b);
    apartmentsDrawMachines(b);
    // A niche in the core lights the stairs (after the core, which is solid).
    for (let n = 0; n <= APARTMENTS_HOME_FLOORS; n++) {
        const F = n * APARTMENTS_STEP;
        b.set(14, F + 3, 16, 'torch');
        b.set(14, F + 2, 15, 'torch');
    }

    // ---- The lobby ----
    b.box(1, 0, 4, 22, 0, 12, 'marble');
    for (let x = 1; x <= 22; x++) {
        for (const z of [4, 6, 8, 10, 12]) if (x % 2) b.set(x, 0, z, 'basalt');
    }
    b.box(1, 1, 3, 22, 3, 3, 'glass');
    for (const x of [5, 18]) b.box(x, 1, 3, x, 3, 3, 'concrete');
    b.doubleDoor(11, 1, 3, 12, 3, 'dark_oak_door', 's');
    b.box(11, 0, 4, 12, 0, 12, 'slate');
    // Sofa and plants by the window, the sign, the mailboxes on the side wall, a clock over them all.
    for (let x = 2; x <= 4; x++) piece(x, 1, 4, 'gray_sofa', 'sofa', 's');
    for (let z = 5; z <= 6; z++) piece(1, 1, z, 'gray_sofa', 'sofa', 'e');
    b.box(2, 1, 5, 4, 1, 7, 'light_blue_carpet');
    b.set(3, 1, 6, 'table');
    b.set(3, 2, 6, 'vase');
    for (const [x, z] of [[1, 4], [10, 4], [13, 4], [22, 4], [22, 12], [1, 12]]) b.set(x, 1, z, 'flower_pot');
    for (const y of [2, 3]) {
        for (let z = 9; z <= 11; z++) piece(1, y, z, 'wall_shelf', 'wall_shelf', 'e');
    }
    apartmentsSign(b, 9, 1, 6, 's', 'Bienvenido a casa.', 'Welcome home. Stairs and lift at the back.');
    apartmentsSign(b, 15, 1, 12, 'n', 'ASCENSOR', 'Botón junto a la puerta: llamar. Botón en verde, dentro: subir. Sube hasta arriba y vuelve: pulsa verde en tu planta.',
        'LIFT. Button by the door: call it down. Button inside on green: up. It climbs to the top, then comes back: click green at your floor as you pass.');
    apartmentsSign(b, 19, 1, 12, 'n', 'Rojo: bajar. Verde: parar.', 'Abre la puerta del hueco solo si el ascensor está ahí.',
        'In the shaft, on each floor: red goes down, green stops here. Open a shaft door only when the lift is there.');
    piece(8, 3, 12, 'wall_clock', 'wall_clock', 'n');
    piece(20, 1, 7, 'desk', 'desk', 's');
    piece(20, 1, 8, 'dark_oak_chair', 'chair', 'n');
    b.set(20, 2, 7, 'table_lamp');
    b.set(11, 3, 8, 'chandelier');
    for (const [x, z] of [[3, 5], [4, 11], [8, 7], [21, 5], [20, 11], [15, 7]]) lantern(x, 3, z);

    // ---- The common room behind the lobby ----
    b.box(1, 0, 14, 10, 0, 19, 'planks');
    b.box(5, 1, 13, 5, 2, 13, null);
    b.door(5, 1, 13, 'birch_door', 's');
    b.box(1, 2, 20, 10, 3, 20, 'glass');
    for (let z = 15; z <= 18; z++) piece(10, 1, z, 'green_sofa', 'sofa', 'w');
    b.box(3, 1, 16, 6, 1, 17, 'table');
    for (let x = 3; x <= 6; x++) {
        piece(x, 1, 15, 'oak_chair', 'chair', 's');
        piece(x, 1, 18, 'oak_chair', 'chair', 'n');
    }
    for (let z = 14; z <= 16; z++) {
        for (let y = 1; y <= 2; y++) piece(1, y, z, 'bookshelf', 'bookshelf', 'e');
    }
    b.set(9, 1, 19, 'flower_pot');
    lantern(3, 3, 17);
    lantern(8, 3, 17);

    // ---- The homes ----
    for (let n = 1; n <= APARTMENTS_HOME_FLOORS; n++) {
        const F = n * APARTMENTS_STEP;
        const [color, es, en] = APARTMENTS_FLOOR_COLORS[n];
        b.box(1, F, 11, 22, F, 12, 'slate');
        b.box(1, F + 1, 11, 22, F + 1, 11, `${color}_carpet`);
        for (const x of [3, 9, 15, 21]) lantern(x, F + 3, 12);
        apartmentsSign(b, 15, F + 1, 12, 'n', `Planta ${n}, ${es}`, `Floor ${n}, ${en}. The button by the door calls the lift.`);
    }
    // What stands between the homes at the front: the wall moves from floor to floor.
    for (const flat of apartmentsFlats()) {
        if (flat.side === 'front' && flat.u0 > 1) b.box(flat.u0 - 1, flat.F + 1, 3, flat.u0 - 1, flat.F + 3, 9, 'concrete');
    }
    for (const flat of apartmentsFlats()) apartmentsDrawFlat(b, flat);

    // ---- The roof: a deck and a garden behind a railing ----
    b.box(1, roof, 2, 13, roof, 11, 'spruce_planks');
    b.box(1, roof, 12, 10, roof, 21, 'grass');
    b.box(0, roof + 1, 1, 23, roof + 1, 1, 'iron_bars');
    b.box(0, roof + 1, 1, 0, roof + 1, 22, 'iron_bars');
    b.box(0, roof + 1, 22, 10, roof + 1, 22, 'iron_bars');
    b.box(10, roof + 1, 21, 10, roof + 1, 22, 'iron_bars');
    b.box(10, roof + 1, 20, 13, roof + 1, 20, 'iron_bars');
    b.box(23, roof + 1, 1, 23, roof + 1, 11, 'iron_bars');
    // The garden: two small trees, flowers, a path of slate to a bench.
    for (const [x, z] of [[3, 15], [7, 20]]) {
        b.box(x, roof + 1, z, x, roof + 2, z, 'birch_wood');
        b.box(x - 1, roof + 3, z - 1, x + 1, roof + 3, z + 1, 'birch_leaves');
        b.set(x, roof + 4, z, 'birch_leaves');
    }
    for (const [x, z] of [[1, 13], [5, 13], [2, 18], [5, 17], [1, 20], [4, 20], [9, 14], [8, 16]]) {
        b.set(x, roof + 1, z, (x + z) % 2 ? 'flower_red' : 'flower_yellow');
    }
    b.box(9, roof, 12, 9, roof, 19, 'slate');
    for (let x = 6; x <= 8; x++) piece(x, roof + 1, 18, 'bench', 'bench', 's');
    // The deck: benches facing the view, pots along the railing, a table, lamps.
    for (let x = 3; x <= 6; x++) piece(x, roof + 1, 3, 'bench', 'bench', 'n');
    for (let x = 8; x <= 11; x++) piece(x, roof + 1, 3, 'bench', 'bench', 'n');
    for (const x of [1, 2, 7, 12, 13, 15, 17, 19, 21]) b.set(x, roof + 1, 2, 'flower_pot');
    for (const z of [4, 6, 8, 10]) b.set(1, roof + 1, z, 'flower_pot');
    b.box(5, roof + 1, 7, 7, roof + 1, 8, 'table');
    for (const [x, z, facing] of [[4, 7, 'e'], [8, 8, 'w'], [6, 6, 's'], [6, 9, 'n']]) piece(x, roof + 1, z, 'birch_chair', 'chair', facing);
    b.set(6, roof + 2, 7, 'vase');
    for (const [x, z] of [[2, 11], [13, 2], [11, 11], [22, 2], [1, 17]]) b.lampPost(x, roof + 1, z, 'dark_oak_fence', 2);

    // ---- The top of the stairs, with its door out ----
    b.walls(11, roof + 1, 13, 14, roof + 3, 18, 'concrete');
    b.box(11, roof + 4, 13, 14, roof + 4, 18, 'concrete');
    b.box(12, roof + 1, 13, 12, roof + 3, 13, 'glass');
    b.box(13, roof + 1, 13, 13, roof + 3, 13, 'glass');
    b.box(13, roof + 1, 13, 13, roof + 2, 13, null);
    b.door(13, roof + 1, 13, 'dark_oak_door', 'n');
    lantern(13, roof + 3, 14);
    lantern(12, roof + 3, 16);

    // ---- The machine room, over the core, with a window to look at it ----
    apartmentsDrawMachineRoom(b);
    apartmentsSign(b, 12, roof + 1, 11, 'n', 'Terraza', 'Roof terrace. The machine room next door runs the lift.');
}

function apartmentsDrawMachineRoom(b) {
    const y = APARTMENTS_ROOF_Y + 1;
    // Walls around what apartmentsDrawMachines placed, leaving it alone.
    const top = y + 2;
    const place = (x, h, z, type) => {
        if (!b.cells.has((h * b.size[2] + z) * b.size[0] + x)) b.set(x, h, z, type);
    };
    for (let h = y; h <= top; h++) {
        for (let x = 14; x <= 23; x++) {
            place(x, h, 12, 'concrete');
            place(x, h, 20, 'concrete');
        }
        for (let z = 12; z <= 20; z++) {
            place(14, h, z, 'concrete');
            place(23, h, z, 'concrete');
        }
    }
    b.box(14, top + 1, 12, 23, top + 1, 20, 'concrete');
    b.box(15, y + 1, 12, 22, y + 1, 12, 'glass');
    b.box(19, y, 12, 19, y + 1, 12, null);
    b.door(19, y, 12, 'dark_oak_door', 's');
    b.shaped(16, top, 16, 'lantern', 'lantern', { mount: 'hanging' });
    b.shaped(20, top, 17, 'lantern', 'lantern', { mount: 'hanging' });
    b.shaped(20, top, 13, 'lantern', 'lantern', { mount: 'hanging' });
}

CONSTRUCTION_DESIGNS.apartments = {
    label: 'Apartment block',
    size: [24, 53, 23],
    foundation: 'stone_bricks',
    anchorX: 11,
    start: [11, 1, 1],
    levels: apartmentsLevels(),
    generate: constructionApartments
};
