// Animals the server keeps (pkg/network/animals.go, which says the whole of it). Wild animals live in
// this browser and nobody else sees them. A kept animal is one that matters to somebody: a tamed one, its
// babies, one that a machine revived. The server knows that it exists, where, in what mode and whose it
// is, and tells every client near it; this file gives it a body here: an ordinary mob (createMob, in
// ambientMobs, never `natural`), walked by the code and the collision every mob has.
//
// - What the server says comes in binary frames ('animalData', read by animalsReadFrame): the animals new
//   to this client, what has changed of those it knows, and those that are gone for it. A body is made
//   when the chunk under it has arrived, and taken away when the server says so. A new connection forgets
//   them all: the server tells again.
// - An animal of this player's (tamed here, js/game/taming.js) is walked here as it always was: it
//   follows, sits, breeds and is ridden by the code of taming.js, herd.js and riding.js. This file only
//   tells the server: animalKeep when it is tamed or born (animalAdopt when it was a kept animal with no
//   owner), and animalSet when it sits, follows, is ridden, heals, grows or changes its genes
//   (animalsOwnerSync, called by taming.js when it would have saved to the browser). Nothing is said while
//   nothing happens.
// - Everybody else's: a goal for the mob to walk to (registerMobGoal), and never a step by itself.
//     roam    where the server sent it, then it stands. When it stops somewhere else (something in its
//             way for a second, or a floor higher or lower) the server is told once, animalAt, after a wait
//             of its own so that one client of all that see it says so: the server takes the first.
//     stay    its place.
//     follow  towards the avatar of its owner, a few steps away, and next to it when left far behind.
//     ridden  hidden: its rider's avatar already carries the mount (js/game/riding.js).
//     chase   it runs at the player the server says it is after, the same one on every client: at this
//             player (and then it is `hostile` here, which is all mobs.js needs to have it chase and bite
//             as a wild one does) or at the avatar of another, where it hurts nobody. Out of this mode
//             a kept hostile animal is as peaceful as any other on its walk: it never picks whom to go
//             after by itself, or each client would see it run at its own player.
//   A species whose movement does not walk to goals (`walksToGoal`, js/extensions.js) only exists: it lives
//   around its home by its own behaviour, and a hostile one of those goes after whoever is here, as a wild one.
// - Its health is the server's: a blow is told (animalHurt) and everybody sees the same bar. Whoever
//   strikes the last one defeats it here as any mob (loot, bestiary) and it is gone for all (animalGone),
//   as is one that leaves the scene for any other reason (a cage collected). Somebody else's animal is not
//   struck, tamed or ridden, nor one with no owner inside a plot that is not the player's: the server
//   refuses anyway, and tells the animal again so this copy is put right.
// - /animal <species> [blocks] in creative mode asks the server for one that roams, next to the player.
//
// What marks a kept mob, for the other features (all unset on a wild one):
//   userData.animalId         its number on the server
//   userData.animalMine       it is this player's, walked here
//   userData.animalForeign    it is not: nothing here decides where it goes, and it is no pet of this player
//   userData.animalOwnerName  whose it is (null: nobody's)
// And of one that the server walks, `userData.hostile` is true only while it is after this player.
// Mixed into Game.prototype; `this` is the Game instance.

const ANIMALS_MODE = { roam: 0, stay: 1, follow: 2, ridden: 3, chase: 4 };

const ANIMALS = {
    arrive: 0.35, // this close to where it was sent, it is there
    agree: 1, // further than this from there when it stops, or this much higher or lower, and the server is told
    blockedAfter: 1, // seconds without getting nearer: something is in its way
    reportWait: 0.4, // seconds before saying so...
    reportSpread: 2, // ...and up to these more, different for each client
    followStop: 0.5,
    followFar: 20, // a follower this far from its owner's avatar is put next to it (as taming.js does here)
    chaseStop: 0.8, // a copy that runs at somebody else's avatar stops this close to it
    retryEvery: 0.5, // seconds between two looks at the animals whose chunk has not arrived
    summonRadius: 8
};

const ANIMALS_TEXT = {
    owned: { ES: (owner) => `Este animal es de ${owner}`, EN: (owner) => `This animal belongs to ${owner}` },
    ownedAway: { ES: () => 'Este animal ya tiene dueño', EN: () => 'This animal has an owner already' },
    notTamed: { ES: () => 'Antes tienes que domesticarlo', EN: () => 'You have to tame it first' },
    full: {
        ES: () => 'El servidor ya guarda todos los animales tuyos que puede: este vive solo en este navegador',
        EN: () => 'The server keeps as many animals of yours as it can: this one lives in this browser only'
    },
    left: { ES: () => 'El animal no se ha quedado contigo', EN: () => 'The animal did not stay with you' },
    summoned: { ES: (species) => `Ha aparecido un animal (${species}) que el servidor guarda`, EN: (species) => `Summoned a ${species} that the server keeps` },
    summonFailed: { ES: () => 'El servidor no ha podido crear ese animal aquí', EN: () => 'The server could not make that animal here' },
    summonUsage: { ES: (list) => `Uso: /animal <especie> [bloques]. Especies: ${list}`, EN: (list) => `Usage: /animal <species> [blocks]. Species: ${list}` },
    noGround: { ES: () => 'No hay suelo donde ponerlo', EN: () => 'There is no ground to put it on' }
};

function animalsLine(key, ...args) {
    return gameText(ANIMALS_TEXT[key])(...args);
}

