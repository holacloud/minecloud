# Máquina de revivir

![Máquina de revivir](item:revival_machine)

Una cámara de vidrio llena de líquido, sobre una base de acero con su bobina de cobre. Metes el **fósil** de un animal extinto, le das **corriente** y una **señal**, esperas... y el animal **vuelve a la vida** a su lado, para todos los jugadores. Clic derecho para abrirla.

| | Nombre en el juego | Id |
|---|---|---|
| ![](item:revival_machine) | Revival Machine | `revival_machine` (mientras trabaja: `revival_machine:on`) |

## Los tres huecos

Solo admite fósiles: los de la [roca](262) y los del [ámbar](263).

| Hueco | Qué lleva |
|---|---|
| **Fósil o cráneo** | el fósil de un animal pequeño o mediano, o el **cráneo** de un esqueleto |
| **Columna** | la **columna** de un esqueleto |
| **Cola** | la **cola** de un esqueleto |

- A casi todos los animales les basta **un fósil**. Los que se encuentran como esqueleto necesitan sus **tres piezas**, y las tres del **mismo animal**.
- Pulsa un fósil de tu lista para meterlo: va solo a su hueco. Pulsa un hueco para sacar lo que tiene.
- En un hueco caben varios fósiles iguales. La máquina gasta **uno por animal**.
- El panel pone **???** en vez del nombre del animal hasta que hayas visto uno vivo ([Animales extintos](261)).

## Qué necesita para arrancar

Cuando se cumple todo esto a la vez, **arranca sola**:

1. **Los fósiles completos** de un animal.
2. **Una señal encima.** Lo más fácil: pon una [palanca](207) **sobre la máquina** y actívala.
3. **Agua**, si el animal es marino (mira más abajo).
4. Que no haya **demasiados animales** cerca. Con **12** o más a menos de **32** bloques, no arranca. Cuentan los animales que guarda el servidor: los domesticados, sus crías y los revividos.

El panel te dice con palabras qué falta. Una vez que arranca **ya no necesita la señal**: con un pulsador basta. Para avanzar solo necesita **corriente**.

## La corriente

Gasta **100 W**, y solo mientras trabaja: parada, no pide nada a la red.

- La corriente entra **por los lados o por debajo**. Pégale un [generador](201) o tráele un [cable de cobre](202).
- **Por arriba no entra corriente:** la cara de arriba es solo para la señal.
- Sin corriente **espera**, y conserva lo que lleva hecho. Cuando vuelve, sigue.
- Mientras trabaja de verdad **brilla** (luz de nivel 9) y todos lo ven.

| Con qué | ¿Funciona? |
|---|---|
| ![](item:hand_crank) 1 manivela, 100 W mientras la giras | **sí**: no dejes de girarla |
| ![](item:water_wheel) 1 noria con tres lados mojados, 105 W | **sí** |
| ![](item:rtg) 1 [generador de radioisótopos](220), 80 W | **no** |
| ![](item:rtg) 2 generadores de radioisótopos, 160 W | **sí**, de día y de noche |
| ![](item:solar_panel) 3 paneles solares, 120 W a mediodía | solo cerca del mediodía |
| ![](item:battery_block) 1 [batería](203) llena, sola | **30 s**: da para un fósil común, no para uno raro |

**Todo o nada:** si la red no puede con todo lo que tiene conectado, se apaga todo, como con cualquier [consumidor](204). Mejor dale una red para ella sola.

## La señal, con detalle

La cara de **arriba** es su entrada de señal, y nada más. Hay señal cuando el bloque que tiene justo encima es un bloque eléctrico que conduce hacia abajo, y su red lleva señal ([Interruptores](207)).

| Encima de la máquina | ¿Hay señal? |
|---|---|
| una [palanca](207) activada | **sí**, hasta que la bajes |
| un pulsador recién pulsado | **sí**, durante 1,5 s: de sobra para arrancar |
| una placa de presión con alguien encima, o un [sensor](208) activado | **sí** |
| una [puerta lógica](209) encendida | **sí** |
| un cable que viene de una palanca, un sensor o una puerta encendidos | **sí** |
| un cable o un generador con corriente | **sí**, siempre: hace de señal, **no** de corriente |
| nada, o un bloque que no es eléctrico | **no** |

- Arranca **en cuanto** se cumple todo. Si dejas la palanca activada, arranca al meter el fósil. Y si hay varios fósiles iguales, hace un animal detrás de otro.
- Lo que pones encima **nunca se une** a la red que le da corriente. Puedes traerle la señal desde lejos por un cable sin mezclarla con la corriente.

## Agua para los animales marinos

Un animal marino solo revive si la máquina **toca agua**: un lago, el mar o un tanque que construyas tú. Se cuentan los bloques de agua **unidos** entre sí, empezando por los que tocan una cara de la máquina.

