# Multimeter

![Multimeter](item:multimeter)

The electrician's tool: it **measures** what is going on in a network.

| | Item | Id | Recipe (C key) |
|---|---|---|---|
| ![](item:multimeter) | Multimeter | `multimeter` | 2 `copper_wire` + 1 `iron_ore` + 1 `glass` |

## How to use it

Hold it and **right click any electric block** (a wire, a generator, a battery, a lamp...). A panel in the corner
shows the reading of **its whole network**, and it updates every second while you keep holding the multimeter.
Switch to another item to put it away.

In the [left hand](251) no click is needed: it reads the electric block you look at.

| Line | What it means |
|---|---|
| **This block** | what that block is doing: how many watts it gives (generator) or uses (consumer), or how much energy it holds (battery) |
| **Generation** | the power of all the generators together, and how much each kind gives (solar, wind, water, crank) |
| **Demand** | the power all the consumers need |
| **Balance** | generation minus demand. Positive (+): power to spare. Negative (−): not enough |
| **Stored** | energy in the batteries, in kJ and Wh, and the percentage |
| **Batteries last** / **Full in** | how long until the batteries run out (or fill up) at the current pace |
| **Status** | **ON** (every consumer works) or **OFF** (blackout: not enough power) |
| **Signal** | on logic blocks, or when it carries one: whether [gate](209) inputs touching this network are on |
| **Network** | how many blocks it has, and of which kinds |

If it says the network is **too big**, it has more than 512 blocks and does not work: split it (see
[Wires and networks](202)).

## Things to try

- Measure a solar panel at dawn, at noon and in the afternoon: watch the power rise and fall with the sun.
- Measure one wind turbine at the foot of a hill and another at the top.
- Put one lamp, then two, then a motor on a network and watch the **demand** and the **balance**.
- Turn a [hand crank](201) and see how many watts it gives.

## Curiosities

- A real multimeter measures **volts** (how hard the electricity pushes), **amperes** (how much current flows) and
  **ohms** (how hard it is for it to pass). Power is volts × amperes.

See also: [Electricity](200), [Batteries](203).
