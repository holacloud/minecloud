// Node tests for the near plane against the walls: for every yaw, pitch, field of view and aspect, with the
// player really walked against walls and into corners by the real CameraController, no part of the near
// plane may be inside something solid (the view would cut that away and show what is behind it). The real
// camera.js, game.js, world.js, joinery.js, furniture.js, seating.js and ultra.js run here.
// Run with: node --test test/js/camera_near.test.js
// With REPRO=1 in the environment it also prints what it measures.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js');
const log = (...args) => { if (process.env.REPRO) console.log(...args); };

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    // Only ever about the vertical axis here.
    applyAxisAngle(_axis, angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return this.set(this.x * c + this.z * s, this.y, this.z * c - this.x * s);
    }
}
class Stub { constructor() { this.attributes = {}; } setAttribute() {} addGroup() {} setIndex() {} computeBoundingBox() {} computeBoundingSphere() {} }

function loadGame() {
    const context = vm.createContext({
        console, performance: { now: () => 0 },
        THREE: { Vector3, Vector4: Vector3, BoxGeometry: Stub, BufferGeometry: Stub, Float32BufferAttribute: Stub, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) } },
        Worker: class { postMessage() {} },
        document: { addEventListener() {} },
        addEventListener() {},
        requestAnimationFrame: () => 0
    });
    context.window = context;
    const scripts = [
        'extensions.js', 'chunkStore.js', 'blockShapes.js', 'chunkMesher.js', 'camera.js', 'mobSpecies.js', 'blockTextures.js', 'game.js',
        'game/joinery.js', 'game/furniture.js', 'world.js', 'game/seating.js', 'game/ultra.js'
    ];
    for (const file of scripts) vm.runInContext(fs.readFileSync(path.join(JS, file), 'utf8'), context, { filename: file });
    vm.runInContext('Object.assign(this, { WorldRenderer, ChunkColumn, CameraController, Game, cameraNearFor, CAMERA_CLEARANCE });', context);
    return context;
}
const ctx = loadGame();

const FOVS = [55, 70, 75, 90, 100]; // The settings' slider goes from 55 to 100; 70 is the default.
const ASPECTS = { 'phone upright': 0.46, 'tablet upright': 0.75, square: 1, '4:3': 4 / 3, '16:9': 16 / 9, 'phone lying': 2.17, '21:9': 21 / 9, '32:9': 32 / 9 };
const YAWS = Array.from({ length: 72 }, (_, i) => (i * 5 * Math.PI) / 180);
const PITCHES = Array.from({ length: 37 }, (_, i) => ((i * 5 - 90) * Math.PI) / 180);

// The four corners of a camera's near plane in the world (rotation order YXZ, as the game's).
function nearCorners(eye, yaw, pitch, near, fov, aspect) {
    const tanY = Math.tan((fov * Math.PI) / 360);
    const tanX = tanY * aspect;
    const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
        const x = u * tanX * near;
        const y0 = v * tanY * near;
        const z0 = -near;
        const y = y0 * cp - z0 * sp;
        const z = y0 * sp + z0 * cp;
        return [eye.x + x * cy + z * sy, eye.y + y, eye.z - x * sy + z * cy];
    });
}

