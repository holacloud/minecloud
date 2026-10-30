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
// They join world.blockTypes as itemOnly entries; extra fields (e.g. food: 2) are kept.
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

// Once per frame, after the mobs moved: updater(delta) (client-side entities of a mechanic).
const FRAME_UPDATERS = [];
function registerFrameUpdate(updater) {
    FRAME_UPDATERS.push(updater);
}
