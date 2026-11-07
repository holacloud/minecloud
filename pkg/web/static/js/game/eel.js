// Electric eels (task #14). A long, dark olive fish with a yellowish belly that lives alone in
// deep water (lakes and rivers at least two blocks deep), rare (at most 2) and more common at
// night. It cruises slowly along the bottom, rests, and every minute or so rises to gulp air
// at the surface (real electric eels breathe air). Touching it, swimming into it or striking
// it makes it discharge: blue arcs crackle through the water, the player takes 2 damage when
// in the water within ~3 blocks (1 out of the water right next to it), and nearby fish
// schools bolt. A discharge needs a few seconds to recharge. Three bare-handed blows defeat it.
//
// The body is a chain of segments that follow the head's 3D path (a trail of points, as in
// snake.js), so its turns become the body's waves; a ribbon fin along the belly ripples. In
// Ultra a faint blue flicker runs along the body.
//
// Energy: right click an eel with an empty bucket to catch it (eel_bucket). Use the eel bucket
// on an eel_tank block to put it in (the block becomes `eel_tank:full`): a living generator
// of the electricity network (pkg/network/power.go, source 'eel'), 25 W steady, 50 W for
// a while after it eats raw fish (right click the tank with raw_fish: `powerFeed`). An empty
// bucket on a full tank takes the eel back; the eel bucket used on deep water releases it.
// Breaking a full tank lets the eel flop out. The eel in a tank is a small looping animation
// (a client-side mesh found by scanning the chunks near the player).
// Movement mode 'eel'; mixed into Game.prototype and hooked in via js/extensions.js.

const EEL_SEGMENT_UNITS = 3;
const EEL_SPACING = EEL_SEGMENT_UNITS / 16;
const EEL_SEGMENTS = 10;
const EEL_WIDTHS = [3, 3.1, 3.1, 3, 2.9, 2.7, 2.4, 2, 1.6, 1.1];
const EEL_CRUISE = 0.55;
const EEL_FLEE = 2.2;
const EEL_CLIMB = 0.8;
const EEL_HOME_RANGE = 8;
// Seconds between breaths (real ones surface every few minutes; game time is fast).
const EEL_BREATH = [45, 80];
const EEL_RECHARGE = 3.5;
// Discharge reach: in the water, and out of it (next to the eel).
const EEL_SHOCK_WATER = 3;
const EEL_SHOCK_AIR = 1.6;
const EEL_TOUCH = 0.75;
const EEL_FISH_STUN = 4.5;
const EEL_STRANDED_LIFE = 60;
const EEL_CATCH_RANGE = 4.5;
// Eel tanks: chunks scanned around the player, seconds between scans, size of the tank eel.
const EEL_TANK_CHUNKS = 2;
const EEL_TANK_SCAN = 1;
const EEL_TANK_SCALE = 0.34;
const EEL_FEED_SECONDS = 10;

MOB_SPECIES.eel = {
    eggColor: 0x4a4a2c, tone: 140, maxHealth: 12, speed: EEL_CRUISE, group: [1, 1], limit: 2, movement: 'eel'
};
VoxelModels.MOB_SURFACES.eel = 'skin';

// Faces +z. Body segments are top-level parts placed every frame by eelPlaceChain, each
// pivoted at its front joint and reaching back to the next one.
VoxelModels.mobBuilders.eel = function (b) {
    const back = 0x353a24;
    const side = 0x4a4a2c;
    const belly = 0xd8b04a;
    const throat = 0xd9772e;
    const fin = 0x6a5a34;
    const S = EEL_SEGMENT_UNITS;

    const segmentPaint = (index) => ({
        color: side, noise: 0.07, bevel: 0.14,
        all: (p, face) => {
            if (face === 'front' || face === 'back') return;
            if (face === 'bottom') {
                p.fill(index < 2 ? throat : belly, 0.05);
                return;
            }
            if (face === 'top') {
                p.fill(back, 0.06);
                p.spots(0x5a5a3a, 2, 0.4, 0.8, index);
                return;
            }
            // Sides: darker back, faint pale speckles, the yellow belly showing low down.
            p.rect(0, 0, p.w, p.h * 0.35, back, 0.05);
            p.spots(0x76765a, 2, 0.3, 0.6, index + 7);
            p.rect(0, p.h * 0.72, p.w, p.h * 0.28, index < 2 ? throat : belly, 0.05);
        }
    });

    for (let i = 0; i < EEL_SEGMENTS; i++) {
        const w = EEL_WIDTHS[i];
        const h = w * 0.9;
        b.part(`seg${i}`, { pivot: [0, 0, -i * S], from: [-w / 2, -h / 2, -S - 0.4], size: [w, h, S + 0.8], paint: segmentPaint(i) });
        // The long ribbon fin under the body (electric eels are knifefish: it is how they swim).
        if (i >= 2) {
            b.part(`fin${i}`, { parent: `seg${i}`, pivot: [0, -h / 2, 0], from: [-0.2, -1.1, -S - 0.4], size: [0.4, 1.1, S + 0.8], paint: { color: fin, noise: 0.05, bevel: 0 } });
        }
    }
    b.part('tailTip', { parent: `seg${EEL_SEGMENTS - 1}`, pivot: [0, 0, -S - 0.2], from: [-0.3, -0.5, -1.6], size: [0.6, 1, 1.6], paint: { color: side, noise: 0.05 } });

    // A broad, flat head with a wide mouth and tiny eyes far forward.
    b.part('head', {
        pivot: [0, 0, 0], from: [-1.7, -1.3, -0.6], size: [3.4, 2.5, 4.4],
        paint: {
            color: side, noise: 0.06, bevel: 0.16,
            faces: {
                top: (p) => { p.fill(back, 0.05); p.spots(0x5a5a3a, 3, 0.3, 0.6, 3); },
                bottom: (p) => p.fill(throat, 0.05),
                left: (p) => { p.rect(0, 0, p.w, 0.8, back, 0.04); p.rect(0, 1.7, p.w, 0.8, throat, 0.04); p.rect(p.w - 2.2, 1.45, 2.2, 0.2, 0x1a1a10, 0); },
                right: (p) => { p.rect(0, 0, p.w, 0.8, back, 0.04); p.rect(0, 1.7, p.w, 0.8, throat, 0.04); p.rect(0, 1.45, 2.2, 0.2, 0x1a1a10, 0); },
                front: (p) => { p.rect(0, 0, p.w, 0.8, back, 0.04); p.rect(0.4, 1.45, p.w - 0.8, 0.25, 0x1a1a10, 0); p.rect(0, 1.7, p.w, 0.8, throat, 0.04); }
            }
        }
    });
    [['L', 1], ['R', -1]].forEach(([name, sign]) => {
        b.part(`eye${name}`, {
            parent: 'head', pivot: [1.55 * sign, 0.55, 2.9], from: [-0.3, -0.3, -0.3], size: [0.6, 0.6, 0.6],
            paint: { color: 0x0d0c08, noise: 0, bevel: 0, faces: { top: (p) => p.rect(0, 0, 0.3, 0.3, 0x9a9a7a, 0) } }
        });
        // Small pectoral fins behind the head.
        b.part(`pec${name}`, { parent: 'head', pivot: [1.6 * sign, -0.3, 0.2], from: [sign > 0 ? 0 : -1.4, -0.1, -1], size: [1.4, 0.2, 1.2], paint: { color: fin, noise: 0.04, bevel: 0 } });
    });
    return { head: 'head', wings: ['pecL', 'pecR'] };
};

