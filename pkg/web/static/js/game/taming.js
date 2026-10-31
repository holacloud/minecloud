// Taming and breeding. Right-click a mob while holding one of its foods (TAMING_DIET) to try
// to tame it: one item is eaten and, with the species' chance, it becomes yours (hearts) or
// shrugs it off (smoke). Tamed mobs are never despawned, follow their owner (catching up by
// teleport when left far behind) and sit / stand up with an empty-handed right click (mounts
// need Shift + right click, so that a plain right click still rides them). Feeding a tamed
// adult again puts it in love for a while: two adults of the same species in love walk to each
// other and have a baby that grows up in a few minutes, following its parents. Tamed mobs are
// kept in localStorage and come back when the world around them has loaded.
//
// Only mobs that walk to registerMobGoal targets can be tamed: ground mobs and goats ('climb'),
// see TAMING_GOAL_MOVEMENTS; a behaviour registered with registerMobBehaviour can opt in with
// `tameable: true` if its update() honours getMobGoal and `userData.resting`.
//
// Mobs are not synced between players, so tamed mobs live in this browser only (`owner` is
// informative). Mixed into Game.prototype; everything runs once per frame after the mobs
// moved (registerFrameUpdate below).

// Per species: `foods` (held item types that tame and feed it, in order of preference; types
// that do not exist in world.blockTypes are skipped) and `chance` (of taming per item), or
// null when it cannot be tamed (hostile, colonies, flyers and swimmers).
// Built-in movement modes whose update honours getMobGoal and userData.resting (wildlife.js).
const TAMING_GOAL_MOVEMENTS = ['ground', 'climb'];

const TAMING_DIET = {
    sheep: { foods: ['tall_grass', 'wheat', 'flower_yellow', 'leaves'], chance: 1 / 3 },
    duck: { foods: ['tall_grass', 'wheat_seeds', 'raw_fish', 'flower_yellow'], chance: 1 / 3 },
    pig: { foods: ['mushroom_brown', 'mushroom_red', 'wheat', 'honeycomb'], chance: 1 / 3 },
    giraffe: { foods: ['acacia_leaves', 'leaves', 'jungle_leaves', 'birch_leaves'], chance: 1 / 4 },
    dog: { foods: ['raw_fish', 'mushroom_brown'], chance: 1 / 2 },
    cat: { foods: ['raw_fish', 'milk', 'mushroom_brown'], chance: 1 / 2 },
    spider: null,
    cave_monster: null,
    macaw: { foods: ['flower_red', 'flower_yellow', 'cherry_leaves'], chance: 1 / 3 },
    fish: null,
    frog: null, // 'hop' movement does not follow goals
    turtle: null, // 'amphibious'
    camel: { foods: ['cactus', 'tall_grass', 'wheat'], chance: 1 / 3 },
    lizard: null, // 'dart'
    scorpion: null,
    goat: { foods: ['leaves', 'tall_grass', 'wheat'], chance: 1 / 3 },
    horse: { foods: ['tall_grass', 'wheat', 'flower_yellow', 'honeycomb'], chance: 1 / 4 },
    bee: null,
    firefly: null,
    shadow: null,
    eagle: null,
    bat: null,
    // Species built in parallel: tameable only if they walk on the ground (see above).
    crab: { foods: ['raw_fish', 'shell'], chance: 1 / 3 },
    fox: { foods: ['raw_fish', 'mushroom_red'], chance: 1 / 4 },
    rabbit: { foods: ['flower_yellow', 'tall_grass', 'flower_red'], chance: 1 / 3 },
    owl: { foods: ['raw_fish'], chance: 1 / 4 },
    vulture: null,
    snake: null,
    storm_golem: null,
    wisp: null,
    mole: { foods: ['mushroom_brown', 'mushroom_red'], chance: 1 / 3 }
};
window.TAMING_DIET = TAMING_DIET;

const TAMING = {
    storageKey: 'minecloud-tamed-mobs',
    followStop: 2,
    teleportDistance: 20,
    loveTime: 20,
    loveRange: 8,
    breedDistance: 1.8,
    breedCooldown: 120,
    growTime: 300,
    babyScale: 0.5
};

registerFrameUpdate(function (delta) {
    this.tamingUpdate(delta);
});

registerMobUseHandler(function (mob, item) {
    return this.tamingUse(mob, item);
});

registerMobGoal(function (mob) {
    return this.tamingGoal(mob);
});

