// Node tests for /build library (js/game/construction_library.js): what the library has to hold, its
// rotation, that every room and gallery can be walked to with the real camera rules and that no walk
// ends in a fall, the light at night, the dome, the shelves, the signs and the command.
// Run with: node --test test/js/construction_library.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js');

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
}
class Stub { constructor() { this.attributes = {}; } setAttribute() {} addGroup() {} setIndex() {} computeBoundingBox() {} computeBoundingSphere() {} }

function loadGame() {
    const context = vm.createContext({
        console, Math, Map, Set, Object, Array, Uint8Array, Uint16Array, Int16Array, Int32Array, Float32Array,
        performance: { now: () => 0 },
        THREE: { Vector3, Vector4: Vector3, BoxGeometry: Stub, BufferGeometry: Stub, Float32BufferAttribute: Stub },
        Worker: class { postMessage() {} },
        document: { addEventListener() {} },
        requestAnimationFrame: () => 0
    });
    context.window = context;
    for (const file of ['extensions.js', 'chunkStore.js', 'blockShapes.js', 'chunkMesher.js', 'camera.js', 'mobSpecies.js', 'blockTextures.js', 'world.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, file), 'utf8'), context, { filename: file });
    }
    vm.runInContext('class Game {}; function resourcesDrawSprite() { return () => {}; } function resourcesDisplayMesh() { return null; }', context);
    for (const file of ['joinery.js', 'chemistry.js', 'electricity.js', 'blueprints.js', 'constructions.js', 'furniture.js', 'seating.js', 'storage.js', 'decor.js', 'mirrors.js', 'construction_library.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    }
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, CameraController, BLOCK_SHAPES, Game, CONSTRUCTION_DESIGNS, constructionPlan, constructionLayout,
        SHAPE_DIRECTIONS, FURNITURE_COLORS, seatStandOffsets, LIBRARY_FLOORS, LIBRARY_ROOF, LIBRARY_DOME, LIBRARY_COLUMNS_X, LIBRARY_COLUMNS_Z });`, context);
    return context;
}

const ctx = loadGame();
const FACINGS = ['n', 'e', 's', 'w'];
// The local 's' of a design turns to these with 0, 1, 2 and 3 quarter turns.
const LOOK_BY_TURNS = ['s', 'w', 'n', 'e'];
const TURNS = [0, 1, 2, 3];
const DIRECTIONS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const ANCHOR = { x: 3, z: -5 };

function makeWorld(radius = 6, center = [0, 0]) {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    world.getChunkMaterial = (type) => `material:${type}`;
    const stone = world.registry.id('stone');
    for (let cx = center[0] - radius; cx <= center[0] + radius; cx++) {
        for (let cz = center[1] - radius; cz <= center[1] + radius; cz++) {
            const column = new ctx.ChunkColumn(cx, cz);
            for (let lx = 0; lx < 16; lx++) {
                for (let lz = 0; lz < 16; lz++) {
                    for (let y = -4; y <= 0; y++) column.set(lx, y, lz, stone);
                }
            }
            world.columns.set(world.chunkKey(cx, cz), column);
        }
    }
    return world;
}

const blocks = makeWorld(0);
const defOf = (type) => blocks.blockTypes[type];
const baseOf = (type) => defOf(type).variantOf || type;
const stateOf = (type) => defOf(type).state || {};
const idOf = (type) => blocks.registry.id(type || 'air');
const PLAN = ctx.constructionPlan('library');
const COLORS = ctx.FURNITURE_COLORS.map(([color]) => color);

// The plan turned: cells in the plan's order, and a map to read them by position.
function turned(turns) {
    const layout = ctx.constructionLayout(PLAN, turns, ANCHOR, 0, blocks.blockTypes);
    const grid = new Map(layout.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
    return { layout, typeAt: (x, y, z) => grid.get(`${x},${y},${z}`) };
}

// Local (x, y, z) in the world, as the box turns.
function worldAt(turns, [x, y, z]) {
    const [fx, fz] = ctx.SHAPE_DIRECTIONS[LOOK_BY_TURNS[turns]];
    const across = x - PLAN.anchorX;
    return [ANCHOR.x + fx * z + fz * across, y, ANCHOR.z + fz * z - fx * across];
}

// The plan in the world as a visitor finds it: doors open, as they would open them.
function placeOpen(world, cells) {
    for (const cell of cells) {
        const def = world.blockTypes[cell.type];
        let type = cell.type;
        if (def.state && def.state.open && def.shape !== 'trapdoor') {
            type = world.getShapeStateType(def.variantOf || type, { ...def.state, open: 'open' });
        }
        world.setEditedBlock(cell.x, cell.y, cell.z, type);
    }
}

// Everywhere a player can get by walking, with no jumping: a flood fill over points a quarter block
// apart, closer than anything thin (a pane or a rail stops it, where the half block fill of
// constructions.test.js steps across them). A move is the one in CameraController: straight on at
// this height if the body fits, dropping to what is underneath; otherwise only a step up of at most
// stepHeight onto a surface with room for the body, not a whole block as that fill allows. `falls`
// lists the moves that drop further than off the tallest furniture: a fall, which a railing should stop.
function walkable(world, startX, startFeet, startZ, min, max) {
    const camera = { position: new Vector3(0, 0, 0), rotation: {} };
    const player = new ctx.CameraController(camera, { addEventListener() {} });
    // Worlds are not edited during a walk, and each cell gets asked many times.
    const cache = new Map();
    player.setCollisionBoxGetter((x, y, z) => {
        const key = (((x + 512) * 1024 + (z + 512)) * 512) + y + 64;
        let boxes = cache.get(key);
        if (!boxes) {
            boxes = world.getCollisionBoxes(x, y, z);
            cache.set(key, boxes);
        }
        return boxes;
    });
    const seen = new Set();
    const key = (x, z, feet) => `${x},${z},${feet}`;
    const queue = [[startX + 0.25, startZ + 0.25, startFeet]];
    const falls = [];
    seen.add(key(...queue[0]));
    assert.ok(player.canStandAt(queue[0][0], queue[0][1], startFeet), 'the start is free');
    for (let head = 0; head < queue.length; head++) {
        const [x, z, feet] = queue[head];
        for (const [dx, dz] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
            const nx = x + dx;
            const nz = z + dz;
            if (nx < min[0] - 1 || nx > max[0] + 2 || nz < min[1] - 1 || nz > max[1] + 2) continue;
            let floor;
            if (player.canStandAt(nx, nz, feet)) {
                floor = player.getSupportFloorY(nx, nz, feet);
                if (floor < -8) continue;
                if (feet - floor > 1.5) falls.push([nx, feet, nz, floor]);
            } else {
                const lifted = feet + player.stepHeight;
                if (!player.canStandAt(nx, nz, lifted)) continue;
                floor = player.getSupportFloorY(nx, nz, lifted);
                if (floor <= feet + 0.001 || floor > lifted + 0.001 || !player.canStandAt(nx, nz, floor)) continue;
            }
            const k = key(nx, nz, floor);
            if (seen.has(k)) continue;
            seen.add(k);
            queue.push([nx, nz, floor]);
        }
    }
    return { reached: queue, falls };
}

// Each turn, placed and walked once: the next tests read it.
const walks = new Map();
function walk(turns) {
    if (!walks.has(turns)) {
        const { layout } = turned(turns);
        const world = makeWorld(6);
        placeOpen(world, layout.cells);
        const [sx, sy, sz] = worldAt(turns, PLAN.start);
        const min = [layout.min.x, layout.min.z];
        const max = [layout.min.x + layout.size[0] - 1, layout.min.z + layout.size[2] - 1];
        const { reached, falls } = walkable(world, sx, sy, sz, min, max);
        const cells = new Set(reached.map(([x, z, feet]) => `${Math.floor(x)},${Math.floor(feet)},${Math.floor(z)}`));
        walks.set(turns, { layout, world, reached, falls, cells });
    }
    return walks.get(turns);
}

test('registered: its blocks exist, the size asked for, and it is what the plan draws', () => {
    assert.ok(ctx.CONSTRUCTION_DESIGNS.library);
    const [w, h, d] = PLAN.size;
    assert.ok(w >= 40 && w <= 50 && d >= 55 && d <= 65 && h >= 40, `${w} x ${d}, ${h} high`);
    const seen = new Set();
    for (const cell of PLAN.cells) {
        assert.ok(cell.x >= 0 && cell.x < w && cell.y >= 0 && cell.y < h && cell.z >= 0 && cell.z < d);
        seen.add(cell.type);
    }
    seen.add(PLAN.foundation);
    for (const type of seen) {
        const def = blocks.blockTypes[type];
        assert.ok(def, `${type} is not a block`);
        assert.ok(blocks.registry.ids[type] !== undefined, `${type} is not a world block`);
        assert.ok(!def.itemOnly, `${type} is an item`);
    }
    assert.ok(PLAN.cells.length <= 40000, `${PLAN.cells.length} blocks: over 3 minutes at the builder's rate`);
});

