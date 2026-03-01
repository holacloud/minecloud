class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        
        this.pitch = 0;
        this.yaw = 0;
        this.moveSpeed = 10;
        this.lookSpeed = 0.002;
        
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false
        };
        
        this.velocity = new THREE.Vector3();
        this.isLocked = false;
        
        this.init();
    }
    
    init() {
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        
        this.domElement.addEventListener('click', () => {
            this.domElement.requestPointerLock();
        });
        
        document.addEventListener('pointerlockchange', () => {
            this.isLocked = document.pointerLockElement === this.domElement;
        });
    }
    
    onKeyDown(event) {
        switch(event.code) {
            case 'KeyW': this.keys.forward = true; break;
            case 'KeyS': this.keys.backward = true; break;
            case 'KeyA': this.keys.left = true; break;
            case 'KeyD': this.keys.right = true; break;
            case 'Space': this.keys.jump = true; break;
        }
    }
    
    onKeyUp(event) {
        switch(event.code) {
            case 'KeyW': this.keys.forward = false; break;
            case 'KeyS': this.keys.backward = false; break;
            case 'KeyA': this.keys.left = false; break;
            case 'KeyD': this.keys.right = false; break;
            case 'Space': this.keys.jump = false; break;
        }
    }
    
    onMouseMove(event) {
        if (!this.isLocked) return;
        
        this.yaw -= event.movementX * this.lookSpeed;
        this.pitch -= event.movementY * this.lookSpeed;
        
        this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
    }
    
    update(delta) {
        const direction = new THREE.Vector3();
        
        if (this.keys.forward) direction.z -= 1;
        if (this.keys.backward) direction.z += 1;
        if (this.keys.left) direction.x -= 1;
        if (this.keys.right) direction.x += 1;
        
        direction.normalize();
        direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        
        this.velocity.x = direction.x * this.moveSpeed;
        this.velocity.z = direction.z * this.moveSpeed;
        
        if (this.keys.jump && this.onGround) {
            this.velocity.y = 8;
        }
        
        this.velocity.y -= 20 * delta;
        
        this.camera.position.x += this.velocity.x * delta;
        this.camera.position.y += this.velocity.y * delta;
        this.camera.position.z += this.velocity.z * delta;
        
        this.onGround = this.camera.position.y <= 3;
        if (this.camera.position.y < 3) {
            this.camera.position.y = 3;
            this.velocity.y = 0;
        }
        
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
    }
    
    getPosition() {
        return {
            x: this.camera.position.x,
            y: this.camera.position.y,
            z: this.camera.position.z,
            yaw: this.yaw,
            pitch: this.pitch
        };
    }
}
