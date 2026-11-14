// Tyrannosaurus: an extinct animal (js/mobSpecies.js), the great hunter of the last dinosaurs, found as a
// legendary skeleton of three pieces (the rarest of all) and brought back by the revival machine. Eight blocks
// long, its body level over two strong legs, a huge head full of teeth, two tiny arms of two fingers and a
// heavy tail held out behind for balance. It is hostile: it walks, chases and bites as a hostile ground mob
// (js/game/mobs.js), so the server walks a kept one and says whom it is after, the same player for everybody
// (js/game/animals.js). What is its own, on the client of the player it is after:
//   - it is slow to turn: its body follows the player at TYRANNOSAURUS.turn radians a second at most, and its
//     bite is where its head is, so a player who goes round to its side is not bitten;
//   - it stops a few blocks away (`keepDistance`) and bites with its jaws, nearly three blocks in front of its
//     middle, not with its middle as a smaller hunter does;
//   - now and then, with the player in front of it and not too near, it roars and charges in a straight line
//     (js/game/charge.js, with the row below): the roar is the warning, and the line cannot bend.
// Struck, it charges whoever struck it, as the mammoth does. It is a giant: its body, its step and the boxes
// that push a player are those of js/game/diplodocus.js (`giant` in its info).

const TYRANNOSAURUS = {
    turn: 1.4, // radians a second its body turns at most while it hunts
    chargeFrom: 12, // blocks: it charges a player nearer than this...
    chargeNear: 5, // ...and further than this, who is in front of it...
    chargeCone: 0.5, // ...within this angle of where it faces (radians)
    again: 4, // seconds after a charge before another
    jaws: 2.8, // blocks from its middle to the middle of its jaws (their tip is at 3.3)
    bite: 1.6, // how near its jaws the player has to be for the bite
    tall: 2.5, // how far apart in height its feet and the player's may be for the bite
    biteDamage: 6,
    biteEvery: 1.5
};

// The charge, in seconds and blocks (js/game/charge.js says what each one is). It roars for longer than the
// mammoth trumpets, which is the time to run; then it runs much faster than a player, but only straight.
const TYRANNOSAURUS_CHARGE = { aim: 1.2, run: 1.6, pace: 7.5, reach: 3.6, whisker: 3.2, tall: 2.5, damage: 7, shove: 12, lift: 5, rest: 2, leash: 24, reason: 'You were bitten by a tyrannosaurus', cry: [95, 45, 1.2] };

// The model, in sixteenths of a block. The body and the legs are also the boxes that push a player.
const TYRANNOSAURUS_TRUNK = { from: [-13, 40, -18], size: [26, 26, 40] };
const TYRANNOSAURUS_LEG_X = 11;
const TYRANNOSAURUS_HIP = [44, -4];
const TYRANNOSAURUS_TAIL = [[22, 20, 13, -0.05], [18, 16, 12, 0.01], [14, 12.5, 11, 0.01], [10, 9, 10, 0.01], [7, 6, 9, 0], [4, 3.5, 8, 0]];

