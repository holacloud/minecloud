// Creative mode, for testing; deliberately left out of /help and the guide. "/creative" toggles
// it (remembered in this browser): every item is stocked, nothing runs out, the player takes no
// damage and blocks break almost at once. "/give <item> [amount]" adds any item.
// Mixed into Game.prototype; the chat commands are wired in social.js.

const CREATIVE_STOCK = 999;

Object.assign(Game.prototype, {
    creativeLoad() {
        try {
            this.creativeMode = window.localStorage.getItem('minecloud-creative') === '1';
        } catch (_error) {
            this.creativeMode = false;
        }
    },

    creativeToggle() {
        this.creativeMode = !this.creativeMode;
        try {
            window.localStorage.setItem('minecloud-creative', this.creativeMode ? '1' : '0');
        } catch (_error) {
            // Storage blocked: it lasts until the page reloads.
        }
        if (this.creativeMode) this.creativeStock();
        this.receiveSystemMessage({ text: `Creative mode ${this.creativeMode ? 'on' : 'off'}` });
    },

    // Every block and item that can be held, CREATIVE_STOCK of each.
    creativeStock() {
        if (!this.world) return;
        Object.keys(this.world.blockTypes).forEach((type) => {
            if (type === 'air' || /^wheat_\d$/.test(type)) return;
            this.ensureInventorySlot(type);
            this.inventoryCounts[type] = Math.max(this.getInventoryCount(type), CREATIVE_STOCK);
        });
        this.updateHotbarCounts();
        this.refreshHeldItemMesh();
        this.renderCraftingPanel();
        this.renderInventoryPanel();
        this.saveInventoryState();
    },

    creativeGive(args) {
        const type = (args[0] || '').toLowerCase();
        const amount = Math.max(1, Math.min(9999, parseInt(args[1], 10) || 64));
        if (!this.world || !this.world.blockTypes[type] || type === 'air') {
            this.receiveSystemMessage({ text: `Unknown item: ${type || '(none)'}` });
            return;
        }
        this.addInventory(type, amount);
        this.receiveSystemMessage({ text: `Gave ${amount} ${this.getBlockDisplayName(type)}` });
    }
});

// Nothing runs out and blocks break almost at once.
(() => {
    const consumeSelectedBlock = Game.prototype.consumeSelectedBlock;
    Game.prototype.consumeSelectedBlock = function () {
        if (this.creativeMode && this.getInventoryCount(this.getSelectedBlockType()) > 0) return true;
        return consumeSelectedBlock.call(this);
    };
    const getAdjustedBreakDuration = Game.prototype.getAdjustedBreakDuration;
    Game.prototype.getAdjustedBreakDuration = function (blockType, baseDuration) {
        const duration = getAdjustedBreakDuration.call(this, blockType, baseDuration);
        return this.creativeMode && duration ? Math.min(duration, 0.08) : duration;
    };
})();

registerDamageModifier(function (amount, type) {
    return this.creativeMode && type !== 'void' ? 0 : amount;
});

registerGameContent(function () {
    this.creativeLoad();
});
