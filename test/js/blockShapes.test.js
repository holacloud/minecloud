// Node tests for non-cube blocks (js/blockShapes.js): block states, meshing and collisions.
// Run with: node --test test/js
//
// The browser scripts are loaded into one VM context with small stand-ins for THREE, the DOM
// and the chunk worker, so the real WorldRenderer, ChunkMesher and CameraController run.

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
    // Only rotations about +y are used by the camera.
    applyAxisAngle(axis, angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return this.set(this.x * c + this.z * s, this.y, -this.x * s + this.z * c);
    }
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
    const files = ['extensions.js', 'chunkStore.js', 'blockShapes.js', 'chunkMesher.js', 'camera.js', 'mobSpecies.js', 'blockTextures.js', 'world.js'];
    for (const file of files) vm.runInContext(fs.readFileSync(path.join(JS, file), 'utf8'), context, { filename: file });
    vm.runInContext('class Game {}', context);
    vm.runInContext(fs.readFileSync(path.join(JS, 'game', 'joinery.js'), 'utf8'), context, { filename: 'joinery.js' });
    vm.runInContext('this.WorldRenderer = WorldRenderer; this.ChunkMesher = ChunkMesher; this.ChunkColumn = ChunkColumn; this.CameraController = CameraController; this.BLOCK_SHAPES = BLOCK_SHAPES; this.Game = Game;', context);
    return context;
}

const ctx = loadGame();

// A world with one loaded, flat chunk: stone up to y = 0, the floor at y = 1.
function makeWorld() {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    // Meshing needs no GPU materials: one stand-in per type.
    world.getChunkMaterial = (type) => `material:${(world.blockTypes[type] && world.blockTypes[type].materialKey) || type}`;
    for (const [cx, cz] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
        const column = new ctx.ChunkColumn(cx, cz);
        const stone = world.registry.id('stone');
        for (let lx = 0; lx < 16; lx++) {
            for (let lz = 0; lz < 16; lz++) {
                for (let y = -16; y <= 0; y++) column.set(lx, y, lz, stone);
            }
        }
        world.columns.set(world.chunkKey(cx, cz), column);
    }
    return world;
}

function setBlock(world, x, y, z, type) {
    world.setEditedBlock(x, y, z, type);
}

function makeCamera(world, x, feetY, z, yaw = 0) {
    const camera = { position: new Vector3(x, feetY + 1.62, z), rotation: {} };
    const controller = new ctx.CameraController(camera, {});
    // In the world: the movement keys are the player's only with the pointer locked.
    controller.isLocked = true;
    controller.setBlockChecker((bx, by, bz) => world.hasSolidBlock(bx, by, bz));
    controller.setBlockTypeGetter((bx, by, bz) => world.getBlockTypeAt(bx, by, bz));
    controller.setBlockHeightGetter((bx, by, bz) => world.getCollisionHeight(bx, by, bz));
    controller.setCollisionBoxGetter((bx, by, bz) => world.getCollisionBoxes(bx, by, bz));
    controller.spawnSettling = false;
    controller.onGround = true;
    controller.yaw = yaw;
    return controller;
}

function walk(controller, seconds, keys = { forward: true }) {
    Object.assign(controller.keys, keys);
    for (let t = 0; t < seconds; t += 1 / 60) controller.update(1 / 60);
    Object.keys(keys).forEach((key) => { controller.keys[key] = false; });
}

// Arrays from the VM context have another Array prototype: compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value));

const feet = (controller) => controller.camera.position.y - controller.eyeHeight - controller.stepSmoothing;

test('block states become block types named after their state', () => {
    const world = makeWorld();
    const types = world.blockTypes;
    assert.equal(types.oak_stairs.state.facing, 'n');
    assert.equal(types['oak_stairs:e:top'].variantOf, 'oak_stairs');
    assert.equal(types['oak_stairs:e:top'].dropType, 'oak_stairs');
    assert.equal(types['oak_stairs:e:top'].materialKey, 'oak_stairs');
    assert.equal(Object.keys(types).filter((name) => name === 'oak_door' || name.startsWith('oak_door:')).length, 32);
    assert.equal(types['oak_door:upper:s:right:open'].materialKey, 'oak_door#upper');
    assert.equal(types['oak_fence_gate:w:open'].solid, false);
    assert.equal(world.getShapeStateType('oak_door', { half: 'lower', facing: 'n', hinge: 'left', open: 'closed' }), 'oak_door');
    assert.equal(world.getShapeStateType('oak_stairs', { facing: 'w', half: 'bottom' }), 'oak_stairs:w:bottom');
    // Every state is a registry block (stored by name in chunks); none is an inventory item.
    assert.ok(world.registry.id('iron_door:upper:e:left:open') > 0);
    assert.ok(world.registry.shaped[world.registry.id('glass_pane')]);
    assert.equal(world.registry.fullCube[world.registry.id('stone_stairs')], 0);
    assert.equal(world.registry.height[world.registry.id('oak_fence')], 1.5);
});

