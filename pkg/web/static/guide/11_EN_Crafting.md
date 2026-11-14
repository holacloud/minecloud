# Crafting

There is no crafting table in MineCloud: everything is crafted from the **recipe panel**, wherever you are.

## The recipe panel

1. Press **C** to open it. **C** again or **Escape** closes it.
2. Type in the **search box** (*Search recipes or #tags...*): it searches the recipe name, the result and the
   ingredients. Try "fish", "torch" or "wool". It also searches by tags: see below.
3. Each card shows what it makes and how many ("Creates x4"). The ones you cannot make yet are dimmed.
4. Click a card to see its ingredients and **how many you own** of each. Missing ones are marked.
5. Press **Craft**. If something is missing, the button says "Missing materials".

The ingredients are used up and the result goes to your inventory, your hotbar and your hand.

## Searching by tags

The **inventory** (**E** key) and the **recipe panel** (**C** key) also search by **tags**: each item's family and its
colour. A recipe has the tags of what it makes.

- Type `#building #blue` to see what is building **and** blue. The more you add, the fewer results.
- They combine with text: `#blue brick` gives the blue brick. Text still searches by name, as always.
- Spanish and English both work (`#azul` and `#blue` are the same), in any case and with or without accents:
  `#construccion` works too. There is no need to finish the word either: `#const` already searches.
- Under the search field is a line with the **most useful tags of what you are looking at**: tap one to add it to the
  search, and tap it again to take it out. The ones you are using come first, then those that filter best. Those that
  do not fit are not shown, but you can still type them.
- Each item carries its most specific tags on the edge of its cell, in small type and sometimes shortened (`furn.` is
  `#furniture`). The full list shows when you rest the mouse on it in the inventory, and in each recipe's detail.
- Each time you open the panel, the search starts empty, with the whole list.

| Family | Tag |
|---|---|
| Building | `#building`, `#wood`, `#stone`, `#metal`, `#glass`, `#wool` |
| Mining and terrain | `#ore`, `#nature` |
| Furniture and home | `#furniture`, `#storage`, `#light`, `#decoration` |
| Electricity and machines | `#electric`, `#logic`, `#mechanism`, `#transport` |
| Gear | `#tool`, `#weapon`, `#armor` |
| Eating and growing | `#food`, `#drink`, `#farming`, `#plant` |
| Animals | `#animal`, `#egg`, `#fossil`, `#bait` |
| Science | `#chemistry`, `#element`, `#science`, `#microscope`, `#sample` |
| Colours | `#white`, `#light-gray`, `#gray`, `#black`, `#brown`, `#red`, `#orange`, `#yellow`, `#lime`, `#green`, `#cyan`, `#light-blue`, `#blue`, `#purple`, `#magenta`, `#pink` |

## Basic recipes

| Result | Ingredients |
|---|---|
| 4 `planks` | 1 `wood` |
| 2 `glass` | 3 `sand` |
| 2 `brick` | 2 `dirt` + 1 `sand` |
| 2 `stone_bricks` | 2 `cobblestone` + 1 `brick` |
| 4 `torch` | 1 `wood` + 1 `coal_ore` |
| 8 `ladder` | 1 `wood` |
| `bed` | 3 `planks` + 2 `leaves` + 1 `wood` |
| `sign` | 2 `planks` + 1 `wood` |
| `sound_block` | 2 `planks` + 1 `cobblestone` + 1 `coal_ore` |
| `spray_paint` | 1 `sand` + 1 `flower_red` + 1 `coal_ore` |
| 2 `stone` | 1 `cobblestone` + 1 `coal_ore` ([Stone](50)) |
| `bucket` | 3 `iron_ore` ([Bucket](111)) |

## Recipe families

| Family | Recipe | More in |
|---|---|---|
| ![](item:cherry_planks) Coloured planks | 1 `*_wood` → 4 `*_planks` | [Wood and leaves](54) |
| ![](item:cherry_sapling) Saplings | 2 `*_leaves` + 1 `dirt` | [Saplings](55) |
| ![](item:stone_slab) Slabs | 1 block → 2 slabs | [Slabs](56) |
| ![](item:oak_stairs) Stairs | 3 blocks → 4 stairs | [Stairs](196) |
| ![](item:oak_door) Doors and trapdoors | 6 planks → 3 doors; 3 `planks` → 2 trapdoors; 2 `iron_ore` → 1 iron one | [Doors and trapdoors](197) |
| ![](item:glass_pane) Panes and bars | 3 `glass` → 8 panes; 3 `iron_ore` → 8 bars | [Windows](198) |
| ![](item:oak_fence) Fences and gates | 2 planks + 1 log → 3 fences; 2 planks + 2 logs → 1 gate | [Fences and gates](199) |
| ![](item:red_brick) Coloured bricks | 1 `brick` + 1 `sand` → 4 | [Bricks](57) |
| ![](item:red_wool) Coloured wool | 2 `leaves` + 1 `flower_red` → 4 | [Wool](58) |
| ![](item:marble) Fine stones and metals | 2 `stone` or `cobblestone` + 1 `sand` → 2 | [Fine stones](59) |
| ![](item:element_au) Elements | 1 `stone` + 1 `coal_ore` | [Elements](60) |
| ![](item:iron_pickaxe) Tools | 3 of the material (2 for the sword) + 1 `wood` | [Pickaxes](68) |
| ![](item:iron_shears) Shears | 2 `iron_ore` | [Shears](73) |

Tool materials: `planks` (wood), `cobblestone` (stone), `iron_ore` (iron) or `gold_ore` (gold).

## Animal recipes

Food, remedies, tanning, gear and glow-dust torches: see [Mob resources](2).

Baits, fishing rod, net and cage: see [Baits and traps](4).

## Farm recipes

| Result | Ingredients | More in |
|---|---|---|
| ![](item:bread) 1 `bread` | 3 `wheat` | [Bread](110) |
| ![](item:bait_seeds) 2 `bait_seeds` | 1 `wheat_seeds` | [Wheat seeds](108) |

Wheat and seeds are not crafted: they are grown. See [Growing wheat](107).

## What cannot be crafted

- **Ores**, sand or dirt: they are mined. See [Mining and building](10).
- **Mob eggs**: found by breaking tall grass or leaves, or caught with the [cage](96).
- The **firefly jar**: you get it with the [net](95).
