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
//   (`storageSlots`). The oven, the fridge and the chest freezer are chests that also do things,
//   on the server (js/game/appliances.js); the oven's fire is set by the server alone.
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

// A bookshelf is a whole block with a hollow front, where the books are real boxes that stand out of
// a sunken back. Written facing north, in sixteenths: a frame round a cavity FURN_SHELF_DEEP deep, a
// board across it, a row of books on the board and another under it. Each row comes from a fixed list,
// flipped or not, by the cell's position alone (bookshelfArrangement): nothing is stored, every
// player and rebuild sees the same books, and neighbours in any direction never share a row. All
// the rows cut one atlas (`bookshelf_atlas`). It counts as a whole cube for light and faces
// (`wholeCube`), and a front against a cube is not built at all. In the hand and in icons it is a
// plain block with the books painted on (`bookshelf` pattern), and so while it shakes being mined.
// Bookshelves saved when it had no facing are the first state, `bookshelf`: see bookshelfFronts.
const FURN_SHELF_RAIL = 1.5;
const FURN_SHELF_DEEP = 5;
const FURN_SHELF_BOARD = [7.25, 8.75];
const FURN_SHELF_MAX_BOXES = 6;
// How many rows each height has: two numbers with no common factor, so that a long wall takes
// their product to repeat, and more with the flips.
const FURN_SHELF_UPPER_ROWS = 11;
const FURN_SHELF_LOWER_ROWS = 13;
const FURN_SHELF_VARIANTS = FURN_SHELF_UPPER_ROWS * 2 * FURN_SHELF_LOWER_ROWS * 2;
const FURN_SHELF_WIDTHS = [1.25, 1.5, 1.5, 1.75, 1.75, 2, 2, 2.5, 3];
// The atlas: a cell for each colour of book (columns) and spine (rows), then a plain row for the
// covers, a column of pages and one of the dark back of the shelf.
const FURN_ATLAS_COLOURS = 12;
const FURN_ATLAS_PAGES = 12;
const FURN_ATLAS_BACK = 13;
const FURN_ATLAS_COLUMNS = 14;
const FURN_ATLAS_SPINES = 5;
const FURN_ATLAS_ROWS = FURN_ATLAS_SPINES + 1;

function furnShelfRandom(a, b) {
    let h = Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    return (((h ^ (h >>> 15)) >>> 0) % 10007) / 10007;
}

// The books of row `index` of the list, left to right: { x0, x1, y0, y1, front, color, spine, flat },
// in sixteenths, y from the board, `front` how far behind the face of the frame its spine is. Some
// rows are tight, some have gaps, some have books lying flat. Never more than FURN_SHELF_MAX_BOXES.
function furnShelfRowBooks(index) {
    const room = FURN_SHELF_BOARD[0] - FURN_SHELF_RAIL;
    const end = 16 - FURN_SHELF_RAIL;
    const gapChance = [0, 0.14, 0.3][index % 3];
    const books = [];
    let x = FURN_SHELF_RAIL + furnShelfRandom(index, 900) * 0.8;
    for (let i = 0; books.length < FURN_SHELF_MAX_BOXES && x < end - 1; i++) {
        const pick = (salt) => furnShelfRandom(index, i * 16 + salt);
        const book = () => ({
            color: Math.floor(pick(1) * FURN_ATLAS_COLOURS),
            spine: Math.floor(pick(2) * FURN_ATLAS_SPINES),
            front: 0.75 + pick(3) * 1.75
        });
        if (i > 0 && pick(4) < gapChance) {
            x += 1 + pick(5) * 2.5;
            continue;
        }
        const width = 3.5 + pick(6) * 1.5;
        if (books.length > 0 && books.length <= FURN_SHELF_MAX_BOXES - 2 && pick(7) < 0.1 && x + width <= end) {
            const shared = book();
            books.push({ ...shared, x0: x, x1: x + width, y0: 0, y1: 1, flat: true });
            books.push({ ...shared, color: Math.floor(pick(8) * FURN_ATLAS_COLOURS), x0: x, x1: x + width, y0: 1, y1: 2, flat: true });
            x += width + 0.25;
            continue;
        }
        const wide = Math.min(FURN_SHELF_WIDTHS[Math.floor(pick(9) * FURN_SHELF_WIDTHS.length)], end - x);
        if (wide < 1) break;
        books.push({ ...book(), x0: x, x1: x + wide, y0: 0, y1: room * (0.62 + pick(10) * 0.34) });
        x += wide;
    }
    return books;
}