// What the server has to be told of a species for an animal of it to go after players as its kind does
// (animalSpawnSpec in pkg/network/animals.go): from how many blocks, from how many by day when that is
// another distance, and how fast. All 0 for a peaceful species, and for one the server does not walk.
function animalsChaseOf(info) {
    if (!info || !info.hostile || !mobMovementIs(info.movement, 'walksToGoal')) return { chase: 0, chaseDay: 0, chaseSpeed: 0 };
    const chase = info.chaseDistance || MOB_CHASE_DISTANCE;
    return {
        chase,
        chaseDay: info.nocturnal ? Math.min(chase, MOB_CHASE_DISTANCE_BY_DAY) : 0,
        chaseSpeed: info.chaseSpeed || info.speed || 0
    };
}

let animalsDecoder = null;

// A frame of the server as plain objects: { fresh, changed, gone }. The format is documented once, in
// pkg/network/animals.go; places come in blocks, a walk in quarters of a block from the animal's home, as
// it has to be said back (animalAt).
function animalsReadFrame(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 4 || bytes[0] !== 77 || bytes[1] !== 67 || bytes[2] !== 65 || bytes[3] !== 49) throw new Error('animals: not a frame');
    let at = 4;
    const byte = () => {
        if (at >= bytes.length) throw new Error('animals: a frame cut short');
        return bytes[at++];
    };
    const uvarint = () => {
        let value = 0;
        let scale = 1;
        for (;;) {
            const next = byte();
            value += (next & 0x7f) * scale;
            if (next < 0x80) return value;
            scale *= 128;
        }
    };
    const varint = () => {
        const value = uvarint();
        return value % 2 === 1 ? -(value + 1) / 2 : value / 2;
    };
    const text = () => {
        const length = uvarint();
        if (at + length > bytes.length) throw new Error('animals: a frame cut short');
        animalsDecoder = animalsDecoder || new TextDecoder();
        const out = animalsDecoder.decode(bytes.subarray(at, at + length));
        at += length;
        return out;
    };
    const blocks = () => ({ x: varint() / 4, y: varint() / 4, z: varint() / 4 });
    const walk = () => ({ x: varint(), z: varint() });

    const frame = { fresh: [], changed: [], gone: [] };
    for (let left = uvarint(); left > 0; left--) {
        const entry = { id: uvarint(), species: text(), variant: byte(), mode: byte() };
        entry.target = entry.mode === ANIMALS_MODE.chase ? text() : '';
        const flags = byte();
        entry.home = blocks();
        entry.place = blocks();
        entry.hurt = uvarint();
        entry.walk = flags & 1 ? walk() : null;
        entry.owned = Boolean(flags & 2);
        entry.session = entry.owned ? text() : '';
        entry.ownerName = entry.owned ? text() : '';
        entry.extra = flags & 4 ? text() : '';
        entry.walked = Boolean(flags & 8);
        frame.fresh.push(entry);
    }
    for (let left = uvarint(); left > 0; left--) {
        const entry = { id: uvarint() };
        const says = byte();
        if (says & 1) entry.home = blocks();
        if (says & 2) entry.place = blocks();
        if (says & 4) entry.walk = walk();
        if (says & 8) {
            entry.mode = byte();
            entry.target = entry.mode === ANIMALS_MODE.chase ? text() : '';
        }
        if (says & 16) entry.hurt = uvarint();
        if (says & 32) {
            entry.session = text();
            entry.ownerName = text();
        }
        if (says & 64) entry.extra = text();
        frame.changed.push(entry);
    }
    for (let left = uvarint(); left > 0; left--) frame.gone.push(uvarint());
    if (at !== bytes.length) throw new Error('animals: bytes left over in a frame');
    return frame;
}

// What an animal's extra says, whoever wrote it: an object, or nothing.
function animalsExtra(text) {
    if (!text) return {};
    try {
        const extra = JSON.parse(text);
        return extra && typeof extra === 'object' && !Array.isArray(extra) ? extra : {};
    } catch (_error) {
        return {};
    }
}

// The place of a quarter of a block the server keeps for a coordinate.
function animalsSnap(value) {
    return Math.round(value * 4) / 4;
}

registerNetworkHandler('connected', function () { this.animalsForgetAll(); });
registerNetworkHandler('animalData', function (buffer) { this.animalsOnFrame(buffer); });
registerNetworkHandler('animalKept', function (payload) { this.animalsOnKept(payload || {}); });
registerNetworkHandler('animalRefused', function (payload) { this.animalsOnRefused(payload || {}); });
registerNetworkHandler('animalSummoned', function (payload) { this.animalsOnSummoned(payload || {}); });

// One look at a property for a wild mob, and no object made for any.
registerMobGoal(function (mob) {
    return mob.userData.animalForeign ? this.animalsGoal(mob) : null;
});

registerMobStrikeGuard(function (mob) {
    return this.animalsStrikeRefusal(mob);
});

registerFrameUpdate(function (delta) {
    this.animalsUpdate(delta);
});

onMobEvent('damaged', function (mob, damage) {
    this.animalsOnDamaged(mob, damage);
});

onMobEvent('removed', function (mob) {
    this.animalsOnRemoved(mob);
});