test('stairs rotate their step towards the facing', () => {
    const world = makeWorld();
    const boxes = (type) => world.shapes.boxes(world.registry.id(type));
    assert.deepEqual(plain(boxes('oak_stairs')[1]), [0, 0.5, 0, 1, 1, 0.5]);
    assert.deepEqual(plain(boxes('oak_stairs:e:bottom')[1]), [0.5, 0.5, 0, 1, 1, 1]);
    assert.deepEqual(plain(boxes('oak_stairs:s:bottom')[1]), [0, 0.5, 0.5, 1, 1, 1]);
    assert.deepEqual(plain(boxes('oak_stairs:w:bottom')[1]), [0, 0.5, 0, 0.5, 1, 1]);
    assert.deepEqual(plain(boxes('oak_stairs:n:top')[0]), [0, 0.5, 0, 1, 1, 1]);
});

test('fences and panes connect to their neighbours', () => {
    const world = makeWorld();
    setBlock(world, 2, 1, 2, 'oak_fence');
    setBlock(world, 3, 1, 2, 'spruce_fence');
    setBlock(world, 2, 1, 1, 'cobblestone');
    setBlock(world, 1, 1, 2, 'glass_pane');
    const fence = world.registry.id('oak_fence');
    // East (another wood's fence) and north (a solid cube), not west (a pane).
    assert.equal(world.getShapeMask(fence, 2, 1, 2), 1 | 2);
    // Gates join fences in line with them only.
    setBlock(world, 2, 1, 3, 'oak_fence_gate');
    assert.equal(world.getShapeMask(fence, 2, 1, 2) & 4, 0);
    setBlock(world, 2, 1, 3, 'oak_fence_gate:e:closed');
    assert.equal(world.getShapeMask(fence, 2, 1, 2) & 4, 4);
    // A lone pane is a cross; a pane with one neighbour runs straight through.
    const pane = world.registry.id('glass_pane');
    assert.equal(world.shapes.boxes(pane, 0).length, 5);
    assert.equal(world.shapes.boxes(pane, 2).length, 3);
});

test('the mesher draws shaped blocks without hidden faces', () => {
    const world = makeWorld();
    for (let x = 2; x <= 4; x++) setBlock(world, x, 1, 2, 'glass_pane');
    setBlock(world, 6, 1, 6, 'oak_stairs');
    world.activeChunks.add('0,0');
    const result = world.mesher.build(0, 0);
    let vertices = 0;
    for (const bucket of result.buckets) {
        vertices += bucket.vertexCount;
        assert.ok(bucket.positions.every(Number.isFinite));
        assert.ok(bucket.light.every(Number.isFinite));
    }
    const paneBucket = result.buckets.find((bucket) => bucket.material === 'material:glass_pane');
    const stairsBucket = result.buckets.find((bucket) => bucket.material === 'material:oak_stairs');
    assert.ok(paneBucket && stairsBucket);
    // Panes in a row: no faces where they meet (x = 3 and x = 4 planes, from either side).
    for (let i = 0; i < paneBucket.positions.length; i += 12) {
        const xs = [0, 3, 6, 9].map((k) => paneBucket.positions[i + k]);
        const flatInX = xs.every((value) => value === xs[0]);
        assert.ok(!(flatInX && (xs[0] === 3 || xs[0] === 4)), `face at x = ${xs[0]}`);
    }
    // Stairs on the ground: bottom face culled; 2 boxes * 6 faces - bottom - the buried
    // underside of the step = 10 faces.
    assert.equal(stairsBucket.vertexCount / 4, 10);
    // Every triangle maps back to its block for raycasting.
    assert.equal(stairsBucket.blocks.length / 3, stairsBucket.indices.length / 3);
    assert.ok(stairsBucket.blocks.every((value, i) => value === [6, 1, 6][i % 3]));
    assert.ok(vertices > 0);
});

test('players walk up stairs without jumping', () => {
    const world = makeWorld();
    // Stairs at z = 4 facing north, then a block behind them at z = 3 (top at y = 2).
    setBlock(world, 2, 1, 4, 'oak_stairs');
    setBlock(world, 2, 1, 3, 'stone');
    const player = makeCamera(world, 2.5, 1, 6.5, 0);
    walk(player, 0.7);
    assert.ok(Math.abs(feet(player) - 2) < 0.01, `feet at ${feet(player)}`);
    assert.ok(player.camera.position.z < 4, `z at ${player.camera.position.z}`);
    // A full block without stairs still needs a jump.
    const other = makeWorld();
    setBlock(other, 2, 1, 4, 'stone');
    const blocked = makeCamera(other, 2.5, 1, 6.5, 0);
    walk(blocked, 1.2);
    assert.ok(Math.abs(feet(blocked) - 1) < 0.01);
    assert.ok(blocked.camera.position.z > 4.8);
});

