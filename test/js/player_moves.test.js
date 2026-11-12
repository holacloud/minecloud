// Node tests for how a client hears of the other players and says where its own is (js/websocket.js),
// against what the server sends in playerMoves (pkg/network/player_moves.go).
// Run with: node --test test/js/player_moves.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const JS = path.join(ROOT, 'pkg', 'web', 'static', 'js');
const plain = (value) => JSON.parse(JSON.stringify(value));

// The real client, with a clock of the test's and no socket: what it emits and what it would send.
function makeClient() {
    const clock = { now: 1000 };
    const context = vm.createContext({ console: { log() {}, error() {} }, Date: { now: () => clock.now }, document: { getElementById: () => null } });
    vm.runInContext(fs.readFileSync(path.join(JS, 'websocket.js'), 'utf8'), context);
    const client = vm.runInContext('new NetworkClient()', context);
    client.playerId = 'me';
    const heard = [];
    const sent = [];
    client.on('otherPlayerMove', (player) => heard.push(['move', plain(player)]));
    client.on('otherPlayerGone', (id) => heard.push(['gone', id]));
    client.send = (type, payload) => sent.push([type, plain(payload)]);
    return { client, heard, sent, clock, context };
}

const at = { x: 1, y: 70, z: 2, yaw: 0.5, pitch: 0 };

test('a player heard of for the first time comes whole, and afterwards keeps the name and looks it had', () => {
    const { client, heard } = makeClient();
    client.handleMessage({ type: 'playerMoves', payload: { players: [
        { id: 'ana', x: 1, y: 70, z: 2, yaw: 0, pitch: 0, username: 'Ana', shirtColor: '#f00', hairStyle: 'long', hairColor: '#000', heldItem: 'stone', mount: 'horse:1' }
    ] } });
    client.handleMessage({ type: 'playerMoves', payload: { players: [{ id: 'ana', x: 3, y: 70, z: 2, yaw: 1, pitch: 0 }] } });

    assert.equal(heard.length, 2);
    assert.deepEqual(heard[1], ['move', { username: 'Ana', shirtColor: '#f00', hairStyle: 'long', hairColor: '#000', id: 'ana', x: 3, y: 70, z: 2, yaw: 1, pitch: 0 }]);
    assert.equal('heldItem' in heard[1][1], false, 'what is in the hand is not kept from before: nothing said is an empty hand');
    assert.equal('mount' in heard[1][1], false);
    assert.equal(client.otherPlayers.get('ana').x, 3);

    // Its looks change: the new ones stand from then on.
    client.handleMessage({ type: 'playerMoves', payload: { players: [{ id: 'ana', x: 3, y: 70, z: 2, yaw: 1, pitch: 0, username: 'Ana', shirtColor: '#0f0', hairStyle: 'long', hairColor: '#000' }] } });
    client.handleMessage({ type: 'playerMoves', payload: { players: [{ id: 'ana', x: 4, y: 70, z: 2, yaw: 1, pitch: 0 }] } });
    assert.equal(heard[3][1].shirtColor, '#0f0');
});

test('its own player is not another, and a message with nothing in it does nothing', () => {
    const { client, heard } = makeClient();
    client.handleMessage({ type: 'playerMoves', payload: { players: [{ id: 'me', x: 0, y: 0, z: 0 }, null] } });
    client.handleMessage({ type: 'playerMoves', payload: {} });
    client.handleMessage({ type: 'playerMoves' });
    assert.deepEqual(heard, []);
    assert.equal(client.otherPlayers.size, 0);
});

test('a player gone from around is said once, forgotten, and whole again when it is back', () => {
    const { client, heard } = makeClient();
    client.handleMessage({ type: 'playerMoves', payload: { players: [{ id: 'ana', x: 1, y: 70, z: 2, username: 'Ana', shirtColor: '#f00' }] } });
    client.handleMessage({ type: 'playerMoves', payload: { players: [], gone: ['ana', 'never heard of'] } });
    assert.deepEqual(heard.slice(1), [['gone', 'ana']]);
    assert.equal(client.otherPlayers.has('ana'), false);

    client.handleMessage({ type: 'playerMoves', payload: { players: [{ id: 'ana', x: 9, y: 70, z: 2 }] } });
    assert.equal('shirtColor' in heard[2][1], false, 'nothing is kept of a player that was forgotten');
});

