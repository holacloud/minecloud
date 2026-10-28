// Massive terrain viewer.
//
// The world is covered by a quadtree of tiles: a tile at level-of-detail `lod` samples the
// terrain every 2^lod blocks over TILE_SAMPLES x TILE_SAMPLES samples, so every tile has
// the same cost while covering 4x the area of its children. Nodes near the camera split
// down to lod 0 (one sample per column); far nodes stay coarse. Tiles are built off the
// main thread by a pool of workers, coarse and near ones first, and a node keeps drawing
// its parent until its own children are ready.

const TILE_SAMPLES = 64;
const MAX_LOD = 9;
const CACHE_LIMIT = 900;

class TerrainViewer {
    constructor(container) {
        this.container = container;
        this.settings = { detail: 1.3, viewRadius: 12000, colorMode: 'blocks', water: true, trees: true };
        this.tiles = new Map();
        this.queue = new Map();
        this.selected = new Set();
        this.frameId = 0;
        this.lastSelectionAt = 0;
        this.needsSelection = true;

        this.initScene();
        this.initWorkers();
        this.initUI();
        this.animate();
    }

    initScene() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x9ec8ea);
        this.scene.fog = new THREE.Fog(0x9ec8ea, 4000, 16000);

        this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 60000);
        this.camera.position.set(-260, 260, 320);

        this.controls = new THREE.MapControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 12, 0);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.12;
        this.controls.screenSpacePanning = false;
        this.controls.maxPolarAngle = Math.PI * 0.49;
        this.controls.minDistance = 8;
        this.controls.maxDistance = 30000;
        if (typeof this.controls.listenToKeyEvents === 'function') this.controls.listenToKeyEvents(window);
        this.controls.keyPanSpeed = 40;
        this.controls.addEventListener('change', () => { this.needsSelection = true; });
        this.controls.update();

        this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5a4a38, 0.75));
        const sun = new THREE.DirectionalLight(0xfff1d6, 0.85);
        sun.position.set(0.5, 1, 0.35);
        this.scene.add(sun);

        this.landMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
        this.waterMaterial = new THREE.MeshLambertMaterial({ color: 0x3a7fc4, transparent: true, opacity: 0.72, depthWrite: false });

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.needsSelection = true;
        });
    }

    initWorkers() {
        const count = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
        this.workers = [];
        this.jobId = 0;
        for (let i = 0; i < count; i++) {
            const worker = new Worker('/js/viewer/tileWorker.js');
            const slot = { worker, busy: null };
            worker.onmessage = (e) => this.onTileBuilt(slot, e.data);
            this.workers.push(slot);
        }
    }

    // ------------------------------------------------------------------ quadtree

    tileKey(lod, tileX, tileZ) {
        return `${lod}:${tileX}:${tileZ}`;
    }

    tileWorldSize(lod) {
        return TILE_SAMPLES * (1 << lod);
    }

    nodeDistance(lod, tileX, tileZ) {
        const size = this.tileWorldSize(lod);
        const minX = tileX * size;
        const minZ = tileZ * size;
        const camera = this.camera.position;
        const dx = Math.max(minX - camera.x, 0, camera.x - (minX + size));
        const dz = Math.max(minZ - camera.z, 0, camera.z - (minZ + size));
        const dy = Math.max(0, camera.y - 30);
        return Math.hypot(dx, dy, dz);
    }

    shouldSplit(lod, tileX, tileZ) {
        return lod > 0 && this.nodeDistance(lod, tileX, tileZ) < this.tileWorldSize(lod) * this.settings.detail;
    }

    isReady(key) {
        const tile = this.tiles.get(key);
        return Boolean(tile && tile.mesh);
    }

    // Whether this node (or, failing that, its descendants) can cover its area right now.
    canCover(lod, tileX, tileZ) {
        if (this.shouldSplit(lod, tileX, tileZ)) {
            let all = true;
            for (const [cx, cz] of this.children(tileX, tileZ)) {
                if (!this.canCover(lod - 1, cx, cz)) { all = false; break; }
            }
            if (all) return true;
        }
        return this.isReady(this.tileKey(lod, tileX, tileZ));
    }

    children(tileX, tileZ) {
        return [[tileX * 2, tileZ * 2], [tileX * 2 + 1, tileZ * 2], [tileX * 2, tileZ * 2 + 1], [tileX * 2 + 1, tileZ * 2 + 1]];
    }

    visit(lod, tileX, tileZ, visible, wanted) {
        const key = this.tileKey(lod, tileX, tileZ);
        const distance = this.nodeDistance(lod, tileX, tileZ);
        if (distance > this.settings.viewRadius) return;
        // Every visited node is wanted as a fallback, coarse ones with the highest priority.
        wanted.set(key, { lod, tileX, tileZ, priority: lod * 1e6 - distance });

        if (this.shouldSplit(lod, tileX, tileZ)) {
            const kids = this.children(tileX, tileZ);
            if (kids.every(([cx, cz]) => this.canCover(lod - 1, cx, cz) || this.nodeDistance(lod - 1, cx, cz) > this.settings.viewRadius)) {
                for (const [cx, cz] of kids) this.visit(lod - 1, cx, cz, visible, wanted);
                return;
            }
            // Children not ready yet: keep drawing this node, but keep requesting them.
            for (const [cx, cz] of kids) this.visit(lod - 1, cx, cz, new Set(), wanted);
        }
        if (this.isReady(key)) visible.add(key);
    }

    updateSelection() {
        const visible = new Set();
        const wanted = new Map();
        const rootSize = this.tileWorldSize(MAX_LOD);
        const camera = this.camera.position;
        const radius = this.settings.viewRadius;
        const minX = Math.floor((camera.x - radius) / rootSize);
        const maxX = Math.floor((camera.x + radius) / rootSize);
        const minZ = Math.floor((camera.z - radius) / rootSize);
        const maxZ = Math.floor((camera.z + radius) / rootSize);
        for (let tx = minX; tx <= maxX; tx++) {
            for (let tz = minZ; tz <= maxZ; tz++) {
                this.visit(MAX_LOD, tx, tz, visible, wanted);
            }
        }

        for (const key of this.selected) {
            if (!visible.has(key)) this.setVisible(key, false);
        }
        for (const key of visible) this.setVisible(key, true);
        this.selected = visible;

        this.queue.clear();
        for (const [key, job] of wanted) {
            if (!this.tiles.has(key)) this.queue.set(key, job);
            else this.tiles.get(key).lastWanted = this.frameId;
        }
        this.dispatch();
        this.evict(wanted);
    }

    setVisible(key, visible) {
        const tile = this.tiles.get(key);
        if (!tile || !tile.mesh) return;
        tile.mesh.visible = visible;
        if (tile.water) tile.water.visible = visible && this.settings.water;
    }

    // ------------------------------------------------------------------ workers

    dispatch() {
        for (const slot of this.workers) {
            if (slot.busy || this.queue.size === 0) continue;
            let best = null;
            for (const [key, job] of this.queue) {
                if (!best || job.priority > best.job.priority) best = { key, job };
            }
            this.queue.delete(best.key);
            this.tiles.set(best.key, { mesh: null, pending: true, lastWanted: this.frameId });
            slot.busy = best.key;
            slot.worker.postMessage({
                id: best.key,
                lod: best.job.lod,
                tileX: best.job.tileX,
                tileZ: best.job.tileZ,
                colorMode: this.settings.colorMode,
                trees: this.settings.trees
            });
        }
    }

    onTileBuilt(slot, result) {
        slot.busy = null;
        const tile = this.tiles.get(result.id);
        if (tile) {
            const [lod, tileX, tileZ] = result.id.split(':').map(Number);
            const size = this.tileWorldSize(lod);
            tile.mesh = this.createMesh(result.land, this.landMaterial, size, result);
            tile.mesh.position.set(tileX * size, 0, tileZ * size);
            tile.mesh.visible = false;
            this.scene.add(tile.mesh);
            if (result.water) {
                tile.water = this.createMesh(result.water, this.waterMaterial, size, result);
                tile.water.position.copy(tile.mesh.position);
                tile.water.visible = false;
                tile.water.renderOrder = 1;
                this.scene.add(tile.water);
            }
            tile.pending = false;
            tile.triangles = result.land.indices.length / 3;
            tile.blocks = result.blocks;
            tile.columns = result.columns;
            this.needsSelection = true;
        }
        this.dispatch();
    }

    createMesh(data, material, size, result) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3, true));
        geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3, true));
        geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
        // Bounds are known from the tile, no need to scan the vertices.
        geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-8, result.minTop, -8), new THREE.Vector3(size + 8, result.maxTop, size + 8));
        geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
        return new THREE.Mesh(geometry, material);
    }

    evict(wanted) {
        if (this.tiles.size <= CACHE_LIMIT) return;
        const candidates = [];
        for (const [key, tile] of this.tiles) {
            if (wanted.has(key) || tile.pending || this.selected.has(key)) continue;
            candidates.push([key, tile]);
        }
        candidates.sort((a, b) => a[1].lastWanted - b[1].lastWanted);
        for (let i = 0; i < candidates.length && this.tiles.size > CACHE_LIMIT; i++) {
            this.disposeTile(candidates[i][0]);
        }
    }

    disposeTile(key) {
        const tile = this.tiles.get(key);
        if (!tile) return;
        for (const mesh of [tile.mesh, tile.water]) {
            if (!mesh) continue;
            this.scene.remove(mesh);
            mesh.geometry.dispose();
        }
        this.tiles.delete(key);
    }

    // Drops every tile (e.g. after changing the colour mode) and rebuilds from coarse to fine.
    resetTiles() {
        for (const key of Array.from(this.tiles.keys())) {
            if (!this.tiles.get(key).pending) this.disposeTile(key);
        }
        // Results of in-flight jobs are discarded because their entries are gone.
        for (const key of Array.from(this.tiles.keys())) this.tiles.delete(key);
        this.selected = new Set();
        this.needsSelection = true;
    }

    // ------------------------------------------------------------------ UI

    initUI() {
        const $ = (id) => document.getElementById(id);
        $('detail').addEventListener('input', (e) => { this.settings.detail = Number(e.target.value); this.needsSelection = true; });
        $('radius').addEventListener('input', (e) => {
            this.settings.viewRadius = Number(e.target.value);
            this.scene.fog.near = this.settings.viewRadius * 0.35;
            this.scene.fog.far = this.settings.viewRadius * 1.25;
            this.needsSelection = true;
        });
        $('colors').addEventListener('change', (e) => { this.settings.colorMode = e.target.value; this.resetTiles(); });
        $('trees').addEventListener('change', (e) => { this.settings.trees = e.target.checked; this.resetTiles(); });
        $('water').addEventListener('change', (e) => {
            this.settings.water = e.target.checked;
            for (const key of this.selected) this.setVisible(key, true);
        });
        $('goto').addEventListener('submit', (e) => {
            e.preventDefault();
            const x = Number($('goto-x').value) || 0;
            const z = Number($('goto-z').value) || 0;
            const offset = this.camera.position.clone().sub(this.controls.target);
            this.controls.target.set(x, 12, z);
            this.camera.position.copy(this.controls.target).add(offset);
            this.needsSelection = true;
        });

        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.lastPick = 0;
        this.renderer.domElement.addEventListener('pointermove', (e) => {
            this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
            this.pointerMoved = true;
        });

        this.statsEl = $('stats');
        this.probeEl = $('probe');
        $('detail').value = this.settings.detail;
        $('radius').value = this.settings.viewRadius;
        this.scene.fog.near = this.settings.viewRadius * 0.35;
        this.scene.fog.far = this.settings.viewRadius * 1.25;
    }

    updateProbe(now) {
        if (!this.pointerMoved || now - this.lastPick < 120) return;
        this.pointerMoved = false;
        this.lastPick = now;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const meshes = [];
        for (const key of this.selected) meshes.push(this.tiles.get(key).mesh);
        const hit = this.raycaster.intersectObjects(meshes, false)[0];
        if (!hit) {
            this.probeEl.textContent = '—';
            return;
        }
        const x = Math.floor(hit.point.x - hit.face.normal.x * 0.01);
        const z = Math.floor(hit.point.z - hit.face.normal.z * 0.01);
        const surface = columnSurface(x, z);
        const block = blockAt(x, surface.height, z, surface);
        this.probeEl.textContent = `x ${x}  z ${z}  ·  height ${surface.height}  ·  ${surface.biome}  ·  ${block}`;
    }

    updateStats() {
        let triangles = 0;
        let blocks = 0;
        let columns = 0;
        for (const key of this.selected) {
            const tile = this.tiles.get(key);
            triangles += tile.triangles;
            blocks += tile.blocks;
            columns += tile.columns;
        }
        const busy = this.workers.filter((slot) => slot.busy).length;
        const format = (v) => v >= 1e9 ? `${(v / 1e9).toFixed(2)} G` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)} k` : String(v);
        const target = this.controls.target;
        this.statsEl.innerHTML = [
            `<b>${format(blocks)}</b> blocks`,
            `<b>${(columns / 1e6).toFixed(1)} km²</b> area`,
            `<b>${this.selected.size}</b> tiles · ${format(triangles)} triangles`,
            `<b>${this.queue.size + busy}</b> tiles pending (${this.workers.length} workers)`,
            `centre x ${Math.round(target.x)} z ${Math.round(target.z)}`
        ].join('<br>');
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const now = performance.now();
        this.frameId++;
        this.controls.update();
        if (this.needsSelection && now - this.lastSelectionAt > 100) {
            this.needsSelection = false;
            this.lastSelectionAt = now;
            this.updateSelection();
        }
        if (this.frameId % 15 === 0) this.updateStats();
        this.updateProbe(now);
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('load', () => {
    window.terrainViewer = new TerrainViewer(document.getElementById('viewport'));
});
