// The panel of chests, barrels and wardrobes (`storageSlots` in js/game/furniture.js). What they
// hold lives on the server (pkg/network/storage.go): this file only asks and shows.
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
// STORAGE_KINDS mirrors storageKinds in storage.go (test/js/furniture.test.js checks it).
// Mixed into Game.prototype; the panel is a modal panel (see registerModalPanel).

const STORAGE_KINDS = { barrel: 18, chest: 27, wardrobe: 45 };
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

function storageBaseName(type) {
    return String(type).split(':')[0];
}

Object.assign(Game.prototype, {
    storageLoadPending() {
        this.storagePending = new Map();
        this.storageNextSync = 0;
        try {
            const saved = JSON.parse(window.localStorage.getItem(STORAGE_PENDING_KEY) || '[]');
            for (const entry of saved) {
                if (entry && entry.reqId && (entry.op === 'put' || entry.op === 'take') && entry.amount > 0) {
                    // From an earlier visit: ask at the first chance.
                    this.storagePending.set(entry.reqId, { op: entry.op, type: entry.type, amount: entry.amount, at: 0 });
                }
            }
        } catch (_error) {
            // Nothing readable: nothing to resume.
        }
    },

    storageSavePending() {
        try {
            const entries = [...this.storagePending.entries()].map(([reqId, entry]) => ({ reqId, op: entry.op, type: entry.type, amount: entry.amount }));
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
        if (this.storagePanel) this.storagePanel.classList.remove('visible');
        if (this.network && this.network.connected) this.network.send('storageClose', {});
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        this.recapturePointerLock();
    },

    // ---- Moving items ----

    storagePut(type) {
        const at = this.storageAt;
        const amount = storageClickAmount(this.storageMode ?? 0, this.getInventoryCount(type));
        if (!at || amount <= 0 || !this.network.connected) return;
        const reqId = this.storageNewRequestId();
        this.storagePending.set(reqId, { op: 'put', type, amount, at: performance.now() });
        this.storageSavePending();
        // Out of the inventory first, so the same items can never go anywhere else meanwhile.
        this.inventoryCounts[type] = this.getInventoryCount(type) - amount;
        this.storageInventoryChanged();
        this.network.send('storagePut', { ...at, type, amount, reqId });
    },

    storageTake(index) {
        const at = this.storageAt;
        const slot = this.storageSlots && this.storageSlots[index];
        if (!at || !slot || !slot.count || !this.network.connected) return;
        if (!this.world.blockTypes[slot.type]) {
            this.storageNote = `This game does not know "${slot.type}"`;
            this.storageRender();
            return;
        }
        const amount = storageClickAmount(this.storageMode ?? 0, slot.count);
        if (amount <= 0) return;
        const reqId = this.storageNewRequestId();
        this.storagePending.set(reqId, { op: 'take', type: slot.type, amount, at: performance.now() });
        this.storageSavePending();
        this.network.send('storageTake', { ...at, slot: index, type: slot.type, amount, reqId });
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
        if (give > 0 && this.world.blockTypes[pending.type]) this.addInventory(pending.type, give);
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
        this.storageSlots = contents.slots;
        this.storageRender();
    },

    storageOnClosed(where) {
        const at = this.storageAt;
        if (!at || !where) return;
        if (where.x === at.x && where.z === at.z && Math.abs(where.y - at.y) <= 1) this.storageClose();
    },

    // What was in a chest that this client broke or replaced: pickups, like its own drop.
    storageOnDrop(drop) {
        if (!drop || !Array.isArray(drop.items)) return;
        for (const item of drop.items) {
            if (item && item.count > 0 && this.world.blockTypes[item.type]) {
                this.spawnPickup(item.type, { x: drop.x, y: drop.y, z: drop.z }, item.count);
            }
        }
    },

    // ---- Every frame ----

    storageUpdate() {
        if (!this.network) return;
        if (!this.storageListening) {
            this.storageListening = true;
            this.network.on('storageResult', (outcome) => this.storageOnResult(outcome));
            this.network.on('storageContents', (contents) => this.storageOnContents(contents));
            this.network.on('storageClosed', (where) => this.storageOnClosed(where));
            this.network.on('storageDrop', (drop) => this.storageOnDrop(drop));
        }

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
            <div class="storage-grid" id="storage-slots"></div>
            <div id="storage-note"></div>
            <h4>Your items: click to put them in</h4>
            <input id="storage-search" type="text" placeholder="Search items..." autocomplete="off">
            <div class="storage-grid" id="storage-items"></div>`;
        panel.querySelector('.storage-close').addEventListener('click', () => this.storageClose());
        panel.querySelectorAll('.storage-amount').forEach((button) => {
            button.addEventListener('click', () => {
                this.storageMode = Number(button.dataset.amount);
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
        // E or Escape close it; nothing else reaches the game while typing or looking at it.
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

    storageCell(type, count, title, onClick) {
        const cell = document.createElement('div');
        cell.className = 'storage-cell';
        cell.title = title;
        if (this.world.blockTypes[type]) cell.style.backgroundImage = `url(${this.world.getInventoryIconUrl(type)})`;
        const label = document.createElement('span');
        label.textContent = count;
        cell.appendChild(label);
        cell.addEventListener('click', onClick);
        return cell;
    },

    storageRender() {
        const panel = this.storagePanel;
        if (!panel || !this.storageAt) return;
        const mode = this.storageMode ?? 0;
        panel.querySelector('#storage-title').textContent = this.storageTitle;
        panel.querySelectorAll('.storage-amount').forEach((button) => button.classList.toggle('active', Number(button.dataset.amount) === mode));
        panel.querySelector('#storage-note').textContent = this.storageNote || '';

        const slots = panel.querySelector('#storage-slots');
        slots.innerHTML = '';
        if (!this.storageSlots) {
            slots.textContent = 'Opening...';
        } else {
            this.storageSlots.forEach((slot, index) => {
                if (!slot || !slot.count) {
                    const empty = document.createElement('div');
                    empty.className = 'storage-cell empty';
                    slots.appendChild(empty);
                    return;
                }
                slots.appendChild(this.storageCell(slot.type, slot.count, this.getBlockDisplayName(slot.type), () => this.storageTake(index)));
            });
        }

        const items = panel.querySelector('#storage-items');
        items.innerHTML = '';
        const query = (this.storageSearch || '').trim().toLowerCase();
        const matches = this.inventory.filter((type) => this.getInventoryCount(type) > 0 && this.world.blockTypes[type] &&
            (!query || `${type} ${this.getBlockDisplayName(type)}`.toLowerCase().includes(query)));
        matches.slice(0, STORAGE_LIST_MAX).forEach((type) => {
            items.appendChild(this.storageCell(type, this.getInventoryCount(type), this.getBlockDisplayName(type), () => this.storagePut(type)));
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
