// Bucket and water, plus the stone smelting recipe.
// - Bucket (3 iron_ore): right click water within reach to scoop up that water block (it is
//   removed like a broken block, for every player) and get a water_bucket.
// - Water bucket: right click a block face to pour a water block there (placed like any block)
//   and get the empty bucket back. Water stays static: it never flows.
// - Smelt Stone: 1 cobblestone + 1 coal_ore -> 2 stone (mining stone still gives cobblestone).
// Mixed into Game.prototype; hooked through js/extensions.js (registerItemType,
// registerGameContent, registerItemUseHandler). Reuses the pixel sprites of resources.js.

const BUCKET_SPRITE = [
    '............',
    '..IIIIIIII..',
    '.I........I.',
    '.IiiiiiiiiI.',
    '.IGGGGGGGGI.',
    '.IGiiiiiiGI.',
    '..IGGGGGGI..',
    '..IGiiiiGI..',
    '..IGGGGGGI..',
    '...IGGGGI...',
    '...IIIIII...',
    '............'
];
const BUCKET_WATER_SPRITE = [
    '............',
    '..IIIIIIII..',
    '.I........I.',
    '.IWwWWwWWWI.',
    '.IGGGGGGGGI.',
    '.IGiiiiiiGI.',
    '..IGGGGGGI..',
    '..IGiiiiGI..',
    '..IGGGGGGI..',
    '...IGGGGI...',
    '...IIIIII...',
    '............'
];
const BUCKET_PALETTE = { I: 0x5a5f66, G: 0xa9afb7, i: 0xcfd4da };

registerItemType('bucket', {
    color: 0xa9afb7,
    name: 'Bucket',
    drawIcon: resourcesDrawSprite(BUCKET_SPRITE, { ...BUCKET_PALETTE, i: 0x7d838b }),
    displayMesh: resourcesDisplayMesh
});
registerItemType('water_bucket', {
    color: 0x3d85c6,
    name: 'Water Bucket',
    drawIcon: resourcesDrawSprite(BUCKET_WATER_SPRITE, { ...BUCKET_PALETTE, W: 0x3d85c6, w: 0x8fc4ee }),
    displayMesh: resourcesDisplayMesh
});

registerGameContent(function ({ addItem, addRecipe }) {
    addRecipe('bucket', 'Craft Bucket', 'bucket', 1, [{ type: 'iron_ore', amount: 3 }]);
    addRecipe('stone', 'Smelt Stone', 'stone', 2, [{ type: 'cobblestone', amount: 1 }, { type: 'coal_ore', amount: 1 }]);
    addItem('water_bucket');
});

registerItemUseHandler(function (item, hit) {
    if (item === 'bucket') return this.bucketScoop();
    if (item === 'water_bucket') return this.bucketPour(hit);
    return false;
});

Object.assign(Game.prototype, {
    // The first water block along the view ray within reach, before anything solid.
    bucketFindWater() {
        const ray = this.getInteractionRay();
        const point = new THREE.Vector3();
        const maxT = this.placeDistance + ray.origin.distanceTo(ray.reachOrigin);
        for (let t = 0.3; t <= maxT; t += 0.05) {
            point.copy(ray.direction).multiplyScalar(t).add(ray.origin);
            if (point.distanceTo(ray.reachOrigin) > this.placeDistance + 0.05) continue;
            const x = Math.floor(point.x);
            const y = Math.floor(point.y);
            const z = Math.floor(point.z);
            if (this.world.getBlockTypeAt(x, y, z) === 'water') return { x, y, z };
            if (this.world.hasSolidBlock(x, y, z)) return null;
        }
        return null;
    },

    // Swaps one of the held item for another (bucket <-> water_bucket).
    bucketSwap(from, to) {
        if (this.getInventoryCount(from) <= 0) return false;
        this.inventoryCounts[from] -= 1;
        this.addInventory(to);
        return true;
    },

    bucketAfterUse(x, y, z) {
        this.spawnSplash(x + 0.5, y + 1, z + 0.5, 0.35);
        this.world.addRipple(x + 0.5, z + 0.5, 0.5);
        this.playNoiseBurst({ duration: 0.2, volume: 0.022, highpass: 400, lowpass: 2600 });
        this.placeActionTimer = 0.35;
        this.showHitIndicator();
        this.lastSelectionUpdate = 0;
    },

    bucketScoop() {
        const water = this.bucketFindWater();
        if (!water) {
            this.receiveSystemMessage({ text: 'Aim at water to fill the bucket' });
            return true;
        }
        // Same path as breaking a block: local edit, then the server tells everyone.
        if (!this.world.removeBlockAt(water.x, water.y, water.z)) return true;
        if (this.network.connected) this.network.send('blockBreak', { x: water.x, y: water.y, z: water.z });
        this.bucketSwap('bucket', 'water_bucket');
        this.bucketAfterUse(water.x, water.y, water.z);
        return true;
    },

    bucketPour(hit) {
        if (!hit || !hit.face) return true;
        const block = this.world.getBlockPositionFromIntersection(hit);
        if (!block) return true;
        const normal = hit.face.normal;
        const x = Math.round(block.x + normal.x);
        const y = Math.round(block.y + normal.y);
        const z = Math.round(block.z + normal.z);
        if (y < 0 || this.world.getBlockTypeAt(x, y, z)) return true;
        // Same path as placing a block. Water is not solid, so it may go where you stand.
        const payload = { x, y, z, blockType: 'water' };
        if (!this.world.addBlock(payload)) return true;
        if (this.network.connected) this.network.send('blockPlace', payload);
        this.bucketSwap('water_bucket', 'bucket');
        this.bucketAfterUse(x, y - 1, z);
        return true;
    }
});
