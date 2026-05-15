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
        this.stepHeight = 1;
        this.crouchSpeedFactor = 0.45;
        this.standingEyeHeight = 1.62;
        this.crouchingEyeHeight = 1.32;
        this.collisionRadius = 0.24;
        
        this.keys = { forward: false, backward: false, left: false, right: false, jump: false, sprint: false, crouch: false };
        this.moveInput = { x: 0, y: 0 };
        this.lookInput = { deltaX: 0, deltaY: 0 };
        this.touchJump = false;
        this.touchSprint = false;
        this.touchControlsEnabled = false;
        this.sprintLatch = false;
        this.lastForwardTapAt = 0;
        
        this.velocityY = 0;
        this.isLocked = false;
        this.onGround = false;
        this.blockTypeGetter = null;
        this.isInWater = false;
        
        this.blockChecker = null;
        this.eyeHeight = this.standingEyeHeight;
        this.isCrouching = false;
        
        this.init();
    }
    
    setBlockChecker(fn) { this.blockChecker = fn; }
    setBlockTypeGetter(fn) { this.blockTypeGetter = fn; }
    setTouchControlsEnabled(enabled) { this.touchControlsEnabled = enabled; }
    setMoveInput(x, y) { this.moveInput.x = x; this.moveInput.y = y; }
    addLookDelta(deltaX, deltaY) { this.lookInput.deltaX += deltaX; this.lookInput.deltaY += deltaY; }
    setTouchJump(active) { this.touchJump = active; }
    setTouchSprint(active) { this.touchSprint = active; }
    setLookSpeed(speed) { this.lookSpeed = speed; }
    canInteract() { return this.isLocked || this.touchControlsEnabled; }
    
    init() {
        document.addEventListener('keydown', e => {
            if (this.canInteract() && (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' || e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'ControlLeft' || e.code === 'ControlRight')) {
                e.preventDefault();
            }
            if (e.code === 'KeyW' && !this.keys.forward) {
                const now = performance.now();
                if (now - this.lastForwardTapAt < 250) {
                    this.sprintLatch = true;
                }
                this.lastForwardTapAt = now;
            }
            if (e.code === 'KeyW') this.keys.forward = true;
            if (e.code === 'KeyS') this.keys.backward = true;
            if (e.code === 'KeyA') this.keys.left = true;
            if (e.code === 'KeyD') this.keys.right = true;
            if (e.code === 'Space') this.keys.jump = true;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.sprint = true;
            if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.keys.crouch = true;
        });
        
        document.addEventListener('keyup', e => {
            if (e.code === 'KeyW') this.keys.forward = false;
            if (e.code === 'KeyS') this.keys.backward = false;
            if (e.code === 'KeyA') this.keys.left = false;
            if (e.code === 'KeyD') this.keys.right = false;
            if (e.code === 'Space') this.keys.jump = false;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.sprint = false;
            if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.keys.crouch = false;
            if (e.code === 'KeyW') this.sprintLatch = false;
        });
        
        document.addEventListener('mousemove', e => {
            if (!this.isLocked) return;
            this.yaw -= e.movementX * this.lookSpeed;
            this.pitch -= e.movementY * this.lookSpeed;
            this.pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.pitch));
        });
        
        this.domElement.addEventListener('click', () => {
            if (!this.touchControlsEnabled) {
                const request = this.domElement.requestPointerLock();
                if (request && typeof request.catch === 'function') {
                    request.catch((error) => console.warn('Pointer lock unavailable', error));
                }
            }
        });
        document.addEventListener('pointerlockchange', () => this.isLocked = document.pointerLockElement === this.domElement);
    }
    
    hasBlock(x, y, z) {
        return this.blockChecker ? this.blockChecker(x, y, z) : false;
    }

    getBlockType(x, y, z) {
        return this.blockTypeGetter ? this.blockTypeGetter(x, y, z) : null;
    }

    isBlockedAtPosition(x, z, feetY) {
        const samples = [
            [0, 0],
            [this.collisionRadius, 0],
            [-this.collisionRadius, 0],
            [0, this.collisionRadius],
            [0, -this.collisionRadius]
        ];

        for (const [dx, dz] of samples) {
            const sx = Math.floor(x + dx);
            const sz = Math.floor(z + dz);
            if (this.hasBlock(sx, Math.floor(feetY), sz) || this.hasBlock(sx, Math.floor(feetY + 1.8), sz)) {
                return true;
            }
        }

        return false;
    }

    canStepUp(targetX, targetZ, feetY) {
        const stepBaseY = Math.floor(feetY);
        return this.hasBlock(Math.floor(targetX), stepBaseY, Math.floor(targetZ)) &&
            !this.hasBlock(Math.floor(targetX), stepBaseY + 1, Math.floor(targetZ)) &&
            !this.hasBlock(Math.floor(targetX), stepBaseY + 2, Math.floor(targetZ));
    }

    applyStepUp(stepBaseY) {
        this.camera.position.y = Math.max(this.camera.position.y, stepBaseY + this.stepHeight + this.eyeHeight);
        this.velocityY = Math.max(0, this.velocityY);
        this.onGround = true;
    }

    wouldStepOffLedge(targetX, targetZ, currentFloorY) {
        const nextFloorY = this.getFloorY(targetX, targetZ, currentFloorY + 1);
        return nextFloorY < currentFloorY - 0.1;
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
        const wasCrouching = this.isCrouching;
        this.isCrouching = this.keys.crouch;
        if (wasCrouching !== this.isCrouching) {
            const previousEyeHeight = this.eyeHeight;
            this.eyeHeight = this.isCrouching ? this.crouchingEyeHeight : this.standingEyeHeight;
            if (this.onGround) {
                this.camera.position.y += this.eyeHeight - previousEyeHeight;
            }
        }

        this.yaw -= this.lookInput.deltaX * this.lookSpeed;
        this.pitch -= this.lookInput.deltaY * this.lookSpeed;
        this.pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.pitch));
        this.lookInput.deltaX = 0;
        this.lookInput.deltaY = 0;

        const isSprinting = this.keys.sprint || this.touchSprint || (this.sprintLatch && this.keys.forward && !this.keys.backward);
        const feetBlockType = this.getBlockType(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y - this.eyeHeight), Math.floor(this.camera.position.z));
        const torsoBlockType = this.getBlockType(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y - this.eyeHeight + 1), Math.floor(this.camera.position.z));
        const eyeBlockType = this.getBlockType(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y), Math.floor(this.camera.position.z));
        this.isInWater = eyeBlockType === 'water';

        const baseSpeed = this.isCrouching ? this.moveSpeed * this.crouchSpeedFactor : (isSprinting ? this.sprintSpeed : this.moveSpeed);
        const speed = this.isInWater ? baseSpeed * 0.55 : baseSpeed;
        
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        
        const right = new THREE.Vector3(1, 0, 0);
        right.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        
        let moveX = 0, moveZ = 0;
        if (this.keys.forward) { moveX += forward.x; moveZ += forward.z; }
        if (this.keys.backward) { moveX -= forward.x; moveZ -= forward.z; }
        if (this.keys.left) { moveX -= right.x; moveZ -= right.z; }
        if (this.keys.right) { moveX += right.x; moveZ += right.z; }
        if (this.moveInput.y !== 0) { moveX += forward.x * this.moveInput.y; moveZ += forward.z * this.moveInput.y; }
        if (this.moveInput.x !== 0) { moveX += right.x * this.moveInput.x; moveZ += right.z * this.moveInput.x; }
        
        if (moveX !== 0 || moveZ !== 0) {
            const len = Math.sqrt(moveX*moveX + moveZ*moveZ);
            moveX = (moveX / len) * speed * delta;
            moveZ = (moveZ / len) * speed * delta;
            
            const px = this.camera.position.x;
            const pz = this.camera.position.z;
            const py = this.camera.position.y - this.eyeHeight;
            const currentFloorY = this.getFloorY(px, pz, py);
            
            const newX = px + moveX;
            if (this.isCrouching && this.onGround && this.wouldStepOffLedge(newX, pz, currentFloorY)) {
                // Sneak movement prevents falling off ledges.
            } else if (!this.isBlockedAtPosition(newX, pz, py)) {
                this.camera.position.x = newX;
            } else if ((this.onGround || this.velocityY <= 0.2) && this.canStepUp(newX, pz, py)) {
                this.applyStepUp(Math.floor(py));
                this.camera.position.x = newX;
            }
            
            const newZ = pz + moveZ;
            if (this.isCrouching && this.onGround && this.wouldStepOffLedge(this.camera.position.x, newZ, currentFloorY)) {
                // Sneak movement prevents falling off ledges.
            } else if (!this.isBlockedAtPosition(this.camera.position.x, newZ, py)) {
                this.camera.position.z = newZ;
            } else if ((this.onGround || this.velocityY <= 0.2) && this.canStepUp(this.camera.position.x, newZ, py)) {
                this.applyStepUp(Math.floor(py));
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
        
        if (this.isInWater) {
            if (this.keys.jump || this.touchJump) {
                this.velocityY = Math.min(3.2, this.velocityY + 0.42);
            } else {
                this.velocityY = Math.max(-1.4, this.velocityY - 0.06);
            }
        } else if ((this.keys.jump || this.touchJump) && this.onGround) {
            this.velocityY = this.jumpVelocity;
            this.onGround = false;
        }
        
        this.velocityY -= (this.isInWater ? 5.5 : 20) * delta;
        
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
        
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
    }

    setPosition(position) {
        this.camera.position.set(position.x, position.y, position.z);
        this.yaw = position.yaw ?? this.yaw;
        this.pitch = position.pitch ?? this.pitch;
        this.velocityY = 0;
        this.onGround = false;
    }
    
    getPosition() {
        return { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z, yaw: this.yaw, pitch: this.pitch };
    }
}
