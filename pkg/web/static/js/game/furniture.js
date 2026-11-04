// Furniture: seating, tables, storage, kitchen and bath, and lights that need no power.
// - Every piece is a shaped block (js/blockShapes.js): boxes, with its state in the block name,
//   `oak_chair:e`, `wardrobe:upper:s`, `lantern:hanging`. Boxes are written facing north (the
//   front at z = 0) in sixteenths of a block. A box shows the part of the texture it would cut
//   from a whole block, so one texture paints a piece by height: a lamp is brass below and a
//   shade above. On a front face, u = 1 - x and v = 1 - y (v is top-down in a painter).
// - Blocks with `shareFaces` share their materials by what they show: the four facings of a
//   chest add one front to one side and one top, and pieces made of plain planks use the planks'
//   own material (`materialKey`). Nothing is built until a piece is first drawn.
// - A piece that joins its neighbour (table, bench, sofa) works it out when meshed, as fences do.
// - Lights use the block-light system (`lightEmission`: a level up to 14) and need no power.
// - Sitting is js/game/seating.js (`seat` is the height of the seat), chests js/game/storage.js
//   (`storageSlots`), and the oven toggles through shape.toggle, like a door (js/game/joinery.js).
// - Nothing falls when its support goes: the game has no such rule for torches, signs or ladders
//   and floating blocks are part of it. A hanging piece only needs a block above when placed.
// Mixed into Game.prototype; hooked through js/extensions.js.

const FURNITURE_COLORS = [
    // [id, label, colour of its wool]
    ['white', 'White', 0xF4F4F0], ['orange', 'Orange', 0xE88932], ['magenta', 'Magenta', 0xC653C9], ['light_blue', 'Light Blue', 0x67A9E8],
    ['yellow', 'Yellow', 0xE6D64C], ['lime', 'Lime', 0x72C54B], ['pink', 'Pink', 0xEA7AAE], ['gray', 'Gray', 0x555B63],
    ['light_gray', 'Light Gray', 0xA8ADB2], ['cyan', 'Cyan', 0x2EA7B8], ['purple', 'Purple', 0x7E4CC2], ['blue', 'Blue', 0x3558B8],
    ['brown', 'Brown', 0x7A4A2A], ['green', 'Green', 0x3E8A3D], ['red', 'Red', 0xB93A32], ['black', 'Black', 0x17191D]
];

// The chairs: [prefix, label, planks, colour].
const FURNITURE_CHAIRS = [
    ['oak', 'Oak', 'planks', 0xC8A675],
    ['birch', 'Birch', 'birch_planks', 0xFAE6B1],
    ['dark_oak', 'Dark Oak', 'dark_oak_planks', 0x614A3A]
];

// ---------------------------------------------------------------------------------------
// Shapes

// A box in sixteenths.
function furnBox(x0, y0, z0, x1, y1, z1) {
    return [x0 / 16, y0 / 16, z0 / 16, x1 / 16, y1 / 16, z1 / 16];
}

function furnBoxes(list) {
    return list.map((box) => furnBox(...box));
}

// The way a player looks, as the facing of a piece that looks back at them.
function furnFacePlayer(ctx) {
    return shapeFacingFromVector(-ctx.look.x, -ctx.look.z);
}

// Local +x of a shape turned to `facing` is this world direction (rotateShapeBox).
const FURN_RIGHT_OF = { n: 'e', e: 's', s: 'w', w: 'n' };

// Whether a shaped piece with a facing joins (mask bits) on its own left and right.
function furnJoined(state, mask) {
    const right = FURN_RIGHT_OF[state.facing];
    return { right: Boolean(mask & SHAPE_MASK[right]), left: Boolean(mask & SHAPE_MASK[SHAPE_OPPOSITE[right]]) };
}

// Joins the same piece (a red sofa, not a blue one) at its sides, when it faces the same way.
function furnJoinsSideways(def, other, dir) {
    if (!other.def || other.def.name !== def.name || !other.def.state || other.def.state.facing !== def.state.facing) return false;
    const right = FURN_RIGHT_OF[def.state.facing];
    return dir === right || dir === SHAPE_OPPOSITE[right];
}

// The usual shape: `boxes` and `collision` lists in sixteenths, written facing north, or
// functions of the state and connections returning such lists. Options: facing (default true:
// four facings, chosen to look at the player), place, connects, extra shape fields.
function furnShape(name, { boxes, collision, facing = true, ...rest }) {
    const turn = (list, state) => {
        const made = furnBoxes(list);
        return facing ? rotateShapeBoxes(made, state.facing) : made;
    };
    const resolve = (source, state, mask) => turn(typeof source === 'function' ? source(state, mask) : source, state);
    registerBlockShape(name, {
        ...(facing ? { states: [['facing', SHAPE_FACINGS]], iconState: { facing: 's' } } : {}),
        boxes: (state, mask) => resolve(boxes, state, mask),
        collision: collision ? (state, mask) => resolve(collision, state, mask) : undefined,
        // A front only shows on one side, so each facing needs its own array of materials.
        materialKey: (state, def) => (facing && def && def.faces && def.faces.front ? state.facing : null),
        place: facing ? (ctx) => [{ dx: 0, dy: 0, dz: 0, state: { facing: furnFacePlayer(ctx) } }] : undefined,
        ...rest
    });
}

// Two cells tall, like a door: breaking one half removes the other (js/game/joinery.js), and
// `def.halves` holds what differs between them. boxes(half) is a list in sixteenths.
function furnTallShape(name, { boxes, collision, facing = true, iconBoxes, ...rest }) {
    const turn = (list, state) => {
        const made = furnBoxes(list);
        return facing ? rotateShapeBoxes(made, state.facing) : made;
    };
    registerBlockShape(name, {
        states: facing ? [['half', ['lower', 'upper']], ['facing', SHAPE_FACINGS]] : [['half', ['lower', 'upper']]],
        boxes: (state) => turn(boxes(state.half), state),
        collision: collision ? (state) => turn(collision(state.half), state) : undefined,
        variant: (state, def) => (def.halves ? def.halves[state.half] : {}),
        materialKey: (state) => (facing ? `${state.half}:${state.facing}` : state.half),
        place(ctx) {
            if (!ctx.isFree(ctx.x, ctx.y + 1, ctx.z)) return null;
            const facingState = facing ? { facing: furnFacePlayer(ctx) } : {};
            return [
                { dx: 0, dy: 0, dz: 0, state: { half: 'lower', ...facingState } },
                { dx: 0, dy: 1, dz: 0, state: { half: 'upper', ...facingState } }
            ];
        },
        linked: (state) => (state.half === 'lower' ? [[0, 1, 0]] : [[0, -1, 0]]),
        iconState: facing ? { half: 'lower', facing: 's' } : { half: 'lower' },
        iconBoxes: furnBoxes(iconBoxes),
        ...rest
    });
}

