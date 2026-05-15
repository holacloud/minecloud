class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        
        this.pitch = 0;
        this.yaw = 0;
        this.moveSpeed = 4.5;
        this.sprintSpeed = 6;
        this.jumpVelocity = 7.25;
        this.lookSpeed = 0.002;
        
        this.keys = { forward: false, backward: false, left: false, right: false, jump: false, sprint: false };
        
        this.velocityY = 0;
        this.isLocked = false;
        this.onGround = false;
        
        this.blockChecker = null;
        this.eyeHeight = 1.62;
        
        this.init();
    }
    
    setBlockChecker(fn) { this.blockChecker = fn; }
    
    init() {
        document.addEventListener('keydown', e => {
            if (e.code === 'KeyW') this.keys.forward = true;
            if (e.code === 'KeyS') this.keys.backward = true;
            if (e.code === 'KeyA') this.keys.left = true;
            if (e.code === 'KeyD') this.keys.right = true;
            if (e.code === 'Space') this.keys.jump = true;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.sprint = true;
        });
        
        document.addEventListener('keyup', e => {
            if (e.code === 'KeyW') this.keys.forward = false;
            if (e.code === 'KeyS') this.keys.backward = false;
            if (e.code === 'KeyA') this.keys.left = false;
            if (e.code === 'KeyD') this.keys.right = false;
            if (e.code === 'Space') this.keys.jump = false;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.sprint = false;
        });
        
        document.addEventListener('mousemove', e => {
            if (!this.isLocked) return;
            this.yaw -= e.movementX * this.lookSpeed;
            this.pitch -= e.movementY * this.lookSpeed;
            this.pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.pitch));
        });
        
        this.domElement.addEventListener('click', () => this.domElement.requestPointerLock());
        document.addEventListener('pointerlockchange', () => this.isLocked = document.pointerLockElement === this.domElement);
    }
    
    hasBlock(x, y, z) {
        return this.blockChecker ? this.blockChecker(x, y, z) : false;
    }
    
    getFloorY(x, z, startY) {
        const ix = Math.floor(x);
        const iz = Math.floor(z);
        for (let y = Math.floor(startY); y >= -5; y--) {
            if (this.hasBlock(ix, y, iz)) return y + 1;
        }
        return -100;
    }
    
    update(delta) {
        const speed = this.keys.sprint ? this.sprintSpeed : this.moveSpeed;
        
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        
        const right = new THREE.Vector3(1, 0, 0);
        right.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        
        let moveX = 0, moveZ = 0;
        if (this.keys.forward) { moveX += forward.x; moveZ += forward.z; }
        if (this.keys.backward) { moveX -= forward.x; moveZ -= forward.z; }
        if (this.keys.left) { moveX -= right.x; moveZ -= right.z; }
        if (this.keys.right) { moveX += right.x; moveZ += right.z; }
        
        if (moveX !== 0 || moveZ !== 0) {
            const len = Math.sqrt(moveX*moveX + moveZ*moveZ);
            moveX = (moveX / len) * speed * delta;
            moveZ = (moveZ / len) * speed * delta;
            
            const px = this.camera.position.x;
            const pz = this.camera.position.z;
            const py = this.camera.position.y - this.eyeHeight;
            
            const newX = px + moveX;
            if (!this.hasBlock(Math.floor(newX), Math.floor(py), Math.floor(pz)) &&
                !this.hasBlock(Math.floor(newX), Math.floor(py + 1.8), Math.floor(pz))) {
                this.camera.position.x = newX;
            }
            
            const newZ = pz + moveZ;
            if (!this.hasBlock(Math.floor(this.camera.position.x), Math.floor(py), Math.floor(newZ)) &&
                !this.hasBlock(Math.floor(this.camera.position.x), Math.floor(py + 1.8), Math.floor(newZ))) {
                this.camera.position.z = newZ;
            }
        }
        
        const feetY = this.camera.position.y - this.eyeHeight;
        const floorY = this.getFloorY(this.camera.position.x, this.camera.position.z, feetY);
        
        if (feetY <= floorY + 0.001 && this.velocityY <= 0) {
            this.camera.position.y = floorY + this.eyeHeight;
            this.velocityY = 0;
            this.onGround = true;
        } else {
            this.onGround = false;
        }
        
        if (this.keys.jump && this.onGround) {
            this.velocityY = this.jumpVelocity;
            this.onGround = false;
        }
        
        this.velocityY -= 20 * delta;
        
        const newY = this.camera.position.y + this.velocityY * delta;
        const newFeetY = newY - this.eyeHeight;
        
        if (this.velocityY < 0) {
            const newFloorY = this.getFloorY(this.camera.position.x, this.camera.position.z, newFeetY);
            if (newFeetY <= newFloorY + 0.001) {
                this.camera.position.y = newFloorY + this.eyeHeight;
                this.velocityY = 0;
                this.onGround = true;
            } else {
                this.camera.position.y = newY;
            }
        } else if (!this.hasBlock(Math.floor(this.camera.position.x), Math.floor(newY + 1.8), Math.floor(this.camera.position.z))) {
            this.camera.position.y = newY;
        } else {
            this.velocityY = 0;
        }
        
        if (this.camera.position.y < -30) {
            this.camera.position.set(0, 20, 0);
            this.velocityY = 0;
        }
        
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
    }
    
    getPosition() {
        return { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z, yaw: this.yaw, pitch: this.pitch };
    }
}
