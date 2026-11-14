// Gliders: how the big flyers of the past fly. One movement, 'glide' (js/extensions.js), for all of them; a
// species is a small file on top of it (js/game/haast_eagle.js, argentavis.js, pterosaur.js) that says its
// model and, in its `info`, how high and how far it flies.
//
// What the movement does, for every species:
// - It lives in the air over its home (`userData.home`, where it appeared): it glides round a circle at a
//   height of its own over the ground around that home, with its wings held out, beats them a few times
//   now and then, and moves to another circle every so often. It leans into its turns, and it turns by
//   the size of its wings: a big one needs a wide circle. No step ever takes it further from its home
//   than its range, and its circles keep a turn's width short of that.
// - It comes down to perch: on the highest place it sees under it near its home, or on the ground. Down
//   it glides to it, drops on to it beating its wings, folds them and sits there for a while, looking
//   about. Then it rises straight up, spreads its wings and goes back to its circles.
// - It never flies into anything. Its body is a row of points from one wingtip to the other, measured
//   once from its model (glidersBody). A step, a turn or a rise is taken only if its middle stays in the
//   air and no more of the other points end up in a block than there were (water counts as one). A few
//   times a second it looks along the way it is going, for its middle and for both wingtips, and at the
//   ground under it and ahead: it climbs over what is low, turns away from what is high, and keeps a few
//   blocks over the ground.
// - With a roof over it, it does not fly. On the ground it looks all the way up to where it would fly:
//   with anything there it flutters to the nearest place under the open sky, if it sees one within a few
//   blocks, and waits where it is if it sees none. In the air, something a few blocks over its back for
//   some seconds on end (the edge of a tree is flown out from under) brings it down, gently, to the
//   ground under it.
// - Struck (through damageMobByPlayer and defeatMobByPlayer, js/game/mobs.js), it takes off at once and
//   stays up for a while.
// - A hostile one dives at a player who walks under it, near its home: it cries first (and the chat says
//   so), then comes down at them once, strikes with its talons if they are still there, and climbs away
//   for a good while. It dives at where they are, not at where they will be: whoever steps aside is
//   missed, and whoever has a roof over them, when it cries or when it is about to dive, is left alone.
//   That dive is this browser's own: each client flies its own copy of the animal, and each copy dives
//   at the player of its own client only.
// - /mob and its egg put it on the ground, perched; a moment later it takes off.
//
// A revived one is made by the server with nothing to walk it (js/game/animals.js): its home is the same
// for every player, and that home and the blocks around it are all that two players' views agree on.
//
// What a species says in its `info`, besides `movement: 'glide'` and the fields every species has (`speed`
// is what it glides at; `hostile` and `attackDamage` make it dive at players, from `chaseDistance` blocks
// away and at `chaseSpeed`):
//   glideHeight  blocks over the ground around its home that it circles at (8)
//   glideRange   blocks from its home that it never flies beyond (12)
//   glideAloft   [min, max] seconds on the wing between two perches ([40, 80])
//   glidePerch   [min, max] seconds it sits on a perch ([10, 25])
//   glideBeat    [min, max] seconds of gliding between two bursts of wingbeats ([5, 11])
//
// What its model gives: it is built as it flies, with its wings spread flat along x from its shoulders,
// standing on y = 0 and facing +z, as every mob's, with its legs under its middle (it sits tipped up, and
// turns about its feet to do so). The rig's `wings` are the two inner wings, left first; parts named
// `wingTipL` and `wingTipR` are their outer halves, which fold back over them on the ground, and
// `fingerL0`, `fingerL1`... the feathers at their ends, which spread in the air. `legs` trail behind it in
// flight and come forward to strike, `tail` steers, `head` looks into the turn and about, and a part
// named `neck` is drawn up when it sits. Its wingspan is read from the model: nothing says it twice.
//
// Cheap on purpose: the blocks around are looked at a few times a second (GLIDE.sense), a step looks at a
// block only when one of the points of its body crosses into another cell, and nothing is made per frame.
// Mixed into Game.prototype; `this` is the Game instance.

const GLIDE = {
    // Seconds between two looks at the blocks around it, for a small one; a tenth more for each block of
    // its wingspan. In between it only flies.
    sense: 0.24,
    // What a species gets when its `info` does not say (see the header).
    height: 8, range: 12, aloft: [40, 80], perch: [10, 25], beat: [5, 11],
    turn: 2.6, // radians a second a body with no wings turns; with wings W blocks from tip to tip, turn / (1 + W / 2)
    circle: [1.4, 2], // its circles, in times the tightest one it can fly
    circleFor: [18, 34], // seconds on one circle
    circleTries: 6, // circles tried for one with nothing standing in it
    margin: 1.5, // blocks short of the edge of its range where it turns back
    climb: 2.2, // blocks a second it rises, beating its wings
    sink: 1.2, // what it loses gliding down to a lower circle
    stoop: 3, // or down to a perch
    settle: 1.8, // the most it comes down at, straight down on to the ground
    liftoff: 2, // blocks it rises straight up before it spreads its wings
    roof: 5, // cells over its back that have to be empty: anything in them is a roof
    roofFor: 4, // seconds under one, in the air, before it comes down: the edge of a tree is flown out from under
    roofGrace: 6, // seconds it flies on under one when there is nowhere to come down (water)
    clear: 2.5, // blocks it keeps over the ground under it and ahead of it
    over: 3, // what reaches up to this much over its back is flown over; anything higher, round
    scan: 20, // blocks over it that the ground around its home is looked for from
    probeStep: 0.9, // blocks between two cells looked at ahead: under 1, so that no wall is skipped
    berth: 0.4, // blocks beyond its wingtips that it likes to keep clear
    feet: 0.05,
    sideFor: 1.4, // seconds it keeps to the side it chose to turn to
    avoidFor: 0.8, // seconds it keeps turning away after a look that found the way closed
    stuck: 1.5, // seconds of steps refused before it rises out of where it is
    // Coming down to a perch: how far over it the glide ends, how much height it loses for each block it
    // nears, the slowest it flies, from how near it flutters and turns on the spot, and how near is there.
    approachOver: 1.2, slope: 0.9, slow: 0.9, near: 4, touch: 0.25, approachFor: 40,
    perchTries: 10,
    // Fluttering out from under a roof: places tried, how far it looks, and how fast it goes.
    hopTries: 8, hopReach: 4, hopSpeed: 2,
    fright: 20, // seconds a struck one stays in the air
    // A hostile one: from how many blocks it sees a player when its species does not say, the seconds
    // between its cry and its dive, its dive in times its speed, how near its aim stops following the
    // player, how far its talons reach, the longest a dive lasts, and the seconds between two dives.
    sight: 10, warn: 1.6, dive: 2.5, commit: 3.5, talons: 1.1, swoopFor: 4, swoopEvery: [25, 40], lineEvery: 2,
    warnEvery: 60, // seconds between two lines of the chat about it
    hear: 40, // blocks its cry carries
    // How it looks: how its body is tipped when it sits, how its wings fold (back along its body, their
    // plane upright and their feathers closed to so much less of their width, the outer half over the
    // inner), how they are held and beaten, and its legs.
    stance: -0.45, foldBack: 1.45, foldUp: 1.5, narrow: 0.35, tuck: 2.95, dihedral: 0.14, stroke: 0.7, sweep: 0.7, legsBack: 1.2, legsStrike: 0.9
};

const GLIDE_TEXT = {
    spawned: { ES: (name) => `${name}: ya está aquí, y pronto echará a volar`, EN: (name) => `${name}: here it is, and it will soon take off` },
    noGround: { ES: (name) => `${name}: no hay suelo donde ponerlo`, EN: (name) => `${name}: there is no ground to put it on` },
    defeated: { ES: (name) => `${name}: lo has derrotado`, EN: (name) => `${name}: you defeated it` },
    warning: {
        ES: (name) => `${name}: chilla y se lanza a por ti. ¡Apártate o ponte bajo techo!`,
        EN: (name) => `${name}: it screeches and dives at you. Step aside, or get under a roof!`
    },
    talons: { ES: (name) => `${name}: te ha golpeado con las garras`, EN: (name) => `${name}: its talons struck you` }
};

