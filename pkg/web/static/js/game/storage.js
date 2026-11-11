// The panel of chests, barrels, wardrobes, ovens, foundries, arc furnaces, fridges and chest freezers
// (`storageSlots` in js/game/furniture.js). What they hold lives on the server (pkg/network/storage.go): this file
// only asks and shows.
// - A right click opens the panel (crouch to build against the chest). It shows the chest's slots
//   and the player's items; a click or tap moves the amount picked in the row above them. Other
//   players' moves appear live, as the server sends every watcher the new contents.
// - Moving is two steps so that nothing is lost or duplicated. Putting takes the items out of the
//   inventory first and gives back whatever the server says did not land; taking adds only what
//   the server says left the chest. Until the answer arrives the move is `pending` (saved in the
//   browser, with the inventory). If an answer is late, storageSync asks about it, also after a
//   reconnection or a reload: the server answers from its log, or kills a move that never
//   arrived so that it can no longer apply.
// - When a chest is broken the server sends its contents to whoever broke it, as pickups.
// - What is taken from the autoclave's result slot goes to the hand, as what the incubator hands over: on
//   the server's answer the panel closes and it is in the first hotbar slot, selected; a refusal leaves
//   the panel open with the reason. Other slots and other chests only fill the inventory.
// - A culture plate (js/game/plates.js) is one cell in the chest and one among the player's items, each
//   drawn from its own record; it moves alone, named by its id (and on a put its token), and the pending
//   move keeps the plate so a refusal gives back that very plate. Plain plates with no record yet are a
//   stack among the player's items, and the server makes each a plate as it lands.
// - A machine (APPLIANCE_MACHINES) shows what it works on, its fuel or coal and the result, with
//   its fire and work as bars, and lists only what fits it; a fridge has two tabs, a compartment
//   each. Cold furniture and the arc furnace say whether they have power. All change on their own, on the
//   server (js/game/appliances.js): while the slots stay the same only the bars and the line of
//   status are redrawn, so that a click on a cell is not lost when an update lands on it.
// STORAGE_KINDS and STORAGE_FREEZERS mirror storageKinds and storageFreezers in storage.go
// (test/js/furniture.test.js checks them).
// Mixed into Game.prototype; the panel is a modal panel (see registerModalPanel).

const STORAGE_KINDS = { arc_furnace: 3, autoclave: 3, barrel: 18, chest: 27, chest_freezer: 36, foundry: 3, fridge: 18, incubator: 3, microscope: 1, oven: 3, wardrobe: 45 };
// Kinds with a second compartment, and how many slots it has.
const STORAGE_FREEZERS = { fridge: 9 };
const STORAGE_FREEZER_TAB = 'freezer';
const STORAGE_MAX_STACK = 999;
const STORAGE_MAX_AMOUNT = 9999;
// Blocks away at which an open panel closes (the server allows 9).
const STORAGE_CLOSE_DISTANCE = 7;
// An answer this late (ms) is asked about, and how often at the most.
const STORAGE_SYNC_AFTER = 4000;
const STORAGE_SYNC_EVERY = 2000;
const STORAGE_SYNC_MAX = 64;
// Items listed at once on the player's side (a creative player holds all of them): search for more.
const STORAGE_LIST_MAX = 120;
const STORAGE_PENDING_KEY = 'minecloud-storage-pending';
// The amounts one click can move; 0 means the whole stack.
const STORAGE_AMOUNTS = [1, 10, 0];
// What every panel starts with: nothing moves by the stack unless it was asked for in that panel.
const STORAGE_DEFAULT_AMOUNT = STORAGE_AMOUNTS[0];

