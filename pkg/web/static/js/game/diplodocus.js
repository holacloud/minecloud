// Diplodocus: an extinct animal (js/mobSpecies.js), a giant plant-eating dinosaur of the Jurassic, found as
// a legendary skeleton of three pieces and brought back by the revival machine. The biggest animal of the
// game: fourteen blocks from nose to tail, five tall at the hips, a small head on a long neck held forward
// and up, a deep body on four pillars and a whip of a tail. It walks as any ground mob (js/game/mobs.js), so
// the server walks a kept one (js/game/animals.js). What is its own: it eats from the treetops (when it
// stands with leaves at the height of its head it reaches up and chews; it takes no block), and once tamed
// with leaves it is ridden from high on its back (js/game/riding.js), slowly, with a view over the trees.
//
// It is also where the body of a giant lives, which the tyrannosaurus (js/game/tyrannosaurus.js) shares: the
// walk of js/game/mobs.js moves a mob as a point, and an animal many blocks long needs a little more. A
// species says `giant` in its info and gets, every frame, from giantUpdate below:
//   - a body that does not go into walls: a step that would put its chest into a wall, a fence, a roof or a
//     ledge deeper than 3 blocks is taken back (the walk looks 0.3 ahead of a point; a giant looks as far as
//     its body reaches). Its neck and tail are over that height and pass over low things. A ridden one is
//     held the same way, so its rider cannot push its head through a house.
//   - boxes a player cannot stand in: its legs, and its body above the belly. The local player is moved out
//     of them (walking under a diplodocus, between its legs, is allowed: its belly is 2.4 blocks up).
//   - a heavy step: its legs swing less, and more slowly, than the shared walk of a pig's would.
//   - its habit, a method of Game called with (mob, delta) every frame.
// The row (blocks, from its middle, in the model's frame: x across, y up, z forward):
//   front   how far ahead of its middle the ground has to be walkable for it to step (its chest, its forelegs)
//   back    the same behind it, for a ridden one that backs up
//   half    half its width, where it looks for walls to each side at the end of `front`
//   tall    the height of its body: a roof under this is a roof it would put its back through
//   boxes   [[x0, x1, y0, y1, z0, z1], ...]: what pushes the player
//   stride  how much of the shared walk's pace its legs keep (1: all of it), and `swing` how much of its swing
//   habit   the name of a method of Game, or null

// The model, in sixteenths of a block. The trunk and the legs are also the boxes that push a player.
const DIPLODOCUS_TRUNK = { from: [-17, 38, -26], size: [34, 36, 52] };
const DIPLODOCUS_HIPS = { from: [-14, 73.5, -25], size: [28, 7.5, 27] };
const DIPLODOCUS_LEGS = {
    front: { x: 11, z: 15, size: [10, 42, 11] },
    back: { x: 11.5, z: -15, size: [12, 46, 12] }
};

// The neck: six pieces, each hanging from the one before along its own +z, from the front of the shoulders.
// Each row: width, height, length and how much it turns up (radians; less than 0 is up) from the piece before.
// The pieces are a chain because the shared animation turns the first one to look around, and the whole
// neck, head and all, swings with it. What measures a model without turning its parts (js/models.js,
// js/game/herd.js) reads this neck as level, at the height of the back: the health bar stands over the
// back, and the body is 5 blocks tall, as the master table says of it.
const DIPLODOCUS_NECK_BASE = [0, 62, 24];
const DIPLODOCUS_NECK = [[20, 20, 16, -0.55], [17, 17, 15, 0.03], [15, 15, 14, 0.03], [13, 13, 14, 0.03], [11, 11, 13, 0.03], [10, 10, 12, 0.03]];
// The head turns down again from the end of the neck, so that it looks forward.
const DIPLODOCUS_HEAD_TURN = 0.4;
// The tail: nine pieces along -z, thinner one after another down to a whip; each turns down (less than 0)
// or up a little from the one before.
const DIPLODOCUS_TAIL_BASE = [0, 66, -25];
const DIPLODOCUS_TAIL = [[20, 20, 15, -0.12], [17, 16, 14, 0.02], [15, 13.5, 13, 0.02], [12, 11, 12, 0.02], [10, 9, 11, 0.02], [8, 7, 11, 0.02], [6, 5, 10, 0.02], [4, 3.5, 9, 0.01], [2.5, 2.5, 9, 0]];
// How much of each piece overlaps the next, so that the joints never open when they swing.
const DIPLODOCUS_JOINT = 1.5;