registerMobBehaviour('eel', {
    update(mob, delta, player) { this.eelUpdate(mob, delta, player); },
    interact(mob) { this.eelStruck(mob); },
    spawnCommand(species, x, z, player) { return this.eelSpawnCommand(x, z, player); },
    spawnEgg(species, position) { return this.eelSpawnEgg(position); },
    spawnForChunk(chunkX, chunkZ, biome) { this.eelSpawnForChunk(chunkX, chunkZ, biome); }
});

onMobEvent('removed', function (mob) {
    const e = mob.userData.eel;
    if (e && e.flicker) {
        this.scene.remove(e.flicker);
        e.flicker.geometry.dispose();
        e.flicker = null;
    }
});

// A right click with an empty bucket on a wild eel (aimed at its body).
registerMobUseHandler(function (mob, item) {
    if (item !== 'bucket' || mob.userData.species !== 'eel') return false;
    return this.eelCatch(mob);
});

// Buckets, eel buckets and raw fish on eels and tanks. First in the list, so the bucket does
// not try to scoop water instead (eels are thin and hard to aim at: a near miss counts).
ITEM_USE_HANDLERS.unshift(function (item, hit) {
    return this.eelHandleUse(item, hit);
});

// A full tank broken by the player: the eel flops out.
registerBlockBreakHandler(function (blockType, position) {
    if (blockType !== 'eel_tank:full') return;
    const mob = this.eelSpawn(new THREE.Vector3(position.x + 0.5, position.y + 0.3, position.z + 0.5));
    if (mob) this.receiveSystemMessage({ text: 'The eel flops out of the broken tank. Catch it with a bucket!' });
});

// Discharge arcs, the tank eels and the Ultra flicker.
registerFrameUpdate(function (delta) {
    this.eelFrame(delta);
});

// ---------------------------------------------------------------------------------------
// Blocks and items

registerTexturePattern('eel_tank', (f, s, tint, seed) => {
    const frame = f.rgb(0x3a4046);
    const copper = f.rgb(0xc87533);
    const water = f.rgb(0x5aa6d6);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        const edge = Math.min(u, 1 - u, v, 1 - v);
        if (edge < 1.5 * px) {
            f.put(s, x, y, f.tone(s, frame, (f.hash(x, y, seed) - 0.5) * 0.1), 0.8);
            return;
        }
        // Copper electrode plates in the bottom corners (they collect the current).
        if (v > 0.8 && (u < 0.16 || u > 0.84)) {
            f.put(s, x, y, f.tone(s, copper, (f.hash(x, y, seed) - 0.5) * 0.12), 0.6);
            return;
        }
        let k = 0.15 - v * 0.2 + (f.hash(x, y, seed) - 0.5) * 0.04;
        // A few bubbles and the shine of the glass.
        const bubble = [[0.3, 0.3], [0.62, 0.55], [0.45, 0.72]].some(([bu, bv]) => Math.hypot(u - bu, v - bv) < 0.035);
        if (bubble) k += 0.35;
        if (Math.abs(u - v + 0.3) < 0.04) k += 0.2;
        f.put(s, x, y, f.tone(s, water, k), 0.3);
    });
});

const EEL_TANK_FACES = { top: 'eel_tank', side: 'eel_tank', bottom: 'eel_tank' };
registerBlockType('eel_tank', {
    color: 0x5AA6D6, name: 'Eel Tank', transparent: true, opacity: 0.6, lightPasses: true, breakDuration: 0.4,
    category: 'electric', electric: true, faces: EEL_TANK_FACES
});
registerBlockType('eel_tank:full', {
    color: 0x5AA6D6, name: 'Eel Tank', transparent: true, opacity: 0.6, lightPasses: true, breakDuration: 0.4,
    category: 'electric', electric: true, faces: EEL_TANK_FACES, variantOf: 'eel_tank', dropType: 'eel_tank'
});

const EEL_BUCKET_SPRITE = [
    '............',
    '..IIIIIIII..',
    '.I...EE...I.',
    '.IWEyWWEEWI.',
    '.IGGGGGGGGI.',
    '.IGiiiiiiGI.',
    '..IGGGGGGI..',
    '..IGiiiiGI..',
    '..IGGGGGGI..',
    '...IGGGGI...',
    '...IIIIII...',
    '............'
];
registerItemType('eel_bucket', {
    color: 0x4a4a2c, name: 'Eel Bucket',
    drawIcon: resourcesDrawSprite(EEL_BUCKET_SPRITE, { I: 0x5a5f66, G: 0xa9afb7, i: 0xcfd4da, W: 0x3d85c6, E: 0x4a4a2c, y: 0xd8b04a }),
    displayMesh: resourcesDisplayMesh
});

registerGameContent(function ({ addRecipe }) {
    addRecipe('eel_tank', 'Build Eel Tank', 'eel_tank', 1, [{ type: 'glass', amount: 4 }, { type: 'water_bucket', amount: 1 }, { type: 'copper_wire', amount: 2 }]);
});

