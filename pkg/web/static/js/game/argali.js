// The giant argali: an extinct animal (js/mobSpecies.js) and an ancient relative of the sheep, found as a
// rare fossil in the deep rock and brought back by the revival machine. The argali is the biggest wild
// sheep there is, a giant among sheep, and still lives in the mountains of Central Asia; this one is the
// argali of the Ice Age, as big as the biggest of today, which lived as far west as Portugal and is gone
// from Europe. Long legs, a sandy coat with a white rump and a white ruff, and two horns that curl once
// around. It grazes and walks as any ground mob (js/game/mobs.js), so the server walks a kept one
// (js/game/animals.js). What is its own is what a ram does when struck: it turns on whoever hit it,
// lowers its horns, stamps and rams. Only the player who struck it sees the ram: mobs fight in each
// browser.

// The ram, in seconds and blocks: how long it stamps (time to step aside), how long and how fast it then
// runs, how near its middle the player has to be for the horns to reach, what they take and how hard they
// throw (more than they hurt: horns like these are for pushing), and how long it stands afterwards. It
// never runs further from its home than `leash`: the server keeps one inside a circle, and every other
// player's copy of it is still there.
const ARGALI = { aim: 0.8, run: 0.6, pace: 7, reach: 1.6, tall: 1.6, damage: 2, shove: 10, lift: 5, rest: 1.2, leash: 12 };

// The curl of a horn: five pieces, each starting where the one before ends and turned a little more than
// it: back from the forehead, down behind the ear and forward under it, opening outwards all the way.
// Each row: width, length, how much it turns back and how much it opens outwards (radians).
const ARGALI_CURL = [[2.25, 3.5, -1.2, 0.6], [2, 3.5, -1, 0.3], [1.75, 3.25, -1.05, 0.25], [1.5, 2.75, -1.05, 0.25], [1, 2.25, -0.9, 0.2]];

// Where each piece of the horn of one side (1 the left, -1 the right) starts, from the middle of the head,
// and how it is turned there. Every piece hangs from the head by itself, at a place and a turn worked out
// here, once: pieces hanging from one another would be read as a tower by what measures a model without
// turning its parts (its height for the health bar, js/models.js; its body, js/game/herd.js).
function argaliHorn(sign) {
    const times = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
    let turn = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    let at = [1.3 * sign, 2, -0.5];
    return ARGALI_CURL.map(([width, length, back, out]) => {
        const cx = Math.cos(back);
        const sx = Math.sin(back);
        const cz = Math.cos(-out * sign);
        const sz = Math.sin(-out * sign);
        // Its own turn (about x, after leaning about z) on top of those of the pieces before it; then the
        // three angles of the whole, as a part says them (an Euler XYZ of THREE).
        turn = times(turn, [[cz, -sz, 0], [cx * sz, cx * cz, -sx], [sx * sz, sx * cz, cx]]);
        const piece = { width, length, pivot: at, rotation: [Math.atan2(-turn[1][2], turn[2][2]), Math.asin(Math.max(-1, Math.min(1, turn[0][2]))), Math.atan2(-turn[0][1], turn[0][0])] };
        // The next one starts at the end of this one: `length` along its own y.
        at = at.map((value, axis) => value + turn[axis][1] * length);
        return piece;
    });
}
const ARGALI_HORNS = { L: argaliHorn(1), R: argaliHorn(-1) };

