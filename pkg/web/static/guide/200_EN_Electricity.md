# Electricity

![Solar panel](item:solar_panel)

With electricity you can light your house at night, make wheat grow faster or open an iron door with a motor.
You build it with blocks: something that **makes** electricity, something that **uses** it, and a **path** for it
to travel between them.

## Energy and power

Two words that sound alike but are not the same:

- **Energy** is the *amount* of work stored or used: what a battery holds or what a lamp spends in a night. It is
  measured in **joules** (J). A kilojoule (kJ) is 1000 J. Electricity bills use the **watt-hour** (Wh): 1 Wh =
  3600 J.
- **Power** is *how fast* energy flows: how much per second. It is measured in **watts** (W). 1 W = 1 J every
  second.

Example: a 10 W lamp that stays lit for 2 minutes (120 s) spends 10 × 120 = **1200 J** (a third of a Wh).

> Think of water: energy is the water in a bucket, power is how fast it pours out of the tap.

### Game time runs fast

A whole MineCloud day lasts only **4 real minutes** (240 s), and the night about 2 (120 s). Real solar panels
need hours of sun to fill a battery; here everything happens in minutes, so the numbers are **scaled for play**:
a solar panel gives 40 W, a battery holds 3 kJ, and one small generator fills a battery in about one day. A full
battery keeps a lamp lit for two and a half nights. The ideas (watts, joules, more generation than demand) are the
real ones; only the sizes are made to fit the game.

## The four kinds of electric block

| Kind | What it does | Blocks |
|---|---|---|
| **Generators** | turn sun, wind, water or your arm into electricity | ![](item:solar_panel) ![](item:wind_turbine) ![](item:water_wheel) ![](item:hand_crank) ![](item:rtg) [Generators](201), [Radioisotope generator](220) |
| **Conductors** | carry it from block to block | ![](item:copper_wire) ![](item:wire_post) [Wires and networks](202) |
| **Storage** | keeps the energy for later | ![](item:battery_block) [Batteries](203) |
| **Consumers** | use it: light, plants, motion | ![](item:electric_lamp) ![](item:grow_lamp) ![](item:electric_motor) [Consumers](204) |
| **Logic** | switch networks on and off: by hand, by themselves or by thinking | ![](item:lever) ![](item:daylight_sensor) ![](item:and_gate) [Switches](207), [Sensors](208), [Logic gates](209) |

And one tool to see what is going on: the ![](item:multimeter) [multimeter](205).

## Networks

Electric blocks that **touch face to face** (side, top or bottom) form one **network**. Every electric block
conducts (logic blocks only while they are on: a lever that is off cuts the network in two), so a lamp right next to
a solar panel already works; wires just take the electricity further. Two groups
that do not touch are two separate networks, and they share nothing.

## How the game works it out

The **server** does the maths for everybody, **5 times a second**, for each network:

1. **Generation**: it adds up what every generator gives right now (the sun, the wind, the water...).
2. **Demand**: it adds up what every consumer needs.
3. **Balance**:
   - If there is **more** generation than demand, every consumer works and the surplus **charges the batteries**.
   - If there is **less**, the batteries make up the difference... as long as they have enough energy.
   - If even with the batteries it is not enough: **blackout**. **Every** consumer on that network switches off
     (it is all or nothing), and whatever is generated goes into the batteries.

After a blackout the network waits **3 seconds** before switching on again, so gusts of wind do not make the lamps
flicker.

Everything runs on the server: lamps stay lit and batteries keep charging while you are away, every player sees
the same thing, and it is all saved with the world. Playing without a connection to a server there is no
electricity.

## Learn more

1. [Generators](201): solar, wind, water, the hand crank and the [radioisotope generator](220), with their numbers.
2. [Wires and networks](202): how to join blocks, and the 512-block limit.
3. [Batteries](203): capacity, charge and discharge.
4. [Consumers](204): lamps, grow lamps and motors.
5. [Multimeter](205): measure your network.
6. [Electric projects](206): five builds to try.
7. [Switches](207), [Sensors](208), [Logic gates](209), [Memory and delays](210) and [Example circuits](211):
   switch lights and doors by hand, by themselves or with logic.

See also: [Chemistry](115) (solar cells, light bulbs and lithium batteries), [Weather station](112) (the wind).
