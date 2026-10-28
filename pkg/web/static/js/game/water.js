// Water interaction: ripples when entering or moving through water, and splash particles
// on fast entries. Ripples are drawn by the water shader (WorldRenderer.addRipple), so they
// show in RTX and Ultra modes; splashes show in every mode.

Object.assign(Game.prototype, {
    // Height of the visible water surface above the column at (x, z) near y, or null.
    findWaterSurface(x, y, z) {
        const bx = Math.floor(x);
        const bz = Math.floor(z);
        let by = Math.floor(y);
        if (this.world.getBlockTypeAt(bx, by, bz) !== 'water') {
            by -= 1;
            if (this.world.getBlockTypeAt(bx, by, bz) !== 'water') return null;
        }
        while (this.world.getBlockTypeAt(bx, by + 1, bz) === 'water') by++;
        return by + WATER_SURFACE_HEIGHT;
    },

    updateWaterInteraction(delta) {
        const controller = this.cameraController;
        const position = this.camera.position;
        const feetY = position.y - controller.eyeHeight;
        const inWater = controller.isInWater;
        const wasInWater = this.wasInWaterForRipples || false;

        if (inWater && !wasInWater) {
            const surface = this.findWaterSurface(position.x, feetY, position.z);
            if (surface !== null) {
                // Faster entries make bigger rings and splashes.
                const speed = Math.max(0, -(this.lastPlayerVelocityY || 0));
                const strength = THREE.MathUtils.clamp(0.4 + speed * 0.09, 0.4, 1.6);
                this.world.addRipple(position.x, position.z, strength);
                if (speed > 3) this.spawnSplash(position.x, surface, position.z, Math.min(1, speed / 18));
                this.playNoiseBurst({ duration: 0.18 + strength * 0.12, volume: 0.02 + strength * 0.025, highpass: 400, lowpass: 2600 });
            }
        }

        // Wading and swimming near the surface leave small rings behind.
        this.wadeRippleTimer = Math.max(0, (this.wadeRippleTimer || 0) - delta);
        if (inWater && this.wadeRippleTimer === 0) {
            const moved = this.lastRipplePosition ? Math.hypot(position.x - this.lastRipplePosition.x, position.z - this.lastRipplePosition.z) : Infinity;
            const surface = this.findWaterSurface(position.x, feetY, position.z);
            if (surface !== null && moved > 0.5 && position.y > surface - 1.2) {
                this.world.addRipple(position.x, position.z, 0.3);
                this.lastRipplePosition = { x: position.x, z: position.z };
                this.wadeRippleTimer = 0.35;
            }
        }

        this.wasInWaterForRipples = inWater;
        this.lastPlayerVelocityY = controller.velocityY;
        this.updateSplashes(delta);
    },

    spawnSplash(x, y, z, intensity) {
        if (!this.splashMaterial) {
            this.splashMaterial = new THREE.PointsMaterial({ color: 0xdcefff, size: 0.12, transparent: true, opacity: 0.85, depthWrite: false });
            this.splashes = [];
        }
        const count = Math.round(30 + intensity * 50);
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const outward = 0.6 + Math.random() * 1.8 * intensity;
            positions.set([x + Math.cos(angle) * 0.2, y, z + Math.sin(angle) * 0.2], i * 3);
            velocities.set([Math.cos(angle) * outward, 2.5 + Math.random() * 4.5 * intensity, Math.sin(angle) * outward], i * 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const points = new THREE.Points(geometry, this.splashMaterial.clone());
        points.frustumCulled = false;
        this.scene.add(points);
        this.splashes.push({ points, velocities, surface: y, age: 0 });
    },

    updateSplashes(delta) {
        if (!this.splashes || this.splashes.length === 0) return;
        for (let s = this.splashes.length - 1; s >= 0; s--) {
            const splash = this.splashes[s];
            splash.age += delta;
            const attribute = splash.points.geometry.attributes.position;
            const p = attribute.array;
            for (let i = 0; i < p.length; i += 3) {
                if (p[i + 1] < splash.surface - 0.05) continue;
                splash.velocities[i + 1] -= 14 * delta;
                p[i] += splash.velocities[i] * delta;
                p[i + 1] += splash.velocities[i + 1] * delta;
                p[i + 2] += splash.velocities[i + 2] * delta;
            }
            attribute.needsUpdate = true;
            splash.points.material.opacity = 0.85 * Math.max(0, 1 - splash.age / 1.2);
            if (splash.age > 1.2) {
                this.scene.remove(splash.points);
                splash.points.geometry.dispose();
                splash.points.material.dispose();
                this.splashes.splice(s, 1);
            }
        }
    }
});
