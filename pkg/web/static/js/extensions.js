// Extension points, so that a species, an item or a mechanic can live in its own file
// instead of growing the shared ones. Loaded first; handlers run with `this` set to the Game.

// Behaviour of a movement mode (all optional):
//   update(mob, delta, player)           every frame, instead of the default ground logic
//   interact(mob)                        the player strikes it (left click)
//   spawnCommand(species, x, z, player)  /mob: spawn it near (x, z); return true if handled
//   spawnEgg(species, position)          egg used on block `position`; return true if handled
//                                        (it must consume the egg itself)
//   spawnForChunk(chunkX, chunkZ, biome) natural spawning, once per chunk
const MOB_BEHAVIOURS = {};
function registerMobBehaviour(movement, behaviour) {
    MOB_BEHAVIOURS[movement] = behaviour;
}

// Right click on a mob with the held item (null when empty-handed): handler(mob, itemType)
// returns true when it did something, which stops the click there.
const MOB_USE_HANDLERS = [];
function registerMobUseHandler(handler) {
    MOB_USE_HANDLERS.push(handler);
}

// Where a ground mob wants to walk instead of wandering: provider(mob, delta) returns a
// THREE.Vector3 (or null for no opinion). The first one that answers wins.
const MOB_GOAL_PROVIDERS = [];
function registerMobGoal(provider) {
    MOB_GOAL_PROVIDERS.push(provider);
}

// Events: 'spawned' (mob), 'hit' (mob), 'defeated' (mob, cause), 'removed' (mob).
const MOB_EVENT_LISTENERS = {};
function onMobEvent(event, listener) {
    (MOB_EVENT_LISTENERS[event] = MOB_EVENT_LISTENERS[event] || []).push(listener);
}

// Extra item types (non-placeable): registerItemType('feather', { color: 0xf2efe6, name: 'Feather' }).
// They join world.blockTypes as itemOnly entries; extra fields are kept. Optional hooks:
//   drawIcon(ctx, size)           draws its hotbar/inventory icon (blockTextures.drawItemIcon)
//   displayMesh(world, type, s)   returns its dropped/held mesh (world.createDisplayMesh)
//   consume(type)                 eating it (G) runs this (with `this` the Game) instead of
//                                 the default food handling; returns whether it was used
const ITEM_TYPES = {};
function registerItemType(id, definition) {
    ITEM_TYPES[id] = definition;
}

// Inventory slots and crafting recipes: hook({ addItem(type), addRecipe(id, name, outputType,
// outputAmount, inputs) }) runs once when the game starts; inputs are [{ type, amount }].
const GAME_CONTENT_HOOKS = [];
function registerGameContent(hook) {
    GAME_CONTENT_HOOKS.push(hook);
}

// Right click that no mob took: handler(itemType, hit) gets the held item (or null) and the
// targeted block hit (or null); returns true when it handled the click (tools, entities...).
const ITEM_USE_HANDLERS = [];
function registerItemUseHandler(handler) {
    ITEM_USE_HANDLERS.push(handler);
}

// Damage the player takes: modifier(amount, type, reason) returns the new amount (armour,
// immunities...). Types are listed at Game.applyDamage.
const DAMAGE_MODIFIERS = [];
function registerDamageModifier(modifier) {
    DAMAGE_MODIFIERS.push(modifier);
}

// Panels from other files (bestiary...): registerModalPanel({ isOpen(), close() }). While one is
// open the game is not in play, the pointer stays free, and Escape closes it.
const MODAL_PANELS = [];
function registerModalPanel(panel) {
    MODAL_PANELS.push(panel);
}

// Once per frame, after the mobs moved: updater(delta) (client-side entities of a mechanic).
const FRAME_UPDATERS = [];
function registerFrameUpdate(updater) {
    FRAME_UPDATERS.push(updater);
}

