# Lifts

![Lift winch](item:lift_winch)

A **lift** is a platform that hangs on ropes from a **winch** above it. The winch is an [electric motor](204) with a
drum: with power it **winds the ropes in** and the platform goes **up**; without power its brake lets the ropes
out slowly and the platform goes **down**. Stand on it and it takes you between floors.

| | Block | Id | Power | Recipe (C key) |
|---|---|---|---|---|
| ![](item:lift_winch) | Lift Winch | `lift_winch` | **60 W** | **1** from 1 `electric_motor` + 3 `iron_ore` + 4 `copper_wire` |
| ![](item:lift_platform) | Lift Platform | `lift_platform` | — | **2** from 4 `planks` + 1 `iron_ore` |

## Building a lift

1. Dig a **shaft** one block wide, from the lowest floor to the highest.
2. Put the **platform** at the bottom of the shaft, in the floor of the lowest storey (its top is where you
   stand).
3. Put the **winch** straight above it, in the ceiling of the highest storey: **3 blocks above** the floor of that
   storey. Between the winch and the platform there must be **only air** (at most 48 blocks): any block in the shaft
   cuts the ropes.
4. Give the winch power through a **lever**: lever on, the platform goes up; lever off, it comes down.

The platform stops going up **2 blocks below the winch** (room for you standing on it), and stops going down when it
**rests on something**. It travels **2.5 blocks a second**, and it never comes down onto a player standing in the
shaft.

> If the power fails, the platform comes down gently by itself: you are never stranded at the top.

## Call buttons

To call the lift from any floor, use a [latch](210) as its switch: the winch has power while the latch is on.

1. Put the latch between the battery and the winch (battery behind, wire to the winch in front).
2. Wire a **push button** at the top floor to the latch's **SET** (left) input: it sends the lift **up**.
3. Wire a push button at the bottom floor to its **RESET** (right) input: it brings the lift **down**.

The latch remembers the last button, so the lift stays where you sent it.

## Riding it

Stand still on the platform: it carries you smoothly. You can jump on it while it moves, and walk off at a floor.
Other players see you riding too. The platform itself is drawn gliding between the blocks; on the server it moves
one block at a time.

## How the game works it out

The **server** moves the platform block, five times a second, for everyone: the platform is an ordinary block in the
world, so a lift stays where it was when the server restarts. Check the winch's network with the
[multimeter](205): it uses **60 W** all the time it has power, also while it waits at the top.

## Curiosities

- In 1853 Elisha Otis showed a lift with a **safety brake** at a fair in New York: he had the rope cut while he stood
  on the platform, and it did not fall. Thanks to brakes like that we can build skyscrapers.
- Real lifts have a **counterweight** on the other end of the rope, almost as heavy as the car: the motor only
  lifts the difference, and saves a lot of energy.

See also: [Motor rams](217), [Mechanical projects](219), [Memory and delays](210), [Switches](207).
