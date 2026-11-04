// Builds one merged mesh per chunk containing only the exposed block faces.
//
// Each face carries per-vertex ambient occlusion (as vertex colours) computed from the
// three blocks touching that corner, and every triangle remembers which block it belongs
// to so raycast hits can be mapped back to block coordinates.

// Face order matches BoxGeometry material groups: +x, -x, +y, -y, +z, -z.
const MESH_FACES = [
    { normal: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
    { normal: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { normal: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { normal: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }
];
const MESH_FACE_UVS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_LEVELS = [0.42, 0.62, 0.82, 1];
// The inside of a hollow front (a bookshelf): the shade at this depth in blocks, and deeper.
const RELIEF_DEPTH = 5 / 16;
const RELIEF_DARKEST = 0.36;
const WATER_SURFACE_HEIGHT = 0.875;
const MAX_BLOCK_LIGHT = 14;
// How far (in blocks) open sky still lights cells sideways, e.g. into a cave mouth.
const SKY_REACH = 3;

// Torch light around one chunk: a breadth-first flood from every torch (and other light
// emitter, registry.lightEmitter, at its registry.lightLevel) within reach,
// losing one level per block and stopped by opaque full cubes.
class LightField {
    constructor(world, chunkX, chunkZ) {
        const reach = MAX_BLOCK_LIGHT;
        this.minX = chunkX * CHUNK_SIZE - 1 - reach;
        this.minZ = chunkZ * CHUNK_SIZE - 1 - reach;
        this.sizeX = CHUNK_SIZE + 2 + reach * 2;
        this.sizeZ = this.sizeX;
        this.empty = true;

        const registry = world.registry;
        const emitters = registry.lightEmitter;
        // Light never travels further than one chunk, so the 3x3 neighbourhood suffices.
        this.chunkX = chunkX;
        this.chunkZ = chunkZ;
        this.neighborhood = [];
        const torches = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const column = world.columns.get(world.chunkKey(chunkX + dx, chunkZ + dz));
                this.neighborhood.push(column || null);
                if (!column) continue;
                for (const index of column.getEmitters(emitters)) {
                    const x = (chunkX + dx) * CHUNK_SIZE + index % CHUNK_SIZE;
                    const z = (chunkZ + dz) * CHUNK_SIZE + Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE;
                    const y = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE)) + WORLD_MIN_Y;
                    if (x < this.minX || z < this.minZ || x >= this.minX + this.sizeX || z >= this.minZ + this.sizeZ) continue;
                    torches.push(x, y, z, registry.lightLevel[column.blocks[index]]);
                }
            }
        }
        if (torches.length === 0) return;

        let minY = WORLD_MAX_Y;
        let maxY = WORLD_MIN_Y;
        for (let i = 1; i < torches.length; i += 4) {
            minY = Math.min(minY, torches[i]);
            maxY = Math.max(maxY, torches[i]);
        }
        this.minY = Math.max(WORLD_MIN_Y, minY - reach);
        this.sizeY = Math.min(WORLD_MAX_Y, maxY + reach) - this.minY + 1;
        this.levels = new Uint8Array(this.sizeX * this.sizeY * this.sizeZ);
        this.empty = false;
        this.flood(registry, torches);
    }

    cellIndex(x, y, z) {
        const lx = x - this.minX;
        const ly = y - this.minY;
        const lz = z - this.minZ;
        if (lx < 0 || ly < 0 || lz < 0 || lx >= this.sizeX || ly >= this.sizeY || lz >= this.sizeZ) return -1;
        return (ly * this.sizeZ + lz) * this.sizeX + lx;
    }

    blockId(x, y, z) {
        const dx = floorDiv(x, CHUNK_SIZE) - this.chunkX + 1;
        const dz = floorDiv(z, CHUNK_SIZE) - this.chunkZ + 1;
        const column = this.neighborhood[dx * 3 + dz];
        return column ? column.get(localCoord(x), y, localCoord(z)) : AIR_ID;
    }

    flood(registry, torches) {
        const queue = [];
        for (let i = 0; i < torches.length; i += 4) {
            const index = this.cellIndex(torches[i], torches[i + 1], torches[i + 2]);
            if (index < 0) continue;
            this.levels[index] = Math.max(this.levels[index], torches[i + 3]);
            queue.push(torches[i], torches[i + 1], torches[i + 2]);
        }
        const steps = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        for (let head = 0; head < queue.length; head += 3) {
            const x = queue[head];
            const y = queue[head + 1];
            const z = queue[head + 2];
            const level = this.levels[this.cellIndex(x, y, z)];
            if (level <= 1) continue;
            for (const [sx, sy, sz] of steps) {
                const nx = x + sx;
                const ny = y + sy;
                const nz = z + sz;
                const index = this.cellIndex(nx, ny, nz);
                if (index < 0 || this.levels[index] >= level - 1) continue;
                if (registry.fullCube[this.blockId(nx, ny, nz)]) continue;
                this.levels[index] = level - 1;
                queue.push(nx, ny, nz);
            }
        }
    }

    get(x, y, z) {
        if (this.empty) return 0;
        const index = this.cellIndex(x, y, z);
        return index < 0 ? 0 : this.levels[index];
    }
}

