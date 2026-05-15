# MineCloud

A browser-based multiplayer Minecraft-like game, with voxel rendering in `Three.js` and a Go server using WebSockets.

## Gameplay

![Gameplay screenshot placeholder](./gameplay.png)

## Features

- Browser-rendered voxel world.
- Real-time multiplayer over WebSockets.
- Block placement and breaking.
- First-person movement.
- Procedural terrain.

## Controls

- `WASD`: move.
- `Shift`: sprint.
- `Space`: jump.
- Left click: break block.
- Right click: place block.
- Mouse wheel: select previous/next block.
- Keys `1` to `8`: select a hotbar block.

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

## Structure

- `cmd/server`: server entrypoint.
- `pkg/network`: WebSocket logic and shared state.
- `static`: web client, assets, and game scripts.
