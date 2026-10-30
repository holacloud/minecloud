// The giant mole: a solitary, velvety grey burrower of plains and forests, about 1.3 blocks
// long, with huge pink digging claws, tiny eyes and a pink star of wiggling nose tentacles.
// It spends most of its time underground, where it cannot be seen or struck: only a bulge of
// heaving earth travels along the surface, rumbling and spitting clods, and leaves a trail of
// little molehills behind. Now and then it bursts out of a fresh mound, waddles about blindly
// sniffing the air, and digs back down.
//
// It feels vibrations: a player who sprints, jumps or lands heavily nearby (sneaking players
// go unnoticed) draws it in. The bulge speeds towards the spot, rumbles louder and shakes in
// place for a moment, then the mole erupts there, bowling over whoever still stands on it (2
// damage and a shove). Struck while above ground it squeaks and dives away. It never changes
// the world: mounds and clods are client-side entities that settle and sink away after a
// while. Mixed into Game.prototype as the 'tunnel' movement (see js/extensions.js).

const MOLE_SOFT_GROUND = ['grass', 'dirt', 'sand'];
const MOLE_DEPTH = 1.45;
const MOLE_MOUND_LIMIT = 70;
const MOLE_CLOD_LIMIT = 220;
const _moleBox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const _moleMatrix = new THREE.Matrix4();
const _moleNormalMatrix = new THREE.Matrix3();
const _moleQuat = new THREE.Quaternion();
const _moleEuler = new THREE.Euler();
const _molePos = new THREE.Vector3();
const _moleScale = new THREE.Vector3();
const _moleVec = new THREE.Vector3();
const _moleColor = new THREE.Color();

MOB_SPECIES.mole = {
    eggColor: 0x3b3a40, tone: 1500, maxHealth: 12, speed: 0.5, group: [1, 1], limit: 2,
    movement: 'tunnel', spawnBiomes: { plains: 1, forest: 1 }
};

VoxelModels.MOB_SURFACES.mole = 'fur';

// Faces +z, belly on the ground. The nose star is a pink disc ringed by ten tentacles
// (tentacle0..9); the forelimbs end in broad pink palms with ivory claws.
VoxelModels.mobBuilders.mole = function (b) {
    const furColor = 0x35343b;
    const pink = 0xe99aa8;
    const velvet = { color: furColor, noise: 0.05, all: (p, face) => {
        if (face === 'bottom') { p.fill(0x403c42, 0.05); return; }
        p.spots(0x45444d, Math.ceil(p.w * p.h / 4), 0.3, 0.7, 3);
        p.spots(0x2a292f, Math.ceil(p.w * p.h / 6), 0.3, 0.6, 9);
        if (face === 'top') p.rect(p.w / 2 - 1.5, 0, 3, p.h, 0x3f3e46, 0.04);
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-5, 1.5, -7], size: [10, 7, 14], paint: velvet });
    b.part('back', { parent: 'body', pivot: [0, 8.5, 0], from: [-4, 0, -6], size: [8, 1, 12], paint: velvet });
    b.part('rump', { parent: 'body', pivot: [0, 2, -7], from: [-4, 0, -1], size: [8, 5.5, 1], paint: velvet });
    b.part('head', {
        parent: 'body', pivot: [0, 5, 7], from: [-3.5, -3, 0], size: [7, 5.5, 3.5],
        paint: { ...velvet, faces: { front: (p) => {
            p.rect(0.7, 1.4, 0.5, 0.5, 0x08070a, 0);
            p.rect(5.8, 1.4, 0.5, 0.5, 0x08070a, 0);
            p.rect(0.8, 1.45, 0.2, 0.2, 0x9a98a8, 0);
            p.rect(5.9, 1.45, 0.2, 0.2, 0x9a98a8, 0);
        } } }
    });
    b.part('snout', {
        parent: 'head', pivot: [0, -0.75, 3.5], from: [-2, -1.5, 0], size: [4, 2.75, 2.5],
        paint: { color: 0x3c3a40, noise: 0.05, faces: { bottom: (p) => { p.fill(0x6a4a52, 0.04); p.rect(0.8, 1.6, 2.4, 0.4, 0x2a1a1e, 0); } } }
    });
    b.part('nose', {
        parent: 'snout', pivot: [0, 0, 2.5], from: [-1.1, -1.1, 0], size: [2.2, 2.2, 0.6],
        paint: { color: 0xf08fa8, noise: 0.04, bevel: 0, faces: { front: (p) => { p.rect(0.5, 0.8, 0.45, 0.5, 0x7a3848, 0); p.rect(1.25, 0.8, 0.45, 0.5, 0x7a3848, 0); } } }
    });
    for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        b.part(`tentacle${i}`, {
            parent: 'nose', pivot: [Math.cos(angle) * 0.95, Math.sin(angle) * 0.95, 0.3],
            from: [-0.25, -0.25, 0], size: [0.5, 0.5, 1.4],
            paint: { color: 0xf7a8bd, noise: 0.03, bevel: 0 },
            rotation: [-Math.sin(angle) * 0.85, Math.cos(angle) * 0.85, 0]
        });
    }
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`arm${side}`, {
            parent: 'body', pivot: [5 * sign, 3.5, 5], from: [sign > 0 ? 0 : -1.5, -1, -1.25], size: [1.5, 2, 2.5],
            paint: velvet, rotation: [0, 0, -0.15 * sign]
        });
        b.part(`paw${side}`, {
            parent: `arm${side}`, pivot: [1.5 * sign, 0, 0.5], from: [sign > 0 ? 0 : -1, -3.5, -2], size: [1, 5, 4.5],
            paint: { color: pink, noise: 0.05, all: (p, face) => {
                if (face === 'left' || face === 'right') for (let y = 0.8; y < p.h; y += 1.1) p.rect(0.4, y, p.w - 0.8, 0.25, 0xd4808f, 0.03);
            } },
            rotation: [0, -0.35 * sign, 0]
        });
        for (let k = 0; k < 5; k++) {
            b.part(`claw${side}${k}`, {
                parent: `paw${side}`, pivot: [0.5 * sign, 1.0 - k * 1.05, 2.5], from: [-0.3, -0.3, 0], size: [0.6, 0.6, 1.7],
                paint: { color: 0xf3e6da, noise: 0.03, bevel: 0 }, rotation: [0.25, 0, 0]
            });
        }
        b.part(`leg${side}`, {
            parent: 'body', pivot: [3.5 * sign, 2.5, -5], from: [-1, -2.5, -1.25], size: [2, 2.5, 2.5], paint: velvet
        });
        b.part(`foot${side}`, {
            parent: `leg${side}`, pivot: [0, -2.5, 0], from: [-1, 0, -0.5], size: [2, 0.6, 3], paint: { color: pink, noise: 0.04 }
        });
    });
    b.part('tail', {
        parent: 'body', pivot: [0, 5, -7.5], from: [-0.6, -0.6, -3], size: [1.2, 1.2, 3],
        paint: { color: 0xc8959c, noise: 0.05 }, rotation: [0.45, 0, 0]
    });
    return { legs: ['legL', 'legR'], arms: ['armL', 'armR'], head: 'head', tail: ['tail'] };
};

