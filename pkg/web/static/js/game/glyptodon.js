// Glyptodon: an extinct animal (js/mobSpecies.js), a giant relative of the armadillos, found as a rare
// fossil in the deep rock and brought back by the revival machine. The size of a small car: a dome of a
// shell made of hundreds of bony plates, a little armoured cap on its head, short strong legs and a tail in
// rings of bone. It grazes and walks as any ground mob (js/game/mobs.js), so the server walks a kept one
// (js/game/animals.js); it is peaceful, it is tamed with grass and wheat, and whoever tamed it rides it
// (js/game/riding.js): slowly, low, and inside its armour, which takes half of every blow an animal gives
// its rider (the damage modifier at the end of this file).

// What its armour takes off a blow of an animal to its rider (js/game/survival.js, applyDamage).
const GLYPTODON_SHIELD = 0.5;

// The plates of a shell: a honeycomb of six-sided plates, each pale in the middle with a dark seam around
// it, row after row shifted half a plate. In model units on the face of a part.
function glyptodonPlates(p, plate, seam, size = 3) {
    for (let row = 0, y = 0; y < p.h; row++, y += size * 0.75) {
        for (let x = (row % 2) * size / 2 - size / 2; x < p.w; x += size) {
            // Its outline: the flat sides, and the corners cut at top and bottom.
            p.rect(x, y + size * 0.25, 0.5, size * 0.5, seam, 0.04);
            p.rect(x + 0.5, y, size - 1, 0.5, seam, 0.04);
            p.rect(x + 0.75, y + 0.75, size - 1.5, size * 0.5 - 0.25, plate, 0.06);
        }
    }
}

// Faces +z. The shell is three boxes, each narrower and shorter than the one under it, over a rim that
// stands out like the edge of a bowl; the body hides inside, and the legs come out under the rim. The
// rider sits on the top of the dome (js/game/riding.js seats them at the middle of the model). The tail is
// four rings, each hanging from the one before: they are named tail, so what measures a body leaves them
// out (js/game/herd.js), and the rig sways them.
function glyptodonModel(b) {
    const shell = 0x8a7350;
    const plate = 0xa88f66;
    const seam = 0x5a4730;
    const skin = 0x5d4a3a;
    const pale = 0x7a6450;
    const shellPaint = { color: shell, noise: 0.05, surface: 'skin', all: (p, face) => {
        if (face === 'bottom') { p.fill(seam, 0.05); return; }
        glyptodonPlates(p, plate, seam);
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-10.5, 5.5, -18.5], size: [21, 3, 37], paint: { color: seam, noise: 0.05, all: (p, face) => {
        // The rim: a row of bigger plates along its edge.
        if (face === 'top' || face === 'bottom') return;
        for (let x = 0; x < p.w; x += 2.5) p.rect(x + 0.25, 0.5, 2, p.h - 1, plate, 0.06);
    } } });
    b.part('shell', { parent: 'body', pivot: [0, 8.5, 0], from: [-10, 0, -18], size: [20, 7.5, 36], paint: shellPaint });
    b.part('shellTop', { parent: 'shell', pivot: [0, 7.5, 0], from: [-8.5, 0, -15.5], size: [17, 4.5, 31], paint: shellPaint });
    b.part('shellCap', { parent: 'shellTop', pivot: [0, 4.5, 0], from: [-6, 0, -11], size: [12, 2.5, 22], paint: shellPaint });
    // The skin of the belly, out of sight under the rim but for a little.
    b.part('belly', { parent: 'body', pivot: [0, 5.5, 0], from: [-8, -1.5, -15], size: [16, 1.5, 30], paint: { color: skin, noise: 0.06 } });

    // The head, low and short-snouted, with a cap of bone on its forehead.
    b.part('head', {
        parent: 'body', pivot: [0, 8.5, 18], from: [-3.75, -5, -1], size: [7.5, 7, 7.5],
        paint: {
            color: skin, noise: 0.06,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(pale, 0.05); return; }
                if (face === 'front') {
                    p.rect(1, p.h - 3.5, p.w - 2, 3.5, pale, 0.05);
                    p.rect(2, p.h - 2.75, 1, 1, 0x1a120c, 0);
                    p.rect(p.w - 3, p.h - 2.75, 1, 1, 0x1a120c, 0);
                    return;
                }
                if (face !== 'left' && face !== 'right') return;
                const eye = face === 'left' ? p.w - 3.5 : 2;
                p.rect(eye, 2.5, 1.5, 1.25, 0x140e0a, 0);
                p.rect(eye + (face === 'left' ? 1 : 0), 2.5, 0.5, 0.5, 0xffffff, 0);
                p.rect(face === 'left' ? p.w - 2.5 : 0, p.h - 2, 2.5, 2, pale, 0.05);
            }
        }
    });
    b.part('cap', { parent: 'head', pivot: [0, 2, 1.75], from: [-4, 0, -2.5], size: [8, 1.5, 5.5], paint: { color: shell, noise: 0.05, all: (p, face) => { if (face === 'top') glyptodonPlates(p, plate, seam, 2.5); } } });
    b.part('earL', { parent: 'head', pivot: [3.5, 1.5, 0.5], from: [0, 0, -0.5], size: [1, 1.75, 1.25], paint: { color: skin, noise: 0.06 }, rotation: [0, 0, -0.4] });
    b.part('earR', { parent: 'head', pivot: [-3.5, 1.5, 0.5], from: [-1, 0, -0.5], size: [1, 1.75, 1.25], paint: { color: skin, noise: 0.06 }, rotation: [0, 0, 0.4] });

    // The tail: rings of bone, thinner one after another, and a blunt tip.
    const ringPaint = { color: shell, noise: 0.05, all: (p, face) => {
        if (face === 'front' || face === 'back') return;
        for (let y = 0; y < p.h; y += 2.5) { p.rect(0, y, p.w, 0.5, seam, 0.04); for (let x = 0.5; x < p.w; x += 2) p.rect(x, y + 0.75, 1, 1, plate, 0.05); }
    } };
    b.part('tail', { parent: 'body', pivot: [0, 10, -18], from: [-3.25, -3.25, -5], size: [6.5, 6.5, 5.5], paint: ringPaint, rotation: [-0.25, 0, 0] });
    b.part('tail1', { parent: 'tail', pivot: [0, 0, -5], from: [-2.5, -2.5, -5], size: [5, 5, 5.5], paint: ringPaint, rotation: [-0.1, 0, 0] });
    b.part('tail2', { parent: 'tail1', pivot: [0, 0, -5], from: [-2, -2, -4.5], size: [4, 4, 5], paint: ringPaint, rotation: [0.1, 0, 0] });
    b.part('tail3', { parent: 'tail2', pivot: [0, 0, -4.5], from: [-1.5, -1.5, -3.5], size: [3, 3, 4], paint: { color: plate, noise: 0.05 }, rotation: [0.1, 0, 0] });

    // Short thick legs under the rim, with heavy claws on the front feet.
    const legs = VoxelModels.quadLegs(b, {
        size: [5.5, 7, 5.5], hipY: 7, x: 6.5, zFront: 12, zBack: -12,
        paint: { color: skin, noise: 0.07, all: (p, face) => {
            if (face === 'top') return;
            if (face === 'bottom') { p.fill(0x2e241c, 0.04); return; }
            p.rect(0, p.h - 1.5, p.w, 1.5, 0x3e3026, 0.05);
            if (face === 'front') for (let x = 0.5; x < p.w - 0.5; x += 1.75) p.rect(x, p.h - 1, 1, 1, 0xcfc2a2, 0.03);
        } }
    });
    return { legs, head: 'head', tail: ['tail', 'tail1', 'tail2', 'tail3'] };
}

