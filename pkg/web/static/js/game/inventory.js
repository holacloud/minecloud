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
        window.localStorage.setItem('minecloud-inventory-state', JSON.stringify({
            inventory: this.inventory,
            counts: this.inventoryCounts,
            selectedSlot: this.selectedSlot,
            hotbarPrimaryType: this.hotbarPrimaryType,
            hotbarPinnedTypes: this.hotbarPinnedTypes
        }));
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
                const inventoryIndex = this.getHotbarSlotInventoryIndex(visibleIndex);
                if (inventoryIndex !== null) {
                    this.selectSlot(inventoryIndex);
                }
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

    getHotbarInventoryIndexes() {
        const available = this.inventory
            .map((type, index) => ({ type, index }))
            .filter((item) => this.getInventoryCount(item.type) > 0);

        const orderedTypes = [];
        const pushType = (type) => {
            if (!type || orderedTypes.includes(type) || this.getInventoryCount(type) <= 0) return;
            orderedTypes.push(type);
        };

        this.hotbarPinnedTypes.forEach(pushType);
        if (orderedTypes.length === 0) {
            pushType(this.hotbarPrimaryType);
        }
        available.forEach((item) => pushType(item.type));

        return orderedTypes.slice(0, this.hotbarSize).map((type) => this.inventory.indexOf(type)).filter((index) => index !== -1);
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
        const indexes = this.getHotbarInventoryIndexes();
        return Number.isInteger(indexes[visibleIndex]) ? indexes[visibleIndex] : null;
    },

    updateHotbarCounts() {
        const hotbarIndexes = this.getHotbarInventoryIndexes();
        for (let i = 0; i < this.hotbarSize; i++) {
            const inventoryIndex = hotbarIndexes[i];
            const type = this.inventory[inventoryIndex];
            const count = this.getInventoryCount(type);
            const slotEl = this.hotbarSlotElements[i];
            const countEl = this.hotbarCountElements[i];
            if (!slotEl || !countEl) continue;

            if (!type) {
                slotEl.style.backgroundImage = '';
                slotEl.style.backgroundColor = 'rgba(0,0,0,0.2)';
                slotEl.classList.remove('selected');
                slotEl.classList.add('empty');
                countEl.textContent = '';
                continue;
            }

            slotEl.style.backgroundImage = `url(${this.world.getInventoryIconUrl(type)})`;
            slotEl.style.backgroundColor = '#' + this.world.blockTypes[type].color.toString(16).padStart(6, '0');
            countEl.textContent = count;
            slotEl.classList.remove('empty');
            slotEl.classList.toggle('selected', inventoryIndex === this.selectedSlot);
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

        const query = this.inventorySearchTerm.trim().toLowerCase();
        const visibleItems = this.inventory
            .map((type, index) => ({ type, index }))
            .filter(({ type }) => this.getInventoryCount(type) > 0)
            .filter(({ type }) => {
                if (!query) return true;
                const searchable = `${type} ${this.getBlockDisplayName(type)}`.toLowerCase();
                return searchable.includes(query);
            });

        if (visibleItems.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'inventory-empty-message';
            empty.textContent = query ? 'No items match your search' : 'No items in inventory';
            grid.appendChild(empty);
            return;
        }

        visibleItems.forEach(({ type, index }) => {
            const item = document.createElement('div');
            item.className = 'inventory-item' + (this.selectedSlot === index ? ' selected' : '');
            item.addEventListener('click', () => {
                this.selectSlot(index, { promoteToHotbar: true });
                this.closeInventoryPanel();
            });

            const icon = document.createElement('div');
            icon.className = 'inventory-item-icon';
            icon.style.backgroundImage = `url(${this.world.getInventoryIconUrl(type)})`;
            icon.style.backgroundColor = '#' + this.world.blockTypes[type].color.toString(16).padStart(6, '0');

            const name = document.createElement('div');
            name.className = 'inventory-item-name';
            name.textContent = this.getBlockDisplayName(type);

            const count = document.createElement('div');
            count.className = 'inventory-item-count';
            count.textContent = `x${this.getInventoryCount(type)}`;

            item.appendChild(icon);
            item.appendChild(name);
            item.appendChild(count);
            grid.appendChild(item);
        });
    },

    openInventoryPanel() {
        this.inventoryOpen = true;
        this.stopMining();
        this.closeChatInput();
        if (document.pointerLockElement === this.renderer.domElement) {
            document.exitPointerLock();
        }
        this.renderInventoryPanel();
        const search = document.getElementById('inventory-search');
        if (search) search.focus();
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

        const tier = { wood: 1.45, stone: 1.9, iron: 2.6, gold: 3.2 }[toolDef.toolMaterial] || 1;
        const category = blockDef.category || (blockType.includes('wood') || blockType.includes('planks') ? 'wood' : blockType.includes('leaves') ? 'leaves' : blockType === 'dirt' || blockType === 'sand' ? 'soil' : 'stone');
        const effective = (toolDef.toolType === 'pickaxe' && (category === 'stone' || category === 'element')) ||
            (toolDef.toolType === 'shovel' && (category === 'soil' || blockType === 'dirt' || blockType === 'sand' || blockType === 'grass')) ||
            (toolDef.toolType === 'axe' && category === 'wood') ||
            (toolDef.toolType === 'hoe' && (category === 'leaves' || blockType === 'grass')) ||
            (toolDef.toolType === 'shears' && (category === 'leaves' || category === 'wool'));
        return effective ? tier : Math.max(1, tier * 0.55);
    },

    getAdjustedBreakDuration(blockType, baseDuration) {
        if (!blockType || !baseDuration) return baseDuration;
        const multiplier = this.getToolMiningMultiplier(this.getSelectedBlockType(), blockType);
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
        for (let y = Math.floor(startY); y >= -5; y--) {
            if (this.world.hasSolidBlock(ix, y, iz)) {
                return y + 1;
            }
        }
        return -4;
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

        pickup.mesh.position.copy(pickup.position);
        pickup.mesh.rotation.copy(pickup.rotation);
        this.scene.add(pickup.mesh);
        this.pickups.set(id, pickup);
    },

    dropSelectedBlock() {
        const type = this.getSelectedBlockType();
        if (!type || this.getInventoryCount(type) <= 0) return;

        if (!this.consumeSelectedBlock()) return;

        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        const dropPosition = {
            x: this.camera.position.x + direction.x * 1.1,
            y: this.camera.position.y - this.cameraController.eyeHeight * 0.35,
            z: this.camera.position.z + direction.z * 1.1
        };
        const velocity = direction.multiplyScalar(2.6).add(new THREE.Vector3(0, 1.4, 0));
        this.spawnPickup(type, dropPosition, 1, { velocity: velocity });
        this.playPlaceSound(type);
    },

    collectPickup(id) {
        const pickup = this.pickups.get(id);
        if (!pickup) return;

        this.addInventory(pickup.type, pickup.amount);
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
                node.renderOrder = 10001;
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

    canCraftRecipe(recipe) {
        return recipe.inputs.every((input) => this.getInventoryCount(input.type) >= input.amount);
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

        const query = this.craftingSearchTerm.trim().toLowerCase();
        const visibleRecipes = this.craftingRecipes.filter((recipe) => {
            if (!query) return true;
            const searchable = [
                recipe.name,
                this.getBlockDisplayName(recipe.output.type),
                ...recipe.inputs.map((input) => this.getBlockDisplayName(input.type))
            ].join(' ').toLowerCase();
            return searchable.includes(query);
        });

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

        body.appendChild(title);
        body.appendChild(meta);
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
        if (search) search.focus();
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
