// Tabletop objects: small things that stand on a table, a desk, a bedside table or a shelf and tell that
// somebody lives in a room: an open book, a pile of books, a letter half written, a scroll, a plate with a
// meal half eaten, a bowl of fruit, a tea set, a jug and its cup, a game of chess left mid-way and a
// sewing basket. The palaces (construction_palace_*.js) put them on their furniture; anybody may craft them.
// Loaded after furniture.js, whose helpers it uses (furnShape, furnBlock).
// - Each is a shaped block in the cell above the table (a table fills its cell, so the object stands on
//   the floor of the cell above). Its boxes are written facing north in sixteenths, as in furniture.js,
//   and none rises above half a block, so the table still reads as a table.
// - A box shows the part of the texture it would cut from a whole block, so the textures here are worked
//   out from the boxes themselves: the top of a point is painted as the highest part over it, and a side
//   at a height as the part that stands there. The top turns with the piece: each facing gets its own top
//   (`materialKey` and `variant` below). A side cannot know which box it belongs to, only its height and
//   one coordinate along the face, which a quarter turn swaps or mirrors; so where two parts of different
//   colours stand at one height (the white and the black pieces of chess) they are put at coordinates that
//   stay apart under every turn, and the side picks the smallest part whose span holds that coordinate.
// - Placing one in a design (js/game/construction*.js): `b.shaped(x, y, z, id, id, { facing: b.facing('s') })`
//   for those with a facing, `b.set(x, y, z, id)` for the plate, the fruit bowl and the jug.
// - The guide tells them in topic 231, next to the vase and the flower pot.
// Mixed into Game.prototype; hooked through js/extensions.js.

const TABLETOP_PAPER = 0xf2ecd8;
const TABLETOP_INK = 0x5a5a6a;
const TABLETOP_RED = 0xa02c28;
const TABLETOP_BLUE = 0x2c4c9c;
const TABLETOP_GREEN = 0x2e7a44;
const TABLETOP_OCHRE = 0xb07a2c;
const TABLETOP_GOLD = 0xe2b844;
const TABLETOP_BRASS = 0xc9a23a;
const TABLETOP_BLACK = 0x1c1c22;
const TABLETOP_CHINA = 0xf2f2ee;
const TABLETOP_CHINA_BLUE = 0x2f5fb0;
const TABLETOP_TERRACOTTA = 0xb8603a;
const TABLETOP_WOOD = 0x8a5a34;
const TABLETOP_DARK_WOOD = 0x3a2414;
const TABLETOP_WICKER = 0xc8a060;
const TABLETOP_PARCHMENT = 0xe8d8a8;
const TABLETOP_GLOSSY = { rtx: { roughness: 0.22, metalness: 0, normalScale: 0.2 } };

// How far a point is from the edge of a box, in sixteenths (negative outside it).
function tabletopInset(part, x, z) {
    return Math.min(x - part.box[0], part.box[3] - x, z - part.box[2], part.box[5] - z);
}

// Lines of writing across a page: rows a sixteenth apart from `z0` to `z1`, from `x0` to `x1`; the last
// row may stop at `lastX` (a letter half written).
function tabletopWriting(x, z, x0, x1, z0, z1, lastX = x1) {
    if (x < x0 || x > x1 || z < z0 || z > z1) return false;
    const row = z - z0;
    if (row % 1 > 0.4) return false;
    const last = Math.floor((z1 - z0) / 1) === Math.floor(row);
    return !(last && x > lastX);
}

// The parts of a china cup seen from above: a white rim round the tea.
function tabletopCupTop(part, x, z) {
    return tabletopInset(part, x, z) > 0.5 ? 0x8a4a1c : TABLETOP_CHINA;
}

// A band of blue round a piece of china between two heights.
function tabletopChinaBand(from, to) {
    return (u, h) => (h >= from && h < to ? TABLETOP_CHINA_BLUE : TABLETOP_CHINA);
}

