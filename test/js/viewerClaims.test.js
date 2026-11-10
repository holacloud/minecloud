// Node tests for the terrain viewer's "Show plots" option (js/viewer/claimMarkers.js and how viewer.html and
// terrainViewer.js use it), as "Show players" is tested: off by default, no request while off, outlines and
// labels coming and going with the server's list. The endpoint is tested in pkg/network/claims_test.go.
// Run with: node --test test/js/viewerClaims.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STATIC = path.join(__dirname, '..', '..', 'pkg', 'web', 'static');
const VIEWER = path.join(STATIC, 'js', 'viewer');
const viewerSource = fs.readFileSync(path.join(VIEWER, 'terrainViewer.js'), 'utf8');
const html = fs.readFileSync(path.join(STATIC, 'viewer.html'), 'utf8');
global.playerMarkerScreen = require(path.join(VIEWER, 'playerMarkers.js')).playerMarkerScreen;
const { ClaimMarkers, claimMarkerEntries, claimMarkerOutline, CLAIMS_URL, CLAIMS_NO_NAME, CLAIMS_SPAWN_NAME } = require(path.join(VIEWER, 'claimMarkers.js'));

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

const fakeThree = {
    Vector3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } },
    BufferGeometry: class { setFromPoints(points) { this.points = points; return this; } dispose() { this.disposed = true; } },
    LineBasicMaterial: class { constructor(options) { Object.assign(this, options); } dispose() { this.disposed = true; } },
    LineLoop: class { constructor(geometry, material) { this.geometry = geometry; this.material = material; } }
};

const answer = {
    spawn: { minX: -16, minZ: -16, maxX: 15, maxZ: 15, y: 12 },
    claims: [{ owner: 'Ana', minX: 92, minZ: 92, maxX: 108, maxZ: 108, y: 64 }, { owner: '', minX: 0, minZ: 40, maxX: 16, maxZ: 56, y: 70 }, { owner: 'X', minX: 'a' }]
};

function setup(responses) {
    const urls = [];
    const scene = { added: [], removed: [], add(o) { this.added.push(o); }, remove(o) { this.removed.push(o); } };
    const layer = fakeElement('div');
    const markers = new ClaimMarkers({
        scene, layer, three: fakeThree, documentImpl: { hidden: false, createElement: fakeElement },
        fetchImpl: async (url) => { urls.push(url); const next = responses.length > 1 ? responses.shift() : responses[0]; return next; }
    });
    return { markers, scene, layer, urls };
}

test('entries: the spawn zone and every valid plot, names as they are or a default', () => {
    const entries = claimMarkerEntries(answer);
    assert.deepEqual(entries.map((e) => [e.name, e.spawn]), [[CLAIMS_SPAWN_NAME, true], ['Ana', false], [CLAIMS_NO_NAME, false]]);
    assert.throws(() => claimMarkerEntries({}));
    assert.deepEqual(claimMarkerOutline(entries[1]), [[92, 65.5, 92], [109, 65.5, 92], [109, 65.5, 109], [92, 65.5, 109]]);
});

test('off by default: nothing is asked until the box is ticked, and it all goes when it is unticked', async () => {
    assert.match(html, /<input id="claims" type="checkbox" autocomplete="off"> Show plots/);
    assert.ok(html.indexOf('js/viewer/claimMarkers.js') > html.indexOf('js/viewer/playerMarkers.js'));
    assert.match(viewerSource, /\$\('claims'\)\.checked = false;/);
    assert.match(viewerSource, /this\.claims\.update\(this\.camera/);
    const { markers, scene, layer, urls } = setup([{ ok: true, status: 200, json: async () => answer }]);
    assert.equal(markers.statusLine(), '');
    assert.equal(urls.length, 0);
    markers.setEnabled(true);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(urls, [CLAIMS_URL]);
    assert.equal(scene.added.length, 3);
    assert.deepEqual(layer.children.map((c) => c.textContent), [CLAIMS_SPAWN_NAME, 'Ana', CLAIMS_NO_NAME]);
    assert.equal(markers.statusLine(), 'Plots: <b>2</b>');
    assert.equal(scene.added[0].material.color, 0x8fd3ff);
    assert.equal(scene.added[1].material.color, 0xffc857);
    markers.setEnabled(false);
    assert.equal(scene.removed.length, 3);
    assert.equal(layer.children.length, 0);
    assert.ok(scene.added.every((line) => line.geometry.disposed && line.material.disposed));
});

test('a plot that goes away loses its outline; one that comes gets one', () => {
    const { markers, scene, layer } = setup([]);
    markers.apply(claimMarkerEntries(answer));
    markers.apply(claimMarkerEntries({ spawn: answer.spawn, claims: [answer.claims[0], { owner: 'Beto', minX: 200, minZ: 0, maxX: 216, maxZ: 16, y: 60 }] }));
    assert.deepEqual(layer.children.map((c) => c.textContent), [CLAIMS_SPAWN_NAME, 'Ana', 'Beto']);
    assert.equal(scene.removed.length, 1);
});
