// Vegavis: an extinct animal (js/mobSpecies.js) and an ancient relative of the duck, found as a rare fossil
// in the deep rock and brought back by the revival machine. A bird of Antarctica that lived when the last
// dinosaurs did, and one of the very few birds of that age that belong with those of today: with the ducks
// and the geese. It dived and swam with its feet, like a loon. In the game it is a small duck of the ground:
// it walks and dabbles as any ground mob (js/game/mobs.js), so the server walks a kept one
// (js/game/animals.js), and it is tamed with what a duck eats.

// Faces +z. The duck of js/models.js made slimmer and lower, as a bird that dives: a long body, legs set
// far back with broad webbed feet, a neck that leans forward and a narrow pointed bill where the duck has a
// flat one. Dark above and pale below, as most birds that swim. Every size is a number of quarters of a
// unit: a texel is half a unit, and a smaller box is not painted.
function vegavisModel(b, variant) {
    const palettes = [
        { back: 0x5c5043, side: 0x7b6a54, belly: 0xe8e0cb, head: 0x473d33, cheek: 0xa8693a, bill: 0x7d8890, foot: 0xc88a4c },
        { back: 0x565c62, side: 0x7b8288, belly: 0xe9e9e0, head: 0x33393e, cheek: 0xe2e2d8, bill: 0x4c4f52, foot: 0xb9a07a }
    ];
    const c = palettes[variant % palettes.length];
    b.part('body', {
        pivot: [0, 0, 0], from: [-2, 2, -3.5], size: [4, 3.25, 7],
        paint: { color: c.side, noise: 0.07, all: (p, face) => {
            if (face === 'top') { p.fill(c.back, 0.07); return; }
            if (face === 'bottom' || face === 'front') { p.fill(c.belly, 0.05); return; }
            if (face === 'left' || face === 'right') { p.rect(0, 0, p.w, 1, c.back, 0.07); p.rect(0, p.h - 1.25, p.w, 1.25, c.belly, 0.05); }
        } }
    });
    b.part('tail', { parent: 'body', pivot: [0, 4.75, -3.5], from: [-1.25, -0.5, -1.5], size: [2.5, 1, 1.5], paint: { color: c.back, noise: 0.07 }, rotation: [0.35, 0, 0] });
    const wingPaint = { color: c.back, noise: 0.08, all: (p, face) => { if (face === 'left' || face === 'right') p.rect(0, p.h - 0.75, p.w, 0.5, c.belly, 0.04); } };
    b.part('wingL', { parent: 'body', pivot: [2, 5, 0.5], from: [0, -2.5, -3], size: [0.75, 2.5, 5.5], paint: wingPaint });
    b.part('wingR', { parent: 'body', pivot: [-2, 5, 0.5], from: [-0.75, -2.5, -3], size: [0.75, 2.5, 5.5], paint: wingPaint });
    b.part('neck', {
        parent: 'body', pivot: [0, 4.75, 2.75], from: [-1, -0.5, -1], size: [2, 2, 2], rotation: [0.25, 0, 0],
        paint: { color: c.head, noise: 0.06, faces: { front: (p) => p.fill(c.cheek, 0.05) } }
    });
    b.part('head', {
        parent: 'neck', pivot: [0, 1.5, 0.25], from: [-1.25, -0.25, -1.25], size: [2.5, 2, 3], rotation: [-0.25, 0, 0],
        paint: { color: c.head, noise: 0.05, all: (p, face) => {
            if (face === 'bottom') { p.fill(c.cheek, 0.05); return; }
            if (face !== 'left' && face !== 'right') return;
            // A patch of colour on the cheek, and a small bright eye.
            const cheek = face === 'left' ? p.w - 2 : 0;
            p.rect(cheek, 1, 2, 1, c.cheek, 0.05);
            const eye = face === 'left' ? p.w - 1.5 : 1;
            p.rect(eye, 0.5, 0.5, 0.5, 0x0f0c0a, 0);
        } }
    });
    // The bill: narrow and pointed, for catching, not flat for sifting mud.
    b.part('bill', { parent: 'head', pivot: [0, 0.5, 1.75], from: [-0.5, -0.5, 0], size: [1, 0.75, 1.75], paint: { color: c.bill, noise: 0.03, surface: 'smooth' } });
    b.part('billTip', { parent: 'bill', pivot: [0, -0.25, 1.75], from: [-0.25, -0.25, 0], size: [0.5, 0.5, 1], paint: { color: 0x2c2c2e, noise: 0.02, surface: 'smooth' } });
    const legPaint = { color: c.foot, noise: 0.04, surface: 'skin' };
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`leg${side}`, { parent: 'body', pivot: [sign, 2, -1], from: [-0.375, -2, -0.375], size: [0.75, 2, 0.75], paint: legPaint });
        b.part(`foot${side}`, {
            parent: `leg${side}`, pivot: [0, -2, 0], from: [-1, 0, -0.75], size: [2, 0.5, 2.5],
            paint: { color: c.foot, noise: 0.04, surface: 'skin', faces: { top: (p) => { p.rect(0.5, 1, 0.25, p.h - 1, 0x7a5a36, 0); p.rect(1.25, 1, 0.25, p.h - 1, 0x7a5a36, 0); } } }
        });
    });
    return { legs: ['legL', 'legR'], wings: ['wingL', 'wingR'], head: 'neck', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('vegavis', {
    info: { eggColor: 0x6b5d4a, tone: 560, maxHealth: 8, speed: 0.5, variants: 2, grazer: true, hiddenUntilDiscovered: true, ancestorOf: 'duck' },
    model: vegavisModel,
    surface: 'feather',
    drops: [['feather', 1, 2]],
    sheds: ['feather', 0.4, 8],
    molts: true,
    // What tames a duck tames its ancient cousin.
    diet: { foods: ['tall_grass', 'wheat_seeds', 'raw_fish', 'flower_yellow'], chance: 1 / 3 },
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [], cage: true },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Vegavis', habitat: 'Shores of Antarctica, about 68 million years ago', activity: 'Day', temperament: 'Passive',
        description: 'A diving bird the size of a duck that lived alongside the last dinosaurs, when Antarctica was green. It is one of the oldest known cousins of ducks and geese. It waddles about and dabbles, and it harms nobody.'
    },
    cardEs: {
        name: 'Vegavis', habitat: 'Costas de la Antártida, hace unos 68 millones de años',
        description: 'Un ave buceadora del tamaño de un pato que vivió junto a los últimos dinosaurios, cuando la Antártida era verde. Es uno de los primos más antiguos que se conocen de los patos y los gansos. Pasea, picotea el suelo y no hace daño a nadie.'
    }
});