const STORAGE_CSS = `
#storage-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(760px,calc(100vw - 16px));max-height:calc(100% - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom));display:none;flex-direction:column;gap:10px;padding:16px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(8,12,20,.94);color:#fff;font-family:'Consolas',monospace;z-index:275;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y}
#storage-panel.visible{display:flex}
#storage-panel .storage-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#storage-panel h3{font-size:16px;margin:0;flex:1;min-width:120px}
#storage-panel button{min-width:44px;height:40px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:700 13px/1 'Consolas',monospace;cursor:pointer}
#storage-panel button.active{background:rgba(120,190,255,.4);border-color:rgba(160,210,255,.8)}
#storage-panel h4{font-size:12px;margin:2px 0;opacity:.75;font-weight:400}
#storage-panel input{width:100%;height:36px;padding:0 10px;box-sizing:border-box;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;font:13px/1 'Consolas',monospace;outline:none}
.storage-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:5px}
.storage-cell{position:relative;aspect-ratio:1;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05) center/72% no-repeat;cursor:pointer;touch-action:manipulation}
.storage-cell.empty{cursor:default;opacity:.55}
.storage-cell:not(.empty):hover{border-color:rgba(255,255,255,.55)}
.storage-cell span{position:absolute;right:3px;bottom:2px;font-size:11px;text-shadow:0 1px 2px #000}
#storage-items{max-height:30vh;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y}
#storage-note{font-size:12px;opacity:.75;min-height:15px}
#storage-tabs{display:flex;gap:6px}
#storage-tabs button{flex:1}
#storage-status{font-size:12px;line-height:1.35}
#storage-status.off{color:#ffc27a}
.storage-bar{position:absolute;left:3px;right:3px;top:3px;height:4px;border-radius:2px;background:rgba(0,0,0,.5);overflow:hidden;pointer-events:none}
.storage-bar i{display:block;height:100%;width:0;background:#8fd0f5}
.storage-bar.paused i{background:#8a929a}
.storage-oven{display:flex;align-items:flex-end;justify-content:center;gap:12px;flex-wrap:wrap}
.storage-oven-slot{width:72px;font-size:11px;text-align:center}
.storage-oven-slot .storage-cell{margin-top:3px}
.storage-oven-bars{display:flex;flex-direction:column;gap:8px;width:96px;font-size:11px;align-self:center}
.storage-oven-bars .storage-bar{position:relative;left:0;right:0;top:0;height:8px;margin-top:2px}
#storage-fire i{background:#f08a2e}
#storage-cook i{background:#ffd16c}
`;

// ---------------------------------------------------------------------------------------
// Pure helpers (also used by test/js/furniture.test.js)

// How many of `available` one click moves with the amount picked.
function storageClickAmount(mode, available) {
    const amount = mode === 0 ? available : Math.min(mode, available);
    return Math.max(0, Math.min(amount, STORAGE_MAX_AMOUNT));
}

// What an answer means for the inventory: `give` is how many items to add. A put took them all
// out when it was sent, so what did not land comes back; a take gets what really left the chest.
function storageApplyOutcome(pending, moved) {
    const amount = Math.max(0, Math.min(moved || 0, pending.amount));
    return { give: pending.op === 'put' ? pending.amount - amount : amount, moved: amount };
}

// The autoclave's result slot (its third): what is taken from it goes to the hand.
const STORAGE_AUTOCLAVE_RESULT_SLOT = 2;

// Why a take was refused, in the language of the game where the incubator's lines have it.
function storageRefusalLine(reason) {
    const lines = typeof CULTURE_TEXT !== 'undefined' && typeof gameLang === 'function' ? CULTURE_TEXT.refused[gameLang()] : null;
    if (lines) return lines[reason] || lines.other;
    return `Could not take it out (${reason})`;
}

function storageBaseName(type) {
    return String(type).split(':')[0];
}

// Whether two lists of slots hold the same stacks, whatever their progress.
function storageSameStacks(a, b) {
    if (!a || !b || a.length !== b.length) return !a && !b;
    return a.every((slot, i) => (slot.type || '') === (b[i].type || '') && (slot.count || 0) === (b[i].count || 0) && (slot.plate || '') === (b[i].plate || ''));
}

