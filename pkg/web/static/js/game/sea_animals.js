// Sea animals: how the extinct animals of the sea live. One movement, 'cruise' (js/extensions.js), for all
// of them; a species is a small file on top of it (js/game/trilobite.js, ammonite.js, plesiosaur.js) that
// says its model and, in its `info`, where it likes to be.
//
// What the movement does, for every species:
// - It lives in water and never leaves it. Its body is a row of points from its tail to its nose (and two
//   at its sides when it is broad), measured once from its model (seaAnimalsBody). A step, a turn or a
//   rise is taken only if no more of those points end up out of the water than there were, and never if
//   its middle would: so it does not go through a wall, a pane of glass, the bed or the surface, and one
//   that appears in a corner too small for it can only work its way out.
// - It looks ahead by the size of its own body: its length, the circle it needs to turn (a long body turns
//   slowly) and its width. When the water ends ahead it slows down and turns to one side, the same side
//   until the way opens; over a step of the bed it rises. In a pool hardly bigger than itself it turns
//   about on the spot and, every so often, hangs still for a moment; with no room even to turn it backs
//   up a little and waits.
// - A long body (over SEA.long blocks: a megalodon, js/game/megalodon.js) never stops to turn on the spot:
//   it slows down to the speed whose turn fits the water ahead of it, and never below a crawl, so that in a
//   lake it cruises and in a pool too small for it it circles slowly. (A step that does not fit is refused
//   all the same, so the crawl takes it into no wall.)
// - It looks for water only as high as the water where it is: one taller than its water (a fin out of a
//   shallow lake) still swims where the water is as deep, and does not take the air over it for a wall.
// - It stays around its home (`userData.home`, where it appeared): beyond `seaRange` blocks it turns
//   back. A revived animal has the same home for every player (js/game/animals.js), and each client swims
//   its own copy: that home and the walls of its pool are all that two players' views agree on.
// - Struck (through damageMobByPlayer and defeatMobByPlayer, js/game/mobs.js), it darts away from the
//   player, or rolls into a ball if its species does.
// - A hostile one goes for a player who is in the water within its `chaseDistance` and bites; a player on
//   the shore is safe, since it cannot leave the water. Close to the player and with them off to one side,
//   it slows down nearly to a stop and turns its head in, instead of circling them at the width of its
//   turn; facing them, it comes on. After a bite it swims on past them for a moment (SEA.pass), and then
//   turns back. Its bite reaches a little further the longer it is (its head is bigger): SEA.biteReach for
//   one of up to 4 blocks.
// - A hostile one also goes after the small animals of its water (seaAnimalsStalks: not much more than
//   half its length, peaceful, within SEA.preyDistance), as long as no player is in the water near it: it
//   chases one and snaps at it, and the other darts away, or rolls into a ball if its species does. It
//   does not hurt it: nothing is taken from somebody's kept animal. After a snap it leaves them alone for
//   a while.
// - With no water (its pool was emptied) it lies on the ground and waits: it does not die, and it swims
//   again when the water is back or there is some next to it.
// - /mob and its egg put it in the nearest water, and say so when there is none: it is never made on land.
//
// What a species says in its `info`, besides `movement: 'cruise'` and the fields every species has
// (`speed` is what it cruises at; `hostile`, `attackDamage`, `chaseDistance` and `chaseSpeed` as on land):
//   seaDepth   where it likes to be: 'bed' (it walks on the bottom) or a number from 0 (just over the
//              bed) to 1 (just under the surface), the share of the depth it keeps to (0.5)
//   seaBreath  [min, max] seconds between two breaths: it breathes air, so it comes up, puts its head
//              out of the water for a moment and dives again. None: it has gills
//   seaJet     true: it moves in spurts with its back first (an ammonite, shell first), and hangs between two
//   seaIdle    the share of its time it spends still, from 0 (0) to under 1
//   seaCurl    the chance, from 0 to 1, that it rolls into a ball when struck, instead of darting away (0)
//   seaRange   how many blocks from its home it roams (3 and its own length)
//
// What its model gives the animation, all optional: the rig's `tail` sways (and is what rolls up into a
// ball), `wings` are its flippers in the order front-left, front-right, back-left, back-right (more pairs,
// further back, beat as a wave from the front: the flaps of js/game/anomalocaris.js), `legs` are
// the little legs of one that walks on the bed, `arms` are tentacles that trail, `head` rises to breathe;
// parts named `neck0`, `neck1`... bend into a turn and lift the head out of the water, and `jaw` opens to
// bite and to breathe. The model stands on y = 0 and faces +z, as every mob's.
//
// Cheap on purpose: the blocks around are looked at a few times a second (SEA.sense), a step looks at a
// block only when one of the points of its body crosses into another cell, and nothing is made per frame.
// Mixed into Game.prototype; `this` is the Game instance.

const SEA = {
    // Seconds between two looks at the water ahead, for a small one; a tenth more for each block of its
    // length (a long body turns slowly, and need not look so often). In between it only moves.
    sense: 0.22,
    recheck: 5, // every so many looks, its whole body again: a block may have been put or taken
    reach: 8, // cells up and down it looks for the bed and the surface
    probeStep: 0.9, // blocks between two cells looked at ahead: under 1, so that no wall is skipped
    spine: 0.9, // at most this far between two points of its body
    turn: 3.6, // radians a second a body of no length turns; one L blocks long, turn / (1 + L)
    surfaceGap: 0.06, // kept between its back and the surface
    bedGap: 0.03, // and between its belly and the bed
    feet: 0.02,
    burst: 2.4, // times its speed, when struck
    fleeTime: 1.8,
    chase: 1.8, // times its speed after a player, unless it says chaseSpeed
    chaseDistance: 10,
    biteReach: 0.9, // from its mouth to the player's body
    biteLong: 0.1, // and this much further for each block of its length over 4
    biteEvery: 1.2,
    pass: 1.5, // seconds it swims on past the player after a bite, before it turns back
    fastTurn: 2.2, // times its turn, when it flees or hunts
    closeIn: 0.12, // the least share of its chase speed it keeps while it turns in on a player close by
    long: 6, // blocks: a body longer than this never stops to turn on the spot
    crawl: 0.3, // the share of its speed a long body keeps, however little room it has
    preyShare: 0.55, // what it goes after: animals shorter than this share of its length
    preyDistance: 5, // blocks from it
    preyPace: 0.75, // the share of its chase speed it goes after them at
    preyRest: 8, // and for at least so many seconds after a snap (and up to half as many more) it leaves them alone
    gulp: 3.2, // seconds its head is out of the water for a breath
    breathWait: 20, // seconds it tries to reach the air before it gives up for a while
    sideFor: 4, // seconds it keeps turning to the same side
    jam: 1.2, // seconds of turns refused before it tries the other side
    backFor: 1.4, // seconds it backs up when neither side lets it turn
    pinchFor: 1.5 // seconds it takes the way ahead for closed when its sides did not fit
};

const SEA_TEXT = {
    needsWater: {
        ES: (name) => `${name}: es un animal marino y necesita agua cerca`,
        EN: (name) => `${name}: it is a sea animal and needs water nearby`
    },
    spawned: { ES: (name) => `${name}: ya nada en el agua`, EN: (name) => `${name}: now swimming in the water` },
    defeated: { ES: (name) => `${name}: lo has derrotado`, EN: (name) => `${name}: you defeated it` }
};

