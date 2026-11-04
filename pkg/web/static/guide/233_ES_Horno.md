# Horno

![Horno](item:oven)

El horno **cocina de verdad**. Clic derecho para abrirlo. Tiene tres huecos, y solo tienes que llenar dos:

| Hueco | Qué va dentro |
|---|---|
| **Comida** | algo de la tabla de abajo |
| **Combustible** | carbón, tablas o troncos |
| **Resultado** | lo que ya está listo: sácalo |

Cuando tiene comida y combustible se enciende **solo**, y cuando se queda sin fuego se apaga solo: no hay interruptor. Mientras arde da **luz** (nivel 11), y todos ven la misma llama. Las barras de su panel muestran cuánto fuego queda y cómo va la comida, para todos los jugadores que lo tengan abierto.

Cocina en el servidor, así que puedes **irte** y volver más tarde. No necesita electricidad.

## Qué cocina

| Metes | Sacas | Tiempo |
|---|---|---|
| ![](item:raw_fish) 1 `raw_fish` | ![](item:cooked_fish) `cooked_fish` | 20 s |
| ![](item:wheat) 3 `wheat` | ![](item:bread) `bread` | 30 s |
| ![](item:mushroom_red) 1 `mushroom_red` | ![](item:roast_mushroom) `roast_mushroom` | 15 s |
| ![](item:mushroom_brown) 1 `mushroom_brown` | ![](item:roast_mushroom) `roast_mushroom` | 15 s |

La **seta asada** (*Roast Mushroom*) solo se hace aquí, y da **+6** de salud al comerla (**G**).

## Qué descongela

El horno es también lo **único** que descongela lo que sale de un [congelador](234):

| Metes | Sacas | Tiempo |
|---|---|---|
| ![](item:frozen_fish) `frozen_fish` | ![](item:raw_fish) `raw_fish` | 10 s |
| ![](item:frozen_cooked_fish) `frozen_cooked_fish` | ![](item:cooked_fish) `cooked_fish` | 10 s |
| ![](item:frozen_bread) `frozen_bread` | ![](item:bread) `bread` | 10 s |
| ![](item:ice) `ice` | ![](item:water_flask) `water_flask` | 10 s |

## Combustible

| Combustible | Arde durante | Cocina unos |
|---|---|---|
| ![](item:coal_ore) `coal_ore` | **80 s** | 4 pescados |
| ![](item:planks) cualquier tabla | **30 s** | 1 pescado y medio |
| ![](item:wood) cualquier tronco | **20 s** | 1 pescado |

El combustible solo empieza a arder cuando hay comida que se pueda cocinar y sitio para el resultado. Pero el fuego encendido arde hasta el final, aunque saques la comida: no se puede devolver al saco.

Si el hueco de resultado tiene otra cosa, el horno espera a que lo vacíes. Si el fuego se apaga a medias, la comida conserva lo que llevaba y sigue cuando añades combustible.

El [menú C](11) sigue cocinando pescado y horneando pan, sin horno y sin esperar. El horno te hace esperar, y ahorra carbón: un trozo de carbón cocina cuatro pescados, frente a uno por pescado en el menú.

El horno es para la comida. La arena, la piedra y otros materiales van en la [fundición](235) y el [horno de arco eléctrico](236).

## Por qué se dora la comida

El calor hace algo más que calentar. Cuando la superficie de un alimento se pone caliente y seca, por encima de unos 140 °C, sus proteínas y sus azúcares empiezan a reaccionar entre sí. Forman cientos de sustancias nuevas, de color marrón y llenas de olor: eso es la corteza del pan y la piel dorada de un asado. Se llama **reacción de Maillard**, por el químico francés que la describió en 1912.

No puede ocurrir en una olla de agua hirviendo, que se queda en 100 °C. Por eso el pescado hervido sigue pálido y el frito no, y por eso el interior de un pan es blanco: está demasiado húmedo para calentarse tanto.

Un horno cocina de tres maneras a la vez: el aire caliente toca la comida, las paredes le lanzan calor como **luz invisible** (infrarroja), y la bandeja se lo pasa al contacto. Mira también la [nevera](234), que hace justo lo contrario.
