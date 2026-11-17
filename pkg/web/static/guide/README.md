# In-game guide topics

Each topic is a Markdown file named `ID_XX_TITLE.md`:

- `ID`: the topic's id.
  - **Public topics** are numbers: 0, 1, 2…, consecutive by sections (leading zeros are ignored, so `007` is topic
    7). The ◀ ▶ arrows walk through them.
  - **Secret topics** are codes of 1–8 digits and capital letters (`27A2`, `UR29`). They are only reached by typing
    the code (or from a link), and no index lists them.
- `XX`: language, `EN` or `ES`. Every topic exists in both.
- `TITLE`: topic title, with `_` for spaces.

The server lists the topics at `/guide/index.json` (`pkg/web/guide.go`); the book is `js/game/guide.js`.

The printable guide is `/guide-print.html?lang=ES|EN&paper=A5|A4|BOOKLET&volume=ALL|N&part=book|cover` (`js/guidePrint.js`):
every public topic as a paper book, whole or by volumes (see "Volumes"), paginated in JS into pages numbered
from the cover; never the secret ones. Both share the Markdown renderer of `js/guideMarkdown.js`, so a topic
reads the same in the book and on paper.

## On the web

The guide is also public web pages, for search engines and for links: `/book` in English and `/libro` in Spanish
(`pkg/web/book.go`, plain HTML rendered by the server, no script).

- `/book` and `/libro` are the contents (topic 0); a topic is `/book/<id>-<slug>` (`/book/34-horse`,
  `/libro/307-castillo`), the slug made from its title. The id is what counts: a bare id, an old slug or a trailing
  slash answer 301 to that address, so a title may change without breaking a link.
- Every public topic is published, in both languages, and appears there by itself when its file is added; it is
  listed in `/sitemap.xml` (with its other language) and `/robots.txt` points to it. Secret topics never are:
  404, never in the sitemap, and a link to one is printed as plain words, as is a link to a topic not written.
- Pictures that are files (`img/...`) are shown. `mob:` and `item:` ones, which the game draws with its engine,
  are shown from files of their own made once by the game's own code: `pic/mob_<id>.png` (the bestiary's
  portrait, 200 pixels) and `pic/item_<id>.png` (the inventory icon, 64), served at `/guide/pic/` like
  `/guide/img/`. A picture alone on a line is 220px wide with no frame; one in a line of text, a list or a table
  cell is as tall as the text, as in the game's book. `node tools/guidePictures.js` makes them (it needs Google
  Chrome, headless, and Three.js from the network; its header says how it judges each picture): run it with
  `--missing` after adding a topic that shows a mob or item not drawn yet, and whole after changing a model or
  an icon; it also removes the files no public topic shows any more, and never draws what only a secret topic
  shows. `test/js/guide_pictures.test.js` fails while a picture has no file. One with no file is left out of
  the page (a table column of nothing but those goes too), so a topic should still read without them.
- Two renderers of this Markdown exist: `js/guideMarkdown.js` (the book and paper) and `pkg/web/guide_markdown.go`
  (the web). They are held together by `test/js/support/guide_markdown_cases.json`, one case per construct, which
  both `test/js/guideMarkdown.test.js` and `go test ./pkg/web/` render: a change to the dialect is made in both,
  with a case there.
- They look like the game's book opened with H (the CSS of `js/game/guide.js`, carried over rule by rule into
  `bookCSS`): the leather cover, the paper, a head bar with the topic's number, the two languages and Play, the
  topic in VT323 and a foot bar with the previous topic, the contents and the next. The book is at most 980px
  wide and as tall as its topic; the page scrolls as a whole.
- The fonts are served by this server, never asked of another site: `static/fonts/` keeps the latin and
  latin-ext woff2 files of VT323, Pixelify Sans and Atkinson Hyperlegible as Google Fonts cuts them, with each
  family's licence (SIL Open Font License, `OFL-*.txt`), at `/fonts/`, outside the session as `/guide/img/` is.
  The pages declare VT323 and Pixelify Sans inline (`bookCSS`); the game's book and the printable guide link
  `fonts/fonts.css`, which declares every font kept there (`pkg/web/fonts_test.go` holds the two together).
- Behind the book is `img/landscape.png`, a still landscape of the game's world already blurred and darkened as
  the title screen is, so that no filter runs on a phone. It is made once by `node tools/guideLandscape.js`
  (its header says how it chooses where to stand; `--ascii` prints the view as letters) from the generator
  (`js/terrainGen.js`) and the block colours of `pkg/web/viewer_block_palette.json`: run it after changing the
  terrain or those colours. `test/js/guide_landscape.test.js` fails while the committed picture is out of date.

## Words: topic, page, sheet

- A **topic** (ES **tema**) is one entry of the guide: what a number or a secret code opens in the game,
  one Markdown file in each language. Text a player reads never calls it a page.