// The body of a species as its movement needs it, read once from the parts of its model (js/models.js), as
// it is built: how far its wings reach to each side of its middle, how tall it is and how far behind its
// shoulder a wing goes (`trail`), in blocks, and the points that have to stay in the air, as distances
// across its heading with its middle first and then one to each side, never a block apart. A species
// with no model gets a small body.
const GLIDE_BODIES = new Map();
function glidersBody(species) {
    let body = GLIDE_BODIES.get(species);
    if (body) return body;
    let half = 0.5;
    let height = 0.5;
    let trail = 0;
    try {
        const build = VoxelModels.mobBuilders[species];
        if (build) {
            const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'feather' });
            build.call(VoxelModels, b, 0);
            let aside = 0;
            let top = 0;
            for (const part of b.parts) {
                let x = part.pivot[0];
                let y = part.pivot[1];
                for (let parent = part.parent && b.byName.get(part.parent); parent; parent = parent.parent && b.byName.get(parent.parent)) {
                    x += parent.pivot[0];
                    y += parent.pivot[1];
                }
                aside = Math.max(aside, Math.abs(x + part.from[0]), Math.abs(x + part.from[0] + part.size[0]));
                top = Math.max(top, y + part.from[1] + part.size[1]);
                if (part.name === 'wingL') trail = Math.max(0, -part.from[2]) / 16;
            }
            if (aside > 0 && top > 0) {
                half = aside / 16;
                height = top / 16;
            }
        }
    } catch (error) {
        // A model that cannot be read this way: the small body will do.
    }
    // The tips are left a little inside: the last texel of a feather is no reason to stop.
    const reach = half * 0.92;
    const pairs = Math.max(1, Math.ceil(reach));
    const across = new Float32Array(pairs * 2 + 1);
    for (let i = 1; i <= pairs; i++) {
        across[i * 2 - 1] = (reach * i) / pairs;
        across[i * 2] = (-reach * i) / pairs;
    }
    body = { half, span: half * 2, height, trail, across };
    GLIDE_BODIES.set(species, body);
    return body;
}

// Where a look ahead was closed (glidersProbe), and whether the ground a look down found is water (glidersGround).
const GLIDE_PROBE = { x: 0, z: 0 };
const GLIDE_GROUND = { wet: false };
// The cells of a body that is being tried, before it is taken (glidersFits): they grow to the widest body.
let glideTryCells = new Int32Array(16);
let glideTryBad = new Uint8Array(8);

// An angle brought back between -pi and pi.
function glideAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function glideClamp(value, low, high) {
    return value < low ? low : value > high ? high : value;
}

// A number between the two of a pair.
function glideBetween(pair) {
    return pair[0] + Math.random() * (pair[1] - pair[0]);
}

// Whether it flies with its wings spread in this mode (glidersMode): then its wings are part of its body.
function glideSpread(mode) {
    return mode === 'soar' || mode === 'approach' || mode === 'warn';
}

registerMobBehaviour('glide', {
    // Not a body on the ground: the herd neither goes round it nor pushes it (js/game/herd.js).
    bodiless: true,
    update(mob, delta, player) { this.glidersUpdate(mob, delta, player); },
    interact(mob) { this.glidersStruck(mob); },
    spawnCommand(species, x, z, player) { return this.glidersSpawnCommand(species, x, z, player); },
    spawnEgg(species, position) { return this.glidersSpawnEgg(species, position); },
    // An animal the server keeps (js/game/animals.js): `position` is the ground where the machine that
    // revived it left it. It sits there for a moment, and takes off.
    spawnKept(species, position, options) {
        return this.glidersSpawn(species, position.x, position.y, position.z, options);
    }
});