// Where its mouth is, in blocks from its feet in the middle (x across, y up, z forward), worked out once
// along the neck as it stands: where it looks for leaves.
const DIPLODOCUS_MOUTH = (function () {
    let [y, z] = [DIPLODOCUS_NECK_BASE[1], DIPLODOCUS_NECK_BASE[2]];
    let pitch = 0;
    DIPLODOCUS_NECK.forEach(([, , length, turn]) => {
        pitch += turn;
        y -= Math.sin(pitch) * (length - DIPLODOCUS_JOINT);
        z += Math.cos(pitch) * (length - DIPLODOCUS_JOINT);
    });
    pitch += DIPLODOCUS_HEAD_TURN;
    return { y: (y - Math.sin(pitch) * 12) / 16, z: (z + Math.cos(pitch) * 12) / 16 };
})();

const DIPLODOCUS = {
    lookEvery: 1.2, // seconds between two looks for leaves at the height of its head
    browseMin: 4, // seconds it eats once it found them...
    browseMax: 8, // ...at most
    hearFrom: 20, // blocks: the player hears it chew from this near
    chewEvery: 0.5,
    reach: 0.5 // how far it turns its neck towards the leaves (radians, either side)
};

const DIPLODOCUS_TEXT = {
    browse: { ES: 'El diplodocus come hojas de las copas de los árboles', EN: 'The diplodocus is eating leaves from the treetops' }
};

// Its skin: grey-green, darker along the back, with faint bands across the flanks and a pale belly.
function diplodocusHide(hide, dark, band, belly) {
    return { color: hide, noise: 0.07, all: (p, face) => {
        if (face === 'bottom') { p.fill(belly, 0.05); return; }
        if (face === 'top') {
            p.fill(dark, 0.07);
            // The row of soft spines down the middle of its back.
            for (let y = 0.5; y < p.h; y += 3) p.rect(p.w / 2 - 1, y, 2, 1.5, 0x3f3c2a, 0.04);
            return;
        }
        if (face === 'left' || face === 'right') {
            p.rect(0, 0, p.w, Math.min(3, p.h / 3), dark, 0.06);
            for (let x = 1; x < p.w; x += 5) p.rect(x, 2, 1.5, p.h * 0.55, band, 0.06);
            p.rect(0, p.h - Math.min(4, p.h / 3), p.w, Math.min(4, p.h / 3), belly, 0.05);
            return;
        }
        p.rect(0, 0, p.w, Math.min(3, p.h / 3), dark, 0.06);
        p.rect(0, p.h - Math.min(4, p.h / 3), p.w, Math.min(4, p.h / 3), belly, 0.05);
    } };
}