// The body of a species as its movement needs it, read once from the parts of its model (js/models.js),
// as it stands, with nothing turned: how far it reaches ahead of and behind its middle (the origin of the
// model, which is what it turns about: best in the middle of its trunk), to each side and up, in blocks,
// and the points that have to stay in the water, as pairs (along, across) with its middle first. A species
// with no model gets a small body.
const SEA_BODIES = new Map();
function seaAnimalsBody(species) {
    let body = SEA_BODIES.get(species);
    if (body) return body;
    let front = 0.25;
    let back = 0.25;
    let half = 0.2;
    let height = 0.3;
    try {
        const build = VoxelModels.mobBuilders[species];
        if (build) {
            const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'skin' });
            build.call(VoxelModels, b, 0);
            let ahead = 0;
            let behind = 0;
            let aside = 0;
            let top = 0;
            for (const part of b.parts) {
                let [x, y, z] = part.pivot;
                for (let parent = part.parent && b.byName.get(part.parent); parent; parent = parent.parent && b.byName.get(parent.parent)) {
                    x += parent.pivot[0];
                    y += parent.pivot[1];
                    z += parent.pivot[2];
                }
                ahead = Math.max(ahead, z + part.from[2] + part.size[2]);
                behind = Math.max(behind, -(z + part.from[2]));
                aside = Math.max(aside, Math.abs(x + part.from[0]), Math.abs(x + part.from[0] + part.size[0]));
                top = Math.max(top, y + part.from[1] + part.size[1]);
            }
            if (ahead + behind > 0 && top > 0) {
                front = ahead / 16;
                back = behind / 16;
                half = Math.max(0.1, aside / 16);
                height = top / 16;
            }
        }
    } catch (error) {
        // A model that cannot be read this way: the small body will do.
    }
    const length = front + back;
    const spans = Math.max(1, Math.ceil(length / SEA.spine));
    const points = [0, 0];
    // The tips are left a little inside: the last texel of a nose is no reason to stop.
    for (let i = 0; i <= spans; i++) points.push((-back + (length * i) / spans) * 0.96, 0);
    if (half * 0.85 > 0.4) points.push(0, half * 0.85, 0, -half * 0.85);
    body = { front, back, half, height, length, points: new Float32Array(points) };
    SEA_BODIES.set(species, body);
    return body;
}

// What a look ahead found besides how far the way is free (seaAnimalsProbe): the height to rise to when
// what closes it is a step of the bed with water over it (or null), and the column of that step.
const SEA_PROBE = { step: null, x: 0, z: 0 };
// The water of one column, as seaAnimalsColumn found it.
const SEA_COLUMN = { lo: 0, hi: 0, air: false, surface: 0 };
// Where seaAnimalsNear found water.
const SEA_SPOT = { x: 0, y: 0, z: 0 };
// The cells of a body that is being tried, before it is taken (seaAnimalsFits): they grow to the longest body.
let seaTryCells = new Int32Array(32);
let seaTryBad = new Uint8Array(16);

// An angle brought back between -pi and pi.
function seaAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function seaClamp(value, low, high) {
    return value < low ? low : value > high ? high : value;
}

registerMobBehaviour('cruise', {
    // Not a body on the ground: the herd neither goes round it nor pushes it (js/game/herd.js).
    bodiless: true,
    inWater: true,
    update(mob, delta, player) { this.seaAnimalsUpdate(mob, delta, player); },
    interact(mob) { this.seaAnimalsStruck(mob); },
    spawnCommand(species, x, z, player) { return this.seaAnimalsSpawnCommand(species, x, z, player); },
    spawnEgg(species, position) { return this.seaAnimalsSpawnEgg(species, position); },
    // An animal the server keeps (js/game/animals.js): the machine that revives it puts it in a cell of
    // water, and `position` is the bed under it. With no water there (yet), no body.
    spawnKept(species, position, options) {
        return this.seaAnimalsSpawn(species, position.x, position.y, position.z, options);
    }
});

