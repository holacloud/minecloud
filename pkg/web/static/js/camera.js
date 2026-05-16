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
        this.bodyHeight = 1.8;
        this.collisionRadius = 0.16;
        
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
        this.isOnLadder = false;
        
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
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyW' && this.canInteract()) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);

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

    getCollisionBlocks(x, z, feetY) {
        const blocks = [];
        const minX = Math.floor(x - this.collisionRadius);
        const maxX = Math.floor(x + this.collisionRadius);
        const minZ = Math.floor(z - this.collisionRadius);
        const maxZ = Math.floor(z + this.collisionRadius);
        const minY = Math.floor(feetY + 0.02);
        const maxY = Math.floor(feetY + this.bodyHeight - 0.02);

        for (let by = minY; by <= maxY; by++) {
            for (let bx = minX; bx <= maxX; bx++) {
                for (let bz = minZ; bz <= maxZ; bz++) {
                    if (this.hasBlock(bx, by, bz)) {
                        blocks.push({ x: bx, z: bz });
                    }
                }
            }
        }

        return blocks;
    }

    resolveHorizontalPosition(x, z, feetY) {
        let resolvedX = x;
        let resolvedZ = z;
        let collided = false;

        for (let pass = 0; pass < 3; pass++) {
            let moved = false;
            const blocks = this.getCollisionBlocks(resolvedX, resolvedZ, feetY);
            for (const block of blocks) {
                const minX = block.x;
                const maxX = block.x + 1;
                const minZ = block.z;
                const maxZ = block.z + 1;
                const closestX = Math.max(minX, Math.min(resolvedX, maxX));
                const closestZ = Math.max(minZ, Math.min(resolvedZ, maxZ));
                let dx = resolvedX - closestX;
                let dz = resolvedZ - closestZ;
                let distanceSq = dx * dx + dz * dz;

                if (distanceSq === 0) {
                    const pushLeft = Math.abs(resolvedX - minX);
                    const pushRight = Math.abs(maxX - resolvedX);
                    const pushBack = Math.abs(resolvedZ - minZ);
                    const pushForward = Math.abs(maxZ - resolvedZ);
                    const minPush = Math.min(pushLeft, pushRight, pushBack, pushForward);

                    if (minPush === pushLeft) dx = -1;
                    else if (minPush === pushRight) dx = 1;
                    else if (minPush === pushBack) dz = -1;
                    else dz = 1;
                    distanceSq = 1;
                }

                if (distanceSq < this.collisionRadius * this.collisionRadius) {
                    const distance = Math.sqrt(distanceSq);
                    const push = this.collisionRadius - distance + 0.001;
                    resolvedX += (dx / distance) * push;
                    resolvedZ += (dz / distance) * push;
                    collided = true;
                    moved = true;
                }
            }

            if (!moved) break;
        }

        return { x: resolvedX, z: resolvedZ, collided };
    }

    canStandAt(x, z, feetY) {
        return this.getCollisionBlocks(x, z, feetY).length === 0;
    }

    applyStepUp(targetFeetY) {
        this.camera.position.y = targetFeetY + this.eyeHeight;
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
        const torsoBlockType = this.getBlockType(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y - this.eyeHeight + 1), Math.floor(this.camera.position.z));
        const eyeBlockType = this.getBlockType(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y), Math.floor(this.camera.position.z));
        const feetBlockType = this.getBlockType(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y - this.eyeHeight), Math.floor(this.camera.position.z));
        this.isInWater = feetBlockType === 'water' || torsoBlockType === 'water' || eyeBlockType === 'water';
        this.isOnLadder = feetBlockType === 'ladder' || torsoBlockType === 'ladder' || eyeBlockType === 'ladder';

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

            const targetX = px + moveX;
            const targetZ = pz + moveZ;
            if (this.isCrouching && this.onGround && this.wouldStepOffLedge(targetX, targetZ, currentFloorY)) {
                // Sneak movement prevents falling off ledges.
            } else {
                const resolved = this.resolveHorizontalPosition(targetX, targetZ, py);
                if (resolved.collided && this.onGround) {
                    const stepFeetY = py + this.stepHeight;
                    const stepped = this.resolveHorizontalPosition(targetX, targetZ, stepFeetY);
                    const steppedFloorY = this.getFloorY(stepped.x, stepped.z, stepFeetY);
                    if (steppedFloorY > currentFloorY + 0.001 && steppedFloorY <= currentFloorY + this.stepHeight + 0.001 && this.canStandAt(stepped.x, stepped.z, steppedFloorY)) {
                        this.applyStepUp(steppedFloorY);
                        this.camera.position.x = stepped.x;
                        this.camera.position.z = stepped.z;
                    } else {
                        this.camera.position.x = resolved.x;
                        this.camera.position.z = resolved.z;
                    }
                } else {
                    this.camera.position.x = resolved.x;
                    this.camera.position.z = resolved.z;
                }
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
        
        if (this.isOnLadder) {
            const wantsUp = this.keys.forward || this.keys.jump || this.moveInput.y > 0.05;
            const wantsDown = this.keys.backward || this.keys.crouch || this.moveInput.y < -0.05;
            this.velocityY = wantsUp ? 3.2 : wantsDown ? -2.2 : 0;
            this.onGround = true;
        } else if (this.isInWater) {
            if (this.keys.jump || this.touchJump) {
                this.velocityY = Math.min(4.8, this.velocityY + 0.85);
            } else {
                this.velocityY = Math.max(-1.0, this.velocityY - 0.04);
            }
        } else if ((this.keys.jump || this.touchJump) && this.onGround) {
            this.velocityY = this.jumpVelocity;
            this.onGround = false;
        }
        
        if (!this.isOnLadder) {
            this.velocityY -= (this.isInWater ? 3.2 : 20) * delta;
        }
        
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
        } else if (this.canStandAt(this.camera.position.x, this.camera.position.z, newFeetY)) {
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
