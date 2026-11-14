// Mammoth: an extinct animal (js/mobSpecies.js) of the Ice Age, a cousin of the elephants of today, found
// as a skeleton of three pieces and brought back by the revival machine. A woolly elephant taller than a
// room: a shaggy brown coat, a high domed head, small ears, a trunk that sways and two long tusks that curl
// out, up and in. It grazes and walks as any ground mob (js/game/mobs.js), so the server walks a kept one
// (js/game/animals.js). What is its own is what it does when struck: it trumpets, turns on whoever hit it,
// lowers its tusks and charges once (js/game/charge.js, with the numbers below).

// The charge, in seconds and blocks (js/game/charge.js says what each one is). Slower to start and harder
// to stop than a pig's: it reaches far, because its tusks are two blocks in front of its middle.
const MAMMOTH_CHARGE = { aim: 1, run: 0.7, pace: 6, reach: 2.6, whisker: 1.6, tall: 2.5, damage: 4, shove: 10, lift: 5, rest: 1.5, leash: 12, reason: 'You were tossed by a mammoth', cry: [330, 620, 0.7] };

// A tusk of one side (1 the left, -1 the right), as pieces hanging from the head, each at the place and the
// turn worked out here, once: pieces hanging from one another would be read as a tower by what measures a
// model without turning its parts (js/models.js, js/game/herd.js). Each row: width, length, how much it
// points down (radians; less than 0 is up) and how much it points outwards. Out and down from the jaw,
// then forward, up and back in towards the other one: the curl of a mammoth's tusks.
const MAMMOTH_TUSK = [[2.75, 6, 0.95, 0.4], [2.5, 6, 0.3, 0.35], [2.25, 6, -0.35, 0.15], [2, 5.5, -0.95, -0.3], [1.5, 4.5, -1.35, -0.75]];

function mammothTusk(sign) {
    let at = [4.5 * sign, -10.5, 10.5];
    return MAMMOTH_TUSK.map(([width, length, down, out]) => {
        const piece = { width, length, pivot: at, rotation: [down, out * sign, 0] };
        // Along its own +z, turned about y and then about x (an Euler XYZ of THREE).
        const dir = [Math.sin(out * sign), -Math.cos(out) * Math.sin(down), Math.cos(out) * Math.cos(down)];
        at = at.map((value, axis) => value + dir[axis] * (length - 0.6));
        return piece;
    });
}
const MAMMOTH_TUSKS = [mammothTusk(1), mammothTusk(-1)];

// Long hair hanging in strands of different lengths, from the top of a face down (y grows downwards).
function mammothStrands(p, color, from = 0, step = 1) {
    for (let x = 0, i = 0; x < p.w; x += step, i++) {
        const length = (p.h - from) * (0.35 + 0.65 * Math.abs(Math.sin(i * 12.9898 + p.w * 3.1)));
        p.rect(x, p.h - length, step / 2, length, color, 0.1);
    }
}

