// Titanotylopus: an extinct animal (js/mobSpecies.js) and an ancient relative of the camel, found as a rare
// fossil in the deep rock and brought back by the revival machine. A camel as tall as a room and a half:
// long legs, a long neck, one tall hump and a shaggy dark coat for the cold. It grazes, walks and lies down
// as the camel does (js/game/mobs.js), so the server walks a kept one (js/game/animals.js); it is tamed with
// what tames a camel, and whoever tamed it rides it (js/game/riding.js): its `mount` says how, with numbers
// of its own. Nothing else here is its own but its looks.

// Faces +z. The camel of js/models.js grown to twice its size and pushed back to what it was. The rider
// sits at the middle of the model (js/game/riding.js puts them there), so the hump stands behind it and
// the back is a narrow ridge there, for the legs to go down each side of it as on a horse. The neck is
// what the rig swings to look about and to graze.
function titanotylopusModel(b) {
    const coat = 0xa9763f;
    const shag = 0x5f3d22;
    const light = 0xd3b081;
    const hoof = 0x4a3826;
    const coatPaint = { color: coat, noise: 0.07, all: (p, face) => { if (face === 'bottom') p.fill(light, 0.05); } };
    b.part('body', { pivot: [0, 0, 0], from: [-6, 26, -14], size: [12, 10.5, 27], paint: { ...coatPaint, faces: {
        left: (p) => p.rect(0, p.h - 2, p.w, 2, light, 0.06),
        right: (p) => p.rect(0, p.h - 2, p.w, 2, light, 0.06),
        // The chest, shaggy where the neck leaves it.
        front: (p) => p.rect(2, 0, p.w - 4, 6, shag, 0.1)
    } } });
    b.part('ridge', { parent: 'body', pivot: [0, 36.5, 0], from: [-3.5, 0, -14], size: [7, 2.5, 26.5], paint: coatPaint });
    // The hump: a store of fat, not of water, under long dark hair.
    const humpPaint = { color: shag, noise: 0.1, all: (p, face) => { if (face !== 'top' && face !== 'bottom') p.rect(0, p.h - 1.5, p.w, 1.5, coat, 0.07); } };
    b.part('hump', { parent: 'body', pivot: [0, 38.5, -6.5], from: [-4.5, 0, -5], size: [9, 6, 10], paint: humpPaint });
    b.part('humpTop', { parent: 'hump', pivot: [0, 6, -0.25], from: [-3.25, 0, -3.25], size: [6.5, 4, 6.5], paint: { color: shag, noise: 0.1 } });
    b.part('humpTip', { parent: 'humpTop', pivot: [0, 4, 0], from: [-2, 0, -2], size: [4, 1.5, 4], paint: { color: shag, noise: 0.1 } });

    b.part('neck', {
        parent: 'body', pivot: [0, 33.5, 12], from: [-2.75, -3, -2.75], size: [5.5, 21, 5.5], rotation: [0.45, 0, 0],
        paint: { ...coatPaint, faces: { back: (p) => p.rect(p.w / 2 - 1, 0, 2, p.h, shag, 0.09) } }
    });
    // The beard of a camel of cold lands, down the front of its neck.
    b.part('beard', { parent: 'neck', pivot: [0, -2, 2.75], from: [-1.5, 0, -0.25], size: [3, 12, 1.75], paint: { color: shag, noise: 0.12 } });
    b.part('head', {
        parent: 'neck', pivot: [0, 17.5, 0.5], from: [-2.75, -2, -2.5], size: [5.5, 5.5, 10], rotation: [-0.55, 0, 0],
        paint: {
            color: coat, noise: 0.06,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(light, 0.05); return; }
                if (face === 'front') {
                    // Slit nostrils that close against the dust, and the split upper lip.
                    p.fill(light, 0.05);
                    p.rect(0.75, 1.25, 1.25, 0.5, 0x3a2a1a, 0);
                    p.rect(p.w - 2, 1.25, 1.25, 0.5, 0x3a2a1a, 0);
                    p.rect(p.w / 2 - 0.25, 2.25, 0.5, 1.5, 0x5a4026, 0);
                    p.rect(0.5, 3.75, p.w - 1, 0.25, 0x5a4026, 0);
                    return;
                }
                if (face !== 'left' && face !== 'right') return;
                // A big eye under heavy lashes, the muzzle paler, and the line of the mouth.
                const eye = face === 'left' ? 3.5 : p.w - 5;
                p.rect(eye, 1, 1.5, 1.25, 0xf2ead8, 0);
                p.rect(eye + 0.5, 1, 1, 1.25, 0x1a120c, 0);
                p.rect(eye - 0.25, 0.5, 2, 0.5, 0x3a2a1a, 0);
                const muzzle = face === 'left' ? p.w - 3 : 0;
                p.rect(muzzle, 0, 3, p.h, light, 0.05);
                p.rect(face === 'left' ? p.w - 4 : 0.5, 3.75, 3.5, 0.25, 0x5a4026, 0);
            }
        }
    });
    b.part('topknot', { parent: 'head', pivot: [0, 3.5, -1], from: [-2, 0, -1.5], size: [4, 1.25, 3.5], paint: { color: shag, noise: 0.12 } });
    b.part('earL', { parent: 'head', pivot: [2.5, 3, -1.25], from: [0, -0.5, -0.75], size: [1.75, 1.25, 1.5], paint: { color: shag, noise: 0.08 }, rotation: [0, 0, -0.45] });
    b.part('earR', { parent: 'head', pivot: [-2.5, 3, -1.25], from: [-1.75, -0.5, -0.75], size: [1.75, 1.25, 1.5], paint: { color: shag, noise: 0.08 }, rotation: [0, 0, 0.45] });

    b.part('tail', { parent: 'body', pivot: [0, 37, -14], from: [-0.6, -11, -0.6], size: [1.2, 11, 1.2], paint: { color: coat, noise: 0.06 }, rotation: [0.12, 0, 0] });
    b.part('tailTuft', { parent: 'tail', pivot: [0, -11, 0], from: [-1, -3, -1], size: [2, 3, 2], paint: { color: shag, noise: 0.1 } });
    // Long legs: shaggy at the top, a dark knee pad half way down, and the broad two-toed foot of a camel.
    const legs = VoxelModels.quadLegs(b, {
        size: [4, 27, 4], hipY: 27, x: 3.75, zFront: 9.5, zBack: -10.5,
        paint: {
            color: coat, noise: 0.06,
            all: (p, face) => {
                if (face === 'top') return;
                if (face === 'bottom') { p.fill(hoof, 0.04); return; }
                p.rect(0, 0, p.w, 5, shag, 0.1);
                p.rect(0, 12.5, p.w, 2.5, 0x7d5730, 0.06);
                p.rect(0, p.h - 2, p.w, 2, light, 0.05);
                p.rect(0, p.h - 0.75, p.w, 0.75, hoof, 0.04);
                if (face === 'front') p.rect(p.w / 2 - 0.25, p.h - 2, 0.5, 2, hoof, 0);
            }
        }
    });
    return { legs, head: 'neck', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('titanotylopus', {
    info: { eggColor: 0xa9763f, tone: 130, maxHealth: 30, speed: 0.45, grazer: true, restDrop: 1.55, mount: { eyeHeight: 3.52, seat: 1.9, speed: 7.5, autoJump: 7.6, jump: 9 }, hiddenUntilDiscovered: true, ancestorOf: 'camel' },
    model: titanotylopusModel,
    surface: 'fur',
    drops: [['leather', 2, 4], ['fur', 1, 2]],
    // What tames a camel tames its giant cousin.
    diet: { foods: ['cactus', 'tall_grass', 'wheat'], chance: 1 / 3 },
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Titanotylopus', habitat: 'Plains of North America, from 10 million to 300,000 years ago', activity: 'Day', temperament: 'Passive',
        description: 'A giant camel, about 3.5 metres tall, with long legs and one hump. Camels were born in North America and crossed to Asia much later. Tame it and you can ride it, high above the ground.'
    },
    cardEs: {
        name: 'Titanotylopus', habitat: 'Llanuras de Norteamérica, desde hace 10 millones hasta hace 300 000 años',
        description: 'Un camello gigante, de unos 3,5 metros de alto, con las patas largas y una joroba. Los camellos nacieron en Norteamérica y pasaron a Asia mucho después. Domestícalo y podrás montarlo, muy por encima del suelo.'
    }
});
