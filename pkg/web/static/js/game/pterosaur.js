// The pterosaur: an extinct animal (js/mobSpecies.js) with no living relative, found as a rare fossil in the
// deep rock and brought back by the revival machine. A flying reptile of the age of the dinosaurs, drawn
// after Pteranodon: no dinosaur and no bird. Its wings are skin stretched from one enormously long finger
// to its legs, its beak is long and has no teeth, and a crest of bone runs back from its head. It soared
// over the sea and took fish. In the game its wings are 5 blocks from tip to tip. It flies as every big
// flyer of the past does, by the 'glide' movement (js/game/gliders.js, whose header says the whole of it):
// wide circles high over its home, and a perch now and then. It is peaceful, and it does not fish. All
// this file says is its body and its numbers.

// Faces +z, built as it flies: wings spread flat along x. A small furry body, a neck stretched forward, a
// narrow head that is nearly all beak in front and all crest behind, and wings in three pieces that narrow
// to a point: the arm, with three little claws at the wrist, and the two halves of the long finger. The
// membrane reaches back along the body to the legs, which trail behind it. Every size is a number of
// quarters of a unit: a texel is half a unit, and a smaller box is not painted.
function pterosaurModel(b, variant) {
    const palettes = [
        { fuzz: 0xcbbb9e, belly: 0xe7dcc4, skin: 0x9a7f68, bone: 0x6b5444, beak: 0xe3c877, tip: 0x8a6a3a, crest: 0xd65a2e, crestEnd: 0xf0b23a },
        { fuzz: 0xa9a9a2, belly: 0xdcdcd2, skin: 0x7d7772, bone: 0x55504c, beak: 0xd9cfa8, tip: 0x6a6252, crest: 0x4f7f9a, crestEnd: 0xb9d2dc }
    ];
    const c = palettes[variant % palettes.length];
    b.part('body', {
        pivot: [0, 0, 0], from: [-2.5, 3, -4.5], size: [5, 4.5, 9],
        paint: { color: c.fuzz, noise: 0.09, surface: 'fur', all: (p, face) => { if (face === 'bottom') p.fill(c.belly, 0.06); } }
    });
    b.part('tail', { parent: 'body', pivot: [0, 5.5, -4.5], from: [-0.5, -0.5, -2], size: [1, 1, 2], paint: { color: c.fuzz, noise: 0.08, surface: 'fur' } });
    b.part('neck', {
        parent: 'body', pivot: [0, 6.5, 4], from: [-1, -0.5, -1], size: [2, 5, 2], rotation: [1, 0, 0],
        paint: { color: c.fuzz, noise: 0.08, surface: 'fur', faces: { front: (p) => p.fill(c.belly, 0.06) } }
    });
    b.part('head', {
        parent: 'neck', pivot: [0, 4.5, 0], from: [-1.25, -1.25, -1.5], size: [2.5, 2.5, 4], rotation: [-1, 0, 0],
        paint: { color: c.fuzz, noise: 0.06, surface: 'skin', all: (p, face) => {
            if (face !== 'left' && face !== 'right') return;
            // A bird's eye: big, round and dark, with a pale ring.
            const eye = face === 'left' ? p.w - 2 : 0.5;
            p.rect(eye, 0.5, 1.5, 1.5, 0xf2ead2, 0);
            p.rect(eye + 0.5, 1, 0.5, 0.5, 0x14100c, 0);
        } }
    });
    // The beak: long, straight, with no teeth at all, darker at its point.
    const beakPaint = { color: c.beak, noise: 0.03, surface: 'smooth', all: (p, face) => { if (face === 'left' || face === 'right') p.rect(0, p.h / 2, p.w, 0.5, c.tip, 0.03); } };
    b.part('beak', { parent: 'head', pivot: [0, -0.25, 2.5], from: [-0.75, -0.75, 0], size: [1.5, 1.5, 7], paint: beakPaint });
    b.part('beakTip', { parent: 'beak', pivot: [0, 0, 7], from: [-0.5, -0.5, 0], size: [1, 1, 3.5], paint: { color: c.tip, noise: 0.03, surface: 'smooth' } });
    // The crest: a blade of bone that points back and up, as long as the skull.
    b.part('crest', { parent: 'head', pivot: [0, 0.75, -1.5], from: [-0.5, -0.75, -6], size: [1, 2, 6], rotation: [-0.3, 0, 0], paint: { color: c.crest, noise: 0.05, surface: 'smooth' } });
    b.part('crestTip', { parent: 'crest', pivot: [0, 0.5, -6], from: [-0.375, -0.5, -3.5], size: [0.75, 1.25, 3.5], paint: { color: c.crestEnd, noise: 0.05, surface: 'smooth' } });

    // Skin, with the bones of the arm and of the finger along its front edge: no feather anywhere.
    const membrane = (bone) => ({ color: c.skin, noise: 0.07, surface: 'skin', all: (p, face) => {
        if (face === 'top') {
            p.rect(0, p.h - bone, p.w, bone, c.bone, 0.05);
            for (let x = 2; x < p.w - 1; x += 4) p.rect(x, 0, 0.5, p.h - bone, 0x8a7060, 0.04);
        } else if (face === 'bottom') {
            p.fill(0xb59a82, 0.06);
            p.rect(0, 0, p.w, bone, c.bone, 0.05);
        } else if (face === 'front') {
            p.fill(c.bone, 0.05);
        }
    } });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        // Where a box starts along x when it reaches `length` out from its pivot, on this side.
        const out = (length) => (sign > 0 ? 0 : -length);
        b.part(`wing${side}`, { parent: 'body', pivot: [2.5 * sign, 6.5, 1.5], from: [out(17), -0.375, -7], size: [17, 0.75, 9.5], paint: membrane(1.5) });
        b.part(`wingTip${side}`, { parent: `wing${side}`, pivot: [17 * sign, 0, 0.5], from: [out(14.5), -0.25, -4.5], size: [14.5, 0.5, 6.5], paint: membrane(1) });
        b.part(`wingEnd${side}`, { parent: `wingTip${side}`, pivot: [14.5 * sign, 0, 0.5], from: [out(6), -0.25, -2], size: [6, 0.5, 3.5], paint: membrane(1) });
        // The three free fingers, at the wrist: small claws that point forward.
        b.part(`claw${side}`, { parent: `wing${side}`, pivot: [16.5 * sign, 0, 2.5], from: [-0.75, -0.25, 0], size: [1.5, 0.5, 1.5], paint: { color: 0xefe4c4, noise: 0.02, surface: 'smooth' } });
        b.part(`leg${side}`, { parent: 'body', pivot: [1.5 * sign, 3.5, -1], from: [-0.5, -3.5, -0.5], size: [1, 3.5, 1], paint: { color: c.skin, noise: 0.05, surface: 'skin' } });
        b.part(`foot${side}`, { parent: `leg${side}`, pivot: [0, -3.5, 0], from: [-0.75, 0, -0.75], size: [1.5, 0.5, 2.5], paint: { color: c.bone, noise: 0.04, surface: 'skin' } });
    });
    return { legs: ['legL', 'legR'], wings: ['wingL', 'wingR'], head: 'head', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('pterosaur', {
    info: { eggColor: 0xcbbb9e, tone: 1300, maxHealth: 16, speed: 3.4, variants: 2, movement: 'glide', glideHeight: 9, glideRange: 14, glideAloft: [50, 100], glidePerch: [12, 25], glideBeat: [7, 14], hiddenUntilDiscovered: true },
    model: pterosaurModel,
    surface: 'skin',
    drops: [['leather', 1, 2]],
    // No bait and no cage: it does not walk, and it comes to nothing.
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Pterosaur', habitat: 'Coasts of an inland sea of North America, about 85 million years ago', activity: 'Day', temperament: 'Passive',
        description: 'A flying reptile: not a dinosaur, and not a bird. Its wings were skin stretched from 1 very long finger, its beak had no teeth, and a bony crest ran back from its head. It soared over the sea, with wings of up to 7 metres, and ate fish.'
    },
    cardEs: {
        name: 'Pterosaurio', habitat: 'Costas de un mar interior de Norteamérica, hace unos 85 millones de años',
        description: 'Un reptil volador: ni dinosaurio ni ave. Sus alas eran piel tendida desde 1 dedo larguísimo, su pico no tenía dientes y una cresta de hueso le salía de la cabeza hacia atrás. Planeaba sobre el mar, con alas de hasta 7 metros, y comía peces.'
    }
});
