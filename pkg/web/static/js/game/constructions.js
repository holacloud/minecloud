// Constructions: "/build <name>" raises a whole building a few blocks in front of the player, door
// towards them. Creative mode only and left out of /help and the guide, like /give: outside
// creative mode it answers like a command that does not exist.
// - The designs are small generator functions in CONSTRUCTION_DESIGNS; add an entry there to add
//   a building. They draw in a local box: x across, y up (y = 0 is the floor layer, on the ground),
//   z going away from the player (z = 0 is the edge nearest them), so a front door faces 's'.
// - The box turns with the player's look in four directions (blueprintRotate, blueprints.js), and
//   so do the states in the block names (stairs, doors, gates: constructionTurnType).
// - The box is emptied to air and every column gets a foundation down to the terrain, so a building
//   neither floats on a slope nor stays full of hillside.
// - Every block goes through the normal path (world.addBlock / removeBlockAt + blockPlace /
//   blockBreak), so all players see it and the server saves it with the chunk. Those messages are
//   open to any client already (it is what the robot and the beaver use), so this adds no server
//   power. The creative check of the blocks is therefore the client's, as it is for /give and "Build
//   all" in blueprints.js. Filling storage is the one thing the server checks itself (below).
// - At most CONSTRUCTION_RATE blocks per second go out, in small batches every frame, holding back
//   while the socket has a backlog or is down. Nothing starts until every chunk of the box is
//   loaded, since what is there has to be read for the undo.
// - A box bigger than what the player has loaded: the world keeps and asks for its chunks whatever
//   the distance (WorldRenderer.keptChunks), only until what is there has been read. A design with
//   `rate` reads in slices over the frames too. After that the build needs no chunk: the blocks and
//   what they replaced are in the ops, and the server loads what it has to change.
// - Storage comes empty from the blocks alone: what it holds lives on the server (storage.go). A design
//   says what its chests, barrels, fridges and ovens hold with b.stock(x, y, z, items, freezer), and once
//   its last block is out the build sends that in one or two constructionStock messages
//   (pkg/network/construction_stock.go). The server takes them only from a session that passed creative
//   auth, only for storage that is there and empty, only items it knows, in stacks of at most
//   CONSTRUCTION_STOCK_MAX: never a way to make items without creative. A build stopped half way sends none.
//   "/build undo" breaks those chests like any block, and the server spills what they hold to this client;
//   the drops of what the build itself put in are not spawned (constructionStockedDrop), anything a player
//   added since still drops. Only the lab (construction_lab.js) has a stock now.
// - "/build undo" puts back what the last build replaced (it lasts until the page reloads);
//   "/build stop" stops one half way, keeping what is done and undoable. After a reconnection a
//   build sends the last CONSTRUCTION_RESEND blocks again, as they may have died with the socket.
// Mixed into Game.prototype; the chat command is wired in social.js.

const CONSTRUCTION_RATE = 240;
const CONSTRUCTION_FRAME_MAX = 40;
const CONSTRUCTION_BACKLOG_BYTES = 64 * 1024;
const CONSTRUCTION_GAP = 3;
const CONSTRUCTION_SCAN_ABOVE = 4;
// Seconds without a new chunk before giving up, and between asking again for the ones missing.
const CONSTRUCTION_CHUNK_WAIT = 30;
const CONSTRUCTION_CHUNK_RETRY = 4;
// The most a frame gives to reading a box in slices: its time (ms) and its steps (about a column).
const CONSTRUCTION_SCAN_MS = 6;
const CONSTRUCTION_SCAN_STEPS = 1500;
const CONSTRUCTION_RESEND = 4000;
// A design with a `rate` re-meshes what it touched this often (seconds), not every frame: a dense
// chunk takes tens of milliseconds, and the same one is touched for many frames in a row.
const CONSTRUCTION_MESH_EVERY = 2;
const CONSTRUCTION_FACINGS = ['n', 'e', 's', 'w'];
// Quarter turns of the box that bring its local 's' (the way the player looks) to each facing.
const CONSTRUCTION_TURNS = { s: 0, w: 1, n: 2, e: 3 };
// What one constructionStock message carries at most, and the largest stack and total of one block (the
// server's stockMaxFills is twice the first; stockMaxStack and stockMaxItems are the others).
const CONSTRUCTION_STOCK_FILLS = 16;
const CONSTRUCTION_STOCK_MAX = 64;
const CONSTRUCTION_STOCK_TOTAL = 256;

// ---------------------------------------------------------------------------------------
// Drawing tools for the designs (no Game needed).

class ConstructionBuilder {
    constructor(size) {
        this.size = size;
        this.cells = new Map();
        // What storage holds once built: { x, y, z, items, freezer } by cell (see the header).
        this.stocks = new Map();
        this.flipped = false;
    }

    // What the storage block at this cell (the lower one of a piece of two) holds: items and freezer are
    // [[type, count], ...], one stack a slot; freezer is a fridge's second compartment.
    stock(x, y, z, items, freezer = []) {
        const fx = this.flipped ? this.size[0] - 1 - x : x;
        const key = (y * this.size[2] + z) * this.size[0] + fx;
        if (this.stocks.has(key)) throw new Error(`Stocked twice: ${fx},${y},${z}`);
        this.stocks.set(key, { x: fx, y, z, items, freezer });
    }

    // Draws `draw` and then its mirror image across the middle of the box.
    sym(draw) {
        draw();
        this.flipped = true;
        draw();
        this.flipped = false;
    }

    // type null empties the cell again.
    set(x, y, z, type, meta) {
        const [w, h, d] = this.size;
        const fx = this.flipped ? w - 1 - x : x;
        if (fx < 0 || fx >= w || y < 0 || y >= h || z < 0 || z >= d) throw new Error(`Outside the box: ${fx},${y},${z} (${type})`);
        const key = (y * d + z) * w + fx;
        if (type) this.cells.set(key, meta ? { x: fx, y, z, type, meta } : { x: fx, y, z, type });
        else this.cells.delete(key);
    }

    box(x0, y0, z0, x1, y1, z1, type) {
        for (let y = y0; y <= y1; y++) {
            for (let z = z0; z <= z1; z++) {
                for (let x = x0; x <= x1; x++) this.set(x, y, z, type);
            }
        }
    }

    // The four sides of a box, without what is inside it.
    walls(x0, y0, z0, x1, y1, z1, type) {
        this.box(x0, y0, z0, x1, y1, z0, type);
        this.box(x0, y0, z1, x1, y1, z1, type);
        this.box(x0, y0, z0, x0, y1, z1, type);
        this.box(x1, y0, z0, x1, y1, z1, type);
    }

    facing(facing) {
        if (!this.flipped) return facing;
        return facing === 'e' ? 'w' : facing === 'w' ? 'e' : facing;
    }

    shaped(x, y, z, base, shape, state) {
        this.set(x, y, z, shapeStateName(base, BLOCK_SHAPES[shape], state));
    }

    // A bed: the foot here, the head one block on the way it faces.
    bed(x, y, z, facing) {
        const [dx, dz] = SHAPE_DIRECTIONS[facing];
        this.shaped(x, y, z, 'bed', 'bed', { facing: this.facing(facing), part: 'foot' });
        this.shaped(x + dx, y, z + dz, 'bed', 'bed', { facing: this.facing(facing), part: 'head' });
    }

    // Walking in `facing` goes up them (blockShapes.js); half 'top' hangs them upside down.
    stairs(x, y, z, base, facing, half = 'bottom') {
        this.shaped(x, y, z, base, 'stairs', { facing: this.facing(facing), half });
    }

    // Both halves. `facing` is the way someone walking in looks.
    door(x, y, z, base, facing, hinge = 'left') {
        const side = this.flipped ? (hinge === 'left' ? 'right' : 'left') : hinge;
        const state = { facing: this.facing(facing), hinge: side, open: 'closed' };
        this.shaped(x, y, z, base, 'door', { ...state, half: 'lower' });
        this.shaped(x, y + 1, z, base, 'door', { ...state, half: 'upper' });
    }

    // Two doors side by side, each hinged on its outer side (see the door's place() in blockShapes.js).
    doubleDoor(ax, y, az, bx, bz, base, facing) {
        const [fx, fz] = SHAPE_DIRECTIONS[facing];
        const aIsRight = (ax - bx) * -fz + (az - bz) * fx > 0;
        this.door(ax, y, az, base, facing, aIsRight ? 'right' : 'left');
        this.door(bx, y, bz, base, facing, aIsRight ? 'left' : 'right');
    }

    gate(x, y, z, base, facing) {
        this.shaped(x, y, z, base, 'fence_gate', { facing: this.facing(facing), open: 'closed' });
    }

    // A hatch shut in the top of its cell: the board of a table, level with the fence legs.
    tableTop(x, y, z) {
        this.shaped(x, y, z, 'oak_trapdoor', 'trapdoor', { facing: this.facing('n'), half: 'top', open: 'closed' });
    }

    // A table along x (one or more boards deep), fences as legs at both ends.
    table(x0, x1, y, z0, z1, legs) {
        for (let z = z0; z <= z1; z++) {
            this.set(x0, y, z, legs);
            this.set(x1, y, z, legs);
            for (let x = x0 + 1; x < x1; x++) this.tableTop(x, y, z);
        }
    }

    // A fence post with a torch on it.
    lampPost(x, y, z, fence, height = 1) {
        this.box(x, y, z, x, y + height - 1, z, fence);
        this.set(x, y + height, z, 'torch');
    }
}

// ---------------------------------------------------------------------------------------
// The designs. Each one: label, size [w, h, d], foundation (what goes under the floor layer),
// anchorX (the x, on the z = 0 edge, that ends up straight ahead of the player), start (where a
// visitor arrives, for the tests), levels (places every visitor must be able to walk to, for the
// tests), optionally darkRooms (left out of the tests of light) and generate(b, size). Only what is drawn is built: the rest of the box becomes air, and
// undrawn cells of the floor layer keep their ground.
// For the very big ones, optionally: groundY (the layers up to this one are ground: undrawn cells
// keep it, and 'air' digs a cell out), rate (blocks per second; it also reads the box in slices) and
// site (a generator given { readType, blockTypes, min, size, turns, anchor, fromY }, which yields now
// and then and returns { refuse: message } or { baseY, grade }; grade(x, z), for a column at the rim,
// gives { top, type, keep, soil } and that column follows it: see constructionDiffColumn).

// The pieces of js/game/furniture.js, decor.js and mirrors.js the way the designs place them, with
// the states their block names want, and turned by b.sym like the rest. Storage and ovens are placed
// empty and unlit: what they hold and their fire live on the server. b.stock says what goes in them
// once the build is done (see the header).
function constructionFurnisher(b) {
    const lantern = (x, y, z, mount = 'hanging') => b.shaped(x, y, z, 'lantern', 'lantern', { mount });
    return {
        lantern,
        piece: (x, y, z, base, shape, facing) => b.shaped(x, y, z, base, shape, { facing: b.facing(facing) }),
        // Both cells of what stands two high.
        tall(x, y, z, base, facing) {
            b.shaped(x, y, z, base, base, { half: 'lower', facing: b.facing(facing) });
            b.shaped(x, y + 1, z, base, base, { half: 'upper', facing: b.facing(facing) });
        },
        floorLamp(x, y, z) {
            b.shaped(x, y, z, 'floor_lamp', 'floor_lamp', { half: 'lower' });
            b.shaped(x, y + 1, z, 'floor_lamp', 'floor_lamp', { half: 'upper' });
        },
        curtain: (x, y, z, color, facing, drawn = 'closed') => b.shaped(x, y, z, `${color}_curtain`, 'curtain', { facing: b.facing(facing), drawn }),
        oven: (x, y, z, facing) => b.shaped(x, y, z, 'oven', 'oven', { facing: b.facing(facing), fire: 'off' }),
        // A row along x, joined: they look the same way.
        benches(x0, x1, y, z, facing) {
            for (let x = x0; x <= x1; x++) b.shaped(x, y, z, 'bench', 'bench', { facing: b.facing(facing) });
        },
        // A fence post with a lantern standing on it.
        lanternPost(x, y, z, fence, height = 1) {
            b.box(x, y, z, x, y + height - 1, z, fence);
            lantern(x, y + height, z, 'floor');
        }
    };
}

