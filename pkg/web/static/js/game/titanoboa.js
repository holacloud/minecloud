// Titanoboa: an extinct animal (js/mobSpecies.js) and an ancient relative of the snake, found as a rare
// fossil in the deep rock and brought back by the revival machine. The biggest snake there has ever been:
// seven blocks of it, as thick as a barrel. It had no venom: it squeezed. It is slow and strong.
//
// It walks, comes for the player and bites as any hostile ground mob (js/game/mobs.js), so the server walks
// a kept one and says whom it is after (js/game/animals.js). The snake's own movement ('slither',
// js/game/snake.js) could not carry it: that one is written for the snake alone (its length, its coil, its
// venom and its rattle are in it by name) and gives no body to an animal the server keeps.
//
// What is its own is its body. The mob is its head: that is what walks, what is turned and what bites.
// Behind it the body is a chain of segments laid along the path the head has taken (a trail of points it
// leaves), as a train follows its engine, with the waves of a snake on top of it. It appears coiled, and
// uncoils as its head moves off. Where its head turns right round and comes back along its own body, the
// body makes way to one side, so that it lies in a hairpin and never folded over itself. Nothing of this is
// asked of the ground movement: titanoboaUpdate runs after the mobs have moved, over the few titanoboas
// there are.

const TITANOBOA = {
    segments: 15,
    spacing: 7 / 16, // blocks between two joints of its body: the length of a segment
    // How wide and how tall each segment is, in model units, from its neck to the tip of its tail. No two
    // neighbours are the same: where they overlap, their faces would otherwise flicker through each other.
    widths: [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 10, 10.5, 9.5, 9, 8, 7, 6, 4.5, 3],
    heights: [4, 5, 5.5, 6.5, 7, 8, 7.5, 8, 7, 6.5, 6, 5, 4.5, 3.5, 2.5],
    step: 0.2, // blocks its head moves before it leaves another point of its trail
    points: 48, // of the trail that are kept: enough for its whole length, and some more
    lost: 3, // blocks its head may move in one frame; further, it was put somewhere else: it coils there
    berth: 0.85, // blocks its body makes way to one side when its head comes back along it...
    own: 1.2, // ...where that body is further back than this along its trail (nearer, it is its own neck)...
    ease: 1, // ...and more of the way the further back it is, up to all of it this much further
    wave: 0.2, // blocks its body swings to each side as it goes...
    waveLength: 2.8, // ...in waves this long...
    waveAfter: 1.2, // ...that begin this far behind its head, and this far into what it has travelled
    low: 0.28, // how high it carries its head, in blocks, and how high when it rears at a player...
    high: 0.85,
    rearAt: 5, // ...who is this near
    lift: [1, 0.69, 0.32, 0.08], // the share of that height its first joints have: the S of its neck
    lunge: 0.45, // blocks its head darts forward when it bites...
    lungeShare: [1, 0.6, 0.25], // ...and the share of that its first joints go with it
    flickEvery: [2, 5], // seconds between two flicks of its tongue; a third of that while it hunts
    flick: 0.5
};
// Where its joints are at rest, in model units from its head (x, y, z, one after another): its neck comes
// down from its head in the plane it looks along, and the rest lies in a ring beside it, belly on the ground.
// The model is built so, and so is the trail of one that has just appeared.
const TITANOBOA_REST = (() => {
    const joints = [0, 13, 0, 0, 9, -5.75, 0, 4.25, -10.75, 0, 1, -17, 0, 0, -24];
    const radius = 15;
    const turn = 2 * Math.asin(7 / (2 * radius));
    for (let i = 1; i <= TITANOBOA.segments - 4; i++) joints.push(radius * Math.cos(i * turn) - radius, 0, -24 - radius * Math.sin(i * turn));
    return new Float32Array(joints);
})();

