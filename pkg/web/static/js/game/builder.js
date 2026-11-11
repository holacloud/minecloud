// Builder mode (PLAN_PARCELAS.md, phase 3; the server side is pkg/network/builder.go).
//
// - It turns on by itself when the player walks into a plot of theirs or one they are a guest of
//   (js/game/claims.js knows the plots), and stays on in a margin of BUILDER_MARGIN blocks around the plot's
//   square, so its walls can be built from outside: flight, the palette and no fall damage go on there. It goes off
//   beyond the margin. In the margin itself nothing is the plot's: a palette placement aimed at a margin cell is
//   refused before it is sent (builderPartsAllowed), and a block broken there breaks, drops and is protected as
//   anywhere outside a plot. The 8 free blocks between plots and from the spawn zone keep a margin off them; where
//   two of the player's margins meet (plots placed before that rule), the plot the player is in, or else the
//   nearest, is the one (builderPlotNear). A small sign says it is on. «Modo
//   constructor» in the pause menu (or a tap on the sign, on touch) turns it off for whoever prefers to build
//   with their own materials there; the choice is kept in this browser (BUILDER_PREF_KEY). Creative mode
//   already has everything, so builder mode stays off in it.
// - The palette: every building and decoration item, from the item tags (js/game/item_tags.js): what has a
//   family of BUILDER_FAMILIES and none of BUILDER_NOT_FAMILIES, but BUILDER_NOT_ITEMS. The server keeps the
//   same list (builderPalette in pkg/network/builder.go) and test/js/builder.test.js checks that both agree, so
//   a change of tags that moves an item in or out of the palette fails a test until both lists say so.
// - While it is on, the hotbar and the inventory panel show the palette (∞) together with the player's own
//   items that are not in it. Their own items of a palette type stay where they are, untouched: placing that
//   type uses the palette. The palette is never in the real inventory: `inventory` and `inventoryCounts` never
//   see it, so it is never saved, dropped, put in a chest, crafted with, eaten nor held in the left hand. A
//   palette item in the hand is an empty hand for everything but placing it (a glass block does not milk a
//   cow). On leaving, the palette's slots go and the hotbar is the player's own again.
// - Placing from the palette sends `palette: true`; the server takes it only for a palette type inside a plot
//   where the player is owner or guest (never in the spawn zone), and gives nothing back when it refuses.
// - Breaking in builder mode is instant (BUILDER_BREAK_GAP between blocks); a block of a palette type drops
//   nothing, anything else drops as always (a chest's contents always spill: the server decides that). A cell
//   placed from the palette in this browser drops nothing later either, with builder mode off
//   (BUILDER_PLACED_KEY), so turning it off is no way to get blocks.
// - Flight (double jump, as in creative mode: js/camera.js) and no fall damage inside the plot and its margin.
//   Walking or flying beyond the margin ends flight, and the fall down to the first landing does no harm either (builderSafeFall).
// Every line is in BUILDER_TEXT, in ES and EN. Mixed into Game.prototype; loaded after claims.js.

const BUILDER_PREF_KEY = 'minecloud-builder';
const BUILDER_PLACED_KEY = 'minecloud-builder-placed';
// Cells remembered as placed from the palette, the oldest forgotten first.
const BUILDER_PLACED_MAX = 8000;
const BUILDER_FAMILIES = ['building', 'decoration', 'furniture', 'light', 'glass', 'wool', 'wood', 'stone'];
const BUILDER_NOT_FAMILIES = ['science', 'electric', 'logic', 'mechanism', 'chemistry', 'element', 'microscope', 'sample', 'ore',
    'food', 'drink', 'tool', 'weapon', 'armor', 'egg', 'bait', 'farming', 'plant', 'animal'];
// The marker would claim a plot; the oven cooks what is put in it.
const BUILDER_NOT_ITEMS = ['claim_marker', 'oven'];
// What the hotbar offers when builder mode turns on, after what the player already had there.
const BUILDER_STARTERS = ['stone_bricks', 'planks', 'glass', 'cobblestone', 'oak_stairs', 'stone_slab', 'oak_door', 'torch', 'white_wool'];
// How much of a palette type the placing code sees in the hand (it only asks whether there is any).
const BUILDER_STOCK = 999;
// Seconds between two blocks broken in builder mode: instant, but one at a time.
const BUILDER_BREAK_GAP = 0.18;
// How long on the ground ends the safe fall after leaving a plot in the air.
const BUILDER_LANDED_S = 0.5;
const BUILDER_SLOT_PREFIX = 'palette:';
// Blocks around a plot's square in which builder mode stays on, to fly around it and build its walls from
// outside. Less than half the 8 free blocks between plots (claimGap in pkg/network/claims.go).
const BUILDER_MARGIN = 3;

