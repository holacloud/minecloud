// Owls. Each owl perches on a treetop (the top of the leaves) in forests and plains, a
// different tree now and then. By day it sleeps there, puffed up with its eyes shut, opening
// one to peek at a player who comes near and flying off to another tree if they come too
// close. At night it wakes: its big eyes glow faintly (blooming in Ultra), its head swivels
// to follow the player, up to 135 degrees either way, in quick owl-like jerks, with a bob or
// a curious tilt now and then, and when the player slips behind it, it shuffles round on its
// perch. It hoots ("hoo, hoo-hoo") and nearby owls answer. It glides silently from perch to
// perch and hunts bats in flight and rabbits on the ground: it locks its gaze on the prey,
// bobs its head, then swoops with its talons thrust forward, carries the catch back to a
// perch and swallows it. Struck, it screeches and flies off to another tree.
// Registered as the 'nightwatch' movement through js/extensions.js.

const _owlVector = new THREE.Vector3();
const _owlTarget = new THREE.Vector3();
// 135 degrees either way of straight ahead: the famous 270-degree owl head turn.
const OWL_HEAD_LIMIT = Math.PI * 0.75;
// Height of the eyes above the feet when perched.
const OWL_EYE_HEIGHT = 0.64;
// Iris colour of each variant: brown (horned), grey and snowy owl.
const OWL_IRIS = [0xf08a1c, 0xf2c230, 0xf6d84a];
// Shared by every owl's eyes (never disposed with a mob).
const OWL_EYE_GEOMETRY = {};

MOB_SPECIES.owl = { eggColor: 0x8a6440, tone: 340, speed: 3.4, maxHealth: 12, variants: 3, group: [1, 1], limit: 3, movement: 'nightwatch' };
VoxelModels.MOB_SURFACES.owl = 'feather';

// Round and upright, standing on its talons at the origin. Its wings hang folded at its
// sides and spread sideways for flight; the eyes (lit) are added by js/game/owl.js, under
// eyelids that close as it sleeps.
VoxelModels.mobBuilders.owl = function (b, variant) {
    const palettes = [
        { back: 0x7a5232, bar: 0x45301e, belly: 0xc9a274, bellyBar: 0x6a4428, disc: 0xb8875a, rim: 0x3a2618, ring: 0x8a6040, beak: 0x2a221c, foot: 0xa88458, tuft: 2.4, marks: 1 },
        { back: 0x8a8680, bar: 0x4e4a46, belly: 0xc8c4bc, bellyBar: 0x6e6a64, disc: 0xb6b2aa, rim: 0x3a3632, ring: 0x77736d, beak: 0xc9b46a, foot: 0xaca89f, tuft: 1.6, marks: 1 },
        { back: 0xf2f0ea, bar: 0x2e2a26, belly: 0xf7f5f0, bellyBar: 0x3a3632, disc: 0xfbfaf6, rim: 0xd6d2ca, ring: 0xe6e2da, beak: 0x2a2624, foot: 0xf2eee6, tuft: 0.8, marks: 0.45 }
    ];
    const c = palettes[variant % palettes.length];
    const bars = (p, color, step, density) => {
        for (let y = 0.8; y < p.h - 0.3; y += step) {
            for (let x = (y * 1.7) % 1.3; x < p.w - 0.4; x += 1.6) {
                if (((x * 7 + y * 3) % 1) < density) p.rect(x, y, 0.65, 0.35, color, 0.04);
            }
        }
    };
    b.part('body', { pivot: [0, 0, 0], from: [-2.75, 1.5, -2.5], size: [5.5, 6, 5], paint: { color: c.back, noise: 0.07, all: (p, face) => {
        if (face === 'front') {
            p.rect(0.6, 0, p.w - 1.2, p.h - 0.2, c.belly, 0.05);
            bars(p, c.bellyBar, 1.2, 0.8 * c.marks);
        } else if (face === 'bottom') {
            p.fill(c.belly, 0.05);
        } else {
            p.spots(c.bar, Math.round(12 * c.marks), 0.6, 1.2);
        }
    } } });
    b.part('head', {
        parent: 'body', pivot: [0, 7.5, 0.2], from: [-3, 0, -2.75], size: [6, 5, 5.5],
        paint: { color: c.back, noise: 0.06, all: (p, face) => {
            if (face !== 'front') {
                if (face !== 'bottom') p.spots(c.bar, Math.round(7 * c.marks), 0.5, 1);
                return;
            }
            // Facial disc with a dark rim, darker rings round the eyes and a pale "V" of brows.
            p.rect(0.1, 0.4, 5.8, 4.5, c.rim, 0.03);
            p.rect(0.4, 0.6, 5.2, 4.1, c.disc, 0.04);
            p.rect(0.3, 0.95, 2.5, 2.5, c.ring, 0.03);
            p.rect(3.2, 0.95, 2.5, 2.5, c.ring, 0.03);
            p.rect(1.2, 0.5, 1.6, 0.4, c.belly, 0);
            p.rect(3.2, 0.5, 1.6, 0.4, c.belly, 0);
            p.rect(2.6, 0.9, 0.8, 1.2, c.belly, 0);
        } }
    });
    b.part('beak', { parent: 'head', pivot: [0, 2.1, 2.75], from: [-0.45, -1.5, 0], size: [0.9, 1.5, 0.8], paint: { color: c.beak, noise: 0.03 }, rotation: [0.15, 0, 0] });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        // Eyelid: hinged above the eye, shrunk to a brow when the eye is open.
        b.part(`lid${side}`, { parent: 'head', pivot: [1.45 * sign, 3.9, 2.75], from: [-1.1, -2.2, 0], size: [2.2, 2.2, 0.3], paint: { color: c.ring, noise: 0.04, all: (p, face) => { if (face === 'front') p.rect(0, p.h - 0.4, p.w, 0.4, c.rim, 0); } } });
        b.part(`tuft${side}`, { parent: 'head', pivot: [2.2 * sign, 5, 0.6], from: [-0.6, -0.3, -0.6], size: [1.2, c.tuft, 1.1], paint: { color: c.back, noise: 0.06, faces: { front: (p) => p.rect(0, 0, p.w, p.h * 0.5, c.bar, 0.04) } }, rotation: [-0.25, 0, -0.3 * sign] });
        const wingPaint = { color: c.back, noise: 0.07, all: (p, face) => {
            if (face === 'top' || face === 'bottom') return;
            bars(p, c.bar, 1.3, 0.9 * c.marks);
        } };
        // Hangs down from the shoulder; flight swings it up and out around z.
        b.part(`wing${side}`, { parent: 'body', pivot: [2.75 * sign, 7, 0.4], from: [sign > 0 ? 0 : -0.9, -5.5, -2.9], size: [0.9, 5.5, 5.4], paint: wingPaint });
        b.part(`wingTip${side}`, { parent: `wing${side}`, pivot: [0.45 * sign, -5.5, 0], from: [-0.4, -4.5, -2.6], size: [0.8, 4.5, 4.8], paint: { color: c.bar, noise: 0.08, all: (p, face) => { if (face !== 'top' && face !== 'bottom') bars(p, c.back, 1.1, 0.9); } } });
        b.part(`leg${side}`, { parent: 'body', pivot: [1.3 * sign, 2, 0.6], from: [-0.6, -2, -0.6], size: [1.2, 2, 1.2], paint: { color: c.foot, noise: 0.08 } });
        b.part(`talons${side}`, { parent: `leg${side}`, pivot: [0, -2, 0], from: [-0.8, 0, -0.7], size: [1.6, 0.5, 1.9], paint: { color: 0x1c1612, noise: 0.03, faces: { top: (p) => p.fill(c.foot, 0.06) } } });
    });
    b.part('tail', { parent: 'body', pivot: [0, 2.5, -2.5], from: [-1.6, -0.4, -2.6], size: [3.2, 0.8, 2.6], paint: { color: c.back, noise: 0.07, all: (p) => p.spots(c.bar, 3, 0.5, 0.8) }, rotation: [-0.6, 0, 0] });
    return { head: 'head' };
};