// Faces +z. The sheep of js/models.js with its wool taken off and everything else made bigger: legs as
// long as a goat's, a neck that carries the head high (it is what the rig swings, to graze and to look
// about, and the horns go with it), and the horns: five pieces each, turning back, down and forward again.
function argaliModel(b) {
    const coat = 0xa58258;
    const dark = 0x7a5c3c;
    const white = 0xe9e2d0;
    const hoof = 0x2a231d;
    const horn = 0x9a8763;
    const ridge = 0x6c5c40;
    const coatPaint = { color: coat, noise: 0.08, all: (p, face) => {
        if (face === 'bottom') { p.fill(white, 0.05); return; }
        if (face === 'top') { p.rect(p.w / 2 - 1.5, 0, 3, p.h, dark, 0.08); return; }
        // The white patch of its rump, which the others follow when one runs.
        if (face === 'back') { p.rect(0.5, 0.5, p.w - 1, p.h - 0.5, white, 0.05); return; }
        p.rect(0, p.h - 1.5, p.w, 1.5, white, 0.06);
        if (face === 'left') p.rect(0, 1, 1.5, p.h - 1, white, 0.05);
        if (face === 'right') p.rect(p.w - 1.5, 1, 1.5, p.h - 1, white, 0.05);
    } };
    b.part('body', { pivot: [0, 0, 0], from: [-4, 8, -7.5], size: [8, 7, 15], paint: coatPaint });
    b.part('withers', { parent: 'body', pivot: [0, 15, 4], from: [-3, 0, -2.5], size: [6, 0.75, 5], paint: { color: dark, noise: 0.08 } });

    b.part('neck', {
        parent: 'body', pivot: [0, 13.5, 6.5], from: [-2, -1.5, -2], size: [4, 6.5, 4], rotation: [0.65, 0, 0],
        paint: { color: coat, noise: 0.08, faces: { back: (p) => p.rect(p.w / 2 - 1, 0, 2, p.h, dark, 0.08) } }
    });
    // The ruff of a ram in its winter coat: white, down the front of the neck.
    b.part('ruff', { parent: 'neck', pivot: [0, 0, 2], from: [-2.5, -2.5, -0.75], size: [5, 6.5, 1.75], paint: { color: white, noise: 0.09, surface: 'wool' } });
    b.part('head', {
        parent: 'neck', pivot: [0, 4.75, 0.25], from: [-2.25, -2, -1.75], size: [4.5, 4.25, 7], rotation: [-0.3, 0, 0],
        paint: {
            color: coat, noise: 0.06,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(white, 0.05); return; }
                if (face === 'top') { p.rect(1, 0, 2.5, 2, white, 0.05); return; }
                if (face === 'front') {
                    p.fill(white, 0.05);
                    p.rect(0.75, 2.5, 1, 0.5, 0x3a302a, 0);
                    p.rect(2.75, 2.5, 1, 0.5, 0x3a302a, 0);
                    return;
                }
                if (face !== 'left' && face !== 'right') return;
                // A white muzzle, and the eye of a sheep: amber, with its pupil lying flat.
                const muzzle = face === 'left' ? p.w - 2.5 : 0;
                p.rect(muzzle, 1, 2.5, p.h - 1, white, 0.05);
                const eye = face === 'left' ? 2.5 : p.w - 3.5;
                p.rect(eye, 1, 1, 1, 0xc9a23a, 0);
                p.rect(eye, 1.5, 1, 0.5, 0x0d0b0a, 0);
            }
        }
    });
    const earPaint = { color: coat, noise: 0.06, faces: { front: (p) => p.fill(white, 0.05) } };
    b.part('earL', { parent: 'head', pivot: [2.25, 0.25, -0.75], from: [0, -0.5, -0.5], size: [1.75, 1, 1], paint: earPaint, rotation: [0, 0, -0.3] });
    b.part('earR', { parent: 'head', pivot: [-2.25, 0.25, -0.75], from: [-1.75, -0.5, -0.5], size: [1.75, 1, 1], paint: earPaint, rotation: [0, 0, 0.3] });

    // The horns (ARGALI_HORNS). The rings are the years: a ram's horns never stop growing.
    const hornPaint = { color: horn, noise: 0.05, surface: 'smooth', all: (p, face) => {
        if (face === 'top' || face === 'bottom') return;
        for (let y = 0.5; y < p.h; y += 1) p.rect(0, y, p.w, 0.5, ridge, 0.04);
    } };
    for (const side of ['L', 'R']) {
        ARGALI_HORNS[side].forEach(({ width, length, pivot, rotation }, index) => {
            b.part(`horn${side}${index}`, { parent: 'head', pivot, from: [-width / 2, -0.25, -width / 2], size: [width, length + 0.25, width], paint: hornPaint, rotation });
        });
    }

    b.part('tail', { parent: 'body', pivot: [0, 14.5, -7.5], from: [-0.75, -2.5, -0.5], size: [1.5, 2.5, 1], paint: { color: dark, noise: 0.07 }, rotation: [0.25, 0, 0] });
    const legs = VoxelModels.quadLegs(b, {
        size: [2.5, 8, 2.5], hipY: 8, x: 2.6, zFront: 5, zBack: -5.5,
        paint: { color: white, noise: 0.06, all: (p, face) => {
            if (face === 'bottom') { p.fill(hoof, 0.03); return; }
            if (face === 'top') return;
            p.rect(0, 0, p.w, 2.5, coat, 0.08);
            if (face === 'front') p.rect(p.w / 2 - 0.5, 2.5, 1, p.h - 3.5, dark, 0.07);
            p.rect(0, p.h - 1, p.w, 1, hoof, 0.03);
        } }
    });
    return { legs, head: 'neck', tail: ['tail'] };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('argali', {
    info: { eggColor: 0xa58258, tone: 210, maxHealth: 20, speed: 0.45, grazer: true, hiddenUntilDiscovered: true, ancestorOf: 'sheep' },
    model: argaliModel,
    surface: 'fur',
    drops: [['leather', 1, 2], ['fur', 1, 2]],
    furry: true,
    trap: { baits: [] },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Giant argali', habitat: 'Hills and steppes of Europe in the Ice Age, about 450,000 years ago', activity: 'Day', temperament: 'Neutral',
        description: 'The biggest of the wild sheep: as tall as a pony, with 2 horns that curl once around. It grazes and minds its own business, but if you hit it, it lowers its horns and rams.'
    },
    cardEs: {
        name: 'Argali gigante', habitat: 'Colinas y estepas de Europa en la Edad de Hielo, hace unos 450 000 años',
        description: 'La más grande de las ovejas salvajes: tan alta como un poni, con 2 cuernos que dan una vuelta entera. Pasta y va a lo suyo, pero si le pegas, agacha los cuernos y embiste.'
    }
});

