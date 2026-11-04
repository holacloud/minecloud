class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        
        this.pitch = 0;
        this.yaw = 0;
        this.moveSpeed = 4.5;
        this.sprintSpeed = 6;
        this.jumpVelocity = 7.25;
        // Fraction of the downward speed water absorbs per block crossed (v * e^(-drag * depth)),
        // so the faster the entry, the harder it brakes; ~2 blocks stop even very long falls.
        this.waterDrag = 1;
        // Downward speed at the last landing, consumed by fall damage.
        this.landingSpeed = 0;
        this.lookSpeed = 0.002;
        // Walk up slabs automatically; full blocks still need a jump.
        this.stepHeight = 0.55;
        this.crouchSpeedFactor = 0.45;
        this.standingEyeHeight = 1.62;
        this.crouchingEyeHeight = 1.32;
        this.bodyHeight = 1.8;
        this.collisionRadius = 0.16;
        
        this.keys = { forward: false, backward: false, left: false, right: false, jump: false, sprint: false, crouch: false };
        this.moveInput = { x: 0, y: 0 };
        this.turnInput = 0;
        this.lookInput = { deltaX: 0, deltaY: 0 };
        this.touchJump = false;
        this.touchSprint = false;
        this.touchControlsEnabled = false;
        this.sprintLatch = false;
        this.lastForwardTapAt = 0;
        
        this.velocityY = 0;
        // Free flight (creative mode only, toggled by double-tapping Space): no gravity, Space
        // rises, Shift sinks, faster horizontal speed. `flightAllowed` is set by the game.
        this.flightAllowed = false;
        this.flying = false;
        this.lastJumpTapAt = -Infinity;
        // Horizontal push from being hit (blocks per second), decaying quickly.
        this.knockbackX = 0;
        this.knockbackZ = 0;
        this.isLocked = false;
        // Jump forgiveness: a press shortly before landing, or shortly after walking off an
        // edge, still jumps (frames where the player is briefly airborne would eat it).
        this.jumpBufferMs = 150;
        this.coyoteTimeMs = 100;
        this.jumpPressedAt = -Infinity;
        this.lastGroundedAt = -Infinity;
        this.onGround = false;
        // After joining or respawning the player waits for terrain and then floats down gently.
        this.spawnSettling = true;
        this.blockTypeGetter = null;
        this.isInWater = false;
        
        this.blockChecker = null;
        this.blockHeightGetter = null;
        // (x, y, z) -> collision boxes of that cell (see setCollisionBoxGetter).
        this.collisionBoxGetter = null;
        // Step-ups (slabs, stairs) lift the body at once; the view follows over a few frames
        // so stairs feel like a ramp. Physics never sees this offset (see update).
        this.stepSmoothing = 0;
        this.eyeHeight = this.standingEyeHeight;
        this.isCrouching = false;
        this.isOnLadder = false;
        // While riding, the mount's settings (see setMount) replace the player's body and gait.
        this.mount = null;
        // While sitting: where the eye stays, { x, y, z } (see setSeat).
        this.seat = null;
        
        this.init();
    }
    
    setBlockChecker(fn) { this.blockChecker = fn; }
    setBlockTypeGetter(fn) { this.blockTypeGetter = fn; }
    setBlockHeightGetter(fn) { this.blockHeightGetter = fn; }
    // fn(x, y, z) returns the boxes [x0, y0, z0, x1, y1, z1] (relative to the cell's minimum
    // corner, y up to 1.5) that block movement in that cell; it replaces the height getter.
    setCollisionBoxGetter(fn) { this.collisionBoxGetter = fn; }
    setTouchControlsEnabled(enabled) { this.touchControlsEnabled = enabled; }
    setMoveInput(x, y) { this.moveInput.x = x; this.moveInput.y = y; }
    // -1..1 from the touch joystick: turns the body left or right at TOUCH_TURN_RATE.
    setTurnInput(turn) { this.turnInput = turn; }
    addLookDelta(deltaX, deltaY) { this.lookInput.deltaX += deltaX; this.lookInput.deltaY += deltaY; }
    setTouchJump(active) { this.touchJump = active; }
    setTouchSprint(active) { this.touchSprint = active; }
    setLookSpeed(speed) { this.lookSpeed = speed; }
    canInteract() { return this.isLocked || this.touchControlsEnabled; }

    // A new press of the jump control (Space or the touch Jump button): buffers the jump, and
    // a double tap toggles free flight where it is allowed.
    pressJump(now = performance.now()) {
        this.jumpPressedAt = now;
        if (this.flightAllowed && !this.mount && now - this.lastJumpTapAt < 300) {
            this.flying = !this.flying;
            this.velocityY = 0;
            this.lastJumpTapAt = -Infinity;
        } else {
            this.lastJumpTapAt = now;
        }
    }
    
    init() {
        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyW' && this.canInteract()) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);

        document.addEventListener('keydown', e => {
            if (this.canInteract() && (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' || e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight')) {
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
            if (e.code === 'Space') {
                if (!e.repeat) this.pressJump();
                this.keys.jump = true;
            }
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.crouch = true;
        });
        
        document.addEventListener('keyup', e => {
            // Space released on a focused button would "click" it instead of jumping.
            if (e.code === 'Space' && this.canInteract()) e.preventDefault();
            if (e.code === 'KeyW') this.keys.forward = false;
            if (e.code === 'KeyS') this.keys.backward = false;
            if (e.code === 'KeyA') this.keys.left = false;
            if (e.code === 'KeyD') this.keys.right = false;
            if (e.code === 'Space') this.keys.jump = false;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.crouch = false;
            if (e.code === 'KeyW') this.sprintLatch = false;
        });
        
        document.addEventListener('mousemove', e => {
            if (!this.isLocked) return;
            this.yaw -= e.movementX * this.lookSpeed;
            this.pitch -= e.movementY * this.lookSpeed;
            this.pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.pitch));
        });
        
        // Pointer lock is requested by the game (one request at a time); this only tracks it.
        document.addEventListener('pointerlockchange', () => this.isLocked = document.pointerLockElement === this.domElement);
    }
    
    hasBlock(x, y, z) {
        return this.blockChecker ? this.blockChecker(x, y, z) : false;
    }

    getBlockType(x, y, z) {
        return this.blockTypeGetter ? this.blockTypeGetter(x, y, z) : null;
    }

    // Solid height of a block cell: 1 for full blocks, 0.5 for slabs, 0 for none.
    getBlockHeight(x, y, z) {
        if (this.blockHeightGetter) return this.blockHeightGetter(x, y, z);
        return this.hasBlock(x, y, z) ? 1 : 0;
    }

    // Collision boxes of a cell, relative to its minimum corner. Without a box getter, a block
    // is one box as tall as its height.
    getCellBoxes(x, y, z) {
        if (this.collisionBoxGetter) return this.collisionBoxGetter(x, y, z);
        const height = this.getBlockHeight(x, y, z);
        return height > 0 ? [[0, 0, 0, 1, height, 1]] : [];
    }

    // Footprints ({ minX, maxX, minZ, maxZ }) of the boxes that overlap a body standing at feetY.
    getCollisionBlocks(x, z, feetY) {
        const blocks = [];
        const r = this.collisionRadius;
        const minX = Math.floor(x - r);
        const maxX = Math.floor(x + r);
        const minZ = Math.floor(z - r);
        const maxZ = Math.floor(z + r);
        const bottom = feetY + 0.02;
        const top = feetY + this.bodyHeight - 0.02;
        // One layer lower too: fences and gates reach half a block into the cell above them.
        const minY = Math.floor(bottom) - 1;
        const maxY = Math.floor(top);

        for (let by = minY; by <= maxY; by++) {
            for (let bx = minX; bx <= maxX; bx++) {
                for (let bz = minZ; bz <= maxZ; bz++) {
                    for (const box of this.getCellBoxes(bx, by, bz)) {
                        if (by + box[4] <= bottom || by + box[1] >= top) continue;
                        const block = { minX: bx + box[0], maxX: bx + box[3], minZ: bz + box[2], maxZ: bz + box[5] };
                        if (block.maxX <= x - r || block.minX >= x + r || block.maxZ <= z - r || block.minZ >= z + r) continue;
                        blocks.push(block);
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
                const { minX, maxX, minZ, maxZ } = block;
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

    // Whether a block of the given height placed at (x, y, z) would overlap the body of a
    // player whose eyes are at `eye` (head included, so the camera never ends up in a block).
    intersectsBody(eye, x, y, z, height = 1) {
        return this.intersectsBoxes(eye, x, y, z, [[0, 0, 0, 1, height, 1]]);
    }

    // Same for a shaped block: its boxes (relative to the cell (x, y, z)).
    intersectsBoxes(eye, x, y, z, boxes) {
        const r = this.collisionRadius;
        const px = eye.x;
        const pz = eye.z;
        const feetY = eye.y - this.eyeHeight;
        const topY = Math.max(feetY + this.bodyHeight, eye.y + 0.15);
        const epsilon = 0.001;
        return boxes.some((box) => px + r > x + box[0] + epsilon && px - r < x + box[3] - epsilon &&
            pz + r > z + box[2] + epsilon && pz - r < z + box[5] - epsilon &&
            topY > y + box[1] + epsilon && feetY < y + box[4] - epsilon);
    }

    canStandAt(x, z, feetY) {
        return this.getCollisionBlocks(x, z, feetY).length === 0;
    }

    applyStepUp(targetFeetY) {
        const rise = targetFeetY + this.eyeHeight - this.camera.position.y;
        this.stepSmoothing = Math.max(-0.6, this.stepSmoothing - rise);
        this.camera.position.y = targetFeetY + this.eyeHeight;
        this.velocityY = Math.max(0, this.velocityY);
        this.onGround = true;
    }

    wouldStepOffLedge(targetX, targetZ, currentFloorY) {
        const nextFloorY = this.getSupportFloorY(targetX, targetZ, currentFloorY + 1);
        return nextFloorY < currentFloorY - 0.1;
    }
    
    // Highest floor under any part of the player's footprint, so the player is supported
    // as long as some of it overlaps a block (edges, slabs, steps). Corner floors above
    // `maxFloorY` are walls the footprint pokes into, not support. While falling, pass the
    // feet height before the move so the floor being stood on is not mistaken for a wall.
    getSupportFloorY(x, z, startY, maxFloorY = startY) {
        const r = this.collisionRadius - 0.01;
        let floor = this.getFloorY(x, z, startY);
        for (const [dx, dz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
            const cornerFloor = this.getFloorY(x + dx, z + dz, startY);
            if (cornerFloor <= maxFloorY + 0.001) floor = Math.max(floor, cornerFloor);
        }
        return floor;
    }

    // Starts (mount = { eyeHeight, speed, autoJump, jump }) or stops (null) riding, keeping
    // the feet where they are: the eye rises to the saddle and the body grows to cover the mount.
    setMount(mount) {
        const feetY = this.camera.position.y - this.eyeHeight;
        this.mount = mount;
        this.isCrouching = false;
        this.eyeHeight = mount ? mount.eyeHeight : this.standingEyeHeight;
        this.bodyHeight = mount ? mount.eyeHeight + 0.2 : 1.8;
        this.collisionRadius = mount ? 0.4 : 0.16;
        this.camera.position.y = feetY + this.eyeHeight;
    }

    // Sits (seat = { x, y, z }, the eye's position) or stands up (null). A seated player does not
    // move, fall, jump or crouch, and only looks around (js/game/seating.js).
    setSeat(seat) {
        this.seat = seat;
        this.flying = false;
        this.isCrouching = false;
        this.eyeHeight = this.standingEyeHeight;
        this.stepSmoothing = 0;
        this.velocityY = 0;
        this.knockbackX = 0;
        this.knockbackZ = 0;
        if (seat) this.camera.position.set(seat.x, seat.y, seat.z);
    }

    // Shoves the player along (dirX, dirZ) and pops them slightly into the air.
    applyKnockback(dirX, dirZ, strength, lift = 4) {
        const length = Math.hypot(dirX, dirZ) || 1;
        this.knockbackX = dirX / length * strength;
        this.knockbackZ = dirZ / length * strength;
        if (this.onGround) {
            this.velocityY = lift;
            this.onGround = false;
        }
    }

    // Top of the highest box under the point (x, z), searching down from the cell at startY.
    // Points beside a thin box (a pane, a fence post) fall through to the floor below it.
    getFloorY(x, z, startY) {
        const ix = Math.floor(x);
        const iz = Math.floor(z);
        const lx = x - ix;
        const lz = z - iz;
        for (let y = Math.floor(startY); y >= -16; y--) {
            let top = -Infinity;
            for (const box of this.getCellBoxes(ix, y, iz)) {
                if (lx >= box[0] && lx <= box[3] && lz >= box[2] && lz <= box[5]) top = Math.max(top, box[4]);
            }
            if (top > -Infinity) return y + top;
        }
        return -100;
    }
    
    // Runs the physics on the real eye position, then lowers the view by what is left of the
    // last step-up's smoothing.
    update(delta) {
        this.camera.position.y -= this.stepSmoothing;
        this.updatePhysics(delta);
        this.stepSmoothing *= Math.exp(-delta * 16);
        if (Math.abs(this.stepSmoothing) < 0.002 || this.isOnLadder || this.mount) this.stepSmoothing = 0;
        this.camera.position.y += this.stepSmoothing;
    }

    updatePhysics(delta) {
        const wasCrouching = this.isCrouching;
        if (!this.flightAllowed || this.mount || this.seat) this.flying = false;
        this.isCrouching = this.keys.crouch && !this.mount && !this.flying && !this.seat;
        if (wasCrouching !== this.isCrouching) {
            const previousEyeHeight = this.eyeHeight;
            this.eyeHeight = this.isCrouching ? this.crouchingEyeHeight : this.standingEyeHeight;
            if (this.onGround) {
                this.camera.position.y += this.eyeHeight - previousEyeHeight;
            }
        }

        // Full joystick turn: about 150 degrees a second, scaled by the look sensitivity.
        this.yaw -= this.turnInput * 2.6 * (this.lookSpeed / 0.002) * delta;
        this.yaw -= this.lookInput.deltaX * this.lookSpeed;
        this.pitch -= this.lookInput.deltaY * this.lookSpeed;
        this.pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.pitch));
        this.lookInput.deltaX = 0;
        this.lookInput.deltaY = 0;

        if (this.spawnSettling && !this.updateSpawnSettling(delta)) {
            this.camera.rotation.order = 'YXZ';
            this.camera.rotation.y = this.yaw;
            this.camera.rotation.x = this.pitch;
            return;
        }

        if (this.seat) {
            this.camera.position.set(this.seat.x, this.seat.y, this.seat.z);
            this.velocityY = 0;
            this.knockbackX = 0;
            this.knockbackZ = 0;
            this.onGround = true;
            this.isInWater = false;
            this.isOnLadder = false;
            this.camera.rotation.order = 'YXZ';
            this.camera.rotation.y = this.yaw;
            this.camera.rotation.x = this.pitch;
            return;
        }

        const isSprinting = this.keys.sprint || this.touchSprint || (this.sprintLatch && this.keys.forward && !this.keys.backward);
        const torsoBlockType = this.getBlockType(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y - this.eyeHeight + 1), Math.floor(this.camera.position.z));
        const eyeBlockType = this.getBlockType(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y), Math.floor(this.camera.position.z));
        const feetBlockType = this.getBlockType(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y - this.eyeHeight), Math.floor(this.camera.position.z));
        this.isInWater = feetBlockType === 'water' || torsoBlockType === 'water' || eyeBlockType === 'water';
        this.isOnLadder = !this.mount && (feetBlockType === 'ladder' || torsoBlockType === 'ladder' || eyeBlockType === 'ladder');

        let baseSpeed = this.isCrouching ? this.moveSpeed * this.crouchSpeedFactor : (isSprinting ? this.sprintSpeed : this.moveSpeed);
        if (this.mount) baseSpeed = this.mount.speed * (isSprinting ? 1.25 : 1);
        if (this.flying) baseSpeed = isSprinting ? 22 : 10;
        const speed = this.isInWater ? baseSpeed * (this.mount ? 0.35 : 0.55) : baseSpeed;
        
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
            const currentFloorY = this.getSupportFloorY(px, pz, py);

            let targetX = px + moveX;
            let targetZ = pz + moveZ;
            let blockedByLedge = false;
            if (this.isCrouching && this.onGround && this.wouldStepOffLedge(targetX, targetZ, currentFloorY)) {
                // Sneaking never walks off a ledge; slide along it on whichever axis stays supported.
                if (!this.wouldStepOffLedge(targetX, pz, currentFloorY)) targetZ = pz;
                else if (!this.wouldStepOffLedge(px, targetZ, currentFloorY)) targetX = px;
                else blockedByLedge = true;
            }
            if (!blockedByLedge) {
                const resolved = this.resolveHorizontalPosition(targetX, targetZ, py);
                // A mount hops up one-block steps by itself.
                if (this.mount && resolved.collided && this.onGround && !this.isInWater &&
                    !this.resolveHorizontalPosition(targetX, targetZ, py + 1.05).collided && this.canStandAt(px, pz, py + 1.05)) {
                    this.velocityY = this.mount.autoJump;
                    this.onGround = false;
                }
                if (resolved.collided && this.onGround) {
                    const stepFeetY = py + this.stepHeight;
                    const stepped = this.resolveHorizontalPosition(targetX, targetZ, stepFeetY);
                    const steppedFloorY = this.getSupportFloorY(stepped.x, stepped.z, stepFeetY);
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
        
        if (this.knockbackX !== 0 || this.knockbackZ !== 0) {
            const resolved = this.resolveHorizontalPosition(
                this.camera.position.x + this.knockbackX * delta,
                this.camera.position.z + this.knockbackZ * delta,
                this.camera.position.y - this.eyeHeight
            );
            this.camera.position.x = resolved.x;
            this.camera.position.z = resolved.z;
            const decay = Math.exp(-delta * 5);
            this.knockbackX *= decay;
            this.knockbackZ *= decay;
            if (Math.hypot(this.knockbackX, this.knockbackZ) < 0.05) this.knockbackX = this.knockbackZ = 0;
        }

        const feetY = this.camera.position.y - this.eyeHeight;
        const floorY = this.getSupportFloorY(this.camera.position.x, this.camera.position.z, feetY);
        
        if (feetY <= floorY + 0.001 && this.velocityY <= 0) {
            this.camera.position.y = floorY + this.eyeHeight;
            this.recordLanding();
            this.onGround = true;
        } else {
            this.onGround = false;
        }
        
        if (this.flying) {
            const up = this.keys.jump || this.touchJump;
            const down = this.keys.crouch;
            this.velocityY = up ? (isSprinting ? 14 : 8) : down ? -(isSprinting ? 14 : 8) : 0;
            this.onGround = false;
        } else if (this.isOnLadder) {
            const wantsUp = this.keys.forward || this.keys.jump || this.moveInput.y > 0.05;
            const wantsDown = this.keys.backward || this.keys.crouch || this.moveInput.y < -0.05;
            this.velocityY = wantsUp ? 3.2 : wantsDown ? -2.2 : 0;
            this.onGround = true;
        } else if (this.isInWater) {
            if (this.keys.jump || this.touchJump) {
                this.velocityY = Math.min(4.8, this.velocityY + 0.85);
            } else if (this.velocityY < -1.0) {
                // Drag proportional to speed: the distance covered this frame removes a fraction of it.
                const distance = -this.velocityY * delta;
                this.velocityY = Math.min(-1.0, this.velocityY * Math.exp(-this.waterDrag * distance));
            } else {
                this.velocityY = Math.max(-1.0, this.velocityY - 0.04);
            }
        } else {
            const now = performance.now();
            if (this.onGround) this.lastGroundedAt = now;
            const wantsJump = this.keys.jump || this.touchJump || now - this.jumpPressedAt < this.jumpBufferMs;
            const canJump = this.onGround || (now - this.lastGroundedAt < this.coyoteTimeMs && this.velocityY <= 0);
            if (wantsJump && canJump) {
                this.velocityY = this.mount ? this.mount.jump : this.jumpVelocity;
                this.onGround = false;
                this.jumpPressedAt = -Infinity;
                this.lastGroundedAt = -Infinity;
            }
        }
        
        if (!this.isOnLadder && !this.flying) {
            this.velocityY -= (this.isInWater ? 3.2 : 20) * delta;
        }
        
        const currentFeetY = this.camera.position.y - this.eyeHeight;
        const newY = this.camera.position.y + this.velocityY * delta;
        const newFeetY = newY - this.eyeHeight;
        
        if (this.velocityY < 0) {
            const newFloorY = this.getSupportFloorY(this.camera.position.x, this.camera.position.z, newFeetY, currentFeetY);
            if (newFeetY <= newFloorY + 0.001) {
                this.camera.position.y = newFloorY + this.eyeHeight;
                this.recordLanding();
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

    // Returns true once normal physics should take over. Until then the player hangs in place
    // while the chunk below is generated, is lifted out if the spawn point ended up inside
    // terrain, and otherwise descends at a gentle, damage-free speed.
    updateSpawnSettling(delta) {
        const x = this.camera.position.x;
        const z = this.camera.position.z;
        const feetY = this.camera.position.y - this.eyeHeight;
        this.velocityY = 0;
        this.onGround = false;

        const surfaceY = this.getFloorY(x, z, 256);
        if (surfaceY < -50) return false;

        if (this.hasBlock(Math.floor(x), Math.floor(feetY), Math.floor(z)) ||
            this.hasBlock(Math.floor(x), Math.floor(feetY + 1), Math.floor(z))) {
            this.camera.position.y = surfaceY + this.eyeHeight;
            this.finishSpawnSettling();
            return false;
        }

        const floorY = this.getFloorY(x, z, feetY);
        const gap = feetY - floorY;
        if (gap <= 0.001) {
            this.finishSpawnSettling();
            return true;
        }

        const descent = Math.min(gap, Math.max(6, gap * 2.5) * delta);
        this.camera.position.y -= descent;
        if (descent >= gap) {
            this.finishSpawnSettling();
        }
        return false;
    }

    recordLanding() {
        if (!this.onGround) this.landingSpeed = Math.max(this.landingSpeed, -this.velocityY);
        this.velocityY = 0;
    }

    // Returns the impact speed of the most recent landing once, then forgets it.
    consumeLandingSpeed() {
        const speed = this.landingSpeed;
        this.landingSpeed = 0;
        return speed;
    }

    finishSpawnSettling() {
        this.spawnSettling = false;
        this.velocityY = 0;
        this.onGround = true;
    }

    setPosition(position) {
        this.seat = null;
        this.stepSmoothing = 0;
        this.camera.position.set(position.x, position.y, position.z);
        this.yaw = position.yaw ?? this.yaw;
        this.pitch = position.pitch ?? this.pitch;
        this.velocityY = 0;
        this.onGround = false;
        this.landingSpeed = 0;
        this.spawnSettling = true;
    }
    
    getPosition() {
        return { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z, yaw: this.yaw, pitch: this.pitch };
    }
}
