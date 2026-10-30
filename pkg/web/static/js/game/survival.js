// Health, damage, death, respawn points and sleeping.
// Mixed into Game.prototype; `this` is the Game instance.

Object.assign(Game.prototype, {
    loadRespawnPoint() {
        const saved = window.localStorage.getItem('minecloud-respawn-point');
        if (!saved) return null;

        try {
            const parsed = JSON.parse(saved);
            if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number' || typeof parsed.z !== 'number') {
                return null;
            }
            return {
                x: parsed.x,
                y: parsed.y,
                z: parsed.z,
                yaw: typeof parsed.yaw === 'number' ? parsed.yaw : 0,
                pitch: typeof parsed.pitch === 'number' ? parsed.pitch : 0
            };
        } catch (_error) {
            return null;
        }
    },

    saveRespawnPoint() {
        window.localStorage.setItem('minecloud-respawn-point', JSON.stringify(this.respawnPoint));
    },

    restoreLastSafePosition() {
        const saved = window.localStorage.getItem('minecloud-last-safe-position');
        if (!saved) return;

        try {
            const parsed = JSON.parse(saved);
            if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number' || typeof parsed.z !== 'number') {
                return;
            }

            this.lastSafePosition = {
                x: parsed.x,
                y: parsed.y,
                z: parsed.z,
                yaw: typeof parsed.yaw === 'number' ? parsed.yaw : 0,
                pitch: typeof parsed.pitch === 'number' ? parsed.pitch : 0
            };
            this.cameraController.setPosition(this.lastSafePosition);
        } catch (_error) {
        }
    },

    saveLastSafePosition() {
        if (!this.lastSafePosition) return;

        window.localStorage.setItem('minecloud-last-safe-position', JSON.stringify(this.lastSafePosition));
    },

    updateHealthUI() {
        const healthValue = document.getElementById('health-value');
        const healthFill = document.getElementById('health-fill');
        if (healthValue) {
            healthValue.textContent = `${Math.max(0, Math.ceil(this.health))}/${this.maxHealth}`;
        }
        if (healthFill) {
            const ratio = Math.max(0, Math.min(1, this.health / this.maxHealth));
            healthFill.style.transform = `scaleX(${ratio})`;
            healthFill.style.background = ratio > 0.5
                ? 'linear-gradient(90deg, #d74646 0%, #ff8080 100%)'
                : ratio > 0.25
                    ? 'linear-gradient(90deg, #d77c32 0%, #ffd16c 100%)'
                    : 'linear-gradient(90deg, #9a1c1c 0%, #ff5353 100%)';
        }
    },

    getFoodHealAmount(type) {
        switch (type) {
            case 'mushroom_red': return 3;
            case 'mushroom_brown': return 4;
            case 'flower_yellow': return 1;
            default: return 0;
        }
    },

    eatSelectedItem() {
        const type = this.getSelectedBlockType();
        const itemDef = this.getItemDefinition(type);
        if (itemDef && itemDef.consume && this.getInventoryCount(type) > 0) return itemDef.consume.call(this, type);
        const healAmount = this.getFoodHealAmount(type);
        if (!type || healAmount <= 0) return false;
        if (this.health >= this.maxHealth) {
            this.receiveSystemMessage({ text: 'You are already at full health' });
            return true;
        }

        if (!this.consumeSelectedBlock()) return false;
        this.health = Math.min(this.maxHealth, this.health + healAmount);
        this.updateHealthUI();
        this.playTone({ frequency: 600, duration: 0.05, type: 'triangle', volume: 0.025, release: 0.05 });
        this.receiveSystemMessage({ text: `You ate ${this.getBlockDisplayName(type)} and recovered ${healAmount} health` });
        return true;
    },

    updateDeathScreen() {
        const screen = document.getElementById('death-screen');
        const reason = document.getElementById('death-reason');
        const timer = document.getElementById('death-timer');
        if (!screen || !reason || !timer) return;

        screen.classList.toggle('visible', this.respawnPending);
        reason.textContent = this.deathReason;
        timer.textContent = this.respawnPending ? `${Math.max(0, this.respawnTimer).toFixed(1)}s` : '';
    },

    flashDamageIndicator() {
        this.hitIndicator.style.background = 'rgba(255, 80, 80, 0.9)';
        this.showHitIndicator();
        setTimeout(() => {
            this.hitIndicator.style.background = 'rgba(255,255,255,0.8)';
        }, 110);
    },

    // type: 'mob' (a creature's attack), 'poison', 'fall', 'lightning', 'void' or 'other';
    // damage modifiers (registerDamageModifier) can reduce it, e.g. armour.
    applyDamage(amount, reason = 'Respawning soon...', type = 'other') {
        amount = DAMAGE_MODIFIERS.reduce((current, modifier) => modifier.call(this, current, type, reason), amount);
        if (amount <= 0 || this.health <= 0 || this.respawnPending) return;

        this.health = Math.max(0, this.health - amount);
        this.updateHealthUI();
        this.flashDamageIndicator();

        if (this.health <= 0) {
            this.startRespawnCountdown(reason);
        }
    },

    startRespawnCountdown(reason) {
        this.respawnPending = true;
        this.respawnTimer = 3;
        this.deathReason = reason;
        this.stopMining();
        this.resetMiningBlockVisual(true);
        this.closeChatInput();
        this.closeSignReader();
        if (this.network && this.network.connected) {
            const broadcastReason = reason.startsWith('You ') ? reason.slice(4) : reason;
            this.network.send('playerDeath', { reason: broadcastReason.toLowerCase() });
        }
        this.updateDeathScreen();
    },

    healToFull() {
        this.health = this.maxHealth;
        this.updateHealthUI();
    },

    respawnPlayer() {
        this.stopMining();
        this.resetMiningBlockVisual(true);
        this.closeChatInput();
        const spawnPosition = this.respawnPoint || this.lastSafePosition || { x: 0, y: 20, z: 0, yaw: 0, pitch: 0 };
        this.cameraController.setPosition(spawnPosition);
        this.lastSafePosition = this.cameraController.getPosition();
        this.saveLastSafePosition();
        this.healToFull();
        this.respawnPending = false;
        this.respawnTimer = 0;
        this.wasOnGroundForDamage = false;
        this.updateDeathScreen();
    },

    setRespawnPointFromBlock(position) {
        this.respawnPoint = {
            x: position.x + 0.5,
            y: position.y + 1 + this.cameraController.eyeHeight,
            z: position.z + 0.5,
            yaw: this.cameraController.yaw,
            pitch: this.cameraController.pitch
        };
        this.saveRespawnPoint();
        this.receiveSystemMessage({ text: 'Respawn point updated to your bed' });
    },

    isRespawnBoundToBlock(position) {
        if (!this.respawnPoint) return false;
        return Math.abs(this.respawnPoint.x - (position.x + 0.5)) < 0.001 &&
            Math.abs(this.respawnPoint.y - (position.y + 1 + this.cameraController.eyeHeight)) < 0.001 &&
            Math.abs(this.respawnPoint.z - (position.z + 0.5)) < 0.001;
    },

    trySleepInBed() {
        const hit = this.raycastBlock(this.breakDistance);
        if (!hit) return false;

        const worldPos = this.world.getBlockPositionFromIntersection(hit);
        if (!worldPos) return false;
        if (this.world.getBlockTypeAt(worldPos.x, worldPos.y, worldPos.z) !== 'bed') return false;

        if (!this.isNightTime()) {
            this.receiveSystemMessage({ text: 'You can only sleep at night' });
            return true;
        }

        if (this.network && this.network.connected) {
            this.network.requestSleep();
        } else {
            this.timeOfDay = 0;
            this.weatherState = 'clear';
            this.weatherTimer = 0;
            this.nextWeatherChange = 55 + Math.random() * 70;
            this.receiveSystemMessage({ text: 'You slept until dawn' });
        }
        this.playTone({ frequency: 520, duration: 0.08, type: 'triangle', volume: 0.03, release: 0.08 });
        return true;
    },

    updateSurvival(delta) {
        this.lastSafePositionSaveTimer += delta;

        if (this.cameraController.spawnSettling) {
            // The join/respawn descent never counts as a fall.
            this.cameraController.consumeLandingSpeed();
            this.wasOnGroundForDamage = true;
            return;
        }

        if (!this.wasOnGroundForDamage && this.cameraController.onGround) {
            // Damage depends on impact speed, expressed as the equivalent free-fall height
            // (v^2 / 2g). On land this matches the distance fallen; water braking reduces it.
            const impactSpeed = this.cameraController.consumeLandingSpeed();
            const fallDistance = (impactSpeed * impactSpeed) / (2 * 20);
            if (fallDistance > 4.2) {
                const damage = Math.min(this.maxHealth, Math.ceil((fallDistance - 4) * 1.8));
                this.applyDamage(damage, 'You died from fall damage', 'fall');
            }
        }

        if (this.camera.position.y < -35) {
            this.applyDamage(this.maxHealth, 'You fell into the void', 'void');
        }

        if (this.cameraController.onGround && this.health > 0 && this.lastSafePositionSaveTimer >= 1) {
            const position = this.cameraController.getPosition();
            this.lastSafePosition = {
                x: position.x,
                y: position.y,
                z: position.z,
                yaw: position.yaw,
                pitch: position.pitch
            };
            this.saveLastSafePosition();
            this.lastSafePositionSaveTimer = 0;
        }

        this.wasOnGroundForDamage = this.cameraController.onGround;
    }
});