// Faces +z. A body like a barrel on four pillars, higher at the shoulders than at the rump, and a skirt of
// hair hanging along each flank. The trunk is three pieces made along +z and bent down: the rig sways them
// as a tail (rotation about their own y), which swings the trunk from side to side.
function mammothModel(b) {
    const coat = 0x6e4528;
    const dark = 0x432816;
    const ginger = 0x93613a;
    const skin = 0x58422f;
    const tusk = 0xeee2c4;
    const shade = 0x5a3820;
    const coatPaint = { color: coat, noise: 0.1, all: (p, face) => {
        if (face === 'bottom') { p.fill(dark, 0.08); return; }
        if (face === 'top') { p.spots(ginger, 6, 1.5, 3); return; }
        mammothStrands(p, shade, 0, 2);
        p.spots(ginger, 5, 1, 2.5, 3);
    } };
    const hairPaint = { color: dark, noise: 0.12, all: (p, face) => { if (face !== 'top' && face !== 'bottom') mammothStrands(p, 0x2e1b0e, 0, 1); } };

    b.part('body', { pivot: [0, 0, 0], from: [-12.5, 21, -19], size: [25, 22, 38], paint: coatPaint });
    // The shoulders, the highest point of its back, and the back sloping down to the rump behind them.
    b.part('back', { parent: 'body', pivot: [0, 43, 0], from: [-11.5, -0.5, -14], size: [23, 3, 31], paint: coatPaint });
    b.part('withers', { parent: 'back', pivot: [0, 2.5, 8], from: [-10.5, -0.5, -10], size: [21, 4, 19], paint: coatPaint });
    b.part('hump', { parent: 'withers', pivot: [0, 3.5, 1], from: [-7.5, -0.5, -6], size: [15, 3, 11], paint: coatPaint });
    // The skirt of long hair along each flank and under the chest, down to its knees.
    b.part('skirtL', { parent: 'body', pivot: [12.5, 23, 0], from: [0, -8, -17.5], size: [1.5, 12, 35], paint: hairPaint });
    b.part('skirtR', { parent: 'body', pivot: [-12.5, 23, 0], from: [-1.5, -8, -17.5], size: [1.5, 12, 35], paint: hairPaint });
    b.part('bib', { parent: 'body', pivot: [0, 23, 19], from: [-10, -7, -1.5], size: [20, 10, 2], paint: hairPaint });

    // The head, high and domed, carried in front of the shoulders.
    b.part('head', {
        parent: 'body', pivot: [0, 43, 17], from: [-8, -14, -1], size: [16, 17, 13],
        paint: {
            color: coat, noise: 0.08,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(dark, 0.06); return; }
                if (face === 'top') { p.fill(dark, 0.1); return; }
                if (face === 'front') {
                    // The brow over the trunk, and the hair of the forehead hanging over it.
                    mammothStrands(p, dark, p.h - 6, 1);
                    p.rect(4, p.h - 4, p.w - 8, 4, skin, 0.06);
                    return;
                }
                if (face !== 'left' && face !== 'right') return;
                // A small eye, low and forward, in a patch of bare dark skin, and long hair on the cheeks.
                mammothStrands(p, shade, 4, 2);
                const eye = face === 'left' ? p.w - 4.5 : 2;
                p.rect(eye - 0.5, 7.5, 3.5, 2.5, skin, 0.04);
                p.rect(eye + 0.5, 8, 1.5, 1.5, 0x0f0a07, 0);
                p.rect(eye + (face === 'left' ? 1.5 : 0.5), 8, 0.5, 0.5, 0xffffff, 0);
                p.rect(eye - 0.5, 7, 3.5, 0.5, 0x1e130b, 0);
            }
        }
    });
    b.part('dome', { parent: 'head', pivot: [0, 3, 4.5], from: [-6, -0.5, -5.5], size: [12, 5.5, 9], paint: { color: dark, noise: 0.12, all: (p, face) => { if (face !== 'top' && face !== 'bottom') mammothStrands(p, 0x2e1b0e, 0, 1); } } });
    b.part('domeTop', { parent: 'dome', pivot: [0, 5, -0.5], from: [-4, -0.5, -3.5], size: [8, 2, 6], paint: { color: dark, noise: 0.12 } });
    // Small ears, under the hair: big ears lose heat, and it lived in the cold.
    const earPaint = { color: dark, noise: 0.1, faces: { front: (p) => p.rect(0.5, 0.5, p.w - 1, p.h - 1, skin, 0.05) } };
    b.part('earL', { parent: 'head', pivot: [8, -2, 3], from: [-0.5, -3, -2], size: [1.75, 6, 4.5], paint: earPaint, rotation: [0, -0.35, 0] });
    b.part('earR', { parent: 'head', pivot: [-8, -2, 3], from: [-1.25, -3, -2], size: [1.75, 6, 4.5], paint: earPaint, rotation: [0, 0.35, 0] });

    // The trunk: hair at its root, bare and ringed towards the tip, and the tip curled forward.
    const trunkPaint = (hairy) => ({ color: hairy ? coat : skin, noise: 0.08, all: (p, face) => {
        if (face === 'front' || face === 'back') return;
        for (let y = 1; y < p.h; y += 2) p.rect(0, y, p.w, 0.5, 0x2a1d15, 0.04);
        if (hairy) mammothStrands(p, shade, 0, 1.5);
    } });
    b.part('trunk0', { parent: 'head', pivot: [0, -11, 11.5], from: [-3.5, -3.5, 0], size: [7, 7, 8], paint: trunkPaint(true), rotation: [1.3, 0, 0] });
    b.part('trunk1', { parent: 'trunk0', pivot: [0, 0, 7.5], from: [-2.75, -2.75, 0], size: [5.5, 5.5, 10], paint: trunkPaint(false), rotation: [0.15, 0, 0] });
    b.part('trunk2', { parent: 'trunk1', pivot: [0, 0, 9.5], from: [-2.25, -2.25, 0], size: [4.5, 4.5, 6], paint: trunkPaint(false), rotation: [-0.55, 0, 0] });
    b.part('trunkTip', { parent: 'trunk2', pivot: [0, 0, 5.75], from: [-2.5, -2.5, 0], size: [5, 5, 1.5], paint: { color: skin, noise: 0.05, faces: { front: (p) => { p.rect(1, 1.5, 1, 1.5, 0x120c08, 0); p.rect(3, 1.5, 1, 1.5, 0x120c08, 0); } } } });

    // The tusks: ivory, yellower at the root, each piece a little thinner than the one before.
    MAMMOTH_TUSKS.forEach((pieces, side) => pieces.forEach((piece, i) => {
        const w = piece.width;
        b.part(`tusk${side ? 'R' : 'L'}${i}`, {
            parent: 'head', pivot: piece.pivot, from: [-w / 2, -w / 2, 0], size: [w, w, piece.length], rotation: piece.rotation,
            paint: { color: i === 0 ? 0xd9c79c : tusk, noise: 0.04, surface: 'smooth' }
        });
    }));

    b.part('tail', { parent: 'body', pivot: [0, 41, -19], from: [-1, -9, -1], size: [2, 9, 2], paint: { color: dark, noise: 0.08 }, rotation: [0.2, 0, 0] });
    b.part('tailTuft', { parent: 'tail', pivot: [0, -9, 0], from: [-1.5, -4, -1.5], size: [3, 4, 3], paint: { color: 0x2e1b0e, noise: 0.12 } });
    // Pillars for legs, shaggy down to the ankle, and a broad round foot with pale toenails.
    const legs = VoxelModels.quadLegs(b, {
        size: [8.5, 27, 8.5], hipY: 27, x: 7.75, zFront: 11, zBack: -12,
        paint: { color: coat, noise: 0.1, all: (p, face) => {
            if (face === 'top') return;
            if (face === 'bottom') { p.fill(skin, 0.05); return; }
            mammothStrands(p, shade, 0, 2);
            p.rect(0, p.h - 3, p.w, 3, skin, 0.06);
            if (face === 'front') for (let x = 1; x < p.w - 1; x += 2.5) p.rect(x, p.h - 1.5, 1.5, 1, 0xcbbd9f, 0.03);
        } }
    });
    return { legs, head: 'head', tail: ['tail', 'trunk1', 'trunk2'] };
}

registerSpecies('mammoth', {
    info: { eggColor: 0x6e4528, tone: 110, maxHealth: 48, speed: 0.4, grazer: true, charge: MAMMOTH_CHARGE, hiddenUntilDiscovered: true },
    model: mammothModel,
    surface: 'fur',
    drops: [['fur', 3, 5], ['leather', 2, 4]],
    trap: { baits: [] },
    fossil: { source: 'skeleton', rarity: 'rare', weight: 6 },
    card: {
        name: 'Mammoth', habitat: 'Cold steppes of Europe, Asia and North America, from 400,000 to 4000 years ago', activity: 'Day', temperament: 'Neutral',
        description: 'A woolly elephant of the Ice Age, about 3 metres tall, with long curled tusks and a coat of thick hair against the cold. It grazes in peace, but if you hit it, it trumpets and charges.'
    },
    cardEs: {
        name: 'Mamut', habitat: 'Estepas frías de Europa, Asia y Norteamérica, desde hace 400 000 hasta hace 4000 años',
        description: 'Un elefante lanudo de la Edad de Hielo, de unos 3 metros de alto, con colmillos largos y curvados y un pelo espeso contra el frío. Pasta tranquilo, pero si le pegas, barrita y embiste.'
    }
});
