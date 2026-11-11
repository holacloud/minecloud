// Extension points, so that a species, an item or a mechanic can live in its own file
// instead of growing the shared ones. Loaded first; handlers run with `this` set to the Game.

// Behaviour of a movement mode (all optional):
//   update(mob, delta, player)           every frame, instead of the default ground logic
//   interact(mob)                        the player strikes it (left click)
//   spawnCommand(species, x, z, player)  /mob: spawn it near (x, z); return true if handled
//   spawnEgg(species, position)          egg used on block `position`; return true if handled
//                                        (it must consume the egg itself)
//   spawnForChunk(chunkX, chunkZ, biome) natural spawning, once per chunk
//   worksWithoutChunk                    true: update also runs over a chunk that is not loaded,
//                                        where a mob otherwise just waits for it
// And what the rest of the game has to know of the movement, which it asks with mobMovementIs: no other
// file keeps a list of movement names (all false by default):
//   bodiless      not a body on the ground: it neither blocks the others nor is blocked (herd.js)
//   walksToGoal   its update asks getMobGoal, so it walks to a pile of bait (traps.js)
//   nudgedToBait  it does not ask, and traps.js pushes it to the bait instead
//   baitOwnWay    it comes to a bait by code of its own (bees, ants)
//   tameable      its update honours getMobGoal and `userData.resting` (taming.js)
//   inWater       it lives in water: what it drops floats up (resources.js)
//   pointLike     a light or a shoal with no height: the bestiary looks at its position as it is
const MOB_BEHAVIOURS = {};
const MOB_MOVEMENT_TRAITS = {};
function registerMobBehaviour(movement, behaviour) {
    MOB_BEHAVIOURS[movement] = behaviour;
    MOB_MOVEMENT_TRAITS[movement] = behaviour;
}

// The traits of a movement that has no behaviour here: the built-in ones (js/mobSpecies.js).
function registerMobMovementTraits(movement, traits) {
    MOB_MOVEMENT_TRAITS[movement] = traits;
}

// Whether a movement (a species' `movement`; none is 'ground') has one of the traits above.
function mobMovementIs(movement, trait) {
    const traits = MOB_MOVEMENT_TRAITS[movement || 'ground'];
    return Boolean(traits && traits[trait]);
}

// A species, whole, from its own file: what it is, how it looks and its row in the tables of the other
// features, so that adding one edits none of them.
//
//   registerSpecies('crab', {
//       info: { eggColor: 0xd2482c, movement: 'scuttle', ... },  // the fields of js/mobSpecies.js
//       model(b, variant) { ... },       // VoxelModels.mobBuilders
//       surface: 'skin',                 // VoxelModels.MOB_SURFACES
//       drops: [['shell', 1, 2]],        // loot when defeated: [item, min, max, chance] (resources.js)
//       sheds: ['feather', 0.4, 8],      // struck but not defeated: [item, chance, cooldown seconds]
//       furry: true, milkable: true,     // shears give fur; a glass gives milk
//       molts: true,                     // drops a feather now and then
//       diet: { foods: [...], chance: 1 / 3 },          // what tames it (taming.js); none: not tameable
//       trap: { baits: ['bait_fish'], cage: true },     // traps.js; a species with no bait says baits: []
//       card: { name, habitat, activity, temperament, hint, description },   // bestiary.js, English
//       cardEs: { name, habitat, hint, description }                         // and Spanish
//   });
//
// Only `info` is required. The tables are those of each feature (RESOURCE_DROPS, TAMING_DIET...), which
// take these rows with speciesFacet whichever file loads first.
const SPECIES_FACETS = { drops: null, sheds: null, furry: null, milkable: null, molts: null, diet: null, trap: null, card: null, cardEs: null };
const SPECIES_FACETS_WAITING = {};
function registerSpecies(id, species) {
    if (!species || !species.info) throw new Error(`registerSpecies ${id}: no info`);
    if (MOB_SPECIES[id]) throw new Error(`registerSpecies ${id}: there is one already`);
    for (const key of Object.keys(species)) {
        if (key === 'info' || key === 'model' || key === 'surface') continue;
        if (!(key in SPECIES_FACETS)) throw new Error(`registerSpecies ${id}: unknown field ${key}`);
        (SPECIES_FACETS[key] || (SPECIES_FACETS_WAITING[key] = SPECIES_FACETS_WAITING[key] || {}))[id] = species[key];
    }
    MOB_SPECIES[id] = species.info;
    if (species.model) VoxelModels.mobBuilders[id] = species.model;
    if (species.surface) VoxelModels.MOB_SURFACES[id] = species.surface;
}

