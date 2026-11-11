// Blueprints: measure a structure, save it as a plan, share the plan as a text code and rebuild it
// block by block over a translucent ghost.
// - Measuring tape (1 iron_ore + 1 planks): right click a block to set corner A, another to set
//   corner B (a third click starts again; right click the sky to clear). The box is outlined with
//   its size ("7 × 4 × 9"). At most BLUEPRINT_MAX_SIDE blocks per side and BLUEPRINT_MAX_BLOCKS
//   blocks inside (air, water, crops and bedrock are not recorded).
// - Blueprint (2 planks + 1 feather -> 2): right click with a box selected to draw it. The empty
//   blueprint becomes a `written_blueprint` and the plan joins your library (localStorage), where
//   it becomes the active plan.
// - Library (L, or right click with a written blueprint and no active plan): rename, pick the
//   active plan, delete, export as a text code (copy it anywhere: a friend imports it) and import
//   a code (it takes one empty blueprint, except in creative mode). It also lists the materials the
//   anchored projection still needs.
// - Projecting: hold the written blueprint and a ghost of the active plan follows the crosshair
//   (T rotates it 90°). Right click anchors it; right click again with the written blueprint lifts
//   it. The anchored ghost shows only the blocks still missing (in each block's colour; red where
//   another block is in the way) and a counter "123 / 400 blocks". Placing the right block in a
//   ghost cell (normally, or right clicking the ghost cell with that block held) makes it vanish.
// - Creative mode only: "Build all" in the library places the missing blocks at 20 per second.
// Every block goes through the normal path (world.addBlock + blockPlace), so other players see it;
// the ghost itself is local to each player (share the code to build together).
// Mixed into Game.prototype; hooked through js/extensions.js.

const BLUEPRINT_MAX_SIDE = 16;
const BLUEPRINT_MAX_BLOCKS = 2048;
const BLUEPRINT_MAX_LIBRARY = 60;
const BLUEPRINT_BUILD_RATE = 20;
const BLUEPRINT_CODE_PREFIX = 'MCBP1:';
const BLUEPRINT_STORAGE = 'minecloud-blueprints';
const BLUEPRINT_PROJECTION_STORAGE = 'minecloud-blueprint-projection';
const BLUEPRINT_ROTATE_KEY = 'KeyT';
const BLUEPRINT_LIBRARY_KEY = 'KeyL';
const BLUEPRINT_LADDER_TURN = { px: 'pz', pz: 'nx', nx: 'nz', nz: 'px' };

// ---------------------------------------------------------------------------------------
// The block that goes with this half of a bed in a plan: { x, y, z, blockType }, or null for all else.
function blueprintOtherBedHalf(cell, blockTypes) {
    if (!isBedBlockType(cell.type)) return null;
    const { state } = blockTypes[cell.type];
    if (state.part === 'single') return null;
    const shape = BLOCK_SHAPES.bed;
    const [[dx, dy, dz]] = shape.linked(state);
    const blockType = shapeStateName('bed', shape, { facing: state.facing, part: state.part === 'foot' ? 'head' : 'foot' });
    return { x: cell.wx + dx, y: cell.wy + dy, z: cell.wz + dz, blockType };
}

// Plans as data (no Game needed): cells are { x, y, z, type, meta } relative to the box corner.

// Cells -> { size, palette, rle, meta }. The box is walked x fastest, then z, then y; each value is
// 0 (empty) or palette index + 1, run-length encoded in base 36 ("3*a" is ten 3s).
function blueprintPack(size, cells) {
    const [w, h, d] = size;
    const volume = new Uint16Array(w * h * d);
    const palette = [];
    const meta = {};
    cells.forEach((cell) => {
        let index = palette.indexOf(cell.type);
        if (index < 0) index = palette.push(cell.type) - 1;
        const i = (cell.y * d + cell.z) * w + cell.x;
        volume[i] = index + 1;
        if (cell.meta) meta[i] = cell.meta;
    });
    const tokens = [];
    for (let i = 0; i < volume.length;) {
        let run = 1;
        while (i + run < volume.length && volume[i + run] === volume[i]) run++;
        tokens.push(run > 1 ? `${volume[i].toString(36)}*${run.toString(36)}` : volume[i].toString(36));
        i += run;
    }
    return { size: [w, h, d], palette, rle: tokens.join('.'), meta, count: cells.length };
}

function blueprintUnpack(plan) {
    const [w, h, d] = plan.size;
    const cells = [];
    let i = 0;
    String(plan.rle || '').split('.').forEach((token) => {
        if (!token) return;
        const [value, run] = token.split('*');
        const v = parseInt(value, 36);
        const n = run ? parseInt(run, 36) : 1;
        for (let k = 0; k < n && i < w * h * d; k++, i++) {
            if (!v || !plan.palette[v - 1]) continue;
            const x = i % w;
            const z = Math.floor(i / w) % d;
            const y = Math.floor(i / (w * d));
            const meta = plan.meta && plan.meta[i];
            cells.push(meta ? { x, y, z, type: plan.palette[v - 1], meta } : { x, y, z, type: plan.palette[v - 1] });
        }
    });
    return cells;
}

// Quarter turns about the vertical axis: (x, z) -> (d - 1 - z, x) each step; ladders turn too.
function blueprintRotate(size, cells, turns) {
    let [w, h, d] = size;
    let out = cells;
    for (let t = 0; t < ((turns % 4) + 4) % 4; t++) {
        const depth = d;
        out = out.map((cell) => {
            const turned = { ...cell, x: depth - 1 - cell.z, z: cell.x };
            if (cell.meta && cell.meta.f) turned.meta = { ...cell.meta, f: BLUEPRINT_LADDER_TURN[cell.meta.f] || cell.meta.f };
            return turned;
        });
        [w, d] = [d, w];
    }
    return { size: [w, h, d], cells: out };
}

function blueprintEncodeCode(plan) {
    const json = JSON.stringify({ n: plan.name, s: plan.size, p: plan.palette, r: plan.rle, m: plan.meta });
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return BLUEPRINT_CODE_PREFIX + btoa(binary);
}

