# MineCloud

A browser-based multiplayer Minecraft-like game, with voxel rendering in `Three.js` and a Go server using WebSockets.

## Gameplay

![Gameplay screenshot placeholder](./gameplay.png)

## Features

- Browser-rendered voxel world.
- Real-time multiplayer over WebSockets.
- Procedural terrain.
- Visible biome variety, including plains, forests, rocky zones, and deserts with cactus.
- First-person movement with auto-step over 1-block ledges.
- Health system with fall damage, respawn, and a persistent safe-position restore.
- Hold-to-mine blocks with impact particles, crack overlay, and first-person hand animation.
- Place blocks from a real hotbar inventory with floating collectible drops.
- Beds that set your respawn point when placed.
- Placeable sign blocks with persistent shared text.
- Humanoid remote player avatars with nametags and smoothed movement.
- Nearby remote footsteps with distance-based audio.
- Crafting system with recipes for blocks like `glass` and `stone_bricks`.
- Toggleable RTX-style visual mode with upgraded lighting/materials.
- Dynamic day/night cycle.
- Procedural sound effects for mining, placing, jumping, and pickups.
- Multiplayer chat, player mentions by clicking avatars, and system join/leave messages.
- Proximity voice chat with WebRTC signaling.
- Server-side world persistence and local inventory persistence.

## Controls

### Desktop

- `WASD`: move.
- `Shift`: sprint.
- `Space`: jump.
- Hold left click: mine block.
- Right click: place block.
- Left click on another player: open chat with a prefilled mention.
- Mouse wheel: select previous/next block.
- Keys `1` to `8`: select a hotbar block.
- `Enter`: open chat / send message.
- `C`: open crafting panel.
- `Esc`: open pause/settings menu.
- Press `R` 3 times quickly: toggle RTX mode.
- `Voice` button in the HUD: enable/disable proximity voice chat.

### Mobile

- Left virtual joystick: move.
- Right touch zone: look around.
- `Mine`: hold to mine.
- `Place`: place selected block.
- `Jump`: jump.
- Tap hotbar slots: change selected block.

## Crafting And Special Blocks

### Bed

- How to get it: open crafting with `C` and craft `Build Bed`.
- Recipe: `3 planks + 2 leaves + 1 wood`.
- How it works: place the bed like any other block. When placed, it becomes your new respawn point.
- If the bed is broken later, your respawn point is reset to the default spawn.

### Sign

- How to get it: open crafting with `C` and craft `Carve Sign`.
- Recipe: `2 planks + 1 wood`.
- How to use it:
  - select the `sign` block in the hotbar,
  - right click to place it,
  - a text prompt appears,
  - enter up to `288` characters.
- Result: the sign text is visible to every player and is saved with the world.

### Other crafted blocks

- `Saw Wood into Planks`: `1 wood -> 4 planks`
- `Smelt Sand into Glass`: `3 sand -> 2 glass`
- `Pack Clay Bricks`: `2 dirt + 1 sand -> 2 brick`
- `Cut Stone Bricks`: `2 cobblestone + 1 brick -> 2 stone_bricks`

## Multiplayer

- Player names are chosen on first launch and shown above remote avatars.
- Clicking a player opens the chat with an `@name` mention prefilled.
- The chat shows normal player messages and system messages when players join or leave.
- Voice chat is proximity-based: enable it with the `Voice` button and players become louder as they get closer.

## Run Locally

Install dependencies:

```bash
make install
```

Start in development mode:

```bash
make dev
```

Or build and run the binary:

```bash
make run
```

Then open `http://localhost:8080` in your browser.

### Voice Chat Note

- Proximity voice chat needs microphone permission.
- It works best on `localhost` or over HTTPS-capable environments because browsers restrict microphone and WebRTC features on insecure contexts.

## Persistence

- World block changes are persisted on the server in `data/world.json`.
- Sign text is persisted with the world state on the server.
- The local player inventory, selected hotbar slot, player name, settings, respawn point, and last safe position are stored in `localStorage`.

## Structure

- `cmd/server`: server entrypoint.
- `pkg/network`: WebSocket logic and shared state.
- `pkg/web/static`: embedded web client, assets, and game scripts.
- `data/world.json`: persisted world block state created at runtime.
