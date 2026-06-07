# MineCloud Terrain Inspector

This tool is a lightweight 3D terrain inspector for the server-side procedural world.

## Goal

The inspector is meant to explore large generated areas without starting the full game simulation. It lets us validate terrain, biomes, mountains, caves, water, ice and underground cuts while keeping browser and server cost controlled.

## Server-First Generation

The tool does not contain terrain generation logic.

It reads terrain from server endpoints:

- `/api/terrain/tile` for large surface/LOD tiles.
- `/api/terrain/cube` for dense volumetric chunks.
- `/api/terrain/inspect` for small metadata/lookups and compatibility.

This avoids duplicating the generator in the tool. The server remains the source of truth for procedural terrain.

## Data Encodings

### Surface Tiles

Surface mode is used for large map views, especially with high radii such as `1200` or `2400`.

The server sends:

- `palette`: block type names.
- `surfaceY[]`: one Y value per sampled X/Z column.
- `surfaceTypes[]`: palette indices for those columns.

X/Z positions are implicit from tile origin, tile size and sampling step. This avoids sending thousands of repeated coordinate objects.

### Dense Cubes

Volumetric mode uses dense cubes, currently up to `64x64x64`.

The server sends:

- `palette`: up to 256 block type names.
- `data`: base64-encoded byte array.

Each byte is a palette index. A `64^3` cube is `262144` bytes before base64. This is much more compact than JSON objects per block.

Dense cubes are useful when inspecting caves or terrain cuts because they preserve local 3D structure.

## Streaming Strategy

The tool never requests a full `2400x2400` area as one response.

Instead, it splits the requested area into smaller regions and streams them progressively:

- Surface views request 2D tiles.
- Volumetric views request nearby 3D cubes.
- Requests are sorted by distance from the camera so nearby terrain appears first.
- A small concurrency limit avoids flooding the server/browser.

This prevents long blocking requests and makes navigation responsive.

## Cache Strategy

Terrain payloads are cached client-side.

The cache uses an approximate voxel budget of `40,000,000` voxels instead of a tiny entry count. This allows revisiting large inspected areas without requesting the same data again.

The tool caches two layers:

- Raw server payloads.
- Decoded block lists ready for rendering.

When a region is already visible, it is not rebuilt. When it is cached but not visible, it can be reconstructed without hitting the server.

## Rendering Strategy

The renderer uses `THREE.InstancedMesh` grouped by block type. This reduces draw calls compared to one mesh per block.

The tool keeps a map of active region meshes. When moving:

- Regions still needed remain in place.
- Missing regions are added.
- Regions outside the requested area are removed.

This avoids clearing and rebuilding the whole scene on every stream update.

## Level Of Detail

The `Sampling` selector has two types of modes:

- `Adaptive distance LOD`: uses square rings around the camera.
- `Fixed N`: uses the selected sampling everywhere.

Adaptive mode uses high detail near the camera and lower detail farther away:
- Current tile and 8 neighboring tiles: highest detail.
- Next ring: lower detail.
- Later rings: progressively coarser sampling.

Fixed modes intentionally do not adapt. If `Fixed 4` is selected, the whole requested area uses step `4`.

This separation avoids surprising behavior where a manually selected sampling value is silently changed.

## Visibility Optimizations

The tool avoids drawing blocks that cannot be seen.

For dense cubes, the client skips blocks whose six face-neighbors are opaque. Leaves, plants, water and ice are not treated as opaque blockers.

The server also applies similar visibility filtering in visible/sparse mode.

The tool additionally stores bounds per region and hides regions that are behind the camera or outside the camera frustum. This is not a perfect per-block z-buffer, but it avoids rendering entire off-screen regions.

## Y Cut

`Y cut` controls the maximum Y coordinate shown. It can go up to `256` because mountains can exceed the old limit of `96`.

For cave inspection, lower the Y cut and use a fixed sampling or volumetric mode near the camera.

## Render Styles

The tool supports:

- `Solid colors`: fast block colors.
- `Game-like textures`: simple generated texture patterns for common block types.

The texture mode is visual only. It does not duplicate terrain generation.

## Why These Decisions

The main constraints are browser memory, network size and server request time.

The selected architecture keeps the server authoritative, streams small chunks of data, uses compact encodings and avoids rebuilding unchanged meshes. This gives us large-area inspection without turning the tool into a second game client or duplicating procedural generation logic.
