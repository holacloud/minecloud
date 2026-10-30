// Foxes. A shy hunter of forests and meadows: it trots about, stops to sniff the ground,
// sits with its bushy tail curled round its feet and now and then yawns. When it spots a
// rabbit or a frog on dry land it creeps up low, freezes with its rump wiggling and pounces
// in a high arc; with a catch it trots off, lies down and eats it. At night it yips to the
// other foxes and steals items lying on the ground, running off with them in its mouth
// (it drops them when struck, or stashes them somewhere at dawn). It keeps its distance
// from the player and bolts if approached quickly; sneaking lets you get close, and it
// will sit and watch you with its head tilted. At night its eyes shine.
// Movement mode 'prowl'; mixed into Game.prototype and hooked in via js/extensions.js.

const FOX_PREY = ['rabbit', 'frog'];
const FOX_GRAVITY = 18;
const FOX_WALK = 0.9;
const FOX_TROT = 2.3;
const FOX_RUN = 4.6;
const FOX_CREEP = 0.7;

MOB_SPECIES.fox = { eggColor: 0xd9661f, tone: 760, speed: FOX_WALK, maxHealth: 12, variants: 4, group: [1, 2], limit: 4, movement: 'prowl', spawnBiomes: { forest: 2, plains: 1 } };
VoxelModels.MOB_SURFACES.fox = 'fur';

// Red, ginger, arctic and silver coats; all with a white-tipped tail and dark socks.
VoxelModels.mobBuilders.fox = function (b, variant) {
    const palettes = [
        { fur: 0xd9661f, back: 0xb8501a, belly: 0xf6efe3, socks: 0x2a1d18, ear: 0x2a1d18 },
        { fur: 0xe8893a, back: 0xcf6f28, belly: 0xfbf3e4, socks: 0x4a3024, ear: 0x3a2a22 },
        { fur: 0xeeeeea, back: 0xdcdcd6, belly: 0xffffff, socks: 0xbfc3c8, ear: 0x9aa0a6 },
        { fur: 0x5c6168, back: 0x41454b, belly: 0xb7bbc0, socks: 0x1d1d20, ear: 0x1d1d20 }
    ];
    const c = palettes[variant % palettes.length];
    const fur = (extra) => ({ color: c.fur, noise: 0.06, ...extra });

    b.part('body', {
        pivot: [0, 0, 0], from: [-2.5, 5, -5], size: [5, 4.5, 10],
        paint: fur({
            faces: {
                top: (p) => p.rect(1.25, 0, 2.5, p.h, c.back, 0.06),
                bottom: (p) => p.fill(c.belly, 0.04),
                front: (p) => p.rect(1, 0.75, 3, 3.75, c.belly, 0.04),
                left: (p) => p.rect(0, 3.75, p.w, 0.75, c.belly, 0.04),
                right: (p) => p.rect(0, 3.75, p.w, 0.75, c.belly, 0.04)
            }
        })
    });
    b.part('head', {
        parent: 'body', pivot: [0, 8.5, 5], from: [-3, -2, -0.5], size: [6, 4.5, 4],
        paint: fur({
            faces: {
                front: (p) => {
                    p.rect(0, 2.75, 6, 1.75, c.belly, 0.03);
                    p.rect(0.6, 1.25, 1.3, 0.8, 0xe0a020, 0);
                    p.rect(4.1, 1.25, 1.3, 0.8, 0xe0a020, 0);
                    p.rect(1.2, 1.25, 0.4, 0.8, 0x120d0a, 0);
                    p.rect(4.4, 1.25, 0.4, 0.8, 0x120d0a, 0);
                    p.rect(0.4, 2.05, 1.6, 0.35, c.back, 0);
                    p.rect(4, 2.05, 1.6, 0.35, c.back, 0);
                },
                left: (p) => p.rect(0, 2.75, p.w, 1.75, c.belly, 0.03),
                right: (p) => p.rect(0, 2.75, p.w, 1.75, c.belly, 0.03),
                bottom: (p) => p.fill(c.belly, 0.03)
            }
        })
    });
    b.part('snout', {
        parent: 'head', pivot: [0, -1, 3.5], from: [-1.25, -0.25, 0], size: [2.5, 1.5, 3],
        paint: fur({
            faces: {
                front: (p) => { p.rect(0, 0.75, p.w, 0.75, c.belly, 0.02); p.rect(0.65, 0, 1.2, 0.8, 0x15100e, 0); },
                left: (p) => p.rect(0, 0.9, p.w, 0.6, c.belly, 0.02),
                right: (p) => p.rect(0, 0.9, p.w, 0.6, c.belly, 0.02),
                bottom: (p) => p.fill(c.belly, 0.02)
            }
        })
    });
    b.part('jaw', { parent: 'head', pivot: [0, -1.25, 3.5], from: [-1, -0.75, 0], size: [2, 0.75, 2.75], paint: { color: c.belly, noise: 0.03, faces: { top: (p) => p.fill(0x9a4848, 0.04) } } });
    const earPaint = { color: c.fur, noise: 0.05, faces: { front: (p) => p.rect(0.5, 0.5, 1, 1.75, c.belly, 0.03), back: (p) => p.rect(0, 0, p.w, 1, c.ear, 0.03) } };
    b.part('earL', { parent: 'head', pivot: [1.9, 2.5, 1.25], from: [-1, 0, -0.5], size: [2, 2.25, 1], paint: earPaint, rotation: [0, 0, -0.15] });
    b.part('earR', { parent: 'head', pivot: [-1.9, 2.5, 1.25], from: [-1, 0, -0.5], size: [2, 2.25, 1], paint: earPaint, rotation: [0, 0, 0.15] });
    b.part('earTipL', { parent: 'earL', pivot: [0, 2.25, 0], from: [-0.5, 0, -0.5], size: [1, 1, 1], paint: { color: c.ear, noise: 0.03 } });
    b.part('earTipR', { parent: 'earR', pivot: [0, 2.25, 0], from: [-0.5, 0, -0.5], size: [1, 1, 1], paint: { color: c.ear, noise: 0.03 } });

    // Bushy tail in three segments, thickest in the middle, with a white tip.
    b.part('tail1', { parent: 'body', pivot: [0, 8.5, -5], from: [-1.25, -1.25, -4], size: [2.5, 2.5, 4], paint: fur({ faces: { top: (p) => p.fill(c.back, 0.06) } }), rotation: [-0.5, 0, 0] });
    b.part('tail2', { parent: 'tail1', pivot: [0, 0, -4], from: [-1.6, -1.6, -3.5], size: [3.2, 3.2, 3.5], paint: fur({ faces: { top: (p) => p.fill(c.back, 0.06) } }), rotation: [0.15, 0, 0] });
    b.part('tail3', { parent: 'tail2', pivot: [0, 0, -3.5], from: [-1.25, -1.25, -2.5], size: [2.5, 2.5, 2.5], paint: { color: 0xfbfaf6, noise: 0.04 }, rotation: [0.2, 0, 0] });

    const legs = VoxelModels.quadLegs(b, {
        size: [1.5, 5, 1.5], hipY: 5.5, x: 1.4, zFront: 3.5, zBack: -3.5,
        paint: fur({ all: (p, face) => { if (face !== 'top') p.rect(0, 2.25, p.w, 2.75, c.socks, 0.04); } })
    });
    return { legs, head: 'head', tail: ['tail1', 'tail2', 'tail3'] };
};