// Faces +z. A level body balanced over the hips, the chest a little lower, a thick short neck rising to a head
// as long as a man is tall, and the tail straight out behind.
function tyrannosaurusModel(b) {
    const hide = 0x6e5b3c;
    const dark = 0x45372a;
    const stripe = 0x584631;
    const belly = 0xc2a978;
    const tooth = 0xf3ecd6;
    const mouth = 0x7c3330;
    const skin = { color: hide, noise: 0.07, all: (p, face) => {
        if (face === 'bottom') { p.fill(belly, 0.05); return; }
        if (face === 'top') {
            p.fill(dark, 0.07);
            for (let y = 1; y < p.h; y += 4) p.rect(0, y, p.w, 1.5, stripe, 0.05);
            return;
        }
        p.rect(0, 0, p.w, Math.min(4, p.h / 3), dark, 0.06);
        if (face === 'left' || face === 'right') for (let x = 1; x < p.w; x += 4) p.rect(x, 0, 1.5, p.h * 0.5, stripe, 0.05);
        p.rect(0, p.h - Math.min(4, p.h / 3), p.w, Math.min(4, p.h / 3), belly, 0.05);
    } };

    b.part('body', { pivot: [0, 0, 0], from: TYRANNOSAURUS_TRUNK.from, size: TYRANNOSAURUS_TRUNK.size, paint: skin });
    b.part('hips', { parent: 'body', pivot: [0, 0, 0], from: [-11, 65.5, -14], size: [22, 1.5, 18], paint: skin });
    b.part('chest', { parent: 'body', pivot: [0, 0, 0], from: [-11.5, 35, 8], size: [23, 5, 16], paint: skin });
    b.part('neck', { parent: 'body', pivot: [0, 54, 20], from: [-7.5, -8, -2], size: [15, 17, 11], rotation: [-0.3, 0, 0], paint: skin });

    // The head: long and deep, with a ridge over each eye, the nostrils at the front and teeth along the jaws.
    b.part('head', {
        parent: 'body', pivot: [0, 56, 29], from: [-8, -4, -1], size: [16, 12.5, 25],
        paint: { color: hide, noise: 0.06, all: (p, face) => {
            if (face === 'bottom') { p.fill(mouth, 0.04); return; }
            if (face === 'top') { p.fill(dark, 0.06); return; }
            if (face === 'front') {
                p.rect(0, p.h - 1.75, p.w, 1.75, tooth, 0.02);
                p.rect(2, 2, 2, 1.5, 0x1b140e, 0);
                p.rect(p.w - 4, 2, 2, 1.5, 0x1b140e, 0);
                return;
            }
            if (face !== 'left' && face !== 'right') return;
            // Eye far back, gold with a black slit, under a dark brow.
            const eye = face === 'left' ? 4 : p.w - 7;
            p.rect(eye - 0.5, 2.5, 4, 1, 0x2a2017, 0);
            p.rect(eye, 3.5, 3, 2.25, 0xd9a632, 0);
            p.rect(eye + 1.25, 3.5, 0.75, 2.25, 0x110c08, 0);
            // The lips and a row of long teeth hanging over the lower jaw.
            p.rect(0, p.h - 2.5, p.w, 0.5, 0x2c2218, 0);
            for (let x = 0.5; x < p.w - 0.5; x += 2) p.rect(face === 'left' ? x : p.w - x - 1, p.h - 2, 1, 2, tooth, 0.02);
        } }
    });
    b.part('browL', { parent: 'head', pivot: [5, 8.5, 6], from: [-1.5, -0.5, -2], size: [3, 2, 4.5], paint: { color: dark, noise: 0.06 } });
    b.part('browR', { parent: 'head', pivot: [-5, 8.5, 6], from: [-1.5, -0.5, -2], size: [3, 2, 4.5], paint: { color: dark, noise: 0.06 } });
    b.part('jaw', {
        parent: 'head', pivot: [0, -4, 0], from: [-7, -5, 0], size: [14, 5, 23.5],
        paint: { color: hide, noise: 0.06, all: (p, face) => {
            if (face === 'bottom') { p.fill(belly, 0.05); return; }
            if (face === 'top') { p.fill(mouth, 0.04); return; }
            p.rect(0, 0, p.w, 1.25, tooth, 0.02);
            if (face === 'front') return;
            for (let x = 1; x < p.w - 0.5; x += 2) p.rect(x, 0, 1, 1.75, tooth, 0.02);
            p.rect(0, p.h - 2, p.w, 2, belly, 0.05);
        } }
    });

    // The arms: as long as a man's, on an animal this size tiny, with two clawed fingers each.
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
        b.part(`arm${side}`, { parent: 'body', pivot: [9.5 * sign, 44, 22], from: [-1.5, -8, -1.5], size: [3, 8, 3], rotation: [-0.6, 0, 0], paint: { color: hide, noise: 0.06, faces: { bottom: (p) => p.fill(belly, 0.04) } } });
        for (const [i, x] of [[0, 0.75], [1, -0.75]]) {
            b.part(`finger${side}${i}`, { parent: `arm${side}`, pivot: [x, -8, 0.5], from: [-0.375, -3, -0.375], size: [0.75, 3, 0.75], rotation: [-0.5, 0, 0], paint: { color: 0x2d241b, noise: 0.03, surface: 'smooth' } });
        }
    }

    TYRANNOSAURUS_TAIL.forEach(([w, h, length, turn], i) => {
        b.part(`tail${i}`, {
            parent: i === 0 ? 'body' : `tail${i - 1}`,
            pivot: i === 0 ? [0, 56, -17] : [0, 0, -(TYRANNOSAURUS_TAIL[i - 1][2] - 1)],
            from: [-w / 2, -h / 2, -length], size: [w, h, length], rotation: [turn, 0, 0], paint: skin
        });
    });

    // Legs: a thick thigh, a shin set back from it and a long foot with three toes forward, one under the
    // other with no turn, so that its feet stand on y = 0 exactly.
    const legPaint = { color: hide, noise: 0.07, all: (p, face) => {
        if (face === 'top') return;
        if (face === 'bottom') { p.fill(0x2e251b, 0.04); return; }
        p.rect(0, 0, p.w, Math.min(3, p.h / 4), dark, 0.05);
        if (face === 'left' || face === 'right') for (let y = 3; y < p.h; y += 4) p.rect(0, y, p.w, 0.5, stripe, 0.04);
    } };
    for (const [side, sign] of [['L', 1], ['R', -1]]) {
        b.part(`thigh${side}`, { parent: 'body', pivot: [TYRANNOSAURUS_LEG_X * sign, TYRANNOSAURUS_HIP[0], TYRANNOSAURUS_HIP[1]], from: [-6, -20, -7], size: [12, 24, 14], paint: skin });
        b.part(`shin${side}`, { parent: `thigh${side}`, pivot: [0, -20, -3], from: [-4, -18, -4], size: [8, 18, 8], paint: legPaint });
        b.part(`foot${side}`, {
            parent: `shin${side}`, pivot: [0, -18, 0], from: [-4.5, -6, -4], size: [9, 6, 15],
            paint: { color: hide, noise: 0.06, all: (p, face) => {
                if (face === 'bottom') { p.fill(0x2e251b, 0.04); return; }
                if (face === 'top') { p.rect(0.75, p.h - 6, 2, 6, dark, 0.04); p.rect(3.5, p.h - 6, 2, 6, dark, 0.04); p.rect(6.25, p.h - 6, 2, 6, dark, 0.04); return; }
                if (face === 'front') for (const x of [0.75, 3.5, 6.25]) p.rect(x, p.h - 2, 2, 2, 0xe6dcc0, 0.03);
            } }
        });
    }
    return { legs: ['thighL', 'thighR'], arms: ['armL', 'armR'], head: 'head', tail: TYRANNOSAURUS_TAIL.map((row, i) => `tail${i}`) };
}