// ---------------------------------------------------------------------------------------

const _eelLocalA = new THREE.Vector3();
const _eelLocalB = new THREE.Vector3();
const _eelPoint = new THREE.Vector3();
const _eelPoint2 = new THREE.Vector3();

Object.assign(Game.prototype, {
    // ---- Spawning ----------------------------------------------------------------------

    eelCount() {
        return this.ambientMobs.filter((mob) => mob.userData.species === 'eel').length;
    },

    // A new eel at `position` (in water or, out of a broken tank, on land).
    eelSpawn(position, natural = false) {
        const mob = this.createMob('eel', position);
        mob.userData.natural = natural;
        this.ambientMobs.push(mob);
        this.eelState(mob);
        return mob;
    },

    // Head on the bed of a water column found by findWaterColumn.
    eelSpawnInColumn(column, natural = false) {
        return this.eelSpawn(new THREE.Vector3(column.x, column.bed + 0.3, column.z), natural);
    },

    // Rare, alone, in deep water; more often at night.
    eelSpawnForChunk(chunkX, chunkZ) {
        const chance = this.isNightTime() ? 0.07 : 0.025;
        if (this.chunkRandom(chunkX, chunkZ, 641) > chance) return;
        if (this.eelCount() >= MOB_SPECIES.eel.limit) return;
        const size = this.world.chunkSize;
        for (let attempt = 0; attempt < 5; attempt++) {
            const x = chunkX * size + 2 + this.chunkRandom(chunkX, chunkZ, 642 + attempt) * (size - 4);
            const z = chunkZ * size + 2 + this.chunkRandom(chunkX, chunkZ, 652 + attempt) * (size - 4);
            const column = this.findWaterColumn(x, z, 0, 64);
            if (!column) continue;
            const mob = this.eelSpawnInColumn(column, true);
            mob.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
            return;
        }
    },

    eelSpawnCommand(x, z, player) {
        const column = this.findWaterColumn(x, z, 10, player.y + 4);
        if (!column) {
            this.receiveSystemMessage({ text: 'Electric eels need water at least two blocks deep nearby' });
            return true;
        }
        this.eelSpawnInColumn(column);
        this.receiveSystemMessage({ text: 'Spawned an electric eel. Do not touch it!' });
        return true;
    },

    eelSpawnEgg(position) {
        const column = this.findWaterColumn(position.x + 0.5, position.z + 0.5, 3, position.y + 2);
        if (!column) {
            this.receiveSystemMessage({ text: 'Eel eggs must be placed in deep water' });
            return true;
        }
        this.eelSpawnInColumn(column);
        this.consumeSelectedBlock();
        this.placeActionTimer = 0.35;
        this.showHitIndicator();
        return true;
    },

    eelState(mob) {
        const data = mob.userData;
        const heading = data.direction ?? Math.random() * Math.PI * 2;
        const e = {
            mode: 'cruise', timer: 2 + Math.random() * 4, heading, facing: heading, wave: Math.random() * Math.PI * 2,
            target: mob.position.clone(), retarget: 0, breath: EEL_BREATH[0] * Math.random() + 10, gulp: 0,
            cooldown: 0, stranded: 0, flop: 0, speed: 0, trail: [],
            joints: Array.from({ length: EEL_SEGMENTS + 1 }, () => new THREE.Vector3()), flicker: null
        };
        data.eel = e;
        // A straight body behind the head.
        for (let i = 1; i <= EEL_SEGMENTS + 3; i++) {
            e.trail.push({ x: mob.position.x - Math.cos(heading) * i * EEL_SPACING, y: mob.position.y, z: mob.position.z - Math.sin(heading) * i * EEL_SPACING });
        }
        return e;
    },

    // ---- Per frame ---------------------------------------------------------------------

    eelUpdate(mob, delta, player) {
        const data = mob.userData;
        const e = data.eel || this.eelState(mob);
        const position = mob.position;
        data.life += delta;
        e.cooldown = Math.max(0, e.cooldown - delta);
        e.timer -= delta;

        const swimming = this.isSwimmable(position.x, position.y, position.z);
        let speed = 0;
        if (!swimming) {
            speed = this.eelStranded(mob, e, delta);
            if (!mob.parent) return;
        } else {
            e.stranded = 0;
            const surface = this.findWaterSurface(position.x, position.y, position.z);
            const bed = this.cameraController.getFloorY(position.x, position.z, position.y + 0.5);
            e.breath -= delta;
            if (e.mode !== 'flee' && e.mode !== 'breathe' && e.breath <= 0) {
                e.mode = 'breathe';
                e.gulp = 0;
                e.timer = 0;
            }
            speed = this.eelSwim(mob, e, delta, player, surface, bed);
        }
        e.speed = speed;
        this.eelRecordTrail(mob);

        const yaw = Math.PI / 2 - e.facing;
        mob.rotation.y = this.lerpAngle(mob.rotation.y, yaw, Math.min(1, delta * 6));
        this.eelPose(mob, delta);
        this.eelCheckTouch(mob, player);
    },

    // Swimming: along the bottom, resting, rising to breathe or fleeing. Returns the speed.
    eelSwim(mob, e, delta, player, surface, bed) {
        const position = mob.position;
        let speed = 0;
        let targetY = bed + 0.28;
        if (e.mode === 'flee') {
            speed = EEL_FLEE;
            e.target.set(position.x * 2 - player.x, position.y, position.z * 2 - player.z);
            if (e.timer <= 0) { e.mode = 'cruise'; e.timer = 3 + Math.random() * 4; }
        } else if (e.mode === 'breathe') {
            // Up to the surface, a gulp of air, then back down.
            speed = EEL_CRUISE * 0.6;
            if (surface !== null) {
                // Just under the surface (isSwimmable stops a little below it).
                targetY = surface - 0.18;
                if (e.gulp === 0 && position.y >= targetY - 0.08) {
                    e.gulp = 1.2;
                    this.eelGulp(mob, surface);
                }
            }
            if (e.gulp === 0 && e.timer < -20) {
                // Something above blocks the way up: try again later.
                e.mode = 'cruise';
                e.timer = 3;
                e.breath = 15;
            } else if (e.gulp > 0) {
                speed = 0.15;
                e.gulp -= delta;
                if (e.gulp <= 0) {
                    e.mode = 'cruise';
                    e.timer = 4 + Math.random() * 5;
                    e.breath = EEL_BREATH[0] + Math.random() * (EEL_BREATH[1] - EEL_BREATH[0]);
                    e.gulp = 0;
                }
            }
        } else if (e.mode === 'rest') {
            // Lying still on the bottom, only the fin rippling.
            if (e.timer <= 0) { e.mode = 'cruise'; e.timer = 6 + Math.random() * 8; e.retarget = 0; }
        } else {
            speed = EEL_CRUISE;
            e.retarget -= delta;
            if (e.retarget <= 0 || Math.hypot(e.target.x - position.x, e.target.z - position.z) < 0.6) this.eelPickTarget(mob, e);
            if (e.timer <= 0) { e.mode = 'rest'; e.timer = 4 + Math.random() * 8; }
        }
        if (surface !== null) targetY = Math.min(targetY, surface - 0.18);

        if (speed > 0) {
            const goal = Math.atan2(e.target.z - position.z, e.target.x - position.x);
            e.heading = this.lerpAngle(e.heading, goal, Math.min(1, delta * (e.mode === 'flee' ? 4 : 1.5)));
            e.wave += speed * delta * Math.PI * 2 / 1.6;
            const move = e.heading + Math.sin(e.wave) * (e.mode === 'flee' ? 0.18 : 0.28);
            e.facing = move;
            const step = speed * delta;
            const nx = position.x + Math.cos(move) * step;
            const nz = position.z + Math.sin(move) * step;
            const ahead = 0.3;
            if (this.isSwimmable(nx + Math.cos(move) * ahead, position.y, nz + Math.sin(move) * ahead) && this.isSwimmable(nx, position.y, nz)) {
                position.x = nx;
                position.z = nz;
            } else {
                // A wall or the bank: turn away and look for somewhere else.
                e.heading += Math.PI * (0.5 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1);
                e.target.set(position.x + Math.cos(e.heading) * 4, position.y, position.z + Math.sin(e.heading) * 4);
                e.retarget = 2;
            }
        }
        const dy = targetY - position.y;
        const ny = position.y + Math.sign(dy) * Math.min(Math.abs(dy), EEL_CLIMB * delta);
        if (this.isSwimmable(position.x, ny, position.z)) position.y = ny;
        return speed;
    },

    // Somewhere along the bottom within its home range.
    eelPickTarget(mob, e) {
        const home = mob.userData.home;
        e.retarget = 6 + Math.random() * 6;
        for (let attempt = 0; attempt < 8; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 2 + Math.random() * EEL_HOME_RANGE;
            const x = home.x + Math.cos(angle) * distance;
            const z = home.z + Math.sin(angle) * distance;
            const bed = this.cameraController.getFloorY(x, z, mob.position.y + 2);
            if (bed > -20 && this.isSwimmable(x, bed + 0.3, z)) {
                e.target.set(x, bed + 0.3, z);
                return;
            }
        }
        e.target.set(mob.position.x + Math.cos(e.heading) * 3, mob.position.y, mob.position.z + Math.sin(e.heading) * 3);
    },

    // Its water is gone (or it came out of a broken tank): it lies on the ground, flopping now
    // and then, slides back into water next to it and dies after a minute.
    eelStranded(mob, e, delta) {
        const position = mob.position;
        e.stranded += delta;
        const floor = this.cameraController.getFloorY(position.x, position.z, position.y + 0.5);
        if (floor > -20 && position.y > floor + 0.15) position.y = Math.max(floor + 0.15, position.y - 6 * delta);
        e.flop -= delta;
        if (e.flop <= 0) {
            e.flop = 0.8 + Math.random() * 1.2;
            e.heading += (Math.random() - 0.5) * 2;
            e.facing = e.heading;
            const nx = position.x + Math.cos(e.heading) * 0.25;
            const nz = position.z + Math.sin(e.heading) * 0.25;
            const nextFloor = this.cameraController.getFloorY(nx, nz, position.y + 0.6);
            if (Math.abs(nextFloor - floor) <= 1.1) position.set(nx, nextFloor + 0.15, nz);
            this.playNoiseBurst({ duration: 0.05, volume: 0.012, highpass: 300, lowpass: 1600 });
            // Water right next to it: back in it goes.
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                if (this.isSwimmable(position.x + dx, position.y - 0.4, position.z + dz)) {
                    position.set(position.x + dx, position.y - 0.4, position.z + dz);
                    mob.userData.home.copy(position);
                    break;
                }
            }
        }
        if (e.stranded > EEL_STRANDED_LIFE) {
            this.removeMob(mob);
            return 0;
        }
        return 0;
    },

    // At the surface: a gulp of air (ripples, a splash and a pop).
    eelGulp(mob, surface) {
        const position = mob.position;
        this.world.addRipple(position.x, position.z, 0.45);
        const player = this.getLocalPlayerPosition();
        const distance = Math.hypot(position.x - player.x, surface - player.y, position.z - player.z);
        if (distance > 20) return;
        this.spawnSplash(position.x, surface, position.z, 0.15);
        const volume = 1 - distance / 20;
        this.playTone({ frequency: 260, endFrequency: 110, duration: 0.12, type: 'sine', volume: 0.025 * volume, release: 0.08 });
        this.playNoiseBurst({ duration: 0.08, volume: 0.012 * volume, highpass: 500, lowpass: 2200 });
    },

    eelRecordTrail(mob) {
        const e = mob.userData.eel;
        const position = mob.position;
        const last = e.trail[0];
        if (last && Math.hypot(position.x - last.x, position.y - last.y, position.z - last.z) < 0.04) return;
        e.trail.unshift({ x: position.x, y: position.y, z: position.z });
        let length = 0;
        let prev = position;
        for (let i = 0; i < e.trail.length; i++) {
            const point = e.trail[i];
            length += Math.hypot(point.x - prev.x, point.y - prev.y, point.z - prev.z);
            prev = point;
            if (length > (EEL_SEGMENTS + 1) * EEL_SPACING + 0.3) {
                e.trail.length = i + 1;
                break;
            }
        }
    },

    eelSampleTrail(mob, distance, out) {
        const e = mob.userData.eel;
        let prev = mob.position;
        let remaining = distance;
        for (const point of e.trail) {
            const length = Math.hypot(point.x - prev.x, point.y - prev.y, point.z - prev.z);
            if (length >= remaining && length > 0) {
                const t = remaining / length;
                return out.set(prev.x + (point.x - prev.x) * t, prev.y + (point.y - prev.y) * t, prev.z + (point.z - prev.z) * t);
            }
            remaining -= length;
            prev = point;
        }
        return out.set(prev.x - Math.cos(e.heading) * remaining, prev.y, prev.z - Math.sin(e.heading) * remaining);
    },

    // Joints along the trail, then the segments placed between them.
    eelPose(mob, delta) {
        const data = mob.userData;
        const e = data.eel;
        const position = mob.position;
        for (let k = 0; k <= EEL_SEGMENTS; k++) this.eelSampleTrail(mob, k * EEL_SPACING, e.joints[k]);
        const ry = mob.rotation.y;
        const c = Math.cos(ry);
        const sn = Math.sin(ry);
        if (!e.local) e.local = e.joints.map(() => new THREE.Vector3());
        const local = e.local;
        e.joints.forEach((joint, k) => {
            const wx = joint.x - position.x;
            const wz = joint.z - position.z;
            local[k].set(c * wx - sn * wz, joint.y - position.y, sn * wx + c * wz);
        });
        this.eelPlaceChain(data.modelParts, local, data.life, e.speed);
        if (data.healthBar) data.healthBar.position.set(local[0].x, local[0].y + 0.5, local[0].z);
    },

    // Places the segments and the head of an eel model between joints given in the model's
    // frame (block units for a mob, scaled for the tank eel). Also ripples the fins.
    eelPlaceChain(parts, joints, life, speed) {
        const a = _eelLocalA;
        const b = _eelLocalB;
        for (let k = 0; k < EEL_SEGMENTS; k++) {
            const segment = parts[`seg${k}`];
            if (!segment) continue;
            a.copy(joints[k]);
            b.copy(joints[k + 1]);
            const ddx = a.x - b.x;
            const ddy = a.y - b.y;
            const ddz = a.z - b.z;
            const flat = Math.hypot(ddx, ddz);
            segment.position.copy(a);
            segment.rotation.order = 'YXZ';
            segment.rotation.set(-Math.atan2(ddy, flat), Math.atan2(ddx, ddz), 0);
            segment.scale.z = Math.min(2.4, Math.max(0.6, Math.hypot(flat, ddy) / EEL_SPACING));
            const fin = parts[`fin${k}`];
            if (fin) fin.rotation.z = Math.sin(life * (4 + speed * 4) - k * 0.9) * 0.45;
        }
        const head = parts.head;
        if (head) {
            a.copy(joints[0]);
            b.copy(joints[1]);
            const ddx = a.x - b.x;
            const ddy = a.y - b.y;
            const ddz = a.z - b.z;
            head.position.copy(a);
            head.rotation.order = 'YXZ';
            head.rotation.set(-Math.atan2(ddy, Math.max(0.02, Math.hypot(ddx, ddz))), Math.atan2(ddx, ddz), 0);
        }
        ['pecL', 'pecR'].forEach((name, index) => {
            if (parts[name]) parts[name].rotation.z = Math.sin(life * 5 + index * Math.PI) * 0.35;
        });
    },

    // ---- Discharges ---------------------------------------------------------------------

    // Nearest distance from the player's body (feet to eyes) to the eel's joints.
    eelPlayerDistance(mob, player) {
        const e = mob.userData.eel;
        const feet = player.y - this.cameraController.eyeHeight;
        let best = Infinity;
        for (const joint of e.joints) {
            const y = Math.min(Math.max(joint.y, feet + 0.2), player.y - 0.1);
            const d = Math.hypot(joint.x - player.x, joint.y - y, joint.z - player.z);
            if (d < best) best = d;
        }
        return best;
    },

    // Touching it, or swimming into it, sets it off.
    eelCheckTouch(mob, player) {
        const e = mob.userData.eel;
        if (e.cooldown > 0 || this.titleScreenOpen || this.respawnPending) return;
        if (Math.hypot(mob.position.x - player.x, mob.position.z - player.z) > 4) return;
        if (this.eelPlayerDistance(mob, player) < EEL_TOUCH) this.eelDischarge(mob, true);
    },

    // The shock: arcs through the water, damage to a player close enough, fish scattering.
    eelDischarge(mob, provoked) {
        const e = mob.userData.eel;
        if (!e || e.cooldown > 0) return false;
        e.cooldown = EEL_RECHARGE;
        const player = this.getLocalPlayerPosition();
        const distance = this.eelPlayerDistance(mob, player);
        const playerInWater = Boolean(this.cameraController.isInWater);
        const eelInWater = this.isSwimmable(mob.position.x, mob.position.y, mob.position.z);
        let damage = 0;
        if (eelInWater && playerInWater && distance <= EEL_SHOCK_WATER) damage = 2;
        else if (distance <= EEL_SHOCK_AIR) damage = 1;
        if (damage > 0 && !this.titleScreenOpen && !this.respawnPending) {
            // A discharge through the water or the air has no front: no source, so a shield does nothing.
            this.applyDamage(damage, 'You were shocked by an electric eel', 'mob');
        }
        this.eelSpawnArcs(mob, damage > 0 ? player : null, eelInWater);
        this.eelCrackle(mob, distance);
        // Fish nearby are stunned and the schools bolt.
        const origin = mob.position;
        this.ambientMobs.forEach((other) => {
            if (other.userData.species !== 'fish' || !other.userData.school) return;
            if (other.position.distanceTo(origin) > EEL_FISH_STUN) return;
            this.startleSchool(other, origin);
            if (other.userData.velocity) other.userData.velocity.multiplyScalar(0.1);
        });
        if (provoked && eelInWater) {
            e.mode = 'flee';
            e.timer = 3 + Math.random() * 2;
        }
        return true;
    },

    // A crackle: a thump and a burst of sharp clicks over a third of a second.
    eelCrackle(mob, distance) {
        const volume = Math.max(0, 1 - distance / 24);
        if (volume <= 0) return;
        this.playTone({ frequency: 70, endFrequency: 45, duration: 0.3, type: 'sawtooth', volume: 0.02 * volume, release: 0.12 });
        this.eelCrackles = this.eelCrackles || [];
        for (let i = 0; i < 7; i++) this.eelCrackles.push({ at: i * 0.045 + Math.random() * 0.03, volume });
    },

    eelArcMaterial() {
        if (!this.eelArcMat) {
            this.eelArcMat = new THREE.LineBasicMaterial({ color: 0x9fe4ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
            this.eelFlickerMat = new THREE.LineBasicMaterial({ color: 0x6fc8ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 32;
            const ctx = canvas.getContext('2d');
            const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
            gradient.addColorStop(0, 'rgba(220,245,255,1)');
            gradient.addColorStop(0.3, 'rgba(120,200,255,0.5)');
            gradient.addColorStop(1, 'rgba(60,140,255,0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 32, 32);
            this.eelGlowTexture = new THREE.CanvasTexture(canvas);
        }
        return this.eelArcMat;
    },

    // Jagged bolts from the body outwards (and to the player when hit), plus a blue glow.
    eelSpawnArcs(mob, player, inWater) {
        const material = this.eelArcMaterial();
        const e = mob.userData.eel;
        const ends = [];
        const count = inWater ? 9 : 5;
        for (let i = 0; i < count; i++) {
            const from = e.joints[Math.floor(Math.random() * e.joints.length)].clone();
            const reach = inWater ? 1.2 + Math.random() * 1.8 : 0.5 + Math.random() * 0.7;
            const angle = Math.random() * Math.PI * 2;
            const to = from.clone().add(new THREE.Vector3(Math.cos(angle) * reach, (Math.random() - 0.3) * reach * 0.6, Math.sin(angle) * reach));
            ends.push([from, to]);
        }
        if (player) {
            const feet = player.y - this.cameraController.eyeHeight;
            ends.push([e.joints[2].clone(), new THREE.Vector3(player.x, feet + 0.7, player.z)]);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(ends.length * 6 * 2 * 3), 3));
        const lines = new THREE.LineSegments(geometry, material.clone());
        lines.frustumCulled = false;
        lines.renderOrder = 1200;
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.eelGlowTexture, color: 0x8fd8ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
        glow.position.copy(e.joints[3]);
        glow.scale.setScalar(inWater ? 4.5 : 2.2);
        glow.renderOrder = 1199;
        this.scene.add(lines);
        this.scene.add(glow);
        this.eelArcs = this.eelArcs || [];
        const arc = { lines, glow, ends, life: 0.45, age: 0, jitter: 0 };
        this.eelJitterArc(arc);
        this.eelArcs.push(arc);
    },

    // New jagged paths for every bolt (they flicker while the discharge lasts).
    eelJitterArc(arc) {
        const positions = arc.lines.geometry.attributes.position;
        let index = 0;
        arc.ends.forEach(([from, to]) => {
            const length = from.distanceTo(to);
            let prev = from.clone();
            for (let s = 1; s <= 6; s++) {
                const point = from.clone().lerp(to, s / 6);
                if (s < 6) point.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(length * 0.25));
                positions.setXYZ(index++, prev.x, prev.y, prev.z);
                positions.setXYZ(index++, point.x, point.y, point.z);
                prev = point;
            }
        });
        positions.needsUpdate = true;
    },

    // ---- The player --------------------------------------------------------------------

    eelStruck(mob) {
        const e = mob.userData.eel || this.eelState(mob);
        // Struck, it always fights back with a shock if it has the charge.
        this.eelDischarge(mob, true);
        const tone = MOB_SPECIES.eel.tone;
        if (this.damageMobByPlayer(mob)) {
            this.playTone({ frequency: tone * 1.5, endFrequency: tone * 0.6, duration: 0.25, type: 'triangle', volume: 0.02, release: 0.12 });
            this.defeatMobByPlayer(mob, 'You defeated the electric eel');
            return;
        }
        this.playNoiseBurst({ duration: 0.08, volume: 0.02, highpass: 300, lowpass: 1800 });
        if (e.stranded === 0) {
            e.mode = 'flee';
            e.timer = Math.max(e.timer, 4);
        }
    },

    // An empty bucket swoops the eel up with its water.
    eelCatch(mob) {
        if (!mob.parent || this.getInventoryCount('bucket') <= 0) return false;
        const position = mob.position;
        this.removeMob(mob);
        this.bucketSwap('bucket', (TRAPS_SPECIES.eel && TRAPS_SPECIES.eel.bucket) || 'eel_bucket');
        this.spawnSplash(position.x, position.y + 0.3, position.z, 0.3);
        this.world.addRipple(position.x, position.z, 0.5);
        this.playNoiseBurst({ duration: 0.2, volume: 0.022, highpass: 400, lowpass: 2600 });
        this.placeActionTimer = 0.35;
        this.showHitIndicator();
        this.receiveSystemMessage({ text: 'You caught an electric eel in the bucket. Put it in an eel tank to make electricity' });
        return true;
    },

    // An eel near the view ray within reach (thin bodies are hard to aim at).
    eelFindNearRay() {
        const ray = this.getInteractionRay();
        let best = null;
        let bestAlong = Infinity;
        for (const mob of this.ambientMobs) {
            if (mob.userData.species !== 'eel' || !mob.userData.eel || !mob.visible) continue;
            if (mob.position.distanceTo(ray.origin) > EEL_CATCH_RANGE + 3) continue;
            for (const joint of mob.userData.eel.joints) {
                _eelPoint.subVectors(joint, ray.origin);
                const along = _eelPoint.dot(ray.direction);
                if (along < 0.2 || along > EEL_CATCH_RANGE || along >= bestAlong) continue;
                if (_eelPoint.addScaledVector(ray.direction, -along).length() > 0.6) continue;
                best = mob;
                bestAlong = along;
            }
        }
        return best;
    },

    eelHandleUse(item, hit) {
        if (item !== 'bucket' && item !== 'eel_bucket' && item !== 'raw_fish') return false;
        const position = hit ? this.world.getBlockPositionFromIntersection(hit) : null;
        const type = position ? this.world.getBlockTypeAt(position.x, position.y, position.z) : null;
        const tank = type === 'eel_tank' || type === 'eel_tank:full' ? type : null;

        if (item === 'raw_fish') {
            if (!tank) return false;
            if (tank === 'eel_tank') {
                this.receiveSystemMessage({ text: 'The tank is empty. Put an eel in it with an eel bucket' });
                return true;
            }
            this.eelFeedTank(position);
            return true;
        }
        if (item === 'bucket') {
            if (tank === 'eel_tank:full') {
                this.eelSetTank(position, 'eel_tank');
                this.bucketSwap('bucket', 'eel_bucket');
                this.eelTankSplash(position);
                this.receiveSystemMessage({ text: 'You took the eel out of the tank' });
                return true;
            }
            const mob = this.eelFindNearRay();
            return mob ? this.eelCatch(mob) : false;
        }
        // The eel bucket: into an empty tank, or back into deep water.
        if (tank === 'eel_tank') {
            this.eelSetTank(position, 'eel_tank:full');
            this.bucketSwap('eel_bucket', 'bucket');
            this.eelTankSplash(position);
            this.receiveSystemMessage({ text: 'The eel is in its tank: a living generator of 25 W. Feed it raw fish for more' });
            return true;
        }
        if (tank === 'eel_tank:full') {
            this.receiveSystemMessage({ text: 'This tank already has an eel' });
            return true;
        }
        const water = this.bucketFindWater();
        const around = water || (hit ? hit.point : null);
        const column = around ? this.findWaterColumn(around.x, around.z, 3, around.y + 2) : null;
        if (!column) {
            this.receiveSystemMessage({ text: 'Release the eel into water at least two blocks deep, or into an eel tank' });
            return true;
        }
        this.eelSpawnInColumn(column);
        this.bucketSwap('eel_bucket', 'bucket');
        this.bucketAfterUse(Math.floor(column.x), Math.floor(column.surface) - 1, Math.floor(column.z));
        this.receiveSystemMessage({ text: 'The eel slips back into the water' });
        return true;
    },

    // ---- Eel tanks -----------------------------------------------------------------------

    // Changes the tank block for everyone (the server's network follows the name).
    eelSetTank(position, type) {
        const payload = { x: position.x, y: position.y, z: position.z, blockType: type };
        this.world.addBlock(payload);
        if (this.network && this.network.connected) this.network.send('blockPlace', payload);
    },

    eelTankSplash(position) {
        this.spawnSplash(position.x + 0.5, position.y + 1, position.z + 0.5, 0.25);
        this.playNoiseBurst({ duration: 0.2, volume: 0.022, highpass: 400, lowpass: 2600 });
        this.placeActionTimer = 0.35;
        this.showHitIndicator();
        this.eelTankTimer = 0;
    },

    eelFeedTank(position) {
        if (this.getInventoryCount('raw_fish') <= 0) return;
        this.consumeSelectedBlock();
        if (this.network && this.network.connected) this.network.send('powerFeed', position);
        this.eelFedTanks = this.eelFedTanks || new Map();
        const key = `${position.x},${position.y},${position.z}`;
        const now = performance.now() / 1000;
        this.eelFedTanks.set(key, Math.min(now + 30, Math.max(now, this.eelFedTanks.get(key) || 0) + EEL_FEED_SECONDS));
        this.playTone({ frequency: 200, endFrequency: 90, duration: 0.12, type: 'sine', volume: 0.025, release: 0.08 });
        this.playNoiseBurst({ duration: 0.05, volume: 0.02, highpass: 2500, lowpass: 9000 });
        this.placeActionTimer = 0.3;
        this.showHitIndicator();
        this.receiveSystemMessage({ text: 'The eel gobbles the fish: 50 W for 10 seconds' });
    },

    eelTankFlags() {
        const registry = this.world.registry;
        if (this.eelTankRegistry !== registry) {
            this.eelTankRegistry = registry;
            this.eelTankFlagArray = new Uint8Array(registry.names.length);
            registry.names.forEach((name, id) => {
                if (name === 'eel_tank:full') this.eelTankFlagArray[id] = 1;
            });
        }
        return this.eelTankFlagArray;
    },

    eelCreateTankEel(x, y, z) {
        const model = VoxelModels.createMob('eel', (texture, normalMap) => this.createModelMaterial(texture, normalMap), this.mobTextureCache, 0, this.rtxModeEnabled);
        const group = new THREE.Group();
        group.position.set(x + 0.5, y + 0.45, z + 0.5);
        model.root.scale.setScalar(EEL_TANK_SCALE);
        group.add(model.root);
        this.scene.add(group);
        return {
            group, root: model.root, parts: model.parts, hd: Boolean(this.rtxModeEnabled), x, y, z, phase: Math.random() * Math.PI * 2,
            spin: Math.random() < 0.5 ? 1 : -1, joints: Array.from({ length: EEL_SEGMENTS + 1 }, () => new THREE.Vector3()), spark: 0
        };
    },

    eelDisposeTankEel(tankEel) {
        this.scene.remove(tankEel.group);
        tankEel.root.traverse((node) => {
            if (node.isMesh && node.userData.disposeGeometry) node.geometry.dispose();
            if (node.isMesh && node.material) node.material.dispose();
        });
    },

    // Finds the full tanks near the player and keeps one swimming eel in each.
    eelScanTanks() {
        const flags = this.eelTankFlags();
        const world = this.world;
        const { chunkX, chunkZ } = world.getChunkCoords(Math.floor(this.camera.position.x), Math.floor(this.camera.position.z));
        const seen = new Set();
        for (let dx = -EEL_TANK_CHUNKS; dx <= EEL_TANK_CHUNKS; dx++) {
            for (let dz = -EEL_TANK_CHUNKS; dz <= EEL_TANK_CHUNKS; dz++) {
                const key = world.chunkKey(chunkX + dx, chunkZ + dz);
                const column = world.columns.get(key);
                if (!column || !world.activeChunks.has(key)) continue;
                for (const index of column.findBlocks(flags, 'eelTanks')) {
                    const x = (chunkX + dx) * CHUNK_SIZE + index % CHUNK_SIZE;
                    const z = (chunkZ + dz) * CHUNK_SIZE + Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE;
                    const y = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE)) + WORLD_MIN_Y;
                    const tankKey = `${x},${y},${z}`;
                    seen.add(tankKey);
                    const existing = this.eelTankEels.get(tankKey);
                    // Rebuilt when the graphics mode changes (its textures depend on it).
                    if (existing && existing.hd === Boolean(this.rtxModeEnabled)) continue;
                    if (existing) this.eelDisposeTankEel(existing);
                    this.eelTankEels.set(tankKey, this.eelCreateTankEel(x, y, z));
                }
            }
        }
        for (const [key, tankEel] of this.eelTankEels) {
            if (seen.has(key)) continue;
            this.eelDisposeTankEel(tankEel);
            this.eelTankEels.delete(key);
        }
    },

    // The tank eel swims round and round, bobbing; a fed one is faster and sparkles.
    eelAnimateTanks(delta) {
        const now = performance.now() / 1000;
        for (const [key, tankEel] of this.eelTankEels) {
            const fed = this.eelFedTanks && (this.eelFedTanks.get(key) || 0) > now;
            tankEel.phase += delta * (fed ? 2.4 : 0.9) * tankEel.spin;
            const radius = 0.26 / EEL_TANK_SCALE;
            const step = EEL_SPACING / radius;
            for (let k = 0; k <= EEL_SEGMENTS; k++) {
                const angle = tankEel.phase - k * step * tankEel.spin;
                const r = radius * (1 - k * 0.012);
                tankEel.joints[k].set(Math.cos(angle) * r, (Math.sin(tankEel.phase * 0.7 + k * 0.4) * 0.05) / EEL_TANK_SCALE, Math.sin(angle) * r);
            }
            this.eelPlaceChain(tankEel.parts, tankEel.joints, now + tankEel.phase, fed ? 2 : 0.5);
            if (fed) {
                tankEel.spark -= delta;
                if (tankEel.spark <= 0) {
                    tankEel.spark = 0.5 + Math.random() * 0.7;
                    this.eelTankSpark(tankEel);
                }
            }
        }
    },

    // A tiny arc inside the tank of a fed eel.
    eelTankSpark(tankEel) {
        const material = this.eelArcMaterial();
        const center = new THREE.Vector3(tankEel.x + 0.5, tankEel.y + 0.45, tankEel.z + 0.5);
        const ends = [];
        for (let i = 0; i < 3; i++) {
            const angle = Math.random() * Math.PI * 2;
            ends.push([center.clone(), center.clone().add(new THREE.Vector3(Math.cos(angle) * 0.4, (Math.random() - 0.5) * 0.3, Math.sin(angle) * 0.4))]);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(ends.length * 6 * 2 * 3), 3));
        const lines = new THREE.LineSegments(geometry, material.clone());
        lines.frustumCulled = false;
        this.scene.add(lines);
        const arc = { lines, glow: null, ends, life: 0.2, age: 0, jitter: 0 };
        this.eelJitterArc(arc);
        this.eelArcs = this.eelArcs || [];
        this.eelArcs.push(arc);
    },

    // In Ultra, a faint blue flicker runs along the body of every eel in the water.
    eelUpdateFlicker(mob) {
        const e = mob.userData.eel;
        if (!e) return;
        const show = Boolean(this.ultraModeEnabled) && mob.visible && e.stranded === 0;
        if (!show) {
            if (e.flicker) e.flicker.visible = false;
            return;
        }
        if (!e.flicker) {
            this.eelArcMaterial();
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((EEL_SEGMENTS + 1) * 3), 3));
            e.flicker = new THREE.Line(geometry, this.eelFlickerMat);
            e.flicker.frustumCulled = false;
            this.scene.add(e.flicker);
        }
        e.flicker.visible = true;
        const positions = e.flicker.geometry.attributes.position;
        const charge = e.cooldown > 0 ? 0.01 : 0.04;
        e.joints.forEach((joint, k) => {
            positions.setXYZ(k, joint.x + (Math.random() - 0.5) * charge, joint.y + 0.12 + (Math.random() - 0.5) * charge, joint.z + (Math.random() - 0.5) * charge);
        });
        positions.needsUpdate = true;
    },

    eelFrame(delta) {
        if (!this.world || !this.world.registry || !this.scene || !this.camera) return;
        // Crackles.
        if (this.eelCrackles && this.eelCrackles.length) {
            this.eelCrackles = this.eelCrackles.filter((crackle) => {
                crackle.at -= delta;
                if (crackle.at > 0) return true;
                this.playNoiseBurst({ duration: 0.03, volume: 0.03 * crackle.volume, highpass: 2800, lowpass: 10000 });
                return false;
            });
        }
        // Arcs: flicker, fade and go.
        if (this.eelArcs && this.eelArcs.length) {
            this.eelArcs = this.eelArcs.filter((arc) => {
                arc.age += delta;
                arc.jitter -= delta;
                if (arc.age >= arc.life) {
                    this.scene.remove(arc.lines);
                    arc.lines.geometry.dispose();
                    arc.lines.material.dispose();
                    if (arc.glow) {
                        this.scene.remove(arc.glow);
                        arc.glow.material.dispose();
                    }
                    return false;
                }
                if (arc.jitter <= 0) {
                    arc.jitter = 0.05;
                    this.eelJitterArc(arc);
                }
                const fade = 1 - arc.age / arc.life;
                arc.lines.material.opacity = fade * (0.6 + Math.random() * 0.4);
                if (arc.glow) arc.glow.material.opacity = fade * 0.8;
                return true;
            });
        }
        // The shared flicker (Ultra) of every wild eel; only every other frame to keep it light.
        this.eelFlickerTick = ((this.eelFlickerTick || 0) + 1) % 2;
        if (this.eelFlickerTick === 0) {
            this.ambientMobs.forEach((mob) => { if (mob.userData.species === 'eel') this.eelUpdateFlicker(mob); });
            if (this.eelFlickerMat) this.eelFlickerMat.opacity = 0.12 + Math.random() * 0.3;
        }
        // Tank eels.
        if (!this.eelTankEels) this.eelTankEels = new Map();
        this.eelTankTimer = (this.eelTankTimer || 0) - delta;
        if (this.eelTankTimer <= 0) {
            this.eelTankTimer = EEL_TANK_SCAN;
            this.eelScanTanks();
        }
        if (this.eelTankEels.size) this.eelAnimateTanks(delta);
    }
});
