# Batteries

![Battery block](item:battery_block)

A battery **stores energy** to use it later: the sun's energy at night, the wind's on calm days.

| | Block | Id | Capacity | Most charge or discharge |
|---|---|---|---|---|
| ![](item:battery_block) | Battery Block | `battery_block` | **3 kJ** (3000 J = 0.83 Wh) | **200 W** |

The numbers are scaled for play, because a MineCloud day lasts only 4 minutes (see [Electricity](200)).

## How to get it

| Recipe (C key) | Ingredients |
|---|---|
| **1** `battery_block` (copper and iron) | 2 `copper_block` + 2 `iron_block` + 1 `coal_ore` |
| **2** `battery_block` (lithium) | 2 `battery` + 2 `iron_ore` + 2 `copper_wire` |

The first recipe only needs ordinary materials. The [lithium battery](189) (`battery`) gives twice as many, but you
have to **discover** it at the [lab bench](117): its page has the hint.

## How it works

- If the network has **power to spare**, the battery **charges** with it (up to 200 W per battery).
- If it is **short**, the battery **discharges** to make up the difference (up to 200 W per battery), as long as it
  has energy left. If it cannot cover the whole difference, there is a blackout (see [Electricity](200)).
- The **bars** on its sides show the charge: none (empty), 1, 2, 3 or 4 (full). Each bar is a quarter.
- Several batteries on the same network work like one big battery: they share the charge equally, and their
  capacities and powers add up. Two batteries hold 6 kJ and give up to 400 W.
- A new battery starts **empty**. **Breaking it loses its charge.**

## Doing the maths

How long does a full battery last?

> **time = energy ÷ power**

- One 10 W lamp: 3000 J ÷ 10 W = **300 s = 5 minutes**: two and a half nights (a night is about 120 s).
- One 50 W motor: 3000 ÷ 50 = **60 s**.
- A motor and three lamps (50 + 30 = 80 W): about 37 s.
- Four motors (200 W) on one battery: that is its limit! For more demand you need more batteries.

And how long to fill it? **time = energy ÷ power** again: a solar panel takes about a day (3 kJ a day), a turbine at
38 W about 80 s, a water wheel at 105 W under 30 s, and the hand crank about eight turns.

## Curiosities

- Alessandro Volta made the first battery in 1800 by stacking zinc and copper discs with salted cardboard between
  them. The **volt** is named after him.
- The copper and iron recipe is a nod to those early batteries made of two different metals.

See also: [Generators](201), [Consumers](204), [Multimeter](205).