Object.assign(Game.prototype, {
    // The name of a species in the language of the game, for a line of the chat.
    glidersName(species) {
        const card = typeof bestiaryMobText === 'function' ? bestiaryMobText(species) : null;
        return (card && card.name) || species.replace(/_/g, ' ');
    },

    glidersSay(key, species) {
        this.receiveSystemMessage({ text: gameText(GLIDE_TEXT[key])(this.glidersName(species)) });
    },

    // ---- The air, the ground and the sky --------------------------------------------------

    // Whether a cell is air to fly through: no block of any shape, and no water.
    glidersFree(bx, by, bz) {
        const registry = this.world.registry;
        const id = this.world.getBlockId(bx, by, bz);
        return registry.solid[id] !== 1 && registry.fluid[id] !== 1;
    },

    // The ground under (x, z) as seen from height y: the top of the first block down from there, or the
    // surface of the water over it (GLIDE_GROUND.wet says which). Under -20 there is none (js/camera.js).
    glidersGround(x, z, y) {
        GLIDE_GROUND.wet = false;
        const floor = this.cameraController.getFloorY(x, z, y);
        if (floor <= -20) return floor;
        const surface = this.findWaterSurface(x, floor + 0.1, z);
        if (surface === null) return floor;
        GLIDE_GROUND.wet = true;
        return surface;
    },

    // The ground right under (x, y, z), if there is any within GLIDE.clear blocks and one more: the top of
    // the first cell down from there that is not air. -Infinity when it is further down: far enough.
    glidersNear(x, y, z) {
        const bx = Math.floor(x);
        const by = Math.floor(y);
        const bz = Math.floor(z);
        for (let i = 0; i <= GLIDE.clear + 1; i++) if (!this.glidersFree(bx, by - i, bz)) return by - i + 1;
        return -Infinity;
    },

    // Whether the cells over the back of a body at (x, y, z) are empty, GLIDE.roof of them and `more`: sky
    // enough to fly under. In the air that is the cells right over it; on the ground, all the way up to
    // where it would fly (`more` is the height it flies at), so that it does not go up to come down again.
    glidersOpenSky(x, y, z, height, more) {
        const bx = Math.floor(x);
        const bz = Math.floor(z);
        const from = Math.floor(y + height - GLIDE.feet) + 1;
        for (let i = 0; i < GLIDE.roof + more; i++) if (!this.glidersFree(bx, from + i, bz)) return false;
        return true;
    },

    // Whether the straight line between two points is all air, one cell every GLIDE.probeStep.
    glidersClearLine(x0, y0, z0, x1, y1, z1) {
        const length = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
        const steps = Math.max(1, Math.ceil(length / GLIDE.probeStep));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            if (!this.glidersFree(Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t), Math.floor(z0 + (z1 - z0) * t))) return false;
        }
        return true;
    },

    // How high the ground around its home is, seen from well over it: the mean of seventeen places, which
    // is what it flies its circles over. (Not the highest: one tower would send it up out of sight. What
    // stands higher than the rest is flown over or round as it comes, and the ground under it is never near.)
    glidersTop(mob, glider) {
        const home = mob.userData.home;
        const from = Math.max(home.y, mob.position.y) + GLIDE.scan;
        let sum = 0;
        let found = 0;
        for (let i = 0; i < 17; i++) {
            const angle = (i * Math.PI) / 4;
            const reach = i === 0 ? 0 : glider.range * (i <= 8 ? 0.5 : 0.95);
            const ground = this.glidersGround(home.x + Math.cos(angle) * reach, home.z + Math.sin(angle) * reach, from);
            if (ground <= -20) continue;
            sum += ground;
            found++;
        }
        return found ? sum / found : mob.position.y;
    },

    // ---- Appearing ------------------------------------------------------------------------

    // A new one on the ground at (x, y, z), perched: it takes off by itself.
    glidersSpawn(species, x, y, z, options) {
        const mob = this.createMob(species, new THREE.Vector3(x, y, z), options);
        this.ambientMobs.push(mob);
        this.glidersState(mob);
        return mob;
    },

    glidersSpawnCommand(species, x, z, player) {
        const floor = this.cameraController.getFloorY(x, z, player.y + 4);
        if (floor <= -20) {
            this.glidersSay('noGround', species);
            return true;
        }
        this.glidersSpawn(species, x, floor, z);
        this.glidersSay('spawned', species);
        return true;
    },

    glidersSpawnEgg(species, position) {
        const x = position.x + 0.5;
        const z = position.z + 0.5;
        const floor = this.cameraController.getFloorY(x, z, position.y + 4);
        if (floor <= -20) {
            this.glidersSay('noGround', species);
            return true;
        }
        this.glidersSpawn(species, x, Math.max(position.y, floor), z);
        this.consumeSelectedBlock();
        this.playPlaceSound('grass');
        this.glidersSay('spawned', species);
        this.placeActionTimer = 0.35;
        this.showHitIndicator();
        return true;
    },

    // What the movement keeps of one animal. It begins on the ground, where it is.
    glidersState(mob) {
        const data = mob.userData;
        const info = getMobSpecies(data.species);
        const body = glidersBody(data.modelSpecies || data.species);
        const cruise = info.speed || 3;
        const turnRate = GLIDE.turn / (1 + body.half);
        const pair = (value, fallback) => (Array.isArray(value) && value.length === 2 ? value : fallback);
        const count = body.across.length;
        const position = mob.position;
        const glider = {
            info, body, cruise, turnRate,
            tight: cruise / turnRate, // the radius of the tightest circle it can fly
            range: info.glideRange || GLIDE.range, height: info.glideHeight || GLIDE.height,
            aloft: pair(info.glideAloft, GLIDE.aloft), rest: pair(info.glidePerch, GLIDE.perch), beatEvery: pair(info.glideBeat, GLIDE.beat),
            sight: info.chaseDistance || GLIDE.sight, dive: info.chaseSpeed || cruise * GLIDE.dive,
            // A big wing beats slowly.
            beatRate: 11 / (1 + body.span * 0.3),
            every: GLIDE.sense * (1 + body.span / 10), sense: Math.random() * GLIDE.sense,
            mode: 'perch', timer: 2 + Math.random() * 3,
            heading: data.direction, speed: 0, vy: 0, room: 1,
            centerX: position.x, centerZ: position.z, radius: 4, turn: 1, circleFor: 0, top: position.y, cruiseY: position.y,
            perchX: position.x, perchY: position.y, perchZ: position.z, hopY: position.y, approachFor: 0,
            floor: position.y, minY: -Infinity, lift: 0, liftFor: 0, avoid: 0, avoidFor: 0, side: 0, sideFor: 0, stuck: 0,
            roofed: 0, roofGrace: 0, fright: 0,
            cells: new Int32Array(count * 2), bad: new Uint8Array(count), by0: 0, by1: 0, badTotal: Infinity, cellsOk: false, spread: false,
            holdMove: false, holdTurn: false, holdRise: false, heldMove: false,
            swoopIn: glideBetween(GLIDE.swoopEvery) * 0.3, warnFor: 0, swoopFor: 0, saidAt: -Infinity,
            aimX: 0, aimY: 0, aimZ: 0, committed: false, struck: false,
            fold: 1, flap: 0, flapFor: 0, beatIn: glideBetween(pair(info.glideBeat, GLIDE.beat)), wingPhase: 0,
            turning: 0, rising: 0, pitch: GLIDE.stance, roll: 0, swept: 0, strike: 0, lookYaw: 0, lookIn: 1,
            // A folded wing hangs from a little under the shoulder, so that it lies along the flank.
            rigRoot: undefined, tips: [null, null], fingers: [[], []], neck: null, shoulder: 0, drop: Math.max(0, body.trail * (1 - GLIDE.narrow) - 1 / 16)
        };
        data.glider = glider;
        mob.rotation.order = 'YXZ';
        mob.rotation.y = Math.PI / 2 - glider.heading;
        if (count * 2 > glideTryCells.length) {
            glideTryCells = new Int32Array(count * 2);
            glideTryBad = new Uint8Array(count);
        }
        return glider;
    },

    // What it is doing: 'perch' (on the ground), 'rise' (straight up from it), 'soar' (its circles),
    // 'approach' (down to a perch), 'settle' (straight down on to the ground), 'hop' (out from under a roof),
    // 'warn' and 'swoop' (a hostile one). A change forgets where its body was, and it is looked at afresh;
    // but between two ways of flying with its wings spread they stay as clear of the blocks as they were.
    glidersMode(glider, mode) {
        if (!glideSpread(mode) || !glideSpread(glider.mode)) {
            glider.cellsOk = false;
            glider.badTotal = Infinity;
        }
        glider.mode = mode;
        glider.holdMove = glider.holdTurn = glider.holdRise = glider.heldMove = false;
    },

    // ---- Its body and the air -------------------------------------------------------------

    // Whether its body may be at (x, y, z) heading that way, and if so that is where it now is: its middle
    // is in the air, and with its wings spread (`spread`) no more of the points along them are in a block
    // than where it was. Only the points that crossed into another cell look at a block.
    glidersFits(glider, x, y, z, heading, spread) {
        const across = glider.body.across;
        const count = spread ? across.length : 1;
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
        const by0 = Math.floor(y + GLIDE.feet);
        const by1 = Math.max(by0, Math.floor(y + glider.body.height - GLIDE.feet));
        const level = glider.cellsOk && glider.spread === spread && by0 === glider.by0 && by1 === glider.by1;
        const cells = glider.cells;
        let total = 0;
        let changed = false;
        for (let i = 0; i < count; i++) {
            const bx = Math.floor(x - sin * across[i]);
            const bz = Math.floor(z + cos * across[i]);
            let bad;
            if (level && bx === cells[i * 2] && bz === cells[i * 2 + 1]) {
                bad = glider.bad[i];
            } else {
                changed = true;
                bad = 0;
                for (let by = by0; by <= by1; by++) {
                    if (this.glidersFree(bx, by, bz)) continue;
                    if (i === 0) return false;
                    bad++;
                }
            }
            glideTryCells[i * 2] = bx;
            glideTryCells[i * 2 + 1] = bz;
            glideTryBad[i] = bad;
            total += bad;
        }
        if (!changed) return true;
        if (total > glider.badTotal) return false;
        for (let i = 0; i < count; i++) {
            cells[i * 2] = glideTryCells[i * 2];
            cells[i * 2 + 1] = glideTryCells[i * 2 + 1];
            glider.bad[i] = glideTryBad[i];
        }
        glider.by0 = by0;
        glider.by1 = by1;
        glider.badTotal = total;
        glider.spread = spread;
        glider.cellsOk = true;
        return true;
    },

    // One move, if it may be taken: never out of its range (unless it is out already, and this brings it
    // nearer), never into a block. Every step of every mode goes through here.
    glidersTry(mob, glider, x, y, z, heading, spread) {
        const position = mob.position;
        const home = mob.userData.home;
        const away = Math.hypot(x - home.x, z - home.z);
        if (away > glider.range && away > Math.hypot(position.x - home.x, position.z - home.z) + 1e-9) return false;
        if (!this.glidersFits(glider, x, y, z, heading, spread)) return false;
        position.set(x, y, z);
        glider.heading = heading;
        return true;
    },

    // How far the way is free from (x, y, z), up to `reach` blocks, for a point of its body `across` blocks
    // to the left of its middle: the cells it would cross at half its height, one every GLIDE.probeStep,
    // along the way it is going, which starts along `heading` and bends by `bend` radians for each block
    // (it flies in circles: what is in its way is on the curve, not straight ahead). GLIDE_PROBE is where
    // what closes it is.
    glidersProbe(glider, x, y, z, heading, reach, across, bend) {
        const by = Math.floor(y + glider.body.height * 0.5);
        let along = heading;
        let midX = x;
        let midZ = z;
        let free = 0;
        let last = 0;
        for (let d = Math.min(GLIDE.probeStep * 0.5, reach); ; d = Math.min(d + GLIDE.probeStep, reach)) {
            midX += Math.cos(along) * (d - last);
            midZ += Math.sin(along) * (d - last);
            along += bend * (d - last);
            last = d;
            const px = midX - Math.sin(along) * across;
            const pz = midZ + Math.cos(along) * across;
            if (!this.glidersFree(Math.floor(px), by, Math.floor(pz))) {
                GLIDE_PROBE.x = px;
                GLIDE_PROBE.z = pz;
                return free;
            }
            if (d >= reach) return reach;
            free = d;
        }
    },

    // ---- Every frame ----------------------------------------------------------------------

    glidersUpdate(mob, delta, player) {
        const data = mob.userData;
        const glider = data.glider || this.glidersState(mob);
        data.life += delta;
        glider.timer -= delta;
        if (glider.swoopIn > 0) glider.swoopIn -= delta;
        if (glider.fright > 0) glider.fright -= delta;
        glider.sense -= delta;
        if (glider.sense <= 0) {
            glider.sense = glider.every * (0.85 + Math.random() * 0.3);
            this.glidersSense(mob, glider, player);
        }
        const heading = glider.heading;
        const y = mob.position.y;
        const mode = glider.mode;
        if (mode === 'soar' || mode === 'approach' || mode === 'warn') this.glidersFly(mob, glider, delta, player);
        else if (mode === 'swoop') this.glidersSwoop(mob, glider, delta, player);
        else if (mode === 'rise') this.glidersRise(mob, glider, delta);
        else if (mode === 'settle') this.glidersSettle(mob, glider, delta);
        else if (mode === 'hop') this.glidersHop(mob, glider, delta);
        if (delta > 0) {
            // How fast it really turned and rose, for the look of it.
            const ease = Math.min(1, delta * 4);
            glider.turning += (glideClamp(glideAngle(glider.heading - heading) / delta, -3, 3) - glider.turning) * ease;
            glider.rising += ((mob.position.y - y) / delta - glider.rising) * ease;
        }
        this.glidersAnimate(mob, glider, delta);
    },

    // A few times a second: the blocks around it, and what to do about them. What it decides here, the
    // frames follow until the next look.
    glidersSense(mob, glider, player) {
        const mode = glider.mode;
        if (mode === 'perch') {
            this.glidersPerchLook(mob, glider);
            return;
        }
        const position = mob.position;
        const heldMove = glider.heldMove;
        glider.holdMove = glider.holdTurn = glider.holdRise = glider.heldMove = false;
        if (mode === 'rise') {
            this.glidersRiseLook(mob, glider);
            return;
        }
        if (!glideSpread(mode)) {
            // Coming down, or in a dive: the ground under it, however far.
            glider.floor = this.glidersGround(position.x, position.z, position.y + 0.5);
            return;
        }
        const body = glider.body;
        const x = position.x;
        const y = position.y;
        const z = position.z;
        const circling = mode !== 'approach';
        // The ground under it, if it is near.
        glider.floor = this.glidersNear(x, y, z);

        // A roof over it: it does not fly under one.
        if (glider.roofGrace > 0) {
            glider.roofGrace -= glider.every;
        } else if (circling && !this.glidersOpenSky(x, y, z, body.height, 0)) {
            glider.roofed += glider.every;
            if (glider.roofed >= GLIDE.roofFor) {
                glider.roofed = 0;
                // (Over water, or over nothing, there is nowhere to come down: it flies on, and out.)
                glider.floor = this.glidersGround(x, z, y + 0.5);
                if (glider.floor > -20 && !GLIDE_GROUND.wet) {
                    this.glidersMode(glider, 'settle');
                    return;
                }
                glider.roofGrace = GLIDE.roofGrace;
            }
        } else {
            glider.roofed = 0;
        }

        // Is the way open? It looks as far as it needs to turn round, and no further than where it is going.
        const speed = Math.max(glider.speed, glider.cruise * 0.5);
        let look = glider.tight + body.half * 0.5 + speed * glider.every + 1;
        if (!circling) look = Math.max(1, Math.min(look, Math.hypot(glider.perchX - x, glider.perchZ - z)));
        const heading = glider.heading;
        // (As it is turning now: so many radians for each block it flies.)
        const bend = glideClamp(glider.turning / speed, -0.5, 0.5);
        let ahead = this.glidersProbe(glider, x, y, z, heading, look, 0, bend);
        let blockX = GLIDE_PROBE.x;
        let blockZ = GLIDE_PROBE.z;
        let wing = 0;
        if (ahead >= look) {
            // Its wingtips, and a little beyond them: the left, then the right.
            const tip = body.half + GLIDE.berth;
            ahead = this.glidersProbe(glider, x, y, z, heading, look, tip, bend);
            wing = 1;
            if (ahead >= look) {
                ahead = this.glidersProbe(glider, x, y, z, heading, look, -tip, bend);
                wing = -1;
            }
            if (ahead < look) {
                blockX = GLIDE_PROBE.x;
                blockZ = GLIDE_PROBE.z;
            } else {
                wing = 0;
            }
        }
        // Steps refused though the way looks open: something its wings do not clear.
        glider.stuck = heldMove ? glider.stuck + glider.every : 0;
        if (glider.sideFor > 0) glider.sideFor -= glider.every;
        glider.room = 1;
        if (ahead < look) {
            // What is low is flown over; what is too near to be over in time, or too high, is turned away from.
            const from = y + body.height + GLIDE.over;
            const top = this.glidersGround(blockX, blockZ, from);
            const low = top > -20 && top <= Math.floor(from);
            if (low) {
                glider.lift = top + GLIDE.clear * 0.5;
                glider.liftFor = 3;
            }
            if (!low || (glider.lift - y) / GLIDE.climb > (ahead / speed) * 0.9) {
                if (glider.side === 0 || glider.sideFor <= 0) {
                    if (wing !== 0) {
                        glider.side = -wing;
                    } else {
                        // The side with more room; with as much on both, the way its circle turns.
                        const left = this.glidersProbe(glider, x, y, z, heading + 0.9, look, 0, 0);
                        const right = this.glidersProbe(glider, x, y, z, heading - 0.9, look, 0, 0);
                        glider.side = Math.abs(left - right) > 1 ? (left > right ? 1 : -1) : glider.turn;
                    }
                    glider.sideFor = GLIDE.sideFor;
                }
                glider.avoid = heading + glider.side * 1.1;
                glider.avoidFor = GLIDE.avoidFor;
                glider.room = glideClamp(ahead / look, 0.55, 1);
                // And its circle is no good: another, in a moment.
                if (circling && glider.circleFor > GLIDE.sideFor) glider.circleFor = GLIDE.sideFor;
            }
        } else if (glider.sideFor <= 0) {
            glider.side = 0;
        }
        if (glider.stuck > GLIDE.stuck) {
            // Hemmed in: up and out.
            glider.stuck = 0;
            glider.lift = y + GLIDE.over + 1;
            glider.liftFor = 2;
        }

        if (!circling) return;
        // The ground under it and ahead, half way and all the way: it keeps over it.
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
        glider.minY = Math.max(glider.floor, this.glidersNear(x + cos * look * 0.5, y, z + sin * look * 0.5), this.glidersNear(x + cos * look, y, z + sin * look)) + GLIDE.clear;

        if (mode !== 'soar') return;
        if (glider.timer <= 0 && glider.fright <= 0) {
            // Time to come down, if it sees where.
            if (this.glidersChoosePerch(mob, glider)) {
                glider.approachFor = GLIDE.approachFor;
                this.glidersMode(glider, 'approach');
                return;
            }
            glider.timer = 8 + Math.random() * 8;
        }
        if (mob.userData.hostile && glider.swoopIn <= 0) this.glidersLookForPrey(mob, glider, player);
    },

    // ---- On the wing ----------------------------------------------------------------------

    // One frame of flight, round its circle or down to its perch: it turns towards where it steers, gains
    // or loses speed and height, and takes of that what its body is allowed (glidersTry). What is refused
    // waits for the next look.
    glidersFly(mob, glider, delta, player) {
        const position = mob.position;
        const home = mob.userData.home;
        const x0 = position.x;
        const y0 = position.y;
        const z0 = position.z;
        const h0 = glider.heading;
        const circling = glider.mode !== 'approach';
        let desired;
        let pace;
        let level;
        let agile = 1;
        let leashed = true;
        if (circling) {
            if (glider.mode === 'warn') {
                glider.warnFor -= delta;
                if (glider.warnFor <= 0) {
                    this.glidersDive(mob, glider, player);
                    return;
                }
            }
            glider.circleFor -= delta;
            if (glider.circleFor <= 0) this.glidersNewCircle(mob, glider);
            // Round its circle: along it, and in or out to it when it is off it.
            const fromX = x0 - glider.centerX;
            const fromZ = z0 - glider.centerZ;
            const off = Math.hypot(fromX, fromZ) - glider.radius;
            desired = Math.atan2(fromZ, fromX) + glider.turn * (Math.PI / 2 + glideClamp(off * 0.5, -1.2, 1.2));
            pace = glider.cruise * glider.room;
            level = Math.max(glider.cruiseY, glider.minY);
        } else {
            glider.approachFor -= delta;
            const toX = glider.perchX - x0;
            const toZ = glider.perchZ - z0;
            const flat = Math.hypot(toX, toZ);
            if (flat < GLIDE.touch || glider.approachFor <= 0) {
                // Over it (or it could not be reached): down, or back up.
                if (flat < GLIDE.touch) {
                    this.glidersMode(glider, 'settle');
                } else {
                    glider.timer = 10 + Math.random() * 10;
                    this.glidersMode(glider, 'soar');
                }
                return;
            }
            desired = Math.atan2(toZ, toX);
            pace = glideClamp(flat * 0.8, GLIDE.slow, glider.cruise) * glider.room;
            level = Math.min(glider.cruiseY, glider.perchY + GLIDE.approachOver + Math.max(0, flat - 1) * GLIDE.slope);
            if (flat < GLIDE.near) {
                // The last blocks: slow, and turning on the spot.
                agile = 3;
                leashed = false;
            }
        }
        if (glider.avoidFor > 0) {
            glider.avoidFor -= delta;
            desired = glider.avoid;
        } else if (leashed && Math.hypot(home.x - x0 - Math.cos(h0) * glider.tight, home.z - z0 - Math.sin(h0) * glider.tight) > glider.range - GLIDE.margin) {
            // Where it would be by the time it has turned is too near the edge of its range: back, now.
            desired = Math.atan2(home.z - z0, home.x - x0);
        }
        if (glider.liftFor > 0) {
            glider.liftFor -= delta;
            level = Math.max(level, glider.lift);
        }

        const most = glider.turnRate * agile * delta;
        const turn = glider.holdTurn ? 0 : glideClamp(glideAngle(desired - h0), -most, most);
        glider.speed += (pace - glider.speed) * Math.min(1, delta * 1.2);
        const step = glider.holdMove ? 0 : glider.speed * delta;
        const fall = circling ? GLIDE.sink : GLIDE.stoop;
        glider.vy += (glideClamp((level - y0) * 1.2, -fall, GLIDE.climb) - glider.vy) * Math.min(1, delta * 2.5);
        const rise = glider.holdRise ? 0 : glider.vy * delta;

        const h1 = h0 + turn;
        let x1 = x0 + Math.cos(h1) * step;
        let z1 = z0 + Math.sin(h1) * step;
        const y1 = y0 + rise;
        // At the edge of its range it slides along it.
        const away = Math.hypot(x1 - home.x, z1 - home.z);
        const edge = Math.max(glider.range, Math.hypot(x0 - home.x, z0 - home.z)) - 1e-6;
        if (away > edge) {
            x1 = home.x + ((x1 - home.x) * edge) / away;
            z1 = home.z + ((z1 - home.z) * edge) / away;
        }
        if (this.glidersTry(mob, glider, x1, y1, z1, h1, true)) return;
        if (step !== 0 && this.glidersTry(mob, glider, x0, y1, z0, h1, true)) {
            // The step is what did not fit.
            glider.holdMove = glider.heldMove = true;
            glider.speed *= 0.7;
        } else if (turn !== 0 && this.glidersTry(mob, glider, x0 + Math.cos(h0) * step, y1, z0 + Math.sin(h0) * step, h0, true)) {
            // The turn.
            glider.holdTurn = true;
        } else if (rise !== 0 && this.glidersTry(mob, glider, x1, y0, z1, h1, true)) {
            // The rise.
            glider.holdRise = true;
            glider.vy = 0;
        } else {
            // Two of them, or all: one thing at a time until the next look.
            glider.holdMove = glider.heldMove = true;
            glider.speed *= 0.7;
            if (turn !== 0 && this.glidersTry(mob, glider, x0, y0, z0, h1, true)) {
                glider.holdRise = true;
            } else if (rise !== 0 && this.glidersTry(mob, glider, x0, y1, z0, h0, true)) {
                glider.holdTurn = true;
            } else {
                glider.holdRise = glider.holdTurn = true;
                glider.vy = 0;
            }
        }
    },

    // A circle to fly round, somewhere within its range, wide by the size of its wings: the first of a few
    // tried that has nothing standing in it at the height it flies (a tower, a tall tree), or the last. It
    // goes round it the way it was going round the one before: to turn about it would have to swing wide.
    glidersNewCircle(mob, glider) {
        const home = mob.userData.home;
        // No circle comes nearer the edge of its range than it needs to turn round: it may have to.
        const widest = Math.max(1.5, glider.range - Math.max(glider.tight, GLIDE.margin + 0.5));
        glider.cruiseY = glider.top + glider.height + (Math.random() - 0.5) * 1.5;
        glider.circleFor = glideBetween(GLIDE.circleFor);
        const by = Math.floor(glider.cruiseY + GLIDE.feet);
        for (let tries = 0; tries < GLIDE.circleTries; tries++) {
            glider.radius = Math.min(glider.tight * glideBetween(GLIDE.circle), widest);
            const offset = Math.random() * Math.max(0, widest - glider.radius);
            const angle = Math.random() * Math.PI * 2;
            glider.centerX = home.x + Math.cos(angle) * offset;
            glider.centerZ = home.z + Math.sin(angle) * offset;
            // Sixteen places round it, for its middle and for each of its wingtips.
            const berth = glider.body.half + GLIDE.berth;
            let clear = true;
            for (let i = 0; i < 48 && clear; i++) {
                const reach = glider.radius + ((i % 3) - 1) * berth;
                const bx = Math.floor(glider.centerX + Math.cos((i * Math.PI) / 24) * reach);
                const bz = Math.floor(glider.centerZ + Math.sin((i * Math.PI) / 24) * reach);
                clear = this.glidersFree(bx, by, bz) && this.glidersFree(bx, by - 1, bz);
            }
            if (clear) return;
        }
    },

    // A place to come down to: the highest of a few it sees under it near its home, dry, with a little
    // luck in it, and far enough to glide down to (one right under it would be a long drop straight
    // down). False if it sees none.
    glidersChoosePerch(mob, glider) {
        const home = mob.userData.home;
        const position = mob.position;
        // (No nearer the edge of its range than its circles go: it comes at it in a wide turn.)
        const reach = Math.max(2, glider.range - Math.max(glider.tight, GLIDE.margin + 1));
        let best = -Infinity;
        for (let i = 0; i < GLIDE.perchTries; i++) {
            const angle = Math.random() * Math.PI * 2;
            const away = Math.sqrt(Math.random()) * reach;
            const x = Math.floor(home.x + Math.cos(angle) * away) + 0.5;
            const z = Math.floor(home.z + Math.sin(angle) * away) + 0.5;
            if (Math.hypot(x - home.x, z - home.z) > reach) continue;
            const ground = this.glidersGround(x, z, position.y + 0.5);
            if (ground <= -20 || GLIDE_GROUND.wet || ground > position.y - 0.5) continue;
            if (Math.hypot(x - position.x, z - position.z) < (position.y - ground - GLIDE.approachOver) / GLIDE.slope + 1) continue;
            const score = ground + Math.random() * 2;
            if (score <= best) continue;
            best = score;
            glider.perchX = x;
            glider.perchY = ground;
            glider.perchZ = z;
        }
        return best > -Infinity;
    },

    // ---- Up from the ground, and down on to it ----------------------------------------------

    // On its perch, at each look: the block under it may be gone, or one put where it sits; and when it
    // has sat long enough, up it goes, if there is sky over it.
    glidersPerchLook(mob, glider) {
        const position = mob.position;
        const bx = Math.floor(position.x);
        const by = Math.floor(position.y + GLIDE.feet);
        const bz = Math.floor(position.z);
        if (!this.glidersFree(bx, by, bz)) {
            // Something was put where it sits (or it was made inside the ground): on top of it, if there is
            // room within a few cells.
            for (let i = 1; i <= GLIDE.roof + 3; i++) {
                if (!this.glidersFree(bx, by + i, bz)) continue;
                position.y = by + i;
                this.glidersMode(glider, 'perch');
                break;
            }
            return;
        }
        const floor = this.glidersGround(position.x, position.z, position.y + 0.5);
        if (floor > -20 && floor < position.y - 0.05) {
            glider.floor = floor;
            this.glidersMode(glider, 'settle');
            return;
        }
        if (glider.timer > 0) return;
        if (this.glidersOpenSky(position.x, position.y, position.z, glider.body.height, glider.height)) {
            this.glidersTakeOff(mob, glider);
        } else if (this.glidersFindOpen(mob, glider)) {
            this.glidersMode(glider, 'hop');
        } else {
            // A roof, and no way out from under it that it can see: it waits, and looks another way.
            glider.timer = 4 + Math.random() * 6;
            glider.heading += (Math.random() - 0.5) * 2.4;
        }
    },

    glidersTakeOff(mob, glider) {
        glider.top = this.glidersTop(mob, glider);
        glider.turn = Math.random() < 0.5 ? -1 : 1;
        this.glidersNewCircle(mob, glider);
        glider.perchX = mob.position.x;
        glider.perchY = mob.position.y;
        glider.perchZ = mob.position.z;
        glider.timer = glideBetween(glider.aloft);
        glider.speed = 0;
        glider.vy = 0;
        glider.flapFor = 3;
        glider.minY = -Infinity;
        glider.liftFor = 0;
        glider.avoidFor = 0;
        this.glidersMode(glider, 'rise');
        this.glidersWhoosh(mob, 1.2);
    },

    // Straight up from its perch, beating its wings, turning to the way its circle goes round.
    glidersRise(mob, glider, delta) {
        const position = mob.position;
        const along = Math.atan2(position.z - glider.centerZ, position.x - glider.centerX) + glider.turn * (Math.PI / 2);
        const most = glider.turnRate * 2 * delta;
        const heading = glider.heading + glideClamp(glideAngle(along - glider.heading), -most, most);
        glider.vy += (GLIDE.climb - glider.vy) * Math.min(1, delta * 3);
        if (this.glidersTry(mob, glider, position.x, position.y + glider.vy * delta, position.z, heading, false)) return;
        // Something over it: down again.
        glider.vy = 0;
        glider.timer = glideBetween(glider.rest);
        this.glidersMode(glider, 'settle');
    },

    // Rising, at each look: once it is high enough and its wings have room, it spreads them and flies.
    glidersRiseLook(mob, glider) {
        const position = mob.position;
        if (position.y - glider.perchY < GLIDE.liftoff) return;
        glider.cellsOk = false;
        glider.badTotal = Infinity;
        const fits = this.glidersFits(glider, position.x, position.y, position.z, glider.heading, true) && glider.badTotal === 0;
        glider.cellsOk = false;
        glider.badTotal = Infinity;
        if (fits) {
            // Its wings are clear of everything: from here on they stay so.
            this.glidersMode(glider, 'soar');
            glider.badTotal = 0;
        } else if (position.y >= Math.max(glider.cruiseY, glider.perchY + GLIDE.liftoff + 4)) {
            // As high as it flies, and still no room: this is no place to fly from.
            glider.timer = glideBetween(glider.rest) * 2;
            this.glidersMode(glider, 'settle');
        }
    },

    // Straight down on to the ground under it, slowly, beating its wings.
    glidersSettle(mob, glider, delta) {
        const position = mob.position;
        const gap = position.y - glider.floor;
        if (glider.floor <= -20) {
            // Nothing under it: it cannot come down here.
            glider.roofGrace = GLIDE.roofGrace;
            this.glidersMode(glider, 'soar');
            return;
        }
        if (gap <= 0.02) {
            this.glidersLand(mob, glider);
            return;
        }
        const fall = Math.min(gap, glideClamp(gap * 1.5, 0.5, GLIDE.settle) * delta);
        if (this.glidersTry(mob, glider, position.x, position.y - fall, position.z, glider.heading, false)) return;
        // Something it did not see from above (the top of a fence, a pane): that is its perch.
        glider.floor = Math.floor(position.y - fall + GLIDE.feet) + 1;
        if (position.y - glider.floor <= 0.02) this.glidersLand(mob, glider);
    },

    glidersLand(mob, glider) {
        const position = mob.position;
        if (glider.floor < position.y) position.y = glider.floor;
        glider.perchX = position.x;
        glider.perchY = position.y;
        glider.perchZ = position.z;
        glider.speed = 0;
        glider.vy = 0;
        glider.flapFor = 0;
        if (glider.timer < 1) glider.timer = glideBetween(glider.rest);
        this.glidersMode(glider, 'perch');
        this.glidersWhoosh(mob, 0.8);
    },

    // A place under the open sky within a few blocks of where it sits, that it can flutter straight to:
    // where its hop will end (perchX, perchY, perchZ) and how high it goes (hopY). False if it sees none.
    glidersFindOpen(mob, glider) {
        const position = mob.position;
        const home = mob.userData.home;
        const height = glider.body.height;
        for (let i = 0; i < GLIDE.hopTries; i++) {
            const angle = Math.random() * Math.PI * 2;
            const away = 1.5 + Math.random() * (GLIDE.hopReach - 1.5);
            const x = Math.floor(position.x + Math.cos(angle) * away) + 0.5;
            const z = Math.floor(position.z + Math.sin(angle) * away) + 0.5;
            if (Math.hypot(x - home.x, z - home.z) > glider.range - GLIDE.margin) continue;
            const ground = this.glidersGround(x, z, position.y + 1.5);
            if (ground <= -20 || GLIDE_GROUND.wet || Math.abs(ground - position.y) > 1.5) continue;
            if (!this.glidersOpenSky(x, ground, z, height, glider.height)) continue;
            const over = Math.max(position.y, ground) + 1;
            if (!this.glidersClearLine(position.x, over + GLIDE.feet, position.z, x, over + GLIDE.feet, z)) continue;
            if (!this.glidersClearLine(position.x, over + height, position.z, x, over + height, z)) continue;
            glider.perchX = x;
            glider.perchY = ground;
            glider.perchZ = z;
            glider.hopY = over;
            return true;
        }
        return false;
    },

    // A flutter to a place a few blocks away: up a block, across, and down.
    glidersHop(mob, glider, delta) {
        const position = mob.position;
        const toX = glider.perchX - position.x;
        const toZ = glider.perchZ - position.z;
        const flat = Math.hypot(toX, toZ);
        let moved;
        if (flat <= 0.05) {
            moved = false;
        } else if (position.y < glider.hopY - 0.02) {
            moved = this.glidersTry(mob, glider, position.x, Math.min(glider.hopY, position.y + GLIDE.climb * 0.7 * delta), position.z, glider.heading, false);
        } else {
            const step = Math.min(flat, GLIDE.hopSpeed * delta);
            moved = this.glidersTry(mob, glider, position.x + (toX / flat) * step, position.y, position.z + (toZ / flat) * step, Math.atan2(toZ, toX), false);
            glider.speed = GLIDE.hopSpeed;
        }
        if (moved) return;
        // There, or something in its way: down where it is.
        glider.speed = 0;
        glider.floor = this.glidersGround(position.x, position.z, position.y + 0.5);
        glider.timer = glideBetween(glider.rest) * 0.5;
        this.glidersMode(glider, 'settle');
    },

    // ---- A hostile one --------------------------------------------------------------------

    // Whether there is a player to dive at: this client's own, on the ground under it and near its home,
    // with nothing between the two. If so it cries, and dives a moment later.
    glidersLookForPrey(mob, glider, player) {
        if (this.titleScreenOpen || this.respawnPending || this.cameraController.isInWater) return;
        const position = mob.position;
        const home = mob.userData.home;
        const feet = player.y - (this.cameraController.eyeHeight || 1.62);
        if (feet > position.y - 2) return;
        if (Math.hypot(player.x - position.x, player.z - position.z) > glider.sight) return;
        if (Math.hypot(player.x - home.x, player.z - home.z) > glider.range - 1) return;
        // These looks cost the most: not at every look. A player with a roof over their head is left
        // alone, however it could get at them, and so is one it cannot see.
        glider.swoopIn = GLIDE.lineEvery;
        if (!this.glidersOpenSky(player.x, feet, player.z, player.y - feet, 0)) return;
        if (!this.glidersClearLine(position.x, position.y + GLIDE.feet, position.z, player.x, feet + 0.9, player.z)) return;
        glider.warnFor = GLIDE.warn;
        glider.flapFor = GLIDE.warn;
        this.glidersMode(glider, 'warn');
        this.glidersCry(mob, glider, 1.6);
        if (mob.userData.life - glider.saidAt > GLIDE.warnEvery) {
            glider.saidAt = mob.userData.life;
            this.glidersSay('warning', mob.userData.species);
        }
    },

    // The dive begins: at where the player is now. Not if they have got under a roof, or into the water,
    // since its cry: then it lets them be, and looks again in a moment.
    glidersDive(mob, glider, player) {
        const feet = player.y - (this.cameraController.eyeHeight || 1.62);
        if (this.titleScreenOpen || this.respawnPending || this.cameraController.isInWater || !this.glidersOpenSky(player.x, feet, player.z, player.y - feet, 0)) {
            glider.swoopIn = GLIDE.lineEvery;
            this.glidersMode(glider, 'soar');
            return;
        }
        glider.aimX = player.x;
        glider.aimY = feet + 0.9;
        glider.aimZ = player.z;
        glider.committed = false;
        glider.struck = false;
        glider.swoopFor = GLIDE.swoopFor;
        this.glidersMode(glider, 'swoop');
    },

    // One frame of its dive: straight at its aim, which follows the player until it is near. It strikes
    // once, if they are within reach of its talons, and whatever happens it climbs away.
    glidersSwoop(mob, glider, delta, player) {
        const position = mob.position;
        const feet = player.y - (this.cameraController.eyeHeight || 1.62);
        glider.swoopFor -= delta;
        if (!glider.committed) {
            glider.aimX = player.x;
            glider.aimY = feet + 0.9;
            glider.aimZ = player.z;
        }
        const toX = glider.aimX - position.x;
        const toY = glider.aimY - position.y;
        const toZ = glider.aimZ - position.z;
        const distance = Math.hypot(toX, toY, toZ);
        if (distance < GLIDE.commit) glider.committed = true;
        const gone = this.titleScreenOpen || this.respawnPending;
        if (distance < 0.4 || glider.swoopFor <= 0 || gone) {
            this.glidersPullUp(mob, glider);
            return;
        }
        const step = Math.min(distance, glider.dive * delta);
        const flat = Math.hypot(toX, toZ);
        const heading = flat > 0.05 ? Math.atan2(toZ, toX) : glider.heading;
        if (!this.glidersTry(mob, glider, position.x + (toX / distance) * step, position.y + (toY / distance) * step, position.z + (toZ / distance) * step, heading, false)) {
            this.glidersPullUp(mob, glider);
            return;
        }
        glider.speed = (flat / distance) * glider.dive;
        if (glider.struck) return;
        // Its talons against the player's body, from the feet to the eyes.
        const reachY = position.y + 0.2;
        if (Math.hypot(player.x - position.x, glideClamp(reachY, feet, player.y) - reachY, player.z - position.z) > GLIDE.talons) return;
        glider.struck = true;
        this.glidersTalons(mob, glider);
        this.glidersPullUp(mob, glider);
    },

    glidersTalons(mob, glider) {
        this.applyDamage(glider.info.attackDamage || 1, gameText(GLIDE_TEXT.talons)(this.glidersName(mob.userData.species)), 'mob', mob.position);
        this.playNoiseBurst({ duration: 0.08, volume: 0.035, highpass: 300, lowpass: 2400 });
    },

    // Out of its dive (or away from a blow): up, beating its wings, to a new circle, and no dive for a while.
    glidersPullUp(mob, glider) {
        glider.swoopIn = glideBetween(GLIDE.swoopEvery);
        glider.flapFor = 3;
        glider.vy = GLIDE.climb;
        glider.minY = -Infinity;
        glider.liftFor = 0;
        glider.avoidFor = 0;
        glider.roofGrace = 2;
        if (glider.timer < 10) glider.timer = 10 + Math.random() * 10;
        this.glidersNewCircle(mob, glider);
        this.glidersMode(glider, 'soar');
    },

    // ---- Struck ---------------------------------------------------------------------------

    glidersStruck(mob) {
        const data = mob.userData;
        const glider = data.glider || this.glidersState(mob);
        const lethal = this.damageMobByPlayer(mob);
        this.playNoiseBurst({ duration: 0.06, volume: 0.02, highpass: 400, lowpass: 2600 });
        if (lethal) {
            this.defeatMobByPlayer(mob, gameText(GLIDE_TEXT.defeated)(this.glidersName(data.species)));
            return;
        }
        this.glidersCry(mob, glider, 1.2);
        // Up and away, and it stays up for a good while. One under a roof has nowhere to go.
        glider.fright = GLIDE.fright;
        const mode = glider.mode;
        const position = mob.position;
        if (mode === 'perch' || mode === 'settle' || mode === 'hop') {
            if (this.glidersOpenSky(position.x, position.y, position.z, glider.body.height, glider.height)) this.glidersTakeOff(mob, glider);
        } else if (mode !== 'rise') {
            this.glidersPullUp(mob, glider);
        }
    },

    // ---- How it looks and sounds ------------------------------------------------------------

    // Its body turned the way it goes, tipped as it rises and leaning into its turns, and what its wings
    // are doing: folded, held out or beating.
    glidersAnimate(mob, glider, delta) {
        const data = mob.userData;
        const mode = glider.mode;
        const flying = mode !== 'perch';
        const follow = Math.min(1, delta * 4);
        if (glider.rigRoot !== data.modelRoot) this.glidersRig(mob, glider);

        // Beating: to rise, to come down on a perch, to keep up when it is slow, and a few times now and then.
        if (glider.flapFor > 0) glider.flapFor -= delta;
        let beating = false;
        if (mode === 'soar' || mode === 'warn') {
            glider.beatIn -= delta;
            if (glider.beatIn <= 0) {
                glider.beatIn = glideBetween(glider.beatEvery);
                glider.flapFor = Math.max(glider.flapFor, 1.2 + Math.random() * 1.2);
            }
            beating = glider.flapFor > 0 || glider.rising > 0.6 || glider.speed < glider.cruise * 0.6;
        } else if (mode === 'approach') {
            beating = glider.speed < glider.cruise * 0.6 || glider.rising > 0.6;
        } else if (mode !== 'swoop') {
            beating = flying;
        }
        glider.flap = glideClamp(glider.flap + (beating ? 2.4 : -1.6) * delta, 0, 1);
        const before = glider.wingPhase;
        glider.wingPhase += delta * glider.beatRate * glider.flap;
        if (glider.flap > 0.5 && Math.floor(before / (Math.PI * 2)) !== Math.floor(glider.wingPhase / (Math.PI * 2))) this.glidersWhoosh(mob, 0.6);

        glider.fold += ((flying ? 0 : 1) - glider.fold) * follow;
        glider.swept += ((mode === 'swoop' ? 1 : 0) - glider.swept) * Math.min(1, delta * 6);
        glider.strike += ((mode === 'swoop' && glider.committed ? 1 : 0) - glider.strike) * Math.min(1, delta * 8);
        // Low over the ground it keeps its wings level: a wingtip is not to be dipped into it.
        const low = glideClamp((mob.position.y - glider.floor) / (glider.body.half + 0.5), 0.2, 1);
        const pitch = flying ? glideClamp(Math.atan2(-glider.rising, Math.max(glider.speed, 1.5)), -0.5, 1) : GLIDE.stance;
        const roll = flying && mode !== 'rise' && mode !== 'settle' ? glideClamp(glider.turning * 0.9, -0.6, 0.6) * low : 0;
        glider.pitch += (pitch - glider.pitch) * follow;
        glider.roll += (roll - glider.roll) * follow;
        mob.rotation.y = this.lerpAngle(mob.rotation.y, Math.PI / 2 - glider.heading, Math.min(1, delta * 8));
        mob.rotation.x = glider.pitch;
        mob.rotation.z = glider.roll;

        // On its perch it looks about.
        glider.lookIn -= delta;
        if (glider.lookIn <= 0) {
            glider.lookIn = 1.5 + Math.random() * 3;
            glider.lookYaw = flying ? 0 : (Math.random() - 0.5) * 2;
        }
        this.glidersPose(mob, glider, delta);
    },

    // The parts of a new model (the first, or one rebuilt for another graphics mode) that the pose moves.
    glidersRig(mob, glider) {
        const data = mob.userData;
        const parts = data.modelParts || {};
        glider.rigRoot = data.modelRoot;
        for (let i = 0; i < 2; i++) {
            const side = i === 0 ? 'L' : 'R';
            glider.tips[i] = parts[`wingTip${side}`] || null;
            glider.fingers[i].length = 0;
            for (let finger = 0; parts[`finger${side}${finger}`]; finger++) glider.fingers[i].push(parts[`finger${side}${finger}`]);
            // A wing folds back first and then stands up: in that order.
            if (data.wings[i]) data.wings[i].rotation.order = 'YXZ';
        }
        glider.shoulder = data.wings[0] ? data.wings[0].position.y : 0;
        glider.neck = parts.neck || null;
    },

    // Puts its rig as it is: from `fold` 0 (as its model is built: wings spread) to 1 (folded, on the
    // ground), with `flap` of a beat at `wingPhase`, swept back in a dive, its legs behind it or forward
    // to strike. Nothing here depends on the frame before, but the turn of its head.
    glidersPose(mob, glider, delta) {
        const data = mob.userData;
        const fold = glider.fold;
        const open = 1 - fold;
        const beat = Math.sin(glider.wingPhase) * GLIDE.stroke * glider.flap;
        const lag = Math.sin(glider.wingPhase - 0.9) * GLIDE.stroke * 0.6 * glider.flap;
        const sweep = glider.swept * GLIDE.sweep * open;
        const wings = data.wings;
        for (let i = 0; i < wings.length && i < 2; i++) {
            const sign = i === 0 ? 1 : -1;
            const wing = wings[i];
            wing.rotation.set(GLIDE.foldUp * fold, sign * (GLIDE.foldBack * fold + sweep), sign * (GLIDE.dihedral + beat) * open);
            wing.scale.z = 1 - GLIDE.narrow * fold;
            wing.position.y = glider.shoulder - glider.drop * fold;
            const tip = glider.tips[i];
            if (tip) tip.rotation.set(0, sign * (GLIDE.tuck * fold + sweep), sign * (0.08 + lag) * open);
            const fingers = glider.fingers[i];
            for (let finger = 0; finger < fingers.length; finger++) {
                // Spread apart and curled up at the end of the wing, in the air.
                fingers[finger].rotation.set(0, sign * (0.3 - finger * 0.18) * open * (1 - glider.swept), sign * (0.16 + finger * 0.03 + lag * 0.5) * open);
            }
        }
        const legs = data.legs;
        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            // Behind it in the air, forward to strike, and straight down under it when it sits tipped up.
            leg.rotation.x = leg.userData.baseRotation.x + (GLIDE.legsBack * (1 - glider.strike) - GLIDE.legsStrike * glider.strike) * open - glider.pitch * fold;
        }
        const tail = data.tail;
        for (let i = 0; i < tail.length; i++) {
            const feather = tail[i];
            feather.rotation.x = feather.userData.baseRotation.x - 0.35 * fold - glider.turning * 0.1 * open;
            feather.rotation.y = feather.userData.baseRotation.y - glider.roll * 0.4;
        }
        if (glider.neck) glider.neck.rotation.x = glider.neck.userData.baseRotation.x - 0.4 * fold;
        const head = data.head;
        if (head) {
            const base = head.userData.baseRotation;
            const yaw = open * glideClamp(glider.turning * 0.4, -0.5, 0.5) + fold * glider.lookYaw;
            head.rotation.y += (base.y + yaw - head.rotation.y) * Math.min(1, delta * 6);
            // Level, however its body is tipped.
            head.rotation.x = base.x - glider.pitch * 0.7 + (glider.neck ? 0.4 * fold : 0);
        }
        // Its body heaves with each beat.
        if (data.modelRoot) data.modelRoot.position.y = -Math.cos(glider.wingPhase) * 0.04 * glider.flap * open;
    },

    // How loud something of it is for this player: 1 next to it, 0 from `reach` blocks.
    glidersLoudness(mob, reach) {
        const player = this.getLocalPlayerPosition();
        const position = mob.position;
        return Math.max(0, 1 - Math.hypot(player.x - position.x, player.y - position.y, player.z - position.z) / reach);
    },

    glidersCry(mob, glider, strength) {
        const volume = 0.014 * strength * this.glidersLoudness(mob, GLIDE.hear);
        if (volume <= 0.001) return;
        const tone = glider.info.tone || 1200;
        this.playTone({ frequency: tone * 1.2, endFrequency: tone * 0.7, duration: 0.5, type: 'sawtooth', volume, attack: 0.04, release: 0.15 });
        this.playTone({ frequency: tone * 1.25, endFrequency: tone * 0.72, duration: 0.45, type: 'triangle', volume: volume * 0.8, attack: 0.03, release: 0.12, detune: 12 });
    },

    glidersWhoosh(mob, strength) {
        const volume = 0.02 * strength * this.glidersLoudness(mob, GLIDE.hear * 0.5);
        if (volume <= 0.001) return;
        this.playNoiseBurst({ duration: 0.2, volume, highpass: 90, lowpass: 650 });
    }
});
