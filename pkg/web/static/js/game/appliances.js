// What the oven and the cold furniture make, and the items only they make. The rules run on the
// SERVER (pkg/network/appliances.go): this file holds a copy of its tables, for the panel to show
// what will happen (js/game/storage.js), and the new items' looks and what G does with them.
// - The oven takes food and fuel, cooks while it burns, and is the only thing that thaws.
// - The fridge chills drinks, the freezer freezes water and food; both need power.
// - Nothing spoils, and nothing changes in the inventory: what comes out cold stays cold, and what
//   comes out frozen stays frozen until an oven thaws it. Frozen food cannot be eaten.
// APPLIANCE_RECIPES, APPLIANCE_FUELS, APPLIANCE_CHILL and APPLIANCE_FREEZE mirror ovenRecipes,
// ovenFuels, chillChanges and freezeChanges in appliances.go (test/js/furniture.test.js checks them).
// Mixed into Game.prototype; hooked through js/extensions.js.

const APPLIANCE_RECIPES = {
    raw_fish: { out: 'cooked_fish', in: 1, seconds: 20 },
    wheat: { out: 'bread', in: 3, seconds: 30 },
    mushroom_red: { out: 'roast_mushroom', in: 1, seconds: 15 },
    mushroom_brown: { out: 'roast_mushroom', in: 1, seconds: 15 },
    frozen_fish: { out: 'raw_fish', in: 1, seconds: 10 },
    frozen_cooked_fish: { out: 'cooked_fish', in: 1, seconds: 10 },
    frozen_bread: { out: 'bread', in: 1, seconds: 10 },
    ice: { out: 'water_flask', in: 1, seconds: 10 }
};

// Seconds of fire from one piece of fuel.
const APPLIANCE_FUELS = {
    coal_ore: 80,
    planks: 30, spruce_planks: 30, birch_planks: 30, jungle_planks: 30, acacia_planks: 30, dark_oak_planks: 30, cherry_planks: 30, maple_planks: 30, willow_planks: 30,
    wood: 20, spruce_wood: 20, birch_wood: 20, jungle_wood: 20, acacia_wood: 20, dark_oak_wood: 20, cherry_wood: 20, maple_wood: 20, willow_wood: 20
};

const APPLIANCE_CHILL = { water_flask: 'cold_water', milk: 'cold_milk', soda_water: 'cold_soda' };
const APPLIANCE_FREEZE = { water_flask: 'ice', cold_water: 'ice', raw_fish: 'frozen_fish', cooked_fish: 'frozen_cooked_fish', bread: 'frozen_bread' };
const APPLIANCE_CHILL_SECONDS = 60;
const APPLIANCE_FREEZE_SECONDS = 120;

// ---------------------------------------------------------------------------------------
// Pure helpers (also used by test/js/furniture.test.js)

// Whether the oven takes this item, in the food's slot or the fuel's.
function applianceOvenTakes(type) {
    return Boolean(APPLIANCE_RECIPES[type] || APPLIANCE_FUELS[type]);
}

// What a compartment does: a fridge's main one chills, any other cold one freezes.
function applianceColdTable(kind, tab) {
    return kind === 'fridge' && !tab
        ? { changes: APPLIANCE_CHILL, seconds: APPLIANCE_CHILL_SECONDS, verb: 'chills' }
        : { changes: APPLIANCE_FREEZE, seconds: APPLIANCE_FREEZE_SECONDS, verb: 'freezes' };
}

// How far along a stack is (0..1), or null if it does not change in this compartment.
function applianceSlotProgress(kind, tab, slot) {
    const table = applianceColdTable(kind, tab);
    if (!slot || !slot.count || !table.changes[slot.type]) return null;
    return Math.max(0, Math.min(1, (slot.chill || 0) / table.seconds));
}

// ---------------------------------------------------------------------------------------
// Sprites (12x12; '.' is transparent)

const APPLIANCE_SPRITES = {
    // A bottle with a sparkle of cold beside it.
    cold_bottle: [
        '....CCCC..w.',
        '....CCCC.www',
        '.....GG...w.',
        '.....GG.....',
        '....GLLG....',
        '...GLLLLG...',
        '..GLLHLLLG..',
        '..GLLHLLLG..',
        '..GLLLLLLG..',
        '..GLLLLLLG..',
        '...GLLLLG...',
        '....GGGG....'
    ],
    ice: [
        '............',
        '............',
        '....WWWWW...',
        '...WLLLLWW..',
        '..WWWWWWLW..',
        '..WLHLLWLW..',
        '..WHLLLWLW..',
        '..WLLLLWLW..',
        '..WLLLHWW...',
        '..WWWWWW....',
        '............',
        '............'
    ],
    frozen_fish: [
        '.........w..',
        '..w.........',
        '.....FF.....',
        '...BwBBBBw.T',
        '..BBBBwBBBTT',
        '.BEBBBBBwBTT',
        '.BwBBwBBBBTT',
        '..bbbbbwbbTT',
        '...bwbbbb..T',
        '.......w....',
        '..w.........',
        '............'
    ],
    frozen_bread: [
        '.........w..',
        '..w.........',
        '............',
        '...LLwLLL...',
        '..LCLLCLLw..',
        '.LwLCLLLCLL.',
        '.LLLLCwLLCL.',
        '.DLLwLLLLwD.',
        '.DDLLLLwLDD.',
        '..DDDwDDDD..',
        '............',
        '.......w....'
    ],
    roast_mushroom: [
        '............',
        '....RRRR....',
        '..RRrRRRRR..',
        '.RRRRRRrRRR.',
        '.RrRRRRRRRR.',
        '.DDDDDDDDDD.',
        '....SSSS....',
        '....SSSS....',
        '....SSSs....',
        '...SSSSss...',
        '............',
        '............'
    ]
};

