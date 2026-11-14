// Megalania: an extinct animal (js/mobSpecies.js) and an ancient relative of the lizard, found as a rare
// fossil in the deep rock and brought back by the revival machine. The biggest lizard that ever walked on
// land: a monitor lizard four blocks long, with a heavy tail, a forked tongue and legs that stick out
// sideways. It walks, comes for the player and bites as any hostile ground mob (js/game/mobs.js), so the
// server walks a kept one and says whom it is after (js/game/animals.js). What is its own is only its
// tongue, which it flicks out to smell the air.

// How often the tongue comes out, in seconds, how many times sooner while it is after somebody, and for
// how long it is out.
const MEGALANIA = { flickEvery: [2.5, 6], hurry: 4, flick: 0.55 };

// Faces +z. The lizard of js/models.js grown to the size of a crocodile: the same low body on four legs
// that stick out sideways and swing about y (`legAxis`), with what a monitor has pushed forward: a long
// flat head on a thick neck, a throat that hangs, a tail as long as the rest of it, and the tongue.
// Its middle (what the ground movement turns and measures from) is between its front legs, so that its
// mouth is what reaches the player. Every size is a multiple of half a unit: a face is painted in whole
// texels, two to a unit (js/models.js).
function megalaniaModel(b, variant) {
    const palettes = [
        // Earth grey, as the Komodo dragon: darker along the back, with a dusting of pale scales.
        { skin: 0x6e6753, back: 0x514b3c, band: 0x3d382d, speck: 0x938a6c, belly: 0xbdb08c, claw: 0x26221b, rings: false },
        // Dark brown with rows of cream spots and a ringed tail, as the perentie of Australia.
        { skin: 0x5e4a34, back: 0x47361f, band: 0x2f2314, speck: 0xe2cf9a, belly: 0xe4d6ac, claw: 0x241b10, rings: true }
    ];
    const c = palettes[variant % palettes.length];
    const tongue = 0xd8607a;
    // Rows of pale spots across the back (the perentie), or a few pale scales anywhere (the grey one).
    const speckle = (p, seed) => {
        if (!c.rings) { p.spots(c.speck, Math.ceil(p.w * p.h / 14), 0.5, 1, seed); return; }
        for (let y = 1; y < p.h - 0.5; y += 2.5) for (let x = 0.5 + ((y / 2.5) % 2) * 1; x < p.w - 0.5; x += 2) p.rect(x, y, 1, 1, c.speck, 0.04);
    };
    const hide = (seed) => ({
        color: c.skin, noise: 0.08,
        all: (p, face) => {
            if (face === 'bottom') { p.fill(c.belly, 0.05); return; }
            if (face === 'top') {
                p.fill(c.back, 0.08);
                for (let y = 1.5; y < p.h - 1; y += 4) p.rect(0, y, p.w, 1, c.band, 0.06);
                speckle(p, seed);
                return;
            }
            p.rect(0, 0, p.w, p.h * 0.3, c.back, 0.07);
            speckle(p, seed + 3);
            p.rect(0, p.h - Math.max(1, Math.round(p.h * 0.5) / 2), p.w, p.h, c.belly, 0.05);
        }
    });
    // The tail: ringed in the perentie, plain in the other.
    const tailHide = (seed) => ({
        color: c.skin, noise: 0.08,
        all: (p, face) => {
            if (face === 'bottom') { p.fill(c.belly, 0.05); return; }
            if (face === 'front' || face === 'back') return;
            if (face === 'top') p.fill(c.back, 0.08);
            const along = face === 'top' ? p.h : p.w;
            for (let d = 1; d < along - 0.5; d += 3) {
                const colour = c.rings ? c.speck : c.band;
                if (face === 'top') p.rect(0, d, p.w, 1, colour, 0.05);
                else p.rect(d, 0, 1, p.h, colour, 0.05);
            }
            if (face !== 'top') p.rect(0, p.h - 0.5, p.w, 0.5, c.belly, 0.05);
            if (!c.rings) p.spots(c.speck, 2, 0.5, 1, seed);
        }
    });

    // The trunk, long and low, with the shoulders a little higher and the belly hanging in the middle.
    b.part('body', { pivot: [0, 0, 0], from: [-5, 4, -21], size: [10, 7.5, 23], paint: hide(1) });
    b.part('shoulders', { parent: 'body', pivot: [0, 11.5, -1.5], from: [-4, 0, -3.5], size: [8, 1, 7], paint: { color: c.back, noise: 0.08, faces: { top: (p) => { p.rect(0, 3, p.w, 1, c.band, 0.06); speckle(p, 2); } } } });
    b.part('belly', { parent: 'body', pivot: [0, 4, -10], from: [-4, -1.5, -6], size: [8, 1.5, 12], paint: { color: c.belly, noise: 0.05 } });
    b.part('rump', { parent: 'body', pivot: [0, 0, -21], from: [-4, 5, -3], size: [8, 6, 3], paint: hide(4) });

    b.part('neck', { parent: 'body', pivot: [0, 8.5, 2], from: [-3, -3, -0.5], size: [6, 6, 5.5], paint: hide(5), rotation: [-0.14, 0, 0] });
    b.part('dewlap', { parent: 'neck', pivot: [0, -3, 0], from: [-2, -1.5, 0], size: [4, 1.5, 4.5], paint: { color: c.belly, noise: 0.06, all: (p, face) => { if (face !== 'bottom' && face !== 'top') for (let x = 0.5; x < p.w; x += 1.5) p.rect(x, 0, 0.5, p.h, c.skin, 0.05); } } });
    // The head: flat on top, with the eye under a ridge of bone and the ear, a dark hole, behind it.
    b.part('head', {
        parent: 'neck', pivot: [0, 0.5, 5], from: [-3.5, -2.5, -0.5], size: [7, 5, 6], rotation: [0.14, 0, 0],
        paint: {
            color: c.skin, noise: 0.07,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(c.belly, 0.05); return; }
                if (face === 'top') { p.fill(c.back, 0.07); p.spots(c.speck, 4, 0.5, 1, 6); return; }
                if (face !== 'left' && face !== 'right') return;
                p.rect(0, 0, p.w, 1.5, c.back, 0.06);
                p.rect(0, p.h - 1.5, p.w, 1.5, c.belly, 0.05);
                const eye = face === 'left' ? p.w - 2.5 : 1;
                p.rect(eye, 1, 1.5, 1.5, 0xd9a227, 0);
                p.rect(eye + (face === 'left' ? 0.5 : 0), 1.5, 1, 1, 0x100c08, 0);
                p.rect(face === 'left' ? 0.5 : p.w - 1.5, 2, 1, 1, c.band, 0);
            }
        }
    });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`brow${side}`, { parent: 'head', pivot: [2.5 * sign, 2.5, 3.5], from: [-1, 0, -1.5], size: [2, 0.5, 3], paint: { color: c.back, noise: 0.06 } });
    });
    const teeth = (p, y) => { for (let x = 0.5; x < p.w - 0.25; x += 1) p.rect(x, y, 0.5, 0.5, 0xf2ecd8, 0); };
    b.part('snout', {
        parent: 'head', pivot: [0, -0.5, 5.5], from: [-2.5, -1.5, 0], size: [5, 3.5, 5.5],
        paint: {
            color: c.skin, noise: 0.07,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(0xb86a72, 0.05); return; }
                if (face === 'top') { p.fill(c.back, 0.07); p.rect(1, p.h - 1, 0.5, 0.5, 0x100c08, 0); p.rect(p.w - 1.5, p.h - 1, 0.5, 0.5, 0x100c08, 0); return; }
                p.rect(0, 0, p.w, 1, c.back, 0.06);
                p.rect(0, p.h - 1, p.w, 1, c.belly, 0.05);
                if (face !== 'back') teeth(p, p.h - 0.5);
            }
        }
    });
    // The lower jaw, a little open: the mouth is pink inside.
    b.part('jaw', {
        parent: 'head', pivot: [0, -2, 0.5], from: [-2.5, -1.5, 0], size: [5, 1.5, 10], rotation: [0.1, 0, 0],
        paint: { color: c.belly, noise: 0.05, all: (p, face) => { if (face === 'top') p.fill(0xb86a72, 0.05); else if (face === 'left' || face === 'right' || face === 'front') teeth(p, 0); } }
    });
    // The forked tongue (megalaniaUpdate slides it in and out).
    b.part('tongue', { parent: 'jaw', pivot: [0, 0.25, 9], from: [-0.5, -0.25, 0], size: [1, 0.5, 3], paint: { color: tongue, noise: 0.03, bevel: 0 } });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`fork${side}`, { parent: 'tongue', pivot: [0.25 * sign, 0, 2.75], from: [-0.25, -0.25, 0], size: [0.5, 0.5, 2], paint: { color: 0xa83a58, noise: 0.03, bevel: 0 }, rotation: [0, 0.45 * sign, 0] });
    });

    // Four legs out to the sides, each a thick arm that slopes down to a foot flat on the ground, with claws.
    const legPaint = { color: c.skin, noise: 0.07, all: (p, face) => { if (face === 'bottom') p.fill(c.belly, 0.05); else if (face === 'top') p.fill(c.back, 0.07); else p.spots(c.speck, 2, 0.5, 1, 7); } };
    const footPaint = { color: c.skin, noise: 0.06, all: (p, face) => {
        if (face === 'bottom') { p.fill(c.belly, 0.05); return; }
        if (face === 'top') for (let x = 0.5; x < p.w; x += 1) p.rect(x, p.h - 1.5, 0.5, 1.5, c.claw, 0);
        if (face === 'front') for (let x = 0.5; x < p.w; x += 1) p.rect(x, 0, 0.5, p.h, c.claw, 0);
    } };
    const legs = [];
    [['F', -1.5, -0.45, 7, 7.5], ['B', -17.5, 0.5, 7, 7.5]].forEach(([end, z, spread, hip, reach]) => {
        [['L', 1], ['R', -1]].forEach(([side, sign]) => {
            const name = `leg${end}${side}`;
            b.part(name, {
                parent: 'body', pivot: [4.5 * sign, hip, z], from: sign > 0 ? [0, -1.5, -1.5] : [-reach, -1.5, -1.5], size: [reach, 3, 3],
                paint: legPaint, rotation: [0, spread * sign, -0.9 * sign]
            });
            b.part(`foot${end}${side}`, {
                parent: name, pivot: [(reach - 0.5) * sign, -0.5, 0], from: [-1.5, -1.5, -1.5], size: [3, 1.5, 4.5],
                paint: footPaint, rotation: [0, 0, 0.9 * sign]
            });
            legs.push(name);
        });
    });

    // The tail: as long as the trunk and the neck together, thick at the root, down to the ground at the tip.
    b.part('tail0', { parent: 'body', pivot: [0, 8.25, -23.5], from: [-3.5, -3, -6.5], size: [7, 6.5, 7], paint: tailHide(8), rotation: [-0.1, 0, 0] });
    b.part('tail1', { parent: 'tail0', pivot: [0, 0, -6.5], from: [-3, -2.5, -6.5], size: [6, 5, 7], paint: tailHide(9), rotation: [-0.1, 0, 0] });
    b.part('tail2', { parent: 'tail1', pivot: [0, -0.25, -6.5], from: [-2, -2, -6], size: [4, 3.5, 6.5], paint: tailHide(10), rotation: [-0.06, 0, 0] });
    b.part('tail3', { parent: 'tail2', pivot: [0, -0.25, -6], from: [-1.5, -1.5, -5.5], size: [3, 2.5, 6], paint: tailHide(11), rotation: [0.12, 0, 0] });
    return { legs, head: 'neck', tail: ['tail1', 'tail2', 'tail3'], legAxis: 'y' };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('megalania', {
    info: { eggColor: 0x6e6753, tone: 150, hostile: true, attackDamage: 3, chaseDistance: 12, keepDistance: 1.1, maxHealth: 20, speed: 0.4, chaseSpeed: 1.5, variants: 2, hiddenUntilDiscovered: true, ancestorOf: 'lizard' },
    model: megalaniaModel,
    surface: 'skin',
    drops: [['scale', 2, 4]],
    // No diet: a hunter is not tamed. No bait: one the server walks goes where the server says.
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Megalania', habitat: 'Open woods and grasslands of Australia, until about 50,000 years ago', activity: 'Day', temperament: 'Hostile',
        description: 'The biggest lizard that ever walked on land: 4 blocks of it, with a heavy tail and a forked tongue that smells the air. It hunted giant kangaroos, and it comes for you too.'
    },
    cardEs: {
        name: 'Megalania', habitat: 'Bosques abiertos y praderas de Australia, hasta hace unos 50 000 años',
        description: 'El lagarto más grande que ha pisado la tierra: 4 bloques de largo, con una cola pesada y una lengua bífida con la que huele el aire. Cazaba canguros gigantes, y también va a por ti.'
    }
});

