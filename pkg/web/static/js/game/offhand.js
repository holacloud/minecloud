// The left hand: one slot for something carried while the right hand works (guide page 251).
// - One unit moves out of `inventoryCounts` into `offhandType`, in one step and in one saved JSON, so owned =
//   count + (offhandType === type ? 1 : 0) always holds. Nothing that spends or moves items can reach that
//   unit: placing, dropping (Q), crafting, chests and the microscope all read the count, and death leaves the
//   inventory alone. No right-click use goes through the left hand: it only gives what the item does by being
//   held (light, readings, a balloon's lift, smoke for the bees).
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
    helium_balloon: {}
};
// The nearest other players whose light reaches the terrain (the shader has a slot more, for the player).
const CARRIED_REMOTE_LIGHTS = 2;
// Blocks from the camera beyond which another player's light is not worth a slot.
const CARRIED_REMOTE_RANGE = 40;
// The point light at level 14, as the held torch always was.
const CARRIED_INTENSITY = 1.45;
const CARRIED_POINT_DISTANCE = 8;
// Blocks from a microscope at which a carried light can reach its mirror.
const OFFHAND_MICROSCOPE_REACH = 3;

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
            this.receiveSystemMessage({ text: 'Select a light or an instrument first: the left hand takes those' });
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
            : 'Left hand: empty. Press L on a light or an instrument, or X in play.';
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

        const item = this.world.createDisplayMesh(type, 0.24);
        const def = this.world.blockTypes[type];
        if (def && def.itemOnly) {
            item.position.set(-0.34, -0.14, -0.02);
            item.rotation.set(0.24, -0.64, -0.08);
        } else {
            item.position.set(0, 0, 0);
            item.rotation.set(0.34, -0.68, -0.12);
        }
        // Drawn over the world like the right hand's: see refreshHeldItemMesh.
        item.renderOrder = 10001;
        item.frustumCulled = false;
        item.traverse((node) => {
            if (!node.material) return;
            node.renderOrder = 10001;
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
        const item = this.world.createDisplayMesh(held, 0.18);
        const def = this.world.blockTypes[held];
        if (def && def.itemOnly) {
            item.position.set(0, -0.56, 0.12);
            item.rotation.set(-Math.PI / 2 + 0.3, -0.08, -0.12);
        } else {
            item.position.set(0, -0.62, 0.14);
            item.rotation.set(0.4, -0.2, -0.15);
        }
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
