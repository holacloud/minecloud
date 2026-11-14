// Mongolarachne: an extinct animal (js/mobSpecies.js) and an ancient relative of the spider, found as a rare
// fossil in the deep rock and brought back by the revival machine. The biggest fossil spider known: it looked
// like the golden orb-weavers of today, with a long abdomen and very long front legs. It walks as any ground
// mob (js/game/mobs.js), so the server walks a kept one (js/game/animals.js), and it starts nothing. What is
// its own is what it does when struck: it turns on whoever hit it and lifts its front legs, as a warning,
// and bites whoever is still within reach a moment later. Only the player who struck it sees that: mobs
// fight in each browser.

// The warning, in seconds and blocks: how long it stands with its legs up (time to step back), how near its
// middle the player has to be then for the bite to reach and how much higher or lower, what the bite takes,
// how long it stands still afterwards, and how far its front legs go up (radians).
const MONGOLARACHNE = { rear: 0.6, reach: 1.7, tall: 1.5, damage: 1, rest: 1.2, lift: 0.8 };

// Faces +z. Not the fat hunting spider of js/models.js: a small front half, a long abdomen marked with gold,
// and eight thin legs with a high knee. The first two pairs and the last are long, the third is short, as
// in an orb-weaver, and the long ones wear a dark tuft of hairs on the shin. Every size is a number of
// quarters of a unit: a texel is half a unit, and a smaller box is not painted.
function mongolarachneModel(b) {
    const dark = 0x2a1c12;
    const hide = 0x4a3420;
    const silver = 0xb9b3a2;
    const gold = 0xe0b030;
    const amber = 0xb8742a;
    b.part('body', {
        pivot: [0, 0, 0], from: [-1.25, 1.5, -0.5], size: [2.5, 1.5, 2.5],
        paint: { color: hide, noise: 0.07, faces: { top: (p) => { p.rect(0.5, 0.5, p.w - 1, p.h - 1, silver, 0.06); p.rect(p.w / 2 - 0.25, 0.5, 0.5, p.h - 1, hide, 0.05); } } }
    });
    b.part('abdomen', {
        parent: 'body', pivot: [0, 2.75, -0.5], from: [-1.5, -1.25, -5], size: [3, 2.5, 5],
        paint: { color: hide, noise: 0.07, all: (p, face) => {
            if (face === 'bottom') { p.rect(p.w / 2 - 0.5, 0.5, 1, p.h - 1, gold, 0.05); return; }
            if (face === 'top') {
                // Two rows of golden spots along the back.
                for (let y = 0.5; y < p.h - 0.5; y += 1.5) { p.rect(0.5, y, 0.5, 1, gold, 0.05); p.rect(p.w - 1, y, 0.5, 1, gold, 0.05); }
                p.rect(p.w / 2 - 0.5, 0, 1, p.h, dark, 0.05);
                return;
            }
            if (face === 'left' || face === 'right') for (let x = 0.5; x < p.w - 0.5; x += 1.5) p.rect(x, 1, 1, 0.5, gold, 0.05);
        } }
    });
    b.part('spinnerets', { parent: 'abdomen', pivot: [0, -1, -5], from: [-0.5, -0.375, -0.5], size: [1, 0.75, 0.5], paint: { color: dark, noise: 0.05 } });
    b.part('head', {
        parent: 'body', pivot: [0, 2.5, 2], from: [-1, -0.75, 0], size: [2, 1.25, 0.75],
        paint: { color: hide, noise: 0.06, faces: {
            top: (p) => p.fill(silver, 0.06),
            // Its eyes, small and dark, in two rows.
            front: (p) => { for (let x = 0; x < p.w; x += 1) { p.rect(x, 0, 0.5, 0.5, 0x070605, 0); p.rect(x + 0.5, 0.5, 0.5, 0.5, 0x070605, 0); } }
        } }
    });
    b.part('fangs', { parent: 'head', pivot: [0, -0.75, 0.25], from: [-0.75, -0.75, -0.25], size: [1.5, 0.75, 0.75], paint: { color: dark, noise: 0.04, faces: { front: (p) => { p.rect(0, 0.25, 0.5, 0.5, 0x8a2a1a, 0); p.rect(p.w - 0.5, 0.25, 0.5, 0.5, 0x8a2a1a, 0); } } } });

    // [how far it turns to the front, thigh, shin, how far the thigh rises, where it leaves the body]
    const reach = [[1, 3.5, 4.5, 0.55, 1.7], [0.45, 3.25, 4, 0.55, 1], [-0.3, 2, 2.5, 0.5, 0.35], [-0.95, 3.25, 4, 0.55, -0.25]];
    const legs = [];
    reach.forEach(([turn, thigh, shin, rise, z], i) => {
        // The shin comes down from the knee to the ground, whatever the lengths.
        const knee = 2.25 + thigh * Math.sin(rise);
        const bend = rise + Math.asin(Math.min(1, (knee - 0.25) / shin));
        const tuft = i !== 2;
        const shinPaint = { color: amber, noise: 0.05, bevel: 0.04, all: (p, face) => {
            if (face === 'left' || face === 'right') return;
            if (tuft) p.rect(Math.round(p.w * 0.3), 0, 1, p.h, dark, 0.05);
            p.rect(0, 0, 0.5, p.h, dark, 0.05);
            p.rect(p.w - 0.5, 0, 0.5, p.h, dark, 0.05);
        } };
        [['L', 1], ['R', -1]].forEach(([side, sign]) => {
            b.part(`leg${side}${i}`, { parent: 'body', pivot: [1.25 * sign, 2.25, z], from: [sign > 0 ? 0 : -thigh, -0.25, -0.25], size: [thigh, 0.5, 0.5], paint: { color: dark, noise: 0.05, bevel: 0.04 }, rotation: [0, -turn * sign, rise * sign] });
            b.part(`shin${side}${i}`, { parent: `leg${side}${i}`, pivot: [thigh * sign, 0, 0], from: [sign > 0 ? 0 : -shin, -0.25, -0.25], size: [shin, 0.5, 0.5], paint: shinPaint, rotation: [0, 0, -bend * sign] });
            legs.push(`leg${side}${i}`);
        });
    });
    // The two feelers of the mouth, short and held forward.
    b.part('palpL', { parent: 'head', pivot: [0.7, -0.5, 0.5], from: [-0.25, -0.25, 0], size: [0.5, 0.5, 1.25], paint: { color: amber, noise: 0.05 }, rotation: [0.5, 0.25, 0] });
    b.part('palpR', { parent: 'head', pivot: [-0.7, -0.5, 0.5], from: [-0.25, -0.25, 0], size: [0.5, 0.5, 1.25], paint: { color: amber, noise: 0.05 }, rotation: [0.5, -0.25, 0] });
    return { legs, head: 'head', legAxis: 'y' };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('mongolarachne', {
    info: { eggColor: 0xb8742a, tone: 260, maxHealth: 8, speed: 0.45, hiddenUntilDiscovered: true, ancestorOf: 'spider' },
    model: mongolarachneModel,
    surface: 'fur',
    // Its silk: the game has no other thread.
    drops: [['white_wool', 1, 2]],
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [], cage: true },
    fossil: { source: 'rock', rarity: 'rare' },
    card: {
        name: 'Mongolarachne', habitat: 'Forests of China, about 165 million years ago', activity: 'Day', temperament: 'Neutral',
        description: 'The biggest fossil spider ever found: 15 cm from leg tip to leg tip. It minds its own business, but if you hit it, it lifts its front legs and bites.'
    },
    cardEs: {
        name: 'Mongolarachne', habitat: 'Bosques de China, hace unos 165 millones de años',
        description: 'La araña fósil más grande que se ha encontrado: 15 cm de punta a punta de las patas. Va a lo suyo, pero si le pegas, levanta las patas de delante y muerde.'
    }
});

