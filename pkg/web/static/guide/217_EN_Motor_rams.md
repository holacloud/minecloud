# Motor rams

![Motor ram](item:motor_ram)

A **motor ram** is an [electric motor](204) in a steel case that **pushes blocks**. While its network has power
the ram pushes its plate **out** and moves the blocks in front of it **one block** further. When the power goes, the
arm comes back in. The **sticky ram** has honey on its plate: when it comes back it **pulls** the block in front of it
along.

| | Block | Id | Power | Recipe (C key) |
|---|---|---|---|---|
| ![](item:motor_ram) | Motor Ram | `motor_ram` | **40 W** | **1** from 1 `electric_motor` + 2 `iron_ore` + 2 `planks` |
| ![](item:sticky_ram) | Sticky Ram | `sticky_ram` | **40 W** | **1** from 1 `motor_ram` + 1 `honey_bottle` |

## Placing it

A ram **faces you** when you place it, like the side of a box you are looking at:

- Looking at a wall: it pushes **towards you**.
- Looking **down** at the floor: it pushes **up**.
- Looking **up** at a ceiling: it pushes **down**.

The plate (wood in an iron frame; golden honey on the sticky one) is the side that pushes.

## Your first push

1. Put a ram on the floor, a **lever** behind it and a charged [battery](203) behind the lever, touching face to face.
2. Put two or three blocks in a row in front of the ram.
3. **Right click** the lever: the arm comes out and the whole row moves **one block**.
4. Turn the lever off: the arm goes back. With a sticky ram, the first block of the row comes back with it.

A [hand crank](201) works too: turn it and the ram pushes; when the crank runs down (a few seconds later) the arm
comes back.

## What it can push

- At most **12 blocks** in a row. The row must end in **air**, **water**, **lava** or a small plant (grass,
  flowers, mushrooms): the last block takes its place, and the water or the plant is gone.
- **It never moves:** bedrock, liquids, electric blocks (wires, lamps, other rams...), doors, beds, signs,
  ladders, sound blocks, farmland and wheat, chests and lift platforms. Nor anything out of the top or the bottom of
  the world.
- If it cannot push, it **waits**: while it has power it tries again five times a second, so it pushes as soon as
  the way is clear. It never moves half a row.

## Players on top

If you are **standing on** a block that is pushed, you go with it (a ram pushing up lifts you one block). If a
block or the arm comes into the place where you are standing, it **shoves** you out of the way. Animals are not
carried: they live on each player's computer.

## How the game works it out

The **server** moves the blocks, five times a second, so every player sees the same thing. Whether the arm is out
is part of the block's name (`motor_ram:e:out`, `sticky_ram:u:in`), and the arm is a block too (`ram_arm:e:plain`).
That is why rams stay as they were when the server restarts. If you break a ram while it is out, its arm goes with
it.

A ram needs its **40 W** all the time it is out: in an all-or-nothing network ([Electricity](200)), if the power
runs short, every ram goes back in. After a blackout a network waits **3 seconds** before switching on again; a
lever acts at once.

## Curiosities

- A ram turns the spin of a motor into a straight push. Real machines do it with a **screw**, a **crank and rod**
  (like the wheels of a steam train) or with oil under pressure (**hydraulics**), as in diggers.
- The honey of the sticky ram really is sticky: honey is mostly sugar, and as its water dries out it turns into a
  kind of glue.

See also: [Lifts](218), [Mechanical projects](219), [Switches](207), [Consumers](204).
