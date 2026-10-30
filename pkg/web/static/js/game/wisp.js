// The wisp (will-o'-the-wisp): a pale blue-green flame that floats over the land at night,
// 25-40 blocks from the player, preferably by water or near a drop. It never attacks; it only
// deceives. Far away it hovers and bobs, pulsing and chiming to beckon. When the player comes
// within ~9 blocks it drifts away, keeping 6-8 blocks ahead, and leads them towards danger:
// deep water or the edge of a cliff, where it hovers over the water or the void. Now and then
// it flickers out and reappears further ahead; if the player falls for it, it giggles and
// slips away. It tires after a long flight, so a sprinting player can catch it: touching it
// (or striking it) bursts it into sparkles that leave glow_dust behind. Wild ones fade away at
// dawn; ones summoned by /mob or an egg linger a minute in daylight so they can be seen.
// Self-contained: species, model, behaviour ('lure' movement) and spawning live here. The
// night spawning, the sparkles and the shared light run from a wrapper around
// updateAmbientMobs (see the bottom of this file).

MOB_SPECIES.wisp = { eggColor: 0x9ff5e0, tone: 1320, speed: 5, group: [1, 1], limit: 2, movement: 'lure' };
VoxelModels.MOB_SURFACES.wisp = 'skin';

// A little voxel flame; in the world it is hidden behind the glowing rig built below (the
// model is still used for portraits and as a hit target).
VoxelModels.mobBuilders.wisp = function (b) {
    b.part('body', { pivot: [0, 0, 0], from: [-2, 2, -2], size: [4, 4, 4], paint: { color: 0x9ff5e0, noise: 0.05, all: (p) => p.rect(1, 1, 2, 2, 0xeafff8, 0) } });
    b.part('tongue', { parent: 'body', pivot: [0, 6, 0], from: [-1.25, 0, -1.25], size: [2.5, 3, 2.5], paint: { color: 0x6fe8c8, noise: 0.05 } });
    b.part('tip', { parent: 'tongue', pivot: [0, 3, 0], from: [-0.6, 0, -0.6], size: [1.2, 2, 1.2], paint: { color: 0x4fd0b0, noise: 0.05 } });
    return { head: 'body' };
};

// Owned by the Resources task; registered here only so the wisp works on its own.
if (!ITEM_TYPES.glow_dust) registerItemType('glow_dust', { color: 0xa8ffe6, name: 'Glow Dust' });
registerGameContent(({ addItem }) => addItem('glow_dust'));

const WISP_NOTES = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093, 2349.3];
const _wispStep = new THREE.Vector3();

registerMobBehaviour('lure', {
    update(mob, delta, player) { this.wispUpdate(mob, delta, player); },
    interact(mob) { this.wispStruck(mob); },
    spawnCommand(species, x, z, player) {
        // A little further than other mobs, so it has room to beckon before it flees.
        const angle = Math.atan2(z - player.z, x - player.x);
        const mob = this.wispSpawnAt(player.x + Math.cos(angle) * 7, player.z + Math.sin(angle) * 7, player.y + 4);
        this.receiveSystemMessage({ text: mob ? 'A wisp flickers into being... follow it, if you dare' : 'Could not find a place for the wisp' });
        return true;
    },
    spawnEgg(species, position) {
        if (!this.wispSpawnAt(position.x + 0.5, position.z + 0.5, position.y + 4)) return true;
        this.consumeSelectedBlock();
        this.placeActionTimer = 0.35;
        this.showHitIndicator();
        this.receiveSystemMessage({ text: 'A wisp flickers into being' });
        return true;
    }
});