Object.assign(Game.prototype, {
    updateBurrowingMob(mob, delta, player) {
        const data = mob.userData;
        if (!data.moleState) this.moleInit(mob);
        this.moleSyncVisibility(mob);
        data.calm = Math.max(0, (data.calm || 0) - delta);
        data.flee = Math.max(0, (data.flee || 0) - delta);
        data.moleTimer -= delta;
        this.moleSense(mob);

        switch (data.moleState) {
            case 'underground': this.moleTunnel(mob, delta, player); break;
            case 'rumble': this.moleRumble(mob, delta); break;
            case 'emerging': this.moleEmerge(mob, delta); break;
            case 'diving': this.moleDive(mob, delta); break;
            default: this.moleWander(mob, delta, player);
        }
        this.moleUpdateBulge(mob, delta);
        mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.PI / 2 - data.facing, Math.min(1, delta * (data.moleBuried ? 10 : 4)));
    },

    moleInit(mob) {
        const data = mob.userData;
        data.facing = data.direction;
        data.surfaceY = mob.position.y;
        data.moleGait = 0;
        data.moleDig = 0;
        data.moleTilt = 0;
        data.trail = 0;
        data.rumbleTimer = 0;
        if (mob.position.y < -20) {
            const ground = this.cameraController.getFloorY(mob.position.x, mob.position.z, 64);
            if (ground > -20) data.surfaceY = ground;
        }
        if (data.natural) {
            // Wild ones start somewhere along their tunnels.
            this.moleSetBuried(mob, true);
            mob.position.y = data.surfaceY - MOLE_DEPTH;
            this.moleStartTunnelling(mob);
        } else {
            // Summoned by command or egg: it bursts out right away, so it can be seen.
            this.moleStartEmerging(mob, false);
        }
    },

    // Senses the latest vibration (see moleSenseVibrations) and heads for it.
    moleSense(mob) {
        const data = mob.userData;
        const vibration = this.moleVibration;
        if (!vibration || this.moleClock - vibration.time > 0.3 || data.calm > 0 || data.flee > 0) return;
        if (data.moleState === 'rumble' || data.moleState === 'emerging' || data.moleState === 'diving') return;
        const distance = Math.hypot(vibration.x - mob.position.x, vibration.z - mob.position.z);
        if (distance > vibration.radius || Math.abs(vibration.y - data.surfaceY) > 6) return;
        if (!data.huntTarget) {
            data.huntTarget = new THREE.Vector3();
            data.huntTime = 0;
            data.blockedTime = 0;
            if (!this.moleWarned && distance < 18) {
                this.moleWarned = true;
                this.receiveSystemMessage({ text: 'The ground rumbles... something felt your footsteps (sneak to go unnoticed)' });
            }
        }
        data.huntTarget.set(vibration.x, vibration.y, vibration.z);
        if (data.moleState === 'surfaced') {
            // Nose up towards the thumping, then straight down after it.
            data.facing = Math.atan2(vibration.z - mob.position.z, vibration.x - mob.position.x);
            data.moleTimer = Math.min(data.moleTimer, 0.7);
            data.ignoreSoft = true;
        }
    },

    // Above ground: waddles slowly with frequent pauses, sweeping its nose about.
    moleWander(mob, delta, player) {
        const data = mob.userData;
        data.paused = (data.paused ?? 1) - delta;
        let walking = false;
        if (data.paused <= -(2 + Math.random() * 3) && Math.random() < delta) {
            data.paused = 0.8 + Math.random() * 2.2;
            data.facing += (Math.random() - 0.5) * 2.2;
            if (Math.random() < 0.4) data.scrabble = 0.9;
        }
        if (data.paused < 0 && !data.huntTarget) {
            const step = this.walkStep(mob, data.facing, getMobSpecies('mole').speed * delta, delta);
            if (step.moved) walking = true;
            else data.facing += Math.PI * (0.5 + Math.random() * 0.6) * (Math.random() < 0.5 ? -1 : 1);
        }
        data.surfaceY = mob.position.y;

        // Scrabbles at the ground now and then, flinging dirt behind.
        data.scrabble = Math.max(0, (data.scrabble || 0) - delta);
        if (data.scrabble > 0 && Math.random() < delta * 14) {
            const back = data.facing + Math.PI;
            this.moleThrowDirt(mob.position.x + Math.cos(data.facing) * 0.6, data.surfaceY, mob.position.z + Math.sin(data.facing) * 0.6, 1, 0.2, 2.2, this.moleGroundColors(mob.position.x, data.surfaceY, mob.position.z), back);
        }

        data.sniffTimer = (data.sniffTimer ?? 0.5) - delta;
        if (data.sniffTimer <= 0) {
            data.sniffTimer = 0.7 + Math.random() * 1.6;
            data.sniffs = 2 + Math.floor(Math.random() * 3);
            data.sniffGap = 0;
        }
        if (data.sniffs > 0) {
            data.sniffGap -= delta;
            if (data.sniffGap <= 0) {
                data.sniffGap = 0.09;
                data.sniffs -= 1;
                const volume = this.moleVolume(mob, 14);
                if (volume > 0) this.playNoiseBurst({ duration: 0.035, volume: 0.02 * volume, highpass: 2400, lowpass: 7000 });
            }
        }

        if (data.moleTimer <= 0) {
            const ground = this.moleGroundColors(mob.position.x, data.surfaceY, mob.position.z);
            // Only digs into soft earth, unless it has wandered on hard ground for too long.
            if (ground.soft || data.ignoreSoft || data.moleTimer < -10) this.moleStartDiving(mob, 1.2);
            else if (Math.random() < delta) data.facing += (Math.random() - 0.5) * 2;
        }
        this.molePose(mob, delta, { walking, sniff: data.paused > 0 ? 1 : 0.5, dig: data.scrabble > 0 ? 1 : 0, tilt: data.paused > 0 ? -0.08 : 0 });
    },

    moleStartDiving(mob, duration) {
        const data = mob.userData;
        data.moleState = 'diving';
        data.moleTimer = duration;
        data.moleDuration = duration;
        data.ignoreSoft = false;
        data.surfaceY = mob.position.y;
        const ahead = 0.55;
        this.moleMakeMound(mob.position.x + Math.cos(data.facing) * ahead, data.surfaceY, mob.position.z + Math.sin(data.facing) * ahead, 0.85);
        const volume = this.moleVolume(mob, 18);
        if (volume > 0) this.playNoiseBurst({ duration: duration * 0.8, volume: 0.03 * volume, highpass: 90, lowpass: 900 });
    },

    // Nose first into the ground, claws churning.
    moleDive(mob, delta) {
        const data = mob.userData;
        const t = 1 - Math.max(0, data.moleTimer) / data.moleDuration;
        const eased = t * t * (3 - 2 * t);
        mob.position.y = data.surfaceY - MOLE_DEPTH * eased;
        const colors = this.moleGroundColors(mob.position.x, data.surfaceY, mob.position.z);
        if (Math.random() < delta * 30) {
            this.moleThrowDirt(mob.position.x + Math.cos(data.facing) * 0.5, data.surfaceY, mob.position.z + Math.sin(data.facing) * 0.5, 1, 0.35, 3, colors);
        }
        this.molePose(mob, delta, { walking: false, sniff: 0.2, dig: 1, tilt: 0.85 * Math.min(1, t * 3) });
        if (data.moleTimer > 0) return;
        this.moleSetBuried(mob, true);
        this.moleStartTunnelling(mob);
    },

    moleStartTunnelling(mob) {
        const data = mob.userData;
        data.moleState = 'underground';
        data.moleTimer = 7 + Math.random() * 9;
        data.tunnelTarget = null;
        data.trail = 0;
        if (data.flee > 0) {
            const player = this.getLocalPlayerPosition();
            const away = Math.atan2(mob.position.z - player.z, mob.position.x - player.x);
            data.tunnelTarget = new THREE.Vector3(mob.position.x + Math.cos(away) * 12, 0, mob.position.z + Math.sin(away) * 12);
        }
    },

    // Underground: only a bulge of earth shows where it goes.
    moleTunnel(mob, delta, player) {
        const data = mob.userData;
        const position = mob.position;
        if (data.surfaceY < -20) {
            const ground = this.cameraController.getFloorY(position.x, position.z, 64);
            if (ground <= -20) return;
            data.surfaceY = ground;
            position.y = ground - MOLE_DEPTH;
        }
        const hunting = Boolean(data.huntTarget);
        let target = hunting ? data.huntTarget : data.tunnelTarget;
        if (!target || (!hunting && Math.hypot(target.x - position.x, target.z - position.z) < 0.8)) {
            const homeDistance = Math.hypot(data.home.x - position.x, data.home.z - position.z);
            const angle = homeDistance > 18 ? Math.atan2(data.home.z - position.z, data.home.x - position.x) + (Math.random() - 0.5) : Math.random() * Math.PI * 2;
            const reach = 4 + Math.random() * 8;
            data.tunnelTarget = new THREE.Vector3(position.x + Math.cos(angle) * reach, 0, position.z + Math.sin(angle) * reach);
            target = data.tunnelTarget;
        }
        const distance = Math.hypot(target.x - position.x, target.z - position.z);
        if (hunting) {
            data.huntTime += delta;
            if (distance < 0.35) {
                this.moleStartRumble(mob);
                return;
            }
            if (data.huntTime > 16 || data.blockedTime > 3) {
                data.huntTarget = null;
                data.calm = 4;
            }
        }
        const desired = Math.atan2(target.z - position.z, target.x - position.x);
        data.facing = this.lerpAngle(data.facing, desired, Math.min(1, delta * (hunting ? 5 : 2)));
        const speed = hunting ? 3.4 : data.flee > 0 ? 3 : 1.8;
        const step = Math.min(speed * delta, hunting ? distance : Infinity);
        const next = this.moleProbe(position.x + Math.cos(data.facing) * step, position.z + Math.sin(data.facing) * step, data.surfaceY);
        if (next) {
            position.x = next.x;
            position.z = next.z;
            data.surfaceY += (next.floor - data.surfaceY) * Math.min(1, delta * 12);
            if (Math.abs(next.floor - data.surfaceY) < 0.05) data.surfaceY = next.floor;
            position.y = data.surfaceY - MOLE_DEPTH;
            data.trail += step;
            data.moleMoving = 1;
            data.blockedTime = Math.max(0, (data.blockedTime || 0) - delta);
        } else {
            data.moleMoving = 0;
            data.blockedTime = (data.blockedTime || 0) + delta;
            if (!hunting) {
                // Head for the first open direction; boxed in (dived where it cannot dig on),
                // it comes back up rather than spinning on the spot.
                data.tunnelTarget = null;
                const open = this.moleOpenHeading(position, data.surfaceY, data.facing);
                if (open === null) {
                    if (data.blockedTime > 0.6) this.moleStartEmerging(mob, false);
                } else {
                    data.facing = open;
                    data.tunnelTarget = new THREE.Vector3(position.x + Math.cos(open) * 6, 0, position.z + Math.sin(open) * 6);
                }
            } else {
                // Feel around the obstacle.
                data.facing += (Math.random() < 0.5 ? -1 : 1) * 0.9;
            }
        }

        // A molehill every couple of blocks.
        if (data.trail > 2.1) {
            data.trail = 0;
            this.moleMakeMound(position.x, data.surfaceY, position.z, 0.45 + Math.random() * 0.2);
        }

        const colors = this.moleGroundColors(position.x, data.surfaceY, position.z);
        if (data.moleMoving && Math.random() < delta * (hunting ? 16 : 7)) {
            this.moleThrowDirt(position.x, data.surfaceY, position.z, 1, 0.3, hunting ? 2.6 : 1.8, colors);
        }
        this.moleRumbleSound(mob, delta, hunting ? 1.6 : 1);

        if (!hunting && data.moleTimer <= 0 && colors.soft && Math.hypot(player.x - position.x, player.z - position.z) > 1.5) {
            this.moleStartEmerging(mob, false);
        }
    },

    // The column at (x, z) if it can tunnel there: soft ground, no water, at most a block
    // up (no walls) or three down.
    // A heading from `position` it can tunnel along, trying the sides before turning back,
    // or null when boxed in.
    moleOpenHeading(position, surfaceY, facing) {
        for (const turn of [0.6, -0.6, 1.3, -1.3, 2, -2, Math.PI]) {
            const heading = facing + turn * (Math.random() < 0.5 ? 1 : -1);
            if (this.moleProbe(position.x + Math.cos(heading) * 0.6, position.z + Math.sin(heading) * 0.6, surfaceY)) return heading;
        }
        return null;
    },

    moleProbe(x, z, surfaceY) {
        const floor = this.cameraController.getFloorY(x, z, surfaceY + 1.6);
        if (floor <= -20 || floor - surfaceY > 1.01 || surfaceY - floor > 3) return null;
        if (this.world.hasSolidBlock(Math.floor(x), Math.floor(floor + 0.01), Math.floor(z))) return null;
        if (this.findWaterSurface(x, floor + 0.1, z) !== null) return null;
        if (!MOLE_SOFT_GROUND.includes(this.world.getBlockTypeAt(Math.floor(x), Math.floor(floor - 0.01), Math.floor(z)))) return null;
        return { x, z, floor };
    },

    moleRumbleSound(mob, delta, intensity) {
        const data = mob.userData;
        data.rumbleTimer -= delta;
        if (data.rumbleTimer > 0) return;
        data.rumbleTimer = 0.32 / intensity;
        const volume = this.moleVolume(mob, 22);
        if (volume <= 0) return;
        this.playNoiseBurst({ duration: 0.4, volume: 0.035 * volume * intensity, highpass: 30, lowpass: 170 });
        this.playTone({ frequency: 38 + Math.random() * 14, duration: 0.32, type: 'sine', volume: 0.035 * volume * intensity, attack: 0.06, release: 0.15 });
    },

    // About to erupt: the bulge shakes in place, dirt fountains and the rumble rises.
    moleStartRumble(mob) {
        const data = mob.userData;
        data.moleState = 'rumble';
        data.moleTimer = 0.9;
        data.rumbleStep = 0;
        data.huntTarget = null;
    },

    moleRumble(mob, delta) {
        const data = mob.userData;
        const colors = this.moleGroundColors(mob.position.x, data.surfaceY, mob.position.z);
        if (Math.random() < delta * 40) this.moleThrowDirt(mob.position.x, data.surfaceY, mob.position.z, 1, 0.45, 3.2, colors);
        data.rumbleTimer -= delta;
        if (data.rumbleTimer <= 0) {
            data.rumbleTimer = 0.15;
            data.rumbleStep += 1;
            const volume = this.moleVolume(mob, 22);
            if (volume > 0) {
                this.playNoiseBurst({ duration: 0.2, volume: 0.045 * volume, highpass: 40, lowpass: 260 + data.rumbleStep * 60 });
                this.playTone({ frequency: 45 + data.rumbleStep * 12, endFrequency: 55 + data.rumbleStep * 14, duration: 0.16, type: 'triangle', volume: 0.03 * volume, release: 0.08 });
            }
        }
        if (data.moleTimer <= 0) this.moleStartEmerging(mob, true);
    },

    // Bursts out of a fresh mound; on an attack, whoever stands there is bowled over.
    moleStartEmerging(mob, attack) {
        const data = mob.userData;
        data.moleState = 'emerging';
        data.moleTimer = attack ? 0.45 : 0.75;
        data.moleDuration = data.moleTimer;
        data.huntTarget = null;
        data.tunnelTarget = null;
        mob.position.y = data.surfaceY - MOLE_DEPTH;
        this.moleSetBuried(mob, false);
        data.moleTilt = -0.9;
        const colors = this.moleGroundColors(mob.position.x, data.surfaceY, mob.position.z);
        this.moleMakeMound(mob.position.x, data.surfaceY, mob.position.z, 1);
        this.moleThrowDirt(mob.position.x, data.surfaceY, mob.position.z, attack ? 26 : 16, 0.45, attack ? 5 : 3.6, colors);
        const volume = this.moleVolume(mob, 24);
        if (volume > 0) {
            this.playNoiseBurst({ duration: 0.35, volume: 0.05 * volume, highpass: 60, lowpass: 1100 });
            this.playTone({ frequency: 95, endFrequency: 45, duration: 0.28, type: 'sine', volume: 0.05 * volume, release: 0.15 });
        }
        if (attack) {
            data.calm = 10;
            this.moleSqueak(mob, 0.7);
            const eye = this.getLocalPlayerPosition();
            const dx = eye.x - mob.position.x;
            const dz = eye.z - mob.position.z;
            const feetY = eye.y - this.cameraController.eyeHeight;
            if (!this.respawnPending && Math.hypot(dx, dz) < 1.5 && Math.abs(feetY - data.surfaceY) < 1.3) {
                const away = Math.hypot(dx, dz) > 0.05 ? [dx, dz] : [Math.cos(data.facing), Math.sin(data.facing)];
                this.cameraController.applyKnockback(away[0], away[1], 6.5, 5.5);
                this.applyDamage(2, 'You were bowled over by a giant mole');
            }
        }
        data.moleTimer = data.moleDuration;
    },

    moleEmerge(mob, delta) {
        const data = mob.userData;
        const t = 1 - Math.max(0, data.moleTimer) / data.moleDuration;
        const eased = 1 - Math.pow(1 - t, 3);
        mob.position.y = data.surfaceY - MOLE_DEPTH * (1 - eased) + Math.sin(t * Math.PI) * 0.15;
        this.molePose(mob, delta, { walking: false, sniff: 1, dig: 1, tilt: -0.9 * (1 - t) });
        if (data.moleTimer > 0) return;
        mob.position.y = data.surfaceY;
        data.moleState = 'surfaced';
        data.moleTimer = 6 + Math.random() * 9;
        data.paused = 1.5;
    },

    // Struck above ground: it squeaks and dives away; below ground it cannot be reached.
    moleHit(mob) {
        const data = mob.userData;
        if (data.moleBuried || data.moleState === 'diving') return;
        data.health -= 4;
        this.updateMobHealthBar(mob);
        data.flinch = 0.35;
        this.moleSqueak(mob, 1);
        this.playNoiseBurst({ duration: 0.05, volume: 0.015, highpass: 200, lowpass: 1200 });
        const colors = this.moleGroundColors(mob.position.x, data.surfaceY, mob.position.z);
        if (data.health <= 0) {
            this.moleThrowDirt(mob.position.x, data.surfaceY, mob.position.z, 20, 0.5, 3.5, colors);
            this.moleMakeMound(mob.position.x, data.surfaceY, mob.position.z, 1);
            this.emitMobEvent('defeated', mob, 'player');
            this.removeMob(mob);
            this.receiveSystemMessage({ text: 'You defeated the giant mole' });
            return;
        }
        data.huntTarget = null;
        data.flee = 7;
        data.calm = 12;
        const player = this.getLocalPlayerPosition();
        data.facing = Math.atan2(mob.position.z - player.z, mob.position.x - player.x);
        if (data.moleState === 'emerging') mob.position.y = data.surfaceY;
        this.moleStartDiving(mob, 0.7);
    },

    moleSqueak(mob, loudness) {
        const volume = this.moleVolume(mob, 20) * loudness;
        if (volume <= 0) return;
        const tone = getMobSpecies('mole').tone;
        this.playTone({ frequency: tone, endFrequency: tone * 1.4, duration: 0.08, type: 'square', volume: 0.018 * volume, release: 0.05, detune: (Math.random() - 0.5) * 60 });
        setTimeout(() => this.playTone({ frequency: tone * 1.15, endFrequency: tone * 1.55, duration: 0.07, type: 'square', volume: 0.014 * volume, release: 0.05 }), 110);
    },

    moleVolume(mob, range) {
        const eye = this.camera.position;
        const distance = Math.hypot(eye.x - mob.position.x, eye.z - mob.position.z);
        return distance >= range ? 0 : Math.pow(1 - distance / range, 1.5);
    },

    // Body, claws, nose and tail. walking/dig/sniff are 0..1 blends; tilt pitches the whole
    // body (positive is nose down).
    molePose(mob, delta, { walking, sniff, dig, tilt }) {
        const data = mob.userData;
        const parts = data.modelParts;
        if (!parts || !data.modelRoot) return;
        data.life += delta;
        const blend = Math.min(1, delta * 6);
        data.moleGait += ((walking ? 1 : 0) - data.moleGait) * blend;
        data.moleDig += (dig - data.moleDig) * blend;
        data.moleSniff = (data.moleSniff ?? 0) + (sniff - (data.moleSniff ?? 0)) * blend;
        data.moleTilt += (tilt - data.moleTilt) * Math.min(1, delta * 8);
        data.stepPhase += delta * 9 * data.moleGait;
        const phase = data.stepPhase;
        const life = data.life;

        // Breaststroke with the forelimbs when walking; a frantic churn when digging.
        ['armL', 'armR'].forEach((name, index) => {
            const arm = parts[name];
            if (!arm) return;
            const base = arm.userData.baseRotation;
            const offset = index * Math.PI;
            arm.rotation.x = base.x + Math.sin(phase + offset) * 0.55 * data.moleGait + Math.sin(life * 20 + offset) * 0.75 * data.moleDig;
            arm.rotation.y = base.y + Math.cos(phase + offset) * 0.25 * data.moleGait * (index ? -1 : 1);
        });
        ['legL', 'legR'].forEach((name, index) => {
            const leg = parts[name];
            if (leg) leg.rotation.x = leg.userData.baseRotation.x + Math.sin(phase + index * Math.PI + 1) * 0.5 * data.moleGait;
        });

        // Blind sniffing: the head sweeps, the snout bobs and the star never stops wiggling.
        const head = parts.head;
        if (head) {
            const sweep = data.moleSniff;
            head.rotation.y = head.userData.baseRotation.y + Math.sin(life * 1.7) * 0.4 * sweep + Math.sin(life * 7.3) * 0.04;
            head.rotation.x = head.userData.baseRotation.x - 0.08 + Math.sin(life * 2.9) * 0.12 * sweep;
        }
        if (parts.snout) parts.snout.rotation.x = Math.sin(life * 14) * 0.07 * (0.3 + data.moleSniff);
        const wiggle = 0.4 + data.moleSniff;
        for (let i = 0; i < 10; i++) {
            const tentacle = parts[`tentacle${i}`];
            if (!tentacle) continue;
            const base = tentacle.userData.baseRotation;
            tentacle.rotation.x = base.x + Math.sin(life * 22 + i * 1.7) * 0.32 * wiggle;
            tentacle.rotation.y = base.y + Math.cos(life * 19 + i * 2.3) * 0.28 * wiggle;
        }
        if (parts.tail) parts.tail.rotation.y = Math.sin(life * 3.1) * 0.3 + Math.sin(phase) * 0.2 * data.moleGait;
        if (parts.body) parts.body.scale.y = 1 + Math.sin(life * 2.4) * 0.015;

        data.flinch = Math.max(0, (data.flinch || 0) - delta);
        const flinch = data.flinch > 0 ? Math.sin((data.flinch / 0.35) * Math.PI) : 0;
        data.modelRoot.rotation.x = data.moleTilt - flinch * 0.25;
        data.modelRoot.position.y = Math.abs(Math.sin(phase)) * 0.03 * data.moleGait + flinch * 0.12;
        data.modelRoot.rotation.z = Math.sin(phase) * 0.06 * data.moleGait + Math.sin(life * 24) * 0.03 * data.moleDig;
    },

    // Hidden underground: on a layer the camera and the mob raycast never see.
    moleSetBuried(mob, buried) {
        mob.userData.moleBuried = buried;
        this.moleSyncVisibility(mob);
        if (!buried) this.updateMobHealthBar(mob);
    },

    // Also re-applies the hiding after the model is rebuilt (graphics quality change).
    moleSyncVisibility(mob) {
        const data = mob.userData;
        const buried = Boolean(data.moleBuried);
        if (data.moleVisRoot === data.modelRoot && data.moleVisBuried === buried) return;
        data.moleVisRoot = data.modelRoot;
        data.moleVisBuried = buried;
        data.modelRoot.visible = !buried;
        data.modelRoot.traverse((node) => node.layers.set(buried ? 31 : 0));
        if (data.healthBar && buried) data.healthBar.visible = false;
    },

    // The travelling hump of earth over the tunnelling mole.
    moleUpdateBulge(mob, delta) {
        const data = mob.userData;
        const show = data.moleBuried && (data.moleState === 'underground' || data.moleState === 'rumble');
        if (!show) {
            if (data.moleBulge) data.moleBulge.visible = false;
            return;
        }
        const colors = this.moleGroundColors(mob.position.x, data.surfaceY, mob.position.z);
        const key = `${colors.base}:${colors.accent}:${this.rtxModeEnabled}`;
        if (!data.moleBulge || data.moleBulgeKey !== key) {
            this.moleRemoveBulge(mob);
            const lumps = [];
            for (let i = 0; i < 11; i++) {
                const along = (i / 10 - 0.5) * 1.2;
                const across = (Math.random() - 0.5) * 0.55;
                const height = 0.28 * (1 - Math.abs(along) / 0.75) * (1 - Math.abs(across));
                const size = 0.22 + Math.random() * 0.14;
                lumps.push({ x: across, y: height - size * 0.5, z: along, sx: size, sy: size * 0.8, sz: size * 1.1, ry: Math.random() * Math.PI, color: this.moleLumpColor(colors, i < 2) });
            }
            const mesh = new THREE.Mesh(this.moleBuildEarthGeometry(lumps), this.moleEarthMaterial());
            mesh.castShadow = this.rtxModeEnabled;
            mesh.receiveShadow = this.rtxModeEnabled;
            this.scene.add(mesh);
            data.moleBulge = mesh;
            data.moleBulgeKey = key;
        }
        const bulge = data.moleBulge;
        bulge.visible = true;
        const rumbling = data.moleState === 'rumble';
        const heave = rumbling ? 1.6 : data.moleMoving ? 1 : 0.5;
        const t = data.bulgeLife = (data.bulgeLife || 0) + delta;
        bulge.position.set(mob.position.x, data.surfaceY - 0.04, mob.position.z);
        if (rumbling) {
            bulge.position.x += (Math.random() - 0.5) * 0.12;
            bulge.position.z += (Math.random() - 0.5) * 0.12;
        }
        bulge.rotation.y = Math.PI / 2 - data.facing + Math.sin(t * 5) * 0.08;
        bulge.scale.set(1 + Math.sin(t * 7) * 0.08 * heave, 0.75 + (Math.sin(t * 9) * 0.5 + 0.5) * 0.45 * heave, 1 + Math.sin(t * 6 + 1) * 0.1 * heave);
    },

    moleRemoveBulge(mob) {
        const bulge = mob.userData.moleBulge;
        if (!bulge) return;
        this.scene.remove(bulge);
        bulge.geometry.dispose();
        mob.userData.moleBulge = null;
    },

    // Colours of the earth at a surface point: the ground block's side (dirt under grass)
    // with a grassy accent for torn turf. Soft ground is where it can dig.
    moleGroundColors(x, surfaceY, z) {
        const type = this.world.getBlockTypeAt(Math.floor(x), Math.floor(surfaceY - 0.01), Math.floor(z));
        const def = type && this.world.blockTypes[type];
        const soft = MOLE_SOFT_GROUND.includes(type);
        const base = def && soft ? (def.side ?? def.color) : 0x8b5a2b;
        const accent = def && soft && def.top !== undefined && def.top !== base ? def.top : null;
        return { base, accent, soft };
    },

    moleLumpColor(colors, accent) {
        const hex = accent && colors.accent !== null ? colors.accent : colors.base;
        const shade = Math.random() < 0.2 ? 0.68 : 0.82 + Math.random() * 0.28;
        return new THREE.Color(hex).convertSRGBToLinear().multiplyScalar(shade);
    },

    moleEarthMaterial() {
        const key = this.rtxModeEnabled ? 'hd' : 'sd';
        this.moleMaterials = this.moleMaterials || {};
        if (!this.moleMaterials[key]) {
            this.moleMaterials[key] = this.rtxModeEnabled
                ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, envMapIntensity: 0.3 })
                : new THREE.MeshLambertMaterial({ vertexColors: true });
        }
        return this.moleMaterials[key];
    },

    // One mesh from many boxes (lumps: { x, y, z, sx, sy, sz, ry, color }), with top faces a
    // little lighter and undersides dark.
    moleBuildEarthGeometry(lumps) {
        const source = _moleBox.attributes;
        const count = source.position.count;
        const positions = new Float32Array(lumps.length * count * 3);
        const normals = new Float32Array(lumps.length * count * 3);
        const colors = new Float32Array(lumps.length * count * 3);
        lumps.forEach((lump, index) => {
            _moleQuat.setFromEuler(_moleEuler.set(0, lump.ry, 0));
            _moleMatrix.compose(_molePos.set(lump.x, lump.y, lump.z), _moleQuat, _moleScale.set(lump.sx, lump.sy, lump.sz));
            _moleNormalMatrix.getNormalMatrix(_moleMatrix);
            for (let v = 0; v < count; v++) {
                const i = (index * count + v) * 3;
                _moleVec.fromBufferAttribute(source.position, v).applyMatrix4(_moleMatrix);
                positions[i] = _moleVec.x;
                positions[i + 1] = _moleVec.y;
                positions[i + 2] = _moleVec.z;
                _moleVec.fromBufferAttribute(source.normal, v).applyMatrix3(_moleNormalMatrix).normalize();
                normals[i] = _moleVec.x;
                normals[i + 1] = _moleVec.y;
                normals[i + 2] = _moleVec.z;
                const shade = _moleVec.y > 0.5 ? 1.1 : _moleVec.y < -0.5 ? 0.55 : 0.9;
                colors[i] = lump.color.r * shade;
                colors[i + 1] = lump.color.g * shade;
                colors[i + 2] = lump.color.b * shade;
            }
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.computeBoundingSphere();
        return geometry;
    },

    // A heap of earth clods on the surface at (x, surfaceY, z); size 1 is a full mound
    // (~1.2 blocks across), smaller ones are trail molehills. They pop up, then after 40-60 s
    // settle and sink away.
    moleMakeMound(x, surfaceY, z, size) {
        const colors = this.moleGroundColors(x, surfaceY, z);
        const radius = 0.6 * size;
        const height = 0.5 * size;
        const lumps = [];
        const total = Math.round(5 + 10 * size);
        for (let i = 0; i < total; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = i === 0 ? 0 : radius * Math.sqrt(Math.random());
            const s = (0.16 + Math.random() * 0.16) * (0.6 + size * 0.4);
            const top = height * (1 - Math.pow(r / radius, 1.4) * 0.85);
            lumps.push({
                x: Math.cos(angle) * r, y: top - s * 0.55, z: Math.sin(angle) * r,
                sx: s * (1 + Math.random() * 0.4), sy: s, sz: s * (1 + Math.random() * 0.4), ry: Math.random() * Math.PI,
                color: this.moleLumpColor(colors, r > radius * 0.6 && Math.random() < 0.3)
            });
        }
        const mesh = new THREE.Mesh(this.moleBuildEarthGeometry(lumps), this.moleEarthMaterial());
        mesh.position.set(x, surfaceY - 0.03, z);
        mesh.rotation.y = Math.random() * Math.PI * 2;
        mesh.scale.setScalar(0.01);
        mesh.castShadow = this.rtxModeEnabled;
        mesh.receiveShadow = this.rtxModeEnabled;
        mesh.userData.baseY = mesh.position.y;
        mesh.userData.age = 0;
        mesh.userData.life = 40 + Math.random() * 20;
        mesh.userData.size = size;
        this.scene.add(mesh);
        this.moleMounds = this.moleMounds || [];
        this.moleMounds.push(mesh);
        while (this.moleMounds.length > MOLE_MOUND_LIMIT) this.moleDisposeMound(this.moleMounds.shift());
    },

    moleDisposeMound(mound) {
        this.scene.remove(mound);
        mound.geometry.dispose();
    },

    // Clods flung from the ground: they arc, bounce once, then crumble away. One instanced
    // mesh holds them all.
    moleThrowDirt(x, surfaceY, z, count, spread, power, colors, heading = null) {
        this.moleClods = this.moleClods || [];
        for (let i = 0; i < count && this.moleClods.length < MOLE_CLOD_LIMIT; i++) {
            const angle = heading !== null ? heading + (Math.random() - 0.5) * 0.9 : Math.random() * Math.PI * 2;
            const out = heading !== null ? 1.2 + Math.random() * 1.2 : Math.random() * 1.6;
            this.moleClods.push({
                position: new THREE.Vector3(x + (Math.random() - 0.5) * spread, surfaceY + 0.1, z + (Math.random() - 0.5) * spread),
                velocity: new THREE.Vector3(Math.cos(angle) * out, power * (0.6 + Math.random() * 0.5), Math.sin(angle) * out),
                spin: new THREE.Euler(Math.random() * 3, Math.random() * 3, 0),
                floor: surfaceY,
                size: 0.06 + Math.random() * 0.09,
                color: this.moleLumpColor(colors, Math.random() < 0.15),
                age: 0,
                life: 0.9 + Math.random() * 0.9
            });
        }
    },

    // Every frame (see the wrapper below): mounds rise and sink, clods fly.
    moleUpdateEarthworks(delta) {
        if (this.moleMounds && this.moleMounds.length) {
            this.moleMounds = this.moleMounds.filter((mound) => {
                const info = mound.userData;
                info.age += delta;
                if (info.age >= info.life) {
                    this.moleDisposeMound(mound);
                    return false;
                }
                // Dug out from under (or built over): it crumbles away.
                info.check = (info.check ?? Math.random() * 0.25) - delta;
                if (info.check <= 0) {
                    info.check = 0.25;
                    const x = Math.floor(mound.position.x);
                    const z = Math.floor(mound.position.z);
                    const y = Math.round(info.baseY);
                    if (!this.world.hasSolidBlock(x, y - 1, z) || this.world.hasSolidBlock(x, y, z)) {
                        const floor = this.cameraController.getFloorY(mound.position.x, mound.position.z, info.baseY);
                        if (floor > -20) this.moleThrowDirt(mound.position.x, floor, mound.position.z, Math.round(4 + 8 * info.size), 0.4 * info.size, 1.2, this.moleGroundColors(mound.position.x, info.baseY, mound.position.z));
                        this.moleDisposeMound(mound);
                        return false;
                    }
                }
                const grow = Math.min(1, info.age / 0.35);
                const pop = grow < 1 ? grow * (1 + Math.sin(grow * Math.PI) * 0.35) : 1;
                const sink = Math.max(0, (info.age - (info.life - 8)) / 8);
                mound.scale.set(pop * (1 + sink * 0.2), pop * (1 - sink * 0.8), pop * (1 + sink * 0.2));
                mound.position.y = info.baseY - sink * 0.35 * info.size;
                return true;
            });
        }
        if (!this.moleClods || (!this.moleClods.length && !this.moleClodMesh)) return;
        if (!this.moleClodMesh || this.moleClodMesh.userData.rtx !== this.rtxModeEnabled) {
            if (this.moleClodMesh) {
                this.scene.remove(this.moleClodMesh);
                this.moleClodMesh.geometry.dispose();
                this.moleClodMesh.material.dispose();
            }
            const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.moleEarthMaterialPlain(), MOLE_CLOD_LIMIT);
            mesh.frustumCulled = false;
            mesh.castShadow = this.rtxModeEnabled;
            mesh.userData.rtx = this.rtxModeEnabled;
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            // Colours exist from the start so the shader is compiled with them.
            for (let i = 0; i < MOLE_CLOD_LIMIT; i++) mesh.setColorAt(i, _moleColor.setRGB(1, 1, 1));
            mesh.count = 0;
            this.scene.add(mesh);
            this.moleClodMesh = mesh;
        }
        const mesh = this.moleClodMesh;
        this.moleClods = this.moleClods.filter((clod) => {
            clod.age += delta;
            if (clod.age >= clod.life) return false;
            if (clod.velocity.lengthSq() > 0) {
                clod.velocity.y -= 16 * delta;
                clod.position.addScaledVector(clod.velocity, delta);
                clod.spin.x += delta * 9;
                clod.spin.y += delta * 7;
                if (clod.position.y <= clod.floor + clod.size * 0.5 && clod.velocity.y < 0) {
                    clod.position.y = clod.floor + clod.size * 0.5;
                    if (clod.velocity.y < -3) clod.velocity.set(clod.velocity.x * 0.3, -clod.velocity.y * 0.25, clod.velocity.z * 0.3);
                    else clod.velocity.set(0, 0, 0);
                }
            }
            return true;
        });
        this.moleClods.forEach((clod, index) => {
            const crumble = Math.min(1, (clod.life - clod.age) / 0.4);
            _moleQuat.setFromEuler(clod.spin);
            _moleMatrix.compose(clod.position, _moleQuat, _moleScale.setScalar(clod.size * crumble));
            mesh.setMatrixAt(index, _moleMatrix);
            mesh.setColorAt(index, clod.color);
        });
        mesh.count = this.moleClods.length;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },

    // Instanced clods are tinted per instance, not per vertex.
    moleEarthMaterialPlain() {
        return this.rtxModeEnabled
            ? new THREE.MeshStandardMaterial({ roughness: 0.97, metalness: 0, envMapIntensity: 0.3 })
            : new THREE.MeshLambertMaterial();
    },

    // Footfalls the moles can feel: sprinting (or galloping), jumping and heavy landings,
    // unless sneaking. Leaves this.moleVibration = { x, y, z, radius, time }.
    moleSenseVibrations(delta) {
        this.moleClock = (this.moleClock || 0) + delta;
        const controller = this.cameraController;
        const eye = this.getLocalPlayerPosition();
        const onGround = controller.onGround;
        const last = this.moleLastStep;
        this.moleLastStep = { x: eye.x, z: eye.z, onGround, airTime: onGround ? 0 : (last ? last.airTime : 0) + delta };
        if (!last || delta <= 0) return;
        const speed = Math.hypot(eye.x - last.x, eye.z - last.z) / delta;
        if (speed > 30) return; // teleport or respawn
        this.moleStride = (this.moleStride || 0) + (speed - (this.moleStride || 0)) * Math.min(1, delta * 6);
        if (controller.isCrouching || controller.isInWater || this.respawnPending || this.titleScreenOpen) return;
        let radius = 0;
        if (onGround && this.moleStride > 5.2) radius = 16;
        if (last.onGround && !onGround && controller.velocityY > 2) radius = Math.max(radius, 12);
        if (!last.onGround && onGround && last.airTime > 0.35) radius = Math.max(radius, 14);
        if (!radius) return;
        this.moleVibration = { x: eye.x, y: eye.y - controller.eyeHeight, z: eye.z, radius, time: this.moleClock };
    }
});

// Mounds and clods outlive the mole that made them, so they update every frame alongside
// the mobs rather than from a mole's own update.
const _moleBaseUpdateAmbientMobs = Game.prototype.updateAmbientMobs;
Game.prototype.updateAmbientMobs = function (delta) {
    _moleBaseUpdateAmbientMobs.call(this, delta);
    this.moleSenseVibrations(delta);
    this.moleUpdateEarthworks(delta);
};

registerMobBehaviour('tunnel', {
    update(mob, delta, player) {
        this.updateBurrowingMob(mob, delta, player);
    },
    interact(mob) {
        this.moleHit(mob);
    }
});

onMobEvent('removed', function (mob) {
    if (mob.userData.species === 'mole') this.moleRemoveBulge(mob);
});
