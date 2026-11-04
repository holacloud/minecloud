// Programmable robot: a small boxy rover with treads, a screen face and an antenna light, that
// the player programs with visual blocks.
// - Craft a `robot` (3 iron_ore + 1 copper_block + 1 glass + 1 element_si, the silicon chip of
//   its brain) and right click the top of a block to set it down, facing away from you. Up to
//   ROBOT_LIMIT robots per player. Hit it to pick it up: it comes back as an item, with whatever
//   it carried, and its program is remembered for the next robot you set down.
// - Right click it to open the programming panel (a modal panel): a palette of instruction
//   blocks (click to append, or drag them) and the program area, where blocks nest inside
//   repeat / while / if-else. Run, Step and Stop; the current instruction lights up while it
//   runs, at 2-4 actions per second. Errors are friendly ("I can't dig Bedrock") and stop it.
// - Instructions: forward, back, turn left/right, up, down, dig ahead/up/down, place a block
//   ahead/up/down (from its own inventory), repeat N, while, if/else, wait, say.
//   Conditions: the block ahead / above / below is air, solid or a given block; my inventory is
//   full / empty / has a block; always. Any of them can be negated ("not").
// - Movement is on the block grid with no gravity while it runs, but it never floats more than
//   ROBOT_MAX_FLOAT empty blocks above the ground or water (from right on the ground it may
//   step one block out over a gap, to build bridges); when it stops it lands. It never moves or
//   places a block into the player, never digs unbreakable blocks, and stops when the player
//   is more than ROBOT_MAX_DISTANCE blocks away or the chunk it needs is not loaded.
// - Digging and placing go through the normal multiplayer path (world.removeBlockAt / addBlock
//   + blockBreak / blockPlace), so everyone sees the changes; the drops go into its 9-stack
//   inventory (shown in the panel, with Take all / Give). The robot itself is client-side, kept
//   in localStorage with its program and inventory: other players do not see it.
// ROBOT_LOGIC (the program model and the interpreter) is plain JS with no THREE or DOM, so
// Node can test it (module.exports at the end).
// Mixed into Game.prototype; hooked through js/extensions.js.

const ROBOT_LIMIT = 3;
const ROBOT_SLOTS = 9;
const ROBOT_STACK = 64;
const ROBOT_MAX_FLOAT = 3;
const ROBOT_MAX_DISTANCE = 64;
const ROBOT_MAX_NODES = 200;
const ROBOT_MAX_DEPTH = 6;
const ROBOT_STORAGE_KEY = 'minecloud-robots';
const ROBOT_LAST_PROGRAM_KEY = 'minecloud-robot-last-program';
const ROBOT_SPEEDS = { slow: 0.5, normal: 0.33, fast: 0.25 }; // seconds per action
const ROBOT_CONTROL_TIME = 0.1; // seconds a repeat / if / while check takes
// Facing 0..3, turning right each time: +z, -x, -z, +x.
const ROBOT_DIRS = [[0, 1], [-1, 0], [0, -1], [1, 0]];
const ROBOT_NOT_PLACEABLE = ['sign', 'bed', 'sound_block', 'ladder', 'spray_paint', 'water', 'air'];
const ROBOT_REPLACEABLE = ['tall_grass', 'flower_red', 'flower_yellow', 'mushroom_red', 'mushroom_brown', 'water'];

const ROBOT_INSTRUCTIONS = {
    forward: { label: 'Move forward', category: 'move' },
    back: { label: 'Move back', category: 'move' },
    turnLeft: { label: 'Turn left', category: 'move' },
    turnRight: { label: 'Turn right', category: 'move' },
    up: { label: 'Move up', category: 'move' },
    down: { label: 'Move down', category: 'move' },
    digAhead: { label: 'Dig ahead', category: 'dig' },
    digUp: { label: 'Dig up', category: 'dig' },
    digDown: { label: 'Dig down', category: 'dig' },
    placeAhead: { label: 'Place ahead', category: 'build', params: { block: '' } },
    placeUp: { label: 'Place up', category: 'build', params: { block: '' } },
    placeDown: { label: 'Place down', category: 'build', params: { block: '' } },
    repeat: { label: 'Repeat', category: 'control', params: { times: 4 }, lists: ['body'] },
    while: { label: 'While', category: 'control', params: { cond: null }, lists: ['body'] },
    if: { label: 'If', category: 'control', params: { cond: null }, lists: ['body', 'else'] },
    wait: { label: 'Wait', category: 'other', params: { seconds: 1 } },
    say: { label: 'Say', category: 'other', params: { text: 'Hello!' } }
};

// Conditions: what they look at and whether they need a block type.
const ROBOT_CONDITIONS = {
    ahead_air: { label: 'block ahead is air' },
    ahead_solid: { label: 'block ahead is solid' },
    ahead_is: { label: 'block ahead is', block: true },
    above_air: { label: 'block above is air' },
    above_solid: { label: 'block above is solid' },
    above_is: { label: 'block above is', block: true },
    below_air: { label: 'block below is air' },
    below_solid: { label: 'block below is solid' },
    below_is: { label: 'block below is', block: true },
    inv_full: { label: 'my inventory is full' },
    inv_empty: { label: 'my inventory is empty' },
    inv_has: { label: 'I have', block: true },
    always: { label: 'always' }
};

