# MineCloud

A multiplayer voxel game in the browser, for children: it is meant to make them curious about chemistry,
genetics, maths, physics, geology... Three.js client made of plain global scripts (no bundler, no modules),
Go server over WebSockets.

**You should not need to read the whole project to add something.** Find the recipe below, read the one or
two files it names as examples, and follow the checklist. If a recipe is wrong or a step is missing, fix this
file in the same change.

## Run and test

```bash
make build                       # bin/server
bin/server -addr :8090           # the local server (default is :8080); static files are embedded: rebuild to see a change
bin/server -addr :8090 -logmessages   # the same, logging every message of every client (quiet without it)
make test                        # everything: Go, then every JS test (about 4 minutes)
go test ./pkg/network/ -run Glow # one Go test
node --test test/js/glow_block.test.js   # one JS test file (the glob form is needed for all: 'test/js/*.test.js')
```

While working, run the test file of the feature plus the checklist tests named in its recipe; run `make test`
before calling it done. There is no CI: nothing else will catch a red test.

## Where things are

| Path | What |
|---|---|
| `pkg/web/static/js/extensions.js` | **Every extension point of the client**, documented. Read this first. |
| `pkg/web/static/js/game/*.js` | One file per feature (a species, a machine, a panel). New things go here. |
| `pkg/web/static/js/game.js`, `world.js`, `chunkMesher.js`, `camera.js`, `models.js` | The core. A feature should not need to edit them. |
| `pkg/web/static/index.html` | Core CSS and markup, and the `<script>` list. **Order is load order.** |
| `pkg/web/static/guide/` | The in-game guide: one Markdown page per topic, in ES and EN. Its `README.md` has the rules. |
| `pkg/network/` | The server: `registry.go` is how a mechanic plugs in, `websocket.go` the hub; each mechanic has its own file (`glow_block.go`, `power.go`...). |
| `pkg/world/`, `pkg/terrain/` | Chunk storage and terrain generation. |
| `test/js/` | Node tests: they run the real scripts of `index.html` in a VM with stand-ins for the browser. `support/game.js` has the script list, `anyStub` and loaders to start a new test from. |
| `GUIA.md` | The player's reference of every mechanic, in Spanish. Kept up to date with each feature. |

## How the client is put together

- Everything is global. A feature file adds methods with `Object.assign(Game.prototype, { ... })` and registers
  itself through the `register*` functions of `extensions.js`. Handlers run with `this` set to the `Game`.
- **Prefix every method and constant with the feature's name** (`glowOpen`, `GLOW_COLOURS`, `crabUpdate`):
  it is one flat namespace, and a second method with the same name silently replaces the first. Two methods of
  `Game` with one name fail `invariants.test.js`, which also checks that every file of `js/game/` has its
  `<script>`, that every message sent has a handler on the server, and the guide's pairs and links.
- A feature owns its CSS and markup: it creates its `<style>` and panel elements itself (see
  `game/glow_block.js`). `index.html` only gets the `<script>` tag.
- Reaching another feature that may load later: `typeof this.otherThing === 'function' && ...`.
- Wrapping an existing method (`const original = proto[name]`) is a last resort: a rename then disables the
  wrap without any error (`invariants.test.js` checks that the wrapped names exist). `game/builder.js` does it
  for many; prefer a hook.
- Text the player reads goes through `gameText({ ES, EN })` (`js/gameLang.js`); longer text lives in a
  `*_text.js` file next to the feature. Item and block `name:` fields are English.
- Network: `this.network.send('type', payload)` to say, and `registerNetworkHandler('type', function (payload)
  { ... })` to hear (any type the server sends, and `'connected'`; several handlers may share one). Never
  `this.network.on(...)` from a feature: `game_hooks.test.js` fails.
- What a feature sets up once the game has started (a button in the pause menu, a listener of the language):
  `registerGameInit(function () { ... })`. Items, recipes and loading saved state go in `registerGameContent`.
- **Changing a block** (anything: a tool, a mob, a panel): `this.placeBlockForAll({ x, y, z, blockType })` and
  `this.removeBlockForAll(x, y, z)` (`game/block_edits.js`). Never `world.addBlock` plus a `blockPlace` message
  by hand: `block_edits.test.js` fails. `this.blockEditRefusal(x, z)` gives the line to show when the player
  may not change that column; a feature that restricts edits registers a `registerBlockEditGuard`.
