// Eohippus, the dawn horse: an extinct animal (js/mobSpecies.js) and the ancestor of the horse, found as a
// rare fossil in the deep rock and brought back by the revival machine. A horse the size of a small dog,
// with an arched back, a short face and toes instead of a hoof. It grazes and walks as any ground mob
// (js/game/mobs.js), so the server walks a kept one (js/game/animals.js); it is tamed with what a horse
// eats, and it is far too small to ride: it has no `mount`.

// Faces +z. The horse of js/models.js made small and pushed back to what it was: the rump higher than the
// shoulders, the hind legs longer than the front ones, a short neck and face, and a thin tail with hardly
// any hair. Its toes (four in front, three behind) are smaller than a texel: the guide tells of them.
function eohippusModel(b, variant) {
    const palettes = [
        { coat: 0x8f6a42, dark: 0x5e4329, pale: 0xd3bd97, mark: 0xb4905f, spotted: true },
        { coat: 0x7a5a3c, dark: 0x4a3524, pale: 0xcbb694, mark: 0x54402b, spotted: false }
    ];
    const c = palettes[variant % palettes.length];
    // The marks of a forest animal that hides in the light under the leaves: rows of pale spots along the
    // flanks, or faint dark stripes down them.
    const marks = (p) => {
        if (c.spotted) {
            for (let x = 0.5; x < p.w - 0.25; x += 1.5) {
                p.rect(x, 0.75, 0.5, 0.5, c.mark, 0.03);
                p.rect(x + 0.75, 1.75, 0.5, 0.5, c.mark, 0.03);
            }
        } else {
            for (let x = 0.75; x < p.w - 0.25; x += 1.5) p.rect(x, 0.25, 0.5, p.h - 1.25, c.mark, 0.04);
        }
    };
    const coatPaint = { color: c.coat, noise: 0.06, all: (p, face) => {
        if (face === 'bottom') { p.fill(c.pale, 0.05); return; }
        if (face === 'top') { p.rect(p.w / 2 - 0.5, 0, 1, p.h, c.dark, 0.06); return; }
        if (face === 'left' || face === 'right') {
            marks(p);
            p.rect(0, p.h - 0.75, p.w, 0.75, c.pale, 0.05);
        }
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-2, 3.25, 0], size: [4, 3, 4], paint: coatPaint });
    // The arch of its back: highest over the loins, and down again to the root of the tail.
    b.part('hips', { parent: 'body', pivot: [0, 3.75, -3], from: [-2, 0, 0], size: [4, 3.5, 3], paint: coatPaint });
    b.part('rump', { parent: 'hips', pivot: [0, 0.25, 0], from: [-1.75, 0, -1.25], size: [3.5, 2.5, 1.5], paint: coatPaint });

    b.part('neck', {
        parent: 'body', pivot: [0, 5.4, 3.5], from: [-1.1, -0.75, -1.1], size: [2.2, 3, 2.2], rotation: [0.85, 0, 0],
        paint: { color: c.coat, noise: 0.06, faces: { back: (p) => p.rect(p.w / 2 - 0.5, 0, 1, p.h, c.dark, 0.06), front: (p) => p.rect(0.5, 1, p.w - 1, p.h - 1, c.pale, 0.05) } }
    });
    b.part('head', {
        parent: 'neck', pivot: [0, 2.1, 0], from: [-1.1, -1.1, -0.75], size: [2.2, 2.2, 3.6], rotation: [-0.55, 0, 0],
        paint: {
            color: c.coat, noise: 0.05,
            all: (p, face) => {
                if (face === 'front') { p.fill(c.pale, 0.04); p.rect(0.25, 1, 0.5, 0.5, c.dark, 0); p.rect(1.5, 1, 0.5, 0.5, c.dark, 0); return; }
                if (face === 'bottom') { p.fill(c.pale, 0.04); return; }
                if (face === 'top') { p.rect(0.5, 2.25, 1, p.h - 2.25, c.pale, 0.04); return; }
                if (face !== 'left' && face !== 'right') return;
                // The muzzle paler, and a big dark eye high on the side of the head.
                const muzzle = face === 'left' ? p.w - 1.25 : 0;
                p.rect(muzzle, 0, 1.25, p.h, c.pale, 0.04);
                const eye = face === 'left' ? 1 : p.w - 2;
                p.rect(eye, 0.5, 1, 1, 0x14100c, 0);
                p.rect(eye + (face === 'left' ? 0.5 : 0), 0.5, 0.5, 0.5, 0xffffff, 0);
            }
        }
    });
    const earPaint = { color: c.coat, noise: 0.05, faces: { front: (p) => p.rect(0.25, 0.25, p.w - 0.5, p.h - 0.25, c.pale, 0.03) } };
    b.part('earL', { parent: 'head', pivot: [0.7, 1.1, 0], from: [-0.45, 0, -0.35], size: [0.9, 1.25, 0.7], paint: earPaint, rotation: [-0.15, 0, -0.25] });
    b.part('earR', { parent: 'head', pivot: [-0.7, 1.1, 0], from: [-0.45, 0, -0.35], size: [0.9, 1.25, 0.7], paint: earPaint, rotation: [-0.15, 0, 0.25] });
    b.part('tail', {
        parent: 'rump', pivot: [0, 2.25, -1.25], from: [-0.5, -3.5, -0.5], size: [1, 3.5, 1], rotation: [0.5, 0, 0],
        paint: { color: c.coat, noise: 0.06, all: (p, face) => { if (face === 'bottom') p.fill(c.dark, 0.04); else if (face !== 'top') p.rect(0, p.h - 1.25, p.w, 1.25, c.dark, 0.05); } }
    });

    // Slender legs, paler on the inside, each ending in the small dark hoofs of its toes.
    const legPaint = { color: c.coat, noise: 0.06, all: (p, face) => {
        if (face === 'bottom') { p.fill(0x2a221b, 0.03); return; }
        if (face === 'top') return;
        p.rect(0, p.h - 2, p.w, 1.5, c.pale, 0.05);
        p.rect(0, p.h - 0.5, p.w, 0.5, 0x2a221b, 0.03);
    } };
    b.part('legFL', { parent: 'body', pivot: [1.3, 3.5, 3], from: [-0.6, -3.5, -0.6], size: [1.2, 3.5, 1.2], paint: legPaint });
    b.part('legFR', { parent: 'body', pivot: [-1.3, 3.5, 3], from: [-0.6, -3.5, -0.6], size: [1.2, 3.5, 1.2], paint: legPaint });
    b.part('legBL', { parent: 'body', pivot: [1.3, 4.25, -2.75], from: [-0.7, -4.25, -0.7], size: [1.4, 4.25, 1.4], paint: legPaint });
    b.part('legBR', { parent: 'body', pivot: [-1.3, 4.25, -2.75], from: [-0.7, -4.25, -0.7], size: [1.4, 4.25, 1.4], paint: legPaint });
    return { legs: ['legFL', 'legFR', 'legBL', 'legBR'], head: 'head', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('eohippus', {
    info: { eggColor: 0x8f6a42, tone: 620, maxHealth: 8, speed: 0.6, variants: 2, grazer: true, hiddenUntilDiscovered: true, ancestorOf: 'horse' },
    model: eohippusModel,
    surface: 'fur',
    drops: [['leather', 1, 1]],
    // What tames a horse tames its ancestor, and sooner: it is small and soon at ease.
    diet: { foods: ['tall_grass', 'wheat', 'flower_yellow', 'honeycomb'], chance: 1 / 3 },
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [], cage: true },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Eohippus', habitat: 'Warm forests of North America, about 55 million years ago', activity: 'Day', temperament: 'Passive',
        description: 'The dawn horse: the ancestor of the horse, no bigger than a small dog. It had 4 toes on each front foot and 3 on each hind one, and it ate soft leaves.'
    },
    cardEs: {
        name: 'Eohippus', habitat: 'Bosques cálidos de Norteamérica, hace unos 55 millones de años',
        description: 'El caballo del alba: el antepasado del caballo, no más grande que un perro pequeño. Tenía 4 dedos en cada pata delantera y 3 en cada trasera, y comía hojas tiernas.'
    }
});