// Faces +z. A deep body higher at the hips than at the shoulders, on four pillars (the hind ones longer and
// thicker), the long neck rising from the shoulders and the tail behind, both swayed by the shared
// animation: the neck as its head, the tail piece by piece.
function diplodocusModel(b) {
    const hide = 0x87835f;
    const dark = 0x5c5a3f;
    const band = 0x726e4f;
    const belly = 0xc9bf98;
    const nail = 0x37332a;
    const skin = diplodocusHide(hide, dark, band, belly);

    b.part('body', { pivot: [0, 0, 0], from: DIPLODOCUS_TRUNK.from, size: DIPLODOCUS_TRUNK.size, paint: skin });
    b.part('hips', { parent: 'body', pivot: [0, 0, 0], from: DIPLODOCUS_HIPS.from, size: DIPLODOCUS_HIPS.size, paint: skin });
    b.part('shoulders', { parent: 'body', pivot: [0, 0, 0], from: [-15, 73.5, 2], size: [30, 3, 22], paint: skin });
    b.part('chest', { parent: 'body', pivot: [0, 0, 0], from: [-14, 35, 6], size: [28, 3, 18], paint: skin });

    DIPLODOCUS_NECK.forEach(([w, h, length, turn], i) => {
        b.part(`neck${i}`, {
            parent: i === 0 ? 'body' : `neck${i - 1}`,
            pivot: i === 0 ? DIPLODOCUS_NECK_BASE : [0, 0, DIPLODOCUS_NECK[i - 1][2] - DIPLODOCUS_JOINT],
            from: [-w / 2, -h / 2, 0], size: [w, h, length], rotation: [turn, 0, 0], paint: skin
        });
    });
    const last = DIPLODOCUS_NECK.length - 1;
    // A small long head with its nostrils high up between the eyes, and a row of peg teeth at the front.
    b.part('head', {
        parent: `neck${last}`, pivot: [0, 0, DIPLODOCUS_NECK[last][2] - DIPLODOCUS_JOINT], from: [-4.5, -3, -1], size: [9, 7, 9],
        rotation: [DIPLODOCUS_HEAD_TURN, 0, 0],
        paint: { color: hide, noise: 0.06, all: (p, face) => {
            if (face === 'bottom') { p.fill(belly, 0.05); return; }
            if (face === 'top') { p.fill(dark, 0.06); p.rect(p.w / 2 - 2, p.h - 3, 1.5, 1.5, 0x1c1a12, 0); p.rect(p.w / 2 + 0.5, p.h - 3, 1.5, 1.5, 0x1c1a12, 0); return; }
            if (face !== 'left' && face !== 'right') return;
            // A dark eye with a pale ring, high and far back.
            const eye = face === 'left' ? 1.5 : p.w - 3.5;
            p.rect(eye - 0.5, 1, 3, 2.5, 0xd8cfa8, 0.03);
            p.rect(eye, 1.5, 2, 1.5, 0x15130d, 0);
            p.rect(eye + (face === 'left' ? 1.5 : 0), 1.5, 0.5, 0.5, 0xffffff, 0);
            p.rect(0, p.h - 1.5, p.w, 1.5, belly, 0.04);
        } }
    });
    b.part('snout', {
        parent: 'head', pivot: [0, -3, 8], from: [-3.5, 0, -0.5], size: [7, 4.5, 5],
        paint: { color: hide, noise: 0.05, all: (p, face) => {
            if (face === 'top') { p.fill(dark, 0.05); return; }
            if (face === 'bottom') { p.fill(belly, 0.04); return; }
            if (face === 'front') { for (let x = 0.75; x < p.w - 0.5; x += 1) p.rect(x, p.h - 1.5, 0.5, 1, 0xf2ead2, 0); return; }
            p.rect(0, p.h - 1.25, p.w, 0.5, 0x2c2a1d, 0);
        } }
    });
    b.part('jaw', {
        parent: 'head', pivot: [0, -3, 1], from: [-3.5, -1.5, 0], size: [7, 1.5, 12],
        paint: { color: belly, noise: 0.05, faces: { top: (p) => p.fill(0x8a4a42, 0.04), front: (p) => { for (let x = 0.75; x < p.w - 0.5; x += 1) p.rect(x, 0, 0.5, 0.75, 0xf2ead2, 0); } } }
    });

    DIPLODOCUS_TAIL.forEach(([w, h, length, turn], i) => {
        b.part(`tail${i}`, {
            parent: i === 0 ? 'body' : `tail${i - 1}`,
            pivot: i === 0 ? DIPLODOCUS_TAIL_BASE : [0, 0, -(DIPLODOCUS_TAIL[i - 1][2] - DIPLODOCUS_JOINT)],
            from: [-w / 2, -h / 2, -length], size: [w, h, length], rotation: [turn, 0, 0], paint: skin
        });
    });

    // Pillar legs with wrinkles, broad round feet and blunt nails at the front; the hind ones with a thick
    // thigh at the top.
    const legPaint = { color: hide, noise: 0.07, all: (p, face) => {
        if (face === 'top') return;
        if (face === 'bottom') { p.fill(0x3b3828, 0.04); return; }
        for (let y = 4; y < p.h - 6; y += 6) p.rect(0, y, p.w, 0.5, dark, 0.04);
        p.rect(0, p.h - 4, p.w, 4, dark, 0.05);
        if (face === 'front') for (let x = 0.75; x < p.w - 1; x += 2.5) p.rect(x, p.h - 2, 1.75, 2, nail, 0.03);
    } };
    const leg = (name, row, sign) => {
        const [w, h, d] = row.size;
        b.part(name, { parent: 'body', pivot: [row.x * sign, h, row.z], from: [-w / 2, -h, -d / 2], size: row.size, paint: legPaint });
    };
    leg('legFL', DIPLODOCUS_LEGS.front, 1);
    leg('legFR', DIPLODOCUS_LEGS.front, -1);
    leg('legBL', DIPLODOCUS_LEGS.back, 1);
    leg('legBR', DIPLODOCUS_LEGS.back, -1);
    for (const [name, sign] of [['thighL', 1], ['thighR', -1]]) {
        b.part(name, { parent: `legB${sign > 0 ? 'L' : 'R'}`, pivot: [0, 0, 0], from: [-7, -16, -7.5], size: [14, 16, 15], paint: skin });
    }
    return {
        legs: ['legFL', 'legFR', 'legBL', 'legBR'], head: 'neck0',
        tail: DIPLODOCUS_TAIL.map((row, i) => `tail${i}`)
    };
}

