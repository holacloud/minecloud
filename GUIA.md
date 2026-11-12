# Guía de MineCloud

Guía de juego de las mecánicas de fauna: cómo se consigue cada cosa y para qué sirve. Los nombres de objetos
y recetas aparecen tal y como salen en el juego (en inglés).

## Etiquetas: buscar en el inventario y en las recetas

El inventario (E) y las recetas (C) buscan también por etiquetas: `#construcción #azul` son los objetos de construcción
**y** azules, y `#azul brick` añade el texto "brick" (el texto sigue buscando por nombre, como siempre). Valen en
español o en inglés, con tilde o sin ella (`#construccion`), y a medias (`#const`). Debajo del buscador hay una línea con
las etiquetas más útiles de lo que se está viendo, para tocarlas; las que no caben se escriben a mano. Cada casilla
lleva en su borde, en letra pequeña, las etiquetas más concretas de su objeto. Una receta tiene las etiquetas de lo que fabrica. La búsqueda se
vacía cada vez que se abre el panel.

| Familia | Etiqueta |
|---|---|
| Construir | `#construcción`, `#madera`, `#piedra`, `#metal`, `#vidrio`, `#lana` |
| Minar y terreno | `#mineral`, `#naturaleza` |
| Muebles y casa | `#mueble`, `#almacén`, `#luz`, `#decoración` |
| Electricidad y máquinas | `#eléctrico`, `#lógica`, `#mecanismo`, `#transporte` |
| Equipo | `#herramienta`, `#arma`, `#armadura` |
| Comer y cultivar | `#comida`, `#bebida`, `#cultivo`, `#planta` |
| Animales | `#animal`, `#huevo`, `#cebo` |
| Ciencia | `#química`, `#elemento`, `#ciencia`, `#microscopio`, `#muestra` |
| Colores | `#blanco`, `#gris-claro`, `#gris`, `#negro`, `#marrón`, `#rojo`, `#naranja`, `#amarillo`, `#lima`, `#verde`, `#cian`, `#azul-claro`, `#azul`, `#morado`, `#magenta`, `#rosa` |

Casi todas salen solas de los datos de cada objeto (`js/game/item_tags.js`); un objeto nuevo sin familia hace fallar
`test/js/item_tags.test.js`.

## Recursos de los mobs

Los animales y criaturas dan recursos de cuatro formas: al **recolectarlos** con clic derecho, al
**golpearlos**, como **botín al derrotarlos** y, en el caso de los pájaros, **mudando plumas** por su cuenta. Todo
recurso sirve para algo: entra en al menos una receta, se come o protege.

### Recolectar (clic derecho)

| Qué | Con qué en la mano | Sobre | Resultado | Espera |
|---|---|---|---|---|
| Esquilar | `iron_shears` | oveja | 1–3 `white_wool`; la oveja queda esquilada y la lana vuelve a crecer | 150 s |
| Recortar pelo | `iron_shears` | cabra, camello, caballo, perro, gato, zorro, conejo, topo | 1 `fur` | 120 s por animal |
| Ordeñar | `glass` (se gasta) | cabra, camello | 1 `milk` | 60 s por animal |
| Recoger miel | cualquier cosa | colmena | 1–2 `honeycomb` | 120 s por colmena |

**La colmena:** si recoges la miel sin una `torch` en la mano, la colonia se enfada y te persigue. Con una
antorcha en la mano el humo calma a las abejas, y también las tranquiliza si ya estaban enfadadas.

### Golpear sin matar

Algunos animales sueltan algo al golpearlos, con cierta probabilidad y una espera por animal:

| Animal | Suelta | Probabilidad | Espera |
|---|---|---|---|
| Pato, guacamayo, búho, buitre | `feather` | 40 % | 8 s |
| Águila | `feather` | 50 % | 8 s |
| Lagarto | `scale` | 35 % | 10 s |
| Tortuga | `shell` | 15 % | 60 s |
| Luciérnagas | `glow_dust` | 30 % | 20 s |
| Banco de peces | captura un pez: `raw_fish` | 20 % | — |

Además, los patos, guacamayos, búhos y buitres cercanos sueltan de vez en cuando una pluma por su cuenta.

### Botín al derrotar

Solo hay botín cuando el mob lo derrota el jugador. Las presas de depredadores (zorro, búho, águila) no dejan
nada. Donde hay porcentaje, es la probabilidad de que salga ese objeto.

Daño de cada golpe del jugador: **4** a mano (o con cualquier objeto que no sea una espada), **5** con
`wood_sword`, **6** con `stone_sword`, **7** con `iron_sword` y **8** con `gold_sword`. Los animales pacíficos
tienen 12 de vida: **3 golpes** a mano, 2 con una espada de piedra o mejor. La serpiente recibe la mitad de cada
golpe. Una abeja cae al primer golpe (la colmena no se puede destruir); los bancos de peces, las nubes de
luciérnagas y el fuego fatuo no tienen vida.

| Mob | Botín |
|---|---|
| Oveja | 1–2 `white_wool` |
| Pato, guacamayo | 1–3 `feather` |
| Águila, buitre | 2–3 `feather` |
| Cerdo, jirafa, caballo | 1–2 `leather` |
| Camello | 1–2 `leather`, `fur` (50 %) |
| Cabra | 1 `leather`, 1 `fur` |
| Murciélago | `leather` (50 %) |
| Perro, gato, conejo | 1 `fur` |
| Tortuga | 1 `shell` |
| Lagarto | 1–2 `scale` |
| Rana | `venom_sac` (15 %) |
| Abeja | `honeycomb` (10 %) |
| Araña | `venom_sac` (50 %), `white_wool` (30 %) |
| Monstruo de cueva | 1–3 `leather`, `glow_dust` (50 %) |
| Escorpión | `venom_sac`, `shell` (25 %) |
| Serpiente | 1–2 `scale`, `venom_sac` (60 %) |
| Cangrejo | 1–2 `shell` |
| Zorro | 1–2 `fur` |
| Búho | 1–3 `feather` |
| Topo gigante | 1–2 `fur` |
| Golem de tormenta | 2–3 `glow_dust`, 1–2 `iron_ore` |
| Sombra errante | 1–2 `shadow_essence` |
| Fuego fatuo | `glow_dust` al atraparlo; lo suelta él mismo |

**La sombra errante:** si la ahuyentas con luz (antorcha) en lugar de desterrarla a golpes, hay un 50 % de que deje
1 `shadow_essence`, siempre que estés a menos de 16 bloques.

### Recetas

| Resultado | Ingredientes |
|---|---|
| `cooked_fish` | `raw_fish` + `coal_ore` |
| `honey_bottle` | `honeycomb` + `glass` |
| `cheese` | 2 `milk` |
| `antivenom` | `venom_sac` + `milk` |
| `leather` (curtir) | 2 `fur` + `wood` |
| `warm_coat` | 3 `leather` + 2 `fur` |
| `scale_mail` | 6 `scale` + 2 `leather` |
| `feather_cape` | 6 `feather` + 2 `white_wool` |
| `bed` (de plumas) | 4 `feather` + 2 `white_wool` + 3 `planks` |
| 4 `torch` | `glow_dust` + `wood` |
| 4 `limestone` | `shell` + `sand` |
| 2 `obsidian` | `shadow_essence` + 2 `stone` |

### Comida y remedios (tecla G)

| Objeto | Vida | Efecto |
|---|---|---|
| `raw_fish` | +1 | — |
| `cooked_fish` | +6 | — |
| `honey_bottle` | +5 | devuelve el `glass` |
| `cheese` | +7 | — |
| `milk` | +2 | quita el veneno; devuelve el `glass` |
| `antivenom` | +1 | quita el veneno y da **3 minutos de inmunidad** al veneno; devuelve el `glass` |