const FURN_CHAIR_LEGS = [[2, 0, 2, 4, 7, 4], [12, 0, 2, 14, 7, 4], [2, 0, 12, 4, 7, 14], [12, 0, 12, 14, 7, 14]];
furnShape('chair', {
    boxes: [...FURN_CHAIR_LEGS, [2, 7, 2, 14, 8, 14], [2, 8, 12, 4, 16, 14], [12, 8, 12, 14, 16, 14], [4, 10, 12.5, 12, 15, 13.5]],
    collision: [[2, 0, 2, 14, 8, 14], [2, 8, 12, 14, 16, 14]]
});

furnShape('stool', {
    facing: false,
    boxes: [[3, 0, 3, 5, 8, 5], [11, 0, 3, 13, 8, 5], [3, 0, 11, 5, 8, 13], [11, 0, 11, 13, 8, 13], [2, 8, 2, 14, 10, 14]],
    collision: [[2, 0, 2, 14, 10, 14]]
});

// A long bench: seat and back run on through neighbours facing the same way; the ends get legs.
furnShape('bench', {
    boxes(state, mask) {
        const { left, right } = furnJoined(state, mask);
        const boxes = [[0, 7, 2, 16, 8, 14], [0, 9, 13, 16, 15, 15], [left ? 0 : 1, 8, 13.5, left ? 1 : 2, 9, 14.5], [right ? 15 : 14, 8, 13.5, right ? 16 : 15, 9, 14.5]];
        if (!left) boxes.push([1, 0, 3, 3, 7, 13]);
        if (!right) boxes.push([13, 0, 3, 15, 7, 13]);
        return boxes;
    },
    collision: [[0, 0, 2, 16, 8, 14], [0, 8, 13, 16, 15, 15]],
    connects: furnJoinsSideways
});

// An armchair on its own; side by side, a sofa: the arms and feet between them go.
furnShape('sofa', {
    boxes(state, mask) {
        const { left, right } = furnJoined(state, mask);
        const boxes = [[0, 2, 1, 16, 7, 15], [0, 7, 1, 16, 9, 11], [0, 7, 11, 16, 16, 15]];
        if (!left) boxes.push([0, 9, 1, 3, 12, 11], [1, 0, 2, 3, 2, 4], [1, 0, 12, 3, 2, 14]);
        if (!right) boxes.push([13, 9, 1, 16, 12, 11], [13, 0, 2, 15, 2, 4], [13, 0, 12, 15, 2, 14]);
        return boxes;
    },
    collision: [[0, 0, 1, 16, 9, 15], [0, 9, 11, 16, 16, 15]],
    connects: furnJoinsSideways
});

// A table: the top runs on through neighbouring tables; a leg only where a corner stays free.
furnShape('table', {
    facing: false,
    boxes(state, mask) {
        const boxes = [[0, 14, 0, 16, 16, 16]];
        const free = (dir) => !(mask & SHAPE_MASK[dir]);
        if (free('n') && free('w')) boxes.push([1, 0, 1, 3, 14, 3]);
        if (free('n') && free('e')) boxes.push([13, 0, 1, 15, 14, 3]);
        if (free('s') && free('w')) boxes.push([1, 0, 13, 3, 14, 15]);
        if (free('s') && free('e')) boxes.push([13, 0, 13, 15, 14, 15]);
        return boxes;
    },
    collision: [[0, 0, 0, 16, 16, 16]],
    connects: (def, other) => Boolean(other.def && other.def.shape === 'table')
});

furnShape('bedside_table', {
    boxes: [[1, 2, 1, 15, 16, 15], [2, 0, 2, 4, 2, 4], [12, 0, 2, 14, 2, 4], [2, 0, 12, 4, 2, 14], [12, 0, 12, 14, 2, 14]],
    collision: [[1, 0, 1, 15, 16, 15]]
});

furnShape('desk', {
    boxes: [[0, 14, 0, 16, 16, 16], [0, 0, 1, 6, 14, 15], [14, 0, 1, 16, 14, 15], [6, 10, 14, 14, 14, 15]],
    collision: [[0, 0, 0, 16, 16, 16]]
});

furnShape('chest', {
    boxes: [[1, 0, 1, 15, 15, 15], [7, 6, 0, 9, 10, 1]],
    collision: [[1, 0, 1, 15, 15, 15]]
});

// A square turned to look round: three boxes of different widths, one texture.
furnShape('barrel', {
    facing: false,
    boxes: [[3, 0, 1, 13, 16, 15], [1, 0, 3, 15, 16, 13], [2, 0, 2, 14, 16, 14]],
    collision: [[1, 0, 1, 15, 16, 15]]
});

furnTallShape('wardrobe', {
    boxes: () => [[0, 0, 1, 16, 16, 15]],
    iconBoxes: [[1, 0, 1, 15, 32, 15]]
});

// The wall items' back touches the wall, whatever face was clicked; floors and ceilings refuse.
function furnPlaceOnWall(ctx) {
    if (Math.abs(ctx.normal.y) > 0.5) return null;
    return [{ dx: 0, dy: 0, dz: 0, state: { facing: shapeFacingFromVector(ctx.normal.x, ctx.normal.z) } }];
}

furnShape('wall_shelf', {
    boxes: [[0, 6, 8, 16, 8, 16], [2, 3, 14, 4, 6, 16], [12, 3, 14, 14, 6, 16], [2, 8, 10, 5, 13, 15], [5, 8, 10, 7, 12, 15], [10, 8, 10, 13, 13, 15]],
    place: furnPlaceOnWall
});

furnShape('workbench', {
    facing: false,
    boxes: [[0, 13, 0, 16, 16, 16], [1, 0, 1, 3, 13, 3], [13, 0, 1, 15, 13, 3], [1, 0, 13, 3, 13, 15], [13, 0, 13, 15, 13, 15], [3, 4, 3, 13, 5, 13]],
    collision: [[0, 0, 0, 16, 16, 16]]
});

// An oven: right click lights it, and it gives light while it burns.
registerBlockShape('oven', {
    states: [['facing', SHAPE_FACINGS], ['fire', ['off', 'on']]],
    boxes: () => [[0, 0, 0, 1, 1, 1]],
    variant: (state, def) => (state.fire === 'on' ? def.lit : {}),
    materialKey: (state) => `${state.facing}:${state.fire}`,
    place: (ctx) => [{ dx: 0, dy: 0, dz: 0, state: { facing: furnFacePlayer(ctx), fire: 'off' } }],
    toggle: (state) => ({ ...state, fire: state.fire === 'on' ? 'off' : 'on' }),
    iconState: { facing: 's', fire: 'off' }
});

