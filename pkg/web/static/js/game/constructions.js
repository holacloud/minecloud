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
//   power; the server has no notion of a creative client, and this file does not add one. The
//   creative check is therefore the client's, as it is for /give and "Build all" in blueprints.js.
// - At most CONSTRUCTION_RATE blocks per second go out, in small batches every frame, holding back
//   while the socket has a backlog or is down. Nothing starts until every chunk of the box is
//   loaded, since what is there has to be read for the undo.
// - "/build undo" puts back what the last build replaced (it lasts until the page reloads);
//   "/build stop" stops one half way, keeping what is done and undoable.
// Mixed into Game.prototype; the chat command is wired in social.js.

const CONSTRUCTION_RATE = 240;
const CONSTRUCTION_FRAME_MAX = 40;
const CONSTRUCTION_BACKLOG_BYTES = 64 * 1024;
const CONSTRUCTION_GAP = 3;
const CONSTRUCTION_SCAN_ABOVE = 4;
const CONSTRUCTION_CHUNK_WAIT = 30;
const CONSTRUCTION_FACINGS = ['n', 'e', 's', 'w'];
// Quarter turns of the box that bring its local 's' (the way the player looks) to each facing.
const CONSTRUCTION_TURNS = { s: 0, w: 1, n: 2, e: 3 };

// ---------------------------------------------------------------------------------------
// Drawing tools for the designs (no Game needed).

