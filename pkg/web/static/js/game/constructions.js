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
// tests) and generate(b, size). Only what is drawn is built: the rest of the box becomes air, and
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
        if (type === 'sign') return { type, meta: { t: this.world.getSignTextAt(x, y, z) } };
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
        else if (op.type === 'sign') payload.text = meta.t || '';
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
