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
| `pkg/network/` | The server: `websocket.go` is the hub; each mechanic has its own file (`glow_block.go`, `power.go`...). |
| `pkg/world/`, `pkg/terrain/` | Chunk storage and terrain generation. |
| `test/js/` | Node tests: they run the real scripts of `index.html` in a VM with stand-ins for the browser. |
| `GUIA.md` | The player's reference of every mechanic, in Spanish. Kept up to date with each feature. |

## How the client is put together

- Everything is global. A feature file adds methods with `Object.assign(Game.prototype, { ... })` and registers
  itself through the `register*` functions of `extensions.js`. Handlers run with `this` set to the `Game`.
- **Prefix every method and constant with the feature's name** (`glowOpen`, `GLOW_COLOURS`, `crabUpdate`):
  it is one flat namespace, and a second method with the same name silently replaces the first.
- A feature owns its CSS and markup: it creates its `<style>` and panel elements itself (see
  `game/glow_block.js`). `index.html` only gets the `<script>` tag.
- Reaching another feature that may load later: `typeof this.otherThing === 'function' && ...`.
- Wrapping an existing method (`const original = proto[name]`) is a last resort: a rename then disables the
  wrap without any error. `game/builder.js` does it for many; do not add more without a test that the wrapped
  names exist.
- Text the player reads goes through `gameText({ ES, EN })` (`js/gameLang.js`); longer text lives in a
  `*_text.js` file next to the feature. Item and block `name:` fields are English.
- Network: `this.network.send('type', payload)`; `this.network.on('type', handler)` (any type the server sends
  arrives; several listeners may share one). There is no init hook yet: subscribe once behind a flag from a
  `registerFrameUpdate` (see `claimsListen` in `game/claims.js`).
- Mobs are simulated on each client and are not sent over the network. Blocks, storage, power and plots are
  the server's.

## Recipe: a new mob

Example to read: `game/crab.js` (550 lines, self-contained). Everything goes in `game/<species>.js`:

1. `MOB_SPECIES.<id> = { ... }` (fields documented in `js/mobSpecies.js`), `VoxelModels.mobBuilders.<id>`,
   `VoxelModels.MOB_SURFACES.<id>`.
2. `registerMobBehaviour('<movement>', { update, interact, spawnForChunk, spawnCommand, spawnEgg })` with a
   movement name of its own, unless a built-in one fits (`'ground'`, `'swim'`, `'hop'`...: then no behaviour).
3. When struck, use `damageMobByPlayer` / `defeatMobByPlayer` (`game/mobs.js`); do not hand-roll health,
   the `defeated` event and removal as the older species do.
4. Natural spawning draws from `this.chunkRandom(chunkX, chunkZ, salt)`: pick salts no other file uses
   (`grep -rn "chunkRandom(" pkg/web/static/js/game`).
5. A mob that edits blocks for its owner asks `this.claimRefusalAt(x, z)` first (see `game/beaver.js`).

Then the tables of other features, each one line:

| Where | What | If forgotten |
|---|---|---|
| `index.html` | `<script>` after `game/mobs.js` | the species does not exist |
| `game/resources.js` `RESOURCE_DROPS` (and `RESOURCE_FURRY`, `RESOURCE_MOLTERS`) | loot, fur, feathers | drops nothing |
| `game/taming.js` `TAMING_DIET` | what tames it; a custom movement also needs `tameable` on its behaviour | cannot be tamed |
| `game/traps.js` `TRAPS_SPECIES` | bait and cage | `guide_facts.test.js` fails |
| `game/bestiary.js` `BESTIARY_ENTRIES`, `game/bestiary_text.js` `BESTIARY_ENTRIES_ES` | its card, in both languages | `bestiary_text.test.js` fails |
| guide pages | see "a guide page" | `guide_facts.test.js` may fail |

**Lists of movement names that nothing checks.** A new movement must be considered for each:
`HERD_NOT_BODIES` (`game/herd.js`: movements with no body to keep apart), `TRAPS_GOAL_MOVEMENTS` and
`TRAPS_OWN_WAY_MOVEMENTS` (`game/traps.js`: who walks to a bait), `TAMING_GOAL_MOVEMENTS` (`game/taming.js`),
and the water species at `game/resources.js` (`species === 'fish' || species === 'eel'`).

Tests: `node --test test/js/bestiary_text.test.js test/js/guide_facts.test.js` and the species' own.

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

Examples: `pkg/network/glow_block.go` (the smallest), `appliances.go`, `power.go`. The server has no registry
yet, so these are edits by hand in `pkg/network/websocket.go`:

1. A `case "<message>":` in `handleMessage` that calls a handler in the mechanic's own file.
2. Anything it does to the name of a placed block: in `placeBlock`.
3. A loop of its own: `go run<Mechanic>()` in `Initialize`.
4. Saved state: a field in `persistedWorldState`, read in `loadWorldState`, written in `saveWorldState`.
5. What a client must know on connecting: next to `claimsSendTo` in `HandleWebSocket`. Prefer state in the
   block's name (`glow_block:ff0000`), which travels with the chunks and needs none of 4 and 5.

Rules every handler follows:

- **Plots.** A handler that acts on a position checks `claimCheck(client, x, z)` and answers a refusal with
  `claimRefuse` (or `claimGuardRequest` for storage-like requests); see `handleGlowSet`. Nothing fails if it
  is forgotten: the machine is then usable inside someone else's plot.
- **Sending.** To one client: `client.trySend(data)`; to all: `broadcastToAll`. Never `client.send <- data`
  and never close that channel.
- **Shared maps and slices** inside saved state are replaced, never changed in place: `saveWorldState` and
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
