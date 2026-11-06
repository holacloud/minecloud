// Ants: colonies of 8-20 tiny ants (red or black) around an anthill, a mound of soil with an
// entrance on top, on the grass, dirt or sand of plains, forests and deserts. The whole colony is
// one mob (species 'ant', movement 'anthill', model 'anthill'); its ants are drawn with a few
// InstancedMeshes (three segments, six legs walking in a tripod gait, elbowed antennae and the
// crumb they carry), so a colony costs four draw calls plus its mound.
//
// By day and in dry weather ants leave the nest one by one. Scouts wander off and, when they come
// near food (flowers, mushrooms, wheat crops, food items lying on the ground, bait piles from
// traps.js), pick up a crumb and walk it home: back at the nest they lay a pheromone trail that
// recruits other foragers, who follow it in single file and reinforce it on every trip. Trails
// fade when nobody walks them (the food is gone) and show as a faint dotted path. At night and
// in the rain every ant heads home and stays inside.
// Stepping on the anthill or striking it (or an ant: one blow squashes it) makes the colony swarm
// out and run over your feet for about 10 seconds; while two or more are on you they bite, gently
// (1 damage every 3 s). The colony replaces lost ants while calm.
//
// Ant farm: craft an `ant_farm` (glass, dirt, planks) and set it on the ground. Catch ants with
// the bug net on an anthill (traps.js gives an `ant_colony_jar`: a young queen and five workers)
// and right click the farm with the jar. The queen lays eggs that become larvae, pupae and new
// workers; the workers dig tunnels and chambers that grow visibly behind the glass. Feed them
// (seeds, wheat, bread, honeycomb, flowers, mushrooms, baits...) or they stop raising young.
// Farms are kept in localStorage and catch up on up to 30 minutes of the time away. Releasing a
// jar on the ground founds a new anthill.
// Mixed into Game.prototype; hooked through js/extensions.js.

const ANT_SLOTS = 20;
const ANT_COLONY_LIMIT = 4;
const ANT_MAX_OUTSIDE = 14;
const ANT_SPEED = 0.55;
const ANT_RUSH_SPEED = 1.9;
const ANT_SCALE = 1.15;
const ANT_FORAGE_RANGE = 13;
const ANT_SOURCE_LIMIT = 5;
const ANT_DISCOVER_RANGE = 2.2;
const ANT_TRAIL_FADE = 70;
const ANT_TRAIL_DOTS = 160;
const ANT_ANGER_TIME = 10;
const ANT_BITE_COOLDOWN = 3;
const ANT_REGROW = 20;
const ANT_RENDER_RANGE = 48;
const ANT_MOUND_TOP = 6.5 / 16;
// Tiers of the mound: [half width, top height] in blocks (see the anthill model).
const ANT_MOUND_TIERS = [[2.5 / 16, 6.5 / 16], [4 / 16, 5.5 / 16], [5.5 / 16, 4 / 16], [7 / 16, 2 / 16]];
const ANT_SOIL = ['grass', 'dirt', 'sand'];

// Variant 0: red wood ants (needle mound); 1: black garden ants (soil mound); 2: red harvester
// ants (sand mound, deserts). Only 0 and 1 are picked at random.
const ANT_VARIANTS = [
    { name: 'red', body: 0x9a3018, dark: 0x4a160a },
    { name: 'black', body: 0x2a2424, dark: 0x0e0b0b },
    { name: 'red', body: 0xa83a1c, dark: 0x521a0c }
];

// Food the foragers carry crumbs of: blocks in the world (crumb colour) and items on the ground.
const ANT_FOOD_BLOCKS = {
    flower_red: 0xd8402e, flower_yellow: 0xf0d040, mushroom_red: 0xd8604a, mushroom_brown: 0xc8a078,
    wheat_2: 0xb8b060, wheat_3: 0xe6c65c
};
const ANT_FOOD_ITEMS = [
    'wheat', 'wheat_seeds', 'bread', 'honeycomb', 'honey_bottle', 'cheese', 'raw_fish', 'cooked_fish', 'roast_mushroom',
    'mushroom_red', 'mushroom_brown', 'flower_red', 'flower_yellow',
    'bait_seeds', 'bait_worms', 'bait_meat', 'bait_fish', 'bait_honey'
];

// Bait piles (traps.js) they raid; the same list as TRAPS_SPECIES.ant.baits.
const ANT_BAITS = ['bait_seeds', 'bait_honey', 'bait_meat'];

// Ant farm: what feeding it with each item adds to its food store (0..1).
const ANT_FARM_FOODS = {
    wheat_seeds: 0.3, wheat: 0.4, bread: 0.8, honeycomb: 0.8, cheese: 0.6, raw_fish: 0.5, cooked_fish: 0.5, roast_mushroom: 0.4,
    flower_red: 0.25, flower_yellow: 0.25, mushroom_red: 0.35, mushroom_brown: 0.35,
    bait_seeds: 0.4, bait_worms: 0.4, bait_meat: 0.5, bait_fish: 0.4, bait_honey: 0.6
};
const ANT_FARM_MAX_WORKERS = 30;
const ANT_FARM_MAX_NODES = 90;
const ANT_FARM_JAR_WORKERS = 5;
// Seconds as egg, larva and pupa.
const ANT_BROOD_TIMES = [50, 70, 60];
const ANT_FARM_CATCH_UP = 1800;
const ANT_FARM_STORAGE = 'minecloud-ants';
// The soil slab behind the glass: size in blocks and its canvas.
const ANT_FARM_W = 0.8;
const ANT_FARM_H = 0.64;
const ANT_CANVAS_W = 128;
const ANT_CANVAS_H = 102;
const ANT_CANVAS_SURFACE = 12;

const _antBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
const _antStickGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0);
const _antDotGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const _antMaterials = new Map();
const _antCrumbMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
const _antTrailMaterial = new THREE.MeshBasicMaterial({ color: 0x2a1c10, transparent: true, opacity: 0.3, depthWrite: false });
const _antZero = new THREE.Matrix4().makeScale(0, 0, 0);
const _antBase = new THREE.Matrix4();
const _antPart = new THREE.Matrix4();
const _antMatrix = new THREE.Matrix4();
const _antQuat = new THREE.Quaternion();
const _antEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _antPos = new THREE.Vector3();
const _antScale = new THREE.Vector3();
const _antVec = new THREE.Vector3();
const _antColor = new THREE.Color();

// Ant body in blocks (before ANT_SCALE), facing +z, origin on the ground under the thorax:
// [x, y, z, width, height, length] of the gaster, the thorax and the head; and the crumb.
const ANT_PART_MATRICES = [
    [0, 0.034, -0.052, 0.046, 0.04, 0.06],
    [0, 0.036, 0.004, 0.026, 0.024, 0.046],
    [0, 0.042, 0.048, 0.036, 0.032, 0.032]
].map(([x, y, z, w, h, d]) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d)));
const ANT_CRUMB_MATRIX = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.072, -0.012), new THREE.Quaternion(), new THREE.Vector3(0.036, 0.03, 0.036));
// Legs: hip on each side of the thorax (front, middle, back), splayed forward, out and back.
const ANT_LEG_Z = [0.018, 0.004, -0.012];
const ANT_LEG_SPLAY = [0.75, 0.1, -0.7];
const ANT_LEG_SCALE = new THREE.Vector3(0.062, 0.008, 0.008);
const ANT_ANTENNA_SCALE = new THREE.Vector3(0.052, 0.006, 0.006);
const ANT_HIPS = [];
for (let i = 0; i < 6; i++) ANT_HIPS.push(new THREE.Vector3(i < 3 ? 0.012 : -0.012, 0.034, ANT_LEG_Z[i % 3]));
const ANT_ANTENNA_ROOTS = [new THREE.Vector3(0.008, 0.054, 0.062), new THREE.Vector3(-0.008, 0.054, 0.062)];

function antsMaterial(color) {
    let material = _antMaterials.get(color);
    if (!material) {
        material = new THREE.MeshLambertMaterial({ color });
        _antMaterials.set(color, material);
    }
    return material;
}

// Height of the mound's surface at `r` blocks from its centre.
function antsMoundHeight(r) {
    for (const [half, top] of ANT_MOUND_TIERS) {
        if (r <= half) return top;
    }
    return 0;
}

// ---------------------------------------------------------------------------------------
// Species, models and items

MOB_SPECIES.ant = {
    eggColor: 0x7a2a18, tone: 2600, speed: ANT_SPEED, variants: 2, group: [8, 20], limit: ANT_COLONY_LIMIT,
    movement: 'anthill'
};

VoxelModels.MOB_SURFACES.ant = 'skin';
VoxelModels.MOB_SURFACES.anthill = 'skin';

