// The Cuban giant owl: an extinct animal (js/mobSpecies.js) and an ancient relative of the owl, found as a
// rare fossil in the deep rock and brought back by the revival machine. The biggest owl there has been:
// over a metre tall, on legs so long and strong that it ran its prey down, with wings too small to do
// much more than flutter. It walks as any ground mob (js/game/mobs.js), so the server walks a kept one
// (js/game/animals.js), and it starts nothing. What is its own is what it does when struck: it turns on
// whoever hit it, spreads its wings to look bigger, and kicks whoever is still within reach a moment
// later, throwing them back. Only the player who struck it sees that: mobs fight in each browser.

// The warning, in seconds and blocks: how long it stands with its wings spread (time to step back), how
// near its middle the player has to be then for the kick to reach and how much higher or lower, what the
// kick takes and how hard it throws, how long it stands still afterwards, and how far its wings open and
// its leg comes up (radians).
const GIANT_OWL = { warn: 0.5, reach: 2, tall: 1.6, damage: 2, shove: 4, rest: 1, wings: 1.1, kick: 1.1 };

// Faces +z. The owl of js/game/owl.js stood on long legs: the same round body and broad flat face, with its
// eyes painted on (they do not light up) and no ear tufts, small wings, and legs as long as its body,
// feathered at the top and bare below, ending in big talons. Every size is a number of quarters of a unit:
// a texel is half a unit, and a smaller box is not painted.
function giantOwlModel(b) {
    const back = 0x7a5434;
    const bar = 0x46301e;
    const belly = 0xcaa477;
    const bellyBar = 0x6c4629;
    const disc = 0xbb8b5d;
    const rim = 0x3a2618;
    const foot = 0xb39055;
    const bars = (p, color, step) => {
        for (let y = 0.75; y < p.h - 0.25; y += step) for (let x = (y * 2) % 1.5; x < p.w - 0.5; x += 1.5) p.rect(x, y, 0.75, 0.5, color, 0.04);
    };
    b.part('body', {
        pivot: [0, 0, 0], from: [-3.5, 5.5, -3], size: [7, 7, 6],
        paint: { color: back, noise: 0.07, all: (p, face) => {
            if (face === 'front') { p.rect(0.5, 0, p.w - 1, p.h, belly, 0.05); bars(p, bellyBar, 1.25); return; }
            if (face === 'bottom') { p.fill(belly, 0.05); return; }
            p.spots(bar, 12, 0.5, 1.25);
        } }
    });
    b.part('head', {
        parent: 'body', pivot: [0, 12, 0.25], from: [-3.75, 0, -3.25], size: [7.5, 5.5, 6.5],
        paint: { color: back, noise: 0.06, all: (p, face) => {
            if (face !== 'front') {
                if (face !== 'bottom') p.spots(bar, 8, 0.5, 1);
                return;
            }
            // The flat face of an owl: a pale disc in a dark rim, a "V" of brows, and two big eyes.
            p.rect(0, 0.5, p.w, p.h - 0.5, rim, 0.03);
            p.rect(0.5, 1, p.w - 1, p.h - 1.5, disc, 0.04);
            p.rect(1, 0.5, 2, 0.5, belly, 0);
            p.rect(4.5, 0.5, 2, 0.5, belly, 0);
            p.rect(3.25, 1, 1, 1.5, belly, 0);
            for (const x of [1, 4.5]) {
                p.rect(x, 1.5, 2, 2, 0xe8a224, 0);
                p.rect(x + 0.5, 2, 1, 1, 0x100c0a, 0);
                p.rect(x + 0.5, 2, 0.5, 0.5, 0xffffff, 0);
            }
        } }
    });
    b.part('beak', { parent: 'head', pivot: [0, 2.5, 3.25], from: [-0.5, -1.5, 0], size: [1, 1.5, 0.75], paint: { color: 0x2c241d, noise: 0.03, surface: 'smooth' }, rotation: [0.15, 0, 0] });
    const wingPaint = { color: back, noise: 0.07, all: (p, face) => { if (face !== 'top' && face !== 'bottom') bars(p, bar, 1.25); } };
    b.part('wingL', { parent: 'body', pivot: [3.5, 12, 0.25], from: [0, -6, -2.75], size: [1, 6, 5.25], paint: wingPaint });
    b.part('wingR', { parent: 'body', pivot: [-3.5, 12, 0.25], from: [-1, -6, -2.75], size: [1, 6, 5.25], paint: wingPaint });
    b.part('tail', { parent: 'body', pivot: [0, 6.5, -3], from: [-1.75, -0.5, -2.5], size: [3.5, 1, 2.5], rotation: [-0.5, 0, 0], paint: { color: back, noise: 0.07, all: (p) => p.spots(bar, 3, 0.5, 1) } });
    // Legs as long as its body: feathers down to the knee, bare skin from there to the talons.
    const legPaint = { color: foot, noise: 0.05, surface: 'skin', all: (p, face) => { if (face !== 'top' && face !== 'bottom') { p.rect(0, 0, p.w, 2.5, belly, 0.07); p.rect(0, 2.5, p.w, 0.5, bellyBar, 0.05); } } };
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`leg${side}`, { parent: 'body', pivot: [1.75 * sign, 5.5, 0.25], from: [-1, -5.5, -1], size: [2, 5.5, 2], paint: legPaint });
        b.part(`talons${side}`, { parent: `leg${side}`, pivot: [0, -5.5, 0], from: [-1.5, 0, -1.5], size: [3, 0.75, 4], paint: { color: 0x1c1612, noise: 0.03, faces: { top: (p) => p.rect(0, 0, p.w, p.h - 1, foot, 0.05) } } });
    });
    return { legs: ['legL', 'legR'], wings: ['wingL', 'wingR'], head: 'head', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('giant_owl', {
    info: { eggColor: 0x7a5434, tone: 300, maxHealth: 16, speed: 0.6, hiddenUntilDiscovered: true, ancestorOf: 'owl' },
    model: giantOwlModel,
    surface: 'feather',
    drops: [['feather', 1, 3]],
    sheds: ['feather', 0.4, 8],
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Cuban giant owl', habitat: 'Forests of the island of Cuba, until about 10,000 years ago', activity: 'Night', temperament: 'Neutral',
        description: 'The biggest owl there has ever been: over 1 metre tall, on long strong legs. It could hardly fly, so it ran after its prey. It minds its own business, but if you hit it, it spreads its wings and kicks.'
    },
    cardEs: {
        name: 'Búho gigante de Cuba', habitat: 'Bosques de la isla de Cuba, hasta hace unos 10 000 años',
        description: 'El búho más grande que ha existido: más de 1 metro de alto, sobre unas patas largas y fuertes. Apenas podía volar, así que perseguía a sus presas corriendo. Va a lo suyo, pero si le pegas, abre las alas y da una patada.'
    }
});

