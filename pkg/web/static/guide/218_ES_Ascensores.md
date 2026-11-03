# Ascensores

![Torno de ascensor](item:lift_winch)

Un **ascensor** es una plataforma colgada con cuerdas de un **torno** que está encima. El torno es un
[motor eléctrico](204) con un tambor: con energía **enrolla las cuerdas** y la plataforma **sube**; sin energía, su
freno suelta las cuerdas despacio y la plataforma **baja**. Súbete y te lleva de un piso a otro.

| | Bloque | Id | Potencia | Receta (tecla C) |
|---|---|---|---|---|
| ![](item:lift_winch) | Torno de ascensor | `lift_winch` | **60 W** | **1** con 1 `electric_motor` + 3 `iron_ore` + 4 `copper_wire` |
| ![](item:lift_platform) | Plataforma de ascensor | `lift_platform` | — | **2** con 4 `planks` + 1 `iron_ore` |

## Construir un ascensor

1. Excava un **hueco** de un bloque de ancho, desde el piso más bajo hasta el más alto.
2. Pon la **plataforma** en el fondo del hueco, en el suelo del piso de abajo (te pones de pie encima de ella).
3. Pon el **torno** justo encima, en el techo del piso más alto: **3 bloques por encima** del suelo de ese piso.
   Entre el torno y la plataforma solo puede haber **aire** (48 bloques como mucho): cualquier bloque en el hueco
   corta las cuerdas.
4. Da energía al torno a través de una **palanca**: palanca encendida, la plataforma sube; apagada, baja.

La plataforma deja de subir **2 bloques por debajo del torno** (el sitio para ti, de pie encima), y deja de bajar
cuando **se apoya en algo**. Va a **2,5 bloques por segundo**, y nunca baja encima de un jugador que esté en el
hueco.

> Si se va la luz, la plataforma baja sola, despacito: nunca te quedas atrapado arriba.

## Botones de llamada

Para llamar al ascensor desde cualquier piso, usa un [biestable](210) como interruptor: el torno tiene energía
mientras el biestable está encendido.

1. Pon el biestable entre la batería y el torno (la batería detrás, el cable al torno delante).
2. Lleva un cable desde un **pulsador** del piso de arriba a la entrada **SET** (izquierda) del biestable: manda el
   ascensor **arriba**.
3. Lleva otro desde un pulsador del piso de abajo a su entrada **RESET** (derecha): lo trae **abajo**.

El biestable recuerda el último botón, así que el ascensor se queda donde lo mandaste.

## Montar en él

Quédate quieto sobre la plataforma: te lleva sin tirones. Puedes saltar mientras se mueve y bajarte en un piso.
Los demás jugadores también te ven subir. La plataforma se dibuja deslizándose entre los bloques; en el servidor
se mueve de bloque en bloque.

## Cómo lo calcula el juego

El **servidor** mueve el bloque de la plataforma, cinco veces por segundo, para todos: la plataforma es un bloque
normal del mundo, así que el ascensor sigue donde estaba cuando el servidor se reinicia. Mira la red del torno con el
[multímetro](205): gasta **60 W** todo el rato que tiene energía, también mientras espera arriba.

## Curiosidades

- En 1853 Elisha Otis enseñó en una feria de Nueva York un ascensor con **freno de seguridad**: mandó cortar la
  cuerda mientras él estaba en la plataforma, y no se cayó. Gracias a frenos así podemos construir rascacielos.
- Los ascensores de verdad llevan un **contrapeso** al otro lado de la cuerda, casi tan pesado como la cabina: el
  motor solo tiene que subir la diferencia, y ahorra mucha energía.

Ver también: [Empujadores](217), [Proyectos mecánicos](219), [Memoria y retardos](210), [Interruptores](207).
