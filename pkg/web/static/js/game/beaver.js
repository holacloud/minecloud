// Beavers. Families of one to three live on the banks of rivers and lakes in forests and
// plains. They waddle on land and swim low in the water with only the head and back showing.
// Now and then a beaver walks to a small tree near the water, gnaws round its trunk (wood
// chips fly) and fells it: the trunk blocks are broken through the normal multiplayer path
// (world.removeBlockAt + 'blockBreak'), so everybody sees the tree go, and the leaves left
// hanging fall away a few at a time. It carries the logs in its mouth to a narrow stretch of
// shallow water and builds a small dam there (logs at the waterline, mud on top) and a lodge
// upstream: four walls and a roof over a water cell, entered from under the water. On a lake
// shore with no narrow stretch it builds only the lodge. Blocks are placed through the normal
// path too (world.addBlock + 'blockPlace').
//
// Bounds, to keep the world safe: only trees of at most BEAVER_MAX_TRUNK trunk blocks with no
// wood beside the trunk, within BEAVER_WATER_RANGE blocks of its water, one tree every few
// minutes per beaver and one a minute among all of them, never anything near blocks a player
// may have placed (anything but natural terrain within BEAVER_BUILD_GUARD blocks), and at most
// BEAVER_MAX_PLACED blocks placed per beaver. Sites already used are remembered in
// localStorage so that beavers coming back adopt them instead of building another one.
//
// A player coming near makes a swimming beaver slap its tail on the water (a loud splash) and
// dive, swimming underwater to its lodge; the other beavers within earshot dive as well. On
// land it runs for the water first. Three bare-handed blows defeat it.
// Movement mode 'lodge'; mixed into Game.prototype and hooked in via js/extensions.js.

const BEAVER_WADDLE = 0.75;
const BEAVER_RUN = 2.1;
const BEAVER_SWIM = 1.5;
const BEAVER_DIVE_SPEED = 2.6;
const BEAVER_GRAVITY = 14;
const BEAVER_SWIM_DEPTH = 0.3;
const BEAVER_TREE_SEARCH = 10;
const BEAVER_WATER_RANGE = 12;
const BEAVER_MAX_TRUNK = 5;
const BEAVER_BUILD_GUARD = 3;
const BEAVER_MAX_PLACED = 12;
const BEAVER_MAX_LOGS = 4;
const BEAVER_TREE_COOLDOWN = 180;
const BEAVER_FELL_GAP = 60;
const BEAVER_GNAW_TIME = 7;
const BEAVER_SITE_SEARCH = 12;
const BEAVER_SITE_SPACING = 10;
const BEAVER_MAX_LEAVES = 80;
const BEAVER_ALARM_RANGE = 24;
const BEAVER_STORAGE_KEY = 'minecloud-beaver-dams';
const BEAVER_MAX_SITES = 40;

// Blocks the world generator makes. A tree or a site with anything else around it is next to
// something a player built, and beavers leave it alone.
const BEAVER_NATURAL_BLOCKS = new Set(['grass', 'moss', 'dirt', 'stone', 'sand', 'water', 'bedrock', 'coal_ore', 'iron_ore', 'gold_ore',
    'copper_ore', 'tin_ore', 'zinc_ore', 'lead_ore', 'silver_ore', 'cactus', 'tall_grass', 'flower_red', 'flower_yellow', 'mushroom_red', 'mushroom_brown', 'wood', 'leaves']);
const BEAVER_HORIZONTAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function beaverIsWood(type) {
    return type === 'wood' || (typeof type === 'string' && type.endsWith('_wood'));
}

function beaverIsLeaves(type) {
    return type === 'leaves' || (typeof type === 'string' && type.endsWith('_leaves'));
}

function beaverIsNatural(type) {
    return type === null || BEAVER_NATURAL_BLOCKS.has(type) || beaverIsWood(type) || beaverIsLeaves(type);
}

function beaverLeavesFor(woodType) {
    return woodType === 'wood' ? 'leaves' : woodType.replace('_wood', '_leaves');
}

MOB_SPECIES.beaver = { eggColor: 0x7a4a2a, tone: 340, speed: BEAVER_WADDLE, maxHealth: 12, variants: 2, group: [1, 3], limit: 4, movement: 'lodge' };
VoxelModels.MOB_SURFACES.beaver = 'fur';

// Faces +z: a round, low body, a blunt head with small ears and big orange incisors, short
// front paws, strong hind legs with wide webbed feet and a flat, scaly paddle of a tail.
VoxelModels.mobBuilders.beaver = function (b, variant) {
    const palettes = [
        { fur: 0x7a4a2a, back: 0x5e3820, belly: 0x9c6c46, muzzle: 0x8f6040 },
        { fur: 0x8e5430, back: 0x6e3e22, belly: 0xb07a4e, muzzle: 0xa06a44 }
    ];
    const c = palettes[variant % palettes.length];
    const tailDark = 0x2e2420;
    const tailScale = 0x4a3c34;
    const foot = 0x3a2a22;
    const fur = (extra) => ({ color: c.fur, noise: 0.07, ...extra });
    // Rows of small plates offset like bricks, darker seams between them.
    const scales = (p) => {
        for (let row = 0, y = 0.15; y < p.h; row++, y += 0.85) {
            for (let x = (row % 2) * 0.5 - 0.5; x < p.w; x += 1) p.rect(Math.max(0, x + 0.12), y, 0.76, 0.6, tailScale, 0.05);
        }
    };

    b.part('body', {
        pivot: [0, 0, 0], from: [-3.5, 1.5, -5], size: [7, 5.5, 10],
        paint: fur({
            faces: {
                top: (p) => p.rect(1.5, 0, 4, p.h, c.back, 0.06),
                bottom: (p) => p.fill(c.belly, 0.05),
                front: (p) => p.rect(1.5, 2.5, 4, 3, c.belly, 0.05),
                left: (p) => p.rect(0, 4.4, p.w, 1.1, c.belly, 0.05),
                right: (p) => p.rect(0, 4.4, p.w, 1.1, c.belly, 0.05)
            }
        })
    });
    b.part('head', {
        parent: 'body', pivot: [0, 5, 5], from: [-2.5, -2, -0.5], size: [5, 4, 4],
        paint: fur({
            faces: {
                front: (p) => {
                    VoxelModels.eyes(p, 0.9, 0.7, 0x120c0a, 0.8);
                    p.rect(1, 2.6, 3, 1.4, c.muzzle, 0.04);
                },
                top: (p) => p.rect(1, 0, 3, p.h, c.back, 0.05),
                bottom: (p) => p.fill(c.belly, 0.04)
            }
        })
    });
    b.part('snout', {
        parent: 'head', pivot: [0, -1.2, 3.5], from: [-1.75, -0.8, 0], size: [3.5, 2, 1.6],
        paint: {
            color: c.muzzle, noise: 0.05,
            faces: {
                front: (p) => { p.rect(1, 0, 1.5, 0.8, 0x1a1210, 0); p.rect(0.2, 1, 3.1, 0.3, 0x5a3a26, 0.02); },
                top: (p) => p.rect(1, p.h - 0.7, 1.5, 0.7, 0x1a1210, 0)
            }
        }
    });
    b.part('teeth', {
        parent: 'snout', pivot: [0, -0.8, 1.15], from: [-0.85, -1.3, 0], size: [1.7, 1.3, 0.4],
        paint: { color: 0xe8862a, noise: 0.03, bevel: 0, faces: { front: (p) => { p.rect(0.78, 0, 0.14, p.h, 0x8a4a14, 0); p.rect(0, 0, p.w, 0.25, 0xf2b060, 0); } } }
    });
    const earPaint = { color: c.back, noise: 0.04, faces: { front: (p) => p.rect(0.25, 0.25, 0.5, 0.5, 0x3a2418, 0) } };
    b.part('earL', { parent: 'head', pivot: [2.1, 1.9, 1], from: [-0.5, 0, -0.4], size: [1, 1, 0.8], paint: earPaint });
    b.part('earR', { parent: 'head', pivot: [-2.1, 1.9, 1], from: [-0.5, 0, -0.4], size: [1, 1, 0.8], paint: earPaint });

    // Flat paddle, gently sloping down behind the body.
    b.part('tail', {
        parent: 'body', pivot: [0, 2.6, -4.6], from: [-2.5, -0.4, -7], size: [5, 0.8, 7],
        paint: { color: tailDark, noise: 0.04, surface: 'skin', bevel: 0.05, faces: { top: scales, bottom: scales } },
        rotation: [-0.2, 0, 0]
    });
    b.part('tailBase', { parent: 'body', pivot: [0, 2.6, -4.6], from: [-1.75, -0.7, -1.4], size: [3.5, 1.6, 1.8], paint: fur({ faces: { top: (p) => p.fill(c.back, 0.05) } }) });

    // Short front paws; hind legs end in wide webbed feet.
    const pawPaint = fur({ all: (p, face) => { if (face !== 'top') p.rect(0, p.h - 0.6, p.w, 0.6, foot, 0.04); } });
    b.part('legFL', { parent: 'body', pivot: [2.3, 2.5, 3], from: [-0.75, -2.5, -0.75], size: [1.5, 2.5, 1.5], paint: pawPaint });
    b.part('legFR', { parent: 'body', pivot: [-2.3, 2.5, 3], from: [-0.75, -2.5, -0.75], size: [1.5, 2.5, 1.5], paint: pawPaint });
    const footPaint = {
        color: foot, noise: 0.04, bevel: 0.05,
        faces: { top: (p) => { for (let x = 0.3; x < p.w; x += 0.8) p.rect(x, 0, 0.25, p.h, 0x5a4438, 0.03); } }
    };
    ['L', 'R'].forEach((side) => {
        const sign = side === 'L' ? 1 : -1;
        b.part(`legB${side}`, { parent: 'body', pivot: [2.9 * sign, 3, -2.8], from: [-1.1, -2.5, -1.1], size: [2.2, 2.5, 2.2], paint: fur() });
        b.part(`foot${side}`, { parent: `legB${side}`, pivot: [0, -2.5, 0.3], from: [-1.6, -0.5, -1.2], size: [3.2, 0.5, 3.4], paint: footPaint });
    });
    return { legs: ['legFL', 'legFR', 'legBL', 'legBR'], head: 'head', tail: ['tail'] };
};

