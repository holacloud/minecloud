// Copper golem: a small friendly helper made of copper, BUILT by the player (never spawned by
// the world). Stubby body, big round glowing eyes, a lightning-rod antenna on its head and a
// copper coil on its back.
// - Craft a `copper_golem_core` (3 copper_block + 1 battery_block + 1 element_si, or the same
//   with a lithium `battery` instead of the battery block) and right click the top of a block
//   with it: the golem assembles there with a little animation. At most COPPER_GOLEM.limit per
//   player. Shift + right click packs it back into its core (with whatever it carries).
// - It runs on CHARGE: a full charge is about one game day (240 s) of work; standing still uses
//   much less. It recharges by itself next to a charged battery block (`battery_block:1` ..
//   `:4`) or any switched-on electric block (`...:on`), read from the block names the server
//   sets (js/game/electricity.js), or when you right click it with coal (+25 %) or a lithium
//   battery (+100 %). Under 20 % it walks slowly and its eyes dim; at 0 it sits down asleep
//   until it has 15 % again.
// - Modes (empty-handed right click cycles them): FOLLOW you, STAY, or WORK: it gathers the
//   item pickups lying within 8 blocks of the spot where you set it to work and brings them to
//   you (or piles them on that spot when you are far). Closed doors and gates in its way are
//   opened (and closed again behind it) through the normal toggle path, like a player does.
// - The copper wrench (`copper_wrench`): right click a door, gate or trapdoor and the nearest
//   awake golem walks there and opens / closes it. If the logic mod is present (a Game method
//   `logicPress` or the `logicPress` client→server message, see copperGolemPressFunction), it
//   also presses buttons and levers. Right click a golem with the wrench to read its status.
// - Patina: like real copper it reacts with the air, orange → brown → patchy → green verdigris
//   after 1, 3 and 6 game days (faster in the rain or in water). Right click it with honeycomb
//   to wax it (stops the patina); an axe scrapes off the wax, then one layer of patina.
// - Hitting it does no harm: it complains.
// Multiplayer: like the robot, the golem is client-side (kept in localStorage, other players do
// not see it); only what it does to blocks (doors, gates, buttons) goes through the server.
// COPPER_GOLEM_LOGIC is plain JS (no THREE, no DOM) so Node can test it.
// Mixed into Game.prototype; hooked through js/extensions.js.

const COPPER_GOLEM = {
    limit: 2,
    storageKey: 'minecloud-copper-golems',
    dayLength: 240,
    workDrain: 1 / 240, // charge per second while busy: a full charge is one game day of work
    idleDrain: 1 / 1200,
    chargeRate: 1 / 40, // charge per second next to power: full in 40 s
    lowCharge: 0.2,
    wakeCharge: 0.15,
    coalCharge: 0.25,
    batteryCharge: 1,
    speed: 2.2,
    followStart: 3.2,
    followStop: 2.2,
    teleport: 20,
    workRadius: 8,
    deliverRadius: 12,
    handOver: 1.8,
    carryStacks: 4,
    powerRadius: 2,
    patinaDays: [1, 3, 6],
    wetFactor: 3,
    taskRange: 32,
    assembleTime: 1.6
};
const COPPER_GOLEM_MODES = ['follow', 'stay', 'work'];
const COPPER_GOLEM_MODE_TEXT = { follow: 'following you', stay: 'staying here', work: 'working: gathering items' };
const COPPER_GOLEM_STAGES = ['shiny copper', 'tarnished brown', 'patchy patina', 'green verdigris'];
// Block names of buttons and levers the logic mod may add (pressed only if it is present).
const COPPER_GOLEM_PRESSABLE = ['lever', 'push_button', 'pressure_plate', 'button', 'stone_button', 'wooden_button'];
const COPPER_GOLEM_DOOR_SHAPES = ['door', 'fence_gate'];
const COPPER_GOLEM_TOGGLE_SHAPES = ['door', 'fence_gate', 'trapdoor'];
// Body, dark seams, light edges, patina spots; one palette per stage (the mob variant).
const COPPER_GOLEM_PALETTES = [
    { body: 0xd9793e, dark: 0xa4532a, light: 0xf3a36a, spot: null, coil: 0xf0a060 },
    { body: 0xa8653a, dark: 0x6f4024, light: 0xc98656, spot: 0x5a3a24, coil: 0xc07a48 },
    { body: 0x8e7650, dark: 0x5c4a30, light: 0xa88e62, spot: 0x5fa88a, coil: 0x9a8a5a },
    { body: 0x5fae95, dark: 0x3f8a74, light: 0x86cbb2, spot: 0x8a6a44, coil: 0x6cbca0 }
];

const COPPER_GOLEM_LOGIC = {
    // Patina stage 0..3 after `days` game days of weathering.
    patinaStage(days) {
        let stage = 0;
        COPPER_GOLEM.patinaDays.forEach((threshold, index) => { if (days >= threshold) stage = index + 1; });
        return stage;
    },

    // Seconds of weathering at which a stage starts.
    stageStart(stage) {
        return stage <= 0 ? 0 : COPPER_GOLEM.patinaDays[stage - 1] * COPPER_GOLEM.dayLength;
    },

    // Weathering seconds after `delta`: waxed copper does not change; rain or water speed it up.
    weather(seconds, delta, { waxed = false, wet = false } = {}) {
        if (waxed) return seconds;
        return seconds + delta * (wet ? COPPER_GOLEM.wetFactor : 1);
    },

    // Does a block name give power to a golem standing next to it? A charged battery
    // (`battery_block:1`..`:4`) or any switched-on block (`electric_lamp:on`...).
    isPowerBlock(type) {
        if (!type) return false;
        const [base, state] = String(type).split(':');
        if (base === 'battery_block') return Number(state) >= 1;
        return state === 'on';
    },

    // Charge after `delta` seconds: charging, busy or idle (asleep uses nothing).
    charge(charge, delta, { charging = false, busy = false, asleep = false } = {}) {
        let next = charge;
        if (charging) next += COPPER_GOLEM.chargeRate * delta;
        else if (!asleep) next -= (busy ? COPPER_GOLEM.workDrain : COPPER_GOLEM.idleDrain) * delta;
        return Math.min(1, Math.max(0, next));
    },

    nextMode(mode) {
        const index = COPPER_GOLEM_MODES.indexOf(mode);
        return COPPER_GOLEM_MODES[(index + 1) % COPPER_GOLEM_MODES.length];
    },

    isPressable(type) {
        if (!type) return false;
        const base = String(type).split(':')[0];
        return COPPER_GOLEM_PRESSABLE.includes(base) || /_button$/.test(base);
    },

    // Adds `amount` of `type` to a carried load (at most COPPER_GOLEM.carryStacks kinds).
    // Returns false when a new kind does not fit.
    carry(load, type, amount) {
        const stack = load.find((entry) => entry.type === type);
        if (stack) {
            stack.amount += amount;
            return true;
        }
        if (load.length >= COPPER_GOLEM.carryStacks) return false;
        load.push({ type, amount });
        return true;
    },

    // A saved golem, cleaned up (or null when unusable).
    clean(entry) {
        if (!entry || ![entry.x, entry.y, entry.z].every(Number.isFinite)) return null;
        const number = (value, min, max, fallback) => (Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback);
        const base = entry.base && [entry.base.x, entry.base.y, entry.base.z].every(Number.isFinite)
            ? { x: entry.base.x, y: entry.base.y, z: entry.base.z } : null;
        const load = Array.isArray(entry.carry) ? entry.carry
            .filter((stack) => stack && typeof stack.type === 'string' && /^[a-z0-9_:]{1,48}$/.test(stack.type) && stack.amount > 0)
            .slice(0, COPPER_GOLEM.carryStacks)
            .map((stack) => ({ type: stack.type, amount: Math.min(999, Math.floor(stack.amount)) })) : [];
        return {
            x: entry.x, y: entry.y, z: entry.z,
            mode: COPPER_GOLEM_MODES.includes(entry.mode) ? entry.mode : 'follow',
            charge: number(entry.charge, 0, 1, 1),
            patina: number(entry.patina, 0, 1e7, 0),
            waxed: Boolean(entry.waxed),
            base,
            carry: load
        };
    }
};

