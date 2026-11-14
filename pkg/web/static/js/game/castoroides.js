// Castoroides, the giant beaver: an extinct animal (js/mobSpecies.js) and an ancient relative of the beaver
// (js/game/beaver.js), found as a rare fossil in the deep rock and brought back by the revival machine. A
// beaver the size of a black bear, with incisors as long as a hand. It walks as any ground mob
// (js/game/mobs.js), so the server walks a kept one (js/game/animals.js). It builds nothing: the trees, the
// dams and the lodges are the living beaver's, and scientists think the giant one felled no trees at all.
// Nothing here is its own but its looks and its numbers.

// Faces +z. The beaver of js/game/beaver.js grown to the size of a bear: a high, round back, a big blunt
// head, the two orange incisors (what a child has to see first), small front paws, wide hind feet, and a
// tail that is flat as the beaver's but longer and narrower.
function castoroidesModel(b) {
    const fur = 0x5f3d26;
    const back = 0x432a1a;
    const belly = 0x8f6844;
    const muzzle = 0x7d573a;
    const tailDark = 0x2a211d;
    const tailScale = 0x45382f;
    const foot = 0x2f231c;
    const coat = (extra) => ({ color: fur, noise: 0.08, ...extra });
    // Rows of small plates offset like bricks, as on the beaver's tail.
    const scales = (p) => {
        for (let row = 0, y = 0.2; y < p.h; row++, y += 1) {
            for (let x = (row % 2) * 0.5 - 0.5; x < p.w; x += 1) p.rect(Math.max(0, x + 0.12), y, 0.76, 0.7, tailScale, 0.05);
        }
    };
    const sides = (p) => p.rect(0, p.h - 2.5, p.w, 2.5, belly, 0.06);
    b.part('body', {
        pivot: [0, 0, 0], from: [-5.5, 3.5, -9], size: [11, 11.5, 17],
        paint: coat({ faces: { top: (p) => p.fill(back, 0.08), bottom: (p) => p.fill(belly, 0.05), left: sides, right: sides, front: (p) => p.rect(2, 5, p.w - 4, p.h - 5, belly, 0.06) } })
    });
    // The round of its back, highest over the hips.
    b.part('hump', { parent: 'body', pivot: [0, 15, -1], from: [-4.75, 0, -7], size: [9.5, 1.25, 14.5], paint: { color: back, noise: 0.09 } });
    b.part('humpTop', { parent: 'hump', pivot: [0, 1.25, -1], from: [-3.5, 0, -4.5], size: [7, 0.9, 9.5], paint: { color: back, noise: 0.09 } });
    b.part('head', {
        parent: 'body', pivot: [0, 9.5, 8], from: [-4, -4, -0.5], size: [8, 7.5, 6],
        paint: coat({
            all: (p, face) => {
                if (face === 'top') { p.rect(1.5, 0, p.w - 3, p.h, back, 0.07); return; }
                if (face === 'bottom') { p.fill(belly, 0.05); return; }
                if (face === 'front') {
                    VoxelModels.eyes(p, 1.5, 1, 0x120c0a, 1);
                    p.rect(1.5, 4.5, p.w - 3, 3, muzzle, 0.05);
                    return;
                }
                if (face !== 'left' && face !== 'right') return;
                const eye = face === 'left' ? p.w - 2 : 1;
                p.rect(eye, 1.5, 1, 1, 0x120c0a, 0);
                p.rect(eye + (face === 'left' ? 0.5 : 0), 1.5, 0.5, 0.5, 0xffffff, 0);
                p.rect(0, p.h - 2, p.w, 2, belly, 0.05);
            }
        })
    });
    b.part('snout', {
        parent: 'head', pivot: [0, -1.5, 5.5], from: [-2.75, -2, 0], size: [5.5, 4, 2.5],
        paint: {
            color: muzzle, noise: 0.05,
            faces: {
                front: (p) => { p.rect(1.5, 0, 2.5, 1.25, 0x1a1210, 0); p.rect(2.5, 1.25, 0.5, 1, 0x3a2418, 0); p.rect(0.5, 2.25, p.w - 1, 0.5, 0x3a2418, 0.02); },
                top: (p) => p.rect(1.5, p.h - 1, 2.5, 1, 0x1a1210, 0),
                bottom: (p) => p.fill(belly, 0.05)
            }
        }
    });
    // The incisors: orange in front, as a beaver's, from the iron in their enamel, with the gap between the two.
    b.part('teeth', {
        parent: 'snout', pivot: [0, -1.75, 1.6], from: [-1.6, -3, 0], size: [3.2, 3, 0.9],
        paint: { color: 0xe07f22, noise: 0.03, bevel: 0, surface: 'smooth', faces: {
            front: (p) => { p.rect(p.w / 2 - 0.2, 0, 0.4, p.h, 0x7a3f10, 0); p.rect(0, 0, p.w, 0.5, 0xf0aa55, 0); },
            back: (p) => p.fill(0xf1e6c8, 0.03),
            bottom: (p) => p.fill(0xf1e6c8, 0.03)
        } }
    });
    const earPaint = { color: back, noise: 0.05, faces: { front: (p) => p.rect(0.5, 0.5, p.w - 1, p.h - 0.5, 0x2a1a12, 0) } };
    b.part('earL', { parent: 'head', pivot: [3.4, 3.25, 1.5], from: [-0.75, 0, -0.5], size: [1.75, 1.5, 1], paint: earPaint });
    b.part('earR', { parent: 'head', pivot: [-3.4, 3.25, 1.5], from: [-1, 0, -0.5], size: [1.75, 1.5, 1], paint: earPaint });

    b.part('tail', {
        parent: 'body', pivot: [0, 5.5, -8.5], from: [-2.75, -0.6, -10], size: [5.5, 1.2, 10], rotation: [-0.28, 0, 0],
        paint: { color: tailDark, noise: 0.04, surface: 'skin', bevel: 0.05, faces: { top: scales, bottom: scales } }
    });
    b.part('tailBase', { parent: 'body', pivot: [0, 5.5, -8.5], from: [-2.25, -1.25, -2], size: [4.5, 3, 2.5], paint: coat({ faces: { top: (p) => p.fill(back, 0.07) } }) });

    // Small front paws for holding what it eats; the hind legs strong, on wide webbed feet for swimming.
    const pawPaint = coat({ all: (p, face) => { if (face !== 'top') p.rect(0, p.h - 1, p.w, 1, foot, 0.04); } });
    b.part('legFL', { parent: 'body', pivot: [3.6, 4, 5.5], from: [-1.5, -4, -1.5], size: [3, 4, 3], paint: pawPaint });
    b.part('legFR', { parent: 'body', pivot: [-3.6, 4, 5.5], from: [-1.5, -4, -1.5], size: [3, 4, 3], paint: pawPaint });
    const footPaint = { color: foot, noise: 0.04, bevel: 0.05, faces: { top: (p) => { for (let x = 0.4; x < p.w; x += 1.1) p.rect(x, 0, 0.35, p.h, 0x54423a, 0.03); } } };
    ['L', 'R'].forEach((side) => {
        const sign = side === 'L' ? 1 : -1;
        b.part('legB' + side, { parent: 'body', pivot: [sign * 3.9, 4.5, -5.5], from: [-2, -3.75, -2.5], size: [4, 5.5, 5], paint: coat() });
        b.part('foot' + side, { parent: 'legB' + side, pivot: [0, -3.75, 0], from: [-2.25, -0.75, -2], size: [4.5, 0.75, 6.5], paint: footPaint });
    });
    return { legs: ['legFL', 'legFR', 'legBL', 'legBR'], head: 'head', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('castoroides', {
    info: { eggColor: 0x5f3d26, tone: 200, maxHealth: 20, speed: 0.4, hiddenUntilDiscovered: true, ancestorOf: 'beaver' },
    model: castoroidesModel,
    surface: 'fur',
    drops: [['fur', 2, 3]],
    // No diet, as the beaver has none. No bait: one the server walks goes where the server says.
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Castoroides', habitat: 'Lakes and swamps of North America, from 3 million to 10,000 years ago', activity: 'Day and night', temperament: 'Passive',
        description: 'The giant beaver: as big as a black bear, up to 2.2 metres long, with incisors of 15 centimetres. It fed on water plants and, as far as we know, felled no trees and built no dams.'
    },
    cardEs: {
        name: 'Castoroides', habitat: 'Lagos y pantanos de Norteamérica, desde hace 3 millones hasta hace 10 000 años',
        description: 'El castor gigante: tan grande como un oso negro, de hasta 2,2 metros de largo, con incisivos de 15 centímetros. Se alimentaba de plantas de agua y, que sepamos, no talaba árboles ni levantaba presas.'
    }
});