// A code -> a plan, or throws with a reason. isPlaceable(type) says which block types exist here.
function blueprintDecodeCode(text, isPlaceable) {
    const code = String(text || '').replace(/\s+/g, '');
    if (!code.startsWith(BLUEPRINT_CODE_PREFIX)) throw new Error('That is not a blueprint code (it starts with MCBP1:)');
    let data;
    try {
        const binary = atob(code.slice(BLUEPRINT_CODE_PREFIX.length));
        data = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
    } catch (_error) {
        throw new Error('The code is damaged: copy it again, whole');
    }
    const size = Array.isArray(data.s) ? data.s.map((n) => Math.floor(Number(n))) : [];
    if (size.length !== 3 || size.some((n) => !(n >= 1 && n <= BLUEPRINT_MAX_SIDE))) throw new Error('The plan is too big or has no size');
    if (!Array.isArray(data.p) || typeof data.r !== 'string') throw new Error('The code is damaged: copy it again, whole');
    const palette = data.p.map((type) => (typeof type === 'string' && isPlaceable(type) ? type : null));
    const meta = {};
    if (data.m && typeof data.m === 'object') {
        Object.entries(data.m).forEach(([key, value]) => {
            if (!value || typeof value !== 'object') return;
            const clean = {};
            if (BLUEPRINT_LADDER_TURN[value.f]) clean.f = value.f;
            if (typeof value.t === 'string') clean.t = value.t.slice(0, 288);
            if (typeof value.i === 'string') clean.i = value.i.slice(0, 24);
            if (Number.isInteger(value.o) && value.o >= 0 && value.o <= 7) clean.o = value.o;
            if (Object.keys(clean).length) meta[key] = clean;
        });
    }
    const cells = blueprintUnpack({ size, palette, rle: data.r, meta });
    if (!cells.length) throw new Error('The plan is empty (or uses blocks this world does not have)');
    if (cells.length > BLUEPRINT_MAX_BLOCKS) throw new Error(`The plan has more than ${BLUEPRINT_MAX_BLOCKS} blocks`);
    const name = typeof data.n === 'string' && data.n.trim() ? data.n.trim().slice(0, 40) : 'Imported blueprint';
    return { name, ...blueprintPack(size, cells), skipped: palette.filter((type) => !type).length };
}

// ---------------------------------------------------------------------------------------
// Items

const BLUEPRINT_TAPE_SPRITE = [
    '............',
    '...KKKKKK...',
    '..KYYYYYYK..',
    '.KYYYYYYYYK.',
    '.KYYKKKKYYK.',
    '.KYYKddKYYK.',
    '.KYYKddKYYK.',
    '.KYYKKKKYYKw',
    '.KYYYYYYYYKw',
    '..KYYYYYYKKw',
    '...KKKKKKwwK',
    '..........K.'
];
const BLUEPRINT_EMPTY_SPRITE = [
    '............',
    '.WWWWWWWWWW.',
    '.WBBBBBBBBW.',
    '.WBbBBbBBbW.',
    '.WBBBBBBBBW.',
    '.WBbBBbBBbW.',
    '.WBBBBBBBBW.',
    '.WBbBBbBBbW.',
    '.WBBBBBBBBW.',
    '.WWWWWWWWWW.',
    '..ffff......',
    '............'
];
const BLUEPRINT_WRITTEN_SPRITE = [
    '............',
    '.WWWWWWWWWW.',
    '.WBBBBlBBBW.',
    '.WBBBlBlBBW.',
    '.WBBlBBBlBW.',
    '.WBlllllllW.',
    '.WBlBBBBlBW.',
    '.WBlBllBlBW.',
    '.WBlBllBlBW.',
    '.WWWWWWWWWW.',
    '..ffff......',
    '............'
];

registerItemType('measuring_tape', {
    color: 0xf2c230,
    name: 'Measuring Tape',
    drawIcon: resourcesDrawSprite(BLUEPRINT_TAPE_SPRITE, { K: 0x3a3226, Y: 0xf2c230, d: 0x8a6d1c, w: 0xf4f0e2 }),
    displayMesh: resourcesDisplayMesh
});
registerItemType('blueprint', {
    color: 0x9cc3e8,
    name: 'Blueprint',
    drawIcon: resourcesDrawSprite(BLUEPRINT_EMPTY_SPRITE, { W: 0xe8eef5, B: 0x9cc3e8, b: 0xc2dbf1, f: 0xf2efe6 }),
    displayMesh: resourcesDisplayMesh
});
registerItemType('written_blueprint', {
    color: 0x2f6db5,
    name: 'Written Blueprint',
    drawIcon: resourcesDrawSprite(BLUEPRINT_WRITTEN_SPRITE, { W: 0xe8eef5, B: 0x2f6db5, l: 0xf4f8ff, f: 0xf2efe6 }),
    displayMesh: resourcesDisplayMesh
});

registerGameContent(function ({ addItem, addRecipe }) {
    addRecipe('measuring_tape', 'Craft Measuring Tape', 'measuring_tape', 1, [{ type: 'iron_ore', amount: 1 }, { type: 'planks', amount: 1 }]);
    addRecipe('blueprint', 'Make Blueprints', 'blueprint', 2, [{ type: 'planks', amount: 2 }, { type: 'feather', amount: 1 }]);
    addItem('written_blueprint');
    this.blueprintInstall();
});

registerItemUseHandler(function (item, hit) {
    if (item === 'measuring_tape') return this.blueprintTapeClick(hit);
    if (item === 'blueprint') return this.blueprintRecord();
    if (item === 'written_blueprint') return this.blueprintProjectClick();
    return this.blueprintTryGhostPlace(item, hit);
});

registerModalPanel({
    isOpen() { return Boolean(this.blueprintOpen); },
    close() { this.blueprintClose(); }
});

registerFrameUpdate(function (delta) {
    if (this.blueprintInstalled && this.scene) this.blueprintUpdate(delta);
});

