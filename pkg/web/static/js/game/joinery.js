// Joinery: stairs, doors, trapdoors, fences, fence gates, glass panes and iron bars.
// - The shapes and their states are engine features (js/blockShapes.js); this file only
//   declares the blocks, their textures and recipes, and the right click that opens them.
// - Doors, trapdoors and gates toggle with a right click (crouch to place a block against
//   them instead). The new state is an ordinary blockPlace, so every player sees it and the
//   server saves it with the chunk. Iron ones open by hand too, for now.
// - A door is two linked blocks: breaking either half removes the other (one door drops).
// Mixed into Game.prototype; hooked through js/extensions.js.

const JOINERY_WOODS = [
    // [prefix, label, planks, log, colour]
    ['oak', 'Oak', 'planks', 'wood', 0xC8A675],
    ['spruce', 'Spruce', 'spruce_planks', 'spruce_wood', 0x7D5D46],
    ['birch', 'Birch', 'birch_planks', 'birch_wood', 0xFAE6B1],
    ['jungle', 'Jungle', 'jungle_planks', 'jungle_wood', 0xC9895C],
    ['acacia', 'Acacia', 'acacia_planks', 'acacia_wood', 0xDA8155],
    ['dark_oak', 'Dark Oak', 'dark_oak_planks', 'dark_oak_wood', 0x614A3A],
    ['cherry', 'Cherry', 'cherry_planks', 'cherry_wood', 0xFFC2D8],
    ['maple', 'Maple', 'maple_planks', 'maple_wood', 0xE69C4E],
    ['willow', 'Willow', 'willow_planks', 'willow_wood', 0xB1CA7C]
];
const JOINERY_STONES = [
    // [prefix, label, source block, colour, break time]
    ['stone', 'Stone', 'stone', 0x808080, 0.8],
    ['cobblestone', 'Cobblestone', 'cobblestone', 0x6E6E6E, 0.9],
    ['brick', 'Brick', 'brick', 0xA03020, 0.8],
    ['stone_brick', 'Stone Brick', 'stone_bricks', 0x8D8D8D, 0.95]
];

// ---------------------------------------------------------------------------------------
// Textures

// A plank door half: vertical boards in a frame; the upper half has a four-pane window, the
// lower half a cross rail and the handle.
function joineryPaintWoodDoor(f, s, tint, seed, upper) {
    const base = f.rgb(tint ?? 0xb48a56);
    const glass = f.rgb(0xa9d6e8);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        const board = Math.floor(u * 4);
        const boardU = u * 4 - board;
        const grain = Math.sin((v * 5 + f.stretchedNoise(u, v, 8, 2, seed + board) * 1.4) * Math.PI * 2) * 0.5 + 0.5;
        let k = (f.hash(board, 3, seed) - 0.5) * 0.14 + (grain - 0.5) * 0.12 + (f.hash(x, y, seed) - 0.5) * 0.05;
        let h = 0.65 + grain * 0.1;
        if (boardU < px * 4 * 1.01) { k = -0.3; h = 0.15; }
        const frame = Math.min(u, 1 - u, upper ? v : 1, upper ? 1 : 1 - v);
        if (frame < 2.5 * px) { k = -0.12 + (f.hash(x, y, seed + 7) - 0.5) * 0.06; h = 0.85; }
        if (upper && u > 0.2 && u < 0.8 && v > 0.18 && v < 0.66) {
            const mullion = Math.abs(u - 0.5) < 0.6 * px || Math.abs(v - 0.42) < 0.6 * px;
            if (mullion) { k = -0.15; h = 0.8; }
            else {
                const shine = (u + v) % 0.4 < 0.05 ? 0.25 : 0;
                f.put(s, x, y, f.shade(glass, shine - 0.05), 0.3);
                return;
            }
        }
        if (!upper && Math.abs(v - 0.5) < 0.07) { k = -0.08; h = 0.9; }
        if (!upper && Math.abs(u - 0.82) < 0.05 && Math.abs(v - 0.14) < 0.06) {
            f.put(s, x, y, f.rgb(0x3a3a3c), 1);
            return;
        }
        f.put(s, x, y, f.tone(s, base, k), h);
    });
}

