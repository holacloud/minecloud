// The left hand: one slot for something carried while the right hand works (guide page 251).
// - One unit moves out of `inventoryCounts` into `offhandType`, in one step and in one saved JSON, so owned =
//   count + (offhandType === type ? 1 : 0) always holds. Nothing that spends or moves items can reach that
//   unit: placing, dropping (Q), crafting, chests and the microscope all read the count, and death leaves the
//   inventory alone. No right-click use goes through the left hand: it only gives what the item does by being
//   held (light, readings, a balloon's lift, smoke for the bees, a second tool or sword, a shield).
// - Two tools of a type mine faster (offhandPairMultiplier, called by getAdjustedBreakDuration in inventory.js), two
//   swords hit harder (getPlayerAttackDamage in mobs.js). Hoes and shears stay out: they are right-click tools.
// - The shield is a damage modifier at the end of this file. It needs the `source` of applyDamage, and only blows
//   with a source can be blocked. Modifiers run in the order they were registered, and this file loads after
//   resources.js: armour takes its flat points first, then the shield its share of what is left.
// - Light: the terrain shader's three carried-light slots (world.setCarriedLights: no remeshing, and the same
//   cost whatever is held) and, for the player's own, the point light that was already on the camera. Mobs and
//   avatars are only lit by the player's own light: other players' reach the terrain.
// - Other players see it through `offhandItem` in playerMove, a field old clients ignore.
// Mixed into Game.prototype.

// What can be held. `level`: the light it gives, as a placed block's lightEmission (js/game/furniture.js).
const OFFHAND_ITEMS = {
    torch: { level: 14 },
    lantern: { level: 13 },
    candle: { level: 9 },
    firefly_jar: { level: 7 },
    multimeter: {},
    thermometer: {},
    barometer: {},
    anemometer: {},
    helium_balloon: {},
    shield: {}
};
// Tools and swords that can go in the left hand, all but the hoe and the shears: the first three speed up mining.
const OFFHAND_PAIR_TOOLS = ['pickaxe', 'shovel', 'axe'];
const OFFHAND_TOOL_MATERIALS = ['wood', 'stone', 'iron', 'gold', 'steel'];
OFFHAND_TOOL_MATERIALS.forEach((material) => {
    [...OFFHAND_PAIR_TOOLS, 'sword'].forEach((tool) => { OFFHAND_ITEMS[`${material}_${tool}`] = {}; });
});
// Two tools of a type mine at the speed of the worse of the two, times this.
const OFFHAND_PAIR_SPEED = 1.5;
// Seconds of one arm's strike with two swords.
const OFFHAND_STRIKE_TIME = 0.22;
// A shield takes this share of a blow from in front...
const SHIELD_FRONT_REDUCTION = 0.5;
// ...from an attacker within this angle of where the player looks, to either side (radians, on the ground plane).
const SHIELD_FRONT_HALF_ANGLE = Math.PI / 3;
// An attacker nearer than this has no direction to come from.
const SHIELD_MIN_DISTANCE = 0.05;
// Damage types a shield can stop: js/game/survival.js applyDamage lists them all.
const SHIELD_DAMAGE_TYPES = ['mob'];
// The nearest other players whose light reaches the terrain (the shader has a slot more, for the player).
const CARRIED_REMOTE_LIGHTS = 2;
// Blocks from the camera beyond which another player's light is not worth a slot.
const CARRIED_REMOTE_RANGE = 40;
// The point light at level 14, as the held torch always was.
const CARRIED_INTENSITY = 1.45;
const CARRIED_POINT_DISTANCE = 8;
// Blocks from a microscope at which a carried light can reach its mirror.
const OFFHAND_MICROSCOPE_REACH = 3;

// Whether an attacker at `source` is in front of a player at `player` looking along `yaw` (0 looks towards -z, as
// in js/camera.js). Height does not count: a bee over your head is where your face is turned or it is not.
function shieldFacesSource(yaw, player, source) {
    if (!source) return false;
    const dx = source.x - player.x;
    const dz = source.z - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance < SHIELD_MIN_DISTANCE) return false;
    return (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / distance >= Math.cos(SHIELD_FRONT_HALF_ANGLE);
}

// How far each arm is into its strike, by turns, for a swing from -1 to 1.
function offhandArmsOfSwing(swing) {
    return { right: Math.max(0, swing), left: Math.max(0, -swing) };
}

