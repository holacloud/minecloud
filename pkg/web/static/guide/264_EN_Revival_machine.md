# Revival machine

![Revival machine](item:revival_machine)

A glass chamber full of liquid, on a steel base with its copper coil. You put in the **fossil** of an extinct animal, give it **power** and a **signal**, wait... and the animal **comes back to life** next to it, for every player. Right click it to open it.

| | Name in the game | Id |
|---|---|---|
| ![](item:revival_machine) | Revival Machine | `revival_machine` (while it works: `revival_machine:on`) |

## The three slots

It only takes fossils: those of the [rock](262) and those of the [amber](263).

| Slot | What goes in |
|---|---|
| **Fossil or skull** | the fossil of a small or middle-sized animal, or the **skull** of a skeleton |
| **Spine** | the **spine** of a skeleton |
| **Tail** | the **tail** of a skeleton |

- **One fossil** is enough for nearly every animal. Those found as a skeleton need their **three pieces**, all three of the **same animal**.
- Click a fossil in your list to put it in: it goes to its own slot. Click a slot to take out what it holds.
- A slot holds several fossils of the same kind. The machine uses up **one for each animal**.
- The panel says **???** instead of the animal's name until you have seen one alive ([Extinct animals](261)).

## What it needs to start

When all of this is true at once, it **starts by itself**:

1. **The complete fossils** of one animal.
2. **A signal on top.** The easy way: put a [lever](207) **on the machine** and switch it on.
3. **Water**, if it is a sea animal (see further down).
4. Not **too many animals** nearby. With **12** or more within **32** blocks, it does not start. The animals the server keeps are counted: tamed ones, their babies and revived ones.

The panel tells you in words what is missing. Once it has started it **no longer needs the signal**: a push button is enough. To go on it only needs **power**.

## The power it needs

It draws **100 W**, and only while it works: idle, it asks nothing of the network.

- Power comes in **through its sides or from below**. Put a [generator](201) against it or bring it a [copper wire](202).
- **No power comes in from above:** the top face is for the signal only.
- Without power it **waits**, and keeps what it has done. When power comes back, it goes on.
- While it is really working it **glows** (light level 9) and everyone sees it.

| What feeds it | Does it run? |
|---|---|
| ![](item:hand_crank) 1 hand crank, 100 W while you turn it | **yes**: do not stop turning |
| ![](item:water_wheel) 1 water wheel with three wet sides, 105 W | **yes** |
| ![](item:rtg) 1 [radioisotope generator](220), 80 W | **no** |
| ![](item:rtg) 2 radioisotope generators, 160 W | **yes**, day and night |
| ![](item:solar_panel) 3 solar panels, 120 W at noon | only around noon |
| ![](item:battery_block) 1 full [battery](203), alone | for **30 s**: enough for a common fossil, not for a rare one |

**All or nothing:** if the network cannot feed everything wired to it, everything goes off, as with any [consumer](204). So give it a network of its own.

## The signal, in detail

Its **top** face is its signal input, and nothing else. There is a signal when the block right above it is an electric block that conducts downwards, and its network carries a signal ([Switches](207)).

| On top of the machine | Is there a signal? |
|---|---|
| a [lever](207) switched on | **yes**, until you switch it off |
| a push button just pressed | **yes**, for 1.5 s: plenty to start it |
| a pressure plate with someone on it, or a [sensor](208) that is on | **yes** |
| a [logic gate](209) that is on | **yes** |
| a wire coming from a lever, a sensor or a gate that is on | **yes** |
| a wire or a generator with power | **yes**, always: it is a signal, **not** power |
| nothing, or a block that is not electric | **no** |

- It starts **as soon as** everything is true. Leave the lever on, and it starts when the fossil goes in. With several fossils of the same kind, it makes one animal after another.
- What you put on top **never joins** the network that feeds it. You can bring the signal from far away along a wire without mixing it with the power.

## Water for sea animals

A sea animal only comes back if the machine **touches water**: a lake, the sea or a tank you build yourself. The blocks of water **joined** to one another are counted, starting from those that touch a face of the machine.

