// Block targeting, mining feedback and block placement.
// Mixed into Game.prototype; `this` is the Game instance.

Object.assign(Game.prototype, {
    updateBlockInspector(worldPos) {
        const inspector = document.getElementById('block-inspector');
        if (!inspector) return;

        if (!worldPos) {
            inspector.classList.remove('visible');
            inspector.innerHTML = '';
            return;
        }

        const type = this.world.getBlockTypeAt(worldPos.x, worldPos.y, worldPos.z);
        if (!type) {
            inspector.classList.remove('visible');
            inspector.innerHTML = '';
            return;
        }

        const name = this.getBlockDisplayName(type);
        const breakDuration = this.world.getBreakDurationAt(worldPos.x, worldPos.y, worldPos.z);
        const signText = type === 'sign' ? this.world.getSignTextAt(worldPos.x, worldPos.y, worldPos.z) : '';
        const lines = [
            `<span class="label">Block:</span> ${name}`,
            `<span class="label">Coords:</span> ${worldPos.x}, ${worldPos.y}, ${worldPos.z}`,
            `<span class="label">Break time:</span> ${breakDuration ? `${breakDuration.toFixed(2)}s` : 'Unbreakable'}`
        ];

        if (signText) {
            const preview = signText.length > 72 ? `${signText.slice(0, 72)}...` : signText;
            lines.push(`<span class="label">Sign:</span> ${preview}`);
        }

        if (type === 'sound_block') {
            const state = this.world.getSoundBlockStateAt(worldPos.x, worldPos.y, worldPos.z);
            lines.push(`<span class="label">Sound:</span> ${state.instrument} note ${state.note + 1}`);
            lines.push('<span class="label">Use:</span> F play, Shift+F tune');
        }

        if (this.getSelectedBlockType() === 'spray_paint') {
            const remaining = Math.max(0, Math.ceil((this.sprayActiveUntil - performance.now()) / 1000));
            lines.push(`<span class="label">Spray:</span> ${this.sprayColors[this.sprayColorIndex]}${remaining ? `, ${remaining}s` : ''}`);
            lines.push('<span class="label">Use:</span> Right click paint, F color');
        }

        inspector.innerHTML = lines.join('<br>');
        inspector.classList.add('visible');
    },

    initMiningEffects() {
        this.breakParticleGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);

        this.miningOverlayTextures = this.createMiningOverlayTextures();
        this.miningOverlay = new THREE.Mesh(
            new THREE.BoxGeometry(1.018, 1.018, 1.018),
            new THREE.MeshBasicMaterial({
                map: this.miningOverlayTextures[0],
                transparent: true,
                opacity: 0.95,
                depthWrite: false
            })
        );
        this.miningOverlay.visible = false;
        this.miningOverlay.renderOrder = 20;
        this.scene.add(this.miningOverlay);
    },

    createMiningOverlayTextures() {
        const crackPaths = [
            [[8, 1], [8, 4], [7, 7], [8, 10], [7, 15]],
            [[2, 4], [5, 5], [8, 7], [10, 11], [14, 13]],
            [[13, 2], [11, 5], [9, 8], [8, 12], [10, 15]],
            [[1, 11], [4, 10], [7, 9], [10, 8], [15, 7]],
            [[4, 1], [5, 4], [4, 7], [5, 10], [4, 14]],
            [[12, 4], [10, 6], [8, 9], [6, 11], [4, 12]],
            [[1, 2], [4, 4], [6, 6], [9, 7], [13, 8]],
            [[15, 3], [12, 5], [10, 7], [7, 10], [5, 14]]
        ];
        const textures = [];

        for (let stage = 0; stage < 8; stage++) {
            const canvas = document.createElement('canvas');
            canvas.width = 16;
            canvas.height = 16;

            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, 16, 16);
            ctx.strokeStyle = `rgba(20, 20, 20, ${0.12 + stage * 0.045})`;
            ctx.lineWidth = 1;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            const pathCount = Math.max(1, Math.ceil(((stage + 1) / 10) * crackPaths.length));
            for (let i = 0; i < pathCount; i++) {
                const path = crackPaths[i];
                const segmentCount = Math.max(2, Math.ceil(((stage + 1) / 11) * path.length));

                ctx.beginPath();
                ctx.moveTo(path[0][0], path[0][1]);
                for (let j = 1; j < Math.min(segmentCount, path.length); j++) {
                    ctx.lineTo(path[j][0], path[j][1]);
                }
                ctx.stroke();
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            if (THREE.sRGBEncoding) {
                texture.encoding = THREE.sRGBEncoding;
            }
            texture.needsUpdate = true;
            textures.push(texture);
        }

        return textures;
    },

    getBreakParticleMaterial(type) {
        let material = this.breakParticleMaterials.get(type);
        if (material) return material;

        material = new THREE.MeshLambertMaterial({
            color: this.world.getBlockColorForType(type)
        });
        this.breakParticleMaterials.set(type, material);
        return material;
    },

    resetMiningTarget() {
        this.miningTargetKey = null;
        this.miningTargetDuration = 0;
        this.miningProgress = 0;
        this.miningTargetType = null;
        this.miningStrikeTimer = 0;
        if (this.miningOverlay) {
            this.miningOverlay.visible = false;
            this.miningOverlay.rotation.set(0, 0, 0);
        }
    },

    stopMining() {
        this.isBreakInputActive = false;
        this.resetMiningTarget();
        if (this.miningBlockVisual) {
            this.miningBlockVisual.returning = true;
        }
    },

    getLadderFacingFromNormal(normal) {
        if (Math.abs(normal.x) > Math.abs(normal.z)) return normal.x > 0 ? 'px' : 'nx';
        return normal.z > 0 ? 'pz' : 'nz';
    },

    // While a block is being mined it is cut out of its chunk mesh and drawn as a
    // standalone cube that shakes on every strike.
    bindMiningBlockVisual(hit, targetKey) {
        const position = hit ? this.world.getBlockPositionFromIntersection(hit) : null;
        const type = position ? this.world.getBlockTypeAt(position.x, position.y, position.z) : null;
        if (!position || !type || this.world.isCrossGeometry(type) || type === 'water') {
            if (this.miningBlockVisual && this.miningBlockVisual.key !== targetKey) {
                this.resetMiningBlockVisual(true);
            }
            return;
        }

        if (this.miningBlockVisual && this.miningBlockVisual.key === targetKey) {
            this.miningBlockVisual.returning = false;
            return;
        }

        if (this.miningBlockVisual) {
            this.resetMiningBlockVisual(true);
        }

        const mesh = new THREE.Mesh(this.world.getGeometry(type), this.world.getMaterial(type));
        mesh.position.set(position.x + 0.5, position.y + 0.5, position.z + 0.5);
        mesh.castShadow = this.rtxModeEnabled;
        mesh.receiveShadow = this.rtxModeEnabled;
        mesh.userData.blockPosition = { ...position };
        this.scene.add(mesh);
        this.world.setHiddenBlock(position);

        this.miningBlockVisual = {
            key: targetKey,
            mesh,
            position,
            currentRotation: new THREE.Vector3(0, 0, 0),
            targetRotation: new THREE.Vector3(0, 0, 0),
            returning: false
        };
    },

    resetMiningBlockVisual(immediate = false) {
        if (!this.miningBlockVisual) return;

        if (immediate) {
            this.disposeMiningBlockVisual();
            return;
        }

        this.miningBlockVisual.returning = true;
    },

    disposeMiningBlockVisual() {
        const visual = this.miningBlockVisual;
        if (!visual) return;
        this.scene.remove(visual.mesh);
        this.miningBlockVisual = null;
        this.world.setHiddenBlock(null);
    },

    applyMiningBlockVisual() {
        if (!this.miningBlockVisual) return;
        const { mesh, currentRotation } = this.miningBlockVisual;
        mesh.rotation.set(currentRotation.x, currentRotation.y, currentRotation.z);
    },

    kickMiningBlockVisual() {
        if (!this.miningBlockVisual) return;

        const axis = Math.floor(Math.random() * 3);
        const amount = (Math.random() * 0.05 + 0.025) * (Math.random() < 0.5 ? -1 : 1);
        this.miningBlockVisual.targetRotation.set(0, 0, 0);

        if (axis === 0) this.miningBlockVisual.targetRotation.x = amount;
        if (axis === 1) this.miningBlockVisual.targetRotation.y = amount;
        if (axis === 2) this.miningBlockVisual.targetRotation.z = amount;
    },

    updateMiningBlockVisual(delta) {
        if (!this.miningBlockVisual) return;

        const visual = this.miningBlockVisual;
        const targetDecay = Math.min(1, delta * (visual.returning ? 11 : 8));
        visual.targetRotation.lerp(this.miningBlockVisualZero, targetDecay);

        const rotationFollow = Math.min(1, delta * (visual.returning ? 12 : 18));
        visual.currentRotation.lerp(visual.targetRotation, rotationFollow);
        this.applyMiningBlockVisual();

        if (this.miningOverlay && this.miningOverlay.visible && this.miningTargetKey === visual.key && !visual.returning) {
            this.miningOverlay.rotation.set(visual.currentRotation.x, visual.currentRotation.y, visual.currentRotation.z);
        }

        if (!visual.returning) return;

        if (visual.currentRotation.distanceToSquared(this.miningBlockVisualZero) < 0.00001 &&
            visual.targetRotation.distanceToSquared(this.miningBlockVisualZero) < 0.00001) {
            this.disposeMiningBlockVisual();
        }
    },

    getInteractionRay() {
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        const reachOrigin = this.cameraViewMode === 'first'
            ? this.camera.position.clone()
            : (this.thirdPersonAnchor ? this.thirdPersonAnchor.clone() : this.cameraController.getPosition());
        return { origin: this.camera.position.clone(), direction, reachOrigin };
    },

    raycastBlock(maxDistance) {
        const ray = this.getInteractionRay();
        this.raycaster.set(ray.origin, ray.direction);

        const blocks = this.world.getInteractableObjects(ray.reachOrigin, maxDistance);
        // The block being mined is drawn outside its chunk mesh; keep it targetable.
        if (this.miningBlockVisual) blocks.push(this.miningBlockVisual.mesh);
        if (blocks.length === 0) return null;

        const intersects = this.raycaster.intersectObjects(blocks, false);
        for (const hit of intersects) {
            if (hit.point.distanceTo(ray.reachOrigin) <= maxDistance + 0.05) {
                return hit;
            }
        }

        return null;
    },

    finishBreakingBlock(position) {
        const blockType = this.world.getBlockTypeAt(position.x, position.y, position.z);
        const dropType = this.world.getDropTypeForBlock(blockType);
        if (!this.world.removeBlockAt(position.x, position.y, position.z)) return false;

        if (blockType === 'bed' && this.isRespawnBoundToBlock(position)) {
            this.respawnPoint = null;
            window.localStorage.removeItem('minecloud-respawn-point');
            this.receiveSystemMessage({ text: 'Respawn point reset because your bed was removed' });
        }

        if (dropType) {
            if (position.y + 0.5 > this.camera.position.y) {
                this.spawnFallingBlockDrop(dropType, position);
            } else {
                this.spawnPickup(dropType, position, 1);
            }
        }

        const bonusDrop = this.getExpansionBonusDrop(blockType);
        if (bonusDrop) {
            this.spawnPickup(bonusDrop, { x: position.x + 0.25, y: position.y + 0.2, z: position.z + 0.25 }, 1);
        }

        this.showHitIndicator();
        this.lastSelectionUpdate = 0;

        if (this.network.connected) {
            this.network.send('blockBreak', { x: position.x, y: position.y, z: position.z });
        }

        return true;
    },

    getExpansionBonusDrop(blockType) {
        if (!blockType) return null;
        if ((blockType === 'grass' || blockType.includes('leaves')) && Math.random() < 0.08) {
            const saplings = ['spruce_sapling', 'birch_sapling', 'jungle_sapling', 'acacia_sapling', 'dark_oak_sapling', 'cherry_sapling', 'maple_sapling', 'willow_sapling'];
            return saplings[Math.floor(Math.random() * saplings.length)];
        }
        if ((blockType === 'tall_grass' || blockType.includes('leaves')) && Math.random() < 0.035) {
            const eggs = ['sheep_egg', 'duck_egg', 'pig_egg', 'giraffe_egg', 'dog_egg', 'cat_egg', 'spider_egg', 'cave_monster_egg', 'macaw_egg'];
            return eggs[Math.floor(Math.random() * eggs.length)];
        }
        return null;
    },

    spawnMiningParticles(type, hitPoint, normal) {
        if (!type || !hitPoint || !normal) return;

        const material = this.getBreakParticleMaterial(type);
        const sideways = new THREE.Vector3(normal.z, 0, -normal.x);
        if (sideways.lengthSq() < 0.0001) {
            sideways.set(1, 0, 0);
        }
        sideways.normalize();

        const tangent = new THREE.Vector3().crossVectors(normal, sideways).normalize();
        const center = hitPoint.clone().addScaledVector(normal, 0.06);

        for (let i = 0; i < 3; i++) {
            const particle = new THREE.Mesh(this.breakParticleGeometry, material);
            particle.position.copy(center);
            particle.position.addScaledVector(sideways, (Math.random() - 0.5) * 0.18);
            particle.position.addScaledVector(tangent, (Math.random() - 0.5) * 0.18);
            particle.scale.setScalar(0.7 + Math.random() * 0.8);
            particle.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            particle.userData.velocity = normal.clone().multiplyScalar(0.9 + Math.random() * 0.7)
                .addScaledVector(sideways, (Math.random() - 0.5) * 1.1)
                .addScaledVector(tangent, (Math.random() - 0.5) * 1.1)
                .add(new THREE.Vector3(0, 0.5 + Math.random() * 0.7, 0));
            particle.userData.spin = new THREE.Vector3(
                (Math.random() - 0.5) * 8,
                (Math.random() - 0.5) * 8,
                (Math.random() - 0.5) * 8
            );
            particle.userData.life = 0.35 + Math.random() * 0.18;

            this.scene.add(particle);
            this.breakParticles.push(particle);
        }

        while (this.breakParticles.length > 72) {
            const oldest = this.breakParticles.shift();
            this.scene.remove(oldest);
        }
    },

    updateMiningParticles(delta) {
        for (let i = this.breakParticles.length - 1; i >= 0; i--) {
            const particle = this.breakParticles[i];
            particle.userData.life -= delta;

            if (particle.userData.life <= 0) {
                this.scene.remove(particle);
                this.breakParticles.splice(i, 1);
                continue;
            }

            particle.userData.velocity.y -= 5.5 * delta;
            particle.position.addScaledVector(particle.userData.velocity, delta);
            particle.rotation.x += particle.userData.spin.x * delta;
            particle.rotation.y += particle.userData.spin.y * delta;
            particle.rotation.z += particle.userData.spin.z * delta;
        }
    },

    updateMiningOverlay(position) {
        if (!this.miningOverlay || !position || this.miningTargetDuration <= 0 || this.miningProgress <= 0) {
            if (this.miningOverlay) {
                this.miningOverlay.visible = false;
                this.miningOverlay.rotation.set(0, 0, 0);
            }
            return;
        }

        const progress = Math.min(1, this.miningProgress / this.miningTargetDuration);
        const stage = Math.min(this.miningOverlayTextures.length - 1, Math.floor(progress * this.miningOverlayTextures.length));

        this.miningOverlay.material.map = this.miningOverlayTextures[stage];
        this.miningOverlay.material.needsUpdate = true;
        this.miningOverlay.position.set(position.x + 0.5, position.y + 0.5, position.z + 0.5);
        if (this.miningBlockVisual && this.miningBlockVisual.key === `${position.x},${position.y},${position.z}`) {
            this.miningOverlay.rotation.set(
                this.miningBlockVisual.currentRotation.x,
                this.miningBlockVisual.currentRotation.y,
                this.miningBlockVisual.currentRotation.z
            );
        } else {
            this.miningOverlay.rotation.set(0, 0, 0);
        }
        this.miningOverlay.visible = true;
    },

    performMiningStrike(blockType, hit) {
        if (!hit || !hit.face) return;

        this.spawnMiningParticles(blockType, hit.point, hit.face.normal);
        this.kickMiningBlockVisual();
        this.playMiningSound(blockType);
    },

    plantSaplingTree(itemDef, position) {
        if (!this.world.hasSolidBlock(position.x, position.y - 1, position.z) || this.world.getBlockTypeAt(position.x, position.y, position.z)) return;
        const trunkHeight = itemDef.saplingWood === 'dark_oak_wood' ? 6 : 5;
        const payloads = [];

        for (let y = 0; y < trunkHeight; y++) {
            payloads.push({ x: position.x, y: position.y + y, z: position.z, blockType: itemDef.saplingWood });
        }

        const leavesStart = position.y + trunkHeight - 2;
        for (let ly = 0; ly < 3; ly++) {
            const radius = ly === 2 ? 1 : 2;
            for (let lx = -radius; lx <= radius; lx++) {
                for (let lz = -radius; lz <= radius; lz++) {
                    if (lx === 0 && lz === 0 && ly < 2) continue;
                    if (Math.abs(lx) === 2 && Math.abs(lz) === 2) continue;
                    payloads.push({ x: position.x + lx, y: leavesStart + ly, z: position.z + lz, blockType: itemDef.saplingLeaves });
                }
            }
        }

        let placedAny = false;
        for (const payload of payloads) {
            if (this.world.addBlock(payload)) {
                placedAny = true;
                if (this.network.connected) this.network.send('blockPlace', payload);
            }
        }
        if (!placedAny) return;

        this.consumeSelectedBlock();
        this.playPlaceSound(itemDef.saplingWood);
        this.receiveSystemMessage({ text: `${this.formatItemName(itemDef.saplingWood.replace('_wood', ''))} tree planted` });
        this.placeActionTimer = 0.35;
        this.showHitIndicator();
        this.lastSelectionUpdate = 0;
    },

    placeBlock() {
        const hit = this.raycastBlock(this.placeDistance);
        if (!hit) return;

        const worldPos = this.world.getBlockPositionFromIntersection(hit);
        if (!worldPos || !hit.face) return;

        const normal = hit.face.normal;
        const newPos = {
            x: Math.round(worldPos.x + normal.x),
            y: Math.round(worldPos.y + normal.y),
            z: Math.round(worldPos.z + normal.z)
        };

        if (newPos.y >= 0) {
            const blockType = this.getSelectedBlockType();
            if (blockType === 'spray_paint') {
                this.trySprayPaint(hit);
                return;
            }
            if (!blockType || this.getInventoryCount(blockType) <= 0) return;

            const itemDef = this.getItemDefinition(blockType);
            if (itemDef && itemDef.eggSpecies) {
                this.spawnAnimalFromEgg(itemDef.eggSpecies, newPos);
                return;
            }
            if (itemDef && itemDef.saplingWood) {
                this.plantSaplingTree(itemDef, newPos);
                return;
            }
            if (itemDef && itemDef.itemOnly) return;

            const payload = { x: newPos.x, y: newPos.y, z: newPos.z, blockType: blockType };
            if (blockType === 'sign') {
                const text = this.promptSignText();
                if (!text) return;
                payload.text = text;
            } else if (blockType === 'sound_block') {
                payload.instrument = 'bell';
                payload.note = 0;
            } else if (blockType === 'ladder') {
                if (normal.y !== 0) return;
                payload.facing = this.getLadderFacingFromNormal(normal);
            }

            if (!this.world.addBlock(payload)) return;
            this.consumeSelectedBlock();
            if (blockType === 'bed') {
                this.setRespawnPointFromBlock(newPos);
            }
            this.playPlaceSound(blockType);
            this.placeActionTimer = 0.35;

            this.showHitIndicator();
            this.lastSelectionUpdate = 0;

            if (this.network.connected) {
                this.network.send('blockPlace', payload);
            }
        }
    },

    updateMining(delta) {
        if (!this.isBreakInputActive || !this.cameraController.canInteract()) {
            this.resetMiningTarget();
            this.resetMiningBlockVisual(false);
            return;
        }

        const hit = this.raycastBlock(this.breakDistance);
        if (!hit) {
            this.resetMiningTarget();
            this.resetMiningBlockVisual(false);
            return;
        }

        const worldPos = this.world.getBlockPositionFromIntersection(hit);
        if (!worldPos) {
            this.resetMiningTarget();
            this.resetMiningBlockVisual(false);
            return;
        }

        const baseBreakDuration = this.world.getBreakDurationAt(worldPos.x, worldPos.y, worldPos.z);
        if (!baseBreakDuration || !Number.isFinite(baseBreakDuration)) {
            this.resetMiningTarget();
            this.resetMiningBlockVisual(false);
            return;
        }

        const blockType = this.world.getBlockTypeAt(worldPos.x, worldPos.y, worldPos.z);
        const breakDuration = this.getAdjustedBreakDuration(blockType, baseBreakDuration);

        const targetKey = `${worldPos.x},${worldPos.y},${worldPos.z}`;
        if (targetKey !== this.miningTargetKey) {
            this.miningTargetKey = targetKey;
            this.miningTargetDuration = breakDuration;
            this.miningProgress = 0;
            this.miningTargetType = blockType;
            this.miningStrikeTimer = 0;
            this.bindMiningBlockVisual(hit, targetKey);
            if (this.miningOverlay) {
                this.miningOverlay.visible = false;
            }
            return;
        }

        this.bindMiningBlockVisual(hit, targetKey);
        this.miningTargetType = blockType;
        this.miningProgress += delta;
        this.miningStrikeTimer += delta;

        while (this.miningStrikeTimer >= this.miningStrikeInterval) {
            this.performMiningStrike(blockType, hit);
            this.miningStrikeTimer -= this.miningStrikeInterval;
        }

        this.updateMiningOverlay(worldPos);

        if (this.miningProgress < this.miningTargetDuration) {
            return;
        }

        this.performMiningStrike(blockType, hit);
        this.finishBreakingBlock(worldPos);
        this.resetMiningTarget();
        this.resetMiningBlockVisual(false);
    },

    showHitIndicator() {
        this.hitIndicator.style.opacity = '1';
        setTimeout(() => { this.hitIndicator.style.opacity = '0'; }, 100);
    },

    updateSelectionBox() {
        if (!this.cameraController.canInteract()) {
            this.selectionBox.visible = false;
            this.selectionBox.rotation.set(0, 0, 0);
            this.updateBlockInspector(null);
            return;
        }

        const hit = this.raycastBlock(this.breakDistance);
        if (!hit) {
            this.selectionBox.visible = false;
            this.selectionBox.rotation.set(0, 0, 0);
            this.updateBlockInspector(null);
            return;
        }

        const worldPos = this.world.getBlockPositionFromIntersection(hit);
        if (!worldPos) {
            this.selectionBox.visible = false;
            this.selectionBox.rotation.set(0, 0, 0);
            this.updateBlockInspector(null);
            return;
        }
        
        this.selectionBox.position.set(worldPos.x + 0.5, worldPos.y + 0.5, worldPos.z + 0.5);
        if (this.miningTargetKey === `${worldPos.x},${worldPos.y},${worldPos.z}` && this.miningTargetDuration > 0) {
            const progress = Math.min(1, this.miningProgress / this.miningTargetDuration);
            this.selectionBox.material.color.setRGB(0.35 + progress * 0.5, 0.15 + progress * 0.2, 0.05);
            if (this.miningBlockVisual && this.miningBlockVisual.key === this.miningTargetKey) {
                this.selectionBox.rotation.set(
                    this.miningBlockVisual.currentRotation.x,
                    this.miningBlockVisual.currentRotation.y,
                    this.miningBlockVisual.currentRotation.z
                );
            } else {
                this.selectionBox.rotation.set(0, 0, 0);
            }
        } else {
            this.selectionBox.material.color.setHex(0x000000);
            this.selectionBox.rotation.set(0, 0, 0);
        }
        this.selectionBox.visible = true;
        this.updateBlockInspector(worldPos);
    }
});
