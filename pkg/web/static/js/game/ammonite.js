// Ammonites: an extinct animal of the sea, found as a common fossil in the rock (js/game/fossils.js) and
// brought back to life next to at least 6 blocks of water. A relative of squid and octopus inside a coiled,
// ribbed shell: its head, with its eyes and its tentacles, looks out of the opening. It hangs in mid water,
// bobbing, and moves in spurts with its shell first, as a squid does. How it moves is the 'cruise'
// movement of every sea animal (js/game/sea_animals.js): this file is its model and its row in the tables
// of the others.

// Where the shell is, in the plane it coils in (z ahead, y up), in model units: its middle and its radius.
const AMMONITE_SHELL = { y: 5.25, z: -0.5, radius: 4.75 };
// How much smaller each turn of the coil is than the one outside it.
const AMMONITE_GROWTH = 2.1;

// Faces +z, which is where its tentacles point: it travels the other way. The shell stands upright, thin
// from side to side, and is three boxes that cross (a wide one, a tall one and a thicker square over the
// middle of both) so that its outline is a twelve-sided disc. The coil and the ribs are painted on.
// Every size is a multiple of half a unit: a face is painted in whole texels, two to a unit, and most other
// sizes leave a texel of it unpainted (js/models.js).
function ammoniteModel(b, variant) {
    const palettes = [
        { shell: 0xe6d6ae, rib: 0xb98a58, seam: 0x6e4a2c, flesh: 0xd9826a, dark: 0x8f4a3c },
        { shell: 0xf0e8dc, rib: 0xb5532e, seam: 0x6a2c18, flesh: 0xe6c49a, dark: 0xa07a52 },
        { shell: 0xa9bcc6, rib: 0x6a7f8c, seam: 0x3c4a54, flesh: 0xc98fa0, dark: 0x7d5562 }
    ];
    const c = palettes[variant % palettes.length];
    const { y: shellY, z: shellZ, radius } = AMMONITE_SHELL;
    // The opening is low at the front, where the head is; from there the coil runs back under the shell,
    // up behind it and over the top.
    const opening = Math.atan2(2 - shellY, 4.2 - shellZ);
    const ribsOf = [20, 11];
    const grow = Math.log(AMMONITE_GROWTH);
    // A rib is the colour of the shell and a little of the seam's: it has to show, and leave the coil clear.
    const mix = (a, b2, k) => [0, 1, 2].map((i) => { const x = colorToRgb(a)[i]; return Math.round(x + (colorToRgb(b2)[i] - x) * k); });
    const ribColour = mix(c.shell, c.rib, 0.55);

    // The colour of the shell at a place of its side, seen from outside: the seam between two turns of
    // the coil, a rib, or the shell between two ribs.
    const sideColour = (z, y) => {
        const dz = z - shellZ;
        const dy = y - shellY;
        const r = Math.hypot(dz, dy);
        if (r < 0.55) return c.seam;
        let around = opening - Math.atan2(dy, dz);
        around -= Math.floor(around / (Math.PI * 2)) * Math.PI * 2;
        const turn = Math.log(radius / r) / grow - around / (Math.PI * 2);
        const whorl = Math.max(0, Math.floor(turn));
        // The seam: a line of its own width just inside where this turn of the coil ends.
        // (The innermost turns are thinner than that line: there the shell is plain, round its middle.)
        if (whorl >= ribsOf.length) return c.shell;
        if (turn >= 0 && radius * Math.exp(-grow * (whorl + around / (Math.PI * 2))) - r < 0.55) return c.seam;
        const rib = (around / (Math.PI * 2)) * ribsOf[whorl] + whorl * 0.37;
        return rib - Math.floor(rib) < 0.4 ? ribColour : c.shell;
    };
    // A side of one of the boxes of the shell, texel by texel. `zAt(px)`: where along the shell a place
    // of the face is (the left side of a box runs the other way from its right side).
    const side = (zAt, top) => (p) => {
        const texel = 1 / p.scale;
        for (let py = 0; py < p.h; py += texel) {
            for (let px = 0; px < p.w; px += texel) p.rect(px, py, texel, texel, sideColour(zAt(px + texel / 2), top - py - texel / 2), 0.04);
        }
    };
    // The rim: the ribs go across it, from one side of the shell to the other (a face of the rim is as
    // wide as the shell is thick).
    const rim = (p) => { for (let at = 0.5; at < p.h; at += 1.5) p.rect(0, at, p.w, 0.5, c.rib, 0.04); };
    // One of the three boxes: its sides carry the coil, every other face is rim.
    const shellBox = (name, parent, thick, y0, y1, z0, z1) => {
        b.part(name, {
            parent, pivot: [0, 0, 0], from: [-thick / 2, y0, z0], size: [thick, y1 - y0, z1 - z0],
            paint: {
                color: c.shell, noise: 0.05, bevel: 0.08, surface: 'smooth',
                faces: { right: side((px) => z1 - px, y1), left: side((px) => z0 + px, y1), top: rim, bottom: rim, front: rim, back: rim }
            }
        });
    };
    shellBox('body', null, 3.5, shellY - 3.75, shellY + 3.75, shellZ - 3.75, shellZ + 3.75);
    shellBox('shellWide', 'body', 3, shellY - 2.5, shellY + 2.5, shellZ - radius, shellZ + radius);
    shellBox('shellTall', 'body', 3, shellY - radius, shellY + radius, shellZ - 2.5, shellZ + 2.5);

    // The animal: its head in the opening, a big eye to each side, the funnel it squirts water from, and
    // its tentacles.
    const eye = (front) => (p) => {
        const x = front ? 0.5 : p.w - 1.7;
        p.rect(x, 0.55, 1.2, 1.2, 0xf4ecd8, 0);
        p.rect(x + 0.3, 0.85, 0.7, 0.6, 0x15110e, 0);
        p.rect(x + 0.3, 0.85, 0.3, 0.3, 0xffffff, 0);
    };
    b.part('head', {
        parent: 'body', pivot: [0, 1.9, 3.4], from: [-1.25, -1.3, 0], size: [2.5, 2.5, 2.5],
        paint: { color: c.flesh, noise: 0.06, bevel: 0.1, faces: { right: eye(true), left: eye(false), top: (p) => p.spots(c.dark, 4, 0.4, 0.8, 3), front: (p) => p.rect(0.6, 0.8, p.w - 1.2, 1, c.dark, 0.04) } }
    });
    b.part('funnel', { parent: 'head', pivot: [0, -1.3, 0.4], from: [-0.5, -0.5, 0], size: [1, 0.5, 1.5], paint: { color: c.dark, noise: 0.04, bevel: 0.05, surface: 'smooth' } });
    const armPaint = { color: c.flesh, noise: 0.05, bevel: 0.05, surface: 'smooth', faces: { front: (p) => p.fill(c.dark, 0.03), bottom: (p) => p.fill(0xf0d8c8, 0.03) } };
    const arms = [];
    [[0.55, 0.7, -0.38, 0.28], [0.8, -0.1, -0.05, 0.5], [0.5, -0.8, 0.3, 0.24]].forEach(([x, y, pitch, yaw], row) => {
        [['L', 1], ['R', -1]].forEach(([name, sign]) => {
            b.part(`arm${row}${name}`, { parent: 'head', pivot: [x * sign, y, 2.4], from: [-0.25, -0.25, 0], size: [0.5, 0.5, row === 2 ? 2 : 2.5], paint: armPaint, rotation: [pitch, yaw * sign, 0] });
            arms.push(`arm${row}${name}`);
        });
    });
    return { arms };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('ammonite', {
    info: { eggColor: 0xe6d6ae, tone: 620, maxHealth: 12, speed: 0.5, variants: 3, movement: 'cruise', seaDepth: 0.5, seaJet: true, seaIdle: 0.3, hiddenUntilDiscovered: true },
    model: ammoniteModel,
    surface: 'skin',
    drops: [['shell', 1, 1]],
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'common', water: 6 },
    card: {
        name: 'Ammonite', habitat: 'Seas all over the world, from 400 to 66 million years ago', activity: 'Day and night', temperament: 'Passive',
        description: 'A cousin of squid and octopus that lived inside a coiled shell full of chambers of gas, which kept it afloat. It hangs in the water waving its tentacles and moves in spurts, shell first.'
    },
    cardEs: {
        name: 'Amonites', habitat: 'Mares de todo el mundo, de hace 400 a 66 millones de años',
        description: 'Un pariente de calamares y pulpos que vivía dentro de una concha enrollada llena de cámaras de gas, que lo mantenían a flote. Flota en el agua moviendo los tentáculos y avanza a chorros, con la concha por delante.'
    }
});
