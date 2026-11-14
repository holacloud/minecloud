// Haast's eagle: an extinct animal (js/mobSpecies.js) and an ancient relative of the eagle, found as a rare
// fossil in the deep rock and brought back by the revival machine. The biggest eagle there has been, of
// New Zealand: wings short and broad for its weight, made to turn among trees, legs as thick as a child's
// wrist and talons like a tiger's claws. It hunted moa, birds much bigger than itself, by falling on them.
// It flies as every big flyer of the past does, by the 'glide' movement (js/game/gliders.js, whose header
// says the whole of it): circles over its home, a perch now and then, and, being hostile, a dive at a
// player who walks under it. All this file says is its body and its numbers.

// Faces +z, built as it flies: wings spread flat along x. The eagle of js/models.js made heavier: a deeper
// body, a long tail, a dark head with a golden nape and a long grey beak instead of a white head and a
// short yellow one, feathered legs, and fingers at the end of wings that are short for such a body.
// Every size is a number of quarters of a unit: a texel is half a unit, and a smaller box is not painted.
function haastEagleModel(b) {
    const dark = 0x3a281b;
    const brown = 0x5a3e27;
    const tawny = 0x8a6238;
    const gold = 0xc09a56;
    const cream = 0xd9c49a;
    const horn = 0x8b959b;
    const yellow = 0xe0b23a;
    const black = 0x17120f;
    b.part('body', {
        pivot: [0, 0, 0], from: [-3, 3.5, -5.5], size: [6, 5.5, 11],
        paint: { color: brown, noise: 0.08, all: (p, face) => {
            if (face === 'bottom' || face === 'front') {
                // A pale breast with dark streaks.
                p.fill(cream, 0.06);
                for (let x = 0.5; x < p.w - 0.25; x += 1.5) for (let y = 0.5; y < p.h - 0.5; y += 2) p.rect(x + (y % 4 ? 0.5 : 0), y, 0.5, 1, brown, 0.05);
                return;
            }
            p.spots(dark, 8, 1, 2);
            if (face === 'left' || face === 'right') p.rect(0, p.h - 1.5, p.w, 1.5, cream, 0.06);
        } }
    });
    b.part('head', {
        parent: 'body', pivot: [0, 8, 5], from: [-2.25, -1.5, -0.5], size: [4.5, 4.5, 5],
        paint: { color: dark, noise: 0.06, all: (p, face) => {
            if (face === 'top') { p.rect(0, 0, p.w, 2.5, gold, 0.07); return; }
            if (face === 'back') { p.fill(gold, 0.07); return; }
            if (face === 'bottom') { p.fill(tawny, 0.06); return; }
            if (face !== 'left' && face !== 'right') return;
            // The golden nape behind, and a fierce eye under a dark brow.
            const nape = face === 'left' ? 0 : p.w - 2;
            p.rect(nape, 0, 2, p.h, gold, 0.07);
            const eye = face === 'left' ? p.w - 2.25 : 1.25;
            p.rect(eye, 1.5, 1, 1, 0xf0c63a, 0);
            p.rect(eye + (face === 'left' ? 0.5 : 0), 2, 0.5, 0.5, black, 0);
            p.rect(eye - 0.5, 1, 2, 0.5, black, 0);
        } }
    });
    // A beak long and deep for an eagle's, yellow where it meets the face and hooked at the end.
    b.part('beak', {
        parent: 'head', pivot: [0, 1, 4.5], from: [-1, -1.5, 0], size: [2, 2.5, 2.5],
        paint: { color: horn, noise: 0.03, surface: 'smooth', all: (p, face) => {
            if (face === 'left') p.rect(0, 0, 1, p.h, yellow, 0.03);
            else if (face === 'right') p.rect(p.w - 1, 0, 1, p.h, yellow, 0.03);
            else if (face === 'top') p.rect(0, 0, p.w, 1, yellow, 0.03);
        } }
    });
    b.part('beakTip', { parent: 'beak', pivot: [0, -1.5, 2.5], from: [-0.75, -1, -1], size: [1.5, 1.25, 1], paint: { color: 0x2c2c30, noise: 0.03, surface: 'smooth' } });
    b.part('tail', {
        parent: 'body', pivot: [0, 7.5, -5.5], from: [-3, -0.5, -7], size: [6, 1, 7], rotation: [-0.1, 0, 0],
        paint: { color: brown, noise: 0.07, all: (p, face) => {
            if (face !== 'top' && face !== 'bottom') return;
            // Barred, with a dark band at the end.
            for (let y = 1; y < p.h - 1; y += 2) p.rect(0, face === 'top' ? p.h - y - 1 : y, p.w, 0.5, tawny, 0.05);
            p.rect(0, face === 'top' ? 0 : p.h - 1.5, p.w, 1.5, dark, 0.05);
        } }
    });

    // On top the wing is dark, paler along its front edge; underneath it is pale and barred.
    const wingPaint = { color: brown, noise: 0.08, all: (p, face) => {
        if (face === 'top') {
            p.spots(dark, 10, 1, 2);
            p.rect(0, p.h - 2.5, p.w, 2.5, tawny, 0.07);
            return;
        }
        if (face !== 'bottom') return;
        p.fill(cream, 0.06);
        p.rect(0, 0, p.w, 2, tawny, 0.07);
        for (let x = 0.5; x < p.w - 0.25; x += 1.5) p.rect(x, 2.5, 0.5, p.h - 3, brown, 0.05);
    } };
    const tipPaint = { color: dark, noise: 0.08, all: (p, face) => {
        if (face === 'top') { p.spots(0x2a1c13, 6, 1, 1.5); return; }
        if (face !== 'bottom') return;
        p.fill(0xb9a37c, 0.06);
        for (let x = 0.5; x < p.w - 0.25; x += 1.5) p.rect(x, 1, 0.5, p.h - 1.5, dark, 0.05);
    } };
    const legPaint = { color: tawny, noise: 0.08, all: (p, face) => { if (face !== 'top' && face !== 'bottom') p.rect(0, p.h - 1, p.w, 1, yellow, 0.04); } };
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        // Where a box starts along x when it reaches `length` out from its pivot, on this side.
        const out = (length) => (sign > 0 ? 0 : -length);
        b.part(`wing${side}`, { parent: 'body', pivot: [3 * sign, 8, 1], from: [out(9), -0.5, -4], size: [9, 1, 8], paint: wingPaint });
        b.part(`wingTip${side}`, { parent: `wing${side}`, pivot: [9 * sign, 0, 0], from: [out(6), -0.375, -4], size: [6, 0.75, 6.5], paint: tipPaint });
        [1.75, 0.25, -1.25, -2.75].forEach((z, finger) => {
            b.part(`finger${side}${finger}`, { parent: `wingTip${side}`, pivot: [6 * sign, 0, z], from: [out(3), -0.25, -0.5], size: [3, 0.5, 1.25], paint: { color: black, noise: 0.06 } });
        });
        // Legs feathered down to feet as big as a hand, with talons of 9 centimetres in life.
        b.part(`leg${side}`, { parent: 'body', pivot: [1.75 * sign, 4, 0.5], from: [-0.75, -4, -0.75], size: [1.5, 4, 1.5], paint: legPaint });
        b.part(`talons${side}`, {
            parent: `leg${side}`, pivot: [0, -4, 0], from: [-1.25, 0, -1.25], size: [2.5, 0.75, 3.5],
            paint: { color: yellow, noise: 0.04, surface: 'skin', all: (p, face) => {
                if (face === 'front' || face === 'bottom') p.fill(black, 0.03);
                else if (face === 'top') p.rect(0, p.h - 1, p.w, 1, black, 0.03);
            } }
        });
    });
    return { legs: ['legL', 'legR'], wings: ['wingL', 'wingR'], head: 'head', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('haast_eagle', {
    info: { eggColor: 0x5a3e27, tone: 1900, maxHealth: 16, speed: 3.6, hostile: true, attackDamage: 2, chaseDistance: 10, chaseSpeed: 9, movement: 'glide', glideHeight: 8, glideRange: 12, glideAloft: [35, 70], glidePerch: [10, 22], glideBeat: [4, 9], hiddenUntilDiscovered: true, ancestorOf: 'eagle' },
    model: haastEagleModel,
    surface: 'feather',
    drops: [['feather', 2, 3]],
    sheds: ['feather', 0.5, 8],
    // No bait and no cage: it does not walk, and it comes to nothing but a player under it.
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        // Its apostrophe is the letter U+02BC, not the ASCII one: the name is also the title of its guide page,
        // which is the name of a file, and the server cannot embed a file with an ASCII apostrophe in its name.
        name: 'Haastʼs eagle', habitat: 'Forests of the South Island of New Zealand, until about 600 years ago', activity: 'Day', temperament: 'Hostile',
        description: 'The biggest eagle there has ever been: up to 15 kilograms, with talons like a tiger\'s claws. It hunted moa, giant birds that could not fly. It circles over its home, and it cries before it dives at you: step aside!'
    },
    cardEs: {
        name: 'Águila de Haast', habitat: 'Bosques de la Isla Sur de Nueva Zelanda, hasta hace unos 600 años',
        description: 'El águila más grande que ha existido: hasta 15 kilos, con garras como las de un tigre. Cazaba moas, unas aves gigantes que no volaban. Da vueltas sobre su casa, y chilla antes de lanzarse a por ti: hazte a un lado.'
    }
});
