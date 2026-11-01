# Coding challenges

![Robot](item:robot)

Eight challenges for your [robot](193), from easiest to hardest. Each one has a **hint**. The **solutions** are at
the end of the page, but... try first! There are many good ways to solve each challenge: if your program works, it
is right, even if it does not look like the solution.

If you forget what an instruction does, see [Programming the robot](194).

## The challenges

### 1. Hello, world! ⭐

Make the robot greet you with a bubble saying "Hello, world!", wait one second and then turn **all the way
round** on the spot.

> Hint: a full turn is four quarter turns. Is there a block that repeats things?

### 2. The square dance ⭐

Make the robot walk around the edge of a square 3 blocks long on each side and **end exactly where it started**,
facing the same way.

> Hint: a square has 4 equal sides. Each side is "move forward 3" and then turn.

### 3. The tower ⭐

Make the robot build a tower of 5 blocks **under itself** and stay on top. Give it 5 blocks.

> Hint: go up one and place a block where you were before.

### 4. Treasure hunter ⭐⭐

Put the robot underground, facing the stone. Make it dig in a straight line **until it finds coal** in front of it,
and then say "Treasure!".

> Hint: you do not know how many blocks there are before the coal, so *Repeat* will not do. Which loop asks before
> every round?

### 5. A bridge that knows when to stop ⭐⭐

Set it on the bank of a river, facing the water, and give it blocks. Make it build a bridge **and stop on its
own** when it reaches the other bank.

> Hint: first take one step out. Then, **while** there is no solid ground below, place a block and move forward.

### 6. Spiral staircase ⭐⭐

Make it build a staircase that goes up turning: 3 steps, a turn, 3 steps, another turn... until it has done 4
sides. Give it 12 blocks.

> Hint: look at the staircase in [Programming the robot](194) and put it inside another loop.

### 7. The lawnmower ⭐⭐⭐

Make it **flatten** a 5 × 5 area: remove everything at its height and one block above (tall grass, flowers,
stones, bushes...). It should go over the area in a zigzag, like a lawnmower.

> Hint: a row is "dig ahead, move forward and dig up", 4 times. At the end of a row turn right, move to the next
> row and turn right again. At the end of the next one, the same but to the left.

### 8. The miner who comes home ⭐⭐⭐

Make it dig a straight tunnel **until its inventory is full**, then turn around, come out of the tunnel and say
"Coming back loaded!".

> Hint: you need two *While* loops, one after the other. To test it quickly, give it 8 stacks of 64 blocks first:
> that way it fills up in no time.

## What next?

Make up your own challenges: a house with a door, a maze, a pyramid, a staircase mine... If you make something
cool, show it to other players! They cannot see your robot, but they do see what it builds.

---

## Solutions (no peeking before you try!)

### 1. Hello, world!

- `Say` "Hello, world!"
- `Wait` 1 s
- `Repeat 4 times`
  - `Turn right`

### 2. The square dance

- `Repeat 4 times`
  - `Repeat 3 times`
    - `Move forward`
  - `Turn right`

### 3. The tower

- `Repeat 5 times`
  - `Move up`
  - `Place down`

### 4. Treasure hunter

- `While` **not** *block ahead is* `Coal Ore`
  - `Dig ahead`
  - `Move forward`
- `Say` "Treasure!"

If there is no coal nearby, the robot goes on until you are 64 blocks away or until it runs into bedrock.

### 5. A bridge that knows when to stop

- `Move forward`
- `While` **not** *block below is solid*
  - `Place down`
  - `Move forward`
- `Say` "Made it!"

The first step takes it off the bank. After each *Move forward* the loop asks again: when there is ground of the
other bank below, it ends.

### 6. Spiral staircase

- `Repeat 4 times`
  - `Repeat 3 times`
    - `Place ahead`
    - `Move up`
    - `Move forward`
  - `Turn right`

### 7. The lawnmower

- `Dig up`
- `Repeat 2 times`
  - `Repeat 4 times`
    - `Dig ahead`
    - `Move forward`
    - `Dig up`
  - `Turn right`
  - `Dig ahead`
  - `Move forward`
  - `Dig up`
  - `Turn right`
  - `Repeat 4 times`
    - `Dig ahead`
    - `Move forward`
    - `Dig up`
  - `Turn left`
  - `Dig ahead`
  - `Move forward`
  - `Dig up`
  - `Turn left`
- `Repeat 4 times`
  - `Dig ahead`
  - `Move forward`
  - `Dig up`

Two rounds of the big loop make 4 rows, and the last *Repeat* makes the fifth.

### 8. The miner who comes home

- `While` **not** *my inventory is full*
  - `Dig ahead`
  - `Move forward`
- `Turn right`
- `Turn right`
- `While` **not** *block ahead is solid*
  - `Move forward`
- `Say` "Coming back loaded!"

See also: [Programmable robot](193), [Programming the robot](194).
