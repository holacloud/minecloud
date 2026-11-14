// Kubanochoerus: an extinct animal (js/mobSpecies.js) and an ancient relative of the pig, found as a rare
// fossil in the deep rock and brought back by the revival machine. A pig as tall as a cow, with a horn on
// its forehead and a small one over each eye. It grazes, roots and walks as any ground mob
// (js/game/mobs.js), so the server walks a kept one (js/game/animals.js). What is its own is what it does
// when struck: it turns on whoever hit it, lowers its head, paws the ground and charges, and the horn
// hurts. Only the player who struck it sees the charge: mobs fight in each browser.

// The charge, in seconds and blocks: how long it aims (time to step aside), how long and how fast it then
// runs, how near its middle the player has to be for the horn to reach, what it takes, and how long it
// stands still afterwards. It never runs further from its home than `leash`: the server keeps one inside a
// circle, and every other player's copy of it is still there.
const KUBANOCHOERUS = { aim: 0.7, run: 0.55, pace: 6, reach: 1.9, tall: 1.6, damage: 3, shove: 7, rest: 0.9, leash: 12 };

// Faces +z. The pig of js/models.js grown to the size of a cow and pushed back to what it was: long legs,
// high shoulders with a crest of bristles, a long head carried low, and the horns.
function kubanochoerusModel(b) {
    const hide = 0x6f5b49;
    const dark = 0x3e3128;
    const belly = 0x9c8669;
    const snoutPink = 0xb48f86;
    const horn = 0xd8cdb2;
    const hidePaint = { color: hide, noise: 0.08, all: (p, face) => {
        if (face === 'bottom') { p.fill(belly, 0.06); return; }
        if (face === 'top') { p.rect(p.w / 2 - 1.5, 0, 3, p.h, dark, 0.08); return; }
        p.rect(0, p.h - 2.5, p.w, 2.5, belly, 0.07);
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-5.5, 9, -10], size: [11, 10, 18], paint: hidePaint });
    // The shoulders, higher than the rump, with the bristles standing along them.
    b.part('shoulders', { parent: 'body', pivot: [0, 19, 3.5], from: [-4.5, -0.5, -4.5], size: [9, 2, 9], paint: { color: hide, noise: 0.08, faces: { top: (p) => p.rect(p.w / 2 - 1.5, 0, 3, p.h, dark, 0.08) } } });
    b.part('crest', { parent: 'shoulders', pivot: [0, 1.5, 0], from: [-0.75, 0, -5.5], size: [1.5, 1.5, 10], paint: { color: dark, noise: 0.12 } });

    b.part('head', {
        parent: 'body', pivot: [0, 16, 8], from: [-4, -6, -1], size: [8, 8, 9], rotation: [0.22, 0, 0],
        paint: {
            color: hide, noise: 0.07,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(belly, 0.06); return; }
                if (face === 'top') { p.rect(p.w / 2 - 1, 0, 2, p.h, dark, 0.07); return; }
                if (face !== 'left' && face !== 'right') return;
                // A small eye under its horn, and the cheek paler below it.
                const eye = face === 'left' ? p.w - 4.5 : 3.5;
                p.rect(eye - 0.5, 1.5, 2, 1.5, dark, 0.04);
                p.rect(eye, 2, 1, 1, 0x100c0a, 0);
                p.rect(eye + (face === 'left' ? 0.5 : 0), 2, 0.5, 0.5, 0xffffff, 0);
                p.rect(0, p.h - 2, p.w, 2, belly, 0.06);
            }
        }
    });
    b.part('snout', {
        parent: 'head', pivot: [0, -3, 8], from: [-2.75, -2.5, 0], size: [5.5, 5, 5],
        paint: { color: hide, noise: 0.06, all: (p, face) => {
            if (face === 'bottom') { p.fill(belly, 0.05); return; }
            if (face !== 'front') return;
            p.fill(snoutPink, 0.04);
            p.rect(1, 1.75, 1.25, 1.5, 0x5a3a36, 0);
            p.rect(3.25, 1.75, 1.25, 1.5, 0x5a3a36, 0);
        } }
    });
    const hornPaint = { color: horn, noise: 0.04, surface: 'smooth', all: (p, face) => { if (face !== 'top' && face !== 'bottom') p.rect(0, p.h - 1, p.w, 1, 0xa39676, 0.04); } };
    // The horn of the forehead, leaning forward, and the two small ones over the eyes.
    b.part('horn', { parent: 'head', pivot: [0, 1.5, 4.75], from: [-1.25, 0, -1.25], size: [2.5, 4, 2.5], paint: hornPaint, rotation: [0.6, 0, 0] });
    b.part('hornTip', { parent: 'horn', pivot: [0, 4, 0], from: [-0.75, 0, -0.75], size: [1.5, 3, 1.5], paint: { color: horn, noise: 0.04, surface: 'smooth' } });
    b.part('browL', { parent: 'head', pivot: [3.1, 1.75, 3], from: [-0.6, 0, -0.6], size: [1.2, 1.6, 1.2], paint: hornPaint, rotation: [0.3, 0, -0.3] });
    b.part('browR', { parent: 'head', pivot: [-3.1, 1.75, 3], from: [-0.6, 0, -0.6], size: [1.2, 1.6, 1.2], paint: hornPaint, rotation: [0.3, 0, 0.3] });
    b.part('tuskL', { parent: 'snout', pivot: [2.75, -1.5, 3], from: [-0.25, 0, -0.5], size: [0.75, 2.25, 1], paint: { color: 0xf0e8d2, noise: 0.03, surface: 'smooth' }, rotation: [0, 0, -0.35] });
    b.part('tuskR', { parent: 'snout', pivot: [-2.75, -1.5, 3], from: [-0.5, 0, -0.5], size: [0.75, 2.25, 1], paint: { color: 0xf0e8d2, noise: 0.03, surface: 'smooth' }, rotation: [0, 0, 0.35] });
    const earPaint = { color: hide, noise: 0.06, faces: { front: (p) => p.rect(0.5, 0.5, p.w - 1, p.h - 0.5, snoutPink, 0.04) } };
    b.part('earL', { parent: 'head', pivot: [3.75, 1, 0], from: [-1, 0, -0.5], size: [2.5, 2.75, 1], paint: earPaint, rotation: [-0.2, 0, -0.75] });
    b.part('earR', { parent: 'head', pivot: [-3.75, 1, 0], from: [-1.5, 0, -0.5], size: [2.5, 2.75, 1], paint: earPaint, rotation: [-0.2, 0, 0.75] });

    b.part('tail', { parent: 'body', pivot: [0, 18, -10], from: [-0.5, -6, -0.5], size: [1, 6, 1], paint: { color: hide, noise: 0.06 }, rotation: [0.3, 0, 0] });
    b.part('tailTuft', { parent: 'tail', pivot: [0, -6, 0], from: [-0.75, -2, -0.75], size: [1.5, 2, 1.5], paint: { color: dark, noise: 0.1 } });
    const legs = VoxelModels.quadLegs(b, {
        size: [3.5, 9.5, 3.5], hipY: 9.5, x: 3.5, zFront: 5, zBack: -7.5,
        paint: { color: hide, noise: 0.07, all: (p, face) => {
            if (face === 'bottom') { p.fill(0x231c17, 0.03); return; }
            if (face !== 'top') { p.rect(0, p.h - 4, p.w, 2.5, dark, 0.07); p.rect(0, p.h - 1.5, p.w, 1.5, 0x231c17, 0.03); }
        } }
    });
    return { legs, head: 'head', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('kubanochoerus', {
    info: { eggColor: 0x6f5b49, tone: 120, maxHealth: 24, speed: 0.36, grazer: true, hiddenUntilDiscovered: true, ancestorOf: 'pig' },
    model: kubanochoerusModel,
    surface: 'skin',
    drops: [['leather', 2, 4]],
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Kubanochoerus', habitat: 'Plains and forests of Asia, about 15 million years ago', activity: 'Day', temperament: 'Neutral',
        description: 'A giant pig as tall as a cow, with a horn on its forehead. It roots in the ground and minds its own business, but if you hit it, it lowers its head and charges.'
    },
    cardEs: {
        name: 'Kubanochoerus', habitat: 'Llanuras y bosques de Asia, hace unos 15 millones de años',
        description: 'Un cerdo gigante tan alto como una vaca, con un cuerno en la frente. Hoza en el suelo y va a lo suyo, pero si le pegas, agacha la cabeza y embiste.'
    }
});

