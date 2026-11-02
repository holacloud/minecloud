# Eel tank

![Eel tank](item:eel_tank)

A glass tank full of water, with **copper plates** at the bottom that collect the current. With an
[electric eel](213) inside it is a **living generator**: it makes electricity day and night, with no sun or wind.

| | Name in the game | Id |
|---|---|---|
| ![](item:eel_tank) | Eel Tank | `eel_tank` (with an eel: `eel_tank:full`) |
| ![](item:eel_bucket) | Eel Bucket | `eel_bucket` |

## How to get it

| Recipe (C key) | Ingredients |
|---|---|
| 1 `eel_tank` | 4 `glass` + 1 `water_bucket` + 2 `copper_wire` |

The water [bucket](111) stays in the tank. Copper wire is made as shown in [Wires and networks](202).

## Step by step

1. **Catch an eel:** with an ![bucket](item:bucket) **empty bucket** in your hand, **right click** near an eel
   (within 4.5 blocks). You get an ![eel bucket](item:eel_bucket) `eel_bucket`. Better from the bank: if you get into
   the water, it may give you a shock!
2. **Place the tank** like any block.
3. **Put the eel in:** right click the tank with the `eel_bucket`. The eel goes in (you will see it swimming in
   circles inside) and you get the empty bucket back.
4. **Connect it** to your network like any generator: a [wire](202), a [battery](203) or a [lamp](204) touching one of
   its faces.

## The generator

| State | Power |
|---|---|
| Empty tank | 0 W |
| With an eel | **25 W**, day and night |
| Just fed | **50 W** for 10 s per fish (up to 30 s in a row) |

- **Feeding:** right click the tank with ![raw fish](item:raw_fish) `raw_fish`. The eel gulps it down, swims faster
  and sparks fly inside the tank: for **10 seconds** it gives **50 W**. Several fish in a row add up, to at most 30
  seconds.
- 25 W is enough for two 10 W [lamps](204) all night, and in a MineCloud day (4 minutes) it collects about 6 kJ: two
  full [batteries](203)!
- The [multimeter](205) shows it as the source `eel`.

## Taking it out or letting it go

- **Take it out:** right click the tank with an **empty bucket**. You get the `eel_bucket` back and the tank is left
  empty.
- **Let it go:** use the `eel_bucket` aiming at water at least **2 blocks** deep. The eel slips back into the water
  and you get the bucket back.
- If you **break** a tank with an eel in it, the eel lands on the ground! Catch it quickly with a bucket (if it lands next to
  water, it flips back in by itself): out of water it only lasts a minute. The tank drops empty.

## Science: a living battery

An electric eel has thousands of **electrocytes**, cells that work like tiny batteries of about 0.15 V. They are
stacked **in series**, one after another, like the batteries in a torch: the volts add up to hundreds. The rows of
electrocytes also lie **in parallel**, side by side, which adds up current. Real batteries are
connected the same way: in series the volts go up; in parallel, the current (in the game, the [batteries](203) of a
network simply add up their energy).

In the game everything is scaled for play (see [Electricity](200)). A real eel only discharges now and then and gets
tired, so nobody uses one to light a house... although some aquariums have lit their Christmas tree with the shocks
of their eel.

See also: [Electric eel](213), [Generators](201).