// The boxes of its body that push a player, in blocks: the trunk with the chest, and each leg from the hip
// down to the toes.
function tyrannosaurusBoxes() {
    const [x0, y0, z0] = TYRANNOSAURUS_TRUNK.from;
    const [w, h, d] = TYRANNOSAURUS_TRUNK.size;
    const legs = [1, -1].map((sign) => {
        const x = TYRANNOSAURUS_LEG_X * sign;
        return [(x - 6) / 16, (x + 6) / 16, 0, TYRANNOSAURUS_HIP[0] / 16, (TYRANNOSAURUS_HIP[1] - 7) / 16, (TYRANNOSAURUS_HIP[1] + 8) / 16];
    });
    return [[x0 / 16, (x0 + w) / 16, 35 / 16, (y0 + h + 1.5) / 16, z0 / 16, (z0 + d + 4) / 16], ...legs];
}

registerSpecies('tyrannosaurus', {
    info: { eggColor: 0x6e5b3c, tone: 70, hostile: true, chaseDistance: 16, keepDistance: 3, attackDamage: TYRANNOSAURUS.biteDamage, maxHealth: 120, speed: 0.4, chaseSpeed: 2.2, charge: TYRANNOSAURUS_CHARGE, giant: { front: 2.2, back: 2.2, half: 0.9, tall: 4, boxes: tyrannosaurusBoxes(), stride: 0.55, swing: 0.6, habit: 'tyrannosaurusHunt' }, hiddenUntilDiscovered: true },
    model: tyrannosaurusModel,
    surface: 'skin',
    drops: [['leather', 3, 6], ['scale', 2, 4]],
    // No diet: a hunter is not tamed. No bait: one the server walks goes where the server says.
    trap: { baits: [] },
    fossil: { source: 'skeleton', rarity: 'legendary', weight: 1 },
    card: {
        name: 'Tyrannosaurus', habitat: 'Forests and plains of western North America, from 68 to 66 million years ago', activity: 'Day and night', temperament: 'Hostile',
        description: 'One of the biggest hunters that ever lived on land: about 12 metres long, with a head of 1.5 metres and teeth as long as bananas. It roars before it charges: run to one side, because it cannot turn while it runs.'
    },
    cardEs: {
        name: 'Tiranosaurio', habitat: 'Bosques y llanuras del oeste de Norteamérica, desde hace 68 hasta hace 66 millones de años',
        description: 'Uno de los cazadores más grandes que han vivido en tierra: unos 12 metros de largo, con una cabeza de 1,5 metros y dientes tan largos como plátanos. Ruge antes de embestir: corre hacia un lado, porque no puede girar mientras corre.'
    }
});

// Where it faces from the moment it is made: its turns are held to its own pace from there.
onMobEvent('spawned', function (mob) {
    if (mob.userData.species === 'tyrannosaurus') mob.userData.tyrannosaurusYaw = mob.rotation.y;
});

