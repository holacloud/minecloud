// Creatures of the air. Eagles circle high over the land on thermals, banking into the turn
// and flapping only to climb; now and then they glide down to perch on the highest point
// around, and when they spot a fish near the surface they stoop on it and carry it off.
// Bees live in colonies around a hive hanging under a tree's canopy: they hover about the
// entrance, fly off to flowers and back, shelter inside at night and in the rain, and when
// the hive or one of them is struck the whole swarm chases the player and stings (each bee
// only once). Fireflies drift in loose clouds over the grass and ponds from dusk to dawn,
// blinking on and off, shying away from the player and scattering when swatted.
// Mixed into Game.prototype; updateAmbientMobs hands 'soar' mobs to updateSoaringMob,
// 'swarm' ones (bees and their hive) to updateSwarmMob and 'glow' ones to updateGlowMob.

const _flyTarget = new THREE.Vector3();
const _beeDesired = new THREE.Vector3();

Object.assign(Game.prototype, {
    updateSoaringMob(mob, delta, player) {
        const data = mob.userData;
        const position = mob.position;
        if (!data.flight) this.initEagle(mob);
        const flight = data.flight;
        data.life += delta;
        flight.timer -= delta;
        flight.huntCooldown = Math.max(0, flight.huntCooldown - delta);
        flight.flapBoost = Math.max(0, flight.flapBoost - delta);
        const playerDistance = Math.hypot(player.x - position.x, player.z - position.z);

        if (flight.mode === 'perch') {
            flight.calm = Math.max(0, flight.calm - delta);
            const startled = flight.calm <= 0 && playerDistance < 5 && !this.titleScreenOpen;
            if (flight.carrying && flight.timer < flight.eatUntil) this.dropCarriedFish(mob);
            if (flight.timer <= 0 || startled) this.takeOff(mob, startled);
            if (Math.random() < delta * 0.05) this.eagleScreech(mob, player);
            this.poseEagle(mob, delta, 0);
            return;
        }

        if (flight.mode === 'dive') {
            this.updateEagleDive(mob, delta);
        } else {
            if (flight.mode === 'soar') {
                if (flight.timer <= 0) {
                    if (Math.random() < 0.45 && this.choosePerch(mob)) {
                        flight.mode = 'land';
                        flight.timer = 30;
                    } else {
                        this.chooseThermal(mob);
                    }
                }
                flight.angle += flight.speed / flight.radius * flight.turn * delta;
                const ahead = flight.angle + 0.5 * flight.turn;
                _flyTarget.set(flight.center.x + Math.cos(ahead) * flight.radius, flight.cruiseY, flight.center.z + Math.sin(ahead) * flight.radius);
                if (flight.huntCooldown <= 0 && (this.mobFrame + mob.id) % 20 === 0) this.lookForFish(mob);
                if (Math.random() < delta * 0.02) this.eagleScreech(mob, player);
            } else {
                _flyTarget.copy(flight.perch);
            }
            this.flyTowards(mob, _flyTarget, delta);
            if (flight.mode === 'land' && (position.distanceTo(flight.perch) < 0.35 || flight.timer <= 0)) this.landOnPerch(mob);
        }
        this.poseEagle(mob, delta, 1);
    },

    initEagle(mob) {
        const data = mob.userData;
        data.velocity = new THREE.Vector3();
        data.facing = data.direction;
        data.flight = { mode: 'perch', timer: 7, calm: 7, huntCooldown: 10, flapBoost: 0, turnRate: 0, perched: 1, angle: 0, turn: 1, speed: 4, radius: 8, center: data.home.clone(), cruiseY: 0, perch: mob.position.clone(), prey: null, carrying: null };
        mob.rotation.order = 'YXZ';
        ['L', 'R'].forEach((side) => {
            if (data.modelParts[`wing${side}`]) data.modelParts[`wing${side}`].rotation.order = 'YXZ';
        });
        // Wild eagles are already up in the sky when their chunk appears.
        if (data.natural) {
            this.chooseThermal(mob);
            data.flight.mode = 'soar';
            data.flight.perched = 0;
            mob.position.y = data.flight.cruiseY;
        }
    },

    // Picks a circle to soar on: somewhere near home, well above the local terrain.
    chooseThermal(mob, awayFrom = null) {
        const flight = mob.userData.flight;
        const home = mob.userData.home;
        let angle = Math.random() * Math.PI * 2;
        if (awayFrom) angle = Math.atan2(mob.position.z - awayFrom.z, mob.position.x - awayFrom.x);
        const distance = awayFrom ? 20 : Math.random() * 20;
        flight.center.set(home.x + Math.cos(angle) * distance, 0, home.z + Math.sin(angle) * distance);
        flight.radius = 6 + Math.random() * 5;
        flight.turn = Math.random() < 0.5 ? -1 : 1;
        flight.speed = getMobSpecies('eagle').speed * (0.85 + Math.random() * 0.3);
        flight.angle = Math.atan2(mob.position.z - flight.center.z, mob.position.x - flight.center.x);
        let top = mob.position.y - 12;
        for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2;
            const r = i === 0 ? 0 : flight.radius + 2;
            const floor = this.cameraController.getFloorY(flight.center.x + Math.cos(a) * r, flight.center.z + Math.sin(a) * r, 64);
            if (floor > -20) top = Math.max(top, floor);
        }
        flight.cruiseY = top + 11 + Math.random() * 6 + (awayFrom ? 6 : 0);
        flight.timer = 20 + Math.random() * 30;
    },

    // The highest dry spot within reach of the soaring circle, or false.
    choosePerch(mob) {
        const flight = mob.userData.flight;
        let best = null;
        for (let i = 0; i < 16; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * 14;
            const x = Math.floor(flight.center.x + Math.cos(a) * r) + 0.5;
            const z = Math.floor(flight.center.z + Math.sin(a) * r) + 0.5;
            const floor = this.cameraController.getFloorY(x, z, 64);
            if (floor <= -20 || this.findWaterSurface(x, floor + 0.1, z) !== null) continue;
            if (!best || floor > best.y) best = new THREE.Vector3(x, floor, z);
        }
        if (!best) return false;
        flight.perch.copy(best);
        return true;
    },

    takeOff(mob, startled) {
        const flight = mob.userData.flight;
        const player = this.getLocalPlayerPosition();
        this.chooseThermal(mob, startled ? player : null);
        flight.mode = 'soar';
        flight.flapBoost = 2.5;
        mob.userData.velocity.set(Math.cos(mob.userData.facing) * 1.5, 3, Math.sin(mob.userData.facing) * 1.5);
        this.playNoiseBurst({ duration: 0.12, volume: 0.02, highpass: 150, lowpass: 900 });
        if (startled) this.eagleScreech(mob, player);
    },

    landOnPerch(mob) {
        const flight = mob.userData.flight;
        mob.position.copy(flight.perch);
        mob.userData.velocity.set(0, 0, 0);
        flight.mode = 'perch';
        flight.timer = 15 + Math.random() * 25;
        flight.calm = 0;
        // The catch is eaten on the perch, held down under the talons.
        flight.eatUntil = flight.timer - 8;
        if (flight.carrying) flight.carrying.position.y = 0.04;
    },

    // Steers with a limited turn rate, climbing (flapping) or gliding down towards `target`.
    flyTowards(mob, target, delta) {
        const data = mob.userData;
        const flight = data.flight;
        const position = mob.position;
        const dx = target.x - position.x;
        const dz = target.z - position.z;
        const dy = target.y - position.y;
        const horizontal = Math.hypot(dx, dz);
        const landing = flight.mode === 'land';
        // Slow down on the final approach to a perch.
        const cruise = landing ? Math.max(1.2, Math.min(flight.speed, horizontal * 0.8)) : flight.speed;

        if (horizontal > 0.05) {
            let turn = Math.atan2(dz, dx) - data.facing;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            const maxTurn = (landing && horizontal < 4 ? 4 : 1.4) * delta;
            const applied = THREE.MathUtils.clamp(turn, -maxTurn, maxTurn);
            data.facing += applied;
            flight.turnRate += (applied / delta - flight.turnRate) * Math.min(1, delta * 3);
        }
        const along = landing && horizontal < 0.6 ? horizontal / Math.max(delta, 0.001) : cruise;
        const climb = THREE.MathUtils.clamp(dy * 1.2, landing ? -4 : -2, 3);
        data.velocity.x += (Math.cos(data.facing) * Math.min(along, cruise) - data.velocity.x) * Math.min(1, delta * 2);
        data.velocity.z += (Math.sin(data.facing) * Math.min(along, cruise) - data.velocity.z) * Math.min(1, delta * 2);
        data.velocity.y += (climb - data.velocity.y) * Math.min(1, delta * 2.5);
        this.moveFlyer(mob, delta);
    },

    // Moves by velocity, pulling up instead of flying into terrain.
    moveFlyer(mob, delta) {
        const position = mob.position;
        const velocity = mob.userData.velocity;
        const nx = position.x + velocity.x * delta;
        const ny = position.y + velocity.y * delta;
        const nz = position.z + velocity.z * delta;
        if (this.world.hasSolidBlock(Math.floor(nx), Math.floor(ny + 0.3), Math.floor(nz))) {
            position.y += 3 * delta;
            velocity.y = Math.max(velocity.y, 1);
            mob.userData.flight.flapBoost = Math.max(mob.userData.flight.flapBoost, 0.5);
            return;
        }
        position.set(nx, ny, nz);
    },

    // Picks a fish swimming close enough to the surface to snatch.
    lookForFish(mob) {
        const flight = mob.userData.flight;
        if (flight.carrying || Math.random() > 0.3) return;
        for (const fish of this.ambientMobs) {
            if (fish.userData.species !== 'fish' || fish.userData.stranded) continue;
            if (Math.hypot(fish.position.x - mob.position.x, fish.position.z - mob.position.z) > 28) continue;
            const surface = this.findWaterSurface(fish.position.x, fish.position.y, fish.position.z);
            if (surface === null || surface - fish.position.y > 1.6) continue;
            flight.mode = 'dive';
            flight.prey = fish;
            flight.timer = 8;
            return;
        }
    },

    // A steep, fast stoop at the prey; talons swing forward just before the strike.
    updateEagleDive(mob, delta) {
        const data = mob.userData;
        const flight = data.flight;
        const position = mob.position;
        const fish = flight.prey;
        const surface = fish && fish.parent ? this.findWaterSurface(fish.position.x, fish.position.y, fish.position.z) : null;
        if (surface === null || flight.timer <= 0) {
            this.abortDive(mob);
            return;
        }
        _flyTarget.set(fish.position.x - position.x, surface - 0.2 - position.y, fish.position.z - position.z);
        const distance = _flyTarget.length();
        const horizontal = Math.hypot(_flyTarget.x, _flyTarget.z);
        // Circle down while far out, then commit.
        const speed = horizontal > 10 && -_flyTarget.y < horizontal * 0.3 ? 7 : 11;
        _flyTarget.multiplyScalar(speed / Math.max(distance, 0.001));
        data.velocity.lerp(_flyTarget, Math.min(1, delta * 3));
        let turn = Math.atan2(data.velocity.z, data.velocity.x) - data.facing;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        data.facing += turn * Math.min(1, delta * 6);
        flight.turnRate = turn * 2;
        this.moveFlyer(mob, delta);

        if (position.y <= surface + 0.3) {
            this.fishSplash(position.x, surface, position.z, 0.8);
            if (position.distanceTo(fish.position) < 1.8) {
                this.carryFish(mob, fish);
                this.startleSchool(fish, position);
            }
            this.abortDive(mob);
        }
    },

    abortDive(mob) {
        const flight = mob.userData.flight;
        flight.prey = null;
        flight.huntCooldown = 20 + Math.random() * 20;
        flight.flapBoost = 2;
        this.chooseThermal(mob);
        flight.mode = 'soar';
        // With a catch, head straight for a perch to eat it.
        if (flight.carrying && this.choosePerch(mob)) {
            flight.mode = 'land';
            flight.timer = 30;
        }
    },

    // Takes the fish's model off the school and holds it in the talons.
    carryFish(mob, fish) {
        const root = fish.userData.modelRoot;
        fish.remove(root);
        this.removeMob(fish);
        root.position.set(0, -0.12, 0.05);
        root.rotation.set(0, 0, 0);
        root.traverse((node) => { node.userData.mobRoot = mob; });
        mob.userData.modelRoot.add(root);
        mob.userData.flight.carrying = root;
        this.playNoiseBurst({ duration: 0.15, volume: 0.03, highpass: 300, lowpass: 2000 });
    },

    dropCarriedFish(mob) {
        const root = mob.userData.flight.carrying;
        mob.userData.flight.carrying = null;
        root.parent.remove(root);
        root.traverse((node) => {
            if (node.isMesh && node.userData.disposeGeometry) node.geometry.dispose();
            if (node.isMesh && node.material && node.userData.modelMap) node.material.dispose();
        });
    },

    eagleScreech(mob, player) {
        const distance = Math.hypot(player.x - mob.position.x, player.y - mob.position.y, player.z - mob.position.z);
        const volume = 0.014 * Math.max(0, 1 - distance / 48);
        if (volume <= 0.001) return;
        const tone = getMobSpecies('eagle').tone;
        this.playTone({ frequency: tone * 1.2, endFrequency: tone * 0.7, duration: 0.5, type: 'sawtooth', volume, attack: 0.04, release: 0.15 });
        this.playTone({ frequency: tone * 1.25, endFrequency: tone * 0.72, duration: 0.45, type: 'triangle', volume: volume * 0.8, attack: 0.03, release: 0.12, detune: 12 });
    },

    // Body attitude and wings: folded when perched (`flying` 0), spread and banking in flight.
    poseEagle(mob, delta, flying) {
        const data = mob.userData;
        const flight = data.flight;
        const parts = data.modelParts;
        const blend = Math.min(1, delta * 5);
        flight.perched += ((1 - flying) - flight.perched) * blend;
        const folded = flight.perched;
        const velocity = data.velocity;
        const horizontal = Math.hypot(velocity.x, velocity.z);

        mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.PI / 2 - data.facing, Math.min(1, delta * 8));
        const pitch = flying ? THREE.MathUtils.clamp(Math.atan2(-velocity.y, Math.max(horizontal, 0.5)), -0.5, 1.1) : -0.35;
        const roll = flying ? THREE.MathUtils.clamp(flight.turnRate * 0.9, -0.7, 0.7) : 0;
        mob.rotation.x += (pitch - mob.rotation.x) * blend;
        mob.rotation.z += (roll - mob.rotation.z) * blend;

        // Flap to climb, take off or land; otherwise glide with a slight dihedral.
        const flapping = flying && (flight.flapBoost > 0 || velocity.y > 0.6 || (flight.mode === 'land' && mob.position.distanceTo(flight.perch) < 5));
        flight.flap = (flight.flap || 0) + (flapping ? 0.6 : -0.5) * delta * 4;
        flight.flap = THREE.MathUtils.clamp(flight.flap, 0, 1);
        flight.wingPhase = (flight.wingPhase || 0) + delta * 9 * flight.flap;
        const beat = Math.sin(flight.wingPhase) * 0.75 * flight.flap;
        const lag = Math.sin(flight.wingPhase - 0.9) * 0.45 * flight.flap;
        ['L', 'R'].forEach((side) => {
            const sign = side === 'L' ? 1 : -1;
            const wing = parts[`wing${side}`];
            const tip = parts[`wingTip${side}`];
            wing.rotation.set(Math.PI / 2 * 0.95 * folded, sign * 1.45 * folded, sign * (0.12 + beat) * (1 - folded));
            // Primaries curl up at the end of a glide and fold back along the inner wing.
            tip.rotation.set(0, sign * Math.PI * 0.94 * folded, sign * (0.08 + lag) * (1 - folded));
            // Talons tucked back in flight, thrust forward in the last metres of a dive.
            const strike = flight.mode === 'dive' && flight.prey && mob.position.distanceTo(flight.prey.position) < 3;
            parts[`leg${side}`].rotation.x = strike ? -0.9 : 1.2 * (1 - folded);
        });
        if (flight.carrying) flight.carrying.rotation.z = flying ? Math.sin(data.life * 14) * 0.25 : 0;

        // Perched, the head swivels to scan the land.
        const head = data.head;
        if (head) {
            if (!flying && Math.random() < delta * 0.5) data.lookYaw = (Math.random() - 0.5) * 2.2;
            const yaw = flying ? THREE.MathUtils.clamp(flight.turnRate * 0.4, -0.5, 0.5) : data.lookYaw;
            head.rotation.y += (yaw - head.rotation.y) * Math.min(1, delta * 6);
            const pecking = !flying && flight.carrying ? Math.max(0, Math.sin(data.life * 5)) * 0.8 : 0;
            head.rotation.x = flying ? -pitch * 0.6 : 0.35 + pecking;
        }
        parts.tail.rotation.x = parts.tail.userData.baseRotation.x + (flying ? -flight.turnRate * 0.1 : -0.4);
        parts.tail.rotation.y = flying ? -roll * 0.4 : 0;
    },

    // Bottom of a canopy at (x, z) with two free blocks below it, where a hive can hang.
    findHiveSpot(x, z) {
        const bx = Math.floor(x);
        const bz = Math.floor(z);
        const top = Math.floor(this.cameraController.getFloorY(bx + 0.5, bz + 0.5, 64)) - 1;
        if (top <= -20 || !(this.world.getBlockTypeAt(bx, top, bz) || '').endsWith('leaves')) return null;
        let y = top;
        while (y > top - 6 && (this.world.getBlockTypeAt(bx, y, bz) || '').endsWith('leaves')) y--;
        for (const below of [y, y - 1]) {
            if (this.world.hasSolidBlock(bx, below, bz) || this.world.getBlockTypeAt(bx, below, bz) === 'water') return null;
        }
        return new THREE.Vector3(bx + 0.5, y + 1, bz + 0.5);
    },

    // Nearest hive spot to (x, z), searching outwards ring by ring.
    findHiveSpotNear(x, z, radius) {
        for (let r = 0; r <= radius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const spot = this.findHiveSpot(x + dx, z + dz);
                    if (spot) return spot;
                }
            }
        }
        return null;
    },

    // Natural spawning: now and then a forest or plains chunk has a colony in one of its trees.
    spawnBeesForChunk(chunkX, chunkZ, biome) {
        if (biome !== 'forest' && biome !== 'plains') return;
        if (this.chunkRandom(chunkX, chunkZ, 31) > (biome === 'forest' ? 0.3 : 0.15)) return;
        if (this.ambientMobs.filter((mob) => mob.userData.colony && mob.userData.isHive).length >= getMobSpecies('bee').limit) return;
        const size = this.world.chunkSize;
        for (let i = 0; i < 24; i++) {
            const spot = this.findHiveSpot(chunkX * size + this.chunkRandom(chunkX, chunkZ, 40 + i) * size, chunkZ * size + this.chunkRandom(chunkX, chunkZ, 70 + i) * size);
            if (!spot) continue;
            const [min, max] = getMobSpecies('bee').group;
            const colony = this.spawnColony(spot, min + Math.floor(this.chunkRandom(chunkX, chunkZ, 32) * (max - min + 1)));
            [colony.hive, ...colony.bees].forEach((mob) => {
                mob.userData.natural = true;
                mob.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
            });
            return;
        }
    },

    // A hive hanging from `spot` and `count` bees about it; its entrance faces `facing`.
    spawnColony(spot, count, facing = null) {
        const hive = this.createMob('bee', spot, { modelSpecies: 'beehive' });
        hive.rotation.y = facing ? Math.atan2(facing.x - spot.x, facing.z - spot.z) : Math.random() * Math.PI * 2;
        hive.userData.isHive = true;
        hive.userData.shake = 0;
        const colony = { hive, bees: [], size: count, anger: 0, regrow: 25, buzzTimer: 0, frame: -1, entrance: new THREE.Vector3() };
        hive.userData.colony = colony;
        hive.updateMatrixWorld();
        colony.entrance.set(0, -5.5 / 16, 6 / 16).applyMatrix4(hive.matrixWorld);
        this.ambientMobs.push(hive);
        for (let i = 0; i < count; i++) this.spawnBee(colony);
        return colony;
    },

    spawnBee(colony) {
        const bee = this.createMob('bee', colony.entrance);
        const data = bee.userData;
        data.colony = colony;
        data.velocity = new THREE.Vector3();
        data.task = { mode: 'hover', timer: Math.random() * 6, spot: new THREE.Vector3() };
        data.orbit = Math.random() * Math.PI * 2;
        data.natural = colony.hive.userData.natural;
        data.spawnChunk = colony.hive.userData.spawnChunk;
        bee.rotation.order = 'YXZ';
        colony.bees.push(bee);
        this.ambientMobs.push(bee);
        return bee;
    },

    // For /mob and eggs: a colony in the nearest tree, or with its hive on the ground. The
    // hive hangs on the side of the canopy closest to the player, entrance towards them.
    spawnColonyNear(x, z, topY) {
        const player = this.getLocalPlayerPosition();
        let spot = this.findHiveSpotNear(player.x, player.z, 12);
        const inTree = Boolean(spot);
        if (!spot) {
            const floor = this.cameraController.getFloorY(x, z, topY);
            if (floor <= -20) {
                this.receiveSystemMessage({ text: 'Could not find a place for the bees' });
                return;
            }
            spot = new THREE.Vector3(x, floor + 0.72, z);
        }
        const [min, max] = getMobSpecies('bee').group;
        this.spawnColony(spot, min + Math.floor(Math.random() * (max - min + 1)), player);
        this.receiveSystemMessage({ text: inTree ? 'Spawned a bee colony in a nearby tree' : 'No tree nearby: the hive sits on the ground' });
    },

    // Striking the hive or a bee sends the whole colony after the player.
    provokeColony(mob) {
        const colony = mob.userData.colony;
        if (!colony) return;
        if (colony.anger <= 0) this.receiveSystemMessage({ text: 'You angered the bees!' });
        colony.anger = 20;
        if (mob.userData.isHive) mob.userData.shake = 1;
        this.playTone({ frequency: 330, duration: 0.25, type: 'sawtooth', volume: 0.02, release: 0.1, detune: 30 });
    },

    updateSwarmMob(mob, delta, player) {
        const data = mob.userData;
        const colony = data.colony;
        data.life += delta;
        if (data.isHive) {
            this.updateColony(colony, delta, player);
            data.shake = Math.max(0, data.shake - delta * 1.5);
            mob.rotation.z = Math.sin(data.life * 30) * 0.12 * data.shake;
            mob.rotation.x = Math.sin(data.life * 23) * 0.08 * data.shake;
            return;
        }
        if (data.dying !== undefined) {
            this.updateDyingBee(mob, delta);
            return;
        }
        if (!colony.hive.parent) {
            // The hive is gone (despawned): its bees go with it.
            this.removeMob(mob);
            return;
        }

        const position = mob.position;
        const task = data.task;
        const playerEye = _flyTarget.set(player.x, player.y - 0.45, player.z);
        const sheltering = this.isNightTime() || this.weatherState === 'rain';
        let speed = getMobSpecies('bee').speed;
        let target;
        if (colony.anger > 0 && !this.respawnPending) {
            mob.visible = true;
            // Swarm around the player's head; a submerged player is out of reach.
            const submerged = this.cameraController.isInWater;
            target = _beeDesired.set(Math.sin(data.life * 3.1 + data.orbit) * 0.5, submerged ? 1.5 : Math.sin(data.life * 4.3) * 0.25, Math.cos(data.life * 2.7 + data.orbit) * 0.5).add(playerEye);
            speed = 5.2;
            if (!submerged && position.distanceTo(playerEye) < 0.7) {
                this.applyDamage(1, 'You were stung by a bee', 'mob');
                this.playTone({ frequency: 1300, duration: 0.05, type: 'square', volume: 0.025, release: 0.05 });
                data.dying = 0;
                return;
            }
        } else if (sheltering) {
            target = colony.entrance;
            if (position.distanceTo(target) < 0.25) mob.visible = false;
        } else {
            mob.visible = true;
            task.timer -= delta;
            if (task.mode === 'hover') {
                data.orbit += delta * 1.4;
                target = _beeDesired.set(Math.cos(data.orbit) * 1.1, -0.5 + Math.sin(data.orbit * 1.7) * 0.4, Math.sin(data.orbit) * 1.1).add(colony.entrance);
                if (task.timer <= 0) {
                    task.mode = 'flower';
                    task.timer = 12;
                    this.findFlower(colony, task.spot);
                }
            } else if (task.mode === 'flower') {
                target = task.spot;
                if (position.distanceTo(target) < 0.3 || task.timer <= 0) {
                    task.mode = 'sip';
                    task.timer = 2 + Math.random() * 3;
                }
            } else {
                // Sipping: hover over the flower, bobbing.
                target = _beeDesired.set(Math.sin(data.life * 5) * 0.08, Math.sin(data.life * 7) * 0.05, Math.cos(data.life * 5) * 0.08).add(task.spot);
                speed = 1;
                if (task.timer <= 0) {
                    task.mode = 'hover';
                    task.timer = 4 + Math.random() * 8;
                }
            }
        }

        // Steer, easing off near the target, with a nervous zig-zag.
        _beeDesired.subVectors(target, position);
        const distance = _beeDesired.length();
        _beeDesired.multiplyScalar(speed * Math.min(1, distance * 1.5) / Math.max(distance, 0.001));
        _beeDesired.x += Math.sin(data.life * 9 + data.orbit) * 0.6;
        _beeDesired.y += Math.sin(data.life * 11) * 0.4;
        data.velocity.lerp(_beeDesired, Math.min(1, delta * 4));
        const nx = position.x + data.velocity.x * delta;
        const ny = position.y + data.velocity.y * delta;
        const nz = position.z + data.velocity.z * delta;
        if (this.world.hasSolidBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
            position.y += delta;
        } else {
            position.set(nx, ny, nz);
        }

        const horizontal = Math.hypot(data.velocity.x, data.velocity.z);
        if (horizontal > 0.2) mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.atan2(data.velocity.x, data.velocity.z), Math.min(1, delta * 10));
        mob.rotation.x = THREE.MathUtils.clamp(-data.velocity.y * 0.2, -0.5, 0.5);
        this.flapBeeWings(mob);
    },

    flapBeeWings(mob) {
        const data = mob.userData;
        if (data.wings.length !== 2) return;
        const flap = 0.2 + Math.sin(data.life * 70) * 0.5;
        data.wings[0].rotation.z = flap;
        data.wings[1].rotation.z = -flap;
    },

    // A bee that has stung tumbles to the ground and vanishes.
    updateDyingBee(mob, delta) {
        const data = mob.userData;
        data.dying += delta;
        data.velocity.x *= 0.9;
        data.velocity.z *= 0.9;
        data.velocity.y = Math.max(data.velocity.y - 12 * delta, -6);
        const floor = this.cameraController.getFloorY(mob.position.x, mob.position.z, mob.position.y + 0.2);
        mob.position.addScaledVector(data.velocity, delta);
        if (mob.position.y < floor + 0.08) mob.position.y = floor + 0.08;
        mob.rotation.z += delta * 6;
        if (data.dying > 2.5) this.removeMob(mob);
    },

    // A flower near the hive, or a patch of ground if none is found.
    findFlower(colony, out) {
        const hive = colony.hive.position;
        let fallback = null;
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 2 + Math.random() * 8;
            const x = Math.floor(hive.x + Math.cos(angle) * radius);
            const z = Math.floor(hive.z + Math.sin(angle) * radius);
            const floor = this.cameraController.getFloorY(x + 0.5, z + 0.5, hive.y + 4);
            if (floor <= -20 || this.findWaterSurface(x + 0.5, floor + 0.1, z + 0.5) !== null) continue;
            if ((this.world.getBlockTypeAt(x, Math.floor(floor), z) || '').startsWith('flower')) {
                out.set(x + 0.5, Math.floor(floor) + 0.45, z + 0.5);
                return;
            }
            if (!fallback) fallback = [x + 0.5, floor + 0.3, z + 0.5];
        }
        if (fallback) out.set(...fallback);
        else out.copy(colony.entrance);
    },

    // Once per frame: anger wears off, lost bees are replaced and the swarm buzzes.
    updateColony(colony, delta, player) {
        colony.bees = colony.bees.filter((bee) => bee.parent);
        const hive = colony.hive.position;
        const far = Math.hypot(player.x - hive.x, player.z - hive.z) > 28;
        colony.anger = Math.max(0, colony.anger - delta * (far || this.respawnPending ? 4 : 1));
        if (colony.bees.length < colony.size && colony.anger <= 0) {
            colony.regrow -= delta;
            if (colony.regrow <= 0) {
                colony.regrow = 25;
                this.spawnBee(colony);
            }
        }

        let nearest = Infinity;
        colony.bees.forEach((bee) => {
            if (bee.visible) nearest = Math.min(nearest, Math.hypot(player.x - bee.position.x, player.y - bee.position.y, player.z - bee.position.z));
        });
        colony.buzzTimer -= delta;
        if (colony.buzzTimer <= 0 && nearest < 10) {
            colony.buzzTimer = 0.09;
            const angry = colony.anger > 0;
            const volume = 0.006 * (1 - nearest / 10) * (angry ? 2.5 : 1) * Math.min(3, colony.bees.length) / 3;
            this.playTone({ frequency: getMobSpecies('bee').tone * (angry ? 1.35 : 1), duration: 0.1, type: 'sawtooth', volume, attack: 0.02, release: 0.04, detune: (Math.random() - 0.5) * 60 });
        }
    },

    // Natural spawning: plains and forest chunks get a cloud now and then, near water if any.
    spawnFirefliesForChunk(chunkX, chunkZ, biome) {
        if (biome !== 'forest' && biome !== 'plains') return;
        if (this.chunkRandom(chunkX, chunkZ, 51) > 0.25) return;
        if (this.ambientMobs.filter((mob) => mob.userData.species === 'firefly').length >= getMobSpecies('firefly').limit) return;
        const size = this.world.chunkSize;
        let spot = null;
        for (let i = 0; i < 8 && !spot; i++) {
            const x = chunkX * size + this.chunkRandom(chunkX, chunkZ, 52 + i) * size;
            const z = chunkZ * size + this.chunkRandom(chunkX, chunkZ, 62 + i) * size;
            const shore = this.findShoreSpot(x, z);
            if (shore) spot = new THREE.Vector3(shore.x, shore.y, shore.z);
            else if (i === 7) {
                const floor = this.cameraController.getFloorY(x, z, 64);
                if (floor > -20) spot = new THREE.Vector3(x, floor, z);
            }
        }
        if (!spot) return;
        const mob = this.createMob('firefly', spot);
        mob.userData.natural = true;
        mob.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
        this.ambientMobs.push(mob);
    },

    // Soft round glow shared by every firefly.
    getFireflyHaloTexture() {
        if (this.fireflyHaloTexture) return this.fireflyHaloTexture;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.25, 'rgba(255,255,255,0.45)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
        this.fireflyHaloTexture = new THREE.CanvasTexture(canvas);
        return this.fireflyHaloTexture;
    },

    initFireflies(mob) {
        const data = mob.userData;
        const light = new THREE.MeshBasicMaterial({ color: 0xd8f05a });
        const halo = new THREE.SpriteMaterial({ map: this.getFireflyHaloTexture(), color: 0xc8f060, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 });
        // Disposed by removeMob (the halo texture is shared and kept).
        data.glowMaterials = [light];
        data.haloMaterial = halo;
        const geometry = new THREE.BoxGeometry(0.05, 0.05, 0.07);
        data.flies = [];
        const count = 10 + Math.floor(Math.random() * 7);
        for (let i = 0; i < count; i++) {
            const fly = new THREE.Group();
            const body = new THREE.Mesh(geometry, light);
            body.userData.disposeGeometry = true;
            body.userData.mobRoot = mob;
            const glow = new THREE.Sprite(halo);
            glow.scale.setScalar(0.45);
            fly.add(body, glow);
            fly.userData = { seed: Math.random() * 100, phase: Math.random() * 10, period: 2.5 + Math.random() * 3, avoid: new THREE.Vector3() };
            data.flies.push(fly);
            mob.add(fly);
        }
        data.center = new THREE.Vector3().copy(mob.position);
        data.center.y += 1.2;
        mob.position.copy(data.center);
        data.target = data.center.clone();
        data.scatter = 0;
        data.glow = 0;
        // Wild clouds only show at night; spawned ones always do, so they can be seen.
        data.alwaysGlow = !data.natural;
    },

    updateGlowMob(mob, delta, player) {
        const data = mob.userData;
        if (!data.flies) this.initFireflies(mob);
        data.life += delta;
        data.modelRoot.visible = false;
        const position = mob.position;

        // The cloud drifts slowly about its home, a little above the grass or water.
        if (data.moveTimer <= 0) {
            data.moveTimer = 4 + Math.random() * 4;
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 6;
            const x = data.home.x + Math.cos(angle) * radius;
            const z = data.home.z + Math.sin(angle) * radius;
            const floor = this.cameraController.getFloorY(x, z, data.home.y + 4);
            if (floor > -20) {
                const water = this.findWaterSurface(x, floor + 0.1, z);
                data.target.set(x, (water ?? floor) + 1 + Math.random() * 0.8, z);
            }
        }
        _flyTarget.subVectors(data.target, position);
        const distance = _flyTarget.length();
        if (distance > 0.01) position.addScaledVector(_flyTarget, Math.min(1, getMobSpecies('firefly').speed * delta / distance));

        const hour = ((this.timeOfDay * 24) + 6) % 24;
        const dark = hour >= 19 || hour < 5.5;
        data.glow += ((data.alwaysGlow || dark ? 1 : 0) - data.glow) * Math.min(1, delta * 0.5);
        mob.visible = data.glow > 0.01;
        if (!mob.visible) return;
        data.scatter = Math.max(0, data.scatter - delta / 3);

        // In Ultra the lights are HDR-bright, so the bloom pass gives them a halo.
        const boost = this.ultraModeEnabled ? 5 : 1;
        data.glowMaterials[0].color.setRGB(0.85 * boost, 0.95 * boost, 0.35 * boost);
        data.haloMaterial.opacity = 0.7 * Math.min(1, boost);

        const spread = 1 + data.scatter * 1.5;
        data.flies.forEach((fly) => {
            const f = fly.userData;
            const t = data.life;
            fly.position.set(
                (Math.sin(t * 0.31 + f.seed) * 1.8 + Math.sin(t * 2.1 + f.seed * 3) * 0.12) * spread,
                (Math.sin(t * 0.43 + f.seed * 1.3) * 0.6 + Math.sin(t * 1.7 + f.seed) * 0.1) * spread,
                (Math.cos(t * 0.27 + f.seed * 0.7) * 1.8 + Math.cos(t * 2.3 + f.seed * 2) * 0.12) * spread
            );
            // Shy away from the player's body.
            _beeDesired.set(position.x + fly.position.x - player.x, position.y + fly.position.y - (player.y - 0.8), position.z + fly.position.z - player.z);
            const near = _beeDesired.length();
            if (near < 1.4) _beeDesired.multiplyScalar((1.4 - near) / Math.max(near, 0.001));
            else _beeDesired.set(0, 0, 0);
            f.avoid.lerp(_beeDesired, Math.min(1, delta * 3));
            fly.position.add(f.avoid);

            // Each blinks on its own rhythm; swatted ones all light up as they scatter.
            const cycle = (t + f.phase) % f.period;
            const pulse = cycle < 0.7 ? Math.sin(cycle / 0.7 * Math.PI) : 0;
            const intensity = Math.max(pulse, data.scatter * 0.8) * data.glow;
            fly.scale.setScalar(Math.max(0.001, intensity));
        });
    },

    // A swat scatters the cloud in a burst of light.
    scatterFireflies(mob) {
        mob.userData.scatter = 1;
        this.playTone({ frequency: getMobSpecies('firefly').tone, endFrequency: 2600, duration: 0.15, type: 'sine', volume: 0.008, release: 0.1 });
    }
});
