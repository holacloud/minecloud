# Light and darkness

In MineCloud there are two kinds of light: **sky** light and **torch** light. Both are worked out block by
block and "baked" into the terrain itself.

## Sky light

- A block in the **open air** gets the full light of the sky.
- Under a roof the light fades little by little: **4 blocks** below the roof none is left.
- Light creeps in **sideways** up to 3 blocks: that is why a cave mouth is lit and the back of the cave is not.
- Leaves, glass and transparent blocks **do not block** the sky.

## Caves that darken

When you go down into a cave, everything gets darker still. The game counts the solid blocks **above** you (up
to 10) and those **around** you: the more enclosed you are, the lower the ambient light, and the bluer and
thicker the fog. At most, everything gets **78 %** darker.

## Torches

![Torch](item:torch)

- A torch gives light of level **14**, which drops **one level per block** as it spreads like a stain.
- Solid blocks stop it: light goes around walls, not through them.
- Its strength is **squared**: near the torch it is very bright and it dims quickly.
- By day torches shine at **60 %** and at night at **100 %**, so they show mostly after sunset.
- A torch **in your hand** lights up what is around you, about 8 blocks.

See [Torch](62).

## Light that scares

The [wandering shadow](37) **fears light**:

- At dawn it dissolves into smoke.
- Also when you hold a torch within 5 blocks of it.
- Or when a placed torch is within 4 blocks of it.

Shadows do not appear near placed torches. A good way to sleep soundly is to ring your house with torches.

## Other lights

- **[Wisp](41)**: carries a soft blue-green light. There is just one light for all wisps: the one of the
  wisp closest to you.
- **[Lightning](43)**: each bolt from the storm golem lights up the whole scene for a moment.
- **[Fireflies](36)** and the **[firefly jar](97)**: they glow and blink.
- **Glowing eyes:** those of the owl, the fox and the shadow, at night.

## Ultra mode: real light

In [Ultra mode](14) the scene is drawn with **high dynamic range** (HDR): lights can be "brighter than white".
Whatever goes past that limit (the sun, torches, owls' eyes, the golem's cracks, the wisp) gets a **halo**
(bloom). There are also shafts of sunlight (god rays) and crisp shadows that follow the player.

See also [Night life](101).
