// The ancient firefly: an extinct animal (js/mobSpecies.js) and an ancient relative of the firefly, found in
// amber and brought back by the revival machine. A soft beetle of the age of the dinosaurs that already
// carried a lantern at the tip of its belly. The fireflies of today are a cloud of lights with no body
// (js/game/flyers.js, 'glow'); this is one beetle, big enough to look at, on the ground movement of
// js/game/mobs.js that hovers (`flyHeight`, as the macaw), so the server walks a kept one
// (js/game/animals.js). It harms nobody. What is its own is how it holds itself in the air and its light.
// Its wings never stop while it flies; when it has had nowhere to go for a while it comes down, shuts its
// wing covers over them and sits. Coming down moves only its model: the mob stays where the server has it,
// so every player sees it in the same place. Its light is a small bright box and a halo over the lantern of
// its model, lit from dusk to dawn and blinking. No lamp of the scene is lit for it: it shines, and lights
// nothing around it.

// Its wings (radians a second, and how far they sweep); after how many seconds without moving it lands, how
// fast it comes down and goes up (the bigger, the faster) and how long a blow keeps it in the air; and its
// light: how long it takes to come on at dusk (seconds), how much of it stays on between two blinks, how
// long a blink lasts and how many seconds pass from one to the next (each firefly picks its own), where the
// lantern is in the model, in sixteenths of a block (its middle, and the size of the box of light), and how
// big its halo is, in blocks.
const ANCIENT_FIREFLY = {
    beat: 50, sweep: 0.5, land: 5, settle: 2.5, startle: 4,
    dusk: 2, steady: 0.3, blink: 0.9, every: [2.5, 4.5], at: [0, 1.375, -1.475], size: [2, 1, 1.5], halo: 0.55
};

// Faces +z, standing on y = 0, which is how it lands (`flyHeight` lifts it the rest of the time). A flat
// dark body; the shield over its head, orange with a dark middle, as fireflies still wear; the two wing
// covers lifted out of the way, as a beetle holds them to fly; the wings themselves, pale, to the sides;
// and under the end of the body the lantern, pale yellow by day. Every size is a number of quarters of a
// unit: a texel is half a unit, and a smaller box is not painted.
function ancientFireflyModel(b) {
    const dark = 0x2a2320;
    const cover = 0x3a2e24;
    const edge = 0xd9c27a;
    const shield = 0xe0703a;
    const lamp = 0xd8f05a;
    b.part('body', {
        pivot: [0, 1.75, 0], from: [-0.75, -0.5, -2], size: [1.5, 1, 3.25],
        paint: { color: dark, noise: 0.04, faces: { bottom: (p) => { for (let y = 0.5; y < p.h; y += 1) p.rect(0, y, p.w, 0.5, 0x4a3e34, 0.03); } } }
    });
    b.part('pronotum', {
        parent: 'body', pivot: [0, 0.25, 1.25], from: [-1, -0.25, -0.25], size: [2, 0.5, 1.5],
        paint: { color: shield, noise: 0.05, faces: { top: (p) => { p.rect(p.w / 2 - 0.5, 0, 1, p.h - 0.5, dark, 0.04); p.rect(0, p.h - 0.5, p.w, 0.5, edge, 0.03); } } }
    });
    b.part('head', {
        parent: 'body', pivot: [0, -0.125, 1.25], from: [-0.5, -0.375, 0], size: [1, 0.75, 0.5],
        paint: { color: dark, noise: 0.03, faces: { front: (p) => { p.rect(0, 0, 0.5, 0.5, 0x070605, 0); p.rect(p.w - 0.5, 0, 0.5, 0.5, 0x070605, 0); } } }
    });
    // The lantern: the last rings of its belly. ancientFireflyUpdate lights it at night.
    b.part('lantern', { parent: 'body', pivot: [0, -0.5, -2], from: [-0.875, -0.25, -0.1], size: [1.75, 0.75, 1.25], paint: { color: lamp, noise: 0.04, surface: 'smooth', bevel: 0.05 } });

    // A wing cover, dark with a pale outer edge (on a face that looks up or down, x grows towards +x).
    const coverPaint = (sign) => ({ color: cover, noise: 0.05, all: (p, face) => {
        if (face === 'top' || face === 'bottom') p.rect(sign > 0 ? p.w - 0.5 : 0, 0, 0.5, p.h, edge, 0.03);
    } });
    const wingPaint = { color: 0xd4dcd6, noise: 0.03, bevel: 0.05, all: (p, face) => { if (face === 'top' || face === 'bottom') p.rect(0, 0.5, p.w, 0.5, 0xa8b4ae, 0); } };
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`antenna${side}`, { parent: 'head', pivot: [0.3 * sign, 0.2, 0.4], from: [-0.125, -0.125, 0], size: [0.25, 0.25, 1.75], paint: { color: dark, noise: 0.03 }, rotation: [-0.4, 0.5 * sign, 0] });
        // (ancientFireflyUpdate shuts the covers over the body when it lands, and beats the wings.)
        b.part(`cover${side}`, { parent: 'body', pivot: [0.5 * sign, 0.5, 1], from: [-0.5, 0, -3.25], size: [1, 0.25, 3.25], paint: coverPaint(sign), rotation: [0.4, -0.6 * sign, 0] });
        b.part(`wing${side}`, { parent: 'body', pivot: [0.6 * sign, 0.45, 0.5], from: [sign > 0 ? 0 : -2.5, 0, -1.2], size: [2.5, 0.25, 1.25], paint: wingPaint, rotation: [0, 0.2 * sign, 0.25 * sign] });
        [[0.8, 0.35], [0, 0], [-0.8, -0.35]].forEach(([z, lean], i) => {
            b.part(`leg${side}${i}`, { parent: 'body', pivot: [0.55 * sign, -0.4, z], from: [-0.125, -1.25, -0.125], size: [0.25, 1.25, 0.25], paint: { color: dark, noise: 0.03 }, rotation: [-lean, 0, 0.3 * sign] });
        });
    });
    return { head: 'head' };
}