- A **page** (ES **página**) is one side of paper of the printed book, and nothing else: a topic takes as
  many pages as it needs. (The browser's own page, "reload the page", is the only other use.)
- A **sheet** (ES **hoja**, **folio**) is the piece of paper: two pages, or the four A5 pages of a
  booklet's folio.
- The code uses the same words: `topic` for an entry (`volumeTopics`, `indexTopics`, `data-topic`), `page`
  for a side of paper (`.gp-page`, `pages: { min, max }`) and `sheet` only for the piece of paper. One
  string is older and stays: the browser setting `minecloud-guide-page`, so that nobody loses their place.
- `test/js/guide_words.test.js` fails if a topic says "página" or "page" outside the few phrases it lists.

## Markdown

Supported:

- Headings, paragraphs, **bold**, *italic*, `code`, lists (nested with two spaces), tables, quotes (`>`) and rules
  (`---`).
- Links to topics, `[text](12)` or `[text](27A2)`, and to the web.
- Images on their own line, centred, with the alt text as caption:
  - `![caption](img/picture.png)`: a file in this folder.
  - `![caption](mob:sheep)`: the bestiary portrait of a species, or of an organism (`MICRO_SPECIES`, js/game/microbes.js).
  - `![caption](item:torch)`: the inventory icon of an item.

  The same images inside a sentence or a table cell are drawn as small inline icons.
- The buildings of `/build` (topics 307 to 320) open with `![caption](img/build_<design>.png)`: an isometric
  picture of the whole design, as wide as the text, made by `node tools/guideBuildPictures.js` (its header says how,
  and from which corner each design is seen). After changing a design, run it again and commit the pictures:
  `test/js/guide_build_pictures.test.js` fails while one is out of date.

## Rules

- **One subject per topic:** a mob, an item or a family of item variants, a mechanic, a curiosity.
- **Immutable once a version is stable:** a topic's id always shows the same content. New topics get new ids at the
  end of the public topics, never in between.
- **Radical changes get a new topic.** If a creature or item changes radically (goats can fly now!), write a new
  topic and link back to the old one: "In earlier versions, goats were like this: [Goat (until v2)](32)". The old
  topic links forward to the new one.
- Facts must match the game: check the code (`js/mobSpecies.js`, `js/game/*.js`, `js/world.js`) when in doubt.

## Volumes

On paper the guide comes in **volumes** of 250 to 300 A5 pages, so that a new volume can be printed without
changing the earlier ones.

- **A volume is a run of consecutive topic ids.** Topics are only ever added at the end, so a closed run never
  changes and new topics fall into the last volume by themselves.
- **The manifest** is `volumes.json`: `pages` (the `min` and `max` a volume should have), `skip` (topics never
  printed: topic 0, whose place the generated contents takes; a link to one is printed as plain words),
  `indexTopics` (topics that list others, and so change with every new topic) and `volumes`. Each volume has its
  `volume` number (1, 2, 3...), `from` and `to` (the last one has `"to": null` and takes every topic from its
  `from` on; `from` is the previous `to` + 1), `closed` (a date like `"2026-11-20"` once it is frozen, `null`
  before; the closed ones are the first ones, never the last), `title` and `blurb` in ES and EN, `synopsis` in ES and
  EN (the back of its cover, see below), `colour`
  (`#rrggbb`), `cover` (a `hero`: `mob:<species>`, `item:<type>`, or `model:<name>` for what the game builds with `<name>PortraitModel()`, today the robot; and five `icons` items) and `sections`, one a line: `[from, to, "ES", "EN"]`,
  the titles of its contents, in order, inside its range. A topic beyond the last section of the open volume is
  printed under "More topics"; a closed volume's sections cover every one of its topics.
- **The `volumes/` folder** holds two kinds of hand-written chapter, always in both languages:
  `<n>_recap_ES.md` / `_EN.md` ("Before you start": what earlier volumes taught, printed after the contents of
  volume n) and `<n>_news_ES.md` / `_EN.md` ("What is new": what changed in topics of closed volumes, printed after
  the topics of volume n). Their title is their first `# heading`, and they use the Markdown of the topics. They
  are not topics of the guide: the book and `/guide/index.json` never see them. A volume without them simply has no such
  chapter.
- **A recap** is for a reader who owns only this volume: what the earlier ones taught that this one takes for
  granted, not a summary of them. Every volume after the first has one: 500 to 800 words (the test allows 400 to
  900), every fact linked to the topic that teaches it, and links only to public topics of earlier volumes (never
  topic 0, a secret topic or a topic of its own volume), the same topics in ES and EN (`checkRecaps` in
  `tools/guideVolumes.js`). Write about topics, never about where a volume ends: the cuts may still move.
- **How a topic is cited on paper:** by its number, the one typed in the game. It is the chip at the
  outer corner of each of its pages; a link reads `→ 213` (in the same volume), `→ 34 · vol. 1` (in another one)
  or `→ 306 · vol. 3+` (in a later volume that is not closed yet: volume 3 or a later one). Page numbers, at the
  foot, start again in each volume and only say where a page goes. Each volume has its cover, "How to use this
  book" (with a table of the volumes up to it, never a later one), its contents, its recap, its topics, its news
  and an alphabetical index of the topics of the volumes up to it.
- **The cover** of a volume, printed on cardboard and wrapped round the book, is the print page's second output:
  **Cover** in the toolbar, or `guide-print.html?volume=2&part=cover`. It is one sheet: left to right the **back**
  (the volume's colour, "MineCloud", its number and title, its `synopsis`, "In this volume" with the titles of its
  sections, in two columns from nine on, and at the foot the guide on the web, `mine.holacloud.app/libro` in
  Spanish and `mine.holacloud.app/book` in English), the **spine** (from the top: the cube and the name, the number
  in its colour chip, the title, read from top to bottom, and the cover's `hero` small at the foot; under 5 mm only
  the number) and the **front** (the same design as the cover page inside the book). With every volume chosen it is
  one sheet for each. Three fields: **paper thickness, mm per sheet** (0.10 by default, ordinary 80 g paper);
  **spine, mm**, worked out as the volume's pages (all of them, as the page lays them out to print it: front
  matter, topics and back matter; an odd count rounded up, booklets in folios of four pages) divided by two times
  the thickness, which can be written over by hand (**Automatic** goes back); and **bleed, mm** (3 by default, 0
  allowed), added all round. The sheet is twice the width of a page plus the spine, by the page's height, plus
  the bleed (A5 pages for A5 and the booklets, A4 for A4), and the print style gives the page exactly that size:
  choose the same paper as the book, then **Print**, "Save as PDF", margins "None" and scale 100%. Save one
  volume at a time for a print shop (each sheet has its own size). The arithmetic is `spineFor` and
  `coverSheetSize`. The **synopsis** is 50 to 90 words for a child of about ten, in the second person: what the reader
  will find and be able to do with this volume, every fact as its topics say it, saying "volumen"/"volume" and
  "tema"/"topic" (`checkManifest` in `tools/guideVolumes.js` allows 40 to 100 words).
- **Topics of closed volumes that change.** `volumes.lock.json` is written when a volume is closed, never by hand:
  the range of each closed volume and a hash of every topic of theirs in ES and EN. A topic of a closed volume whose
  text is no longer what the lock holds must be **told** in the open volume's news, as a list item that starts
  with a link to it (`- [Día, noche y clima](8): el sol sale por el este...`), in both languages, or **waived**
  with `node tools/guideVolumes.js minor 8` (a typo, a link to a new topic; a later change asks again). Topics of
  `indexTopics` and `skip` are exempt. `node --test test/js/guide_volumes.test.js` says which topics and what to do;
  `node tools/guideVolumes.js` lists the volumes and those topics.

To close a volume:

1. Lay out the whole book in the browser (`guide-print.html?volume=ALL`, A5, the clear font) and open **Pages
   per volume** in the toolbar: it gives the pages of every section; **Copy report** puts them on the clipboard.
2. In `volumes.json`, set its `to` where its topics come to 250 to 300 pages (its own front and back
   pages come on top: print the volume to see its real total), and its `closed` to today's date.
3. Add the next volume after it, starting at `to` + 1, with `"to": null`, its words, colour, cover and sections.
4. `node tools/guideVolumes.js lock` (it refuses while a change is untold, or when nothing new was closed).
5. Print the volume in ES and EN, A5 and A4, and keep the PDFs.
   Then its cover, now that its pages are known: **Cover** (`&part=cover`) in each language and paper, with the
   thickness of the paper it will really be printed on (ask the print shop for its spine width, and write it in
   **Spine, mm** if it differs), and keep those PDFs too.
6. Commit, and tag the commit (`guide-volume-<n>`).

Until a closed volume has really been printed, its lock may be written anew, as was done when "page" became
"topic": delete `volumes.lock.json` and run `node tools/guideVolumes.js lock` (plain `lock` refuses when no new
volume was closed, on purpose). Once a volume is printed, never: its changes go to the news.

## Topic catalogue

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

