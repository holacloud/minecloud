# Fabricar

En MineCloud no hay mesa de trabajo: todo se fabrica desde el **panel de recetas**, estés donde estés.

## El panel de recetas

1. Pulsa **C** para abrirlo. Otra vez **C** o **Escape** lo cierran.
2. Escribe en el **buscador** (*Buscar recetas o #etiquetas...*): busca por el nombre de la receta, del resultado o
   de un ingrediente. Prueba "fish", "torch" o "wool". También busca por etiquetas: mira más abajo.
3. Cada tarjeta muestra lo que fabrica y cuántas unidades ("Creates x4"). Las que no puedes hacer aún salen
   apagadas.
4. Haz clic en una tarjeta para ver sus ingredientes y **cuántos tienes** de cada uno. Los que faltan salen
   marcados.
5. Pulsa **Craft**. Si te falta algo, el botón dice "Missing materials".

Los ingredientes se gastan y el resultado va a tu inventario, a la barra y a tu mano.

## Buscar por etiquetas

El **inventario** (tecla **E**) y el **panel de recetas** (tecla **C**) buscan también por **etiquetas**: la familia
de cada objeto y su color. Una receta tiene las etiquetas de lo que fabrica.

- Escribe `#construcción #azul` y verás lo que es de construcción **y** azul. Cuantas más pongas, menos resultados.
- Se combinan con texto: `#azul brick` da el ladrillo azul. El texto sigue buscando por nombre, en inglés, como siempre.
- Vale en español o en inglés (`#azul` y `#blue` son lo mismo), con mayúsculas o sin ellas y con tilde o sin
  ella: `#construccion` también sirve. Tampoco hace falta terminar la palabra: `#const` ya busca.
- Debajo del buscador hay una línea con las **etiquetas más útiles de lo que estás viendo**: tócalas para añadirlas a
  la búsqueda y vuelve a tocarlas para quitarlas. Primero van las que ya usas y después las que mejor filtran. Las que
  no caben no se muestran, pero puedes escribirlas igual.
- Cada objeto lleva en el borde de su casilla, en letra pequeña, sus etiquetas más concretas, a veces abreviadas
  (`const.` es `#construcción`). La lista completa aparece al dejar el ratón sobre él en el inventario y en el detalle
  de cada receta.
- Cada vez que abres el panel, la búsqueda empieza vacía y con la lista completa.

| Familia | Etiqueta |
|---|---|
| Construir | `#construcción`, `#madera`, `#piedra`, `#metal`, `#vidrio`, `#lana` |
| Minar y terreno | `#mineral`, `#naturaleza` |
| Muebles y casa | `#mueble`, `#almacén`, `#luz`, `#decoración` |
| Electricidad y máquinas | `#eléctrico`, `#lógica`, `#mecanismo`, `#transporte` |
| Equipo | `#herramienta`, `#arma`, `#armadura` |
| Comer y cultivar | `#comida`, `#bebida`, `#cultivo`, `#planta` |
| Animales | `#animal`, `#huevo`, `#fósil`, `#cebo` |
| Ciencia | `#química`, `#elemento`, `#ciencia`, `#microscopio`, `#muestra` |
| Colores | `#blanco`, `#gris-claro`, `#gris`, `#negro`, `#marrón`, `#rojo`, `#naranja`, `#amarillo`, `#lima`, `#verde`, `#cian`, `#azul-claro`, `#azul`, `#morado`, `#magenta`, `#rosa` |

## Recetas básicas

| Resultado | Ingredientes |
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
| 2 `stone` | 1 `cobblestone` + 1 `coal_ore` ([Piedra](50)) |
| `bucket` | 3 `iron_ore` ([Cubo](111)) |

## Familias de recetas

| Familia | Receta | Más en |
|---|---|---|
| ![](item:cherry_planks) Tablones de colores | 1 `*_wood` → 4 `*_planks` | [Madera y hojas](54) |
| ![](item:cherry_sapling) Brotes | 2 `*_leaves` + 1 `dirt` | [Brotes](55) |
| ![](item:stone_slab) Losas | 1 bloque → 2 losas | [Losas](56) |
| ![](item:oak_stairs) Escaleras | 3 bloques → 4 escaleras | [Escaleras](196) |
| ![](item:oak_door) Puertas y trampillas | 6 tablones → 3 puertas; 3 `planks` → 2 trampillas; 2 `iron_ore` → 1 de hierro | [Puertas y trampillas](197) |
| ![](item:glass_pane) Paneles y barrotes | 3 `glass` → 8 paneles; 3 `iron_ore` → 8 barrotes | [Ventanas](198) |
| ![](item:oak_fence) Vallas y portones | 2 tablones + 1 tronco → 3 vallas; 2 tablones + 2 troncos → 1 portón | [Vallas y portones](199) |
| ![](item:red_brick) Ladrillos de colores | 1 `brick` + 1 `sand` → 4 | [Ladrillos](57) |
| ![](item:red_wool) Lanas de colores | 2 `leaves` + 1 `flower_red` → 4 | [Lanas](58) |
| ![](item:marble) Piedras nobles y metales | 2 `stone` o `cobblestone` + 1 `sand` → 2 | [Piedras nobles](59) |
| ![](item:element_au) Elementos | 1 `stone` + 1 `coal_ore` | [Elementos](60) |
| ![](item:iron_pickaxe) Herramientas | 3 del material (2 para la espada) + 1 `wood` | [Picos](68) |
| ![](item:iron_shears) Tijeras | 2 `iron_ore` | [Tijeras](73) |

El material de las herramientas: `planks` (madera), `cobblestone` (piedra), `iron_ore` (hierro) o
`gold_ore` (oro).

## Recetas de los animales

Comida, remedios, curtido, equipo y antorchas de polvo luminoso: ver [Recursos de los mobs](2).

Cebos, caña de pescar, red y jaula: ver [Cebos y trampas](4).

## Recetas del huerto

| Resultado | Ingredientes | Más en |
|---|---|---|
| ![](item:bread) 1 `bread` | 3 `wheat` | [Pan](110) |
| ![](item:bait_seeds) 2 `bait_seeds` | 1 `wheat_seeds` | [Semillas de trigo](108) |

El trigo y las semillas no se fabrican: se cultivan. Ver [Cultivar trigo](107).

## Lo que no se fabrica

- Los **minerales**, la arena o la tierra: se minan. Ver [Minar y construir](10).
- Los **huevos de mob**: se encuentran rompiendo hierba alta u hojas, o se atrapan con la [jaula](96).
- El **frasco de luciérnagas**: se consigue con la [red](95).