function boxesTouching(boxesAt, point) {
    const [x, y, z] = point;
    const [cx, cy, cz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
    for (const by of [cy - 1, cy]) {
        for (const box of boxesAt(cx, by, cz)) {
            if (x > cx + box[0] && x < cx + box[3] && y > by + box[1] && y < by + box[4] && z > cz + box[2] && z < cz + box[5]) return true;
        }
    }
    return false;
}

// How many of the yaw and pitch combinations have the near plane in something solid, and at which pitches.
function sweep(eye, boxesAt, near, fov, aspect) {
    let crossed = 0;
    const pitches = new Set();
    for (const yaw of YAWS) {
        for (const pitch of PITCHES) {
            if (nearCorners(eye, yaw, pitch, near, fov, aspect).some((corner) => boxesTouching(boxesAt, corner))) {
                crossed++;
                pitches.add(Math.round((pitch * 180) / Math.PI));
            }
        }
    }
    return { crossed, pitches: [...pitches].sort((a, b) => a - b) };
}

function distanceToBox(point, cell, box) {
    return Math.hypot(
        Math.max(cell[0] + box[0] - point.x, 0, point.x - cell[0] - box[3]),
        Math.max(cell[1] + box[1] - point.y, 0, point.y - cell[1] - box[4]),
        Math.max(cell[2] + box[2] - point.z, 0, point.z - cell[2] - box[5])
    );
}

function distanceToBoxes(point, boxesAt) {
    let nearest = Infinity;
    for (let y = Math.floor(point.y) - 2; y <= Math.floor(point.y) + 1; y++) {
        for (let x = Math.floor(point.x) - 1; x <= Math.floor(point.x) + 1; x++) {
            for (let z = Math.floor(point.z) - 1; z <= Math.floor(point.z) + 1; z++) {
                for (const box of boxesAt(x, y, z)) nearest = Math.min(nearest, distanceToBox(point, [x, y, z], box));
            }
        }
    }
    return nearest;
}

function makeController(boxesAt, eye) {
    const camera = { position: new Vector3(eye.x, eye.y, eye.z), rotation: {} };
    const controller = new ctx.CameraController(camera, {});
    controller.isLocked = true;
    controller.spawnSettling = false;
    controller.onGround = true;
    controller.setCollisionBoxGetter(boxesAt);
    controller.setBlockChecker((x, y, z) => boxesAt(x, y, z).length > 0);
    return controller;
}

// A closed room of 3 by 3 cells (x and z from 0 to 3) and `height` cells high, its floor at y = 1.
function room(height) {
    const full = [[0, 0, 0, 1, 1, 1]];
    return (x, y, z) => ((x >= 0 && x < 3 && z >= 0 && z < 3 && y >= 1 && y < 1 + height) ? [] : full);
}

// One pillar at the cell (1, 1), to go around its edges, on a floor at y = 1.
function pillar() {
    const full = [[0, 0, 0, 1, 1, 1]];
    return (x, y, z) => ((y < 1 || (x === 1 && z === 1)) ? full : []);
}

// Where to walk to: the yaw that goes from the middle of the room to each wall and corner.
const HEADINGS = [0, 45, 90, 135, 180, 225, 270, 315].map((degrees) => (degrees * Math.PI) / 180);

// Walks `seconds` that way from the eye's position, frame by frame, keeping the closest the eye ever was
// to the boxes. Returns the last position and that distance.
function walk(controller, boxesAt, yaw, seconds, delta, setup = () => {}) {
    controller.yaw = yaw;
    controller.keys.forward = true;
    let closest = Infinity;
    for (let time = 0; time < seconds; time += delta) {
        setup(controller);
        controller.update(delta);
        closest = Math.min(closest, distanceToBoxes(controller.camera.position, boxesAt));
    }
    controller.keys.forward = false;
    return { eye: controller.camera.position.clone(), closest };
}

function eyesAgainstWalls() {
    const boxes = room(4);
    return HEADINGS.map((yaw) => {
        const controller = makeController(boxes, { x: 1.5, y: 2.62, z: 1.5 });
        return walk(controller, boxes, yaw, 1.5, 1 / 60).eye;
    });
}

test('with the old near plane of 0.1 the view goes through the corner of a room when looking down', () => {
    const boxes = room(4);
    const fov = 70;
    const aspect = 16 / 9;
    let level = 0;
    let tilted = 0;
    const pitchesSeen = new Set();
    for (const eye of eyesAgainstWalls()) {
        const result = sweep(eye, boxes, 0.1, fov, aspect);
        result.pitches.forEach((pitch) => pitchesSeen.add(pitch));
        if (result.pitches.includes(0)) level++;
        tilted += result.crossed;
    }
    log(`near 0.1, fov 70, 16:9: ${tilted} crossings; at pitches ${[...pitchesSeen].sort((a, b) => a - b)}`);
    assert.ok(tilted > 0, 'the bug the player saw');
    assert.equal(level, 0, 'looking level it does not happen, which is why it took tilting the head');
    assert.ok(pitchesSeen.has(-35), 'looking down by half the vertical field of view it is worst');
});

test('no yaw, pitch, field of view or aspect has the near plane in a wall, a corner or the edge of a pillar', () => {
    const scenes = [];
    const boxes = room(4);
    eyesAgainstWalls().forEach((eye) => scenes.push({ eye, boxes }));
    const around = pillar();
    for (const [x, z] of [[0, 0], [2.9, 0], [0, 2.9], [2.9, 2.9], [0.2, 1.5], [1.5, 0.2]]) {
        for (const yaw of HEADINGS) {
            const controller = makeController(around, { x, y: 2.62, z });
            scenes.push({ eye: walk(controller, around, yaw, 1, 1 / 60).eye, boxes: around });
        }
    }
    const failures = [];
    for (const fov of FOVS) {
        for (const [name, aspect] of Object.entries(ASPECTS)) {
            const near = ctx.cameraNearFor(fov, aspect);
            const before = scenes.reduce((sum, scene) => sum + sweep(scene.eye, scene.boxes, 0.1, fov, aspect).crossed, 0);
            const after = scenes.reduce((sum, scene) => sum + sweep(scene.eye, scene.boxes, near, fov, aspect).crossed, 0);
            const reach = (corner) => corner * Math.hypot(1, Math.tan((fov * Math.PI) / 360) * aspect, Math.tan((fov * Math.PI) / 360));
            log(`fov ${fov} ${name}: near ${near.toFixed(4)}, corner at ${reach(0.1).toFixed(3)} -> ${reach(near).toFixed(3)}, crossings ${before} -> ${after}`);
            if (after > 0) failures.push(`fov ${fov} ${name}: ${after}`);
        }
    }
    assert.deepEqual(failures, []);
});

test('the near plane is only ever pulled closer, and as little as it takes', () => {
    assert.equal(ctx.cameraNearFor(55, 1), 0.1, 'a narrow view needs no change');
    assert.equal(ctx.cameraNearFor(15, 16 / 9), 0.1, 'through a telescope neither');
    for (const fov of FOVS) {
        for (const aspect of Object.values(ASPECTS)) {
            const near = ctx.cameraNearFor(fov, aspect);
            assert.ok(near <= 0.1 && near >= 0.03, `fov ${fov}, aspect ${aspect}: ${near}`);
            const tan = Math.tan((fov * Math.PI) / 360);
            const corner = near * Math.hypot(1, tan * aspect, tan);
            assert.ok(corner <= ctx.CAMERA_CLEARANCE + 1e-9, `fov ${fov}, aspect ${aspect}: corner at ${corner}`);
            if (near < 0.1) assert.ok(corner > ctx.CAMERA_CLEARANCE - 1e-9, 'no closer than needed');
        }
    }
    // A strip of a window does not take the depth buffer with it.
    assert.equal(ctx.cameraNearFor(100, 40), 0.02);
});

test('the eye keeps its distance at every speed and frame rate, and in every way of moving', () => {
    const modes = {
        walking: { height: 2, setup: () => {} },
        sprinting: { height: 2, setup: (c) => { c.keys.sprint = true; } },
        crouching: { height: 2, setup: (c) => { c.keys.crouch = true; } },
        jumping: { height: 2, setup: (c) => { c.keys.jump = true; } },
        'crouching and standing in the air': { height: 2, setup: (c) => { c.keys.jump = true; c.keys.crouch = !c.onGround && c.velocityY > 0; } },
        swimming: { height: 3, types: 'water', setup: (c) => { c.keys.jump = true; } },
        'on a ladder': { height: 2, types: 'ladder', setup: () => {} },
        flying: { height: 3, setup: (c) => { c.flightAllowed = true; c.flying = true; c.keys.jump = true; } },
        'flying fast': { height: 3, setup: (c) => { c.flightAllowed = true; c.flying = true; c.keys.sprint = true; c.keys.jump = true; } },
        'riding a horse': {
            height: 4,
            setup: (c) => { if (!c.mount) { c.setMount({ eyeHeight: 2.1, speed: 9, autoJump: 7, jump: 8 }); } c.keys.jump = true; }
        }
    };
    for (const [name, mode] of Object.entries(modes)) {
        const boxes = room(mode.height);
        let closest = Infinity;
        for (const delta of [1 / 144, 1 / 60, 1 / 30, 1 / 20, 0.1]) {
            for (const yaw of HEADINGS) {
                const controller = makeController(boxes, { x: 1.5, y: 2.62, z: 1.5 });
                if (mode.types) controller.setBlockTypeGetter(() => mode.types);
                closest = Math.min(closest, walk(controller, boxes, yaw, 2, delta, mode.setup).closest);
            }
        }
        log(`${name}: the eye came within ${closest.toFixed(4)} of a box`);
        assert.ok(closest >= 0.16 - 1e-6, `${name}: the eye came within ${closest} of a box`);
    }
});

// ---------------------------------------------------------------- blocks that are not cubes

function makeWorld() {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    world.getChunkMaterial = (type) => `material:${(world.blockTypes[type] && world.blockTypes[type].materialKey) || type}`;
    const stone = world.registry.id('stone');
    for (const [cx, cz] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
        const column = new ctx.ChunkColumn(cx, cz);
        for (let lx = 0; lx < 16; lx++) {
            for (let lz = 0; lz < 16; lz++) {
                for (let y = -16; y <= 0; y++) column.set(lx, y, lz, stone);
            }
        }
        world.columns.set(world.chunkKey(cx, cz), column);
    }
    return world;
}

// What is drawn at a cell: the boxes of its shape, or its collision for a cube or a slab.
function drawnBoxes(world) {
    return (x, y, z) => {
        const id = world.getBlockId(x, y, z);
        return world.registry.shaped[id] ? world.shapes.boxes(id, world.getShapeMask(id, x, y, z)) : world.getCollisionBoxes(x, y, z);
    };
}

function firstOfShape(world, shape, state) {
    const name = Object.keys(world.blockTypes).find((type) => {
        const def = world.blockTypes[type];
        return def.shape === shape && def.state && Object.entries(state).every(([key, value]) => def.state[key] === value);
    });
    assert.ok(name, `a block of shape ${shape}`);
    return name;
}

test('what is built of panes, doors, trapdoors, fences, stairs and slabs stops the view too', () => {
    const pieces = {
        pane: (world) => [firstOfShape(world, 'pane', {}), firstOfShape(world, 'pane', {})],
        'closed door': (world) => [firstOfShape(world, 'door', { half: 'lower', facing: 'n', open: 'closed' }), firstOfShape(world, 'door', { half: 'upper', facing: 'n', open: 'closed' })],
        'open door': (world) => [firstOfShape(world, 'door', { half: 'lower', facing: 'e', open: 'open' }), firstOfShape(world, 'door', { half: 'upper', facing: 'e', open: 'open' })],
        trapdoor: (world) => {
            const type = firstOfShape(world, 'trapdoor', { open: 'open' });
            return [type, type];
        },
        fence: (world) => [firstOfShape(world, 'fence', {}), firstOfShape(world, 'fence', {})],
        stairs: (world) => [firstOfShape(world, 'stairs', {}), 'stone'],
        slabs: () => ['stone_slab', 'stone_slab']
    };
    for (const [name, build] of Object.entries(pieces)) {
        const world = makeWorld();
        const [lower, upper] = build(world);
        // A wall of them three cells wide and two high.
        for (const x of [2, 3, 4]) {
            world.setEditedBlock(x, 1, 3, lower);
            world.setEditedBlock(x, 2, 3, upper);
        }
        const collision = (x, y, z) => world.getCollisionBoxes(x, y, z);
        const drawn = drawnBoxes(world);
        const all = (x, y, z) => [...collision(x, y, z), ...drawn(x, y, z)];
        let closest = Infinity;
        for (const [x, z] of [[3.5, 1.5], [3.5, 5.5], [1, 1], [6, 6], [1, 3.5], [6, 3.5]]) {
            for (const yaw of HEADINGS) {
                const controller = makeController(collision, { x, y: 2.62, z });
                const { eye } = walk(controller, collision, yaw, 1.5, 1 / 60);
                // Up a stair, or on a slab, the body is at another height: the eye is the eye.
                closest = Math.min(closest, distanceToBoxes(eye, all));
                if (yaw === HEADINGS[0]) {
                    assert.equal(sweep(eye, drawn, ctx.cameraNearFor(100, 2.17), 100, 2.17).crossed, 0, `${name}: fov 100 on a phone`);
                    assert.equal(sweep(eye, drawn, ctx.cameraNearFor(70, 16 / 9), 70, 16 / 9).crossed, 0, `${name}: fov 70`);
                }
            }
        }
        log(`${name}: the eye came within ${closest.toFixed(4)} of what is drawn`);
        assert.ok(closest >= ctx.CAMERA_CLEARANCE, `${name}: the eye came within ${closest} of what is drawn`);
    }
});

test('a door that closes on a player who stands still moves them out; with nowhere to go they stay', () => {
    const world = makeWorld();
    const collision = (x, y, z) => world.getCollisionBoxes(x, y, z);
    const closed = firstOfShape(world, 'door', { half: 'lower', facing: 'n', open: 'closed' });
    world.setEditedBlock(3, 1, 3, closed);
    world.setEditedBlock(3, 2, 3, firstOfShape(world, 'door', { half: 'upper', facing: 'n', open: 'closed' }));
    const door = world.getCollisionBoxes(3, 1, 3)[0];
    const controller = makeController(collision, { x: 3.5, y: 2.62, z: 3 + door[5] + 0.05 });
    controller.update(1 / 60);
    assert.ok(distanceToBoxes(controller.camera.position, collision) >= 0.16, 'out of the leaf');

    // Bricked in: no jumping about in there.
    const full = [[0, 0, 0, 1, 1, 1]];
    const walled = makeController(() => full, { x: 3.5, y: 2.62, z: 3.5 });
    walled.onGround = false;
    walled.velocityY = 0;
    walled.update(1 / 60);
    assert.equal(walled.camera.position.x, 3.5);
    assert.equal(walled.camera.position.z, 3.5);
});

test('a long frame takes nobody into a wall, up on top of it, or through a door', () => {
    for (const speed of [4.5, 6, 10, 22]) {
        for (const delta of [1 / 30, 1 / 20, 0.1]) {
            const boxes = room(2);
            for (const yaw of HEADINGS) {
                const controller = makeController(boxes, { x: 1.5, y: 2.62, z: 1.5 });
                controller.moveSpeed = speed;
                walk(controller, boxes, yaw, 1, delta);
                const { x, y, z } = controller.camera.position;
                assert.equal(y, 2.62, `at ${speed} blocks a second and ${delta} a frame the feet stay on the floor`);
                assert.ok(x > 0 && x < 3 && z > 0 && z < 3, `at ${speed} blocks a second and ${delta} a frame still in the room: ${x}, ${z}`);
            }
        }
    }
    const world = makeWorld();
    const collision = (x, y, z) => world.getCollisionBoxes(x, y, z);
    const lower = firstOfShape(world, 'door', { half: 'lower', facing: 'n', open: 'closed' });
    const upper = firstOfShape(world, 'door', { half: 'upper', facing: 'n', open: 'closed' });
    world.setEditedBlock(3, 1, 3, lower);
    world.setEditedBlock(3, 2, 3, upper);
    const door = world.getCollisionBoxes(3, 1, 3)[0];
    const controller = makeController(collision, { x: 3.5, y: 2.62, z: 3 + door[5] + 0.5 });
    controller.moveSpeed = 6;
    walk(controller, collision, 0, 1, 0.1); // Facing -z: at the door, 0.6 a frame.
    assert.ok(controller.camera.position.z > 3 + door[5], 'on this side of the door');
});

test('a stair is still walked up at any frame rate, and a block is not', () => {
    for (const delta of [1 / 60, 1 / 20, 0.1]) {
        const world = makeWorld();
        const collision = (x, y, z) => world.getCollisionBoxes(x, y, z);
        for (let x = 0; x < 8; x++) world.setEditedBlock(x, 1, 3, 'stone_slab');
        for (let x = 0; x < 8; x++) world.setEditedBlock(x, 1, 2, 'stone');
        for (let x = 0; x < 8; x++) { world.setEditedBlock(x, 2, 2, 'stone'); world.setEditedBlock(x, 3, 2, 'stone'); }
        const controller = makeController(collision, { x: 3.5, y: 2.62, z: 5.5 });
        walk(controller, collision, 0, 2, delta);
        const { y, z } = controller.camera.position;
        assert.ok(Math.abs(y - 3.12) < 1e-6, `${delta}: up on the slab, at ${y}`);
        assert.ok(z >= 3 + 0.16, `${delta}: and stopped by the wall behind it, at ${z}`);
    }
});

test('walking along a wall nobody is pushed: standing near one, the position does not change', () => {
    const boxes = room(4);
    const controller = makeController(boxes, { x: 1.5, y: 2.62, z: 1.5 });
    const { eye } = walk(controller, boxes, 0, 1.5, 1 / 60);
    for (let frame = 0; frame < 10; frame++) controller.update(1 / 60);
    assert.equal(controller.camera.position.x, eye.x);
    assert.equal(controller.camera.position.z, eye.z);
});

// ---------------------------------------------------------------- seats and beds

function seatedGame(world) {
    const camera = { position: new Vector3(0, 3, 0), rotation: {} };
    const controller = new ctx.CameraController(camera, {});
    controller.setCollisionBoxGetter((x, y, z) => world.getCollisionBoxes(x, y, z));
    const messages = [];
    const game = {
        world, cameraController: controller, ridingMob: null, seated: null, otherPlayerMeshes: new Map(),
        getBlockDisplayName: (type) => type,
        receiveSystemMessage: (message) => messages.push(message.text),
        getInteractionRay: () => ({ direction: { x: 0, z: -1 } }),
        playPlaceSound() {},
        bedTrySleep() {}
    };
    return { game, controller, messages };
}

test('sitting and lying, the eye is clear of everything that can be seen from there', () => {
    const world = makeWorld();
    const seats = Object.keys(world.blockTypes).filter((type) => world.blockTypes[type].seat && !world.blockTypes[type].variantOf);
    const beds = Object.keys(world.blockTypes).filter((type) => isBed(world, type));
    assert.ok(seats.length >= 4 && beds.length >= 4, `${seats.length} seats, ${beds.length} beds`);
    let closest = Infinity;
    for (const type of [...seats, ...beds]) {
        for (const lidded of [false, true]) {
            const here = makeWorld();
            here.setEditedBlock(3, 1, 3, type);
            // Against walls all around, as tight as it can be.
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                here.setEditedBlock(3 + dx, 1, 3 + dz, 'stone');
                here.setEditedBlock(3 + dx, 2, 3 + dz, 'stone');
            }
            if (lidded) here.setEditedBlock(3, 3, 3, 'stone');
            const { game, controller } = seatedGame(here);
            ctx.Game.prototype.seatTrySit.call(game, { x: 3, y: 1, z: 3 });
            assert.ok(game.seated, `${type}: sits`);
            const eye = controller.camera.position;
            const drawn = drawnBoxes(here);
            closest = Math.min(closest, distanceToBoxes(eye, drawn), distanceToBoxes(eye, (x, y, z) => here.getCollisionBoxes(x, y, z)));
            assert.equal(sweep(eye, drawn, ctx.cameraNearFor(100, 2.17), 100, 2.17).crossed, 0, `${type}: fov 100 on a phone`);
            assert.equal(sweep(eye, drawn, ctx.cameraNearFor(70, 16 / 9), 70, 16 / 9).crossed, 0, `${type}: fov 70`);
        }
    }
    log(`seats and beds: the eye came within ${closest.toFixed(4)} of what is drawn`);
    assert.ok(closest >= ctx.CAMERA_CLEARANCE, `the eye came within ${closest}`);
});

