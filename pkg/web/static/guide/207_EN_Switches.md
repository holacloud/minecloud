# Switches

![Lever](item:lever)

A **switch** is a piece of wire you can **cut and join again**. While it is on it lets electricity through and joins
the networks it touches into one. While it is off it cuts them: each side is a separate network. Just like the
light switch in your room.

| | Block | Id | Turns on... | Recipe (C key) |
|---|---|---|---|---|
| ![](item:lever) | Lever | `lever` | with a right click, and stays so | **2** from 1 `planks` + 1 `cobblestone` + 1 `copper_wire` |
| ![](item:push_button) | Push Button | `push_button` | with a right click, for **1.5 seconds** | **2** from 1 `cobblestone` + 1 `copper_wire` |
| ![](item:pressure_plate) | Pressure Plate | `pressure_plate` | while a **player** stands on it | **2** from 2 `cobblestone` + 1 `copper_wire` |

## Your first switch

1. Put a charged [battery](203), a **lever** and a [lamp](204) in a row, touching face to face.
2. **Right click** the lever: the handle goes **up** and the lamp lights.
3. Click again: the handle goes **down** and the lamp goes out.

With the lever off there are **two networks**: the battery's and the lamp's. With the lever on they are one again.
Check it with the [multimeter](205).

> Crouch to place a block against a lever or a button without working it.

## Lever

A stone base with a wooden handle. **Handle up: on. Handle down: off.** It stays as you leave it, even when you go
away or the server restarts.

## Push button

A red button. Pressed, it sinks and lights up, lets the current through for **1.5 seconds** and switches itself off.
Press it again while it is on and it counts from the start again. Good for a door that opens for a moment, or a
doorbell.

## Pressure plate

A thin stone slab you step on. It is on **while a player stands on it** (its rim turns yellow) and off when you step
off. You can walk over it like over a wire.

**Animals and monsters do not press it**: they live on each player's computer, and the server only knows where the
players are. That way everybody sees the same thing.

## Signal

Besides cutting and joining, switches give a **signal** to [logic gates](209): a lever that is on and touches a
gate's input already counts as "yes", **even without a battery**. The gates page explains it.

## How the game works it out

The server checks the circuits **5 times a second**. That is why a lamp lights almost as soon as you move the lever,
and every player sees it the same.

## Curiosities

- A switch *breaks* the path of the current: in English you "switch it off", in Spanish you *interrumpir* it, to
  interrupt.
- Many staircases have two switches for one light, one downstairs and one upstairs. You can build it with an
  [XOR gate](209): it is among the [example circuits](211).

See also: [Sensors](208), [Logic gates](209), [Electricity](200).
