// Rabbits. A family lives around a burrow: a dark hole with a rim of kicked-out dirt dug into
// the ground near where they appear (a client-side object, not a world block). They move in
// short hops, stop to nibble the grass, sit up on their hind legs to look around with their
// ears swivelling, and freeze to watch a player who comes near. Closer than that (unless the
// player sneaks), or when a fox, an owl or a low-flying eagle shows up, one of them thumps an
// alarm and the whole family bolts for the burrow in fast zig-zag hops and vanishes inside;
// a while later a head peeks out, and when the coast is clear they come out again. At dusk
// they turn in for the night, and at dawn they are out and at their liveliest. Hidden rabbits
// have userData.hidden set (and sit below the ground), so predators should skip them.
// Registered as the 'burrow' movement through js/extensions.js.

MOB_SPECIES.rabbit = {
    eggColor: 0xa8825a, tone: 1500, speed: 2.2, variants: 5, group: [2, 4], limit: 10,
    movement: 'burrow'
};

// Variants: brown, grey, white, black-and-white (Dutch) and sandy (desert).
const RABBIT_PALETTES = [
    { fur: 0x8a6646, light: 0xb89670, belly: 0xe6d6bc, ear: 0xd99a92, tail: 0xf4efe6, eye: 0x20140c },
    { fur: 0x8b8682, light: 0xb2aca6, belly: 0xe2ddd6, ear: 0xd8a09c, tail: 0xf2f0ec, eye: 0x1a1414 },
    { fur: 0xf1eee8, light: 0xffffff, belly: 0xffffff, ear: 0xf0b4b4, tail: 0xffffff, eye: 0xb0283a },
    { fur: 0x2a2624, light: 0xf3f0ea, belly: 0xf3f0ea, ear: 0xd09a96, tail: 0xf3f0ea, eye: 0x120c0a, dutch: true },
    { fur: 0xc9a670, light: 0xe0c594, belly: 0xf0e4c8, ear: 0xe0a890, tail: 0xf6efe0, eye: 0x24180e }
];
const RABBIT_SANDY = 4;

VoxelModels.MOB_SURFACES.rabbit = 'fur';
VoxelModels.mobBuilders.rabbit = function (b, variant) {
    const c = RABBIT_PALETTES[variant % RABBIT_PALETTES.length];
    // Dutch rabbits: dark rear half and face patches, a white blaze and collar.
    const dutchBody = (p, face) => {
        if (face === 'bottom') { p.fill(c.belly, 0.03); return; }
        if (face === 'front') { p.fill(c.light, 0.04); return; }
        if (face === 'top') p.rect(0, p.h * 0.55, p.w, p.h * 0.45, c.light, 0.04);
        if (face === 'left') p.rect(p.w * 0.55, 0, p.w * 0.45, p.h, c.light, 0.04);
        if (face === 'right') p.rect(0, 0, p.w * 0.45, p.h, c.light, 0.04);
    };
    const plainBody = (p, face) => {
        if (face === 'bottom') { p.fill(c.belly, 0.03); return; }
        if (face !== 'top' && face !== 'back') p.rect(0, p.h * 0.75, p.w, p.h * 0.25, c.light, 0.04);
        if (face === 'top') p.spots(shadeRgb(colorToRgb(c.fur), -0.1), 3, 0.8, 1.4, 4);
    };
    b.part('body', { pivot: [0, 0, 0], from: [-2.25, 1.5, -3.5], size: [4.5, 4, 6.5], paint: { color: c.fur, noise: 0.06, all: c.dutch ? dutchBody : plainBody } });
    b.part('head', {
        parent: 'body', pivot: [0, 5, 2.5], from: [-1.75, -1, 0], size: [3.5, 3.5, 3.5],
        paint: {
            color: c.fur, noise: 0.05,
            all: (p, face) => {
                if (c.dutch && face === 'front') p.rect(1.25, 0, 1, 1.75, c.light, 0.03);
                if (c.dutch && face === 'top') p.rect(1.25, 0, 1, p.h, c.light, 0.03);
                if (face === 'bottom') p.fill(c.belly, 0.03);
                // Eyes on the sides of the head, a light muzzle at the front.
                if (face === 'left') { p.rect(1.6, 0.9, 1, 1, c.eye, 0); p.rect(1.6, 0.9, 0.4, 0.4, 0xffffff, 0); }
                if (face === 'right') { p.rect(0.9, 0.9, 1, 1, c.eye, 0); p.rect(1.5, 0.9, 0.4, 0.4, 0xffffff, 0); }
                if (face === 'front') { p.rect(0.75, 1.75, 2, 1.75, c.belly, 0.02); p.rect(1.5, 2.9, 0.5, 0.4, 0x7a5a50, 0); }
            }
        }
    });
    b.part('nose', { parent: 'head', pivot: [0, 0.9, 3.5], from: [-0.5, -0.4, 0], size: [1, 0.8, 0.4], paint: { color: 0xd88a8a, noise: 0.02, surface: 'smooth' } });
    const earPaint = { color: c.fur, noise: 0.05, faces: { front: (p) => p.rect(0.25, 0.4, p.w - 0.5, p.h - 0.8, c.ear, 0.04) } };
    b.part('earL', { parent: 'head', pivot: [0.85, 2.5, 1.4], from: [-0.6, 0, -0.35], size: [1.2, 4.5, 0.7], paint: earPaint, rotation: [-0.25, 0, -0.12] });
    b.part('earR', { parent: 'head', pivot: [-0.85, 2.5, 1.4], from: [-0.6, 0, -0.35], size: [1.2, 4.5, 0.7], paint: earPaint, rotation: [-0.25, 0, 0.12] });
    b.part('tail', { parent: 'body', pivot: [0, 4.25, -3.5], from: [-1, -1, -1.5], size: [2, 2, 1.75], paint: { color: c.tail, noise: 0.03, surface: 'wool' } });
    const legPaint = { color: c.dutch ? c.light : c.fur, noise: 0.05, all: (p, face) => { if (face !== 'top') p.rect(0, p.h - 0.6, p.w, 0.6, c.belly, 0.02); } };
    b.part('legFL', { parent: 'body', pivot: [1.1, 2.2, 2.2], from: [-0.5, -2.2, -0.5], size: [1, 2.2, 1], paint: legPaint });
    b.part('legFR', { parent: 'body', pivot: [-1.1, 2.2, 2.2], from: [-0.5, -2.2, -0.5], size: [1, 2.2, 1], paint: legPaint });
    // Big haunches on the sides, with long hind feet that lie flat on the ground.
    const haunchPaint = { color: c.fur, noise: 0.06, faces: { bottom: (p) => p.fill(c.belly, 0.03) } };
    b.part('haunchL', { parent: 'body', pivot: [2.3, 3, -1.5], from: [-0.8, -2, -2], size: [1.6, 3.5, 3.5], paint: haunchPaint });
    b.part('haunchR', { parent: 'body', pivot: [-2.3, 3, -1.5], from: [-0.8, -2, -2], size: [1.6, 3.5, 3.5], paint: haunchPaint });
    const footPaint = { color: c.light, noise: 0.04, faces: { bottom: (p) => p.fill(c.belly, 0.02) } };
    b.part('footL', { parent: 'haunchL', pivot: [0, -2, -1.5], from: [-0.6, -1, -0.5], size: [1.2, 1, 3.5], paint: footPaint });
    b.part('footR', { parent: 'haunchR', pivot: [0, -2, -1.5], from: [-0.6, -1, -0.5], size: [1.2, 1, 3.5], paint: footPaint });
    return { legs: ['legFL', 'legFR', 'haunchL', 'haunchR'], head: 'head', tail: ['tail'] };
};

