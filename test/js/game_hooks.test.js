// Node tests for how a feature hears the server and sets itself up once (registerNetworkHandler and
// registerGameInit in js/extensions.js), and that no feature goes around them.
// Run with: node --test test/js/game_hooks.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js');
const read = (file) => fs.readFileSync(path.join(JS, file), 'utf8');
const gameFiles = fs.readdirSync(path.join(JS, 'game')).filter((name) => name.endsWith('.js'));

// The real extensions and the real network client, with no socket.
function load() {
    const context = vm.createContext({ console: { log() {}, error() {} }, window: {} });
    vm.runInContext(read('extensions.js'), context);
    vm.runInContext(read('websocket.js'), context);
    vm.runInContext('Object.assign(this, { registerNetworkHandler, attachNetworkHandlers, registerGameInit, runGameInit, NetworkClient })', context);
    return context;
}

test('every handler of a message hears it, with the game as `this`, in the order they registered', () => {
    const ctx = load();
    const heard = [];
    ctx.registerNetworkHandler('storageContents', function (payload) { heard.push(['chest', this.name, payload]); });
    ctx.registerNetworkHandler('storageContents', function (payload) { heard.push(['microscope', this.name, payload]); });
    ctx.registerNetworkHandler('connected', function () { heard.push(['connected', this.name]); });
    const game = { name: 'game' };
    const network = new ctx.NetworkClient();
    network.on('storageContents', (payload) => heard.push(['core', payload]));
    ctx.attachNetworkHandlers(game, network);
    network.emit('storageContents', 7);
    network.emit('connected');
    assert.deepEqual(heard, [['core', 7], ['chest', 'game', 7], ['microscope', 'game', 7], ['connected', 'game']]);
});

test('the game attaches them before it connects, and starts the features once the pause menu is there', () => {
    const game = read('game.js');
    const attach = game.indexOf('attachNetworkHandlers(this, this.network)');
    assert.ok(attach > 0 && attach < game.indexOf('this.network.connect('), 'listening before the socket opens');
    // After the network, the hotbar, the input and the pause menu, which the hooks may use.
    const run = game.indexOf('runGameInit(this);');
    for (const before of ['this.initNetwork();', 'this.initHotbar();', 'this.initInput();', 'this.initPauseMenu();']) {
        assert.ok(game.indexOf(before) > 0 && game.indexOf(before) < run, before);
    }
});

test('game init hooks run once each, in order, with the game as `this`', () => {
    const ctx = load();
    const ran = [];
    ctx.registerGameInit(function () { ran.push(['first', this.name]); });
    ctx.registerGameInit(function () { ran.push(['second', this.name]); });
    ctx.runGameInit({ name: 'game' });
    assert.deepEqual(ran, [['first', 'game'], ['second', 'game']]);
});

test('no feature subscribes to the network by itself, nor wraps the start of the game to do it', () => {
    for (const name of gameFiles) {
        const source = read(`game/${name}`);
        assert.doesNotMatch(source, /network\.on\(/, `${name}: use registerNetworkHandler (js/extensions.js)`);
        assert.doesNotMatch(source, /proto(type)?\.(init|initNetwork)\s*=/, `${name}: use registerGameInit or registerNetworkHandler`);
    }
});

test('every handler registered calls a method that exists somewhere in the game', () => {
    const all = ['game.js', ...gameFiles.map((name) => `game/${name}`)].map(read).join('\n');
    for (const name of gameFiles) {
        for (const match of read(`game/${name}`).matchAll(/^registerNetworkHandler\('[A-Za-z]+', function \([a-z]*\) \{ this\.([A-Za-z]+)\(/gm)) {
            assert.match(all, new RegExp(`^\\s+(async )?${match[1]}\\(`, 'm'), `${name}: ${match[1]} is not a method`);
        }
    }
});