function isBed(world, type) {
    return Boolean(world.blockTypes[type].lieDown);
}

test('nobody sits with their eye in a slab overhead', () => {
    const chair = 'oak_chair';
    const world = makeWorld();
    assert.ok(world.blockTypes[chair], 'a chair');
    world.setEditedBlock(3, 1, 3, chair);
    world.setEditedBlock(3, 2, 3, 'stone_slab');
    const { game, messages } = seatedGame(world);
    ctx.Game.prototype.seatTrySit.call(game, { x: 3, y: 1, z: 3 });
    assert.equal(game.seated, null);
    assert.match(messages[0], /no room/);

    const free = makeWorld();
    free.setEditedBlock(3, 1, 3, chair);
    free.setEditedBlock(3, 3, 3, 'stone');
    const seated = seatedGame(free);
    ctx.Game.prototype.seatTrySit.call(seated.game, { x: 3, y: 1, z: 3 });
    assert.ok(seated.game.seated, 'with a cell of air overhead it is as ever');
});

// ---------------------------------------------------------------- third person and the frame

function thirdPersonGame(boxes, mode, anchor) {
    const camera = { position: new Vector3(), rotation: {}, lookAt() { this.looked = true; } };
    const controller = makeController(boxes, anchor);
    return {
        camera, cameraController: controller, cameraViewMode: mode, thirdPersonAnchor: null,
        updateLocalPlayerAvatar() {}
    };
}

