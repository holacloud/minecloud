// Meganeura: an extinct animal (js/mobSpecies.js) with no living relative in the game, found as a rare fossil
// in the deep rock and brought back by the revival machine. A giant relative of the dragonflies from the
// forests of the Carboniferous, as big as a hawk: two pairs of long clear wings, big eyes and a long thin
// abdomen. It is a ground mob that hovers (`flyHeight`, js/game/mobs.js), so the server walks a kept one
// (js/game/animals.js), low over the ground; it hurts nobody. What is its own is how it holds itself in the
// air: its four wings never stop while it flies, the hind pair out of step with the front one, and when it
// has had nowhere to go for a while it comes down to rest with its wings spread flat, as a dragonfly does.
// Coming down moves only its model: the mob stays where the server has it, so every player sees it in the
// same place (as js/game/ancient_bee.js).

// How fast its wings beat (radians a second) and how far, how far behind the front pair the hind pair beats,
// after how many seconds without moving it lands, how fast it comes down and goes up, how long a blow keeps
// it in the air, and from how far and how often its wings are heard.
const MEGANEURA = { beat: 32, sweep: 0.5, lag: 1.6, land: 4, settle: 2.5, startle: 4, hear: 6, rustle: [3, 6] };

// Faces +z, standing on its six thin legs on y = 0, which is how it lands (`flyHeight` lifts it the rest of
// the time). A stout thorax with the four wings on top of it, a round head that is nearly all eyes, and an
// abdomen in three pieces, thin and long, ending in two little points. The wings are clear, painted with
// the dark lines of their veins and a dark spot near each tip. They are its `wings`: the rig of
// js/game/mobs.js leaves four alone, and meganeuraUpdate beats them. Every size is a number of quarters of
// a unit: a texel is half a unit, and a smaller box is not painted.
function meganeuraModel(b, variant) {
    const palettes = [
        // Bronze body, green eyes.
        { body: 0x5a4a2a, dark: 0x2a2216, ring: 0x8a7a3a, eye: 0x3e6a4a, eyeLight: 0x8ab890 },
        // Steel blue body, brown eyes.
        { body: 0x3a4e62, dark: 0x1e2834, ring: 0x6a8aa8, eye: 0x6a4a32, eyeLight: 0xb08a62 }
    ];
    const c = palettes[variant % palettes.length];
    const wing = 0xdfecef;
    const vein = 0x7e8a8e;
    const stigma = 0x3a2e24;
    b.part('body', {
        pivot: [0, 1.5, 0], from: [-0.75, -0.75, -1], size: [1.5, 1.5, 2],
        paint: { color: c.body, noise: 0.08, all: (p, face) => { if (face === 'left' || face === 'right') p.rect(0, 0, p.w, 0.5, c.ring, 0.04); } }
    });
    // The head: two huge eyes that meet on top, and a small face between them.
    b.part('head', {
        parent: 'body', pivot: [0, 0.25, 1], from: [-1, -0.75, 0], size: [2, 1.5, 1.25],
        paint: {
            color: c.eye, noise: 0.05, surface: 'smooth',
            all: (p, face) => {
                if (face === 'left' || face === 'right') p.rect(face === 'left' ? p.w - 0.5 : 0, 0, 0.5, 0.5, c.eyeLight, 0);
                if (face === 'top') p.rect(0.5, 0, 1, 0.5, c.eyeLight, 0);
                if (face === 'front') { p.rect(0.5, 0.5, 1, 1, c.dark, 0.03); p.rect(0.5, 1, 1, 0.5, c.ring, 0.03); }
                if (face === 'bottom') p.fill(c.dark, 0.03);
            }
        }
    });
    // The abdomen: three pieces, thinner towards the end, a pale ring at each joint.
    const ringed = { color: c.body, noise: 0.06, all: (p, face) => { if (face !== 'front' && face !== 'back') { const along = face === 'top' || face === 'bottom'; if (along) p.rect(0, 0, p.w, 0.5, c.ring, 0.03); else p.rect(0, 0, 0.5, p.h, c.ring, 0.03); } } };
    b.part('abdomen0', { parent: 'body', pivot: [0, 0, -1], from: [-0.5, -0.5, -2], size: [1, 1, 2], paint: ringed });
    b.part('abdomen1', { parent: 'abdomen0', pivot: [0, 0, -2], from: [-0.375, -0.375, -2], size: [0.75, 0.75, 2], paint: ringed });
    b.part('abdomen2', { parent: 'abdomen1', pivot: [0, 0, -2], from: [-0.25, -0.25, -1.25], size: [0.5, 0.5, 1.25], paint: ringed });

    // A clear wing: dark veins along its edges and across it, and the dark spot near the tip. `tipAt` is the
    // end of the face that is the tip (the right side of the top face for a wing going out to the left).
    const veined = (tipRight) => ({
        color: wing, noise: 0.02, surface: 'smooth',
        all: (p, face) => {
            if (face !== 'top' && face !== 'bottom') { p.fill(vein, 0.02); return; }
            p.rect(0, 0, p.w, 0.5, vein, 0.02);
            p.rect(0, p.h - 0.5, p.w, 0.5, vein, 0.02);
            for (let x = 1; x < p.w - 0.5; x += 1.5) p.rect(x, 0, 0.5, p.h, vein, 0.02);
            const front = face === 'top' ? p.h - 0.5 : 0;
            p.rect(tipRight ? p.w - 1.5 : 0.5, front, 1, 0.5, stigma, 0);
        }
    });
    const wings = [];
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`wing${side}`, { parent: 'body', pivot: [0.5 * sign, 0.75, 0.5], from: [sign > 0 ? 0 : -5, 0, -0.75], size: [5, 0.25, 1.25], rotation: [0, -0.08 * sign, 0.06 * sign], paint: veined(sign > 0) });
        b.part(`hindWing${side}`, { parent: 'body', pivot: [0.5 * sign, 0.75, -0.5], from: [sign > 0 ? 0 : -4.75, 0, -1], size: [4.75, 0.25, 1.5], rotation: [0, 0.12 * sign, 0.06 * sign], paint: veined(sign > 0) });
        wings.push(`wing${side}`, `hindWing${side}`);
        // Six thin legs, bent forward, to perch with and to catch other insects in flight.
        [[0.5, 0.45], [0, 0.15], [-0.5, -0.2]].forEach(([z, lean], i) => {
            b.part(`leg${side}${i}`, { parent: 'body', pivot: [0.5 * sign, -0.6, z], from: [-0.125, -1, -0.125], size: [0.25, 1, 0.25], rotation: [lean, 0, 0.35 * sign], paint: { color: c.dark, noise: 0.03 } });
        });
        b.part(`cercus${side}`, { parent: 'abdomen2', pivot: [0.125 * sign, 0, -1.25], from: [-0.125, -0.125, -0.75], size: [0.25, 0.25, 0.75], rotation: [0, -0.3 * sign, 0], paint: { color: c.dark, noise: 0.03 } });
    });
    return { head: 'head', wings };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('meganeura', {
    info: { eggColor: 0x5a4a2a, tone: 180, maxHealth: 6, speed: 1.4, flyHeight: 1.5, variants: 2, hiddenUntilDiscovered: true },
    model: meganeuraModel,
    surface: 'smooth',
    drops: [],
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [], cage: true },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Meganeura', habitat: 'Swampy forests of Europe, about 300 million years ago', activity: 'Day', temperament: 'Passive',
        description: 'A giant cousin of the dragonflies, with wings 70 cm across: as big as a hawk. It hunted other insects in flight. Here it flies low and rests with its wings spread flat.'
    },
    cardEs: {
        name: 'Meganeura', habitat: 'Bosques pantanosos de Europa, hace unos 300 millones de años',
        description: 'Una prima gigante de las libélulas, con alas de 70 cm de punta a punta: grande como un halcón. Cazaba otros insectos al vuelo. Aquí vuela bajo y descansa con las alas extendidas.'
    }
});

