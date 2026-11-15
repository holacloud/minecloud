// Node tests for creative mode's "/tp" (js/game/creative.js): the numbers it takes, that it is no command at
// all outside creative mode, and where the player ends up on a flat world (support/flat_world.js).
// Run with: node --test test/js/creative.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { ROOT } = require('./support/game.js');
const { EYE, loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame();
const run = (code) => vm.runInContext(code, ctx);
const target = (...args) => JSON.parse(JSON.stringify(run(`creativeTpTarget(${JSON.stringify(args)})`)));

// The camera's own settling, until the player stands (camera.js), with the chunks coming as they are asked.
function settle(g) {
    for (let i = 0; i < 600 && g.cameraController.spawnSettling; i++) {
        g.frame();
        g.cameraController.updatePhysics(1 / 30);
    }
    assert.equal(g.cameraController.spawnSettling, false, 'the player came to stand');
}

test('the numbers of "/tp": a whole one is the middle of a block, one with decimals is taken as it is', () => {
    assert.deepEqual(target('10000', '-101000'), { x: 10000.5, y: null, z: -100999.5 });
    assert.deepEqual(target('10000,', '-101000'), { x: 10000.5, y: null, z: -100999.5 }, 'a pair copied with its comma');
    assert.deepEqual(target('12.3', '40.6', '-7.0'), { x: 12.3, y: 40.6, z: -7 }, 'what the corner of the screen says');
    assert.deepEqual(target('0', '20', '0'), { x: 0.5, y: 20, z: 0.5 });
    for (const bad of [[], ['5'], ['1', '2', '3', '4'], ['a', '2'], ['1', 'NaN'], ['1e3', '2'], ['', '2'], ['1', '2', 'x'], ['10000001', '0'], ['Infinity', '0']]) {
        assert.equal(run(`creativeTpTarget(${JSON.stringify(bad)})`), null, JSON.stringify(bad));
    }
});

test('"/tp x z" in creative mode puts the player on the ground there, looking the same way', () => {
    const g = makeFlatWorld(ctx, { blocks: { '300,0,-200': 'stone', '300,1,-200': 'stone' } });
    g.game.creativeMode = true;
    g.cameraController.yaw = 0.7;
    g.game.runChatCommand('/tp 200 -200');
    assert.match(g.said.at(-1), /^Teleported to X: 200\.5 Z: -199\.5$/);
    assert.ok(g.camera.position.y > 200, 'it starts over the top of the world');
    settle(g);
    const at = g.camera.position;
    assert.ok(Math.abs(at.x - 200.5) < 1e-9 && Math.abs(at.z - -199.5) < 1e-9, `at ${at.x}, ${at.z}`);
    assert.ok(Math.abs(at.y - EYE) < 1e-6, `feet on the grass: ${at.y - EYE}`);
    assert.equal(g.cameraController.yaw, 0.7);
    // Onto whatever is built there, never inside.
    g.game.runChatCommand('/tp 300 -200');
    settle(g);
    assert.ok(Math.abs(g.camera.position.y - EYE - 2) < 1e-6, `feet on the blocks: ${g.camera.position.y - EYE}`);
});

test('"/tp x y z" takes the X, Y and Z of the corner of the screen back to the same spot', () => {
    const g = makeFlatWorld(ctx, { x: 40.3, z: -12.8 });
    g.game.creativeMode = true;
    const noted = { x: g.camera.position.x, y: g.camera.position.y, z: g.camera.position.z };
    const corner = `${noted.x.toFixed(1)} ${noted.y.toFixed(1)} ${noted.z.toFixed(1)}`;
    g.game.runChatCommand('/tp 500 500');
    settle(g);
    g.game.runChatCommand(`/tp ${corner}`);
    settle(g);
    const at = g.camera.position;
    assert.ok(Math.abs(at.x - noted.x) < 0.051 && Math.abs(at.z - noted.z) < 0.051 && Math.abs(at.y - EYE) < 1e-6, `at ${at.x}, ${at.y}, ${at.z}`);
    // A height under the world or over it is brought inside: nobody is sent to fall for ever.
    g.game.runChatCommand('/tp 40.5 -9999 -12.5');
    assert.ok(g.camera.position.y > run('WORLD_MIN_Y'));
    settle(g);
    assert.ok(Math.abs(g.camera.position.y - EYE) < 1e-6, `out of the ground: ${g.camera.position.y - EYE}`);
});

test('outside creative mode there is no such command, and wrong numbers move nobody', () => {
    const g = makeFlatWorld(ctx);
    const before = { x: g.camera.position.x, z: g.camera.position.z };
    g.game.creativeMode = false;
    g.game.runChatCommand('/tp 200 200');
    assert.equal(g.said.at(-1), 'Unknown command: /tp');
    g.game.creativeMode = true;
    g.game.runChatCommand('/tp here');
    assert.match(g.said.at(-1), /^Usage: \/tp /);
    assert.deepEqual({ x: g.camera.position.x, z: g.camera.position.z }, before);
});

test('beyond the chunks the server gives, the player is told that nothing will appear', () => {
    // The same limit as handleChunkMessage (worldReach, pkg/network/chunks.go), and the weather's.
    const go = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'chunks.go'), 'utf8');
    assert.match(go, /\nconst worldReach = 1 << 21\n/);
    assert.match(go, /limit := worldReach \/ terrain\.ChunkSize/);
    assert.equal(run('CREATIVE_TP_REACH'), 1 << 21);
    assert.equal(run('WEATHER_LEGACY_REACH'), 1 << 21);
    const g = makeFlatWorld(ctx);
    g.game.creativeMode = true;
    // The farthest plaza of the portal network is there (pkg/network/portals.go).
    g.game.runChatCommand('/tp -1111000 0');
    assert.match(g.said.at(-1), /^Teleported to X: -1110999\.5 Z: 0\.5$/);
    g.game.runChatCommand('/tp 2097152 0');
    assert.match(g.said.at(-1), /no chunks 2,097,152 blocks or more/);
});