// One ant, big, for the bestiary and the guide (in the world they are drawn much smaller by
// ants.js). Faces +z: gaster, petiole, thorax, head with mandibles and elbowed antennae, six legs.
VoxelModels.mobBuilders.ant = function (b, variant = 0) {
    const tone = ANT_VARIANTS[variant] || ANT_VARIANTS[0];
    const shell = { color: tone.body, noise: 0.05, surface: 'smooth' };
    const dark = { color: tone.dark, noise: 0.04, surface: 'smooth' };
    b.part('body', { pivot: [0, 5, 0], from: [-1.25, -1, -2], size: [2.5, 2.5, 4], paint: shell });
    b.part('petiole', { parent: 'body', pivot: [0, 0, -2], from: [-0.75, -0.6, -1.2], size: [1.5, 1.8, 1.2], paint: dark });
    b.part('gaster', {
        parent: 'body', pivot: [0, 0.3, -3.2], from: [-2.4, -2, -5.4], size: [4.8, 4.4, 5.4],
        paint: { ...shell, color: variant === 1 ? tone.body : tone.dark, all: (p, face) => {
            if (face === 'front' || face === 'back') return;
            for (let x = 1.2; x < p.w; x += 1.5) p.rect(x, 0, 0.3, p.h, tone.dark, 0.03);
        } }
    });
    b.part('head', {
        parent: 'body', pivot: [0, 0.6, 2], from: [-1.75, -1.4, 0], size: [3.5, 3, 3],
        paint: { ...shell, all: (p, face) => {
            if (face === 'left' || face === 'right') p.rect(p.w / 2 - 0.6, 0.6, 1.2, 1, 0x050404, 0);
        } }
    });
    [['L', 1], ['R', -1]].forEach(([side, sign]) => {
        b.part(`mandible${side}`, { parent: 'head', pivot: [0.8 * sign, -1, 3], from: [-0.3, -0.25, 0], size: [0.6, 0.5, 1.2], paint: dark, rotation: [0, -0.4 * sign, 0] });
        b.part(`antenna${side}`, { parent: 'head', pivot: [0.9 * sign, 1.2, 2.6], from: [-0.25, -0.25, 0], size: [0.5, 0.5, 2.6], paint: dark, rotation: [-0.7, 0.45 * sign, 0] });
        b.part(`antennaTip${side}`, { parent: `antenna${side}`, pivot: [0, 0, 2.6], from: [-0.2, -0.2, 0], size: [0.4, 0.4, 2.8], paint: dark, rotation: [1.2, 0, 0] });
        [1.2, 0, -1.2].forEach((z, index) => {
            const splay = [0.7, 0, -0.6][index];
            b.part(`leg${side}${index}`, {
                parent: 'body', pivot: [1.25 * sign, -0.4, z], from: [sign > 0 ? 0 : -3, -0.25, -0.25], size: [3, 0.5, 0.5],
                paint: dark, rotation: [0, -splay * sign, 0.35 * sign]
            });
            b.part(`shin${side}${index}`, {
                parent: `leg${side}${index}`, pivot: [3 * sign, 0, 0], from: [sign > 0 ? 0 : -4.6, -0.2, -0.2], size: [4.6, 0.4, 0.4],
                paint: dark, rotation: [0, 0, -1.25 * sign]
            });
        });
    });
    return { head: 'head' };
};

// The colony's mound, sitting on its block with the entrance on top (its origin, at the bottom
// centre, is the mob's position). Variant 0 is thatched with pine needles, 1 is crumbly soil,
// 2 is sand.
VoxelModels.mobBuilders.anthill = function (b, variant = 0) {
    const palettes = [
        { base: 0x7a4e26, light: 0xa8743e, dark: 0x4e3016 },
        { base: 0x5e432c, light: 0x7a5a3e, dark: 0x3a2818 },
        { base: 0xd2b880, light: 0xe6d29c, dark: 0xb09060 }
    ];
    const tone = palettes[variant] || palettes[0];
    const paint = { color: tone.base, noise: 0.09, all: (p) => {
        if (variant === 0) {
            for (let i = 0; i < p.w * p.h / 3; i++) {
                const x = ((i * 37) % 97) / 97 * p.w;
                const y = ((i * 53) % 89) / 89 * p.h;
                p.rect(x, y, i % 2 ? 1.2 : 0.25, i % 2 ? 0.25 : 1.2, i % 3 ? tone.light : tone.dark, 0.03);
            }
        } else {
            p.spots(tone.light, Math.ceil(p.w * p.h / 5), 0.25, 0.6, 3);
            p.spots(tone.dark, Math.ceil(p.w * p.h / 6), 0.25, 0.5, 9);
        }
    } };
    let bottom = 0;
    const tiers = [...ANT_MOUND_TIERS].reverse();
    tiers.forEach(([half, top], index) => {
        const w = half * 32;
        const h = (top - bottom) * 16;
        b.part(index === 0 ? 'body' : `tier${index}`, {
            parent: index === 0 ? undefined : 'body', pivot: [0, 0, 0], from: [-w / 2, bottom * 16, -w / 2], size: [w, h, w],
            paint: index === tiers.length - 1 ? { ...paint, faces: { top: (p) => { p.rect(p.w / 2 - 0.9, p.h / 2 - 0.9, 1.8, 1.8, 0x140c06, 0); } } } : paint
        });
        bottom = top;
    });
    // Excavated pellets around the foot.
    [[5.5, 4], [-6, 2.5], [2, -6.5], [-3.5, -5.5], [6.5, -2]].forEach(([x, z], index) => {
        b.part(`pellet${index}`, { parent: 'body', pivot: [x, 0, z], from: [-0.5, 0, -0.5], size: [1, 0.6, 1], paint: { color: tone.light, noise: 0.05 } });
    });
    return {};
};

const ANT_SPRITES = {
    ant_farm: [
        '............',
        '.WWWWWWWWWW.',
        '.WGGGGGGGGW.',
        '.WSSSSSSSSW.',
        '.WSTSSSSTSW.',
        '.WSTTSSTTSW.',
        '.WSSTSSTSSW.',
        '.WSSTTTTSSW.',
        '.WSSSSTSSSW.',
        '.WSSSSTTSSW.',
        'DDDDDDDDDDDD',
        '............'
    ],
    ant_colony_jar: [
        '............',
        '....CCCC....',
        '....cccc....',
        '...G....G...',
        '..G......G..',
        '..G.a..a.G..',
        '..GSSSSSSG..',
        '..GSaSSSaG..',
        '..GSSSaSSG..',
        '..GSSSSSSG..',
        '...GGGGGG...',
        '............'
    ]
};

registerItemType('ant_farm', {
    color: 0x9c7a50, name: 'Ant Farm',
    drawIcon: resourcesDrawSprite(ANT_SPRITES.ant_farm, { W: 0xb08a58, D: 0x8a6236, G: 0xcfeef8, S: 0x9a7650, T: 0x3a2a1c }),
    displayMesh: resourcesDisplayMesh
});
registerItemType('ant_colony_jar', {
    color: 0x9a7650, name: 'Ant Colony Jar',
    drawIcon: resourcesDrawSprite(ANT_SPRITES.ant_colony_jar, { C: 0x9c7448, c: 0x6e5030, G: 0xbfe8f5, S: 0x8a6a48, a: 0x2a1410 }),
    displayMesh: resourcesDisplayMesh
});

registerGameContent(function ({ addItem, addRecipe }) {
    addRecipe('ant_farm', 'Build Ant Farm', 'ant_farm', 1, [{ type: 'glass', amount: 3 }, { type: 'dirt', amount: 2 }, { type: 'planks', amount: 2 }]);
    addItem('ant_colony_jar');
});

registerMobBehaviour('anthill', {
    update(mob, delta, player) { this.antsUpdateColony(mob, delta, player); },
    interact(mob) { this.antsHit(mob); },
    spawnCommand(species, x, z, player) { return this.antsSpawnFromCommand(x, z, player); },
    spawnEgg(species, position) { return this.antsSpawnFromEgg(position); },
    spawnForChunk(chunkX, chunkZ, biome) { this.antsSpawnForChunk(chunkX, chunkZ, biome); }
});

// A farm in front of the targeted block takes the click before anything else would use that
// block (seeds would be sown, bait set down...), so this one goes first in the list.
ITEM_USE_HANDLERS.unshift(function (item, hit) {
    return this.antsUseFarmUnderCrosshair(item, hit);
});

registerItemUseHandler(function (item, hit) {
    return this.antsHandleUse(item, hit);
});

registerFrameUpdate(function (delta) {
    this.antsFarmUpdate(delta);
});

onMobEvent('removed', function (mob) {
    const colony = mob.userData.antColony;
    if (!colony) return;
    colony.meshes.forEach((mesh) => {
        mob.remove(mesh);
        if (mesh.dispose) mesh.dispose();
    });
    colony.meshes = [];
    mob.userData.trapsNetPoints = null;
});