registerMobBehaviour('lodge', {
    update(mob, delta, player) { this.beaverUpdate(mob, delta, player); },
    interact(mob) { this.beaverStruck(mob); },
    spawnForChunk(chunkX, chunkZ, biome) { this.beaverSpawnForChunk(chunkX, chunkZ, biome); }
});

onMobEvent('removed', function (mob) {
    const b = mob.userData.beaver;
    if (!b) return;
    this.beaverReleaseTree(b);
    if (b.logMesh) {
        b.logMesh.material.forEach((material) => material.dispose());
        b.logMesh = null;
    }
});

// Wood chips, falling trunks and the leaves that come down after a tree is felled.
registerFrameUpdate(function (delta) {
    this.beaverFrame(delta);
});

Object.assign(Game.prototype, {
    // ---- Spawning ---------------------------------------------------------------------------

    // A family on a bank of some chunks of forest and plains.
    beaverSpawnForChunk(chunkX, chunkZ, biome) {
        if (biome !== 'forest' && biome !== 'plains') return;
        if (this.chunkRandom(chunkX, chunkZ, 371) > 0.22) return;
        const info = getMobSpecies('beaver');
        const alive = this.ambientMobs.filter((mob) => mob.userData.species === 'beaver').length;
        if (alive >= info.limit) return;
        const size = this.world.chunkSize;
        for (let attempt = 0; attempt < 10; attempt++) {
            const x = chunkX * size + 1 + this.chunkRandom(chunkX, chunkZ, 372 + attempt) * (size - 2);
            const z = chunkZ * size + 1 + this.chunkRandom(chunkX, chunkZ, 392 + attempt) * (size - 2);
            const spot = this.findShoreSpot(x, z);
            if (!spot || !['grass', 'dirt', 'sand'].includes(spot.ground)) continue;
            const [min, max] = info.group;
            const count = Math.min(info.limit - alive, min + Math.floor(this.chunkRandom(chunkX, chunkZ, 373) * (max - min + 1)));
            for (let i = 0; i < count; i++) {
                const mob = this.createMob('beaver', new THREE.Vector3(spot.x + (Math.random() - 0.5) * 0.6, spot.y, spot.z + (Math.random() - 0.5) * 0.6));
                mob.userData.natural = true;
                mob.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
                mob.userData.beaverPond = { x: Math.floor(spot.water.x), y: Math.floor(spot.y) - 1, z: Math.floor(spot.water.z) };
                this.ambientMobs.push(mob);
            }
            return;
        }
    },

    beaverState(mob) {
        const data = mob.userData;
        const b = {
            mode: 'wander', timer: 1 + Math.random() * 2, facing: Math.PI / 2 - mob.rotation.y, heading: 0, walking: false,
            vy: 0, gait: 0, inWater: false, depth: 0, wantsWater: Math.random() < 0.5, swimTimer: 15 + Math.random() * 25,
            // Beavers from /mob or an egg get to work soon, so you can watch them.
            treeCooldown: data.natural ? 45 + Math.random() * 75 : 8, pond: data.beaverPond || null, pondSearch: 0,
            scan: 1 + Math.random() * 2, tree: null, stand: null, site: null, lodgeSite: null, siteCooldown: 0, logs: 0, logType: 'wood', placed: 0,
            travel: 0, target: null, inLodge: false, slap: 0, slapCooldown: 0, chipTimer: 0, chewTimer: 0, push: 0,
            groom: 0, flinch: 0, chatter: 4 + Math.random() * 10, ripple: 0, lookYaw: 0, lookTimer: 0, logMesh: null
        };
        b.heading = b.facing;
        data.beaver = b;
        return b;
    },

    // ---- Per frame --------------------------------------------------------------------------

    beaverUpdate(mob, delta, player) {
        const data = mob.userData;
        const b = data.beaver || this.beaverState(mob);
        const position = mob.position;
        mob.rotation.order = 'YXZ';
        data.life += delta;

        if (position.y < -20) {
            // Spawned before its chunk was generated: drop it onto the terrain once it exists.
            const ground = this.cameraController.getFloorY(position.x, position.z, 64);
            if (ground <= -20) return;
            position.y = ground;
            data.home.y = ground;
        }

        b.timer -= delta;
        b.treeCooldown -= delta;
        b.slapCooldown = Math.max(0, b.slapCooldown - delta);
        b.flinch = Math.max(0, b.flinch - delta);
        b.push = Math.max(0, b.push - delta);

        const surface = this.findWaterSurface(position.x, position.y + 0.2, position.z);
        b.inWater = surface !== null && surface > position.y + 0.15;
        if (b.inWater) {
            b.pond = { x: Math.floor(position.x), y: Math.floor(surface), z: Math.floor(position.z) };
        } else if (!b.pond) {
            b.pondSearch -= delta;
            if (b.pondSearch <= 0) {
                b.pondSearch = 5;
                b.pond = this.beaverFindWater(position, BEAVER_WATER_RANGE);
            }
        }

        // In a cage: sit still and chew.
        if (data.trapsCage) {
            if (b.mode !== 'wander') this.beaverAbandon(b, 20);
            this.beaverVertical(mob, b, surface, delta);
            this.beaverAnimate(mob, delta, 0, surface);
            return;
        }

        // The player: wary in the water, a little bolder on land and busiest while gnawing.
        const feetY = player.y - this.cameraController.eyeHeight;
        const distance = Math.hypot(position.x - player.x, position.z - player.z);
        const watchful = !this.titleScreenOpen && !this.respawnPending && Math.abs(feetY - position.y) < 3;
        const sneaking = this.cameraController.isCrouching;
        const wariness = b.mode === 'gnaw' || b.mode === 'build' ? (sneaking ? 1.8 : 3.5) : b.inWater ? (sneaking ? 3.5 : 7) : (sneaking ? 2.5 : 4.5);
        const near = watchful && distance < wariness;
        const loudness = Math.max(0, 1 - Math.hypot(position.x - player.x, player.y - position.y, position.z - player.z) / 24);
        if (near && b.mode !== 'flee' && b.mode !== 'dive') this.beaverAlarm(mob, player, true);

        let speed = 0;
        switch (b.mode) {
            case 'wander': speed = this.beaverWander(mob, b, delta, surface); break;
            case 'toTree': speed = this.beaverGoToTree(mob, b, delta); break;
            case 'gnaw': this.beaverGnaw(mob, b, delta, loudness); break;
            case 'toSite': speed = this.beaverGoToSite(mob, b, delta); break;
            case 'build': this.beaverBuild(mob, b, delta, player); break;
            case 'flee': speed = this.beaverFlee(mob, b, delta, player); break;
            case 'dive': speed = this.beaverDive(mob, b, delta, player, near); break;
        }

        this.beaverVertical(mob, b, surface, delta);
        b.facing = this.lerpAngle(b.facing, b.heading, Math.min(1, delta * (b.mode === 'flee' || b.mode === 'dive' ? 8 : 4)));
        mob.rotation.y = Math.PI / 2 - b.facing;
        this.beaverSounds(mob, b, delta, speed, loudness);
        this.beaverAnimate(mob, delta, speed, surface);
    },

    // Stand on the ground (falling when it drops away), float at the surface or swim deep.
    beaverVertical(mob, b, surface, delta) {
        const position = mob.position;
        if (b.inWater) {
            b.vy = 0;
            const diving = b.mode === 'dive' && !b.inLodge;
            let targetY = surface - BEAVER_SWIM_DEPTH;
            if (diving) {
                const bed = this.cameraController.getFloorY(position.x, position.z, surface);
                targetY = Math.max(bed + 0.05, surface - 1.6);
            }
            b.depth += ((diving ? 1 : 0) - b.depth) * Math.min(1, delta * 3);
            const step = Math.min(Math.abs(targetY - position.y), delta * 1.6);
            position.y += Math.sign(targetY - position.y) * step;
            return;
        }
        b.depth = 0;
        const ground = this.cameraController.getFloorY(position.x, position.z, position.y + 0.5);
        if (ground <= -20) return;
        if (position.y - ground > 0.01 || b.vy > 0) {
            b.vy -= BEAVER_GRAVITY * delta;
            position.y += b.vy * delta;
            if (position.y <= ground) {
                position.y = ground;
                b.vy = 0;
            }
        } else if (position.y < ground) {
            position.y = Math.min(ground, position.y + delta * 4);
        }
    },

    // One step along `heading`: on land up one block or down two, sliding into water when
    // `toWater`; in water anywhere wet, climbing out onto a low bank when `toLand`.
    beaverStep(mob, b, heading, distance, delta, { toWater = true, toLand = true } = {}) {
        const position = mob.position;
        const nx = position.x + Math.cos(heading) * distance;
        const nz = position.z + Math.sin(heading) * distance;
        if (b.inWater) {
            if (this.findWaterSurface(nx, position.y + 0.2, nz) !== null) {
                position.x = nx;
                position.z = nz;
                return true;
            }
            if (!toLand) return false;
            const surface = this.findWaterSurface(position.x, position.y + 0.2, position.z) ?? position.y;
            const floor = this.cameraController.getFloorY(nx, nz, surface + 1.6);
            if (floor <= -20 || floor - surface > 1.2 || this.findWaterSurface(nx, floor + 0.1, nz) !== null) return false;
            position.set(nx, floor, nz);
            b.inWater = false;
            this.world.addRipple(nx, nz, 0.3);
            return true;
        }
        const water = this.findWaterSurface(nx, position.y - 0.4, nz);
        if (water !== null) {
            if (!toWater) return false;
            position.set(nx, water - BEAVER_SWIM_DEPTH, nz);
            b.inWater = true;
            this.world.addRipple(nx, nz, 0.35);
            return true;
        }
        const floor = this.cameraController.getFloorY(nx, nz, position.y + 1.1);
        const rise = floor - position.y;
        if (floor <= -20 || rise > 1.01 || rise < -2.5) return false;
        position.x = nx;
        position.z = nz;
        if (rise > 0) position.y += Math.min(rise, Math.max(delta * 4, distance * 2));
        return true;
    },

    // Heads for `target` (x, z), turning round obstacles. Returns the distance left.
    beaverTravel(mob, b, target, speed, delta, options) {
        const position = mob.position;
        const left = Math.hypot(target.x - position.x, target.z - position.z);
        if (left < 0.05) return left;
        const heading = Math.atan2(target.z - position.z, target.x - position.x);
        const step = Math.min(left, speed * delta);
        for (const turn of [0, 0.7, -0.7, 1.4, -1.4]) {
            if (this.beaverStep(mob, b, heading + turn, step, delta, options)) {
                b.heading = heading + turn * 0.5;
                b.stuck = 0;
                return Math.hypot(target.x - position.x, target.z - position.z);
            }
        }
        b.stuck = (b.stuck || 0) + delta;
        b.heading = heading;
        return left;
    },

    // ---- Wandering and choosing work ---------------------------------------------------------

    beaverWander(mob, b, delta, surface) {
        const data = mob.userData;
        const position = mob.position;
        b.groom = Math.max(0, b.groom - delta);

        // Bait (and a cage's pull) first.
        const goal = this.getMobGoal(mob, delta);
        if (goal) {
            b.groom = 0;
            const left = Math.hypot(goal.x - position.x, goal.z - position.z);
            if (left <= (goal.stopDistance ?? 1)) return 0;
            const speed = b.inWater ? BEAVER_SWIM : BEAVER_WADDLE;
            this.beaverTravel(mob, b, goal, speed, delta);
            return speed;
        }

        b.scan -= delta;
        if (b.scan <= 0) {
            b.scan = 4 + Math.random() * 2;
            if (this.beaverChooseWork(mob, b)) return 0;
        }

        // Alternate between swims and time on the bank.
        b.swimTimer -= delta;
        if (b.swimTimer <= 0) {
            b.wantsWater = !b.wantsWater;
            b.swimTimer = b.wantsWater ? 20 + Math.random() * 25 : 15 + Math.random() * 25;
        }
        if (b.timer <= 0) {
            b.timer = 1.5 + Math.random() * 3;
            b.walking = Math.random() < (b.inWater ? 0.8 : 0.55);
            const home = data.home;
            if (b.wantsWater && !b.inWater && b.pond) {
                b.heading = Math.atan2(b.pond.z + 0.5 - position.z, b.pond.x + 0.5 - position.x) + (Math.random() - 0.5) * 0.5;
                b.walking = true;
            } else if (Math.hypot(home.x - position.x, home.z - position.z) > 8) {
                b.heading = Math.atan2(home.z - position.z, home.x - position.x);
            } else {
                b.heading += (Math.random() - 0.5) * 2.2;
            }
            if (!b.walking && !b.inWater && Math.random() < 0.4) b.groom = 2 + Math.random() * 2;
        }
        if (!b.walking || b.groom > 0) return 0;
        const speed = b.inWater ? BEAVER_SWIM * 0.6 : BEAVER_WADDLE;
        const options = { toWater: b.wantsWater || b.inWater, toLand: !b.wantsWater };
        if (!this.beaverStep(mob, b, b.heading, speed * delta, delta, options)) {
            b.heading += Math.PI * (0.5 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1);
            return 0;
        }
        return speed;
    },

    // Logs in its mouth: off to the building site. Otherwise maybe a tree, if there is a site
    // that needs wood.
    beaverChooseWork(mob, b) {
        if (b.placed >= BEAVER_MAX_PLACED) return false;
        if (!b.site || this.beaverNextCell(b.site) === null) {
            b.site = null;
            if (b.siteCooldown > performance.now() / 1000) return false;
            b.site = this.beaverPickSite(mob, b);
            // Searching for a site is the costly part: not again for a while.
            if (!b.site) b.siteCooldown = performance.now() / 1000 + 20;
        }
        if (!b.site) return false;
        const next = this.beaverNextCell(b.site);
        if (next === null) return false;
        if (b.logs > 0 || next.type === 'dirt') {
            b.mode = 'toSite';
            b.travel = 0;
            return true;
        }
        if (b.treeCooldown > 0) return false;
        const now = performance.now() / 1000;
        if (this.beaverLastFell && now - this.beaverLastFell < BEAVER_FELL_GAP) return false;
        const tree = this.beaverFindTree(mob, b);
        if (!tree) {
            b.treeCooldown = 20;
            return false;
        }
        b.tree = tree;
        this.beaverClaims = this.beaverClaims || new Set();
        this.beaverClaims.add(tree.key);
        b.stand = tree.stands.reduce((best, stand) => (!best || Math.hypot(stand.x - mob.position.x, stand.z - mob.position.z) < Math.hypot(best.x - mob.position.x, best.z - mob.position.z) ? stand : best), null);
        b.mode = 'toTree';
        b.travel = 0;
        return true;
    },

    beaverReleaseTree(b) {
        if (b.tree && this.beaverClaims) this.beaverClaims.delete(b.tree.key);
        b.tree = null;
        b.stand = null;
    },

    // Gives up the current job and waits `cooldown` seconds before the next tree.
    beaverAbandon(b, cooldown) {
        this.beaverReleaseTree(b);
        b.mode = 'wander';
        b.timer = 0.5;
        b.treeCooldown = Math.max(b.treeCooldown, cooldown);
    },

    // Nearest water surface block within `radius`, searching outwards.
    beaverFindWater(position, radius) {
        const bx = Math.floor(position.x);
        const by = Math.floor(position.y);
        const bz = Math.floor(position.z);
        for (let r = 1; r <= radius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    for (const dy of [-1, 0, -2, 1]) {
                        const y = by + dy;
                        if (this.world.getBlockTypeAt(bx + dx, y, bz + dz) === 'water' && this.world.getBlockTypeAt(bx + dx, y + 1, bz + dz) !== 'water') {
                            return { x: bx + dx, y, z: bz + dz };
                        }
                    }
                }
            }
        }
        return null;
    },

    // True when every block in the box is natural terrain and no loose wood in it lies next to
    // other wood sideways (log walls), except in the column `skipX, skipZ` (the tree itself).
    beaverAreaIsWild(x0, y0, z0, x1, y1, z1, skipX = null, skipZ = null) {
        const world = this.world;
        for (let x = x0; x <= x1; x++) {
            for (let z = z0; z <= z1; z++) {
                for (let y = y0; y <= y1; y++) {
                    const type = world.getBlockTypeAt(x, y, z);
                    if (type === null) continue;
                    if (!beaverIsNatural(type)) return false;
                    if (!beaverIsWood(type) || (x === skipX && z === skipZ)) continue;
                    if (BEAVER_HORIZONTAL.some(([dx, dz]) => !(x + dx === skipX && z + dz === skipZ) && beaverIsWood(world.getBlockTypeAt(x + dx, y, z + dz)))) return false;
                }
            }
        }
        return true;
    },

    // ---- Trees ------------------------------------------------------------------------------

    beaverFindTree(mob, b) {
        if (!b.pond) return null;
        const bx = Math.floor(mob.position.x);
        const by = Math.floor(mob.position.y);
        const bz = Math.floor(mob.position.z);
        const claims = this.beaverClaims || new Set();
        let best = null;
        let bestDistance = Infinity;
        for (let dx = -BEAVER_TREE_SEARCH; dx <= BEAVER_TREE_SEARCH; dx++) {
            for (let dz = -BEAVER_TREE_SEARCH; dz <= BEAVER_TREE_SEARCH; dz++) {
                const distance = Math.hypot(dx, dz);
                if (distance >= bestDistance) continue;
                const x = bx + dx;
                const z = bz + dz;
                if (Math.hypot(x - b.pond.x, z - b.pond.z) > BEAVER_WATER_RANGE) continue;
                for (let y = by - 3; y <= by + 3; y++) {
                    const type = this.world.getBlockTypeAt(x, y, z);
                    if (!beaverIsWood(type)) continue;
                    const below = this.world.getBlockTypeAt(x, y - 1, z);
                    if (below !== 'grass' && below !== 'dirt') continue;
                    if (claims.has(`${x},${y},${z}`)) break;
                    const tree = this.beaverInspectTree(x, y, z, type);
                    if (tree) {
                        best = tree;
                        bestDistance = distance;
                    }
                    break;
                }
            }
        }
        return best;
    },

    // A small, lone tree rooted at (x, y, z), away from anything built, or null.
    beaverInspectTree(x, y, z, type) {
        const world = this.world;
        let height = 0;
        while (height <= BEAVER_MAX_TRUNK && world.getBlockTypeAt(x, y + height, z) === type) height++;
        if (height < 2 || height > BEAVER_MAX_TRUNK) return null;
        const top = y + height - 1;
        // A crown of leaves over the trunk: a lone log stump is not a tree.
        let leaves = 0;
        for (let ly = top - 1; ly <= top + 2; ly++) {
            for (let lx = -1; lx <= 1; lx++) {
                for (let lz = -1; lz <= 1; lz++) {
                    if (beaverIsLeaves(world.getBlockTypeAt(x + lx, ly, z + lz))) leaves++;
                }
            }
        }
        if (leaves < 3) return null;
        // Nothing wooden right next to the trunk (big trees, branches, buildings).
        for (let ty = y; ty <= top; ty++) {
            for (let lx = -1; lx <= 1; lx++) {
                for (let lz = -1; lz <= 1; lz++) {
                    if ((lx || lz) && beaverIsWood(world.getBlockTypeAt(x + lx, ty, z + lz))) return null;
                }
            }
        }
        const guard = BEAVER_BUILD_GUARD;
        if (!this.beaverAreaIsWild(x - guard, y - 1, z - guard, x + guard, top + guard, z + guard, x, z)) return null;
        const stands = [];
        BEAVER_HORIZONTAL.forEach(([dx, dz]) => {
            const sx = x + dx;
            const sz = z + dz;
            if (world.hasSolidBlock(sx, y, sz) || !world.hasSolidBlock(sx, y - 1, sz) || world.getBlockTypeAt(sx, y, sz) === 'water') return;
            stands.push({ x: sx + 0.5 - dx * 0.15, y, z: sz + 0.5 - dz * 0.15 });
        });
        if (stands.length === 0) return null;
        return { key: `${x},${y},${z}`, x, y, z, type, height, top, stands };
    },

    beaverTreeStillThere(tree) {
        for (let ty = tree.y; ty <= tree.top; ty++) {
            if (this.world.getBlockTypeAt(tree.x, ty, tree.z) !== tree.type) return false;
        }
        return this.world.getBlockTypeAt(tree.x, tree.top + 1, tree.z) !== tree.type;
    },

    beaverGoToTree(mob, b, delta) {
        b.travel += delta;
        const tree = b.tree;
        if (!tree || !b.stand || b.travel > 30 || (b.stuck || 0) > 3 || (b.travel % 4 < delta && !this.beaverTreeStillThere(tree))) {
            this.beaverAbandon(b, 40);
            return 0;
        }
        const speed = b.inWater ? BEAVER_SWIM : BEAVER_WADDLE * 1.2;
        const left = this.beaverTravel(mob, b, b.stand, speed, delta);
        if (left < 0.3 && !b.inWater) {
            b.mode = 'gnaw';
            b.timer = BEAVER_GNAW_TIME;
            b.chipTimer = 0;
            b.chewTimer = 0;
        }
        return speed;
    },

    beaverGnaw(mob, b, delta, loudness) {
        const tree = b.tree;
        if (!tree) {
            this.beaverAbandon(b, 20);
            return;
        }
        const position = mob.position;
        b.heading = Math.atan2(tree.z + 0.5 - position.z, tree.x + 0.5 - position.x);
        // Chips fly from the bite, low on the trunk.
        b.chipTimer -= delta;
        if (b.chipTimer <= 0) {
            b.chipTimer = 0.1 + Math.random() * 0.12;
            const toBeaver = Math.atan2(position.z - (tree.z + 0.5), position.x - (tree.x + 0.5));
            const color = Math.random() < 0.65 ? 0xe2c28c : (this.world.blockTypes[tree.type] || {}).color || 0x7a5a32;
            this.beaverChips(tree.x + 0.5 + Math.cos(toBeaver) * 0.42, tree.y + 0.25 + Math.random() * 0.2, tree.z + 0.5 + Math.sin(toBeaver) * 0.42, toBeaver, 1 + Math.floor(Math.random() * 2), color);
        }
        b.chewTimer -= delta;
        if (b.chewTimer <= 0 && loudness > 0) {
            b.chewTimer = 0.08 + Math.random() * 0.1;
            this.playNoiseBurst({ duration: 0.03 + Math.random() * 0.03, volume: 0.016 * loudness, highpass: 1800 + Math.random() * 1500, lowpass: 7000 });
        }
        if (b.timer > 0) return;
        if (!this.beaverTreeStillThere(tree) || !this.beaverAreaIsWild(tree.x - BEAVER_BUILD_GUARD, tree.y - 1, tree.z - BEAVER_BUILD_GUARD, tree.x + BEAVER_BUILD_GUARD, tree.top + BEAVER_BUILD_GUARD, tree.z + BEAVER_BUILD_GUARD, tree.x, tree.z)) {
            this.beaverAbandon(b, 30);
            return;
        }
        this.beaverFell(tree, Math.atan2(tree.z + 0.5 - position.z, tree.x + 0.5 - position.x));
        b.logs = Math.min(tree.height, BEAVER_MAX_LOGS);
        b.logType = tree.type;
        this.beaverReleaseTree(b);
        b.treeCooldown = BEAVER_TREE_COOLDOWN + Math.random() * 60;
        b.mode = 'wander';
        b.timer = 1.5;
        b.walking = false;
        b.scan = 2;
    },

    // Breaks the trunk (normal multiplayer path), shows it toppling away from the beaver and
    // queues the leaves that are left without a tree.
    beaverFell(tree, heading) {
        for (let ty = tree.top; ty >= tree.y; ty--) this.beaverRemoveBlock(tree.x, ty, tree.z, tree.type);
        this.beaverLastFell = performance.now() / 1000;

        const color = (this.world.blockTypes[tree.type] || {}).color || 0x7a5a32;
        const geometry = new THREE.BoxGeometry(0.62, tree.height, 0.62);
        geometry.translate(0, tree.height / 2, 0);
        const bark = new THREE.MeshLambertMaterial({ color, transparent: true });
        const rings = new THREE.MeshLambertMaterial({ color: 0xd8b98a, transparent: true });
        const log = new THREE.Mesh(geometry, [bark, bark, rings, rings, bark, bark]);
        const pivot = new THREE.Group();
        pivot.position.set(tree.x + 0.5, tree.y, tree.z + 0.5);
        pivot.rotation.y = -heading;
        pivot.add(log);
        this.scene.add(pivot);
        this.beaverFalling = this.beaverFalling || [];
        this.beaverFalling.push({ pivot, log, angle: 0, speed: 0.15, age: 0, landed: false, tree });

        const distance = Math.hypot(tree.x + 0.5 - this.camera.position.x, tree.z + 0.5 - this.camera.position.z);
        const volume = Math.max(0, 1 - distance / 40);
        if (volume > 0) {
            // The last fibres crack and the trunk creaks over.
            this.playNoiseBurst({ duration: 0.12, volume: 0.05 * volume, highpass: 900, lowpass: 5000 });
            this.playTone({ frequency: 150, endFrequency: 85, duration: 0.9, type: 'sawtooth', volume: 0.012 * volume, attack: 0.05, release: 0.3 });
        }

        // Leaves of this tree's kind around its crown, outermost and highest first.
        const leafType = beaverLeavesFor(tree.type);
        const leaves = [];
        for (let lx = -3; lx <= 3; lx++) {
            for (let lz = -3; lz <= 3; lz++) {
                for (let ly = tree.y + 1; ly <= tree.top + 3; ly++) {
                    if (this.world.getBlockTypeAt(tree.x + lx, ly, tree.z + lz) === leafType) leaves.push({ x: tree.x + lx, y: ly, z: tree.z + lz, type: leafType, order: ly * 10 + Math.hypot(lx, lz) + Math.random() });
                }
            }
        }
        leaves.sort((a, c) => c.order - a.order);
        this.beaverLeafQueue = (this.beaverLeafQueue || []).concat(leaves.slice(0, BEAVER_MAX_LEAVES).map((leaf) => ({ ...leaf, delay: 1.4 })));
    },

    // Removes a block through the normal path, only if it still is `type`.
    beaverRemoveBlock(x, y, z, type) {
        if (this.world.getBlockTypeAt(x, y, z) !== type) return false;
        // It works for whoever tamed it, so never in someone else's plot: removeBlockForAll sees to that.
        return this.removeBlockForAll(x, y, z);
    },

    // A leaf still held up by some other trunk nearby stays; so does one that may be, next to a
    // chunk that is not loaded (it reads as air, and a block broken here is broken for everyone).
    beaverLeafHeld(leaf) {
        for (let dx = -3; dx <= 3; dx++) {
            for (let dz = -3; dz <= 3; dz++) {
                if (!this.world.getColumnAt(leaf.x + dx, leaf.z + dz)) return true;
                for (let dy = -5; dy <= 1; dy++) {
                    if (beaverIsWood(this.world.getBlockTypeAt(leaf.x + dx, leaf.y + dy, leaf.z + dz))) return true;
                }
            }
        }
        return false;
    },

    // ---- Building ---------------------------------------------------------------------------

    beaverLoadSites() {
        if (this.beaverSites) return this.beaverSites;
        this.beaverSites = [];
        try {
            const saved = JSON.parse(window.localStorage.getItem(BEAVER_STORAGE_KEY) || '[]');
            if (Array.isArray(saved)) this.beaverSites = saved.filter((site) => site && Array.isArray(site.cells) && site.center);
        } catch (error) {
            this.beaverSites = [];
        }
        return this.beaverSites;
    },

    beaverSaveSites() {
        try {
            window.localStorage.setItem(BEAVER_STORAGE_KEY, JSON.stringify(this.beaverSites.slice(-BEAVER_MAX_SITES)));
        } catch (error) {
            // Storage full or blocked: sites are only remembered for this session.
        }
    },

    // The next block of the plan still to place, or null when it is finished. Cells whose
    // spot no longer holds what the plan expects (someone built or dug there) are skipped. A cell
    // whose chunk is not loaded reads as air, which says nothing: it stays in the plan for later.
    beaverNextCell(site) {
        for (const cell of site.cells) {
            if (cell.done || !this.world.getColumnAt(cell.x, cell.z)) continue;
            if (this.world.getBlockTypeAt(cell.x, cell.y, cell.z) !== cell.expect) {
                cell.done = true;
                continue;
            }
            return cell;
        }
        return null;
    },

    // A known site nearby (shared by the family), or a new one: a dam across a narrow stretch
    // of shallow water with a lodge upstream, or on a lake shore just the lodge.
    beaverPickSite(mob, b) {
        const sites = this.beaverLoadSites();
        const position = mob.position;
        const known = sites.find((site) => Math.hypot(site.center.x - position.x, site.center.z - position.z) < BEAVER_SITE_SEARCH + 4);
        if (known) {
            b.lodgeSite = known;
            mob.userData.home.set(known.center.x + 0.5, mob.userData.home.y, known.center.z + 0.5);
            return this.beaverNextCell(known) ? known : null;
        }
        if (!b.pond) return null;
        const site = this.beaverFindDamSite(position, b.pond.y) || this.beaverFindLodgeSite(position, b.pond.y);
        if (!site) return null;
        sites.push(site);
        this.beaverSaveSites();
        b.lodgeSite = site;
        mob.userData.home.set(site.center.x + 0.5, mob.userData.home.y, site.center.z + 0.5);
        return site;
    },

    // Shallow water: a water block with air above and solid ground right below.
    beaverShallow(x, y, z) {
        const world = this.world;
        return world.getBlockTypeAt(x, y, z) === 'water' && world.getBlockTypeAt(x, y + 1, z) === null
            && world.hasSolidBlock(x, y - 1, z) && world.getBlockTypeAt(x, y - 1, z) !== 'water';
    },

    beaverFindDamSite(position, waterY) {
        const bx = Math.floor(position.x);
        const bz = Math.floor(position.z);
        const world = this.world;
        let best = null;
        let bestDistance = Infinity;
        for (let dx = -BEAVER_SITE_SEARCH; dx <= BEAVER_SITE_SEARCH; dx++) {
            for (let dz = -BEAVER_SITE_SEARCH; dz <= BEAVER_SITE_SEARCH; dz++) {
                const distance = Math.hypot(dx, dz);
                if (distance >= bestDistance || distance > BEAVER_SITE_SEARCH) continue;
                const x = bx + dx;
                const z = bz + dz;
                if (!this.beaverShallow(x, waterY, z)) continue;
                for (const [ax, az] of [[1, 0], [0, 1]]) {
                    // The stream runs along (ax, az); the dam goes across it.
                    const px = az;
                    const pz = ax;
                    if (world.getBlockTypeAt(x + ax, waterY, z + az) !== 'water' || world.getBlockTypeAt(x - ax, waterY, z - az) !== 'water') continue;
                    let low = 0;
                    while (low < 3 && this.beaverShallow(x - px * (low + 1), waterY, z - pz * (low + 1))) low++;
                    let high = 0;
                    while (high < 3 && this.beaverShallow(x + px * (high + 1), waterY, z + pz * (high + 1))) high++;
                    const width = low + high + 1;
                    if (width > 3) continue;
                    const endA = [x - px * (low + 1), z - pz * (low + 1)];
                    const endB = [x + px * (high + 1), z + pz * (high + 1)];
                    if (!world.hasSolidBlock(endA[0], waterY, endA[1]) || !world.hasSolidBlock(endB[0], waterY, endB[1])) continue;
                    const strip = [];
                    for (let i = -low; i <= high; i++) strip.push([x + px * i, z + pz * i]);
                    const guard = BEAVER_BUILD_GUARD;
                    const minX = Math.min(endA[0], endB[0]) - guard;
                    const maxX = Math.max(endA[0], endB[0]) + guard;
                    const minZ = Math.min(endA[1], endB[1]) - guard;
                    const maxZ = Math.max(endA[1], endB[1]) + guard;
                    if (!this.beaverAreaIsWild(minX, waterY - 1, minZ, maxX, waterY + 3, maxZ)) continue;
                    if (this.beaverSiteTaken(x, z)) continue;
                    const cells = [];
                    strip.forEach(([sx, sz]) => {
                        cells.push({ x: sx, y: waterY, z: sz, type: 'wood', expect: 'water' });
                        cells.push({ x: sx, y: waterY + 1, z: sz, type: 'dirt', expect: null });
                    });
                    // The lodge a little way upstream or downstream, whichever side has room.
                    let lodge = null;
                    for (const along of [2, -2, 3, -3]) {
                        lodge = this.beaverLodgeCells(x + ax * along, waterY, z + az * along, false);
                        if (lodge) break;
                    }
                    if (lodge) cells.push(...lodge.cells);
                    best = { center: { x, y: waterY, z }, kind: lodge ? 'dam+lodge' : 'dam', lodge: lodge ? lodge.center : null, cells: cells.slice(0, BEAVER_MAX_PLACED) };
                    bestDistance = distance;
                    break;
                }
            }
        }
        return best;
    },

    // A lodge on a lake shore: a water cell beside the bank.
    beaverFindLodgeSite(position, waterY) {
        const bx = Math.floor(position.x);
        const bz = Math.floor(position.z);
        for (let r = 1; r <= 8; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const x = bx + dx;
                    const z = bz + dz;
                    if (this.beaverSiteTaken(x, z)) continue;
                    const lodge = this.beaverLodgeCells(x, waterY, z, true);
                    if (!lodge) continue;
                    const guard = BEAVER_BUILD_GUARD;
                    if (!this.beaverAreaIsWild(x - 1 - guard, waterY - 1, z - 1 - guard, x + 1 + guard, waterY + 3, z + 1 + guard)) continue;
                    return { center: { x, y: waterY, z }, kind: 'lodge', lodge: lodge.center, cells: lodge.cells };
                }
            }
        }
        return null;
    },

    // Walls around a water cell one block above the water (so the way in is underwater) and a
    // roof over it, or null when there is no room. `onBank`: needs ground on one side.
    beaverLodgeCells(x, y, z, onBank) {
        const world = this.world;
        if (world.getBlockTypeAt(x, y, z) !== 'water' || world.getBlockTypeAt(x, y + 1, z) !== null || world.getBlockTypeAt(x, y + 2, z) !== null) return null;
        const cells = [];
        let wet = 0;
        let bank = 0;
        for (const [dx, dz] of BEAVER_HORIZONTAL) {
            const below = world.getBlockTypeAt(x + dx, y, z + dz);
            const wall = world.getBlockTypeAt(x + dx, y + 1, z + dz);
            if (below === 'water') wet++;
            else if (world.hasSolidBlock(x + dx, y, z + dz)) bank++;
            else return null;
            // Air or a tuft of grass becomes a wall; a solid bank already is one.
            if (wall === 'water') return null;
            if (!world.hasSolidBlock(x + dx, y + 1, z + dz)) cells.push({ x: x + dx, y: y + 1, z: z + dz, type: 'wood', expect: wall });
        }
        if (wet === 0 || cells.length < 2 || (onBank && bank === 0)) return null;
        cells.push({ x, y: y + 2, z, type: 'dirt', expect: null });
        return { center: { x, y, z }, cells };
    },

    beaverSiteTaken(x, z) {
        return this.beaverLoadSites().some((site) => Math.hypot(site.center.x - x, site.center.z - z) < BEAVER_SITE_SPACING);
    },

    beaverGoToSite(mob, b, delta) {
        b.travel += delta;
        const cell = b.site ? this.beaverNextCell(b.site) : null;
        if (!cell || b.travel > 40 || (b.stuck || 0) > 4) {
            b.mode = 'wander';
            b.timer = 0.5;
            b.scan = cell ? 15 : 3;
            return 0;
        }
        const target = { x: cell.x + 0.5, z: cell.z + 0.5 };
        const speed = b.inWater ? BEAVER_SWIM : BEAVER_WADDLE * 1.2;
        const left = this.beaverTravel(mob, b, target, speed, delta);
        if (left < 2.2) {
            b.mode = 'build';
            b.timer = 0.9;
        }
        return speed;
    },

    // Places the plan one block at a time while it has logs (mud needs none).
    beaverBuild(mob, b, delta, player) {
        const cell = b.site ? this.beaverNextCell(b.site) : null;
        if (!cell || b.placed >= BEAVER_MAX_PLACED || (cell.type !== 'dirt' && b.logs <= 0)) {
            b.mode = 'wander';
            b.timer = 1;
            b.scan = 3;
            return;
        }
        const position = mob.position;
        b.heading = Math.atan2(cell.z + 0.5 - position.z, cell.x + 0.5 - position.x);
        if (Math.hypot(cell.x + 0.5 - position.x, cell.z + 0.5 - position.z) > 2.6) {
            b.mode = 'toSite';
            b.travel = 0;
            return;
        }
        if (b.timer > 0) return;
        b.timer = 1.3 + Math.random() * 0.4;
        // Never into anybody standing there.
        const feetY = player.y - this.cameraController.eyeHeight;
        if (Math.abs(player.x - (cell.x + 0.5)) < 0.85 && Math.abs(player.z - (cell.z + 0.5)) < 0.85 && feetY < cell.y + 1 && feetY + 1.8 > cell.y) return;
        if (Math.abs(position.x - (cell.x + 0.5)) < 0.7 && Math.abs(position.z - (cell.z + 0.5)) < 0.7 && position.y < cell.y + 1 && position.y + 0.5 > cell.y) {
            // Standing in the spot itself: step back first.
            this.beaverStep(mob, b, b.heading + Math.PI, 0.6, delta);
            return;
        }
        const type = cell.type === 'wood' ? b.logType || 'wood' : cell.type;
        const payload = { x: cell.x, y: cell.y, z: cell.z, blockType: type };
        cell.done = true;
        if (!this.placeBlockForAll(payload)) return;
        this.beaverSaveSites();
        b.placed++;
        b.push = 0.4;
        if (cell.type !== 'dirt') b.logs--;
        const distance = Math.hypot(cell.x + 0.5 - this.camera.position.x, cell.z + 0.5 - this.camera.position.z);
        if (distance < 24) this.playPlaceSound(type);
        if (cell.expect === 'water') {
            this.world.addRipple(cell.x + 0.5, cell.z + 0.5, 0.5);
            if (distance < 24) this.playNoiseBurst({ duration: 0.15, volume: 0.015 * (1 - distance / 24), highpass: 400, lowpass: 2400 });
        }
    },

    // ---- Alarm, fleeing and diving -----------------------------------------------------------

    // `slapper`: this one saw the danger and warns the rest.
    beaverAlarm(mob, player, slapper) {
        const b = mob.userData.beaver || this.beaverState(mob);
        if (b.mode === 'gnaw' || b.mode === 'toTree') this.beaverAbandon(b, 30);
        b.groom = 0;
        if (b.inWater) {
            if (slapper && b.slapCooldown <= 0) this.beaverSlap(mob, b);
            this.beaverStartDive(mob, b, player);
        } else {
            b.mode = 'flee';
            b.timer = 10;
            b.travel = 0;
            b.slapPending = slapper;
        }
        if (!slapper) return;
        for (const other of this.ambientMobs) {
            if (other === mob || other.userData.species !== 'beaver' || other.userData.trapsCage) continue;
            const ob = other.userData.beaver;
            if (!ob || ob.mode === 'flee' || ob.mode === 'dive') continue;
            if (other.position.distanceTo(mob.position) > BEAVER_ALARM_RANGE) continue;
            this.beaverAlarm(other, player, false);
        }
    },

    // The tail comes down flat on the water: a loud crack and a fountain of spray.
    beaverSlap(mob, b) {
        b.slap = 0.6;
        b.slapCooldown = 10;
        const position = mob.position;
        const surface = this.findWaterSurface(position.x, position.y + 0.2, position.z) ?? position.y + BEAVER_SWIM_DEPTH;
        const behind = b.facing + Math.PI;
        const x = position.x + Math.cos(behind) * 0.55;
        const z = position.z + Math.sin(behind) * 0.55;
        setTimeout(() => {
            if (!mob.parent) return;
            this.spawnSplash(x, surface, z, 0.6);
            this.world.addRipple(x, z, 1.3);
            const distance = Math.hypot(x - this.camera.position.x, z - this.camera.position.z);
            const volume = Math.max(0.15, 1 - distance / 40);
            this.playNoiseBurst({ duration: 0.22, volume: 0.07 * volume, highpass: 250, lowpass: 3200 });
            this.playTone({ frequency: 110, endFrequency: 55, duration: 0.14, type: 'sine', volume: 0.06 * volume, attack: 0.002, release: 0.12 });
        }, 230);
    },

    beaverStartDive(mob, b, player) {
        b.mode = 'dive';
        b.timer = 10 + Math.random() * 6;
        b.inLodge = false;
        b.target = null;
        const site = b.lodgeSite || b.site;
        const lodge = site && site.lodge;
        if (lodge && this.beaverLodgeReady(site) && Math.hypot(lodge.x + 0.5 - mob.position.x, lodge.z + 0.5 - mob.position.z) < 20) {
            b.target = { x: lodge.x + 0.5, z: lodge.z + 0.5, lodge: true };
            return;
        }
        // Somewhere under the water, away from the player.
        const away = Math.atan2(mob.position.z - player.z, mob.position.x - player.x);
        for (let attempt = 0; attempt < 10; attempt++) {
            const angle = away + (Math.random() - 0.5) * 1.6;
            const distance = 3 + Math.random() * 5;
            const x = mob.position.x + Math.cos(angle) * distance;
            const z = mob.position.z + Math.sin(angle) * distance;
            if (this.findWaterSurface(x, mob.position.y + 0.2, z) !== null) {
                b.target = { x, z, lodge: false };
                return;
            }
        }
    },

    // Walls and roof standing: the lodge can hide a beaver.
    beaverLodgeReady(site) {
        const lodge = site.lodge;
        if (!lodge) return false;
        const roof = this.world.getBlockTypeAt(lodge.x, lodge.y + 2, lodge.z);
        const walls = BEAVER_HORIZONTAL.filter(([dx, dz]) => this.world.hasSolidBlock(lodge.x + dx, lodge.y + 1, lodge.z + dz)).length;
        return roof !== null && walls === 4 && this.world.getBlockTypeAt(lodge.x, lodge.y, lodge.z) === 'water';
    },

    // On land: waddle as fast as it can to the water, then slap and dive.
    beaverFlee(mob, b, delta, player) {
        b.travel += delta;
        if (b.inWater) {
            if (b.slapPending && b.slapCooldown <= 0) this.beaverSlap(mob, b);
            b.slapPending = false;
            this.beaverStartDive(mob, b, player);
            return BEAVER_SWIM;
        }
        if (b.timer <= 0) {
            b.mode = 'wander';
            b.timer = 0.5;
            return 0;
        }
        if (b.pond) {
            const target = { x: b.pond.x + 0.5, z: b.pond.z + 0.5 };
            this.beaverTravel(mob, b, target, BEAVER_RUN, delta, { toWater: true });
        } else {
            const away = Math.atan2(mob.position.z - player.z, mob.position.x - player.x);
            if (!this.beaverStep(mob, b, away, BEAVER_RUN * delta, delta)) this.beaverStep(mob, b, away + 1.2, BEAVER_RUN * delta, delta);
            b.heading = away;
        }
        return BEAVER_RUN;
    },

    beaverDive(mob, b, delta, player, near) {
        if (!b.inWater) {
            b.mode = 'flee';
            b.timer = 6;
            return 0;
        }
        if (near) b.timer = Math.max(b.timer, 4);
        let speed = 0;
        if (b.target) {
            const left = this.beaverTravel(mob, b, b.target, BEAVER_DIVE_SPEED, delta, { toLand: false });
            speed = BEAVER_DIVE_SPEED;
            if (left < 0.35) {
                if (b.target.lodge) {
                    b.inLodge = true;
                    b.timer = Math.max(b.timer, 8 + Math.random() * 10);
                }
                b.target = null;
            }
        }
        if (Math.random() < delta * 1.5) this.world.addRipple(mob.position.x, mob.position.z, 0.12);
        if (b.timer <= 0) {
            b.mode = 'wander';
            b.timer = 0.5;
            b.inLodge = false;
            b.wantsWater = true;
            b.swimTimer = 10 + Math.random() * 10;
        }
        return speed;
    },

    beaverStruck(mob) {
        const b = mob.userData.beaver || this.beaverState(mob);
        const tone = getMobSpecies('beaver').tone;
        if (this.damageMobByPlayer(mob)) {
            if (b.inWater) this.spawnSplash(mob.position.x, mob.position.y + BEAVER_SWIM_DEPTH, mob.position.z, 0.4);
            this.playTone({ frequency: tone * 1.6, endFrequency: tone * 0.8, duration: 0.25, type: 'triangle', volume: 0.02, release: 0.12 });
            this.defeatMobByPlayer(mob, 'You defeated the beaver');
            return;
        }
        b.flinch = 0.35;
        // A hissing grumble.
        this.playNoiseBurst({ duration: 0.18, volume: 0.022, highpass: 1500, lowpass: 5200 });
        this.playTone({ frequency: tone * 1.9, endFrequency: tone * 1.2, duration: 0.14, type: 'sawtooth', volume: 0.012, release: 0.08 });
        const player = this.getLocalPlayerPosition();
        if (b.mode === 'flee' || b.mode === 'dive') {
            b.timer = Math.max(b.timer, 6);
            return;
        }
        this.beaverAlarm(mob, player, true);
    },

    // ---- Sounds and animation ----------------------------------------------------------------

    beaverSounds(mob, b, delta, speed, loudness) {
        if (loudness <= 0) return;
        // Soft paddling ripples and splashes while swimming at the surface.
        if (b.inWater && speed > 0 && b.depth < 0.5) {
            b.ripple -= delta;
            if (b.ripple <= 0) {
                b.ripple = 0.45;
                this.world.addRipple(mob.position.x, mob.position.z, 0.18);
                if (loudness > 0.5) this.playNoiseBurst({ duration: 0.05, volume: 0.004 * loudness, highpass: 600, lowpass: 2000 });
            }
        }
        // Now and then a quiet, whiny chatter (kits and parents keep in touch).
        b.chatter -= delta;
        if (b.chatter <= 0) {
            b.chatter = 8 + Math.random() * 14;
            if (b.mode === 'wander' && loudness > 0.4 && b.depth < 0.5) {
                const tone = getMobSpecies('beaver').tone;
                this.playTone({ frequency: tone * 2.6, endFrequency: tone * 2.1, duration: 0.16, type: 'triangle', volume: 0.008 * loudness, release: 0.08 });
                setTimeout(() => this.playTone({ frequency: tone * 2.9, endFrequency: tone * 2.3, duration: 0.12, type: 'triangle', volume: 0.006 * loudness, release: 0.06 }), 180);
            }
        }
    },

    beaverAnimate(mob, delta, speed, surface) {
        const data = mob.userData;
        const b = data.beaver;
        const parts = data.modelParts || {};
        const follow = Math.min(1, delta * 10);
        b.gait += ((speed > 0 ? 1 : 0) - b.gait) * Math.min(1, delta * 8);
        b.slap = Math.max(0, b.slap - delta);
        data.stepPhase += delta * (b.inWater ? 5 + speed * 2 : speed * 9);
        const phase = data.stepPhase;
        const gnawing = b.mode === 'gnaw';

        // Nose down while diving, a slight nose-up while swimming at the surface.
        const pitch = b.inWater ? b.depth * 0.35 - 0.08 : 0;
        mob.rotation.x += (pitch - mob.rotation.x) * Math.min(1, delta * 5);
        if (data.modelRoot) {
            const root = data.modelRoot;
            root.rotation.z = b.inWater ? Math.sin(phase * 0.5) * 0.03 : Math.sin(phase) * 0.1 * b.gait;
            root.rotation.x += ((gnawing ? -0.12 : 0) - root.rotation.x) * follow;
            root.position.y = b.inWater ? 0 : Math.abs(Math.sin(phase)) * 0.02 * b.gait + (b.flinch > 0 ? 0.05 : 0);
        }

        // Head: gnawing chatters fast with a twist; placing a block nods it down.
        const head = parts.head;
        if (head) {
            const base = head.userData.baseRotation;
            b.lookTimer -= delta;
            if (b.lookTimer <= 0) {
                b.lookTimer = 1 + Math.random() * 3;
                b.lookYaw = (Math.random() - 0.5) * 0.8;
            }
            let x = base.x;
            let y = base.y + (b.mode === 'wander' ? b.lookYaw : 0);
            let z = base.z;
            if (gnawing) {
                x += 0.3 + Math.sin(data.life * 30) * 0.12;
                y += Math.sin(data.life * 2.5) * 0.35;
                z += Math.sin(data.life * 2.5) * 0.25;
            } else if (b.push > 0) {
                x += Math.sin((b.push / 0.4) * Math.PI) * 0.5;
            } else if (b.groom > 0) {
                x += 0.45 + Math.sin(data.life * 9) * 0.1;
            } else if (b.inWater) {
                x -= 0.15;
            }
            head.rotation.x += (x - head.rotation.x) * follow;
            head.rotation.y += (y - head.rotation.y) * follow;
            head.rotation.z += (z - head.rotation.z) * follow;
        }
        ['earL', 'earR'].forEach((name, index) => {
            const ear = parts[name];
            if (ear) ear.rotation.z = ear.userData.baseRotation.z + Math.max(0, Math.sin(data.life * 1.3 + index * 2) - 0.9) * 4 * (index ? -1 : 1);
        });

        // Tail: drags on land, sculls in the water; the alarm slap lifts it and brings it down.
        const tail = parts.tail;
        if (tail) {
            const base = tail.userData.baseRotation;
            let x = base.x + (b.inWater ? 0.2 + Math.sin(phase * 0.8) * 0.18 : Math.sin(phase) * 0.05 * b.gait);
            if (b.slap > 0) {
                const t = 1 - b.slap / 0.6;
                x = t < 0.45 ? base.x + 1.3 * (t / 0.45) : base.x + 1.3 - 1.9 * Math.min(1, (t - 0.45) / 0.1);
            }
            tail.rotation.x += (x - tail.rotation.x) * Math.min(1, delta * (b.slap > 0 ? 30 : 8));
        }

        // Legs: a waddle on land; in the water the webbed hind feet kick and the front paws
        // fold against the chest. Grooming paws rub the face.
        ['legFL', 'legFR', 'legBL', 'legBR'].forEach((name, index) => {
            const leg = parts[name];
            if (!leg) return;
            const base = leg.userData.baseRotation;
            const front = index < 2;
            const side = index % 2 === 0 ? 1 : -1;
            let x;
            if (b.inWater) {
                x = front ? base.x - 0.9 : base.x + Math.sin(phase + (side > 0 ? 0 : Math.PI)) * 0.9 - 0.4;
            } else if (front && (b.groom > 0 || gnawing)) {
                x = base.x - 1 + Math.sin(data.life * 10 + side) * 0.3;
            } else {
                x = base.x + Math.sin(phase + (front ? 0 : Math.PI) + (side > 0 ? 0 : Math.PI)) * 0.6 * b.gait;
            }
            leg.rotation.x += (x - leg.rotation.x) * Math.min(1, delta * 14);
        });

        this.beaverShowLog(mob, b, parts);
    },

    // The log in its mouth, held crosswise, while it carries any.
    beaverShowLog(mob, b, parts) {
        const head = parts.head;
        if (!head) return;
        if (b.logs > 0 && (!b.logMesh || b.logMesh.parent !== head || b.logMesh.userData.type !== b.logType)) {
            if (b.logMesh) {
                if (b.logMesh.parent) b.logMesh.parent.remove(b.logMesh);
                b.logMesh.material.forEach((material) => material.dispose());
            }
            if (!this.beaverLogGeometry) this.beaverLogGeometry = new THREE.BoxGeometry(0.62, 0.1, 0.1);
            const bark = new THREE.MeshLambertMaterial({ color: (this.world.blockTypes[b.logType] || {}).color || 0x7a5a32 });
            const rings = new THREE.MeshLambertMaterial({ color: 0xd8b98a });
            b.logMesh = new THREE.Mesh(this.beaverLogGeometry, [rings, rings, bark, bark, bark, bark]);
            b.logMesh.userData.type = b.logType;
            b.logMesh.position.set(0, -0.15, 0.27);
            head.add(b.logMesh);
        }
        if (b.logMesh) b.logMesh.visible = b.logs > 0;
    },

    // ---- Particles and falling trees --------------------------------------------------------

    beaverChips(x, y, z, heading, count, color) {
        this.beaverChipList = this.beaverChipList || [];
        if (!this.beaverChipGeometry) this.beaverChipGeometry = new THREE.BoxGeometry(0.07, 0.025, 0.05);
        this.beaverChipMaterials = this.beaverChipMaterials || {};
        const material = this.beaverChipMaterials[color] || (this.beaverChipMaterials[color] = new THREE.MeshLambertMaterial({ color }));
        for (let i = 0; i < count && this.beaverChipList.length < 120; i++) {
            const chip = new THREE.Mesh(this.beaverChipGeometry, material);
            chip.position.set(x, y, z);
            const angle = heading + (Math.random() - 0.5) * 1.8;
            const outward = 0.8 + Math.random() * 1.4;
            chip.userData.velocity = new THREE.Vector3(Math.cos(angle) * outward, 1.2 + Math.random() * 1.6, Math.sin(angle) * outward);
            chip.userData.spin = new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12);
            chip.userData.age = 0;
            chip.userData.life = 1.2 + Math.random() * 1.2;
            this.scene.add(chip);
            this.beaverChipList.push(chip);
        }
    },

    beaverFrame(delta) {
        if (this.beaverChipList && this.beaverChipList.length) {
            this.beaverChipList = this.beaverChipList.filter((chip) => {
                const data = chip.userData;
                data.age += delta;
                if (data.age >= data.life) {
                    this.scene.remove(chip);
                    return false;
                }
                const floor = this.cameraController.getFloorY(chip.position.x, chip.position.z, chip.position.y + 0.3);
                if (chip.position.y > floor + 0.015) {
                    data.velocity.y -= 9 * delta;
                    chip.position.addScaledVector(data.velocity, delta);
                    chip.rotation.x += data.spin.x * delta;
                    chip.rotation.y += data.spin.y * delta;
                    chip.rotation.z += data.spin.z * delta;
                    if (chip.position.y < floor + 0.015) chip.position.y = floor + 0.015;
                }
                chip.scale.setScalar(Math.min(1, (data.life - data.age) * 3));
                return true;
            });
        }

        if (this.beaverFalling && this.beaverFalling.length) {
            this.beaverFalling = this.beaverFalling.filter((fall) => {
                fall.age += delta;
                if (!fall.landed) {
                    fall.speed += 3.2 * delta;
                    fall.angle = Math.min(Math.PI / 2 - 0.04, fall.angle + fall.speed * delta);
                    fall.log.rotation.z = -fall.angle;
                    if (fall.angle >= Math.PI / 2 - 0.04) {
                        fall.landed = true;
                        fall.age = 0;
                        this.beaverTreeLanded(fall);
                    }
                    return true;
                }
                if (fall.age < 1) return true;
                const fade = Math.max(0, 1 - (fall.age - 1) / 0.8);
                fall.log.material.forEach((material) => { material.opacity = fade; });
                if (fade > 0) return true;
                this.scene.remove(fall.pivot);
                fall.log.geometry.dispose();
                new Set(fall.log.material).forEach((material) => material.dispose());
                return false;
            });
        }

        if (this.beaverLeafQueue && this.beaverLeafQueue.length) {
            const leaf = this.beaverLeafQueue[0];
            leaf.delay -= delta;
            if (leaf.delay <= 0) {
                this.beaverLeafQueue.shift();
                if (this.beaverLeafQueue.length) this.beaverLeafQueue[0].delay = Math.min(this.beaverLeafQueue[0].delay, 0.06);
                if (this.world.getBlockTypeAt(leaf.x, leaf.y, leaf.z) === leaf.type && !this.beaverLeafHeld(leaf) && this.beaverRemoveBlock(leaf.x, leaf.y, leaf.z, leaf.type)) {
                    const color = (this.world.blockTypes[leaf.type] || {}).color || 0x4e8f36;
                    if (Math.random() < 0.5) this.beaverChips(leaf.x + 0.5, leaf.y + 0.5, leaf.z + 0.5, Math.random() * Math.PI * 2, 2, color);
                    const distance = Math.hypot(leaf.x + 0.5 - this.camera.position.x, leaf.z + 0.5 - this.camera.position.z);
                    if (distance < 20 && Math.random() < 0.4) this.playNoiseBurst({ duration: 0.08, volume: 0.006 * (1 - distance / 20), highpass: 1500, lowpass: 6000 });
                }
            }
        }
    },

    // The trunk hits the ground: a thud, a puff of chips and, in the water, a splash.
    beaverTreeLanded(fall) {
        const tree = fall.tree;
        const heading = -fall.pivot.rotation.y;
        const tipX = tree.x + 0.5 + Math.cos(heading) * tree.height * 0.6;
        const tipZ = tree.z + 0.5 + Math.sin(heading) * tree.height * 0.6;
        const distance = Math.hypot(tipX - this.camera.position.x, tipZ - this.camera.position.z);
        const volume = Math.max(0, 1 - distance / 40);
        if (volume > 0) {
            this.playTone({ frequency: 70, endFrequency: 40, duration: 0.3, type: 'sine', volume: 0.07 * volume, attack: 0.003, release: 0.25 });
            this.playNoiseBurst({ duration: 0.25, volume: 0.04 * volume, highpass: 80, lowpass: 900 });
        }
        const surface = this.findWaterSurface(tipX, tree.y + 0.2, tipZ);
        if (surface !== null) {
            this.spawnSplash(tipX, surface, tipZ, 0.8);
            this.world.addRipple(tipX, tipZ, 1.5);
        }
        this.beaverChips(tipX, tree.y + 0.3, tipZ, heading, 8, 0xd8b98a);
    }
});
