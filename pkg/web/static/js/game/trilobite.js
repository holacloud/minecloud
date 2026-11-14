// Trilobites: an extinct animal of the sea, found as a common fossil in the rock (js/game/fossils.js) and
// brought back to life next to at least 4 blocks of water. An oval armour in three lobes along its back
// (that is its name), a head shield with crescent eyes, a row of plates and a tail shield. It walks on the
// bed on many little legs, stops to feel about with its antennae and, when struck, often rolls into a
// ball. Much bigger here than most were (guide, page 266). How it moves is the 'cruise' movement of every
// sea animal (js/game/sea_animals.js): this file is its model and its row in the tables of the others.

// Faces +z. The plates of its back are a chain, each hinged on the one before, from the first (the root) to
// the tail shield: that chain is what rolls up, with the head folding the other way to close the ball.
// Every size is a multiple of a quarter of a unit: a face is painted in whole texels, two to a unit, and
// any other size leaves a texel of it unpainted (js/models.js).
function trilobiteModel(b, variant) {
    const palettes = [
        { shell: 0x8a5a3a, dark: 0x4f3120, light: 0xb7895c, belly: 0xd8c4a0 },
        { shell: 0x5d6b78, dark: 0x333d48, light: 0x8d9aa6, belly: 0xc9d0d4 },
        { shell: 0x9a8a4a, dark: 0x5a4f26, light: 0xc9bb7c, belly: 0xe2dab0 }
    ];
    const c = palettes[variant % palettes.length];
    const under = (p) => p.fill(c.belly, 0.04);
    const tone = (color, k) => shadeRgb(colorToRgb(color), k);
    // A plate of the side lobes, its tips darker. One plate in two is a shade darker, so that the plates
    // can be counted: each is a single texel long.
    const pleura = (shade) => ({
        color: tone(c.shell, shade), noise: 0.05, bevel: 0, surface: 'smooth',
        faces: { top: (p) => { p.rect(0, 0, 0.5, p.h, c.dark, 0.04); p.rect(p.w - 0.5, 0, 0.5, p.h, c.dark, 0.04); }, bottom: under }
    });
    // The middle lobe, raised and lighter, so that the three read from above.
    const axis = (shade) => ({ color: tone(c.light, shade), noise: 0.05, bevel: 0, surface: 'smooth' });
    const legPaint = { color: c.dark, noise: 0.04, bevel: 0, surface: 'smooth' };

    const widths = [4.5, 4.5, 4.5, 4, 3.5, 3];
    const legs = [];
    const tail = [];
    widths.forEach((w, i) => {
        const name = i === 0 ? 'body' : `plate${i}`;
        const shade = i % 2 ? -0.16 : 0;
        b.part(name, {
            parent: i === 0 ? null : i === 1 ? 'body' : `plate${i - 1}`,
            pivot: i === 0 ? [0, 1, 1] : [0, 0, -0.5],
            from: [-w / 2, -0.5, -0.5], size: [w, 0.5, 0.5], paint: pleura(shade)
        });
        b.part(`axis${i}`, { parent: name, pivot: [0, 0, 0], from: [-0.75, -0.5, -0.5], size: [1.5, 1, 0.5], paint: axis(shade) });
        if (i > 0) tail.push(name);
        // A pair of legs under all but the last plate, their feet just showing at the sides.
        if (i === widths.length - 1) return;
        [['L', 1], ['R', -1]].forEach(([side, sign]) => {
            b.part(`leg${i}${side}`, {
                parent: name, pivot: [(w / 2 - 0.8) * sign, -0.45, -0.25], from: [-0.125, -1, -0.125], size: [0.25, 1, 0.25],
                paint: legPaint, rotation: [0, 0, 1 * sign]
            });
            legs.push(`leg${i}${side}`);
        });
    });

    // The tail shield: one plate, rounded off, with the end of the middle lobe on it.
    b.part('pygidium', { parent: `plate${widths.length - 1}`, pivot: [0, 0, -0.5], from: [-1.25, -0.5, -0.5], size: [2.5, 0.5, 0.5], paint: pleura(-0.16) });
    b.part('pygidiumTip', { parent: 'pygidium', pivot: [0, 0, -0.5], from: [-0.75, -0.5, -0.5], size: [1.5, 0.5, 0.5], paint: pleura(0) });
    b.part('pygidiumAxis', { parent: 'pygidium', pivot: [0, 0, 0], from: [-0.5, -0.5, -0.5], size: [1, 1, 0.5], paint: axis(-0.16) });
    tail.push('pygidium');

    // The head shield: a half moon with its corners drawn back into spines, the swollen middle (glabella)
    // and an eye to each side of it.
    b.part('head', {
        parent: 'body', pivot: [0, 0, 0], from: [-2.5, -0.5, 0], size: [5, 0.5, 1.5],
        paint: {
            color: c.shell, noise: 0.06, bevel: 0.1, surface: 'smooth',
            faces: { top: (p) => { p.rect(0, 0, 0.5, p.h, c.dark, 0.04); p.rect(p.w - 0.5, 0, 0.5, p.h, c.dark, 0.04); }, bottom: under }
        }
    });
    // Two steps round off its front.
    b.part('brim', { parent: 'head', pivot: [0, 0, 1.5], from: [-2, -0.5, 0], size: [4, 0.5, 0.5], paint: pleura(0) });
    b.part('brimTip', { parent: 'head', pivot: [0, 0, 2], from: [-1.25, -0.5, 0], size: [2.5, 0.5, 0.5], paint: pleura(-0.16) });
    b.part('glabella', {
        parent: 'head', pivot: [0, 0, 0], from: [-1, 0, 0], size: [2, 0.5, 2],
        paint: { color: c.light, noise: 0.05, bevel: 0.14, surface: 'smooth', faces: { top: (p) => { p.rect(0.5, 0.5, p.w - 1, 0.5, c.shell, 0.03); p.rect(0.5, 1.5, p.w - 1, 0.5, c.shell, 0.03); } } }
    });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        // The eye: a dark crescent of many lenses, with its bright rim facing out.
        b.part(`eye${side}`, {
            parent: 'head', pivot: [1.5 * sign, 0, 0.75], from: [-0.25, 0, -0.5], size: [0.5, 0.5, 1],
            paint: { color: 0x15110e, noise: 0.02, bevel: 0, surface: 'smooth', faces: { [sign > 0 ? 'right' : 'left']: (p) => p.rect(0, 0, p.w, 0.5, c.belly, 0) } }
        });
        b.part(`spine${side}`, { parent: 'head', pivot: [2.25 * sign, -0.5, 0], from: [-0.25, 0, -1], size: [0.5, 0.5, 1], paint: pleura(-0.16) });
        b.part(`antenna${side}`, {
            parent: 'head', pivot: [0.6 * sign, -0.3, 2.3], from: [-0.125, -0.125, 0], size: [0.25, 0.25, 1.5],
            paint: { color: c.dark, noise: 0.03, bevel: 0, surface: 'smooth' }, rotation: [0, 0.55 * sign, 0]
        });
    });
    return { head: 'head', legs, tail, arms: ['antennaL', 'antennaR'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('trilobite', {
    info: { eggColor: 0x8a5a3a, tone: 1500, maxHealth: 8, speed: 0.35, variants: 3, movement: 'cruise', seaDepth: 'bed', seaIdle: 0.4, seaCurl: 0.6, hiddenUntilDiscovered: true },
    model: trilobiteModel,
    surface: 'skin',
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'common', water: 4 },
    card: {
        name: 'Trilobite', habitat: 'Seas of the Palaeozoic, from 521 to 252 million years ago', activity: 'Day and night', temperament: 'Passive',
        description: 'An armoured animal of the sea bed with three lobes along its back and some of the first eyes that could make out shapes. It walks on many little legs and, when struck, often rolls into a ball.'
    },
    cardEs: {
        name: 'Trilobites', habitat: 'Mares del Paleozoico, de hace 521 a 252 millones de años',
        description: 'Un animal acorazado del fondo marino, con tres lóbulos a lo largo del lomo y unos de los primeros ojos capaces de distinguir formas. Camina con muchas patitas y, si lo golpeas, a menudo se enrolla en una bola.'
    }
});