test('it holds what was asked for', () => {
    const placed = new Map();
    for (const cell of PLAN.cells) placed.set(baseOf(cell.type), (placed.get(baseOf(cell.type)) || 0) + 1);
    for (const [type, least] of Object.entries({
        table: 40, desk: 30, dark_oak_chair: 60, table_lamp: 20, floor_lamp: 40, chandelier: 10, candle: 5, lantern: 20,
        bench: 8, flower_pot: 8, mirror: 40, wall_clock: 5, chest: 40, barrel: 40, painting_fish: 4, painting_night: 4,
        neon_lamp: 10, argon_lamp: 10, marble: 500, limestone: 500, iron_bars: 100
    })) {
        assert.ok((placed.get(type) || 0) >= least, `${type}: ${placed.get(type)}, wanted ${least}`);
    }
    for (const kind of ['carpet', 'sofa', 'curtain']) {
        assert.ok([...placed.keys()].filter((type) => type.endsWith(`_${kind}`)).length >= 3, kind);
    }
    // No power: nothing electric, and the lights all give their light by themselves.
    for (const type of placed.keys()) assert.ok(!defOf(type).electric, type);
    // No beds, and nothing with storage in it: a build only places blocks.
    assert.ok(!placed.has('bed'));
    for (const cell of PLAN.cells) {
        if (defOf(cell.type).storageSlots) assert.equal(cell.meta, undefined);
        if (baseOf(cell.type) === 'oven') assert.equal(stateOf(cell.type).fire, 'off');
    }
    // A globe of blocks: a ball of wool on a gold foot in the map room, and room to walk round it.
    const at = (x, y, z) => PLAN.cells.find((cell) => cell.x === x && cell.y === y && cell.z === z);
    assert.equal(at(22, 5, 54).type, 'gold_block');
    assert.match(at(22, 8, 54).type, /_wool$/);
    for (const type of ['blue_wool', 'green_wool', 'white_wool']) {
        assert.ok(PLAN.cells.some((cell) => cell.type === type && cell.y >= 6 && cell.y <= 10), type);
    }
    // The pool and the wall of mirrors in the hall, the mirror under the dome.
    const mirrors = PLAN.cells.filter((cell) => cell.type === 'mirror');
    assert.ok(mirrors.some((cell) => cell.y === 4 && cell.z <= 20));
    assert.ok(mirrors.some((cell) => cell.y > 5 && cell.x === 7));
    assert.ok(mirrors.some((cell) => cell.y === 4 && cell.z === 36));
});

