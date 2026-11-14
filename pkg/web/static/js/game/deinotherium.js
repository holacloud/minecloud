// Deinotherium: an extinct animal (js/mobSpecies.js), a distant relative of the elephants, found as a rare
// fossil in the deep rock and brought back by the revival machine. Taller than any elephant of today, on
// long legs, with a short trunk and, what nobody else has, two tusks in its lower jaw that curve down and
// back towards its chest. It grazes and walks as any ground mob (js/game/mobs.js), so the server walks a
// kept one (js/game/animals.js), and it is peaceful: nothing here is its own but its looks.

// A tusk of one side (1 the left, -1 the right), as pieces hanging from the head, each at the place and the
// turn worked out here, once (pieces hanging from one another would be read as a tower by what measures a
// model without turning its parts: js/models.js, js/game/herd.js). Each row: width, length, how much it
// points down (radians: more than a right angle points down and back) and how much outwards. Straight down
// from the tip of the jaw, then bending back under it.
const DEINOTHERIUM_TUSK = [[2.75, 5.5, 1.45, 0.08], [2.5, 5, 1.95, 0.06], [2.25, 4.5, 2.45, 0.03], [1.75, 3.5, 2.85, 0]];

function deinotheriumTusk(sign) {
    let at = [2.25 * sign, -16, 12.5];
    return DEINOTHERIUM_TUSK.map(([width, length, down, out]) => {
        const piece = { width, length, pivot: at, rotation: [down, out * sign, 0] };
        // Along its own +z, turned about y and then about x (an Euler XYZ of THREE).
        const dir = [Math.sin(out * sign), -Math.cos(out) * Math.sin(down), Math.cos(out) * Math.cos(down)];
        at = at.map((value, axis) => value + dir[axis] * (length - 0.5));
        return piece;
    });
}
const DEINOTHERIUM_TUSKS = [deinotheriumTusk(1), deinotheriumTusk(-1)];

// Wrinkles of a thick grey skin: short dark lines across a face.
function deinotheriumWrinkles(p, color, step = 2.5) {
    for (let y = 1, i = 0; y < p.h; y += step, i++) {
        for (let x = 0, j = 0; x < p.w; j++) {
            const r = Math.abs(Math.sin(i * 7.31 + j * 3.77 + p.w));
            if (r > 0.45) p.rect(x, y + (r > 0.8 ? 0.5 : 0), 1.5 + r * 2.5, 0.5, color, 0.04);
            x += 3 + r * 4;
        }
    }
}