registerSpecies('glyptodon', {
    info: { eggColor: 0x8a7350, tone: 160, maxHealth: 40, speed: 0.25, grazer: true, mount: { eyeHeight: 2.67, seat: 1.05, speed: 5, autoJump: 7.6, jump: 7.6 }, hiddenUntilDiscovered: true },
    model: glyptodonModel,
    surface: 'skin',
    drops: [['leather', 2, 4]],
    // It grazed: what grows low tames it.
    diet: { foods: ['tall_grass', 'wheat', 'leaves'], chance: 1 / 3 },
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Glyptodon', habitat: 'Grasslands of South America, from 3 million to 10,000 years ago', activity: 'Day', temperament: 'Passive',
        description: 'A giant armadillo the size of a small car, about 1.5 metres tall, under a shell of hundreds of bony plates. Tame it and you can ride it: slowly, but inside its armour.'
    },
    cardEs: {
        name: 'Gliptodonte', habitat: 'Praderas de Sudamérica, desde hace 3 millones hasta hace 10 000 años',
        description: 'Un animal acorazado del tamaño de un coche pequeño, de unos 1,5 metros de alto, bajo un caparazón de cientos de placas de hueso. Domestícalo y podrás montarlo: despacio, pero dentro de su armadura.'
    }
});

// Its rider is inside its armour: a blow of an animal loses half its force (after the player's own armour
// and shield, js/game/resources.js and js/game/offhand.js, when those come first).
registerDamageModifier(function (amount, type) {
    if (type !== 'mob' || amount <= 0 || !this.ridingMob || this.ridingMob.userData.species !== 'glyptodon') return amount;
    return amount * (1 - GLYPTODON_SHIELD);
});
