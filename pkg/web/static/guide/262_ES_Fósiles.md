# Fósiles

![Roca con fósil](item:fossil_rock)

Muy abajo, dentro de la piedra, hay rocas con un dibujo: una concha enrollada, una huella, una calavera. Son **fósiles**: lo que queda de animales que vivieron hace muchísimo tiempo. Si rompes la roca, te llevas el fósil. Esta página dice cómo son, dónde están y cómo buscarlos. El [ámbar](263) tiene su propia página.

## Cómo es cada bloque

| | Id | Aspecto | Qué es |
|---|---|---|---|
| ![](item:fossil_rock) | `fossil_rock` | piedra con una **concha enrollada** | un fósil común |
| ![](item:fossil_rock_rare) | `fossil_rock_rare` | piedra oscura con una **huella de tres dedos** | un fósil raro |
| ![](item:fossil_bones_skull) | `fossil_bones_skull` | piedra oscura con una **calavera** | el cráneo de un esqueleto |
| ![](item:fossil_bones_spine) | `fossil_bones_spine` | piedra oscura con unas **costillas** | la columna de un esqueleto |
| ![](item:fossil_bones_tail) | `fossil_bones_tail` | piedra oscura con una **cola** de huesos | la cola de un esqueleto |
| ![](item:old_bones) | `old_bones` | tierra con **huesos** blancos | huesos recientes |

## Dónde están

Mira tu altura, la **y**. El agua está en y = 5 y el fondo del mundo en y = −14. Un **chunk** es un trozo del mundo de 16 × 16 bloques ([Cómo nace el mundo](99)).

| | Dónde | Altura | Cuántos |
|---|---|---|---|
| Fósil común | en la piedra, bajo cualquier bioma | de y = −11 a y = 2 | dos o tres bolsas en casi todos los chunks, de 1 a 3 bloques cada una |
| Fósil raro | en la piedra, bajo cualquier bioma | de y = −11 a y = −3 | un bloque en 4 de cada 5 chunks |
| Esqueleto | en la piedra, bajo cualquier bioma | de y = −11 a y = −4 | sus tres bloques en 1 de cada 14 chunks |
| Huesos recientes | bajo la arena de una **playa**, y a veces bajo la hierba de una **llanura** | de 1 a 3 bloques bajo el suelo | en la playa, 1 columna de cada 110; en la llanura, 1 de cada 1500 |

- Cuanto más raro es un fósil, **más hondo** empieza. Entre y = −11 e y = −4 puede salir de todo.
- En la piedra, un fósil solo ocupa el sitio de piedra normal. Nunca sustituye a un mineral, y no hay ninguno en la roca madre ni en el bloque de encima.
- Una **playa** es la arena que hay junto al agua en las llanuras y los bosques. La arena del desierto no cuenta, ni el fondo de los lagos.

Un trozo de mundo que ya exploraste antes se queda como estaba, sin fósiles. Solo salen en la tierra **que nadie ha visitado aún**.

## Cómo buscarlos

- **Fósiles comunes y raros.** No se ven desde fuera: hay que cavar. Baja hasta y = −6, más o menos, y abre una galería larga y recta. Mira las paredes, el suelo y el techo según avanzas. Si aparece una concha, sigue cavando a su alrededor: las bolsas tienen hasta tres bloques que se tocan.
- **Esqueletos.** Sus tres bloques están siempre **en línea recta y a la misma altura**, con la columna en medio. El cráneo está a 2 o 3 bloques de la columna, y la cola a otros 2 o 3 por el lado contrario. Los tres están siempre en el mismo chunk. Si encuentras una pieza, cava a su misma altura hacia los cuatro lados, hasta 6 bloques: las otras dos están ahí.
- **Huesos recientes.** Ve a una playa con una [pala](69) y quita la arena, hasta tres bloques de hondo. Es lo más fácil de encontrar.

## Qué te llevas

- Al romper el bloque no te quedas con la roca, sino con el **fósil del animal** que había dentro.
- Qué animal es depende del sitio exacto del bloque. Es el mismo para todos los jugadores, pero no se sabe hasta que se rompe.
- Los tres bloques de un esqueleto son de **un solo animal**: te dan su cráneo, su columna y su cola. Un animal grande necesita las tres piezas.
- La roca con fósil es algo más dura que la piedra. Con un [pico](68) va más deprisa; los huesos recientes, con una pala.
- Un [robot](193) que cava saca lo mismo que tú del mismo bloque.
- Si en el juego todavía no hay ningún animal de esa clase de fósil, la roca da solo `cobblestone` y los huesos recientes dan `dirt`.

## Cómo se hace un fósil de verdad

Casi ningún animal acaba siendo un fósil. Lo normal es que otros se lo coman o que se pudra. Para que quede algo, tiene que pasar todo esto:

1. **Queda enterrado pronto**, en el barro del fondo de un lago o del mar, en arena o en ceniza. Así nada se lo come y casi no le llega el aire.
2. **Se le amontonan capas encima** durante miles de años. Con tanto peso, el barro se va haciendo piedra.
3. **El agua trae minerales.** Se cuela entre los granos y deja minerales en los huecos del hueso o de la concha, hasta que queda una copia en piedra.

Por eso casi todos los fósiles son de **partes duras**: conchas, huesos y dientes. Y por eso tardan tanto: los científicos solo llaman fósil a lo que tiene más de unos 10 000 años, y la mayoría tiene millones.

- **Abajo, lo más viejo.** Las capas de roca se apilan una sobre otra, así que las de abajo son las más antiguas. Aquí pasa algo parecido: los raros y los esqueletos están más hondos.
- **Una huella también es un fósil.** Si un animal pisa barro blando y el barro se hace piedra, queda la pisada. Así sabemos cómo andaban los dinosaurios.
- **Los más comunes vivían en el mar.** Los trilobites y los amonites tenían la cáscara dura, eran muchísimos y caían al barro del fondo. Los trilobites desaparecieron hace unos 252 millones de años, y los amonites hace 66 millones, a la vez que los dinosaurios.

## Por qué el dodo no está en la piedra

El dodo era un pájaro grande que no volaba y vivía en la isla Mauricio. Se extinguió hace unos 350 años, menos de cien años después de que llegaran los primeros barcos. Eso es **muy poco tiempo**: sus huesos no han tenido tiempo de volverse piedra. Siguen siendo hueso.

Por eso en el juego no aparece en la roca, sino cerca de la superficie. En 1865 se encontraron muchísimos huesos de dodo en un pantano junto a la costa de la isla.

> **Una niña que buscaba fósiles.** Mary Anning tenía 12 años cuando su hermano y ella sacaron de un acantilado de Inglaterra el esqueleto de un ictiosaurio, un reptil del mar. Fue hacia 1811. Años después, en 1823, encontró el primer esqueleto completo de **plesiosaurio**. Si un día encuentras un fósil de verdad, hazle una foto y enséñasela a un museo.

Un fósil vuelve a la vida en la [máquina de revivir](264): necesita corriente, una señal y, si el animal es marino, agua.

Ver también: [Ámbar](263), [Cómo encontrar metales](248), [Picos](68), [Palas](69), [Biomas](15).