// Faces +z. An elephant on longer legs, its back sloping down from high shoulders, a long flat skull, big
// ears that fan out, the short trunk (two pieces made along +z and bent down, swayed by the rig as a tail)
// and the lower jaw sticking down and forward with the tusks at its tip.
function deinotheriumModel(b) {
    const hide = 0x7f7469;
    const dark = 0x5c534b;
    const crease = 0x655c54;
    const pale = 0x968b80;
    const tusk = 0xe8dcc0;
    const hidePaint = { color: hide, noise: 0.07, all: (p, face) => {
        if (face === 'bottom') { p.fill(dark, 0.06); return; }
        if (face === 'top') return;
        deinotheriumWrinkles(p, crease, 3);
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-11.5, 28, -18], size: [23, 23, 36], paint: hidePaint });
    b.part('back', { parent: 'body', pivot: [0, 51, 3], from: [-10.5, -0.5, -17], size: [21, 3, 31], paint: hidePaint });
    b.part('withers', { parent: 'back', pivot: [0, 2.5, 8], from: [-9, -0.5, -9], size: [18, 3.5, 16], paint: hidePaint });

    b.part('head', {
        parent: 'body', pivot: [0, 49, 17], from: [-7.5, -12, -1], size: [15, 13, 14],
        paint: {
            color: hide, noise: 0.06,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(dark, 0.05); return; }
                if (face === 'top') { p.rect(2, 0, p.w - 4, p.h, pale, 0.05); return; }
                deinotheriumWrinkles(p, crease, 3.5);
                if (face !== 'left' && face !== 'right') return;
                // A small eye with a heavy lid, and a dark streak below it (as an elephant's temples weep).
                const eye = face === 'left' ? p.w - 5 : 2.5;
                p.rect(eye - 0.5, 4, 3, 2.25, dark, 0.03);
                p.rect(eye, 4.5, 1.5, 1.25, 0x120d0a, 0);
                p.rect(eye + (face === 'left' ? 1 : 0), 4.5, 0.5, 0.5, 0xffffff, 0);
                p.rect(eye - 0.5, 3.75, 3, 0.5, crease, 0);
                p.rect(eye + 0.5, 6.5, 1, 3, crease, 0.04);
            }
        }
    });
    // Big ears that fan back from the sides of its head: grey and wrinkled outside, pinker inside.
    const earPaint = (inside) => ({ color: hide, noise: 0.07, all: (p, face) => {
        if (face === inside) { p.fill(0x9a8279, 0.05); p.rect(0, 0, p.w, 1, dark, 0.04); return; }
        if (face === 'left' || face === 'right') deinotheriumWrinkles(p, crease, 2.5);
    } });
    b.part('earL', { parent: 'head', pivot: [7.5, 0.5, 5], from: [-0.25, -11, -12], size: [1, 13, 12], paint: earPaint('left'), rotation: [0, -0.75, 0] });
    b.part('earR', { parent: 'head', pivot: [-7.5, 0.5, 5], from: [-0.75, -11, -12], size: [1, 13, 12], paint: earPaint('right'), rotation: [0, 0.75, 0] });

    // The short trunk, ringed, and the lower jaw under it, long and bent down, with the tusks at its tip.
    const trunkPaint = { color: hide, noise: 0.06, all: (p, face) => {
        if (face === 'front' || face === 'back') return;
        for (let y = 1; y < p.h; y += 1.75) p.rect(0, y, p.w, 0.5, crease, 0.04);
    } };
    b.part('trunk0', { parent: 'head', pivot: [0, -6, 12.5], from: [-3.25, -3.25, 0], size: [6.5, 6.5, 7], paint: trunkPaint, rotation: [1.1, 0, 0] });
    b.part('trunk1', { parent: 'trunk0', pivot: [0, 0, 6.5], from: [-2.5, -2.5, 0], size: [5, 5, 7.5], paint: trunkPaint, rotation: [0.35, 0, 0] });
    b.part('trunkTip', { parent: 'trunk1', pivot: [0, 0, 7.25], from: [-2.75, -2.75, 0], size: [5.5, 5.5, 1.25], paint: { color: dark, noise: 0.05, faces: { front: (p) => { p.rect(1, 2, 1.25, 1.5, 0x120d0a, 0); p.rect(3.25, 2, 1.25, 1.5, 0x120d0a, 0); } } } });
    b.part('jaw', { parent: 'head', pivot: [0, -12, 6], from: [-4, -4.5, -4], size: [8, 5, 10], paint: { color: dark, noise: 0.06, faces: { front: (p) => p.rect(1, 0, p.w - 2, 1, 0x8e5d58, 0.05) } }, rotation: [0.3, 0, 0] });
    DEINOTHERIUM_TUSKS.forEach((pieces, side) => pieces.forEach((piece, i) => {
        const w = piece.width;
        b.part(`tusk${side ? 'R' : 'L'}${i}`, {
            parent: 'head', pivot: piece.pivot, from: [-w / 2, -w / 2, 0], size: [w, w, piece.length], rotation: piece.rotation,
            paint: { color: i === 0 ? 0xd4c39e : tusk, noise: 0.04, surface: 'smooth' }
        });
    }));

    b.part('tail', { parent: 'body', pivot: [0, 48, -18], from: [-0.75, -12, -0.75], size: [1.5, 12, 1.5], paint: { color: hide, noise: 0.06 }, rotation: [0.15, 0, 0] });
    b.part('tailTuft', { parent: 'tail', pivot: [0, -12, 0], from: [-1.25, -3, -1.25], size: [2.5, 3, 2.5], paint: { color: 0x2c2622, noise: 0.1 } });
    // Long pillar legs with wrinkled knees and broad round feet.
    const legs = VoxelModels.quadLegs(b, {
        size: [7.5, 32, 7.5], hipY: 32, x: 7.25, zFront: 11, zBack: -11.5,
        paint: { color: hide, noise: 0.07, all: (p, face) => {
            if (face === 'top') return;
            if (face === 'bottom') { p.fill(crease, 0.04); return; }
            for (let y = 15; y < 21; y += 1.5) p.rect(0, y, p.w, 0.5, crease, 0.04);
            p.rect(0, p.h - 2.5, p.w, 2.5, dark, 0.05);
            if (face === 'front') for (let x = 1; x < p.w - 1; x += 2.5) p.rect(x, p.h - 1.25, 1.5, 1, 0xcfc4ad, 0.03);
        } }
    });
    return { legs, head: 'head', tail: ['tail', 'trunk1'] };
}

registerSpecies('deinotherium', {
    info: { eggColor: 0x7f7469, tone: 95, maxHealth: 48, speed: 0.42, grazer: true, hiddenUntilDiscovered: true },
    model: deinotheriumModel,
    surface: 'skin',
    drops: [['leather', 3, 5]],
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Deinotherium', habitat: 'Forests and plains of Europe, Asia and Africa, from 15 million to 1 million years ago', activity: 'Day', temperament: 'Passive',
        description: 'A relative of the elephants taller than any elephant of today, up to 4 metres at the shoulder. Its two tusks grew in its lower jaw and curved down and back. It strips leaves from the trees and harms nobody.'
    },
    cardEs: {
        name: 'Deinoterio', habitat: 'Bosques y llanuras de Europa, Asia y África, desde hace 15 millones hasta hace 1 millón de años',
        description: 'Un pariente de los elefantes más alto que cualquier elefante de hoy, de hasta 4 metros hasta la cruz. Sus dos colmillos crecían en la mandíbula de abajo y se curvaban hacia abajo y hacia atrás. Arranca hojas de los árboles y no hace daño a nadie.'
    }
});