test('a new connection forgets everybody: the server will say again who is around', () => {
    const { client, heard, sent, context } = makeClient();
    client.handleMessage({ type: 'playerMoves', payload: { players: [{ id: 'ana', x: 1, y: 70, z: 2 }, { id: 'beto', x: 1, y: 70, z: 2 }] } });
    client.updatePosition(at);
    client.send = (type, payload) => sent.push([type, plain(payload)]);
    context.WebSocket = function () {};
    client.connect('ws://nowhere');
    client.ws.onopen();
    assert.deepEqual(heard.slice(2), [['gone', 'ana'], ['gone', 'beto']]);
    assert.equal(client.otherPlayers.size, 0);
    client.updatePosition(at);
    assert.deepEqual(sent.map(([type]) => type), ['playerMove', 'playerJoin', 'playerMove'], 'and says again where it is, at once');
});

test('a player standing still says where it is once, and again only now and then', () => {
    const { client, sent, clock } = makeClient();
    client.updatePosition(at, 'stone');
    for (let i = 0; i < 19; i++) {
        clock.now += 100;
        client.updatePosition({ ...at }, 'stone');
    }
    assert.equal(sent.length, 1, 'ten times a second for two seconds, the same: said once');
    clock.now += 100;
    client.updatePosition(at, 'stone');
    assert.equal(sent.length, 2, 'after two seconds it says it again, so the server knows it is there');

    // Anything that changes is said at once: a step, the head, the hand, the name.
    clock.now += 100;
    client.updatePosition({ ...at, x: 1.01 }, 'stone');
    client.updatePosition({ ...at, x: 1.01, pitch: 0.1 }, 'stone');
    client.updatePosition({ ...at, x: 1.01, pitch: 0.1 }, 'torch');
    client.username = 'Otro';
    client.updatePosition({ ...at, x: 1.01, pitch: 0.1 }, 'torch');
    client.updatePosition({ ...at, x: 1.01, pitch: 0.1 }, 'torch');
    assert.equal(sent.length, 6);
    assert.equal(sent[5][1].username, 'Otro');
});

test('the game takes away the avatar of a player gone from around, and only that', () => {
    const game = fs.readFileSync(path.join(JS, 'game.js'), 'utf8');
    assert.match(game, /network\.on\('otherPlayerGone', \(id\) => this\.removeOtherPlayer\(id\)\)/);

    const context = vm.createContext({});
    vm.runInContext('class Game {}', context);
    vm.runInContext(fs.readFileSync(path.join(JS, 'game', 'avatars.js'), 'utf8'), context);
    const instance = vm.runInContext('new Game()', context);
    const disposed = [];
    instance.disposeRemoteAvatar = (avatar) => disposed.push(avatar);
    instance.otherPlayerMeshes = new Map([['ana', 'avatar of ana'], ['beto', 'avatar of beto']]);
    instance.remotePlayerNames = new Map([['ana', 'Ana']]);
    instance.removeOtherPlayer('ana');
    instance.removeOtherPlayer('nobody');
    assert.deepEqual(disposed, ['avatar of ana']);
    assert.deepEqual([...instance.otherPlayerMeshes.keys()], ['beto']);
    assert.equal(instance.remotePlayerNames.get('ana'), 'Ana', 'it is still playing: its name stays in the list');
});

test('the server sends playerMoves and no longer every move to everybody, nor all the players on connecting', () => {
    const go = (file) => fs.readFileSync(path.join(ROOT, 'pkg', 'network', file), 'utf8');
    assert.match(go('player_moves.go'), /"type":"playerMoves"/);
    assert.doesNotMatch(go('websocket.go'), /createMessage\("playerMove"/);
    const init = go('websocket.go');
    assert.doesNotMatch(init.slice(init.indexOf('initMsg := map'), init.indexOf('initMsg := map') + 400), /"players"/);
});