Object.assign(Game.prototype, {
    wispSpawnAt(x, z, startY, natural = false) {
        const floor = this.cameraController.getFloorY(x, z, startY);
        if (floor <= -20) return null;
        const water = this.findWaterSurface(x, floor + 0.1, z);
        const mob = this.createMob('wisp', new THREE.Vector3(x, (water ?? floor) + 1.4, z));
        mob.userData.natural = natural;
        if (natural) {
            const { chunkX, chunkZ } = this.world.getChunkCoords(x, z);
            mob.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
        }
        this.ambientMobs.push(mob);
        this.wispChime([WISP_NOTES[2], WISP_NOTES[4], WISP_NOTES[6]], 0.12, 0.008);
        return mob;
    },

    // Now and then at night a wisp appears 25-40 blocks away, by water or a drop if it can.
    wispUpdateSpawning(delta) {
        this.wispSpawnTimer = (this.wispSpawnTimer ?? 12) - delta;
        if (this.wispSpawnTimer > 0) return;
        this.wispSpawnTimer = 12;
        if (!this.world || !this.isNightTime() || this.titleScreenOpen || this.respawnPending || Math.random() > 0.35) return;
        if (this.ambientMobs.filter((mob) => mob.userData.species === 'wisp').length >= getMobSpecies('wisp').limit) return;
        const player = this.getLocalPlayerPosition();
        let plain = null;
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 25 + Math.random() * 15;
            const x = player.x + Math.cos(angle) * distance;
            const z = player.z + Math.sin(angle) * distance;
            const floor = this.cameraController.getFloorY(x, z, player.y + 16);
            if (floor <= -20) continue;
            if (this.findShoreSpot(x, z) || this.wispDangerAt(x, z, floor + 2) || this.wispNearDrop(x, z, floor)) {
                this.wispSpawnAt(x, z, player.y + 16, true);
                return;
            }
            plain = plain || { x, z };
        }
        if (plain && Math.random() < 0.4) this.wispSpawnAt(plain.x, plain.z, player.y + 16, true);
    },

    // Whether the ground falls away by 4+ blocks within 3 blocks of (x, z).
    wispNearDrop(x, z, floor) {
        for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
            const other = this.cameraController.getFloorY(x + dx, z + dz, floor + 2);
            if (other > -20 && floor - other >= 4) return true;
        }
        return false;
    },

    // A dangerous spot at (x, z): deep water, or the low side of a drop (the void below a
    // ledge). `hoverY` is where the wisp waits over it, `fallY` where the player ends up.
    wispDangerAt(x, z, referenceY) {
        const floor = this.cameraController.getFloorY(x, z, referenceY + 8);
        if (floor <= -20) return null;
        const water = this.findWaterSurface(x, floor + 0.1, z);
        if (water !== null && water - floor >= 2) {
            return { kind: 'water', x: Math.floor(x) + 0.5, z: Math.floor(z) + 0.5, hoverY: water + 1.2, fallY: water, severity: Math.min(6, water - floor) };
        }
        const below = this.world.getBlockTypeAt(Math.floor(x), Math.floor(floor) - 1, Math.floor(z));
        if (below && (below.endsWith('leaves') || below.endsWith('wood'))) return null;
        let edge = null;
        for (const [dx, dz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) {
            const top = this.cameraController.getFloorY(x + dx, z + dz, referenceY + 8);
            if (top <= -20 || top - floor < 4) continue;
            const ground = this.world.getBlockTypeAt(Math.floor(x + dx), Math.floor(top) - 1, Math.floor(z + dz));
            if (!ground || ground.endsWith('leaves') || ground.endsWith('wood')) continue;
            if (!edge || top > edge) edge = top;
        }
        if (edge === null) return null;
        return { kind: 'drop', x: Math.floor(x) + 0.5, z: Math.floor(z) + 0.5, hoverY: edge + 1.4, fallY: (water ?? floor), edgeY: edge, severity: Math.min(12, edge - floor) / 2 };
    },

    // Looks ahead (away from the player) for water or a drop to lead them to.
    wispFindLure(mob, player) {
        const origin = mob.position;
        const away = Math.atan2(origin.z - player.z, origin.x - player.x);
        const feetY = player.y - this.cameraController.eyeHeight;
        let best = null;
        let bestScore = -Infinity;
        for (let radius = 4; radius <= 28; radius += 3) {
            for (let i = 0; i < 14; i++) {
                const offset = (i / 13 - 0.5) * Math.PI * 1.3;
                const x = origin.x + Math.cos(away + offset) * radius;
                const z = origin.z + Math.sin(away + offset) * radius;
                const danger = this.wispDangerAt(x, z, Math.max(origin.y, feetY));
                if (!danger) continue;
                // Mostly ahead, not too far, and as dangerous as possible.
                const score = danger.severity * 1.5 - radius * 0.18 - Math.abs(offset) * 1.6 + Math.random() * 0.6;
                if (score > bestScore) {
                    bestScore = score;
                    best = danger;
                }
            }
        }
        return best;
    },

    wispInit(mob) {
        const data = mob.userData;
        const rig = new THREE.Group();
        const halo = this.getFireflyHaloTexture();
        const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xeafff8, transparent: true });
        const flameMaterial = new THREE.MeshBasicMaterial({ color: 0x6fe8c8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
        data.glowMaterials = [coreMaterial, flameMaterial];
        const core = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), coreMaterial);
        core.userData.disposeGeometry = true;
        core.userData.mobRoot = mob;
        rig.add(core);
        // Stacked, tapering boxes that sway and spin: a voxel flame.
        const flames = [[0.34, 0], [0.26, 0.15], [0.18, 0.29], [0.1, 0.41]].map(([size, y], index) => {
            const flame = new THREE.Mesh(new THREE.BoxGeometry(size, size * 1.2, size), flameMaterial);
            flame.position.y = y;
            flame.userData.disposeGeometry = true;
            flame.userData.mobRoot = mob;
            flame.userData.baseY = y;
            flame.userData.spin = (index % 2 ? -1 : 1) * (0.8 + index * 0.5);
            rig.add(flame);
            return flame;
        });
        const haloMaterial = new THREE.SpriteMaterial({ map: halo, color: 0x8fffe0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 });
        const hazeMaterial = new THREE.SpriteMaterial({ map: halo, color: 0x5fd8c0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.15 });
        const haloSprite = new THREE.Sprite(haloMaterial);
        haloSprite.position.y = 0.12;
        const hazeSprite = new THREE.Sprite(hazeMaterial);
        hazeSprite.position.y = 0.12;
        rig.add(haloSprite, hazeSprite);
        mob.add(rig);

        // Trailing motes live in world space (positions relative to the moving wisp).
        const moteMaterial = new THREE.SpriteMaterial({ map: halo, color: 0xb8fff0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.9 });
        const motes = [];
        for (let i = 0; i < 14; i++) {
            const sprite = new THREE.Sprite(moteMaterial);
            sprite.scale.setScalar(0.001);
            mob.add(sprite);
            motes.push({ sprite, position: mob.position.clone(), velocity: new THREE.Vector3(), age: 1, life: 1 });
        }

        data.wisp = {
            rig, core, flames, haloSprite, hazeSprite, coreMaterial, flameMaterial, haloMaterial, hazeMaterial, motes,
            moteIndex: 0, moteTimer: 0,
            fade: 0, presence: 0, leaving: false,
            lure: null, relure: 0, holdTime: 0, calm: 0,
            stamina: 5 + Math.random() * 3, tired: 0,
            teleport: null, flickerTimer: 6 + Math.random() * 6,
            chimeTimer: 1 + Math.random() * 2,
            wander: Math.random() * Math.PI * 2
        };
    },

    wispUpdate(mob, delta, player) {
        const data = mob.userData;
        if (!data.wisp) this.wispInit(mob);
        const w = data.wisp;
        data.life += delta;
        if (data.modelRoot) data.modelRoot.visible = false;
        const position = mob.position;
        const feetY = player.y - this.cameraController.eyeHeight;
        const dx = position.x - player.x;
        const dz = position.z - player.z;
        const flat = Math.hypot(dx, dz);
        const touching = Math.hypot(dx, position.y - (feetY + 1), dz);
        const active = !this.titleScreenOpen && !this.respawnPending;

        // Summoned ones linger a minute in daylight; wild ones fade at dawn or when far behind.
        if (!data.natural && data.daylightGrace === undefined) data.daylightGrace = 60;
        data.daylightGrace = Math.max(0, (data.daylightGrace || 0) - delta);
        if (!w.leaving && ((!this.isNightTime() && data.daylightGrace <= 0) || flat > 72)) w.leaving = true;
        if (w.leaving) {
            w.presence -= delta / 2.5;
            if (w.presence <= 0) {
                this.removeMob(mob);
                return;
            }
        } else {
            w.presence = Math.min(1, w.presence + delta / 1.5);
        }

        // Caught!
        if (active && !w.leaving && w.fade > 0.5 && touching < 1.2) {
            this.wispBurst(mob, 'You caught the wisp! It burst into glowing dust');
            return;
        }

        // Flickering out and back in somewhere else.
        if (w.teleport) {
            if (w.fade < 0.03) {
                position.copy(w.teleport);
                w.teleport = null;
                this.wispChime([WISP_NOTES[0], WISP_NOTES[3]], 0.1, 0.006 * this.wispVolume(flat));
            }
        }
        const fadeTarget = w.teleport ? 0 : w.presence;
        w.fade += (fadeTarget - w.fade) * Math.min(1, delta * (w.teleport ? 9 : 3));

        // Decide where to go.
        w.calm = Math.max(0, w.calm - delta);
        w.relure -= delta;
        w.tired = Math.max(0, w.tired - delta);
        if (active && !w.leaving && w.calm <= 0 && flat < 11 && w.relure <= 0 && (!w.lure || w.holdTime > 7)) {
            const lure = this.wispFindLure(mob, player);
            if (lure && w.lure && w.holdTime > 7) {
                // The player would not fall for it: it slips off towards the next trap.
                const angle = Math.atan2(lure.z - position.z, lure.x - position.x);
                const hop = Math.min(5, Math.hypot(lure.x - position.x, lure.z - position.z));
                this.wispFlicker(mob, position.x + Math.cos(angle) * hop, position.z + Math.sin(angle) * hop, position.y);
            }
            if (lure || w.holdTime > 7) w.lure = lure;
            w.holdTime = 0;
            w.relure = lure ? 5 : 2;
        }

        let heading = null;
        let speed = 0;
        let atLure = false;
        if (active && !w.leaving && !w.teleport) {
            if (flat < 9 && w.calm <= 0) {
                if (w.lure) {
                    const lx = w.lure.x - position.x;
                    const lz = w.lure.z - position.z;
                    atLure = Math.hypot(lx, lz) < 0.6;
                    if (!atLure) heading = Math.atan2(lz, lx);
                } else {
                    // Nothing dangerous ahead: just away, weaving a little.
                    w.wander += (Math.random() - 0.5) * delta * 2;
                    heading = Math.atan2(dz, dx) + Math.sin(w.wander) * 0.5;
                }
                // Too close: it darts off (until it tires); 6-8 blocks: it drifts, luring.
                if (flat < 6) speed = w.tired > 0 ? 2.6 : getMobSpecies('wisp').speed;
                else speed = 2.2;
                if (speed > 3) {
                    w.stamina -= delta;
                    if (w.stamina <= 0) {
                        w.tired = 2.5;
                        w.stamina = 5 + Math.random() * 3;
                    }
                }
            } else if (flat > 20 && !w.lure) {
                // Far away: it drifts closer to be seen, beckoning.
                heading = Math.atan2(-dz, -dx);
                speed = 0.8;
            }
            if (w.lure && Math.hypot(w.lure.x - position.x, w.lure.z - position.z) < 1.5) {
                atLure = true;
                if (flat < 7) w.holdTime += delta;
            }
            // Random flicker ahead while leading.
            w.flickerTimer -= delta;
            if (w.flickerTimer <= 0 && heading !== null && flat < 9) {
                w.flickerTimer = 6 + Math.random() * 6;
                if (Math.random() < 0.4) {
                    let hop = 3 + Math.random() * 3;
                    if (w.lure) hop = Math.min(hop, Math.hypot(w.lure.x - position.x, w.lure.z - position.z));
                    this.wispFlicker(mob, position.x + Math.cos(heading) * hop, position.z + Math.sin(heading) * hop, position.y);
                }
            }
        }

        if (heading !== null && speed > 0) {
            position.x += Math.cos(heading) * speed * delta;
            position.z += Math.sin(heading) * speed * delta;
        }

        // Height: hovering over the ground or the water, at the ledge's level over a drop.
        const ground = this.cameraController.getFloorY(position.x, position.z, Math.max(position.y, feetY) + 4);
        let hoverY = position.y;
        if (ground > -20) {
            const water = this.findWaterSurface(position.x, ground + 0.1, position.z);
            hoverY = (water ?? ground) + 1.3;
        }
        if (w.lure && Math.hypot(w.lure.x - position.x, w.lure.z - position.z) < 5) hoverY = Math.max(hoverY, w.lure.hoverY);
        const bob = Math.sin(data.life * 1.7) * 0.18 + Math.sin(data.life * 0.63) * 0.1;
        position.y += (hoverY + bob - position.y) * Math.min(1, delta * 2.2);

        // Fell for it: the player is in the water or below the ledge, near the trap.
        if (w.lure && active && Math.hypot(player.x - w.lure.x, player.z - w.lure.z) < 5) {
            const fell = w.lure.kind === 'water' ? this.cameraController.isInWater : feetY < w.lure.edgeY - 2.5;
            if (fell) this.wispMock(mob, player);
        }

        this.wispAnimate(mob, delta, atLure || speed === 0);
        this.wispSounds(mob, delta, flat, heading === null);
    },

    // Fades out and reappears at (x, z).
    wispFlicker(mob, x, z, y) {
        const ground = this.cameraController.getFloorY(x, z, y + 4);
        if (ground <= -20) return;
        mob.userData.wisp.teleport = new THREE.Vector3(x, Math.max(y, ground + 1.2), z);
        this.playTone({ frequency: 2600, endFrequency: 900, duration: 0.35, type: 'sine', volume: 0.007, attack: 0.02, release: 0.2 });
    },

    // The player fell for it: a giggle, and it slips away to beckon from somewhere else.
    wispMock(mob, player) {
        const w = mob.userData.wisp;
        w.lure = null;
        w.calm = 10;
        w.holdTime = 0;
        this.wispChime([WISP_NOTES[6], WISP_NOTES[5], WISP_NOTES[4], WISP_NOTES[5], WISP_NOTES[3], WISP_NOTES[2]], 0.08, 0.01, 'triangle');
        const angle = Math.random() * Math.PI * 2;
        const distance = 14 + Math.random() * 6;
        this.wispFlicker(mob, player.x + Math.cos(angle) * distance, player.z + Math.sin(angle) * distance, player.y + 4);
        if (!this.wispMockedOnce) {
            this.wispMockedOnce = true;
            this.receiveSystemMessage({ text: 'Somewhere, a wisp giggles' });
        }
    },

    wispStruck(mob) {
        const w = mob.userData.wisp;
        if (!w || w.leaving || w.fade < 0.3) return;
        this.wispBurst(mob, 'The wisp burst into glowing dust');
    },

    // It bursts into sparkles and leaves glow dust floating where it was.
    wispBurst(mob, message) {
        const position = mob.position.clone();
        const boost = this.ultraModeEnabled ? 3 : 1;
        this.wispSparks = this.wispSparks || [];
        for (let i = 0; i < 36; i++) {
            const material = new THREE.SpriteMaterial({ map: this.getFireflyHaloTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
            const tint = Math.random();
            material.color.setRGB((0.55 + tint * 0.45) * boost, boost, (0.85 + tint * 0.15) * boost);
            const sprite = new THREE.Sprite(material);
            sprite.position.copy(position);
            const direction = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
            sprite.userData.velocity = direction.multiplyScalar(1.5 + Math.random() * 3);
            sprite.userData.age = 0;
            sprite.userData.life = 0.9 + Math.random() * 1.1;
            sprite.userData.size = 0.12 + Math.random() * 0.2;
            this.scene.add(sprite);
            this.wispSparks.push(sprite);
        }
        const amount = Math.random() < 0.35 ? 2 : 1;
        this.spawnPickup('glow_dust', { x: position.x - 0.5, y: position.y - 0.8, z: position.z - 0.5 }, amount);
        this.wispChime([WISP_NOTES[0], WISP_NOTES[2], WISP_NOTES[3], WISP_NOTES[4], WISP_NOTES[6], WISP_NOTES[6] * 1.5], 0.06, 0.012);
        this.playNoiseBurst({ duration: 0.5, volume: 0.012, highpass: 3500, lowpass: 9000 });
        this.emitMobEvent('defeated', mob, 'player');
        this.removeMob(mob);
        if (message) this.receiveSystemMessage({ text: message });
    },

    wispUpdateSparks(delta) {
        if (!this.wispSparks || !this.wispSparks.length) return;
        this.wispSparks = this.wispSparks.filter((sprite) => {
            const spark = sprite.userData;
            spark.age += delta;
            const t = spark.age / spark.life;
            if (t >= 1) {
                this.scene.remove(sprite);
                sprite.material.dispose();
                return false;
            }
            spark.velocity.multiplyScalar(Math.max(0, 1 - delta * 2.5));
            spark.velocity.y += delta * 0.6;
            sprite.position.addScaledVector(spark.velocity, delta);
            const twinkle = 0.6 + 0.4 * Math.sin(spark.age * 30 + spark.life * 10);
            sprite.scale.setScalar(spark.size * (1 - t) * twinkle);
            return true;
        });
    },

    // Flickering flame, halo and trailing motes; HDR-bright in Ultra so it blooms.
    wispAnimate(mob, delta, beckoning) {
        const data = mob.userData;
        const w = data.wisp;
        const t = data.life;
        let flicker = 0.84 + Math.sin(t * 13.1) * 0.07 + Math.sin(t * 23.7 + 1.3) * 0.05 + Math.sin(t * 5.3) * 0.04;
        // Beckoning: slow, deep pulses of light.
        if (beckoning) flicker *= 0.75 + 0.35 * Math.max(0, Math.sin(t * 2.4));
        if (Math.random() < delta * 1.5) flicker *= 0.55;
        const visible = w.fade * flicker;
        mob.visible = w.fade > 0.01;
        const boost = this.ultraModeEnabled ? 5 : 1;
        w.coreMaterial.color.setRGB(0.88 * boost, boost, 0.96 * boost);
        w.coreMaterial.opacity = Math.min(1, w.fade * 1.2);
        w.flameMaterial.color.setRGB(0.35 * Math.max(1, boost * 0.5), 0.95 * Math.max(1, boost * 0.5), 0.8 * Math.max(1, boost * 0.5));
        w.flameMaterial.opacity = 0.55 * visible;
        w.haloMaterial.opacity = 0.8 * visible;
        w.hazeMaterial.opacity = (this.isNightTime() ? 0.18 : 0.08) * visible;
        w.core.scale.setScalar(0.8 + flicker * 0.4);
        w.core.rotation.y = t * 1.3;
        w.core.rotation.x = t * 0.7;
        w.flames.forEach((flame, index) => {
            const sway = index * 0.025;
            flame.position.x = Math.sin(t * 3.1 + index * 0.9) * sway;
            flame.position.z = Math.cos(t * 2.6 + index * 1.4) * sway;
            flame.position.y = flame.userData.baseY + Math.sin(t * 7 + index) * 0.015;
            flame.rotation.y = t * flame.userData.spin;
            flame.scale.set(1, 0.85 + flicker * 0.3 + Math.sin(t * 9 + index * 2) * 0.08, 1);
        });
        w.haloSprite.scale.setScalar(1.3 + flicker * 0.4);
        w.hazeSprite.scale.setScalar(3.2 + Math.sin(t * 0.8) * 0.4);

        // Motes shed behind it, rising and fading.
        w.moteTimer -= delta;
        if (w.moteTimer <= 0 && w.fade > 0.2) {
            w.moteTimer = 0.07;
            const mote = w.motes[w.moteIndex];
            w.moteIndex = (w.moteIndex + 1) % w.motes.length;
            mote.position.set(mob.position.x + (Math.random() - 0.5) * 0.25, mob.position.y + (Math.random() - 0.3) * 0.25, mob.position.z + (Math.random() - 0.5) * 0.25);
            mote.velocity.set((Math.random() - 0.5) * 0.25, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.25);
            mote.age = 0;
            mote.life = 0.9 + Math.random() * 0.8;
        }
        w.motes.forEach((mote) => {
            mote.age += delta;
            const life = 1 - mote.age / mote.life;
            if (life <= 0) {
                mote.sprite.scale.setScalar(0.001);
                return;
            }
            mote.position.addScaledVector(mote.velocity, delta);
            mote.sprite.position.subVectors(mote.position, mob.position);
            const twinkle = 0.7 + 0.3 * Math.sin(mote.age * 20 + mote.life * 7);
            mote.sprite.scale.setScalar(Math.max(0.001, 0.16 * life * twinkle * w.fade));
        });
    },

    wispVolume(distance) {
        return Math.max(0, 1 - distance / 30);
    },

    // Faint, whispery chimes: a two-note call while beckoning, single notes while leading.
    wispSounds(mob, delta, distance, beckoning) {
        const w = mob.userData.wisp;
        w.chimeTimer -= delta;
        if (w.chimeTimer > 0 || w.fade < 0.3) return;
        w.chimeTimer = beckoning ? 3 + Math.random() * 3 : 1.8 + Math.random() * 2.5;
        const volume = 0.01 * this.wispVolume(distance);
        if (volume <= 0) return;
        const base = Math.floor(Math.random() * (WISP_NOTES.length - 2));
        const notes = beckoning ? [WISP_NOTES[base], WISP_NOTES[base + 2]] : [WISP_NOTES[base + Math.floor(Math.random() * 2)]];
        this.wispChime(notes, 0.22, volume);
        this.playNoiseBurst({ duration: 0.7, volume: volume * 0.35, highpass: 2400, lowpass: 6500 });
    },

    wispChime(notes, gap, volume, type = 'sine') {
        notes.forEach((frequency, index) => {
            setTimeout(() => {
                this.playTone({ frequency, endFrequency: frequency * 1.01, duration: 0.9, type, volume, attack: 0.04, release: 0.6, detune: (Math.random() - 0.5) * 12 });
                this.playTone({ frequency: frequency * 2.005, duration: 0.6, type: 'sine', volume: volume * 0.3, attack: 0.03, release: 0.5 });
            }, index * gap * 1000);
        });
    },

    // One soft light shared by all wisps, at the one nearest the player (a single light
    // avoids recompiling materials whenever a wisp comes or goes).
    wispUpdateLight() {
        let nearest = null;
        let best = Infinity;
        const player = this.getLocalPlayerPosition();
        this.ambientMobs.forEach((mob) => {
            if (mob.userData.species !== 'wisp' || !mob.userData.wisp) return;
            const distance = Math.hypot(mob.position.x - player.x, mob.position.z - player.z);
            if (distance < best) {
                best = distance;
                nearest = mob;
            }
        });
        if (!nearest && !this.wispLight) return;
        if (!this.wispLight) {
            this.wispLight = new THREE.PointLight(0x8fffe0, 0, 9, 2);
            this.scene.add(this.wispLight);
        }
        if (!nearest) {
            this.wispLight.intensity = 0;
            return;
        }
        const w = nearest.userData.wisp;
        this.wispLight.position.copy(nearest.position);
        this.wispLight.intensity = 1.2 * w.fade * (0.85 + Math.sin(nearest.userData.life * 13.1) * 0.1);
    }
});

// Per-frame work that does not belong to one wisp: night spawning, the sparkles of burst
// wisps (which outlive them) and the shared light.
registerFrameUpdate(function (delta) {
    this.wispUpdateSpawning(delta);
    this.wispUpdateSparks(delta);
    this.wispUpdateLight();
});
