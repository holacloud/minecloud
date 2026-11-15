// Creative mode, for testing; deliberately left out of /help and the guide. "/creative <key>"
// toggles it: every item is stocked, nothing runs out, the player takes no damage and blocks
// break almost at once. "/give <item> [amount]" adds any item while it is on, and "/tp <x> <z>"
// or "/tp <x> <y> <z>" takes the player to those numbers. The key is only
// known to the server (-creativekey), which checks it (creativeAuth message); a wrong or
// missing key, or /give or /tp outside creative mode, answers exactly like a command that does not
// exist. The accepted key is remembered in this browser and checked again on every connection.
// Mixed into Game.prototype; the chat commands are wired in social.js.

const CREATIVE_STOCK = 999;
// A client may not ask for a chunk this far from the centre or further (worldReach, pkg/network/chunks.go):
// whoever goes there hangs over nothing. And no number of "/tp" is taken beyond the other.
const CREATIVE_TP_REACH = 1 << 21;
const CREATIVE_TP_MAX = 10000000;

// Where "/tp" goes: { x, y, z } for "<x> <z>" (y null: onto whatever the ground is there) or "<x> <y> <z>",
// or null when the words are not that. The numbers are those of the corner of the screen (X, Y, Z: Y is the
// height of the eyes), so typing them back returns to the same spot. A whole x or z names a block and means
// its middle; a comma after a number, as somebody copies a pair, is let through.
function creativeTpTarget(args) {
    if (!Array.isArray(args) || (args.length !== 2 && args.length !== 3)) return null;
    const words = args.map((arg) => String(arg).replace(/,$/, ''));
    if (!words.every((word) => /^-?\d+(\.\d+)?$/.test(word) && Math.abs(Number(word)) <= CREATIVE_TP_MAX)) return null;
    const across = (word) => Number(word) + (word.includes('.') ? 0 : 0.5);
    return { x: across(words[0]), y: words.length === 3 ? Number(words[1]) : null, z: across(words[words.length - 1]) };
}

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


    creativeRecheck() {
        if (this.creativeKey && this.network && this.network.connected) {
            this.network.send('creativeAuth', { key: this.creativeKey, command: 'creative', silent: true });
        }
    },

    creativeCommand(command, key) {
        const normalized = (key || '').trim().toLowerCase();
        // Turning it off needs no key check; anything else goes to the server.
        if (this.creativeMode && normalized === this.creativeKey) {
            this.creativeMode = false;
            this.creativeSaveKey('');
            // The server forgets it too: it lets only a creative session stock a build's chests.
            if (this.network && this.network.connected) this.network.send('creativeOff', {});
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
            // Stock up again: items added by an update since creative mode was turned on.
            else this.creativeStock();
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
            // Block states (a door's upper half, stairs facing east...) are not items.
            if (type === 'air' || /^wheat_\d$/.test(type) || this.world.blockTypes[type].variantOf) return;
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
    },

    // "/tp": off whatever the player rides or sits on and to the place (creativeTpTarget), looking the same
    // way. The camera's own settling does the rest (camera.js): it hangs there until the chunk comes, comes
    // out of a block, and goes down gently onto what is below. With no height it starts over the world's top.
    creativeTeleport(command, args) {
        if (!this.creativeMode) {
            this.receiveSystemMessage({ text: `Unknown command: /${command}` });
            return;
        }
        const target = creativeTpTarget(args);
        if (!target) {
            this.receiveSystemMessage({ text: `Usage: /${command} <x> <z>, or /${command} <x> <y> <z> (the X, Y and Z in the corner of the screen)` });
            return;
        }
        if (typeof this.stopMining === 'function') this.stopMining();
        if (this.ridingMob && typeof this.dismount === 'function') this.dismount();
        if (this.seated && typeof this.seatStandUp === 'function') this.seatStandUp();
        const controller = this.cameraController;
        const eye = controller.eyeHeight || 1.62;
        const top = WORLD_MAX_Y + 1 + eye;
        const y = target.y === null ? top : Math.min(Math.max(target.y, WORLD_MIN_Y + 1 + eye), top);
        controller.setPosition({ x: target.x, y, z: target.z });
        const beyond = Math.max(Math.abs(target.x), Math.abs(target.z)) >= CREATIVE_TP_REACH
            ? `. The server gives no chunks ${CREATIVE_TP_REACH.toLocaleString('en-US')} blocks or more from the centre: nothing will appear here`
            : '';
        this.receiveSystemMessage({ text: `Teleported to X: ${target.x} Z: ${target.z}${beyond}` });
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


registerNetworkHandler('creativeAuth', function (reply) { this.creativeOnAuth(reply || {}); });
// A remembered key is checked on every connection, the first one too.
registerNetworkHandler('connected', function () { this.creativeRecheck(); });