// The line of status of a machine that burns, from what the server says of its fire.
function storageOvenStatus(oven, machine = APPLIANCE_MACHINES.oven) {
    if (!oven || !(oven.burn > 0)) return machine.noFire;
    const left = `Burning, ${Math.ceil(oven.burn)} s of fire left`;
    return oven.cookMax > 0 ? `${left}: ${machine.working}` : `${left}: ${machine.idle}`;
}

// The line of status of an electric machine: `off` when what it says is that it lacks power.
function storageArcStatus(kind, contents) {
    const watts = ELECTRIC_KINDS[kind].watts;
    if (!contents.oven || !(contents.oven.cookMax > 0)) return { text: `Waiting for work: it draws no power until it has what it needs (then ${watts} W)`, off: false };
    if (contents.oven.starting) return { text: `Asking the network for ${watts} W...`, off: false };
    if (contents.powered) return { text: `Arc on, drawing ${watts} W`, off: false };
    return { text: `No power: needs ${watts} W. It waits, and keeps what it has done`, off: true };
}

// A bar's width from a value and its maximum.
function storagePercent(value, max) {
    return max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
}

Object.assign(Game.prototype, {
    storageLoadPending() {
        this.storagePending = new Map();
        this.storageNextSync = 0;
        try {
            const saved = JSON.parse(window.localStorage.getItem(STORAGE_PENDING_KEY) || '[]');
            for (const entry of saved) {
                if (entry && entry.reqId && (entry.op === 'put' || entry.op === 'take') && entry.amount > 0) {
                    // From an earlier visit: ask at the first chance. A plate on its way is that plate.
                    this.storagePending.set(entry.reqId, { op: entry.op, type: entry.type, amount: entry.amount, at: 0, ...(entry.plate ? { plate: entry.plate } : {}) });
                }
            }
        } catch (_error) {
            // Nothing readable: nothing to resume.
        }
    },

    storageSavePending() {
        try {
            const entries = [...this.storagePending.entries()].map(([reqId, entry]) => ({ reqId, op: entry.op, type: entry.type, amount: entry.amount, ...(entry.plate ? { plate: entry.plate } : {}) }));
            window.localStorage.setItem(STORAGE_PENDING_KEY, JSON.stringify(entries));
        } catch (_error) {
            // Blocked storage: it lasts until the page reloads.
        }
    },

    storageNewRequestId() {
        this.storageRequestCounter = (this.storageRequestCounter || 0) + 1;
        const noise = Math.random().toString(36).slice(2, 10);
        return `${Date.now().toString(36)}-${this.storageRequestCounter}-${noise}`;
    },

    // ---- Opening and closing ----

    // Returns whether the click was on a storage block.
    storageTryOpen(position) {
        const type = this.world.getBlockTypeAt(position.x, position.y, position.z);
        const def = type && this.world.blockTypes[type];
        if (!def || !def.storageSlots) return false;
        if (!this.network || !this.network.connected) {
            this.receiveSystemMessage({ text: 'Not connected: chests live on the server' });
            return true;
        }
        this.storageBuildPanel();
        this.storageAt = { x: position.x, y: position.y, z: position.z };
        this.storageTitle = this.getBlockDisplayName(def.variantOf || type);
        this.storageKind = storageBaseName(type);
        this.storageTab = '';
        this.storageMode = STORAGE_DEFAULT_AMOUNT;
        // Like the inventory and crafting panels: every panel starts with the whole list.
        this.storageSearch = '';
        const search = this.storagePanel.querySelector('#storage-search');
        if (search) search.value = '';
        this.storageContents = null;
        this.storageSlots = null;
        this.storageRev = -1;
        this.storageNote = '';
        this.storageOpenedAt = performance.now();
        this.stopMining();
        // Losing the pointer lock would otherwise open the pause menu.
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.storagePanel.classList.add('visible');
        this.network.send('storageOpen', { ...this.storageAt });
        this.storageRender();
        return true;
    },

    storageClose() {
        if (!this.storageAt) return;
        this.storageAt = null;
        this.storageSlots = null;
        this.storageContents = null;
        if (this.storagePanel) this.storagePanel.classList.remove('visible');
        if (this.network && this.network.connected) this.network.send('storageClose', {});
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        this.recapturePointerLock();
    },

    // ---- Moving items ----

    // `plate`: a culture plate goes in as itself, one at a time (js/game/plates.js); with null, the plain
    // plates of that type (from before plates had records) go as any item.
    storagePut(type, plate = null) {
        const at = this.storageAt;
        if (!at || !this.network.connected) return;
        const tab = this.storageTab ? { compartment: this.storageTab } : {};
        const reqId = this.storageNewRequestId();
        if (plate) {
            if (!this.plateTakeOut(type, plate.id)) return;
            this.storagePending.set(reqId, { op: 'put', type, amount: 1, plate, at: performance.now() });
            this.storageSavePending();
            this.storageInventoryChanged();
            this.network.send('storagePut', { ...at, type, amount: 1, plate: plate.id, token: plate.token, reqId, ...tab });
            return;
        }
        const plain = this.plateLegacyCount && plateIdentified(type) ? this.plateLegacyCount(type) : this.getInventoryCount(type);
        const amount = storageClickAmount(this.storageMode ?? STORAGE_DEFAULT_AMOUNT, plain);
        if (amount <= 0) return;
        this.storagePending.set(reqId, { op: 'put', type, amount, at: performance.now() });
        this.storageSavePending();
        // Out of the inventory first, so the same items can never go anywhere else meanwhile.
        this.inventoryCounts[type] = this.getInventoryCount(type) - amount;
        this.storageInventoryChanged();
        this.network.send('storagePut', { ...at, type, amount, reqId, ...tab });
    },

    storageTake(index) {
        const at = this.storageAt;
        const list = this.storageShownSlots();
        const slot = list && list[index];
        if (!at || !slot || !slot.count || !this.network.connected) return;
        if (!this.world.blockTypes[slot.type]) {
            this.storageNote = `This game does not know "${slot.type}"`;
            this.storageRender();
            return;
        }
        // A culture plate comes out as itself: the request names it.
        const amount = slot.plate ? 1 : storageClickAmount(this.storageMode ?? STORAGE_DEFAULT_AMOUNT, slot.count);
        if (amount <= 0) return;
        const reqId = this.storageNewRequestId();
        // What the autoclave has sterilised goes to the hand, as what the incubator hands over (only for this
        // session's request: one resumed after a reload does not take the hand).
        const hold = this.storageKind === 'autoclave' && !this.storageTab && index === STORAGE_AUTOCLAVE_RESULT_SLOT;
        this.storagePending.set(reqId, { op: 'take', type: slot.type, amount, at: performance.now(), ...(hold ? { hold: true } : {}) });
        this.storageSavePending();
        const tab = this.storageTab ? { compartment: this.storageTab } : {};
        this.network.send('storageTake', { ...at, slot: index, type: slot.type, amount, reqId, ...tab, ...(slot.plate ? { plate: slot.plate } : {}) });
    },

    // The slots of the tab on show.
    storageShownSlots() {
        if (this.storageTab !== STORAGE_FREEZER_TAB) return this.storageSlots;
        return this.storageContents ? this.storageContents.freezer : null;
    },

    storageInventoryChanged() {
        this.updateHotbarCounts();
        this.refreshHeldItemMesh();
        this.renderCraftingPanel();
        this.renderInventoryPanel();
        this.saveInventoryState();
        this.storageRender();
    },

    // ---- Messages from the server ----

    storageOnResult(outcome) {
        const pending = outcome && this.storagePending.get(outcome.reqId);
        if (!pending) return;
        this.storagePending.delete(outcome.reqId);
        this.storageSavePending();
        const { give } = storageApplyOutcome(pending, outcome.amount);
        if (pending.op === 'put' && outcome.reason === 'full') this.storageNote = 'It is full';
        if (outcome.reason === 'not yours') this.storageNote = 'That plate is no longer in your hands';
        if (applianceRefusalNote(outcome.reason)) this.storageNote = applianceRefusalNote(outcome.reason);
        if (give > 0 && pending.plate && this.plateAdd) {
            // The plate did not go in: it comes back as itself, its token still good.
            this.plateAdd(pending.plate);
        } else if (give > 0 && this.world.blockTypes[pending.type]) {
            // What came out of a chest: each culture plate as itself, the rest as items.
            const items = this.plateSettle ? this.plateSettle(pending.op === 'take' ? outcome : null, { [pending.type]: give }, { front: Boolean(pending.hold) }) : { [pending.type]: give };
            if (items[pending.type] > 0) this.addInventory(pending.type, items[pending.type]);
        }
        if (pending.hold && pending.op === 'take') {
            if (outcome.amount > 0 && this.getInventoryCount(pending.type) > 0) {
                // It has arrived: the panel goes, and it is in the hand, in the first slot.
                this.storageClose();
                this.holdInFirstHotbarSlot(pending.type);
                this.playPickupSound();
                return;
            }
            // Refused: the panel stays, and says why.
            if (outcome.reason && outcome.reason !== 'not yours' && !applianceRefusalNote(outcome.reason)) this.storageNote = storageRefusalLine(outcome.reason);
        }
        this.storageRender();
        if (outcome.amount > 0) this.playPickupSound();
    },

    storageOnContents(contents) {
        const at = this.storageAt;
        if (!at || !contents || !Array.isArray(contents.slots)) return;
        // The base cell of a wardrobe may be under the half that was clicked.
        if (contents.x !== at.x || contents.z !== at.z || Math.abs(contents.y - at.y) > 1) return;
        if (contents.rev < this.storageRev) return;
        this.storageRev = contents.rev;
        const same = this.storageContents && storageSameStacks(this.storageSlots, contents.slots) &&
            storageSameStacks(this.storageContents.freezer, contents.freezer);
        this.storageSlots = contents.slots;
        this.storageContents = contents;
        if (same) this.storageRenderProgress();
        else this.storageRender();
    },

    storageOnClosed(where) {
        const at = this.storageAt;
        if (!at || !where) return;
        if (where.x === at.x && where.z === at.z && Math.abs(where.y - at.y) <= 1) this.storageClose();
    },

    // What was in a chest that this client broke or replaced: pickups, like its own drop.
    storageOnDrop(drop) {
        if (!drop || !Array.isArray(drop.items)) return;
        // What a build put in a chest that /build undo now takes away is not spawned (constructions.js).
        const items = this.constructionStockedDrop ? this.constructionStockedDrop(drop) : drop.items;
        for (const item of items) {
            if (item && item.count > 0 && this.world.blockTypes[item.type]) {
                // A culture plate spills as itself, handed to this client (js/game/plates.js).
                const plate = item.grant && typeof plateEntryOf === 'function' ? plateEntryOf(item.grant) : null;
                this.spawnPickup(item.type, { x: drop.x, y: drop.y, z: drop.z }, plate ? 1 : item.count, plate ? { plate } : {});
            }
        }
    },

    // ---- Every frame ----

    storageUpdate() {
        if (!this.network) return;

        // Answers that are late: ask (after a reconnection or a reload this is what resumes them).
        const now = performance.now();
        if (this.storagePending && this.storagePending.size > 0 && this.network.connected && now >= this.storageNextSync) {
            const late = [...this.storagePending.entries()].filter(([, entry]) => now - entry.at >= STORAGE_SYNC_AFTER).map(([id]) => id);
            if (late.length > 0) {
                this.storageNextSync = now + STORAGE_SYNC_EVERY;
                this.network.send('storageSync', { reqIds: late.slice(0, STORAGE_SYNC_MAX) });
            }
        }

        const at = this.storageAt;
        if (!at) return;
        const block = this.world.getBlockTypeAt(at.x, at.y, at.z);
        const def = block && this.world.blockTypes[block];
        const eye = this.cameraController.camera.position;
        const far = Math.hypot(eye.x - at.x - 0.5, eye.y - at.y - 0.5, eye.z - at.z - 0.5) > STORAGE_CLOSE_DISTANCE;
        if (!def || !def.storageSlots || far || !this.network.connected || this.respawnPending) this.storageClose();
    },

    // ---- The panel ----

    storageBuildPanel() {
        if (this.storagePanel) return;
        const style = document.createElement('style');
        style.textContent = STORAGE_CSS;
        document.head.appendChild(style);
        const panel = document.createElement('div');
        panel.id = 'storage-panel';
        panel.innerHTML = `
            <div class="storage-head">
                <h3 id="storage-title"></h3>
                <button class="storage-amount" type="button" data-amount="1">x1</button>
                <button class="storage-amount" type="button" data-amount="10">x10</button>
                <button class="storage-amount" type="button" data-amount="0">All</button>
                <button class="storage-close" type="button" aria-label="Close">✕</button>
            </div>
            <div id="storage-tabs">
                <button class="storage-tab" type="button" data-tab="">Fridge</button>
                <button class="storage-tab" type="button" data-tab="freezer">Freezer</button>
            </div>
            <div id="storage-status"></div>
            <div class="storage-grid" id="storage-slots"></div>
            <div id="storage-note"></div>
            <h4 id="storage-items-title"></h4>
            <input id="storage-search" type="text" placeholder="Search items..." autocomplete="off">
            <div class="storage-grid" id="storage-items"></div>`;
        panel.querySelector('.storage-close').addEventListener('click', () => this.storageClose());
        panel.querySelectorAll('.storage-amount').forEach((button) => {
            button.addEventListener('click', () => {
                this.storageMode = Number(button.dataset.amount);
                this.storageRender();
            });
        });
        panel.querySelectorAll('.storage-tab').forEach((button) => {
            button.addEventListener('click', () => {
                this.storageTab = button.dataset.tab;
                this.storageRender();
            });
        });
        const search = panel.querySelector('#storage-search');
        search.addEventListener('input', () => {
            this.storageSearch = search.value;
            this.storageRender();
        });
        // Clicks inside the panel must not reach the game (which would try to grab the pointer).
        panel.addEventListener('mousedown', (event) => event.stopPropagation());
        panel.addEventListener('pointerdown', (event) => event.stopPropagation());
        document.body.appendChild(panel);
        this.storagePanel = panel;
        // Clicking outside the panel closes it, like the other panels; but not the click that
        // opened it, which is still on its way here, or the mouse event a phone makes up after a
        // tap on a button (phones close it with its ✕).
        document.addEventListener('mousedown', (event) => {
            if (!this.storageAt || performance.now() - this.storageOpenedAt < 150) return;
            if (this.touchControlsEnabled && this.touchIsEmulatedMouse(event)) return;
            this.storageClose();
        });
        // E or Escape close it; nothing else reaches the game while looking at it. What is typed in the
        // search goes on, for the field: the camera and the shortcuts leave text fields alone.
        document.addEventListener('keydown', (event) => {
            if (!this.storageAt) return;
            if (event.code === 'Escape' || (event.code === 'KeyE' && event.target !== search)) {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (!event.repeat) this.storageClose();
                return;
            }
            if (event.target !== search) event.stopImmediatePropagation();
        }, true);
    },

    // `icon`: a culture plate's own drawing, instead of its type's.
    storageCell(type, count, title, onClick, icon = null) {
        const cell = document.createElement('div');
        cell.className = 'storage-cell';
        cell.title = title;
        if (icon || this.world.blockTypes[type]) cell.style.backgroundImage = `url(${icon || this.world.getInventoryIconUrl(type)})`;
        const label = document.createElement('span');
        label.textContent = count;
        cell.appendChild(label);
        cell.addEventListener('click', onClick);
        return cell;
    },

    storageRender() {
        const panel = this.storagePanel;
        if (!panel || !this.storageAt) return;
        const mode = this.storageMode ?? STORAGE_DEFAULT_AMOUNT;
        panel.querySelector('#storage-title').textContent = this.storageTitle;
        panel.querySelectorAll('.storage-amount').forEach((button) => button.classList.toggle('active', Number(button.dataset.amount) === mode));
        panel.querySelector('#storage-note').textContent = this.storageNote || '';
        const machine = APPLIANCE_MACHINES[this.storageKind];
        panel.querySelector('#storage-tabs').style.display = STORAGE_FREEZERS[this.storageKind] ? '' : 'none';
        panel.querySelectorAll('.storage-tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === this.storageTab));

        const slots = panel.querySelector('#storage-slots');
        slots.innerHTML = '';
        slots.className = machine ? 'storage-oven' : 'storage-grid';
        const shown = this.storageShownSlots();
        if (!shown) {
            slots.textContent = 'Opening...';
        } else if (machine) {
            this.storageRenderOven(slots, shown, machine);
        } else {
            shown.forEach((slot, index) => slots.appendChild(this.storageSlotCell(slot, index)));
        }

        const items = panel.querySelector('#storage-items');
        items.innerHTML = '';
        panel.querySelector('#storage-items-title').textContent = machine ? machine.items : 'Your items: click to put them in';
        const query = (this.storageSearch || '').trim().toLowerCase();
        const matches = this.inventory.filter((type) => this.getInventoryCount(type) > 0 && this.world.blockTypes[type] &&
            (!machine || applianceMachineTakes(this.storageKind, type)) && (!query || `${type} ${this.getBlockDisplayName(type)}`.toLowerCase().includes(query)));
        // Each culture plate is its own cell, and goes in as itself; plain ones (no record yet) are one stack.
        const cells = matches.flatMap((type) => {
            if (!this.plateInventoryItems || !plateIdentified(type)) return [{ type, entry: null, count: this.getInventoryCount(type) }];
            const plates = this.platesOf(type).map((entry) => ({ type, entry, count: 1 }));
            const plain = this.plateLegacyCount(type);
            return plain > 0 ? [...plates, { type, entry: null, count: plain }] : plates;
        });
        cells.slice(0, STORAGE_LIST_MAX).forEach(({ type, entry, count }) => {
            const title = entry || (this.plateTitle && plateIdentified(type)) ? this.plateTitle(type, entry && entry.culture) : this.getBlockDisplayName(type);
            items.appendChild(this.storageCell(type, count, title, () => this.storagePut(type, entry), entry ? this.plateIconUrl(entry) : null));
        });
        this.storageRenderProgress();
    },

    // One slot of the grid or the oven; those that are changing carry a bar (storageRenderProgress).
    storageSlotCell(slot, index) {
        if (!slot || !slot.count) {
            const empty = document.createElement('div');
            empty.className = 'storage-cell empty';
            return empty;
        }
        // A culture plate shows what is on it, from the server's record (contents.cultures).
        const culture = slot.plate && this.storageContents && this.storageContents.cultures ? this.storageContents.cultures[slot.plate] || null : null;
        const plate = slot.plate && this.plateIconUrl ? { id: slot.plate, type: slot.type, culture } : null;
        const title = plate ? this.plateTitle(slot.type, culture) : this.getBlockDisplayName(slot.type);
        const cell = this.storageCell(slot.type, slot.count, title, () => this.storageTake(index), plate && culture ? this.plateIconUrl(plate) : null);
        if (this.storageContents && this.storageContents.cold && applianceSlotProgress(this.storageKind, this.storageTab, slot) !== null) {
            const bar = document.createElement('div');
            bar.className = 'storage-bar';
            bar.dataset.slot = index;
            bar.appendChild(document.createElement('i'));
            cell.appendChild(bar);
        }
        return cell;
    },

    storageRenderOven(slots, shown, machine) {
        const piece = (index, caption) => {
            const box = document.createElement('div');
            box.className = 'storage-oven-slot';
            box.textContent = caption;
            box.appendChild(this.storageSlotCell(shown[index], index));
            return box;
        };
        const bars = document.createElement('div');
        bars.className = 'storage-oven-bars';
        const fire = machine.fuels ? '<div>Fire<div class="storage-bar" id="storage-fire"><i></i></div></div>' : '';
        bars.innerHTML = `${fire}<div>${machine.work}<div class="storage-bar" id="storage-cook"><i></i></div></div>`;
        slots.append(piece(0, machine.captions[0]), piece(1, machine.captions[1]), bars, piece(2, machine.captions[2]));
    },

    // What changes on its own: the bars and the line of status.
    storageRenderProgress() {
        const panel = this.storagePanel;
        if (!panel || !this.storageAt) return;
        const contents = this.storageContents;
        const status = panel.querySelector('#storage-status');
        status.classList.remove('off');
        status.textContent = '';
        if (!contents) return;
        if (contents.oven) {
            const { burn, burnMax, cook, cookMax } = contents.oven;
            const machine = APPLIANCE_MACHINES[this.storageKind];
            const fire = panel.querySelector('#storage-fire i');
            const food = panel.querySelector('#storage-cook i');
            if (fire) fire.style.width = `${storagePercent(burn, burnMax)}%`;
            if (food) food.style.width = `${storagePercent(cook, cookMax)}%`;
            if (machine && machine.fuels) {
                status.textContent = storageOvenStatus(contents.oven, machine);
            } else if (machine) {
                const line = machine.status ? machine.status(ELECTRIC_KINDS[this.storageKind].watts, contents) : storageArcStatus(this.storageKind, contents);
                status.textContent = line.text;
                status.classList.toggle('off', line.off);
                if (food) food.parentNode.classList.toggle('paused', line.off);
            }
            // The foundry and the arc furnace say what they will make of what is in them.
            const held = this.storageKind !== 'oven' && contents.slots[0] && contents.slots[0].type;
            const names = (type) => this.getBlockDisplayName(type);
            const recipe = !held ? '' : machine && machine.recipeLine ? machine.recipeLine(held, names) : applianceRecipeLine(this.storageKind, held, names);
            if (recipe) status.textContent += `. ${recipe}`;
        }
        if (!contents.cold) return;
        const table = applianceColdTable(this.storageKind, this.storageTab);
        if (contents.powered) {
            const names = [...new Set(Object.keys(table.changes))].map((type) => this.getBlockDisplayName(type)).join(', ');
            status.textContent = `Power on: it ${table.verb} in about ${table.seconds === 60 ? 'a minute' : `${table.seconds / 60} minutes`}: ${names}`;
        } else {
            status.textContent = 'No power: works as a cupboard, nothing in it changes';
            status.classList.add('off');
        }
        const shown = this.storageShownSlots() || [];
        panel.querySelectorAll('#storage-slots .storage-bar[data-slot]').forEach((bar) => {
            const progress = applianceSlotProgress(this.storageKind, this.storageTab, shown[Number(bar.dataset.slot)]);
            bar.classList.toggle('paused', !contents.powered);
            bar.firstChild.style.width = `${(progress || 0) * 100}%`;
        });
    }
});

registerModalPanel({
    isOpen() { return Boolean(this.storageAt); },
    close() { this.storageClose(); }
});

registerItemUseHandler(function (itemType, hit) {
    if (!hit || this.cameraController.isCrouching) return false;
    const position = this.world.getBlockPositionFromIntersection(hit);
    return Boolean(position) && this.storageTryOpen(position);
});

registerGameContent(function () {
    this.storageLoadPending();
});

registerFrameUpdate(function () {
    this.storageUpdate();
});

registerNetworkHandler('storageResult', function (outcome) { this.storageOnResult(outcome); });
registerNetworkHandler('storageContents', function (contents) { this.storageOnContents(contents); });
registerNetworkHandler('storageClosed', function (where) { this.storageOnClosed(where); });
registerNetworkHandler('storageDrop', function (drop) { this.storageOnDrop(drop); });
