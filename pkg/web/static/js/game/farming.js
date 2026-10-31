// Farming: the hoe tills grass or dirt into farmland, wheat seeds planted on it grow into wheat,
// and three wheat bake a loaf of bread.
// - Right click grass or dirt (with nothing on top) holding any hoe: it becomes `farmland`.
//   Breaking farmland gives dirt back (and uproots whatever grows on it).
// - Breaking tall grass drops `wheat_seeds` 35 % of the time. Right click farmland with seeds to
//   plant a `wheat_0` crop.
// - The crop grows wheat_0 -> wheat_1 -> wheat_2 -> wheat_3 (ripe). Growth is driven by the
//   server (pkg/network/crops.go): it remembers every planted crop and, about once a minute per
//   stage, swaps the block and broadcasts a normal blockPlace, so every player sees the same field
//   and crops keep growing while their planter is away.
// - Breaking a ripe crop drops `wheat` plus 1-2 seeds; an unripe one gives its seed back.
// - 3 `wheat` -> 1 `bread` (G: +5 health). Wheat also tames and feeds sheep, pigs, camels, goats
//   and horses (TAMING_DIET in taming.js); seeds feed ducks and make seed bait.
// Farmland and the crop stages are world blocks (registerBlockType); the rest are items.
// Mixed into Game.prototype; hooked through js/extensions.js.

const FARMING_SEED_CHANCE = 0.35;
const FARMING_BREAD_HEAL = 5;
// Height of the crop planes per stage (the texture stretches to fit).
const FARMING_WHEAT_HEIGHTS = [0.3, 0.5, 0.72, 0.94];
const FARMING_WHEAT_RIPE = 'wheat_3';

// ---------------------------------------------------------------------------------------
// Textures

registerTexturePattern('farmland_top', (f, s, tint, seed) => {
    const base = f.rgb(0x5c3b22);
    const furrows = 4;
    f.each(s, (x, y, u, v) => {
        // Ridges across the block, darker and damper in the furrows between them.
        const ridge = Math.sin((v + (f.fbm(u, v, 4, 2, seed) - 0.5) * 0.05) * Math.PI * 2 * furrows);
        const grain = f.hash(x, y, seed + 3);
        const n = f.fbm(u, v, 6, 2, seed + 7);
        let k = ridge * 0.16 + (grain - 0.5) * 0.2 + (n - 0.5) * 0.14;
        if (ridge < -0.55) k -= 0.12;
        f.put(s, x, y, f.tone(s, base, k), 0.5 + ridge * 0.35 + grain * 0.1);
    });
});

registerTexturePattern('farmland_side', (f, s, tint, seed) => {
    f.patterns().dirt(s, tint, seed);
    // Tilled soil is damper (darker) than plain dirt, a little more near the top.
    f.each(s, (x, y, u, v) => {
        const i = y * s.size + x;
        const k = v < 0.12 ? 0.74 : 0.84;
        s.color[i * 3] *= k;
        s.color[i * 3 + 1] *= k;
        s.color[i * 3 + 2] *= k * 0.96;
    });
});

function farmingPaintWheat(f, s, stage, seed) {
    const stalk = f.rgb([0x5f9e3a, 0x6aa53c, 0x9cae45, 0xc8a748][stage]);
    const ear = f.rgb([0x5f9e3a, 0x7db041, 0xb9b54e, 0xe0b850][stage]);
    const earDark = f.rgb([0x4a7f2c, 0x5f8f32, 0x8f8a36, 0xa97f2a][stage]);
    f.each(s, (x, y) => f.put(s, x, y, stalk, 0, 0));
    const stalks = 7;
    const minWidth = 0.5 / s.size;
    for (let i = 0; i < stalks; i++) {
        const x0 = 0.08 + (i / (stalks - 1)) * 0.84 + (f.hash(i, 0, seed) - 0.5) * 0.06;
        const height = 0.8 + f.hash(i, 1, seed) * 0.2;
        const lean = (f.hash(i, 2, seed) - 0.5) * 0.14;
        const leafSide = f.hash(i, 4, seed) > 0.5 ? 1 : -1;
        f.each(s, (x, y, u, v) => {
            const t = (1 - v) / height;
            if (t < 0 || t > 1) return;
            const cx = x0 + lean * t;
            const earStart = stage >= 2 ? 0.62 : 2;
            // A leaf leaving the stalk low down.
            const leafT = (t - 0.18) / 0.3;
            if (stage >= 1 && leafT >= 0 && leafT <= 1 && Math.abs(u - (cx + leafSide * leafT * 0.12)) < Math.max(0.02 * (1 - leafT) + 0.006, minWidth)) {
                f.put(s, x, y, f.tone(s, f.rgb(stage === 3 ? 0xa89a4a : 0x5f9e3a), 0.05 - leafT * 0.1), 0.6, 1);
                return;
            }
            if (t >= earStart) {
                // The ear: plump grains in two staggered columns.
                const et = (t - earStart) / (1 - earStart);
                const width = 0.045 * (1 - Math.pow(Math.abs(et - 0.45) / 0.55, 2)) + 0.012;
                if (Math.abs(u - cx) > Math.max(width, minWidth)) return;
                const row = Math.floor(et * 6 + (u > cx ? 0.5 : 0));
                const grain = (row % 2 === 0) ? ear : earDark;
                f.put(s, x, y, f.tone(s, grain, (f.hash(x, y, seed + 5) - 0.5) * 0.16), 0.8, 1);
                return;
            }
            const width = (stage === 0 ? 0.04 : 0.018) * (1 - t * 0.5) + 0.006;
            if (Math.abs(u - cx) > Math.max(width, minWidth)) return;
            f.put(s, x, y, f.tone(s, stalk, -(1 - t) * 0.2 + t * 0.08), t, 1);
        });
    }
}