// A timber cottage: birch and spruce on a cobble plinth, a dark oak gable roof made of stairs. One
// room of 7 by 7: the kitchen along the east wall, under the chimney; the bed, chest and wardrobe
// along the west wall; the sofa by the door; the table in the back, under the window. No bathroom:
// it would take a wall and a quarter of the room. x = 7 stays clear from the door to the oven.
function constructionHouse(b) {
    const { piece, tall, lantern, floorLamp, curtain, oven, lanternPost } = constructionFurnisher(b);
    const fence = 'spruce_fence';
    // The yard: a path to the gate, a fence in front, flowers.
    b.box(0, 0, 0, 10, 0, 13, 'grass');
    b.box(5, 0, 0, 5, 0, 3, 'cobblestone');
    b.box(0, 1, 0, 10, 1, 0, fence);
    b.box(0, 1, 0, 0, 1, 3, fence);
    b.box(10, 1, 0, 10, 1, 3, fence);
    b.gate(5, 1, 0, 'spruce_fence_gate', 's');
    b.sym(() => {
        lanternPost(4, 1, 3, fence);
        b.set(2, 1, 2, 'flower_red');
        b.set(3, 1, 1, 'flower_yellow');
        b.set(2, 1, 1, 'leaves');
    });

    // Plinth, floor, walls.
    b.box(1, 0, 4, 9, 0, 12, 'cobblestone');
    b.box(2, 0, 5, 8, 0, 11, 'spruce_planks');
    b.walls(1, 1, 4, 9, 1, 12, 'cobblestone');
    b.walls(1, 2, 4, 9, 3, 12, 'birch_planks');
    for (const x of [1, 9]) {
        for (const z of [4, 12]) b.box(x, 1, z, x, 3, z, 'spruce_wood');
    }

    // The front door in a timber frame.
    b.box(4, 1, 4, 4, 3, 4, 'spruce_wood');
    b.box(6, 1, 4, 6, 3, 4, 'spruce_wood');
    b.set(5, 3, 4, 'spruce_wood');
    b.door(5, 1, 4, 'oak_door', 's');

    // Windows, their curtains drawn back by day but for the bed's. Right click draws them.
    b.sym(() => {
        b.set(2, 2, 4, 'glass_pane');
        b.box(1, 2, 6, 1, 2, 7, 'glass_pane');
        b.set(1, 2, 10, 'glass_pane');
        curtain(2, 2, 5, 'green', 's', 'open');
        curtain(2, 2, 6, 'green', 'e', 'open');
        curtain(2, 2, 7, 'green', 'e', 'open');
        curtain(2, 2, 10, 'green', 'e', b.flipped ? 'open' : 'closed');
    });
    b.box(4, 2, 12, 6, 2, 12, 'glass_pane');
    for (const x of [4, 5, 6]) curtain(x, 2, 11, 'green', 'n', x === 5 ? 'open' : 'closed');

    // The roof: stairs up both slopes to a ridge running front to back, the gables filled in.
    for (let k = 0; k <= 4; k++) {
        const y = 3 + k;
        for (let z = 3; z <= 13; z++) {
            b.stairs(k, y, z, 'dark_oak_stairs', 'e');
            b.stairs(10 - k, y, z, 'dark_oak_stairs', 'w');
        }
        if (k > 0) {
            for (const z of [4, 12]) b.box(k + 1, y, z, 9 - k, y, z, 'birch_planks');
        }
    }
    b.box(5, 7, 3, 5, 7, 13, 'dark_oak_planks');
    // Roof lights: the eaves keep the sky off the middle of the room otherwise.
    for (const x of [3, 7]) {
        for (const z of [6, 7, 9, 10]) b.set(x, 6, z, 'glass');
    }
    for (const z of [4, 12]) b.set(5, 5, z, 'glass_pane');

    // The kitchen, from the back: the oven under the chimney, the sink under its window, the
    // workbench, the fridge. Under the fridge, in the floor, the generator that feeds it and nothing
    // else: they touch, and 30 W of its 80 W is the whole network, so it never blacks out.
    b.set(8, 0, 11, 'brick');
    oven(8, 1, 11, 'w');
    b.box(8, 2, 11, 8, 7, 11, 'brick');
    piece(8, 1, 10, 'sink', 'sink', 'w');
    b.set(8, 1, 9, 'workbench');
    piece(8, 2, 9, 'wall_shelf', 'wall_shelf', 'w');
    tall(8, 1, 8, 'fridge', 'w');
    b.set(8, 0, 8, 'rtg');
    b.set(8, 1, 7, 'barrel');

    // The table for four, under the back window.
    b.box(5, 1, 10, 6, 1, 10, 'table');
    for (const x of [5, 6]) {
        piece(x, 1, 9, 'oak_chair', 'chair', 's');
        piece(x, 1, 11, 'oak_chair', 'chair', 'n');
    }
    b.set(5, 2, 10, 'candle');
    b.set(6, 2, 10, 'vase');

    // The bed, head to the wall, with a lamp by it; at its foot the chest, then the wardrobe.
    b.bed(2, 1, 10, 's');
    piece(3, 1, 11, 'bedside_table', 'bedside_table', 'n');
    b.set(3, 2, 11, 'table_lamp');
    piece(2, 2, 11, 'painting_meadow', 'painting', 'n');
    b.box(3, 1, 9, 3, 1, 10, 'blue_carpet');
    piece(2, 1, 9, 'chest', 'chest', 'e');
    piece(2, 2, 9, 'painting_peaks', 'painting', 'e');
    tall(2, 1, 8, 'wardrobe', 'e');
    b.set(2, 1, 7, 'flower_pot');

    // By the door: the sofa on its carpet with a lamp, the clock over the door, a mirror on the post
    // beside it, and the bookshelf, with a pot on top and one in the corner.
    piece(2, 1, 5, 'green_sofa', 'sofa', 's');
    piece(3, 1, 5, 'green_sofa', 'sofa', 's');
    piece(3, 2, 5, 'painting_sunset', 'painting', 's');
    floorLamp(4, 1, 5);
    b.box(3, 1, 6, 5, 1, 7, 'red_carpet');
    piece(5, 3, 5, 'wall_clock', 'wall_clock', 's');
    piece(6, 2, 5, 'wall_mirror', 'wall_mirror', 's');
    piece(6, 3, 5, 'wall_mirror', 'wall_mirror', 's');
    for (let y = 1; y <= 3; y++) piece(7, y, 5, 'bookshelf', 'bookshelf', 's');
    b.set(7, 4, 5, 'flower_pot');
    b.set(8, 1, 5, 'flower_pot');

    // Light from under the roof: the room is too low for a chandelier.
    lantern(3, 5, 8);
    lantern(7, 5, 8);
}

// A brick market hall on a paved plaza: wide doors on all four sides, dark oak columns and tie
// beams, a tall roof glazed along the ridge, stalls along the long walls and tables in the middle.
function constructionHall(b) {
    const { piece, lantern, floorLamp, curtain, benches, lanternPost } = constructionFurnisher(b);
    const fence = 'dark_oak_fence';
    const wood = 'dark_oak_wood';
    const [front, back] = [8, 25];
    const columns = [8, 13, 18, 23];

    // The plaza, paved in a check with a slate border.
    for (let z = 0; z < 30; z++) {
        for (let x = 0; x < 32; x++) {
            const border = x === 0 || x === 31 || z === 0 || z === 29;
            b.set(x, 0, z, border ? 'slate' : (x + z) % 2 ? 'stone_bricks' : 'cobblestone');
        }
    }
    // A fountain ahead of the door.
    b.walls(14, 1, 2, 17, 1, 5, 'stone_bricks_slab');
    b.box(15, 0, 3, 16, 0, 4, 'water');
    // Trees, benches and street lamps. The benches have their back to the hall and look out.
    b.sym(() => {
        b.box(7, 1, 3, 7, 3, 3, 'wood');
        b.box(6, 4, 2, 8, 4, 4, 'leaves');
        b.set(7, 5, 3, 'leaves');
        benches(9, 11, 1, 6, 'n');
        b.set(12, 1, 6, 'flower_pot');
        for (const z of [10, 11, 12, 21, 22, 23]) piece(3, 1, z, 'bench', 'bench', 'w');
        benches(8, 10, 1, 26, 's');
        b.set(11, 1, 26, 'flower_pot');
        for (const [x, z] of [[1, 1], [1, 9], [1, 18], [1, 28], [10, 1], [10, 28]]) lanternPost(x, 1, z, fence, 3);
    });

    // Floor and walls.
    b.box(5, 0, front + 1, 26, 0, back - 1, 'spruce_planks');
    b.box(14, 0, front + 1, 17, 0, back - 1, 'dark_oak_planks');
    b.box(4, 0, 16, 27, 0, 17, 'dark_oak_planks');
    b.walls(4, 0, front, 27, 0, back, 'stone_bricks');
    b.walls(4, 1, front, 27, 1, back, 'stone_bricks');
    b.walls(4, 2, front, 27, 6, back, 'brick');
    b.walls(4, 7, front, 27, 7, back, 'dark_oak_planks');
    for (const z of [front, back]) {
        for (const x of [4, ...columns, 27]) b.box(x, 1, z, x, 7, z, wood);
    }
    for (const x of [4, 27]) {
        for (const z of [13, 20]) b.box(x, 1, z, x, 7, z, wood);
    }

    // Windows, between the columns.
    for (const z of [front, back]) {
        for (const [x0, x1] of [[5, 7], [9, 12], [19, 22], [24, 26]]) b.box(x0, 3, z, x1, 5, z, 'glass_pane');
    }
    for (const x of [4, 27]) {
        for (const [z0, z1] of [[10, 12], [21, 23]]) b.box(x, 3, z0, x, 5, z1, 'glass_pane');
    }

    // Curtains drawn back on the windows of the two short walls.
    b.sym(() => {
        for (let y = 3; y <= 5; y++) {
            for (const z of [10, 12, 21, 23]) curtain(5, y, z, 'red', 'e', 'open');
        }
    });

    // Wide doors in timber frames: four leaves in front, two on the other sides. Coloured glass over them.
    const fanlight = (a, y) => `${(a + y) % 2 ? 'orange' : 'yellow'}_stained_glass_pane`;
    b.box(13, 3, front, 18, 3, front, wood);
    for (let y = 4; y <= 6; y++) {
        for (let x = 14; x <= 17; x++) {
            b.set(x, y, front, fanlight(x, y));
            b.set(x, y, back, fanlight(x, y));
        }
    }
    b.box(14, 1, front, 17, 2, front, null);
    b.doubleDoor(14, 1, front, 15, front, 'oak_door', 's');
    b.doubleDoor(16, 1, front, 17, front, 'oak_door', 's');
    b.box(14, 3, back, 17, 3, back, wood);
    b.box(15, 1, back, 16, 2, back, null);
    b.doubleDoor(15, 1, back, 16, back, 'oak_door', 'n');
    for (const [x, facing] of [[4, 'e'], [27, 'w']]) {
        b.box(x, 3, 15, x, 3, 18, wood);
        for (let y = 4; y <= 6; y++) {
            for (let z = 15; z <= 18; z++) b.set(x, y, z, fanlight(z, y));
        }
        b.box(x, 1, 16, x, 2, 17, null);
        b.doubleDoor(x, 1, 16, x, 17, 'oak_door', facing);
    }

    // Columns and tie beams, with chandeliers under the beams.
    for (const x of columns) {
        b.box(x, 8, front + 1, x, 8, back - 1, wood);
        for (const z of [13, 20]) b.box(x, 1, z, x, 7, z, wood);
        for (const z of [12, 15, 18, 21]) b.set(x, 7, z, 'chandelier');
    }

    // The roof: stairs up both slopes to a ridge along x, glass near the ridge (it lights the
    // middle of the hall by day), and the two gable ends.
    for (let k = 0; k <= 9; k++) {
        const y = 7 + k;
        for (let x = 3; x <= 28; x++) {
            if (k >= 6) {
                b.set(x, y, 7 + k, 'glass');
                b.set(x, y, 26 - k, 'glass');
            } else {
                b.stairs(x, y, 7 + k, 'spruce_stairs', 's');
                b.stairs(x, y, 26 - k, 'spruce_stairs', 'n');
            }
        }
        if (k > 0) {
            for (const x of [4, 27]) b.box(x, y, 8 + k, x, y, 25 - k, 'brick');
        }
    }
    for (const x of [4, 27]) b.box(x, 9, 13, x, 13, 20, 'glass_pane');

    // Stalls along the front and back walls: a table between two posts under a striped awning that
    // runs back to the wall, a lane behind it to serve from, the stock against the wall, a lantern
    // under the awning and a mat for the customer. The stock is empty, as in every build.
    const wares = [['flower_pot', 'vase'], ['mushroom_red', 'mushroom_brown'], ['flower_red', 'flower_yellow'], ['vase', 'candle']];
    const mats = ['red', 'blue', 'green', 'orange', 'purple', 'cyan', 'yellow', 'brown'];
    let stall = 0;
    for (const [counter, lane, stock, mat, facing] of [[11, 10, 9, 12, 's'], [22, 23, 24, 21, 'n']]) {
        for (const x0 of [6, 10, 18, 22]) {
            b.box(x0, 1, counter, x0, 3, counter, fence);
            b.box(x0 + 3, 1, counter, x0 + 3, 3, counter, fence);
            b.box(x0 + 1, 1, counter, x0 + 2, 1, counter, 'table');
            const [left, right] = wares[stall % wares.length];
            b.set(x0 + 1, 2, counter, left);
            b.set(x0 + 2, 2, counter, right);
            b.box(x0 + 1, 1, mat, x0 + 2, 1, mat, `${mats[stall]}_carpet`);
            b.set(x0 + 1, 1, stock, 'barrel');
            piece(x0 + 2, 1, stock, 'chest', 'chest', facing);
            for (let x = x0; x <= x0 + 3; x++) {
                const stripe = x % 2 ? 'red_wool' : 'white_wool';
                for (const z of [counter, lane, stock]) b.set(x, 4, z, stripe);
            }
            lantern(x0 + 1, 3, lane);
            stall++;
        }
    }

    // Two long tables of joined boards with their benches, a pair of chairs at the end towards the
    // middle, which stays free from door to door, and free at the side doors too.
    b.sym(() => {
        b.box(7, 1, 16, 12, 1, 17, 'table');
        benches(7, 12, 1, 15, 's');
        benches(7, 12, 1, 18, 'n');
        piece(13, 1, 16, 'dark_oak_chair', 'chair', 'w');
        piece(13, 1, 17, 'dark_oak_chair', 'chair', 'w');
        b.set(8, 2, 16, 'candle');
        b.set(11, 2, 17, 'candle');
        b.set(9, 2, 17, 'vase');
        b.set(10, 2, 16, 'flower_pot');
        floorLamp(14, 1, 12);
        floorLamp(14, 1, 21);
        // Pots by the doors and the middle columns, a clock on those, paintings on the walls.
        b.set(13, 1, 9, 'flower_pot');
        b.set(14, 1, 24, 'flower_pot');
        b.set(13, 1, 14, 'flower_pot');
        b.set(13, 1, 19, 'flower_pot');
        piece(13, 3, 12, 'wall_clock', 'wall_clock', 'n');
        piece(5, 3, 14, b.flipped ? 'painting_fish' : 'painting_sunset', 'painting', 'e');
        piece(5, 3, 19, b.flipped ? 'painting_shapes' : 'painting_meadow', 'painting', 'e');
        piece(8, 3, 14, b.flipped ? 'painting_night' : 'painting_peaks', 'painting', 's');
        piece(8, 3, 19, b.flipped ? 'painting_meadow' : 'painting_fish', 'painting', 'n');
    });
}

