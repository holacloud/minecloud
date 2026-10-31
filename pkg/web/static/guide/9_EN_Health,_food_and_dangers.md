# Health, food and dangers

## Health

- You have **20 health points**. The bar on screen changes colour: red, orange and, when little is left,
  dark red.
- Every hit flashes the screen red.
- Health **does not come back on its own**: you have to eat.

## What hurts

| Danger | Damage |
|---|---|
| Falling more than 4 blocks | grows with the height: about 2 for 5 blocks, about 11 for 10 |
| Falling into the void | deadly |
| [Spider](20) | 2 |
| [Cave monster](21) | 4 |
| [Wandering shadow](37) | 3 |
| [Scorpion](31), [snake](42) | 1 + poison |
| [Storm golem](43) | 2–3 per discharge; 2 if one of its lightning bolts lands next to you |
| [Giant mole](47) | 2 when it bursts out under your feet |
| Bee, [goat](32), [crab](39) | 1 |

**Falling into water** brakes the fall: about 2 blocks of water stop even a very long fall.

## Poison

Scorpions and snakes are venomous: you lose **1 point every 1.5 seconds**, 3 times in a row.

- `milk` cures the poison.
- `antivenom` cures it and protects you for **3 minutes**. See [Antivenom](89).

## Dying and respawning

If your health reaches zero, a screen shows the cause and a **3 second** countdown. The chat tells the
other players.

You come back with full health:

1. at your **bed**, if you have placed one (see [Bed](63));
2. otherwise, at the last safe spot where you stood.

If you break your bed, you lose that respawn point. **/spawn** takes you there at any time.

## Eating (G key)

Select the food in the hotbar and press **G**. At full health it is not used up.

| Food | Health |
|---|---|
| ![](item:flower_yellow) `flower_yellow` | +1 |
| ![](item:mushroom_red) `mushroom_red` | +3 |
| ![](item:mushroom_brown) `mushroom_brown` | +4 |
| ![](item:raw_fish) `raw_fish` | +1 |
| ![](item:cooked_fish) `cooked_fish` | +6 |
| ![](item:honey_bottle) `honey_bottle` | +5 (gives the `glass` back) |
| ![](item:cheese) `cheese` | +7 |
| ![](item:milk) `milk` | +2 and cures poison (gives the `glass` back) |
| ![](item:antivenom) `antivenom` | +1, cures poison and gives 3 min of immunity |

The red flower cannot be eaten. Mushrooms grow mostly in forests; flowers, in meadows.

## Protective gear

**Carrying it in your inventory** is enough:

| Gear | Effect |
|---|---|
| ![](item:warm_coat) `warm_coat` | −1 damage per creature attack |
| ![](item:scale_mail) `scale_mail` | −2 damage per creature attack (never below 1) |
| ![](item:feather_cape) `feather_cape` | −60 % fall damage. See [Feather cape](92) |

The recipes for all of this are in [Mob resources](2).

## Tips

- **Crouch (Shift)** at the edge of a cliff: while crouching you never walk off an edge.
- Always carry some food.
- If **vultures** start circling over you, your health is running low.
