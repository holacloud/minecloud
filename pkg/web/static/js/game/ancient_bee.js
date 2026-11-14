// The ancient bee: an extinct animal (js/mobSpecies.js) and an ancient relative of the bee, found in amber and
// brought back by the revival machine. One of the first bees: still half wasp, with a narrow waist and thin
// legs, and already dusted with pollen. It lived alone, with no hive and no honey, so it has nothing of the
// colonies of js/game/flyers.js ('swarm'): it is one animal on the ground movement of js/game/mobs.js that
// hovers (`flyHeight`, as the macaw), so the server walks a kept one (js/game/animals.js). It stings nobody.
// What is its own is how it holds itself in the air: its wings never stop while it flies, it hums, and when
// it has had nowhere to go for a while it comes down and folds them. Coming down moves only its model: the
// mob stays where the server has it, so every player sees it in the same place.

// How fast its wings beat (radians a second) and how far, from how many blocks its hum is heard and how many
// seconds pass between two hums, after how many seconds without moving it lands, how fast it comes down and
// goes up (the bigger, the faster), and how long a blow keeps it in the air.
const ANCIENT_BEE = { beat: 55, sweep: 0.55, hear: 6, hum: [2.5, 5], land: 4, settle: 2.5, startle: 4 };

// Faces +z, standing on y = 0, which is how it lands (`flyHeight` lifts it the rest of the time). A wasp's
// outline with a bee's coat: a round hairy thorax speckled with pollen, a narrow waist, a slim abdomen with
// thin pale rings, long feelers, two pairs of wings and six thin legs under it, the hind ones yellow with
// pollen. Every size is a number of quarters of a unit: a texel is half a unit, and a smaller box is not
// painted.
function ancientBeeModel(b) {
    const coat = 0x5a4026;
    const dark = 0x241a12;
    const ring = 0xc8902e;
    const pollen = 0xf2cc3a;
    const wing = 0xe4ecee;
    b.part('body', {
        pivot: [0, 1.75, 0], from: [-0.75, -0.75, -0.75], size: [1.5, 1.5, 1.5],
        paint: { color: coat, noise: 0.1, all: (p, face) => { if (face !== 'bottom') p.spots(pollen, 2, 0.5, 0.5, face.length); } }
    });
    b.part('head', {
        parent: 'body', pivot: [0, 0, 0.75], from: [-0.625, -0.625, 0], size: [1.25, 1.25, 0.75],
        paint: { color: dark, noise: 0.04, all: (p, face) => {
            // A big eye on each side of the head, and the pale hairs of the face.
            if (face === 'left' || face === 'right') { p.fill(0x3a2c22, 0.03); p.rect(face === 'left' ? p.w - 0.5 : 0, 0, 0.5, 0.5, 0xb8aa98, 0); }
            if (face === 'front') { p.rect(0, 0, 0.5, 1, 0x3a2c22, 0); p.rect(p.w - 0.5, 0, 0.5, 1, 0x3a2c22, 0); p.rect(0.5, 0.5, p.w - 1, 0.5, 0x8a7450, 0.05); }
        } }
    });
    b.part('waist', { parent: 'body', pivot: [0, -0.1, -0.75], from: [-0.25, -0.25, -0.5], size: [0.5, 0.5, 0.5], paint: { color: dark, noise: 0.03 } });
    b.part('abdomen', {
        parent: 'body', pivot: [0, -0.1, -1.25], from: [-0.625, -0.75, -2], size: [1.25, 1.5, 2], rotation: [-0.15, 0, 0],
        paint: { color: dark, noise: 0.05, all: (p, face) => {
            if (face === 'front' || face === 'back') return;
            const along = face === 'top' || face === 'bottom';
            for (let i = 0.5; i < (along ? p.h : p.w); i += 1) {
                if (along) p.rect(0, i, p.w, 0.5, ring, 0.03);
                else p.rect(i, 0, 0.5, p.h, ring, 0.03);
            }
        } }
    });
    b.part('abdomenTip', { parent: 'abdomen', pivot: [0, 0, -2], from: [-0.375, -0.5, -0.5], size: [0.75, 1, 0.5], paint: { color: dark, noise: 0.04 } });

    const veined = { color: wing, noise: 0.03, bevel: 0.05, all: (p, face) => { if (face === 'top' || face === 'bottom') p.rect(0, 0.5, p.w, 0.5, 0xb4c2c6, 0); } };
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`antenna${side}`, { parent: 'head', pivot: [0.35 * sign, 0.4, 0.65], from: [-0.125, -0.125, 0], size: [0.25, 0.25, 1.25], paint: { color: dark, noise: 0.03 }, rotation: [-0.45, 0.4 * sign, 0] });
        // Two pairs of wings, the hind ones smaller: ancientBeeUpdate beats them, and folds them.
        b.part(`wing${side}`, { parent: 'body', pivot: [0.5 * sign, 0.75, 0.3], from: [sign > 0 ? 0 : -2.5, 0, -1], size: [2.5, 0.25, 1.25], paint: veined, rotation: [0, 0.25 * sign, 0.3 * sign] });
        b.part(`hindWing${side}`, { parent: 'body', pivot: [0.5 * sign, 0.75, -0.3], from: [sign > 0 ? 0 : -1.75, 0, -0.75], size: [1.75, 0.25, 1], paint: veined, rotation: [0, 0.6 * sign, 0.2 * sign] });
        [[0.5, 0.35, 1], [0, 0, 1], [-0.5, -0.4, 1.25]].forEach(([z, lean, length], i) => {
            b.part(`leg${side}${i}`, {
                parent: 'body', pivot: [0.5 * sign, -0.7, z], from: [-0.125, -length, -0.125], size: [0.25, length, 0.25], rotation: [-lean, 0, 0.3 * sign],
                paint: { color: dark, noise: 0.03, all: (p, face) => { if (i === 2 && face !== 'top' && face !== 'bottom') p.rect(0, 0.25, p.w, 0.5, pollen, 0.05); } }
            });
        });
    });
    return { head: 'head' };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('ancient_bee', {
    info: { eggColor: 0xc8902e, tone: 260, maxHealth: 6, speed: 0.7, flyHeight: 1, hiddenUntilDiscovered: true, ancestorOf: 'bee' },
    model: ancientBeeModel,
    surface: 'fur',
    // It made no honey and no comb: it leaves nothing.
    drops: [],
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [], cage: true },
    fossil: { source: 'amber', rarity: 'rare' },
    card: {
        name: 'Ancient bee', habitat: 'Flowering forests of Myanmar, about 100 million years ago', activity: 'Day', temperament: 'Passive',
        description: 'One of the first bees: 3 mm long, still half wasp, and already dusted with pollen. It lived alone, with no hive, and here it hovers low over the ground and stings nobody.'
    },
    cardEs: {
        name: 'Abeja antigua', habitat: 'Bosques con flores de Myanmar, hace unos 100 millones de años',
        description: 'Una de las primeras abejas: 3 mm de largo, todavía medio avispa y ya manchada de polen. Vivía sola, sin colmena, y aquí vuela bajo sobre el suelo y no pica a nadie.'
    }
});