test('the box loads from anywhere the player can stand, at the default render distance', () => {
    assert.equal(makeWorld(0).renderDistance, 4);
    // The player in each corner of a chunk, looking each way: every chunk of the box is one the game
    // keeps loaded around them, so the builder need not wait.
    for (const [look, turns] of [[{ x: 0, z: 1 }, 0], [{ x: -1, z: 0 }, 1], [{ x: 0, z: -1 }, 2], [{ x: 1, z: 0 }, 3]]) {
        for (const [ox, oz] of [[0, 0], [15, 0], [0, 15], [15, 15]]) {
            const [fx, fz] = ctx.SHAPE_DIRECTIONS[LOOK_BY_TURNS[turns]];
            const layout = ctx.constructionLayout(PLAN, turns, { x: ox + fx * 3, z: oz + fz * 3 }, 0, blocks.blockTypes);
            const [minX, minZ] = [layout.min.x, layout.min.z];
            const [maxX, maxZ] = [minX + layout.size[0] - 1, minZ + layout.size[2] - 1];
            for (const [low, high] of [[minX, maxX], [minZ, maxZ]]) {
                assert.ok(Math.floor(low / 16) >= -4 && Math.floor(high / 16) <= 4, `turn ${turns} from ${ox},${oz}: ${low}..${high}`);
            }
        }
        // And in the game itself, with only those chunks there, it starts at once.
        const world = makeWorld(4);
        const { game } = makeGame(world, { look, at: { x: 15.5, y: 2.62, z: 15.5 } });
        game.constructionCommand('build', ['library']);
        assert.ok(game.constructionJob && !game.constructionWaiting, `waits when it turns ${turns}`);
    }
});