// The boxes of a body that push a player, in blocks, from the parts of the model above.
function diplodocusBoxes() {
    const box = (from, size) => [from[0] / 16, (from[0] + size[0]) / 16, from[1] / 16, (from[1] + size[1]) / 16, from[2] / 16, (from[2] + size[2]) / 16];
    const legs = [];
    for (const row of [DIPLODOCUS_LEGS.front, DIPLODOCUS_LEGS.back]) {
        for (const sign of [1, -1]) legs.push(box([row.x * sign - row.size[0] / 2, 0, row.z - row.size[2] / 2], row.size));
    }
    return [box(DIPLODOCUS_TRUNK.from, [DIPLODOCUS_TRUNK.size[0], DIPLODOCUS_HIPS.from[1] + DIPLODOCUS_HIPS.size[1] - DIPLODOCUS_TRUNK.from[1], DIPLODOCUS_TRUNK.size[2]]), ...legs];
}

registerSpecies('diplodocus', {
    info: { eggColor: 0x87835f, tone: 55, maxHealth: 100, speed: 0.3, mount: { eyeHeight: 6.37, seat: 4.75, speed: 3, autoJump: 7.6, jump: 7.6 }, giant: { front: 2, back: 2.2, half: 1.1, tall: 5, boxes: diplodocusBoxes(), stride: 0.45, swing: 0.5, habit: 'diplodocusBrowse' }, hiddenUntilDiscovered: true },
    model: diplodocusModel,
    surface: 'skin',
    drops: [['leather', 4, 8]],
    // It ate the leaves of trees: leaves tame it.
    diet: { foods: ['leaves', 'jungle_leaves', 'acacia_leaves'], chance: 1 / 3 },
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [] },
    fossil: { source: 'skeleton', rarity: 'legendary', weight: 2 },
    card: {
        name: 'Diplodocus', habitat: 'Plains with forests of conifers in western North America, from 154 to 152 million years ago', activity: 'Day', temperament: 'Passive',
        description: 'One of the longest animals that ever walked on land: about 25 metres from nose to tail, with a small head on a very long neck and a tail like a whip. It ate leaves all day. Tame it with leaves and ride it, high over the ground.'
    },
    cardEs: {
        name: 'Diplodocus', habitat: 'Llanuras con bosques de coníferas del oeste de Norteamérica, desde hace 154 hasta hace 152 millones de años',
        description: 'Uno de los animales más largos que han pisado la tierra: unos 25 metros del hocico a la cola, con una cabeza pequeña en un cuello larguísimo y una cola como un látigo. Comía hojas todo el día. Domestícalo con hojas y móntalo, muy por encima del suelo.'
    }
});

