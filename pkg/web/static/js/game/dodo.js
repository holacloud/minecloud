// The dodo: an extinct animal (js/mobSpecies.js), found as recent bones and brought back by the revival
// machine. A fat pigeon of Mauritius that could not fly and had never learnt to fear anybody: instead of
// running away it waddles up to whoever stands near and looks up at them. It walks as any ground mob
// (js/game/mobs.js), so the server walks a kept one (js/game/animals.js); what is its own is where it wants
// to go while somebody is close, a goal asked before every other (registerMobGoalFirst, js/extensions.js).

// How near somebody has to stand for it to come over, how close it gets, and how much higher or lower they
// may be. `leash` is how far from its home it goes for that: the circle the server walks a kept one in, so
// that every player's copy stays where the server can hold it. It looks for somebody twice a second, not
// every frame, and coos to whom it has reached every `coo` seconds.
const DODO = { see: 6, stop: 1.7, tall: 3, leash: 8, look: 0.5, coo: 8 };

// Faces +z. A round body on two stout legs, the neck leaning forward (it is what the rig swings to look
// about and to peck), and the beak: long, swollen at the end and hooked. Beak and legs say their own
// surface: in the detailed textures they are horn and skin, not feathers.
function dodoModel(b, variant) {
    const palettes = [
        { body: 0x7d828a, back: 0x62676f, belly: 0xb4b1a6, wing: 0xd8d0b4, plume: 0xece7d6, face: 0xb9b3a4, beak: 0xcdc89a, bulb: 0xd9b24a, hook: 0x3a3426, leg: 0xe0b03a },
        { body: 0x8b7a66, back: 0x6a5a49, belly: 0xc4b79e, wing: 0xddd0ac, plume: 0xefe6cf, face: 0xbfb5a2, beak: 0xd0c690, bulb: 0xd6a83e, hook: 0x3c3324, leg: 0xd9a236 }
    ];
    const c = palettes[variant % palettes.length];
    // Feathers: darker along the back, pale under the belly.
    const plumage = { color: c.body, noise: 0.07, all: (p, face) => {
        if (face === 'bottom') { p.fill(c.belly, 0.05); return; }
        if (face === 'top') { p.fill(c.back, 0.07); return; }
        p.rect(0, p.h - 2, p.w, 2, c.belly, 0.06);
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-4, 3, -4.5], size: [8, 6, 9], paint: plumage });
    b.part('breast', { parent: 'body', pivot: [0, 2.5, 4.5], from: [-3.5, 0, -0.5], size: [7, 5.5, 2], paint: { color: c.belly, noise: 0.06, faces: { top: (p) => p.fill(c.body, 0.07) } } });
    b.part('rump', { parent: 'body', pivot: [0, 4, -4.5], from: [-3, 0, -1.5], size: [6, 4.5, 2], paint: plumage });

    b.part('neck', { parent: 'body', pivot: [0, 8, 3.25], from: [-2, -1, -2], size: [4, 4.5, 4], paint: { color: c.body, noise: 0.07 }, rotation: [0.35, 0, 0] });
    b.part('head', {
        parent: 'neck', pivot: [0, 3, 0.25], from: [-2.5, -0.5, -2.5], size: [5, 4, 5.5], rotation: [-0.35, 0, 0],
        paint: {
            color: c.body, noise: 0.06,
            all: (p, face) => {
                // The bare skin of the face, around the root of the beak, and an eye on each side.
                if (face === 'front') { p.fill(c.face, 0.04); return; }
                if (face !== 'left' && face !== 'right') return;
                const front = face === 'left' ? p.w - 2.5 : 0;
                p.rect(front, 0.75, 2.5, p.h - 0.75, c.face, 0.04);
                const eye = face === 'left' ? p.w - 2.75 : 1.75;
                p.rect(eye - 0.25, 1, 1.5, 1.5, 0xf2ecd8, 0);
                p.rect(eye, 1.25, 1, 1, 0x14100c, 0);
            }
        }
    });
    b.part('beak', {
        parent: 'head', pivot: [0, 0.75, 3], from: [-1.5, -1.25, 0], size: [3, 2.75, 3.5],
        paint: { color: c.beak, noise: 0.04, surface: 'smooth', all: (p, face) => {
            if (face === 'left') p.rect(p.w - 2, 0.75, 1, 0.5, c.hook, 0);
            if (face === 'right') p.rect(1, 0.75, 1, 0.5, c.hook, 0);
            if (face === 'left' || face === 'right') p.rect(0, 1.75, p.w, 0.25, c.hook, 0.03);
        } }
    });
    b.part('beakBulb', { parent: 'beak', pivot: [0, 0, 3.5], from: [-1.75, -1.5, -0.25], size: [3.5, 3.25, 2.25], paint: { color: c.bulb, noise: 0.05, surface: 'smooth' } });
    b.part('beakHook', { parent: 'beakBulb', pivot: [0, -1.5, 2], from: [-1, -1.5, -1.25], size: [2, 1.75, 1.5], paint: { color: c.hook, noise: 0.04, surface: 'smooth' } });

    // Wings too small to lift it, and a tuft of loose curly plumes for a tail.
    const wingPaint = { color: c.body, noise: 0.07, all: (p, face) => { if (face === 'top') p.fill(c.back, 0.07); else p.rect(0, p.h - 1.25, p.w, 1.25, c.wing, 0.05); } };
    b.part('wingL', { parent: 'body', pivot: [4, 8.25, 0.5], from: [0, -3, -2], size: [1, 3, 4.5], paint: wingPaint });
    b.part('wingR', { parent: 'body', pivot: [-4, 8.25, 0.5], from: [-1, -3, -2], size: [1, 3, 4.5], paint: wingPaint });
    const plumePaint = { color: c.plume, noise: 0.06, all: (p) => { for (let x = 0.5; x < p.w; x += 1) p.rect(x, 0, 0.25, p.h, c.wing, 0.04); } };
    b.part('tail', { parent: 'body', pivot: [0, 8, -5.5], from: [-1.5, -0.75, -2.25], size: [3, 2.25, 2.25], paint: plumePaint, rotation: [0.8, 0, 0] });
    b.part('tailCurl', { parent: 'tail', pivot: [0, 1.25, -2.25], from: [-1, -1.5, -1.25], size: [2, 1.75, 1.25], paint: plumePaint, rotation: [0.9, 0, 0] });

    const legPaint = { color: c.leg, noise: 0.04, surface: 'skin', all: (p, face) => { if (face !== 'top' && face !== 'bottom') for (let y = 0.75; y < p.h; y += 1) p.rect(0, y, p.w, 0.25, 0xa87a22, 0.03); } };
    const footPaint = { color: c.leg, noise: 0.04, surface: 'skin', faces: {
        top: (p) => { p.rect(0.75, 1.25, 0.25, p.h - 1.25, 0xa87a22, 0); p.rect(2, 1.25, 0.25, p.h - 1.25, 0xa87a22, 0); },
        front: (p) => { for (let x = 0.25; x < p.w; x += 1) p.rect(x, 0, 0.5, p.h, 0x2e2618, 0); }
    } };
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`leg${side}`, { parent: 'body', pivot: [2 * sign, 3, 0.5], from: [-1, -3, -1], size: [2, 3, 2], paint: legPaint });
        b.part(`foot${side}`, { parent: `leg${side}`, pivot: [0, -3, 0], from: [-1.5, 0, -1], size: [3, 0.75, 4], paint: footPaint });
    });
    return { legs: ['legL', 'legR'], wings: ['wingL', 'wingR'], head: 'neck', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('dodo', {
    info: { eggColor: 0x8a8d90, tone: 190, maxHealth: 12, speed: 0.42, variants: 2, grazer: true, hiddenUntilDiscovered: true },
    model: dodoModel,
    surface: 'feather',
    drops: [['feather', 1, 2]],
    sheds: ['feather', 0.4, 8],
    // Seeds and what lies on the floor of a forest. It takes to anybody: one try in two is enough.
    diet: { foods: ['wheat_seeds', 'wheat', 'mushroom_brown', 'flower_red'], chance: 1 / 2 },
    // No bait: it needs none to come over, and one the server walks would not go to a pile anyway.
    trap: { baits: [], cage: true },
    fossil: { source: 'bones', rarity: 'rare' },
    card: {
        name: 'Dodo', habitat: 'Forests of the island of Mauritius, until about 350 years ago', activity: 'Day', temperament: 'Friendly',
        description: 'A fat pigeon about 1 block tall that could not fly. It had never met an enemy, so it fears nobody: stand near and it waddles up to look at you.'
    },
    cardEs: {
        name: 'Dodo', habitat: 'Bosques de la isla Mauricio, hasta hace unos 350 años',
        description: 'Una paloma gorda de casi 1 bloque de alto que no podía volar. Nunca había tenido enemigos, así que no teme a nadie: quédate cerca y vendrá andando a mirarte.'
    }
});

registerMobGoalFirst(function (mob, delta) {
    return mob.userData.species === 'dodo' ? this.dodoGoal(mob, delta) : null;
});

Object.assign(Game.prototype, {
    // Where a dodo goes while somebody stands near: up to them. Nothing to say (null) for a pet, which goes
    // with its owner, for one in a cage, and while nobody is close: then it wanders, or walks where the
    // server sends it. The goal is one vector for each dodo, moved twice a second.
    dodoGoal(mob, delta) {
        const data = mob.userData;
        if (data.tamed || data.trapsCage) return null;
        data.dodoLook = (data.dodoLook || 0) - (delta || 0.016);
        if (data.dodoLook <= 0) {
            data.dodoLook = DODO.look;
            data.dodoFriend = this.dodoFindFriend(mob);
        }
        return data.dodoFriend ? data.dodoTowards : null;
    },

    // Whether a player at (x, feet, z) is somebody this dodo would go to, and how far away they are: near
    // it, about as high as it is, and no further from its home than it strays. Infinity if not.
    dodoReach(mob, x, feet, z) {
        const home = mob.userData.home;
        if (Math.abs(feet - mob.position.y) > DODO.tall || Math.hypot(x - home.x, z - home.z) > DODO.leash) return Infinity;
        const distance = Math.hypot(x - mob.position.x, z - mob.position.z);
        return distance <= DODO.see ? distance : Infinity;
    },

    // Looks for the nearest player, this one or any other whose avatar is here: every client picks the same
    // one, so the copies of a dodo the server keeps all walk to the same place. Returns whether there is
    // one, with the goal (userData.dodoTowards) put where they stand.
    dodoFindFriend(mob) {
        const data = mob.userData;
        const me = this.getLocalPlayerPosition();
        const mine = this.titleScreenOpen || this.respawnPending ? Infinity : this.dodoReach(mob, me.x, me.y - (this.cameraController.eyeHeight || 1.62), me.z);
        let nearest = mine;
        let x = me.x;
        let z = me.z;
        if (this.otherPlayerMeshes) {
            for (const avatar of this.otherPlayerMeshes.values()) {
                if (!avatar.visible) continue;
                const distance = this.dodoReach(mob, avatar.position.x, avatar.position.y, avatar.position.z);
                if (distance < nearest) {
                    nearest = distance;
                    x = avatar.position.x;
                    z = avatar.position.z;
                }
            }
        }
        data.dodoCoo = Math.max(0, (data.dodoCoo || 0) - DODO.look);
        if (nearest === Infinity) return false;
        const goal = data.dodoTowards || (data.dodoTowards = new THREE.Vector3());
        goal.set(x, mob.position.y, z);
        goal.stopDistance = DODO.stop;
        if (nearest <= DODO.stop + 0.3) {
            // There: it looks up at them, tilting its head, and coos now and then.
            data.lookTimer = DODO.look + 0.2;
            data.lookPitch = -0.3;
            data.lookYaw = Math.sin(data.life * 0.9) * 0.4;
            if (data.dodoCoo <= 0) {
                data.dodoCoo = DODO.coo + Math.random() * 4;
                this.dodoCooAt(mob, Math.hypot(me.x - mob.position.x, me.z - mob.position.z));
            }
        }
        return true;
    },

    // Two low notes, quieter the further this player is from it.
    dodoCooAt(mob, distance) {
        const loudness = Math.max(0, 1 - distance / 14);
        if (loudness <= 0) return;
        const tone = getMobSpecies('dodo').tone;
        this.playTone({ frequency: tone, endFrequency: tone * 0.8, duration: 0.16, type: 'sine', volume: 0.03 * loudness, attack: 0.02, release: 0.1 });
        setTimeout(() => this.playTone({ frequency: tone * 0.9, endFrequency: tone * 0.7, duration: 0.22, type: 'sine', volume: 0.03 * loudness, attack: 0.02, release: 0.14 }), 230);
    }
});