test('it turns whole in all 4 directions: footprint, doors, stairs, facing', () => {
    const [w, h, d] = PLAN.size;
    for (const turns of TURNS) {
        const { layout, typeAt } = turned(turns);
        assert.deepEqual([...layout.size], turns % 2 ? [d, h, w] : [w, h, d]);
        const counts = { door: 0, stairs: 0, facing: 0 };
        PLAN.cells.forEach((source, i) => {
            const cell = layout.cells[i];
            const [x, y, z] = worldAt(turns, [source.x, source.y, source.z]);
            assert.deepEqual([cell.x, cell.y, cell.z], [x, y, z]);
            const before = stateOf(source.type);
            if (before.facing && before.facing !== 'all') {
                const after = stateOf(cell.type);
                assert.equal(after.facing, FACINGS[(FACINGS.indexOf(before.facing) + turns) % 4], cell.type);
                assert.equal(baseOf(cell.type), baseOf(source.type));
                for (const key of ['half', 'hinge', 'open', 'drawn']) assert.equal(after[key], before[key]);
                counts.facing++;
                if (defOf(cell.type).shape === 'stairs') counts.stairs++;
                if (defOf(cell.type).shape === 'door') {
                    counts.door++;
                    const other = typeAt(cell.x, cell.y + (after.half === 'lower' ? 1 : -1), cell.z);
                    assert.equal(defOf(other).shape, 'door', 'half a door');
                }
            } else {
                assert.equal(cell.type, source.type);
            }
        });
        assert.ok(counts.door >= 8 && counts.stairs > 200 && counts.facing > 2000, JSON.stringify(counts));
    }
    // The front door faces the player, who walks in looking the way it does.
    const doors = PLAN.cells.filter((cell) => defOf(cell.type).shape === 'door');
    const front = doors.filter((cell) => cell.z === Math.min(...doors.map((door) => door.z)));
    assert.equal(front.length, 8);
    for (const door of front) assert.equal(stateOf(door.type).facing, 's');
});

test('wall items have a wall behind, hanging items something above, two-high pieces both halves, in all 4 turns', () => {
    const wallShapes = new Set(['painting', 'wall_mirror', 'wall_clock', 'wall_shelf', 'curtain']);
    for (const turns of TURNS) {
        const { layout, typeAt } = turned(turns);
        const solidAt = (x, y, z) => {
            const type = typeAt(x, y, z);
            return Boolean(type) && blocks.registry.solid[idOf(type)] === 1;
        };
        const counts = { wall: 0, hanging: 0, linked: 0 };
        for (const cell of layout.cells) {
            const def = defOf(cell.type);
            const state = stateOf(cell.type);
            const where = `${cell.type} at ${cell.x},${cell.y},${cell.z}, turned ${turns}`;
            if (wallShapes.has(def.shape)) {
                const [dx, dz] = DIRECTIONS[state.facing];
                assert.ok(solidAt(cell.x - dx, cell.y, cell.z - dz), `no wall behind ${where}`);
                counts.wall++;
            }
            if (def.shape === 'chandelier' || state.mount === 'hanging') {
                assert.ok(solidAt(cell.x, cell.y + 1, cell.z), `nothing above ${where}`);
                counts.hanging++;
            }
            const shape = def.shape && ctx.BLOCK_SHAPES[def.shape];
            if (shape && shape.linked && def.shape !== 'door') {
                for (const [dx, dy, dz] of shape.linked(state)) {
                    const other = typeAt(cell.x + dx, cell.y + dy, cell.z + dz);
                    assert.ok(other && baseOf(other) === baseOf(cell.type), `incomplete: ${where}`);
                    assert.notEqual(stateOf(other).half, state.half, where);
                }
                counts.linked++;
            }
        }
        assert.ok(counts.wall > 300 && counts.hanging > 20 && counts.linked > 80, JSON.stringify(counts));
    }
});