// A blow that did not finish it: it turns on the player.
onMobEvent('damaged', function (mob) {
    if (mob.userData.species === 'argali') this.argaliProvoke(mob);
});

// While it is at it, where it goes is its own business: asked before the server's walk and every other goal.
registerMobGoalFirst(function (mob) {
    return mob.userData.argaliRam ? this.argaliGoal(mob) : null;
});

// Only the ones that are ramming: an empty list, nearly always.
registerFrameUpdate(function (delta) {
    this.argaliUpdate(delta);
});

Object.assign(Game.prototype, {
    argaliProvoke(mob) {
        const data = mob.userData;
        if (data.health <= 0 || data.argaliRam) return;
        data.argaliRam = { phase: 'aim', timer: ARGALI.aim, heading: 0, goal: new THREE.Vector3() };
        (this.argaliAngry || (this.argaliAngry = [])).push(mob);
        // A deep bleat, as a warning.
        const tone = getMobSpecies('argali').tone;
        this.playTone({ frequency: tone, endFrequency: tone * 0.8, duration: 0.4, type: 'sawtooth', volume: 0.02, attack: 0.03, release: 0.15, vibrato: 9 });
    },

    // Where it "goes" while it is angry: nowhere. The goal is a point it has always reached (the ground mobs
    // of js/game/mobs.js stand still within stopDistance and face their goal): the player while it stamps,
    // and straight ahead once it runs, since argaliUpdate is what moves it then.
    argaliGoal(mob) {
        const ram = mob.userData.argaliRam;
        const goal = ram.goal;
        if (ram.phase === 'aim') {
            const player = this.getLocalPlayerPosition();
            goal.set(player.x, mob.position.y, player.z);
        } else {
            goal.set(mob.position.x + Math.cos(ram.heading) * 4, mob.position.y, mob.position.z + Math.sin(ram.heading) * 4);
        }
        goal.stopDistance = Infinity;
        return goal;
    },

    argaliUpdate(delta) {
        const angry = this.argaliAngry;
        if (!angry || angry.length === 0) return;
        for (let i = angry.length - 1; i >= 0; i--) {
            const mob = angry[i];
            if (mob.parent && this.argaliRamming(mob, delta)) continue;
            mob.userData.argaliRam = null;
            angry.splice(i, 1);
        }
    },

    // One frame of its anger: it stamps, runs and stands. Returns whether it is still at it.
    argaliRamming(mob, delta) {
        const data = mob.userData;
        const ram = data.argaliRam;
        if (!ram || this.titleScreenOpen || this.respawnPending) return false;
        const player = this.getLocalPlayerPosition();
        const dx = player.x - mob.position.x;
        const dz = player.z - mob.position.z;
        ram.timer -= delta;
        if (ram.phase === 'rest') return ram.timer > 0;

        // Neck down, horns first: the rig (animateMobRig) is told, and hurried.
        data.lookTimer = 0.2;
        data.lookYaw = 0;
        data.lookPitch = 0.7;
        if (data.head) data.head.rotation.x += (data.head.userData.baseRotation.x + 0.7 - data.head.rotation.x) * Math.min(1, delta * 10);
        if (ram.phase === 'aim') {
            // It stamps with a front leg.
            const leg = data.legs[0];
            if (leg) leg.rotation.x = leg.userData.baseRotation.x - Math.abs(Math.sin(ram.timer * 14)) * 0.7;
            if (ram.timer <= 0) {
                ram.phase = 'run';
                ram.timer = ARGALI.run;
                // Straight at where the player is now: whoever steps aside in time is missed.
                ram.heading = Math.atan2(dz, dx);
            }
            return true;
        }

        // Running: its legs go (the rig reads the gait and the step on the next frame).
        data.gait = 1;
        data.stepPhase += delta * 26;
        const moved = this.argaliStep(mob, ram.heading, ARGALI.pace * delta);
        const feetGap = Math.abs(player.y - (this.cameraController.eyeHeight || 1.62) - mob.position.y);
        if (Math.hypot(dx, dz) <= ARGALI.reach && feetGap <= ARGALI.tall) {
            this.cameraController.applyKnockback(Math.cos(ram.heading), Math.sin(ram.heading), ARGALI.shove, ARGALI.lift);
            this.applyDamage(ARGALI.damage, 'You were rammed by a giant argali', 'mob', mob.position);
            // Horn on bone: a crack, and a thud.
            this.playNoiseBurst({ duration: 0.07, volume: 0.06, highpass: 300, lowpass: 2400 });
            this.playTone({ frequency: 110, endFrequency: 60, duration: 0.14, type: 'square', volume: 0.03, release: 0.08 });
        } else if (moved && ram.timer > 0) {
            return true;
        }
        ram.phase = 'rest';
        ram.timer = ARGALI.rest;
        data.lookPitch = 0;
        return true;
    },

    // One step of the ram along `heading`: up one block at most, never off a drop, through a fence or out
    // of the reach of its home. Returns whether it took it.
    argaliStep(mob, heading, distance) {
        const position = mob.position;
        const home = mob.userData.home;
        const x = position.x + Math.cos(heading) * distance;
        const z = position.z + Math.sin(heading) * distance;
        const away = Math.hypot(x - home.x, z - home.z);
        if (away > ARGALI.leash && away > Math.hypot(position.x - home.x, position.z - home.z)) return false;
        const controller = this.cameraController;
        const floor = controller.getFloorY(x, z, position.y + 1);
        // A whisker ahead has to be walkable too: a fence is thinner than a step (as in js/game/mobs.js).
        const ahead = controller.getFloorY(x + Math.cos(heading) * 0.5, z + Math.sin(heading) * 0.5, position.y + 1);
        if (floor <= -20 || floor - position.y > 1.01 || position.y - floor > 1.5 || ahead - position.y > 1.01) return false;
        position.set(x, floor, z);
        return true;
    }
});
