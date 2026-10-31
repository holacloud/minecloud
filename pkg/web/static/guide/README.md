# In-game guide pages

Each page is a Markdown file named `ID_XX_TITLE.md`:

- `ID`: the page id.
  - **Public pages** are numbers: 0, 1, 2…, consecutive by sections (leading zeros are ignored, so `007` is page
    7). The ◀ ▶ arrows walk through them.
  - **Secret pages** are codes of 1–8 digits and capital letters (`27A2`, `UR29`). They are only reached by typing
    the code (or from a link), and no index lists them.
- `XX`: language, `EN` or `ES`. Every page exists in both.
- `TITLE`: page title, with `_` for spaces.

The server lists the pages at `/guide/index.json` (`pkg/web/guide.go`); the book is `js/game/guide.js`.

## Markdown

Supported:

- Headings, paragraphs, **bold**, *italic*, `code`, lists (nested with two spaces), tables, quotes (`>`) and rules
  (`---`).
- Links to pages, `[text](12)` or `[text](27A2)`, and to the web.
- Images on their own line, centred, with the alt text as caption:
  - `![caption](img/picture.png)`: a file in this folder.
  - `![caption](mob:sheep)`: the bestiary portrait of a species.
  - `![caption](item:torch)`: the inventory icon of an item.

  The same images inside a sentence or a table cell are drawn as small inline icons.

## Rules

- **One topic per page:** a mob, an item or a family of item variants, a mechanic, a curiosity.
- **Immutable once a version is stable:** a page id always shows the same content. New topics get new ids at the
  end of the public pages, never in between.
- **Radical changes get a new page.** If a creature or item changes radically (goats can fly now!), write a new
  page and link back to the old one: "In earlier versions, goats were like this: [Goat (until v2)](32)". The old
  page links forward to the new one.
- Facts must match the game: check the code (`js/mobSpecies.js`, `js/game/*.js`, `js/world.js`) when in doubt.

## Page catalogue

### Basics and mechanics (0–15)

| Id | ES | EN |
|---|---|---|
| 0 | Índice | Contents |
| 1 | Cómo usar la guía | How to use this guide |
| 2 | Recursos de los mobs | Mob resources |
| 3 | Domesticar y criar | Taming and breeding |
| 4 | Cebos y trampas | Baits and traps |
| 5 | Bestiario | Bestiary |
| 6 | Pescar | Fishing |
| 7 | Montar a caballo | Riding |
| 8 | Día, noche y clima | Day, night and weather |
| 9 | Salud, comida y peligros | Health, food and dangers |
| 10 | Minar y construir | Mining and building |
| 11 | Fabricar | Crafting |
| 12 | Comandos del chat | Chat commands |
| 13 | Jugar con otros | Playing together |
| 14 | Modos gráficos | Graphics modes |
| 15 | Biomas | Biomes |

### Mobs (16–47)

Page 16 is the mobs index. Then one page per species, in the order they arrived in the game (date of the commit
that introduced them).

| Id | Species | Arrived |
|---|---|---|
| 16 | Mobs index | — |
| 17 | sheep | 2026-05-15 |
| 18 | duck | 2026-05-15 |
| 19 | pig | 2026-05-15 |
| 20 | spider | 2026-05-15 |
| 21 | cave_monster | 2026-05-15 |
| 22 | giraffe | 2026-05-16 |
| 23 | macaw | 2026-05-16 |
| 24 | dog | 2026-05-16 |
| 25 | cat | 2026-06-02 |
| 26 | fish | 2026-10-29 |
| 27 | frog | 2026-10-29 |
| 28 | turtle | 2026-10-29 |
| 29 | camel | 2026-10-29 |
| 30 | lizard | 2026-10-29 |
| 31 | scorpion | 2026-10-29 |
| 32 | goat | 2026-10-29 |
| 33 | eagle | 2026-10-29 |
| 34 | horse | 2026-10-29 |
| 35 | bee (and the beehive) | 2026-10-29 |
| 36 | firefly | 2026-10-29 |
| 37 | shadow | 2026-10-30 |
| 38 | bat | 2026-10-30 |
| 39 | crab | 2026-10-30 |
| 40 | vulture | 2026-10-30 |
| 41 | wisp | 2026-10-30 |
| 42 | snake | 2026-10-30 |
| 43 | storm_golem | 2026-10-30 |
| 44 | rabbit | 2026-10-30 |
| 45 | fox | 2026-10-30 |
| 46 | owl | 2026-10-30 |
| 47 | mole | 2026-10-30 |

### Items (48–97)

Page 48 is the items index. One page per item, or per family when the items are variants of each other.