const ROBOT_LOGIC = {
    nextId: 0,

    newId() {
        ROBOT_LOGIC.nextId += 1;
        return `r${ROBOT_LOGIC.nextId}`;
    },

    defaultCond() {
        return { test: 'ahead_solid', block: 'stone', not: false };
    },

    // A fresh instruction with its default parameters and empty lists.
    newNode(op) {
        const spec = ROBOT_INSTRUCTIONS[op];
        if (!spec) return null;
        const node = { id: ROBOT_LOGIC.newId(), op };
        Object.entries(spec.params || {}).forEach(([key, value]) => {
            node[key] = key === 'cond' ? ROBOT_LOGIC.defaultCond() : value;
        });
        (spec.lists || []).forEach((list) => { node[list] = []; });
        return node;
    },

    clamp(value, min, max, fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, number));
    },

    cleanBlock(value) {
        return typeof value === 'string' && /^[a-z0-9_]{0,40}$/.test(value) ? value : '';
    },

    cleanCond(cond) {
        const source = cond && typeof cond === 'object' ? cond : {};
        const test = ROBOT_CONDITIONS[source.test] ? source.test : 'ahead_solid';
        return { test, block: ROBOT_LOGIC.cleanBlock(source.block) || 'stone', not: Boolean(source.not) };
    },

    // Whatever comes from storage becomes a valid program: unknown blocks are dropped, numbers
    // clamped, ids renewed, and size and depth limited.
    normalize(program, depth = 0, budget = { left: ROBOT_MAX_NODES }) {
        if (!Array.isArray(program)) return [];
        const out = [];
        for (const raw of program) {
            if (budget.left <= 0) break;
            if (!raw || !ROBOT_INSTRUCTIONS[raw.op]) continue;
            const spec = ROBOT_INSTRUCTIONS[raw.op];
            if (spec.lists && depth >= ROBOT_MAX_DEPTH) continue;
            budget.left -= 1;
            const node = ROBOT_LOGIC.newNode(raw.op);
            if ('block' in node) node.block = ROBOT_LOGIC.cleanBlock(raw.block);
            if ('times' in node) node.times = Math.round(ROBOT_LOGIC.clamp(raw.times, 1, 99, 4));
            if ('seconds' in node) node.seconds = Math.round(ROBOT_LOGIC.clamp(raw.seconds, 0.5, 10, 1) * 2) / 2;
            if ('text' in node) node.text = typeof raw.text === 'string' ? raw.text.slice(0, 40) : '';
            if ('cond' in node) node.cond = ROBOT_LOGIC.cleanCond(raw.cond);
            (spec.lists || []).forEach((list) => { node[list] = ROBOT_LOGIC.normalize(raw[list], depth + 1, budget); });
            out.push(node);
        }
        return out;
    },

    // Plain data for storage (ids are renewed on load).
    serialize(program) {
        return program.map((node) => {
            const copy = { ...node };
            delete copy.id;
            (ROBOT_INSTRUCTIONS[node.op].lists || []).forEach((list) => { copy[list] = ROBOT_LOGIC.serialize(node[list]); });
            return copy;
        });
    },

    countNodes(program) {
        return program.reduce((sum, node) => sum + 1 + (ROBOT_INSTRUCTIONS[node.op].lists || [])
            .reduce((inner, list) => inner + ROBOT_LOGIC.countNodes(node[list]), 0), 0);
    },

    // How deep the containers go inside a node (0 for a plain instruction).
    nodeDepth(node) {
        const lists = ROBOT_INSTRUCTIONS[node.op].lists || [];
        if (lists.length === 0) return 0;
        let deepest = 0;
        lists.forEach((list) => node[list].forEach((child) => { deepest = Math.max(deepest, ROBOT_LOGIC.nodeDepth(child)); }));
        return 1 + deepest;
    },

    // { node, list, index, depth } for an id, or null. depth counts the containers around it.
    find(program, id, depth = 0) {
        for (let index = 0; index < program.length; index++) {
            const node = program[index];
            if (node.id === id) return { node, list: program, index, depth };
            for (const list of ROBOT_INSTRUCTIONS[node.op].lists || []) {
                const found = ROBOT_LOGIC.find(node[list], id, depth + 1);
                if (found) return found;
            }
        }
        return null;
    },

    // A list by key: 'root', or '<id>:body' / '<id>:else'. Returns { list, depth } or null.
    getList(program, key) {
        if (key === 'root') return { list: program, depth: 0 };
        const [id, name] = String(key).split(':');
        const found = ROBOT_LOGIC.find(program, id);
        if (!found || !Array.isArray(found.node[name])) return null;
        return { list: found.node[name], depth: found.depth + 1, owner: found.node };
    },

    contains(node, id) {
        if (node.id === id) return true;
        return (ROBOT_INSTRUCTIONS[node.op].lists || []).some((list) => node[list].some((child) => ROBOT_LOGIC.contains(child, id)));
    },

    // Inserts a new or existing node into a list at an index. Returns an error text or null.
    insert(program, key, index, node) {
        const target = ROBOT_LOGIC.getList(program, key);
        if (!target) return 'That place is gone';
        if (target.depth + ROBOT_LOGIC.nodeDepth(node) > ROBOT_MAX_DEPTH) return `Blocks can only be nested ${ROBOT_MAX_DEPTH} deep`;
        const existing = ROBOT_LOGIC.find(program, node.id);
        if (existing) {
            if (target.owner && ROBOT_LOGIC.contains(node, target.owner.id)) return 'A block cannot go inside itself';
            existing.list.splice(existing.index, 1);
            if (existing.list === target.list && existing.index < index) index -= 1;
        } else if (ROBOT_LOGIC.countNodes(program) + ROBOT_LOGIC.countNodes([node]) > ROBOT_MAX_NODES) {
            return `A program can have at most ${ROBOT_MAX_NODES} blocks`;
        }
        target.list.splice(Math.max(0, Math.min(index, target.list.length)), 0, node);
        return null;
    },

    remove(program, id) {
        const found = ROBOT_LOGIC.find(program, id);
        if (!found) return false;
        found.list.splice(found.index, 1);
        return true;
    },

    // ---- Inventory: an array of ROBOT_SLOTS entries, each null or { type, count } ----------

    emptyInventory() {
        return Array.from({ length: ROBOT_SLOTS }, () => null);
    },

    cleanInventory(saved) {
        const inventory = ROBOT_LOGIC.emptyInventory();
        if (!Array.isArray(saved)) return inventory;
        saved.slice(0, ROBOT_SLOTS).forEach((slot, index) => {
            if (slot && ROBOT_LOGIC.cleanBlock(slot.type) && slot.count > 0) {
                inventory[index] = { type: slot.type, count: Math.min(ROBOT_STACK, Math.floor(slot.count)) };
            }
        });
        return inventory;
    },

    // How many of `type` fit.
    room(inventory, type) {
        return inventory.reduce((sum, slot) => sum + (!slot ? ROBOT_STACK : (slot.type === type ? ROBOT_STACK - slot.count : 0)), 0);
    },

    // Adds up to `amount`; returns how many did not fit.
    add(inventory, type, amount = 1) {
        let left = amount;
        for (const slot of inventory) {
            if (left <= 0) break;
            if (slot && slot.type === type && slot.count < ROBOT_STACK) {
                const put = Math.min(left, ROBOT_STACK - slot.count);
                slot.count += put;
                left -= put;
            }
        }
        for (let index = 0; index < inventory.length && left > 0; index++) {
            if (inventory[index]) continue;
            const put = Math.min(left, ROBOT_STACK);
            inventory[index] = { type, count: put };
            left -= put;
        }
        return left;
    },

    count(inventory, type) {
        return inventory.reduce((sum, slot) => sum + (slot && slot.type === type ? slot.count : 0), 0);
    },

    // Full: no empty slot left (a new kind of block would not fit).
    isFull(inventory) {
        return inventory.every((slot) => slot);
    },

    isEmpty(inventory) {
        return inventory.every((slot) => !slot);
    },

    // Takes one item: `type`, or (empty type) the first stack that `accept(type)` allows.
    // Returns the type taken or null.
    take(inventory, type, accept = () => true) {
        for (let index = 0; index < inventory.length; index++) {
            const slot = inventory[index];
            if (!slot || (type ? slot.type !== type : !accept(slot.type))) continue;
            slot.count -= 1;
            if (slot.count <= 0) inventory[index] = null;
            return slot.type;
        }
        return null;
    },

    // ---- Interpreter -------------------------------------------------------------------------

    start(program) {
        return { stack: [{ list: program, pc: 0 }], done: false, error: null, steps: 0 };
    },

    // sense(where) -> { type, solid } for 'ahead' / 'above' / 'below'; inventory -> the array.
    evalCond(cond, api) {
        const spec = ROBOT_CONDITIONS[cond.test] || ROBOT_CONDITIONS.always;
        let result;
        if (cond.test === 'always') result = true;
        else if (cond.test === 'inv_full') result = ROBOT_LOGIC.isFull(api.inventory());
        else if (cond.test === 'inv_empty') result = ROBOT_LOGIC.isEmpty(api.inventory());
        else if (cond.test === 'inv_has') result = ROBOT_LOGIC.count(api.inventory(), cond.block) > 0;
        else {
            const [where, check] = cond.test.split('_');
            const cell = api.sense(where);
            if (check === 'air') result = !cell.type;
            else if (check === 'solid') result = Boolean(cell.solid);
            else result = cell.type === (spec.block ? cond.block : null);
        }
        return cond.not ? !result : result;
    },

    // Runs the program until the next thing that takes time: an action (api.act(node) returns
    // { ok, error, duration }) or a control check. Returns { node, kind } or null when finished.
    step(state, api) {
        if (state.done) return null;
        for (let guard = 0; guard < 20000; guard++) {
            const frame = state.stack[state.stack.length - 1];
            if (!frame) {
                state.done = true;
                return null;
            }
            if (frame.pc >= frame.list.length) {
                if (frame.loop === 'repeat' && frame.left > 1) {
                    frame.left -= 1;
                    frame.pc = 0;
                    continue;
                }
                if (frame.loop === 'while') {
                    if (ROBOT_LOGIC.evalCond(frame.node.cond, api)) {
                        frame.pc = 0;
                        state.steps += 1;
                        return { node: frame.node, kind: 'control', duration: ROBOT_CONTROL_TIME };
                    }
                }
                state.stack.pop();
                continue;
            }
            const node = frame.list[frame.pc];
            frame.pc += 1;
            state.steps += 1;
            if (node.op === 'repeat') {
                if (node.times >= 1 && node.body.length > 0) state.stack.push({ list: node.body, pc: 0, loop: 'repeat', left: node.times, node });
                return { node, kind: 'control', duration: ROBOT_CONTROL_TIME };
            }
            if (node.op === 'while') {
                if (ROBOT_LOGIC.evalCond(node.cond, api)) state.stack.push({ list: node.body, pc: 0, loop: 'while', node });
                return { node, kind: 'control', duration: ROBOT_CONTROL_TIME };
            }
            if (node.op === 'if') {
                const branch = ROBOT_LOGIC.evalCond(node.cond, api) ? node.body : node.else;
                if (branch.length > 0) state.stack.push({ list: branch, pc: 0 });
                return { node, kind: 'control', duration: ROBOT_CONTROL_TIME };
            }
            const result = api.act(node) || { ok: true };
            if (!result.ok) {
                state.done = true;
                state.error = result.error || 'Something went wrong';
            }
            return { node, kind: 'action', duration: result.duration, error: result.ok ? null : state.error };
        }
        // Only empty loops inside each other get here: count it as a pause.
        return { node: null, kind: 'control', duration: ROBOT_CONTROL_TIME };
    }
};

const ROBOT_SPRITE = [
    '......A.....',
    '......a.....',
    '......a.....',
    '..HHHHHHHH..',
    '..HSESSESH..',
    '..HSSmmSSH..',
    '..HHHHHHHH..',
    '.BBBBBBBBBB.',
    '.BBbbBBbbBB.',
    'TTTTTTTTTTTT',
    'TtTtTtTtTtTt',
    'TTTTTTTTTTTT'
];

if (typeof registerItemType === 'function') {
    registerItemType('robot', {
        color: 0xf0a830, name: 'Robot',
        drawIcon: resourcesDrawSprite(ROBOT_SPRITE, {
            A: 0x7dffb0, a: 0x5a5f66, H: 0xd8dde3, S: 0x1d2733, E: 0x5fe8ff, m: 0x5fe8ff,
            B: 0xf0a830, b: 0x9c6a1a, T: 0x3a3f46, t: 0x8b9199
        }),
        displayMesh: resourcesDisplayMesh
    });

    registerGameContent(function ({ addRecipe }) {
        addRecipe('robot', 'Build Robot', 'robot', 1, [
            { type: 'iron_ore', amount: 3 }, { type: 'copper_block', amount: 1 },
            { type: 'glass', amount: 1 }, { type: 'element_si', amount: 1 }
        ]);
    });

    // A robot in front of the targeted block takes the right click before anything that would
    // use that block (seeds, baits, the lab...), so this one goes first.
    ITEM_USE_HANDLERS.unshift(function (item, hit) {
        return this.robotHandleUse(item, hit);
    });

    registerModalPanel({
        isOpen() { return Boolean(this.robotPanelOpen); },
        close() { this.robotClosePanel(); }
    });

    registerFrameUpdate(function (delta) {
        this.robotUpdate(delta);
    });
}

