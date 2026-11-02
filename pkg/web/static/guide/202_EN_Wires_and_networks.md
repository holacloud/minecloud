# Wires and networks

![Copper wire](item:copper_wire)

Electricity travels through **conductors**. Copper is one of the best: that is why the cables in your house are
made of copper.

| | Block | Id | Recipe (C key) |
|---|---|---|---|
| ![](item:copper_wire) | Copper Wire | `copper_wire` | **12** wires from 1 `copper_block` |
| ![](item:wire_post) | Wire Post | `wire_post` | **2** posts from 4 `copper_wire` + 1 `planks` |

## Laying wires

- **Copper wire** is a thin strand on the floor. You walk over it, and it bends by itself towards every electric
  block next to it (another wire, a battery, a lamp...).
- The **wire post** is a copper pole: use it to take the electricity **up or down**, along a wall or to the top of
  a tower with a wind turbine.

## What a network is

All the electric blocks that touch **face to face** (east, west, north, south, above or below) form one **network**.

- **Every electric block conducts**: a lamp stuck to a battery stuck to a solar panel is already a network, without
  any wire.
- Blocks that only touch at a **corner** (diagonally) are not connected.
- Two separate networks share nothing: a battery on one does not help the other.
- A network is all or nothing: if it cannot feed **every** consumer, they all switch off (see
  [Electricity](200)). If you want the lamps to stay lit when a motor starts, put them on **separate networks**.
- **Switches, sensors and logic gates** are the exception: they conduct only **while they are on**. A lever that is
  off splits the network in two (see [Switches](207)).

## And the plus and minus?

In real life electricity has to go **round a closed loop**: out of the generator through one conductor and back
through another. That is why real cables have two wires inside, and batteries and LEDs have two **poles**, plus (+)
and minus (−), that must not be swapped. In MineCloud one copper wire stands for the pair, so you can never connect
anything the wrong way round.

## The limit

A network can have at most **512 blocks**. If it grows bigger **it does not work at all** (the
[multimeter](205) tells you). Split it into smaller networks.

## Curiosities

- Real wires lose a little energy as heat, more the longer they are. In MineCloud wires are perfect and lose
  nothing.
- Birds can perch on a power line because the current has no other path to take through them.

See also: [Generators](201), [Batteries](203), [Consumers](204).
