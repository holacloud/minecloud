// The charge of the big neutral animals (the mammoth, js/game/mammoth.js; the triceratops,
// js/game/triceratops.js): struck by a blow that does not finish it, it calls out, turns on whoever hit it,
// lowers its head and paws the ground, then runs at where that player was, once, and stands for a moment.
// A species takes part with a row, `charge`, in its info (js/mobSpecies.js). Only the player who struck it
// sees the charge (mobs fight in each browser), and it never takes the animal far from its home: the server
// keeps a revived one inside a circle, and every other player's copy of it is still there.
// The same manner as the kubanochoerus' (js/game/kubanochoerus.js), for animals whose head is blocks in
// front of their middle.

// The row, in seconds and blocks:
//   aim      how long it stands and paws before it runs (time to step aside)
//   run      for how long it runs, at most, and `pace` how fast
//   reach    how near its middle the player has to be for the blow to land, and `tall` how far apart the
//            two may be in height
//   whisker  how far ahead of its middle it looks for a wall, a fence or a drop: where its head is, so that
//            it stops before its head goes into one (the walk of js/game/mobs.js looks 0.3 ahead)
//   damage   what the blow takes, `shove` and `lift` how hard it throws the player (js/camera.js)
//   rest     how long it stands afterwards, and `leash` the farthest from its home it ever runs
//   reason   the line of the death screen
//   cry      its call when struck: [start Hz, end Hz, seconds]
// A blow that did not finish it: it turns on the player.
onMobEvent('damaged', function (mob) {
    const info = getMobSpecies(mob.userData.species);
    if (info && info.charge) this.chargeProvoke(mob);
});

// While it is at it, where it goes is its own business: asked before the server's walk and every other goal.
registerMobGoalFirst(function (mob) {
    return mob.userData.chargeRun ? this.chargeGoal(mob) : null;
});

// Only the ones that are charging: an empty list, nearly always.
registerFrameUpdate(function (delta) {
    this.chargeUpdate(delta);
});

Object.assign(Game.prototype, {
    chargeProvoke(mob) {
        const data = mob.userData;
        const info = getMobSpecies(data.species);
        const row = info && info.charge;
        if (!row || data.health <= 0 || data.chargeRun) return;
        data.chargeRun = { row, phase: 'aim', timer: row.aim, heading: 0, goal: new THREE.Vector3() };
        (this.chargeAngry || (this.chargeAngry = [])).push(mob);
        const [from, to, seconds] = row.cry;
        this.playTone({ frequency: from, endFrequency: to, duration: seconds, type: 'sawtooth', volume: 0.03, attack: 0.04, release: 0.2 });
        this.playNoiseBurst({ duration: seconds * 0.6, volume: 0.025, highpass: 150, lowpass: 900 });
    },

    // Where it "goes" while it is angry: nowhere. The goal is a point it has always reached (the ground mobs
    // of js/game/mobs.js stand still within stopDistance and face their goal): the player while it aims,
    // and straight ahead once it runs, since chargeUpdate is what moves it then.
    chargeGoal(mob) {
        const run = mob.userData.chargeRun;
        const goal = run.goal;
        if (run.phase === 'aim') {
            const player = this.getLocalPlayerPosition();
            goal.set(player.x, mob.position.y, player.z);
        } else {
            goal.set(mob.position.x + Math.cos(run.heading) * 4, mob.position.y, mob.position.z + Math.sin(run.heading) * 4);
        }
        goal.stopDistance = Infinity;
        return goal;
    },

    chargeUpdate(delta) {
        const angry = this.chargeAngry;
        if (!angry || angry.length === 0) return;
        for (let i = angry.length - 1; i >= 0; i--) {
            const mob = angry[i];
            if (mob.parent && this.chargeRunning(mob, delta)) continue;
            mob.userData.chargeRun = null;
            angry.splice(i, 1);
        }
    },

    // One frame of its anger: it aims, runs and rests. Returns whether it is still at it.
    chargeRunning(mob, delta) {
        const data = mob.userData;
        const run = data.chargeRun;
        if (!run || this.titleScreenOpen || this.respawnPending) return false;
        const row = run.row;
        const player = this.getLocalPlayerPosition();
        const dx = player.x - mob.position.x;
        const dz = player.z - mob.position.z;
        run.timer -= delta;
        if (run.phase === 'rest') return run.timer > 0;

        // Head down, horns or tusks first: the rig (animateMobRig) is told, and hurried.
        data.lookTimer = 0.2;
        data.lookYaw = 0;
        data.lookPitch = 0.6;
        if (data.head) data.head.rotation.x += (data.head.userData.baseRotation.x + 0.6 - data.head.rotation.x) * Math.min(1, delta * 10);
        if (run.phase === 'aim') {
            // It paws the ground with a front leg.
            const leg = data.legs[0];
            if (leg) leg.rotation.x = leg.userData.baseRotation.x - 0.3 + Math.sin(run.timer * 18) * 0.4;
            if (run.timer <= 0) {
                run.phase = 'run';
                run.timer = row.run;
                // Straight at where the player is now: whoever steps aside in time is missed.
                run.heading = Math.atan2(dz, dx);
            }
            return true;
        }

        // Running: its legs go (the rig reads the gait and the step on the next frame).
        data.gait = 1;
        data.stepPhase += delta * 18;
        const moved = this.chargeStep(mob, run.heading, row.pace * delta);
        const feetGap = Math.abs(player.y - (this.cameraController.eyeHeight || 1.62) - mob.position.y);
        if (Math.hypot(dx, dz) <= row.reach && feetGap <= row.tall) {
            this.cameraController.applyKnockback(Math.cos(run.heading), Math.sin(run.heading), row.shove, row.lift);
            this.applyDamage(row.damage, row.reason, 'mob', mob.position);
            this.playNoiseBurst({ duration: 0.12, volume: 0.05, highpass: 70, lowpass: 600 });
            this.playTone({ frequency: 75, endFrequency: 45, duration: 0.15, type: 'square', volume: 0.03, release: 0.1 });
        } else if (moved && run.timer > 0) {
            return true;
        }
        run.phase = 'rest';
        run.timer = row.rest;
        data.lookPitch = 0;
        return true;
    },

    // One step of the charge along `heading`: up one block at most, never off a drop, into a wall or a fence
    // where its head is, or out of the reach of its home. Returns whether it took it.
    chargeStep(mob, heading, distance) {
        const row = mob.userData.chargeRun.row;
        const position = mob.position;
        const home = mob.userData.home;
        const x = position.x + Math.cos(heading) * distance;
        const z = position.z + Math.sin(heading) * distance;
        const away = Math.hypot(x - home.x, z - home.z);
        if (away > row.leash && away > Math.hypot(position.x - home.x, position.z - home.z)) return false;
        const controller = this.cameraController;
        const floor = controller.getFloorY(x, z, position.y + 1);
        if (floor <= -20 || floor - position.y > 1.01 || position.y - floor > 1.5) return false;
        // Its head goes first: the ground under it has to be walkable too, and so has every quarter of a
        // block on the way there (a fence post is a quarter of a block thick).
        for (let ahead = 0.25; ahead < row.whisker + 0.25; ahead += 0.25) {
            const reach = Math.min(ahead, row.whisker);
            const y = controller.getFloorY(x + Math.cos(heading) * reach, z + Math.sin(heading) * reach, position.y + 1);
            if (y - position.y > 1.01 || position.y - y > 1.5) return false;
        }
        position.set(x, floor, z);
        return true;
    }
});
