// The real blocks of what players changed, when the camera comes close: the game's own meshing and
// materials, for a few chunks at a time. Nothing heavy loads until the first changed chunk is in
// range, so flying far above costs nothing more than this file.
//
// The game's scripts run here as in the printable guide: index.html's list minus the game, network
// and book, over a stub `class Game {}`, which gives a WorldRenderer whose materials draw the
// meshes. The meshing itself is not done on this thread: the game meshes on its main thread within
// a time budget (its chunk worker only decodes), but the mesher only needs materials to tell them
// apart, so js/viewer/nearWorker.js runs the same scripts with tokens in place of materials, fetches
// and decodes the chunks and sends back typed arrays. Here a finished mesh only has to be wrapped
// in a geometry, one per frame.
//
// The switch: a chunk's mesh goes up at once where the tile's overlay already shows the same shape,
// and over NEAR_FADE_MS the tiles dissolve in that chunk, pixel by pixel. The tile's shader reads a
// small mask for that (nearApplyMask). Leaving is the same backwards, and the chunk is disposed
// when the tile is whole again. Budgets are hard: NEAR_MAX_CHUNKS meshes and NEAR_MAX_DRAW_CALLS
// draw calls, nearest first, and what does not fit just stays as the overlay.

const NEAR_RADIUS = 112;
// Chunks stay until this much further, so that hovering at the edge does not rebuild them.
const NEAR_KEEP_RADIUS = 144;
const NEAR_MAX_CHUNKS = 36;
const NEAR_MAX_DRAW_CALLS = 900;
// What a chunk not meshed yet is expected to cost; its real cost replaces this.
const NEAR_DRAW_ESTIMATE = 16;
const NEAR_FADE_MS = 250;
const NEAR_SELECT_MS = 200;
// The mask covers this many chunks a side, wrapping around, centred on the camera.
const NEAR_MASK_SIZE = 32;
const NEAR_MASK_REACH = 15;
// Above this nothing can be in range, whatever is built under it.
const NEAR_MAX_CAMERA_Y = 400;
// Scripts of index.html not needed for drawing blocks (the same as js/guidePrint.js).
const NEAR_SKIP_SCRIPTS = /(^|\/)(game|websocket|voice|guideMarkdown|guidePrint)\.js$|(^|\/)game\/guide\.js$/;

// The local scripts of a page, in order, without those.
function nearGameScripts(html) {
    return [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1])
        .filter((src) => !/^(https?:)?\/\//.test(src) && !NEAR_SKIP_SCRIPTS.test(src));
}

// How far the camera is from what shows of a chunk (a row of the changes list).
function nearChunkDistance(row, cameraX, cameraY, cameraZ) {
    const minX = row.x * 16;
    const minZ = row.z * 16;
    const dx = Math.max(minX - cameraX, 0, cameraX - (minX + 16));
    const dz = Math.max(minZ - cameraZ, 0, cameraZ - (minZ + 16));
    const top = row.raisedCount > 0 ? row.raisedTop : row.loweredCount > 0 ? row.loweredTop : 10;
    return Math.hypot(dx, dz, Math.max(0, cameraY - top));
}

// Which chunks to show. `rows` is any list of rows; `active` the keys shown now, which stay up to
// keepRadius. `drawCost(key)` is what a chunk costs in draw calls, if known. Nearest first, those
// with something on the surface before those changed only underground; the walk ends at the first
// chunk over budget, so a far chunk never takes the place of a nearer one.
function nearSelectChunks(rows, { x, y, z, active = new Set(), radius = NEAR_RADIUS, keepRadius = NEAR_KEEP_RADIUS, maxChunks = NEAR_MAX_CHUNKS, maxDrawCalls = NEAR_MAX_DRAW_CALLS, drawCost = () => null }) {
    const candidates = [];
    for (const row of rows) {
        const distance = nearChunkDistance(row, x, y, z);
        if (distance <= (active.has(row.key) ? keepRadius : radius)) candidates.push({ row, distance });
    }
    candidates.sort((a, b) => (a.row.columns > 0 ? 0 : 1) - (b.row.columns > 0 ? 0 : 1) || a.distance - b.distance);
    const chosen = [];
    let draws = 0;
    for (const { row } of candidates) {
        if (chosen.length >= maxChunks) break;
        const cost = drawCost(row.key) ?? NEAR_DRAW_ESTIMATE;
        if (draws + cost > maxDrawCalls) break;
        draws += cost;
        chosen.push(row);
    }
    return chosen;
}

// One step of a fade towards 0 or 1.
function nearFadeStep(fade, target, deltaMs) {
    const change = deltaMs / NEAR_FADE_MS;
    return target > fade ? Math.min(target, fade + change) : Math.max(target, fade - change);
}