const COPPER_GOLEM_CORE_SPRITE = [
    '...cccccc...',
    '..cCCCCCCc..',
    '.cCCooooCCc.',
    '.cCoEEEEoCc.',
    'cCCoEeeEoCCc',
    'cCCoEeeEoCCc',
    'cCCoEEEEoCCc',
    '.cCCooooCCc.',
    '.cCCCCCCCCc.',
    '..cCbCCbCc..',
    '...cbbbbc...',
    '....cccc....'
];
const COPPER_GOLEM_WRENCH_SPRITE = [
    '........cc..',
    '.......cCc.c',
    '......cCCccC',
    '......cCCCCc',
    '.....cCCCcc.',
    '....cCCc....',
    '...cCCc.....',
    '..cCCc......',
    '.cCCc.......',
    'cCCc........',
    'cCc.........',
    '.c..........'
];

// ---------------------------------------------------------------------------------------
// Species and model

if (typeof MOB_SPECIES !== 'undefined') {
    // No spawnBiomes: it never appears by itself. maxHealth 1: no health pool (hits do no harm).
    MOB_SPECIES.copper_golem = { eggColor: 0xd9793e, tone: 520, speed: COPPER_GOLEM.speed, variants: 4, group: [1, 1], limit: COPPER_GOLEM.limit, movement: 'copper_helper' };
}

if (typeof VoxelModels !== 'undefined') {
    VoxelModels.MOB_SURFACES.copper_golem = 'smooth';

    // Faces +z. The variant is the patina stage (0 shiny .. 3 verdigris).
    VoxelModels.mobBuilders.copper_golem = function (b, variant = 0) {
        const c = COPPER_GOLEM_PALETTES[variant % COPPER_GOLEM_PALETTES.length];
        const metal = (spots, seed) => ({ color: c.body, noise: 0.07, all: (p, face) => {
            p.spots(c.light, 2, 0.5, 1, seed);
            if (c.spot) p.spots(c.spot, spots, 0.6, 1.8, seed + 5);
            if (face !== 'top' && face !== 'bottom') p.rect(0, p.h - 0.6, p.w, 0.6, c.dark, 0.03);
        } });
        b.part('body', { pivot: [0, 4, 0], from: [-4, 0, -3], size: [8, 6, 6], paint: {
            ...metal(4, 1),
            faces: { front: (p) => {
                // A riveted belly plate.
                p.rect(1.5, 1, 5, 3.5, c.light, 0.04);
                [[1.8, 1.3], [5.7, 1.3], [1.8, 3.7], [5.7, 3.7]].forEach(([x, y]) => p.rect(x, y, 0.5, 0.5, c.dark, 0));
            } }
        } });
        // The copper coil on its back: windings of bright wire round a dark core.
        b.part('coil', { parent: 'body', pivot: [0, 3, -3], from: [-2.5, -2.5, -2], size: [5, 5, 2], paint: { color: c.coil, noise: 0.04, all: (p, face) => {
            if (face === 'back' || face === 'front') {
                for (let y = 0.25; y < p.h; y += 1) p.rect(0, y, p.w, 0.45, c.dark, 0.02);
                p.rect(p.w / 2 - 0.75, p.h / 2 - 0.75, 1.5, 1.5, 0x3a2a20, 0);
            } else {
                for (let x = 0.25; x < p.w; x += 1) p.rect(x, 0, 0.45, p.h, c.dark, 0.02);
            }
        } } });
        b.part('head', { parent: 'body', pivot: [0, 6, 0], from: [-4, 0, -3.5], size: [8, 6, 7], paint: {
            ...metal(3, 9),
            faces: { front: (p) => {
                // Dark round sockets for the glowing eyes (added as meshes) and a little mouth grille.
                [[1, 1.4], [4.6, 1.4]].forEach(([x, y]) => {
                    p.rect(x + 0.4, y, 1.6, 2.4, 0x1d1a18, 0);
                    p.rect(x, y + 0.4, 2.4, 1.6, 0x1d1a18, 0);
                });
                for (let x = 2.6; x < 5.4; x += 0.9) p.rect(x, 4.4, 0.5, 0.8, c.dark, 0);
                p.rect(0, 0, p.w, 0.7, c.light, 0.03);
            } }
        } });
        b.part('antenna', { parent: 'head', pivot: [0, 6, 0], from: [-0.5, 0, -0.5], size: [1, 4, 1], paint: { color: c.dark, noise: 0.03 } });
        b.part('antennaTip', { parent: 'antenna', pivot: [0, 4, 0], from: [-1, 0, -1], size: [2, 2, 2], paint: { color: 0xf2c060, noise: 0.03 } });
        [['L', 1], ['R', -1]].forEach(([side, sign]) => {
            b.part(`leg${side}`, { pivot: [2 * sign, 4, 0], from: [-1.5, -4, -1.5], size: [3, 4, 3], paint: metal(1, 20 + sign) });
            b.part(`foot${side}`, { parent: `leg${side}`, pivot: [0, -4, 0], from: [-1.7, 0, -1.4], size: [3.4, 1, 3.6], paint: { color: c.dark, noise: 0.05 } });
            b.part(`arm${side}`, { parent: 'body', pivot: [5 * sign, 5.5, 0], from: [-1, -5, -1], size: [2, 5, 2], paint: metal(1, 30 + sign) });
            b.part(`hand${side}`, { parent: `arm${side}`, pivot: [0, -5, 0], from: [-1.25, -1.5, -1.25], size: [2.5, 1.5, 2.5], paint: { color: c.dark, noise: 0.05 } });
        });
        return { legs: ['legL', 'legR'], arms: ['armL', 'armR'], head: 'head' };
    };
}

// ---------------------------------------------------------------------------------------
// Items, recipes and hooks

if (typeof registerItemType === 'function' && typeof Game !== 'undefined') {
    registerItemType('copper_golem_core', {
        color: 0xd9793e, name: 'Copper Golem Core',
        drawIcon: resourcesDrawSprite(COPPER_GOLEM_CORE_SPRITE, {
            C: 0xd9793e, c: 0x8a4a22, o: 0xf2b37a, E: 0x5fe8ff, e: 0xd8fbff, b: 0x3a3f46
        }),
        displayMesh: resourcesDisplayMesh
    });
    registerItemType('copper_wrench', {
        color: 0xd9793e, name: 'Copper Wrench',
        drawIcon: resourcesDrawSprite(COPPER_GOLEM_WRENCH_SPRITE, { C: 0xe08a4a, c: 0x8a4a22 }),
        displayMesh: resourcesDisplayMesh
    });

    registerGameContent(function ({ addRecipe }) {
        addRecipe('copper_golem_core', 'Build Copper Golem Core', 'copper_golem_core', 1, [
            { type: 'copper_block', amount: 3 }, { type: 'battery_block', amount: 1 }, { type: 'element_si', amount: 1 }
        ]);
        addRecipe('copper_golem_core_lithium', 'Build Copper Golem Core (Lithium)', 'copper_golem_core', 1, [
            { type: 'copper_block', amount: 3 }, { type: 'battery', amount: 1 }, { type: 'element_si', amount: 1 }
        ]);
        addRecipe('copper_wrench', 'Forge Copper Wrench', 'copper_wrench', 1, [
            { type: 'copper_block', amount: 1 }, { type: 'iron_ore', amount: 1 }
        ]);
    });

    registerMobBehaviour('copper_helper', {
        update(mob, delta, player) {
            this.copperGolemUpdate(mob, delta, player);
        },
        interact(mob) {
            this.copperGolemHit(mob);
        },
        spawnCommand(species, x, z, player) {
            const floor = this.cameraController.getFloorY(x, z, player.y + 4);
            if (floor <= -20) {
                this.receiveSystemMessage({ text: 'Could not find safe ground for the copper golem' });
                return true;
            }
            this.copperGolemBuild(new THREE.Vector3(x, floor, z));
            return true;
        },
        spawnEgg(species, position) {
            const floor = this.cameraController.getFloorY(position.x + 0.5, position.z + 0.5, position.y + 4);
            if (this.copperGolemBuild(new THREE.Vector3(position.x + 0.5, Math.max(position.y, floor), position.z + 0.5))) {
                this.consumeSelectedBlock();
                this.placeActionTimer = 0.35;
            }
            return true;
        }
    });

    // Its own clicks go before taming, traps and the rest (they do not know it).
    MOB_USE_HANDLERS.unshift(function (mob, item) {
        if (mob.userData.species !== 'copper_golem') return false;
        return this.copperGolemUse(mob, item);
    });

    // The core and the wrench take the right click before anything that would use the block
    // (the wrench on a door must not just open it by hand).
    ITEM_USE_HANDLERS.unshift(function (item, hit) {
        if (item === 'copper_golem_core') {
            if (!hit) return false;
            this.copperGolemPlaceCore(hit);
            return true;
        }
        if (item === 'copper_wrench') return this.copperGolemWrench(hit);
        return false;
    });

    registerFrameUpdate(function (delta) {
        this.copperGolemTick(delta);
    });

    onMobEvent('removed', function (mob) {
        if (mob.userData.species !== 'copper_golem') return;
        this.copperGolemSetCarryMesh(mob, null);
    });
}

