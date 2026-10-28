// Sky, day/night cycle, weather, celestial bodies and RTX rendering mode.
// Mixed into Game.prototype; `this` is the Game instance.

Object.assign(Game.prototype, {
    isNightTime() {
        const hour = ((this.timeOfDay * 24) + 6) % 24;
        return hour >= 18 || hour < 6;
    },

    createMoonPhaseTexture(phase) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#07111f';
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = '#f4f1da';
        ctx.beginPath();
        ctx.arc(64, 64, 36, 0, Math.PI * 2);
        ctx.fill();

        const shadowOffset = (phase / 7 - 0.5) * 72;
        ctx.fillStyle = '#07111f';
        ctx.beginPath();
        ctx.arc(64 + shadowOffset, 64, 36, 0, Math.PI * 2);
        ctx.fill();

        const texture = new THREE.CanvasTexture(canvas);
        if (THREE.sRGBEncoding) {
            texture.encoding = THREE.sRGBEncoding;
        }
        texture.needsUpdate = true;
        return texture;
    },

    initCelestialBodies() {
        this.sunCube = new THREE.Mesh(
            new THREE.BoxGeometry(10, 10, 10),
            new THREE.MeshBasicMaterial({ color: 0xffdd88 })
        );
        this.sunCube.renderOrder = 10;
        this.sunCube.material.fog = false;
        this.scene.add(this.sunCube);

        const moonMaterials = [];
        for (let i = 0; i < 8; i++) {
            moonMaterials.push(new THREE.MeshBasicMaterial({ map: this.createMoonPhaseTexture(i), fog: false }));
        }
        this.moonCube = new THREE.Mesh(new THREE.BoxGeometry(9, 9, 9), moonMaterials);
        this.moonCube.renderOrder = 10;
        this.scene.add(this.moonCube);
    },

    initWeatherEffects() {
        const rainCount = 360;
        const positions = new Float32Array(rainCount * 3);
        for (let i = 0; i < rainCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 28;
            positions[i * 3 + 1] = Math.random() * 20 + 4;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 28;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: 0x9fd8ff,
            size: 0.08,
            transparent: true,
            opacity: 0.7,
            depthWrite: false
        });

        this.rainSystem = new THREE.Points(geometry, material);
        this.rainSystem.visible = false;
        this.scene.add(this.rainSystem);
        this.rainPositions = positions;
    },

    updateRTXStatus() {
        const statusEl = document.getElementById('rtx-status');
        if (!statusEl) return;

        statusEl.textContent = this.ultraModeEnabled ? 'Ultra' : this.rtxModeEnabled ? 'On' : 'Off';
        statusEl.style.color = this.ultraModeEnabled ? '#FFD36B' : this.rtxModeEnabled ? '#7CE7FF' : '#FFFFFF';
    },

    getSkyPreset() {
        return this.rtxModeEnabled
            ? {
                daySky: new THREE.Color(0x90B6D4),
                sunsetSky: new THREE.Color(0xF28B52),
                nightSky: new THREE.Color(0x07111F),
                dayFog: new THREE.Color(0xB4C8D9),
                sunsetFog: new THREE.Color(0xE39A69),
                nightFog: new THREE.Color(0x0B1521)
            }
            : {
                daySky: new THREE.Color(0x87CEEB),
                sunsetSky: new THREE.Color(0xE58A5C),
                nightSky: new THREE.Color(0x10243A),
                dayFog: new THREE.Color(0x87CEEB),
                sunsetFog: new THREE.Color(0xD59369),
                nightFog: new THREE.Color(0x13263A)
            };
    },

    blendColors(colorA, colorB, alpha) {
        return colorA.clone().lerp(colorB, alpha);
    },

    // True only when the rendered camera is below the visible water surface (not merely
    // when the player's feet or body are in water).
    isCameraUnderwater() {
        const { x, y, z } = this.camera.position;
        const blockX = Math.floor(x);
        const blockY = Math.floor(y);
        const blockZ = Math.floor(z);
        if (this.world.getBlockTypeAt(blockX, blockY, blockZ) !== 'water') return false;
        // A water cell with water above is full; the top one is drawn at WATER_SURFACE_HEIGHT.
        if (this.world.getBlockTypeAt(blockX, blockY + 1, blockZ) === 'water') return true;
        return y - blockY < WATER_SURFACE_HEIGHT;
    },

    updateUnderwaterEffect() {
        const underwater = this.isCameraUnderwater();
        const overlay = document.getElementById('underwater-overlay');
        if (overlay) {
            overlay.style.opacity = underwater ? '1' : '0';
        }

        if (!this.scene.fog) return;
        if (underwater) {
            this.scene.fog.near = 3;
            this.scene.fog.far = this.rtxModeEnabled ? 24 : 18;
            this.scene.fog.color.copy(this.blendColors(this.scene.fog.color, new THREE.Color(0x356f9c), 0.6));
        }
    },

    updateDayNightCycle(delta) {
        if (!this.dayNightCycleEnabled) return;

        this.timeOfDay = (this.timeOfDay + delta / this.dayNightCycleDuration) % 1;

        const angle = this.timeOfDay * Math.PI * 2;
        const sunHeight = Math.sin(angle - Math.PI / 2);
        const daylight = THREE.MathUtils.clamp((sunHeight + 0.16) / 1.16, 0, 1);
        const sunset = Math.max(0, 1 - Math.abs(sunHeight) * 3.2) * (1 - daylight * 0.55);
        // Torch light is baked into chunk meshes; it shows mostly once the sun is down.
        this.world.setBlockLightStrength(THREE.MathUtils.lerp(1, 0.6, daylight));

        const preset = this.getSkyPreset();
        const sky = this.blendColors(this.blendColors(preset.nightSky, preset.sunsetSky, sunset), preset.daySky, daylight);
        const fog = this.blendColors(this.blendColors(preset.nightFog, preset.sunsetFog, sunset), preset.dayFog, daylight);

        this.scene.background.copy(sky);
        this.scene.fog.color.copy(fog);
        this.scene.fog.near = this.rtxModeEnabled ? 18 : 20;
        this.scene.fog.far = THREE.MathUtils.lerp(this.rtxModeEnabled ? 115 : 105, this.rtxModeEnabled ? 210 : 160, daylight);

        // Sun, moon and the shadow camera orbit the player (they used to orbit the world
        // origin, so shadows only existed near 0,0).
        const orbitRadius = 180;
        const sunOffset = new THREE.Vector3(
            Math.cos(angle) * orbitRadius,
            Math.max(18, sunHeight * orbitRadius + 24),
            Math.sin(angle) * orbitRadius * 0.65
        );
        this.sunDirection = (this.sunDirection || new THREE.Vector3()).copy(sunOffset).normalize();
        this.sunHeight = sunHeight;
        this.daylight = daylight;
        const anchor = this.getShadowAnchor();
        this.sunLight.position.copy(anchor).add(sunOffset);
        this.sunLight.target.position.copy(anchor);
        this.sunLight.target.updateMatrixWorld();
        if (this.sunCube) {
            this.sunCube.position.copy(this.camera.position).addScaledVector(sunOffset, 0.92);
            this.sunCube.visible = sunHeight > -0.18 && !this.ultraModeEnabled;
        }
        if (this.moonCube) {
            this.moonCube.position.set(
                this.camera.position.x - sunOffset.x * 0.92,
                this.camera.position.y + Math.max(18, -sunHeight * orbitRadius + 24),
                this.camera.position.z - sunOffset.z * 0.92
            );
            const phase = ((this.worldDay % 8) + 8) % 8;
            if (phase !== this.currentMoonPhase) {
                this.currentMoonPhase = phase;
                this.moonCube.material.forEach((material) => {
                    if (material.map) {
                        material.map.dispose();
                    }
                    material.map = this.createMoonPhaseTexture(phase);
                    material.needsUpdate = true;
                });
            }
            this.moonCube.visible = sunHeight < 0.22;
        }

        this.sunLight.intensity = THREE.MathUtils.lerp(0.08, this.rtxModeEnabled ? 1.7 : 1.0, daylight) + sunset * 0.16;
        this.sunLight.color.copy(this.blendColors(new THREE.Color(0x8AA6D8), new THREE.Color(0xFFD7A8), sunset + daylight * 0.2));

        this.ambientLight.intensity = THREE.MathUtils.lerp(this.rtxModeEnabled ? 0.03 : 0.08, this.rtxModeEnabled ? 0.22 : 0.6, daylight);
        this.hemiLight.intensity = THREE.MathUtils.lerp(this.rtxModeEnabled ? 0.14 : 0.16, this.rtxModeEnabled ? 0.55 : 0.45, daylight);
        this.hemiLight.color.copy(this.blendColors(new THREE.Color(0x445B8A), new THREE.Color(0xBFD7FF), daylight));
        this.hemiLight.groundColor.copy(this.blendColors(new THREE.Color(0x171718), new THREE.Color(0x4C4336), daylight));

        if (this.rtxModeEnabled) {
            this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.52, 1.18, daylight) + sunset * 0.05;
        }
    },

    // The HDR pipeline in ultra mode is costly per pixel, so it renders at a lower ratio than RTX.
    getPixelRatioLimit() {
        const limit = this.ultraModeEnabled ? 1.5 : this.rtxModeEnabled ? 2 : 1.25;
        return Math.min(window.devicePixelRatio, limit);
    },

    // Player position snapped to the shadow map's texel grid, so shadows do not shimmer
    // as the shadow camera follows the player.
    getShadowAnchor() {
        const camera = this.sunLight.shadow.camera;
        const texel = (camera.right - camera.left) / this.sunLight.shadow.mapSize.x;
        const p = this.camera.position;
        return new THREE.Vector3(Math.round(p.x / texel) * texel, Math.round(p.y / texel) * texel, Math.round(p.z / texel) * texel);
    },

    updateWeather(delta) {
        if (!this.rainSystem || !this.rainPositions) return;

        this.weatherTimer += delta;
        if (this.weatherTimer >= this.nextWeatherChange) {
            this.weatherTimer = 0;
            this.nextWeatherChange = 55 + Math.random() * 70;
            this.weatherState = this.weatherState === 'clear' ? 'rain' : 'clear';
        }

        const raining = this.weatherState === 'rain';
        this.rainSystem.visible = raining;
        if (!raining) {
            return;
        }

        this.rainSystem.position.set(this.camera.position.x, this.camera.position.y - 1, this.camera.position.z);
        for (let i = 0; i < this.rainPositions.length; i += 3) {
            this.rainPositions[i + 1] -= delta * (15 + (i % 5));
            if (this.rainPositions[i + 1] < -2) {
                this.rainPositions[i] = (Math.random() - 0.5) * 28;
                this.rainPositions[i + 1] = Math.random() * 20 + 8;
                this.rainPositions[i + 2] = (Math.random() - 0.5) * 28;
            }
        }
        this.rainSystem.geometry.attributes.position.needsUpdate = true;

        this.sunLight.intensity *= 0.78;
        this.ambientLight.intensity *= 0.92;
        this.hemiLight.intensity *= 0.9;
        this.scene.fog.color.copy(this.blendColors(this.scene.fog.color, new THREE.Color(0x8ca0af), 0.35));
    },

    updateCaveLighting() {
        const cameraX = Math.floor(this.camera.position.x);
        const cameraY = Math.floor(this.camera.position.y);
        const cameraZ = Math.floor(this.camera.position.z);

        let overheadBlocks = 0;
        for (let y = cameraY; y < cameraY + 10; y++) {
            if (this.world.hasSolidBlock(cameraX, y, cameraZ)) {
                overheadBlocks++;
            }
        }

        let sideCover = 0;
        const samples = [
            [2, 0], [-2, 0], [0, 2], [0, -2],
            [1, 1], [-1, 1], [1, -1], [-1, -1]
        ];
        for (const [dx, dz] of samples) {
            if (this.world.hasSolidBlock(cameraX + dx, cameraY, cameraZ + dz) || this.world.hasSolidBlock(cameraX + dx, cameraY + 1, cameraZ + dz)) {
                sideCover++;
            }
        }

        const darkness = THREE.MathUtils.clamp((overheadBlocks / 10) * 0.75 + (sideCover / samples.length) * 0.35, 0, 0.78);
        const factor = 1 - darkness;

        this.ambientLight.intensity *= THREE.MathUtils.lerp(0.22, 1, factor);
        this.hemiLight.intensity *= THREE.MathUtils.lerp(0.18, 1, factor);
        this.scene.fog.color.copy(this.blendColors(this.scene.fog.color, new THREE.Color(0x0d1320), darkness * 0.5));

        if (this.rtxModeEnabled) {
            this.renderer.toneMappingExposure *= THREE.MathUtils.lerp(0.48, 1, factor);
        }
    },

    applyRTXMode(enabled) {
        this.rtxModeEnabled = enabled;

        const skyColor = new THREE.Color(enabled ? 0x9BB7D1 : 0x87CEEB);
        this.scene.background = skyColor;
        this.scene.fog = new THREE.Fog(skyColor.getHex(), enabled ? 18 : 20, enabled ? 190 : 150);

        if (!enabled && this.ultraModeEnabled) this.applyUltraMode(false);
        this.renderer.setPixelRatio(this.getPixelRatioLimit());
        this.renderer.shadowMap.enabled = enabled;
        this.renderer.shadowMap.type = enabled ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
        this.renderer.toneMapping = enabled ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
        this.renderer.toneMappingExposure = enabled ? 1.15 : 1;
        if ('physicallyCorrectLights' in this.renderer) {
            this.renderer.physicallyCorrectLights = enabled;
        }
        if (THREE.sRGBEncoding && this.renderer.outputEncoding !== undefined) {
            this.renderer.outputEncoding = THREE.sRGBEncoding;
        }

        this.scene.environment = enabled ? this.getSkyEnvironment() : null;

        this.ambientLight.intensity = enabled ? 0.18 : 0.6;
        this.ambientLight.color.setHex(enabled ? 0xC8D6E5 : 0xFFFFFF);

        this.hemiLight.intensity = enabled ? 0.5 : 0.4;
        this.hemiLight.color.setHex(enabled ? 0xBFD7FF : 0x87CEEB);
        this.hemiLight.groundColor.setHex(enabled ? 0x4C4336 : 0x3D5C3D);

        this.sunLight.intensity = enabled ? 1.6 : 0.8;
        this.sunLight.color.setHex(enabled ? 0xFFF3D6 : 0xFFFFA0);
        this.sunLight.position.set(enabled ? 120 : 100, enabled ? 180 : 150, enabled ? 70 : 50);
        this.sunLight.castShadow = enabled;

        this.playerMaterial.dispose();
        this.playerMaterial = enabled
            ? new THREE.MeshStandardMaterial({ color: 0xFFCC00, roughness: 0.45, metalness: 0.05 })
            : new THREE.MeshLambertMaterial({ color: 0xFFCC00 });
        this.refreshOtherPlayerAvatarMaterials();

        this.world.setRTXMode(enabled);
        this.rebuildPickupMeshes();
        this.refreshHeldItemMesh(true);
        this.syncOtherPlayerShadows();
        this.updateRTXStatus();
        this.rtxPreferred = enabled;
        this.saveSettings();
        this.updateSettingsUI();
        this.lastSelectionUpdate = 0;
        this.updateDayNightCycle(0);
    },

    // Image-based lighting for RTX mode: a prefiltered sky gradient so PBR materials
    // (water, glass, metals, polished stone) have something to reflect.
    getSkyEnvironment() {
        if (this.skyEnvironment) return this.skyEnvironment;

        const envScene = new THREE.Scene();
        const geometry = new THREE.SphereGeometry(10, 32, 16);
        const zenith = new THREE.Color(0x4f86c6);
        const horizon = new THREE.Color(0xd8e6f0);
        const ground = new THREE.Color(0x4d4637);
        const colors = [];
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
            const t = position.getY(i) / 10;
            const color = t >= 0 ? horizon.clone().lerp(zenith, Math.pow(t, 0.6)) : horizon.clone().lerp(ground, Math.min(1, -t * 3));
            colors.push(color.r, color.g, color.b);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        envScene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

        const sun = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1d0 }));
        sun.position.set(5, 7, 3);
        envScene.add(sun);

        const generator = new THREE.PMREMGenerator(this.renderer);
        this.skyEnvironment = generator.fromScene(envScene, 0.02).texture;
        generator.dispose();
        geometry.dispose();
        return this.skyEnvironment;
    },

    toggleRTXMode() {
        this.stopMining();
        this.resetMiningBlockVisual(true);
        this.applyRTXMode(!this.rtxModeEnabled);
    },

    handleRTXShortcut() {
        const now = performance.now();
        this.rtxTogglePresses.push(now);
        this.rtxTogglePresses = this.rtxTogglePresses.filter((time) => now - time <= this.rtxToggleWindowMs);

        if (this.rtxTogglePresses.length >= 3) {
            this.rtxTogglePresses = [];
            this.toggleRTXMode();
        }
    }
});
