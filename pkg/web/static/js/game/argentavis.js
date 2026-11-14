// Argentavis: an extinct animal (js/mobSpecies.js) and an ancient relative of the vulture, found as a rare
// fossil in the deep rock and brought back by the revival machine. One of the biggest birds that ever
// flew: some 70 kilos under wings of 5 to 7 metres, over the plains of Argentina. Too heavy to beat them
// for long, it rode the rising air as the condors of today do, and looked for what had died. In the game
// its wings are 5 blocks from tip to tip. It flies as every big flyer of the past does, by the 'glide'
// movement (js/game/gliders.js, whose header says the whole of it): wide slow circles high over its home,
// hardly a wingbeat, and a perch now and then. It is peaceful. All this file says is its body and its numbers.

// Faces +z, built as it flies: wings spread flat along x. The vulture of js/game/vulture.js grown to twice its
// size and made a condor: a bare reddish head on a long neck that comes out of a white ruff, a hooked pale
// beak, black wings with a white band along the back of their inner half and five long fingers at their
// ends, and a broad tail. Every size is a number of quarters of a unit: a texel is half a unit, and a
// smaller box is not painted.
function argentavisModel(b) {
    const black = 0x221c19;
    const plumage = 0x2e2622;
    const covert = 0x45382e;
    const white = 0xe6dfcd;
    const skin = 0xb9695c;
    const skinDark = 0x8f4a42;
    const horn = 0xd9cdb0;
    const grey = 0x9a9088;
    const feathers = { color: plumage, noise: 0.08, all: (p, face) => {
        p.spots(covert, Math.ceil((p.w * p.h) / 14), 1, 2);
        if (face === 'bottom') p.fill(black, 0.07);
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-4, 4, -8], size: [8, 7, 16], paint: feathers });
    b.part('ruff', {
        parent: 'body', pivot: [0, 10.5, 7], from: [-3, -2.5, -1.5], size: [6, 4, 3.5],
        paint: { color: white, noise: 0.09, all: (p) => p.spots(0xcfc6b0, 6, 0.5, 1) }
    });
    b.part('neck', {
        parent: 'body', pivot: [0, 10.5, 7.5], from: [-1.25, -0.5, -1.25], size: [2.5, 5, 2.5], rotation: [0.9, 0, 0],
        paint: { color: skin, noise: 0.07, surface: 'skin', all: (p) => p.spots(skinDark, 4, 0.5, 1) }
    });
    b.part('head', {
        parent: 'neck', pivot: [0, 4.5, 0], from: [-1.75, -1, -1.75], size: [3.5, 3.5, 4.5], rotation: [-0.9, 0, 0],
        paint: { color: skin, noise: 0.06, surface: 'skin', all: (p, face) => {
            if (face === 'top') { p.spots(skinDark, 4, 0.5, 1); return; }
            if (face !== 'left' && face !== 'right') return;
            // A small dark eye in a ring of wrinkled skin.
            const eye = face === 'left' ? p.w - 2.5 : 1;
            p.rect(eye, 1, 1.5, 1.5, skinDark, 0);
            p.rect(eye + 0.5, 1.5, 0.5, 0.5, 0x120d0b, 0);
        } }
    });
    b.part('beak', {
        parent: 'head', pivot: [0, 0.25, 2.75], from: [-0.75, -1, 0], size: [1.5, 1.75, 2.5],
        paint: { color: horn, noise: 0.03, surface: 'smooth', faces: { top: (p) => p.rect(0, 0, p.w, 1, 0x8a8478, 0.03) } }
    });
    b.part('beakHook', { parent: 'beak', pivot: [0, -1, 2.5], from: [-0.5, -0.75, -1], size: [1, 1, 1], paint: { color: 0x2a2420, noise: 0.02, surface: 'smooth' } });
    b.part('tail', {
        parent: 'body', pivot: [0, 9.5, -8], from: [-4, -0.5, -7], size: [8, 1, 7], rotation: [-0.12, 0, 0],
        paint: { color: black, noise: 0.07, all: (p, face) => { if (face === 'top') p.spots(covert, 5, 1, 1.5); } }
    });

    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        // Where a box starts along x when it reaches `length` out from its pivot, on this side.
        const out = (length) => (sign > 0 ? 0 : -length);
        // A band along the wing, from the body outwards, on a face whose x runs from -x to +x.
        const band = (p, y, height, color) => p.rect(0, y, p.w, height, color, 0.06);
        b.part(`wing${side}`, {
            parent: 'body', pivot: [4 * sign, 10, 1], from: [out(18), -0.5, -6], size: [18, 1, 11],
            paint: { color: plumage, noise: 0.08, all: (p, face) => {
                if (face === 'top') {
                    p.spots(covert, 14, 1, 2);
                    // The white of a condor's wing: its hind feathers, edged in black.
                    band(p, 1, 3.5, white);
                    for (let x = 1; x < p.w - 0.5; x += 2) p.rect(x, 1, 0.5, 3.5, 0xbfb7a4, 0.04);
                    band(p, 0, 1, black);
                } else if (face === 'bottom') {
                    p.fill(black, 0.07);
                    band(p, 1, 2.5, covert);
                    band(p, p.h - 4, 2, 0x6a5a4c);
                }
            } }
        });
        b.part(`wingTip${side}`, {
            parent: `wing${side}`, pivot: [18 * sign, 0, 0], from: [out(12), -0.375, -5.5], size: [12, 0.75, 9.5],
            paint: { color: black, noise: 0.08, all: (p, face) => {
                if (face === 'top') { p.spots(plumage, 8, 1, 2); band(p, p.h - 2.5, 2.5, covert); }
                else if (face === 'bottom') band(p, 1, 2, 0x4a3e36);
            } }
        });
        // Five feathers like fingers, splayed apart at the end of the wing.
        [3, 1.25, -0.5, -2.25, -4].forEach((z, finger) => {
            b.part(`finger${side}${finger}`, { parent: `wingTip${side}`, pivot: [12 * sign, 0, z], from: [out(6), -0.25, -0.75], size: [6, 0.5, 1.5], paint: { color: black, noise: 0.06 } });
        });
        b.part(`leg${side}`, {
            parent: 'body', pivot: [2.25 * sign, 5, 0.5], from: [-0.75, -5, -0.75], size: [1.5, 5, 1.5],
            paint: { color: grey, noise: 0.05, surface: 'skin', all: (p, face) => { if (face !== 'top' && face !== 'bottom') p.rect(0, 0, p.w, 2, plumage, 0.07); } }
        });
        b.part(`talons${side}`, { parent: `leg${side}`, pivot: [0, -5, 0], from: [-1.5, 0, -1.25], size: [3, 0.75, 4], paint: { color: grey, noise: 0.04, surface: 'skin', faces: { front: (p) => p.fill(0x2a2420, 0.03) } } });
    });
    return { legs: ['legL', 'legR'], wings: ['wingL', 'wingR'], head: 'head', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('argentavis', {
    info: { eggColor: 0x2e2622, tone: 110, maxHealth: 20, speed: 3, movement: 'glide', glideHeight: 10, glideRange: 14, glideAloft: [60, 120], glidePerch: [15, 30], glideBeat: [10, 20], hiddenUntilDiscovered: true, ancestorOf: 'vulture' },
    model: argentavisModel,
    surface: 'feather',
    drops: [['feather', 2, 4]],
    sheds: ['feather', 0.5, 8],
    // No bait and no cage: it does not walk, and it comes to nothing.
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Argentavis', habitat: 'Plains and foothills of Argentina, about 8 million years ago', activity: 'Day', temperament: 'Passive',
        description: 'One of the biggest birds that ever flew: about 70 kilograms, with wings of up to 7 metres. Too heavy to flap for long, it rode the rising air in wide circles, as a condor does, looking for dead animals. It harms nobody.'
    },
    cardEs: {
        name: 'Argentavis', habitat: 'Llanuras y montes de Argentina, hace unos 8 millones de años',
        description: 'Una de las aves voladoras más grandes que han existido: unos 70 kilos, con alas de hasta 7 metros. Pesaba demasiado para aletear mucho rato: se dejaba llevar por el aire que sube, en círculos anchos, como un cóndor, buscando animales muertos. No hace daño a nadie.'
    }
});
