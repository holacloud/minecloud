// Triceratops: an extinct animal (js/mobSpecies.js), one of the last dinosaurs, found as a rare fossil in
// the deep rock and brought back by the revival machine. Six blocks long, on four strong legs, with a head
// that is a third of it: a parrot's beak, a short horn on its nose, two long ones over its eyes and a great
// frill of bone behind them. It grazes and walks as any ground mob (js/game/mobs.js), so the server walks a
// kept one (js/game/animals.js). What is its own is what it does when struck: it bellows, turns on whoever
// hit it, lowers its horns and charges once (js/game/charge.js, with the numbers below).

// The charge, in seconds and blocks (js/game/charge.js says what each one is). Its horns are three blocks
// in front of its middle, so they reach far, and it stops short of a wall it would put its head through.
const TRICERATOPS_CHARGE = { aim: 1, run: 0.6, pace: 6.5, reach: 3, whisker: 2.4, tall: 2, damage: 4, shove: 11, lift: 4, rest: 1.5, leash: 12, reason: 'You were gored by a triceratops', cry: [70, 50, 0.6] };

// A horn of the brow of one side (1 the left, -1 the right), as pieces hanging from the head, each at the
// place and the turn worked out here, once (pieces hanging from one another would be read as a tower by what
// measures a model without turning its parts: js/models.js, js/game/herd.js). Each row: width, length, how
// much it points down (less than 0 is up) and how much outwards. Forward and up, then forward and in.
const TRICERATOPS_HORN = [[3, 7, -0.65, 0.2], [2.5, 6.5, -0.45, 0.1], [2, 6, -0.3, 0], [1.25, 4, -0.15, -0.05]];

function triceratopsHorn(sign) {
    let at = [4.25 * sign, 5, 8];
    return TRICERATOPS_HORN.map(([width, length, down, out]) => {
        const piece = { width, length, pivot: at, rotation: [down, out * sign, 0] };
        // Along its own +z, turned about y and then about x (an Euler XYZ of THREE).
        const dir = [Math.sin(out * sign), -Math.cos(out) * Math.sin(down), Math.cos(out) * Math.cos(down)];
        at = at.map((value, axis) => value + dir[axis] * (length - 0.5));
        return piece;
    });
}
const TRICERATOPS_HORNS = [triceratopsHorn(1), triceratopsHorn(-1)];