// An iron door half: brushed plates with a raised border and rivets; a barred window above.
function joineryPaintIronDoor(f, s, tint, seed, upper) {
    const base = f.rgb(tint ?? 0xc8cdd2);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        const brushed = f.stretchedNoise(u, v, 2, 24, seed);
        let k = (brushed - 0.5) * 0.12;
        let h = 0.6;
        const frame = Math.min(u, 1 - u, upper ? v : 1, upper ? 1 : 1 - v);
        if (frame < 2.5 * px) { k = 0.12; h = 0.9; }
        const rivet = Math.min(Math.hypot(u - 0.14, v - 0.14), Math.hypot(u - 0.86, v - 0.14), Math.hypot(u - 0.14, v - 0.86), Math.hypot(u - 0.86, v - 0.86));
        if (rivet < 0.045) { k = 0.25; h = 1; }
        if (upper && u > 0.25 && u < 0.75 && v > 0.22 && v < 0.6) {
            const bar = ((u - 0.25) * 8) % 1 < 0.35;
            k = bar ? 0.05 : -0.55;
            h = bar ? 0.8 : 0.1;
        }
        if (!upper && Math.abs(u - 0.82) < 0.06 && Math.abs(v - 0.14) < 0.08) { k = -0.35; h = 1; }
        f.put(s, x, y, f.tone(s, base, k), h);
    });
}

registerTexturePattern('door_lower', (f, s, tint, seed) => joineryPaintWoodDoor(f, s, tint, seed, false));
registerTexturePattern('door_upper', (f, s, tint, seed) => joineryPaintWoodDoor(f, s, tint, seed, true));
registerTexturePattern('iron_door_lower', (f, s, tint, seed) => joineryPaintIronDoor(f, s, tint, seed, false));
registerTexturePattern('iron_door_upper', (f, s, tint, seed) => joineryPaintIronDoor(f, s, tint, seed, true));

// Trapdoor: planks in a frame with a cross brace.
registerTexturePattern('trapdoor', (f, s, tint, seed) => {
    f.patterns().planks(s, tint, seed);
    const base = f.rgb(tint ?? 0xb48a56);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        const frame = Math.min(u, 1 - u, v, 1 - v) < 2.5 * px;
        const brace = Math.abs(u - v) < 1.2 * px || Math.abs(u + v - 1) < 1.2 * px;
        if (frame || brace) f.put(s, x, y, f.tone(s, base, frame ? -0.18 : -0.08), 0.9);
    });
});

// Iron trapdoor: a riveted grate.
registerTexturePattern('iron_trapdoor', (f, s, tint, seed) => {
    const base = f.rgb(tint ?? 0xc8cdd2);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        const frame = Math.min(u, 1 - u, v, 1 - v) < 2.5 * px;
        const grid = (u * 4) % 1 < 0.3 || (v * 4) % 1 < 0.3;
        const k = frame ? 0.12 : grid ? (f.stretchedNoise(u, v, 2, 24, seed) - 0.5) * 0.1 : -0.5;
        f.put(s, x, y, f.tone(s, base, k), frame ? 0.9 : grid ? 0.7 : 0.1);
    });
});

// Iron bars: vertical rods with two cross ties; the gaps are cut out.
registerTexturePattern('iron_bars', (f, s, tint, seed) => {
    const base = f.rgb(0x8f959c);
    f.each(s, (x, y, u, v) => {
        const rod = (u * 4 + 0.5) % 1;
        const onRod = Math.abs(rod - 0.5) < 0.17;
        const tie = Math.abs(v - 0.12) < 0.04 || Math.abs(v - 0.88) < 0.04;
        if (!onRod && !tie) {
            f.put(s, x, y, base, 0, 0);
            return;
        }
        const k = onRod ? (0.5 - Math.abs(rod - 0.5) * 3) * 0.3 : 0.05;
        f.put(s, x, y, f.tone(s, base, k + (f.hash(x, y, seed) - 0.5) * 0.06), 0.8);
    });
}, { sprite: true });

// ---------------------------------------------------------------------------------------
// Blocks

// Door icons are flat, like a door seen from the front: both halves one above the other.
function joineryDrawDoorIcon(base) {
    return (ctx, size, world) => {
        const half = (name) => world.generateFaceCanvas(world.getFaceTextureSpecs(
            shapeStateName(base, BLOCK_SHAPES.door, { half: name, facing: 'n', hinge: 'left', open: 'closed' })).side);
        ctx.imageSmoothingEnabled = false;
        const width = size * 0.44;
        const x = (size - width) / 2;
        ctx.drawImage(half('upper'), x, size * 0.06, width, size * 0.44);
        ctx.drawImage(half('lower'), x, size * 0.5, width, size * 0.44);
    };
}

