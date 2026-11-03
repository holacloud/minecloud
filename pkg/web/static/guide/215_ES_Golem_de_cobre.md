# Golem de cobre

![Golem de cobre](mob:copper_golem)

Un pequeño ayudante hecho de cobre: cuerpo rechoncho, **ojos grandes y redondos** que brillan, una **antena
pararrayos** en la cabeza y una **bobina de cobre** a la espalda. No se encuentra en la naturaleza: **lo construyes
tú**. Luego te sigue, te espera o recoge los objetos que hay por el suelo, siempre que tenga **carga**.

| | Nombre en el juego | Id |
|---|---|---|
| ![](item:copper_golem_core) | Copper Golem Core | `copper_golem_core` |
| ![](item:copper_wrench) | Copper Wrench | `copper_wrench` |

## Construirlo

| Receta (tecla C) | Ingredientes |
|---|---|
| 1 `copper_golem_core` (*Build Copper Golem Core*) | 3 `copper_block` + 1 `battery_block` + 1 `element_si` |
| 1 `copper_golem_core` (*Build Copper Golem Core (Lithium)*) | 3 `copper_block` + 1 `battery` + 1 `element_si` |
| 1 `copper_wrench` (*Forge Copper Wrench*) | 1 `copper_block` + 1 `iron_ore` |

Los bloques de cobre están en [Piedras nobles y metales](59), la batería en [Baterías](203), la batería de litio en
[Batería de litio](189) y el chip de silicio de su cerebro en [Silicio](152).

- Con el núcleo en la mano, **clic derecho encima de un bloque**: el golem **se monta** ahí, girando y echando
  chispas.
- Puedes tener **como mucho 2** golems de cobre.
- **Shift + clic derecho** lo vuelve a guardar en su núcleo (y te da lo que llevara).
- **Pegarle no le hace daño**: solo se queja. ¡Está de tu parte!

## Modos

**Clic derecho** (con la mano vacía o con cualquier cosa que no sea uno de sus objetos especiales) cambia de modo.
Te dice cuál en un bocadillo y en el chat:

| Modo | Qué hace |
|---|---|
| **Seguir** | Va detrás de ti. Si se queda a más de 20 bloques o se atasca, te alcanza en un destello. |
| **Quieto** | Espera donde está y te mira. |
| **Trabajar** | Recuerda el sitio donde se lo dijiste. Recoge los **objetos que hay en el suelo a menos de 8 bloques** de ese sitio y te los trae si estás a menos de 12 bloques; si estás más lejos, los deja en un montón en su sitio. Lleva hasta 4 tipos de objetos a la vez. |

Por el camino **abre las puertas y los portones cerrados** y los vuelve a cerrar detrás de él (nunca encima de ti),
igual que harías tú: todos los ven abrirse y cerrarse.

## La llave de cobre

- Clic derecho con la llave en una **puerta, trampilla o portón**: tu golem despierto más cercano va hasta allí y lo
  abre o lo cierra ("On my way!").
- Si el mundo tiene **botones y palancas** (bloques de lógica), la llave también lo manda a pulsarlos.
- Clic derecho con la llave **sobre el golem**: te dice su estado (modo, carga, pátina, cera y lo que lleva).

## Carga

El golem funciona con electricidad, como un juguete de pilas.

- Una **carga completa** da para **un día de juego de trabajo** (240 segundos andando o cargando cosas). Quieto
  gasta cinco veces menos; dormido no gasta nada.
- **Se recarga solo** a menos de 2 bloques de una **batería con carga** o de cualquier bloque eléctrico
  **encendido** (una lámpara encendida, un motor en marcha): su antena parpadea en azul y blanco. Se llena en 40 s.
  Ver [Electricidad](200).
- O dale energía a mano: clic derecho con **carbón** (`coal_ore`, +25 %) o una **batería de litio** (`battery`,
  +100 %).

| Antena | Significa |
|---|---|
| Verde | Todo bien |
| Ámbar | Batería baja (menos del 20 %): anda a media velocidad y sus ojos se apagan un poco |
| Parpadeo azul y blanco | Cargando |
| Oscura | Dormido: sin carga |

Al **0 %** se sienta y se duerme ("Zzz..."). Se despierta cuando vuelve a tener un **15 %**.

## Pátina y cera

Su cobre es cobre de verdad, así que **cambia de color con el tiempo**, como los tejados y las estatuas de cobre
(ver [Óxido y pátina](216)):

| Después de | Color |
|---|---|
| Nuevo | naranja brillante |
| 1 día de juego | marrón deslustrado |
| 3 días de juego | marrón con manchas verdes |
| 6 días de juego | **verdín** verde |

Con **lluvia** o dentro del **agua** va tres veces más rápido. La pátina solo avanza mientras el golem está en el
mundo que tienes alrededor.

- **Panal** (`honeycomb`, clic derecho): lo **encera**. La cera aísla el cobre del aire y del agua, así que conserva
  su color.
- Un **hacha** (clic derecho): primero quita la cera; sin cera, **raspa una capa** de pátina.

## Conviene saber

- Igual que el [robot programable](193), el golem es **solo tuyo**: se guarda en tu navegador y los demás jugadores
  no lo ven. Lo que hace con los bloques (puertas, portones, botones) sí lo ve todo el mundo.
- No nada: rodea el agua.

## Curiosidades

- *Gólem* viene del folclore judío: una figura de barro a la que se daba vida para ayudar y proteger.
- Muchos pararrayos de verdad son de **cobre**, porque conduce muy bien la electricidad y no se deshace oxidándose.
- La bobina de su espalda es como las de los motores y generadores: un hilo de cobre muy largo enrollado una y otra
  vez.

Ver también: [Óxido y pátina](216), [Cobre](165), [Electricidad](200), [Puertas y trampillas](197),
[Vallas y portones](199), [Índice de mobs](16).
