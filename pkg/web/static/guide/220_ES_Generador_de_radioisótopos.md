# Generador de radioisótopos

![Generador de radioisótopos](item:rtg)

Un bidón de acero pesado cubierto de **aletas de refrigeración**, con un símbolo amarillo de radiación y un brillo
cálido entre las aletas. Es el [generador](201) más paciente que existe: una vez colocado da **80 W, siempre**. De
día y de noche, con lluvia o con sol, bajo tierra o en lo alto de una montaña, **sin combustible** y **sin hacer
nada**.

Los científicos lo llaman **RTG**: *generador termoeléctrico de radioisótopos*. Los de verdad alimentan sondas
espaciales que viajan a donde el sol es demasiado débil y nadie puede ir a arreglarlas.

| | Nombre en el juego | Id | Potencia |
|---|---|---|---|
| ![](item:rtg) | Radioisotope Generator | `rtg` | **80 W**, todo el tiempo |

## Cómo conseguirlo

| Receta (tecla C) | Ingredientes |
|---|---|
| 1 `rtg` | 4 `element_pb` + 2 `element_si` + 1 `element_pt` + 2 `iron_block` + 4 `copper_wire` |

- El [plomo](174) (`element_pb`) es el **blindaje**, el [silicio](152) (`element_si`) forma los **termopares** y el
  [platino](171) (`element_pt`) envuelve el núcleo caliente, como hace en los de verdad el iridio, su vecino en la
  tabla periódica. Todos los bloques de elementos se sintetizan con piedra y carbón: ver
  [Bloques de elementos](60).
- El `iron_block` se refina con piedra y arena (ver [Piedras nobles y metales](59)); el cable de cobre está en
  [Cables y redes](202).

Cuesta mucho más que una [placa solar](201), pero solo lo construyes una vez.

## Cómo se usa

1. **Colócalo** como cualquier bloque. Es un cubo completo: puedes construir encima, enterrarlo o esconderlo en una
   pared.
2. **Conéctalo** como cualquier generador: un [cable](202), una [batería](203), una [lámpara](204) o un motor
   tocando una de sus caras.
3. Ya está. Coge un [multímetro](205) y haz clic derecho en él: pone *Radioisotope Generator giving 80 W*, y la red
   muestra la fuente `radioisotope`.

## Para qué dan 80 W

| Consumidor | Gasta | Un RTG |
|---|---|---|
| [Lámpara eléctrica](204) | 10 W | 8 lámparas |
| [Lámpara de cultivo](204) | 30 W | 2 lámparas de cultivo |
| [Motor eléctrico](204) | 50 W | un motor y 3 lámparas |
| [Empujador](217) | 40 W | 2 empujadores |
| [Torno de ascensor](218) | 60 W | un torno y 2 lámparas |

- Mueve un [empujador](217) o un [torno de ascensor](218) **él solo, sin baterías**, también de noche.
- En un día de MineCloud (4 minutos) produce 80 × 240 = **19 200 J**: más de **seis [baterías](203) llenas**. Llena
  una batería vacía en menos de 40 segundos.
- Una [placa solar](201) da 40 W a mediodía, pero nada de noche: en un día entero junta unos 3 kJ. Un RTG equivale a
  seis placas con baterías... sin baterías.
- Recuerda que una red es **todo o nada**: si el consumo pasa de 80 W y no hay baterías ni otros generadores, todo
  se apaga. Añade un segundo RTG, o una batería para los picos.

## Ciencia: calor de los átomos

Algunos átomos son **inestables**: de vez en cuando su núcleo se rompe por sí solo y dispara una partícula
diminuta y muy rápida. Esto se llama **desintegración radiactiva**. El combustible de un RTG de verdad es
**plutonio-238**, y sus partículas chocan con los átomos de alrededor y convierten su velocidad en **calor**. ¡Una
pastilla de plutonio brilla al rojo vivo ella sola, sin quemar nada!

No se puede saber *cuándo* se desintegrará un átomo concreto, pero sí cuánto tarda en hacerlo **la mitad de ellos**:
el **periodo de semidesintegración**. Para el plutonio-238 son unos **88 años**. Así que un RTG sigue dando la mitad
de su calor después de 88 años, y una cuarta parte después de 176. Por eso dura **décadas** sin repostar. (En el
juego nunca se gasta: una partida de MineCloud es demasiado corta para notarlo.)

### Del calor a la electricidad: el efecto Seebeck

Un RTG **no tiene piezas móviles**: ni turbina, ni motor, nada que se desgaste. Usa **termopares**.

En 1821 Thomas Seebeck descubrió que si unes dos **metales distintos** (o semiconductores, como el silicio) y
calientas una de las uniones mientras la otra está fría, aparece un pequeño **voltaje**. Es el **efecto Seebeck**.
Un termopar da muy poco, pero cientos de ellos en fila se suman, como las celdas de una [batería](203).

En un RTG el lado caliente toca el núcleo radiactivo y el lado frío toca las **aletas**, que echan el calor al
espacio. Solo un **6 %** del calor se convierte en electricidad; el resto sale por las aletas. ¡Por eso son tan
grandes!

> Pruébalo: un **termómetro de termopar** barato (de los que tienen una sonda con cable) funciona exactamente así. El
> voltaje que mide le dice lo caliente que está la punta.

### RTG famosos

| Misión | Lanzamiento | Dónde | Qué lleva |
|---|---|---|---|
| **Voyager 1 y 2** | 1977 | más allá de los planetas, en el espacio interestelar | tres RTG cada una, con termopares de **silicio-germanio**; siguen hablando con la Tierra casi 50 años después |
| **New Horizons** | 2006 | pasó junto a **Plutón** (2015) | un RTG: en Plutón el sol es más de 1000 veces más débil que aquí |
| **Curiosity** | 2011 | cráter Gale, **Marte** | un MMRTG de unos 110 W, a través de tormentas de polvo y noches marcianas |
| **Perseverance** | 2020 | cráter Jezero, **Marte** | el mismo MMRTG; su helicóptero, Ingenuity, era solar |

Las placas solares son geniales cerca del sol, pero en Júpiter la luz es 27 veces más débil, y en Plutón casi no
hay. Las tormentas de polvo de Marte pueden cubrir las placas durante semanas. A un RTG le da igual.

### ¿Es peligroso?

Las partículas del plutonio-238 (**partículas alfa**) se paran con **una hoja de papel**, o con unos centímetros de
aire. El peligro sería **respirar o tragar** el combustible, así que los ingenieros hacen que sea muy difícil que
pase:

- El combustible es una **cerámica** (como una alfarería muy dura), así que no se convierte en polvo fácilmente.
- Cada pastilla va envuelta en metal de **iridio**, dentro de bloques de **grafito** hechos para aguantar la
  explosión de un cohete y la caída de vuelta a través de la atmósfera.
- En 1970 el RTG del módulo lunar del Apolo 13 cayó al océano Pacífico, al fondo de la fosa de Tonga. Las
  mediciones del aire y del agua nunca han encontrado ninguna fuga.

Aun así, nadie debe abrir uno: es trabajo de expertos con herramientas especiales. En el juego, los cuatro bloques
de plomo de la receta son su **blindaje**.

Ver también: [Generadores](201), [Electricidad](200), [Baterías](203), [Multímetro](205).
