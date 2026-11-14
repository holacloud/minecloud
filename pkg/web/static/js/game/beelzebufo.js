// Beelzebufo, the devil frog: an extinct animal (js/mobSpecies.js) and an ancient relative of the frog,
// found as a rare fossil in the deep rock and brought back by the revival machine. A frog as big as a beach
// ball, with a head that is half of it, a mouth as wide as its body, a skull of bone like a helmet and a
// little horn over each eye. It hops, swims and croaks as the frog does (the built-in 'hop' movement,
// js/game/wildlife.js): the server keeps a revived one and each client hops its own copy about its home.
// What is its own is what it does when struck: it does not only hop away. It turns round, opens its mouth
// wide and jumps at whoever hit it, and its bite hurts. Only the player who struck it sees that: mobs fight
// in each browser.

// The bite back, in seconds and blocks: how long it shows its open mouth before it jumps (time to step
// aside), from how far it still tries, how far a jump takes it at most, how near its mouth has to land for
// the bite to reach, what the bite takes, and how long the whole thing may last before it forgets.
const BEELZEBUFO = { gape: 0.6, sight: 6, leap: 3, reach: 0.9, tall: 1.6, damage: 2, patience: 4 };
// How long a hop of the frog's movement is in the air on flat ground (it leaves at 4.6 up and falls at 18:
// js/game/wildlife.js), which is what turns a distance into the speed of a jump.
const BEELZEBUFO_AIRTIME = 2 * 4.6 / 18;