class MeshBucket {
    constructor(material) {
        this.material = material;
        this.positions = [];
        this.normals = [];
        this.uvs = [];
        this.colors = [];
        this.light = [];
        this.sky = [];
        this.indices = [];
        this.blocks = [];
        this.vertexCount = 0;
    }

    addVertex(x, y, z, nx, ny, nz, u, v, shade, light = 0, sky = 1) {
        this.positions.push(x, y, z);
        this.normals.push(nx, ny, nz);
        this.uvs.push(u, v);
        this.colors.push(shade, shade, shade);
        this.light.push(light);
        this.sky.push(sky);
        return this.vertexCount++;
    }

    addTriangle(a, b, c, blockX, blockY, blockZ) {
        this.indices.push(a, b, c);
        this.blocks.push(blockX, blockY, blockZ);
    }
}

class ChunkMesher {
    constructor(world) {
        this.world = world;
        // Padded copy of the chunk plus a 1-block border from its neighbours.
        this.paddedSize = CHUNK_SIZE + 2;
        this.padded = new Uint16Array(this.paddedSize * this.paddedSize * WORLD_HEIGHT);
        // Highest light-blocking block per column, for the chunk plus SKY_REACH + 1 around it.
        this.heightmapSize = CHUNK_SIZE + (SKY_REACH + 1) * 2;
        this.heightmap = new Int16Array(this.heightmapSize * this.heightmapSize);
        this.skyCache = new Float32Array(this.paddedSize * this.paddedSize * WORLD_HEIGHT);
    }

    blocksSky(id) {
        const registry = this.world.registry;
        return id !== AIR_ID && registry.solid[id] === 1 && registry.transparent[id] === 0;
    }

    fillHeightmap(chunkX, chunkZ) {
        const size = this.heightmapSize;
        const minX = chunkX * CHUNK_SIZE - SKY_REACH - 1;
        const minZ = chunkZ * CHUNK_SIZE - SKY_REACH - 1;
        for (let hz = 0; hz < size; hz++) {
            for (let hx = 0; hx < size; hx++) {
                const column = this.world.getColumnAt(minX + hx, minZ + hz);
                let top = WORLD_MIN_Y - 1;
                if (column) {
                    const lx = localCoord(minX + hx);
                    const lz = localCoord(minZ + hz);
                    for (let y = column.maxY; y >= WORLD_MIN_Y; y--) {
                        if (this.blocksSky(column.blocks[chunkIndex(lx, y, lz)])) {
                            top = y;
                            break;
                        }
                    }
                }
                this.heightmap[hz * size + hx] = top;
            }
        }
        this.skyCache.fill(-1);
    }

