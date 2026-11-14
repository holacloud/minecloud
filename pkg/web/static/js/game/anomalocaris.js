// Anomalocaris: an extinct animal of the sea with no living relative in the game, found as a rare fossil in
// the deep rock (js/game/fossils.js) and brought back to life next to at least 16 blocks of water. The great
// hunter of the Cambrian seas, one block long: a flat body with a row of swimming flaps along each side, two
// spiny arms at the front that grab, eyes on stalks, a round mouth of plates underneath and a fan at its
// tail. It goes for a player who is in the water, with a weak bite, and for the trilobites and other small
// animals of its water, which it chases and snaps at (js/game/sea_animals.js says how). How it moves is the
// 'cruise' movement of every sea animal: this file is its model and its row in the tables of the others.

// Faces +z, with its middle in the middle of its trunk. The flaps are its `wings`, in pairs from the front
// to the back: the movement sends a wave down them, as the animal swam. Its two great arms, each in two
// pieces curled down under its head, are its `arms`, which the movement waves; under each a row of spines.
// The tail with its fan is its `tail`, which sways. Every size is a number of quarters of a unit: a face is
// painted in whole texels, two to a unit (js/models.js).
function anomalocarisModel(b, variant) {
    const palettes = [
        // The red of most drawings of it (its real colour is not known).
        { shell: 0xc4583a, dark: 0x7a2e1e, belly: 0xe9b998, arm: 0xdc843c, spine: 0xf2d7a0, stalk: 0xd9a27c },
        // A sandy brown.
        { shell: 0x9a7650, dark: 0x5c4128, belly: 0xe2cfb0, arm: 0xb98a4e, spine: 0xf0e2c0, stalk: 0xc9ab84 }
    ];
    const c = palettes[variant % palettes.length];
    // The trunk: segments across its back, one dark line every unit, and a pale belly.
    const segmented = {
        color: c.shell, noise: 0.05, bevel: 0.08, surface: 'smooth',
        all: (p, face) => {
            if (face === 'bottom') { p.fill(c.belly, 0.03); return; }
            if (face === 'top') { for (let z = 0.5; z < p.h; z += 1) p.rect(0, z, p.w, 0.5, c.dark, 0.04); return; }
            if (face === 'left' || face === 'right') for (let z = 0.5; z < p.w; z += 1) p.rect(z, 0, 0.5, p.h, c.dark, 0.04);
        }
    };
    const flapPaint = { color: c.shell, noise: 0.05, surface: 'smooth', all: (p, face) => { if (face === 'top') { p.rect(0, 0, p.w, 0.5, c.dark, 0.03); p.rect(p.w - 0.5, 0, 0.5, p.h, c.dark, 0.03); } else if (face === 'bottom') p.fill(c.belly, 0.03); } };
    const armPaint = { color: c.arm, noise: 0.05, bevel: 0.06, surface: 'smooth', all: (p, face) => { if (face === 'left' || face === 'right') for (let z = 0.5; z < p.w; z += 1) p.rect(z, 0, 0.5, p.h, c.dark, 0.04); } };
    const spinePaint = { color: c.spine, noise: 0.03, surface: 'smooth' };

    b.part('body', { pivot: [0, 0, 0], from: [-2.25, 0.75, -3], size: [4.5, 1.5, 6], paint: segmented });
    // The head, under a smooth shield, and the round mouth beneath it: a ring of plates round a dark hole.
    b.part('head', {
        parent: 'body', pivot: [0, 0, 3], from: [-1.75, 0.75, 0], size: [3.5, 1.75, 2.5],
        paint: { color: c.shell, noise: 0.04, bevel: 0.12, surface: 'smooth', faces: { top: (p) => p.rect(0.5, 0.5, p.w - 1, p.h - 1, c.arm, 0.04), bottom: (p) => p.fill(c.belly, 0.03) } }
    });
    b.part('mouth', {
        parent: 'head', pivot: [0, 0.75, 0.5], from: [-1, -0.5, 0], size: [2, 0.5, 1.5],
        paint: { color: c.spine, noise: 0.03, surface: 'smooth', faces: { bottom: (p) => { p.fill(c.spine, 0.04); p.rect(0.5, 0.5, p.w - 1, p.h - 1, 0x2a1410, 0); } } }
    });
    const arms = [];
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        // An eye on a stalk, standing out to each side of the head.
        b.part(`stalk${side}`, { parent: 'head', pivot: [1.25 * sign, 2, 1.5], from: [sign > 0 ? 0 : -1.5, -0.25, -0.25], size: [1.5, 0.5, 0.5], rotation: [0, 0.2 * sign, 0.45 * sign], paint: { color: c.stalk, noise: 0.04, surface: 'smooth' } });
        b.part(`eye${side}`, {
            parent: `stalk${side}`, pivot: [1.5 * sign, 0, 0], from: [-0.5, -0.5, -0.5], size: [1, 1, 1],
            paint: { color: 0x14100e, noise: 0.03, surface: 'smooth', faces: { top: (p) => p.rect(0, 0, 0.5, 0.5, 0xe8e2d8, 0), front: (p) => p.rect(0, 0, 0.5, 0.5, 0x6a6058, 0) } }
        });
        // The great arm: out of the front of the head, curled down, a spine under every joint.
        b.part(`arm${side}`, { parent: 'head', pivot: [0.75 * sign, 1.25, 2.5], from: [-0.375, -0.375, 0], size: [0.75, 0.75, 2], rotation: [0.35, 0.15 * sign, 0], paint: armPaint });
        b.part(`armTip${side}`, { parent: `arm${side}`, pivot: [0, 0, 2], from: [-0.25, -0.25, 0], size: [0.5, 0.5, 1.5], rotation: [0.9, 0, 0], paint: armPaint });
        [0.5, 1.5].forEach((z, i) => b.part(`spine${side}${i}`, { parent: `arm${side}`, pivot: [0, -0.375, z], from: [-0.125, -0.75, -0.125], size: [0.25, 0.75, 0.25], rotation: [-0.3, 0, 0], paint: spinePaint }));
        [0.25, 1].forEach((z, i) => b.part(`spineTip${side}${i}`, { parent: `armTip${side}`, pivot: [0, -0.25, z], from: [-0.125, -0.75, -0.125], size: [0.25, 0.75, 0.25], rotation: [-0.3, 0, 0], paint: spinePaint }));
        arms.push(`arm${side}`, `armTip${side}`);
    });
    // The flaps: one small pair beside the head and four along the trunk, overlapping a little, the
    // longest in the middle.
    const wings = [];
    [['head', 1.75, 1.25, 1.5], ['body', 2.25, 2.25, 2.5], ['body', 2.25, 0.75, 2.75], ['body', 2.25, -0.75, 2.5], ['body', 2.25, -2.25, 2]].forEach(([parent, x, z, length], i) => {
        [['L', 1], ['R', -1]].forEach(([side, sign]) => {
            const name = `flap${i}${side}`;
            b.part(name, { parent, pivot: [x * sign, 1.25, z], from: [sign > 0 ? 0 : -length, -0.125, -0.875], size: [length, 0.25, 1.75], rotation: [0, 0.15 * sign, -0.1 * sign], paint: flapPaint });
            wings.push(name);
        });
    });
    // The tail, and its fan: two pairs of blades spread in a V.
    b.part('tail', { parent: 'body', pivot: [0, 1.5, -3], from: [-1, -0.5, -1.25], size: [2, 1, 1.25], paint: segmented });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`fan${side}`, { parent: 'tail', pivot: [0.5 * sign, 0.125, -1], from: [-0.875, -0.125, -2.25], size: [1.75, 0.25, 2.25], rotation: [0, -0.6 * sign, 0], paint: flapPaint });
        b.part(`fanInner${side}`, { parent: 'tail', pivot: [0.25 * sign, -0.125, -1], from: [-0.625, -0.125, -2], size: [1.25, 0.25, 2], rotation: [0, -0.25 * sign, 0], paint: flapPaint });
    });
    return { head: 'head', arms, wings, tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('anomalocaris', {
    info: { eggColor: 0xc4583a, tone: 520, hostile: true, attackDamage: 1, chaseDistance: 6, chaseSpeed: 1.4, maxHealth: 8, speed: 0.7, variants: 2, movement: 'cruise', seaDepth: 0.3, hiddenUntilDiscovered: true },
    model: anomalocarisModel,
    surface: 'smooth',
    // Nothing of it is of use: a shell of chitin and soft flesh.
    drops: [],
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare', water: 16 },
    card: {
        name: 'Anomalocaris', habitat: 'Seas of the Cambrian, about 520 to 500 million years ago', activity: 'Day', temperament: 'Hostile',
        description: 'The great hunter of the first seas full of animals: half a metre to a metre long, with 2 spiny arms to grab its prey and eyes on stalks. It chases trilobites, and nips whoever swims near it.'
    },
    cardEs: {
        name: 'Anomalocaris', habitat: 'Mares del Cámbrico, hace unos 520 a 500 millones de años',
        description: 'El gran cazador de los primeros mares llenos de animales: de medio metro a un metro de largo, con 2 brazos con púas para atrapar a sus presas y ojos sobre tallos. Persigue a los trilobites y pellizca a quien nade cerca.'
    }
});
