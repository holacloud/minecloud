# Sound block

![Sound block](item:sound_block)

A purple block that **plays a note** when you press it. With a few of them you can compose tunes, doorbells and
giant xylophones.

| In-game name | Id | Break |
|---|---|---|
| Sound Block | `sound_block` | 0.55 s |

## How to get it

| Recipe (C key) | Ingredients |
|---|---|
| 1 `sound_block` | 2 `planks` + 1 `cobblestone` + 1 `coal_ore` |

## How to use it

Look at the block (up to 5 blocks away) and:

- **F:** **plays** it.
- **Shift + F:** **tunes** it. The chat says how it is set, for example "Sound block set to flute note 4".

The block inspector shows its instrument and note. A freshly placed block is a **bell, note 1**.

**Instruments:**

| Instrument | Sound |
|---|---|
| `bell` | bright, one octave higher |
| `drum` | a dry thump; **always the same**, whatever the note |
| `pluck` | short, like a plucked string |
| `flute` | soft and long |
| `bass` | deep, one octave lower |

**Notes:** the **C major** scale, from middle C to the next C:

| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|
| C | D | E | F | G | A | B | C |

## The tuning trick

Each **Shift + F** changes the instrument (to the next of 5) and the note (to the next of 8) **at the same time**.
Since 5 and 8 share no divisors, all **40 combinations** can be reached, but you have to count. Presses needed from
a freshly placed block:

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| bell | 0 | 25 | 10 | 35 | 20 | 5 | 30 | 15 |
| drum | 16 | 1 | 26 | 11 | 36 | 21 | 6 | 31 |
| pluck | 32 | 17 | 2 | 27 | 12 | 37 | 22 | 7 |
| flute | 8 | 33 | 18 | 3 | 28 | 13 | 38 | 23 |
| bass | 24 | 9 | 34 | 19 | 4 | 29 | 14 | 39 |

After 40 presses it is back to bell, note 1. For the drum, **1** press is enough.

## Tips

- It can be heard up to about **18 blocks** away; online, everyone nearby hears it.
- Lay out a row of tuned blocks (C, D, E…) and walk along pressing F on each one: a xylophone!
- A sound block by the door makes a **doorbell**.

## Trivia

- Middle C vibrates about **262 times per second** (hertz) and A at **440**: the note orchestras tune to.
- Going up an octave **doubles** the frequency: the top C vibrates at 523 Hz.
- The names do, re, mi… come from a medieval Latin hymn to Saint John.

See also: [Playing together](13).