// A limestone cathedral: two bell towers on the front, a nave with galleries on two levels over the
// aisles, marble piers, a glass roof on stone ribs (it lights the inside by day), a rose window over
// the door and a raised chancel in a rounded apse. Stained glass in every tall window, long benches
// facing the altar, a red carpet from the door to the altar, chandeliers on chains from the ridge.
function constructionCathedral(b) {
    const { piece, lantern, benches, lanternPost } = constructionFurnisher(b);
    const stone = 'limestone';
    const trim = 'stone_bricks';
    const pier = 'marble';
    const roofRib = 'stone_brick_stairs';
    const planks = 'dark_oak_planks';
    const piers = [12, 18, 24, 30, 36, 42];
    const levels = [
        // Each storey of the aisles: its floor layer, and the arch band over it.
        { floor: 0, band: 7 },
        { floor: 8, band: 15 },
        { floor: 16, band: 23 }
    ];
    const roofY = 24;
    const lastZ = 44;
    const cx = 14;

    // ---- The forecourt and the floors ----
    b.box(0, 0, 0, 28, 0, 3, trim);
    b.box(1, 0, 4, 27, 0, 45, trim);
    for (let z = 5; z <= lastZ; z++) {
        for (let x = 7; x <= 21; x++) b.set(x, 0, z, (x + z) % 2 ? pier : 'basalt');
    }
    b.box(13, 1, 5, 15, 1, 40, 'red_carpet');

    b.sym(() => {
        // ---- Outer wall of the aisles, with buttresses ----
        b.box(1, 1, 4, 1, roofY, 45, stone);
        b.box(1, 1, 4, 1, 1, 45, trim);
        b.box(1, 1, 45, 6, roofY, 45, stone);
        for (const z of piers) {
            b.box(0, 0, z, 0, 18, z, trim);
            b.stairs(0, 19, z, 'stone_brick_stairs', 'e');
        }

        // ---- The arcade between the aisle and the nave ----
        for (const z of piers) b.box(6, 1, z, 6, roofY - 1, z, pier);
        levels.forEach(({ floor, band }) => {
            b.box(6, band, 11, 6, band, lastZ, stone);
            for (const z of piers) {
                b.set(6, band, z, pier);
                b.stairs(6, band - 1, z + 1, roofRib, 'n', 'top');
                b.stairs(6, band - 1, z - 1, roofRib, 's', 'top');
            }
            if (!floor) return;
            // A gallery: its floor, and a railing on the side of the nave.
            b.box(2, floor, 11, 5, floor, lastZ, planks);
            b.box(6, floor, 11, 6, floor, lastZ, stone);
            for (let z = 11; z <= lastZ; z++) {
                if (!piers.includes(z)) b.set(6, floor + 1, z, 'iron_bars');
            }
            for (const z of piers) {
                b.set(6, floor, z, pier);
                lantern(5, floor + 1, z + 1, 'floor');
                if (z + 3 <= lastZ) lantern(2, floor + 1, z + 3, 'floor');
            }
        });

        // ---- Tall windows, one per bay and storey: two colours in a check on the sides, a pale
        // light down the middle with a yellow medallion, the colours moving on a bay per storey ----
        const lights = [['blue', 'light_blue'], ['red', 'orange'], ['purple', 'magenta'], ['green', 'lime'], ['cyan', 'blue']];
        piers.forEach((z, bay) => {
            if (z + 4 > lastZ) return;
            [[2, 6], [10, 14], [18, 22]].forEach(([y0, y1], storey) => {
                const pair = lights[(bay + storey) % lights.length];
                for (let y = y0; y < y1; y++) {
                    for (const dz of [2, 4]) b.set(1, y, z + dz, `${pair[(y + dz / 2) % 2]}_stained_glass`);
                }
                for (let y = y0; y <= y1; y++) b.set(1, y, z + 3, `${y === y0 + 2 ? 'yellow' : 'white'}_stained_glass`);
            });
        });

        // ---- The roof over the aisles, a parapet and pinnacles ----
        b.box(1, roofY, 11, 6, roofY, 45, 'slate');
        b.box(1, roofY + 1, 11, 1, roofY + 1, 45, 'stone_bricks_slab');
        for (const z of piers) {
            b.box(1, roofY + 1, z, 1, roofY + 2, z, trim);
            b.set(1, roofY + 3, z, 'stone_bricks_slab');
        }

        // ---- Light in the aisle, on stone brackets on the wall ----
        for (const z of piers) {
            for (const dz of [-3, 2]) {
                if (z + dz > lastZ) continue;
                b.set(2, 4, z + dz, trim);
                lantern(2, 5, z + dz, 'floor');
            }
        }

        // ---- More on the piers, both ways ----
        for (const z of piers) {
            for (const x of [5, 7]) {
                b.set(x, 4, z, trim);
                lantern(x, 5, z, 'floor');
            }
            // And one under each arch, between two piers.
            if (z + 3 <= lastZ) lantern(6, 6, z + 3);
        }

        // ---- A side door into the aisle ----
        b.box(1, 1, 26, 1, 3, 28, trim);
        b.doubleDoor(1, 1, 26, 1, 27, 'spruce_door', 'e');

        // ---- Pews: long benches looking at the altar, lantern stands along the carpet, kept off
        // the row each bench stands up into ----
        for (let z = 12; z <= 38; z += 3) benches(8, 12, 1, z, 's');
        for (let z = 14; z <= 38; z += 6) lanternPost(12, 1, z, 'dark_oak_fence');
        for (const z of [6, 9]) lanternPost(8, 1, z, 'dark_oak_fence', 2);
        lanternPost(11, 1, 6, 'dark_oak_fence');
    });

    // ---- The nave's roof: ribs of stairs with glass between them, a slate ridge ----
    for (let k = 0; k <= 6; k++) {
        const y = roofY + k;
        for (let z = 5; z <= lastZ; z++) {
            const rib = z === 5 || z === 10 || z === lastZ || piers.includes(z);
            if (rib) {
                b.stairs(7 + k, y, z, roofRib, 'e');
                b.stairs(21 - k, y, z, roofRib, 'w');
            } else {
                b.set(7 + k, y, z, 'glass');
                b.set(21 - k, y, z, 'glass');
            }
        }
    }
    b.box(cx, roofY + 6, 5, cx, roofY + 6, lastZ, 'slate');

    // ---- Crowns of five chandeliers, on chains from the ridge: low enough to light the floor ----
    const crown = (z, ridge) => {
        b.box(cx, 10, z, cx, ridge - 1, z, 'dark_oak_fence');
        b.set(cx, 9, z, 'chandelier');
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            b.set(cx + dx, 10, z + dz, 'dark_oak_fence');
            b.set(cx + dx, 9, z + dz, 'chandelier');
        }
    };
    for (const z of [17, 29, 40]) crown(z, roofY + 6);

    // ---- The front: wall and gable, the portal, the rose window ----
    b.box(1, 1, 4, 27, roofY, 4, stone);
    b.box(1, 1, 4, 27, 1, 4, trim);
    for (let k = 1; k <= 6; k++) b.box(7 + k, roofY + k, 4, 21 - k, roofY + k, 4, stone);
    b.box(cx, roofY + 6, 4, cx, roofY + 7, 4, trim);
    b.box(11, 1, 4, 11, 7, 4, pier);
    b.box(17, 1, 4, 17, 7, 4, pier);
    b.box(11, 8, 4, 17, 8, 4, trim);
    b.box(12, 3, 4, 16, 3, 4, trim);
    b.box(12, 4, 4, 16, 7, 4, 'light_blue_stained_glass');
    b.box(13, 4, 4, 15, 6, 4, 'blue_stained_glass');
    b.set(cx, 5, 4, 'yellow_stained_glass');
    b.box(12, 1, 4, 16, 2, 4, trim);
    b.door(13, 1, 4, 'dark_oak_door', 's', 'right');
    b.door(14, 1, 4, 'dark_oak_door', 's', 'left');
    b.door(15, 1, 4, 'dark_oak_door', 's', 'left');
    b.sym(() => {
        b.stairs(12, 8, 3, roofRib, 'e', 'bottom');
        for (let y = 4; y <= 10; y++) b.set(9, y, 4, `${y === 4 || y === 10 ? 'blue' : y % 2 ? 'red' : 'yellow'}_stained_glass`);
    });
    constructionRose(b, cx, 18, 4, 6);

    // ---- The two bell towers ----
    b.sym(() => constructionBellTower(b));

    // ---- The apse: a rounded end behind the chancel, walls of coloured glass, a sun behind the gold
    // cross: rings from yellow out to blue, each in a check with the next paler colour ----
    const apseRings = [[4, 'yellow', 'white'], [7, 'orange', 'yellow'], [10, 'red', 'orange'], [13, 'purple', 'magenta'], [Infinity, 'blue', 'light_blue']];
    const halfWidth = { 45: 8, 46: 8, 47: 8, 48: 7, 49: 6, 50: 5, 51: 4, 52: 3 };
    const apseEnd = 52;
    for (let z = 45; z <= apseEnd; z++) {
        const hw = halfWidth[z];
        const next = halfWidth[z + 1] ?? -1;
        for (let x = cx - hw; x <= cx + hw; x++) {
            const dx = Math.abs(x - cx);
            b.box(x, 0, z, x, 2, z, 'marble');
            // The wall: the rim of this row, and whatever the next row leaves uncovered.
            if (dx !== hw && dx <= next) continue;
            b.box(x, 1, z, x, roofY, z, stone);
            if (dx !== 0 && z > 47) {
                for (let y = 5; y <= 21; y++) {
                    const ring = apseRings.find(([reach]) => Math.hypot(dx, y - 11) < reach);
                    b.set(x, y, z, y % 4 === 0 ? trim : `${ring[1 + (dx + y) % 2]}_stained_glass`);
                }
            }
        }
    }
    // Its roof, stepping up to the ridge of the nave.
    for (let z = 45; z < apseEnd; z++) {
        const hw = halfWidth[z];
        for (let x = cx - hw + 1; x <= cx + hw - 1; x++) {
            const dx = Math.abs(x - cx);
            const e = Math.max(0, Math.min(hw - dx - 1, apseEnd - z - 1, 6));
            b.set(x, roofY + e, z, dx === 0 ? 'slate' : 'glass');
        }
    }

    // ---- The chancel: steps across the nave up to the raised floor, the altar on it ----
    for (let x = 7; x <= 21; x++) {
        b.stairs(x, 1, 41, 'stone_brick_stairs', 's');
        b.set(x, 1, 42, pier);
        b.stairs(x, 2, 43, 'stone_brick_stairs', 's');
        b.set(x, 1, 43, pier);
        b.box(x, 1, 44, x, 2, 44, pier);
    }
    // The carpet goes on up the middle to the altar: candles on it, either side of a white cloth.
    b.box(13, 3, 44, 15, 3, 47, 'red_carpet');
    b.box(13, 3, 48, 15, 3, 48, 'marble');
    b.set(14, 4, 48, 'white_carpet');
    b.box(cx, 3, 50, cx, 9, 50, 'gold_block');
    b.box(cx - 1, 7, 50, cx + 1, 7, 50, 'gold_block');
    b.set(13, 4, 48, 'candle');
    b.set(15, 4, 48, 'candle');
    crown(47, roofY + 4);
    b.sym(() => {
        // Round the altar, on the floor, with a pot; candlesticks behind it; a lantern at the steps.
        for (const z of [47, 49]) b.set(12, 3, z, 'candle');
        b.set(13, 3, 51, 'candle');
        b.set(12, 3, 48, 'flower_pot');
        b.set(11, 3, 49, 'dark_oak_fence');
        b.set(11, 4, 49, 'candle');
        lanternPost(10, 3, 46, 'dark_oak_fence');
        // Seats for the clergy, along the wall, looking across.
        piece(7, 3, 46, 'dark_oak_chair', 'chair', 'e');
        piece(7, 3, 47, 'dark_oak_chair', 'chair', 'e');
    });
}