Object.assign(Game.prototype, {
    seaAnimalsWet(bx, by, bz) {
        return this.world.getBlockTypeAt(bx, by, bz) === 'water';
    },

    // The name of a species in the language of the game, for a line of the chat.
    seaAnimalsName(species) {
        const card = typeof bestiaryMobText === 'function' ? bestiaryMobText(species) : null;
        return (card && card.name) || species.replace(/_/g, ' ');
    },

    seaAnimalsSay(key, species) {
        this.receiveSystemMessage({ text: gameText(SEA_TEXT[key])(this.seaAnimalsName(species)) });
    },

    // ---- Where the water is -------------------------------------------------------------

    // The water of the column at (x, z) around height y, for a body this tall, into SEA_COLUMN: the lowest
    // and the highest its feet may be (lo over hi: it does not fit under the water there), where the
    // surface is, and whether there is air over it to breathe. False if that cell is not water. It looks
    // SEA.reach cells each way and no further: deeper than that, the bed is as far as it cares.
    seaAnimalsColumn(body, x, y, z) {
        const bx = Math.floor(x);
        const bz = Math.floor(z);
        const by = Math.floor(y + SEA.feet);
        if (!this.seaAnimalsWet(bx, by, bz)) return false;
        let bed = by;
        for (let i = 0; i < SEA.reach && this.seaAnimalsWet(bx, bed - 1, bz); i++) bed--;
        let top = by;
        let open = false;
        for (let i = 0; i < SEA.reach; i++) {
            if (!this.seaAnimalsWet(bx, top + 1, bz)) {
                open = true;
                break;
            }
            top++;
        }
        const out = SEA_COLUMN;
        out.lo = bed + SEA.bedGap;
        out.air = open && !this.world.hasSolidBlock(bx, top + 1, bz);
        // Where the water ends its surface is a little under the top of its cell, roof or no roof; where
        // it only goes on further than it looked, it may fill the cell.
        out.surface = open ? top + WATER_SURFACE_HEIGHT : top + 1;
        out.hi = out.surface - body.height - (open ? SEA.surfaceGap : 0);
        return true;
    },

    // The same, kept on the animal for the column it is in.
    seaAnimalsLookColumn(sea, x, y, z) {
        if (!this.seaAnimalsColumn(sea.body, x, y, z)) return false;
        sea.lo = SEA_COLUMN.lo;
        sea.hi = SEA_COLUMN.hi;
        sea.air = SEA_COLUMN.air;
        sea.surface = SEA_COLUMN.surface;
        sea.columnX = Math.floor(x);
        sea.columnZ = Math.floor(z);
        return true;
    },

    // Where a species goes in the water of the column at (x, z), near height y: the height for its feet, by
    // where it likes to be (on the bed, where the water is too shallow for it), or null if there is no
    // water there.
    seaAnimalsSpot(species, x, y, z) {
        const bx = Math.floor(x);
        const bz = Math.floor(z);
        const by = Math.floor(y + SEA.feet);
        const body = seaAnimalsBody(species);
        // The cell told, or the nearest water over or under it: one or two cells up (the bed told may be
        // the top of a lid), and down to twelve (/mob from the top of a cliff).
        for (let i = 0; i < 15; i++) {
            const dy = i === 0 ? 0 : i > 4 ? 2 - i : i % 2 ? (i + 1) / 2 : -i / 2;
            if (!this.seaAnimalsWet(bx, by + dy, bz)) continue;
            this.seaAnimalsColumn(body, x, by + dy, z);
            const { lo, hi } = SEA_COLUMN;
            if (hi < lo) return lo;
            const depth = getMobSpecies(species).seaDepth;
            return depth === 'bed' ? lo : lo + (hi - lo) * seaClamp(typeof depth === 'number' ? depth : 0.5, 0, 1);
        }
        return null;
    },

    // How many cells of a body would be out of the water at (x, y, z), turned the way it fits best of eight.
    seaAnimalsCrowd(body, x, y, z) {
        const points = body.points;
        const by0 = Math.floor(y + SEA.feet);
        const by1 = Math.max(by0, Math.floor(y + body.height - SEA.feet));
        let least = Infinity;
        for (let turn = 0; turn < 8 && least > 0; turn++) {
            const cos = Math.cos((turn * Math.PI) / 4);
            const sin = Math.sin((turn * Math.PI) / 4);
            let out = 0;
            for (let i = 0; i < points.length && out < least; i += 2) {
                const bx = Math.floor(x + cos * points[i] + sin * points[i + 1]);
                const bz = Math.floor(z + sin * points[i] - cos * points[i + 1]);
                for (let by = by0; by <= by1; by++) if (!this.seaAnimalsWet(bx, by, bz)) out++;
            }
            least = Math.min(least, out);
        }
        return least;
    },

    // The nearest water to (x, z) within `radius` columns, ring by ring, at about height y, into SEA_SPOT:
    // the first column where the whole of the species fits or, if there is none, the one where most of it
    // does. False with no water at all. Only /mob and an egg ask, never a frame.
    seaAnimalsNear(species, x, y, z, radius) {
        const body = seaAnimalsBody(species);
        let least = Infinity;
        for (let r = 0; r <= radius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const cx = Math.floor(x) + dx + 0.5;
                    const cz = Math.floor(z) + dz + 0.5;
                    const at = this.seaAnimalsSpot(species, cx, y, cz);
                    if (at === null) continue;
                    const out = this.seaAnimalsCrowd(body, cx, at, cz);
                    if (out >= least) continue;
                    least = out;
                    SEA_SPOT.x = cx;
                    SEA_SPOT.y = at;
                    SEA_SPOT.z = cz;
                    if (out === 0) return true;
                }
            }
        }
        return least < Infinity;
    },

    // ---- Appearing ----------------------------------------------------------------------

    // A new one in the water of the column at (x, z), near height y. Null where there is no water.
    seaAnimalsSpawn(species, x, y, z, options) {
        const at = this.seaAnimalsSpot(species, x, y, z);
        if (at === null) return null;
        const mob = this.createMob(species, new THREE.Vector3(x, at, z), options);
        this.ambientMobs.push(mob);
        this.seaAnimalsState(mob);
        return mob;
    },

    seaAnimalsSpawnCommand(species, x, z, player) {
        if (!this.seaAnimalsNear(species, x, player.y - 1, z, 10)) {
            this.seaAnimalsSay('needsWater', species);
            return true;
        }
        if (this.seaAnimalsSpawn(species, SEA_SPOT.x, SEA_SPOT.y, SEA_SPOT.z)) this.seaAnimalsSay('spawned', species);
        return true;
    },

    seaAnimalsSpawnEgg(species, position) {
        if (!this.seaAnimalsNear(species, position.x + 0.5, position.y + 1, position.z + 0.5, 3)
            || !this.seaAnimalsSpawn(species, SEA_SPOT.x, SEA_SPOT.y, SEA_SPOT.z)) {
            this.seaAnimalsSay('needsWater', species);
            return true;
        }
        this.consumeSelectedBlock();
        this.placeActionTimer = 0.35;
        this.showHitIndicator();
        return true;
    },

    // What the movement keeps of one animal. It points, to begin with, the way its body fits best.
    seaAnimalsState(mob) {
        const data = mob.userData;
        const info = getMobSpecies(data.species);
        const body = seaAnimalsBody(data.modelSpecies || data.species);
        const count = body.points.length / 2;
        const cruise = info.speed || 0.5;
        const breath = Array.isArray(info.seaBreath) ? info.seaBreath : null;
        const sea = {
            info, body, cruise,
            flip: info.seaJet ? Math.PI : 0, // its face looks the other way from where it goes
            lead: info.seaJet ? body.back : body.front, // from its middle to the end that goes first
            bed: info.seaDepth === 'bed',
            level: typeof info.seaDepth === 'number' ? info.seaDepth : 0.5,
            idle: seaClamp(info.seaIdle || 0, 0, 0.9),
            range: info.seaRange || 3 + body.length,
            turnRate: SEA.turn / (1 + body.length),
            // What it rises a second, and what it sinks: one that walks the bed is up a step, or down off a
            // ledge, in a moment.
            climb: info.seaDepth === 'bed' ? 1 : Math.max(0.3, cruise * 0.6), sink: info.seaDepth === 'bed' ? 1.2 : Math.max(0.3, cruise * 0.6),
            strokeRate: Math.PI * 2 * (0.4 + 0.9 / (1 + body.length)),
            heading: data.direction, steer: data.direction, wander: data.direction, arc: 0, wanderTimer: 0,
            speed: 0, targetSpeed: 0, depth: mob.position.y, levelDrift: 0, levelTimer: 0,
            lo: mob.position.y, hi: mob.position.y, air: false, surface: mob.position.y, columnX: NaN, columnZ: NaN,
            cells: new Int32Array(count * 2), bad: new Uint8Array(count), by0: 0, by1: 0, badTotal: Infinity, cellsOk: false,
            every: SEA.sense * (1 + body.length / 10), sense: Math.random() * SEA.sense, recheck: SEA.recheck,
            holdMove: false, holdTurn: false, holdRise: false, heldTurn: false, heldMove: false,
            side: 0, sideTimer: 0, whisker: 0, jam: 0, jams: 0, backFor: 0, pause: 0, pinch: 0, lift: 0, liftFor: 0,
            liftX: 0, liftZ: 0, shut: 0, shutFor: 8 + Math.random() * 10,
            resting: false, restTimer: 2 + Math.random() * 4,
            flee: 0, fleeHeading: 0, curl: 0, ball: 0, hunting: false, bite: 0,
            long: body.length > SEA.long, biteReach: SEA.biteReach + Math.max(0, body.length - 4) * SEA.biteLong,
            prey: null, preyRest: SEA.preyRest * 0.5, aim: 0, pass: 0,
            breathEvery: breath, breath: breath ? breath[0] * (0.3 + Math.random() * 0.7) : 0, gasp: false, gaspFor: 0, gulp: 0, rise: 0,
            pulse: Math.random() * 2, thrust: 0,
            stranded: false, strandLook: 0, floor: -100, ashore: 0,
            stroke: Math.random() * Math.PI * 2, vy: 0, turning: 0, pitch: 0, roll: 0, bend: 0,
            rigRoot: undefined, neck: [], jaw: null
        };
        data.sea = sea;
        // Every sea animal of this game, for a hunter to find the small ones among (seaAnimalsStalks): a
        // short list, where the whole of ambientMobs is long.
        (this.seaAnimalsSwimmers || (this.seaAnimalsSwimmers = [])).push(mob);
        mob.rotation.order = 'YXZ';
        if (count * 2 > seaTryCells.length) {
            seaTryCells = new Int32Array(count * 2);
            seaTryBad = new Uint8Array(count);
        }
        const position = mob.position;
        if (!this.seaAnimalsLookColumn(sea, position.x, position.y, position.z)) {
            sea.stranded = true;
            return sea;
        }
        // Eight ways to point: the one that leaves least of its body in a wall and, of those, most room ahead.
        let best = Infinity;
        for (let i = 0; i < 8; i++) {
            const heading = data.direction + (i * Math.PI) / 4;
            sea.cellsOk = false;
            sea.badTotal = Infinity;
            this.seaAnimalsFits(sea, position.x, position.y, position.z, heading + sea.flip);
            const score = sea.badTotal * 100 - this.seaAnimalsProbe(sea, position.x, position.y, position.z, heading, 6, 0);
            if (score < best) {
                best = score;
                sea.heading = heading;
            }
        }
        sea.steer = sea.wander = sea.heading;
        sea.cellsOk = false;
        sea.badTotal = Infinity;
        this.seaAnimalsFits(sea, position.x, position.y, position.z, sea.heading + sea.flip);
        mob.rotation.y = Math.PI / 2 - (sea.heading + sea.flip);
        return sea;
    },

    // ---- Its body and the water ---------------------------------------------------------

    // Whether its body may be at (x, y, z) facing that way, and if so that is where it now is: its middle
    // is in the water, and no more cells of its body are out of it than where it was. Only the points
    // that crossed into another cell look at a block; with none, nothing is looked at.
    seaAnimalsFits(sea, x, y, z, facing) {
        const points = sea.body.points;
        const count = points.length / 2;
        const cos = Math.cos(facing);
        const sin = Math.sin(facing);
        const by0 = Math.floor(y + SEA.feet);
        const by1 = Math.max(by0, Math.floor(y + sea.body.height - SEA.feet));
        const level = sea.cellsOk && by0 === sea.by0 && by1 === sea.by1;
        const cells = sea.cells;
        let total = 0;
        let changed = false;
        for (let i = 0; i < count; i++) {
            const along = points[i * 2];
            const across = points[i * 2 + 1];
            const bx = Math.floor(x + cos * along + sin * across);
            const bz = Math.floor(z + sin * along - cos * across);
            let bad;
            if (level && bx === cells[i * 2] && bz === cells[i * 2 + 1]) {
                bad = sea.bad[i];
            } else {
                changed = true;
                bad = 0;
                for (let by = by0; by <= by1; by++) {
                    if (this.seaAnimalsWet(bx, by, bz)) continue;
                    if (i === 0 && by === by0) return false;
                    bad++;
                }
            }
            seaTryCells[i * 2] = bx;
            seaTryCells[i * 2 + 1] = bz;
            seaTryBad[i] = bad;
            total += bad;
        }
        if (!changed) return true;
        if (total > sea.badTotal) return false;
        for (let i = 0; i < count; i++) {
            cells[i * 2] = seaTryCells[i * 2];
            cells[i * 2 + 1] = seaTryCells[i * 2 + 1];
            sea.bad[i] = seaTryBad[i];
        }
        sea.by0 = by0;
        sea.by1 = by1;
        sea.badTotal = total;
        sea.cellsOk = true;
        return true;
    },

    // How far the water goes on from the end of its body that goes first, along `heading`, up to `reach`
    // blocks: the cells its body would fill there, one every SEA.probeStep. `side` (1 or -1, 0 for none):
    // for one of its sides too, when it is broad, at the height of its middle. When what closes the way is
    // a step of the bed with water over it, SEA_PROBE.step is the height to rise to.
    seaAnimalsProbe(sea, x, y, z, heading, reach, side) {
        const body = sea.body;
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
        const by0 = Math.floor(y + SEA.feet);
        // No higher than the water where it is: what of it is out of the water here would be out there too,
        // and is no reason to take the way for closed (seaAnimalsFits lets it be, as long as no more is out).
        const by1 = Math.max(by0, Math.min(Math.floor(y + body.height - SEA.feet), Math.floor(sea.surface - 1e-6)));
        const across = body.half * 0.85 > 0.4 ? side * body.half * 0.85 : 0;
        SEA_PROBE.step = null;
        // The first cell just ahead of it, then one every step, and the last right at the end of its reach.
        let free = 0;
        for (let d = Math.min(SEA.probeStep * 0.5, reach); ; d = Math.min(d + SEA.probeStep, reach)) {
            const bx = Math.floor(x + cos * (sea.lead + d));
            const bz = Math.floor(z + sin * (sea.lead + d));
            for (let by = by0; by <= by1; by++) {
                if (this.seaAnimalsWet(bx, by, bz)) continue;
                if (by === by0) {
                    let over = true;
                    for (let up = by0 + 1; up <= by1 + 1 && over; up++) over = this.seaAnimalsWet(bx, up, bz);
                    if (over) {
                        SEA_PROBE.step = by0 + 1 + SEA.bedGap;
                        SEA_PROBE.x = bx;
                        SEA_PROBE.z = bz;
                    }
                }
                return free;
            }
            if (across !== 0 && !this.seaAnimalsWet(Math.floor(x + cos * (sea.lead + d) + sin * across), Math.min(by1, Math.floor(y + body.height / 2)), Math.floor(z + sin * (sea.lead + d) - cos * across))) {
                return free;
            }
            if (d >= reach) return reach;
            free = d;
        }
    },

    // ---- Every frame --------------------------------------------------------------------

    seaAnimalsUpdate(mob, delta, player) {
        const data = mob.userData;
        const sea = data.sea || this.seaAnimalsState(mob);
        data.life += delta;
        sea.flee = Math.max(0, sea.flee - delta);
        sea.bite = Math.max(0, sea.bite - delta);
        sea.pass = Math.max(0, sea.pass - delta);
        if (sea.curl > 0) {
            sea.curl -= delta;
            // Out of its ball, it makes off.
            if (sea.curl <= 0) sea.flee = SEA.fleeTime * 0.6;
        }
        sea.ball += ((sea.curl > 0 ? 1 : 0) - sea.ball) * Math.min(1, delta * 7);

        sea.sense -= delta;
        if (sea.stranded) {
            this.seaAnimalsAshore(mob, sea, delta);
        } else {
            if (sea.sense <= 0) {
                sea.sense = sea.every * (0.85 + Math.random() * 0.3);
                this.seaAnimalsSense(mob, sea, player);
            }
            if (!sea.stranded) {
                this.seaAnimalsBreathe(mob, sea, delta, player);
                this.seaAnimalsMove(mob, sea, delta);
                if (sea.hunting) this.seaAnimalsBite(mob, sea, player);
                else if (sea.prey) this.seaAnimalsSnap(mob, sea);
            }
        }
        this.seaAnimalsAnimate(mob, sea, delta);
    },

    // A few times a second: where it wants to go, whether the way is open, how fast and how deep. What it
    // decides here, seaAnimalsMove follows until the next look.
    seaAnimalsSense(mob, sea, player) {
        const data = mob.userData;
        const info = sea.info;
        const body = sea.body;
        const position = mob.position;
        const x = position.x;
        const y = position.y;
        const z = position.z;

        // Its own cell first: the water may have been taken away.
        if (!this.seaAnimalsWet(Math.floor(x), Math.floor(y + SEA.feet), Math.floor(z))) {
            sea.stranded = true;
            sea.strandLook = 0;
            sea.speed = 0;
            return;
        }
        if (--sea.recheck <= 0) {
            sea.recheck = SEA.recheck;
            sea.cellsOk = false;
            sea.badTotal = Infinity;
            this.seaAnimalsFits(sea, x, y, z, sea.heading + sea.flip);
            this.seaAnimalsLookColumn(sea, x, y, z);
        }
        // What the last steps were refused, and they may try again.
        const heldMove = sea.heldMove;
        const heldTurn = sea.heldTurn;
        sea.holdMove = sea.holdTurn = sea.holdRise = sea.heldMove = sea.heldTurn = false;

        const home = data.home;
        const homeX = home.x - x;
        const homeZ = home.z - z;
        const homeDistance = Math.hypot(homeX, homeZ);
        const toHome = Math.atan2(homeZ, homeX);

        // Where it would go, and how fast (in times its cruising speed).
        let desired = sea.wander;
        let pace = 1;
        let wandering = false;
        sea.hunting = false;
        if (sea.curl > 0) {
            pace = 0;
            desired = sea.heading;
        } else if (sea.flee > 0) {
            desired = sea.fleeHeading;
            pace = SEA.burst;
        } else if (this.seaAnimalsHunts(mob, sea, player, homeDistance)) {
            sea.hunting = true;
            sea.prey = null;
            pace = this.seaAnimalsAim(sea, x, z, player.x, player.z, (info.chaseSpeed || sea.cruise * SEA.chase) / sea.cruise);
            desired = sea.aim;
            // Just after a bite it swims on past them for a moment, and then turns back.
            if (sea.pass > 0) {
                desired = sea.heading;
                pace = (info.chaseSpeed || sea.cruise * SEA.chase) / sea.cruise;
            }
        } else if (this.seaAnimalsStalks(mob, sea, homeDistance)) {
            pace = this.seaAnimalsAim(sea, x, z, sea.prey.position.x, sea.prey.position.z, ((info.chaseSpeed || sea.cruise * SEA.chase) / sea.cruise) * SEA.preyPace);
            desired = sea.aim;
        } else if (homeDistance > sea.range) {
            desired = sea.wander = toHome;
        } else {
            wandering = true;
            sea.wanderTimer -= sea.every;
            if (sea.wanderTimer <= 0) {
                // A new stretch: straight on, or a long curve to one side, after a turn of the head.
                sea.wanderTimer = 5 + Math.random() * 7;
                sea.arc = Math.random() < 0.3 ? 0 : (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.3) * sea.turnRate;
                sea.wander += (Math.random() - 0.5) * 1.6;
            }
            sea.wander += sea.arc * sea.every;
            // Far from home it leans back towards it, more the farther it is.
            const far = homeDistance / sea.range - 0.5;
            if (far > 0) sea.wander += seaClamp(seaAngle(toHome - sea.wander), -0.7 * far, 0.7 * far);
            desired = sea.wander;
            if (sea.idle > 0) {
                sea.restTimer -= sea.every;
                if (sea.restTimer <= 0) {
                    sea.resting = !sea.resting;
                    const go = 3 + Math.random() * 5;
                    sea.restTimer = sea.resting ? go * (sea.idle / (1 - sea.idle)) * (0.6 + Math.random() * 0.8) : go;
                }
                if (sea.resting) pace = 0;
            }
            if (sea.gulp > 0) pace *= 0.25;
            else if (sea.gasp) pace *= 0.7;
        }

        // How deep.
        if (sea.curl > 0 || sea.bed) {
            sea.depth = sea.lo;
        } else if (sea.hunting) {
            sea.depth = player.y - 0.9 - body.height / 2;
        } else if (sea.prey) {
            sea.depth = sea.prey.position.y + (sea.prey.userData.sea.body.height - body.height) / 2;
        } else if (sea.gasp) {
            sea.depth = sea.hi;
        } else {
            sea.levelTimer -= sea.every;
            if (sea.levelTimer <= 0) {
                sea.levelTimer = 6 + Math.random() * 8;
                sea.levelDrift = (Math.random() - 0.5) * 0.44;
            }
            sea.depth = sea.lo + (sea.hi - sea.lo) * seaClamp(sea.level + sea.levelDrift, 0.04, 0.96);
        }
        // Over a step of the bed, for as long as it is going and the step is still ahead of it: once it is
        // on it, behind it or off to one side, or it stops, it goes back to its own depth.
        if (sea.liftFor > 0) {
            sea.liftFor -= sea.every;
            const stepX = sea.liftX + 0.5 - x;
            const stepZ = sea.liftZ + 0.5 - z;
            const along = stepX * Math.cos(sea.heading) + stepZ * Math.sin(sea.heading);
            const across = Math.abs(stepZ * Math.cos(sea.heading) - stepX * Math.sin(sea.heading));
            if (pace === 0 || along < -0.2 || across > body.half + 0.8 || sea.lo >= sea.lift - 0.01) sea.liftFor = 0;
            else sea.depth = Math.max(sea.depth, sea.lift);
        }

        // Backing out of a place with no room to turn, and the wait after it.
        if (sea.backFor > 0 || sea.pause > 0) {
            if (sea.backFor > 0) {
                sea.backFor -= sea.every;
                sea.targetSpeed = -0.35 * sea.cruise;
                if (sea.backFor <= 0 || heldMove) {
                    sea.backFor = 0;
                    // (A long body, which has no room to wait in, only draws breath.)
                    sea.pause = sea.long ? 0.3 + Math.random() * 0.3 : 1.5 + Math.random() * 2;
                }
            } else {
                sea.pause -= sea.every;
                sea.targetSpeed = 0;
            }
            sea.steer = sea.heading;
            return;
        }

        // Still, by its own choice (a rest, a ball): it stays as it is, and looks at nothing.
        if (pace === 0) {
            sea.targetSpeed = 0;
            sea.steer = sea.heading;
            sea.shut = 0;
            return;
        }

        // Is the way open? It looks as far as it needs to turn round at the speed it means to go.
        const speed = sea.cruise * Math.max(pace, 0.4);
        const look = Math.max(0.5, speed / sea.turnRate + body.half + speed * 0.3 + 0.3);
        const probeY = sea.liftFor > 0 ? Math.max(y, Math.min(sea.lift, sea.hi)) : y;
        // (One of its sides every other look: the left, nothing, the right, nothing.)
        sea.whisker = (sea.whisker + 1) & 3;
        let ahead = this.seaAnimalsProbe(sea, x, probeY, z, sea.heading, look, sea.whisker === 0 ? 1 : sea.whisker === 2 ? -1 : 0);
        if (ahead < look && SEA_PROBE.step !== null && SEA_PROBE.step <= Math.max(sea.lo, sea.hi) + 0.001) {
            // A step of the bed: nothing to turn away from. It goes over it, rising when it is near enough
            // to be up by the time it gets there.
            if (ahead <= speed / sea.climb + 0.05) {
                sea.lift = SEA_PROBE.step;
                sea.liftX = SEA_PROBE.x;
                sea.liftZ = SEA_PROBE.z;
                sea.liftFor = 4;
                sea.depth = Math.max(sea.depth, sea.lift);
            }
            ahead = look;
        }
        // Open ahead, and yet its last steps were refused: its sides do not fit. As good as closed. (Not
        // while it rises over a step: until it is up, the step is what refuses.)
        if (heldMove && ahead >= look * 0.5 && sea.targetSpeed > 0 && sea.liftFor <= 0) sea.pinch = SEA.pinchFor;
        if (sea.pinch > 0) {
            sea.pinch -= sea.every;
            ahead = 0;
        }

        let open = ahead >= look;
        if (Math.abs(seaAngle(desired - sea.heading)) > 0.3) {
            open = this.seaAnimalsProbe(sea, x, probeY, z, desired, look, 0) >= look * 0.8;
        }
        sea.sideTimer -= sea.every;
        if (open) {
            sea.steer = desired;
            sea.jam = 0;
            sea.shut = 0;
            if (sea.sideTimer <= 0) sea.side = 0;
        } else if (ahead >= look) {
            // Closed where it wants to go and open where it is going: straight on, and that is its way now.
            sea.steer = sea.heading;
            if (wandering) sea.wander = sea.heading;
            sea.jam = 0;
            sea.shut = 0;
        } else {
            // In a pool hardly bigger than itself the way is never open: it would turn about for ever.
            // Every so often it gives up for a moment and hangs where it is, then tries the other way round.
            // (A long body does not hang still: it goes on circling slowly.)
            sea.shut += sea.every;
            if (wandering && sea.shut > sea.shutFor && sea.long) {
                sea.shut = 0;
                sea.shutFor = 8 + Math.random() * 10;
                sea.side = Math.random() < 0.5 ? -sea.side : sea.side;
                sea.sideTimer = SEA.sideFor;
            } else if (wandering && sea.shut > sea.shutFor) {
                sea.shut = 0;
                sea.shutFor = 8 + Math.random() * 10;
                sea.pause = 2.5 + Math.random() * 3.5;
                sea.side = Math.random() < 0.5 ? -sea.side : sea.side;
                sea.sideTimer = SEA.sideFor;
                sea.targetSpeed = 0;
                sea.steer = sea.heading;
                return;
            }
            // Closed ahead: it turns to one side until the way opens, and keeps to that side for a while.
            if (sea.side === 0 || sea.sideTimer <= 0) {
                const left = this.seaAnimalsProbe(sea, x, probeY, z, sea.heading + 0.9, look, 0);
                const right = this.seaAnimalsProbe(sea, x, probeY, z, sea.heading - 0.9, look, 0);
                if (Math.abs(left - right) > 0.3) sea.side = left > right ? 1 : -1;
                else if (homeDistance > 1) sea.side = seaAngle(toHome - sea.heading) >= 0 ? 1 : -1;
                else sea.side = Math.random() < 0.5 ? 1 : -1;
                sea.sideTimer = SEA.sideFor + Math.random() * 2;
            }
            // Its turns are refused too: the other side, and with neither, back.
            if (heldTurn) {
                sea.jam += sea.every;
                if (sea.jam > SEA.jam) {
                    sea.jam = 0;
                    sea.side = -sea.side;
                    sea.sideTimer = SEA.sideFor;
                    if (++sea.jams >= 2) {
                        sea.jams = 0;
                        sea.backFor = SEA.backFor;
                    }
                }
            }
            sea.steer = sea.heading + sea.side * 1.1;
            if (wandering) sea.wander = sea.steer;
        }

        const room = seaClamp(ahead / look, 0, 1);
        if (sea.long) {
            // A long body: the speed whose turn fits in the water ahead of it (the width of a turn is its
            // speed over its turn rate), and never less than a crawl.
            const fits = Math.max(0, ahead - body.half - 0.3) * sea.turnRate;
            sea.targetSpeed = Math.max(sea.cruise * SEA.crawl * Math.min(pace, 1), Math.min(sea.cruise * pace, fits));
        } else {
            sea.targetSpeed = sea.cruise * pace * (room < 0.08 ? 0 : 0.25 + 0.75 * room);
        }
    },

    // Where a hunter at (x, z) steers to get its mouth on what is at (tx, tz), into sea.aim, and how fast it
    // goes there, from `pace` (times its cruising speed). Its mouth is the end of its body, `lead` from its
    // middle, and sweeps a circle of that size when it turns on the spot. So: it steers its mouth at it;
    // close and off to one side, it slows down nearly to a stop and turns in, its mouth sweeping round on to
    // it (at full speed it could only circle it at the width of its turn, its mouth just out of reach); and
    // with it nearer its middle than its mouth can reach that way (alongside it), straight on for a moment,
    // to come round.
    seaAnimalsAim(sea, x, z, tx, tz, pace) {
        const distance = Math.hypot(tx - x, tz - z);
        sea.aim = Math.atan2(tz - z - Math.sin(sea.heading) * sea.lead, tx - x - Math.cos(sea.heading) * sea.lead);
        if (distance < sea.lead - sea.biteReach * 0.5) {
            sea.aim = sea.heading;
            return pace * 0.6;
        }
        const off = Math.abs(seaAngle(sea.aim - sea.heading));
        const turnWidth = (sea.cruise * pace) / (sea.turnRate * SEA.fastTurn);
        if (off > 0.4 && distance - sea.lead < turnWidth * 2) return pace * seaClamp(Math.cos(off), SEA.closeIn, 1);
        return pace;
    },

    // Whether a hostile one goes after one of the small animals of its water now (into sea.prey): the one it
    // was after, while it is near and in this game, or else, a few times a second, the nearest of those less
    // than SEA.preyShare of its length, peaceful and within SEA.preyDistance of it. Not within a while of
    // its last snap, nor so far from its home that it would be another animal for everybody else.
    seaAnimalsStalks(mob, sea, homeDistance) {
        sea.preyRest -= sea.every;
        if (!sea.info.hostile || sea.preyRest > 0 || homeDistance > sea.range + SEA.preyDistance) {
            sea.prey = null;
            return false;
        }
        const position = mob.position;
        const prey = sea.prey;
        if (prey && prey.parent && !prey.userData.sea.stranded
            && Math.hypot(prey.position.x - position.x, prey.position.z - position.z) < SEA.preyDistance * 1.5) return true;
        sea.prey = null;
        const swimmers = this.seaAnimalsSwimmers;
        let nearest = SEA.preyDistance;
        for (let i = swimmers.length - 1; i >= 0; i--) {
            const other = swimmers[i];
            if (!other.parent) {
                swimmers.splice(i, 1);
                continue;
            }
            const them = other.userData.sea;
            if (other === mob || them.info.hostile || them.stranded || them.body.length >= sea.body.length * SEA.preyShare) continue;
            const distance = Math.hypot(other.position.x - position.x, other.position.y - position.y, other.position.z - position.z);
            if (distance < nearest) {
                nearest = distance;
                sea.prey = other;
            }
        }
        return sea.prey !== null;
    },

    // Its mouth on the animal it is after: a snap, and the other darts away (or rolls up). Then it leaves
    // them alone for a while. Every frame while it is after one, and only then.
    seaAnimalsSnap(mob, sea) {
        const prey = sea.prey;
        const them = prey.userData.sea;
        const position = mob.position;
        const mouthX = position.x + Math.cos(sea.heading) * sea.lead;
        const mouthZ = position.z + Math.sin(sea.heading) * sea.lead;
        const mouthY = position.y + sea.body.height / 2;
        const reach = sea.biteReach * 0.6 + them.body.half;
        if (Math.hypot(prey.position.x - mouthX, prey.position.y + them.body.height / 2 - mouthY, prey.position.z - mouthZ) > reach) return;
        sea.bite = 0.45;
        sea.prey = null;
        sea.preyRest = SEA.preyRest * (1 + Math.random() * 0.5);
        this.seaAnimalsStartle(prey, them, position.x, position.z);
        this.playNoiseBurst({ duration: 0.05, volume: 0.02, highpass: 400, lowpass: 2400 });
    },

    // Whether a hostile one goes for the player now: only one who is in the water, within its sight, and
    // not so far from its home that it would be another animal for everybody else.
    seaAnimalsHunts(mob, sea, player, homeDistance) {
        const info = sea.info;
        if (!mob.userData.hostile || this.titleScreenOpen || this.respawnPending || !this.cameraController.isInWater) return false;
        const reach = info.chaseDistance || SEA.chaseDistance;
        if (homeDistance > sea.range + reach) return false;
        const position = mob.position;
        return Math.hypot(player.x - position.x, player.y - 0.9 - position.y, player.z - position.z) < reach;
    },

    // Its mouth on the player: the end of its body that goes first.
    seaAnimalsBite(mob, sea, player) {
        const data = mob.userData;
        if (data.attackCooldown > 0 || !this.cameraController.isInWater) return;
        const position = mob.position;
        const mouthX = position.x + Math.cos(sea.heading) * sea.lead;
        const mouthZ = position.z + Math.sin(sea.heading) * sea.lead;
        const mouthY = position.y + sea.body.height / 2;
        // The player's body, from the feet to the eyes.
        const nearestY = seaClamp(mouthY, player.y - 1.6, player.y);
        if (Math.hypot(player.x - mouthX, nearestY - mouthY, player.z - mouthZ) > sea.biteReach) return;
        data.attackCooldown = SEA.biteEvery;
        sea.bite = 0.45;
        sea.pass = SEA.pass;
        this.applyDamage(sea.info.attackDamage || 1, `You were bitten by ${/^[aeiou]/.test(data.species) ? 'an' : 'a'} ${data.species.replace(/_/g, ' ')}`, 'mob', position);
        this.playNoiseBurst({ duration: 0.07, volume: 0.03, highpass: 200, lowpass: 1400 });
    },

    // One that breathes air: now and then up to the surface, its head out for a moment, and down again.
    seaAnimalsBreathe(mob, sea, delta, player) {
        if (sea.breathEvery) {
            const position = mob.position;
            if (sea.gulp > 0) {
                sea.gulp -= delta;
                if (sea.gulp <= 0) {
                    sea.gasp = false;
                    sea.breath = sea.breathEvery[0] + Math.random() * (sea.breathEvery[1] - sea.breathEvery[0]);
                }
            } else if (sea.gasp) {
                sea.gaspFor += delta;
                if (sea.air && position.y >= sea.hi - 0.1) {
                    sea.gulp = SEA.gulp;
                    this.seaAnimalsSplash(mob, sea, player);
                } else if (sea.gaspFor > SEA.breathWait) {
                    // Something is over the water: later.
                    sea.gasp = false;
                    sea.breath = 10 + Math.random() * 10;
                }
            } else {
                sea.breath -= delta;
                if (sea.breath <= 0 && sea.flee <= 0 && sea.curl <= 0 && !sea.hunting) {
                    sea.gasp = true;
                    sea.gaspFor = 0;
                }
            }
        }
        sea.rise += ((sea.gulp > 0 ? 1 : 0) - sea.rise) * Math.min(1, delta * 2.2);
    },

    // Its head breaks the surface: rings on the water, a few drops and a puff of breath for who is near.
    seaAnimalsSplash(mob, sea, player) {
        const position = mob.position;
        const x = position.x + Math.cos(sea.heading) * sea.lead * 0.8;
        const z = position.z + Math.sin(sea.heading) * sea.lead * 0.8;
        const distance = Math.hypot(x - player.x, sea.surface - player.y, z - player.z);
        if (distance > 32) return;
        this.world.addRipple(x, z, 0.5);
        if (distance > 24) return;
        this.spawnSplash(x, sea.surface, z, 0.12);
        this.playNoiseBurst({ duration: 0.5, volume: 0.03 * (1 - distance / 24), highpass: 900, lowpass: 3600 });
    },

    // One frame of swimming: it turns towards where it steers, gains or loses speed, rises or sinks, and
    // takes of that what its body is allowed (seaAnimalsFits). What is refused waits for the next look.
    seaAnimalsMove(mob, sea, delta) {
        const position = mob.position;
        const info = sea.info;
        const fast = sea.flee > 0 || sea.hunting;

        // An ammonite does not swim: it squirts, coasts and squirts again.
        let drive = sea.targetSpeed;
        if (info.seaJet) {
            sea.thrust *= Math.exp(-delta * 2.4);
            sea.pulse -= delta;
            if (sea.pulse <= 0 && drive > 0) {
                sea.pulse = fast ? 0.55 : 1.3 + Math.random() * 1.2;
                sea.thrust = 1;
            }
            drive *= 0.12 + 1.9 * sea.thrust;
        }
        if (sea.holdMove) drive = 0;
        sea.speed += (drive - sea.speed) * Math.min(1, delta * (info.seaJet ? 9 : Math.abs(drive) > Math.abs(sea.speed) ? 2.2 : 3.5));
        const step = sea.holdMove ? 0 : sea.speed * delta;

        let turn = 0;
        if (!sea.holdTurn) {
            const most = sea.turnRate * (fast ? SEA.fastTurn : 1) * delta;
            turn = seaClamp(seaAngle(sea.steer - sea.heading), -most, most);
        }

        const top = Math.max(sea.lo, sea.hi);
        let rise = 0;
        if (!sea.holdRise) {
            const goal = seaClamp(sea.depth, sea.lo, top);
            rise = seaClamp((goal - position.y) * 2, -sea.sink, sea.climb * (fast ? 1.6 : 1)) * delta;
        }

        const x0 = position.x;
        const y0 = position.y;
        const z0 = position.z;
        const h0 = sea.heading;
        const h1 = h0 + turn;
        const x1 = x0 + Math.cos(h1) * step;
        const z1 = z0 + Math.sin(h1) * step;
        const y1 = Math.min(y0 + rise, Math.max(top, y0));
        const flip = sea.flip;
        if (this.seaAnimalsFits(sea, x1, y1, z1, h1 + flip)) {
            position.set(x1, y1, z1);
            sea.heading = h1;
        } else if (step !== 0 && this.seaAnimalsFits(sea, x0, y1, z0, h1 + flip)) {
            // The step is what did not fit.
            position.y = y1;
            sea.heading = h1;
            sea.holdMove = sea.heldMove = true;
        } else if (turn !== 0 && this.seaAnimalsFits(sea, x0 + Math.cos(h0) * step, y1, z0 + Math.sin(h0) * step, h0 + flip)) {
            // The turn.
            position.set(x0 + Math.cos(h0) * step, y1, z0 + Math.sin(h0) * step);
            sea.holdTurn = sea.heldTurn = true;
        } else if (rise !== 0 && this.seaAnimalsFits(sea, x1, y0, z1, h1 + flip)) {
            // The rise.
            position.set(x1, y0, z1);
            sea.heading = h1;
            sea.holdRise = true;
        } else {
            // Two of them, or all: one thing at a time until the next look.
            sea.holdMove = sea.heldMove = true;
            if (turn !== 0 && this.seaAnimalsFits(sea, x0, y0, z0, h1 + flip)) {
                sea.heading = h1;
                sea.holdRise = true;
            } else if (rise !== 0 && this.seaAnimalsFits(sea, x0, y1, z0, h0 + flip)) {
                position.y = y1;
                sea.holdTurn = sea.heldTurn = true;
            } else {
                sea.holdRise = true;
                sea.holdTurn = sea.heldTurn = turn !== 0;
            }
        }
        if (sea.holdMove) sea.speed = 0;

        // Another column: its bed and its surface.
        if (Math.floor(position.x) !== sea.columnX || Math.floor(position.z) !== sea.columnZ) {
            this.seaAnimalsLookColumn(sea, position.x, position.y, position.z);
        }
        if (delta > 0) {
            const ease = Math.min(1, delta * 5);
            sea.vy += ((position.y - y0) / delta - sea.vy) * ease;
            sea.turning += (seaAngle(sea.heading - h0) / delta - sea.turning) * ease;
        }
    },

    // With no water where it is: it sinks to the ground and lies there. Twice a second it looks whether
    // the water is back, where it is or in a cell next to it, and goes in.
    seaAnimalsAshore(mob, sea, delta) {
        const position = mob.position;
        sea.speed = 0;
        sea.vy = 0;
        sea.turning = 0;
        sea.hunting = false;
        sea.strandLook -= delta;
        if (sea.strandLook <= 0) {
            sea.strandLook = 0.5;
            const bx = Math.floor(position.x);
            const by = Math.floor(position.y + SEA.feet);
            const bz = Math.floor(position.z);
            // Its own cell, the one under it, the four beside it and the four beside and under it.
            for (let i = 0; i < 10; i++) {
                const dx = i < 2 ? 0 : i < 6 ? (i % 2 ? 1 : -1) * (i < 4 ? 1 : 0) : (i % 2 ? 1 : -1) * (i < 8 ? 1 : 0);
                const dz = i < 2 ? 0 : i < 6 ? (i % 2 ? 1 : -1) * (i < 4 ? 0 : 1) : (i % 2 ? 1 : -1) * (i < 8 ? 0 : 1);
                const dy = i === 0 ? 0 : i === 1 ? -1 : i < 6 ? 0 : -1;
                const x = dx === 0 ? position.x : bx + dx + 0.5;
                const z = dz === 0 ? position.z : bz + dz + 0.5;
                if (!this.seaAnimalsColumn(sea.body, x, by + dy, z)) continue;
                // In at the height it lies at, as far as that water lets it: it swims to its own depth from there.
                position.set(x, seaClamp(position.y, SEA_COLUMN.lo, Math.max(SEA_COLUMN.lo, SEA_COLUMN.hi)), z);
                sea.stranded = false;
                sea.cellsOk = false;
                sea.badTotal = Infinity;
                sea.sense = 0;
                sea.recheck = 0;
                this.seaAnimalsLookColumn(sea, position.x, position.y, position.z);
                this.world.addRipple(x, z, 0.3);
                return;
            }
            sea.floor = this.cameraController.getFloorY(position.x, position.z, position.y + 0.5);
        }
        if (sea.floor > -20 && position.y > sea.floor) position.y = Math.max(sea.floor, position.y - 5 * delta);
    },

    // ---- Struck -------------------------------------------------------------------------

    seaAnimalsStruck(mob) {
        const data = mob.userData;
        const sea = data.sea || this.seaAnimalsState(mob);
        const info = sea.info;
        const lethal = this.damageMobByPlayer(mob);
        this.playTone({ frequency: info.tone || 300, endFrequency: (info.tone || 300) * 0.7, duration: 0.09, type: 'triangle', volume: 0.016, release: 0.08 });
        this.playNoiseBurst({ duration: 0.09, volume: 0.02, highpass: 150, lowpass: 1100 });
        if (lethal) {
            this.world.addRipple(mob.position.x, mob.position.z, 0.5);
            this.defeatMobByPlayer(mob, gameText(SEA_TEXT.defeated)(this.seaAnimalsName(data.species)));
            return;
        }
        this.seaAnimalsStartle(mob, sea, this.camera.position.x, this.camera.position.z);
    },

    // Frightened by something at (fromX, fromZ), a player's blow or a hunter's snap: whatever it was doing,
    // that is over (its rest, its backing out of a corner, its own hunt). Away from there is where it goes,
    // now or when it comes out of its ball. A ball is not frightened again.
    seaAnimalsStartle(mob, sea, fromX, fromZ) {
        if (sea.curl > 0) return;
        sea.resting = false;
        sea.backFor = 0;
        sea.pause = 0;
        sea.sense = 0;
        sea.prey = null;
        sea.fleeHeading = Math.atan2(mob.position.z - fromZ, mob.position.x - fromX);
        sea.wander = sea.fleeHeading;
        if (!sea.stranded && sea.info.seaCurl && Math.random() < sea.info.seaCurl) {
            sea.curl = 3 + Math.random() * 2.5;
            return;
        }
        sea.flee = SEA.fleeTime;
        sea.pulse = 0;
    },

    // ---- How it looks -------------------------------------------------------------------

    // Its body turned the way it goes, tilted as it rises and leaning into its turns, and its rig moved by
    // what it is doing: flippers and tail by its speed, its neck by its turns and its breath.
    seaAnimalsAnimate(mob, sea, delta) {
        const data = mob.userData;
        const info = sea.info;
        const parts = data.modelParts || {};
        const root = data.modelRoot;
        if (sea.rigRoot !== root) {
            // A new model (the first, or one rebuilt for another graphics mode): its neck and its jaw again.
            sea.rigRoot = root;
            sea.neck.length = 0;
            for (let i = 0; parts[`neck${i}`]; i++) sea.neck.push(parts[`neck${i}`]);
            sea.jaw = parts.jaw || null;
        }
        const follow = Math.min(1, delta * 4);
        const effort = Math.min(2.2, Math.abs(sea.speed) / sea.cruise);
        const life = data.life;
        const ball = sea.ball;
        const still = 1 - ball;
        const jet = Boolean(info.seaJet);
        sea.ashore += ((sea.stranded ? 1 : 0) - sea.ashore) * follow;
        sea.stroke += delta * sea.strokeRate * (jet ? 1 : 0.3 + 0.7 * effort) * (sea.stranded ? 0.4 : 1);
        data.stepPhase = sea.stroke;
        const stroke = sea.stroke;

        // The whole body.
        const forward = jet ? -1 : 1;
        const climb = sea.bed ? 0 : seaClamp(Math.atan2(sea.vy, Math.max(Math.abs(sea.speed), 0.35)), -0.5, 0.5);
        sea.pitch += (climb * (jet ? 0.4 : 1) - sea.pitch) * follow;
        sea.roll += (seaClamp(sea.turning * (jet || sea.bed ? 0 : 0.45), -0.35, 0.35) - sea.roll) * follow;
        sea.bend += (seaClamp(seaAngle(sea.steer - sea.heading) * 0.5 + sea.turning * 0.5, -0.8, 0.8) - sea.bend) * Math.min(1, delta * 2.5);
        mob.rotation.y = Math.PI / 2 - (sea.heading + sea.flip);
        mob.rotation.x = -sea.pitch * forward;
        // On the ground it lies tipped to one side, heaving: a narrow one right over, a broad one a little.
        mob.rotation.z = sea.roll + sea.ashore * (Math.min(0.5, 0.2 / sea.body.half) + Math.sin(life * 2.3) * 0.04);
        if (root) {
            const glide = data.wings.length ? 1 : 0;
            // A flipper swimmer heaves with each stroke; a tail swimmer swings its body against its tail;
            // an ammonite bobs where it hangs and rocks after each spurt; a walker waddles.
            // (A ball is lifted by its own roundness, and tipped so that it closes underneath.)
            root.position.y = (-Math.cos(stroke) * 0.035 * glide * Math.min(effort, 1.5) + (jet ? Math.sin(life * 1.3) * 0.05 : 0)) * still + ball * sea.body.length * 0.25;
            root.rotation.y = data.tail.length && !glide && !sea.bed ? -Math.sin(stroke) * 0.05 * effort * still : 0;
            root.rotation.x = (jet ? Math.sin(life * 2.1) * 0.07 + sea.thrust * 0.22 : 0) * still + ball * 0.5;
            root.rotation.z = sea.bed ? Math.sin(stroke * 0.5) * 0.04 * Math.min(effort, 1) * still : 0;
        }

        // Flippers: an up and down stroke, the blade turning to bite the water, the hind pair a little
        // after the front one. A row of more than two pairs (the flaps of an anomalocaris) beats as a wave
        // that runs from the front pair to the last.
        const wings = data.wings;
        const reach = 0.16 + 0.3 * Math.min(effort, 1.6);
        const lag = wings.length > 4 ? 0.7 : 1.7;
        for (let i = 0; i < wings.length; i++) {
            const flipper = wings[i];
            const base = flipper.userData.baseRotation;
            const side = i % 2 === 0 ? 1 : -1;
            const phase = stroke - (i >> 1) * lag;
            flipper.rotation.z = base.z + side * Math.sin(phase) * reach;
            flipper.rotation.x = base.x - Math.cos(phase) * (0.12 + 0.2 * Math.min(effort, 1.6));
            flipper.rotation.y = base.y + side * Math.sin(phase + 0.9) * 0.1;
        }

        // The tail: a wave down it when it swims, and what rolls up when it makes a ball.
        const tail = data.tail;
        const sway = (0.05 + 0.13 * Math.min(effort, 1.6)) * (sea.bed ? 0.4 : 1) * still;
        const curl = tail.length ? (ball * 2.5) / tail.length : 0;
        for (let i = 0; i < tail.length; i++) {
            const segment = tail[i];
            const base = segment.userData.baseRotation;
            segment.rotation.y = base.y + Math.sin(stroke - i * 0.8) * sway;
            segment.rotation.x = base.x - curl;
        }

        // Little legs: a wave from the front pair to the last, left and right out of step; tucked in a ball.
        const legs = data.legs;
        const gait = Math.min(effort, 1.3) * still;
        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            const base = leg.userData.baseRotation;
            const side = i % 2 === 0 ? 1 : -1;
            leg.rotation.x = base.x + Math.sin(stroke * 3 - (i >> 1) * 0.9 + (i % 2) * Math.PI) * 0.5 * gait;
            leg.rotation.z = base.z - side * ball * 0.9;
        }

        // Tentacles: they open and wave while it hangs, and trail together when it squirts. (And the feelers
        // of one that rolls up fold under it.)
        const arms = data.arms;
        const open = 1 - 0.7 * Math.min(1, sea.thrust * 1.4);
        for (let i = 0; i < arms.length; i++) {
            const arm = arms[i];
            const base = arm.userData.baseRotation;
            arm.rotation.x = base.x * open + Math.sin(life * 1.7 + i * 1.3) * 0.12 * open * still + ball * 1.4;
            arm.rotation.y = base.y * open + Math.cos(life * 1.3 + i * 2.1) * 0.12 * open;
        }

        // The neck: it bends into the turn before the body does, and lifts the head out to breathe.
        const neck = sea.neck;
        for (let i = 0; i < neck.length; i++) {
            const joint = neck[i];
            const base = joint.userData.baseRotation;
            joint.rotation.y = base.y - sea.bend / neck.length + Math.sin(life * 0.7 + i * 0.6) * 0.035;
            joint.rotation.x = base.x - (sea.rise * 0.9) / neck.length + sea.pitch * (0.5 / neck.length) + Math.sin(life * 0.5 + i * 0.5) * 0.02;
        }
        const head = data.head;
        if (head) {
            const base = head.userData.baseRotation;
            // With a neck, the head stays level while the neck lifts it; with none, it is what lifts.
            head.rotation.x = base.x + (neck.length ? sea.rise * 0.6 : -sea.rise * 0.6) + ball * 0.9;
            head.rotation.y = base.y - sea.bend * (neck.length ? 0.2 : 0.35) + Math.sin(life * 0.6) * 0.06 * still;
        }
        if (sea.jaw) {
            const gape = Math.max(sea.bite > 0 ? Math.sin((sea.bite / 0.45) * Math.PI) : 0, sea.rise * (0.35 + Math.sin(life * 3) * 0.15));
            sea.jaw.rotation.x = sea.jaw.userData.baseRotation.x + gape * 0.55;
        }
    }
});
