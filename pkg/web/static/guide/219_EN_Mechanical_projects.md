# Mechanical projects

![Sticky ram](item:sticky_ram)

Five builds with [motor rams](217) and [lifts](218). Each one needs a power source: a charged [battery](203) is the
easiest. Remember that a ram uses **40 W** and a winch **60 W** while they have power.

## 1. The secret door

A piece of wall that slides aside when you pull a hidden lever.

1. Build a wall with a doorway two blocks high, and fill the doorway with two blocks of the same wall.
2. Inside the wall, **two cells to one side** of the doorway, put two **sticky rams**, one above the other, facing
   the doorway (stand in the doorway and look at the spot: the ram faces you). Leave the cell between each ram and
   the doorway **empty**.
3. Join the rams with [copper wire](202) to a battery through a **lever** hidden somewhere, and switch it **on**: the
   arms come out and fill the empty cells. Now it looks like solid wall.
4. Lever **off**: the sticky rams pull the two doorway blocks into the wall and the way is open. Lever **on**:
   they push them back into the doorway.

## 2. The rising step

A block that comes out of the floor so you can climb onto a ledge.

1. In front of the ledge, dig a hole **two blocks deep** and put a **motor ram** at the bottom, looking **down** at
   it as you place it (it faces up).
2. Put a block on top of the ram, level with the floor.
3. Power the ram through a [pressure plate](207) (battery, plate, then wire down to the ram). Step on the plate:
   the block rises and becomes a step. If you stand on the block when it rises, it lifts you.

## 3. The two-storey lift

1. Build the shaft, the [platform](218) and the [winch](218) as the lifts page explains.
2. Put a [latch](210) between the battery and the winch.
3. A **push button** on the upper floor goes to the latch's SET (left) input; another on the lower floor, to its
   RESET (right) input.
4. Press the upper button: the lift comes up. Press the lower one: it goes down.

## 4. The night shutter

A skylight that covers itself at night.

1. On the roof, in the row of a glass skylight, put a **sticky ram** two cells from the glass, facing it, and one
   block between the ram and the glass, all **one layer above** the glass.
2. Power the ram through a [daylight sensor](208) in **night** mode (right click the sensor to change the mode).
3. At dusk the ram pushes the block over the glass; at dawn it pulls it back.

## 5. The lift of a block of flats

The [lift stops](218) make a real lift: this is the one in `/build apartments`, for floors **4 blocks apart** (a floor
of 1 and 3 of air). You need 1 winch, 1 platform, 1 [RTG](220), 1 stop and 1 iron door per floor, and 2 buttons per
floor with wire if you want the two inside the lift.

1. Build the shaft through every floor, the **platform** in the floor of the lowest one and the **winch** 3 blocks
   above the floor of the highest one. Put the RTG touching the winch: it always has power.
2. On each floor, in the wall between the shaft and the landing: an **iron door**, and right over it a **lift stop**.
   Done: click the stop over any door and the lift comes, and that door opens when it arrives.
3. Inside: riding, you only reach your floor's stop and the next one up. So give the rider two buttons, in a niche in
   the shaft on **each** floor, on two [wires](202) up the wall:
   - A **green** button on a wire to the **top** face of the **highest** stop: it goes to the top.
   - A **red** one on a wire to the top of a **second stop** at the height of the lowest stop, hidden in the shaft
     wall: it goes to the bottom.
4. To ride to a floor: press green or red, and click the stop of your floor as it comes. If you click late it turns
   back for it.

Keep the two wires apart: they must not touch each other, the winch or its RTG, or the buttons will not be the only
thing that switches them on.

## Tips

- A ram **waits** if something is in its way and tries again while it has power: clear the way and it moves.
- A whole row of blocks (up to 12) moves together.
- Watch the [multimeter](205): if the rams and the lamps together need more than you generate, the whole network
  switches off and every ram goes back in.

See also: [Example circuits](211), [Electric projects](206).
