// What the viewer knows of the blocks players changed, kept up to date from the server's read-only
// /viewer-api/ endpoints (pkg/network/viewer.go): the list of changed chunks, read on load and then
// polled, and the columns of each page of 16 x 16 chunks, read when a tile first needs them. Every
// failure ends in the same place: terrain only, nothing thrown, and another try later. Memory is
// bounded by what players changed: 8 bytes per changed column, 200 per chunk in the list.

const BUILT_POLL_MS = 5000;
const BUILT_RETRY_MS = 30000;
const BUILT_TIMEOUT_MS = 8000;
const BUILT_PAGE_FETCHES = 4;
// A server this slow to give the first list does not hold back the first tiles.
const BUILT_SETTLE_MS = 1500;

class BuiltBlocks {
    // onChanged(rows): chunks whose blocks changed, or that appeared or went; onPages(): what tiles
    // were waiting for has arrived, so they can go on.
    constructor({ onChanged = () => {}, onPages = () => {}, fetchImpl = null, schedule = true } = {}) {
        this.onChanged = onChanged;
        this.onPages = onPages;
        this.fetchImpl = fetchImpl || ((...args) => fetch(...args));
        this.schedule = schedule;
        this.enabled = true;
        // Whether the server answered its last poll. settled: tiles need not wait for the first list.
        this.available = false;
        this.settled = false;
        this.epoch = null;
        this.since = 0;
        this.scanning = false;
        this.rows = new Map();
        this.columnTotal = 0;
        this.pageRows = new Map();
        this.pages = new Map();
        this.fetching = 0;
        this.fetchQueue = [];
        this.bytes = 0;
        this.lastPollBytes = 0;
    }

    start() {
        if (!this.schedule) return;
        setTimeout(() => this.settle(), BUILT_SETTLE_MS);
        this.pollLoop();
    }

    async pollLoop() {
        const hidden = typeof document !== 'undefined' && document.hidden;
        if (!hidden) await this.poll();
        setTimeout(() => this.pollLoop(), this.available ? BUILT_POLL_MS : BUILT_RETRY_MS);
    }

    async fetchWithTimeout(url) {
        const abort = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = abort ? setTimeout(() => abort.abort(), BUILT_TIMEOUT_MS) : null;
        try {
            const response = await this.fetchImpl(url, abort ? { signal: abort.signal } : {});
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response;
        } finally {
            if (timer !== null) clearTimeout(timer);
        }
    }

    // One round: asks for what changed since the last one until nothing is left. Never rejects.
    async poll() {
        const changed = [];
        let bytes = 0;
        try {
            // Far more rounds than any list needs: a broken server cannot keep it here forever.
            for (let round = 0; round < 256; round++) {
                const response = await this.fetchWithTimeout(`/viewer-api/changes?since=${this.since}`);
                const text = await response.text();
                bytes += text.length;
                const list = JSON.parse(text);
                if (this.epoch !== list.epoch) {
                    // A new run of the server: its versions are not ours, so start over.
                    const askedFromOldVersion = this.since !== 0;
                    if (this.epoch !== null) changed.push(...this.clear());
                    this.epoch = list.epoch;
                    if (askedFromOldVersion) continue;
                }
                this.applyRows(list.chunks, changed);
                this.since = list.next;
                this.scanning = list.scanning;
                if (!list.more) break;
            }
            this.available = true;
        } catch (_error) {
            // No server (a static copy of the page) or a bad moment: terrain only for now.
            this.available = false;
        }
        this.lastPollBytes = bytes;
        this.bytes += bytes;
        this.settle();
        if (changed.length) this.onChanged(changed);
    }

    settle() {
        if (this.settled) return;
        this.settled = true;
        this.onPages();
    }

    // Forgets everything; returns the rows it held, whose tiles need rebuilding.
    clear() {
        const rows = Array.from(this.rows.values());
        this.rows.clear();
        this.pageRows.clear();
        this.pages.clear();
        this.columnTotal = 0;
        this.since = 0;
        return rows;
    }

    applyRows(list, changed) {
        for (const [x, z, version, columns, raisedCount, raisedTop, raisedColor, loweredCount, loweredTop, loweredColor] of list) {
            const key = `${x},${z}`;
            const previous = this.rows.get(key);
            const pageKey = this.pageKey(x, z);
            if (previous) this.columnTotal -= previous.columns;
            const row = { key, x, z, version, columns, raisedCount, raisedTop, raisedColor, loweredCount, loweredTop, loweredColor };
            this.rows.set(key, row);
            this.columnTotal += columns;
            let members = this.pageRows.get(pageKey);
            if (!members) {
                members = new Set();
                this.pageRows.set(pageKey, members);
            }
            members.add(key);
            const page = this.pages.get(pageKey);
            if (page) page.status = page.status === 'loading' ? 'dirty' : 'stale';
            changed.push(row);
        }
    }

    pageKey(chunkX, chunkZ) {
        return `${overlayPageOf(chunkX)},${overlayPageOf(chunkZ)}`;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        this.onChanged(Array.from(this.rows.values()));
    }