test('third person: the camera stays out of the walls, however the player looks', () => {
    const boxes = room(3);
    const update = ctx.Game.prototype.updateThirdPersonCamera;
    let closest = Infinity;
    for (const mode of ['third', 'thirdBack']) {
        for (const start of [{ x: 1.5, y: 2.62, z: 1.5 }, { x: 0.161, y: 2.62, z: 0.161 }, { x: 2.839, y: 3.84, z: 0.161 }]) {
            const game = thirdPersonGame(boxes, mode, start);
            for (const yaw of YAWS) {
                for (const pitch of PITCHES) {
                    game.cameraController.yaw = yaw;
                    game.cameraController.pitch = pitch;
                    update.call(game, new Vector3(start.x, start.y, start.z), 1 / 60);
                    closest = Math.min(closest, distanceToBoxes(game.camera.position, boxes));
                }
            }
        }
    }
    log(`third person in a room: the camera came within ${closest.toFixed(4)} of a wall`);
    assert.ok(closest >= ctx.CAMERA_CLEARANCE - 1e-9, `the camera came within ${closest}`);
});

test('third person: with nothing in the way the camera is where it always was, and it comes back out smoothly', () => {
    const open = (x, y) => (y < 1 ? [[0, 0, 0, 1, 1, 1]] : []);
    const update = ctx.Game.prototype.updateThirdPersonCamera;
    const anchor = new Vector3(5.5, 2.62, 5.5);
    const expected = { third: 3.6, thirdBack: 3.8 };
    for (const mode of Object.keys(expected)) {
        const game = thirdPersonGame(open, mode, anchor);
        game.cameraController.yaw = 0.7;
        game.cameraController.pitch = -0.4; // From above, clear of the floor.
        update.call(game, anchor, 1 / 60);
        const target = { x: anchor.x, y: anchor.y - game.cameraController.eyeHeight + 1.55, z: anchor.z };
        const position = game.camera.position;
        const distance = Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z);
        assert.ok(Math.abs(distance - expected[mode]) < 1e-9, `${mode}: at ${distance}`);
    }

    // A wall behind, gone the next frame.
    let wall = true;
    const boxes = (x, y, z) => (y < 1 || (wall && z === 3) ? [[0, 0, 0, 1, 1, 1]] : []);
    const game = thirdPersonGame(boxes, 'third', anchor);
    game.cameraController.yaw = 0;
    game.cameraController.pitch = -0.2;
    const orbit = () => Math.hypot(game.camera.position.x - anchor.x, game.camera.position.y - (anchor.y - 0.07), game.camera.position.z - anchor.z);
    update.call(game, anchor, 1 / 60);
    const held = orbit();
    assert.ok(held < 3.6);
    wall = false;
    update.call(game, anchor, 1 / 60);
    assert.ok(orbit() > held && orbit() < held + 0.2, 'eases out');
    for (let frame = 0; frame < 60; frame++) update.call(game, anchor, 1 / 60);
    assert.ok(Math.abs(orbit() - 3.6) < 1e-9, 'all the way');
});