const BLUEPRINT_CSS = `
#blueprint-panel{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(760px,calc(100vw - 28px));max-height:min(86vh,680px);display:none;flex-direction:column;gap:10px;padding:16px;border-radius:14px;border:1px solid rgba(156,195,232,.35);background:rgba(10,22,40,.95);color:#fff;font-family:'Consolas',monospace;z-index:275;box-sizing:border-box;overflow:auto}
#blueprint-panel.visible{display:flex}
#blueprint-panel h3{font-size:16px;margin:0;flex:1}
#blueprint-panel h4{font-size:13px;margin:4px 0 0;color:#9cc3e8}
#blueprint-panel .bp-header{display:flex;align-items:center;gap:12px}
#blueprint-panel .bp-hint{color:#a9bdd5;font-size:11px;line-height:1.4}
#blueprint-panel button{height:28px;padding:0 10px;border-radius:7px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;font:700 12px/1 'Consolas',monospace;cursor:pointer}
#blueprint-panel button:disabled{opacity:.4;cursor:default}
#blueprint-panel button.bp-main{background:rgba(70,140,220,.35);border-color:rgba(156,195,232,.6)}
#blueprint-panel input,#blueprint-panel textarea{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);border-radius:6px;color:#fff;font:12px 'Consolas',monospace;padding:4px 6px;box-sizing:border-box}
#blueprint-panel textarea{width:100%;height:64px;resize:vertical;word-break:break-all}
.bp-list{display:flex;flex-direction:column;gap:6px}
.bp-row{display:flex;gap:8px;align-items:center;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);flex-wrap:wrap}
.bp-row.active{border-color:rgba(156,195,232,.9);box-shadow:0 0 0 2px rgba(156,195,232,.2)}
.bp-row input{flex:1;min-width:120px}
.bp-row .bp-size{font-size:11px;color:#c7d7ec;min-width:150px}
.bp-empty{color:#a9bdd5;font-size:12px}
.bp-materials{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:#c7d7ec}
.bp-materials b{color:#fff}
.bp-materials .short{color:#ffb4b4}
.bp-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.bp-message{font-size:12px;min-height:16px;color:#9fe3b4}
.bp-message.bad{color:#ffb4b4}
#blueprint-hud{position:fixed;left:50%;bottom:118px;transform:translateX(-50%);padding:5px 12px;border-radius:8px;background:rgba(10,22,40,.72);border:1px solid rgba(156,195,232,.35);color:#fff;font:700 13px 'Consolas',monospace;pointer-events:none;z-index:120;display:none;text-align:center;white-space:pre-line}
#blueprint-hud.visible{display:block}
`;

