// Onychonycteris, the clawed bat: an extinct animal (js/mobSpecies.js) and an ancient relative of the bat,
// found as a rare fossil in the deep rock and brought back by the revival machine. One of the first bats
// there were: it flew already, but its wings were short, each of its five fingers still ended in a claw,
// and its ears, it seems, could not yet hear the echo of its own voice. It is no bat of js/game/bats.js
// (a kept animal needs a body on the ground, and theirs has none): it is a ground mob that hovers
// (`flyHeight`, js/game/mobs.js), so the server walks a kept one (js/game/animals.js), low over the
// ground. What is its own is that it does not stay up: when it has nowhere to go it comes down, folds its
// wings and stands on its claws, as an animal that climbed as much as it flew, and it takes off again to
// move.

// How it flies, in blocks and seconds: for how long it beats its wings in one place before it comes down,
// how fast it sinks and rises, how far back a landed one folds its arm and its hand (radians), and for how
// long a struck one will not land. How high it flies is its `flyHeight`.
const ONYCHONYCTERIS = { hover: 1.5, sink: 1.6, rise: 2.4, fold: 1.15, tuck: 1.4, fright: 4 };

// Faces +z, its feet on y = 0 and its belly just over it: when it flies the whole of it is lifted. The bat
// of js/models.js pushed back to what it was: a longer snout and smaller ears, a long tail, and wings in two
// pieces (the arm and the hand) with a pale claw at the end of every finger. The wings are built spread,
// hanging a little from shoulders that never move: the rig lifts them from there to beat them.
function onychonycterisModel(b, variant) {
    const palettes = [
        { fur: 0x7a5638, belly: 0xb69670, membrane: 0x38291f, bone: 0x6a4e38, face: 0x4a3424 },
        { fur: 0x5c5450, belly: 0x9c948c, membrane: 0x2a2424, bone: 0x554a46, face: 0x383230 }
    ];
    const c = palettes[variant % palettes.length];
    const claw = 0xefe4c4;
    b.part('body', { pivot: [0, 0, 0], from: [-0.75, 0.5, -1.5], size: [1.5, 1.75, 3], paint: { color: c.fur, noise: 0.1, faces: { bottom: (p) => p.fill(c.belly, 0.07) } } });
    b.part('head', {
        parent: 'body', pivot: [0, 1.75, 1.5], from: [-1, -0.75, 0], size: [2, 1.5, 1.5],
        paint: { color: c.fur, noise: 0.08, all: (p, face) => {
            if (face === 'bottom') { p.fill(c.belly, 0.06); return; }
            if (face === 'front') { p.rect(0, 0.5, 0.5, 0.5, 0x0a0808, 0); p.rect(1.5, 0.5, 0.5, 0.5, 0x0a0808, 0); return; }
            if (face === 'left') p.rect(p.w - 0.5, 0.5, 0.5, 0.5, 0x0a0808, 0);
            if (face === 'right') p.rect(0, 0.5, 0.5, 0.5, 0x0a0808, 0);
        } }
    });
    // A snout like a small dog's: no bat of today that hunts by echo has a plainer one.
    b.part('snout', { parent: 'head', pivot: [0, -0.25, 1.5], from: [-0.5, -0.5, 0], size: [1, 0.75, 0.75], paint: { color: c.face, noise: 0.05, faces: { front: (p) => p.rect(0.25, 0, 0.5, 0.25, 0x140e0c, 0) } } });
    const earPaint = { color: c.fur, noise: 0.06, faces: { front: (p) => p.rect(0.25, 0.25, p.w - 0.5, p.h - 0.25, 0xa87a70, 0.03) } };
    b.part('earL', { parent: 'head', pivot: [0.65, 0.75, 0.5], from: [-0.4, 0, -0.25], size: [0.75, 1, 0.5], paint: earPaint, rotation: [0, 0, -0.25] });
    b.part('earR', { parent: 'head', pivot: [-0.65, 0.75, 0.5], from: [-0.35, 0, -0.25], size: [0.75, 1, 0.5], paint: earPaint, rotation: [0, 0, 0.25] });
    b.part('tail', { parent: 'body', pivot: [0, 1.75, -1.5], from: [-0.25, -0.25, -2.5], size: [0.5, 0.5, 2.5], paint: { color: c.face, noise: 0.05 }, rotation: [-0.2, 0, 0] });

    // The skin of the wing, with the bones of the arm and of the fingers showing through.
    const armSkin = { color: c.membrane, noise: 0.06, surface: 'skin', all: (p, face) => {
        if (face === 'top' || face === 'bottom') p.rect(0, face === 'top' ? p.h - 0.5 : 0, p.w, 0.5, c.bone, 0.04);
    } };
    const handSkin = { color: c.membrane, noise: 0.06, surface: 'skin', all: (p, face) => {
        if (face !== 'top' && face !== 'bottom') return;
        p.rect(0, face === 'top' ? p.h - 0.5 : 0, p.w, 0.5, c.bone, 0.04);
        p.rect(0, p.h / 2 - 0.25, p.w, 0.5, c.bone, 0.04);
    } };
    const clawPaint = { color: claw, noise: 0.02, surface: 'smooth' };
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        // Where a box starts along x when it reaches `length` out from its pivot, on this side.
        const out = (length) => (sign > 0 ? 0 : -length);
        b.part(`shoulder${side}`, { parent: 'body', pivot: [0.75 * sign, 2, 0.5], from: [out(0.5), -0.25, -0.25], size: [0.5, 0.5, 0.5], paint: { color: c.fur, noise: 0.08 }, rotation: [0, 0, -0.35 * sign] });
        b.part(`wing${side}`, { parent: `shoulder${side}`, pivot: [0.25 * sign, 0, 0], from: [out(1.75), -0.125, -2.25], size: [1.75, 0.25, 3], paint: armSkin });
        b.part(`wingTip${side}`, { parent: `wing${side}`, pivot: [1.75 * sign, 0, 0.5], from: [out(2), -0.125, -2.5], size: [2, 0.25, 2.5], paint: handSkin });
        // A claw on every finger: the thumb at the wrist, pointing forward, and one at the end of each of
        // the four fingers that hold the wing open.
        b.part(`thumb${side}`, { parent: `wing${side}`, pivot: [1.5 * sign, 0, 0.75], from: [-0.25, -0.125, 0], size: [0.5, 0.25, 0.75], paint: clawPaint });
        [[0, 0], [0, -1.25], [-0.75, -2.5], [-1.5, -2.5]].forEach(([x, z], finger) => {
            const outward = finger < 2;
            b.part(`claw${side}${finger}`, {
                parent: `wingTip${side}`, pivot: [(2 + x) * sign, 0, z],
                from: outward ? [out(0.75), -0.125, -0.25] : [-0.25, -0.125, -0.75], size: outward ? [0.75, 0.25, 0.5] : [0.5, 0.25, 0.75], paint: clawPaint
            });
        });
        // Hind legs trailing behind it, each foot with claws of its own.
        b.part(`leg${side}`, { parent: 'body', pivot: [0.5 * sign, 0.9, -1.25], from: [-0.25, -0.9, -0.25], size: [0.5, 0.9, 0.5], paint: { color: c.face, noise: 0.05, faces: { bottom: (p) => p.fill(claw, 0.02) } }, rotation: [0.6, 0, 0] });
    });
    return { legs: ['legL', 'legR'], wings: ['wingL', 'wingR'], head: 'head', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('onychonycteris', {
    info: { eggColor: 0x7a5638, tone: 3200, maxHealth: 6, speed: 1.1, flyHeight: 1.4, variants: 2, hiddenUntilDiscovered: true, ancestorOf: 'bat' },
    model: onychonycterisModel,
    surface: 'fur',
    drops: [['leather', 1, 1, 0.5]],
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Onychonycteris', habitat: 'Lake shores and forests of North America, about 52 million years ago', activity: 'Day and night', temperament: 'Passive',
        description: 'One of the first bats. Each of its 5 fingers ends in a claw (a bat of today keeps 1 or 2), and it probably could not yet find its way by echo. It flutters low, and comes down to rest with its wings folded.'
    },
    cardEs: {
        name: 'Onychonycteris', habitat: 'Orillas de lagos y bosques de Norteamérica, hace unos 52 millones de años',
        description: 'Uno de los primeros murciélagos. Cada uno de sus 5 dedos acaba en una garra (a uno de hoy le quedan 1 o 2), y seguramente aún no sabía guiarse por el eco. Revolotea bajo, y baja a descansar con las alas plegadas.'
    }
});

