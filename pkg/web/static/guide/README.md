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

The printable guide is `/guide-print.html?lang=ES|EN&paper=A5|A4` (`js/guidePrint.js`): every public page as a
paper book (cover, intro, contents), paginated in JS into sheets numbered from the cover; never the secret
ones. Both share the Markdown renderer of `js/guideMarkdown.js`, so a page reads the same in the book and on
paper.

## Markdown

Supported:

- Headings, paragraphs, **bold**, *italic*, `code`, lists (nested with two spaces), tables, quotes (`>`) and rules
  (`---`).
- Links to pages, `[text](12)` or `[text](27A2)`, and to the web.
- Images on their own line, centred, with the alt text as caption:
  - `![caption](img/picture.png)`: a file in this folder.
  - `![caption](mob:sheep)`: the bestiary portrait of a species, or of an organism (`MICRO_SPECIES`, js/game/microbes.js).
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
| 53 | Minerales | Ores | coal_ore, iron_ore, gold_ore, and the blocks of copper_ore, tin_ore, zinc_ore, lead_ore, silver_ore |
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

New topics after the first edition, listed in their index (16, 48 or 98) and in the contents (0).

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
| 116 | Tabla periódica | Periodic table | the 36 `element_*`, each linked to its page (139–174) |
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
| 132 | Astronomía | Astronomy | the night sky (js/game/astronomy.js): constellations, named stars, planets, moon phases, shooting stars, comet and red moon (in the contents, 0) |
| 133 | Telescopio | Telescope | telescope (in the items index, 48) |
| 134 | Carta estelar | Star chart | star_chart (in the items index, 48) |
| 135 | Hormiga | Ant | the `ant` colony and its anthill (in the mobs index, 16; arrived 2026-11-01) |
| 136 | Granja de hormigas | Ant farm | ant_farm, ant_colony_jar (linked from the mobs index, 16) |
| 137 | Castor | Beaver | mob page of `beaver` (arrived 2026-11-01), in the mobs index (16) |
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
| 183 | Cal viva | Quicklime | quicklime |
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
| 195 | Retos de programación | Coding challenges | 8 challenges with hints, solutions at the end of the page |
| 196 | Escaleras | Stairs | the 13 `*_stairs` (9 woods, stone, cobblestone, brick, stone brick); how they are placed (facing, upside down) and climbed (items index, 48) |
| 197 | Puertas y trampillas | Doors and trapdoors | the 9 wooden `*_door`, iron_door, oak_trapdoor, iron_trapdoor; hinges, double doors, opening (items index, 48) |
| 198 | Ventanas | Windows | glass_pane, iron_bars and how panes join their neighbours (items index, 48) |
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
| 209 | Puertas lógicas | Logic gates | and_gate, or_gate, xor_gate, not_gate: faces, signals, truth tables, timing |
| 210 | Memoria y retardos | Memory and delays | delay_gate (1–4 s), latch (SR); the blinker |
| 211 | Circuitos de ejemplo | Example circuits | 4 builds: street lights, staircase light (XOR), automatic door (OR + delay), alarm (AND) |
| 212 | Lógica para curiosos | Logic for the curious | bits, binary, Boole and Shannon, the half adder, gates in computers |
| 213 | Anguila eléctrica | Electric eel | mob page of `eel` (arrived 2026-11-02), in the mobs index (16); knifefish, 860 V, electrocytes |
| 214 | Tanque de anguila | Eel tank | eel_tank (`eel_tank:full` with an eel), eel_bucket: catching, the 25/50 W generator, feeding (items index 48, generators 201) |
| 215 | Golem de cobre | Copper golem | mob page of `copper_golem` (arrived 2026-11-02; mobs index 16, contents 0): copper_golem_core and copper_wrench (items index 48), building, charge, modes, patina and wax |
| 216 | Óxido y pátina | Rust and patina | the chemistry of copper patina and iron rust, protection, home experiments (linked from 162 Fe, 165 Cu, 215) |
| 217 | Empujadores | Motor rams | motor_ram, sticky_ram (and `ram_arm`): facing, pushing up to 12 blocks, what never moves, players on top (contents 0 and items index 48) |
| 218 | Ascensores | Lifts | lift_winch, lift_platform, lift_stop: building the shaft, up and down, call buttons with a latch, stops (any floor, a sensor, the landing door), riding (items index 48) |
| 219 | Proyectos mecánicos | Mechanical projects | 5 builds: secret door, rising step, two-storey lift, night shutter, the lift of a block of flats |
| 220 | Generador de radioisótopos | Radioisotope generator | rtg: a steady 80 W day and night with no fuel (generators 201, electricity 200, items index 48, contents 0); real RTGs: decay heat, half-life, Seebeck thermocouples, Voyager, New Horizons, Curiosity, Perseverance, safety |
| 222 | Controles táctiles | Touch controls | phones and tablets: joystick, drag / tap / hold on the world, Mine, Use, Jump, Sneak, Run, the ☰ menu and the chat bar (contents 0, js/game/touch.js) |
| 223 | Índice de muebles | Furniture | the furniture families (contents 0, items index 48) |
| 224 | Sillas y sofás | Chairs and sofas | oak_chair, birch_chair, dark_oak_chair, stool, bench, `<colour>_sofa`: sitting, pieces that join |
| 225 | Mesas | Tables | table, bedside_table, desk |
| 226 | Cofres y armarios | Chests and wardrobes | chest, barrel, wardrobe (they really store items, on the server), bookshelf, wall_shelf |
| 227 | Cocina y baño | Kitchen and bath | workbench, oven, sink, fridge, chest_freezer, toilet, bathtub; what china is |
| 228 | Luces sin electricidad | Lights without electricity | candle, lantern, table_lamp, floor_lamp, chandelier; how a candle burns |
| 229 | Vidrieras | Stained glass | `<colour>_stained_glass`, `<colour>_stained_glass_pane`; why metal oxides colour glass (links to the element pages) |
| 230 | Alfombras y cortinas | Carpets and curtains | `<colour>_carpet`, `<colour>_curtain` |
| 231 | Cuadros, reloj y adornos | Paintings, clock and ornaments | painting_sunset, painting_peaks, painting_meadow, painting_night, painting_shapes, painting_fish, wall_clock, flower_pot, vase |
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
| 260 | Parcelas | Plots | claim_marker, js/game/claims.js, pkg/network/claims.go: 17 x 17 from bedrock to the sky, one per player, the 32 x 32 spawn area, the border and the notice, the marker's panel, what is protected and what the server cannot see (contents 0) |

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
| C0M3T | Lo que cruza la noche | What crosses the night | the sky spells it when you watch the comet or the red moon through the telescope; page 132 hints at it |