furnShape('sink', {
    boxes: [[1, 0, 2, 15, 13, 15], [1, 13, 2, 15, 16, 4], [1, 13, 13, 15, 16, 15], [1, 13, 4, 3, 16, 13], [13, 13, 4, 15, 16, 13], [7, 13, 12, 9, 16, 13], [7, 15, 9, 9, 16, 12]],
    collision: [[1, 0, 2, 15, 16, 15]]
});

furnTallShape('fridge', {
    boxes: (half) => (half === 'lower'
        ? [[1, 0, 1, 15, 16, 15], [12, 11, 0, 13, 16, 1]]
        : [[1, 0, 1, 15, 16, 15], [12, 0, 0, 13, 4, 1], [12, 8, 0, 13, 13, 1]]),
    collision: () => [[1, 0, 1, 15, 16, 15]],
    iconBoxes: [[1, 0, 1, 15, 32, 15]]
});

furnShape('toilet', {
    boxes: [[5, 0, 3, 11, 6, 11], [3, 6, 1, 13, 9, 12], [3, 6, 12, 13, 16, 15]],
    collision: [[3, 0, 1, 13, 9, 12], [3, 0, 12, 13, 16, 15]]
});

// A bathtub is two cells: the foot, where it is placed, and the head beyond it, away from the
// player. Facing is the way the head lies; low walls round a floor you can step into.
const FURN_TUB_FOOT = [[0, 0, 0, 16, 3, 16], [0, 3, 0, 2, 10, 16], [14, 3, 0, 16, 10, 16], [2, 3, 14, 14, 10, 16]];
const FURN_TUB_HEAD = [[0, 0, 0, 16, 3, 16], [0, 3, 0, 2, 10, 16], [14, 3, 0, 16, 10, 16], [2, 3, 0, 14, 10, 2], [7, 10, 0, 9, 13, 3]];
registerBlockShape('bathtub', {
    states: [['part', ['foot', 'head']], ['facing', SHAPE_FACINGS]],
    boxes: (state) => rotateShapeBoxes(furnBoxes(state.part === 'head' ? FURN_TUB_HEAD : FURN_TUB_FOOT), state.facing),
    place(ctx) {
        const facing = shapeFacingFromVector(ctx.look.x, ctx.look.z);
        const [dx, dz] = SHAPE_DIRECTIONS[facing];
        if (!ctx.isFree(ctx.x + dx, ctx.y, ctx.z + dz)) return null;
        return [
            { dx: 0, dy: 0, dz: 0, state: { part: 'foot', facing } },
            { dx, dy: 0, dz, state: { part: 'head', facing } }
        ];
    },
    linked(state) {
        const [dx, dz] = SHAPE_DIRECTIONS[state.facing];
        return state.part === 'foot' ? [[dx, 0, dz]] : [[-dx, 0, -dz]];
    },
    iconState: { part: 'foot', facing: 's' },
    iconBoxes: furnBoxes([[1, 0, 3, 15, 3, 13], [1, 3, 3, 15, 8, 4], [1, 3, 12, 15, 8, 13], [1, 3, 4, 2, 8, 12], [14, 3, 4, 15, 8, 12]])
});

// Small things have no collision at all: you walk through them like a torch.
furnShape('candle', {
    facing: false,
    boxes: [[6, 0, 6, 10, 7, 10], [7.5, 7, 7.5, 8.5, 9, 8.5], [7, 9, 7, 9, 12, 9]],
    iconFit: true
});

const FURN_LANTERN = (y) => [[5, y, 5, 11, y + 1, 11], [5.5, y + 1, 5.5, 10.5, y + 7, 10.5], [5, y + 7, 5, 11, y + 8, 11], [7, y + 8, 7, 9, y + 10, 9]];
const FURN_LANTERN_LIFT = 4;
registerBlockShape('lantern', {
    states: [['mount', ['floor', 'hanging']]],
    boxes(state) {
        if (state.mount === 'floor') return furnBoxes(FURN_LANTERN(0));
        return furnBoxes([...FURN_LANTERN(FURN_LANTERN_LIFT), [7.5, FURN_LANTERN_LIFT + 10, 7.5, 8.5, 16, 8.5]]);
    },
    // The same texture would band the glass differently at each height.
    variant: (state, def) => def.mounts[state.mount],
    materialKey: (state) => state.mount,
    // Against the underside of a block it hangs; anywhere else it stands.
    place: (ctx) => [{ dx: 0, dy: 0, dz: 0, state: { mount: ctx.normal.y < -0.5 ? 'hanging' : 'floor' } }],
    iconState: { mount: 'floor' },
    iconFit: true
});

furnShape('table_lamp', {
    facing: false,
    boxes: [[5, 0, 5, 11, 1, 11], [7, 1, 7, 9, 7, 9], [4, 7, 4, 12, 13, 12]],
    iconFit: true
});

furnTallShape('floor_lamp', {
    facing: false,
    boxes: (half) => (half === 'lower'
        ? [[4, 0, 4, 12, 1, 12], [7, 1, 7, 9, 16, 9]]
        : [[7, 0, 7, 9, 6, 9], [3, 6, 3, 13, 14, 13]]),
    collision: (half) => (half === 'lower' ? [[6, 0, 6, 10, 16, 10]] : [[6, 0, 6, 10, 6, 10]]),
    iconBoxes: [[4, 0, 4, 12, 1, 12], [7, 1, 7, 9, 22, 9], [3, 22, 3, 13, 30, 13]],
    iconFit: true
});

// A chandelier only goes under a block: it has nothing else to hang from.
furnShape('chandelier', {
    facing: false,
    boxes: [[6, 3, 6, 10, 6, 10], [1, 5, 7.5, 15, 6, 8.5], [7.5, 5, 1, 8.5, 6, 15], [7.5, 6, 7.5, 8.5, 16, 8.5],
        [1, 6, 7, 3, 8, 9], [13, 6, 7, 15, 8, 9], [7, 6, 1, 9, 8, 3], [7, 6, 13, 9, 8, 15],
        [1.5, 8, 7.5, 2.5, 10, 8.5], [13.5, 8, 7.5, 14.5, 10, 8.5], [7.5, 8, 1.5, 8.5, 10, 2.5], [7.5, 8, 13.5, 8.5, 10, 14.5]],
    place: (ctx) => (ctx.isSolid(ctx.x, ctx.y + 1, ctx.z) ? [{ dx: 0, dy: 0, dz: 0, state: {} }] : null),
    iconFit: true
});

// ---------------------------------------------------------------------------------------
// Textures