// `mesh` seen in a mirror. three.js turns the faces round for a negative scale, so the materials need nothing.
function offhandMirrored(mesh) {
    const mirror = new THREE.Group();
    mirror.scale.x = -1;
    mirror.add(mesh);
    return mirror;
}

function offhandCanHold(type) {
    return typeof type === 'string' && Object.prototype.hasOwnProperty.call(OFFHAND_ITEMS, type);
}

// The steps below work on { counts, offhand } and always leave count + hand as they found it.

// One unit of `type` goes to the hand, and what was there comes back. Returns whether it moved.
function offhandSend(state, type) {
    if (!offhandCanHold(type) || !(state.counts[type] > 0)) return false;
    const previous = state.offhand;
    state.counts[type] -= 1;
    if (previous) state.counts[previous] = (state.counts[previous] || 0) + 1;
    state.offhand = type;
    return true;
}

// The hand's unit goes back to the inventory. Returns its type, or null.
function offhandTakeBack(state) {
    const type = state.offhand;
    if (!type) return null;
    state.counts[type] = (state.counts[type] || 0) + 1;
    state.offhand = null;
    return type;
}

// The X key, with `selected` in the right hand (null when empty). Returns what happened and what the right hand
// should take now: 'sent' to the left, 'swapped' with what was there, 'returned' to the inventory, 'taken' into
// the right hand, 'refused' (it cannot be held) or 'nothing' (both hands empty).
function offhandSwap(state, selected) {
    const left = state.offhand;
    if (!selected) {
        if (!left) return { outcome: 'nothing', select: null };
        offhandTakeBack(state);
        return { outcome: 'taken', select: left };
    }
    if (!offhandCanHold(selected)) return { outcome: 'refused', select: null };
    if (left === selected) {
        offhandTakeBack(state);
        return { outcome: 'returned', select: null };
    }
    if (!offhandSend(state, selected)) return { outcome: 'nothing', select: null };
    return left ? { outcome: 'swapped', select: left } : { outcome: 'sent', select: null };
}

// What a save holds in the hand. A type that can no longer be held goes back to the inventory, not to nowhere.
function offhandFromSave(saved, counts) {
    if (typeof saved !== 'string' || saved.length === 0) return null;
    if (offhandCanHold(saved)) return saved;
    counts[saved] = (counts[saved] || 0) + 1;
    return null;
}

// The items in either hand that `list` names, the right hand's first and each one once.
function handsInList(right, left, list) {
    const found = [];
    for (const type of [right, left]) {
        if (type && list.includes(type) && !found.includes(type)) found.push(type);
    }
    return found;
}

// The stronger light of the two hands, or null. On a tie, the right hand's.
function carriedLightOf(right, left) {
    const levelOf = (type) => (offhandCanHold(type) && OFFHAND_ITEMS[type].level) || 0;
    const rightLevel = levelOf(right);
    const leftLevel = levelOf(left);
    if (!rightLevel && !leftLevel) return null;
    return leftLevel > rightLevel ? { type: left, level: leftLevel, hand: 'left' } : { type: right, level: rightLevel, hand: 'right' };
}

// Up to `slots` of `sources` ({ x, y, z, level }) nearest (x, y, z) and within `range` blocks.
function nearestCarriedLights(x, y, z, sources, slots = CARRIED_REMOTE_LIGHTS, range = CARRIED_REMOTE_RANGE) {
    const within = [];
    for (const source of sources) {
        const dx = source.x - x;
        const dy = source.y - y;
        const dz = source.z - z;
        const distance = dx * dx + dy * dy + dz * dz;
        if (distance <= range * range) within.push({ source, distance });
    }
    within.sort((a, b) => a.distance - b.distance);
    return within.slice(0, slots).map((entry) => entry.source);
}

// A carried `light` as a microscope sees it, from an eye at `eye`, or null when too far from the block at `at`.
function carriedLampWithin(light, eye, at, reach = OFFHAND_MICROSCOPE_REACH) {
    if (!light) return null;
    const away = Math.max(Math.abs(eye.x - (at.x + 0.5)), Math.abs(eye.y - (at.y + 0.5)), Math.abs(eye.z - (at.z + 0.5)));
    return away <= reach ? { level: light.level, type: light.type } : null;
}