// Every meganeura there is, for meganeuraUpdate: a short list, and empty nearly always.
onMobEvent('spawned', function (mob) {
    if (mob.userData.species === 'meganeura') (this.meganeuraMobs || (this.meganeuraMobs = [])).push(mob);
});

// A blow that did not finish it: up it goes, and it stays in the air for a while.
onMobEvent('damaged', function (mob) {
    if (mob.userData.species === 'meganeura' && mob.userData.meganeura) mob.userData.meganeura.still = -MEGANEURA.startle;
});

registerFrameUpdate(function (delta) {
    this.meganeuraUpdate(delta);
});

Object.assign(Game.prototype, {
    // What one keeps between frames: how long it has been still, how far down it is (0 in the air, 1 on the
    // ground) and when its wings are heard next.
    meganeuraState(mob) {
        const state = { still: 0, down: 0, rustle: Math.random() * MEGANEURA.rustle[1] };
        mob.userData.meganeura = state;
        return state;
    },

    // Wings, landing and rustle of every meganeura. The parts are read from the model each frame, since a
    // change of graphics builds it again; everything here is set, never added to what a frame left.
    meganeuraUpdate(delta) {
        const all = this.meganeuraMobs;
        if (!all || all.length === 0) return;
        const player = this.getLocalPlayerPosition();
        for (let i = all.length - 1; i >= 0; i--) {
            const mob = all[i];
            if (!mob.parent) {
                all.splice(i, 1);
                continue;
            }
            const data = mob.userData;
            const parts = data.modelParts;
            const state = data.meganeura || this.meganeuraState(mob);
            // A struck ground mob is thrown up and falls back to its floor (js/game/mobs.js), which for one
            // that hovers would be a slow sinking to the ground: it keeps the hop and not the fall.
            if (data.bounceVelocity < 0) data.bounceVelocity = 0;

            // Down when it has gone nowhere for a while, up as soon as it moves. One in a cage hangs in it.
            state.still = data.gait > 0.05 ? 0 : state.still + delta;
            const target = state.still > MEGANEURA.land && !data.trapsCage ? 1 : 0;
            state.down = data.trapsCage ? 0 : state.down + (target - state.down) * Math.min(1, delta * MEGANEURA.settle);
            if (Math.abs(target - state.down) < 0.001) state.down = target;
            // Its model comes down by what the mob hovers at: `flyHeight` and the bob mobs.js gives a hoverer.
            if (data.modelRoot) data.modelRoot.position.y = state.down > 0.001 ? -state.down * (data.flyHeight + Math.sin(data.stepPhase * 0.7) * 0.18) : 0;

            if (parts && parts.wingL && parts.wingR && parts.hindWingL && parts.hindWingR) {
                // On the ground the wings stay spread, flat and a little drooping, and do not beat.
                const air = 1 - state.down;
                const beat = Math.sin(data.life * MEGANEURA.beat) * MEGANEURA.sweep * air;
                const lag = Math.sin(data.life * MEGANEURA.beat - MEGANEURA.lag) * MEGANEURA.sweep * air;
                this.meganeuraWing(parts.wingL, 1, beat, state.down);
                this.meganeuraWing(parts.wingR, -1, beat, state.down);
                this.meganeuraWing(parts.hindWingL, 1, lag, state.down);
                this.meganeuraWing(parts.hindWingR, -1, lag, state.down);
            }

            state.rustle -= delta;
            if (state.rustle > 0) continue;
            state.rustle = MEGANEURA.rustle[0] + Math.random() * (MEGANEURA.rustle[1] - MEGANEURA.rustle[0]);
            const loudness = 1 - Math.hypot(player.x - mob.position.x, player.y - mob.position.y, player.z - mob.position.z) / MEGANEURA.hear;
            if (loudness <= 0 || state.down > 0.5 || this.titleScreenOpen) continue;
            this.playNoiseBurst({ duration: 0.3, volume: 0.012 * loudness, highpass: 250, lowpass: 900 });
        }
    },

    // One wing: beating about where the model holds it, or still and drooping a little on the ground.
    meganeuraWing(wing, sign, beat, down) {
        const base = wing.userData.baseRotation;
        wing.rotation.z = base.z + beat * sign - 0.1 * sign * down;
    }
});
