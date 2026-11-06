# Fridge and freezer

![Fridge](item:fridge)

| | Block | Id | Slots | Power | Made from |
|---|---|---|---|---|---|
| ![](item:fridge) | Fridge | `fridge` | 18 fridge + 9 freezer | **30 W** | 6 iron ore, 1 marble |
| ![](item:chest_freezer) | Chest Freezer | `chest_freezer` | 36 freezer | **30 W** | 8 iron ore, 2 marble, 2 copper wire |

Right click to open them, like a [chest](226). The fridge has two **tabs**, one for each compartment. What they hold lives on the server, so it goes on getting cold while you are away, and breaking one drops everything in it.

## They need electricity

They are [consumers](204): touch one with a [wire](202) or a [generator](201). The two cells of a fridge are one fridge, 30 W in all. A [radioisotope generator](220) runs two of them on its own, and the [multimeter](205) reads them like any other block.

**A network is all or nothing** ([Electricity](200)): if it cannot feed every consumer, everything goes off, your fridge too. Then the panel says "No power: works as a cupboard". Nothing in it changes, nothing is lost, and what had started going cold goes on from there when the power comes back.

## Fridge compartment: a minute

| Put in | You get | Health (**G**) |
|---|---|---|
| ![](item:water_flask) `water_flask` (+2) | ![](item:cold_water) `cold_water` | +3 |
| ![](item:milk) `milk` (+2) | ![](item:cold_milk) `cold_milk` | +3, and it still cures poison |
| ![](item:soda_water) `soda_water` (+3) | ![](item:cold_soda) `cold_soda` | +4 |

A whole stack changes at once, about **60 seconds** after it goes in. Drinks give the glass back, as usual.

## Freezer: two minutes

The freezer tab of a fridge and the whole of a chest freezer do the same, in about **120 seconds**:

| Put in | You get |
|---|---|
| ![](item:water_flask) `water_flask` or ![](item:cold_water) `cold_water` | ![](item:ice) `ice` |
| ![](item:raw_fish) `raw_fish` | ![](item:frozen_fish) `frozen_fish` |
| ![](item:cooked_fish) `cooked_fish` | ![](item:frozen_cooked_fish) `frozen_cooked_fish` |
| ![](item:bread) `bread` | ![](item:frozen_bread) `frozen_bread` |

Milk and soda do not freeze here: in a real freezer they would burst the bottle.

## The three rules of cold

1. **Frozen food cannot be eaten.** Press **G** and you are told so.
2. **Only the [oven](233) thaws.** Frozen things stay frozen anywhere else: a chest, your pocket, a fridge with no power. Ten seconds of fire and they are back to what they were.
3. **Cold stays.** A cold drink you take out stays cold for ever.

And an honest warning: **in this game food does not spoil.** Nothing rots in a chest or in your pocket, so a fridge is not here to save your food. It is here to make it colder and better. In real life, it is the other way round.

## Why cold keeps food

Food goes off because **bacteria** and moulds eat it before you do. They are alive, and everything they do is chemistry, and chemistry goes slower when it is cold. In a fridge, at about 4 °C, they take days to do what they would do in hours on the table. They are not dead, only slow: that is why food in a fridge still goes off, in the end.

A freezer goes further. At −18 °C the water in food turns to **ice**, and bacteria need liquid water to live, so they stop altogether. Thaw the food and they wake up again.

## What freezing does to water

Water is odd. Nearly everything shrinks when it goes solid, and water **grows**, by about a tenth: its molecules line up in a six-sided pattern with empty space inside. That is why ice floats, why snowflakes have six points, and why a full bottle in a freezer can burst. It also explains why frozen strawberries go soft when thawed: the ice crystals have pierced their cells.

## A fridge does not make cold

There is no such thing as "cold" to make: there is only heat, and a fridge **moves it**. A liquid runs round a closed loop of pipes:

1. In the pipes inside the fridge it **evaporates**, and to do so it takes heat from the air around it, just as the sweat on your skin cools you.
2. An electric **compressor**, the hum you hear, squeezes that gas, which gets hot, like a bicycle pump.
3. In the black grid behind the fridge the hot gas gives its heat away to the room, and turns liquid again. Back to the start.

So the back of a fridge is warm, and a fridge with its door open warms the kitchen. Heat does not go from cold to hot by itself: moving it uphill costs energy, which is why it needs electricity. In the game, 30 W.

One odd thing can also go in the freezer: a tardigrade in its tube. It comes out as a tun, and an oven will not bring it back, but water will: see [Cryptobiosis](241).