// Faces +z. The mob is the head (with its lower jaw, hinged, and its tongue): its middle is the back of its
// skull. The body is fifteen segments, each pivoted at its front joint and reaching back to the next; they
// are called `tail...` so that what measures the room a body takes (js/game/herd.js) counts the head alone,
// which is where the mob is. Here they are laid as it rests (TITANOBOA_REST), which is its portrait;
// titanoboaPose puts them where its body is, every frame. Every size is a multiple of half a unit: a face is
// painted in whole texels, two to a unit (js/models.js).
function titanoboaModel(b, variant) {
    const palettes = [
        // Olive with big black ovals, as the anaconda.
        { base: 0x6d7a3c, back: 0x55612c, blotch: 0x1f2414, rim: 0x8b9a52, flank: 0xb7ac5a, belly: 0xd9cd84, bellyLine: 0xb3a560, eye: 0xd8b23a, saddles: false },
        // Brown saddles on tan, as a boa, redder towards the tail.
        { base: 0xb08a5c, back: 0x8f6c44, blotch: 0x4f2f1c, rim: 0xd9bb8a, flank: 0xcfb07c, belly: 0xe6d6ae, bellyLine: 0xc4ad7c, eye: 0xc9902e, saddles: true }
    ];
    const c = palettes[variant % palettes.length];
    const mouth = 0xc4687a;
    const S = 7;
    const segmentPaint = (index) => ({
        color: c.base, noise: 0.07, bevel: 0.1,
        all: (p, face) => {
            if (face === 'bottom') {
                p.fill(c.belly, 0.04);
                for (let y = 0.5; y < p.h; y += 1.5) p.rect(0, y, p.w, 0.5, c.bellyLine, 0.03);
                return;
            }
            if (face === 'front' || face === 'back') return;
            if (face === 'top') {
                p.fill(c.back, 0.07);
                if (c.saddles) {
                    // A saddle across the back, pale at its edges.
                    p.rect(0, 2.5, p.w, 5, c.rim, 0.05);
                    p.rect(0, 3, p.w, 4, c.blotch, 0.06);
                    if (p.w >= 6) p.rect(p.w / 2 - 1, 4, 2, 2, c.rim, 0.05);
                } else if (p.w >= 4) {
                    // Two ovals side by side, one a little ahead of the other.
                    const oval = Math.min(3, Math.floor(p.w - 2.5) / 2);
                    const ahead = index % 2 ? 2 : 5;
                    p.rect(0.5, ahead, oval, 3, c.blotch, 0.05);
                    p.rect(p.w - 0.5 - oval, 7 - ahead, oval, 3, c.blotch, 0.05);
                } else {
                    p.rect(0.5, 3.5, p.w - 1, 3, c.blotch, 0.05);
                }
                return;
            }
            // The flanks: paler below, with a dark spot or two.
            p.rect(0, p.h - Math.max(1, Math.round(p.h * 0.8) / 2), p.w, p.h, c.flank, 0.05);
            if (p.h >= 3.5) {
                p.rect(index % 2 ? 3 : 5.5, p.h - 2.5, 1.5, 1.5, c.blotch, 0.05);
                if (p.h >= 6) p.rect(index % 2 ? 7 : 2, p.h - 3.5, 1, 1, c.blotch, 0.05);
            }
            p.rect(0, p.h - 0.5, p.w, 0.5, c.belly, 0.04);
        }
    });
    // The segments, as they lie at rest: the neck is tipped up towards the head, the ring is turned round.
    const rest = TITANOBOA_REST;
    for (let k = 0; k < TITANOBOA.segments; k++) {
        const w = TITANOBOA.widths[k];
        const h = TITANOBOA.heights[k];
        const dx = rest[k * 3 + 3] - rest[k * 3];
        const dy = rest[k * 3 + 4] - rest[k * 3 + 1];
        const dz = rest[k * 3 + 5] - rest[k * 3 + 2];
        b.part(`tail${k}`, {
            pivot: [rest[k * 3], rest[k * 3 + 1], rest[k * 3 + 2]], from: [-w / 2, 0, -S - 1.5], size: [w, h, S + 3], paint: segmentPaint(k),
            rotation: k < 4 ? [Math.atan2(dy, -dz), 0, 0] : [0, Math.atan2(-dx, -dz), 0]
        });
    }

    // The head: broad and blunt, with the eyes high on its sides, a dark line from each eye to the corner
    // of the mouth and the pits of its lips. No fangs: a boa holds with rows of small hooked teeth.
    const lips = (p) => { p.rect(0, p.h - 1, p.w, 1, c.flank, 0.04); for (let x = 1; x < p.w; x += 1.5) p.rect(x, p.h - 1, 0.5, 0.5, c.blotch, 0.03); };
    b.part('head', {
        pivot: [rest[0], rest[1], rest[2]], from: [-4, 1.5, -2], size: [8, 3.5, 9],
        paint: {
            color: c.base, noise: 0.06, bevel: 0.12,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(mouth, 0.05); return; }
                if (face === 'top') { p.fill(c.back, 0.06); p.rect(p.w / 2 - 0.5, 0, 1, p.h, c.blotch, 0.05); p.rect(p.w / 2 - 1.5, 0, 3, 2.5, c.blotch, 0.05); return; }
                if (face === 'left' || face === 'right') {
                    const back = face === 'left' ? 0 : p.w - 5;
                    p.rect(back, 1, 5, 1, c.blotch, 0.05);
                    lips(p);
                }
            }
        }
    });
    b.part('snout', {
        parent: 'head', pivot: [0, 1.5, 7], from: [-3, 0, 0], size: [6, 3, 3],
        paint: {
            color: c.base, noise: 0.06, bevel: 0.12,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(mouth, 0.05); return; }
                if (face === 'top') { p.fill(c.back, 0.06); p.rect(p.w / 2 - 0.5, 0, 1, p.h - 1, c.blotch, 0.05); return; }
                if (face === 'front') { p.rect(1, 1, 0.5, 0.5, 0x15100c, 0); p.rect(p.w - 1.5, 1, 0.5, 0.5, 0x15100c, 0); }
                if (face !== 'back') lips(p);
            }
        }
    });
    b.part('jaw', {
        parent: 'head', pivot: [0, 1.5, -1.5], from: [-3.5, -1.5, 0], size: [7, 1.5, 11],
        paint: { color: c.belly, noise: 0.04, bevel: 0.1, faces: { top: (p) => { p.fill(mouth, 0.05); p.rect(p.w / 2 - 0.5, 0, 1, p.h, 0x9a4458, 0); } } }
    });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`eye${side}`, {
            parent: 'head', pivot: [4 * sign, 3.5, 4.5], from: [-0.5, -0.5, -1], size: [1, 1.5, 2],
            paint: { color: c.eye, noise: 0.02, bevel: 0.1, all: (p, face) => { if (face === 'left' || face === 'right') p.rect(p.w / 2 - 0.5, 0, 0.5, p.h, 0x0b0805, 0); if (face === 'top') p.fill(c.blotch, 0.04); } }
        });
    });
    b.part('tongue', { parent: 'head', pivot: [0, 1.25, 9.5], from: [-0.5, -0.25, 0], size: [1, 0.5, 3.5], paint: { color: 0xb8243a, noise: 0.03, bevel: 0 } });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`fork${side}`, { parent: 'tongue', pivot: [0.25 * sign, 0, 3.25], from: [-0.25, -0.25, 0], size: [0.5, 0.5, 2], paint: { color: 0x8a1a2c, noise: 0.02, bevel: 0 }, rotation: [0, 0.45 * sign, 0] });
    });
    return { head: 'head' };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('titanoboa', {
    info: { eggColor: 0x6d7a3c, tone: 110, hostile: true, attackDamage: 4, chaseDistance: 10, keepDistance: 1, maxHealth: 28, speed: 0.5, chaseSpeed: 1.3, variants: 2, hiddenUntilDiscovered: true, ancestorOf: 'snake' },
    model: titanoboaModel,
    surface: 'skin',
    drops: [['scale', 2, 4]],
    // No diet: a hunter is not tamed. No bait: one the server walks goes where the server says.
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Titanoboa', habitat: 'Hot swamps of Colombia, about 60 million years ago', activity: 'Day and night', temperament: 'Hostile',
        description: 'The biggest snake there has ever been: 13 metres long in life and 7 blocks here, as thick as a barrel. It had no venom: it squeezed its prey, big fish and maybe crocodiles. It is slow, but do not let it reach you.'
    },
    cardEs: {
        name: 'Titanoboa', habitat: 'Pantanos calurosos de Colombia, hace unos 60 millones de años',
        description: 'La serpiente más grande que ha existido: 13 metros de largo en vida y 7 bloques aquí, gruesa como un barril. No tenía veneno: estrujaba a sus presas, peces grandes y quizá cocodrilos. Es lenta, pero no dejes que te alcance.'
    }
});

