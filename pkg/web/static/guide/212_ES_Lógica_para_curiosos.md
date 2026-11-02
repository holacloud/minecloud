# Lógica para curiosos

![Puerta NOT](item:not_gate)

¿Cómo puede una máquina "pensar" con interruptores? Esta página cuenta la idea, sin prisas.

## Todo es sí o no

Un interruptor solo tiene **dos estados**: encendido o apagado. Los llamamos **1** y **0**, y a cada uno, un
**bit** (de *binary digit*, dígito binario). Parece poco, pero con varios bits se puede guardar cualquier cosa:

- Con **1** bit hay 2 posibilidades: 0, 1.
- Con **2** bits, 4: 00, 01, 10, 11.
- Con **3** bits, 8. Cada bit más **duplica** las posibilidades.
- Con **8** bits (un **byte**) hay 256: suficiente para una letra.

## Contar en binario

Nosotros contamos en **base 10**: cada cifra vale 10 veces más que la de su derecha (unidades, decenas,
centenas...). En **binario**, base 2, cada cifra vale **el doble** que la de su derecha: 1, 2, 4, 8, 16...

| Binario | Cuenta | Decimal |
|---|---|---|
| 0 | | 0 |
| 1 | 1 | 1 |
| 10 | 2 | 2 |
| 11 | 2 + 1 | 3 |
| 100 | 4 | 4 |
| 101 | 4 + 1 | 5 |
| 110 | 4 + 2 | 6 |
| 111 | 4 + 2 + 1 | 7 |
| 1000 | 8 | 8 |

**Reto:** pon 4 palancas en fila y cuenta del 0 al 15 subiendo y bajando mangos. ¿Qué número es "1101"?

## George Boole

Hace casi 200 años, en 1854, un profesor inglés llamado **George Boole** escribió un libro sobre cómo razonar con
solo dos valores, *verdadero* y *falso*, y tres palabras: **Y**, **O** y **NO**. A eso se le llama **álgebra de
Boole**. Durante mucho tiempo pareció un juego de matemáticos... hasta que en 1937 un estudiante, **Claude
Shannon**, se dio cuenta de que los circuitos de interruptores funcionan exactamente así:

- Dos interruptores **en fila** (uno detrás de otro) solo dejan pasar la corriente si los dos están encendidos: **Y**
  ([AND](209)).
- Dos interruptores **uno al lado del otro** (en paralelo) la dejan pasar si cualquiera está encendido: **O**
  ([OR](209)).

¡Pruébalo en MineCloud con dos palancas, una batería y una lámpara!

## Sumar con puertas

Sumar dos bits es fácil:

| A | B | Suma | Me llevo |
|---|---|---|---|
| 0 | 0 | 0 | 0 |
| 0 | 1 | 1 | 0 |
| 1 | 0 | 1 | 0 |
| 1 | 1 | 0 | 1 |

Fíjate: la columna **Suma** es la tabla de la **XOR**, y la de **Me llevo** es la de la **AND**. Con una XOR y una
AND tienes un **semisumador**: el primer paso de una calculadora. Juntando muchos se suman números enormes.

## Cómo usan las puertas los ordenadores

- El **procesador** de un ordenador o de un móvil tiene **miles de millones** de puertas lógicas diminutas, hechas de
  **transistores** de [silicio](152). Por eso las puertas de MineCloud se fabrican con silicio.
- Cambian de estado **miles de millones de veces por segundo**. Las de MineCloud, 5 veces por segundo: ¡algo más
  tranquilas!
- La **memoria** guarda bits en circuitos como el [biestable](210).
- Todo lo que ves en una pantalla (este texto, las fotos, los juegos) son, al final, montones de ceros y unos.

## Para pensar

- Con puertas NOT y AND se pueden construir **todas** las demás. ¿Sabes hacer una OR con NOT y AND? (Pista: "A o B"
  es lo mismo que "no es verdad que ni A ni B".)
- ¿Cuántas palancas necesitas para elegir uno de los 7 días de la semana?

Ver también: [Puertas lógicas](209), [Memoria y retardos](210), [Programar el robot](194).
