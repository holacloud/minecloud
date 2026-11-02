# Sensors

![Daylight sensor](item:daylight_sensor)

A **sensor** is a [switch](207) that **moves by itself**: it watches something in the world and switches on or off
without you touching it. On, it conducts and joins the networks it touches; off, it cuts them. They are all low slabs
with a window on top, and a green stripe on the side that lights up while they are on.

| | Block | Id | On when... | Recipe (C key) |
|---|---|---|---|---|
| ![](item:daylight_sensor) | Daylight Sensor | `daylight_sensor` | it is **day** (or **night**, in night mode) | 1 `glass` + 1 `planks` + 2 `copper_wire` |
| ![](item:proximity_sensor) | Proximity Sensor | `proximity_sensor` | a **player is within 5 blocks** | 1 `iron_ore` + 1 `glass` + 2 `copper_wire` |
| ![](item:rain_sensor) | Rain Sensor | `rain_sensor` | it **rains** | 1 `cobblestone` + 3 `copper_wire` |

## Daylight sensor

It has a cell that feels sunlight, like a tiny [solar panel](201). It has **two modes**, switched with a **right
click**:

- **Day mode** (a sun drawn on it): on by day, off at night.
- **Night mode** (a moon): the other way round, on at night. The one you want for **street lights**.

It follows the game clock, not the clouds: even when it rains, day is day. It does not need to see the sky.

## Proximity sensor

It switches on when a **player** is within **5 blocks** (in any direction, through walls too) and off when they go
away. Use it for welcome lights, automatic doors and alarms. Like the [pressure plate](207), it does not notice
animals.

## Rain sensor

Two copper tracks very close together: when rain wets them, the water joins one to the other and the current flows.
It is on **while it rains**. In MineCloud it rains on few days (about 1 in 20), a shower of one or two minutes; the
[weather station](112) helps you know when.

## What about a light sensor for torches?

Not needed: the daylight sensor already knows whether it is day, and a lit electric lamp would make a light sensor
see itself.

## How the game works it out

Like everything electric, on the **server**, 5 times a second. Sensors keep working even when nobody is near (except
the proximity one, of course).

## Curiosities

- Real street lights have a **photocell**: a light sensor that switches them on at dusk.
- Supermarket doors that open by themselves use **infrared** or **microwave** sensors to notice you coming.
- Many cars have a rain sensor on the windscreen that starts the wipers.

See also: [Switches](207), [Logic gates](209), [Example circuits](211).
