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
go run ./cmd/loadtest -h         # players that are not there, in steps: only ever against a server on a copy of data/
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
| `pkg/network/` | The server: `registry.go` is how a mechanic plugs in, `websocket.go` the hub; each mechanic has its own file (`glow_block.go`, `power.go`, `animals.go`...). |
| `pkg/world/`, `pkg/terrain/` | Chunk storage and terrain generation. A rule of the generator is written twice: there and in `js/terrainGen.js`, its mirror for the viewer; fingerprints in `ores_test.go` and `fossils_test.go` hold the two together. |
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
- Wild mobs are simulated on each client and are not sent over the network. Blocks, storage, power and plots
  are the server's, and so are the animals that matter to somebody (a tamed one, its babies, whatever a machine
  makes): the server keeps them and tells each client of those around its player, and the client gives each a
  body, an ordinary mob (see "an animal the server keeps").
- Other players: a client is only told of those around it (`pkg/network/player_moves.go`: the nearest every
  round, the rest in range now and then, `gone` when they leave it). An avatar exists only for
  those; never broadcast something to everybody for each move of each player.

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
7. An extinct animal that is found as a fossil also says `fossil: { source, rarity, weight, water, seconds }`
   in its `registerSpecies` (documented in `extensions.js`), and nothing else: `game/fossils.js` makes its
   items from that (`fossil_<id>`, or `_skull`, `_spine` and `_tail` for a skeleton) and puts it in the
   blocks of its kind that the world already has. `node --test test/js/fossils.test.js`.
8. The server revives it from its row of `revivalSpecies` (`pkg/network/revival.go`), which must say what the
   species' file says: its pieces, `water` and `seconds`, a `Radius` over 0 exactly when its movement has
   `walksToGoal`, and its `info.speed`. `node --test test/js/revival.test.js` names the row and the field.

A new feature that needs to know something of every species or movement adds a field to `SPECIES_FACETS` or a
trait (both in `extensions.js`) instead of a table of names of its own.

The 22 species of `js/mobSpecies.js` (sheep, fish...) have no file of their own and keep their rows in the
tables themselves (`RESOURCE_DROPS`, `TAMING_DIET`, `TRAPS_SPECIES`, `BESTIARY_ENTRIES`...): do not add to those.

**An extinct animal** (nobody meets one unless it is brought back to life) is a species like any other with
two more fields in its `info`: `hiddenUntilDiscovered: true` and, if it is the ancestor or an ancient relative
of a living species, `ancestorOf: '<id of that species>'` (which must exist and not be extinct itself: a wrong
one stops the game when it is built, `mobAncestors` in `js/mobSpecies.js`). The bestiary does the rest by
itself: a section of their own with its count, a card that is a secret until the player sees one, and the tree
on the sheets of both. What it does differently from the steps above:

- It never appears by itself: no `spawnBiomes`, no `spawnForChunk`, no step 4. Its egg and `/mob` work as for
  any species, but grass and leaves never give its egg.
- Write `registerSpecies('<id>', {` at the start of a line with `info: { ... },` as its first field, as
  `game/crab.js` does: the tests read it there.
- Its card (`card`, `cardEs`): name, habitat, activity, temperament and description, and **no `hint`** (a
  secret card says the same line for all). The habitat says where and when it lived, not a biome, with the
  same numbers in both languages. The name may be the same in both (`Titanoboa`).
- A `trap` row always (`{ baits: [] }` for none); baits and a `diet` only if it really comes to them and can
  really be tamed (`trapsIsLured`, `tamingCanTame`).
- Guide: its row goes in page 261 (not in 16 nor in B31X), in both languages, as
  `| ![](mob:<id>) | [<name>](<its page>) | ![](mob:<living id>) [<its name>](<its page>) | <date> |`, with `—`
  in the third cell if it has no `ancestorOf`. The name is the title of its page and of its card, to the
  letter. Its own page names each food and bait by id (`` `wheat` `` or `![](item:wheat)`): pages 3, 4, 93, 96
  and every count of 5, 74, 106 and B31X stay about the living ones. A movement of its own does count: a row
  in the table of page 104, and the number of movements of 104 and 106.
- `node --test test/js/extinct_species.test.js` asks the rest of every extinct animal there is, with nothing to
  add for a new one: its `fossil`, a model built and painted without a browser that stands on the ground, a
  body as an animal the server keeps, no `mount` it cannot honour, and its two pages with its portrait, the
  block of its fossil and the links to 262 or 263 and to the revival machine (264). A habit of its own is
  tried on the flat world of `test/js/support/flat_world.js` (`test/js/dodo.test.js` shows how).
