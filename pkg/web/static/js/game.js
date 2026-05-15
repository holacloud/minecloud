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
        
        this.inventory = ['grass', 'dirt', 'cobblestone', 'wood', 'planks', 'brick', 'sand', 'leaves'];
        this.selectedSlot = 0;
        this.rtxModeEnabled = false;
        this.rtxTogglePresses = [];
        this.rtxToggleWindowMs = 1200;
        this.touchControlsEnabled = false;
        this.mobileMovePointerId = null;
        this.mobileLookPointerId = null;
        this.mobileLookLast = { x: 0, y: 0 };
        this.mobileJoystickTravel = 42;
        this.resetTouchJoystick = null;

        this.ambientLight = null;
        this.sunLight = null;
        this.hemiLight = null;
        
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
        this.handBasePosition = new THREE.Vector3(0.62, -0.72, -1.05);
        this.handBaseRotation = new THREE.Euler(-0.55, 0.2, 0.18);
        this.handSwingTime = 0;

        this.init();
    }
    
    init() {
        this.initThreeJS();
        this.initCamera();
        this.initWorld();
        this.applyRTXMode(false);
        this.initNetwork();
        this.initHotbar();
        this.initInput();
        
        document.getElementById('connecting').style.display = 'none';
        
        this.animate();
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
        
        this.hitIndicator = document.getElementById('hit-indicator');
        this.initViewModel();

        window.addEventListener('resize', () => this.onWindowResize());
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
    }
    
    initWorld() {
        this.world = new WorldRenderer(this.scene);
    }

    updateRTXStatus() {
        const statusEl = document.getElementById('rtx-status');
        if (!statusEl) return;

        statusEl.textContent = this.rtxModeEnabled ? 'On' : 'Off';
        statusEl.style.color = this.rtxModeEnabled ? '#7CE7FF' : '#FFFFFF';
    }

    createPlayerAvatarMaterial(color) {
        return this.rtxModeEnabled
            ? new THREE.MeshStandardMaterial({ color: color, roughness: 0.72, metalness: 0.03 })
            : new THREE.MeshLambertMaterial({ color: color });
    }

    createOtherPlayerAvatar() {
        const group = new THREE.Group();
        const createPart = (geometry, color, x, y, z) => {
            const mesh = new THREE.Mesh(geometry, this.createPlayerAvatarMaterial(color));
            mesh.position.set(x, y, z);
            mesh.castShadow = this.rtxModeEnabled;
            mesh.receiveShadow = this.rtxModeEnabled;
            mesh.userData.baseColor = color;
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

        group.userData.avatarParts = { head, torso, leftArm, rightArm, leftLeg, rightLeg };
        group.userData.lastPosition = new THREE.Vector3();
        group.userData.walkPhase = 0;
        return group;
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
        this.syncOtherPlayerShadows();
        this.updateRTXStatus();
        this.lastSelectionUpdate = 0;
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
        this.network.on('worldInit', (blocks) => this.world.loadBlocks(blocks));
        this.network.on('blockPlace', (payload) => this.world.addBlock(payload, payload.blockType));
        this.network.on('blockBreak', (payload) => this.world.removeBlockAt(payload.x, payload.y, payload.z));
        this.network.on('otherPlayerMove', (player) => this.updateOtherPlayer(player));

        const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${wsProtocol}://${window.location.host}/ws`;
        this.network.connect(wsUrl);
    }
    
    updateOtherPlayer(player) {
        let avatar = this.otherPlayerMeshes.get(player.id);
        if (!avatar) {
            avatar = this.createOtherPlayerAvatar();
            this.scene.add(avatar);
            this.otherPlayerMeshes.set(player.id, avatar);
        }

        const parts = avatar.userData.avatarParts;
        const nextFeetPosition = new THREE.Vector3(player.x, player.y - 1.62, player.z);
        if (!avatar.userData.initialized) {
            avatar.userData.lastPosition.copy(nextFeetPosition);
            avatar.userData.initialized = true;
        }

        const delta = avatar.userData.lastPosition.distanceTo(nextFeetPosition);

        avatar.userData.walkPhase += Math.min(0.7, delta * 8);
        avatar.userData.lastPosition.copy(nextFeetPosition);

        const stride = Math.min(0.9, delta * 14);
        const swing = Math.sin(avatar.userData.walkPhase) * stride;

        parts.leftArm.rotation.x = swing;
        parts.rightArm.rotation.x = -swing;
        parts.leftLeg.rotation.x = -swing;
        parts.rightLeg.rotation.x = swing;

        avatar.position.copy(nextFeetPosition);
        avatar.rotation.y = player.yaw;
    }
    
    initHotbar() {
        const hotbar = document.getElementById('hotbar');
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
            
            hotbar.appendChild(slot);
        });
    }
    
    initInput() {
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement !== this.renderer.domElement) {
                this.stopMining();
            }
        });
        window.addEventListener('blur', () => {
            this.stopMining();
            this.resetTouchTransientInput();
        });

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
        if (!this.cameraController.canInteract()) return;
        
        if (event.button === 0) {
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
        if (event.code === 'KeyR' && !event.repeat) {
            this.handleRTXShortcut();
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

        const direction = event.deltaY > 0 ? 1 : -1;
        const totalSlots = this.inventory.length;
        const nextSlot = (this.selectedSlot + direction + totalSlots) % totalSlots;
        this.selectSlot(nextSlot);
    }
    
    selectSlot(index) {
        this.selectedSlot = index;
        document.querySelectorAll('.hotbar-slot').forEach((el, i) => {
            el.classList.toggle('selected', i === index);
        });
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
        if (!this.world.removeBlockAt(position.x, position.y, position.z)) return false;

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
            const blockType = this.inventory[this.selectedSlot];
            if (!this.world.addBlock(newPos, blockType)) return;

            this.showHitIndicator();
            this.lastSelectionUpdate = 0;

            if (this.network.connected) {
                this.network.send('blockPlace', { x: newPos.x, y: newPos.y, z: newPos.z, blockType: blockType });
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
    }
    
    updateSelectionBox() {
        if (!this.cameraController.canInteract()) {
            this.selectionBox.visible = false;
            this.selectionBox.rotation.set(0, 0, 0);
            return;
        }

        const hit = this.raycastBlock(this.breakDistance);
        if (!hit) {
            this.selectionBox.visible = false;
            this.selectionBox.rotation.set(0, 0, 0);
            return;
        }

        const worldPos = this.world.getBlockPositionFromIntersection(hit);
        if (!worldPos) {
            this.selectionBox.visible = false;
            this.selectionBox.rotation.set(0, 0, 0);
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
        
        this.cameraController.update(delta);
        this.world.update(this.camera.position.x, this.camera.position.z);
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