// A blow that did not finish it: it turns on the player.
onMobEvent('damaged', function (mob) {
    if (mob.userData.species === 'giant_owl') this.giantOwlProvoke(mob);
});

// While it warns, where it looks is its own business: asked before the server's walk and every other goal.
registerMobGoalFirst(function (mob) {
    return mob.userData.giantOwlThreat ? this.giantOwlGoal(mob) : null;
});

// Only the ones that are warning somebody: an empty list, nearly always.
registerFrameUpdate(function (delta) {
    this.giantOwlUpdate(delta);
});

Object.assign(Game.prototype, {
    giantOwlProvoke(mob) {
        const data = mob.userData;
        // (One in a cage has no room to spread its wings.)
        if (data.health <= 0 || data.giantOwlThreat || data.trapsCage) return;
        data.giantOwlThreat = { phase: 'warn', timer: GIANT_OWL.warn, open: 0, kick: 0, goal: new THREE.Vector3() };
        (this.giantOwlAngry || (this.giantOwlAngry = [])).push(mob);
        // A hiss and a clack of its beak, as a warning.
        this.playNoiseBurst({ duration: 0.35, volume: 0.03, highpass: 1600, lowpass: 6000 });
    },

    // Where it "goes" while it warns: nowhere. The goal is the player, as a point it has always reached (the
    // ground mobs of js/game/mobs.js stand still within stopDistance and face their goal).
    giantOwlGoal(mob) {
        const goal = mob.userData.giantOwlThreat.goal;
        const player = this.getLocalPlayerPosition();
        goal.set(player.x, mob.position.y, player.z);
        goal.stopDistance = Infinity;
        return goal;
    },

    giantOwlUpdate(delta) {
        const angry = this.giantOwlAngry;
        if (!angry || angry.length === 0) return;
        for (let i = angry.length - 1; i >= 0; i--) {
            const mob = angry[i];
            if (mob.parent && this.giantOwlWarning(mob, delta)) continue;
            mob.userData.giantOwlThreat = null;
            angry.splice(i, 1);
        }
    },

    // One frame of its anger: wings spread, the kick, and wings folded again. Returns whether it is still
    // at it.
    giantOwlWarning(mob, delta) {
        const data = mob.userData;
        const threat = data.giantOwlThreat;
        if (!threat || this.titleScreenOpen || this.respawnPending) return false;
        threat.timer -= delta;
        if (threat.phase === 'warn' && threat.timer <= 0) {
            threat.phase = 'rest';
            threat.timer = GIANT_OWL.rest;
            threat.kick = 1;
            const player = this.getLocalPlayerPosition();
            const feetGap = Math.abs(player.y - (this.cameraController.eyeHeight || 1.62) - mob.position.y);
            const awayX = player.x - mob.position.x;
            const awayZ = player.z - mob.position.z;
            if (Math.hypot(awayX, awayZ) <= GIANT_OWL.reach && feetGap <= GIANT_OWL.tall) {
                this.cameraController.applyKnockback(awayX, awayZ, GIANT_OWL.shove, 3);
                this.applyDamage(GIANT_OWL.damage, gameText({ ES: 'Te ha dado una patada un búho gigante de Cuba', EN: 'You were kicked by a Cuban giant owl' }), 'mob', mob.position);
                this.playNoiseBurst({ duration: 0.06, volume: 0.035, highpass: 200, lowpass: 1800 });
            }
        }
        // Its wings open while it warns and fold after the kick, and one leg comes up and goes down. It
        // stands meanwhile, so they are put where they rest plus the opening, never added to what the rig
        // (animateMobRig) left: a frame the rig skips would add it twice.
        threat.open += ((threat.phase === 'warn' ? 1 : 0) - threat.open) * Math.min(1, delta * (threat.phase === 'warn' ? 12 : 8));
        threat.kick = Math.max(0, threat.kick - delta * 4);
        const parts = data.modelParts || {};
        if (parts.wingL) parts.wingL.rotation.z = parts.wingL.userData.baseRotation.z + threat.open * GIANT_OWL.wings;
        if (parts.wingR) parts.wingR.rotation.z = parts.wingR.userData.baseRotation.z - threat.open * GIANT_OWL.wings;
        if (parts.legL) parts.legL.rotation.x = parts.legL.userData.baseRotation.x - threat.kick * GIANT_OWL.kick;
        return threat.timer > 0;
    }
});