// World blocks (placeable, stored in the chunks by name, so the server needs no list):
// registerBlockType('farmland', { color, name, breakDuration, ... }). They join
// world.blockTypes before the block registry is built. Extra fields read by world.js:
//   faces { top, side, bottom }   texture pattern names (bottom defaults to side)
//   cross                         drawn as crossed planes like tall grass (alpha cutout, sways)
//   crossPlanes                   those planes: [{ width, height, rotationY, yOffset, zOffset }]
//   dropType                      what breaking it drops (null: nothing) instead of itself
//   glow                          emissive strength: the block lights up its own texture
//   lightEmission                 gives light to the world around it: true (as a torch, 14) or
//                                 a level from 1 to 14
//   filterGlass                   stained glass: drawn as a colour filter on what is behind it
//                                 (see WorldRenderer.createFaceMaterial)
//   mirrorSurface                 'cube' or 'wall' (needs `facing`): reflects, js/game/mirrors.js
//   materialKey                   shows the materials of another block with the same looks
//   shareFaces                    its states share materials face by face (js/game/furniture.js)
//   faces entries                 may also be { pattern, tint } to tint a shared pattern, with
//                                 glow (of that face alone) and minSize (of its texture in pixels)
//   faces.front                   the side it faces (state `facing`), when it has a front
//   textureOf                     another block type whose textures it reuses (slabs, stairs)
//   shape                         a non-cube shape from registerBlockShape ('stairs', 'door',
//                                 'trapdoor', 'fence', 'fence_gate', 'pane'; see js/blockShapes.js)
//   lightPasses                   lets sky and torch light through without a see-through material
//   cutout                        alpha-cutout material (holes in the texture, like iron bars)
//   drawBlockIcon(ctx, size, world)  draws its inventory icon instead of the cube/shape view
const BLOCK_TYPES = {};
function registerBlockType(id, definition) {
    BLOCK_TYPES[id] = definition;
}

// Procedural block textures: registerTexturePattern(name, paint, { sprite }), where
// paint(factory, surface, tint, seed) fills the surface like the patterns of blockTextures.js.
// sprite: true for cutout sprites (clamped instead of tiled); rtx: { roughness, metalness,
// normalScale } for its PBR look in RTX and Ultra.
const TEXTURE_PATTERNS = {};
function registerTexturePattern(name, paint, options = {}) {
    TEXTURE_PATTERNS[name] = { ...options, paint };
}

// A block broken by the local player: handler(blockType, position) runs after its normal drop
// (extra drops, blocks that depend on it...). position holds the block's integer coordinates.
const BLOCK_BREAK_HANDLERS = [];
function registerBlockBreakHandler(handler) {
    BLOCK_BREAK_HANDLERS.push(handler);
}

// Non-cube block shapes (stairs, doors, fences...): registerBlockShape(name, shape). Boxes are
// [x0, y0, z0, x1, y1, z1] in block units from the cell's minimum corner. The shape's states
// (orientation, open/closed...) become part of the block name, so they are stored and synced
// like any block. Fields (all optional except boxes); js/blockShapes.js documents them in full:
//   states            [[key, [values...]], ...]: one block type per combination, first = default
//   boxes(state, mask)       visual boxes; mask = neighbours it connects to (N 1, E 2, S 4, W 8)
//   collision(state, mask)   collision boxes (default: boxes); may rise to 1.5 (fences)
//   connects(def, other, dir) whether it joins neighbour `other` ({ def, cube }) towards dir
//   variant(state, def)      extra block-type fields for one state (solid, faces...)
//   materialKey(state)       states that look different (door halves) get their own materials
//   place(ctx)               [{ dx, dy, dz, state }] to place, or null when it does not fit
//   linked(state)            [[dx, dy, dz]] cells that form one object with it (door halves)
//   toggle(state, ctx)       the state after a right click (doors, gates), or null
//   iconState, iconMask      state and connections shown in the inventory icon
//   iconBoxes                boxes to draw in the icon instead (furniture two cells long)
//   iconFit                  small things: the icon fills the slot instead of matching a cube's scale
const BLOCK_SHAPES = {};
function registerBlockShape(name, shape) {
    BLOCK_SHAPES[name] = shape;
}