| Id | ES | EN | Items |
|---|---|---|---|
| 48 | Índice de objetos | Items index | — |
| 49 | Hierba y tierra | Grass and dirt | grass, dirt, tall_grass |
| 50 | Piedra y roca madre | Stone and bedrock | stone, cobblestone, bedrock |
| 51 | Arena, cactus y vidrio | Sand, cactus and glass | sand, cactus, glass |
| 52 | Agua | Water | water |
| 53 | Minerales | Ores | coal_ore, iron_ore, gold_ore |
| 54 | Madera y hojas | Wood and leaves | wood, leaves, planks and the 8 wood kinds (spruce, birch, jungle, acacia, dark_oak, cherry, maple, willow): `*_wood`, `*_planks`, `*_leaves` |
| 55 | Brotes | Saplings | `*_sapling` |
| 56 | Losas | Slabs | `*_slab` |
| 57 | Ladrillos | Bricks | brick, stone_bricks, 16 coloured `*_brick` |
| 58 | Lanas de colores | Coloured wool | 16 `*_wool` |
| 59 | Piedras nobles y metales | Fine stones and metals | marble, basalt, slate, limestone, granite, copper_block, iron_block, gold_block, obsidian, concrete |
| 60 | Bloques de elementos | Element blocks | 36 `element_*` |
| 61 | Flores y setas | Flowers and mushrooms | flower_red, flower_yellow, mushroom_red, mushroom_brown |
| 62 | Antorcha | Torch | torch |
| 63 | Cama | Bed | bed |
| 64 | Cartel | Sign | sign |
| 65 | Escalera de mano | Ladder | ladder |
| 66 | Bloque de sonido | Sound block | sound_block |
| 67 | Pintura en spray | Spray paint | spray_paint |
| 68 | Picos | Pickaxes | `*_pickaxe` |
| 69 | Palas | Shovels | `*_shovel` |
| 70 | Hachas | Axes | `*_axe` |
| 71 | Espadas | Swords | `*_sword` |
| 72 | Azadas | Hoes | `*_hoe` |
| 73 | Tijeras de hierro | Iron shears | iron_shears |
| 74 | Huevos de mobs | Mob eggs | `*_egg` (each mob page has its own egg) |
| 75 | Pluma | Feather | feather |
| 76 | Cuero | Leather | leather |
| 77 | Pelo | Fur | fur |
| 78 | Leche | Milk | milk |
| 79 | Panal | Honeycomb | honeycomb |
| 80 | Pescado crudo | Raw fish | raw_fish |
| 81 | Pescado cocinado | Cooked fish | cooked_fish |
| 82 | Concha | Shell | shell |
| 83 | Escama | Scale | scale |
| 84 | Saco de veneno | Venom sac | venom_sac |
| 85 | Polvo luminoso | Glow dust | glow_dust |
| 86 | Esencia de sombra | Shadow essence | shadow_essence |
| 87 | Tarro de miel | Honey bottle | honey_bottle |
| 88 | Queso | Cheese | cheese |
| 89 | Antídoto | Antivenom | antivenom |
| 90 | Abrigo cálido | Warm coat | warm_coat |
| 91 | Cota de escamas | Scale mail | scale_mail |
| 92 | Capa de plumas | Feather cape | feather_cape |
| 93 | Cebos | Baits | bait_seeds, bait_worms, bait_meat, bait_fish, bait_honey |
| 94 | Caña de pescar | Fishing rod | fishing_rod |
| 95 | Red para insectos | Bug net | bug_net |
| 96 | Jaula | Cage trap | cage_trap |
| 97 | Frasco de luciérnagas | Firefly jar | firefly_jar |

### Curiosities (98–)

Page 98 is the curiosities index; curiosity pages follow from 99.

### Pages added later (107–)

New topics after the first edition, listed in their index (16, 48 or 98).

| Id | ES | EN | Items / topic |
|---|---|---|---|
| 111 | Cubo | Bucket | bucket, water_bucket (in the items index, 48) |

### Secret pages

Codes are hinted at in other pages or in the world; no index lists them.

| Code | ES | EN | Hint |
|---|---|---|---|
| 27A2 | Lo que ve el búho a las tres | What the owl sees at three | a riddle on the owl page (46) |
| UR29 | El fuego que ríe | The laughing fire | a caught wisp whispers it in the chat |
| B31X | El cuaderno completo | The complete notebook | the bestiary shows it at 31 / 31 |
| SH4D | Antes del alba | Before dawn | a shadow sometimes whispers it as it dissolves at dawn |
| Z3US | El corazón de la tormenta | The heart of the storm | carved in the rubble of a toppled storm golem |
| M0LE | Bajo tus pies | Beneath your feet | an acrostic on the giant mole page (47) |