class ConstructionBuilder {
    constructor(size) {
        this.size = size;
        this.cells = new Map();
        this.flipped = false;
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

// A timber cottage: birch and spruce on a cobble plinth, a dark oak gable roof made of stairs.
// There are no chest, furnace or crafting table blocks in this game: a lab bench (which does
// open a workplace), a hearth and a pair of crates stand in for them.
function constructionHouse(b) {
    const fence = 'spruce_fence';
    // The yard: a path to the gate, a fence in front, flowers.
    b.box(0, 0, 0, 10, 0, 13, 'grass');
    b.box(5, 0, 0, 5, 0, 3, 'cobblestone');
    b.box(0, 1, 0, 10, 1, 0, fence);
    b.box(0, 1, 0, 0, 1, 3, fence);
    b.box(10, 1, 0, 10, 1, 3, fence);
    b.gate(5, 1, 0, 'spruce_fence_gate', 's');
    b.sym(() => {
        b.lampPost(4, 1, 3, fence);
        b.set(2, 1, 2, 'flower_red');
        b.set(3, 1, 1, 'flower_yellow');
        b.set(2, 1, 1, 'leaves');
    });

    // Plinth, floor, walls.
    b.box(1, 0, 4, 9, 0, 12, 'cobblestone');
    b.box(2, 0, 5, 8, 0, 11, 'spruce_planks');
    b.box(4, 0, 7, 6, 0, 9, 'red_wool');
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

    // Windows.
    b.sym(() => {
        b.set(2, 2, 4, 'glass_pane');
        b.box(1, 2, 6, 1, 2, 7, 'glass_pane');
        b.set(1, 2, 10, 'glass_pane');
    });
    b.box(4, 2, 12, 6, 2, 12, 'glass_pane');

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

    // The hearth, with its chimney through the roof.
    b.set(8, 0, 11, 'brick');
    b.set(8, 1, 11, 'torch');
    b.set(7, 1, 11, 'brick');
    b.set(7, 2, 11, 'brick');
    b.box(8, 2, 11, 8, 7, 11, 'brick');

    // Bed, crates, workplace, table with two seats, light.
    b.box(2, 1, 10, 2, 1, 11, 'bed');
    b.set(3, 1, 11, 'white_wool');
    b.set(2, 1, 9, 'dark_oak_wood');
    b.set(2, 2, 9, 'torch');
    b.set(2, 1, 8, 'dark_oak_wood');
    b.set(8, 1, 7, 'lab_bench');
    b.lampPost(8, 1, 5, fence);
    b.table(4, 6, 1, 8, 8, fence);
    b.set(5, 2, 8, 'torch');
    b.stairs(5, 1, 7, 'spruce_stairs', 'n');
    b.stairs(5, 1, 9, 'spruce_stairs', 's');
}

// A brick market hall on a paved plaza: wide doors on all four sides, dark oak columns and tie
// beams, a tall roof glazed along the ridge, stalls along the long walls and tables in the middle.
function constructionHall(b) {
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
    // Trees, benches and street lamps.
    b.sym(() => {
        b.box(7, 1, 3, 7, 3, 3, 'wood');
        b.box(6, 4, 2, 8, 4, 4, 'leaves');
        b.set(7, 5, 3, 'leaves');
        b.box(10, 1, 6, 11, 1, 6, 'stone_bricks_slab');
        for (const [x, z] of [[1, 1], [1, 9], [1, 18], [1, 28], [10, 1], [10, 28]]) b.lampPost(x, 1, z, fence, 3);
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

    // Wide doors in timber frames: four leaves in front, two on the other sides.
    b.box(13, 3, front, 18, 3, front, wood);
    b.box(14, 4, front, 17, 6, front, 'glass_pane');
    b.box(14, 1, front, 17, 2, front, null);
    b.doubleDoor(14, 1, front, 15, front, 'oak_door', 's');
    b.doubleDoor(16, 1, front, 17, front, 'oak_door', 's');
    b.box(14, 3, back, 17, 3, back, wood);
    b.box(14, 4, back, 17, 6, back, 'glass_pane');
    b.box(15, 1, back, 16, 2, back, null);
    b.doubleDoor(15, 1, back, 16, back, 'oak_door', 'n');
    for (const [x, facing] of [[4, 'e'], [27, 'w']]) {
        b.box(x, 3, 15, x, 3, 18, wood);
        b.box(x, 4, 15, x, 6, 18, 'glass_pane');
        b.box(x, 1, 16, x, 2, 17, null);
        b.doubleDoor(x, 1, 16, x, 17, 'oak_door', facing);
    }

    // Columns and tie beams, with torches along the beams.
    for (const x of columns) {
        b.box(x, 8, front + 1, x, 8, back - 1, wood);
        for (const z of [13, 20]) b.box(x, 1, z, x, 7, z, wood);
        for (const z of [10, 13, 16, 20, 23]) b.set(x, 9, z, 'torch');
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

    // Stalls along the front and back walls: a counter between two posts under a striped awning.
    const goods = ['flower_red', 'mushroom_red', 'flower_yellow', 'mushroom_brown'];
    let good = 0;
    for (const [counter, behind] of [[10, 9], [23, 24]]) {
        for (const x0 of [6, 10, 18, 22]) {
            b.box(x0, 1, counter, x0, 3, counter, fence);
            b.box(x0 + 3, 1, counter, x0 + 3, 3, counter, fence);
            b.box(x0 + 1, 1, counter, x0 + 2, 1, counter, 'dark_oak_planks');
            b.set(x0 + 1, 2, counter, goods[good++ % goods.length]);
            b.set(x0 + 2, 2, counter, 'torch');
            for (let x = x0; x <= x0 + 3; x++) {
                const stripe = x % 2 ? 'red_wool' : 'white_wool';
                b.set(x, 4, counter, stripe);
                b.set(x, 4, behind, stripe);
            }
        }
    }

    // Two long tables with their benches, leaving the middle free from door to door.
    b.sym(() => {
        b.table(7, 12, 1, 16, 17, fence);
        for (const x of [9, 10]) b.set(x, 2, 16, 'torch');
        b.box(8, 1, 15, 11, 1, 15, 'spruce_planks_slab');
        b.box(8, 1, 18, 11, 1, 18, 'spruce_planks_slab');
        b.lampPost(14, 1, 12, fence);
        b.lampPost(14, 1, 21, fence);
    });
}

// A limestone cathedral: two bell towers on the front, a nave with galleries on two levels over the
// aisles, marble piers, a glass roof on stone ribs (it lights the inside by day), a rose window over
// the door and a raised chancel in a rounded apse.
function constructionCathedral(b) {
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
    b.box(13, 0, 0, 15, 0, 41, 'red_wool');

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
                b.set(5, floor + 1, z + 1, 'torch');
                if (z + 3 <= lastZ) b.set(2, floor + 1, z + 3, 'torch');
            }
        });

        // ---- Tall windows, one per bay and storey ----
        for (const z of piers) {
            if (z + 4 > lastZ) continue;
            for (const [y0, y1] of [[2, 6], [10, 14], [18, 22]]) {
                b.box(1, y0, z + 2, 1, y1 - 1, z + 4, 'cobalt_glass');
                b.box(1, y0, z + 3, 1, y1, z + 3, 'glass');
            }
        }

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
                b.set(2, 5, z + dz, 'torch');
            }
        }

