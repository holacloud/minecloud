// Creatures of the air. Eagles circle high over the land on thermals, banking into the turn
// and flapping only to climb; now and then they glide down to perch on the highest point
// around, and when they spot a fish near the surface they stoop on it and carry it off.
// Mixed into Game.prototype; updateAmbientMobs hands 'soar' mobs to updateSoaringMob.

const _flyTarget = new THREE.Vector3();

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
    }
});