// Faces +z. A long heavy body, higher at the hips than at the shoulders, on pillar legs (the back ones
// longer), a thick tail held off the ground and the head carried low in front. The frill stands up behind
// the head, leaning back a little: it is one plate, so it is read at its height without the lean, half a
// block at most above the truth.
function triceratopsModel(b) {
    const hide = 0x6b7246;
    const dark = 0x484e2f;
    const belly = 0xa29d70;
    const frillColor = 0x9a6a36;
    const rim = 0xc58d4b;
    const horn = 0xe3d7b6;
    const beak = 0x2f2a24;
    // Skin of round scales, bigger along the back, and a paler belly.
    const hidePaint = { color: hide, noise: 0.07, all: (p, face) => {
        if (face === 'bottom') { p.fill(belly, 0.05); return; }
        if (face === 'top') { p.spots(dark, 10, 1, 2.5); return; }
        p.spots(dark, 8, 1, 2, 5);
        p.rect(0, p.h - 3, p.w, 3, belly, 0.05);
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-12, 14, -22], size: [24, 19, 41], paint: hidePaint });
    b.part('hips', { parent: 'body', pivot: [0, 33, -10], from: [-11, -0.5, -11], size: [22, 5.5, 21], paint: hidePaint });
    b.part('shoulders', { parent: 'body', pivot: [0, 33, 9], from: [-10.5, -0.5, -9], size: [21, 3, 17], paint: hidePaint });

    b.part('head', {
        parent: 'body', pivot: [0, 24, 18], from: [-7.5, -8.5, -1], size: [15, 14, 16],
        paint: {
            color: hide, noise: 0.06,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(belly, 0.05); return; }
                if (face === 'top') { p.spots(dark, 3, 1, 2); return; }
                if (face !== 'left' && face !== 'right') return;
                // A small fierce eye under the horn, and the line of the mouth back to the cheek.
                const eye = face === 'left' ? p.w - 7 : 4.5;
                p.rect(eye - 0.5, 3, 3, 2.25, dark, 0.03);
                p.rect(eye, 3.5, 1.75, 1.25, 0xd7a43a, 0);
                p.rect(eye + 0.5, 3.5, 0.75, 1.25, 0x0f0c08, 0);
                p.rect(eye - 0.5, 2.5, 3, 0.5, 0x2c301c, 0);
                p.rect(face === 'left' ? p.w - 9 : 0, p.h - 4, 9, 0.5, 0x2c301c, 0);
                p.rect(face === 'left' ? p.w - 6 : 0, p.h - 3.5, 6, 3.5, belly, 0.05);
            }
        }
    });
    // The beak, hooked like a parrot's, for snipping tough plants.
    b.part('beak', { parent: 'head', pivot: [0, -2, 14.5], from: [-4, -6.5, 0], size: [8, 9, 5.5], paint: { color: hide, noise: 0.05, all: (p, face) => {
        if (face === 'top') return;
        p.rect(0, p.h - 4, p.w, 4, beak, 0.04);
        if (face === 'front') { p.rect(1.5, 1.5, 1, 1, 0x1c1914, 0); p.rect(p.w - 2.5, 1.5, 1, 1, 0x1c1914, 0); }
    } } });
    b.part('beakTip', { parent: 'beak', pivot: [0, -6.5, 5.5], from: [-2.75, -1.5, -0.5], size: [5.5, 3.5, 2.5], paint: { color: beak, noise: 0.04, surface: 'smooth' } });
    const hornPaint = (root) => ({ color: root ? 0xb9ab8a : horn, noise: 0.04, surface: 'smooth' });
    b.part('noseHorn', { parent: 'head', pivot: [0, 5.5, 13], from: [-1.25, -0.5, -1.25], size: [2.5, 4.5, 2.5], paint: hornPaint(false), rotation: [0.45, 0, 0] });
    TRICERATOPS_HORNS.forEach((pieces, side) => pieces.forEach((piece, i) => {
        const w = piece.width;
        b.part(`horn${side ? 'R' : 'L'}${i}`, { parent: 'head', pivot: piece.pivot, from: [-w / 2, -w / 2, 0], size: [w, w, piece.length], rotation: piece.rotation, paint: hornPaint(i === 0) });
    }));
    // The frill: a shield of bone with a row of knobs round its edge and a pattern on its face.
    b.part('frill', {
        parent: 'head', pivot: [0, 2, 1.5], from: [-15, -4, -2.5], size: [30, 22, 2.5], rotation: [-0.3, 0, 0],
        paint: { color: frillColor, noise: 0.06, all: (p, face) => {
            if (face === 'bottom') return;
            if (face === 'top') { for (let x = 0.5; x < p.w; x += 3) p.rect(x, 0, 2, p.h, rim, 0.05); return; }
            if (face === 'left' || face === 'right') { for (let y = 0.5; y < p.h; y += 3) p.rect(0, y, p.w, 2, rim, 0.05); return; }
            p.rect(0, 0, p.w, 2.5, rim, 0.05);
            p.rect(0, 0, 2.5, p.h, rim, 0.05);
            p.rect(p.w - 2.5, 0, 2.5, p.h, rim, 0.05);
            for (let x = 1; x < p.w - 1; x += 3) p.rect(x, 0, 1.5, 1, 0xe8c48a, 0.04);
            if (face !== 'front') return;
            // Ridges of the bone fanning out from the middle, where the blood vessels ran.
            for (let i = -2; i <= 2; i++) p.rect(p.w / 2 - 0.75 + i * 4.5, 3 + Math.abs(i) * 1.5, 1.5, p.h - 3 - Math.abs(i) * 3, 0x7a5228, 0.05);
        } }
    });

    // The tail: thick at the root, held up behind it, swayed by the rig.
    b.part('tail', { parent: 'body', pivot: [0, 27, -22], from: [-5, -5, -11], size: [10, 10, 11.5], paint: hidePaint, rotation: [-0.12, 0, 0] });
    b.part('tail1', { parent: 'tail', pivot: [0, -0.5, -11], from: [-3.5, -3.5, -10], size: [7, 7, 10.5], paint: hidePaint, rotation: [-0.08, 0, 0] });
    b.part('tail2', { parent: 'tail1', pivot: [0, 0, -10], from: [-2.25, -2.25, -9], size: [4.5, 4.5, 9.5], paint: hidePaint, rotation: [0.06, 0, 0] });
    b.part('tail3', { parent: 'tail2', pivot: [0, 0, -9], from: [-1.25, -1.25, -6], size: [2.5, 2.5, 6.5], paint: { color: hide, noise: 0.07 }, rotation: [0.06, 0, 0] });

    // Pillar legs: the front ones shorter and set wider, the back ones longer, each with three hoofed toes.
    const legPaint = { color: hide, noise: 0.07, all: (p, face) => {
        if (face === 'top') return;
        if (face === 'bottom') { p.fill(0x2b2c1c, 0.04); return; }
        p.spots(dark, 3, 1, 1.5, 7);
        p.rect(0, p.h - 2, p.w, 2, dark, 0.05);
        if (face === 'front') for (let x = 0.75; x < p.w - 0.5; x += 2.5) p.rect(x, p.h - 1.25, 1.5, 1.25, 0x9a8f72, 0.03);
    } };
    b.part('legFL', { parent: 'body', pivot: [8.5, 17, 12], from: [-3.75, -17, -4], size: [7.5, 17, 8], paint: legPaint });
    b.part('legFR', { parent: 'body', pivot: [-8.5, 17, 12], from: [-3.75, -17, -4], size: [7.5, 17, 8], paint: legPaint });
    b.part('legBL', { parent: 'body', pivot: [8, 22, -12], from: [-4.25, -22, -4.75], size: [8.5, 22, 9.5], paint: legPaint });
    b.part('legBR', { parent: 'body', pivot: [-8, 22, -12], from: [-4.25, -22, -4.75], size: [8.5, 22, 9.5], paint: legPaint });
    return { legs: ['legFL', 'legFR', 'legBL', 'legBR'], head: 'head', tail: ['tail', 'tail1', 'tail2', 'tail3'] };
}

registerSpecies('triceratops', {
    info: { eggColor: 0x6b7246, tone: 85, maxHealth: 44, speed: 0.36, grazer: true, charge: TRICERATOPS_CHARGE, hiddenUntilDiscovered: true },
    model: triceratopsModel,
    surface: 'skin',
    drops: [['leather', 3, 5]],
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Triceratops', habitat: 'Plains and forests of western North America, from 68 to 66 million years ago', activity: 'Day', temperament: 'Neutral',
        description: 'A plant-eating dinosaur about 9 metres long, with three horns, a beak like a parrot and a great frill of bone behind its head. It lived until the very end of the dinosaurs. Leave it in peace: if you hit it, it lowers its horns and charges.'
    },
    cardEs: {
        name: 'Triceratops', habitat: 'Llanuras y bosques del oeste de Norteamérica, desde hace 68 hasta hace 66 millones de años',
        description: 'Un dinosaurio herbívoro de unos 9 metros de largo, con tres cuernos, un pico de loro y una gran gola de hueso detrás de la cabeza. Vivió hasta el final de los dinosaurios. Déjalo tranquilo: si le pegas, baja los cuernos y embiste.'
    }
});
