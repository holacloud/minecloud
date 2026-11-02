# Logic for the curious

![NOT gate](item:not_gate)

How can a machine "think" with switches? This page tells the idea, slowly.

## Everything is yes or no

A switch has only **two states**: on or off. We call them **1** and **0**, and each one a **bit** (a *binary digit*).
It seems little, but with a few bits you can store anything:

- With **1** bit there are 2 possibilities: 0, 1.
- With **2** bits, 4: 00, 01, 10, 11.
- With **3** bits, 8. Each extra bit **doubles** the possibilities.
- With **8** bits (a **byte**) there are 256: enough for a letter.

## Counting in binary

We count in **base 10**: each digit is worth 10 times the one on its right (units, tens, hundreds...). In **binary**,
base 2, each digit is worth **twice** the one on its right: 1, 2, 4, 8, 16...

| Binary | Sum | Decimal |
|---|---|---|
| 0 | | 0 |
| 1 | 1 | 1 |
| 10 | 2 | 2 |
| 11 | 2 + 1 | 3 |
| 100 | 4 | 4 |
| 101 | 4 + 1 | 5 |
| 110 | 4 + 2 | 6 |
| 111 | 4 + 2 + 1 | 7 |
| 1000 | 8 | 8 |

**Challenge:** put 4 levers in a row and count from 0 to 15 by moving handles up and down. What number is "1101"?

## George Boole

Almost 200 years ago, in 1854, an English teacher called **George Boole** wrote a book about reasoning with only two
values, *true* and *false*, and three words: **AND**, **OR** and **NOT**. It is called **Boolean algebra**. For a long
time it looked like a mathematicians' game... until in 1937 a student, **Claude Shannon**, noticed that circuits of
switches work exactly like that:

- Two switches **in a row** (one after the other) only let the current through if both are on: **AND**
  ([AND](209)).
- Two switches **side by side** (in parallel) let it through if either is on: **OR** ([OR](209)).

Try it in MineCloud with two levers, a battery and a lamp!

## Adding with gates

Adding two bits is easy:

| A | B | Sum | Carry |
|---|---|---|---|
| 0 | 0 | 0 | 0 |
| 0 | 1 | 1 | 0 |
| 1 | 0 | 1 | 0 |
| 1 | 1 | 0 | 1 |

Look: the **Sum** column is the **XOR** table, and **Carry** is the **AND** table. With one XOR and one AND you have a
**half adder**: the first step of a calculator. Join many and you can add huge numbers.

## How computers use gates

- The **processor** of a computer or a phone has **billions** of tiny logic gates, made of [silicon](152)
  **transistors**. That is why MineCloud's gates are made with silicon.
- They change state **billions of times a second**. MineCloud's do it 5 times a second: rather more relaxed!
- **Memory** keeps bits in circuits like the [latch](210).
- Everything you see on a screen (this text, photos, games) is, in the end, heaps of zeros and ones.

## Food for thought

- With NOT and AND gates you can build **all** the others. Can you make an OR from NOT and AND? (Hint: "A or B" is
  the same as "it is not true that neither A nor B".)
- How many levers do you need to pick one of the 7 days of the week?

See also: [Logic gates](209), [Memory and delays](210), [Programming the robot](194).