// A round window in the plane of the wall at z, in real stained glass, in a stone ring. From the middle:
// gold, then four neon lamps on its corners in a star of yellow and orange; red and blue petals; a
// ring of light blue and purple with twelve lamps set in it like the hours of a clock, the four on
// the axes neon and the other eight argon. The lamps glow by day and night, in every graphics mode,
// when the glass goes dark. They give no light to the room (no `lightEmission`).
function constructionRose(b, cx, cy, z, radius) {
    for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
            const [dx, dy] = [Math.abs(x - cx), Math.abs(y - cy)];
            const d = Math.hypot(dx, dy);
            if (d > radius + 0.4) continue;
            const sector = Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 8;
            let type = 'stone_bricks';
            if (d < 1) type = 'gold_block';
            else if (dx === 1 && dy === 1) type = 'neon_lamp';
            else if (d < 2.5) type = sector % 2 ? 'orange_stained_glass' : 'yellow_stained_glass';
            else if (d < 4.2) type = sector % 2 ? 'blue_stained_glass' : 'red_stained_glass';
            else if (d === 5) type = dx === 0 || dy === 0 ? 'neon_lamp' : 'argon_lamp';
            else if (d < 5.4) type = sector % 2 ? 'light_blue_stained_glass' : 'purple_stained_glass';
            b.set(x, y, z, type);
        }
    }
}

// One bell tower, on the low x side of the front (b.sym mirrors it). Walls x = 1..7, z = 4..10, a
// solid core and a stair that winds around it, 2 up per side, so it passes over the same corner
// every 8 blocks: that is where the door to each gallery is, and the belfry floor.
function constructionBellTower(b) {
    const { lantern } = constructionFurnisher(b);
    const trim = 'stone_bricks';
    const stair = 'stone_brick_stairs';
    const belfry = 32;
    const top = 37;
    b.box(2, 1, 5, 6, top, 9, null);
    b.walls(1, 1, 4, 7, top, 10, 'limestone');
    b.walls(1, 1, 4, 7, 1, 10, trim);
    for (const x of [1, 7]) {
        for (const z of [4, 10]) b.box(x, 1, z, x, top, z, trim);
    }
    b.box(2, 0, 5, 6, 0, 9, trim);
    b.box(3, 1, 6, 5, belfry - 1, 8, trim);

    lantern(6, 1, 6, 'floor');
    // The way in, from the aisle.
    b.box(3, 1, 10, 3, 2, 10, null);
    // Narrow windows on the two outer sides.
    for (const y of [6, 14, 22, 28]) {
        b.box(1, y, 7, 1, y + 1, 7, 'glass_pane');
        b.box(4, y, 4, 4, y + 1, 4, 'glass_pane');
    }

    // The stairs, one round every 8 blocks of height.
    for (let base = 0; base < belfry; base += 8) {
        b.stairs(2, base + 1, 8, stair, 'n');
        b.stairs(2, base + 2, 7, stair, 'n');
        b.set(2, base + 2, 6, trim);
        b.set(2, base + 2, 5, trim);
        lantern(2, base + 3, 5, 'floor');
        b.stairs(3, base + 3, 5, stair, 'e');
        b.stairs(4, base + 4, 5, stair, 'e');
        b.set(5, base + 4, 5, trim);
        b.set(6, base + 4, 5, trim);
        b.stairs(6, base + 5, 6, stair, 's');
        b.stairs(6, base + 6, 7, stair, 's');
        b.set(6, base + 6, 8, trim);
        b.set(6, base + 6, 9, trim);
        lantern(6, base + 7, 9, 'floor');
        b.stairs(5, base + 7, 9, stair, 'w');
        b.stairs(4, base + 8, 9, stair, 'w');
        b.set(3, base + 8, 9, trim);
        b.set(2, base + 8, 9, trim);
    }
    // Doors to the two galleries, over the stair's back corner.
    for (const floor of [8, 16]) b.box(2, floor + 1, 10, 2, floor + 2, 10, null);

    // The belfry: its floor (open above the last flight, with a railing), open arches, the bell.
    b.box(2, belfry, 5, 6, belfry, 9, 'dark_oak_planks');
    const well = [[6, 6], [6, 7], [6, 8], [6, 9], [5, 9]];
    for (const [x, z] of well) b.set(x, belfry, z, null);
    b.stairs(4, belfry, 9, stair, 'w');
    b.set(3, belfry, 9, trim);
    b.set(2, belfry, 9, trim);
    b.box(5, belfry + 1, 6, 5, belfry + 1, 8, 'iron_bars');
    b.set(4, belfry + 1, 8, 'iron_bars');
    b.set(6, belfry + 1, 6, 'iron_bars');
    for (const [x, z] of [[2, 5], [4, 6], [5, 5]]) lantern(x, belfry + 1, z, 'floor');
    b.box(1, belfry + 2, 6, 1, belfry + 4, 8, 'iron_bars');
    b.box(7, belfry + 2, 6, 7, belfry + 4, 8, 'iron_bars');
    b.box(3, belfry + 2, 4, 5, belfry + 4, 4, 'iron_bars');
    b.box(3, belfry + 2, 10, 5, belfry + 4, 10, 'iron_bars');
    b.box(2, top, 5, 6, top, 9, 'slate');
    b.set(3, top - 1, 7, 'dark_oak_fence');
    b.set(3, top - 2, 7, 'gold_block');
    b.set(3, belfry + 1, 7, 'sound_block', { i: 'bell', o: 0 });

    // The spire: square rings of slate and stairs, narrowing to a gold tip.
    for (let k = 0; k <= 2; k++) {
        const y = top + 1 + k * 2;
        const [x0, x1, z0, z1] = [1 + k, 7 - k, 4 + k, 10 - k];
        b.walls(x0, y, z0, x1, y, z1, 'slate');
        for (let x = x0 + 1; x < x1; x++) {
            b.stairs(x, y + 1, z0, stair, 's');
            b.stairs(x, y + 1, z1, stair, 'n');
        }
        for (let z = z0 + 1; z < z1; z++) {
            b.stairs(x0, y + 1, z, stair, 'e');
            b.stairs(x1, y + 1, z, stair, 'w');
        }
        for (const x of [x0, x1]) {
            for (const z of [z0, z1]) b.set(x, y + 1, z, 'slate');
        }
    }
    b.box(4, top + 7, 7, 4, top + 8, 7, 'slate');
    b.set(4, top + 9, 7, 'gold_block');
}