registerMobBehaviour('nightwatch', {
    update(mob, delta, player) {
        this.updateOwl(mob, delta, player);
    },
    interact(mob) {
        this.owlStruck(mob);
    },
    spawnCommand(species, x, z, player) {
        this.owlSpawnNear(x, z, player.y + 1);
        return true;
    },
    spawnEgg(species, position) {
        if (!this.owlSpawnNear(position.x + 0.5, position.z + 0.5, position.y + 2)) return true;
        this.consumeSelectedBlock();
        this.placeActionTimer = 0.35;
        this.showHitIndicator();
        return true;
    },
    spawnForChunk(chunkX, chunkZ, biome) {
        this.owlSpawnForChunk(chunkX, chunkZ, biome);
    }
});

Object.assign(Game.prototype, {
    // Top of the canopy in column (x, z): open air standing on leaves.
    owlFindPerch(x, z) {
        const bx = Math.floor(x);
        const bz = Math.floor(z);
        const top = Math.floor(this.cameraController.getFloorY(bx + 0.5, bz + 0.5, 96)) - 1;
        if (top <= -20) return null;
        const block = this.world.getBlockTypeAt(bx, top, bz) || '';
        if (block !== 'leaves' && !block.endsWith('_leaves')) return null;
        return new THREE.Vector3(bx + 0.5, top + 1, bz + 0.5);
    },

    // Nearest treetop to (x, z), searching outwards ring by ring.
    owlFindPerchNear(x, z, radius) {
        for (let r = 0; r <= radius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const spot = this.owlFindPerch(x + dx, z + dz);
                    if (spot) return spot;
                }
            }
        }
        return null;
    },

    // Dry ground at (x, z), for an owl with no tree around.
    owlGroundSpot(x, z, startY = 96) {
        const floor = this.cameraController.getFloorY(x, z, startY);
        if (floor <= -20 || this.findWaterSurface(x, floor + 0.1, z) !== null) return null;
        return new THREE.Vector3(Math.floor(x) + 0.5, floor, Math.floor(z) + 0.5);
    },

    // Another treetop to fly to: a few to twenty blocks away (further, and away from
    // `awayFrom`, when fleeing), never too far from home nor on another owl's perch. With no
    // tree around, the highest dry ground.
    owlChoosePerch(mob, awayFrom = null) {
        const data = mob.userData;
        const flight = data.flight;
        const base = Math.hypot(mob.position.x - data.home.x, mob.position.z - data.home.z) > 24 ? data.home : mob.position;
        const owls = this.ambientMobs.filter((other) => other !== mob && other.userData.species === 'owl' && other.userData.flight);
        let best = null;
        let bestScore = -Infinity;
        let ground = null;
        for (let i = 0; i < 28; i++) {
            let angle = Math.random() * Math.PI * 2;
            if (awayFrom) angle = Math.atan2(mob.position.z - awayFrom.z, mob.position.x - awayFrom.x) + (Math.random() - 0.5) * 1.8;
            const distance = awayFrom ? 9 + Math.random() * 14 : 4 + Math.random() * 16;
            const x = base.x + Math.cos(angle) * distance;
            const z = base.z + Math.sin(angle) * distance;
            const spot = this.owlFindPerch(x, z);
            if (!spot) {
                const dry = i < 8 ? this.owlGroundSpot(x, z) : null;
                if (dry && (!ground || dry.y > ground.y)) ground = dry;
                continue;
            }
            if (spot.distanceTo(flight.perch) < 1.5) continue;
            if (owls.some((other) => other.userData.flight.perch.distanceTo(spot) < 2)) continue;
            // Higher trees are better lookouts.
            const score = spot.y * 0.4 + Math.random() * 2;
            if (score > bestScore) {
                bestScore = score;
                best = spot;
            }
        }
        // Sparse trees: the nearest one around, before settling for the ground.
        let choice = best;
        if (!choice) {
            const near = this.owlFindPerchNear(base.x, base.z, 12);
            if (near && near.distanceTo(flight.perch) >= 1.5) choice = near;
        }
        choice = choice || ground;
        if (!choice) return false;
        flight.perch.copy(choice);
        return true;
    },

    // Natural spawning: now and then a forest or plains chunk has an owl in one of its trees.
    owlSpawnForChunk(chunkX, chunkZ, biome) {
        if (biome !== 'forest' && biome !== 'plains') return;
        if (this.chunkRandom(chunkX, chunkZ, 141) > (biome === 'forest' ? 0.18 : 0.07)) return;
        if (this.ambientMobs.filter((mob) => mob.userData.species === 'owl').length >= getMobSpecies('owl').limit) return;
        const size = this.world.chunkSize;
        for (let i = 0; i < 24; i++) {
            const spot = this.owlFindPerch(chunkX * size + this.chunkRandom(chunkX, chunkZ, 142 + i) * size, chunkZ * size + this.chunkRandom(chunkX, chunkZ, 172 + i) * size);
            if (!spot) continue;
            const owl = this.createMob('owl', spot);
            owl.userData.natural = true;
            owl.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
            this.owlInit(owl);
            this.ambientMobs.push(owl);
            return;
        }
    },

    // For /mob and eggs: the owl appears in the air at (x, y, z) and glides to the nearest
    // treetop, or with no tree around to the ground.
    owlSpawnNear(x, z, y) {
        let perch = this.owlFindPerchNear(x, z, 14);
        const inTree = Boolean(perch);
        if (!perch) perch = this.owlGroundSpot(x, z, y + 4);
        if (!perch) {
            this.receiveSystemMessage({ text: 'Could not find anywhere for the owl to perch' });
            return false;
        }
        for (let i = 0; i < 8 && this.world.hasSolidBlock(Math.floor(x), Math.floor(y), Math.floor(z)); i++) y += 1;
        const owl = this.createMob('owl', new THREE.Vector3(x, y, z));
        this.owlInit(owl);
        const data = owl.userData;
        const flight = data.flight;
        flight.perch.copy(perch);
        flight.mode = 'glide';
        flight.timer = 20;
        flight.flapBoost = 1.2;
        flight.perched = 0;
        flight.sleep = 0;
        data.facing = Math.atan2(perch.z - z, perch.x - x);
        owl.rotation.y = Math.PI / 2 - data.facing;
        this.ambientMobs.push(owl);
        this.owlHoot(owl, true);
        this.receiveSystemMessage({ text: inTree ? 'Spawned an owl; it glides to the nearest treetop' : 'Spawned an owl; no trees nearby, so it perches on the ground' });
        return true;
    },

    owlInit(mob) {
        const data = mob.userData;
        mob.rotation.order = 'YXZ';
        data.velocity = new THREE.Vector3();
        data.facing = data.direction;
        mob.rotation.y = Math.PI / 2 - data.facing;
        data.flight = {
            mode: 'perch', perch: mob.position.clone(), timer: 30 + Math.random() * 40, validate: 1,
            calm: 2, flapBoost: 0, flap: 0, wingPhase: 0, turnRate: 0, perched: 1, failures: 0, flee: false,
            sleep: this.isNightTime() ? 0 : 1, peek: 0, blink: 0, blinkTimer: 3, stretch: 0, stretchSide: 1,
            headYaw: 0, headGoal: 0, headPitch: 0, headRoll: 0, tilt: 0, tiltTimer: 4, bob: 0, behind: 0, settle: 0,
            lookYaw: 0, lookTimer: 0, hootTimer: 3 + Math.random() * 12, answer: 0, notes: [], throat: 0,
            huntTimer: 4 + Math.random() * 6, stalk: null, stalkTimer: 0, prey: null, carrying: null, carryRoot: null, eatTimer: 0
        };
    },

    // The eyes: an iris that glows (HDR in Ultra, so it blooms), a pupil that widens at night
    // and a glint. Re-added when the model is rebuilt (graphics quality change).
    owlAttachEyes(mob) {
        const data = mob.userData;
        const head = data.modelParts.head;
        if (!OWL_EYE_GEOMETRY.iris) {
            OWL_EYE_GEOMETRY.iris = new THREE.BoxGeometry(1.9 / 16, 1.9 / 16, 0.06 / 16);
            OWL_EYE_GEOMETRY.pupil = new THREE.BoxGeometry(1 / 16, 1 / 16, 0.06 / 16);
            OWL_EYE_GEOMETRY.glint = new THREE.BoxGeometry(0.35 / 16, 0.35 / 16, 0.04 / 16);
        }
        if (!data.owlIris) {
            data.owlIris = new THREE.MeshBasicMaterial({ color: OWL_IRIS[data.variant % OWL_IRIS.length] });
            data.owlPupil = new THREE.MeshBasicMaterial({ color: 0x0a0806 });
            data.owlGlint = new THREE.MeshBasicMaterial({ color: 0xffffff });
            data.glowMaterials = [data.owlIris, data.owlPupil, data.owlGlint];
        }
        if (data.owlEyesOn === head) return;
        data.owlEyesOn = head;
        data.owlPupils = [];
        [-1, 1].forEach((sign) => {
            const add = (geometry, material, x, y, z) => {
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(x / 16, y / 16, z / 16);
                mesh.userData.mobRoot = mob;
                head.add(mesh);
                return mesh;
            };
            add(OWL_EYE_GEOMETRY.iris, data.owlIris, sign * 1.45, 2.8, 2.78);
            data.owlPupils.push(add(OWL_EYE_GEOMETRY.pupil, data.owlPupil, sign * 1.45, 2.8, 2.83));
            add(OWL_EYE_GEOMETRY.glint, data.owlGlint, sign * 1.45 + 0.35, 3.15, 2.87);
        });
        ['L', 'R'].forEach((side) => {
            data.modelParts[`wing${side}`].rotation.order = 'YXZ';
        });
        head.rotation.order = 'YXZ';
        data.owlHeadBase = head.position.clone();
        // The carried prey hung from the old model.
        if (data.flight && data.flight.carrying && data.flight.carryRoot !== data.modelRoot) data.flight.carrying = null;
    },

    updateOwl(mob, delta, player) {
        const data = mob.userData;
        if (!data.flight) this.owlInit(mob);
        const flight = data.flight;
        data.life += delta;
        this.owlAttachEyes(mob);
        flight.timer -= delta;
        flight.calm = Math.max(0, flight.calm - delta);
        flight.flapBoost = Math.max(0, flight.flapBoost - delta);
        flight.huntTimer -= delta;
        this.owlUpdateCalls(mob, delta);

        // Asleep on its perch by day; it dozes off slowly after dawn and wakes quickly at dusk.
        const sleepy = !this.isNightTime() && flight.mode === 'perch' && !flight.carrying;
        flight.sleep += ((sleepy ? 1 : 0) - flight.sleep) * Math.min(1, delta * (sleepy ? 0.2 : 2));

        if (flight.mode === 'perch') this.owlUpdatePerched(mob, delta, player);
        else if (flight.mode === 'swoop') this.owlUpdateSwoop(mob, delta);
        else this.owlUpdateGlide(mob, delta);
        this.owlPose(mob, delta, player);
    },

    owlUpdatePerched(mob, delta, player) {
        const data = mob.userData;
        const flight = data.flight;
        const night = this.isNightTime();
        mob.position.copy(flight.perch);
        data.velocity.set(0, 0, 0);
        const distance = Math.hypot(player.x - mob.position.x, player.y - (mob.position.y + OWL_EYE_HEIGHT), player.z - mob.position.z);

        // The leaves under it were broken.
        flight.validate -= delta;
        if (flight.validate <= 0) {
            flight.validate = 1;
            if (!this.world.hasSolidBlock(Math.floor(flight.perch.x), Math.floor(flight.perch.y) - 1, Math.floor(flight.perch.z))) {
                this.owlTakeOff(mob, null, false);
                return;
            }
        }
        // Too close: off to another tree (sneaking gets closer, and a sleeping owl lets you).
        const crouching = this.cameraController.isCrouching;
        const shy = (night ? 3.2 : 1.8) * (crouching ? 0.5 : 1);
        if (!this.titleScreenOpen && flight.calm <= 0 && distance < shy) {
            this.owlTakeOff(mob, player, true);
            return;
        }
        // Asleep, it opens one eye to keep watch on whoever is near.
        flight.peek += ((flight.sleep > 0.5 && distance < 7 && !crouching ? 1 : 0) - flight.peek) * Math.min(1, delta * 1.5);

        if (flight.carrying) {
            flight.eatTimer -= delta;
            if (flight.eatTimer <= 0) this.owlSwallow(mob);
        }
        if (!night) return;

        // Hoots now and then (less in the rain) and answers other owls.
        const raining = this.weatherState === 'rain';
        flight.hootTimer -= delta;
        if (flight.answer > 0) {
            flight.answer -= delta;
            if (flight.answer <= 0) this.owlHoot(mob, true);
        } else if (flight.hootTimer <= 0) {
            flight.hootTimer = (10 + Math.random() * 20) * (raining ? 2.5 : 1);
            if (!flight.stalk) this.owlHoot(mob, false);
        }

        // Hunting: spot prey, stare it down with a bob of the head, then swoop.
        if (flight.stalk) {
            flight.stalkTimer -= delta;
            if (!this.owlPreyIsValid(mob, flight.stalk) || mob.position.distanceTo(flight.stalk.position) > 26) {
                flight.stalk = null;
            } else if (flight.stalkTimer <= 0) {
                this.owlStartSwoop(mob, flight.stalk);
                return;
            }
        } else if (!flight.carrying && flight.huntTimer <= 0) {
            flight.huntTimer = raining ? 1.6 : 0.8;
            const prey = this.owlFindPrey(mob);
            if (prey) {
                flight.stalk = prey;
                flight.stalkTimer = 1 + Math.random() * 1.2;
                flight.bob = 1;
            }
        }
        if (flight.timer <= 0 && !flight.carrying && !flight.stalk) this.owlTakeOff(mob, null, false);
    },

    owlPreyIsValid(mob, prey) {
        if (!prey || !prey.parent || prey.visible === false) return false;
        const other = prey.userData;
        if (other.species !== 'bat' && other.species !== 'rabbit') return false;
        if (other.hidden || other.burrowed || other.inBurrow || other.tamed || other.owner || other.rider) return false;
        if (other.species === 'bat' && (!other.flight || other.flight.mode === 'hang')) return false;
        if (other.owlTarget && other.owlTarget !== mob && other.owlTarget.parent) return false;
        return true;
    },

    // The nearest bat on the wing or rabbit in the open within reach, below or a little above.
    owlFindPrey(mob) {
        let best = null;
        let bestDistance = 22;
        for (const other of this.ambientMobs) {
            if (!this.owlPreyIsValid(mob, other)) continue;
            if (other.position.y > mob.position.y + 6) continue;
            const distance = mob.position.distanceTo(other.position);
            if (distance < bestDistance) {
                best = other;
                bestDistance = distance;
            }
        }
        return best;
    },

    owlStartSwoop(mob, prey) {
        const data = mob.userData;
        const flight = data.flight;
        flight.stalk = null;
        flight.prey = prey;
        prey.userData.owlTarget = mob;
        flight.mode = 'swoop';
        flight.timer = 7;
        flight.flapBoost = 0.5;
        data.facing = Math.atan2(prey.position.z - mob.position.z, prey.position.x - mob.position.x);
        data.velocity.set(Math.cos(data.facing) * 2, 0.8, Math.sin(data.facing) * 2);
        // A barely audible rush of air: owls fly silently.
        this.owlRustle(mob, 0.5);
    },

    // Silent and fast at the prey, aiming above it while far out so the last stretch is a
    // steep drop; the talons swing forward for the strike.
    owlUpdateSwoop(mob, delta) {
        const data = mob.userData;
        const flight = data.flight;
        const prey = flight.prey;
        if (!this.owlPreyIsValid(mob, prey) || flight.timer <= 0 || mob.position.distanceTo(prey.position) > 30) {
            this.owlEndHunt(mob, false);
            return;
        }
        _owlTarget.copy(prey.position);
        if (prey.userData.species === 'rabbit') _owlTarget.y += 0.25;
        const toPrey = _owlVector.subVectors(_owlTarget, mob.position);
        const distance = toPrey.length();
        if (distance < 0.75) {
            this.owlCatch(mob, prey);
            return;
        }
        const horizontal = Math.hypot(toPrey.x, toPrey.z);
        if (horizontal > 3) toPrey.y += Math.min(2.5, horizontal * 0.3);
        const speed = Math.min(8.5, 4.5 + (7 - flight.timer) * 3);
        toPrey.setLength(speed);
        data.velocity.lerp(toPrey, Math.min(1, delta * 3.5));
        this.owlSteer(mob, Math.atan2(data.velocity.z, data.velocity.x), 8, delta);
        this.owlMove(mob, delta);
    },

    owlEndHunt(mob, caught) {
        const flight = mob.userData.flight;
        if (flight.prey && flight.prey.userData.owlTarget === mob) flight.prey.userData.owlTarget = null;
        flight.prey = null;
        flight.huntTimer = caught ? 60 + Math.random() * 40 : 15 + Math.random() * 20;
        this.owlChoosePerch(mob);
        flight.mode = 'glide';
        flight.timer = 25;
        flight.flapBoost = 1.2;
    },

    // Predation: the prey is defeated by the owl and its model carried off in the talons.
    owlCatch(mob, prey) {
        const data = mob.userData;
        const flight = data.flight;
        const species = prey.userData.species;
        this.emitMobEvent('defeated', prey, 'owl');
        const root = prey.userData.modelRoot;
        if (root && root.parent === prey) prey.remove(root);
        this.removeMob(prey);
        if (root && data.modelRoot) {
            const small = species === 'bat';
            root.scale.setScalar(small ? 1 : 0.6);
            root.position.set(0, small ? -0.06 : -0.16, 0.04);
            root.rotation.set(0, 0, 0);
            root.traverse((node) => { node.userData.mobRoot = mob; });
            data.modelRoot.add(root);
            flight.carrying = root;
            flight.carryRoot = data.modelRoot;
            flight.carrySpecies = species;
            flight.eatTimer = 5 + Math.random() * 4;
        }
        const player = this.getLocalPlayerPosition();
        const loudness = Math.max(0, 1 - Math.hypot(player.x - mob.position.x, player.z - mob.position.z) / 24);
        if (loudness > 0) {
            this.playNoiseBurst({ duration: 0.12, volume: 0.025 * loudness, highpass: 200, lowpass: 1600 });
            this.playTone({ frequency: getMobSpecies(species) ? (getMobSpecies(species).tone || 800) : 800, endFrequency: 400, duration: 0.08, type: 'triangle', volume: 0.01 * loudness, release: 0.05 });
        }
        this.owlEndHunt(mob, true);
    },

    // Back on the perch it gulps the catch down whole.
    owlSwallow(mob) {
        const flight = mob.userData.flight;
        const root = flight.carrying;
        flight.carrying = null;
        flight.throat = 1;
        if (!root) return;
        if (root.parent) root.parent.remove(root);
        root.traverse((node) => {
            if (node.isMesh && node.userData.disposeGeometry) node.geometry.dispose();
            if (node.isMesh && node.material && node.userData.modelMap) node.material.dispose();
        });
        const player = this.getLocalPlayerPosition();
        const loudness = Math.max(0, 1 - Math.hypot(player.x - mob.position.x, player.z - mob.position.z) / 12);
        if (loudness > 0) this.playTone({ frequency: 140, endFrequency: 90, duration: 0.12, type: 'sine', volume: 0.02 * loudness, attack: 0.02, release: 0.06 });
    },

    owlTakeOff(mob, from, startled) {
        const data = mob.userData;
        const flight = data.flight;
        if (flight.stalk) flight.stalk = null;
        this.owlChoosePerch(mob, startled ? from : null);
        flight.mode = 'glide';
        flight.timer = 25;
        flight.failures = 0;
        flight.flee = startled;
        flight.flapBoost = startled ? 1.6 : 0.8;
        flight.sleep = Math.min(flight.sleep, 0.2);
        // Drop off the perch into the air, wings opening.
        data.facing = from && startled
            ? Math.atan2(mob.position.z - from.z, mob.position.x - from.x)
            : Math.atan2(flight.perch.z - mob.position.z, flight.perch.x - mob.position.x);
        data.velocity.set(Math.cos(data.facing) * 1.5, 1.6, Math.sin(data.facing) * 1.5);
        this.owlRustle(mob, startled ? 1 : 0.6);
        if (startled) this.owlScreech(mob);
    },

    // Glides to its perch: above the ground and the treetops while far, then a slow final
    // approach with the wings flared and the talons reaching forward.
    owlUpdateGlide(mob, delta) {
        const data = mob.userData;
        const flight = data.flight;
        const target = flight.perch;
        const position = mob.position;
        const dx = target.x - position.x;
        const dz = target.z - position.z;
        const horizontal = Math.hypot(dx, dz);
        const species = getMobSpecies('owl');
        let speed = species.speed * (flight.flee ? 1.4 : 1);
        let desiredY = target.y + (horizontal > 2.5 ? Math.min(3, 0.8 + horizontal * 0.15) : horizontal * 0.25);
        if (horizontal > 2.5) {
            const floor = this.cameraController.getFloorY(position.x, position.z, position.y + 1);
            if (floor > -20) desiredY = Math.max(desiredY, floor + 1.5);
        }
        if (horizontal < 1.2) {
            // Final approach: straight onto the perch.
            data.velocity.x = dx * 3;
            data.velocity.z = dz * 3;
            if (horizontal > 0.05) this.owlSteer(mob, Math.atan2(dz, dx), 4, delta);
        } else {
            speed = Math.min(speed, Math.max(1.2, horizontal * 1.1));
            this.owlSteer(mob, Math.atan2(dz, dx), horizontal < 5 ? 5 : 2.6, delta);
            data.velocity.x += (Math.cos(data.facing) * speed - data.velocity.x) * Math.min(1, delta * 2.5);
            data.velocity.z += (Math.sin(data.facing) * speed - data.velocity.z) * Math.min(1, delta * 2.5);
        }
        data.velocity.y += (THREE.MathUtils.clamp((desiredY - position.y) * 1.8, -3, 2.5) - data.velocity.y) * Math.min(1, delta * 3);
        this.owlMove(mob, delta);

        if (position.distanceTo(target) < 0.3 || (horizontal < 0.3 && Math.abs(position.y - target.y) < 0.4)) {
            this.owlLand(mob);
            return;
        }
        if (flight.timer <= 0) {
            // Stuck: try another perch, and in the end settle wherever it is.
            flight.failures += 1;
            flight.timer = 20;
            const ground = flight.failures > 2 ? this.owlGroundSpot(position.x, position.z, position.y + 1) : null;
            if (ground) flight.perch.copy(ground);
            else this.owlChoosePerch(mob);
        }
    },

    owlLand(mob) {
        const data = mob.userData;
        const flight = data.flight;
        mob.position.copy(flight.perch);
        data.velocity.set(0, 0, 0);
        flight.mode = 'perch';
        flight.timer = 25 + Math.random() * 45;
        flight.calm = 1.5;
        flight.failures = 0;
        flight.flee = false;
        flight.settle = 1;
        flight.validate = 1;
        if (flight.carrying) {
            // The catch lies under its talons while it eats.
            flight.carrying.position.y = 0.02;
            flight.carrying.rotation.set(flight.carrySpecies === 'bat' ? Math.PI / 2 : 0, 0, flight.carrySpecies === 'bat' ? 0 : Math.PI / 2);
        }
        this.owlRustle(mob, 0.4);
    },

    // Turns its heading towards `heading` at up to `rate` radians per second.
    owlSteer(mob, heading, rate, delta) {
        const data = mob.userData;
        let turn = heading - data.facing;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        const applied = THREE.MathUtils.clamp(turn, -rate * delta, rate * delta);
        data.facing += applied;
        data.flight.turnRate += (applied / Math.max(delta, 0.001) - data.flight.turnRate) * Math.min(1, delta * 3);
    },

    // Moves by velocity, pulling up instead of flying into terrain or water.
    owlMove(mob, delta) {
        const position = mob.position;
        const velocity = mob.userData.velocity;
        const nx = position.x + velocity.x * delta;
        const ny = position.y + velocity.y * delta;
        const nz = position.z + velocity.z * delta;
        const bx = Math.floor(nx);
        const by = Math.floor(ny + 0.3);
        const bz = Math.floor(nz);
        if (this.world.hasSolidBlock(bx, by, bz) || this.world.getBlockTypeAt(bx, by, bz) === 'water') {
            position.y += 3 * delta;
            velocity.y = Math.max(velocity.y, 1);
            mob.userData.flight.flapBoost = Math.max(mob.userData.flight.flapBoost, 0.4);
            return;
        }
        position.set(nx, ny, nz);
    },

    // Struck: a screech and off to another tree; enough blows defeat it.
    owlStruck(mob) {
        const data = mob.userData;
        if (!mob.parent) return;
        if (!data.flight) this.owlInit(mob);
        const flight = data.flight;
        data.health -= 4;
        this.updateMobHealthBar(mob);
        this.playNoiseBurst({ duration: 0.1, volume: 0.025, highpass: 500, lowpass: 3000 });
        if (data.health <= 0) {
            this.owlScreech(mob);
            this.emitMobEvent('defeated', mob, 'player');
            this.removeMob(mob);
            this.receiveSystemMessage({ text: 'You defeated the owl' });
            return;
        }
        if (flight.carrying) this.owlSwallow(mob);
        if (flight.prey && flight.prey.userData.owlTarget === mob) flight.prey.userData.owlTarget = null;
        flight.prey = null;
        flight.stalk = null;
        flight.huntTimer = 20;
        this.owlTakeOff(mob, this.camera.position, true);
    },

    // "Hoo... hoo-hoo-hoooo" or a two-tone "hoo-hoo"; other owls within earshot answer.
    owlHoot(mob, answer) {
        const data = mob.userData;
        const flight = data.flight;
        const tone = getMobSpecies('owl').tone * [0.92, 1, 1.1][data.variant % 3];
        const patterns = [
            [[0, 1, 0.38], [0.85, 1.06, 0.14], [1.05, 1.06, 0.14], [1.27, 0.94, 0.6]],
            [[0, 1.05, 0.3], [0.48, 0.86, 0.5]]
        ];
        const pattern = patterns[answer ? 1 : Math.random() < 0.5 ? 0 : 1];
        pattern.forEach(([at, pitch, duration]) => flight.notes.push({ at, frequency: tone * pitch, duration }));
        if (answer) return;
        this.ambientMobs.forEach((other) => {
            if (other === mob || other.userData.species !== 'owl' || !other.userData.flight) return;
            if (other.position.distanceTo(mob.position) > 40 || other.userData.flight.answer > 0) return;
            if (other.userData.flight.sleep < 0.5) other.userData.flight.answer = 2 + Math.random() * 2.5;
        });
    },

    // Plays the queued hoot notes, each with a puff of the throat.
    owlUpdateCalls(mob, delta) {
        const flight = mob.userData.flight;
        flight.throat = Math.max(0, flight.throat - delta * 2.5);
        if (flight.notes.length === 0) return;
        const player = this.getLocalPlayerPosition();
        const distance = Math.hypot(player.x - mob.position.x, player.y - mob.position.y, player.z - mob.position.z);
        const loudness = Math.max(0, 1 - distance / 48);
        flight.notes = flight.notes.filter((note) => {
            note.at -= delta;
            if (note.at > 0) return true;
            flight.throat = 1;
            if (loudness > 0.01) {
                this.playTone({ frequency: note.frequency, endFrequency: note.frequency * 0.9, duration: note.duration, type: 'sine', volume: 0.035 * loudness, attack: 0.05, release: 0.18 });
                this.playTone({ frequency: note.frequency * 0.5, endFrequency: note.frequency * 0.46, duration: note.duration, type: 'triangle', volume: 0.012 * loudness, attack: 0.06, release: 0.2, detune: 6 });
            }
            return false;
        });
    },

    owlScreech(mob) {
        const player = this.getLocalPlayerPosition();
        const loudness = Math.max(0, 1 - Math.hypot(player.x - mob.position.x, player.z - mob.position.z) / 32);
        if (loudness <= 0) return;
        const tone = getMobSpecies('owl').tone * 4;
        this.playTone({ frequency: tone, endFrequency: tone * 0.6, duration: 0.4, type: 'sawtooth', volume: 0.012 * loudness, attack: 0.02, release: 0.12 });
        this.playNoiseBurst({ duration: 0.18, volume: 0.015 * loudness, highpass: 1500, lowpass: 6000 });
    },

    // A soft rustle of feathers: owls fly almost without a sound.
    owlRustle(mob, strength) {
        const player = this.getLocalPlayerPosition();
        const loudness = Math.max(0, 1 - Math.hypot(player.x - mob.position.x, player.z - mob.position.z) / 10);
        if (loudness > 0) this.playNoiseBurst({ duration: 0.18, volume: 0.008 * strength * loudness, highpass: 200, lowpass: 900 });
    },

    // Where a world point is from the owl's head: yaw relative to its body and pitch.
    owlLookAngles(mob, x, y, z) {
        const yaw = Math.atan2(x - mob.position.x, z - mob.position.z) - mob.rotation.y;
        const horizontal = Math.hypot(x - mob.position.x, z - mob.position.z);
        return {
            yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)),
            pitch: -Math.atan2(y - (mob.position.y + OWL_EYE_HEIGHT), Math.max(horizontal, 0.1))
        };
    },

    owlPose(mob, delta, player) {
        const data = mob.userData;
        const flight = data.flight;
        const parts = data.modelParts;
        const flying = flight.mode !== 'perch';
        const blend = Math.min(1, delta * 5);
        flight.perched += ((flying ? 0 : 1) - flight.perched) * blend;
        const folded = flight.perched;
        const spread = 1 - folded;
        const velocity = data.velocity;
        const horizontal = Math.hypot(velocity.x, velocity.z);
        const landing = flight.mode === 'glide' && mob.position.distanceTo(flight.perch) < 1.6;
        const striking = flight.mode === 'swoop' && flight.prey && mob.position.distanceTo(flight.prey.position) < 2.5;
        const night = this.isNightTime();
        const sleep = flight.sleep;
        flight.settle = Math.max(0, flight.settle - delta * 2);

        // Body: leaning forward in flight, upright for the landing and the strike, rocking as it
        // settles on the perch.
        mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.PI / 2 - data.facing, Math.min(1, delta * (flying ? 8 : 6)));
        let pitch = Math.sin(flight.settle * Math.PI * 2) * 0.2 * flight.settle;
        let roll = 0;
        if (flying) {
            pitch = landing || striking ? 0.3 : THREE.MathUtils.clamp(0.95 + Math.atan2(-velocity.y, Math.max(horizontal, 0.5)) * 0.5, 0.45, 1.4);
            roll = THREE.MathUtils.clamp(flight.turnRate * 0.35, -0.6, 0.6);
        }
        mob.rotation.x += (pitch - mob.rotation.x) * blend;
        mob.rotation.z += (roll - mob.rotation.z) * blend;

        // Puffed up asleep, breathing; the throat swells as it hoots.
        const breath = Math.sin(data.life * (sleep > 0.5 ? 1.3 : 2)) * 0.015;
        parts.body.scale.set(1 + sleep * 0.1 + flight.throat * 0.04, 1 + sleep * 0.03 + breath, 1 + sleep * 0.1 + flight.throat * 0.06);
        data.modelRoot.position.y = flying ? 0 : Math.max(0, Math.sin(flight.settle * Math.PI)) * 0.06;

        // Wings: beating to take off, climb, brake and strike; otherwise a silent glide.
        // Folded at the sides when perched, with a stretch of one wing now and then.
        const flapping = flying && (flight.flapBoost > 0 || velocity.y > 0.6 || landing || striking);
        flight.flap = THREE.MathUtils.clamp(flight.flap + (flapping ? 1 : -1) * delta * 3, 0, 1);
        flight.wingPhase += delta * 11 * flight.flap;
        const beat = Math.sin(flight.wingPhase) * 0.75 * flight.flap;
        const lag = Math.sin(flight.wingPhase - 0.9) * 0.5 * flight.flap;
        if (!flying && night && sleep < 0.3 && flight.stretch <= 0 && Math.random() < delta * 0.03) {
            flight.stretch = 1;
            flight.stretchSide = Math.random() < 0.5 ? 1 : -1;
        }
        flight.stretch = Math.max(0, flight.stretch - delta * 0.6);
        ['L', 'R'].forEach((side) => {
            const sign = side === 'L' ? 1 : -1;
            const stretch = flight.stretchSide === sign ? Math.sin(flight.stretch * Math.PI) : 0;
            const open = spread * (Math.PI / 2 - 0.06 + beat + (landing ? 0.35 : 0)) + folded * (0.05 + sleep * 0.08 + stretch * 0.9);
            // Spread, the wings stay level however far the body leans into the glide.
            parts[`wing${side}`].rotation.set(-mob.rotation.x * spread - (landing ? 0.35 * spread : 0), 0, sign * open);
            parts[`wingTip${side}`].rotation.set(0, 0, sign * (Math.PI * folded * (1 - stretch * 0.8) + spread * lag * 0.6));
            // Talons tucked back in flight, thrust forward for the strike and the landing.
            const reach = flying ? (striking || landing ? -1.3 : 1.25) : 0;
            const leg = parts[`leg${side}`];
            leg.rotation.x += (reach - leg.rotation.x) * Math.min(1, delta * 8);
        });
        parts.tail.rotation.x = flying ? -mob.rotation.x * 0.9 : parts.tail.userData.baseRotation.x + Math.sin(data.life * 0.7) * 0.04;
        parts.tail.scale.x = 1 + spread * 0.35;
        if (flight.carrying && flying) flight.carrying.rotation.z = Math.sin(data.life * 6) * 0.2;

        this.owlPoseHead(mob, delta, player, pitch);
        this.owlPoseEyes(mob, delta);
    },

    // The signature head: it holds still, then snaps to where it wants to look. It follows the
    // player at night (up to 135 degrees each way, whipping across the front when they pass
    // behind, and shuffling round if they stay there), stares down prey, bobs and tilts.
    owlPoseHead(mob, delta, player, bodyPitch) {
        const data = mob.userData;
        const flight = data.flight;
        const head = data.modelParts.head;
        const flying = flight.mode !== 'perch';
        const sleep = flight.sleep;
        let yaw = 0;
        let pitch = 0;
        let tracking = false;

        const playerDistance = Math.hypot(player.x - mob.position.x, player.z - mob.position.z);
        const target = flight.stalk || flight.prey;
        if (flying) {
            if (target) {
                const look = this.owlLookAngles(mob, target.position.x, target.position.y, target.position.z);
                yaw = THREE.MathUtils.clamp(look.yaw, -1, 1);
            } else {
                yaw = THREE.MathUtils.clamp(flight.turnRate * 0.3, -0.5, 0.5);
            }
            pitch = -bodyPitch * 0.85;
        } else if (target) {
            const look = this.owlLookAngles(mob, target.position.x, target.position.y, target.position.z);
            yaw = look.yaw;
            pitch = look.pitch;
            tracking = true;
        } else if (flight.carrying) {
            // Tearing at the catch.
            yaw = Math.sin(data.life * 0.8) * 0.3;
            pitch = 0.75 + Math.max(0, Math.sin(data.life * 5)) * 0.35;
        } else if (!this.titleScreenOpen && playerDistance < 30 && (sleep < 0.5 || flight.peek > 0.5)) {
            const look = this.owlLookAngles(mob, player.x, player.y, player.z);
            yaw = look.yaw;
            pitch = look.pitch;
            tracking = true;
        } else {
            flight.lookTimer -= delta;
            if (flight.lookTimer <= 0) {
                flight.lookTimer = 1 + Math.random() * 3;
                flight.lookYaw = sleep > 0.5 ? (Math.random() - 0.5) * 0.4 : (Math.random() - 0.5) * 2 * OWL_HEAD_LIMIT;
            }
            yaw = flight.lookYaw;
            pitch = sleep > 0.5 ? 0.3 : 0.1;
        }
        if (sleep > 0.5 && flight.peek < 0.5 && !flying) {
            yaw *= 0.2;
            pitch = 0.3;
        }

        // Past the limit, it holds its head turned as far as it goes on the side it is on;
        // if the player stays behind it, it shuffles round on the perch to face them.
        if (Math.abs(yaw) > OWL_HEAD_LIMIT) {
            yaw = flight.headYaw >= 0 ? OWL_HEAD_LIMIT : -OWL_HEAD_LIMIT;
            if (tracking) flight.behind += delta;
        } else {
            flight.behind = Math.max(0, flight.behind - delta);
        }
        if (!flying && flight.behind > 1.5 && sleep < 0.5) {
            flight.behind = 0;
            data.facing = Math.atan2(player.z - mob.position.z, player.x - mob.position.x) + (Math.random() - 0.5) * 0.8;
            flight.settle = 0.6;
        }

        // Saccades: a new goal only once the target has drifted, then a quick snap to it.
        if (flying || Math.abs(yaw - flight.headGoal) > 0.25) flight.headGoal = yaw;
        const diff = flight.headGoal - flight.headYaw;
        flight.headYaw += diff * Math.min(1, delta * (Math.abs(diff) > 1.5 ? 10 : 14));
        flight.headPitch += (THREE.MathUtils.clamp(pitch, -0.9, 0.9) - flight.headPitch) * Math.min(1, delta * 8);

        // A curious tilt now and then while watching, and a bob to judge the distance.
        flight.tiltTimer -= delta;
        if (flight.tiltTimer <= 0) {
            flight.tiltTimer = 2 + Math.random() * 5;
            flight.tilt = tracking && !flying && Math.random() < 0.6 ? (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.25) : 0;
            if (tracking && !flying && Math.random() < 0.3) flight.bob = 1;
        }
        flight.headRoll += ((flying ? 0 : flight.tilt) - flight.headRoll) * Math.min(1, delta * 6);
        flight.bob = Math.max(0, flight.bob - delta * 0.7);
        const bob = Math.sin(flight.bob * Math.PI) * Math.min(1, flight.bob * 3);
        const base = data.owlHeadBase;
        head.position.set(
            base.x + Math.sin(data.life * 7) * 0.025 * bob,
            base.y - sleep * 0.05 + Math.sin(data.life * 9) * 0.035 * bob - flight.throat * 0.01,
            base.z + Math.cos(data.life * 9) * 0.03 * bob
        );
        head.rotation.set(flight.headPitch, flight.headYaw, flight.headRoll);
    },

    // Lids shut as it sleeps (one opens to peek) and blink now and then; the eyes glow
    // faintly at night, bright enough in Ultra to bloom, and the pupils widen in the dark.
    owlPoseEyes(mob, delta) {
        const data = mob.userData;
        const flight = data.flight;
        const parts = data.modelParts;
        const night = this.isNightTime();
        flight.blinkTimer -= delta;
        if (flight.blinkTimer <= 0) {
            flight.blinkTimer = 2.5 + Math.random() * 6;
            flight.blink = 1;
        }
        flight.blink = Math.max(0, flight.blink - delta * 5);
        const blink = Math.sin(flight.blink * Math.PI);
        const closed = Math.max(flight.sleep, blink);
        ['L', 'R'].forEach((side, index) => {
            const peek = index === 0 ? flight.peek * 0.75 : flight.peek * 0.15;
            const amount = Math.min(1, Math.max(blink, closed - peek));
            parts[`lid${side}`].scale.y = 0.12 + 0.88 * amount;
        });
        const awake = 1 - flight.sleep;
        const boost = this.ultraModeEnabled && night ? 2.6 : 1;
        const glow = (night ? 1 + Math.sin(data.life * 1.7) * 0.08 : 0.8) * (0.5 + 0.5 * awake) * boost;
        const iris = OWL_IRIS[data.variant % OWL_IRIS.length];
        data.owlIris.color.setHex(iris).multiplyScalar(glow);
        data.owlGlint.color.setRGB(1, 1, 1).multiplyScalar(night && this.ultraModeEnabled ? 1.6 : 1);
        const pupil = night ? 1.35 : 0.85;
        data.owlPupils.forEach((mesh) => mesh.scale.set(pupil, pupil, 1));
    }
});
