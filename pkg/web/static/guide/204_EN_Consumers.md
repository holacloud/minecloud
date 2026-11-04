# Consumers

![Electric lamp](item:electric_lamp)

Consumers are the blocks that **use** electricity to do something. Each one needs a fixed power while it works.

| | Block | Id | Power | What it does |
|---|---|---|---|---|
| ![](item:electric_lamp) | Electric Lamp | `electric_lamp` | **10 W** | lights up like a torch |
| ![](item:grow_lamp) | Grow Lamp | `grow_lamp` | **30 W** | makes wheat grow twice as fast |
| ![](item:electric_motor) | Electric Motor | `electric_motor` | **50 W** | spins, opens iron doors |
| ![](item:fridge) | Fridge | `fridge` | **30 W** | [chills and freezes](234) (its two cells are one fridge) |
| ![](item:chest_freezer) | Chest Freezer | `chest_freezer` | **30 W** | [freezes](234) |

## How to get them

| Recipe (C key) | Ingredients |
|---|---|
| **2** `electric_lamp` | 1 `light_bulb` + 1 `glass` + 1 `copper_wire` |
| **1** `electric_lamp` (carbon filament) | 1 `glass` + 1 `coal_ore` + 2 `copper_wire` |
| **1** `grow_lamp` | 1 `neon_lamp` + 1 `argon_lamp` + 1 `copper_wire` |
| **1** `grow_lamp` (from lamps) | 2 `electric_lamp` + 1 `glass` |
| **1** `electric_motor` | 2 `iron_ore` + 1 `copper_block` + 2 `copper_wire` |

The [light bulb](187), the [neon lamp](125) and the [argon lamp](126) are made at the [lab bench](117): their pages
say how. You do not need them: every consumer also has a recipe with ordinary materials.

## Electric lamp

A glass globe on a copper base. With power it **lights up** and lights the area around it **like a torch**. Without
power it is a dark globe.

It stays lit whenever its network has power, **day or night**: in the daytime it spends energy for nothing. To light it only at night, give it a
[daylight sensor](208) in night mode, or a [switch](207).

## Grow lamp

A panel of red and blue LEDs, the colours plants use most for photosynthesis. While lit, the [wheat](107) up to **4
blocks below** it and up to **2 blocks to each side** grows **twice as fast**. It lights the area too.

## Electric motor

A steel box with copper coils inside. With power, a fan **spins** on top and its light turns green.

- When the motor **switches on**, it **opens** the [iron doors and iron trapdoors](197) touching it (both halves of a
  door). When it **switches off**, it closes them.
- In between you can still open and close them by hand.

## Fridge and chest freezer

Furniture that works on electricity: see [Fridge and freezer](234). Without power they are plain cupboards, and nothing in them changes.

## Electric arc furnace

A machine that melts sand and coal into silicon: see [Electric arc furnace](236). It draws **150 W**, the most of any consumer, and only while it has work: idle, it asks for nothing. One 80 W [radioisotope generator](220) is not enough, two are.

## All or nothing

If the network cannot give every consumer what it needs, **they all switch off** (see [Electricity](200)). At noon a
40 W solar panel lights a lamp (10 W), but add a motor (50 W): 60 W is more than 40 W, and the lamp goes off
too. Check it with the [multimeter](205).

## Curiosities

- Thomas Edison's first long-lasting bulbs (1879) had a filament of **carbonised** thread: that is the "carbon
  filament" recipe.
- An electric motor works thanks to **magnetism**: the current in the copper coils turns them into magnets that push
  and pull.

See also: [Generators](201), [Batteries](203), [Electric projects](206).