// The burrow: a dark hole with a rim of dirt, one block-unit model per graphics mode.
function buildRabbitBurrow(hd, sandy) {
    const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: sandy ? 77 : 71, hd, defaultSurface: 'skin' });
    const dirt = sandy ? 0xc4a46a : 0x7a5434;
    const dark = sandy ? 0x6a5434 : 0x3e2a1a;
    const crumbs = (p) => p.spots(shadeRgb(colorToRgb(dirt), -0.15), Math.ceil(p.w * p.h / 4), 0.5, 1, 2);
    b.part('hole', {
        pivot: [0, 0, 0], from: [-3.5, 0, -3.5], size: [7, 0.3, 7],
        paint: { color: dark, noise: 0.04, bevel: 0, faces: { top: (p) => { p.rect(1, 1, 5, 5, 0x120b06, 0.03); p.rect(2, 2, 3, 3, 0x050302, 0); } } }
    });
    const rim = { color: dirt, noise: 0.08, all: crumbs };
    // The heap of dug-out earth in front, smaller lumps round the rest of the rim.
    b.part('heap', { pivot: [0, 0, 4.6], from: [-3, 0, -1.2], size: [6, 1.4, 3], paint: rim, rotation: [-0.12, 0, 0] });
    b.part('heapTop', { parent: 'heap', pivot: [0, 1.4, 0.6], from: [-1.8, 0, -1], size: [3.6, 0.8, 2], paint: rim });
    b.part('rimL', { pivot: [4.2, 0, 0], from: [-0.9, 0, -3], size: [1.8, 0.9, 6], paint: rim, rotation: [0, 0, 0.15] });
    b.part('rimR', { pivot: [-4.2, 0, 0.5], from: [-0.9, 0, -2.5], size: [1.8, 0.7, 5], paint: rim, rotation: [0, 0, -0.15] });
    b.part('rimB', { pivot: [0.5, 0, -4.3], from: [-2.5, 0, -0.8], size: [5, 0.8, 1.6], paint: rim });
    if (!sandy) {
        // A few blades of grass growing over the rim.
        const grass = { color: 0x5b8c35, noise: 0.08, surface: 'smooth', bevel: 0 };
        b.part('grassA', { pivot: [-4.6, 0.6, -2.6], from: [-0.2, 0, -0.2], size: [0.4, 1.8, 0.4], paint: grass, rotation: [0.2, 0, 0.3] });
        b.part('grassB', { pivot: [4.4, 0.8, 2.8], from: [-0.2, 0, -0.2], size: [0.4, 1.4, 0.4], paint: grass, rotation: [-0.2, 0, -0.25] });
        b.part('grassC', { pivot: [2.4, 1.2, 5.6], from: [-0.2, 0, -0.2], size: [0.4, 1.2, 0.4], paint: grass, rotation: [0.3, 0, 0.1] });
    }
    return b;
}

// Nose-up angle of a rabbit sitting up on its hind legs, and the point it pivots about (the
// hind feet), in blocks.
const RABBIT_UPRIGHT = 1.05;
const RABBIT_HIND_Y = 0.5 / 16;
const RABBIT_HIND_Z = -3 / 16;
const RABBIT_GRAVITY = 18;

