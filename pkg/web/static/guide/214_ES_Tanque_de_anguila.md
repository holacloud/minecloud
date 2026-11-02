# Tanque de anguila

![Tanque de anguila](item:eel_tank)

Una pecera de vidrio llena de agua, con **placas de cobre** en el fondo que recogen la corriente. Con una
[anguila eléctrica](213) dentro es un **generador vivo**: da electricidad de día y de noche, sin sol ni viento.

| | Nombre en el juego | Id |
|---|---|---|
| ![](item:eel_tank) | Eel Tank | `eel_tank` (con anguila: `eel_tank:full`) |
| ![](item:eel_bucket) | Eel Bucket | `eel_bucket` |

## Cómo conseguirlo

| Receta (tecla C) | Ingredientes |
|---|---|
| 1 `eel_tank` | 4 `glass` + 1 `water_bucket` + 2 `copper_wire` |

El [cubo](111) de agua se queda dentro del tanque. El cable de cobre se fabrica en [Cables y redes](202).

## Paso a paso

1. **Atrapa una anguila:** con un ![cubo](item:bucket) **cubo vacío** en la mano, haz **clic derecho** cerca de
   una anguila (a menos de 4,5 bloques). Te llevas un ![cubo con anguila](item:eel_bucket) `eel_bucket`. Mejor
   desde la orilla: si te metes en el agua, ¡te puede dar una descarga!
2. **Coloca el tanque** como cualquier bloque.
3. **Mete la anguila:** haz clic derecho en el tanque con el `eel_bucket`. La anguila entra (la verás nadar en
   círculos dentro) y recuperas el cubo vacío.
4. **Conéctalo** a tu red como cualquier generador: un [cable](202), una [batería](203) o una [lámpara](204) que lo
   toque por una cara.

## El generador

| Estado | Potencia |
|---|---|
| Tanque vacío | 0 W |
| Con anguila | **25 W**, día y noche |
| Recién alimentada | **50 W** durante 10 s por cada pescado (hasta 30 s seguidos) |

- **Dar de comer:** haz clic derecho en el tanque con ![pescado crudo](item:raw_fish) `raw_fish`. La anguila se lo
  traga, nada más deprisa y saltan chispas dentro del tanque: durante **10 segundos** da **50 W**. Si le das varios
  pescados seguidos, el efecto se suma hasta 30 segundos.
- 25 W bastan para dos [lámparas](204) de 10 W toda la noche, y en un día de MineCloud (4 minutos) recogen unos 6 kJ:
  ¡dos [baterías](203) llenas!
- El [multímetro](205) la muestra como fuente `eel`.

## Sacarla o soltarla

- **Sacarla:** clic derecho en el tanque con un **cubo vacío**. Vuelves a tener el `eel_bucket` y el tanque se
  queda vacío.
- **Soltarla:** usa el `eel_bucket` apuntando a agua de al menos **2 bloques** de hondo. La anguila vuelve al agua y
  recuperas el cubo.
- Si **rompes** un tanque con anguila, ¡la anguila sale al suelo! Atrápala rápido con un cubo (si cae junto al
  agua, vuelve a ella sola): fuera del agua solo aguanta un minuto. El tanque se recoge vacío.

## Ciencia: un ser vivo como pila

Una anguila eléctrica tiene miles de **electrocitos**, células que funcionan como pequeñas pilas de unos 0,15 V.
Están colocadas **en serie**, una detrás de otra, como las pilas de una linterna: los voltios se suman y llegan a
cientos. Las filas de electrocitos, además, están **en paralelo**, una al lado de otra, y así suman corriente. Las
pilas de verdad se conectan igual: en serie suben los voltios; en paralelo, la corriente (en el juego, las
[baterías](203) de una red simplemente suman su energía).

En el juego todo está ajustado para jugar (ver [Electricidad](200)). Una anguila de verdad solo descarga a ratos y
se cansa, así que nadie la usa para dar luz a una casa... aunque algunos acuarios han encendido las luces de su
árbol de Navidad con las descargas de su anguila.

Ver también: [Anguila eléctrica](213), [Generadores](201).
