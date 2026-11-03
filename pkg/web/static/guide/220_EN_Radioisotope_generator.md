# Radioisotope generator

![Radioisotope generator](item:rtg)

A heavy steel drum covered in **cooling fins**, with a yellow radiation sign and a warm glow between the fins. It
is the most patient [generator](201) there is: once placed it gives **80 W, always**. Day and night, rain or
shine, under the ground or on top of a mountain, with **no fuel** and **nothing to do**.

Scientists call it an **RTG**: a *radioisotope thermoelectric generator*. Real ones power space probes that travel
where the sun is too weak and nobody can go to fix them.

| | Name in the game | Id | Power |
|---|---|---|---|
| ![](item:rtg) | Radioisotope Generator | `rtg` | **80 W**, all the time |

## How to get it

| Recipe (C key) | Ingredients |
|---|---|
| 1 `rtg` | 4 `element_pb` + 2 `element_si` + 1 `element_pt` + 2 `iron_block` + 4 `copper_wire` |

- [Lead](174) (`element_pb`) is the **shield**, [silicon](152) (`element_si`) makes the **thermocouples**, and
  [platinum](171) (`element_pt`) wraps the hot core, as iridium, its neighbour in the periodic table, does in
  real ones. Every element block is synthesised from stone and coal: see [Element blocks](60).
- `iron_block` is refined from stone and sand (see [Fine stones and metals](59)); copper wire is in
  [Wires and networks](202).

It costs much more than a [solar panel](201), but you only build it once.

## How to use it

1. **Place it** like any block. It is a full cube: you can build on it, bury it or hide it in a wall.
2. **Connect it** like any generator: a [wire](202), a [battery](203), a [lamp](204) or a motor touching one of
   its faces.
3. That is all. Hold a [multimeter](205) and right click it: it reads *Radioisotope Generator giving 80 W*, and the
   network shows the source `radioisotope`.

## What 80 W is good for

| Consumer | Uses | One RTG |
|---|---|---|
| [Electric lamp](204) | 10 W | 8 lamps |
| [Grow lamp](204) | 30 W | 2 grow lamps |
| [Electric motor](204) | 50 W | a motor and 3 lamps |
| [Motor ram](217) | 40 W | 2 rams |
| [Lift winch](218) | 60 W | a winch and 2 lamps |

- It runs a [motor ram](217) or a [lift winch](218) **on its own, without batteries**, also at night.
- In a MineCloud day (4 minutes) it makes 80 × 240 = **19 200 J**: more than **six full [batteries](203)**. It fills
  an empty battery in under 40 seconds.
- A [solar panel](201) gives 40 W at noon, but nothing at night: over a whole day it collects about 3 kJ. One RTG
  works like six panels with batteries... with no batteries.
- Remember that a network is **all or nothing**: if the demand goes above 80 W and there are no batteries or other
  generators, everything switches off. Add a second RTG, or a battery for the peaks.

## Science: heat from atoms

Some atoms are **unstable**: from time to time their nucleus breaks apart by itself and shoots out a tiny, very
fast particle. This is called **radioactive decay**. The fuel of a real RTG is **plutonium-238**, and its
particles bump into the atoms around them and turn their speed into **heat**. A pellet of it glows red hot all by
itself, without burning anything!

You cannot say *when* one atom will decay, but you can say how long it takes for **half of them** to do it: the
**half-life**. For plutonium-238 it is about **88 years**. So an RTG still gives half of its heat after 88 years,
and a quarter after 176. That is why it lasts for **decades** without refuelling. (In the game it never runs down:
a MineCloud lifetime is far too short to notice.)

### From heat to electricity: the Seebeck effect

An RTG has **no moving parts**: no turbine, no motor, nothing to wear out. It uses **thermocouples**.

In 1821 Thomas Seebeck found out that if you join two **different metals** (or semiconductors, like silicon) and
heat one joint while keeping the other one cold, a small **voltage** appears. That is the **Seebeck effect**. One
thermocouple gives very little, but hundreds of them in a row add up, like the cells of a [battery](203).

In an RTG the hot side touches the radioactive core and the cold side touches the **fins**, which throw the heat
away into space. Only about **6 %** of the heat becomes electricity; the rest leaves through the fins. That is why
they are so big!

> Try it: a cheap **thermocouple thermometer** (the kind with a wire probe) works exactly like this. The voltage it
> measures tells it how hot the tip is.

### Famous RTGs

| Mission | Launched | Where | What it uses |
|---|---|---|---|
| **Voyager 1 and 2** | 1977 | beyond the planets, in interstellar space | three RTGs each, with **silicon-germanium** thermocouples; still talking to Earth almost 50 years later |
| **New Horizons** | 2006 | flew past **Pluto** (2015) | one RTG: at Pluto the sun is more than 1000 times weaker than here |
| **Curiosity** | 2011 | Gale crater, **Mars** | an MMRTG of about 110 W, through dust storms and Martian nights |
| **Perseverance** | 2020 | Jezero crater, **Mars** | the same MMRTG; its helicopter, Ingenuity, was solar |

Solar panels are great near the sun, but at Jupiter the light is 27 times weaker, and at Pluto there is almost
none. Dust storms on Mars can cover panels for weeks. An RTG does not care.

### Is it dangerous?

The particles of plutonium-238 (**alpha particles**) are stopped by **a sheet of paper**, or by a few centimetres
of air. The danger is if the fuel were **breathed in or swallowed**, so engineers make it very hard for that to
happen:

- The fuel is a **ceramic** (like a very hard pottery), so it does not turn into dust easily.
- Each pellet is wrapped in **iridium** metal, inside blocks of **graphite** built to survive a rocket explosion and
  falling back through the atmosphere.
- In 1970 the RTG of the Apollo 13 lunar module fell into the Pacific Ocean, deep in the Tonga Trench. Air and water
  checks have never found any leak.

Even so, nobody should open one: that is a job for experts with special tools. In the game, the four lead blocks
of the recipe are its **shield**.

See also: [Generators](201), [Electricity](200), [Batteries](203), [Multimeter](205).