Object.assign(Game.prototype, {
    // ---------------------------------------------------------------------------------------
    // Spawning

    // A spot for an anthill on top of the block at (x, z): soft ground, nothing on it.
    antsSpotAt(x, z, topY) {
        const bx = Math.floor(x);
        const bz = Math.floor(z);
        const floor = this.cameraController.getFloorY(bx + 0.5, bz + 0.5, topY);
        if (floor <= -20 || Math.abs(floor - Math.round(floor)) > 0.01) return null;
        const y = Math.round(floor);
        const ground = this.world.getBlockTypeAt(bx, y - 1, bz);
        if (!ANT_SOIL.includes(ground)) return null;
        const above = this.world.getBlockTypeAt(bx, y, bz);
        if (above && above !== 'air' && above !== 'tall_grass') return null;
        if (this.findWaterSurface(bx + 0.5, y + 0.1, bz + 0.5) !== null) return null;
        return { position: new THREE.Vector3(bx + 0.5, y, bz + 0.5), sandy: ground === 'sand' };
    },

    antsSpotNear(x, z, topY, radius) {
        for (let r = 0; r <= radius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const spot = this.antsSpotAt(x + dx, z + dz, topY);
                    if (spot) return spot;
                }
            }
        }
        return null;
    },

    antsColonyCount() {
        return this.ambientMobs.filter((mob) => mob.userData.antColony).length;
    },

    antsSpawnColony(position, count, variant) {
        const mob = this.createMob('ant', position, { variant, modelSpecies: 'anthill' });
        this.antsInitColony(mob, count);
        this.ambientMobs.push(mob);
        return mob;
    },

    antsInitColony(mob, count) {
        const data = mob.userData;
        if (data.modelSpecies !== 'anthill') {
            // Made by someone else's createMob('ant'): give it its mound.
            data.modelSpecies = 'anthill';
            this.attachMobModel(mob);
        }
        data.antFacing = Math.floor(Math.random() * 4) * Math.PI / 2;
        const tone = ANT_VARIANTS[data.variant] || ANT_VARIANTS[0];
        const colony = {
            size: Math.min(ANT_SLOTS, count), ants: [], sources: [], anger: 0, biteCooldown: 0, regrow: ANT_REGROW,
            scan: Math.random() * 2, groundCheck: 0.5, trailTimer: 0, frame: Math.floor(Math.random() * 3), shake: 0,
            seen: false, rustle: 0, entrance: new THREE.Vector3(mob.position.x, mob.position.y + ANT_MOUND_TOP, mob.position.z),
            meshes: []
        };
        data.antColony = colony;

        const body = new THREE.InstancedMesh(_antBoxGeometry, antsMaterial(tone.body), ANT_SLOTS * 3);
        const limbs = new THREE.InstancedMesh(_antStickGeometry, antsMaterial(tone.dark), ANT_SLOTS * 8);
        const crumbs = new THREE.InstancedMesh(_antBoxGeometry, _antCrumbMaterial, ANT_SLOTS);
        const trail = new THREE.InstancedMesh(_antDotGeometry, _antTrailMaterial, ANT_TRAIL_DOTS);
        [body, limbs, crumbs, trail].forEach((mesh) => {
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.frustumCulled = false;
            for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, _antZero);
            mob.add(mesh);
        });
        // Only the bodies can be struck; the rest is too thin to matter.
        body.userData.mobRoot = mob;
        [limbs, crumbs, trail].forEach((mesh) => { mesh.raycast = () => {}; });
        for (let i = 0; i < ANT_SLOTS; i++) crumbs.setColorAt(i, _antColor.set(0xffffff));
        trail.count = 0;
        colony.meshes = [body, limbs, crumbs, trail];
        colony.body = body;
        colony.limbs = limbs;
        colony.crumbs = crumbs;
        colony.trail = trail;

        // The net aims at the entrance and at every ant (see trapsFindNetTarget).
        const entranceAnchor = new THREE.Object3D();
        entranceAnchor.position.set(0, ANT_MOUND_TOP, 0);
        mob.add(entranceAnchor);
        data.trapsNetPoints = [entranceAnchor];
        data.trapsNetCatch = function (target) { return this.antsNetCatch(target); };

        for (let slot = 0; slot < ANT_SLOTS; slot++) {
            const anchor = new THREE.Object3D();
            anchor.position.copy(entranceAnchor.position);
            mob.add(anchor);
            data.trapsNetPoints.push(anchor);
            colony.ants.push({
                slot, alive: slot < colony.size, state: slot < colony.size ? 'inside' : 'dead', timer: 0.5 + Math.random() * 8,
                pos: colony.entrance.clone(), yaw: 0, pitch: 0, phase: Math.random() * 10, lane: (Math.random() - 0.5) * 0.1,
                pace: 0.85 + Math.random() * 0.3, seed: Math.random() * Math.PI * 2, path: null, s: 0, seg: 0, dir: 1,
                source: null, carrying: null, crumbColor: null, target: new THREE.Vector3(), anchor
            });
        }
    },

    // Natural spawning: now and then a plains, forest or desert chunk has an anthill.
    antsSpawnForChunk(chunkX, chunkZ, biome) {
        const chance = { plains: 0.2, forest: 0.18, desert: 0.14 }[biome] ?? (biome === 'rocky' ? 0 : 0.2);
        if (this.chunkRandom(chunkX, chunkZ, 1301) > chance) return;
        if (this.antsColonyCount() >= ANT_COLONY_LIMIT) return;
        const size = this.world.chunkSize;
        for (let attempt = 0; attempt < 8; attempt++) {
            const x = chunkX * size + 2 + this.chunkRandom(chunkX, chunkZ, 1310 + attempt) * (size - 4);
            const z = chunkZ * size + 2 + this.chunkRandom(chunkX, chunkZ, 1320 + attempt) * (size - 4);
            const spot = this.antsSpotAt(x, z, 64);
            if (!spot) continue;
            // Wood ants in the forest, garden ants on the plains, harvesters on the sand.
            let variant = spot.sandy ? 2 : biome === 'forest' ? 0 : 1;
            if (!spot.sandy && this.chunkRandom(chunkX, chunkZ, 1302) < 0.25) variant = 1 - variant;
            const [min, max] = getMobSpecies('ant').group;
            const count = min + Math.floor(this.chunkRandom(chunkX, chunkZ, 1303) * (max - min + 1));
            const mob = this.antsSpawnColony(spot.position, count, variant);
            mob.userData.natural = true;
            mob.userData.spawnChunk = this.world.chunkKey(chunkX, chunkZ);
            return;
        }
    },

    antsShelterMessage() {
        return this.antsSheltering() ? ' (at night and in the rain they stay inside)' : '';
    },

    antsSheltering() {
        return this.isNightTime() || this.weatherState === 'rain';
    },

    // /mob ant: an anthill a few blocks ahead.
    antsSpawnFromCommand(x, z, player) {
        const spot = this.antsSpotNear(x, z, player.y + 4, 4);
        if (!spot) {
            this.receiveSystemMessage({ text: 'Ants need a patch of grass, dirt or sand for their anthill' });
            return true;
        }
        const variant = spot.sandy ? 2 : Math.floor(Math.random() * 2);
        const [min, max] = getMobSpecies('ant').group;
        const mob = this.antsSpawnColony(spot.position, min + Math.floor(Math.random() * (max - min + 1)), variant);
        const colony = mob.userData.antColony;
        this.receiveSystemMessage({ text: `Spawned an anthill with ${colony.size} ${ANT_VARIANTS[variant].name} ants${this.antsShelterMessage()}` });
        return true;
    },

    antsSpawnFromEgg(position) {
        const spot = this.antsSpotAt(position.x + 0.5, position.z + 0.5, position.y + 0.5);
        if (!spot) {
            this.receiveSystemMessage({ text: 'Place it on grass, dirt or sand: ants dig their nest in soft ground' });
            return true;
        }
        const variant = spot.sandy ? 2 : Math.floor(Math.random() * 2);
        const [min, max] = getMobSpecies('ant').group;
        this.antsSpawnColony(spot.position, min + Math.floor(Math.random() * (max - min + 1)), variant);
        this.consumeSelectedBlock();
        this.playPlaceSound('grass');
        this.receiveSystemMessage({ text: `An anthill of ${ANT_VARIANTS[variant].name} ants appeared${this.antsShelterMessage()}` });
        this.placeActionTimer = 0.35;
        this.showHitIndicator();
        return true;
    },

    // ---------------------------------------------------------------------------------------
    // The colony, once per frame

    antsUpdateColony(mob, delta, player) {
        const data = mob.userData;
        if (!data.antColony) this.antsInitColony(mob, 10);
        const colony = data.antColony;
        data.life += delta;
        const distance = Math.hypot(player.x - mob.position.x, player.z - mob.position.z);
        if (data.modelRoot) data.modelRoot.rotation.y = data.antFacing;
        if (distance > 96) return;
        // A chunk that is not loaded reads as air, which says nothing about its ground: the colony
        // waits for it (walking back from far away, or while a reconnection brings the world again).
        if (!this.world.getColumnAt(Math.floor(mob.position.x), Math.floor(mob.position.z))) return;

        // The mound goes when its block is dug out or built over.
        colony.groundCheck -= delta;
        if (colony.groundCheck <= 0) {
            colony.groundCheck = 0.5;
            const x = Math.floor(mob.position.x);
            const y = Math.round(mob.position.y);
            const z = Math.floor(mob.position.z);
            if (!this.world.hasSolidBlock(x, y - 1, z) || this.world.hasSolidBlock(x, y, z)) {
                if (distance < 10) this.receiveSystemMessage({ text: 'The anthill was destroyed and the ants scattered' });
                this.removeMob(mob);
                return;
            }
        }

        const feetY = player.y - (this.cameraController.eyeHeight || 1.6);
        const near = distance < 14 && !this.respawnPending && !this.titleScreenOpen;
        colony.anger = Math.max(0, colony.anger - delta * (near ? 1 : 3));
        colony.biteCooldown = Math.max(0, colony.biteCooldown - delta);
        colony.shake = Math.max(0, colony.shake - delta * 2);
        // Standing on the anthill stirs it up.
        if (near && distance < 0.75 && feetY > mob.position.y - 0.3 && feetY < mob.position.y + 0.9) this.antsProvoke(mob, 'trample');

        const sheltering = this.antsSheltering();
        colony.scan -= delta;
        if (colony.scan <= 0) {
            colony.scan = 3;
            if (distance < 64) this.antsScanFood(mob, sheltering);
        }
        colony.sources.forEach((source) => {
            source.strength *= Math.exp(-delta / ANT_TRAIL_FADE);
            if (source.known && source.strength < 0.15) source.known = false;
        });

        // Lost ants are replaced while the colony is calm.
        const alive = colony.ants.filter((ant) => ant.alive).length;
        if (alive < colony.size && colony.anger <= 0) {
            colony.regrow -= delta;
            if (colony.regrow <= 0) {
                colony.regrow = ANT_REGROW;
                const slot = colony.ants.find((ant) => !ant.alive);
                if (slot) this.antsRevive(colony, slot);
            }
        }

        let outside = 0;
        colony.ants.forEach((ant) => { if (ant.alive && ant.state !== 'inside') outside++; });
        colony.outside = outside;
        for (const ant of colony.ants) {
            if (ant.alive) this.antsUpdateAnt(mob, colony, ant, delta, player, feetY, sheltering, near);
        }
        if (colony.anger > 0 && near) this.antsBite(mob, colony, player, feetY);

        // The bestiary: the mound is a colony of a different model, so ants are noted here.
        if (!colony.seen && distance < 10 && (colony.outside > 0 || distance < 5)) {
            colony.seen = true;
            if (this.bestiaryInstalled && this.bestiaryEncounter) this.bestiaryEncounter('ant');
        }

        if (data.modelRoot) {
            data.modelRoot.rotation.z = Math.sin(data.life * 31) * 0.05 * colony.shake;
            data.modelRoot.rotation.x = Math.sin(data.life * 23) * 0.04 * colony.shake;
        }
        if (colony.anger > 0 && near) {
            colony.rustle -= delta;
            if (colony.rustle <= 0) {
                colony.rustle = 0.12;
                this.playNoiseBurst({ duration: 0.05, volume: 0.004, highpass: 3500, lowpass: 9000 });
            }
        }

        // Drawing: every frame up close, every third frame further away.
        const camera = this.camera.position;
        const view = Math.hypot(camera.x - mob.position.x, camera.z - mob.position.z);
        colony.frame++;
        if (view < ANT_RENDER_RANGE && (view < 20 || colony.frame % 3 === 0)) this.antsRender(mob, colony);
        colony.trailTimer -= delta;
        if (colony.trailTimer <= 0) {
            colony.trailTimer = 0.4;
            this.antsRenderTrails(mob, colony);
        }
    },

    antsRevive(colony, ant) {
        ant.alive = true;
        ant.state = 'inside';
        ant.timer = 2 + Math.random() * 4;
        ant.pos.copy(colony.entrance);
        ant.carrying = null;
        ant.path = null;
        ant.source = null;
    },

    antsKill(colony, ant) {
        ant.alive = false;
        ant.state = 'dead';
        ant.carrying = null;
        ant.path = null;
        ant.source = null;
        ant.anchor.position.set(0, ANT_MOUND_TOP, 0);
    },

    // ---------------------------------------------------------------------------------------
    // Food and trails

    antsSourceValid(source) {
        if (source.kind === 'bait') return source.ref.amount > 0 && Boolean(source.ref.group.parent);
        if (source.kind === 'pickup') return Boolean(this.pickups && this.pickups.has(source.ref));
        return this.world.getBlockTypeAt(source.cell.x, source.cell.y, source.cell.z) === source.block;
    },

    // Every few seconds: drop sources that are gone and look for new ones around the nest.
    antsScanFood(mob, sheltering) {
        const colony = mob.userData.antColony;
        colony.sources = colony.sources.filter((source) => this.antsSourceValid(source));
        if (sheltering || colony.sources.length >= ANT_SOURCE_LIMIT) return;
        const origin = mob.position;
        const keys = new Set(colony.sources.map((source) => source.key));
        const candidates = [];
        const inRange = (x, y, z) => {
            const gap = Math.hypot(x - origin.x, z - origin.z);
            return gap > 1 && gap <= ANT_FORAGE_RANGE && Math.abs(y - origin.y) < 3;
        };

        (this.trapsBaits || []).forEach((bait) => {
            if (bait.amount <= 0 || !ANT_BAITS.includes(bait.type) || !inRange(bait.position.x, bait.position.y, bait.position.z)) return;
            if (!bait.antsKey) bait.antsKey = `bait:${Math.random().toString(36).slice(2)}`;
            if (keys.has(bait.antsKey)) return;
            const color = typeof TRAPS_BAITS !== 'undefined' && TRAPS_BAITS[bait.type] ? TRAPS_BAITS[bait.type].color : 0xd9c27a;
            candidates.push({ key: bait.antsKey, kind: 'bait', ref: bait, pos: bait.position.clone(), color });
        });
        if (this.pickups) {
            for (const [id, pickup] of this.pickups) {
                if (!ANT_FOOD_ITEMS.includes(pickup.type) || keys.has(`p:${id}`)) continue;
                if (!inRange(pickup.position.x, pickup.position.y, pickup.position.z)) continue;
                const floor = this.cameraController.getFloorY(pickup.position.x, pickup.position.z, pickup.position.y + 0.5);
                if (floor <= -20) continue;
                const def = this.world.blockTypes[pickup.type];
                candidates.push({ key: `p:${id}`, kind: 'pickup', ref: id, pos: new THREE.Vector3(pickup.position.x, floor, pickup.position.z), color: def && def.color !== undefined ? def.color : 0xe0d0a0 });
            }
        }
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 2 + Math.random() * (ANT_FORAGE_RANGE - 2);
            const x = Math.floor(origin.x + Math.cos(angle) * radius);
            const z = Math.floor(origin.z + Math.sin(angle) * radius);
            const floor = this.cameraController.getFloorY(x + 0.5, z + 0.5, origin.y + 4);
            if (floor <= -20) continue;
            const cy = Math.ceil(floor - 0.001);
            const block = this.world.getBlockTypeAt(x, cy, z);
            if (!ANT_FOOD_BLOCKS[block] || keys.has(`b:${x},${cy},${z}`) || !inRange(x + 0.5, floor, z + 0.5)) continue;
            candidates.push({ key: `b:${x},${cy},${z}`, kind: 'block', block, cell: { x, y: cy, z }, pos: new THREE.Vector3(x + 0.5 + (Math.random() - 0.5) * 0.3, floor, z + 0.5 + (Math.random() - 0.5) * 0.3), color: ANT_FOOD_BLOCKS[block] });
            keys.add(`b:${x},${cy},${z}`);
        }

        let added = 0;
        for (const candidate of candidates) {
            if (added >= 2 || colony.sources.length >= ANT_SOURCE_LIMIT) break;
            const path = this.antsBuildPath(mob, candidate.pos);
            if (!path) continue;
            candidate.pos.copy(path.points[path.points.length - 1]);
            colony.sources.push({ ...candidate, path, strength: 0, known: false });
            keys.add(candidate.key);
            added++;
        }
    },

    // A walkable line of points from the nest's entrance, down the mound and across the ground to
    // `target`, wiggling a little; steps up and down become short climbs up the block's face.
    // Returns null if the way crosses water, a cliff or a wall higher than one block.
    antsBuildPath(mob, target) {
        const origin = mob.position;
        const angle = Math.atan2(target.z - origin.z, target.x - origin.x);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const points = [mob.userData.antColony.entrance.clone()];
        [0.08, 0.17, 0.26, 0.37, 0.47].forEach((r) => {
            points.push(new THREE.Vector3(origin.x + cos * r, origin.y + antsMoundHeight(r) + 0.004, origin.z + sin * r));
        });
        const footX = origin.x + cos * 0.5;
        const footZ = origin.z + sin * 0.5;
        const total = Math.hypot(target.x - footX, target.z - footZ);
        let previous = origin.y;
        if (total > 0.05) {
            const steps = Math.ceil(total / 0.25);
            const amplitude = Math.min(0.6, total * 0.08);
            const waves = 1 + Math.random() * 2;
            const shift = Math.random() * Math.PI * 2;
            let lastX = footX;
            let lastZ = footZ;
            for (let i = 1; i <= steps; i++) {
                const f = i / steps;
                const side = Math.sin(f * Math.PI * waves + shift) * amplitude * Math.sin(f * Math.PI);
                const x = footX + (target.x - footX) * f - sin * side;
                const z = footZ + (target.z - footZ) * f + cos * side;
                const floor = this.cameraController.getFloorY(x, z, previous + 1.6);
                if (floor <= -20 || floor - previous > 1.05 || previous - floor > 2.05) return null;
                if (this.findWaterSurface(x, floor + 0.1, z) !== null) return null;
                if (Math.abs(floor - previous) > 0.01) {
                    // Find the edge between the last point and this one, and climb its face on the
                    // lower side.
                    let edgeX = x;
                    let edgeZ = z;
                    let beforeX = lastX;
                    let beforeZ = lastZ;
                    for (let k = 1; k <= 8; k++) {
                        const sx = lastX + (x - lastX) * k / 8;
                        const sz = lastZ + (z - lastZ) * k / 8;
                        if (Math.abs(this.cameraController.getFloorY(sx, sz, previous + 1.6) - previous) > 0.01) {
                            edgeX = sx;
                            edgeZ = sz;
                            break;
                        }
                        beforeX = sx;
                        beforeZ = sz;
                    }
                    const climbX = floor > previous ? beforeX : edgeX;
                    const climbZ = floor > previous ? beforeZ : edgeZ;
                    points.push(new THREE.Vector3(climbX, previous + 0.004, climbZ), new THREE.Vector3(climbX, floor + 0.004, climbZ));
                }
                points.push(new THREE.Vector3(x, floor + 0.004, z));
                previous = floor;
                lastX = x;
                lastZ = z;
            }
        }
        const dist = [0];
        for (let i = 1; i < points.length; i++) dist.push(dist[i - 1] + points[i].distanceTo(points[i - 1]));
        return { points, dist, length: dist[dist.length - 1] };
    },

    // Picks where an ant leaving the nest goes: a known trail (the stronger, the likelier) or,
    // as a scout, somewhere new, often towards food it can smell but no one has found yet.
    antsSendOut(mob, colony, ant) {
        const known = colony.sources.filter((source) => source.known);
        ant.carrying = null;
        ant.dir = 1;
        ant.s = 0;
        ant.seg = 0;
        ant.pos.copy(colony.entrance);
        if (known.length > 0 && Math.random() < 0.8) {
            const total = known.reduce((sum, source) => sum + source.strength + 0.2, 0);
            let pick = Math.random() * total;
            let chosen = known[known.length - 1];
            for (const source of known) {
                pick -= source.strength + 0.2;
                if (pick <= 0) {
                    chosen = source;
                    break;
                }
            }
            ant.source = chosen;
            ant.path = chosen.path;
            ant.state = 'path';
            return true;
        }
        const unknown = colony.sources.filter((source) => !source.known);
        for (let attempt = 0; attempt < 3; attempt++) {
            let x;
            let z;
            if (unknown.length > 0 && Math.random() < 0.5) {
                const source = unknown[Math.floor(Math.random() * unknown.length)];
                x = source.pos.x + (Math.random() - 0.5) * 3;
                z = source.pos.z + (Math.random() - 0.5) * 3;
            } else {
                const angle = Math.random() * Math.PI * 2;
                const radius = 3 + Math.random() * 8;
                x = mob.position.x + Math.cos(angle) * radius;
                z = mob.position.z + Math.sin(angle) * radius;
            }
            const floor = this.cameraController.getFloorY(x, z, mob.position.y + 3);
            if (floor <= -20) continue;
            const path = this.antsBuildPath(mob, _antVec.set(x, floor, z));
            if (!path) continue;
            ant.source = null;
            ant.path = path;
            ant.state = 'path';
            return true;
        }
        return false;
    },

    // Moves along the path by `step` (towards its end when dir is 1). Returns 1 at the end, -1
    // back at the entrance, 0 otherwise.
    antsFollowPath(ant, step) {
        const path = ant.path;
        ant.s = THREE.MathUtils.clamp(ant.s + step * ant.dir, 0, path.length);
        const dist = path.dist;
        let seg = Math.min(ant.seg, dist.length - 2);
        while (seg < dist.length - 2 && dist[seg + 1] < ant.s) seg++;
        while (seg > 0 && dist[seg] > ant.s) seg--;
        ant.seg = seg;
        const a = path.points[seg];
        const b = path.points[seg + 1];
        const span = dist[seg + 1] - dist[seg];
        const f = span > 0 ? (ant.s - dist[seg]) / span : 0;
        ant.pos.lerpVectors(a, b, f);
        const dx = (b.x - a.x) * ant.dir;
        const dy = (b.y - a.y) * ant.dir;
        const dz = (b.z - a.z) * ant.dir;
        const flat = Math.hypot(dx, dz);
        if (flat > 0.01) {
            ant.yaw = Math.atan2(dx, dz);
            // Single file, but not on a line: each keeps to its lane, merging at both ends.
            const lane = ant.lane * Math.min(1, ant.s / 0.8, (path.length - ant.s) / 0.6);
            ant.pos.x += dz / flat * lane * ant.dir;
            ant.pos.z -= dx / flat * lane * ant.dir;
        }
        ant.pitch = -Math.atan2(dy, Math.max(flat, 0.0001));
        ant.phase += step * 55;
        if (ant.dir > 0 && ant.s >= path.length) return 1;
        if (ant.dir < 0 && ant.s <= 0) return -1;
        return 0;
    },

    // Walks straight to `target` on the ground (or the mound). Returns true on arrival.
    antsWalkTo(mob, ant, target, step) {
        const dx = target.x - ant.pos.x;
        const dz = target.z - ant.pos.z;
        const gap = Math.hypot(dx, dz);
        if (gap < 0.02) return true;
        const move = Math.min(step, gap);
        ant.pos.x += dx / gap * move;
        ant.pos.z += dz / gap * move;
        let y = this.cameraController.getFloorY(ant.pos.x, ant.pos.z, ant.pos.y + 1.2);
        const r = Math.hypot(ant.pos.x - mob.position.x, ant.pos.z - mob.position.z);
        if (r < 0.5) y = Math.max(y, mob.position.y + antsMoundHeight(r));
        if (y > -20) ant.pos.y = y + 0.004;
        ant.yaw = Math.atan2(dx, dz);
        ant.pitch = 0;
        ant.phase += move * 55;
        return move >= gap;
    },

    antsUpdateAnt(mob, colony, ant, delta, player, feetY, sheltering, near) {
        // An angry colony pours out after the player.
        if (colony.anger > 0 && near && ant.state !== 'rush' && ant.rushReady) {
            if (ant.state === 'inside') ant.pos.copy(colony.entrance);
            ant.state = 'rush';
            ant.rushReady = false;
        }
        const step = ANT_SPEED * ant.pace * delta;
        switch (ant.state) {
            case 'inside': {
                if (sheltering) return;
                ant.timer -= delta;
                if (ant.timer > 0) return;
                ant.timer = 1 + Math.random() * 2;
                if (colony.outside >= ANT_MAX_OUTSIDE) return;
                if (this.antsSendOut(mob, colony, ant)) colony.outside++;
                return;
            }
            case 'path': {
                if (sheltering && ant.dir > 0) ant.dir = -1;
                const reached = this.antsFollowPath(ant, step);
                if (ant.dir > 0 && !ant.source) {
                    // Scouting: food close by is worth a detour.
                    const found = colony.sources.find((source) => !source.known && Math.hypot(source.pos.x - ant.pos.x, source.pos.z - ant.pos.z) < ANT_DISCOVER_RANGE && Math.abs(source.pos.y - ant.pos.y) < 1.5);
                    if (found && !sheltering) {
                        ant.source = found;
                        ant.state = 'detour';
                        return;
                    }
                }
                if (reached === 1) {
                    if (ant.source && colony.sources.includes(ant.source)) {
                        ant.state = 'pick';
                        ant.timer = 0.8 + Math.random() * 1.2;
                    } else {
                        ant.state = 'look';
                        ant.timer = 0.4 + Math.random() * 0.8;
                    }
                } else if (reached === -1) {
                    if (ant.carrying !== null && ant.source) {
                        // Home with food: the trail behind it is now marked, and stronger.
                        ant.source.known = true;
                        ant.source.strength += 1;
                    }
                    ant.carrying = null;
                    ant.source = null;
                    ant.path = null;
                    ant.state = 'inside';
                    ant.timer = 3 + Math.random() * 6;
                }
                return;
            }
            case 'detour': {
                const source = ant.source;
                if (!colony.sources.includes(source)) {
                    ant.source = null;
                    ant.state = 'home';
                    return;
                }
                if (this.antsWalkTo(mob, ant, source.pos, step)) {
                    ant.state = 'pick';
                    ant.timer = 0.8 + Math.random() * 1.2;
                }
                return;
            }
            case 'pick': {
                ant.timer -= delta;
                ant.phase += delta * 4;
                if (ant.timer > 0) return;
                const source = ant.source;
                if (source && colony.sources.includes(source)) {
                    ant.carrying = source.color;
                    if (source.kind === 'bait') source.ref.amount = Math.max(0, source.ref.amount - 0.01);
                    ant.path = source.path;
                    ant.s = source.path.length;
                    ant.seg = source.path.dist.length - 2;
                    ant.dir = -1;
                    ant.state = 'path';
                } else {
                    ant.state = 'home';
                }
                return;
            }
            case 'look': {
                // A scout that found nothing turns round and goes home.
                ant.timer -= delta;
                ant.yaw += delta * 3;
                if (ant.timer > 0) return;
                ant.dir = -1;
                ant.state = 'path';
                return;
            }
            case 'rush': {
                if (colony.anger <= 0 || !near) {
                    ant.state = 'home';
                    return;
                }
                const angle = ant.seed + mob.userData.life * 1.6;
                ant.target.set(player.x + Math.cos(angle) * 0.22, feetY, player.z + Math.sin(angle) * 0.22);
                this.antsWalkTo(mob, ant, ant.target, ANT_RUSH_SPEED * ant.pace * delta);
                return;
            }
            default: {
                // 'home': straight back to the entrance.
                if (this.antsWalkTo(mob, ant, colony.entrance, step * 1.5) || Math.hypot(ant.pos.x - mob.position.x, ant.pos.z - mob.position.z) < 0.08) {
                    ant.carrying = null;
                    ant.source = null;
                    ant.path = null;
                    ant.state = 'inside';
                    ant.timer = 3 + Math.random() * 5;
                }
            }
        }
    },

    // ---------------------------------------------------------------------------------------
    // Provoking, bites, strikes and the bug net

    antsProvoke(mob, cause) {
        const colony = mob.userData.antColony;
        if (!colony) return;
        const wasCalm = colony.anger <= 0;
        colony.anger = ANT_ANGER_TIME;
        if (cause === 'hit') colony.shake = 1;
        if (!wasCalm) return;
        // Up to a dozen ants join the swarm, the ones outside first.
        const alive = colony.ants.filter((ant) => ant.alive).sort((a, b) => (a.state === 'inside') - (b.state === 'inside'));
        alive.forEach((ant, index) => {
            ant.rushReady = index < 12;
            if (ant.rushReady && ant.state === 'inside') ant.pos.copy(colony.entrance);
        });
        this.receiveSystemMessage({ text: cause === 'trample' ? 'You stepped on an anthill! The ants swarm out' : 'You disturbed the ants! They swarm out to bite' });
        this.playNoiseBurst({ duration: 0.25, volume: 0.012, highpass: 2500, lowpass: 8000 });
    },

    antsBite(mob, colony, player, feetY) {
        if (colony.biteCooldown > 0) return;
        let onYou = 0;
        for (const ant of colony.ants) {
            if (!ant.alive || ant.state !== 'rush') continue;
            if (Math.hypot(ant.pos.x - player.x, ant.pos.z - player.z) < 0.5 && Math.abs(ant.pos.y - feetY) < 1) onYou++;
        }
        if (onYou < 2) return;
        colony.biteCooldown = ANT_BITE_COOLDOWN;
        this.applyDamage(1, 'You were bitten by ants', 'mob');
        this.playTone({ frequency: getMobSpecies('ant').tone, duration: 0.03, type: 'square', volume: 0.012, release: 0.03 });
    },

    // Left click on the colony: an ant under the crosshair is squashed; the mound shakes. Either
    // way the colony swarms out.
    antsHit(mob) {
        const colony = mob.userData.antColony;
        if (!colony) return;
        this.raycaster.setFromCamera(this.screenCenter, this.camera);
        const hits = this.raycaster.intersectObject(colony.body, false);
        const ant = hits.length > 0 && hits[0].distance <= 5 ? colony.ants[Math.floor(hits[0].instanceId / 3)] : null;
        if (ant && ant.alive) {
            const position = ant.pos.clone();
            this.antsKill(colony, ant);
            this.playTone({ frequency: getMobSpecies('ant').tone * 0.6, duration: 0.04, type: 'triangle', volume: 0.012, release: 0.04 });
            this.receiveSystemMessage({ text: 'You squashed an ant' });
            // The bestiary counts it (an ant is no mob of its own, so no loot event).
            if (this.bestiaryInstalled && this.bestiaryOnDefeated) this.bestiaryOnDefeated({ userData: { species: 'ant' }, position }, 'player');
            this.antsProvoke(mob, 'squash');
            return;
        }
        this.playNoiseBurst({ duration: 0.06, volume: 0.015, highpass: 200, lowpass: 1400 });
        this.antsProvoke(mob, 'hit');
    },

    // Bug net (traps.js): five ants and a young queen go into a jar; the colony stays.
    antsNetCatch(mob) {
        const colony = mob.userData.antColony;
        if (!colony) return false;
        const alive = colony.ants.filter((ant) => ant.alive);
        if (alive.length < 6) {
            this.receiveSystemMessage({ text: 'This colony is too small to take ants from. Let it grow' });
            return false;
        }
        alive.sort((a, b) => (a.state === 'inside') - (b.state === 'inside')).slice(0, ANT_FARM_JAR_WORKERS).forEach((ant) => this.antsKill(colony, ant));
        colony.regrow = ANT_REGROW;
        if (!this.antsJarHinted) {
            this.antsJarHinted = true;
            setTimeout(() => this.receiveSystemMessage({ text: 'A young queen and five workers: put them in an Ant Farm, or set them free on soft ground' }), 1200);
        }
        return true;
    },

    // ---------------------------------------------------------------------------------------
    // Drawing

    antsRender(mob, colony) {
        const origin = mob.position;
        const { body, limbs, crumbs } = colony;
        let colours = false;
        for (const ant of colony.ants) {
            const k = ant.slot;
            if (!ant.alive || ant.state === 'inside') {
                for (let p = 0; p < 3; p++) body.setMatrixAt(k * 3 + p, _antZero);
                for (let p = 0; p < 8; p++) limbs.setMatrixAt(k * 8 + p, _antZero);
                crumbs.setMatrixAt(k, _antZero);
                ant.anchor.position.set(0, ANT_MOUND_TOP, 0);
                continue;
            }
            _antPos.set(ant.pos.x - origin.x, ant.pos.y - origin.y, ant.pos.z - origin.z);
            ant.anchor.position.copy(_antPos);
            _antEuler.set(ant.pitch, ant.yaw, 0, 'YXZ');
            _antQuat.setFromEuler(_antEuler);
            _antBase.compose(_antPos, _antQuat, _antScale.setScalar(ANT_SCALE));
            for (let p = 0; p < 3; p++) body.setMatrixAt(k * 3 + p, _antMatrix.multiplyMatrices(_antBase, ANT_PART_MATRICES[p]));
            // Tripod gait: front and back legs of one side step with the middle one of the other.
            for (let i = 0; i < 6; i++) {
                const left = i < 3;
                const pair = i % 3;
                const wave = Math.sin(ant.phase + ((pair + (left ? 0 : 1)) % 2) * Math.PI);
                const angle = ANT_LEG_SPLAY[pair] + wave * 0.4;
                _antEuler.set(0, left ? -angle : Math.PI + angle, -0.55 + Math.max(0, wave) * 0.25, 'YXZ');
                _antQuat.setFromEuler(_antEuler);
                _antPart.compose(ANT_HIPS[i], _antQuat, ANT_LEG_SCALE);
                limbs.setMatrixAt(k * 8 + i, _antMatrix.multiplyMatrices(_antBase, _antPart));
            }
            // Antennae, elbowed forward, always feeling about.
            for (let i = 0; i < 2; i++) {
                const left = i === 0;
                const angle = Math.PI / 2 - 0.4 + Math.sin(ant.phase * 0.3 + ant.seed + i * 1.7) * 0.25;
                _antEuler.set(0, left ? -angle : Math.PI + angle, 0.45, 'YXZ');
                _antQuat.setFromEuler(_antEuler);
                _antPart.compose(ANT_ANTENNA_ROOTS[i], _antQuat, ANT_ANTENNA_SCALE);
                limbs.setMatrixAt(k * 8 + 6 + i, _antMatrix.multiplyMatrices(_antBase, _antPart));
            }
            if (ant.carrying !== null) {
                crumbs.setMatrixAt(k, _antMatrix.multiplyMatrices(_antBase, ANT_CRUMB_MATRIX));
                if (ant.crumbColor !== ant.carrying) {
                    ant.crumbColor = ant.carrying;
                    crumbs.setColorAt(k, _antColor.set(ant.carrying));
                    colours = true;
                }
            } else {
                crumbs.setMatrixAt(k, _antZero);
            }
        }
        body.instanceMatrix.needsUpdate = true;
        limbs.instanceMatrix.needsUpdate = true;
        crumbs.instanceMatrix.needsUpdate = true;
        if (colours && crumbs.instanceColor) crumbs.instanceColor.needsUpdate = true;
    },

    // Pheromone trails as faint dots along the known paths, larger the stronger the trail.
    antsRenderTrails(mob, colony) {
        const trail = colony.trail;
        const origin = mob.position;
        let used = 0;
        for (const source of colony.sources) {
            if (!source.known) continue;
            const size = 0.012 + 0.03 * Math.min(1, source.strength / 2.5);
            const points = source.path.points;
            for (let i = 6; i < points.length && used < ANT_TRAIL_DOTS; i++) {
                const a = points[i - 1];
                const b = points[i];
                if (Math.abs(b.y - a.y) > 0.3) continue;
                for (let f = 0; f < 1 && used < ANT_TRAIL_DOTS; f += 0.5) {
                    _antPos.set(a.x + (b.x - a.x) * f - origin.x, a.y + (b.y - a.y) * f - origin.y + 0.006, a.z + (b.z - a.z) * f - origin.z);
                    _antMatrix.compose(_antPos, _antQuat.identity(), _antScale.set(size, 1, size));
                    trail.setMatrixAt(used++, _antMatrix);
                }
            }
        }
        trail.count = used;
        trail.instanceMatrix.needsUpdate = true;
    },

    // ---------------------------------------------------------------------------------------
    // Ant farm

    antsFarmEnsure() {
        if (this.antFarms) return;
        this.antFarms = [];
        this.antsFarmSaveTimer = 15;
        this.antsFarmWood = new THREE.MeshLambertMaterial({ color: 0xb08a58 });
        this.antsFarmDarkWood = new THREE.MeshLambertMaterial({ color: 0x8a6236 });
        this.antsFarmGlass = new THREE.MeshLambertMaterial({ color: 0xbfe8f5, transparent: true, opacity: 0.25, depthWrite: false });
        this.antsFarmHitMaterial = new THREE.MeshBasicMaterial({ visible: false });
        this.antsFarmRestore();
    },

    antsBox(parent, material, x, y, z, sx, sy, sz) {
        const mesh = new THREE.Mesh(_antBoxGeometry, material);
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        mesh.castShadow = Boolean(this.rtxModeEnabled) && !material.transparent && material.visible !== false;
        mesh.receiveShadow = Boolean(this.rtxModeEnabled);
        parent.add(mesh);
        return mesh;
    },

    antsNewFarmState() {
        return { queen: false, workers: 0, food: 0.5, dig: 0, layTimer: 30, variant: 1, age: 0, brood: [], nodes: [], edges: [], chambers: [], tips: [] };
    },

    // A narrow glass box on a wooden stand: a slab of soil behind the glass, drawn on a canvas.
    antsCreateFarm(position, facing, state) {
        const group = new THREE.Group();
        const soilHeight = ANT_FARM_H;
        this.antsBox(group, this.antsFarmDarkWood, 0, 0.03, 0, 0.96, 0.06, 0.22);
        [-1, 1].forEach((side) => this.antsBox(group, this.antsFarmWood, side * 0.43, 0.06 + 0.36, 0, 0.06, 0.72, 0.16));
        this.antsBox(group, this.antsFarmWood, 0, 0.06 + soilHeight + 0.055, 0, 0.92, 0.05, 0.16);
        this.antsBox(group, this.antsFarmDarkWood, 0.2, 0.06 + soilHeight + 0.09, 0, 0.08, 0.025, 0.08);

        const canvas = document.createElement('canvas');
        canvas.width = ANT_CANVAS_W;
        canvas.height = ANT_CANVAS_H;
        const base = document.createElement('canvas');
        base.width = ANT_CANVAS_W;
        base.height = ANT_CANVAS_H;
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        const face = new THREE.MeshLambertMaterial({ map: texture });
        const side = new THREE.MeshLambertMaterial({ color: 0x7a5a3e });
        const soil = new THREE.Mesh(_antBoxGeometry, [side, side, side, side, face, face]);
        soil.position.set(0, 0.06 + soilHeight / 2, 0);
        soil.scale.set(ANT_FARM_W, soilHeight, 0.1);
        soil.receiveShadow = Boolean(this.rtxModeEnabled);
        group.add(soil);
        [-1, 1].forEach((sideZ) => {
            const pane = this.antsBox(group, this.antsFarmGlass, 0, 0.06 + 0.36, sideZ * 0.06, 0.84, 0.72, 0.01);
            pane.renderOrder = 2;
        });

        group.position.copy(position);
        group.rotation.y = facing;
        this.scene.add(group);
        const farm = {
            group, position: position.clone(), facing, state: state || this.antsNewFarmState(),
            canvas, base, texture, materials: [face, side], dirty: true, drawTimer: 0, walkers: [], adjacency: null
        };
        const hitbox = this.antsBox(group, this.antsFarmHitMaterial, 0, 0.39, 0, 0.95, 0.78, 0.25);
        hitbox.castShadow = false;
        hitbox.userData.antFarm = farm;
        farm.hitbox = hitbox;
        this.antFarms.push(farm);
        this.antsFarmDraw(farm, 0);
        return farm;
    },

    antsRemoveFarm(farm) {
        this.scene.remove(farm.group);
        farm.texture.dispose();
        farm.materials.forEach((material) => material.dispose());
        this.antFarms = this.antFarms.filter((candidate) => candidate !== farm);
    },

    antsRaycastFarm(blockHit) {
        if (this.antFarms.length === 0) return null;
        const ray = this.getInteractionRay();
        this.raycaster.set(ray.origin, ray.direction);
        const hits = this.raycaster.intersectObjects(this.antFarms.map((farm) => farm.hitbox), false);
        for (const hit of hits) {
            if (hit.point.distanceTo(ray.reachOrigin) > this.placeDistance + 0.3) break;
            if (blockHit && hit.distance > blockHit.distance + 0.05) break;
            return hit.object.userData.antFarm;
        }
        return null;
    },

    antsAfterUse() {
        this.placeActionTimer = 0.35;
        this.showHitIndicator();
        this.lastSelectionUpdate = 0;
    },

    antsUseFarmUnderCrosshair(item, hit) {
        if (!this.world || !this.scene) return false;
        this.antsFarmEnsure();
        const farm = this.antsRaycastFarm(hit);
        if (!farm) return false;
        this.antsUseFarm(farm, item);
        return true;
    },

    // Right click elsewhere: placing a farm or releasing a jar of ants.
    antsHandleUse(item, hit) {
        if (!this.world || !this.scene || !hit) return false;
        this.antsFarmEnsure();
        if (item === 'ant_farm') {
            this.antsPlaceFarm(hit);
            return true;
        }
        if (item === 'ant_colony_jar') {
            this.antsReleaseJar(hit);
            return true;
        }
        return false;
    },

    // Where a farm or a jar goes: on top of the targeted block.
    antsGroundSpot(hit) {
        const block = this.world.getBlockPositionFromIntersection(hit);
        if (!block || !hit.face || hit.face.normal.y < 0.5) {
            this.receiveSystemMessage({ text: 'Place it on top of a block' });
            return null;
        }
        if (this.world.getBlockTypeAt(block.x, block.y + 1, block.z) === 'water' || this.world.hasSolidBlock(block.x, block.y + 1, block.z)) {
            this.receiveSystemMessage({ text: 'There is no room there' });
            return null;
        }
        const y = this.cameraController.getFloorY(block.x + 0.5, block.z + 0.5, block.y + 1.5);
        if (y <= -20) return null;
        return { block, position: new THREE.Vector3(block.x + 0.5, y, block.z + 0.5) };
    },

    antsPlaceFarm(hit) {
        const spot = this.antsGroundSpot(hit);
        if (!spot) return;
        if (this.antFarms.some((farm) => farm.position.distanceTo(spot.position) < 0.8)) return;
        const player = this.getLocalPlayerPosition();
        this.antsCreateFarm(spot.position, Math.atan2(player.x - spot.position.x, player.z - spot.position.z));
        this.consumeSelectedBlock();
        this.playPlaceSound('glass');
        this.receiveSystemMessage({ text: 'Ant farm placed. Right click it with an Ant Colony Jar (catch ants with the bug net on an anthill)' });
        this.antsAfterUse();
        this.antsFarmSave();
    },

    // A jar emptied on soft ground: the young queen founds a new anthill there.
    antsReleaseJar(hit) {
        const spot = this.antsGroundSpot(hit);
        this.antsAfterUse();
        if (!spot) return;
        const nest = this.antsSpotAt(spot.position.x, spot.position.z, spot.position.y + 0.5);
        if (nest && this.ambientMobs.some((mob) => mob.userData.antColony && mob.position.distanceTo(nest.position) < 2)) {
            this.receiveSystemMessage({ text: 'There is already an anthill here' });
            return;
        }
        if (!nest) {
            this.receiveSystemMessage({ text: 'Ants need grass, dirt or sand to dig a nest. Or put them in an Ant Farm' });
            return;
        }
        this.consumeSelectedBlock();
        const mob = this.antsSpawnColony(nest.position, 1 + ANT_FARM_JAR_WORKERS, nest.sandy ? 2 : Math.floor(Math.random() * 2));
        mob.userData.antColony.size = 12;
        this.playPlaceSound('glass');
        this.receiveSystemMessage({ text: 'You set the ants free: the young queen digs in and founds a new anthill' });
    },

    antsUseFarm(farm, item) {
        const state = farm.state;
        this.antsAfterUse();
        if (item === 'ant_colony_jar') {
            if (!this.consumeSelectedBlock()) return;
            if (!state.queen) {
                state.queen = true;
                state.workers = Math.min(ANT_FARM_MAX_WORKERS, state.workers + ANT_FARM_JAR_WORKERS);
                state.variant = Math.floor(Math.random() * 2);
                if (state.nodes.length === 0) this.antsFarmFound(state);
                this.receiveSystemMessage({ text: 'A young queen and five workers move in. Feed them and watch them dig!' });
            } else {
                state.workers = Math.min(ANT_FARM_MAX_WORKERS, state.workers + ANT_FARM_JAR_WORKERS);
                this.receiveSystemMessage({ text: 'Five more workers join the colony. The second queen is chased out: this colony keeps only one queen' });
            }
            farm.dirty = true;
            this.playPlaceSound('glass');
        } else if (item && ANT_FARM_FOODS[item] !== undefined) {
            if (!state.queen && state.workers === 0) {
                this.receiveSystemMessage({ text: 'The farm is empty. Put an Ant Colony Jar in first' });
                return;
            }
            if (state.food >= 0.95) {
                this.receiveSystemMessage({ text: 'The ants still have plenty of food' });
                return;
            }
            if (!this.consumeSelectedBlock()) return;
            state.food = Math.min(1, state.food + ANT_FARM_FOODS[item]);
            this.receiveSystemMessage({ text: `The ants carry the ${this.getBlockDisplayName(item).toLowerCase()} down to a food chamber` });
            this.playNoiseBurst({ duration: 0.06, volume: 0.01, highpass: 1500, lowpass: 5000 });
        } else if (!item && this.cameraController.isCrouching) {
            this.antsRemoveFarm(farm);
            this.addInventory('ant_farm');
            if (state.queen) this.addInventory('ant_colony_jar');
            this.playPlaceSound('glass');
            this.receiveSystemMessage({ text: state.queen ? 'Ant farm picked up. The queen and some workers go back into a jar' : 'Ant farm picked up' });
        } else {
            this.receiveSystemMessage({ text: this.antsFarmStatus(state) });
        }
        this.antsFarmSave();
    },

    antsFarmStatus(state) {
        if (!state.queen && state.workers === 0) return 'Empty ant farm. Catch ants with the bug net on an anthill and put the jar in (Shift + right click with an empty hand picks it up)';
        const count = (stage) => state.brood.filter((brood) => brood.stage === stage).length;
        const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
        const tunnels = Math.round(state.nodes.length / ANT_FARM_MAX_NODES * 100);
        const food = state.food <= 0 ? 'hungry: no young are raised' : state.food < 0.3 ? 'running low' : 'well fed';
        return `Ant farm: ${state.queen ? 'a queen' : 'no queen'}, ${plural(state.workers, 'worker')}, ${plural(count(0), 'egg')}, ${plural(count(1), 'larva', 'larvae')}, ${plural(count(2), 'pupa', 'pupae')}. Tunnels ${tunnels}%. Food: ${food}`;
    },

    // The first shaft, from the surface down.
    antsFarmFound(state) {
        const u = 0.35 + Math.random() * 0.3;
        state.nodes = [[u, 0, Math.PI / 2], [u, 0.08, Math.PI / 2]];
        state.edges = [[0, 1]];
        state.tips = [1];
        state.chambers = [];
    },

    // One step of digging: a tunnel tip grows a little (mostly down and sideways) or a new branch
    // starts; now and then the end is widened into a chamber. Returns false when there is no room.
    antsFarmDigStep(state) {
        const nodes = state.nodes;
        if (nodes.length < 2 || nodes.length >= ANT_FARM_MAX_NODES) return false;
        for (let attempt = 0; attempt < 8; attempt++) {
            const branching = state.tips.length === 0 || Math.random() < 0.18;
            const from = branching ? 1 + Math.floor(Math.random() * (nodes.length - 1)) : state.tips[Math.floor(Math.random() * state.tips.length)];
            const [u0, v0, h0] = nodes[from];
            let h = branching ? h0 + (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.6) : h0 + (Math.random() - 0.5) * 1.1;
            h = THREE.MathUtils.clamp(h, 0.15, Math.PI - 0.15);
            const length = 0.035 + Math.random() * 0.02;
            const u = u0 + Math.cos(h) * length / ANT_FARM_W;
            const v = v0 + Math.sin(h) * length / (ANT_FARM_H * 0.88);
            if (u < 0.05 || u > 0.95 || v < 0.05 || v > 0.95) {
                if (!branching) state.tips = state.tips.filter((tip) => tip !== from);
                continue;
            }
            const crowded = nodes.some(([nu, nv], index) => index !== from && Math.hypot((nu - u) * ANT_FARM_W, (nv - v) * ANT_FARM_H * 0.88) < 0.028);
            if (crowded) {
                if (!branching && Math.random() < 0.3) state.tips = state.tips.filter((tip) => tip !== from);
                continue;
            }
            const index = nodes.length;
            nodes.push([Math.round(u * 1000) / 1000, Math.round(v * 1000) / 1000, Math.round(h * 100) / 100]);
            state.edges.push([from, index]);
            state.tips = state.tips.filter((tip) => tip !== from);
            state.tips.push(index);
            const first = state.chambers.length === 0;
            if ((first && v > 0.3) || (!first && state.chambers.length < 6 && Math.random() < 0.08)) {
                const kind = first ? 'queen' : Math.random() < 0.6 ? 'brood' : 'food';
                state.chambers.push([index, Math.round((0.03 + Math.random() * 0.015) * 1000) / 1000, kind]);
            }
            return true;
        }
        return false;
    },

    // Simulation step of `dt` seconds. `live` announces hatchings to a player nearby.
    antsFarmTick(farm, dt, live) {
        const state = farm.state;
        if (!state.queen && state.workers <= 0) return;
        state.age += dt;
        const hungry = state.food <= 0;
        state.food = Math.max(0, state.food - dt * (0.0004 + state.workers * 0.00006));
        state.dig += dt * state.workers * 0.009 * (hungry ? 0.3 : 1);
        while (state.dig >= 1) {
            state.dig -= 1;
            if (this.antsFarmDigStep(state)) {
                farm.dirty = true;
            } else {
                state.dig = 0;
                break;
            }
        }
        if (state.queen && !hungry && state.chambers.length > 0) {
            state.layTimer -= dt;
            if (state.layTimer <= 0) {
                state.layTimer = 35 + Math.random() * 20;
                if (state.brood.length < 10 && state.workers + state.brood.length < ANT_FARM_MAX_WORKERS) {
                    state.brood.push({ stage: 0, t: 0, a: Math.random(), d: Math.random() });
                }
            }
        }
        let hatched = 0;
        state.brood.forEach((brood) => {
            // Larvae only grow while the workers have food to feed them.
            if (hungry && brood.stage === 1) return;
            brood.t += dt;
            if (brood.t < ANT_BROOD_TIMES[brood.stage]) return;
            brood.t = 0;
            brood.stage++;
            if (brood.stage === 2) state.food = Math.max(0, state.food - 0.03);
            if (brood.stage === 3) {
                state.workers = Math.min(ANT_FARM_MAX_WORKERS, state.workers + 1);
                hatched++;
            }
        });
        state.brood = state.brood.filter((brood) => brood.stage < 3);
        if (hatched && live) {
            const player = this.getLocalPlayerPosition();
            if (Math.hypot(player.x - farm.position.x, player.z - farm.position.z) < 16) {
                this.receiveSystemMessage({ text: `A new worker ant hatched in your ant farm (${state.workers} workers)` });
            }
        }
    },

    antsFarmUpdate(delta) {
        if (!this.world || !this.scene || !this.camera) return;
        this.antsFarmEnsure();
        if (this.antFarms.length === 0) return;
        this.antsFarmClock = (this.antsFarmClock || 0) + delta;
        while (this.antsFarmClock >= 1) {
            this.antsFarmClock -= 1;
            this.antFarms.forEach((farm) => this.antsFarmTick(farm, 1, true));
        }
        const camera = this.camera.position;
        for (const farm of this.antFarms) {
            farm.drawTimer -= delta;
            const close = farm.position.distanceTo(camera) < 12;
            if ((close && farm.drawTimer <= 0) || farm.dirty) {
                farm.drawTimer = 0.12;
                this.antsFarmDraw(farm, close ? 0.12 : 0);
            }
        }
        this.antsFarmSaveTimer -= delta;
        if (this.antsFarmSaveTimer <= 0) {
            this.antsFarmSaveTimer = 15;
            if (this.antFarms.some((farm) => farm.state.queen || farm.state.workers > 0)) this.antsFarmSave();
        }
    },

    antsFarmPoint(state, index) {
        const node = state.nodes[index];
        return [node[0] * ANT_CANVAS_W, ANT_CANVAS_SURFACE + node[1] * (ANT_CANVAS_H - ANT_CANVAS_SURFACE)];
    },

    // The soil, the dug-out heap on top and the tunnels: redrawn only when they change.
    antsFarmDrawBase(farm) {
        const state = farm.state;
        const ctx = farm.base.getContext('2d');
        const W = ANT_CANVAS_W;
        const H = ANT_CANVAS_H;
        const S = ANT_CANVAS_SURFACE;
        ctx.fillStyle = '#c9dde4';
        ctx.fillRect(0, 0, W, S);
        ctx.fillStyle = '#8a6a48';
        ctx.fillRect(0, S, W, H - S);
        let seed = 1234567;
        const random = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        };
        ['#7a5c3e', '#9a7a56', '#6e5236', '#a88a64'].forEach((colour, index) => {
            ctx.fillStyle = colour;
            for (let i = 0; i < 220; i++) ctx.fillRect(Math.floor(random() * W), S + Math.floor(random() * (H - S)), index === 3 ? 1 : 2, 1);
        });
        // The soil the workers carry out piles up on the surface.
        const heap = Math.min(10, state.nodes.length * 0.12);
        if (heap > 0.5 && state.nodes.length > 0) {
            const [ex] = this.antsFarmPoint(state, 0);
            ctx.fillStyle = '#9a7a56';
            ctx.beginPath();
            ctx.moveTo(ex - heap * 2.2 - 3, S);
            ctx.lineTo(ex - 3, S - heap);
            ctx.lineTo(ex + 3, S - heap);
            ctx.lineTo(ex + heap * 2.2 + 3, S);
            ctx.closePath();
            ctx.fill();
        }
        ctx.strokeStyle = '#3a2a1c';
        ctx.fillStyle = '#3a2a1c';
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        state.edges.forEach(([a, b]) => {
            const [ax, ay] = this.antsFarmPoint(state, a);
            const [bx, by] = this.antsFarmPoint(state, b);
            ctx.moveTo(ax, Math.max(ay, S - 1));
            ctx.lineTo(bx, by);
        });
        ctx.stroke();
        const pxPerBlock = W / ANT_FARM_W;
        state.chambers.forEach(([index, r]) => {
            const [x, y] = this.antsFarmPoint(state, index);
            ctx.beginPath();
            ctx.ellipse(x, y, r * pxPerBlock, r * pxPerBlock * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();
        });
        // Adjacency for the workers walking the tunnels.
        farm.adjacency = state.nodes.map(() => []);
        state.edges.forEach(([a, b]) => {
            farm.adjacency[a].push(b);
            farm.adjacency[b].push(a);
        });
    },

    antsFarmDraw(farm, delta) {
        const state = farm.state;
        if (farm.dirty || !farm.adjacency) {
            this.antsFarmDrawBase(farm);
            farm.dirty = false;
        }
        const ctx = farm.canvas.getContext('2d');
        ctx.drawImage(farm.base, 0, 0);
        const tone = ANT_VARIANTS[state.variant] || ANT_VARIANTS[1];
        const hex = (color) => `#${color.toString(16).padStart(6, '0')}`;
        const S = ANT_CANVAS_SURFACE;
        const pxPerBlock = ANT_CANVAS_W / ANT_FARM_W;

        // The queen in her chamber, the brood in theirs (or with her).
        const queenChamber = state.chambers.find((chamber) => chamber[2] === 'queen');
        const broodChambers = state.chambers.filter((chamber) => chamber[2] === 'brood');
        // Until the first chamber is dug she waits at the bottom of the shaft.
        const queenNode = queenChamber ? queenChamber[0] : state.nodes.length - 1;
        if (state.queen && queenNode >= 0) {
            const [x, y] = this.antsFarmPoint(state, queenNode);
            const wiggle = Math.sin(performance.now() / 700) * 0.6;
            ctx.fillStyle = hex(tone.dark);
            ctx.fillRect(Math.round(x - 3 + wiggle), Math.round(y - 1), 4, 3);
            ctx.fillStyle = hex(tone.body);
            ctx.fillRect(Math.round(x + 1 + wiggle), Math.round(y - 1), 2, 2);
        }
        state.brood.forEach((brood) => {
            const chamber = broodChambers.length > 0 ? broodChambers[Math.floor(brood.a * broodChambers.length)] : queenChamber;
            if (!chamber) return;
            const [cx, cy] = this.antsFarmPoint(state, chamber[0]);
            const r = chamber[1] * pxPerBlock;
            const x = Math.round(cx + (brood.d - 0.5) * r * 1.4);
            const y = Math.round(cy + (brood.a * 7 % 1 - 0.3) * r * 0.6);
            ctx.fillStyle = brood.stage === 0 ? '#f6f4ea' : brood.stage === 1 ? '#efe2c0' : '#d8b888';
            ctx.fillRect(x, y, brood.stage === 0 ? 1 : 2, brood.stage === 2 ? 2 : 1);
        });

        // Workers: walking the tunnels from node to node, a few on the surface.
        const count = Math.min(state.workers, ANT_FARM_MAX_WORKERS);
        while (farm.walkers.length < count) farm.walkers.push({ from: 0, to: 0, t: 1, surface: farm.walkers.length % 5 === 4, x: Math.random() * ANT_CANVAS_W, vx: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 6) });
        farm.walkers.length = count;
        ctx.fillStyle = hex(tone.dark);
        const adjacency = farm.adjacency;
        farm.walkers.forEach((walker) => {
            if (walker.surface || state.nodes.length < 2) {
                walker.x += walker.vx * delta;
                if (walker.x < 2 || walker.x > ANT_CANVAS_W - 3) walker.vx = -walker.vx;
                walker.x = THREE.MathUtils.clamp(walker.x, 2, ANT_CANVAS_W - 3);
                ctx.fillRect(Math.round(walker.x), S - 2, 2, 1);
                return;
            }
            if (walker.from >= state.nodes.length || walker.to >= state.nodes.length) {
                walker.from = 0;
                walker.to = 0;
                walker.t = 1;
            }
            const [ax, ay] = this.antsFarmPoint(state, walker.from);
            const [bx, by] = this.antsFarmPoint(state, walker.to);
            const span = Math.max(1, Math.hypot(bx - ax, by - ay));
            walker.t += delta * 14 / span;
            if (walker.t >= 1) {
                // At a junction: on along any tunnel, rarely straight back.
                const options = adjacency[walker.to] || [];
                const forward = options.filter((next) => next !== walker.from);
                const pool = forward.length > 0 && Math.random() < 0.9 ? forward : options;
                walker.from = walker.to;
                walker.to = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : walker.to;
                walker.t = 0;
            }
            const x = ax + (bx - ax) * walker.t;
            const y = ay + (by - ay) * walker.t;
            ctx.fillRect(Math.round(x - 1), Math.round(y), 2, 1);
        });
        farm.texture.needsUpdate = true;
    },

    antsFarmSave() {
        if (!this.antFarms) return;
        try {
            const round = (value) => Math.round(value * 100) / 100;
            window.localStorage.setItem(ANT_FARM_STORAGE, JSON.stringify({
                savedAt: Date.now(),
                farms: this.antFarms.map((farm) => {
                    const state = farm.state;
                    return {
                        x: round(farm.position.x), y: round(farm.position.y), z: round(farm.position.z), facing: round(farm.facing),
                        queen: state.queen, workers: state.workers, food: round(state.food), dig: round(state.dig),
                        layTimer: Math.round(state.layTimer), variant: state.variant, age: Math.round(state.age),
                        brood: state.brood.map((brood) => [brood.stage, Math.round(brood.t), round(brood.a), round(brood.d)]),
                        nodes: state.nodes, edges: state.edges, chambers: state.chambers, tips: state.tips
                    };
                })
            }));
        } catch (_error) {
            // Storage unavailable: farms just won't survive a reload.
        }
    },

    antsFarmRestore() {
        let saved = null;
        try {
            saved = JSON.parse(window.localStorage.getItem(ANT_FARM_STORAGE) || 'null');
        } catch (_error) {
            saved = null;
        }
        if (!saved || !Array.isArray(saved.farms)) return;
        // Time passes for the ants while you are away, up to half an hour.
        const away = THREE.MathUtils.clamp((Date.now() - (saved.savedAt || Date.now())) / 1000, 0, ANT_FARM_CATCH_UP);
        saved.farms.forEach((entry) => {
            const state = {
                ...this.antsNewFarmState(),
                queen: Boolean(entry.queen), workers: entry.workers || 0, food: entry.food ?? 0.5, dig: entry.dig || 0,
                layTimer: entry.layTimer ?? 30, variant: entry.variant ?? 1, age: entry.age || 0,
                brood: (entry.brood || []).map(([stage, t, a, d]) => ({ stage, t, a, d })),
                nodes: entry.nodes || [], edges: entry.edges || [], chambers: entry.chambers || [], tips: entry.tips || []
            };
            const farm = this.antsCreateFarm(new THREE.Vector3(entry.x, entry.y, entry.z), entry.facing || 0, state);
            for (let t = 0; t < away; t += 5) this.antsFarmTick(farm, Math.min(5, away - t), false);
            farm.dirty = true;
        });
    }
});