        // ---- More on the piers, both ways ----
        for (const z of piers) {
            for (const x of [5, 7]) {
                b.set(x, 4, z, trim);
                b.set(x, 5, z, 'torch');
            }
        }

        // ---- A side door into the aisle ----
        b.box(1, 1, 26, 1, 3, 28, trim);
        b.doubleDoor(1, 1, 26, 1, 27, 'spruce_door', 'e');

        // ---- Pews, with torch stands along the middle aisle ----
        for (let z = 12; z <= 38; z += 3) {
            for (let x = 8; x <= 12; x++) b.stairs(x, 1, z, 'dark_oak_stairs', 'n');
        }
        for (let z = 13; z <= 39; z += 6) b.lampPost(12, 1, z, 'dark_oak_fence');
        for (const z of [6, 9]) b.lampPost(8, 1, z, 'dark_oak_fence', 2);
        b.lampPost(11, 1, 6, 'dark_oak_fence');
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

    // ---- Chandeliers hanging from the ridge ----
    for (const z of [17, 29, 40]) {
        b.box(cx, 12, z, cx, roofY + 5, z, 'dark_oak_fence');
        b.set(cx, 11, z, 'gold_block');
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            b.set(cx + dx, 11, z + dz, planks);
            b.set(cx + dx, 12, z + dz, 'torch');
        }
    }

    // ---- The front: wall and gable, the portal, the rose window ----
    b.box(1, 1, 4, 27, roofY, 4, stone);
    b.box(1, 1, 4, 27, 1, 4, trim);
    for (let k = 1; k <= 6; k++) b.box(7 + k, roofY + k, 4, 21 - k, roofY + k, 4, stone);
    b.box(cx, roofY + 6, 4, cx, roofY + 7, 4, trim);
    b.box(11, 1, 4, 11, 7, 4, pier);
    b.box(17, 1, 4, 17, 7, 4, pier);
    b.box(11, 8, 4, 17, 8, 4, trim);
    b.box(12, 3, 4, 16, 3, 4, trim);
    b.box(12, 4, 4, 16, 7, 4, 'glass');
    b.box(13, 4, 4, 15, 6, 4, 'cobalt_glass');
    b.box(12, 1, 4, 16, 2, 4, trim);
    b.door(13, 1, 4, 'dark_oak_door', 's', 'right');
    b.door(14, 1, 4, 'dark_oak_door', 's', 'left');
    b.door(15, 1, 4, 'dark_oak_door', 's', 'left');
    b.sym(() => {
        b.stairs(12, 8, 3, roofRib, 'e', 'bottom');
        b.box(9, 4, 4, 9, 10, 4, 'cobalt_glass');
        b.box(9, 5, 4, 9, 9, 4, 'glass');
    });
    constructionRose(b, cx, 18, 4, 6);

    // ---- The two bell towers ----
    b.sym(() => constructionBellTower(b));

    // ---- The apse: a rounded end behind the chancel, walls of coloured glass ----
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
                for (let y = 5; y <= 21; y++) b.set(x, y, z, y % 4 === 0 ? trim : (dx + y) % 2 ? 'cobalt_glass' : 'glass');
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
    b.box(13, 3, 48, 15, 3, 48, 'marble');
    b.box(13, 4, 48, 15, 4, 48, 'stone_bricks_slab');
    b.box(cx, 3, 50, cx, 9, 50, 'gold_block');
    b.box(cx - 1, 7, 50, cx + 1, 7, 50, 'gold_block');
    b.set(13, 5, 48, 'torch');
    b.set(15, 5, 48, 'torch');
    b.sym(() => {
        b.lampPost(10, 3, 46, 'dark_oak_fence');
        b.lampPost(11, 3, 49, 'dark_oak_fence');
    });
}