test('the step-up view smoothing never moves the body', () => {
    const world = makeWorld();
    setBlock(world, 2, 1, 4, 'stone_slab');
    const player = makeCamera(world, 2.5, 1, 5.6, 0);
    walk(player, 0.2);
    assert.ok(player.stepSmoothing <= 0);
    walk(player, 0.6, {});
    assert.equal(player.stepSmoothing, 0);
    assert.ok(Math.abs(player.camera.position.y - player.eyeHeight - 1.5) < 0.01);
});

test('fences stop players, who cannot jump over them', () => {
    const world = makeWorld();
    for (let x = 0; x <= 5; x++) setBlock(world, x, 1, 4, 'oak_fence');
    const player = makeCamera(world, 2.5, 1, 6.5, 0);
    walk(player, 1.5, { forward: true, jump: true });
    assert.ok(player.camera.position.z > 4.5, `z at ${player.camera.position.z}`);
    // Mobs search their floor from one block above their feet: 1.5 is too high to climb.
    assert.equal(player.getFloorY(2.5, 4.5, 2), 2.5);
    // Beside a lone post the floor is the ground.
    setBlock(world, 8, 1, 8, 'oak_fence');
    assert.equal(player.getFloorY(8.1, 8.1, 2), 1);
});

test('closed doors block the way and open ones do not', () => {
    const world = makeWorld();
    const placed = world.getPlacementBlocks('oak_door', 2, 1, 4, {
        normal: { x: 0, y: 1, z: 0 }, hit: { x: 2.3, y: 1, z: 4.5 }, look: { x: 0, z: -1 }
    });
    assert.deepEqual(plain(placed.map((part) => part.blockType)), ['oak_door', 'oak_door:upper:n:left:closed']);
    assert.deepEqual(plain(placed.map((part) => part.y)), [1, 2]);
    placed.forEach((part) => setBlock(world, part.x, part.y, part.z, part.blockType));
    // Walls on both sides of the doorway.
    for (const x of [1, 3]) for (const y of [1, 2]) setBlock(world, x, y, 4, 'stone');

    const closed = makeCamera(world, 2.5, 1, 6.5, 0);
    walk(closed, 1.5);
    assert.ok(closed.camera.position.z > 4.8, `z at ${closed.camera.position.z}`);

    setBlock(world, 2, 1, 4, 'oak_door:lower:n:left:open');
    setBlock(world, 2, 2, 4, 'oak_door:upper:n:left:open');
    const open = makeCamera(world, 2.5, 1, 6.5, 0);
    walk(open, 1.5);
    assert.ok(open.camera.position.z < 3.5, `z at ${open.camera.position.z}`);

    // No room above, or nothing below: no door.
    assert.equal(world.getPlacementBlocks('oak_door', 2, 1, 2, {
        normal: { x: 0, y: 1, z: 0 }, hit: { x: 2.5, y: 1, z: 2.5 }, look: { x: 0, z: -1 }
    }) !== null, true);
    setBlock(world, 2, 2, 2, 'stone');
    assert.equal(world.getPlacementBlocks('oak_door', 2, 1, 2, {
        normal: { x: 0, y: 1, z: 0 }, hit: { x: 2.5, y: 1, z: 2.5 }, look: { x: 0, z: -1 }
    }), null);
});

test('doors next to a door hinge on the outer side, and toggling flips both halves', () => {
    const world = makeWorld();
    const ctxFor = (hitX) => ({ normal: { x: 0, y: 1, z: 0 }, hit: { x: hitX, y: 1, z: 4.5 }, look: { x: 0, z: -1 } });
    world.getPlacementBlocks('oak_door', 2, 1, 4, ctxFor(2.2)).forEach((part) => setBlock(world, part.x, part.y, part.z, part.blockType));
    const second = world.getPlacementBlocks('oak_door', 3, 1, 4, ctxFor(3.2));
    assert.equal(world.blockTypes[second[0].blockType].state.hinge, 'right');

    const sent = [];
    const game = Object.create(ctx.Game.prototype);
    Object.assign(game, {
        world,
        network: { connected: true, send: (type, payload) => sent.push([type, payload]) },
        getInteractionRay: () => ({ direction: { x: 0, y: 0, z: -1 } }),
        playNoiseBurst() {}, playTone() {}
    });
    world.addBlock = (payload) => { setBlock(world, payload.x, payload.y, payload.z, payload.blockType); return true; };
    assert.equal(game.joineryToggle({ x: 2, y: 2, z: 4 }), true);
    assert.equal(world.getBlockTypeAt(2, 1, 4), 'oak_door:lower:n:left:open');
    assert.equal(world.getBlockTypeAt(2, 2, 4), 'oak_door:upper:n:left:open');
    assert.deepEqual(sent.map(([type, payload]) => [type, payload.y]), [['blockPlace', 2], ['blockPlace', 1]]);
    // Gates swing away from whoever opens them.
    setBlock(world, 6, 1, 6, 'oak_fence_gate');
    game.getInteractionRay = () => ({ direction: { x: 0, y: 0, z: 1 } });
    game.joineryToggle({ x: 6, y: 1, z: 6 });
    assert.equal(world.getBlockTypeAt(6, 1, 6), 'oak_fence_gate:s:open');
    assert.deepEqual(plain(world.getCollisionBoxes(6, 1, 6)), []);
});

