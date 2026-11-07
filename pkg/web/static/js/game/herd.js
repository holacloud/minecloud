// How followers share the room around whoever they follow: tamed animals spread around the player
// (and babies around their parent) and keep apart by the size of their real bodies.
//
// Two things work together, cheaply:
//   - A place for each follower. A ring around the leader, small animals nearest; the order on a
//     ring is the order they already stand in, so they hardly cross each other's way. A place keeps
//     its bearing as the leader walks and turns, and moves aside when the ground there is no good
//     (a wall, a ledge, water, a chunk that is not loaded). Followers walk there through the usual
//     goal (registerMobGoal, so mobs.js and the goats' code still decide what can be walked), and
//     then stay put until their place has really moved away: no shuffling, no jitter.
//   - Neighbours. A walker steers around the bodies ahead of it, and bodies that do overlap ease
//     apart, small ones yielding the most, never up or down a block, through a fence or into water.
//     A small grid, refreshed 15 times a second, keeps that linear in the number of animals.
// Whoever cannot get to its place (behind a wall, or others in a room too small) stops trying for a
// while instead of treading on the spot.
//
// Only followers ever move here. Wild animals, seated or resting ones, a ridden mount, the friendly
// dog and cat that are not tamed (mobs.js walks them) and anything over a chunk that is not loaded
// are obstacles that do not budge. With no tamed animals this costs one look at each mob, 15 times
// a second, and changes nothing.

const HERD = {
    tick: 1 / 15,
    assignEvery: 0.5,
    cell: 3, // of the neighbour grid, in blocks
    gap: 0.25, // left between two bodies on a ring
    playerClear: 2, // from the player's centre to the near side of the first ring
    parentClear: 0.05,
    arrive: 0.2, // this close to its place, a follower is there...
    resume: 0.9, // ...and it stays until its place is this far
    sense: 0.45, // a walker starts going around a body this far from touching it
    slop: 0.02, // an overlap this small is left alone
    pushGain: 2.5,
    pushMax: 0.9, // blocks per second
    walkerWeight: 3,
    progressTime: 2.5, // no closer to its place in this long: blocked
    progressMin: 0.05,
    waitMin: 2,
    waitMax: 15,
    checkWalking: 0.5,
    checkResting: 3
};

// Bearing changes (radians) tried in turn when a place is no good.
const HERD_SHIFTS = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75, 2.1, -2.1, 2.45, -2.45, Math.PI];
// Not bodies on the ground: they neither block nor get blocked.
const HERD_NOT_BODIES = new Set(['swim', 'swarm', 'glow', 'flutter', 'soar', 'stalk', 'anthill', 'eel', 'storm', 'lure', 'tunnel']);
const HERD_PLAYER = { name: 'player' };

let herdNextId = 1;
const herdSpeciesBodies = new Map();

// A species' footprint and height, read from its model's parts (tails do not count: they lift out
// of the way). The radius reaches its farthest corner, so that bodies do not touch however they face.
function herdSpeciesBody(species) {
    let body = herdSpeciesBodies.get(species);
    if (body) return body;
    body = { radius: 0.5, height: 1 };
    try {
        const build = VoxelModels.mobBuilders[species];
        if (build) {
            const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: 1, hd: false, defaultSurface: 'fur' });
            build.call(VoxelModels, b, 0);
            let reach = 0;
            let top = 0;
            for (const part of b.parts) {
                let [x, y, z] = part.pivot;
                for (let parent = part.parent && b.byName.get(part.parent); parent; parent = parent.parent && b.byName.get(parent.parent)) {
                    x += parent.pivot[0];
                    y += parent.pivot[1];
                    z += parent.pivot[2];
                }
                top = Math.max(top, y + part.from[1] + part.size[1]);
                if (/tail/i.test(part.name || '')) continue;
                const far = (start, a, b2) => Math.max(Math.abs(start + a), Math.abs(start + a + b2));
                reach = Math.max(reach, far(x, part.from[0], part.size[0]), far(z, part.from[2], part.size[2]));
            }
            if (reach > 0) body = { radius: Math.max(0.25, reach / 16), height: top / 16 };
        }
    } catch (error) {
        // A model that cannot be read this way: the default body will do.
    }
    herdSpeciesBodies.set(species, body);
    return body;
}