// The whole species: what it is and its row in every table of the other features (js/extensions.js).
registerSpecies('ancient_firefly', {
    info: { eggColor: 0xb8d048, tone: 1600, maxHealth: 6, speed: 0.5, flyHeight: 0.9, hiddenUntilDiscovered: true, ancestorOf: 'firefly' },
    model: ancientFireflyModel,
    surface: 'skin',
    drops: [['glow_dust', 1, 1]],
    // No bait: one the server walks goes where the server says, never to a pile.
    trap: { baits: [], cage: true },
    fossil: { source: 'amber', rarity: 'rare' },
    card: {
        name: 'Ancient firefly', habitat: 'Damp forests of Myanmar, about 99 million years ago', activity: 'Day and night', temperament: 'Passive',
        description: 'An early firefly: a soft beetle that already carried a lantern at the tip of its belly. It hovers low over the ground, and when night falls its light blinks on and off.'
    },
    cardEs: {
        name: 'Luciérnaga antigua', habitat: 'Bosques húmedos de Myanmar, hace unos 99 millones de años',
        description: 'Una luciérnaga primitiva: un escarabajo blando que ya llevaba un farol en la punta de la barriga. Vuela bajo sobre el suelo y, cuando cae la noche, su luz se enciende y se apaga.'
    }
});

// Every ancient firefly there is, for ancientFireflyUpdate: a short list, and empty nearly always.
onMobEvent('spawned', function (mob) {
    if (mob.userData.species === 'ancient_firefly') (this.ancientFireflyMobs || (this.ancientFireflyMobs = [])).push(mob);
});

// A blow that did not finish it: up it goes, and it stays in the air for a while.
onMobEvent('damaged', function (mob) {
    if (mob.userData.species === 'ancient_firefly' && mob.userData.ancientFirefly) mob.userData.ancientFirefly.still = -ANCIENT_FIREFLY.startle;
});

registerFrameUpdate(function (delta) {
    this.ancientFireflyUpdate(delta);
});

