// Creative mode, for testing; deliberately left out of /help and the guide. "/creative <key>"
// toggles it: every item is stocked, nothing runs out, the player takes no damage and blocks
// break almost at once. "/give <item> [amount]" adds any item while it is on. The key is only
// known to the server (-creativekey), which checks it (creativeAuth message); a wrong or
// missing key, or /give outside creative mode, answers exactly like a command that does not
// exist. The accepted key is remembered in this browser and checked again on every connection.
// Mixed into Game.prototype; the chat commands are wired in social.js.

const CREATIVE_STOCK = 999;

Object.assign(Game.prototype, {
    creativeLoad() {
        this.creativeMode = false;
        try {
            this.creativeKey = window.localStorage.getItem('minecloud-creative') || '';
        } catch (_error) {
            this.creativeKey = '';
        }
    },

    creativeSaveKey(key) {
        this.creativeKey = key;
        try {
            window.localStorage.setItem('minecloud-creative', key);
        } catch (_error) {
            // Storage blocked: it lasts until the page reloads.
        }
    },

    // Answers from the server are wired the first time they are needed.
    creativeListen() {
        if (this.creativeListening || !this.network) return;
        this.creativeListening = true;
        this.network.on('creativeAuth', (reply) => this.creativeOnAuth(reply || {}));
        // A remembered key is checked again on every (re)connection.
        this.network.on('connected', () => this.creativeRecheck());
    },

    creativeRecheck() {
        if (this.creativeKey && this.network && this.network.connected) {
            this.network.send('creativeAuth', { key: this.creativeKey, command: 'creative', silent: true });
        }
    },

    creativeCommand(command, key) {
        this.creativeListen();
        const normalized = (key || '').trim().toLowerCase();
        // Turning it off needs no key check; anything else goes to the server.
        if (this.creativeMode && normalized === this.creativeKey) {
            this.creativeMode = false;
            this.creativeSaveKey('');
            this.receiveSystemMessage({ text: 'Creative mode off' });
            return;
        }
        if (!normalized || !this.network || !this.network.connected) {
            this.receiveSystemMessage({ text: `Unknown command: /${command}` });
            return;
        }
        this.creativePendingKey = normalized;
        this.network.send('creativeAuth', { key: normalized, command, silent: false });
    },

    creativeOnAuth(reply) {
        if (reply.silent) {
            // The remembered key: on, quietly, or forgotten if the server no longer takes it.
            this.creativeMode = Boolean(reply.ok);
            if (!reply.ok) this.creativeSaveKey('');
            return;
        }
        const key = this.creativePendingKey;
        this.creativePendingKey = null;
        if (!reply.ok || !key) {
            this.receiveSystemMessage({ text: `Unknown command: /${reply.command || 'creative'}` });
            return;
        }
        this.creativeMode = true;
        this.creativeSaveKey(key);
        this.creativeStock();
        this.receiveSystemMessage({ text: 'Creative mode on' });
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

    creativeGive(command, args) {
        if (!this.creativeMode) {
            this.receiveSystemMessage({ text: `Unknown command: /${command}` });
            return;
        }
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

// The network exists once the game has started: listen, and check a remembered key.
registerFrameUpdate(function () {
    if (this.creativeListening || !this.network) return;
    this.creativeListen();
    this.creativeRecheck();
});
