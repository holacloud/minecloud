# Copper golem

![Copper golem](mob:copper_golem)

A small helper made of copper: a stubby body, **big round eyes** that glow, a **lightning-rod antenna** on its head
and a **copper coil** on its back. Nobody finds one in the wild: **you build it**. Then it follows you, waits for
you or tidies up the items lying around, as long as it has **charge**.

| | In-game name | Id |
|---|---|---|
| ![](item:copper_golem_core) | Copper Golem Core | `copper_golem_core` |
| ![](item:copper_wrench) | Copper Wrench | `copper_wrench` |

## Building it

| Recipe (C key) | Ingredients |
|---|---|
| 1 `copper_golem_core` (*Build Copper Golem Core*) | 3 `copper_block` + 1 `battery_block` + 1 `element_si` |
| 1 `copper_golem_core` (*Build Copper Golem Core (Lithium)*) | 3 `copper_block` + 1 `battery` + 1 `element_si` |
| 1 `copper_wrench` (*Forge Copper Wrench*) | 1 `copper_block` + 1 `iron_ore` |

Copper blocks are in [Fine stones and metals](59), the battery block in [Batteries](203), the lithium battery in
[Lithium battery](189) and the silicon chip of its brain in [Silicon](152).

- Hold the core and **right click the top of a block**: the golem **assembles** there, spinning, with sparks.
- You can have **at most 2** copper golems.
- **Shift + right click** it to pack it back into its core (you also get whatever it carried).
- **Hitting it does no harm**: it only complains. It is on your side!

## Modes

**Right click** it (empty-handed, or with anything that is not one of its special items) to switch mode. It says
which in a bubble and in the chat:

| Mode | What it does |
|---|---|
| **Follow** | Walks after you. If it is left more than 20 blocks behind, or gets stuck, it catches up in a flash. |
| **Stay** | Waits where it is and watches you. |
| **Work** | Remembers the spot where you set it. It picks up the **items lying on the ground within 8 blocks** of that spot and brings them to you if you are within 12 blocks; if you are further away, it leaves them in a pile on its spot. It carries up to 4 kinds of items at a time. |

On its way, it **opens closed doors and fence gates** and closes them again behind it (never on you), just as you
would: everyone sees them open and close.

## The copper wrench

- Right click a **door, trapdoor or fence gate** with the wrench: your nearest awake golem walks there and opens or
  closes it ("On my way!").
- If the world has **buttons and levers** (logic blocks), the wrench sends it to press them too.
- Right click the **golem** with the wrench to read its status: mode, charge, patina, wax and load.

## Charge

The golem runs on electricity, like a battery-powered toy.

- A **full charge** is about **one game day of work** (240 seconds walking or carrying). Standing still it uses five
  times less; asleep it uses nothing.
- It **recharges by itself** standing within 2 blocks of a **charged battery block** or of any **switched-on**
  electric block (a lit lamp, a running motor): its antenna blinks blue and white. A full charge takes 40 s. See
  [Electricity](200).
- Or give it energy by hand: right click it with **coal** (`coal_ore`, +25 %) or a **lithium battery** (`battery`,
  +100 %).

| Antenna | Meaning |
|---|---|
| Green | All good |
| Amber | Low battery (under 20 %): it walks at half speed and its eyes dim |
| Blinking blue and white | Charging |
| Dark | Asleep: out of charge |

At **0 %** it sits down and falls asleep ("Zzz..."). It wakes up when it has **15 %** again.

## Patina and wax

Its copper is real copper, so **it changes colour with time**, just like copper roofs and statues (see
[Rust and patina](216)):

| After | Colour |
|---|---|
| New | shiny orange |
| 1 game day | tarnished brown |
| 3 game days | brown with green spots |
| 6 game days | green **verdigris** |

In the **rain** or in **water** it goes three times faster. The patina only grows while the golem is in the world
around you.

- **Honeycomb** (right click): **waxes** it. The wax keeps air and water off the copper, so it keeps its colour.
- An **axe** (right click): takes the wax off first; without wax, it **scrapes off one layer** of patina.

## Good to know

- Like the [programmable robot](193), the golem is **yours only**: it is kept in your browser and other players do
  not see it. What it does to blocks (doors, gates, buttons) is seen by everyone.
- It does not swim: it walks around water.

## Trivia

- *Golem* comes from Jewish folklore: a figure of clay brought to life to help and protect.
- Real lightning rods are often made of **copper**, because it conducts electricity very well and does not rust
  away.
- The coil on its back is like the ones in motors and generators: a long copper wire wound round and round.

See also: [Rust and patina](216), [Copper](165), [Electricity](200), [Doors and trapdoors](197),
[Fences and gates](199), [Mobs index](16).