// Faces +z. The frog of js/models.js made fat and pushed back to what it was: the same folded hind legs and
// short arms, under the same names (`thighL`, `footL`, `armL`, `throat`...: the frog's movement stretches
// them to hop and to swim, and swells the throat to croak), and a head that opens: `head` is the skull, hinged
// at the back, over a lower jaw that stays on the body. Every size is a multiple of half a unit: a face is
// painted in whole texels, two to a unit (js/models.js).
function beelzebufoModel(b, variant) {
    const palettes = [
        // Moss green with dark blotches, as the horned frogs of South America that are its nearest kin.
        { skin: 0x6f8a3a, dark: 0x3d4f1f, blotch: 0x4b3a22, rim: 0xb9c46a, belly: 0xe2dba6, bone: 0x8f8a56, horn: 0x4a3d24, eye: 0xd9a531 },
        // The colour of dead leaves.
        { skin: 0x9a7444, dark: 0x5c4022, blotch: 0x4a2f1a, rim: 0xd6b577, belly: 0xe8d9b0, bone: 0xa98f62, horn: 0x4a321c, eye: 0xc98a2a }
    ];
    const c = palettes[variant % palettes.length];
    const mouth = 0xc9737a;
    // Big dark blotches with a pale rim, and warts.
    const blotches = (p, count, seed) => {
        p.spots(c.rim, count, 2, 3, seed);
        p.spots(c.blotch, count, 1.5, 2.5, seed);
        p.spots(c.dark, Math.ceil(p.w * p.h / 8), 0.5, 0.5, seed + 5);
    };
    const skin = (seed) => ({ color: c.skin, noise: 0.07, all: (p, face) => {
        if (face === 'bottom') { p.fill(c.belly, 0.04); return; }
        blotches(p, Math.ceil(p.w * p.h / 26), seed);
        if (face === 'top') p.rect(p.w / 2 - 0.5, 0, 1, p.h, c.rim, 0.05);
        else p.rect(0, p.h - 1.5, p.w, 1.5, c.belly, 0.04);
    } });
    b.part('body', { pivot: [0, 0, 0], from: [-5, 1, -5], size: [10, 5.5, 10], paint: skin(1) });
    b.part('back', { parent: 'body', pivot: [0, 6.5, -0.5], from: [-4, 0, -3.5], size: [8, 1, 7], paint: { color: c.skin, noise: 0.07, all: (p, face) => { blotches(p, face === 'top' ? 3 : 1, 2); if (face === 'top') p.rect(p.w / 2 - 0.5, 0, 1, p.h, c.rim, 0.05); } } });
    b.part('sideL', { parent: 'body', pivot: [5, 1.5, -0.5], from: [0, 0, -3.5], size: [1, 4, 7], paint: skin(3) });
    b.part('sideR', { parent: 'body', pivot: [-5, 1.5, -0.5], from: [-1, 0, -3.5], size: [1, 4, 7], paint: skin(4) });

    // The lower jaw and the throat stay with the body; the tongue lies in the jaw.
    const lip = (p) => { p.fill(c.belly, 0.04); p.rect(0, 0, p.w, 0.5, c.dark, 0.03); };
    b.part('jaw', {
        parent: 'body', pivot: [0, 1.5, 5], from: [-5, 0, 0], size: [10, 2, 4.5],
        paint: { color: c.belly, noise: 0.04, faces: { front: lip, left: lip, right: lip, top: (p) => { p.fill(mouth, 0.05); p.rect(p.w / 2 - 2, 0.5, 4, p.h - 1, 0xe08d8f, 0.04); } } }
    });
    b.part('throat', { parent: 'jaw', pivot: [0, 0, 1.5], from: [-3, -0.5, -1], size: [6, 0.5, 3.5], paint: { color: c.belly, noise: 0.03, surface: 'smooth' } });
    // The skull: a helmet of rough bone, with the nostrils at the front, the dark line of the mouth all
    // round its edge and the eyes on top.
    const gum = (p) => p.rect(0, p.h - 0.5, p.w, 0.5, 0x1d2410, 0.02);
    b.part('head', {
        parent: 'body', pivot: [0, 3.5, 4.5], from: [-5.5, 0, 0], size: [11, 3.5, 5.5],
        paint: {
            color: c.skin, noise: 0.07,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(mouth, 0.05); return; }
                if (face === 'top') {
                    // The roof of the skull: pitted bone, between the eyes and back to the neck.
                    p.rect(2.5, 0, p.w - 5, p.h - 1, c.bone, 0.08);
                    p.spots(c.dark, 9, 0.5, 0.5, 6);
                    return;
                }
                blotches(p, 1, 7);
                if (face === 'front') { p.rect(3.5, 0.5, 0.5, 0.5, 0x15110c, 0); p.rect(p.w - 4, 0.5, 0.5, 0.5, 0x15110c, 0); }
                if (face !== 'back') gum(p);
            }
        }
    });
    const eyePaint = {
        color: c.skin, noise: 0.05, surface: 'smooth',
        all: (p, face) => {
            if (face === 'bottom' || face === 'back' || face === 'top') return;
            p.rect(0.5, 0.5, p.w - 1, p.h - 0.5, c.eye, 0);
            p.rect(0.5, 1, p.w - 1, 0.5, 0x0d0b0a, 0);
        }
    };
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`eye${side}`, { parent: 'head', pivot: [3.5 * sign, 3.5, 2.5], from: [-1.25, -0.5, -1.25], size: [2.5, 2, 2.5], paint: eyePaint });
        // The little horn: a point of skin over the eye, leaning out.
        b.part(`horn${side}`, { parent: `eye${side}`, pivot: [0.75 * sign, 1.5, -0.25], from: [-0.5, -0.25, -0.5], size: [1, 1, 1], paint: { color: c.horn, noise: 0.05 }, rotation: [-0.2, 0, -0.5 * sign] });
    });

    const legPaint = { color: c.skin, noise: 0.06, all: (p, face) => { if (face === 'bottom') p.fill(c.belly, 0.04); else p.spots(c.blotch, 2, 1, 1.5, 8); } };
    const footPaint = { color: c.dark, noise: 0.05, surface: 'smooth', faces: { top: (p) => { for (let x = 0.5; x < p.w; x += 1) p.rect(x, p.h - 2, 0.5, 2, c.skin, 0.04); } } };
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`arm${side}`, { parent: 'body', pivot: [4 * sign, 3, 3.5], from: [-1, -3, -1], size: [2, 3, 2], paint: legPaint, rotation: [0.2, 0, -0.2 * sign] });
        b.part(`hand${side}`, { parent: `arm${side}`, pivot: [0, -3, 0], from: [-1.5, 0, -0.5], size: [3, 0.5, 3], paint: footPaint });
        // Thighs pivot at the hip; the long foot folds forward under them.
        b.part(`thigh${side}`, { parent: 'body', pivot: [5 * sign, 3, -3.5], from: sign > 0 ? [0, -1.5, -1.5] : [-2.5, -1.5, -1.5], size: [2.5, 3.5, 5.5], paint: legPaint, rotation: [0.35, 0, 0] });
        b.part(`foot${side}`, { parent: `thigh${side}`, pivot: [1.25 * sign, -1.5, 3.5], from: [-1.75, -0.5, -5], size: [3.5, 0.5, 6], paint: footPaint, rotation: [-0.35, 0, 0] });
    });
    return { head: 'head' };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('beelzebufo', {
    info: { eggColor: 0x6f8a3a, tone: 120, maxHealth: 16, speed: 2.6, variants: 2, movement: 'hop', hiddenUntilDiscovered: true, ancestorOf: 'frog' },
    model: beelzebufoModel,
    surface: 'skin',
    // No diet: the frog's movement takes no orders, so it cannot be tamed. No bait: it hunts what moves.
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Beelzebufo', habitat: 'Madagascar, about 70 million years ago', activity: 'Day and night (more at night)', temperament: 'Neutral',
        description: 'The devil frog: as big as a beach ball, with a mouth as wide as its body, a skull like a helmet and a little horn over each eye. Leave it alone and it only hops. Hit it and it jumps at you and bites.'
    },
    cardEs: {
        name: 'Beelzebufo', habitat: 'Madagascar, hace unos 70 millones de años',
        description: 'La rana diablo: grande como un balón de playa, con una boca tan ancha como su cuerpo, un cráneo como un casco y un cuernecito sobre cada ojo. Si la dejas tranquila, solo salta. Si le pegas, se te tira encima y muerde.'
    }
});