const BUILDER_TEXT = {
    on: { ES: 'Modo constructor', EN: 'Builder mode' },
    off: { ES: 'Modo constructor apagado', EN: 'Builder mode off' },
    turnedOn: { ES: 'Modo constructor: materiales infinitos (∞). Doble salto para volar.', EN: 'Builder mode: endless materials (∞). Double jump to fly.' },
    turnedOff: { ES: 'Modo constructor apagado: construyes con lo tuyo.', EN: 'Builder mode off: you build with your own things.' },
    left: { ES: 'Te has alejado de la parcela: fin del modo constructor.', EN: 'You moved away from the plot: builder mode is over.' },
    refusedMargin: { ES: 'Lo de la paleta solo va dentro de la parcela, no en el margen de alrededor.', EN: 'Palette items only go inside the plot, not in the margin around it.' },
    pauseOn: { ES: 'Modo constructor: sí', EN: 'Builder mode: on' },
    pauseOff: { ES: 'Modo constructor: no', EN: 'Builder mode: off' },
    notYours: { ES: 'Lo de la paleta no sale de la parcela.', EN: 'Palette items never leave the plot.' },
    refusedPalette: { ES: 'Eso no está en la paleta del modo constructor.', EN: "That isn't in the builder mode palette." },
    refusedOutside: { ES: 'El modo constructor solo sirve dentro de tu parcela o de una en la que estés invitado.', EN: 'Builder mode only works inside your plot or one you are a guest of.' }
};

function builderSay(key) {
    const line = BUILDER_TEXT[key];
    return line ? gameText(line) || line.EN : key;
}

// ---------------------------------------------------------------------------------------
// Pure helpers (also used by test/js/builder.test.js)

// Whether an item with these tags is in the palette.
function builderPaletteAllows(id, tags) {
    if (BUILDER_NOT_ITEMS.includes(id)) return false;
    return tags.some((tag) => BUILDER_FAMILIES.includes(tag)) && !tags.some((tag) => BUILDER_NOT_FAMILIES.includes(tag));
}

// The palette of a catalogue, in its order: items only (no states), that can be placed.
function builderPaletteOf(blockTypes) {
    return itemTagCatalogue(blockTypes).filter((id) => !blockTypes[id].itemOnly && builderPaletteAllows(id, itemTagsOf(id, blockTypes)));
}

// The item a block in the world is (a state is its item's).
function builderItemOf(type, blockTypes) {
    if (!type) return null;
    const def = blockTypes && blockTypes[type];
    return def && def.variantOf ? def.variantOf : String(type).split(':')[0];
}

function builderSlotKey(type) {
    return BUILDER_SLOT_PREFIX + type;
}

function builderSlotType(key) {
    return typeof key === 'string' && key.startsWith(BUILDER_SLOT_PREFIX) ? key.slice(BUILDER_SLOT_PREFIX.length) : null;
}

function builderCellKey(x, y, z) {
    return `${x},${y},${z}`;
}

// A plot's square grown by the margin on every side.
function builderMarginRect(rect, margin = BUILDER_MARGIN) {
    return { minX: rect.minX - margin, minZ: rect.minZ - margin, maxX: rect.maxX + margin, maxZ: rect.maxZ + margin };
}

// The plot whose builder mode reaches column (x, z): the plot of the player's (owner or guest) the column is in,
// or else the nearest one whose margin has it; null in someone else's plot, the spawn zone, or beyond every margin.
function builderPlotNear(state, x, z) {
    const zone = claimZoneOf(state, x, z);
    if (zone) return zone.kind === 'plot' && claimIsMember(zone.claim) ? zone.claim : null;
    let best = null;
    let bestDistance = Infinity;
    for (const claim of (state && state.claims) || []) {
        if (!claimIsMember(claim) || !claimRectContains(builderMarginRect(claim), x, z)) continue;
        const distance = claimRectDistance(claim, x + 0.5, z + 0.5);
        if (distance < bestDistance) {
            best = claim;
            bestDistance = distance;
        }
    }
    return best;
}