// A furniture showroom, like a store: one floor, a one-way route along a yellow line from the
// entrance, round a ring of corridors with furnished rooms open towards them, back to the exit next
// to the entrance. Every piece of js/game/furniture.js, decor.js and mirrors.js stands in a scene
// (test/js/constructions.test.js checks that). In the middle, the light room: no sky within
// SKY_REACH columns of it, a thick roof, and a long entry lane so that no light from outside gets in.
// Its chests are empty: what they hold lives on the server, and a build only places blocks.
// A sign's board shows the text before " // ", one short line of Spanish that fits it whole, and the
// reader (a right click, or F) all of it, up to 288 bytes: what to do in Spanish, then in English. It
// looks the way the visitor comes from, and stands on its post out of the way of the route.
function constructionShowroom(b) {
    const colors = FURNITURE_COLORS.map(([color]) => color);
    const wall = (x0, z0, x1, z1, type = 'birch_planks') => b.box(x0, 1, z0, x1, 4, z1, type);
    const skylight = (x0, z0, x1, z1) => b.box(x0, 5, z0, x1, 5, z1, 'glass');
    const sign = (x, z, facing, ...parts) => b.set(x, 1, z, shapeStateName('sign', BLOCK_SHAPES.sign, { facing, mount: 'post' }), { t: parts.join(' // ') });
    const piece = (x, y, z, base, shape, facing) => b.shaped(x, y, z, base, shape, { facing });
    const sofa = (x, z, color, facing) => piece(x, 1, z, `${color}_sofa`, 'sofa', facing);
    const chair = (x, z, wood, facing) => piece(x, 1, z, `${wood}_chair`, 'chair', facing);
    const tall = (x, z, base, facing) => {
        b.shaped(x, 1, z, base, base, { half: 'lower', facing });
        b.shaped(x, 2, z, base, base, { half: 'upper', facing });
    };
    const floorLamp = (x, z) => {
        b.shaped(x, 1, z, 'floor_lamp', 'floor_lamp', { half: 'lower' });
        b.shaped(x, 2, z, 'floor_lamp', 'floor_lamp', { half: 'upper' });
    };
    const lantern = (x, y, z, mount = 'hanging') => b.shaped(x, y, z, 'lantern', 'lantern', { mount });
    const oven = (x, z, facing, fire) => b.shaped(x, 1, z, 'oven', 'oven', { facing, fire });
    const curtain = (x, y, z, color, facing, drawn = 'closed') => b.shaped(x, y, z, `${color}_curtain`, 'curtain', { facing, drawn });
    // The foot here, the head one block on, the way it faces.
    const bathtub = (x, z, facing) => {
        const [dx, dz] = SHAPE_DIRECTIONS[facing];
        b.shaped(x, 1, z, 'bathtub', 'bathtub', { part: 'foot', facing });
        b.shaped(x + dx, 1, z + dz, 'bathtub', 'bathtub', { part: 'head', facing });
    };

    // ---- Floors ----
    b.box(0, 0, 0, 55, 0, 51, 'limestone');
    b.box(11, 0, 4, 22, 0, 13, 'spruce_planks');
    b.box(1, 0, 4, 9, 0, 16, 'dark_oak_planks');
    b.box(1, 0, 18, 10, 0, 26, 'slate');
    b.box(1, 0, 28, 10, 0, 38, 'birch_planks');
    for (let z = 40; z <= 50; z++) {
        for (let x = 1; x <= 9; x++) b.set(x, 0, z, (x + z) % 2 ? 'marble' : 'basalt');
    }
    b.box(11, 0, 43, 20, 0, 50, 'planks');
    b.box(22, 0, 43, 39, 0, 50, 'marble');
    b.box(41, 0, 43, 54, 0, 50, 'spruce_planks');
    b.box(46, 0, 41, 54, 0, 42, 'spruce_planks');
    b.box(46, 0, 18, 54, 0, 39, 'basalt');
    b.box(34, 0, 4, 54, 0, 13, 'birch_planks');
    b.box(46, 0, 14, 54, 0, 16, 'birch_planks');

    // ---- The outside, the roof, the two doors ----
    b.walls(0, 1, 3, 55, 4, 51, 'brick');
    b.walls(0, 1, 3, 55, 1, 51, 'stone_bricks');
    b.box(0, 5, 3, 55, 5, 51, 'dark_oak_planks');
    for (const x of [25, 30]) {
        b.box(x - 1, 1, 3, x + 2, 3, 3, 'dark_oak_wood');
        b.box(x, 1, 3, x + 1, 2, 3, null);
        b.doubleDoor(x, 1, 3, x + 1, 3, 'oak_door', 's');
    }

    // ---- The inside walls ----
    wall(10, 4, 10, 13);
    wall(1, 17, 10, 17);
    wall(1, 27, 10, 27);
    wall(1, 39, 10, 39);
    wall(10, 43, 10, 50);
    wall(21, 43, 21, 50);
    wall(40, 43, 40, 50);
    wall(23, 4, 23, 13);
    wall(28, 4, 28, 16, 'dark_oak_planks');
    wall(33, 4, 33, 13);
    wall(45, 17, 54, 17);
    wall(45, 40, 54, 40);

    // ---- The route, on the corridors: a daylight strip on the lane that is far from the light room ----
    const line = 'yellow_wool';
    b.box(25, 0, 4, 25, 0, 15, line);
    b.box(12, 0, 15, 25, 0, 15, line);
    b.box(12, 0, 15, 12, 0, 41, line);
    b.box(12, 0, 41, 43, 0, 41, line);
    b.box(43, 0, 15, 43, 0, 41, line);
    b.box(30, 0, 15, 43, 0, 15, line);
    b.box(30, 0, 4, 30, 0, 15, line);
    skylight(11, 14, 27, 14);
    skylight(29, 14, 44, 14);
    skylight(11, 15, 11, 42);
    skylight(11, 42, 44, 42);
    skylight(44, 15, 44, 42);

    // ---- The two lobbies ----
    skylight(24, 8, 27, 8);
    skylight(29, 8, 32, 8);
    lantern(25, 4, 11);
    lantern(30, 4, 11);
    sign(24, 5, 'n', 'Bienvenido. Sigue la línea amarilla.', 'Pasa por todo y vuelve a la salida. Clic derecho en un cartel: lo lees entero.',
        'Welcome. Follow the yellow line: it goes through everything and back to the exit. Right click a sign to read all of it.');
    sign(32, 5, 's', 'Salida. /build undo lo quita todo.', 'Exit. /build undo takes it all away again.');

    // ---- 1. The living room ----
    sign(22, 13, 's', 'SALÓN. Sofás y cortinas.', 'Clic derecho en un sofá: te sientas; Agacharse: te levantas. Clic derecho en una cortina: se corre.',
        'Living room. Right click a sofa to sit, Sneak to stand. Right click a curtain to draw it. The clock tells the game time.');
    skylight(13, 7, 20, 7);
    skylight(13, 12, 20, 12);
    b.box(13, 1, 6, 19, 1, 11, 'light_gray_carpet');
    for (let x = 13; x <= 16; x++) sofa(x, 4, 'red', 's');
    for (let z = 6; z <= 8; z++) sofa(11, z, 'blue', 'e');
    sofa(22, 8, 'green', 'w');
    floorLamp(12, 4);
    b.set(15, 1, 9, 'table');
    b.set(16, 1, 9, 'table');
    b.set(16, 2, 9, 'table_lamp');
    b.set(15, 2, 9, 'vase');
    const bookshelves = (x0, z0, x1, z1, facing) => {
        for (let y = 1; y <= 3; y++) {
            for (let z = z0; z <= z1; z++) {
                for (let x = x0; x <= x1; x++) piece(x, y, z, 'bookshelf', 'bookshelf', facing);
            }
        }
    };
    bookshelves(22, 4, 22, 6, 'w');
    ['sunset', 'peaks', 'meadow', 'night', 'shapes', 'fish'].forEach((name, i) => {
        piece(11 + i, 3, 4, `painting_${name}`, 'painting', 's');
    });
    piece(22, 3, 8, 'wall_clock', 'wall_clock', 'w');
    piece(22, 3, 10, 'wall_shelf', 'wall_shelf', 'w');
    piece(22, 3, 11, 'wall_shelf', 'wall_shelf', 'w');
    b.box(19, 2, 3, 21, 3, 3, 'glass_pane');
    for (const y of [2, 3]) {
        curtain(19, y, 4, 'orange', 's');
        curtain(20, y, 4, 'orange', 's', 'open');
        curtain(21, y, 4, 'orange', 's');
    }
    b.set(11, 1, 4, 'flower_pot');
    b.set(18, 1, 4, 'flower_pot');
    b.set(22, 1, 12, 'flower_pot');

    // ---- 2. The dining room ----
    sign(9, 13, 's', 'COMEDOR. Sillas, banco, mesas.', 'Clic derecho en silla, banco o taburete: te sientas. Agacharse: te levantas.',
        'Dining room. Right click a chair, the bench or the stool to sit, Sneak to stand. The tables join, the bench too.');
    skylight(2, 6, 8, 6);
    skylight(2, 13, 8, 13);
    b.box(0, 2, 8, 0, 3, 11, 'glass_pane');
    b.box(3, 1, 9, 7, 1, 10, 'table');
    ['oak', 'birch', 'dark_oak', 'oak', 'birch'].forEach((wood, i) => chair(3 + i, 8, wood, 's'));
    chair(2, 9, 'dark_oak', 'e');
    for (let x = 3; x <= 7; x++) piece(x, 1, 11, 'bench', 'bench', 'n');
    b.set(8, 1, 10, 'stool');
    b.set(5, 4, 9, 'chandelier');
    b.set(4, 2, 9, 'candle');
    b.set(6, 2, 10, 'candle');

    // ---- 3. The kitchen ----
    sign(10, 18, 'e', 'COCINA. Horno, nevera, banco.', 'Horno: mete comida y carbón, cocina solo. Nevera y congelador van con el generador. Banco: recetas.',
        'Kitchen. Give the oven food and coal: it cooks itself. Fridge and freezer run on the generator; without power, just cupboards. Workbench: recipes.');
    skylight(4, 20, 8, 20);
    skylight(4, 25, 8, 25);
    // The freezer, the fridge and the generator touch: one network, 60 W out of 80.
    piece(1, 1, 18, 'chest_freezer', 'chest_freezer', 'e');
    tall(1, 19, 'fridge', 'e');
    b.set(1, 1, 20, 'rtg');
    oven(1, 21, 'e', 'off');
    piece(1, 1, 22, 'sink', 'sink', 'e');
    b.set(1, 1, 23, 'workbench');
    b.set(1, 1, 25, 'barrel');
    b.box(5, 1, 22, 6, 1, 23, 'table');
    for (const [x, z] of [[4, 22], [7, 23], [5, 21], [6, 24]]) b.set(x, 1, z, 'stool');
    lantern(6, 2, 23, 'floor');
    lantern(5, 4, 22);

    // ---- 4. The bedroom ----
    sign(10, 28, 'e', 'DORMITORIO. Camas y armario.', 'Clic derecho en armario y cofre: guardan cosas. En la cama: te tumbas, y de noche duermes.',
        'Bedroom. Right click the wardrobe and the chest to store things, the bed to lie down and, at night, sleep. Sneak gets up.');
    skylight(4, 30, 8, 30);
    skylight(4, 37, 8, 37);
    b.box(4, 1, 31, 8, 1, 35, 'purple_carpet');
    // Two beds side by side, the head at the wall.
    b.bed(2, 1, 32, 'w');
    b.bed(2, 1, 33, 'w');
    for (const z of [31, 34]) {
        piece(1, 1, z, 'bedside_table', 'bedside_table', 'e');
        b.set(1, 2, z, 'table_lamp');
    }
    tall(3, 28, 'wardrobe', 's');
    piece(3, 1, 32, 'chest', 'chest', 'e');
    b.box(0, 2, 36, 0, 3, 37, 'glass_pane');
    for (const y of [2, 3]) {
        for (const z of [36, 37]) curtain(1, y, z, 'cyan', 'e');
    }
    piece(6, 2, 38, 'wall_mirror', 'wall_mirror', 'n');
    piece(6, 3, 38, 'wall_mirror', 'wall_mirror', 'n');

    // ---- 5. The bathroom ----
    sign(9, 43, 'n', 'BAÑO. Mírate en el espejo.', 'Clic derecho en el váter: te sientas. Agacharse: te levantas. La bañera se pisa por dentro.',
        'Bathroom. Right click the toilet to sit, Sneak to stand. You can step into the bathtub. Look in the mirror.');
    skylight(3, 42, 7, 42);
    skylight(3, 46, 7, 46);
    piece(1, 1, 44, 'sink', 'sink', 'e');
    piece(1, 2, 44, 'wall_mirror', 'wall_mirror', 'e');
    piece(1, 3, 44, 'wall_mirror', 'wall_mirror', 'e');
    piece(1, 1, 47, 'toilet', 'toilet', 'e');
    bathtub(4, 50, 'e');
    b.set(3, 1, 50, 'candle');
    b.set(7, 1, 50, 'candle');
    lantern(5, 4, 43);

    // ---- 6. The study ----
    sign(20, 43, 'n', 'ESTUDIO. Silla, cofre, libros.', 'Clic derecho en la silla: te sientas. En el cofre: guarda cosas. Las estanterías son adorno.',
        'Study. Right click the chair to sit, the chest to store things. The bookshelves are decoration.');
    skylight(12, 45, 19, 45);
    bookshelves(12, 50, 19, 50, 'n');
    piece(15, 1, 47, 'desk', 'desk', 's');
    chair(15, 48, 'dark_oak', 'n');
    b.set(15, 2, 47, 'table_lamp');
    floorLamp(18, 47);
    piece(11, 1, 47, 'chest', 'chest', 'e');

    // ---- 7. The stained glass gallery, with its back to the daylight ----
    sign(22, 43, 'n', 'VIDRIERAS. Los 16 colores.', 'En bloque y en panel, contra el cielo: filtran lo que hay detrás.',
        'Stained glass. All 16 colours, as blocks and as panes, against the sky: they filter what is behind them.');
    skylight(24, 48, 27, 48);
    skylight(28, 45, 36, 45);
    skylight(28, 49, 36, 49);
    colors.forEach((color, i) => {
        b.set(22 + i, 2, 51, `${color}_stained_glass`);
        b.set(22 + i, 3, 51, `${color}_stained_glass_pane`);
    });
    b.box(38, 2, 51, 39, 3, 51, 'glass');
    lantern(32, 4, 47);
    // Red behind blue, in front of clear glass: as blocks, and as panes with a gap between them
    // (next to each other they would join front to back).
    sign(37, 46, 'n', 'Rojo tras azul: pasa muy poca luz.', 'En bloque y en panel. Míralo desde aquí, hacia el cielo.',
        'Red behind blue, as blocks and as panes: very little light gets through. Look at the sky through them from here.');
    b.box(38, 1, 48, 38, 1, 49, 'stone_bricks');
    b.set(38, 2, 48, 'blue_stained_glass');
    b.set(38, 2, 49, 'red_stained_glass');
    b.set(39, 1, 47, 'stone_bricks');
    b.set(39, 1, 49, 'stone_bricks');
    b.set(39, 2, 47, 'blue_stained_glass_pane');
    b.set(39, 2, 49, 'red_stained_glass_pane');
    // A pane in front of a mirror.
    for (let z = 47; z <= 49; z++) {
        for (let y = 1; y <= 3; y++) piece(22, y, z, 'wall_mirror', 'wall_mirror', 'e');
        b.set(23, 2, z, 'cyan_stained_glass_pane');
    }
    sign(23, 46, 'n', 'Panel cian ante un espejo.', 'La vidriera filtra también el reflejo.',
        'A cyan pane in front of a mirror: the stained glass filters the reflection too.');
    // A piece under water, seen through the glass side, or from above off the step.
    b.box(24, 1, 43, 27, 2, 46, 'stone_bricks');
    b.box(24, 1, 43, 27, 2, 43, 'glass');
    b.box(25, 1, 46, 26, 2, 46, 'lime_wool');
    b.box(25, 1, 44, 26, 2, 45, 'water');
    b.set(25, 1, 45, 'magenta_stained_glass');
    b.box(24, 1, 42, 27, 1, 42, 'stone_bricks_slab');
    sign(28, 43, 'n', 'Bajo el agua. Mira por el cristal.', 'El bloque magenta del estanque se ve mal, es un defecto conocido. Míralo también desde el escalón.',
        'Under water: the magenta block in the pool looks wrong, a known flaw. Look through the glass side and from the step.');

    // ---- 8. The light room: bays of one light each along a dark aisle, a floor to measure on ----
    b.walls(14, 1, 17, 41, 4, 39, 'limestone');
    wall(38, 18, 38, 38, 'limestone');
    wall(39, 18, 40, 26, 'limestone');
    wall(15, 26, 37, 26, 'limestone');
    wall(15, 30, 37, 30, 'limestone');
    for (const x of [20, 26, 32]) {
        wall(x, 18, x, 25, 'limestone');
        wall(x, 31, x, 38, 'limestone');
    }
    b.box(38, 1, 27, 38, 3, 29, null);
    b.box(39, 1, 39, 40, 2, 39, null);
    b.doubleDoor(39, 1, 39, 40, 39, 'dark_oak_door', 'n');
    b.walls(14, 6, 17, 38, 7, 39, 'limestone');
    b.box(14, 8, 17, 38, 8, 39, 'slate');
    const bays = [
        // [x, z, the mouth's z, what to do with the middle of the bay, Spanish, English]
        [17, 34, 30, (x, z) => b.set(x, 1, z, 'candle'), 'Vela: nivel 9.', 'Candle: level 9.'],
        [23, 34, 30, (x, z) => lantern(x, 1, z, 'floor'), 'Farol de pie: nivel 13.', 'Standing lantern: level 13.'],
        [29, 34, 30, (x, z) => lantern(x, 4, z), 'Farol colgado: nivel 13.', 'Hanging lantern: level 13.'],
        [35, 34, 30, (x, z) => { b.set(x, 1, z, 'table'); b.set(x, 2, z, 'table_lamp'); }, 'Lámpara de mesa: nivel 12.', 'Table lamp: level 12.'],
        [17, 22, 26, floorLamp, 'Lámpara de pie: nivel 14.', 'Floor lamp: level 14.'],
        [23, 22, 26, (x, z) => b.set(x, 4, z, 'chandelier'), 'Candelabro: nivel 14.', 'Chandelier: level 14.'],
        [29, 22, 26, (x, z) => oven(x, z, 's', 'off'), 'Horno: nivel 11 si arde.', 'Oven: level 11 while it burns. Put in food and coal.'],
        [35, 22, 26, () => {}, 'Sin ninguna luz: así de oscuro es.', 'No light at all: this is how dark it is.']
    ];
    for (const [x, z, mouth, place, es, en] of bays) {
        b.box(x - 1, 1, mouth, x + 1, 3, mouth, null);
        const ahead = Math.sign(mouth - z);
        for (let k = -3; k <= 3; k++) b.set(x, 0, z + k * ahead, k % 2 ? 'white_wool' : 'black_wool');
        place(x, z);
        sign(x + 2, mouth - ahead, 'w', es, en);
    }
    sign(38, 40, 's', 'SALA DE LUZ. Una luz por sala.', 'Oscura aposta. Las rayas del suelo miden hasta dónde llega. Entra y vuelve por aquí.',
        'Light room. Dark on purpose: one light per bay. The stripes on the floor measure its reach. In and back out through here.');
    b.set(39, 1, 38, 'candle');

    // ---- 9. Joins: what joins and what does not ----
    sign(41, 43, 'n', 'UNIONES. Sofás, banco, mesas.', 'Sofás del mismo color se unen; rojo y azul no. Banco igual, si mira igual. Las mesas se unen en fila.',
        'Joins. Sofas of a colour join; red and blue do not. Benches too, if they face the same way. Tables join in a row.');
    skylight(43, 45, 53, 45);
    skylight(47, 42, 53, 42);
    for (let x = 43; x <= 46; x++) sofa(x, 50, 'red', 'n');
    for (let x = 47; x <= 50; x++) sofa(x, 50, 'blue', 'n');
    for (let x = 43; x <= 46; x++) piece(x, 1, 47, 'bench', 'bench', 'n');
    piece(47, 1, 47, 'bench', 'bench', 's');
    b.box(49, 1, 47, 53, 1, 47, 'table');
    lantern(48, 4, 48);
    lantern(50, 4, 43);

    // ---- 10. The hall of mirrors: a long room to step back in, the sofas in all colours to reflect ----
    sign(54, 18, 'w', 'ESPEJOS. Hasta 14 bloques.', 'Refleja de verdad hasta 14 bloques: aléjate hasta aquí y es solo textura. Hay cubos y dos paredes.',
        'Mirrors. A real reflection up to 14 blocks: step back to here and it is only its texture. Cubes, and mirrors on two walls.');
    skylight(47, 19, 53, 19);
    skylight(47, 25, 53, 25);
    skylight(47, 31, 53, 31);
    skylight(47, 37, 53, 37);
    colors.forEach((color, i) => sofa(46, 20 + i, color, 'e'));
    for (let x = 48; x <= 53; x++) {
        for (let y = 1; y <= 3; y++) piece(x, y, 39, 'wall_mirror', 'wall_mirror', 'n');
    }
    for (let z = 22; z <= 33; z++) {
        for (let y = 1; y <= 3; y++) piece(54, y, z, 'wall_mirror', 'wall_mirror', 'w');
    }
    b.box(49, 1, 28, 49, 2, 28, 'mirror');
    b.box(52, 1, 34, 52, 2, 34, 'mirror');
    lantern(50, 4, 22);
    lantern(50, 4, 28);
    lantern(50, 4, 35);

    // ---- 11. The storage corner, empty: try it with someone else ----
    sign(46, 16, 'w', 'ALMACÉN, vacío. Guarda algo.', 'Cofre, barril y armario: guarda algo y que otro jugador lo vea moverse. Lo de dentro vive en el servidor.',
        'Storage, empty. Chest, barrel, wardrobe: store something and have another player watch it move. Contents live on the server.');
    skylight(50, 15, 53, 15);
    piece(47, 1, 16, 'chest', 'chest', 'n');
    b.set(48, 1, 16, 'barrel');
    tall(49, 16, 'wardrobe', 'n');
    lantern(47, 4, 14);

    // ---- 12. The sample wall: every curtain and every carpet ----
    sign(34, 4, 's', 'MUESTRAS. Cortinas y alfombras.', 'Las 16 cortinas (clic derecho: se corre la columna entera) y las 16 alfombras, para pisarlas.',
        'Samples. The 16 curtains (right click draws the whole column) and the 16 carpets, to walk on.');
    skylight(36, 9, 53, 9);
    colors.forEach((color, i) => {
        for (let y = 1; y <= 3; y++) curtain(36 + i, y, 4, color, 's');
        b.box(36 + i, 1, 6, 36 + i, 1, 7, `${color}_carpet`);
    });

    // ---- 13. The workshop: a foundry, and an arc furnace on two generators of its own (160 W of
    // the 150 W it asks for while it works), touching nothing of the kitchen's network ----
    sign(54, 12, 'w', 'TALLER. Fundición y horno de arco.', 'Fundición: arena o adoquín, y carbón. Horno de arco: arena y carbón, con sus 2 generadores (150 W).',
        'Workshop. Foundry: sand or cobblestone, and coal. Arc furnace: sand and coal, on its two generators. Both yield more than the C menu.');
    b.shaped(54, 1, 10, 'foundry', 'oven', { facing: 'w', fire: 'off' });
    b.set(51, 1, 16, 'rtg');
    b.shaped(52, 1, 16, 'arc_furnace', 'arc_furnace', { facing: 'n', fire: 'off' });
    b.set(53, 1, 16, 'rtg');
    // Cultures, on a generator of their own: an incubator (20 W) and an autoclave (40 W) of its 80 W.
    b.set(51, 1, 9, 'rtg');
    piece(52, 1, 9, 'incubator', 'incubator', 's');
    b.shaped(53, 1, 9, 'autoclave', 'autoclave', { facing: 's', fire: 'off' });
    sign(50, 10, 's', 'Incubadora y autoclave.', 'Incubadora: placa de agar y algo que sembrar. Autoclave: esteriliza las placas sucias. Guía 253.',
        'Incubator and autoclave. Incubator: an agar plate and something to inoculate. Autoclave: it sterilises dirty dishes. Guide 253.');

    // ---- 14. The microscope: one by the daylight strip, water and moss to sample, and two in the light
    // room, one beside a candle and one in the bay with no light at all ----
    sign(37, 10, 's', 'Microscopio. Pide luz.', 'De día, el sol; de noche, una vela al lado. Tubo en agua o musgo: muestra. /microkit en creativo.',
        'Microscope: it needs light. Sun by day, a candle at night. A test tube on water or moss takes a sample. /microkit in creative.');
    b.set(39, 1, 11, 'table');
    b.set(40, 1, 11, 'table');
    // A row of glow blocks: the five temperatures, and a few colours.
    sign(34, 12, 'n', 'Bloque luminoso. Clic derecho.', 'Brilla solo y eliges su color, pero no ilumina. Roto, vuelve sin color.',
        'Glow block. Right click to pick its colour. It shines by itself and lights nothing around it. Broken, it loses the colour.');
    ['glow_block:k2700', 'glow_block', 'glow_block:k4000', 'glow_block:k5000', 'glow_block:k6500', 'glow_block:rgb500', 'glow_block:rgb530', 'glow_block:rgb550',
        'glow_block:rgb050', 'glow_block:rgb055', 'glow_block:rgb005', 'glow_block:rgb505'].forEach((type, i) => b.set(35 + i, 1, 13, type));
    piece(39, 2, 11, 'microscope', 'microscope', 'n');
    b.box(42, 1, 11, 43, 1, 12, 'water');
    b.box(45, 1, 11, 48, 1, 12, 'moss');
    piece(18, 1, 34, 'microscope', 'microscope', 'w');
    piece(36, 1, 22, 'microscope', 'microscope', 'w');

    // ---- Night: lanterns from the ceiling, outside the light room. A hanging one lights the floor
    // well within 4 steps, and this lattice packs such diamonds with no gaps. ----
    const [w, , d] = b.size;
    for (let z = 4; z <= 50; z++) {
        for (let x = 1; x <= 54; x++) {
            if ((x + 9 * z) % 41 || (x >= 14 && x <= 41 && z >= 17 && z <= 39)) continue;
            if (!b.cells.has((4 * d + z) * w + x)) lantern(x, 4, z);
        }
    }
    // The corners the walls keep the lattice from.
    for (const [x, z] of [
        [26, 5], [31, 5], [21, 5], [21, 10], [11, 12], [8, 6], [9, 11], [2, 15], [26, 15], [33, 16],
        [2, 26], [5, 28], [9, 37], [13, 21], [13, 30], [2, 41], [8, 47], [12, 49], [24, 49], [30, 50],
        [35, 50], [38, 50], [16, 40], [20, 40], [27, 40], [35, 40], [49, 41], [54, 41], [54, 46], [46, 32],
        [46, 23], [50, 38], [53, 38], [54, 30], [53, 20], [53, 16], [53, 12], [53, 5], [44, 4], [35, 11], [35, 7],
        [42, 32], [42, 23], [42, 46], [50, 18]
    ]) lantern(x, 4, z);
}

