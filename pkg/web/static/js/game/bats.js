// Bats. A colony roosts under a roof (the underside of a tree's canopy, an overhang, a tunnel
// or a house): by day each bat hangs upside down with its wings wrapped around it, and a
// player who comes too close (unless sneaking) or strikes one sends the whole colony
// fluttering off for a while. At dusk they wake one by one and flit about in jerky, erratic
// flight, clicking as they echolocate and chasing fireflies; at dawn they return to the roost.
// Mixed into Game.prototype; updateAmbientMobs hands 'flutter' mobs to updateFlutteringMob.

const _batDesired = new THREE.Vector3();
// Hanging head down, its feet (0.2 blocks behind its middle) grip the roof.
const HANG_DROP = 0.21;

Object.assign(Game.prototype, {
    // Underside of the first roof above open air in column (x, z): a solid block with two
    // free blocks below it.
    findRoost(x, z) {
        const bx = Math.floor(x);
        const bz = Math.floor(z);
        const top = Math.floor(this.cameraController.getFloorY(bx + 0.5, bz + 0.5, 96)) - 1;
        if (top <= -20) return null;
        for (let y = top; y > top - 24; y--) {
            if (!this.world.hasSolidBlock(bx, y, bz)) continue;
            if (this.world.hasSolidBlock(bx, y - 1, bz) || this.world.hasSolidBlock(bx, y - 2, bz)) continue;
            if (this.world.getBlockTypeAt(bx, y - 1, bz) === 'water') return null;
            return new THREE.Vector3(bx + 0.5, y, bz + 0.5);
        }
        return null;
    },

    findRoostNear(x, z, radius) {
        for (let r = 0; r <= radius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const roost = this.findRoost(x + dx, z + dz);
                    if (roost) return roost;
                }
            }
        }
        return null;
    },

    // The roost cell and the neighbouring ones under the same roof, for the bats to share.
    findRoostCells(roost) {
        const cells = [roost];
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                if (dx === 0 && dz === 0) continue;
                const cell = this.findRoost(roost.x + dx, roost.z + dz);
                if (cell && Math.abs(cell.y - roost.y) <= 2) cells.push(cell);
            }
        }
        return cells;
    },

    roostIsValid(cell) {
        const x = Math.floor(cell.x);
        const z = Math.floor(cell.z);
        return this.world.hasSolidBlock(x, cell.y, z) && !this.world.hasSolidBlock(x, cell.y - 1, z);
    },

    // Natural spawning: now and then a chunk has a colony under one of its roofs.
    spawnBatsForChunk(chunkX, chunkZ, biome) {
        if (biome === 'desert') return;
        if (this.chunkRandom(chunkX, chunkZ, 81) > (biome === 'forest' ? 0.25 : 0.12)) return;
        if (this.ambientMobs.filter((mob) => mob.userData.species === 'bat').length >= getMobSpecies('bat').limit) return;
        const size = this.world.chunkSize;
        for (let i = 0; i < 24; i++) {
            const roost = this.findRoost(chunkX * size + this.chunkRandom(chunkX, chunkZ, 82 + i) * size, chunkZ * size + this.chunkRandom(chunkX, chunkZ, 112 + i) * size);
            if (!roost) continue;
            const [min, max] = getMobSpecies('bat').group;
            const colony = this.spawnBatColony(roost, min + Math.floor(this.chunkRandom(chunkX, chunkZ, 83) * (max - min + 1)));
            colony.bats.forEach((bat) => {
                bat.userData.natural = true;
                bat.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
            });
            return;
        }
    },

    // `count` bats hanging under `roost`; with no roost they spawn in the air at `center`.
    spawnBatColony(roost, count, center = null) {
        const colony = { roost, cells: roost ? this.findRoostCells(roost) : [], center: (center || roost).clone(), bats: [] };
        for (let i = 0; i < count; i++) {
            const bat = this.createMob('bat', colony.center);
            const data = bat.userData;
            bat.rotation.order = 'YXZ';
            data.colony = colony;
            data.velocity = new THREE.Vector3();
            data.flight = { mode: 'fly', target: new THREE.Vector3(), retarget: 0, wake: 0, panic: 0, awake: 0, chirp: Math.random() * 2, fold: 0, wingPhase: Math.random() * 6, perch: new THREE.Vector3(), validate: 0 };
            this.choosePerch(bat);
            if (roost) this.hangBat(bat);
            else bat.position.set(colony.center.x + (Math.random() - 0.5) * 2, colony.center.y + Math.random(), colony.center.z + (Math.random() - 0.5) * 2);
            colony.bats.push(bat);
            this.ambientMobs.push(bat);
        }
        return colony;
    },

    // For /mob and eggs: a colony under the nearest roof, out flying for a while first so the
    // player sees them; with no roof around they keep flying until they find one.
    spawnBatColonyNear(x, z, y) {
        const player = this.getLocalPlayerPosition();
        const roost = this.findRoostNear(player.x, player.z, 10);
        const [min, max] = getMobSpecies('bat').group;
        const colony = this.spawnBatColony(roost, min + Math.floor(Math.random() * (max - min + 1)), new THREE.Vector3(x, y, z));
        colony.bats.forEach((bat) => {
            const flight = bat.userData.flight;
            flight.mode = 'fly';
            flight.awake = 15;
            bat.position.set(x + (Math.random() - 0.5) * 2, y + Math.random(), z + (Math.random() - 0.5) * 2);
        });
        this.batSqueak(colony.bats[0], 1);
        this.receiveSystemMessage({ text: roost ? `Spawned ${colony.bats.length} bats; they will roost under the nearest roof` : `Spawned ${colony.bats.length} bats; no roof nearby, so they keep flying` });
    },

    choosePerch(bat) {
        const colony = bat.userData.colony;
        const perch = bat.userData.flight.perch;
        if (colony.cells.length === 0) return false;
        const cell = colony.cells[Math.floor(Math.random() * colony.cells.length)];
        perch.set(cell.x + (Math.random() - 0.5) * 0.6, cell.y, cell.z + (Math.random() - 0.5) * 0.6);
        return true;
    },

    hangBat(bat) {
        const flight = bat.userData.flight;
        flight.mode = 'hang';
        flight.wake = Math.random() * 6;
        bat.position.copy(flight.perch);
        bat.position.y -= HANG_DROP;
        bat.userData.velocity.set(0, 0, 0);
        bat.rotation.y = Math.random() * Math.PI * 2;
    },

    // Every bat of the colony near `from` takes off in a panic, a few at a time.
    startleBats(bat, from) {
        const colony = bat.userData.colony;
        colony.bats.forEach((other) => {
            if (!other.parent || other.position.distanceTo(bat.position) > 7) return;
            const flight = other.userData.flight;
            flight.panic = 6 + Math.random() * 4;
            flight.retarget = 0;
            if (flight.mode === 'hang') {
                flight.mode = 'fly';
                // Drop off the roof first, away from whoever disturbed them.
                other.userData.velocity.set(other.position.x - from.x, -1.5, other.position.z - from.z).setLength(2.5);
            }
        });
        this.batSqueak(bat, 1);
        this.playNoiseBurst({ duration: 0.25, volume: 0.02, highpass: 900, lowpass: 3500 });
    },

    updateFlutteringMob(mob, delta, player) {
        const data = mob.userData;
        const flight = data.flight;
        const colony = data.colony;
        data.life += delta;
        flight.panic = Math.max(0, flight.panic - delta);
        flight.awake = Math.max(0, flight.awake - delta);
        const head = _batDesired.set(player.x, player.y - 0.4, player.z);
        const distance = mob.position.distanceTo(head);
        const night = this.isNightTime();

        if (flight.mode === 'hang') {
            flight.validate -= delta;
            if (flight.validate <= 0) {
                flight.validate = 1;
                if (!this.roostIsValid(flight.perch)) {
                    flight.mode = 'fly';
                    flight.panic = 3;
                }
            }
            if (night) {
                flight.wake -= delta;
                if (flight.wake <= 0) flight.mode = 'fly';
            }
            if (!this.titleScreenOpen && distance < (this.cameraController.isCrouching ? 1.6 : 3.5)) this.startleBats(mob, head);
            // A slow sway, and now and then a stretch of the wings.
            flight.fold = Math.min(1, flight.fold + delta * 3);
            mob.position.copy(flight.perch);
            mob.position.y -= HANG_DROP;
            mob.rotation.x = Math.PI / 2 + Math.sin(data.life * 1.3) * 0.05;
            mob.rotation.z = Math.sin(data.life * 0.9) * 0.06;
            if (Math.random() < delta * 0.05) flight.stretch = 1;
            flight.stretch = Math.max(0, (flight.stretch || 0) - delta * 0.8);
            this.poseBat(mob, delta, false);
            if (distance < 8 && Math.random() < delta * 0.1) this.batSqueak(mob, 0.4);
            return;
        }

        // Out flying while it is night, while frightened or just spawned; otherwise home.
        const outside = night || flight.panic > 0 || flight.awake > 0;
        if (!outside && colony.cells.length === 0 && Math.random() < delta * 0.3) {
            // Homeless: look for a roof where it is.
            const roost = this.findRoostNear(mob.position.x, mob.position.z, 6);
            if (roost) {
                colony.roost = roost;
                colony.cells = this.findRoostCells(roost);
                colony.center.copy(roost);
                colony.bats.forEach((bat) => this.choosePerch(bat));
            }
        }
        const homing = !outside && colony.cells.length > 0;
        let speed = getMobSpecies('bat').speed * (flight.panic > 0 ? 1.4 : 1);
        if (homing) {
            if (!this.roostIsValid(flight.perch) && !this.choosePerch(mob)) colony.cells = [];
            flight.target.copy(flight.perch);
            flight.target.y -= HANG_DROP;
            if (mob.position.distanceTo(flight.target) < 0.35) {
                this.hangBat(mob);
                return;
            }
            // Slow down on the final approach.
            speed *= THREE.MathUtils.clamp(mob.position.distanceTo(flight.target) / 2, 0.35, 1);
        } else {
            flight.retarget -= delta;
            if (flight.retarget <= 0 || mob.position.distanceTo(flight.target) < 0.8) this.chooseBatTarget(mob, head);
        }

        // Jerky steering: quick turns towards a target that changes often, plus a flutter.
        _batDesired.subVectors(flight.target, mob.position).setLength(speed);
        _batDesired.x += Math.sin(data.life * 13 + data.variant) * 1.2;
        _batDesired.y += Math.sin(data.life * 17) * 0.9;
        _batDesired.z += Math.cos(data.life * 11) * 1.2;
        const previousHeading = Math.atan2(data.velocity.z, data.velocity.x);
        data.velocity.lerp(_batDesired, Math.min(1, delta * 6));
        const nx = mob.position.x + data.velocity.x * delta;
        const ny = mob.position.y + data.velocity.y * delta;
        const nz = mob.position.z + data.velocity.z * delta;
        if (this.world.hasSolidBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz)) || this.world.getBlockTypeAt(Math.floor(nx), Math.floor(ny), Math.floor(nz)) === 'water') {
            // Bounce off and pick somewhere else.
            data.velocity.multiplyScalar(-0.6);
            if (!homing) flight.retarget = 0;
        } else {
            mob.position.set(nx, ny, nz);
        }

        const horizontal = Math.hypot(data.velocity.x, data.velocity.z);
        const turn = this.lerpAngle(0, Math.atan2(data.velocity.z, data.velocity.x) - previousHeading, 1) / Math.max(delta, 0.001);
        flight.fold = Math.max(0, flight.fold - delta * 4);
        if (horizontal > 0.2) mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.atan2(data.velocity.x, data.velocity.z), Math.min(1, delta * 12));
        const pitch = THREE.MathUtils.clamp(Math.atan2(-data.velocity.y, Math.max(horizontal, 0.5)), -0.8, 0.8);
        mob.rotation.x += (pitch - mob.rotation.x) * Math.min(1, delta * 8);
        mob.rotation.z += (THREE.MathUtils.clamp(-turn * 0.08, -0.8, 0.8) - mob.rotation.z) * Math.min(1, delta * 8);
        this.poseBat(mob, delta, true);

        // Echolocation clicks, louder the closer it is.
        flight.chirp -= delta;
        if (flight.chirp <= 0) {
            flight.chirp = (flight.panic > 0 ? 0.25 : 0.6) + Math.random() * 1.4;
            if (distance < 18) this.batSqueak(mob, 1 - distance / 18);
        }
    },

    // Somewhere to flit to: around the roost (or the player who frightened it), above the
    // ground, sometimes at a cloud of fireflies.
    chooseBatTarget(mob, head) {
        const data = mob.userData;
        const flight = data.flight;
        const colony = data.colony;
        flight.retarget = 0.35 + Math.random() * 0.8;
        if (flight.panic > 0) {
            // Whirl about, some of them right past the player's head.
            const around = Math.random() < 0.35 ? head : mob.position;
            flight.target.set(around.x + (Math.random() - 0.5) * 6, around.y + (Math.random() - 0.3) * 3, around.z + (Math.random() - 0.5) * 6);
            return;
        }
        if (this.isNightTime() && Math.random() < 0.25) {
            const fireflies = this.ambientMobs.find((other) => other.userData.species === 'firefly' && other.position.distanceTo(colony.center) < 30);
            if (fireflies) {
                flight.target.set(fireflies.position.x + (Math.random() - 0.5) * 3, fireflies.position.y + 0.8 + Math.random() * 1.5, fireflies.position.z + (Math.random() - 0.5) * 3);
                return;
            }
        }
        const range = colony.cells.length > 0 ? 10 : 6;
        const x = colony.center.x + (Math.random() - 0.5) * range * 2;
        const z = colony.center.z + (Math.random() - 0.5) * range * 2;
        // Under the roof the floor is below the roost; elsewhere, the ground.
        let floor = this.cameraController.getFloorY(x, z, colony.center.y - 0.5);
        if (floor <= -20) floor = colony.center.y - 4;
        flight.target.set(x, floor + 1.3 + Math.random() * 4.5, z);
    },

    // Wings beat fast in flight and wrap around the body when hanging.
    poseBat(mob, delta, flying) {
        const data = mob.userData;
        const flight = data.flight;
        const parts = data.modelParts;
        const fold = flight.fold;
        const stretch = flying ? 0 : flight.stretch || 0;
        flight.wingPhase += delta * (flying ? 38 : 8);
        const beat = Math.sin(flight.wingPhase) * 0.9;
        const lag = Math.sin(flight.wingPhase - 0.8) * 0.6;
        const open = Math.max(1 - fold, Math.sin(stretch * Math.PI));
        ['L', 'R'].forEach((side) => {
            const sign = side === 'L' ? 1 : -1;
            // Folded: the wing swings back along the body and wraps round its belly, and the
            // tip doubles back over it.
            const folded = 1 - open;
            parts[`wing${side}`].rotation.set(0, sign * 1.45 * folded, sign * (open * (flying ? beat : 0.15) - 0.9 * folded));
            parts[`wingTip${side}`].rotation.set(0, sign * Math.PI * 0.92 * folded, sign * open * (flying ? lag : 0.1));
            parts[`leg${side}`].rotation.x = flying ? 0.3 : 0;
        });
        if (data.head) {
            data.head.rotation.x = flying ? 0 : 0.3;
            if (!flying && Math.random() < delta * 0.4) data.lookYaw = (Math.random() - 0.5) * 1.6;
            data.head.rotation.y += ((flying ? 0 : data.lookYaw) - data.head.rotation.y) * Math.min(1, delta * 5);
        }
    },

    // A high, short click; louder squeaks when frightened.
    batSqueak(mob, loudness) {
        if (!mob || loudness <= 0) return;
        const tone = getMobSpecies('bat').tone * (0.85 + Math.random() * 0.3);
        const panic = mob.userData.flight && mob.userData.flight.panic > 0;
        this.playTone({ frequency: tone, endFrequency: tone * 0.75, duration: panic ? 0.06 : 0.025, type: 'sine', volume: 0.012 * loudness, release: 0.03 });
        if (panic) this.playTone({ frequency: tone * 1.2, endFrequency: tone * 0.9, duration: 0.05, type: 'triangle', volume: 0.008 * loudness, attack: 0.02, release: 0.03 });
    }
});
