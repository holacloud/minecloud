# Plots

![Claim marker](item:claim_marker)

A **plot** is a piece of the world that is yours: inside it, only you (and whoever you invite) can build, break, open chests and use machines. Others can come in, walk around and look at what you made, but not change anything.

## The marker

It is made in **C**: `Make Claim Marker`, from 2 `stone_bricks` and 1 `copper_ore`.

Place it on the ground and the plot is claimed: **17 × 17 blocks** with the marker in the middle (8 on each side), from the bottom of the world up to the sky. What lies below, in caves, and whatever you build high up is yours too.

The server checks everything. If it can't be done, the marker is not placed, goes back to your inventory and you are told why:

- **You already have a plot.** One per player, for now. To move it, remove the one you have.
- **It overlaps another plot.** The squares can't overlap: leave at least 17 blocks between your marker and someone else's.
- **Too close to the spawn area** (see below).
- **Too far:** place it within arm's reach, like any block.

## The border

As you come near a plot, its outline is drawn with soft lines on the ground and faint columns at the corners: **green** for yours, **violet** for one you are invited to, **amber** for someone else's, **blue** for the spawn area. Walking in shows a short notice: "Your plot", "Ana's plot (you are a guest)", "Ana's plot" or "Spawn area".

## The marker's panel

Right click **your** marker: the size, the coordinates of the marker and the corners, your **guests** and the **Remove the plot** button. Before removing it, it asks whether you are sure. Breaking the marker by hand does the same: it asks first.

Nobody else can break your marker. If it is someone else's, a right click only tells you whose it is.

## Guests

In the marker's panel you can **invite** other players: there is an "Invite…" button for each player who is online. Each guest is listed by name (with "online" if they are playing); if they log off they stay on the list, with the last name they used. **Remove** next to their name takes the permission away at once.

A guest can build, break, open chests and use machines in your plot, as you do. What they can't do: break or cover the marker (that is, remove the plot), open the marker's panel, or invite anybody. To them, a right click on the marker only says whose plot it is.

The invitation is for **your player**, not for a name: if the guest changes their name, they are still invited.

## Going to your plot

Wherever you are, you can go back to your plot: **"Go to my plot"** in the pause menu, or type `/home` in the chat. You appear standing on solid ground inside your plot, next to the marker; never inside a block nor in the air. If its terrain hasn't arrived yet, you wait still over the marker until it does. If you are riding or sitting, you get off first.

It costs nothing, but it works only once every **30 seconds**. It only takes you to **your** plot, not to one you are invited to.

## The spawn area

Around the point where everybody appears there is an area of **32 × 32** blocks that is protected and belongs to nobody: nobody can build or break in it, so it is always a good place to arrive. No plot may touch it.

## What it protects

In someone else's plot (and in the spawn area) the server does not let you:

- place or break blocks, draw curtains, change a glow block's colour, spray paint;
- flip levers or press buttons;
- open chests, barrels, wardrobes, fridges, ovens, foundries, the autoclave, the incubator or the microscope, nor take anything out or put anything in;
- let a ram from outside push, pull or move blocks inside it, nor carry blocks from one plot to another. A lift goes up and down in its own column, so it never crosses a border;
- let your robot, your beaver or your copper golem work in it: they act in your name.

If something slips through (say, because the plot has just been claimed), the server undoes it: the block goes back to how it was and you get it back.

## What it does not protect

Some things only happen in your browser and the server never sees them, so it can't stop them:

- animals, pets and mobs;
- traps, cages and ant colony jars;
- what lies on the ground to be picked up.

Nor is anything stopped that changes nothing: taking a water sample with a tube, voting on a sign, turning a hand crank, feeding an eel or measuring with the multimeter. And a pressure plate or a proximity sensor reacts to whoever steps on it or walks by, whoever they are.

## Your plot belongs to your player

The plot belongs not to your browser but to **your player**. With your player code (pause menu, "My player code") you can be yourself again in another browser, and the plot is still yours. The inventory, however, stays in each browser.

See also: [Mining and building](10), [Crafting](11), [Rams](217), [Lifts](218), [Programmable robot](193).