const ROBOT_CSS = `
#robot-hud{position:absolute;top:14px;right:14px;max-width:min(360px,calc(100vw - 32px));padding:8px 12px;border-radius:10px;background:rgba(10,14,22,.78);border:1px solid rgba(255,211,107,.45);color:#fff;font:12px/1.35 'Consolas',monospace;pointer-events:none;display:none;z-index:30}
#robot-hud.visible{display:block}
#robot-hud b{color:#ffd36b}
#robot-hud .robot-hud-hint{color:#a9bdd5;font-size:11px;margin-top:3px}
#robot-hud.error{border-color:rgba(255,110,90,.7)}
#robot-panel.robot-docked{left:auto;right:12px;transform:translateY(-50%);width:min(460px,calc(100vw - 24px));opacity:.94}
#robot-panel{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(940px,calc(100vw - 24px));height:min(88vh,720px);display:none;flex-direction:column;gap:10px;padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(16,20,26,.95);color:#fff;font:12px/1.35 'Consolas',monospace;z-index:275;box-sizing:border-box;user-select:none}
#robot-panel.visible{display:flex}
#robot-panel button{height:28px;padding:0 10px;border-radius:7px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:700 12px/1 'Consolas',monospace;cursor:pointer}
#robot-panel button:hover{background:rgba(255,255,255,.16)}
#robot-panel button.robot-run{background:#2f8a4a}
#robot-panel button.robot-stop{background:#9a3a32}
#robot-panel select,#robot-panel input{font:12px 'Consolas',monospace;background:rgba(0,0,0,.35);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:5px;padding:1px 3px;max-width:150px}
#robot-panel input[type=number]{width:46px}
#robot-panel .robot-header{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#robot-panel h3{margin:0;font-size:16px;flex:1;color:#ffd36b}
#robot-panel .robot-status{min-height:18px;padding:4px 8px;border-radius:6px;background:rgba(255,255,255,.06)}
#robot-panel .robot-status.error{background:rgba(190,60,50,.35);color:#ffd2cc}
#robot-panel .robot-main{flex:1;min-height:0;display:flex;gap:10px}
#robot-panel .robot-palette{width:170px;flex:none;overflow:auto;display:flex;flex-direction:column;gap:4px;padding:6px;border-radius:8px;background:rgba(255,255,255,.04)}
#robot-panel .robot-palette h4{margin:6px 0 2px;font-size:11px;color:#9ec7ef;text-transform:uppercase}
#robot-panel .robot-palette .robot-hint{color:#a9b2bc;font-size:11px}
#robot-panel .robot-chip{padding:5px 8px;border-radius:6px;cursor:grab;color:#10141a;font-weight:700}
#robot-panel .robot-program{flex:1;min-width:0;overflow:auto;padding:8px;border-radius:8px;background:rgba(255,255,255,.04)}
#robot-panel .robot-list{min-height:26px;padding:3px 0 3px 0;border-radius:6px;display:flex;flex-direction:column;gap:3px}
#robot-panel .robot-program>.robot-list{min-height:calc(100% - 4px);box-sizing:border-box}
#robot-panel .robot-list.robot-target{outline:2px dashed #ffd36b;outline-offset:1px}
#robot-panel .robot-list.robot-drop{background:rgba(255,211,107,.15)}
#robot-panel .robot-list .robot-empty{color:#7f8a96;font-style:italic;padding:4px 8px}
#robot-panel .robot-block{border-radius:7px;padding:4px 6px;color:#10141a}
#robot-panel .robot-block .robot-list{margin:3px 0 2px 14px;padding:3px 4px;background:rgba(0,0,0,.18)}
#robot-panel .robot-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
#robot-panel .robot-grip{cursor:grab;font-weight:700;white-space:nowrap}
#robot-panel .robot-row .robot-del{margin-left:auto;height:20px;padding:0 6px;background:rgba(0,0,0,.25);border-color:rgba(0,0,0,.2)}
#robot-panel .robot-row label{display:flex;align-items:center;gap:2px}
#robot-panel .robot-else{font-weight:700;margin-top:2px}
#robot-panel .robot-current{box-shadow:0 0 0 3px #fff,0 0 12px 4px rgba(255,255,255,.7)}
#robot-panel .robot-current.robot-failed{box-shadow:0 0 0 3px #ff5a4a,0 0 12px 4px rgba(255,90,74,.8)}
#robot-panel .cat-move{background:#6fb4ff}
#robot-panel .cat-dig{background:#f0a050}
#robot-panel .cat-build{background:#8fd46a}
#robot-panel .cat-control{background:#f2d260}
#robot-panel .cat-other{background:#c79bf2}
#robot-panel .robot-bottom{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}
#robot-panel .robot-inventory{display:flex;gap:4px}
#robot-panel .robot-slot{width:40px;height:40px;border-radius:6px;background:rgba(255,255,255,.08);position:relative;cursor:pointer;display:flex;align-items:center;justify-content:center}
#robot-panel .robot-slot img{width:30px;height:30px;image-rendering:pixelated}
#robot-panel .robot-slot span{position:absolute;right:3px;bottom:1px;font-weight:700;text-shadow:0 1px 2px #000}
#robot-panel .robot-controls{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
@media (max-width:640px){#robot-panel .robot-main{flex-direction:column}#robot-panel .robot-palette{width:auto;max-height:150px;flex-direction:row;flex-wrap:wrap}}
`;