Object.assign(Game.prototype, {
    tamingName(mob) {
        return mob.userData.species.replace(/_/g, ' ');
    },

    tamingIsBaby(mob) {
        return mob.userData.tamingAge != null;
    },

    tamingCanTame(species) {
        const diet = TAMING_DIET[species];
        const info = getMobSpecies(species);
        if (!diet || !info || info.hostile) return false;
        const movement = info.movement;
        return !movement || TAMING_GOAL_MOVEMENTS.includes(movement) || Boolean(MOB_BEHAVIOURS[movement] && MOB_BEHAVIOURS[movement].tameable);
    },

    tamingFoods(species) {
        const diet = TAMING_DIET[species];
        if (!diet) return [];
        const types = this.world && this.world.blockTypes;
        return diet.foods.filter((type) => !types || types[type]);
    },

    // Right click: tame, feed, breed or sit. Returns whether it handled the click.
    tamingUse(mob, item) {
        const data = mob.userData;
        const species = data.species;
        const name = this.tamingName(mob);
        if (!item) {
            if (!data.tamed) return false;
            if (getMobSpecies(species).mount && !this.cameraController.isCrouching) {
                if (!this.tamingIsBaby(mob)) return false; // let riding.js take it
                this.receiveSystemMessage({ text: `The baby ${name} is too young to ride` });
                return true;
            }
            this.tamingSetSitting(mob, !data.tamingSitting);
            return true;
        }
        if (!this.tamingCanTame(species) || !this.tamingFoods(species).includes(item)) return false;

        if (!data.tamed) {
            if (!this.consumeSelectedBlock()) return false;
            if (Math.random() < (TAMING_DIET[species].chance || 1 / 3)) {
                this.tamingTame(mob);
                this.receiveSystemMessage({ text: `You tamed the ${name}! Right-click it empty-handed${getMobSpecies(species).mount ? ' while crouching' : ''} to make it sit` });
            } else {
                this.tamingSmoke(mob);
                this.receiveSystemMessage({ text: `The ${name} ate it but is not convinced yet` });
            }
            return true;
        }

        if (this.tamingIsBaby(mob)) {
            // Treats make babies grow up faster.
            if (!this.consumeSelectedBlock()) return false;
            data.tamingAge = Math.min(TAMING.growTime, data.tamingAge + TAMING.growTime * 0.1);
            this.tamingHearts(mob, 2);
            this.tamingChirp(1.3);
            return true;
        }

        if (data.tamingLove > 0) {
            this.receiveSystemMessage({ text: `Your ${name} is already in love` });
            return true;
        }
        if (data.tamingBreedCooldown > 0) {
            this.receiveSystemMessage({ text: `Your ${name} is not hungry (ready again in ${Math.ceil(data.tamingBreedCooldown)} s)` });
            return true;
        }
        if (!this.consumeSelectedBlock()) return false;
        data.tamingLove = TAMING.loveTime;
        data.tamingHeartTimer = 0;
        if (data.maxHealth > 1) {
            data.health = Math.min(data.maxHealth, data.health + 4);
            this.updateMobHealthBar(mob);
        }
        this.tamingHearts(mob, 5);
        this.tamingChirp(1);
        this.receiveSystemMessage({ text: `Your ${name} is in love: feed another ${name} nearby` });
        return true;
    },

    tamingTame(mob, { quiet = false } = {}) {
        const data = mob.userData;
        data.tamed = true;
        data.owner = this.playerName || 'player';
        data.natural = false;
        data.tamingSitting = false;
        data.tamingLove = 0;
        data.tamingBreedCooldown = data.tamingBreedCooldown || 0;
        data.tamingStuck = 0;
        if (quiet) return;
        this.tamingHearts(mob, 7);
        this.tamingChirp(1);
        this.tamingSaveSoon();
    },

    tamingSetSitting(mob, sitting) {
        const data = mob.userData;
        data.tamingSitting = sitting;
        data.home.copy(mob.position);
        data.resting = sitting ? 1 : 0;
        data.moveTimer = 1;
        this.playTone({ frequency: sitting ? 420 : 560, endFrequency: sitting ? 320 : 720, duration: 0.12, type: 'triangle', volume: 0.02, release: 0.08 });
        this.receiveSystemMessage({ text: sitting ? `Your ${this.tamingName(mob)} sits and stays` : `Your ${this.tamingName(mob)} follows you again` });
        this.tamingSaveSoon();
    },

    // Where a tamed mob walks: to its mate when in love, to a parent when a baby, else to you.
    tamingGoal(mob) {
        const data = mob.userData;
        if (!data.tamed || this.titleScreenOpen) return null;
        if (data.tamingLove > 0) {
            const mate = this.tamingFindMate(mob);
            if (mate) return Object.assign(mate.position.clone(), { stopDistance: 1 });
        }
        if (data.tamingSitting) return null;
        if (this.tamingIsBaby(mob)) {
            const parent = this.tamingLiveParent(mob);
            if (parent) return Object.assign(parent.position.clone(), { stopDistance: 1.5 });
        }
        if (this.respawnPending) return null;
        const player = this.getLocalPlayerPosition();
        return Object.assign(new THREE.Vector3(player.x, mob.position.y, player.z), { stopDistance: TAMING.followStop });
    },

    tamingLiveParent(mob) {
        const parent = mob.userData.tamingParent;
        return parent && parent.parent && this.ambientMobs.includes(parent) ? parent : null;
    },

    tamingFindMate(mob) {
        let best = null;
        let bestDistance = TAMING.loveRange;
        for (const other of this.ambientMobs) {
            if (other === mob || other.userData.species !== mob.userData.species) continue;
            if (!(other.userData.tamingLove > 0) || this.tamingIsBaby(other) || other.userData.rider) continue;
            const distance = other.position.distanceTo(mob.position);
            if (distance < bestDistance) {
                best = other;
                bestDistance = distance;
            }
        }
        return best;
    },

    tamingUpdate(delta) {
        if (!this.world || !this.ambientMobs) return;
        if (!this.tamingStarted) this.tamingStart();
        this.tamingRestore();
        this.tamingUpdateParticles(delta);

        const player = this.getLocalPlayerPosition();
        for (const mob of [...this.ambientMobs]) {
            const data = mob.userData;
            if (!data.tamed) continue;
            data.tamingBreedCooldown = Math.max(0, (data.tamingBreedCooldown || 0) - delta);

            if (this.tamingIsBaby(mob)) {
                data.tamingAge += delta;
                if (data.tamingAge >= TAMING.growTime) {
                    data.tamingAge = null;
                    data.tamingParent = null;
                    mob.scale.setScalar(1);
                    this.tamingSaveSoon();
                } else {
                    mob.scale.setScalar(TAMING.babyScale + (1 - TAMING.babyScale) * data.tamingAge / TAMING.growTime);
                }
            }

            if (data.tamingLove > 0) {
                data.tamingLove = Math.max(0, data.tamingLove - delta);
                data.tamingHeartTimer = (data.tamingHeartTimer || 0) - delta;
                if (data.tamingHeartTimer <= 0) {
                    data.tamingHeartTimer = 0.9;
                    this.tamingHearts(mob, 1);
                }
                const mate = this.tamingFindMate(mob);
                if (mate && mate.position.distanceTo(mob.position) <= TAMING.breedDistance) this.tamingBreed(mob, mate);
            }

            if (data.rider) continue;
            if (data.tamingSitting) {
                data.resting = Math.max(data.resting || 0, 0.5);
                data.moveTimer = Math.max(data.moveTimer, 0.5);
            } else if (!this.tamingLiveParent(mob) && !this.titleScreenOpen && !this.respawnPending && !(data.tamingLove > 0)) {
                this.tamingCatchUp(mob, player, delta);
            }
            this.tamingPose(mob, delta);
        }

        this.tamingSaveTimer = (this.tamingSaveTimer ?? 5) - delta;
        if (this.tamingSaveTimer <= 0) this.tamingSave();
    },

    // Teleports a follower next to the player when far behind or stuck behind a wall.
    tamingCatchUp(mob, player, delta) {
        const data = mob.userData;
        const distance = Math.hypot(mob.position.x - player.x, mob.position.z - player.z);
        const last = data.tamingLastPosition || (data.tamingLastPosition = mob.position.clone());
        if (distance > 6 && last.distanceTo(mob.position) < delta * 0.15) {
            data.tamingStuck = (data.tamingStuck || 0) + delta;
        } else {
            data.tamingStuck = 0;
        }
        last.copy(mob.position);
        if (distance < TAMING.teleportDistance && data.tamingStuck < 4) return;

        const yaw = player.yaw || 0;
        for (const [ahead, side] of [[-1.5, 0], [-1.2, 1.2], [-1.2, -1.2], [0, 1.5], [0, -1.5]]) {
            const x = player.x - Math.sin(yaw) * ahead + Math.cos(yaw) * side;
            const z = player.z - Math.cos(yaw) * ahead - Math.sin(yaw) * side;
            const floor = this.cameraController.getFloorY(x, z, player.y + 0.5);
            if (floor <= -20 || player.y - floor > 4) continue;
            mob.position.set(x, floor + data.flyHeight, z);
            data.home.set(x, floor, z);
            data.tamingStuck = 0;
            last.copy(mob.position);
            return;
        }
    },

    // Sitting: rear down, nose up (species that lie down fold their legs instead, via resting).
    tamingPose(mob, delta) {
        const data = mob.userData;
        const target = data.tamingSitting && !getMobSpecies(data.species).restDrop ? 1 : 0;
        if (target === 0 && !data.tamingSitBlend) return;
        data.tamingSitBlend = (data.tamingSitBlend || 0) + (target - (data.tamingSitBlend || 0)) * Math.min(1, delta * 5);
        if (target === 0 && data.tamingSitBlend < 0.01) data.tamingSitBlend = 0;
        if (!data.modelRoot) return;
        data.modelRoot.rotation.x = -0.32 * data.tamingSitBlend;
        data.modelRoot.position.y += 0.04 * data.tamingSitBlend;
        data.legs.forEach((leg, index) => {
            // Back legs (the second pair) fold forward under the body.
            if (index >= 2) leg.rotation.x = leg.userData.baseRotation.x - 0.9 * data.tamingSitBlend;
        });
    },

    tamingBreed(a, b) {
        a.userData.tamingLove = 0;
        b.userData.tamingLove = 0;
        a.userData.tamingBreedCooldown = TAMING.breedCooldown;
        b.userData.tamingBreedCooldown = TAMING.breedCooldown;
        const position = a.position.clone().add(b.position).multiplyScalar(0.5);
        const floor = this.cameraController.getFloorY(position.x, position.z, position.y - a.userData.flyHeight + 1);
        if (floor > -20) position.y = floor;
        else position.y -= a.userData.flyHeight;
        const parent = Math.random() < 0.5 ? a : b;
        const baby = this.tamingSpawnBaby(a.userData.species, position, parent.userData.variant, 0, parent.userData.owner);
        baby.userData.tamingParent = parent;
        this.tamingHearts(baby, 8);
        this.tamingChirp(1.5);
        setTimeout(() => this.tamingChirp(1.8), 260);
        this.receiveSystemMessage({ text: `A baby ${this.tamingName(a)} was born!` });
        this.tamingSaveSoon();
    },

    tamingSpawnBaby(species, position, variant, age, owner) {
        const baby = this.createMob(species, position, { variant });
        this.tamingTame(baby, { quiet: true });
        baby.userData.owner = owner || baby.userData.owner;
        baby.userData.tamingAge = age;
        baby.userData.tamingBreedCooldown = 0;
        baby.scale.setScalar(TAMING.babyScale + (1 - TAMING.babyScale) * age / TAMING.growTime);
        this.ambientMobs.push(baby);
        return baby;
    },

    tamingChirp(pitch = 1) {
        const base = 620 * pitch;
        [0, 1, 2].forEach((step) => setTimeout(() => {
            this.playTone({ frequency: base * (1 + step * 0.26), endFrequency: base * (1.12 + step * 0.26), duration: 0.07, type: 'triangle', volume: 0.018, release: 0.07 });
        }, step * 85));
    },

    // Particles: hearts float up and fade; failure smoke is light grey.
    tamingHeartTexture() {
        if (this.tamingHeartMap) return this.tamingHeartMap;
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ff4f7a';
        ctx.beginPath();
        ctx.moveTo(16, 28);
        ctx.bezierCurveTo(2, 18, 2, 6, 10, 6);
        ctx.bezierCurveTo(14, 6, 16, 9, 16, 11);
        ctx.bezierCurveTo(16, 9, 18, 6, 22, 6);
        ctx.bezierCurveTo(30, 6, 30, 18, 16, 28);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillRect(8, 9, 3, 3);
        this.tamingHeartMap = new THREE.CanvasTexture(canvas);
        this.tamingHeartMap.magFilter = THREE.NearestFilter;
        return this.tamingHeartMap;
    },

    tamingPuffTexture() {
        if (this.tamingPuffMap) return this.tamingPuffMap;
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
        this.tamingPuffMap = new THREE.CanvasTexture(canvas);
        return this.tamingPuffMap;
    },

    tamingEmit(mob, count, map, color, size) {
        this.tamingParticles = this.tamingParticles || [];
        const top = mob.position.y + 0.9 * mob.scale.y;
        for (let i = 0; i < count; i++) {
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false }));
            sprite.position.set(mob.position.x + (Math.random() - 0.5) * 0.7, top + Math.random() * 0.4, mob.position.z + (Math.random() - 0.5) * 0.7);
            sprite.scale.setScalar(size * (0.75 + Math.random() * 0.5));
            sprite.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.7 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4);
            sprite.userData.age = 0;
            sprite.userData.life = 1 + Math.random() * 0.6;
            this.scene.add(sprite);
            this.tamingParticles.push(sprite);
        }
    },

    tamingHearts(mob, count) {
        this.tamingEmit(mob, count, this.tamingHeartTexture(), 0xffffff, 0.28);
    },

    tamingSmoke(mob) {
        this.tamingEmit(mob, 6, this.tamingPuffTexture(), 0x9a9a9a, 0.45);
        this.playNoiseBurst({ duration: 0.12, volume: 0.018, highpass: 300, lowpass: 1600 });
        this.playTone({ frequency: 300, endFrequency: 210, duration: 0.14, type: 'triangle', volume: 0.015, release: 0.08 });
    },

    tamingUpdateParticles(delta) {
        if (!this.tamingParticles || !this.tamingParticles.length) return;
        this.tamingParticles = this.tamingParticles.filter((sprite) => {
            sprite.userData.age += delta;
            const t = sprite.userData.age / sprite.userData.life;
            if (t >= 1) {
                this.scene.remove(sprite);
                sprite.material.dispose();
                return false;
            }
            sprite.position.addScaledVector(sprite.userData.velocity, delta);
            sprite.material.opacity = 1 - t * t;
            return true;
        });
    },

    // Persistence: tamed mobs (and ones not restored yet) are kept in localStorage.
    tamingStart() {
        this.tamingStarted = true;
        try {
            const saved = JSON.parse(window.localStorage.getItem(TAMING.storageKey) || '[]');
            this.tamingPending = Array.isArray(saved) ? saved.filter((entry) => entry && getMobSpecies(entry.species)) : [];
        } catch (error) {
            this.tamingPending = [];
        }
        window.addEventListener('beforeunload', () => this.tamingSave());
    },

    tamingRestore() {
        if (!this.tamingPending || !this.tamingPending.length) return;
        this.tamingPending = this.tamingPending.filter((entry) => {
            const { chunkX, chunkZ } = this.world.getChunkCoords(entry.x, entry.z);
            if (!this.world.generatedChunks.has(this.world.chunkKey(chunkX, chunkZ))) return true;
            let floor = this.cameraController.getFloorY(entry.x, entry.z, entry.y + 2);
            if (floor <= -20) floor = this.cameraController.getFloorY(entry.x, entry.z, 256);
            if (floor <= -20) return true;
            const position = new THREE.Vector3(entry.x, floor, entry.z);
            let mob;
            if (entry.age != null) {
                mob = this.tamingSpawnBaby(entry.species, position, entry.variant, entry.age, entry.owner);
            } else {
                mob = this.createMob(entry.species, position, { variant: entry.variant });
                this.tamingTame(mob, { quiet: true });
                if (entry.owner) mob.userData.owner = entry.owner;
                this.ambientMobs.push(mob);
            }
            mob.userData.tamingBreedCooldown = entry.cooldown || 0;
            if (entry.sitting) {
                mob.userData.tamingSitting = true;
                mob.userData.resting = 1;
            }
            return false;
        });
    },

    tamingSaveSoon() {
        this.tamingSaveTimer = Math.min(this.tamingSaveTimer ?? 1, 1);
    },

    tamingSave() {
        this.tamingSaveTimer = 5;
        if (!this.tamingStarted || !this.ambientMobs) return;
        const live = this.ambientMobs.filter((mob) => mob.userData.tamed).map((mob) => {
            const data = mob.userData;
            return {
                species: data.species,
                variant: data.variant,
                x: Math.round(mob.position.x * 100) / 100,
                y: Math.round((mob.position.y - data.flyHeight) * 100) / 100,
                z: Math.round(mob.position.z * 100) / 100,
                sitting: Boolean(data.tamingSitting),
                age: this.tamingIsBaby(mob) ? Math.round(data.tamingAge) : null,
                cooldown: Math.round(data.tamingBreedCooldown || 0),
                owner: data.owner
            };
        });
        try {
            window.localStorage.setItem(TAMING.storageKey, JSON.stringify(live.concat(this.tamingPending || [])));
        } catch (error) {
            // Storage full or disabled: tamed mobs just do not survive a reload.
        }
    }
});