const FURN_SHELF_ROW_LIST = [];
function furnShelfRow(index) {
    if (!FURN_SHELF_ROW_LIST[index]) FURN_SHELF_ROW_LIST[index] = furnShelfRowBooks(index);
    return FURN_SHELF_ROW_LIST[index];
}

// Which look the shelf at a cell has: a number under FURN_SHELF_VARIANTS. A step of one cell in x,
// y or z never lands on the same row of either height.
function bookshelfArrangement(x, y, z) {
    const wrap = (value, size) => ((value % size) + size) % size;
    const flips = Math.floor(furnShelfRandom(x * 7 + z * 13, y * 3 + 5) * 4);
    const upper = wrap(x + 4 * y + 3 * z, FURN_SHELF_UPPER_ROWS) * 2 + (flips & 1);
    const lower = wrap(5 * x + 3 * y + 2 * z, FURN_SHELF_LOWER_ROWS) * 2 + (flips >> 1);
    return upper * FURN_SHELF_LOWER_ROWS * 2 + lower;
}

// A look as its two rows, each a row of the list and whether it is flipped.
function furnShelfLookRows(variant) {
    const lower = variant % (FURN_SHELF_LOWER_ROWS * 2);
    const upper = Math.floor(variant / (FURN_SHELF_LOWER_ROWS * 2));
    return {
        upper: Math.floor(upper / 2), upperFlip: upper % 2 === 1,
        // The two lists do not overlap: a row of the upper shelf is never one of the lower.
        lower: FURN_SHELF_UPPER_ROWS + Math.floor(lower / 2), lowerFlip: lower % 2 === 1
    };
}

// A rectangle of the atlas, [u0, v0, u1, v1], a hair inside its cell so that no filter reads the next.
function furnAtlasCell(column, row) {
    const margin = 1 / 512;
    return [column / FURN_ATLAS_COLUMNS + margin, 1 - (row + 1) / FURN_ATLAS_ROWS + margin, (column + 1) / FURN_ATLAS_COLUMNS - margin, 1 - row / FURN_ATLAS_ROWS - margin];
}

const FURN_FACE_BIT = { px: 1, nx: 2, py: 4, ny: 8, pz: 16, nz: 32 };

// A row's boxes, facing north, on a board at `floor`, each with what the mesher needs (`relief`).
// A book's underside and back are never seen; nor is its side against a neighbour that hides it.
function furnShelfRowBoxes(index, flip, floor) {
    const books = furnShelfRow(index)
        .map((book) => (flip ? { ...book, x0: 16 - book.x1, x1: 16 - book.x0 } : book))
        .sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0);
    const pages = furnAtlasCell(FURN_ATLAS_PAGES, 0);
    return books.map((book) => {
        const hides = (other) => other !== book && other.y0 <= book.y0 && other.y1 >= book.y1 && other.front <= book.front;
        let skip = FURN_FACE_BIT.ny | FURN_FACE_BIT.pz;
        if (books.some((other) => Math.abs(other.x1 - book.x0) < 1e-6 && hides(other))) skip |= FURN_FACE_BIT.nx;
        if (books.some((other) => Math.abs(other.x0 - book.x1) < 1e-6 && hides(other))) skip |= FURN_FACE_BIT.px;
        const cover = furnAtlasCell(book.color, FURN_ATLAS_SPINES);
        const box = furnBox(book.x0, floor + book.y0, book.front, book.x1, floor + book.y1, FURN_SHELF_DEEP);
        box.relief = {
            from: 'n', skip,
            // +x, -x, +y, -y, +z, -z: a book standing shows its pages above, one lying flat at its ends.
            uv: [book.flat ? pages : cover, book.flat ? pages : cover, book.flat ? cover : pages, null, null, furnAtlasCell(book.color, book.spine)]
        };
        return box;
    });
}