const _copperA = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;

if (typeof Game !== 'undefined') Object.assign(Game.prototype, {
    // ---- Building, packing and saving --------------------------------------------------

    copperGolemList() {
        return (this.ambientMobs || []).filter((mob) => mob.userData.species === 'copper_golem');
    },

    copperGolemCount() {
        return this.copperGolemList().length + (this.copperGolemPending ? this.copperGolemPending.length : 0);
    },

    // A new golem assembles at `position` (feet). Returns it, or null over the limit.
    copperGolemBuild(position) {
        if (this.copperGolemCount() >= COPPER_GOLEM.limit) {
            this.receiveSystemMessage({ text: `You can have at most ${COPPER_GOLEM.limit} copper golems: Shift + right click one to pack it up` });
            return null;
        }
        const player = this.getLocalPlayerPosition();
        const mob = this.copperGolemCreate(position, { mode: 'follow', charge: 1, patina: 0 });
        mob.userData.copper.assemble = COPPER_GOLEM.assembleTime;
        mob.userData.facing = Math.atan2(player.z - position.z, player.x - position.x);
        mob.rotation.y = Math.PI / 2 - mob.userData.facing;
        mob.scale.setScalar(0.05);
        this.playTone({ frequency: 220, endFrequency: 880, duration: 1.2, type: 'triangle', volume: 0.018, attack: 0.1, release: 0.3 });
        this.receiveSystemMessage({ text: 'A copper golem assembles! Right click it to switch modes, Shift + right click to pack it up' });
        this.copperGolemSave();
        return mob;
    },

    copperGolemCreate(position, saved) {
        const state = COPPER_GOLEM_LOGIC.clean({ x: position.x, y: position.y, z: position.z, ...saved }) || {};
        const stage = COPPER_GOLEM_LOGIC.patinaStage(state.patina / COPPER_GOLEM.dayLength);
        const mob = this.createMob('copper_golem', position, { variant: stage });
        mob.userData.facing = mob.userData.direction;
        mob.userData.copper = {
            mode: state.mode || 'follow',
            charge: state.charge ?? 1,
            patina: state.patina || 0,
            waxed: Boolean(state.waxed),
            base: state.base ? new THREE.Vector3(state.base.x, state.base.y, state.base.z) : position.clone(),
            carry: state.carry || [],
            asleep: (state.charge ?? 1) <= 0,
            charging: false, scanTimer: 0, searchTimer: 0, velocityY: 0,
            target: null, task: null, opened: [], ignored: new Map(),
            stuck: 0, lastPosition: position.clone(), assemble: 0, hurt: 0, sleepBlend: 0, swing: 0,
            speech: { group: mob, bubble: null, bubbleTime: 0 }, lowWarned: (state.charge ?? 1) < COPPER_GOLEM.lowCharge
        };
        this.ambientMobs.push(mob);
        this.copperGolemSetCarryMesh(mob, mob.userData.copper.carry[0] ? mob.userData.copper.carry[0].type : null);
        return mob;
    },

    copperGolemPlaceCore(hit) {
        this.placeActionTimer = 0.35;
        const block = this.world.getBlockPositionFromIntersection(hit);
        if (!block || !hit.face || hit.face.normal.y < 0.5) {
            this.receiveSystemMessage({ text: 'Put the golem core on top of a block' });
            return;
        }
        const cell = { x: block.x, y: block.y + 1, z: block.z };
        if (this.world.hasSolidBlock(cell.x, cell.y, cell.z) || this.world.hasSolidBlock(cell.x, cell.y + 1, cell.z)
            || this.world.getBlockTypeAt(cell.x, cell.y, cell.z) === 'water') {
            this.receiveSystemMessage({ text: 'There is no room for a copper golem there' });
            return;
        }
        if (this.cameraController.intersectsBody(this.getLocalPlayerPosition(), cell.x, cell.y, cell.z, 1)) {
            this.receiveSystemMessage({ text: 'You are standing there: step back to build the golem' });
            return;
        }
        if (this.copperGolemCount() >= COPPER_GOLEM.limit) {
            this.receiveSystemMessage({ text: `You can have at most ${COPPER_GOLEM.limit} copper golems: Shift + right click one to pack it up` });
            return;
        }
        const floor = this.cameraController.getFloorY(cell.x + 0.5, cell.z + 0.5, cell.y + 0.5);
        if (!this.consumeSelectedBlock()) return;
        this.copperGolemBuild(new THREE.Vector3(cell.x + 0.5, floor > -20 ? floor : cell.y, cell.z + 0.5));
        this.lastSelectionUpdate = 0;
    },

    // Shift + right click: back into a core, with its load.
    copperGolemPack(mob) {
        const g = mob.userData.copper;
        this.addInventory('copper_golem_core');
        g.carry.forEach((stack) => this.addInventory(stack.type, stack.amount));
        this.copperGolemCloseDoors(mob, true);
        this.removeMob(mob);
        this.playTone({ frequency: 880, endFrequency: 220, duration: 0.5, type: 'triangle', volume: 0.016, release: 0.2 });
        this.receiveSystemMessage({ text: 'The copper golem folds back into its core' + (g.carry.length ? ' (you got what it carried)' : '') });
        this.copperGolemSave();
    },

    copperGolemTick(delta) {
        if (!this.world || !this.scene || !this.ambientMobs || !this.cameraController) return;
        if (!this.copperGolemStarted) this.copperGolemStart();
        this.copperGolemRestore();
        this.copperGolemSaveTimer = (this.copperGolemSaveTimer ?? 5) - delta;
        if (this.copperGolemSaveTimer <= 0) this.copperGolemSave();
    },

    copperGolemStart() {
        this.copperGolemStarted = true;
        try {
            const saved = JSON.parse(window.localStorage.getItem(COPPER_GOLEM.storageKey) || '[]');
            this.copperGolemPending = Array.isArray(saved) ? saved.map((entry) => COPPER_GOLEM_LOGIC.clean(entry)).filter(Boolean).slice(0, COPPER_GOLEM.limit) : [];
        } catch (_error) {
            this.copperGolemPending = [];
        }
        window.addEventListener('beforeunload', () => this.copperGolemSave());
    },

    // Saved golems come back once the ground under them has loaded.
    copperGolemRestore() {
        if (!this.copperGolemPending || !this.copperGolemPending.length) return;
        this.copperGolemPending = this.copperGolemPending.filter((entry) => {
            const { chunkX, chunkZ } = this.world.getChunkCoords(entry.x, entry.z);
            if (!this.world.generatedChunks.has(this.world.chunkKey(chunkX, chunkZ))) return true;
            let floor = this.cameraController.getFloorY(entry.x, entry.z, entry.y + 1);
            if (floor <= -20) floor = this.cameraController.getFloorY(entry.x, entry.z, 256);
            if (floor <= -20) return true;
            this.copperGolemCreate(new THREE.Vector3(entry.x, floor, entry.z), entry);
            return false;
        });
    },

    copperGolemSave() {
        this.copperGolemSaveTimer = 5;
        if (!this.copperGolemStarted || !this.ambientMobs) return;
        const round = (value) => Math.round(value * 100) / 100;
        const live = this.copperGolemList().map((mob) => {
            const g = mob.userData.copper;
            return {
                x: round(mob.position.x), y: round(mob.position.y), z: round(mob.position.z),
                mode: g.mode, charge: round(g.charge), patina: Math.round(g.patina), waxed: g.waxed,
                base: { x: round(g.base.x), y: round(g.base.y), z: round(g.base.z) },
                carry: g.carry
            };
        });
        try {
            window.localStorage.setItem(COPPER_GOLEM.storageKey, JSON.stringify(live.concat(this.copperGolemPending || [])));
        } catch (_error) {
            // Storage unavailable: golems just won't survive a reload.
        }
    },

    // ---- Clicks ------------------------------------------------------------------------

    copperGolemUse(mob, item) {
        const g = mob.userData.copper;
        if (!g) return false;
        this.placeActionTimer = 0.35;
        if (this.cameraController.isCrouching) {
            this.copperGolemPack(mob);
            return true;
        }
        const def = item && this.world.blockTypes[item];
        if (item === 'coal_ore' || item === 'battery') {
            if (g.charge >= 0.99) {
                this.copperGolemSay(mob, 'I am full, thanks!');
                return true;
            }
            if (!this.consumeSelectedBlock()) return true;
            this.copperGolemAddCharge(mob, item === 'battery' ? COPPER_GOLEM.batteryCharge : COPPER_GOLEM.coalCharge);
            return true;
        }
        if (item === 'honeycomb') {
            if (g.waxed) {
                this.copperGolemSay(mob, 'I am already waxed');
                return true;
            }
            if (!this.consumeSelectedBlock()) return true;
            g.waxed = true;
            this.copperGolemSparkle(mob, false);
            this.copperGolemSay(mob, 'Waxed! I will stay this colour');
            this.receiveSystemMessage({ text: 'The wax keeps air and water off the copper: its patina stops here' });
            this.copperGolemSave();
            return true;
        }
        if (def && def.toolType === 'axe') {
            this.copperGolemScrape(mob);
            return true;
        }
        if (item === 'copper_wrench') {
            this.copperGolemStatus(mob);
            return true;
        }
        // Anything else (or an empty hand) switches its mode.
        this.copperGolemSetMode(mob, COPPER_GOLEM_LOGIC.nextMode(g.mode));
        return true;
    },

    copperGolemSetMode(mob, mode) {
        const g = mob.userData.copper;
        g.mode = mode;
        g.target = null;
        g.task = null;
        if (mode === 'work') g.base = mob.position.clone();
        const lines = { follow: 'Right behind you!', stay: 'I will wait here', work: 'Gathering things around here!' };
        this.copperGolemSay(mob, g.asleep ? 'Zzz... (charge me first)' : lines[mode]);
        this.copperGolemChirp(mode === 'stay' ? 0.8 : mode === 'work' ? 1.2 : 1);
        this.receiveSystemMessage({ text: `Copper golem: ${COPPER_GOLEM_MODE_TEXT[mode]}${mode === 'work' ? ` (within ${COPPER_GOLEM.workRadius} blocks of this spot)` : ''}. Charge ${Math.round(g.charge * 100)} %` });
        this.copperGolemSave();
    },

    copperGolemStatus(mob) {
        const g = mob.userData.copper;
        const stage = COPPER_GOLEM_STAGES[mob.userData.variant] || COPPER_GOLEM_STAGES[0];
        const items = g.carry.reduce((sum, stack) => sum + stack.amount, 0);
        const state = g.asleep ? 'asleep' : COPPER_GOLEM_MODE_TEXT[g.mode];
        this.receiveSystemMessage({ text: `Copper golem: ${state} · charge ${Math.round(g.charge * 100)} %${g.charging ? ' (charging)' : ''} · ${stage}${g.waxed ? ', waxed' : ''}${items ? ` · carrying ${items} item${items === 1 ? '' : 's'}` : ''}` });
        this.copperGolemChirp(1.1);
    },

    copperGolemAddCharge(mob, amount) {
        const g = mob.userData.copper;
        g.charge = Math.min(1, g.charge + amount);
        if (g.charge >= COPPER_GOLEM.lowCharge) g.lowWarned = false;
        this.copperGolemSparkle(mob, true);
        this.playTone({ frequency: 300, endFrequency: 1200, duration: 0.35, type: 'sawtooth', volume: 0.012, release: 0.15 });
        if (g.asleep && g.charge >= COPPER_GOLEM.wakeCharge) this.copperGolemWake(mob);
        else this.copperGolemSay(mob, `Charge ${Math.round(g.charge * 100)} %`);
        this.copperGolemSave();
    },

    // An axe takes the wax off first, then one layer of patina.
    copperGolemScrape(mob) {
        const g = mob.userData.copper;
        if (g.waxed) {
            g.waxed = false;
            this.copperGolemSay(mob, 'The wax is off: I will weather again');
        } else if (mob.userData.variant > 0) {
            g.patina = COPPER_GOLEM_LOGIC.stageStart(mob.userData.variant - 1);
            this.copperGolemSetStage(mob, mob.userData.variant - 1);
            this.copperGolemSay(mob, 'That tickles! Shinier now');
        } else {
            this.copperGolemSay(mob, 'I am as shiny as I get!');
            return;
        }
        this.copperGolemSparkle(mob, true);
        this.playNoiseBurst({ duration: 0.2, volume: 0.02, highpass: 2000, lowpass: 7000 });
        this.copperGolemSave();
    },

    copperGolemHit(mob) {
        const g = mob.userData.copper;
        if (!g || g.assemble > 0) return;
        g.hurt = 0.5;
        const lines = ['Ouch! I am on your side!', 'Hey! That dents my copper', 'Why? I am helping!', 'Bonk! Please, no hitting'];
        this.copperGolemSay(mob, g.asleep ? 'Zzz... huh?' : lines[Math.floor(Math.random() * lines.length)]);
        this.playTone({ frequency: 520, endFrequency: 300, duration: 0.18, type: 'square', volume: 0.014, release: 0.1 });
        this.playNoiseBurst({ duration: 0.05, volume: 0.016, highpass: 1500, lowpass: 6000 });
    },

    // The copper wrench: send the nearest awake golem to open / close a door, gate or trapdoor,
    // or to press a button or lever when the logic mod is there.
    copperGolemWrench(hit) {
        if (!hit) return false;
        const cell = this.world.getBlockPositionFromIntersection(hit);
        if (!cell) return false;
        this.placeActionTimer = 0.35;
        const type = this.world.getBlockTypeAt(cell.x, cell.y, cell.z);
        const def = type && this.world.blockTypes[type];
        let kind = null;
        if (def && def.shape && COPPER_GOLEM_TOGGLE_SHAPES.includes(def.shape) && def.opensByHand !== false) kind = 'toggle';
        else if (COPPER_GOLEM_LOGIC.isPressable(type) && this.copperGolemPressFunction()) kind = 'press';
        if (!kind) {
            this.receiveSystemMessage({ text: this.copperGolemPressFunction()
                ? 'Point the wrench at a door, gate, trapdoor, button or lever for your copper golem'
                : 'Point the wrench at a door, gate or trapdoor for your copper golem to open or close' });
            return true;
        }
        const center = new THREE.Vector3(cell.x + 0.5, cell.y, cell.z + 0.5);
        const golems = this.copperGolemList().filter((mob) => mob.userData.copper && !mob.userData.copper.asleep && mob.userData.copper.assemble <= 0
            && mob.position.distanceTo(center) <= COPPER_GOLEM.taskRange);
        if (golems.length === 0) {
            const any = this.copperGolemList().length > 0;
            this.receiveSystemMessage({ text: any ? `No awake copper golem within ${COPPER_GOLEM.taskRange} blocks` : 'You have no copper golem yet: build one with a copper golem core' });
            return true;
        }
        golems.sort((a, b) => a.position.distanceTo(center) - b.position.distanceTo(center));
        const mob = golems[0];
        mob.userData.copper.task = { cell: { ...cell }, kind, timer: 25 };
        mob.userData.copper.target = null;
        this.copperGolemSay(mob, kind === 'press' ? 'On my way to press it!' : 'On my way!');
        this.copperGolemChirp(1.2);
        return true;
    },

    // The logic mod's press, if it is loaded: a Game method, or else the logicPress message
    // when its blocks are known on this client. Null when there is no logic mod.
    copperGolemPressFunction() {
        if (typeof this.logicPress === 'function') return (cell) => this.logicPress({ x: cell.x, y: cell.y, z: cell.z });
        const logicLoaded = typeof LOGIC_KINDS !== 'undefined'
            || (typeof ELECTRIC_KINDS !== 'undefined' && Object.values(ELECTRIC_KINDS).some((kind) => kind.role === 'logic'));
        if (logicLoaded && this.network && this.network.connected) {
            return (cell) => this.network.send('logicPress', { x: cell.x, y: cell.y, z: cell.z });
        }
        return null;
    },

    // Opens or closes a door, gate or trapdoor for everyone, as joineryToggle does for the
    // player, but looking along `look` (the golem's heading) instead of the player's view.
    copperGolemToggle(cell, look) {
        const type = this.world.getBlockTypeAt(cell.x, cell.y, cell.z);
        const def = type && this.world.blockTypes[type];
        const shape = def && def.shape ? BLOCK_SHAPES[def.shape] : null;
        if (!shape || !shape.toggle || def.opensByHand === false) return false;
        const base = def.variantOf || type;
        const next = shape.toggle(def.state, { look });
        const nextType = next && this.world.getShapeStateType(base, next);
        if (!nextType) return false;
        const updates = [{ x: cell.x, y: cell.y, z: cell.z, blockType: nextType }];
        const changed = Object.keys(next).filter((key) => next[key] !== def.state[key]);
        for (const [dx, dy, dz] of shape.linked ? shape.linked(def.state) : []) {
            const other = { x: cell.x + dx, y: cell.y + dy, z: cell.z + dz };
            const otherType = this.world.getBlockTypeAt(other.x, other.y, other.z);
            const otherDef = otherType && this.world.blockTypes[otherType];
            if (!otherDef || (otherDef.variantOf || otherType) !== base) continue;
            const otherNext = { ...otherDef.state };
            changed.forEach((key) => { otherNext[key] = next[key]; });
            const otherNextType = this.world.getShapeStateType(base, otherNext);
            if (otherNextType) updates.push({ ...other, blockType: otherNextType });
        }
        updates.forEach((update) => {
            this.world.addBlock(update);
            if (this.network && this.network.connected) this.network.send('blockPlace', update);
        });
        this.playNoiseBurst({ duration: 0.14, volume: 0.025, highpass: 300, lowpass: 1600 });
        this.lastSelectionUpdate = 0;
        return true;
    },

    copperGolemDoorState(cell) {
        const type = this.world.getBlockTypeAt(cell.x, cell.y, cell.z);
        const def = type && this.world.blockTypes[type];
        if (!def || !def.shape || !def.state || def.opensByHand === false) return null;
        return { shape: def.shape, open: def.state.open === 'open', half: def.state.half };
    },

    // ---- Every frame -------------------------------------------------------------------

    copperGolemUpdate(mob, delta, player) {
        const data = mob.userData;
        if (!data.copper) {
            // Made some other way (not through copperGolemCreate): give it a fresh state.
            this.removeMob(mob);
            this.copperGolemCreate(mob.position.clone(), { charge: 1 });
            return;
        }
        const g = data.copper;
        data.life += delta;
        this.copperGolemAttachGlow(mob);
        g.hurt = Math.max(0, g.hurt - delta);

        if (g.assemble > 0) {
            this.copperGolemAssemble(mob, delta);
            this.copperGolemPose(mob, delta, false);
            this.copperGolemUpdateGlow(mob);
            this.copperGolemUpdateSpeech(mob, delta);
            return;
        }

        // Power around it, once a second.
        g.scanTimer -= delta;
        if (g.scanTimer <= 0) {
            g.scanTimer = 1;
            const was = g.charging;
            g.charging = g.charge < 1 && this.copperGolemNearPower(mob);
            if (g.charging && !was && g.charge < 0.9) this.copperGolemSay(mob, 'Charging... mmm, electrons');
        }

        // Patina: faster when wet.
        const wet = this.weatherState === 'rain' || this.findWaterSurface(mob.position.x, mob.position.y + 0.3, mob.position.z) !== null;
        g.patina = COPPER_GOLEM_LOGIC.weather(g.patina, delta, { waxed: g.waxed, wet });
        const stage = COPPER_GOLEM_LOGIC.patinaStage(g.patina / COPPER_GOLEM.dayLength);
        if (stage !== data.variant) this.copperGolemSetStage(mob, stage, true);

        let moved = false;
        let busy = false;
        if (!g.asleep) {
            const result = this.copperGolemBehave(mob, delta, player);
            moved = result.moved;
            busy = result.busy || moved;
        }
        g.charge = COPPER_GOLEM_LOGIC.charge(g.charge, delta, { charging: g.charging, busy, asleep: g.asleep });
        if (g.charging && g.asleep && g.charge >= COPPER_GOLEM.wakeCharge) this.copperGolemWake(mob);
        if (!g.asleep && g.charge <= 0) this.copperGolemFallAsleep(mob);
        if (!g.asleep && !g.lowWarned && g.charge < COPPER_GOLEM.lowCharge) {
            g.lowWarned = true;
            this.copperGolemSay(mob, 'My battery is low...');
        }
        if (g.charge >= COPPER_GOLEM.lowCharge + 0.05) g.lowWarned = false;

        this.copperGolemFall(mob, delta);
        this.copperGolemCloseDoors(mob, false);
        if (!moved && g.lookAt) g.facing = g.lookAt;
        mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.PI / 2 - data.facing, Math.min(1, delta * 8));
        this.copperGolemPose(mob, delta, moved);
        this.copperGolemUpdateGlow(mob);
        this.copperGolemUpdateSpeech(mob, delta);
    },

    copperGolemAssemble(mob, delta) {
        const g = mob.userData.copper;
        g.assemble = Math.max(0, g.assemble - delta);
        const t = 1 - g.assemble / COPPER_GOLEM.assembleTime;
        // Ease out with a little overshoot, spinning into place.
        const k = 1.70158;
        const s = 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2);
        mob.scale.setScalar(Math.max(0.05, s));
        mob.rotation.y = Math.PI / 2 - mob.userData.facing + (1 - t) * (1 - t) * Math.PI * 4;
        g.sparkTimer = (g.sparkTimer || 0) - delta;
        if (g.sparkTimer <= 0) {
            g.sparkTimer = 0.2;
            this.copperGolemSparkle(mob, true);
        }
        if (g.assemble <= 0) {
            mob.scale.setScalar(1);
            this.copperGolemChirp(1);
            this.copperGolemSay(mob, 'Hello! Right click me to change what I do');
        }
    },

    copperGolemSetStage(mob, stage, announce = false) {
        const data = mob.userData;
        if (data.variant === stage) return;
        data.variant = stage;
        this.attachMobModel(mob);
        this.copperGolemAttachGlow(mob);
        this.copperGolemSetCarryMesh(mob, data.copper.carry[0] ? data.copper.carry[0].type : null, true);
        if (!announce) return;
        const player = this.getLocalPlayerPosition();
        if (Math.hypot(player.x - mob.position.x, player.z - mob.position.z) > 48) return;
        const text = [
            null,
            'Your copper golem is turning brown: copper reacts with the oxygen in the air (copper oxide)',
            'Green spots appear on your copper golem: water and carbon dioxide join in',
            'Your copper golem is green verdigris now, like the Statue of Liberty (copper carbonate). Wax it with honeycomb to keep a colour; an axe scrapes it back'
        ][stage];
        if (text) this.receiveSystemMessage({ text });
    },

    copperGolemFallAsleep(mob) {
        const g = mob.userData.copper;
        g.asleep = true;
        g.charge = 0;
        g.task = null;
        g.target = null;
        this.copperGolemSay(mob, 'Zzz... out of charge');
        this.playTone({ frequency: 440, endFrequency: 110, duration: 0.7, type: 'sine', volume: 0.016, release: 0.3 });
    },

    copperGolemWake(mob) {
        const g = mob.userData.copper;
        g.asleep = false;
        this.copperGolemSay(mob, 'Charged up! Back to work');
        this.copperGolemChirp(1.3);
    },

    // A charged battery block or a switched-on electric block within COPPER_GOLEM.powerRadius.
    copperGolemNearPower(mob) {
        const r = COPPER_GOLEM.powerRadius;
        const x0 = Math.floor(mob.position.x);
        const y0 = Math.floor(mob.position.y + 0.1);
        const z0 = Math.floor(mob.position.z);
        for (let dy = -1; dy <= 2; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (COPPER_GOLEM_LOGIC.isPowerBlock(this.world.getBlockTypeAt(x0 + dx, y0 + dy, z0 + dz))) return true;
                }
            }
        }
        return false;
    },

    // ---- Modes -------------------------------------------------------------------------

    // What it does this frame. Returns { moved, busy }.
    copperGolemBehave(mob, delta, player) {
        const g = mob.userData.copper;
        g.lookAt = null;
        const feet = { x: player.x, y: player.y - this.cameraController.eyeHeight, z: player.z };
        const playing = !this.titleScreenOpen && !this.respawnPending;

        if (g.task) return this.copperGolemDoTask(mob, delta);

        if (g.mode === 'follow') {
            if (!playing) return { moved: false };
            const distance = Math.hypot(feet.x - mob.position.x, feet.z - mob.position.z);
            this.copperGolemCatchUp(mob, feet, distance, delta);
            g.following = g.following ? distance > COPPER_GOLEM.followStop : distance > COPPER_GOLEM.followStart;
            if (!g.following) {
                g.lookAt = Math.atan2(feet.z - mob.position.z, feet.x - mob.position.x);
                return { moved: false };
            }
            const step = this.copperGolemWalkTo(mob, _copperA.set(feet.x, feet.y, feet.z), COPPER_GOLEM.followStop, delta);
            return { moved: step === 'moving' };
        }

        if (g.mode === 'work') return this.copperGolemWork(mob, delta, feet);

        // Stay: it just watches you when you are near.
        if (Math.hypot(feet.x - mob.position.x, feet.z - mob.position.z) < 8) g.lookAt = Math.atan2(feet.z - mob.position.z, feet.x - mob.position.x);
        return { moved: false };
    },

    // Teleports a follower next to the player when left far behind or stuck.
    copperGolemCatchUp(mob, feet, distance, delta) {
        const g = mob.userData.copper;
        if (distance > 6 && g.lastPosition.distanceTo(mob.position) < delta * 0.15) g.stuck += delta;
        else g.stuck = 0;
        g.lastPosition.copy(mob.position);
        if (distance < COPPER_GOLEM.teleport && g.stuck < 4) return;
        const yaw = this.cameraController.yaw || 0;
        for (const [ahead, side] of [[-1.5, 0], [-1.2, 1.2], [-1.2, -1.2], [0, 1.5], [0, -1.5]]) {
            const x = feet.x - Math.sin(yaw) * ahead + Math.cos(yaw) * side;
            const z = feet.z - Math.cos(yaw) * ahead - Math.sin(yaw) * side;
            const floor = this.cameraController.getFloorY(x, z, feet.y + 1.5);
            if (floor <= -20 || Math.abs(feet.y - floor) > 3) continue;
            mob.position.set(x, floor, z);
            g.velocityY = 0;
            g.stuck = 0;
            g.lastPosition.copy(mob.position);
            this.copperGolemSparkle(mob, false);
            return;
        }
    },

    // Work: gather the pickups lying near its spot and bring them to you (or pile them there).
    copperGolemWork(mob, delta, feet) {
        const g = mob.userData.copper;
        const base = g.base;
        const playerNearBase = Math.hypot(feet.x - base.x, feet.z - base.z) <= COPPER_GOLEM.deliverRadius && Math.abs(feet.y - base.y) < 6;

        // Forget pickups that are gone; look for the nearest one now and then.
        if (g.target && !this.pickups.has(g.target.id)) g.target = null;
        g.searchTimer -= delta;
        const full = g.carry.length >= COPPER_GOLEM.carryStacks;
        if (!g.target && !full && g.searchTimer <= 0) {
            g.searchTimer = 0.5;
            g.target = this.copperGolemFindPickup(mob, feet);
            if (g.target) g.targetTime = 0;
        }

        if (g.target) {
            const pickup = g.target;
            g.targetTime += delta;
            const dx = pickup.position.x - mob.position.x;
            const dz = pickup.position.z - mob.position.z;
            if (Math.hypot(dx, dz) < 0.9 && Math.abs(pickup.position.y - mob.position.y) < 1.8) {
                this.copperGolemGrab(mob, pickup);
                g.target = null;
                return { moved: false, busy: true };
            }
            const step = this.copperGolemWalkTo(mob, pickup.position, 0.5, delta);
            if (step === 'blocked' || g.targetTime > 12) {
                // Out of reach: leave it alone for a while.
                g.ignored.set(pickup.id, 30);
                g.target = null;
            }
            this.copperGolemTickIgnored(mob, delta);
            return { moved: step === 'moving', busy: true };
        }
        this.copperGolemTickIgnored(mob, delta);

        if (g.carry.length) {
            if (playerNearBase) {
                const distance = Math.hypot(feet.x - mob.position.x, feet.z - mob.position.z);
                if (distance <= COPPER_GOLEM.handOver && Math.abs(feet.y - mob.position.y) < 2) {
                    this.copperGolemHandOver(mob);
                    return { moved: false, busy: true };
                }
                const step = this.copperGolemWalkTo(mob, _copperA.set(feet.x, feet.y, feet.z), COPPER_GOLEM.handOver * 0.8, delta);
                return { moved: step === 'moving', busy: true };
            }
            if (Math.hypot(base.x - mob.position.x, base.z - mob.position.z) <= 1) {
                this.copperGolemDropPile(mob);
                return { moved: false, busy: true };
            }
            const step = this.copperGolemWalkTo(mob, base, 0.8, delta);
            if (step === 'blocked') this.copperGolemDropPile(mob);
            return { moved: step === 'moving', busy: true };
        }

        // Nothing to do: back to its spot.
        if (Math.hypot(base.x - mob.position.x, base.z - mob.position.z) > 1.5) {
            const step = this.copperGolemWalkTo(mob, base, 1, delta);
            return { moved: step === 'moving', busy: false };
        }
        if (Math.hypot(feet.x - mob.position.x, feet.z - mob.position.z) < 8) g.lookAt = Math.atan2(feet.z - mob.position.z, feet.x - mob.position.x);
        return { moved: false };
    },

    copperGolemTickIgnored(mob, delta) {
        const ignored = mob.userData.copper.ignored;
        for (const [id, time] of ignored) {
            if (time - delta <= 0) ignored.delete(id);
            else ignored.set(id, time - delta);
        }
    },

    // The nearest pickup within reach of its spot that nobody else is after.
    copperGolemFindPickup(mob, feet) {
        if (!this.pickups || this.pickups.size === 0) return null;
        const g = mob.userData.copper;
        const claimed = new Set(this.copperGolemList().filter((other) => other !== mob && other.userData.copper && other.userData.copper.target)
            .map((other) => other.userData.copper.target.id));
        let best = null;
        let bestDistance = Infinity;
        for (const pickup of this.pickups.values()) {
            if (pickup.copperGolemPile || pickup.age < 0.8 || claimed.has(pickup.id) || g.ignored.has(pickup.id)) continue;
            const p = pickup.position;
            if (Math.hypot(p.x - g.base.x, p.z - g.base.z) > COPPER_GOLEM.workRadius || Math.abs(p.y - g.base.y) > 4) continue;
            // The player's magnet takes those anyway.
            if (Math.hypot(p.x - feet.x, p.y - feet.y - 0.6, p.z - feet.z) < 3.6) continue;
            const distance = Math.hypot(p.x - mob.position.x, p.z - mob.position.z);
            if (distance < bestDistance) {
                best = pickup;
                bestDistance = distance;
            }
        }
        return best;
    },

    copperGolemGrab(mob, pickup) {
        const g = mob.userData.copper;
        if (!COPPER_GOLEM_LOGIC.carry(g.carry, pickup.type, pickup.amount)) return;
        this.scene.remove(pickup.mesh);
        this.disposeObject3D(pickup.mesh);
        this.pickups.delete(pickup.id);
        this.playTone({ frequency: 760, endFrequency: 980, duration: 0.06, type: 'triangle', volume: 0.012, release: 0.05 });
        this.copperGolemSetCarryMesh(mob, g.carry[0].type);
    },

    copperGolemHandOver(mob) {
        const g = mob.userData.copper;
        const items = g.carry.reduce((sum, stack) => sum + stack.amount, 0);
        const names = g.carry.map((stack) => `${stack.amount} ${this.formatItemName(stack.type)}`).join(', ');
        g.carry.forEach((stack) => this.addInventory(stack.type, stack.amount));
        g.carry = [];
        this.copperGolemSetCarryMesh(mob, null);
        this.playPickupSound();
        this.copperGolemSay(mob, items === 1 ? 'Here you are!' : `Here you are: ${items} things!`);
        this.receiveSystemMessage({ text: `Your copper golem brought you ${names}` });
        this.copperGolemSave();
    },

    // Far from you, it piles its load on its work spot (and leaves the pile alone).
    copperGolemDropPile(mob) {
        const g = mob.userData.copper;
        g.carry.forEach((stack) => {
            this.spawnPickup(stack.type, { x: g.base.x - 0.5, y: g.base.y, z: g.base.z - 0.5 }, stack.amount, { velocity: new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.5, (Math.random() - 0.5) * 0.6) });
            const pickup = this.pickups.get(`pickup_${this.pickupIdCounter - 1}`);
            if (pickup) pickup.copperGolemPile = true;
        });
        g.carry = [];
        this.copperGolemSetCarryMesh(mob, null);
        this.playPlaceSound('copper_block');
        this.copperGolemSave();
    },

    // Wrench jobs: walk up to the block and toggle or press it.
    copperGolemDoTask(mob, delta) {
        const g = mob.userData.copper;
        const task = g.task;
        task.timer -= delta;
        const center = _copperA.set(task.cell.x + 0.5, task.cell.y, task.cell.z + 0.5);
        const distance = Math.hypot(center.x - mob.position.x, center.z - mob.position.z);
        if (distance <= 1.6 && Math.abs(task.cell.y - mob.position.y) < 2.5) {
            g.task = null;
            let done = false;
            if (task.kind === 'toggle') {
                done = this.copperGolemToggle(task.cell, { x: Math.cos(mob.userData.facing), z: Math.sin(mob.userData.facing) });
            } else {
                const press = this.copperGolemPressFunction();
                if (press) {
                    press(task.cell);
                    done = true;
                }
            }
            g.reach = 0.4;
            this.copperGolemSay(mob, done ? 'Done!' : 'Hmm, it is not there any more');
            if (done) this.copperGolemChirp(1.4);
            return { moved: false, busy: true };
        }
        const step = this.copperGolemWalkTo(mob, center, 1.4, delta);
        if (step === 'blocked' && (g.taskBlocked = (g.taskBlocked || 0) + delta) > 3) task.timer = 0;
        if (step !== 'blocked') g.taskBlocked = 0;
        if (task.timer <= 0) {
            g.task = null;
            this.copperGolemSay(mob, 'I can\'t get there, sorry');
        }
        return { moved: step === 'moving', busy: true };
    },

    // ---- Walking -----------------------------------------------------------------------

    // Walks towards `target` until within `stop` blocks: 'arrived', 'moving' or 'blocked'.
    // Closed doors and gates in its way are opened; small obstacles are walked round.
    copperGolemWalkTo(mob, target, stop, delta) {
        const data = mob.userData;
        const g = data.copper;
        const dx = target.x - mob.position.x;
        const dz = target.z - mob.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance <= stop) return 'arrived';
        if (g.velocityY < -0.5) return 'moving';
        const heading = Math.atan2(dz, dx);
        const speed = COPPER_GOLEM.speed * (g.charge < COPPER_GOLEM.lowCharge ? 0.5 : 1);
        const length = Math.min(distance - stop * 0.5, speed * delta);
        for (const turn of [0, 0.6, -0.6, 1.2, -1.2]) {
            const step = this.walkStep(mob, heading + turn, length, delta);
            if (step.moved) {
                data.facing = heading + turn;
                data.stepPhase += delta * speed * 6;
                g.blockedTime = 0;
                return 'moving';
            }
            if (turn === 0 && this.copperGolemOpenDoorAhead(mob, heading)) {
                data.facing = heading;
                return 'moving';
            }
        }
        data.facing = heading;
        g.blockedTime = (g.blockedTime || 0) + delta;
        return g.blockedTime > 1.5 ? 'blocked' : 'moving';
    },

    // A closed door or gate right ahead at foot or head height: open it (and remember to
    // close it behind).
    copperGolemOpenDoorAhead(mob, heading) {
        const g = mob.userData.copper;
        const x = Math.floor(mob.position.x + Math.cos(heading) * 0.75);
        const z = Math.floor(mob.position.z + Math.sin(heading) * 0.75);
        const y0 = Math.floor(mob.position.y + 0.1);
        for (const y of [y0, y0 + 1]) {
            const cell = { x, y, z };
            const state = this.copperGolemDoorState(cell);
            if (!state || !COPPER_GOLEM_DOOR_SHAPES.includes(state.shape) || state.open) continue;
            if (state.half === 'upper') cell.y -= 1;
            if (!this.copperGolemToggle(cell, { x: Math.cos(heading), z: Math.sin(heading) })) return false;
            if (!g.opened.some((other) => other.x === cell.x && other.y === cell.y && other.z === cell.z)) g.opened.push(cell);
            g.reach = 0.4;
            return true;
        }
        return false;
    },

    // Closes the doors it opened once it is through (`all`: right now, e.g. when packed).
    copperGolemCloseDoors(mob, all) {
        const g = mob.userData.copper;
        if (!g || !g.opened.length) return;
        const player = this.getLocalPlayerPosition();
        g.opened = g.opened.filter((cell) => {
            const state = this.copperGolemDoorState(cell);
            if (!state || !state.open) return false;
            const far = Math.hypot(cell.x + 0.5 - mob.position.x, cell.z + 0.5 - mob.position.z) > 2.2;
            if (!all && !far) return true;
            // Never shut it on the player.
            if (this.cameraController.intersectsBody(player, cell.x, cell.y, cell.z, 1)
                || this.cameraController.intersectsBody(player, cell.x, cell.y + 1, cell.z, 1)) return !all;
            this.copperGolemToggle(cell, { x: mob.position.x - (cell.x + 0.5), z: mob.position.z - (cell.z + 0.5) });
            return false;
        });
    },

    // Gravity: it drops when the ground goes, and climbs out of a block placed on it.
    copperGolemFall(mob, delta) {
        const g = mob.userData.copper;
        const floor = this.cameraController.getFloorY(mob.position.x, mob.position.z, mob.position.y + 0.6);
        if (floor <= -20) return;
        if (mob.position.y > floor + 0.001) {
            g.velocityY -= 20 * delta;
            mob.position.y = Math.max(floor, mob.position.y + g.velocityY * delta);
        } else {
            g.velocityY = 0;
            if (floor > mob.position.y && floor - mob.position.y < 1.2) mob.position.y = floor;
        }
    },

    // ---- Looks -------------------------------------------------------------------------

    // Glowing round eyes (and pupils) and the antenna tip, as meshes over the painted model.
    copperGolemAttachGlow(mob) {
        const data = mob.userData;
        const parts = data.modelParts;
        if (!parts || !parts.head) return;
        if (!data.copperGlow) {
            if (!this.copperGolemEyeGeometry) {
                this.copperGolemEyeGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
                this.copperGolemEyeGeometry.rotateX(Math.PI / 2);
                this.copperGolemBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
            }
            data.copperGlow = {
                eye: new THREE.MeshBasicMaterial({ color: 0x8ff4ff }),
                pupil: new THREE.MeshBasicMaterial({ color: 0x14303a }),
                tip: new THREE.MeshBasicMaterial({ color: 0x9fffb0 })
            };
            data.glowMaterials = (data.glowMaterials || []).concat(Object.values(data.copperGlow));
        }
        if (data.copperEyes && data.copperEyes[0].parent === parts.head) return;
        const unit = 1 / 16;
        const add = (parent, geometry, material, x, y, z, sx, sy, sz) => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x * unit, y * unit, z * unit);
            mesh.scale.set(sx * unit, sy * unit, sz * unit);
            mesh.userData.mobRoot = mob;
            parent.add(mesh);
            return mesh;
        };
        data.copperEyes = [-1, 1].map((side) => {
            const eye = add(parts.head, this.copperGolemEyeGeometry, data.copperGlow.eye, side * 1.8, 3.2, 3.6, 2.3, 2.3, 0.4);
            add(eye, this.copperGolemEyeGeometry, data.copperGlow.pupil, 0, -0.1 * 16, 0.6 * 16, 0.45 * 16, 0.45 * 16, 0.5 * 16);
            return eye;
        });
        data.copperTip = parts.antennaTip ? add(parts.antennaTip, this.copperGolemBoxGeometry, data.copperGlow.tip, 0, 1, 0, 2.3, 2.3, 2.3) : null;
    },

    // Eyes by charge (dim when low, shut asleep), antenna by state: green, amber when low,
    // blinking blue-white while charging.
    copperGolemUpdateGlow(mob) {
        const data = mob.userData;
        const g = data.copper;
        if (!data.copperGlow) return;
        const life = data.life;
        const level = g.asleep ? 0.15 : g.charge < COPPER_GOLEM.lowCharge ? 0.35 + 0.15 * Math.sin(life * 3) : 1;
        const boost = this.ultraModeEnabled ? 2.2 : 1;
        data.copperGlow.eye.color.setRGB(0.12 + 0.44 * level * boost, 0.16 + 0.8 * level * boost, 0.18 + 0.82 * level * boost);
        data.copperBlink = (data.copperBlink ?? 3) - 1 / 60;
        if (data.copperBlink < 0) data.copperBlink = 2 + Math.random() * 4;
        const shut = g.asleep || data.copperBlink < 0.1 || g.hurt > 0.3;
        data.copperEyes.forEach((eye) => { eye.scale.y = (shut ? 0.25 : 2.3) / 16; });
        let tip;
        if (g.charging) tip = Math.floor(life * 6) % 2 ? 0xe8f6ff : 0x5fb8ff;
        else if (g.asleep) tip = 0x4a3020;
        else if (g.charge < COPPER_GOLEM.lowCharge) tip = 0xffb030;
        else tip = 0x7dffa0;
        data.copperGlow.tip.color.setHex(tip);
        if (boost > 1 && !g.asleep) data.copperGlow.tip.color.multiplyScalar(boost);
    },

    copperGolemPose(mob, delta, moving) {
        const data = mob.userData;
        const g = data.copper;
        const target = moving ? 1 : 0;
        g.swing += (target - g.swing) * Math.min(1, delta * 8);
        g.sleepBlend += ((g.asleep ? 1 : 0) - g.sleepBlend) * Math.min(1, delta * 3);
        g.reach = Math.max(0, (g.reach || 0) - delta);
        const swing = Math.sin(data.stepPhase) * 0.7 * g.swing;
        const sleep = g.sleepBlend;
        const carrying = g.carry.length > 0;
        if (data.legs && data.legs.length === 2) {
            data.legs[0].rotation.x = swing * (1 - sleep) - 1.45 * sleep;
            data.legs[1].rotation.x = -swing * (1 - sleep) - 1.45 * sleep;
        }
        if (data.arms && data.arms.length === 2) {
            const hold = carrying ? -1.1 : 0;
            const reach = g.reach > 0 ? -1.4 * Math.sin((g.reach / 0.4) * Math.PI) : 0;
            data.arms[0].rotation.x = carrying ? hold : -swing * 0.8 + reach;
            data.arms[1].rotation.x = carrying ? hold : swing * 0.8;
            data.arms.forEach((arm) => { arm.rotation.z = 0; });
            data.arms[0].rotation.z = 0.15 * sleep;
            data.arms[1].rotation.z = -0.15 * sleep;
        }
        if (data.modelRoot) {
            const bob = moving ? Math.abs(Math.sin(data.stepPhase)) * 0.03 : Math.sin(data.life * 2) * 0.005;
            data.modelRoot.position.y = bob * (1 - sleep) - 0.24 * sleep;
        }
        if (data.head) {
            data.head.rotation.x = 0.4 * sleep;
            data.head.rotation.z = g.hurt > 0 ? Math.sin(g.hurt * 40) * 0.15 : 0;
        }
        const antenna = data.modelParts && data.modelParts.antenna;
        if (antenna) antenna.rotation.z = Math.sin(data.life * 9) * 0.12 * g.swing + (g.hurt > 0 ? Math.sin(g.hurt * 50) * 0.3 : 0);
        if (g.carryMesh) {
            g.carryMesh.rotation.y += delta * 1.5;
            g.carryMesh.position.y = 0.55 + Math.sin(data.life * 4) * 0.02;
        }
    },

    // The first carried item, held up in front of it.
    copperGolemSetCarryMesh(mob, type, force = false) {
        const g = mob.userData.copper;
        if (!g || (!force && g.carryType === type)) return;
        if (g.carryMesh) {
            mob.remove(g.carryMesh);
            this.disposeObject3D(g.carryMesh);
            g.carryMesh = null;
        }
        g.carryType = type;
        if (!type || !this.world.blockTypes[type]) return;
        const mesh = this.world.createDisplayMesh(type, 0.26);
        if (!mesh) return;
        mesh.position.set(0, 0.55, 0.42);
        // Clicking the item it holds counts as clicking the golem.
        mesh.traverse((node) => { node.userData.mobRoot = mob; });
        mob.add(mesh);
        g.carryMesh = mesh;
    },

    // A speech bubble (the robot's, from js/game/robot.js), or the chat without it.
    copperGolemSay(mob, text) {
        const g = mob.userData.copper;
        if (!g) return;
        if (typeof this.robotSay !== 'function') {
            this.receiveSystemMessage({ text: `Copper golem: ${text}` });
            return;
        }
        this.robotSay(g.speech, text);
        if (g.speech.bubble) g.speech.bubble.position.y = 1.75;
    },

    copperGolemUpdateSpeech(mob, delta) {
        const speech = mob.userData.copper.speech;
        if (!speech.bubble) return;
        speech.bubbleTime -= delta;
        speech.bubble.material.opacity = Math.min(1, speech.bubbleTime * 2);
        if (speech.bubbleTime > 0) return;
        mob.remove(speech.bubble);
        speech.bubble.material.map.dispose();
        speech.bubble.material.dispose();
        speech.bubble = null;
    },

    copperGolemSparkle(mob, hot) {
        if (typeof this.stormGolemSparks !== 'function') return;
        this.stormGolemSparks(_copperA.copy(mob.position).setY(mob.position.y + 0.6), hot ? 10 : 6, hot);
    },

    copperGolemChirp(pitch = 1) {
        const base = 700 * pitch;
        [0, 1].forEach((step) => setTimeout(() => {
            this.playTone({ frequency: base * (1 + step * 0.3), endFrequency: base * (1.1 + step * 0.3), duration: 0.06, type: 'square', volume: 0.009, release: 0.05 });
        }, step * 90));
    }
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { COPPER_GOLEM, COPPER_GOLEM_LOGIC, COPPER_GOLEM_MODES };
}
