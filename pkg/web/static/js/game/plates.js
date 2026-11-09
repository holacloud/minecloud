// Culture plates that are each themselves (pkg/network/plates.go). Every other item is a type and a count in
// `inventoryCounts`; a culture plate ("Yeast Plate"...) is also one dish with what grew on it, and the server
// keeps that record, keyed by an id it issued when the plate was harvested.
// - What the client holds of each plate it carries is the server's grant: { id, token, type, culture }. The
//   token is the plate's key: it went to this client alone, and putting the plate anywhere (a chest, the
//   microscope, sowing it) takes it, so a plate can never be in two places. The culture is only for drawing:
//   the server goes by its own record.
// - `plateEntries` maps a type to the plates of it carried, in the order they came: that order is where each
//   one shows, in the inventory panel and in the hotbar (one slot per plate), and choosing one never moves it.
// - `plateHand` maps a type to the plate of it in the hand (the one Q drops, a microscope or the incubator
//   takes from the hand): its id, or null for a plain one. With nothing named, or a name that is gone, the
//   first is in the hand. Both live in the same saved JSON as the counts (minecloud-inventory-state, `plates`
//   and `plateHand`), so a reload keeps them together.
// - The count stays the truth of how many: count = entries + plain ones. A plain one is a plate from before
//   plates had records (or given by /give): it still works, draws as its type, and the server gives it a
//   record the first time it goes into a container (as only what its type says).
// - Sterile and unsterile agar plates and used dishes hold nothing grown: they stack as any item.
// - Moving a plate: plateTakeOut takes that one plate out of the inventory (with the count), and plateAdd
//   puts a grant back in. Chests (js/game/storage.js), the incubator (js/game/cultures.js), the microscope
//   (js/game/microscope.js) and pickups (Q, a broken chest) carry the entry with them while it is away, and
//   give it back if the server refuses. The left hand holds no plate (js/game/offhand.js), and death leaves
//   the inventory alone.
// Mixed into Game.prototype.

const PLATE_ID_PATTERN = /^[0-9a-f]{24}$/;
const PLATE_TOKEN_PATTERN = /^[0-9a-f]{32}$/;
// The size of a plate's own icon, drawn from its record.
const PLATE_ICON_SIZE = 48;

// Whether items of this type are each their own plate: the culture plates an incubator gives.
function plateIdentified(type) {
    if (typeof CULTURE_SPECIES === 'undefined') return false;
    return Object.values(CULTURE_SPECIES).some((kind) => kind.item === type);
}

// A grant as the server sends it, or null if it is not one.
function plateEntryOf(grant) {
    if (!grant || typeof grant !== 'object') return null;
    if (!PLATE_ID_PATTERN.test(grant.id) || !PLATE_TOKEN_PATTERN.test(grant.token) || !plateIdentified(grant.type)) return null;
    const culture = grant.culture && typeof grant.culture === 'object' ? grant.culture : null;
    return { id: grant.id, token: grant.token, type: grant.type, culture };
}

// A short summary of what is on a plate, for a tooltip: { key, args } entries for cultureSay.
function plateSummaryLines(culture, speciesName) {
    if (!culture) return [{ key: 'plateUnrecorded', args: [] }];
    const lines = [];
    const main = culture.main;
    const mould = culture.mould;
    if (main) lines.push({ key: main.logN > 0 ? 'plateMain' : 'lensGone', args: main.logN > 0 ? [speciesName(main.species), main.logN.toFixed(1)] : [speciesName(main.species)] });
    if (mould && mould.logN > 0) {
        lines.push({ key: 'plateMould', args: [mould.logN.toFixed(1)] });
        const kind = main && typeof CULTURE_SPECIES !== 'undefined' && CULTURE_SPECIES[main.species];
        if (kind && kind.penicillin && mould.logN > CULTURE_MODEL.mouldFrom) lines.push({ key: 'plateRing', args: [] });
    }
    return lines;
}

