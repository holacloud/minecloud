# Logic gates

![AND gate](item:and_gate)

A **logic gate** is a [switch](207) that **decides by itself**, by looking at its **inputs**. If the answer is "yes"
it switches on: it conducts and joins the networks it touches. If it is "no", it switches off and cuts them. It is
the piece computers are built from ([Logic for the curious](212) tells how).

## What a gate looks like

They are thin boards with a drawing on top:

- A red **arrow**: it points to the **output**. When you place the gate, the arrow points **the way you are
  looking**. It lights up while the gate is on.
- **Copper pads** on the edges: those are the **inputs**.
- A **symbol** in the middle, the one used in electronics standards: `&`, `≥1`, `=1`, `1`.

The inputs, looking the way the arrow points:

| Gate | Inputs |
|---|---|
| AND, OR, XOR | **left** (A) and **right** (B) |
| NOT, [delay](210) | **back** |
| [Latch](210) | left = **SET**, right = **RESET** |

**Input faces never conduct**: they only listen. Every other face (front, the free sides, top and bottom) joins what
it touches **while the gate is on**. A gate that is on is like a lever that moved by itself.

## When is an input on?

An input gets a **signal** ("yes", or 1) when what touches it is:

- a **switch, sensor or gate that is on** (or a wire joined to one), **even without a battery**, or
- a wire or block of a network **with electricity**: a working generator or a battery with charge (and no
  blackout).

Otherwise the input is "no" (0). So a lever stuck to a gate already tells it "yes", and you can chain gates without
batteries. To **light lamps or run motors**, though, you need real energy: put the battery on one face of the gate
and the lamp on another.

> The [multimeter](205) tells you whether a network carries a **signal**.

## The four gates

In the tables 0 is "no" (off) and 1 is "yes" (on). They are called **truth tables**.

### AND ![](item:and_gate)

On only if **A and B** are on. Like a safe with two keys.

| A | B | Output |
|---|---|---|
| 0 | 0 | 0 |
| 0 | 1 | 0 |
| 1 | 0 | 0 |
| 1 | 1 | **1** |

### OR ![](item:or_gate)

On if **A or B** (or both) are on. Like a doorbell with two buttons, one at each door of the house.

| A | B | Output |
|---|---|---|
| 0 | 0 | 0 |
| 0 | 1 | **1** |
| 1 | 0 | **1** |
| 1 | 1 | **1** |

### XOR (exclusive OR) ![](item:xor_gate)

On if **A and B are different**: one yes and the other no. It is the **staircase light**: either of the two switches
changes it.

| A | B | Output |
|---|---|---|
| 0 | 0 | 0 |
| 0 | 1 | **1** |
| 1 | 0 | **1** |
| 1 | 1 | 0 |

### NOT (inverter) ![](item:not_gate)

It has **one** input, at the back, and does **the opposite**: on when the input is off.

| Input | Output |
|---|---|
| 0 | **1** |
| 1 | 0 |

## Recipes (C key)

Gates are **silicon chips** ([silicon](152), `element_si`):

| Recipe | Ingredients |
|---|---|
| **2** `and_gate`, **2** `or_gate`, **2** `xor_gate`, **2** `not_gate` | 1 `element_si` + 2 `copper_wire` + 1 `cobblestone` |

## Timing

Each gate takes **0.2 seconds** to answer (the server checks the circuits 5 times a second). A chain of five gates
takes one second. If you connect a NOT gate's output to its own input, it changes 5 times a second (on, off,
on...) without stopping: you have made an **oscillator**! (The server does not let it go any faster.)

## Tips

- **Keep input wires apart from output wires**: if an output wire touches an input one, the gate listens to itself.
- Place the gate facing where you want the current to go: the arrow points the way you look.
- Gates do not react to a right click (except the [delay](210)): you can place blocks against them without
  crouching.

See also: [Memory and delays](210), [Example circuits](211), [Logic for the curious](212).