function nearMaskIndex(chunkX, chunkZ) {
    const wrap = (v) => ((v % NEAR_MASK_SIZE) + NEAR_MASK_SIZE) % NEAR_MASK_SIZE;
    return (wrap(chunkZ) * NEAR_MASK_SIZE + wrap(chunkX)) * 4;
}

// Teaches a tile's material to leave out the chunks in the mask. A wall's fragments count for the
// column they belong to (behind their normal), so the wall of a neighbour stays at a chunk's edge.
function nearApplyMask(material, uniforms) {
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec2 vNearColumn;')
            .replace('#include <begin_vertex>', [
                '#include <begin_vertex>',
                'vNearColumn = (modelMatrix * vec4(transformed, 1.0)).xz - normalize(objectNormal).xz * 0.02;'
            ].join('\n'));
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', [
                '#include <common>',
                'varying vec2 vNearColumn;',
                'uniform sampler2D nearMask;',
                'uniform vec3 nearCenter;'
            ].join('\n'))
            .replace('#include <clipping_planes_fragment>', [
                '#include <clipping_planes_fragment>',
                'if (nearCenter.z > 0.5) {',
                '    vec2 nearChunk = floor(vNearColumn / 16.0);',
                '    vec2 nearAway = abs(nearChunk - nearCenter.xy);',
                `    if (max(nearAway.x, nearAway.y) <= ${NEAR_MASK_REACH}.0) {`,
                `        float nearFade = texture2D(nearMask, (mod(nearChunk, ${NEAR_MASK_SIZE}.0) + 0.5) / ${NEAR_MASK_SIZE}.0).r;`,
                '        if (nearFade > fract(dot(floor(gl_FragCoord.xy), vec2(0.7548777, 0.5698403)))) discard;',
                '    }',
                '}'
            ].join('\n'));
    };
    material.customProgramCacheKey = () => 'viewer-near-mask';
}

class NearBlocks {
    // `built` is the BuiltBlocks with the list of chunks. createWorker and loadEngine stand in for
    // the browser's in tests.
    constructor({ scene, built, createWorker = null, loadEngine = null }) {
        this.scene = scene;
        this.built = built;
        this.createWorker = createWorker || (() => new Worker('/js/viewer/nearWorker.js'));
        this.loadEngine = loadEngine || NearBlocks.loadGameEngine;
        this.enabled = true;
        // idle, loading, ready or failed
        this.state = 'idle';
        this.world = null;
        this.sources = null;
        this.worker = null;
        this.active = new Map();
        this.finished = [];
        this.revs = new Map();
        this.costs = new Map();
        this.sentWant = '';
        this.wanted = new Map();
        this.lastSelect = -Infinity;
        this.lastFrame = 0;
        this.meshMs = 0;
        this.meshed = 0;

        this.maskData = new Uint8Array(NEAR_MASK_SIZE * NEAR_MASK_SIZE * 4);
        this.maskTexture = new THREE.DataTexture(this.maskData, NEAR_MASK_SIZE, NEAR_MASK_SIZE, THREE.RGBAFormat);
        this.maskTexture.magFilter = THREE.NearestFilter;
        this.maskTexture.minFilter = THREE.NearestFilter;
        this.maskTexture.needsUpdate = true;
        this.uniforms = { nearMask: { value: this.maskTexture }, nearCenter: { value: new THREE.Vector3(0, 0, 0) } };
    }

    // ------------------------------------------------------------------ the heavy code

