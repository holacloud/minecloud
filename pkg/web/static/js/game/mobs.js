// Mobs: models, natural spawning, AI movement and combat.
// Mixed into Game.prototype; `this` is the Game instance.

Object.assign(Game.prototype, {
    // `modelSpecies` builds a different model than the species' own (a bee colony's hive).
    createMob(species, position, { variant = null, modelSpecies = null } = {}) {
        const group = new THREE.Group();
        group.userData.species = species;
        group.userData.modelSpecies = modelSpecies;
        group.userData.home = position.clone();
        group.userData.direction = Math.random() * Math.PI * 2;
        group.userData.moveTimer = 1 + Math.random() * 2;
        group.userData.stepPhase = Math.random() * Math.PI * 2;
        group.userData.bounceVelocity = 0;
        const info = getMobSpecies(species);
        group.userData.hostile = Boolean(info.hostile);
        group.userData.attackCooldown = 0;
        group.userData.defendCooldown = 0;
        group.userData.purrTimer = species === 'cat' ? 2 + Math.random() * 4 : 0;
        group.userData.flyHeight = info.flyHeight || 0;
        group.userData.maxHealth = info.maxHealth || 1;
        group.userData.health = group.userData.maxHealth;

        group.userData.variant = variant ?? Math.floor(Math.random() * (info.variants || 1));
        // Idle behaviour state (see animateMobRig).
        group.userData.life = Math.random() * 100;
        group.userData.gait = 0;
        group.userData.lookTimer = 0;
        group.userData.lookYaw = 0;
        group.userData.lookPitch = 0;
        const model = this.attachMobModel(group);

        if (group.userData.maxHealth > 1) {
            group.userData.healthBar = this.createMobHealthBar();
            group.userData.healthBar.position.set(0, model.height + 0.35, 0);
            group.add(group.userData.healthBar);
            this.updateMobHealthBar(group);
        }

        group.position.copy(position);
        group.position.y += group.userData.flyHeight;
        this.scene.add(group);
        this.emitMobEvent('spawned', group);
        return group;
    },

    // Builds (or rebuilds, e.g. after a graphics quality change) the model of a mob group.
    attachMobModel(group) {
        if (group.userData.modelRoot) {
            group.remove(group.userData.modelRoot);
            group.userData.modelRoot.traverse((node) => {
                if (node.isMesh && node.userData.disposeGeometry) node.geometry.dispose();
                if (node.isMesh && node.material) node.material.dispose();
            });
        }
        const species = group.userData.modelSpecies || group.userData.species;
        const model = VoxelModels.createMob(species, (texture, normalMap) => this.createModelMaterial(texture, normalMap), this.mobTextureCache, group.userData.variant, this.rtxModeEnabled);
        group.add(model.root);
        this.tagModelMeshes(model.root, 'mobRoot', group);
        group.userData.modelRoot = model.root;
        group.userData.modelParts = model.parts;
        group.userData.legs = model.legs;
        group.userData.arms = model.arms;
        group.userData.wings = model.wings;
        group.userData.tail = model.tail;
        group.userData.head = model.head;
        group.userData.legAxis = model.legAxis;
        return model;
    },

    rebuildMobModels() {
        this.ambientMobs.forEach((mob) => this.attachMobModel(mob));
        this.otherPlayerMeshes.forEach((avatar) => { if (avatar.userData.mountMob) this.attachMobModel(avatar.userData.mountMob); });
    },

    createMobHealthBar() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 20;
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(1.1, 0.18, 1);
        sprite.renderOrder = 1300;
        sprite.userData.canvas = canvas;
        sprite.userData.texture = texture;
        return sprite;
    },

    updateMobHealthBar(mob) {
        const healthBar = mob.userData.healthBar;
        if (!healthBar) return;

        const healthPercent = Math.max(0, mob.userData.health / mob.userData.maxHealth);
        healthBar.visible = healthPercent < 1;
        if (!healthBar.visible) return;

        const canvas = healthBar.userData.canvas;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#4b1111';
        ctx.fillRect(4, 4, 120, 12);
        ctx.fillStyle = '#6ee36f';
        ctx.fillRect(4, 4, Math.round(120 * healthPercent), 12);
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(4, 4, 120, 12);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.ceil(healthPercent * 100)}%`, 64, 10);
        healthBar.userData.texture.needsUpdate = true;
    },

    initAmbientMobs() {
        // Animals spawn naturally per chunk (see updateNaturalSpawning) once terrain exists.
        this.mobSpawnedChunks = new Set();
        this.mobSpawnTimer = 0;
    },

    // Species that can appear in each biome, with relative weights.
    getBiomeSpawnTable(biome) {
        const table = (() => {
            switch (biome) {
                case 'desert': return [['camel', 3], ['lizard', 2], ['scorpion', 1], ['giraffe', 1], ['duck', 1]];
                case 'forest': return [['pig', 3], ['cat', 2], ['macaw', 3], ['dog', 1], ['spider', 1]];
                case 'rocky': return [['goat', 3], ['eagle', 2], ['sheep', 1], ['lizard', 1], ['scorpion', 1], ['spider', 1], ['cave_monster', 1]];
                default: return [['sheep', 4], ['pig', 3], ['horse', 2], ['duck', 2], ['dog', 1], ['cat', 1], ['eagle', 1]];
            }
        })();
        // Species from their own files join through spawnBiomes.
        const key = ['desert', 'forest', 'rocky'].includes(biome) ? biome : 'plains';
        Object.entries(MOB_SPECIES).forEach(([species, info]) => {
            if (info.spawnBiomes && info.spawnBiomes[key]) table.push([species, info.spawnBiomes[key]]);
        });
        return table;
    },

    emitMobEvent(event, ...args) {
        (MOB_EVENT_LISTENERS[event] || []).forEach((listener) => listener.call(this, ...args));
    },

    // Right click on a mob: the registered use handlers (taming, harvesting, ...) get a go.
    tryUseItemOnMob() {
        if (MOB_USE_HANDLERS.length === 0) return false;
        const mob = this.raycastMob(4);
        if (!mob) return false;
        const item = this.getSelectedHeldItemType() || null;
        return MOB_USE_HANDLERS.some((handler) => handler.call(this, mob, item));
    },

    // A registered goal for a ground mob (bait, a mate, its owner...), or null to wander.
    // A goal may carry `stopDistance` (default 1): the mob stands still once that close.
    getMobGoal(mob, delta) {
        for (const provider of MOB_GOAL_PROVIDERS) {
            const goal = provider.call(this, mob, delta);
            if (goal) return goal;
        }
        return null;
    },

    chunkRandom(chunkX, chunkZ, salt) {
        let h = Math.imul(chunkX, 73856093) ^ Math.imul(chunkZ, 19349663) ^ Math.imul(salt, 83492791);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    },

    spawnMobsForChunk(chunkX, chunkZ) {
        const size = this.world.chunkSize;
        const biome = this.world.chunkBiomes.get(this.world.chunkKey(chunkX, chunkZ)) || 'plains';
        if (this.ambientMobs.filter((mob) => mob.userData.species === 'fish').length < 32) this.spawnFishForChunk(chunkX, chunkZ);
        this.spawnShoreMobsForChunk(chunkX, chunkZ, biome);
        this.spawnBeesForChunk(chunkX, chunkZ, biome);
        this.spawnFirefliesForChunk(chunkX, chunkZ, biome);
        this.spawnBatsForChunk(chunkX, chunkZ, biome);
        Object.values(MOB_BEHAVIOURS).forEach((behaviour) => {
            if (behaviour.spawnForChunk) behaviour.spawnForChunk.call(this, chunkX, chunkZ, biome);
        });
        if (this.chunkRandom(chunkX, chunkZ, 1) > 0.3) return;

        const table = this.getBiomeSpawnTable(biome);
        const total = table.reduce((sum, [, weight]) => sum + weight, 0);
        let pick = this.chunkRandom(chunkX, chunkZ, 2) * total;
        let species = table[0][0];
        for (const [candidate, weight] of table) {
            pick -= weight;
            if (pick <= 0) { species = candidate; break; }
        }

        const info = getMobSpecies(species);
        if (info.limit && this.ambientMobs.filter((mob) => mob.userData.species === species).length >= info.limit) return;
        const [minGroup, maxGroup] = info.group || [1, 1];
        const groupSize = minGroup + Math.floor(this.chunkRandom(chunkX, chunkZ, 3) * (maxGroup - minGroup + 1));
        for (let i = 0; i < groupSize; i++) {
            const x = chunkX * size + 2 + this.chunkRandom(chunkX, chunkZ, 10 + i) * (size - 4);
            const z = chunkZ * size + 2 + this.chunkRandom(chunkX, chunkZ, 20 + i) * (size - 4);
            const ground = this.cameraController.getFloorY(x, z, 64);
            if (ground <= -20) continue;
            const surface = this.world.getBlockTypeAt(Math.floor(x), ground - 1, Math.floor(z));
            const above = this.world.getBlockTypeAt(Math.floor(x), ground, Math.floor(z));
            if (!surface || above === 'water' || surface.endsWith('leaves') || surface === 'cactus') continue;

            const mob = this.createMob(species, new THREE.Vector3(x, ground, z));
            mob.userData.natural = true;
            mob.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
            this.ambientMobs.push(mob);
        }
    },

    removeMob(mob) {
        if (mob.parent) this.emitMobEvent('removed', mob);
        this.scene.remove(mob);
        this.ambientMobs = this.ambientMobs.filter((candidate) => candidate !== mob);
        if (mob.userData.glowMaterials) mob.userData.glowMaterials.forEach((material) => material.dispose());
        // Textures are shared per species; geometries and materials belong to this mob.
        mob.traverse((node) => {
            if (node.isMesh && node.userData.disposeGeometry) node.geometry.dispose();
            if (node.isMesh && node.material && node.userData.modelMap) node.material.dispose();
            if (node.isSprite && node.material) {
                if (node.material.map) node.material.map.dispose();
                node.material.dispose();
            }
        });
    },

    updateNaturalSpawning(delta) {
        this.mobSpawnTimer -= delta;
        if (this.mobSpawnTimer > 0 || !this.world) return;
        this.mobSpawnTimer = 1;

        const size = this.world.chunkSize;
        const player = this.getLocalPlayerPosition();
        const { chunkX: playerChunkX, chunkZ: playerChunkZ } = this.world.getChunkCoords(player.x, player.z);
        const spawnRadius = Math.min(3, this.world.renderDistance);
        const despawnDistance = (spawnRadius + 2) * size;

        // Despawn wild mobs that are far away; their chunk may spawn again when revisited.
        for (const mob of [...this.ambientMobs]) {
            if (!mob.userData.natural || mob === this.followingDog || mob === this.followingCat) continue;
            if (Math.hypot(mob.position.x - player.x, mob.position.z - player.z) < despawnDistance) continue;
            this.mobSpawnedChunks.delete(mob.userData.spawnChunk);
            this.removeMob(mob);
        }
        for (const key of this.mobSpawnedChunks) {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            if (Math.max(Math.abs(chunkX - playerChunkX), Math.abs(chunkZ - playerChunkZ)) > spawnRadius + 1) {
                this.mobSpawnedChunks.delete(key);
            }
        }

        for (let dx = -spawnRadius; dx <= spawnRadius; dx++) {
            for (let dz = -spawnRadius; dz <= spawnRadius; dz++) {
                if (this.ambientMobs.length >= 64) return;
                // Never pop mobs into existence right next to the player.
                if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1 && this.mobSpawnedChunks.size > 0) continue;
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const key = this.world.chunkKey(chunkX, chunkZ);
                if (this.mobSpawnedChunks.has(key) || !this.world.generatedChunks.has(key)) continue;
                this.mobSpawnedChunks.add(key);
                this.spawnMobsForChunk(chunkX, chunkZ);
            }
        }
    },

    raycastMob(maxDistance) {
        this.raycaster.setFromCamera(this.screenCenter, this.camera);
        const meshes = [];
        this.ambientMobs.forEach((mob) => {
            // Hidden mobs (a rabbit down its burrow, a bee inside the hive) cannot be clicked.
            if (mob === this.ridingMob || !mob.visible) return;
            mob.traverse((node) => {
                if (node instanceof THREE.Mesh) {
                    meshes.push(node);
                }
            });
        });
        if (meshes.length === 0) return null;

        const intersects = this.raycaster.intersectObjects(meshes, true);
        if (intersects.length === 0 || intersects[0].distance > maxDistance) return null;

        let current = intersects[0].object;
        while (current && !current.userData.mobRoot) {
            current = current.parent;
        }
        return current ? current.userData.mobRoot : null;
    },

    interactWithMob(mob) {
        this.emitMobEvent('hit', mob);
        const behaviour = MOB_BEHAVIOURS[getMobSpecies(mob.userData.species).movement];
        if (behaviour && behaviour.interact) {
            behaviour.interact.call(this, mob);
            return;
        }
        if (getMobSpecies(mob.userData.species).movement === 'swim') {
            this.startleSchool(mob, this.camera.position);
            this.playNoiseBurst({ duration: 0.08, volume: 0.015, highpass: 600, lowpass: 2400 });
            return;
        }
        if (getMobSpecies(mob.userData.species).movement === 'stalk') {
            this.hitShadow(mob);
            return;
        }
        if (getMobSpecies(mob.userData.species).movement === 'glow') {
            this.scatterFireflies(mob);
            return;
        }
        if (getMobSpecies(mob.userData.species).movement === 'flutter') {
            this.startleBats(mob, this.camera.position);
            return;
        }
        if (getMobSpecies(mob.userData.species).movement === 'swarm') {
            this.provokeColony(mob);
            return;
        }
        if (getMobSpecies(mob.userData.species).movement === 'soar') {
            // Eagles take to the air, screeching, and move their circle away from the player.
            if (mob.userData.flight) this.takeOff(mob, true);
            this.playNoiseBurst({ duration: 0.06, volume: 0.02, highpass: 400, lowpass: 2600 });
            return;
        }
        if (getMobSpecies(mob.userData.species).movement === 'climb') {
            // Goats butt back.
            if (!mob.userData.ram && !mob.userData.airborne) mob.userData.ram = { phase: 'paw', timer: 0.5 };
            this.playTone({ frequency: getMobSpecies('goat').tone, duration: 0.18, type: 'sawtooth', volume: 0.015, release: 0.1, detune: (Math.random() - 0.5) * 80 });
            return;
        }
        if (getMobSpecies(mob.userData.species).movement === 'dart') {
            this.dropLizardTail(mob);
            this.playTone({ frequency: getMobSpecies('lizard').tone, duration: 0.04, type: 'triangle', volume: 0.012, release: 0.04 });
            return;
        }
        if (getMobSpecies(mob.userData.species).movement === 'amphibious') {
            mob.userData.hide = 5;
            mob.userData.flee = 4;
            this.playNoiseBurst({ duration: 0.06, volume: 0.02, highpass: 200, lowpass: 1200 });
            return;
        }
        if (getMobSpecies(mob.userData.species).movement === 'hop') {
            if (!mob.userData.airborne && !mob.userData.swimming) {
                this.hopSomewhere(mob, Math.atan2(mob.position.z - this.camera.position.z, mob.position.x - this.camera.position.x), 1.6, 3.4);
            }
            this.playTone({ frequency: getMobSpecies('frog').tone, duration: 0.07, type: 'square', volume: 0.015, release: 0.06 });
            return;
        }
        if (mob.userData.maxHealth > 1) {
            mob.userData.health -= 4;
            this.updateMobHealthBar(mob);
            if (mob.userData.health <= 0) {
                this.emitMobEvent('defeated', mob, 'player');
                this.removeMob(mob);
                this.receiveSystemMessage({ text: `You defeated the ${mob.userData.species.replace('_', ' ')}` });
                return;
            }
        }

        mob.userData.bounceVelocity = 2.4;
        mob.userData.resting = 0;
        mob.userData.direction = Math.atan2(this.camera.position.z - mob.position.z, this.camera.position.x - mob.position.x);

        this.playTone({ frequency: getMobSpecies(mob.userData.species).tone || 300, duration: 0.08, type: 'triangle', volume: 0.02, release: 0.07, detune: (Math.random() - 0.5) * 40 });
        this.playNoiseBurst({ duration: 0.04, volume: 0.01, highpass: 120, lowpass: 900 });
    },

    updateAmbientMobs(delta) {
        this.updateNaturalSpawning(delta);
        this.updateDroppedTails(delta);
        this.updatePoison(delta);
        this.updateShadowSpawning(delta);
        this.updateSmokePuffs(delta);
        this.mobFrame = (this.mobFrame || 0) + 1;
        const player = this.getLocalPlayerPosition();
        const playerPosition = new THREE.Vector3(this.getLocalPlayerPosition().x, 0, this.getLocalPlayerPosition().z);
        if (this.followingDog && !this.ambientMobs.includes(this.followingDog)) {
            this.followingDog = null;
        }
        if (this.followingCat && !this.ambientMobs.includes(this.followingCat)) {
            this.followingCat = null;
        }
        if (this.ridingMob && !this.ambientMobs.includes(this.ridingMob)) {
            this.ridingMob = null;
            this.cameraController.setMount(null);
        }

        for (const mob of this.ambientMobs) {
            mob.userData.moveTimer -= delta;
            mob.userData.attackCooldown = Math.max(0, mob.userData.attackCooldown - delta);
            mob.userData.defendCooldown = Math.max(0, mob.userData.defendCooldown - delta);
            mob.userData.purrTimer = Math.max(0, mob.userData.purrTimer - delta);
            if (mob.userData.rider) {
                this.updateRiddenMob(mob, delta);
                continue;
            }
            const movement = getMobSpecies(mob.userData.species).movement;
            const behaviour = MOB_BEHAVIOURS[movement];
            if (behaviour && behaviour.update) {
                behaviour.update.call(this, mob, delta, player);
                continue;
            }
            if (movement === 'swim') {
                this.updateSwimmingMob(mob, delta, player);
                continue;
            }
            if (movement === 'hop') {
                this.updateHoppingMob(mob, delta, player);
                continue;
            }
            if (movement === 'amphibious') {
                this.updateAmphibiousMob(mob, delta, player);
                continue;
            }
            if (movement === 'dart') {
                this.updateDartingMob(mob, delta, player);
                continue;
            }
            if (movement === 'stalk') {
                this.updateStalkingMob(mob, delta, player);
                continue;
            }
            if (movement === 'glow') {
                this.updateGlowMob(mob, delta, player);
                continue;
            }
            if (movement === 'flutter') {
                this.updateFlutteringMob(mob, delta, player);
                continue;
            }
            if (movement === 'swarm') {
                this.updateSwarmMob(mob, delta, player);
                continue;
            }
            if (movement === 'soar') {
                this.updateSoaringMob(mob, delta, player);
                continue;
            }
            if (movement === 'climb') {
                this.updateClimbingMob(mob, delta, player);
                continue;
            }

            const mobFlatPosition = new THREE.Vector3(mob.position.x, 0, mob.position.z);
            const distanceToPlayer = mobFlatPosition.distanceTo(playerPosition);
            const info = getMobSpecies(mob.userData.species);
            const chaseDistance = info.nocturnal && !this.isNightTime() ? 3.5 : info.chaseDistance || 16;
            const keepDistance = info.keepDistance || 0;
            const isChasing = mob.userData.hostile && !this.titleScreenOpen && !this.respawnPending && distanceToPlayer < chaseDistance;
            const isFollowingDog = mob.userData.species === 'dog' && this.followingDog === mob;
            const isFollowingCat = mob.userData.species === 'cat' && this.followingCat === mob;
            let goal = null;

            if (mob.userData.species === 'dog' && !this.followingDog && distanceToPlayer <= 10) {
                this.followingDog = mob;
                this.receiveSystemMessage({ text: 'An adorable dog is now your friend' });
            }
            if (mob.userData.species === 'cat' && !this.followingCat && distanceToPlayer <= 7) {
                this.followingCat = mob;
                this.receiveSystemMessage({ text: 'A tiny cat decided you are acceptable' });
            }

            if (isFollowingCat && distanceToPlayer > 1.6) {
                mob.userData.direction = Math.atan2(playerPosition.z - mob.position.z, playerPosition.x - mob.position.x);
            } else if (isFollowingCat && distanceToPlayer <= 1.6) {
                mob.userData.direction = Math.atan2(playerPosition.z - mob.position.z, playerPosition.x - mob.position.x) + Math.PI * 0.5;
            } else if (isFollowingDog) {
                mob.userData.direction = Math.atan2(playerPosition.z - mob.position.z, playerPosition.x - mob.position.x);
            } else if (isChasing) {
                mob.userData.direction = Math.atan2(playerPosition.z - mob.position.z, playerPosition.x - mob.position.x);
            } else if ((goal = this.getMobGoal(mob, delta))) {
                mob.userData.direction = Math.atan2(goal.z - mob.position.z, goal.x - mob.position.x);
            } else if (mob.userData.moveTimer <= 0) {
                mob.userData.moveTimer = 1.2 + Math.random() * 2.8;
                mob.userData.direction += (Math.random() - 0.5) * 1.8;
                // Some species lie down for a while instead.
                if (getMobSpecies(mob.userData.species).restDrop && Math.random() < 0.12) {
                    mob.userData.resting = 10 + Math.random() * 15;
                    mob.userData.moveTimer = mob.userData.resting;
                }
            }
            mob.userData.resting = Math.max(0, (mob.userData.resting || 0) - delta);

            const moveSpeed = isChasing ? info.chaseSpeed : isFollowingDog ? 0.95 : isFollowingCat ? 0.72 : info.speed;
            const goalReached = goal && Math.hypot(goal.x - mob.position.x, goal.z - mob.position.z) <= (goal.stopDistance ?? 1);
            const moveScale = mob.userData.resting > 0 || goalReached || (isChasing && distanceToPlayer <= keepDistance) || (isFollowingDog && distanceToPlayer <= 2.1) || (isFollowingCat && distanceToPlayer <= 1.1) ? 0 : 1;
            const move = new THREE.Vector3(Math.cos(mob.userData.direction), 0, Math.sin(mob.userData.direction)).multiplyScalar(moveSpeed * moveScale * delta);
            if (mob.position.y - mob.userData.flyHeight < -20) {
                // Spawned before its chunk was generated: drop it onto the terrain once it exists.
                const ground = this.cameraController.getFloorY(mob.position.x, mob.position.z, 64);
                if (ground > -20) {
                    mob.position.y = ground + mob.userData.flyHeight;
                    mob.userData.home.y = ground;
                }
            }
            const candidate = mob.position.clone().add(move);
            const feetY = mob.position.y - mob.userData.flyHeight;
            // Search from just above the feet so mobs can climb one block but not tunnel into hills.
            const floorY = this.cameraController.getFloorY(candidate.x, candidate.z, feetY + 1);
            const homeDistance = Math.hypot(candidate.x - mob.userData.home.x, candidate.z - mob.userData.home.z);
            const leashed = !isChasing && !isFollowingDog && !isFollowingCat && !goal;
            const walkable = floorY > -20 && floorY - feetY <= 1.01 && feetY - floorY <= 3;
            if (walkable && (!leashed || homeDistance < 18 || homeDistance < Math.hypot(mob.position.x - mob.userData.home.x, mob.position.z - mob.userData.home.z))) {
                mob.position.x = candidate.x;
                mob.position.z = candidate.z;
                mob.position.y = floorY + mob.userData.flyHeight + Math.sin(mob.userData.stepPhase * 0.7) * (mob.userData.flyHeight ? 0.18 : 0);
            } else if (leashed && mob.userData.blockedCooldown <= 0) {
                // Turn once and commit to the new heading for a while (instead of re-turning every
                // frame, which made blocked mobs spin forever). Outside the leash, head home.
                mob.userData.direction = homeDistance >= 18
                    ? Math.atan2(mob.userData.home.z - mob.position.z, mob.userData.home.x - mob.position.x)
                    : mob.userData.direction + Math.PI * (0.5 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1);
                mob.userData.moveTimer = 1.5 + Math.random() * 2;
                mob.userData.blockedCooldown = 0.6;
            }
            mob.userData.blockedCooldown = Math.max(0, (mob.userData.blockedCooldown || 0) - delta);

            if (isChasing && distanceToPlayer < 1.2 && mob.userData.attackCooldown <= 0) {
                const name = mob.userData.species.replace('_', ' ');
                this.applyDamage(info.attackDamage, `You were attacked by a ${name}`, 'mob');
                if (info.poison) this.poisonPlayer(info.poison, name);
                mob.userData.attackCooldown = 1.2;
                mob.userData.attackPose = 0.4;
            }

            if (isFollowingDog && mob.userData.defendCooldown <= 0) {
                const enemy = this.ambientMobs.find((candidate) => candidate.userData.species === 'cave_monster' && candidate.position.distanceTo(mob.position) < 2.2);
                if (enemy) {
                    enemy.userData.health -= 4;
                    this.updateMobHealthBar(enemy);
                    enemy.userData.direction = Math.atan2(enemy.position.z - mob.position.z, enemy.position.x - mob.position.x);
                    mob.userData.defendCooldown = 0.8;
                    if (enemy.userData.health <= 0) {
                        this.removeMob(enemy);
                        this.receiveSystemMessage({ text: 'Your dog defended you from the cave monster' });
                    }
                }
            }

            if (isFollowingCat && distanceToPlayer < 3.2 && mob.userData.purrTimer <= 0) {
                mob.userData.purrTimer = 4 + Math.random() * 5;
                this.playTone({ frequency: 880, duration: 0.06, type: 'sine', volume: 0.012, release: 0.06, detune: (Math.random() - 0.5) * 70 });
            }

            mob.userData.stepPhase += delta * 7 * moveScale;
            // Models face +z; movement direction is measured from +x towards +z. Turn smoothly.
            mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.PI / 2 - mob.userData.direction, Math.min(1, delta * 8));

            if (mob.userData.bounceVelocity !== 0) {
                mob.userData.bounceVelocity -= 9 * delta;
                mob.position.y += mob.userData.bounceVelocity * delta;
                if (mob.position.y <= floorY) {
                    mob.position.y = floorY;
                    mob.userData.bounceVelocity = 0;
                }
            }

            this.animateMobRig(mob, moveScale, delta);
        }
        FRAME_UPDATERS.forEach((updater) => updater.call(this, delta));
    },

    // Venom: a few points of damage over the next seconds.
    poisonPlayer(ticks, source) {
        if (!this.poison) this.receiveSystemMessage({ text: `You were poisoned by a ${source}` });
        this.poison = { ticks: Math.max(ticks, this.poison ? this.poison.ticks : 0), timer: 1.5, source };
    },

    updatePoison(delta) {
        if (!this.poison) return;
        if (this.respawnPending) {
            this.poison = null;
            return;
        }
        this.poison.timer -= delta;
        if (this.poison.timer > 0) return;
        this.applyDamage(1, `You were poisoned by a ${this.poison.source}`, 'poison');
        this.poison.ticks -= 1;
        this.poison.timer = 1.5;
        if (this.poison.ticks <= 0) this.poison = null;
    },

    // Gait eases in and out with movement; idle mobs breathe, look around, graze and flick
    // their ears.
    animateMobRig(mob, moveScale, delta = 1 / 60) {
        const data = mob.userData;
        data.life += delta;
        data.gait += ((moveScale > 0 ? 1 : 0) - data.gait) * Math.min(1, delta * 6);
        const phase = data.stepPhase;
        const swing = Math.sin(phase) * 0.5 * data.gait;
        const axis = data.legAxis;

        data.legs.forEach((leg, index) => {
            // Diagonal gait: front-left with back-right, alternating sides.
            const side = index % 2 === 0 ? 1 : -1;
            const pair = Math.floor(index / 2) % 2 === 0 ? 1 : -1;
            const base = leg.userData.baseRotation;
            if (axis === 'y') {
                leg.rotation.y = base.y + swing * 0.5 * side * pair;
                leg.rotation.z = base.z + Math.abs(Math.sin(phase + index)) * 0.12 * side * data.gait;
            } else {
                leg.rotation.x = base.x + swing * side * pair;
            }
        });

        data.arms.forEach((arm, index) => {
            arm.rotation.x = arm.userData.baseRotation.x - swing * (index % 2 === 0 ? 1 : -1) * 0.8;
        });

        // Body bob while walking, slow breathing always.
        if (data.modelRoot) {
            data.modelRoot.position.y = Math.abs(Math.sin(phase)) * 0.025 * data.gait;
            const body = data.modelParts && data.modelParts.body;
            if (body) body.scale.y = 1 + Math.sin(data.life * 2.1) * 0.012;
        }

        // Resting species fold their legs under them and lower their body to the ground.
        const restDrop = getMobSpecies(data.species).restDrop || 0;
        if (restDrop && data.modelRoot) {
            data.restBlend = (data.restBlend || 0) + ((data.resting > 0 ? 1 : 0) - (data.restBlend || 0)) * Math.min(1, delta * 1.5);
            if (data.restBlend > 0.001) {
                data.legs.forEach((leg, index) => {
                    leg.rotation.x += ((index < 2 ? -1 : 1) * Math.PI / 2 - leg.rotation.x) * data.restBlend;
                });
                data.modelRoot.position.y -= restDrop * data.restBlend;
            }
        }

        // Head: look somewhere new every few seconds; grazers sometimes lower their head.
        if (data.head) {
            data.lookTimer -= delta;
            if (data.lookTimer <= 0) {
                data.lookTimer = 1.5 + Math.random() * 3.5;
                const graze = getMobSpecies(data.species).grazer && !data.rider && data.gait < 0.2 && Math.random() < 0.4;
                data.lookYaw = graze ? 0 : (Math.random() - 0.5) * 1.1;
                data.lookPitch = graze ? 0.6 : (Math.random() - 0.5) * 0.4;
            }
            const base = data.head.userData.baseRotation;
            const follow = Math.min(1, delta * 3);
            const moving = 1 - data.gait * 0.7;
            data.head.rotation.y += (base.y + data.lookYaw * moving - data.head.rotation.y) * follow;
            data.head.rotation.x += (base.x + data.lookPitch * moving - data.head.rotation.x) * follow;
        }

        // Ear flicks: brief twitches at random moments.
        const parts = data.modelParts || {};
        ['earL', 'earR'].forEach((name, index) => {
            const ear = parts[name];
            if (!ear) return;
            const flick = Math.max(0, Math.sin(data.life * 1.3 + index * 2.1) - 0.97) * 12;
            ear.rotation.x = ear.userData.baseRotation.x + flick * 0.35;
        });

        data.attackPose = Math.max(0, (data.attackPose || 0) - delta);
        const strike = getMobSpecies(data.species).tailStrike && data.attackPose > 0 ? Math.sin((1 - data.attackPose / 0.4) * Math.PI) : 0;
        data.tail.forEach((segment, index) => {
            const base = segment.userData.baseRotation;
            const speed = 2.2 + data.gait * 3;
            const sway = strike ? 0.08 : 0.18 + data.gait * 0.2;
            segment.rotation.y = base.y + Math.sin(data.life * speed + index * 0.6) * sway;
            segment.rotation.x = base.x + strike * 0.35;
        });

        // Pincers open and close.
        ['L', 'R'].forEach((side, index) => {
            const pincer = parts[`pincer${side}`];
            const finger = parts[`finger${side}`];
            if (!pincer || !finger) return;
            const open = Math.max(0, Math.sin(data.life * 2.3 + index * 1.7)) * 0.45 + strike * 0.3;
            const sign = side === 'L' ? 1 : -1;
            pincer.rotation.y = open * sign;
            finger.rotation.y = -open * sign;
        });

        if (data.wings.length === 2) {
            const flap = data.flyHeight
                ? Math.abs(Math.sin(phase * 2.2)) * 1.1
                : Math.max(0, Math.sin(data.life * 0.9)) * 0.12;
            data.wings[0].rotation.z = flap;
            data.wings[1].rotation.z = -flap;
        }
    },

    spawnMobFromCommand(args) {
        const species = (args[0] || '').toLowerCase();
        if (!getMobSpecies(species)) {
            this.receiveSystemMessage({ text: `Usage: /mob <animal>. Animals: ${Object.keys(MOB_SPECIES).join(', ')}` });
            return;
        }

        const player = this.getLocalPlayerPosition();
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw || 0);
        const x = player.x + forward.x * 3;
        const z = player.z + forward.z * 3;
        const behaviour = MOB_BEHAVIOURS[getMobSpecies(species).movement];
        if (behaviour && behaviour.spawnCommand && behaviour.spawnCommand.call(this, species, x, z, player)) return;
        if (getMobSpecies(species).movement === 'swarm') {
            this.spawnColonyNear(x, z, player.y + 4);
            return;
        }
        if (getMobSpecies(species).movement === 'flutter') {
            this.spawnBatColonyNear(x, z, player.y + 0.5);
            return;
        }
        if (getMobSpecies(species).movement === 'swim') {
            const school = this.spawnFishNear(x, z, player.y + 4, 10);
            this.receiveSystemMessage({ text: school ? `Spawned a school of ${school.length} fish` : 'Fish need water at least two blocks deep nearby' });
            return;
        }
        const floorY = this.cameraController.getFloorY(x, z, player.y + 4);

        if (floorY <= -20) {
            this.receiveSystemMessage({ text: `Could not find safe ground for the ${species}` });
            return;
        }

        const mob = this.createMob(species, new THREE.Vector3(x, floorY, z));
        mob.userData.direction = Math.atan2(player.z - mob.position.z, player.x - mob.position.x);
        this.ambientMobs.push(mob);
        this.receiveSystemMessage({ text: `Spawned an adorable ${species}` });
    },

    spawnAnimalFromEgg(species, position) {
        const behaviour = MOB_BEHAVIOURS[getMobSpecies(species).movement];
        if (behaviour && behaviour.spawnEgg && behaviour.spawnEgg.call(this, species, position)) return;
        if (getMobSpecies(species).movement === 'flutter') {
            this.spawnBatColonyNear(position.x + 0.5, position.z + 0.5, position.y + 2);
            this.consumeSelectedBlock();
            this.placeActionTimer = 0.35;
            this.showHitIndicator();
            return;
        }
        if (getMobSpecies(species).movement === 'swarm') {
            this.spawnColonyNear(position.x + 0.5, position.z + 0.5, position.y + 4);
            this.consumeSelectedBlock();
            this.placeActionTimer = 0.35;
            this.showHitIndicator();
            return;
        }
        if (getMobSpecies(species).movement === 'swim') {
            if (!this.spawnFishNear(position.x + 0.5, position.z + 0.5, position.y + 1, 2)) {
                this.receiveSystemMessage({ text: 'Fish eggs must be placed in deep water' });
                return;
            }
            this.consumeSelectedBlock();
            this.placeActionTimer = 0.35;
            this.showHitIndicator();
            return;
        }
        const ground = this.cameraController.getFloorY(position.x + 0.5, position.z + 0.5, position.y + 4);
        const spawnPosition = new THREE.Vector3(position.x + 0.5, Math.max(position.y, ground), position.z + 0.5);
        this.ambientMobs.push(this.createMob(species, spawnPosition));
        this.consumeSelectedBlock();
        this.playPlaceSound('grass');
        this.receiveSystemMessage({ text: `${this.formatItemName(species)} spawned` });
        this.placeActionTimer = 0.35;
        this.showHitIndicator();
    }
});