| Sea animal | Joined blocks of water |
|---|---|
| the trilobite | **4** |
| the ammonite | **6** |
| a middle-sized one, 1 block long | **16** |
| a big one, 3 or 4 blocks long | **60** |
| the plesiosaur | **120** |
| the biggest of all | **300** |

- Only water within **16** blocks of the machine to each side counts.
- The panel tells you how much there is: "Needs water: 12 of 60 joined blocks, touching the machine".
- A tank of 5 × 5 blocks and 3 deep is 75 blocks: plenty for a big animal.
- The animal is born **in the water**, at the place near the machine with the most water around it.

## How long it takes

| Fossil | Time, with power |
|---|---|
| common | **20 s** |
| rare | **45 s** |
| legendary | **120 s** |

- Time only runs **with power**.
- **Take a fossil out while it works and it stops**, and what it had done is lost. The fossil is yours again.
- When it finishes, **the fossils are used up** and the animal appears.

## Where the animal appears

- A land animal, in a **free space next to the machine**, 3 blocks away at most, from which it can walk off. Never inside a block. Only if there is nowhere else, on top of the machine.
- A sea animal, in its water, 4 blocks away at most.
- If there is **no room**, the machine waits with its work done and says so. Clear a space and the animal comes out.
- It never appears in another player's [plot](260). If the machine is in your plot, it does not appear outside it either.
- The animal **lives around that place**. It is nobody's. The server keeps it, so it is still there when you come back.
- Those nearby hear the machine and see sparks fly. If you are within 16 blocks, the animal is **discovered** in your [Bestiary](5).

## How to build it

| Recipe (C key) | Ingredients |
|---|---|
| 1 `revival_machine` | 4 `iron_block` + 4 `glass` + 6 `copper_wire` + 1 `electric_motor` + 1 `water_bucket` |

The water [bucket](111) stays inside. The motor is made in [Consumers](204) and the wire in [Wires and networks](202).

## Your first circuit

1. Place the **machine** on the ground, with free room around it.
2. Put a ![](item:hand_crank) **hand crank** against one side.
3. Put a ![](item:lever) **lever** on top of the machine.
4. Open the machine and put a fossil in.
5. Switch the lever on: the machine starts.
6. Turn the crank, with a right click, again and again until it finishes. If you stop, the machine waits for you.

When you tire of the crank, swap it for two [radioisotope generators](220) or for a water wheel with three sides in the water.

**Ideas for later:**

- **Start it from far away:** a wire from the top face to a push button.
- **Let it start only at night:** an [AND gate](209) with a lever and a [daylight sensor](208) in night mode, and its output to the top face.
- There is more in [Example circuits](211).

## Science: can an extinct animal be brought back?

In the game, yes. In real life it is very hard, and nearly always impossible.

- **A fossil is stone.** A fossil bone is no longer bone: minerals have taken its place ([Fossils](262)). No cell is left inside.
- **You need the DNA.** It is the instructions for making the animal, and it **breaks down with time**. The oldest DNA that has been read is about **2 million years** old. The dinosaurs died out **66 million** years ago: not one letter is left of a tyrannosaur.
- **The recent ones are luckier.** The DNA of mammoths frozen thousands of years ago has been read. So has that of the dodo, which died out only about 350 years ago.
- **Having the DNA is not enough.** You need a living cell to put it in and a mother to carry the baby. For a mammoth, scientists think of the Asian elephant, its closest living relative. What would be born is an elephant with mammoth features, not a real mammoth.
- **It nearly worked once.** In 2003 a baby bucardo was born: a wild goat of the Pyrenees that had died out three years before. It was cloned from cells that had been kept. It lived only a few minutes.
- **And even if it worked**, an animal needs its world: its food, its climate and others like it to learn from. That is why many scientists would rather look after those still alive.

> **And the mosquito in amber?** A great idea for a film, but inside [amber](263) DNA breaks down too. Here we imagine it.

See also: [Fossils](262), [Amber](263), [Extinct animals](261), [Electricity](200), [Switches](207), [Eel tank](214).
