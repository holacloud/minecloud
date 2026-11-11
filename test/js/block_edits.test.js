// Node tests for js/game/block_edits.js: the one way a block changed by the player, or by something acting
// for them, reaches the world and the server, and that nothing goes around it.
// Run with: node --test test/js/block_edits.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js');

function sources(dir = JS) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sources(full);
        return entry.name.endsWith('.js') ? [full] : [];
    });
}

// A Game with a world of its own, the real extensions and the real block edits.
function makeGame({ connected = true } = {}) {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(JS, 'extensions.js'), 'utf8'), context);
    vm.runInContext('class Game {}', context);
    vm.runInContext(fs.readFileSync(path.join(JS, 'game', 'block_edits.js'), 'utf8'), context);
    const game = vm.runInContext('new Game()', context);
    const blocks = new Map();
    const sent = [];
    const key = (x, y, z) => `${x},${y},${z}`;
    game.world = {
        // As WorldRenderer: false when nothing changed here.
        addBlock: (block) => {
            if (blocks.get(key(block.x, block.y, block.z)) === block.blockType) return false;
            blocks.set(key(block.x, block.y, block.z), block.blockType);
            return true;
        },
        removeBlockAt: (x, y, z) => blocks.delete(key(x, y, z))
    };
    game.network = { connected, send: (type, payload) => sent.push({ type, payload }) };
    game.blockPlaceOutgoing = (payload) => ({ ...payload, palette: true });
    const guard = (fn) => vm.runInContext('registerBlockEditGuard', context)(fn);
    return { game, blocks, sent, guard };
}

test('nothing but block_edits.js sends blockPlace or blockBreak', () => {
    const direct = /send\(\s*['"]block(Place|Break)['"]/;
    const offenders = sources()
        .filter((file) => path.basename(file) !== 'block_edits.js' && direct.test(fs.readFileSync(file, 'utf8')))
        .map((file) => path.relative(JS, file));
    assert.deepEqual(offenders, [], 'change blocks with placeBlockForAll / removeBlockForAll (js/game/block_edits.js)');
});

test('only the plots know the plots: nothing else asks them before changing a block', () => {
    const offenders = sources()
        .filter((file) => path.basename(file) !== 'claims.js' && /claim(Helper)?Refusal(At)?\(/.test(fs.readFileSync(file, 'utf8')))
        .map((file) => path.relative(JS, file));
    assert.deepEqual(offenders, [], 'ask this.blockEditRefusal(x, z), or just call placeBlockForAll / removeBlockForAll');
});

test('block_edits.js loads right after game.js, before anything that changes blocks', () => {
    const html = fs.readFileSync(path.join(JS, '..', 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((match) => match[1]);
    assert.equal(scripts[scripts.indexOf('js/game.js') + 1], 'js/game/block_edits.js');
});

test('placing and removing change the world here and tell the server', () => {
    const { game, blocks, sent } = makeGame();
    const stone = { x: 1, y: 2, z: 3, blockType: 'stone' };
    assert.equal(game.placeBlockForAll(stone), true);
    assert.equal(blocks.get('1,2,3'), 'stone');
    assert.deepEqual(sent, [{ type: 'blockPlace', payload: stone }]);
    assert.equal(sent[0].payload, stone, 'the payload goes as it came, metadata and all');

    assert.equal(game.removeBlockForAll(1, 2, 3), true);
    assert.equal(blocks.has('1,2,3'), false);
    // (Spread: the payload is made inside the VM, whose Object is another one.)
    assert.deepEqual({ type: sent[1].type, payload: { ...sent[1].payload } }, { type: 'blockBreak', payload: { x: 1, y: 2, z: 3 } });
});

test('what did not change here is not sent, unless it is to be sent always', () => {
    const { game, sent } = makeGame();
    game.placeBlockForAll({ x: 0, y: 0, z: 0, blockType: 'stone' });
    sent.length = 0;
    assert.equal(game.placeBlockForAll({ x: 0, y: 0, z: 0, blockType: 'stone' }), false);
    assert.equal(game.removeBlockForAll(5, 5, 5), false);
    assert.deepEqual(sent, []);

    // A sound block retuned keeps its type; /build works beyond the loaded chunks.
    assert.equal(game.placeBlockForAll({ x: 0, y: 0, z: 0, blockType: 'stone', note: 3 }, { always: true }), false);
    assert.equal(game.removeBlockForAll(5, 5, 5, { always: true }), false);
    assert.deepEqual(sent.map((message) => message.type), ['blockPlace', 'blockBreak']);
});

test('a guard that refuses a column stops the change before the world or the server hear of it', () => {
    const { game, blocks, sent, guard } = makeGame();
    const asked = [];
    guard(function (x, z) {
        asked.push([this === game, x, z]);
        return x >= 100 ? 'Parcela de Ana: aquí no puedes cambiar nada.' : null;
    });
    guard(() => 'never asked once another has refused, and never the reason given');

    assert.equal(game.blockEditRefusal(100, 7), 'Parcela de Ana: aquí no puedes cambiar nada.');
    assert.deepEqual(asked, [[true, 100, 7]]);

    blocks.set('100,1,7', 'chest');
    assert.equal(game.placeBlockForAll({ x: 100, y: 2, z: 7, blockType: 'stone' }), false);
    assert.equal(game.placeBlockForAll({ x: 100, y: 2, z: 7, blockType: 'stone' }, { always: true }), false);
    assert.equal(game.removeBlockForAll(100, 1, 7), false);
    assert.equal(game.removeBlockForAll(100, 1, 7, { always: true }), false);
    assert.equal(blocks.get('100,1,7'), 'chest');
    assert.equal(blocks.has('100,2,7'), false);
    assert.deepEqual(sent, []);
});

test('with no guard, and with guards that all agree, everything goes through', () => {
    const { game, sent, guard } = makeGame();
    assert.equal(game.blockEditRefusal(0, 0), null);
    guard(() => null);
    guard(() => '');
    assert.equal(game.blockEditRefusal(0, 0), null);
    assert.equal(game.placeBlockForAll({ x: 0, y: 0, z: 0, blockType: 'dirt' }), true);
    assert.equal(sent.length, 1);
});

test('offline the world still changes here, and nothing is sent', () => {
    const { game, blocks, sent } = makeGame({ connected: false });
    assert.equal(game.placeBlockForAll({ x: 0, y: 0, z: 0, blockType: 'dirt' }), true);
    assert.equal(game.removeBlockForAll(0, 0, 0), true);
    game.sendBlockPlace({ x: 0, y: 0, z: 0, blockType: 'dirt' });
    game.sendBlockBreak(0, 0, 0);
    assert.equal(blocks.size, 0);
    assert.deepEqual(sent, []);
    game.network = null;
    assert.equal(game.placeBlockForAll({ x: 0, y: 0, z: 0, blockType: 'dirt' }), true);
});

test('only what is placed from the hand is marked on its way out (builder mode)', () => {
    const { game, sent } = makeGame();
    const dirt = { x: 0, y: 0, z: 0, blockType: 'dirt' };
    game.sendBlockPlace(dirt);
    game.sendBlockPlace(dirt, { fromHand: true });
    game.placeBlockForAll({ x: 1, y: 0, z: 0, blockType: 'dirt' });
    assert.deepEqual(sent.map((message) => Boolean(message.payload.palette)), [false, true, false]);
});