// A blow that did not finish it: it turns on the player.
onMobEvent('damaged', function (mob) {
    if (mob.userData.species === 'mongolarachne') this.mongolarachneProvoke(mob);
});

// While it warns, where it looks is its own business: asked before the server's walk and every other goal.
registerMobGoalFirst(function (mob) {
    return mob.userData.mongolarachneThreat ? this.mongolarachneGoal(mob) : null;
});

// Only the ones that are warning somebody: an empty list, nearly always.
registerFrameUpdate(function (delta) {
    this.mongolarachneUpdate(delta);
});

Object.assign(Game.prototype, {
    mongolarachneProvoke(mob) {
        const data = mob.userData;
        // (One in a cage has nowhere to rear up.)
        if (data.health <= 0 || data.mongolarachneThreat || data.trapsCage) return;
        data.mongolarachneThreat = { phase: 'rear', timer: MONGOLARACHNE.rear, lift: 0, goal: new THREE.Vector3() };
        (this.mongolarachneAngry || (this.mongolarachneAngry = [])).push(mob);
        // A dry hiss, as a warning.
        this.playNoiseBurst({ duration: 0.3, volume: 0.025, highpass: 1800, lowpass: 6000 });
    },

    // Where it "goes" while it warns: nowhere. The goal is the player, as a point it has always reached (the
    // ground mobs of js/game/mobs.js stand still within stopDistance and face their goal).
    mongolarachneGoal(mob) {
        const goal = mob.userData.mongolarachneThreat.goal;
        const player = this.getLocalPlayerPosition();
        goal.set(player.x, mob.position.y, player.z);
        goal.stopDistance = Infinity;
        return goal;
    },

    mongolarachneUpdate(delta) {
        const angry = this.mongolarachneAngry;
        if (!angry || angry.length === 0) return;
        for (let i = angry.length - 1; i >= 0; i--) {
            const mob = angry[i];
            if (mob.parent && this.mongolarachneWarning(mob, delta)) continue;
            mob.userData.mongolarachneThreat = null;
            if (mob.userData.modelRoot) mob.userData.modelRoot.rotation.x = 0;
            angry.splice(i, 1);
        }
    },

    // One frame of its anger: legs up, the bite, and legs down again. Returns whether it is still at it.
    mongolarachneWarning(mob, delta) {
        const data = mob.userData;
        const threat = data.mongolarachneThreat;
        if (!threat || this.titleScreenOpen || this.respawnPending) return false;
        threat.timer -= delta;
        if (threat.phase === 'rear' && threat.timer <= 0) {
            threat.phase = 'rest';
            threat.timer = MONGOLARACHNE.rest;
            const player = this.getLocalPlayerPosition();
            const feetGap = Math.abs(player.y - (this.cameraController.eyeHeight || 1.62) - mob.position.y);
            if (Math.hypot(player.x - mob.position.x, player.z - mob.position.z) <= MONGOLARACHNE.reach && feetGap <= MONGOLARACHNE.tall) {
                this.applyDamage(MONGOLARACHNE.damage, 'You were bitten by a mongolarachne', 'mob', mob.position);
                this.playNoiseBurst({ duration: 0.05, volume: 0.03, highpass: 900, lowpass: 4000 });
            }
        }
        // The front of its body and its first two legs go up while it warns, and come down after the bite.
        // It stands meanwhile, so the legs are put where they rest plus the lift, never added to what the
        // rig (animateMobRig) left: a frame the rig skips would add it twice.
        threat.lift += ((threat.phase === 'rear' ? 1 : 0) - threat.lift) * Math.min(1, delta * (threat.phase === 'rear' ? 12 : 16));
        const parts = data.modelParts || {};
        if (parts.legL0) parts.legL0.rotation.z = parts.legL0.userData.baseRotation.z + threat.lift * MONGOLARACHNE.lift;
        if (parts.legR0) parts.legR0.rotation.z = parts.legR0.userData.baseRotation.z - threat.lift * MONGOLARACHNE.lift;
        if (data.modelRoot) data.modelRoot.rotation.x = -0.3 * threat.lift;
        return threat.timer > 0;
    }
});
