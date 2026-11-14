// Dunkleosteus: an extinct animal of the sea and an ancient relative of the fish, found as a rare fossil in
// the deep rock (js/game/fossils.js) and brought back to life next to at least 60 blocks of water. An
// armoured fish of the Devonian, three and a half blocks long: its head and its shoulders are a helmet of
// bone plates, and it has no teeth at all, but two pairs of bony blades that sharpen each other every time
// its mouth shuts. The rest of it is skin, as a shark's. It is a hunter: it goes for a player who is in the
// water, and one on the shore is safe. How it moves is the 'cruise' movement of every sea animal
// (js/game/sea_animals.js): this file is its model and its row in the tables of the others.

// Faces +z, with its middle in the middle of its length. The fish of js/models.js grown and pushed back to
// what it was: in front, the helmet (the plates of the shoulders, the skull over them and the snout, with
// the eye inside a ring of bone) and the lower jaw, which the movement opens to bite (`jaw`); behind, a
// thick body that swims with its tail (the three joints of `tail`), a fin on its back and a tail fin with
// the upper lobe the longer, as a shark's. Every size is a multiple of half a unit: a face is painted in
// whole texels, two to a unit (js/models.js).
function dunkleosteusModel(b, variant) {
    const palettes = [
        // Steel blue, with the bone of the helmet a dull brown.
        { bone: 0x8d8672, seam: 0x514c3d, pit: 0x736d5b, skin: 0x526878, back: 0x38495a, belly: 0xd7dcd2, fin: 0x41566a, blade: 0xe8dfc6, bladeEdge: 0xa8946c },
        // Olive, with the helmet the colour of rust.
        { bone: 0x9a7a58, seam: 0x54402b, pit: 0x7e6346, skin: 0x66704a, back: 0x454d30, belly: 0xdcd9bc, fin: 0x525a38, blade: 0xece2c4, bladeEdge: 0xb09a68 }
    ];
    const c = palettes[variant % palettes.length];
    const mouth = 0xb9656a;
    // A plate of bone: rough, pitted, with the seams where it meets the next one.
    const plate = (seams) => ({
        color: c.bone, noise: 0.08, bevel: 0.14, surface: 'smooth',
        all: (p, face) => {
            if (face === 'bottom') { p.fill(c.belly, 0.05); return; }
            p.spots(c.pit, Math.ceil(p.w * p.h / 6), 0.5, 1, 3);
            if (face === 'top') { for (const y of seams) p.rect(0, y, p.w, 0.5, c.seam, 0.05); return; }
            if (face === 'front' || face === 'back') return;
            for (const x of seams) p.rect(face === 'left' ? x : p.w - x - 0.5, 0, 0.5, p.h - 2, c.seam, 0.05);
            p.rect(0, p.h - 2, p.w, 2, c.belly, 0.05);
        }
    });
    // The skin behind the helmet: dark above and pale below, as most hunters of the open sea.
    const skin = (seed) => ({
        color: c.skin, noise: 0.06,
        all: (p, face) => {
            if (face === 'bottom') { p.fill(c.belly, 0.04); return; }
            if (face === 'top') { p.fill(c.back, 0.06); return; }
            p.rect(0, 0, p.w, Math.round(p.h * 0.7) / 2, c.back, 0.05);
            p.rect(0, p.h - Math.round(p.h * 0.6) / 2, p.w, p.h, c.belly, 0.04);
            p.spots(c.back, Math.ceil(p.w * p.h / 18), 0.5, 1.5, seed);
        }
    });
    const finPaint = { color: c.fin, noise: 0.05, bevel: 0.08, surface: 'smooth', all: (p, face) => { if (face === 'left' || face === 'right') for (let x = 0.5; x < p.w; x += 1.5) p.rect(x, 0, 0.5, p.h, c.back, 0.04); } };

    // The plates of the shoulders, the widest and tallest part of it; everything else hangs from them.
    b.part('body', { pivot: [0, 0, 8], from: [-6.5, 1.5, -3], size: [13, 14, 10], paint: plate([4.5]) });
    b.part('skull', {
        parent: 'body', pivot: [0, 8.5, 7], from: [-5.5, -6, 0], size: [11, 11.5, 7.5],
        paint: {
            ...plate([]),
            faces: {
                // The eye: small for such a head, inside a ring of bone.
                left: (p) => { p.rect(p.w - 4.5, 2.5, 3, 3, c.blade, 0.03); p.rect(p.w - 3.5, 3.5, 1.5, 1.5, 0x0d0b09, 0); p.rect(p.w - 2.5, 3.5, 0.5, 0.5, 0xffffff, 0); },
                right: (p) => { p.rect(1.5, 2.5, 3, 3, c.blade, 0.03); p.rect(2, 3.5, 1.5, 1.5, 0x0d0b09, 0); p.rect(2, 3.5, 0.5, 0.5, 0xffffff, 0); }
            }
        }
    });
    // The snout, and under its edge the upper blades: two fangs of bone in front and a cutting edge behind.
    const upperEdge = (p) => p.rect(0, p.h - 1, p.w, 1, c.blade, 0.03);
    b.part('snout', {
        parent: 'skull', pivot: [0, 0.5, 7.5], from: [-4.5, -4, 0], size: [9, 7, 4],
        paint: { ...plate([]), faces: { front: (p) => { p.rect(2, 1.5, 1, 0.5, 0x0d0b09, 0); p.rect(p.w - 3, 1.5, 1, 0.5, 0x0d0b09, 0); upperEdge(p); }, left: upperEdge, right: upperEdge, bottom: (p) => p.fill(mouth, 0.05) } }
    });
    const bladePaint = { color: c.blade, noise: 0.03, surface: 'smooth', bevel: 0.05, faces: { bottom: (p) => p.fill(c.bladeEdge, 0.03) } };
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`fang${side}`, { parent: 'snout', pivot: [2.5 * sign, -4, 3], from: [-1, -3, -1.5], size: [2, 3, 1.5], paint: bladePaint });
    });
    // The lower jaw, with its own two blades standing up at the front; it hangs open.
    const lowerEdge = (p) => p.rect(0, 0, p.w, 1, c.blade, 0.03);
    b.part('jaw', {
        parent: 'skull', pivot: [0, -4.5, 0.5], from: [-4, -2, 0], size: [8, 2.5, 9.5], rotation: [0.3, 0, 0],
        paint: { color: c.bone, noise: 0.08, surface: 'smooth', all: (p, face) => { if (face === 'bottom') { p.fill(c.belly, 0.05); return; } if (face === 'top') { p.fill(mouth, 0.05); return; } p.spots(c.pit, 3, 0.5, 1, 5); if (face !== 'back') lowerEdge(p); } }
    });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`tusk${side}`, { parent: 'jaw', pivot: [1.5 * sign, 0.5, 8.5], from: [-1, 0, -1.5], size: [2, 2.5, 1.5], paint: { color: c.blade, noise: 0.03, surface: 'smooth', bevel: 0.05, faces: { top: (p) => p.fill(c.bladeEdge, 0.03) } } });
    });

    // Behind the helmet: the trunk, and the tail that drives it.
    b.part('trunk', { parent: 'body', pivot: [0, 0, -3], from: [-5.5, 2.5, -11], size: [11, 12, 11.5], paint: skin(6) });
    b.part('tail0', { parent: 'trunk', pivot: [0, 8.5, -11], from: [-4, -5, -7.5], size: [8, 9.5, 8], paint: skin(7) });
    b.part('tail1', { parent: 'tail0', pivot: [0, 0, -7.5], from: [-2.5, -3.5, -6], size: [5, 6.5, 6.5], paint: skin(8) });
    b.part('tail2', { parent: 'tail1', pivot: [0, 0, -6], from: [-1.5, -2, -5], size: [3, 4, 5.5], paint: skin(9) });
    b.part('tailFinUp', { parent: 'tail2', pivot: [0, 1, -2.5], from: [-0.5, 0, -5], size: [1, 9, 5], paint: finPaint, rotation: [-0.6, 0, 0] });
    b.part('tailFinDown', { parent: 'tail2', pivot: [0, -1, -3], from: [-0.5, -5, -3.5], size: [1, 5, 4], paint: finPaint, rotation: [0.45, 0, 0] });
    b.part('dorsalFin', { parent: 'trunk', pivot: [0, 14.5, -4], from: [-0.5, -0.5, -5], size: [1, 5, 6], paint: finPaint, rotation: [-0.3, 0, 0] });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`fin${side}`, { parent: 'body', pivot: [6.5 * sign, 4, -1], from: [sign > 0 ? 0 : -7, -0.5, -3], size: [7, 1, 5.5], paint: finPaint, rotation: [0, 0.5 * sign, -0.5 * sign] });
        b.part(`pelvic${side}`, { parent: 'trunk', pivot: [4 * sign, 3, -9.5], from: [sign > 0 ? 0 : -3.5, -0.5, -2], size: [3.5, 1, 3.5], paint: finPaint, rotation: [0, 0.6 * sign, -0.7 * sign] });
    });
    return { head: 'skull', tail: ['tail0', 'tail1', 'tail2'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('dunkleosteus', {
    info: { eggColor: 0x526878, tone: 90, hostile: true, attackDamage: 4, chaseDistance: 9, chaseSpeed: 2, maxHealth: 30, speed: 0.9, variants: 2, movement: 'cruise', seaDepth: 0.4, hiddenUntilDiscovered: true, ancestorOf: 'fish' },
    model: dunkleosteusModel,
    surface: 'skin',
    drops: [['raw_fish', 2, 3]],
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare', water: 60 },
    card: {
        name: 'Dunkleosteus', habitat: 'Seas of the Devonian, about 360 million years ago', activity: 'Day and night', temperament: 'Hostile',
        description: 'An armoured fish with a helmet of bone plates and not a single tooth: its jaws are 2 pairs of bony blades that sharpen each other as they shut. It bites whoever swims in its water. On the shore you are safe.'
    },
    cardEs: {
        name: 'Dunkleosteus', habitat: 'Mares del Devónico, hace unos 360 millones de años',
        description: 'Un pez acorazado con un casco de placas de hueso y ni un solo diente: sus mandíbulas son 2 pares de cuchillas de hueso que se afilan una contra otra al cerrarse. Muerde a quien nade en su agua. En la orilla estás a salvo.'
    }
});