// The feature that owns a table keyed by species gives it here: it gets the rows registered so far, and
// the ones to come are written straight into it. Returns the table.
function speciesFacet(name, table) {
    if (!(name in SPECIES_FACETS) || SPECIES_FACETS[name]) throw new Error(`speciesFacet ${name}: unknown, or owned twice`);
    SPECIES_FACETS[name] = Object.assign(table, SPECIES_FACETS_WAITING[name]);
    delete SPECIES_FACETS_WAITING[name];
    return table;
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

// Damage the player takes: modifier(amount, type, reason, source) returns the new amount (armour,
// immunities...), in the order they were registered. Types and source are at Game.applyDamage.
const DAMAGE_MODIFIERS = [];
function registerDamageModifier(modifier) {
    DAMAGE_MODIFIERS.push(modifier);
}

// Panels from other files (bestiary...): registerModalPanel({ isOpen(), close(), escape() }). While one
// is open the game is not in play, the pointer stays free, and Escape closes it. escape(), optional: Escape
// asks it first, and if it returns true (it closed something smaller inside) the panel stays open.
const MODAL_PANELS = [];
function registerModalPanel(panel) {
    MODAL_PANELS.push(panel);
}

// Once per frame, after the mobs moved: updater(delta) (client-side entities of a mechanic).
// What the server says: registerNetworkHandler('glowSet', function (payload) { ... }). Any message type
// the server sends, and 'connected' (every time the socket opens, reconnections too). Several handlers
// may share a type; all hear it, in the order they registered. They are listening before the socket
// opens, so nothing the server says on connecting is missed: no feature subscribes by itself.
const NETWORK_HANDLERS = [];
function registerNetworkHandler(type, handler) {
    NETWORK_HANDLERS.push([type, handler]);
}

// Game.initNetwork gives its new network here, before connecting.
function attachNetworkHandlers(game, network) {
    for (const [type, handler] of NETWORK_HANDLERS) network.on(type, (payload) => handler.call(game, payload));
}

// Once, when the game has started: the scene, the world, the network (not yet connected), the hotbar and
// the pause menu exist. For what a feature sets up once and needs them: a button in the pause menu, a
// listener of the language. State with no such need is better made where it is first used.
const GAME_INIT_HOOKS = [];
function registerGameInit(hook) {
    GAME_INIT_HOOKS.push(hook);
}

function runGameInit(game) {
    for (const hook of GAME_INIT_HOOKS) hook.call(game);
}

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
//   wholeCube                     a shaped block that counts as an opaque cube for light and faces
//   atlasFace                     { pattern, minSize }: the texture a shape's `relief` boxes cut from
//   cutout                        alpha-cutout material (holes in the texture, like iron bars)
//   drawBlockIcon(ctx, size, world)  draws its inventory icon instead of the cube/shape view
const BLOCK_TYPES = {};
function registerBlockType(id, definition) {
    BLOCK_TYPES[id] = definition;
}

// Procedural block textures: registerTexturePattern(name, paint, { sprite }), where
// paint(factory, surface, tint, seed) fills the surface like the patterns of blockTextures.js.
// sprite: true for cutout sprites (clamped instead of tiled); rtx: { roughness, metalness,
// normalScale } for its PBR look in RTX and Ultra; maxSize: the most pixels it is worth, for a plain
// pattern with many tints, as RTX and Ultra otherwise spend 128 and 256 on each.
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

// Who may change a block, asked before any change by the player or by a helper of theirs (a robot, a
// beaver, a golem) reaches the world: guard(x, z) returns a line saying why column (x, z) is not theirs to
// change, or null. Game.placeBlockForAll and Game.removeBlockForAll (js/game/building.js) ask every guard,
// so whatever changes blocks through them needs to know nothing of plots (js/game/claims.js).
const BLOCK_EDIT_GUARDS = [];
function registerBlockEditGuard(guard) {
    BLOCK_EDIT_GUARDS.push(guard);
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
//   stateName(base, state)   its block name, for a shape whose names cannot be the usual ones
//   noRoom                   what to tell the player when it does not fit
//   linked(state)            [[dx, dy, dz]] cells that form one object with it (door halves)
//   pairs(state, other)      whether a block of this shape in such a cell is its other half
//   toggle(state, ctx)       the state after a right click (doors, gates), or null
//   iconState, iconMask      state and connections shown in the inventory icon
//   iconBoxes                boxes to draw in the icon instead (furniture two cells long)
//   iconFit                  small things: the icon fills the slot instead of matching a cube's scale
//   variantAt(x, y, z)       which look a cell has, by position (boxes get it; null: icons, held items)
//   clickFace(state, local, normal)  the face a click on an inner face counts as, for building
const BLOCK_SHAPES = {};
function registerBlockShape(name, shape) {
    BLOCK_SHAPES[name] = shape;
}