// Boards with grain: a wood tone at (u, v), running along v or across it.
function furnWood(f, s, base, u, v, seed, along = false, boards = 4) {
    const across = along ? u : v;
    const length = along ? v : u;
    const board = Math.floor(across * boards);
    const grain = f.stretchedNoise(length, across, 2, 10, seed + board);
    const seam = (across * boards) % 1 < 0.12;
    return f.tone(s, base, (grain - 0.5) * 0.22 + (f.hash(board, 3, seed) - 0.5) * 0.12 - (seam ? 0.24 : 0));
}

function furnEnamel(f, s, base, u, v, seed) {
    return f.tone(s, base, (f.fbm(u, v, 4, 2, seed) - 0.5) * 0.05 + (v - 0.5) * -0.05);
}

const FURN_IRON = 0x5a5f66;

// A chest: horizontal boards, iron bands and corners, the seam of the lid.
function furnPaintChest(f, s, tint, seed, latch) {
    const wood = f.rgb(tint ?? 0x8a5a2c);
    const iron = f.rgb(FURN_IRON);
    f.each(s, (x, y, u, v) => {
        let c = furnWood(f, s, wood, u, v, seed);
        let h = 0.5;
        const band = Math.abs(u - 0.2) < 0.05 || Math.abs(u - 0.8) < 0.05 || u < 0.09 || u > 0.91;
        if (band) { c = f.tone(s, iron, (f.hash(x, y, seed) - 0.5) * 0.1); h = 0.8; }
        if (Math.abs(v - 0.44) < 0.04) { c = f.tone(s, wood, -0.55); h = 0.2; }
        if (latch && Math.abs(u - 0.5) < 0.09 && v > 0.36 && v < 0.62) { c = f.tone(s, f.rgb(0xd8b84a), v > 0.5 ? -0.2 : 0.05); h = 0.9; }
        f.put(s, x, y, c, h);
    });
}
registerTexturePattern('chest_front', (f, s, tint, seed) => furnPaintChest(f, s, tint, seed, true));
registerTexturePattern('chest_side', (f, s, tint, seed) => furnPaintChest(f, s, tint, seed, false));
registerTexturePattern('chest_top', (f, s, tint, seed) => {
    const wood = f.rgb(tint ?? 0x8a5a2c);
    const iron = f.rgb(FURN_IRON);
    f.each(s, (x, y, u, v) => {
        const band = Math.abs(u - 0.2) < 0.05 || Math.abs(u - 0.8) < 0.05 || u < 0.09 || u > 0.91 || v < 0.09 || v > 0.91;
        f.put(s, x, y, band ? f.tone(s, iron, 0) : furnWood(f, s, wood, u, v, seed), band ? 0.8 : 0.5);
    });
});

// Staves with two iron hoops; the lid in rings.
registerTexturePattern('barrel_side', (f, s, tint, seed) => {
    const wood = f.rgb(tint ?? 0x8a5a2c);
    const iron = f.rgb(FURN_IRON);
    f.each(s, (x, y, u, v) => {
        const hoop = Math.abs(v - 0.2) < 0.06 || Math.abs(v - 0.8) < 0.06;
        f.put(s, x, y, hoop ? f.tone(s, iron, 0) : furnWood(f, s, wood, u, v, seed, true, 6), hoop ? 0.8 : 0.5);
    });
});
registerTexturePattern('barrel_top', (f, s, tint, seed) => {
    const wood = f.rgb(tint ?? 0x8a5a2c);
    f.each(s, (x, y, u, v) => {
        const r = Math.hypot(u - 0.5, v - 0.5);
        const rim = r > 0.34;
        f.put(s, x, y, rim ? f.tone(s, f.rgb(FURN_IRON), 0) : furnWood(f, s, wood, u, v, seed, false, 4), rim ? 0.8 : 0.45);
    });
});

// Wardrobe doors: two panels in frames, the handles meeting at the join of its two cells.
function furnPaintWardrobe(f, s, tint, seed, upper) {
    const wood = f.rgb(tint ?? 0x614a3a);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        const door = Math.min(Math.abs(u - 0.5), u, 1 - u);
        const edge = upper ? v : 1 - v;
        const frame = door < 2 * px || edge < 2 * px;
        let c = frame ? f.tone(s, wood, 0.05) : furnWood(f, s, wood, u, v, seed, true, 8);
        let h = frame ? 0.8 : 0.45;
        if (Math.abs(u - 0.5) < 0.6 * px) { c = f.tone(s, wood, -0.6); h = 0.1; }
        const handleV = upper ? v > 0.85 : v < 0.15;
        if (handleV && Math.abs(Math.abs(u - 0.5) - 0.07) < 0.03) { c = f.rgb(0xd8b84a); h = 1; }
        f.put(s, x, y, c, h);
    });
}
registerTexturePattern('wardrobe_lower', (f, s, tint, seed) => furnPaintWardrobe(f, s, tint, seed, false));
registerTexturePattern('wardrobe_upper', (f, s, tint, seed) => furnPaintWardrobe(f, s, tint, seed, true));

// Shelves of books of many colours. Used on the bookshelf (two rows) and, in one row, elsewhere.
const FURN_BOOKS = [0xa8342c, 0x2f5fa8, 0x3a8a4c, 0xd8b84a, 0x7e4cc2, 0xc97a2c, 0x30343c, 0xd8d0c0];
registerTexturePattern('bookshelf', (f, s, tint, seed) => {
    const wood = f.rgb(tint ?? 0xb48a56);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        const row = v < 0.5 ? 0 : 1;
        const inRow = v < 0.5 ? v * 2 : (v - 0.5) * 2;
        if (inRow < 2.2 * px * 2 || inRow > 1 - px * 2 || u < px * 1.2 || u > 1 - px * 1.2) {
            f.put(s, x, y, furnWood(f, s, wood, u, v, seed), 0.8);
            return;
        }
        const slot = Math.floor(u * 7);
        const book = FURN_BOOKS[Math.floor(f.hash(slot, row, seed) * FURN_BOOKS.length)];
        const top = 0.14 + f.hash(slot, row + 5, seed) * 0.3;
        if (inRow < top) {
            f.put(s, x, y, f.tone(s, wood, -0.7), 0.05);
            return;
        }
        const gap = (u * 7) % 1 < 0.14;
        const band = Math.abs(inRow - 0.55 - f.hash(slot, row + 9, seed) * 0.2) < 0.05;
        f.put(s, x, y, f.tone(s, f.rgb(book), gap ? -0.5 : band ? 0.25 : (f.hash(x, y, seed) - 0.5) * 0.1), gap ? 0.25 : 0.6);
    });
});

