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
        
        this.otherPlayerMeshes = new Map();
        this.playerGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8);
        this.playerMaterial = new THREE.MeshLambertMaterial({ color: 0xFFCC00 });

        this.selectionBox = null;
        this.hitIndicator = null;

        this.isBreakInputActive = false;
        this.miningTargetKey = null;
        this.miningTargetDuration = 0;
        this.miningProgress = 0;

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
        
        const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.6);
        this.scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xFFFFA0, 0.8);
        dirLight.position.set(100, 150, 50);
        this.scene.add(dirLight);
        
        const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x3D5C3D, 0.4);
        this.scene.add(hemiLight);
        
        const selectionGeom = new THREE.BoxGeometry(1.002, 1.002, 1.002);
        const selectionEdges = new THREE.EdgesGeometry(selectionGeom);
        this.selectionBox = new THREE.LineSegments(
            selectionEdges,
            new THREE.LineBasicMaterial({ color: 0x000000 })
        );
        this.selectionBox.visible = false;
        this.scene.add(this.selectionBox);
        
        this.hitIndicator = document.getElementById('hit-indicator');
        this.initViewModel();

        window.addEventListener('resize', () => this.onWindowResize());
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
    
    initCamera() {
        this.cameraController = new CameraController(this.camera, this.renderer.domElement);
        this.cameraController.setBlockChecker((x, y, z) => this.world.hasSolidBlock(x, y, z));
    }
    
    initWorld() {
        this.world = new WorldRenderer(this.scene);
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
        let mesh = this.otherPlayerMeshes.get(player.id);
        if (!mesh) {
            mesh = new THREE.Mesh(this.playerGeometry, this.playerMaterial);
            this.scene.add(mesh);
            this.otherPlayerMeshes.set(player.id, mesh);
        }
        mesh.position.set(player.x, player.y, player.z);
        mesh.rotation.y = player.yaw;
    }
    
    initHotbar() {
        const hotbar = document.getElementById('hotbar');
        this.inventory.forEach((blockType, index) => {
            const slot = document.createElement('div');
            slot.className = 'hotbar-slot' + (index === 0 ? ' selected' : '');
            slot.dataset.index = index;
            slot.style.backgroundColor = '#' + this.world.blockTypes[blockType].color.toString(16).padStart(6, '0');
            
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
        window.addEventListener('blur', () => this.stopMining());
    }
    
    onMouseDown(event) {
        if (!this.cameraController.isLocked) return;
        
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
    }

    stopMining() {
        this.isBreakInputActive = false;
        this.resetMiningTarget();
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
        if (!this.isBreakInputActive || !this.cameraController.isLocked) {
            this.resetMiningTarget();
            return;
        }

        const hit = this.raycastBlock(this.breakDistance);
        if (!hit) {
            this.resetMiningTarget();
            return;
        }

        const worldPos = this.world.getBlockPositionFromIntersection(hit);
        if (!worldPos) {
            this.resetMiningTarget();
            return;
        }

        const breakDuration = this.world.getBreakDurationAt(worldPos.x, worldPos.y, worldPos.z);
        if (!breakDuration || !Number.isFinite(breakDuration)) {
            this.resetMiningTarget();
            return;
        }

        const targetKey = `${worldPos.x},${worldPos.y},${worldPos.z}`;
        if (targetKey !== this.miningTargetKey) {
            this.miningTargetKey = targetKey;
            this.miningTargetDuration = breakDuration;
            this.miningProgress = 0;
            return;
        }

        this.miningProgress += delta;
        if (this.miningProgress < this.miningTargetDuration) {
            return;
        }

        this.finishBreakingBlock(worldPos);
        this.resetMiningTarget();
    }
    
    showHitIndicator() {
        this.hitIndicator.style.opacity = '1';
        setTimeout(() => { this.hitIndicator.style.opacity = '0'; }, 100);
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
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
        if (!this.cameraController.isLocked) {
            this.selectionBox.visible = false;
            return;
        }

        const hit = this.raycastBlock(this.breakDistance);
        if (!hit) {
            this.selectionBox.visible = false;
            return;
        }

        const worldPos = this.world.getBlockPositionFromIntersection(hit);
        if (!worldPos) {
            this.selectionBox.visible = false;
            return;
        }
        
        this.selectionBox.position.set(worldPos.x + 0.5, worldPos.y + 0.5, worldPos.z + 0.5);
        if (this.miningTargetKey === `${worldPos.x},${worldPos.y},${worldPos.z}` && this.miningTargetDuration > 0) {
            const progress = Math.min(1, this.miningProgress / this.miningTargetDuration);
            this.selectionBox.material.color.setRGB(0.35 + progress * 0.5, 0.15 + progress * 0.2, 0.05);
        } else {
            this.selectionBox.material.color.setHex(0x000000);
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