// Every titanoboa there is, to lay its body: a list of a few, kept as they appear.
onMobEvent('spawned', function (mob) {
    if (mob.userData.species === 'titanoboa') (this.titanoboaAlive || (this.titanoboaAlive = [])).push(mob);
});

registerFrameUpdate(function (delta) {
    this.titanoboaUpdate(delta);
});

Object.assign(Game.prototype, {
    titanoboaUpdate(delta) {
        const alive = this.titanoboaAlive;
        if (!alive || alive.length === 0) return;
        const player = this.getLocalPlayerPosition();
        for (let i = alive.length - 1; i >= 0; i--) {
            const mob = alive[i];
            if (!mob.parent) {
                alive.splice(i, 1);
                continue;
            }
            if (mob.visible) this.titanoboaPose(mob, delta, player);
        }
    },

    // What is kept of one: the trail its head has left (the newest point first), how far it has gone, where
    // its joints are, and the parts of its model, looked up once for each model it is given.
    titanoboaState(mob) {
        const state = {
            trail: new Float32Array(TITANOBOA.points * 3), count: 0, travelled: 0,
            lastX: mob.position.x, lastZ: mob.position.z,
            joints: new Float32Array((TITANOBOA.segments + 1) * 3),
            raise: TITANOBOA.high, hunting: false, wait: Math.random() * TITANOBOA.flickEvery[1], flick: 0,
            side: 0, root: null, segments: []
        };
        mob.userData.titanoboa = state;
        this.titanoboaCoil(mob, state);
        return state;
    },

    // Its trail as it lies at rest: the ring of TITANOBOA_REST behind its head, on the ground there is.
    titanoboaCoil(mob, state) {
        const position = mob.position;
        const cos = Math.cos(mob.rotation.y);
        const sin = Math.sin(mob.rotation.y);
        const trail = state.trail;
        for (let k = 1; k <= TITANOBOA.segments; k++) {
            const lx = TITANOBOA_REST[k * 3] / 16;
            const lz = TITANOBOA_REST[k * 3 + 2] / 16;
            const x = position.x + lx * cos + lz * sin;
            const z = position.z - lx * sin + lz * cos;
            const floor = this.cameraController.getFloorY(x, z, position.y + 1);
            const at = (k - 1) * 3;
            trail[at] = x;
            trail[at + 1] = Math.abs(floor - position.y) <= 1.1 ? floor : position.y;
            trail[at + 2] = z;
        }
        state.count = TITANOBOA.segments;
        state.travelled = 0;
        state.lastX = position.x;
        state.lastZ = position.z;
    },

    // Its head, at (x, z), is about to leave another point of its trail. Where it is coming back along its
    // own body (a point of the trail that is far back along it and yet near, and runs the same way or the
    // opposite one) that body moves aside, out of a circle of TITANOBOA.berth around the head: always to the
    // side it is already on, or to one side for the whole of it when it lies right under the head. The points
    // stay where they are put, so the body that slides along them lies beside the head's way from then on.
    titanoboaMakeWay(state, x, z) {
        const trail = state.trail;
        const berth = TITANOBOA.berth;
        let dirX = x - trail[0];
        let dirZ = z - trail[2];
        let arc = Math.hypot(dirX, dirZ);
        if (arc < 1e-6) return;
        dirX /= arc;
        dirZ /= arc;
        let moved = false;
        for (let i = 1; i < state.count; i++) {
            const at = i * 3;
            arc += Math.hypot(trail[at] - trail[at - 3], trail[at + 2] - trail[at - 1]);
            if (arc <= TITANOBOA.own) continue;
            const qx = trail[at] - x;
            const qz = trail[at + 2] - z;
            const along = qx * dirX + qz * dirZ;
            if (Math.abs(along) >= berth) continue;
            const across = qz * dirX - qx * dirZ;
            const room = Math.sqrt(berth * berth - along * along);
            if (Math.abs(across) >= room) continue;
            // The way the trail runs there: only a stretch that goes along with the head, or against it.
            const next = Math.min(i + 1, state.count - 1) * 3;
            const runX = trail[next] - trail[at - 3];
            const runZ = trail[next + 2] - trail[at - 1];
            if (Math.abs(runX * dirX + runZ * dirZ) < 0.6 * Math.hypot(runX, runZ)) continue;
            if (state.side === 0) state.side = across >= 0 ? 1 : -1;
            const side = Math.abs(across) > 0.05 ? Math.sign(across) : state.side;
            const share = Math.min(1, (arc - TITANOBOA.own) / TITANOBOA.ease);
            const shift = side * (Math.abs(across) + (room - Math.abs(across)) * share) - across;
            trail[at] -= dirZ * shift;
            trail[at + 2] += dirX * shift;
            moved = true;
        }
        if (!moved) state.side = 0;
    },

    // One frame of its body: its head leaves its trail, its joints are put along it, and each segment is
    // laid from one joint to the next. Nothing is made here: every number goes into arrays it already has.
    titanoboaPose(mob, delta, player) {
        const data = mob.userData;
        const state = data.titanoboa || this.titanoboaState(mob);
        const position = mob.position;
        const parts = data.modelParts || {};
        if (state.root !== data.modelRoot) {
            // A new model (the first, or one rebuilt for another graphics mode): its segments again.
            state.root = data.modelRoot;
            state.segments.length = 0;
            for (let k = 0; k < TITANOBOA.segments; k++) state.segments.push(parts[`tail${k}`] || null);
        }

        // The trail.
        const trail = state.trail;
        const moved = Math.hypot(position.x - state.lastX, position.z - state.lastZ);
        if (moved > TITANOBOA.lost) {
            this.titanoboaCoil(mob, state);
        } else {
            state.travelled += moved;
            state.lastX = position.x;
            state.lastZ = position.z;
            if (Math.hypot(position.x - trail[0], position.z - trail[2]) >= TITANOBOA.step) {
                this.titanoboaMakeWay(state, position.x, position.z);
                trail.copyWithin(3, 0, (TITANOBOA.points - 1) * 3);
                trail[0] = position.x;
                trail[1] = position.y;
                trail[2] = position.z;
                state.count = Math.min(TITANOBOA.points, state.count + 1);
            }
        }

        // What it is doing: after this player and near, it rears and opens its mouth a little.
        const distance = Math.hypot(player.x - position.x, player.z - position.z);
        const hunting = Boolean(data.hostile) && !this.titleScreenOpen && !this.respawnPending && distance < TITANOBOA.rearAt;
        if (hunting && !state.hunting) this.playNoiseBurst({ duration: 0.5, volume: 0.035 * Math.max(0.2, 1 - distance / 12), highpass: 2600, lowpass: 8000 });
        state.hunting = hunting;
        state.raise += ((hunting ? TITANOBOA.high : TITANOBOA.low) - state.raise) * Math.min(1, delta * 3);
        const bite = data.attackPose > 0 ? Math.sin((1 - data.attackPose / 0.4) * Math.PI) : 0;

        // The joints, in the world: one every `spacing` along the trail from the head, lifted near the head
        // and swung to the sides where the body runs over ground the head has travelled.
        const joints = state.joints;
        const spacing = TITANOBOA.spacing;
        let px = position.x;
        let py = position.y;
        let pz = position.z;
        let walked = 0; // along the trail, up to (px, py, pz)
        let next = 0; // the point of the trail after it
        let dirX = -Math.sin(mob.rotation.y); // the way the trail runs there: away from where the head looks
        let dirZ = -Math.cos(mob.rotation.y);
        for (let k = 0; k <= TITANOBOA.segments; k++) {
            const s = k * spacing;
            while (next < state.count) {
                const nx = trail[next * 3];
                const nz = trail[next * 3 + 2];
                const length = Math.hypot(nx - px, nz - pz);
                if (walked + length >= s) break;
                if (length > 1e-6) {
                    dirX = (nx - px) / length;
                    dirZ = (nz - pz) / length;
                }
                walked += length;
                px = nx;
                py = trail[next * 3 + 1];
                pz = nz;
                next++;
            }
            let x;
            let y;
            let z;
            if (next < state.count) {
                const nx = trail[next * 3];
                const nz = trail[next * 3 + 2];
                const length = Math.hypot(nx - px, nz - pz);
                const t = length > 1e-6 ? (s - walked) / length : 0;
                if (length > 1e-6) {
                    dirX = (nx - px) / length;
                    dirZ = (nz - pz) / length;
                }
                x = px + (nx - px) * t;
                y = py + (trail[next * 3 + 1] - py) * t;
                z = pz + (nz - pz) * t;
            } else {
                // Past the end of the trail: straight on.
                x = px + dirX * (s - walked);
                y = py;
                z = pz + dirZ * (s - walked);
            }
            const over = (state.travelled - s) / TITANOBOA.waveAfter;
            const behind = s / TITANOBOA.waveAfter;
            if (over > 0 && behind > 0) {
                const grown = Math.min(1, over) * Math.min(1, behind);
                const swing = TITANOBOA.wave * grown * grown * Math.sin((state.travelled - s) * Math.PI * 2 / TITANOBOA.waveLength);
                x -= dirZ * swing;
                z += dirX * swing;
            }
            if (k < TITANOBOA.lift.length) y += state.raise * TITANOBOA.lift[k];
            if (bite > 0 && k < TITANOBOA.lungeShare.length) {
                // Its neck goes with its head (the head looks along +z of the mob).
                const reach = bite * TITANOBOA.lunge * TITANOBOA.lungeShare[k];
                x += Math.sin(mob.rotation.y) * reach;
                z += Math.cos(mob.rotation.y) * reach;
            }
            joints[k * 3] = x;
            joints[k * 3 + 1] = y;
            joints[k * 3 + 2] = z;
        }

        // Each segment from its joint to the next, in the frame of the mob (which is turned about y only).
        const cos = Math.cos(mob.rotation.y);
        const sin = Math.sin(mob.rotation.y);
        for (let k = 0; k < TITANOBOA.segments; k++) {
            const segment = state.segments[k];
            if (!segment) continue;
            const ax = joints[k * 3] - position.x;
            const ay = joints[k * 3 + 1] - position.y;
            const az = joints[k * 3 + 2] - position.z;
            const dx = joints[k * 3 + 3] - joints[k * 3];
            const dy = joints[k * 3 + 4] - joints[k * 3 + 1];
            const dz = joints[k * 3 + 5] - joints[k * 3 + 2];
            const lx = cos * dx - sin * dz;
            const lz = sin * dx + cos * dz;
            const flat = Math.hypot(lx, lz);
            segment.position.set(cos * ax - sin * az, ay, sin * ax + cos * az);
            segment.rotation.order = 'YXZ';
            segment.rotation.set(Math.atan2(dy, flat), Math.atan2(-lx, -lz), 0);
            segment.scale.z = Math.min(2.6, Math.max(0.6, Math.hypot(flat, dy) / spacing));
        }

        // The head: at the height of its first joint, darting forward as it bites, its jaw open to bite and
        // a little while it rears. (Where it looks is the ground movement's: animateMobRig, js/game/mobs.js.)
        const head = parts.head;
        if (head) head.position.set(0, state.raise, bite * TITANOBOA.lunge);
        if (parts.jaw) parts.jaw.rotation.x = parts.jaw.userData.baseRotation.x + Math.max(bite * 0.45, hunting ? 0.14 : 0);
        if (data.healthBar) data.healthBar.position.set(0, state.raise + 0.8, 0);

        // The tongue: in its mouth most of the time, out for half a second to smell the air.
        const tongue = parts.tongue;
        if (tongue) {
            if (state.flick > 0) {
                state.flick -= delta;
            } else {
                state.wait -= delta * (hunting ? 3 : 1);
                if (state.wait <= 0 && bite === 0) {
                    state.wait = TITANOBOA.flickEvery[0] + Math.random() * (TITANOBOA.flickEvery[1] - TITANOBOA.flickEvery[0]);
                    state.flick = TITANOBOA.flick;
                }
            }
            const out = state.flick > 0 ? Math.sin((1 - state.flick / TITANOBOA.flick) * Math.PI) : 0;
            tongue.visible = out > 0.05;
            tongue.scale.z = Math.max(0.05, out);
            tongue.rotation.x = Math.sin(data.life * 40) * 0.25 * out;
        }
    }
});