// A book's side: its cover, and the paler edge of its pages in the middle.
function tabletopBookSide(color) {
    return (u, h, part) => (h > part.box[1] + 0.5 && h < part.box[4] - 0.5 ? TABLETOP_PAPER : color);
}

// A chess piece: [x, z, height], one sixteenth wide, standing on the board (which is 1.5 high). White
// pieces stand only on columns 3, 5, 10 and 12 and black ones on 4, 6, 9 and 11: a quarter turn maps a
// column c to c or 15 - c, so the sides of the two colours never share a coordinate (see the header).
const TABLETOP_CHESS_WHITE = [[3, 3, 1.5], [12, 3, 1.5], [5, 5, 1.5], [10, 3, 4], [10, 10, 3.5], [12, 5, 2]];
const TABLETOP_CHESS_BLACK = [[4, 11, 1.5], [11, 11, 1.5], [6, 9, 1.5], [9, 11, 4], [11, 6, 2.5], [4, 6, 2.5]];

// The objects: id -> { name, color, facing, parts }. A part is { box: [x0, y0, z0, x1, y1, z1] in
// sixteenths, color, top(x, z) and side(u, h) optional painters giving a colour }, with x, z and u in
// sixteenths of the piece facing north and h its height in sixteenths.
const TABLETOP_OBJECTS = {
    open_book: {
        name: 'Open Book', color: TABLETOP_RED, facing: true,
        parts: [
            { box: [2, 0, 4, 14, 1, 12], color: TABLETOP_RED },
            { box: [3, 1, 5, 7.5, 2, 11], color: TABLETOP_PAPER, top: (x, z) => (tabletopWriting(x, z, 3.75, 7, 6, 10.5) ? TABLETOP_INK : TABLETOP_PAPER) },
            { box: [8.5, 1, 5, 13, 2, 11], color: TABLETOP_PAPER, top: (x, z) => (tabletopWriting(x, z, 9, 12.25, 6, 10.5, 10.5) ? TABLETOP_INK : TABLETOP_PAPER) },
            { box: [7.5, 1, 5, 8.5, 1.5, 11], color: 0xd8ccb0 },
            { box: [10, 0, 12, 11, 1, 14], color: TABLETOP_GOLD }
        ]
    },
    book_stack: {
        name: 'Pile of Books', color: TABLETOP_BLUE, facing: true,
        parts: [
            { box: [2.5, 0, 4, 13.5, 2.5, 12], color: TABLETOP_BLUE, side: tabletopBookSide(TABLETOP_BLUE) },
            { box: [3.5, 2.5, 3, 12, 5, 11.5], color: TABLETOP_RED, side: tabletopBookSide(TABLETOP_RED) },
            { box: [3, 5, 4.5, 12.5, 7, 12.5], color: TABLETOP_GREEN, side: tabletopBookSide(TABLETOP_GREEN) },
            {
                box: [4.5, 7, 5, 11, 8, 11], color: TABLETOP_OCHRE,
                // The book on top shows its title in gold.
                top(x, z) {
                    const inset = tabletopInset(this, x, z);
                    return (inset > 0.75 && inset < 1.25) || (Math.abs(z - 8) < 0.4 && x > 6 && x < 9.5) ? TABLETOP_GOLD : TABLETOP_OCHRE;
                }
            }
        ]
    },
    inkwell: {
        name: 'Letter and Inkwell', color: TABLETOP_PAPER, facing: true,
        parts: [
            // The sheet: written from its far edge, the last line stopping half way.
            { box: [2, 0, 3, 10, 0.5, 13], color: TABLETOP_PAPER, top: (x, z) => (tabletopWriting(x, z, 3, 9, 7.5, 12, 6) ? TABLETOP_INK : TABLETOP_PAPER) },
            { box: [11, 0, 8, 14, 2, 11], color: TABLETOP_BRASS },
            { box: [11.75, 2, 8.75, 13.25, 3, 10.25], color: TABLETOP_BLACK },
            { box: [12, 3, 9, 13, 4, 10], color: 0xe8e0c8 },
            { box: [11.75, 4, 9, 13.25, 8, 10], color: TABLETOP_BLACK }
        ]
    },
    scroll: {
        name: 'Scroll', color: TABLETOP_PARCHMENT, facing: true,
        parts: [
            { box: [2, 0, 9, 14, 2.5, 11.5], color: TABLETOP_PARCHMENT, side: (u, h) => (Math.abs(h - 1.25) < 0.3 ? 0xc8b080 : TABLETOP_PARCHMENT) },
            {
                box: [4, 0, 2.5, 12, 0.5, 9], color: TABLETOP_PARCHMENT,
                // A map: a coast, the sea beyond it and a dotted route in red.
                top(x, z) {
                    if (tabletopInset(this, x, z) < 0.5) return 0xc8b080;
                    const coast = 6 + Math.sin(x * 0.9) * 1.2;
                    const route = Math.abs(z - (4 + (x - 4) * 0.45)) < 0.35 && Math.floor(x * 2) % 2 === 0;
                    if (route) return TABLETOP_RED;
                    return z > coast ? 0x4f86b8 : 0x8aa85a;
                }
            },
            { box: [4, 0, 1.5, 12, 1, 2.5], color: TABLETOP_PARCHMENT },
            { box: [1, 0.5, 9.5, 2, 2, 11], color: TABLETOP_DARK_WOOD },
            { box: [14, 0.5, 9.5, 15, 2, 11], color: TABLETOP_DARK_WOOD }
        ]
    },
    meal_plate: {
        name: 'Plate of Bread and Cheese', color: TABLETOP_CHINA, facing: false,
        parts: [
            { box: [3, 0, 3, 13, 0.5, 13], color: TABLETOP_CHINA, top(x, z) { const inset = tabletopInset(this, x, z); return inset > 0.5 && inset < 1 ? TABLETOP_CHINA_BLUE : TABLETOP_CHINA; } },
            // The bread, with a bite out of its corner.
            { box: [4, 0.5, 4, 9, 3, 8], color: 0xb07a3a, top: (x, z) => (Math.abs((x + z) % 2.5 - 1.25) < 0.3 ? 0xd8a860 : 0xb07a3a) },
            { box: [4, 0.5, 8, 7.5, 3, 9], color: 0xb07a3a },
            // The cheese, a wedge with holes and a bite of its own.
            { box: [9.5, 0.5, 6, 12, 2.5, 9], color: 0xf0c840, top: (x, z) => (Math.hypot(x - 10.5, z - 7.5) < 0.5 || Math.hypot(x - 11.3, z - 8.3) < 0.35 ? 0xc89a28 : 0xf0c840) },
            { box: [9.5, 0.5, 9, 11, 2, 10], color: 0xf0c840 },
            { box: [7, 0.5, 10.75, 11.5, 1, 11.5], color: 0xb8bcc4 },
            { box: [4, 0.5, 10.75, 7, 1, 11.5], color: TABLETOP_WOOD }
        ]
    },
    fruit_bowl: {
        name: 'Bowl of Fruit', color: TABLETOP_WOOD, facing: false,
        parts: [
            { box: [5, 0, 5, 11, 1, 11], color: TABLETOP_DARK_WOOD },
            { box: [3, 1, 3, 13, 4, 13], color: TABLETOP_WOOD, side: (u, h) => (Math.abs(h - 3.5) < 0.3 ? 0xa87448 : TABLETOP_WOOD) },
            { box: [4, 4, 4, 8, 7, 8], color: 0xc0302a, top: (x, z) => (Math.hypot(x - 6, z - 6) < 0.4 ? 0x4a3018 : 0xc0302a) },
            { box: [8, 4, 4.5, 12, 6.5, 8.5], color: 0x8cb83a },
            { box: [4.5, 4, 8, 8.5, 6, 12], color: 0xe88a20 },
            { box: [8.5, 4, 8.5, 12, 6, 11.5], color: 0x6a2a6a },
            { box: [6.5, 6, 6, 9.5, 8, 9], color: 0xd8c040, top: (x, z) => (Math.hypot(x - 8, z - 7.5) < 0.4 ? 0x4a3018 : 0xd8c040) }
        ]
    },
    tea_set: {
        name: 'Tea Set', color: TABLETOP_CHINA, facing: true, glossy: true,
        parts: [
            { box: [3, 0, 5, 8, 4, 10], color: TABLETOP_CHINA, side: tabletopChinaBand(2, 2.75) },
            { box: [4, 4, 6, 7, 5, 9], color: TABLETOP_CHINA, top(x, z) { return tabletopInset(this, x, z) < 0.5 ? TABLETOP_CHINA_BLUE : TABLETOP_CHINA; } },
            { box: [5, 5, 7, 6, 6, 8], color: TABLETOP_CHINA_BLUE },
            { box: [8, 1.5, 7, 10, 3, 8], color: TABLETOP_CHINA },
            { box: [1.5, 1, 7, 3, 3.5, 8], color: TABLETOP_CHINA },
            { box: [10.5, 0.5, 3, 13, 2.5, 5.5], color: TABLETOP_CHINA, top(x, z) { return tabletopCupTop(this, x, z); }, side: tabletopChinaBand(1.5, 2) },
            { box: [10, 0, 2.5, 13.5, 0.5, 6], color: TABLETOP_CHINA },
            { box: [10.5, 0.5, 10, 13, 2.5, 12.5], color: TABLETOP_CHINA, top(x, z) { return tabletopCupTop(this, x, z); }, side: tabletopChinaBand(1.5, 2) },
            { box: [10, 0, 9.5, 13.5, 0.5, 13], color: TABLETOP_CHINA }
        ]
    },
    jug: {
        name: 'Jug and Cup', color: TABLETOP_TERRACOTTA, facing: false,
        parts: [
            // A cream zigzag painted round the belly.
            { box: [4, 0, 5, 9, 6, 10], color: TABLETOP_TERRACOTTA, side: (u, h) => (Math.abs(h - 3.5 - Math.abs((u % 2) - 1) * 0.6) < 0.3 ? 0xeedcb8 : TABLETOP_TERRACOTTA) },
            { box: [4.5, 6, 5.5, 8.5, 7, 9.5], color: TABLETOP_TERRACOTTA },
            { box: [4.25, 7, 5.25, 8.75, 8, 9.75], color: TABLETOP_TERRACOTTA, top(x, z) { return tabletopInset(this, x, z) > 0.75 ? 0x3a1e12 : TABLETOP_TERRACOTTA; } },
            { box: [9, 2, 7, 10.5, 6, 8], color: TABLETOP_TERRACOTTA },
            { box: [10.5, 0, 9, 13.5, 3, 12], color: 0xc87a50, top(x, z) { return tabletopInset(this, x, z) > 0.5 ? 0x3d6fa0 : 0xc87a50; } }
        ]
    },
    chessboard: {
        name: 'Chessboard', color: TABLETOP_DARK_WOOD, facing: true,
        parts: [
            {
                box: [2, 0, 2, 14, 1.5, 14], color: TABLETOP_DARK_WOOD,
                // Eight squares by eight inside a dark frame.
                top(x, z) {
                    if (x < 3 || x > 13 || z < 3 || z > 13) return TABLETOP_DARK_WOOD;
                    return (Math.floor((x - 3) / 1.25) + Math.floor((z - 3) / 1.25)) % 2 === 0 ? 0x5a3a20 : 0xe8d4a8;
                }
            },
            ...TABLETOP_CHESS_WHITE.map(([x, z, tall]) => ({ box: [x, 1.5, z, x + 1, 1.5 + tall, z + 1], color: 0xf4f0e4 })),
            ...TABLETOP_CHESS_BLACK.map(([x, z, tall]) => ({ box: [x, 1.5, z, x + 1, 1.5 + tall, z + 1], color: 0x26262c }))
        ]
    },
    sewing_basket: {
        name: 'Sewing Basket', color: TABLETOP_WICKER, facing: true,
        parts: [
            { box: [2, 0, 4, 10, 4, 12], color: TABLETOP_WICKER, side: (u, h) => ((Math.floor(u) + Math.floor(h)) % 2 === 0 ? TABLETOP_WICKER : 0xa47c44) },
            { box: [3, 4, 5, 6, 6.5, 8], color: 0xc0302c },
            { box: [6, 4, 7, 9, 5.5, 10], color: 0x3058b0 },
            { box: [3, 4, 8.5, 5.5, 5, 11], color: 0xe0c040 },
            {
                box: [10.5, 0, 2.5, 15, 1, 7], color: TABLETOP_WOOD,
                // The hoop: a wooden ring round linen, a flower stitched on half of it and its thread.
                top(x, z) {
                    const r = Math.hypot(x - 12.75, z - 4.75);
                    if (r > 2.25) return TABLETOP_WOOD;
                    if (r > 1.75) return 0xa87448;
                    if (x < 12.75 && Math.abs(r - 1) < 0.35) return 0xc0302c;
                    if (x < 12.75 && r < 0.5) return 0xe0c040;
                    if (Math.abs(z - 4.75) < 0.2 && x >= 12.75) return 0xc0302c;
                    return 0xf4eedc;
                }
            }
        ]
    }
};