// Every one there is, to see to them one by one each frame: a short list, and empty where there are none.
onMobEvent('spawned', function (mob) {
    if (mob.userData.species === 'onychonycteris') (this.onychonycterisFlock || (this.onychonycterisFlock = [])).push(mob);
});

// A blow that did not finish it: it will not sit there to take another.
onMobEvent('damaged', function (mob) {
    if (mob.userData.species === 'onychonycteris') mob.userData.onychonycterisStill = -ONYCHONYCTERIS.fright;
});

registerFrameUpdate(function (delta) {
    this.onychonycterisUpdate(delta);
});

Object.assign(Game.prototype, {
    onychonycterisUpdate(delta) {
        const flock = this.onychonycterisFlock;
        if (!flock || flock.length === 0) return;
        for (let i = flock.length - 1; i >= 0; i--) {
            // One that left the scene (defeated, or out of this client's sight) leaves the list.
            if (flock[i].parent) this.onychonycterisFly(flock[i], delta);
            else flock.splice(i, 1);
        }
    },

    // One frame of one of them, after js/game/mobs.js has walked it: up while it goes somewhere, down
    // when it has stood for a while. Nothing here moves it over the ground, so one the server walks is
    // where the server says on every client; how high it is, each client works out from the same walk.
    onychonycterisFly(mob, delta) {
        const data = mob.userData;
        const full = getMobSpecies('onychonycteris').flyHeight;
        // mobs.js moves on the step of a mob only while it walks it: that is how it is known to be going.
        const going = data.stepPhase !== data.onychonycterisStep;
        data.onychonycterisStill = going ? Math.min(0, data.onychonycterisStill || 0) : (data.onychonycterisStill || 0) + delta;
        const down = data.onychonycterisStill > ONYCHONYCTERIS.hover;
        // `flyHeight` is its own (userData), and what mobs.js and everybody else reads as how far over
        // the ground its body is: lowered little by little, with the body, it lands.
        const height = down ? Math.max(0, data.flyHeight - ONYCHONYCTERIS.sink * delta) : Math.min(full, data.flyHeight + ONYCHONYCTERIS.rise * delta);
        mob.position.y += height - data.flyHeight;
        data.flyHeight = height;
        // In the air and going nowhere it still has to beat its wings, and they beat by that step.
        if (!going && height > 0) data.stepPhase += delta * 7;
        data.onychonycterisStep = data.stepPhase;

        // Its wings: open in the air; on the ground the arm swings back along the body and the hand
        // folds over it. (The rig beats them up and down, about another axis.)
        const fold = 1 - height / full;
        const parts = data.modelParts;
        if (!parts || !parts.wingL || !parts.wingTipL) return;
        parts.wingL.rotation.y = fold * ONYCHONYCTERIS.fold;
        parts.wingR.rotation.y = -fold * ONYCHONYCTERIS.fold;
        parts.wingTipL.rotation.y = fold * ONYCHONYCTERIS.tuck;
        parts.wingTipR.rotation.y = -fold * ONYCHONYCTERIS.tuck;
    }
});