// One row of books above a board, for the wall shelf.
registerTexturePattern('wall_shelf_side', (f, s, tint, seed) => {
    const wood = f.rgb(tint ?? 0xb48a56);
    f.each(s, (x, y, u, v) => {
        if (v > 8 / 16) {
            f.put(s, x, y, furnWood(f, s, wood, u, v, seed), 0.6);
            return;
        }
        const book = FURN_BOOKS[Math.floor(f.hash(Math.floor(u * 5), 2, seed) * FURN_BOOKS.length)];
        f.put(s, x, y, f.tone(s, f.rgb(book), (f.hash(x, y, seed) - 0.5) * 0.1), 0.6);
    });
});

// Drawers with knobs; `rows` of them across the part of the face between u0 and u1.
function furnPaintDrawers(f, s, tint, seed, u0, u1, rows) {
    const wood = f.rgb(tint ?? 0xb48a56);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        let c = furnWood(f, s, wood, u, v, seed);
        let h = 0.5;
        if (u >= u0 && u <= u1 && v > 2 / 16) {
            const inRow = ((v - 2 / 16) / (14 / 16)) * rows;
            const edge = Math.min(inRow % 1, 1 - inRow % 1) / rows;
            if (edge < 0.8 * px) { c = f.tone(s, wood, -0.45); h = 0.15; }
            else c = f.tone(s, wood, 0.08 + (f.stretchedNoise(u, v, 2, 10, seed) - 0.5) * 0.14);
            if (Math.abs(u - (u0 + u1) / 2) < 0.05 && Math.abs((inRow % 1) - 0.5) < 0.2) { c = f.rgb(0xd8b84a); h = 0.95; }
        }
        f.put(s, x, y, c, h);
    });
}
registerTexturePattern('bedside_front', (f, s, tint, seed) => furnPaintDrawers(f, s, tint, seed, 1 / 16, 15 / 16, 2));
// A desk's drawers are on its left, seen from the front (u = 1 - x).
registerTexturePattern('desk_front', (f, s, tint, seed) => furnPaintDrawers(f, s, tint, seed, 10 / 16, 1, 3));

// A worn top with a square of inlay, ruler marks along one edge and a dark stain.
registerTexturePattern('workbench_top', (f, s, tint, seed) => {
    const wood = f.rgb(tint ?? 0xb48a56);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        let c = furnWood(f, s, wood, u, v, seed);
        let h = 0.5;
        const inlay = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5));
        if (Math.abs(inlay - 0.3) < 0.7 * px) { c = f.tone(s, wood, -0.4); h = 0.3; }
        if (v > 0.88 && (u * 8) % 1 < 0.2) { c = f.tone(s, wood, -0.55); h = 0.2; }
        if (Math.hypot(u - 0.3, v - 0.28) < 0.09) c = f.tone(s, wood, -0.28);
        f.put(s, x, y, c, h);
    });
});

// Oven: iron, a door with a window (fire behind it when lit), a handle, four knobs above.
function furnPaintOvenFront(f, s, lit, seed) {
    const iron = f.rgb(0x3a3d42);
    f.each(s, (x, y, u, v) => {
        let c = f.tone(s, iron, (f.fbm(u, v, 4, 2, seed) - 0.5) * 0.12);
        let h = 0.6;
        if (u > 0.18 && u < 0.82 && v > 0.42 && v < 0.84) {
            if (lit) {
                const flame = f.fbm(u, v * 0.6, 4, 3, seed) + (v - 0.5) * 0.9;
                c = flame > 0.75 ? f.rgb(0xfff0a0) : flame > 0.55 ? f.rgb(0xffa030) : f.rgb(0xc8401a);
            } else {
                c = f.tone(s, f.rgb(0x15161a), (u + v) % 0.5 < 0.07 ? 0.5 : 0);
            }
            h = 0.25;
        }
        if (Math.abs(v - 0.3) < 0.035 && u > 0.2 && u < 0.8) { c = f.rgb(0xb8bcc2); h = 1; }
        if (v > 0.08 && v < 0.2 && (u * 4 + 0.5) % 1 < 0.45 && u > 0.1 && u < 0.9) { c = f.rgb(lit ? 0xd86a2a : 0x9ea2a8); h = 0.9; }
        f.put(s, x, y, c, h);
    });
}
registerTexturePattern('oven_front_off', (f, s, tint, seed) => furnPaintOvenFront(f, s, false, seed));
registerTexturePattern('oven_front_on', (f, s, tint, seed) => furnPaintOvenFront(f, s, true, seed));
registerTexturePattern('oven_side', (f, s, tint, seed) => {
    const iron = f.rgb(0x3a3d42);
    f.each(s, (x, y, u, v) => {
        const edge = Math.min(u, 1 - u, v, 1 - v) < 0.06;
        f.put(s, x, y, f.tone(s, iron, edge ? -0.25 : (f.fbm(u, v, 3, 2, seed) - 0.5) * 0.12), edge ? 0.4 : 0.6);
    });
});
registerTexturePattern('oven_top', (f, s, tint, seed) => {
    const iron = f.rgb(0x2c2e32);
    f.each(s, (x, y, u, v) => {
        const r = Math.hypot(((u * 2) % 1) - 0.5, ((v * 2) % 1) - 0.5);
        const ring = (r > 0.2 && r < 0.34) || r < 0.07;
        f.put(s, x, y, f.tone(s, ring ? f.rgb(0x6a6d72) : iron, (f.hash(x, y, seed) - 0.5) * 0.06), ring ? 0.8 : 0.5);
    });
});

// White china and enamel: sink, toilet, bathtub, fridge. They shine in RTX and Ultra (`rtx`).
const FURN_CHINA = 0xe8e8e4;
const FURN_GLOSSY = { rtx: { roughness: 0.22, metalness: 0, normalScale: 0.2 } };
registerTexturePattern('china', (f, s, tint, seed) => {
    const base = f.rgb(tint ?? FURN_CHINA);
    f.each(s, (x, y, u, v) => f.put(s, x, y, furnEnamel(f, s, base, u, v, seed), 0.5));
}, FURN_GLOSSY);