- One of the sea needs no behaviour of its own: `movement: 'cruise'` (`game/sea_animals.js`, whose header
  documents it) keeps it in the water and around its home, and `fossil.water` says how much water its revival
  asks for. Example: `game/ammonite.js`. In its `info`: `seaDepth` (`'bed'` to walk on the bottom, or 0 to 1),
  `seaBreath: [min, max]` if it breathes air, `seaJet`, `seaIdle`, `seaCurl`, `seaRange`; `hostile` and
  `attackDamage` make it bite a player who is in the water. Its body is measured from its model (it stands
  on y = 0, faces +z, origin in the middle of its trunk), and its rig is what is animated: `wings` are
  flippers, `tail`, `legs`, `arms` (tentacles), `head`, and parts named `neck0`, `neck1`... and `jaw`. Sizes of
  parts in quarters of a unit. A hostile one steers its mouth at a swimmer, bites and swims past, and snaps
  (without harm) at the peaceful sea animals much smaller than itself when no player is in the water; a body
  longer than 6 blocks slows down to turn instead of stopping. `node --test test/js/sea_animals.test.js`.
- One of the air needs no behaviour of its own either: `movement: 'glide'` (`game/gliders.js`, whose header
  documents it) keeps it circling over its home, perching and taking off again, and never in a block; the
  server's row says `Radius: 0`. Example: `game/argentavis.js`. In its `info`: `glideHeight`, `glideRange`,
  `glideAloft`, `glidePerch`, `glideBeat`; `hostile` and `attackDamage` make it dive at a player near its home.
  Its wings lie flat along x from the shoulders (`wingL`, `wingR` in the rig). `node --test
  test/js/gliders.test.js`, which names every glider in two lists.

- What several of them share is one field of `info`, not code of their own: `charge: { ... }`
  (`game/charge.js`: struck, it aims, runs and hits what its head reaches; the mammoth, the Triceratops) and
  `giant: { ... }` (`game/diplodocus.js`: a body many blocks long is kept from stepping its chest into a wall,
  under a low roof or over a ledge, and pushes the player out of its legs). A mount says `mount` with numbers
  of its own and must be tamed first (`game/titanotylopus.js`, `game/glyptodon.js`).
- A model's sizes are multiples of a quarter of a unit (a smaller side paints nothing), and its height and
  reach are read from its parts without their rotations (`absoluteTop` in `js/models.js`, `herdSpeciesBody` in
  `game/herd.js`): a long chain of rotated parts floats the health bar (see the horns of `game/argali.js`).

Tests: `node --test test/js/species_registry.test.js test/js/bestiary_text.test.js test/js/guide_facts.test.js`
and the species' own. In a test, never give a mob, the game or the world to `assert.equal` or `deepEqual`: a
failure prints both sides, and they are graphs with no end (compare an id, a number, `assert.ok(x === null)`).

## Recipe: an animal the server keeps

Read the headers of `pkg/network/animals.go` (the model, the messages, the binary frame) and of
`game/animals.js` (what a client does with them). A kept animal exists for everybody and after a restart; each
client walks its own copy, and no position is ever sent round after round.

1. **A mechanic makes one** from the server: `id, ok := animalSpawn(animalSpawnSpec{Species, X, Y, Z, Radius,
   Speed, Variant, Origin})`. It roams within `Radius` blocks of that place (its home), walked by the server
   only where a player is watching. `Speed` is what its species walks, so it is given time to arrive. The server
   has no table of species: `Species` is the id the client registers. Try one with `/animal <species> [blocks]`
   in creative mode.
2. **To be walked by the server** a species' movement must have the `walksToGoal` trait: its update asks
   `getMobGoal` every frame, walks to what it gets, stops within the goal's `stopDistance`, and never moves
   by itself while it gets one (a kept animal always does: when it has nowhere to go its goal is its own
   nose). A movement that does not (a swimmer, a flyer) is spawned with `Radius: 0`: it only exists, and lives
   around its home by its own behaviour on each client.
   What a walked species still does by itself for a moment (the dodo comes up to whoever stands near, a struck
   Kubanochoerus charges) is a goal of its own, asked before the server's: `registerMobGoalFirst`
   (`extensions.js`). Keep it short, near the animal's home and, where it can be, the same on every client.
3. **Its body.** The built-in ground movements need nothing. A movement with a behaviour of its own says
   `spawnKept(species, position, { variant })` in `registerMobBehaviour` (see `game/crab.js`), returning the
   mob already in `ambientMobs`; without it an animal of that movement with no owner gets no body.
