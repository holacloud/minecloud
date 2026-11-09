// Hotbar, inventory, crafting, pickups and the held item.
// Mixed into Game.prototype; `this` is the Game instance.

Object.assign(Game.prototype, {
    restoreInventoryState() {
        const saved = window.localStorage.getItem('minecloud-inventory-state');
        if (!saved) return;

        try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed.inventory)) {
                this.inventory = parsed.inventory.filter((type) => typeof type === 'string' && type.length > 0);
            }
            if (parsed.counts && typeof parsed.counts === 'object') {
                this.inventoryCounts = { ...this.inventoryCounts, ...parsed.counts };
            }
            // Each culture plate's own record, with the counts (js/game/plates.js).
            if (this.plateRestore) this.plateRestore(parsed.plates, parsed.plateHand);
            this.offhandType = offhandFromSave(parsed.offhand, this.inventoryCounts);
            if (Number.isInteger(parsed.selectedSlot)) {
                this.selectedSlot = Math.max(0, Math.min(parsed.selectedSlot, this.inventory.length - 1));
            }
            if (typeof parsed.hotbarPrimaryType === 'string') {
                this.hotbarPrimaryType = parsed.hotbarPrimaryType;
            }
            if (Array.isArray(parsed.hotbarPinnedTypes)) {
                this.hotbarPinnedTypes = parsed.hotbarPinnedTypes.filter((type) => typeof type === 'string' && type.length > 0);
            }
            if (!this.hotbarPrimaryType && this.getInventoryCount(this.inventory[this.selectedSlot]) > 0) {
                this.hotbarPrimaryType = this.inventory[this.selectedSlot];
            }
        } catch (error) {
            console.warn('Failed to restore inventory state', error);
        }
    },

    saveInventoryState() {
        if (this.plateReconcile) this.plateReconcile();
        window.localStorage.setItem('minecloud-inventory-state', JSON.stringify({
            inventory: this.inventory,
            counts: this.inventoryCounts,
            plates: this.plateEntries || {},
            plateHand: this.plateHand || {},
            selectedSlot: this.selectedSlot,
            hotbarPrimaryType: this.hotbarPrimaryType,
            hotbarPinnedTypes: this.hotbarPinnedTypes,
            offhand: this.offhandType || null
        }));
    },

    // A saved inventory can hold items that no longer exist (removed in an update, or from a
    // test build): drop them so nothing tries to draw an unknown item.
    pruneUnknownInventoryTypes() {
        if (!this.world || !this.world.blockTypes) return;
        const known = (type) => Boolean(this.world.blockTypes[type]);
        const selectedType = this.inventory[this.selectedSlot];
        this.inventory = this.inventory.filter(known);
        this.hotbarPinnedTypes = (this.hotbarPinnedTypes || []).filter(known);
        if (this.hotbarPrimaryType && !known(this.hotbarPrimaryType)) this.hotbarPrimaryType = null;
        if (this.offhandType && !known(this.offhandType)) this.offhandType = null;
        const index = this.inventory.indexOf(selectedType);
        this.selectedSlot = index >= 0 ? index : 0;
    },

    getBlockDisplayName(type) {
        const def = this.world && this.world.blockTypes[type];
        return def ? def.name : type;
    },

    getSelectedHeldItemType() {
        const selectedType = this.getSelectedBlockType();
        return selectedType && this.getInventoryCount(selectedType) > 0 ? selectedType : null;
    },

    initHotbar() {
        this.pruneUnknownInventoryTypes();
        this.getItemTagIndex();
        const hotbar = document.getElementById('hotbar');
        hotbar.innerHTML = '';
        this.hotbarSlotElements = [];
        this.hotbarCountElements = [];

        for (let visibleIndex = 0; visibleIndex < this.hotbarSize; visibleIndex++) {
            const slot = document.createElement('div');
            slot.className = 'hotbar-slot';
            slot.dataset.index = visibleIndex;
            slot.addEventListener('pointerdown', (event) => {
                if (!this.touchControlsEnabled) return;
                event.preventDefault();
                this.selectHotbarSlot(visibleIndex);
            });
            
            const num = document.createElement('span');
            num.className = 'slot-num';
            num.textContent = visibleIndex + 1;
            slot.appendChild(num);

            const count = document.createElement('span');
            count.className = 'slot-count';
            slot.appendChild(count);
            
            hotbar.appendChild(slot);
            this.hotbarSlotElements[visibleIndex] = slot;
            this.hotbarCountElements[visibleIndex] = count;
        }

        this.updateHotbarCounts();
        this.refreshHeldItemMesh();
        this.renderInventoryPanel();
        this.saveInventoryState();
    },

    // What the hotbar shows, slot by slot: { index (in the inventory), type, entry, count, held }. Any item is
    // one slot with its count; a culture plate is one slot per plate, as in the inventory panel, and `held`
    // says which of a type the hand holds when that type is selected (js/game/plates.js).
    getHotbarItems() {
        const orderedTypes = [];
        const pushType = (type) => {
            if (!type || orderedTypes.includes(type) || this.getInventoryCount(type) <= 0) return;
            orderedTypes.push(type);
        };

        this.hotbarPinnedTypes.forEach(pushType);
        if (orderedTypes.length === 0) {
            pushType(this.hotbarPrimaryType);
        }
        this.inventory.forEach(pushType);

        const items = [];
        for (const type of orderedTypes) {
            const index = this.inventory.indexOf(type);
            if (index === -1) continue;
            const shown = this.plateInventoryItems ? this.plateInventoryItems(type) : [{ type, entry: null, count: this.getInventoryCount(type), held: true }];
            for (const item of shown) items.push({ index, held: true, ...item });
        }
        // A plate in the hand past the end still gets a slot: the last one of its type on show.
        const size = this.hotbarSize;
        const selected = items.findIndex((item) => item.index === this.selectedSlot && item.held);
        if (selected >= size) {
            let at = -1;
            for (let i = 0; i < size; i++) if (items[i].index === items[selected].index) at = i;
            if (at >= 0) items[at] = items[selected];
        }
        return items.slice(0, size);
    },

    // The inventory indexes of the types on the hotbar, each once, in order.
    getHotbarInventoryIndexes() {
        return [...new Set(this.getHotbarItems().map((item) => item.index))];
    },

    promoteTypeToHotbar(type) {
        if (!type || this.getInventoryCount(type) <= 0) return;
        this.hotbarPrimaryType = type;
        this.hotbarPinnedTypes = [type, ...this.getHotbarInventoryIndexes()
            .map((index) => this.inventory[index])
            .filter((itemType) => itemType && itemType !== type)]
            .slice(0, this.hotbarSize);
    },

    getHotbarSlotInventoryIndex(visibleIndex) {
        const item = this.getHotbarItems()[visibleIndex];
        return item ? item.index : null;
    },

    // Takes what a hotbar slot shows in the hand: for a culture plate, exactly that plate. Says whether it could.
    selectHotbarSlot(visibleIndex) {
        const item = this.getHotbarItems()[visibleIndex];
        if (!item) return false;
        if (this.plateSelect && plateIdentified(item.type)) this.plateSelect(item.type, item.entry ? item.entry.id : null);
        this.selectSlot(item.index);
        return true;
    },

    // The wheel: the next (1) or previous (-1) hotbar slot, round the end.
    stepHotbarSelection(direction) {
        const items = this.getHotbarItems();
        if (items.length === 0) return;
        const current = items.findIndex((item) => item.index === this.selectedSlot && item.held);
        const start = current === -1 ? 0 : current;
        this.selectHotbarSlot((start + direction + items.length) % items.length);
    },

    updateHotbarCounts() {
        const items = this.getHotbarItems();
        for (let i = 0; i < this.hotbarSize; i++) {
            const item = items[i];
            const slotEl = this.hotbarSlotElements[i];
            const countEl = this.hotbarCountElements[i];
            if (!slotEl || !countEl) continue;

            if (!item) {
                slotEl.style.backgroundImage = '';
                slotEl.style.backgroundColor = 'rgba(0,0,0,0.2)';
                slotEl.classList.remove('selected');
                slotEl.classList.add('empty');
                countEl.textContent = '';
                slotEl.title = '';
                continue;
            }

            const { type, entry } = item;
            // A culture plate is its own slot, with its own colonies (js/game/plates.js).
            const plate = Boolean(this.plateTitle) && plateIdentified(type);
            slotEl.style.backgroundImage = `url(${entry ? this.plateIconUrl(entry) : this.world.getInventoryIconUrl(type)})`;
            slotEl.style.backgroundColor = '#' + this.world.blockTypes[type].color.toString(16).padStart(6, '0');
            countEl.textContent = item.count;
            slotEl.title = plate ? this.plateTitle(type, entry && entry.culture) : '';
            slotEl.classList.remove('empty');
            slotEl.classList.toggle('selected', item.index === this.selectedSlot && item.held);
        }
    },

    renderInventoryPanel() {
        const panel = document.getElementById('inventory-panel');
        const grid = document.getElementById('inventory-grid');
        if (!panel || !grid) return;

        panel.classList.toggle('visible', this.inventoryOpen);
        const searchInput = document.getElementById('inventory-search');
        if (searchInput && searchInput.value !== this.inventorySearchTerm) {
            searchInput.value = this.inventorySearchTerm;
        }
        grid.innerHTML = '';
        this.offhandRenderHud();

        const query = this.inventorySearchTerm.trim();
        const parsed = itemTagParseQuery(this.inventorySearchTerm);
        const index = this.getItemTagIndex();
        const visibleItems = this.inventory
            .map((type, slot) => ({ type, slot }))
            .filter(({ type }) => this.getInventoryCount(type) > 0)
            .filter(({ type }) => {
                if (parsed.empty) return true;
                const entry = index.entry(type);
                return itemTagMatches(parsed, entry.set, entry.text);
            });
        this.renderPanelTags('inventory', this.inventoryOpen, parsed, visibleItems.map(({ type }) => index.entry(type).tags));

        if (visibleItems.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'inventory-empty-message';
            empty.textContent = query ? 'No items match your search' : 'No items in inventory';
            grid.appendChild(empty);
            return;
        }

        // A culture plate is one item per plate, each with its own colonies (js/game/plates.js).
        const shownItems = visibleItems.flatMap(({ type, slot }) => (this.plateInventoryItems ? this.plateInventoryItems(type) : [{ type, entry: null, count: this.getInventoryCount(type), held: true }])
            .map((shown) => ({ ...shown, slot, plate: Boolean(this.plateInventoryItems) && plateIdentified(type) })));
        shownItems.forEach(({ type, slot, entry, count: amount, plate, held }) => {
            const item = document.createElement('div');
            item.className = 'inventory-item' + (this.selectedSlot === slot && held ? ' selected' : '');
            const brief = index.brief(type, ITEM_TAG_BRIEF_MAX.inventory);
            if (brief) item.dataset.tags = brief;
            const tags = index.entry(type).tags.map((tag) => itemTagLabel(tag)).join(' ');
            item.title = plate ? `${this.plateTitle(type, entry && entry.culture)}\n${tags}` : `${this.getBlockDisplayName(type)}\n${tags}`;
            item.addEventListener('click', () => {
                if (plate) this.plateSelect(type, entry ? entry.id : null);
                this.selectSlot(slot, { promoteToHotbar: true });
                this.closeInventoryPanel();
            });

            const icon = document.createElement('div');
            icon.className = 'inventory-item-icon';
            icon.style.backgroundImage = `url(${entry ? this.plateIconUrl(entry) : this.world.getInventoryIconUrl(type)})`;
            icon.style.backgroundColor = '#' + this.world.blockTypes[type].color.toString(16).padStart(6, '0');

            const name = document.createElement('div');
            name.className = 'inventory-item-name';
            name.textContent = this.getBlockDisplayName(type);

            const count = document.createElement('div');
            count.className = 'inventory-item-count';
            count.textContent = `x${amount}`;

            item.appendChild(icon);
            item.appendChild(name);
            item.appendChild(count);
            this.offhandDecorateItem(item, type);
            grid.appendChild(item);
        });
    },

    // The tags of every item, worked out once (js/game/item_tags.js).
    getItemTagIndex() {
        const blockTypes = this.world && this.world.blockTypes;
        if (!this.itemTagIndex || this.itemTagIndex.blockTypes !== blockTypes) this.itemTagIndex = new ItemTagIndex(blockTypes || {});
        return this.itemTagIndex;
    },

    // The row of chips under a search field: the most useful tags of what is on show (itemTagChips).
    renderPanelTags(panel, open, parsed, tagLists) {
        if (!this.panelTagRows) {
            this.panelTagRows = {};
            // The panels change width with the window: the row is fitted again, from widths already known.
            window.addEventListener('resize', () => {
                if (this.inventoryOpen) this.drawPanelTags('inventory');
                if (this.craftingOpen) this.drawPanelTags('crafting');
            });
        }
        this.panelTagRows[panel] = { chips: open ? itemTagChips(parsed, tagLists) : [], active: parsed.exact };
        this.drawPanelTags(panel);
    },

    makePanelTag(panel, tag, active) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'panel-tag' + (active ? ' active' : '');
        chip.textContent = itemTagLabel(tag);
        chip.dataset.tag = tag;
        // The field keeps the focus, and with it the keys: a chip must not take them to the game.
        chip.addEventListener('mousedown', (event) => event.preventDefault());
        chip.addEventListener('click', () => this.togglePanelTag(panel, tag));
        return chip;
    },

    // The width of each chip, measured once for each label: all that are new in one go, before anything is painted.
    measurePanelTags(box, panel, chips) {
        if (!this.panelTagWidths) this.panelTagWidths = new Map();
        const keyOf = (tag) => `${this.touchControlsEnabled ? 'touch' : 'mouse'}|${itemTagLabel(tag)}`;
        const fresh = chips.filter((tag) => !this.panelTagWidths.has(keyOf(tag))).map((tag) => {
            const probe = this.makePanelTag(panel, tag, false);
            box.appendChild(probe);
            return { tag, probe };
        });
        for (const { tag, probe } of fresh) this.panelTagWidths.set(keyOf(tag), Math.ceil(probe.getBoundingClientRect().width));
        for (const { probe } of fresh) box.removeChild(probe);
        return chips.map((tag) => this.panelTagWidths.get(keyOf(tag)));
    },

    // Only what fits, whole, and only touching the page if that changed: a click is not lost when the list is redrawn.
    drawPanelTags(panel) {
        const box = document.getElementById(`${panel}-tags`);
        const row = this.panelTagRows && this.panelTagRows[panel];
        if (!box || !row) return;
        const available = box.clientWidth;
        // With no width the panel is not on the screen: nothing to cut yet, and the next drawing will.
        const chips = available > 0
            ? itemTagFitChips(this.measurePanelTags(box, panel, row.chips), available - 1).map((index) => row.chips[index])
            : row.chips;
        const shown = `${gameLang()}|${chips.join(' ')}|${row.active.join(' ')}`;
        if (box.dataset.shown === shown) return;
        box.dataset.shown = shown;
        box.innerHTML = '';
        for (const tag of chips) box.appendChild(this.makePanelTag(panel, tag, row.active.includes(tag)));
    },

    togglePanelTag(panel, tag) {
        const term = `${panel}SearchTerm`;
        this[term] = itemTagToggleInQuery(this[term], tag);
        if (panel === 'inventory') this.renderInventoryPanel();
        else this.renderCraftingPanel();
        const search = document.getElementById(`${panel}-search`);
        if (search && !this.touchControlsEnabled) search.focus();
    },

    openInventoryPanel() {
        this.inventoryOpen = true;
        // Every opening starts from the whole list, not from the last search.
        this.inventorySearchTerm = '';
        this.stopMining();
        this.closeChatInput();
        if (document.pointerLockElement === this.renderer.domElement) {
            document.exitPointerLock();
        }
        this.renderInventoryPanel();
        const search = document.getElementById('inventory-search');
        if (search) search.placeholder = itemTagSearchHint('items');
        // On a phone, focusing would pop up the keyboard over the items.
        if (search && !this.touchControlsEnabled) search.focus();
    },

    closeInventoryPanel() {
        this.inventoryOpen = false;
        this.renderInventoryPanel();
        this.recapturePointerLock();
    },

    toggleInventoryPanel() {
        if (this.inventoryOpen) {
            this.closeInventoryPanel();
        } else {
            this.openInventoryPanel();
        }
    },

    ensureInventorySlot(type) {
        if (this.inventory.includes(type)) return;
        this.inventory.push(type);
        this.inventoryCounts[type] = this.inventoryCounts[type] || 0;
        this.initHotbar();
        this.selectSlot(Math.min(this.selectedSlot, this.inventory.length - 1));
        this.saveInventoryState();
    },

    getSelectedBlockType() {
        return this.inventory[this.selectedSlot] || null;
    },

    getItemDefinition(type) {
        return this.world && this.world.blockTypes ? this.world.blockTypes[type] : null;
    },

    getToolMiningMultiplier(toolType, blockType) {
        const toolDef = this.getItemDefinition(toolType);
        const blockDef = this.getItemDefinition(blockType);
        if (!toolDef || !toolDef.toolType || !blockDef) return 1;

        // Tools registered from other files may bring their own tier (miningTier).
        const tier = toolDef.miningTier || { wood: 1.45, stone: 1.9, iron: 2.6, gold: 3.2 }[toolDef.toolMaterial] || 1;
        return this.toolFitsBlock(toolType, blockType) ? tier : Math.max(1, tier * 0.55);
    },

    // Whether `toolType` is the right tool for that block.
    toolFitsBlock(toolType, blockType) {
        const toolDef = this.getItemDefinition(toolType);
        const blockDef = this.getItemDefinition(blockType);
        if (!toolDef || !toolDef.toolType || !blockDef) return false;
        const category = blockDef.category || (blockType.includes('wood') || blockType.includes('planks') ? 'wood' : blockType.includes('leaves') ? 'leaves' : blockType === 'dirt' || blockType === 'sand' ? 'soil' : 'stone');
        return (toolDef.toolType === 'pickaxe' && (category === 'stone' || category === 'element')) ||
            (toolDef.toolType === 'shovel' && (category === 'soil' || blockType === 'dirt' || blockType === 'sand' || blockType === 'grass')) ||
            (toolDef.toolType === 'axe' && category === 'wood') ||
            (toolDef.toolType === 'hoe' && (category === 'leaves' || blockType === 'grass')) ||
            (toolDef.toolType === 'shears' && (category === 'leaves' || category === 'wool'));
    },

    getAdjustedBreakDuration(blockType, baseDuration) {
        if (!blockType || !baseDuration) return baseDuration;
        // What is really in the hands: the selected slot still names the last unit after it went to the left hand.
        const right = this.getSelectedHeldItemType();
        const pair = this.offhandPairMultiplier(right, blockType);
        const multiplier = pair || this.getToolMiningMultiplier(right, blockType);
        return Math.max(0.08, baseDuration / multiplier);
    },

    getInventoryCount(type) {
        return this.inventoryCounts[type] || 0;
    },

    addInventory(type, amount = 1) {
        if (!type || amount <= 0) return;
        this.ensureInventorySlot(type);
        this.inventoryCounts[type] = this.getInventoryCount(type) + amount;
        this.updateHotbarCounts();
        this.refreshHeldItemMesh();
        this.renderCraftingPanel();
        this.renderInventoryPanel();
        this.saveInventoryState();
    },

    consumeSelectedBlock() {
        const type = this.getSelectedBlockType();
        if (!type) return false;

        const count = this.getInventoryCount(type);
        if (count <= 0) return false;

        this.inventoryCounts[type] = count - 1;
        this.updateHotbarCounts();
        this.refreshHeldItemMesh();
        this.renderCraftingPanel();
        this.renderInventoryPanel();
        this.saveInventoryState();
        return true;
    },

    rebuildPickupMeshes() {
        for (const pickup of this.pickups.values()) {
            if (pickup.mesh) {
                this.scene.remove(pickup.mesh);
                this.disposeObject3D(pickup.mesh);
            }
            pickup.mesh = this.world.createDisplayMesh(pickup.type, 0.34);
            pickup.mesh.position.copy(pickup.position);
            pickup.mesh.rotation.set(pickup.rotation.x, pickup.rotation.y, pickup.rotation.z);
            this.scene.add(pickup.mesh);
        }
    },

    getDropLandingY(x, z, startY) {
        const ix = Math.floor(x);
        const iz = Math.floor(z);
        for (let y = Math.floor(startY); y >= WORLD_MIN_Y; y--) {
            if (this.world.hasSolidBlock(ix, y, iz)) {
                return y + 1;
            }
        }
        return WORLD_MIN_Y;
    },

    spawnFallingBlockDrop(type, position) {
        const mesh = this.world.createDisplayMesh(type, 0.92);
        const blockPos = new THREE.Vector3(position.x + 0.5, position.y + 0.5, position.z + 0.5);
        mesh.position.copy(blockPos);
        this.scene.add(mesh);

        this.fallingBlockDrops.push({
            type,
            position: blockPos,
            velocity: new THREE.Vector3(0, 0, 0),
            landingY: this.getDropLandingY(blockPos.x, blockPos.z, position.y - 1),
            mesh
        });
    },

    updateFallingBlockDrops(delta) {
        for (let i = this.fallingBlockDrops.length - 1; i >= 0; i--) {
            const falling = this.fallingBlockDrops[i];
            falling.velocity.y -= 12 * delta;
            falling.position.addScaledVector(falling.velocity, delta);
            falling.mesh.position.copy(falling.position);
            falling.mesh.rotation.y += delta * 1.2;

            if (falling.position.y <= falling.landingY + 0.18) {
                this.scene.remove(falling.mesh);
                this.disposeObject3D(falling.mesh);
                this.fallingBlockDrops.splice(i, 1);
                this.spawnPickup(falling.type, { x: falling.position.x - 0.5, y: falling.landingY, z: falling.position.z - 0.5 }, 1, {
                    velocity: new THREE.Vector3(0, 0.4, 0)
                });
            }
        }
    },

    spawnPickup(type, position, amount = 1, options = {}) {
        if (!type) return;

        const id = `pickup_${this.pickupIdCounter++}`;
        const initialVelocity = options.velocity || new THREE.Vector3((Math.random() - 0.5) * 1.1, 2.2 + Math.random() * 0.7, (Math.random() - 0.5) * 1.1);
        const pickup = {
            id: id,
            type: type,
            amount: amount,
            position: new THREE.Vector3(position.x + 0.5, position.y + 0.35, position.z + 0.5),
            velocity: initialVelocity.clone(),
            rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
            floatPhase: Math.random() * Math.PI * 2,
            age: 0,
            settleHeight: position.y + 0.42,
            settled: false,
            mesh: this.world.createDisplayMesh(type, 0.34)
        };
        // A culture plate on the ground is still that plate (js/game/plates.js).
        if (options.plate) pickup.plate = options.plate;

        pickup.mesh.position.copy(pickup.position);
        pickup.mesh.rotation.copy(pickup.rotation);
        this.scene.add(pickup.mesh);
        this.pickups.set(id, pickup);
    },

    dropSelectedBlock() {
        const type = this.getSelectedBlockType();
        if (!type || this.getInventoryCount(type) <= 0) return;

        // A culture plate drops as the one in the hand, and is that one when picked up.
        let plate = null;
        if (this.plateTakeOut && plateIdentified(type)) {
            plate = this.plateTakeOut(type);
            if (plate === undefined) return;
            this.updateHotbarCounts();
            this.refreshHeldItemMesh();
            this.renderCraftingPanel();
            this.renderInventoryPanel();
            this.saveInventoryState();
        } else if (!this.consumeSelectedBlock()) return;

        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        const dropPosition = {
            x: this.camera.position.x + direction.x * 1.1,
            y: this.camera.position.y - this.cameraController.eyeHeight * 0.35,
            z: this.camera.position.z + direction.z * 1.1
        };
        const velocity = direction.multiplyScalar(2.6).add(new THREE.Vector3(0, 1.4, 0));
        this.spawnPickup(type, dropPosition, 1, { velocity: velocity, ...(plate ? { plate } : {}) });
        this.playPlaceSound(type);
    },

    collectPickup(id) {
        const pickup = this.pickups.get(id);
        if (!pickup) return;

        if (pickup.plate && this.plateAdd) this.plateAdd(pickup.plate);
        else this.addInventory(pickup.type, pickup.amount);
        this.playPickupSound();
        this.scene.remove(pickup.mesh);
        this.disposeObject3D(pickup.mesh);
        this.pickups.delete(id);
    },

    updatePickups(delta) {
        const playerPos = this.cameraController.getPosition();
        const playerVector = new THREE.Vector3(playerPos.x, playerPos.y - 1.1, playerPos.z);
        const magnetRadius = 3.4;

        for (const [id, pickup] of this.pickups) {
            pickup.age += delta;
            const distanceToPlayer = pickup.position.distanceTo(playerVector);

            if (!pickup.settled) {
                pickup.velocity.y -= 8.5 * delta;
                pickup.position.addScaledVector(pickup.velocity, delta);

                if (pickup.position.y <= pickup.settleHeight && pickup.velocity.y <= 0) {
                    pickup.position.y = pickup.settleHeight;
                    pickup.settled = true;
                }
            } else {
                pickup.position.y = pickup.settleHeight + Math.sin(pickup.age * 3 + pickup.floatPhase) * 0.08;
            }

            if (pickup.age > 0.18 && distanceToPlayer < magnetRadius) {
                const direction = playerVector.clone().sub(pickup.position);
                const distanceFactor = 1 - distanceToPlayer / magnetRadius;
                if (direction.lengthSq() > 0.0001) {
                    direction.normalize();
                    pickup.position.addScaledVector(direction, delta * (2.4 + distanceFactor * 5.5));
                    pickup.position.y += delta * distanceFactor * 0.8;
                    pickup.settled = false;
                }
            }

            pickup.rotation.x += delta * 1.1;
            pickup.rotation.y += delta * 2.7;
            pickup.rotation.z += delta * 0.35;

            pickup.mesh.position.copy(pickup.position);
            pickup.mesh.rotation.copy(pickup.rotation);

            if (pickup.age > 0.3 && pickup.position.distanceTo(playerVector) < 1.25) {
                this.collectPickup(id);
            }
        }
    },

    refreshHeldItemMesh(forceRebuild = false) {
        this.offhandRefreshMesh(forceRebuild);
        if (!this.firstPersonItemAnchor || !this.world) return;

        const selectedType = this.getSelectedBlockType();
        const hasSelectedItem = selectedType && this.getInventoryCount(selectedType) > 0;

        if (!hasSelectedItem) {
            if (this.heldItemMesh) {
                this.firstPersonItemAnchor.remove(this.heldItemMesh);
                this.disposeObject3D(this.heldItemMesh);
                this.heldItemMesh = null;
                this.heldItemType = null;
            }
            return;
        }

        if (!forceRebuild && this.heldItemMesh && this.heldItemType === selectedType) {
            return;
        }

        if (this.heldItemMesh) {
            this.firstPersonItemAnchor.remove(this.heldItemMesh);
            this.disposeObject3D(this.heldItemMesh);
        }

        const heldItem = this.world.createDisplayMesh(selectedType, 0.24);
        const def = this.world.blockTypes[selectedType];
        if (def && def.itemOnly) {
            heldItem.position.set(0.34, -0.14, -0.02);
            heldItem.rotation.set(0.24, 0.64, 0.08);
        } else {
            heldItem.position.set(0, 0, 0);
            heldItem.rotation.set(0.34, 0.68, 0.12);
        }
        heldItem.renderOrder = 10001;
        heldItem.frustumCulled = false;
        heldItem.traverse((node) => {
            if (node.material) {
                node.renderOrder = 10001 + (node.userData.viewLayer || 0);
                node.frustumCulled = false;
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                materials.forEach((material) => {
                    material.transparent = true;
                    material.opacity = 1;
                    material.depthTest = false;
                    material.depthWrite = false;
                });
            }
        });

        this.firstPersonItemAnchor.add(heldItem);
        this.heldItemMesh = heldItem;
        this.heldItemType = selectedType;
    },

    selectSlot(index, options = {}) {
        this.selectedSlot = Math.max(0, Math.min(index, this.inventory.length - 1));
        if (options.promoteToHotbar) {
            this.promoteTypeToHotbar(this.inventory[this.selectedSlot]);
        }
        this.updateHotbarCounts();
        this.renderInventoryPanel();
        this.refreshHeldItemMesh();
        this.saveInventoryState();
    },

    // Puts an item the player carries in the hand: its hotbar slot if it has one (the hotbar keeps its
    // order), or onto the hotbar first, as a crafted item goes. Says whether it could.
    selectInventoryType(type) {
        const index = this.inventory.indexOf(type);
        if (index < 0 || this.getInventoryCount(type) <= 0) return false;
        this.selectSlot(index, { promoteToHotbar: !this.getHotbarInventoryIndexes().includes(index) });
        return true;
    },

    canCraftRecipe(recipe) {
        return recipe.inputs.every((input) => this.getInventoryCount(input.type) >= input.amount);
    },

    getRecipeSearchText(recipe) {
        if (!this.recipeSearchTexts) this.recipeSearchTexts = new WeakMap();
        let text = this.recipeSearchTexts.get(recipe);
        if (text === undefined) {
            text = itemTagFold([
                recipe.name,
                this.getBlockDisplayName(recipe.output.type),
                ...recipe.inputs.map((input) => this.getBlockDisplayName(input.type))
            ].join(' '));
            this.recipeSearchTexts.set(recipe, text);
        }
        return text;
    },

    renderCraftingPanel() {
        const panel = document.getElementById('crafting-panel');
        const list = document.getElementById('crafting-recipes');
        const searchInput = document.getElementById('crafting-search');
        if (!panel || !list) return;

        panel.classList.toggle('visible', this.craftingOpen);
        if (searchInput && searchInput.value !== this.craftingSearchTerm) {
            searchInput.value = this.craftingSearchTerm;
        }
        list.innerHTML = '';

        const parsed = itemTagParseQuery(this.craftingSearchTerm);
        const index = this.getItemTagIndex();
        // A recipe has the tags of what it makes; its text also has what it takes.
        const visibleRecipes = this.craftingRecipes.filter((recipe) => {
            if (parsed.empty) return true;
            return itemTagMatches(parsed, index.entry(recipe.output.type).set, this.getRecipeSearchText(recipe));
        });
        this.renderPanelTags('crafting', this.craftingOpen, parsed, visibleRecipes.map((recipe) => index.entry(recipe.output.type).tags));

        if (this.selectedCraftingRecipeId && !visibleRecipes.some((recipe) => recipe.id === this.selectedCraftingRecipeId)) {
            this.selectedCraftingRecipeId = null;
        }

        if (visibleRecipes.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'craft-empty';
            empty.textContent = 'No recipes match your search';
            list.appendChild(empty);
        }

        visibleRecipes.forEach((recipe) => {
            const canCraft = this.canCraftRecipe(recipe);
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'craft-card' + (canCraft ? '' : ' unavailable') + (recipe.id === this.selectedCraftingRecipeId ? ' selected' : '');
            const brief = index.brief(recipe.output.type, ITEM_TAG_BRIEF_MAX.crafting);
            if (brief) card.dataset.tags = brief;
            card.addEventListener('click', () => {
                this.selectedCraftingRecipeId = recipe.id;
                this.renderCraftingPanel();
            });

            const icon = document.createElement('div');
            icon.className = 'craft-card-icon';
            icon.style.backgroundImage = `url(${this.world.getInventoryIconUrl(recipe.output.type)})`;
            icon.style.backgroundColor = '#' + this.world.blockTypes[recipe.output.type].color.toString(16).padStart(6, '0');

            const name = document.createElement('div');
            name.className = 'craft-card-name';
            name.textContent = this.getBlockDisplayName(recipe.output.type);

            const amount = document.createElement('div');
            amount.className = 'craft-card-amount';
            amount.textContent = `Creates x${recipe.output.amount}`;

            card.appendChild(icon);
            card.appendChild(name);
            card.appendChild(amount);
            list.appendChild(card);
        });

        this.renderCraftingDetail();
    },

    renderCraftingDetail() {
        const detail = document.getElementById('crafting-detail');
        if (!detail) return;

        const recipe = this.craftingRecipes.find((item) => item.id === this.selectedCraftingRecipeId);
        detail.innerHTML = '';
        detail.classList.toggle('visible', Boolean(recipe));
        if (!recipe) return;

        const canCraft = this.canCraftRecipe(recipe);
        const icon = document.createElement('div');
        icon.className = 'craft-detail-icon';
        icon.style.backgroundImage = `url(${this.world.getInventoryIconUrl(recipe.output.type)})`;
        icon.style.backgroundColor = '#' + this.world.blockTypes[recipe.output.type].color.toString(16).padStart(6, '0');

        const body = document.createElement('div');
        body.className = 'craft-detail-body';

        const title = document.createElement('div');
        title.className = 'craft-detail-title';
        title.textContent = recipe.name;

        const meta = document.createElement('div');
        meta.className = 'craft-detail-meta';
        meta.textContent = `Output: ${recipe.output.amount} x ${this.getBlockDisplayName(recipe.output.type)}`;

        const materials = document.createElement('div');
        materials.className = 'craft-detail-materials';
        materials.innerHTML = recipe.inputs.map((input) => {
            const owned = this.getInventoryCount(input.type);
            const missing = owned < input.amount;
            return `<span class="${missing ? 'missing' : ''}">${input.amount} x ${this.getBlockDisplayName(input.type)} (${owned} owned)</span>`;
        }).join('<br>');

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = canCraft ? 'Craft' : 'Missing materials';
        button.disabled = !canCraft;
        button.addEventListener('click', () => this.craftRecipe(recipe.id));

        const tags = document.createElement('div');
        tags.className = 'craft-detail-tags';
        tags.textContent = this.getItemTagIndex().entry(recipe.output.type).tags.map((tag) => itemTagLabel(tag)).join(' ');

        body.appendChild(title);
        body.appendChild(meta);
        body.appendChild(tags);
        body.appendChild(materials);
        body.appendChild(button);
        detail.appendChild(icon);
        detail.appendChild(body);
    },

    toggleCraftingPanel() {
        if (this.craftingOpen) {
            this.closeCraftingPanel();
        } else {
            this.openCraftingPanel();
        }
    },

    openCraftingPanel() {
        this.craftingOpen = true;
        // Every opening starts from the whole list. A search that hid the selected recipe has already
        // dropped the selection, so the first one is picked below and the detail never shows a hidden one.
        this.craftingSearchTerm = '';
        this.stopMining();
        this.closeChatInput();
        if (document.pointerLockElement === this.renderer.domElement) {
            document.exitPointerLock();
        }
        if (!this.selectedCraftingRecipeId && this.craftingRecipes.length > 0) {
            this.selectedCraftingRecipeId = this.craftingRecipes[0].id;
        }
        this.renderCraftingPanel();
        const search = document.getElementById('crafting-search');
        if (search) search.placeholder = itemTagSearchHint('recipes');
        if (search && !this.touchControlsEnabled) search.focus();
    },

    closeCraftingPanel() {
        this.craftingOpen = false;
        this.renderCraftingPanel();
        this.recapturePointerLock();
    },

    craftRecipe(recipeId) {
        const recipe = this.craftingRecipes.find((item) => item.id === recipeId);
        if (!recipe || !this.canCraftRecipe(recipe)) return;

        recipe.inputs.forEach((input) => {
            this.inventoryCounts[input.type] = Math.max(0, this.getInventoryCount(input.type) - input.amount);
        });
        this.addInventory(recipe.output.type, recipe.output.amount);
        this.promoteTypeToHotbar(recipe.output.type);
        this.selectedSlot = this.inventory.indexOf(recipe.output.type);
        this.updateHotbarCounts();
        this.renderCraftingPanel();
        this.renderInventoryPanel();
        this.refreshHeldItemMesh();
        this.saveInventoryState();
        this.playTone({ frequency: 520, duration: 0.06, type: 'triangle', volume: 0.024, release: 0.07 });
    }
});
