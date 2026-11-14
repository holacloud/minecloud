// The dire wolf: an extinct animal (js/mobSpecies.js) and an ancient relative of the dog, found as a rare
// fossil in the deep rock and brought back by the revival machine. A wolf of the Ice Age, heavier than any
// wolf of today, with a broad head and a deep chest. It is a hunter: it walks, chases and bites as any
// hostile ground mob (js/game/mobs.js), so the server walks a kept one and says whom it is after, the same
// player for everybody (js/game/animals.js). Nothing here is its own but its looks and its numbers.

// Faces +z. The dog of js/models.js made into a wolf and pushed back to what it was: a deep chest in
// front of narrower loins, the hackles standing over the shoulders, a broad head carried level with the
// back, pointed ears, pale cheeks, amber eyes, and a bushy tail that hangs instead of curling up.
function direWolfModel(b) {
    const fur = 0x857a6c;
    const dark = 0x4a433b;
    const pale = 0xc7bba6;
    const cream = 0xddd3c0;
    const black = 0x16120f;
    // Grey-brown, darker along the back and pale under the belly.
    const coat = { color: fur, noise: 0.09, all: (p, face) => {
        if (face === 'bottom') { p.fill(pale, 0.06); return; }
        if (face === 'top') { p.fill(dark, 0.1); p.rect(0, 0, 1, p.h, fur, 0.09); p.rect(p.w - 1, 0, 1, p.h, fur, 0.09); return; }
        if (face === 'left' || face === 'right') { p.rect(0, 0, p.w, 1, dark, 0.1); p.rect(0, p.h - 1.5, p.w, 1.5, pale, 0.07); }
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-3, 6.25, -6.5], size: [6, 5.5, 8], paint: coat });
    b.part('chest', { parent: 'body', pivot: [0, 0, 0], from: [-3.75, 5.5, 1], size: [7.5, 7, 5], paint: { ...coat, faces: { front: (p) => p.rect(1, 2.5, p.w - 2, p.h - 2.5, pale, 0.07) } } });
    b.part('hackles', { parent: 'body', pivot: [0, 12.5, 3.5], from: [-2, 0, -3], size: [4, 0.75, 5.5], paint: { color: dark, noise: 0.12 } });
    b.part('neck', {
        parent: 'body', pivot: [0, 10, 6], from: [-3, -2.75, 0], size: [6, 5.25, 2],
        paint: { color: fur, noise: 0.09, all: (p, face) => {
            if (face === 'top') { p.fill(dark, 0.1); return; }
            if (face === 'bottom') { p.fill(cream, 0.05); return; }
            p.rect(0, p.h - 2, p.w, 2, cream, 0.06);
        } }
    });

    b.part('head', {
        parent: 'body', pivot: [0, 10.25, 7.5], from: [-3.5, -2.5, 0], size: [7, 5.5, 4], rotation: [0.1, 0, 0],
        paint: {
            color: fur, noise: 0.08,
            all: (p, face) => {
                if (face === 'top') { p.rect(1.25, 0, p.w - 2.5, p.h, dark, 0.09); return; }
                if (face === 'bottom') { p.fill(cream, 0.05); return; }
                if (face === 'front') {
                    // Amber eyes under a dark brow that comes down towards the muzzle, as a frown, and the pale
                    // cheeks of a wolf to each side.
                    p.rect(0, 3, 1.75, 2.5, cream, 0.05);
                    p.rect(p.w - 1.75, 3, 1.75, 2.5, cream, 0.05);
                    p.rect(0.5, 1, 2, 0.5, dark, 0.06);
                    p.rect(p.w - 2.5, 1, 2, 0.5, dark, 0.06);
                    p.rect(2, 1.5, 0.75, 0.5, dark, 0.06);
                    p.rect(p.w - 2.75, 1.5, 0.75, 0.5, dark, 0.06);
                    p.rect(0.75, 1.5, 1.5, 1, 0xe2a422, 0);
                    p.rect(p.w - 2.25, 1.5, 1.5, 1, 0xe2a422, 0);
                    p.rect(1.25, 1.5, 0.5, 1, black, 0);
                    p.rect(p.w - 1.75, 1.5, 0.5, 1, black, 0);
                    return;
                }
                if (face !== 'left' && face !== 'right') return;
                // The ruff of the cheek, pale and low, and the eye again where the side shows it.
                p.rect(0, 2.75, p.w, 2.75, cream, 0.06);
                const eye = face === 'left' ? p.w - 1.5 : 0.5;
                p.rect(eye, 1.5, 1, 1, 0xe2a422, 0);
                p.rect(eye + (face === 'left' ? 0.5 : 0), 1.5, 0.5, 1, black, 0);
                p.rect(eye - 0.25, 1, 1.5, 0.5, dark, 0.06);
            }
        }
    });
    b.part('snout', {
        parent: 'head', pivot: [0, -1.25, 4], from: [-1.75, -1.25, 0], size: [3.5, 2.75, 3.25],
        paint: {
            color: pale, noise: 0.06,
            all: (p, face) => {
                if (face === 'top') { p.fill(fur, 0.08); p.rect(1, p.h - 1, 1.5, 1, black, 0); return; }
                if (face === 'front') { p.rect(1, 0, 1.5, 1, black, 0); p.rect(1.5, 1, 0.5, 0.75, 0x2a211c, 0); p.rect(0.75, 1.75, 2, 0.25, 0x2a211c, 0); return; }
                if (face !== 'left' && face !== 'right') return;
                // The line of the mouth, and a fang showing under the lip.
                p.rect(0, 1.75, p.w, 0.25, 0x2a211c, 0);
                p.rect(face === 'left' ? p.w - 1.25 : 0.75, 2, 0.5, 0.75, 0xfffbee, 0);
            }
        }
    });
    const earPaint = { color: dark, noise: 0.08, faces: { front: (p) => p.rect(0.5, 0.5, p.w - 1, p.h - 0.5, 0x9a8474, 0.05) } };
    b.part('earL', { parent: 'head', pivot: [2.4, 3, 1.25], from: [-1, 0, -0.5], size: [2, 2, 1], paint: earPaint, rotation: [-0.1, 0, -0.2] });
    b.part('earR', { parent: 'head', pivot: [-2.4, 3, 1.25], from: [-1, 0, -0.5], size: [2, 2, 1], paint: earPaint, rotation: [-0.1, 0, 0.2] });

    b.part('tail', {
        parent: 'body', pivot: [0, 10.75, -6.5], from: [-1.25, -1.25, -6], size: [2.5, 2.5, 6], rotation: [-0.8, 0, 0],
        paint: { color: fur, noise: 0.1, all: (p, face) => {
            if (face === 'back') { p.fill(black, 0.06); return; }
            if (face === 'top') { p.fill(dark, 0.1); p.rect(0, 0, p.w, 1.5, black, 0.06); return; }
            if (face === 'bottom') { p.rect(0, p.h - 1.5, p.w, 1.5, black, 0.06); return; }
            if (face === 'left') p.rect(0, 0, 1.5, p.h, black, 0.06);
            if (face === 'right') p.rect(p.w - 1.5, 0, 1.5, p.h, black, 0.06);
        } }
    });
    // Long legs for running all day: pale on the way down, with dark paws.
    const legPaint = { color: fur, noise: 0.08, all: (p, face) => {
        if (face === 'bottom') { p.fill(black, 0.04); return; }
        if (face === 'top') return;
        p.rect(0, 3.5, p.w, p.h - 3.5, pale, 0.07);
        p.rect(0, p.h - 0.75, p.w, 0.75, 0x3a322c, 0.05);
    } };
    b.part('legFL', { parent: 'body', pivot: [2.45, 6.5, 4], from: [-1.25, -6.5, -1.25], size: [2.5, 6.5, 2.5], paint: legPaint });
    b.part('legFR', { parent: 'body', pivot: [-2.45, 6.5, 4], from: [-1.25, -6.5, -1.25], size: [2.5, 6.5, 2.5], paint: legPaint });
    b.part('legBL', { parent: 'body', pivot: [1.9, 6.5, -4.75], from: [-1.2, -6.5, -1.2], size: [2.4, 6.5, 2.4], paint: legPaint });
    b.part('legBR', { parent: 'body', pivot: [-1.9, 6.5, -4.75], from: [-1.2, -6.5, -1.2], size: [2.4, 6.5, 2.4], paint: legPaint });
    return { legs: ['legFL', 'legFR', 'legBL', 'legBR'], head: 'head', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('dire_wolf', {
    info: { eggColor: 0x857a6c, tone: 150, hostile: true, attackDamage: 3, maxHealth: 16, speed: 0.5, chaseSpeed: 2.4, hiddenUntilDiscovered: true, ancestorOf: 'dog' },
    model: direWolfModel,
    surface: 'fur',
    drops: [['fur', 1, 2]],
    // No diet: a hunter is not tamed. No bait: one the server walks goes where the server says.
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Dire wolf', habitat: 'Plains and woods of the Americas, from 125,000 to 10,000 years ago', activity: 'Day and night', temperament: 'Hostile',
        description: 'A wolf of the Ice Age, heavier than any wolf of today, with a broad head and jaws that could crack bone. It hunted horses and bison in packs. It runs at whoever comes near, and it bites.'
    },
    cardEs: {
        name: 'Lobo terrible', habitat: 'Llanuras y bosques de América, desde hace 125 000 hasta hace 10 000 años',
        description: 'Un lobo de la Edad de Hielo, más pesado que cualquier lobo de hoy, con la cabeza ancha y unas mandíbulas que partían huesos. Cazaba caballos y bisontes en manada. Corre hacia quien se acerca, y muerde.'
    }
});