test('each frame takes the near plane from the camera as it is, before the mirrors copy its lens', () => {
    let projections = 0;
    const order = [];
    const camera = { fov: 70, aspect: 16 / 9, near: 0.1, updateProjectionMatrix() { projections++; } };
    const game = Object.create(ctx.Game.prototype);
    Object.assign(game, {
        camera, ultraModeEnabled: false, clock: { elapsedTime: 0 }, scene: {},
        world: { animateMaterials() {} },
        renderer: { render() { order.push(['render', camera.near]); } },
        mirrorsRender() { order.push(['mirrors', camera.near]); }
    });
    game.renderFrame(1 / 60);
    const near = ctx.cameraNearFor(70, 16 / 9);
    assert.ok(near < 0.1);
    assert.deepEqual(order, [['mirrors', near], ['render', near]]);
    assert.equal(projections, 1);
    game.renderFrame(1 / 60);
    assert.equal(projections, 1, 'nothing to do while nothing changes');

    // A wider window, and a telescope.
    camera.aspect = 21 / 9;
    game.renderFrame(1 / 60);
    assert.equal(camera.near, ctx.cameraNearFor(70, 21 / 9));
    camera.fov = 15;
    game.renderFrame(1 / 60);
    assert.equal(camera.near, 0.1);
    assert.equal(projections, 3);
});

test('the hands are never near the near plane, whichever it is', () => {
    // Depth of the group's position minus the farthest any of its boxes can reach from there towards the
    // eye, with the swing of mining (+0.08) in: js/game.js and initViewModel. They draw over everything
    // (depthTest off), so what could change is only what the plane cuts. The held item hangs on the far
    // side of the hand (0.55 forward of the sleeve), so it is farther still.
    const source = fs.readFileSync(path.join(JS, 'game.js'), 'utf8');
    const right = /handBasePosition = new THREE\.Vector3\(([^)]*)\)/.exec(source)[1].split(',').map(Number);
    const left = /leftHandBasePosition = new THREE\.Vector3\(([^)]*)\)/.exec(source)[1].split(',').map(Number);
    const reach = Math.hypot(0.65, 0.15, 0.15); // The hand's far corner, the most that turns towards the eye.
    for (const base of [right, left]) {
        assert.ok(-base[2] - 0.08 - reach > 0.1, `depth ${-base[2] - 0.08 - reach}`);
    }
});
