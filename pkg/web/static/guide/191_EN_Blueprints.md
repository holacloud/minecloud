# Blueprints

![Written blueprint](item:written_blueprint)

Built a lovely house and want another one just like it across the river? Or your friend raised a tower and you want
to copy it? With **blueprints** you measure a building, save it and build it again block by block, following a
translucent **ghost**.

| | In-game name | Id |
|---|---|---|
| ![](item:measuring_tape) | Measuring Tape | `measuring_tape` |
| ![](item:blueprint) | Blueprint | `blueprint` |
| ![](item:written_blueprint) | Written Blueprint | `written_blueprint` |

## How to get them

| Recipe (C key) | Ingredients |
|---|---|
| 1 `measuring_tape` (*Craft Measuring Tape*) | 1 `iron_ore` + 1 `planks` |
| 2 `blueprint` (*Make Blueprints*) | 2 `planks` + 1 `feather` |

The written blueprint is not crafted: an empty blueprint becomes one when you draw on it. Ducks and other birds drop
feathers: see [Feather](75).

## 1. Measure

Take the [measuring tape](192) and **right click** a block: that is **corner A**. Then right click the **opposite**
corner (B). A yellow box appears around it with its size, for example **7 × 4 × 9** (width × height × depth).

- The box can be at most **16 blocks per side** and hold at most **2048 blocks**. If it is bigger, the outline turns
  **red**.
- Air, **water**, wheat crops and bedrock are not recorded.

## 2. Draw the plan

With the box measured, take an **empty blueprint** and **right click**. The blueprint becomes a **written
blueprint** and the building joins your **blueprint library** as the active plan. Every block and its position is
saved; ladders remember which way they face, signs their text and sound blocks their note.

## 3. The library (L key)

Press **L** to open the library. There you can:

- **Rename** each plan (type in its box).
- See its **size**, how many blocks it has and of how many kinds.
- Pick the **active** plan (*Use* button): the one the written blueprint projects.
- **Delete** a plan.
- **Export** and **import** codes to share (see below).
- See what the building you are raising still **needs**, and how many of those blocks you carry (in red when you are
  short).

The library is kept in your browser. A single written blueprint is enough to project any plan in your library.

## 4. Project

Hold the **written blueprint**. A translucent **ghost** of the active plan follows your crosshair, standing on the
block you aim at.

- **T** turns it a quarter turn (90°).
- **Right click** **anchors** it there.
- With the written blueprint in hand, another **right click** **lifts** it so you can move it.

## 5. Build

The anchored ghost shows **only the missing blocks**, each in its block's colour. A counter on the screen says how
far you are: **123 / 400 blocks**.

- Place each block **as usual**: when the right block fills its cell, that bit of ghost disappears.
- **Shortcut:** with the right block in hand, right click **on the ghost cell** and the block goes exactly there. It
  uses up the block from your inventory, like any placement.
- A cell taken by **another block** shows in **red**: break it to put the right one.
- When the last block goes in, a fanfare plays and the ghost is gone.

Blueprints **never build by themselves**: every block comes out of your inventory.

## Sharing and building together

Only **you** see your ghost: each player has their own. To build together, share the plan:

1. In the library, press **Export** on a plan: its **code** appears, a text starting with `MCBP1:`. Press **Copy
   code**.
2. Send it to your friend any way you like (a message, an email, a document). The game chat only takes 140
   characters, and almost every code is longer.
3. Your friend pastes it into the library and presses **Import code**. Copying it uses up **one empty blueprint** and
   gives a written blueprint.
4. Each of you anchors the ghost in the **same place** (same block and same turn) and off you go: the blocks one
   player places are seen by everyone and vanish from everyone's ghost.

## Good to know

- Blocks are placed the normal way, so **every** player sees them and they stay in the world.
- If a plan uses blocks your world does not know, those kinds of block are left out when it is imported.
- To measure a whole building, come close: if part of the box is too far away (not loaded), the game asks you to come
  closer.
- The library keeps up to 60 plans.

## Trivia

- Real blue plans are called **cyanotypes**: sunlight dyed the paper blue and the lines stayed white. That is why
  they are called *blueprints*.
- Architects draw houses **to scale**: 1 cm on the plan can be 1 m of house. MineCloud's scale is simple: one block
  is one metre.

See also: [Measuring tape](192), [Mining and building](10), [Playing together](13), [Crafting](11).
