# Ascensores

![Torno de ascensor](item:lift_winch)

Un **ascensor** es una plataforma colgada con cuerdas de un **torno** que está encima. El torno es un
[motor eléctrico](204) con un tambor: con energía **enrolla las cuerdas** y la plataforma **sube**; sin energía, su
freno suelta las cuerdas despacio y la plataforma **baja**. Súbete y te lleva de un piso a otro.

| | Bloque | Id | Potencia | Receta (tecla C) |
|---|---|---|---|---|
| ![](item:lift_winch) | Torno de ascensor | `lift_winch` | **60 W** | **1** con 1 `electric_motor` + 3 `iron_ore` + 4 `copper_wire` |
| ![](item:lift_platform) | Plataforma de ascensor | `lift_platform` | — | **2** con 4 `planks` + 1 `iron_ore` |
| ![](item:lift_stop) | Parada de ascensor | `lift_stop` | — | **2** con 1 `iron_ore` + 1 `glass` + 2 `copper_wire` |

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

## Paradas: un ascensor para todos los pisos

Un ascensor con solo un torno conoce dos sitios: arriba y abajo. Una **parada** le da todos los pisos de en medio.

1. Construye el hueco, la plataforma y el torno como arriba, y da energía al torno **todo el rato**: un generador o
   una batería que lo toque, sin palanca.
2. En cada piso, pon una **parada** en la pared del hueco, **3 bloques por encima del suelo que pisas**: justo sobre
   una puerta de dos bloques de alto, para que su cara mire al rellano y al hueco.
3. **Haz clic derecho en una parada**: el ascensor va allí.

Ese es todo el cableado: **un bloque por piso**. Las reglas, todas:

- **Manda la última parada que llamas.** Llamar a una libera la anterior: una llamada cada vez.
- El ascensor va **directo, subiendo o bajando**, desde donde esté, y se queda allí, 3 bloques por debajo de la parada
  (igual que se para 3 por debajo del torno: el sitio para ti). La parada recuerda la llamada, así que basta con una vez.
- Con paradas en el hueco, un ascensor con energía se mueve **solo** cuando una lo llama: ya no sube hasta arriba por
  su cuenta.
- **Si se va la luz** las paradas no cuentan: el ascensor baja despacito, como siempre, y se apoya abajo. Cuando vuelve
  la energía, regresa a la parada que estaba llamada.
- Nunca baja encima de un jugador que esté en el hueco. Un bloque en el hueco lo detiene hasta que lo quitas, como
  siempre.

La parada enseña lo que pasa: **oscura** si está libre, **ámbar** si el ascensor viene de camino, **verde** cuando el
ascensor está parado allí.

### Botones lejos del hueco

La cara de **arriba** de una parada es su única entrada, como la entrada de una puerta lógica: una señal que se
enciende ahí es una llamada. Así que un [pulsador](207) justo encima de la parada es otra forma de llamarla, y un
[cable](202) desde su cara de arriba lleva el botón adonde quieras. Una [palanca](207) la llama una vez al encenderla:
no retiene el ascensor si luego se llama otra parada.

### Un sensor

Mientras el ascensor **está parado** en una parada (no mientras pasa de largo), la parada está **encendida**: conduce
por todas sus caras menos la de arriba, como un interruptor en un cable. Batería, parada, lámpara: una lámpara que
dice que el ascensor está aquí. También puedes llevar esa señal a una [puerta lógica](209).

### La puerta que no se abre sobre un hueco vacío

Pon una [puerta de hierro](197) justo debajo de la parada (o tocándola de cualquier manera). **Se abre sola** cuando el
ascensor está parado allí y **se cierra cuando se va**, sin motor y sin energía, y **ninguna mano puede abrirla**: nadie
entra en el hueco sin querer. Las puertas de madera no hacen esto.

### Lo que no puede hacer

- Las paradas están en la pared, así que se quedan ahí mientras subes: solo alcanzas la de tu piso y la siguiente hacia
  arriba (la mano llega a 4,5 bloques, y la plataforma tapa lo que hay debajo). En el [ascensor de los
  apartamentos](219) verás dos botones que te llevan a todo lo demás.
- Una parada sirve al hueco que tiene al lado. No compartas un bloque de pared entre dos huecos: responderían los dos
  ascensores.
- La cuerda sigue siendo de 48 bloques como mucho.

## Montar en él

Quédate quieto sobre la plataforma: te lleva sin tirones. Puedes saltar mientras se mueve y bajarte en un piso.
Los demás jugadores también te ven subir. La plataforma se dibuja deslizándose entre los bloques; en el servidor
se mueve de bloque en bloque.

## Cómo lo calcula el juego

El **servidor** mueve el bloque de la plataforma, cinco veces por segundo, para todos: la plataforma es un bloque
normal del mundo, así que el ascensor sigue donde estaba cuando el servidor se reinicia. Mira la red del torno con el
[multímetro](205): gasta **60 W** todo el rato que tiene energía, también mientras espera arriba o en una parada.
Apunta con el multímetro a una parada para ver si está libre, llamada o con el ascensor. La llamada se guarda en el
bloque, así que un ascensor que iba de camino cuando el servidor se reinicia sigue su viaje al volver.

## Curiosidades

- En 1853 Elisha Otis enseñó en una feria de Nueva York un ascensor con **freno de seguridad**: mandó cortar la
  cuerda mientras él estaba en la plataforma, y no se cayó. Gracias a frenos así podemos construir rascacielos.
- Los ascensores de verdad llevan un **contrapeso** al otro lado de la cuerda, casi tan pesado como la cabina: el
  motor solo tiene que subir la diferencia, y ahorra mucha energía.

Ver también: [Empujadores](217), [Proyectos mecánicos](219), [Memoria y retardos](210), [Interruptores](207).
