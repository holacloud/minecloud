# Guía de MineCloud

Guía de juego de las mecánicas de fauna: cómo se consigue cada cosa y para qué sirve. Los nombres de objetos
y recetas aparecen tal y como salen en el juego (en inglés).

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

| Mob | Botín |
|---|---|
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

Si llevas el abrigo y la cota a la vez, solo cuenta la mejor de las dos.

### Consejos

- **Contra el veneno** (serpientes, escorpiones): lleva `milk` o, mejor aún, `antivenom` antes de entrar en el
  desierto o la roca.
- **Plumas y lana** para la `feather_cape`: las plumas se consiguen sin hacer daño, golpeando patos o esperando a
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
| Oveja | `tall_grass`, `flower_yellow`, `leaves` | 1/3 |
| Pato | `tall_grass`, `raw_fish`, `flower_yellow` | 1/3 |
| Cerdo | `mushroom_brown`, `mushroom_red`, `honeycomb` | 1/3 |
| Jirafa | `acacia_leaves`, `leaves`, `jungle_leaves`, `birch_leaves` | 1/4 |
| Perro | `raw_fish`, `mushroom_brown` | 1/2 |
| Gato | `raw_fish`, `milk`, `mushroom_brown` | 1/2 |
| Guacamayo | `flower_red`, `flower_yellow`, `cherry_leaves` | 1/3 |
| Camello | `cactus`, `tall_grass` | 1/3 |
| Cabra | `leaves`, `tall_grass` | 1/3 |
| Caballo | `tall_grass`, `flower_yellow`, `honeycomb` | 1/4 |

Las criaturas hostiles (araña, escorpión, serpiente, sombra, golem, fuego fatuo…) y los animales salvajes con
comportamiento propio (zorro, conejo, búho, rana, tortuga, peces, aves rapaces, abejas, murciélagos…) no se
pueden domesticar. Si les ofreces comida, no se gasta.

### Animales domesticados

- **Te siguen** y se paran a unos 2 bloques. Si te alejas más de 20 bloques o se atascan, reaparecen detrás de ti.
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

### Convivencia con otros usos del clic derecho

- Las `iron_shears` siguen esquilando y el `glass` sigue ordeñando (ver Recursos de los mobs).
- La mano vacía sienta a los domesticados.
- Con el caballo, el clic con la mano vacía sigue montándolo.

## Cebos y trampas

### Recetas

| Resultado | Ingredientes |
|---|---|
| 4 `bait_seeds` | 2 `tall_grass` |
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
| `bait_seeds` | oveja, pato, cerdo, jirafa, guacamayo, camello, cabra, caballo, conejo |
| `bait_worms` | pato, cerdo, rana, tortuga, lagarto, escorpión, peces, topo |
| `bait_meat` | perro, gato, araña, monstruo de cueva, zorro, búho, buitre, serpiente |
| `bait_fish` | gato, tortuga, águila, cangrejo |
| `bait_honey` | abejas (liban el cebo en lugar de las flores) |

Algunos animales tienen un comportamiento propio y no siempre hacen caso al cebo. Las mascotas que te siguen
también lo ignoran.

### Jaula (`cage_trap`)

1. Haz clic derecho en el suelo para colocarla. La puerta queda mirando hacia ti.
2. Con un cebo en la mano, haz clic derecho sobre la jaula vacía para meterlo dentro.
3. Cuando un animal entra a comer, la puerta se cierra de golpe y el animal queda atrapado.
4. Haz clic derecho sobre la jaula o sobre el animal atrapado y obtendrás **el huevo de ese animal** y la jaula.

Si la jaula está vacía y no llevas un cebo en la mano, el clic derecho la recoge.

**Caben:** oveja, pato, cerdo, perro, gato, araña, rana, tortuga, lagarto, escorpión, cabra, cangrejo, zorro,
conejo, serpiente y topo.

**No caben:** los animales grandes, los voladores y los peces.

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

### Frasco de luciérnagas (`firefly_jar`)

- Haz clic derecho en el suelo para colocarlo. Es una lámpara: las luciérnagas parpadean dentro y brillan, con bloom
  en Ultra.
- Clic derecho sobre el frasco: lo recoges.
- Clic derecho con la red: liberas las luciérnagas.

Los frascos colocados se guardan al recargar la página.

## Bestiario

Un cuaderno de campo con todas las especies del mundo (31).

- **Abrir:** tecla **B**, o el botón "Bestiary (B)" del menú de pausa.
- **Cerrar:** Escape, B, el botón Close o un clic fuera del panel.

### Descubrir especies

Una especie queda descubierta cuando la ves de cerca: a menos de 12 bloques y mirando hacia ella, o a menos de 2,5
bloques aunque no la mires. Al descubrir una nueva aparece el aviso "New bestiary entry: …" con un acorde suave.
Derrotar a una criatura que aún no conocías también la descubre.

### Qué muestra

- **Cuadrícula de tarjetas:**
  - Las especies descubiertas aparecen con su retrato en color, hecho con su propio modelo.
  - Las que faltan salen como una silueta negra con "???" y una pista de dónde encontrarlas.
  - Arriba se ve el progreso, por ejemplo "12 / 31 discovered".
- **Ficha de cada especie:**
  - El modelo girando en 3D.
  - Una descripción de su comportamiento y de cómo interactuar con ella.
  - Etiquetas de temperamento (pasivo, neutral u hostil) y de actividad (día o noche).
  - Hábitat.
  - Las tablas de las otras mecánicas: **Diet** (con qué se domestica), **Drops** (qué recursos da) y
    **Lured by** (qué cebos la atraen).
  - Número de encuentros, criaturas derrotadas y fecha del primer avistamiento.

Solo cuentan como derrotadas las criaturas que derrota el jugador, no las que cazan otros animales. El progreso
se guarda en el navegador.