// A blow that did not finish it: it will have its own back.
onMobEvent('damaged', function (mob) {
    if (mob.userData.species === 'beelzebufo') this.beelzebufoProvoke(mob);
});

// Only the ones that are angry: an empty list, nearly always.
registerFrameUpdate(function (delta) {
    this.beelzebufoUpdate(delta);
});

Object.assign(Game.prototype, {
    beelzebufoProvoke(mob) {
        const data = mob.userData;
        if (data.health <= 0 || data.beelzebufoAnger) return;
        // The frog's movement hops it away from the blow first (js/game/mobs.js): it turns on the player
        // where it lands.
        data.beelzebufoAnger = { phase: 'land', timer: 0, left: BEELZEBUFO.patience, open: 0, bitten: false };
        (this.beelzebufoAngry || (this.beelzebufoAngry = [])).push(mob);
    },

    beelzebufoUpdate(delta) {
        const angry = this.beelzebufoAngry;
        if (!angry || angry.length === 0) return;
        for (let i = angry.length - 1; i >= 0; i--) {
            const mob = angry[i];
            if (mob.parent && this.beelzebufoRaging(mob, delta)) continue;
            // Over: its mouth is shut, whatever it was doing.
            const head = mob.userData.modelParts && mob.userData.modelParts.head;
            if (head) head.rotation.x = head.userData.baseRotation.x;
            mob.userData.beelzebufoAnger = null;
            angry.splice(i, 1);
        }
    },

    // One frame of its anger: it lands, shows its open mouth, jumps at the player and shuts it. Returns
    // whether it is still at it. Where it is and how it hops is still the frog's movement
    // (updateHoppingMob, js/game/wildlife.js): this only holds it still, turns it and launches one hop.
    beelzebufoRaging(mob, delta) {
        const data = mob.userData;
        const anger = data.beelzebufoAnger;
        if (!anger || this.titleScreenOpen || this.respawnPending) return false;
        const player = this.getLocalPlayerPosition();
        const position = mob.position;
        const dx = player.x - position.x;
        const dz = player.z - position.z;
        const distance = Math.hypot(dx, dz);
        anger.left -= delta;
        anger.timer -= delta;
        // Whatever keeps it (a fall with no end, a chunk that went away under it), it does not stay angry.
        if (anger.left <= 0) return false;

        let open = 0;
        if (anger.phase === 'land') {
            // In the water it has nowhere to jump from: it lets it be.
            if (data.swimming) return false;
            if (!data.airborne) {
                if (distance > BEELZEBUFO.sight) return false;
                anger.phase = 'gape';
                anger.timer = BEELZEBUFO.gape;
                // A growl, as a warning.
                const tone = getMobSpecies('beelzebufo').tone;
                this.playTone({ frequency: tone, endFrequency: tone * 0.6, duration: 0.45, type: 'sawtooth', volume: 0.03, attack: 0.02, release: 0.15 });
            }
        } else if (anger.phase === 'gape') {
            if (data.airborne || data.swimming) {
                // The ground went from under it: again when it lands.
                anger.phase = 'land';
            } else {
                open = 1;
                // Still, and facing whoever hit it.
                data.hopTimer = Math.max(data.hopTimer || 0, 0.5);
                data.facing = Math.atan2(dz, dx);
                if (anger.timer <= 0) {
                    // At where the player is now: whoever steps aside in time is missed.
                    const reach = Math.min(distance, BEELZEBUFO.leap);
                    if (distance > BEELZEBUFO.sight || !this.startHop(mob, data.facing, reach, reach / BEELZEBUFO_AIRTIME)) return false;
                    anger.phase = 'leap';
                }
            }
        } else if (anger.phase === 'leap') {
            open = 1;
            // Its mouth is at the front of its head, half a block ahead of its middle.
            const mouthX = position.x + Math.cos(data.facing) * 0.5;
            const mouthZ = position.z + Math.sin(data.facing) * 0.5;
            const feet = player.y - (this.cameraController.eyeHeight || 1.62);
            if (!anger.bitten && Math.hypot(player.x - mouthX, player.z - mouthZ) <= BEELZEBUFO.reach && Math.abs(feet - position.y) <= BEELZEBUFO.tall) {
                anger.bitten = true;
                this.applyDamage(BEELZEBUFO.damage, 'You were bitten by a beelzebufo', 'mob', position);
                this.playNoiseBurst({ duration: 0.08, volume: 0.04, highpass: 150, lowpass: 1200 });
            }
            if (!data.airborne) {
                anger.phase = 'shut';
                anger.timer = 0.3;
            }
        } else if (anger.timer <= 0) {
            return false;
        }

        // The mouth: the skull lifts, hinged at the back.
        anger.open += (open - anger.open) * Math.min(1, delta * 12);
        const head = data.modelParts && data.modelParts.head;
        if (head) head.rotation.x = head.userData.baseRotation.x - anger.open * 0.75;
        return true;
    }
});