// A point of a top seen from the north-facing piece: world sixteenths (x, z) of a piece turned to `facing`
// back into the piece's own (the inverse of rotateShapeBox, js/blockShapes.js).
function tabletopLocal(x, z, facing) {
    switch (facing) {
        case 'e': return [z, 16 - x];
        case 's': return [16 - x, 16 - z];
        case 'w': return [16 - z, x];
        default: return [x, z];
    }
}

// The highest part over a point of the piece, or null.
function tabletopTopPart(parts, x, z) {
    let best = null;
    for (const part of parts) {
        const b = part.box;
        if (x >= b[0] && x <= b[3] && z >= b[2] && z <= b[5] && (!best || b[4] > best.box[4])) best = part;
    }
    return best;
}

// The part a side shows at height h and coordinate u along the face: of those standing at that height,
// the smallest whose span on some side holds u (see the header), else the widest of them.
function tabletopSidePart(parts, u, h) {
    let best = null;
    let widest = null;
    for (const part of parts) {
        const b = part.box;
        if (h < b[1] || h > b[4]) continue;
        const area = (b[3] - b[0]) * (b[5] - b[2]);
        if (!widest || area > widest.area) widest = { part, area };
        const holds = (u >= b[0] && u <= b[3]) || (u >= 16 - b[3] && u <= 16 - b[0]) || (u >= b[2] && u <= b[5]) || (u >= 16 - b[5] && u <= 16 - b[2]);
        if (holds && (!best || area < best.area)) best = { part, area };
    }
    return (best || widest || { part: parts[0] }).part;
}

