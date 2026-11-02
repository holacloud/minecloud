# Interruptores

![Palanca](item:lever)

Un **interruptor** es un trozo de cable que puedes **cortar y volver a unir**. Encendido, deja pasar la
electricidad y une las redes que toca en una sola. Apagado, la corta: a cada lado queda una red distinta. Es lo
mismo que el interruptor de la luz de tu cuarto.

| | Bloque | Id | Se enciende... | Receta (tecla C) |
|---|---|---|---|---|
| ![](item:lever) | Palanca | `lever` | con clic derecho, y se queda así | **2** con 1 `planks` + 1 `cobblestone` + 1 `copper_wire` |
| ![](item:push_button) | Pulsador | `push_button` | con clic derecho, **1,5 segundos** | **2** con 1 `cobblestone` + 1 `copper_wire` |
| ![](item:pressure_plate) | Placa de presión | `pressure_plate` | mientras un **jugador** está encima | **2** con 2 `cobblestone` + 1 `copper_wire` |

## Tu primer interruptor

1. Pon en fila una [batería](203) cargada, una **palanca** y una [lámpara](204), tocándose cara con cara.
2. Haz **clic derecho** en la palanca: el mango **sube** y la lámpara se enciende.
3. Otro clic: el mango **baja** y la lámpara se apaga.

Con la palanca apagada hay **dos redes**: la de la batería y la de la lámpara. Con la palanca encendida vuelven a
ser una. Compruébalo con el [multímetro](205).

> Agáchate para poner un bloque pegado a una palanca o un pulsador sin accionarlos.

## Palanca

Una base de piedra con un mango de madera. **Mango arriba: encendida. Mango abajo: apagada.** Se queda como la
dejes, aunque te vayas o se reinicie el servidor.

## Pulsador

Un botón rojo. Al pulsarlo se hunde y se ilumina, deja pasar la corriente **1,5 segundos** y se apaga solo. Si lo
vuelves a pulsar mientras está encendido, cuenta de nuevo desde el principio. Va muy bien para una puerta que se
abre un momento o un timbre.

## Placa de presión

Una losa fina de piedra que se pisa. Está encendida **mientras un jugador está encima** (su borde se pone
amarillo) y se apaga cuando te bajas. Puedes caminar por encima como por un cable.

Los **animales y monstruos no la pisan**: viven en el ordenador de cada jugador, y el servidor solo sabe dónde
están los jugadores. Así todos ven lo mismo.

## Señal

Además de cortar y unir, los interruptores dan **señal** a las [puertas lógicas](209): una palanca encendida que
toca la entrada de una puerta lógica ya cuenta como "sí", **aunque no haya batería**. Lo explica la página de las
puertas.

## Cómo lo calcula el juego

El servidor revisa los circuitos **5 veces por segundo**. Por eso una lámpara se enciende casi al momento de
mover la palanca, y todos los jugadores la ven igual.

## Curiosidades

- La palabra *interruptor* viene de *interrumpir*: lo que hace es interrumpir el camino de la corriente.
- En las escaleras de muchas casas hay dos interruptores para una misma luz, uno abajo y otro arriba. Puedes
  construirlo con una [puerta XOR](209): está en los [circuitos de ejemplo](211).

Ver también: [Sensores](208), [Puertas lógicas](209), [Electricidad](200).