// A front facing north with these rows: the frame, the board, the books.
function furnShelfFrontBoxes(rows) {
    const rail = FURN_SHELF_RAIL;
    const deep = FURN_SHELF_DEEP;
    const frame = [
        [0, 16 - rail, 0, 16, 16, deep], [0, 0, 0, 16, rail, deep],
        [0, rail, 0, rail, 16 - rail, deep], [16 - rail, rail, 0, 16, 16 - rail, deep],
        [rail, FURN_SHELF_BOARD[0], 0.5, 16 - rail, FURN_SHELF_BOARD[1], deep]
    ].map((list) => {
        const box = furnBox(...list);
        box.relief = { from: 'n', skip: 0, planks: true };
        return box;
    });
    return [
        ...frame,
        ...furnShelfRowBoxes(rows.upper, rows.upperFlip, FURN_SHELF_BOARD[1]),
        ...furnShelfRowBoxes(rows.lower, rows.lowerFlip, rail)
    ];
}

// A box turned to `facing`, its faces and what is painted on them with it (rotateShapeBox).
const FURN_FACE_TURN = { n: [0, 1, 2, 3, 4, 5], e: [4, 5, 2, 3, 1, 0], s: [1, 0, 2, 3, 5, 4], w: [5, 4, 2, 3, 0, 1] };
function furnTurnRelief(box, facing) {
    const turned = rotateShapeBox(box, facing);
    const { relief } = box;
    const uv = relief.uv ? [] : null;
    let skip = 0;
    FURN_FACE_TURN[facing].forEach((to, from) => {
        if (uv) uv[to] = relief.uv[from];
        if (relief.skip & (1 << from)) skip |= 1 << to;
    });
    turned.relief = { ...relief, from: facing, skip, uv };
    return turned;
}

// The fronts of a shelf saved with no facing, from the sides that are not against a cube (mask): it
// has no way to know its front. A wall gets books on the sides it shows along its length, one side
// of a corner, a block alone two opposite sides: two sides that meet have no room for two cavities.
function bookshelfFronts(mask) {
    const open = (dir) => !(mask & SHAPE_MASK[dir]);
    const northSouth = ['n', 's'].filter(open);
    const eastWest = ['e', 'w'].filter(open);
    return eastWest.length > northSouth.length ? eastWest : northSouth;
}

// The back of the cavities and the wood behind them, for a front facing `facing`, and its opposite too.
function furnShelfBack(facing, double) {
    const back = furnAtlasCell(FURN_ATLAS_BACK, 0);
    const box = furnBox(0, 0, FURN_SHELF_DEEP, 16, 16, double ? 16 - FURN_SHELF_DEEP : 16);
    box.relief = { from: 'n', skip: 0, planks: true, uv: [null, null, null, null, double ? back : null, back] };
    return furnTurnRelief(box, facing);
}

