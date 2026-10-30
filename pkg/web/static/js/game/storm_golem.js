// The storm golem: a hulking figure of dark slate blocks, veined with glowing blue-white
// cracks, with a small storm cloud swirling over its head. It only walks the world while it
// rains: now and then one is born from a lightning strike 20-30 blocks from the player.
// It lumbers about with heavy stomps and, every so often, raises its arms and calls the
// lightning down onto itself (soaking up the charge) or onto an iron, copper or gold block
// within 12 blocks (sparks fly; the block is left untouched). Each bolt lights up the scene
// and its thunder arrives later the further away it fell.
// It is neutral: struck, it turns on the player for 15 seconds, charging its fists with a
// crackle and a rising whine, locking its aim (a faint line shows where) and then firing an
// electric discharge along that line; stepping out of the line or behind a block dodges it.
// When the rain stops its cracks dim and it crumbles into rubble and dust. Ones summoned by
// /mob or egg linger a minute without rain, so they can be seen.
// Everything lives here: the species, its model, the 'storm' movement behaviour, and a
// wrapper around updateAmbientMobs that spawns golems and animates bolts, sparks, rubble and
// the lightning flash every frame.

const _golemA = new THREE.Vector3();
const _golemB = new THREE.Vector3();
const _golemC = new THREE.Vector3();
const _golemUp = new THREE.Vector3(0, 1, 0);
const _golemFlashColor = new THREE.Color(0xdfe9ff);
const STORM_GOLEM_METALS = ['iron_block', 'copper_block', 'gold_block'];

MOB_SPECIES.storm_golem = { eggColor: 0x3b4352, tone: 80, maxHealth: 20, speed: 0.35, group: [1, 1], limit: 2, movement: 'storm' };
VoxelModels.MOB_SURFACES.storm_golem = 'skin';

// Stacked slate blocks with dark seams; its glowing cracks are added by stormGolemAttachGlow.
VoxelModels.mobBuilders.storm_golem = function (b) {
    const slate = 0x3c424c;
    const dark = 0x272b33;
    const seam = 0x16191e;
    const moss = 0x3e4a3c;
    const stone = { color: slate, noise: 0.12, all: (p, face) => {
        p.spots(dark, 6, 1, 3);
        if (face === 'top' || face === 'bottom') return;
        for (let y = 3; y < p.h; y += 4.5) p.rect(0, y, p.w, 0.35, seam, 0.02);
    } };
    const boulder = { color: slate, noise: 0.14, all: (p, face) => {
        p.spots(dark, 4, 1.5, 3);
        if (face === 'top') p.spots(moss, 5, 1, 2.5, 3);
    } };
    b.part('body', { pivot: [0, 14, 0], from: [-8, 0, -5], size: [16, 9, 10], paint: stone });
    b.part('chest', { parent: 'body', pivot: [0, 9, 0], from: [-10, 0, -6], size: [20, 10, 12], paint: stone, rotation: [0.12, 0, 0] });
    b.part('hump', { parent: 'chest', pivot: [0, 10, -3], from: [-6, -1, -3.5], size: [12, 4, 6], paint: boulder });
    b.part('head', { parent: 'chest', pivot: [0, 9, 2.5], from: [-4, 0, -4], size: [8, 7, 8], paint: { color: dark, noise: 0.1, all: (p) => p.spots(seam, 3, 1, 2) } });
    b.part('brow', { parent: 'head', pivot: [0, 0, 0], from: [-4.5, 4.5, 3], size: [9, 2, 2], paint: { color: slate, noise: 0.1 } });
    b.part('jaw', { parent: 'head', pivot: [0, 0, 0], from: [-3.5, -1, 1], size: [7, 2, 3.5], paint: { color: dark, noise: 0.08 } });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`arm${side}`, { parent: 'chest', pivot: [12.5 * sign, 8, 0], from: [-3, -15, -3], size: [6, 15, 6], paint: stone, rotation: [0, 0, 0.1 * sign] });
        b.part(`shoulder${side}`, { parent: `arm${side}`, pivot: [0, 0, 0], from: [-4.5, -3, -4.5], size: [9, 6, 9], paint: boulder });
        b.part(`fist${side}`, { parent: `arm${side}`, pivot: [0, -15, 0], from: [-4, -6, -4], size: [8, 6, 8], paint: { color: dark, noise: 0.12, all: (p) => p.spots(seam, 3, 1, 2) } });
        b.part(`leg${side}`, { pivot: [4.5 * sign, 14, 0], from: [-3, -14, -3], size: [6, 14, 6], paint: stone });
        b.part(`foot${side}`, { parent: `leg${side}`, pivot: [0, -14, 0], from: [-3.5, 0, -3.5], size: [7, 3, 8], paint: { color: dark, noise: 0.1 } });
    });
    return { legs: ['legL', 'legR'], arms: ['armL', 'armR'], head: 'head' };
};

// Glowing cracks: [part, from, size, kind] in model units relative to the part's pivot.
// Kinds: 'crack' (the veins), 'eye' and 'hand' (brighter while charging a discharge).
const STORM_GOLEM_CRACKS = [
    ['chest', [-1.5, 3.5, 5.85], [3, 3, 0.4], 'crack'],
    ['chest', [-0.5, 6.5, 5.85], [1, 3.5, 0.4], 'crack'],
    ['chest', [1.5, 4.5, 5.85], [4, 0.8, 0.4], 'crack'],
    ['chest', [5, 4.5, 5.85], [0.8, 3, 0.4], 'crack'],
    ['chest', [5, 7, 5.85], [3, 0.8, 0.4], 'crack'],
    ['chest', [-5.5, 3.5, 5.85], [4, 0.8, 0.4], 'crack'],
    ['chest', [-5.5, 0.5, 5.85], [0.8, 3.5, 0.4], 'crack'],
    ['chest', [-0.5, 0, 5.85], [1, 3.5, 0.4], 'crack'],
    ['chest', [-0.5, 1, -6.25], [1, 8, 0.4], 'crack'],
    ['chest', [-4, 5, -6.25], [3.5, 0.8, 0.4], 'crack'],
    ['chest', [0.5, 3, -6.25], [4, 0.8, 0.4], 'crack'],
    ['chest', [9.85, 2, -2], [0.4, 0.8, 4], 'crack'],
    ['chest', [-10.25, 5, -1], [0.4, 0.8, 3.5], 'crack'],
    ['body', [-0.4, 4, 4.85], [0.8, 5, 0.4], 'crack'],
    ['body', [-3.5, 4, 4.85], [3.1, 0.8, 0.4], 'crack'],
    ['body', [-3.5, 1, 4.85], [0.8, 3, 0.4], 'crack'],
    ['head', [-3, 2.5, 3.85], [2, 1.2, 0.4], 'eye'],
    ['head', [1, 2.5, 3.85], [2, 1.2, 0.4], 'eye'],
    ['head', [-0.5, 5, 4.85], [1, 1.2, 0.4], 'crack'],
    ['head', [-2.5, 0.2, 4.35], [5, 0.5, 0.4], 'crack']
];
[['L', 1], ['R', -1]].forEach(([side, sign]) => {
    const outer = sign > 0 ? 2.85 : -3.25;
    STORM_GOLEM_CRACKS.push(
        [`arm${side}`, [-0.4, -13, 2.85], [0.8, 5, 0.4], 'crack'],
        [`arm${side}`, [sign > 0 ? -0.4 : -1.6, -8.8, 2.85], [2, 0.8, 0.4], 'crack'],
        [`arm${side}`, [outer, -12, -0.4], [0.4, 7, 0.8], 'crack'],
        [`arm${side}`, [outer, -5.8, -2.5], [0.4, 0.8, 2.9], 'crack'],
        [`shoulder${side}`, [-0.4, 2.85, -3], [0.8, 0.4, 6], 'crack'],
        [`shoulder${side}`, [sign > 0 ? 4.35 : -4.75, -1, -2], [0.4, 0.8, 4], 'crack'],
        [`fist${side}`, [-3, -3.5, 3.85], [6, 0.8, 0.4], 'hand'],
        [`fist${side}`, [-0.4, -5.2, 3.85], [0.8, 1.7, 0.4], 'hand'],
        [`fist${side}`, [-3, -6.25, -3], [6, 0.4, 6], 'hand'],
        [`leg${side}`, [-0.4, -11, 2.85], [0.8, 4, 0.4], 'crack'],
        [`leg${side}`, [sign > 0 ? -0.4 : -1.6, -7.8, 2.85], [2, 0.8, 0.4], 'crack'],
        [`leg${side}`, [outer, -6, -1], [0.4, 4, 0.8], 'crack']
    );
});

