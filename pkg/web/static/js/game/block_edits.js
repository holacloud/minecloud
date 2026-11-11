// Changing a block for everyone. The only way a block changed by this player, or by something acting for
// them (a robot, a beaver, a golem, a tool, a machine), reaches the world and the server: nothing else
// sends blockPlace or blockBreak (test/js/block_edits.test.js). A new mob or tool that changes blocks calls
// placeBlockForAll and removeBlockForAll, and is stopped in someone else's plot with nothing more to do:
// the guards (registerBlockEditGuard, js/extensions.js; the plots of js/game/claims.js) are asked here.
// It is only a courtesy, to spare a change the server would undo: the server decides.
// Mixed into Game.prototype; `this` is the Game instance. Needs nothing but js/extensions.js.

Object.assign(Game.prototype, {
    // Why column (x, z) is not this player's to change, as a line to tell them, or null (registerBlockEditGuard).
    blockEditRefusal(x, z) {
        for (const guard of BLOCK_EDIT_GUARDS) {
            const why = guard.call(this, x, z);
            if (why) return why;
        }
        return null;
    },

    // Puts a block ({ x, y, z, blockType, ...metadata }) here and tells the server. Returns whether this copy
    // of the world changed: false when a guard refuses, and when the cell already held it or its chunk is
    // not loaded. `always`: the server is told even so (a sound block retuned keeps its type; /build works
    // beyond the loaded chunks).
    placeBlockForAll(payload, options = {}) {
        if (this.blockEditRefusal(payload.x, payload.z)) return false;
        const placed = this.world.addBlock(payload);
        if (placed || options.always) this.sendBlockPlace(payload);
        return placed;
    },

    // The same for taking a block away.
    removeBlockForAll(x, y, z, options = {}) {
        if (this.blockEditRefusal(x, z)) return false;
        const removed = this.world.removeBlockAt(x, y, z);
        if (removed || options.always) this.sendBlockBreak(x, y, z);
        return removed;
    },

    // Only the messages, for the few places that have already changed the world here by their own rules (the
    // player's own placing and mining, below). `fromHand`: placed with the item in the hand, which builder
    // mode marks.
    sendBlockPlace(payload, options = {}) {
        if (!this.network || !this.network.connected) return;
        this.network.send('blockPlace', options.fromHand ? this.blockPlaceOutgoing(payload) : payload);
    },

    sendBlockBreak(x, y, z) {
        if (!this.network || !this.network.connected) return;
        this.network.send('blockBreak', { x, y, z });
    }
});
