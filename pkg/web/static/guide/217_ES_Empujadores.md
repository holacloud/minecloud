# Empujadores

![Empujador motorizado](item:motor_ram)

Un **empujador motorizado** es un [motor eléctrico](204) en una caja de acero que **empuja bloques**. Mientras su
red tiene energía, saca su placa **hacia fuera** y mueve los bloques que tiene delante **un bloque** más allá.
Cuando se va la energía, el brazo vuelve a entrar. El **empujador pegajoso** tiene miel en la placa: al volver,
**tira** del bloque que tiene delante y se lo trae.

| | Bloque | Id | Potencia | Receta (tecla C) |
|---|---|---|---|---|
| ![](item:motor_ram) | Empujador motorizado | `motor_ram` | **40 W** | **1** con 1 `electric_motor` + 2 `iron_ore` + 2 `planks` |
| ![](item:sticky_ram) | Empujador pegajoso | `sticky_ram` | **40 W** | **1** con 1 `motor_ram` + 1 `honey_bottle` |

## Cómo se coloca

Un empujador **te mira** al ponerlo, como el lado de una caja que estás mirando:

- Mirando a una pared: empuja **hacia ti**.
- Mirando **abajo**, al suelo: empuja **hacia arriba**.
- Mirando **arriba**, al techo: empuja **hacia abajo**.

La placa (madera con marco de hierro; miel dorada en el pegajoso) es el lado que empuja.

## Tu primer empujón

1. Pon un empujador en el suelo, una **palanca** detrás y una [batería](203) cargada detrás de la palanca,
   tocándose cara con cara.
2. Pon dos o tres bloques en fila delante del empujador.
3. Haz **clic derecho** en la palanca: sale el brazo y toda la fila se mueve **un bloque**.
4. Apaga la palanca: el brazo vuelve. Con un empujador pegajoso, el primer bloque de la fila vuelve con él.

También sirve una [manivela](201): gírala y el empujador empuja; cuando la manivela se para (a los pocos segundos),
el brazo vuelve.

## Qué puede empujar

- Como mucho **12 bloques** en fila. La fila tiene que acabar en **aire**, **agua**, **lava** o una planta pequeña
  (hierba, flores, setas): el último bloque ocupa su sitio, y el agua o la planta desaparecen.
- **Nunca mueve:** roca madre, líquidos, bloques eléctricos (cables, lámparas, otros empujadores...), puertas,
  camas, carteles, escaleras de mano, bloques musicales, tierra de cultivo y trigo, cofres y plataformas de
  ascensor. Ni nada fuera del techo o del fondo del mundo.
- Si no puede empujar, **espera**: mientras tenga energía lo vuelve a intentar cinco veces por segundo, así que
  empuja en cuanto el camino queda libre. Nunca mueve media fila.

## Jugadores encima

Si estás **de pie sobre** un bloque que se empuja, te vas con él (un empujador hacia arriba te sube un bloque). Si
un bloque o el brazo llega al sitio donde estás, te **aparta** de un empujón. A los animales no los lleva: viven en
el ordenador de cada jugador.

## Cómo lo calcula el juego

El **servidor** mueve los bloques, cinco veces por segundo, así que todos los jugadores ven lo mismo. Si el brazo
está fuera es parte del nombre del bloque (`motor_ram:e:out`, `sticky_ram:u:in`), y el brazo también es un bloque
(`ram_arm:e:plain`). Por eso los empujadores siguen como estaban cuando el servidor se reinicia. Si rompes un
empujador con el brazo fuera, el brazo se va con él.

Un empujador necesita sus **40 W** todo el rato que está fuera: en una red de todo o nada
([Electricidad](200)), si falta energía, todos los empujadores vuelven a entrar. Después de un apagón, una red
espera **3 segundos** antes de encenderse otra vez; una palanca actúa al momento.

## Curiosidades

- Un empujador convierte el giro de un motor en un empuje en línea recta. Las máquinas de verdad lo hacen con un
  **tornillo**, con una **biela y manivela** (como las ruedas de un tren de vapor) o con aceite a presión (la
  **hidráulica**), como las excavadoras.
- La miel del empujador pegajoso pega de verdad: la miel es casi todo azúcar y, cuando pierde el agua, se vuelve
  una especie de pegamento.

Ver también: [Ascensores](218), [Proyectos mecánicos](219), [Interruptores](207), [Consumidores](204).
