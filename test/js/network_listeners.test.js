// A later listener must never replace an earlier one: the microscope once took storageContents away
// from the chests, and they stayed on "Opening..." for ever. The fake networks of the other tests
// keep lists of listeners, so only the real client can show this.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../../pkg/web/static/js/websocket.js'), 'utf8');

function makeClient() {
    const context = vm.createContext({ console, Map, Math, Date, JSON, localStorage: { getItem: () => null, setItem() {} }, window: {} });
    return vm.runInContext(`${source}\nnew NetworkClient();`, context);
}

test('every listener of a message hears it, in the order they came', () => {
    const client = makeClient();
    const heard = [];
    client.on('storageContents', (payload) => heard.push(['chest', payload]));
    client.on('storageContents', (payload) => heard.push(['microscope', payload]));
    client.emit('storageContents', 7);
    assert.deepStrictEqual(heard, [['chest', 7], ['microscope', 7]]);
});

test('a message nobody listens to is ignored', () => {
    assert.doesNotThrow(() => makeClient().emit('nobody', {}));
});

test('both chests and the microscope listen to what a chest says', () => {
    const read = (file) => fs.readFileSync(path.join(__dirname, '../../pkg/web/static/js/game', file), 'utf8');
    for (const type of ['storageResult', 'storageContents', 'storageClosed']) {
        assert.ok(read('storage.js').includes(`network.on('${type}'`), `storage.js listens to ${type}`);
        assert.ok(read('microscope.js').includes(`network.on('${type}'`), `microscope.js listens to ${type}`);
    }
});
