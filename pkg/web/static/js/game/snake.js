// Snakes. A solitary ambush hunter of deserts and rocky hills. Most of the time it lies in
// wait: buried in sand (or dirt) with only the top of its head and its eyes showing, or, on
// bare rock, coiled flat and still. A player who comes within ~5 blocks (less when sneaking)
// gets a warning: it rears up into a coiled S-pose facing them and hisses, and the
// diamondback and rock variants shake their rattle. Coming closer than ~2.2 blocks earns a
// strike, a lunge that bites for 1 damage plus venom. Backing off calms it down: it uncoils,
// slithers away and buries itself again somewhere else. Struck, it recoils and turns angrier;
// badly hurt, it flees.
//
// The body is a chain of segments that follow the head's path (a trail of points it leaves
// behind), so the sinuous side-to-side path of the head becomes the body's waves; coiling,
// striking and burying are poses blended on top. Variants: sandy diamondback (rattle, desert),
// green snake (desert and rocky) and banded rock rattlesnake (rocky).
// Registered as the 'slither' movement through js/extensions.js.

// Distance between body joints, in model units and in blocks.
const SNAKE_SEGMENT_UNITS = 2.8;
const SNAKE_SPACING = SNAKE_SEGMENT_UNITS / 16;
const SNAKE_SEGMENTS = 9;
const SNAKE_WIDTHS = [2.5, 2.9, 3.1, 3, 2.7, 2.3, 1.8, 1.3, 0.9];
const SNAKE_SOFT_GROUND = new Set(['sand', 'dirt', 'grass', 'gravel', 'clay']);

const SNAKE_PALETTES = [
    // Sandy diamondback: dark diamonds outlined in cream, a black-and-white banded tail.
    { base: 0xc9a66b, dark: 0x6e4b2a, light: 0xecd9a8, belly: 0xeadcb4, bellyLine: 0xcdb98a, eye: 0xd9a227, rattle: true, tailBands: [0x2a221c, 0xe6dcc4] },
    // Green snake: bright back with a darker dorsal stripe and a yellowish belly.
    { base: 0x5e9a3c, dark: 0x3f7228, light: 0x8cc25a, belly: 0xd6e07a, bellyLine: 0xb4c45c, eye: 0xe8d23a, rattle: false },
    // Rock rattlesnake: speckled grey with dark crossbands.
    { base: 0x8f897e, dark: 0x3a342e, light: 0xbdb6a8, belly: 0xd8d2c4, bellyLine: 0xb0a898, eye: 0xd2742a, rattle: true }
];

MOB_SPECIES.snake = {
    eggColor: 0xb89a5a, tone: 520, hostile: true, attackDamage: 1, poison: 3, maxHealth: 6,
    speed: 0.9, fleeSpeed: 2.6, alertDistance: 5, strikeDistance: 2.2,
    variants: SNAKE_PALETTES.length, group: [1, 1], limit: 3, movement: 'slither'
};
VoxelModels.MOB_SURFACES.snake = 'skin';