// A blow that did not finish it: it turns on the player.
onMobEvent('damaged', function (mob) {
    if (mob.userData.species === 'kubanochoerus') this.kubanochoerusProvoke(mob);
});

// While it is at it, where it goes is its own business: asked before the server's walk and every other goal.
registerMobGoalFirst(function (mob) {
    return mob.userData.kubanochoerusCharge ? this.kubanochoerusGoal(mob) : null;
});

// Only the ones that are charging: an empty list, nearly always.
registerFrameUpdate(function (delta) {
    this.kubanochoerusUpdate(delta);
});

Object.assign(Game.prototype, {
    kubanochoerusProvoke(mob) {
        const data = mob.userData;
        if (data.health <= 0 || data.kubanochoerusCharge) return;
        data.kubanochoerusCharge = { phase: 'aim', timer: KUBANOCHOERUS.aim, heading: 0, goal: new THREE.Vector3() };
        (this.kubanochoerusAngry || (this.kubanochoerusAngry = [])).push(mob);
        // A snort, as a warning.
        const tone = getMobSpecies('kubanochoerus').tone;
        this.playTone({ frequency: tone, endFrequency: tone * 0.7, duration: 0.3, type: 'sawtooth', volume: 0.02, attack: 0.02, release: 0.12 });
        this.playNoiseBurst({ duration: 0.28, volume: 0.03, highpass: 180, lowpass: 1100 });
    },

    // Where it "goes" while it is angry: nowhere. The goal is a point it has always reached (the ground mobs
    // of js/game/mobs.js stand still within stopDistance and face their goal): the player while it aims,
    // and straight ahead once it runs, since kubanochoerusUpdate is what moves it then.
    kubanochoerusGoal(mob) {
        const charge = mob.userData.kubanochoerusCharge;
        const goal = charge.goal;
        if (charge.phase === 'aim') {
            const player = this.getLocalPlayerPosition();
            goal.set(player.x, mob.position.y, player.z);
        } else {
            goal.set(mob.position.x + Math.cos(charge.heading) * 4, mob.position.y, mob.position.z + Math.sin(charge.heading) * 4);
        }
        goal.stopDistance = Infinity;
        return goal;
    },

    kubanochoerusUpdate(delta) {
        const angry = this.kubanochoerusAngry;
        if (!angry || angry.length === 0) return;
        for (let i = angry.length - 1; i >= 0; i--) {
            const mob = angry[i];
            if (mob.parent && this.kubanochoerusCharging(mob, delta)) continue;
            mob.userData.kubanochoerusCharge = null;
            angry.splice(i, 1);
        }
    },

    // One frame of its anger: it aims, runs and rests. Returns whether it is still at it.
    kubanochoerusCharging(mob, delta) {
        const data = mob.userData;
        const charge = data.kubanochoerusCharge;
        if (!charge || this.titleScreenOpen || this.respawnPending) return false;
        const player = this.getLocalPlayerPosition();
        const dx = player.x - mob.position.x;
        const dz = player.z - mob.position.z;
        charge.timer -= delta;
        if (charge.phase === 'rest') return charge.timer > 0;

        // Head down, horn first: the rig (animateMobRig) is told, and hurried.
        data.lookTimer = 0.2;
        data.lookYaw = 0;
        data.lookPitch = 0.8;
        if (data.head) data.head.rotation.x += (data.head.userData.baseRotation.x + 0.8 - data.head.rotation.x) * Math.min(1, delta * 10);
        if (charge.phase === 'aim') {
            // It paws the ground with a front leg.
            const leg = data.legs[0];
            if (leg) leg.rotation.x = leg.userData.baseRotation.x - 0.3 + Math.sin(charge.timer * 22) * 0.45;
            if (charge.timer <= 0) {
                charge.phase = 'run';
                charge.timer = KUBANOCHOERUS.run;
                // Straight at where the player is now: whoever steps aside in time is missed.
                charge.heading = Math.atan2(dz, dx);
            }
            return true;
        }

        // Running: its legs go (the rig reads the gait and the step on the next frame).
        data.gait = 1;
        data.stepPhase += delta * 24;
        const moved = this.kubanochoerusStep(mob, charge.heading, KUBANOCHOERUS.pace * delta);
        const feetGap = Math.abs(player.y - (this.cameraController.eyeHeight || 1.62) - mob.position.y);
        if (Math.hypot(dx, dz) <= KUBANOCHOERUS.reach && feetGap <= KUBANOCHOERUS.tall) {
            this.cameraController.applyKnockback(Math.cos(charge.heading), Math.sin(charge.heading), KUBANOCHOERUS.shove, 4);
            this.applyDamage(KUBANOCHOERUS.damage, 'You were butted by a kubanochoerus', 'mob', mob.position);
            this.playNoiseBurst({ duration: 0.09, volume: 0.05, highpass: 90, lowpass: 700 });
            this.playTone({ frequency: 90, endFrequency: 55, duration: 0.12, type: 'square', volume: 0.03, release: 0.08 });
        } else if (moved && charge.timer > 0) {
            return true;
        }
        charge.phase = 'rest';
        charge.timer = KUBANOCHOERUS.rest;
        data.lookPitch = 0;
        return true;
    },

    // One step of the charge along `heading`: up one block at most, never off a drop, through a fence or
    // out of the reach of its home. Returns whether it took it.
    kubanochoerusStep(mob, heading, distance) {
        const position = mob.position;
        const home = mob.userData.home;
        const x = position.x + Math.cos(heading) * distance;
        const z = position.z + Math.sin(heading) * distance;
        const away = Math.hypot(x - home.x, z - home.z);
        if (away > KUBANOCHOERUS.leash && away > Math.hypot(position.x - home.x, position.z - home.z)) return false;
        const controller = this.cameraController;
        const floor = controller.getFloorY(x, z, position.y + 1);
        // A whisker ahead has to be walkable too: a fence is thinner than a step (as in js/game/mobs.js).
        const ahead = controller.getFloorY(x + Math.cos(heading) * 0.5, z + Math.sin(heading) * 0.5, position.y + 1);
        if (floor <= -20 || floor - position.y > 1.01 || position.y - floor > 1.5 || ahead - position.y > 1.01) return false;
        position.set(x, floor, z);
        return true;
    }
});
