// Wildlife that does not walk on the ground. Fish swim in schools: they cruise towards a
// shared target, keep together without bumping into each other, dart away from the player
// and now and then leap out of the water. Mixed into Game.prototype; updateAmbientMobs
// hands swimming mobs to updateSwimmingMob.

const _swimDesired = new THREE.Vector3();
const _swimOffset = new THREE.Vector3();

Object.assign(Game.prototype, {
    // True when (x, y, z) is below the visible water surface.
    isSwimmable(x, y, z) {
        const bx = Math.floor(x);
        const by = Math.floor(y);
        const bz = Math.floor(z);
        if (this.world.getBlockTypeAt(bx, by, bz) !== 'water') return false;
        return y - by < WATER_SURFACE_HEIGHT - 0.15 || this.world.getBlockTypeAt(bx, by + 1, bz) === 'water';
    },

    // Nearest water column at least ~2 blocks deep within `radius` of (x, z), searching
    // outwards ring by ring. Returns its centre, bed and surface heights, or null.
    findWaterColumn(x, z, radius, topY) {
        for (let r = 0; r <= radius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const cx = Math.floor(x) + dx;
                    const cz = Math.floor(z) + dz;
                    const bed = this.cameraController.getFloorY(cx + 0.5, cz + 0.5, topY);
                    if (bed <= -20 || this.world.getBlockTypeAt(cx, Math.floor(bed), cz) !== 'water') continue;
                    let top = Math.floor(bed);
                    while (this.world.getBlockTypeAt(cx, top + 1, cz) === 'water') top++;
                    const surface = top + WATER_SURFACE_HEIGHT;
                    if (surface - bed >= 1.8) return { x: cx + 0.5, z: cz + 0.5, bed, surface };
                }
            }
        }
        return null;
    },

    spawnFishSchool(column, count) {
        const home = new THREE.Vector3(column.x, (column.bed + column.surface) / 2, column.z);
        const school = { home, target: home.clone(), retarget: 0, startled: 0, threat: new THREE.Vector3(), centroid: home.clone(), frame: -1, members: [] };
        const variant = Math.floor(Math.random() * MOB_SPECIES.fish.variants);
        for (let i = 0; i < count; i++) {
            const position = home.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.6));
            if (!this.isSwimmable(position.x, position.y, position.z)) position.copy(home);
            const fish = this.createMob('fish', position, { variant });
            fish.rotation.order = 'YXZ';
            fish.userData.school = school;
            fish.userData.velocity = new THREE.Vector3(Math.cos(fish.userData.direction), 0, Math.sin(fish.userData.direction)).multiplyScalar(0.4);
            fish.userData.jumpTimer = 20 + Math.random() * 60;
            school.members.push(fish);
            this.ambientMobs.push(fish);
        }
        return school.members;
    },

    // Natural spawning: some chunks with a lake or sea get a school.
    spawnFishForChunk(chunkX, chunkZ) {
        if (this.chunkRandom(chunkX, chunkZ, 4) > 0.45) return;
        const size = this.world.chunkSize;
        for (let attempt = 0; attempt < 4; attempt++) {
            const x = chunkX * size + 2 + this.chunkRandom(chunkX, chunkZ, 40 + attempt) * (size - 4);
            const z = chunkZ * size + 2 + this.chunkRandom(chunkX, chunkZ, 50 + attempt) * (size - 4);
            const column = this.findWaterColumn(x, z, 0, 64);
            if (!column) continue;
            const [minGroup, maxGroup] = MOB_SPECIES.fish.group;
            const count = minGroup + Math.floor(this.chunkRandom(chunkX, chunkZ, 5) * (maxGroup - minGroup + 1));
            this.spawnFishSchool(column, count).forEach((fish) => {
                fish.userData.natural = true;
                fish.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
            });
            return;
        }
    },

    // The whole school bolts away from `from`.
    startleSchool(mob, from) {
        const school = mob.userData.school;
        if (!school) return;
        school.startled = 1.4;
        school.threat.copy(from);
        school.retarget = 0;
    },

    updateSchool(school, delta) {
        if (school.frame === this.mobFrame) return;
        school.frame = this.mobFrame;
        school.members = school.members.filter((fish) => fish.parent);
        school.centroid.set(0, 0, 0);
        school.members.forEach((fish) => school.centroid.add(fish.position));
        if (school.members.length) school.centroid.divideScalar(school.members.length);
        school.startled = Math.max(0, school.startled - delta);

        school.retarget -= delta;
        if (school.retarget <= 0 || school.centroid.distanceTo(school.target) < 0.8) {
            school.retarget = 4 + Math.random() * 5;
            for (let attempt = 0; attempt < 10; attempt++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = 2 + Math.random() * 6;
                const x = school.home.x + Math.cos(angle) * distance;
                const z = school.home.z + Math.sin(angle) * distance;
                const y = school.home.y + (Math.random() - 0.5) * 2;
                if (this.isSwimmable(x, y, z)) {
                    school.target.set(x, y, z);
                    break;
                }
            }
        }
    },

    updateSwimmingMob(mob, delta, player) {
        const data = mob.userData;
        const position = mob.position;
        const velocity = data.velocity;
        data.life += delta;

        if (data.airborne) {
            this.updateFishOutOfWater(mob, delta);
        } else if (!this.isSwimmable(position.x, position.y, position.z)) {
            // Its water was removed, or it was hatched on land.
            data.airborne = true;
        } else {
            const school = data.school;
            this.updateSchool(school, delta);

            if (Math.hypot(position.x - player.x, position.y - player.y + 0.8, position.z - player.z) < 3.2) {
                this.startleSchool(mob, new THREE.Vector3(player.x, player.y - 0.8, player.z));
            }

            // Steering: head for the school target, stay near the others, avoid touching them.
            const desired = _swimDesired.copy(school.target).sub(position);
            if (desired.lengthSq() > 0.0001) desired.normalize();
            _swimOffset.copy(school.centroid).sub(position).multiplyScalar(0.5);
            if (_swimOffset.length() > 0.8) _swimOffset.setLength(0.8);
            desired.add(_swimOffset);
            for (const other of school.members) {
                if (other === mob) continue;
                _swimOffset.copy(position).sub(other.position);
                const distance = _swimOffset.length();
                if (distance > 0.0001 && distance < 0.6) desired.addScaledVector(_swimOffset, 0.35 / distance);
            }
            desired.x += Math.sin(data.life * 0.9 + data.stepPhase) * 0.3;
            desired.z += Math.cos(data.life * 0.7 + data.stepPhase) * 0.3;
            desired.y *= 0.5;

            const startled = school.startled > 0;
            if (startled) {
                _swimOffset.copy(position).sub(school.threat);
                _swimOffset.y *= 0.3;
                if (_swimOffset.lengthSq() > 0.0001) desired.addScaledVector(_swimOffset.normalize(), 3);
            }
            const speed = startled ? 3.6 : getMobSpecies('fish').speed;
            if (desired.lengthSq() > 0.0001) desired.setLength(speed);
            velocity.lerp(desired, 1 - Math.exp(-delta * (startled ? 7 : 2)));

            // Move axis by axis, bouncing off anything that is not water (including the
            // surface, so fish stay submerged), looking a little ahead of the snout.
            const ahead = 0.22;
            const nx = position.x + velocity.x * delta;
            if (this.isSwimmable(nx + Math.sign(velocity.x) * ahead, position.y, position.z)) position.x = nx;
            else { velocity.x *= -0.4; school.retarget = Math.min(school.retarget, 0.5); }
            const ny = position.y + velocity.y * delta;
            if (this.isSwimmable(position.x, ny + Math.sign(velocity.y) * 0.1, position.z)) position.y = ny;
            else velocity.y *= -0.4;
            const nz = position.z + velocity.z * delta;
            if (this.isSwimmable(position.x, position.y, nz + Math.sign(velocity.z) * ahead)) position.z = nz;
            else { velocity.z *= -0.4; school.retarget = Math.min(school.retarget, 0.5); }

            // Every so often a calm fish near the surface leaps out.
            data.jumpTimer -= delta;
            if (data.jumpTimer <= 0 && !startled) {
                data.jumpTimer = 25 + Math.random() * 60;
                const surface = this.findWaterSurface(position.x, position.y, position.z);
                if (surface !== null && surface - position.y < 1.4) {
                    const heading = Math.atan2(velocity.z, velocity.x);
                    velocity.set(Math.cos(heading) * 1.6, 4.4, Math.sin(heading) * 1.6);
                    data.airborne = true;
                    this.fishSplash(position.x, surface, position.z, 0.25);
                }
            }
        }

        // Face the direction of travel, nose pitched along the vertical speed.
        const horizontal = Math.hypot(velocity.x, velocity.z);
        if (horizontal > 0.05 && !data.stranded) mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.atan2(velocity.x, velocity.z), Math.min(1, delta * 6));
        const pitch = data.stranded ? 0 : THREE.MathUtils.clamp(Math.atan2(-velocity.y, Math.max(horizontal, 0.001)), data.airborne ? -1.3 : -0.6, data.airborne ? 1.3 : 0.6);
        mob.rotation.x += (pitch - mob.rotation.x) * Math.min(1, delta * 6);
        mob.rotation.z += ((data.stranded ? Math.PI / 2 : 0) - mob.rotation.z) * Math.min(1, delta * 8);

        // Tail beats faster with speed; the body counter-sways and the fins paddle.
        const speedNow = data.stranded ? 5 : velocity.length();
        data.stepPhase += delta * (6 + Math.min(speedNow, 5) * 6);
        const swing = Math.sin(data.stepPhase) * (0.22 + Math.min(speedNow, 4) * 0.12);
        if (data.tail[0]) data.tail[0].rotation.y = swing * 0.6;
        if (data.tail[1]) data.tail[1].rotation.y = swing;
        if (data.modelRoot) data.modelRoot.rotation.y = -swing * 0.15;
        data.wings.forEach((fin, index) => {
            const side = index === 0 ? 1 : -1;
            fin.rotation.z = fin.userData.baseRotation.z + Math.sin(data.life * 5 + index) * 0.3 * side;
        });
    },

    // Falling back after a leap, or stranded on land where it flops and eventually dies.
    updateFishOutOfWater(mob, delta) {
        const data = mob.userData;
        const position = mob.position;
        const velocity = data.velocity;
        velocity.y -= 14 * delta;
        const next = position.clone().addScaledVector(velocity, delta);

        if (velocity.y < 0 && this.isSwimmable(next.x, next.y, next.z)) {
            position.copy(next);
            const surface = this.findWaterSurface(next.x, next.y, next.z);
            if (!data.stranded && surface !== null) this.fishSplash(next.x, surface, next.z, 0.35);
            velocity.multiplyScalar(0.3);
            data.airborne = false;
            data.stranded = false;
            data.strandedTime = 0;
            return;
        }

        const floor = this.cameraController.getFloorY(next.x, next.z, position.y + 0.5);
        if (next.y - 0.12 <= floor) {
            // On the ground: lie on its side and flop about.
            position.set(next.x, floor + 0.12, next.z);
            data.stranded = true;
            data.strandedTime = (data.strandedTime || 0) + delta;
            velocity.set(0, 0, 0);
            data.flopTimer = (data.flopTimer || 0) - delta;
            if (data.flopTimer <= 0) {
                data.flopTimer = 0.5 + Math.random() * 0.8;
                const angle = Math.random() * Math.PI * 2;
                velocity.set(Math.cos(angle) * 0.8, 2.6, Math.sin(angle) * 0.8);
                position.y += 0.02;
            }
            if (data.strandedTime > 12) this.removeMob(mob);
            return;
        }
        position.copy(next);
    },

    fishSplash(x, surface, z, strength) {
        this.world.addRipple(x, z, strength);
        const player = this.getLocalPlayerPosition();
        const distance = Math.hypot(x - player.x, surface - player.y, z - player.z);
        if (distance > 24) return;
        this.spawnSplash(x, surface, z, strength * 0.4);
        this.playNoiseBurst({ duration: 0.1, volume: 0.02 * (1 - distance / 24), highpass: 700, lowpass: 3200 });
    },

    // /mob fish and fish eggs: a small school in the nearest water.
    spawnFishNear(x, z, topY, radius) {
        const column = this.findWaterColumn(x, z, radius, topY);
        if (!column) return null;
        return this.spawnFishSchool(column, 6);
    }
});
