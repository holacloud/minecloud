// Where the plots are, for the viewer's "Show plots" option, built like "Show players" (playerMarkers.js):
// off until the box is ticked, and while it is off nothing here asks the server anything or runs a timer.
// The squares come from /viewer-api/claims (pkg/network/viewer_claims.go): each plot's columns, the height of
// its marker and its owner's name, and the spawn zone. Each is drawn as an outline in the 3D view a little
// over its marker (the spawn zone over the ground at the spawn point), with its owner's name as a label over
// the middle, placed on screen each frame like a player's. Names only ever go in as textContent.

const CLAIMS_URL = '/viewer-api/claims';
const CLAIMS_POLL_MS = 10000;
const CLAIMS_RETRY_MS = 15000;
const CLAIMS_TIMEOUT_MS = 4000;
const CLAIMS_FAILURES_TO_CLEAR = 3;
const CLAIMS_COLOR = 0xffc857;
const CLAIMS_SPAWN_COLOR = 0x8fd3ff;
const CLAIMS_NO_NAME = 'Plot';
const CLAIMS_SPAWN_NAME = 'Spawn area';

// What to draw from an answer: an entry per valid square, with a key that stays the same while it does.
function claimMarkerEntries(answer) {
    if (!answer || !Array.isArray(answer.claims)) throw new Error('Not a claims response');
    const valid = (r) => r && [r.minX, r.minZ, r.maxX, r.maxZ, r.y].every(Number.isFinite) && r.maxX >= r.minX && r.maxZ >= r.minZ;
    const entries = [];
    if (valid(answer.spawn)) {
        const s = answer.spawn;
        entries.push({ key: `spawn:${s.minX},${s.minZ},${s.maxX},${s.maxZ}`, name: CLAIMS_SPAWN_NAME, spawn: true, minX: s.minX, minZ: s.minZ, maxX: s.maxX, maxZ: s.maxZ, y: s.y });
    }
    for (const c of answer.claims) {
        if (!valid(c)) continue;
        const name = typeof c.owner === 'string' && c.owner.trim() ? c.owner : CLAIMS_NO_NAME;
        entries.push({ key: `${c.minX},${c.minZ},${c.maxX},${c.maxZ},${c.y}:${name}`, name, spawn: false, minX: c.minX, minZ: c.minZ, maxX: c.maxX, maxZ: c.maxZ, y: c.y });
    }
    return entries;
}

// The outline of a square of columns at height y, as a closed loop of its outer corners.
function claimMarkerOutline(entry) {
    const y = entry.y + 1.5;
    return [
        [entry.minX, y, entry.minZ], [entry.maxX + 1, y, entry.minZ],
        [entry.maxX + 1, y, entry.maxZ + 1], [entry.minX, y, entry.maxZ + 1]
    ];
}

class ClaimMarkers {
    // scene: the THREE.Scene the outlines go in; layer: the element labels go in.
    constructor({ scene = null, layer = null, three = null, documentImpl = null, fetchImpl = null } = {}) {
        this.scene = scene;
        this.layer = layer;
        this.three = three || (typeof THREE !== 'undefined' ? THREE : null);
        this.documentImpl = documentImpl || (typeof document !== 'undefined' ? document : null);
        this.fetchImpl = fetchImpl || ((...args) => fetch(...args));
        this.enabled = false;
        this.generation = 0;
        this.timer = null;
        this.abort = null;
        this.marks = new Map();
        this.answered = false;
        this.failures = 0;
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
        this.timer = setTimeout(() => this.pollLoop(generation), this.failures ? CLAIMS_RETRY_MS : CLAIMS_POLL_MS);
    }

    // One question to the server. Never rejects: having no server only means no outlines.
    async poll(generation) {
        const abort = typeof AbortController === 'function' ? new AbortController() : null;
        this.abort = abort;
        const timer = abort ? setTimeout(() => abort.abort(), CLAIMS_TIMEOUT_MS) : null;
        try {
            const response = await this.fetchImpl(CLAIMS_URL, abort ? { signal: abort.signal } : {});
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const entries = claimMarkerEntries(await response.json());
            if (generation !== this.generation) return;
            this.answered = true;
            this.failures = 0;
            this.apply(entries);
        } catch (_error) {
            if (generation !== this.generation) return;
            this.failures++;
            if (this.failures >= CLAIMS_FAILURES_TO_CLEAR) this.clear();
        } finally {
            if (timer !== null) clearTimeout(timer);
        }
    }

    apply(entries) {
        const keep = new Set(entries.map((entry) => entry.key));
        for (const [key, mark] of this.marks) {
            if (!keep.has(key)) this.removeMark(key, mark);
        }
        for (const entry of entries) {
            if (!this.marks.has(entry.key)) this.createMark(entry);
        }
    }

    createMark(entry) {
        const three = this.three;
        let line = null;
        if (three && this.scene) {
            const points = claimMarkerOutline(entry).map(([x, y, z]) => new three.Vector3(x, y, z));
            const geometry = new three.BufferGeometry().setFromPoints(points);
            const material = new three.LineBasicMaterial({ color: entry.spawn ? CLAIMS_SPAWN_COLOR : CLAIMS_COLOR, transparent: true, opacity: 0.9, depthTest: false });
            line = new three.LineLoop(geometry, material);
            line.renderOrder = 10;
            this.scene.add(line);
        }
        let label = null;
        if (this.layer && this.documentImpl) {
            label = this.documentImpl.createElement('div');
            label.className = entry.spawn ? 'claim-marker claim-marker-spawn' : 'claim-marker';
            label.style.display = 'none';
            label.textContent = entry.name;
            this.layer.appendChild(label);
        }
        const mark = { entry, line, label, shownAt: null };
        this.marks.set(entry.key, mark);
        return mark;
    }

    removeMark(key, mark) {
        if (mark.line) {
            if (this.scene) this.scene.remove(mark.line);
            mark.line.geometry.dispose();
            mark.line.material.dispose();
        }
        if (mark.label) mark.label.remove();
        this.marks.delete(key);
    }

    clear() {
        for (const [key, mark] of this.marks) this.removeMark(key, mark);
    }

    // Each frame: each label over the middle of its square (playerMarkerScreen, playerMarkers.js).
    update(camera, width, height) {
        for (const mark of this.marks.values()) {
            if (!mark.label) continue;
            const e = mark.entry;
            const screen = playerMarkerScreen((e.minX + e.maxX + 1) / 2, e.y + 2, (e.minZ + e.maxZ + 1) / 2, camera, width, height);
            const placement = screen && screen.inView ? `translate(${Math.round(screen.left)}px, ${Math.round(screen.top)}px) translate(-50%, -50%)` : null;
            if (placement === mark.shownAt) continue;
            mark.shownAt = placement;
            mark.label.style.display = placement ? '' : 'none';
            if (placement) mark.label.style.transform = placement;
        }
    }

    // Goes into the stats panel as HTML, so numbers only: never a name.
    statusLine() {
        if (!this.enabled) return '';
        if (this.failures) return 'Plots: unavailable';
        if (!this.answered) return 'Plots: loading…';
        const plots = [...this.marks.values()].filter((mark) => !mark.entry.spawn).length;
        return `Plots: <b>${plots}</b>`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ClaimMarkers, claimMarkerEntries, claimMarkerOutline, CLAIMS_URL, CLAIMS_POLL_MS, CLAIMS_NO_NAME, CLAIMS_SPAWN_NAME };
}