function tabletopPaintTop(f, s, seed, object, facing) {
    f.each(s, (x, y, u, v) => {
        const [lx, lz] = tabletopLocal(u * 16, v * 16, facing);
        const part = tabletopTopPart(object.parts, lx, lz) || object.parts[0];
        const color = part.top ? part.top(lx, lz) : part.color;
        f.put(s, x, y, f.tone(s, f.rgb(color), (f.hash(x, y, seed) - 0.5) * 0.08), 0.5);
    });
}

function tabletopPaintSide(f, s, seed, object) {
    f.each(s, (x, y, u, v) => {
        const h = (1 - v) * 16;
        const part = tabletopSidePart(object.parts, u * 16, h);
        const color = part.side ? part.side(u * 16, h, part) : part.color;
        f.put(s, x, y, f.tone(s, f.rgb(color), (f.hash(x, y, seed) - 0.5) * 0.08), 0.5);
    });
}

// The box round every part: what a player bumps into.
function tabletopBounds(parts) {
    const bounds = [16, 16, 16, 0, 0, 0];
    for (const { box } of parts) {
        for (let i = 0; i < 3; i++) {
            bounds[i] = Math.min(bounds[i], box[i]);
            bounds[i + 3] = Math.max(bounds[i + 3], box[i + 3]);
        }
    }
    return bounds;
}

