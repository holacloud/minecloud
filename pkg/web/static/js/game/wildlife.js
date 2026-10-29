// Wildlife that does not walk on the ground. Fish swim in schools: they cruise towards a
// shared target, keep together without bumping into each other, dart away from the player
// and now and then leap out of the water. Frogs hop along the shore, swim at the surface,
// flee into the water and croak at night. Turtles plod along beaches, go for long swims
// (surfacing to breathe) and hide in their shell when frightened. Mixed into
// Game.prototype; updateAmbientMobs hands these mobs to updateSwimmingMob,
// updateHoppingMob and updateAmphibiousMob.

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
    },
    // A land spot (bank) with water within two blocks, for frogs and turtles; `ground` is
    // the block it stands on.
    findShoreSpot(x, z) {
        const bx = Math.floor(x);
        const bz = Math.floor(z);
        const floor = this.cameraController.getFloorY(bx + 0.5, bz + 0.5, 64);
        if (floor <= -20 || this.world.getBlockTypeAt(bx, Math.floor(floor), bz) === 'water') return null;
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                if (this.world.getBlockTypeAt(bx + dx, Math.floor(floor) - 1, bz + dz) === 'water') {
                    const ground = this.world.getBlockTypeAt(bx, Math.floor(floor) - 1, bz);
                    return { x: bx + 0.5, y: floor, z: bz + 0.5, ground, water: new THREE.Vector3(bx + dx + 0.5, floor, bz + dz + 0.5) };
                }
            }
        }
        return null;
    },

    // Natural spawning on banks: frogs wherever it is green, turtles on sandy beaches.
    spawnShoreMobsForChunk(chunkX, chunkZ, biome) {
        if (biome === 'rocky') return;
        if (biome !== 'desert') this.spawnShoreGroup(chunkX, chunkZ, 'frog', 6, 0.35);
        this.spawnShoreGroup(chunkX, chunkZ, 'turtle', 8, 0.2, (spot) => spot.ground === 'sand');
    },

    spawnShoreGroup(chunkX, chunkZ, species, salt, chance, accepts = () => true) {
        if (this.chunkRandom(chunkX, chunkZ, salt) > chance) return;
        const size = this.world.chunkSize;
        for (let attempt = 0; attempt < 8; attempt++) {
            const x = chunkX * size + 1 + this.chunkRandom(chunkX, chunkZ, salt * 10 + attempt) * (size - 2);
            const z = chunkZ * size + 1 + this.chunkRandom(chunkX, chunkZ, salt * 10 + 10 + attempt) * (size - 2);
            const spot = this.findShoreSpot(x, z);
            if (!spot || !accepts(spot)) continue;
            const [minGroup, maxGroup] = MOB_SPECIES[species].group;
            const count = minGroup + Math.floor(this.chunkRandom(chunkX, chunkZ, salt + 1) * (maxGroup - minGroup + 1));
            for (let i = 0; i < count; i++) {
                const mob = this.createMob(species, new THREE.Vector3(spot.x + (Math.random() - 0.5) * 0.6, spot.y, spot.z + (Math.random() - 0.5) * 0.6));
                mob.userData.pond = spot.water;
                mob.userData.natural = true;
                mob.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
                this.ambientMobs.push(mob);
            }
            return;
        }
    },

    // Launches a hop towards `heading` (radians, from +x towards +z). Picks a higher arc to
    // climb one block, and refuses ledges that are too tall or too deep.
    startHop(mob, heading, distance, speed) {
        const data = mob.userData;
        const position = mob.position;
        const tx = position.x + Math.cos(heading) * distance;
        const tz = position.z + Math.sin(heading) * distance;
        // Landing in water is always fine, however deep it is.
        const water = this.findWaterSurface(tx, position.y - 0.4, tz);
        const floor = water ?? this.cameraController.getFloorY(tx, tz, position.y + 1.6);
        const rise = floor - position.y;
        if (floor <= -20 || rise > 1.05 || rise < -3.5) return false;
        const up = rise > 0.2 ? 6.6 : 4.6;
        data.velocity.set(Math.cos(heading) * speed, up, Math.sin(heading) * speed);
        data.airborne = true;
        data.facing = heading;
        return true;
    },

    // Tries the preferred heading first, then a few turns away from it.
    hopSomewhere(mob, heading, distance, speed) {
        for (const turn of [0, 0.6, -0.6, 1.3, -1.3, Math.PI]) {
            if (this.startHop(mob, heading + turn, distance, speed)) return true;
        }
        return false;
    },

    updateHoppingMob(mob, delta, player) {
        const data = mob.userData;
        const position = mob.position;
        if (!data.velocity) data.velocity = new THREE.Vector3();
        const velocity = data.velocity;
        data.life += delta;
        if (data.facing === undefined) data.facing = Math.random() * Math.PI * 2;
        data.hopTimer = (data.hopTimer ?? 1 + Math.random() * 3) - delta;
        const awayFromPlayer = Math.atan2(position.z - player.z, position.x - player.x);
        const scared = Math.hypot(position.x - player.x, position.z - player.z) < 3.5 && Math.abs(player.y - 1.6 - position.y) < 3;
        const surface = this.findWaterSurface(position.x, position.y + 0.3, position.z);
        if (surface !== null) data.pond = data.pond || position.clone();

        if (data.airborne) {
            velocity.y -= 18 * delta;
            const nx = position.x + velocity.x * delta;
            const nz = position.z + velocity.z * delta;
            // Stop against walls instead of passing through them.
            if (!this.world.hasSolidBlock(Math.floor(nx), Math.floor(position.y + 0.15), Math.floor(position.z))) position.x = nx;
            if (!this.world.hasSolidBlock(Math.floor(position.x), Math.floor(position.y + 0.15), Math.floor(nz))) position.z = nz;
            position.y += velocity.y * delta;

            const landingSurface = this.findWaterSurface(position.x, position.y, position.z);
            const floor = this.cameraController.getFloorY(position.x, position.z, position.y + 0.5);
            if (velocity.y < 0 && landingSurface !== null && position.y <= landingSurface - 0.2) {
                data.airborne = false;
                data.swimming = true;
                velocity.multiplyScalar(0.25);
                this.fishSplash(position.x, landingSurface, position.z, 0.3);
            } else if (velocity.y < 0 && position.y <= floor) {
                position.y = floor;
                data.airborne = false;
                data.swimming = false;
                velocity.set(0, 0, 0);
                data.hopTimer = scared ? 0.15 : 1.2 + Math.random() * 3;
            }
        } else if (surface !== null && position.y < surface) {
            // Swimming: float with the eyes above the surface and paddle about.
            data.swimming = true;
            position.y += (surface - 0.22 - position.y) * Math.min(1, delta * 4);
            if (data.hopTimer <= 0) {
                data.hopTimer = 2 + Math.random() * 4;
                data.facing = scared ? awayFromPlayer : data.facing + (Math.random() - 0.5) * 2;
            }
            if (scared) data.facing = awayFromPlayer;
            const speed = scared ? 1.4 : 0.55;
            velocity.x = Math.cos(data.facing) * speed;
            velocity.z = Math.sin(data.facing) * speed;
            const nx = position.x + velocity.x * delta;
            const nz = position.z + velocity.z * delta;
            const ahead = this.cameraController.getFloorY(nx + Math.cos(data.facing) * 0.3, nz + Math.sin(data.facing) * 0.3, surface + 1.5);
            const blocked = this.world.hasSolidBlock(Math.floor(nx + Math.cos(data.facing) * 0.3), Math.floor(position.y + 0.1), Math.floor(nz + Math.sin(data.facing) * 0.3));
            if (!blocked) {
                position.x = nx;
                position.z = nz;
            } else if (ahead - surface < 1.2 && (!scared || Math.random() < 0.02)) {
                // A low bank: climb out onto it.
                velocity.set(Math.cos(data.facing) * 1.8, 6.6, Math.sin(data.facing) * 1.8);
                data.airborne = true;
                data.swimming = false;
                this.world.addRipple(position.x, position.z, 0.2);
            } else {
                data.facing += Math.PI * (0.5 + Math.random() * 0.5);
            }
            if (Math.random() < delta * 0.8) this.world.addRipple(position.x, position.z, 0.12);
        } else {
            data.swimming = false;
            const floor = this.cameraController.getFloorY(position.x, position.z, position.y + 0.5);
            if (position.y - floor > 0.05) {
                // The ground went away: fall.
                velocity.set(0, 0, 0);
                data.airborne = true;
            } else if (scared && data.hopTimer <= 0) {
                // Head for the water if there is some close by, otherwise just away.
                const pond = data.pond && Math.hypot(data.pond.x - position.x, data.pond.z - position.z) < 10 ? data.pond : null;
                const heading = pond ? Math.atan2(pond.z - position.z, pond.x - position.x) : awayFromPlayer;
                this.hopSomewhere(mob, heading, 1.4, 3.2);
            } else if (data.hopTimer <= 0) {
                const homeDistance = Math.hypot(data.home.x - position.x, data.home.z - position.z);
                const heading = homeDistance > 8
                    ? Math.atan2(data.home.z - position.z, data.home.x - position.x)
                    : data.facing + (Math.random() - 0.5) * 2.4;
                if (!this.hopSomewhere(mob, heading, 1.1, 2.4)) data.hopTimer = 1;
            }
        }

        this.updateFrogCroak(mob, delta, player);
        mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.PI / 2 - data.facing, Math.min(1, delta * 10));
        this.animateFrog(mob, delta);
    },

    updateFrogCroak(mob, delta, player) {
        const data = mob.userData;
        data.croak = Math.max(0, (data.croak || 0) - delta);
        data.croakTimer = (data.croakTimer ?? 2 + Math.random() * 8) - delta;
        if (data.croakTimer > 0 || data.airborne) return;
        data.croakTimer = 4 + Math.random() * 9;
        if (!this.isNightTime() && this.weatherState !== 'rain') return;
        const distance = Math.hypot(mob.position.x - player.x, mob.position.y - player.y, mob.position.z - player.z);
        if (distance > 28) return;
        data.croak = 0.7;
        // Two low, buzzy pulses.
        const volume = 0.03 * (1 - distance / 28);
        const pitch = data.variant === 1 ? 150 : 185;
        this.playTone({ frequency: pitch, duration: 0.12, type: 'square', volume, release: 0.08, detune: (Math.random() - 0.5) * 40 });
        setTimeout(() => this.playTone({ frequency: pitch * 0.9, duration: 0.16, type: 'square', volume, release: 0.1 }), 220);
    },

    animateFrog(mob, delta) {
        const data = mob.userData;
        const parts = data.modelParts || {};
        // Legs stretch out behind in the air, kick while swimming and fold when sitting.
        const target = data.airborne ? 1 : data.swimming ? 0.5 + Math.sin(data.life * 7) * 0.5 : 0;
        data.stretch = (data.stretch || 0) + (target - (data.stretch || 0)) * Math.min(1, delta * 14);
        const stretch = data.stretch;
        ['thighL', 'thighR'].forEach((name) => {
            const thigh = parts[name];
            if (thigh) thigh.rotation.x = thigh.userData.baseRotation.x - stretch * 1.25;
        });
        ['footL', 'footR'].forEach((name) => {
            const foot = parts[name];
            if (foot) foot.rotation.x = foot.userData.baseRotation.x + stretch * 1.4;
        });
        ['armL', 'armR'].forEach((name) => {
            const arm = parts[name];
            if (arm) arm.rotation.x = arm.userData.baseRotation.x + (data.airborne ? -0.9 : 0) + (data.swimming ? Math.sin(data.life * 7 + 1) * 0.4 : 0);
        });
        if (parts.body) parts.body.rotation.x = data.airborne ? Math.max(-0.5, Math.min(0.5, -data.velocity.y * 0.08)) : 0;

        // Breathing throat, and the big croak sac.
        const throat = parts.throat;
        if (throat) {
            const sac = Math.sin(Math.min(1, data.croak / 0.7) * Math.PI);
            const breath = (Math.sin(data.life * 6) * 0.5 + 0.5) * 0.25;
            throat.scale.set(1 + sac * 0.5, 1 + breath + sac * 2.6, 1 + sac * 0.4);
        }
    },
    updateAmphibiousMob(mob, delta, player) {
        const data = mob.userData;
        const position = mob.position;
        mob.rotation.order = 'YXZ';
        if (!data.velocity) data.velocity = new THREE.Vector3();
        if (data.facing === undefined) data.facing = Math.random() * Math.PI * 2;
        data.life += delta;
        data.hide = Math.max(0, (data.hide || 0) - delta);
        data.flee = Math.max(0, (data.flee || 0) - delta);

        const inWater = this.isSwimmable(position.x, position.y + 0.3, position.z);
        if (data.wantsWater === undefined) data.wantsWater = inWater;
        // Alternate between long swims and time on the beach.
        data.modeTimer = (data.modeTimer ?? 20 + Math.random() * 25) - delta;
        if (data.modeTimer <= 0) {
            data.wantsWater = !data.wantsWater;
            data.modeTimer = data.wantsWater ? 30 + Math.random() * 30 : 20 + Math.random() * 25;
            data.swimTarget = null;
        }
        const near = Math.hypot(position.x - player.x, position.z - player.z) < 3 && Math.abs(player.y - 1.6 - position.y) < 2.5;

        if (inWater) {
            data.pond = data.pond || position.clone();
            this.swimAmphibious(mob, delta, player, near);
        } else {
            if (near) data.hide = Math.max(data.hide, 2.5);
            this.walkAmphibious(mob, delta);
        }
        this.animateTurtle(mob, delta, inWater);
    },

    walkAmphibious(mob, delta) {
        const data = mob.userData;
        const position = mob.position;
        data.gait = 0;
        // Settle onto the ground if it dropped away.
        const ground = this.cameraController.getFloorY(position.x, position.z, position.y + 0.5);
        if (position.y - ground > 0.02) {
            position.y = Math.max(ground, position.y - 6 * delta);
            return;
        }
        if (data.hide > 0) return;

        data.turnTimer = (data.turnTimer || 0) - delta;
        const pond = data.pond && Math.hypot(data.pond.x - position.x, data.pond.z - position.z) < 20 ? data.pond : null;
        const homeDistance = Math.hypot(data.home.x - position.x, data.home.z - position.z);
        let goal = null;
        if (data.wantsWater && pond) goal = pond;
        else if (!data.wantsWater && homeDistance > 7) goal = data.home;
        if (goal) {
            data.facing = this.lerpAngle(data.facing, Math.atan2(goal.z - position.z, goal.x - position.x), Math.min(1, delta * 2));
        } else if (data.turnTimer <= 0) {
            data.turnTimer = 2 + Math.random() * 4;
            data.facing += (Math.random() - 0.5) * 1.6;
            // Turtles rest a lot.
            if (Math.random() < 0.35) data.restTimer = 2 + Math.random() * 5;
        }
        data.restTimer = Math.max(0, (data.restTimer || 0) - delta);
        if (data.restTimer > 0 && !goal) return;

        const speed = getMobSpecies(mob.userData.species).speed;
        const nx = position.x + Math.cos(data.facing) * speed * delta;
        const nz = position.z + Math.sin(data.facing) * speed * delta;
        const water = this.findWaterSurface(nx, position.y - 0.4, nz);
        if (water !== null) {
            if (data.wantsWater) {
                // Slide in just under the surface; swimming takes over from here.
                position.set(nx, water - 0.5, nz);
                this.world.addRipple(nx, nz, 0.25);
            } else {
                data.facing += Math.PI * (0.6 + Math.random() * 0.4);
            }
            return;
        }
        const floor = this.cameraController.getFloorY(nx, nz, position.y + 1.1);
        const rise = floor - position.y;
        if (floor <= -20 || rise > 1.01 || rise < -2) {
            data.facing += Math.PI * (0.5 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1);
            data.turnTimer = 2;
            return;
        }
        position.x = nx;
        position.z = nz;
        position.y = rise > 0 ? position.y + Math.min(rise, delta * 4) : floor;
        data.gait = 1;
    },

    swimAmphibious(mob, delta, player, near) {
        const data = mob.userData;
        const position = mob.position;
        const velocity = data.velocity;
        data.hide = 0;
        if (near) data.flee = Math.max(data.flee, 2);
        const surface = this.findWaterSurface(position.x, position.y + 0.3, position.z) ?? position.y + 1;

        // Come up for air every so often.
        data.breath = (data.breath ?? 12 + Math.random() * 12) - delta;
        if (data.breath < -4) data.breath = 14 + Math.random() * 14;
        const breathing = data.breath < 0;

        data.retarget = (data.retarget || 0) - delta;
        if (!data.swimTarget || data.retarget <= 0 || position.distanceTo(data.swimTarget) < 0.8) {
            data.retarget = 5 + Math.random() * 5;
            data.swimTarget = data.wantsWater ? this.findSwimTarget(data.pond || position, 8) || position.clone() : new THREE.Vector3(data.home.x, surface - 0.4, data.home.z);
        }
        const desired = _swimDesired.copy(data.swimTarget).sub(position);
        if (breathing) desired.y = surface - 0.35 - position.y;
        if (data.flee > 0) {
            _swimOffset.set(position.x - player.x, 0, position.z - player.z);
            if (_swimOffset.lengthSq() > 0.0001) desired.add(_swimOffset.normalize().multiplyScalar(3));
        }
        const speed = data.flee > 0 ? 2.2 : 0.9;
        if (desired.lengthSq() > 0.0001) desired.setLength(speed);
        velocity.lerp(desired, 1 - Math.exp(-delta * 1.5));

        const ahead = 0.45;
        const nx = position.x + velocity.x * delta;
        const nz = position.z + velocity.z * delta;
        const blockedX = !this.isSwimmable(nx + Math.sign(velocity.x) * ahead, position.y + 0.3, position.z);
        const blockedZ = !this.isSwimmable(position.x, position.y + 0.3, nz + Math.sign(velocity.z) * ahead);
        if ((blockedX || blockedZ) && !data.wantsWater && this.climbOutOfWater(mob, surface)) return;
        if (blockedX) { velocity.x *= -0.3; data.retarget = Math.min(data.retarget, 0.5); } else position.x = nx;
        if (blockedZ) { velocity.z *= -0.3; data.retarget = Math.min(data.retarget, 0.5); } else position.z = nz;
        const ny = position.y + velocity.y * delta;
        if (this.isSwimmable(position.x, ny + 0.3 + Math.sign(velocity.y) * 0.15, position.z)) position.y = ny;
        else velocity.y = 0;

        const horizontal = Math.hypot(velocity.x, velocity.z);
        if (horizontal > 0.05) data.facing = Math.atan2(velocity.z, velocity.x);
        if (breathing && surface - position.y < 0.6 && Math.random() < delta * 2) this.world.addRipple(position.x, position.z, 0.15);
    },

    // A random point under water within `radius` of `center`.
    findSwimTarget(center, radius) {
        for (let attempt = 0; attempt < 12; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * radius;
            const x = center.x + Math.cos(angle) * distance;
            const z = center.z + Math.sin(angle) * distance;
            const column = this.findWaterColumn(x, z, 0, center.y + 2);
            if (column) return new THREE.Vector3(x, column.bed + 0.3 + Math.random() * Math.max(0, column.surface - column.bed - 1.2), z);
        }
        return null;
    },

    // Steps onto a bank at most a block above the water, in the direction of travel.
    climbOutOfWater(mob, surface) {
        const data = mob.userData;
        const position = mob.position;
        const x = position.x + Math.cos(data.facing) * 0.8;
        const z = position.z + Math.sin(data.facing) * 0.8;
        const floor = this.cameraController.getFloorY(x, z, surface + 1.5);
        if (floor - surface > 1.2 || this.findWaterSurface(x, floor + 0.1, z) !== null) return false;
        position.set(x, floor, z);
        data.velocity.set(0, 0, 0);
        this.world.addRipple(x, z, 0.3);
        return true;
    },

    animateTurtle(mob, delta, inWater) {
        const data = mob.userData;
        const parts = data.modelParts || {};
        const follow = Math.min(1, delta * 6);
        const pitch = inWater ? THREE.MathUtils.clamp(Math.atan2(-data.velocity.y, Math.max(0.2, Math.hypot(data.velocity.x, data.velocity.z))), -0.5, 0.5) : 0;
        mob.rotation.x += (pitch - mob.rotation.x) * follow;
        mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.PI / 2 - data.facing, Math.min(1, delta * 5));

        // Head and flippers draw into the shell while hiding.
        data.retract = (data.retract || 0) + ((data.hide > 0 ? 1 : 0) - (data.retract || 0)) * Math.min(1, delta * 8);
        if (data.head) {
            data.head.scale.setScalar(1 - data.retract * 0.75);
            data.head.rotation.y = Math.sin(data.life * 0.4) * 0.35 * (1 - data.retract);
            data.head.rotation.x = inWater ? -0.2 : Math.max(0, Math.sin(data.life * 0.25)) * 0.25;
        }
        data.stepPhase += delta * (inWater ? 2.6 : 5 * (data.gait || 0));
        const phase = data.stepPhase;
        ['flipperFL', 'flipperFR', 'flipperBL', 'flipperBR'].forEach((name, index) => {
            const flipper = parts[name];
            if (!flipper) return;
            const base = flipper.userData.baseRotation;
            const side = index % 2 === 0 ? 1 : -1;
            const front = index < 2;
            flipper.scale.setScalar(1 - data.retract * 0.6);
            if (inWater) {
                // Front flippers sweep like wings; the back ones steer.
                flipper.rotation.z = base.z + (front ? Math.sin(phase) * 0.7 : Math.sin(phase + 1) * 0.2) * side;
                flipper.rotation.y = base.y + (front ? Math.cos(phase) * 0.35 * side : 0);
            } else {
                const pair = front ? 1 : -1;
                flipper.rotation.y = base.y + Math.sin(phase) * 0.4 * side * pair * (data.gait || 0);
                flipper.rotation.z = base.z;
            }
        });
        if (data.modelRoot) data.modelRoot.position.y = inWater ? 0 : Math.abs(Math.sin(phase)) * 0.015 * (data.gait || 0);
    }
});
