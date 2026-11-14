// The Heracles parrot: an extinct animal (js/mobSpecies.js) and an ancient relative of the macaw, found as a
// rare fossil in the deep rock and brought back by the revival machine. The biggest parrot there has been:
// nearly a metre tall and some 7 kilos, of New Zealand, far too heavy to fly. It walks as any ground mob
// (js/game/mobs.js), so the server walks a kept one (js/game/animals.js), and it starts nothing. What is
// its own is what it does when struck: it turns on whoever hit it, opens its wings and its beak as a
// warning, and bites whoever is still within reach a moment later. Only the player who struck it sees
// that: mobs fight in each browser.

// The warning, in seconds and blocks: how long it stands with its beak open (time to step back), how near
// its middle the player has to be then for the bite to reach and how much higher or lower, what the bite
// takes, how long it stands still afterwards, and how far its wings and its beak open (radians).
const HERACLES = { warn: 0.6, reach: 1.9, tall: 1.6, damage: 2, rest: 1.2, wings: 0.9, gape: 0.5 };

// Faces +z. The macaw of js/models.js grown to a block tall and brought down to the ground: a round heavy
// body that stands upright, a big head with a beak as deep as the face, wings too short to lift it, a
// short tail and stout legs. Green and olive like the parrots of New Zealand that still walk more than
// they fly. Every size is a number of quarters of a unit: a texel is half a unit, and a smaller box is not
// painted.
function heraclesModel(b, variant) {
    const palettes = [
        { body: 0x6a8a3c, dark: 0x46622a, belly: 0x9fa84e, face: 0x8c8f4a, crown: 0x587832, beak: 0x8e897a, ridge: 0xcbc4a8, hook: 0x3a362e, leg: 0x6e665a, under: 0xd8843a },
        { body: 0x6f5b3d, dark: 0x4a3c28, belly: 0x9a4c34, face: 0x8a7a5a, crown: 0xa9a99b, beak: 0x7c7a74, ridge: 0xbdb8a6, hook: 0x34302a, leg: 0x5e584e, under: 0xc8502e }
    ];
    const c = palettes[variant % palettes.length];
    // Feathers edged in dark, as a kakapo's: it hides by looking like moss.
    const mottled = { color: c.body, noise: 0.08, all: (p, face) => {
        if (face === 'front') { p.fill(c.belly, 0.07); p.spots(c.body, 5, 0.5, 1); return; }
        if (face === 'bottom') { p.fill(c.belly, 0.06); return; }
        p.spots(c.dark, Math.ceil((p.w * p.h) / 5), 0.5, 1);
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-3.5, 3.5, -3.5], size: [7, 8, 7], paint: mottled });
    b.part('tail', { parent: 'body', pivot: [0, 5.5, -3.5], from: [-2, -0.75, -3.5], size: [4, 1.5, 3.5], rotation: [-0.5, 0, 0], paint: { color: c.dark, noise: 0.07, faces: { bottom: (p) => p.fill(c.under, 0.06) } } });
    b.part('head', {
        parent: 'body', pivot: [0, 11, 0.5], from: [-3, 0, -3], size: [6, 5, 6],
        paint: { color: c.body, noise: 0.07, all: (p, face) => {
            if (face === 'top') { p.fill(c.crown, 0.07); return; }
            if (face === 'front') { p.fill(c.face, 0.06); return; }
            if (face !== 'left' && face !== 'right') { p.spots(c.dark, 6, 0.5, 1); return; }
            // The face paler round the beak, and a dark eye in a ring of bare skin.
            const front = face === 'left' ? p.w - 3 : 0;
            p.rect(front, 1, 3, p.h - 1, c.face, 0.06);
            const eye = face === 'left' ? p.w - 2.75 : 1.25;
            p.rect(eye, 1.25, 1.5, 1.5, 0xe4dcc0, 0);
            p.rect(eye + 0.5, 1.75, 0.5, 0.5, 0x15110e, 0);
        } }
    });
    // The beak: the upper half huge and hooked over the lower, which is what bites.
    b.part('beak', {
        parent: 'head', pivot: [0, 3, 3], from: [-1.5, -1.75, 0], size: [3, 2.75, 2.5],
        paint: { color: c.beak, noise: 0.04, surface: 'smooth', faces: { top: (p) => p.rect(0.75, 0, 1.5, p.h, c.ridge, 0.03) } }
    });
    b.part('beakHook', { parent: 'beak', pivot: [0, -1.75, 2.5], from: [-1, -1.5, -1.25], size: [2, 1.5, 1.25], paint: { color: c.hook, noise: 0.03, surface: 'smooth' } });
    b.part('jaw', { parent: 'head', pivot: [0, 1, 3], from: [-1, -0.75, 0], size: [2, 0.75, 1.5], paint: { color: c.hook, noise: 0.03, surface: 'smooth' } });
    const wingPaint = { color: c.body, noise: 0.08, all: (p, face) => {
        if (face === 'top' || face === 'bottom') return;
        p.spots(c.dark, 8, 0.5, 1);
        p.rect(0, p.h - 1.5, p.w, 1.5, c.dark, 0.06);
    } };
    b.part('wingL', { parent: 'body', pivot: [3.5, 11, 0], from: [0, -6, -3], size: [1, 6, 5.5], paint: { ...wingPaint, faces: { left: (p) => p.fill(c.under, 0.06) } } });
    b.part('wingR', { parent: 'body', pivot: [-3.5, 11, 0], from: [-1, -6, -3], size: [1, 6, 5.5], paint: { ...wingPaint, faces: { right: (p) => p.fill(c.under, 0.06) } } });
    const legPaint = { color: c.leg, noise: 0.05, surface: 'skin', all: (p, face) => { if (face !== 'top' && face !== 'bottom') p.rect(0, 0, p.w, 1, c.body, 0.07); } };
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`leg${side}`, { parent: 'body', pivot: [1.75 * sign, 3.5, 0.5], from: [-0.75, -3.5, -0.75], size: [1.5, 3.5, 1.5], paint: legPaint });
        // Two toes forward and two back, as every parrot's.
        b.part(`foot${side}`, {
            parent: `leg${side}`, pivot: [0, -3.5, 0], from: [-1.25, 0, -1.75], size: [2.5, 0.75, 4],
            paint: { color: c.leg, noise: 0.04, surface: 'skin', faces: { top: (p) => p.rect(p.w / 2 - 0.25, 0, 0.5, p.h, 0x3a352e, 0), front: (p) => p.fill(0x2e2a24, 0.03), back: (p) => p.fill(0x2e2a24, 0.03) } }
        });
    });
    return { legs: ['legL', 'legR'], wings: ['wingL', 'wingR'], head: 'head', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('heracles', {
    info: { eggColor: 0x6a8a3c, tone: 280, maxHealth: 16, speed: 0.4, variants: 2, hiddenUntilDiscovered: true, ancestorOf: 'macaw' },
    model: heraclesModel,
    surface: 'feather',
    drops: [['feather', 1, 3]],
    sheds: ['feather', 0.4, 8],
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Heracles parrot', habitat: 'Forests of New Zealand, about 19 million years ago', activity: 'Day', temperament: 'Neutral',
        description: 'The biggest parrot there has ever been: nearly 1 metre tall and about 7 kilograms, too heavy to fly. It walks the forest floor minding its own business, but if you hit it, it opens its beak and bites.'
    },
    cardEs: {
        name: 'Loro Heracles', habitat: 'Bosques de Nueva Zelanda, hace unos 19 millones de años',
        description: 'El loro más grande que ha existido: casi 1 metro de alto y unos 7 kilos, demasiado para volar. Pasea por el suelo del bosque a lo suyo, pero si le pegas, abre el pico y muerde.'
    }
});

