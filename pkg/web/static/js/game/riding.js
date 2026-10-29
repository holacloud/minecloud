// Riding. Right-clicking a mount (a species with `mount` in MOB_SPECIES) puts the player in
// the saddle: the camera controller takes over the mount's speed, size and jumps, the mob
// follows the player's position, and Shift gets off. Other players see the mount under the
// rider: playerMove carries `mount` ("species:variant") and `mountYaw`, and each remote avatar
// keeps its own copy of the mount's model.
// Mixed into Game.prototype.

Object.assign(Game.prototype, {
    // Mounts the mob under the crosshair, if it can be ridden. Returns whether it did.
    tryMountMob() {
        if (this.ridingMob) return false;
        const mob = this.raycastMob(4);
        if (!mob || !getMobSpecies(mob.userData.species).mount) return false;
        const controller = this.cameraController;
        const position = controller.camera.position;
        const previous = { x: position.x, y: position.y, z: position.z };
        position.set(mob.position.x, mob.position.y + controller.eyeHeight, mob.position.z);
        controller.setMount(getMobSpecies(mob.userData.species).mount);
        if (!controller.canStandAt(position.x, position.z, mob.position.y)) {
            // No headroom for horse and rider.
            controller.setMount(null);
            position.set(previous.x, previous.y, previous.z);
            this.receiveSystemMessage({ text: `There is no room to ride the ${mob.userData.species} here` });
            return true;
        }
        controller.velocityY = 0;
        controller.yaw = mob.rotation.y - Math.PI;
        this.ridingMob = mob;
        mob.userData.rider = true;
        mob.userData.natural = false;
        mob.userData.resting = 0;
        mob.userData.clop = 0;
        this.playNeigh(mob);
        this.receiveSystemMessage({ text: `Riding a ${mob.userData.species}: Space jumps, Shift gets off` });
        return true;
    },

    dismount() {
        const mob = this.ridingMob;
        if (!mob) return;
        const controller = this.cameraController;
        const position = controller.camera.position;
        this.ridingMob = null;
        mob.userData.rider = false;
        mob.position.set(position.x, position.y - controller.eyeHeight, position.z);
        mob.userData.home.copy(mob.position);
        mob.userData.moveTimer = 3;
        controller.setMount(null);
        // Step off to whichever side has room.
        const heading = mob.userData.direction;
        for (const side of [1, -1]) {
            const x = mob.position.x + Math.cos(heading + side * Math.PI / 2) * 0.9;
            const z = mob.position.z + Math.sin(heading + side * Math.PI / 2) * 0.9;
            const floor = controller.getFloorY(x, z, mob.position.y + 1);
            if (floor > -20 && Math.abs(floor - mob.position.y) < 1.1 && controller.canStandAt(x, z, floor)) {
                position.set(x, floor + controller.eyeHeight, z);
                break;
            }
        }
    },

    // What playerMove reports about the mount, or null when on foot.
    getMountState() {
        const mob = this.ridingMob;
        if (!mob) return null;
        return { key: `${mob.userData.species}:${mob.userData.variant}`, yaw: mob.rotation.y };
    },

    // The ridden mob stands where the player's feet are, facing the way it moves.
    updateRiddenMob(mob, delta) {
        const controller = this.cameraController;
        const data = mob.userData;
        if (this.respawnPending) {
            this.dismount();
            return;
        }
        const position = controller.camera.position;
        const dx = position.x - mob.position.x;
        const dz = position.z - mob.position.z;
        const speed = Math.hypot(dx, dz) / Math.max(delta, 0.001);
        mob.position.set(position.x, position.y - controller.eyeHeight, position.z);
        if (speed > 0.4) {
            let heading = Math.atan2(dz, dx);
            // Backing up: keep facing the way the rider looks.
            const lookHeading = Math.atan2(-Math.cos(controller.yaw), -Math.sin(controller.yaw));
            if (Math.cos(heading - lookHeading) < -0.3) heading += Math.PI;
            data.direction = heading;
        }
        mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.PI / 2 - data.direction, Math.min(1, delta * 8));
        this.animateMount(mob, speed, !controller.onGround && !controller.isInWater, delta);

        // Hoof beats.
        if (controller.onGround && speed > 0.4) {
            data.clop += speed * delta;
            if (data.clop > (speed > 6 ? 0.9 : 0.7)) {
                data.clop = 0;
                this.playTone({ frequency: 520 + Math.random() * 120, duration: 0.025, type: 'square', volume: 0.012, release: 0.04 });
                this.playNoiseBurst({ duration: 0.03, volume: 0.012, highpass: 600, lowpass: 2600 });
            }
        }
    },

    // Walk, trot or gallop with the speed; legs tucked in the air.
    animateMount(mob, speed, airborne, delta) {
        const data = mob.userData;
        data.stepPhase += delta * Math.min(speed, 12) * 1.3;
        this.animateMobRig(mob, speed > 0.4 ? 1 : 0, delta);
        if (airborne) {
            data.legs.forEach((leg, index) => { leg.rotation.x = leg.userData.baseRotation.x + (index < 2 ? -0.9 : 0.9); });
        }
    },

    // Rider on the saddle: legs astride, hands on the reins.
    poseRider(avatar) {
        const parts = avatar.userData.avatarParts;
        if (!parts) return;
        parts.leftLeg.rotation.set(-0.55, 0, 0.55);
        parts.rightLeg.rotation.set(-0.55, 0, -0.55);
        parts.leftArm.rotation.x = -0.6;
        parts.rightArm.rotation.x = -0.6;
        parts.leftArm.rotation.z = -0.15;
        parts.rightArm.rotation.z = 0.15;
    },

    playNeigh(mob) {
        const tone = getMobSpecies(mob.userData.species).tone;
        this.playTone({ frequency: tone * 2.2, endFrequency: tone * 1.4, duration: 0.35, type: 'sawtooth', volume: 0.012, attack: 0.03, release: 0.12, detune: 25 });
        this.playTone({ frequency: tone * 1.6, endFrequency: tone, duration: 0.5, type: 'triangle', volume: 0.012, attack: 0.05, release: 0.15 });
    },

    // Keeps a remote avatar's mount (from its playerMove `mount`) in sync.
    syncRemoteMount(avatar, mountKey, mountYaw) {
        const current = avatar.userData.mountMob;
        if (current && current.userData.mountKey === mountKey) {
            avatar.userData.mountYaw = mountYaw || 0;
            return;
        }
        if (current) {
            this.removeMob(current);
            avatar.userData.mountMob = null;
        }
        const [species, variant] = (mountKey || '').split(':');
        if (!getMobSpecies(species) || !getMobSpecies(species).mount) return;
        const mob = this.createMob(species, avatar.position.clone(), { variant: Number(variant) || 0 });
        mob.userData.rider = true;
        mob.userData.mountKey = mountKey;
        mob.rotation.y = mountYaw || 0;
        avatar.userData.mountMob = mob;
        avatar.userData.mountYaw = mountYaw || 0;
    },

    // Places a remote rider's mount under them and animates both.
    updateRemoteMount(avatar, previousPosition, delta) {
        const mob = avatar.userData.mountMob;
        const seat = getMobSpecies(mob.userData.species).mount.seat;
        const dx = avatar.position.x - previousPosition.x;
        const dz = avatar.position.z - previousPosition.z;
        const speed = Math.hypot(dx, dz) / Math.max(delta, 0.001);
        const rising = avatar.position.y - previousPosition.y;
        mob.position.set(avatar.position.x, avatar.position.y - seat, avatar.position.z);
        mob.rotation.y = this.lerpAngle(mob.rotation.y, avatar.userData.mountYaw, Math.min(1, delta * 10));
        avatar.rotation.y = mob.rotation.y;
        // Off the ground when rising, or well above the floor below.
        const floor = this.cameraController.getFloorY(mob.position.x, mob.position.z, mob.position.y + 0.5);
        this.animateMount(mob, speed, rising > 0.01 || mob.position.y - floor > 0.3, delta);
        this.poseRider(avatar);
    }
});
