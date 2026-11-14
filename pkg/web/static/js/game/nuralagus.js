// Nuralagus, the giant rabbit of Menorca: an extinct animal (js/mobSpecies.js) and an ancient relative of
// the rabbit, found as a rare fossil in the deep rock and brought back by the revival machine. Six times
// the weight of a rabbit, on an island with nothing to run from: a stiff back, short legs, small ears and
// small eyes. It could not hop, and here it does not: it has none of the rabbit's movement (its burrow,
// its jumps, its flight, js/game/rabbit.js), it walks and grazes as any ground mob (js/game/mobs.js), so
// the server walks a kept one (js/game/animals.js). It is tamed, which no rabbit is, with what a rabbit
// eats.

// Faces +z. The rabbit of js/game/rabbit.js with everything that made it a runner taken away: the body is
// a heavy loaf, level from shoulder to rump, the hind legs are no longer than the front ones and stand
// under it instead of folding beside it, and the ears and the eyes are small.
function nuralagusModel(b, variant) {
    const palettes = [
        { fur: 0x8a6646, dark: 0x6a4c32, light: 0xb89670, belly: 0xe6d6bc, ear: 0xd99a92, tail: 0xf4efe6 },
        { fur: 0x86807a, dark: 0x625c57, light: 0xaea8a1, belly: 0xe2ddd6, ear: 0xd8a09c, tail: 0xf2f0ec }
    ];
    const c = palettes[variant % palettes.length];
    const furPaint = { color: c.fur, noise: 0.07, all: (p, face) => {
        if (face === 'bottom') { p.fill(c.belly, 0.04); return; }
        if (face === 'top') { p.rect(p.w / 2 - 1, 0, 2, p.h, c.dark, 0.07); return; }
        p.rect(0, p.h - 1.5, p.w, 1.5, c.light, 0.05);
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-3.25, 1.75, -5], size: [6.5, 5.5, 10], paint: furPaint });
    // Its hips: wide, and going nowhere fast.
    const hipPaint = { color: c.fur, noise: 0.07, faces: { bottom: (p) => p.fill(c.belly, 0.04) } };
    b.part('hipL', { parent: 'body', pivot: [3.25, 2, -2.75], from: [0, 0, -2], size: [0.75, 4, 4], paint: hipPaint });
    b.part('hipR', { parent: 'body', pivot: [-3.25, 2, -2.75], from: [-0.75, 0, -2], size: [0.75, 4, 4], paint: hipPaint });

    b.part('head', {
        parent: 'body', pivot: [0, 5, 4.75], from: [-2, -1.25, 0], size: [4, 3.75, 3.75],
        paint: {
            color: c.fur, noise: 0.06,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(c.belly, 0.04); return; }
                if (face === 'top') { p.rect(p.w / 2 - 0.5, 0, 1, p.h, c.dark, 0.06); return; }
                // A pale muzzle; and on each side an eye half the size of a rabbit's.
                if (face === 'front') { p.rect(0.75, 1.75, 2.5, 2, c.belly, 0.03); p.rect(1.75, 3, 0.5, 0.5, 0x7a5a50, 0); return; }
                if (face === 'left') p.rect(2, 1.25, 0.5, 0.5, 0x1c120c, 0);
                if (face === 'right') p.rect(1.25, 1.25, 0.5, 0.5, 0x1c120c, 0);
                if (face === 'left' || face === 'right') p.rect(0, p.h - 1, p.w, 1, c.light, 0.05);
            }
        }
    });
    b.part('nose', { parent: 'head', pivot: [0, 0.75, 3.75], from: [-0.5, -0.25, 0], size: [1, 0.75, 0.25], paint: { color: 0xd88a8a, noise: 0.02, surface: 'smooth' } });
    // Ears half as long as a rabbit's.
    const earPaint = { color: c.fur, noise: 0.05, faces: { front: (p) => p.rect(0.25, 0.25, p.w - 0.5, p.h - 0.5, c.ear, 0.04) } };
    b.part('earL', { parent: 'head', pivot: [1.1, 2.5, 0.75], from: [-0.5, 0, -0.25], size: [1, 2.25, 0.5], paint: earPaint, rotation: [-0.3, 0, -0.2] });
    b.part('earR', { parent: 'head', pivot: [-1.1, 2.5, 0.75], from: [-0.5, 0, -0.25], size: [1, 2.25, 0.5], paint: earPaint, rotation: [-0.3, 0, 0.2] });
    b.part('tail', { parent: 'body', pivot: [0, 5, -5], from: [-1, -1, -1.25], size: [2, 2, 1.5], paint: { color: c.tail, noise: 0.03, surface: 'wool' } });

    // Four short legs under the body, the hind ones as short as the front ones: paws to walk on.
    const legPaint = { color: c.fur, noise: 0.06, all: (p, face) => {
        if (face === 'bottom') { p.fill(c.belly, 0.03); return; }
        if (face !== 'top') p.rect(0, p.h - 0.75, p.w, 0.75, c.light, 0.04);
    } };
    b.part('legFL', { parent: 'body', pivot: [1.9, 2, 3.25], from: [-0.9, -2, -0.9], size: [1.75, 2, 1.75], paint: legPaint });
    b.part('legFR', { parent: 'body', pivot: [-1.9, 2, 3.25], from: [-0.85, -2, -0.9], size: [1.75, 2, 1.75], paint: legPaint });
    b.part('legBL', { parent: 'body', pivot: [2.1, 2, -3], from: [-1, -2, -1.5], size: [2, 2, 3], paint: legPaint });
    b.part('legBR', { parent: 'body', pivot: [-2.1, 2, -3], from: [-1, -2, -1.5], size: [2, 2, 3], paint: legPaint });
    return { legs: ['legFL', 'legFR', 'legBL', 'legBR'], head: 'head', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('nuralagus', {
    info: { eggColor: 0x8a6646, tone: 900, maxHealth: 12, speed: 0.32, variants: 2, grazer: true, hiddenUntilDiscovered: true, ancestorOf: 'rabbit' },
    model: nuralagusModel,
    surface: 'fur',
    drops: [['fur', 1, 2]],
    furry: true,
    // What a rabbit eats. A rabbit bolts before anybody can feed it; this one runs from nobody, and is tamed.
    diet: { foods: ['flower_yellow', 'tall_grass', 'flower_red'], chance: 1 / 3 },
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [], cage: true },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Nuralagus', habitat: 'The island of Menorca, between 5 and 3 million years ago', activity: 'Day', temperament: 'Passive',
        description: 'The king of the rabbits: up to 12 kilograms, 6 times what a wild rabbit weighs. With nothing to flee from on its island, its back grew stiff and its eyes and ears small. It cannot hop: it walks.'
    },
    cardEs: {
        name: 'Nuralagus', habitat: 'La isla de Menorca, hace entre 5 y 3 millones de años',
        description: 'El rey de los conejos: hasta 12 kilos, 6 veces lo que pesa un conejo de monte. Sin nadie de quien huir en su isla, se le quedó la espalda rígida y los ojos y las orejas pequeños. No sabe saltar: camina.'
    }
});
