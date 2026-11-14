// Smilodon, the sabre-toothed cat: an extinct animal (js/mobSpecies.js) and an ancient relative of the cat,
// found as a rare fossil in the deep rock and brought back by the revival machine. As heavy as a tiger and
// built like a bear, with two canines as long as kitchen knives. It is a hunter: it walks, chases and
// bites as any hostile ground mob (js/game/mobs.js), so the server walks a kept one and says whom it is
// after, the same player for everybody (js/game/animals.js). It comes from nearer than the dire wolf and
// runs a little slower, and its bite is worse. Nothing here is its own but its looks and its numbers.

// Faces +z. No cat of js/models.js grown big: the shoulders higher and far heavier than the hips, thick
// front legs, a short neck, a bob of a tail, and the two sabres hanging from the upper jaw well below the
// chin, which is what a child has to see first.
function smilodonModel(b) {
    const coat = 0xc79a5a;
    const back = 0xa67a40;
    const pale = 0xead7ae;
    const dapple = 0xb08548;
    const ivory = 0xf7f1dc;
    const black = 0x17120e;
    // Tawny, darker along the back with a few faint spots, pale under the belly.
    const hide = { color: coat, noise: 0.07, all: (p, face) => {
        if (face === 'bottom') { p.fill(pale, 0.05); return; }
        if (face === 'top') { p.fill(back, 0.07); p.spots(dapple, Math.ceil(p.w * p.h / 16), 0.75, 1.25, 3); return; }
        if (face === 'left' || face === 'right') {
            p.rect(0, 0, p.w, 1.5, back, 0.07);
            p.spots(dapple, Math.ceil(p.w * p.h / 20), 0.75, 1.25, 7);
            p.rect(0, p.h - 2, p.w, 2, pale, 0.06);
        }
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-4, 8.5, -11], size: [8, 6.5, 11.5], paint: hide });
    // The shoulders: where its strength was, to hold its prey down.
    b.part('shoulders', { parent: 'body', pivot: [0, 0, 0], from: [-4.75, 7.75, 0], size: [9.5, 9, 8.5], paint: { ...hide, faces: { front: (p) => p.rect(1.5, 3, p.w - 3, p.h - 3, pale, 0.06) } } });
    b.part('neck', {
        parent: 'body', pivot: [0, 13, 8.5], from: [-3.25, -3.25, 0], size: [6.5, 6.5, 2],
        paint: { color: coat, noise: 0.07, all: (p, face) => {
            if (face === 'top') { p.fill(back, 0.07); return; }
            if (face !== 'bottom') p.rect(0, p.h - 2, p.w, 2, pale, 0.06);
            else p.fill(pale, 0.05);
        } }
    });

    b.part('head', {
        parent: 'body', pivot: [0, 13.25, 10], from: [-3.75, -3, 0], size: [7.5, 6.5, 5.5],
        paint: {
            color: coat, noise: 0.06,
            all: (p, face) => {
                if (face === 'top') { p.rect(2.5, 0, 2, p.h, back, 0.06); return; }
                if (face === 'bottom') { p.fill(pale, 0.05); return; }
                if (face === 'front') {
                    // Green-gold eyes under a heavy brow, with the dark tear line of a big cat down to the muzzle.
                    p.rect(0.5, 1, p.w - 1, 0.5, back, 0.05);
                    p.rect(0.75, 1.5, 1.75, 1.25, 0xd8c23a, 0);
                    p.rect(p.w - 2.5, 1.5, 1.75, 1.25, 0xd8c23a, 0);
                    p.rect(1.5, 1.5, 0.5, 1.25, black, 0);
                    p.rect(p.w - 2, 1.5, 0.5, 1.25, black, 0);
                    p.rect(1.25, 2.75, 0.5, 1.25, 0x5a3f22, 0.03);
                    p.rect(p.w - 1.75, 2.75, 0.5, 1.25, 0x5a3f22, 0.03);
                    return;
                }
                if (face !== 'left' && face !== 'right') return;
                p.rect(0, p.h - 2.25, p.w, 2.25, pale, 0.05);
                const eye = face === 'left' ? p.w - 1.25 : 0.5;
                p.rect(eye, 1.5, 0.75, 1.25, 0xd8c23a, 0);
                p.rect(eye + (face === 'left' ? 0.25 : 0), 1.5, 0.5, 1.25, black, 0);
            }
        }
    });
    b.part('muzzle', {
        parent: 'head', pivot: [0, -1, 5.5], from: [-3, -2, 0], size: [6, 3.75, 2.75],
        paint: {
            color: pale, noise: 0.05,
            all: (p, face) => {
                if (face === 'top') { p.fill(coat, 0.06); p.rect(2, p.h - 1, 2, 1, 0x4a2f2a, 0); return; }
                if (face === 'front') {
                    // The nose, the cleft under it, and the dots the whiskers grow from.
                    p.rect(2, 0, 2, 1.25, 0x4a2f2a, 0);
                    p.rect(2.75, 1.25, 0.5, 1.5, 0x6b4a3a, 0);
                    for (const x of [0.5, 1.25, 4.25, 5]) p.rect(x, 2, 0.5, 0.5, 0x6b4a3a, 0);
                    return;
                }
                if (face === 'left' || face === 'right') p.rect(0, 3, p.w, 0.25, 0x4a2f2a, 0);
            }
        }
    });
    // The lower jaw, narrow enough to pass between the sabres.
    b.part('jaw', { parent: 'head', pivot: [0, -3, 5.25], from: [-1.5, -1.25, 0], size: [3, 1.25, 2.5], paint: { color: pale, noise: 0.05, faces: { top: (p) => p.fill(0x7a3b36, 0.04) } } });
    // The sabres: flat blades, wider front to back than side to side, each ending in a point.
    const sabrePaint = { color: ivory, noise: 0.02, surface: 'smooth', bevel: 0.05, faces: { top: (p) => p.fill(0x8a4a44, 0.03) } };
    ['L', 'R'].forEach((side) => {
        const sign = side === 'L' ? 1 : -1;
        b.part('sabre' + side, { parent: 'muzzle', pivot: [sign * 2.3, -1.75, 1.5], from: [-0.7, -3.5, -0.9], size: [1.4, 3.5, 1.8], paint: sabrePaint, rotation: [-0.12, 0, 0] });
        b.part('sabreTip' + side, { parent: 'sabre' + side, pivot: [0, -3.5, 0], from: [-0.45, -2.25, -0.7], size: [0.9, 2.25, 1.2], paint: { color: ivory, noise: 0.02, surface: 'smooth', bevel: 0.05 } });
    });
    const earPaint = { color: back, noise: 0.06, faces: { front: (p) => p.rect(0.5, 0.5, p.w - 1, p.h - 0.5, 0x5a3f22, 0.04) } };
    b.part('earL', { parent: 'head', pivot: [2.85, 3.5, 1.25], from: [-1, 0, -0.5], size: [2, 1.5, 1], paint: earPaint, rotation: [0, 0, -0.25] });
    b.part('earR', { parent: 'head', pivot: [-2.85, 3.5, 1.25], from: [-1, 0, -0.5], size: [2, 1.5, 1], paint: earPaint, rotation: [0, 0, 0.25] });

    b.part('tail', {
        parent: 'body', pivot: [0, 14, -11], from: [-1, -1, -3.5], size: [2, 2, 3.5], rotation: [-0.5, 0, 0],
        paint: { color: coat, noise: 0.07, faces: { back: (p) => p.fill(0x5a3f22, 0.05), top: (p) => p.fill(back, 0.07) } }
    });
    // Front legs thicker and longer than the hind ones, with broad paws.
    const legPaint = { color: coat, noise: 0.07, all: (p, face) => {
        if (face === 'bottom') { p.fill(0x3a2a1c, 0.04); return; }
        if (face === 'top') return;
        p.rect(0, p.h - 1.5, p.w, 1.5, pale, 0.05);
        if (face === 'front') for (let x = 0.75; x < p.w - 0.5; x += 1) p.rect(x, p.h - 1, 0.25, 1, 0x6b4a3a, 0);
    } };
    b.part('legFL', { parent: 'body', pivot: [3, 9.5, 5.5], from: [-1.75, -9.5, -1.75], size: [3.5, 9.5, 3.5], paint: legPaint });
    b.part('legFR', { parent: 'body', pivot: [-3, 9.5, 5.5], from: [-1.75, -9.5, -1.75], size: [3.5, 9.5, 3.5], paint: legPaint });
    b.part('legBL', { parent: 'body', pivot: [2.6, 9, -8.5], from: [-1.5, -9, -1.5], size: [3, 9, 3], paint: legPaint });
    b.part('legBR', { parent: 'body', pivot: [-2.6, 9, -8.5], from: [-1.5, -9, -1.5], size: [3, 9, 3], paint: legPaint });
    return { legs: ['legFL', 'legFR', 'legBL', 'legBR'], head: 'head', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('smilodon', {
    info: { eggColor: 0xc79a5a, tone: 110, hostile: true, chaseDistance: 12, attackDamage: 5, maxHealth: 20, speed: 0.42, chaseSpeed: 2, hiddenUntilDiscovered: true, ancestorOf: 'cat' },
    model: smilodonModel,
    surface: 'fur',
    drops: [['fur', 1, 2], ['leather', 1, 1, 0.5]],
    // No diet: a hunter is not tamed. No bait: one the server walks goes where the server says.
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Smilodon', habitat: 'Plains and woods of the Americas, from 2.5 million to 10,000 years ago', activity: 'Day and night', temperament: 'Hostile',
        description: 'The sabre-toothed cat: as heavy as a tiger, with two canines up to 28 centimetres long. It did not chase far: it waited, pounced and held its prey down with its huge front legs. It hits hard.'
    },
    cardEs: {
        name: 'Esmilodón', habitat: 'Llanuras y bosques de América, desde hace 2,5 millones hasta hace 10 000 años',
        description: 'El felino de dientes de sable: tan pesado como un tigre, con dos colmillos de hasta 28 centímetros de largo. No perseguía lejos: esperaba, saltaba y sujetaba a su presa con sus enormes patas delanteras. Pega fuerte.'
    }
});