Object.assign(Game.prototype, {
    // ---- What the hands hold ----

    handsHold(type) {
        return this.offhandType === type || this.getSelectedHeldItemType() === type;
    },

    handsInstruments(list) {
        return handsInList(this.getSelectedHeldItemType(), this.offhandType, list);
    },

    // ---- Two of a kind ----

    // The speed of two tools of a type on that block, or null when they do not count: only the right tool for the
    // block, in the right hand, and with another of its type in the left. The worse of the two sets it, so a good
    // tool with a much worse one mines slower than the good one alone: that is the rule (guide page 251).
    offhandPairMultiplier(right, blockType) {
        const rightDef = right && this.getItemDefinition(right);
        const leftDef = this.offhandType && this.getItemDefinition(this.offhandType);
        if (!rightDef || !leftDef || rightDef.toolType !== leftDef.toolType) return null;
        if (!OFFHAND_PAIR_TOOLS.includes(rightDef.toolType) || !this.toolFitsBlock(right, blockType)) return null;
        return Math.min(this.getToolMiningMultiplier(right, blockType), this.getToolMiningMultiplier(this.offhandType, blockType)) * OFFHAND_PAIR_SPEED;
    },

    offhandSwordsPaired() {
        const rightDef = this.getItemDefinition(this.getSelectedHeldItemType());
        const leftDef = this.getItemDefinition(this.offhandType);
        return Boolean(rightDef && leftDef && rightDef.toolType === 'sword' && leftDef.toolType === 'sword');
    },

    // A strike at a mob: with two swords, the other arm's turn.
    offhandNoteStrike() {
        if (!this.offhandSwordsPaired()) {
            this.offhandStrikeArm = null;
            this.offhandStrikeLeft = 0;
            return;
        }
        this.offhandStrikeArm = this.offhandStrikeArm === 'right' ? 'left' : 'right';
        this.offhandStrikeLeft = OFFHAND_STRIKE_TIME;
    },

    // The arm in the middle of a strike and how far into it, or null. Called once a frame.
    offhandStrikePose(delta) {
        if (!(this.offhandStrikeLeft > 0)) return null;
        this.offhandStrikeLeft -= delta;
        return { arm: this.offhandStrikeArm, amount: Math.sin(Math.PI * Math.max(0, this.offhandStrikeLeft) / OFFHAND_STRIKE_TIME) };
    },

    // ---- Moving items ----

    offhandState() {
        return { counts: this.inventoryCounts, offhand: this.offhandType };
    },

    offhandAfterChange(state, select = null) {
        // What came back must have a place in the inventory (a save can hold an item the list does not have yet).
        for (const type of [this.offhandType, state.offhand, select]) {
            if (type && !this.inventory.includes(type)) this.inventory.push(type);
        }
        this.offhandType = state.offhand;
        if (select) {
            // The hotbar keeps its order unless the item is not on it.
            const index = this.inventory.indexOf(select);
            this.selectSlot(index, { promoteToHotbar: !this.getHotbarInventoryIndexes().includes(index) });
        }
        this.updateHotbarCounts();
        this.refreshHeldItemMesh();
        this.renderCraftingPanel();
        this.renderInventoryPanel();
        this.saveInventoryState();
    },

    offhandTell(text) {
        this.receiveSystemMessage({ text });
        this.playTone({ frequency: 520, duration: 0.05, type: 'triangle', volume: 0.016, release: 0.06 });
    },

    // X (Shift + X, or `clear`: only put away what the left hand holds).
    offhandSwapSelected(clear = false) {
        if (clear) {
            this.offhandPutAway();
            return;
        }
        const selected = this.getSelectedHeldItemType();
        const state = this.offhandState();
        const { outcome, select } = offhandSwap(state, selected);
        if (outcome === 'refused') {
            this.receiveSystemMessage({ text: `${this.getBlockDisplayName(selected)} cannot be held in the left hand` });
            return;
        }
        if (outcome === 'nothing') {
            this.receiveSystemMessage({ text: 'Select a light, an instrument, a tool, a sword or a shield first: the left hand takes those' });
            return;
        }
        this.offhandAfterChange(state, select);
        if (outcome === 'returned') this.offhandTell(`${this.getBlockDisplayName(selected)} back in the inventory`);
        else if (outcome === 'taken') this.offhandTell(`${this.getBlockDisplayName(select)} in the right hand`);
        else this.offhandTell(`Left hand: ${this.getBlockDisplayName(state.offhand)}`);
    },

    // The buttons of the inventory panel.
    offhandSendType(type) {
        const state = this.offhandState();
        if (offhandSend(state, type)) this.offhandAfterChange(state);
    },

    offhandPutAway() {
        const state = this.offhandState();
        if (offhandTakeBack(state)) this.offhandAfterChange(state);
    },

    // ---- What the screen shows ----

    // The slot beside the hotbar, on a phone the button of the top bar, and the row in the inventory panel.
    offhandRenderHud() {
        const type = this.offhandType || null;
        const icon = type && this.world ? `url(${this.world.getInventoryIconUrl(type)})` : '';
        const name = type ? this.getBlockDisplayName(type) : '';

        const hotbar = document.getElementById('hotbar');
        if (hotbar) {
            if (!this.offhandHudElement || this.offhandHudElement.parentNode !== hotbar) {
                this.offhandHudElement = document.createElement('div');
                this.offhandHudElement.id = 'offhand-hud';
                hotbar.appendChild(this.offhandHudElement);
            }
            this.offhandHudElement.style.backgroundImage = icon;
            this.offhandHudElement.classList.toggle('empty', !type);
            this.offhandHudElement.title = type ? `Left hand: ${name}` : 'Left hand (X)';
        }
        const button = document.getElementById('touch-offhand-button');
        if (button) {
            button.style.backgroundImage = icon;
            button.textContent = type ? '' : 'L';
        }
        const row = document.getElementById('inventory-offhand');
        if (row) this.offhandRenderRow(row, type, icon, name);
    },

    offhandRenderRow(row, type, icon, name) {
        row.innerHTML = '';
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.className = 'inventory-offhand-slot';
        slot.style.backgroundImage = icon;
        slot.setAttribute('aria-label', type ? `Put ${name} back in the inventory` : 'Left hand, empty');
        slot.addEventListener('click', () => this.offhandPutAway());
        const text = document.createElement('div');
        text.className = 'inventory-offhand-text';
        text.textContent = type
            ? `Left hand: ${name}. Click it to put it back.`
            : 'Left hand: empty. Press L on an item that has it, or X in play.';
        row.append(slot, text);
    },

    // The L of an item in the inventory panel that the left hand can take.
    offhandDecorateItem(item, type) {
        if (!offhandCanHold(type)) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'inventory-offhand-button';
        button.textContent = 'L';
        button.title = 'Hold in the left hand';
        button.setAttribute('aria-label', `Hold ${this.getBlockDisplayName(type)} in the left hand`);
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            this.offhandSendType(type);
        });
        item.appendChild(button);
    },

    // The first-person left hand: the right hand's item, mirrored (x, and the turns around y and z).
    offhandRefreshMesh(forceRebuild = false) {
        this.offhandRenderHud();
        const anchor = this.firstPersonOffhandAnchor;
        if (!anchor || !this.world) return;
        const type = this.offhandType || null;
        if (!forceRebuild && this.offhandMeshType === type) return;
        if (this.offhandMesh) {
            anchor.remove(this.offhandMesh);
            this.disposeObject3D(this.offhandMesh);
            this.offhandMesh = null;
        }
        this.offhandMeshType = type;
        if (!type) return;

        const made = this.world.createDisplayMesh(type, 0.24);
        const def = this.world.blockTypes[type];
        if (def && def.frontGuard) {
            made.position.set(...SHIELD_FIRST_PERSON.position);
            made.rotation.set(...SHIELD_FIRST_PERSON.rotation);
        } else if (def && def.toolType) {
            // A tool sits off to one side of its group: the left hand's is the right hand's seen in a mirror.
            made.position.set(0.34, -0.14, -0.02);
            made.rotation.set(0.24, 0.64, 0.08);
        } else if (def && def.itemOnly) {
            made.position.set(-0.34, -0.14, -0.02);
            made.rotation.set(0.24, -0.64, -0.08);
        } else {
            made.position.set(0, 0, 0);
            made.rotation.set(0.34, -0.68, -0.12);
        }
        const item = def && def.toolType ? offhandMirrored(made) : made;
        // Drawn over the world like the right hand's: see refreshHeldItemMesh. With no depth test, the boxes of one
        // item go far to near, and `viewLayer` settles those that are as far as each other (the shield's).
        item.renderOrder = 10001;
        item.frustumCulled = false;
        item.traverse((node) => {
            if (!node.material) return;
            node.renderOrder = 10001 + (node.userData.viewLayer || 0);
            node.frustumCulled = false;
            (Array.isArray(node.material) ? node.material : [node.material]).forEach((material) => {
                material.transparent = true;
                material.opacity = 1;
                material.depthTest = false;
                material.depthWrite = false;
            });
        });
        anchor.add(item);
        this.offhandMesh = item;
    },

    // An avatar's left hand: the player's own (third person, mirrors) and other players'.
    updateAvatarOffhandItem(avatar, type) {
        if (!avatar || !this.world) return;
        const held = type || null;
        if ((avatar.userData.offhandItemType || null) === held) return;
        const arm = avatar.userData.avatarParts && avatar.userData.avatarParts.leftArm;
        if (!arm) return;
        if (avatar.userData.offhandItemMesh) {
            arm.remove(avatar.userData.offhandItemMesh);
            this.disposeObject3D(avatar.userData.offhandItemMesh);
            avatar.userData.offhandItemMesh = null;
        }
        avatar.userData.offhandItemType = held;
        if (!held) return;
        const made = this.world.createDisplayMesh(held, 0.18);
        const def = this.world.blockTypes[held];
        if (def && def.frontGuard) {
            made.position.set(...SHIELD_ON_ARM.position);
            made.rotation.set(...SHIELD_ON_ARM.rotation);
        } else if (def && def.toolType) {
            made.position.set(0, -0.56, 0.12);
            made.rotation.set(-Math.PI / 2 + 0.3, 0.08, 0.12);
        } else if (def && def.itemOnly) {
            made.position.set(0, -0.56, 0.12);
            made.rotation.set(-Math.PI / 2 + 0.3, -0.08, -0.12);
        } else {
            made.position.set(0, -0.62, 0.14);
            made.rotation.set(0.4, -0.2, -0.15);
        }
        const item = def && def.toolType ? offhandMirrored(made) : made;
        item.frustumCulled = false;
        arm.add(item);
        avatar.userData.offhandItemMesh = item;
    },

    // What another player's message says of its hands. The left hand's type comes from another client, so only
    // what can be held and exists here is drawn. Old clients send nothing: an empty hand.
    offhandApplyRemote(avatar, player) {
        const left = offhandCanHold(player.offhandItem) && this.world.blockTypes[player.offhandItem] ? player.offhandItem : null;
        this.updateAvatarOffhandItem(avatar, left);
        const light = carriedLightOf(player.heldItem, left);
        avatar.userData.carriedLevel = light ? light.level : 0;
    },

    // ---- Light ----

    // Once a frame. Nothing here touches the chunks: three uniforms and one existing light's numbers.
    carriedLightUpdate() {
        const own = carriedLightOf(this.getSelectedHeldItemType(), this.offhandType);
        const lamp = this.heldTorchLight;
        const share = own ? own.level / 14 : 0;
        lamp.intensity = CARRIED_INTENSITY * share;
        if (own) {
            lamp.distance = CARRIED_POINT_DISTANCE * share;
            lamp.position.x = own.hand === 'left' ? -Math.abs(lamp.position.x) : Math.abs(lamp.position.x);
        }
        const eye = this.camera.position;
        const lights = own ? [{ x: eye.x, y: eye.y, z: eye.z, level: own.level }] : [];
        let remote = null;
        for (const avatar of this.otherPlayerMeshes.values()) {
            if (!avatar.userData.carriedLevel) continue;
            const { x, y, z } = avatar.position;
            (remote = remote || []).push({ x, y: y + 1.1, z, level: avatar.userData.carriedLevel });
        }
        if (remote) lights.push(...nearestCarriedLights(eye.x, eye.y, eye.z, remote));
        this.world.setCarriedLights(lights);
    },

    // A light in either hand counts for a microscope nearby, as a lamp block beside it would.
    carriedLampNear(at) {
        const lamp = carriedLampWithin(carriedLightOf(this.getSelectedHeldItemType(), this.offhandType), this.camera.position, at);
        return lamp ? { ...lamp, name: this.getBlockDisplayName(lamp.type) } : null;
    }
});