4. **What marks a kept mob**, for any feature that tells a wild animal from somebody's: `userData.animalId`
   (its number), `animalMine` (this player's, walked here by `taming.js`), `animalForeign` (not this player's:
   nothing in this client decides where it goes, so it is never befriended, despawned or pushed about) and
   `animalOwnerName` (null: nobody's, which can still be tamed: the server is asked, `animalAdopt`). Only this
   player's own have `userData.tamed`.
5. **Blows and leaving.** Strike through `damageMobByPlayer` and remove with `defeatMobByPlayer` or
   `removeMob`, as the mob recipe says: `animals.js` hears those and tells the server (health is the server's,
   and an animal gone here is gone for all). `registerMobStrikeGuard` is who may strike.
6. What its owner's client keeps with a pet (a baby's age, its genes) is its `extra`, written and read only by
   `tamingKeptExtra` and `tamingKeptApply` (`game/taming.js`).
7. The frame is written in `animals.go` and read in `animalsReadFrame`; both tests pin the same bytes
   (`TestAFrameIsTheseBytes`, `test/js/animals.test.js`): change them together.
8. **A hostile one** (`hostile` in its `info`) goes after the player the server says, the same one for
   everybody, and never after whoever is local. The mechanic that makes it says how in the spec, with a
   `Radius` above 0: `Chase` (blocks it comes from: its `chaseDistance`, or 16), `ChaseDay` (3.5 if it is
   `nocturnal`, else 0) and `ChaseSpeed` (its `chaseSpeed`). `animalsChaseOf(info)` (`game/animals.js`) gives
   the three as the client knows them, for a test to hold a server table to; `/animal` sends them. The rule
   (range, when it lets go, its leash, day and night, a player that dies) is in the header of `animals.go`.
   On a client a kept mob that the server walks has `userData.hostile` only where its target plays, and
   that is all the built-in ground movement asks before it chases and bites. A movement of its own that
   attacks asks the same, never `info.hostile`, and runs to the goal it gets (`getMobGoal`: its target, with
   a `speed`).

Tests: `go test ./pkg/network/ -run 'Animal|Roaming|Frame|Fifty'` (with `-v`, the last one prints what 50
animals cost in bytes a second) and `node --test test/js/animals.test.js`.

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

**A machine started by a signal** (`revival.go`, the revival machine): an electric consumer whose row of
`powerKinds` says `SignalTop` never conducts through its top face, so what stands on it is its signal and never
its power, and it reads that face with `logicInputAt(cell, powerPos{0, 1, 0})`. It is also the example of a
machine that makes an animal (`animalSpawn`), of a loop that tells only the panels that are open, and only what
has changed, and of a panel of its own over a chest's messages (`storageSendPut`, `storageSendTake` in
`game/storage.js`).

Rules every handler follows:

- **Plots.** See `plot` above. A `plotChecked` handler calls `claimCheck(client, x, z)` and answers a
  refusal with `claimRefuse` (or `claimGuardRequest` for storage-like requests).
- **Sending.** To one client: `client.trySend(data)`; to all: `broadcastToAll`. Never `client.send <- data`
  and never close that channel.
- **Shared maps and slices** inside saved state are replaced, never changed in place: the save and
  the broadcasts read them after releasing the lock.
- **Trust nothing from the client**: check reach, names and payload size as `storage.go` does.
- Lock order: `blockEditMu` → `storage.mu` → `cropMu` → `powerMu` → `animals.mu` → `Store.mu` → `stateMu` →
  `clientsMu`.
- Tables mirrored by hand in both sides must match: `powerKinds` (`power.go`) and `ELECTRIC_KINDS`
  (`game/electricity.js`); `storageKinds` (`storage.go`) and `STORAGE_KINDS` (`game/storage.js`); the recipes
  of `appliances.go` and `game/appliances.js`; `revivalSpecies` (`revival.go`) and what each species with a
  fossil says in its own file (`test/js/revival.test.js` names the row and the field).

Tests: a `<mechanic>_test.go` next to it. `weather_station_test.go` shows how to send messages through
`handleMessage` with a client that hears the broadcasts.

## Recipe: a guide page

Rules and catalogue: `pkg/web/static/guide/README.md`. For each new topic:

1. Two files, `ID_ES_Título.md` and `ID_EN_Title.md`, with the next free id at the end. Pages are never
   renumbered, and facts must match the code.
2. A row in the README's catalogue and in the contents pages that list it (0, and 16, 48, 98, 223 or 261), in
   both languages.
3. Its section in `GUIA.md`.

## Conventions

- Comments say why and what a thing is for, in plain sentences, and name the file a thing belongs to
  (`(js/game/claims.js)`). Keep that style.
- Commit messages are one sentence saying what the player or the game can now do ("Let a curtain open
  towards the half of the face it was placed on").
- Do not commit `data/` or `bin/`.
- Performance matters (children on modest laptops, tablets and phones): nothing new per frame that allocates
  or scans everything; work out tables once at load.