test('every room and gallery can be walked to from the door without a jump, in all 4 turns', () => {
    for (const turns of TURNS) {
        const { cells } = walk(turns);
        for (const level of PLAN.levels) {
            assert.ok(cells.has(worldAt(turns, level.at).join(',')), `turned ${turns}: cannot reach ${level.name} (${level.at})`);
        }
    }
    // And no way round the door: the walls and windows hold, with the leaves shut it stays outside.
    const world = makeWorld(6);
    for (const cell of PLAN.cells) world.setEditedBlock(cell.x, cell.y, cell.z, cell.type);
    const outside = walkable(world, ...PLAN.start, [-1, -1], [PLAN.size[0], PLAN.size[2]]);
    assert.ok(!outside.reached.some(([x, z, feet]) => z > 16 && z < 58 && x > 2 && x < 42 && feet > 4), 'in without opening the door');
});

test('there is nowhere to fall: railings wherever a floor ends, in all 4 turns', () => {
    for (const turns of TURNS) {
        const { falls } = walk(turns);
        assert.deepEqual(falls.slice(0, 8), [], `turned ${turns}`);
    }
    // The gallery edges themselves, on each upper floor: a rail or a column all the way round.
    const grid = new Map(PLAN.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
    const [, first, second, third] = ctx.LIBRARY_FLOORS;
    for (const floor of [first, second, third]) {
        const check = (x, z) => {
            if (floor === first && z === 47 && x >= 19 && x <= 25) return; // the grand stair arrives here
            const type = grid.get(`${x},${floor + 1},${z}`);
            assert.ok(type === 'iron_bars' || type === 'marble', `no railing at ${x},${floor + 1},${z}: ${type}`);
        };
        for (let k = 11; k <= 33; k++) {
            check(k, 25);
            check(k, 47);
        }
        for (let k = 25; k <= 47; k++) {
            check(11, k);
            check(33, k);
        }
    }
});

test('storeys, stairs: three or more galleries, a grand stair and a spiral between all of them', () => {
    const { reached } = walk(0);
    const heights = new Set(reached.map(([, , feet]) => feet));
    for (const floor of ctx.LIBRARY_FLOORS) assert.ok(heights.has(floor + 1), `nobody walks at ${floor + 1}`);
    // The spiral alone climbs from the ground to the roof: with its door at each floor bricked up
    // but the first and the last, a visitor reaches the roof through the corner.
    const world = makeWorld(6);
    placeOpen(world, PLAN.cells);
    const [, first, second, third] = ctx.LIBRARY_FLOORS;
    for (const floor of [first, second, third]) {
        for (const y of [floor + 1, floor + 2]) world.setEditedBlock(7, y, 58, 'stone');
    }
    // The grand stair cut at its foot, so that only the spiral goes up.
    for (let x = 19; x <= 25; x++) {
        for (const y of [5, 6]) world.setEditedBlock(x, y, 39, 'stone');
    }
    const { reached: spiral } = walkable(world, ...PLAN.start, [-1, -1], [PLAN.size[0], PLAN.size[2]]);
    assert.ok(!spiral.some(([x, z, feet]) => feet === second + 1 && x > 8), 'there is another way up');
    assert.ok(spiral.some(([x, z, feet]) => feet === ctx.LIBRARY_ROOF + 1 && x > 8), 'the spiral does not reach the roof');
});

test('seats have room for the head, somewhere to get up to, and what opens can be reached', () => {
    const { layout, world, reached } = walk(0);
    const columns = new Set(reached.map(([x, z, feet]) => `${Math.floor(x)},${Math.floor(feet)},${Math.floor(z)}`));
    for (const cell of layout.cells) {
        const def = defOf(cell.type);
        const where = `${cell.type} at ${cell.x},${cell.y},${cell.z}`;
        if (def.seat) {
            assert.ok(!world.registry.fullCube[world.getBlockId(cell.x, cell.y + 1, cell.z)], `no room to sit on ${where}`);
            const stands = ctx.seatStandOffsets(stateOf(cell.type).facing || 'n').some(([dx, dz]) => columns.has(`${cell.x + dx},${cell.y},${cell.z + dz}`));
            assert.ok(stands, `nowhere to stand up from ${where}`);
        }
        if (def.storageSlots) {
            let near = false;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                for (const dy of [0, -1]) near = near || columns.has(`${cell.x + dx},${cell.y + dy},${cell.z + dz}`);
            }
            assert.ok(near, `cannot reach ${where}`);
        }
    }
});