Topic 16 is the mobs index. Then one topic per species, in the order they arrived in the game (date of the commit
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

Topic 48 is the items index. One topic per item, or per family when the items are variants of each other.

| Id | ES | EN | Items |
|---|---|---|---|
| 48 | Índice de objetos | Items index | — |
| 49 | Hierba y tierra | Grass and dirt | grass, dirt, tall_grass |
| 50 | Piedra y roca madre | Stone and bedrock | stone, cobblestone, bedrock |
| 51 | Arena, cactus y vidrio | Sand, cactus and glass | sand, cactus, glass, sandstone, cut_sandstone (sandstone in layers) |
| 52 | Agua | Water | water, snow_block, packed_ice (made from ice; snow as ice with air) |
| 53 | Minerales | Ores | coal_ore, iron_ore, gold_ore, and the blocks of copper_ore, tin_ore, zinc_ore, lead_ore, silver_ore |
| 54 | Madera y hojas | Wood and leaves | wood, leaves, planks and the 8 wood kinds (spruce, birch, jungle, acacia, dark_oak, cherry, maple, willow): `*_wood`, `*_planks`, `*_leaves` |
| 55 | Brotes | Saplings | `*_sapling` |
| 56 | Losas | Slabs | `*_slab` (with sandstone_slab and the six `<colour>_glazed_tile_slab`) |
| 57 | Ladrillos | Bricks | brick, stone_bricks, 16 coloured `*_brick`, the six `<colour>_glazed_tile` (blue, white, yellow, green, turquoise, red; glazes coloured by metals) |
| 58 | Lanas de colores | Coloured wool | 16 `*_wool` |
| 59 | Piedras nobles y metales | Fine stones and metals | marble, basalt, slate, limestone, granite, copper_block, iron_block, gold_block, obsidian, concrete, magma_rock (light 10) |
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
| 74 | Huevos de mobs | Mob eggs | `*_egg` (each mob topic has its own egg) |
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

Topic 98 is the curiosities index; curiosity topics follow from 99.

### Topics added later (107–)

New topics after the first edition, listed in their index (16, 48 or 98) and in the contents (0). An extinct
animal (`hiddenUntilDiscovered`, js/mobSpecies.js) is listed in topic 261 instead of 16, and not in B31X.

| Id | ES | EN | Items / topic |
|---|---|---|---|
| 107 | Cultivar trigo | Growing wheat | farmland, wheat_0 … wheat_3 (the crop), how to till, sow and harvest |
| 108 | Semillas de trigo | Wheat seeds | wheat_seeds |
| 109 | Trigo | Wheat | wheat |
| 110 | Pan | Bread | bread |
| 111 | Cubo | Bucket | bucket, water_bucket (in the items index, 48) |
| 112 | Estación meteorológica | Weather station | weather_station; overview of the instruments, how the forecast and the wind work (contents 0 and items index 48) |
| 113 | Termómetro | Thermometer | thermometer (items index, 48) |
| 114 | Barómetro y anemómetro | Barometer and anemometer | barometer, anemometer (items index, 48) |
| 115 | Química | Chemistry | the lab, discovery of its 30 reactions, the 4 known ones (in the contents, 0, and the items index, 48) |
| 116 | Tabla periódica | Periodic table | the 36 `element_*`, each linked to its topic (139–174) |
| 117 | Mesa de laboratorio | Lab bench | lab_bench |
| 118 | Frasco de agua | Water flask | water_flask (and water_bucket from the lab) |
| 119 | Sal | Salt | salt |
| 120 | Lingote de acero | Steel ingot | steel_ingot |
| 121 | Bronce | Bronze | bronze_ingot |
| 122 | Fertilizante | Fertilizer | fertilizer |
| 123 | Agua con gas | Soda water | soda_water |
| 124 | Globo de helio | Helium balloon | helium_balloon |
| 125 | Lámpara de neón | Neon lamp | neon_lamp |
| 126 | Lámpara de argón | Argon lamp | argon_lamp |
| 127 | Pescado en salazón | Salted fish | salted_fish |
| 128 | Herramientas de acero | Steel tools | steel_pickaxe, steel_shovel, steel_axe, steel_sword |
| 129 | Ocre rojo | Red ochre | rust_pigment |
| 130 | Genética | Genetics | genes of tamed animals: dominance, Punnett squares, mutations (in the contents, 0) |
| 131 | Cuaderno de cría | Breeding notebook | breeding_notebook (in the items index, 48) |
| 132 | Astronomía | Astronomy | the night sky (js/game/astronomy.js): constellations, named stars, planets, moon phases, shooting stars, comet and red moon; the sundial and the astrolabe, read with a right click (js/game/palace_decor.js; in the contents, 0, and the furniture index, 223) |
| 133 | Telescopio | Telescope | telescope (in the items index, 48) |
| 134 | Carta estelar | Star chart | star_chart (in the items index, 48) |
| 135 | Hormiga | Ant | the `ant` colony and its anthill (in the mobs index, 16; arrived 2026-11-01) |
| 136 | Granja de hormigas | Ant farm | ant_farm, ant_colony_jar (linked from the mobs index, 16) |
| 137 | Castor | Beaver | mob topic of `beaver` (arrived 2026-11-01), in the mobs index (16) |
| 138 | Presas de castor | Beaver dams | how beavers choose trees, how to protect your builds, dams and lodges (linked from 16 and 137) |
| 139 | Hidrógeno | Hydrogen | `element_h` (Z = 1) |
| 140 | Helio | Helium | `element_he` (Z = 2) |
| 141 | Litio | Lithium | `element_li` (Z = 3) |
| 142 | Berilio | Beryllium | `element_be` (Z = 4) |
| 143 | Boro | Boron | `element_b` (Z = 5) |
| 144 | Carbono | Carbon | `element_c` (Z = 6) |
| 145 | Nitrógeno | Nitrogen | `element_n` (Z = 7) |
| 146 | Oxígeno | Oxygen | `element_o` (Z = 8) |
| 147 | Flúor | Fluorine | `element_f` (Z = 9) |
| 148 | Neón | Neon | `element_ne` (Z = 10) |
| 149 | Sodio | Sodium | `element_na` (Z = 11) |
| 150 | Magnesio | Magnesium | `element_mg` (Z = 12) |
| 151 | Aluminio | Aluminium | `element_al` (Z = 13) |
| 152 | Silicio | Silicon | `element_si` (Z = 14) |
| 153 | Fósforo | Phosphorus | `element_p` (Z = 15) |
| 154 | Azufre | Sulfur | `element_s` (Z = 16) |
| 155 | Cloro | Chlorine | `element_cl` (Z = 17) |
| 156 | Argón | Argon | `element_ar` (Z = 18) |
| 157 | Potasio | Potassium | `element_k` (Z = 19) |
| 158 | Calcio | Calcium | `element_ca` (Z = 20) |
| 159 | Titanio | Titanium | `element_ti` (Z = 22) |
| 160 | Cromo | Chromium | `element_cr` (Z = 24) |
| 161 | Manganeso | Manganese | `element_mn` (Z = 25) |
| 162 | Hierro | Iron | `element_fe` (Z = 26) |
| 163 | Cobalto | Cobalt | `element_co` (Z = 27) |
| 164 | Níquel | Nickel | `element_ni` (Z = 28) |
| 165 | Cobre | Copper | `element_cu` (Z = 29) |
| 166 | Zinc | Zinc | `element_zn` (Z = 30) |
| 167 | Plata | Silver | `element_ag` (Z = 47) |
| 168 | Estaño | Tin | `element_sn` (Z = 50) |
| 169 | Yodo | Iodine | `element_i` (Z = 53) |
| 170 | Wolframio | Tungsten | `element_w` (Z = 74) |
| 171 | Platino | Platinum | `element_pt` (Z = 78) |
| 172 | Oro | Gold | `element_au` (Z = 79) |
| 173 | Mercurio | Mercury | `element_hg` (Z = 80) |
| 174 | Plomo | Lead | `element_pb` (Z = 82) |
| 175 | Rubí | Ruby | ruby |
| 176 | Zafiro | Sapphire | sapphire |
| 177 | Célula solar | Solar cell | solar_cell |
| 178 | Sulfato de cobre | Copper sulfate | copper_sulfate |
| 179 | Latón | Brass | brass_ingot |
| 180 | Pan de oro | Gold leaf | gold_leaf |
| 181 | Espejo de plata | Silver mirror | mirror |
| 182 | Bicarbonato | Baking soda | baking_soda |
| 183 | Cal viva | Quicklime | quicklime, white_stucco, red_stucco (the lime cycle) |
| 184 | Pirita | Pyrite | pyrite |
| 185 | Vidrio de cobalto | Cobalt glass | cobalt_glass |
| 186 | Tintura de yodo | Iodine tincture | iodine_tincture |
| 187 | Bombilla | Light bulb | light_bulb (`light_bulb:on` with power): a 5 W consumer at light level 7 (electricity 204, microscope 238); how a filament bulb works |
| 188 | Fluorita | Fluorite | fluorite |
| 189 | Batería de litio | Lithium battery | battery |
| 190 | Hierro meteórico | Meteoric iron | meteoric_iron |
| 191 | Planos | Blueprints | blueprint, written_blueprint, the blueprint library (L), projecting and building, sharing codes (contents 0 and items index 48) |
| 192 | Cinta métrica | Measuring tape | measuring_tape (items index, 48) |
| 193 | Robot programable | Programmable robot | robot: crafting, placing and picking up, the programming panel, safety rules (contents 0 and items index 48) |
| 194 | Programar el robot | Programming the robot | every instruction and condition, loops for kids, examples: 3×3 tunnel, wall, staircase, bridge |
| 195 | Retos de programación | Coding challenges | 8 challenges with hints, solutions at the end of the topic |
| 196 | Escaleras | Stairs | the 20 `*_stairs` (9 woods, stone, cobblestone, brick, stone brick, sandstone, six glazed tiles); how they are placed (facing, upside down) and climbed (items index, 48) |
| 197 | Puertas y trampillas | Doors and trapdoors | the 9 wooden `*_door`, iron_door, oak_trapdoor, iron_trapdoor; hinges, double doors, opening (items index, 48) |
| 198 | Ventanas | Windows | glass_pane, iron_bars, lattice_screen, paper_screen and how panes join their neighbours (items index, 48; furniture index, 223) |
| 199 | Vallas y portones | Fences and gates | the 9 `*_fence` and `*_fence_gate`; the 1.5-block barrier, opening gates (items index, 48) |
| 200 | Electricidad | Electricity | energy vs power, the four roles, networks, how the server simulates them (contents 0 and items index 48) |
| 201 | Generadores | Generators | solar_panel, wind_turbine, water_wheel, hand_crank, eel_tank, with their numbers |
| 202 | Cables y redes | Wires and networks | copper_wire, wire_post; what a network is, the 512-block limit |
| 203 | Baterías | Batteries | battery_block (and its charge states `battery_block:1` … `:4`) |
| 204 | Consumidores | Consumers | electric_lamp, light_bulb, grow_lamp, electric_motor (and their `:on` states), fridge, chest_freezer |
| 205 | Multímetro | Multimeter | multimeter: how to read a network |
| 206 | Proyectos eléctricos | Electric projects | 5 builds: crank lamp, night lights, windmill farm, water mill, night greenhouse |
| 207 | Interruptores | Switches | lever, push_button, pressure_plate (and their `:on` states); a switch cuts or joins networks (contents 0 and items index 48) |
| 208 | Sensores | Sensors | daylight_sensor (day/night mode), proximity_sensor, rain_sensor |
| 209 | Puertas lógicas | Logic gates | and_gate, nand_gate, or_gate, xor_gate, not_gate: faces, signals, truth tables, timing |
| 210 | Memoria y retardos | Memory and delays | delay_gate (1–4 s), latch (SR); the blinker |
| 211 | Circuitos de ejemplo | Example circuits | 4 builds: street lights, staircase light (XOR), automatic door (OR + delay), alarm (AND) |
| 212 | Lógica para curiosos | Logic for the curious | bits, binary, Boole and Shannon, the half adder, NAND builds every gate, gates in computers |
| 213 | Anguila eléctrica | Electric eel | mob topic of `eel` (arrived 2026-11-02), in the mobs index (16); knifefish, 860 V, electrocytes |
| 214 | Tanque de anguila | Eel tank | eel_tank (`eel_tank:full` with an eel), eel_bucket: catching, the 25/50 W generator, feeding (items index 48, generators 201) |
| 215 | Golem de cobre | Copper golem | mob topic of `copper_golem` (arrived 2026-11-02; mobs index 16, contents 0): copper_golem_core and copper_wrench (items index 48), building, charge, modes, patina and wax |
| 216 | Óxido y pátina | Rust and patina | the chemistry of copper patina and iron rust, protection, home experiments (linked from 162 Fe, 165 Cu, 215) |
| 217 | Empujadores | Motor rams | motor_ram, sticky_ram (and `ram_arm`): facing, pushing up to 12 blocks, what never moves, players on top (contents 0 and items index 48) |
| 218 | Ascensores | Lifts | lift_winch, lift_platform, lift_stop: building the shaft, up and down, call buttons with a latch, stops (any floor, a sensor, the landing door), riding (items index 48) |
| 219 | Proyectos mecánicos | Mechanical projects | 5 builds: secret door, rising step, two-storey lift, night shutter, the lift of a block of flats |
| 220 | Generador de radioisótopos | Radioisotope generator | rtg: a steady 80 W day and night with no fuel (generators 201, electricity 200, items index 48, contents 0); real RTGs: decay heat, half-life, Seebeck thermocouples, Voyager, New Horizons, Curiosity, Perseverance, safety |
| 222 | Controles táctiles | Touch controls | phones and tablets: joystick, drag / tap / hold on the world, Mine, Use, Jump, Sneak, Run, the ☰ menu and the chat bar (contents 0, js/game/touch.js) |
| 223 | Índice de muebles | Furniture | the furniture families (contents 0, items index 48) |
| 224 | Sillas y sofás | Chairs and sofas | oak_chair, birch_chair, dark_oak_chair, stool, bench, `<colour>_sofa`, gilded_throne, lacquer_throne, jade_throne, obsidian_throne (two blocks tall): sitting, pieces that join |
| 225 | Mesas | Tables | table, bedside_table, desk |
| 226 | Cofres y armarios | Chests and wardrobes | chest, barrel, wardrobe (they really store items, on the server), bookshelf, wall_shelf |
| 227 | Cocina y baño | Kitchen and bath | workbench, oven, sink, fridge, chest_freezer, toilet, bathtub; what china is |
| 228 | Luces sin electricidad | Lights without electricity | candle, lantern, table_lamp, floor_lamp, chandelier; how a candle burns |
| 229 | Vidrieras | Stained glass | `<colour>_stained_glass`, `<colour>_stained_glass_pane`; why metal oxides colour glass (links to the element topics) |
| 230 | Alfombras y cortinas | Carpets and curtains | `<colour>_carpet`, `<colour>_curtain` |
| 231 | Cuadros, reloj y adornos | Paintings, clock and ornaments | painting_sunset, painting_peaks, painting_meadow, painting_night, painting_shapes, painting_fish, wall_clock, flower_pot, vase, `<colour>_banner` (16), statue (Marble Bust), globe, fountain, open_book, book_stack, inkwell, scroll, meal_plate, fruit_bowl, tea_set, jug, chessboard, sewing_basket |
| 232 | Espejos | Mirrors | wall_mirror, mirror: real reflection up close (js/game/mirrors.js); how a mirror works, links to 181 |
| 233 | Horno | Oven | oven, roast_mushroom: cooks and thaws on the server with fuel (pkg/network/appliances.go, js/game/appliances.js), recipes and fuels; the Maillard reaction, how an oven heats |
| 234 | Nevera y congelador | Fridge and freezer | fridge (two compartments), chest_freezer, cold_water, cold_milk, cold_soda, ice, frozen_fish, frozen_cooked_fish, frozen_bread; food does not spoil in the game; bacteria and cold, water expanding as it freezes, how a fridge moves heat |
| 235 | Fundición | Foundry | foundry: smelts with coal on the server (pkg/network/appliances.go, js/game/smelters.js), recipes and yields against the C menu; why sand melts into glass, why coal burns hotter than wood |
| 236 | Horno de arco eléctrico | Electric arc furnace | arc_furnace: 150 W only while it has work, coal as an ingredient, silicon and steel, what can power it; how carbon pulls oxygen off silica, how an arc makes 2000 °C, from silicon to chips and solar cells |
| 237 | El mundo pequeño | The small world | overview, all 16 organisms of js/game/microbes.js, rotifers and water fleas (contents 0, mobs index 16, bestiary 5) |
| 238 | El microscopio | The microscope | microscope, glass_slide, micropipette: recipes, the light rule, preparing, the panel (items index 48) |
| 239 | Cómo tomar una muestra | How to take a sample | test_tube, moss, the 21 `sample_*`: habitats and shares, fixed by the place (pkg/network/microscope.go) |
| 240 | Tardígrados | Tardigrades | `tardigrade` (organism), tardigrade_tube: how to find and keep one, its states and body |
| 241 | Criptobiosis | Cryptobiosis | tardigrade_tun: the experiments with the slide and the freezer; what real tuns survive and what they do not |
| 242 | Células vegetales y animales | Plant and animal cells | `plant_cell`, `animal_cell`, the cheek smear |
| 243 | Protozoos y algas | Protozoa and algae | `paramecium`, `amoeba`, `vorticella`, `euglena`, `diatom`, `spirogyra` |
| 244 | Bacterias, casi todas son amigas | Bacteria, nearly all are friends | `soil_bacteria`, `lactobacillus`, `cyanobacteria`; `yeast` and `mushroom_spore`, which are fungi |
| 245 | Bloque luminoso | Glow block | glow_block and its 220 colour states (`:k<kelvin>`, `:rgb<r><g><b>`): decoration that shines and lights nothing, js/game/glow_block.js, pkg/network/glow_block.go (items index 48) |
| 246 | Tinciones | Stains | iodine_tincture and methylene_blue on a slide (pkg/network/microscope.go, `stains` in js/game/microbes.js): what each shows, organism by organism; the price; vital stains (microscope 238, items index 48, contents 0) |
| 247 | Filtros y campo oscuro | Filters and dark-field | cobalt_glass and the stained glass as filters, darkfield_stop: the viewer's own, not spent, not saved; why dark-field needs strong light (microscope 238, items index 48, contents 0) |
| 248 | Cómo encontrar metales | How to find metals | veins and outcrops (pkg/terrain/ores.go): what each ore looks like, in which biome and at what depth (items index 48, contents 0, 53, 59, 115, 235) |
| 249 | Cómo se funden los metales | How metals are smelted | copper_ore, tin_ore, zinc_ore, lead_ore, silver_ore in the foundry and the C menu; heat, zinc's distillation, silver from lead (next to 248) |
| 250 | Un laboratorio que funciona | A laboratory that works | `/build lab`, js/game/construction_lab.js: ten separate networks, what truly runs on the grid and what is decoration, why chests come empty (electricity 200, contents 0) |
| 251 | La mano izquierda | The left hand | `X`, js/game/offhand.js: one unit out of the count, which items and why, carried light on the terrain shader, two tools and two swords, what other players see |
| 252 | Escudo | Shield | shield; left hand only, what it stops per damage type, order with armour |
| 253 | Cultivos e incubadora | Cultures and the incubator | incubator, petri_dish, agar_plate, used_dish, the `culture_*`: plates, inocula, harvest, 20 W only while growing, the place's temperature without power (pkg/network/microbes.go, temperature.go, js/game/cultures.js); agar and Fanny Hesse (items index 48, contents 0) |
| 254 | La curva de crecimiento | The growth curve | the four phases on a log scale, cardinal temperatures (Rosso 1993) per species, the experiment at 10, 30 and 45 °C |
| 255 | Esterilizar: autoclave, filtro y moho | Sterilising: autoclave, filter and mould | autoclave, agar_plate_unsterile, water_filter, sample_filtered, `mould` (organism), culture_mould: spores and 121 °C, contamination, penicillin's clear ring, Fleming's story |
| 258 | Lo que no vive, al microscopio | Lifeless things under the microscope | the specimens (js/game/specimens.js, specimens_text.js, pkg/network/microscope_specimens.go): every family, what 40x and 400x show, the stains on them (microscope 238, contents 0) |
| 259 | Opaco, transparente y amorfo | Opaque, clear and amorphous | transmitted light: edges of clear things, dissolved colour, opaque things black and lit from above only at low power, glass amorphous, alizarin red and polarised light (258, 238, contents 0) |
| 260 | Parcelas | Plots | claim_marker, js/game/claims.js, pkg/network/claims.go: 17 x 17 from bedrock to the sky, one per player, the 32 x 32 spawn area, 8 free blocks to other plots and the spawn area and 5 to the plazas of the portal network, the border and the notice, the marker's panel, what is protected and what the server cannot see (contents 0) |
| 261 | Animales extintos | Extinct animals | index of the extinct species (`hiddenUntilDiscovered`, `ancestorOf` in js/mobSpecies.js), one row each: portrait, name and topic, the living species it is the ancestor of, date; how the bestiary keeps them secret and draws the tree (js/game/bestiary.js; contents 0, mobs index 16, bestiary 5) |
| 262 | Fósiles | Fossils | fossil_rock, fossil_rock_rare, fossil_bones_skull/_spine/_tail, old_bones (pkg/terrain/fossils.go, js/game/fossils.js): what each looks like, layers and how many, the skeleton's line of three in one chunk, what breaking one gives; how a fossil forms, why the dodo is still bone (items index 48, contents 0) |
| 263 | Ámbar | Amber | amber_rock, amber: only under the forest, from y = 3 to y = 12, the glow, what it gives; resin, insects kept whole, no dinosaur DNA, the word electricity (next to 262) |
| 264 | Máquina de revivir | Revival machine | revival_machine (`revival_machine:on` at work), pkg/network/revival.go, js/game/revival.js: the three slots, what starts it (fossils, a signal on its top face, water, not too many animals), its 100 W and what can feed it, the signal in detail, water by size of sea animal, the times, where the animal appears, recipe, a first circuit; why real de-extinction is hard (items index 48, contents 0, consumers 204, next to 262 and 263) |
| 265 | Dodo | Dodo | dodo (js/game/dodo.js), an extinct animal: `fossil_dodo` from old_bones, the bird that walks up to the nearest player within 6 blocks and 8 of its home, taming and its 4 foods, feathers; Mauritius 1598 to about 1662, a pigeon, island tameness, why it died out (extinct animals 261) |
| 268 | Eohippus | Eohippus | eohippus (js/game/eohippus.js), an extinct animal and the ancestor of the horse: `fossil_eohippus` from fossil_rock_rare, a grazer the size of a small dog, tamed with the horse's foods, never ridden; 4 toes and 3, 56 to 50 million years ago, how it became the horse (extinct animals 261) |
| 269 | Kubanochoerus | Kubanochoerus | kubanochoerus (js/game/kubanochoerus.js), an extinct animal and an ancient relative of the pig: `fossil_kubanochoerus` from fossil_rock_rare, the charge when struck (0.7 s to step aside, 3 damage), 24 health; the horn of the males, 1.2 m at the shoulder, the Miocene (extinct animals 261) |
| 266 | Trilobites | Trilobite | trilobite (js/game/trilobite.js), extinct, a common fossil of the rock that needs 4 blocks of water: walks the bed, rolls into a ball when struck; the 'cruise' movement of every sea animal (js/game/sea_animals.js); three lobes, eyes of calcite, the end-Permian extinction (extinct animals 261) |
| 267 | Amonites | Ammonite | ammonite (js/game/ammonite.js), extinct, a common fossil of the rock that needs 6 blocks of water: hangs in mid water and moves in spurts, shell first; chambers of gas, a relative of squid, a clock of stone (extinct animals 261) |
| 270 | Plesiosaurio | Plesiosaur | plesiosaur (js/game/plesiosaur.js), extinct, a skeleton in three pieces that needs 120 blocks of water: 5 blocks long, four flippers, comes up to breathe; the pool it needs; a reptile and no dinosaur, Mary Anning (extinct animals 261) |
| 271 | Lobo terrible | Dire wolf | dire_wolf (js/game/dire_wolf.js), an extinct animal and an ancient relative of the dog: `fossil_dire_wolf` from fossil_rock_rare, hostile, chases from 16 blocks at 2.4 blocks a second, 3 damage, 16 health, the server picks whom it is after; La Brea, 125,000 to 10,000 years ago, a distant cousin by its DNA (extinct animals 261) |
| 272 | Esmilodón | Smilodon | smilodon (js/game/smilodon.js), an extinct animal and an ancient relative of the cat: `fossil_smilodon` from fossil_rock_rare, hostile, comes from 12 blocks at 2 blocks a second, 5 damage, 20 health; the sabres of 28 cm, the ambush, no tiger (extinct animals 261) |
| 273 | Sivaterio | Sivatherium | sivatherium (js/game/sivatherium.js), an extinct animal and an ancient relative of the giraffe: `fossil_sivatherium` from fossil_rock_rare, a grazer 2.8 blocks tall, tamed with the giraffe's leaves, 28 health; ossicones, 2.2 m at the shoulder, the giraffe and the okapi (extinct animals 261) |
| 274 | Titanotylopus | Titanotylopus | titanotylopus (js/game/titanotylopus.js), an extinct animal and an ancient relative of the camel: `fossil_titanotylopus` from fossil_rock_rare, 3.4 blocks tall, lies down, tamed with the camel's foods and then ridden (its own `mount`: eyes at 3.5 blocks, 7.5 blocks a second, 4 blocks of headroom), 30 health; camels are American, the hump is fat (extinct animals 261, riding 7) |
| 292 | Castoroides | Castoroides | castoroides (js/game/castoroides.js), an extinct animal and an ancient relative of the beaver: `fossil_castoroides` from fossil_rock_rare, a beaver the size of a bear that builds nothing, 20 health; incisors of 15 cm, water plants and no dams, why the beaver outlived it (extinct animals 261) |
| 275 | Myotragus | Myotragus | myotragus (js/game/myotragus.js), an extinct animal and an ancient relative of the goat: `fossil_myotragus` from fossil_rock_rare, a slow grazer half a block tall that neither climbs nor rams, tamed with the goat's foods; eyes facing forward, 2 front teeth that never stopped growing, Mallorca until about 4300 years ago, how an island shrinks the big (extinct animals 261) |
| 276 | Argali gigante | Giant argali | argali (js/game/argali.js), an extinct animal and an ancient relative of the sheep: `fossil_argali` from fossil_rock_rare, the ram when struck (0.8 s to step aside, 2 damage and a throw), 20 health, fur with the shears; the argali still lives in Central Asia and the one of the Ice Age in Europe is gone, the horns and their rings, wool is the work of people (extinct animals 261) |
| 277 | Nuralagus | Nuralagus | nuralagus (js/game/nuralagus.js), an extinct animal and an ancient relative of the rabbit: `fossil_nuralagus` from fossil_rock_rare, a walker that never hops and has no burrow, tamed with what a rabbit eats; 8 to 12 kilos, a stiff back, small eyes and ears, Menorca 5 to 3 million years ago, how an island grows the small (extinct animals 261) |
| 283 | Onychonycteris | Onychonycteris | onychonycteris (js/game/onychonycteris.js), an extinct animal and an ancient relative of the bat: `fossil_onychonycteris` from fossil_rock_rare, a ground mob that hovers 1.4 blocks up, lands after 1.5 s in one place and folds its wings; a claw on every finger, flight before echo, Wyoming 52 million years ago (extinct animals 261) |
| 284 | Titanoboa | Titanoboa | titanoboa (js/game/titanoboa.js), an extinct animal and an ancient relative of the snake: `fossil_titanoboa` from fossil_rock_rare, 7 blocks of body that follow the head along its trail, hostile on the ground movement (from 10 blocks, 1.3 blocks a second, 4 damage, 28 health), rears before it bites; Cerrejón, 13 m, how heat makes a snake big (extinct animals 261) |
| 285 | Megalania | Megalania | megalania (js/game/megalania.js), an extinct animal and an ancient relative of the lizard: `fossil_megalania` from fossil_rock_rare, a monitor lizard 4 blocks long, hostile on the ground movement (from 12 blocks, 1.5 blocks a second, 3 damage, 20 health), the tongue it flicks; Australia until 50,000 years ago, 3.5 to 7 m, smelling with a forked tongue (extinct animals 261) |
| 286 | Arquelón | Archelon | archelon (js/game/archelon.js), extinct, an ancient relative of the turtle, a rare fossil of the rock that needs 60 blocks of water: 3 blocks long, rows with its front flippers, comes up to breathe every 45 to 80 s, peaceful; the pool it needs; a shell of leather over a frame of bone, 4.6 m (extinct animals 261) |
| 287 | Beelzebufo | Beelzebufo | beelzebufo (js/game/beelzebufo.js), an extinct animal and an ancient relative of the frog: `fossil_beelzebufo` from fossil_rock_rare, hops as the frog does, the bite back when struck (0.6 s to step aside, a jump of up to 3 blocks, 2 damage), 16 health; Madagascar 70 million years ago, a bite like a wolf's, the horns nobody knows about (extinct animals 261) |
| 288 | Dunkleosteus | Dunkleosteus | dunkleosteus (js/game/dunkleosteus.js), extinct, an ancient relative of the fish, a rare fossil of the rock that needs 60 blocks of water: 3.5 blocks long, hostile to a player in the water (from 9 blocks, 2 blocks a second, 4 damage, 30 health), safe on the shore; the pool it needs; blades instead of teeth, the armoured fishes, 3.5 to 9 m by who measures (extinct animals 261) |
| 289 | Pulmonoscorpius | Pulmonoscorpius | pulmonoscorpius (js/game/pulmonoscorpius.js), an extinct animal and an ancient relative of the scorpion: `fossil_pulmonoscorpius` from fossil_rock_rare, hostile by day and by night from 10 blocks, the tail strike (2 damage and 4 of poison), 12 health, venom sacs; 70 cm, East Kirkton in Scotland 330 million years ago, big eyes to hunt by day, lungs like a book (extinct animals 261) |
| 290 | Mongolarachne | Mongolarachne | mongolarachne (js/game/mongolarachne.js), an extinct animal and an ancient relative of the spider: `fossil_mongolarachne` from fossil_rock_rare, neutral, the warning with its front legs up and the bite when struck (0.6 s to step back, 1 damage), its silk; the biggest fossil spider, 15 cm across, China 165 million years ago, taken for a golden orb-weaver (extinct animals 261) |
| 291 | Callichimaera | Callichimaera | callichimaera (js/game/callichimaera.js), an extinct animal and an ancient relative of the crab: `fossil_callichimaera` from fossil_rock_rare, peaceful, walks forwards rowing with its paddle legs, never sideways nor buried; the size of a coin, huge eyes with no sockets, a larva that grew up without changing, Colombia 95 to 90 million years ago (extinct animals 261) |
| 293 | Hormiga infernal | Hell ant | hell_ant (js/game/hell_ant.js), an extinct animal and an ancient relative of the ant: `fossil_hell_ant` from amber_rock, one big ant and no colony, hostile from 6 blocks, 1 damage, 6 health, jaws that shut upwards against its horn; Haidomyrmex, the prey caught in amber in 2020, the horn hardened with metal, amber of Myanmar 99 million years old (extinct animals 261, amber 263) |
| 294 | Abeja antigua | Ancient bee | ancient_bee (js/game/ancient_bee.js), an extinct animal and an ancient relative of the bee: `fossil_ancient_bee` from amber_rock, one bee with no hive, flies 1 block up, lands after 4 seconds with nowhere to go, never stings; Melittosphex and Discoscapa, 3 mm, half wasp, pollen, bees come from wasps, amber of Myanmar 100 million years old (extinct animals 261, amber 263) |
| 295 | Luciérnaga antigua | Ancient firefly | ancient_firefly (js/game/ancient_firefly.js), an extinct animal and an ancient relative of the firefly: `fossil_ancient_firefly` from amber_rock, one beetle with a body, flies low and lands, its lantern lit from 18:00 to 6:00 with a flare every 2.5 to 4.5 seconds, glow dust; a beetle, the light organ kept in amber, cold light, amber of Myanmar 99 million years old (extinct animals 261, amber 263) |
| 278 | Vegavis | Vegavis | vegavis (js/game/vegavis.js), an extinct animal and an ancient relative of the duck: `fossil_vegavis` from fossil_rock_rare, a small duck of the ground that dabbles, tamed with the duck's foods, feathers; Vega Island 1992, a foot-propelled diver, the oldest voice box, birds that lived alongside the last dinosaurs (extinct animals 261) |
| 279 | Loro Heracles | Heracles parrot | heracles (js/game/heracles.js), an extinct animal and an ancient relative of the macaw: `fossil_heracles` from fossil_rock_rare, a parrot a block tall that never flies, neutral, the warning with wings and beak open and the bite when struck (0.6 s to step back, 2 damage), 16 health; 1 m and 7 kilos, New Zealand 19 to 16 million years ago, taken for an eagle, islands make giants (extinct animals 261) |
| 280 | Águila de Haast | Haastʼs eagle | haast_eagle (js/game/haast_eagle.js), an extinct animal and an ancient relative of the eagle, on the 'glide' movement of every big flyer (js/game/gliders.js): `fossil_haast_eagle` from fossil_rock_rare, circles 8 blocks up within 12 of its home, perches and takes off, never flies under a roof, hostile: a cry, 1.6 s and one dive at 9 blocks a second for 2 damage, then 25 to 40 s without one, safe under a roof, 16 health; the English title is written with the letter apostrophe U+02BC (a file name cannot have the ASCII one); moa, talons of 9 cm, a small eagle that grew, extinct 600 years ago (extinct animals 261) |
| 281 | Argentavis | Argentavis | argentavis (js/game/argentavis.js), an extinct animal and an ancient relative of the vulture, on the 'glide' movement: `fossil_argentavis` from fossil_rock_rare, 5 blocks of wingspan, circles 10 blocks up within 14 of its home, a few wingbeats every 10 to 20 s, perches, peaceful, 20 health; 70 kilos and 5 to 7 m, soaring on rising air, the teratorns, Argentina 9 to 7 million years ago (extinct animals 261) |
| 282 | Búho gigante de Cuba | Cuban giant owl | giant_owl (js/game/giant_owl.js), an extinct animal and an ancient relative of the owl: `fossil_giant_owl` from fossil_rock_rare, an owl on long legs that walks and never flies, neutral, the warning with wings spread and the kick when struck (0.5 s to step back, 2 damage and a throw), 16 health; Ornimegalonyx, 1.1 m and 9 kilos, taken for a running bird in 1954, hutias and young ground sloths, Cuba until 10,000 years ago (extinct animals 261) |
| 298 | Pterosaurio | Pterosaur | pterosaur (js/game/pterosaur.js), an extinct animal with no living relative, on the 'glide' movement: `fossil_pterosaur` from fossil_rock_rare, 5 blocks of wingspan, circles 9 blocks up within 14 of its home, perches, peaceful, 2 colours, 16 health, leather; drawn after Pteranodon: no dinosaur and no bird, a wing of skin on one finger, no teeth, the crest, the first backboned animals to fly, 85 million years ago (extinct animals 261) |
| 296 | Mamut | Mammoth | mammoth (js/game/mammoth.js), an extinct animal with no living relative in the game: a skeleton, `fossil_mammoth_skull`, `_spine` and `_tail` from the three blocks of fossil_bones, weight 6, the commonest skeleton; 3.3 blocks, grazes, the trunk swayed as a tail, neutral: trumpets, 1 s and one charge of about 4 blocks at 6 blocks a second for 4 damage (js/game/charge.js), 48 health, fur and leather; Wrangel Island 4,000 years ago, frozen calves, cave paintings, the Asian elephant (extinct animals 261) |
| 297 | Triceratops | Triceratops | triceratops (js/game/triceratops.js), an extinct animal with no living relative: `fossil_triceratops` from fossil_rock_rare, 6 blocks long and 2.7 tall, three horns and a frill, grazes, neutral: bellows, 1 s and one charge of about 4 blocks at 6.5 blocks a second for 4 damage (js/game/charge.js), 44 health, leather; 68 to 66 million years ago, the skull of 2 m, Tyrannosaurus bites, the asteroid (extinct animals 261) |
| 301 | Gliptodonte | Glyptodon | glyptodon (js/game/glyptodon.js), an extinct animal with no living relative in the game: `fossil_glyptodon` from fossil_rock_rare, a giant armadillo 1.4 blocks tall, the honeycomb of plates, peaceful, tamed with tall grass, wheat or leaves (1 in 3), a slow armoured mount: eyes at 2.7 blocks, 5 blocks a second, 3 blocks of headroom, half the damage of animals to its rider; South America 3 million to 10,000 years ago, a branch of the armadillos (extinct animals 261, riding 7) |
| 302 | Deinoterio | Deinotherium | deinotherium (js/game/deinotherium.js), an extinct animal with no living relative: `fossil_deinotherium` from fossil_rock_rare, an elephant 3.5 blocks tall with the tusks of its lower jaw curving down, big ears, a short trunk, grazes, peaceful, 48 health, leather; 15 to 1 million years ago in Europe, Asia and Africa, 4 m at the shoulder, a distant cousin of the elephants (extinct animals 261) |
| 303 | Diplodocus | Diplodocus | diplodocus (js/game/diplodocus.js, which also holds the body of a giant: walls, the player pushed out of its legs, a heavy step), an extinct animal with no living relative: a legendary skeleton, `fossil_diplodocus_skull`, `_spine` and `_tail` from the three blocks of fossil_bones, weight 2; the biggest mob, 14 blocks long and 5 tall at the hips, eats from the treetops, peaceful, 100 health, leather, tamed with leaves (1 in 3), the slowest mount: eyes at 6.4 blocks, 3 blocks a second, 7 blocks of headroom, room to make for it; 154 to 152 million years ago, 25 m, peg teeth, the casts of Diplodocus carnegii (extinct animals 261, riding 7) |
| 304 | Tiranosaurio | Tyrannosaurus | tyrannosaurus (js/game/tyrannosaurus.js), an extinct animal with no living relative: a legendary skeleton, `fossil_tyrannosaurus_skull`, `_spine` and `_tail` from the three blocks of fossil_bones, weight 1, the rarest; 8 blocks long and 4.2 tall, hostile from 16 blocks, walks after you at 2.2, slow to turn, bites with its jaws for 6, roars 1.2 s and charges in a straight line at 7.5 blocks a second for 7 (js/game/charge.js), 120 health, leather and scale; 68 to 66 million years ago, 12 m, the bite, the arms, Sue, a cousin of the birds (extinct animals 261) |
| 305 | Megalodón | Megalodon | megalodon (js/game/megalodon.js), an extinct animal with no living relative: a legendary skeleton, `fossil_megalodon_skull`, `_spine` and `_tail` from the three blocks of fossil_bones, weight 2, that needs 300 blocks of water; the biggest sea animal, 9 blocks long and 2.5 tall with its fin, hostile to a player in the water (from 14 blocks, 2.2 blocks a second, 5 damage, swims past after a bite, 80 health), chases archelons, ammonites and trilobites, safe on the shore; the water it needs; cartilage, teeth and vertebrae, "big tooth", 15 to 18 m, whales, 23 to 3.6 million years ago, a cousin and no ancestor of the great white (extinct animals 261) |
| 299 | Anomalocaris | Anomalocaris | anomalocaris (js/game/anomalocaris.js), an extinct animal with no living relative: `fossil_anomalocaris` from fossil_rock_rare, that needs 16 blocks of water; 1 block long, flaps that beat in a wave, two spiny arms, eyes on stalks, hostile to a player in the water (from 6 blocks, 1.4 blocks a second, 1 damage, 8 health), chases the trilobites of its water and snaps at them without hurting them; the radiodonts, "strange shrimp" taken for three animals, the Burgess Shale, 16,000 lenses, 520 to 500 million years ago (extinct animals 261) |
| 300 | Meganeura | Meganeura | meganeura (js/game/meganeura.js), an extinct animal with no living relative: `fossil_meganeura` from fossil_rock_rare, a giant griffinfly 0.7 blocks across the wings, flies 1.5 blocks up beating its four wings, lands after 4 seconds with nowhere to go and rests with its wings spread, peaceful, 6 health, fits in a cage; 300 million years ago in France, 70 cm, more oxygen in the air, the end of the Permian (extinct animals 261) |
| 306 | Red de portales | Portal network | portal_plaza, portal_paving, portal_compass, portal_letter_n / _e / _s / _o, portal_star, portal_legend, portal_trim_white / _red / _orange / _yellow / _green, portal_red / _orange / _yellow / _green, js/game/portals.js, pkg/network/portals.go: the 105 plazas (a core of 17 x 17 with a ring of its colour and a margin of 7 for building, level at the highest ground under it, a deck over the sea), the compass rose at the centre, the four posts at the corners of the core that spell the address from top to bottom (a star in the centre), the plaza's colour, the legend (right click on its block, a post or the rose) and the sign over each portal (right click), the effect while the destination loads (rings and voxels rushing past), and 104 portals out and 104 back of four levels (1,000, 10,000, 100,000 and 1,000,000 blocks), addresses of N, S, E, O and the rule that never undoes the way, 4, 3 or 2 portals to go on, the portal back behind whoever arrives and of the colour they came by, colours as a rainbow, walking into a pane, where you arrive, nothing of them breaks, building on a network plaza but not on the central one, no plot on a plaza nor within 5 blocks of one, never built over a plot, where new players appear, the farthest plaza (OOOO, 1,111,000 blocks); powers of ten (contents 0, plots 260) |
| 307 | Castillo | Castle | the castle (js/game/construction_castle.js): 100 blocks a side, moat, nine towers, keep, lit without electricity; defences, spiral stairs, lime mortar (contents 0) |
| 308 | Instituto de investigación | Research institute | the research institute (js/game/construction_lab.js): 56 × 52, three floors, observatory dome, what really works, ten separate networks (250, electricity 200, contents 0) |
| 309 | Gran biblioteca | Grand library | the grand library (js/game/construction_library.js): 45 × 60, four storeys of galleries, stained-glass dome; great libraries, why a dome, Dewey, maps (contents 0) |
| 310 | Bloque de pisos | Apartment block | the apartment block (js/game/construction_apartments.js): 11 floors, 31 homes, a working lift and why it stops at floor 11, roof garden (lifts 218, contents 0) |
| 311 | Casita | Small house | the timber cottage (js/game/constructions.js): one room, 11 × 14 with its yard, a fridge on its own RTG; the kitchen triangle (contents 0) |
| 312 | Salón comunitario | Community hall | the brick market hall on its plaza (js/game/constructions.js): 32 × 30, tie beams, light from the ridge, market maths (contents 0) |
| 313 | Catedral | Cathedral | the Gothic cathedral (js/game/constructions.js): 29 × 54, spires of about 46 blocks, rose window; coloured glass, bronze bells, arches, echo (contents 0) |
| 314 | Sala de exposición de muebles | Furniture showroom | the furniture showroom (js/game/constructions.js): 56 × 52, a one-way route past every piece of furniture with its sign; experiments with light levels, glass, mirrors, joins, electricity (furniture 223, contents 0) |
| 315 | Palacio andalusí | Andalusian palace | the Alcázar del Agua in the desert (js/game/construction_palace_andalusi.js): courtyards of water and tiles, the Hall of Tilings and the 17 wallpaper groups (contents 0) |
| 316 | Palacio barroco | Baroque palace | the symmetric Baroque palace on the plains (js/game/construction_palace_baroque.js): the Hall of Mirrors and the optics cabinet: reflection, facing mirrors, a prism (contents 0) |
| 317 | Palacio oriental | Oriental palace | the Cherry Blossom Palace (js/game/construction_palace_oriental.js): glazed roofs with curled eaves, the koi pavilion and the greenhouse: breeding fish and plants (genetics 130, contents 0) |
| 318 | Palacio de invierno | Winter palace | the Winter Palace of the Aurora in the snow (js/game/construction_palace_nordic.js): onion domes, the weather room, snow that keeps warm, ice that floats, the observatory and the aurora (contents 0) |
| 319 | Palacio maya | Maya palace | the Maya palace in the jungle (js/game/construction_palace_maya.js): great stair, pyramid, ball court; counting in twenties, zero, the two calendars, Venus (contents 0) |
| 320 | Palacio volcánico | Volcanic palace | the Palace of the Volcano (js/game/construction_palace_volcanic.js): basalt columns, obsidian, magma rock, the hall of minerals: the three families of rocks, ores and elements (contents 0) |

### Secret topics

Codes are hinted at in other topics or in the world; no index lists them.

| Code | ES | EN | Hint |
|---|---|---|---|
| 27A2 | Lo que ve el búho a las tres | What the owl sees at three | a riddle on the owl topic (46) |
| UR29 | El fuego que ríe | The laughing fire | a caught wisp whispers it in the chat |
| B31X | El cuaderno completo | The complete notebook | the bestiary shows it once every living animal and creature is discovered |
| SH4D | Antes del alba | Before dawn | a shadow sometimes whispers it as it dissolves at dawn |
| Z3US | El corazón de la tormenta | The heart of the storm | carved in the rubble of a toppled storm golem |
| M0LE | Bajo tus pies | Beneath your feet | an acrostic on the giant mole topic (47) |
| C0M3T | Lo que cruza la noche | What crosses the night | the sky spells it when you watch the comet or the red moon through the telescope; topic 132 hints at it |
