# Sensores

![Sensor de luz diurna](item:daylight_sensor)

Un **sensor** es un [interruptor](207) que **se mueve solo**: mira algo del mundo y se enciende o se apaga sin que
lo toques. Encendido conduce y une las redes que toca; apagado las corta. Todos son losas bajas con una ventana
encima, y una franja verde en el costado que se ilumina cuando están encendidos.

| | Bloque | Id | Encendido cuando... | Receta (tecla C) |
|---|---|---|---|---|
| ![](item:daylight_sensor) | Sensor de luz diurna | `daylight_sensor` | es de **día** (o de **noche**, en modo noche) | 1 `glass` + 1 `planks` + 2 `copper_wire` |
| ![](item:proximity_sensor) | Sensor de proximidad | `proximity_sensor` | hay un **jugador a 5 bloques** o menos | 1 `iron_ore` + 1 `glass` + 2 `copper_wire` |
| ![](item:rain_sensor) | Sensor de lluvia | `rain_sensor` | **llueve** | 1 `cobblestone` + 3 `copper_wire` |

## Sensor de luz diurna

Lleva una célula que nota la luz del sol, como una [placa solar](201) pequeñita. Tiene **dos modos**, y se
cambian con **clic derecho**:

- **Modo día** (dibujo de un sol): encendido de día, apagado de noche.
- **Modo noche** (dibujo de una luna): al revés, encendido de noche. Es el que quieres para las **farolas**.

Sigue el reloj del juego, no las nubes: aunque llueva, de día es de día. No necesita ver el cielo.

## Sensor de proximidad

Se enciende cuando un **jugador** está a **5 bloques** o menos (en cualquier dirección, también atravesando
paredes) y se apaga cuando se aleja. Sirve para luces que te reciben, puertas automáticas y alarmas. Como la
[placa de presión](207), no nota a los animales.

## Sensor de lluvia

Dos pistas de cobre muy juntas: cuando el agua de lluvia las moja, une una con otra y pasa la corriente. Se
enciende **mientras llueve**. En MineCloud llueve pocos días (más o menos 1 de cada 20), un chaparrón de uno o dos
minutos; la [estación meteorológica](112) te ayuda a saber cuándo.

## ¿Y un sensor de luz para las antorchas?

No hace falta: el sensor de luz diurna ya sabe si es de día, y una lámpara eléctrica encendida haría que un sensor
de luz se viera a sí mismo.

## Cómo lo calcula el juego

Como todo lo eléctrico, en el **servidor**, 5 veces por segundo. Los sensores siguen funcionando aunque no haya
nadie cerca (menos el de proximidad, claro).

## Curiosidades

- Las farolas de verdad llevan un **fotocélula**: un sensor de luz que las enciende al anochecer.
- Las puertas de los supermercados que se abren solas usan sensores de **infrarrojos** o de **microondas** para
  notar que te acercas.
- Muchos coches tienen un sensor de lluvia en el parabrisas que pone en marcha los limpiaparabrisas.

Ver también: [Interruptores](207), [Puertas lógicas](209), [Circuitos de ejemplo](211).