// The giants of this client, made once each (createMob tells 'spawned'): the copy of a mount under another
// player's avatar (js/game/riding.js) is not one of them, as it walks nowhere by itself.
onMobEvent('spawned', function (mob) {
    const info = getMobSpecies(mob.userData.species);
    if (!info || !info.giant) return;
    (this.giantMobs || (this.giantMobs = [])).push(mob);
    mob.userData.giantX = mob.position.x;
    mob.userData.giantY = mob.position.y;
    mob.userData.giantZ = mob.position.z;
});

onMobEvent('removed', function (mob) {
    const list = this.giantMobs;
    const at = list ? list.indexOf(mob) : -1;
    if (at >= 0) list.splice(at, 1);
});

// Every frame, after the mobs moved: an empty list but where a giant is.
registerFrameUpdate(function (delta) {
    this.giantUpdate(delta);
});

Object.assign(Game.prototype, {
    giantUpdate(delta) {
        const list = this.giantMobs;
        if (!list || list.length === 0) return;
        for (let i = 0; i < list.length; i++) {
            const mob = list[i];
            const data = mob.userData;
            if (!mob.parent || data.mountKey) continue;
            const row = getMobSpecies(data.species).giant;
            if (data.rider) {
                if (mob === this.ridingMob) this.giantHoldRider(mob, row);
            } else {
                this.giantHoldBack(mob, row);
                this.giantStep(mob, row, delta);
            }
            if (row.habit && !data.rider) this[row.habit](mob, delta);
            if (!this.ridingMob) this.giantPushPlayer(mob, row);
            data.giantX = mob.position.x;
            data.giantY = mob.position.y;
            data.giantZ = mob.position.z;
        }
    },

    // A step that put its body into something is taken back. One that walks alone turns away, as the walk
    // of js/game/mobs.js does at a wall; one that something walks (the server, its owner's herd) stands, and
    // whoever walks it finds it does not get there and sends it elsewhere (js/game/animals.js, herd.js).
    giantHoldBack(mob, row) {
        const data = mob.userData;
        const dx = mob.position.x - data.giantX;
        const dz = mob.position.z - data.giantZ;
        if (dx === 0 && dz === 0) return;
        const heading = Math.PI / 2 - mob.rotation.y;
        const ahead = dx * Math.cos(heading) + dz * Math.sin(heading) >= 0;
        if (!this.giantWayBlocked(mob.position.x, mob.position.z, data.giantY, heading + (ahead ? 0 : Math.PI), ahead ? row.front : row.back, row)) return;
        mob.position.set(data.giantX, data.giantY, data.giantZ);
        if (!data.chargeRun && data.blockedCooldown <= 0 && !data.tamed && !data.animal) {
            data.direction = heading + Math.PI * (0.5 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1);
            data.moveTimer = 1.5 + Math.random() * 2;
            data.blockedCooldown = 0.6;
        }
    },

    // The same for one that is ridden by this player: the rider stays where the mount's body has room.
    giantHoldRider(mob, row) {
        const data = mob.userData;
        const position = this.cameraController.camera.position;
        const dx = position.x - data.giantX;
        const dz = position.z - data.giantZ;
        if (dx === 0 && dz === 0) return;
        const heading = Math.PI / 2 - mob.rotation.y;
        const ahead = dx * Math.cos(heading) + dz * Math.sin(heading) >= 0;
        if (!this.giantWayBlocked(position.x, position.z, data.giantY, heading + (ahead ? 0 : Math.PI), ahead ? row.front : row.back, row)) return;
        position.x = data.giantX;
        position.z = data.giantZ;
        mob.position.x = data.giantX;
        mob.position.z = data.giantZ;
    },

    // Whether a body standing at (x, z), feet at `feet`, would have a wall, a fence, a roof or a deep drop
    // within `reach` blocks along `heading`, or a wall at either side of its far end. A chunk that is not
    // there is a wall too.
    giantWayBlocked(x, z, feet, heading, reach, row) {
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
        for (let d = 0.5; d < reach + 0.25; d += 0.5) {
            const step = Math.min(d, reach);
            if (this.giantCellBlocked(x + cos * step, z + sin * step, feet, row, true)) return true;
        }
        for (let side = -1; side <= 1; side += 2) {
            if (this.giantCellBlocked(x + cos * reach - sin * row.half * side, z + sin * reach + cos * row.half * side, feet, row, false)) return true;
        }
        return false;
    },

    giantCellBlocked(x, z, feet, row, drops) {
        const controller = this.cameraController;
        const floor = controller.getFloorY(x, z, feet + 1);
        if (floor <= -20 || floor - feet > 1.01 || (drops && feet - floor > 3)) return true;
        const ix = Math.floor(x);
        const iz = Math.floor(z);
        const base = Math.floor(floor + 0.01);
        for (let up = 2; up < row.tall; up++) {
            if (controller.hasBlock(ix, base + up, iz)) return true;
        }
        return false;
    },

    // Its legs: the shared walk swings them at the pace of a pig. A giant's step is longer and slower: less
    // of the swing, and less of the pace on the next frame (the rig reads the phase then).
    giantStep(mob, row, delta) {
        const data = mob.userData;
        if (data.chargeRun) return;
        const legs = data.legs;
        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            const base = leg.userData.baseRotation.x;
            leg.rotation.x = base + (leg.rotation.x - base) * row.swing;
        }
        if (mob.position.x !== data.giantX || mob.position.z !== data.giantZ) data.stepPhase -= delta * 7 * (1 - row.stride);
    },

    // The local player is moved out of its legs and its body (not from under its belly), unless there is no
    // room where they would go.
    giantPushPlayer(mob, row) {
        const controller = this.cameraController;
        const position = controller.camera.position;
        const feet = position.y - controller.eyeHeight;
        const dx = position.x - mob.position.x;
        const dz = position.z - mob.position.z;
        if (dx * dx + dz * dz > 400) return;
        const turn = mob.rotation.y;
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;
        const reach = 0.3;
        let pushX = 0;
        let pushZ = 0;
        for (const box of row.boxes) {
            if (feet + 1.8 <= mob.position.y + box[2] || feet >= mob.position.y + box[3]) continue;
            const left = lx - (box[0] - reach);
            const right = box[1] + reach - lx;
            const back = lz - (box[4] - reach);
            const front = box[5] + reach - lz;
            if (left <= 0 || right <= 0 || back <= 0 || front <= 0) continue;
            const least = Math.min(left, right, back, front);
            if (least === left) pushX = -left;
            else if (least === right) pushX = right;
            else if (least === back) pushZ = -back;
            else pushZ = front;
            break;
        }
        if (pushX === 0 && pushZ === 0) return;
        const x = position.x + pushX * cos + pushZ * sin;
        const z = position.z - pushX * sin + pushZ * cos;
        if (controller.canStandAt(x, z, feet)) {
            position.x = x;
            position.z = z;
        }
    },

    // Its habit: standing with leaves at the height of its head, it reaches up and chews. It takes no block:
    // each player's copy of it eats from the same tree, and nothing has to be said to the server.
    diplodocusBrowse(mob, delta) {
        const data = mob.userData;
        if (data.diplodocusEating > 0) {
            data.diplodocusEating -= delta;
            const jaw = data.modelParts && data.modelParts.jaw;
            if (data.gait > 0.3 || data.diplodocusEating <= 0) {
                data.diplodocusEating = 0;
                if (jaw) jaw.rotation.x = jaw.userData.baseRotation.x;
                return;
            }
            // Neck up and towards the leaves (the rig of js/game/mobs.js turns it there), and the jaw going.
            data.lookTimer = 1;
            data.lookYaw = data.diplodocusTowards;
            data.lookPitch = -0.15;
            if (jaw) jaw.rotation.x = jaw.userData.baseRotation.x + Math.max(0, Math.sin(data.life * 7)) * 0.35;
            data.diplodocusChew -= delta;
            if (data.diplodocusChew <= 0) {
                data.diplodocusChew = DIPLODOCUS.chewEvery;
                this.diplodocusChewSound(mob);
            }
            return;
        }
        data.diplodocusLook = (data.diplodocusLook ?? Math.random() * DIPLODOCUS.lookEvery) - delta;
        if (data.diplodocusLook > 0 || data.gait > 0.2 || data.resting > 0) return;
        data.diplodocusLook = DIPLODOCUS.lookEvery;
        const side = this.diplodocusLeavesSide(mob);
        if (side === null) return;
        data.diplodocusEating = DIPLODOCUS.browseMin + Math.random() * (DIPLODOCUS.browseMax - DIPLODOCUS.browseMin);
        data.diplodocusTowards = side;
        data.diplodocusChew = 0.3;
    },

    // Whether there are leaves around its mouth (the cells about it, at its height and one above), and then
    // to which side of it they are, as an angle its neck can turn to; null where there are none.
    diplodocusLeavesSide(mob) {
        const turn = mob.rotation.y;
        const sin = Math.sin(turn);
        const cos = Math.cos(turn);
        const mouthX = mob.position.x + sin * DIPLODOCUS_MOUTH.z;
        const mouthZ = mob.position.z + cos * DIPLODOCUS_MOUTH.z;
        const mouthY = Math.floor(mob.position.y + DIPLODOCUS_MOUTH.y);
        const controller = this.cameraController;
        for (let up = 0; up <= 1; up++) {
            for (let ox = -1; ox <= 1; ox++) {
                for (let oz = -1; oz <= 1; oz++) {
                    const x = Math.floor(mouthX) + ox;
                    const z = Math.floor(mouthZ) + oz;
                    const type = controller.getBlockType(x, mouthY + up, z);
                    if (!type || !type.endsWith('leaves')) continue;
                    // The angle of that cell from where its head points, both seen from its middle.
                    const towards = Math.atan2(x + 0.5 - mob.position.x, z + 0.5 - mob.position.z) - turn;
                    const side = Math.atan2(Math.sin(towards), Math.cos(towards));
                    return Math.max(-DIPLODOCUS.reach, Math.min(DIPLODOCUS.reach, side));
                }
            }
        }
        return null;
    },

    diplodocusChewSound(mob) {
        const player = this.getLocalPlayerPosition();
        const dx = player.x - mob.position.x;
        const dz = player.z - mob.position.z;
        if (dx * dx + dz * dz > DIPLODOCUS.hearFrom * DIPLODOCUS.hearFrom) return;
        this.playNoiseBurst({ duration: 0.07, volume: 0.02, highpass: 500, lowpass: 2600 });
        if (Math.random() < 0.15) this.playTone({ frequency: 60, endFrequency: 48, duration: 0.6, type: 'sine', volume: 0.025, attack: 0.1, release: 0.3 });
    }
});
