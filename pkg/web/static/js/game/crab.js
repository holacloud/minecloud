// Crabs. Small groups live on sandy shores next to water. They scuttle sideways in short
// bursts (the body stays square to the way they walk), wave a claw now and then, pick at
// food with both claws and clack their pincers; their eyes swivel on stalks, each on its
// own. They wade into shallow water but never into the deep. A player who comes close
// (crouching lets you get nearer) sends them running, and on soft ground they dig in until
// only their eyes stick out, coming back up a while after the player has gone. A struck
// crab rears up with its claws open, faces the player and pinches whoever stays within
// reach, then runs off and buries itself. Self-contained: registered as the 'scuttle'
// movement through js/extensions.js.

const CRAB_BURY_DEPTH = 0.38;
const CRAB_SOFT_GROUND = new Set(['sand', 'dirt', 'grass', 'gravel', 'clay', 'snow']);
const CRAB_DUST_COLORS = { sand: 0xd9c48c, dirt: 0x8a6a48, grass: 0x8a6a48, gravel: 0x8a8580, clay: 0x9aa0aa, snow: 0xf0f4f8 };

MOB_SPECIES.crab = { eggColor: 0xd2482c, tone: 2600, speed: 0.9, maxHealth: 12, variants: 3, group: [2, 4], limit: 8, movement: 'scuttle' };

VoxelModels.MOB_SURFACES.crab = 'skin';

