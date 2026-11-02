# Example circuits

![XOR gate](item:xor_gate)

Four circuits to learn by doing. The plans are seen **from above**, with **north at the top**, and every block is on
the floor, on the same level. Use charged batteries (with a [hand crank](201) or a [solar panel](201)) and the
[multimeter](205) to see what is going on.

## 1. Automatic street lights (easy)

Lamps that switch on by themselves at dusk and off at dawn.

You need: 1 [solar panel](201), 1 [battery](203), 1 [daylight sensor](208) and some [lamps](204).

| ![](item:solar_panel) panel | ![](item:battery_block) battery | ![](item:daylight_sensor) sensor | ![](item:electric_lamp) lamp | ![](item:electric_lamp) lamp |

1. Put them in a row, touching. **Right click** the sensor to put it in **night mode** (a moon drawn on it).
2. By day the sensor is off: it cuts the row in two. The panel charges the battery and the lamps rest.
3. At night the sensor switches on, joins both parts and the battery lights the lamps.

**What you learn:** a sensor is a switch that moves by itself. Compared with the lights in
[Electric projects](206), which were lit all day, you save half the energy.

## 2. The staircase light (medium)

A light with **two switches**, one downstairs and one upstairs, and **either of them** changes it.

You need: 1 [XOR gate](209), 2 [levers](207), 1 battery, 1 lamp and wires.

| · | ![](item:electric_lamp) lamp | · |
| ![](item:lever) lever A | ![](item:xor_gate) XOR ↑ | ![](item:lever) lever B |
| · | ![](item:battery_block) battery | · |

1. Place the XOR **facing north** (the arrow towards the lamp).
2. The levers go on the **left** and **right** of the gate (its inputs). The battery behind it; the lamp in front.
3. Move one lever: the light goes on. Move the other: it goes off. Try any order!
4. In a real house the levers would be far apart: run a wire to each lever, without the wires touching each other
   or the lamp's wires.

**What you learn:** XOR is on when its inputs are **different**. Each time you change one, the answer changes.

## 3. Automatic door (hard)

An [iron door](197) that opens when you step on a plate and **closes by itself 2 seconds after** you step off.

You need: 1 [pressure plate](207), 1 [OR gate](209), 1 [delay](210), 1 [motor](204), 1 iron door, 1 battery and 11
wires.

| · | · | ![](item:iron_door) door | · | · |
| · | · | ![](item:electric_motor) motor | · | · |
| ![](item:copper_wire) | ![](item:pressure_plate) plate | ![](item:or_gate) OR ↑ | ![](item:delay_gate) delay ← | ![](item:copper_wire) |
| ![](item:copper_wire) | · | ![](item:battery_block) battery | · | ![](item:copper_wire) |
| ![](item:copper_wire) | · | · | · | ![](item:copper_wire) |
| ![](item:copper_wire) | ![](item:copper_wire) | ![](item:copper_wire) | ![](item:copper_wire) | ![](item:copper_wire) |

(The arrows show where each gate's arrow points; · is an empty gap.)

1. Place the OR **facing north** (arrow towards the motor) and the delay **facing west** (its arrow towards the OR).
   Right click the delay until it shows **2 dots** (2 seconds).
2. The plate is the OR's left input. The wire takes it, round the back, to the delay's input (its back face). The
   delay's output is the OR's right input.
3. **Mind the gap**: the wire touches neither the battery nor the OR.

When you step on the plate, the OR switches on at once (A = 1) and the motor opens the door. When you step off, the
plate goes off, but the delay stays on for 2 more seconds (B = 1) and the door waits. Then it closes.

**What you learn:** "A **or** what A was a moment ago" is a door that closes by itself.

## 4. Alarm (medium)

A light that warns you when someone comes near, but **only while the alarm is armed**.

You need: 1 [proximity sensor](208), 1 lever, 1 [AND gate](209), 1 battery and lamps.

| · | ![](item:electric_lamp) lamp | · |
| ![](item:proximity_sensor) sensor | ![](item:and_gate) AND ↑ | ![](item:lever) lever |
| · | ![](item:battery_block) battery | · |

1. Like the staircase, but with an AND: the sensor on the left, the lever on the right.
2. The lever is the **arm** button.
3. With the lever on, anyone within 5 blocks of the sensor lights the lamp. With the lever off, nothing happens.

**Challenge:** add a [delay](210) and a NOT in a loop (the blinker from [Memory and delays](210)) so the alarm light
**blinks**. And what if you swap the lever for a [latch](210), so the alarm keeps going until you press RESET?

See also: [Switches](207), [Sensors](208), [Logic gates](209), [Logic for the curious](212).
