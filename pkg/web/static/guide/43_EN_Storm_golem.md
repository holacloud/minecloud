# Storm golem

![Storm golem](mob:storm_golem)

A hulking figure of dark slate blocks, veined with **glowing blue-white cracks**, with a **small storm cloud**
swirling over its head. It only walks the world **while it rains**, and it draws the lightning.

## Where it lives

- **Anywhere, but only in the rain.** While it rains, now and then one is **born from a lightning strike** 20–30
  blocks away from you.
- It never appears on water, leaves or cactus.
- There are at most **2 golems** at a time.
- **When the rain stops**, its cracks slowly dim and it **crumbles** into rubble and dust ("The storm golem
  crumbles as the storm passes").

## Behaviour

- **It lumbers about**, hunched, with heavy stomps. When you are close you hear a **deep rumble** from inside it.
- Its little cloud **rains on it** and flickers with tiny bolts onto its head.
- **It calls the lightning:** every 9–18 seconds it raises its arms to the sky and a bolt falls:
  - if there is one nearby, usually (60 %) onto an **iron, copper or gold block** within 12 blocks (`iron_block`, `copper_block`,
    `gold_block`). Sparks fly and the charge arcs on to its fist; the block is left untouched;
  - otherwise, **onto itself**: it soaks up the charge and **regains health**.
- Each bolt lights up the scene, and the **thunder** arrives later the further away it fell.
- It is **neutral**: it won't attack you unless you attack it.

## If you hit it

- It is furious for **15 seconds** ("The storm golem turns its fury on you").
- **It charges its fists** with crackling arcs and a rising whine. Half a second before firing **it locks its
  aim**: a faint line shows where.
- It fires an **electric discharge** along that line: **2–3 damage**. A block in the way takes the hit for you.
- If you are more than 10 blocks away, it walks towards you; it fires up to 24 blocks away.
- After the 15 seconds it calms down ("The storm golem calms down").

## How to interact

| What you do | What happens |
|---|---|
| Defeat it | **5 hits**, unless it heals first. It crumbles ("You toppled the storm golem") and leaves 2–3 ![glow dust](item:glow_dust) `glow_dust` and 1–2 ![iron](item:iron_ore) `iron_ore`. |
| Wait for the rain to stop | It crumbles by itself, but **leaves nothing**. |
| Stand on a nearby metal block | If the bolt falls there, it hits you: **2 damage**. |
| Tame, bait, cage or net | No. |
| Egg | `storm_golem_egg` |
| Command | `/mob storm_golem` (without rain, a summoned one lasts a minute). |

## Tips

- **Dodge the discharge:** when you see the line, step aside or get behind a block.
- **Keep hitting:** while it is angry it does not call the lightning, so it does not heal.
- **Keep away from your metal blocks** during a storm with golems around.
- It is a good source of `iron_ore` without mining. See [Day, night and weather](8).

## Trivia

- A real lightning bolt is about **30,000 °C**, five times hotter than the surface of the Sun.
- To tell how far away lightning struck, count the seconds until the thunder and divide by 3: that is the
  distance in kilometres. The game delays the thunder with distance too.
- Lightning rods work like the metal blocks in the game: they draw the bolt to a safe spot.
- Its voice is one of the deepest in the game: a base tone of **80 Hz**.
- Whoever topples a golem and looks closely at its **rubble** will find **carved marks** glowing on it.

*Arrived in the game on 30 October 2026.*