registerMobBehaviour('storm', {
    update(mob, delta, player) {
        this.stormGolemUpdate(mob, delta, player);
    },
    interact(mob) {
        this.stormGolemHit(mob);
    },
    spawnCommand(species, x, z, player) {
        const floorY = this.cameraController.getFloorY(x, z, player.y + 4);
        if (floorY <= -20) {
            this.receiveSystemMessage({ text: 'Could not find safe ground for the storm golem' });
            return true;
        }
        const mob = this.createMob(species, new THREE.Vector3(x, floorY, z));
        mob.userData.direction = Math.atan2(player.z - mob.position.z, player.x - mob.position.x);
        this.ambientMobs.push(mob);
        this.receiveSystemMessage({ text: this.weatherState === 'rain' ? 'A storm golem was called down by the lightning' : 'A storm golem was called down; without rain it lasts a minute' });
        return true;
    }
});

// Its aiming line lives in the scene; take it away with the golem.
onMobEvent('removed', function (mob) {
    if (mob.userData.species === 'storm_golem') this.stormGolemClearAim(mob);
});

Object.assign(Game.prototype, {
    // While it rains, now and then a golem is born from a lightning strike 20-30 blocks away.
    stormGolemUpdateSpawning(delta) {
        this.stormGolemSpawnTimer = (this.stormGolemSpawnTimer ?? 12) - delta;
        if (this.stormGolemSpawnTimer > 0) return;
        this.stormGolemSpawnTimer = 10;
        if (this.weatherState !== 'rain' || !this.world || this.titleScreenOpen || this.respawnPending || Math.random() > 0.3) return;
        const alive = this.ambientMobs.filter((mob) => mob.userData.species === 'storm_golem' && mob.userData.crumbling === undefined);
        if (alive.length >= getMobSpecies('storm_golem').limit) return;
        const player = this.getLocalPlayerPosition();
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 10;
        const x = player.x + Math.cos(angle) * distance;
        const z = player.z + Math.sin(angle) * distance;
        const floor = this.cameraController.getFloorY(x, z, player.y + 16);
        if (floor <= -20 || this.findWaterSurface(x, floor + 0.1, z) !== null) return;
        const surface = this.world.getBlockTypeAt(Math.floor(x), floor - 1, Math.floor(z));
        if (!surface || surface.endsWith('leaves') || surface === 'cactus') return;
        const mob = this.createMob('storm_golem', new THREE.Vector3(x, floor, z));
        mob.userData.natural = true;
        const { chunkX, chunkZ } = this.world.getChunkCoords(x, z);
        mob.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
        this.ambientMobs.push(mob);
    },

    stormGolemUpdate(mob, delta, player) {
        const data = mob.userData;
        data.life += delta;
        this.stormGolemAttachGlow(mob);
        this.stormGolemAttachCloud(mob);

        if (data.crumbling !== undefined) {
            this.stormGolemUpdateCrumble(mob, delta);
            return;
        }

        // Born in a lightning strike.
        if (!data.arrived) {
            data.arrived = true;
            data.surge = 1.5;
            this.stormGolemStrike(_golemA.copy(mob.position).add(_golemB.set((Math.random() - 0.5) * 6, 48, (Math.random() - 0.5) * 6)), mob.position.clone(), { width: 0.2, branches: 4, flash: 1 });
            this.stormGolemSparks(mob.position, 30, false);
            this.emitSmoke(mob.position, 10, 1.4);
        }

        // Rain powers it; once it stops the cracks dim and it falls apart.
        if (!data.natural && data.rainGrace === undefined) data.rainGrace = 60;
        data.rainGrace = Math.max(0, (data.rainGrace || 0) - delta);
        const powered = this.weatherState === 'rain' || data.rainGrace > 0;
        data.power = THREE.MathUtils.clamp((data.power ?? 1) + (powered ? delta * 0.6 : -delta / 4), 0, 1);
        if (!powered && data.power <= 0) {
            this.stormGolemCrumble(mob, 'The storm golem crumbles as the storm passes', 32);
            return;
        }
        data.surge = Math.max(0, (data.surge || 0) - delta * 0.8);
        data.flinch = Math.max(0, (data.flinch || 0) - delta);

        const dx = player.x - mob.position.x;
        const dz = player.z - mob.position.z;
        const distance = Math.hypot(dx, dz);
        data.angry = Math.max(0, (data.angry || 0) - delta);
        if (data.wasAngry && data.angry <= 0) {
            this.stormGolemClearAim(mob);
            data.attack = null;
            if (distance < 32) this.receiveSystemMessage({ text: 'The storm golem calms down' });
        }
        data.wasAngry = data.angry > 0;
        if (data.facing === undefined) data.facing = data.direction;

        const info = getMobSpecies('storm_golem');
        let speed = 0;
        if (data.angry > 0 && powered && !this.titleScreenOpen && !this.respawnPending) {
            delete data.summon;
            data.facing = Math.atan2(dz, dx);
            speed = distance > 10 && (!data.attack || data.attack.phase === 'rest') ? 0.9 : 0;
            this.stormGolemUpdateDischarge(mob, delta, player, distance);
        } else {
            if (data.attack) {
                this.stormGolemClearAim(mob);
                data.attack = null;
            }
            if (data.moveTimer <= 0) {
                data.moveTimer = 4 + Math.random() * 5;
                data.facing += (Math.random() - 0.5) * 2.4;
                data.paused = Math.random() < 0.4;
            }
            if (!data.paused) speed = info.speed * (0.4 + data.power * 0.6);

            // Calls the lightning now and then.
            if (powered && data.summon === undefined) {
                data.strikeTimer = (data.strikeTimer ?? 5 + Math.random() * 6) - delta;
                if (data.strikeTimer <= 0) {
                    data.strikeTimer = 9 + Math.random() * 9;
                    data.summon = 1.5;
                    this.stormGolemPlayAt(mob.position, 30, (volume) => {
                        this.playTone({ frequency: 70, endFrequency: 120, duration: 1.3, type: 'sawtooth', volume: volume * 0.025, attack: 0.3, release: 0.4 });
                    });
                }
            }
        }

        if (data.summon !== undefined) {
            speed = 0;
            data.summon -= delta;
            this.stormGolemCrackle(mob, delta, 0.09);
            if (data.summon <= 0) {
                delete data.summon;
                this.stormGolemCallLightning(mob);
            }
        }

        let moving = false;
        if (speed > 0) {
            const step = this.walkStep(mob, data.facing, speed * delta, delta);
            if (step.moved) {
                moving = true;
                data.stepPhase += delta * speed * 9;
            } else if (!(data.angry > 0)) {
                data.facing += Math.PI * (0.5 + Math.random() * 0.4) * (Math.random() < 0.5 ? -1 : 1);
                data.moveTimer = 2 + Math.random() * 2;
            }
        }
        // Each footfall lands with a deep thud.
        const foot = Math.floor(data.stepPhase / Math.PI);
        if (foot !== data.lastFoot) {
            if (data.lastFoot !== undefined && moving) this.stormGolemStomp(mob);
            data.lastFoot = foot;
        }

        // A slow rumble from deep inside when the player is close.
        data.groan = (data.groan ?? 4) - delta;
        if (data.groan <= 0) {
            data.groan = 6 + Math.random() * 8;
            if (distance < 16) {
                const volume = 0.03 * (1 - distance / 16);
                this.playTone({ frequency: info.tone, endFrequency: info.tone * 0.7, duration: 1.4, type: 'sawtooth', volume: volume * 0.5, attack: 0.3, release: 0.6, detune: (Math.random() - 0.5) * 60 });
                this.playTone({ frequency: info.tone * 0.5, duration: 1.2, type: 'sine', volume, attack: 0.2, release: 0.6 });
            }
        }

        mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.PI / 2 - data.facing, Math.min(1, delta * 2.5));
        this.stormGolemPose(mob, delta, moving);
        this.stormGolemUpdateGlow(mob, delta);
        this.stormGolemUpdateCloud(mob, delta);
    },

    // Rest, charge (tracking, then locked with an aiming line) and fire, over and over.
    stormGolemUpdateDischarge(mob, delta, player, distance) {
        const data = mob.userData;
        const attack = data.attack = data.attack || { phase: 'rest', timer: 0.8 };
        attack.timer -= delta;
        if (attack.phase === 'rest') {
            if (attack.timer <= 0 && distance < 24) {
                attack.phase = 'charge';
                attack.timer = 1.4;
                attack.target = null;
            }
            return;
        }
        // Charging: crackling arcs between the fists.
        this.stormGolemCrackle(mob, delta, 0.06);
        attack.arc = (attack.arc || 0) - delta;
        if (attack.arc <= 0) {
            attack.arc = 0.12;
            this.stormGolemBolt(this.stormGolemFistPosition(mob, 'L', _golemA), this.stormGolemFistPosition(mob, 'R', _golemB), { width: 0.035, branches: 0, life: 0.1, segments: 4, flash: 0 });
        }
        const origin = this.stormGolemHandsPosition(mob, _golemC);
        if (!attack.target && attack.timer <= 0.55) {
            // Locks its aim: from now on, stepping aside dodges it.
            attack.target = new THREE.Vector3(player.x, player.y - 0.7, player.z);
            this.stormGolemPlayAt(mob.position, 30, (volume) => {
                this.playTone({ frequency: 300, endFrequency: 1500, duration: 0.55, type: 'sawtooth', volume: volume * 0.025, attack: 0.05, release: 0.1 });
            });
        }
        if (attack.target) this.stormGolemShowAim(mob, origin, attack.target);
        if (attack.timer > 0) return;

        // Fire along the locked line; blocks in the way take the bolt instead.
        const target = attack.target || new THREE.Vector3(player.x, player.y - 0.7, player.z);
        const direction = target.clone().sub(origin);
        const reach = Math.min(28, direction.length() + 6);
        direction.normalize();
        let end = origin.clone().addScaledVector(direction, reach);
        for (let s = 0.6; s < reach; s += 0.2) {
            const point = _golemA.copy(origin).addScaledVector(direction, s);
            if (this.world.hasSolidBlock(Math.floor(point.x), Math.floor(point.y), Math.floor(point.z))) {
                end = point.clone();
                break;
            }
        }
        const segment = new THREE.Line3(origin.clone(), end);
        let hit = null;
        for (const offset of [1.35, 0.8, 0.25]) {
            const body = new THREE.Vector3(player.x, player.y - offset, player.z);
            const closest = segment.closestPointToPoint(body, true, _golemB);
            if (closest.distanceTo(body) < 0.85) {
                hit = body;
                break;
            }
        }
        if (hit && !this.respawnPending) end = hit;
        this.stormGolemClearAim(mob);
        this.stormGolemBolt(origin, end, { width: 0.1, branches: 2, life: 0.32, segments: 10, flash: 0.45 });
        this.stormGolemSparks(end, 18, false);
        this.stormGolemPlayAt(mob.position, 40, (volume) => {
            this.playTone({ frequency: 1400, endFrequency: 120, duration: 0.3, type: 'sawtooth', volume: volume * 0.05, release: 0.15 });
            this.playNoiseBurst({ duration: 0.2, volume: volume * 0.06, highpass: 1500, lowpass: 9000 });
        });
        if (hit && !this.respawnPending) {
            this.applyDamage(2 + (Math.random() < 0.5 ? 1 : 0), 'You were struck down by a storm golem', 'mob');
            this.playNoiseBurst({ duration: 0.15, volume: 0.05, highpass: 2500, lowpass: 9000 });
        }
        data.recoil = 0.35;
        attack.phase = 'rest';
        attack.timer = 1.4 + Math.random() * 0.6;
        attack.target = null;
    },

    // The bolt from the sky: onto a nearby metal block now and then, otherwise onto itself.
    stormGolemCallLightning(mob) {
        const data = mob.userData;
        const metal = Math.random() < 0.6 ? this.stormGolemFindMetal(mob.position) : null;
        const sky = _golemB.set((Math.random() - 0.5) * 8, 48, (Math.random() - 0.5) * 8);
        if (metal) {
            const top = new THREE.Vector3(metal.x + 0.5, metal.y + 1, metal.z + 0.5);
            this.stormGolemStrike(top.clone().add(sky), top, { width: 0.18, branches: 4, flash: 0.9 });
            this.stormGolemSparks(top, 45, true);
            // The charge arcs on to the golem's raised fist.
            this.stormGolemBolt(top, this.stormGolemFistPosition(mob, Math.random() < 0.5 ? 'L' : 'R', _golemA), { width: 0.05, branches: 1, life: 0.3, segments: 8, flash: 0 });
            data.surge = 0.8;
            const player = this.getLocalPlayerPosition();
            if (!this.respawnPending && Math.hypot(player.x - top.x, player.z - top.z) < 1.6 && Math.abs(player.y - 1.6 - top.y) < 2.5) {
                this.applyDamage(2, 'You were struck by lightning', 'lightning');
            }
            return;
        }
        const head = data.modelParts.head.localToWorld(_golemA.set(0, 8 / 16, 0)).clone();
        this.stormGolemStrike(head.clone().add(sky), head, { width: 0.2, branches: 4, flash: 1 });
        this.stormGolemSparks(head, 35, false);
        data.surge = 1.6;
        data.health = Math.min(data.maxHealth, data.health + 4);
        this.updateMobHealthBar(mob);
    },

    // Iron, copper or gold blocks within 12 blocks, preferring ones open to the sky.
    stormGolemFindMetal(center) {
        const cx = Math.floor(center.x);
        const cy = Math.floor(center.y);
        const cz = Math.floor(center.z);
        const found = [];
        for (let dx = -12; dx <= 12; dx++) {
            for (let dz = -12; dz <= 12; dz++) {
                if (dx * dx + dz * dz > 144) continue;
                for (let dy = -4; dy <= 8; dy++) {
                    if (STORM_GOLEM_METALS.includes(this.world.getBlockTypeAt(cx + dx, cy + dy, cz + dz))) found.push({ x: cx + dx, y: cy + dy, z: cz + dz });
                }
            }
        }
        if (!found.length) return null;
        const open = found.filter((block) => {
            for (let y = block.y + 1; y < block.y + 16; y++) if (this.world.hasSolidBlock(block.x, y, block.z)) return false;
            return true;
        });
        const pool = open.length ? open : found;
        return pool[Math.floor(Math.random() * pool.length)];
    },

    // A lightning bolt from the sky with its flash and (distant) thunder.
    stormGolemStrike(from, to, { width = 0.18, branches = 4, flash = 1 } = {}) {
        this.stormGolemBolt(from, to, { width, branches, life: 0.5, segments: 16, flash });
        this.stormGolemThunder(to);
    },

    // Jagged bolt of stretched boxes: a hot core and a wide soft glow, with side branches.
    // It flickers twice (re-striking the flash) and fades.
    stormGolemBolt(from, to, { width = 0.12, branches = 3, life = 0.4, segments = 12, flash = 1 } = {}) {
        from = from.clone();
        to = to.clone();
        const boost = this.ultraModeEnabled ? 6 : this.rtxModeEnabled ? 1.6 : 1;
        const core = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
        core.color.setRGB(0.85 * boost, 0.92 * boost, boost);
        const glow = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
        glow.color.setRGB(0.35 * Math.min(boost, 2.5), 0.55 * Math.min(boost, 2.5), Math.min(boost, 2.5));
        const group = new THREE.Group();
        const length = from.distanceTo(to);
        const points = this.stormGolemJagged(from, to, segments, length * 0.07);
        this.stormGolemAddSegments(group, points, width, core, glow);
        for (let i = 0; i < branches && points.length > 3; i++) {
            const start = points[1 + Math.floor(Math.random() * (points.length - 3))];
            const end = start.clone().add(_golemA.copy(to).sub(from).normalize().multiplyScalar(length * (0.12 + Math.random() * 0.15)))
                .add(_golemB.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.4, Math.random() - 0.5).multiplyScalar(length * 0.25));
            this.stormGolemAddSegments(group, this.stormGolemJagged(start, end, 5, length * 0.03), width * 0.5, core, glow);
        }
        this.scene.add(group);
        this.stormGolemBolts = this.stormGolemBolts || [];
        this.stormGolemBolts.push({ group, core, glow, age: 0, life, flash, at: to.clone() });
        if (flash > 0) this.stormGolemFlashAt(to, flash);
    },

    stormGolemJagged(from, to, count, amplitude) {
        const direction = new THREE.Vector3().subVectors(to, from).normalize();
        const side = new THREE.Vector3().crossVectors(direction, Math.abs(direction.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : _golemUp).normalize();
        const other = new THREE.Vector3().crossVectors(direction, side).normalize();
        const points = [from.clone()];
        for (let i = 1; i < count; i++) {
            const t = i / count;
            const sway = amplitude * (0.4 + 0.6 * Math.sin(Math.PI * t));
            points.push(from.clone().lerp(to, t)
                .addScaledVector(side, (Math.random() - 0.5) * 2 * sway)
                .addScaledVector(other, (Math.random() - 0.5) * 2 * sway));
        }
        points.push(to.clone());
        return points;
    },

    stormGolemAddSegments(group, points, width, core, glow) {
        const box = this.stormGolemUnitBox();
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const length = a.distanceTo(b);
            if (length < 0.001) continue;
            const direction = _golemB.copy(b).sub(a).divideScalar(length);
            [[core, width], [glow, width * 4]].forEach(([material, thickness]) => {
                const mesh = new THREE.Mesh(box, material);
                mesh.position.copy(a).add(b).multiplyScalar(0.5);
                mesh.quaternion.setFromUnitVectors(_golemUp, direction);
                mesh.scale.set(thickness, length + thickness * 0.5, thickness);
                mesh.renderOrder = 20;
                group.add(mesh);
            });
        }
    },

    stormGolemUnitBox() {
        if (!this.stormGolemBox) this.stormGolemBox = new THREE.BoxGeometry(1, 1, 1);
        return this.stormGolemBox;
    },

    // Lights up the scene for a moment: ambient light, sky and a point light at the strike.
    stormGolemFlashAt(position, strength) {
        const camera = this.camera.position;
        const falloff = THREE.MathUtils.clamp(1 - position.distanceTo(camera) / 90, 0.2, 1);
        this.stormGolemFlash = Math.max(this.stormGolemFlash || 0, strength * falloff);
        this.stormGolemEnsureLight();
        this.stormGolemLight.position.set(position.x, position.y + 3, position.z);
    },

    // One light kept in the scene for good, so adding it doesn't recompile shaders mid-flash.
    stormGolemEnsureLight() {
        if (this.stormGolemLight) return;
        this.stormGolemLight = new THREE.PointLight(0xc4d8ff, 0, 34, 1.4);
        this.scene.add(this.stormGolemLight);
    },

    // Thunder: a crack when close, then a long rolling rumble, later the further away.
    stormGolemThunder(position) {
        const distance = position.distanceTo(this.camera.position);
        const delay = Math.min(3, distance / 34);
        const loud = THREE.MathUtils.clamp(1 - distance / 120, 0.15, 1);
        if (distance < 24) this.stormGolemNoise({ delay: 0, duration: 0.25, volume: 0.06 * loud, highpass: 2500, lowpass: 12000 });
        this.stormGolemNoise({ delay, duration: 0.35, volume: 0.09 * loud * (distance < 30 ? 1 : 0.4), highpass: 300, lowpass: 5000 });
        this.stormGolemNoise({ delay: delay + 0.05, duration: 2.8, volume: 0.11 * loud, highpass: 25, lowpass: 320, attack: 0.08 });
        this.stormGolemNoise({ delay: delay + 0.7, duration: 2.2, volume: 0.07 * loud, highpass: 25, lowpass: 220, attack: 0.3 });
        setTimeout(() => this.playTone({ frequency: 48, endFrequency: 26, duration: 2.4, type: 'sine', volume: 0.06 * loud, attack: 0.04, release: 1.4 }), delay * 1000);
    },

    // Filtered noise from its own longer buffer (the shared one is a 0.2 s click), optionally
    // delayed: rolling thunder and rumbles.
    stormGolemNoise({ delay = 0, duration, volume, highpass = 30, lowpass = 400, attack = 0.005 }) {
        const audio = this.ensureAudio();
        if (!audio || audio.state !== 'running') return;
        if (!this.stormGolemNoiseBuffer) {
            const buffer = audio.createBuffer(1, audio.sampleRate * 3, audio.sampleRate);
            const samples = buffer.getChannelData(0);
            let last = 0;
            for (let i = 0; i < samples.length; i++) {
                // Brownish noise with gusts, for a rumble that rolls instead of hissing.
                last = last * 0.96 + (Math.random() * 2 - 1) * 0.3;
                samples[i] = last * (0.6 + 0.4 * Math.sin(i / audio.sampleRate * 7.3) * Math.sin(i / audio.sampleRate * 2.1));
            }
            this.stormGolemNoiseBuffer = buffer;
        }
        const start = audio.currentTime + delay;
        const source = audio.createBufferSource();
        source.buffer = this.stormGolemNoiseBuffer;
        source.loop = true;
        const hp = audio.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(highpass, start);
        const lp = audio.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(lowpass, start);
        const gain = audio.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * 3 * this.masterVolume), start + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        source.connect(hp).connect(lp).connect(gain).connect(audio.destination);
        source.start(start, Math.random() * 2);
        source.stop(start + duration + 0.05);
    },

    // Calls play(volume) when the player is within range, with volume fading with distance.
    stormGolemPlayAt(position, range, play) {
        const distance = position.distanceTo(this.camera.position);
        if (distance < range) play(1 - distance / range);
    },

    stormGolemStomp(mob) {
        this.stormGolemPlayAt(mob.position, 28, (volume) => {
            this.playTone({ frequency: 62, endFrequency: 30, duration: 0.32, type: 'sine', volume: volume * 0.09, attack: 0.005, release: 0.2 });
            this.playTone({ frequency: 110, endFrequency: 55, duration: 0.12, type: 'triangle', volume: volume * 0.03, release: 0.08 });
            this.stormGolemNoise({ duration: 0.3, volume: volume * 0.05, highpass: 25, lowpass: 180 });
        });
    },

    stormGolemCrackle(mob, delta, interval) {
        const data = mob.userData;
        data.crackle = (data.crackle || 0) - delta;
        if (data.crackle > 0) return;
        data.crackle = interval * (0.5 + Math.random());
        this.stormGolemPlayAt(mob.position, 22, (volume) => {
            this.playNoiseBurst({ duration: 0.03 + Math.random() * 0.04, volume: volume * 0.03, highpass: 2500 + Math.random() * 3000, lowpass: 11000 });
        });
        if (Math.random() < 0.35) {
            const side = Math.random() < 0.5 ? 'L' : 'R';
            this.stormGolemSparks(this.stormGolemFistPosition(mob, side, _golemA), 2, false);
        }
    },

    // World position of the middle of a fist, and of both hands together.
    stormGolemFistPosition(mob, side, target) {
        return mob.userData.modelParts[`fist${side}`].localToWorld(target.set(0, -3 / 16, 0));
    },

    stormGolemHandsPosition(mob, target) {
        const left = this.stormGolemFistPosition(mob, 'L', target);
        const right = this.stormGolemFistPosition(mob, 'R', new THREE.Vector3());
        return left.add(right).multiplyScalar(0.5);
    },

    // Faint flickering line along the locked aim: the warning to step aside.
    stormGolemShowAim(mob, origin, target) {
        const data = mob.userData;
        if (!data.aimLine) {
            data.aimMaterial = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
            data.aimLine = new THREE.Mesh(this.stormGolemUnitBox(), data.aimMaterial);
            this.scene.add(data.aimLine);
        }
        const boost = this.ultraModeEnabled ? 2.5 : 1;
        data.aimMaterial.color.setRGB(0.45 * boost, 0.7 * boost, boost);
        data.aimMaterial.opacity = 0.25 + Math.random() * 0.25;
        const direction = _golemA.copy(target).sub(origin);
        const length = Math.min(28, direction.length() + 6);
        direction.normalize();
        data.aimLine.position.copy(origin).addScaledVector(direction, length / 2);
        data.aimLine.quaternion.setFromUnitVectors(_golemUp, direction);
        data.aimLine.scale.set(0.025, length, 0.025);
    },

    stormGolemClearAim(mob) {
        const data = mob.userData;
        if (!data.aimLine) return;
        this.scene.remove(data.aimLine);
        data.aimMaterial.dispose();
        data.aimLine = null;
        data.aimMaterial = null;
    },

    // Glowing crack meshes on the model's parts (re-added when the model is rebuilt).
    stormGolemAttachGlow(mob) {
        const data = mob.userData;
        const parts = data.modelParts;
        if (!data.crackMaterials) {
            data.crackMaterials = {
                crack: new THREE.MeshBasicMaterial({ color: 0x8cc8ff }),
                eye: new THREE.MeshBasicMaterial({ color: 0xdff0ff }),
                hand: new THREE.MeshBasicMaterial({ color: 0x8cc8ff })
            };
            data.glowMaterials = (data.glowMaterials || []).concat(Object.values(data.crackMaterials));
        }
        if (data.cracks && data.cracks[0].parent === parts.chest) return;
        const box = this.stormGolemUnitBox();
        const unit = 1 / 16;
        data.cracks = STORM_GOLEM_CRACKS.map(([partName, from, size, kind]) => {
            const mesh = new THREE.Mesh(box, data.crackMaterials[kind]);
            mesh.position.set((from[0] + size[0] / 2) * unit, (from[1] + size[1] / 2) * unit, (from[2] + size[2] / 2) * unit);
            mesh.scale.set(size[0] * unit, size[1] * unit, size[2] * unit);
            mesh.userData.mobRoot = mob;
            parts[partName].add(mesh);
            return mesh;
        });
    },

    // Brightness follows its power (dimming as the rain ends), a slow pulse, the surge after
    // a strike and the charge in its fists. HDR in Ultra so the cracks bloom.
    stormGolemUpdateGlow(mob, delta) {
        const data = mob.userData;
        const boost = this.ultraModeEnabled ? 4 : this.rtxModeEnabled ? 1.6 : 1;
        const charging = data.attack && data.attack.phase === 'charge';
        let level = (data.power ?? 1) * (0.6 + Math.sin(data.life * 2.3) * 0.15 + Math.sin(data.life * 7.1) * 0.06)
            + (data.surge || 0) * 0.9 + (data.summon !== undefined ? 0.5 : 0) + (data.angry > 0 ? 0.25 + Math.sin(data.life * 12) * 0.12 : 0);
        // A failing golem sputters.
        if ((data.power ?? 1) < 0.7 && Math.random() < delta * 8 * (1 - data.power)) level *= 0.25;
        const set = (material, r, g, b, k) => {
            const lit = Math.min(1, k);
            const scale = Math.max(1, k) * boost;
            material.color.setRGB(0.1 * (1 - lit) + r * lit * scale, 0.11 * (1 - lit) + g * lit * scale, 0.13 * (1 - lit) + b * lit * scale);
        };
        const materials = data.crackMaterials;
        set(materials.crack, 0.5, 0.76, 1, level);
        set(materials.eye, 0.85, 0.93, 1, level + 0.35);
        const charge = charging ? 1 + (1.4 - Math.max(0, data.attack.timer)) * 1.4 : 0;
        set(materials.hand, 0.6, 0.82, 1, level + charge + (data.recoil || 0) * 3);
        data.recoil = Math.max(0, (data.recoil || 0) - delta);
    },

    // A small storm cloud of grey blocks that swirls over its head, flickering inside and
    // shedding rain onto it.
    stormGolemAttachCloud(mob) {
        const data = mob.userData;
        if (data.cloud) return;
        this.stormGolemEnsureLight();
        const box = this.stormGolemUnitBox();
        const cloud = new THREE.Group();
        cloud.position.y = 3.2;
        const light = new THREE.MeshLambertMaterial({ color: 0x737b88, transparent: true, opacity: 0.94 });
        const dark = new THREE.MeshLambertMaterial({ color: 0x3e444e, transparent: true, opacity: 0.94 });
        const flicker = new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0 });
        const drops = new THREE.MeshBasicMaterial({ color: 0x9fb4cc, transparent: true, opacity: 0.55 });
        data.cloudMaterials = [light, dark, flicker, drops];
        data.glowMaterials = (data.glowMaterials || []).concat(data.cloudMaterials);
        data.cloudPuffs = [];
        for (let i = 0; i < 11; i++) {
            const angle = (i / 11) * Math.PI * 2 + Math.random() * 0.4;
            const radius = i < 3 ? Math.random() * 0.2 : 0.3 + Math.random() * 0.45;
            const puff = new THREE.Mesh(box, i % 3 === 0 ? dark : light);
            puff.position.set(Math.cos(angle) * radius, (Math.random() - 0.3) * 0.25, Math.sin(angle) * radius);
            puff.scale.set(0.35 + Math.random() * 0.3, 0.22 + Math.random() * 0.2, 0.35 + Math.random() * 0.3);
            puff.userData.baseY = puff.position.y;
            puff.userData.phase = Math.random() * Math.PI * 2;
            cloud.add(puff);
            data.cloudPuffs.push(puff);
        }
        const core = new THREE.Mesh(box, flicker);
        core.scale.set(0.7, 0.2, 0.7);
        core.position.y = -0.05;
        cloud.add(core);
        data.cloudDrops = [];
        for (let i = 0; i < 9; i++) {
            const drop = new THREE.Mesh(box, drops);
            drop.scale.set(0.025, 0.2, 0.025);
            drop.position.set((Math.random() - 0.5) * 1, -Math.random() * 0.6, (Math.random() - 0.5) * 1);
            cloud.add(drop);
            data.cloudDrops.push(drop);
        }
        cloud.traverse((node) => { if (node.isMesh) node.userData.mobRoot = mob; });
        data.cloud = cloud;
        mob.add(cloud);
    },

    stormGolemUpdateCloud(mob, delta, fade = 1) {
        const data = mob.userData;
        const cloud = data.cloud;
        if (!cloud) return;
        const power = data.power ?? 1;
        cloud.rotation.y += delta * (0.5 + (data.surge || 0) + (data.angry > 0 ? 1 : 0));
        cloud.position.y = 3.2 + Math.sin(data.life * 0.9) * 0.06;
        cloud.scale.setScalar(Math.max(0.01, (0.6 + power * 0.4) * fade));
        data.cloudPuffs.forEach((puff) => {
            puff.position.y = puff.userData.baseY + Math.sin(data.life * 1.3 + puff.userData.phase) * 0.05;
        });
        const [light, dark, flicker, drops] = data.cloudMaterials;
        light.opacity = dark.opacity = 0.94 * fade;
        drops.opacity = 0.55 * fade * power;
        // Lightning inside the cloud, and now and then a tiny bolt onto its head.
        data.cloudFlicker = Math.max(0, (data.cloudFlicker || 0) - delta * 6);
        if (Math.random() < delta * (0.8 + (data.surge || 0) * 4 + (data.summon !== undefined ? 6 : 0)) * power) {
            data.cloudFlicker = 1;
            if (Math.random() < 0.3 && fade > 0.5) {
                const head = data.modelParts.head.localToWorld(_golemA.set(0, 7 / 16, 0)).clone();
                this.stormGolemBolt(cloud.localToWorld(_golemB.set(0, -0.1, 0)).clone(), head, { width: 0.03, branches: 0, life: 0.12, segments: 4, flash: 0 });
                this.stormGolemPlayAt(mob.position, 14, (volume) => this.playNoiseBurst({ duration: 0.05, volume: volume * 0.02, highpass: 3000, lowpass: 10000 }));
            }
        }
        const boost = this.ultraModeEnabled ? 3 : 1;
        flicker.color.setRGB(0.75 * boost, 0.85 * boost, boost);
        flicker.opacity = data.cloudFlicker * fade;
        data.cloudDrops.forEach((drop) => {
            drop.position.y -= delta * 3;
            if (drop.position.y < -0.75) drop.position.set((Math.random() - 0.5) * 1, -0.1, (Math.random() - 0.5) * 1);
        });
    },

    // Heavy, hunched gait; arms raised to the sky when calling lightning, thrust forward
    // when charging a discharge.
    stormGolemPose(mob, delta, moving) {
        const data = mob.userData;
        const parts = data.modelParts;
        data.gait += ((moving ? 1 : 0) - data.gait) * Math.min(1, delta * 4);
        const phase = data.stepPhase;
        const swing = Math.sin(phase);
        const ease = Math.min(1, delta * 3);
        data.raise = (data.raise || 0) + ((data.summon !== undefined ? 1 : 0) - (data.raise || 0)) * ease;
        const aiming = data.attack && data.attack.phase === 'charge';
        data.aim = (data.aim || 0) + ((aiming ? 1 : 0) - (data.aim || 0)) * Math.min(1, delta * 5);

        parts.legL.rotation.x = swing * 0.4 * data.gait;
        parts.legR.rotation.x = -swing * 0.4 * data.gait;
        data.modelRoot.position.y = Math.abs(swing) * 0.06 * data.gait;
        parts.body.rotation.z = swing * 0.05 * data.gait;
        parts.chest.rotation.x = 0.12 + Math.sin(data.life * 1.2) * 0.02 - data.flinch * 0.8 - data.raise * 0.18 + (data.recoil || 0) * -0.4;
        [['L', 1], ['R', -1]].forEach(([side, sign]) => {
            const arm = parts[`arm${side}`];
            let x = swing * 0.35 * data.gait * sign + Math.sin(data.life * 0.8 + sign) * 0.04;
            let z = 0.1 * sign;
            x += (-2.7 - x) * data.raise;
            z += (0.35 * sign - z) * data.raise;
            x += (-1.45 + Math.sin(data.life * 30) * 0.03 - x) * data.aim;
            z += (-0.22 * sign - z) * data.aim;
            arm.rotation.x = x - (data.recoil || 0) * 0.8;
            arm.rotation.z = z;
        });
        const head = parts.head;
        head.rotation.x = 0.08 - data.raise * 0.5 + Math.sin(data.life * 0.6) * 0.03;
        head.rotation.y = Math.sin(data.life * 0.4) * 0.15 * (1 - data.aim);
    },

    // Struck: sparks fly and it turns on the player for a while; broken, it crumbles.
    stormGolemHit(mob) {
        const data = mob.userData;
        if (data.crumbling !== undefined) return;
        data.health -= 4;
        this.updateMobHealthBar(mob);
        data.flinch = 0.3;
        this.stormGolemSparks(_golemA.copy(mob.position).setY(mob.position.y + 1.5), 14, false);
        this.playNoiseBurst({ duration: 0.12, volume: 0.04, highpass: 120, lowpass: 1400 });
        this.playTone({ frequency: 95, endFrequency: 60, duration: 0.2, type: 'square', volume: 0.025, release: 0.12 });
        if (data.health <= 0) {
            this.emitMobEvent('defeated', mob, 'player');
            this.stormGolemCrumble(mob, 'You toppled the storm golem', Infinity);
            return;
        }
        if (!(data.angry > 0)) {
            this.receiveSystemMessage({ text: 'The storm golem turns its fury on you' });
            this.playTone({ frequency: 70, endFrequency: 45, duration: 1, type: 'sawtooth', volume: 0.04, attack: 0.05, release: 0.5 });
            this.stormGolemNoise({ duration: 1, volume: 0.04, highpass: 25, lowpass: 260, attack: 0.05 });
            data.attack = { phase: 'rest', timer: 0.6 };
        }
        data.angry = 15;
        delete data.summon;
    },

    stormGolemCrumble(mob, message, range) {
        const data = mob.userData;
        data.crumbling = 0;
        if (data.healthBar) data.healthBar.visible = false;
        this.stormGolemClearAim(mob);
        data.spin = ['chest', 'head', 'armL', 'armR', 'legL', 'legR'].map((name) => ({ name, x: (Math.random() - 0.5) * 1.6, z: (Math.random() - 0.5) * 1.6 }));
        data.modelRoot.traverse((node) => {
            if (node.isMesh && node.material && node.userData.modelMap) node.material.transparent = true;
        });
        const distance = mob.position.distanceTo(this.camera.position);
        if (distance < 40) {
            const volume = 1 - distance / 40;
            this.stormGolemNoise({ duration: 2.2, volume: 0.07 * volume, highpass: 40, lowpass: 700, attack: 0.05 });
            this.playTone({ frequency: 80, endFrequency: 35, duration: 1.8, type: 'sawtooth', volume: 0.03 * volume, attack: 0.05, release: 0.8 });
        }
        if (message && distance < range) this.receiveSystemMessage({ text: message });
    },

    // Cracks sputter out, the blocks slump and tumble apart into rubble and dust.
    stormGolemUpdateCrumble(mob, delta) {
        const data = mob.userData;
        data.crumbling += delta;
        const t = Math.min(1, data.crumbling / 2.4);
        data.power = Math.max(0, (data.power ?? 1) - delta);
        data.surge = 0;
        data.angry = 0;
        data.attack = null;
        this.stormGolemUpdateGlow(mob, delta);
        this.stormGolemUpdateCloud(mob, delta, 1 - t);
        data.spin.forEach(({ name, x, z }) => {
            const part = data.modelParts[name];
            part.rotation.x += x * delta * t;
            part.rotation.z += z * delta * t;
        });
        data.modelRoot.position.y = -t * t * 1.4;
        data.modelRoot.scale.setScalar(1 - t * 0.25);
        const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
        data.modelRoot.traverse((node) => {
            if (node.isMesh && node.material && node.userData.modelMap) node.material.opacity = fade;
        });
        if (Math.random() < delta * 14) {
            this.stormGolemRubble(_golemA.copy(mob.position).setY(mob.position.y + 0.4 + Math.random() * 1.8 * (1 - t)), 1);
        }
        if (Math.random() < delta * 8) this.emitSmoke(_golemA.copy(mob.position).setY(mob.position.y - 0.4), 1, 1.3);
        if (t >= 1) {
            this.stormGolemRubble(_golemA.copy(mob.position).setY(mob.position.y + 0.4), 10);
            this.emitSmoke(mob.position, 6, 1.6);
            this.removeMob(mob);
        }
    },

    // Bright sparks (blue-white, or hot orange off metal) that fly and fall.
    stormGolemSparks(position, count, hot) {
        if (!this.stormGolemSparkMaterials) {
            this.stormGolemSparkMaterials = { cold: new THREE.MeshBasicMaterial({ color: 0xcfe6ff }), hot: new THREE.MeshBasicMaterial({ color: 0xffc070 }) };
        }
        this.stormGolemSparkList = this.stormGolemSparkList || [];
        const box = this.stormGolemUnitBox();
        for (let i = 0; i < count && this.stormGolemSparkList.length < 260; i++) {
            const material = hot && Math.random() < 0.6 ? this.stormGolemSparkMaterials.hot : this.stormGolemSparkMaterials.cold;
            const spark = new THREE.Mesh(box, material);
            spark.position.copy(position);
            spark.scale.setScalar(0.04 + Math.random() * 0.05);
            const speed = 2.5 + Math.random() * 4;
            spark.userData.velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed);
            spark.userData.age = 0;
            spark.userData.life = 0.35 + Math.random() * 0.45;
            spark.userData.size = spark.scale.x;
            this.scene.add(spark);
            this.stormGolemSparkList.push(spark);
        }
    },

    // Slate chunks that tumble out, bounce to rest on the ground and shrink away.
    stormGolemRubble(position, count) {
        if (!this.stormGolemRubbleMaterial) this.stormGolemRubbleMaterial = new THREE.MeshLambertMaterial({ color: 0x3c424c });
        this.stormGolemRubbleList = this.stormGolemRubbleList || [];
        const box = this.stormGolemUnitBox();
        for (let i = 0; i < count && this.stormGolemRubbleList.length < 140; i++) {
            const rock = new THREE.Mesh(box, this.stormGolemRubbleMaterial);
            rock.position.set(position.x + (Math.random() - 0.5) * 0.9, position.y, position.z + (Math.random() - 0.5) * 0.9);
            const size = 0.12 + Math.random() * 0.22;
            rock.scale.setScalar(size);
            rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.8 + Math.random() * 2;
            rock.userData = {
                velocity: new THREE.Vector3(Math.cos(angle) * speed, 1.5 + Math.random() * 2.5, Math.sin(angle) * speed),
                spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(10),
                floor: this.cameraController.getFloorY(rock.position.x, rock.position.z, position.y + 2) + size / 2,
                age: 0,
                size
            };
            this.scene.add(rock);
            this.stormGolemRubbleList.push(rock);
        }
    },

    // Every frame, with or without golems around: spawning, bolts, sparks, rubble, flash.
    stormGolemUpdateWorld(delta) {
        this.stormGolemUpdateSpawning(delta);
        const boost = this.ultraModeEnabled ? 5 : 1;

        if (this.stormGolemBolts && this.stormGolemBolts.length) {
            this.stormGolemBolts = this.stormGolemBolts.filter((bolt) => {
                bolt.age += delta;
                const t = bolt.age / bolt.life;
                if (t >= 1) {
                    this.scene.remove(bolt.group);
                    bolt.core.dispose();
                    bolt.glow.dispose();
                    return false;
                }
                // Strike, a dark blink, a second stroke, then it fades.
                bolt.group.visible = bolt.age < 0.07 || bolt.age > 0.12;
                if (!bolt.restruck && bolt.age > 0.12 && bolt.flash > 0) {
                    bolt.restruck = true;
                    this.stormGolemFlashAt(bolt.at, bolt.flash * 0.8);
                }
                const fade = t < 0.45 ? 1 : 1 - (t - 0.45) / 0.55;
                bolt.core.opacity = fade;
                bolt.glow.opacity = 0.32 * fade;
                return true;
            });
        }

        if (this.stormGolemSparkList && this.stormGolemSparkList.length) {
            const { cold, hot } = this.stormGolemSparkMaterials;
            cold.color.setRGB(0.8 * boost, 0.9 * boost, boost);
            hot.color.setRGB(boost, 0.72 * boost, 0.4 * boost);
            this.stormGolemSparkList = this.stormGolemSparkList.filter((spark) => {
                const data = spark.userData;
                data.age += delta;
                if (data.age >= data.life) {
                    this.scene.remove(spark);
                    return false;
                }
                data.velocity.y -= 14 * delta;
                spark.position.addScaledVector(data.velocity, delta);
                spark.scale.setScalar(data.size * (1 - data.age / data.life));
                return true;
            });
        }

        if (this.stormGolemRubbleList && this.stormGolemRubbleList.length) {
            this.stormGolemRubbleList = this.stormGolemRubbleList.filter((rock) => {
                const data = rock.userData;
                data.age += delta;
                if (data.age >= 4) {
                    this.scene.remove(rock);
                    return false;
                }
                if (rock.position.y > data.floor || data.velocity.y > 0) {
                    data.velocity.y -= 16 * delta;
                    rock.position.addScaledVector(data.velocity, delta);
                    rock.rotation.x += data.spin.x * delta;
                    rock.rotation.z += data.spin.z * delta;
                    if (rock.position.y <= data.floor && data.velocity.y < 0) {
                        rock.position.y = data.floor;
                        // One small bounce, then it settles.
                        data.velocity.set(data.velocity.x * 0.4, Math.abs(data.velocity.y) > 3 ? -data.velocity.y * 0.25 : 0, data.velocity.z * 0.4);
                        if (data.velocity.y === 0) data.velocity.set(0, 0, 0);
                    }
                }
                if (data.age > 3) rock.scale.setScalar(data.size * (4 - data.age));
                return true;
            });
        }

        // The flash: added on top of the lighting that the day cycle sets every frame (with the
        // cycle off nothing resets it, so last frame's boost is taken back first).
        const flash = this.stormGolemFlash || 0;
        if (this.stormGolemLight) this.stormGolemLight.intensity = flash * (this.rtxModeEnabled ? 9 : 5);
        const applied = this.stormGolemFlashApplied;
        if (applied && !this.dayNightCycleEnabled) {
            this.ambientLight.intensity -= applied.ambient;
            this.hemiLight.intensity -= applied.hemi;
        }
        this.stormGolemFlashApplied = null;
        if (flash <= 0) return;
        const flicker = flash * (0.75 + Math.random() * 0.25);
        this.stormGolemFlashApplied = { ambient: flicker * 0.8, hemi: flicker * 1.1 };
        this.ambientLight.intensity += flicker * 0.8;
        this.hemiLight.intensity += flicker * 1.1;
        if (this.dayNightCycleEnabled && this.scene.background && this.scene.background.isColor) {
            this.scene.background.lerp(_golemFlashColor, flicker * 0.55);
            if (this.scene.fog) this.scene.fog.color.lerp(_golemFlashColor, flicker * 0.4);
        }
        this.stormGolemFlash = Math.max(0, flash - delta * 5);
    }
});

// Spawning in the rain, lightning, sparks, rubble and the flash: every frame, golems or not.
registerFrameUpdate(function (delta) {
    this.stormGolemUpdateWorld(delta);
});