registerBlockShape('bookshelf', {
    states: [['facing', ['all', ...SHAPE_FACINGS]]],
    boxes(state, mask, def, variant) {
        if (variant === null || variant === undefined) return [[0, 0, 0, 1, 1, 1]];
        const fronts = state.facing === 'all' ? bookshelfFronts(mask) : mask & SHAPE_MASK[state.facing] ? [] : [state.facing];
        if (fronts.length === 0) {
            const plain = [0, 0, 0, 1, 1, 1];
            plain.relief = { from: 'n', skip: 0, planks: true };
            return [plain];
        }
        const boxes = [furnShelfBack(fronts[0], fronts.length > 1)];
        const rows = furnShelfLookRows(variant);
        fronts.forEach((facing, i) => {
            // The far side of a shelf with two fronts shows the same rows, the other way round.
            const look = i === 0 ? rows : { ...rows, upperFlip: !rows.upperFlip, lowerFlip: !rows.lowerFlip };
            boxes.push(...furnShelfFrontBoxes(look).map((box) => furnTurnRelief(box, facing)));
        });
        return boxes;
    },
    collision: () => [[0, 0, 0, 1, 1, 1]],
    // Against a cube there is no front to see, as with any other face.
    connects: (def, other) => Boolean(other.cube),
    variantAt: bookshelfArrangement,
    variant: (state, def) => (state.facing === 'all' ? def.allSides : {}),
    materialKey: (state) => state.facing,
    place: (ctx) => [{ dx: 0, dy: 0, dz: 0, state: { facing: furnFacePlayer(ctx) } }],
    // A click on a book counts as a click on the front it is in.
    clickFace(state, local, normal) {
        const axis = normal.x !== 0 ? 'x' : normal.y !== 0 ? 'y' : 'z';
        if (Math.abs(local[axis] - (normal[axis] > 0 ? 1 : 0)) < 1e-3) return normal;
        const nearest = [['n', local.z], ['s', 1 - local.z], ['e', 1 - local.x], ['w', local.x]].sort((a, b) => a[1] - b[1])[0][0];
        const [dx, dz] = SHAPE_DIRECTIONS[state.facing === 'all' ? nearest : state.facing];
        return { x: dx, y: 0, z: dz };
    }
});

furnShape('workbench', {
    facing: false,
    boxes: [[0, 13, 0, 16, 16, 16], [1, 0, 1, 3, 13, 3], [13, 0, 1, 15, 13, 3], [1, 0, 13, 3, 13, 15], [13, 0, 13, 15, 13, 15], [3, 4, 3, 13, 5, 13]],
    collision: [[0, 0, 0, 16, 16, 16]]
});