### Equipo pasivo

Basta con llevarlo en el inventario; no hace falta equiparlo. Pulsar G con una prenda explica en el chat lo que
hace.

| Prenda | Efecto |
|---|---|
| `warm_coat` | −1 de daño por cada ataque de criatura |
| `scale_mail` | −2 de daño por cada ataque de criatura, sin bajar nunca de 1 |
| `feather_cape` | −60 % de daño por caída |
| `shield` | solo en la mano izquierda: −50 % de los ataques de criaturas de frente (después de restar la armadura); ver «La mano izquierda» |

Si llevas el abrigo y la cota a la vez, solo cuenta la mejor de las dos.

### Consejos

- **Contra el veneno** (serpientes, escorpiones): lleva `milk` o, mejor aún, `antivenom` antes de entrar en el
  desierto o la roca.
- **Plumas y lana** para la `feather_cape`: las plumas se consiguen sin matar a nadie, golpeando patos o esperando a
  que muden; la lana, esquilando ovejas.
- **Antorchas sin carbón:** el `glow_dust` de las luciérnagas o de un fuego fatuo atrapado da 4 antorchas con un
  solo `wood`.

## Domesticar y criar

### Domesticar

Coge en la mano la comida que le gusta al animal y haz clic derecho sobre él. Cada intento gasta una unidad.

- **Si sale bien:** aparecen corazones y el mensaje "You tamed the …!".
- **Si falla:** sale humo gris. Prueba otra vez.

| Animal | Comida | Probabilidad por intento |
|---|---|---|
| Oveja | `tall_grass`, `wheat`, `flower_yellow`, `leaves` | 1/3 |
| Pato | `tall_grass`, `wheat_seeds`, `raw_fish`, `flower_yellow` | 1/3 |
| Cerdo | `mushroom_brown`, `mushroom_red`, `wheat`, `honeycomb` | 1/3 |
| Jirafa | `acacia_leaves`, `leaves`, `jungle_leaves`, `birch_leaves` | 1/4 |
| Perro | `raw_fish`, `mushroom_brown` | 1/2 |
| Gato | `raw_fish`, `milk`, `cold_milk`, `mushroom_brown` | 1/2 |
| Guacamayo | `flower_red`, `flower_yellow`, `cherry_leaves` | 1/3 |
| Camello | `cactus`, `tall_grass`, `wheat` | 1/3 |
| Cabra | `leaves`, `tall_grass`, `wheat` | 1/3 |
| Caballo | `tall_grass`, `wheat`, `flower_yellow`, `honeycomb` | 1/4 |

Solo se domestican los de esta tabla. Las criaturas hostiles (araña, escorpión, serpiente, sombra…) y los animales
salvajes con comportamiento propio (zorro, conejo, búho, topo gigante, cangrejo, rana, lagarto, tortuga, castor, peces,
aves rapaces, abejas, hormigas, murciélagos, fuego fatuo…) no se pueden domesticar. Si les ofreces comida, no se gasta.

### Animales domesticados

- **Te siguen** y se reparten a tu alrededor, cada uno con el sitio que ocupa su cuerpo. Si te alejas más de 20 bloques
  o se atascan, reaparecen en un hueco libre cerca de ti.
- **Sentarse y quedarse quietos:** clic derecho con la mano vacía. Otro clic vuelve a ponerlos a seguirte.
  - En el caballo es **Shift + clic**, porque el clic normal lo monta.
- **No desaparecen** al alejarte, a diferencia de los salvajes.
- **Se guardan** en el navegador: al recargar la página vuelven a su sitio, incluidos los sentados y las crías. No
  se comparten con otros jugadores.
- El perro y el gato siguen haciéndose amigos tuyos solos, como antes. Domesticarlos permite además sentarlos.
- Una cabra domesticada deja de embestirte y te sigue saltando por las rocas.

### Criar

1. Dale de comer a un animal **domesticado y adulto**: entra en modo amor durante 20 s, con corazones.
2. Si hay otro de su especie en modo amor a menos de 8 bloques, se buscan y nace una **cría**.
3. Cada padre necesita **2 minutos** de descanso antes de volver a criar (dice "not hungry").

La cría:

- Nace a la mitad de tamaño y crece hasta adulta en unos **5 minutos**. Darle de comer acelera el crecimiento.
- Sigue a uno de sus padres.
- No puede criar ni ser montada hasta que crece ("too young to ride").
- Hereda los genes de sus padres: color del pelaje, tamaño de adulta y velocidad (ver Genética).

### Genética

Cada animal domesticado lleva tres genes, con dos alelos cada uno (uno de cada padre):

- **Pelaje:** una cadena de dominancia por especie (cabra: blanco > marrón; caballo: tordo > castaño > negro >
  alazán; gato: atigrado > naranja > crema; guacamayo: verde > azul > rojo > amarillo) y el alelo raro albino,
  recesivo ante todos.
- **Tamaño:** `L` / `l` con dominancia incompleta: `LL` grande (×1,15), `Ll` normal, `ll` pequeño (×0,85).
- **Velocidad:** `N` normal > `f` rápido > `s` lento (×1, ×1,3, ×0,75), también al galopar.

Los salvajes reciben genes al azar que concuerdan con su color al domesticarlos. El 2 % de las crías nace con una
mutación: uno de sus alelos de pelaje pasa a albino. El **cuaderno de cría** (`breeding_notebook`: 2 `planks` + 1
`feather`), con clic derecho sobre un domesticado, muestra su genotipo, fenotipo, padres y abuelos y, tras leer a
otro de la misma especie, el cuadro de Punnett de sus crías.

### Convivencia con otros usos del clic derecho

- Las `iron_shears` siguen esquilando y el `glass` sigue ordeñando (ver Recursos de los mobs).
- La mano vacía sienta a los domesticados.
- El cuaderno de cría lee sus genes.
- Con el caballo, el clic con la mano vacía sigue montándolo.

## Cebos y trampas

### Recetas

| Resultado | Ingredientes |
|---|---|
| 4 `bait_seeds` | 2 `tall_grass` |
| 2 `bait_seeds` | `wheat_seeds` |
| 3 `bait_worms` | 2 `dirt` |
| 2 `bait_meat` | `leather` + `mushroom_brown` |
| 2 `bait_fish` | `raw_fish` |
| 2 `bait_honey` | `honeycomb` |
| `fishing_rod` | 2 `wood` + `iron_ore` |
| `bug_net` | `wood` + 2 `white_wool` |
| `cage_trap` | 4 `planks` + 2 `iron_ore` |

El `firefly_jar` no se fabrica: se consigue cazando luciérnagas con la red.

### Cebos

Con un cebo en la mano, haz clic derecho en el suelo para dejar un montoncito.

- Dura **2 minutos** y atrae a los animales que les gusta en un radio de **16 bloques**.
- Los animales acuden, comen bajando la cabeza y el montón va encogiendo.
- Después se quedan por la zona entre 25 y 40 segundos.

| Cebo | Atrae a |
|---|---|
| `bait_seeds` | oveja, pato, cerdo, jirafa, guacamayo, camello, cabra, caballo, castor, hormiga |
| `bait_worms` | pato, cerdo, rana, tortuga, lagarto, escorpión (y los peces, pero solo en el anzuelo de la caña) |
| `bait_meat` | perro, gato, araña, monstruo de cueva, hormiga |
| `bait_fish` | gato, tortuga, cangrejo |
| `bait_honey` | abeja (liban el cebo en lugar de las flores), hormiga |

