// Megalodon: an extinct animal of the sea with no living relative in the game, found as a legendary skeleton
// in three pieces (js/game/fossils.js) and brought back to life next to at least 300 blocks of water joined
// together: the sea, or a lake. The biggest shark there ever was, nine blocks long here: the shape of a great
// white made heavier, a short snout over a wide mouth of triangular teeth, a tall fin on its back and a tail
// shaped as a crescent moon that beats from side to side. It is a hunter: it goes for a player who is in the
// water, and one on the shore is safe. How it moves is the 'cruise' movement of every sea animal
// (js/game/sea_animals.js): this file is its model and its row in the tables of the others.

// Faces +z, with its middle in the middle of its length: that is what it turns about. In front, the head
// (with the eye and, behind it on the chest, five gill slits), the short pointed snout over the mouth, and
// the lower jaw, which the movement opens to bite (`jaw`); a row of white triangles along the edge of each
// jaw. Behind, the deep trunk, the tail in three joints that the movement sways (`tail`), the two lobes of
// the crescent at its end, the tall fin on the back and the long stiff fins of the chest. Dark grey above and
// white below, with a sharp line between, as every great hunter of the open sea. Every size is a number of
// quarters of a unit: a face is painted in whole texels, two to a unit (js/models.js).
function megalodonModel(b, variant) {
    const palettes = [
        // Slate grey, a little blue.
        { back: 0x4f5d6b, side: 0x6c7b89, belly: 0xe9ece6, dark: 0x343f4a, fin: 0x46535f },
        // The brown grey of a shark of warm, muddy water.
        { back: 0x5c564b, side: 0x7b7466, belly: 0xece6d8, dark: 0x3b362e, fin: 0x524c42 }
    ];
    const c = palettes[variant % palettes.length];
    const tooth = 0xfbf8ee;
    const mouth = 0x7a3438;
    const eyeBlack = 0x0b0a0a;
    // The hide of a part: the back colour on top, the belly colour under it, and on the sides the line where
    // they meet a little under the middle (the share `line` of the height, from the top).
    const hide = (line = 0.55) => ({
        color: c.side, noise: 0.05, bevel: 0.1, surface: 'smooth',
        all: (p, face) => {
            if (face === 'top') { p.fill(c.back, 0.05); return; }
            if (face === 'bottom') { p.fill(c.belly, 0.03); return; }
            const cut = Math.round(p.h * line * 2) / 2;
            p.rect(0, 0, p.w, Math.round(p.h * 0.3 * 2) / 2, c.back, 0.05);
            p.rect(0, cut, p.w, p.h - cut, c.belly, 0.03);
        }
    });
    // A row of teeth along the bottom of a face, pointing down, from x0 to x1: each a white triangle three
    // texels wide at the gum and one at the tip.
    const upperTeeth = (p, x0, x1) => {
        p.rect(x0, p.h - 1.5, x1 - x0, 0.5, mouth, 0);
        for (let x = x0; x + 1.5 <= x1; x += 2) {
            p.rect(x, p.h - 1, 1.5, 0.5, tooth, 0);
            p.rect(x + 0.5, p.h - 0.5, 0.5, 0.5, tooth, 0);
        }
    };
    // The same along the top of a face, pointing up: the teeth of the lower jaw.
    const lowerTeeth = (p, x0, x1) => {
        for (let x = x0 + 1; x + 1.5 <= x1; x += 2) {
            p.rect(x, 0.5, 1.5, 0.5, tooth, 0);
            p.rect(x + 0.5, 0, 0.5, 0.5, tooth, 0);
        }
    };
    const eye = (p, x) => {
        p.rect(x, 4.5, 2, 2, c.dark, 0.02);
        p.rect(x + 0.5, 5, 1, 1, eyeBlack, 0);
        p.rect(x + 0.5, 5, 0.5, 0.5, 0xd8dde0, 0);
    };
    const finPaint = (edge) => ({
        color: c.fin, noise: 0.05, bevel: 0.08, surface: 'smooth',
        all: (p, face) => {
            if (face === 'bottom') { p.fill(edge ? c.belly : c.fin, 0.03); return; }
            // The trailing edge of a fin is darker, as on a real shark.
            if (face === 'left' || face === 'right') p.rect(face === 'left' ? 0 : p.w - 1, 0, 1, p.h, c.dark, 0.03);
        }
    });

    // The trunk, and the chest in front of it: the deepest part of the shark.
    b.part('body', { pivot: [0, 0, 0], from: [-9, 3, -14], size: [18, 23, 28], paint: hide() });
    b.part('chest', {
        parent: 'body', pivot: [0, 0, 14], from: [-9.5, 2.5, 0], size: [19, 24, 16],
        paint: {
            ...hide(),
            faces: {
                // Five gill slits, just behind the head.
                left: (p) => { p.rect(0, 0, p.w, 7, c.back, 0.05); p.rect(0, 13.5, p.w, p.h - 13.5, c.belly, 0.03); for (let i = 0; i < 5; i++) p.rect(p.w - 2 - i * 1.5, 7.5, 0.5, 8, c.dark, 0); },
                right: (p) => { p.rect(0, 0, p.w, 7, c.back, 0.05); p.rect(0, 13.5, p.w, p.h - 13.5, c.belly, 0.03); for (let i = 0; i < 5; i++) p.rect(1.5 + i * 1.5, 7.5, 0.5, 8, c.dark, 0); }
            }
        }
    });
    // The head: the eye high on each side, and the upper teeth along the edge of the mouth, which runs from
    // under the eye to the front.
    b.part('head', {
        parent: 'body', pivot: [0, 0, 30], from: [-8, 7, 0], size: [16, 19, 20],
        paint: {
            ...hide(0.6),
            faces: {
                left: (p) => { p.rect(0, 0, p.w, 5.5, c.back, 0.05); p.rect(0, 11, p.w, p.h - 11, c.belly, 0.03); eye(p, p.w - 7); upperTeeth(p, 4, p.w); },
                right: (p) => { p.rect(0, 0, p.w, 5.5, c.back, 0.05); p.rect(0, 11, p.w, p.h - 11, c.belly, 0.03); eye(p, 5); upperTeeth(p, 0, p.w - 4); },
                // Under the snout, the front of the open mouth: dark, with its row of teeth.
                front: (p) => { p.rect(0, p.h - 4, p.w, 4, mouth, 0.04); p.rect(0, p.h - 4, p.w, 0.5, c.belly, 0); for (let x = 0.5; x + 1.5 <= p.w; x += 2) { p.rect(x, p.h - 3.5, 1.5, 0.5, tooth, 0); p.rect(x + 0.5, p.h - 3, 0.5, 0.5, tooth, 0); } },
                bottom: (p) => p.fill(mouth, 0.04)
            }
        }
    });
    // The snout: short and pointed, as a great white's, a little over the mouth; two nostrils underneath.
    b.part('snout', { parent: 'head', pivot: [0, 0, 20], from: [-6, 11, 0], size: [12, 14, 12], paint: { ...hide(0.65), faces: { bottom: (p) => { p.fill(c.belly, 0.03); p.rect(2, p.h - 3, 1, 1, c.dark, 0); p.rect(p.w - 3, p.h - 3, 1, 1, c.dark, 0); } } } });
    b.part('snoutTip', { parent: 'snout', pivot: [0, 0, 12], from: [-3.5, 14, 0], size: [7, 9, 8], paint: hide(0.65) });
    // The lower jaw, wide and heavy, hanging a little open, with its own row of teeth standing up.
    b.part('jaw', {
        parent: 'head', pivot: [0, 7, 1], from: [-7.5, -4, 0], size: [15, 4, 20], rotation: [0.1, 0, 0],
        paint: {
            color: c.belly, noise: 0.03, bevel: 0.08, surface: 'smooth',
            all: (p, face) => {
                if (face === 'top') { p.fill(mouth, 0.04); return; }
                if (face === 'bottom' || face === 'back') return;
                lowerTeeth(p, face === 'left' ? 4 : 0, face === 'right' ? p.w - 4 : p.w);
            }
        }
    });

    // The tail: three joints, each narrower than the last, ending in a thin stalk.
    b.part('tail0', { parent: 'body', pivot: [0, 15, -14], from: [-7, -11, -14], size: [14, 20, 14], paint: hide() });
    b.part('tail1', { parent: 'tail0', pivot: [0, 0.5, -14], from: [-4.5, -7, -12], size: [9, 13, 12], paint: hide() });
    b.part('tail2', { parent: 'tail1', pivot: [0, 0, -12], from: [-2.5, -3.5, -10], size: [5, 7, 10], paint: hide() });
    // The crescent: two long blades, the upper one a little the longer, swept back from the end of the stalk.
    b.part('caudalUp', { parent: 'tail2', pivot: [0, 1.5, -8], from: [-0.75, -2.5, -26], size: [1.5, 5, 26], rotation: [0.95, 0, 0], paint: finPaint(false) });
    b.part('caudalDown', { parent: 'tail2', pivot: [0, -1.5, -8], from: [-0.75, -2.5, -16], size: [1.5, 5, 16], rotation: [-0.85, 0, 0], paint: finPaint(false) });

    // The fins: the tall one on the back, leaning back at its tip; a little second one and the one under the
    // tail; the long stiff fins of the chest, swept back and down; and the small pair under the hips.
    b.part('dorsal', { parent: 'body', pivot: [0, 25.5, 10], from: [-0.75, 0, -7], size: [1.5, 7.5, 14], paint: finPaint(false) });
    b.part('dorsalTip', { parent: 'dorsal', pivot: [0, 7.5, -2], from: [-0.75, 0, -4], size: [1.5, 6.5, 8], rotation: [-0.55, 0, 0], paint: finPaint(false) });
    b.part('dorsal2', { parent: 'tail1', pivot: [0, 6, -8], from: [-0.5, 0, -2], size: [1, 2.5, 3], rotation: [-0.4, 0, 0], paint: finPaint(false) });
    b.part('anal', { parent: 'tail1', pivot: [0, -6.5, -8], from: [-0.5, -2.5, -2], size: [1, 2.5, 3], rotation: [0.4, 0, 0], paint: finPaint(true) });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`pectoral${side}`, { parent: 'chest', pivot: [9.5 * sign, 7, 8], from: [sign > 0 ? 0 : -22, -0.75, -5], size: [22, 1.5, 10], rotation: [0, 0.55 * sign, -0.3 * sign], paint: finPaint(true) });
        b.part(`pelvic${side}`, { parent: 'tail0', pivot: [5 * sign, -8, -4], from: [sign > 0 ? 0 : -5, -0.5, -2], size: [5, 1, 4], rotation: [0, 0.6 * sign, -0.5 * sign], paint: finPaint(true) });
    });
    return { head: 'head', tail: ['tail0', 'tail1', 'tail2'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('megalodon', {
    info: { eggColor: 0x4f5d6b, tone: 70, hostile: true, attackDamage: 5, chaseDistance: 14, chaseSpeed: 2.2, maxHealth: 80, speed: 1.2, variants: 2, movement: 'cruise', seaDepth: 0.45, hiddenUntilDiscovered: true },
    model: megalodonModel,
    surface: 'skin',
    drops: [['raw_fish', 3, 6]],
    trap: { baits: [] },
    fossil: { source: 'skeleton', rarity: 'legendary', weight: 2, water: 300 },
    card: {
        name: 'Megalodon', habitat: 'Warm seas all over the world, from about 23 to 3.6 million years ago', activity: 'Day and night', temperament: 'Hostile',
        description: 'The biggest shark that ever lived: 15 metres or more, with teeth as big as a hand. It goes for whoever swims in its water. On the shore you are safe.'
    },
    cardEs: {
        name: 'Megalodón', habitat: 'Mares cálidos de todo el mundo, de hace unos 23 a 3,6 millones de años',
        description: 'El tiburón más grande que ha existido: 15 metros o más, con dientes del tamaño de una mano. Va a por quien nade en su agua. En la orilla estás a salvo.'
    }
});