// An oven: a right click opens it, like a chest. It lights by itself when it has food and fuel,
// and gives light while it burns (pkg/network/appliances.go sets `fire` through the block name).
registerBlockShape('oven', {
    states: [['facing', SHAPE_FACINGS], ['fire', ['off', 'on']]],
    boxes: () => [[0, 0, 0, 1, 1, 1]],
    variant: (state, def) => (state.fire === 'on' ? def.lit : {}),
    materialKey: (state) => `${state.facing}:${state.fire}`,
    place: (ctx) => [{ dx: 0, dy: 0, dz: 0, state: { facing: furnFacePlayer(ctx), fire: 'off' } }],
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

// A long low box with a lid, wider than a chest: it fills the cell, the seal shows as a groove.
furnShape('chest_freezer', {
    boxes: [[0, 0, 0, 16, 12, 16], [0, 13, 0, 16, 16, 16], [1, 12, 1, 15, 13, 15], [6, 10, 0, 10, 12, 1]],
    collision: [[0, 0, 0, 16, 16, 16]]
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

// The front of a bookshelf in the hand, in an icon or on the ground, on a grid of 32 cells by 32
// whatever the resolution: a frame, two shelves in shadow, books of many sizes with detail on their
// spines, gaps, and a book leaning across each gap. In the world the books are boxes (see the shape).
const FURN_BOOKS = [0xa8342c, 0x2f5fa8, 0x3a8a4c, 0xd8b84a, 0x7e4cc2, 0xc97a2c, 0x30343c, 0xd8d0c0, 0x7a2a3a, 0x1f6a70, 0x8a5a34, 0x4a5a2c];
const FURN_SHELF_GRID = 32;
const FURN_SHELF_FRAME = 2;
// A row's top and bottom in the grid (the shelf board fills the 2 cells between them).
const FURN_SHELF_ROWS = [[2, 15], [17, 30]];

// The books of a row: { x, width, height, color, spine, lean }, left to right. x and width are in
// grid cells at the shelf; a leaning book's top is `lean` cells to the side of its foot.
function furnShelfBooks(f, seed, row) {
    const books = [];
    const end = FURN_SHELF_GRID - FURN_SHELF_FRAME;
    const room = FURN_SHELF_ROWS[row][1] - FURN_SHELF_ROWS[row][0];
    let x = FURN_SHELF_FRAME + Math.floor(f.hash(row, 91, seed) * 2);
    let lean = 0;
    for (let i = 0; x < end - 1; i++) {
        const pick = (salt) => f.hash(i, row * 7 + salt, seed);
        if (i > 0 && !lean && pick(1) < 0.17) {
            // A gap, and the next book falls back across it.
            const gap = 2 + Math.floor(pick(2) * 4);
            x += gap;
            lean = -Math.min(gap - 1, 2 + Math.floor(pick(3) * 2));
            continue;
        }
        const width = Math.min(end - x, pick(4) < 0.12 ? 4 : 2 + Math.floor(pick(5) * 2));
        const book = {
            x, width, lean,
            height: Math.round(room * (0.62 + pick(6) * 0.34)),
            color: FURN_BOOKS[Math.floor(pick(7) * FURN_BOOKS.length)],
            spine: Math.floor(pick(8) * 5)
        };
        books.push(book);
        x += width;
        lean = 0;
    }
    return books;
}

// A shade and a height for a spine at tx across it (0 to 1) and ty up it (0 at its foot).
function furnShelfSpine(book, tx, ty, grid) {
    let k = (0.5 - tx) * 0.34;
    let detail = 0;
    if (tx * book.width > book.width - 0.7) k -= 0.3;
    if (book.spine === 1 && (Math.abs(ty - 0.16) < 0.05 || Math.abs(ty - 0.84) < 0.05)) detail = 1;
    if (book.spine === 2 && ty > 0.56 && ty < 0.8 && tx > 0.1 && tx < 0.9) detail = 2;
    if (book.spine === 3 && Math.abs(ty - 0.7) < 0.04) detail = 1;
    if (book.spine === 3 && Math.abs(tx - 0.5) < 0.2 && ty > 0.2 && ty < 0.5 && Math.floor(ty * grid) % 2 === 0) detail = 1;
    if (book.spine === 4 && ty > 0.28 && ty < 0.42) k -= 0.28;
    return { k, detail };
}

registerTexturePattern('bookshelf', (f, s, tint, seed) => {
    const wood = f.rgb(tint ?? 0x9a7148);
    const gold = f.rgb(0xdcc068);
    const label = f.rgb(0xe8dfc8);
    const rows = FURN_SHELF_ROWS.map((_, row) => furnShelfBooks(f, seed, row));
    f.each(s, (x, y, u, v) => {
        const gx = u * FURN_SHELF_GRID;
        const gy = v * FURN_SHELF_GRID;
        const row = FURN_SHELF_ROWS.findIndex(([top, bottom]) => gy >= top && gy < bottom);
        const stile = gx < FURN_SHELF_FRAME || gx >= FURN_SHELF_GRID - FURN_SHELF_FRAME;
        if (stile || row < 0) {
            // The frame and the shelf boards: lit along their top edge, dark along the bottom.
            const inBoard = (gy % (FURN_SHELF_ROWS[1][0] - 2)) / 2;
            const k = stile ? (gx < FURN_SHELF_FRAME ? 0.05 : -0.08) : inBoard < 0.3 ? 0.16 : inBoard > 0.7 ? -0.2 : 0;
            f.put(s, x, y, f.tone(s, f.mix(furnWood(f, s, wood, u, v, seed, stile, 2), wood, 0.3), k), stile ? 1 : 0.9);
            return;
        }
        const [top, bottom] = FURN_SHELF_ROWS[row];
        const up = bottom - gy;
        // The shelf above shades the top of the row, the frame its sides.
        const shadow = Math.max(0, 0.34 - (gy - top) * 0.09) + Math.max(0, 0.12 - Math.min(gx - FURN_SHELF_FRAME, FURN_SHELF_GRID - FURN_SHELF_FRAME - gx) * 0.06);
        for (const book of rows[row]) {
            if (up >= book.height) continue;
            const ty = up / book.height;
            const tx = (gx - book.x - book.lean * ty) / book.width;
            if (tx < 0 || tx >= 1) continue;
            const { k, detail } = furnShelfSpine(book, tx, ty, FURN_SHELF_GRID);
            const color = detail === 1 ? gold : detail === 2 ? label : f.rgb(book.color);
            const grain = (f.hash(x, y, seed) - 0.5) * 0.06;
            // The rounded spine stands out of the shelf in the height map.
            const round = 0.62 + Math.sin(Math.min(1, tx) * Math.PI) * 0.26 + (detail ? 0.08 : 0);
            f.put(s, x, y, f.tone(s, color, k + grain - shadow), round);
            return;
        }
        // The back of the shelf, deep in shadow.
        f.put(s, x, y, f.tone(s, wood, -0.7 - shadow * 0.15 + (f.hash(x, y, seed) - 0.5) * 0.04), 0.04);
    });
}, { rtx: { roughness: 0.68, metalness: 0, normalScale: 1.3 } });

// What the books of a bookshelf cut, one texture for them all: see FURN_ATLAS_COLUMNS. A spine is
// rounded, in colour and in the height map, which RTX and Ultra turn into normals.
registerTexturePattern('bookshelf_atlas', (f, s, tint, seed) => {
    const wood = f.rgb(0x9a7148);
    const gold = f.rgb(0xdcc068);
    const label = f.rgb(0xe8dfc8);
    const paper = f.rgb(0xe9e0c6);
    f.each(s, (x, y, u, v) => {
        const column = Math.min(FURN_ATLAS_COLUMNS - 1, Math.floor(u * FURN_ATLAS_COLUMNS));
        const row = Math.min(FURN_ATLAS_ROWS - 1, Math.floor(v * FURN_ATLAS_ROWS));
        const tx = u * FURN_ATLAS_COLUMNS - column;
        const ty = 1 - (v * FURN_ATLAS_ROWS - row);
        const grain = (f.hash(x, y, seed) - 0.5) * 0.06;
        if (column === FURN_ATLAS_BACK) {
            f.put(s, x, y, f.tone(s, wood, -0.55 + grain), 0.1);
        } else if (column === FURN_ATLAS_PAGES) {
            f.put(s, x, y, f.tone(s, paper, Math.floor(tx * 8) % 2 ? -0.05 : 0.04), 0.5);
        } else if (row === FURN_ATLAS_SPINES) {
            f.put(s, x, y, f.tone(s, f.rgb(FURN_BOOKS[column]), -0.12 + grain), 0.5);
        } else {
            const { k, detail } = furnShelfSpine({ width: 2, spine: row }, tx, ty, 16);
            const color = detail === 1 ? gold : detail === 2 ? label : f.rgb(FURN_BOOKS[column]);
            f.put(s, x, y, f.tone(s, color, k + grain), 0.35 + Math.sin(tx * Math.PI) * 0.55 + (detail ? 0.08 : 0));
        }
    });
}, { atlas: true, rtx: { roughness: 0.68, metalness: 0, normalScale: 1.3 } });

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

// A chest freezer: white enamel with a blue band under the lid, frost on the lid's window.
function furnPaintChestFreezer(f, s, tint, seed, front) {
    const base = f.rgb(0xe6edf2);
    const band = f.rgb(0x4d88b8);
    f.each(s, (x, y, u, v) => {
        let c = furnEnamel(f, s, base, u, v, seed);
        let h = 0.6;
        if (v > 0.2 && v < 0.27) { c = f.tone(s, band, 0); h = 0.3; }
        if (v > 0.88) c = f.tone(s, base, -0.3);
        if (front && v > 0.4 && v < 0.62 && Math.abs(u - 0.5) < 0.2) { c = f.tone(s, f.rgb(0xb8d8ec), (f.hash(x, y, seed) - 0.5) * 0.12); h = 0.9; }
        f.put(s, x, y, c, h);
    });
}
registerTexturePattern('chest_freezer_front', (f, s, tint, seed) => furnPaintChestFreezer(f, s, tint, seed, true), FURN_GLOSSY);
registerTexturePattern('chest_freezer_side', (f, s, tint, seed) => furnPaintChestFreezer(f, s, tint, seed, false), FURN_GLOSSY);
registerTexturePattern('chest_freezer_top', (f, s, tint, seed) => {
    const base = f.rgb(0xe6edf2);
    const frost = f.rgb(0xc8e4f4);
    f.each(s, (x, y, u, v) => {
        const glass = Math.abs(u - 0.5) < 0.34 && Math.abs(v - 0.5) < 0.3;
        f.put(s, x, y, glass ? f.tone(s, frost, (f.hash(x, y, seed) - 0.5) * 0.14) : furnEnamel(f, s, base, u, v, seed), glass ? 0.9 : 0.6);
    });
}, FURN_GLOSSY);

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
const FURN_BOOKSHELF_FRONT = { pattern: 'bookshelf', minSize: FURN_SHELF_GRID };
const FURN_BOOKSHELF_ATLAS = { pattern: 'bookshelf_atlas', minSize: 256 };
const FURN_PLAIN_PLANKS = { pattern: 'planks', tintOf: 'planks' };
furnBlock('bookshelf', {
    color: 0xB48A56, name: 'Bookshelf', shape: 'bookshelf', breakDuration: 0.6, category: 'wood',
    lightPasses: false, wholeCube: true, atlasFace: FURN_BOOKSHELF_ATLAS,
    faces: { top: FURN_PLAIN_PLANKS, side: FURN_PLAIN_PLANKS, bottom: FURN_PLAIN_PLANKS, front: FURN_BOOKSHELF_FRONT },
    allSides: { faces: { top: FURN_PLAIN_PLANKS, side: FURN_BOOKSHELF_FRONT, bottom: FURN_PLAIN_PLANKS } }
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
    color: 0x3A3D42, name: 'Oven', shape: 'oven', breakDuration: 0.9, category: 'stone', storageSlots: 3,
    faces: { top: 'oven_top', side: 'oven_side', bottom: 'oven_side', front: 'oven_front_off' },
    lit: { lightEmission: 11, faces: { top: 'oven_top', side: 'oven_side', bottom: 'oven_side', front: { pattern: 'oven_front_on', glow: 1 } } }
});
furnBlock('sink', {
    color: FURN_CHINA, name: 'Sink', shape: 'sink', breakDuration: 0.7, category: 'stone',
    faces: { top: 'sink_top', side: 'china', bottom: 'china', front: 'sink_front' }
});
const FURN_FRIDGE_FACES = (front) => ({ top: 'fridge_lower', side: 'fridge_lower', bottom: 'fridge_lower', front });
furnBlock('fridge', {
    color: 0xDFE3E6, name: 'Fridge', shape: 'fridge', breakDuration: 0.9, category: 'stone', storageSlots: 18, electric: true,
    faces: FURN_FRIDGE_FACES('fridge_lower'),
    halves: { lower: { faces: FURN_FRIDGE_FACES('fridge_lower') }, upper: { faces: FURN_FRIDGE_FACES('fridge_upper') } }
});
furnBlock('chest_freezer', {
    color: 0xE6EDF2, name: 'Chest Freezer', shape: 'chest_freezer', breakDuration: 0.9, category: 'stone', storageSlots: 36, electric: true,
    faces: { top: 'chest_freezer_top', side: 'chest_freezer_side', bottom: 'chest_freezer_side', front: 'chest_freezer_front' }
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
    addRecipe('chest_freezer', 'Build Chest Freezer', 'chest_freezer', 1, [{ type: 'iron_ore', amount: 8 }, { type: 'marble', amount: 2 }, { type: 'copper_wire', amount: 2 }]);
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