const BUILDER_CSS = `
#builder-indicator{position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:5px 12px;border-radius:999px;border:1px solid rgba(124,242,154,.55);background:rgba(8,12,20,.78);color:#bff7cf;font:700 13px 'Consolas',monospace;z-index:120;display:none;white-space:nowrap;touch-action:manipulation;user-select:none}
#builder-indicator.visible{display:block}
#builder-indicator.dim{opacity:.55;color:#fff;border-color:rgba(255,255,255,.25)}
body.touch-ui #builder-indicator{pointer-events:auto;cursor:pointer}
body:not(.touch-ui) #builder-indicator{pointer-events:none}
.hotbar-slot.builder-palette .slot-count{color:#bff7cf}
`;

// ---------------------------------------------------------------------------------------
// The game

Object.assign(Game.prototype, {
    builderLoad() {
        this.builderActive = false;
        this.builderSelected = null;
        this.builderHotbar = [];
        this.builderSafeFall = false;
        this.builderLandedFor = 0;
        this.builderBreakWait = 0;
        try {
            this.builderEnabled = window.localStorage.getItem(BUILDER_PREF_KEY) !== 'off';
        } catch (_error) {
            this.builderEnabled = true;
        }
        this.builderPlaced = new Set();
        try {
            const saved = JSON.parse(window.localStorage.getItem(BUILDER_PLACED_KEY) || '[]');
            if (Array.isArray(saved)) saved.filter((key) => typeof key === 'string').forEach((key) => this.builderPlaced.add(key));
        } catch (_error) {
            // Nothing remembered.
        }
    },

    // For a game whose content hooks have not run (tests of other files): loaded on first use.
    builderEnsure() {
        if (!this.builderPlaced) this.builderLoad();
    },

    // The palette of this game's catalogue, worked out once: the list in order and a set.
    builderPalette() {
        if (!this.builderPaletteList && this.world && this.world.blockTypes) {
            this.builderPaletteList = builderPaletteOf(this.world.blockTypes);
            this.builderPaletteSet = new Set(this.builderPaletteList);
        }
        return this.builderPaletteList || [];
    },

    builderInPalette(type) {
        this.builderPalette();
        return Boolean(this.builderPaletteSet) && this.builderPaletteSet.has(builderItemOf(type, this.world && this.world.blockTypes));
    },

    // The plot the player stands in or in its margin, if they may build there.
    builderPlotHere() {
        if (!this.cameraController || !this.claimState) return null;
        const at = this.cameraController.getPosition();
        return builderPlotNear(this.claimState, Math.floor(at.x), Math.floor(at.z));
    },

    // Whether column (x, z) is inside a plot of the player's (not its margin): the only cells the palette reaches.
    builderCellInPlot(x, z) {
        const zone = typeof this.claimZoneAt === 'function' ? this.claimZoneAt(x, z) : null;
        return Boolean(zone && zone.kind === 'plot' && claimIsMember(zone.claim));
    },

    // building.js asks before placing from the palette: every cell inside the plot, or nothing placed nor sent.
    builderPartsAllowed(parts) {
        if (parts.every((part) => this.builderCellInPlot(part.x, part.z))) return true;
        if (typeof this.claimNotice === 'function') this.claimNotice(builderSay('refusedMargin'));
        return false;
    },

    builderShouldBeOn() {
        return Boolean(this.builderEnabled && !this.creativeMode && !this.respawnPending && this.world && this.builderPlotHere());
    },

    // Each frame: on or off at the border, the sign, and the end of a safe fall.
    builderUpdate(delta = 0) {
        this.builderEnsure();
        const plot = this.builderPlotHere();
        const should = this.builderShouldBeOn();
        if (should && !this.builderActive) this.builderTurnOn();
        else if (!should && this.builderActive) this.builderTurnOff(!plot ? 'left' : !this.builderEnabled ? 'turnedOff' : null);
        this.builderShowIndicator(Boolean(plot) && !this.creativeMode);
        if (this.builderBreakWait > 0) this.builderBreakWait = Math.max(0, this.builderBreakWait - delta);
        if (this.builderSafeFall && this.cameraController) {
            this.builderLandedFor = this.cameraController.onGround || this.cameraController.isInWater ? this.builderLandedFor + delta : 0;
            if (this.builderLandedFor >= BUILDER_LANDED_S) this.builderSafeFall = false;
        }
    },

    builderTurnOn() {
        this.builderActive = true;
        this.builderSafeFall = false;
        const keys = [];
        for (const item of this.builderRealHotbarItems()) {
            const key = this.builderInPalette(item.type) && !item.entry ? builderSlotKey(item.type) : item.key;
            if (!keys.includes(key)) keys.push(key);
        }
        for (const type of BUILDER_STARTERS) {
            if (keys.length >= this.hotbarSize) break;
            if (this.builderInPalette(type) && !keys.includes(builderSlotKey(type))) keys.push(builderSlotKey(type));
        }
        this.builderHotbar = keys.slice(0, this.hotbarSize);
        // What the hand held stays in the hand, from the palette if it is a palette type.
        const held = this.inventory[this.selectedSlot];
        this.builderSelected = held && this.getInventoryCount(held) > 0 && this.builderInPalette(held) ? held : null;
        this.builderRefresh();
        if (typeof this.claimNotice === 'function') this.claimNotice(builderSay('turnedOn'));
    },

    // `why`: the notice (turnedOff, left), or nothing.
    builderTurnOff(why = null) {
        const controller = this.cameraController;
        if (controller && (controller.flying || !controller.onGround)) {
            this.builderSafeFall = true;
            this.builderLandedFor = 0;
        }
        if (controller && !this.creativeMode) {
            controller.flightAllowed = false;
            controller.flying = false;
        }
        const held = this.builderSelected;
        this.builderActive = false;
        this.builderSelected = null;
        this.builderHotbar = [];
        // The hand keeps that type if the player has some of their own.
        const own = held ? this.inventory.indexOf(held) : -1;
        if (own >= 0 && this.getInventoryCount(held) > 0) this.selectedSlot = own;
        this.builderRefresh();
        if (why && typeof this.claimNotice === 'function') this.claimNotice(builderSay(why));
    },

    builderSetEnabled(on) {
        this.builderEnabled = Boolean(on);
        try {
            window.localStorage.setItem(BUILDER_PREF_KEY, this.builderEnabled ? 'on' : 'off');
        } catch (_error) {
            // It lasts until the page reloads.
        }
        this.builderLabelPauseButton();
        this.builderUpdate(0);
    },

    builderToggle() {
        this.builderSetEnabled(!this.builderEnabled);
    },

    builderRefresh() {
        if (typeof this.updateHotbarCounts === 'function' && this.hotbarSlotElements) this.updateHotbarCounts();
        if (typeof this.renderInventoryPanel === 'function') this.renderInventoryPanel();
        if (typeof this.refreshHeldItemMesh === 'function') this.refreshHeldItemMesh();
    },

    // A palette item in the hand.
    builderHolding() {
        return Boolean(this.builderActive && this.builderSelected);
    },

    // Takes a palette type in the hand, and onto the first hotbar slot with `promote`.
    builderSelect(type, promote = false) {
        if (!this.builderActive || !this.builderInPalette(type)) return false;
        this.builderSelected = type;
        if (promote) this.builderPromote(builderSlotKey(type));
        this.builderRefresh();
        return true;
    },

    builderPromote(key) {
        this.builderHotbar = [key, ...this.builderHotbar.filter((other) => other !== key)].slice(0, this.hotbarSize);
    },

    // The hotbar as it is without the palette.
    builderRealHotbarItems() {
        const active = this.builderActive;
        this.builderActive = false;
        try {
            return this.getHotbarItems();
        } finally {
            this.builderActive = active;
        }
    },

    // What the hotbar shows in builder mode: palette slots (∞) and the player's own items outside the palette.
    builderHotbarItems() {
        const items = [];
        const hand = this.hotbarHandEntry(this.inventory[this.selectedSlot]);
        const push = (key) => {
            if (items.length >= this.hotbarSize || items.some((item) => item.key === key)) return;
            const type = builderSlotType(key);
            if (type) {
                if (this.builderInPalette(type)) items.push({ index: -1, type, entry: null, count: '∞', key, palette: true, selected: this.builderSelected === type });
                return;
            }
            const item = this.hotbarItemOf(key);
            if (!item || (this.builderInPalette(item.type) && !item.entry)) return;
            item.selected = !this.builderSelected && item.index === this.selectedSlot && item.key === hand;
            items.push(item);
        };
        this.builderHotbar.forEach(push);
        // The player's own items fill the rest, as the hotbar always does.
        for (const item of this.builderRealHotbarItems()) push(item.key);
        this.inventory.forEach((type) => push(this.hotbarHandEntry(type)));
        return items;
    },

    // What the inventory panel lists in builder mode: own items outside the palette, then the palette; null
    // when builder mode is off.
    builderInventoryItems() {
        if (!this.builderActive) return null;
        const own = this.inventory
            .map((type, slot) => ({ type, slot }))
            .filter(({ type }) => this.getInventoryCount(type) > 0 && !this.builderInPalette(type));
        return [...own, ...this.builderPalette().map((type) => ({ type, slot: -1, palette: true }))];
    },

    builderInjectCss() {
        if (this.builderCssDone || typeof document === 'undefined' || !document.head) return;
        this.builderCssDone = true;
        const style = document.createElement('style');
        style.textContent = BUILDER_CSS;
        document.head.appendChild(style);
    },

    // The sign while the player is in a plot they may build in: bright when on, dim when turned off.
    builderShowIndicator(show) {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
        let sign = this.builderIndicator;
        if (!sign) {
            if (!show) return;
            this.builderInjectCss();
            sign = document.createElement('div');
            sign.id = 'builder-indicator';
            sign.addEventListener('pointerdown', (event) => {
                if (event && event.preventDefault) event.preventDefault();
                this.builderToggle();
            });
            document.body.appendChild(sign);
            this.builderIndicator = sign;
        }
        const text = show ? `🔨 ${builderSay(this.builderActive ? 'on' : 'off')}` : '';
        if (sign.textContent !== text) sign.textContent = text;
        sign.classList.toggle('visible', show);
        sign.classList.toggle('dim', show && !this.builderActive);
    },

    builderAddPauseButton() {
        if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
        const row = document.querySelector('#pause-menu .pause-actions-main');
        if (!row || document.getElementById('settings-builder')) return;
        const button = document.createElement('button');
        button.id = 'settings-builder';
        button.type = 'button';
        button.addEventListener('click', () => this.builderToggle());
        row.appendChild(button);
        this.builderPauseButton = button;
        this.builderLabelPauseButton();
    },

    builderLabelPauseButton() {
        if (this.builderPauseButton) this.builderPauseButton.textContent = builderSay(this.builderEnabled ? 'pauseOn' : 'pauseOff');
    },

    // ---- Cells placed from the palette (no drop when broken, whoever turned what off) ----

    // What building.js sends for each cell it places: from the palette, marked so, and remembered.
    builderOutgoing(payload) {
        this.builderEnsure();
        const key = builderCellKey(payload.x, payload.y, payload.z);
        if (this.builderPlacingOnly) {
            this.builderPlaced.delete(key);
            this.builderPlaced.add(key);
            while (this.builderPlaced.size > BUILDER_PLACED_MAX) this.builderPlaced.delete(this.builderPlaced.values().next().value);
            this.builderSavePlaced();
            return { ...payload, palette: true };
        }
        if (this.builderPlaced.delete(key)) this.builderSavePlaced();
        return payload;
    },

    builderForget(x, y, z) {
        this.builderEnsure();
        if ( this.builderPlaced.delete(builderCellKey(x, y, z))) this.builderSavePlaced();
    },

    builderSavePlaced() {
        if (this.builderSaveTimer) return;
        const save = () => {
            this.builderSaveTimer = null;
            try {
                window.localStorage.setItem(BUILDER_PLACED_KEY, JSON.stringify([...this.builderPlaced]));
            } catch (_error) {
                // Storage full or blocked: remembered until the page reloads.
            }
        };
        this.builderSaveTimer = typeof setTimeout === 'function' ? setTimeout(save, 1000) : null;
        if (!this.builderSaveTimer) save();
    },

    // Once, when the game has started (registerGameInit below).
    builderInit() {
        if (typeof onGameLangChange === 'function') {
            onGameLangChange(() => {
                this.builderLabelPauseButton();
                if (this.builderIndicator) this.builderShowIndicator(this.builderIndicator.classList.contains('visible'));
            });
        }
        this.builderAddPauseButton();
    },

    // Runs `fn` with an empty hand when a palette item is in it: nothing but placing it ever uses it.
    builderWithEmptyHand(fn) {
        if (!this.builderHolding()) return fn();
        const previous = this.builderEmptyHand;
        this.builderEmptyHand = true;
        try {
            return fn();
        } finally {
            this.builderEmptyHand = previous;
        }
    },

    builderRefusalText(refusal) {
        if (!refusal) return '';
        if (refusal.reason === 'palette') return builderSay('refusedPalette');
        if (refusal.reason === 'builderOutside') return builderSay('refusedOutside');
        return '';
    }
});