Object.assign(Game.prototype, {
    // A new connection knows nothing and is told everything again: every body made on the server's word
    // goes. What was tamed here and the server has not taken yet stays, and is offered again.
    animalsForgetAll() {
        this.animalsConnection = (this.animalsConnection || 0) + 1;
        if (this.animalsKnown) {
            for (const state of this.animalsKnown.values()) if (state.mob) this.animalsDropBody(state);
        }
        this.animalsKnown = new Map();
        this.animalsBodies = [];
        this.animalsWaiting = [];
        this.animalsRetry = 0;
        if (this.tamingStarted) this.tamingSaveSoon();
    },

    animalsOnFrame(buffer) {
        if (!this.animalsKnown) return;
        let frame;
        try {
            frame = animalsReadFrame(buffer);
        } catch (error) {
            console.warn(error.message);
            return;
        }
        for (const entry of frame.fresh) this.animalsNew(entry);
        for (const entry of frame.changed) this.animalsChange(entry);
        for (const id of frame.gone) this.animalsGone(id);
    },

    // Whether this player's own client walks the animal: it is theirs, and it has its body here.
    animalsOurs(state) {
        return state.mine && Boolean(state.mob) && Boolean(state.mob.userData.tamed);
    },

    animalsNew(entry) {
        let state = this.animalsKnown.get(entry.id);
        if (!state) {
            // Where each follower of one owner stands around the avatar: the same for everybody, by its number.
            const angle = entry.id * 2.399963;
            const reach = 2 + (entry.id % 4) * 0.7;
            state = {
                id: entry.id, species: entry.species, variant: entry.variant, mob: null, bodiless: false, hidden: false,
                mine: false, said: null, putRight: false, extraWorn: null, after: '',
                ringX: Math.cos(angle) * reach, ringZ: Math.sin(angle) * reach,
                targetX: 0, targetZ: 0, moving: false, best: Infinity, stall: 0, reportIn: 0, reported: false
            };
            this.animalsKnown.set(entry.id, state);
            this.animalsWaiting.push(state);
        }
        state.owned = entry.owned;
        state.session = entry.session;
        state.ownerName = entry.ownerName;
        this.animalsWhose(state);
        // Told again of one this client walks (it was just kept): what is known here stands, unless the
        // server refused something and this is how it really is.
        const ours = this.animalsOurs(state) && !state.putRight;
        if (!ours) {
            state.mode = entry.mode;
            state.after = entry.target;
            state.walked = entry.walked;
            state.homeX = entry.home.x;
            state.homeY = entry.home.y;
            state.homeZ = entry.home.z;
            state.x = entry.home.x + entry.place.x;
            state.y = entry.home.y + entry.place.y;
            state.z = entry.home.z + entry.place.z;
            state.hurt = entry.hurt;
            state.extra = entry.extra;
            state.walking = false;
            this.animalsRest(state);
            if (entry.walk) this.animalsWalk(state, entry.walk.x, entry.walk.z);
        }
        if (state.mob && !ours) this.animalsDress(state);
        else if (!state.mob) this.animalsMaterialize(state);
        // Told whole: whatever was to be put right has been.
        state.putRight = false;
    },

    animalsChange(entry) {
        const state = this.animalsKnown.get(entry.id);
        if (!state) return;
        if (entry.session !== undefined) {
            state.owned = true;
            state.session = entry.session;
            state.ownerName = entry.ownerName;
            this.animalsWhose(state);
        }
        // An animal this client walks is not told where it is.
        if (this.animalsOurs(state) && !state.putRight) return;
        if (entry.home) {
            state.homeX = entry.home.x;
            state.homeY = entry.home.y;
            state.homeZ = entry.home.z;
            state.x = entry.home.x;
            state.y = entry.home.y;
            state.z = entry.home.z;
            state.walking = false;
            this.animalsRest(state);
        }
        if (entry.place) {
            state.x = state.homeX + entry.place.x;
            state.y = state.homeY + entry.place.y;
            state.z = state.homeZ + entry.place.z;
            state.walking = false;
            this.animalsRest(state);
        }
        if (entry.walk) this.animalsWalk(state, entry.walk.x, entry.walk.z);
        if (entry.mode !== undefined) {
            state.mode = entry.mode;
            state.after = entry.target;
            if (state.mode === ANIMALS_MODE.chase) {
                // After somebody: the walk it was on is over wherever it had got to, and nothing is said of it.
                state.walking = false;
                state.moving = false;
                state.reportIn = 0;
                state.reported = true;
            }
        }
        if (entry.hurt !== undefined) state.hurt = entry.hurt;
        if (entry.extra !== undefined) state.extra = entry.extra;
        if (state.mob) this.animalsDress(state);
    },

    animalsGone(id) {
        const state = this.animalsKnown.get(id);
        if (!state) return;
        this.animalsKnown.delete(id);
        if (state.mob) this.animalsDropBody(state);
    },

    // Takes a body away on the server's word: nobody is told.
    animalsDropBody(state) {
        const mob = state.mob;
        this.animalsTaking = mob;
        this.removeMob(mob);
        this.animalsTaking = null;
    },

    // The server sent it on a walk (in quarters of a block from its home). The one before, with nothing
    // said against it, got where it was going: so the server holds, and so it is held here.
    animalsWalk(state, walkX, walkZ) {
        if (state.walking) {
            state.x = state.homeX + state.walkX / 4;
            state.z = state.homeZ + state.walkZ / 4;
        }
        state.walking = true;
        state.walkX = walkX;
        state.walkZ = walkZ;
        state.targetX = state.homeX + walkX / 4;
        state.targetZ = state.homeZ + walkZ / 4;
        state.moving = true;
        state.best = Infinity;
        state.stall = 0;
        state.reportIn = 0;
        state.reported = false;
    },

    // It is at its place: a copy that is elsewhere walks there, and nothing is said of how that goes.
    animalsRest(state) {
        state.targetX = state.x;
        state.targetZ = state.z;
        state.best = Infinity;
        state.stall = 0;
        state.reportIn = 0;
        state.reported = true;
        const mob = state.mob;
        state.moving = Boolean(mob) && Math.hypot(state.x - mob.position.x, state.z - mob.position.z) > ANIMALS.arrive;
    },

    // Whose the animal is, on its body: this player's (tamed here) or not.
    animalsWhose(state) {
        state.mine = state.owned && state.session === this.network.playerId;
        const mob = state.mob;
        if (!mob) return;
        const data = mob.userData;
        data.animalMine = state.mine;
        data.animalForeign = !state.mine;
        data.animalOwnerName = state.owned ? state.ownerName : null;
        if (state.mine && !data.tamed) {
            this.animalsMakeMine(state);
        } else if (!state.mine && state.owned && data.tamed) {
            // Another page of this player is playing it now, or the server gave it to somebody else.
            data.tamed = false;
            data.tamingLove = 0;
            this.animalsDress(state);
        }
    },

    // Whether an animal the server tells of can have a body here. A pet is of a species that can be
    // tamed, which createMob makes. One with no owner needs its movement to say how it is made
    // (spawnKept, js/extensions.js) unless it is a plain body on the ground of the built-in movements:
    // a colony, a school or a light is not made of one mob.
    animalsCanKeep(species, owned) {
        const info = getMobSpecies(species);
        if (!info) return false;
        if (owned) return this.tamingCanTame(species);
        const behaviour = MOB_BEHAVIOURS[info.movement];
        if (behaviour) return typeof behaviour.spawnKept === 'function';
        return !mobMovementIs(info.movement, 'bodiless');
    },

    // The floor to stand on at (x, z), near the height the server holds: the first one down from there
    // or, when that is under the ground (the ground has changed, or the height was a guess), the first
    // one up with room over it. null when there is none (the chunk is not there).
    animalsFloor(x, y, z) {
        const controller = this.cameraController;
        let floor = controller.getFloorY(x, z, y + 1.5);
        if (floor <= -20) floor = controller.getFloorY(x, z, 256);
        for (let tries = 0; floor > -20 && tries < 12; tries++) {
            const above = controller.getFloorY(x, z, floor + 0.5);
            if (above <= floor + 0.001) return floor;
            floor = above;
        }
        floor = controller.getFloorY(x, z, 256);
        return floor > -20 ? floor : null;
    },

    // Gives the animal its body, if the ground it stands on has arrived. Returns whether there is
    // nothing more to wait for.
    animalsMaterialize(state) {
        if (state.mob || state.bodiless) return true;
        const info = getMobSpecies(state.species);
        if (!info || !this.animalsCanKeep(state.species, state.owned)) {
            state.bodiless = true;
            return true;
        }
        let x = state.x;
        let y = state.y;
        let z = state.z;
        const beside = state.mode === ANIMALS_MODE.follow || state.mode === ANIMALS_MODE.ridden;
        const avatar = beside && !state.mine && state.session ? this.otherPlayerMeshes.get(state.session) : null;
        if (beside && state.mine) {
            // This player's own followers come back around them.
            const player = this.getLocalPlayerPosition();
            x = player.x + state.ringX;
            y = player.y - (this.cameraController.eyeHeight || 1.62);
            z = player.z + state.ringZ;
            if (this.cameraController.getFloorY(x, z, y + 1.5) <= -20) {
                x = player.x;
                z = player.z;
            }
        } else if (avatar) {
            x = avatar.position.x + state.ringX;
            y = avatar.position.y;
            z = avatar.position.z + state.ringZ;
        }
        if (!this.world.getColumnAt(Math.floor(x), Math.floor(z))) return false;
        const floor = this.animalsFloor(x, y, z);
        if (floor === null) return false;

        const position = new THREE.Vector3(x, floor, z);
        const options = { variant: state.variant % (info.variants || 1) };
        const behaviour = MOB_BEHAVIOURS[info.movement];
        let mob;
        if (behaviour && behaviour.spawnKept) {
            mob = behaviour.spawnKept.call(this, state.species, position, options);
            if (!mob) return false;
        } else {
            mob = this.createMob(state.species, position, options);
            this.ambientMobs.push(mob);
        }
        const data = mob.userData;
        data.natural = false;
        data.animalId = state.id;
        data.animal = state;
        data.home.set(state.homeX, state.homeY, state.homeZ);
        // Only a movement that walks to goals can be sent anywhere: any other lives by itself around its home.
        state.walks = mobMovementIs(info.movement, 'walksToGoal');
        state.mob = mob;
        state.hidden = false;
        state.extraWorn = null;
        this.animalsBodies.push(mob);
        this.animalsWhose(state);
        if (!this.animalsOurs(state)) {
            this.animalsDress(state);
            state.moving = Math.hypot(state.targetX - x, state.targetZ - z) > ANIMALS.arrive;
        }
        return true;
    },

    // An animal of this player's that the server told of (they have just come in): tamed here, as
    // taming.js keeps them, and from now on it is this client that says what becomes of it.
    animalsMakeMine(state) {
        const mob = state.mob;
        const data = mob.userData;
        this.tamingTame(mob, { quiet: true });
        this.tamingKeptApply(mob, animalsExtra(state.extra));
        state.extraWorn = state.extra;
        this.animalsHealth(state);
        const sitting = state.mode === ANIMALS_MODE.stay;
        data.tamingSitting = sitting;
        data.resting = sitting ? 1 : 0;
        // What the server holds: animalsSay tells it whatever is different here.
        state.said = {
            mode: state.mode, x: state.x, y: state.y, z: state.z, hurt: state.hurt / 2,
            extra: JSON.stringify(animalsExtra(state.extra))
        };
        state.putRight = false;
    },

    animalsHealth(state) {
        const data = state.mob.userData;
        if (!(data.maxHealth > 1)) return;
        // Never dead by somebody else's count: whoever strikes the next blow defeats it.
        data.health = Math.max(0.5, data.maxHealth - state.hurt / 2);
        this.updateMobHealthBar(state.mob);
    },

    // Puts on the body what the server says of an animal that is not walked here: its health, whether it
    // sits or is hidden under its rider, and what its extra shows (a baby's size, its genes' colour).
    animalsDress(state) {
        const mob = state.mob;
        const data = mob.userData;
        if (this.animalsOurs(state)) {
            // The server refused what this client said: as it says, and from there on.
            this.animalsMakeMine(state);
            return;
        }
        this.animalsHealth(state);
        const sitting = state.mode === ANIMALS_MODE.stay;
        if (Boolean(data.tamingSitting) !== sitting) {
            data.tamingSitting = sitting;
            data.resting = 0;
        }
        const hidden = state.mode === ANIMALS_MODE.ridden;
        if (hidden !== state.hidden) {
            state.hidden = hidden;
            mob.visible = !hidden;
        }
        if (state.extraWorn !== state.extra) {
            state.extraWorn = state.extra;
            this.tamingKeptApply(mob, animalsExtra(state.extra));
        }
        // `hostile` is what has a mob chase and bite the player of this client (js/game/mobs.js). One the
        // server walks is so only while the server says it is after this player; one it does not walk is
        // left as its species is.
        if (state.walks && state.walked) {
            data.hostile = state.mode === ANIMALS_MODE.chase && state.after === this.network.playerId && Boolean(getMobSpecies(state.species).hostile);
        }
    },

    // Where the player a chasing animal is after is, for this client: this player (nowhere while they are
    // dead or in the title screen), or the avatar of another, if it is around. null: nowhere to run to.
    // This player's place is asked once a frame, however many are after them.
    animalsPrey(state) {
        if (state.after !== this.network.playerId) {
            const avatar = state.after ? this.otherPlayerMeshes.get(state.after) : null;
            return avatar ? avatar.position : null;
        }
        if (this.titleScreenOpen || this.respawnPending) return null;
        let here = this.animalsHere;
        if (!here || this.animalsHereFrame !== this.mobFrame) {
            here = here || (this.animalsHere = new THREE.Vector3());
            this.animalsHereFrame = this.mobFrame;
            const player = this.getLocalPlayerPosition();
            here.set(player.x, player.y, player.z);
        }
        return here;
    },

    // Where a mob that is not walked here goes (registerMobGoal): never null, so it never wanders. One
    // vector for each mob, made once.
    animalsGoal(mob) {
        const data = mob.userData;
        const state = data.animal;
        // In a cage of this player's (js/game/traps.js) the cage holds it; tamed here a moment ago and
        // waiting for the server's word, taming.js walks it.
        if (!state || data.trapsCage || data.tamed) return null;
        if (state.mode === ANIMALS_MODE.roam && !state.walked) return null;
        if (!state.walks) return null;
        const goal = data.animalGoal || (data.animalGoal = new THREE.Vector3());
        const position = mob.position;
        // At its walk, unless it runs after somebody.
        goal.speed = 0;
        if (state.mode === ANIMALS_MODE.chase) {
            const prey = this.animalsPrey(state);
            if (prey) {
                const info = getMobSpecies(state.species);
                goal.set(prey.x, position.y, prey.z);
                goal.stopDistance = Math.max(info.keepDistance || 0, ANIMALS.chaseStop);
                goal.speed = info.chaseSpeed || 0;
                return goal;
            }
        } else if (state.mode === ANIMALS_MODE.follow) {
            const avatar = state.session ? this.otherPlayerMeshes.get(state.session) : null;
            if (avatar) {
                goal.set(avatar.position.x + state.ringX, position.y, avatar.position.z + state.ringZ);
                goal.stopDistance = ANIMALS.followStop;
                return goal;
            }
        } else if (state.moving && state.mode !== ANIMALS_MODE.ridden) {
            goal.set(state.targetX, position.y, state.targetZ);
            goal.stopDistance = ANIMALS.arrive;
            return goal;
        }
        // Standing: a point right in front of its nose (models face +z), which it has reached already.
        const heading = Math.PI / 2 - mob.rotation.y;
        goal.set(position.x + Math.cos(heading) * 0.05, position.y, position.z + Math.sin(heading) * 0.05);
        goal.stopDistance = 1;
        return goal;
    },

    // Once a frame, after the mobs moved: the bodies whose chunk has arrived, and for each animal that is
    // not walked here, whether it got where it was going.
    animalsUpdate(delta) {
        if (!this.animalsKnown || !this.world || !this.ambientMobs) return;
        this.animalsRetry -= delta;
        if (this.animalsRetry <= 0) {
            this.animalsRetry = ANIMALS.retryEvery;
            if (this.animalsWaiting.length) {
                this.animalsWaiting = this.animalsWaiting.filter((state) => this.animalsKnown.get(state.id) === state && !this.animalsMaterialize(state));
            }
        }
        const bodies = this.animalsBodies;
        for (let i = 0; i < bodies.length; i++) {
            const mob = bodies[i];
            const state = mob.userData.animal;
            if (state && !mob.userData.tamed) this.animalsLead(state, mob, delta);
        }
    },

    animalsLead(state, mob, delta) {
        const data = mob.userData;
        const mode = state.mode;
        if (mode === ANIMALS_MODE.follow || mode === ANIMALS_MODE.ridden) {
            const avatar = state.session ? this.otherPlayerMeshes.get(state.session) : null;
            if (avatar && mode === ANIMALS_MODE.ridden) {
                // Under its rider, unseen, to be there when they get off.
                mob.position.set(avatar.position.x, mob.position.y, avatar.position.z);
            } else if (avatar) {
                const x = avatar.position.x + state.ringX;
                const z = avatar.position.z + state.ringZ;
                if (Math.hypot(x - mob.position.x, z - mob.position.z) > ANIMALS.followFar) {
                    const floor = this.world.getColumnAt(Math.floor(x), Math.floor(z)) ? this.animalsFloor(x, avatar.position.y, z) : null;
                    if (floor !== null) {
                        mob.position.set(x, floor + (data.flyHeight || 0), z);
                        data.home.set(x, floor, z);
                    }
                }
            }
        } else if (state.walks && (state.walked || mode === ANIMALS_MODE.stay)) {
            if (state.moving) this.animalsTrack(state, mob, delta);
            if (state.reportIn > 0) {
                state.reportIn -= delta;
                if (state.reportIn <= 0) this.animalsReport(state, mob);
            }
            // Sitting where it was told to, as a pet of this player's does (js/game/taming.js).
            if (mode === ANIMALS_MODE.stay && !state.moving) data.resting = Math.max(data.resting || 0, 0.5);
        }
        if (data.tamingSitting || data.tamingSitBlend) this.tamingPose(mob, delta);
        if (data.tamingAge != null) {
            data.tamingAge += delta;
            if (data.tamingAge >= TAMING.growTime) data.tamingAge = null;
            this.tamingGrow(mob);
        }
        if (data.geneticsAlbino && data.geneticsTintedRoot !== data.modelRoot && this.geneticsTint) this.geneticsTint(mob);
    },

    // Whether the copy is getting where it was sent: there, or no nearer for a second.
    animalsTrack(state, mob, delta) {
        const distance = Math.hypot(state.targetX - mob.position.x, state.targetZ - mob.position.z);
        if (distance <= ANIMALS.arrive) {
            this.animalsStopped(state, mob, distance);
            return;
        }
        // Over a chunk that is not there it waits (js/game/mobs.js): that is not being blocked.
        if (!this.world.getColumnAt(Math.floor(mob.position.x), Math.floor(mob.position.z))) return;
        if (distance > ANIMALS.followFar && !state.walking) {
            // Too far to walk back to its place (it was following, and was sat down somewhere else): it is put there.
            const floor = this.world.getColumnAt(Math.floor(state.targetX), Math.floor(state.targetZ)) ? this.animalsFloor(state.targetX, state.y, state.targetZ) : null;
            if (floor !== null) {
                mob.position.set(state.targetX, floor + (mob.userData.flyHeight || 0), state.targetZ);
                state.moving = false;
                return;
            }
        }
        if (distance < state.best - 0.02) {
            state.best = distance;
            state.stall = 0;
            return;
        }
        state.stall += delta;
        if (state.stall >= ANIMALS.blockedAfter) this.animalsStopped(state, mob, distance);
    },

    animalsStopped(state, mob, distance) {
        state.moving = false;
        if (state.reported || !state.walking || state.mode !== ANIMALS_MODE.roam) return;
        const feet = mob.position.y - (mob.userData.flyHeight || 0);
        if (distance > ANIMALS.agree || Math.abs(feet - state.y) > ANIMALS.agree) {
            state.reportIn = ANIMALS.reportWait + Math.random() * ANIMALS.reportSpread;
        }
    },

    // Its turn to say where the copy stopped has come, and nobody said it first (the server would have
    // told: animalsRest).
    animalsReport(state, mob) {
        state.reportIn = 0;
        if (state.reported || !state.walking || !this.network.connected) return;
        state.reported = true;
        const round = (value) => Math.round(value * 100) / 100;
        this.network.send('animalAt', {
            id: state.id, x: round(mob.position.x), y: round(mob.position.y - (mob.userData.flyHeight || 0)), z: round(mob.position.z),
            gx: state.walkX, gz: state.walkZ
        });
    },

    // ---- This player's own ----

    // Tells the server what has become of the player's animals since it was last told: the ones tamed or
    // born here that it has not taken, and what changed of the ones it keeps. Called by taming.js when
    // something happens to one, and every few seconds: it says nothing when nothing has changed.
    animalsOwnerSync() {
        if (!this.animalsKnown || !this.network || !this.network.connected || !this.ambientMobs) return;
        const mobs = this.ambientMobs;
        for (let i = 0; i < mobs.length; i++) {
            const mob = mobs[i];
            const data = mob.userData;
            if (!data.tamed || data.animalOff) continue;
            const state = data.animal;
            if (!state || !state.mine) this.animalsOffer(mob, state);
            else if (state.said) this.animalsSay(mob, state);
        }
    },

    animalsHurtOf(mob) {
        const data = mob.userData;
        return data.maxHealth > 1 ? Math.max(0, Math.round((data.maxHealth - data.health) * 2) / 2) : 0;
    },

    // Asks the server to keep an animal tamed or born here; one it already kept for nobody is adopted.
    // Once for each connection: the answer binds it (animalsOnKept).
    animalsOffer(mob, state) {
        const data = mob.userData;
        if (data.animalAsked === this.animalsConnection) return;
        data.animalAsked = this.animalsConnection;
        data.animalRef = data.animalRef || Math.random().toString(36).slice(2, 12);
        if (state) {
            this.network.send('animalAdopt', { ref: data.animalRef, id: state.id });
            return;
        }
        const extra = this.tamingKeptExtra(mob);
        data.animalOffered = { hurt: this.animalsHurtOf(mob), extra: JSON.stringify(extra) };
        this.network.send('animalKeep', { ref: data.animalRef, species: data.species, variant: data.variant, hurt: data.animalOffered.hurt, extra });
    },

    animalsSay(mob, state) {
        const data = mob.userData;
        const said = state.said;
        const mode = data.rider ? ANIMALS_MODE.ridden : data.tamingSitting ? ANIMALS_MODE.stay : ANIMALS_MODE.follow;
        const message = { id: state.id };
        let news = false;
        if (mode === ANIMALS_MODE.stay) {
            const x = animalsSnap(mob.position.x);
            const y = animalsSnap(mob.position.y - (data.flyHeight || 0));
            const z = animalsSnap(mob.position.z);
            if (said.mode !== mode || said.x !== x || said.y !== y || said.z !== z) {
                Object.assign(message, { mode, x, y, z });
                Object.assign(said, { mode, x, y, z });
                news = true;
            }
        } else if (said.mode !== mode) {
            message.mode = mode;
            said.mode = mode;
            news = true;
        }
        const hurt = this.animalsHurtOf(mob);
        if (hurt !== said.hurt) {
            message.hurt = hurt;
            said.hurt = hurt;
            news = true;
        }
        const extra = this.tamingKeptExtra(mob);
        const text = JSON.stringify(extra);
        if (text !== said.extra) {
            message.extra = extra;
            said.extra = text;
            news = true;
        }
        if (news) this.network.send('animalSet', message);
    },

    // The server's answer to animalKeep and animalAdopt: the animal's number, or why not.
    animalsOnKept(payload) {
        if (!this.animalsKnown || typeof payload.ref !== 'string') return;
        const mob = this.ambientMobs.find((candidate) => candidate.userData.animalRef === payload.ref && candidate.userData.tamed);
        if (payload.error || !payload.id) {
            if (!mob) return;
            const data = mob.userData;
            if (payload.error === 'later') {
                // The player was nowhere yet: asked again with the next look.
                data.animalAsked = null;
            } else if (data.animal) {
                // A kept animal that could not be adopted: it is not this player's after all.
                data.tamed = false;
                data.tamingSitting = false;
                this.animalsDress(data.animal);
                this.receiveSystemMessage({ text: animalsLine('left') });
            } else {
                // It stays as it always was: in this browser (js/game/taming.js saves it).
                data.animalOff = true;
                if (payload.error === 'full' && !this.animalsFullSaid) {
                    this.animalsFullSaid = true;
                    this.receiveSystemMessage({ text: animalsLine('full') });
                }
            }
            return;
        }
        if (!mob) {
            // Defeated before the answer came: the server must not keep what is no more.
            if (!this.animalsKnown.has(payload.id)) this.network.send('animalGone', { id: payload.id });
            return;
        }
        const data = mob.userData;
        let state = this.animalsKnown.get(payload.id);
        if (state && state.mob && state.mob !== mob) {
            // The server already told of it (an answer lost with a connection) and it got a second body.
            this.animalsDropBody(state);
        }
        if (!state) {
            state = {
                id: payload.id, species: data.species, variant: data.variant, mob: null, bodiless: false, hidden: false,
                mode: ANIMALS_MODE.follow, after: '', walked: false, walking: false, hurt: 0, extra: '', extraWorn: null,
                homeX: mob.position.x, homeY: mob.position.y, homeZ: mob.position.z, x: mob.position.x, y: mob.position.y, z: mob.position.z,
                ringX: 0, ringZ: 0, targetX: 0, targetZ: 0, moving: false, best: Infinity, stall: 0, reportIn: 0, reported: true
            };
            this.animalsKnown.set(payload.id, state);
        }
        const offered = data.animalOffered || { hurt: state.hurt / 2, extra: JSON.stringify(animalsExtra(state.extra)) };
        Object.assign(state, {
            mob, mine: true, owned: true, session: this.network.playerId, ownerName: this.playerName || '',
            mode: ANIMALS_MODE.follow, walked: false, walking: false, moving: false, putRight: false,
            said: { mode: ANIMALS_MODE.follow, x: 0, y: 0, z: 0, hurt: offered.hurt, extra: offered.extra }
        });
        data.animalId = state.id;
        data.animal = state;
        data.animalMine = true;
        data.animalForeign = false;
        data.animalOwnerName = state.ownerName;
        data.animalOffered = null;
        if (!this.animalsBodies.includes(mob)) this.animalsBodies.push(mob);
        // What has changed since it was offered (it sat down) is said at once, and the browser forgets it.
        if (this.tamingSaveSoon) this.tamingSaveSoon();
    },

    // The server did not take what this client said of an animal, and tells it again with its next round:
    // that is how it is. `gone`: it does not have it at all, and one of this player's is offered again.
    animalsOnRefused(payload) {
        if (!this.animalsKnown) return;
        const state = this.animalsKnown.get(payload.id);
        if (!state) return;
        if (!payload.gone) {
            state.putRight = true;
            return;
        }
        this.animalsKnown.delete(state.id);
        const mob = state.mob;
        if (!mob) return;
        if (this.animalsOurs(state)) {
            const data = mob.userData;
            this.animalsBodies = this.animalsBodies.filter((other) => other !== mob);
            Object.assign(data, { animal: null, animalId: 0, animalMine: false, animalForeign: false, animalOwnerName: null, animalRef: null, animalAsked: null });
            state.mob = null;
        } else {
            this.animalsDropBody(state);
        }
    },

    // ---- Blows, and leaving the scene ----

    animalsOnDamaged(mob, damage) {
        const state = mob.userData.animal;
        if (!state || !(damage > 0)) return;
        if (state.said) state.said.hurt += damage;
        else state.hurt += damage * 2;
        if (this.network.connected) this.network.send('animalHurt', { id: state.id, damage });
    },

    // A kept mob left the scene: unless the server said so, it is told (defeated, eaten, collected in a cage).
    animalsOnRemoved(mob) {
        const data = mob.userData;
        const state = data.animal;
        if (!state) return;
        data.animal = null;
        state.mob = null;
        this.animalsBodies = this.animalsBodies.filter((other) => other !== mob);
        if (this.animalsTaking === mob) return;
        this.animalsKnown.delete(state.id);
        if (this.network.connected) this.network.send('animalGone', { id: state.id });
    },

    // Why the player may not strike this mob: it is somebody's, or nobody's in a plot that is not theirs.
    // The admin may, as on the server.
    animalsStrikeRefusal(mob) {
        const data = mob.userData;
        if (!data.animalForeign || this.creativeMode) return null;
        if (data.animalOwnerName !== null) return data.animalOwnerName ? animalsLine('owned', data.animalOwnerName) : animalsLine('ownedAway');
        return this.blockEditRefusal(Math.floor(mob.position.x), Math.floor(mob.position.z));
    },

    // Why it cannot be tamed (js/game/taming.js asks before any food is spent): it has an owner, or it
    // lives in a plot that is not the player's.
    animalsTameRefusal(mob) {
        const data = mob.userData;
        if (!data.animalForeign) return null;
        if (data.animalOwnerName !== null) return data.animalOwnerName ? animalsLine('owned', data.animalOwnerName) : animalsLine('ownedAway');
        return this.creativeMode ? null : this.blockEditRefusal(Math.floor(mob.position.x), Math.floor(mob.position.z));
    },

    // Why it cannot be ridden (js/game/riding.js): only its owner rides a kept animal.
    animalsRideRefusal(mob) {
        const data = mob.userData;
        if (!data.animalForeign) return null;
        if (data.animalOwnerName !== null) return data.animalOwnerName ? animalsLine('owned', data.animalOwnerName) : animalsLine('ownedAway');
        return animalsLine('notTamed');
    },

    // ---- /animal ----

    // /animal <species> [blocks]: creative mode only, and to anybody else no such command (as /give).
    animalsCommand(command, args) {
        if (!this.creativeMode || !this.network.connected) {
            this.receiveSystemMessage({ text: `Unknown command: /${command}` });
            return;
        }
        const species = (args[0] || '').toLowerCase();
        if (!this.animalsCanKeep(species, false)) {
            const list = Object.keys(MOB_SPECIES).filter((name) => this.animalsCanKeep(name, false)).join(', ');
            this.receiveSystemMessage({ text: animalsLine('summonUsage', list) });
            return;
        }
        const info = getMobSpecies(species);
        const player = this.getLocalPlayerPosition();
        const yaw = player.yaw || 0;
        const controller = this.cameraController;
        // Two steps ahead, or right here when there is no ground there.
        let x = player.x - Math.sin(yaw) * 2;
        let z = player.z - Math.cos(yaw) * 2;
        let floor = controller.getFloorY(x, z, player.y + 0.5);
        if (floor <= -20 || player.y - floor > 6) {
            x = player.x;
            z = player.z;
            floor = controller.getFloorY(x, z, player.y);
        }
        if (floor <= -20) {
            this.receiveSystemMessage({ text: animalsLine('noGround') });
            return;
        }
        // The server walks only what walks to a goal: the others live around their home by themselves.
        const walks = mobMovementIs(info.movement, 'walksToGoal');
        const radius = walks ? Math.max(1, Math.min(32, Number(args[1]) || ANIMALS.summonRadius)) : 0;
        // A hostile one goes after players as its kind does: the server is told how, having no table of species.
        this.network.send('animalSummon', {
            species, variant: Math.floor(Math.random() * (info.variants || 1)), x, y: floor, z, radius, speed: info.speed || 0,
            ...animalsChaseOf(info)
        });
    },

    animalsOnSummoned(payload) {
        this.receiveSystemMessage({ text: payload.error ? animalsLine('summonFailed') : animalsLine('summoned', String(payload.species || '')) });
    }
});