// ---- The shield ----

// Where it sits: in the first person (the left arm's item anchor) and on an avatar's left arm.
const SHIELD_FIRST_PERSON = { position: [-0.24, -0.12, 0.12], rotation: [0.58, 0.55, 0.02] };
const SHIELD_ON_ARM = { position: [0.17, -0.42, 0.06], rotation: [0, 0.95, 0] };

const SHIELD_SPRITE = [
    '............',
    '.RRRRRRRRRR.',
    '.RWWwWWwWWR.',
    '.RWWwWWwWWR.',
    '.RWWwBBwWWR.',
    '.RWWBCCBWWR.',
    '.RWWBCCBWWR.',
    '.RWWwBBwWWR.',
    '..RWwWWwWR..',
    '..RWwWWwWR..',
    '...RRwwRR...',
    '.....RR.....'
];
const SHIELD_COLORS = { board: 0x9a6b3c, boardDark: 0x7d5530, iron: 0x8f979e, boss: 0xc8cdd2, copper: 0xc7793f, strap: 0x4a2f1b };

// Five boards with a pointed foot, in an iron rim. Outside (+z), an iron boss with a copper stud; inside, the straps
// that go round the arm. Boxes and not an icon on a card: it is held up flat, and a card has no edge to see.
function shieldDisplayMesh(world, type, scale) {
    const group = new THREE.Group();
    const add = (color, size, position, rotation, layer) => {
        const box = world.addDisplayBox(group, color, size, position, rotation);
        box.userData.viewLayer = layer;
        return box;
    };
    const { board, boardDark, iron, boss, copper, strap } = SHIELD_COLORS;
    [[-0.44, -0.3], [-0.22, -0.5], [0, -0.68], [0.22, -0.5], [0.44, -0.3]].forEach(([x, foot], index) => {
        const top = 0.62;
        add(index % 2 ? boardDark : board, [0.22, top - foot, 0.08], [x, (top + foot) / 2, 0], null, 0);
    });
    add(iron, [1.3, 0.12, 0.14], [0, 0.66, 0], null, 1);
    [-1, 1].forEach((side) => {
        add(iron, [0.12, 0.94, 0.14], [side * 0.59, 0.2, 0], null, 1);
        add(iron, [0.12, 0.84, 0.14], [side * 0.3, -0.5, 0], [0, 0, side * -0.87], 1);
        add(strap, [0.1, 0.5, 0.05], [side * 0.2, 0, -0.065], null, 2);
    });
    add(boss, [0.36, 0.36, 0.06], [0, 0.04, 0.07], null, -2);
    add(copper, [0.16, 0.16, 0.05], [0, 0.04, 0.12], null, -1);
    add(strap, [0.62, 0.11, 0.07], [0, 0.04, -0.1], null, 3);
    group.scale.setScalar(scale * 2.2);
    group.userData.blockType = type;
    return group;
}

