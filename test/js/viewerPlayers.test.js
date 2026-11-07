// Node tests for the terrain viewer's "Show players" option (js/viewer/playerMarkers.js and how
// viewer.html and terrainViewer.js use it): off by default, no request while off, markers appearing
// and going with the server's list, where they fall on screen, and that having no server changes
// nothing else. The endpoint's own tests are in pkg/network/viewer_players_test.go.
// Run with: node --test test/js/viewerPlayers.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const STATIC = path.join(__dirname, '..', '..', 'pkg', 'web', 'static');
const VIEWER = path.join(STATIC, 'js', 'viewer');
const markersSource = fs.readFileSync(path.join(VIEWER, 'playerMarkers.js'), 'utf8');
const viewerSource = fs.readFileSync(path.join(VIEWER, 'terrainViewer.js'), 'utf8');
const html = fs.readFileSync(path.join(STATIC, 'viewer.html'), 'utf8');
const {
    PlayerMarkers, playerMarkerEntries, playerMarkerScreen,
    PLAYERS_URL, PLAYERS_POLL_MS, PLAYERS_RETRY_MS, PLAYERS_FAILURES_TO_CLEAR, PLAYERS_NO_NAME
} = require(path.join(VIEWER, 'playerMarkers.js'));

// ---------------------------------------------------------------- a page without a browser

function fakeElement(tag) {
    const element = {
        tag, children: [], style: {}, parent: null, className: '', textContent: '',
        appendChild(child) { child.parent = element; element.children.push(child); },
        remove() {
            if (!element.parent) return;
            element.parent.children.splice(element.parent.children.indexOf(element), 1);
            element.parent = null;
        },
        set innerHTML(_value) { throw new Error('a name went in as HTML'); }
    };
    return element;
}

function fakeDocument() {
    return { hidden: false, createElement: fakeElement };
}

function ok(players) {
    return { ok: true, status: 200, json: async () => ({ players }) };
}

// A server answering from a list of answers (the last one repeats), counting what it is asked.
function fakeServer(...answers) {
    const server = { urls: [], fetch: null };
    server.fetch = async (url) => {
        server.urls.push(url);
        const answer = answers.length > 1 ? answers.shift() : answers[0];
        if (answer instanceof Error) throw answer;
        return answer;
    };
    return server;
}

function setup(server) {
    const layer = fakeElement('div');
    const documentImpl = fakeDocument();
    const markers = new PlayerMarkers({ layer, documentImpl, fetchImpl: server.fetch });
    return { layer, documentImpl, markers };
}

// Lets the promises of a poll finish; the mocked timers do not wait for them.
async function settle() {
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

function names(layer) {
    return layer.children.map((element) => element.children[0].textContent);
}

// The matrices of a camera at `eye`, looking along -z or, with topDown, straight down with -z up
// the screen (view x = world x, view y = -world z, view z = world y).
function camera({ eye = [0, 0, 0], fov = 55, aspect = 1, near = 0.5, far = 60000, topDown = false } = {}) {
    const [ex, ey, ez] = eye;
    const f = 1 / Math.tan(fov * Math.PI / 360);
    const projectionMatrix = { elements: [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0] };
    const matrixWorldInverse = topDown
        ? { elements: [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, -ex, ez, -ey, 1] }
        : { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -ex, -ey, -ez, 1] };
    return { projectionMatrix, matrixWorldInverse };
}

// ---------------------------------------------------------------- off by default

test('the checkbox is on the page, unticked, in the style of the others', () => {
    const input = html.match(/<input id="players"[^>]*>/);
    assert.ok(input, 'no #players on the page');
    assert.match(input[0], /type="checkbox"/);
    assert.doesNotMatch(input[0], /\bchecked\b/);
    // A browser restoring the form on reload must not turn it on either.
    assert.match(input[0], /autocomplete="off"/);
    assert.match(html, /<div class="row">\s*<label><input id="players"[^>]*> Show players<\/label>/);
});

test('the marker layer lets the mouse through and lies under the panel', () => {
    assert.match(html, /#player-markers \{[^}]*pointer-events: none/);
    assert.ok(html.indexOf('id="player-markers"') > html.indexOf('id="viewport"'));
    assert.ok(html.indexOf('id="player-markers"') < html.indexOf('class="panel"'));
});

test('nothing asks for players, or keeps a timer, until it is turned on', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const server = fakeServer(ok([]));
    const { layer, markers } = setup(server);
    assert.equal(markers.enabled, false);
    markers.update(camera(), 800, 600);
    assert.equal(markers.statusLine(), '');
    t.mock.timers.tick(60000);
    await settle();
    assert.deepEqual(server.urls, []);
    assert.equal(markers.timer, null);
    assert.equal(layer.children.length, 0);
});

