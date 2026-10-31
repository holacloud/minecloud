# Bloque de sonido

![Bloque de sonido](item:sound_block)

Un bloque morado que **toca una nota** cuando lo pulsas. Con varios puedes componer melodías, timbres y
xilófonos gigantes.

| Nombre en el juego | Id | Rotura |
|---|---|---|
| Sound Block | `sound_block` | 0,55 s |

## Cómo conseguirlo

| Receta (tecla C) | Ingredientes |
|---|---|
| 1 `sound_block` | 2 `planks` + 1 `cobblestone` + 1 `coal_ore` |

## Cómo se usa

Mira el bloque (hasta 5 bloques de distancia) y:

- **F:** lo **toca**.
- **Mayúsculas + F:** lo **afina**. El chat dice cómo ha quedado, por ejemplo «Sound block set to flute note 4».

El inspector de bloques muestra su instrumento y su nota. Un bloque recién colocado es una **campana, nota 1**.

**Instrumentos:**

| Instrumento | Cómo suena |
|---|---|
| `bell` (campana) | brillante, una octava más aguda |
| `drum` (tambor) | un golpe seco; **siempre suena igual**, sea cual sea la nota |
| `pluck` (pellizco) | corto, como una cuerda pulsada |
| `flute` (flauta) | suave y largo |
| `bass` (bajo) | grave, una octava más baja |

**Notas:** la escala de **do mayor**, del do central al do siguiente:

| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|
| do | re | mi | fa | sol | la | si | do |

## El truco de la afinación

Cada **Mayúsculas + F** cambia **a la vez** el instrumento (al siguiente de 5) y la nota (a la siguiente de 8).
Como 5 y 8 no tienen divisores comunes, se pueden conseguir las **40 combinaciones**, pero hay que contar.
Pulsaciones necesarias desde un bloque recién colocado:

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| campana | 0 | 25 | 10 | 35 | 20 | 5 | 30 | 15 |
| tambor | 16 | 1 | 26 | 11 | 36 | 21 | 6 | 31 |
| pellizco | 32 | 17 | 2 | 27 | 12 | 37 | 22 | 7 |
| flauta | 8 | 33 | 18 | 3 | 28 | 13 | 38 | 23 |
| bajo | 24 | 9 | 34 | 19 | 4 | 29 | 14 | 39 |

A las 40 pulsaciones vuelve a ser campana, nota 1. Para el tambor basta **1** pulsación.

## Trucos

- Se oye hasta unos **18 bloques**; jugando en línea, lo oyen todos los que estén cerca.
- Pon una fila de bloques afinados (do, re, mi…) y recórrela pulsando F en cada uno: ¡un xilófono!
- Un bloque de sonido junto a la puerta hace de **timbre**.

## Curiosidades

- El do central suena a unos **262 hercios** (vibraciones por segundo) y el la, a **440**: la nota con la que
  afinan las orquestas.
- Subir una octava es **doblar** la frecuencia: el do de arriba vibra a 523 Hz.
- Los nombres do, re, mi… vienen de un himno medieval en latín a San Juan.

Ver también: [Jugar con otros](13).