    static async loadGameEngine() {
        const response = await fetch('index.html', { cache: 'no-cache' });
        if (!response.ok) throw new Error(`index.html: HTTP ${response.status}`);
        const sources = nearGameScripts(await response.text());
        if (typeof Game === 'undefined') window.Game = class Game {};
        for (const src of sources) {
            await new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                script.onerror = () => { console.warn('[viewer] could not load', src); resolve(); };
                document.head.appendChild(script);
            });
        }
        const world = new WorldRenderer(new THREE.Scene());
        // No terrain here: the chunk decoder worker is not needed.
        if (world.chunkDecoder) world.chunkDecoder.terminate();
        return { world, sources };
    }

    async startEngine() {
        this.state = 'loading';
        try {
            const { world, sources } = await this.loadEngine();
            this.world = world;
            this.sources = sources;
            this.state = 'ready';
            if (this.enabled && this.built.enabled) this.startWorker();
        } catch (error) {
            console.warn('[viewer] no near detail:', error);
            this.state = 'failed';
        }
    }

    startWorker() {
        if (this.worker || this.state !== 'ready') return;
        this.worker = this.createWorker();
        this.worker.onmessage = (e) => this.onWorkerMessage(e.data);
        this.worker.onerror = (e) => {
            console.warn('[viewer] near detail worker failed:', e.message);
            this.stopWorker();
            this.state = 'failed';
        };
        this.worker.postMessage({ type: 'init', sources: this.sources });
        this.sentWant = '';
    }

    stopWorker() {
        if (this.worker) this.worker.terminate();
        this.worker = null;
        this.sentWant = '';
    }

    onWorkerMessage(message) {
        if (message.type === 'mesh') {
            this.finished.push(message);
            this.meshMs += message.ms;
            this.meshed++;
        } else if (message.type === 'failed') {
            console.warn('[viewer] near detail worker cannot start:', message.reason);
            this.stopWorker();
            this.state = 'failed';
        }
    }

    // ------------------------------------------------------------------ what to show

    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) this.stopWorker();
        this.lastSelect = -Infinity;
    }

    // Chunks changed on the server: they and the neighbours sharing their borders mesh again.
    onChanged(rows) {
        const keys = [];
        for (const row of rows) {
            keys.push(row.key);
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const key = `${row.x + dx},${row.z + dz}`;
                    if (this.active.has(key) || this.wanted.has(key)) this.revs.set(key, (this.revs.get(key) || 0) + 1);
                }
            }
        }
        if (this.worker && keys.length) this.worker.postMessage({ type: 'invalidate', keys });
        this.lastSelect = -Infinity;
    }

    // Rows in reach of the camera, without walking the whole list.
    rowsAround(position) {
        const rows = [];
        if (position.y > NEAR_MAX_CAMERA_Y) return rows;
        const reach = Math.ceil(NEAR_KEEP_RADIUS / 16) + 1;
        const centerX = Math.floor(position.x / 16);
        const centerZ = Math.floor(position.z / 16);
        for (let x = centerX - reach; x <= centerX + reach; x++) {
            for (let z = centerZ - reach; z <= centerZ + reach; z++) {
                const row = this.built.rows.get(`${x},${z}`);
                if (row) rows.push(row);
            }
        }
        return rows;
    }

    select(position) {
        const on = this.enabled && this.built.enabled;
        const chosen = on ? nearSelectChunks(this.rowsAround(position), {
            x: position.x, y: position.y, z: position.z,
            active: new Set(this.active.keys()),
            drawCost: (key) => this.costs.get(key) ?? null
        }) : [];
        this.wanted = new Map(chosen.map((row) => [row.key, row]));

        if (chosen.length && this.state === 'idle') this.startEngine();
        if (chosen.length) this.startWorker();
        if (this.worker) {
            const want = chosen
                .filter((row) => !this.active.has(row.key) || this.active.get(row.key).rev !== (this.revs.get(row.key) || 0))
                .map((row) => ({ key: row.key, x: row.x, z: row.z, rev: this.revs.get(row.key) || 0 }));
            const near = chosen.map((row) => row.key);
            const signature = JSON.stringify([want, near]);
            if (signature !== this.sentWant) {
                this.sentWant = signature;
                this.worker.postMessage({ type: 'want', list: want, near });
            }
        }
        // A chunk no longer chosen starts leaving; one chosen again comes back.
        for (const [key, chunk] of this.active) chunk.leaving = !this.wanted.has(key);
        // What the costs say about chunks long gone is not worth keeping.
        if (this.costs.size > NEAR_MAX_CHUNKS * 16) this.costs.clear();
        const center = this.uniforms.nearCenter.value;
        center.set(Math.floor(position.x / 16), Math.floor(position.z / 16), this.active.size > 0 ? 1 : 0);
    }

    // ------------------------------------------------------------------ meshes

    adoptOne() {
        while (this.finished.length) {
            const result = this.finished.shift();
            // Out of range by the time it came, or an older version than the one asked for now.
            if (!this.wanted.has(result.key) || result.rev !== (this.revs.get(result.key) || 0)) {
                this.forget(result.key);
                continue;
            }
            if (this.adopt(result)) return;
        }
    }

    // The worker will not mesh a chunk again until told it no longer counts as done.
    forget(key) {
        if (this.worker) this.worker.postMessage({ type: 'forget', key });
    }

    drawCalls() {
        let draws = 0;
        for (const chunk of this.active.values()) draws += chunk.draws;
        return draws;
    }

    // Puts a finished mesh in the scene, unless it would go over the budget (it costs more than
    // expected): the cost is noted, and the next selection leaves room or leaves it out.
    adopt(result) {
        const previous = this.active.get(result.key);
        let draws = result.ladders.length;
        for (const part of result.parts) draws += part.groups.length;
        this.costs.set(result.key, Math.max(1, draws));
        if (this.drawCalls() - (previous ? previous.draws : 0) + draws > NEAR_MAX_DRAW_CALLS) {
            this.forget(result.key);
            return false;
        }

        const group = new THREE.Group();
        group.position.set(result.x * 16, 0, result.z * 16);
        group.updateMatrix();
        group.matrixAutoUpdate = false;
        let triangles = 0;
        for (const part of result.parts) {
            group.add(this.createPartMesh(part));
            triangles += part.indices.length / 3;
        }
        for (const { x, y, z, facing } of result.ladders) {
            const ladder = this.world.createLadderMesh(facing);
            ladder.position.x += x + 0.5;
            ladder.position.y += y;
            ladder.position.z += z + 0.5;
            group.add(ladder);
        }
        const chunk = { key: result.key, x: result.x, z: result.z, rev: result.rev, group, draws, triangles, fade: previous ? previous.fade : 0, leaving: false };
        if (previous) this.disposeGroup(previous.group);
        this.scene.add(group);
        this.active.set(result.key, chunk);
        return true;
    }

    createPartMesh(part) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2));
        geometry.setAttribute('color', new THREE.BufferAttribute(part.colors, 3));
        geometry.setAttribute('blockLight', new THREE.BufferAttribute(part.light, 1));
        geometry.setAttribute('skyLight', new THREE.BufferAttribute(part.sky, 1));
        geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
        for (const { start, count, materialIndex } of part.groups) geometry.addGroup(start, count, materialIndex);
        // Bounds come from the worker, no need to scan the vertices.
        geometry.boundingBox = new THREE.Box3(new THREE.Vector3(part.box[0], part.box[1], part.box[2]), new THREE.Vector3(part.box[3], part.box[4], part.box[5]));
        geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
        const mesh = new THREE.Mesh(geometry, part.materials.map((ref) => this.resolveMaterial(ref)));
        mesh.renderOrder = part.renderOrder;
        mesh.matrixAutoUpdate = false;
        return mesh;
    }

    // A token of the worker's mesher, as [type, face]: the material it stands for on this side.
    resolveMaterial([type, face]) {
        if (face === 'atlas') return this.world.getChunkAtlasMaterial(type);
        const material = this.world.getChunkMaterial(type);
        return Array.isArray(material) ? material[Math.max(0, face)] : material;
    }

    // Geometry is the chunk's own; materials and textures are the world's shared caches.
    disposeGroup(group) {
        this.scene.remove(group);
        for (const child of group.children) {
            if (child.geometry) child.geometry.dispose();
        }
    }

    // ------------------------------------------------------------------ every frame

    // Fades the mask and disposes what has finished leaving.
    updateFades(deltaMs) {
        let touched = false;
        for (const [key, chunk] of this.active) {
            const target = chunk.leaving ? 0 : 1;
            if (chunk.fade !== target) {
                chunk.fade = nearFadeStep(chunk.fade, target, deltaMs);
                this.maskData[nearMaskIndex(chunk.x, chunk.z)] = Math.round(chunk.fade * 255);
                touched = true;
            }
            if (chunk.leaving && chunk.fade === 0) {
                this.disposeGroup(chunk.group);
                this.active.delete(key);
                this.forget(key);
            }
        }
        if (touched) this.maskTexture.needsUpdate = true;
        if (this.active.size === 0) this.uniforms.nearCenter.value.z = 0;
    }

    update(now, position) {
        const deltaMs = Math.min(100, now - this.lastFrame);
        this.lastFrame = now;
        if (now - this.lastSelect >= NEAR_SELECT_MS) {
            this.lastSelect = now;
            this.select(position);
        }
        this.adoptOne();
        if (this.active.size) {
            this.uniforms.nearCenter.value.z = 1;
            this.updateFades(deltaMs);
        }
    }

    statusLine() {
        if (!this.built.enabled) return '';
        if (!this.enabled) return 'Near detail: off';
        if (this.state === 'failed') return 'Near detail: unavailable';
        if (this.state === 'loading') return 'Near detail: loading block code…';
        if (this.state === 'idle') return 'Near detail: nothing in range';
        let triangles = 0;
        for (const chunk of this.active.values()) triangles += chunk.triangles;
        const draws = this.drawCalls();
        const average = this.meshed ? ` · ${(this.meshMs / this.meshed).toFixed(0)} ms a chunk` : '';
        return `Near detail: <b>${this.active.size}</b> chunks · ${draws} draws · ${(triangles / 1000).toFixed(1)} k triangles${average}`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        NearBlocks, nearGameScripts, nearChunkDistance, nearSelectChunks, nearFadeStep, nearMaskIndex, nearApplyMask,
        NEAR_RADIUS, NEAR_KEEP_RADIUS, NEAR_MAX_CHUNKS, NEAR_MAX_DRAW_CALLS, NEAR_FADE_MS, NEAR_SKIP_SCRIPTS, NEAR_MASK_REACH
    };
}