test('turning it off stops asking, removes the markers and leaves no timer', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const server = fakeServer(ok([{ name: 'Ana', x: 1, y: 2, z: 3 }]));
    const { layer, markers } = setup(server);
    markers.setEnabled(true);
    await settle();
    assert.deepEqual(server.urls, [PLAYERS_URL]);
    assert.deepEqual(names(layer), ['Ana']);
    t.mock.timers.tick(PLAYERS_POLL_MS);
    await settle();
    assert.equal(server.urls.length, 2);

    markers.setEnabled(false);
    assert.equal(layer.children.length, 0);
    assert.equal(markers.timer, null);
    assert.equal(markers.statusLine(), '');
    t.mock.timers.tick(PLAYERS_POLL_MS * 100);
    await settle();
    assert.equal(server.urls.length, 2);
});

test('an answer arriving after turning it off is dropped', async () => {
    let answer;
    const fetchImpl = () => new Promise((resolve) => { answer = resolve; });
    const layer = fakeElement('div');
    const markers = new PlayerMarkers({ layer, documentImpl: fakeDocument(), fetchImpl });
    markers.setEnabled(true);
    markers.setEnabled(false);
    answer(ok([{ name: 'Ana', x: 1, y: 2, z: 3 }]));
    await settle();
    assert.equal(layer.children.length, 0);
    assert.equal(markers.timer, null);
});

test('turning it off and on quickly leaves one loop running', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const server = fakeServer(ok([]));
    const { markers } = setup(server);
    markers.setEnabled(true);
    markers.setEnabled(false);
    markers.setEnabled(true);
    await settle();
    const asked = server.urls.length;
    t.mock.timers.tick(PLAYERS_POLL_MS);
    await settle();
    assert.equal(server.urls.length, asked + 1);
    markers.setEnabled(false);
});

test('a hidden tab asks nothing', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const server = fakeServer(ok([]));
    const { documentImpl, markers } = setup(server);
    documentImpl.hidden = true;
    markers.setEnabled(true);
    await settle();
    t.mock.timers.tick(PLAYERS_POLL_MS * 5);
    await settle();
    assert.deepEqual(server.urls, []);
    documentImpl.hidden = false;
    t.mock.timers.tick(PLAYERS_POLL_MS);
    await settle();
    assert.equal(server.urls.length, 1);
    markers.setEnabled(false);
});

// The real initUI, on a page of stand-ins.
test('the viewer forces the box off on load and connects it to the markers', () => {
    const inputs = new Map();
    const element = (id) => {
        if (!inputs.has(id)) inputs.set(id, { id, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, value: '' });
        return inputs.get(id);
    };
    // As a browser that restored the form would leave it.
    element('players').checked = true;
    const context = vm.createContext({
        window: { addEventListener() {}, innerWidth: 800, innerHeight: 600 },
        document: { getElementById: element },
        THREE: { Raycaster: class {}, Vector2: class {} }
    });
    vm.runInContext(viewerSource, context, { filename: 'terrainViewer.js' });
    const calls = [];
    const fake = {
        settings: { detail: 1, viewRadius: 1000 }, scene: { fog: {} },
        renderer: { domElement: { addEventListener() {} } },
        players: { setEnabled: (value) => calls.push(value) }
    };
    vm.runInContext('TerrainViewer', context).prototype.initUI.call(fake);
    assert.equal(element('players').checked, false);
    assert.deepEqual(calls, [], 'turned on by itself');
    element('players').listeners.change({ target: { checked: true } });
    element('players').listeners.change({ target: { checked: false } });
    assert.deepEqual(calls, [true, false]);
});

test('the viewer makes the markers without turning them on, and places them after rendering', () => {
    assert.match(viewerSource, /this\.players = new PlayerMarkers\(\{ layer: document\.getElementById\('player-markers'\) \}\)/);
    assert.doesNotMatch(viewerSource, /players\.setEnabled\(true\)/);
    assert.ok(viewerSource.indexOf('this.players.update(') > viewerSource.indexOf('this.renderer.render(this.scene'));
    assert.ok(html.indexOf('js/viewer/playerMarkers.js') < html.indexOf('js/viewer/terrainViewer.js'));
    // No option of the viewer is remembered, so neither is this one.
    assert.doesNotMatch(markersSource + viewerSource, /localStorage/);
});

// ---------------------------------------------------------------- the list

