// The hell ant: an extinct animal (js/mobSpecies.js) and an ancient relative of the ant, found in amber and
// brought back by the revival machine. An ant of the age of the dinosaurs with a horn on its forehead and two
// jaws like scythes that closed upwards, against the horn, where every ant of today shuts its jaws sideways.
// It is one big ant, not a colony: nothing of the anthills of js/game/ants.js. It walks, chases and bites as
// any hostile ground mob (js/game/mobs.js), so the server walks a kept one and says whom it is after
// (js/game/animals.js). Small and weak: one bite takes little, and two blows finish it. What is its own is
// how its jaws move, below.

// Its jaws, in radians from how the model holds them (open): how far up they shut for a bite, and how much
// they work up and down the rest of the time.
const HELL_ANT = { shut: 0.5, chew: 0.1 };

// Faces +z. The ant of js/game/ants.js at less than half its size, with what made this one different pushed
// forward: the horn, leaning out over the mouth and ending in a wide pad, and under it the two scythes,
// each a short arm to the front and a long blade that turns up towards the pad. Every size is a number of
// quarters of a unit: a texel is half a unit, and a smaller box is not painted.
function hellAntModel(b, variant) {
    const palettes = [
        { body: 0x7a2c18, dark: 0x34130b, horn: 0x1c0e0a, pad: 0x9a8f86, leg: 0x4a1c10 },
        { body: 0x2e241c, dark: 0x15100c, horn: 0x0e0a08, pad: 0x8a8f9a, leg: 0x7a4a20 }
    ];
    const c = palettes[variant % palettes.length];
    const shell = { color: c.body, noise: 0.05, surface: 'smooth' };
    const dark = { color: c.dark, noise: 0.04, surface: 'smooth' };
    const horn = { color: c.horn, noise: 0.03, surface: 'smooth' };
    b.part('body', { pivot: [0, 1.75, 0], from: [-0.5, -0.5, -0.875], size: [1, 1, 1.75], paint: shell });
    b.part('petiole', { parent: 'body', pivot: [0, -0.1, -0.875], from: [-0.25, -0.25, -0.5], size: [0.5, 0.75, 0.5], paint: dark });
    b.part('gaster', {
        parent: 'body', pivot: [0, 0.1, -1.375], from: [-0.875, -0.75, -2], size: [1.75, 1.5, 2],
        paint: { ...dark, all: (p, face) => {
            if (face === 'front' || face === 'back') return;
            // The rings of its abdomen.
            const along = face === 'top' || face === 'bottom';
            for (let i = 0.5; i < (along ? p.h : p.w); i += 1) {
                if (along) p.rect(0, i, p.w, 0.5, c.body, 0.03);
                else p.rect(i, 0, 0.5, p.h, c.body, 0.03);
            }
        } }
    });
    b.part('head', {
        parent: 'body', pivot: [0, 0.25, 0.875], from: [-0.75, -0.75, 0], size: [1.5, 1.5, 1.25],
        paint: { ...shell, all: (p, face) => {
            // A dark eye on each side, with a glint towards the front.
            if (face === 'left') { p.rect(0.5, 0.5, 1, 0.5, 0x050404, 0); p.rect(1, 0.5, 0.5, 0.5, 0x6a625a, 0); }
            if (face === 'right') { p.rect(0, 0.5, 1, 0.5, 0x050404, 0); p.rect(0, 0.5, 0.5, 0.5, 0x6a625a, 0); }
            if (face === 'front') p.rect(0.5, 1, p.w - 1, 0.5, c.dark, 0.03);
        } }
    });
    // The horn: out and up from the forehead, with its pad at the end (grey: in one kind of hell ant it
    // seems to have been hardened with metal).
    b.part('horn', { parent: 'head', pivot: [0, 0.6, 1.05], from: [-0.25, 0, -0.25], size: [0.5, 1.5, 0.5], paint: horn, rotation: [0.95, 0, 0] });
    b.part('hornPad', { parent: 'horn', pivot: [0, 1.5, 0], from: [-0.5, -0.1, -0.375], size: [1, 0.5, 0.75], paint: { color: c.horn, noise: 0.03, surface: 'smooth', faces: { front: (p) => p.fill(c.pad, 0.04), bottom: (p) => p.fill(c.pad, 0.04) } } });

    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        // A scythe, held open: hellAntUpdate turns `jaw` to shut it upwards.
        b.part(`jaw${side}`, { parent: 'head', pivot: [0.4 * sign, -0.55, 1.2], from: [-0.25, -0.25, 0], size: [0.5, 0.5, 1], paint: horn, rotation: [0.85, 0, 0] });
        b.part(`blade${side}`, { parent: `jaw${side}`, pivot: [0, 0, 1], from: [-0.25, 0, -0.25], size: [0.5, 1.75, 0.5], paint: horn, rotation: [-0.15, 0, 0] });
        b.part(`bladeTip${side}`, { parent: `blade${side}`, pivot: [0, 1.75, 0], from: [-0.125, 0, -0.125], size: [0.25, 0.75, 0.25], paint: { color: c.pad, noise: 0.03, surface: 'smooth' }, rotation: [-0.6, 0, 0] });

        // Elbowed feelers, as every ant has.
        b.part(`antenna${side}`, { parent: 'head', pivot: [0.6 * sign, 0.55, 1], from: [-0.125, -0.125, 0], size: [0.25, 0.25, 1.25], paint: dark, rotation: [-0.9, 0.7 * sign, 0] });
        b.part(`antennaTip${side}`, { parent: `antenna${side}`, pivot: [0, 0, 1.25], from: [-0.125, -0.125, 0], size: [0.25, 0.25, 1.25], paint: dark, rotation: [1.3, 0, 0] });
    });

    // Six legs from the middle of its body: a thigh up to the knee and a shin down to the ground.
    const legPaint = { color: c.leg, noise: 0.04, surface: 'smooth' };
    const legs = [];
    [[0.6, 0.7], [0, 0], [-0.6, -0.7]].forEach(([z, splay], i) => {
        const thigh = 1.25;
        const shin = i === 2 ? 2.25 : 2;
        const knee = 1.5 + thigh * Math.sin(0.35);
        const bend = 0.35 + Math.asin(Math.min(1, (knee - 0.125) / shin));
        [['L', 1], ['R', -1]].forEach(([side, sign]) => {
            b.part(`leg${side}${i}`, { parent: 'body', pivot: [0.5 * sign, -0.25, z], from: [sign > 0 ? 0 : -thigh, -0.125, -0.125], size: [thigh, 0.25, 0.25], paint: legPaint, rotation: [0, -splay * sign, 0.35 * sign] });
            b.part(`shin${side}${i}`, { parent: `leg${side}${i}`, pivot: [thigh * sign, 0, 0], from: [sign > 0 ? 0 : -shin, -0.125, -0.125], size: [shin, 0.25, 0.25], paint: legPaint, rotation: [0, 0, -bend * sign] });
            legs.push(`leg${side}${i}`);
        });
    });
    return { legs, head: 'head', legAxis: 'y' };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('hell_ant', {
    info: { eggColor: 0x7a2c18, tone: 2200, hostile: true, chaseDistance: 6, attackDamage: 1, maxHealth: 6, speed: 0.5, chaseSpeed: 1.4, variants: 2, hiddenUntilDiscovered: true, ancestorOf: 'ant' },
    model: hellAntModel,
    surface: 'skin',
    // Like the ants of today, it leaves nothing.
    drops: [],
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [], cage: true },
    fossil: { source: 'amber', rarity: 'rare' },
    card: {
        name: 'Hell ant', habitat: 'Forests of Myanmar, about 99 million years ago', activity: 'Day', temperament: 'Hostile',
        description: 'An ant with a horn on its head and jaws like scythes that closed upwards, pinning its prey against the horn. It runs at you and bites, but it is small and weak.'
    },
    cardEs: {
        name: 'Hormiga infernal', habitat: 'Bosques de Myanmar, hace unos 99 millones de años',
        description: 'Una hormiga con un cuerno en la cabeza y mandíbulas como guadañas que se cerraban hacia arriba, sujetando a su presa contra el cuerno. Corre hacia ti y muerde, pero es pequeña y débil.'
    }
});

