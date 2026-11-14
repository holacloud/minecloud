// Callichimaera, the "beautiful chimera": an extinct animal (js/mobSpecies.js) and an ancient relative of the
// crab, found as a rare fossil in the deep rock and brought back by the revival machine. A crab no bigger
// than a coin that swam: huge eyes with nothing to hide them in, a body longer than it is wide, and legs
// flattened into paddles. It looks like the larva of a crab that grew up without changing. It walks as any
// ground mob (js/game/mobs.js), so the server walks a kept one (js/game/animals.js), and forwards: it does
// not move as the crab of js/game/crab.js does ('scuttle'), whose manner is to run sideways and to bury
// itself, two things this animal could not do with that body and those eyes.

// Faces +z. A spindle of a shell with the two eyes in front, each more than half as wide as the body; small
// claws bent under them; two pairs of oars to the sides, which the rig rows with (legAxis 'y'); two pairs of
// thin little legs behind them, and the tail out in the open, straight back, where a crab tucks its own
// under its body. Every size is a number of quarters of a unit: a texel is half a unit, and a smaller box
// is not painted.
function callichimaeraModel(b, variant) {
    const palettes = [
        { shell: 0xd9825a, dark: 0xa85436, light: 0xf0b48c, belly: 0xf6e2cc, blade: 0xf2c49a },
        { shell: 0x8fa8a0, dark: 0x5c7a74, light: 0xc2d6cc, belly: 0xeef2e6, blade: 0xb8d0c4 }
    ];
    const c = palettes[variant % palettes.length];
    const shellPaint = { color: c.shell, noise: 0.06, bevel: 0.12, all: (p, face) => {
        if (face === 'bottom') { p.fill(c.belly, 0.04); return; }
        if (face === 'top') {
            // The ridge that runs along the shell, and a paler line down each side of it.
            p.rect(p.w / 2 - 0.25, 0, 0.5, p.h, c.dark, 0.04);
            p.rect(0.5, 0.5, 0.5, p.h - 1, c.light, 0.04);
            p.rect(p.w - 1, 0.5, 0.5, p.h - 1, c.light, 0.04);
            return;
        }
        p.rect(0, p.h - 0.5, p.w, 0.5, c.belly, 0.04);
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-1.25, 1, -2], size: [2.5, 1.5, 4], paint: shellPaint });
    b.part('brow', { parent: 'body', pivot: [0, 1.25, 2], from: [-1, 0, 0], size: [2, 1, 0.75], paint: shellPaint });
    b.part('mouth', { parent: 'body', pivot: [0, 1, 2], from: [-0.75, 0, 0], size: [1.5, 0.5, 0.5], paint: { color: c.belly, noise: 0.05, faces: { front: (p) => p.rect(0.5, 0, 0.5, p.h, c.dark, 0) } } });
    // The tail, in two pieces: it sways as it goes (the rig's `tail`).
    b.part('tail', { parent: 'body', pivot: [0, 1.75, -2], from: [-0.875, -0.5, -1.25], size: [1.75, 1, 1.25], paint: shellPaint, rotation: [-0.2, 0, 0] });
    b.part('tailTip', { parent: 'tail', pivot: [0, 0, -1.25], from: [-0.625, -0.375, -1], size: [1.25, 0.75, 1], paint: shellPaint, rotation: [-0.25, 0, 0] });

    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        // The eye: a short stalk and a ball far too big for it, dark and shiny.
        b.part(`stalk${side}`, { parent: 'brow', pivot: [0.7 * sign, 1, 0.4], from: [-0.25, 0, -0.25], size: [0.5, 0.5, 0.5], paint: { color: c.light, noise: 0.04 } });
        b.part(`eye${side}`, {
            parent: `stalk${side}`, pivot: [0.1 * sign, 0.25, 0.15], from: [-0.75, 0, -0.75], size: [1.5, 1.5, 1.5],
            paint: { color: 0x0d0b0a, noise: 0.02, bevel: 0, all: (p, face) => {
                if (face === 'bottom' || face === 'back') return;
                p.rect(0.5, 0.5, 0.5, 0.5, face === 'top' ? 0x5a534c : 0xffffff, 0);
            } }
        });

        // A small claw, bent down and in under the eye.
        b.part(`arm${side}`, { parent: 'body', pivot: [1.1 * sign, 1.5, 1.75], from: [-0.25, -0.25, 0], size: [0.5, 0.5, 1.25], paint: { color: c.shell, noise: 0.05 }, rotation: [0.25, 0.5 * sign, 0] });
        b.part(`claw${side}`, { parent: `arm${side}`, pivot: [0, 0, 1.25], from: [-0.375, -0.375, 0], size: [0.75, 0.75, 1], paint: { color: c.light, noise: 0.05, faces: { front: (p) => p.fill(c.dark, 0.04) } }, rotation: [0.5, -1.1 * sign, 0] });

        // The two oars: a short arm out from the body and a wide flat blade down to the ground.
        [[0.75, 0.45], [-0.3, -0.2]].forEach(([z, turn], i) => {
            b.part(`leg${side}${i}`, { parent: 'body', pivot: [1.25 * sign, 1.75, z], from: [sign > 0 ? 0 : -1.25, -0.25, -0.25], size: [1.25, 0.5, 0.5], paint: { color: c.shell, noise: 0.05 }, rotation: [0, -turn * sign, 0.3 * sign] });
            b.part(`paddle${side}${i}`, {
                parent: `leg${side}${i}`, pivot: [1.25 * sign, 0, 0], from: [sign > 0 ? 0 : -2.25, -0.125, -0.625], size: [2.25, 0.25, 1.25], rotation: [0, 0, -1.3 * sign],
                paint: { color: c.blade, noise: 0.05, bevel: 0.1, all: (p, face) => {
                    if (face !== 'top' && face !== 'bottom') { p.fill(c.dark, 0.04); return; }
                    p.rect(0, 0.5, p.w, 0.5, c.shell, 0.04);
                } }
            });
        });
        // And the two little legs of the back, too thin to row with.
        [[-1.1, -0.6], [-1.6, -1]].forEach(([z, turn], i) => {
            b.part(`leg${side}${i + 2}`, { parent: 'body', pivot: [1.2 * sign, 1.6, z], from: [sign > 0 ? 0 : -1, -0.125, -0.125], size: [1, 0.25, 0.25], paint: { color: c.shell, noise: 0.05 }, rotation: [0, -turn * sign, 0.2 * sign] });
            b.part(`shin${side}${i + 2}`, { parent: `leg${side}${i + 2}`, pivot: [1 * sign, 0, 0], from: [sign > 0 ? 0 : -1.75, -0.125, -0.125], size: [1.75, 0.25, 0.25], paint: { color: c.light, noise: 0.05 }, rotation: [0, 0, -1.3 * sign] });
        });
    });
    return { legs: ['legL0', 'legR0', 'legL1', 'legR1', 'legL2', 'legR2', 'legL3', 'legR3'], tail: ['tail', 'tailTip'], legAxis: 'y' };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('callichimaera', {
    info: { eggColor: 0xd9825a, tone: 3000, maxHealth: 6, speed: 0.5, variants: 2, hiddenUntilDiscovered: true, ancestorOf: 'crab' },
    model: callichimaeraModel,
    surface: 'skin',
    drops: [['shell', 1, 1]],
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [], cage: true },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Callichimaera', habitat: 'Warm seas of Colombia, about 95 million years ago', activity: 'Day', temperament: 'Passive',
        description: 'The beautiful chimera: a crab as small as a coin, with huge eyes and legs like oars. It swam instead of running sideways, and it looks like a baby crab that never grew up.'
    },
    cardEs: {
        name: 'Callichimaera', habitat: 'Mares cálidos de Colombia, hace unos 95 millones de años',
        description: 'La quimera hermosa: un cangrejo pequeño como una moneda, con ojos enormes y patas como remos. Nadaba en vez de correr de lado, y parece una cría de cangrejo que no terminó de crecer.'
    }
});