Object.assign(Game.prototype, {
    // The plates of a type carried, the one in the hand first.
    platesOf(type) {
        if (!this.plateEntries) this.plateEntries = {};
        return this.plateEntries[type] || [];
    },

    // How many of a type are plain plates, with no record yet.
    plateLegacyCount(type) {
        return Math.max(0, this.getInventoryCount(type) - this.platesOf(type).length);
    },

    // Which plate of a type is in the hand: its id, null for a plain one, undefined if there is none.
    plateHandKey(type) {
        const list = this.platesOf(type);
        const named = this.plateHand && Object.prototype.hasOwnProperty.call(this.plateHand, type) ? this.plateHand[type] : undefined;
        if (named === null && this.plateLegacyCount(type) > 0) return null;
        if (typeof named === 'string' && list.some((entry) => entry.id === named)) return named;
        if (list.length > 0) return list[0].id;
        return this.plateLegacyCount(type) > 0 ? null : undefined;
    },

    // The plate in the hand of a type, if it has a record (null: a plain one, or none).
    plateHeld(type) {
        const key = this.plateHandKey(type);
        return (key && this.platesOf(type).find((entry) => entry.id === key)) || null;
    },

    // Reads the saved plates, keeping only real grants and never more than the count says, and which one of
    // each type is in the hand.
    plateRestore(saved, hand) {
        this.plateEntries = {};
        this.plateHand = {};
        if (!saved || typeof saved !== 'object') return;
        const seen = new Set();
        for (const [type, list] of Object.entries(saved)) {
            if (!Array.isArray(list)) continue;
            const entries = list.map(plateEntryOf).filter((entry) => entry && entry.type === type && !seen.has(entry.id) && seen.add(entry.id));
            if (entries.length > 0) this.plateEntries[type] = entries;
        }
        if (hand && typeof hand === 'object') {
            for (const [type, id] of Object.entries(hand)) {
                if (plateIdentified(type) && (id === null || PLATE_ID_PATTERN.test(id))) this.plateHand[type] = id;
            }
        }
        this.plateReconcile();
    },

    // Never more plates than the count: anything that spent a plate without saying which drops the last ones.
    // A hand that names a plate no longer carried names none (the first is in the hand).
    plateReconcile() {
        if (!this.plateEntries) this.plateEntries = {};
        if (!this.plateHand) this.plateHand = {};
        for (const [type, list] of Object.entries(this.plateEntries)) {
            const count = this.getInventoryCount(type);
            if (list.length > count) list.length = Math.max(0, count);
            if (list.length === 0) delete this.plateEntries[type];
        }
        for (const [type, id] of Object.entries(this.plateHand)) {
            const kept = id === null ? this.plateLegacyCount(type) > 0 : this.platesOf(type).some((entry) => entry.id === id);
            if (!kept) delete this.plateHand[type];
        }
    },

    // A plate the server handed over goes into the inventory. `front`: into the hand.
    plateAdd(grant, options = {}) {
        const entry = plateEntryOf(grant);
        if (!entry || !this.world || !this.world.blockTypes[entry.type]) return false;
        const known = this.platesOf(entry.type).findIndex((other) => other.id === entry.id);
        if (known >= 0) {
            // The same plate twice can only be a newer grant of it: it replaces the old one, and the count stays.
            this.platesOf(entry.type)[known] = entry;
            if (options.front) this.plateSelect(entry.type, entry.id);
            this.saveInventoryState();
            return true;
        }
        this.ensureInventorySlot(entry.type);
        if (!this.plateEntries) this.plateEntries = {};
        const list = this.plateEntries[entry.type] || (this.plateEntries[entry.type] = []);
        // A new plate takes the next slot; the others stay where they are.
        list.push(entry);
        // The plate and its count change together, before anything saves.
        this.inventoryCounts[entry.type] = this.getInventoryCount(entry.type) + 1;
        if (options.front) {
            if (!this.plateHand) this.plateHand = {};
            this.plateHand[entry.type] = entry.id;
        }
        this.updateHotbarCounts();
        this.refreshHeldItemMesh();
        this.renderCraftingPanel();
        this.renderInventoryPanel();
        this.saveInventoryState();
        return true;
    },

    // What an answer of the server hands over: its plates, each as itself, and how many of each type that
    // was. `items` (type -> count to add) loses those, so the rest goes in as plain items.
    plateSettle(outcome, items, options = {}) {
        for (const grant of (outcome && Array.isArray(outcome.plates)) ? outcome.plates : []) {
            if (this.plateAdd(grant, options) && items && items[grant.type] > 0) items[grant.type] -= 1;
        }
        return items;
    },

    // Takes one plate of a type out of the inventory: the one named, or the one in the hand (a plain one if
    // that is what the hand holds). Returns its entry (null for a plain one), or undefined if there is none to
    // take. If it was the one in the hand, the hand takes the one now in its place (the next, or the last).
    plateTakeOut(type, id = null) {
        if (this.getInventoryCount(type) <= 0) return undefined;
        const list = this.platesOf(type);
        const hand = this.plateHandKey(type);
        const handAt = hand === null ? list.length : list.findIndex((other) => other.id === hand);
        const wanted = id || hand;
        let entry = null;
        if (wanted) {
            const index = list.findIndex((other) => other.id === wanted);
            if (index < 0) return undefined;
            entry = list.splice(index, 1)[0];
        } else if (this.plateLegacyCount(type) <= 0) {
            return undefined;
        }
        if (list.length === 0 && this.plateEntries) delete this.plateEntries[type];
        this.inventoryCounts[type] = this.getInventoryCount(type) - 1;
        if (!this.plateHand) this.plateHand = {};
        if (entry ? entry.id !== hand : hand !== null) {
            // Another one went: the hand keeps what it held.
            if (hand !== undefined) this.plateHand[type] = hand;
        } else {
            const left = this.plateInventoryItems(type);
            const next = left[Math.min(Math.max(0, handAt), left.length - 1)];
            if (next) this.plateHand[type] = next.entry ? next.entry.id : null;
            else delete this.plateHand[type];
        }
        return entry;
    },

    // Puts a plate in the hand (null: a plain one). Where it shows does not change.
    plateSelect(type, id) {
        if (!this.plateHand) this.plateHand = {};
        if (id === null ? this.plateLegacyCount(type) > 0 : this.platesOf(type).some((other) => other.id === id)) this.plateHand[type] = id;
        this.saveInventoryState();
    },

    // A plate's own icon, its colonies drawn from its record; the type's icon if it cannot be drawn.
    plateIconUrl(entry, type = entry && entry.type) {
        if (!entry || !entry.culture || typeof cultureDrawPlate !== 'function' || typeof document === 'undefined') return this.world.getInventoryIconUrl(type);
        if (!this.plateIcons) this.plateIcons = new Map();
        const key = `${entry.id}:${entry.culture.seed || 0}`;
        if (this.plateIcons.has(key)) return this.plateIcons.get(key);
        let url = null;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = PLATE_ICON_SIZE;
            canvas.height = PLATE_ICON_SIZE;
            const ctx = canvas.getContext && canvas.getContext('2d');
            if (ctx && typeof canvas.toDataURL === 'function') {
                cultureDrawPlate(ctx, PLATE_ICON_SIZE, entry.type, entry.culture, entry.culture.seed || 0);
                url = canvas.toDataURL();
            }
        } catch (_error) {
            url = null;
        }
        url = url || this.world.getInventoryIconUrl(type);
        this.plateIcons.set(key, url);
        return url;
    },

    // The words of a plate's tooltip: its name and what is on it.
    plateTitle(type, culture) {
        const name = typeof cultureItemName === 'function' ? cultureItemName(type, this.getBlockDisplayName(type)) : this.getBlockDisplayName(type);
        const say = typeof cultureSay === 'function' ? cultureSay : (key) => key;
        const speciesName = this.cultureSpeciesName ? (id) => this.cultureSpeciesName(id) : (id) => id;
        return [name, ...plateSummaryLines(culture, speciesName).map(({ key, args }) => say(key, ...args))].join('\n');
    },

    // The items of a type as the inventory panel and the hotbar show them: one per plate (with a record or
    // plain), or one stack. `held`: the one in the hand when this type is selected (of plain ones, the first).
    plateInventoryItems(type) {
        if (!plateIdentified(type)) return [{ type, entry: null, count: this.getInventoryCount(type), held: true }];
        const hand = this.plateHandKey(type);
        const items = this.platesOf(type).map((entry) => ({ type, entry, count: 1, held: entry.id === hand }));
        for (let i = 0; i < this.plateLegacyCount(type); i++) items.push({ type, entry: null, count: 1, held: hand === null && i === 0 });
        return items;
    }
});
