# Bombilla

![Bombilla](item:light_bulb)

Una pequeña luz eléctrica: un **filamento de wolframio** dentro de un vidrio lleno de argón. Dale corriente y brilla en amarillo. Sin corriente es un vidrio apagado con una espiral oscura.

| | Nombre en el juego | Id |
|---|---|---|
| ![](item:light_bulb) | Light Bulb | `light_bulb` |

## Cómo conseguirlo

En la [mesa de laboratorio](117), con una reacción que hay que **descubrir**: en la lista aparece como «???» hasta que mezclas en el matraz los átomos justos. Pista:

> *Un filamento del metal más difícil de fundir, en un vidrio lleno de un gas perezoso, da luz cálida.*

## Para qué sirve

- Se coloca como cualquier bloque. Rotura: **0,2 s**.
- Es un [consumidor](204) de **5 W**: necesita un generador o una batería tocándola, o un [cable de cobre](202) hasta uno. Se une a las redes como cualquier bloque eléctrico, y la corriente pasa a través de ella.
- Con corriente da **luz de nivel 7**, la mitad que una [lámpara eléctrica](204), que da 14, y gasta la mitad. Sigue encendida de día y de noche mientras su red tenga corriente.
- Basta para iluminar un [microscopio](238) a dos bloques o menos, aunque más tenue que una lámpara o que el sol.
- Con vidrio y cable de cobre se convierte en dos [lámparas eléctricas](204).
- Si colocaste bombillas antes de que usaran corriente, valen tal como están: el servidor se entera de cada una en cuanto alguien se acerca. Solo se quedan apagadas hasta que les des corriente.

## Cómo funciona una bombilla de filamento

A la electricidad le cuesta pasar por la espiral finísima de **wolframio**, y eso la calienta, hasta unos **2500 °C**: lo bastante para brillar en blanco. Se usa wolframio porque ningún otro metal aguanta tanto calor: se funde a 3422 °C.

Al aire, el filamento se quemaría en un momento, porque el wolframio caliente y el oxígeno reaccionan enseguida, así que dentro no hay aire. Y aun así, el metal caliente se va evaporando despacio, átomo a átomo, y deja una mancha oscura en el vidrio. Un gas que no reacciona con nada, el [argón](156), lo aprieta y **frena eso**, de modo que la bombilla dura muchos cientos de horas. Al final se rompe el punto más fino de la espiral, y la bombilla se funde.

## Curiosidades

- Edison presentó su bombilla de filamento de carbono en 1879; el wolframio la mejoró unos años después.
- Solo alrededor del 5 % de la electricidad de una bombilla de filamento se convierte en luz: lo demás es calor, y por eso quemaban al tocarlas.
- Hoy casi todas las bombillas son LED, que dan la misma luz con mucha menos energía.
- Una bombilla real de filamento de 5 W solo es una luz de noche; las que iluminaban una habitación gastaban de 40 a 100 W. En el juego, los números están ajustados para jugar.

## Solución

Si prefieres descubrirla tú, no sigas leyendo.

| Reacción | Tipo | Producto |
|---|---|---|
| `W + Ar → W + Ar (bombilla)` | dispositivo | 4 `light_bulb` (gasta 1 `glass`) |

Ver también: [Química](115), [Wolframio](170), [Argón](156), [Lámpara de neón](125).
