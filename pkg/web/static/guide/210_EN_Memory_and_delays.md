# Memory and delays

![Latch](item:latch)

[Logic gates](209) answer what is happening **now**. These two pieces deal with **time**: the delay remembers what
happened a moment ago, and the latch remembers for ever.

| | Block | Id | Inputs | Recipe (C key) |
|---|---|---|---|---|
| ![](item:delay_gate) | Delay | `delay_gate` | back | **2** from 1 `element_si` + 2 `copper_wire` + 1 `cobblestone` |
| ![](item:latch) | Latch (Memory) | `latch` | left = SET, right = RESET | **1** from 2 `element_si` + 2 `copper_wire` + 1 `cobblestone` |

Like the other gates, they are placed with the arrow the way you look, their inputs do not conduct, and while on
they join what they touch on their other faces.

## Delay

It does **the same as its input, but a few seconds later**. If the input switches on, the output switches on 1 second
later; if it switches off, the output does so 1 second later. Like an echo.

- **Right click** changes the time: **1, 2, 3 or 4 seconds** (and back to 1). The dots on top tell you how many.
- It remembers quick changes: if the input goes on and off twice, the output "blinks" twice too, later.
- If the server restarts, whatever was "on its way" inside the delay is lost.

### What it is for

- **Doors that close by themselves**: a door that opens when you step on a plate and closes a few seconds after you
  step off (see [Example circuits](211)).
- **Sequences**: several delays in a row switch lamps on one after another, like runway lights.
- **Blinkers**: a NOT gate with a 1 s delay right in front of it, and a wire from the delay's output back to the
  NOT's input (at its back), touching nothing else. It switches on and off by itself, about every second.

## Latch (memory)

A latch **remembers** one bit: on or off. Its two inputs are like the buttons of an alarm:

- **SET** (left) switches it **on**.
- **RESET** (right) switches it **off**.
- If neither is on, **it stays as it was**. That is its memory.
- If both are on, RESET wins.

| SET | RESET | Output |
|---|---|---|
| 0 | 0 | as before (it remembers) |
| 1 | 0 | **1** |
| 0 | 1 | 0 |
| 1 | 1 | 0 |

With two [push buttons](207), one on each input, you have a "start" and a "stop" button, like on factory machines.
The memory is in its block name, so it **survives** a server restart.

It is also called an *SR flip-flop*. A computer's memory is made of millions of pieces like it.

## Curiosities

- Traffic lights work with **timers**: green for a few seconds, amber, red...
- A computer's **RAM** keeps each bit in a circuit like a latch (or in a tiny capacitor), and forgets everything when
  the power goes off.

See also: [Logic gates](209), [Example circuits](211), [Logic for the curious](212).