test('lit at night, all of the inside, by what needs no power', () => {
    for (const turns of [0, 1]) {
        const { world, reached, layout } = walk(turns);
        // As in chunkMesher.js: one level less per block, stopped by full cubes.
        const levels = new Map();
        const queue = [];
        const put = (x, y, z, level) => {
            levels.set(`${x},${y},${z}`, level);
            queue.push([x, y, z, level]);
        };
        for (const cell of layout.cells) {
            const level = world.registry.lightLevel[world.registry.id(cell.type)];
            if (level) put(cell.x, cell.y, cell.z, level);
        }
        for (let head = 0; head < queue.length; head++) {
            const [x, y, z, level] = queue[head];
            if (level <= 1) continue;
            for (const [sx, sy, sz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
                const nx = x + sx, ny = y + sy, nz = z + sz;
                if ((levels.get(`${nx},${ny},${nz}`) || 0) >= level - 1) continue;
                if (world.registry.fullCube[world.getBlockId(nx, ny, nz)]) continue;
                put(nx, ny, nz, level - 1);
            }
        }
        // Inside the outer walls, under the roof.
        const [ax, , az] = worldAt(turns, [2, 0, 16]);
        const [bx, , bz] = worldAt(turns, [42, 0, 58]);
        const [x0, x1, z0, z1] = [Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz)];
        const dark = new Set();
        for (const [fx, fz, feet] of reached) {
            const x = Math.floor(fx), y = Math.floor(feet), z = Math.floor(fz);
            if (x < x0 || x > x1 || z < z0 || z > z1 || y > ctx.LIBRARY_ROOF) continue;
            if ((levels.get(`${x},${y},${z}`) || 0) < 6) dark.add(`${x},${y},${z}`);
        }
        assert.deepEqual([...dark].slice(0, 40), [], `dark at night, turned ${turns} (${dark.size} cells)`);
    }
});