Object.assign(Game.prototype, {
    // What one firefly keeps between frames, and its light: a bright box around the lantern of its model and
    // a halo. Their two materials are its own (removeMob, js/game/mobs.js, disposes of them); the picture of
    // the halo is the one every firefly of the game shares (js/game/flyers.js).
    ancientFireflyState(mob) {
        const data = mob.userData;
        const [x, y, z] = ANCIENT_FIREFLY.at;
        const [w, h, d] = ANCIENT_FIREFLY.size;
        const material = new THREE.MeshBasicMaterial({ color: 0xd8f05a });
        const box = new THREE.Mesh(new THREE.BoxGeometry(w / 16, h / 16, d / 16), material);
        box.position.set(x / 16, y / 16, z / 16);
        box.userData.disposeGeometry = true;
        box.userData.mobRoot = mob;
        box.visible = false;
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.getFireflyHaloTexture(), color: 0xc8f060, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
        halo.position.set(x / 16, y / 16, z / 16);
        halo.visible = false;
        data.glowMaterials = (data.glowMaterials || []).concat([material]);
        const every = ANCIENT_FIREFLY.every;
        data.ancientFirefly = { still: 0, down: 0, box, halo, material, glow: 0, period: every[0] + Math.random() * (every[1] - every[0]), phase: Math.random() * every[1] };
        return data.ancientFirefly;
    },

    // Wings, landing and light of every ancient firefly. The rig of js/game/mobs.js only flaps while a mob
    // moves, so its wings are not in its rig. The parts are read from the model each frame, since a change
    // of graphics builds it again; everything here is set, never added to what a frame left.
    ancientFireflyUpdate(delta) {
        const flies = this.ancientFireflyMobs;
        if (!flies || flies.length === 0) return;
        const night = this.isNightTime();
        // In Ultra the light is brighter than white, so the bloom gives it a glow (as js/game/flyers.js does).
        const boost = this.ultraModeEnabled ? 4 : 1;
        for (let i = flies.length - 1; i >= 0; i--) {
            const mob = flies[i];
            if (!mob.parent) {
                flies.splice(i, 1);
                continue;
            }
            const data = mob.userData;
            const parts = data.modelParts;
            const state = data.ancientFirefly || this.ancientFireflyState(mob);
            // A struck ground mob is thrown up and falls back to its floor (js/game/mobs.js), which for one
            // that hovers would be a slow sinking to the ground: it keeps the hop and not the fall.
            if (data.bounceVelocity < 0) data.bounceVelocity = 0;

            // Down when it has gone nowhere for a while, up as soon as it moves. One in a cage hangs in it.
            state.still = data.gait > 0.05 ? 0 : state.still + delta;
            const target = state.still > ANCIENT_FIREFLY.land && !data.trapsCage ? 1 : 0;
            state.down = data.trapsCage ? 0 : state.down + (target - state.down) * Math.min(1, delta * ANCIENT_FIREFLY.settle);
            // (All the way, and not nearly: on the ground nothing of it moves, and in the air nothing is folded.)
            if (Math.abs(target - state.down) < 0.001) state.down = target;
            // Its model comes down by what the mob hovers at: `flyHeight` and the bob mobs.js gives a hoverer.
            if (data.modelRoot && state.down > 0.001) data.modelRoot.position.y = -state.down * (data.flyHeight + Math.sin(data.stepPhase * 0.7) * 0.18);

            if (parts && parts.wingL && parts.wingR && parts.coverL && parts.coverR) {
                const air = 1 - state.down;
                const beat = Math.sin(data.life * ANCIENT_FIREFLY.beat) * ANCIENT_FIREFLY.sweep * air;
                this.ancientFireflyWing(parts.wingL, parts.coverL, 1, beat, air);
                this.ancientFireflyWing(parts.wingR, parts.coverR, -1, beat, air);
            }

            // The light hangs from the model, to come down with it: a model built again has lost it.
            if (data.modelRoot && state.box.parent !== data.modelRoot) {
                data.modelRoot.add(state.box);
                data.modelRoot.add(state.halo);
            }
            state.glow += ((night ? 1 : 0) - state.glow) * Math.min(1, delta / ANCIENT_FIREFLY.dusk);
            const lit = state.glow > 0.02;
            state.box.visible = lit;
            state.halo.visible = lit;
            if (!lit) continue;
            const cycle = (data.life + state.phase) % state.period;
            const flare = cycle < ANCIENT_FIREFLY.blink ? Math.sin(cycle / ANCIENT_FIREFLY.blink * Math.PI) : 0;
            const shine = (ANCIENT_FIREFLY.steady + (1 - ANCIENT_FIREFLY.steady) * flare) * state.glow;
            state.material.color.setRGB(0.85 * shine * boost, 0.95 * shine * boost, 0.35 * shine * boost);
            state.halo.material.opacity = 0.75 * shine;
            state.halo.scale.setScalar(ANCIENT_FIREFLY.halo * (0.5 + 0.5 * shine));
        }
    },

    // One side of it: the wing beating and its cover lifted (`air` 1), or the wing drawn in under the
    // cover, out of sight, and the cover shut flat over the back, edge to edge with the other (`air` 0).
    ancientFireflyWing(wing, cover, sign, beat, air) {
        const wingBase = wing.userData.baseRotation;
        wing.rotation.z = (wingBase.z + beat * sign) * air;
        wing.scale.x = 0.05 + 0.95 * air;
        wing.visible = air > 0.02;
        const coverBase = cover.userData.baseRotation;
        cover.rotation.x = coverBase.x * air;
        cover.rotation.y = coverBase.y * air;
    }
});