| Animal marino | Bloques de agua unidos |
|---|---|
| el trilobites | **4** |
| el amonites | **6** |
| uno mediano, de 1 bloque de largo | **16** |
| uno grande, de 3 o 4 bloques de largo | **60** |
| el plesiosaurio | **120** |
| el más grande de todos | **300** |

- Solo cuenta el agua que está a **16** bloques o menos de la máquina hacia cada lado.
- El panel te dice cuánta hay: "Necesita agua: 12 de 60 bloques unidos, tocando la máquina".
- Un tanque de 5 × 5 bloques y 3 de hondo son 75 bloques: de sobra para un animal grande.
- El animal nace **dentro del agua**, en el sitio que tiene más agua alrededor cerca de la máquina.

## Cuánto tarda

| Fósil | Tiempo, con corriente |
|---|---|
| común | **20 s** |
| raro | **45 s** |
| legendario | **120 s** |

- El tiempo solo corre **con corriente**.
- **Si sacas un fósil mientras trabaja, se para**, y se pierde lo que llevaba hecho. El fósil vuelve a ser tuyo.
- Al terminar, **los fósiles se gastan** y aparece el animal.

## Dónde aparece el animal

- Uno de tierra, en un **hueco libre junto a la máquina**, a 3 bloques como mucho, desde el que pueda echar a andar. Nunca dentro de un bloque. Solo si no hay otro sitio, encima de la máquina.
- Uno marino, en su agua, a 4 bloques como mucho.
- Si **no hay sitio**, la máquina espera con el trabajo hecho y te lo dice. Despeja un hueco y el animal sale.
- Nunca aparece en la [parcela](260) de otro jugador. Si la máquina está en tu parcela, tampoco aparece fuera de ella.
- El animal **vive alrededor de ese sitio**. No es de nadie. El servidor lo guarda, así que sigue ahí cuando vuelves.
- Los que están cerca oyen la máquina y ven saltar chispas. Si estás a menos de 16 bloques, el animal queda **descubierto** en tu [Bestiario](5).

## Cómo construirla

| Receta (tecla C) | Ingredientes |
|---|---|
| 1 `revival_machine` | 4 `iron_block` + 4 `glass` + 6 `copper_wire` + 1 `electric_motor` + 1 `water_bucket` |

El [cubo](111) de agua se queda dentro. El motor se fabrica en [Consumidores](204) y el cable en [Cables y redes](202).

## Tu primer circuito

1. Coloca la **máquina** en el suelo, con sitio libre alrededor.
2. Pon una ![](item:hand_crank) **manivela** pegada a un lado.
3. Pon una ![](item:lever) **palanca** encima de la máquina.
4. Abre la máquina y mete un fósil.
5. Activa la palanca: la máquina arranca.
6. Gira la manivela, con clic derecho, una y otra vez hasta que termine. Si paras, la máquina te espera.

Cuando te canses de la manivela, cámbiala por dos [generadores de radioisótopos](220) o por una noria con tres lados en el agua.

**Ideas para después:**

- **Arrancarla desde lejos:** un cable desde la cara de arriba hasta un pulsador.
- **Que solo arranque de noche:** una [puerta AND](209) con una palanca y un [sensor de luz diurna](208) en modo noche, y su salida a la cara de arriba.
- Hay más en [Circuitos de ejemplo](211).

## Ciencia: ¿se puede revivir un animal extinto?

En el juego, sí. En la realidad es dificilísimo, y casi siempre imposible.

- **Un fósil es piedra.** Un hueso fósil ya no es hueso: los minerales han ocupado su sitio ([Fósiles](262)). Dentro no queda ninguna célula.
- **Hace falta el ADN.** Son las instrucciones para hacer el animal, y **se rompen con el tiempo**. El ADN más antiguo que se ha podido leer tiene unos **2 millones de años**. Los dinosaurios desaparecieron hace **66 millones**: de un tiranosaurio no queda ni una letra.
- **Con los más recientes hay más suerte.** Se ha leído el ADN de mamuts que quedaron congelados hace miles de años. También el del dodo, que desapareció hace solo unos 350 años.
- **Tener el ADN no basta.** Hace falta una célula viva donde meterlo y una madre que lleve dentro a la cría. Para un mamut, los científicos piensan en la elefanta asiática, su pariente vivo más cercano. Lo que nacería sería un elefante con rasgos de mamut, no un mamut de verdad.
- **Una vez casi salió.** En 2003 nació una cría de bucardo, una cabra montés de los Pirineos que se había extinguido tres años antes. La clonaron a partir de células guardadas. Vivió solo unos minutos.
- **Y aunque saliera**, un animal necesita su mundo: su comida, su clima y otros como él que le enseñen. Por eso muchos científicos prefieren cuidar a los que todavía viven.

> **¿Y el mosquito en ámbar?** Es una gran idea para una película, pero dentro del [ámbar](263) el ADN también se rompe. Aquí nos lo imaginamos.

Ver también: [Fósiles](262), [Ámbar](263), [Animales extintos](261), [Electricidad](200), [Interruptores](207), [Tanque de anguila](214).
