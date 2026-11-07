# La mano izquierda

![Antorcha](item:torch)

La mano derecha trabaja: mina, construye, golpea. La **izquierda** lleva lo que sirve solo por llevarlo: una luz, un instrumento, una segunda herramienta, una segunda espada o un [escudo](252). Así exploras una cueva con el pico en una mano y la antorcha en la otra.

## Cómo se usa

- **X** pasa a la mano izquierda el objeto que tienes en la derecha. Si la izquierda ya llevaba otro, se **intercambian**.
- **X** con el mismo objeto en las dos manos devuelve al inventario el de la izquierda. Con la derecha vacía, el de la izquierda pasa a la derecha.
- **Mayús + X** guarda en el inventario lo que lleves en la izquierda.
- En el **inventario** (**E**), los objetos que se pueden llevar tienen un botón **L**. La casilla de arriba enseña lo que llevas: púlsala para guardarlo.
- En un **móvil**, el botón **L** de arriba hace lo mismo que **X**, y también está **Left hand** en el menú **☰**. El botón **L** del inventario funciona igual.

Mientras juegas, una casilla a la izquierda de la barra rápida te recuerda lo que llevas.

## Qué se puede llevar

| | Objeto | Qué hace en la izquierda |
|---|---|---|
| ![](item:torch) | `torch` | Luz de nivel 14: alcanza unos 9 bloques. Además, su humo calma a las [abejas](35). |
| ![](item:lantern) | `lantern` | Luz de nivel 13. |
| ![](item:candle) | `candle` | Luz de nivel 9: unos 6 bloques. |
| ![](item:firefly_jar) | `firefly_jar` | Luz de nivel 7: 4 o 5 bloques. |
| ![](item:multimeter) | `multimeter` | Lee la red del bloque eléctrico que **miras**, sin hacer clic. |
| ![](item:thermometer) | `thermometer` | Su panel de lecturas. |
| ![](item:barometer) | `barometer` | Su panel de lecturas. |
| ![](item:anemometer) | `anemometer` | Su panel de lecturas. |
| ![](item:helium_balloon) | `helium_balloon` | Caes despacio y sin daño. |
| ![](item:shield) | `shield` | Reduce a la mitad los golpes de criaturas que tienes **delante**. Ver [Escudo](252). |
| ![](item:iron_pickaxe) | Picos, palas y hachas | Con otro del mismo tipo en la derecha, minas a **×1,5**. Solo, nada. |
| ![](item:iron_sword) | Espadas | Con otra en la derecha, suma el **50 %** de su daño. Sola, nada. |

Las herramientas y espadas que se pueden llevar: `wood_pickaxe` `stone_pickaxe` `iron_pickaxe` `gold_pickaxe` `steel_pickaxe` `wood_shovel` `stone_shovel` `iron_shovel` `gold_shovel` `steel_shovel` `wood_axe` `stone_axe` `iron_axe` `gold_axe` `steel_axe` `wood_sword` `stone_sword` `iron_sword` `gold_sword` `steel_sword`.

Las luces también alumbran **en la mano derecha**: farol, vela y frasco ya no hace falta dejarlos en el suelo. Si llevas dos luces, cuenta la más fuerte. Si llevas el mismo instrumento en las dos manos, se ve **un solo panel**; con dos distintos, un panel con las dos lecturas.

Lo demás se queda en la derecha porque hay que usarlo con **clic derecho**: el telescopio hay que levantarlo, la cinta métrica necesita tus clics, la azada (`wood_hoe`, `stone_hoe`, `iron_hoe`, `gold_hoe`) labra y las tijeras (`iron_shears`) esquilan. En la izquierda nada usa el clic derecho: en un instrumento lo que da es la lectura. Para escribirla en el chat, ponlo en la derecha.

## Dos herramientas

Un pico, una pala o un hacha en cada mano, **del mismo tipo**: minas a **×1,5**. Los brazos golpean por turnos.

- **Solo cuenta si la de la derecha es la buena para ese bloque.** Dos picos sobre tierra minan como uno solo.
- **Si son de materiales distintos, manda el peor:** la velocidad es la del peor × 1,5, esté en la mano que esté.
- **Ojo:** por eso, con una herramienta mucho peor, la buena va **más lenta** que sola.

| Velocidad sobre su bloque | Sola | + madera | + piedra | + hierro | + oro | + acero |
|---|---|---|---|---|---|---|
| Madera | 1,45 | 2,18 | 2,18 | 2,18 | 2,18 | 2,18 |
| Piedra | 1,9 | 2,18 | 2,85 | 2,85 | 2,85 | 2,85 |
| Hierro | 2,6 | **2,18** | 2,85 | 3,9 | 3,9 | 3,9 |
| Oro | 3,2 | **2,18** | **2,85** | 3,9 | 4,8 | 4,8 |
| Acero | 3,6 | **2,18** | **2,85** | 3,9 | 4,8 | 5,4 |

En negrita, las parejas más lentas que la herramienta de la fila sola. La mano izquierda sola no mina: si mandas tu único pico a la izquierda, picas con la mano vacía.

## Dos espadas

No pegas más rápido: pegas **más fuerte**. El golpe vale lo que la espada de la derecha más el **50 %** de la de la izquierda, y cada golpe lo da un brazo.

| Derecha / izquierda | Nada | Madera | Piedra | Hierro | Oro | Acero |
|---|---|---|---|---|---|---|
| Madera | 5 | 7,5 | 8 | 8,5 | 9 | 9,5 |
| Piedra | 6 | 8,5 | 9 | 9,5 | 10 | 10,5 |
| Hierro | 7 | 9,5 | 10 | 10,5 | 11 | 11,5 |
| Oro | 8 | 10,5 | 11 | 11,5 | 12 | 12,5 |
| Acero | 9 | 11,5 | 12 | 12,5 | 13 | 13,5 |

Una espada en la izquierda **sin otra en la derecha** no suma nada: el golpe es el de la mano vacía o de lo que lleves, 4.

## Una unidad de verdad

Lo que llevas en la izquierda es **una unidad que sale del inventario**, y por eso el contador baja en uno.

- **No se gasta:** no se puede colocar, tirar con **Q**, usar en una receta ni meter en un cofre. Para eso, primero la devuelves.
- **Al morir** no se pierde, igual que el resto del inventario.
- **Se guarda** con el inventario: al volver la sigues llevando.
- Si tienes una sola antorcha, o un solo pico, y lo pasas a la izquierda, la derecha se queda vacía: no puede estar en dos sitios. Para tener dos picos en las manos necesitas **dos** picos.
- Las herramientas, las espadas y el escudo **no se gastan**: aquí nada pierde durabilidad.

## La luz

- La luz llega al terreno al instante y sigue al jugador. No apaga la oscuridad de lejos: se desvanece con la distancia.
- Funciona en los modos **clásico**, **RTX** y **Ultra**: la calcula el mismo sombreador del terreno, y cada modo le pone su tono.
- Una luz en la mano también ahuyenta a las [sombras](37), como la antorcha de siempre. Las herramientas, las espadas y el escudo no alumbran ni leen nada.
- **Un [microscopio](238)** se ilumina con una luz en cualquier mano si estás **a 3 bloques o menos**.

## Lo que ven los demás

Los demás jugadores ven lo que llevas en el **brazo izquierdo** de tu avatar, y tú lo ves en los [espejos](232) y en tercera persona. Tu luz también alumbra **el terreno** a su alrededor: cada jugador ve la suya y las de los **dos** jugadores más cercanos, a menos de 40 bloques. A los mobs y a otros avatares solo les da tu propia luz.
