# Multímetro

![Multímetro](item:multimeter)

La herramienta del electricista: **mide** lo que pasa en una red.

| | Objeto | Id | Receta (tecla C) |
|---|---|---|---|
| ![](item:multimeter) | Multímetro | `multimeter` | 2 `copper_wire` + 1 `iron_ore` + 1 `glass` |

## Cómo se usa

Llévalo en la mano y **haz clic derecho en cualquier bloque eléctrico** (un cable, un generador, una batería, una
lámpara...). Un panel en la esquina muestra la lectura de **toda su red**, y se actualiza cada segundo mientras sigas
con el multímetro en la mano. Cambia de objeto para guardarlo.

| Línea | Qué significa |
|---|---|
| **This block** (este bloque) | qué hace ese bloque: cuántos vatios da (generador) o usa (consumidor), o cuánta energía guarda (batería) |
| **Generation** (generación) | la potencia de todos los generadores juntos, y cuánto da cada tipo (solar, wind = viento, water = agua, crank = manivela) |
| **Demand** (demanda) | la potencia que necesitan todos los consumidores |
| **Balance** | generación menos demanda. Positivo (+): sobra potencia. Negativo (−): falta |
| **Stored** (guardado) | la energía de las baterías, en kJ y Wh, y el porcentaje |
| **Batteries last** / **Full in** | cuánto falta para que las baterías se vacíen (o se llenen) a este ritmo |
| **Status** (estado) | **ON** (todos los consumidores funcionan) u **OFF** (apagón: no llega la potencia) |
| **Network** (red) | cuántos bloques tiene y de qué tipos |

Si dice que la red es **demasiado grande** (*too big*), tiene más de 512 bloques y no funciona: divídela (ver
[Cables y redes](202)).

## Cosas que probar

- Mide una placa solar al amanecer, a mediodía y por la tarde: verás la potencia subir y bajar con el sol.
- Mide un aerogenerador al pie de una colina y otro en la cima.
- Pon en una red una lámpara, luego dos, luego un motor, y mira la **demanda** y el **balance**.
- Gira una [manivela](201) y mira cuántos vatios da.

## Curiosidades

- Un multímetro de verdad mide **voltios** (con cuánta fuerza empuja la electricidad), **amperios** (cuánta corriente
  pasa) y **ohmios** (cuánto le cuesta pasar). La potencia es voltios × amperios.

Ver también: [Electricidad](200), [Baterías](203).
