// Archelon: an extinct animal of the sea and an ancient relative of the turtle, found as a rare fossil in
// the deep rock (js/game/fossils.js) and brought back to life next to at least 60 blocks of water. The
// biggest turtle there has ever been: three blocks long, with a shell that was no armour of horn plates
// but a frame of bone under leathery skin, a great head with a hooked beak, and two front flippers like
// oars. It rows through the water in long curves and, being a reptile, comes up now and then to put its
// head out and breathe. How it moves is the 'cruise' movement of every sea animal
// (js/game/sea_animals.js): this file is its model and its row in the tables of the others.

// Faces +z, with its middle in the middle of its shell. The turtle of js/models.js grown and pushed back to
// what it was: the shell is a low dome, widest at the shoulders and narrowing to a point behind, with
// ridges along it and no plates; the head is big and ends in a hook; the front flippers are long blades
// and the hind ones short paddles (`wings`, in the order the movement beats them); the neck is one joint
// (`neck0`) that lifts the head out of the water. Every size is a multiple of half a unit: a face is
// painted in whole texels, two to a unit (js/models.js).
function archelonModel(b, variant) {
    const palettes = [
        // Slate blue with pale flecks, as the leatherback turtle of today.
        { shell: 0x3f5360, ridge: 0x5f7886, dark: 0x2a3942, fleck: 0xc9d6d8, skin: 0x4c6370, belly: 0xe2d9c4, beak: 0xcfc39a, hook: 0x8a7d58 },
        // Olive brown.
        { shell: 0x5c5a3a, ridge: 0x807c52, dark: 0x3d3b25, fleck: 0xd8d2a8, skin: 0x6a6945, belly: 0xe6dcb8, beak: 0xd4c692, hook: 0x8c7a4c }
    ];
    const c = palettes[variant % palettes.length];
    // Leather, not plates: smooth and dark, with ridges running from the neck to the tail and pale flecks.
    const leather = (ridges) => ({
        color: c.shell, noise: 0.06, bevel: 0.12,
        all: (p, face) => {
            if (face === 'bottom') { p.fill(c.belly, 0.05); return; }
            if (face === 'top') {
                for (const x of ridges) p.rect(p.w / 2 + x - 0.5, 0, 1, p.h, c.ridge, 0.05);
                p.spots(c.fleck, Math.ceil(p.w * p.h / 40), 0.5, 1, 3);
                return;
            }
            p.rect(0, p.h - 1, p.w, 1, c.dark, 0.05);
            p.spots(c.fleck, Math.ceil(p.w * p.h / 20), 0.5, 0.5, 5);
        }
    });
    const skin = (seed) => ({
        color: c.skin, noise: 0.07,
        all: (p, face) => {
            if (face === 'bottom') { p.fill(c.belly, 0.05); return; }
            p.spots(c.fleck, Math.ceil(p.w * p.h / 9), 0.5, 1, seed);
            p.spots(c.dark, Math.ceil(p.w * p.h / 14), 0.5, 1, seed + 4);
        }
    });

    // The underside, and over it the shell in steps: the rim, the dome, its crown and the three ridges that stand out.
    b.part('body', { pivot: [0, 0, 0], from: [-10, 3, -15], size: [20, 2.5, 28], paint: { color: c.belly, noise: 0.05, surface: 'skin', all: (p, face) => { if (face === 'bottom') for (let y = 4; y < p.h; y += 6) p.rect(1, y, p.w - 2, 0.5, 0xc4b79c, 0.04); } } });
    b.part('shell', { parent: 'body', pivot: [0, 5.5, 0], from: [-13, 0, -9], size: [26, 3.5, 21], paint: leather([-9, -4.5, 0, 4.5, 9]) });
    b.part('shellFront', { parent: 'shell', pivot: [0, 0, 12], from: [-9.5, 0, 0], size: [19, 3, 2.5], paint: leather([-4.5, 0, 4.5]) });
    b.part('shellRear', { parent: 'shell', pivot: [0, 0, -9], from: [-10, 0, -6], size: [20, 3, 6], paint: leather([-4.5, 0, 4.5]) });
    b.part('shellEnd', { parent: 'shellRear', pivot: [0, 0, -6], from: [-6, 0, -4.5], size: [12, 2.5, 4.5], paint: leather([0]) });
    b.part('shellTop', { parent: 'shell', pivot: [0, 3.5, -0.5], from: [-10.5, 0, -12], size: [21, 2.5, 24], paint: leather([-9, 9]) });
    b.part('shellCrown', { parent: 'shellTop', pivot: [0, 2.5, -0.5], from: [-7.5, 0, -9.5], size: [15, 1.5, 19], paint: leather([]) });
    const ridgePaint = { color: c.ridge, noise: 0.06, bevel: 0.12 };
    b.part('keel', { parent: 'shellCrown', pivot: [0, 1.5, 0], from: [-1, 0, -9], size: [2, 1, 18], paint: ridgePaint });
    b.part('keelL', { parent: 'shellCrown', pivot: [5, 1.5, 0], from: [-0.5, 0, -7.5], size: [1, 0.5, 15], paint: ridgePaint });
    b.part('keelR', { parent: 'shellCrown', pivot: [-5, 1.5, 0], from: [-0.5, 0, -7.5], size: [1, 0.5, 15], paint: ridgePaint });

    // The neck, short and wrinkled, and the head: as long as a child is tall, with a big eye on each side.
    b.part('neck0', {
        parent: 'body', pivot: [0, 6.5, 13], from: [-3.5, -2.5, 0], size: [7, 5.5, 4],
        paint: { color: c.skin, noise: 0.07, all: (p, face) => { if (face === 'bottom') { p.fill(c.belly, 0.05); return; } if (face !== 'front' && face !== 'back') for (let d = 0.5; d < (face === 'top' ? p.h : p.w); d += 1.5) { if (face === 'top') p.rect(0, d, p.w, 0.5, c.dark, 0.05); else p.rect(d, 0, 0.5, p.h, c.dark, 0.05); } } }
    });
    b.part('head', {
        parent: 'neck0', pivot: [0, 0.5, 3.5], from: [-4, -3.5, 0], size: [8, 7, 7],
        paint: {
            ...skin(6),
            faces: {
                left: (p) => { p.rect(p.w - 3.5, 1.5, 2.5, 2.5, 0xe6dcb8, 0); p.rect(p.w - 3, 2, 1.5, 1.5, 0x0f0d0b, 0); p.rect(p.w - 2, 2, 0.5, 0.5, 0xffffff, 0); },
                right: (p) => { p.rect(1, 1.5, 2.5, 2.5, 0xe6dcb8, 0); p.rect(1.5, 2, 1.5, 1.5, 0x0f0d0b, 0); p.rect(1.5, 2, 0.5, 0.5, 0xffffff, 0); },
                top: (p) => { p.fill(c.shell, 0.06); p.spots(c.fleck, 5, 0.5, 1, 7); }
            }
        }
    });
    // The beak: a bill of horn with no teeth, and the hook that hangs over the lower jaw.
    const horn = { color: c.beak, noise: 0.04, surface: 'smooth' };
    b.part('beak', {
        parent: 'head', pivot: [0, 0, 7], from: [-2.5, -2.5, 0], size: [5, 4.5, 3.5],
        paint: { ...horn, faces: { top: (p) => { p.rect(1.5, p.h - 1, 0.5, 0.5, 0x2a241a, 0); p.rect(p.w - 2, p.h - 1, 0.5, 0.5, 0x2a241a, 0); }, left: (p) => p.rect(0, p.h - 0.5, p.w, 0.5, c.hook, 0.03), right: (p) => p.rect(0, p.h - 0.5, p.w, 0.5, c.hook, 0.03) } }
    });
    b.part('beakHook', { parent: 'beak', pivot: [0, -2.5, 3.5], from: [-1, -2, -1.5], size: [2, 2.5, 1.5], paint: { color: c.hook, noise: 0.04, surface: 'smooth' } });
    b.part('jaw', {
        parent: 'head', pivot: [0, -2.5, 0.5], from: [-3, -1.5, 0], size: [6, 1.5, 8],
        paint: { color: c.belly, noise: 0.04, faces: { top: (p) => p.fill(0xc98a86, 0.04), front: (p) => p.fill(c.beak, 0.04), left: (p) => p.rect(p.w - 3, 0, 3, p.h, c.beak, 0.04), right: (p) => p.rect(0, 0, 3, p.h, c.beak, 0.04) } }
    });

    // The front flippers, long and swept back like wings, and the hind ones, short and broad: its rudders.
    const blade = {
        color: c.skin, noise: 0.07, bevel: 0.1,
        all: (p, face) => {
            if (face === 'bottom') { p.fill(c.belly, 0.05); return; }
            if (face === 'top') { p.spots(c.dark, Math.ceil(p.w * p.h / 12), 1, 1.5, 9); p.spots(c.fleck, Math.ceil(p.w * p.h / 12), 0.5, 0.5, 8); }
        }
    };
    const flippers = [];
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        const name = `flipperF${side}`;
        b.part(name, { parent: 'body', pivot: [11 * sign, 5.5, 8.5], from: [sign > 0 ? 0 : -10, -1, -4], size: [10, 1.5, 8], paint: blade, rotation: [0, 0.3 * sign, -0.22 * sign] });
        b.part(`${name}Tip`, { parent: name, pivot: [10 * sign, 0, -0.5], from: [sign > 0 ? 0 : -9, -0.5, -3], size: [9, 1, 5.5], paint: blade, rotation: [0, 0.45 * sign, 0] });
        flippers.push(name);
    });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        const name = `flipperB${side}`;
        b.part(name, { parent: 'body', pivot: [8 * sign, 5, -13], from: [sign > 0 ? 0 : -7.5, -0.5, -3], size: [7.5, 1, 6], paint: blade, rotation: [0, 0.95 * sign, -0.18 * sign] });
        flippers.push(name);
    });
    b.part('tail', { parent: 'body', pivot: [0, 5, -17], from: [-1.5, -1, -6], size: [3, 2, 6], paint: skin(10) });
    return { head: 'head', wings: flippers, tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('archelon', {
    info: { eggColor: 0x3f5360, tone: 130, maxHealth: 28, speed: 0.75, variants: 2, movement: 'cruise', seaDepth: 0.6, seaBreath: [45, 80], seaIdle: 0.15, hiddenUntilDiscovered: true, ancestorOf: 'turtle' },
    model: archelonModel,
    surface: 'skin',
    // What its shell was covered with.
    drops: [['leather', 1, 2]],
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare', water: 60 },
    card: {
        name: 'Archelon', habitat: 'Shallow seas over North America, about 75 million years ago', activity: 'Day', temperament: 'Passive',
        description: 'The biggest turtle there has ever been: over 4 metres long in life and 3 blocks here. Its shell was leathery skin over a frame of bone, and its beak ended in a hook. It rows with its front flippers and comes up to breathe.'
    },
    cardEs: {
        name: 'Arquelón', habitat: 'Mares poco profundos sobre Norteamérica, hace unos 75 millones de años',
        description: 'La tortuga más grande que ha existido: más de 4 metros de largo en vida y 3 bloques aquí. Su caparazón estaba hecho de piel correosa sobre un armazón de hueso, y su pico acababa en gancho. Rema con las aletas delanteras y sube a respirar.'
    }
});
