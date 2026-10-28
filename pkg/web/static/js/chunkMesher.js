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
const WATER_SURFACE_HEIGHT = 0.875;

class MeshBucket {
    constructor(material) {
        this.material = material;
        this.positions = [];
        this.normals = [];
        this.uvs = [];
        this.colors = [];
        this.indices = [];
        this.blocks = [];
        this.vertexCount = 0;
    }

    addVertex(x, y, z, nx, ny, nz, u, v, shade) {
        this.positions.push(x, y, z);
        this.normals.push(nx, ny, nz);
        this.uvs.push(u, v);
        this.colors.push(shade, shade, shade);
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

        for (let pz = 0; pz < size; pz++) {
            for (let px = 0; px < size; px++) {
                const worldX = minX + px;
                const worldZ = minZ + pz;
                const column = world.getColumnAt(worldX, worldZ);
                if (!column) continue;
                const lx = localCoord(worldX);
                const lz = localCoord(worldZ);
                for (let y = WORLD_MIN_Y; y <= WORLD_MAX_Y; y++) {
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

    // Returns { buckets: MeshBucket[], water: MeshBucket|null, special: [{type, x, y, z}] }.
    build(chunkX, chunkZ, options = {}) {
        const world = this.world;
        const registry = world.registry;
        const column = world.columns.get(world.chunkKey(chunkX, chunkZ));
        if (!column) return null;

        this.fillPadded(chunkX, chunkZ);
        const baseX = chunkX * CHUNK_SIZE;
        const baseZ = chunkZ * CHUNK_SIZE;
        const waterId = registry.id('water');
        const ladderId = registry.id('ladder');
        const bedrockId = registry.id('bedrock');
        const hidden = options.hiddenBlock || null;
        const buckets = new Map();
        const special = [];
        let water = null;

        const bucketFor = (material) => {
            let bucket = buckets.get(material);
            if (!bucket) {
                bucket = new MeshBucket(material);
                buckets.set(material, bucket);
            }
            return bucket;
        };

        const blocks = column.blocks;
        for (let index = 0; index < blocks.length; index++) {
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

            if (type === 'sign' || type === 'torch' || id === ladderId) {
                special.push({ type, x: worldX, y, z: worldZ });
            }
            if (id === ladderId) continue;
            if (hidden && hidden.x === worldX && hidden.y === y && hidden.z === worldZ) continue;

            if (id === waterId) {
                if (this.idAt(px, y + 1, pz) === waterId) continue;
                if (!water) water = new MeshBucket(world.getChunkMaterial('water'));
                const top = y + WATER_SURFACE_HEIGHT;
                const a = water.addVertex(lx, top, lz + 1, 0, 1, 0, 0, 0, 1);
                const b = water.addVertex(lx + 1, top, lz + 1, 0, 1, 0, 1, 0, 1);
                const c = water.addVertex(lx + 1, top, lz, 0, 1, 0, 1, 1, 1);
                const d = water.addVertex(lx, top, lz, 0, 1, 0, 0, 1, 1);
                water.addTriangle(a, b, c, worldX, y, worldZ);
                water.addTriangle(a, c, d, worldX, y, worldZ);
                continue;
            }

            if (world.isCrossGeometry(type)) {
                const cutout = world.getGeometry(type);
                this.addCutout(bucketFor(world.getChunkMaterial(type)), cutout, lx, y, lz, worldX, worldZ);
                continue;
            }

            const material = world.getChunkMaterial(type);
            const height = registry.height[id] || 1;
            for (let f = 0; f < 6; f++) {
                // The underside of the world is never visible.
                if (f === 3 && id === bedrockId) continue;
                const face = MESH_FACES[f];
                const lowTop = f === 2 && height < 1;
                const neighborId = this.idAt(px + face.normal[0], y + face.normal[1], pz + face.normal[2]);
                if (!lowTop && !this.isFaceVisible(id, neighborId)) continue;

                const bucket = bucketFor(Array.isArray(material) ? material[f] : material);
                const ao = face.corners.map((corner) => this.vertexAO(px, y, pz, face, corner, lowTop));
                // Partial-height blocks (slabs) squash the face and its texture vertically.
                const sideFace = face.normal[1] === 0;
                const v = face.corners.map((corner, i) => bucket.addVertex(
                    lx + corner[0], y + corner[1] * height, lz + corner[2],
                    face.normal[0], face.normal[1], face.normal[2],
                    MESH_FACE_UVS[i][0], sideFace ? MESH_FACE_UVS[i][1] * height : MESH_FACE_UVS[i][1],
                    AO_LEVELS[ao[i]]
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

        return { buckets: Array.from(buckets.values()), water, special };
    }

    // Copies a cross-plane template (plants, torches) into the bucket at the block position.
    addCutout(bucket, geometry, lx, y, lz, worldX, worldZ) {
        const position = geometry.attributes.position;
        const normal = geometry.attributes.normal;
        const uv = geometry.attributes.uv;
        const offset = bucket.vertexCount;
        for (let i = 0; i < position.count; i++) {
            bucket.addVertex(
                position.getX(i) + lx + 0.5, position.getY(i) + y + 0.5, position.getZ(i) + lz + 0.5,
                normal.getX(i), normal.getY(i), normal.getZ(i),
                uv.getX(i), uv.getY(i),
                1
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
