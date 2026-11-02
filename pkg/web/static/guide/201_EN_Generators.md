# Generators

![Wind turbine](item:wind_turbine)

A generator turns another kind of energy into electricity. Each one depends on something different: the sun, the
wind, the water or your own arm.

| | Generator | Id | Most power | Depends on |
|---|---|---|---|---|
| ![](item:solar_panel) | Solar Panel | `solar_panel` | 40 W | the height of the sun, open sky |
| ![](item:wind_turbine) | Wind Turbine | `wind_turbine` | 150 W | the wind speed (cubed!) |
| ![](item:water_wheel) | Water Wheel | `water_wheel` | 105 W | water touching it |
| ![](item:hand_crank) | Hand Crank | `hand_crank` | 100 W | you turning it |

The numbers are scaled for play, because a MineCloud day lasts only 4 minutes (see [Electricity](200)).

## How to get them

| Recipe (C key) | Ingredients |
|---|---|
| **1** `solar_panel` (silicon) | 2 `element_si` + 1 `glass` + 2 `copper_wire` + 1 `iron_ore` |
| **2** `solar_panel` (solar cells) | 2 `solar_cell` + 1 `glass` + 1 `iron_ore` |
| 1 `wind_turbine` | 3 `iron_ore` + 3 `planks` + 1 `copper_block` |
| 1 `water_wheel` | 6 `planks` + 1 `copper_block` |
| 1 `hand_crank` | 2 `planks` + 1 `iron_ore` + 2 `copper_wire` |

- The **silicon** block (`element_si`) is synthesised from stone and coal (see [Element blocks](60) and
  [Silicon](152)): no lab needed.
- The [solar cell](177) gives twice as many panels, but you have to **discover** it at the [lab bench](117): its page
  has the hint.
- Copper is in [Fine stones and metals](59).

## Solar panel

A thin dark-blue slab. It gives **40 W at noon**, less in the morning and the afternoon (the lower the sun, the less
light falls on it) and **nothing at night**.

- It needs **open sky**: any block above it (up to 48 blocks up) shades it completely. **Glass** and glass panes let
  the light through, so you can build a greenhouse.
- When it **rains** it only gives 30 % of the usual power.
- In a whole MineCloud day a panel collects about **3 kJ** (3000 J): one full [battery](203).

## Wind turbine

A white mast. The **rotor** turns **two blocks above** the block, and its blades sweep about a block above and below
it: leave space around. The nacelle always turns to face the wind.

- Its power grows with the **cube** of the wind speed: **P = 0.6 × v³** (v in m/s), up to 150 W. Twice the wind
  gives **eight times** the power!

| Wind | Power |
|---|---|
| under 1 m/s | 0 W (it does not start) |
| 2 m/s | 5 W |
| 3 m/s | 16 W |
| 4 m/s | 38 W |
| 5 m/s | 75 W |
| 6 m/s | 130 W |
| 6.3 m/s or more | 150 W |

- On flat ground the wind usually blows at 3–4 m/s (16–38 W). On a hill or a tower it is **stronger** (3.5 % more
  for every block above height 6): 5 m/s or more. It also changes over the day, has gusts that reach the 150 W peak,
  and blows harder before and during rain. Use an [anemometer](114) to find good spots.
- Under a roof the wind is weak: 1 or 2 blocks above the turbine leave only 30 % of the wind; 3 or more, 5 %.
- It works day and night.

## Water wheel

A wooden wheel that turns when it touches **water**. It gives **35 W for every side touching water**: the four sides
and the bottom (water on top does not count), up to **105 W** (three sides). It works day and night without
stopping: it is the steadiest generator.

- When you place it, the wheel faces you.
- Water in MineCloud does not flow, so it is enough for the water to touch it: put it at the edge of a lake or a
  river, or dig a channel and fill it with a [bucket](111).

## Hand crank

A wooden box with a handle. **Right click** it (without crouching) to turn it: every turn gives **100 W for 4
seconds** (400 J). Turn it several times in a row and it keeps going for up to 12 seconds. About eight turns fill a
battery: feel how much work energy takes!

Crouch (Shift) to place blocks against it without turning it.

See also: [Electricity](200), [Wires and networks](202), [Batteries](203).