const APPLIANCE_FROST = 0xeaf6ff;

// food: health restored (G); bottle: the glass comes back; cures: poison; frozen: not until thawed.
const APPLIANCE_ITEMS = {
    cold_water: { color: 0x3d85c6, name: 'Cold Water', sprite: APPLIANCE_SPRITES.cold_bottle, palette: { C: 0x8a6034, G: 0xcfe9f2, L: 0x8fd0f5, H: 0xeaf8ff, w: APPLIANCE_FROST }, food: 3, bottle: true },
    cold_milk: { color: 0x6c8fb0, name: 'Cold Milk', sprite: APPLIANCE_SPRITES.cold_bottle, palette: { C: 0x8a6034, G: 0xcfe9f2, L: 0xeef6fb, H: 0xffffff, w: APPLIANCE_FROST }, food: 3, cures: true, bottle: true },
    cold_soda: { color: 0x6aa9c9, name: 'Cold Soda', sprite: APPLIANCE_SPRITES.cold_bottle, palette: { C: 0x5a5f66, G: 0xcfe9f2, L: 0xc4ecfa, H: 0xffffff, w: APPLIANCE_FROST }, food: 4, bottle: true },
    ice: { color: 0xa8d8f0, name: 'Ice', sprite: APPLIANCE_SPRITES.ice, palette: { W: 0xeaf6ff, L: 0xa8d8f0, H: 0xdff2fc }, frozen: true },
    frozen_fish: { color: 0x7fa8c4, name: 'Frozen Fish', sprite: APPLIANCE_SPRITES.frozen_fish, palette: { B: 0xb4d4e6, b: 0xdce8ee, E: 0x16181c, T: 0x9cc0d8, F: 0x9cc0d8, w: APPLIANCE_FROST }, frozen: true },
    frozen_cooked_fish: { color: 0x9a8a78, name: 'Frozen Cooked Fish', sprite: APPLIANCE_SPRITES.frozen_fish, palette: { B: 0xc9ac8c, b: 0xe6d6c2, E: 0x2a1a10, T: 0xa89078, F: 0xa89078, w: APPLIANCE_FROST }, frozen: true },
    frozen_bread: { color: 0xa89278, name: 'Frozen Bread', sprite: APPLIANCE_SPRITES.frozen_bread, palette: { L: 0xc9a67c, C: 0xecdcc0, D: 0x8f7458, w: APPLIANCE_FROST }, frozen: true },
    roast_mushroom: { color: 0x6a3f24, name: 'Roast Mushroom', sprite: APPLIANCE_SPRITES.roast_mushroom, palette: { R: 0x8a4e2a, r: 0xb87a48, D: 0x4c2a14, S: 0xcfa878, s: 0xa8824f }, food: 6 }
};

Object.entries(APPLIANCE_ITEMS).forEach(([id, item]) => {
    registerItemType(id, {
        ...item,
        drawIcon: resourcesDrawSprite(item.sprite, item.palette),
        displayMesh: resourcesDisplayMesh,
        consume(type) { return this.applianceConsume(type); }
    });
});

registerGameContent(({ addItem }) => {
    Object.keys(APPLIANCE_ITEMS).forEach(addItem);
});

Object.assign(Game.prototype, {
    // G key: drink, eat, or be told that it is frozen solid.
    applianceConsume(type) {
        const def = APPLIANCE_ITEMS[type];
        if (!def) return false;
        if (def.frozen) {
            this.receiveSystemMessage({ text: `${def.name} is frozen solid: thaw it in an oven first` });
            return true;
        }
        const poisoned = Boolean(this.poison);
        if (this.health >= this.maxHealth && !(def.cures && poisoned)) {
            this.receiveSystemMessage({ text: 'You are already at full health' });
            return true;
        }
        if (!this.consumeSelectedBlock()) return false;
        const healed = Math.min(def.food, this.maxHealth - this.health);
        this.health = Math.min(this.maxHealth, this.health + def.food);
        this.updateHealthUI();
        const notes = [];
        if (healed > 0) notes.push(`recovered ${healed} health`);
        if (def.cures && poisoned) {
            this.poison = null;
            notes.push('the poison is gone');
        }
        if (def.bottle) {
            this.addInventory('glass', 1);
            this.playNoiseBurst({ duration: 0.3, volume: 0.018, highpass: 300, lowpass: 1400 });
        } else {
            this.playTone({ frequency: 600, duration: 0.05, type: 'triangle', volume: 0.025, release: 0.05 });
        }
        this.receiveSystemMessage({ text: `You ${def.bottle ? 'drank' : 'ate'} ${def.name}: ${notes.join(', ')}` });
        return true;
    }
});