Object.assign(Game.prototype, {
    rabbitHour() {
        return ((this.timeOfDay * 24) + 6) % 24;
    },

    // 'night' keeps them underground, 'dusk' sends them home, 'dawn' makes them lively.
    rabbitDayPart() {
        const hour = this.rabbitHour();
        if (hour >= 19.5 || hour < 4.5) return 'night';
        if (hour >= 17) return 'dusk';
        if (hour < 8) return 'dawn';
        return 'day';
    },

    // A flat patch of earth, grass or sand open to the sky at (x, z) for a burrow, or null.
    rabbitBurrowSpot(x, z, startY) {
        const bx = Math.floor(x);
        const bz = Math.floor(z);
        const floor = this.cameraController.getFloorY(bx + 0.5, bz + 0.5, startY);
        if (floor <= -20 || floor !== Math.floor(floor)) return null;
        const surface = this.world.getBlockTypeAt(bx, floor - 1, bz);
        if (!['grass', 'dirt', 'sand'].includes(surface)) return null;
        // Open air above (no tall grass poking through the hole).
        const above = this.world.getBlockTypeAt(bx, floor, bz);
        if ((above && above !== 'air') || this.world.hasSolidBlock(bx, floor + 1, bz)) return null;
        return { position: new THREE.Vector3(bx + 0.5, floor, bz + 0.5), sandy: surface === 'sand' };
    },

    rabbitBurrowSpotNear(x, z, startY, radius) {
        for (let r = 0; r <= radius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const spot = this.rabbitBurrowSpot(x + dx, z + dz, startY);
                    if (spot) return spot;
                }
            }
        }
        return null;
    },

    createRabbitBurrow(spot) {
        this.rabbitBurrows = this.rabbitBurrows || [];
        const burrow = { position: spot.position.clone(), sandy: spot.sandy, members: [], object: null, hd: null };
        burrow.facing = Math.random() * Math.PI * 2;
        this.buildRabbitBurrowModel(burrow);
        this.rabbitBurrows.push(burrow);
        return burrow;
    },

    // (Re)builds the burrow's model, e.g. after the graphics mode changed.
    buildRabbitBurrowModel(burrow) {
        if (burrow.object) this.disposeRabbitBurrowModel(burrow);
        const hd = Boolean(this.rtxModeEnabled);
        const model = buildRabbitBurrow(hd, burrow.sandy).build((texture, normalMap) => this.createModelMaterial(texture, normalMap), { textureCache: this.mobTextureCache, cacheKey: `rabbit_burrow:${burrow.sandy ? 'sand' : 'dirt'}:${hd ? 'hd' : 'sd'}` });
        model.root.traverse((node) => {
            if (!node.isMesh) return;
            node.castShadow = false;
            node.receiveShadow = hd;
        });
        model.root.position.copy(burrow.position);
        model.root.position.y += 0.012;
        model.root.rotation.y = burrow.facing;
        this.scene.add(model.root);
        burrow.object = model.root;
        burrow.hd = hd;
    },

    disposeRabbitBurrowModel(burrow) {
        this.scene.remove(burrow.object);
        // The texture is shared through mobTextureCache; geometries and material are its own.
        burrow.object.traverse((node) => {
            if (!node.isMesh) return;
            node.geometry.dispose();
            if (node.material) node.material.dispose();
        });
        burrow.object = null;
    },

    // `collapsed`: the ground under it was dug away, so whoever is inside bursts out and runs.
    removeRabbitBurrow(burrow, collapsed = false) {
        if (burrow.object) this.disposeRabbitBurrowModel(burrow);
        this.rabbitBurrows = (this.rabbitBurrows || []).filter((other) => other !== burrow);
        const floor = this.cameraController.getFloorY(burrow.position.x, burrow.position.z, burrow.position.y + 0.5);
        const exit = burrow.position.clone().setY(floor > -20 ? floor : burrow.position.y);
        // Anyone still inside comes out to look for a new home.
        burrow.members.forEach((rabbit) => {
            rabbit.userData.burrow = null;
            if (!rabbit.userData.hidden) return;
            this.rabbitSurface(rabbit, exit);
            if (collapsed) this.startRabbitFlight(rabbit, exit.clone().add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)));
        });
        if (collapsed && burrow.members.length > 0) {
            this.playNoiseBurst({ duration: 0.2, volume: 0.02, highpass: 150, lowpass: 1000 });
            this.playTone({ frequency: getMobSpecies('rabbit').tone * 1.8, endFrequency: getMobSpecies('rabbit').tone * 2.6, duration: 0.08, type: 'triangle', volume: 0.012, release: 0.05 });
        }
        burrow.members = [];
    },

    // Every burrow, a few times a second: one whose ground was dug away (or filled in)
    // collapses at once, wherever its rabbits are.
    rabbitCheckBurrows(delta) {
        if (this.rabbitBurrowFrame === this.mobFrame) return;
        this.rabbitBurrowFrame = this.mobFrame;
        this.rabbitBurrowCheck = (this.rabbitBurrowCheck || 0) - delta;
        if (this.rabbitBurrowCheck > 0) return;
        this.rabbitBurrowCheck = 0.2;
        for (const burrow of [...(this.rabbitBurrows || [])]) {
            const x = Math.floor(burrow.position.x);
            const z = Math.floor(burrow.position.z);
            const y = burrow.position.y;
            if (!this.world.hasSolidBlock(x, y - 1, z) || this.world.hasSolidBlock(x, y, z)) this.removeRabbitBurrow(burrow, true);
        }
    },

    joinRabbitBurrow(rabbit, burrow) {
        rabbit.userData.burrow = burrow;
        if (!burrow.members.includes(rabbit)) burrow.members.push(rabbit);
    },

    // A family of `count` rabbits around a new burrow at `spot`.
    spawnRabbitFamily(spot, count, variant) {
        const burrow = this.createRabbitBurrow(spot);
        const rabbits = [];
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 0.8 + Math.random() * 2.2;
            let x = spot.position.x + Math.cos(angle) * distance;
            let z = spot.position.z + Math.sin(angle) * distance;
            let floor = this.cameraController.getFloorY(x, z, spot.position.y + 1.5);
            if (floor <= -20 || Math.abs(floor - spot.position.y) > 1.2 || this.findWaterSurface(x, floor + 0.1, z) !== null) {
                x = spot.position.x + Math.cos(angle) * 0.5;
                z = spot.position.z + Math.sin(angle) * 0.5;
                floor = spot.position.y;
            }
            // Mostly one colour per family, now and then a different one.
            const own = variant === RABBIT_SANDY || Math.random() < 0.75 ? variant : Math.floor(Math.random() * RABBIT_SANDY);
            const rabbit = this.createMob('rabbit', new THREE.Vector3(x, floor, z), { variant: own });
            this.joinRabbitBurrow(rabbit, burrow);
            this.ambientMobs.push(rabbit);
            rabbits.push(rabbit);
        }
        return rabbits;
    },

    rabbitNaturalVariant(biome, random) {
        if (biome === 'desert') return RABBIT_SANDY;
        // Brown is the common one.
        if (random < 0.55) return 0;
        if (random < 0.8) return 1;
        return random < 0.92 ? 2 : 3;
    },

    spawnRabbitsForChunk(chunkX, chunkZ, biome) {
        if (biome === 'rocky') return;
        const chance = biome === 'forest' ? 0.16 : biome === 'desert' ? 0.05 : 0.2;
        if (this.chunkRandom(chunkX, chunkZ, 301) > chance) return;
        const info = getMobSpecies('rabbit');
        const alive = this.ambientMobs.filter((mob) => mob.userData.species === 'rabbit').length;
        if (alive >= info.limit) return;
        const size = this.world.chunkSize;
        for (let attempt = 0; attempt < 8; attempt++) {
            const x = chunkX * size + 2 + this.chunkRandom(chunkX, chunkZ, 310 + attempt) * (size - 4);
            const z = chunkZ * size + 2 + this.chunkRandom(chunkX, chunkZ, 320 + attempt) * (size - 4);
            const spot = this.rabbitBurrowSpot(x, z, 64);
            if (!spot || (biome === 'desert') !== spot.sandy) continue;
            const [min, max] = info.group;
            const count = Math.min(info.limit - alive, min + Math.floor(this.chunkRandom(chunkX, chunkZ, 302) * (max - min + 1)));
            const variant = this.rabbitNaturalVariant(biome, this.chunkRandom(chunkX, chunkZ, 303));
            this.spawnRabbitFamily(spot, count, variant).forEach((rabbit) => {
                rabbit.userData.natural = true;
                rabbit.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
            });
            return;
        }
    },

    // /mob rabbit: a family with its burrow a few blocks ahead.
    spawnRabbitsFromCommand(x, z, player) {
        const spot = this.rabbitBurrowSpotNear(x, z, player.y + 4, 3);
        if (!spot) {
            this.receiveSystemMessage({ text: 'Rabbits need a patch of grass, dirt or sand to dig a burrow' });
            return true;
        }
        const variant = spot.sandy ? RABBIT_SANDY : Math.floor(Math.random() * RABBIT_SANDY);
        const [min, max] = getMobSpecies('rabbit').group;
        const rabbits = this.spawnRabbitFamily(spot, min + Math.floor(Math.random() * (max - min + 1)), variant);
        rabbits.forEach((rabbit) => { rabbit.userData.rabbit = this.newRabbitState(rabbit, 'alert', 2); });
        this.rabbitSqueak(rabbits[0], 0.6);
        this.receiveSystemMessage({ text: `Spawned ${rabbits.length} rabbits and their burrow` });
        return true;
    },

    newRabbitState(rabbit, mode = 'idle', timer = 0.5 + Math.random() * 2) {
        return {
            mode, timer, hops: 0, zig: 1, flee: 0, threatCheck: Math.random() * 0.3, threat: null,
            facing: rabbit.userData.direction, velocity: new THREE.Vector3(), airborne: false, onGround: true,
            upright: 0, crouch: 0, stretch: 0, sink: 0, earBack: 0, earTimer: 0, earYaw: [0, 0], earYawTarget: [0, 0],
            twitch: Math.random() * 6, chew: 0, lookYaw: 0, lookTimer: 0, homeless: 0, calm: 0
        };
    },

    // ---------------------------------------------------------------------------------------
    // Behaviour
    // ---------------------------------------------------------------------------------------

    updateRabbit(mob, delta, player) {
        const data = mob.userData;
        if (!data.rabbit) data.rabbit = this.newRabbitState(mob);
        const r = data.rabbit;
        const position = mob.position;
        data.life += delta;
        r.timer -= delta;
        r.flee = Math.max(0, r.flee - delta);

        if (position.y < -20) {
            // Spawned before its chunk was generated: drop it onto the terrain once it exists.
            const ground = this.cameraController.getFloorY(position.x, position.z, 64);
            if (ground <= -20) return;
            position.y = ground;
        }
        this.rabbitCheckBurrows(delta);
        this.updateRabbitBurrow(mob, delta);

        r.threatCheck -= delta;
        if (r.threatCheck <= 0) {
            r.threatCheck = 0.2;
            r.threat = this.findRabbitThreat(mob, player);
        }

        if (r.mode === 'hidden' || r.mode === 'peek') {
            this.updateHiddenRabbit(mob, delta);
            this.animateRabbit(mob, delta, player);
            return;
        }
        if (r.mode === 'enter') {
            // Diving head first into the hole.
            r.sink = Math.min(1, r.sink + delta * 3.5);
            position.lerp(data.burrow ? data.burrow.position : position, Math.min(1, delta * 12));
            if (r.sink >= 1) this.hideRabbit(mob);
            this.animateRabbit(mob, delta, player);
            return;
        }

        if (r.threat && r.threat.flee && r.mode !== 'flee') {
            this.startRabbitFlight(mob, r.threat.position);
            this.alarmRabbits(mob, r.threat.position);
        }

        if (r.airborne) {
            this.updateRabbitHop(mob, delta);
        } else {
            const floor = this.cameraController.getFloorY(position.x, position.z, position.y + 0.5);
            if (position.y - floor > 0.05) {
                // The ground went away: fall.
                r.velocity.set(0, 0, 0);
                r.airborne = true;
            } else {
                position.y = floor;
                this.decideRabbit(mob, delta, player);
            }
        }
        this.animateRabbit(mob, delta, player);
    },

    // The nearest danger: the player (unless sneaking), a fox, an owl or a swooping eagle.
    // Returns { position, flee } (flee false: just worth watching) or null.
    findRabbitThreat(mob, player) {
        const position = mob.position;
        let best = null;
        if (!this.titleScreenOpen && !this.respawnPending) {
            const feetY = player.y - (this.cameraController.isCrouching ? 1.2 : 1.6);
            const distance = Math.hypot(player.x - position.x, (feetY - position.y) * 0.6, player.z - position.z);
            const sneaking = this.cameraController.isCrouching;
            const fleeAt = sneaking ? 1.8 : 5.5;
            const watchAt = sneaking ? 4 : 11;
            if (distance < watchAt) best = { position: new THREE.Vector3(player.x, feetY, player.z), flee: distance < fleeAt || mob.userData.rabbit.flee > 0, distance };
        }
        for (const other of this.ambientMobs) {
            const species = other.userData.species;
            if (species !== 'fox' && species !== 'owl' && species !== 'eagle') continue;
            if (other.userData.hidden || !other.visible) continue;
            const dx = other.position.x - position.x;
            const dz = other.position.z - position.z;
            const horizontal = Math.hypot(dx, dz);
            const height = other.position.y - position.y;
            let danger = false;
            if (species === 'fox') danger = horizontal < 9 && Math.abs(height) < 4;
            else if (species === 'owl') danger = horizontal < 7 && height > -1 && height < 9 && (this.isNightTime() || horizontal < 4);
            else {
                const flight = other.userData.flight;
                const mode = flight ? flight.mode : 'soar';
                danger = (mode === 'dive' && horizontal < 16) || (mode !== 'perch' && horizontal < 9 && height < 8);
            }
            if (!danger) continue;
            const distance = Math.hypot(horizontal, height);
            if (!best || !best.flee || distance < best.distance) best = { position: other.position.clone(), flee: true, distance };
        }
        return best;
    },

    // Thump! Every rabbit of the family within earshot bolts too.
    alarmRabbits(mob, from) {
        this.rabbitThump(mob, 1);
        const burrow = mob.userData.burrow;
        const family = burrow ? burrow.members : [mob];
        family.forEach((other) => {
            if (other === mob || !other.parent || other.position.distanceTo(mob.position) > 10) return;
            const r = other.userData.rabbit;
            if (!r || r.mode === 'flee' || r.mode === 'hidden' || r.mode === 'enter') return;
            // A beat later, as the thump reaches them.
            r.timer = 0;
            this.startRabbitFlight(other, from, 0.1 + Math.random() * 0.25);
        });
    },

    startRabbitFlight(mob, from, delay = 0) {
        const r = mob.userData.rabbit;
        if (r.mode === 'peek') {
            this.hideRabbit(mob);
            return;
        }
        r.mode = 'flee';
        r.flee = 2.5;
        r.fleeTime = 0;
        r.timer = delay;
        r.from = from.clone();
        r.upright = Math.min(r.upright, 0.3);
        r.earBack = 1;
    },

    // What to do next while sitting on the ground.
    decideRabbit(mob, delta, player) {
        const data = mob.userData;
        const r = data.rabbit;
        const position = mob.position;
        const burrow = data.burrow;
        const dayPart = this.rabbitDayPart();
        const toBurrow = burrow ? Math.hypot(burrow.position.x - position.x, burrow.position.z - position.z) : Infinity;
        const headingHome = burrow ? Math.atan2(burrow.position.z - position.z, burrow.position.x - position.x) : r.facing;

        if (r.mode === 'flee') {
            r.fleeTime += delta;
            if (r.timer > 0) return;
            if (burrow && toBurrow < 0.7) {
                this.enterRabbitBurrow(mob);
                return;
            }
            const away = r.from ? Math.atan2(position.z - r.from.z, position.x - r.from.x) : r.facing;
            // Home if it has one and the danger is not between them, otherwise just away.
            let heading = away;
            if (burrow && r.fleeTime < 10) {
                const between = r.from && Math.abs(this.lerpAngle(0, headingHome - Math.atan2(r.from.z - position.z, r.from.x - position.x), 1)) < 0.5 && r.from.distanceTo(position) < toBurrow;
                if (!between || toBurrow < 2) heading = headingHome;
            }
            if (!r.threat || !r.threat.flee) {
                if (!burrow || r.fleeTime > 10) {
                    // Safe again: calm down where it is.
                    r.mode = 'alert';
                    r.timer = 2 + Math.random() * 2;
                    return;
                }
            }
            // Zig-zag: each hop veers the other way, except for the last one into the hole.
            r.zig = -r.zig;
            const veer = burrow && heading === headingHome && toBurrow < 1.8 ? 0 : r.zig * (0.35 + Math.random() * 0.4);
            const distance = burrow && heading === headingHome ? Math.min(1.5, toBurrow) : 1.5;
            if (!this.rabbitHopSomewhere(mob, heading + veer, distance, true)) r.from = position.clone().add(new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading)));
            r.timer = 0.04;
            return;
        }

        if (r.mode === 'home') {
            if (r.timer > 0) return;
            if (!burrow) { r.mode = 'idle'; return; }
            if (toBurrow < 0.6) {
                this.enterRabbitBurrow(mob);
                return;
            }
            if (!this.rabbitHopSomewhere(mob, headingHome + (Math.random() - 0.5) * 0.4, Math.min(0.9, toBurrow), false)) r.timer = 0.5;
            else r.timer = 0.25 + Math.random() * 0.5;
            return;
        }

        // Something worth watching nearby (the player, too far to flee from): sit up and stare,
        // until it gets used to it and goes back to eating.
        r.calm = Math.max(0, r.calm - delta);
        if (r.threat && !r.threat.flee && r.mode !== 'alert' && r.calm <= 0) {
            r.mode = 'alert';
            r.timer = 1.5 + Math.random() * 2;
            this.turnRabbitTowards(mob, r.threat.position, 0.6);
        }
        if (r.timer > 0) return;

        if (r.mode === 'alert' && r.threat && !r.threat.flee && Math.random() < 0.7) {
            // Keep watching, ears up.
            r.timer = 0.8 + Math.random() * 1.5;
            if (Math.random() < 0.3) this.turnRabbitTowards(mob, r.threat.position, 0.6);
            return;
        }

        // Turning in: always at night, often at dusk or in the rain, now and then by day.
        const goHome = dayPart === 'night' ? 1 : dayPart === 'dusk' ? 0.5 : this.weatherState === 'rain' ? 0.3 : 0.04;
        if (burrow && Math.random() < goHome) {
            r.mode = 'home';
            r.timer = 0;
            return;
        }

        const lively = dayPart === 'dawn' ? 1.6 : 1;
        // Mid-way through a run of hops: keep going.
        if (r.mode === 'hop' && r.hops > 0) {
            r.hops--;
            let heading = r.facing + (Math.random() - 0.5) * 0.5;
            if (toBurrow > 7) heading = headingHome + (Math.random() - 0.5) * 0.8;
            if (!this.rabbitHopSomewhere(mob, heading, 0.6 + Math.random() * 0.5, false)) r.hops = 0;
            r.timer = 0.12 + Math.random() * 0.25;
            return;
        }

        const pick = Math.random();
        if (pick < 0.45 * lively / (0.45 * lively + 0.55)) {
            r.mode = 'hop';
            r.hops = 1 + Math.floor(Math.random() * 3 * lively);
            r.facing += toBurrow > 6 ? this.lerpAngle(0, headingHome - r.facing, 1) : (Math.random() - 0.5) * 2.6;
            r.timer = 0;
        } else if (pick < 0.8 || r.threat) {
            if (r.threat) r.calm = 6 + Math.random() * 6;
            r.mode = 'nibble';
            r.timer = (2 + Math.random() * 4) / lively;
        } else if (pick < 0.93) {
            r.mode = 'alert';
            r.timer = 1.5 + Math.random() * 2.5;
        } else {
            // Wash its face, sitting still.
            r.mode = 'groom';
            r.timer = 1.5 + Math.random() * 1.5;
        }
    },

    turnRabbitTowards(mob, target, amount) {
        const r = mob.userData.rabbit;
        const heading = Math.atan2(target.z - mob.position.z, target.x - mob.position.x);
        r.facing += this.lerpAngle(0, heading - r.facing, 1) * amount;
    },

    // Launches a hop of `distance` blocks towards `heading`, up at most one block and down at
    // most two, never into water.
    rabbitStartHop(mob, heading, distance, fleeing) {
        const r = mob.userData.rabbit;
        const position = mob.position;
        const tx = position.x + Math.cos(heading) * distance;
        const tz = position.z + Math.sin(heading) * distance;
        const floor = this.cameraController.getFloorY(tx, tz, position.y + 1.6);
        const rise = floor - position.y;
        if (floor <= -20 || rise > 1.05 || rise < -2.2) return false;
        if (this.findWaterSurface(tx, floor + 0.1, tz) !== null) return false;
        if (this.world.hasSolidBlock(Math.floor(tx), Math.floor(floor + 0.3), Math.floor(tz))) return false;
        const up = rise > 0.2 ? 6.8 : fleeing ? 4.4 : 3.4;
        const time = (up + Math.sqrt(Math.max(0, up * up - 2 * RABBIT_GRAVITY * Math.max(0, rise)))) / RABBIT_GRAVITY;
        const speed = distance / Math.max(0.15, time);
        r.velocity.set(Math.cos(heading) * speed, up, Math.sin(heading) * speed);
        r.airborne = true;
        r.facing = heading;
        return true;
    },

    rabbitHopSomewhere(mob, heading, distance, fleeing) {
        for (const turn of [0, 0.5, -0.5, 1.1, -1.1, 1.8, -1.8]) {
            if (this.rabbitStartHop(mob, heading + turn, distance, fleeing)) return true;
        }
        return false;
    },

    updateRabbitHop(mob, delta) {
        const r = mob.userData.rabbit;
        const position = mob.position;
        const velocity = r.velocity;
        velocity.y -= RABBIT_GRAVITY * delta;
        const nx = position.x + velocity.x * delta;
        const nz = position.z + velocity.z * delta;
        // Stop against walls instead of passing through them.
        if (!this.world.hasSolidBlock(Math.floor(nx), Math.floor(position.y + 0.15), Math.floor(position.z))) position.x = nx;
        if (!this.world.hasSolidBlock(Math.floor(position.x), Math.floor(position.y + 0.15), Math.floor(nz))) position.z = nz;
        position.y += velocity.y * delta;
        const floor = this.cameraController.getFloorY(position.x, position.z, position.y + 0.5);
        if (velocity.y < 0 && position.y <= floor) {
            position.y = floor;
            r.airborne = false;
            velocity.set(0, 0, 0);
            r.crouch = Math.max(r.crouch, 0.6);
            this.rabbitLanding(mob, r.mode === 'flee');
        } else if (position.y < -30) {
            this.removeMob(mob);
        }
    },

    enterRabbitBurrow(mob) {
        const r = mob.userData.rabbit;
        r.mode = 'enter';
        r.sink = 0;
        r.airborne = false;
        this.playNoiseBurst({ duration: 0.12, volume: this.rabbitVolume(mob, 0.012, 10), highpass: 200, lowpass: 1200 });
    },

    hideRabbit(mob) {
        const data = mob.userData;
        const r = data.rabbit;
        r.mode = 'hidden';
        r.sink = 1;
        r.upright = 0;
        // Out of sight and out of reach: below the ground under the burrow.
        data.hidden = true;
        mob.visible = false;
        this.rabbitSetReachable(mob, false);
        const burrow = data.burrow;
        if (burrow) mob.position.set(burrow.position.x, burrow.position.y - 1.4, burrow.position.z);
        r.timer = 6 + Math.random() * 10;
    },

    // Back above ground at `at` (its burrow).
    rabbitSurface(mob, at) {
        const data = mob.userData;
        const r = data.rabbit;
        data.hidden = false;
        mob.visible = true;
        this.rabbitSetReachable(mob, true);
        mob.position.set(at.x, at.y, at.z);
        if (r) {
            r.mode = 'idle';
            r.sink = 0;
            r.timer = 0.3;
            r.airborne = false;
        }
    },

    // Underground: wait until the coast is clear (and it is not night), peek out for a
    // moment, then come out.
    updateHiddenRabbit(mob, delta) {
        const data = mob.userData;
        const r = data.rabbit;
        const burrow = data.burrow;
        if (!burrow) {
            this.rabbitSurface(mob, mob.position.clone().setY(mob.position.y + 1.4));
            return;
        }
        // The model is rebuilt when the graphics mode changes.
        if (r.mode === 'hidden' && r.unreachableRoot !== data.modelRoot) this.rabbitSetReachable(mob, false);
        const danger = r.threat && (r.threat.flee || r.threat.distance < 7);
        if (r.mode === 'peek') {
            // Head and ears just above the hole, looking around.
            mob.position.set(burrow.position.x, burrow.position.y - 0.44, burrow.position.z);
            if (danger && r.threat.flee) {
                this.hideRabbit(mob);
                this.playNoiseBurst({ duration: 0.06, volume: this.rabbitVolume(mob, 0.01, 10), highpass: 300, lowpass: 1400 });
                return;
            }
            if (r.timer <= 0) {
                if (danger || this.rabbitDayPart() === 'night') {
                    this.hideRabbit(mob);
                    r.timer = 8 + Math.random() * 14;
                    return;
                }
                this.rabbitSurface(mob, burrow.position);
                r.facing = burrow.facing + Math.PI / 2 + (Math.random() - 0.5) * 2;
                this.rabbitHopSomewhere(mob, r.facing, 0.8, false);
                r.mode = 'hop';
                r.hops = 1 + Math.floor(Math.random() * 2);
            }
            return;
        }
        if (danger) r.timer = Math.max(r.timer, 3 + Math.random() * 3);
        if (r.timer > 0) return;
        const dayPart = this.rabbitDayPart();
        if (dayPart === 'night' && Math.random() < 0.85) {
            r.timer = 15 + Math.random() * 30;
            return;
        }
        if (dayPart === 'dusk' && Math.random() < 0.5) {
            r.timer = 10 + Math.random() * 20;
            return;
        }
        // Don't all come out at once.
        if (burrow.members.some((other) => other !== mob && other.userData.rabbit && other.userData.rabbit.mode === 'peek')) {
            r.timer = 1 + Math.random() * 2;
            return;
        }
        r.mode = 'peek';
        r.timer = 2 + Math.random() * 3;
        r.upright = 0.57;
        r.sink = 0;
        r.facing = Math.random() * Math.PI * 2;
        mob.visible = true;
        this.rabbitSetReachable(mob, true);
        data.hidden = true;
    },

    // Invisible meshes still catch the player's clicks, so a rabbit inside its burrow moves
    // its meshes to another layer: otherwise it would stop the player breaking the ground.
    rabbitSetReachable(mob, reachable) {
        const data = mob.userData;
        data.modelRoot.traverse((node) => { if (node.isMesh) node.layers.set(reachable ? 0 : 1); });
        data.rabbit.unreachableRoot = reachable ? null : data.modelRoot;
    },

    // Burrow upkeep: find (or dig) one when homeless, rebuild its model when the graphics
    // mode changes, and abandon it when the ground under it is gone.
    updateRabbitBurrow(mob, delta) {
        const data = mob.userData;
        const r = data.rabbit;
        const burrow = data.burrow;
        if (!burrow) {
            r.homeless -= delta;
            if (r.homeless > 0 || r.airborne) return;
            r.homeless = 2;
            const nearby = (this.rabbitBurrows || []).find((other) => other.members.length < 5 && other.position.distanceTo(mob.position) < 12);
            if (nearby) {
                this.joinRabbitBurrow(mob, nearby);
                return;
            }
            const spot = this.rabbitBurrowSpotNear(mob.position.x + (Math.random() - 0.5) * 3, mob.position.z + (Math.random() - 0.5) * 3, mob.position.y + 2, 2);
            if (spot) {
                this.joinRabbitBurrow(mob, this.createRabbitBurrow(spot));
                this.playNoiseBurst({ duration: 0.25, volume: this.rabbitVolume(mob, 0.012, 12), highpass: 150, lowpass: 900 });
            }
            return;
        }
        if (burrow.members[0] !== mob) return;
        if (burrow.hd !== Boolean(this.rtxModeEnabled)) this.buildRabbitBurrowModel(burrow);
    },

    // ---------------------------------------------------------------------------------------
    // Animation
    // ---------------------------------------------------------------------------------------

    animateRabbit(mob, delta, player) {
        const data = mob.userData;
        const r = data.rabbit;
        const parts = data.modelParts || {};
        const root = data.modelRoot;
        if (!root) return;
        const ease = (value, target, speed) => value + (target - value) * Math.min(1, delta * speed);
        const mode = r.mode;
        const grounded = !r.airborne;

        // Pose blends: sitting up, crouched low (nibbling, landing), stretched out in the air.
        const uprightTarget = mode === 'peek' ? 0.57 : grounded && mode === 'alert' ? 1 : grounded && mode === 'groom' ? 0.75 : 0;
        r.upright = ease(r.upright, uprightTarget, mode === 'peek' ? 20 : 6);
        r.crouch = ease(r.crouch, grounded && mode === 'nibble' ? 0.5 : 0, 8);
        const rise = r.velocity.y;
        r.stretch = ease(r.stretch, r.airborne ? (rise > 0 ? 1 : 0.4) : 0, 16);
        r.earBack = ease(r.earBack, mode === 'flee' || r.airborne ? 1 : mode === 'nibble' ? 0.35 : 0, 6);

        // Turn towards where it is heading (smoothly; snappier in flight).
        mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.PI / 2 - r.facing, Math.min(1, delta * (mode === 'flee' ? 16 : 8)));

        // Whole body pitch about the hind feet: nose up when sitting up or taking off, nose
        // down when landing or diving into the hole.
        const dive = mode === 'enter' ? r.sink : 0;
        const pitch = -RABBIT_UPRIGHT * r.upright + (r.airborne ? THREE.MathUtils.clamp(-rise * 0.07, -0.35, 0.45) : 0) + dive * 0.9;
        const cos = Math.cos(pitch);
        const sin = Math.sin(pitch);
        root.rotation.x = pitch;
        root.position.set(0,
            RABBIT_HIND_Y - (RABBIT_HIND_Y * cos - RABBIT_HIND_Z * sin) - r.crouch * 0.03 - dive * 0.5,
            RABBIT_HIND_Z - (RABBIT_HIND_Y * sin + RABBIT_HIND_Z * cos));
        // Breathing, quicker when frightened.
        if (parts.body) parts.body.scale.y = 1 + Math.sin(data.life * (mode === 'flee' || mode === 'alert' ? 9 : 3)) * 0.02;

        // Hind legs kick back in the air and stay planted when sitting up; front paws reach
        // forward in the air, tuck in when sitting up and wash the face when grooming.
        const groom = mode === 'groom' ? Math.sin(data.life * 9) * 0.35 : 0;
        ['L', 'R'].forEach((side, index) => {
            const haunch = parts[`haunch${side}`];
            const foot = parts[`foot${side}`];
            const leg = parts[`legF${side}`];
            if (haunch) haunch.rotation.x = -pitch * (1 - r.stretch) + r.stretch * 0.9 - r.crouch * 0.1;
            if (foot) foot.rotation.x = r.stretch * 0.5;
            if (leg) leg.rotation.x = -r.stretch * 1.1 + r.upright * (mode === 'groom' ? -1.4 - groom * (index ? -1 : 1) : 0.5) - r.crouch * 0.4;
        });

        // Head: nibbling bobs it down to the grass, sitting up keeps it level, and it looks
        // around (or at whatever it is watching).
        const head = data.head;
        if (head) {
            r.lookTimer -= delta;
            if (r.lookTimer <= 0) {
                r.lookTimer = 0.6 + Math.random() * 1.8;
                r.lookYaw = (Math.random() - 0.5) * (mode === 'alert' || mode === 'peek' ? 1.8 : 0.8);
            }
            let yaw = r.lookYaw;
            if (r.threat && (mode === 'alert' || mode === 'peek')) {
                const heading = Math.atan2(r.threat.position.z - mob.position.z, r.threat.position.x - mob.position.x);
                yaw = THREE.MathUtils.clamp(this.lerpAngle(0, (Math.PI / 2 - heading) - mob.rotation.y, 1), -1.3, 1.3);
            }
            if (!grounded || mode === 'flee') yaw = 0;
            r.chew = mode === 'nibble' ? r.chew + delta : 0;
            const nibble = mode === 'nibble' ? 0.55 + Math.max(0, Math.sin(r.chew * 2.2)) * 0.25 : 0;
            const level = -pitch * 0.8;
            head.rotation.y = ease(head.rotation.y, yaw, 7);
            head.rotation.x = ease(head.rotation.x, level + nibble + (mode === 'groom' ? 0.35 : 0), 10);
            if (mode === 'nibble' && Math.random() < delta * 2.5) this.rabbitNibble(mob, player);
        }

        // Nose twitches all the time, faster when sniffing the air or eating.
        if (parts.nose) {
            r.twitch += delta * (mode === 'alert' || mode === 'peek' || mode === 'nibble' ? 22 : 12);
            const twitch = Math.max(0, Math.sin(r.twitch)) * 0.12;
            parts.nose.position.y = (0.9 + twitch * 2) / 16;
            parts.nose.scale.set(1 + twitch, 1 - twitch * 0.5, 1);
        }

        // Ears: upright and swivelling on their own when alert, laid back when running.
        r.earTimer -= delta;
        if (r.earTimer <= 0) {
            r.earTimer = 0.4 + Math.random() * (mode === 'alert' || mode === 'peek' ? 0.8 : 2.5);
            const range = mode === 'alert' || mode === 'peek' ? 1.4 : 0.6;
            r.earYawTarget[0] = (Math.random() - 0.5) * range;
            r.earYawTarget[1] = Math.random() < 0.5 ? r.earYawTarget[0] : (Math.random() - 0.5) * range;
        }
        ['earL', 'earR'].forEach((name, index) => {
            const ear = parts[name];
            if (!ear) return;
            const base = ear.userData.baseRotation;
            const sign = index === 0 ? -1 : 1;
            r.earYaw[index] = ease(r.earYaw[index], r.earYawTarget[index], 9);
            const flick = Math.max(0, Math.sin(data.life * 1.7 + index * 2.3) - 0.96) * 10;
            const perk = mode === 'alert' || mode === 'peek' ? 0.15 : 0;
            ear.rotation.x = base.x - r.earBack * 1.1 + perk + flick * 0.3 - r.stretch * 0.2;
            ear.rotation.y = r.earYaw[index] * (1 - r.earBack);
            ear.rotation.z = base.z + sign * r.earBack * 0.12;
        });

        // The cotton tail flicks up when it runs.
        if (parts.tail) parts.tail.rotation.x = (r.stretch * 0.5 + (mode === 'flee' ? 0.4 : 0)) + Math.max(0, Math.sin(data.life * 2.3) - 0.95) * 3;
    },

    // ---------------------------------------------------------------------------------------
    // Sounds
    // ---------------------------------------------------------------------------------------

    rabbitVolume(mob, volume, range) {
        const player = this.getLocalPlayerPosition();
        const distance = Math.hypot(mob.position.x - player.x, mob.position.y - player.y + 1.4, mob.position.z - player.z);
        return distance >= range ? 0 : volume * (1 - distance / range);
    },

    // The alarm: a hind foot drummed hard against the ground.
    rabbitThump(mob, loudness) {
        const volume = this.rabbitVolume(mob, 0.05 * loudness, 22);
        if (volume <= 0) return;
        this.playTone({ frequency: 95, endFrequency: 55, duration: 0.08, type: 'sine', volume, release: 0.08 });
        this.playNoiseBurst({ duration: 0.05, volume: volume * 0.5, highpass: 60, lowpass: 380 });
    },

    // Soft pat on landing; fleeing rabbits drum harder.
    rabbitLanding(mob, fleeing) {
        const volume = this.rabbitVolume(mob, fleeing ? 0.014 : 0.008, fleeing ? 14 : 9);
        if (volume <= 0) return;
        this.playNoiseBurst({ duration: 0.035, volume, highpass: 120, lowpass: fleeing ? 900 : 600 });
        if (fleeing) this.playTone({ frequency: 120, endFrequency: 80, duration: 0.04, type: 'sine', volume: volume * 0.8, release: 0.04 });
    },

    // Tiny crunching while it eats.
    rabbitNibble(mob) {
        const volume = this.rabbitVolume(mob, 0.006, 5);
        if (volume <= 0) return;
        this.playNoiseBurst({ duration: 0.025, volume, highpass: 2200, lowpass: 6000 });
    },

    // A thin squeak when grabbed or struck.
    rabbitSqueak(mob, loudness) {
        const volume = this.rabbitVolume(mob, 0.03 * loudness, 18);
        if (volume <= 0) return;
        const tone = getMobSpecies('rabbit').tone * (0.9 + Math.random() * 0.2);
        this.playTone({ frequency: tone, endFrequency: tone * 1.35, duration: 0.09, type: 'triangle', volume, attack: 0.01, release: 0.05 });
        this.playTone({ frequency: tone * 2, endFrequency: tone * 2.4, duration: 0.06, type: 'sine', volume: volume * 0.4, attack: 0.01, release: 0.04 });
    },

    // Struck: a squeak, and the family runs for it.
    hitRabbit(mob) {
        const r = mob.userData.rabbit;
        if (!r || r.mode === 'hidden') return;
        this.rabbitSqueak(mob, 1);
        const from = this.camera.position.clone();
        if (r.mode === 'peek') {
            this.hideRabbit(mob);
            return;
        }
        if (r.mode === 'enter') return;
        // Bowled over a little, then off.
        if (!r.airborne) {
            const away = Math.atan2(mob.position.z - from.z, mob.position.x - from.x);
            r.velocity.set(Math.cos(away) * 2.5, 4, Math.sin(away) * 2.5);
            r.airborne = true;
        }
        this.startRabbitFlight(mob, from);
        r.flee = 6;
        this.alarmRabbits(mob, from);
    }
});

// Leaving the world (despawned far away, caught by a fox...): its burrow goes with the last
// rabbit that lived in it.
onMobEvent('removed', function (mob) {
    if (mob.userData.species !== 'rabbit' || !mob.userData.burrow) return;
    const burrow = mob.userData.burrow;
    burrow.members = burrow.members.filter((other) => other !== mob);
    mob.userData.burrow = null;
    if (burrow.members.length === 0) this.removeRabbitBurrow(burrow);
});

registerMobBehaviour('burrow', {
    update(mob, delta, player) { this.updateRabbit(mob, delta, player); },
    interact(mob) { this.hitRabbit(mob); },
    spawnCommand(species, x, z, player) { return this.spawnRabbitsFromCommand(x, z, player); },
    spawnForChunk(chunkX, chunkZ, biome) { this.spawnRabbitsForChunk(chunkX, chunkZ, biome); }
});