// Every megalania there is, to move its tongue: a list of a few, kept as they appear.
onMobEvent('spawned', function (mob) {
    if (mob.userData.species === 'megalania') (this.megalaniaAlive || (this.megalaniaAlive = [])).push(mob);
});

registerFrameUpdate(function (delta) {
    this.megalaniaUpdate(delta);
});

Object.assign(Game.prototype, {
    // The tongue of each one: in its mouth most of the time, out for half a second to smell the air, and
    // out again and again while it is after this player.
    megalaniaUpdate(delta) {
        const alive = this.megalaniaAlive;
        if (!alive || alive.length === 0) return;
        const player = this.getLocalPlayerPosition();
        const chase = getMobSpecies('megalania').chaseDistance;
        for (let i = alive.length - 1; i >= 0; i--) {
            const mob = alive[i];
            if (!mob.parent) {
                alive.splice(i, 1);
                continue;
            }
            const data = mob.userData;
            const tongue = data.modelParts && data.modelParts.tongue;
            if (!tongue) continue;
            if (data.megalaniaFlick > 0) {
                data.megalaniaFlick -= delta;
            } else {
                const hunting = data.hostile && Math.hypot(player.x - mob.position.x, player.z - mob.position.z) < chase;
                data.megalaniaWait = (data.megalaniaWait ?? Math.random() * MEGALANIA.flickEvery[1]) - delta * (hunting ? MEGALANIA.hurry : 1);
                if (data.megalaniaWait <= 0) {
                    data.megalaniaWait = MEGALANIA.flickEvery[0] + Math.random() * (MEGALANIA.flickEvery[1] - MEGALANIA.flickEvery[0]);
                    data.megalaniaFlick = MEGALANIA.flick;
                }
            }
            const out = data.megalaniaFlick > 0 ? Math.sin((1 - data.megalaniaFlick / MEGALANIA.flick) * Math.PI) : 0;
            tongue.visible = out > 0.05;
            tongue.scale.z = Math.max(0.05, out);
            tongue.rotation.x = Math.sin(data.life * 40) * 0.25 * out;
        }
    }
});