registerFrameUpdate(function (delta) {
    this.herdUpdate(delta);
});

Object.assign(Game.prototype, {
    // The size of this animal's body, babies and big genes included.
    herdRadius(mob) {
        return herdSpeciesBody(mob.userData.modelSpecies || mob.userData.species).radius * (mob.scale ? mob.scale.x : 1);
    },

    herdHeight(mob) {
        return herdSpeciesBody(mob.userData.modelSpecies || mob.userData.species).height * (mob.scale ? mob.scale.y : 1);
    },

    herdIsBody(mob) {
        const data = mob.userData;
        if (mob.visible === false || data.isHive || data.antColony || data.trapsCage) return false;
        return !HERD_NOT_BODIES.has((getMobSpecies(data.species) || {}).movement);
    },

    // Who this mob walks with: the player, a parent, or nobody (tamingGoal gives it no place then).
    herdLeaderOf(mob) {
        const data = mob.userData;
        if (!data.tamed || data.rider || data.tamingSitting || this.titleScreenOpen) return null;
        if (this.tamingIsBaby(mob) && this.tamingLiveParent(mob)) return data.tamingParent;
        return this.respawnPending ? null : HERD_PLAYER;
    },

    // Can it be moved at all right now?
    herdCanMove(mob) {
        const data = mob.userData;
        if (!data.tamed || data.rider || data.tamingSitting || data.resting > 0 || data.airborne || data.ram || data.bounceVelocity) return false;
        return Boolean(this.world.getColumnAt(Math.floor(mob.position.x), Math.floor(mob.position.z)));
    },

    herdState(mob) {
        const data = mob.userData;
        if (!data.herd) {
            data.herd = {
                id: herdNextId++, state: 'walk', ready: false, leader: null, angle: 0, radius: 0, stop: 0, shift: 0, placed: false, check: 0,
                hx: 0, hz: 0, fx: Math.cos(data.direction || 0), fz: Math.sin(data.direction || 0), px: 0, pz: 0, tx: 0, tz: 0, refX: 0, refZ: 0, best: Infinity, stalled: 0, wait: 0, waitNext: HERD.waitMin,
                waitX: 0, waitZ: 0, side: 0, sideTimer: 0
            };
        }
        return data.herd;
    },

    herdUpdate(delta) {
        if (!this.world || !this.ambientMobs) return;
        this.herdElapsed = (this.herdElapsed || 0) + delta;
        if (this.herdElapsed >= HERD.tick) {
            const elapsed = this.herdElapsed;
            this.herdElapsed = 0;
            this.herdTick(elapsed);
        }
        if (this.herdPushed) {
            for (const body of this.herdPushed) this.herdApplyPush(body, delta);
        }
    },

    herdTick(dt) {
        const mobs = this.ambientMobs;
        if (!this.herdBodies) {
            this.herdBodies = [];
            this.herdGrid = new Map();
            this.herdPushed = [];
            this.herdNear = [];
            this.herdChecks = 0;
        }
        this.herdPushed.length = 0;
        if (!mobs.some((mob) => mob.userData.tamed)) return;
        this.herdBuildGrid();
        this.herdPlayerCell = this.herdLeaderState(HERD_PLAYER);

        this.herdAssignTimer = (this.herdAssignTimer || 0) - dt;
        if (this.herdAssignTimer <= 0) {
            this.herdAssignTimer = HERD.assignEvery;
            this.herdAssign();
        }
        for (const body of this.herdBodies) {
            if (!body.follower) continue;
            this.herdPushOf(body);
            if (body.movable) this.herdSteer(body, dt);
        }
    },

    // Every body on the ground, in a grid with cells of HERD.cell blocks.
    herdBuildGrid() {
        const grid = this.herdGrid;
        for (const cell of grid.values()) cell.length = 0;
        const bodies = this.herdBodies;
        let count = 0;
        let maxRadius = 0;
        for (const mob of this.ambientMobs) {
            if (!this.herdIsBody(mob)) continue;
            const body = bodies[count] || (bodies[count] = {});
            count++;
            const data = mob.userData;
            const follower = Boolean(data.tamed);
            body.mob = mob;
            body.x = mob.position.x;
            body.y = mob.position.y;
            body.z = mob.position.z;
            body.radius = this.herdRadius(mob);
            body.top = body.y + this.herdHeight(mob);
            body.follower = follower;
            body.movable = follower && this.herdCanMove(mob);
            body.mass = body.radius * body.radius;
            if (follower) body.herd = this.herdState(mob);
            maxRadius = Math.max(maxRadius, body.radius);
            const key = this.herdCellKey(Math.floor(body.x / HERD.cell), Math.floor(body.z / HERD.cell));
            const cell = grid.get(key);
            if (cell) cell.push(body);
            else grid.set(key, [body]);
        }
        bodies.length = count;
        this.herdMaxRadius = maxRadius;
    },

    herdCellKey(cx, cz) {
        return (cx + 32768) * 65536 + (cz + 32768);
    },

    // The bodies around a point, within `range` of its centre plus their own radius (candidates,
    // in a shared array).
    herdQuery(x, z, range) {
        const near = this.herdNear;
        near.length = 0;
        const reach = range + this.herdMaxRadius;
        const minX = Math.floor((x - reach) / HERD.cell);
        const maxX = Math.floor((x + reach) / HERD.cell);
        const minZ = Math.floor((z - reach) / HERD.cell);
        const maxZ = Math.floor((z + reach) / HERD.cell);
        for (let cx = minX; cx <= maxX; cx++) {
            for (let cz = minZ; cz <= maxZ; cz++) {
                const cell = this.herdGrid.get(this.herdCellKey(cx, cz));
                if (!cell) continue;
                for (let i = 0; i < cell.length; i++) near.push(cell[i]);
            }
        }
        this.herdChecks += near.length;
        return near;
    },

    // Where a leader stands: x, z, the height of the ground it stands on (null when that is not
    // known) and how much room it needs for itself.
    herdLeaderState(leader) {
        if (leader === HERD_PLAYER) {
            const player = this.getLocalPlayerPosition();
            const controller = this.cameraController;
            const feet = player.y - (controller.eyeHeight || 1.62);
            const floor = controller.getFloorY(player.x, player.z, feet + 0.5);
            const mount = this.ridingMob;
            return {
                x: player.x, z: player.z, ground: floor > -20 ? floor : null,
                clear: HERD.playerClear + (mount ? this.herdRadius(mount) * 0.5 : 0)
            };
        }
        return {
            x: leader.position.x, z: leader.position.z, ground: leader.position.y - leader.userData.flyHeight,
            clear: this.herdRadius(leader) + HERD.parentClear
        };
    },

    // Gives everybody a place on the rings of its leader, when who is following has changed. Flyers
    // have rings of their own, up where they fly.
    herdAssign() {
        const groups = new Map();
        for (const mob of this.ambientMobs) {
            if (!mob.userData.tamed || !this.herdIsBody(mob)) continue;
            const herd = this.herdState(mob);
            const leader = this.herdLeaderOf(mob);
            herd.leader = leader;
            if (!leader) {
                herd.ready = false;
                continue;
            }
            const flying = mob.userData.flyHeight > 0;
            let byLayer = groups.get(leader);
            if (!byLayer) groups.set(leader, byLayer = [[], []]);
            byLayer[flying ? 1 : 0].push(mob);
        }
        for (const [leader, layers] of groups) {
            for (const group of layers) {
                if (group.length === 0) continue;
                const signature = group.map((mob) => `${mob.userData.herd.id}:${Math.round(this.herdRadius(mob) * 5)}`).sort().join();
                if (group.every((mob) => mob.userData.herd.signature === signature && mob.userData.herd.ready)) continue;
                this.herdLayOutRings(leader, group, signature);
            }
        }
    },

    herdLayOutRings(leader, group, signature) {
        const state = this.herdLeaderState(leader);
        const sized = group.map((mob) => ({ mob, radius: this.herdRadius(mob), herd: mob.userData.herd }));
        sized.sort((a, b) => a.radius - b.radius || a.herd.id - b.herd.id);
        const bearing = (mob) => Math.atan2(mob.position.z - state.z, mob.position.x - state.x);
        let clear = state.clear;
        let next = 0;
        while (next < sized.length) {
            const ring = [];
            let used = 0;
            let radius = clear + sized[next].radius;
            // Ascending sizes: a new member can only push this ring out, which also makes it longer.
            while (next < sized.length) {
                const candidate = clear + sized[next].radius;
                const width = 2 * sized[next].radius + HERD.gap;
                if (ring.length > 0 && used + width > 2 * Math.PI * candidate) break;
                ring.push(sized[next]);
                used += width;
                radius = candidate;
                next++;
            }
            // Spread over the whole ring, in the order they already stand, turned to spare steps.
            ring.sort((a, b) => bearing(a.mob) - bearing(b.mob) || a.herd.id - b.herd.id);
            let along = 0;
            let sin = 0;
            let cos = 0;
            for (const member of ring) {
                const width = 2 * member.radius + HERD.gap;
                member.nominal = (along + width / 2) / used * 2 * Math.PI;
                along += width;
                const difference = bearing(member.mob) - member.nominal;
                sin += Math.sin(difference);
                cos += Math.cos(difference);
            }
            const turn = Math.atan2(sin, cos);
            for (const member of ring) {
                const herd = member.herd;
                herd.angle = member.nominal + turn;
                herd.radius = radius;
                herd.stop = state.clear + member.radius;
                herd.shift = 0;
                herd.check = 0;
                herd.signature = signature;
                herd.tx = state.x + Math.cos(herd.angle) * radius;
                herd.tz = state.z + Math.sin(herd.angle) * radius;
                if (!herd.ready || herd.state === 'wait') this.herdWalk(herd);
                herd.ready = true;
            }
            clear = radius + ring[ring.length - 1].radius + HERD.gap;
        }
    },

    herdWalk(herd) {
        herd.state = 'walk';
        herd.best = Infinity;
        herd.stalled = 0;
    },

    // Is this a good place for a body of `radius`: ground that can be walked to from the leader
    // (a block up or down at a time, no water) with room around it?
    herdGroundOk(x, z, radius, ground, leaderX, leaderZ, flying) {
        const controller = this.cameraController;
        if (!this.world.getColumnAt(Math.floor(x), Math.floor(z))) return false;
        const steps = Math.max(1, Math.ceil(Math.hypot(x - leaderX, z - leaderZ)));
        let previous = ground;
        for (let i = 1; i <= steps; i++) {
            const px = leaderX + (x - leaderX) * i / steps;
            const pz = leaderZ + (z - leaderZ) * i / steps;
            const floor = controller.getFloorY(px, pz, previous + 1.1);
            if (floor <= -20 || floor - previous > 1.01 || previous - floor > (flying ? 3 : 1.01)) return false;
            if (!flying && this.findWaterSurface(px, floor + 0.1, pz) !== null) return false;
            previous = floor;
        }
        const r = radius * 0.7;
        for (let i = 0; i < 4; i++) {
            const floor = controller.getFloorY(x + (i === 0 ? r : i === 1 ? -r : 0), z + (i === 2 ? r : i === 3 ? -r : 0), previous + 1.1);
            if (floor - previous > 1.01) return false;
        }
        return true;
    },

    // Is something that will not move out of the way standing there?
    herdSpotTaken(x, z, radius, self) {
        const near = this.herdQuery(x, z, radius);
        for (let i = 0; i < near.length; i++) {
            const body = near[i];
            if (body.mob === self.mob || body.movable) continue;
            if (body.top <= self.y || body.y >= self.top) continue;
            if (Math.hypot(body.x - x, body.z - z) < radius + body.radius) return true;
        }
        return false;
    },

    // Is it the place of another follower? Places on the assigned bearings never clash; this is for
    // the ones moved aside, so that a corridor's few good places are not fought over.
    herdSpotClaimed(x, z, self) {
        const bodies = this.herdBodies;
        for (let i = 0; i < bodies.length; i++) {
            const other = bodies[i];
            if (other === self || !other.follower || !other.herd.ready || !other.herd.leader) continue;
            if ((other.mob.userData.flyHeight > 0) !== (self.mob.userData.flyHeight > 0)) continue;
            if (Math.hypot(other.herd.tx - x, other.herd.tz - z) < self.radius + other.radius) return true;
        }
        return false;
    },

    // Looks for the bearing nearest to the assigned one where its place is good.
    herdCheckPlace(body, leader) {
        const herd = body.herd;
        herd.check = herd.state === 'walk' ? HERD.checkWalking : HERD.checkResting;
        const ground = leader.ground ?? body.y - body.mob.userData.flyHeight;
        const flying = body.mob.userData.flyHeight > 0;
        const order = [herd.shift, ...HERD_SHIFTS.keys()];
        for (const index of order) {
            const angle = herd.angle + HERD_SHIFTS[index];
            const x = leader.x + Math.cos(angle) * herd.radius;
            const z = leader.z + Math.sin(angle) * herd.radius;
            if (!this.herdGroundOk(x, z, body.radius, ground, leader.x, leader.z, flying)) continue;
            if (herd.state === 'walk' && this.herdSpotTaken(x, z, body.radius, body)) continue;
            if (index !== 0 && herd.state === 'walk' && this.herdSpotClaimed(x, z, body)) continue;
            herd.shift = index;
            herd.placed = true;
            return;
        }
        herd.placed = false;
    },

    // What is pushing this body: the overlaps with its neighbours, each one's share by size.
    herdPushOf(body) {
        const herd = body.herd;
        let px = 0;
        let pz = 0;
        if (body.movable) {
            const near = this.herdQuery(body.x, body.z, body.radius);
            const love = body.mob.userData.tamingLove > 0;
            for (let i = 0; i < near.length; i++) {
                const other = near[i];
                if (other === body || other.top <= body.y || other.y >= body.top) continue;
                // Two in love are meant to meet.
                if (love && other.mob.userData.tamingLove > 0 && other.mob.userData.species === body.mob.userData.species) continue;
                const dx = body.x - other.x;
                const dz = body.z - other.z;
                const reach = body.radius + other.radius - HERD.slop;
                const squared = dx * dx + dz * dz;
                if (squared >= reach * reach) continue;
                const distance = Math.sqrt(squared);
                // Who is on its way pushes harder than who is standing: rings open to let it through.
                const mine = body.mass * (herd.state === 'walk' ? HERD.walkerWeight : 1);
                const theirs = other.mass * (other.follower && other.herd.state === 'walk' ? HERD.walkerWeight : 1);
                const share = other.movable ? theirs / (theirs + mine) : 1;
                const speed = Math.min(HERD.pushMax, (reach - distance) * HERD.pushGain) * share;
                if (distance > 1e-3) {
                    px += dx / distance * speed;
                    pz += dz / distance * speed;
                } else {
                    // On the very same spot: opposite ways, always the same ones.
                    const a = herd.id;
                    const b = other.follower ? other.herd.id : 0;
                    const angle = Math.min(a, b) * 2.399 + (a < b ? 0 : Math.PI);
                    px += Math.cos(angle) * speed;
                    pz += Math.sin(angle) * speed;
                }
            }
        }
        herd.px = px;
        herd.pz = pz;
        if (px !== 0 || pz !== 0) this.herdPushed.push(body);
    },

    // Moves a body along its push, where it may stand: no higher or lower than a slab away, not
    // through anything thin, not into water, and not over a chunk that is not loaded.
    herdApplyPush(body, delta) {
        const mob = body.mob;
        const herd = body.herd;
        const data = mob.userData;
        const speed = Math.hypot(herd.px, herd.pz);
        if (!mob.parent || speed < 1e-4) return;
        const x = mob.position.x;
        const z = mob.position.z;
        const stepX = herd.px * delta;
        const stepZ = herd.pz * delta;
        const feet = mob.position.y - data.flyHeight;
        const flying = data.flyHeight > 0;
        const reach = flying ? 1.01 : 0.55;
        const inWater = !flying && this.findWaterSurface(x, feet + 0.1, z) !== null;
        const aheadX = herd.px / speed * 0.3;
        const aheadZ = herd.pz / speed * 0.3;
        const floorAt = (nx, nz) => {
            const floor = this.cameraController.getFloorY(nx, nz, feet + 1.1);
            if (floor <= -20 || Math.abs(floor - feet) > reach) return null;
            // A whisker ahead: a thin fence is no way through, and the edge of a ledge is far enough.
            if (Math.abs(this.cameraController.getFloorY(nx + aheadX, nz + aheadZ, feet + 1.1) - feet) > reach) return null;
            if (!flying && !inWater && this.findWaterSurface(nx, floor + 0.1, nz) !== null) return null;
            return floor;
        };
        let nx = x + stepX;
        let nz = z + stepZ;
        let floor = floorAt(nx, nz);
        if (floor === null) {
            nz = z;
            floor = floorAt(nx, nz);
        }
        if (floor === null) {
            nx = x;
            nz = z + stepZ;
            floor = floorAt(nx, nz);
        }
        if (floor === null) return;
        mob.position.x = nx;
        mob.position.z = nz;
        // Ground mobs follow the ground; a flyer keeps its hover, which mobs.js sets every frame.
        if (!flying) mob.position.y = floor;
        // Stepping aside is walking too.
        if (speed > 0.12) {
            data.stepPhase += delta * 7 * Math.min(1, speed / 0.4);
            data.gait = Math.min(1, (data.gait || 0) + delta * 10);
        }
    },

    // What a walker wants now: where its place is, whether it got there, where to head.
    herdSteer(body, dt) {
        const herd = body.herd;
        const leaderMob = herd.leader;
        if (!leaderMob || !herd.ready) return;
        const leader = leaderMob === HERD_PLAYER ? this.herdPlayerCell : this.herdLeaderState(leaderMob);

        herd.check -= dt;
        if (herd.check <= 0) this.herdCheckPlace(body, leader);

        const fromLeader = Math.hypot(body.x - leader.x, body.z - leader.z);
        if (herd.placed) {
            const angle = herd.angle + HERD_SHIFTS[herd.shift];
            herd.tx = leader.x + Math.cos(angle) * herd.radius;
            herd.tz = leader.z + Math.sin(angle) * herd.radius;
        } else if (fromLeader > herd.stop) {
            // No good place on any bearing (a small room): as near as it comes along its own.
            herd.tx = leader.x + (body.x - leader.x) / fromLeader * herd.stop;
            herd.tz = leader.z + (body.z - leader.z) / fromLeader * herd.stop;
        } else {
            herd.tx = body.x;
            herd.tz = body.z;
        }
        const dx = herd.tx - body.x;
        const dz = herd.tz - body.z;
        const distance = Math.hypot(dx, dz);

        // Looking at the leader while standing.
        if (fromLeader > 0.01) {
            herd.fx = (leader.x - body.x) / fromLeader;
            herd.fz = (leader.z - body.z) / fromLeader;
        }

        if (herd.state === 'rest') {
            if (distance > HERD.resume) this.herdWalk(herd);
            else return;
        }
        if (herd.state === 'wait') {
            herd.wait -= dt;
            const moved = Math.hypot(herd.tx - herd.waitX, herd.tz - herd.waitZ) > 1.5;
            if (moved) herd.waitNext = HERD.waitMin;
            if (herd.wait > 0 && !moved) return;
            if (distance <= HERD.arrive) {
                herd.state = 'rest';
                return;
            }
            this.herdWalk(herd);
        }

        if (distance <= HERD.arrive) {
            herd.state = 'rest';
            herd.waitNext = HERD.waitMin;
            return;
        }

        // A place moving along with its leader is new ground to cover, not a failure.
        if (Math.hypot(herd.tx - herd.refX, herd.tz - herd.refZ) > 0.5) {
            herd.refX = herd.tx;
            herd.refZ = herd.tz;
            herd.best = distance;
            herd.stalled = 0;
        } else if (distance < herd.best - HERD.progressMin) {
            herd.best = distance;
            herd.stalled = 0;
        } else {
            herd.stalled += dt;
        }

        const desireX = dx / distance;
        const desireZ = dz / distance;
        const touching = this.herdAvoid(body, desireX, desireZ, dt);
        const blocked = herd.stalled >= HERD.progressTime || (!herd.placed && touching);
        if (blocked) {
            // Twice blocked: it will do as good a place here as there, if it is near enough.
            if (herd.waitNext > HERD.waitMin && herd.placed && this.herdAdoptSpot(body, leader, fromLeader)) return;
            herd.state = 'wait';
            herd.wait = herd.waitNext;
            herd.waitNext = Math.min(HERD.waitMax, herd.waitNext * 2);
            herd.waitX = herd.tx;
            herd.waitZ = herd.tz;
        }
    },

    // Makes where it stands its place from now on, unless that is too far off or cut off from the leader.
    herdAdoptSpot(body, leader, fromLeader) {
        const herd = body.herd;
        if (fromLeader > herd.radius + 3 || fromLeader < herd.stop * 0.6) return false;
        const ground = leader.ground ?? body.y - body.mob.userData.flyHeight;
        if (!this.herdGroundOk(body.x, body.z, body.radius, ground, leader.x, leader.z, body.mob.userData.flyHeight > 0)) return false;
        herd.angle = Math.atan2(body.z - leader.z, body.x - leader.x);
        herd.radius = fromLeader;
        herd.shift = 0;
        herd.tx = body.x;
        herd.tz = body.z;
        herd.state = 'rest';
        herd.waitNext = HERD.waitMin;
        return true;
    },

    // Steers a walker around the bodies ahead of it, onto ground it can use. Returns whether one
    // of them is touching it from ahead.
    herdAvoid(body, desireX, desireZ, dt) {
        const herd = body.herd;
        const near = this.herdQuery(body.x, body.z, body.radius + HERD.sense);
        let steerX = 0;
        let steerZ = 0;
        let touching = false;
        herd.sideTimer -= dt;
        for (let i = 0; i < near.length; i++) {
            const other = near[i];
            if (other === body || other.top <= body.y || other.y >= body.top) continue;
            const tx = other.x - body.x;
            const tz = other.z - body.z;
            const distance = Math.hypot(tx, tz);
            const room = distance - body.radius - other.radius;
            if (room >= HERD.sense || distance < 1e-3) continue;
            const ahead = (desireX * tx + desireZ * tz) / distance;
            if (ahead <= 0) continue;
            if (room <= 0.05 && ahead > 0.5) touching = true;
            const weight = Math.min(1, 1 - room / HERD.sense) * ahead;
            // Keep to the side chosen for a moment, or two walkers would dither face to face.
            if (herd.sideTimer <= 0) {
                const cross = desireX * tz - desireZ * tx;
                herd.side = Math.abs(cross) < 0.05 * distance ? (herd.id % 2 ? 1 : -1) : (cross > 0 ? -1 : 1);
                herd.sideTimer = 0.6;
            }
            steerX += -desireZ * herd.side * weight * 1.4 - tx / distance * weight * 0.3;
            steerZ += desireX * herd.side * weight * 1.4 - tz / distance * weight * 0.3;
        }

        let headX = desireX + steerX;
        let headZ = desireZ + steerZ;
        const steered = steerX !== 0 || steerZ !== 0;
        const length = Math.hypot(headX, headZ);
        if (length > 1e-3) {
            headX /= length;
            headZ /= length;
        } else {
            headX = desireX;
            headZ = desireZ;
        }
        // Stepping aside must not take it off a ledge or into water; heading to its place is its
        // own business as ever, except that a wall is worth going along.
        if (!this.herdHeadingOk(body, headX, headZ, steered)) {
            let found = false;
            const base = Math.atan2(desireZ, desireX);
            for (const turn of [0, 0.8 * (herd.side || 1), -0.8 * (herd.side || 1), 1.5 * (herd.side || 1), -1.5 * (herd.side || 1)]) {
                const cos = Math.cos(base + turn);
                const sin = Math.sin(base + turn);
                if (this.herdHeadingOk(body, cos, sin, turn !== 0)) {
                    headX = cos;
                    headZ = sin;
                    found = true;
                    break;
                }
            }
            if (!found) {
                headX = desireX;
                headZ = desireZ;
            }
        }
        // Eased, so that the body does not twitch whenever a neighbour's weight changes.
        const ease = herd.hx === 0 && herd.hz === 0 ? 1 : 0.4;
        const mixedX = herd.hx + (headX - herd.hx) * ease;
        const mixedZ = herd.hz + (headZ - herd.hz) * ease;
        const mixed = Math.hypot(mixedX, mixedZ) || 1;
        herd.hx = mixedX / mixed;
        herd.hz = mixedZ / mixed;
        return touching;
    },

    herdHeadingOk(body, hx, hz, strict) {
        const mob = body.mob;
        const data = mob.userData;
        const feet = body.y - data.flyHeight;
        const flying = data.flyHeight > 0;
        const climber = (getMobSpecies(data.species) || {}).movement === 'climb';
        const ax = body.x + hx * 0.6;
        const az = body.z + hz * 0.6;
        const floor = this.cameraController.getFloorY(ax, az, feet + (climber ? 2.5 : 1.1));
        if (floor <= -20 || floor - feet > (climber ? 2.3 : 1.01)) return false;
        if (!strict || flying) return true;
        if (feet - floor > 1.01) return false;
        return this.findWaterSurface(ax, floor + 0.1, az) === null || this.findWaterSurface(body.x, feet + 0.1, body.z) !== null;
    },

    // The goal of a mob that has a place (see tamingGoal), or null when it has none yet.
    herdGoal(mob) {
        const herd = mob.userData.herd;
        if (!herd || !herd.ready || !herd.leader) return null;
        const position = mob.position;
        if (herd.state === 'walk' && (herd.hx !== 0 || herd.hz !== 0)) {
            return Object.assign(new THREE.Vector3(position.x + herd.hx * 1.5, position.y, position.z + herd.hz * 1.5), { stopDistance: 0.01 });
        }
        // Standing: a point right in front of its nose, which it has reached already.
        const goal = new THREE.Vector3(position.x + herd.fx * 0.05, position.y, position.z + herd.fz * 0.05);
        return Object.assign(goal, { stopDistance: 1 });
    },

    // Is it far from where it should be? (Not the same as far from the player: a big herd's outer
    // ring stands more than 6 blocks away.) `fromPlayer` is all that is known without a place.
    herdLeftBehind(mob, fromPlayer) {
        const herd = mob.userData.herd;
        if (!herd || !herd.ready || herd.leader !== HERD_PLAYER) return fromPlayer > 6;
        return Math.hypot(herd.tx - mob.position.x, herd.tz - mob.position.z) > 4;
    },

    // Where a follower left far behind appears: its own place if it is free, or any free good spot
    // around the player. Returns { x, z, floor } or null.
    herdCatchUpSpot(mob, player) {
        const data = mob.userData;
        const herd = this.herdState(mob);
        const radius = this.herdRadius(mob);
        const controller = this.cameraController;
        const flying = data.flyHeight > 0;
        const feet = player.y - (controller.eyeHeight || 1.62);
        const ground = controller.getFloorY(player.x, player.z, feet + 0.5);
        if (ground <= -20) return null;
        const free = (x, z) => {
            for (const other of this.ambientMobs) {
                if (other === mob || !this.herdIsBody(other)) continue;
                const reach = radius + this.herdRadius(other);
                if (Math.abs(other.position.x - x) > reach || Math.abs(other.position.z - z) > reach) continue;
                if (flying !== (other.userData.flyHeight > 0)) continue;
                if (Math.hypot(other.position.x - x, other.position.z - z) < reach) return false;
            }
            return true;
        };
        const base = herd.ready && herd.radius ? herd.angle : Math.random() * Math.PI * 2;
        const first = herd.ready && herd.radius ? herd.radius : HERD.playerClear + radius;
        for (const ringRadius of [first, first + 1.6, first + 3.2, Math.max(1.2, first - 1.6)]) {
            for (const shift of HERD_SHIFTS) {
                const x = player.x + Math.cos(base + shift) * ringRadius;
                const z = player.z + Math.sin(base + shift) * ringRadius;
                if (!this.herdGroundOk(x, z, radius, ground, player.x, player.z, flying) || !free(x, z)) continue;
                const floor = controller.getFloorY(x, z, ground + 1.5);
                if (floor <= -20 || player.y - floor > 4) continue;
                return { x, z, floor };
            }
        }
        return null;
    },

    // It has just been put somewhere new: whatever it was walking to starts afresh.
    herdPlaced(mob) {
        const herd = this.herdState(mob);
        this.herdWalk(herd);
        herd.hx = 0;
        herd.hz = 0;
        herd.check = 0;
        herd.waitNext = HERD.waitMin;
    }
});