// Every hell ant there is, for hellAntUpdate: a short list, and empty nearly always.
onMobEvent('spawned', function (mob) {
    if (mob.userData.species === 'hell_ant') (this.hellAntMobs || (this.hellAntMobs = [])).push(mob);
});

registerFrameUpdate(function (delta) {
    this.hellAntUpdate(delta);
});

Object.assign(Game.prototype, {
    // Its jaws: shut upwards, against the horn, while it bites (js/game/mobs.js holds `attackPose` for a
    // moment after each bite), and working a little the rest of the time. One number for each ant; the parts
    // are read from the model each frame, since a change of graphics builds it again.
    hellAntUpdate(delta) {
        const ants = this.hellAntMobs;
        if (!ants || ants.length === 0) return;
        for (let i = ants.length - 1; i >= 0; i--) {
            const mob = ants[i];
            if (!mob.parent) {
                ants.splice(i, 1);
                continue;
            }
            const data = mob.userData;
            const parts = data.modelParts;
            if (!parts || !parts.jawL || !parts.jawR) continue;
            const target = data.attackPose > 0 ? -HELL_ANT.shut : Math.sin(data.life * 5) * HELL_ANT.chew;
            data.hellAntJaws = (data.hellAntJaws || 0) + (target - (data.hellAntJaws || 0)) * Math.min(1, delta * 20);
            parts.jawL.rotation.x = parts.jawL.userData.baseRotation.x + data.hellAntJaws;
            parts.jawR.rotation.x = parts.jawR.userData.baseRotation.x + data.hellAntJaws;
        }
    }
});