JOINERY_WOODS.forEach(([prefix, label, planks, , color]) => {
    registerBlockType(`${prefix}_stairs`, {
        color, name: `${label} Stairs`, shape: 'stairs', textureOf: planks, breakDuration: 0.55, category: 'wood'
    });
    const plankFace = (pattern) => ({ pattern, tintOf: planks });
    registerBlockType(`${prefix}_door`, {
        color, name: `${label} Door`, shape: 'door', lightPasses: true, breakDuration: 0.5, category: 'wood',
        faces: { top: plankFace('planks'), side: plankFace('door_lower') },
        doorFaces: {
            lower: { top: plankFace('planks'), side: plankFace('door_lower') },
            upper: { top: plankFace('planks'), side: plankFace('door_upper') }
        },
        drawBlockIcon: joineryDrawDoorIcon(`${prefix}_door`)
    });
    registerBlockType(`${prefix}_fence`, {
        color, name: `${label} Fence`, shape: 'fence', textureOf: planks, lightPasses: true, breakDuration: 0.5, category: 'wood'
    });
    registerBlockType(`${prefix}_fence_gate`, {
        color, name: `${label} Fence Gate`, shape: 'fence_gate', textureOf: planks, lightPasses: true, breakDuration: 0.5, category: 'wood'
    });
});

JOINERY_STONES.forEach(([prefix, label, source, color, breakDuration]) => {
    registerBlockType(`${prefix}_stairs`, {
        color, name: `${label} Stairs`, shape: 'stairs', textureOf: source, breakDuration, category: 'stone'
    });
});

const JOINERY_METAL = { pattern: 'metal', tint: 0xc8cdd2 };
registerBlockType('iron_door', {
    color: 0xC8CDD2, name: 'Iron Door', shape: 'door', lightPasses: true, breakDuration: 1.2, category: 'stone',
    faces: { top: JOINERY_METAL, side: { pattern: 'iron_door_lower', tint: 0xc8cdd2 } },
    doorFaces: {
        lower: { top: JOINERY_METAL, side: { pattern: 'iron_door_lower', tint: 0xc8cdd2 } },
        upper: { top: JOINERY_METAL, side: { pattern: 'iron_door_upper', tint: 0xc8cdd2 } }
    },
    drawBlockIcon: joineryDrawDoorIcon('iron_door')
});
registerBlockType('oak_trapdoor', {
    color: 0xC8A675, name: 'Oak Trapdoor', shape: 'trapdoor', lightPasses: true, breakDuration: 0.45, category: 'wood',
    faces: { top: { pattern: 'trapdoor', tintOf: 'planks' }, side: { pattern: 'trapdoor', tintOf: 'planks' } }
});
registerBlockType('iron_trapdoor', {
    color: 0xC8CDD2, name: 'Iron Trapdoor', shape: 'trapdoor', lightPasses: true, breakDuration: 1.0, category: 'stone',
    faces: { top: { pattern: 'iron_trapdoor', tint: 0xc8cdd2 }, side: { pattern: 'iron_trapdoor', tint: 0xc8cdd2 } }
});
registerBlockType('glass_pane', {
    color: 0xBFE8F5, name: 'Glass Pane', shape: 'pane', textureOf: 'glass', transparent: true, opacity: 0.42, breakDuration: 0.2
});
registerBlockType('iron_bars', {
    color: 0x8F959C, name: 'Iron Bars', shape: 'pane', faces: { top: 'iron_bars', side: 'iron_bars' }, cutout: true,
    lightPasses: true, breakDuration: 0.8, category: 'stone'
});

// ---------------------------------------------------------------------------------------
// Recipes

