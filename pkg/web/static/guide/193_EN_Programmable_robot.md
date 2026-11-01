# Programmable robot

![Robot](item:robot)

A small boxy robot with treads, a screen face with two blue eyes and an antenna with a light. It has no remote
control: **you teach it with a program**, snapping instruction blocks together like puzzle pieces. Then you press
**Run** and it works on its own: it digs tunnels, builds walls, raises staircases...

| | In-game name | Id |
|---|---|---|
| ![](item:robot) | Robot | `robot` |

## How to get it

| Recipe (C key) | Ingredients |
|---|---|
| 1 `robot` (*Build Robot*) | 3 `iron_ore` + 1 `copper_block` + 1 `glass` + 1 `element_si` |

Iron is in [Ores](53), copper in [Fine stones and metals](59) and glass in [Sand, cactus and glass](51). The
**silicon** block (`element_si`) is its brain, just like real chips: it is synthesised from stone and coal (see
[Element blocks](60) and [Silicon](152)).

## Setting it down and picking it up

- Hold the robot and **right click the top of a block**: it stays there, facing the way you face.
- You can have **at most 3 robots** at a time.
- **Hit it** (left click) to pick it up: it goes back to your inventory as an item, with everything it carried.
  Its program is not lost: the next robot you set down remembers it.
- If you dig away the ground under a robot that is not running, it floats down until it touches the ground.

## The programming panel

**Right click the robot** to open its panel. It has four parts:

1. **The palette** (left): the instruction blocks, by colour.
   - Blue: moving (*Move forward*, *Turn left*...).
   - Orange: digging (*Dig ahead*, *Dig up*, *Dig down*).
   - Green: building (*Place ahead*, *Place up*, *Place down*).
   - Yellow: loops and choices (*Repeat*, *While*, *If*).
   - Purple: *Wait* and *Say* (says something in a speech bubble).
2. **The program** (centre): the list of instructions, from top to bottom.
   - **Click** a palette block to add it where the **yellow dashed outline** is. When you add a loop, the
     outline jumps inside it; click an empty part of the program to bring it back out.
   - Or **drag** it with the mouse to the exact spot. Blocks in the program move by dragging their name (⠿).
   - **✕** deletes a block; you can also drag it back to the palette. **Clear** deletes everything.
   - Numbers, texts and blocks are chosen in the boxes of each instruction.
3. **The buttons**:
   - **▶ Run**: runs the program. The panel closes so you can **watch the robot work**; a small card in the
     top-right corner shows what it is doing. Right-click the robot to open the panel again (the instruction it is
     doing **lights up**).
   - **⏭ Step**: does **one single** instruction and stops. Great for finding bugs. The panel docks to the right
     so you can see the robot. **Resume** goes on.
   - **■ Stop**: stops it. **Speed** picks how fast: 2, 3 or 4 actions per second.
4. **Its inventory** (bottom): **9 slots** of up to 64. Whatever it digs goes there.
   - Click a slot to take that stack, or **Take all** to take everything.
   - To make it build, **give it blocks**: pick one of yours, the amount, and press **Give**.

Escape, **Close** or a click outside the panel close it. The robot keeps working with the panel closed.

## The antenna light

| Colour | Meaning |
|---|---|
| Blue | Waiting for orders |
| Blinking green | Working |
| Amber | Paused (with *Step*) |
| Red | Something went wrong: read its bubble or the chat |

## What it never does

- **It does not dig bedrock** or anything unbreakable: "I can't dig Bedrock".
- **It does not go through you** nor place blocks on you: "You are in my way!".
- **It does not fly high**: it floats at most **3 blocks** above the ground or the water. When it stops, it lands
  (or floats on the water).
- **It stops** if you go more than **64 blocks** away, or if it needs a part of the world that is not loaded.
- When its inventory is full it digs no more: "My inventory is full!".

When something fails, the robot **stops**, says why in a bubble and in the chat, and the instruction that failed
turns red in the panel.

## Good to know

- The blocks it digs or places **are seen by every player**, as if you had done it. But the robot is yours:
  **other players do not see it**, and it is kept in your browser with its program and its inventory.
- Hard blocks take it a little longer to dig. It gets the same drops as if you mined them.
- It does not place signs, beds, ladders, sound blocks or water.
- A program has at most **200 blocks**, and loops go inside each other up to **6 levels** deep.

## Trivia

- The word **robot** was invented by the Czech writer Karel Čapek in 1920, for a play. It comes from *robota*,
  "hard work".
- Block-based programming languages for children, such as Scratch (2007), use the same idea as this panel: pieces
  that only fit together in ways that make sense.
- The rovers exploring Mars also get **a whole program** every day, because orders take several minutes to get
  there.

See also: [Programming the robot](194), [Coding challenges](195), [Crafting](11).
