// Baits and traps. Everything placed here is a client-side THREE entity, not a world block:
// - Baits (bait_*): right click the ground to drop a little pile that lasts two minutes. Mobs
//   that like it (TRAPS_SPECIES[species].baits) within 16 blocks walk over, nibble it until it
//   is gone and hang around for a while (their home moves there). Ground mobs use
//   registerMobGoal; hopping, darting, climbing and amphibious ones are nudged towards it; bees
//   fly to honey bait instead of a flower. Species with their own behaviour only come if their
//   update asks this.getMobGoal(mob, delta).
// - Cage trap: right click the ground to set it, door towards you. A small ground mob that walks
//   in (bait dropped inside lures it to the middle) is caught: the door snaps shut. Right click
//   the cage to collect the mob as its <species>_egg plus the cage, or an empty cage to take it.
// - Fishing rod: right click water within 9 blocks to cast; when the bobber dips (splash),
//   right click within the second to catch raw fish (sometimes a shell or junk). Worm or fish
//   bait in the inventory is used up for a quicker bite; nearby fish schools gather round.
// - Bug net: right click a firefly cloud, a bee or a bat close by to catch it. Fireflies go
//   into a firefly_jar: right click the ground to set it down as a glowing lamp; right click it
//   to take it back, or with the net to set the fireflies free.
// Cages (and the mob inside) and jars are kept in localStorage; baits and the line are not.
// Mixed into Game.prototype; hooked through js/extensions.js.

const TRAPS_BAITS = {
    bait_seeds: { name: 'Seed Bait', color: 0xd9c27a, pile: [0xd9c27a, 0xb8985a, 0xeadc9e, 0x9c7f43] },
    bait_worms: { name: 'Worm Bait', color: 0xc97a72, pile: [0x6b4a2e, 0xc97a72, 0xd99088, 0x5a3d24] },
    bait_meat: { name: 'Meat Bait', color: 0xa8423a, pile: [0xa8423a, 0xc8645a, 0xe8d0c0, 0x8a3028] },
    bait_fish: { name: 'Fish Bait', color: 0x8fb0c8, pile: [0x8fb0c8, 0xc0d4e0, 0x6f8fa8, 0xe8a088] },
    bait_honey: { name: 'Honey Bait', color: 0xe8a92a, pile: [0xe8a92a, 0xf2c650, 0xc88a18, 0xf6d880] }
};

// Per species (the 22 in mobSpecies.js and the 9 new ones):
//   baits  the baits it walks to   cage  a cage trap can hold it   net  what the bug net gives
const TRAPS_SPECIES = {
    sheep: { baits: ['bait_seeds'], cage: true },
    duck: { baits: ['bait_seeds', 'bait_worms'], cage: true },
    pig: { baits: ['bait_seeds', 'bait_worms'], cage: true },
    giraffe: { baits: ['bait_seeds'] },
    dog: { baits: ['bait_meat'], cage: true },
    cat: { baits: ['bait_fish', 'bait_meat'], cage: true },
    spider: { baits: ['bait_meat'], cage: true },
    cave_monster: { baits: ['bait_meat'] },
    macaw: { baits: ['bait_seeds'] },
    fish: { baits: ['bait_worms'] },
    frog: { baits: ['bait_worms'], cage: true },
    turtle: { baits: ['bait_fish', 'bait_worms'], cage: true },
    camel: { baits: ['bait_seeds'] },
    lizard: { baits: ['bait_worms'], cage: true },
    scorpion: { baits: ['bait_worms'], cage: true },
    goat: { baits: ['bait_seeds'], cage: true },
    horse: { baits: ['bait_seeds'] },
    bee: { baits: ['bait_honey'], net: 'bee_egg' },
    firefly: { baits: [], net: 'firefly_jar' },
    shadow: { baits: [] },
    eagle: { baits: ['bait_fish'] },
    bat: { baits: [], net: 'bat_egg' },
    crab: { baits: ['bait_fish'], cage: true },
    fox: { baits: ['bait_meat'], cage: true },
    rabbit: { baits: ['bait_seeds'], cage: true },
    owl: { baits: ['bait_meat'] },
    vulture: { baits: ['bait_meat'] },
    snake: { baits: ['bait_meat'], cage: true },
    storm_golem: { baits: [] },
    wisp: { baits: [], net: 'glow_dust' },
    mole: { baits: ['bait_worms'], cage: true }
};

const TRAPS_BAIT_LIFE = 120;
const TRAPS_BAIT_RANGE = 16;
const TRAPS_EAT_SECONDS = 14;
const TRAPS_CAST_RANGE = 9;
const TRAPS_NET_RANGE = 4.5;
const TRAPS_NUDGE_MODES = ['hop', 'dart', 'climb', 'amphibious'];
const _trapsVec = new THREE.Vector3();
const _trapsVec2 = new THREE.Vector3();

Object.entries(TRAPS_BAITS).forEach(([id, bait]) => registerItemType(id, { color: bait.color, name: bait.name }));
registerItemType('fishing_rod', { color: 0x8b6a3e, name: 'Fishing Rod' });
registerItemType('bug_net', { color: 0xe8e4d8, name: 'Bug Net' });
registerItemType('cage_trap', { color: 0x9a7a4a, name: 'Cage Trap' });
registerItemType('firefly_jar', { color: 0xd8f05a, name: 'Firefly Jar' });

