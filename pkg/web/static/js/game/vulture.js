// Vultures. Big dark scavengers of the desert and the rocky highlands: they ride the thermals
// in slow, wide circles high above the land, wings held in a shallow V with the primaries
// spread like fingers, flapping only to climb; now and then they glide down to the highest
// rock or cactus around and sit there hunched, bald head sunk into the white ruff.
// Whenever a mob is defeated nearby ('defeated' mob event) the vultures within sight converge
// on the spot, circle low over it for a while, then land around it and peck and squabble,
// hissing and mantling their wings. When the player's health drops to 30% or less they
// gather overhead and circle ominously until it recovers. They never attack; struck, one
// hisses and flaps off higher and away, and three bare-handed blows defeat it.
// Self-contained: registers the 'scavenge' movement mode (js/extensions.js); `this` is the Game.

const _vultureTarget = new THREE.Vector3();
const VULTURE_SIGHT = 56;

MOB_SPECIES.vulture = { eggColor: 0x2e2420, tone: 120, maxHealth: 12, speed: 2.8, group: [1, 3], limit: 4, movement: 'scavenge' };
VoxelModels.MOB_SURFACES.vulture = 'feather';

// Faces +z; 16 units per block. About 2.6 blocks of wingspan.
VoxelModels.mobBuilders.vulture = function (b) {
    const plumage = 0x30241c;
    const covert = 0x4a3828;
    const primary = 0x17120f;
    const skin = 0xd99a8c;
    const ruff = 0xece5d4;
    b.part('body', { pivot: [0, 0, 0], from: [-3, 4, -5.5], size: [6, 6, 11], paint: { color: plumage, noise: 0.08, all: (p, face) => {
        p.spots(covert, 7, 1, 1.5);
        if (face === 'bottom') p.fill(0x231a14, 0.08);
    } } });
    b.part('ruff', { parent: 'body', pivot: [0, 9, 4.5], from: [-2.5, -1.75, -2], size: [5, 2.5, 3.5], paint: { color: ruff, noise: 0.1, all: (p) => p.spots(0xd6ccb6, 5, 0.5, 1) } });
    b.part('neck', { parent: 'body', pivot: [0, 9, 4.5], from: [-0.9, -0.5, -0.9], size: [1.8, 4.5, 1.8], paint: { color: skin, noise: 0.07, all: (p) => p.spots(0xc27c70, 4, 0.5, 1) }, rotation: [0.9, 0, 0] });
    b.part('head', {
        parent: 'neck', pivot: [0, 4, 0], from: [-1.25, -0.75, -1.25], size: [2.5, 2.5, 3],
        paint: {
            color: skin, noise: 0.06,
            all: (p, face) => {
                if (face === 'top') p.spots(0xc27c70, 3, 0.5, 1);
                if (face !== 'left' && face !== 'right') return;
                const x = face === 'left' ? p.w - 1.4 : 0.4;
                p.rect(x - 0.2, 0.6, 1.2, 1, 0xb06a60, 0);
                p.rect(x, 0.8, 0.8, 0.6, 0x120d0b, 0);
                p.rect(x + 0.1, 0.85, 0.3, 0.3, 0xffffff, 0);
            }
        }
    });
    b.part('beak', { parent: 'head', pivot: [0, 0.6, 1.75], from: [-0.6, -0.9, 0], size: [1.2, 1.5, 1.6], paint: { color: 0xcfc4ac, noise: 0.03, faces: { top: (p) => p.rect(0, 0, p.w, 0.6, 0x8a8478, 0) } } });
    b.part('beakHook', { parent: 'beak', pivot: [0, -0.9, 1.6], from: [-0.45, -0.7, -0.7], size: [0.9, 1, 0.9], paint: { color: 0x2a2420, noise: 0.02 } });
    b.part('tail', { parent: 'body', pivot: [0, 8, -5.5], from: [-2.5, -0.5, -4], size: [5, 1, 4], paint: { color: 0x221a15, noise: 0.07 }, rotation: [-0.15, 0, 0] });
    const wingPaint = { color: plumage, noise: 0.08, all: (p, face) => {
        p.spots(covert, 10, 1, 2);
        // A pale bar along the underside, as in the griffon.
        if (face === 'bottom') p.rect(0, p.h * 0.45, p.w, p.h * 0.2, 0x6a5848, 0.08);
    } };
    const primaryPaint = { color: primary, noise: 0.08, all: (p) => p.spots(0x2a201a, 6, 1, 1.5) };
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`wing${side}`, { parent: 'body', pivot: [3 * sign, 9, 1.5], from: [sign > 0 ? 0 : -9, -0.5, -3.5], size: [9, 1, 7], paint: wingPaint });
        b.part(`wingTip${side}`, { parent: `wing${side}`, pivot: [9 * sign, 0, 0], from: [sign > 0 ? 0 : -5, -0.4, -3.5], size: [5, 0.8, 6], paint: primaryPaint });
        // Fingered primaries, splayed apart at the end of the wing.
        [2, 0.5, -1, -2.5].forEach((z, i) => {
            b.part(`finger${side}${i}`, { parent: `wingTip${side}`, pivot: [5 * sign, 0, z], from: [sign > 0 ? 0 : -4.5 + i * 0.5, -0.3, -0.55], size: [4.5 - i * 0.5, 0.6, 1.1], paint: { color: primary, noise: 0.06 } });
        });
        b.part(`leg${side}`, { parent: 'body', pivot: [1.5 * sign, 4.5, 0.5], from: [-0.5, -4.5, -0.5], size: [1, 4.5, 1], paint: { color: 0xa8968e, noise: 0.05, all: (p, face) => { if (face !== 'top' && face !== 'bottom') p.rect(0, 0, p.w, 1.5, plumage, 0.06); } } });
        b.part(`talons${side}`, { parent: `leg${side}`, pivot: [0, -4.5, 0], from: [-0.9, 0, -0.75], size: [1.8, 0.5, 2.2], paint: { color: 0x3a3430, noise: 0.03 } });
    });
    return { head: 'head', tail: ['tail'] };
};