Object.assign(Game.prototype, {
    // ---- Robots in the world -------------------------------------------------------------

    robotEnsure() {
        if (this.robots) return;
        this.robots = [];
        this.robotMaterials = new Map();
        this.robotBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
        this.robotHitMaterial = new THREE.MeshBasicMaterial({ visible: false });
        this.robotRestore();
    },

    robotBox(parent, color, x, y, z, sx, sy, sz, material = null) {
        let shared = material;
        if (!shared) {
            shared = this.robotMaterials.get(color);
            if (!shared) {
                shared = new THREE.MeshLambertMaterial({ color });
                this.robotMaterials.set(color, shared);
            }
        }
        const mesh = new THREE.Mesh(this.robotBoxGeometry, shared);
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        mesh.castShadow = Boolean(this.rtxModeEnabled) && !material;
        mesh.receiveShadow = Boolean(this.rtxModeEnabled);
        parent.add(mesh);
        return mesh;
    },

    // The model faces +z: treads on the sides, a yellow body, a head with a dark screen face
    // (two eyes and a smile) and an antenna with a light on top.
    robotBuildModel(robot) {
        const group = new THREE.Group();
        const body = new THREE.Group();
        group.add(body);
        const treads = [];
        for (const side of [-1, 1]) {
            this.robotBox(group, 0x3a3f46, side * 0.27, 0.11, 0, 0.14, 0.22, 0.66);
            const lugs = new THREE.Group();
            lugs.position.set(side * 0.27, 0.11, 0);
            for (let i = 0; i < 6; i++) {
                const lug = this.robotBox(lugs, 0x8b9199, side * 0.075, 0, -0.27 + i * 0.11, 0.02, 0.2, 0.04);
                lug.userData.baseZ = lug.position.z;
            }
            group.add(lugs);
            treads.push(lugs);
        }
        // Body with vents and a little front scoop.
        this.robotBox(body, 0xf0a830, 0, 0.32, 0, 0.42, 0.24, 0.56);
        this.robotBox(body, 0x9c6a1a, -0.1, 0.32, 0.282, 0.1, 0.1, 0.01);
        this.robotBox(body, 0x9c6a1a, 0.1, 0.32, 0.282, 0.1, 0.1, 0.01);
        this.robotBox(body, 0x8b9199, 0, 0.18, 0.33, 0.3, 0.05, 0.1);
        // Neck and head.
        this.robotBox(body, 0x5a5f66, 0, 0.47, 0, 0.1, 0.08, 0.1);
        const head = new THREE.Group();
        head.position.y = 0.62;
        body.add(head);
        this.robotBox(head, 0xd8dde3, 0, 0, 0, 0.42, 0.24, 0.32);
        this.robotBox(head, 0x1d2733, 0, 0, 0.161, 0.34, 0.17, 0.01);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x5fe8ff });
        const eyes = [-0.08, 0.08].map((x) => this.robotBox(head, 0, x, 0.025, 0.168, 0.055, 0.06, 0.01, eyeMaterial));
        this.robotBox(head, 0, 0, -0.045, 0.168, 0.08, 0.018, 0.01, eyeMaterial);
        // Ear bolts and antenna.
        this.robotBox(head, 0x8b9199, -0.22, 0, 0, 0.03, 0.08, 0.08);
        this.robotBox(head, 0x8b9199, 0.22, 0, 0, 0.03, 0.08, 0.08);
        this.robotBox(head, 0x5a5f66, 0, 0.19, 0, 0.025, 0.16, 0.025);
        const lightMaterial = new THREE.MeshBasicMaterial({ color: 0x7dffb0 });
        const light = this.robotBox(head, 0, 0, 0.29, 0, 0.07, 0.07, 0.07, lightMaterial);
        const hitbox = this.robotBox(group, 0, 0, 0.45, 0, 0.75, 0.95, 0.75, this.robotHitMaterial);
        hitbox.castShadow = false;
        hitbox.userData.robot = robot;
        Object.assign(robot, { group, body, head, eyes, eyeMaterial, light, lightMaterial, treads, hitbox });
        this.scene.add(group);
    },

    robotCreate(data) {
        const robot = {
            x: Math.round(data.x), y: Math.round(data.y), z: Math.round(data.z),
            dir: ((Math.round(data.dir) % 4) + 4) % 4 || 0,
            name: typeof data.name === 'string' && data.name ? data.name.slice(0, 16) : this.robotFreeName(),
            program: ROBOT_LOGIC.normalize(data.program),
            inventory: ROBOT_LOGIC.cleanInventory(data.inventory),
            mode: 'idle', state: null, timer: 0, current: null, error: null,
            from: null, moveTime: 0, moveLength: 0, yaw: 0, fromYaw: 0, settleTimer: 0,
            bubble: null, bubbleTime: 0, blinkTimer: 2 + Math.random() * 3, digFlash: 0
        };
        robot.yaw = this.robotYaw(robot.dir);
        robot.fromYaw = robot.yaw;
        this.robotBuildModel(robot);
        this.robotPlaceMesh(robot);
        this.robots.push(robot);
        return robot;
    },

    robotFreeName() {
        const used = new Set((this.robots || []).map((robot) => robot.name));
        for (let i = 1; i <= ROBOT_LIMIT + 1; i++) if (!used.has(`Robot ${i}`)) return `Robot ${i}`;
        return 'Robot';
    },

    robotYaw(dir) {
        const [dx, dz] = ROBOT_DIRS[dir];
        return Math.atan2(dx, dz);
    },

    // Feet height for the mesh: on a slab or farmland it sits on the block below.
    robotVisualY(x, y, z) {
        const below = this.world.getCollisionHeight(x, y - 1, z);
        return below > 0 && below < 1 ? y - 1 + below : y;
    },

    robotPlaceMesh(robot) {
        robot.group.position.set(robot.x + 0.5, this.robotVisualY(robot.x, robot.y, robot.z), robot.z + 0.5);
        robot.group.rotation.y = robot.yaw;
    },

    robotRemove(robot) {
        if (this.robotPanelRobot === robot) this.robotClosePanel();
        this.scene.remove(robot.group);
        if (robot.bubble) robot.bubble.material.map.dispose();
        robot.eyeMaterial.dispose();
        robot.lightMaterial.dispose();
        this.robots = this.robots.filter((candidate) => candidate !== robot);
        this.robotSave();
    },

    robotAt(x, y, z, except = null) {
        return this.robots.find((robot) => robot !== except && robot.x === x && robot.y === y && robot.z === z) || null;
    },

    // ---- Right click and placing -------------------------------------------------------

    robotHandleUse(item, hit) {
        if (!this.world || !this.scene) return false;
        this.robotEnsure();
        const robot = this.robotRaycast(hit);
        if (robot) {
            this.robotOpenPanel(robot);
            this.placeActionTimer = 0.35;
            return true;
        }
        if (item === 'robot' && hit) {
            this.robotPlace(hit);
            this.placeActionTimer = 0.35;
            this.lastSelectionUpdate = 0;
            return true;
        }
        return false;
    },

    robotPlace(hit) {
        if (this.robots.length >= ROBOT_LIMIT) {
            this.receiveSystemMessage({ text: `You can have at most ${ROBOT_LIMIT} robots: hit one to pick it up` });
            return;
        }
        const block = this.world.getBlockPositionFromIntersection(hit);
        if (!block || !hit.face || hit.face.normal.y < 0.5) {
            this.receiveSystemMessage({ text: 'Place the robot on top of a block' });
            return;
        }
        const cell = { x: block.x, y: block.y + 1, z: block.z };
        const type = this.world.getBlockTypeAt(cell.x, cell.y, cell.z);
        if (this.world.hasSolidBlock(cell.x, cell.y, cell.z) || type === 'water' || this.robotAt(cell.x, cell.y, cell.z)) {
            this.receiveSystemMessage({ text: 'There is no room for the robot there' });
            return;
        }
        const near = (list) => (list || []).some((entity) => Math.hypot(entity.position.x - (cell.x + 0.5), entity.position.z - (cell.z + 0.5)) < 0.6 && Math.abs(entity.position.y - cell.y) < 1.2);
        if (near(this.weatherStations) || near(this.trapsCages) || near(this.trapsJars)) {
            this.receiveSystemMessage({ text: 'There is no room for the robot there' });
            return;
        }
        if (this.cameraController.intersectsBody(this.getLocalPlayerPosition(), cell.x, cell.y, cell.z, 1)) {
            this.receiveSystemMessage({ text: 'You are standing there: step back to set the robot down' });
            return;
        }
        // It looks the way you look, snapped to the grid.
        const player = this.getLocalPlayerPosition();
        const dx = cell.x + 0.5 - player.x;
        const dz = cell.z + 0.5 - player.z;
        let dir = 0;
        let best = -Infinity;
        ROBOT_DIRS.forEach(([x, z], index) => {
            const score = x * dx + z * dz;
            if (score > best) {
                best = score;
                dir = index;
            }
        });
        if (!this.consumeSelectedBlock()) return;
        let program = [];
        try {
            program = JSON.parse(window.localStorage.getItem(ROBOT_LAST_PROGRAM_KEY) || '[]');
        } catch (_error) {
            program = [];
        }
        const robot = this.robotCreate({ ...cell, dir, program });
        this.playPlaceSound('iron_ore');
        this.robotSay(robot, 'Hi! Right click me to program me');
        this.receiveSystemMessage({ text: `${robot.name} is ready. Right click it to program it; hit it to pick it up` });
        this.robotSave();
    },

    // The robot under the crosshair, if nearer than the targeted block (blockHit null: look up
    // the block itself).
    robotRaycast(blockHit) {
        if (!this.robots || this.robots.length === 0) return null;
        const ray = this.getInteractionRay();
        const hit = blockHit === null ? this.raycastBlock(this.placeDistance) : blockHit;
        this.raycaster.set(ray.origin, ray.direction);
        const hits = this.raycaster.intersectObjects(this.robots.map((robot) => robot.hitbox), false);
        for (const candidate of hits) {
            if (candidate.point.distanceTo(ray.reachOrigin) > this.placeDistance + 0.3) break;
            if (hit && candidate.distance > hit.distance + 0.05) break;
            return candidate.object.userData.robot;
        }
        return null;
    },

    // Hitting a robot picks it up, with its load; its program is kept for the next one.
    robotPickUp(robot) {
        this.robotRemember(robot);
        this.robotRemove(robot);
        this.addInventory('robot');
        robot.inventory.forEach((slot) => { if (slot) this.addInventory(slot.type, slot.count); });
        this.playPlaceSound('iron_ore');
        this.receiveSystemMessage({ text: `${robot.name} picked up (its program is kept for the next robot you set down)` });
    },

    robotRemember(robot) {
        try {
            window.localStorage.setItem(ROBOT_LAST_PROGRAM_KEY, JSON.stringify(ROBOT_LOGIC.serialize(robot.program)));
        } catch (_error) {
            // Storage unavailable.
        }
    },

    // ---- Running -------------------------------------------------------------------------

    robotRun(robot) {
        if (robot.mode === 'running') return;
        if (robot.mode !== 'paused' || !robot.state || robot.state.done) {
            if (robot.program.length === 0) {
                this.robotSetStatus(robot, 'The program is empty: add some blocks first');
                return;
            }
            robot.state = ROBOT_LOGIC.start(robot.program);
            robot.error = null;
        }
        robot.mode = 'running';
        robot.timer = Math.min(robot.timer, 0.15);
        this.robotSetStatus(robot, 'Running...');
        this.robotRefreshButtons();
        // Back to the world to watch it work; a small card in the corner follows the program.
        this.robotClosePanel();
        this.robotHudRobot = robot;
        this.robotUpdateHud();
    },

    // The corner card of a running robot (it never takes the mouse).
    robotUpdateHud() {
        const robot = this.robotHudRobot;
        if (!this.robotHud) {
            this.robotHud = document.createElement('div');
            this.robotHud.id = 'robot-hud';
            document.body.appendChild(this.robotHud);
        }
        const hud = this.robotHud;
        if (!robot || this.robotPanelOpen) {
            hud.classList.remove('visible');
            return;
        }
        const steps = robot.state ? robot.state.steps : 0;
        const running = robot.mode === 'running';
        hud.innerHTML = `<b>🤖 ${this.robotEscape(robot.name)}</b> · ${running ? `step ${steps}` : 'stopped'}<br>${this.robotEscape(robot.statusText || '')}`
            + `<div class="robot-hud-hint">${running ? 'Right-click the robot to pause or edit it' : 'Right-click the robot to edit its program'}</div>`;
        hud.classList.toggle('error', Boolean(robot.statusError));
        hud.classList.add('visible');
        clearTimeout(this.robotHudTimer);
        if (!running) {
            this.robotHudTimer = setTimeout(() => {
                if (this.robotHudRobot === robot && robot.mode !== 'running') {
                    this.robotHudRobot = null;
                    hud.classList.remove('visible');
                }
            }, 5000);
        }
    },

    robotStep(robot) {
        if (robot.mode !== 'paused' || !robot.state || robot.state.done) {
            if (robot.program.length === 0) {
                this.robotSetStatus(robot, 'The program is empty: add some blocks first');
                return;
            }
            if (robot.mode !== 'running') {
                robot.state = ROBOT_LOGIC.start(robot.program);
                robot.error = null;
            }
        }
        robot.mode = 'paused';
        this.robotFinishMove(robot);
        this.robotAdvance(robot);
        this.robotRefreshButtons();
        // Stepping keeps the panel open, docked to the side so the robot stays in view.
        if (this.robotPanel) this.robotPanel.classList.add('robot-docked');
    },

    robotStop(robot, message = 'Stopped', isError = false) {
        robot.mode = 'idle';
        robot.state = null;
        robot.current = isError ? robot.current : null;
        robot.timer = 0;
        robot.settleTimer = 0.3;
        if (isError) {
            robot.error = message;
            this.robotSay(robot, message);
            this.receiveSystemMessage({ text: `${robot.name}: ${message}` });
            this.playTone({ frequency: 330, endFrequency: 220, duration: 0.18, type: 'square', volume: 0.012, release: 0.1 });
        }
        this.robotSetStatus(robot, message, isError);
        this.robotHighlight(robot);
        this.robotRefreshButtons();
        this.robotSave();
    },

    // One step of the program: an action or a control check.
    robotAdvance(robot) {
        const player = this.getLocalPlayerPosition();
        if (Math.hypot(player.x - (robot.x + 0.5), player.y - robot.y, player.z - (robot.z + 0.5)) > ROBOT_MAX_DISTANCE) {
            this.robotStop(robot, `You are more than ${ROBOT_MAX_DISTANCE} blocks away: I stopped to wait for you`, true);
            return;
        }
        const api = {
            sense: (where) => this.robotSense(robot, where),
            inventory: () => robot.inventory,
            act: (node) => this.robotAct(robot, node)
        };
        const result = ROBOT_LOGIC.step(robot.state, api);
        if (!result) {
            robot.current = null;
            this.robotStop(robot, 'Program finished');
            this.playTone({ frequency: 660, endFrequency: 990, duration: 0.14, type: 'sine', volume: 0.014, release: 0.1 });
            return;
        }
        robot.current = result.node ? result.node.id : null;
        robot.timer = result.duration !== undefined ? result.duration : ROBOT_CONTROL_TIME;
        if (result.error) {
            this.robotStop(robot, result.error, true);
            return;
        }
        if (robot.mode === 'running') this.robotSetStatus(robot, `Running... step ${robot.state.steps}`);
        else this.robotSetStatus(robot, `Paused at step ${robot.state.steps}: Step for the next one, Run to go on`);
        this.robotHighlight(robot);
        this.robotSaveSoon();
    },

    robotTick() {
        return ROBOT_SPEEDS[this.robotSpeed] || ROBOT_SPEEDS.normal;
    },

    robotCell(robot, where) {
        const [dx, dz] = ROBOT_DIRS[robot.dir];
        if (where === 'ahead') return { x: robot.x + dx, y: robot.y, z: robot.z + dz };
        if (where === 'behind') return { x: robot.x - dx, y: robot.y, z: robot.z - dz };
        if (where === 'above') return { x: robot.x, y: robot.y + 1, z: robot.z };
        return { x: robot.x, y: robot.y - 1, z: robot.z };
    },

    robotSense(robot, where) {
        const cell = this.robotCell(robot, where);
        const type = this.world.getBlockTypeAt(cell.x, cell.y, cell.z);
        return { type, solid: this.world.hasSolidBlock(cell.x, cell.y, cell.z) };
    },

    robotLoaded(cell) {
        return Boolean(this.world.getColumnAt(cell.x, cell.z));
    },

    robotIsPlayerIn(cell) {
        return this.cameraController.intersectsBody(this.getLocalPlayerPosition(), cell.x, cell.y, cell.z, 1);
    },

    // It may float, but never more than ROBOT_MAX_FLOAT empty blocks above the ground (water
    // counts as ground: it hovers over it).
    robotHasGround(cell) {
        for (let i = 1; i <= ROBOT_MAX_FLOAT + 1; i++) {
            if (this.robotIsSupport(cell.x, cell.y - i, cell.z)) return true;
        }
        return false;
    },

    robotIsSupport(x, y, z) {
        return this.world.hasSolidBlock(x, y, z) || this.world.getBlockTypeAt(x, y, z) === 'water';
    },

    robotName(type) {
        return type ? this.getBlockDisplayName(type) || type : 'air';
    },

    robotCanPlace(type) {
        const def = this.world.blockTypes[type];
        return Boolean(def) && !def.itemOnly && !ROBOT_NOT_PLACEABLE.includes(type) && !type.startsWith('wheat_');
    },

    // Does one instruction; { ok, error, duration }.
    robotAct(robot, node) {
        const tick = this.robotTick();
        switch (node.op) {
        case 'turnLeft':
        case 'turnRight':
            this.robotStartMove(robot, tick);
            robot.dir = (robot.dir + (node.op === 'turnRight' ? 1 : 3)) % 4;
            robot.yaw = robot.fromYaw + Math.atan2(Math.sin(this.robotYaw(robot.dir) - robot.fromYaw), Math.cos(this.robotYaw(robot.dir) - robot.fromYaw));
            return { ok: true, duration: tick };
        case 'forward':
        case 'back':
        case 'up':
        case 'down':
            return this.robotMove(robot, { forward: 'ahead', back: 'behind', up: 'above', down: 'below' }[node.op], tick);
        case 'digAhead':
        case 'digUp':
        case 'digDown':
            return this.robotDig(robot, { digAhead: 'ahead', digUp: 'above', digDown: 'below' }[node.op], tick);
        case 'placeAhead':
        case 'placeUp':
        case 'placeDown':
            return this.robotPlaceBlock(robot, { placeAhead: 'ahead', placeUp: 'above', placeDown: 'below' }[node.op], node.block, tick);
        case 'wait':
            return { ok: true, duration: node.seconds };
        case 'say':
            this.robotSay(robot, node.text || '...');
            this.playTone({ frequency: 700 + Math.random() * 300, endFrequency: 900, duration: 0.08, type: 'square', volume: 0.008, release: 0.06 });
            return { ok: true, duration: Math.max(tick, Math.min(2.5, 0.6 + (node.text || '').length * 0.04)) };
        default:
            return { ok: true, duration: tick };
        }
    },

    robotMove(robot, where, tick) {
        const cell = this.robotCell(robot, where);
        if (!this.robotLoaded(cell)) return { ok: false, error: 'I can\'t go there: that part of the world is not loaded' };
        if (cell.y < WORLD_MIN_Y || cell.y > WORLD_MAX_Y - 1) return { ok: false, error: 'I can\'t go any further that way' };
        if (this.world.hasSolidBlock(cell.x, cell.y, cell.z)) {
            return { ok: false, error: `There is ${this.robotName(this.world.getBlockTypeAt(cell.x, cell.y, cell.z))} in my way` };
        }
        if (this.robotAt(cell.x, cell.y, cell.z, robot)) return { ok: false, error: 'Another robot is in my way' };
        if (this.robotIsPlayerIn(cell)) return { ok: false, error: 'You are in my way!' };
        // Sideways it may also take one step off an edge (to build bridges): only from a spot
        // right on top of the ground.
        const offEdge = (where === 'ahead' || where === 'behind') && this.robotIsSupport(robot.x, robot.y - 1, robot.z);
        if (where !== 'below' && !offEdge && !this.robotHasGround(cell)) {
            return { ok: false, error: `Too high! I can only float ${ROBOT_MAX_FLOAT} blocks above the ground` };
        }
        this.robotStartMove(robot, tick);
        Object.assign(robot, cell);
        return { ok: true, duration: tick };
    },

    robotDig(robot, where, tick) {
        const cell = this.robotCell(robot, where);
        if (!this.robotLoaded(cell)) return { ok: false, error: 'I can\'t reach there: that part of the world is not loaded' };
        const type = this.world.getBlockTypeAt(cell.x, cell.y, cell.z);
        if (!type || type === 'water') return { ok: true, duration: tick };
        const duration = this.world.getBreakDurationForType(type);
        if (!duration && duration !== 0) return { ok: false, error: `I can't dig ${this.robotName(type)}: it is unbreakable` };
        const drop = this.world.getDropTypeForBlock(type);
        if (drop && ROBOT_LOGIC.room(robot.inventory, drop) <= 0) return { ok: false, error: 'My inventory is full! Take my things out first' };
        // The other half of a door or a bed goes with it, as when a player breaks it (one drops).
        const typeAt = (x, y, z) => this.world.getBlockTypeAt(x, y, z);
        const otherHalves = shapeLinkedCells(type, cell, typeAt, this.world.blockTypes);
        const boundBed = isBedBlockType(type) && this.isRespawnBoundToBed(type, cell);
        if (!this.world.removeBlockAt(cell.x, cell.y, cell.z)) return { ok: true, duration: tick };
        if (this.network.connected) this.network.send('blockBreak', { x: cell.x, y: cell.y, z: cell.z });
        for (const { x, y, z } of otherHalves) {
            if (this.world.removeBlockAt(x, y, z) && this.network.connected) this.network.send('blockBreak', { x, y, z });
        }
        if (boundBed) {
            this.respawnPoint = null;
            window.localStorage.removeItem('minecloud-respawn-point');
            this.receiveSystemMessage({ text: 'Respawn point reset because your bed was removed' });
        }
        if (drop) ROBOT_LOGIC.add(robot.inventory, drop, 1);
        const bonus = this.getExpansionBonusDrop(type);
        if (bonus && ROBOT_LOGIC.add(robot.inventory, bonus, 1) > 0) {
            this.spawnPickup(bonus, { x: cell.x + 0.25, y: cell.y + 0.2, z: cell.z + 0.25 }, 1);
        }
        BLOCK_BREAK_HANDLERS.forEach((handler) => handler.call(this, type, { ...cell }));
        this.lastSelectionUpdate = 0;
        const center = new THREE.Vector3(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
        const normal = new THREE.Vector3(robot.x - cell.x, robot.y - cell.y, robot.z - cell.z);
        if (this.breakParticleGeometry) this.spawnMiningParticles(type, center.addScaledVector(normal, 0.5), normal);
        this.playMiningSound(type);
        robot.digFlash = 0.25;
        this.robotRefreshInventory(robot);
        return { ok: true, duration: tick + Math.min(2, duration * 0.6) };
    },

    robotPlaceBlock(robot, where, wanted, tick) {
        const cell = this.robotCell(robot, where);
        if (!this.robotLoaded(cell)) return { ok: false, error: 'I can\'t reach there: that part of the world is not loaded' };
        if (cell.y < WORLD_MIN_Y || cell.y > WORLD_MAX_Y) return { ok: false, error: 'I can\'t build that far' };
        const existing = this.world.getBlockTypeAt(cell.x, cell.y, cell.z);
        if (existing && !ROBOT_REPLACEABLE.includes(existing)) return { ok: true, duration: tick };
        if (this.robotAt(cell.x, cell.y, cell.z, robot)) return { ok: false, error: 'Another robot is in the way' };
        if (wanted && !this.robotCanPlace(wanted)) return { ok: false, error: `I can't place ${this.robotName(wanted)}` };
        const type = ROBOT_LOGIC.take(robot.inventory, wanted, (candidate) => this.robotCanPlace(candidate));
        if (!type) {
            return { ok: false, error: wanted ? `I have no ${this.robotName(wanted)} left` : 'I have no blocks to place' };
        }
        const height = this.world.registry.height[this.world.registry.id(type)];
        if (height > 0 && this.robotIsPlayerIn(cell)) {
            ROBOT_LOGIC.add(robot.inventory, type, 1);
            return { ok: false, error: 'You are in the way: I won\'t build on you!' };
        }
        const payload = { x: cell.x, y: cell.y, z: cell.z, blockType: type };
        if (!this.world.addBlock(payload)) {
            ROBOT_LOGIC.add(robot.inventory, type, 1);
            return { ok: true, duration: tick };
        }
        if (this.network.connected) this.network.send('blockPlace', payload);
        this.playPlaceSound(type);
        this.lastSelectionUpdate = 0;
        this.robotRefreshInventory(robot);
        return { ok: true, duration: tick };
    },

    // ---- Animation -----------------------------------------------------------------------

    robotStartMove(robot, length) {
        this.robotFinishMove(robot);
        robot.from = robot.group.position.clone();
        robot.fromYaw = robot.yaw;
        robot.moveTime = 0;
        robot.moveLength = Math.max(0.05, length * 0.85);
    },

    robotFinishMove(robot) {
        if (!robot.from) return;
        robot.from = null;
        robot.fromYaw = robot.yaw;
        this.robotPlaceMesh(robot);
    },

    robotAnimate(robot, delta, now) {
        if (robot.from) {
            robot.moveTime += delta;
            const t = Math.min(1, robot.moveTime / robot.moveLength);
            const ease = t * t * (3 - 2 * t);
            const targetY = this.robotVisualY(robot.x, robot.y, robot.z);
            robot.group.position.set(
                robot.from.x + (robot.x + 0.5 - robot.from.x) * ease,
                robot.from.y + (targetY - robot.from.y) * ease,
                robot.from.z + (robot.z + 0.5 - robot.from.z) * ease
            );
            robot.group.rotation.y = robot.fromYaw + (robot.yaw - robot.fromYaw) * ease;
            robot.treads.forEach((lugs) => lugs.children.forEach((lug) => {
                lug.position.z = lug.userData.baseZ + ((t * 0.11 * 3) % 0.11);
            }));
            if (t >= 1) this.robotFinishMove(robot);
        }
        // A little bob while it works, a drill-like shake after digging.
        const busy = robot.mode === 'running';
        robot.body.position.y = busy ? Math.sin(now * 0.012) * 0.012 : 0;
        robot.digFlash = Math.max(0, robot.digFlash - delta);
        robot.head.rotation.z = robot.digFlash > 0 ? Math.sin(now * 0.08) * 0.08 : 0;
        // Antenna: green blinking while running, amber when paused, red after an error, blue idle.
        let color = 0x6fb4ff;
        if (robot.mode === 'running') color = Math.floor(now / 250) % 2 ? 0x7dffb0 : 0x2f9a5a;
        else if (robot.mode === 'paused') color = 0xffc040;
        else if (robot.error) color = 0xff5a4a;
        robot.lightMaterial.color.setHex(color);
        robot.eyeMaterial.color.setHex(robot.error && robot.mode === 'idle' ? 0xff8a7a : 0x5fe8ff);
        robot.blinkTimer -= delta;
        const blinking = robot.blinkTimer < 0.12;
        robot.eyes.forEach((eye) => { eye.scale.y = blinking ? 0.01 : 0.06; });
        if (robot.blinkTimer < 0) robot.blinkTimer = 2 + Math.random() * 4;
        if (robot.bubble) {
            robot.bubbleTime -= delta;
            robot.bubble.material.opacity = Math.min(1, robot.bubbleTime * 2);
            if (robot.bubbleTime <= 0) {
                robot.group.remove(robot.bubble);
                robot.bubble.material.map.dispose();
                robot.bubble.material.dispose();
                robot.bubble = null;
            }
        }
    },

    // A speech bubble over its head for a few seconds.
    robotSay(robot, text) {
        if (robot.bubble) {
            robot.group.remove(robot.bubble);
            robot.bubble.material.map.dispose();
            robot.bubble.material.dispose();
        }
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.font = 'bold 30px Arial';
        const words = String(text).slice(0, 90).split(/\s+/);
        const lines = [''];
        words.forEach((word) => {
            const line = lines[lines.length - 1];
            const next = line ? `${line} ${word}` : word;
            if (ctx.measureText(next).width > 460 && line && lines.length < 2) lines.push(word);
            else lines[lines.length - 1] = next;
        });
        const width = Math.min(500, Math.max(...lines.map((line) => ctx.measureText(line).width)) + 36);
        const height = lines.length * 36 + 22;
        const left = (512 - width) / 2;
        ctx.fillStyle = 'rgba(255,255,255,0.94)';
        ctx.strokeStyle = 'rgba(30,30,30,0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(left + 14, 4);
        ctx.arcTo(left + width, 4, left + width, 4 + height, 14);
        ctx.arcTo(left + width, 4 + height, left, 4 + height, 14);
        ctx.lineTo(262, 4 + height);
        ctx.lineTo(256, 4 + height + 14);
        ctx.lineTo(244, 4 + height);
        ctx.arcTo(left, 4 + height, left, 4, 14);
        ctx.arcTo(left, 4, left + width, 4, 14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1a1d22';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        lines.forEach((line, index) => ctx.fillText(line, 256, 4 + 11 + 18 + index * 36));
        const texture = new THREE.CanvasTexture(canvas);
        if (THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
        sprite.scale.set(2.4, 0.6, 1);
        sprite.position.y = 1.45;
        sprite.renderOrder = 2000;
        robot.group.add(sprite);
        robot.bubble = sprite;
        robot.bubbleTime = Math.min(6, 2.5 + String(text).length * 0.06);
    },

    // An idle robot lands on the ground (or floats on water); one pushed into a block climbs out; one that falls
    // out of the world drops as an item with its load.
    robotSettle(robot) {
        if (robot.mode !== 'idle' || robot.from || !this.robotLoaded(robot)) return;
        if (this.world.hasSolidBlock(robot.x, robot.y, robot.z)) {
            for (let up = 1; up <= 3; up++) {
                if (!this.world.hasSolidBlock(robot.x, robot.y + up, robot.z) && !this.world.hasSolidBlock(robot.x, robot.y + up + 1, robot.z)) {
                    this.robotStartMove(robot, 0.2);
                    robot.y += up;
                    return;
                }
            }
            this.robotDrop(robot);
            return;
        }
        if (this.robotIsSupport(robot.x, robot.y - 1, robot.z) || this.robotAt(robot.x, robot.y - 1, robot.z, robot)) return;
        if (robot.y - 1 < WORLD_MIN_Y) {
            this.robotDrop(robot);
            return;
        }
        this.robotStartMove(robot, 0.16);
        robot.y -= 1;
        robot.settleTimer = 0;
        this.robotSaveSoon();
    },

    robotDrop(robot) {
        this.robotRemember(robot);
        this.robotRemove(robot);
        const spot = { x: robot.x, y: Math.max(robot.y, WORLD_MIN_Y + 1), z: robot.z };
        this.spawnPickup('robot', spot, 1);
        robot.inventory.forEach((slot) => { if (slot) this.spawnPickup(slot.type, spot, slot.count); });
    },

    robotUpdate(delta) {
        if (!this.world || !this.scene || !this.camera || !this.cameraController) return;
        this.robotEnsure();
        if (this.robots.length === 0) return;
        const now = performance.now();
        // Hitting a robot picks it up.
        if (this.isBreakInputActive) {
            const robot = this.robotRaycast(null);
            if (robot) {
                this.stopMining();
                this.robotPickUp(robot);
                return;
            }
        }
        for (const robot of [...this.robots]) {
            if (robot.mode === 'running') {
                robot.timer -= delta;
                if (robot.timer <= 0) {
                    this.robotFinishMove(robot);
                    this.robotAdvance(robot);
                    if (this.robotHudRobot === robot) this.robotUpdateHud();
                }
            } else if (robot.mode === 'idle') {
                robot.settleTimer -= delta;
                if (robot.settleTimer <= 0) {
                    robot.settleTimer = 0.2;
                    this.robotSettle(robot);
                    if (!this.robots.includes(robot)) continue;
                }
            }
            this.robotAnimate(robot, delta, now);
        }
        if (this.robotSaveTimer > 0) {
            this.robotSaveTimer -= delta;
            if (this.robotSaveTimer <= 0) this.robotSave();
        }
    },

    // ---- Storage -------------------------------------------------------------------------

    robotSaveSoon() {
        if (!(this.robotSaveTimer > 0)) this.robotSaveTimer = 2;
    },

    robotSave() {
        if (!this.robots) return;
        this.robotSaveTimer = 0;
        try {
            window.localStorage.setItem(ROBOT_STORAGE_KEY, JSON.stringify(this.robots.map((robot) => ({
                x: robot.x, y: robot.y, z: robot.z, dir: robot.dir, name: robot.name,
                program: ROBOT_LOGIC.serialize(robot.program),
                inventory: robot.inventory
            }))));
        } catch (_error) {
            // Storage unavailable: robots just won't survive a reload.
        }
    },

    robotRestore() {
        let saved = null;
        try {
            saved = JSON.parse(window.localStorage.getItem(ROBOT_STORAGE_KEY) || 'null');
        } catch (_error) {
            saved = null;
        }
        if (!Array.isArray(saved)) return;
        saved.slice(0, ROBOT_LIMIT).forEach((entry) => {
            if (entry && [entry.x, entry.y, entry.z].every(Number.isFinite)) this.robotCreate(entry);
        });
    },

    // ---- Programming panel ---------------------------------------------------------------

    robotInstallPanel() {
        if (this.robotPanel) return;
        const style = document.createElement('style');
        style.textContent = ROBOT_CSS;
        document.head.appendChild(style);
        const panel = document.createElement('div');
        panel.id = 'robot-panel';
        panel.innerHTML = `
            <div class="robot-header">
                <h3 class="robot-title">Robot</h3>
                <label>Speed <select class="robot-speed">
                    <option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option>
                </select></label>
                <button type="button" class="robot-run">▶ Run</button>
                <button type="button" class="robot-step">⏭ Step</button>
                <button type="button" class="robot-stop">■ Stop</button>
                <button type="button" class="robot-clear">Clear</button>
                <button type="button" class="robot-close">Close</button>
            </div>
            <div class="robot-status"></div>
            <div class="robot-main">
                <div class="robot-palette"></div>
                <div class="robot-program"></div>
            </div>
            <div class="robot-bottom">
                <div><div style="color:#9ec7ef;margin-bottom:3px">Robot inventory (click a slot to take it)</div><div class="robot-inventory"></div></div>
                <div class="robot-controls">
                    <button type="button" class="robot-take">Take all</button>
                    <select class="robot-give-type"></select>
                    <input type="number" class="robot-give-amount" min="1" max="64" value="16">
                    <button type="button" class="robot-give">Give</button>
                </div>
            </div>`;
        document.body.appendChild(panel);
        this.robotPanel = panel;
        this.robotPanelOpen = false;
        this.robotSpeed = this.robotSpeed || 'normal';
        this.robotTargetList = 'root';
        this.robotRenderPalette();

        panel.addEventListener('mousedown', (event) => event.stopPropagation());
        panel.addEventListener('pointerdown', (event) => event.stopPropagation());
        panel.addEventListener('wheel', (event) => event.stopPropagation());
        panel.addEventListener('contextmenu', (event) => event.preventDefault());
        panel.addEventListener('click', (event) => this.robotOnClick(event));
        panel.addEventListener('change', (event) => this.robotOnChange(event));
        panel.addEventListener('input', (event) => {
            if (event.target.dataset.field === 'text') this.robotOnChange(event);
        });
        panel.addEventListener('dragstart', (event) => this.robotOnDragStart(event));
        panel.addEventListener('dragover', (event) => this.robotOnDragOver(event));
        panel.addEventListener('dragleave', (event) => {
            const list = event.target.closest && event.target.closest('.robot-list');
            if (list) list.classList.remove('robot-drop');
        });
        panel.addEventListener('drop', (event) => this.robotOnDrop(event));
        panel.addEventListener('dragend', () => this.robotClearDropMarks());
        // Clicking outside closes it, but not the very right click that opened it.
        document.addEventListener('mousedown', () => {
            if (this.robotPanelOpen && performance.now() - this.robotOpenedAt > 300) this.robotClosePanel();
        });
        // Keys stay in the panel: typing in a field works, nothing reaches the game.
        window.addEventListener('keydown', (event) => {
            if (!this.robotPanelOpen) return;
            const typing = event.target && /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName);
            if (event.code === 'Escape' && !event.repeat) {
                this.robotClosePanel();
                event.preventDefault();
            } else if (!typing) {
                event.preventDefault();
            }
            event.stopImmediatePropagation();
        }, true);
    },

    robotEscape(text) {
        return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    robotRenderPalette() {
        const groups = [['move', 'Move'], ['dig', 'Dig'], ['build', 'Build'], ['control', 'Loops and choices'], ['other', 'More']];
        let html = '<div class="robot-hint">Click a block to add it where the dashed outline is (click inside a loop, or on empty space, to move the outline), or drag it into the program. Drag a block back here to delete it.</div>';
        groups.forEach(([category, title]) => {
            html += `<h4>${title}</h4>`;
            Object.entries(ROBOT_INSTRUCTIONS).forEach(([op, spec]) => {
                if (spec.category !== category) return;
                html += `<div class="robot-chip cat-${category}" draggable="true" data-op="${op}">${spec.label}${spec.lists ? ' { }' : ''}</div>`;
            });
        });
        this.robotPanel.querySelector('.robot-palette').innerHTML = html;
    },

    // All the blocks a robot could look for or place, by name.
    robotBlockOptions() {
        if (!this.robotBlockList) {
            this.robotBlockList = Object.keys(this.world.blockTypes)
                .filter((type) => type !== 'air' && !this.world.blockTypes[type].itemOnly)
                .map((type) => [type, this.getBlockDisplayName(type) || type])
                .sort((a, b) => a[1].localeCompare(b[1]));
        }
        return this.robotBlockList;
    },

    robotBlockSelect(field, value, allowAny) {
        let html = `<select data-field="${field}">`;
        if (allowAny) html += `<option value=""${value ? '' : ' selected'}>any block I carry</option>`;
        this.robotBlockOptions().forEach(([type, name]) => {
            html += `<option value="${type}"${type === value ? ' selected' : ''}>${this.robotEscape(name)}</option>`;
        });
        return `${html}</select>`;
    },

    robotNodeHtml(node) {
        const spec = ROBOT_INSTRUCTIONS[node.op];
        let params = '';
        if (node.op === 'repeat') params = `<input type="number" data-field="times" min="1" max="99" value="${node.times}"> times`;
        if (node.op === 'wait') params = `<input type="number" data-field="seconds" min="0.5" max="10" step="0.5" value="${node.seconds}"> s`;
        if (node.op === 'say') params = `<input type="text" data-field="text" maxlength="40" value="${this.robotEscape(node.text)}">`;
        if (node.block !== undefined) params = this.robotBlockSelect('block', node.block, true);
        if (node.cond) {
            const condSpec = ROBOT_CONDITIONS[node.cond.test];
            params = `<label><input type="checkbox" data-field="not"${node.cond.not ? ' checked' : ''}>not</label><select data-field="test">${
                Object.entries(ROBOT_CONDITIONS).map(([test, item]) => `<option value="${test}"${test === node.cond.test ? ' selected' : ''}>${item.label}</option>`).join('')
            }</select>${condSpec.block ? this.robotBlockSelect('condBlock', node.cond.block, false) : ''}`;
        }
        const lists = (spec.lists || []).map((list) => {
            const label = list === 'else' ? '<div class="robot-else">else</div>' : '';
            return `${label}${this.robotListHtml(node[list], `${node.id}:${list}`)}`;
        }).join('');
        return `<div class="robot-block cat-${spec.category}" data-id="${node.id}">
            <div class="robot-row"><span class="robot-grip" draggable="true" title="Drag to move">⠿ ${spec.label}</span>${params}<button type="button" class="robot-del" title="Delete">✕</button></div>
            ${lists}</div>`;
    },

    robotListHtml(list, key) {
        const target = this.robotTargetList === key ? ' robot-target' : '';
        const inner = list.length ? list.map((node) => this.robotNodeHtml(node)).join('') : '<div class="robot-empty">drop blocks here</div>';
        return `<div class="robot-list${target}" data-list="${key}">${inner}</div>`;
    },

    robotRenderProgram() {
        const robot = this.robotPanelRobot;
        if (!robot) return;
        if (!ROBOT_LOGIC.getList(robot.program, this.robotTargetList)) this.robotTargetList = 'root';
        const area = this.robotPanel.querySelector('.robot-program');
        const scroll = area.scrollTop;
        area.innerHTML = this.robotListHtml(robot.program, 'root');
        area.scrollTop = scroll;
        this.robotHighlight(robot);
    },

    robotHighlight(robot) {
        if (!this.robotPanelOpen || this.robotPanelRobot !== robot) return;
        this.robotPanel.querySelectorAll('.robot-current').forEach((element) => element.classList.remove('robot-current', 'robot-failed'));
        if (!robot.current) return;
        const element = this.robotPanel.querySelector(`.robot-block[data-id="${robot.current}"]`);
        if (!element) return;
        element.classList.add('robot-current');
        if (robot.error && robot.mode === 'idle') element.classList.add('robot-failed');
        const area = this.robotPanel.querySelector('.robot-program');
        const box = element.getBoundingClientRect();
        const view = area.getBoundingClientRect();
        if (box.top < view.top || box.top > view.bottom - 30) area.scrollTop += box.top - view.top - 40;
    },

    robotSetStatus(robot, text, isError = false) {
        robot.statusText = text;
        robot.statusError = isError;
        if (this.robotHudRobot === robot) this.robotUpdateHud();
        if (!this.robotPanelOpen || this.robotPanelRobot !== robot) return;
        const status = this.robotPanel.querySelector('.robot-status');
        status.textContent = text;
        status.classList.toggle('error', isError);
    },

    robotRefreshButtons() {
        const robot = this.robotPanelRobot;
        if (!this.robotPanelOpen || !robot) return;
        this.robotPanel.querySelector('.robot-run').textContent = robot.mode === 'paused' ? '▶ Resume' : '▶ Run';
    },

    robotRefreshInventory(robot) {
        if (!this.robotPanelOpen || this.robotPanelRobot !== robot) return;
        this.robotPanel.querySelector('.robot-inventory').innerHTML = robot.inventory.map((slot, index) => {
            if (!slot) return `<div class="robot-slot" data-slot="${index}"></div>`;
            const name = this.robotEscape(this.getBlockDisplayName(slot.type));
            return `<div class="robot-slot" data-slot="${index}" title="${name}"><img src="${this.world.getInventoryIconUrl(slot.type)}" alt="${name}"><span>${slot.count}</span></div>`;
        }).join('');
        // What you can give it: the blocks you carry.
        const select = this.robotPanel.querySelector('.robot-give-type');
        const previous = select.value;
        const options = Object.keys(this.inventoryCounts || {})
            .filter((type) => this.getInventoryCount(type) > 0 && this.robotCanPlace(type))
            .sort((a, b) => String(this.getBlockDisplayName(a)).localeCompare(String(this.getBlockDisplayName(b))));
        select.innerHTML = options.length
            ? options.map((type) => `<option value="${type}"${type === previous ? ' selected' : ''}>${this.robotEscape(this.getBlockDisplayName(type))} (${this.getInventoryCount(type)})</option>`).join('')
            : '<option value="">(you have no blocks)</option>';
    },

    robotOpenPanel(robot) {
        this.robotInstallPanel();
        this.robotPanelRobot = robot;
        this.robotPanelOpen = true;
        this.robotOpenedAt = performance.now();
        this.stopMining();
        this.closeChatInput();
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.robotPanel.querySelector('.robot-title').textContent = `🤖 ${robot.name}`;
        this.robotPanel.querySelector('.robot-speed').value = this.robotSpeed;
        this.robotTargetList = 'root';
        this.robotPanel.classList.add('visible');
        this.robotPanel.classList.toggle('robot-docked', robot.mode === 'paused');
        if (this.robotHud) this.robotHud.classList.remove('visible');
        this.robotRenderProgram();
        this.robotRefreshInventory(robot);
        this.robotRefreshButtons();
        this.robotSetStatus(robot, robot.statusText || 'Build a program, then press Run', Boolean(robot.statusError));
        this.updatePointerLockHint();
        this.playTone({ frequency: 620, endFrequency: 840, duration: 0.08, type: 'square', volume: 0.01, release: 0.06 });
    },

    robotClosePanel() {
        if (!this.robotPanelOpen) return;
        this.robotPanelOpen = false;
        this.robotPanel.classList.remove('visible', 'robot-docked');
        if (this.robotPanelRobot) this.robotSave();
        // A robot left running keeps its corner card.
        if (this.robotPanelRobot && this.robotPanelRobot.mode === 'running') this.robotHudRobot = this.robotPanelRobot;
        this.robotPanelRobot = null;
        if (this.robotHudRobot) this.robotUpdateHud();
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        this.recapturePointerLock();
        this.updatePointerLockHint();
    },

    // Editing the program stops a running robot (its place in the old program is gone).
    robotEdited(robot) {
        if (robot.mode !== 'idle') this.robotStop(robot, 'Program changed: stopped');
        robot.current = null;
        robot.error = null;
        this.robotSave();
    },

    robotAddNode(robot, op, listKey, index) {
        const node = ROBOT_LOGIC.newNode(op);
        const target = ROBOT_LOGIC.getList(robot.program, listKey) || { list: robot.program };
        const error = ROBOT_LOGIC.insert(robot.program, target.list === robot.program ? 'root' : listKey, index === undefined ? target.list.length : index, node);
        if (error) {
            this.robotSetStatus(robot, error, true);
            return;
        }
        // A new container becomes the place where the next clicks go.
        if (ROBOT_INSTRUCTIONS[op].lists) this.robotTargetList = `${node.id}:body`;
        this.robotEdited(robot);
        this.robotRenderProgram();
        this.playTone({ frequency: 880, duration: 0.03, type: 'triangle', volume: 0.01, release: 0.04 });
    },

    robotOnClick(event) {
        const robot = this.robotPanelRobot;
        if (!robot) return;
        const target = event.target;
        if (target.closest('.robot-close')) return this.robotClosePanel();
        if (target.closest('.robot-run')) return this.robotRun(robot);
        if (target.closest('.robot-step')) return this.robotStep(robot);
        if (target.closest('.robot-stop')) {
            if (robot.mode !== 'idle') this.robotStop(robot, 'Stopped');
            return undefined;
        }
        if (target.closest('.robot-clear')) {
            if (robot.program.length && window.confirm('Delete the whole program?')) {
                robot.program.length = 0;
                this.robotTargetList = 'root';
                this.robotEdited(robot);
                this.robotRenderProgram();
            }
            return undefined;
        }
        if (target.closest('.robot-take')) return this.robotTakeAll(robot);
        if (target.closest('.robot-give')) return this.robotGive(robot);
        const slot = target.closest('.robot-slot');
        if (slot) return this.robotTakeSlot(robot, Number(slot.dataset.slot));
        const chip = target.closest('.robot-chip');
        if (chip) return this.robotAddNode(robot, chip.dataset.op, this.robotTargetList);
        const del = target.closest('.robot-del');
        if (del) {
            const block = del.closest('.robot-block');
            ROBOT_LOGIC.remove(robot.program, block.dataset.id);
            this.robotEdited(robot);
            this.robotRenderProgram();
            return undefined;
        }
        // Clicking a list (not a field) makes it the place where palette clicks go.
        if (/^(INPUT|SELECT|OPTION|LABEL|BUTTON)$/.test(target.tagName)) return undefined;
        const block = target.closest('.robot-block');
        const list = target.closest('.robot-list');
        if (block && list && block.contains(list)) {
            this.robotTargetList = list.dataset.list;
        } else if (block) {
            // A click on a container's title row picks its body.
            const node = ROBOT_LOGIC.find(robot.program, block.dataset.id);
            if (node && ROBOT_INSTRUCTIONS[node.node.op].lists) this.robotTargetList = `${node.node.id}:body`;
            else return undefined;
        } else if (list) {
            this.robotTargetList = list.dataset.list;
        } else {
            return undefined;
        }
        this.robotPanel.querySelectorAll('.robot-target').forEach((element) => element.classList.remove('robot-target'));
        const chosen = this.robotPanel.querySelector(`.robot-list[data-list="${this.robotTargetList}"]`);
        if (chosen) chosen.classList.add('robot-target');
        return undefined;
    },

    robotOnChange(event) {
        const robot = this.robotPanelRobot;
        const target = event.target;
        if (!robot) return;
        if (target.classList.contains('robot-speed')) {
            this.robotSpeed = ROBOT_SPEEDS[target.value] ? target.value : 'normal';
            return;
        }
        const field = target.dataset.field;
        const block = target.closest('.robot-block');
        if (!field || !block) return;
        const found = ROBOT_LOGIC.find(robot.program, block.dataset.id);
        if (!found) return;
        const node = found.node;
        let rerender = false;
        if (field === 'times') node.times = Math.round(ROBOT_LOGIC.clamp(target.value, 1, 99, node.times));
        else if (field === 'seconds') node.seconds = Math.round(ROBOT_LOGIC.clamp(target.value, 0.5, 10, node.seconds) * 2) / 2;
        else if (field === 'text') node.text = target.value.slice(0, 40);
        else if (field === 'block') node.block = ROBOT_LOGIC.cleanBlock(target.value);
        else if (field === 'condBlock') node.cond.block = ROBOT_LOGIC.cleanBlock(target.value) || 'stone';
        else if (field === 'not') node.cond.not = target.checked;
        else if (field === 'test') {
            node.cond.test = ROBOT_CONDITIONS[target.value] ? target.value : 'ahead_solid';
            rerender = true;
        }
        if (event.type === 'change' && field !== 'text') {
            if (field === 'times' || field === 'seconds') target.value = node[field];
        }
        this.robotEdited(robot);
        if (rerender) this.robotRenderProgram();
    },

    robotOnDragStart(event) {
        const chip = event.target.closest && event.target.closest('.robot-chip');
        const grip = event.target.closest && event.target.closest('.robot-grip');
        let data = null;
        if (chip) data = `new:${chip.dataset.op}`;
        else if (grip) data = `move:${grip.closest('.robot-block').dataset.id}`;
        if (!data) return;
        this.robotDragData = data;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', data);
    },

    robotOnDragOver(event) {
        if (!this.robotDragData) return;
        const list = event.target.closest && event.target.closest('.robot-list');
        const palette = event.target.closest && event.target.closest('.robot-palette');
        if (!list && !(palette && this.robotDragData.startsWith('move:'))) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        this.robotClearDropMarks();
        if (list) list.classList.add('robot-drop');
    },

    robotClearDropMarks() {
        if (!this.robotPanel) return;
        this.robotPanel.querySelectorAll('.robot-drop').forEach((element) => element.classList.remove('robot-drop'));
    },

    robotOnDrop(event) {
        const robot = this.robotPanelRobot;
        const data = this.robotDragData;
        this.robotDragData = null;
        this.robotClearDropMarks();
        if (!robot || !data) return;
        event.preventDefault();
        const [kind, value] = data.split(':');
        if (event.target.closest('.robot-palette')) {
            if (kind === 'move') {
                ROBOT_LOGIC.remove(robot.program, value);
                this.robotEdited(robot);
                this.robotRenderProgram();
            }
            return;
        }
        const list = event.target.closest('.robot-list');
        if (!list) return;
        // Insert before the first block whose middle is below the pointer.
        const children = Array.from(list.children).filter((child) => child.classList.contains('robot-block'));
        let index = children.length;
        for (let i = 0; i < children.length; i++) {
            const box = children[i].getBoundingClientRect();
            if (event.clientY < box.top + box.height / 2) {
                index = i;
                break;
            }
        }
        if (kind === 'new') {
            this.robotAddNode(robot, value, list.dataset.list, index);
            return;
        }
        const found = ROBOT_LOGIC.find(robot.program, value);
        if (!found) return;
        const error = ROBOT_LOGIC.insert(robot.program, list.dataset.list, index, found.node);
        if (error) {
            this.robotSetStatus(robot, error, true);
            return;
        }
        this.robotEdited(robot);
        this.robotRenderProgram();
    },

    robotTakeSlot(robot, index) {
        const slot = robot.inventory[index];
        if (!slot) return;
        robot.inventory[index] = null;
        this.addInventory(slot.type, slot.count);
        this.playTone({ frequency: 760, duration: 0.04, type: 'triangle', volume: 0.012, release: 0.05 });
        this.robotRefreshInventory(robot);
        this.robotSave();
    },

    robotTakeAll(robot) {
        robot.inventory.forEach((slot, index) => {
            if (!slot) return;
            robot.inventory[index] = null;
            this.addInventory(slot.type, slot.count);
        });
        this.robotRefreshInventory(robot);
        this.robotSave();
    },

    robotGive(robot) {
        const type = this.robotPanel.querySelector('.robot-give-type').value;
        const wanted = Math.round(ROBOT_LOGIC.clamp(this.robotPanel.querySelector('.robot-give-amount').value, 1, ROBOT_STACK, 16));
        if (!type || !this.robotCanPlace(type)) return;
        const amount = Math.min(wanted, this.getInventoryCount(type), ROBOT_LOGIC.room(robot.inventory, type));
        if (amount <= 0) {
            this.robotSetStatus(robot, ROBOT_LOGIC.room(robot.inventory, type) <= 0 ? 'My inventory is full' : 'You have none of that', true);
            return;
        }
        ROBOT_LOGIC.add(robot.inventory, type, amount);
        this.inventoryCounts[type] = this.getInventoryCount(type) - amount;
        this.updateHotbarCounts();
        this.refreshHeldItemMesh();
        this.renderCraftingPanel();
        this.renderInventoryPanel();
        this.saveInventoryState();
        this.robotSetStatus(robot, `Thanks! I now carry ${ROBOT_LOGIC.count(robot.inventory, type)} ${this.getBlockDisplayName(type)}`);
        this.robotRefreshInventory(robot);
        this.robotSave();
    }
});

if (typeof module !== 'undefined') module.exports = { ROBOT_LOGIC, ROBOT_INSTRUCTIONS, ROBOT_CONDITIONS };
