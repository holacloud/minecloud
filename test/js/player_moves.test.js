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

// ---- How another player is drawn between the places it said it was (js/game/avatars.js) ----

function makeAvatars() {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
        lerpVectors(a, b, t) { this.x = a.x + (b.x - a.x) * t; this.y = a.y + (b.y - a.y) * t; this.z = a.z + (b.z - a.z) * t; return this; }
    }
    const context = vm.createContext({ THREE: { Vector3 }, Game: function Game() {} });
    vm.runInContext(fs.readFileSync(path.join(JS, 'game', 'avatars.js'), 'utf8'), context);
    const game = new context.Game();
    const avatar = { userData: { steps: [] }, position: new Vector3() };
    const behind = vm.runInContext('AVATAR_BEHIND_MS', context);
    return { game, avatar, behind, step: (x, at) => game.avatarStepsAdd(avatar, new Vector3(x, 0, 0), at) };
}

test('a player walking straight is drawn at an even pace, however unevenly the rounds bring the news', () => {
    const { game, avatar, behind } = makeAvatars();
    // A block every 100 ms, said by its client on time; each waits for its round (0 to 50 ms) and comes
    // with that wait as its age, as updateOtherPlayer takes it.
    const waits = [0, 50, 10, 40, 0, 50, 30, 20, 50, 0, 45, 5];
    const news = waits.map((wait, i) => ({ x: i, arrives: 1000 + i * 100 + wait, age: wait }));
    const drawn = [];
    for (let now = 1000; now <= 2100; now += 10) {
        for (const move of news) {
            if (move.arrives > now - 10 && move.arrives <= now) game.avatarStepsAdd(avatar, { x: move.x, y: 0, z: 0 }, move.arrives - move.age);
        }
        game.avatarStepsPlace(avatar, now - behind);
        drawn.push(avatar.position.x);
    }
    // Once it is on its way: a tenth of a block every 10 ms, never more and never less.
    const moving = drawn.slice(drawn.findIndex((x) => x > 0) + 1);
    assert.ok(moving.length > 50);
    for (let i = 1; i < moving.length; i++) {
        assert.ok(Math.abs(moving[i] - moving[i - 1] - 0.1) < 1e-9, `from ${moving[i - 1]} to ${moving[i]}`);
    }
});

test('a player who stood still starts at once, stops where it said, and is never drawn ahead of the news', () => {
    const { game, avatar, behind, step } = makeAvatars();
    const most = 150;
    step(5, 0);
    game.avatarStepsPlace(avatar, 0);
    assert.equal(avatar.position.x, 5);
    // Ten seconds later it takes a step: drawn over the last moments before it, not over the ten seconds.
    step(6, 10000);
    game.avatarStepsPlace(avatar, 10000 - most - 1);
    assert.equal(avatar.position.x, 5);
    game.avatarStepsPlace(avatar, 10000 - most / 2);
    assert.ok(Math.abs(avatar.position.x - 5.5) < 1e-9);
    // No more news: it stays at the last place, however long.
    game.avatarStepsPlace(avatar, 10000 + behind);
    game.avatarStepsPlace(avatar, 99999);
    assert.equal(avatar.position.x, 6);
    assert.equal(avatar.userData.steps.length, 1);
    // News that say they are older than the last one do not take it back.
    step(7, 500);
    game.avatarStepsPlace(avatar, 99999);
    assert.equal(avatar.position.x, 7);
    // And many at once (a tab that was asleep) do not pile up.
    for (let i = 0; i < 50; i++) step(8 + i, 200000 + i);
    assert.ok(avatar.userData.steps.length <= 8);
});

test('THE BUG: a listener that fails as the connection opens does not keep the player from joining again', () => {
    const { client, sent, context } = makeClient();
    client.handleMessage({ type: 'playerMoves', payload: { players: [{ id: 'ana', x: 1, y: 70, z: 2 }] } });
    client.on('otherPlayerGone', () => { throw new Error('an avatar that cannot be removed'); });
    context.WebSocket = function () {};
    client.connect('ws://nowhere');
    assert.throws(() => client.ws.onopen());
    assert.deepEqual(sent.map(([type]) => type), ['playerJoin'], 'without it the server takes no move of this player');
});

test('a listener that fails with one player of a message does not lose the others', () => {
    const { client, heard } = makeClient();
    client.on('otherPlayerMove', (player) => { if (player.id === 'ana') throw new Error('ana cannot be drawn'); });
    client.on('otherPlayerGone', (id) => { if (id === 'ana') throw new Error('ana cannot be removed'); });
    client.handleMessage({ type: 'playerMoves', payload: { players: [{ id: 'ana', x: 1, y: 70, z: 2 }, { id: 'beto', x: 2, y: 70, z: 2 }] } });
    client.handleMessage({ type: 'playerMoves', payload: { players: [], gone: ['ana', 'beto'] } });
    assert.deepEqual(heard.map(([what, said]) => `${what} ${said.id || said}`), ['move ana', 'move beto', 'gone ana', 'gone beto']);
});

test('THE BUG: an avatar whose head has a material for each face can be removed', () => {
    class Mesh { constructor(material) { this.material = material; this.userData = {}; } }
    class Sprite {}
    const context = vm.createContext({ THREE: { Vector3: class {}, Mesh, Sprite }, Game: function Game() {} });
    vm.runInContext(fs.readFileSync(path.join(JS, 'game', 'avatars.js'), 'utf8'), context);
    const game = new context.Game();
    const disposed = [];
    const material = (name) => ({ dispose: () => disposed.push(name) });
    const nodes = [new Mesh([material('face 1'), material('face 2')]), new Mesh(material('torso'))];
    let removed = false;
    const avatar = { userData: {}, traverse: (visit) => nodes.forEach(visit), parent: { remove: () => { removed = true; } } };
    game.otherPlayerMeshes = new Map([['ana', avatar]]);
    game.removeOtherPlayer('ana');
    assert.deepEqual(disposed, ['face 1', 'face 2', 'torso']);
    assert.ok(removed, 'out of the scene');
    assert.equal(game.otherPlayerMeshes.size, 0);
});
