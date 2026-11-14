// Myotragus, the mouse-goat of Mallorca and Menorca: an extinct animal (js/mobSpecies.js) and an ancient
// relative of the goat, found as a rare fossil in the deep rock and brought back by the revival machine. A
// goat half a block tall that lived for millions of years on islands with nothing to run from: short thick
// legs, both eyes looking straight ahead, and two front teeth that never stopped growing, like a mouse's.
// It walks slowly and grazes as any ground mob (js/game/mobs.js), so the server walks a kept one
// (js/game/animals.js); it is tamed with what a goat eats. It does not climb or ram: it had forgotten how.

// Faces +z. The goat of js/models.js made small and pushed back to what it was: a barrel of a body close
// to the ground, a short round head, and what made it different on the front of that head: the two eyes,
// side by side as a monkey's, and under the muzzle the pair of long teeth.
function myotragusModel(b, variant) {
    const palettes = [
        { coat: 0x9a6f48, shade: 0x6e4c30, pale: 0xdcc7a0, horn: 0x3a322a, hoof: 0x2a221c },
        { coat: 0x6f6259, shade: 0x4a403a, pale: 0xc9bca6, horn: 0x2c2826, hoof: 0x211c19 }
    ];
    const c = palettes[variant % palettes.length];
    const eye = 0x17110c;
    const coatPaint = { color: c.coat, noise: 0.08, all: (p, face) => {
        if (face === 'bottom') { p.fill(c.pale, 0.06); return; }
        if (face === 'top') { p.rect(p.w / 2 - 0.5, 0, 1, p.h, c.shade, 0.07); return; }
        p.rect(0, p.h - 1, p.w, 1, c.pale, 0.06);
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-2.25, 2.5, -3.5], size: [4.5, 3.5, 7], paint: coatPaint });
    // The shoulders, a little higher than the rump: it carried its head low.
    b.part('withers', { parent: 'body', pivot: [0, 6, 1.75], from: [-1.75, 0, -1.5], size: [3.5, 0.5, 3], paint: { color: c.coat, noise: 0.08, faces: { top: (p) => p.rect(p.w / 2 - 0.5, 0, 1, p.h, c.shade, 0.07) } } });

    b.part('head', {
        parent: 'body', pivot: [0, 5.5, 3.25], from: [-1.75, -1, -0.25], size: [3.5, 3, 3.25],
        paint: {
            color: c.coat, noise: 0.06,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(c.pale, 0.05); return; }
                if (face === 'top') { p.rect(p.w / 2 - 0.5, 0, 1, p.h, c.shade, 0.06); return; }
                if (face !== 'front') return;
                // Its face: a pale mask, and in it the two eyes, looking where its nose points.
                p.rect(0, 0.5, p.w, 1.5, c.pale, 0.04);
                p.rect(0.5, 0.5, 1, 1, eye, 0);
                p.rect(2, 0.5, 1, 1, eye, 0);
                p.rect(0.5, 0.5, 0.5, 0.5, 0xffffff, 0);
                p.rect(2, 0.5, 0.5, 0.5, 0xffffff, 0);
            }
        }
    });
    b.part('muzzle', {
        parent: 'head', pivot: [0, -1, 3], from: [-1.25, 0, 0], size: [2.5, 1.5, 1],
        paint: { color: c.pale, noise: 0.05, faces: { front: (p) => { p.rect(0.5, 0, 1.5, 0.5, c.shade, 0.03); }, top: (p) => p.fill(c.coat, 0.06) } }
    });
    // The two front teeth, growing for as long as it lived: no other goat has had them.
    b.part('teeth', {
        parent: 'muzzle', pivot: [0, 0, 1], from: [-0.75, -0.75, -0.5], size: [1.5, 1, 0.5],
        paint: { color: 0xf1e6bd, noise: 0.02, surface: 'smooth', faces: { front: (p) => p.rect(0.5, 0, 0.5, p.h, 0x8a7a52, 0) } }
    });
    // Short horns, leaning back.
    const hornPaint = { color: c.horn, noise: 0.05, surface: 'smooth' };
    b.part('hornL', { parent: 'head', pivot: [1, 2, 1], from: [-0.4, 0, -0.4], size: [0.75, 1.5, 0.75], paint: hornPaint, rotation: [-0.85, 0, -0.2] });
    b.part('hornR', { parent: 'head', pivot: [-1, 2, 1], from: [-0.35, 0, -0.4], size: [0.75, 1.5, 0.75], paint: hornPaint, rotation: [-0.85, 0, 0.2] });
    const earPaint = { color: c.coat, noise: 0.06, faces: { front: (p) => p.fill(c.pale, 0.04) } };
    b.part('earL', { parent: 'head', pivot: [1.75, 1.25, 0.5], from: [0, -0.5, -0.5], size: [1.25, 0.75, 1], paint: earPaint, rotation: [0, 0, 0.25] });
    b.part('earR', { parent: 'head', pivot: [-1.75, 1.25, 0.5], from: [-1.25, -0.5, -0.5], size: [1.25, 0.75, 1], paint: earPaint, rotation: [0, 0, -0.25] });
    b.part('tail', { parent: 'body', pivot: [0, 5.75, -3.5], from: [-0.5, -1.25, -0.75], size: [1, 1.5, 0.75], paint: { color: c.shade, noise: 0.07 }, rotation: [0.3, 0, 0] });

    // Legs like posts: short, thick, and made to carry it, not to run.
    const legs = VoxelModels.quadLegs(b, {
        size: [1.5, 2.75, 1.5], hipY: 2.75, x: 1.4, zFront: 2.25, zBack: -2.5,
        paint: { color: c.coat, noise: 0.07, all: (p, face) => {
            if (face === 'bottom') { p.fill(c.hoof, 0.03); return; }
            if (face !== 'top') { p.rect(0, p.h - 1.5, p.w, 1, c.shade, 0.06); p.rect(0, p.h - 0.5, p.w, 0.5, c.hoof, 0.03); }
        } }
    });
    return { legs, head: 'head', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('myotragus', {
    info: { eggColor: 0x9a6f48, tone: 480, maxHealth: 10, speed: 0.3, variants: 2, grazer: true, hiddenUntilDiscovered: true, ancestorOf: 'goat' },
    model: myotragusModel,
    surface: 'fur',
    drops: [['leather', 1, 1]],
    furry: true,
    // What tames a goat tames its little cousin of the islands.
    diet: { foods: ['leaves', 'tall_grass', 'wheat'], chance: 1 / 3 },
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [], cage: true },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Myotragus', habitat: 'The islands of Mallorca and Menorca, until about 4300 years ago', activity: 'Day', temperament: 'Passive',
        description: 'The mouse-goat: a goat half a block tall, with short legs, both eyes facing forward and 2 front teeth that never stopped growing. It walks slowly: on its islands nothing hunted it.'
    },
    cardEs: {
        name: 'Myotragus', habitat: 'Las islas de Mallorca y Menorca, hasta hace unos 4300 años',
        description: 'La cabra-ratón: una cabra de medio bloque de alto, con las patas cortas, los ojos mirando al frente y 2 dientes delanteros que no paraban de crecer. Camina despacio: en sus islas nadie la cazaba.'
    }
});