// Faces +z with the body wider than long; the claws reach forward and fold in front of the
// mouth, the walking legs splay out to the sides with a high knee.
VoxelModels.mobBuilders.crab = function (b, variant) {
    const palettes = [
        { shell: 0xc8402a, dark: 0x8a2418, light: 0xe8735a, belly: 0xf0d8b8, tip: 0x2a1410 },
        { shell: 0xe08a3a, dark: 0xa85a22, light: 0xf2b268, belly: 0xf6e6c6, tip: 0x3a2414 },
        { shell: 0xd9c9a0, dark: 0x9a8a62, light: 0xeee2c2, belly: 0xf6efdc, tip: 0x4a3e2c }
    ];
    const c = palettes[variant % palettes.length];
    const shellPaint = { color: c.shell, noise: 0.07, bevel: 0.14, all: (p, face) => {
        if (face === 'bottom') { p.fill(c.belly, 0.04); return; }
        if (face === 'top') {
            p.spots(c.light, Math.ceil(p.w * p.h / 6), 0.4, 0.9);
            p.spots(c.dark, Math.ceil(p.w * p.h / 10), 0.3, 0.6, 7);
            return;
        }
        p.rect(0, p.h - 0.6, p.w, 0.6, c.belly, 0.04);
    } };
    const limbPaint = { color: c.shell, noise: 0.06, bevel: 0.08, all: (p, face) => { if (face === 'bottom') p.fill(c.belly, 0.04); } };
    const tipPaint = { color: c.dark, noise: 0.05, all: (p, face) => { if (face === 'front' || face === 'top' || face === 'bottom') p.rect(0, 0, p.w, p.h, c.tip, 0.04); } };

    b.part('body', { pivot: [0, 0, 0], from: [-4.5, 1.5, -3.5], size: [9, 3, 7], paint: shellPaint });
    b.part('shell', {
        parent: 'body', pivot: [0, 4.5, 0], from: [-3.5, 0, -2.75], size: [7, 1, 5.5],
        paint: { color: c.shell, noise: 0.07, bevel: 0.1, faces: { top: (p) => { p.spots(c.light, 5, 0.4, 0.9); p.rect(p.w / 2 - 0.3, 0.5, 0.6, p.h - 1, c.dark, 0.04); } } }
    });
    b.part('mouth', { parent: 'body', pivot: [0, 2.5, 3.5], from: [-1.25, -0.6, 0], size: [2.5, 1.4, 0.6], paint: { color: c.belly, noise: 0.05, faces: { front: (p) => p.rect(0, 0.5, p.w, 0.3, c.dark, 0) } } });

    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        // Eye stalks with glossy black eyes.
        b.part(`stalk${side}`, { parent: 'body', pivot: [1.4 * sign, 4.5, 2.6], from: [-0.35, 0, -0.35], size: [0.7, 2.6, 0.7], paint: { color: c.light, noise: 0.04 }, rotation: [0.15, 0, -0.12 * sign] });
        b.part(`eye${side}`, {
            parent: `stalk${side}`, pivot: [0, 2.6, 0], from: [-0.65, 0, -0.65], size: [1.3, 1.3, 1.3],
            paint: { color: 0x0d0b0a, noise: 0.02, bevel: 0, faces: { front: (p) => p.rect(0.2, 0.2, 0.45, 0.45, 0xffffff, 0), top: (p) => p.rect(0.2, 0.6, 0.4, 0.4, 0x6a625a, 0) } }
        });

        // Claw: arm out to the side, the palm folding back in front of the mouth, a fixed
        // lower finger and a hinged upper one.
        b.part(`arm${side}`, { parent: 'body', pivot: [3.6 * sign, 3, 3], from: [-0.6, -0.6, 0], size: [1.2, 1.2, 2.6], paint: limbPaint, rotation: [-0.15, 0.55 * sign, 0] });
        b.part(`palm${side}`, { parent: `arm${side}`, pivot: [0, 0, 2.4], from: [-1.3, -1.1, -0.3], size: [2.6, 2.4, 3], paint: shellPaint, rotation: [0, -1.15 * sign, 0] });
        b.part(`fixed${side}`, { parent: `palm${side}`, pivot: [0, -0.5, 2.6], from: [-0.8, -0.5, 0], size: [1.6, 1, 2], paint: tipPaint });
        b.part(`dactyl${side}`, { parent: `palm${side}`, pivot: [0, 0.8, 2.6], from: [-0.7, -0.5, 0], size: [1.4, 1, 2.1], paint: tipPaint, rotation: [0.05, 0, 0] });

        // Four walking legs: thigh up to a high knee, shin down to the ground.
        for (let i = 0; i < 4; i++) {
            const z = 2.1 - i * 1.45;
            const spread = (0.5 - i * 0.33) * -sign;
            b.part(`leg${side}${i}`, { parent: 'body', pivot: [4.3 * sign, 2.8, z], from: [sign > 0 ? 0 : -3, -0.4, -0.4], size: [3, 0.8, 0.8], paint: limbPaint, rotation: [0, spread, 0.4 * sign] });
            b.part(`shin${side}${i}`, { parent: `leg${side}${i}`, pivot: [3 * sign, 0, 0], from: [sign > 0 ? 0 : -4.2, -0.35, -0.35], size: [4.2, 0.7, 0.7], paint: { ...limbPaint, faces: { [sign > 0 ? 'right' : 'left']: (p) => p.fill(c.tip, 0.04) } }, rotation: [0, 0, -1.65 * sign] });
        }
    });
    return { legs: ['legL0', 'legL1', 'legL2', 'legL3', 'legR0', 'legR1', 'legR2', 'legR3'] };
};

registerMobBehaviour('scuttle', {
    update(mob, delta, player) { this.crabUpdate(mob, delta, player); },
    interact(mob) { this.crabStruck(mob); },
    spawnForChunk(chunkX, chunkZ, biome) { this.crabSpawnForChunk(chunkX, chunkZ, biome); }
});

// The last crab gone: drop any sand puffs still in the air (they are animated by the crabs).
onMobEvent('removed', function (mob) {
    if (mob.userData.species !== 'crab') return;
    if (this.ambientMobs.some((other) => other !== mob && other.userData.species === 'crab')) return;
    (this.crabPuffs || []).forEach((sprite) => { this.scene.remove(sprite); sprite.material.dispose(); });
    this.crabPuffs = [];
});

