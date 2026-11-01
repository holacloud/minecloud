# Programming the robot

![Robot](item:robot)

A **program** is a list of orders that the [robot](193) follows **in order, from top to bottom**, never skipping
one. The robot does not think for itself: it does exactly what the program says, no more and no less! When
something goes wrong, the mistake is almost always in the program. Finding and fixing it is called **debugging**.

Here is what each instruction does.

## Moving (blue)

| Block | What it does |
|---|---|
| `Move forward` | Moves **one** block the way it faces. |
| `Move back` | Moves one block back, without turning. |
| `Turn left` | Turns a quarter turn to the left. |
| `Turn right` | Turns a quarter turn to the right. |
| `Move up` | Goes up one block. |
| `Move down` | Goes down one block. |

- It only moves into **empty** places (air, tall grass, flowers or water). If there is a block, it stops and says
  so: "There is Stone in my way".
- While it works **it does not fall**: it can float, but at most **3 blocks** above the ground or the water.
  When it stands right on the ground, it can take **one step** out over a gap: that is how it builds bridges.

## Digging (orange)

| Block | What it does |
|---|---|
| `Dig ahead` | Digs the block in front. |
| `Dig up` | Digs the block above. |
| `Dig down` | Digs the block below. |

- What it digs goes into **its inventory**. If there is nothing there, nothing happens and it goes on with the next
  order.
- It cannot dig bedrock: it stops and says "I can't dig Bedrock: it is unbreakable".

## Building (green)

| Block | What it does |
|---|---|
| `Place ahead` | Places a block in front. |
| `Place up` | Places a block above. |
| `Place down` | Places a block below. |

- The blocks come from **its inventory**: give them to it first with **Give**.
- Choose **which one** in the box. With *any block I carry* it uses the first one it has.
- If the spot already holds a block, it does nothing. Tall grass, flowers and water do get covered.

## Loops and choices (yellow)

These blocks have **a slot inside** where other instructions go.

### Repeat

`Repeat 4 times` does what is inside it **4 times in a row**. Instead of writing `Move forward` four times:

- `Repeat 4 times`
  - `Move forward`

And loops can go inside loops! This robot walks around a square:

- `Repeat 4 times`
  - `Repeat 3 times`
    - `Move forward`
  - `Turn right`

### If ... else

`If` **asks a question** and picks a path. When the answer is **yes** it does the top part; when it is **no**, the
*else* part. Either part can stay empty.

- `If` *block ahead is* `Coal Ore`
  - `Say` "Coal!"
  - `Dig ahead`
- else
  - `Turn right`

### While

`While` is a loop that **asks before every round**: as long as the answer is yes, it repeats. When it is no, it
goes on with what comes next. This robot moves until it bumps into something:

- `While` **not** *block ahead is solid*
  - `Move forward`

With *always* the loop never ends, until you press **Stop**.

### The questions

| Question | It is "yes" when... |
|---|---|
| *block ahead / above / below is air* | there is nothing in front / above / below |
| *block ahead / above / below is solid* | there is a solid block (not tall grass, flowers or water) |
| *block ahead / above / below is* `X` | there is exactly that block (you choose it) |
| *my inventory is full* | its 9 slots are taken (a new kind of block would not fit) |
| *my inventory is empty* | it carries nothing |
| *I have* `X` | it carries at least one block of that kind |
| *always* | always |

Tick **not** to turn the answer around: *not block ahead is solid* means "there is **no** solid block in front".

## More (purple)

| Block | What it does |
|---|---|
| `Wait` | Waits from 0.5 to 10 seconds. |
| `Say` | Says a text (up to 40 letters) in a bubble over its head. |

## Examples

### A 3 × 3 tunnel

Set it in front of a hillside with plenty of free inventory. It digs 5 blocks deep; change the 5 for more.

- `Repeat 5 times`
  - `Dig ahead`
  - `Move forward`
  - `Repeat 2 times`
    - `Turn left`
    - `Dig ahead`
    - `Turn right`
    - `Turn right`
    - `Dig ahead`
    - `Turn left`
    - `Dig up`
    - `Move up`
  - `Turn left`
  - `Dig ahead`
  - `Turn right`
  - `Turn right`
  - `Dig ahead`
  - `Turn left`
  - `Move down`
  - `Move down`

How it works: on each step it moves along the bottom row, digs both sides, goes up and digs both sides again, up
to the top row. Then it goes back down for the next step.

### A wall

Give it at least 15 blocks. It builds a wall 5 long and 3 high in front of it, moving sideways.

- `Repeat 5 times`
  - `Repeat 3 times`
    - `Place ahead`
    - `Move up`
  - `Repeat 3 times`
    - `Move down`
  - `Turn right`
  - `Move forward`
  - `Turn left`

### A staircase

Give it 5 blocks. Each step is one block higher and one block further.

- `Repeat 5 times`
  - `Place ahead`
  - `Move up`
  - `Move forward`

### A bridge

Set it on the shore, facing the water or the ravine, and give it blocks. It fills the gaps below as it goes.

- `Repeat 10 times`
  - `If` *block below is solid*
    - (empty)
  - else
    - `Place down`
  - `Move forward`

Did you notice? The `If` with an empty top part is the same as `If` **not** *block below is solid*. Try changing
it!

## Coding tips

- **Start small**: try 2 or 3 instructions first, and add more once they work.
- Use **Step** to watch the program one step at a time. The current instruction lights up.
- When the robot stops with an error, the instruction that failed turns **red**.
- Try **being the robot**: read the program out loud and move yourself as it says.

See also: [Programmable robot](193), [Coding challenges](195).