Object.entries(TABLETOP_OBJECTS).forEach(([id, object]) => {
    const options = object.glossy ? TABLETOP_GLOSSY : undefined;
    const facings = object.facing ? SHAPE_FACINGS : ['n'];
    facings.forEach((facing) => {
        registerTexturePattern(`tabletop_${id}_top_${facing}`, (f, s, tint, seed) => tabletopPaintTop(f, s, seed, object, facing), options);
    });
    registerTexturePattern(`tabletop_${id}_side`, (f, s, tint, seed) => tabletopPaintSide(f, s, seed, object), options);
    const faces = (facing) => ({ top: { pattern: `tabletop_${id}_top_${facing}`, minSize: 32 }, side: { pattern: `tabletop_${id}_side`, minSize: 32 } });
    furnShape(id, {
        facing: object.facing,
        boxes: object.parts.map((part) => part.box),
        collision: [tabletopBounds(object.parts)],
        iconFit: true,
        // The top is painted for each facing, so each facing has its own materials.
        ...(object.facing ? { materialKey: (state) => state.facing, variant: (state) => ({ faces: faces(state.facing) }) } : {})
    });
    furnBlock(id, { color: object.color, name: object.name, shape: id, breakDuration: 0.15, faces: faces('n') });
});

registerGameContent(function ({ addRecipe }) {
    addRecipe('open_book', 'Bind Open Book', 'open_book', 1, [{ type: 'leather', amount: 1 }, { type: 'wheat', amount: 3 }]);
    addRecipe('book_stack', 'Bind Pile of Books', 'book_stack', 1, [{ type: 'leather', amount: 3 }, { type: 'wheat', amount: 6 }]);
    addRecipe('inkwell', 'Make Letter and Inkwell', 'inkwell', 1, [{ type: 'brass_ingot', amount: 1 }, { type: 'feather', amount: 1 }, { type: 'coal_ore', amount: 1 }, { type: 'wheat', amount: 1 }]);
    addRecipe('scroll', 'Roll Scroll', 'scroll', 1, [{ type: 'wheat', amount: 3 }, { type: 'dark_oak_planks', amount: 1 }]);
    addRecipe('meal_plate', 'Serve Bread and Cheese', 'meal_plate', 1, [{ type: 'bread', amount: 1 }, { type: 'cheese', amount: 1 }, { type: 'brick', amount: 1 }]);
    addRecipe('fruit_bowl', 'Fill Bowl of Fruit', 'fruit_bowl', 1, [{ type: 'planks', amount: 1 }, { type: 'cherry_leaves', amount: 2 }, { type: 'leaves', amount: 1 }]);
    addRecipe('tea_set', 'Fire Tea Set', 'tea_set', 1, [{ type: 'sand', amount: 2 }, { type: 'quicklime', amount: 1 }, { type: 'element_co', amount: 1 }]);
    addRecipe('jug', 'Fire Jug and Cup', 'jug', 1, [{ type: 'brick', amount: 2 }]);
    addRecipe('chessboard', 'Make Chessboard', 'chessboard', 1, [{ type: 'birch_planks', amount: 1 }, { type: 'dark_oak_planks', amount: 1 }]);
    addRecipe('sewing_basket', 'Weave Sewing Basket', 'sewing_basket', 1, [{ type: 'wheat', amount: 3 }, { type: 'red_wool', amount: 1 }, { type: 'blue_wool', amount: 1 }]);
});
