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
        this.mouse = new THREE.Vector2();
        
        this.selectedBlock = null;
        this.breakDistance = 6;
        this.placeDistance = 6;
        
        this.inventory = ['grass', 'dirt', 'stone', 'wood', 'leaves', 'sand'];
        this.selectedSlot = 0;
        
        this.otherPlayerMeshes = new Map();
        this.playerGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.6, 8);
        this.playerMaterial = new THREE.MeshLambertMaterial({ color: 0xe74c3c });
        
        this.init();
    }
    
    init() {
        this.initThreeJS();
        this.initCamera();
        this.initWorld();
        this.initNetwork();
        this.initInventory();
        this.initInput();
        
        document.getElementById('connecting').style.display = 'none';
        
        this.animate();
    }
    
    initThreeJS() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.scene.fog = new THREE.Fog(0x87ceeb, 10, 80);
        
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 4, 0);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        
        document.getElementById('game-container').appendChild(this.renderer.domElement);
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        this.scene.add(directionalLight);
        
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    initCamera() {
        this.cameraController = new CameraController(
            this.camera,
            this.renderer.domElement
        );
    }
    
    initWorld() {
        this.world = new WorldRenderer(this.scene);
    }
    
    initNetwork() {
        console.log('Initializing network, host:', window.location.host);
        this.network = new NetworkClient();
        const wsUrl = `ws://${window.location.host}/ws`;
        console.log('Connecting to:', wsUrl);
        this.network.connect(wsUrl);
        
        this.network.on('worldInit', (blocks) => {
            this.world.loadBlocks(blocks);
        });
        
        this.network.on('blockPlace', (payload) => {
            this.world.addBlock(payload, payload.blockType);
        });
        
        this.network.on('blockBreak', (payload) => {
            this.world.removeBlockAt(payload.x, payload.y, payload.z);
        });
        
        this.network.on('otherPlayerMove', (player) => {
            this.updateOtherPlayer(player);
        });
    }
    
    updateOtherPlayer(player) {
        let mesh = this.otherPlayerMeshes.get(player.id);
        
        if (!mesh) {
            mesh = new THREE.Mesh(this.playerGeometry, this.playerMaterial);
            this.scene.add(mesh);
            this.otherPlayerMeshes.set(player.id, mesh);
        }
        
        mesh.position.set(player.x, player.y + 0.8, player.z);
        mesh.rotation.y = player.yaw;
    }
    
    initInventory() {
        const container = document.getElementById('inventory');
        this.inventory.forEach((blockType, index) => {
            const slot = document.createElement('div');
            slot.className = 'inv-slot' + (index === 0 ? ' selected' : '');
            slot.dataset.index = index;
            slot.style.backgroundColor = '#' + this.world.blockTypes[blockType].color.toString(16).padStart(6, '0');
            slot.title = this.world.blockTypes[blockType].name;
            
            const number = document.createElement('span');
            number.className = 'slot-number';
            number.textContent = index + 1;
            slot.appendChild(number);
            
            container.appendChild(slot);
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
        if (event.key >= '1' && event.key <= '9') {
            const slot = parseInt(event.key) - 1;
            if (slot < this.inventory.length) {
                this.selectSlot(slot);
            }
        }
    }
    
    selectSlot(index) {
        this.selectedSlot = index;
        const slots = document.querySelectorAll('.inv-slot');
        slots.forEach((slot, i) => {
            slot.classList.toggle('selected', i === index);
        });
    }
    
    breakBlock() {
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        
        const blocks = this.world.getAllBlocks();
        const intersects = this.raycaster.intersectObjects(blocks);
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            if (hit.distance <= this.breakDistance) {
                const block = hit.object;
                const pos = this.world.getBlockPosition(block);
                
                this.world.removeBlock(block);
                
                if (this.network.connected) {
                    this.network.send('blockBreak', {
                        x: pos.x,
                        y: pos.y,
                        z: pos.z
                    });
                }
            }
        }
    }
    
    placeBlock() {
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        
        const blocks = this.world.getAllBlocks();
        const intersects = this.raycaster.intersectObjects(blocks);
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            if (hit.distance <= this.placeDistance) {
                const normal = hit.face.normal;
                const block = hit.object;
                
                const newPos = {
                    x: block.parent.position.x + block.position.x + normal.x,
                    y: block.parent.position.y + block.position.y + normal.y,
                    z: block.parent.position.z + block.position.z + normal.z
                };
                
                if (newPos.y >= 0) {
                    const blockType = this.inventory[this.selectedSlot];
                    this.world.addBlock(newPos, blockType);
                    
                    if (this.network.connected) {
                        this.network.send('blockPlace', {
                            x: newPos.x,
                            y: newPos.y,
                            z: newPos.z,
                            blockType: blockType
                        });
                    }
                }
            }
        }
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
            const fps = Math.round(this.frameCount * 1000 / (now - this.lastFpsUpdate));
            document.getElementById('fps').textContent = `FPS: ${fps}`;
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
        
        const pos = this.cameraController.getPosition();
        document.getElementById('position').textContent = 
            `X: ${pos.x.toFixed(1)} Y: ${pos.y.toFixed(1)} Z: ${pos.z.toFixed(1)}`;
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const delta = Math.min(this.clock.getDelta(), 0.1);
        
        this.cameraController.update(delta);
        this.world.update(this.camera.position.x, this.camera.position.z);
        
        if (this.network.connected && this.frameCount % 10 === 0) {
            this.network.updatePosition(this.cameraController.getPosition());
        }
        
        this.updateUI();
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('load', () => {
    new Game();
});
