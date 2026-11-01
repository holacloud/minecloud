# Barómetro y anemómetro

![Barómetro](item:barometer)

Dos instrumentos para vigilar el cielo: el **barómetro** mide la presión del aire y te dice si va a llover hoy; el
**anemómetro** mide el viento.

| | Nombre en el juego | Id |
|---|---|---|
| ![](item:barometer) | Barometer | `barometer` |
| ![](item:anemometer) | Anemometer | `anemometer` |

## Cómo conseguirlos

| Receta (tecla C) | Ingredientes |
|---|---|
| 1 `barometer` | 1 `glass` + 1 `element_hg` + 2 `planks` |
| 1 `anemometer` | 1 `copper_block` + 1 `iron_ore` + 1 `planks` |

El bloque de mercurio (`element_hg`) se sintetiza como todos los [bloques de elementos](60); el bloque de cobre se
refina con piedra y arena ([Piedras nobles y metales](59)).

Los dos funcionan igual: **llévalo en la mano** para ver el panel de abajo a la derecha, y **clic derecho** para
escribir las lecturas en el chat.

## Barómetro

Muestra la **presión** en hectopascales (hPa) y cómo ha cambiado en la última hora (steady: estable; rising: sube;
falling: baja; falling fast: baja deprisa) y, debajo, el **pronóstico** para lo que queda de día:

| Mensaje | Qué significa |
|---|---|
| Clear skies today: no rain until dawn | Hoy no lloverá. |
| Rain expected today around HH:MM | Hacia esa hora caerá un chaparrón. |
| Pressure falling fast: rain within the hour | Está a punto de llover. |
| Raining. It should clear around HH:MM | Cuándo terminará el chaparrón. |
| The shower is over: clear until dawn | Hoy ya no lloverá más. |
| **Storm brewing: a storm golem may be called down** | Llueve (o va a llover) y puede nacer un [golem de tormenta](43) de un rayo. |

El aviso de tormenta solo sale cuando de verdad puede venir un golem: no si nació uno hace menos de 6 minutos, ni
si ya ronda un golem o una [sombra errante](37).

Cómo se comporta la presión:

- En un día seco se queda en torno a **1010–1020 hPa**, cambiando despacio.
- **Tres horas antes** del chaparrón empieza a bajar, cada vez más deprisa, hasta unos **14 hPa menos**.
- Después de la lluvia vuelve a subir en tres horas.
- **Más arriba** marca un poco menos: el aire que tienes encima pesa menos.

El tiempo se decide al amanecer para todo el día, igual para todos los jugadores: ver
[Estación meteorológica](112).

## Anemómetro

![Anemómetro](item:anemometer)

Tres cazoletas de cobre que el viento hace girar. Muestra:

- la **velocidad** en m/s y en km/h;
- su nombre en la **escala de Beaufort**, de 0 (Calm, calma) a 12 (Hurricane, huracán);
- **de dónde viene** (el punto cardinal, que es como se nombran los vientos) y hacia dónde sopla. Los puntos son
  los de la brújula de la pantalla (N, E, S, W: norte, este, sur, oeste).

Si dice "Sheltered here: step outside", estás bajo techo o en una cueva: sal fuera para medir el viento de verdad.

| Dónde | Viento normal |
|---|---|
| Junto al mar, un día tranquilo | 1–4 m/s (Beaufort 1–3) |
| Un día de brisa | 5–8 m/s (Beaufort 3–4) |
| En la cima de una montaña | el doble |
| Antes de la lluvia y mientras llueve | más fuerte aún: en una montaña puede llegar a temporal |
| Dentro de casa / de una cueva | un tercio / casi nada |

Otras mecánicas podrán usar este mismo viento (por ejemplo, molinos).

## Curiosidades

- **Torricelli** inventó el barómetro de mercurio en 1643: el peso del aire sostiene una columna de mercurio de
  unos 76 cm.
- La presión media al nivel del mar es de **1013 hPa**. Una borrasca fuerte puede bajarla de 960.
- El almirante **Beaufort** hizo su escala en 1805 para los marinos, según lo que el viento hacía con las velas;
  luego se adaptó a lo que hace en tierra: humo, hojas, ramas...
- Los vientos se nombran por **de dónde vienen**: el viento del norte sopla desde el norte hacia el sur.

Ver también: [Estación meteorológica](112), [Termómetro](113), [Golem de tormenta](43),
[Día, noche y clima](8).
