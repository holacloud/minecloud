# Weather station

![Weather station](item:weather_station)

MineCloud has its own weather: the air is warmer or colder, the **wind** blows and, now and then, it **rains**.
With three instruments you can measure it and even **know in advance** whether it will rain today. Put the three
together and you get a weather station to set up by your house.

| | Instrument | What it measures | Page |
|---|---|---|---|
| ![](item:thermometer) | Thermometer | temperature | [Thermometer](113) |
| ![](item:barometer) | Barometer | pressure and the forecast | [Barometer and anemometer](114) |
| ![](item:anemometer) | Anemometer | wind speed and direction | [Barometer and anemometer](114) |
| ![](item:weather_station) | Weather station | all of it, plus the day's rain | this page |

## How to read an instrument

- **Hold it** in your hand: a small panel in the bottom right corner shows the readings and updates them live.
- **Right click** with it: the readings are written in the chat, to keep them or share them.

## How to get the station

| Recipe (C key) | Ingredients |
|---|---|
| 1 `weather_station` | 1 `thermometer` + 1 `barometer` + 1 `anemometer` + 1 `glass` + 2 `planks` |

## How to use it

| Action | Result |
|---|---|
| Right click the top of a block with the station in your hand | You **set it up** there. It is a block two tall. |
| **Look at it** (within reach) | The panel shows **all its readings**. |
| Right click it | A full **report** in the chat. |
| **Break it** (left click, like any block) | It drops as an item for whoever broke it. If the block under it is broken, it drops too. |
| **Shift** + right click it | You place another block against it, as on any other block. |

It has a wooden post with:

- a **wind vane** on top: its red arrow turns to point **where the wind comes from**;
- an **anemometer** of three copper cups that spin faster the stronger the wind;
- a white **louvred box** that shades the thermometer from the sun;
- a **rain gauge**: a glass tube that fills with the day's rain. It reads **0 mm under a roof**: put it in the
  open.

The station is a block like the others: it is saved on the server and **every player sees it**. If someone breaks
it, it is gone for everyone, and the item goes only to whoever broke it.

Stations used to be kept in the browser. If you still have one kept there, it sets itself up in the world the first
time you pass near where it was; if it no longer fits, it goes back to your inventory.

## How the forecast works

Every day at **dawn (06:00)** the world decides whether it will rain that day and when: on **one day in twenty**
a single shower falls, 6 to 15 in-game hours long (one to two and a half real minutes). The decision comes from
the day number, so **it is the same for every player**. That is why the barometer can tell you in the morning
"Rain expected today around 16:15", or "Clear skies today".

Before the shower the signs add up:

1. **Three hours before**, the pressure starts to fall.
2. **In the last hour** it falls fast ("rain within the hour") and the **wind picks up**.
3. While it rains, the air is cooler and the wind stronger, especially up on the mountains.
4. When it stops, the pressure rises again and the wind dies down within an hour.

The barometer cannot see beyond dawn: tomorrow's weather has not been decided yet.

## The wind

The wind is the same for everyone: it follows the world clock. Its **direction wanders** slowly through the day,
its **speed** goes from calm to a strong breeze, with **gusts** every few seconds, and it is:

- **stronger high up**: on a mountain top it blows twice as hard as by the sea;
- **stronger before and during the rain**;
- **much weaker under a roof** and almost nothing in a cave.

You can see it too: the **rain slants** with the wind, and in **Ultra** mode the leaves and the grass **sway
more** when it blows hard.

## Trivia

- Real weather stations keep the thermometer in a white box with slatted sides, called a **Stevenson screen**, so
  the sun does not heat it up: they measure the air, not the sunlight.
- A rain gauge measures rain in **millimetres**: 1 mm means one litre of water on every square metre of ground.
- The first weather forecasts were sent by **telegraph** in the 19th century: the storm travelled slower than
  the message.

See also: [Day, night and weather](8), [Thermometer](113), [Barometer and anemometer](114),
[Storm golem](43).
