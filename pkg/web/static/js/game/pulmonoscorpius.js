// Pulmonoscorpius: an extinct animal (js/mobSpecies.js) and an ancient relative of the scorpion, found as a
// rare fossil in the deep rock and brought back by the revival machine. A scorpion as long as a cat, from
// the forests of the Carboniferous, with big eyes on the sides of its head: it hunted by day. It walks,
// chases and stings as the living scorpion does (the ground movement of js/game/mobs.js, with `tailStrike`
// and `poison`), so the server walks a kept one and says whom it is after (js/game/animals.js). Bigger,
// tougher and with more venom than its descendant, and awake by day: it has no `nocturnal`. It has no
// code of its own.

// Faces +z. The scorpion of js/models.js grown by a third and pushed back to what it was: a long flat body
// of plates, a wide head with a big eye at each front corner (and two more on top), stout claws held with
// the elbows out, legs with a high knee, and a tail of five segments that curls over the back to the sting.
function pulmonoscorpiusModel(b, variant) {
    const palettes = [
        { shell: 0x7a4a26, band: 0x54300f, dark: 0x2a1608, leg: 0x9a6a34, belly: 0xb08a50 },
        { shell: 0x45432e, band: 0x2c2b1c, dark: 0x15140c, leg: 0x6e6842, belly: 0x8f8a5c }
    ];
    const c = palettes[variant % palettes.length];
    const plated = { color: c.shell, noise: 0.06, bevel: 0.14, all: (p, face) => {
        if (face === 'top') for (let y = 1.75; y < p.h; y += 2) p.rect(0, y, p.w, 0.5, c.band, 0.04);
        if (face === 'bottom') p.fill(c.belly, 0.04);
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-4, 2, -6], size: [8, 3, 11], paint: plated });
    b.part('head', {
        parent: 'body', pivot: [0, 3.5, 5], from: [-3.5, -1.5, 0], size: [7, 3, 4],
        paint: { color: c.shell, noise: 0.06, bevel: 0.14, all: (p, face) => {
            if (face === 'bottom') { p.fill(c.belly, 0.04); return; }
            if (face !== 'top') return;
            // The two eyes of the middle, on their little mound, and the furrow behind them (the top of a
            // face that looks up is its back edge).
            p.rect(p.w / 2 - 1.5, 1.25, 3, 1.5, c.band, 0.04);
            p.rect(p.w / 2 - 1.25, 1.5, 1, 1, 0x070605, 0);
            p.rect(p.w / 2 + 0.25, 1.5, 1, 1, 0x070605, 0);
            p.rect(p.w / 2 - 1.25, 1.5, 0.5, 0.5, 0xe8e2d0, 0);
            p.rect(p.w / 2 + 0.25, 1.5, 0.5, 0.5, 0xe8e2d0, 0);
            p.rect(p.w / 2 - 0.25, 0, 0.5, 1.25, c.band, 0.04);
        } }
    });
    b.part('jaws', {
        parent: 'head', pivot: [0, -0.75, 4], from: [-1.5, -0.75, 0], size: [3, 1.5, 1.25],
        paint: { color: c.leg, noise: 0.05, faces: { front: (p) => { p.rect(0.25, 0.5, 1, 1, c.dark, 0); p.rect(1.75, 0.5, 1, 1, c.dark, 0); } } }
    });

    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        // The eye of the side: big, dark and shiny, standing out of the corner of the head.
        b.part(`eye${side}`, {
            parent: 'head', pivot: [3.5 * sign, 0.5, 3], from: [-1, -0.75, -1.25], size: [2, 2, 2.5],
            paint: { color: 0x0b0908, noise: 0.02, bevel: 0, all: (p, face) => {
                if (face === 'bottom') return;
                if (face === 'top') { p.rect(0.25, 0.25, 0.5, 0.5, 0x6a625a, 0); return; }
                // A glint towards the front, and the facets as a faint grid.
                const front = face === 'front' ? 0.25 : face === 'left' ? p.w - 0.75 : 0.25;
                p.rect(front, 0.25, 0.5, 0.5, 0xffffff, 0);
                for (let x = 0.75; x < p.w; x += 1) p.rect(x, 1, 0.25, 0.25, 0x3a332c, 0);
            } }
        });

        // A claw: the arm out to the side, the hand turned back to the front, and two fingers that the rig
        // opens and shuts (animateMobRig, js/game/mobs.js).
        b.part(`arm${side}`, { parent: 'body', pivot: [3.25 * sign, 3.25, 5.5], from: [-0.75, -0.75, 0], size: [1.5, 1.5, 5.5], paint: plated, rotation: [-0.12, 0.7 * sign, 0] });
        b.part(`claw${side}`, { parent: `arm${side}`, pivot: [0, 0, 5.25], from: [-1.625, -1.125, -0.5], size: [3.25, 2.25, 4.25], paint: plated, rotation: [0.05, -0.95 * sign, 0] });
        const fingerPaint = { color: c.dark, noise: 0.04, surface: 'smooth' };
        b.part(`pincer${side}`, { parent: `claw${side}`, pivot: [0.95 * sign, 0, 3.75], from: [-0.5, -0.625, 0], size: [1, 1.25, 3.5], paint: fingerPaint });
        b.part(`finger${side}`, { parent: `claw${side}`, pivot: [-0.95 * sign, 0, 3.75], from: [-0.5, -0.625, 0], size: [1, 1.25, 3.5], paint: fingerPaint });
    });

    // The tail: each segment turns a little more than the one before, up and over the back. (Every size of
    // this model is a number of quarters of a unit: a texel is half a unit, and a smaller box is not painted.)
    const tailSizes = [[2.75, 2.5, 4], [2.5, 2.25, 4], [2.25, 2, 4], [2, 1.75, 4], [1.75, 1.5, 3.5]];
    let parent = 'body';
    let pivot = [0, 4, -6];
    const tail = [];
    tailSizes.forEach((size, index) => {
        const name = `tail${index + 1}`;
        b.part(name, { parent, pivot, from: [-size[0] / 2, -size[1] / 2, -size[2]], size, paint: plated, rotation: [index === 0 ? 0.9 : 0.5, 0, 0] });
        tail.push(name);
        parent = name;
        pivot = [0, 0, -size[2]];
    });
    // (Named after the tail they end, so that js/game/herd.js leaves them out of the body's reach.)
    b.part('tailBulb', { parent, pivot, from: [-1.25, -1.25, -2.5], size: [2.5, 2.5, 2.5], paint: { color: c.leg, noise: 0.05 }, rotation: [0.5, 0, 0] });
    b.part('tailSting', { parent: 'tailBulb', pivot: [0, -0.5, -2.5], from: [-0.375, -0.375, -2], size: [0.75, 0.75, 2], paint: { color: 0x120c08, noise: 0, surface: 'smooth' }, rotation: [0.7, 0, 0] });
    tail.push('tailBulb');

    // Eight legs, the front ones reaching forward and the hind ones back: a thigh up to the knee and a shin
    // down to the ground.
    const legPaint = { color: c.leg, noise: 0.05, bevel: 0.05 };
    const legs = [];
    for (let i = 0; i < 4; i++) {
        const z = 3.5 - i * 2.4;
        const spread = 0.55 - i * 0.4;
        [['L', 1], ['R', -1]].forEach(([side, sign]) => {
            b.part(`leg${side}${i}`, { parent: 'body', pivot: [4 * sign, 3, z], from: [sign > 0 ? 0 : -3.5, -0.5, -0.5], size: [3.5, 1, 1], paint: legPaint, rotation: [0, -spread * sign, 0.5 * sign] });
            b.part(`shin${side}${i}`, { parent: `leg${side}${i}`, pivot: [3.5 * sign, 0, 0], from: [sign > 0 ? 0 : -4.75, -0.375, -0.375], size: [4.75, 0.75, 0.75], paint: { ...legPaint, faces: { [sign > 0 ? 'right' : 'left']: (p) => p.fill(c.dark, 0.04) } }, rotation: [0, 0, -1.7 * sign] });
            legs.push(`leg${side}${i}`);
        });
    }
    return { legs, head: 'head', tail, legAxis: 'y' };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('pulmonoscorpius', {
    info: { eggColor: 0x7a4a26, tone: 900, hostile: true, chaseDistance: 10, attackDamage: 2, poison: 4, maxHealth: 12, speed: 0.4, chaseSpeed: 1.2, variants: 2, tailStrike: true, hiddenUntilDiscovered: true, ancestorOf: 'scorpion' },
    model: pulmonoscorpiusModel,
    surface: 'skin',
    drops: [['venom_sac', 1, 2], ['shell', 1, 1, 0.5]],
    // No bait: one the server walks goes where the server says, never to a pile. And it is too big for a cage.
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Pulmonoscorpius', habitat: 'Forests of Scotland in the Carboniferous, about 330 million years ago', activity: 'Day', temperament: 'Hostile',
        description: 'A scorpion 70 cm long, with big eyes to hunt by day. It runs at you, lunges its curled tail over its head, and its sting leaves you poisoned for a while.'
    },
    cardEs: {
        name: 'Pulmonoscorpius', habitat: 'Bosques de Escocia en el Carbonífero, hace unos 330 millones de años',
        description: 'Un escorpión de 70 cm de largo, con ojos grandes para cazar de día. Corre hacia ti, lanza su cola curvada por encima de la cabeza y su picadura te deja envenenado un rato.'
    }
});
