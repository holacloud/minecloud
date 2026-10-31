# Mob resources

Animals and creatures give resources in four ways: by **harvesting** them with right click, by **striking**
them, as **loot when defeated** and, for birds, by **shedding feathers** on their own. Every resource is good for
something: it goes into at least one recipe, it can be eaten, or it protects you.

## Harvesting (right click)

| What | Held item | On | Result | Wait |
|---|---|---|---|---|
| Shear | `iron_shears` | sheep | 1–3 `white_wool`; the sheep is shorn and its wool grows back | 150 s |
| Trim fur | `iron_shears` | goat, camel, horse, dog, cat, fox, rabbit, mole | 1 `fur` | 120 s per animal |
| Milk | `glass` (used up) | goat, camel | 1 `milk` | 60 s per animal |
| Collect honey | anything | beehive | 1–2 `honeycomb` | 120 s per hive |

**The beehive:** if you take the honey without a `torch` in your hand, the colony gets angry and chases you.
With a torch in your hand the smoke calms the bees, and it also soothes them if they were already angry.

## Striking without killing

Some animals drop something when struck, with some chance and a wait per animal:

| Animal | Drops | Chance | Wait |
|---|---|---|---|
| Duck, macaw, owl, vulture | `feather` | 40 % | 8 s |
| Eagle | `feather` | 50 % | 8 s |
| Lizard | `scale` | 35 % | 10 s |
| Turtle | `shell` | 15 % | 60 s |
| Fireflies | `glow_dust` | 30 % | 20 s |
| Fish school | catches a fish: `raw_fish` | 20 % | — |

Nearby ducks, macaws, owls and vultures also drop a feather now and then on their own.

## Loot when defeated

There is only loot when the player defeats the mob. Prey caught by predators (fox, owl, eagle) leaves nothing.
A percentage is the chance of getting that item.

| Mob | Loot |
|---|---|
| Spider | `venom_sac` (50 %), `white_wool` (30 %) |
| Cave monster | 1–3 `leather`, `glow_dust` (50 %) |
| Scorpion | `venom_sac`, `shell` (25 %) |
| Snake | 1–2 `scale`, `venom_sac` (60 %) |
| Crab | 1–2 `shell` |
| Fox | 1–2 `fur` |
| Owl | 1–3 `feather` |
| Giant mole | 1–2 `fur` |
| Storm golem | 2–3 `glow_dust`, 1–2 `iron_ore` |
| Wandering shadow | 1–2 `shadow_essence` |
| Wisp | `glow_dust` when caught; it drops it itself |

**The wandering shadow:** if you drive it off with light (a torch) instead of banishing it with blows, there is a
50 % chance it leaves 1 `shadow_essence`, as long as you are within 16 blocks.

## Recipes

| Result | Ingredients |
|---|---|
| `cooked_fish` | `raw_fish` + `coal_ore` |
| `honey_bottle` | `honeycomb` + `glass` |
| `cheese` | 2 `milk` |
| `antivenom` | `venom_sac` + `milk` |
| `leather` (tanning) | 2 `fur` + `wood` |
| `warm_coat` | 3 `leather` + 2 `fur` |
| `scale_mail` | 6 `scale` + 2 `leather` |
| `feather_cape` | 6 `feather` + 2 `white_wool` |
| `bed` (feather bed) | 4 `feather` + 2 `white_wool` + 3 `planks` |
| 4 `torch` | `glow_dust` + `wood` |
| 4 `limestone` | `shell` + `sand` |
| 2 `obsidian` | `shadow_essence` + 2 `stone` |

## Food and remedies (G key)

| Item | Health | Effect |
|---|---|---|
| `raw_fish` | +1 | — |
| `cooked_fish` | +6 | — |
| `honey_bottle` | +5 | gives the `glass` back |
| `cheese` | +7 | — |
| `milk` | +2 | cures poison; gives the `glass` back |
| `antivenom` | +1 | cures poison and gives **3 minutes of immunity** to it; gives the `glass` back |

## Passive gear

Carrying it in your inventory is enough; there is nothing to equip. Pressing G with a piece of gear explains in
the chat what it does.

| Gear | Effect |
|---|---|
| `warm_coat` | −1 damage from each creature attack |
| `scale_mail` | −2 damage from each creature attack, never below 1 |
| `feather_cape` | −60 % fall damage |

If you carry the coat and the mail together, only the better one counts.

## Tips

- **Against poison** (snakes, scorpions): carry `milk` or, better still, `antivenom` before heading into the
  desert or the rocks.
- **Feathers and wool** for the `feather_cape`: feathers come without harming anyone, by striking ducks or waiting
  for birds to shed them; wool, by shearing sheep.
- **Torches without coal:** the `glow_dust` of fireflies or of a caught wisp makes 4 torches with a single `wood`.
