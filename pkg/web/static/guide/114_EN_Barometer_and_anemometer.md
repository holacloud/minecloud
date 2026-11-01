# Barometer and anemometer

![Barometer](item:barometer)

Two instruments to watch the sky: the **barometer** measures the air pressure and tells you whether it will rain
today; the **anemometer** measures the wind.

| | In-game name | Id |
|---|---|---|
| ![](item:barometer) | Barometer | `barometer` |
| ![](item:anemometer) | Anemometer | `anemometer` |

## How to get them

| Recipe (C key) | Ingredients |
|---|---|
| 1 `barometer` | 1 `glass` + 1 `element_hg` + 2 `planks` |
| 1 `anemometer` | 1 `copper_block` + 1 `iron_ore` + 1 `planks` |

The mercury block (`element_hg`) is synthesized like every [element block](60); the copper block is refined from
stone and sand ([Fine stones and metals](59)).

Both work the same way: **hold it** to see the panel in the bottom right corner, **right click** to write the
readings in the chat.

## Barometer

It shows the **pressure** in hectopascals (hPa) and its trend over the last hour (steady, rising, falling,
falling fast), and below it the **forecast** for the rest of the day:

| Message | Meaning |
|---|---|
| Clear skies today: no rain until dawn | It will not rain today. |
| Rain expected today around HH:MM | A shower will come at about that time. |
| Pressure falling fast: rain within the hour | It is about to rain. |
| Raining. It should clear around HH:MM | When the shower will end. |
| The shower is over: clear until dawn | No more rain today. |
| **Storm brewing: a storm golem may be called down** | It rains (or is about to) and a [storm golem](43) could be born from a lightning strike. |

The "storm brewing" warning only appears when a golem can really come: not if one was born less than 6 minutes
ago, nor if there is already a golem or a [wandering shadow](37) about.

How the pressure behaves:

- On a dry day it stays around **1010–1020 hPa**, drifting slowly.
- **Three hours before** the shower it starts to fall, faster and faster, down to some **14 hPa less**.
- After the rain it climbs back over three hours.
- **Higher up** it reads a little lower: the air above you weighs less.

The weather is decided at dawn for the whole day, the same for every player: see
[Weather station](112).

## Anemometer

![Anemometer](item:anemometer)

Three copper cups that the wind spins. It shows:

- the **speed** in m/s and km/h;
- its name on the **Beaufort scale**, from 0 (Calm) to 12 (Hurricane);
- **where it comes from** (the compass point, as winds are named) and where it blows to. The points match the
  compass on screen.

When it reads "Sheltered here: step outside", you are under a roof or in a cave: go out to measure the real wind.

| Where | Typical wind |
|---|---|
| By the sea, on a calm day | 1–4 m/s (Beaufort 1–3) |
| A breezy day | 5–8 m/s (Beaufort 3–4) |
| A mountain top | twice as much |
| Before and during the rain | stronger still: up on a mountain it can reach a gale |
| Inside a house / a cave | a third / almost nothing |

Other mechanics will be able to use the same wind (for example, windmills).

## Trivia

- **Torricelli** invented the mercury barometer in 1643: the weight of the air holds up a column of mercury about
  76 cm tall.
- The average pressure at sea level is **1013 hPa**. A deep storm can bring it below 960.
- Admiral **Beaufort** made his scale in 1805 for sailors, by what the wind did to the sails; it was later
  adapted to what it does on land: smoke, leaves, branches...
- Winds are named for **where they come from**: a north wind blows from the north towards the south.

See also: [Weather station](112), [Thermometer](113), [Storm golem](43), [Day, night and weather](8).