// A round window in the plane of the wall at z: gold in the middle, then glowing and coloured
// sectors, in a stone ring. Lamps stand in for the stained glass colours the game does not have.
function constructionRose(b, cx, cy, z, radius) {
    for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
            const d = Math.hypot(x - cx, y - cy);
            if (d > radius + 0.4) continue;
            const sector = Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 8;
            let type = 'stone_bricks';
            if (d < 1) type = 'gold_block';
            else if (d < 2.5) type = sector % 2 ? 'neon_lamp' : 'cobalt_glass';
            else if (d < 4.2) type = sector % 2 ? 'cobalt_glass' : 'glass';
            else if (d < 5.4) type = sector % 2 ? 'glass' : 'argon_lamp';
            b.set(x, y, z, type);
        }
    }
}

// One bell tower, on the low x side of the front (b.sym mirrors it). Walls x = 1..7, z = 4..10, a
// solid core and a stair that winds around it, 2 up per side, so it passes over the same corner
// every 8 blocks: that is where the door to each gallery is, and the belfry floor.
function constructionBellTower(b) {
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

    b.set(6, 1, 6, 'torch');
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
        b.set(2, base + 3, 5, 'torch');
        b.stairs(3, base + 3, 5, stair, 'e');
        b.stairs(4, base + 4, 5, stair, 'e');
        b.set(5, base + 4, 5, trim);
        b.set(6, base + 4, 5, trim);
        b.stairs(6, base + 5, 6, stair, 's');
        b.stairs(6, base + 6, 7, stair, 's');
        b.set(6, base + 6, 8, trim);
        b.set(6, base + 6, 9, trim);
        b.set(6, base + 7, 9, 'torch');
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
    for (const [x, z] of [[2, 5], [4, 6], [5, 5]]) b.set(x, belfry + 1, z, 'torch');
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
// A sign's board shows the text before " // " and its reader (the F key) all of it, up to 288 bytes,
// so each one has its Spanish first, whole on the board, and its English after it. It looks the way
// the visitor comes from, and stands on its post out of the way of the route.
function constructionShowroom(b) {
    const colors = FURNITURE_COLORS.map(([color]) => color);
    const wall = (x0, z0, x1, z1, type = 'birch_planks') => b.box(x0, 1, z0, x1, 4, z1, type);
    const skylight = (x0, z0, x1, z1) => b.box(x0, 5, z0, x1, 5, z1, 'glass');
    const sign = (x, z, facing, es, en) => b.set(x, 1, z, shapeStateName('sign', BLOCK_SHAPES.sign, { facing, mount: 'post' }), { t: `${es} // ${en}` });
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
    sign(24, 5, 'n', 'Bienvenido. Sigue la línea amarilla: pasa por todo y vuelve a la salida. F ante un cartel: lo lees entero.',
        'Welcome to the showroom. Follow the yellow line: it goes through everything and back to the exit. Press F at a sign to read all of it.');
    sign(32, 5, 's', 'Salida. /build undo lo quita todo otra vez.', 'Exit. /build undo takes it all away again.');

    // ---- 1. The living room ----
    sign(22, 13, 's', 'SALÓN. Clic derecho en un sofá: te sientas; Agacharse: te levantas. Clic derecho en una cortina: se corre.',
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
    sign(9, 13, 's', 'COMEDOR. Clic derecho en silla, banco o taburete: te sientas. Agacharse: te levantas.',
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
    sign(10, 18, 'e', 'COCINA. Horno: mete comida y carbón, cocina solo. Nevera y congelador van con el generador. Banco: recetas. Barril: guarda.',
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
    sign(10, 28, 'e', 'DORMITORIO. Clic derecho en armario y cofre: guardan cosas. En la cama: te tumbas, y de noche duermes. Mírate en el espejo.',
        'Bedroom. Right click the wardrobe and the chest to store things, the bed to lie down and, at night, sleep. Sneak gets up. Look in the mirror.');
    skylight(4, 30, 8, 30);
    skylight(4, 37, 8, 37);
    b.box(4, 1, 31, 8, 1, 35, 'purple_carpet');
    // Two beds side by side, the head at the wall.
    piece(1, 1, 32, 'bed', 'bed', 'w');
    piece(1, 1, 33, 'bed', 'bed', 'w');
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
    sign(9, 43, 'n', 'BAÑO. Clic derecho en el váter: te sientas. Agacharse: te levantas. La bañera se pisa por dentro. Mírate en el espejo.',
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
    sign(20, 43, 'n', 'ESTUDIO. Clic derecho en la silla: te sientas. En el cofre: guarda cosas. Las estanterías son adorno.',
        'Study. Right click the chair to sit, the chest to store things. The bookshelves are decoration.');
    skylight(12, 45, 19, 45);
    bookshelves(12, 50, 19, 50, 'n');
    piece(15, 1, 47, 'desk', 'desk', 's');
    chair(15, 48, 'dark_oak', 'n');
    b.set(15, 2, 47, 'table_lamp');
    floorLamp(18, 47);
    piece(11, 1, 47, 'chest', 'chest', 'e');

    // ---- 7. The stained glass gallery, with its back to the daylight ----
    sign(22, 43, 'n', 'VIDRIERAS. Los 16 colores, en bloque y en panel, contra el cielo: filtran lo que hay detrás.',
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
    sign(37, 46, 'n', 'Rojo detrás de azul, en bloque y en panel: pasa muy poca luz. Míralo desde aquí, hacia el cielo.',
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
    sign(23, 46, 'n', 'Panel cian ante un espejo: la vidriera filtra también el reflejo.',
        'A cyan pane in front of a mirror: the stained glass filters the reflection too.');
    // A piece under water, seen through the glass side, or from above off the step.
    b.box(24, 1, 43, 27, 2, 46, 'stone_bricks');
    b.box(24, 1, 43, 27, 2, 43, 'glass');
    b.box(25, 1, 46, 26, 2, 46, 'lime_wool');
    b.box(25, 1, 44, 26, 2, 45, 'water');
    b.set(25, 1, 45, 'magenta_stained_glass');
    b.box(24, 1, 42, 27, 1, 42, 'stone_bricks_slab');
    sign(28, 43, 'n', 'Bajo el agua: el bloque magenta del estanque se ve mal, es un defecto conocido. Mira por el cristal y desde el escalón.',
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
        [29, 22, 26, (x, z) => oven(x, z, 's', 'off'), 'Horno: nivel 11 mientras arde. Mete comida y carbón.', 'Oven: level 11 while it burns. Put in food and coal.'],
        [35, 22, 26, () => {}, 'Sin ninguna luz: así de oscuro es.', 'No light at all: this is how dark it is.']
    ];
    for (const [x, z, mouth, place, es, en] of bays) {
        b.box(x - 1, 1, mouth, x + 1, 3, mouth, null);
        const ahead = Math.sign(mouth - z);
        for (let k = -3; k <= 3; k++) b.set(x, 0, z + k * ahead, k % 2 ? 'white_wool' : 'black_wool');
        place(x, z);
        sign(x + 2, mouth - ahead, 'w', es, en);
    }
    sign(38, 40, 's', 'SALA DE LUZ. Oscura aposta: una luz por sala. Las rayas del suelo miden hasta dónde llega. Entra y vuelve por aquí.',
        'Light room. Dark on purpose: one light per bay. The stripes on the floor measure its reach. In and back out through here.');
    b.set(39, 1, 38, 'candle');

    // ---- 9. Joins: what joins and what does not ----
    sign(41, 43, 'n', 'UNIONES. Sofás del mismo color se unen; rojo y azul no. Banco igual, si mira igual. Las mesas se unen en fila.',
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
    sign(54, 18, 'w', 'ESPEJOS. Refleja de verdad hasta 14 bloques: aléjate hasta aquí y es solo textura. Hay cubos y dos paredes.',
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
    sign(46, 16, 'w', 'ALMACÉN, vacío. Cofre, barril y armario: guarda algo y que otro jugador lo vea moverse. Lo de dentro vive en el servidor.',
        'Storage, empty. Chest, barrel, wardrobe: store something and have another player watch it move. Contents live on the server.');
    skylight(50, 15, 53, 15);
    piece(47, 1, 16, 'chest', 'chest', 'n');
    b.set(48, 1, 16, 'barrel');
    tall(49, 16, 'wardrobe', 'n');
    lantern(47, 4, 14);

    // ---- 12. The sample wall: every curtain and every carpet ----
    sign(34, 4, 's', 'MUESTRAS. Las 16 cortinas (clic derecho: se corren, cada una por su cuenta) y las 16 alfombras, para pisarlas.',
        'Samples. The 16 curtains (right click draws each one by itself) and the 16 carpets, to walk on.');
    skylight(36, 9, 53, 9);
    colors.forEach((color, i) => {
        for (let y = 1; y <= 3; y++) curtain(36 + i, y, 4, color, 's');
        b.box(36 + i, 1, 6, 36 + i, 1, 7, `${color}_carpet`);
    });

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
            { name: 'by the hearth', at: [8, 1, 10] }
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
            { name: 'behind a stall', at: [8, 1, 9] }
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
    return { ...design, name, cells: Array.from(builder.cells.values()) };
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
    return {
        min,
        size,
        foundation: plan.foundation,
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
    const wanted = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    layout.cells.forEach((cell) => wanted.set(key(cell.x, cell.y, cell.z), cell));
    const ops = [];
    const change = (x, y, z, type, meta, current) => {
        const def = current.type && blockTypes[current.type];
        if (def && def.unbreakable) return;
        if (current.type === type && !meta) return;
        ops.push({ x, y, z, type, meta, prev: current });
    };
    const { min, size } = layout;
    for (let x = min.x; x < min.x + size[0]; x++) {
        for (let z = min.z; z < min.z + size[2]; z++) {
            // The volume: what the plan says, air everywhere else.
            for (let y = min.y + 1; y < min.y + size[1]; y++) {
                const cell = wanted.get(key(x, y, z));
                change(x, y, z, cell ? cell.type : null, cell && cell.meta, read(x, y, z));
            }
            // The floor layer: what the plan says, or the ground if there is some.
            const floor = wanted.get(key(x, min.y, z));
            const current = read(x, min.y, z);
            if (floor) change(x, min.y, z, floor.type, floor.meta, current);
            else if (!constructionIsGround(current.type, blockTypes)) change(x, min.y, z, layout.foundation, undefined, current);
            // The foundation, down to the terrain.
            for (let y = min.y - 1; y >= WORLD_MIN_Y; y--) {
                const below = read(x, y, z);
                if (constructionIsGround(below.type, blockTypes)) break;
                change(x, y, z, layout.foundation, undefined, below);
            }
        }
    }
    return constructionOrder(ops);
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
        else if (CONSTRUCTION_DESIGNS[what] && Object.prototype.hasOwnProperty.call(CONSTRUCTION_DESIGNS, what)) this.constructionStart(what);
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
        if (!this.constructionJob && !this.constructionWaiting) return false;
        this.receiveSystemMessage({ text: 'Still building: wait for it, or /build stop' });
        return true;
    },

    constructionStart(name) {
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
        this.constructionWaiting = { plan, turns, anchor, fromY, min, size, waited: 0, told: false };
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

    // Once every chunk is here: read the ground and what is there, and start placing.
    constructionTryBegin() {
        const waiting = this.constructionWaiting;
        const missing = this.constructionMissingChunks(waiting);
        if (missing.length) {
            if (!waiting.told) {
                waiting.told = true;
                this.receiveSystemMessage({ text: `${waiting.plan.label}: waiting for ${missing.length} chunks to load...` });
            }
            return;
        }
        this.constructionWaiting = null;
        const blockTypes = this.world.blockTypes;
        const readType = (x, y, z) => this.world.getBlockTypeAt(x, y, z);
        const baseY = constructionFindGround(readType, waiting.anchor.x, waiting.anchor.z, waiting.fromY, blockTypes);
        if (baseY === null || baseY + waiting.size[1] > WORLD_MAX_Y) {
            this.receiveSystemMessage({ text: `${waiting.plan.label}: it does not fit here` });
            return;
        }
        const layout = constructionLayout(waiting.plan, waiting.turns, waiting.anchor, baseY, blockTypes);
        const ops = constructionDiff(layout, (x, y, z) => this.constructionRead(x, y, z), blockTypes);
        // Only the last build can be undone; it grows as blocks go out.
        this.constructionUndo = { label: waiting.plan.label, applied: [] };
        this.constructionJob = { label: waiting.plan.label, verb: 'Building', ops, done: 0, credit: 0, nextReport: 0.2, undoing: false };
        this.receiveSystemMessage({ text: `Building ${waiting.plan.label}: ${ops.length} block changes...` });
    },

    constructionStartUndo() {
        if (this.constructionBusy()) return;
        const undo = this.constructionUndo;
        if (!undo || !undo.applied.length) {
            this.receiveSystemMessage({ text: 'Nothing to undo' });
            return;
        }
        const ops = constructionUndoOps(undo.applied);
        this.constructionJob = { label: undo.label, verb: 'Undoing', ops, done: 0, credit: 0, nextReport: 0.2, undoing: true };
        this.constructionUndo = null;
        this.receiveSystemMessage({ text: `Undoing ${undo.label}: ${ops.length} block changes...` });
    },

    constructionStop() {
        if (this.constructionWaiting) {
            this.constructionWaiting = null;
            this.receiveSystemMessage({ text: 'Build cancelled' });
            return;
        }
        const job = this.constructionJob;
        if (!job) {
            this.receiveSystemMessage({ text: 'Nothing is being built' });
            return;
        }
        this.constructionJob = null;
        // An undo stopped half way can still be finished: what it has not put back stays undoable.
        if (job.undoing) {
            const left = job.ops.slice(job.done).map((op) => ({ ...op, type: op.prev.type, meta: op.prev.meta, prev: { type: op.type, meta: op.meta } }));
            this.constructionUndo = left.length ? { label: job.label, applied: left } : null;
        }
        this.receiveSystemMessage({ text: `Stopped after ${job.done} of ${job.ops.length} block changes${job.undoing ? '' : '. /build undo takes them back'}` });
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
            this.constructionJob = null;
            this.constructionWaiting = null;
            return;
        }
        if (this.constructionWaiting) {
            this.constructionWaiting.waited += delta;
            this.constructionTryBegin();
            if (this.constructionWaiting && this.constructionWaiting.waited > CONSTRUCTION_CHUNK_WAIT) {
                const { label } = this.constructionWaiting.plan;
                this.constructionWaiting = null;
                this.receiveSystemMessage({ text: `${label}: those chunks did not load in time. Come closer, or raise the render distance, and try again` });
            }
        }
        const job = this.constructionJob;
        if (!job) return;
        // Nothing is lost while the connection is down or backed up: the blocks just wait.
        const socket = this.network && this.network.ws;
        if (!this.network || !this.network.connected) return;
        if (socket && socket.bufferedAmount > CONSTRUCTION_BACKLOG_BYTES) return;

        job.credit = Math.min(CONSTRUCTION_FRAME_MAX, job.credit + delta * CONSTRUCTION_RATE);
        while (job.credit >= 1 && job.done < job.ops.length) {
            job.credit -= 1;
            const op = job.ops[job.done++];
            this.constructionApply(op);
            if (!job.undoing && this.constructionUndo) this.constructionUndo.applied.push(op);
        }
        if (job.done >= job.ops.length) {
            this.constructionJob = null;
            this.receiveSystemMessage({
                text: job.undoing
                    ? `${job.label}: undone, ${job.done} blocks put back`
                    : `${job.label} finished: ${job.done} block changes. /build undo puts back what it replaced`
            });
            return;
        }
        const progress = job.done / job.ops.length;
        if (progress >= job.nextReport) {
            job.nextReport += 0.2;
            this.receiveSystemMessage({ text: `${job.verb} ${job.label}: ${Math.round(progress * 100)} % (${job.done} / ${job.ops.length})` });
        }
    }
});

registerFrameUpdate(function (delta) {
    if (this.constructionJob || this.constructionWaiting) this.constructionUpdate(delta);
});