// Every ancient bee there is, for ancientBeeUpdate: a short list, and empty nearly always.
onMobEvent('spawned', function (mob) {
    if (mob.userData.species === 'ancient_bee') (this.ancientBeeMobs || (this.ancientBeeMobs = [])).push(mob);
});

// A blow that did not finish it: up it goes, and it stays in the air for a while.
onMobEvent('damaged', function (mob) {
    if (mob.userData.species === 'ancient_bee' && mob.userData.ancientBee) mob.userData.ancientBee.still = -ANCIENT_BEE.startle;
});

registerFrameUpdate(function (delta) {
    this.ancientBeeUpdate(delta);
});

Object.assign(Game.prototype, {
    // What one bee keeps between frames: how long it has been still, how far down it is (0 in the air, 1 on
    // the ground) and when it hums next.
    ancientBeeState(mob) {
        const state = { still: 0, down: 0, hum: Math.random() * ANCIENT_BEE.hum[1] };
        mob.userData.ancientBee = state;
        return state;
    },

    // Wings, landing and hum of every ancient bee. The rig of js/game/mobs.js only flaps a pair of wings
    // while their owner moves, so these are not in its rig. The parts are read from the model each frame,
    // since a change of graphics builds it again; everything here is set, never added to what a frame left.
    ancientBeeUpdate(delta) {
        const bees = this.ancientBeeMobs;
        if (!bees || bees.length === 0) return;
        const player = this.getLocalPlayerPosition();
        for (let i = bees.length - 1; i >= 0; i--) {
            const mob = bees[i];
            if (!mob.parent) {
                bees.splice(i, 1);
                continue;
            }
            const data = mob.userData;
            const parts = data.modelParts;
            const state = data.ancientBee || this.ancientBeeState(mob);
            // A struck ground mob is thrown up and falls back to its floor (js/game/mobs.js), which for one
            // that hovers would be a slow sinking to the ground: it keeps the hop and not the fall.
            if (data.bounceVelocity < 0) data.bounceVelocity = 0;

            // Down when it has gone nowhere for a while, up as soon as it moves. One in a cage hangs in it.
            state.still = data.gait > 0.05 ? 0 : state.still + delta;
            const target = state.still > ANCIENT_BEE.land && !data.trapsCage ? 1 : 0;
            state.down = data.trapsCage ? 0 : state.down + (target - state.down) * Math.min(1, delta * ANCIENT_BEE.settle);
            // (All the way, and not nearly: on the ground nothing of it moves, and in the air nothing is folded.)
            if (Math.abs(target - state.down) < 0.001) state.down = target;
            // Its model comes down by what the mob hovers at: `flyHeight` and the bob mobs.js gives a hoverer.
            if (data.modelRoot && state.down > 0.001) data.modelRoot.position.y = -state.down * (data.flyHeight + Math.sin(data.stepPhase * 0.7) * 0.18);

            if (parts && parts.wingL && parts.wingR && parts.hindWingL && parts.hindWingR) {
                const air = 1 - state.down;
                const beat = Math.sin(data.life * ANCIENT_BEE.beat) * ANCIENT_BEE.sweep * air;
                const lag = Math.sin(data.life * ANCIENT_BEE.beat - 0.6) * ANCIENT_BEE.sweep * air;
                this.ancientBeeWing(parts.wingL, 1, beat, state.down);
                this.ancientBeeWing(parts.wingR, -1, beat, state.down);
                this.ancientBeeWing(parts.hindWingL, 1, lag, state.down);
                this.ancientBeeWing(parts.hindWingR, -1, lag, state.down);
            }

            state.hum -= delta;
            if (state.hum > 0) continue;
            state.hum = ANCIENT_BEE.hum[0] + Math.random() * (ANCIENT_BEE.hum[1] - ANCIENT_BEE.hum[0]);
            const loudness = 1 - Math.hypot(player.x - mob.position.x, player.y - mob.position.y, player.z - mob.position.z) / ANCIENT_BEE.hear;
            if (loudness <= 0 || state.down > 0.5 || this.titleScreenOpen) continue;
            const tone = getMobSpecies('ancient_bee').tone;
            this.playTone({ frequency: tone, endFrequency: tone * 0.92, duration: 0.5, type: 'sawtooth', volume: 0.008 * loudness, attack: 0.12, release: 0.25 });
        }
    },

    // One wing: beating about where the model holds it, or folded back along the abdomen and flat (`down`).
    ancientBeeWing(wing, sign, beat, down) {
        const base = wing.userData.baseRotation;
        wing.rotation.z = (base.z + beat * sign) * (1 - down);
        wing.rotation.y = base.y + (1.35 * sign - base.y) * down;
    }
});