const CONSTRUCTION_DESIGNS = {
    house: {
        label: 'Small house',
        size: [11, 10, 14],
        foundation: 'cobblestone',
        anchorX: 5,
        start: [5, 1, 1],
        levels: [
            { name: 'by the bed', at: [3, 1, 10] },
            { name: 'by the oven', at: [7, 1, 11] },
            { name: 'by the fridge', at: [7, 1, 8] },
            { name: 'the sofa\'s carpet', at: [3, 1, 6] }
        ],
        generate: constructionHouse
    },
    hall: {
        label: 'Community hall',
        size: [32, 19, 30],
        foundation: 'stone_bricks',
        anchorX: 15,
        start: [15, 1, 0],
        levels: [
            { name: 'the middle of the hall', at: [15, 1, 19] },
            { name: 'the far side', at: [15, 1, 28] },
            { name: 'behind a stall', at: [8, 1, 10] },
            { name: 'behind a stall at the back', at: [23, 1, 23] }
        ],
        generate: constructionHall
    },
    cathedral: {
        label: 'Cathedral',
        size: [29, 48, 54],
        foundation: 'stone_bricks',
        anchorX: 14,
        start: [14, 1, 1],
        levels: [
            { name: 'the nave', at: [14, 1, 30] },
            { name: 'the aisle', at: [3, 1, 30] },
            { name: 'the altar', at: [14, 3, 46] },
            { name: 'the first gallery, west', at: [3, 9, 30] },
            { name: 'the first gallery, east', at: [25, 9, 30] },
            { name: 'the second gallery, west', at: [3, 17, 30] },
            { name: 'the second gallery, east', at: [25, 17, 30] },
            { name: 'the west belfry', at: [2, 33, 7] },
            { name: 'the east belfry', at: [26, 33, 7] }
        ],
        generate: constructionCathedral
    },
    showroom: {
        label: 'Furniture showroom',
        size: [56, 10, 52],
        foundation: 'stone_bricks',
        anchorX: 25,
        start: [25, 1, 1],
        // In the order of the route.
        levels: [
            { name: 'the entrance lobby', at: [26, 1, 8] },
            { name: 'the living room', at: [18, 1, 10] },
            { name: 'the dining room', at: [5, 1, 14] },
            { name: 'the kitchen', at: [8, 1, 22] },
            { name: 'the bedroom', at: [7, 1, 29] },
            { name: 'the bathroom', at: [6, 1, 44] },
            { name: 'the study', at: [15, 1, 44] },
            { name: 'the stained glass gallery', at: [32, 1, 46] },
            { name: 'the light room', at: [25, 1, 28] },
            { name: 'the far bay of the light room', at: [17, 1, 20] },
            { name: 'the joins', at: [45, 1, 45] },
            { name: 'the hall of mirrors', at: [50, 1, 19] },
            { name: 'the storage corner', at: [48, 1, 15] },
            { name: 'the sample wall', at: [44, 1, 10] },
            { name: 'the microscope', at: [41, 1, 10] },
            { name: 'the exit lobby', at: [31, 1, 5] }
        ],
        // Dark on purpose [x0, z0, x1, z1]: the light room and the lane into it.
        darkRooms: [[15, 18, 40, 38]],
        generate: constructionShowroom
    }
};

// ---------------------------------------------------------------------------------------
// Plans (no Game needed). A plan's cells are { x, y, z, type, meta } in the design's local box.

function constructionPlan(name) {
    const design = CONSTRUCTION_DESIGNS[name];
    if (!design) return null;
    const builder = new ConstructionBuilder(design.size);
    design.generate(builder);
    return { ...design, name, cells: Array.from(builder.cells.values()), stocks: Array.from(builder.stocks.values()) };
}

// The block name after `turns` quarter turns: only names with a compass facing in their state change.
function constructionTurnType(type, turns, blockTypes) {
    const def = blockTypes[type];
    const facing = def && def.state && def.state.facing;
    const index = CONSTRUCTION_FACINGS.indexOf(facing);
    if (index < 0 || !BLOCK_SHAPES[def.shape]) return type;
    const state = { ...def.state, facing: CONSTRUCTION_FACINGS[(index + turns) % 4] };
    return shapeStateName(def.variantOf || type, BLOCK_SHAPES[def.shape], state);
}