Los animales salvajes con comportamiento propio (zorro, conejo, búho, buitre, águila, serpiente, topo gigante) no van
hacia los cebos, y por eso ni su ficha del bestiario ni el aviso «Lures: …» del chat los nombran: su
movimiento no atiende a `getMobGoal`. Solo si uno pasa por casualidad a menos de 1,4 bloques lo mordisquea. Las mascotas
que te siguen también los ignoran. Las hormigas no vienen sueltas: si el cebo está cerca, abren un camino hasta él.

### Jaula (`cage_trap`)

1. Haz clic derecho en el suelo para colocarla. La puerta queda mirando hacia ti.
2. Con un cebo en la mano, haz clic derecho sobre la jaula vacía para meterlo dentro.
3. Cuando un animal entra a comer, la puerta se cierra de golpe y el animal queda atrapado.
4. Haz clic derecho sobre la jaula o sobre el animal atrapado y obtendrás **el huevo de ese animal** y la jaula.

Si la jaula está vacía y no llevas un cebo en la mano, el clic derecho la recoge.

**Caben:** oveja, pato, cerdo, perro, gato, araña, rana, tortuga, lagarto, escorpión, cabra, cangrejo, castor, zorro,
conejo, serpiente y topo gigante. Estos cuatro últimos no van hacia el cebo: solo caen si pisan la jaula por casualidad.

**No caben:** los animales grandes, los voladores y los peces.

**Nunca caen:** los animales domesticados y los que se montan (el cebo de una jaula tampoco atrae a las mascotas).
A las ranas, los lagartos y las tortugas, que se mueven a su manera, el cebo de la jaula los empuja hasta el centro.

Las jaulas, también con su animal dentro, se guardan al recargar la página. Solo existen en tu navegador.

### Caña de pescar (`fishing_rod`)

1. Haz clic derecho apuntando al agua (hasta 9 bloques) para lanzar. Verás el sedal y el corcho.
2. Espera a que pique: el corcho se hunde, salpica y suena.
3. Tienes **1,1 segundos** para recoger con otro clic derecho.

| Captura | Probabilidad |
|---|---|
| `raw_fish` | 72 % |
| `shell` | 12 % |
| Basura (`leaves`, `wood`, `dirt` o `tall_grass`) | resto |

**Para que piquen antes:**

- Lleva `bait_worms` o `bait_fish` en el inventario. Se gasta uno por lanzamiento.
- Pesca cerca de un banco de peces. Los peces se acercan nadando.

El sedal se corta si cambias de objeto o te alejas.

### Red (`bug_net`)

Haz clic derecho con la red sobre una criatura pequeña cercana (hasta 4,5 bloques):

| Criatura | Obtienes |
|---|---|
| Luciérnagas | `firefly_jar` (la nube pierde luciérnagas y desaparece si quedan pocas) |
| Abeja | `bee_egg` |
| Murciélago | `bat_egg` |
| Fuego fatuo | `glow_dust` |
| Hormiguero | `ant_colony_jar` |

### Frasco de luciérnagas (`firefly_jar`)

- Haz clic derecho en el suelo para colocarlo. Es una lámpara: las luciérnagas parpadean dentro y brillan, con bloom
  en Ultra.
- Clic derecho sobre el frasco: lo recoges.
- Clic derecho con la red: liberas las luciérnagas.

Los frascos colocados se guardan al recargar la página.

## Bestiario

Un cuaderno de campo con todo lo que vive en el mundo: 35 animales y criaturas y 16 organismos microscópicos, 51 tarjetas
en total, en el idioma del juego (`js/game/bestiary_text.js`).

- **Abrir:** tecla **B**, o el botón "Bestiario (B)" del menú de pausa.
- **Cerrar:** Escape, B, el botón "Cerrar" o un clic fuera del panel.

### Descubrir especies

Una especie queda descubierta cuando la ves de cerca: a menos de 12 bloques y mirando hacia ella, o a menos de 2,5
bloques aunque no la mires. Al descubrir una nueva aparece el aviso "Nueva entrada en el bestiario: …" con un acorde suave.
Derrotar a una criatura que aún no conocías también la descubre.

### Qué muestra

- **Cuadrícula de tarjetas:**
  - Las especies descubiertas aparecen con su retrato en color, hecho con su propio modelo.
  - Las que faltan salen como una silueta negra con "???" y una pista de dónde encontrarlas.
  - Arriba se ve el progreso, por ejemplo "12 / 51 descubiertas".
- **Ficha de cada especie:**
  - El modelo girando en 3D.
  - Una descripción de su comportamiento y de cómo interactuar con ella.
  - Etiquetas de temperamento (pasivo, amistoso, neutral u hostil) y de actividad ("Actividad: de día"…).
  - Hábitat.
  - Las tablas de las otras mecánicas: **Dieta** (con qué se domestica; solo sale en los que se pueden domesticar),
    **Botín** (qué recursos da) y **Cebos** (los que le hacen acudir; solo sale en los que van hacia un cebo;
    en los peces, **Cebo de anzuelo**: lo que se pone en la caña).
  - Número de encuentros, criaturas derrotadas y fecha del primer avistamiento.

Solo cuentan como derrotadas las criaturas que derrota el jugador, no las que cazan otros animales. El progreso
se guarda en el navegador.