// Around inventory.js, building.js, offhand.js and claims.js: the palette in the hand, the hotbar and the panel.
(() => {
    const proto = Game.prototype;
    const wrap = (name, make) => {
        const original = proto[name];
        if (typeof original === 'function') proto[name] = make(original);
    };

    wrap('getSelectedBlockType', (original) => function () {
        if (this.builderHolding()) return this.builderEmptyHand ? null : this.builderSelected;
        return original.call(this);
    });
    wrap('getSelectedHeldItemType', (original) => function () {
        if (this.builderHolding()) return this.builderEmptyHand ? null : this.builderSelected;
        return original.call(this);
    });
    // Only the placing code and the held item's mesh see the palette type as something in the hand.
    wrap('getInventoryCount', (original) => function (type) {
        if (this.builderCountScope && this.builderHolding() && type === this.builderSelected) return BUILDER_STOCK;
        return original.call(this, type);
    });
    wrap('consumeSelectedBlock', (original) => function () {
        if (this.builderHolding()) return !this.builderEmptyHand && Boolean(this.builderPlacingOnly);
        return original.call(this);
    });
    wrap('refreshHeldItemMesh', (original) => function (...args) {
        const previous = this.builderCountScope;
        this.builderCountScope = true;
        try {
            return original.apply(this, args);
        } finally {
            this.builderCountScope = previous;
        }
    });
    wrap('hotbarLabelText', (original) => function () {
        const text = original.call(this);
        return this.builderHolding() && text ? `${text} · ∞` : text;
    });
    wrap('getHotbarItems', (original) => function () {
        return this.builderActive ? this.builderHotbarItems() : original.call(this);
    });
    wrap('promoteTypeToHotbar', (original) => function (type, plateId = null) {
        if (!this.builderActive) return original.call(this, type, plateId);
        if (!type || this.getInventoryCount(type) <= 0) return;
        this.builderPromote(plateId ? hotbarEntryKey(type, plateId) : this.hotbarHandEntry(type));
    });
    // A real slot in the hand: no longer the palette.
    wrap('selectSlot', (original) => function (index, options = {}) {
        if (this.builderActive) this.builderSelected = null;
        return original.call(this, index, options);
    });
    wrap('selectHotbarSlot', (original) => function (visibleIndex) {
        const item = this.builderActive ? this.getHotbarItems()[visibleIndex] : null;
        if (item && item.palette) return this.builderSelect(item.type);
        return original.call(this, visibleIndex);
    });
    wrap('updateHotbarCounts', (original) => function () {
        const result = original.call(this);
        const items = this.getHotbarItems();
        (this.hotbarSlotElements || []).forEach((slot, i) => slot && slot.classList && slot.classList.toggle('builder-palette', Boolean(items[i] && items[i].palette)));
        return result;
    });

    // Something crafted goes to the hand (inventory.js), unless it is a palette type: then the palette's stays.
    wrap('craftRecipe', (original) => function (recipeId) {
        const result = original.call(this, recipeId);
        const recipe = (this.craftingRecipes || []).find((item) => item.id === recipeId);
        if (this.builderActive && recipe && !this.builderInPalette(recipe.output.type) && this.inventory[this.selectedSlot] === recipe.output.type) {
            this.builderSelected = null;
            this.builderRefresh();
        }
        return result;
    });

    // Nothing of the palette leaves the hand: not dropped, eaten, nor moved to the left hand.
    for (const name of ['dropSelectedBlock', 'eatSelectedItem', 'offhandSwapSelected']) {
        wrap(name, (original) => function (...args) {
            if (this.builderHolding() && !(name === 'offhandSwapSelected' && args[0])) {
                if (typeof this.claimNotice === 'function') this.claimNotice(builderSay('notYours'));
                return false;
            }
            return original.apply(this, args);
        });
    }
    // With a palette item, a right click on a mob is made with an empty hand.
    for (const name of ['tryUseItemOnMob', 'tryMountMob']) {
        wrap(name, (original) => function (...args) {
            if (this.builderPlacingOnly) return false;
            return this.builderWithEmptyHand(() => original.apply(this, args));
        });
    }
    // With a palette item: first every use, with an empty hand (doors, chests, markers...), then the placing.
    wrap('placeBlock', (original) => function () {
        if (!this.builderHolding()) return original.call(this);
        const hit = typeof this.raycastBlock === 'function' ? this.raycastBlock(this.placeDistance) : null;
        const used = this.builderWithEmptyHand(() => this.tryUseItemOnMob() || this.tryMountMob() ||
            (typeof ITEM_USE_HANDLERS !== 'undefined' && ITEM_USE_HANDLERS.some((handler) => handler.call(this, null, hit))));
        if (used) return undefined;
        const previous = [this.builderPlacingOnly, this.builderCountScope];
        this.builderPlacingOnly = true;
        this.builderCountScope = true;
        try {
            return original.call(this);
        } finally {
            [this.builderPlacingOnly, this.builderCountScope] = previous;
        }
    });

    // Breaking: instant in builder mode, one block at a time; in the margin (building.js gives the cell), as always.
    wrap('getAdjustedBreakDuration', (original) => function (blockType, baseDuration, cell = null) {
        const duration = original.call(this, blockType, baseDuration, cell);
        const inPlot = !cell || this.builderCellInPlot(cell.x, cell.z);
        return this.builderActive && inPlot && duration ? 0 : duration;
    });
    wrap('updateMining', (original) => function (delta) {
        if (this.builderActive && this.builderBreakWait > 0 && this.isBreakInputActive) {
            this.resetMiningTarget();
            this.resetMiningBlockVisual(false);
            return undefined;
        }
        return original.call(this, delta);
    });
    // A palette type broken in builder mode inside the plot, or a cell placed from the palette, drops nothing. In the
    // margin a block drops as anywhere else.
    wrap('finishBreakingBlock', (original) => function (position) {
        this.builderEnsure();
        const type = this.world.getBlockTypeAt(position.x, position.y, position.z);
        const key = builderCellKey(position.x, position.y, position.z);
        const inPlot = this.builderActive && this.builderCellInPlot(position.x, position.z);
        const noDrops = Boolean(type) && ((inPlot && this.builderInPalette(type)) || this.builderPlaced.has(key));
        const previous = this.builderNoDrops;
        this.builderNoDrops = noDrops;
        let broken;
        try {
            broken = original.call(this, position);
        } finally {
            this.builderNoDrops = previous;
        }
        if (broken) {
            this.builderForget(position.x, position.y, position.z);
            if (inPlot) this.builderBreakWait = BUILDER_BREAK_GAP;
        }
        return broken;
    });
    for (const name of ['spawnPickup', 'spawnFallingBlockDrop']) {
        wrap(name, (original) => function (...args) {
            if (this.builderNoDrops) return undefined;
            return original.apply(this, args);
        });
    }


    // What the server says when it refuses a placement from the palette.
    if (typeof claimRefusalText === 'function') {
        const claimText = claimRefusalText;
        claimRefusalText = function (refusal) {
            return (refusal && Game.prototype.builderRefusalText(refusal)) || claimText(refusal);
        };
    }
})();

// No fall damage in builder mode (the plot and its margin), nor on the way down after leaving it in the air.
registerDamageModifier(function (amount, type) {
    if (type !== 'fall' || !(this.builderActive || this.builderSafeFall)) return amount;
    this.builderSafeFall = false;
    return 0;
});

registerGameContent(function () {
    this.builderLoad();
});

registerFrameUpdate(function (delta) {
    this.builderUpdate(delta);
});

registerGameInit(function () {
    this.builderInit();
});

// Broken by someone else, or put back by the server: no longer what this browser placed.
registerNetworkHandler('blockBreak', function (payload) {
    if (payload) this.builderForget(payload.x, payload.y, payload.z);
});
registerNetworkHandler('claimRefused', function (payload) {
    for (const block of (payload && Array.isArray(payload.blocks)) ? payload.blocks : []) {
        if (block) this.builderForget(block.x, block.y, block.z);
    }
});