// A plan placed in the world: `anchor` { x, z } is where the middle of its near edge goes, baseY
// the height of its floor layer. Gives the world cells, the box corner and the turned size.
function constructionLayout(plan, turns, anchor, baseY, blockTypes) {
    const { size, cells } = blueprintRotate(plan.size, plan.cells, turns);
    const [mark] = blueprintRotate(plan.size, [{ x: plan.anchorX, y: 0, z: 0 }], turns).cells;
    const min = { x: anchor.x - mark.x, y: baseY, z: anchor.z - mark.z };
    const stocks = blueprintRotate(plan.size, plan.stocks || [], turns).cells;
    return {
        min,
        stocks: stocks.map((stock) => ({ ...stock, x: min.x + stock.x, y: baseY + stock.y, z: min.z + stock.z })),
        size,
        foundation: plan.foundation,
        groundY: plan.groundY,
        cells: cells.map((cell) => ({
            ...cell,
            x: min.x + cell.x,
            y: baseY + cell.y,
            z: min.z + cell.z,
            type: constructionTurnType(cell.type, turns, blockTypes)
        }))
    };
}

// Real ground under a building: not air, water, plants, trees or anything shaped.
function constructionIsGround(type, blockTypes) {
    const def = type && blockTypes[type];
    if (!def || def.fluid || def.solid === false || def.transparent || def.shape) return false;
    return !/(^|_)(wood|leaves)$/.test(type);
}

// The floor height for the spot (x, z): the first ground or water going down from fromY.
function constructionFindGround(readType, x, z, fromY, blockTypes) {
    for (let y = fromY; y >= WORLD_MIN_Y; y--) {
        const type = readType(x, y, z);
        if (type === 'water' || constructionIsGround(type, blockTypes)) return y;
    }
    return null;
}

// What has to change, as ops { x, y, z, type, meta, prev: { type, meta } } (type null: remove),
// removals from the top down and then blocks from the bottom up. read(x, y, z) -> { type, meta }.
function constructionDiff(layout, read, blockTypes) {
    const ops = [];
    for (const step of constructionDiffSteps(layout, read, blockTypes, ops)) void step;
    return constructionOrder(ops);
}

// The same, a column at a time and chunk by chunk (so that blocks in a layer go out chunk by chunk,
// not re-meshing seven chunks a frame): yields after each column, adding to `ops`.
function* constructionDiffSteps(layout, read, blockTypes, ops) {
    const { min, size } = layout;
    const wanted = new Map();
    const keyOf = (x, y, z) => ((y - min.y) * size[2] + (z - min.z)) * size[0] + (x - min.x);
    layout.cells.forEach((cell) => wanted.set(keyOf(cell.x, cell.y, cell.z), cell));
    for (let cx = floorDiv(min.x, CHUNK_SIZE) * CHUNK_SIZE; cx < min.x + size[0]; cx += CHUNK_SIZE) {
        for (let cz = floorDiv(min.z, CHUNK_SIZE) * CHUNK_SIZE; cz < min.z + size[2]; cz += CHUNK_SIZE) {
            for (let x = Math.max(cx, min.x); x < Math.min(cx + CHUNK_SIZE, min.x + size[0]); x++) {
                for (let z = Math.max(cz, min.z); z < Math.min(cz + CHUNK_SIZE, min.z + size[2]); z++) {
                    constructionDiffColumn(layout, x, z, (y) => wanted.get(keyOf(x, y, z)), read, blockTypes, ops);
                    yield;
                }
            }
        }
    }
}

function constructionDiffColumn(layout, x, z, cellAt, read, blockTypes, ops) {
    const { min, size } = layout;
    const inBox = (ax, az) => ax >= min.x && ax < min.x + size[0] && az >= min.z && az < min.z + size[2];
    const change = (y, type, meta, current) => {
        const def = current.type && blockTypes[current.type];
        if (def && def.unbreakable) return;
        const wants = type === 'air' ? null : type;
        if (current.type === wants && !meta) return;
        ops.push({ x, y, z, type: wants, meta, prev: current });
        // A bed the box cuts in two goes whole, and an undo brings it back whole.
        if (isBedBlockType(current.type)) {
            for (const other of shapeLinkedCells(current.type, { x, y, z }, (ax, ay, az) => read(ax, ay, az).type, blockTypes)) {
                if (!inBox(other.x, other.z)) ops.push({ x: other.x, y: other.y, z: other.z, type: null, prev: read(other.x, other.y, other.z) });
            }
        }
    };
    const top = min.y + size[1];
    // The rim of a big site: above its height air, then `type` (or the ground there if `keep`), and
    // `soil` down to what is ground. It ignores the plan.
    const grade = layout.grade && layout.grade(x, z);
    if (grade) {
        for (let y = top - 1; y > grade.top; y--) change(y, null, undefined, read(x, y, z));
        const surface = read(x, grade.top, z);
        if (!grade.keep || !constructionIsGround(surface.type, blockTypes)) change(grade.top, grade.type, undefined, surface);
        for (let y = grade.top - 1; y >= WORLD_MIN_Y; y--) {
            const below = read(x, y, z);
            if (constructionIsGround(below.type, blockTypes)) break;
            change(y, grade.soil, undefined, below);
        }
        return;
    }
    const groundY = min.y + (layout.groundY || 0);
    // The volume: what the plan says, air everywhere else.
    for (let y = groundY + 1; y < top; y++) {
        const cell = cellAt(y);
        change(y, cell ? cell.type : null, cell && cell.meta, read(x, y, z));
    }
    // The floor layer (and those under it, if the ground is higher): what the plan says, or the
    // ground if there is some.
    for (let y = groundY; y >= min.y; y--) {
        const floor = cellAt(y);
        const current = read(x, y, z);
        if (floor) change(y, floor.type, floor.meta, current);
        else if (!constructionIsGround(current.type, blockTypes)) change(y, layout.foundation, undefined, current);
    }
    // The foundation, down to the terrain.
    for (let y = min.y - 1; y >= WORLD_MIN_Y; y--) {
        const below = read(x, y, z);
        if (constructionIsGround(below.type, blockTypes)) break;
        change(y, layout.foundation, undefined, below);
    }
}

function constructionOrder(ops) {
    const removals = ops.filter((op) => !op.type).sort((a, b) => b.y - a.y);
    const blocks = ops.filter((op) => op.type).sort((a, b) => a.y - b.y);
    return removals.concat(blocks);
}

// The ops that undo these (the ones already applied): each cell back to what it was.
function constructionUndoOps(applied) {
    return constructionOrder(applied.map((op) => ({
        x: op.x, y: op.y, z: op.z, type: op.prev.type, meta: op.prev.meta, prev: { type: op.type, meta: op.meta }
    })));
}

// ---------------------------------------------------------------------------------------
// The command

