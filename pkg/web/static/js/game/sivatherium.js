// Sivatherium: an extinct animal (js/mobSpecies.js) and an ancient relative of the giraffe, found as a rare
// fossil in the deep rock and brought back by the revival machine. A giraffe built like a moose: a short,
// thick neck, a heavy body on sturdy legs, and two pairs of horns, a small one over the eyes and a broad,
// flat one behind. It grazes and walks as any ground mob (js/game/mobs.js), so the server walks a kept one
// (js/game/animals.js), and it is tamed with the leaves that tame a giraffe. Nothing here is its own but
// its looks and its numbers.

// Faces +z. The giraffe of js/models.js pushed back to its heavy cousin: the shoulders higher than the
// rump, the neck short and leaning forward (it is what the rig swings to look about and to graze), a long
// head with a broad muzzle, and the horns, which are what a child has to see first: two flat plates
// spreading to the sides as a moose's, with points along the top, and two small cones before them.
function sivatheriumModel(b) {
    const coat = 0xb07f4e;
    const patch = 0x8a5a32;
    const dark = 0x5a3a20;
    const pale = 0xe2cfa6;
    const horn = 0x6e4c2e;
    const hornTip = 0xd9c9a2;
    // The blotches of its family, faint: nobody knows its coat, and the giraffe and the okapi are its kin.
    const blotched = { color: coat, noise: 0.06, all: (p, face) => {
        if (face === 'bottom') { p.fill(pale, 0.05); return; }
        p.spots(patch, Math.ceil(p.w * p.h / 16), 1.5, 3, 5);
        if (face === 'left' || face === 'right') p.rect(0, p.h - 1.5, p.w, 1.5, pale, 0.06);
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-5.75, 15, -13], size: [11.5, 12.5, 14], paint: blotched });
    b.part('withers', { parent: 'body', pivot: [0, 0, 0], from: [-6.25, 15, 0.5], size: [12.5, 15, 10], paint: blotched });
    b.part('neck', {
        parent: 'body', pivot: [0, 25.5, 9], from: [-3.75, -2, -3.5], size: [7.5, 11.5, 7], rotation: [0.62, 0, 0],
        paint: { color: coat, noise: 0.06, all: (p, face) => {
            if (face === 'front') { p.fill(pale, 0.05); return; }
            if (face === 'back') { p.rect(p.w / 2 - 1, 0, 2, p.h, dark, 0.07); return; }
            if (face !== 'top' && face !== 'bottom') p.spots(patch, 4, 1.5, 2.5, 5);
        } }
    });
    b.part('mane', { parent: 'neck', pivot: [0, 0, -3.5], from: [-0.75, 0, -1], size: [1.5, 9.5, 1], paint: { color: dark, noise: 0.1 } });
    b.part('head', {
        parent: 'neck', pivot: [0, 9, 0.5], from: [-3.25, -2.75, -3], size: [6.5, 6.5, 7.5], rotation: [-0.37, 0, 0],
        paint: {
            color: coat, noise: 0.05,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(pale, 0.05); return; }
                if (face === 'top') { p.rect(p.w / 2 - 1, 0, 2, p.h, patch, 0.06); return; }
                if (face !== 'left' && face !== 'right') return;
                // A big dark eye with its light, set high and well back, and the cheek paler under it.
                const eye = face === 'left' ? p.w - 3.5 : 2;
                p.rect(eye - 0.25, 1.25, 2, 1.75, dark, 0.04);
                p.rect(eye, 1.5, 1.5, 1.25, 0x14100c, 0);
                p.rect(eye + (face === 'left' ? 1 : 0), 1.5, 0.5, 0.5, 0xffffff, 0);
                p.rect(0, p.h - 1.75, p.w, 1.75, pale, 0.05);
            }
        }
    });
    // The muzzle of a browser: long, broad and soft, with the upper lip hanging over the lower one.
    b.part('muzzle', {
        parent: 'head', pivot: [0, -0.75, 4.5], from: [-2.75, -2.25, 0], size: [5.5, 5, 5],
        paint: {
            color: coat, noise: 0.05,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(pale, 0.05); return; }
                if (face === 'front') {
                    p.fill(0x6b4a34, 0.05);
                    p.rect(0.75, 1, 1.25, 1, 0x1c1410, 0);
                    p.rect(p.w - 2, 1, 1.25, 1, 0x1c1410, 0);
                    p.rect(0.5, 3.75, p.w - 1, 0.25, 0x1c1410, 0);
                    return;
                }
                if (face === 'top') { p.rect(0, p.h - 1.5, p.w, 1.5, 0x6b4a34, 0.05); return; }
                if (face === 'left') { p.rect(p.w - 1.5, 0, 1.5, p.h, 0x6b4a34, 0.05); p.rect(1, 3.75, p.w - 1, 0.25, 0x1c1410, 0); }
                if (face === 'right') { p.rect(0, 0, 1.5, p.h, 0x6b4a34, 0.05); p.rect(0, 3.75, p.w - 1, 0.25, 0x1c1410, 0); }
            }
        }
    });
    const earPaint = { color: coat, noise: 0.05, faces: { front: (p) => p.rect(0.5, 0.25, p.w - 1, p.h - 0.5, 0x4a3220, 0.04) } };
    b.part('earL', { parent: 'head', pivot: [3.25, 1.75, -1.5], from: [0, -0.75, -0.5], size: [3, 1.75, 1], paint: earPaint, rotation: [0, 0, -0.25] });
    b.part('earR', { parent: 'head', pivot: [-3.25, 1.75, -1.5], from: [-3, -0.75, -0.5], size: [3, 1.75, 1], paint: earPaint, rotation: [0, 0, 0.25] });

    // Horns covered in skin, as a giraffe's, with the bare tips paler.
    const hornPaint = { color: horn, noise: 0.07, surface: 'skin' };
    const tipPaint = { color: horn, noise: 0.07, surface: 'skin', all: (p, face) => {
        if (face === 'top') p.fill(hornTip, 0.04);
        else if (face !== 'bottom') p.rect(0, 0, p.w, 1, hornTip, 0.04);
    } };
    ['L', 'R'].forEach((side) => {
        const sign = side === 'L' ? 1 : -1;
        // The small pair, over the eyes.
        b.part('cone' + side, { parent: 'head', pivot: [sign * 1.9, 3.5, 3], from: [-0.75, 0, -0.75], size: [1.5, 2.75, 1.5], paint: tipPaint, rotation: [0.3, 0, -sign * 0.2] });
        // The great pair: a stem leaning out and back, a flat plate on it, and the points along its top.
        b.part('beam' + side, { parent: 'head', pivot: [sign * 2.1, 3.5, -1], from: [-1.1, 0, -1.1], size: [2.2, 3.5, 2.2], paint: hornPaint, rotation: [-0.3, 0, -sign * 0.75] });
        b.part('palm' + side, { parent: 'beam' + side, pivot: [0, 3, 0], from: [sign > 0 ? -3.25 : -1.75, 0, -0.75], size: [5, 4.5, 1.5], paint: hornPaint });
        b.part('tineA' + side, { parent: 'palm' + side, pivot: [-sign * 2.25, 4.5, 0], from: [-0.75, 0, -0.6], size: [1.5, 2.25, 1.2], paint: tipPaint });
        b.part('tineB' + side, { parent: 'palm' + side, pivot: [-sign * 0.1, 4.5, 0], from: [-0.75, 0, -0.6], size: [1.5, 1.5, 1.2], paint: tipPaint });
        b.part('tineC' + side, { parent: 'palm' + side, pivot: [sign * 1.25, 3.25, 0], from: [sign > 0 ? 0 : -1.75, -0.75, -0.6], size: [1.75, 1.5, 1.2], paint: tipPaint });
    });

    b.part('tail', { parent: 'body', pivot: [0, 26.5, -13], from: [-0.6, -9, -0.6], size: [1.2, 9, 1.2], paint: { color: coat, noise: 0.06 }, rotation: [0.12, 0, 0] });
    b.part('tailTuft', { parent: 'tail', pivot: [0, -9, 0], from: [-1, -3, -1], size: [2, 3, 2], paint: { color: dark, noise: 0.1 } });
    // Sturdy legs, pale below the knee with the dark bands of an okapi above it, and dark hoofs.
    const legPaint = { color: coat, noise: 0.06, all: (p, face) => {
        if (face === 'bottom') { p.fill(0x2a2019, 0.03); return; }
        if (face === 'top') return;
        p.rect(0, p.h - 9, p.w, 9, pale, 0.05);
        p.rect(0, p.h - 11.5, p.w, 1, dark, 0.06);
        p.rect(0, p.h - 9.5, p.w, 1, dark, 0.06);
        p.rect(0, p.h - 1.5, p.w, 1.5, 0x2a2019, 0.03);
    } };
    b.part('legFL', { parent: 'body', pivot: [3.75, 19.5, 6.5], from: [-2, -19.5, -2], size: [4, 19.5, 4], paint: legPaint });
    b.part('legFR', { parent: 'body', pivot: [-3.75, 19.5, 6.5], from: [-2, -19.5, -2], size: [4, 19.5, 4], paint: legPaint });
    b.part('legBL', { parent: 'body', pivot: [3.25, 18.5, -10], from: [-2, -18.5, -2], size: [4, 18.5, 4], paint: legPaint });
    b.part('legBR', { parent: 'body', pivot: [-3.25, 18.5, -10], from: [-2, -18.5, -2], size: [4, 18.5, 4], paint: legPaint });
    return { legs: ['legFL', 'legFR', 'legBL', 'legBR'], head: 'neck', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('sivatherium', {
    info: { eggColor: 0xb07f4e, tone: 170, maxHealth: 28, speed: 0.36, grazer: true, hiddenUntilDiscovered: true, ancestorOf: 'giraffe' },
    model: sivatheriumModel,
    surface: 'fur',
    drops: [['leather', 2, 4]],
    // What tames a giraffe tames its cousin, with the same patience.
    diet: { foods: ['acacia_leaves', 'leaves', 'jungle_leaves', 'birch_leaves'], chance: 1 / 4 },
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Sivatherium', habitat: 'Plains and open woods of India and Africa, from 5 million to 1 million years ago', activity: 'Day', temperament: 'Passive',
        description: 'A giraffe built like a moose: a short neck, a heavy body, and 4 horns, the 2 big ones broad and flat. It stood about 2.2 metres at the shoulder and ate leaves and grass.'
    },
    cardEs: {
        name: 'Sivaterio', habitat: 'Llanuras y bosques abiertos de la India y de África, desde hace 5 millones hasta hace 1 millón de años',
        description: 'Una jirafa con cuerpo de alce: el cuello corto, el cuerpo pesado y 4 cuernos, los 2 grandes anchos y planos. Medía unos 2,2 metros hasta el hombro y se alimentaba de hojas y de hierba.'
    }
});