registerGameContent(function ({ addRecipe }) {
    JOINERY_WOODS.forEach(([prefix, label, planks, log]) => {
        addRecipe(`${prefix}_stairs`, `Build ${label} Stairs`, `${prefix}_stairs`, 4, [{ type: planks, amount: 3 }]);
        addRecipe(`${prefix}_door`, `Build ${label} Door`, `${prefix}_door`, 3, [{ type: planks, amount: 6 }]);
        addRecipe(`${prefix}_fence`, `Build ${label} Fence`, `${prefix}_fence`, 3, [{ type: planks, amount: 2 }, { type: log, amount: 1 }]);
        addRecipe(`${prefix}_fence_gate`, `Build ${label} Fence Gate`, `${prefix}_fence_gate`, 1, [{ type: planks, amount: 2 }, { type: log, amount: 2 }]);
    });
    JOINERY_STONES.forEach(([prefix, label, source]) => {
        addRecipe(`${prefix}_stairs`, `Cut ${label} Stairs`, `${prefix}_stairs`, 4, [{ type: source, amount: 3 }]);
    });
    addRecipe('oak_trapdoor', 'Build Oak Trapdoor', 'oak_trapdoor', 2, [{ type: 'planks', amount: 3 }]);
    addRecipe('iron_door', 'Forge Iron Door', 'iron_door', 1, [{ type: 'iron_ore', amount: 2 }]);
    addRecipe('iron_trapdoor', 'Forge Iron Trapdoor', 'iron_trapdoor', 1, [{ type: 'iron_ore', amount: 2 }]);
    addRecipe('glass_pane', 'Cut Glass Panes', 'glass_pane', 8, [{ type: 'glass', amount: 3 }]);
    addRecipe('iron_bars', 'Forge Iron Bars', 'iron_bars', 8, [{ type: 'iron_ore', amount: 3 }]);
});

// ---------------------------------------------------------------------------------------
// Opening and closing, linked halves

Object.assign(Game.prototype, {
    // Toggles the door, trapdoor or gate at `position` (and its linked cells) for everyone.
    joineryToggle(position) {
        const type = this.world.getBlockTypeAt(position.x, position.y, position.z);
        const def = type && this.world.blockTypes[type];
        const shape = def && def.shape ? BLOCK_SHAPES[def.shape] : null;
        if (!shape || !shape.toggle || def.opensByHand === false) return false;
        const base = def.variantOf || type;
        const ray = this.getInteractionRay();
        const next = shape.toggle(def.state, { look: { x: ray.direction.x, z: ray.direction.z } });
        const nextType = next && this.world.getShapeStateType(base, next);
        if (!nextType) return false;

        const updates = [{ ...position, blockType: nextType }];
        // Linked cells (the other half of a door) take the same changes.
        const changed = Object.keys(next).filter((key) => next[key] !== def.state[key]);
        for (const [dx, dy, dz] of shape.linked ? shape.linked(def.state) : []) {
            const cell = { x: position.x + dx, y: position.y + dy, z: position.z + dz };
            const otherType = this.world.getBlockTypeAt(cell.x, cell.y, cell.z);
            const other = otherType && this.world.blockTypes[otherType];
            if (!other || (other.variantOf || otherType) !== base) continue;
            const otherNext = { ...other.state };
            changed.forEach((key) => { otherNext[key] = next[key]; });
            const otherNextType = this.world.getShapeStateType(base, otherNext);
            if (otherNextType) updates.push({ ...cell, blockType: otherNextType });
        }

        updates.forEach((update) => {
            this.world.addBlock(update);
            if (this.network.connected) this.network.send('blockPlace', update);
        });
        const iron = def.category === 'stone';
        this.playNoiseBurst({ duration: iron ? 0.1 : 0.16, volume: 0.03, highpass: iron ? 900 : 200, lowpass: iron ? 4200 : 1300 });
        this.playTone({ frequency: iron ? 330 : 120, endFrequency: iron ? 260 : 95, duration: 0.12, type: iron ? 'square' : 'triangle', volume: 0.018 });
        this.placeActionTimer = 0.25;
        this.lastSelectionUpdate = 0;
        return true;
    }
});

// Right click on a door, trapdoor or gate opens or closes it (crouch to build against it).
registerItemUseHandler(function (itemType, hit) {
    if (!hit || this.cameraController.isCrouching) return false;
    const position = this.world.getBlockPositionFromIntersection(hit);
    return Boolean(position) && this.joineryToggle(position);
});

// Breaking half of a door or a bed takes the other half with it (only one drops).
registerBlockBreakHandler(function (blockType, position) {
    const typeAt = (x, y, z) => this.world.getBlockTypeAt(x, y, z);
    for (const { x, y, z } of shapeLinkedCells(blockType, position, typeAt, this.world.blockTypes)) {
        if (this.world.removeBlockAt(x, y, z) && this.network.connected) {
            this.network.send('blockBreak', { x, y, z });
        }
    }
});
