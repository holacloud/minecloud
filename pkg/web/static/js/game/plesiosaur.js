// Plesiosaurs: an extinct reptile of the sea, found as a skeleton in three pieces deep in the rock
// (js/game/fossils.js) and brought back to life next to a body of at least 120 blocks of water. A long
// neck, a small head full of needle teeth, a broad flat body, a short tail and four flippers: it does not
// paddle, it flies under water. It cruises in long curves and, being a reptile, comes up now and then to
// put its head out of the water and breathe. Five blocks long. How it moves is the 'cruise' movement of
// every sea animal (js/game/sea_animals.js): this file is its model and its row in the tables of the others.

// Faces +z, standing on the tips of its flippers at rest. Its neck is a chain of joints (`neck0` to
// `neck4`) and so is its tail: the movement bends the one into its turns and lifts it to breathe, and
// sways the other. Every size is a multiple of half a unit: a face is painted in whole texels, two to a
// unit, and most other sizes leave a texel of it unpainted (js/models.js).
function plesiosaurModel(b, variant) {
    const palettes = [
        { back: 0x34546c, side: 0x5b8098, belly: 0xe4e8dc, spot: 0x24394c, pale: 0x86a8bb },
        { back: 0x4f5c34, side: 0x7d8c55, belly: 0xe8e2c4, spot: 0x353f22, pale: 0xa3b07a }
    ];
    const c = palettes[variant % palettes.length];
    // Dark above and pale below, as most animals of the open sea are: seen from above it is lost against
    // the deep, and from below against the light.
    const hide = (spots) => ({
        color: c.side, noise: 0.06, bevel: 0.1,
        all: (p, face) => {
            if (face === 'bottom') { p.fill(c.belly, 0.04); return; }
            if (face === 'top') {
                p.fill(c.back, 0.06);
                p.spots(c.spot, Math.ceil(p.w * p.h / spots), 0.8, 2.2, 3);
                p.spots(c.pale, Math.ceil(p.w * p.h / (spots * 3)), 0.5, 1, 9);
                return;
            }
            p.rect(0, 0, p.w, p.h * 0.38, c.back, 0.05);
            p.rect(0, p.h * 0.72, p.w, p.h * 0.28, c.belly, 0.04);
            p.spots(c.spot, Math.ceil(p.w * p.h / (spots * 1.5)), 0.6, 1.4, 5);
        }
    });
    const skin = hide(26);

    // The trunk: broad and flat, narrowing in two steps towards the neck and towards the tail.
    b.part('body', { pivot: [0, 0, 0], from: [-9.5, 4, -7], size: [19, 10.5, 14], paint: skin });
    b.part('back', { parent: 'body', pivot: [0, 14.5, 0], from: [-6.5, 0, -5.5], size: [13, 1.5, 11], paint: skin });
    b.part('chest', { parent: 'body', pivot: [0, 0, 7], from: [-8, 4.75, 0], size: [16, 9, 4.5], paint: skin });
    b.part('shoulders', { parent: 'body', pivot: [0, 0, 11.5], from: [-5.75, 5.5, 0], size: [11.5, 7.5, 3], paint: skin });
    b.part('hips', { parent: 'body', pivot: [0, 0, -7], from: [-7.75, 4.75, -4.5], size: [15.5, 9, 4.5], paint: skin });
    b.part('rump', { parent: 'body', pivot: [0, 0, -11.5], from: [-5.5, 5.5, -3], size: [11, 7.5, 3], paint: skin });

    // The neck: five joints, each thinner than the last and tipped up a little.
    const neck = [[8, 7], [6.5, 6], [5.5, 5], [4.5, 4], [4, 3.5]];
    neck.forEach(([w, h], i) => {
        b.part(`neck${i}`, {
            parent: i === 0 ? 'body' : `neck${i - 1}`, pivot: i === 0 ? [0, 9.8, 14] : [0, 0.15, 5],
            from: [-w / 2, -h / 2, 0], size: [w, h, 5.5], paint: hide(18), rotation: [i === 0 ? -0.1 : -0.04, 0, 0]
        });
    });

    // The head: small, with big eyes that look a little forwards, and teeth like needles that showed even
    // with its mouth shut.
    const teeth = (p, y) => { for (let x = 0.4; x < p.w - 0.3; x += 1) p.rect(x, y, 0.5, 0.7, 0xf6f2e4, 0); };
    const eye = (front) => (p) => {
        p.rect(0, 0, p.w, 1.2, c.back, 0.05);
        const x = front ? 1.5 : p.w - 3.5;
        p.rect(x, 0.8, 2, 1.8, 0xe9d37a, 0);
        p.rect(x + 0.5, 1, 1, 1.4, 0x0f0d0b, 0);
        p.rect(x + (front ? 0.5 : 1), 1, 0.5, 0.5, 0xffffff, 0);
    };
    b.part('head', {
        parent: 'neck4', pivot: [0, 0.2, 5.2], from: [-2.75, -2, -0.5], size: [5.5, 4.5, 5.5],
        paint: { ...hide(14), faces: { right: eye(true), left: eye(false) } }
    });
    b.part('snout', {
        parent: 'head', pivot: [0, -0.4, 5], from: [-2, -1.25, 0], size: [4, 2.5, 4],
        paint: {
            ...hide(14),
            faces: {
                right: (p) => { p.rect(0, 0, p.w, 0.9, c.back, 0.05); teeth(p, p.h - 0.7); },
                left: (p) => { p.rect(0, 0, p.w, 0.9, c.back, 0.05); teeth(p, p.h - 0.7); },
                front: (p) => { p.rect(0, 0, p.w, 0.9, c.back, 0.05); p.rect(0.7, 0.5, 0.5, 0.4, 0x0f0d0b, 0); p.rect(p.w - 1.2, 0.5, 0.5, 0.4, 0x0f0d0b, 0); teeth(p, p.h - 0.7); }
            }
        }
    });
    b.part('jaw', {
        parent: 'head', pivot: [0, -1.9, 0.6], from: [-1.75, -1, 0], size: [3.5, 1, 8],
        paint: {
            color: c.belly, noise: 0.04, bevel: 0.08,
            faces: { right: (p) => teeth(p, 0), left: (p) => teeth(p, 0), front: (p) => teeth(p, 0), top: (p) => p.fill(0xc98a86, 0.04) }
        }
    });

    // The tail: short, three joints and a tip.
    [[9, 7], [6.5, 5], [4, 3]].forEach(([w, h], i) => {
        b.part(`tail${i}`, {
            parent: i === 0 ? 'body' : `tail${i - 1}`, pivot: i === 0 ? [0, 9.2, -14] : [0, -0.1, -5.5],
            from: [-w / 2, -h / 2, -6], size: [w, h, 6], paint: hide(18)
        });
    });
    b.part('tailTip', { parent: 'tail2', pivot: [0, 0, -5.5], from: [-1, -1, -3.5], size: [2, 2, 3.5], paint: hide(18) });

    // Four flippers, long and stiff as wings: a broad blade at the shoulder and a narrower one beyond
    // it, swept back and hanging a little. The hind pair is the smaller.
    const blade = {
        color: c.back, noise: 0.06, bevel: 0.1,
        all: (p, face) => {
            if (face === 'bottom') { p.fill(c.pale, 0.04); return; }
            if (face === 'top') p.spots(c.spot, Math.ceil(p.w * p.h / 14), 0.6, 1.4, 6);
        }
    };
    const flippers = [];
    [['F', 8.6, 6.2, 8, 10, 9, 7.5, 5, 0.38], ['B', 7.4, 6.2, -9, 9, 8, 6.5, 4.5, 0.5]].forEach(([end, x, y, z, inner, outer, chord, tip, sweep]) => {
        [['L', 1], ['R', -1]].forEach(([side, sign]) => {
            const name = `flipper${end}${side}`;
            b.part(name, {
                parent: 'body', pivot: [x * sign, y, z], from: [sign > 0 ? 0 : -inner, -0.75, -chord / 2], size: [inner, 1.5, chord],
                paint: blade, rotation: [0, sweep * sign, -0.24 * sign]
            });
            b.part(`${name}Tip`, {
                parent: name, pivot: [inner * sign, 0, -0.5], from: [sign > 0 ? 0 : -outer, -0.5, -tip / 2], size: [outer, 1, tip],
                paint: blade, rotation: [0, 0.26 * sign, 0]
            });
            flippers.push(name);
        });
    });
    return { head: 'head', wings: flippers, tail: ['tail0', 'tail1', 'tail2'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('plesiosaur', {
    info: { eggColor: 0x4a6f88, tone: 110, maxHealth: 40, speed: 1.1, variants: 2, movement: 'cruise', seaDepth: 0.55, seaBreath: [35, 60], hiddenUntilDiscovered: true },
    model: plesiosaurModel,
    surface: 'skin',
    trap: { baits: [] },
    fossil: { source: 'skeleton', rarity: 'legendary', weight: 2, water: 120 },
    card: {
        name: 'Plesiosaur', habitat: 'Seas of the Jurassic and the Cretaceous, from 200 to 66 million years ago', activity: 'Day', temperament: 'Passive',
        description: 'A reptile of the sea with a long neck, a small head full of needle teeth and four flippers it flew through the water with. It breathed air: now and then it comes up and lifts its head out of the water.'
    },
    cardEs: {
        name: 'Plesiosaurio', habitat: 'Mares del Jurásico y del Cretácico, de hace 200 a 66 millones de años',
        description: 'Un reptil marino de cuello largo, cabeza pequeña llena de dientes como agujas y cuatro aletas con las que volaba por el agua. Respiraba aire: de vez en cuando sube y saca la cabeza del agua.'
    }
});