// Faces the +z axis. Body segments are top-level parts placed every frame by poseSnake, each
// pivoted at its front joint and reaching back to the next one.
VoxelModels.mobBuilders.snake = function (b, variant) {
    const c = SNAKE_PALETTES[variant % SNAKE_PALETTES.length];
    const S = SNAKE_SEGMENT_UNITS;

    const diamond = (p) => {
        const cx = p.w / 2;
        const half = p.h / 2;
        const radius = Math.min(p.w * 0.5, half);
        for (let y = 0; y < p.h; y += 0.5) {
            const t = 1 - Math.abs(y + 0.25 - half) / half;
            if (t <= 0) continue;
            const hw = radius * t;
            p.rect(cx - hw, y, hw * 2, 0.5, c.light, 0.03);
            if (hw > 0.5) p.rect(cx - hw + 0.5, y, hw * 2 - 1, 0.5, c.dark, 0.05);
        }
    };
    const segmentPaint = (index) => ({
        color: c.base, noise: 0.07, bevel: 0.12,
        all: (p, face) => {
            if (face === 'bottom') {
                p.fill(c.belly, 0.04);
                for (let y = 0.3; y < p.h; y += 0.9) p.rect(0, y, p.w, 0.25, c.bellyLine, 0.03);
                return;
            }
            if (face === 'front' || face === 'back') return;
            if (c.tailBands && index >= SNAKE_SEGMENTS - 3) {
                p.fill(c.tailBands[index % 2], 0.05);
                return;
            }
            if (variant === 0) {
                if (face === 'top') diamond(p);
                else {
                    p.spots(c.dark, 2, 0.6, 1, index);
                    p.rect(0, p.h - 0.5, p.w, 0.5, c.belly, 0.04);
                }
            } else if (variant === 1) {
                if (face === 'top') {
                    p.spots(c.light, 3, 0.3, 0.6, index);
                    p.rect(p.w / 2 - 0.35, 0, 0.7, p.h, c.dark, 0.05);
                } else {
                    p.rect(0, p.h * 0.55, p.w, p.h * 0.45, c.light, 0.04);
                }
            } else {
                p.spots(c.light, 3, 0.3, 0.5, index);
                p.spots(c.dark, 2, 0.3, 0.4, index + 9);
                if (face === 'top') p.rect(0, p.h * 0.3, p.w, 1, c.dark, 0.05);
                else p.rect(p.w * 0.3, 0, 1, p.h, c.dark, 0.05);
            }
        }
    });

    for (let i = 0; i < SNAKE_SEGMENTS; i++) {
        const w = SNAKE_WIDTHS[i];
        b.part(`seg${i}`, { pivot: [0, 0, -i * S], from: [-w / 2, 0, -S - 0.4], size: [w, w * 0.62, S + 0.8], paint: segmentPaint(i) });
    }
    const tailLength = S + 0.4;
    if (c.rattle) {
        const rattlePaint = { color: variant === 0 ? 0xd8c49a : 0xa89e8c, noise: 0.06, bevel: 0.2, faces: { top: (p) => p.rect(0, p.h - 0.25, p.w, 0.25, 0x6a5a40, 0) } };
        b.part('rattle1', { parent: `seg${SNAKE_SEGMENTS - 1}`, pivot: [0, 0.15, -tailLength], from: [-0.6, -0.1, -0.9], size: [1.2, 0.85, 0.9], paint: rattlePaint });
        b.part('rattle2', { parent: 'rattle1', pivot: [0, 0, -0.9], from: [-0.5, -0.05, -0.8], size: [1, 0.7, 0.8], paint: rattlePaint });
        b.part('rattle3', { parent: 'rattle2', pivot: [0, 0, -0.8], from: [-0.4, 0, -0.7], size: [0.8, 0.55, 0.7], paint: rattlePaint });
    } else {
        b.part('tailTip', { parent: `seg${SNAKE_SEGMENTS - 1}`, pivot: [0, 0.1, -tailLength], from: [-0.3, 0, -1.8], size: [0.6, 0.35, 1.8], paint: { color: c.base, noise: 0.05 } });
    }

    // Wedge-shaped head with a hinged jaw, fangs, bulging eyes and a forked tongue.
    b.part('head', {
        pivot: [0, 0, 0], from: [-1.7, 0.6, -0.6], size: [3.4, 1.3, 4.6],
        paint: {
            color: c.base, noise: 0.06, bevel: 0.14,
            faces: {
                top: (p) => {
                    if (variant === 0) { p.rect(0.6, 2.2, 0.6, 2.4, c.dark, 0.04); p.rect(2.2, 2.2, 0.6, 2.4, c.dark, 0.04); }
                    if (variant === 1) p.rect(1.35, 0, 0.7, 2.4, c.dark, 0.04);
                    if (variant === 2) p.rect(0, 1, p.w, 0.8, c.dark, 0.05);
                },
                left: (p) => { p.rect(0, 0.55, p.w, 0.35, c.dark, 0.03); p.rect(0, 1, p.w, 0.3, c.belly, 0.03); },
                right: (p) => { p.rect(0, 0.55, p.w, 0.35, c.dark, 0.03); p.rect(0, 1, p.w, 0.3, c.belly, 0.03); },
                front: (p) => { p.rect(0.8, 0.4, 0.5, 0.4, 0x15100c, 0); p.rect(2.1, 0.4, 0.5, 0.4, 0x15100c, 0); p.rect(0, 1, p.w, 0.3, c.belly, 0.03); },
                bottom: (p) => p.fill(0xb85a6a, 0.04)
            }
        }
    });
    b.part('jaw', {
        parent: 'head', pivot: [0, 0.6, -0.4], from: [-1.5, -0.6, 0], size: [3, 0.6, 4.3],
        paint: { color: c.belly, noise: 0.04, bevel: 0.1, faces: { top: (p) => { p.fill(0xc4687a, 0.05); p.rect(1.2, 0, 0.6, p.h, 0x9a4458, 0); } } }
    });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`fang${side}`, { parent: 'head', pivot: [0.85 * sign, 0.6, 3.5], from: [-0.15, -0.7, -0.15], size: [0.3, 0.7, 0.3], paint: { color: 0xf4efe2, noise: 0, bevel: 0 } });
        b.part(`eye${side}`, {
            parent: 'head', pivot: [1.5 * sign, 1.6, 2.7], from: [-0.45, -0.45, -0.55], size: [0.9, 0.85, 1.1],
            paint: {
                color: c.eye, noise: 0.02, bevel: 0.1,
                all: (p, face) => {
                    if (face === 'left' || face === 'right') p.rect(p.w / 2 - 0.25, 0, 0.5, p.h, 0x0b0805, 0);
                    if (face === 'top') p.fill(c.dark, 0.04);
                }
            }
        });
    });
    b.part('tongue', { parent: 'head', pivot: [0, 0.75, 3.8], from: [-0.2, -0.1, 0], size: [0.4, 0.2, 1.8], paint: { color: 0xb8243a, noise: 0.03, bevel: 0 } });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`fork${side}`, { parent: 'tongue', pivot: [0.12 * sign, 0, 1.7], from: [-0.1, -0.1, 0], size: [0.2, 0.2, 1], paint: { color: 0x8a1a2c, noise: 0.02, bevel: 0 }, rotation: [0, 0.45 * sign, 0] });
    });
    return { head: 'head' };
};