registerMobBehaviour('prowl', {
    update(mob, delta, player) { this.updateFox(mob, delta, player); },
    interact(mob) { this.foxStruck(mob); }
});

// Whatever it was carrying falls where it vanished (despawned far away, defeated).
onMobEvent('removed', function (mob) {
    if (mob.userData.fox) this.foxDropItem(mob);
});

Object.assign(Game.prototype, {
    foxInit(mob) {
        mob.userData.fox = {
            mode: 'wander', timer: 0, action: 'walk', actionTimer: 1 + Math.random() * 3,
            facing: mob.userData.direction, heading: mob.userData.direction,
            velocity: new THREE.Vector3(), airborne: false, swimming: false,
            prey: null, carcass: null, eatTotal: 1, item: null, pickupId: null,
            huntCooldown: 4 + Math.random() * 8, stealCooldown: 0, scan: Math.random(), stash: 0,
            approach: 0, lastDistance: null, yipTimer: 4 + Math.random() * 20, bark: 0,
            sit: 0, crouch: 0, air: 0, lookYaw: 0, lookPitch: 0, lookTimer: 0, tilt: 0,
            noiseTimer: 0, yawn: 0
        };
    },

    updateFox(mob, delta, player) {
        const data = mob.userData;
        if (!data.fox) this.foxInit(mob);
        const fox = data.fox;
        const position = mob.position;
        data.life += delta;

        if (position.y < -20) {
            // Spawned before its chunk was generated: drop it onto the terrain once it exists.
            const ground = this.cameraController.getFloorY(position.x, position.z, 64);
            if (ground <= -20) return;
            position.y = ground;
            data.home.y = ground;
        }

        fox.huntCooldown -= delta;
        fox.stealCooldown = Math.max(0, fox.stealCooldown - delta);
        fox.bark = Math.max(0, fox.bark - delta);
        fox.timer -= delta;
        const night = this.isNightTime();

        // How close the player is and how fast they are coming.
        const feetY = player.y - this.cameraController.eyeHeight;
        const distance = Math.hypot(position.x - player.x, position.z - player.z);
        const playerDistance = !this.titleScreenOpen && !this.respawnPending && Math.abs(feetY - position.y) < 4 ? distance : Infinity;
        if (fox.lastDistance !== null && delta > 0) {
            const closing = THREE.MathUtils.clamp((fox.lastDistance - distance) / delta, -10, 10);
            fox.approach += (closing - fox.approach) * Math.min(1, delta * 5);
        }
        fox.lastDistance = distance;
        const away = Math.atan2(position.z - player.z, position.x - player.x);
        const crouching = this.cameraController.isCrouching;
        const carrying = Boolean(fox.item || fox.carcass);

        let speed = 0;
        let lookAtPlayer = false;
        fox.curious = false;

        if (fox.airborne) {
            this.foxFly(mob, delta);
            speed = Math.hypot(fox.velocity.x, fox.velocity.z);
        } else {
            const fleeRadius = (crouching ? 2.2 : 6) + (carrying ? 3 : 0);
            const startled = fox.approach > 2.8 && playerDistance < (crouching ? 4 : 12);
            if (fox.mode !== 'flee' && (playerDistance < fleeRadius || startled)) this.foxFlee(mob, 2.5 + Math.random() * 2);

            this.foxNightCalls(mob, delta, player, night);
            if (fox.mode === 'wander' && !carrying) this.foxLookForTargets(mob, delta, player, feetY, night);

            switch (fox.mode) {
                case 'flee': {
                    fox.heading = this.lerpAngle(fox.heading, away + Math.sin(data.life * 2.3) * 0.35, Math.min(1, delta * 6));
                    speed = FOX_RUN;
                    if (fox.timer <= 0 && playerDistance > fleeRadius + 4) {
                        fox.mode = fox.carcass ? 'carry' : 'wander';
                        fox.timer = 2 + Math.random() * 2;
                        fox.action = 'look';
                        fox.actionTimer = 1 + Math.random();
                    }
                    break;
                }
                case 'stalk': {
                    const prey = fox.prey;
                    if (!this.foxPreyValid(prey, mob) || fox.timer <= 0) {
                        this.foxGiveUp(mob, 4 + Math.random() * 4);
                        break;
                    }
                    const preyDistance = Math.hypot(prey.position.x - position.x, prey.position.z - position.z);
                    fox.heading = Math.atan2(prey.position.z - position.z, prey.position.x - position.x);
                    speed = preyDistance > 7 ? FOX_TROT * 0.7 : FOX_CREEP;
                    if (preyDistance > 18) this.foxGiveUp(mob, 4);
                    else if (preyDistance < 3.2) {
                        fox.mode = 'crouch';
                        fox.timer = 0.5 + Math.random() * 0.7;
                    }
                    break;
                }
                case 'crouch': {
                    // Frozen, eyes on the prey, rump wiggling: then the leap.
                    const prey = fox.prey;
                    if (!this.foxPreyValid(prey, mob)) {
                        this.foxGiveUp(mob, 4);
                        break;
                    }
                    fox.heading = Math.atan2(prey.position.z - position.z, prey.position.x - position.x);
                    if (fox.timer <= 0) {
                        if (Math.hypot(prey.position.x - position.x, prey.position.z - position.z) < 4.5) this.foxPounce(mob, player);
                        else {
                            fox.mode = 'stalk';
                            fox.timer = 8;
                        }
                    }
                    break;
                }
                case 'carry': {
                    // Trots off with its catch before settling down to eat.
                    speed = FOX_TROT * 0.8;
                    if (playerDistance < 14) fox.heading = this.lerpAngle(fox.heading, away, Math.min(1, delta * 2));
                    if (fox.timer <= 0) {
                        fox.mode = 'eat';
                        fox.eatTotal = 4 + Math.random() * 3;
                        fox.timer = fox.eatTotal;
                    }
                    break;
                }
                case 'eat': {
                    const left = Math.max(0, fox.timer / fox.eatTotal);
                    if (fox.carcass) fox.carcass.scale.setScalar(0.75 * (0.3 + left * 0.7));
                    fox.noiseTimer -= delta;
                    if (fox.noiseTimer <= 0) {
                        fox.noiseTimer = 0.3 + Math.random() * 0.35;
                        const volume = this.foxVolume(mob, player, 0.018, 16);
                        if (volume > 0) {
                            this.playNoiseBurst({ duration: 0.05, volume, highpass: 300, lowpass: 1600 });
                            if (Math.random() < 0.4) this.playTone({ frequency: 240 + Math.random() * 80, duration: 0.03, type: 'square', volume: volume * 0.4, release: 0.03 });
                        }
                    }
                    if (fox.timer <= 0) {
                        this.foxDropCarcass(mob);
                        fox.mode = 'wander';
                        fox.action = 'sit';
                        fox.actionTimer = 3 + Math.random() * 3;
                        fox.yawn = 1;
                        fox.huntCooldown = 40 + Math.random() * 40;
                    }
                    break;
                }
                case 'steal': {
                    const pickup = this.pickups && this.pickups.get(fox.pickupId);
                    if (!pickup || fox.timer <= 0 || !night) {
                        fox.mode = 'wander';
                        fox.pickupId = null;
                        break;
                    }
                    const gap = Math.hypot(pickup.position.x - position.x, pickup.position.z - position.z);
                    fox.heading = Math.atan2(pickup.position.z - position.z, pickup.position.x - position.x);
                    speed = gap > 1.2 ? FOX_TROT : 1;
                    if (gap < 0.6 && Math.abs(pickup.position.y - position.y) < 1.4) this.foxGrabPickup(mob, pickup, player);
                    break;
                }
                default: {
                    const wander = this.foxWander(mob, delta, playerDistance, crouching, away, night);
                    speed = wander.speed;
                    lookAtPlayer = wander.lookAtPlayer;
                }
            }

            // Stolen goods are stashed somewhere once the night is over.
            if (fox.item && !night && fox.mode === 'wander') {
                fox.stash += delta;
                if (fox.stash > 12) {
                    this.foxDropItem(mob);
                    fox.action = 'sniff';
                    fox.actionTimer = 2.5;
                }
            }

            if (speed > 0) {
                if (fox.swimming) speed = Math.min(speed, 1.2);
                if (!this.foxStep(mob, fox.heading, speed * delta)) {
                    speed = 0;
                    if (fox.mode === 'wander') fox.actionTimer = 0;
                    else if (fox.mode !== 'flee') fox.heading += Math.PI * (0.5 + Math.random() * 0.5);
                }
            }
            this.foxSettle(mob, delta);
            fox.facing = fox.swimming || speed > 0 || fox.mode === 'crouch' ? fox.heading : fox.facing;
        }

        data.direction = fox.facing;
        mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.PI / 2 - fox.facing, Math.min(1, delta * (fox.mode === 'flee' ? 12 : 7)));
        this.animateFox(mob, delta, speed, lookAtPlayer ? player : null);
    },

    // Idle life: walks, sniffs, sits, looks about. Backs off from the player, but sits and
    // watches a sneaking one.
    foxWander(mob, delta, playerDistance, crouching, away, night) {
        const data = mob.userData;
        const fox = data.fox;
        const position = mob.position;
        if (crouching && playerDistance < 8) {
            fox.curious = true;
            if (fox.action === 'walk') fox.action = 'look';
            return { speed: 0, lookAtPlayer: true };
        }
        if (!crouching && playerDistance < 10) {
            fox.heading = away + Math.sin(data.life * 0.7) * 0.4;
            return { speed: FOX_WALK * 1.6, lookAtPlayer: true };
        }

        fox.actionTimer -= delta;
        if (fox.actionTimer <= 0) {
            const homeDistance = Math.hypot(data.home.x - position.x, data.home.z - position.z);
            const r = Math.random();
            if (homeDistance > 14) {
                fox.action = 'walk';
                fox.heading = Math.atan2(data.home.z - position.z, data.home.x - position.x) + (Math.random() - 0.5) * 0.6;
                fox.actionTimer = 3 + Math.random() * 3;
            } else if (r < (night ? 0.55 : 0.4)) {
                fox.action = 'walk';
                fox.heading += (Math.random() - 0.5) * 2.2;
                fox.actionTimer = 2 + Math.random() * 4;
            } else if (r < 0.65) {
                fox.action = 'sniff';
                fox.actionTimer = 2 + Math.random() * 2;
            } else if (r < 0.85) {
                fox.action = 'sit';
                fox.actionTimer = 4 + Math.random() * 6;
                if (Math.random() < 0.35) fox.yawn = -(1 + Math.random() * 2);
            } else {
                fox.action = 'look';
                fox.actionTimer = 1.5 + Math.random() * 2;
            }
        }
        // A yawn scheduled a little after sitting down.
        if (fox.yawn < 0) {
            fox.yawn += delta;
            if (fox.yawn >= 0) fox.yawn = 1;
        }
        if (fox.action === 'sniff') {
            fox.noiseTimer -= delta;
            if (fox.noiseTimer <= 0) {
                fox.noiseTimer = 0.7 + Math.random() * 0.8;
                this.foxSniff(mob);
            }
        }
        return { speed: fox.action === 'walk' ? FOX_WALK : 0, lookAtPlayer: false };
    },

    // Prey (a rabbit or a frog on dry land) or, at night, an item lying on the ground.
    foxLookForTargets(mob, delta, player, feetY, night) {
        const fox = mob.userData.fox;
        const position = mob.position;
        fox.scan -= delta;
        if (fox.scan > 0) return;
        fox.scan = 0.5 + Math.random() * 0.3;

        if (night && fox.stealCooldown <= 0 && this.pickups && this.pickups.size > 0) {
            let best = null;
            let bestDistance = 12;
            for (const [id, pickup] of this.pickups) {
                const gap = Math.hypot(pickup.position.x - position.x, pickup.position.z - position.z);
                const fromPlayer = Math.hypot(pickup.position.x - player.x, pickup.position.z - player.z);
                if (gap >= bestDistance || fromPlayer < 4.5 || Math.abs(pickup.position.y - position.y) > 2.5) continue;
                best = id;
                bestDistance = gap;
            }
            if (best) {
                fox.mode = 'steal';
                fox.pickupId = best;
                fox.timer = 15;
                return;
            }
        }

        if (fox.huntCooldown > 0) return;
        const species = FOX_PREY.filter((name) => getMobSpecies(name));
        let best = null;
        let bestDistance = 14;
        for (const other of this.ambientMobs) {
            if (!species.includes(other.userData.species) || !this.foxPreyValid(other, mob)) continue;
            const gap = Math.hypot(other.position.x - position.x, other.position.z - position.z);
            if (gap < bestDistance) {
                best = other;
                bestDistance = gap;
            }
        }
        if (best) {
            fox.mode = 'stalk';
            fox.prey = best;
            fox.timer = 15;
        }
    },

    // Still around, on dry land and within reach.
    foxPreyValid(prey, mob) {
        if (!prey || !prey.parent || !prey.visible || prey.userData.rider) return false;
        // Rabbits down their burrow (or peeking out), anything buried underground.
        if (prey.userData.hidden || prey.userData.moleBuried) return false;
        if (prey.userData.swimming) return false;
        if (Math.abs(prey.position.y - mob.position.y) > 2.5) return false;
        return this.findWaterSurface(prey.position.x, prey.position.y + 0.2, prey.position.z) === null;
    },

    foxGiveUp(mob, cooldown) {
        const fox = mob.userData.fox;
        fox.mode = 'wander';
        fox.prey = null;
        fox.action = 'look';
        fox.actionTimer = 1 + Math.random();
        fox.huntCooldown = Math.max(fox.huntCooldown, cooldown);
    },

    foxFlee(mob, duration) {
        const fox = mob.userData.fox;
        if (fox.mode === 'steal') fox.pickupId = null;
        if (fox.mode === 'stalk' || fox.mode === 'crouch') fox.huntCooldown = Math.max(fox.huntCooldown, 8);
        fox.mode = 'flee';
        fox.prey = null;
        fox.timer = duration;
    },

    // A ballistic leap that lands on the prey's current spot.
    foxPounce(mob, player) {
        const fox = mob.userData.fox;
        const prey = fox.prey;
        const dx = prey.position.x - mob.position.x;
        const dz = prey.position.z - mob.position.z;
        const dy = prey.position.y - mob.position.y;
        const time = 0.5 + Math.hypot(dx, dz) * 0.06;
        fox.velocity.set(dx / time, (dy + 0.5 * FOX_GRAVITY * time * time) / time, dz / time);
        fox.airborne = true;
        fox.mode = 'pounce';
        fox.facing = Math.atan2(dz, dx);
        // An excited chatter (the "gekker").
        const volume = this.foxVolume(mob, player, 0.012, 20);
        for (let i = 0; i < 4 && volume > 0; i++) {
            setTimeout(() => this.playTone({ frequency: 520 + Math.random() * 120, duration: 0.03, type: 'square', volume, release: 0.03 }), i * 55);
        }
        this.playNoiseBurst({ duration: 0.08, volume: volume * 0.8, highpass: 200, lowpass: 1200 });
    },

    foxFly(mob, delta) {
        const fox = mob.userData.fox;
        const position = mob.position;
        const velocity = fox.velocity;
        velocity.y -= FOX_GRAVITY * delta;
        const nx = position.x + velocity.x * delta;
        const nz = position.z + velocity.z * delta;
        const by = Math.floor(position.y + 0.3);
        if (this.world.hasSolidBlock(Math.floor(nx), by, Math.floor(position.z))) velocity.x = 0;
        else position.x = nx;
        if (this.world.hasSolidBlock(Math.floor(position.x), by, Math.floor(nz))) velocity.z = 0;
        else position.z = nz;
        position.y += velocity.y * delta;

        if (fox.mode === 'pounce' && velocity.y < 0 && this.foxTryCatch(mob)) return;
        const water = this.findWaterSurface(position.x, position.y, position.z);
        const floor = this.cameraController.getFloorY(position.x, position.z, position.y + 0.5);
        if (velocity.y < 0 && water !== null && position.y <= water - 0.3) {
            fox.airborne = false;
            fox.swimming = true;
            velocity.set(0, 0, 0);
            this.fishSplash(position.x, water, position.z, 0.5);
        } else if (velocity.y < 0 && position.y <= floor) {
            position.y = floor;
            fox.airborne = false;
            velocity.set(0, 0, 0);
            if (fox.mode === 'pounce') {
                this.playNoiseBurst({ duration: 0.07, volume: 0.015, highpass: 120, lowpass: 900 });
                if (!this.foxTryCatch(mob)) this.foxGiveUp(mob, 6 + Math.random() * 6);
            }
        }
    },

    foxTryCatch(mob) {
        const fox = mob.userData.fox;
        const prey = fox.prey;
        if (!prey || !prey.parent) return false;
        if (Math.hypot(prey.position.x - mob.position.x, prey.position.z - mob.position.z) > 0.95) return false;
        if (Math.abs(prey.position.y - mob.position.y) > 1.2) return false;
        this.foxCatch(mob, prey);
        return true;
    },

    // Predation contract: 'defeated' with the fox as the cause, then the prey is removed.
    // Its model goes into the fox's mouth (as the eagle does with fish).
    foxCatch(mob, prey) {
        const fox = mob.userData.fox;
        this.emitMobEvent('defeated', prey, 'fox');
        const root = prey.userData.modelRoot;
        prey.remove(root);
        this.removeMob(prey);
        root.traverse((node) => { node.userData.mobRoot = mob; });
        // Crosswise in the jaws, hanging limp below them.
        root.position.set(0, -0.6 / 16, 2.4 / 16);
        root.rotation.set(0, Math.PI / 2, 2.4);
        root.scale.setScalar(0.75);
        mob.userData.modelParts.snout.add(root);
        fox.carcass = root;
        fox.prey = null;
        fox.mode = 'carry';
        fox.timer = 2 + Math.random() * 1.5;
        fox.heading = fox.facing + (Math.random() - 0.5) * 2;
        fox.bark = 0.25;
        this.playNoiseBurst({ duration: 0.12, volume: 0.022, highpass: 250, lowpass: 1800 });
        this.playTone({ frequency: 1300, endFrequency: 900, duration: 0.07, type: 'triangle', volume: 0.012, release: 0.05 });
    },

    foxDropCarcass(mob) {
        const fox = mob.userData.fox;
        const root = fox.carcass;
        if (!root) return;
        fox.carcass = null;
        if (root.parent) root.parent.remove(root);
        root.traverse((node) => {
            if (node.isMesh && node.userData.disposeGeometry) node.geometry.dispose();
            if (node.isMesh && node.material && node.userData.modelMap) node.material.dispose();
        });
    },

    // Takes a pickup off the ground (out of this.pickups) and holds its mesh in the mouth.
    foxGrabPickup(mob, pickup, player) {
        const fox = mob.userData.fox;
        this.pickups.delete(pickup.id);
        this.scene.remove(pickup.mesh);
        const mesh = pickup.mesh;
        mesh.position.set(0, -0.9 / 16, 3.3 / 16);
        mesh.rotation.set(0.25, 0.7, 0.1);
        mesh.scale.multiplyScalar(0.62);
        mesh.traverse((node) => { node.userData.mobRoot = mob; });
        mob.userData.modelParts.snout.add(mesh);
        fox.item = { type: pickup.type, amount: pickup.amount, mesh };
        fox.pickupId = null;
        fox.stash = 0;
        this.foxFlee(mob, 4 + Math.random() * 2);
        this.foxYip(mob, player, 1);
    },

    foxDropItem(mob) {
        const fox = mob.userData.fox;
        const item = fox && fox.item;
        if (!item) return;
        fox.item = null;
        if (item.mesh.parent) item.mesh.parent.remove(item.mesh);
        this.disposeObject3D(item.mesh);
        const position = mob.position;
        const floor = this.cameraController.getFloorY(position.x, position.z, position.y + 0.5);
        this.spawnPickup(item.type, { x: position.x - 0.5, y: floor > -20 ? floor : position.y, z: position.z - 0.5 }, item.amount);
    },

    // Struck: it drops whatever it holds, yelps and bolts.
    foxStruck(mob) {
        const data = mob.userData;
        if (!data.fox) this.foxInit(mob);
        const fox = data.fox;
        this.foxDropItem(mob);
        this.foxDropCarcass(mob);
        fox.stealCooldown = 30;
        fox.huntCooldown = Math.max(fox.huntCooldown, 10);
        data.health -= 4;
        this.updateMobHealthBar(mob);
        const tone = getMobSpecies('fox').tone;
        this.playTone({ frequency: tone * 1.9, endFrequency: tone * 1.1, duration: 0.16, type: 'sawtooth', volume: 0.02, attack: 0.01, release: 0.08 });
        this.playTone({ frequency: tone * 2.4, endFrequency: tone * 1.3, duration: 0.12, type: 'triangle', volume: 0.012, release: 0.06 });
        if (data.health <= 0) {
            this.emitMobEvent('defeated', mob, 'player');
            this.removeMob(mob);
            this.receiveSystemMessage({ text: 'You defeated the fox' });
            return;
        }
        fox.bark = 0.25;
        this.foxFlee(mob, 4 + Math.random() * 2);
        const away = Math.atan2(mob.position.z - this.camera.position.z, mob.position.x - this.camera.position.x);
        fox.heading = away;
        fox.facing = away;
        if (!fox.airborne && !fox.swimming) {
            fox.velocity.set(Math.cos(away) * 3, 4.5, Math.sin(away) * 3);
            fox.airborne = true;
        }
    },

    // One step along `heading`, trying a few turns around obstacles; foxes do not wade into
    // water, but a swimming one heads for the bank.
    foxStep(mob, heading, distance) {
        const fox = mob.userData.fox;
        for (const turn of [0, 0.5, -0.5, 1.1, -1.1, 1.8, -1.8]) {
            if (!this.foxTryStep(mob, heading + turn, distance)) continue;
            if (turn) fox.heading = heading + turn;
            return true;
        }
        return false;
    },

    foxTryStep(mob, heading, distance) {
        const fox = mob.userData.fox;
        const position = mob.position;
        const nx = position.x + Math.cos(heading) * distance;
        const nz = position.z + Math.sin(heading) * distance;
        if (this.findWaterSurface(nx, position.y - 0.4, nz) !== null) {
            if (!fox.swimming || this.world.hasSolidBlock(Math.floor(nx), Math.floor(position.y + 0.1), Math.floor(nz))) return false;
            position.x = nx;
            position.z = nz;
            return true;
        }
        const floor = this.cameraController.getFloorY(nx, nz, position.y + (fox.swimming ? 1.6 : 1.1));
        const rise = floor - position.y;
        if (floor <= -20 || rise > (fox.swimming ? 1.3 : 1.01) || rise < -3) return false;
        position.x = nx;
        position.z = nz;
        if (rise > 0) {
            position.y += Math.min(rise, Math.max(0.06, distance * 2));
            fox.swimming = false;
        }
        return true;
    },

    // Keeps it on the ground: climbs the rest of a step, falls off ledges, floats in water.
    foxSettle(mob, delta) {
        const fox = mob.userData.fox;
        const position = mob.position;
        const water = this.findWaterSurface(position.x, position.y + 0.3, position.z);
        if (water !== null && position.y < water - 0.1) {
            fox.swimming = true;
            position.y += (water - 0.38 - position.y) * Math.min(1, delta * 4);
            if (fox.mode !== 'flee' && fox.mode !== 'carry') {
                // Paddle back towards home; a catch is finished on dry land.
                fox.prey = null;
                fox.pickupId = null;
                fox.mode = fox.carcass ? 'carry' : 'wander';
                fox.timer = 3;
                fox.action = 'walk';
                fox.actionTimer = 1;
                fox.heading = Math.atan2(mob.userData.home.z - position.z, mob.userData.home.x - position.x);
            }
            if (Math.random() < delta * 2) this.world.addRipple(position.x, position.z, 0.15);
            return;
        }
        fox.swimming = false;
        const floor = this.cameraController.getFloorY(position.x, position.z, position.y + 1.1);
        if (floor <= -20) return;
        if (floor > position.y) position.y = Math.min(floor, position.y + delta * 4);
        else if (position.y - floor > 0.05) {
            fox.velocity.set(Math.cos(fox.heading) * 1.2, 0, Math.sin(fox.heading) * 1.2);
            fox.airborne = true;
        }
    },

    foxVolume(mob, player, base, range) {
        const distance = Math.hypot(player.x - mob.position.x, player.y - mob.position.y, player.z - mob.position.z);
        return base * Math.max(0, 1 - distance / range);
    },

    // Short, quick sniffs.
    foxSniff(mob) {
        const volume = this.foxVolume(mob, this.getLocalPlayerPosition(), 0.012, 12);
        for (let i = 0; i < 3 && volume > 0; i++) {
            setTimeout(() => this.playNoiseBurst({ duration: 0.04, volume, highpass: 1800, lowpass: 5200 }), i * 110);
        }
    },

    // A run of high, hoarse yips, as foxes call to each other at night.
    foxYip(mob, player, count) {
        const volume = this.foxVolume(mob, player, 0.022, 48);
        if (volume <= 0) return;
        const tone = getMobSpecies('fox').tone * (mob.userData.variant % 2 ? 1.08 : 1);
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                if (!mob.parent) return;
                mob.userData.fox.bark = 0.14;
                this.playTone({ frequency: tone * 1.45, endFrequency: tone * 0.85, duration: 0.11, type: 'sawtooth', volume, attack: 0.008, release: 0.06, detune: (Math.random() - 0.5) * 60 });
                this.playTone({ frequency: tone * 2.1, endFrequency: tone * 1.3, duration: 0.08, type: 'triangle', volume: volume * 0.5, release: 0.05 });
                this.playNoiseBurst({ duration: 0.05, volume: volume * 0.35, highpass: 1200, lowpass: 4000 });
            }, i * (170 + Math.random() * 60));
        }
    },

    // At night foxes yip now and then, and nearby foxes answer.
    foxNightCalls(mob, delta, player, night) {
        const fox = mob.userData.fox;
        fox.yipTimer -= delta;
        if (fox.yipTimer > 0) return;
        fox.yipTimer = 12 + Math.random() * 25;
        if (!night || fox.item || fox.carcass || fox.mode === 'stalk' || fox.mode === 'crouch') return;
        this.foxYip(mob, player, 2 + Math.floor(Math.random() * 3));
        this.ambientMobs.forEach((other) => {
            if (other === mob || !other.userData.fox || other.position.distanceTo(mob.position) > 40) return;
            other.userData.fox.yipTimer = Math.min(other.userData.fox.yipTimer, 1.2 + Math.random() * 1.5);
        });
    },

    // Eyeshine at night: two small plates in front of the eyes, HDR-bright in Ultra.
    foxEyeshine(mob, night) {
        const data = mob.userData;
        const head = data.modelParts.head;
        if (!data.eyeshineMaterial) {
            data.eyeshineMaterial = new THREE.MeshBasicMaterial({ color: 0xc8ff70, transparent: true, opacity: 0.85 });
            data.eyeshineGeometry = new THREE.BoxGeometry(1.1 / 16, 0.6 / 16, 0.1 / 16);
            data.glowMaterials = [data.eyeshineMaterial];
        }
        if (!data.eyeshine || data.eyeshine[0].parent !== head) {
            data.eyeshine = [-1, 1].map((sign) => {
                const eye = new THREE.Mesh(data.eyeshineGeometry, data.eyeshineMaterial);
                eye.position.set(sign * 1.75 / 16, 0.85 / 16, 3.53 / 16);
                eye.userData.mobRoot = mob;
                head.add(eye);
                return eye;
            });
            data.eyeshine[0].userData.disposeGeometry = true;
        }
        const boost = this.ultraModeEnabled ? 3 : 1;
        data.eyeshineMaterial.color.setRGB(0.75 * boost, 0.95 * boost, 0.4 * boost);
        data.eyeshine.forEach((eye) => { eye.visible = night; });
    },

    animateFox(mob, delta, speed, watching) {
        const data = mob.userData;
        const fox = data.fox;
        const parts = data.modelParts;
        const follow = (rate) => Math.min(1, delta * rate);
        this.foxEyeshine(mob, this.isNightTime());
        // Carried things are re-attached after a model rebuild (graphics quality change).
        if (fox.item && fox.item.mesh.parent !== parts.snout) parts.snout.add(fox.item.mesh);
        if (fox.carcass && fox.carcass.parent !== parts.snout) parts.snout.add(fox.carcass);

        const sitting = fox.mode === 'wander' && fox.action === 'sit' && speed === 0 && !fox.swimming;
        const crouchTarget = fox.mode === 'crouch' ? 1 : fox.mode === 'stalk' ? (speed <= FOX_CREEP ? 0.8 : 0.3) : fox.mode === 'eat' ? 1 : fox.mode === 'steal' ? 0.35 : 0;
        fox.sit += ((sitting ? 1 : 0) - fox.sit) * follow(4);
        fox.crouch += (crouchTarget - fox.crouch) * follow(5);
        fox.air += ((fox.airborne && fox.mode !== 'wander' ? 1 : 0) - fox.air) * follow(12);
        const sit = fox.sit;
        const crouch = fox.crouch;
        const air = fox.air;

        data.gait += ((speed > 0.05 ? 1 : 0) - data.gait) * follow(8);
        data.stepPhase += delta * (2 + speed * 4.2);
        const phase = data.stepPhase;
        const run = THREE.MathUtils.clamp((speed - 2) / 2, 0, 1);
        const amplitude = (0.45 + run * 0.45) * data.gait;
        const airPitch = fox.airborne ? THREE.MathUtils.clamp(-fox.velocity.y * 0.07, -0.6, 0.6) : 0;

        // Legs: a diagonal trot that becomes a bounding gallop; folded when sitting,
        // stretched fore and aft in a leap, paddling in water.
        data.legs.forEach((leg, index) => {
            const front = index < 2;
            const trot = index === 0 || index === 3 ? 0 : Math.PI;
            const bound = (front ? 0 : Math.PI) + (index % 2) * 0.4;
            let angle = Math.sin(phase + (run > 0.5 ? bound : trot)) * amplitude;
            if (fox.swimming) angle = Math.sin(data.life * 8 + index * 1.6) * 0.6;
            angle += ((front ? 0.3 : -1.35) - angle) * sit;
            angle += ((front ? -1.1 : 1.0) - angle) * air;
            leg.rotation.x = leg.userData.baseRotation.x + angle;
        });

        // Body: pitched up when sitting, low when stalking or eating, rump wiggle before a pounce.
        const wiggle = fox.mode === 'crouch' ? Math.sin(data.life * 22) * 0.06 : 0;
        parts.body.rotation.x = -0.32 * sit + 0.05 * crouch + airPitch * air;
        parts.body.rotation.z = wiggle;
        parts.body.scale.y = 1 + Math.sin(data.life * 2.4) * 0.012;
        data.modelRoot.position.y = -sit * 1.8 / 16 - crouch * 1.4 / 16 + Math.abs(Math.sin(phase)) * 0.03 * data.gait * (1 - air);

        // Head: idle glances, sniffing the ground, eyes on the prey or on the player.
        fox.lookTimer -= delta;
        if (fox.lookTimer <= 0) {
            fox.lookTimer = 1 + Math.random() * 3;
            fox.lookYaw = (Math.random() - 0.5) * 1.3;
            fox.lookPitch = (Math.random() - 0.5) * 0.3;
        }
        let yaw = fox.lookYaw * (1 - data.gait * 0.8);
        let pitch = fox.lookPitch;
        if (watching) {
            const toPlayer = Math.atan2(watching.z - mob.position.z, watching.x - mob.position.x);
            yaw = THREE.MathUtils.clamp(this.lerpAngle(0, (Math.PI / 2 - toPlayer) - mob.rotation.y, 1), -1.2, 1.2);
            pitch = -0.1;
        }
        const sniffing = fox.mode === 'wander' && fox.action === 'sniff' && speed === 0;
        if (sniffing) {
            yaw = Math.sin(data.life * 0.8) * 0.4 + Math.sin(data.life * 23) * 0.04;
            pitch = 0.6 + Math.sin(data.life * 17) * 0.04;
        }
        if (fox.mode === 'stalk' || fox.mode === 'crouch' || fox.mode === 'steal') { yaw = 0; pitch = 0.05; }
        if (fox.mode === 'flee' || fox.mode === 'carry') { yaw = 0; pitch = -0.15; }
        if (fox.mode === 'eat') { yaw = Math.sin(data.life * 1.3) * 0.2; pitch = 0.75 + Math.sin(data.life * 6) * 0.12; }
        pitch += 0.32 * sit - 0.05 * crouch - airPitch * air * 0.6;
        fox.tilt += ((fox.curious ? 0.32 * Math.sign(Math.sin(data.life * 0.4) + 0.001) : 0) - fox.tilt) * follow(3);
        data.head.rotation.y += (yaw - data.head.rotation.y) * follow(5);
        data.head.rotation.x += (pitch - data.head.rotation.x) * follow(5);
        data.head.rotation.z = fox.tilt;

        // Jaw: open around its catch or the stolen item, when yipping, yawning or chewing.
        let jaw = fox.item || fox.carcass ? 0.22 : 0;
        if (fox.bark > 0) jaw = Math.max(jaw, 0.55);
        if (fox.yawn > 0) {
            fox.yawn = Math.max(0, fox.yawn - delta * 0.6);
            jaw = Math.max(jaw, Math.sin(fox.yawn * Math.PI) * 0.95);
        }
        if (fox.mode === 'eat') jaw = 0.15 + Math.max(0, Math.sin(data.life * 9)) * 0.3;
        parts.jaw.rotation.x += (jaw - parts.jaw.rotation.x) * follow(14);

        // Ears: pricked forward when interested, flat back when fleeing, flicks otherwise.
        const alert = fox.mode === 'stalk' || fox.mode === 'crouch' || fox.curious || sniffing ? 0.3 : 0;
        const ears = fox.mode === 'flee' ? -0.75 : alert;
        ['earL', 'earR'].forEach((name, index) => {
            const ear = parts[name];
            const flick = Math.max(0, Math.sin(data.life * 1.1 + index * 2.3) - 0.97) * 10;
            const target = ear.userData.baseRotation.x + ears - flick * 0.4;
            ear.rotation.x += (target - ear.rotation.x) * follow(10);
        });

        // Tail: swaying behind, streaming out when running, held low and twitching when
        // stalking, curled round the feet when sitting.
        const tailLift = run * 0.4 + air * 0.45 - crouch * 0.1 - sit * 0.15;
        const sway = (0.12 + data.gait * 0.12) * (1 - run * 0.6) * (1 - sit);
        data.tail.forEach((segment, index) => {
            const base = segment.userData.baseRotation;
            const twitch = fox.mode === 'crouch' && index === 2 ? Math.sin(data.life * 14) * 0.35 : 0;
            const curl = sit * [0.9, 0.7, 0.6][index];
            const targetY = base.y + Math.sin(data.life * (1.8 + data.gait * 3) - index * 0.7) * sway + curl + twitch;
            const targetX = base.x + (index === 0 ? tailLift : 0) - sit * (index === 0 ? 0.35 : 0);
            segment.rotation.y += (targetY - segment.rotation.y) * follow(8);
            segment.rotation.x += (targetX - segment.rotation.x) * follow(8);
        });
    }
});