registerGameContent(function ({ addItem, addRecipe }) {
    // Resources (raw_fish, leather, honeycomb...) may not be there: fall back to basic items.
    const has = (type) => Boolean(ITEM_TYPES[type]);
    addRecipe('bait_seeds', 'Gather Seed Bait', 'bait_seeds', 4, [{ type: 'tall_grass', amount: 2 }]);
    addRecipe('bait_worms', 'Dig Worm Bait', 'bait_worms', 3, [{ type: 'dirt', amount: 2 }]);
    addRecipe('bait_meat', 'Prepare Meat Bait', 'bait_meat', 2, has('leather')
        ? [{ type: 'leather', amount: 1 }, { type: 'mushroom_brown', amount: 1 }]
        : [{ type: 'mushroom_brown', amount: 2 }, { type: 'mushroom_red', amount: 1 }]);
    addRecipe('bait_fish', 'Chop Fish Bait', 'bait_fish', 2, has('raw_fish')
        ? [{ type: 'raw_fish', amount: 1 }]
        : [{ type: 'fish_egg', amount: 1 }]);
    addRecipe('bait_honey', 'Mix Honey Bait', 'bait_honey', 2, has('honeycomb')
        ? [{ type: 'honeycomb', amount: 1 }]
        : [{ type: 'flower_yellow', amount: 2 }, { type: 'flower_red', amount: 1 }]);
    addRecipe('fishing_rod', 'Craft Fishing Rod', 'fishing_rod', 1, [{ type: 'wood', amount: 2 }, { type: 'iron_ore', amount: 1 }]);
    addRecipe('bug_net', 'Craft Bug Net', 'bug_net', 1, [{ type: 'wood', amount: 1 }, { type: 'white_wool', amount: 2 }]);
    addRecipe('cage_trap', 'Craft Cage Trap', 'cage_trap', 1, [{ type: 'planks', amount: 4 }, { type: 'iron_ore', amount: 2 }]);
    addItem('firefly_jar');
});

registerItemUseHandler(function (item, hit) {
    return this.trapsHandleUse(item, hit);
});

registerMobUseHandler(function (mob, item) {
    return this.trapsUseOnMob(mob, item);
});

registerMobGoal(function (mob) {
    return this.trapsMobGoal(mob);
});

registerFrameUpdate(function (delta) {
    this.trapsUpdate(delta);
});

onMobEvent('removed', function (mob) {
    const cage = mob.userData.trapsCage;
    if (cage && cage.mob === mob) {
        cage.mob = null;
        cage.open = true;
        this.trapsSave();
    }
});