test('the dome: closed, in all 16 colours, an eight-fold pattern on gold ribs, and it lets the sky in', () => {
    const { x: cx, z: cz, base, radius, height } = ctx.LIBRARY_DOME;
    const dome = PLAN.cells.filter((cell) => cell.y >= base);
    const glass = dome.filter((cell) => /_stained_glass$/.test(cell.type));
    assert.ok(glass.length > 500, `${glass.length} panes of it`);
    for (const color of COLORS) assert.ok(glass.some((cell) => cell.type === `${color}_stained_glass`), color);
    // Nothing but glass and its gold, and it covers the whole atrium opening: closed from every column.
    const ribs = dome.filter((cell) => cell.type === 'gold_block');
    assert.ok(ribs.length > 60 && ribs.length < glass.length / 4, `${ribs.length} ribs`);
    const grid = new Map(PLAN.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
    for (let x = 12; x <= 32; x++) {
        for (let z = 26; z <= 46; z++) {
            if (Math.hypot(x - cx, z - cz) > radius - 1) continue;
            let above = false;
            for (let y = base; y <= base + height + 2 && !above; y++) above = grid.has(`${x},${y},${z}`) && !/_fence$/.test(grid.get(`${x},${y},${z}`));
            assert.ok(above, `a hole in the dome over ${x},${z}`);
        }
    }
    // Eight-fold: the same glass at the same height a quarter turn on, away from the 16-colour rim.
    const isRim = (cell) => Math.atan2(Math.hypot(cell.x - cx, cell.z - cz), (cell.y - base) * (radius / height)) / (Math.PI / 2) >= 0.76;
    for (const cell of glass.filter((cell) => !isRim(cell) && /red|magenta|orange|yellow/.test(cell.type))) {
        const other = grid.get(`${cx - (cell.z - cz)},${cell.y},${cz + (cell.x - cx)}`);
        assert.ok(/_stained_glass$|gold_block/.test(other || ''), `${cell.x},${cell.y},${cell.z}`);
    }

    // As ChunkMesher.blocksSky: glass does not stop the sky, so under it the atrium is as bright as outdoors.
    const { world } = walk(0);
    const reg = world.registry;
    const stops = (id) => id !== 0 && reg.solid[id] === 1 && reg.transparent[id] === 0;
    for (const color of COLORS) {
        assert.ok(!stops(reg.id(`${color}_stained_glass`)), color);
        assert.ok(defOf(`${color}_stained_glass`).filterGlass);
    }
    assert.ok(stops(reg.id('gold_block')));
    // The floor of the atrium has open sky over nearly all of it, through the glass and past the ribs.
    let open = 0;
    let total = 0;
    for (let x = 14; x <= 30; x++) {
        for (let z = 28; z <= 44; z++) {
            const [wx, , wz] = worldAt(0, [x, 0, z]);
            let blocked = false;
            for (let y = ctx.LIBRARY_FLOORS[1]; y <= 60 && !blocked; y++) blocked = stops(world.getBlockId(wx, y, wz));
            total++;
            if (!blocked) open++;
        }
    }
    assert.ok(open / total > 0.75, `${open} of ${total} columns see the sky`);
    // As ChunkMesher.skyAt: the sky reaches 3 columns sideways, so the walks of all the galleries get
    // it from the atrium, and the top floor's side rooms from their skylights.
    const topOf = (x, z) => {
        const [wx, , wz] = worldAt(0, [x, 0, z]);
        for (let y = 60; y > -4; y--) {
            if (stops(world.getBlockId(wx, y, wz))) return y;
        }
        return -4;
    };
    const skyAt = (x, y, z) => {
        let sky = y > topOf(x, z) ? 1 : Math.max(0, 1 - (topOf(x, z) - y) / 4);
        for (let dz = -3; dz <= 3; dz++) {
            for (let dx = -3; dx <= 3; dx++) {
                if (y > topOf(x + dx, z + dz)) sky = Math.max(sky, 1 - Math.max(Math.abs(dx), Math.abs(dz)) * 0.22);
            }
        }
        return sky;
    };
    assert.ok(skyAt(15, 5, 30) > 0.9, 'the reading room');
    for (const floor of ctx.LIBRARY_FLOORS.slice(1)) {
        for (const [x, z] of [[9, 36], [35, 36], [22, 23], [28, 49]]) assert.ok(skyAt(x, floor + 1, z) > 0.3, `the walk at ${x},${floor + 1},${z}`);
    }
    assert.ok(skyAt(4, ctx.LIBRARY_FLOORS[3] + 1, 29) > 0.9, 'a room under a skylight');
});

test('the shelves: one layer, every front in the open, a wall behind, and a count that stays low', () => {
    for (const turns of TURNS) {
        const { layout, typeAt } = turned(turns);
        let count = 0;
        for (const cell of layout.cells) {
            if (baseOf(cell.type) !== 'bookshelf') continue;
            count++;
            const where = `${cell.type} at ${cell.x},${cell.y},${cell.z}, turned ${turns}`;
            const { facing } = stateOf(cell.type);
            assert.ok(FACINGS.includes(facing), `it faces the room: ${where}`);
            const [dx, dz] = DIRECTIONS[facing];
            const front = typeAt(cell.x + dx, cell.y, cell.z + dz);
            assert.ok(!front || !blocks.registry.fullCube[idOf(front)], `its front is blocked: ${where}`);
            assert.ok(!front || baseOf(front) !== 'bookshelf', `a shelf in front of a shelf: ${where}`);
            const back = typeAt(cell.x - dx, cell.y, cell.z - dz);
            assert.ok(!back || baseOf(back) !== 'bookshelf', `a shelf behind a shelf: ${where}`);
        }
        assert.ok(count >= 1500 && count <= 2500, `${count} bookshelves`);
    }
    // The walls of the atrium are books: each storey's walk has shelves on its wall from floor to ceiling.
    const grid = new Map(PLAN.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
    for (const floor of ctx.LIBRARY_FLOORS.slice(1)) {
        for (let y = floor + 1; y <= floor + 7; y++) {
            for (const [x, z] of [[8, 28], [36, 28], [28, 22], [28, 50]]) assert.equal(baseOf(grid.get(`${x},${y},${z}`)), 'bookshelf', `${x},${y},${z}`);
        }
    }
});

test('the signs: Spanish first, short, whole on the board, inside the limit', () => {
    const signs = PLAN.cells.filter((cell) => baseOf(cell.type) === 'sign');
    assert.ok(signs.length >= 10);
    const world = makeWorld(6);
    placeOpen(world, PLAN.cells);
    // About what Arial Bold measures, letter by letter, in ems: on the wide side, not to fool anyone.
    const em = (letter) => (/[A-ZÁÉÍÓÚÑ]/.test(letter) ? 0.74 : /[mw]/.test(letter) ? 0.9 : /[.,:;il' ]/.test(letter) ? 0.3 : 0.6);
    const measureAt = (font) => (line) => Array.from(line).reduce((width, letter) => width + em(letter) * font, 0);
    for (const cell of signs) {
        const text = cell.meta.t;
        const [es, en] = text.split(' // ');
        assert.ok(es && en, text);
        assert.ok(es.length <= 16, `short: ${es}`);
        assert.ok(Buffer.byteLength(text) <= 288, text);
        const board = vm.runInContext('signBoardLayoutFor', ctx)(text, measureAt);
        assert.equal(board.truncated, false, text);
        assert.equal(board.lines.join(' '), es, `not what its board shows: ${es}`);
        const [dx, dz] = ctx.SHAPE_DIRECTIONS[world.blockTypes[cell.type].state.facing];
        assert.ok(!world.registry.fullCube[world.getBlockId(cell.x, cell.y + 1, cell.z)], `no room for the board: ${text}`);
        assert.ok(!world.registry.fullCube[world.getBlockId(cell.x + dx, cell.y, cell.z + dz)], `looks at a wall: ${text}`);
    }
});

// ---------------------------------------------------------------------------------------
// The command

function makeGame(world, { creative = true, look = { x: 0, z: 1 }, at = { x: 0.5, y: 2.62, z: 0.5 } } = {}) {
    const game = new ctx.Game();
    const messages = [];
    const sent = [];
    Object.assign(game, {
        world,
        creativeMode: creative,
        receiveSystemMessage: ({ text }) => messages.push(text),
        cameraController: { eyeHeight: 1.62, getPosition: () => at },
        getInteractionRay: () => ({ direction: new Vector3(look.x, 0, look.z) }),
        network: { connected: true, ws: { bufferedAmount: 0 }, send: (type, payload) => sent.push({ type, payload }) }
    });
    return { game, messages, sent };
}

function run(game) {
    for (let i = 0; i < 400000 && (game.constructionJob || game.constructionWaiting); i++) game.constructionUpdate(1 / 60);
    assert.ok(!game.constructionJob && !game.constructionWaiting, 'it ends');
}

test('/build lists it, and it is hidden outside creative mode', () => {
    const world = makeWorld(1);
    const { game, messages } = makeGame(world);
    game.constructionCommand('build', []);
    assert.ok(messages[0].includes('library (Grand library, 45 x 60, 54 high)'), messages[0]);
    const outside = makeGame(world, { creative: false });
    outside.game.constructionCommand('build', ['library']);
    outside.game.constructionCommand('build', []);
    assert.deepEqual(outside.messages, ['Unknown command: /build', 'Unknown command: /build']);
    assert.equal(outside.sent.length, 0);
    assert.ok(!outside.game.constructionJob && !outside.game.constructionWaiting);
});

test('/build library ends as planned in every turn, in blocks and nothing else, and undo restores the world', () => {
    for (const [look, turns] of [[{ x: 0, z: 1 }, 0], [{ x: -1, z: 0 }, 1], [{ x: 0, z: -1 }, 2], [{ x: 1, z: 0 }, 3]]) {
        const world = makeWorld(6);
        // Something of a player's in the way, for the undo to give back.
        const [fx, fz] = ctx.SHAPE_DIRECTIONS[LOOK_BY_TURNS[turns]];
        const things = [[fx * 20, 1, fz * 20, 'wood'], [fx * 30, 4, fz * 30, 'planks']];
        for (const [x, y, z, type] of things) world.setEditedBlock(x, y, z, type);
        const { game, sent, messages } = makeGame(world, { look });
        game.constructionCommand('build', ['library']);
        assert.ok(game.constructionJob, messages.join());
        run(game);
        assert.ok(sent.every(({ type }) => type === 'blockPlace' || type === 'blockBreak'));
        const layout = ctx.constructionLayout(PLAN, turns, { x: fx * 3, z: fz * 3 }, 0, world.blockTypes);
        for (const cell of layout.cells) assert.equal(world.getBlockTypeAt(cell.x, cell.y, cell.z), cell.type, `${cell.x},${cell.y},${cell.z}`);
        const signs = sent.filter(({ payload }) => String(payload.blockType).startsWith('sign'));
        assert.ok(signs.length >= 10 && signs.every(({ payload }) => payload.text));
        if (turns > 1) continue;
        game.constructionCommand('build', ['undo']);
        run(game);
        for (const cell of layout.cells) {
            if (cell.y > 0 && !things.some(([x, y, z]) => x === cell.x && y === cell.y && z === cell.z)) assert.equal(world.getBlockTypeAt(cell.x, cell.y, cell.z), null);
        }
        for (const [x, y, z, type] of things) assert.equal(world.getBlockTypeAt(x, y, z), type);
    }
});