// Rim of china round a sunken centre, seen from above: water at the bottom, a drain.
function furnPaintBasin(f, s, tint, seed, rim, water, drain) {
    const base = f.rgb(tint ?? FURN_CHINA);
    const blue = f.rgb(water);
    f.each(s, (x, y, u, v) => {
        const inner = Math.min(u, 1 - u, v, 1 - v) >= rim;
        if (!inner) {
            f.put(s, x, y, furnEnamel(f, s, base, u, v, seed), 0.7);
            return;
        }
        const glint = Math.abs(u - v) < 0.05 ? 0.2 : 0;
        const dark = drain && Math.hypot(u - 0.5, v - 0.5) < 0.06;
        f.put(s, x, y, dark ? f.rgb(0x30343c) : f.tone(s, blue, glint + (f.fbm(u, v, 4, 2, seed) - 0.5) * 0.1), 0.3);
    });
}
registerTexturePattern('sink_top', (f, s, tint, seed) => furnPaintBasin(f, s, tint, seed, 3 / 16, 0xb9dbe8, true), FURN_GLOSSY);
registerTexturePattern('toilet_top', (f, s, tint, seed) => furnPaintBasin(f, s, tint, seed, 5 / 16, 0x9fc8dc, false), FURN_GLOSSY);
registerTexturePattern('bathtub_top', (f, s, tint, seed) => furnPaintBasin(f, s, tint, seed, 2 / 16, 0x8fc4e0, false), FURN_GLOSSY);

// A sink's cabinet: china basin above, two wooden doors under it.
registerTexturePattern('sink_front', (f, s, tint, seed) => {
    const china = f.rgb(FURN_CHINA);
    const wood = f.rgb(0x8a6a48);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        if (v < 4 / 16) {
            f.put(s, x, y, furnEnamel(f, s, china, u, v, seed), 0.6);
            return;
        }
        let c = furnWood(f, s, wood, u, v, seed, true, 8);
        let h = 0.5;
        if (Math.abs(u - 0.5) < 0.7 * px) { c = f.tone(s, wood, -0.55); h = 0.1; }
        if (v > 0.45 && v < 0.6 && Math.abs(Math.abs(u - 0.5) - 0.08) < 0.03) { c = f.rgb(0xb8bcc2); h = 1; }
        f.put(s, x, y, c, h);
    });
});

// A fridge: the freezer's seam above, the handles are boxes of their own.
function furnPaintFridge(f, s, tint, seed, upper) {
    const base = f.rgb(0xdfe3e6);
    f.each(s, (x, y, u, v) => {
        let c = furnEnamel(f, s, base, u, v, seed);
        let h = 0.6;
        if (upper && Math.abs(v - 0.55) < 0.03) { c = f.tone(s, base, -0.6); h = 0.1; }
        if (!upper && v > 0.9) c = f.tone(s, base, -0.3);
        f.put(s, x, y, c, h);
    });
}
registerTexturePattern('fridge_lower', (f, s, tint, seed) => furnPaintFridge(f, s, tint, seed, false), FURN_GLOSSY);
registerTexturePattern('fridge_upper', (f, s, tint, seed) => furnPaintFridge(f, s, tint, seed, true), FURN_GLOSSY);

// Fabric, a stitched seam, dark wood at the very bottom (the sofa's feet).
registerTexturePattern('upholstery', (f, s, tint, seed) => {
    const cloth = f.rgb(tint ?? 0xb93a32);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        if (v > 14 / 16) {
            f.put(s, x, y, f.tone(s, f.rgb(0x4a3020), 0), 0.8);
            return;
        }
        const weave = (f.hash(x, y, seed) - 0.5) * 0.14 + (f.fbm(u, v, 5, 2, seed) - 0.5) * 0.1;
        const seam = Math.abs(u - 0.5) < 0.6 * px;
        f.put(s, x, y, f.tone(s, cloth, seam ? -0.2 : weave), seam ? 0.3 : 0.55 + weave * 0.5);
    });
});

// Paints a piece by the height y of the block (in sixteenths): bands [fromY, colour], lowest first.
function furnPaintBands(f, s, seed, bands) {
    f.each(s, (x, y, u, v) => {
        const height = (1 - v) * 16;
        let color = bands[0][1];
        for (const [from, hex] of bands) {
            if (height >= from) color = hex;
        }
        f.put(s, x, y, f.tone(s, f.rgb(color), (f.hash(x, y, seed) - 0.5) * 0.08), 0.6);
    });
}

const FURN_BRASS = 0xc9a23a;
const FURN_WAX = 0xf0e6c8;
const FURN_SHADE = 0xf6dc9c;
registerTexturePattern('candle', (f, s, tint, seed) => furnPaintBands(f, s, seed, [[0, FURN_WAX], [7, 0x3a3028], [9, 0xffb030], [10.5, 0xffe890]]));
registerTexturePattern('candle_top', (f, s, tint, seed) => {
    f.each(s, (x, y, u, v) => {
        const r = Math.hypot(u - 0.5, v - 0.5);
        f.put(s, x, y, f.rgb(r < 0.08 ? 0xfff0a0 : FURN_WAX), 0.5);
    });
});

// A lantern's body starts at height `y0`: iron plates, glass with bars, a warm light inside.
function furnPaintLantern(f, s, seed, y0) {
    const iron = f.rgb(0x35373c);
    const glass = f.rgb(0xffcf70);
    f.each(s, (x, y, u, v) => {
        const height = (1 - v) * 16 - y0;
        if (height >= 1 && height < 7) {
            f.put(s, x, y, Math.abs(u - 0.5) < 0.03 ? iron : f.tone(s, glass, (height - 4) * -0.04), 0.5);
            return;
        }
        f.put(s, x, y, f.tone(s, iron, (f.hash(x, y, seed) - 0.5) * 0.12), 0.7);
    });
}
registerTexturePattern('lantern_floor', (f, s, tint, seed) => furnPaintLantern(f, s, seed, 0));
registerTexturePattern('lantern_hanging', (f, s, tint, seed) => furnPaintLantern(f, s, seed, FURN_LANTERN_LIFT));
registerTexturePattern('lantern_top', (f, s, tint, seed) => {
    const iron = f.rgb(0x35373c);
    f.each(s, (x, y) => f.put(s, x, y, f.tone(s, iron, (f.hash(x, y, seed) - 0.5) * 0.12), 0.6));
});

registerTexturePattern('table_lamp', (f, s, tint, seed) => furnPaintBands(f, s, seed, [[0, FURN_BRASS], [7, FURN_SHADE]]));
registerTexturePattern('lamp_pole', (f, s, tint, seed) => furnPaintBands(f, s, seed, [[0, 0x4a4c52]]));
registerTexturePattern('lamp_head', (f, s, tint, seed) => furnPaintBands(f, s, seed, [[0, 0x4a4c52], [6, FURN_SHADE]]));

registerTexturePattern('chandelier', (f, s, tint, seed) => {
    const gold = f.rgb(FURN_BRASS);
    f.each(s, (x, y, u, v) => {
        const height = (1 - v) * 16;
        // The chain runs up the middle; the candles and their flames stand at the ends of the arms.
        const middle = Math.abs(u - 0.5) < 0.07;
        let c = f.tone(s, gold, (f.hash(x, y, seed) - 0.5) * 0.1);
        if (!middle && height >= 8 && height < 10) c = f.rgb(0xffc040);
        else if (!middle && height >= 6 && height < 8) c = f.rgb(FURN_WAX);
        f.put(s, x, y, c, 0.6);
    });
});