Los 16 organismos del [microscopio](#microscopio-y-tardígrados) son tarjetas más, pero solo se descubren
identificándolos en su panel. Su ficha enseña su dibujo animado y su tamaño real, sin temperamento, dieta, objetos ni
derrotas. No cuentan para el cuaderno completo: el contador suma las 51 tarjetas, pero el aviso "¡Tu bestiario está
completo!" y el código de la última página (`B31X`) solo miran los 35 animales y criaturas, y pueden salir con el contador
en "35 / 51". Uno de esos 35, el golem de cobre, no aparece solo: hay que construirlo, o sacarlo de su huevo.

## Cultivos

1. **Semillas:** al romper `tall_grass` cae además `wheat_seeds` el 35 % de las veces.
2. **Labrar:** clic derecho con cualquier azada (`*_hoe`) en `grass` o `dirt` sin nada encima: se convierte en
   `farmland` (tierra de cultivo). Al romperla devuelve `dirt`.
3. **Sembrar:** clic derecho con `wheat_seeds` en la `farmland`: brota el trigo.
4. **Crecer:** pasa por cuatro fases, de 50 a 90 s cada una (madura en unos 2,5–4,5 minutos). Lo hace crecer el
   servidor, así que todos los jugadores ven lo mismo y sigue creciendo aunque no haya nadie.
5. **Cosechar:** el trigo maduro (dorado) da 1 `wheat` y 1–2 `wheat_seeds`; el que no está maduro devuelve su
   semilla.

| Resultado | Ingredientes |
|---|---|
| `bread` (+5 de vida con G) | 3 `wheat` |
| 2 `bait_seeds` | `wheat_seeds` |

El `wheat` doma y enamora a ovejas, cerdos, camellos, cabras y caballos; las `wheat_seeds`, a los patos.

## Tiempo y estación meteorológica

El chaparrón del día (uno de cada veinte días) se decide al amanecer a partir del número de día: llueve a la vez
para todos y se puede pronosticar. El viento es el mismo para todos (sigue al reloj del mundo): cambia de dirección
despacio, sopla más en lo alto y antes y durante la lluvia, y casi nada bajo techo o en cuevas.

| Resultado | Ingredientes |
|---|---|
| `thermometer` | 2 `glass` + 1 `element_hg` |
| `barometer` | 1 `glass` + 1 `element_hg` + 2 `planks` |
| `anemometer` | 1 `copper_block` + 1 `iron_ore` + 1 `planks` |
| `weather_station` | 1 `thermometer` + 1 `barometer` + 1 `anemometer` + 1 `glass` + 2 `planks` |

- **En la mano**, cada instrumento muestra sus lecturas en un panel abajo a la derecha; **clic derecho** las
  escribe en el chat.
- **Termómetro:** según el bioma, la hora, la altitud, la lluvia, el agua y las cuevas.
- **Barómetro:** presión y tendencia, y el pronóstico ("Rain expected today around 16:15", "Clear skies
  today"); la presión baja en las tres horas previas al chaparrón, deprisa en la última. Avisa "Storm brewing"
  cuando puede nacer un golem de tormenta.
- **Anemómetro:** velocidad (m/s, km/h, Beaufort) y de dónde viene el viento.
- **Estación:** es un bloque de dos de alto que se monta encima de otro; la veleta y las cazoletas siguen al viento y
  el pluviómetro mide la lluvia del día. Al mirarla muestra todo; clic derecho, informe en el chat; se rompe como
  cualquier bloque, y también cae si se rompe el de debajo. Se guarda en el servidor y la ven todos. Las que quedaban
  en el navegador de cada jugador pasan solas al mundo cuando este pasa cerca.

## Microscopio y tardígrados

Páginas 237 a 244 de la guía del juego.

| Resultado | Ingredientes |
|---|---|
| `microscope` | 2 `glass` + 1 `copper_block` + 1 `iron_ore` + 1 `planks` |
| `microscope` (hierro) | 2 `glass` + 2 `iron_ore` + 1 `planks` |
| 3 `test_tube` | 1 `glass` |
| 4 `glass_slide` | 1 `glass` |
| `micropipette` | 1 `glass` + 1 `leather` |
| `tardigrade_tube` | 1 `tardigrade_tun` + 1 `water_flask` |

- **Tomar una muestra:** `test_tube` con clic derecho sobre agua o musgo. El bloque se queda. Lo que lleva lo decide el
  servidor y queda escrito en el tipo del objeto (`sample_<hábitat>_<a|b|c|d>`): el mismo sitio da siempre lo mismo.

| Dónde | Muestra | Sitios con tardígrado |
|---|---|---|
| Agua que no es la del terreno de esa columna | `sample_still_water` | ninguno |
| Lago con `Mountain ≥ 0,10` | `sample_mountain_lake_*` | 50 % |
| Lago con `Forest ≥ 0,5` | `sample_forest_lake_*` | 35 % |
| Lago con `Desert ≥ 0,5` | `sample_oasis_*` | ninguno |
| Otro lago | `sample_plains_lake_*` | ninguno |
| `moss` (orillas de lagos de bosque y montaña) | `sample_moss_*` | 60 % |

- **Preparar:** con algo observable seleccionado (una muestra, hojas, `wheat`, `milk`, `cheese`, setas, flores, `dirt`,
  `honeycomb`, lana, `raw_fish`) y el microscopio libre, clic derecho (en táctil, tocar): gasta un `glass_slide`, prepara
  y abre el panel. Sin portaobjetos, lo dice y cómo se hacen. Con uno ya puesto, solo lo enseña y avisa de que hay que
  retirarlo: nunca lo cambia. Con un `glass_slide` seleccionado y el microscopio libre: frotis de la propia mejilla. Con
  otra cosa y el microscopio libre no se abre nada, y un mensaje dice qué hacer. El tubo vacío se devuelve.
- **Retirar y cerrar:** el panel solo existe con un portaobjetos. Retirarlo lo devuelve lavado y cierra el panel. Escape
  o ✕ cierran y lo dejan puesto: sigue secándose y lo ve quien mire después.
- **Disposición:** en pantalla ancha (de 5:4 en adelante) el campo, tan alto como cabe, va a la izquierda, y a la derecha
  queda una columna de al menos 340 px (o el 45 % del panel, en pantallas pequeñas): arriba el estado del portaobjetos y
  la descripción de lo seleccionado, o sin selección una pista y la luz; al pie, los aumentos, el enfoque y la barra de
  iconos. En pantalla estrecha va todo en una columna: el campo, la ficha sobre él y los controles debajo.
- **Panel:** el campo ocupa casi todo. Todo lo demás son iconos en una barra abajo (aumento, retirar, gota, capturar,
  tinción, filtro, campo oscuro, guía), con nombre debajo y tooltip, siempre los mismos. El que no se puede usar sale gris
  y al pulsarlo dice por qué: la gota, mientras el portaobjetos sigue mojado; capturar, sin un tardígrado seleccionado. Tinción y filtro abren un recuadro sobre su icono, que Escape cierra antes
  que el panel. Está en el idioma del juego (`js/gameLang.js`, en la guía y en el menú de pausa); el bestiario también
  (`js/game/bestiary_text.js`); el inventario y las recetas siguen en inglés.
- **Luz:** sin luz, el campo se ve negro. Sirve el sol de día con el bloque al aire libre, o cualquier cosa que dé luz a
  dos bloques o menos. `light_bulb` (5 W, luz de nivel 7, `light_bulb:on`) y `electric_lamp` (10 W, nivel 14) necesitan
  corriente; si hay una apagada al lado, el panel lo dice. La bombilla ilumina el campo más tenue que la lámpara o el sol.
- **Mirar:** arrastrar mueve la platina; botones (encima del enfoque) o pellizco, 40×, 100×, 400× y 1000×; barra o rueda, el
  enfoque. 1000× es un objetivo de aceite en la realidad; aquí no pide aceite. Lo que se identifica a 400× se ve de cerca. Clic en un
  organismo: lo identifica y lo apunta en el bestiario.
- **Capturar:** con `micropipette` y un `test_tube` vacío, un tardígrado seleccionado pasa a `tardigrade_tube`, o a
  `tardigrade_tun` si el portaobjetos está seco.
- **Criptobiosis:** un portaobjetos se seca en un día de juego (240 s). Lo demás muere o se enquista; el tardígrado queda
  en barrilito, y una gota de `water_flask` lo revive en unos 20 s. El congelador también hace `tardigrade_tun`.
- Sin premio, y ningún microbio hace daño al jugador. Nada cambia en el inventario.

### Tinciones, filtros y campo oscuro

Páginas 246 y 247 de la guía del juego.

| Resultado | Ingredientes |
|---|---|
| `methylene_blue` | 1 `coal_ore` + 1 `element_s` + 1 `water_flask` |
| `darkfield_stop` | 1 `glass_slide` + 1 `coal_ore` |

`iodine_tincture` sigue saliendo de la mesa de laboratorio (2 I + 1 `glass`).

- **Tinción:** con un portaobjetos puesto, su recuadro pregunta primero y avisa del precio. La aplica el servidor (`microscopeStain`), se guarda en la preparación y la ven todos los que miren. Una por portaobjetos; el frasco se gasta y devuelve su `glass`; al retirar el portaobjetos se va.
- **Lo que cuesta:** un portaobjetos teñido queda fijado. Nada se mueve ni se seca, y el servidor rechaza capturar y echar una gota: un tardígrado teñido no revive. Es una regla del juego: en la realidad hay tinciones vitales, en dosis muy bajas.
- **Lo que enseña, por organismo** (`stains` en `microbes.js`):

| Tinte | Almidón (células vegetales, pirenoides de espirogira, granos de `wheat`) | Resto |
|---|---|---|
| `iodine_tincture` | azul negro | amarillo pardo; glucógeno pardo rojizo en levadura, cianobacterias y células animales; la euglena guarda paramilón y sus granos quedan pálidos |
| `methylene_blue` | no cambia | núcleos azul oscuro; bacterias y levadura azules enteras; las esporas de bacteria quedan como huecos claros |

- **Filtros:** en su recuadro, de lo que lleves: `cobalt_glass`, `<color>_stained_glass` y `<color>_stained_glass_pane`. Multiplican el color de la luz junto con el de la lámpara. No se gastan; son de cada jugador y no se guardan.
- **Campo oscuro:** con `darkfield_stop` encima, se activa con su icono. No se gasta; es de cada jugador y no se guarda. Fondo negro, bordes brillantes, y un brillo que depende de la luz del campo:

| Nivel de luz del campo | Fuente | Brillo |
|---|---|---|
| 0,70 | `light_bulb` | 0,31: muy tenue |
| 0,77 | `candle` | 0,53: flojo |
| 0,88 o más | lámpara de mesa, `lantern`, `electric_lamp`, sol pleno | 0,87 a 1: bueno |

### Lo que no vive, al microscopio

Páginas 258 y 259 de la guía del juego (`js/game/specimens.js`, `js/game/specimens_text.js`,
`pkg/network/microscope_specimens.go`). Más de 170 objetos sin nada vivo van a un portaobjetos como cualquier muestra
(gastan un `glass_slide` y uno del objeto; la `honey_bottle` devuelve el `glass`). No se secan, no hay nada que
identificar ni capturar, y no tienen ficha en el bestiario. Bajo el campo, una línea dice qué es y qué enseña el aumento
actual, o qué hizo la tinción.

| Familia | Objetos |
|---|---|
| Madera | tronco y tablones de los nueve árboles (`wood`, `planks`, `<árbol>_wood`, `<árbol>_planks`) |
| Arena y rocas | `sand`, `stone`, `stone_bricks`, `cobblestone`, `granite`, `marble`, `basalt`, `slate`, `limestone`, `obsidian`, `concrete`, `brick` |
| Menas | `coal_ore`, `iron_ore`, `gold_ore`, `copper_ore`, `tin_ore`, `zinc_ore`, `lead_ore`, `silver_ore` |
| Metales | `iron_block`, `copper_block`, `gold_block`, `steel_ingot`, `bronze_ingot`, `brass_ingot`, `meteoric_iron`, `gold_leaf`, los elementos Fe, Cu, Au, Ag, Ni, Pt, Al, Zn, Mg, Ti, Co, Be, Cr, Mn, W, Sn, Pb |
| Cristales | `salt`, `baking_soda`, `copper_sulfate`, `fluorite`, `pyrite`, `quicklime`, `rust_pigment`, `ice`, `ruby`, `sapphire`, los elementos S, I, C, Si, B |
| Vidrio | `glass`, `glass_pane`, `cobalt_glass`, `<color>_stained_glass`, `<color>_stained_glass_pane` |
| Fibras | `<color>_carpet`, `<color>_curtain`, `fur`, `feather`, `leather`, `scale`, `shell` |
| Electrónica | las seis puertas lógicas, `rain_sensor`, `daylight_sensor`, `solar_cell`, `solar_panel`, `light_bulb`, `copper_wire`, `mirror`, `wall_mirror` |
| Comida y plantas | `bread`, `wheat_seeds`, `honey_bottle`, `cooked_fish`, `salted_fish`, `cactus`, `moss`, `tall_grass`, `grass` |
| Papel | `blueprint`, `written_blueprint`, `star_chart`, `breeding_notebook` |

- **Tinciones:** el yodo vuelve negro azulado el almidón (trigo, pan, radios de la albura, cloroplastos, papel encolado);
  el azul de metileno tiñe núcleos (semilla, cactus, musgo, hierba, músculo). Minerales, metales, vidrio y gemas no toman
  nada. La sal, el bicarbonato y el sulfato de cobre se disuelven en el agua del colorante.
- **Lo opaco** (metales, casi todas las menas, silicio, la plata de un espejo, el cobre) es negro con la luz de abajo. A
  40× se ve su superficie con la luz de la sala; a 100× menos; a 400× y 1000× queda oscuro.
- No van: huevos de mobs, herramientas y armas, líquidos, bloques con forma (escaleras, losas, puertas, vallas), muebles,
  gases y metales que reaccionan con el aire o el agua (H, He, N, O, F, Ne, Ar, Cl, Li, Na, K, Ca, Hg, P), `bedrock`.

### Cultivos de microbios: incubadora, autoclave y filtro

Páginas 253 a 255 de la guía del juego (`js/game/cultures.js`, `pkg/network/microbes.go`). Ningún microbio daña al
jugador: los cultivos viven dentro de la incubadora, en el servidor, y en el inventario no cambia nada.

| Resultado | Ingredientes |
|---|---|
| `incubator` | 4 `iron_ore` + 2 `glass` + 1 `thermometer` |
| `autoclave` | 3 `iron_block` + 1 `glass` |
| 2 `petri_dish` | 1 `glass` |
| `agar_plate` | 1 `petri_dish` + 1 `wheat` + 1 `water_flask` |
| `agar_plate_unsterile` | 1 `used_dish` + 1 `wheat` + 1 `water_flask` (lleva esporas de moho) |
| `water_filter` | 1 `sand` + 1 `coal_ore` + 1 `test_tube` |

- **Incubadora:** clic derecho (en táctil, tocar) abre su panel: tres placas, la temperatura de dentro, la elegida (de 5 a
  45 °C, con barra o − y +), corriente, luz y la curva de la placa elegida. Gasta 20 W solo mientras algo crece. Sin
  corriente se queda a la temperatura del sitio (el modelo del termómetro, portado al servidor).
- **Sembrar:** flores o `honeycomb` dan levadura; `milk` o `cheese`, lactobacilos; `dirt`, bacterias del suelo; una
  muestra con cianobacterias, cianobacterias (solo crecen con sol directo o una lámpara de cultivo cerca); un cultivo, el
  suyo. Una siembra por placa.
- **Sacar:** con 10⁶ células o más, un `culture_*` y una `used_dish`; si no, solo la `used_dish`; sin nada crecido, la
  placa tal cual. Una placa sin esterilizar con moho da `culture_mould`.
- **Modelo:** por placa, log10 de células, latencia (trabajo h0 = 2) y nutriente; ritmo con el modelo de temperaturas
  cardinales de Rosso. Las cuatro fases (latencia, exponencial, estacionaria, muerte). Unos 3 minutos de 10³ a 10⁹ a la
  temperatura óptima, y un día de juego llena antes de morir. El moho frena a lactobacilos y bacterias del suelo
  (penicilina) y deja un anillo limpio en la placa.

| Microbio | Mín. | Ópt. | Máx. |
|---|---|---|---|
| Levadura | 5 | 30 | 42 |
| Lactobacilo | 15 | 42 | 48 |
| Bacterias del suelo | 10 | 30 | 45 |
| Cianobacterias (con luz) | 15 | 28 | 38 |
| Moho Penicillium | 4 | 23 | 37 |

- **Autoclave:** máquina eléctrica de 40 W bajo demanda, panel de cofre: `used_dish` → `petri_dish` (10 s),
  `agar_plate_unsterile` → `agar_plate` (15 s).
- **Filtro:** como un tubo, sobre agua: `sample_filtered`, que al microscopio solo enseña unas pocas bacterias.
- **Kit de pruebas:** `/culturekit`, solo en modo creativo.

## Metales

Páginas 248 y 249 de la guía del juego. Lo decide `pkg/terrain/ores.go`, y `js/terrainGen.js` hace lo mismo.

El fondo del mundo es la roca madre, en y = −14 y en la mitad de las casillas de y = −13 (y = −5 y −4 en los chunks guardados antes de que el mundo se hiciera más hondo). Hay **vetas** dentro de la piedra (bloques unidos, que cruzan los bordes de los chunks) y **afloramientos** al aire libre: en la roca de las montañas y, muy de vez en cuando, en una cuesta de 45 grados o más de cualquier otro bioma. No sustituyen al agua, a la arena de playa, al musgo ni a la tierra donde crece algo.

| Mineral | Sobre todo en | Profundidad | En la fundición | A mano (C) |
|---|---|---|---|---|
| `coal_ore` | llanura, bosque, montaña | sobre todo de y = 0 a y = 3; en la montaña, cualquiera | combustible | se usa tal cual |
| `iron_ore` | montaña, y todas las demás | y < 4; en la montaña, cualquiera | 1 `iron_block` | se usa tal cual |
| `copper_ore` | desierto y montaña | y < 4; en la montaña, cualquiera | **2** `copper_block` | 1 `copper_ore` + 1 `coal_ore` → 1 |
| `tin_ore` | solo montaña | cualquiera | **2** `element_sn` | 1 `tin_ore` + 1 `coal_ore` → 1 |
| `zinc_ore` | llanura y bosque, y en bolsas dentro del plomo | y < 4; en la montaña, cualquiera | **2** `element_zn` | 1 `zinc_ore` + 1 `coal_ore` → 1 |
| `lead_ore` | montaña; llanura y bosque | y < 4; en la montaña, cualquiera | **2** `element_pb` | 1 `lead_ore` + 1 `coal_ore` → 1 |
| `silver_ore` | montaña, y en bolsas dentro del plomo | y < 4; en la montaña, cualquiera | **2** `element_ag` | 1 `silver_ore` + 1 `coal_ore` → 1 |
| `gold_ore` | montaña; muy poco en otros sitios | y < 0, más cuanto más hondo; en la montaña, cualquiera | 1 `gold_block` | se usa tal cual |

Del metal de construir a la mesa de laboratorio (tecla C, y solo en este sentido):

| Resultado | Ingredientes | Receta |
|---|---|---|
| 1 `element_cu` | 1 `copper_block` | *Extract CU from Copper Block* |
| 1 `element_fe` | 1 `iron_block` | *Extract FE from Iron Block* |
| 1 `element_au` | 1 `gold_block` | *Extract AU from Gold Block* |

Las recetas antiguas (*Refine* para los bloques de metal y *Synthesize* para los elementos) siguen todas.

Un mundo guardado conserva sus chunks: las vetas nuevas solo salen en los que aún no se habían generado.

## Bloque luminoso

Un cubo decorativo que brilla solo (página 245). No es eléctrico, no ilumina lo que tiene alrededor y no sirve para un
microscopio: la luz del juego tiene nivel pero no color.

| Resultado | Ingredientes |
|---|---|
| `glow_block` | 1 `glass` + 1 `torch` |

- **Color:** clic derecho abre su panel. Hay 5 temperaturas (2700, 3000, 4000, 5000 y 6500 K) y un cubo RGB de 6 pasos por
  canal, 221 estados en total, escritos en el nombre: `glow_block` (3000 K), `glow_block:k6500`, `glow_block:rgb503`.
  Cambia para todos; el servidor comprueba el alcance y el nombre.
- **Al romperlo** da un `glow_block` normal: el color no se guarda en el inventario. Los planos y `/build` sí lo guardan.

## La mano izquierda

Una casilla para llevar algo mientras la derecha trabaja (página 251, `js/game/offhand.js`).

- **X** pasa a la izquierda el objeto seleccionado, o los intercambia; con el mismo en las dos manos lo devuelve; con la derecha
  vacía, el de la izquierda pasa a la derecha. **Mayús + X** lo guarda. En el inventario, el botón **L** de cada objeto y la
  casilla de arriba. En táctil, el botón **L** de arriba y **Left hand** en el menú.
- **Una unidad de verdad:** sale de `inventoryCounts` y se guarda como `offhand` en `minecloud-inventory-state`, en el mismo JSON,
  así que no se duplica. Colocar, tirar (Q), fabricar, cofres y microscopio solo ven el contador: no pueden tocarla. Morir no cambia
  el inventario.

| Objeto | En la izquierda |
|---|---|
| `torch` | luz 14; su humo calma a las abejas |
| `lantern` | luz 13 |
| `candle` | luz 9 |
| `firefly_jar` | luz 7 |
| `multimeter` | lee el bloque eléctrico que miras, sin clic |
| `thermometer`, `barometer`, `anemometer` | su panel (un solo panel para las dos manos) |
| `helium_balloon` | caída lenta y sin daño |
| `shield` | −50 % de los ataques de criaturas de frente |
| picos, palas, hachas (`wood`, `stone`, `iron`, `gold`, `steel`) | con otro del mismo tipo en la derecha, mina a ×1,5 |
| espadas (`wood`, `stone`, `iron`, `gold`, `steel`) | con otra en la derecha, suma el 50 % de su daño |

- **Fuera de la lista:** lo que pide clic derecho (telescopio, cinta métrica, red, caña, azadas, tijeras...) y las lámparas de mesa, de pie y
  candelabros, que no son para llevar en la mano. No hay brújula ni reloj como objetos: están siempre en pantalla.
- **Dos herramientas:** dos del mismo tipo (`pickaxe`, `shovel` o `axe`) y la de la derecha buena para el bloque: multiplicador del
  peor material × 1,5 (`OFFHAND_PAIR_SPEED`). Con una mucho peor, la buena va más lenta que sola (hierro 2,6; hierro + madera 2,175). Si no se
  cumple, la derecha mina como siempre. La izquierda sola no mina: la mano derecha se mira con `getSelectedHeldItemType`, así que tras pasar la
  última unidad se pica con la mano vacía. Los brazos golpean por turnos, en primera persona.
- **Dos espadas:** daño = derecha + 50 % de la izquierda (`PLAYER_LEFT_SWORD_SHARE`), en medios puntos; sin cooldown. Sin espada en la derecha, 4.
  Cada golpe alterna el brazo.
- **Escudo:** `shield`, 4 `planks` + 2 `iron_ore`, sin durabilidad, página 252. Es un modificador de daño: solo en la izquierda, solo tipo `mob` y solo
  si `applyDamage` recibe `source` (la posición del atacante) a ≤ 60° de donde mira el jugador, en el plano. Sin `source`: anguila, hormigas. No lo
  reducen veneno, caída, rayo del cielo ni vacío; sí la picadura previa al veneno y el rayo que lanza el golem. Corre tras la armadura. La vida
  puede quedar en medios puntos.
- **Luz:** alcance en bloques = nivel × 9 / 14. Tres huecos en el sombreador del terreno (`world.setCarriedLights`): el jugador y los dos
  jugadores más cercanos con luz, a menos de 40 bloques. No rehace chunks. Mobs y avatares solo reciben la luz propia, por la luz puntual
  que ya llevaba la cámara. Las luces alumbran también en la mano derecha.
- **Microscopio:** una luz en cualquier mano cuenta si estás a 3 bloques o menos.
- **Red:** el campo `offhandItem` de `playerMove`; los clientes antiguos lo ignoran y los que no lo mandan salen con la mano vacía.

## Cortinas

Las cortinas (`<color>_curtain`, página 230, `js/game/decor.js`) se corren con clic derecho, por `joineryToggle` como puertas y verjas.

- **Tiras verticales:** el clic corre también las cortinas que cuelgan justo encima y debajo con la misma orientación (de cualquier
  color), las más cercanas primero, alternando arriba y abajo, hasta 10 en total con la pulsada (`CURTAIN_STRIP_LIMIT`). Un hueco, otro
  bloque, una cortina que mira a otro lado o un chunk sin cargar cortan la tira. Todas acaban en el estado al que va la pulsada; cada una
  conserva su color. El alcance solo se mira en la pulsada: se tira del cordón y se corre la tira.
- **Red:** una sola cortina va como `blockPlace`, como siempre. Una tira va en un mensaje `curtainStrip` (`pkg/network/curtains.go`) con
  todos los bloques. El servidor la escribe entera o nada: una sola columna seguida, como mucho 10, cada celda sigue siendo esa misma
  cortina con la misma orientación. Si algo falla (alguien rompió una, otra orientación, fuera del mundo) no cambia nada y solo el que la
  mandó recibe un `curtainStrip` con lo que hay de verdad (`blockType` vacío es aire). Si vale, todos reciben un solo `curtainStrip`.
  `blockPlace`, `blockBreak` y `curtainStrip` pasan por un mismo cerrojo (`blockEditMu`), así que nadie rompe una entre la comprobación y
  la escritura.
- **Lado:** el estado `side` (`right` o `left`) dice hacia dónde se recoge la tela abierta, visto desde delante. Al colocarla sale del
  punto de la cara en que se hace clic, respecto a quien mira (como la bisagra de una puerta): mitad derecha, `right`; izquierda, `left`;
  el centro, `right`. Cerrada se ve igual. `right` es como se abrían todas antes, así que es el valor por defecto y los nombres guardados
  no cambian: `red_curtain`, `red_curtain:e:open`; solo el izquierdo añade `:left` (`red_curtain:e:open:left`). 16 colores × 4
  orientaciones × 2 estados × 2 lados, todos registrados. Una tira copia solo `drawn`: cada cortina conserva su color y su lado, y el
  servidor rechaza una tira que cambie un lado.
- **Planos y `/build`:** colocan cada cortina con su nombre y estado, con `blockPlace`; no les afecta.

## Parcelas

Las parcelas (`claim_marker`, página 260, `js/game/claims.js`, `pkg/network/claims.go`) protegen un trozo del mundo para un
jugador. Las decide el servidor; el cliente solo dibuja, avisa y comprueba antes por cortesía.

- **Mojón:** receta `Make Claim Marker` (C), 2 `stone_bricks` + 1 `copper_ore`. Colocarlo (un `blockPlace` de `claim_marker`)
  es reclamar: bajo `blockEditMu`, el servidor mira el alcance (`storageReach`, 9 bloques), que el jugador estable
  (`Client.stablePlayerID`, fase 1) no tenga ya parcela, que el cuadrado no pise otra ni la zona de inicio y que deje al
  menos `claimGap` (8) columnas libres entre sus bordes y los de cualquier otra parcela y la zona de inicio
  (`claimRect.gapTo`: columnas libres en x o en z, la mayor; `nearestLocked` busca en los chunks del cuadrado crecido 8);
  crea la parcela y solo entonces escribe el bloque (si la escritura falla, la deshace). Si no, `claimRefused` con `reason`
  `already`, `overlap` (y `owner`), `overlapSpawn`, `tooClose` (con `owner` de la más cercana, `distance` y `gap`),
  `tooCloseSpawn` (`distance`, `gap`), `reach` o `noPlayer`, y el cliente devuelve el mojón al inventario. Solo se mira al
  reclamar: las parcelas guardadas más cerca de antes siguen valiendo (al cargar solo se descartan solapes). `claimList`
  lleva `gap` para la comprobación de cortesía del cliente.
- **Tamaño:** 17 × 17 columnas centradas en el mojón (`claimRadius` = 8), del bedrock al cielo: la protección solo mira x y z.
  Una por jugador. **Zona de inicio:** x y z de −16 a 15 (32 × 32 alrededor de (0, 0)), sin dueño.
- **Quitar:** romper el mojón (solo el dueño o el administrador, porque está dentro de su propia parcela) o taparlo con otro
  bloque quita la parcela. En el cliente, romperlo o «Quitar la parcela» en el panel preguntan antes.
- **Guardado:** `data/world/claims.json`, `claims` (por id: marcador, dueño, nombre, fecha). Al cargar se descarta lo imposible (sin dueño,
  segunda del mismo dueño, solapes; se queda la más antigua). Índice por chunk (`byChunk`): una parcela toca como mucho 3 × 3
  chunks y un chunk como mucho 4 parcelas, así que mirar una columna es un acceso a un mapa y unas pocas comparaciones.
- **Protección (`claimCheck`):** se permite si la columna no es de nadie, si es de tu parcela o si eres el administrador (sesión
  con la clave de creativo, `claimAdmin`: la única excepción, y explícita). Caminos protegidos: `blockPlace`, `blockBreak`,
  `curtainStrip`, `glowSet`, `sprayPaint`, `logicPress`; `storageOpen`, `storagePut`, `storageTake` (todo almacén: cofres,
  neveras, armarios, hornos, fundición, horno de arco, autoclave, incubadora, microscopio); `microscopePrepare`, `microscopeClear`,
  `microscopeDrop`, `microscopeCapture`, `microscopeStain`; `cultureLoad`, `cultureInoculate`, `cultureHarvest`, `cultureSet`;
  `constructionStock` (solo lo manda el administrador, pero pasa por la misma comprobación). Los almacenes contestan además su
  `storageResult` con `reason: "protected"` (guardado en el registro, así un reenvío recibe la misma respuesta).
- **Respuesta:** `claimRefused {reason, owner, blocks, placed}` solo al que lo mandó: `blocks` es lo que hay de verdad en las
  celdas (con texto de cartel y demás), para deshacer su copia; `placed`, lo que pidió poner, para devolverle el objeto (solo
  un bloque entero, no la mitad de arriba de una puerta, ni en creativo).
- **Mecanismos:** un empujador solo mueve bloques dentro de su propia zona (nada, la zona de inicio o una parcela): todas las
  celdas que toca, la del brazo y la libre del final incluidas (`mechSameZone`). Un empujador pegajoso no tira de un bloque de
  otra zona (se recoge sin él). Un ascensor se mueve en la columna de su torno, que siempre es una sola zona; sus paradas solo
  cuentan si están en esa zona. El mojón no se mueve (`mechFixed`).
- **Ayudantes:** robot, castor y golem de cobre actúan desde el navegador de su dueño, con sus mensajes: el servidor los trata
  como a él, y además preguntan `claimRefusalAt` antes de actuar.
- **Sin proteger, a propósito:** `sampleTake` (el agua o el musgo siguen ahí), `signVote`, `powerCrank`, `powerFeed`,
  `powerProbe`, `soundBlockPlay`. **Imposible de proteger** (lo decide el navegador y el servidor no lo ve): mascotas y mobs,
  trampas y jaulas, hormigueros de tarro, objetos tirados, el inventario. Placas de presión y sensores de proximidad reaccionan a
  cualquiera, como deben.
- **Lista:** `claimList {claims, spawn, radius}` al conectar, tras recuperar el jugador y tras cada cambio; cada parcela con su
  cuadrado, el nombre del dueño y `mine`. El id de jugador del dueño no sale nunca del servidor (salvo al administrador).
  `playerHolds` (fase 1) es «tiene parcela», así que un jugador con parcela no se borra al recuperar otro.
- **Cliente:** borde a menos de 12 bloques (líneas en el suelo, columnas en las esquinas; verde la tuya, violeta en la que eres
  invitado, ámbar ajena, azul la zona de inicio), aviso al entrar, panel del mojón (clic derecho del dueño), comprobaciones antes de minar, colocar o abrir
  (un visitante puede usar herramientas que solo miran: multímetro, cinta métrica, termómetro, tubo de muestras…, y leer un cartel con clic derecho).
- **Ir a tu parcela:** «Ir a mi parcela» en el menú de pausa (`settings-claim-home`) o `/home`. El cliente pide `claimHome {}`;
  el servidor contesta `claimHomeResult` solo al dueño (`ofOwner`: un invitado o cualquier otro recibe `reason: "none"`) con el
  mojón y el cuadrado, como mucho una vez cada `claimHomeCooldown` (30 s) por jugador estable, sea cual sea la pestaña (antes:
  `reason: "wait"` y `wait` en segundos). No cuesta nada. El cliente baja al jugador del caballo o del asiento (`dismount`,
  `seatStandUp`; un ascensor no hace falta: solo empuja por colisión), lo deja quieto encima del mojón mientras no estén
  cargados los chunks de la parcela (como mucho 8 s si ya está el del mojón; a los 30 s cede a la espera normal de la cámara) y
  entonces lo pone con `claimHomeSpot`: los pies sobre un bloque sólido, dos celdas libres (sin sólido ni agua ni lava) y la
  última palabra de las colisiones de la cámara, en la columna de la parcela más cercana al mojón y a su altura (un bloque de
  altura pesa como 0,3 anillos); si no hay ninguna, encima del mojón; si tampoco, desde arriba y la cámara lo saca del suelo.
- **Invitados** (fase 4): `Claim.Guests` por id de jugador estable (nunca por nombre) con el último nombre que usó y la fecha,
  guardados con la parcela; como mucho `claimMaxGuests` (16). `claimGuest {action: "add", player}` solo del dueño: `player` es
  el id de página de un jugador conectado (lo que los clientes conocen de él, de `playerList`) o, si no, el nombre de un único
  conectado; `{action: "remove", key}`, con la clave que vio el dueño (`claimGuestKey`: hash de la parcela y del id, no el id).
  Contesta `claimGuestResult {action, ok, error (none, self, full, player, unknown), name}`, guarda y manda la lista a todos.
  `claimCheck` deja al dueño y a sus invitados (`checkAt`), así que vale para todos los caminos protegidos; quitar un invitado
  cuenta desde su siguiente mensaje. Solo del dueño: el mojón (`claimMarkerGuard`, razón `ownerOnly`, en `blockBreak`,
  `blockPlace` sobre el mojón y `curtainStrip`), el panel, invitar e ir a la parcela. El cambio de nombre al entrar
  (`claimRenameOwner`) sigue también a los invitados; si el administrador da la parcela a un invitado, deja de serlo. Al cargar
  se descartan ids que no son `plr_…`, el propio dueño y los que pasen de 16 (se quedan los más antiguos). En `claimList` cada
  parcela lleva `mine` o `guest`, y solo el dueño recibe `guests: [{key, name, online}]`. Cliente: borde **violeta** en la
  parcela en la que eres invitado; el panel muestra invitados con «Quitar» y un botón «Invitar a …» por jugador conectado que
  no lo sea ya; a un invitado el mojón solo le dice de quién es.
- **Modo constructor** (fase 3, `js/game/builder.js`, `pkg/network/builder.go`): se enciende solo al entrar en una parcela
  propia o de invitado (`claimIsMember` de la columna del jugador, cada fotograma), sigue en un margen de `BUILDER_MARGIN` = 3
  bloques alrededor del cuadrado (`builderMarginRect`, `builderPlotNear`) y se apaga más allá; nunca en creativo ni muerto.
  Con 8 bloques libres entre parcelas y hasta la zona de inicio, el margen no toca nada ajeno; si dos márgenes propios se
  tocaran (parcelas anteriores a esa regla), manda la parcela en la que estás o la más cercana, sin apagar y encender. El
  margen se dibuja como una línea más tenue, sin columnas (`claimUpdateBorders`, solo parcelas propias o de invitado). Aviso `#builder-indicator` arriba (atenuado si está apagado a mano; en táctil, un toque lo conmuta) y botón
  `settings-builder` en el menú de pausa; la preferencia, en `localStorage` `minecloud-builder` (`on`/`off`).
  - **Paleta** (`builderPaletteOf`): lo que tiene una familia de `BUILDER_FAMILIES` (building, decoration, furniture, light,
    glass, wool, wood, stone) y ninguna de `BUILDER_NOT_FAMILIES` (science, electric, logic, mechanism, chemistry, element,
    microscope, sample, ore, food, drink, tool, weapon, armor, egg, bait, farming, plant, animal), menos `claim_marker` y
    `oven`, y nada `itemOnly`: 243 objetos. Entran los almacenes sencillos (cofre, barril, armario) como muebles; su contenido
    nunca sale de la paleta. El servidor tiene la misma lista literal (`builderPalette`) y `test/js/builder.test.js` comprueba
    que coinciden: un cambio de etiquetas que meta o saque algo falla hasta actualizar las dos.
  - **Inventario:** la paleta no entra nunca en `inventory`/`inventoryCounts`. `builderSelected` es el objeto de la paleta en la
    mano; `builderHotbar` las entradas de la barra (`palette:<tipo>` o las de siempre), solo en memoria. La barra y el panel
    muestran la paleta (∞) y lo propio que no es de la paleta; lo propio de un tipo de la paleta se oculta sin tocarlo. Al salir
    la barra vuelve a ser `hotbarPinnedTypes` tal cual (nunca se tocó) y la mano pasa al montón propio de ese tipo si lo hay.
    Con un objeto de la paleta en la mano, todo uso (mobs, `ITEM_USE_HANDLERS`) va con la mano vacía (`builderWithEmptyHand`)
    y solo después se coloca (`builderPlacingOnly`); tirar, comer y la mano izquierda se niegan; `consumeSelectedBlock` no gasta.
  - **Colocar:** `blockPlace` con `palette: true` (`blockPlaceOutgoing` en `building.js`). El servidor (`builderCheck`, antes que
    el resto de `claimPlaceBlock`) lo acepta solo si `storageBase(tipo)` está en la paleta y la columna es de una parcela donde es
    dueño o invitado: si no, `claimRefused` con `palette`, `builderOutside`, `spawn` o `claim`, sin `placed` (no se devuelve
    nada). Ni el administrador se salta esto (para eso tiene creativo). Las colocaciones normales no cambian. El margen no es
    de la parcela: antes de colocar desde la paleta, `building.js` pregunta `builderPartsAllowed(parts)` y si alguna celda no está
    dentro de una parcela propia o de invitado no se pone ni se envía nada (aviso `refusedMargin`); el servidor, igual que antes.
  - **Romper:** instantáneo dentro de la parcela (`getAdjustedBreakDuration` 0 con la celda que pasa `building.js`, con 0,18 s
    entre bloques); en el margen, como siempre (tarda, suelta lo suyo, la protección de `claims.js` no cambia). Un tipo de la paleta (o un estado suyo)
    roto en modo constructor no crea recogida; lo demás cae como siempre y el contenido de un almacén lo sigue soltando el
    servidor. Las celdas puestas desde la paleta en este navegador (`minecloud-builder-placed`, hasta 8000) tampoco sueltan nada
    con el modo apagado; se olvidan al romperse, al poner encima algo propio, al llegar un `blockBreak` ajeno o un `claimRefused`.
  - **Vuelo:** `flightAllowed` = creativo o modo constructor (`cinematic.js`); doble salto, como en creativo, también en táctil.
    Sin daño de caída dentro ni en el margen. Al salir del margen en el aire: se corta el vuelo en su borde y `builderSafeFall` anula el daño de la primera
    caída (o se borra tras 0,5 s en el suelo o en el agua).
- **Administración** (creativo): `/plots` lista (con el id del dueño), `/plot remove <n>` quita una y su mojón, `/plot owner <n>
  <jugador>` la da a otro (nombre de un jugador conectado o su `plr_…`). `/build` se niega a pisar una parcela ajena o la zona
  de inicio salvo con `force` al final.
- **Visor:** opción «Show plots» (apagada al cargar), de `/viewer-api/claims`: cuadrados, altura del mojón y nombre del dueño, sin
  ids (`js/viewer/claimMarkers.js`).
