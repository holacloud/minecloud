# Generadores

![Aerogenerador](item:wind_turbine)

Un generador convierte otro tipo de energía en electricidad. Cada uno depende de algo distinto: el sol, el viento, el
agua, tu propio brazo... o un pez.

| | Generador | Id | Potencia máxima | Depende de |
|---|---|---|---|---|
| ![](item:solar_panel) | Placa solar | `solar_panel` | 40 W | la altura del sol, cielo despejado |
| ![](item:wind_turbine) | Aerogenerador | `wind_turbine` | 150 W | la velocidad del viento (¡al cubo!) |
| ![](item:water_wheel) | Rueda hidráulica | `water_wheel` | 105 W | el agua que la toca |
| ![](item:hand_crank) | Manivela | `hand_crank` | 100 W | que tú la gires |
| ![](item:eel_tank) | Tanque de anguila | `eel_tank` | 25 W (50 W si come) | una [anguila eléctrica](213) que vive dentro |

Los números están ajustados para jugar, porque un día de MineCloud dura solo 4 minutos (ver [Electricidad](200)).

## Cómo conseguirlos

| Receta (tecla C) | Ingredientes |
|---|---|
| **1** `solar_panel` (de silicio) | 2 `element_si` + 1 `glass` + 2 `copper_wire` + 1 `iron_ore` |
| **2** `solar_panel` (con células solares) | 2 `solar_cell` + 1 `glass` + 1 `iron_ore` |
| 1 `wind_turbine` | 3 `iron_ore` + 3 `planks` + 1 `copper_block` |
| 1 `water_wheel` | 6 `planks` + 1 `copper_block` |
| 1 `hand_crank` | 2 `planks` + 1 `iron_ore` + 2 `copper_wire` |
| 1 `eel_tank` | 4 `glass` + 1 `water_bucket` + 2 `copper_wire` (la anguila se atrapa con un cubo) |

- El bloque de **silicio** (`element_si`) se sintetiza con piedra y carbón (ver [Bloques de elementos](60) y
  [Silicio](152)): no hace falta el laboratorio.
- La [célula solar](177) da el doble de placas, pero hay que **descubrirla** en la [mesa de laboratorio](117): su
  página tiene la pista.
- El cobre está en [Piedras nobles y metales](59).

## Placa solar

Una losa fina azul oscuro. Da **40 W a mediodía**, menos por la mañana y por la tarde (cuanto más bajo está el sol,
menos luz le llega) y **nada de noche**.

- Necesita **cielo despejado**: cualquier bloque encima (hasta 48 bloques más arriba) la tapa del todo. El **vidrio** y
  los paneles de vidrio dejan pasar la luz, así que puedes hacer un invernadero.
- Cuando **llueve** solo da el 30 % de lo normal.
- En un día entero de MineCloud una placa recoge unos **3 kJ** (3000 J): una [batería](203) llena.

## Aerogenerador

Un mástil blanco. El **rotor** gira **dos bloques por encima** del bloque, y sus aspas barren más o menos un bloque
por arriba y por abajo: déjale sitio. La góndola siempre se gira hacia el viento.

- Su potencia crece con el **cubo** de la velocidad del viento: **P = 0,6 × v³** (v en m/s), hasta 150 W. ¡El doble
  de viento da **ocho veces** más potencia!

| Viento | Potencia |
|---|---|
| menos de 1 m/s | 0 W (no arranca) |
| 2 m/s | 5 W |
| 3 m/s | 16 W |
| 4 m/s | 38 W |
| 5 m/s | 75 W |
| 6 m/s | 130 W |
| 6,3 m/s o más | 150 W |

- En terreno llano el viento suele soplar a 3–4 m/s (16–38 W). En una colina o una torre es **más fuerte** (un 3,5 %
  más por cada bloque por encima de la altura 6): 5 m/s o más. Además cambia a lo largo del día, tiene rachas que
  llegan al máximo de 150 W y sopla más antes de la lluvia y mientras llueve. Usa un [anemómetro](114) para buscar
  buenos sitios.
- Bajo techo el viento es flojo: 1 o 2 bloques encima del aerogenerador dejan solo el 30 % del viento; 3 o más, el 5 %.
- Funciona de día y de noche.

## Rueda hidráulica

Una rueda de madera que gira cuando toca **agua**. Da **35 W por cada lado que toca agua**: los cuatro lados y el de
abajo (el agua de arriba no cuenta), hasta **105 W** (tres lados). Funciona día y noche sin parar: es el generador más
constante.

- Al colocarla, la rueda queda de frente a ti.
- En MineCloud el agua no corre, así que basta con que la toque: ponla a la orilla de un lago o de un río, o cava un
  canal y llénalo con un [cubo](111).

## Manivela

Una caja de madera con una manivela. **Haz clic derecho** en ella (sin agacharte) para girarla: cada vuelta da **100 W
durante 4 segundos** (400 J). Si la giras varias veces seguidas, aguanta hasta 12 segundos. Unas ocho vueltas llenan
una batería: ¡nota cuánto trabajo cuesta la energía!

Agáchate (Shift) para colocar bloques junto a ella sin girarla.

## Tanque de anguila

Una pecera de vidrio con una [anguila eléctrica](213) nadando dentro: un **generador vivo**. Da **25 W** de día y de
noche, y **50 W** durante 10 segundos cada vez que le das un `raw_fish` (clic derecho en el tanque). Vacío no da nada.
Cómo atrapar la anguila, meterla y sacarla: [Tanque de anguila](214).

Ver también: [Electricidad](200), [Cables y redes](202), [Baterías](203).