// A blow that did not finish it: it turns on the player.
onMobEvent('damaged', function (mob) {
    if (mob.userData.species === 'heracles') this.heraclesProvoke(mob);
});

// While it warns, where it looks is its own business: asked before the server's walk and every other goal.
registerMobGoalFirst(function (mob) {
    return mob.userData.heraclesThreat ? this.heraclesGoal(mob) : null;
});

// Only the ones that are warning somebody: an empty list, nearly always.
registerFrameUpdate(function (delta) {
    this.heraclesUpdate(delta);
});

Object.assign(Game.prototype, {
    heraclesProvoke(mob) {
        const data = mob.userData;
        // (One in a cage has no room to open its wings.)
        if (data.health <= 0 || data.heraclesThreat || data.trapsCage) return;
        data.heraclesThreat = { phase: 'warn', timer: HERACLES.warn, open: 0, goal: new THREE.Vector3() };
        (this.heraclesAngry || (this.heraclesAngry = [])).push(mob);
        // A harsh screech, as a warning.
        const tone = getMobSpecies('heracles').tone;
        this.playTone({ frequency: tone * 2.2, endFrequency: tone * 1.4, duration: 0.3, type: 'sawtooth', volume: 0.03, attack: 0.02, release: 0.1 });
    },

    // Where it "goes" while it warns: nowhere. The goal is the player, as a point it has always reached (the
    // ground mobs of js/game/mobs.js stand still within stopDistance and face their goal).
    heraclesGoal(mob) {
        const goal = mob.userData.heraclesThreat.goal;
        const player = this.getLocalPlayerPosition();
        goal.set(player.x, mob.position.y, player.z);
        goal.stopDistance = Infinity;
        return goal;
    },

    heraclesUpdate(delta) {
        const angry = this.heraclesAngry;
        if (!angry || angry.length === 0) return;
        for (let i = angry.length - 1; i >= 0; i--) {
            const mob = angry[i];
            if (mob.parent && this.heraclesWarning(mob, delta)) continue;
            mob.userData.heraclesThreat = null;
            const parts = mob.userData.modelParts || {};
            if (parts.jaw) parts.jaw.rotation.x = parts.jaw.userData.baseRotation.x;
            angry.splice(i, 1);
        }
    },

    // One frame of its anger: wings and beak open, the bite, and all shut again. Returns whether it is
    // still at it.
    heraclesWarning(mob, delta) {
        const data = mob.userData;
        const threat = data.heraclesThreat;
        if (!threat || this.titleScreenOpen || this.respawnPending) return false;
        threat.timer -= delta;
        if (threat.phase === 'warn' && threat.timer <= 0) {
            threat.phase = 'rest';
            threat.timer = HERACLES.rest;
            const player = this.getLocalPlayerPosition();
            const feetGap = Math.abs(player.y - (this.cameraController.eyeHeight || 1.62) - mob.position.y);
            if (Math.hypot(player.x - mob.position.x, player.z - mob.position.z) <= HERACLES.reach && feetGap <= HERACLES.tall) {
                this.applyDamage(HERACLES.damage, gameText({ ES: 'Te ha mordido un loro Heracles', EN: 'You were bitten by a Heracles parrot' }), 'mob', mob.position);
                this.playNoiseBurst({ duration: 0.05, volume: 0.035, highpass: 700, lowpass: 3600 });
            }
        }
        // Its wings and its beak open while it warns, and shut after the bite. It stands meanwhile, so
        // they are put where they rest plus the opening, never added to what the rig (animateMobRig) left:
        // a frame the rig skips would add it twice.
        threat.open += ((threat.phase === 'warn' ? 1 : 0) - threat.open) * Math.min(1, delta * (threat.phase === 'warn' ? 12 : 16));
        const parts = data.modelParts || {};
        if (parts.wingL) parts.wingL.rotation.z = parts.wingL.userData.baseRotation.z + threat.open * HERACLES.wings;
        if (parts.wingR) parts.wingR.rotation.z = parts.wingR.userData.baseRotation.z - threat.open * HERACLES.wings;
        if (parts.jaw) parts.jaw.rotation.x = parts.jaw.userData.baseRotation.x + threat.open * HERACLES.gape;
        return threat.timer > 0;
    }
});
