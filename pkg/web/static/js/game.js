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
        
        this.inventory = ['grass', 'dirt', 'cobblestone', 'wood', 'planks', 'brick', 'sand', 'water', 'leaves', 'torch', 'sound_block', 'spray_paint', 'ladder'];
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
            torch: 0,
            sound_block: 0,
            spray_paint: 0,
            ladder: 0
        };
        this.selectedSlot = 0;
        this.hotbarPrimaryType = null;
        this.hotbarPinnedTypes = [];
        this.restoreInventoryState();
        this.playerName = this.loadPlayerName();
        this.playerShirtColor = this.loadPlayerShirtColor();
        this.playerHairStyle = this.loadPlayerHairStyle();
        this.playerHairColor = this.loadPlayerHairColor();
        this.appearanceMenuOpen = false;
        this.appearanceDraft = null;
        this.appearancePreviewRenderer = null;
        this.appearancePreviewScene = null;
        this.appearancePreviewCamera = null;
        this.appearancePreviewAvatar = null;
        this.appearancePreviewKey = '';
        this.settings = this.loadSettings();
        this.masterVolume = this.settings.masterVolume;
        this.mouseSensitivity = this.settings.mouseSensitivity;
        this.rtxPreferred = this.settings.rtxModeEnabled;
        this.renderDistanceSetting = this.settings.renderDistance;
        this.fovSetting = this.settings.fov;
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
        this.worldDay = 0;
        this.weatherState = 'clear';
        this.weatherTimer = 0;
        this.nextWeatherChange = 70;
        this.craftingOpen = false;
        this.craftingSearchTerm = '';
        this.inventorySearchTerm = '';
        this.selectedCraftingRecipeId = null;
        this.suppressPointerLockPauseUntil = 0;
        this.pauseOpen = false;
        this.titleScreenOpen = true;
        this.titleCameraAngle = 0;
        this.cameraViewMode = 'first';
        this.thirdPersonAnchor = null;
        this.playerAnchorPosition = null;
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
            },
            {
                id: 'sound_block',
                name: 'Build Sound Block',
                output: { type: 'sound_block', amount: 1 },
                inputs: [{ type: 'planks', amount: 2 }, { type: 'cobblestone', amount: 1 }, { type: 'coal_ore', amount: 1 }]
            },
            {
                id: 'spray_paint',
                name: 'Mix Fluorescent Spray Paint',
                output: { type: 'spray_paint', amount: 1 },
                inputs: [{ type: 'sand', amount: 1 }, { type: 'flower_red', amount: 1 }, { type: 'coal_ore', amount: 1 }]
            },
            {
                id: 'ladder',
                name: 'Build Ladders',
                output: { type: 'ladder', amount: 8 },
                inputs: [{ type: 'wood', amount: 1 }]
            }
        ];
        this.registerExpansionContent();

        this.ambientLight = null;
        this.sunLight = null;
        this.hemiLight = null;
        this.heldTorchLight = null;
        this.hotbarSlotElements = [];
        this.hotbarCountElements = [];
        this.pickups = new Map();
        this.pickupIdCounter = 0;
        this.fallingBlockDrops = [];
        this.remotePlayerNames = new Map();
        this.followTargetPlayerId = null;
        this.followReturnPosition = null;
        this.followCameraAngle = 0;
        this.ambientMobs = [];
        this.mobTextureCache = new Map();
        this.followingDog = null;
        this.followingCat = null;
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
        this.activeSignPosition = null;
        this.remoteFootstepRange = 9;
        this.localFootstepDistance = 0;
        this.localFootstepStepLength = 1.1;
        this.lastLocalGroundPosition = null;
        this.cameraBobPhase = 0;
        this.photoMode = false;
        this.inventoryOpen = false;
        this.hotbarSize = 8;
        this.maxHealth = 20;
        this.health = this.maxHealth;
        this.respawnPending = false;
        this.respawnTimer = 0;
        this.deathReason = 'Respawning soon...';
        this.wasOnGroundForDamage = false;
        this.airbornePeakFeetY = null;
        this.respawnPoint = this.loadRespawnPoint();
        this.lastSafePosition = null;
        this.lastSafePositionSaveTimer = 0;
        
        this.otherPlayerMeshes = new Map();
        this.localPlayerAvatar = null;
        this.sunCube = null;
        this.moonCube = null;
        this.currentMoonPhase = -1;
        this.playerGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8);
        this.playerMaterial = new THREE.MeshLambertMaterial({ color: 0xFFCC00 });

        this.selectionBox = null;
        this.hitIndicator = null;
        this.miningOverlay = null;
        this.miningOverlayTextures = [];
        this.breakParticleGeometry = null;
        this.breakParticleMaterials = new Map();
        this.breakParticles = [];
        this.worldNotes = [];
        this.worldPings = [];
        this.playerReactions = [];

        this.isBreakInputActive = false;
        this.miningTargetKey = null;
        this.miningTargetDuration = 0;
        this.miningProgress = 0;
        this.miningTargetType = null;
        this.miningStrikeTimer = 0;
        this.miningStrikeInterval = 0.14;

        this.miningBlockVisual = null;
        this.miningBlockVisualZero = new THREE.Vector3(0, 0, 0);

        this.firstPersonHand = null;
        this.firstPersonLeftHand = null;
        this.firstPersonItemAnchor = null;
        this.heldItemMesh = null;
        this.heldItemType = null;
        this.handBasePosition = new THREE.Vector3(0.62, -0.72, -1.05);
        this.handBaseRotation = new THREE.Euler(-0.55, 0.2, 0.18);
        this.leftHandBasePosition = new THREE.Vector3(-0.62, -0.74, -1.02);
        this.leftHandBaseRotation = new THREE.Euler(-0.55, -0.2, -0.18);
        this.handSwingTime = 0;
        this.placeActionTimer = 0;
        this.soundBlockInstruments = ['bell', 'drum', 'pluck', 'flute', 'bass'];
        this.soundBlockNotes = [262, 294, 330, 349, 392, 440, 494, 523];
        this.sprayColors = ['green', 'pink', 'blue'];
        this.sprayColorIndex = 0;
        this.sprayActiveUntil = 0;

        this.init();
    }

    registerExpansionContent() {
        const colorNames = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
        const woodNames = ['spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'cherry', 'maple', 'willow'];
        const materialBlocks = ['marble', 'basalt', 'slate', 'limestone', 'granite', 'copper_block', 'iron_block', 'gold_block', 'obsidian', 'concrete'];
        const elementSymbols = ['h', 'he', 'li', 'be', 'b', 'c', 'n', 'o', 'f', 'ne', 'na', 'mg', 'al', 'si', 'p', 's', 'cl', 'ar', 'k', 'ca', 'ti', 'cr', 'mn', 'fe', 'co', 'ni', 'cu', 'zn', 'ag', 'sn', 'i', 'w', 'pt', 'au', 'hg', 'pb'];
        const toolItems = ['wood_pickaxe', 'wood_shovel', 'wood_axe', 'wood_sword', 'wood_hoe', 'stone_pickaxe', 'stone_shovel', 'stone_axe', 'stone_sword', 'stone_hoe', 'iron_pickaxe', 'iron_shovel', 'iron_axe', 'iron_sword', 'iron_hoe', 'iron_shears', 'gold_pickaxe', 'gold_shovel', 'gold_axe', 'gold_sword', 'gold_hoe'];
        const eggItems = ['sheep_egg', 'duck_egg', 'pig_egg', 'giraffe_egg', 'dog_egg', 'cat_egg', 'spider_egg', 'cave_monster_egg', 'macaw_egg'];
        const slabBlocks = ['stone_slab', 'cobblestone_slab', 'brick_slab', 'stone_bricks_slab', 'planks_slab', 'spruce_planks_slab', 'birch_planks_slab', 'jungle_planks_slab', 'acacia_planks_slab', 'dark_oak_planks_slab', 'cherry_planks_slab', 'maple_planks_slab', 'willow_planks_slab'];

        const addItemSlot = (type) => {
            if (!this.inventory.includes(type)) this.inventory.push(type);
            if (!Object.prototype.hasOwnProperty.call(this.inventoryCounts, type)) this.inventoryCounts[type] = 0;
        };

        const addRecipe = (id, name, outputType, outputAmount, inputs) => {
            if (this.craftingRecipes.some((recipe) => recipe.id === id)) return;
            this.craftingRecipes.push({ id, name, output: { type: outputType, amount: outputAmount }, inputs });
            addItemSlot(outputType);
            inputs.forEach((input) => addItemSlot(input.type));
        };

        colorNames.forEach((color) => {
            addRecipe(`${color}_brick`, `Mix ${this.formatItemName(color)} Brick`, `${color}_brick`, 4, [{ type: 'brick', amount: 1 }, { type: 'sand', amount: 1 }]);
            addRecipe(`${color}_wool`, `Dye ${this.formatItemName(color)} Wool`, `${color}_wool`, 4, [{ type: 'leaves', amount: 2 }, { type: 'flower_red', amount: 1 }]);
        });

        woodNames.forEach((wood) => {
            addRecipe(`${wood}_planks`, `Saw ${this.formatItemName(wood)} Planks`, `${wood}_planks`, 4, [{ type: `${wood}_wood`, amount: 1 }]);
            addRecipe(`${wood}_sapling`, `Prepare ${this.formatItemName(wood)} Sapling`, `${wood}_sapling`, 1, [{ type: `${wood}_leaves`, amount: 2 }, { type: 'dirt', amount: 1 }]);
        });

        slabBlocks.forEach((slab) => {
            const source = slab.replace('_slab', '');
            addRecipe(slab, `Cut ${this.formatItemName(slab)}`, slab, 2, [{ type: source, amount: 1 }]);
        });

        materialBlocks.forEach((type) => {
            const input = type.includes('block') || type === 'obsidian' ? 'stone' : 'cobblestone';
            addRecipe(type, `Refine ${this.formatItemName(type)}`, type, 2, [{ type: input, amount: 2 }, { type: 'sand', amount: 1 }]);
        });

        elementSymbols.forEach((symbol) => {
            addRecipe(`element_${symbol}`, `Synthesize ${symbol.toUpperCase()} Block`, `element_${symbol}`, 1, [{ type: 'stone', amount: 1 }, { type: 'coal_ore', amount: 1 }]);
        });

        const toolMaterials = { wood: 'planks', stone: 'cobblestone', iron: 'iron_ore', gold: 'gold_ore' };
        Object.entries(toolMaterials).forEach(([material, source]) => {
            ['pickaxe', 'shovel', 'axe', 'sword', 'hoe'].forEach((tool) => {
                addRecipe(`${material}_${tool}`, `Craft ${this.formatItemName(`${material}_${tool}`)}`, `${material}_${tool}`, 1, [{ type: source, amount: tool === 'sword' ? 2 : 3 }, { type: 'wood', amount: 1 }]);
            });
        });
        addRecipe('iron_shears', 'Craft Iron Shears', 'iron_shears', 1, [{ type: 'iron_ore', amount: 2 }]);

        eggItems.forEach((egg) => addItemSlot(egg));
        toolItems.forEach((tool) => addItemSlot(tool));
        ['spruce_wood', 'birch_wood', 'jungle_wood', 'acacia_wood', 'dark_oak_wood', 'cherry_wood', 'maple_wood', 'willow_wood', 'spruce_leaves', 'birch_leaves', 'jungle_leaves', 'acacia_leaves', 'dark_oak_leaves', 'cherry_leaves', 'maple_leaves', 'willow_leaves'].forEach(addItemSlot);
    }

    formatItemName(type) {
        return String(type).split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    }

    init() {
        this.initThreeJS();
        this.initCamera();
        this.initWorld();
        this.initAmbientMobs();
        this.restoreLastSafePosition();
        this.applyRTXMode(this.rtxPreferred);
        this.initNetwork();
        this.initHotbar();
        this.initInput();
        this.initPauseMenu();
        this.initVoiceChat();
        this.initTitleScreen();
        
        document.getElementById('connecting').style.display = 'none';
        this.refreshChatVisibility();
        this.renderCraftingPanel();
        this.updateHealthUI();
        this.updateDeathScreen();
        this.updateTitleScreen();
        
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

    loadPlayerShirtColor() {
        const saved = window.localStorage.getItem('minecloud-shirt-color');
        return /^#[0-9a-f]{6}$/i.test(saved || '') ? saved : '#2f63c8';
    }

    loadPlayerHairStyle() {
        return this.normalizeHairStyle(window.localStorage.getItem('minecloud-hair-style'));
    }

    loadPlayerHairColor() {
        const saved = window.localStorage.getItem('minecloud-hair-color');
        return /^#[0-9a-f]{6}$/i.test(saved || '') ? saved : '#5b3a29';
    }

    parseColorHex(color, fallback = 0x2F63C8) {
        return /^#[0-9a-f]{6}$/i.test(color || '') ? parseInt(color.slice(1), 16) : fallback;
    }

    loadSettings() {
        const defaults = {
            masterVolume: 0.8,
            mouseSensitivity: 1,
            rtxModeEnabled: false,
            renderDistance: 4,
            fov: 70
        };

        const saved = window.localStorage.getItem('minecloud-settings');
        if (!saved) return defaults;

        try {
            const parsed = JSON.parse(saved);
            return {
                masterVolume: typeof parsed.masterVolume === 'number' ? parsed.masterVolume : defaults.masterVolume,
                mouseSensitivity: typeof parsed.mouseSensitivity === 'number' ? parsed.mouseSensitivity : defaults.mouseSensitivity,
                rtxModeEnabled: typeof parsed.rtxModeEnabled === 'boolean' ? parsed.rtxModeEnabled : defaults.rtxModeEnabled,
                renderDistance: typeof parsed.renderDistance === 'number' ? parsed.renderDistance : defaults.renderDistance,
                fov: typeof parsed.fov === 'number' ? parsed.fov : defaults.fov
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
            renderDistance: this.renderDistanceSetting,
            fov: this.fovSetting
        }));
    }

    updateFirstPersonHandVisibility() {
        const visible = this.cameraViewMode === 'first' && !this.titleScreenOpen;
        if (this.firstPersonHand) {
            this.firstPersonHand.visible = visible;
        }
        if (this.firstPersonLeftHand) {
            this.firstPersonLeftHand.visible = visible;
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

    toggleCameraView() {
        const wasThirdPerson = this.cameraViewMode !== 'first';
        if (this.cameraViewMode === 'first') {
            this.cameraViewMode = 'third';
        } else if (this.cameraViewMode === 'third') {
            this.cameraViewMode = 'thirdBack';
        } else {
            this.cameraViewMode = 'first';
        }
        this.updateFirstPersonHandVisibility();
        if (this.localPlayerAvatar) {
            this.localPlayerAvatar.visible = this.cameraViewMode !== 'first';
        }
        if (this.cameraViewMode === 'first') {
            if (wasThirdPerson && this.thirdPersonAnchor) {
                this.camera.position.copy(this.thirdPersonAnchor);
                this.camera.rotation.order = 'YXZ';
                this.camera.rotation.y = this.cameraController.yaw;
                this.camera.rotation.x = this.cameraController.pitch;
                this.camera.rotation.z = 0;
            }
            this.thirdPersonAnchor = null;
        }
    }

    getLocalPlayerPosition() {
        if (this.cameraViewMode !== 'first' && this.thirdPersonAnchor) {
            return {
                x: this.thirdPersonAnchor.x,
                y: this.thirdPersonAnchor.y,
                z: this.thirdPersonAnchor.z,
                yaw: this.cameraController.yaw,
                pitch: this.cameraController.pitch
            };
        }

        return this.cameraController.getPosition();
    }

    updateThirdPersonCamera(anchor, delta) {
        this.thirdPersonAnchor = anchor.clone();
        this.updateLocalPlayerAvatar(anchor, delta);
        const pitch = THREE.MathUtils.clamp(this.cameraController.pitch, -1.05, 1.05);
        const distance = this.cameraViewMode === 'thirdBack' ? 3.8 : 3.6;
        const horizontalDistance = Math.cos(pitch) * distance;
        const verticalOffset = -Math.sin(pitch) * distance;
        const orbitTarget = new THREE.Vector3(anchor.x, anchor.y - this.cameraController.eyeHeight + 1.55, anchor.z);
        const offset = new THREE.Vector3(0, verticalOffset, horizontalDistance);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraController.yaw + (this.cameraViewMode === 'thirdBack' ? 0 : Math.PI));
        this.camera.position.copy(orbitTarget).add(offset);
        this.camera.lookAt(orbitTarget);
    }

    disposeObject3D(object) {
        if (!object) return;
        object.traverse((node) => {
            if (node.geometry && node.userData && node.userData.disposeGeometry) node.geometry.dispose();
            if (Array.isArray(node.material)) {
                node.material.forEach((material) => material.dispose());
            } else if (node.material) {
                node.material.dispose();
            }
        });
    }

    togglePhotoMode() {
        this.photoMode = !this.photoMode;
        document.body.classList.toggle('photo-mode', this.photoMode);
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

        this.camera = new THREE.PerspectiveCamera(this.fovSetting, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 20, 0);
        this.scene.add(this.camera);
        this.initCelestialBodies();
        
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
        this.initHeldTorchLight();

        window.addEventListener('resize', () => this.onWindowResize());
    }

    initHeldTorchLight() {
        this.heldTorchLight = new THREE.PointLight(0xffb65a, 0, 8, 1.8);
        this.heldTorchLight.position.set(0.45, -0.35, -0.55);
        this.camera.add(this.heldTorchLight);
    }

    initViewModel() {
        const appearance = this.getPlayerAppearance(this.playerName, this.playerShirtColor, this.playerHairStyle, this.playerHairColor);
        const createMaterial = (color) => {
            const material = this.rtxModeEnabled
                ? new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.01, transparent: true, opacity: 1 })
                : new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 1 });
            material.depthTest = false;
            material.depthWrite = false;
            material.toneMapped = false;
            return material;
        };

        const handGroup = new THREE.Group();
        const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.72, 0.26), createMaterial(appearance.skin));
        const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), createMaterial(appearance.shirt));
        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), createMaterial(appearance.skin));

        sleeve.position.set(0, -0.04, 0);
        cuff.position.set(0, -0.34, 0);
        hand.position.set(0, -0.52, 0);

        [sleeve, cuff, hand].forEach((mesh) => {
            mesh.renderOrder = 10000;
            mesh.frustumCulled = false;
        });

        const itemAnchor = new THREE.Group();
        itemAnchor.position.set(0, 0.5, -0.55);
        sleeve.add(itemAnchor);
        handGroup.add(sleeve);
        handGroup.add(cuff);
        handGroup.add(hand);
        handGroup.renderOrder = 10000;
        handGroup.position.copy(this.handBasePosition);
        handGroup.rotation.copy(this.handBaseRotation);

        this.camera.add(handGroup);
        this.firstPersonHand = handGroup;
        this.firstPersonItemAnchor = itemAnchor;

        const leftHandGroup = new THREE.Group();
        const leftSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.72, 0.26), createMaterial(appearance.skin));
        const leftCuff = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), createMaterial(appearance.shirt));
        const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), createMaterial(appearance.skin));

        leftSleeve.position.set(0, -0.04, 0);
        leftCuff.position.set(0, -0.34, 0);
        leftHand.position.set(0, -0.52, 0);
        [leftSleeve, leftCuff, leftHand].forEach((mesh) => {
            mesh.renderOrder = 10000;
            mesh.frustumCulled = false;
        });
        leftHandGroup.add(leftSleeve);
        leftHandGroup.add(leftCuff);
        leftHandGroup.add(leftHand);
        leftHandGroup.renderOrder = 10000;
        leftHandGroup.position.copy(this.leftHandBasePosition);
        leftHandGroup.rotation.copy(this.leftHandBaseRotation);
        this.camera.add(leftHandGroup);
        this.firstPersonLeftHand = leftHandGroup;
        this.updateFirstPersonHandVisibility();
        this.initLocalPlayerAvatar();
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

    initCamera() {
        this.cameraController = new CameraController(this.camera, this.renderer.domElement);
        this.cameraController.setBlockChecker((x, y, z) => this.world.hasSolidBlock(x, y, z));
        this.cameraController.setBlockTypeGetter((x, y, z) => this.world.getBlockTypeAt(x, y, z));
        this.cameraController.setBlockHeightGetter((x, y, z) => this.world.getCollisionHeight(x, y, z));
        this.applyLookSensitivity();
    }

    initWorld() {
        this.world = new WorldRenderer(this.scene);
        this.world.setRenderDistance(this.renderDistanceSetting);
    }

    initNetwork() {
        this.network = new NetworkClient();
        this.network.setUsername(this.playerName);
        this.network.setShirtColor(this.playerShirtColor);
        this.network.setHair(this.playerHairStyle, this.playerHairColor);
        this.network.on('worldInit', (blocks) => this.world.loadBlocks(blocks));
        this.network.on('blockPlace', (payload) => this.world.addBlock(payload));
        this.network.on('blockBreak', (payload) => this.world.removeBlockAt(payload.x, payload.y, payload.z));
        this.network.on('soundBlockPlay', (payload) => this.playSoundBlockAt(payload));
        this.network.on('sprayPaint', (payload) => this.world.addSprayPaint(payload));
        this.network.on('sprayPaintRemove', (payload) => this.world.removeSprayPaint(payload.key));
        this.network.on('worldNote', (payload) => this.addFloatingWorldText(payload));
        this.network.on('worldPing', (payload) => this.addWorldPing(payload));
        this.network.on('playerReaction', (payload) => this.addPlayerReaction(payload));
        this.network.on('proximityEmote', (payload) => this.playProximityEmoteAt(payload));
        this.network.on('signVoteUpdate', (payload) => {
            this.world.addBlock(payload);
            if (this.activeSignPosition && payload.x === this.activeSignPosition.x && payload.y === this.activeSignPosition.y && payload.z === this.activeSignPosition.z) {
                this.updateSignVoteButtons(this.world.getSignVotesAt(payload.x, payload.y, payload.z));
            }
        });
        this.network.on('otherPlayerMove', (player) => this.updateOtherPlayer(player));
        this.network.on('playerList', (payload) => this.updateRemotePlayerNames(payload));
        this.network.on('chat', (payload) => this.receiveChatMessage(payload));
        this.network.on('system', (payload) => this.receiveSystemMessage(payload));
        this.network.on('timeSync', (payload) => {
            if (typeof payload.timeOfDay === 'number') {
                this.timeOfDay = payload.timeOfDay;
            }
            if (typeof payload.worldDay === 'number') {
                this.worldDay = payload.worldDay;
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
                if (performance.now() < this.suppressPointerLockPauseUntil) {
                    return;
                }
                if (!this.titleScreenOpen && !this.pauseOpen && !this.chatOpen && !this.craftingOpen && !this.signReaderOpen && !this.inventoryOpen && !this.respawnPending) {
                    this.openPauseMenu();
                }
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
        const craftingSearch = document.getElementById('crafting-search');
        if (craftingSearch) {
            craftingSearch.addEventListener('input', () => {
                this.craftingSearchTerm = craftingSearch.value;
                this.renderCraftingPanel();
            });
            craftingSearch.addEventListener('keydown', (event) => {
                if (event.code === 'Escape') {
                    event.preventDefault();
                    this.closeCraftingPanel();
                }
                event.stopPropagation();
            });
        }
        const inventorySearch = document.getElementById('inventory-search');
        if (inventorySearch) {
            inventorySearch.addEventListener('input', () => {
                this.inventorySearchTerm = inventorySearch.value;
                this.renderInventoryPanel();
            });
            inventorySearch.addEventListener('keydown', (event) => {
                if (event.code === 'Escape') {
                    event.preventDefault();
                    this.closeInventoryPanel();
                }
                event.stopPropagation();
            });
        }

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
        if (this.chatOpen || this.craftingOpen || this.pauseOpen || this.signReaderOpen || this.inventoryOpen || this.respawnPending) return;
        
        if (!this.cameraController.canInteract()) {
            this.recapturePointerLockFromGesture();
            return;
        }
        
        if (event.button === 0) {
            const mobHit = this.raycastMob(5);
            if (mobHit) {
                this.interactWithMob(mobHit);
                return;
            }
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
            if (this.closeActiveMenuFromEscape()) {
                return;
            }
            if (this.followTargetPlayerId) {
                this.followTargetPlayerId = null;
                this.decoratePlayerListInteractions();
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

        if (this.inventoryOpen) {
            if (event.code === 'KeyE' && !event.repeat) {
                event.preventDefault();
                this.closeInventoryPanel();
            }
            return;
        }

        if (this.pauseOpen) {
            return;
        }

        if (event.code === 'KeyF' && !event.repeat) {
            event.preventDefault();
            if (this.tryCycleSprayColor()) {
                return;
            }
            if (this.tryUseSoundBlock(event.shiftKey)) {
                return;
            }
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

        if (event.code === 'KeyV' && !event.repeat) {
            event.preventDefault();
            this.toggleCameraView();
            return;
        }

        if (event.code === 'Enter' && !event.repeat) {
            event.preventDefault();
            this.openChatInput();
            return;
        }

        if (event.code === 'KeyE' && !event.repeat) {
            event.preventDefault();
            this.toggleInventoryPanel();
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

        if (event.code === 'KeyG' && !event.repeat) {
            event.preventDefault();
            this.eatSelectedItem();
            return;
        }

        const slot = parseInt(event.key) - 1;
        if (slot >= 0 && slot < this.hotbarSize) {
            const inventoryIndex = this.getHotbarSlotInventoryIndex(slot);
            if (inventoryIndex !== null) {
                this.selectSlot(inventoryIndex);
            }
        }
    }

    onWheel(event) {
        if (!this.cameraController.isLocked) return;
        if (event.deltaY === 0) return;

        event.preventDefault();

        const now = performance.now();
        if (now - this.lastWheelStepAt < 110) {
            return;
        }

        const direction = event.deltaY > 0 ? 1 : -1;
        this.lastWheelStepAt = now;

        const availableSlots = this.getHotbarInventoryIndexes();
        if (availableSlots.length === 0) return;

        const currentAvailableIndex = availableSlots.indexOf(this.selectedSlot);
        const startIndex = currentAvailableIndex === -1 ? 0 : currentAvailableIndex;
        const nextSlot = availableSlots[(startIndex + direction + availableSlots.length) % availableSlots.length];
        this.selectSlot(nextSlot);
    }

    resetTouchTransientInput() {
        this.mobileMovePointerId = null;
        this.mobileLookPointerId = null;
        this.cameraController.setTouchJump(false);
        if (this.resetTouchJoystick) {
            this.resetTouchJoystick();
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.rtxModeEnabled ? 2 : 1.25));
        this.resizeAppearancePreview();
    }

    updateUI() {
        this.frameCount++;
        const now = performance.now();
        
        if (now - this.lastFpsUpdate >= 1000) {
            document.getElementById('fps').textContent = Math.round(this.frameCount * 1000 / (now - this.lastFpsUpdate));
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
        
        const pos = this.playerAnchorPosition || this.cameraController.getPosition();
        document.getElementById('position').textContent = `X: ${pos.x.toFixed(1)} Y: ${pos.y.toFixed(1)} Z: ${pos.z.toFixed(1)}`;
        this.updateNavigationHUD();
    }

    updateFirstPersonHand(delta) {
        if (!this.firstPersonHand) return;

        let targetX = this.handBasePosition.x;
        let targetY = this.handBasePosition.y;
        let targetZ = this.handBasePosition.z;
        let targetRotX = this.handBaseRotation.x;
        let targetRotY = this.handBaseRotation.y;
        let targetRotZ = this.handBaseRotation.z;
        let leftTargetX = this.leftHandBasePosition.x;
        let leftTargetY = this.leftHandBasePosition.y;
        let leftTargetZ = this.leftHandBasePosition.z;
        let leftTargetRotX = this.leftHandBaseRotation.x;
        let leftTargetRotY = this.leftHandBaseRotation.y;
        let leftTargetRotZ = this.leftHandBaseRotation.z;

        const hasMoveInput = this.cameraController.keys.forward || this.cameraController.keys.backward ||
            this.cameraController.keys.left || this.cameraController.keys.right ||
            Math.abs(this.cameraController.moveInput.x) > 0.05 || Math.abs(this.cameraController.moveInput.y) > 0.05;
        if (this.cameraController.onGround && hasMoveInput) {
            const walkPhase = this.cameraBobPhase * 0.48;
            const walkBob = Math.sin(walkPhase) * 0.11;
            targetY += walkBob;
            targetRotZ += Math.sin(walkPhase) * 0.11;
            leftTargetY -= walkBob;
            leftTargetRotZ -= Math.sin(walkPhase) * 0.11;
        }

        const isMining = this.isBreakInputActive && this.miningTargetKey !== null;
        if (isMining) {
            this.handSwingTime += delta * 16;
            const swing = Math.sin(this.handSwingTime);
            const strike = Math.abs(swing);

            targetY += swing * 0.05;
            targetZ += strike * 0.08;
            targetRotX += 0.12 + strike * 0.3;
            targetRotZ += swing * 0.14;
            leftTargetY -= swing * 0.025;
            leftTargetRotZ -= swing * 0.06;
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

        if (this.firstPersonLeftHand) {
            this.firstPersonLeftHand.position.x = THREE.MathUtils.lerp(this.firstPersonLeftHand.position.x, leftTargetX, t);
            this.firstPersonLeftHand.position.y = THREE.MathUtils.lerp(this.firstPersonLeftHand.position.y, leftTargetY, t);
            this.firstPersonLeftHand.position.z = THREE.MathUtils.lerp(this.firstPersonLeftHand.position.z, leftTargetZ, t);
            this.firstPersonLeftHand.rotation.x = THREE.MathUtils.lerp(this.firstPersonLeftHand.rotation.x, leftTargetRotX, t);
            this.firstPersonLeftHand.rotation.y = THREE.MathUtils.lerp(this.firstPersonLeftHand.rotation.y, leftTargetRotY, t);
            this.firstPersonLeftHand.rotation.z = THREE.MathUtils.lerp(this.firstPersonLeftHand.rotation.z, leftTargetRotZ, t);
        }
    }

    updateHeldTorchLight() {
        if (!this.heldTorchLight) return;

        const hasTorchInHand = this.getSelectedBlockType() === 'torch' && this.getInventoryCount('torch') > 0;
        this.heldTorchLight.intensity = hasTorchInHand ? 1.45 : 0;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        const delta = Math.min(this.clock.getDelta(), 0.1);
        const now = performance.now();

        if (this.cameraViewMode !== 'first' && this.thirdPersonAnchor) {
            this.camera.position.copy(this.thirdPersonAnchor);
            this.camera.rotation.order = 'YXZ';
            this.camera.rotation.y = this.cameraController.yaw;
            this.camera.rotation.x = this.cameraController.pitch;
            this.camera.rotation.z = 0;
        }

        if (this.titleScreenOpen) {
            this.updateTitleScreenCamera(delta);
            this.renderAppearancePreview(delta);
            this.updateDayNightCycle(delta);
            this.updateWeather(delta);
            this.updateUnderwaterEffect();
            this.world.update(this.camera.position.x, this.camera.position.z);
            this.world.updateSprayPaints(this.worldDay, this.timeOfDay);
            this.updateWorldNotes();
            this.updateWorldPings(delta);
            this.updatePlayerReactions(delta);
            this.updateAmbientMobs(delta);
            this.updateRemotePlayers(delta);
            if (this.voiceChat) {
                this.voiceChat.updateProximity();
            }
            this.updateUI();
            this.renderer.render(this.scene, this.camera);
            return;
        }

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
            this.renderAppearancePreview(delta);
            this.updateUI();
            this.renderer.render(this.scene, this.camera);
            return;
        }

        if (this.followTargetPlayerId) {
            this.updateDayNightCycle(delta);
            this.updateWeather(delta);
            this.updateUnderwaterEffect();
            this.updateCaveLighting();
            this.world.update(this.camera.position.x, this.camera.position.z);
            this.world.updateSprayPaints(this.worldDay, this.timeOfDay);
            this.updateWorldNotes();
            this.updateWorldPings(delta);
            this.updatePlayerReactions(delta);
            this.updateAmbientMobs(delta);
            this.updateRemotePlayers(delta);
            this.updateFollowCamera(delta);
            if (this.voiceChat) {
                this.voiceChat.updateProximity();
            }
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
        this.updateCaveLighting();
        const playerAnchor = this.camera.position.clone();
        this.playerAnchorPosition = { x: playerAnchor.x, y: playerAnchor.y, z: playerAnchor.z, yaw: this.cameraController.yaw, pitch: this.cameraController.pitch };
        this.world.update(this.camera.position.x, this.camera.position.z);
        this.world.updateSprayPaints(this.worldDay, this.timeOfDay);
        this.updateWorldNotes();
        this.updateWorldPings(delta);
        this.updatePlayerReactions(delta);
        this.updateAmbientMobs(delta);
        this.updateRemotePlayers(delta);
        this.updateFallingBlockDrops(delta);
        if (this.voiceChat) {
            this.voiceChat.updateProximity();
        }
        this.updatePickups(delta);
        this.updateMining(delta);
        this.updateMiningParticles(delta);
        this.updateMiningBlockVisual(delta);
        this.updatePlayerActionTimers(delta);
        this.updateFirstPersonHand(delta);
        this.updateHeldTorchLight();

        if (this.cameraViewMode !== 'first') {
            this.updateThirdPersonCamera(playerAnchor, delta);
        }
        
        if (now - this.lastSelectionUpdate >= this.selectionUpdateInterval) {
            this.updateSelectionBox();
            this.lastSelectionUpdate = now;
        }
        
        if (this.network.connected && now - this.lastNetworkUpdate >= 100) {
            this.network.updatePosition(this.playerAnchorPosition || this.cameraController.getPosition(), this.getSelectedHeldItemType(), this.getCurrentPlayerAction());
            this.lastNetworkUpdate = now;
        }
        
        this.updateUI();
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('load', () => new Game());
