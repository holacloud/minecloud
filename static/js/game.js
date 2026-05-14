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
        this.lastFpsUpdate = 0;
        
        this.raycaster = new THREE.Raycaster();
        
        this.breakDistance = 4.5;
        this.placeDistance = 4.5;
        
        this.inventory = ['grass', 'dirt', 'cobblestone', 'wood', 'planks', 'brick', 'sand', 'leaves'];
        this.selectedSlot = 0;
        
        this.otherPlayerMeshes = new Map();
        this.playerGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8);
        this.playerMaterial = new THREE.MeshLambertMaterial({ color: 0xFFCC00 });
        
        this.selectionBox = null;
        this.hitIndicator = null;
        
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
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
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
        
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    initCamera() {
        this.cameraController = new CameraController(this.camera, this.renderer.domElement);
        this.cameraController.setWorldGetter(() => this.world.getAllBlocks());
    }
    
    initWorld() {
        this.world = new WorldRenderer(this.scene);
    }
    
    initNetwork() {
        this.network = new NetworkClient();
        const wsUrl = `ws://${window.location.host}/ws`;
        this.network.connect(wsUrl);
        
        this.network.on('worldInit', (blocks) => this.world.loadBlocks(blocks));
        this.network.on('blockPlace', (payload) => this.world.addBlock(payload, payload.blockType));
        this.network.on('blockBreak', (payload) => this.world.removeBlockAt(payload.x, payload.y, payload.z));
        this.network.on('otherPlayerMove', (player) => this.updateOtherPlayer(player));
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
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
    }
    
    onMouseDown(event) {
        if (!this.cameraController.isLocked) return;
        
        if (event.button === 0) {
            this.breakBlock();
        } else if (event.button === 2) {
            this.placeBlock();
        }
    }
    
    onKeyDown(event) {
        const slot = parseInt(event.key) - 1;
        if (slot >= 0 && slot < this.inventory.length) {
            this.selectSlot(slot);
        }
    }
    
    selectSlot(index) {
        this.selectedSlot = index;
        document.querySelectorAll('.hotbar-slot').forEach((el, i) => {
            el.classList.toggle('selected', i === index);
        });
    }
    
    breakBlock() {
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const blocks = this.world.getAllBlocks();
        const intersects = this.raycaster.intersectObjects(blocks);
        
        if (intersects.length > 0 && intersects[0].distance <= this.breakDistance) {
            const hit = intersects[0];
            const block = hit.object;
            const pos = this.world.getBlockPosition(block);
            
            this.showHitIndicator();
            this.world.removeBlock(block);
            
            if (this.network.connected) {
                this.network.send('blockBreak', { x: pos.x, y: pos.y, z: pos.z });
            }
        }
    }
    
    placeBlock() {
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const blocks = this.world.getAllBlocks();
        const intersects = this.raycaster.intersectObjects(blocks);
        
        if (intersects.length > 0 && intersects[0].distance <= this.placeDistance) {
            const hit = intersects[0];
            const normal = hit.face.normal;
            const block = hit.object;
            
            const newPos = {
                x: Math.round(block.parent.position.x + block.position.x + normal.x),
                y: Math.round(block.parent.position.y + block.position.y + normal.y),
                z: Math.round(block.parent.position.z + block.position.z + normal.z)
            };
            
            if (newPos.y >= 0) {
                const blockType = this.inventory[this.selectedSlot];
                this.world.addBlock(newPos, blockType);
                
                this.showHitIndicator();
                
                if (this.network.connected) {
                    this.network.send('blockPlace', { x: newPos.x, y: newPos.y, z: newPos.z, blockType: blockType });
                }
            }
        }
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
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const blocks = this.world.getAllBlocks();
        const intersects = this.raycaster.intersectObjects(blocks);
        
        if (intersects.length > 0 && intersects[0].distance <= this.breakDistance) {
            const hit = intersects[0];
            const block = hit.object;
            const worldPos = this.world.getBlockPosition(block);
            
            this.selectionBox.position.set(worldPos.x + 0.5, worldPos.y + 0.5, worldPos.z + 0.5);
            this.selectionBox.visible = true;
        } else {
            this.selectionBox.visible = false;
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const delta = Math.min(this.clock.getDelta(), 0.1);
        
        this.cameraController.update(delta);
        this.world.update(this.camera.position.x, this.camera.position.z);
        
        this.updateSelectionBox();
        
        if (this.network.connected && this.frameCount % 20 === 0) {
            this.network.updatePosition(this.cameraController.getPosition());
        }
        
        this.updateUI();
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('load', () => new Game());
