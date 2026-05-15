# MineCloud

A browser-based multiplayer Minecraft-like game, with voxel rendering in `Three.js` and a Go server using WebSockets.

## Gameplay

![Gameplay screenshot placeholder](./gameplay.png)

## Features

- Browser-rendered voxel world.
- Real-time multiplayer over WebSockets.
- Procedural terrain.
- First-person movement with auto-step over 1-block ledges.
- Hold-to-mine blocks with impact particles, crack overlay, and first-person hand animation.
- Place blocks from a real hotbar inventory with floating collectible drops.
- Humanoid remote player avatars with nametags and smoothed movement.
- Crafting system with recipes for blocks like `glass` and `stone_bricks`.
- Toggleable RTX-style visual mode with upgraded lighting/materials.
- Dynamic day/night cycle.
- Procedural sound effects for mining, placing, jumping, and pickups.
- Multiplayer chat.
- Server-side world persistence and local inventory persistence.

## Controls

### Desktop

- `WASD`: move.
- `Shift`: sprint.
- `Space`: jump.
- Hold left click: mine block.
- Right click: place block.
- Mouse wheel: select previous/next block.
- Keys `1` to `8`: select a hotbar block.
- `Enter`: open chat / send message.
- `C`: open crafting panel.
- `Esc`: open pause/settings menu.
- Press `R` 3 times quickly: toggle RTX mode.

### Mobile

- Left virtual joystick: move.
- Right touch zone: look around.
- `Mine`: hold to mine.
- `Place`: place selected block.
- `Jump`: jump.
- Tap hotbar slots: change selected block.

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

## Persistence

- World block changes are persisted on the server in `data/world.json`.
- The local player inventory, selected hotbar slot, player name, and settings are stored in `localStorage`.

## Structure

- `cmd/server`: server entrypoint.
- `pkg/network`: WebSocket logic and shared state.
- `pkg/web/static`: embedded web client, assets, and game scripts.
- `data/world.json`: persisted world block state created at runtime.