FARMING_WHEAT_HEIGHTS.forEach((height, stage) => {
    registerTexturePattern(`wheat_${stage}`, (f, s, tint, seed) => farmingPaintWheat(f, s, stage, seed), { sprite: true });
});

// ---------------------------------------------------------------------------------------
// Blocks

registerBlockType('farmland', {
    color: 0x5c3b22, name: 'Farmland', breakDuration: 0.45, category: 'soil', dropType: 'dirt',
    faces: { top: 'farmland_top', side: 'farmland_side', bottom: 'farmland_side' }
});

FARMING_WHEAT_HEIGHTS.forEach((height, stage) => {
    const yOffset = height / 2 - 0.5;
    // Four planes in a # pattern, like a row of crops.
    const crossPlanes = [
        { width: 0.94, height, rotationY: 0, yOffset, zOffset: 0.22 },
        { width: 0.94, height, rotationY: 0, yOffset, zOffset: -0.22 },
        { width: 0.94, height, rotationY: Math.PI / 2, yOffset, zOffset: 0.22 },
        { width: 0.94, height, rotationY: Math.PI / 2, yOffset, zOffset: -0.22 }
    ];
    const ripe = stage === FARMING_WHEAT_HEIGHTS.length - 1;
    registerBlockType(`wheat_${stage}`, {
        color: ripe ? 0xd8b44a : 0x6aa53c, name: ripe ? 'Ripe Wheat' : 'Wheat Crop',
        transparent: true, solid: false, breakDuration: 0.1, cross: true, crossPlanes,
        faces: { top: `wheat_${stage}`, side: `wheat_${stage}` },
        dropType: ripe ? 'wheat' : 'wheat_seeds', cropStage: stage
    });
});

// ---------------------------------------------------------------------------------------
// Items

const FARMING_SPRITES = {
    wheat_seeds: [
        '............',
        '............',
        '....s...S...',
        '...SS..sS...',
        '...Ss...s...',
        '.S.....S....',
        'SS..s.SS....',
        'Ss.SS.Ss.S..',
        '...Ss....SS.',
        '.s.....s.Ss.',
        '.Ss...SS....',
        '.......s....'
    ],
    wheat: [
        '..Y...Y..Y..',
        '.YyY.YyY.Yy.',
        '.YyY.YyYYyY.',
        '..Yy.YyY.Yy.',
        '..YY..Y..Y..',
        '...G..G.G...',
        '....G.GG....',
        '....GGGG....',
        '....bbbb....',
        '....GGGG....',
        '...G.GG.G...',
        '..G..G...G..'
    ],
    bread: [
        '............',
        '............',
        '............',
        '...LLLLLL...',
        '..LCLLCLLL..',
        '.LLLCLLLCLL.',
        '.LLLLCLLLCL.',
        '.DLLLLLLLLD.',
        '.DDLLLLLLDD.',
        '..DDDDDDDD..',
        '............',
        '............'
    ]
};

const FARMING_ITEMS = {
    wheat_seeds: { color: 0x8f7a3a, name: 'Wheat Seeds', palette: { S: 0xd2bd72, s: 0x8f7a3a } },
    wheat: { color: 0xb88f2e, name: 'Wheat', palette: { Y: 0xe6c65c, y: 0xb88f2e, G: 0xb0a050, b: 0x7a4a22 } },
    bread: { color: 0xa8692a, name: 'Bread', palette: { L: 0xc98a3e, C: 0xeccb85, D: 0x8a5523 }, food: FARMING_BREAD_HEAL }
};

Object.entries(FARMING_ITEMS).forEach(([id, item]) => {
    registerItemType(id, {
        color: item.color,
        name: item.name,
        drawIcon: resourcesDrawSprite(FARMING_SPRITES[id], item.palette),
        displayMesh: resourcesDisplayMesh,
        ...(item.food ? { consume(type) { return this.farmingEat(type); } } : {})
    });
});

