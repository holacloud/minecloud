# Lifts

![Lift winch](item:lift_winch)

A **lift** is a platform that hangs on ropes from a **winch** above it. The winch is an [electric motor](204) with a
drum: with power it **winds the ropes in** and the platform goes **up**; without power its brake lets the ropes
out slowly and the platform goes **down**. Stand on it and it takes you between floors.

| | Block | Id | Power | Recipe (C key) |
|---|---|---|---|---|
| ![](item:lift_winch) | Lift Winch | `lift_winch` | **60 W** | **1** from 1 `electric_motor` + 3 `iron_ore` + 4 `copper_wire` |
| ![](item:lift_platform) | Lift Platform | `lift_platform` | — | **2** from 4 `planks` + 1 `iron_ore` |
| ![](item:lift_stop) | Lift Stop | `lift_stop` | — | **2** from 1 `iron_ore` + 1 `glass` + 2 `copper_wire` |

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

## Lift stops: a lift for every floor

A lift with only a winch knows two places: the top and the bottom. A **lift stop** gives it every floor in between.

1. Build the shaft, the platform and the winch as above, and give the winch power **all the time**: a generator or
   a battery touching it, with no lever.
2. On each floor, put one **stop** in the wall of the shaft, **3 blocks above the floor you stand on**: right over a
   door two blocks high, so that its face looks at the landing and at the shaft.
3. **Right click a stop**: the lift goes there.

That is all the wiring: **one block per floor**. The rules, all of them:

- **The last stop called wins.** Calling one frees the one before: one call at a time.
- The lift goes **straight there, up or down**, from wherever it is, and holds there, 3 blocks below the stop (as it
  stops 3 below the winch: room for you). A stop remembers its call, so a stop that has been called once is enough.
- With stops in the shaft, a powered lift moves **only** when one calls it: it no longer runs up to the top by itself.
- **If the power fails** the stops do not count: the lift comes down gently, as ever, and rests on the bottom. When the
  power returns it goes back to the stop that was called.
- It never comes down onto a player in the shaft. A block in the shaft stops it until you take it away, as always.

A stop shows what is happening: **dark** when free, **amber** when the lift is on its way, **green** when the lift is
standing there.

### Buttons far from the shaft

A stop's **top** is its one input, like a gate's input: a signal coming on there is a call. So a [push button](207)
right on top of a stop is one more way of calling it, and a [wire](202) from its top takes the button anywhere. A
[lever](207) on it calls once when you switch it on: it does not keep the lift there if another stop is called later.

### A sensor

While the lift **stands** at a stop (not while it goes by), the stop is **on**: it conducts on every face except the
top, as a switch in a wire. Battery, stop, lamp: a lamp that says the lift is here. You can feed a [gate](209) from it
as well.

### The door that cannot be opened on an empty shaft

Put an [iron door](197) right under the stop (or touching it in any way). It **opens by itself** when the lift stands
there and **shuts when it leaves**, with no motor and no power, and **no hand can open it**: nobody walks into the
shaft by mistake. Wooden doors do not do this.

### What it cannot do

- The stops are in the wall, so they stay there as you ride: you can only reach your floor's stop and the next one up
  (a hand reaches 4.5 blocks, and the platform hides what is below it). See the [apartment lift](219) for two buttons
  that take you the rest of the way.
- A stop serves the shaft next to it. Do not share a wall block between two shafts: both lifts would answer it.
- The rope is still at most 48 blocks.

## Riding it

Stand still on the platform: it carries you smoothly. You can jump on it while it moves, and walk off at a floor.
Other players see you riding too. The platform itself is drawn gliding between the blocks; on the server it moves
one block at a time.

## How the game works it out

The **server** moves the platform block, five times a second, for everyone: the platform is an ordinary block in the
world, so a lift stays where it was when the server restarts. Check the winch's network with the
[multimeter](205): it uses **60 W** all the time it has power, also while it waits at the top or holds at a stop. Point
the multimeter at a stop to see whether it is free, called, or has the lift. Its call is kept in the block, so a lift
half way to a stop when the server restarts carries on when it comes back.

## Curiosities

- In 1853 Elisha Otis showed a lift with a **safety brake** at a fair in New York: he had the rope cut while he stood
  on the platform, and it did not fall. Thanks to brakes like that we can build skyscrapers.
- Real lifts have a **counterweight** on the other end of the rope, almost as heavy as the car: the motor only
  lifts the difference, and saves a lot of energy.

See also: [Motor rams](217), [Mechanical projects](219), [Memory and delays](210), [Switches](207).