registerMobBehaviour('scavenge', {
    update(mob, delta, player) { this.updateVulture(mob, delta, player); },
    interact(mob) { this.vultureStruck(mob); },
    spawnForChunk(chunkX, chunkZ, biome) { this.vultureSpawnForChunk(chunkX, chunkZ, biome); }
});

// A defeated mob draws every vulture in sight; a couple more arrive from afar over their own land.
onMobEvent('defeated', function (mob) {
    if (mob.userData.species === 'vulture') return;
    this.vultureCarrion(mob.position.clone());
});

Object.assign(Game.prototype, {
    vultureCount() {
        return this.ambientMobs.filter((mob) => mob.userData.species === 'vulture').length;
    },

    vultureBiomeAt(x, z) {
        const { chunkX, chunkZ } = this.world.getChunkCoords(x, z);
        return this.world.chunkBiomes.get(this.world.chunkKey(chunkX, chunkZ)) || 'plains';
    },

    // Natural spawning: a small kettle already up on a thermal over desert or rocky land.
    vultureSpawnForChunk(chunkX, chunkZ, biome) {
        if (biome !== 'desert' && biome !== 'rocky') return;
        if (this.chunkRandom(chunkX, chunkZ, 141) > 0.07) return;
        const info = getMobSpecies('vulture');
        const room = info.limit - this.vultureCount();
        if (room <= 0) return;
        const size = this.world.chunkSize;
        const x = chunkX * size + size / 2;
        const z = chunkZ * size + size / 2;
        const ground = this.cameraController.getFloorY(x, z, 64);
        if (ground <= -20) return;
        const [min, max] = info.group;
        const count = Math.min(room, min + Math.floor(this.chunkRandom(chunkX, chunkZ, 142) * (max - min + 1)));
        let leader = null;
        for (let i = 0; i < count; i++) {
            const mob = this.createMob('vulture', new THREE.Vector3(x, ground, z));
            mob.userData.natural = true;
            mob.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
            this.ambientMobs.push(mob);
            this.initVulture(mob);
            // The kettle shares one thermal, spread around the circle and stacked in height.
            if (leader) this.vultureJoinThermal(mob, leader, i);
            leader = leader || mob;
        }
    },

    initVulture(mob) {
        const data = mob.userData;
        data.velocity = new THREE.Vector3();
        data.facing = data.direction;
        data.vulture = {
            mode: 'perch', timer: 8 + Math.random() * 6, calm: 6, flapBoost: 0, turnRate: 0, perched: 1,
            angle: 0, turn: 1, speed: 2.8, radius: 10, center: data.home.clone(), cruiseY: 0,
            perch: mob.position.clone(), site: null, mantle: 0, peck: 0, flap: 0, wingPhase: 0, soundTimer: 2 + Math.random() * 4
        };
        mob.rotation.order = 'YXZ';
        ['L', 'R'].forEach((side) => { data.modelParts[`wing${side}`].rotation.order = 'YXZ'; });
        if (data.natural) {
            this.vultureChooseThermal(mob);
            data.vulture.mode = 'soar';
            data.vulture.perched = 0;
            mob.position.y = data.vulture.cruiseY;
            data.vulture.angle = Math.random() * Math.PI * 2;
            mob.position.x = data.vulture.center.x + Math.cos(data.vulture.angle) * data.vulture.radius;
            mob.position.z = data.vulture.center.z + Math.sin(data.vulture.angle) * data.vulture.radius;
            data.facing = data.vulture.angle + Math.PI / 2 * data.vulture.turn;
        }
    },

    vultureJoinThermal(mob, leader, index) {
        const own = mob.userData.vulture;
        const lead = leader.userData.vulture;
        own.center.copy(lead.center);
        own.radius = lead.radius * (0.8 + Math.random() * 0.35);
        own.turn = lead.turn;
        own.speed = lead.speed * (0.92 + Math.random() * 0.12);
        own.cruiseY = lead.cruiseY + index * 2.5;
        own.timer = lead.timer + Math.random() * 10;
        own.angle = lead.angle + index * 2.1;
        mob.position.set(own.center.x + Math.cos(own.angle) * own.radius, own.cruiseY, own.center.z + Math.sin(own.angle) * own.radius);
        mob.userData.facing = own.angle + Math.PI / 2 * own.turn;
    },

    // A wide circle near home, high above the local terrain (higher still when fleeing).
    vultureChooseThermal(mob, awayFrom = null) {
        const state = mob.userData.vulture;
        const home = mob.userData.home;
        let angle = Math.random() * Math.PI * 2;
        if (awayFrom) angle = Math.atan2(mob.position.z - awayFrom.z, mob.position.x - awayFrom.x);
        const distance = awayFrom ? 24 : Math.random() * 18;
        const base = awayFrom ? mob.position : home;
        state.center.set(base.x + Math.cos(angle) * distance, 0, base.z + Math.sin(angle) * distance);
        state.radius = 10 + Math.random() * 6;
        state.turn = Math.random() < 0.5 ? -1 : 1;
        state.speed = getMobSpecies('vulture').speed * (0.85 + Math.random() * 0.25);
        state.angle = Math.atan2(mob.position.z - state.center.z, mob.position.x - state.center.x);
        state.cruiseY = this.vultureTerrainTop(state.center, state.radius + 3, mob.position.y - 16) + 14 + Math.random() * 8 + (awayFrom ? 6 : 0);
        state.timer = 30 + Math.random() * 40;
    },

    // Highest floor on a ring of samples around `center`.
    vultureTerrainTop(center, radius, fallback) {
        let top = fallback;
        for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2;
            const r = i === 0 ? 0 : radius;
            const floor = this.cameraController.getFloorY(center.x + Math.cos(a) * r, center.z + Math.sin(a) * r, 80);
            if (floor > -20) top = Math.max(top, floor);
        }
        return top;
    },

    // The highest dry spot (a crag, a cactus top) under the circle, or false.
    vultureChoosePerch(mob) {
        const state = mob.userData.vulture;
        let best = null;
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * (state.radius + 4);
            const x = Math.floor(state.center.x + Math.cos(a) * r) + 0.5;
            const z = Math.floor(state.center.z + Math.sin(a) * r) + 0.5;
            const floor = this.cameraController.getFloorY(x, z, 80);
            if (floor <= -20 || this.findWaterSurface(x, floor + 0.1, z) !== null) continue;
            if (this.world.hasSolidBlock(Math.floor(x), Math.floor(floor) + 1, Math.floor(z))) continue;
            if (!best || floor > best.y) best = new THREE.Vector3(x, floor, z);
        }
        if (!best) return false;
        state.perch.copy(best);
        return true;
    },

    // Every vulture within sight converges on the carcass at `position`.
    vultureCarrion(position) {
        if (!this.world) return;
        const ground = this.cameraController.getFloorY(position.x, position.z, position.y + 2);
        if (ground <= -20 || this.findWaterSurface(position.x, ground + 0.1, position.z) !== null) return;
        const site = new THREE.Vector3(position.x, ground, position.z);
        let gathered = 0;
        for (const mob of this.ambientMobs) {
            if (mob.userData.species !== 'vulture' || mob.userData.rider) continue;
            if (!mob.userData.vulture) this.initVulture(mob);
            const state = mob.userData.vulture;
            if (state.mode === 'flee' || ((state.mode === 'feed' || state.mode === 'descend') && state.site && state.site.distanceTo(site) < 6)) continue;
            if (Math.hypot(mob.position.x - site.x, mob.position.z - site.z) > VULTURE_SIGHT) continue;
            this.vultureGoToCarrion(mob, site, gathered);
            gathered++;
        }
        // Over their own land, more of them come in from beyond the horizon.
        const biome = this.vultureBiomeAt(site.x, site.z);
        if (biome !== 'desert' && biome !== 'rocky') return;
        const info = getMobSpecies('vulture');
        const { chunkX, chunkZ } = this.world.getChunkCoords(site.x, site.z);
        for (let i = gathered; i < 2 && this.vultureCount() < info.limit; i++) {
            const angle = Math.random() * Math.PI * 2;
            const start = new THREE.Vector3(site.x + Math.cos(angle) * 40, site.y, site.z + Math.sin(angle) * 40);
            const mob = this.createMob('vulture', start);
            mob.userData.natural = true;
            mob.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
            this.ambientMobs.push(mob);
            this.initVulture(mob);
            mob.userData.vulture.mode = 'soar';
            mob.userData.vulture.perched = 0;
            mob.position.y = this.vultureTerrainTop(start, 2, site.y) + 18 + Math.random() * 6;
            mob.userData.facing = angle + Math.PI;
            this.vultureGoToCarrion(mob, site, i);
        }
    },

    vultureGoToCarrion(mob, site, index) {
        const state = mob.userData.vulture;
        state.mode = 'gather';
        state.site = site.clone();
        state.center.set(site.x, 0, site.z);
        state.radius = 3.5 + Math.random() * 2.5;
        state.turn = index % 2 === 0 ? 1 : -1;
        state.speed = getMobSpecies('vulture').speed * 0.9;
        state.angle = Math.atan2(mob.position.z - site.z, mob.position.x - site.x);
        state.cruiseY = this.vultureTerrainTop(state.center, state.radius + 1, site.y) + 4.5 + index * 1.2 + Math.random() * 2;
        // Circling starts once over the spot; until then the timer only bounds the trip.
        state.timer = 9 + Math.random() * 7;
        state.travel = 40;
        state.calm = 0;
        if (state.perched > 0.5) this.vultureTakeOff(mob, false);
    },

    vultureStruck(mob) {
        const data = mob.userData;
        if (!data.vulture) this.initVulture(mob);
        const state = data.vulture;
        const player = this.getLocalPlayerPosition();
        this.vultureHiss(mob, 1.4);
        if (this.damageMobByPlayer(mob)) {
            this.defeatMobByPlayer(mob, 'You defeated the vulture');
            return;
        }
        this.vultureChooseThermal(mob, player);
        state.mode = 'flee';
        state.timer = 14;
        state.site = null;
        state.flapBoost = 3;
        state.perched = Math.min(state.perched, 0.6);
        const away = Math.atan2(mob.position.z - player.z, mob.position.x - player.x);
        data.facing = away;
        data.velocity.set(Math.cos(away) * 3, 4, Math.sin(away) * 3);
        this.vultureWhoosh(mob, 1.4);
        this.playNoiseBurst({ duration: 0.06, volume: 0.02, highpass: 300, lowpass: 2200 });
    },

    vultureTakeOff(mob, startled) {
        const data = mob.userData;
        const state = data.vulture;
        if (state.mode === 'perch' || state.mode === 'feed') {
            this.vultureChooseThermal(mob, startled ? this.getLocalPlayerPosition() : null);
            state.mode = 'soar';
        }
        state.flapBoost = 2.5;
        data.velocity.set(Math.cos(data.facing) * 1.5, 3, Math.sin(data.facing) * 1.5);
        mob.position.y += 0.1;
        this.vultureWhoosh(mob, 1.2);
        if (startled) this.vultureHiss(mob, 1);
    },

    vultureLand(mob, spot, mode) {
        const state = mob.userData.vulture;
        mob.position.copy(spot);
        mob.userData.velocity.set(0, 0, 0);
        state.mode = mode;
        state.calm = mode === 'feed' ? 2 : 0;
        state.timer = mode === 'feed' ? 14 + Math.random() * 10 : 18 + Math.random() * 25;
        state.mantle = 1;
        this.vultureWhoosh(mob, 0.8);
        if (mode === 'feed' && state.site) {
            mob.userData.facing = Math.atan2(state.site.z - spot.z, state.site.x - spot.x);
        }
    },

    // Health low: the player looks like the next meal.
    vultureOmenActive() {
        if (this.vultureOmenFrame !== this.mobFrame) {
            this.vultureOmenFrame = this.mobFrame;
            const low = !this.respawnPending && this.maxHealth > 0 && this.health > 0 && this.health / this.maxHealth <= 0.3;
            if (!low) this.vultureOmenAnnounced = false;
            this.vultureOmenNow = low;
        }
        return this.vultureOmenNow;
    },

    updateVulture(mob, delta, player) {
        const data = mob.userData;
        if (!data.vulture) this.initVulture(mob);
        const state = data.vulture;
        const position = mob.position;
        data.life += delta;
        state.timer -= delta;
        state.flapBoost = Math.max(0, state.flapBoost - delta);
        state.mantle = Math.max(0, state.mantle - delta);
        state.soundTimer -= delta;
        const playerDistance = Math.hypot(player.x - position.x, player.z - position.z);

        // The ominous circle over a weakened player.
        const omen = this.vultureOmenActive();
        if (omen && ['soar', 'perch', 'gather'].includes(state.mode) && playerDistance < VULTURE_SIGHT) {
            if (state.perched > 0.5) this.vultureTakeOff(mob, false);
            state.mode = 'omen';
            state.radius = 5 + Math.random() * 3;
            state.turn = Math.random() < 0.5 ? -1 : 1;
            state.speed = getMobSpecies('vulture').speed * 0.8;
            state.angle = Math.atan2(position.z - player.z, position.x - player.x);
            state.omenHeight = 7 + Math.random() * 4;
            if (!this.vultureOmenAnnounced) {
                this.vultureOmenAnnounced = true;
                this.receiveSystemMessage({ text: 'Vultures are circling above you' });
            }
            this.vultureGrunt(mob, 0.8);
        } else if (state.mode === 'omen' && !omen) {
            this.vultureChooseThermal(mob);
            state.mode = 'soar';
        }

        if (state.mode === 'perch' || state.mode === 'feed') {
            state.calm = Math.max(0, state.calm - delta);
            const startled = state.calm <= 0 && playerDistance < (state.mode === 'feed' ? 3.5 : 4.5) && Math.abs(player.y - position.y) < 6 && !this.titleScreenOpen;
            if (state.timer <= 0 || startled) {
                this.vultureTakeOff(mob, startled);
            } else {
                if (state.soundTimer <= 0) {
                    state.soundTimer = state.mode === 'feed' ? 1.5 + Math.random() * 3 : 6 + Math.random() * 10;
                    if (state.mode === 'feed' && Math.random() < 0.45) {
                        this.vultureHiss(mob, 0.7);
                        state.mantle = 1.2;
                    } else {
                        this.vultureGrunt(mob, state.mode === 'feed' ? 0.8 : 0.5);
                    }
                }
                // Squabbling over the carcass: shuffle round it a little now and then.
                if (state.mode === 'feed' && state.site && Math.random() < delta * 0.25) this.vultureShuffle(mob);
                this.poseVulture(mob, delta, 0);
                return;
            }
        }

        if (state.mode === 'soar' || state.mode === 'flee') {
            if (state.timer <= 0) {
                if (state.mode === 'soar' && Math.random() < 0.4 && this.vultureChoosePerch(mob)) {
                    state.mode = 'land';
                    state.timer = 35;
                } else {
                    this.vultureChooseThermal(mob);
                    state.mode = 'soar';
                }
            }
            this.vultureCircleTarget(mob, delta, state.cruiseY);
        } else if (state.mode === 'gather') {
            const over = Math.hypot(position.x - state.site.x, position.z - state.site.z) < state.radius + 4;
            state.travel -= delta;
            if (over || state.travel <= 0) {
                if (state.timer <= 0) {
                    this.vultureChooseLanding(mob);
                    state.mode = 'descend';
                    state.timer = 20;
                }
            } else {
                state.timer = Math.max(state.timer, 6);
            }
            this.vultureCircleTarget(mob, delta, state.cruiseY);
        } else if (state.mode === 'omen') {
            state.center.set(player.x, 0, player.z);
            const top = this.cameraController.getFloorY(player.x, player.z, player.y + 24);
            this.vultureCircleTarget(mob, delta, Math.max(player.y, top) + state.omenHeight);
            if (state.soundTimer <= 0) {
                state.soundTimer = 5 + Math.random() * 8;
                this.vultureGrunt(mob, 0.6);
            }
        } else {
            _vultureTarget.copy(state.perch);
        }

        this.vultureSteer(mob, _vultureTarget, delta);
        const landing = state.mode === 'land' || state.mode === 'descend';
        if (landing && (position.distanceTo(state.perch) < 0.35 || state.timer <= 0)) {
            this.vultureLand(mob, state.perch, state.mode === 'descend' ? 'feed' : 'perch');
        }
        if (!landing && state.soundTimer <= 0) {
            state.soundTimer = 8 + Math.random() * 12;
            if (state.mode === 'gather') this.vultureGrunt(mob, 0.6);
        }
        this.poseVulture(mob, delta, 1);
    },

    // Aims a little ahead along the current circle, at `height`.
    vultureCircleTarget(mob, delta, height) {
        const state = mob.userData.vulture;
        state.angle += state.speed / state.radius * state.turn * delta;
        const ahead = state.angle + 0.45 * state.turn;
        _vultureTarget.set(state.center.x + Math.cos(ahead) * state.radius, height, state.center.z + Math.sin(ahead) * state.radius);
    },

    // A free spot on the ground beside the carcass, facing it.
    vultureChooseLanding(mob) {
        const state = mob.userData.vulture;
        const site = state.site;
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 0.7 + Math.random() * 1;
            const x = site.x + Math.cos(a) * r;
            const z = site.z + Math.sin(a) * r;
            const floor = this.cameraController.getFloorY(x, z, site.y + 3);
            if (floor <= -20 || Math.abs(floor - site.y) > 1.5) continue;
            if (this.findWaterSurface(x, floor + 0.1, z) !== null) continue;
            state.perch.set(x, floor, z);
            return;
        }
        state.perch.copy(site);
    },

    // A short wing-assisted hop to another side of the carcass.
    vultureShuffle(mob) {
        const state = mob.userData.vulture;
        const site = state.site;
        const a = Math.atan2(mob.position.z - site.z, mob.position.x - site.x) + (Math.random() - 0.5) * 1.6;
        const r = 0.7 + Math.random() * 0.9;
        const x = site.x + Math.cos(a) * r;
        const z = site.z + Math.sin(a) * r;
        const floor = this.cameraController.getFloorY(x, z, mob.position.y + 1.5);
        if (floor <= -20 || Math.abs(floor - mob.position.y) > 1.1) return;
        mob.position.set(x, floor, z);
        mob.userData.facing = Math.atan2(site.z - z, site.x - x);
        state.mantle = 0.8;
        this.vultureWhoosh(mob, 0.5);
    },

    // Steers with a slow turn rate: climbing on flaps, gliding down otherwise.
    vultureSteer(mob, target, delta) {
        const data = mob.userData;
        const state = data.vulture;
        const position = mob.position;
        const dx = target.x - position.x;
        const dz = target.z - position.z;
        const dy = target.y - position.y;
        const horizontal = Math.hypot(dx, dz);
        const landing = state.mode === 'land' || state.mode === 'descend';
        const speed = state.mode === 'flee' ? state.speed * 1.6 : state.speed;
        const cruise = landing ? Math.max(1, Math.min(speed, horizontal * 0.7)) : speed;

        if (horizontal > 0.05) {
            let turn = Math.atan2(dz, dx) - data.facing;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            const maxTurn = (landing && horizontal < 4 ? 3.5 : 0.9) * delta;
            const applied = THREE.MathUtils.clamp(turn, -maxTurn, maxTurn);
            data.facing += applied;
            state.turnRate += (applied / delta - state.turnRate) * Math.min(1, delta * 2);
        }
        const along = landing && horizontal < 0.6 ? horizontal / Math.max(delta, 0.001) : cruise;
        const climb = THREE.MathUtils.clamp(dy * 0.9, landing ? -3.5 : -1.6, 2.4);
        const blend = Math.min(1, delta * 1.6);
        data.velocity.x += (Math.cos(data.facing) * Math.min(along, cruise) - data.velocity.x) * blend;
        data.velocity.z += (Math.sin(data.facing) * Math.min(along, cruise) - data.velocity.z) * blend;
        data.velocity.y += (climb - data.velocity.y) * Math.min(1, delta * 2);

        // Pull up rather than fly into the terrain.
        const nx = position.x + data.velocity.x * delta;
        const ny = position.y + data.velocity.y * delta;
        const nz = position.z + data.velocity.z * delta;
        if (this.world.hasSolidBlock(Math.floor(nx), Math.floor(ny + 0.3), Math.floor(nz))) {
            position.y += 3 * delta;
            data.velocity.y = Math.max(data.velocity.y, 1);
            state.flapBoost = Math.max(state.flapBoost, 0.6);
            return;
        }
        position.set(nx, ny, nz);
    },

    // Body attitude and wings: hunched and folded on the ground (`flying` 0), a lazy V aloft.
    poseVulture(mob, delta, flying) {
        const data = mob.userData;
        const state = data.vulture;
        const parts = data.modelParts;
        const blend = Math.min(1, delta * 4);
        state.perched += ((1 - flying) - state.perched) * blend;
        const folded = state.perched;
        const velocity = data.velocity;
        const horizontal = Math.hypot(velocity.x, velocity.z);
        const feeding = !flying && state.mode === 'feed';

        mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.PI / 2 - data.facing, Math.min(1, delta * 6));
        const pitch = flying ? THREE.MathUtils.clamp(Math.atan2(-velocity.y, Math.max(horizontal, 0.5)) * 0.7, -0.4, 0.8) : (feeding ? 0.35 : -0.12);
        const roll = flying ? THREE.MathUtils.clamp(state.turnRate * 1.1, -0.45, 0.45) : 0;
        mob.rotation.x += (pitch - mob.rotation.x) * blend;
        mob.rotation.z += (roll - mob.rotation.z) * blend;

        // Heavy, slow beats only to take off, climb or land; mantling spreads them on the ground.
        const nearPerch = (state.mode === 'land' || state.mode === 'descend') && mob.position.distanceTo(state.perch) < 4;
        const flapping = flying && (state.flapBoost > 0 || velocity.y > 0.9 || nearPerch);
        state.flap = THREE.MathUtils.clamp(state.flap + (flapping ? 2.4 : -1.6) * delta, 0, 1);
        const beatRate = state.mode === 'flee' ? 7 : 5;
        const previousPhase = state.wingPhase;
        state.wingPhase += delta * beatRate * state.flap;
        if (state.flap > 0.5 && Math.floor(previousPhase / (Math.PI * 2)) !== Math.floor(state.wingPhase / (Math.PI * 2))) this.vultureWhoosh(mob, 0.6);
        const beat = Math.sin(state.wingPhase) * 0.7 * state.flap;
        const lag = Math.sin(state.wingPhase - 1) * 0.4 * state.flap;
        const mantle = Math.min(1, state.mantle) * folded;
        // The V of a soaring vulture, wobbling a little in the air.
        const dihedral = 0.28 + Math.sin(data.life * 1.3) * 0.03;
        ['L', 'R'].forEach((side) => {
            const sign = side === 'L' ? 1 : -1;
            const fold = folded * (1 - mantle * 0.7);
            parts[`wing${side}`].rotation.set(Math.PI / 2 * 0.95 * fold, sign * 1.45 * fold, sign * ((dihedral + beat) * (1 - folded) + mantle * 0.5 + 0.12 * folded));
            parts[`wingTip${side}`].rotation.set(0, sign * Math.PI * 0.94 * fold, sign * (0.1 + lag) * (1 - folded));
            // The primaries spread apart and curl up at the wingtip in flight.
            for (let i = 0; i < 4; i++) {
                const finger = parts[`finger${side}${i}`];
                const spread = (1 - fold) * (0.35 - i * 0.22);
                finger.rotation.set(0, sign * spread, sign * (0.18 + i * 0.03 + lag * 0.5) * (1 - fold));
            }
            parts[`leg${side}`].rotation.x = 1.25 * (1 - folded) + (feeding ? -0.15 : 0);
        });

        // Neck: drawn in and level in flight, sunk into the ruff when perched, bobbing to the
        // carcass when feeding.
        const neck = parts.neck;
        const head = data.head;
        if (feeding) {
            if (Math.random() < delta * 0.9) state.peck = 0.6;
            state.peck = Math.max(0, state.peck - delta);
        }
        const tug = state.peck > 0 ? Math.sin((0.6 - state.peck) / 0.6 * Math.PI) : 0;
        const neckX = flying ? 1.15 : feeding ? 2.1 + tug * 0.5 : 0.75 + Math.sin(data.life * 0.7) * 0.05;
        neck.rotation.x += (neckX - neck.rotation.x) * Math.min(1, delta * (feeding ? 12 : 4));
        if (head) {
            if (!flying && Math.random() < delta * 0.35) data.lookYaw = (Math.random() - 0.5) * 2;
            const yaw = flying ? THREE.MathUtils.clamp(state.turnRate * 0.6, -0.6, 0.6) : (feeding ? Math.sin(data.life * 9) * tug * 0.4 : data.lookYaw);
            head.rotation.y += (yaw - head.rotation.y) * Math.min(1, delta * 5);
            const headX = flying ? -1.05 - pitch * 0.5 : feeding ? -0.6 + tug * 0.3 : -0.35;
            head.rotation.x += (headX - head.rotation.x) * Math.min(1, delta * 8);
        }
        parts.tail.rotation.x = parts.tail.userData.baseRotation.x + (flying ? -state.turnRate * 0.12 : 0.35);
        parts.tail.rotation.y = flying ? -roll * 0.5 : 0;
    },

    vultureVolume(mob, base) {
        const player = this.getLocalPlayerPosition();
        const distance = Math.hypot(player.x - mob.position.x, player.y - mob.position.y, player.z - mob.position.z);
        return base * Math.max(0, 1 - distance / 40);
    },

    vultureHiss(mob, strength = 1) {
        const volume = this.vultureVolume(mob, 0.03 * strength);
        if (volume <= 0.001) return;
        this.playNoiseBurst({ duration: 0.35 + Math.random() * 0.25, volume, highpass: 1800, lowpass: 6500 });
        this.playTone({ frequency: getMobSpecies('vulture').tone * 1.6, endFrequency: getMobSpecies('vulture').tone, duration: 0.3, type: 'sawtooth', volume: volume * 0.25, attack: 0.03, release: 0.12 });
    },

    vultureGrunt(mob, strength = 1) {
        const volume = this.vultureVolume(mob, 0.016 * strength);
        if (volume <= 0.001) return;
        const tone = getMobSpecies('vulture').tone * (0.9 + Math.random() * 0.2);
        this.playTone({ frequency: tone, endFrequency: tone * 0.7, duration: 0.22, type: 'sawtooth', volume, attack: 0.02, release: 0.1, detune: (Math.random() - 0.5) * 60 });
        this.playTone({ frequency: tone * 0.5, endFrequency: tone * 0.4, duration: 0.26, type: 'square', volume: volume * 0.4, attack: 0.03, release: 0.12 });
    },

    vultureWhoosh(mob, strength = 1) {
        const volume = this.vultureVolume(mob, 0.022 * strength);
        if (volume <= 0.001) return;
        this.playNoiseBurst({ duration: 0.2, volume, highpass: 90, lowpass: 650 });
    }
});
