// The wandering shadow: a tall hooded figure with glowing eyes that rises out of the dark at
// night, away from the player and from any light. It glides after the player (stopping to
// stare while being looked at from afar), flickers closer when something blocks its way and
// strikes with its claws. Daylight, a torch held nearby or a torch placed next to it make it
// dissolve into smoke. Mixed into Game.prototype; updateAmbientMobs hands 'stalk' mobs to
// updateStalkingMob and calls updateShadowSpawning and updateSmokePuffs every frame.

const _shadowLook = new THREE.Vector3();

Object.assign(Game.prototype, {
    // Now and then at night a shadow appears 20-30 blocks from the player, in the dark.
    updateShadowSpawning(delta) {
        this.shadowSpawnTimer = (this.shadowSpawnTimer ?? 10) - delta;
        if (this.shadowSpawnTimer > 0) return;
        this.shadowSpawnTimer = 10;
        if (!this.isNightTime() || this.titleScreenOpen || this.respawnPending || Math.random() > 0.3) return;
        if (this.ambientMobs.filter((mob) => mob.userData.species === 'shadow').length >= getMobSpecies('shadow').limit) return;
        const player = this.getLocalPlayerPosition();
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 10;
        const x = player.x + Math.cos(angle) * distance;
        const z = player.z + Math.sin(angle) * distance;
        const floor = this.cameraController.getFloorY(x, z, player.y + 12);
        if (floor <= -20 || this.findWaterSurface(x, floor + 0.1, z) !== null) return;
        const spot = new THREE.Vector3(x, floor, z);
        if (this.isNearPlacedTorch(spot)) return;
        const mob = this.createMob('shadow', spot);
        mob.userData.natural = true;
        const { chunkX, chunkZ } = this.world.getChunkCoords(x, z);
        mob.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
        this.ambientMobs.push(mob);
        this.emitSmoke(spot, 10, 1.6);
    },

    isNearPlacedTorch(position, radius = 4) {
        const bx = Math.floor(position.x);
        const by = Math.floor(position.y);
        const bz = Math.floor(position.z);
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                if (dx * dx + dz * dz > radius * radius) continue;
                for (let dy = -1; dy <= 3; dy++) {
                    if (this.world.getBlockTypeAt(bx + dx, by + dy, bz + dz) === 'torch') return true;
                }
            }
        }
        return false;
    },

    updateStalkingMob(mob, delta, player) {
        const data = mob.userData;
        const position = mob.position;
        data.life += delta;
        this.attachShadowEyes(mob);

        if (data.dissolving !== undefined) {
            this.updateDissolvingShadow(mob, delta);
            return;
        }

        // Light undoes it: dawn, a torch in the player's hand, or one placed close by.
        const dx = player.x - position.x;
        const dz = player.z - position.z;
        const distance = Math.hypot(dx, dz);
        const heldTorch = this.heldTorchLight && this.heldTorchLight.intensity > 0 && distance < 5;
        data.torchCheck = (data.torchCheck || 0) - delta;
        let placedTorch = false;
        if (data.torchCheck <= 0) {
            data.torchCheck = 0.4;
            placedTorch = this.isNearPlacedTorch(position);
        }
        // Ones summoned by command or egg linger a minute in daylight, so they can be seen.
        if (!data.natural && data.daylightGrace === undefined) data.daylightGrace = 60;
        data.daylightGrace = Math.max(0, (data.daylightGrace || 0) - delta);
        const daylight = !this.isNightTime() && data.daylightGrace <= 0;
        if (daylight || heldTorch || placedTorch) {
            this.dissolveShadow(mob, heldTorch || placedTorch ? 'The shadow fled from the light' : null);
            return;
        }

        const info = getMobSpecies('shadow');
        const chasing = !this.titleScreenOpen && !this.respawnPending && distance < info.chaseDistance;
        let speed = 0;
        if (chasing) {
            data.facing = Math.atan2(dz, dx);
            // Looked at from afar, it stops and stares back.
            this.camera.getWorldDirection(_shadowLook);
            const toShadow = Math.atan2(-dz, -dx);
            const looking = Math.cos(Math.atan2(_shadowLook.z, _shadowLook.x) - toShadow) > 0.97;
            speed = looking && distance > 7 ? 0 : info.chaseSpeed;
            if (distance < 1.4 && data.attackCooldown <= 0) {
                data.attackCooldown = 1.6;
                data.attackPose = 0.5;
                this.applyDamage(info.attackDamage, 'You were taken by a wandering shadow', 'mob');
                this.playTone({ frequency: 110, endFrequency: 55, duration: 0.3, type: 'sawtooth', volume: 0.04, release: 0.15 });
                this.playNoiseBurst({ duration: 0.2, volume: 0.03, highpass: 80, lowpass: 600 });
            }
        } else {
            if (data.moveTimer <= 0) {
                data.moveTimer = 3 + Math.random() * 4;
                data.facing = Math.random() * Math.PI * 2;
                data.paused = Math.random() < 0.4;
            }
            if (!data.paused) speed = info.speed;
        }
        if (data.facing === undefined) data.facing = data.direction;

        if (speed > 0 && distance > 1.1) {
            const step = this.walkStep(mob, data.facing, speed * delta, delta);
            if (step.moved) {
                data.stuck = 0;
            } else {
                data.facing += chasing ? 0 : Math.PI * 0.6;
                data.stuck = (data.stuck || 0) + delta;
                if (chasing && data.stuck > 1.5) this.flickerTowardsPlayer(mob, player);
            }
        }

        // Whispers when close.
        data.whisper = (data.whisper ?? 2) - delta;
        if (data.whisper <= 0 && distance < 14) {
            data.whisper = 3 + Math.random() * 4;
            const volume = 0.03 * (1 - distance / 14);
            this.playNoiseBurst({ duration: 0.6, volume, highpass: 300, lowpass: 900 });
            this.playTone({ frequency: info.tone, endFrequency: info.tone * 0.8, duration: 0.8, type: 'sine', volume: volume * 0.8, attack: 0.2, release: 0.3, detune: (Math.random() - 0.5) * 80 });
        }

        mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.PI / 2 - data.facing, Math.min(1, delta * 5));
        this.poseShadow(mob, speed, delta);
    },

    // Blocked on its way: fades out and reappears a few blocks from the player.
    flickerTowardsPlayer(mob, player) {
        const data = mob.userData;
        data.stuck = 0;
        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            const x = player.x + Math.cos(angle) * 5;
            const z = player.z + Math.sin(angle) * 5;
            const floor = this.cameraController.getFloorY(x, z, player.y + 3);
            if (floor <= -20 || Math.abs(floor - (player.y - 1.6)) > 3 || this.findWaterSurface(x, floor + 0.1, z) !== null) continue;
            this.emitSmoke(mob.position, 8, 1.2);
            mob.position.set(x, floor, z);
            this.emitSmoke(mob.position, 8, 1.2);
            this.playNoiseBurst({ duration: 0.25, volume: 0.02, highpass: 200, lowpass: 1200 });
            return;
        }
    },

    // Two eyes of light under the hood, HDR-bright in Ultra so they bloom. Re-added when the
    // model is rebuilt (graphics quality change).
    attachShadowEyes(mob) {
        const data = mob.userData;
        const head = data.modelParts.head;
        if (!data.eyeMaterial) {
            data.eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xe6d9ff, transparent: true });
            data.eyeGeometry = new THREE.BoxGeometry(0.9 / 16, 0.45 / 16, 0.1 / 16);
            data.glowMaterials = [data.eyeMaterial];
        }
        if (!data.eyes || data.eyes[0].parent !== head) {
            data.eyes = [-1, 1].map((sign) => {
                const eye = new THREE.Mesh(data.eyeGeometry, data.eyeMaterial);
                eye.position.set(sign * 1.1 / 16, 3.6 / 16, 3.06 / 16);
                eye.userData.disposeGeometry = true;
                head.add(eye);
                return eye;
            });
        }
        const boost = this.ultraModeEnabled ? 4 : 1;
        data.eyeMaterial.color.setRGB(0.9 * boost, 0.85 * boost, boost);
    },

    // Glides with barely moving legs, floating a little; claws raised to strike.
    poseShadow(mob, speed, delta) {
        const data = mob.userData;
        const parts = data.modelParts;
        data.attackPose = Math.max(0, (data.attackPose || 0) - delta);
        const strike = data.attackPose > 0 ? Math.sin((1 - data.attackPose / 0.5) * Math.PI) : 0;
        data.modelRoot.position.y = 0.06 + Math.sin(data.life * 1.4) * 0.05;
        data.legs.forEach((leg, index) => { leg.rotation.x = Math.sin(data.life * 2 + index * Math.PI) * 0.12 * Math.min(1, speed); });
        data.arms.forEach((arm, index) => {
            arm.rotation.x = Math.sin(data.life * 0.9 + index) * 0.08 - strike * 1.6 - (speed > 1 ? 0.35 : 0);
        });
        parts.cloak.rotation.x = -0.08 - Math.min(speed, 2.5) * 0.12 - Math.sin(data.life * 3) * 0.03;
        const head = parts.head;
        head.rotation.x = 0.15 + Math.sin(data.life * 0.7) * 0.05;
        head.rotation.z = Math.sin(data.life * 0.5) * 0.12;
    },

    // Struck: it reels back; destroyed, it bursts into smoke.
    hitShadow(mob) {
        const data = mob.userData;
        if (data.dissolving !== undefined) return;
        data.health -= 4;
        this.updateMobHealthBar(mob);
        const away = Math.atan2(mob.position.z - this.camera.position.z, mob.position.x - this.camera.position.x);
        this.walkStep(mob, away, 0.8, 0.2);
        this.emitSmoke(mob.position, 4, 1.4);
        this.playTone({ frequency: 180, endFrequency: 90, duration: 0.2, type: 'triangle', volume: 0.03, release: 0.1 });
        if (data.health <= 0) this.dissolveShadow(mob, 'You banished the wandering shadow');
    },

    dissolveShadow(mob, message) {
        const data = mob.userData;
        data.dissolving = 0;
        if (data.healthBar) data.healthBar.visible = false;
        data.modelRoot.traverse((node) => {
            if (node.isMesh && node.material) node.material.transparent = true;
        });
        this.playNoiseBurst({ duration: 0.9, volume: 0.03, highpass: 150, lowpass: 1500 });
        this.playTone({ frequency: 220, endFrequency: 60, duration: 0.9, type: 'sine', volume: 0.02, attack: 0.05, release: 0.3 });
        if (message) this.receiveSystemMessage({ text: message });
    },

    // Smoke pours off it as it shrinks and fades away.
    updateDissolvingShadow(mob, delta) {
        const data = mob.userData;
        data.dissolving += delta;
        const t = Math.min(1, data.dissolving / 1.6);
        if (Math.random() < delta * 25) {
            const puff = mob.position.clone();
            puff.x += (Math.random() - 0.5) * 0.6;
            puff.y += Math.random() * 2.2 * (1 - t * 0.5);
            puff.z += (Math.random() - 0.5) * 0.6;
            this.emitSmoke(puff, 1, 0.9);
        }
        data.modelRoot.traverse((node) => {
            if (node.isMesh && node.material) node.material.opacity = 1 - t;
        });
        data.modelRoot.scale.set(1 - t * 0.4, 1 - t * 0.6, 1 - t * 0.4);
        data.modelRoot.position.y = t * 0.6;
        if (t >= 1) this.removeMob(mob);
    },

    // Dark puffs that rise, swell and fade.
    emitSmoke(position, count, size) {
        this.smokePuffs = this.smokePuffs || [];
        for (let i = 0; i < count; i++) {
            const material = new THREE.SpriteMaterial({ map: this.getFireflyHaloTexture(), color: 0x1a1622, transparent: true, depthWrite: false, opacity: 0.75 });
            const sprite = new THREE.Sprite(material);
            sprite.position.set(position.x + (Math.random() - 0.5) * 0.8, position.y + Math.random() * 2, position.z + (Math.random() - 0.5) * 0.8);
            sprite.scale.setScalar(size * (0.5 + Math.random() * 0.5));
            sprite.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5);
            sprite.userData.age = 0;
            sprite.userData.life = 1.4 + Math.random() * 0.8;
            this.scene.add(sprite);
            this.smokePuffs.push(sprite);
        }
    },

    updateSmokePuffs(delta) {
        if (!this.smokePuffs || !this.smokePuffs.length) return;
        this.smokePuffs = this.smokePuffs.filter((sprite) => {
            sprite.userData.age += delta;
            const t = sprite.userData.age / sprite.userData.life;
            if (t >= 1) {
                this.scene.remove(sprite);
                sprite.material.dispose();
                return false;
            }
            sprite.position.addScaledVector(sprite.userData.velocity, delta);
            sprite.scale.multiplyScalar(1 + delta * 0.6);
            sprite.material.opacity = 0.75 * (1 - t);
            return true;
        });
    }
});
