# Puertas lógicas

![Puerta AND](item:and_gate)

Una **puerta lógica** es un [interruptor](207) que **decide solo**, mirando sus **entradas**. Si la respuesta es
"sí", se enciende: conduce y une las redes que toca. Si es "no", se apaga y las corta. Es la pieza con la que se
construyen los ordenadores (lo cuenta [Lógica para curiosos](212)).

## Cómo es una puerta

Son placas finas con un dibujo encima:

- Una **flecha** roja: señala la **salida**. Cuando colocas la puerta, la flecha apunta **hacia donde miras**. Se
  ilumina cuando la puerta está encendida.
- Unas **almohadillas de cobre** en los bordes: son las **entradas**.
- Un **símbolo** en el centro, el de las normas de electrónica: `&`, `≥1`, `=1`, `1`.

Las entradas, mirando hacia donde apunta la flecha:

| Puerta | Entradas |
|---|---|
| AND, OR, XOR | **izquierda** (A) y **derecha** (B) |
| NOT, [retardo](210) | **atrás** |
| [Biestable](210) | izquierda = **SET**, derecha = **RESET** |

**Las caras de entrada nunca conducen**: solo escuchan. Todas las demás caras (delante, los lados libres, arriba y
abajo) se unen a lo que tocan **cuando la puerta está encendida**. Una puerta encendida es como una palanca que se
ha movido sola.

## ¿Cuándo está encendida una entrada?

Una entrada recibe **señal** ("sí", o 1) cuando lo que la toca es:

- un **interruptor, sensor o puerta encendidos** (o un cable unido a uno de ellos), **aunque no haya batería**, o
- un cable o bloque de una red **con electricidad**: un generador que funciona o una batería con carga (y sin
  apagón).

Si no, la entrada es "no" (0). Así una palanca pegada a una puerta ya le dice "sí", y puedes encadenar puertas sin
pilas. Para **encender lámparas o motores**, en cambio, hace falta energía de verdad: pon la batería en una cara de
la puerta y la lámpara en otra.

> El [multímetro](205) te dice si una red lleva **señal**.

## Las cuatro puertas

En las tablas, 0 es "no" (apagado) y 1 es "sí" (encendido). Se llaman **tablas de verdad**.

### AND (Y) ![](item:and_gate)

Encendida solo si **A y B** están encendidas. Como una caja fuerte con dos llaves.

| A | B | Salida |
|---|---|---|
| 0 | 0 | 0 |
| 0 | 1 | 0 |
| 1 | 0 | 0 |
| 1 | 1 | **1** |

### OR (O) ![](item:or_gate)

Encendida si **A o B** (o las dos) están encendidas. Como un timbre con dos pulsadores, uno en cada puerta de casa.

| A | B | Salida |
|---|---|---|
| 0 | 0 | 0 |
| 0 | 1 | **1** |
| 1 | 0 | **1** |
| 1 | 1 | **1** |

### XOR (O exclusiva) ![](item:xor_gate)

Encendida si **A y B son distintas**: una sí y la otra no. Es la de la **luz de la escalera**: cualquiera de los dos
interruptores la cambia.

| A | B | Salida |
|---|---|---|
| 0 | 0 | 0 |
| 0 | 1 | **1** |
| 1 | 0 | **1** |
| 1 | 1 | 0 |

### NOT (NO, inversor) ![](item:not_gate)

Tiene **una** entrada, atrás, y hace **lo contrario**: encendida cuando la entrada está apagada.

| Entrada | Salida |
|---|---|
| 0 | **1** |
| 1 | 0 |

## Recetas (tecla C)

Las puertas son **chips de silicio** ([silicio](152), `element_si`):

| Receta | Ingredientes |
|---|---|
| **2** `and_gate`, **2** `or_gate`, **2** `xor_gate`, **2** `not_gate` | 1 `element_si` + 2 `copper_wire` + 1 `cobblestone` |

## Tiempo

Cada puerta tarda **0,2 segundos** en responder (el servidor mira los circuitos 5 veces por segundo). Una cadena de
cinco puertas tarda un segundo. Si conectas la salida de una puerta NOT a su propia entrada, cambia 5 veces por
segundo (encendida, apagada, encendida...) sin parar: ¡has hecho un **oscilador**! (El servidor no deja que vaya más deprisa.)

## Consejos

- **Separa los cables de entrada de los de salida**: si un cable de salida toca a uno de entrada, la puerta se
  escucha a sí misma.
- Coloca la puerta mirando hacia donde quieres que vaya la corriente: la flecha apunta hacia donde miras.
- Las puertas no se accionan con clic derecho (salvo el [retardo](210)): puedes poner bloques pegados a ellas sin
  agacharte.

Ver también: [Memoria y retardos](210), [Circuitos de ejemplo](211), [Lógica para curiosos](212).