test('entries: only valid players, a name always, and a key per player', () => {
    assert.deepEqual(playerMarkerEntries({ players: [] }), []);
    const entries = playerMarkerEntries({ players: [
        { name: 'Ana', x: 1, y: 2, z: 3 },
        { name: 'Ana', x: 4, y: 5, z: 6 },
        { name: '', x: 7, y: 8, z: 9 },
        { x: 7, y: 8, z: 9 },
        { name: 'bad', x: null, y: 8, z: 9 },
        { name: 'bad', x: 1, y: '8', z: 9 },
        { name: 'bad', x: 1, y: 8 },
        null
    ] });
    assert.deepEqual(entries.map((entry) => entry.name), ['Ana', 'Ana', PLAYERS_NO_NAME, PLAYERS_NO_NAME]);
    assert.equal(new Set(entries.map((entry) => entry.key)).size, 4);
    for (const bad of [null, {}, { players: 'x' }, []]) assert.throws(() => playerMarkerEntries(bad));
});

test('markers follow the list: who comes, who moves, who leaves, nobody', () => {
    const { layer, markers } = setup(fakeServer(ok([])));
    markers.apply(playerMarkerEntries({ players: [{ name: 'Ana', x: 1, y: 2, z: 3 }, { name: 'Bea', x: 4, y: 5, z: 6 }] }));
    assert.deepEqual(names(layer), ['Ana', 'Bea']);
    const [anaElement] = layer.children;

    // Moving keeps the same element.
    markers.apply(playerMarkerEntries({ players: [{ name: 'Ana', x: 10, y: 2, z: 3 }, { name: 'Bea', x: 4, y: 5, z: 6 }] }));
    assert.equal(layer.children[0], anaElement);
    assert.equal(markers.markers.get('0:Ana').x, 10);

    // One leaves, another arrives.
    markers.apply(playerMarkerEntries({ players: [{ name: 'Ana', x: 10, y: 2, z: 3 }, { name: 'Cid', x: 0, y: 0, z: 0 }] }));
    assert.deepEqual(names(layer), ['Ana', 'Cid']);
    assert.equal(markers.markers.has('0:Bea'), false);

    // Everyone leaves.
    markers.apply(playerMarkerEntries({ players: [] }));
    assert.equal(layer.children.length, 0);
    assert.equal(markers.markers.size, 0);
});

test('a name is text: no markup from a player reaches the page', () => {
    const { layer, markers } = setup(fakeServer(ok([])));
    const name = '<img src=x onerror=alert(1)>';
    markers.apply(playerMarkerEntries({ players: [{ name, x: 0, y: 0, z: -10 }] }));
    assert.equal(layer.children[0].children[0].textContent, name);
    assert.doesNotMatch(markersSource, /innerHTML =|insertAdjacentHTML|document\.write/);
    // The stats panel is HTML: only numbers from here.
    markers.enabled = true;
    markers.answered = true;
    assert.doesNotMatch(markers.statusLine(), /img/);
});

// ---------------------------------------------------------------- on screen

test('where a marker falls: centre, sides, up is up', () => {
    const cam = camera();
    const centre = playerMarkerScreen(0, 0, -100, cam, 800, 600);
    assert.deepEqual([centre.left, centre.top, centre.inView], [400, 300, true]);
    assert.ok(playerMarkerScreen(10, 0, -100, cam, 800, 600).left > 400);
    assert.ok(playerMarkerScreen(0, 10, -100, cam, 800, 600).top < 300);
});

test('behind the camera there is no marker, and beside the screen it is not in view', () => {
    const cam = camera();
    assert.equal(playerMarkerScreen(0, 0, 100, cam, 800, 600), null);
    assert.equal(playerMarkerScreen(0, 0, 0, cam, 800, 600), null);
    assert.equal(playerMarkerScreen(5000, 0, -100, cam, 800, 600).inView, false);
});

test('at every zoom, from up close to as far as the controls go and past the far plane', () => {
    for (const height of [8, 100, 2000, 30000, 200000]) {
        const screen = playerMarkerScreen(0, 70, 0, camera({ eye: [0, 70 + height, 0], topDown: true }), 800, 600);
        assert.equal(screen.inView, true, `from ${height} blocks up`);
        assert.equal(Math.round(screen.left), 400);
        assert.equal(Math.round(screen.top), 300);
    }
});

test('looking straight down, the map reads as it should', () => {
    const cam = camera({ eye: [0, 500, 0], topDown: true });
    assert.ok(playerMarkerScreen(0, 0, -50, cam, 800, 600).top < 300);
    assert.ok(playerMarkerScreen(50, 0, 0, cam, 800, 600).left > 400);
});