Object.assign(Game.prototype, {
    blueprintInstall() {
        if (this.blueprintInstalled) return;
        this.blueprintInstalled = true;
        this.blueprintOpen = false;
        this.blueprintSelection = { a: null, b: null };
        this.blueprintPreviewTurns = 0;
        this.blueprintBuildQueue = null;
        this.blueprintCache = new Map();
        this.blueprintLoad();
        const style = document.createElement('style');
        style.textContent = BLUEPRINT_CSS;
        document.head.appendChild(style);
        this.blueprintHud = document.createElement('div');
        this.blueprintHud.id = 'blueprint-hud';
        document.body.appendChild(this.blueprintHud);
        this.blueprintBuildPanel();
        // Capture phase: runs before the game's own key handlers.
        window.addEventListener('keydown', (event) => this.blueprintOnKeyDown(event), true);
    },

    // ---- Storage ----

    blueprintLoad() {
        this.blueprintLibrary = [];
        this.blueprintActiveId = null;
        this.blueprintProjection = null;
        try {
            const saved = JSON.parse(window.localStorage.getItem(BLUEPRINT_STORAGE) || 'null');
            if (saved && Array.isArray(saved.plans)) {
                this.blueprintLibrary = saved.plans.filter((plan) => plan && plan.id && Array.isArray(plan.size) && Array.isArray(plan.palette));
                this.blueprintActiveId = saved.active || null;
            }
            const projection = JSON.parse(window.localStorage.getItem(BLUEPRINT_PROJECTION_STORAGE) || 'null');
            if (projection && projection.id && projection.origin) this.blueprintProjection = projection;
        } catch (_error) { /* storage unavailable or corrupt */ }
        if (!this.blueprintPlan(this.blueprintActiveId)) this.blueprintActiveId = null;
        if (this.blueprintProjection && !this.blueprintPlan(this.blueprintProjection.id)) this.blueprintProjection = null;
    },

    blueprintSave() {
        try {
            window.localStorage.setItem(BLUEPRINT_STORAGE, JSON.stringify({ plans: this.blueprintLibrary, active: this.blueprintActiveId }));
            if (this.blueprintProjection) {
                const { id, origin, turns } = this.blueprintProjection;
                window.localStorage.setItem(BLUEPRINT_PROJECTION_STORAGE, JSON.stringify({ id, origin, turns }));
            } else {
                window.localStorage.removeItem(BLUEPRINT_PROJECTION_STORAGE);
            }
        } catch (_error) {
            this.receiveSystemMessage({ text: 'Could not save your blueprints (browser storage is full or blocked)' });
        }
    },

    blueprintPlan(id) {
        return id ? this.blueprintLibrary.find((plan) => plan.id === id) || null : null;
    },

    // The plan's cells turned `turns` quarter turns, cached.
    blueprintCells(plan, turns) {
        const key = `${plan.id}:${turns}:${plan.rle.length}`;
        let entry = this.blueprintCache.get(key);
        if (!entry) {
            entry = blueprintRotate(plan.size, blueprintUnpack(plan), turns);
            this.blueprintCache.set(key, entry);
        }
        return entry;
    },

    blueprintAddPlan(packed, name) {
        if (this.blueprintLibrary.length >= BLUEPRINT_MAX_LIBRARY) {
            throw new Error(`Your library is full (${BLUEPRINT_MAX_LIBRARY} plans): delete one first`);
        }
        const plan = {
            id: `bp${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
            name, size: packed.size, palette: packed.palette, rle: packed.rle, meta: packed.meta,
            count: packed.count, created: Date.now()
        };
        this.blueprintLibrary.push(plan);
        this.blueprintActiveId = plan.id;
        this.blueprintSave();
        return plan;
    },

    blueprintIsPlaceable(type) {
        const def = this.world && this.world.blockTypes[type];
        return Boolean(def) && type !== 'air' && !def.itemOnly && !def.fluid && !def.unbreakable &&
            def.cropStage === undefined && type !== 'water';
    },

    blueprintSizeText(size) {
        return `${size[0]} × ${size[1]} × ${size[2]}`;
    },

    // ---- Measuring tape ----

    blueprintBox() {
        const { a, b } = this.blueprintSelection;
        if (!a || !b) return null;
        const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) };
        const size = [Math.abs(a.x - b.x) + 1, Math.abs(a.y - b.y) + 1, Math.abs(a.z - b.z) + 1];
        return { min, size };
    },

    // The blocks a plan of this box would record, or { error }.
    blueprintScan(box) {
        if (box.size.some((n) => n > BLUEPRINT_MAX_SIDE)) {
            return { error: `Too big: ${this.blueprintSizeText(box.size)} (at most ${BLUEPRINT_MAX_SIDE} per side)` };
        }
        const cells = [];
        for (let y = 0; y < box.size[1]; y++) {
            for (let z = 0; z < box.size[2]; z++) {
                for (let x = 0; x < box.size[0]; x++) {
                    const wx = box.min.x + x;
                    const wy = box.min.y + y;
                    const wz = box.min.z + z;
                    if (!this.world.getColumnAt(wx, wz)) return { error: 'Part of the box is too far away: come closer' };
                    const type = this.world.getBlockTypeAt(wx, wy, wz);
                    if (!type || !this.blueprintIsPlaceable(type)) continue;
                    // A plan has a bed whole or not at all, as a box that cuts one has half of it.
                    if (isBedBlockType(type) && !this.blueprintBedIsWhole(type, { x: wx, y: wy, z: wz }, box)) continue;
                    const cell = { x, y, z, type };
                    if (type === 'ladder') cell.meta = { f: this.world.getLadderFacingAt(wx, wy, wz) };
                    else if (isSignBlockType(type)) cell.meta = { t: this.world.getSignTextAt(wx, wy, wz) };
                    else if (type === 'sound_block') {
                        const state = this.world.getSoundBlockStateAt(wx, wy, wz);
                        cell.meta = { i: state.instrument, o: state.note };
                    }
                    cells.push(cell);
                    if (cells.length > BLUEPRINT_MAX_BLOCKS) {
                        return { error: `Too many blocks (more than ${BLUEPRINT_MAX_BLOCKS}): measure a smaller box` };
                    }
                }
            }
        }
        if (!cells.length) return { error: 'The box is empty: there is nothing to draw' };
        return { cells };
    },

    blueprintBedIsWhole(type, position, box) {
        const def = this.world.blockTypes[type];
        if (def.state.part === 'single') return true;
        const typeAt = (x, y, z) => this.world.getBlockTypeAt(x, y, z);
        const [other] = shapeLinkedCells(type, position, typeAt, this.world.blockTypes);
        return Boolean(other) && other.x >= box.min.x && other.x < box.min.x + box.size[0] &&
            other.z >= box.min.z && other.z < box.min.z + box.size[2];
    },

    blueprintTapeClick(hit) {
        const position = hit && this.world.getBlockPositionFromIntersection(hit);
        if (!position) {
            if (this.blueprintSelection.a) this.receiveSystemMessage({ text: 'Measurement cleared' });
            this.blueprintSelection = { a: null, b: null };
            return true;
        }
        const point = { x: Math.round(position.x), y: Math.round(position.y), z: Math.round(position.z) };
        const selection = this.blueprintSelection;
        if (!selection.a || selection.b) {
            this.blueprintSelection = { a: point, b: null };
            this.receiveSystemMessage({ text: `Corner A set at ${point.x}, ${point.y}, ${point.z}: now right click the opposite corner` });
        } else {
            selection.b = point;
            const box = this.blueprintBox();
            const scan = this.blueprintScan(box);
            this.receiveSystemMessage({
                text: scan.error
                    ? `${this.blueprintSizeText(box.size)}: ${scan.error}`
                    : `Measured ${this.blueprintSizeText(box.size)} (${scan.cells.length} blocks). Right click with a blueprint to draw it`
            });
        }
        this.playTone({ frequency: selection.b ? 880 : 660, duration: 0.05, type: 'square', volume: 0.012, release: 0.05 });
        this.placeActionTimer = 0.25;
        return true;
    },

    // ---- Drawing a plan ----

    blueprintRecord() {
        const box = this.blueprintBox();
        if (!box) {
            this.receiveSystemMessage({ text: 'Measure a box first: right click two opposite corners with a measuring tape' });
            return true;
        }
        const scan = this.blueprintScan(box);
        if (scan.error) {
            this.receiveSystemMessage({ text: scan.error });
            return true;
        }
        let plan;
        try {
            plan = this.blueprintAddPlan(blueprintPack(box.size, scan.cells), `Blueprint ${this.blueprintLibrary.length + 1}`);
        } catch (error) {
            this.receiveSystemMessage({ text: error.message });
            return true;
        }
        this.consumeSelectedBlock();
        this.addInventory('written_blueprint');
        this.blueprintSelection = { a: null, b: null };
        this.receiveSystemMessage({ text: `Drawn "${plan.name}": ${this.blueprintSizeText(plan.size)}, ${plan.count} blocks. Hold the written blueprint to project it, L for your library` });
        [523, 659, 784].forEach((frequency, i) => setTimeout(() => this.playTone({ frequency, duration: 0.08, type: 'triangle', volume: 0.016, release: 0.1 }), i * 90));
        this.placeActionTimer = 0.35;
        if (this.blueprintOpen) this.blueprintRender();
        return true;
    },

    // ---- Projecting ----

    // Where the following ghost would go: its corner, with the plan centred on the aimed cell.
    blueprintPreviewOrigin(plan) {
        const hit = this.raycastBlock(this.placeDistance + 6);
        if (!hit || !hit.face) return null;
        const block = this.world.getBlockPositionFromIntersection(hit);
        if (!block) return null;
        const normal = hit.face.normal;
        const { size } = this.blueprintCells(plan, this.blueprintPreviewTurns);
        return {
            x: Math.round(block.x + normal.x) - Math.floor(size[0] / 2),
            y: Math.round(block.y + normal.y),
            z: Math.round(block.z + normal.z) - Math.floor(size[2] / 2)
        };
    },

    blueprintProjectClick() {
        if (this.blueprintProjection) {
            this.blueprintProjection = null;
            this.blueprintStatus = null;
            this.blueprintBuildQueue = null;
            this.blueprintSave();
            this.receiveSystemMessage({ text: 'Projection lifted: aim and right click to anchor it again' });
            this.placeActionTimer = 0.25;
            return true;
        }
        const plan = this.blueprintPlan(this.blueprintActiveId);
        if (!plan) {
            this.blueprintShow();
            return true;
        }
        const origin = this.blueprintPreviewOrigin(plan);
        if (!origin) {
            this.receiveSystemMessage({ text: 'Aim at the ground where the plan should go' });
            return true;
        }
        this.blueprintProjection = { id: plan.id, origin, turns: this.blueprintPreviewTurns };
        this.blueprintStatusKey = null;
        this.blueprintSave();
        this.blueprintRefreshStatus(true);
        this.receiveSystemMessage({ text: `"${plan.name}" anchored: place the blocks the ghost shows (L lists the materials)` });
        this.playTone({ frequency: 392, duration: 0.08, type: 'triangle', volume: 0.018, release: 0.12 });
        this.placeActionTimer = 0.35;
        return true;
    },

    blueprintRotatePreview() {
        this.blueprintPreviewTurns = (this.blueprintPreviewTurns + 1) % 4;
        this.playTone({ frequency: 740, duration: 0.03, type: 'square', volume: 0.01, release: 0.04 });
    },

    // Every cell of the anchored projection with its state: 'done', 'missing' or 'blocked'.
    blueprintProjectionCells() {
        const projection = this.blueprintProjection;
        const plan = projection && this.blueprintPlan(projection.id);
        if (!plan) return null;
        const { size, cells } = this.blueprintCells(plan, projection.turns);
        const { x: ox, y: oy, z: oz } = projection.origin;
        return {
            plan, size,
            cells: cells.map((cell) => {
                const x = ox + cell.x;
                const y = oy + cell.y;
                const z = oz + cell.z;
                const current = this.world.getBlockTypeAt(x, y, z);
                const state = current === cell.type ? 'done' : (!current || current === 'water') ? 'missing' : 'blocked';
                return { ...cell, wx: x, wy: y, wz: z, state };
            })
        };
    },

    blueprintRefreshStatus(force = false) {
        const status = this.blueprintProjectionCells();
        this.blueprintStatus = status;
        if (!status) return;
        const key = status.cells.map((cell) => cell.state.charAt(0)).join('');
        if (!force && key === this.blueprintStatusKey) return;
        const firstLook = this.blueprintStatusKey === null || this.blueprintStatusKey === undefined;
        this.blueprintStatusKey = key;
        const done = status.cells.filter((cell) => cell.state === 'done').length;
        this.blueprintSetGhost('anchored', this.blueprintGhostGeometry(status.cells.filter((cell) => cell.state !== 'done')), status.plan.id);
        if (this.blueprintOpen) this.blueprintRenderMaterials();
        if (done === status.cells.length && !firstLook) {
            this.receiveSystemMessage({ text: `"${status.plan.name}" is finished: ${done} / ${done} blocks!` });
            [523, 659, 784, 1046].forEach((frequency, i) => setTimeout(() => this.playTone({ frequency, duration: 0.12, type: 'sine', volume: 0.02, release: 0.2 }), i * 110));
            this.blueprintProjection = null;
            this.blueprintBuildQueue = null;
            this.blueprintStatus = null;
            this.blueprintSave();
        }
    },

    // Right click with a block in hand: if the first ghost cell along the view, before the aimed
    // block, wants exactly that block, it goes there (the normal placing path).
    blueprintTryGhostPlace(item, hit) {
        const status = this.blueprintProjection ? this.blueprintStatus : null;
        if (!status || !item || !this.blueprintIsPlaceable(item)) return false;
        const wanted = new Map();
        status.cells.forEach((cell) => { if (cell.state === 'missing') wanted.set(`${cell.wx},${cell.wy},${cell.wz}`, cell); });
        if (!wanted.size) return false;
        const ray = this.getInteractionRay();
        const point = new THREE.Vector3();
        const maxT = Math.min(hit ? hit.distance : Infinity, this.placeDistance + ray.origin.distanceTo(ray.reachOrigin));
        for (let t = 0.3; t <= maxT; t += 0.05) {
            point.copy(ray.direction).multiplyScalar(t).add(ray.origin);
            if (point.distanceTo(ray.reachOrigin) > this.placeDistance + 0.05) continue;
            const cell = wanted.get(`${Math.floor(point.x)},${Math.floor(point.y)},${Math.floor(point.z)}`);
            if (!cell) continue;
            // A piece's state comes with the plan; what the player holds is the piece.
            if ((this.world.blockTypes[cell.type].variantOf || cell.type) !== item) return false;
            if (!this.blueprintPlaceCell(cell, true)) return false;
            this.blueprintRefreshStatus();
            return true;
        }
        return false;
    },

    // Places one cell like a player would; consume: take it from the held stack.
    blueprintPlaceCell(cell, consume) {
        const current = this.world.getBlockTypeAt(cell.wx, cell.wy, cell.wz);
        if (current && current !== 'water') return false;
        const id = this.world.registry.id(cell.type);
        const height = this.world.registry.height[id];
        if (height > 0 && this.cameraController.intersectsBody(this.getLocalPlayerPosition(), cell.wx, cell.wy, cell.wz, height)) return false;
        // Half a bed brings the other half, for one bed from the stack, or does not go at all.
        const otherHalf = blueprintOtherBedHalf(cell, this.world.blockTypes);
        if (otherHalf) {
            const there = this.world.getBlockTypeAt(otherHalf.x, otherHalf.y, otherHalf.z);
            if ((there && there !== 'water') || this.cameraController.intersectsBody(this.getLocalPlayerPosition(), otherHalf.x, otherHalf.y, otherHalf.z, height)) return false;
        }
        const payload = { x: cell.wx, y: cell.wy, z: cell.wz, blockType: cell.type };
        const meta = cell.meta || {};
        if (cell.type === 'ladder') payload.facing = meta.f || 'pz';
        else if (isSignBlockType(cell.type)) {
            payload.text = meta.t || (consume ? this.promptSignText() : '');
            if (!payload.text) return false;
        } else if (cell.type === 'sound_block') {
            payload.instrument = meta.i || 'bell';
            payload.note = Number.isInteger(meta.o) ? meta.o : 0;
        }
        if (consume && this.getInventoryCount(this.world.blockTypes[cell.type].variantOf || cell.type) <= 0) return false;
        if (!this.placeBlockForAll(payload)) return false;
        if (consume) this.consumeSelectedBlock();
        if (otherHalf) this.placeBlockForAll(otherHalf);
        this.playPlaceSound(cell.type);
        if (consume) {
            this.placeActionTimer = 0.35;
            this.showHitIndicator();
        }
        this.lastSelectionUpdate = 0;
        return true;
    },

    // Creative mode: the missing blocks, bottom up, BLUEPRINT_BUILD_RATE per second.
    blueprintBuildAll() {
        if (!this.creativeMode) return;
        const status = this.blueprintProjectionCells();
        if (!status) return;
        this.blueprintBuildQueue = status.cells.filter((cell) => cell.state === 'missing').sort((a, b) => a.wy - b.wy);
        this.blueprintBuildTimer = 0;
        this.blueprintClose();
        this.receiveSystemMessage({ text: `Building ${this.blueprintBuildQueue.length} blocks...` });
    },

    blueprintStepBuild(delta) {
        if (!this.blueprintBuildQueue) return;
        if (!this.creativeMode || !this.blueprintProjection) {
            this.blueprintBuildQueue = null;
            return;
        }
        this.blueprintBuildTimer += delta * BLUEPRINT_BUILD_RATE;
        while (this.blueprintBuildTimer >= 1 && this.blueprintBuildQueue.length) {
            this.blueprintBuildTimer -= 1;
            this.blueprintPlaceCell(this.blueprintBuildQueue.shift(), false);
        }
        if (!this.blueprintBuildQueue.length) this.blueprintBuildQueue = null;
    },

    // ---- Ghost meshes ----

    // One merged mesh: a cube per cell, without the faces between two neighbouring cells. Blocked
    // cells are drawn slightly larger and red, around the block in the way.
    blueprintGhostGeometry(cells) {
        const occupied = new Set(cells.filter((cell) => cell.state !== 'blocked').map((cell) => `${cell.x},${cell.y},${cell.z}`));
        const positions = [];
        const colors = [];
        const color = new THREE.Color();
        const faces = [
            { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
            { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
            { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
            { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
            { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
            { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }
        ];
        cells.forEach((cell) => {
            const blocked = cell.state === 'blocked';
            const grow = blocked ? 0.04 : 0;
            color.setHex(blocked ? 0xff3b30 : this.world.getBlockColorForType(cell.type));
            faces.forEach(({ n, c }) => {
                if (!blocked && occupied.has(`${cell.x + n[0]},${cell.y + n[1]},${cell.z + n[2]}`)) return;
                const shade = n[1] > 0 ? 1.15 : n[1] < 0 ? 0.7 : n[0] !== 0 ? 0.9 : 1;
                [0, 1, 2, 0, 2, 3].forEach((k) => {
                    const corner = c[k];
                    positions.push(
                        cell.x + corner[0] * (1 + 2 * grow) - grow,
                        cell.y + corner[1] * (1 + 2 * grow) - grow,
                        cell.z + corner[2] * (1 + 2 * grow) - grow
                    );
                    colors.push(Math.min(1, color.r * shade), Math.min(1, color.g * shade), Math.min(1, color.b * shade));
                });
            });
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        return geometry;
    },

    blueprintEnsureVisuals() {
        if (this.blueprintVisuals) return this.blueprintVisuals;
        const makeGhost = (opacity) => {
            const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
                vertexColors: true, transparent: true, opacity, depthWrite: false
            }));
            mesh.renderOrder = 5;
            mesh.frustumCulled = false;
            mesh.visible = false;
            this.scene.add(mesh);
            return mesh;
        };
        const makeOutline = (color) => {
            const lines = new THREE.LineSegments(
                new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
                new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false })
            );
            lines.renderOrder = 6;
            lines.visible = false;
            this.scene.add(lines);
            return lines;
        };
        const makeLabel = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 64;
            const texture = new THREE.CanvasTexture(canvas);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
            sprite.scale.set(2.4, 0.6, 1);
            sprite.renderOrder = 7;
            sprite.visible = false;
            sprite.userData = { canvas, texture, text: '' };
            this.scene.add(sprite);
            return sprite;
        };
        this.blueprintVisuals = {
            preview: makeGhost(0.28), anchored: makeGhost(0.42),
            selection: makeOutline(0xffd54a), ghostBox: makeOutline(0x9cc3e8),
            label: makeLabel(), ghostKeys: {}
        };
        return this.blueprintVisuals;
    },

    blueprintSetGhost(which, geometry, key) {
        const visuals = this.blueprintEnsureVisuals();
        const mesh = visuals[which];
        mesh.geometry.dispose();
        mesh.geometry = geometry;
        visuals.ghostKeys[which] = key;
    },

    blueprintShowOutline(lines, min, size, label, color) {
        lines.scale.set(size[0] + 0.04, size[1] + 0.04, size[2] + 0.04);
        lines.position.set(min.x + size[0] / 2, min.y + size[1] / 2, min.z + size[2] / 2);
        if (color !== undefined) lines.material.color.setHex(color);
        lines.visible = true;
        if (label) {
            const sprite = this.blueprintVisuals.label;
            this.blueprintSetLabel(label);
            sprite.position.set(min.x + size[0] / 2, min.y + size[1] + 0.6, min.z + size[2] / 2);
            sprite.visible = true;
        }
    },

    blueprintSetLabel(text) {
        const sprite = this.blueprintVisuals.label;
        if (sprite.userData.text === text) return;
        sprite.userData.text = text;
        const { canvas, texture } = sprite.userData;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = "bold 34px 'Consolas', monospace";
        const width = Math.min(canvas.width - 4, ctx.measureText(text).width + 28);
        ctx.fillStyle = 'rgba(10, 22, 40, 0.78)';
        ctx.fillRect((canvas.width - width) / 2, 6, width, 52);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, 33, canvas.width - 10);
        texture.needsUpdate = true;
    },

    blueprintSetHud(text) {
        if (!this.blueprintHud) return;
        if (this.blueprintHud.textContent !== text) this.blueprintHud.textContent = text;
        this.blueprintHud.classList.toggle('visible', Boolean(text));
    },

    // ---- Every frame ----

    blueprintUpdate(delta) {
        const visuals = this.blueprintEnsureVisuals();
        this.blueprintStepBuild(delta);
        const held = this.getSelectedHeldItemType();
        const playing = this.isGameplayActive();
        visuals.preview.visible = false;
        visuals.selection.visible = false;
        visuals.ghostBox.visible = false;
        visuals.label.visible = false;
        const hud = [];

        // The measured box (or, with only corner A, the box up to the aimed block).
        const selection = this.blueprintSelection;
        if (selection.a && (held === 'measuring_tape' || held === 'blueprint')) {
            let b = selection.b;
            if (!b && playing) {
                const hit = this.raycastBlock(this.breakDistance + 8);
                const position = hit && this.world.getBlockPositionFromIntersection(hit);
                if (position) b = { x: Math.round(position.x), y: Math.round(position.y), z: Math.round(position.z) };
            }
            b = b || selection.a;
            const a = selection.a;
            const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) };
            const size = [Math.abs(a.x - b.x) + 1, Math.abs(a.y - b.y) + 1, Math.abs(a.z - b.z) + 1];
            const tooBig = size.some((n) => n > BLUEPRINT_MAX_SIDE);
            this.blueprintShowOutline(visuals.selection, min, size, this.blueprintSizeText(size), tooBig ? 0xff5a4a : 0xffd54a);
            hud.push(selection.b ? (held === 'blueprint' ? 'Right click to draw this box' : 'Box measured') : 'Right click the opposite corner');
        } else if (held === 'measuring_tape') {
            hud.push('Measuring tape: right click corner A');
        }

        // Status of the anchored projection, four times a second.
        this.blueprintStatusTimer = (this.blueprintStatusTimer || 0) - delta;
        if (this.blueprintProjection && this.blueprintStatusTimer <= 0) {
            this.blueprintStatusTimer = 0.25;
            this.blueprintRefreshStatus();
        }
        const status = this.blueprintProjection ? this.blueprintStatus : null;
        visuals.anchored.visible = Boolean(status);
        if (status) {
            const { x, y, z } = this.blueprintProjection.origin;
            visuals.anchored.position.set(x, y, z);
            const done = status.cells.filter((cell) => cell.state === 'done').length;
            const blocked = status.cells.filter((cell) => cell.state === 'blocked').length;
            hud.push(`${status.plan.name}: ${done} / ${status.cells.length} blocks${blocked ? ` (${blocked} in the way)` : ''}${this.blueprintBuildQueue ? ' (building...)' : ''}`);
            if (held === 'written_blueprint') {
                this.blueprintShowOutline(visuals.ghostBox, this.blueprintProjection.origin, status.size, this.blueprintSizeText(status.size));
                hud.push('Right click to lift the projection');
            }
        } else if (held === 'written_blueprint' && playing) {
            // The following ghost.
            const plan = this.blueprintPlan(this.blueprintActiveId);
            if (!plan) {
                hud.push('No active plan: press L to open your library');
            } else {
                const turns = this.blueprintPreviewTurns;
                const { size, cells } = this.blueprintCells(plan, turns);
                const key = `${plan.id}:${turns}`;
                if (visuals.ghostKeys.preview !== key) this.blueprintSetGhost('preview', this.blueprintGhostGeometry(cells), key);
                const origin = this.blueprintPreviewOrigin(plan);
                if (origin) {
                    visuals.preview.position.set(origin.x, origin.y, origin.z);
                    visuals.preview.visible = true;
                    this.blueprintShowOutline(visuals.ghostBox, origin, size, this.blueprintSizeText(size));
                }
                hud.push(`${plan.name} (${plan.count} blocks): right click to anchor, T to rotate`);
            }
        }
        this.blueprintSetHud(playing ? hud.join('\n') : '');
    },

    // ---- Keys ----

    blueprintOnKeyDown(event) {
        const target = event.target;
        const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (this.blueprintOpen) {
            if (event.code === 'Escape' && !event.repeat) {
                this.blueprintClose();
                event.preventDefault();
            } else if (event.code === BLUEPRINT_LIBRARY_KEY && !typing && !event.repeat) {
                this.blueprintClose();
                event.preventDefault();
            } else if (!typing) {
                event.preventDefault();
            }
            // Nothing reaches the game while the library is open (typing still works).
            event.stopImmediatePropagation();
            return;
        }
        if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || typing) return;
        if (event.code !== BLUEPRINT_LIBRARY_KEY && event.code !== BLUEPRINT_ROTATE_KEY) return;
        if (!this.isGameplayActive() || this.photoMode) return;
        if (event.code === BLUEPRINT_ROTATE_KEY) {
            if (this.getSelectedHeldItemType() !== 'written_blueprint' || this.blueprintProjection) return;
            this.blueprintRotatePreview();
        } else {
            this.blueprintShow();
        }
        event.preventDefault();
        event.stopImmediatePropagation();
    },

    // ---- Library panel ----

    blueprintBuildPanel() {
        const panel = document.createElement('div');
        panel.id = 'blueprint-panel';
        panel.innerHTML = `
            <div class="bp-header">
                <h3>Blueprint library</h3>
                <button class="bp-close" type="button">Close</button>
            </div>
            <div class="bp-hint">Measure with a measuring tape, draw with an empty blueprint, then hold the written blueprint to
                project the active plan (T rotates, right click anchors). Share a plan by sending its code.</div>
            <div class="bp-message"></div>
            <h4>Projection</h4>
            <div class="bp-projection"></div>
            <h4>Plans</h4>
            <div class="bp-list"></div>
            <h4>Share</h4>
            <textarea class="bp-code" spellcheck="false" placeholder="Paste a blueprint code (MCBP1:...) here and press Import, or press Export on a plan"></textarea>
            <div class="bp-actions">
                <button class="bp-import bp-main" type="button">Import code</button>
                <button class="bp-copy" type="button">Copy code</button>
                <span class="bp-hint">Importing copies the plan onto an empty blueprint.</span>
            </div>`;
        panel.querySelector('.bp-close').addEventListener('click', () => this.blueprintClose());
        panel.querySelector('.bp-import').addEventListener('click', () => this.blueprintImport());
        panel.querySelector('.bp-copy').addEventListener('click', () => this.blueprintCopyCode());
        // Clicks inside the panel must not reach the game (which would try to grab the pointer).
        panel.addEventListener('mousedown', (event) => event.stopPropagation());
        panel.addEventListener('pointerdown', (event) => event.stopPropagation());
        document.body.appendChild(panel);
        this.blueprintPanel = panel;
        document.addEventListener('mousedown', () => {
            if (this.blueprintOpen && performance.now() - this.blueprintOpenedAt > 250) this.blueprintClose();
        });
    },

    blueprintShow() {
        if (this.blueprintOpen) return;
        this.blueprintOpen = true;
        this.blueprintOpenedAt = performance.now();
        this.stopMining();
        this.closeChatInput();
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.blueprintMessage('');
        this.blueprintPanel.classList.add('visible');
        this.blueprintRender();
        this.updatePointerLockHint();
        this.playTone({ frequency: 480, duration: 0.05, type: 'triangle', volume: 0.018, release: 0.06 });
    },

    blueprintClose() {
        if (!this.blueprintOpen) return;
        this.blueprintOpen = false;
        this.blueprintPanel.classList.remove('visible');
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        this.recapturePointerLock();
        this.updatePointerLockHint();
    },

    blueprintMessage(text, bad = false) {
        const message = this.blueprintPanel.querySelector('.bp-message');
        message.textContent = text;
        message.classList.toggle('bad', bad);
    },

    blueprintRender() {
        const list = this.blueprintPanel.querySelector('.bp-list');
        list.innerHTML = '';
        if (!this.blueprintLibrary.length) {
            const empty = document.createElement('div');
            empty.className = 'bp-empty';
            empty.textContent = 'No plans yet. Craft a measuring tape and blueprints (C), measure a building and draw it.';
            list.appendChild(empty);
        }
        this.blueprintLibrary.forEach((plan) => {
            const row = document.createElement('div');
            row.className = 'bp-row' + (plan.id === this.blueprintActiveId ? ' active' : '');
            const name = document.createElement('input');
            name.type = 'text';
            name.maxLength = 40;
            name.value = plan.name;
            name.addEventListener('change', () => {
                plan.name = name.value.trim().slice(0, 40) || plan.name;
                name.value = plan.name;
                this.blueprintSave();
            });
            const info = document.createElement('span');
            info.className = 'bp-size';
            info.textContent = `${this.blueprintSizeText(plan.size)} · ${plan.count} blocks · ${plan.palette.length} kinds`;
            const button = (label, action, main = false) => {
                const element = document.createElement('button');
                element.type = 'button';
                element.textContent = label;
                if (main) element.className = 'bp-main';
                element.addEventListener('click', action);
                return element;
            };
            const active = plan.id === this.blueprintActiveId;
            const select = button(active ? 'Active' : 'Use', () => {
                this.blueprintActiveId = plan.id;
                this.blueprintSave();
                this.blueprintRender();
                this.blueprintMessage(`"${plan.name}" is the active plan: hold the written blueprint to project it.`);
            }, !active);
            select.disabled = active;
            row.append(name, info, select,
                button('Export', () => {
                    this.blueprintPanel.querySelector('.bp-code').value = blueprintEncodeCode(plan);
                    this.blueprintMessage(`Code of "${plan.name}" below: copy it and send it to a friend.`);
                }),
                button('Delete', () => {
                    if (!window.confirm(`Delete the plan "${plan.name}"?`)) return;
                    this.blueprintLibrary = this.blueprintLibrary.filter((other) => other !== plan);
                    if (this.blueprintActiveId === plan.id) this.blueprintActiveId = null;
                    if (this.blueprintProjection && this.blueprintProjection.id === plan.id) {
                        this.blueprintProjection = null;
                        this.blueprintStatus = null;
                        this.blueprintBuildQueue = null;
                    }
                    this.blueprintSave();
                    this.blueprintRender();
                }));
            list.appendChild(row);
        });
        this.blueprintRenderMaterials();
    },

    // The anchored projection: progress, what it still needs against what you carry, and buttons.
    blueprintRenderMaterials() {
        const box = this.blueprintPanel.querySelector('.bp-projection');
        box.innerHTML = '';
        const status = this.blueprintProjection ? this.blueprintProjectionCells() : null;
        if (!status) {
            box.innerHTML = '<div class="bp-empty">Nothing anchored. Hold a written blueprint and right click the ground.</div>';
            return;
        }
        const missing = {};
        let done = 0;
        status.cells.forEach((cell) => {
            if (cell.state === 'done') {
                done++;
                return;
            }
            // Two halves of a bed are one bed, and it is the item that counts.
            const def = this.world.blockTypes[cell.type];
            if (isBedBlockType(cell.type) && def.state.part === 'head') return;
            const item = isBedBlockType(cell.type) ? 'bed' : cell.type;
            missing[item] = (missing[item] || 0) + 1;
        });
        const head = document.createElement('div');
        head.className = 'bp-hint';
        head.textContent = `${status.plan.name}: ${done} / ${status.cells.length} blocks placed. Still needed:`;
        const materials = document.createElement('div');
        materials.className = 'bp-materials';
        Object.entries(missing).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
            const have = this.getInventoryCount(type);
            const item = document.createElement('span');
            item.className = have < count ? 'short' : '';
            item.innerHTML = `<b>${count}</b> ${this.getBlockDisplayName(type)} (you have ${have})`;
            materials.appendChild(item);
        });
        const actions = document.createElement('div');
        actions.className = 'bp-actions';
        const lift = document.createElement('button');
        lift.type = 'button';
        lift.textContent = 'Lift projection';
        lift.addEventListener('click', () => {
            this.blueprintProjection = null;
            this.blueprintStatus = null;
            this.blueprintBuildQueue = null;
            this.blueprintSave();
            this.blueprintRender();
        });
        actions.appendChild(lift);
        if (this.creativeMode) {
            const build = document.createElement('button');
            build.type = 'button';
            build.className = 'bp-main';
            build.textContent = `Build all (${BLUEPRINT_BUILD_RATE} blocks/s)`;
            build.addEventListener('click', () => this.blueprintBuildAll());
            actions.appendChild(build);
        }
        box.append(head, materials, actions);
    },

    blueprintImport() {
        const field = this.blueprintPanel.querySelector('.bp-code');
        let packed;
        try {
            packed = blueprintDecodeCode(field.value, (type) => this.blueprintIsPlaceable(type));
        } catch (error) {
            this.blueprintMessage(error.message, true);
            return;
        }
        if (!this.creativeMode && this.getInventoryCount('blueprint') <= 0) {
            this.blueprintMessage('You need an empty blueprint to copy the plan onto (C: Make Blueprints).', true);
            return;
        }
        let plan;
        try {
            plan = this.blueprintAddPlan(packed, packed.name);
        } catch (error) {
            this.blueprintMessage(error.message, true);
            return;
        }
        if (!this.creativeMode) {
            this.inventoryCounts.blueprint -= 1;
            this.updateHotbarCounts();
        }
        this.addInventory('written_blueprint');
        field.value = '';
        const skipped = packed.skipped ? ` (${packed.skipped} kinds of block unknown here were left out)` : '';
        this.blueprintMessage(`Imported "${plan.name}": ${this.blueprintSizeText(plan.size)}, ${plan.count} blocks${skipped}. It is now the active plan.`);
        this.blueprintRender();
    },

    blueprintCopyCode() {
        const field = this.blueprintPanel.querySelector('.bp-code');
        if (!field.value) {
            this.blueprintMessage('Press Export on a plan first.', true);
            return;
        }
        field.select();
        const done = () => this.blueprintMessage('Code copied to the clipboard.');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(field.value).then(done, () => {
                document.execCommand('copy');
                done();
            });
        } else {
            document.execCommand('copy');
            done();
        }
    }
});
