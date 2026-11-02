# Memoria y retardos

![Biestable](item:latch)

Las [puertas lógicas](209) contestan a lo que pasa **ahora**. Estas dos piezas tienen que ver con el **tiempo**: el
retardo recuerda lo que pasó hace un rato, y el biestable recuerda para siempre.

| | Bloque | Id | Entradas | Receta (tecla C) |
|---|---|---|---|---|
| ![](item:delay_gate) | Retardo | `delay_gate` | atrás | **2** con 1 `element_si` + 2 `copper_wire` + 1 `cobblestone` |
| ![](item:latch) | Biestable (memoria) | `latch` | izquierda = SET, derecha = RESET | **1** con 2 `element_si` + 2 `copper_wire` + 1 `cobblestone` |

Como las demás puertas, se colocan con la flecha hacia donde miras, sus entradas no conducen, y encendidas unen lo
que tocan por las demás caras.

## Retardo

Hace **lo mismo que su entrada, pero unos segundos más tarde**. Si la entrada se enciende, la salida se enciende 1
segundo después; si se apaga, se apaga 1 segundo después. Es como un eco.

- **Clic derecho** cambia el tiempo: **1, 2, 3 o 4 segundos** (y vuelve a 1). Los puntitos de encima te dicen
  cuántos.
- Recuerda los cambios rápidos: si la entrada se enciende y se apaga dos veces, la salida también "parpadea" dos
  veces, más tarde.
- Si el servidor se reinicia, lo que estaba "de camino" dentro del retardo se pierde.

### Para qué sirve

- **Puertas que se cierran solas**: una puerta que se abre al pisar una placa y se cierra unos segundos después de
  bajarte (ver [Circuitos de ejemplo](211)).
- **Secuencias**: varios retardos en fila encienden lámparas una detrás de otra, como las luces de una pista.
- **Intermitentes**: una puerta NOT con un retardo de 1 s justo delante, y un cable que vuelve desde la salida del
  retardo hasta la entrada (atrás) de la NOT, sin tocar nada más. Se enciende y se apaga solo, más o menos cada
  segundo.

## Biestable (memoria)

Un biestable **recuerda** un bit: encendido o apagado. Sus dos entradas son como los botones de una alarma:

- **SET** (izquierda) lo **enciende**.
- **RESET** (derecha) lo **apaga**.
- Si ninguna está encendida, **se queda como estaba**. Esa es su memoria.
- Si las dos lo están, gana RESET.

| SET | RESET | Salida |
|---|---|---|
| 0 | 0 | la de antes (recuerda) |
| 1 | 0 | **1** |
| 0 | 1 | 0 |
| 1 | 1 | 0 |

Con dos [pulsadores](207), uno en cada entrada, tienes un interruptor de "encender" y otro de "apagar", como en las
máquinas de las fábricas. La memoria está en su nombre de bloque, así que **sobrevive** a un reinicio del
servidor.

En inglés se llama *latch* o *SR flip-flop*. La memoria de un ordenador está hecha de millones de piezas así.

## Curiosidades

- Los semáforos funcionan con **temporizadores**: verde unos segundos, ámbar, rojo...
- La memoria **RAM** de un ordenador guarda cada bit en un circuito parecido a un biestable (o en un condensador
  diminuto), y lo olvida todo si se queda sin corriente.

Ver también: [Puertas lógicas](209), [Circuitos de ejemplo](211), [Lógica para curiosos](212).