Object.assign(Game.prototype, {
    constructionCommand(command, args) {
        if (!this.creativeMode) {
            this.receiveSystemMessage({ text: `Unknown command: /${command}` });
            return;
        }
        const what = (args[0] || '').toLowerCase();
        if (what === 'undo') this.constructionStartUndo();
        else if (what === 'stop') this.constructionStop();
        else if (CONSTRUCTION_DESIGNS[what] && Object.prototype.hasOwnProperty.call(CONSTRUCTION_DESIGNS, what)) this.constructionStart(what, (args[1] || '').toLowerCase() === 'force');
        else this.constructionListOptions();
    },

    constructionListOptions() {
        const options = Object.keys(CONSTRUCTION_DESIGNS).map((name) => {
            const { label, size } = CONSTRUCTION_DESIGNS[name];
            return `${name} (${label}, ${size[0]} x ${size[2]}, ${size[1]} high)`;
        });
        this.receiveSystemMessage({ text: `/build ${options.join(', ')}. Also /build undo, /build stop` });
    },

    constructionBusy() {
        if (!this.constructionJob && !this.constructionWaiting && !this.constructionScan) return false;
        this.receiveSystemMessage({ text: 'Still building: wait for it, or /build stop' });
        return true;
    },

    // `force`: build over someone else's plot or the spawn area anyway (only the admin builds, and the server
    // lets the admin; without it the build stops before it starts, js/game/claims.js).
    constructionStart(name, force = false) {
        if (this.constructionBusy()) return;
        const position = this.cameraController.getPosition();
        const look = this.getInteractionRay().direction;
        const facing = shapeFacingFromVector(look.x, look.z);
        const [fx, fz] = SHAPE_DIRECTIONS[facing];
        const turns = CONSTRUCTION_TURNS[facing];
        const anchor = {
            x: Math.floor(position.x) + fx * CONSTRUCTION_GAP,
            z: Math.floor(position.z) + fz * CONSTRUCTION_GAP
        };
        const fromY = Math.floor(position.y - this.cameraController.eyeHeight) + CONSTRUCTION_SCAN_ABOVE;
        const plan = constructionPlan(name);
        // Where the box lands on the map (the height does not matter yet).
        const { min, size } = constructionLayout(plan, turns, anchor, 0, this.world.blockTypes);
        const covered = !force && typeof this.claimForeignInBox === 'function'
            ? this.claimForeignInBox(min.x, min.z, min.x + size[0] - 1, min.z + size[2] - 1) : null;
        if (covered) {
            this.receiveSystemMessage({ text: claimSay('buildBlocked', { zone: covered }) });
            return;
        }
        this.constructionWaiting = { plan, turns, anchor, fromY, min, size, waited: 0, retry: 0, left: Infinity, told: false };
        this.world.keptChunks = {
            minX: floorDiv(min.x, CHUNK_SIZE),
            maxX: floorDiv(min.x + size[0] - 1, CHUNK_SIZE),
            minZ: floorDiv(min.z, CHUNK_SIZE),
            maxZ: floorDiv(min.z + size[2] - 1, CHUNK_SIZE)
        };
        this.constructionTryBegin();
    },

    // The chunks of the box that are not loaded yet; asks for them.
    constructionMissingChunks({ min, size }) {
        const missing = [];
        for (let cx = floorDiv(min.x, CHUNK_SIZE); cx <= floorDiv(min.x + size[0] - 1, CHUNK_SIZE); cx++) {
            for (let cz = floorDiv(min.z, CHUNK_SIZE); cz <= floorDiv(min.z + size[2] - 1, CHUNK_SIZE); cz++) {
                if (this.world.columns.has(this.world.chunkKey(cx, cz))) continue;
                missing.push([cx, cz]);
                if (this.world.isWithinRetention(cx, cz)) this.world.generateChunkData(cx, cz);
            }
        }
        return missing;
    },

    constructionRead(x, y, z) {
        const type = this.world.getBlockTypeAt(x, y, z);
        if (type === 'ladder') return { type, meta: { f: this.world.getLadderFacingAt(x, y, z) } };
        if (isSignBlockType(type)) return { type, meta: { t: this.world.getSignTextAt(x, y, z) } };
        if (type === 'sound_block') {
            const state = this.world.getSoundBlockStateAt(x, y, z);
            return { type, meta: { i: state.instrument, o: state.note } };
        }
        return { type, meta: undefined };
    },

    // Once every chunk is here: read the ground and what is there, and start placing. A design with
    // a `rate` is read over several frames (constructionScanUpdate), the others right now.
    constructionTryBegin() {
        const waiting = this.constructionWaiting;
        const missing = this.constructionMissingChunks(waiting);
        if (missing.length) {
            if (!waiting.told) {
                waiting.told = true;
                this.receiveSystemMessage({ text: `${waiting.plan.label}: waiting for ${missing.length} chunks to load...` });
            }
            // Anything arriving counts as progress: a big box takes longer than the patience for one chunk.
            if (missing.length < waiting.left) {
                waiting.left = missing.length;
                waiting.waited = 0;
            }
            return;
        }
        this.constructionWaiting = null;
        const steps = this.constructionScanSteps(waiting);
        this.constructionScan = { waiting, steps };
        if (waiting.plan.rate) {
            this.receiveSystemMessage({ text: `${waiting.plan.label}: looking at the site...` });
            return;
        }
        let step = steps.next();
        while (!step.done) step = steps.next();
        this.constructionScanDone(waiting, step.value);
    },

    // Reads the box; yields often, returns { ops } or { refuse }.
    * constructionScanSteps({ plan, turns, anchor, fromY, min, size }) {
        const blockTypes = this.world.blockTypes;
        const readType = (x, y, z) => this.world.getBlockTypeAt(x, y, z);
        let baseY;
        let grade = null;
        if (plan.site) {
            const site = yield* plan.site({ readType, blockTypes, min, size, turns, anchor, fromY });
            if (site.refuse) return site;
            ({ baseY, grade } = site);
        } else {
            baseY = constructionFindGround(readType, anchor.x, anchor.z, fromY, blockTypes);
        }
        if (baseY === null || baseY < WORLD_MIN_Y || baseY + size[1] > WORLD_MAX_Y) return { refuse: `${plan.label}: it does not fit here` };
        const layout = constructionLayout(plan, turns, anchor, baseY, blockTypes);
        layout.grade = grade;
        const ops = [];
        yield* constructionDiffSteps(layout, (x, y, z) => this.constructionRead(x, y, z), blockTypes, ops);
        return { ops: constructionOrder(ops), stocks: layout.stocks };
    },

    // One frame's slice of the reading. A reconnection empties the world under it: then it starts again.
    constructionScanUpdate() {
        const { waiting, steps } = this.constructionScan;
        if (this.constructionMissingChunks(waiting).length) {
            this.constructionScan = null;
            this.constructionWaiting = { ...waiting, waited: 0, retry: 0, left: Infinity, told: false };
            return;
        }
        const start = performance.now();
        for (let count = 0; count < CONSTRUCTION_SCAN_STEPS; count++) {
            const step = steps.next();
            if (step.done) {
                this.constructionScanDone(waiting, step.value);
                return;
            }
            if (performance.now() - start > CONSTRUCTION_SCAN_MS) return;
        }
    },

    constructionScanDone(waiting, { refuse, ops, stocks }) {
        this.constructionScan = null;
        this.world.keptChunks = null;
        if (refuse) {
            this.receiveSystemMessage({ text: refuse });
            return;
        }
        const { label, rate = CONSTRUCTION_RATE } = waiting.plan;
        // Only the last build can be undone; it grows as blocks go out.
        this.constructionUndo = { label, rate, applied: [], stocked: new Map() };
        this.constructionJob = this.constructionNewJob(label, 'Building', ops, rate, false);
        this.constructionJob.stocks = stocks || [];
        this.receiveSystemMessage({ text: `Building ${label}: ${ops.length} block changes...` });
        if (waiting.plan.rate) {
            this.receiveSystemMessage({ text: `That is about ${Math.ceil(ops.length / rate / 60)} minutes, from the ground up, with no need to walk. Keep this tab open: /build undo lives in it. /build stop stops it` });
        }
    },

    constructionNewJob(label, verb, ops, rate, undoing) {
        return { label, verb, ops, rate, done: 0, credit: 0, nextReport: 0.1, undoing, socket: this.network && this.network.ws, held: new Set(), meshed: 0 };
    },

    constructionStartUndo() {
        if (this.constructionBusy()) return;
        const undo = this.constructionUndo;
        if (!undo || !undo.applied.length) {
            this.receiveSystemMessage({ text: 'Nothing to undo' });
            return;
        }
        const ops = constructionUndoOps(undo.applied);
        this.constructionJob = this.constructionNewJob(undo.label, 'Undoing', ops, undo.rate || CONSTRUCTION_RATE, true);
        // What the build put in its storage: when the server spills it, it is not spawned.
        if (undo.stocked && undo.stocked.size) {
            this.constructionUnstocking = this.constructionUnstocking || new Map();
            for (const [key, items] of undo.stocked) this.constructionUnstocking.set(key, items);
        }
        this.constructionUndo = null;
        this.receiveSystemMessage({ text: `Undoing ${undo.label}: ${ops.length} block changes...` });
    },

    constructionStop() {
        if (this.constructionWaiting || this.constructionScan) {
            this.constructionWaiting = null;
            this.constructionScan = null;
            this.world.keptChunks = null;
            this.receiveSystemMessage({ text: 'Build cancelled' });
            return;
        }
        const job = this.constructionJob;
        if (!job) {
            this.receiveSystemMessage({ text: 'Nothing is being built' });
            return;
        }
        this.constructionFinishBeds(job);
        this.constructionJob = null;
        this.constructionMeshHeld(job);
        // An undo stopped half way can still be finished: what it has not put back stays undoable.
        if (job.undoing) {
            const left = job.ops.slice(job.done).map((op) => ({ ...op, type: op.prev.type, meta: op.prev.meta, prev: { type: op.type, meta: op.meta } }));
            this.constructionUndo = left.length ? { label: job.label, rate: job.rate, applied: left, stocked: new Map() } : null;
        }
        this.receiveSystemMessage({ text: `Stopped after ${job.done} of ${job.ops.length} block changes${job.undoing ? '' : '. /build undo takes them back'}` });
    },

    // Stopping must not leave half a bed: what is pending of one with a half already done goes too.
    constructionFinishBeds(job) {
        const key = (op) => `${op.x},${op.y},${op.z}`;
        const done = new Set(job.ops.slice(0, job.done).map(key));
        const finish = [];
        const rest = [];
        for (const op of job.ops.slice(job.done)) {
            const type = op.type || (op.prev && op.prev.type);
            const def = isBedBlockType(type) ? this.world.blockTypes[type] : null;
            const partner = def && def.state.part !== 'single' ? BLOCK_SHAPES.bed.linked(def.state)[0] : null;
            if (partner && done.has(key({ x: op.x + partner[0], y: op.y + partner[1], z: op.z + partner[2] }))) finish.push(op);
            else rest.push(op);
        }
        for (const op of finish) {
            this.constructionApply(op);
            if (!job.undoing && this.constructionUndo) this.constructionUndo.applied.push(op);
        }
        job.ops = [...job.ops.slice(0, job.done), ...finish, ...rest];
        job.done += finish.length;
    },

    constructionMeshHeld(job) {
        job.meshed = 0;
        for (const key of job.held) this.world.rebuildQueue.add(key);
        job.held.clear();
    },

    // One block, the way a player places or breaks it.
    constructionApply(op) {
        if (!op.type) {
            this.world.removeBlockAt(op.x, op.y, op.z);
            if (this.network.connected) this.network.send('blockBreak', { x: op.x, y: op.y, z: op.z });
            return;
        }
        const payload = { x: op.x, y: op.y, z: op.z, blockType: op.type };
        const meta = op.meta || {};
        if (op.type === 'ladder') payload.facing = meta.f || 'pz';
        else if (isSignBlockType(op.type)) payload.text = meta.t || '';
        else if (op.type === 'sound_block') {
            payload.instrument = meta.i || 'bell';
            payload.note = Number.isInteger(meta.o) ? meta.o : 0;
        }
        this.world.addBlock(payload);
        if (this.network.connected) this.network.send('blockPlace', payload);
    },

    constructionUpdate(delta) {
        if (!this.creativeMode) {
            // Creative mode went off: stop quietly, what is done stays undoable if it is turned on again.
            if (this.constructionJob) this.constructionMeshHeld(this.constructionJob);
            this.constructionJob = null;
            this.constructionWaiting = null;
            this.constructionScan = null;
            this.world.keptChunks = null;
            return;
        }
        if (this.constructionWaiting) {
            const waiting = this.constructionWaiting;
            waiting.waited += delta;
            waiting.retry += delta;
            // The server forgets requests when the player moves away, and all of them on a reconnection.
            if (waiting.retry > CONSTRUCTION_CHUNK_RETRY) {
                waiting.retry = 0;
                for (const [cx, cz] of this.constructionMissingChunks(waiting)) this.world.generatingChunks.delete(this.world.chunkKey(cx, cz));
            }
            this.constructionTryBegin();
            if (this.constructionWaiting && this.constructionWaiting.waited > CONSTRUCTION_CHUNK_WAIT) {
                const { label } = this.constructionWaiting.plan;
                this.constructionWaiting = null;
                this.world.keptChunks = null;
                this.receiveSystemMessage({ text: `${label}: those chunks did not load in time. Come closer, or raise the render distance, and try again` });
            }
        }
        if (this.constructionScan) this.constructionScanUpdate();
        const job = this.constructionJob;
        if (!job) return;
        // Nothing is lost while the connection is down or backed up: the blocks just wait.
        const socket = this.network && this.network.ws;
        if (!this.network || !this.network.connected) return;
        if (socket && socket.bufferedAmount > CONSTRUCTION_BACKLOG_BYTES) return;
        // Except what the old socket still held when it died: send the last ones again.
        if (socket !== job.socket) {
            const back = Math.min(job.done, CONSTRUCTION_RESEND);
            job.done -= back;
            job.socket = socket;
            if (!job.undoing && this.constructionUndo) this.constructionUndo.applied.length -= back;
        }
        const lumps = job.rate > CONSTRUCTION_RATE;
        if (lumps) {
            this.world.immediateRebuildMs = Infinity;
            this.world.heldRebuilds = job.held;
            job.meshed += delta;
        }

        job.credit = Math.min(CONSTRUCTION_FRAME_MAX, job.credit + delta * job.rate);
        while (job.credit >= 1 && job.done < job.ops.length) {
            job.credit -= 1;
            const op = job.ops[job.done++];
            this.constructionApply(op);
            if (!job.undoing && this.constructionUndo) this.constructionUndo.applied.push(op);
        }
        this.world.heldRebuilds = null;
        if (lumps && (job.done >= job.ops.length || job.meshed > CONSTRUCTION_MESH_EVERY)) this.constructionMeshHeld(job);
        if (job.done >= job.ops.length) {
            this.constructionJob = null;
            if (!job.undoing) this.constructionSendStock(job.stocks);
            this.receiveSystemMessage({
                text: job.undoing
                    ? `${job.label}: undone, ${job.done} blocks put back`
                    : `${job.label} finished: ${job.done} block changes. /build undo puts back what it replaced`
            });
            return;
        }
        const progress = job.done / job.ops.length;
        if (progress >= job.nextReport) {
            job.nextReport += 0.1;
            this.receiveSystemMessage({ text: `${job.verb} ${job.label}: ${Math.round(progress * 100)} % (${job.done} / ${job.ops.length})` });
        }
    }
});

// ---------------------------------------------------------------------------------------
// What the storage of a build holds (see the header)

// A stock's stacks as the server reads them.
function constructionStockStacks(list) {
    return (list || []).filter(([type, count]) => type && count > 0).map(([type, count]) => ({ type, count }));
}

function constructionStockKey(x, y, z) {
    return `${x},${y},${z}`;
}

Object.assign(Game.prototype, {
    // After the last block: the fills, a few to a message. The blocks went first on the same socket.
    constructionSendStock(stocks) {
        if (!stocks || !stocks.length || !this.network || !this.network.connected) return;
        const fills = stocks.map(({ x, y, z, items, freezer }) => {
            const fill = { x, y, z, items: constructionStockStacks(items) };
            const cold = constructionStockStacks(freezer);
            if (cold.length) fill.freezer = cold;
            return fill;
        });
        this.constructionStockListen();
        this.constructionStockSent = new Map(fills.map((fill) => [constructionStockKey(fill.x, fill.y, fill.z), fill]));
        this.constructionStockUndo = this.constructionUndo;
        this.constructionStockTally = { filled: 0, refused: 0, left: Math.ceil(fills.length / CONSTRUCTION_STOCK_FILLS) };
        for (let i = 0; i < fills.length; i += CONSTRUCTION_STOCK_FILLS) {
            this.network.send('constructionStock', { fills: fills.slice(i, i + CONSTRUCTION_STOCK_FILLS) });
        }
    },

    constructionStockListen() {
        if (this.constructionStockListening || !this.network || !this.network.on) return;
        this.constructionStockListening = true;
        this.network.on('constructionStockResult', (result) => this.constructionOnStockResult(result || {}));
    },

    // What landed is remembered with the undo, so that undoing does not spawn it.
    constructionOnStockResult({ filled, refused }) {
        const sent = this.constructionStockSent;
        const tally = this.constructionStockTally;
        if (!sent || !tally) return;
        const undo = this.constructionStockUndo;
        for (const at of Array.isArray(filled) ? filled : []) {
            const key = constructionStockKey(at[0], at[1], at[2]);
            const fill = sent.get(key);
            if (!fill) continue;
            if (undo && undo.stocked) undo.stocked.set(key, [...fill.items, ...(fill.freezer || [])]);
            tally.filled++;
        }
        tally.refused += Array.isArray(refused) ? refused.length : 0;
        if (--tally.left > 0) return;
        this.constructionStockSent = null;
        this.constructionStockTally = null;
        this.receiveSystemMessage({ text: `Stocked ${tally.filled} storage blocks${tally.refused ? `; ${tally.refused} refused (not empty, or not there)` : ''}` });
    },

    // A storage block that an undo broke: what the build put in it is not spawned again.
    constructionStockedDrop(drop) {
        const unstocking = this.constructionUnstocking;
        if (!unstocking || !unstocking.size) return drop.items;
        const key = [constructionStockKey(drop.x, drop.y, drop.z), constructionStockKey(drop.x, drop.y - 1, drop.z)].find((k) => unstocking.has(k));
        if (!key) return drop.items;
        const owed = new Map();
        for (const { type, count } of unstocking.get(key)) owed.set(type, (owed.get(type) || 0) + count);
        unstocking.delete(key);
        const left = [];
        for (const item of drop.items) {
            const take = Math.min(item.count, owed.get(item.type) || 0);
            if (take) owed.set(item.type, owed.get(item.type) - take);
            if (item.count > take) left.push({ ...item, count: item.count - take });
        }
        return left;
    }
});

registerFrameUpdate(function (delta) {
    if (this.constructionJob || this.constructionWaiting || this.constructionScan) this.constructionUpdate(delta);
});
