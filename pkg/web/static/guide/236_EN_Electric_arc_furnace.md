# Electric arc furnace

![Electric arc furnace](item:arc_furnace)

A steel vessel with **three graphite electrodes** through its roof, like the real ones. It burns no fuel: it makes its heat from **electricity**, far more of it than any fire could give. Right click it to open it.

| Slot | What goes in |
|---|---|
| **To melt** | something from the table below |
| **Coal** | `coal_ore`: here it is not fuel but an **ingredient** |
| **Result** | what is ready: take it out |

## What it makes

| Put in | And | You get | Time | In the C menu |
|---|---|---|---|---|
| ![](item:sand) 1 `sand` | ![](item:coal_ore) 2 `coal_ore` | ![](item:element_si) **3** `element_si` | 20 s | 1 `stone` + 1 `coal_ore` give 1 `element_si` |
| ![](item:iron_ore) 1 `iron_ore` | ![](item:coal_ore) 1 `coal_ore` | ![](item:steel_ingot) **2** `steel_ingot` | 15 s | only at the [lab bench](117) |

The **C menu recipe for silicon is still there**, and it is instant. The arc furnace makes you wait and needs power, and gives half as much again for the same coal, from plain sand.

## The power it needs

It draws **150 W**, and only **while it has work to do**: idle, it asks nothing of the network, and the [multimeter](205) reads 0 W. Wire it to [generators](201) by touching them or with [copper wire](202).

| What feeds it | Does it run? |
|---|---|
| ![](item:rtg) 1 [radioisotope generator](220), 80 W | **no** |
| ![](item:rtg) 2 radioisotope generators, 160 W | **yes**, day and night |
| ![](item:water_wheel) 1 water wheel, up to 105 W | **no** |
| ![](item:water_wheel) 2 water wheels with three wet sides, 210 W | **yes** |
| ![](item:battery_block) 1 full battery, alone | for **20 s**: one batch of silicon |
| ![](item:solar_panel) 4 solar panels, 160 W at noon | only around noon |
| ![](item:wind_turbine) 1 wind turbine, up to 150 W | only in a strong wind |

Without enough power it **holds still**, keeps what it has done, and goes on when power comes back. Its panel says so: *No power: needs 150 W*. While the arc is on it shines (**light level 14**) and everyone sees it.

**All or nothing:** while it has work and the network cannot feed it, everything else on that network goes off too, like any [consumer](204). So give it a network of its own.

## How to build it

It comes after the [foundry](235), when you already work with electricity:

| Recipe (C key) | Ingredients |
|---|---|
| 1 `arc_furnace` | 4 `iron_block` + 1 `electric_motor` + 8 `copper_wire` + 3 `coal_ore` + 4 `brick` |

## Why carbon pulls the oxygen off silica

Sand is silicon holding on to oxygen, very hard. To get silicon you need something that wants that oxygen even more. At about **2000 °C** carbon does: it grabs the oxygen and flies away with it as a gas, carbon monoxide, and silicon is left behind, molten.

**SiO₂ + 2 C → Si + 2 CO**

Each sand needs two carbons, as there are two oxygens to carry off: that is why the recipe asks for 2 coal. Real furnaces use coal and wood chips in just this way. Steel starts the same way: carbon pulls the oxygen off iron ore, and a little of it stays, between the iron atoms.

## How an arc makes 2000 °C

Air does not normally carry electricity. But push a strong enough current across a small gap and it tears electrons off the air, which turns into a glowing gas that conducts: **plasma**. That is an **arc**, a small steady lightning bolt, and it is about as hot as the surface of the Sun. Coal fires cannot get close.

Real ones have three electrodes because factories get their power in three phases, and they use as much power as a small town. Graphite makes good electrodes as it carries current and does not melt.

## From silicon to chips and solar cells

What comes out of the furnace is nearly pure, but not nearly enough. For a chip, chemists purify it until only one atom in a billion is anything else. Then a seed crystal is drawn slowly up out of the melt, and a single perfect crystal grows, as long as a person is tall. It is sliced into discs thinner than a coin.

Silicon alone barely conducts. Add a trace of [boron](143) or [phosphorus](153) and it does, in a way you can steer: that is how transistors work, billions of them on one chip, and how a [solar cell](177) turns light into current. In the game, silicon goes into [solar panels](201) and the [radioisotope generator](220).

See also: [Silicon](152), [Steel ingot](120), [Consumers](204), [Foundry](235).