Object.assign(Game.prototype, {
    // Its habit (js/game/diplodocus.js calls it every frame, from `giant.habit`).
    tyrannosaurusHunt(mob, delta) {
        const data = mob.userData;
        const jaw = data.modelParts && data.modelParts.jaw;
        if (data.chargeRun) {
            this.tyrannosaurusCharging(mob);
            // The roar: its jaws wide open while it aims, and open as it runs.
            if (jaw) jaw.rotation.x = jaw.userData.baseRotation.x + (data.chargeRun.phase === 'aim' ? 0.55 : data.chargeRun.phase === 'run' ? 0.3 : 0);
            data.tyrannosaurusYaw = mob.rotation.y;
            return;
        }
        if (data.tyrannosaurusCharges) {
            data.tyrannosaurusCharges = false;
            data.hostile = this.tyrannosaurusAfterMe(mob, data.tyrannosaurusHunted);
            data.tyrannosaurusRest = TYRANNOSAURUS.again;
        }
        data.tyrannosaurusRest = Math.max(0, (data.tyrannosaurusRest || 0) - delta);
        data.tyrannosaurusSnap = Math.max(0, (data.tyrannosaurusSnap || 0) - delta);
        if (jaw) jaw.rotation.x = jaw.userData.baseRotation.x + Math.sin(Math.min(1, data.tyrannosaurusSnap / 0.35) * Math.PI) * 0.45;
        if (!data.hostile) {
            data.tyrannosaurusYaw = mob.rotation.y;
            data.tyrannosaurusHunting = false;
            return;
        }
        if (!data.tyrannosaurusHunting) {
            // It has seen its prey: a roar, before anything else.
            data.tyrannosaurusHunting = true;
            data.tyrannosaurusRest = Math.max(data.tyrannosaurusRest, 1.5);
            this.tyrannosaurusRoar(0.8);
        }
        // Slow to turn: what js/game/mobs.js turned it to this frame is held to its own pace.
        const was = data.tyrannosaurusYaw ?? mob.rotation.y;
        const wanted = Math.atan2(Math.sin(mob.rotation.y - was), Math.cos(mob.rotation.y - was));
        const most = TYRANNOSAURUS.turn * delta;
        mob.rotation.y = was + Math.max(-most, Math.min(most, wanted));
        data.tyrannosaurusYaw = mob.rotation.y;

        const player = this.getLocalPlayerPosition();
        const dx = player.x - mob.position.x;
        const dz = player.z - mob.position.z;
        const distance = Math.hypot(dx, dz);
        const sin = Math.sin(mob.rotation.y);
        const cos = Math.cos(mob.rotation.y);
        const off = Math.atan2(dx, dz) - mob.rotation.y;
        const facing = Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) < TYRANNOSAURUS.chargeCone;
        if (facing && data.tyrannosaurusRest <= 0 && distance > TYRANNOSAURUS.chargeNear && distance < TYRANNOSAURUS.chargeFrom && typeof this.chargeProvoke === 'function') {
            this.chargeProvoke(mob);
            this.tyrannosaurusCharging(mob);
            return;
        }
        // The bite: where its jaws are, not its middle.
        const feetGap = Math.abs(player.y - (this.cameraController.eyeHeight || 1.62) - mob.position.y);
        const jawsX = mob.position.x + sin * TYRANNOSAURUS.jaws;
        const jawsZ = mob.position.z + cos * TYRANNOSAURUS.jaws;
        if (data.attackCooldown <= 0 && feetGap <= TYRANNOSAURUS.tall && Math.hypot(player.x - jawsX, player.z - jawsZ) < TYRANNOSAURUS.bite) {
            this.applyDamage(TYRANNOSAURUS.biteDamage, 'You were bitten by a tyrannosaurus', 'mob', mob.position);
            data.attackCooldown = TYRANNOSAURUS.biteEvery;
            data.tyrannosaurusSnap = 0.35;
            this.playNoiseBurst({ duration: 0.1, volume: 0.04, highpass: 90, lowpass: 900 });
        }
    },

    // While it charges, the charge walks it (js/game/charge.js): the chase of js/game/mobs.js would pull it
    // towards the player and bend the line. Said from the frame the charge starts.
    tyrannosaurusCharging(mob) {
        const data = mob.userData;
        if (data.tyrannosaurusCharges || !data.chargeRun) return;
        data.tyrannosaurusCharges = true;
        data.tyrannosaurusHunted = data.hostile;
        data.hostile = false;
    },

    // Whether it is after this player once a charge is over: one the server walks, if the server still says
    // so (the same rule as js/game/animals.js, which only says it when something changes); any other, as it was.
    tyrannosaurusAfterMe(mob, before) {
        const state = mob.userData.animal;
        if (!state || !state.walks || !state.walked || typeof ANIMALS_MODE === 'undefined') return before;
        return state.mode === ANIMALS_MODE.chase && state.after === this.network.playerId;
    },

    tyrannosaurusRoar(volume) {
        this.playTone({ frequency: 110, endFrequency: 50, duration: 1.1, type: 'sawtooth', volume: 0.03 * volume, attack: 0.08, release: 0.3, detune: 30 });
        this.playNoiseBurst({ duration: 0.8, volume: 0.03 * volume, highpass: 80, lowpass: 700 });
    }
});