    // The pages holding changed chunks a tile shows (none for far tiles: they use the list).
    pagesForTile(lod, tileX, tileZ) {
        const keys = [];
        if (lod >= OVERLAY_SUMMARY_LOD || this.pageRows.size === 0) return keys;
        const range = overlayTileRange(lod, tileX, tileZ);
        for (let px = overlayPageOf(range.minX); px <= overlayPageOf(range.maxX); px++) {
            for (let pz = overlayPageOf(range.minZ); pz <= overlayPageOf(range.maxZ); pz++) {
                const key = `${px},${pz}`;
                if (this.pageRows.has(key)) keys.push(key);
            }
        }
        return keys;
    }

    // Whether a tile can be built now; if not, what it waits for is asked for.
    readyForTile(lod, tileX, tileZ) {
        if (!this.enabled) return true;
        let ready = true;
        for (const key of this.pagesForTile(lod, tileX, tileZ)) {
            const page = this.pages.get(key);
            if (page && (page.status === 'ready' || page.status === 'failed')) continue;
            ready = false;
            this.requestPage(key);
        }
        return ready;
    }

    requestPage(key) {
        const page = this.pages.get(key);
        if (page && page.status !== 'stale') return;
        if (page) page.status = 'loading';
        else this.pages.set(key, { status: 'loading', chunks: new Map(), names: [] });
        this.fetchQueue.push(key);
        this.pumpFetches();
    }

    pumpFetches() {
        while (this.fetching < BUILT_PAGE_FETCHES && this.fetchQueue.length) {
            this.fetching++;
            this.fetchPage(this.fetchQueue.shift()).finally(() => {
                this.fetching--;
                this.pumpFetches();
                this.onPages();
            });
        }
    }

    async fetchPage(key) {
        const [px, pz] = key.split(',').map(Number);
        const x0 = px * OVERLAY_PAGE_CHUNKS;
        const z0 = pz * OVERLAY_PAGE_CHUNKS;
        const url = `/viewer-api/surface?x0=${x0}&z0=${z0}&x1=${x0 + OVERLAY_PAGE_CHUNKS - 1}&z1=${z0 + OVERLAY_PAGE_CHUNKS - 1}`;
        const page = this.pages.get(key);
        try {
            const response = await this.fetchWithTimeout(url);
            const buffer = await response.arrayBuffer();
            this.bytes += buffer.byteLength;
            const decoded = overlayDecodeSurface(buffer);
            page.names = decoded.names;
            page.chunks = new Map(decoded.chunks.map((chunk) => [`${chunk.x},${chunk.z}`, chunk]));
            // It changed again while on its way: the next tile that needs it asks anew.
            page.status = page.status === 'dirty' ? 'stale' : 'ready';
        } catch (_error) {
            // The tile is built from what there is; the next change or reload tries again.
            page.status = 'failed';
        }
    }

    // What a tile's builder gets: a transferable array of records, or null if there is nothing.
    recordsForTile(lod, tileX, tileZ) {
        if (!this.enabled || this.rows.size === 0) return null;
        const range = overlayTileRange(lod, tileX, tileZ);
        const inside = (x, z) => x >= range.minX && x <= range.maxX && z >= range.minZ && z <= range.maxZ;
        let records;
        if (lod >= OVERLAY_SUMMARY_LOD) {
            const rows = [];
            for (const row of this.rows.values()) {
                if (inside(row.x, row.z) && row.columns > 0) rows.push(row);
            }
            records = overlayRecordsFromSummaries(rows);
        } else {
            const chunks = [];
            for (const key of this.pagesForTile(lod, tileX, tileZ)) {
                const page = this.pages.get(key);
                if (!page) continue;
                for (const chunk of page.chunks.values()) {
                    if (inside(chunk.x, chunk.z) && chunk.columns.length) chunks.push(chunk);
                }
            }
            records = overlayRecordsFromColumns(chunks);
        }
        return records.length ? records : null;
    }

    // The block on top of a changed column, for the probe: { y, name }, or null.
    columnAt(x, z) {
        const chunkX = Math.floor(x / OVERLAY_CHUNK_SIZE);
        const chunkZ = Math.floor(z / OVERLAY_CHUNK_SIZE);
        const page = this.enabled ? this.pages.get(this.pageKey(chunkX, chunkZ)) : null;
        const chunk = page && page.chunks.get(`${chunkX},${chunkZ}`);
        if (!chunk) return null;
        const lx = x - chunkX * OVERLAY_CHUNK_SIZE;
        const lz = z - chunkZ * OVERLAY_CHUNK_SIZE;
        for (let i = 0; i < chunk.columns.length / 2; i++) {
            const column = overlayColumn(chunk.columns, i);
            if (column.lx === lx && column.lz === lz) return { y: column.y, name: page.names[column.name] };
        }
        return null;
    }

    statusLine() {
        if (!this.enabled) return 'Built blocks: hidden';
        if (!this.available) return this.rows.size ? `Built blocks: <b>${this.rows.size}</b> chunks (server not answering)` : 'Built blocks: no server, terrain only';
        const scanning = this.scanning ? ' · server still scanning' : '';
        return `Built blocks: <b>${this.rows.size}</b> chunks · ${this.columnTotal} columns${scanning}`;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { BuiltBlocks, BUILT_POLL_MS };