// ---------------------------------------------------------------------------------------
// Blocks

function furnBlock(id, definition) {
    registerBlockType(id, { lightPasses: true, shareFaces: true, ...definition });
}

// Faces in planks of one wood; extra pattern names are tinted like them.
function furnWoodFaces(planks, top, side, front) {
    const face = (pattern) => ({ pattern, tintOf: planks });
    return { top: face(top), side: face(side), bottom: face('planks'), ...(front ? { front: face(front) } : {}) };
}

// What is made of nothing but planks shows the planks' own material.
function furnPlain(planks) {
    return { textureOf: planks, materialKey: planks };
}

FURNITURE_CHAIRS.forEach(([prefix, label, planks, color]) => {
    furnBlock(`${prefix}_chair`, { color, name: `${label} Chair`, shape: 'chair', breakDuration: 0.45, category: 'wood', seat: 0.5, ...furnPlain(planks) });
});
furnBlock('stool', { color: 0xC8A675, name: 'Stool', shape: 'stool', breakDuration: 0.35, category: 'wood', seat: 0.625, ...furnPlain('planks') });
furnBlock('bench', { color: 0xC8A675, name: 'Long Bench', shape: 'bench', breakDuration: 0.5, category: 'wood', seat: 0.5, ...furnPlain('planks') });
FURNITURE_COLORS.forEach(([color, label, hex]) => {
    const face = { pattern: 'upholstery', tintOf: `${color}_wool` };
    furnBlock(`${color}_sofa`, {
        color: hex, name: `${label} Sofa`, shape: 'sofa', breakDuration: 0.5, category: 'wool', seat: 0.5625,
        faces: { top: { pattern: 'wool', tintOf: `${color}_wool` }, side: face, bottom: face }
    });
});

furnBlock('table', { color: 0xC8A675, name: 'Table', shape: 'table', breakDuration: 0.55, category: 'wood', ...furnPlain('planks') });
furnBlock('bedside_table', { color: 0xC8A675, name: 'Bedside Table', shape: 'bedside_table', breakDuration: 0.5, category: 'wood', faces: furnWoodFaces('planks', 'planks', 'planks', 'bedside_front') });
furnBlock('desk', { color: 0xC8A675, name: 'Desk', shape: 'desk', breakDuration: 0.55, category: 'wood', faces: furnWoodFaces('planks', 'planks', 'planks', 'desk_front') });

furnBlock('chest', {
    color: 0x8A5A2C, name: 'Chest', shape: 'chest', breakDuration: 0.8, category: 'wood', storageSlots: 27,
    faces: { top: 'chest_top', side: 'chest_side', bottom: 'chest_side', front: 'chest_front' }
});
furnBlock('barrel', {
    color: 0x8A5A2C, name: 'Barrel', shape: 'barrel', breakDuration: 0.7, category: 'wood', storageSlots: 18,
    faces: { top: 'barrel_top', side: 'barrel_side', bottom: 'barrel_top' }
});
const FURN_WARDROBE_FACES = (front) => ({ top: { pattern: 'planks', tintOf: 'dark_oak_planks' }, side: { pattern: 'planks', tintOf: 'dark_oak_planks' }, bottom: { pattern: 'planks', tintOf: 'dark_oak_planks' }, front });
furnBlock('wardrobe', {
    color: 0x614A3A, name: 'Wardrobe', shape: 'wardrobe', breakDuration: 0.9, category: 'wood', storageSlots: 45,
    faces: FURN_WARDROBE_FACES('wardrobe_lower'),
    halves: { lower: { faces: FURN_WARDROBE_FACES('wardrobe_lower') }, upper: { faces: FURN_WARDROBE_FACES('wardrobe_upper') } }
});
registerBlockType('bookshelf', {
    color: 0xB48A56, name: 'Bookshelf', breakDuration: 0.6, category: 'wood',
    faces: { top: { pattern: 'planks', tintOf: 'planks' }, side: 'bookshelf', bottom: { pattern: 'planks', tintOf: 'planks' } }
});
furnBlock('wall_shelf', {
    color: 0xB48A56, name: 'Wall Shelf', shape: 'wall_shelf', breakDuration: 0.35, category: 'wood', solid: false,
    faces: { top: { pattern: 'planks', tintOf: 'planks' }, side: 'wall_shelf_side', bottom: { pattern: 'planks', tintOf: 'planks' } }
});

furnBlock('workbench', {
    color: 0xB48A56, name: 'Workbench', shape: 'workbench', breakDuration: 0.6, category: 'wood', workbench: true,
    faces: { top: 'workbench_top', side: { pattern: 'planks', tintOf: 'planks' }, bottom: { pattern: 'planks', tintOf: 'planks' } }
});
furnBlock('oven', {
    color: 0x3A3D42, name: 'Oven', shape: 'oven', breakDuration: 0.9, category: 'stone',
    faces: { top: 'oven_top', side: 'oven_side', bottom: 'oven_side', front: 'oven_front_off' },
    lit: { lightEmission: 11, faces: { top: 'oven_top', side: 'oven_side', bottom: 'oven_side', front: { pattern: 'oven_front_on', glow: 1 } } }
});
furnBlock('sink', {
    color: FURN_CHINA, name: 'Sink', shape: 'sink', breakDuration: 0.7, category: 'stone',
    faces: { top: 'sink_top', side: 'china', bottom: 'china', front: 'sink_front' }
});
const FURN_FRIDGE_FACES = (front) => ({ top: 'fridge_lower', side: 'fridge_lower', bottom: 'fridge_lower', front });
furnBlock('fridge', {
    color: 0xDFE3E6, name: 'Fridge', shape: 'fridge', breakDuration: 0.9, category: 'stone',
    faces: FURN_FRIDGE_FACES('fridge_lower'),
    halves: { lower: { faces: FURN_FRIDGE_FACES('fridge_lower') }, upper: { faces: FURN_FRIDGE_FACES('fridge_upper') } }
});
furnBlock('toilet', {
    color: FURN_CHINA, name: 'Toilet', shape: 'toilet', breakDuration: 0.6, category: 'stone', seat: 0.5625,
    faces: { top: 'toilet_top', side: 'china', bottom: 'china' }
});
furnBlock('bathtub', {
    color: FURN_CHINA, name: 'Bathtub', shape: 'bathtub', breakDuration: 0.8, category: 'stone',
    faces: { top: 'bathtub_top', side: 'china', bottom: 'china' }
});