test('stairs and trapdoors read their state from the click', () => {
    const world = makeWorld();
    const place = (type, normal, hitY, look) => world.getPlacementBlocks(type, 2, 1, 2, { normal, hit: { x: 2.5, y: hitY, z: 2.5 }, look })[0].blockType;
    assert.equal(place('oak_stairs', { x: 0, y: 1, z: 0 }, 1, { x: 1, z: 0.2 }), 'oak_stairs:e:bottom');
    assert.equal(place('oak_stairs', { x: 1, y: 0, z: 0 }, 1.7, { x: -1, z: 0 }), 'oak_stairs:w:top');
    assert.equal(place('oak_stairs', { x: 0, y: -1, z: 0 }, 2, { x: 0, z: 1 }), 'oak_stairs:s:top');
    // Against a wall to the west, the trapdoor hinges on that wall.
    assert.equal(place('oak_trapdoor', { x: 1, y: 0, z: 0 }, 1.2, { x: -1, z: 0 }), 'oak_trapdoor:w:bottom:closed');
});

test('inventory icons of every shaped block draw in the cube view', () => {
    const world = makeWorld();
    const drawShapeIcon = vm.runInContext('drawShapeIcon', ctx);
    let faces = 0;
    const canvas = { width: 16, height: 16 };
    const fake = new Proxy({}, {
        get: (target, key) => key === 'drawImage' ? () => { faces++; } : key in target ? target[key] : () => {},
        set: (target, key, value) => { target[key] = value; return true; }
    });
    for (const [type, def] of Object.entries(world.blockTypes)) {
        if (!def.shape || def.variantOf) continue;
        const id = world.registry.id(type);
        const before = faces;
        drawShapeIcon(fake, 64, world.shapes.boxes(id, world.shapes.shapes[id].iconMask || 0), { top: canvas, side: canvas });
        assert.ok(faces - before >= 3, `${type} drew ${faces - before} faces`);
    }
});

test('a fence keeps its rails towards a neighbour that is being mined', () => {
    const world = makeWorld();
    setBlock(world, 2, 1, 2, 'oak_fence');
    setBlock(world, 3, 1, 2, 'oak_fence');
    const count = (options) => {
        const bucket = world.mesher.build(0, 0, options).buckets.find((b) => b.material === 'material:oak_fence');
        return bucket.vertexCount;
    };
    // Hiding the east fence removes its own boxes, but the west fence keeps its two rails.
    const both = count({});
    const hidden = count({ hiddenBlock: { x: 3, y: 1, z: 2 } });
    const alone = (() => { setBlock(world, 3, 1, 2, null); return count({}); })();
    assert.ok(hidden > alone, `hidden ${hidden}, alone ${alone}, both ${both}`);
});

test('a face is hidden only when another box of the block covers all of it', () => {
    const { ChunkMesher } = loadGame();
    // A crank: a base with a thin shaft on top. The base's top stays visible around the shaft.
    const base = [0.2, 0, 0.2, 0.8, 0.4, 0.8];
    const shaft = [0.45, 0.4, 0.45, 0.55, 0.8, 0.55];
    assert.equal(ChunkMesher.faceBuried([base, shaft], base, 1, true), false);
    // The shaft's underside sits fully on the base: hidden.
    assert.equal(ChunkMesher.faceBuried([base, shaft], shaft, 1, false), true);
    // A plate against a wider casing: hidden; against a smaller connector: visible.
    const casing = [0, 0, 0.3, 1, 1, 1];
    const plate = [0.1, 0.1, 0.2, 0.9, 0.9, 0.3];
    const connector = [0.3, 0.3, 0.25, 0.7, 0.7, 0.3];
    assert.equal(ChunkMesher.faceBuried([casing, plate], plate, 2, true), true);
    assert.equal(ChunkMesher.faceBuried([casing, connector], casing, 2, false), false);
});