    // 1 under open sky, fading under roofs and a few blocks into openings, 0 deep underground.
    skyAt(px, y, pz) {
        if (y > WORLD_MAX_Y) return 1;
        if (y < WORLD_MIN_Y) return 0;
        const cacheIndex = this.paddedIndex(px, y, pz);
        const cached = this.skyCache[cacheIndex];
        if (cached >= 0) return cached;

        const size = this.heightmapSize;
        const hx = px + SKY_REACH;
        const hz = pz + SKY_REACH;
        const top = this.heightmap[hz * size + hx];
        let sky = y > top ? 1 : Math.max(0, 1 - (top - y) / 4);
        for (let dz = -SKY_REACH; dz <= SKY_REACH && sky < 1; dz++) {
            for (let dx = -SKY_REACH; dx <= SKY_REACH; dx++) {
                if (y <= this.heightmap[(hz + dz) * size + hx + dx]) continue;
                sky = Math.max(sky, 1 - Math.max(Math.abs(dx), Math.abs(dz)) * 0.22);
            }
        }
        this.skyCache[cacheIndex] = sky;
        return sky;
    }

    paddedIndex(px, y, pz) {
        return ((y - WORLD_MIN_Y) * this.paddedSize + pz) * this.paddedSize + px;
    }

    fillPadded(chunkX, chunkZ) {
        const world = this.world;
        const size = this.paddedSize;
        const minX = chunkX * CHUNK_SIZE - 1;
        const minZ = chunkZ * CHUNK_SIZE - 1;
        this.padded.fill(AIR_ID);
        // Nothing above the tallest of the 3x3 columns needs copying.
        let top = WORLD_MIN_Y - 1;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const column = world.columns.get(world.chunkKey(chunkX + dx, chunkZ + dz));
                if (column) top = Math.max(top, column.maxY);
            }
        }
        this.topY = top;

        for (let pz = 0; pz < size; pz++) {
            for (let px = 0; px < size; px++) {
                const worldX = minX + px;
                const worldZ = minZ + pz;
                const column = world.getColumnAt(worldX, worldZ);
                if (!column) continue;
                const lx = localCoord(worldX);
                const lz = localCoord(worldZ);
                for (let y = WORLD_MIN_Y; y <= top; y++) {
                    this.padded[this.paddedIndex(px, y, pz)] = column.blocks[chunkIndex(lx, y, lz)];
                }
            }
        }
    }

    idAt(px, y, pz) {
        if (y < WORLD_MIN_Y || y > WORLD_MAX_Y) return AIR_ID;
        return this.padded[this.paddedIndex(px, y, pz)];
    }

    occludes(id) {
        return this.world.registry.fullCube[id] === 1;
    }

    isFaceVisible(id, neighborId) {
        const registry = this.world.registry;
        if (neighborId === AIR_ID || registry.fluid[neighborId]) return true;
        if (registry.transparent[id]) return neighborId !== id;
        return registry.fullCube[neighborId] === 0;
    }

    // `flatTop` samples the block's own layer, for faces that sit below the next layer (slab tops).
    vertexAO(px, y, pz, face, corner, flatTop = false) {
        const [nx, ny, nz] = face.normal;
        const ax = nx !== 0 ? -1 : corner[0] * 2 - 1;
        const ay = ny !== 0 ? -1 : corner[1] * 2 - 1;
        const az = nz !== 0 ? -1 : corner[2] * 2 - 1;
        const lx = px + nx;
        const ly = flatTop ? y : y + ny;
        const lz = pz + nz;
        // The two in-plane directions of this corner.
        let side1;
        let side2;
        let cornerBlock;
        if (nx !== 0) {
            side1 = this.occludes(this.idAt(lx, ly + ay, lz));
            side2 = this.occludes(this.idAt(lx, ly, lz + az));
            cornerBlock = this.occludes(this.idAt(lx, ly + ay, lz + az));
        } else if (ny !== 0) {
            side1 = this.occludes(this.idAt(lx + ax, ly, lz));
            side2 = this.occludes(this.idAt(lx, ly, lz + az));
            cornerBlock = this.occludes(this.idAt(lx + ax, ly, lz + az));
        } else {
            side1 = this.occludes(this.idAt(lx + ax, ly, lz));
            side2 = this.occludes(this.idAt(lx, ly + ay, lz));
            cornerBlock = this.occludes(this.idAt(lx + ax, ly + ay, lz));
        }
        if (side1 && side2) return 0;
        return 3 - (side1 ? 1 : 0) - (side2 ? 1 : 0) - (cornerBlock ? 1 : 0);
    }

    // Smooth torch light for a face corner: average of the open cells around it in front of the face.
    vertexLight(px, y, pz, face, corner, flatTop) {
        const light = this.light;
        if (light.empty) return 0;
        const [nx, ny, nz] = face.normal;
        const fx = px + nx;
        const fy = flatTop ? y : y + ny;
        const fz = pz + nz;
        const ax = nx !== 0 ? 0 : corner[0] * 2 - 1;
        const ay = ny !== 0 ? 0 : corner[1] * 2 - 1;
        const az = nz !== 0 ? 0 : corner[2] * 2 - 1;
        const offsetX = this.originX - 1;
        const offsetZ = this.originZ - 1;
        const samples = nx !== 0
            ? [[0, 0, 0], [0, ay, 0], [0, 0, az], [0, ay, az]]
            : ny !== 0
                ? [[0, 0, 0], [ax, 0, 0], [0, 0, az], [ax, 0, az]]
                : [[0, 0, 0], [ax, 0, 0], [0, ay, 0], [ax, ay, 0]];
        let total = 0;
        let count = 0;
        for (const [sx, sy, sz] of samples) {
            if (count > 0 && this.occludes(this.idAt(fx + sx, fy + sy, fz + sz))) continue;
            total += light.get(offsetX + fx + sx, fy + sy, offsetZ + fz + sz);
            count++;
        }
        return ChunkMesher.lightCurve(total / count);
    }

    // Same corner sampling as vertexLight, for sky exposure.
    vertexSky(px, y, pz, face, corner, flatTop) {
        const [nx, ny, nz] = face.normal;
        const fx = px + nx;
        const fy = flatTop ? y : y + ny;
        const fz = pz + nz;
        const ax = nx !== 0 ? 0 : corner[0] * 2 - 1;
        const ay = ny !== 0 ? 0 : corner[1] * 2 - 1;
        const az = nz !== 0 ? 0 : corner[2] * 2 - 1;
        const samples = nx !== 0
            ? [[0, 0, 0], [0, ay, 0], [0, 0, az], [0, ay, az]]
            : ny !== 0
                ? [[0, 0, 0], [ax, 0, 0], [0, 0, az], [ax, 0, az]]
                : [[0, 0, 0], [ax, 0, 0], [0, ay, 0], [ax, ay, 0]];
        let total = 0;
        let count = 0;
        for (const [sx, sy, sz] of samples) {
            const cx = Math.min(this.paddedSize - 1, Math.max(0, fx + sx));
            const cz = Math.min(this.paddedSize - 1, Math.max(0, fz + sz));
            if (count > 0 && this.occludes(this.idAt(cx, fy + sy, cz))) continue;
            total += this.skyAt(cx, fy + sy, cz);
            count++;
        }
        return total / count;
    }

    static lightCurve(level) {
        const t = level / MAX_BLOCK_LIGHT;
        return t * t;
    }

    // Returns { buckets: MeshBucket[], water: MeshBucket|null, glass: MeshBucket[], special:
    // [{type, x, y, z}] }. Stained glass (registry.filterGlass) is its own mesh, as water is.
    build(chunkX, chunkZ, options = {}) {
        const world = this.world;
        const registry = world.registry;
        const column = world.columns.get(world.chunkKey(chunkX, chunkZ));
        if (!column) return null;

        this.fillPadded(chunkX, chunkZ);
        this.fillHeightmap(chunkX, chunkZ);
        const baseX = chunkX * CHUNK_SIZE;
        const baseZ = chunkZ * CHUNK_SIZE;
        const hiddenBlock = options.hiddenBlock;
        this.hiddenPadded = -1;
        if (hiddenBlock) {
            // Treat the hidden block as air so the faces around it are drawn (no see-through gaps).
            const hx = hiddenBlock.x - baseX + 1;
            const hz = hiddenBlock.z - baseZ + 1;
            if (hx >= 0 && hz >= 0 && hx < this.paddedSize && hz < this.paddedSize &&
                hiddenBlock.y >= WORLD_MIN_Y && hiddenBlock.y <= WORLD_MAX_Y) {
                // Fences and panes next to it keep joining it (connectionIdAt).
                this.hiddenPadded = this.paddedIndex(hx, hiddenBlock.y, hz);
                this.hiddenId = this.padded[this.hiddenPadded];
                this.padded[this.hiddenPadded] = AIR_ID;
            }
        }
        this.originX = baseX;
        this.originZ = baseZ;
        this.light = new LightField(world, chunkX, chunkZ);
        const cellLight = (x, y, z) => ChunkMesher.lightCurve(this.light.get(x, y, z));
        const cellSky = (lx, y, lz) => this.skyAt(lx + 1, y, lz + 1);
        const waterId = registry.id('water');
        const ladderId = registry.id('ladder');
        const bedrockId = registry.id('bedrock');
        const hidden = options.hiddenBlock || null;
        const buckets = new Map();
        const glassBuckets = new Map();
        const special = [];
        let water = null;

        const bucketIn = (map, material) => {
            let bucket = map.get(material);
            if (!bucket) {
                bucket = new MeshBucket(material);
                map.set(material, bucket);
            }
            return bucket;
        };
        const bucketFor = (material) => bucketIn(buckets, material);
        const glassBucketFor = (material) => bucketIn(glassBuckets, material);

        const blocks = column.blocks;
        const end = Math.min(blocks.length, chunkIndex(0, column.maxY + 1, 0));
        for (let index = 0; index < end; index++) {
            const id = blocks[index];
            if (id === AIR_ID) continue;

            const lx = index % CHUNK_SIZE;
            const lz = Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE;
            const y = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE)) + WORLD_MIN_Y;
            const worldX = baseX + lx;
            const worldZ = baseZ + lz;
            const type = registry.names[id];
            const px = lx + 1;
            const pz = lz + 1;

            if (isSignBlockType(type) || id === ladderId) {
                special.push({ type, x: worldX, y, z: worldZ });
            }
            if (id === ladderId) continue;
            if (hidden && hidden.x === worldX && hidden.y === y && hidden.z === worldZ) continue;

            if (id === waterId) {
                if (!water) water = new MeshBucket(world.getChunkMaterial('water'));
                // The topmost water cell is drawn slightly lowered; cells below it are full.
                const surface = this.idAt(px, y + 1, pz) !== waterId;
                const height = surface ? WATER_SURFACE_HEIGHT : 1;
                for (let f = 0; f < 6; f++) {
                    const face = MESH_FACES[f];
                    const [nx, ny, nz] = face.normal;
                    const neighborId = this.idAt(px + nx, y + ny, pz + nz);
                    if (f === 2) {
                        if (!surface) continue;
                    } else if (neighborId === waterId || registry.fullCube[neighborId]) {
                        continue;
                    }
                    const lit = cellLight(worldX + nx, y + ny, worldZ + nz);
                    const sky = cellSky(lx + nx, y + ny, lz + nz);
                    const sideFace = ny === 0;
                    const v = face.corners.map((corner, i) => water.addVertex(
                        lx + corner[0], y + corner[1] * height, lz + corner[2],
                        nx, ny, nz,
                        MESH_FACE_UVS[i][0], sideFace ? MESH_FACE_UVS[i][1] * height : MESH_FACE_UVS[i][1],
                        1, lit, sky
                    ));
                    water.addTriangle(v[0], v[1], v[2], worldX, y, worldZ);
                    water.addTriangle(v[0], v[2], v[3], worldX, y, worldZ);
                }
                continue;
            }

            if (registry.shaped[id]) {
                this.addShapedBlock(registry.filterGlass[id] ? glassBucketFor : bucketFor, id, type, px, y, pz, lx, lz, worldX, worldZ, cellLight, cellSky);
                continue;
            }

            if (world.isCrossGeometry(type)) {
                const cutout = world.getGeometry(type);
                this.addCutout(bucketFor(world.getChunkMaterial(type)), cutout, lx, y, lz, worldX, worldZ, cellLight(worldX, y, worldZ), cellSky(lx, y, lz));
                continue;
            }

            const material = world.getChunkMaterial(type);
            const height = registry.height[id] || 1;
            const cubeBucketFor = registry.filterGlass[id] ? glassBucketFor : bucketFor;
            for (let f = 0; f < 6; f++) {
                // The underside of the world is never visible.
                if (f === 3 && id === bedrockId) continue;
                const face = MESH_FACES[f];
                const lowTop = f === 2 && height < 1;
                const neighborId = this.idAt(px + face.normal[0], y + face.normal[1], pz + face.normal[2]);
                if (!lowTop && !this.isFaceVisible(id, neighborId)) continue;

                const bucket = cubeBucketFor(Array.isArray(material) ? material[f] : material);
                const ao = face.corners.map((corner) => this.vertexAO(px, y, pz, face, corner, lowTop));
                // Partial-height blocks (slabs) squash the face and its texture vertically.
                const sideFace = face.normal[1] === 0;
                const v = face.corners.map((corner, i) => bucket.addVertex(
                    lx + corner[0], y + corner[1] * height, lz + corner[2],
                    face.normal[0], face.normal[1], face.normal[2],
                    MESH_FACE_UVS[i][0], sideFace ? MESH_FACE_UVS[i][1] * height : MESH_FACE_UVS[i][1],
                    AO_LEVELS[ao[i]],
                    this.vertexLight(px, y, pz, face, corner, lowTop),
                    this.vertexSky(px, y, pz, face, corner, lowTop)
                ));
                // Flip the diagonal so AO interpolates without a visible crease.
                if (ao[0] + ao[2] < ao[1] + ao[3]) {
                    bucket.addTriangle(v[1], v[2], v[3], worldX, y, worldZ);
                    bucket.addTriangle(v[1], v[3], v[0], worldX, y, worldZ);
                } else {
                    bucket.addTriangle(v[0], v[1], v[2], worldX, y, worldZ);
                    bucket.addTriangle(v[0], v[2], v[3], worldX, y, worldZ);
                }
            }
        }

        return { buckets: Array.from(buckets.values()), water, glass: Array.from(glassBuckets.values()), special };
    }

    // Non-cube blocks (stairs, doors, fences...): the faces of their boxes (js/blockShapes.js).
    // A face is skipped when it lies on the cell border against an opaque cube or towards a
    // neighbour it connects to (fence rails, panes meeting), or when it is buried in another
    // box of the same block. Faces on the border get the usual corner AO and light; inner faces
    // take the light of their own cell.
    // A box with `relief` { from, skip, uv, planks } (a bookshelf's frame and books) belongs to a
    // block with a hollow front: its inner faces are lit by the cell in front (`from`), which is what
    // they look at, as its own cell has no light in it, and they darken with their depth. `skip` is a
    // bit per face never seen, `uv[f]` a rectangle of the block's `atlasFace` for that face, and
    // `planks` paints the rest with the block's top, not its front.
    addShapedBlock(bucketFor, id, type, px, y, pz, lx, lz, worldX, worldZ, cellLight, cellSky) {
        const world = this.world;
        const registry = world.registry;
        const shapes = world.shapes;
        // A whole cube hides its faces against what is really there, the hole of a mined block too.
        const neighbourAt = registry.fullCube[id] ? (ax, ay, az) => this.idAt(ax, ay, az) : (ax, ay, az) => this.connectionIdAt(ax, ay, az);
        const mask = shapes.mask(id, neighbourAt(px, y, pz - 1), neighbourAt(px + 1, y, pz), neighbourAt(px, y, pz + 1), neighbourAt(px - 1, y, pz));
        const shape = shapes.shapes[id];
        const boxes = shapes.boxes(id, mask, shape.variantAt ? shape.variantAt(worldX, y, worldZ) : null);
        const material = world.getChunkMaterial(type);
        const ownLight = cellLight(worldX, y, worldZ);
        const ownSky = cellSky(lx, y, lz);
        for (const box of boxes) {
            const relief = box.relief || null;
            for (let f = 0; f < 6; f++) {
                if (relief && relief.skip & (1 << f)) continue;
                const face = MESH_FACES[f];
                const [nx, ny, nz] = face.normal;
                const axis = nx !== 0 ? 0 : ny !== 0 ? 1 : 2;
                const positive = nx + ny + nz > 0;
                const plane = box[positive ? axis + 3 : axis];
                const onBorder = positive ? plane >= 1 - 1e-6 : plane <= 1e-6;
                if (onBorder) {
                    const neighborId = this.idAt(px + nx, y + ny, pz + nz);
                    if (registry.fullCube[neighborId]) continue;
                    if (ny === 0 && (mask & ChunkMesher.directionBit(nx, nz))) continue;
                } else if (ChunkMesher.faceBuried(boxes, box, axis, positive)) {
                    continue;
                }

                const rect = relief && relief.uv ? relief.uv[f] : null;
                const bucket = bucketFor(rect ? world.getChunkAtlasMaterial(type) : relief && relief.planks ? material[2] : Array.isArray(material) ? material[f] : material);
                if (relief && !onBorder) {
                    const [fromX, fromZ] = SHAPE_DIRECTIONS[relief.from];
                    const light = cellLight(worldX + fromX, y, worldZ + fromZ);
                    const sky = cellSky(lx + fromX, y, lz + fromZ);
                    const v = face.corners.map((corner, i) => {
                        const x = corner[0] ? box[3] : box[0];
                        const yy = corner[1] ? box[4] : box[1];
                        const z = corner[2] ? box[5] : box[2];
                        const [u, uvV] = rect
                            ? [rect[0] + (rect[2] - rect[0]) * MESH_FACE_UVS[i][0], rect[1] + (rect[3] - rect[1]) * MESH_FACE_UVS[i][1]]
                            : ChunkMesher.boxFaceUV(f, x, yy, z);
                        return bucket.addVertex(lx + x, y + yy, lz + z, nx, ny, nz, u, uvV, ChunkMesher.reliefShade(relief.from, x, z), light, sky);
                    });
                    bucket.addTriangle(v[0], v[1], v[2], worldX, y, worldZ);
                    bucket.addTriangle(v[0], v[2], v[3], worldX, y, worldZ);
                    continue;
                }
                // Inner tops (the tread of a stair) sample their own layer, like slab tops.
                const flatTop = f === 2 && !onBorder;
                const v = face.corners.map((corner) => {
                    const x = corner[0] ? box[3] : box[0];
                    const yy = corner[1] ? box[4] : box[1];
                    const z = corner[2] ? box[5] : box[2];
                    const near = [x >= 0.5 ? 1 : 0, yy >= 0.5 ? 1 : 0, z >= 0.5 ? 1 : 0];
                    const lit = onBorder || flatTop;
                    const ao = lit ? this.vertexAO(px, y, pz, face, near, flatTop) : 3;
                    const [u, uvV] = ChunkMesher.boxFaceUV(f, x, yy, z);
                    return bucket.addVertex(
                        lx + x, y + yy, lz + z, nx, ny, nz, u, uvV,
                        AO_LEVELS[ao],
                        lit ? this.vertexLight(px, y, pz, face, near, flatTop) : ownLight,
                        lit ? this.vertexSky(px, y, pz, face, near, flatTop) : ownSky
                    );
                });
                bucket.addTriangle(v[0], v[1], v[2], worldX, y, worldZ);
                bucket.addTriangle(v[0], v[2], v[3], worldX, y, worldZ);
            }
        }
    }

    // How much light a point of a hollow front keeps, by how deep it lies behind the face `from`.
    static reliefShade(from, x, z) {
        const depth = from === 'n' ? z : from === 's' ? 1 - z : from === 'e' ? 1 - x : x;
        return Math.max(RELIEF_DARKEST, 1 - (1 - RELIEF_DARKEST) * depth / RELIEF_DEPTH);
    }

    // Neighbour id for connections: the block being mined (cut out of the mesh) still counts.
    connectionIdAt(px, y, pz) {
        if (this.hiddenPadded >= 0 && y >= WORLD_MIN_Y && y <= WORLD_MAX_Y && this.paddedIndex(px, y, pz) === this.hiddenPadded) return this.hiddenId;
        return this.idAt(px, y, pz);
    }

    // Connection-mask bit of the horizontal direction (dx, dz) (see SHAPE_MASK).
    static directionBit(dx, dz) {
        if (dz < 0) return 1;
        if (dx > 0) return 2;
        if (dz > 0) return 4;
        return dx < 0 ? 8 : 0;
    }

    // Whether the face of `box` on `axis` (its max side if `positive`) is covered by another box
    // of the same block: that box reaches just past the face's plane and spans the whole face
    // (a box covering only its middle, like a crank's shaft on its base, leaves it visible).
    static faceBuried(boxes, box, axis, positive) {
        const plane = positive ? box[axis + 3] + 1e-4 : box[axis] - 1e-4;
        const e = 1e-6;
        return boxes.some((other) => {
            if (other === box || plane <= other[axis] || plane >= other[axis + 3]) return false;
            for (let a = 0; a < 3; a++) {
                if (a === axis) continue;
                if (other[a] > box[a] + e || other[a + 3] < box[a + 3] - e) return false;
            }
            return true;
        });
    }

    // Texture coordinates of a box corner on face f, laid out like full-cube faces
    // (MESH_FACE_UVS), so a box shows the part of the texture it would cut from a whole block.
    static boxFaceUV(f, x, y, z) {
        switch (f) {
            case 0: return [1 - z, y];
            case 1: return [z, y];
            case 2: return [x, 1 - z];
            case 3: return [x, z];
            case 4: return [x, y];
            default: return [1 - x, y];
        }
    }

    // Copies a cross-plane template (plants, torches) into the bucket at the block position.
    addCutout(bucket, geometry, lx, y, lz, worldX, worldZ, light, sky) {
        const position = geometry.attributes.position;
        const normal = geometry.attributes.normal;
        const uv = geometry.attributes.uv;
        const offset = bucket.vertexCount;
        for (let i = 0; i < position.count; i++) {
            bucket.addVertex(
                position.getX(i) + lx + 0.5, position.getY(i) + y + 0.5, position.getZ(i) + lz + 0.5,
                normal.getX(i), normal.getY(i), normal.getZ(i),
                uv.getX(i), uv.getY(i),
                1,
                light,
                sky
            );
        }
        const index = geometry.index.array;
        for (let i = 0; i < index.length; i += 3) {
            bucket.addTriangle(offset + index[i], offset + index[i + 1], offset + index[i + 2], worldX, y, worldZ);
        }
    }

    // Packs buckets into one BufferGeometry with a group per material.
    static toMesh(buckets) {
        let vertexCount = 0;
        let indexCount = 0;
        for (const bucket of buckets) {
            vertexCount += bucket.vertexCount;
            indexCount += bucket.indices.length;
        }
        if (indexCount === 0) return null;

        const positions = new Float32Array(vertexCount * 3);
        const normals = new Float32Array(vertexCount * 3);
        const uvs = new Float32Array(vertexCount * 2);
        const colors = new Float32Array(vertexCount * 3);
        const light = new Float32Array(vertexCount);
        const sky = new Float32Array(vertexCount);
        const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
        const faceBlocks = new Int32Array(indexCount);
        const geometry = new THREE.BufferGeometry();
        const materials = [];

        let vertexOffset = 0;
        let indexOffset = 0;
        buckets.forEach((bucket, groupIndex) => {
            positions.set(bucket.positions, vertexOffset * 3);
            normals.set(bucket.normals, vertexOffset * 3);
            uvs.set(bucket.uvs, vertexOffset * 2);
            colors.set(bucket.colors, vertexOffset * 3);
            light.set(bucket.light, vertexOffset);
            sky.set(bucket.sky, vertexOffset);
            for (let i = 0; i < bucket.indices.length; i++) {
                indices[indexOffset + i] = bucket.indices[i] + vertexOffset;
            }
            faceBlocks.set(bucket.blocks, indexOffset);
            geometry.addGroup(indexOffset, bucket.indices.length, groupIndex);
            materials.push(bucket.material);
            vertexOffset += bucket.vertexCount;
            indexOffset += bucket.indices.length;
        });

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('blockLight', new THREE.BufferAttribute(light, 1));
        geometry.setAttribute('skyLight', new THREE.BufferAttribute(sky, 1));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        const mesh = new THREE.Mesh(geometry, materials);
        // One (x, y, z) triple per triangle; faceIndex * 3 points at it.
        mesh.userData.faceBlocks = faceBlocks;
        mesh.userData.isChunkMesh = true;
        mesh.userData.ownsGeometry = true;
        mesh.matrixAutoUpdate = false;
        return mesh;
    }
}