- Mobs are simulated on each client and are not sent over the network. Blocks, storage, power and plots are
  the server's.

## Recipe: a new mob

Example to read: `game/crab.js` (self-contained). Everything goes in `game/<species>.js`, and the only other
file to edit is `index.html` (`<script>` after `game/mobs.js`):

1. `registerSpecies('<id>', { info, model, surface, drops, sheds, furry, milkable, molts, diet, trap, card,
   cardEs })` (documented in `extensions.js`; `info` has the fields of `js/mobSpecies.js`). It is the species'
   row in every table of the other features: loot, taming, traps, bestiary in both languages. A misspelt
   field stops the game at load.
2. `registerMobBehaviour('<movement>', { update, interact, spawnForChunk, spawnCommand, spawnEgg })` with a
   movement name of its own, unless a built-in one fits (`'ground'`, `'swim'`, `'hop'`...: then no behaviour).
   **The behaviour also says its traits** (`bodiless`, `walksToGoal`, `tameable`, `inWater`...; the list is in
   `extensions.js`): other features ask `mobMovementIs(movement, trait)` and never list movement names.
3. When struck: `if (this.damageMobByPlayer(mob)) { ...its last effects...; this.defeatMobByPlayer(mob); }`
   (`game/mobs.js`). Never the health, the `defeated` event and the removal by hand.
4. Natural spawning draws from `this.chunkRandom(chunkX, chunkZ, salt)`: pick salts no other file uses
   (`grep -rn "chunkRandom(" pkg/web/static/js/game`). `this.mobCount('<id>')` against `info.limit`, then
   `this.createMob`, `this.mobMarkNatural(mob, chunkX, chunkZ)` and `this.ambientMobs.push(mob)`.
5. A mob that changes blocks does it with `this.placeBlockForAll(payload)` and `this.removeBlockForAll(x, y, z)`
   (see `game/beaver.js`): they tell the server and stop by themselves in someone else's plot.
6. Its guide pages (see "a guide page"): `guide_facts.test.js` counts the species and checks what the pages
   say of taming and baits.

A new feature that needs to know something of every species or movement adds a field to `SPECIES_FACETS` or a
trait (both in `extensions.js`) instead of a table of names of its own.

The 22 species of `js/mobSpecies.js` (sheep, fish...) have no file of their own and keep their rows in the
tables themselves (`RESOURCE_DROPS`, `TAMING_DIET`, `TRAPS_SPECIES`, `BESTIARY_ENTRIES`...): do not add to those.

Tests: `node --test test/js/species_registry.test.js test/js/bestiary_text.test.js test/js/guide_facts.test.js`
and the species' own.

## Recipe: a new block or item

Example to read: `game/glow_block.js` (a block with a panel) or any `registerItemType` call. Nothing on the
server: blocks are stored by name.

1. In `game/<feature>.js`: `registerBlockType(id, { ... })` or `registerItemType(id, { ... })`,
   `registerTexturePattern` for its look, and `registerGameContent(({ addItem, addRecipe }) => ...)` for its
   inventory slot and recipes. The fields are documented in `extensions.js`.
2. Behaviour: `registerItemUseHandler` (right click), `registerBlockBreakHandler`, `registerModalPanel`,
   `registerFrameUpdate`, `registerBlockShape` (not a cube), `registerDamageModifier`.
3. `<script>` tag in `index.html`, before `game/item_tags.js`.
4. A block: `node tools/viewerPalette.js` regenerates `pkg/web/viewer_block_palette.json`; commit it.
5. Tags: most come from the item's own fields; otherwise add it to `ITEM_TAG_TABLE` in `game/item_tags.js`.
6. Food also goes in `ANT_FOOD_BLOCKS` (`game/ants.js`) and `TAMING_DIET` if an animal eats it.

Tests: `node --test test/js/item_tags.test.js test/js/viewerPalette.test.js` and the feature's own.

## Recipe: a machine with state on the server

Examples: `pkg/network/glow_block.go` (the smallest), `appliances.go`, `power.go`. A mechanic lives in its
own file and registers itself from an `init()`; `pkg/network/registry.go` documents each call:

1. `registerMessage(messageSpec{plot: ..., handle: ...}, "<message>")` for each message of the client.
   **`plot` is mandatory** (the server does not start without it) and says what the message has to do with plots:
   - `plotGuarded`: the payload is `{x, y, z, ...}` and it changes that cell. The dispatcher refuses it in
     someone else's plot before the handler runs. **Use this one whenever it fits.**
   - `plotChecked`: the handler checks by itself (several cells, an answer of its own to give back). It must
     then be in `claimPaths()` of `claims_test.go`, or `registry_test.go` fails.
   - `plotOpen` with a `why`: anyone may, on purpose (reading, a sound).
   - `plotNowhere`: it acts on no cell (chat, identity).
2. `registerLoop(run)` for a loop of its own, `registerOnConnect(tell)` for what a client must know on
   connecting, `registerPlaceFilter(filter)` for what it does to the name of a placed block.
3. Saved state: `registerWorldSection(worldSectionSpec{name, snapshot, load})` (`persistence.go`, examples
   at the end of `crops.go` and `claims.go`) gives the mechanic its own file, `data/world/<name>.json`, and
   `section.changed()` after each change has it written within 5 seconds and when the server stops.
   `immediate: true` writes it before `changed()` returns: only for what must be on disk before it is
   answered (chests, plots), and then never call `changed()` holding a lock its snapshot takes (`mark()`
   is safe anywhere). The snapshot is a struct whose JSON keys no other section uses
   (`persistence_test.go` checks). Prefer state in the block's name (`glow_block:ff0000`), which travels
   with the chunks and needs none of this.

**A block that keeps things** (a chest with a life of its own: an oven, a microscope, an incubator) is built
on `storage.go`, which does the slots, the panels, the moves and the saving. What the mechanic adds is a
`storagePart` (documented there; examples: `microscopePart` in `microscope.go`, the smallest, and
`appliancePart` in `appliances.go`): hooks for what its panel shows, what it refuses, what it does when the
contents change or the block is broken. Three lines outside its own file: its part in `storageParts`, its
book (state out of the blocks, if any) embedded in `storageBook`, and its saved fields in `StorageBlock`.
`storage_parts_test.go` fails if `storage.go` names a mechanic any other way.

Rules every handler follows:

- **Plots.** See `plot` above. A `plotChecked` handler calls `claimCheck(client, x, z)` and answers a
  refusal with `claimRefuse` (or `claimGuardRequest` for storage-like requests).
- **Sending.** To one client: `client.trySend(data)`; to all: `broadcastToAll`. Never `client.send <- data`
  and never close that channel.
- **Shared maps and slices** inside saved state are replaced, never changed in place: the save and
  the broadcasts read them after releasing the lock.
- **Trust nothing from the client**: check reach, names and payload size as `storage.go` does.
- Lock order: `blockEditMu` → `storage.mu` → `cropMu` → `powerMu` → `Store.mu` → `stateMu` → `clientsMu`.
- Tables mirrored by hand in both sides must match: `powerKinds` (`power.go`) and `ELECTRIC_KINDS`
  (`game/electricity.js`); `storageKinds` (`storage.go`) and `STORAGE_KINDS` (`game/storage.js`); the recipes
  of `appliances.go` and `game/appliances.js`.

Tests: a `<mechanic>_test.go` next to it. `weather_station_test.go` shows how to send messages through
`handleMessage` with a client that hears the broadcasts.

## Recipe: a guide page

Rules and catalogue: `pkg/web/static/guide/README.md`. For each new topic:

1. Two files, `ID_ES_Título.md` and `ID_EN_Title.md`, with the next free id at the end. Pages are never
   renumbered, and facts must match the code.
2. A row in the README's catalogue and in the contents pages that list it (0, and 16, 48, 98 or 223), in both
   languages.
3. Its section in `GUIA.md`.

## Conventions

- Comments say why and what a thing is for, in plain sentences, and name the file a thing belongs to
  (`(js/game/claims.js)`). Keep that style.
- Commit messages are one sentence saying what the player or the game can now do ("Let a curtain open
  towards the half of the face it was placed on").
- Do not commit `data/` or `bin/`.
- Performance matters (children on modest laptops, tablets and phones): nothing new per frame that allocates
  or scans everything; work out tables once at load.