furnBlock('candle', {
    color: FURN_WAX, name: 'Candle', shape: 'candle', breakDuration: 0.1, solid: false, lightEmission: 9, glow: 0.9,
    faces: { top: 'candle_top', side: 'candle' }
});
const FURN_LANTERN_FACES = (side) => ({ top: 'lantern_top', side, bottom: 'lantern_top' });
furnBlock('lantern', {
    color: 0xFFCF70, name: 'Lantern', shape: 'lantern', breakDuration: 0.25, category: 'stone', solid: false, lightEmission: 13, glow: 1,
    faces: FURN_LANTERN_FACES('lantern_floor'),
    mounts: { floor: { faces: FURN_LANTERN_FACES('lantern_floor') }, hanging: { faces: FURN_LANTERN_FACES('lantern_hanging') } }
});
furnBlock('table_lamp', {
    color: FURN_SHADE, name: 'Table Lamp', shape: 'table_lamp', breakDuration: 0.2, solid: false, lightEmission: 12, glow: 0.8,
    faces: { top: 'table_lamp', side: 'table_lamp' }
});
const FURN_LAMP_POLE = { top: 'lamp_pole', side: 'lamp_pole' };
furnBlock('floor_lamp', {
    color: FURN_SHADE, name: 'Floor Lamp', shape: 'floor_lamp', breakDuration: 0.3, category: 'stone',
    faces: FURN_LAMP_POLE,
    halves: {
        lower: { faces: FURN_LAMP_POLE },
        upper: { faces: { top: 'lamp_head', side: 'lamp_head' }, lightEmission: 14, glow: 0.8 }
    }
});
furnBlock('chandelier', {
    color: FURN_BRASS, name: 'Chandelier', shape: 'chandelier', breakDuration: 0.4, category: 'stone', solid: false, lightEmission: 14, glow: 0.7,
    faces: { top: 'chandelier', side: 'chandelier' }
});

// ---------------------------------------------------------------------------------------
// Recipes

registerGameContent(function ({ addRecipe }) {
    FURNITURE_CHAIRS.forEach(([prefix, label, planks]) => {
        addRecipe(`${prefix}_chair`, `Build ${label} Chair`, `${prefix}_chair`, 1, [{ type: planks, amount: 3 }]);
    });
    addRecipe('stool', 'Build Stool', 'stool', 2, [{ type: 'planks', amount: 2 }]);
    addRecipe('bench', 'Build Long Bench', 'bench', 2, [{ type: 'planks', amount: 3 }]);
    FURNITURE_COLORS.forEach(([color, label]) => {
        addRecipe(`${color}_sofa`, `Upholster ${label} Sofa`, `${color}_sofa`, 1, [{ type: `${color}_wool`, amount: 3 }, { type: 'planks', amount: 2 }]);
    });
    addRecipe('table', 'Build Table', 'table', 1, [{ type: 'planks', amount: 4 }]);
    addRecipe('bedside_table', 'Build Bedside Table', 'bedside_table', 1, [{ type: 'planks', amount: 3 }, { type: 'iron_ore', amount: 1 }]);
    addRecipe('desk', 'Build Desk', 'desk', 1, [{ type: 'planks', amount: 5 }, { type: 'iron_ore', amount: 1 }]);
    addRecipe('chest', 'Build Chest', 'chest', 1, [{ type: 'planks', amount: 6 }, { type: 'iron_ore', amount: 1 }]);
    addRecipe('barrel', 'Build Barrel', 'barrel', 1, [{ type: 'planks', amount: 4 }, { type: 'iron_ore', amount: 1 }]);
    addRecipe('wardrobe', 'Build Wardrobe', 'wardrobe', 1, [{ type: 'dark_oak_planks', amount: 8 }, { type: 'iron_ore', amount: 1 }]);
    addRecipe('bookshelf', 'Build Bookshelf', 'bookshelf', 1, [{ type: 'planks', amount: 4 }, { type: 'white_wool', amount: 2 }]);
    addRecipe('wall_shelf', 'Build Wall Shelf', 'wall_shelf', 2, [{ type: 'planks', amount: 2 }, { type: 'white_wool', amount: 1 }]);
    addRecipe('workbench', 'Build Workbench', 'workbench', 1, [{ type: 'planks', amount: 4 }, { type: 'wood', amount: 1 }]);
    addRecipe('oven', 'Build Oven', 'oven', 1, [{ type: 'cobblestone', amount: 6 }, { type: 'iron_ore', amount: 2 }, { type: 'coal_ore', amount: 1 }]);
    addRecipe('sink', 'Build Sink', 'sink', 1, [{ type: 'marble', amount: 2 }, { type: 'planks', amount: 2 }, { type: 'iron_ore', amount: 1 }]);
    addRecipe('fridge', 'Build Fridge', 'fridge', 1, [{ type: 'iron_ore', amount: 6 }, { type: 'marble', amount: 1 }]);
    addRecipe('toilet', 'Build Toilet', 'toilet', 1, [{ type: 'marble', amount: 3 }]);
    addRecipe('bathtub', 'Build Bathtub', 'bathtub', 1, [{ type: 'marble', amount: 5 }, { type: 'iron_ore', amount: 1 }]);
    addRecipe('candle', 'Dip Candles', 'candle', 4, [{ type: 'honeycomb', amount: 1 }, { type: 'white_wool', amount: 1 }]);
    addRecipe('lantern', 'Build Lantern', 'lantern', 1, [{ type: 'iron_ore', amount: 2 }, { type: 'glass', amount: 1 }, { type: 'torch', amount: 1 }]);
    addRecipe('table_lamp', 'Build Table Lamp', 'table_lamp', 1, [{ type: 'white_wool', amount: 1 }, { type: 'copper_block', amount: 1 }, { type: 'torch', amount: 1 }]);
    addRecipe('floor_lamp', 'Build Floor Lamp', 'floor_lamp', 1, [{ type: 'white_wool', amount: 2 }, { type: 'iron_ore', amount: 2 }, { type: 'torch', amount: 1 }]);
    addRecipe('chandelier', 'Build Chandelier', 'chandelier', 1, [{ type: 'gold_ore', amount: 2 }, { type: 'torch', amount: 4 }]);
});

// ---------------------------------------------------------------------------------------
// The workbench

// A right click on a workbench opens the crafting panel (crouch to build against it).
registerItemUseHandler(function (itemType, hit) {
    if (!hit || this.cameraController.isCrouching) return false;
    const position = this.world.getBlockPositionFromIntersection(hit);
    const type = position && this.world.getBlockTypeAt(position.x, position.y, position.z);
    const def = type && this.world.blockTypes[type];
    if (!def || !def.workbench) return false;
    this.openCraftingPanel();
    return true;
});
