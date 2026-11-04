# Horno de arco eléctrico

![Horno de arco eléctrico](item:arc_furnace)

Una cuba de acero con **tres electrodos de grafito** que atraviesan el techo, como los de verdad. No quema combustible: saca el calor de la **electricidad**, mucho más del que podría dar un fuego. Clic derecho para abrirlo.

| Hueco | Qué lleva |
|---|---|
| **Para fundir** | algo de la tabla de abajo |
| **Carbón** | `coal_ore`: aquí no es combustible, es un **ingrediente** |
| **Resultado** | lo que está listo: sácalo |

## Qué hace

| Metes | Y | Sale | Tiempo | En el menú C |
|---|---|---|---|---|
| ![](item:sand) 1 `sand` | ![](item:coal_ore) 2 `coal_ore` | ![](item:element_si) **3** `element_si` | 20 s | 1 `stone` + 1 `coal_ore` dan 1 `element_si` |
| ![](item:iron_ore) 1 `iron_ore` | ![](item:coal_ore) 1 `coal_ore` | ![](item:steel_ingot) **2** `steel_ingot` | 15 s | solo en la [mesa de laboratorio](117) |

La **receta de silicio del menú C sigue ahí**, y es instantánea. El horno de arco te hace esperar y pide corriente, y da la mitad más con el mismo carbón, y a partir de simple arena.

## La corriente que pide

Gasta **150 W**, y solo **mientras tiene trabajo**: parado, no pide nada a la red, y el [multímetro](205) marca 0 W. Conéctalo a los [generadores](201) tocándolos o con [cable de cobre](202).

| Con qué | ¿Funciona? |
|---|---|
| ![](item:rtg) 1 [generador de radioisótopos](220), 80 W | **no** |
| ![](item:rtg) 2 generadores de radioisótopos, 160 W | **sí**, de día y de noche |
| ![](item:water_wheel) 1 noria, hasta 105 W | **no** |
| ![](item:water_wheel) 2 norias con tres lados mojados, 210 W | **sí** |
| ![](item:battery_block) 1 batería llena, sola | **20 s**: una tanda de silicio |
| ![](item:solar_panel) 4 paneles solares, 160 W a mediodía | solo cerca del mediodía |
| ![](item:wind_turbine) 1 aerogenerador, hasta 150 W | solo con viento fuerte |

Sin corriente suficiente **se queda quieto**, conserva lo que llevaba y sigue cuando vuelve. Su panel lo dice: *No power: needs 150 W*. Con el arco encendido brilla (**luz de nivel 14**) y todos lo ven.

**Todo o nada:** mientras tiene trabajo y la red no le da lo que pide, también se apaga todo lo demás de esa red, como con cualquier [consumidor](204). Mejor dale una red para él solo.

## Cómo construirlo

Llega después de la [fundición](235), cuando ya trabajas con electricidad:

| Receta (tecla C) | Ingredientes |
|---|---|
| 1 `arc_furnace` | 4 `iron_block` + 1 `electric_motor` + 8 `copper_wire` + 3 `coal_ore` + 4 `brick` |

## Por qué el carbono le quita el oxígeno a la sílice

La arena es silicio agarrado al oxígeno, y muy fuerte. Para sacar el silicio hace falta algo que quiera ese oxígeno todavía más. A unos **2000 °C** el carbono lo quiere: se lo lleva y se va con él en forma de gas, monóxido de carbono, y queda el silicio, fundido.

**SiO₂ + 2 C → Si + 2 CO**

Cada arena necesita dos carbonos, porque hay dos oxígenos que llevarse: por eso la receta pide 2 de carbón. Los hornos de verdad usan carbón y astillas de madera justo para esto. El acero empieza igual: el carbono le quita el oxígeno al mineral de hierro, y un poco se queda, entre los átomos de hierro.

## Cómo saca un arco 2000 °C

El aire normalmente no conduce la electricidad. Pero con una corriente bastante fuerte a través de un hueco pequeño, se arrancan electrones al aire, que se convierte en un gas brillante que sí conduce: **plasma**. Eso es un **arco**, un pequeño rayo que no se acaba, y está más o menos tan caliente como la superficie del Sol. Un fuego de carbón no se le acerca.

Los de verdad tienen tres electrodos porque las fábricas reciben la corriente en tres fases, y gastan tanto como un pueblo pequeño. El grafito sirve porque conduce y no se funde.

## Del silicio a los chips y las células solares

Lo que sale del horno es casi puro, pero no lo bastante. Para un chip, los químicos lo purifican hasta que solo un átomo de cada mil millones es otra cosa. Luego se saca despacio de la masa fundida un cristal semilla, y crece un único cristal perfecto, tan largo como alta es una persona. Se corta en discos más finos que una moneda.

El silicio solo apenas conduce. Con una pizca de [boro](143) o de [fósforo](153) conduce, y de una manera que se puede dirigir: así funcionan los transistores, miles de millones en un chip, y así una [célula solar](177) convierte la luz en corriente. En el juego, el silicio va a los [paneles solares](201) y al [generador de radioisótopos](220).

Ver también: [Silicio](152), [Lingote de acero](120), [Consumidores](204), [Fundición](235).