const _snakeTrail = new THREE.Vector3();
const _snakeUp = new THREE.Vector3(0, 1, 0);
const _snakeLocalA = new THREE.Vector3();
const _snakeLocalB = new THREE.Vector3();

Object.assign(Game.prototype, {
    snakeInit(mob, state = null) {
        const data = mob.userData;
        const heading = data.direction ?? Math.random() * Math.PI * 2;
        data.snake = {
            state: 'hidden', timer: 0, heading, facing: heading, coilYaw: heading,
            spin: Math.random() < 0.5 ? 1 : -1, wave: Math.random() * Math.PI * 2,
            coil: 0, raise: 0, buried: 0, lunge: 0, recoil: 0, strikeT: 0, bit: false,
            alertTime: 0, calm: 0, hiss: 0, hissGap: 0, hissTick: 0, rattleTick: 0,
            tongueTimer: 1 + Math.random() * 3, tongueT: -1, target: new THREE.Vector3(),
            trail: [], joints: Array.from({ length: SNAKE_SEGMENTS + 1 }, () => new THREE.Vector3()),
            soft: true
        };
        this.snakeResetTrail(mob, heading);
        // Natural ones lie in wait; summoned ones slither about first so they can be seen.
        if ((state || (data.natural ? 'hidden' : 'roam')) === 'hidden') this.snakeHide(mob, true);
        else this.snakeRoam(mob, heading, 3 + Math.random() * 2);
        return data.snake;
    },

    // Natural spawning: now and then a desert or rocky chunk has one snake lying in wait.
    snakeSpawnForChunk(chunkX, chunkZ, biome) {
        if (biome !== 'desert' && biome !== 'rocky') return;
        if (this.chunkRandom(chunkX, chunkZ, 301) > (biome === 'desert' ? 0.16 : 0.1)) return;
        const info = getMobSpecies('snake');
        if (this.ambientMobs.filter((mob) => mob.userData.species === 'snake').length >= info.limit) return;
        const size = this.world.chunkSize;
        for (let i = 0; i < 6; i++) {
            const x = chunkX * size + 2 + this.chunkRandom(chunkX, chunkZ, 302 + i) * (size - 4);
            const z = chunkZ * size + 2 + this.chunkRandom(chunkX, chunkZ, 312 + i) * (size - 4);
            const ground = this.cameraController.getFloorY(x, z, 64);
            if (ground <= -20) continue;
            const surface = this.world.getBlockTypeAt(Math.floor(x), ground - 1, Math.floor(z));
            const above = this.world.getBlockTypeAt(Math.floor(x), ground, Math.floor(z));
            if (!surface || above === 'water' || surface === 'water' || surface === 'cactus' || surface.endsWith('leaves')) continue;
            const roll = this.chunkRandom(chunkX, chunkZ, 322);
            const variant = biome === 'desert' ? (roll < 0.75 ? 0 : 1) : (roll < 0.7 ? 2 : 1);
            const mob = this.createMob('snake', new THREE.Vector3(x, ground, z), { variant });
            mob.userData.natural = true;
            mob.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
            this.ambientMobs.push(mob);
            this.snakeInit(mob, 'hidden');
            return;
        }
    },

    snakeSpawnCommand(species, x, z, player) {
        const floorY = this.cameraController.getFloorY(x, z, player.y + 4);
        if (floorY <= -20) {
            this.receiveSystemMessage({ text: 'Could not find safe ground for the snake' });
            return true;
        }
        const mob = this.createMob('snake', new THREE.Vector3(x, floorY, z));
        mob.userData.direction = Math.atan2(z - player.z, x - player.x);
        this.ambientMobs.push(mob);
        this.snakeInit(mob, 'roam');
        this.receiveSystemMessage({ text: 'Spawned a snake. Keep your distance' });
        return true;
    },

    // A straight trail behind the head, draped over the terrain.
    snakeResetTrail(mob, heading) {
        const s = mob.userData.snake;
        const position = mob.position;
        s.trail = [];
        for (let i = 1; i <= SNAKE_SEGMENTS + 3; i++) {
            const x = position.x - Math.cos(heading) * i * SNAKE_SPACING;
            const z = position.z - Math.sin(heading) * i * SNAKE_SPACING;
            const floor = this.cameraController.getFloorY(x, z, position.y + 1);
            s.trail.push({ x, y: Math.abs(floor - position.y) <= 1.1 ? floor : position.y, z });
        }
    },

    // The head leaves a point every few centimetres; the body joints sit along that path.
    snakeRecordTrail(mob) {
        const s = mob.userData.snake;
        const position = mob.position;
        const last = s.trail[0];
        if (last && Math.hypot(position.x - last.x, position.z - last.z) < 0.04) return;
        s.trail.unshift({ x: position.x, y: position.y, z: position.z });
        let length = 0;
        let prev = position;
        for (let i = 0; i < s.trail.length; i++) {
            length += Math.hypot(s.trail[i].x - prev.x, s.trail[i].z - prev.z);
            prev = s.trail[i];
            if (length > (SNAKE_SEGMENTS + 1) * SNAKE_SPACING + 0.3) {
                s.trail.length = i + 1;
                break;
            }
        }
    },

    snakeSampleTrail(mob, distance, out) {
        const s = mob.userData.snake;
        let prev = mob.position;
        let remaining = distance;
        for (const point of s.trail) {
            const length = Math.hypot(point.x - prev.x, point.z - prev.z);
            if (length >= remaining && length > 0) {
                const t = remaining / length;
                return out.set(prev.x + (point.x - prev.x) * t, prev.y + (point.y - prev.y) * t, prev.z + (point.z - prev.z) * t);
            }
            remaining -= length;
            prev = point;
        }
        // Past the end of the trail: carry on straight.
        const n = s.trail.length;
        const a = n >= 2 ? s.trail[n - 2] : mob.position;
        const dx = prev.x - a.x;
        const dz = prev.z - a.z;
        const length = Math.hypot(dx, dz) || 1;
        const fx = n >= 2 ? dx / length : -Math.cos(s.heading);
        const fz = n >= 2 ? dz / length : -Math.sin(s.heading);
        return out.set(prev.x + fx * remaining, prev.y, prev.z + fz * remaining);
    },

    // Lie in wait: buried in soft ground, coiled flat on rock.
    snakeHide(mob, instant = false) {
        const s = mob.userData.snake;
        const position = mob.position;
        s.state = 'hidden';
        s.timer = (this.isNightTime() ? 12 : 25) + Math.random() * 30;
        const surface = this.world.getBlockTypeAt(Math.floor(position.x), Math.floor(position.y - 0.5), Math.floor(position.z));
        s.soft = SNAKE_SOFT_GROUND.has(surface);
        if (!s.soft) {
            s.coilYaw = s.heading;
            s.facing = s.heading;
        }
        if (instant) {
            s.buried = s.soft ? 1 : 0;
            s.coil = s.soft ? 0 : 1;
            s.raise = 0.1;
        } else if (s.soft) {
            this.snakeSandBurst(mob, surface, 4);
        }
    },

    // Rear up into the coil, facing the player, and warn.
    snakeAlert(mob, player) {
        const s = mob.userData.snake;
        if (s.state !== 'alert' && s.state !== 'strike') {
            if (s.buried > 0.3) this.snakeSandBurst(mob, null, 3);
            // Already coiled flat on rock: it only turns its head; otherwise it coils facing them.
            if (s.coil < 0.5) s.coilYaw = Math.atan2(player.z - mob.position.z, player.x - mob.position.x);
            s.facing = s.coilYaw;
        }
        s.state = 'alert';
        s.alertTime = 0;
        s.calm = 0;
        s.hiss = 0;
        s.hissGap = 0;
        s.tongueTimer = 0.2;
    },

    // Uncoil and slither off, following `heading`, for `time` seconds.
    snakeRoam(mob, heading, time, flee = false) {
        const s = mob.userData.snake;
        if (s.coil > 0.05) {
            // The coil becomes the trail, so the body unwinds behind the head.
            const head = s.joints[0];
            const floor = this.cameraController.getFloorY(head.x, head.z, mob.position.y + 1);
            if (Math.abs(floor - mob.position.y) <= 1) mob.position.set(head.x, floor, head.z);
            s.trail = s.joints.slice(1).map((joint) => ({ x: joint.x, y: mob.position.y, z: joint.z }));
            s.heading = s.facing;
        }
        if (s.buried > 0.3) this.snakeSandBurst(mob, null, 3);
        s.state = flee ? 'flee' : 'roam';
        s.timer = time;
        s.target.set(mob.position.x + Math.cos(heading) * 6, mob.position.y, mob.position.z + Math.sin(heading) * 6);
    },

    snakeUpdate(mob, delta, player) {
        const data = mob.userData;
        const s = data.snake || this.snakeInit(mob);
        const position = mob.position;
        const info = getMobSpecies('snake');
        data.life += delta;

        if (position.y < -20) {
            // Spawned before its chunk existed: drop it onto the terrain once it does.
            const ground = this.cameraController.getFloorY(position.x, position.z, 64);
            if (ground <= -20) return;
            position.y = ground;
            this.snakeResetTrail(mob, s.heading);
        }
        const ground = this.cameraController.getFloorY(position.x, position.z, position.y + 0.6);
        if (position.y - ground > 0.02) position.y = Math.max(ground, position.y - 6 * delta);

        const dx = player.x - position.x;
        const dz = player.z - position.z;
        const distance = Math.hypot(dx, dz);
        const reachable = !this.titleScreenOpen && !this.respawnPending && Math.abs(player.y - 1.6 - position.y) < 2.5;
        const sneaking = this.cameraController.isCrouching;
        const alertDistance = info.alertDistance * (sneaking ? 0.5 : 1);
        const towardsPlayer = Math.atan2(dz, dx);
        let speed = 0;

        s.recoil = Math.max(0, s.recoil - delta * 2.5);
        if (s.state === 'hidden') {
            s.coilTarget = s.soft ? 0 : 1;
            s.raiseTarget = 0.1;
            s.buriedTarget = s.soft ? 1 : 0;
            s.timer -= delta;
            if (reachable && distance < alertDistance) {
                if (data.health <= data.maxHealth * 0.34) this.snakeRoam(mob, Math.atan2(-dz, -dx), 5, true);
                else this.snakeAlert(mob, player);
            } else if (s.timer <= 0 && distance > 10) this.snakeRoam(mob, s.heading + (Math.random() - 0.5) * 2.5, 4 + Math.random() * 5);
        } else if (s.state === 'alert' || s.state === 'strike') {
            s.coilTarget = 1;
            s.raiseTarget = 1;
            s.buriedTarget = 0;
            s.alertTime += delta;
            s.facing = this.lerpAngle(s.facing, towardsPlayer, Math.min(1, delta * 6));
            if (s.state === 'strike') {
                s.strikeT += delta;
                const t = Math.min(1, s.strikeT / 0.42);
                s.lunge = Math.sin(t * Math.PI);
                // The whole coil springs forward a little too.
                if (s.strikeT < 0.2 && distance > 1.1) this.walkStep(mob, s.facing, 3 * delta, delta);
                if (!s.bit && s.strikeT >= 0.15) {
                    s.bit = true;
                    if (reachable && distance < info.strikeDistance + 0.6) {
                        this.applyDamage(info.attackDamage, 'You were bitten by a snake', 'mob');
                        this.poisonPlayer(info.poison, 'snake');
                        this.playTone({ frequency: 240, endFrequency: 120, duration: 0.09, type: 'triangle', volume: 0.03, release: 0.06 });
                    }
                }
                if (t >= 1) {
                    s.state = 'alert';
                    s.lunge = 0;
                    s.alertTime = 0.2;
                    data.attackCooldown = 1.4;
                }
            } else {
                this.snakeWarn(mob, delta, distance);
                if (reachable && distance < info.strikeDistance && data.attackCooldown <= 0 && s.alertTime > 0.6) {
                    s.state = 'strike';
                    s.strikeT = 0;
                    s.bit = false;
                    s.tongueT = -1;
                    this.snakeSound(mob, 'strike', distance);
                }
                s.calm = !reachable || distance > alertDistance + 1.5 ? s.calm + delta : 0;
                if (s.calm > 2.5) {
                    this.snakeRoam(mob, Math.atan2(-dz, -dx) + (Math.random() - 0.5), 3 + Math.random() * 3);
                }
            }
        } else {
            // Roaming or fleeing: slither in waves towards the target.
            const fleeing = s.state === 'flee';
            s.coilTarget = 0;
            s.buriedTarget = 0;
            s.timer -= delta;
            if (fleeing) s.target.set(position.x - dx, position.y, position.z - dz);
            const goal = Math.atan2(s.target.z - position.z, s.target.x - position.x);
            s.heading = this.lerpAngle(s.heading, goal, Math.min(1, delta * (fleeing ? 4 : 2)));
            speed = fleeing ? info.fleeSpeed : info.speed;
            s.wave += speed * delta * Math.PI * 2 / 1.1;
            const moveHeading = s.heading + Math.sin(s.wave) * (fleeing ? 0.5 : 0.65);
            s.facing = moveHeading;
            const step = this.walkStep(mob, moveHeading, speed * delta, delta);
            if (!step.moved) {
                const turn = s.heading + Math.PI * (0.5 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1);
                s.heading = turn;
                s.target.set(position.x + Math.cos(turn) * 4, position.y, position.z + Math.sin(turn) * 4);
            }
            this.snakeRecordTrail(mob);
            const arrived = Math.hypot(s.target.x - position.x, s.target.z - position.z) < 0.4;
            if (fleeing && s.timer <= 0) this.snakeRoam(mob, s.heading, 2 + Math.random() * 2);
            else if (!fleeing && (arrived || s.timer <= 0)) this.snakeHide(mob);
            else if (!fleeing && reachable && distance < alertDistance * 0.7 && data.health > data.maxHealth * 0.34) this.snakeAlert(mob, player);
        }

        // Ease between poses.
        const ease = (value, target, rate) => value + (target - value) * Math.min(1, delta * rate);
        s.coil = ease(s.coil, s.coilTarget, s.coilTarget > s.coil ? 6 : 4);
        s.raise = ease(s.raise, s.raiseTarget ?? s.raise, 5);
        s.buried = ease(s.buried, s.buriedTarget, s.buriedTarget > s.buried ? 1.2 : 6);
        if (s.state !== 'strike') s.lunge = 0;

        this.snakeTongue(mob, delta);
        const yaw = Math.PI / 2 - (s.state === 'alert' || s.state === 'strike' ? s.coilYaw : s.heading);
        mob.rotation.y = this.lerpAngle(mob.rotation.y, yaw, Math.min(1, delta * 6));
        this.poseSnake(mob, speed);
    },

    // While coiled: hissing in bursts, the rattle buzzing, the jaw a little open.
    snakeWarn(mob, delta, distance) {
        const s = mob.userData.snake;
        const rattler = SNAKE_PALETTES[mob.userData.variant % SNAKE_PALETTES.length].rattle;
        s.hissGap -= delta;
        if (s.hiss <= 0 && s.hissGap <= 0) {
            s.hiss = 0.8 + Math.random() * 0.6;
            s.hissGap = s.hiss + (rattler ? 1.5 : 0.6) + Math.random();
        }
        if (s.hiss > 0) {
            s.hiss -= delta;
            s.hissTick -= delta;
            if (s.hissTick <= 0) {
                s.hissTick = 0.1;
                this.snakeSound(mob, 'hiss', distance, rattler ? 0.6 : 1);
            }
        }
        if (rattler) {
            s.rattleTick -= delta;
            if (s.rattleTick <= 0) {
                s.rattleTick = 0.035 + Math.random() * 0.02;
                this.snakeSound(mob, 'rattle', distance);
            }
        }
    },

    snakeSound(mob, kind, distance, scale = 1) {
        const volume = Math.max(0, 1 - distance / 16) * scale;
        if (volume <= 0) return;
        if (kind === 'hiss') {
            this.playNoiseBurst({ duration: 0.2, volume: 0.03 * volume, highpass: 3200, lowpass: 9500 });
        } else if (kind === 'rattle') {
            this.playNoiseBurst({ duration: 0.025, volume: 0.028 * volume, highpass: 2400, lowpass: 7000 });
        } else if (kind === 'strike') {
            this.playNoiseBurst({ duration: 0.18, volume: 0.045 * volume, highpass: 1500, lowpass: 7000 });
            this.playTone({ frequency: 190, endFrequency: 90, duration: 0.08, type: 'triangle', volume: 0.025 * volume, release: 0.05 });
        } else if (kind === 'hurt') {
            this.playNoiseBurst({ duration: 0.2, volume: 0.04 * volume, highpass: 2500, lowpass: 8000 });
            this.playTone({ frequency: getMobSpecies('snake').tone, endFrequency: 300, duration: 0.1, type: 'sawtooth', volume: 0.012 * volume, release: 0.06, detune: (Math.random() - 0.5) * 60 });
        }
    },

    // Sand (or whatever it lies in) sprays up as it buries itself or bursts out.
    snakeSandBurst(mob, surface, count) {
        const position = mob.position;
        const type = surface || this.world.getBlockTypeAt(Math.floor(position.x), Math.floor(position.y - 0.5), Math.floor(position.z)) || 'sand';
        const s = mob.userData.snake;
        for (let i = 0; i < count; i++) {
            const joint = s.joints[Math.floor(Math.random() * s.joints.length)];
            const point = (joint.lengthSq() > 0 ? joint : position).clone();
            point.y = position.y;
            this.spawnMiningParticles(type, point, _snakeUp);
        }
        this.playNoiseBurst({ duration: 0.18, volume: 0.02, highpass: 200, lowpass: 1400 });
    },

    // Tongue flicks: often when alert, now and then otherwise (even poking out of the sand).
    snakeTongue(mob, delta) {
        const s = mob.userData.snake;
        const tongue = mob.userData.modelParts.tongue;
        s.tongueTimer -= delta;
        if (s.tongueTimer <= 0 && s.tongueT < 0 && s.state !== 'strike') {
            s.tongueT = 0;
            s.tongueTimer = s.state === 'alert' ? 0.5 + Math.random() * 0.8 : 1.5 + Math.random() * 3.5;
        }
        let out = 0;
        if (s.tongueT >= 0) {
            s.tongueT += delta;
            out = Math.sin(Math.min(1, s.tongueT / 0.4) * Math.PI);
            if (s.tongueT >= 0.4) s.tongueT = -1;
        }
        if (!tongue) return;
        tongue.visible = out > 0.05;
        tongue.scale.z = Math.max(0.05, out);
        tongue.rotation.x = Math.sin(mob.userData.life * 55) * 0.3 * out;
    },

    // World positions of the joints (trail pose blended with the coil, the lunge, the recoil
    // and burial), then each part placed between its joints in the mob's local frame.
    poseSnake(mob, speed) {
        const data = mob.userData;
        const s = data.snake;
        const parts = data.modelParts;
        const position = mob.position;
        const joints = s.joints;
        const raise = s.raise;

        // Coil: the body spirals on the ground behind the anchor, the neck rises towards
        // `facing` in an S.
        const cx = position.x - Math.cos(s.coilYaw) * 0.26;
        const cz = position.z - Math.sin(s.coilYaw) * 0.26;
        const fx = Math.cos(s.facing);
        const fz = Math.sin(s.facing);
        const coilJoint = (k, out) => {
            if (k >= 3) {
                let angle = s.coilYaw;
                let radius = 0.24;
                for (let i = 3; i < k; i++) {
                    angle += SNAKE_SPACING / radius * s.spin;
                    radius -= 0.022;
                }
                out.set(cx + Math.cos(angle) * radius, position.y, cz + Math.sin(angle) * radius);
                if (k >= SNAKE_SEGMENTS - 1 && SNAKE_PALETTES[data.variant % SNAKE_PALETTES.length].rattle) {
                    out.y += (k === SNAKE_SEGMENTS ? 0.14 : 0.05) * raise;
                }
                return out;
            }
            const base = s.coilYaw;
            const bx = cx + Math.cos(base) * 0.24;
            const bz = cz + Math.sin(base) * 0.24;
            const n = 3 - k;
            const side = [0.07, -0.05, 0][n - 1] * raise;
            const sway = Math.sin(data.life * 1.7) * 0.03 * raise * n / 3;
            out.set(
                bx + fx * n * SNAKE_SPACING * 0.72 - fz * (side + sway),
                position.y + [0.12, 0.27, 0.36][n - 1] * raise + 0.02 * n / 3,
                bz + fz * n * SNAKE_SPACING * 0.72 + fx * (side + sway)
            );
            return out;
        };

        for (let k = 0; k <= SNAKE_SEGMENTS; k++) {
            const joint = joints[k];
            if (s.coil < 0.999) this.snakeSampleTrail(mob, k * SNAKE_SPACING, joint);
            if (s.coil > 0.001) {
                coilJoint(k, _snakeTrail);
                if (s.coil >= 0.999) joint.copy(_snakeTrail);
                else joint.lerp(_snakeTrail, s.coil);
            }
            if (k <= 2) {
                // The lunge throws the neck forward and down; a hit snaps it back.
                const reach = s.lunge * [0.6, 0.38, 0.16][k] - s.recoil * [0.25, 0.15, 0.06][k];
                joint.x += fx * reach;
                joint.z += fz * reach;
                if (k === 0) joint.y += (position.y + 0.16 - joint.y) * s.lunge * 0.7 + s.recoil * 0.08;
            }
            joint.y -= s.buried * (k === 0 ? 0.045 : 0.17);
        }

        // Into the local frame of the mob group (rotation about y only).
        const ry = mob.rotation.y;
        const c = Math.cos(ry);
        const sn = Math.sin(ry);
        const local = (point, out) => {
            const wx = point.x - position.x;
            const wz = point.z - position.z;
            return out.set(c * wx - sn * wz, point.y - position.y, sn * wx + c * wz);
        };
        const a = _snakeLocalA;
        const b = _snakeLocalB;
        for (let k = 0; k < SNAKE_SEGMENTS; k++) {
            const segment = parts[`seg${k}`];
            if (!segment) continue;
            local(joints[k], a);
            local(joints[k + 1], b);
            const ddx = a.x - b.x;
            const ddy = a.y - b.y;
            const ddz = a.z - b.z;
            const flat = Math.hypot(ddx, ddz);
            segment.position.copy(a);
            segment.rotation.order = 'YXZ';
            segment.rotation.set(-Math.atan2(ddy, flat), Math.atan2(ddx, ddz), 0);
            segment.scale.z = Math.min(2.4, Math.max(0.6, Math.hypot(flat, ddy) / SNAKE_SPACING));
        }

        // Head: along its heading (or at the player), nose level, jaw open to strike or hiss.
        const head = parts.head;
        if (head) {
            local(joints[0], a);
            local(joints[1], b);
            const hx = Math.cos(s.facing);
            const hz = Math.sin(s.facing);
            head.position.copy(a);
            head.rotation.order = 'YXZ';
            const slope = -Math.atan2(a.y - b.y, Math.max(0.05, Math.hypot(a.x - b.x, a.z - b.z)));
            const look = s.coil > 0.5 ? 0.12 * raise : slope * 0.5;
            head.rotation.set(look - s.lunge * 0.35 * (1 - s.buried) - s.recoil * 0.4, Math.atan2(c * hx - sn * hz, sn * hx + c * hz), Math.sin(data.life * 1.3) * 0.05 * raise);
            const hissing = s.state === 'alert' && s.hiss > 0 ? 0.28 + Math.sin(data.life * 9) * 0.04 : 0;
            if (parts.jaw) parts.jaw.rotation.x = Math.max(hissing, s.lunge * 0.8, s.recoil * 0.6);
            ['fangL', 'fangR'].forEach((name) => { if (parts[name]) parts[name].visible = parts.jaw.rotation.x > 0.15; });
            if (data.healthBar) data.healthBar.position.set(a.x, a.y + 0.5, a.z);
        }

        // Rattle buzz while warning; a gentle swish of the tail tip otherwise.
        const rattling = s.state === 'alert' || s.state === 'strike';
        const tip = parts.rattle1 || parts.tailTip;
        if (tip) {
            tip.rotation.y = rattling && parts.rattle1 ? Math.sin(data.life * 95) * 0.35 : Math.sin(data.life * 2 + speed) * 0.25;
            tip.rotation.x = rattling && parts.rattle1 ? -0.5 : 0;
        }
        // Slow breathing swell of the body while still.
        const breath = 1 + Math.sin(data.life * 1.8) * 0.03 * (speed > 0 ? 0 : 1);
        for (let k = 1; k < 5; k++) if (parts[`seg${k}`]) parts[`seg${k}`].scale.x = breath;
    },

    // Struck: it recoils and turns on the attacker; badly hurt, it flees.
    snakeHit(mob) {
        const data = mob.userData;
        const s = data.snake || this.snakeInit(mob);
        const player = this.getLocalPlayerPosition();
        const distance = Math.hypot(player.x - mob.position.x, player.z - mob.position.z);
        data.health -= 2;
        this.updateMobHealthBar(mob);
        this.snakeSound(mob, 'hurt', distance);
        if (data.health <= 0) {
            this.snakeSandBurst(mob, null, 3);
            this.emitMobEvent('defeated', mob, 'player');
            this.removeMob(mob);
            this.receiveSystemMessage({ text: 'You defeated the snake' });
            return;
        }
        s.recoil = 1;
        s.buried = Math.min(s.buried, 0.3);
        if (data.health <= data.maxHealth * 0.34) {
            this.snakeRoam(mob, Math.atan2(mob.position.z - player.z, mob.position.x - player.x), 6, true);
            return;
        }
        // Angry: it strikes back almost at once.
        this.snakeAlert(mob, player);
        s.alertTime = 0.45;
        data.attackCooldown = Math.min(data.attackCooldown, 0.3);
    }
});

registerMobBehaviour('slither', {
    update(mob, delta, player) { this.snakeUpdate(mob, delta, player); },
    interact(mob) { this.snakeHit(mob); },
    spawnCommand(species, x, z, player) { return this.snakeSpawnCommand(species, x, z, player); },
    spawnForChunk(chunkX, chunkZ, biome) { this.snakeSpawnForChunk(chunkX, chunkZ, biome); }
});
