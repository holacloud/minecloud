# Programar el robot

![Robot](item:robot)

Un **programa** es una lista de órdenes que el [robot](193) sigue **en orden, de arriba abajo**, sin saltarse
ninguna. El robot no piensa por su cuenta: hace exactamente lo que pone, ¡ni más ni menos! Si algo sale raro, el
fallo casi siempre está en el programa. Encontrarlo y arreglarlo se llama **depurar**.

En el panel las instrucciones están en inglés. Aquí tienes qué hace cada una.

## Moverse (azul)

| Bloque | Qué hace |
|---|---|
| `Move forward` | Avanza **un** bloque hacia donde mira. |
| `Move back` | Retrocede un bloque, sin girarse. |
| `Turn left` | Gira un cuarto de vuelta a la izquierda. |
| `Turn right` | Gira un cuarto de vuelta a la derecha. |
| `Move up` | Sube un bloque. |
| `Move down` | Baja un bloque. |

- Solo se mueve a sitios **vacíos** (aire, hierba alta, flores o agua). Si hay un bloque, se para y avisa:
  «There is Stone in my way».
- Mientras trabaja **no se cae**: puede flotar, pero como mucho **3 bloques** por encima del suelo o del agua.
  Si está justo encima del suelo, puede dar **un paso** al vacío por encima de un hueco: así hace puentes.

## Cavar (naranja)

| Bloque | Qué hace |
|---|---|
| `Dig ahead` | Cava el bloque de delante. |
| `Dig up` | Cava el bloque de encima. |
| `Dig down` | Cava el bloque de debajo. |

- Lo que cava va a **su inventario**. Si ahí no hay nada, no pasa nada y sigue con la siguiente orden.
- No puede con la roca madre: se para y dice «I can't dig Bedrock: it is unbreakable».

## Construir (verde)

| Bloque | Qué hace |
|---|---|
| `Place ahead` | Pone un bloque delante. |
| `Place up` | Pone un bloque encima. |
| `Place down` | Pone un bloque debajo. |

- Los bloques salen de **su inventario**: dáselos antes con **Give**.
- En la casilla eliges **cuál**. Con *any block I carry* usa el primero que tenga.
- Si el sitio ya está ocupado por un bloque, no hace nada. La hierba alta, las flores y el agua sí las tapa.

## Bucles y decisiones (amarillo)

Estos bloques tienen **un hueco dentro** donde se meten otras instrucciones.

### Repeat (repetir)

`Repeat 4 times` hace lo que tiene dentro **4 veces seguidas**. En vez de escribir cuatro veces `Move forward`:

- `Repeat 4 times`
  - `Move forward`

¡Y se pueden meter bucles dentro de bucles! Este robot recorre un cuadrado:

- `Repeat 4 times`
  - `Repeat 3 times`
    - `Move forward`
  - `Turn right`

### If ... else (si ... si no)

`If` **pregunta algo** y elige un camino. Si la respuesta es **sí**, hace lo de arriba; si es **no**, lo de
*else*. Una de las dos partes puede quedarse vacía.

- `If` *block ahead is* `Coal Ore`
  - `Say` "¡Carbón!"
  - `Dig ahead`
- else
  - `Turn right`

### While (mientras)

`While` es un bucle que **pregunta antes de cada vuelta**: mientras la respuesta sea sí, repite. Cuando sea no,
sigue con lo de después. Este robot avanza hasta chocar con algo:

- `While` **not** *block ahead is solid*
  - `Move forward`

Con *always* («siempre») el bucle no termina nunca, hasta que pulses **Stop**.

### Las preguntas

| Pregunta | Es «sí» cuando... |
|---|---|
| *block ahead / above / below is air* | delante / encima / debajo no hay nada |
| *block ahead / above / below is solid* | hay un bloque macizo (no hierba alta, flores ni agua) |
| *block ahead / above / below is* `X` | hay justo ese bloque (eliges cuál) |
| *my inventory is full* | sus 9 huecos están ocupados (no le cabe un tipo de bloque nuevo) |
| *my inventory is empty* | no lleva nada |
| *I have* `X` | lleva al menos un bloque de ese tipo |
| *always* | siempre |

Marca **not** para darle la vuelta: *not block ahead is solid* significa «delante **no** hay un bloque macizo».

## Otras (morado)

| Bloque | Qué hace |
|---|---|
| `Wait` | Espera de 0,5 a 10 segundos. |
| `Say` | Dice un texto (hasta 40 letras) en un bocadillo sobre su cabeza. |

## Ejemplos

### Un túnel de 3 × 3

Ponlo delante de una ladera y dale un buen inventario vacío. Cava 5 bloques de largo; cambia el 5 para más.

- `Repeat 5 times`
  - `Dig ahead`
  - `Move forward`
  - `Repeat 2 times`
    - `Turn left`
    - `Dig ahead`
    - `Turn right`
    - `Turn right`
    - `Dig ahead`
    - `Turn left`
    - `Dig up`
    - `Move up`
  - `Turn left`
  - `Dig ahead`
  - `Turn right`
  - `Turn right`
  - `Dig ahead`
  - `Turn left`
  - `Move down`
  - `Move down`

Cómo funciona: en cada paso avanza por la fila de abajo, cava a los lados, sube y vuelve a cavar a los lados, y
así hasta la fila de arriba. Luego baja otra vez para el siguiente paso.

### Un muro

Dale al menos 15 bloques. Construye delante de él un muro de 5 de largo y 3 de alto, y se va moviendo de lado.

- `Repeat 5 times`
  - `Repeat 3 times`
    - `Place ahead`
    - `Move up`
  - `Repeat 3 times`
    - `Move down`
  - `Turn right`
  - `Move forward`
  - `Turn left`

### Una escalera

Dale 5 bloques. Cada escalón está un bloque más alto y un bloque más adelante.

- `Repeat 5 times`
  - `Place ahead`
  - `Move up`
  - `Move forward`

### Un puente

Ponlo en la orilla, mirando al agua o al barranco, y dale bloques. Rellena los huecos de debajo mientras avanza.

- `Repeat 10 times`
  - `If` *block below is solid*
    - (vacío)
  - else
    - `Place down`
  - `Move forward`

¿Te has fijado? El `If` con la parte de arriba vacía es lo mismo que `If` **not** *block below is solid*. ¡Prueba
a cambiarlo!

## Trucos para programar

- **Empieza pequeño**: prueba primero 2 o 3 instrucciones, y añade más cuando funcionen.
- Usa **Step** para ver el programa paso a paso. La instrucción que toca se ilumina.
- Cuando el robot se para con un error, la instrucción que falló sale **en rojo**.
- Haz el ejercicio de **ser el robot**: lee el programa en voz alta y muévete tú como diría.

Ver también: [Robot programable](193), [Retos de programación](195).
