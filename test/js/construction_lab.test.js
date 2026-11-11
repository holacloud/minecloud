// Node tests for /build lab (js/game/construction_lab.js): registration, all 4 turns, nothing overlapping or
// floating, the walk to every room, light at night, the microscopes' real light, signs, the lift, what the sky
// and the water have to give the generators, that the data the Go test runs on the real grid
// (pkg/network/testdata/lab_power.json) is this design, and the command on flat land, a slope and water. Its stock:
// where each entry lands in the 4 turns, that it goes out after the last block, and what undo leaves unspawned
// (what the items are and the server's limits: construction_stock.test.js).
// To write that data again: LAB_WRITE=1 node --test test/js/construction_lab.test.js
// Run with: node --test test/js/construction_lab.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js');
const TESTDATA = path.join(__dirname, '..', '..', 'pkg', 'network', 'testdata', 'lab_power.json');

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
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js', 'game', 'block_edits.js'), 'utf8'), context, { filename: 'block_edits.js' });
    for (const file of ['joinery.js', 'weather.js', 'chemistry.js', 'electricity.js', 'logic.js', 'mechanics.js', 'blueprints.js', 'constructions.js', 'furniture.js', 'seating.js', 'storage.js', 'appliances.js', 'smelters.js', 'farming.js', 'glow_block.js', 'microbes.js', 'microscope.js', 'cultures_text.js', 'cultures.js', 'decor.js', 'mirrors.js', 'construction_lab.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    }
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, CameraController, BLOCK_SHAPES, Game, CONSTRUCTION_DESIGNS, ConstructionBuilder, constructionPlan, constructionLayout, chunkIndex,
        SHAPE_DIRECTIONS, ELECTRIC_KINDS, LOGIC_KINDS, seatStandOffsets, signBoardLayoutFor, microscopeOpenToSky, microscopeLightFrom, labPlanMarks, LAB_SHAFT, LAB_WINCH_Y, LAB_STEP, LAB_ROOF_Y, LAB_ELEMENTS, STORAGE_KINDS });`, context);
    return context;
}

const ctx = loadGame();
const FACINGS = ['n', 'e', 's', 'w'];
const DIRECTIONS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const LOOK_BY_TURNS = ['s', 'w', 'n', 'e'];
const TURNS = [0, 1, 2, 3];
const ANCHOR = { x: 3, z: -5 };
const NAME = 'lab';

function makeWorld(radius = 5, ground = () => 0) {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    world.getChunkMaterial = (type) => `material:${type}`;
    const stone = world.registry.id('stone');
    for (let cx = -radius; cx < radius; cx++) {
        for (let cz = -radius; cz < radius; cz++) {
            const column = new ctx.ChunkColumn(cx, cz);
            for (let lx = 0; lx < 16; lx++) {
                for (let lz = 0; lz < 16; lz++) {
                    const top = ground(cx * 16 + lx, cz * 16 + lz);
                    for (let y = top - 4; y <= top; y++) column.blocks[ctx.chunkIndex(lx, y, lz)] = stone;
                }
            }
            world.columns.set(world.chunkKey(cx, cz), column);
        }
    }
    return world;
}

const blocks = makeWorld(1);
const defOf = (type) => blocks.blockTypes[type];
const baseOf = (type) => defOf(type).variantOf || type;
const stateOf = (type) => defOf(type).state || {};
const PLAN = ctx.constructionPlan(NAME);
const { marks: MARKS, lamps: LAMPS } = ctx.labPlanMarks();
const { x: SX, z: SZ } = ctx.LAB_SHAFT;
const GRID = new Map(PLAN.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
const planAt = (x, y, z) => GRID.get(`${x},${y},${z}`);
const isElectric = (type) => Boolean(ctx.ELECTRIC_KINDS[baseOf(type)]);

function turned(turns, x, z) {
    const [fx, fz] = ctx.SHAPE_DIRECTIONS[LOOK_BY_TURNS[turns]];
    const across = x - PLAN.anchorX;
    return [ANCHOR.x + fx * z + fz * across, ANCHOR.z + fz * z - fx * across];
}

function layoutOf(turns) {
    const layout = ctx.constructionLayout(PLAN, turns, ANCHOR, 0, blocks.blockTypes);
    const grid = new Map(layout.cells.map((cell) => [`${cell.x},${cell.y},${cell.z}`, cell.type]));
    return { layout, typeAt: (x, y, z) => grid.get(`${x},${y},${z}`) };
}

// A door of the shaft: the walks leave them shut, as the lift may not be behind them.
const isShaftDoor = (source) => source.x === SX && source.z === SZ - 1 && defOf(source.type).shape === 'door';

function placeOpen(world, layout) {
    layout.cells.forEach((cell, index) => {
        const def = world.blockTypes[cell.type];
        let type = cell.type;
        if (def.state && def.state.open && def.shape !== 'trapdoor' && !isShaftDoor(PLAN.cells[index])) {
            type = world.getShapeStateType(def.variantOf || type, { ...def.state, open: 'open' });
        }
        world.setEditedBlock(cell.x, cell.y, cell.z, type);
    });
}

// As construction_library.test.js: everywhere a player can walk with no jump, in quarter blocks, and `falls`.
function walkable(world, startX, startFeet, startZ, min, max) {
    const camera = { position: new Vector3(0, 0, 0), rotation: {} };
    const player = new ctx.CameraController(camera, { addEventListener() {} });
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
            if (nx < min[0] || nx > max[0] + 1 || nz < min[1] || nz > max[1] + 1) continue;
            let floor;
            if (player.canStandAt(nx, nz, feet)) {
                floor = player.getSupportFloorY(nx, nz, feet);
                if (floor < -8) continue;
                // Into a pool is no fall, nor off a piece of furniture among the hall's rows: a floor's drop is 5 or 6.
                const into = [0, 1].some((up) => world.getBlockTypeAt(Math.floor(nx), Math.floor(floor) + up, Math.floor(nz)) === 'water');
                if (feet - floor > 3.5 && !into) falls.push([nx, feet, nz, floor]);
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

const walks = new Map();
function walkOf(turns) {
    if (!walks.has(turns)) {
        const { layout } = layoutOf(turns);
        const world = makeWorld(5);
        placeOpen(world, layout);
        const [sx, sz] = turned(turns, PLAN.start[0], PLAN.start[2]);
        const min = [layout.min.x, layout.min.z];
        const max = [layout.min.x + layout.size[0] - 1, layout.min.z + layout.size[2] - 1];
        const { reached, falls } = walkable(world, sx, PLAN.start[1], sz, min, max);
        const cells = new Set(reached.map(([x, z, feet]) => `${Math.floor(x)},${Math.floor(feet)},${Math.floor(z)}`));
        walks.set(turns, { world, layout, reached, falls, cells });
    }
    return walks.get(turns);
}

// ---------------------------------------------------------------------------------------

test('it is registered and /build lists it, in creative mode only', () => {
    assert.ok(ctx.CONSTRUCTION_DESIGNS.lab);
    const messages = [];
    const game = new ctx.Game();
    Object.assign(game, { creativeMode: true, receiveSystemMessage: ({ text }) => messages.push(text) });
    game.constructionCommand('build', []);
    assert.ok(messages[0].includes('lab (Research institute, 56 x 52, 36 high)'), messages[0]);
    game.creativeMode = false;
    game.constructionCommand('build', ['lab']);
    assert.equal(messages[1], 'Unknown command: /build');
    assert.ok(!game.constructionJob && !game.constructionWaiting);
    // It loads with the game.
    const html = fs.readFileSync(path.join(JS, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('js/game/construction_lab.js'));
});

test('every block exists, fits the box, and the count stays in hand', () => {
    const [w, h, d] = PLAN.size;
    for (const cell of PLAN.cells) {
        const def = defOf(cell.type);
        assert.ok(def, `${cell.type} is not a block`);
        assert.ok(blocks.registry.ids[cell.type] !== undefined, `${cell.type} is not a world block`);
        assert.ok(!def.itemOnly, cell.type);
        assert.ok(cell.x >= 0 && cell.x < w && cell.y >= 0 && cell.y < h && cell.z >= 0 && cell.z < d);
    }
    assert.ok(PLAN.cells.length < 30000, `${PLAN.cells.length} blocks`);
    assert.ok(PLAN.rate, 'reads the box in slices');
    const glow = PLAN.cells.filter((cell) => baseOf(cell.type) === 'glow_block').map((cell) => cell.type);
    assert.ok(glow.length > 100 && new Set(glow).size >= 5, 'glow blocks in their colours');
    for (const type of glow) assert.ok(/^glow_block:(k\d+|rgb[0-5]{3})$/.test(type), type);
});

test('it has what was asked for', () => {
    const count = {};
    for (const cell of PLAN.cells) count[baseOf(cell.type)] = (count[baseOf(cell.type)] || 0) + 1;
    const need = {
        microscope: 8, lab_bench: 50, chest: 10, rtg: 10, solar_panel: 24, wind_turbine: 2, water_wheel: 1, battery_block: 8, copper_wire: 100, wire_post: 30, electric_lamp: 30,
        light_bulb: 2, lever: 10, push_button: 6, pressure_plate: 2, daylight_sensor: 3, proximity_sensor: 1, rain_sensor: 1, and_gate: 1, or_gate: 1, xor_gate: 1, not_gate: 1, delay_gate: 1,
        latch: 1, electric_motor: 2, hand_crank: 1, lift_stop: 4, lift_winch: 1, lift_platform: 1, fridge: 4, chest_freezer: 1, oven: 2, foundry: 1, arc_furnace: 1, grow_lamp: 5, farmland: 50, incubator: 1, autoclave: 1,
        wheat_0: 10, wheat_3: 1, bench: 40, sofa: 0, bookshelf: 30, sign: 40, water: 50, moss: 3, desk: 5, mirror: 20
    };
    for (const [type, least] of Object.entries(need)) {
        if (!least) continue;
        assert.ok((count[type] || 0) >= least, `${type}: ${count[type]} of ${least}`);
    }
    // No telescope as a block: it is not one, and nothing pretends. A weather station is one: see below.
    assert.ok(!count.telescope);
    assert.ok(PLAN.cells.some((cell) => cell.meta && cell.meta.t && cell.meta.t.includes('weather_station')), 'a sign says how to get another weather station');
    // What is not a block is in the chests (LAB_STOCK, below).
    const stocked = new Set(PLAN.stocks.flatMap(({ items, freezer }) => [...items, ...freezer].map(([type]) => type)));
    for (const type of ['telescope', 'star_chart', 'multimeter', 'test_tube', 'glass_slide', 'micropipette', 'iodine_tincture', 'methylene_blue', 'darkfield_stop', 'agar_plate', 'petri_dish']) {
        assert.ok(stocked.has(type), `a chest holds ${type}`);
    }
});

test('a real weather station on the terrace, in the open, with a sign that says so', () => {
    const y = ctx.LAB_ROOF_Y + 1;
    assert.equal(planAt(39, y, 17), 'weather_station');
    assert.equal(planAt(39, y + 1, 17), 'weather_station:upper');
    assert.equal(PLAN.cells.filter((cell) => cell.type === 'weather_station').length, 1);
    assert.ok(defOf(planAt(39, y - 1, 17)) && blocks.registry.solid[blocks.registry.id(planAt(39, y - 1, 17))], 'on something solid');
    for (const cell of PLAN.cells) {
        if (cell.x === 39 && cell.z === 17) assert.ok(cell.y <= y + 1, `open sky: ${cell.type} at ${cell.y}`);
    }
    const signs = PLAN.cells.filter((cell) => cell.meta && cell.meta.t && cell.meta.t.includes('weather_station'));
    assert.equal(signs.length, 1);
    assert.match(signs[0].meta.t, /real weather station/i);
    assert.ok(!/not a block|no un bloque/.test(signs[0].meta.t));
    assert.ok(!PLAN.cells.some((cell) => cell.meta && cell.meta.t && /Sitio para la estaci|Pad for a weather/.test(cell.meta.t)));
    for (const name of fs.readdirSync(path.join(JS, '..', 'guide')).filter((file) => file.startsWith('250_'))) {
        const page = fs.readFileSync(path.join(JS, '..', 'guide', name), 'utf8');
        assert.ok(!/objeto que colocas|item you set down/.test(page), name);
        assert.match(page, /\]\(112\)/, name);
    }
});

test('the periodic table: every element of the game, in its own group and period', () => {
    const shown = PLAN.cells.filter((cell) => /^element_/.test(cell.type));
    assert.equal(shown.length, ctx.LAB_ELEMENTS.length);
    const inGame = Object.keys(blocks.blockTypes).filter((type) => /^element_/.test(type));
    assert.deepEqual(shown.map((cell) => cell.type).sort(), inGame.sort());
    for (const [symbol, period, group] of ctx.LAB_ELEMENTS) {
        assert.equal(planAt(18 + group, 14 - period, 26), `element_${symbol}`);
    }
    // In order along a row, as a table is: reading from the front, low x first means group 18 on the east.
    assert.equal(planAt(19, 13, 26), 'element_h');
    assert.equal(planAt(36, 13, 26), 'element_he');
});

test('nothing placed is overwritten by something else while it is drawn: no two things in one cell', () => {
    const overwritten = [];
    class Watching extends ctx.ConstructionBuilder {
        set(x, y, z, type, meta) {
            const [w, , d] = this.size;
            const fx = this.flipped ? w - 1 - x : x;
            const old = this.cells.get((y * d + z) * w + fx);
            // Furniture and wiring; building blocks are carved all the time.
            if (old && old.type !== type) {
                const def = defOf(old.type);
                if (def.shape && !['stairs', 'pane', 'door'].includes(def.shape) || isElectric(old.type) || def.storageSlots) overwritten.push(`${old.type} at ${fx},${y},${z} by ${type}`);
            }
            super.set(x, y, z, type, meta);
        }
    }
    PLAN.generate(new Watching(PLAN.size));
    assert.deepEqual(overwritten, []);
});

test('all 4 turns: footprint, doors, stairs, facing, wall items, hanging items, pieces of two cells', () => {
    const wallShapes = new Set(['painting', 'wall_mirror', 'wall_clock', 'wall_shelf', 'curtain']);
    for (const turns of TURNS) {
        const { layout, typeAt } = layoutOf(turns);
        const [w, h, d] = PLAN.size;
        assert.deepEqual([...layout.size], turns % 2 ? [d, h, w] : [w, h, d]);
        const solidAt = (x, y, z) => {
            const type = typeAt(x, y, z);
            return Boolean(type) && blocks.registry.solid[blocks.registry.id(type)] === 1;
        };
        const counts = { wall: 0, hanging: 0, linked: 0, door: 0, stairs: 0 };
        layout.cells.forEach((cell, index) => {
            const source = PLAN.cells[index];
            const def = defOf(cell.type);
            const state = stateOf(cell.type);
            const where = `${cell.type} at ${source.x},${source.y},${source.z}, turned ${turns}`;
            assert.equal(cell.y, source.y);
            assert.deepEqual([cell.x, cell.z], turned(turns, source.x, source.z), where);
            const before = stateOf(source.type).facing;
            if (FACINGS.includes(before)) {
                assert.equal(state.facing, FACINGS[(FACINGS.indexOf(before) + turns) % 4], where);
                assert.equal(baseOf(cell.type), baseOf(source.type));
            } else {
                assert.equal(cell.type, source.type);
            }
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
            if (shape && shape.linked) {
                for (const [dx, dy, dz] of shape.linked(state)) {
                    const other = typeAt(cell.x + dx, cell.y + dy, cell.z + dz);
                    assert.ok(other && baseOf(other) === baseOf(cell.type), `incomplete: ${where}`);
                    assert.equal(stateOf(other).facing, state.facing, where);
                }
                counts.linked++;
            }
            if (def.shape === 'door') counts.door++;
            if (def.shape === 'stairs') counts.stairs++;
        });
        assert.ok(counts.wall >= 20 && counts.linked > 60 && counts.door > 60 && counts.stairs >= 60, JSON.stringify(counts));
        // The front door: four leaves, looking the way the player looks.
        const look = LOOK_BY_TURNS[turns];
        const front = layout.cells.filter((cell, index) => PLAN.cells[index].y <= 2 && PLAN.cells[index].z === 10 && defOf(cell.type).shape === 'door');
        assert.equal(front.length, 8);
        for (const cell of front) assert.equal(stateOf(cell.type).facing, look);
    }
});

test('nothing floats by accident: every block holds on to the ground, face to face', () => {
    const seen = new Set();
    const queue = [];
    for (const cell of PLAN.cells) {
        if (cell.y === 0) {
            seen.add(`${cell.x},0,${cell.z}`);
            queue.push(cell);
        }
    }
    while (queue.length) {
        const { x, y, z } = queue.pop();
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
            const key = `${x + dx},${y + dy},${z + dz}`;
            if (seen.has(key) || !GRID.has(key)) continue;
            seen.add(key);
            queue.push({ x: x + dx, y: y + dy, z: z + dz });
        }
    }
    const floating = PLAN.cells.filter((cell) => !seen.has(`${cell.x},${cell.y},${cell.z}`)).map((cell) => `${cell.type} ${cell.x},${cell.y},${cell.z}`);
    assert.deepEqual(floating, []);
    // A lamp or an item on a table has something under it, unless it is hanging from a post.
    const hungFree = PLAN.cells.filter((cell) => ['vase', 'flower_pot', 'candle', 'table_lamp', 'microscope'].includes(baseOf(cell.type)) && !planAt(cell.x, cell.y - 1, cell.z));
    assert.deepEqual(hungFree.map((cell) => `${cell.type} ${cell.x},${cell.y},${cell.z}`), []);
});

test('on foot, with the lift out of it: every room from the door, in all 4 turns, and nowhere to fall', () => {
    for (const turns of TURNS) {
        const { cells, falls, reached } = walkOf(turns);
        for (const level of PLAN.levels) {
            const [x, z] = turned(turns, level.at[0], level.at[2]);
            assert.ok(cells.has(`${x},${level.at[1]},${z}`), `turned ${turns}: cannot reach ${level.name} (${level.at})`);
        }
        const [sx, sz] = turned(turns, SX, SZ);
        assert.ok(!reached.some(([x, z, feet]) => Math.floor(x) === sx && Math.floor(z) === sz), 'in the shaft');
        assert.deepEqual(falls.slice(0, 6), [], `falls, turned ${turns}`);
    }
});

test('what is used can be reached and sat on', () => {
    for (const turns of [0, 1]) {
        const { world, cells, layout } = walkOf(turns);
        const near = (x, y, z, reach) => {
            for (let dz = -reach; dz <= reach; dz++) {
                for (let dx = -reach; dx <= reach; dx++) {
                    for (let dy = -4; dy <= 1; dy++) if (cells.has(`${x + dx},${y + dy},${z + dz}`)) return true;
                }
            }
            return false;
        };
        layout.cells.forEach((cell, index) => {
            const def = defOf(cell.type);
            const source = PLAN.cells[index];
            const base = baseOf(cell.type);
            const pressable = ctx.LOGIC_KINDS[base] && base !== 'lift_stop' && !(source.x === SX + 1 || source.x === SX - 1);
            if (def.seat || def.storageSlots || ['oven', 'foundry', 'sink', 'microscope', 'lab_bench', 'hand_crank'].includes(base) || pressable) {
                assert.ok(near(cell.x, cell.y, cell.z, 3), `cannot reach ${cell.type} at ${source.x},${source.y},${source.z}, turned ${turns}`);
            }
            if (def.seat) {
                assert.ok(!world.registry.fullCube[world.getBlockId(cell.x, cell.y + 1, cell.z)], `no room to sit at ${source.x},${source.y},${source.z}`);
                const facing = def.state && def.state.facing ? def.state.facing : 'n';
                const stands = ctx.seatStandOffsets(facing).some(([dx, dz]) => cells.has(`${cell.x + dx},${cell.y},${cell.z + dz}`));
                assert.ok(stands, `nowhere to stand up from ${cell.type} at ${source.x},${source.y},${source.z}`);
            }
        });
    }
});

// The plan with every electric consumer the way the server leaves it once it has power (the darkroom's aside).
function litType(type, x, y, z) {
    const [dx, dy, dz] = MARKS['lamp:darkroom'];
    if (x === dx && y === dy && z === dz) return type;
    const lit = `${type}:on`;
    if (['light_bulb', 'grow_lamp'].includes(type)) return lit;
    if (type === 'electric_lamp') return lit;
    return type;
}

test('it is lit at night, by what it has, once the server has given the lamps their power', () => {
    const { world, reached, layout } = walkOf(0);
    const levels = new Map();
    const queue = [];
    const put = (x, y, z, level) => {
        levels.set(`${x},${y},${z}`, level);
        queue.push([x, y, z, level]);
    };
    layout.cells.forEach((cell, index) => {
        const source = PLAN.cells[index];
        const type = litType(cell.type, source.x, source.y, source.z);
        const level = world.registry.lightLevel[world.registry.id(type)];
        if (level) put(cell.x, cell.y, cell.z, level);
    });
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
    const opaque = (x, y, z) => {
        const id = world.getBlockId(x, y, z);
        return id && world.registry.solid[id] && !world.registry.transparent[id];
    };
    const dark = new Set();
    const { min } = layout;
    const inDarkRoom = (x, z) => PLAN.darkRooms.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
    for (const [fx, fz, feet] of reached) {
        const x = Math.floor(fx), y = Math.floor(feet), z = Math.floor(fz);
        const [lx, lz] = [x - min.x, z - min.z];
        if (lx < 2 || lx > 53 || lz < 11 || lz > 47 || inDarkRoom(lx, lz)) continue;
        let covered = false;
        for (let up = y + 2; up < PLAN.size[1] && !covered; up++) covered = opaque(x, up, z);
        if (covered && (levels.get(`${x},${y},${z}`) || 0) < 5) dark.add(`${lx},${y},${lz}`);
    }
    assert.deepEqual([...dark], [], 'dark at night (local x,y,z)');
});

// ---- The microscopes, with the very functions the panel uses ----

function scopeLight(name, daylight, lampsOn) {
    const [x, y, z] = MARKS[`scope:${name}`];
    const { world } = walkOf(0);
    const registry = world.registry;
    const local = (lx, lz) => turned(0, lx, lz);
    const [wx, wz] = local(x, z);
    const blocksAt = (bx, by, bz) => {
        const id = world.getBlockId(bx, by, bz);
        return id !== 0 && registry.solid[id] === 1 && registry.transparent[id] === 0;
    };
    let lamp = null;
    for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
                const type = world.getBlockTypeAt(wx + dx, y + dy, wz + dz);
                if (!type) continue;
                const shown = lampsOn && ['electric_lamp', 'light_bulb'].includes(type) ? `${type}:on` : type;
                if (!world.isLightEmitterType(shown)) continue;
                const level = registry.lightLevel[registry.id(shown)];
                if (!lamp || level > lamp.level) lamp = { level, name: shown };
            }
        }
    }
    const open = ctx.microscopeOpenToSky(blocksAt, 120, wx, y, wz);
    return { ...ctx.microscopeLightFrom(daylight, open, lamp), open, lamp };
}

test('each microscope has its real light: the sun by a window, a lamp, a bulb, a candle', () => {
    for (const name of ['sun1', 'sun2', 'sun3', 'sun4']) {
        const noon = scopeLight(name, 1, true);
        assert.equal(noon.source, 'sun', name);
        assert.equal(noon.lamp, null, `${name}: nothing but the sun`);
        const night = scopeLight(name, 0, true);
        assert.equal(night.level, 0, `${name} goes black at night`);
    }
    const lamp = scopeLight('lamp', 0, true);
    assert.equal(lamp.source, 'lamp');
    assert.equal(lamp.lamp.name, 'electric_lamp:on');
    const bulb = scopeLight('bulb', 0, true);
    assert.equal(bulb.lamp.name, 'light_bulb:on');
    const candle = scopeLight('candle', 0, true);
    assert.equal(candle.lamp.name, 'candle');
    // A lamp is brighter than a candle, and that than a bulb: guide 247's dark-field lesson.
    assert.ok(lamp.level > candle.level && candle.level > bulb.level, `${lamp.level} ${candle.level} ${bulb.level}`);
    // A candle needs no power; a bench lamp off is no light at all.
    assert.equal(scopeLight('lamp', 0, false).level, 0);
    assert.equal(scopeLight('bulb', 0, false).level, 0);
    assert.ok(scopeLight('candle', 0, false).level > 0);
});

test('the darkroom: no sky, no lamp but its own, which hangs off the lever by the door', () => {
    const off = scopeLight('dark', 1, false);
    assert.equal(off.open, false, 'no window reaches it');
    assert.equal(off.level, 0, 'black, even at noon');
    const on = scopeLight('dark', 1, true);
    assert.equal(on.lamp.name, 'electric_lamp:on');
    // The lever starts off; its lamp and only that is on the wire after it. The Go test throws it.
    assert.equal(planAt(...MARKS['lever:darkroom']), 'lever');
    const [lx, ly, lz] = MARKS['lamp:darkroom'];
    const [sx, sy, sz] = MARKS['scope:dark'];
    assert.ok(Math.max(Math.abs(lx - sx), Math.abs(ly - sy), Math.abs(lz - sz)) <= 2);
    // Its red lights give none.
    assert.equal(blocks.registry.lightLevel[blocks.registry.id('glow_block:rgb500')], 0);
    assert.ok(PLAN.darkRooms.some(([x0, z0, x1, z1]) => sx >= x0 && sx <= x1 && sz >= z0 && sz <= z1));
});

// ---- The signs ----

test('the signs: Spanish first as in every construction, within what the server keeps, whole on their boards, with free floor', () => {
    const signs = PLAN.cells.filter((cell) => baseOf(cell.type) === 'sign');
    assert.ok(signs.length >= 40);
    const { world, layout } = walkOf(0);
    const em = (letter) => (/[A-ZÁÉÍÓÚÑ]/.test(letter) ? 0.74 : /[mw]/.test(letter) ? 0.9 : /[.,:;il' ]/.test(letter) ? 0.3 : 0.6);
    const measureAt = (font) => (line) => Array.from(line).reduce((width, letter) => width + em(letter) * font, 0);
    layout.cells.forEach((cell, index) => {
        if (baseOf(cell.type) !== 'sign') return;
        const text = PLAN.cells[index].meta.t;
        const parts = text.split(' // ');
        const [es] = parts;
        assert.ok(es && parts.length >= 2 && parts[parts.length - 1], text);
        assert.ok(Buffer.byteLength(text) <= 288, `${Buffer.byteLength(text)}: ${text}`);
        const board = ctx.signBoardLayoutFor(text, measureAt);
        assert.equal(board.truncated, false, text);
        assert.equal(board.lines.join(' '), es, `not what its board shows: ${es}`);
        const [dx, dz] = ctx.SHAPE_DIRECTIONS[world.blockTypes[cell.type].state.facing];
        assert.ok(!world.registry.fullCube[world.getBlockId(cell.x + dx, cell.y, cell.z + dz)], `looks at a wall: ${text}`);
    });
});

// ---- The lift ----

test('the lift: platform, only air, the winch, within the rope; a stop and an iron door on each floor', () => {
    const winch = ctx.LAB_WINCH_Y;
    assert.equal(planAt(SX, 0, SZ), 'lift_platform');
    assert.equal(planAt(SX, winch, SZ), 'lift_winch');
    for (let y = 1; y < winch; y++) assert.equal(planAt(SX, y, SZ), undefined, `not air at ${y}`);
    assert.ok(winch - 1 <= 48, 'rope');
    assert.equal(winch - 3, ctx.LAB_ROOF_Y, 'it reaches the roof');
    for (let n = 0; n <= 3; n++) {
        const F = n * ctx.LAB_STEP;
        assert.equal(baseOf(planAt(SX, F + 1, SZ - 1)), 'iron_door');
        assert.equal(stateOf(planAt(SX, F + 1, SZ - 1)).open, 'closed');
        assert.equal(baseOf(planAt(SX, F + 2, SZ - 1)), 'iron_door');
        assert.equal(planAt(SX, F + 3, SZ - 1), 'lift_stop');
        assert.equal(planAt(SX + 1, F + 2, SZ) === 'push_button', n < 3);
        assert.equal(planAt(SX - 1, F + 2, SZ) === 'push_button', n > 0);
    }
});

test('riding: your floor\'s stop, the next one as it comes, and green and red are in reach', () => {
    const reach = 4.5;
    for (let n = 0; n <= 3; n++) {
        const F = n * ctx.LAB_STEP;
        const eye = [SX + 0.5, F + 1 + 1.62, SZ + 0.5];
        const toFace = (y, from = eye) => Math.hypot(from[0] - (SX + 0.5), from[1] - Math.max(y, Math.min(y + 1, from[1])), from[2] - SZ);
        assert.ok(toFace(F + 3) < reach, `own stop, floor ${n}`);
        if (n < 3) {
            // Going up, the next stop comes into reach well before the floor: 3 blocks to click it in.
            const riding = [eye[0], eye[1] + 3, eye[2]];
            assert.ok(toFace(F + ctx.LAB_STEP + 3, riding) < reach, `the stop above, floor ${n}`);
        }
        for (const dx of [1, -1]) {
            if (planAt(SX + dx, F + 2, SZ) !== 'push_button') continue;
            assert.ok(Math.hypot(eye[0] - (SX + dx + 0.5), eye[1] - (F + 2 + 3 / 16), eye[2] - (SZ + 0.5)) < reach);
        }
    }
});

// ---- What the grid reads from the world ----

test('the sky over the panels and the turbines is open, the wheel stands in water, the wheat on farmland under a grow lamp', () => {
    const see = new Set(['glass', 'glass_pane', 'torch', 'copper_wire', 'wire_post', 'iron_bars', 'sign']);
    for (const cell of PLAN.cells.filter((c) => c.type === 'solar_panel')) {
        for (let y = cell.y + 1; y < PLAN.size[1]; y++) {
            const above = planAt(cell.x, y, cell.z);
            assert.ok(!above || see.has(baseOf(above)), `${above} over a panel at ${cell.x},${cell.z}`);
        }
    }
    for (const cell of PLAN.cells.filter((c) => c.type === 'wind_turbine')) {
        for (let y = cell.y + 1; y < PLAN.size[1]; y++) assert.equal(planAt(cell.x, y, cell.z), undefined);
    }
    const [wx, wy, wz] = MARKS.wheel;
    const sides = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]].filter(([dx, dy, dz]) => planAt(wx + dx, wy + dy, wz + dz) === 'water');
    assert.ok(sides.length >= 3, 'three sides of water is the most it can use');
    const wheat = PLAN.cells.filter((c) => /^wheat_/.test(c.type));
    assert.ok(wheat.length > 50);
    for (const cell of wheat) assert.equal(planAt(cell.x, cell.y - 1, cell.z), 'farmland', `${cell.x},${cell.z}`);
    // As growLampNear in power.go: up to 4 over it and 2 to the sides.
    const lamps = PLAN.cells.filter((c) => c.type === 'grow_lamp');
    const covered = wheat.filter((w) => lamps.some((l) => l.y - w.y >= 1 && l.y - w.y <= 4 && Math.abs(l.x - w.x) <= 2 && Math.abs(l.z - w.z) <= 2));
    assert.ok(covered.length >= wheat.length * 0.6, `${covered.length} of ${wheat.length}`);
    // The real sky through the slit, where the sign says to stand.
    const [ox, oy, oz] = MARKS['open:slit'];
    for (let y = oy; y < PLAN.size[1]; y++) assert.equal(planAt(ox, y, oz), undefined, `${planAt(ox, y, oz)} at ${y}`);
});

test('the names it places: consumers bare, ovens unlit, logic off but for the levers that start on; the server settles the rest', () => {
    const on = [];
    for (const cell of PLAN.cells) {
        const base = baseOf(cell.type);
        if (['electric_lamp', 'light_bulb', 'grow_lamp', 'electric_motor', 'battery_block', 'fridge', 'chest_freezer'].includes(base)) {
            assert.ok(!cell.type.includes(':on') && !/^battery_block:/.test(cell.type), cell.type);
        }
        if (['oven', 'foundry', 'arc_furnace'].includes(base)) assert.equal(stateOf(cell.type).fire, 'off', cell.type);
        if (ctx.LOGIC_KINDS[base] && stateOf(cell.type).power === 'on') on.push(base);
    }
    assert.ok(on.every((base) => base === 'lever'), on.join());
    assert.ok(on.length >= 8);
});

// ---- What the storage holds ----

const plainOf = (value) => JSON.parse(JSON.stringify(value));

test('the stock: every entry is a storage block of the plan, in all 4 turns on the cell it was drawn on', () => {
    assert.ok(PLAN.stocks.length >= 30, `${PLAN.stocks.length}`);
    for (const turns of TURNS) {
        const { layout, typeAt } = layoutOf(turns);
        PLAN.stocks.forEach((stock, i) => {
            const local = planAt(stock.x, stock.y, stock.z);
            assert.ok(local && ctx.STORAGE_KINDS[baseOf(local)] && stateOf(local).half !== 'upper', `not storage: ${stock.x},${stock.y},${stock.z} ${local}`);
            const [wx, wz] = turned(turns, stock.x, stock.z);
            const at = layout.stocks[i];
            assert.deepEqual([at.x, at.y, at.z], [wx, stock.y, wz], `turn ${turns}`);
            assert.equal(baseOf(typeAt(at.x, at.y, at.z)), baseOf(local), `turn ${turns}`);
            assert.deepEqual(plainOf(at.items), plainOf(stock.items));
        });
    }
});

test('a build stopped half way stocks nothing, and a build out of creative mode never starts', () => {
    const world = makeWorld(6);
    const { game, sent } = makeGame(world);
    game.constructionCommand('build', [NAME]);
    for (let i = 0; i < 200; i++) game.constructionUpdate(1 / 60);
    game.constructionCommand('build', ['stop']);
    assert.ok(sent.length > 0 && sent.every(({ type }) => type !== 'constructionStock'));
    const other = makeGame(makeWorld(1));
    other.game.creativeMode = false;
    other.game.constructionCommand('build', [NAME]);
    assert.equal(other.sent.length, 0);
});

// ---- The real grid ----

function powerData() {
    const keep = (type) => isElectric(type) || ['lift_platform', 'iron_door', 'water', 'farmland'].includes(baseOf(type)) || /^wheat_/.test(type);
    return TURNS.map((turns) => {
        const { layout } = layoutOf(turns);
        const cells = [];
        layout.cells.forEach((cell) => {
            if (keep(cell.type)) cells.push([cell.x, cell.y, cell.z, cell.type]);
        });
        const at = ([x, y, z]) => {
            const [wx, wz] = turned(turns, x, z);
            return [wx, y, wz];
        };
        const marks = {};
        for (const [name, where] of Object.entries(MARKS)) marks[name] = at(where);
        const lamps = LAMPS.map(({ room, at: where, night, manual }) => ({ room, at: at(where), night, manual: Boolean(manual) }));
        const [sx, sz] = turned(turns, SX, SZ);
        return { turns, shaft: [sx, sz], winchY: ctx.LAB_WINCH_Y, step: ctx.LAB_STEP, marks, lamps, cells };
    });
}

test('the data of the Go test on the real grid is this design', () => {
    const text = `${JSON.stringify(powerData())}\n`;
    if (process.env.LAB_WRITE) {
        fs.mkdirSync(path.dirname(TESTDATA), { recursive: true });
        fs.writeFileSync(TESTDATA, text);
    }
    assert.equal(fs.readFileSync(TESTDATA, 'utf8'), text, 'stale: see the top of this file');
});

// ---------------------------------------------------------------------------------------
// The command

function makeGame(world, look = { x: 0, z: 1 }, at = { x: 0.5, y: 2.62, z: 0.5 }) {
    const game = new ctx.Game();
    const sent = [];
    const messages = [];
    Object.assign(game, {
        world,
        creativeMode: true,
        receiveSystemMessage: ({ text }) => messages.push(text),
        cameraController: { eyeHeight: 1.62, getPosition: () => at },
        getInteractionRay: () => ({ direction: new Vector3(look.x, 0, look.z) }),
        network: {
            connected: true, ws: { bufferedAmount: 0 }, handlers: {},
            send: (type, payload) => sent.push({ type, payload }),
            on(type, handler) { this.handlers[type] = handler; }
        }
    });
    return { game, sent, messages };
}

function run(game) {
    for (let i = 0; i < 400000 && (game.constructionJob || game.constructionWaiting || game.constructionScan); i++) game.constructionUpdate(1 / 60);
    assert.ok(!game.constructionJob && !game.constructionWaiting && !game.constructionScan, 'it ends');
}

function snapshot(world) {
    const out = {};
    for (let x = -50; x <= 50; x++) {
        for (let z = -10; z <= 70; z++) {
            for (let y = -6; y <= 40; y++) {
                const type = world.getBlockTypeAt(x, y, z);
                if (type) out[`${x},${y},${z}`] = type;
            }
        }
    }
    return out;
}

test('/build lab: it ends as planned in every turn, by blockPlace, the signs with their text, and undo restores', () => {
    for (const [look, turns] of [[{ x: 0, z: 1 }, 0], [{ x: -1, z: 0 }, 1], [{ x: 0, z: -1 }, 2], [{ x: 1, z: 0 }, 3]]) {
        const world = makeWorld(6);
        const [fx, fz] = ctx.SHAPE_DIRECTIONS[LOOK_BY_TURNS[turns]];
        world.setEditedBlock(fx * 20, 3, fz * 20, 'planks');
        const before = turns === 0 ? snapshot(world) : null;
        const { game, sent, messages } = makeGame(world, look);
        game.constructionCommand('build', [NAME]);
        run(game);
        assert.ok(messages.some((text) => text.includes('finished')), messages.join(' | '));
        // Blocks, and once they are all out the stock of the storage, and nothing else.
        const first = sent.findIndex(({ type }) => type === 'constructionStock');
        assert.ok(first > 0, 'the storage is stocked');
        assert.ok(sent.slice(0, first).every(({ type }) => type === 'blockPlace' || type === 'blockBreak'), 'blocks first');
        const stockMessages = sent.slice(first);
        assert.ok(stockMessages.every(({ type }) => type === 'constructionStock'), 'then the stock and nothing else');
        const layout = ctx.constructionLayout(PLAN, turns, { x: fx * 3, z: fz * 3 }, 0, world.blockTypes);
        const fills = stockMessages.flatMap(({ payload }) => payload.fills);
        assert.ok(stockMessages.every(({ payload }) => payload.fills.length <= 16));
        assert.equal(fills.length, PLAN.stocks.length);
        fills.forEach((fill, i) => {
            const want = layout.stocks[i];
            assert.deepEqual([fill.x, fill.y, fill.z], [want.x, want.y, want.z]);
            const type = world.getBlockTypeAt(fill.x, fill.y, fill.z);
            assert.ok(ctx.STORAGE_KINDS[baseOf(type)] && stateOf(type).half !== 'upper', `storage at ${fill.x},${fill.y},${fill.z}: ${type}`);
            assert.deepEqual(plainOf(fill.items.map(({ type: item, count }) => [item, count])), plainOf(PLAN.stocks[i].items));
        });
        for (const cell of layout.cells) {
            assert.equal(world.getBlockTypeAt(cell.x, cell.y, cell.z), cell.type, `${cell.x},${cell.y},${cell.z}`);
            if (cell.meta && cell.meta.t) assert.equal(world.getSignTextAt(cell.x, cell.y, cell.z), cell.meta.t);
        }
        // The electric blocks go out as any other: the server tracks them from these messages (setBlockTracked).
        const placed = new Set(sent.filter(({ type }) => type === 'blockPlace').map(({ payload }) => payload.blockType.split(':')[0]));
        for (const type of ['rtg', 'solar_panel', 'wind_turbine', 'water_wheel', 'battery_block', 'lift_winch', 'lift_stop', 'lever', 'daylight_sensor', 'fridge', 'arc_furnace', 'grow_lamp', 'wheat_0', 'electric_lamp']) {
            assert.ok(placed.has(type), type);
        }
        if (turns > 0) continue;
        // The server takes all of it; then undo breaks those chests, and of what each spills only what a
        // player added since is spawned, wherever the spill comes from (a fridge spills from its upper cell first).
        // What constructions.js does with the server's answer (registerNetworkHandler).
        const [, heard] = vm.runInContext('NETWORK_HANDLERS', ctx).find(([type]) => type === 'constructionStockResult');
        const answer = (result) => heard.call(game, result);
        for (const { payload } of stockMessages) answer({ filled: payload.fills.map(({ x, y, z }) => [x, y, z]), refused: [] });
        assert.ok(messages.some((text) => text === `Stocked ${fills.length} storage blocks`), messages.join(' | '));
        game.constructionCommand('build', ['undo']);
        run(game);
        assert.deepEqual(snapshot(world), before);
        const fridge = fills.find(({ freezer }) => freezer && freezer.length);
        const spill = [...fridge.items, ...fridge.freezer].map((item) => ({ ...item }));
        spill[0].count += 3;
        spill.push({ type: 'dirt', count: 2 });
        assert.deepEqual(plainOf(game.constructionStockedDrop({ x: fridge.x, y: fridge.y + 1, z: fridge.z, items: spill })),
            [{ type: fridge.items[0].type, count: 3 }, { type: 'dirt', count: 2 }]);
        // Only once, and a chest the build did not stock spills whole.
        assert.equal(game.constructionStockedDrop({ x: fridge.x, y: fridge.y, z: fridge.z, items: spill }).length, spill.length);
        assert.equal(game.constructionStockedDrop({ x: 999, y: 0, z: 0, items: spill }).length, spill.length);
    }
});

test('on a slope: level on a foundation down to the terrain, with no hole and no hill left inside', () => {
    const slope = (x, z) => Math.floor((x + z) / 8);
    const world = makeWorld(6, slope);
    const { game, messages } = makeGame(world, { x: 0, z: 1 }, { x: 0.5, y: slope(0, 0) + 2.62, z: 0.5 });
    game.constructionCommand('build', [NAME]);
    run(game);
    assert.ok(messages.some((text) => text.includes('finished')), messages.join(' | '));
    const baseY = slope(0, 3);
    const layout = ctx.constructionLayout(PLAN, 0, { x: 0, z: 3 }, baseY, world.blockTypes);
    for (const cell of layout.cells) assert.equal(world.getBlockTypeAt(cell.x, cell.y, cell.z), cell.type);
    // Under the floor of every column: solid down to the terrain, on the low side as well.
    for (const [x, z] of [[layout.min.x, layout.min.z], [layout.min.x + 40, layout.min.z + 2], [layout.min.x + 1, layout.min.z + 45], [layout.min.x + 54, layout.min.z + 50]]) {
        for (let y = slope(x, z) + 1; y < baseY; y++) assert.ok(world.hasSolidBlock(x, y, z), `hole at ${x},${y},${z}`);
    }
    // The hill is gone from the rooms: the high corner's room is empty above its floor.
    const [ox, oz] = [layout.min.x + 48, layout.min.z + 44];
    assert.equal(world.getBlockTypeAt(ox, baseY + 2, oz), null);
});

test('in water: it stands on the surface, the foundation down to the bed, and the pool keeps its water', () => {
    const world = makeWorld(6, () => -3);
    for (let x = -60; x < 60; x++) {
        for (let z = -10; z < 80; z++) {
            for (let y = -2; y <= 3; y++) world.setEditedBlock(x, y, z, 'water');
        }
    }
    const { game, messages } = makeGame(world, { x: 0, z: 1 }, { x: 0.5, y: 8, z: 0.5 });
    game.constructionCommand('build', [NAME]);
    run(game);
    assert.ok(messages.some((text) => text.includes('finished')), messages.join(' | '));
    assert.equal(world.blockTypes[world.getBlockTypeAt(-1, 4, 3 + 10)].shape, 'door');
    assert.equal(world.getBlockTypeAt(-10, 3 + 2, 3 + 20), null, 'dry inside');
    assert.equal(world.getBlockTypeAt(-10, 1, 3 + 20), 'stone_bricks', 'foundation');
    assert.equal(world.getBlockTypeAt(-11, 3 + 1, 3 + 5), 'water_wheel:z', 'the wheel in its pool');
    assert.equal(world.getBlockTypeAt(-10, 3 + 1, 3 + 5), 'water');
});
