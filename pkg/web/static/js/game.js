class Game {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cameraController = null;
        this.world = null;
        this.network = null;
        
        this.clock = new THREE.Clock();
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.lastSelectionUpdate = 0;
        this.lastNetworkUpdate = 0;
        
        this.raycaster = new THREE.Raycaster();
        this.screenCenter = new THREE.Vector2(0, 0);
        
        this.breakDistance = 4.5;
        this.placeDistance = 4.5;
        this.selectionUpdateInterval = 50;
        
        this.inventory = ['grass', 'dirt', 'cobblestone', 'wood', 'planks', 'brick', 'sand', 'water', 'leaves', 'torch'];
        this.inventoryCounts = {
            grass: 24,
            dirt: 24,
            cobblestone: 24,
            wood: 20,
            planks: 20,
            brick: 16,
            sand: 20,
            water: 12,
            leaves: 16,
            bed: 0,
            sign: 0,
            glass: 0,
            stone_bricks: 0,
            torch: 0
        };
        this.selectedSlot = 0;
        this.restoreInventoryState();
        this.playerName = this.loadPlayerName();
        this.settings = this.loadSettings();
        this.masterVolume = this.settings.masterVolume;
        this.mouseSensitivity = this.settings.mouseSensitivity;
        this.rtxPreferred = this.settings.rtxModeEnabled;
        this.renderDistanceSetting = this.settings.renderDistance;
        this.rtxModeEnabled = false;
        this.rtxTogglePresses = [];
        this.rtxToggleWindowMs = 1200;
        this.wheelSlotAccumulator = 0;
        this.lastWheelStepAt = 0;
        this.touchControlsEnabled = false;
        this.mobileMovePointerId = null;
        this.mobileLookPointerId = null;
        this.mobileLookLast = { x: 0, y: 0 };
        this.mobileJoystickTravel = 42;
        this.resetTouchJoystick = null;
        this.dayNightCycleEnabled = true;
        this.dayNightCycleDuration = 240;
        this.timeOfDay = 0.22;
        this.weatherState = 'clear';
        this.weatherTimer = 0;
        this.nextWeatherChange = 70;
        this.craftingOpen = false;
        this.pauseOpen = false;
        this.craftingRecipes = [
            {
                id: 'planks',
                name: 'Saw Wood into Planks',
                output: { type: 'planks', amount: 4 },
                inputs: [{ type: 'wood', amount: 1 }]
            },
            {
                id: 'glass',
                name: 'Smelt Sand into Glass',
                output: { type: 'glass', amount: 2 },
                inputs: [{ type: 'sand', amount: 3 }]
            },
            {
                id: 'brick',
                name: 'Pack Clay Bricks',
                output: { type: 'brick', amount: 2 },
                inputs: [{ type: 'dirt', amount: 2 }, { type: 'sand', amount: 1 }]
            },
            {
                id: 'stone_bricks',
                name: 'Cut Stone Bricks',
                output: { type: 'stone_bricks', amount: 2 },
                inputs: [{ type: 'cobblestone', amount: 2 }, { type: 'brick', amount: 1 }]
            },
            {
                id: 'bed',
                name: 'Build Bed',
                output: { type: 'bed', amount: 1 },
                inputs: [{ type: 'planks', amount: 3 }, { type: 'leaves', amount: 2 }, { type: 'wood', amount: 1 }]
            },
            {
                id: 'sign',
                name: 'Carve Sign',
                output: { type: 'sign', amount: 1 },
                inputs: [{ type: 'planks', amount: 2 }, { type: 'wood', amount: 1 }]
            },
            {
                id: 'torch',
                name: 'Build Torch',
                output: { type: 'torch', amount: 4 },
                inputs: [{ type: 'wood', amount: 1 }, { type: 'coal_ore', amount: 1 }]
            }
        ];

        this.ambientLight = null;
        this.sunLight = null;
        this.hemiLight = null;
        this.hotbarSlotElements = [];
        this.hotbarCountElements = [];
        this.pickups = new Map();
        this.pickupIdCounter = 0;
        this.remotePlayerNames = new Map();
        this.voiceChat = null;
        this.audioContext = null;
        this.audioUnlocked = false;
        this.noiseBuffer = null;
        this.wasOnGround = false;
        this.rainSystem = null;
        this.rainPositions = null;
        this.chatMessages = [];
        this.chatOpen = false;
        this.chatHideTimeout = null;
        this.signReaderOpen = false;
        this.remoteFootstepRange = 9;
        this.localFootstepDistance = 0;
        this.localFootstepStepLength = 1.1;
        this.lastLocalGroundPosition = null;
        this.cameraBobPhase = 0;
        this.photoMode = false;
        this.maxHealth = 20;
        this.health = this.maxHealth;
        this.respawnPending = false;
        this.respawnTimer = 0;
        this.deathReason = 'Respawning soon...';
        this.wasOnGroundForDamage = false;
        this.airbornePeakFeetY = null;
        this.respawnPoint = this.loadRespawnPoint() || { x: 0, y: 20, z: 0, yaw: 0, pitch: 0 };
        this.lastSafePosition = null;
        this.lastSafePositionSaveTimer = 0;
        
        this.otherPlayerMeshes = new Map();
        this.playerGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8);
        this.playerMaterial = new THREE.MeshLambertMaterial({ color: 0xFFCC00 });

        this.selectionBox = null;
        this.hitIndicator = null;
        this.miningOverlay = null;
        this.miningOverlayTextures = [];
        this.breakParticleGeometry = null;
        this.breakParticleMaterials = new Map();
        this.breakParticles = [];

        this.isBreakInputActive = false;
        this.miningTargetKey = null;
        this.miningTargetDuration = 0;
        this.miningProgress = 0;
        this.miningTargetType = null;
        this.miningStrikeTimer = 0;
        this.miningStrikeInterval = 0.14;

        this.miningBlockVisual = null;
        this.miningBlockVisualZero = new THREE.Vector3(0, 0, 0);
        this.instanceTempQuaternion = new THREE.Quaternion();
        this.instanceTempMatrix = new THREE.Matrix4();
        this.instanceTempScale = new THREE.Vector3(1, 1, 1);

        this.firstPersonHand = null;
        this.heldItemMesh = null;
        this.heldItemType = null;
        this.handBasePosition = new THREE.Vector3(0.62, -0.72, -1.05);
        this.handBaseRotation = new THREE.Euler(-0.55, 0.2, 0.18);
        this.handSwingTime = 0;

        this.init();
    }
    
    init() {
        this.initThreeJS();
        this.initCamera();
        this.initWorld();
        this.restoreLastSafePosition();
        this.applyRTXMode(this.rtxPreferred);
        this.initNetwork();
        this.initHotbar();
        this.initInput();
        this.initPauseMenu();
        this.initVoiceChat();
        
        document.getElementById('connecting').style.display = 'none';
        this.refreshChatVisibility();
        this.renderCraftingPanel();
        this.updateHealthUI();
        this.updateDeathScreen();
        
        this.animate();
    }

    loadPlayerName() {
        const savedName = window.localStorage.getItem('minecloud-player-name');
        if (savedName && savedName.trim()) {
            return savedName.trim().slice(0, 20);
        }

        const requested = window.prompt('Choose your player name', 'Player');
        const resolved = (requested || 'Player').trim().slice(0, 20) || 'Player';
        window.localStorage.setItem('minecloud-player-name', resolved);
        return resolved;
    }

    loadSettings() {
        const defaults = {
            masterVolume: 0.8,
            mouseSensitivity: 1,
            rtxModeEnabled: false,
            renderDistance: 4
        };

        const saved = window.localStorage.getItem('minecloud-settings');
        if (!saved) return defaults;

        try {
            const parsed = JSON.parse(saved);
            return {
                masterVolume: typeof parsed.masterVolume === 'number' ? parsed.masterVolume : defaults.masterVolume,
                mouseSensitivity: typeof parsed.mouseSensitivity === 'number' ? parsed.mouseSensitivity : defaults.mouseSensitivity,
                rtxModeEnabled: typeof parsed.rtxModeEnabled === 'boolean' ? parsed.rtxModeEnabled : defaults.rtxModeEnabled,
                renderDistance: typeof parsed.renderDistance === 'number' ? parsed.renderDistance : defaults.renderDistance
            };
        } catch (_error) {
            return defaults;
        }
    }

    saveSettings() {
        window.localStorage.setItem('minecloud-settings', JSON.stringify({
            masterVolume: this.masterVolume,
            mouseSensitivity: this.mouseSensitivity,
            rtxModeEnabled: this.rtxPreferred,
            renderDistance: this.renderDistanceSetting
        }));
    }

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
    }

    saveRespawnPoint() {
        window.localStorage.setItem('minecloud-respawn-point', JSON.stringify(this.respawnPoint));
    }

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
    }

    saveLastSafePosition() {
        if (!this.lastSafePosition) return;

        window.localStorage.setItem('minecloud-last-safe-position', JSON.stringify(this.lastSafePosition));
    }

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
        } catch (error) {
            console.warn('Failed to restore inventory state', error);
        }
    }

    saveInventoryState() {
        window.localStorage.setItem('minecloud-inventory-state', JSON.stringify({
            inventory: this.inventory,
            counts: this.inventoryCounts,
            selectedSlot: this.selectedSlot
        }));
    }

    getBlockDisplayName(type) {
        const def = this.world && this.world.blockTypes[type];
        return def ? def.name : type;
    }

    initPauseMenu() {
        const sensitivityInput = document.getElementById('settings-sensitivity');
        const volumeInput = document.getElementById('settings-volume');
        const renderDistanceInput = document.getElementById('settings-render-distance');
        const rtxToggle = document.getElementById('settings-rtx-toggle');
        const fullscreenToggle = document.getElementById('settings-fullscreen-toggle');
        const resumeButton = document.getElementById('settings-resume');

        if (!sensitivityInput || !volumeInput || !renderDistanceInput || !rtxToggle || !fullscreenToggle || !resumeButton) return;

        sensitivityInput.value = this.mouseSensitivity.toFixed(2);
        volumeInput.value = this.masterVolume.toFixed(2);
        renderDistanceInput.value = String(this.renderDistanceSetting);

        sensitivityInput.addEventListener('input', () => {
            this.mouseSensitivity = parseFloat(sensitivityInput.value);
            this.applyLookSensitivity();
            this.updateSettingsUI();
            this.saveSettings();
        });

        volumeInput.addEventListener('input', () => {
            this.masterVolume = parseFloat(volumeInput.value);
            this.updateSettingsUI();
            this.saveSettings();
        });

        renderDistanceInput.addEventListener('input', () => {
            this.renderDistanceSetting = parseInt(renderDistanceInput.value, 10);
            this.world.setRenderDistance(this.renderDistanceSetting, this.camera.position);
            this.updateSettingsUI();
            this.saveSettings();
        });

        document.addEventListener('fullscreenchange', () => this.updateSettingsUI());

        rtxToggle.addEventListener('click', () => this.toggleRTXMode());
        fullscreenToggle.addEventListener('click', () => this.toggleFullscreen());
        resumeButton.addEventListener('click', () => this.closePauseMenu());

        this.updateSettingsUI();
    }

    updateSettingsUI() {
        const sensitivityValue = document.getElementById('settings-sensitivity-value');
        const volumeValue = document.getElementById('settings-volume-value');
        const renderDistanceValue = document.getElementById('settings-render-distance-value');
        const rtxToggle = document.getElementById('settings-rtx-toggle');
        const fullscreenToggle = document.getElementById('settings-fullscreen-toggle');
        const sensitivityInput = document.getElementById('settings-sensitivity');
        const volumeInput = document.getElementById('settings-volume');
        const renderDistanceInput = document.getElementById('settings-render-distance');

        if (sensitivityValue) sensitivityValue.textContent = this.mouseSensitivity.toFixed(2);
        if (volumeValue) volumeValue.textContent = `${Math.round(this.masterVolume * 100)}%`;
        if (renderDistanceValue) renderDistanceValue.textContent = String(this.renderDistanceSetting);
        if (rtxToggle) rtxToggle.textContent = this.rtxModeEnabled ? 'Disable RTX' : 'Enable RTX';
        if (fullscreenToggle) fullscreenToggle.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Enter Fullscreen';
        if (sensitivityInput) sensitivityInput.value = this.mouseSensitivity.toFixed(2);
        if (volumeInput) volumeInput.value = this.masterVolume.toFixed(2);
        if (renderDistanceInput) renderDistanceInput.value = String(this.renderDistanceSetting);
    }

    async toggleFullscreen() {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
        } else {
            await document.documentElement.requestFullscreen();
        }
        this.updateSettingsUI();
    }

    applyLookSensitivity() {
        if (this.cameraController) {
            this.cameraController.setLookSpeed(0.002 * this.mouseSensitivity);
        }
    }

    openPauseMenu() {
        const menu = document.getElementById('pause-menu');
        if (!menu) return;

        this.pauseOpen = true;
        this.stopMining();
        this.closeChatInput();
        if (this.craftingOpen) {
            this.toggleCraftingPanel();
        }
        if (document.pointerLockElement === this.renderer.domElement) {
            document.exitPointerLock();
        }
        menu.classList.add('visible');
        this.updateSettingsUI();
    }

    closePauseMenu() {
        const menu = document.getElementById('pause-menu');
        if (!menu) return;

        this.pauseOpen = false;
        menu.classList.remove('visible');
        this.updateSettingsUI();
    }

    togglePauseMenu() {
        if (this.pauseOpen) {
            this.closePauseMenu();
        } else {
            this.openPauseMenu();
        }
    }

    ensureAudio() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;

        if (!this.audioContext) {
            this.audioContext = new AudioCtx();
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        this.audioUnlocked = this.audioContext.state === 'running';
        return this.audioContext;
    }

    getNoiseBuffer() {
        const audio = this.ensureAudio();
        if (!audio) return null;
        if (this.noiseBuffer) return this.noiseBuffer;

        const buffer = audio.createBuffer(1, audio.sampleRate * 0.2, audio.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }

        this.noiseBuffer = buffer;
        return buffer;
    }

    playTone({ frequency, duration, type = 'sine', volume = 0.04, attack = 0.005, release = 0.08, detune = 0 }) {
        const audio = this.ensureAudio();
        if (!audio || audio.state !== 'running') return;

        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
        oscillator.detune.setValueAtTime(detune, audio.currentTime);

        const scaledVolume = volume * this.masterVolume;
        gain.gain.setValueAtTime(0.0001, audio.currentTime);
        gain.gain.linearRampToValueAtTime(scaledVolume, audio.currentTime + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration + release);

        oscillator.connect(gain).connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + duration + release + 0.02);
    }

    playNoiseBurst({ duration, volume = 0.03, highpass = 300, lowpass = 2400 }) {
        const audio = this.ensureAudio();
        const buffer = this.getNoiseBuffer();
        if (!audio || !buffer || audio.state !== 'running') return;

        const source = audio.createBufferSource();
        source.buffer = buffer;

        const gain = audio.createGain();
        const hp = audio.createBiquadFilter();
        const lp = audio.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(highpass, audio.currentTime);
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(lowpass, audio.currentTime);

        gain.gain.setValueAtTime(volume * this.masterVolume, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);

        source.connect(hp).connect(lp).connect(gain).connect(audio.destination);
        source.start();
        source.stop(audio.currentTime + duration + 0.02);
    }

    playMiningSound(blockType) {
        const isHard = ['stone', 'cobblestone', 'coal_ore', 'iron_ore', 'gold_ore', 'brick'].includes(blockType);
        this.playNoiseBurst({ duration: isHard ? 0.07 : 0.05, volume: isHard ? 0.032 : 0.022, highpass: isHard ? 480 : 220, lowpass: isHard ? 1800 : 1400 });
        this.playTone({ frequency: isHard ? 185 : 145, duration: 0.045, type: 'square', volume: isHard ? 0.028 : 0.02, release: 0.05, detune: (Math.random() - 0.5) * 50 });
    }

    playPlaceSound(blockType) {
        const isHard = ['stone', 'cobblestone', 'coal_ore', 'iron_ore', 'gold_ore', 'brick'].includes(blockType);
        this.playTone({ frequency: isHard ? 210 : 170, duration: 0.06, type: 'triangle', volume: 0.028, release: 0.07 });
        this.playNoiseBurst({ duration: 0.04, volume: 0.016, highpass: 180, lowpass: isHard ? 2000 : 1200 });
    }

    playPickupSound() {
        this.playTone({ frequency: 660, duration: 0.04, type: 'square', volume: 0.025, release: 0.04 });
        this.playTone({ frequency: 880, duration: 0.05, type: 'triangle', volume: 0.02, attack: 0.01, release: 0.05 });
    }

    playJumpSound() {
        this.playTone({ frequency: 240, duration: 0.05, type: 'triangle', volume: 0.03, release: 0.07 });
        this.playNoiseBurst({ duration: 0.03, volume: 0.012, highpass: 140, lowpass: 900 });
    }

    getProximityAudio(position, maxRange = this.remoteFootstepRange) {
        const listenerPos = this.cameraController.getPosition();
        const dx = position.x - listenerPos.x;
        const dz = position.z - listenerPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance >= maxRange) return null;

        const volume = Math.pow(1 - distance / maxRange, 1.7);
        const pan = THREE.MathUtils.clamp(dx / maxRange, -1, 1);
        return { volume, pan };
    }

    playPositionalFootstep(position, blockType) {
        const audio = this.ensureAudio();
        const proximity = this.getProximityAudio(position);
        const buffer = this.getNoiseBuffer();
        if (!audio || !buffer || !proximity || audio.state !== 'running') return;

        const source = audio.createBufferSource();
        source.buffer = buffer;

        const hp = audio.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(['stone', 'cobblestone', 'stone_bricks', 'brick', 'glass'].includes(blockType) ? 420 : 180, audio.currentTime);

        const lp = audio.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(['sand', 'dirt', 'grass', 'leaves', 'cactus'].includes(blockType) ? 1200 : 1800, audio.currentTime);

        const gain = audio.createGain();
        gain.gain.setValueAtTime(0.012 * proximity.volume * this.masterVolume, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.12);

        if (typeof audio.createStereoPanner === 'function') {
            const panner = audio.createStereoPanner();
            panner.pan.setValueAtTime(proximity.pan, audio.currentTime);
            gain.connect(panner).connect(audio.destination);
        } else {
            gain.connect(audio.destination);
        }

        source.connect(hp).connect(lp).connect(gain);
        source.start();
        source.stop(audio.currentTime + 0.13);

        this.playTone({
            frequency: ['stone', 'cobblestone', 'stone_bricks', 'brick', 'glass'].includes(blockType) ? 165 : 120,
            duration: 0.035,
            type: 'triangle',
            volume: 0.007 * proximity.volume,
            release: 0.03,
            detune: (Math.random() - 0.5) * 35
        });
    }

    playLocalFootstepSound(blockType) {
        const hardSurface = ['stone', 'cobblestone', 'stone_bricks', 'brick', 'glass'].includes(blockType);
        const softSurface = ['sand', 'dirt', 'grass', 'tall_grass', 'flower_red', 'flower_yellow', 'mushroom_red', 'mushroom_brown', 'leaves', 'cactus'].includes(blockType);

        this.playNoiseBurst({
            duration: hardSurface ? 0.065 : 0.05,
            volume: hardSurface ? 0.022 : softSurface ? 0.016 : 0.018,
            highpass: hardSurface ? 420 : 170,
            lowpass: hardSurface ? 1750 : 1200
        });
        this.playTone({
            frequency: hardSurface ? 155 : softSurface ? 108 : 128,
            duration: 0.03,
            type: 'triangle',
            volume: hardSurface ? 0.012 : 0.009,
            release: 0.025,
            detune: (Math.random() - 0.5) * 32
        });
    }

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
    }

    updateNavigationHUD() {
        const compass = document.getElementById('compass-value');
        const clock = document.getElementById('clock-value');
        if (compass) {
            const yaw = ((this.cameraController.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const directions = ['N', 'E', 'S', 'W'];
            const index = Math.round(yaw / (Math.PI / 2)) % 4;
            compass.textContent = directions[index];
        }
        if (clock) {
            const dayHour = ((this.timeOfDay * 24) + 6) % 24;
            const hours = Math.floor(dayHour).toString().padStart(2, '0');
            const minutes = Math.floor((dayHour % 1) * 60).toString().padStart(2, '0');
            clock.textContent = `${hours}:${minutes}`;
        }
    }

    togglePhotoMode() {
        this.photoMode = !this.photoMode;
        document.body.classList.toggle('photo-mode', this.photoMode);
    }

    updateDeathScreen() {
        const screen = document.getElementById('death-screen');
        const reason = document.getElementById('death-reason');
        const timer = document.getElementById('death-timer');
        if (!screen || !reason || !timer) return;

        screen.classList.toggle('visible', this.respawnPending);
        reason.textContent = this.deathReason;
        timer.textContent = this.respawnPending ? `${Math.max(0, this.respawnTimer).toFixed(1)}s` : '';
    }

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

        inspector.innerHTML = lines.join('<br>');
        inspector.classList.add('visible');
    }

    flashDamageIndicator() {
        this.hitIndicator.style.background = 'rgba(255, 80, 80, 0.9)';
        this.showHitIndicator();
        setTimeout(() => {
            this.hitIndicator.style.background = 'rgba(255,255,255,0.8)';
        }, 110);
    }

    applyDamage(amount, reason = 'Respawning soon...') {
        if (amount <= 0 || this.health <= 0 || this.respawnPending) return;

        this.health = Math.max(0, this.health - amount);
        this.updateHealthUI();
        this.flashDamageIndicator();

        if (this.health <= 0) {
            this.startRespawnCountdown(reason);
        }
    }

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
    }

    healToFull() {
        this.health = this.maxHealth;
        this.updateHealthUI();
    }

    respawnPlayer() {
        this.stopMining();
        this.resetMiningBlockVisual(true);
        this.closeChatInput();
        this.cameraController.setPosition(this.respawnPoint);
        this.healToFull();
        this.respawnPending = false;
        this.respawnTimer = 0;
        this.airbornePeakFeetY = null;
        this.wasOnGroundForDamage = false;
        this.updateDeathScreen();
    }

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
    }

    isRespawnBoundToBlock(position) {
        return Math.abs(this.respawnPoint.x - (position.x + 0.5)) < 0.001 &&
            Math.abs(this.respawnPoint.y - (position.y + 1 + this.cameraController.eyeHeight)) < 0.001 &&
            Math.abs(this.respawnPoint.z - (position.z + 0.5)) < 0.001;
    }

    isNightTime() {
        const hour = ((this.timeOfDay * 24) + 6) % 24;
        return hour >= 18 || hour < 6;
    }

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
    }

    updateSurvival(delta) {
        this.lastSafePositionSaveTimer += delta;
        const feetY = this.camera.position.y - this.cameraController.eyeHeight;

        if (!this.cameraController.onGround) {
            this.airbornePeakFeetY = this.airbornePeakFeetY === null ? feetY : Math.max(this.airbornePeakFeetY, feetY);
        }

        if (!this.wasOnGroundForDamage && this.cameraController.onGround && this.airbornePeakFeetY !== null) {
            const fallDistance = this.airbornePeakFeetY - feetY;
            if (fallDistance > 4.2) {
                const damage = Math.min(this.maxHealth, Math.ceil((fallDistance - 4) * 1.8));
                this.applyDamage(damage, 'You died from fall damage');
            }
            this.airbornePeakFeetY = null;
        }

        if (this.camera.position.y < -35) {
            this.applyDamage(this.maxHealth, 'You fell into the void');
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

    updateLocalMovementFeedback(delta) {
        const horizontalPosition = new THREE.Vector2(this.camera.position.x, this.camera.position.z);
        if (!this.lastLocalGroundPosition) {
            this.lastLocalGroundPosition = horizontalPosition.clone();
        }

        const distanceMoved = horizontalPosition.distanceTo(this.lastLocalGroundPosition);
        this.lastLocalGroundPosition.copy(horizontalPosition);

        const isWalkingOnGround = this.cameraController.onGround && distanceMoved > 0.0008;
        if (isWalkingOnGround) {
            this.localFootstepDistance += distanceMoved;
            this.cameraBobPhase += distanceMoved * 6.2;

            while (this.localFootstepDistance >= this.localFootstepStepLength) {
                this.localFootstepDistance -= this.localFootstepStepLength;
                const blockType = this.world.getBlockTypeAt(Math.round(this.camera.position.x), Math.floor(this.camera.position.y - this.cameraController.eyeHeight), Math.round(this.camera.position.z)) || 'grass';
                this.playLocalFootstepSound(blockType);
            }
        } else {
            this.localFootstepDistance = 0;
            this.cameraBobPhase = THREE.MathUtils.lerp(this.cameraBobPhase, 0, Math.min(1, delta * 6));
        }

        const bobStrength = isWalkingOnGround ? 1 : 0;
        const bobPitch = Math.sin(this.cameraBobPhase) * 0.0035 * bobStrength;
        const bobRoll = Math.cos(this.cameraBobPhase * 0.5) * 0.0022 * bobStrength;
        this.camera.rotation.x += bobPitch;
        this.camera.rotation.z = bobRoll;
    }
    
    initThreeJS() {
        this.scene = new THREE.Scene();
        
        const skyColor = new THREE.Color(0x87CEEB);
        this.scene.background = skyColor;
        this.scene.fog = new THREE.Fog(0x87CEEB, 20, this.world ? 150 : 150);

        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 20, 0);
        this.scene.add(this.camera);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
        
        document.getElementById('game-container').appendChild(this.renderer.domElement);
        
        this.ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.6);
        this.scene.add(this.ambientLight);
        
        this.sunLight = new THREE.DirectionalLight(0xFFFFA0, 0.8);
        this.sunLight.position.set(100, 150, 50);
        this.sunLight.shadow.mapSize.set(1536, 1536);
        this.sunLight.shadow.bias = -0.0008;
        this.sunLight.shadow.normalBias = 0.02;
        this.sunLight.shadow.camera.near = 1;
        this.sunLight.shadow.camera.far = 360;
        this.sunLight.shadow.camera.left = -70;
        this.sunLight.shadow.camera.right = 70;
        this.sunLight.shadow.camera.top = 70;
        this.sunLight.shadow.camera.bottom = -70;
        this.scene.add(this.sunLight);
        
        this.hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x3D5C3D, 0.4);
        this.scene.add(this.hemiLight);
        
        const selectionGeom = new THREE.BoxGeometry(1.002, 1.002, 1.002);
        const selectionEdges = new THREE.EdgesGeometry(selectionGeom);
        this.selectionBox = new THREE.LineSegments(
            selectionEdges,
            new THREE.LineBasicMaterial({ color: 0x000000 })
        );
        this.selectionBox.visible = false;
        this.scene.add(this.selectionBox);

        this.initMiningEffects();
        this.initWeatherEffects();
        
        this.hitIndicator = document.getElementById('hit-indicator');
        this.initViewModel();

        window.addEventListener('resize', () => this.onWindowResize());
    }

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
    }

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
    }

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
    }

    initViewModel() {
        const createMaterial = (color, textureType) => {
            const material = new THREE.MeshLambertMaterial({
                color: color,
                map: this.createViewModelTexture(textureType),
                transparent: true,
                opacity: 1
            });
            material.depthTest = false;
            material.depthWrite = false;
            material.toneMapped = false;
            return material;
        };

        const handGroup = new THREE.Group();
        const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.72, 0.28), createMaterial(0xFFFFFF, 'sleeve'));
        const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), createMaterial(0xFFFFFF, 'cuff'));
        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), createMaterial(0xFFFFFF, 'skin'));

        sleeve.position.set(0, -0.04, 0);
        cuff.position.set(0, -0.34, 0);
        hand.position.set(0, -0.52, 0);

        [sleeve, cuff, hand].forEach((mesh) => {
            mesh.renderOrder = 10000;
            mesh.frustumCulled = false;
        });

        handGroup.add(sleeve);
        handGroup.add(cuff);
        handGroup.add(hand);
        handGroup.position.copy(this.handBasePosition);
        handGroup.rotation.copy(this.handBaseRotation);

        this.camera.add(handGroup);
        this.firstPersonHand = handGroup;
    }

    createViewModelTexture(textureType) {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;

        const ctx = canvas.getContext('2d');
        const fill = (color) => {
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        };

        if (textureType === 'skin') {
            fill('#d8a07a');
            ctx.fillStyle = '#e7b58f';
            ctx.fillRect(0, 0, 16, 5);
            ctx.fillStyle = '#c88762';
            for (let y = 5; y < 16; y += 3) {
                ctx.fillRect(0, y, 16, 1);
            }
            ctx.fillStyle = '#b87450';
            ctx.fillRect(2, 10, 12, 2);
            ctx.fillRect(3, 14, 10, 1);
            ctx.fillStyle = '#f1c6a5';
            ctx.fillRect(4, 4, 8, 1);
            ctx.fillStyle = '#8f5c3d';
            ctx.fillRect(3, 9, 1, 1);
            ctx.fillRect(12, 12, 1, 1);
            ctx.fillRect(10, 6, 1, 1);
        } else if (textureType === 'cuff') {
            fill('#18397c');
            ctx.fillStyle = '#244ea1';
            ctx.fillRect(0, 2, 16, 3);
            ctx.fillStyle = '#0f2552';
            ctx.fillRect(0, 9, 16, 2);
            ctx.fillStyle = '#315fbc';
            ctx.fillRect(2, 13, 12, 2);
        } else {
            fill('#3563bf');
            ctx.fillStyle = '#4776d4';
            for (let y = 0; y < 16; y += 4) {
                ctx.fillRect(0, y, 16, 2);
            }
            ctx.fillStyle = '#244d9f';
            for (let x = 1; x < 16; x += 5) {
                ctx.fillRect(x, 0, 1, 16);
            }
            ctx.fillStyle = '#5f91ea';
            ctx.fillRect(3, 2, 10, 2);
            ctx.fillRect(2, 10, 11, 1);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        if (THREE.sRGBEncoding) {
            texture.encoding = THREE.sRGBEncoding;
        }
        texture.needsUpdate = true;
        return texture;
    }

    getBreakParticleMaterial(type) {
        let material = this.breakParticleMaterials.get(type);
        if (material) return material;

        material = new THREE.MeshLambertMaterial({
            color: this.world.getBlockColorForType(type)
        });
        this.breakParticleMaterials.set(type, material);
        return material;
    }
    
    initCamera() {
        this.cameraController = new CameraController(this.camera, this.renderer.domElement);
        this.cameraController.setBlockChecker((x, y, z) => this.world.hasSolidBlock(x, y, z));
        this.cameraController.setBlockTypeGetter((x, y, z) => this.world.getBlockTypeAt(x, y, z));
        this.applyLookSensitivity();
    }
    
    initWorld() {
        this.world = new WorldRenderer(this.scene);
        this.world.setRenderDistance(this.renderDistanceSetting);
    }

    updateRTXStatus() {
        const statusEl = document.getElementById('rtx-status');
        if (!statusEl) return;

        statusEl.textContent = this.rtxModeEnabled ? 'On' : 'Off';
        statusEl.style.color = this.rtxModeEnabled ? '#7CE7FF' : '#FFFFFF';
    }

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
    }

    blendColors(colorA, colorB, alpha) {
        return colorA.clone().lerp(colorB, alpha);
    }

    updateUnderwaterEffect() {
        const overlay = document.getElementById('underwater-overlay');
        if (overlay) {
            overlay.style.opacity = this.cameraController.isInWater ? '1' : '0';
        }

        if (!this.scene.fog) return;
        if (this.cameraController.isInWater) {
            this.scene.fog.near = 3;
            this.scene.fog.far = this.rtxModeEnabled ? 24 : 18;
            this.scene.fog.color.copy(this.blendColors(this.scene.fog.color, new THREE.Color(0x356f9c), 0.6));
        }
    }

    updateDayNightCycle(delta) {
        if (!this.dayNightCycleEnabled) return;

        this.timeOfDay = (this.timeOfDay + delta / this.dayNightCycleDuration) % 1;

        const angle = this.timeOfDay * Math.PI * 2;
        const sunHeight = Math.sin(angle - Math.PI / 2);
        const daylight = THREE.MathUtils.clamp((sunHeight + 0.16) / 1.16, 0, 1);
        const sunset = Math.max(0, 1 - Math.abs(sunHeight) * 3.2) * (1 - daylight * 0.55);

        const preset = this.getSkyPreset();
        const sky = this.blendColors(this.blendColors(preset.nightSky, preset.sunsetSky, sunset), preset.daySky, daylight);
        const fog = this.blendColors(this.blendColors(preset.nightFog, preset.sunsetFog, sunset), preset.dayFog, daylight);

        this.scene.background.copy(sky);
        this.scene.fog.color.copy(fog);
        this.scene.fog.near = this.rtxModeEnabled ? 18 : 20;
        this.scene.fog.far = THREE.MathUtils.lerp(this.rtxModeEnabled ? 115 : 105, this.rtxModeEnabled ? 210 : 160, daylight);

        const orbitRadius = 180;
        this.sunLight.position.set(
            Math.cos(angle) * orbitRadius,
            Math.max(18, sunHeight * orbitRadius + 24),
            Math.sin(angle) * orbitRadius * 0.65
        );

        this.sunLight.intensity = THREE.MathUtils.lerp(0.08, this.rtxModeEnabled ? 1.7 : 1.0, daylight) + sunset * 0.16;
        this.sunLight.color.copy(this.blendColors(new THREE.Color(0x8AA6D8), new THREE.Color(0xFFD7A8), sunset + daylight * 0.2));

        this.ambientLight.intensity = THREE.MathUtils.lerp(this.rtxModeEnabled ? 0.03 : 0.08, this.rtxModeEnabled ? 0.22 : 0.6, daylight);
        this.hemiLight.intensity = THREE.MathUtils.lerp(this.rtxModeEnabled ? 0.14 : 0.16, this.rtxModeEnabled ? 0.92 : 0.45, daylight);
        this.hemiLight.color.copy(this.blendColors(new THREE.Color(0x445B8A), new THREE.Color(0xBFD7FF), daylight));
        this.hemiLight.groundColor.copy(this.blendColors(new THREE.Color(0x171718), new THREE.Color(0x4C4336), daylight));

        if (this.rtxModeEnabled) {
            this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.52, 1.18, daylight) + sunset * 0.05;
        }
    }

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
    }

    createPlayerAvatarMaterial(color) {
        return this.rtxModeEnabled
            ? new THREE.MeshStandardMaterial({ color: color, roughness: 0.72, metalness: 0.03 })
            : new THREE.MeshLambertMaterial({ color: color });
    }

    createOtherPlayerAvatar(playerId) {
        const group = new THREE.Group();
        group.userData.playerId = playerId;
        const createPart = (geometry, color, x, y, z) => {
            const mesh = new THREE.Mesh(geometry, this.createPlayerAvatarMaterial(color));
            mesh.position.set(x, y, z);
            mesh.castShadow = this.rtxModeEnabled;
            mesh.receiveShadow = this.rtxModeEnabled;
            mesh.userData.baseColor = color;
            mesh.userData.avatarRoot = group;
            group.add(mesh);
            return mesh;
        };

        const head = createPart(new THREE.BoxGeometry(0.48, 0.48, 0.48), 0xE2B48D, 0, 1.55, 0);
        const torso = createPart(new THREE.BoxGeometry(0.56, 0.72, 0.28), 0x2F63C8, 0, 1.03, 0);
        const leftArm = createPart(new THREE.BoxGeometry(0.18, 0.68, 0.18), 0xE2B48D, -0.38, 1.03, 0);
        const rightArm = createPart(new THREE.BoxGeometry(0.18, 0.68, 0.18), 0xE2B48D, 0.38, 1.03, 0);
        const leftLeg = createPart(new THREE.BoxGeometry(0.22, 0.72, 0.22), 0x28334D, -0.14, 0.34, 0);
        const rightLeg = createPart(new THREE.BoxGeometry(0.22, 0.72, 0.22), 0x28334D, 0.14, 0.34, 0);
        createPart(new THREE.BoxGeometry(0.5, 0.12, 0.5), 0x5B3A29, 0, 1.83, 0);

        const face = this.createAvatarFaceMesh();
        face.position.set(0, 0.02, 0.245);
        head.add(face);

        group.userData.avatarParts = { head, torso, leftArm, rightArm, leftLeg, rightLeg };
        group.userData.lastPosition = new THREE.Vector3();
        group.userData.targetPosition = new THREE.Vector3();
        group.userData.targetYaw = 0;
        group.userData.walkPhase = 0;
        group.userData.lastStepIndex = 0;
        group.userData.nameSprite = this.createNameTagSprite('Player');
        group.userData.nameSprite.position.set(0, 2.15, 0);
        group.add(group.userData.nameSprite);
        return group;
    }

    createAvatarFaceMesh() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, 64, 64);
        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.fillRect(0, 0, 64, 64);

        ctx.fillStyle = '#2b1b11';
        ctx.fillRect(14, 18, 10, 10);
        ctx.fillRect(40, 18, 10, 10);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(16, 20, 4, 4);
        ctx.fillRect(42, 20, 4, 4);

        ctx.fillStyle = '#804830';
        ctx.fillRect(22, 40, 20, 4);
        ctx.fillRect(26, 44, 12, 2);

        const texture = new THREE.CanvasTexture(canvas);
        if (THREE.sRGBEncoding) {
            texture.encoding = THREE.sRGBEncoding;
        }
        texture.needsUpdate = true;

        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), material);
        face.renderOrder = 1200;
        face.frustumCulled = false;
        return face;
    }

    createNameTagSprite(name) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(10, 10, 236, 44);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.strokeRect(10, 10, 236, 44);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name.slice(0, 20), 128, 33);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        if (THREE.sRGBEncoding) {
            texture.encoding = THREE.sRGBEncoding;
        }

        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(1.9, 0.48, 1);
        sprite.renderOrder = 2000;
        return sprite;
    }

    updateAvatarNameTag(avatar, name) {
        if (!avatar) return;

        const safeName = (name || 'Player').slice(0, 20);
        const currentSprite = avatar.userData.nameSprite;
        if (currentSprite && currentSprite.userData.name === safeName) return;

        if (currentSprite) {
            avatar.remove(currentSprite);
            currentSprite.material.map.dispose();
            currentSprite.material.dispose();
        }

        const sprite = this.createNameTagSprite(safeName);
        sprite.position.set(0, 2.15, 0);
        sprite.userData.name = safeName;
        avatar.userData.nameSprite = sprite;
        avatar.add(sprite);
    }

    updateRemotePlayerNames(payload) {
        const activeIds = new Set();
        this.remotePlayerNames.clear();
        payload.players.forEach((player) => {
            activeIds.add(player.id);
            this.remotePlayerNames.set(player.id, player.name);
            const avatar = this.otherPlayerMeshes.get(player.id);
            if (avatar) {
                this.updateAvatarNameTag(avatar, player.name);
            }
        });

        this.updatePlayerCount(activeIds.size);
        if (this.voiceChat) {
            this.voiceChat.syncPlayerList(payload.players);
        }

        for (const [id, avatar] of this.otherPlayerMeshes) {
            if (id === this.network.playerId || activeIds.has(id)) continue;
            this.disposeRemoteAvatar(avatar);
            this.otherPlayerMeshes.delete(id);
            this.remotePlayerNames.delete(id);
        }
    }

    updatePlayerCount(count) {
        const countEl = document.getElementById('player-count');
        if (countEl) {
            countEl.textContent = String(count);
        }
    }

    disposeRemoteAvatar(avatar) {
        if (!avatar) return;

        if (this.voiceChat && avatar.userData.playerId) {
            this.voiceChat.removePeer(avatar.userData.playerId);
        }

        avatar.traverse((node) => {
            if (node instanceof THREE.Mesh && node.material) {
                node.material.dispose();
            }
            if (node instanceof THREE.Sprite && node.material) {
                if (node.material.map) {
                    node.material.map.dispose();
                }
                node.material.dispose();
            }
        });
        this.scene.remove(avatar);
    }

    lerpAngle(current, target, alpha) {
        const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
        return current + delta * alpha;
    }

    updateRemotePlayers(delta) {
        const alpha = Math.min(1, delta * 10);
        for (const avatar of this.otherPlayerMeshes.values()) {
            const previousPosition = avatar.position.clone();
            avatar.position.lerp(avatar.userData.targetPosition, alpha);
            avatar.rotation.y = this.lerpAngle(avatar.rotation.y, avatar.userData.targetYaw, alpha);

            const parts = avatar.userData.avatarParts;
            const deltaDistance = previousPosition.distanceTo(avatar.position);
            avatar.userData.walkPhase += Math.min(0.7, deltaDistance * 12);
            avatar.userData.lastPosition.copy(avatar.position);

            const stride = Math.min(0.9, deltaDistance * 30);
            const swing = Math.sin(avatar.userData.walkPhase) * stride;

            parts.leftArm.rotation.x = swing;
            parts.rightArm.rotation.x = -swing;
            parts.leftLeg.rotation.x = -swing;
            parts.rightLeg.rotation.x = swing;

            if (stride > 0.08) {
                const cycle = ((avatar.userData.walkPhase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                const stepIndex = Math.floor(cycle / Math.PI);
                if (stepIndex !== avatar.userData.lastStepIndex) {
                    avatar.userData.lastStepIndex = stepIndex;
                    const stepBlock = this.world.getBlockTypeAt(Math.round(avatar.position.x), Math.floor(avatar.position.y), Math.round(avatar.position.z)) || 'grass';
                    this.playPositionalFootstep(avatar.position, stepBlock);
                }
            }
        }
    }

    refreshOtherPlayerAvatarMaterials() {
        for (const avatar of this.otherPlayerMeshes.values()) {
            avatar.traverse((node) => {
                if (!(node instanceof THREE.Mesh)) return;
                const baseColor = node.userData.baseColor;
                if (baseColor === undefined) return;
                node.material.dispose();
                node.material = this.createPlayerAvatarMaterial(baseColor);
                node.castShadow = this.rtxModeEnabled;
                node.receiveShadow = this.rtxModeEnabled;
            });
        }
    }

    syncOtherPlayerShadows() {
        for (const mesh of this.otherPlayerMeshes.values()) {
            mesh.traverse((node) => {
                if (!(node instanceof THREE.Mesh)) return;
                node.castShadow = this.rtxModeEnabled;
                node.receiveShadow = this.rtxModeEnabled;
            });
        }
    }

    applyRTXMode(enabled) {
        this.rtxModeEnabled = enabled;

        const skyColor = new THREE.Color(enabled ? 0x9BB7D1 : 0x87CEEB);
        this.scene.background = skyColor;
        this.scene.fog = new THREE.Fog(skyColor.getHex(), enabled ? 18 : 20, enabled ? 190 : 150);

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, enabled ? 2 : 1.25));
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

        this.ambientLight.intensity = enabled ? 0.18 : 0.6;
        this.ambientLight.color.setHex(enabled ? 0xC8D6E5 : 0xFFFFFF);

        this.hemiLight.intensity = enabled ? 0.9 : 0.4;
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
    }

    toggleRTXMode() {
        this.stopMining();
        this.resetMiningBlockVisual(true);
        this.applyRTXMode(!this.rtxModeEnabled);
    }

    handleRTXShortcut() {
        const now = performance.now();
        this.rtxTogglePresses.push(now);
        this.rtxTogglePresses = this.rtxTogglePresses.filter((time) => now - time <= this.rtxToggleWindowMs);

        if (this.rtxTogglePresses.length >= 3) {
            this.rtxTogglePresses = [];
            this.toggleRTXMode();
        }
    }
    
    initNetwork() {
        this.network = new NetworkClient();
        this.network.setUsername(this.playerName);
        this.network.on('worldInit', (blocks) => this.world.loadBlocks(blocks));
        this.network.on('blockPlace', (payload) => this.world.addBlock(payload));
        this.network.on('blockBreak', (payload) => this.world.removeBlockAt(payload.x, payload.y, payload.z));
        this.network.on('otherPlayerMove', (player) => this.updateOtherPlayer(player));
        this.network.on('playerList', (payload) => this.updateRemotePlayerNames(payload));
        this.network.on('chat', (payload) => this.receiveChatMessage(payload));
        this.network.on('system', (payload) => this.receiveSystemMessage(payload));
        this.network.on('timeSync', (payload) => {
            if (typeof payload.timeOfDay === 'number') {
                this.timeOfDay = payload.timeOfDay;
            }
        });
        this.network.on('voiceState', (payload) => {
            if (this.voiceChat) {
                this.voiceChat.updateVoiceState(payload.playerId, payload.enabled);
            }
        });
        this.network.on('webrtcOffer', (payload) => {
            if (this.voiceChat) {
                this.voiceChat.handleOffer(payload);
            }
        });
        this.network.on('webrtcAnswer', (payload) => {
            if (this.voiceChat) {
                this.voiceChat.handleAnswer(payload);
            }
        });
        this.network.on('webrtcIceCandidate', (payload) => {
            if (this.voiceChat) {
                this.voiceChat.handleIceCandidate(payload);
            }
        });

        const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${wsProtocol}://${window.location.host}/ws`;
        this.network.connect(wsUrl);
    }

    initVoiceChat() {
        if (typeof VoiceChatManager === 'undefined') return;
        this.voiceChat = new VoiceChatManager(this, this.network);
        this.voiceChat.init();
    }
    
    updateOtherPlayer(player) {
        let avatar = this.otherPlayerMeshes.get(player.id);
        if (!avatar) {
            avatar = this.createOtherPlayerAvatar(player.id);
            this.scene.add(avatar);
            this.otherPlayerMeshes.set(player.id, avatar);
        }

        this.updateAvatarNameTag(avatar, player.username || this.remotePlayerNames.get(player.id) || player.id);
        const nextFeetPosition = new THREE.Vector3(player.x, player.y - 1.62, player.z);
        if (!avatar.userData.initialized) {
            avatar.userData.lastPosition.copy(nextFeetPosition);
            avatar.userData.targetPosition.copy(nextFeetPosition);
            avatar.position.copy(nextFeetPosition);
            avatar.rotation.y = player.yaw;
            avatar.userData.initialized = true;
        }

        avatar.userData.targetPosition.copy(nextFeetPosition);
        avatar.userData.targetYaw = player.yaw;
    }
    
    initHotbar() {
        const hotbar = document.getElementById('hotbar');
        hotbar.innerHTML = '';
        this.hotbarSlotElements = [];
        this.hotbarCountElements = [];

        this.inventory.forEach((blockType, index) => {
            const slot = document.createElement('div');
            slot.className = 'hotbar-slot' + (index === 0 ? ' selected' : '');
            slot.dataset.index = index;
            slot.style.backgroundColor = '#' + this.world.blockTypes[blockType].color.toString(16).padStart(6, '0');
            slot.addEventListener('pointerdown', (event) => {
                if (!this.touchControlsEnabled) return;
                event.preventDefault();
                this.selectSlot(index);
            });
            
            const num = document.createElement('span');
            num.className = 'slot-num';
            num.textContent = index + 1;
            slot.appendChild(num);

            const count = document.createElement('span');
            count.className = 'slot-count';
            slot.appendChild(count);
            
            hotbar.appendChild(slot);
            this.hotbarSlotElements[index] = slot;
            this.hotbarCountElements[index] = count;
        });

        this.updateHotbarCounts();
        this.refreshHeldItemMesh();
        this.saveInventoryState();
    }

    updateHotbarCounts() {
        for (let i = 0; i < this.inventory.length; i++) {
            const type = this.inventory[i];
            const count = this.getInventoryCount(type);
            const slotEl = this.hotbarSlotElements[i];
            const countEl = this.hotbarCountElements[i];
            if (!slotEl || !countEl) continue;

            countEl.textContent = count > 0 ? count : '0';
            slotEl.classList.toggle('empty', count <= 0);
        }
    }

    ensureInventorySlot(type) {
        if (this.inventory.includes(type)) return;
        this.inventory.push(type);
        this.inventoryCounts[type] = this.inventoryCounts[type] || 0;
        this.initHotbar();
        this.selectSlot(Math.min(this.selectedSlot, this.inventory.length - 1));
        this.saveInventoryState();
    }

    getSelectedBlockType() {
        return this.inventory[this.selectedSlot] || null;
    }

    getInventoryCount(type) {
        return this.inventoryCounts[type] || 0;
    }

    addInventory(type, amount = 1) {
        if (!type || amount <= 0) return;
        this.ensureInventorySlot(type);
        this.inventoryCounts[type] = this.getInventoryCount(type) + amount;
        this.updateHotbarCounts();
        this.refreshHeldItemMesh();
        this.renderCraftingPanel();
        this.saveInventoryState();
    }

    consumeSelectedBlock() {
        const type = this.getSelectedBlockType();
        if (!type) return false;

        const count = this.getInventoryCount(type);
        if (count <= 0) return false;

        this.inventoryCounts[type] = count - 1;
        this.updateHotbarCounts();
        this.refreshHeldItemMesh();
        this.renderCraftingPanel();
        this.saveInventoryState();
        return true;
    }

    rebuildPickupMeshes() {
        for (const pickup of this.pickups.values()) {
            if (pickup.mesh) {
                this.scene.remove(pickup.mesh);
                if (pickup.mesh.material) pickup.mesh.material.dispose();
            }
            pickup.mesh = this.world.createDisplayMesh(pickup.type, 0.34);
            pickup.mesh.position.copy(pickup.position);
            pickup.mesh.rotation.set(pickup.rotation.x, pickup.rotation.y, pickup.rotation.z);
            this.scene.add(pickup.mesh);
        }
    }

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
    }

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
    }

    collectPickup(id) {
        const pickup = this.pickups.get(id);
        if (!pickup) return;

        this.addInventory(pickup.type, pickup.amount);
        this.playPickupSound();
        this.scene.remove(pickup.mesh);
        if (pickup.mesh.material) pickup.mesh.material.dispose();
        this.pickups.delete(id);
    }

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
    }

    refreshHeldItemMesh(forceRebuild = false) {
        if (!this.firstPersonHand || !this.world) return;

        const selectedType = this.getSelectedBlockType();
        const hasSelectedItem = selectedType && this.getInventoryCount(selectedType) > 0;

        if (!hasSelectedItem) {
            if (this.heldItemMesh) {
                this.firstPersonHand.remove(this.heldItemMesh);
                if (this.heldItemMesh.material) this.heldItemMesh.material.dispose();
                this.heldItemMesh = null;
                this.heldItemType = null;
            }
            return;
        }

        if (!forceRebuild && this.heldItemMesh && this.heldItemType === selectedType) {
            return;
        }

        if (this.heldItemMesh) {
            this.firstPersonHand.remove(this.heldItemMesh);
            if (this.heldItemMesh.material) this.heldItemMesh.material.dispose();
        }

        const heldItem = this.world.createDisplayMesh(selectedType, 0.23);
        heldItem.position.set(0.2, -0.16, -0.18);
        heldItem.rotation.set(0.22, 0.62, 0.08);
        heldItem.renderOrder = 10001;
        heldItem.frustumCulled = false;
        heldItem.material.depthTest = false;
        heldItem.material.depthWrite = false;

        this.firstPersonHand.add(heldItem);
        this.heldItemMesh = heldItem;
        this.heldItemType = selectedType;
    }
    
    initInput() {
        document.addEventListener('pointerdown', () => this.ensureAudio(), { passive: true });
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        const signCloseButton = document.getElementById('sign-reader-close');
        if (signCloseButton) {
            signCloseButton.addEventListener('click', () => this.closeSignReader());
        }
        document.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement !== this.renderer.domElement) {
                this.stopMining();
            }
        });
        window.addEventListener('blur', () => {
            this.stopMining();
            this.resetTouchTransientInput();
            this.closeChatInput();
            this.closeSignReader();
            if (this.craftingOpen) {
                this.toggleCraftingPanel();
            }
        });

        const chatInput = document.getElementById('chat-input');
        chatInput.addEventListener('keydown', (event) => this.onChatKeyDown(event));

        this.initTouchControls();
    }

    initTouchControls() {
        const isCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (!isCoarsePointer && (!('ontouchstart' in window) && navigator.maxTouchPoints <= 0)) {
            return;
        }

        this.touchControlsEnabled = true;
        this.cameraController.setTouchControlsEnabled(true);
        this.renderer.domElement.style.touchAction = 'none';

        const controls = document.getElementById('mobile-controls');
        const moveZone = document.getElementById('mobile-move-zone');
        const lookZone = document.getElementById('mobile-look-zone');
        const joystick = document.getElementById('mobile-joystick');
        const knob = document.getElementById('mobile-joystick-knob');
        const jumpButton = document.getElementById('mobile-jump');
        const breakButton = document.getElementById('mobile-break');
        const placeButton = document.getElementById('mobile-place');

        controls.classList.add('enabled');

        const resetJoystick = () => {
            this.cameraController.setMoveInput(0, 0);
            this.cameraController.setTouchSprint(false);
            knob.style.transform = 'translate(0px, 0px)';
        };
        this.resetTouchJoystick = resetJoystick;

        const updateJoystick = (clientX, clientY) => {
            const rect = joystick.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            let dx = clientX - centerX;
            let dy = clientY - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const maxDistance = this.mobileJoystickTravel;

            if (distance > maxDistance && distance > 0) {
                dx = (dx / distance) * maxDistance;
                dy = (dy / distance) * maxDistance;
            }

            knob.style.transform = `translate(${dx}px, ${dy}px)`;

            const moveX = dx / maxDistance;
            const moveY = -dy / maxDistance;
            this.cameraController.setMoveInput(moveX, moveY);
            this.cameraController.setTouchSprint(Math.sqrt(moveX * moveX + moveY * moveY) > 0.78);
        };

        moveZone.addEventListener('pointerdown', (event) => {
            if (this.mobileMovePointerId !== null) return;
            this.mobileMovePointerId = event.pointerId;
            moveZone.setPointerCapture(event.pointerId);
            updateJoystick(event.clientX, event.clientY);
            event.preventDefault();
        });
        moveZone.addEventListener('pointermove', (event) => {
            if (event.pointerId !== this.mobileMovePointerId) return;
            updateJoystick(event.clientX, event.clientY);
            event.preventDefault();
        });
        const releaseMove = (event) => {
            if (event.pointerId !== this.mobileMovePointerId) return;
            this.mobileMovePointerId = null;
            resetJoystick();
        };
        moveZone.addEventListener('pointerup', releaseMove);
        moveZone.addEventListener('pointercancel', releaseMove);

        lookZone.addEventListener('pointerdown', (event) => {
            if (this.mobileLookPointerId !== null) return;
            this.mobileLookPointerId = event.pointerId;
            this.mobileLookLast.x = event.clientX;
            this.mobileLookLast.y = event.clientY;
            lookZone.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        lookZone.addEventListener('pointermove', (event) => {
            if (event.pointerId !== this.mobileLookPointerId) return;
            const deltaX = (event.clientX - this.mobileLookLast.x) * 1.15;
            const deltaY = (event.clientY - this.mobileLookLast.y) * 1.15;
            this.mobileLookLast.x = event.clientX;
            this.mobileLookLast.y = event.clientY;
            this.cameraController.addLookDelta(deltaX, deltaY);
            event.preventDefault();
        });
        const releaseLook = (event) => {
            if (event.pointerId !== this.mobileLookPointerId) return;
            this.mobileLookPointerId = null;
        };
        lookZone.addEventListener('pointerup', releaseLook);
        lookZone.addEventListener('pointercancel', releaseLook);

        const bindHoldButton = (button, onPress, onRelease) => {
            button.addEventListener('pointerdown', (event) => {
                button.classList.add('active');
                button.setPointerCapture(event.pointerId);
                onPress();
                event.preventDefault();
            });
            const release = (event) => {
                button.classList.remove('active');
                onRelease();
                event.preventDefault();
            };
            button.addEventListener('pointerup', release);
            button.addEventListener('pointercancel', release);
        };

        bindHoldButton(jumpButton, () => this.cameraController.setTouchJump(true), () => this.cameraController.setTouchJump(false));
        bindHoldButton(breakButton, () => { this.isBreakInputActive = true; }, () => this.stopMining());
        placeButton.addEventListener('pointerdown', (event) => {
            placeButton.classList.add('active');
            this.placeBlock();
            event.preventDefault();
        });
        const releasePlace = (event) => {
            placeButton.classList.remove('active');
            event.preventDefault();
        };
        placeButton.addEventListener('pointerup', releasePlace);
        placeButton.addEventListener('pointercancel', releasePlace);

        resetJoystick();
    }
    
    onMouseDown(event) {
        if (this.chatOpen || this.craftingOpen || this.pauseOpen || this.signReaderOpen || this.respawnPending) return;
        if (!this.cameraController.canInteract()) return;
        
        if (event.button === 0) {
            const playerHit = this.raycastPlayer(7);
            if (playerHit) {
                const targetName = this.remotePlayerNames.get(playerHit.playerId) || playerHit.playerId;
                this.openChatInput(`@${targetName} `);
                return;
            }
            this.isBreakInputActive = true;
        } else if (event.button === 2) {
            this.placeBlock();
        }
    }

    onMouseUp(event) {
        if (event.button === 0) {
            this.stopMining();
        }
    }
    
    onKeyDown(event) {
        if (event.code === 'Escape' && !event.repeat) {
            event.preventDefault();
            if (this.chatOpen) {
                this.closeChatInput();
            } else if (this.signReaderOpen) {
                this.closeSignReader();
            } else if (this.craftingOpen) {
                this.toggleCraftingPanel();
            } else {
                this.togglePauseMenu();
            }
            return;
        }

        if (this.chatOpen) {
            if (event.code === 'Enter') {
                event.preventDefault();
                this.submitChatMessage();
                return;
            }
            return;
        }

        if (this.craftingOpen) {
            if (event.code === 'KeyC' && !event.repeat) {
                event.preventDefault();
                this.toggleCraftingPanel();
            }
            return;
        }

        if (this.pauseOpen) {
            return;
        }

        if (event.code === 'KeyF' && !event.repeat) {
            event.preventDefault();
            if (this.trySleepInBed()) {
                return;
            }
            this.tryReadSign();
            return;
        }

        if (event.code === 'F2' && !event.repeat) {
            event.preventDefault();
            this.togglePhotoMode();
            return;
        }

        if (event.code === 'Enter' && !event.repeat) {
            event.preventDefault();
            this.openChatInput();
            return;
        }

        if (event.code === 'KeyC' && !event.repeat) {
            event.preventDefault();
            this.toggleCraftingPanel();
            return;
        }

        if (event.code === 'KeyR' && !event.repeat) {
            this.handleRTXShortcut();
            return;
        }

        if (event.code === 'KeyQ' && !event.repeat) {
            event.preventDefault();
            this.dropSelectedBlock();
            return;
        }

        const slot = parseInt(event.key) - 1;
        if (slot >= 0 && slot < this.inventory.length) {
            this.selectSlot(slot);
        }
    }

    onWheel(event) {
        if (!this.cameraController.isLocked) return;
        if (event.deltaY === 0) return;

        event.preventDefault();

        const now = performance.now();
        if (now - this.lastWheelStepAt > 150) {
            this.wheelSlotAccumulator = 0;
        }

        this.wheelSlotAccumulator += event.deltaY;
        if (Math.abs(this.wheelSlotAccumulator) < 60) {
            return;
        }

        const direction = this.wheelSlotAccumulator > 0 ? 1 : -1;
        this.wheelSlotAccumulator = 0;
        this.lastWheelStepAt = now;

        const totalSlots = this.inventory.length;
        const nextSlot = (this.selectedSlot + direction + totalSlots) % totalSlots;
        this.selectSlot(nextSlot);
    }
    
    selectSlot(index) {
        this.selectedSlot = index;
        document.querySelectorAll('.hotbar-slot').forEach((el, i) => {
            el.classList.toggle('selected', i === index);
        });
        this.refreshHeldItemMesh();
        this.saveInventoryState();
    }

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
    }

    stopMining() {
        this.isBreakInputActive = false;
        this.resetMiningTarget();
        if (this.miningBlockVisual) {
            this.miningBlockVisual.returning = true;
        }
    }

    refreshChatVisibility() {
        const chatLog = document.getElementById('chat-log');
        if (!chatLog) return;

        chatLog.style.opacity = this.chatOpen ? '1' : (this.chatMessages.length > 0 ? '0.86' : '0');
    }

    renderChatMessages() {
        const chatLog = document.getElementById('chat-log');
        if (!chatLog) return;

        chatLog.innerHTML = '';
        this.chatMessages.slice(-10).forEach((message) => {
            const row = document.createElement('div');
            row.className = 'chat-message' + (message.system ? ' system' : '');

            if (message.system) {
                row.textContent = message.text;
                chatLog.appendChild(row);
                return;
            }

            const name = document.createElement('span');
            name.className = 'chat-name';
            name.textContent = `${message.username}: `;

            const text = document.createElement('span');
            text.textContent = message.text;

            row.appendChild(name);
            row.appendChild(text);
            chatLog.appendChild(row);
        });

        this.refreshChatVisibility();
    }

    canCraftRecipe(recipe) {
        return recipe.inputs.every((input) => this.getInventoryCount(input.type) >= input.amount);
    }

    renderCraftingPanel() {
        const panel = document.getElementById('crafting-panel');
        const list = document.getElementById('crafting-recipes');
        if (!panel || !list) return;

        panel.classList.toggle('visible', this.craftingOpen);
        list.innerHTML = '';

        this.craftingRecipes.forEach((recipe) => {
            const row = document.createElement('div');
            row.className = 'craft-recipe';

            const info = document.createElement('div');
            info.className = 'craft-recipe-info';

            const name = document.createElement('div');
            name.className = 'craft-recipe-name';
            name.textContent = `${recipe.name} -> ${recipe.output.amount} ${this.getBlockDisplayName(recipe.output.type)}`;

            const cost = document.createElement('div');
            cost.className = 'craft-recipe-cost';
            cost.textContent = recipe.inputs.map((input) => `${input.amount} ${this.getBlockDisplayName(input.type)}`).join(' + ');

            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Craft';
            button.disabled = !this.canCraftRecipe(recipe);
            button.addEventListener('click', () => this.craftRecipe(recipe.id));

            info.appendChild(name);
            info.appendChild(cost);
            row.appendChild(info);
            row.appendChild(button);
            list.appendChild(row);
        });
    }

    toggleCraftingPanel() {
        this.craftingOpen = !this.craftingOpen;
        if (this.craftingOpen) {
            this.stopMining();
            this.closeChatInput();
            if (document.pointerLockElement === this.renderer.domElement) {
                document.exitPointerLock();
            }
        }

        this.renderCraftingPanel();
    }

    craftRecipe(recipeId) {
        const recipe = this.craftingRecipes.find((item) => item.id === recipeId);
        if (!recipe || !this.canCraftRecipe(recipe)) return;

        recipe.inputs.forEach((input) => {
            this.inventoryCounts[input.type] = Math.max(0, this.getInventoryCount(input.type) - input.amount);
        });
        this.addInventory(recipe.output.type, recipe.output.amount);
        this.updateHotbarCounts();
        this.renderCraftingPanel();
        this.playTone({ frequency: 520, duration: 0.06, type: 'triangle', volume: 0.024, release: 0.07 });
    }

    receiveChatMessage(payload) {
        this.chatMessages.push({
            username: payload.username || payload.playerId || 'Player',
            text: payload.text || ''
        });
        if (this.chatMessages.length > 30) {
            this.chatMessages.shift();
        }

        this.renderChatMessages();

        if (!this.chatOpen) {
            if (this.chatHideTimeout) {
                clearTimeout(this.chatHideTimeout);
            }
            this.chatHideTimeout = setTimeout(() => this.refreshChatVisibility(), 5000);
        }
    }

    receiveSystemMessage(payload) {
        this.chatMessages.push({
            text: payload.text || '',
            system: true
        });
        if (this.chatMessages.length > 30) {
            this.chatMessages.shift();
        }

        this.renderChatMessages();

        if (!this.chatOpen) {
            if (this.chatHideTimeout) {
                clearTimeout(this.chatHideTimeout);
            }
            this.chatHideTimeout = setTimeout(() => this.refreshChatVisibility(), 5000);
        }
    }

    openSignReader(text) {
        const panel = document.getElementById('sign-reader');
        const content = document.getElementById('sign-reader-content');
        if (!panel || !content) return;

        this.signReaderOpen = true;
        this.stopMining();
        content.textContent = text;
        panel.classList.add('visible');
        if (document.pointerLockElement === this.renderer.domElement) {
            document.exitPointerLock();
        }
    }

    closeSignReader() {
        const panel = document.getElementById('sign-reader');
        if (!panel) return;

        this.signReaderOpen = false;
        panel.classList.remove('visible');
    }

    tryReadSign() {
        const hit = this.raycastBlock(this.breakDistance);
        if (!hit) return false;

        const worldPos = this.world.getBlockPositionFromIntersection(hit);
        if (!worldPos) return false;
        if (this.world.getBlockTypeAt(worldPos.x, worldPos.y, worldPos.z) !== 'sign') return false;

        const text = this.world.getSignTextAt(worldPos.x, worldPos.y, worldPos.z);
        if (!text) return false;

        this.openSignReader(text);
        return true;
    }

    openChatInput(prefill = '') {
        const input = document.getElementById('chat-input');
        if (!input) return;

        this.chatOpen = true;
        input.classList.add('visible');
        input.value = prefill;
        this.stopMining();
        if (document.pointerLockElement === this.renderer.domElement) {
            document.exitPointerLock();
        }
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        this.refreshChatVisibility();
    }

    closeChatInput() {
        const input = document.getElementById('chat-input');
        if (!input) return;

        this.chatOpen = false;
        input.classList.remove('visible');
        input.blur();
        this.refreshChatVisibility();
    }

    submitChatMessage() {
        const input = document.getElementById('chat-input');
        if (!input) return;

        const text = input.value.trim();
        if (text.startsWith('/')) {
            this.runChatCommand(text);
        } else if (text) {
            this.network.send('chat', { text: text });
        }

        this.closeChatInput();
    }

    runChatCommand(commandLine) {
        const [command] = commandLine.slice(1).split(/\s+/);
        const normalized = command.toLowerCase();

        switch (normalized) {
            case 'help':
                this.receiveSystemMessage({ text: 'Commands: /help, /spawn, /rtx, /time' });
                break;
            case 'spawn':
                this.cameraController.setPosition(this.respawnPoint);
                this.receiveSystemMessage({ text: 'Teleported to your current spawn point' });
                break;
            case 'rtx':
                this.toggleRTXMode();
                this.receiveSystemMessage({ text: `RTX mode ${this.rtxModeEnabled ? 'enabled' : 'disabled'}` });
                break;
            case 'time': {
                const dayHour = ((this.timeOfDay * 24) + 6) % 24;
                const hours = Math.floor(dayHour).toString().padStart(2, '0');
                const minutes = Math.floor((dayHour % 1) * 60).toString().padStart(2, '0');
                this.receiveSystemMessage({ text: `Current world time: ${hours}:${minutes}` });
                break;
            }
            default:
                this.receiveSystemMessage({ text: `Unknown command: /${normalized}` });
                break;
        }
    }

    promptSignText() {
        const requested = window.prompt('Write the sign message (up to 288 characters)', '');
        if (requested === null) return null;

        const normalized = requested.replace(/\r/g, '').trim();
        if (!normalized) return null;
        return normalized.slice(0, 288);
    }

    onChatKeyDown(event) {
        event.stopPropagation();
        if (event.code === 'Enter') {
            event.preventDefault();
            this.submitChatMessage();
        } else if (event.code === 'Escape') {
            event.preventDefault();
            this.closeChatInput();
        }
    }

    raycastPlayer(maxDistance) {
        this.raycaster.setFromCamera(this.screenCenter, this.camera);

        const objects = [];
        for (const avatar of this.otherPlayerMeshes.values()) {
            avatar.traverse((node) => {
                if (node instanceof THREE.Mesh) {
                    objects.push(node);
                }
            });
        }

        if (objects.length === 0) return null;

        const intersects = this.raycaster.intersectObjects(objects, true);
        if (intersects.length === 0 || intersects[0].distance > maxDistance) {
            return null;
        }

        let current = intersects[0].object;
        while (current && !current.userData.playerId) {
            current = current.parent;
        }

        if (!current || !current.userData.playerId) return null;

        return {
            playerId: current.userData.playerId,
            intersection: intersects[0]
        };
    }

    resetTouchTransientInput() {
        this.mobileMovePointerId = null;
        this.mobileLookPointerId = null;
        this.cameraController.setTouchJump(false);
        if (this.resetTouchJoystick) {
            this.resetTouchJoystick();
        }
    }

    bindMiningBlockVisual(hit, targetKey) {
        if (!hit || !hit.object || !hit.object.isInstancedMesh || hit.instanceId == null) {
            if (this.miningBlockVisual && this.miningBlockVisual.key !== targetKey) {
                this.resetMiningBlockVisual(true);
            }
            return;
        }

        if (this.miningBlockVisual && this.miningBlockVisual.key === targetKey && this.miningBlockVisual.mesh === hit.object && this.miningBlockVisual.instanceId === hit.instanceId) {
            this.miningBlockVisual.returning = false;
            return;
        }

        if (this.miningBlockVisual) {
            this.resetMiningBlockVisual(true);
        }

        const position = hit.object.userData.instancePositions[hit.instanceId];
        if (!position) return;

        this.miningBlockVisual = {
            key: targetKey,
            mesh: hit.object,
            instanceId: hit.instanceId,
            position: { x: position.x, y: position.y, z: position.z },
            currentRotation: new THREE.Vector3(0, 0, 0),
            targetRotation: new THREE.Vector3(0, 0, 0),
            returning: false
        };
        this.applyMiningBlockVisual();
    }

    resetMiningBlockVisual(immediate = false) {
        if (!this.miningBlockVisual) return;

        if (immediate) {
            this.miningBlockVisual.currentRotation.set(0, 0, 0);
            this.miningBlockVisual.targetRotation.set(0, 0, 0);
            this.applyMiningBlockVisual();
            this.miningBlockVisual = null;
            return;
        }

        this.miningBlockVisual.returning = true;
    }

    applyMiningBlockVisual() {
        if (!this.miningBlockVisual) return;

        const visual = this.miningBlockVisual;
        this.instanceTempQuaternion.setFromEuler(new THREE.Euler(
            visual.currentRotation.x,
            visual.currentRotation.y,
            visual.currentRotation.z,
            'XYZ'
        ));
        this.instanceTempMatrix.compose(
            new THREE.Vector3(visual.position.x + 0.5, visual.position.y + 0.5, visual.position.z + 0.5),
            this.instanceTempQuaternion,
            this.instanceTempScale
        );

        visual.mesh.setMatrixAt(visual.instanceId, this.instanceTempMatrix);
        visual.mesh.instanceMatrix.needsUpdate = true;
    }

    kickMiningBlockVisual() {
        if (!this.miningBlockVisual) return;

        const axis = Math.floor(Math.random() * 3);
        const amount = (Math.random() * 0.05 + 0.025) * (Math.random() < 0.5 ? -1 : 1);
        this.miningBlockVisual.targetRotation.set(0, 0, 0);

        if (axis === 0) this.miningBlockVisual.targetRotation.x = amount;
        if (axis === 1) this.miningBlockVisual.targetRotation.y = amount;
        if (axis === 2) this.miningBlockVisual.targetRotation.z = amount;
    }

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
            visual.currentRotation.set(0, 0, 0);
            visual.targetRotation.set(0, 0, 0);
            this.applyMiningBlockVisual();
            this.miningBlockVisual = null;
        }
    }

    raycastBlock(maxDistance) {
        this.raycaster.setFromCamera(this.screenCenter, this.camera);

        const blocks = this.world.getInteractableObjects(this.camera.position, maxDistance);
        if (blocks.length === 0) return null;

        const intersects = this.raycaster.intersectObjects(blocks, false);
        if (intersects.length === 0 || intersects[0].distance > maxDistance) {
            return null;
        }

        return intersects[0];
    }
    
    finishBreakingBlock(position) {
        const blockType = this.world.getBlockTypeAt(position.x, position.y, position.z);
        const dropType = this.world.getDropTypeForBlock(blockType);
        if (!this.world.removeBlockAt(position.x, position.y, position.z)) return false;

        if (blockType === 'bed' && this.isRespawnBoundToBlock(position)) {
            this.respawnPoint = { x: 0, y: 20, z: 0, yaw: 0, pitch: 0 };
            this.saveRespawnPoint();
            this.receiveSystemMessage({ text: 'Respawn point reset because your bed was removed' });
        }

        if (dropType) {
            this.spawnPickup(dropType, position, 1);
        }

        this.showHitIndicator();
        this.lastSelectionUpdate = 0;

        if (this.network.connected) {
            this.network.send('blockBreak', { x: position.x, y: position.y, z: position.z });
        }

        return true;
    }

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
    }

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
    }

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
    }

    performMiningStrike(blockType, hit) {
        if (!hit || !hit.face) return;

        this.spawnMiningParticles(blockType, hit.point, hit.face.normal);
        this.kickMiningBlockVisual();
        this.playMiningSound(blockType);
    }
    
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
            if (!blockType || this.getInventoryCount(blockType) <= 0) return;

            const payload = { x: newPos.x, y: newPos.y, z: newPos.z, blockType: blockType };
            if (blockType === 'sign') {
                const text = this.promptSignText();
                if (!text) return;
                payload.text = text;
            }

            if (!this.world.addBlock(payload)) return;
            this.consumeSelectedBlock();
            if (blockType === 'bed') {
                this.setRespawnPointFromBlock(newPos);
            }
            this.playPlaceSound(blockType);

            this.showHitIndicator();
            this.lastSelectionUpdate = 0;

            if (this.network.connected) {
                this.network.send('blockPlace', payload);
            }
        }
    }

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

        const breakDuration = this.world.getBreakDurationAt(worldPos.x, worldPos.y, worldPos.z);
        if (!breakDuration || !Number.isFinite(breakDuration)) {
            this.resetMiningTarget();
            this.resetMiningBlockVisual(false);
            return;
        }

        const blockType = this.world.getBlockTypeAt(worldPos.x, worldPos.y, worldPos.z);

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
    }
    
    showHitIndicator() {
        this.hitIndicator.style.opacity = '1';
        setTimeout(() => { this.hitIndicator.style.opacity = '0'; }, 100);
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.rtxModeEnabled ? 2 : 1.25));
    }
    
    updateUI() {
        this.frameCount++;
        const now = performance.now();
        
        if (now - this.lastFpsUpdate >= 1000) {
            document.getElementById('fps').textContent = Math.round(this.frameCount * 1000 / (now - this.lastFpsUpdate));
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
        
        const pos = this.cameraController.getPosition();
        document.getElementById('position').textContent = `X: ${pos.x.toFixed(1)} Y: ${pos.y.toFixed(1)} Z: ${pos.z.toFixed(1)}`;
        this.updateNavigationHUD();
    }
    
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

    updateFirstPersonHand(delta) {
        if (!this.firstPersonHand) return;

        let targetX = this.handBasePosition.x;
        let targetY = this.handBasePosition.y;
        let targetZ = this.handBasePosition.z;
        let targetRotX = this.handBaseRotation.x;
        let targetRotY = this.handBaseRotation.y;
        let targetRotZ = this.handBaseRotation.z;

        const isMining = this.isBreakInputActive && this.miningTargetKey !== null;
        if (isMining) {
            this.handSwingTime += delta * 16;
            const swing = Math.sin(this.handSwingTime);
            const strike = Math.abs(swing);

            targetY += swing * 0.05;
            targetZ += strike * 0.08;
            targetRotX += 0.12 + strike * 0.3;
            targetRotZ += swing * 0.14;
        } else {
            this.handSwingTime = 0;
        }

        const t = Math.min(1, delta * (isMining ? 18 : 10));
        this.firstPersonHand.position.x = THREE.MathUtils.lerp(this.firstPersonHand.position.x, targetX, t);
        this.firstPersonHand.position.y = THREE.MathUtils.lerp(this.firstPersonHand.position.y, targetY, t);
        this.firstPersonHand.position.z = THREE.MathUtils.lerp(this.firstPersonHand.position.z, targetZ, t);
        this.firstPersonHand.rotation.x = THREE.MathUtils.lerp(this.firstPersonHand.rotation.x, targetRotX, t);
        this.firstPersonHand.rotation.y = THREE.MathUtils.lerp(this.firstPersonHand.rotation.y, targetRotY, t);
        this.firstPersonHand.rotation.z = THREE.MathUtils.lerp(this.firstPersonHand.rotation.z, targetRotZ, t);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const delta = Math.min(this.clock.getDelta(), 0.1);
        const now = performance.now();

        if (this.respawnPending) {
            this.respawnTimer -= delta;
            if (this.respawnTimer <= 0) {
                this.respawnPlayer();
            }
            this.updateDeathScreen();
            this.updateUI();
            this.renderer.render(this.scene, this.camera);
            return;
        }

        if (this.pauseOpen) {
            this.updateUI();
            this.renderer.render(this.scene, this.camera);
            return;
        }
        
        this.cameraController.update(delta);
        if (this.cameraController.onGround === false && this.wasOnGround === true && this.cameraController.velocityY > 0) {
            this.playJumpSound();
        }
        this.wasOnGround = this.cameraController.onGround;
        this.updateSurvival(delta);
        this.updateLocalMovementFeedback(delta);
        this.updateDayNightCycle(delta);
        this.updateWeather(delta);
        this.updateUnderwaterEffect();
        this.world.update(this.camera.position.x, this.camera.position.z);
        this.updateRemotePlayers(delta);
        if (this.voiceChat) {
            this.voiceChat.updateProximity();
        }
        this.updatePickups(delta);
        this.updateMining(delta);
        this.updateMiningParticles(delta);
        this.updateMiningBlockVisual(delta);
        this.updateFirstPersonHand(delta);
        
        if (now - this.lastSelectionUpdate >= this.selectionUpdateInterval) {
            this.updateSelectionBox();
            this.lastSelectionUpdate = now;
        }
        
        if (this.network.connected && now - this.lastNetworkUpdate >= 100) {
            this.network.updatePosition(this.cameraController.getPosition());
            this.lastNetworkUpdate = now;
        }
        
        this.updateUI();
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('load', () => new Game());
