# How mobs think

A mob has no real brain, but it does have a handful of simple rules that, put together, look like life. This
page tells you what they are.

## Ways of moving

Each species has a **movement mode**, which decides almost everything it does. There are **20**:

| Mode | Who | What it does |
|---|---|---|
| ground | sheep, pig, dog, cat, giraffe, spider… | Wanders, grazes and, if hostile, chases |
| swim | fish | Schools that move together without bumping |
| hop | frog | Jumps instead of walking and swims at the surface |
| amphibious | turtle | Walks the beach and dives |
| dart | lizard | Basks, then runs in bursts |
| climb | goat | Leaps up 2-block ledges and seeks high ground |
| soar | eagle | Circles high up and perches on peaks |
| swarm | bee | A colony around its hive |
| glow | firefly | A cloud of blinking lights |
| stalk | wandering shadow | Glides after you and dissolves in light |
| flutter | bat | Hangs by day, flits about at night |
| scuttle | crab | Runs sideways and digs in |
| scavenge | vulture | Rides the thermals and comes to the fallen |
| lure | wisp | Leads you towards danger |
| slither | snake | Waits buried and strikes |
| storm | storm golem | Walks in the rain and calls the lightning |
| burrow | rabbit | Lives around its hole |
| prowl | fox | Hunts and steals |
| nightwatch | owl | Sleeps by day and hunts by night |
| tunnel | giant mole | Travels underground and feels footsteps |

## The walking mobs

The simplest mobs (the ground ones) follow these rules, in this order:

1. **If it is hostile and you are close, it chases you.** The usual distance is 16 blocks; the cave monster
   sees you from 10 and keeps 4 blocks away before charging. **Nocturnal** ones, like the scorpion, only react
   within 3.5 blocks by day.
2. **If it has a goal, it heads for it:** a bait, a mate to breed with or its owner. The first goal that turns
   up wins. See [Baits and traps](4) and [Taming and breeding](3).
3. **Otherwise it wanders:** every 1 to 4 seconds it turns a little at random. Some stop to graze, and the camel
   sometimes lies down for a good while.

It can step up **one block** at once, but it will not walk off a drop of more than 3. If it bumps into
something, it turns once and keeps that heading for a while (so it does not spin forever in a corner).

## The invisible leash

Every mob remembers the place where it appeared: its **home**. While wandering, it never goes further than
**18 blocks** from it; if it does, it turns back home. The leash comes off while it chases, heads for a goal or
follows you.

## How they appear

Wild animals appear **by chunks** (pieces of 16 × 16 blocks):

- Every second the game looks at the chunks around you, up to **3 chunks** away.
- Each chunk is populated **only once** while you stay near and, except when you enter the world, never your
  own chunk or the ones touching it, so nothing pops up right under your nose.
- Each chunk has a **30 %** chance of getting a group. The species is picked from its biome's table. The roll
  depends on the chunk's position, so **the same spot tends to bring the same species**.
- Each species has a **limit** on how many can be alive at once, and in total there are never more than **64**
  mobs.
- Fish, frogs, turtles, bees, fireflies, bats and the newer species also have their own spawning rules.
  Shadows and wisps appear at night, and golems in the rain.

| Biome | Group table (most frequent first) |
|---|---|
| Plains | sheep, pig, horse, duck, dog, cat, eagle, fox, mole |
| Forest | pig, macaw, cat, fox, dog, spider, mole |
| Desert | camel, lizard, scorpion, giraffe, duck |
| Rocky | goat, eagle, sheep, lizard, scorpion, spider, cave monster |

## How they vanish

A wild animal more than **80 blocks** away from you vanishes, and its chunk can be populated again when you
come back. **Tamed** animals never vanish.

## Mobs telling each other

When something important happens to a mob (it appears, it is struck, it is defeated, it leaves), the game
**announces** it. Others listen: the [vultures](40) come when someone is defeated, and the [bestiary](5) notes
what you have seen. See also [The food chain](100).