Object.assign(Game.prototype, {
    // Natural spawning: a group on a sandy bank of some chunks.
    crabSpawnForChunk(chunkX, chunkZ) {
        if (this.chunkRandom(chunkX, chunkZ, 141) > 0.3) return;
        const info = getMobSpecies('crab');
        const alive = this.ambientMobs.filter((mob) => mob.userData.species === 'crab').length;
        if (alive >= info.limit) return;
        const size = this.world.chunkSize;
        for (let attempt = 0; attempt < 10; attempt++) {
            const x = chunkX * size + 1 + this.chunkRandom(chunkX, chunkZ, 142 + attempt) * (size - 2);
            const z = chunkZ * size + 1 + this.chunkRandom(chunkX, chunkZ, 162 + attempt) * (size - 2);
            const spot = this.findShoreSpot(x, z);
            if (!spot || spot.ground !== 'sand') continue;
            const [min, max] = info.group;
            const count = Math.min(info.limit - alive, min + Math.floor(this.chunkRandom(chunkX, chunkZ, 143) * (max - min + 1)));
            for (let i = 0; i < count; i++) {
                const px = spot.x + (Math.random() - 0.5) * 2;
                const pz = spot.z + (Math.random() - 0.5) * 2;
                const floor = this.cameraController.getFloorY(px, pz, spot.y + 1.1);
                const dry = floor > -20 && Math.abs(floor - spot.y) <= 1 && this.findWaterSurface(px, floor + 0.1, pz) === null;
                const mob = this.createMob('crab', dry ? new THREE.Vector3(px, floor, pz) : new THREE.Vector3(spot.x, spot.y, spot.z));
                mob.userData.pond = spot.water;
                mob.userData.natural = true;
                mob.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
                this.ambientMobs.push(mob);
            }
            return;
        }
    },

    crabState(mob) {
        const crab = {
            mode: 'wander', timer: Math.random() * 2, heading: Math.random() * Math.PI * 2, walking: false,
            facing: Math.PI / 2 - mob.rotation.y, facingTarget: 0, vy: 0, gait: 0, bury: 0, buryTarget: 0,
            raise: 0, flinch: 0, pinchCooldown: 0, pinchAnim: 0, snap: 0, fidget: null, fidgetTime: 0, fidgetSide: 'L',
            eyeYaw: [0, 0], eyeTimer: [0, 0], blink: 0, clackTimer: 2 + Math.random() * 6, patter: 0, pondSearch: 0, puffTimer: 0
        };
        crab.facingTarget = crab.facing;
        mob.userData.crab = crab;
        return crab;
    },

    // Nearest water at the crab's level within `radius`, searching outwards.
    crabFindWater(position, radius) {
        const bx = Math.floor(position.x);
        const by = Math.floor(position.y);
        const bz = Math.floor(position.z);
        for (let r = 1; r <= radius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    if (this.world.getBlockTypeAt(bx + dx, by, bz + dz) === 'water' || this.world.getBlockTypeAt(bx + dx, by - 1, bz + dz) === 'water') {
                        return new THREE.Vector3(bx + dx + 0.5, position.y, bz + dz + 0.5);
                    }
                }
            }
        }
        return null;
    },

    // Walks along `heading`, up one block or down two, into water only where it is shallow
    // enough to walk on the bed.
    crabStep(mob, heading, distance, delta) {
        const position = mob.position;
        const nx = position.x + Math.cos(heading) * distance;
        const nz = position.z + Math.sin(heading) * distance;
        const floor = this.cameraController.getFloorY(nx, nz, position.y + 1.1);
        const rise = floor - position.y;
        if (floor <= -20 || rise > 1.01 || rise < -2) return false;
        const surface = this.findWaterSurface(nx, floor + 0.1, nz);
        if (surface !== null && surface - floor > 1.6) return false;
        position.x = nx;
        position.z = nz;
        position.y = rise > 0 ? position.y + Math.min(rise, Math.max(delta * 4, distance * 2)) : floor;
        return true;
    },

    // Body square to the direction of travel, on whichever side needs the smaller turn.
    crabFaceSideways(crab) {
        const left = crab.heading + Math.PI / 2;
        const right = crab.heading - Math.PI / 2;
        const turn = (angle) => Math.abs(Math.atan2(Math.sin(angle - crab.facing), Math.cos(angle - crab.facing)));
        crab.facingTarget = turn(left) < turn(right) ? left : right;
    },

    crabStartFlee(mob, player) {
        const crab = mob.userData.crab;
        crab.mode = 'flee';
        crab.timer = 1 + Math.random() * 0.6;
        crab.fidget = null;
        crab.heading = Math.atan2(mob.position.z - player.z, mob.position.x - player.x);
        // Run for the water when it lies roughly away from the player.
        const pond = mob.userData.pond;
        if (pond && pond.distanceTo(mob.position) < 7) {
            const toPond = Math.atan2(pond.z - mob.position.z, pond.x - mob.position.x);
            if (Math.abs(Math.atan2(Math.sin(toPond - crab.heading), Math.cos(toPond - crab.heading))) < 1.4) crab.heading = toPond;
        }
        this.crabFaceSideways(crab);
        this.crabClack(mob, 3, 1);
    },

    crabChooseWander(mob) {
        const data = mob.userData;
        const crab = data.crab;
        const position = mob.position;
        crab.walking = Math.random() < 0.55;
        crab.timer = crab.walking ? 0.5 + Math.random() * 1.6 : 1.2 + Math.random() * 3.5;
        crab.fidget = null;
        if (crab.walking) {
            const homeDistance = Math.hypot(data.home.x - position.x, data.home.z - position.z);
            if (homeDistance > 6) crab.heading = Math.atan2(data.home.z - position.z, data.home.x - position.x);
            else if (data.pond && Math.random() < 0.3) crab.heading = Math.atan2(data.pond.z - position.z, data.pond.x - position.x) + (Math.random() - 0.5) * 0.8;
            // Crabs often shuffle back the way they came.
            else if (Math.random() < 0.4) crab.heading += Math.PI;
            else crab.heading = Math.random() * Math.PI * 2;
            this.crabFaceSideways(crab);
        } else {
            const roll = Math.random();
            crab.fidget = roll < 0.3 ? 'wave' : roll < 0.6 ? 'feed' : null;
            crab.fidgetSide = Math.random() < 0.5 ? 'L' : 'R';
            // Turn a little on the spot.
            if (Math.random() < 0.4) crab.facingTarget = crab.facing + (Math.random() - 0.5) * 1.6;
        }
    },

    crabUpdate(mob, delta, player) {
        const data = mob.userData;
        const crab = data.crab || this.crabState(mob);
        const position = mob.position;
        const info = getMobSpecies('crab');
        data.life += delta;
        crab.timer -= delta;
        crab.pinchCooldown = Math.max(0, crab.pinchCooldown - delta);
        crab.flinch = Math.max(0, crab.flinch - delta);

        const dx = position.x - player.x;
        const dz = position.z - player.z;
        const distance = Math.hypot(dx, dz);
        const feetGap = Math.abs(player.y - 1.6 - position.y);
        const watchful = !this.titleScreenOpen && !this.respawnPending;
        const near = watchful && feetGap < 2.5 && distance < (this.cameraController.isCrouching ? 1.8 : 4);
        const loudness = Math.max(0, 1 - Math.hypot(dx, player.y - position.y, dz) / 16);

        const ground = this.cameraController.getFloorY(position.x, position.z, position.y + 0.5);
        const surface = this.findWaterSurface(position.x, position.y + 0.1, position.z);
        const inWater = surface !== null && surface > position.y + 0.1;
        const groundType = this.world.getBlockTypeAt(Math.floor(position.x), Math.floor(position.y) - 1, Math.floor(position.z));
        const canBury = !inWater && CRAB_SOFT_GROUND.has(groundType);
        if (ground > -20 && (crab.vy !== 0 || position.y - ground > 0.02)) {
            crab.vy -= (inWater ? 6 : 16) * delta;
            position.y += crab.vy * delta;
            if (position.y <= ground) {
                position.y = ground;
                crab.vy = 0;
            }
        }
        if (!data.pond) {
            crab.pondSearch -= delta;
            if (crab.pondSearch <= 0) {
                crab.pondSearch = 6;
                data.pond = this.crabFindWater(position, 8);
            }
        }

        let speed = 0;
        if (crab.mode === 'wander') {
            crab.buryTarget = 0;
            const goal = near ? null : this.getMobGoal(mob, delta);
            if (near) {
                this.crabStartFlee(mob, player);
            } else if (goal) {
                crab.fidget = null;
                if (Math.hypot(goal.x - position.x, goal.z - position.z) > (goal.stopDistance ?? 1)) {
                    crab.heading = Math.atan2(goal.z - position.z, goal.x - position.x);
                    this.crabFaceSideways(crab);
                    speed = info.speed;
                }
            } else {
                if (crab.timer <= 0) this.crabChooseWander(mob);
                if (crab.walking) speed = info.speed * (inWater ? 0.6 : 1);
            }
        }
        if (crab.mode === 'flee') {
            speed = inWater ? 1.4 : 2.6;
            if (crab.timer <= 0) {
                if (canBury) {
                    crab.mode = 'burying';
                    crab.timer = 0.8;
                    crab.buryTarget = 1;
                    crab.puffTimer = 0;
                    this.playNoiseBurst({ duration: 0.5, volume: 0.02 * loudness, highpass: 500, lowpass: 2200 });
                } else {
                    // Rock or water: keep away instead, and look again in a moment.
                    crab.mode = 'wander';
                    crab.walking = false;
                    crab.timer = 0.6;
                }
            }
        } else if (crab.mode === 'burying' || crab.mode === 'emerging') {
            crab.puffTimer -= delta;
            if (crab.puffTimer <= 0) {
                crab.puffTimer = 0.14;
                this.crabPuff(position, 2, CRAB_DUST_COLORS[groundType]);
            }
            if (crab.timer <= 0) {
                crab.mode = crab.mode === 'burying' ? 'buried' : 'wander';
                crab.timer = crab.mode === 'buried' ? 8 + Math.random() * 10 : 0.5;
                if (crab.mode === 'wander') {
                    crab.walking = false;
                    this.crabClack(mob, 2, loudness);
                }
            }
        } else if (crab.mode === 'buried') {
            // Stay down while the player lingers; come up when the ground is gone too.
            if (!canBury || (crab.timer <= 0 && distance > 3.5)) {
                crab.mode = 'emerging';
                crab.timer = 0.7;
                crab.buryTarget = 0;
                crab.puffTimer = 0;
                this.playNoiseBurst({ duration: 0.35, volume: 0.016 * loudness, highpass: 500, lowpass: 2400 });
            } else if (crab.timer <= 0) {
                crab.timer = 1.5 + Math.random() * 2;
            }
        } else if (crab.mode === 'angry') {
            // Claws up and open, facing the player with a little side-to-side shuffle.
            crab.buryTarget = 0;
            crab.facingTarget = Math.atan2(-dz, -dx);
            crab.heading = crab.facingTarget + Math.PI / 2 * (Math.sin(data.life * 3.5) > 0 ? 1 : -1);
            speed = 0.45;
            if (watchful && distance < 1.5 && feetGap < 1.5 && crab.pinchCooldown <= 0) this.crabPinch(mob, player, loudness);
            if (crab.timer <= 0 || distance > 6) this.crabStartFlee(mob, player);
        }

        if (speed > 0 && crab.bury < 0.5) {
            let moved = this.crabStep(mob, crab.heading, speed * delta, delta);
            if (!moved && crab.mode === 'flee') {
                for (const turn of [0.8, -0.8, 1.6, -1.6]) {
                    if (this.crabStep(mob, crab.heading + turn, speed * delta, delta)) {
                        crab.heading += turn;
                        this.crabFaceSideways(crab);
                        moved = true;
                        break;
                    }
                }
            }
            if (!moved && crab.mode === 'wander') {
                crab.heading += Math.PI * (0.5 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1);
                this.crabFaceSideways(crab);
            }
            if (!moved) speed = 0;
        }

        crab.facing = this.lerpAngle(crab.facing, crab.facingTarget, Math.min(1, delta * (crab.mode === 'angry' ? 10 : 6)));
        mob.rotation.y = Math.PI / 2 - crab.facing;
        this.crabSounds(mob, delta, speed, inWater, loudness);
        this.crabAnimate(mob, delta, speed, player);
    },

    crabStruck(mob) {
        const data = mob.userData;
        const crab = data.crab || this.crabState(mob);
        const loudness = 1;
        data.health -= 4;
        this.updateMobHealthBar(mob);
        this.playTone({ frequency: getMobSpecies('crab').tone * 0.5, endFrequency: getMobSpecies('crab').tone * 0.35, duration: 0.05, type: 'square', volume: 0.012, release: 0.05 });
        this.playNoiseBurst({ duration: 0.04, volume: 0.018, highpass: 900, lowpass: 4000 });
        if (data.health <= 0) {
            this.crabPuff(mob.position, 6, 0xf0d8b8);
            this.emitMobEvent('defeated', mob, 'player');
            this.removeMob(mob);
            this.receiveSystemMessage({ text: 'You defeated the crab' });
            return;
        }
        if (crab.bury > 0.3) this.crabPuff(mob.position, 6, CRAB_DUST_COLORS[this.world.getBlockTypeAt(Math.floor(mob.position.x), Math.floor(mob.position.y) - 1, Math.floor(mob.position.z))]);
        crab.mode = 'angry';
        crab.timer = 2.2 + Math.random() * 0.8;
        crab.fidget = null;
        crab.buryTarget = 0;
        crab.vy = 2.6;
        crab.flinch = 0.35;
        crab.pinchCooldown = Math.max(crab.pinchCooldown, 0.45);
        this.crabClack(mob, 4, loudness);
    },

    crabPinch(mob, player, loudness) {
        const crab = mob.userData.crab;
        crab.pinchCooldown = 1.1;
        crab.pinchAnim = 0.3;
        const toPlayer = Math.atan2(player.z - mob.position.z, player.x - mob.position.x);
        this.cameraController.applyKnockback(Math.cos(toPlayer), Math.sin(toPlayer), 3, 2);
        this.applyDamage(1, 'You were pinched by a crab', 'mob');
        // A sharp snap.
        this.playTone({ frequency: 1900, endFrequency: 800, duration: 0.04, type: 'square', volume: 0.025 * Math.max(loudness, 0.5), attack: 0.001, release: 0.04 });
        this.playNoiseBurst({ duration: 0.03, volume: 0.03, highpass: 1500, lowpass: 6000 });
    },

    // `count` dry clicks of the pincers, a few hundredths of a second apart.
    crabClack(mob, count, loudness) {
        if (loudness <= 0) return;
        mob.userData.crab.snap = 0.25 + count * 0.07;
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                this.playNoiseBurst({ duration: 0.012, volume: 0.022 * loudness, highpass: 2800, lowpass: 8000 });
                this.playTone({ frequency: 2400 + Math.random() * 1400, duration: 0.01, type: 'square', volume: 0.006 * loudness, attack: 0.001, release: 0.02 });
            }, i * (55 + Math.random() * 40));
        }
    },

    crabSounds(mob, delta, speed, inWater, loudness) {
        const crab = mob.userData.crab;
        if (loudness <= 0) return;
        // Pitter-patter of eight legs.
        if (speed > 0 && loudness > 0.5) {
            crab.patter -= delta;
            if (crab.patter <= 0) {
                crab.patter = speed > 2 ? 0.06 : 0.13;
                this.playNoiseBurst({ duration: 0.008, volume: (inWater ? 0.002 : 0.005) * loudness, highpass: 3500, lowpass: 9000 });
            }
        }
        // Idle clacking now and then.
        crab.clackTimer -= delta;
        if (crab.clackTimer <= 0) {
            crab.clackTimer = 3 + Math.random() * 7;
            if (crab.mode === 'wander' && loudness > 0.15) this.crabClack(mob, 2 + Math.floor(Math.random() * 2), loudness);
        }
        // Bubbles in the water.
        if (inWater && Math.random() < delta * 0.35) {
            this.world.addRipple(mob.position.x, mob.position.z, 0.1);
            this.playTone({ frequency: 500, endFrequency: 1100, duration: 0.05, type: 'sine', volume: 0.006 * loudness, release: 0.04 });
        }
    },

    crabAnimate(mob, delta, speed, player) {
        const data = mob.userData;
        const crab = data.crab;
        const parts = data.modelParts || {};
        const digging = crab.mode === 'burying' || crab.mode === 'emerging';
        crab.gait += ((speed > 0 ? 1 : 0) - crab.gait) * Math.min(1, delta * 10);
        crab.bury += (crab.buryTarget - crab.bury) * Math.min(1, delta * (crab.mode === 'angry' ? 8 : 2.5));
        crab.raise += ((crab.mode === 'angry' ? 1 : crab.mode === 'flee' ? 0.35 : 0) - crab.raise) * Math.min(1, delta * 8);
        crab.pinchAnim = Math.max(0, crab.pinchAnim - delta);
        crab.snap = Math.max(0, crab.snap - delta);
        data.stepPhase += delta * (speed * 16 + (digging ? 24 : 0));
        const amp = Math.max(crab.gait, digging ? 1 : 0);

        // Legs ripple front to back, the two sides out of step.
        ['L', 'R'].forEach((side, sideIndex) => {
            const sign = side === 'L' ? 1 : -1;
            for (let i = 0; i < 4; i++) {
                const leg = parts[`leg${side}${i}`];
                if (!leg) continue;
                const base = leg.userData.baseRotation;
                const phase = data.stepPhase + i * 1.7 + sideIndex * Math.PI;
                const tap = Math.max(0, Math.sin(data.life * 0.9 + i * 2.3 + sideIndex) - 0.95) * 6 * (1 - amp);
                leg.rotation.z = base.z + sign * (Math.max(0, Math.sin(phase)) * 0.5 * amp + tap * 0.3) - sign * crab.bury * 0.3;
                leg.rotation.y = base.y + sign * Math.cos(phase) * 0.22 * amp;
            }
        });

        if (data.modelRoot) {
            const shake = digging ? Math.sin(data.life * 38) * 0.07 : 0;
            data.modelRoot.position.y = Math.abs(Math.sin(data.stepPhase * 2)) * 0.012 * crab.gait - crab.bury * CRAB_BURY_DEPTH + crab.raise * 0.03;
            data.modelRoot.rotation.z = Math.sin(data.stepPhase) * 0.05 * crab.gait + shake;
            // Rearing up on the back legs when threatened.
            data.modelRoot.rotation.x = -crab.raise * 0.18;
        }
        if (parts.mouth) parts.mouth.scale.y = 1 + Math.sin(data.life * 14) * 0.15;

        // Claws.
        crab.fidgetTime += delta;
        const pinch = crab.pinchAnim > 0 ? Math.sin((1 - crab.pinchAnim / 0.3) * Math.PI) : 0;
        ['L', 'R'].forEach((side, index) => {
            const sign = side === 'L' ? 1 : -1;
            const arm = parts[`arm${side}`];
            const palm = parts[`palm${side}`];
            const dactyl = parts[`dactyl${side}`];
            if (!arm || !palm || !dactyl) return;
            let lift = crab.raise;
            let swing = 0;
            let open = Math.max(0, Math.sin(data.life * 1.7 + index * 2) - 0.7) * 1.6;
            if (crab.snap > 0) open = Math.abs(Math.sin(crab.snap * 40 + index)) * 0.7;
            if (crab.fidget === 'wave' && side === crab.fidgetSide) {
                lift = Math.max(lift, 0.9);
                swing = Math.sin(crab.fidgetTime * 7) * 0.35;
                open = 0.3 + Math.sin(crab.fidgetTime * 7) * 0.25;
            } else if (crab.fidget === 'feed') {
                // Alternately pick at the ground and bring it up to the mouth.
                const pick = Math.sin(crab.fidgetTime * 5 + index * Math.PI);
                lift = Math.max(lift, Math.max(0, pick) * 0.35);
                swing = -Math.max(0, pick) * 0.25;
                open = Math.max(0, -pick) * 0.5;
            }
            if (crab.mode === 'angry') open = pinch > 0 ? 0.9 * (1 - pinch) : 0.55 + Math.sin(data.life * 9 + index) * 0.2;
            const follow = Math.min(1, delta * 12);
            arm.rotation.x += (arm.userData.baseRotation.x - lift * 1.1 + pinch * 0.6 - (crab.mode === 'angry' ? 0 : crab.bury * 0.2) - arm.rotation.x) * follow;
            arm.rotation.y += (arm.userData.baseRotation.y + swing * sign + (crab.mode === 'angry' ? 0.3 * sign : 0) - arm.rotation.y) * follow;
            palm.rotation.x += (palm.userData.baseRotation.x - lift * 0.35 - palm.rotation.x) * follow;
            dactyl.rotation.x += (dactyl.userData.baseRotation.x - open * 0.8 - dactyl.rotation.x) * Math.min(1, delta * 20);
        });

        // Eye stalks swivel independently; buried or upset crabs keep them on the player.
        const watching = crab.mode === 'buried' || crab.mode === 'angry' || crab.mode === 'burying' || Math.hypot(mob.position.x - player.x, mob.position.z - player.z) < 7;
        const toPlayer = Math.atan2(player.z - mob.position.z, player.x - mob.position.x);
        const relative = Math.atan2(Math.sin(toPlayer - crab.facing), Math.cos(toPlayer - crab.facing));
        crab.blink = Math.max(0, crab.blink - delta);
        if (crab.blink === 0 && Math.random() < delta * 0.25) crab.blink = 0.18;
        ['L', 'R'].forEach((side, index) => {
            const stalk = parts[`stalk${side}`];
            if (!stalk) return;
            crab.eyeTimer[index] -= delta;
            if (crab.eyeTimer[index] <= 0) {
                crab.eyeTimer[index] = 0.4 + Math.random() * 1.8;
                crab.eyeYaw[index] = (Math.random() - 0.5) * 1.8;
            }
            const yaw = watching ? THREE.MathUtils.clamp(-relative, -1.3, 1.3) : crab.eyeYaw[index];
            const base = stalk.userData.baseRotation;
            stalk.rotation.y += (base.y + yaw - stalk.rotation.y) * Math.min(1, delta * 8);
            // Folded down for a moment when struck or blinking; stretched up out of the sand.
            const fold = crab.flinch > 0 ? 1.1 : crab.blink > 0 ? 0.6 : 0;
            stalk.rotation.x += (base.x + fold - crab.bury * 0.15 - stalk.rotation.x) * Math.min(1, delta * 18);
            stalk.scale.y = 1 + crab.bury * 0.3;
        });
    },

    // Little puffs of sand kicked up while digging.
    crabPuff(position, count, color = 0xd9c48c) {
        this.crabPuffs = this.crabPuffs || [];
        for (let i = 0; i < count; i++) {
            const material = new THREE.SpriteMaterial({ map: this.getFireflyHaloTexture(), color, transparent: true, depthWrite: false, opacity: 0.6 });
            const sprite = new THREE.Sprite(material);
            sprite.position.set(position.x + (Math.random() - 0.5) * 0.5, position.y + 0.05, position.z + (Math.random() - 0.5) * 0.5);
            sprite.scale.setScalar(0.2 + Math.random() * 0.2);
            sprite.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2);
            sprite.userData.age = 0;
            sprite.userData.life = 0.5 + Math.random() * 0.4;
            this.scene.add(sprite);
            this.crabPuffs.push(sprite);
        }
    },

    crabUpdatePuffs(delta) {
        if (!this.crabPuffs || !this.crabPuffs.length) return;
        this.crabPuffs = this.crabPuffs.filter((sprite) => {
            sprite.userData.age += delta;
            const t = sprite.userData.age / sprite.userData.life;
            if (t >= 1) {
                this.scene.remove(sprite);
                sprite.material.dispose();
                return false;
            }
            sprite.userData.velocity.y -= 3 * delta;
            sprite.position.addScaledVector(sprite.userData.velocity, delta);
            sprite.scale.multiplyScalar(1 + delta * 0.8);
            sprite.material.opacity = 0.6 * (1 - t);
            return true;
        });
    }
});

// Sand puffs outlive the crab that kicked them up.
registerFrameUpdate(function (delta) {
    this.crabUpdatePuffs(delta);
});
