# A laboratory that works

![Lab bench](item:lab_bench)

In creative mode, `/build lab` raises a research institute: 56 by 52 blocks, three floors and a roof under an observatory dome. It is a good building to read, because its electricity is not a drawing: it all runs on the same rules as your own [networks](200).

## Why ten networks and not one

A network is **all or nothing**: if it cannot feed every consumer, all of them go off. And it stops working altogether over **512 blocks**. So the institute is cut into separate networks, each with generators that cover its whole demand on their own.

| Network | Generators | What it feeds |
|---|---|---|
| Main (power hall) | 6 [RTG](220), 8 [batteries](203), 24 [solar panels](201), 2 turbines | Ground floor, night lights of the lobby and the terrace |
| Floor 1, floor 2 | 6 RTG and 3 batteries each, in a cupboard | That floor's rooms and corridors, the lecture hall |
| Lift | 1 RTG | The [winch](218), 60 W |
| Cold | 2 RTG | 2 fridges and a freezer, 90 W |
| Arc | 2 RTG | The [arc furnace](236), 150 W while it works |
| Greenhouse | 2 RTG | 4 grow lamps, 120 W |
| Logic benches | 2 RTG | 9 test lamps |
| Blackout bench | 1 RTG | A bench made to fail |
| Plaza | 1 water wheel | 4 street lamps at night |

## Things to try

1. **The blackout bench**, in the experiment room: 3 lamps and the motor are exactly 80 W. Throw the lever for one lamp more and everything on the bench goes out. Then connect the battery, let it charge with the motor off, and try again.
2. **Logic gates**: an AND, OR, XOR, NOT, a latch, a delay and three [sensors](208), each with its lamp.
3. **The darkroom**: a [microscope](238) in the dark, and a lever that lights the lamp beside it.
4. **The main switch**, in the power hall: cuts the ground floor and leaves the batteries charging. The other lever isolates the RTGs: the [multimeter](205) then shows only sun, wind and batteries.
5. **Night**: a [daylight sensor](208) in night mode lights the lobby, the terrace and the plaza by itself.
6. **The weather**: on the terrace, in the open, stands a real [weather station](112). Look at it for the readings; when it rains, its gauge fills.

## What is only decoration

- The telescope in the dome is a **model** made of blocks. A real [telescope](133) is an item you raise by hand: the dome has an open slit to use one through.
- The transformers in the power hall, the double helix in the atrium and the lecture hall's screen do nothing.

## What the chests hold

Once it is built, every room's chests hold what that room needs to work: a well-stocked lab, not a bottomless pantry.

| Room | What it keeps |
|---|---|
| Microscopes and samples | Test tubes, glass slides, micropipettes, iodine, methylene blue, dark-field stops, water and moss samples, agar plates and Petri dishes |
| Chemistry | The elements of the known reactions (water, salt, glass, steel), glass, water flasks, baking soda, copper sulfate, quicklime |
| Fridges and freezer | Cold water, milk and soda, cheese, agar plates; ice, frozen fish and bread |
| Hot bay | Coal in the foundry, the arc and the oven; sand, ore and cobblestone in the chests by the door |
| Electrical workshop and power hall | Copper wire, multimeters, bulbs, lamps, batteries, levers, buttons and logic gates |
| Experiments | Multimeters, logic gates, sensors, levers, bulbs and wire |
| Canteen | Coal in the oven; bread, fish, cheese, honey, mushrooms and wheat in the barrel |
| Library and offices | Blueprints, breeding notebooks, star charts, a measuring tape, rocks for the geologist, a telescope for the astronomer |
| Greenhouse | Wheat seeds, fertilizer, a water bucket and a hoe |
| Observatory and deck | Telescopes, star charts, a thermometer, a barometer and an anemometer |

The furnaces hold only fuel, so none lights until you give it something to work on. The fridges keep only what does not change in them. A build only places blocks: what the chests hold is put in by the server, only for a player in creative mode and only into empty chests. `/build undo` takes away what it put in without dropping it on the floor; anything you stored there since does drop.