registerItemType('shield', {
    color: 0x6b4a2b,
    name: 'Shield',
    frontGuard: SHIELD_FRONT_REDUCTION,
    drawIcon: resourcesDrawSprite(SHIELD_SPRITE, { R: SHIELD_COLORS.iron, W: SHIELD_COLORS.board, w: SHIELD_COLORS.boardDark, B: SHIELD_COLORS.boss, C: SHIELD_COLORS.copper }),
    displayMesh: shieldDisplayMesh,
    consume() {
        this.receiveSystemMessage({ text: 'Shield: in the left hand (X), it halves the blows of creatures in front of you' });
        return true;
    }
});

registerGameContent(function ({ addRecipe }) {
    addRecipe('shield', 'Craft Shield', 'shield', 1, [{ type: 'planks', amount: 4 }, { type: 'iron_ore', amount: 2 }]);
});

// After the armour: see the top of this file.
registerDamageModifier(function (amount, type, _reason, source) {
    if (amount <= 0 || this.offhandType !== 'shield' || !SHIELD_DAMAGE_TYPES.includes(type)) return amount;
    if (!shieldFacesSource(this.cameraController.yaw, this.getLocalPlayerPosition(), source)) return amount;
    this.playTone({ frequency: 760, endFrequency: 420, duration: 0.07, type: 'triangle', volume: 0.03, release: 0.08 });
    return amount * (1 - SHIELD_FRONT_REDUCTION);
});