Object.assign(Game.prototype, {
    trapsEnsure() {
        if (this.trapsBaits) return;
        this.trapsBaits = [];
        this.trapsCages = [];
        this.trapsJars = [];
        this.trapsFishing = null;
        this.trapsMaterials = new Map();
        this.trapsBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
        this.trapsHitMaterial = new THREE.MeshBasicMaterial({ visible: false });
        this.trapsGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xd8f05a });
        this.trapsGlassMaterial = new THREE.MeshLambertMaterial({ color: 0xbfe8f5, transparent: true, opacity: 0.32, depthWrite: false });
        this.trapsHaloMaterial = new THREE.SpriteMaterial({ map: this.getFireflyHaloTexture(), color: 0xc8f060, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 });
        this.trapsRestore();
    },

    trapsMaterial(color) {
        let material = this.trapsMaterials.get(color);
        if (!material) {
            material = new THREE.MeshLambertMaterial({ color });
            this.trapsMaterials.set(color, material);
        }
        return material;
    },

    // A voxel of the given size (in blocks) centred at (x, y, z) inside `parent`.
    trapsBox(parent, color, x, y, z, sx, sy, sz, material = null) {
        const mesh = new THREE.Mesh(this.trapsBoxGeometry, material || this.trapsMaterial(color));
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        mesh.castShadow = Boolean(this.rtxModeEnabled) && !material;
        mesh.receiveShadow = Boolean(this.rtxModeEnabled);
        parent.add(mesh);
        return mesh;
    },

    trapsHitbox(entity, sx, sy, sz) {
        const box = this.trapsBox(entity.group, 0, 0, sy / 2, 0, sx, sy, sz, this.trapsHitMaterial);
        box.castShadow = false;
        box.userData.trapsEntity = entity;
        entity.hitbox = box;
    },

    trapsTakeItem(type) {
        if (this.getInventoryCount(type) <= 0) return false;
        this.inventoryCounts[type] -= 1;
        this.updateHotbarCounts();
        this.refreshHeldItemMesh();
        this.renderCraftingPanel();
        this.renderInventoryPanel();
        this.saveInventoryState();
        return true;
    },

    trapsItemName(type) {
        const def = this.getItemDefinition(type);
        return def && def.name ? def.name : this.formatItemName(type);
    },

    trapsAfterUse() {
        this.placeActionTimer = 0.35;
        this.showHitIndicator();
        this.lastSelectionUpdate = 0;
    },

    // ---- Right click ---------------------------------------------------------------------

    trapsHandleUse(item, hit) {
        this.trapsEnsure();
        if (this.trapsFishing && item === 'fishing_rod') {
            this.trapsReel();
            return true;
        }
        const entity = this.trapsRaycastEntity(hit);
        if (entity) {
            this.trapsUseEntity(entity, item);
            return true;
        }
        if (item === 'fishing_rod') {
            this.trapsCast();
            return true;
        }
        if (item === 'bug_net') {
            const target = this.trapsFindNetTarget();
            if (!target || !this.trapsNetCatch(target)) {
                this.playNoiseBurst({ duration: 0.14, volume: 0.012, highpass: 900, lowpass: 3200 });
                this.trapsAfterUse();
            }
            return true;
        }
        if (!hit || !item) return false;
        if (TRAPS_BAITS[item]) {
            this.trapsPlaceBait(item, hit);
            return true;
        }
        if (item === 'cage_trap') {
            this.trapsPlaceCage(hit);
            return true;
        }
        if (item === 'firefly_jar') {
            this.trapsPlaceJar(hit);
            return true;
        }
        return false;
    },

    trapsUseOnMob(mob, item) {
        this.trapsEnsure();
        if (mob.userData.trapsCage) {
            this.trapsUseEntity(mob.userData.trapsCage, item);
            return true;
        }
        if (item === 'bug_net') return this.trapsNetCatch(mob);
        if (item === 'fishing_rod' && this.trapsFishing) {
            this.trapsReel();
            return true;
        }
        return false;
    },

    // The cage, jar or bait pile under the crosshair, if nearer than the targeted block.
    trapsRaycastEntity(blockHit) {
        const hitboxes = [...this.trapsCages, ...this.trapsJars, ...this.trapsBaits].map((entity) => entity.hitbox);
        if (hitboxes.length === 0) return null;
        const ray = this.getInteractionRay();
        this.raycaster.set(ray.origin, ray.direction);
        const hits = this.raycaster.intersectObjects(hitboxes, false);
        for (const hit of hits) {
            if (hit.point.distanceTo(ray.reachOrigin) > this.placeDistance + 0.3) break;
            if (blockHit && hit.distance > blockHit.distance + 0.05) break;
            return hit.object.userData.trapsEntity;
        }
        return null;
    },

    trapsUseEntity(entity, item) {
        if (entity.kind === 'cage') {
            if (entity.mob) {
                const mob = entity.mob;
                const species = mob.userData.species;
                const egg = `${species}_egg`;
                this.removeMob(mob);
                if (this.getItemDefinition(egg)) this.addInventory(egg);
                this.addInventory('cage_trap');
                this.trapsRemoveCage(entity);
                this.receiveSystemMessage({ text: `You collected the caged ${this.formatItemName(species)} (${this.trapsItemName(egg)})` });
                this.playTone({ frequency: 520, endFrequency: 780, duration: 0.18, type: 'triangle', volume: 0.02, release: 0.1 });
            } else if (TRAPS_BAITS[item] && !entity.bait && entity.open) {
                this.trapsCreateBait(item, entity.position.clone(), entity);
                this.consumeSelectedBlock();
                this.playPlaceSound('grass');
                this.receiveSystemMessage({ text: `${this.trapsItemName(item)} set inside the cage` });
            } else {
                this.addInventory('cage_trap');
                this.trapsRemoveCage(entity);
                this.playPlaceSound('planks');
                this.receiveSystemMessage({ text: 'Cage trap picked up' });
            }
        } else if (entity.kind === 'jar') {
            if (item === 'bug_net') {
                const mob = this.createMob('firefly', entity.position.clone());
                mob.userData.natural = true;
                const { chunkX, chunkZ } = this.world.getChunkCoords(entity.position.x, entity.position.z);
                mob.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
                this.ambientMobs.push(mob);
                this.receiveSystemMessage({ text: 'You set the fireflies free' });
                this.playTone({ frequency: 1800, endFrequency: 2600, duration: 0.3, type: 'sine', volume: 0.01, release: 0.2 });
            } else {
                this.addInventory('firefly_jar');
                this.playPlaceSound('glass');
            }
            this.trapsRemoveJar(entity);
        } else if (entity.kind === 'bait') {
            if (entity.amount >= 0.95) this.addInventory(entity.type);
            this.trapsRemoveBait(entity);
            this.playPlaceSound('grass');
        }
        this.trapsAfterUse();
        this.trapsSave();
    },

    // Where an entity goes when placed on the targeted block: on top of it, in an empty cell.
    trapsGroundSpot(hit) {
        const block = this.world.getBlockPositionFromIntersection(hit);
        if (!block || !hit.face || hit.face.normal.y < 0.5) {
            this.receiveSystemMessage({ text: 'Place it on top of a block' });
            return null;
        }
        const above = this.world.getBlockTypeAt(block.x, block.y + 1, block.z);
        if (above === 'water' || this.world.getBlockTypeAt(block.x, block.y, block.z) === 'water' || this.world.hasSolidBlock(block.x, block.y + 1, block.z)) {
            this.receiveSystemMessage({ text: 'There is no room there' });
            return null;
        }
        const x = block.x + 0.5;
        const z = block.z + 0.5;
        const y = this.cameraController.getFloorY(x, z, block.y + 1.5);
        if (y <= -20) return null;
        return new THREE.Vector3(x, y, z);
    },

    trapsEntityNear(position, list, radius = 0.6) {
        return list.find((entity) => Math.hypot(entity.position.x - position.x, entity.position.z - position.z) < radius && Math.abs(entity.position.y - position.y) < 1.2) || null;
    },

    // ---- Baits ---------------------------------------------------------------------------

    trapsPlaceBait(type, hit) {
        const spot = this.trapsGroundSpot(hit);
        if (!spot) return;
        if (this.trapsEntityNear(spot, this.trapsJars) || this.trapsEntityNear(spot, this.trapsBaits)) return;
        const cage = this.trapsEntityNear(spot, this.trapsCages);
        if (cage && (cage.bait || !cage.open)) return;
        this.trapsCreateBait(type, cage ? cage.position.clone() : spot, cage);
        this.consumeSelectedBlock();
        this.playPlaceSound('grass');
        const lured = Object.keys(TRAPS_SPECIES).filter((species) => MOB_SPECIES[species] && TRAPS_SPECIES[species].baits.includes(type)).map((species) => this.formatItemName(species).toLowerCase());
        this.receiveSystemMessage({ text: `${this.trapsItemName(type)} placed${cage ? ' in the cage' : ''}. Lures: ${lured.join(', ') || 'nothing'}` });
        this.trapsAfterUse();
    },

    trapsCreateBait(type, position, cage = null) {
        const group = new THREE.Group();
        const palette = TRAPS_BAITS[type].pile;
        const pile = new THREE.Group();
        for (let i = 0; i < 9; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 0.17;
            const size = 0.05 + Math.random() * 0.05;
            const lift = i < 6 ? 0 : 0.05;
            const piece = this.trapsBox(pile, palette[i % palette.length], Math.cos(angle) * radius, lift + size / 2, Math.sin(angle) * radius, size * (type === 'bait_worms' ? 2.2 : 1), size, size);
            piece.rotation.y = Math.random() * Math.PI;
        }
        group.add(pile);
        group.position.copy(position);
        this.scene.add(group);
        const bait = { kind: 'bait', type, group, pile, position: position.clone(), amount: 1, life: TRAPS_BAIT_LIFE, cage, biteTimer: 0 };
        this.trapsHitbox(bait, 0.5, 0.22, 0.5);
        if (cage) cage.bait = bait;
        this.trapsBaits.push(bait);
        return bait;
    },

    trapsRemoveBait(bait) {
        this.scene.remove(bait.group);
        if (bait.cage && bait.cage.bait === bait) bait.cage.bait = null;
        this.trapsBaits = this.trapsBaits.filter((candidate) => candidate !== bait);
    },

    trapsBaitFor(mob) {
        const entry = TRAPS_SPECIES[mob.userData.species];
        if (!entry || entry.baits.length === 0 || mob.userData.trapsCage) return null;
        let best = null;
        let bestDistance = TRAPS_BAIT_RANGE;
        this.trapsBaits.forEach((bait) => {
            if (bait.amount <= 0 || !entry.baits.includes(bait.type)) return;
            if (bait.cage && (!bait.cage.open || bait.cage.mob || !entry.cage)) return;
            const distance = Math.hypot(bait.position.x - mob.position.x, bait.position.z - mob.position.z);
            if (distance < bestDistance && Math.abs(bait.position.y - mob.position.y) < 6) {
                best = bait;
                bestDistance = distance;
            }
        });
        return best;
    },

    // Ground mobs (default AI): walk to the bait, or stay near where they ate.
    trapsMobGoal(mob) {
        if (!this.trapsBaits) return null;
        const data = mob.userData;
        if (!data.trapsGoal) data.trapsGoal = new THREE.Vector3();
        const goal = data.trapsGoal;
        if (data.trapsCage) {
            goal.copy(data.trapsCage.position);
            goal.stopDistance = 10;
            return goal;
        }
        const bait = data.trapsBait;
        if (bait && bait.amount > 0 && bait.group.parent) {
            goal.copy(bait.position);
            goal.stopDistance = bait.cage ? 0.12 : 0.9;
            return goal;
        }
        if (data.trapsLinger && data.trapsLinger.until > performance.now()) {
            goal.copy(data.trapsLinger.position);
            goal.stopDistance = 2.4;
            return goal;
        }
        return null;
    },

    trapsUpdateLures(delta) {
        const now = performance.now();
        for (const mob of this.ambientMobs) {
            const data = mob.userData;
            const species = data.species;
            const entry = TRAPS_SPECIES[species];
            if (!entry || entry.baits.length === 0 || data.rider) continue;
            if (species === 'bee') {
                this.trapsLureBee(mob, delta);
                continue;
            }
            data.trapsCheck = (data.trapsCheck || 0) - delta;
            if (data.trapsCheck <= 0) {
                data.trapsCheck = 0.8 + Math.random() * 0.4;
                data.trapsBait = this.trapsBaitFor(mob);
            }
            const bait = data.trapsBait;
            if (!bait) continue;
            if (bait.amount <= 0 || !bait.group.parent) {
                data.trapsBait = null;
                continue;
            }
            const distance = Math.hypot(bait.position.x - mob.position.x, bait.position.z - mob.position.z);
            const movement = getMobSpecies(species).movement;
            if (distance <= (bait.cage ? 0.5 : 1.4)) {
                // Nibble: head down, bobbing, and the pile shrinks.
                bait.amount = Math.max(0, bait.amount - delta / TRAPS_EAT_SECONDS);
                data.home.copy(bait.position);
                data.trapsLinger = { position: bait.position.clone(), until: now + 25000 + Math.random() * 15000 };
                data.lookPitch = 0.6;
                data.lookYaw = 0;
                if (data.head && data.head.userData.baseRotation) data.head.rotation.x = data.head.userData.baseRotation.x + 0.55 + Math.sin(now / 1000 * 11 + data.stepPhase) * 0.25;
                bait.biteTimer -= delta;
                if (bait.biteTimer <= 0) {
                    bait.biteTimer = 0.5 + Math.random() * 0.4;
                    const near = Math.hypot(bait.position.x - this.camera.position.x, bait.position.z - this.camera.position.z);
                    if (near < 12) this.playNoiseBurst({ duration: 0.04, volume: 0.008 * (1 - near / 12), highpass: 1200, lowpass: 4200 });
                }
            } else if (TRAPS_NUDGE_MODES.includes(movement)) {
                this.trapsNudge(mob, bait.position, distance, delta);
            }
        }
    },

    // Mobs with their own movement drift towards the bait on top of what their AI does.
    trapsNudge(mob, target, distance, delta) {
        const step = Math.min(distance - 0.8, 0.8 * delta);
        if (step <= 0) return;
        const nx = mob.position.x + (target.x - mob.position.x) / distance * step;
        const nz = mob.position.z + (target.z - mob.position.z) / distance * step;
        const floor = this.cameraController.getFloorY(nx, nz, mob.position.y + 1.2);
        if (floor <= -20 || Math.abs(floor - mob.position.y) > 1.6) return;
        mob.position.x = nx;
        mob.position.z = nz;
        if (mob.userData.home) mob.userData.home.set(target.x, target.y, target.z);
    },

    // Bees off to a flower pick honey bait near their hive instead, and sip it.
    trapsLureBee(mob, delta) {
        const data = mob.userData;
        const task = data.task;
        if (!task || data.isHive || !data.colony) return;
        if (task.mode === 'flower' && !task.trapsBait) {
            const hive = data.colony.hive.position;
            const bait = this.trapsBaits.find((candidate) => candidate.type === 'bait_honey' && candidate.amount > 0 && Math.hypot(candidate.position.x - hive.x, candidate.position.z - hive.z) < TRAPS_BAIT_RANGE + 4);
            if (bait) {
                task.trapsBait = bait;
                task.spot.set(bait.position.x + (Math.random() - 0.5) * 0.3, bait.position.y + 0.3, bait.position.z + (Math.random() - 0.5) * 0.3);
            }
        } else if (task.mode === 'sip' && task.trapsBait) {
            task.trapsBait.amount = Math.max(0, task.trapsBait.amount - delta / 60);
        } else if (task.mode === 'hover') {
            task.trapsBait = null;
        }
    },

    // ---- Cage trap -----------------------------------------------------------------------

    trapsPlaceCage(hit) {
        const spot = this.trapsGroundSpot(hit);
        if (!spot) return;
        if (this.trapsEntityNear(spot, this.trapsCages, 1) || this.trapsEntityNear(spot, this.trapsJars)) return;
        const player = this.getLocalPlayerPosition();
        this.trapsCreateCage(spot, Math.atan2(player.x - spot.x, player.z - spot.z));
        this.consumeSelectedBlock();
        this.playPlaceSound('planks');
        this.receiveSystemMessage({ text: 'Cage trap set. Put bait inside to lure a small animal' });
        this.trapsAfterUse();
        this.trapsSave();
    },

    trapsCreateCage(position, facing) {
        const wood = 0x8a6236;
        const iron = 0x8c9198;
        const group = new THREE.Group();
        this.trapsBox(group, 0xb08a58, 0, 0.04, 0, 0.92, 0.08, 0.92);
        this.trapsBox(group, wood, 0, 0.88, 0, 0.92, 0.08, 0.92);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => this.trapsBox(group, wood, sx * 0.42, 0.46, sz * 0.42, 0.08, 0.84, 0.08));
        // Bars on the back and the sides.
        [-0.21, 0, 0.21].forEach((offset) => {
            this.trapsBox(group, iron, offset, 0.46, -0.42, 0.04, 0.8, 0.04);
            this.trapsBox(group, iron, -0.42, 0.46, offset, 0.04, 0.8, 0.04);
            this.trapsBox(group, iron, 0.42, 0.46, offset, 0.04, 0.8, 0.04);
        });
        // The door, hinged on the left front post, faces local +z.
        const door = new THREE.Group();
        door.position.set(-0.42, 0, 0.42);
        [0.14, 0.28, 0.42, 0.56, 0.7].forEach((x) => this.trapsBox(door, iron, x, 0.46, 0, 0.04, 0.76, 0.04));
        this.trapsBox(door, wood, 0.42, 0.14, 0, 0.8, 0.06, 0.06);
        this.trapsBox(door, wood, 0.42, 0.78, 0, 0.8, 0.06, 0.06);
        this.trapsBox(door, 0x3a3a3a, 0.8, 0.46, 0.04, 0.06, 0.12, 0.04);
        group.add(door);
        group.position.copy(position);
        group.rotation.y = facing;
        this.scene.add(group);
        const cage = { kind: 'cage', group, door, position: position.clone(), facing, open: true, doorAngle: -1.7, mob: null, bait: null };
        door.rotation.y = cage.doorAngle;
        this.trapsHitbox(cage, 0.95, 0.95, 0.95);
        this.trapsCages.push(cage);
        return cage;
    },

    trapsRemoveCage(cage) {
        if (cage.bait) {
            if (cage.bait.amount >= 0.95) this.addInventory(cage.bait.type);
            this.trapsRemoveBait(cage.bait);
        }
        this.scene.remove(cage.group);
        this.trapsCages = this.trapsCages.filter((candidate) => candidate !== cage);
    },

    trapsCatchInCage(cage, mob, announce = true) {
        cage.mob = mob;
        cage.open = false;
        mob.userData.trapsCage = cage;
        mob.userData.trapsBait = null;
        mob.userData.trapsLinger = null;
        mob.userData.natural = false;
        mob.userData.hostile = false;
        mob.userData.home.copy(cage.position);
        if (cage.bait) this.trapsRemoveBait(cage.bait);
        if (!announce) return;
        const distance = cage.position.distanceTo(this.camera.position);
        if (distance < 40) {
            const volume = 0.03 * Math.max(0.2, 1 - distance / 40);
            this.playNoiseBurst({ duration: 0.06, volume, highpass: 900, lowpass: 5200 });
            this.playTone({ frequency: 1250, duration: 0.09, type: 'square', volume: volume * 0.6, release: 0.12 });
            this.playTone({ frequency: 160, duration: 0.08, type: 'triangle', volume, release: 0.08 });
        }
        this.receiveSystemMessage({ text: `A ${this.formatItemName(mob.userData.species).toLowerCase()} is caught in your cage trap!` });
        this.trapsSave();
    },

    trapsUpdateCages(delta) {
        for (const cage of this.trapsCages) {
            const target = cage.open ? -1.7 : 0;
            cage.doorAngle += (target - cage.doorAngle) * Math.min(1, delta * (cage.open ? 3 : 22));
            cage.door.rotation.y = cage.doorAngle;

            if (cage.mob) {
                const mob = cage.mob;
                if (!mob.parent) {
                    cage.mob = null;
                    cage.open = true;
                    continue;
                }
                mob.userData.hostile = false;
                const dx = mob.position.x - cage.position.x;
                const dz = mob.position.z - cage.position.z;
                const distance = Math.hypot(dx, dz);
                if (distance > 0.12) {
                    mob.position.x = cage.position.x + dx / distance * 0.12;
                    mob.position.z = cage.position.z + dz / distance * 0.12;
                }
                if (mob.position.y > cage.position.y + 0.3) mob.position.y = cage.position.y + 0.3;
                if (mob.position.y < cage.position.y - 0.5) mob.position.y = cage.position.y;
                continue;
            }
            if (!cage.open) continue;
            for (const mob of this.ambientMobs) {
                const entry = TRAPS_SPECIES[mob.userData.species];
                if (!entry || !entry.cage || mob.userData.trapsCage || mob.userData.rider || mob.userData.isHive) continue;
                const feet = mob.position.y - (mob.userData.flyHeight || 0);
                if (Math.abs(feet - cage.position.y) > 0.8) continue;
                if (Math.hypot(mob.position.x - cage.position.x, mob.position.z - cage.position.z) > 0.42) continue;
                this.trapsCatchInCage(cage, mob);
                break;
            }
        }
    },

    // ---- Fishing -------------------------------------------------------------------------

    trapsHandPosition(out) {
        if (this.firstPersonItemAnchor && this.firstPersonItemAnchor.parent) {
            this.firstPersonItemAnchor.getWorldPosition(out);
            return out;
        }
        return this.camera.localToWorld(out.set(0.38, -0.25, -0.8));
    },

    // The first water block along the view ray, before anything solid.
    trapsFindWater() {
        const ray = this.getInteractionRay();
        for (let t = 0.6; t <= TRAPS_CAST_RANGE; t += 0.15) {
            _trapsVec.copy(ray.direction).multiplyScalar(t).add(ray.origin);
            const x = Math.floor(_trapsVec.x);
            const y = Math.floor(_trapsVec.y);
            const z = Math.floor(_trapsVec.z);
            const type = this.world.getBlockTypeAt(x, y, z);
            if (type === 'water') {
                const surface = this.findWaterSurface(_trapsVec.x, _trapsVec.y, _trapsVec.z);
                return surface === null ? null : new THREE.Vector3(_trapsVec.x, surface, _trapsVec.z);
            }
            if (this.world.hasSolidBlock(x, y, z)) return null;
        }
        return null;
    },

    trapsCast() {
        const target = this.trapsFindWater();
        this.trapsAfterUse();
        if (!target) {
            this.receiveSystemMessage({ text: `Aim at water within ${TRAPS_CAST_RANGE} blocks to cast your line` });
            return;
        }
        const baited = ['bait_worms', 'bait_fish'].find((type) => this.trapsTakeItem(type)) || null;
        const bobber = new THREE.Group();
        this.trapsBox(bobber, 0xd8382c, 0, 0, 0, 0.13, 0.1, 0.13);
        this.trapsBox(bobber, 0xf2f0ea, 0, 0.08, 0, 0.11, 0.06, 0.11);
        this.trapsBox(bobber, 0x3a3a3a, 0, 0.14, 0, 0.025, 0.07, 0.025);
        this.scene.add(bobber);
        const positions = new Float32Array(12 * 3);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xe8e8e0, transparent: true, opacity: 0.8 }));
        line.frustumCulled = false;
        this.scene.add(line);
        const from = this.trapsHandPosition(new THREE.Vector3());
        bobber.position.copy(from);
        this.trapsFishing = { stage: 'flying', t: 0, from, target, bobber, line, life: 0, baited, wait: (5 + Math.random() * 10) * (baited ? 0.55 : 1), window: 0 };
        this.playNoiseBurst({ duration: 0.22, volume: 0.014, highpass: 1400, lowpass: 5200 });
        if (baited) this.receiveSystemMessage({ text: `${this.trapsItemName(baited)} on the hook: fish will bite sooner` });
    },

    trapsEndFishing() {
        const fishing = this.trapsFishing;
        if (!fishing) return;
        this.scene.remove(fishing.bobber);
        this.scene.remove(fishing.line);
        fishing.line.geometry.dispose();
        fishing.line.material.dispose();
        this.trapsFishing = null;
    },

    trapsReel() {
        const fishing = this.trapsFishing;
        this.trapsAfterUse();
        if (fishing.stage !== 'bite') {
            this.playNoiseBurst({ duration: 0.12, volume: 0.01, highpass: 1600, lowpass: 5000 });
            if (fishing.stage === 'waiting') this.receiveSystemMessage({ text: 'Nothing on the hook. Wait for the bobber to dip' });
            this.trapsEndFishing();
            return;
        }
        const roll = Math.random();
        let catchType;
        if (roll < 0.72) {
            catchType = ITEM_TYPES.raw_fish ? 'raw_fish' : 'fish_egg';
            // One of the school that gathered round is the one on the hook.
            const fish = this.ambientMobs.find((mob) => mob.userData.species === 'fish' && mob.position.distanceTo(fishing.target) < 6);
            if (fish && Math.random() < 0.5) this.removeMob(fish);
        } else if (roll < 0.84 && ITEM_TYPES.shell) {
            catchType = 'shell';
        } else {
            catchType = ['leaves', 'wood', 'dirt', 'tall_grass'][Math.floor(Math.random() * 4)];
        }
        this.addInventory(catchType);
        this.spawnSplash(fishing.target.x, fishing.target.y, fishing.target.z, 0.5);
        this.world.addRipple(fishing.target.x, fishing.target.z, 0.8);
        this.playNoiseBurst({ duration: 0.25, volume: 0.03, highpass: 400, lowpass: 2600 });
        this.playTone({ frequency: 440, endFrequency: 880, duration: 0.2, type: 'triangle', volume: 0.02, release: 0.12 });
        this.receiveSystemMessage({ text: `You caught: ${this.trapsItemName(catchType)}` });
        this.trapsEndFishing();
    },

    trapsUpdateFishing(delta) {
        const fishing = this.trapsFishing;
        if (!fishing) return;
        const player = this.getLocalPlayerPosition();
        if (this.getSelectedHeldItemType() !== 'fishing_rod' || Math.hypot(player.x - fishing.target.x, player.z - fishing.target.z) > TRAPS_CAST_RANGE + 7) {
            this.trapsEndFishing();
            return;
        }
        fishing.life += delta;
        const bobber = fishing.bobber.position;
        const target = fishing.target;
        if (fishing.stage === 'flying') {
            fishing.t = Math.min(1, fishing.t + delta / 0.6);
            bobber.lerpVectors(fishing.from, target, fishing.t);
            bobber.y += Math.sin(fishing.t * Math.PI) * 1.8;
            if (fishing.t >= 1) {
                fishing.stage = 'waiting';
                this.spawnSplash(target.x, target.y, target.z, 0.12);
                this.world.addRipple(target.x, target.z, 0.5);
                this.playTone({ frequency: 300, endFrequency: 180, duration: 0.08, type: 'sine', volume: 0.015, release: 0.06 });
            }
        } else if (fishing.stage === 'waiting') {
            bobber.set(target.x, target.y - 0.03 + Math.sin(fishing.life * 2.2) * 0.025, target.z);
            // Fish schools nearby gather round the bait and bite sooner.
            let fishNear = 0;
            for (const mob of this.ambientMobs) {
                if (mob.userData.species !== 'fish') continue;
                const distance = Math.hypot(mob.position.x - target.x, mob.position.z - target.z);
                if (distance > 9) continue;
                fishNear++;
                if (distance < 1.2) continue;
                const step = 0.5 * delta / distance;
                const nx = mob.position.x + (target.x - mob.position.x) * step;
                const nz = mob.position.z + (target.z - mob.position.z) * step;
                if (this.world.getBlockTypeAt(Math.floor(nx), Math.floor(mob.position.y), Math.floor(nz)) === 'water') {
                    mob.position.x = nx;
                    mob.position.z = nz;
                }
            }
            fishing.wait -= delta * (fishNear > 0 ? 1.7 : 1);
            if (Math.random() < delta * 0.4) this.world.addRipple(target.x, target.z, 0.15);
            if (fishing.wait <= 0) {
                fishing.stage = 'bite';
                fishing.window = 1.1;
                this.spawnSplash(target.x, target.y, target.z, 0.3);
                this.world.addRipple(target.x, target.z, 0.7);
                this.playNoiseBurst({ duration: 0.2, volume: 0.03, highpass: 350, lowpass: 2400 });
                this.playTone({ frequency: 220, endFrequency: 120, duration: 0.12, type: 'sine', volume: 0.02, release: 0.08 });
            }
        } else if (fishing.stage === 'bite') {
            bobber.set(target.x + Math.sin(fishing.life * 31) * 0.03, target.y - 0.24 + Math.sin(fishing.life * 23) * 0.04, target.z);
            fishing.window -= delta;
            if (fishing.window <= 0) {
                fishing.stage = 'waiting';
                fishing.wait = 3 + Math.random() * 8;
            }
        }

        // The line sags between the rod tip and the bobber.
        const hand = this.trapsHandPosition(_trapsVec2);
        const array = fishing.line.geometry.attributes.position.array;
        const length = hand.distanceTo(bobber);
        const sag = fishing.stage === 'flying' ? 0 : Math.min(1.2, length * 0.12);
        for (let i = 0; i < 12; i++) {
            const s = i / 11;
            array[i * 3] = hand.x + (bobber.x - hand.x) * s;
            array[i * 3 + 1] = hand.y + (bobber.y + 0.16 - hand.y) * s - Math.sin(s * Math.PI) * sag;
            array[i * 3 + 2] = hand.z + (bobber.z - hand.z) * s;
        }
        fishing.line.geometry.attributes.position.needsUpdate = true;
    },

    // ---- Bug net -------------------------------------------------------------------------

    // The nearest catchable flyer close to the crosshair (fireflies are tiny, bats are fast).
    trapsFindNetTarget() {
        const ray = this.getInteractionRay();
        let best = null;
        let bestAlong = Infinity;
        const consider = (mob, point) => {
            _trapsVec.subVectors(point, ray.origin);
            const along = _trapsVec.dot(ray.direction);
            if (along < 0.3 || along > TRAPS_NET_RANGE || along >= bestAlong) return;
            const off = _trapsVec.addScaledVector(ray.direction, -along).length();
            if (off > 0.55 + along * 0.08) return;
            best = mob;
            bestAlong = along;
        };
        for (const mob of this.ambientMobs) {
            const entry = TRAPS_SPECIES[mob.userData.species];
            if (!entry || !entry.net || !mob.visible || mob.userData.isHive) continue;
            if (mob.position.distanceTo(ray.origin) > TRAPS_NET_RANGE + 3) continue;
            if (mob.userData.flies) {
                mob.userData.flies.forEach((fly) => consider(mob, fly.getWorldPosition(_trapsVec2)));
            } else {
                consider(mob, mob.position);
            }
        }
        return best;
    },

    trapsNetCatch(mob) {
        const species = mob.userData.species;
        const entry = TRAPS_SPECIES[species];
        if (!entry || !entry.net || mob.userData.isHive || mob.userData.dying !== undefined) return false;
        this.trapsAfterUse();
        this.playNoiseBurst({ duration: 0.12, volume: 0.016, highpass: 900, lowpass: 3600 });
        let reward = entry.net;
        if (!this.getItemDefinition(reward)) reward = `${species}_egg`;
        if (species === 'firefly') {
            const flies = mob.userData.flies;
            if (!mob.visible || !flies) {
                this.receiveSystemMessage({ text: 'Fireflies only come out at night' });
                return true;
            }
            if (flies.length <= 7) {
                this.removeMob(mob);
            } else {
                flies.splice(0, 4).forEach((fly) => mob.remove(fly));
            }
            this.playTone({ frequency: 1800, endFrequency: 2400, duration: 0.18, type: 'sine', volume: 0.01, release: 0.12 });
        } else {
            this.removeMob(mob);
            this.playTone({ frequency: getMobSpecies(species).tone || 600, duration: 0.08, type: 'triangle', volume: 0.012, release: 0.06 });
        }
        this.addInventory(reward);
        this.receiveSystemMessage({ text: `Caught with the net: ${this.trapsItemName(reward)}` });
        return true;
    },

    // ---- Firefly jar ---------------------------------------------------------------------

    trapsPlaceJar(hit) {
        const spot = this.trapsGroundSpot(hit);
        if (!spot) return;
        if (this.trapsEntityNear(spot, this.trapsJars) || this.trapsEntityNear(spot, this.trapsCages) || this.trapsEntityNear(spot, this.trapsBaits)) return;
        this.trapsCreateJar(spot);
        this.consumeSelectedBlock();
        this.playPlaceSound('glass');
        this.trapsAfterUse();
        this.trapsSave();
    },

    trapsCreateJar(position) {
        const group = new THREE.Group();
        this.trapsBox(group, 0, 0, 0.26, 0, 0.42, 0.5, 0.42, this.trapsGlassMaterial).castShadow = false;
        this.trapsBox(group, 0x9c7448, 0, 0.55, 0, 0.46, 0.08, 0.46);
        this.trapsBox(group, 0x6e5030, 0, 0.62, 0, 0.14, 0.06, 0.14);
        const flies = [];
        for (let i = 0; i < 6; i++) {
            const fly = this.trapsBox(group, 0, 0, 0.26, 0, 0.05, 0.05, 0.06, this.trapsGlowMaterial);
            fly.castShadow = false;
            fly.userData.seed = Math.random() * 100;
            fly.userData.period = 2 + Math.random() * 2.5;
            flies.push(fly);
        }
        const halo = new THREE.Sprite(this.trapsHaloMaterial);
        halo.position.y = 0.28;
        halo.scale.setScalar(1.3);
        group.add(halo);
        group.position.copy(position);
        this.scene.add(group);
        const jar = { kind: 'jar', group, flies, halo, position: position.clone(), life: Math.random() * 10 };
        this.trapsHitbox(jar, 0.5, 0.68, 0.5);
        this.trapsJars.push(jar);
        return jar;
    },

    trapsRemoveJar(jar) {
        this.scene.remove(jar.group);
        this.trapsJars = this.trapsJars.filter((candidate) => candidate !== jar);
    },

    trapsUpdateJars(delta) {
        if (this.trapsJars.length === 0) return;
        // In Ultra the lights are HDR-bright, so the bloom pass gives them a halo.
        const boost = this.ultraModeEnabled ? 5 : 1;
        this.trapsGlowMaterial.color.setRGB(0.85 * boost, 0.95 * boost, 0.35 * boost);
        for (const jar of this.trapsJars) {
            jar.life += delta;
            let lit = 0;
            jar.flies.forEach((fly) => {
                const seed = fly.userData.seed;
                const t = jar.life;
                fly.position.set(Math.sin(t * 0.9 + seed) * 0.14, 0.26 + Math.sin(t * 1.3 + seed * 2) * 0.16, Math.cos(t * 0.7 + seed * 3) * 0.14);
                const cycle = (t + seed) % fly.userData.period;
                const pulse = cycle < 0.8 ? Math.sin(cycle / 0.8 * Math.PI) : 0.08;
                fly.scale.set(0.05 * pulse + 0.001, 0.05 * pulse + 0.001, 0.06 * pulse + 0.001);
                lit += pulse;
            });
            jar.halo.scale.setScalar(0.9 + lit * 0.12);
        }
    },

    // ---- Frame update and persistence ----------------------------------------------------

    trapsUpdate(delta) {
        if (!this.world || !this.scene) return;
        this.trapsEnsure();
        for (const bait of [...this.trapsBaits]) {
            bait.life -= delta;
            bait.pile.scale.setScalar(0.3 + 0.7 * bait.amount);
            if (bait.life <= 0 || bait.amount <= 0) this.trapsRemoveBait(bait);
        }
        this.trapsUpdateLures(delta);
        this.trapsUpdateCages(delta);
        this.trapsUpdateFishing(delta);
        this.trapsUpdateJars(delta);
    },

    trapsSave() {
        if (!this.trapsCages) return;
        try {
            const round = (value) => Math.round(value * 100) / 100;
            window.localStorage.setItem('minecloud-traps', JSON.stringify({
                cages: this.trapsCages.map((cage) => ({ x: round(cage.position.x), y: round(cage.position.y), z: round(cage.position.z), facing: round(cage.facing), species: cage.mob ? cage.mob.userData.species : null })),
                jars: this.trapsJars.map((jar) => ({ x: round(jar.position.x), y: round(jar.position.y), z: round(jar.position.z) }))
            }));
        } catch (error) {
            // Storage unavailable: placed traps just won't survive a reload.
        }
    },

    trapsRestore() {
        let saved = null;
        try {
            saved = JSON.parse(window.localStorage.getItem('minecloud-traps') || 'null');
        } catch (error) {
            saved = null;
        }
        if (!saved) return;
        (saved.cages || []).forEach((entry) => {
            const cage = this.trapsCreateCage(new THREE.Vector3(entry.x, entry.y, entry.z), entry.facing || 0);
            if (entry.species && MOB_SPECIES[entry.species]) {
                const mob = this.createMob(entry.species, cage.position.clone());
                this.ambientMobs.push(mob);
                this.trapsCatchInCage(cage, mob, false);
                cage.doorAngle = 0;
            }
        });
        (saved.jars || []).forEach((entry) => this.trapsCreateJar(new THREE.Vector3(entry.x, entry.y, entry.z)));
    }
});