registerGameContent(function ({ addItem, addRecipe }) {
    addItem('wheat_seeds');
    addItem('wheat');
    addRecipe('bread', 'Bake Bread', 'bread', 1, [{ type: 'wheat', amount: 3 }]);
    if (ITEM_TYPES.bait_seeds) {
        addRecipe('bait_seeds_wheat', 'Gather Seed Bait from Wheat Seeds', 'bait_seeds', 2, [{ type: 'wheat_seeds', amount: 1 }]);
    }
});

registerItemUseHandler(function (item, hit) {
    return this.farmingUse(item, hit);
});

registerBlockBreakHandler(function (blockType, position) {
    this.farmingAfterBreak(blockType, position);
});

Object.assign(Game.prototype, {
    farmingIsCrop(type) {
        return Boolean(type && BLOCK_TYPES[type] && BLOCK_TYPES[type].cropStage !== undefined);
    },

    // Right click with a hoe (till) or with seeds (plant). Returns whether it took the click.
    farmingUse(item, hit) {
        if (!item || !hit) return false;
        const def = this.getItemDefinition(item);
        const hoe = Boolean(def && def.toolType === 'hoe');
        if (!hoe && item !== 'wheat_seeds') return false;
        const position = this.world.getBlockPositionFromIntersection(hit);
        if (!position) return false;
        const target = this.world.getBlockTypeAt(position.x, position.y, position.z);
        const above = this.world.getBlockTypeAt(position.x, position.y + 1, position.z);

        if (hoe) {
            if ((target !== 'grass' && target !== 'dirt') || above) return false;
            if (this.farmingSetBlock(position, 'farmland')) {
                this.playNoiseBurst({ duration: 0.12, volume: 0.02, highpass: 200, lowpass: 900 });
            }
            return true;
        }

        if (target !== 'farmland') {
            if (!this.farmingIsCrop(target)) {
                this.receiveSystemMessage({ text: 'Seeds only grow on farmland: right click grass or dirt with a hoe first' });
            }
            return true;
        }
        if (above) return true;
        const crop = { x: position.x, y: position.y + 1, z: position.z };
        if (!this.consumeSelectedBlock()) return true;
        if (!this.farmingSetBlock(crop, 'wheat_0')) {
            this.addInventory('wheat_seeds', 1);
            return true;
        }
        this.playPlaceSound('wheat_0');
        return true;
    },

    farmingSetBlock(position, blockType) {
        const payload = { x: position.x, y: position.y, z: position.z, blockType };
        if (!this.world.addBlock(payload)) return false;
        if (this.network.connected) this.network.send('blockPlace', payload);
        this.placeActionTimer = 0.35;
        this.showHitIndicator();
        this.lastSelectionUpdate = 0;
        return true;
    },

    // Extra drops besides the block's own dropType (world.getDropTypeForBlock).
    farmingExtraDrops(blockType, position) {
        const spot = { x: position.x + 0.2, y: position.y + 0.2, z: position.z + 0.2 };
        if (blockType === 'tall_grass' && Math.random() < FARMING_SEED_CHANCE) {
            this.spawnPickup('wheat_seeds', spot, 1);
        } else if (blockType === FARMING_WHEAT_RIPE) {
            this.spawnPickup('wheat_seeds', spot, Math.random() < 0.5 ? 1 : 2);
        }
    },

    farmingAfterBreak(blockType, position) {
        this.farmingExtraDrops(blockType, position);
        if (blockType !== 'farmland') return;
        // Breaking the soil uproots the crop on it.
        const above = { x: position.x, y: position.y + 1, z: position.z };
        const crop = this.world.getBlockTypeAt(above.x, above.y, above.z);
        if (!this.farmingIsCrop(crop) || !this.world.removeBlockAt(above.x, above.y, above.z)) return;
        this.spawnPickup(this.world.getDropTypeForBlock(crop), above, 1);
        this.farmingExtraDrops(crop, above);
        if (this.network.connected) this.network.send('blockBreak', above);
    },

    // G key on bread.
    farmingEat(type) {
        const heal = FARMING_ITEMS[type] && FARMING_ITEMS[type].food;
        if (!heal) return false;
        if (this.health >= this.maxHealth) {
            this.receiveSystemMessage({ text: 'You are already at full health' });
            return true;
        }
        if (!this.consumeSelectedBlock()) return false;
        const healed = Math.min(heal, this.maxHealth - this.health);
        this.health = Math.min(this.maxHealth, this.health + heal);
        this.updateHealthUI();
        this.playTone({ frequency: 600, duration: 0.05, type: 'triangle', volume: 0.025, release: 0.05 });
        this.receiveSystemMessage({ text: `You ate ${FARMING_ITEMS[type].name} and recovered ${healed} health` });
        return true;
    }
});
