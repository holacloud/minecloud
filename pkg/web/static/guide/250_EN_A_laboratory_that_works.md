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

## What is only decoration

- The telescope in the dome is a **model** made of blocks. A real [telescope](133) is an item you raise by hand: the dome has an open slit to use one through.
- A [weather station](112) is an item you set down, not a block. There is a pad on the terrace for it.
- The transformers in the power hall, the double helix in the atrium and the lecture hall's screen do nothing.

## Why the chests are empty

A build places blocks and nothing else: no plan can fill a chest. In creative mode, `/microkit` gives everything for the microscopes, and `/give` the rest; the signs say which.
