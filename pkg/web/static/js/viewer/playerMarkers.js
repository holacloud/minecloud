// Where the players are, for the viewer's "Show players" option: off until the box is ticked, and
// while it is off nothing here asks the server anything or runs a timer. Names and positions come
// from /viewer-api/players (pkg/network/viewer_players.go).
//
// A marker is a page element over the 3D view, moved to where its player falls on screen each
// frame. So it has the same size at every zoom, and neither a roof, the near blocks nor the fog can
// hide it: the viewer has one perspective camera, and looking from straight above or from close up
// are only places for it. Names are players' own text, and only ever go in as textContent.

const PLAYERS_URL = '/viewer-api/players';
const PLAYERS_POLL_MS = 2000;
const PLAYERS_RETRY_MS = 5000;
const PLAYERS_TIMEOUT_MS = 4000;
// Failed polls in a row until nobody is shown: one 503 is a busy moment, not everyone leaving.
const PLAYERS_FAILURES_TO_CLEAR = 3;
const PLAYERS_NO_NAME = 'Player';

// What to show from an answer: an entry per valid player, with a key that stays the same while the
// list does. The server sends no ids, so players sharing a name are told apart by their order.
function playerMarkerEntries(answer) {
    if (!answer || !Array.isArray(answer.players)) throw new Error('Not a players response');
    const entries = [];
    const seen = new Map();
    for (const player of answer.players) {
        if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.y) || !Number.isFinite(player.z)) continue;
        const name = typeof player.name === 'string' && player.name.trim() ? player.name : PLAYERS_NO_NAME;
        const nth = seen.get(name) || 0;
        seen.set(name, nth + 1);
        entries.push({ key: `${nth}:${name}`, name, x: player.x, y: player.y, z: player.z });
    }
    return entries;
}

// Where a world position falls on a screen of this size, in pixels, or null if it is behind the
// camera. A camera is anything with the matrices of a THREE.Camera, which looks along its -z. There
// is no far limit, as a marker shows what the terrain's far plane would cut. `inView`: on screen.
function playerMarkerScreen(x, y, z, camera, width, height) {
    const view = camera.matrixWorldInverse.elements;
    const projection = camera.projectionMatrix.elements;
    const vx = view[0] * x + view[4] * y + view[8] * z + view[12];
    const vy = view[1] * x + view[5] * y + view[9] * z + view[13];
    const vz = view[2] * x + view[6] * y + view[10] * z + view[14];
    if (vz >= 0) return null;
    const w = projection[3] * vx + projection[7] * vy + projection[11] * vz + projection[15];
    const ndcX = (projection[0] * vx + projection[4] * vy + projection[8] * vz + projection[12]) / w;
    const ndcY = (projection[1] * vx + projection[5] * vy + projection[9] * vz + projection[13]) / w;
    return {
        left: (ndcX + 1) / 2 * width,
        top: (1 - ndcY) / 2 * height,
        inView: Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1
    };
}

class PlayerMarkers {
    // layer: the element markers go in; documentImpl and fetchImpl stand in for the browser's.
    constructor({ layer = null, documentImpl = null, fetchImpl = null } = {}) {
        this.layer = layer;
        this.documentImpl = documentImpl || (typeof document !== 'undefined' ? document : null);
        this.fetchImpl = fetchImpl || ((...args) => fetch(...args));
        this.enabled = false;
        // Each time the option changes; what was under way for an older one is dropped.
        this.generation = 0;
        this.timer = null;
        this.abort = null;
        this.markers = new Map();
        this.answered = false;
        this.failures = 0;
        this.inView = 0;
    }

    setEnabled(enabled) {
        if (enabled === this.enabled) return;
        this.enabled = enabled;
        this.generation++;
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        if (this.abort) this.abort.abort();
        this.abort = null;
        this.answered = false;
        this.failures = 0;
        this.clear();
        if (enabled) this.pollLoop(this.generation);
    }

    async pollLoop(generation) {
        const hidden = this.documentImpl && this.documentImpl.hidden;
        if (!hidden) await this.poll(generation);
        if (generation !== this.generation) return;
        this.timer = setTimeout(() => this.pollLoop(generation), this.failures ? PLAYERS_RETRY_MS : PLAYERS_POLL_MS);
    }

    // One question to the server. Never rejects: having no server only means no markers.
    async poll(generation) {
        const abort = typeof AbortController === 'function' ? new AbortController() : null;
        this.abort = abort;
        const timer = abort ? setTimeout(() => abort.abort(), PLAYERS_TIMEOUT_MS) : null;
        try {
            const response = await this.fetchImpl(PLAYERS_URL, abort ? { signal: abort.signal } : {});
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const entries = playerMarkerEntries(await response.json());
            if (generation !== this.generation) return;
            this.answered = true;
            this.failures = 0;
            this.apply(entries);
        } catch (_error) {
            if (generation !== this.generation) return;
            this.failures++;
            if (this.failures >= PLAYERS_FAILURES_TO_CLEAR) this.clear();
        } finally {
            if (timer !== null) clearTimeout(timer);
        }
    }

    // Makes the markers match the list: who left goes, who came gets one, the rest move.
    apply(entries) {
        const keep = new Set(entries.map((entry) => entry.key));
        for (const [key, marker] of this.markers) {
            if (!keep.has(key)) this.removeMarker(key, marker);
        }
        for (const entry of entries) {
            const marker = this.markers.get(entry.key) || this.createMarker(entry);
            marker.x = entry.x;
            marker.y = entry.y;
            marker.z = entry.z;
        }
    }

    createMarker(entry) {
        const doc = this.documentImpl;
        const element = doc.createElement('div');
        element.className = 'player-marker';
        element.style.display = 'none';
        const name = doc.createElement('span');
        name.className = 'player-marker-name';
        name.textContent = entry.name;
        const dot = doc.createElement('span');
        dot.className = 'player-marker-dot';
        element.appendChild(name);
        element.appendChild(dot);
        this.layer.appendChild(element);
        const marker = { name: entry.name, element, x: entry.x, y: entry.y, z: entry.z, shownAt: null };
        this.markers.set(entry.key, marker);
        return marker;
    }

    removeMarker(key, marker) {
        marker.element.remove();
        this.markers.delete(key);
    }

    clear() {
        for (const [key, marker] of this.markers) this.removeMarker(key, marker);
        this.inView = 0;
    }

    // Each frame: puts each marker over its player, with the middle of its dot on the spot.
    update(camera, width, height) {
        let inView = 0;
        for (const marker of this.markers.values()) {
            const screen = playerMarkerScreen(marker.x, marker.y, marker.z, camera, width, height);
            const placement = screen && screen.inView ? `translate(${Math.round(screen.left)}px, ${Math.round(screen.top)}px) translate(-50%, calc(-100% + 6px))` : null;
            if (placement) inView++;
            if (placement === marker.shownAt) continue;
            marker.shownAt = placement;
            marker.element.style.display = placement ? '' : 'none';
            if (placement) marker.element.style.transform = placement;
        }
        this.inView = inView;
    }

    // Goes into the stats panel as HTML, so numbers only: never a name.
    statusLine() {
        if (!this.enabled) return '';
        if (this.failures) return 'Players: unavailable';
        if (!this.answered) return 'Players: loading…';
        return `Players: <b>${this.markers.size}</b> connected · ${this.inView} in view`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PlayerMarkers, playerMarkerEntries, playerMarkerScreen,
        PLAYERS_URL, PLAYERS_POLL_MS, PLAYERS_RETRY_MS, PLAYERS_FAILURES_TO_CLEAR, PLAYERS_NO_NAME
    };
}
