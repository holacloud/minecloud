# The left hand

![Torch](item:torch)

The right hand does the work: it mines, builds and strikes. The **left** carries what helps just by being carried: a light, an instrument, a second tool, a second sword or a [shield](252). So you explore a cave with the pickaxe in one hand and the torch in the other.

## How to use it

- **X** moves the item in your right hand to the left. If the left already held another, they **swap**.
- **X** with the same item in both hands puts the left one back in the inventory. With an empty right hand, the left one goes to the right.
- **Shift + X** puts whatever the left hand holds back in the inventory.
- In the **inventory** (**E**), items that can be carried have an **L** button. The slot at the top shows what you carry: press it to put it away.
- On a **phone**, the **L** button at the top does the same as **X**, and **Left hand** is in the **☰** menu too. The inventory's **L** button works the same.

While you play, a slot to the left of the hotbar reminds you what you carry.

## What can be carried

| | Item | What it does in the left hand |
|---|---|---|
| ![](item:torch) | `torch` | Light level 14: it reaches about 9 blocks. Its smoke also calms the [bees](35). |
| ![](item:lantern) | `lantern` | Light level 13. |
| ![](item:candle) | `candle` | Light level 9: about 6 blocks. |
| ![](item:firefly_jar) | `firefly_jar` | Light level 7: 4 or 5 blocks. |
| ![](item:multimeter) | `multimeter` | Reads the network of the electric block you **look at**, without clicking. |
| ![](item:thermometer) | `thermometer` | Its panel of readings. |
| ![](item:barometer) | `barometer` | Its panel of readings. |
| ![](item:anemometer) | `anemometer` | Its panel of readings. |
| ![](item:helium_balloon) | `helium_balloon` | You fall slowly and take no damage. |
| ![](item:shield) | `shield` | Halves the blows of creatures **in front of you**. See [Shield](252). |
| ![](item:iron_pickaxe) | Pickaxes, shovels and axes | With another of the same type in the right hand, you mine at **×1.5**. Alone, nothing. |
| ![](item:iron_sword) | Swords | With another in the right hand, adds **50 %** of its damage. Alone, nothing. |

The tools and swords that can be held: `wood_pickaxe` `stone_pickaxe` `iron_pickaxe` `gold_pickaxe` `steel_pickaxe` `wood_shovel` `stone_shovel` `iron_shovel` `gold_shovel` `steel_shovel` `wood_axe` `stone_axe` `iron_axe` `gold_axe` `steel_axe` `wood_sword` `stone_sword` `iron_sword` `gold_sword` `steel_sword`.

The lights also shine **in the right hand**: a lantern, a candle or a jar no longer has to be set down first. With two lights, the stronger one counts. With the same instrument in both hands you see **one panel**; with two different ones, one panel with both readings.

The rest stays in the right hand because it needs a **right click**: a telescope has to be raised, a measuring tape needs your clicks, a hoe (`wood_hoe`, `stone_hoe`, `iron_hoe`, `gold_hoe`) tills and shears (`iron_shears`) shear. Nothing uses the right click from the left hand: what an instrument gives there is its reading. To write it in the chat, hold it in the right hand.

## Two tools

A pickaxe, shovel or axe in each hand, **of the same type**: you mine at **×1.5**. The arms strike by turns.

- **It only counts if the one in the right hand is the right tool for that block.** Two pickaxes on dirt mine like one.
- **With different materials, the worse one rules:** the speed is the worse tool's × 1.5, in whichever hand it is.
- **Careful:** so with a much worse tool, the good one goes **slower** than on its own.

| Speed on its block | Alone | + wood | + stone | + iron | + gold | + steel |
|---|---|---|---|---|---|---|
| Wood | 1.45 | 2.18 | 2.18 | 2.18 | 2.18 | 2.18 |
| Stone | 1.9 | 2.18 | 2.85 | 2.85 | 2.85 | 2.85 |
| Iron | 2.6 | **2.18** | 2.85 | 3.9 | 3.9 | 3.9 |
| Gold | 3.2 | **2.18** | **2.85** | 3.9 | 4.8 | 4.8 |
| Steel | 3.6 | **2.18** | **2.85** | 3.9 | 4.8 | 5.4 |

In bold, the pairs slower than the row's tool alone. The left hand alone does not mine: if you send your only pickaxe to the left, you dig with an empty hand.

## Two swords

You do not hit faster: you hit **harder**. A strike is worth the right-hand sword plus **50 %** of the left one, and each strike is one arm's.

| Right / left | Nothing | Wood | Stone | Iron | Gold | Steel |
|---|---|---|---|---|---|---|
| Wood | 5 | 7.5 | 8 | 8.5 | 9 | 9.5 |
| Stone | 6 | 8.5 | 9 | 9.5 | 10 | 10.5 |
| Iron | 7 | 9.5 | 10 | 10.5 | 11 | 11.5 |
| Gold | 8 | 10.5 | 11 | 11.5 | 12 | 12.5 |
| Steel | 9 | 11.5 | 12 | 12.5 | 13 | 13.5 |

A sword in the left **with none in the right** adds nothing: the strike is that of an empty hand, or of whatever you hold, 4.

## A real unit

What you carry in the left hand is **one unit taken out of the inventory**, which is why the count goes down by one.

- **It is not spent:** it cannot be placed, dropped with **Q**, used in a recipe or put in a chest. For that, put it back first.
- **When you die** it is not lost, like the rest of the inventory.
- **It is saved** with the inventory: when you come back you still carry it.
- If you have one torch, or one pickaxe, and move it to the left, the right hand ends up empty: it cannot be in two places. For two pickaxes in your hands you need **two** pickaxes.
- Tools, swords and the shield **do not wear out**: nothing here loses durability.

## The light

- It reaches the terrain at once and follows the player. It fades with distance.
- It works in **classic**, **RTX** and **Ultra**: the same terrain shader works it out, and each mode gives it its own tone.
- A light in the hand also keeps [shadows](37) away, like the torch always did. Tools, swords and the shield give no light and read nothing.
- **A [microscope](238)** is lit by a light in either hand if you are **within 3 blocks**.

## What others see

Other players see what you carry on your avatar's **left arm**, and you see it in [mirrors](232) and in third person. Your light also reaches **the terrain** around you: each player sees their own and those of the **two** nearest players, within 40 blocks. Mobs and other avatars are only lit by your own light.