test('a marker is no object of the 3D scene, so roofs and fog cannot hide it', () => {
    assert.doesNotMatch(markersSource, /new THREE\.|scene\.add/);
    assert.match(markersSource, /camera\.matrixWorldInverse/);
});

test('update places what is in view, hides the rest, and writes only what changed', () => {
    const { layer, markers } = setup(fakeServer(ok([])));
    markers.enabled = true;
    markers.answered = true;
    markers.apply(playerMarkerEntries({ players: [
        { name: 'front', x: 0, y: 0, z: -100 },
        { name: 'behind', x: 0, y: 0, z: 100 },
        { name: 'beside', x: 5000, y: 0, z: -100 }
    ] }));
    markers.update(camera(), 800, 600);
    const [front, behind, beside] = layer.children;
    assert.equal(front.style.display, '');
    assert.match(front.style.transform, /^translate\(400px, 300px\)/);
    assert.equal(behind.style.display, 'none');
    assert.equal(beside.style.display, 'none');
    assert.equal(markers.inView, 1);
    assert.match(markers.statusLine(), /<b>3<\/b> connected · 1 in view/);

    let writes = 0;
    const transform = front.style.transform;
    Object.defineProperty(front.style, 'transform', { get: () => transform, set: () => { writes++; } });
    markers.update(camera(), 800, 600);
    assert.equal(writes, 0);
    markers.update(camera(), 1000, 600);
    assert.equal(writes, 1);
});

test('with no players the status says zero and nothing breaks', () => {
    const { markers } = setup(fakeServer(ok([])));
    markers.enabled = true;
    assert.match(markers.statusLine(), /loading/);
    markers.answered = true;
    assert.match(markers.statusLine(), /<b>0<\/b> connected · 0 in view/);
    assert.doesNotThrow(() => markers.update(camera(), 800, 600));
});

test('the count in view goes back to zero when the last marker goes', () => {
    const { markers } = setup(fakeServer(ok([])));
    markers.enabled = true;
    markers.answered = true;
    markers.apply(playerMarkerEntries({ players: [{ name: 'Ana', x: 0, y: 0, z: -100 }] }));
    markers.update(camera(), 800, 600);
    assert.equal(markers.inView, 1);
    markers.apply(playerMarkerEntries({ players: [] }));
    markers.update(camera(), 800, 600);
    assert.match(markers.statusLine(), /<b>0<\/b> connected · 0 in view/);
});

// ---------------------------------------------------------------- no server

test('a server that fails never throws, keeps markers for a moment, then shows nobody', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const failures = [new Error('network'), { ok: false, status: 503, json: async () => ({}) }, { ok: true, status: 200, json: async () => { throw new Error('bad json'); } }];
    const server = fakeServer(ok([{ name: 'Ana', x: 1, y: 2, z: 3 }]), ...failures, ok([{ name: 'Bea', x: 1, y: 2, z: 3 }]));
    const { layer, markers } = setup(server);
    markers.setEnabled(true);
    await settle();
    assert.deepEqual(names(layer), ['Ana']);

    t.mock.timers.tick(PLAYERS_POLL_MS);
    await settle();
    assert.equal(markers.failures, 1);
    assert.deepEqual(names(layer), ['Ana'], 'gone at one bad moment');
    assert.equal(markers.statusLine(), 'Players: unavailable');

    assert.equal(PLAYERS_FAILURES_TO_CLEAR, 3);
    t.mock.timers.tick(PLAYERS_RETRY_MS);
    await settle();
    t.mock.timers.tick(PLAYERS_RETRY_MS);
    await settle();
    assert.equal(markers.failures, 3);
    assert.equal(layer.children.length, 0);

    // It keeps trying, and comes back by itself.
    t.mock.timers.tick(PLAYERS_RETRY_MS);
    await settle();
    assert.equal(markers.failures, 0);
    assert.deepEqual(names(layer), ['Bea']);
    markers.setEnabled(false);
});

test('waits longer after a failure than after an answer', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const server = fakeServer(new Error('down'));
    const { markers } = setup(server);
    markers.setEnabled(true);
    await settle();
    assert.equal(server.urls.length, 1);
    t.mock.timers.tick(PLAYERS_POLL_MS);
    await settle();
    assert.equal(server.urls.length, 1);
    t.mock.timers.tick(PLAYERS_RETRY_MS - PLAYERS_POLL_MS);
    await settle();
    assert.equal(server.urls.length, 2);
    markers.setEnabled(false);
});
