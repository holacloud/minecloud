class WorldRenderer {
    constructor(scene) {
        this.scene = scene;
        this.chunks = new Map();
        this.chunkBlocks = new Map();
        this.generatedChunks = new Set();
        this.activeChunks = new Set();
        this.blockData = new Map();
        this.solidBlocks = new Set();
        this.chunkSize = 16;
        this.renderDistance = 4;

        this.geometry = new THREE.BoxGeometry(1, 1, 1);
        this.materials = new Map();
        this.textures = new Map();
        this.tempMatrix = new THREE.Matrix4();

        this.lastPlayerChunkX = null;
        this.lastPlayerChunkZ = null;

        this.blockTypes = {
            air: { color: 0x000000, name: 'Air' },
            grass: { color: 0x5B8C35, name: 'Grass Block', top: 0x5B8C35, side: 0x8B5A2B, bottom: 0x5B8C35 },
            dirt: { color: 0x8B5A2B, name: 'Dirt' },
            stone: { color: 0x808080, name: 'Stone' },
            cobblestone: { color: 0x6E6E6E, name: 'Cobblestone' },
            wood: { color: 0x8B6914, name: 'Oak Wood' },
            leaves: { color: 0x4E8F36, name: 'Oak Leaves', transparent: true },
            sand: { color: 0xE8D894, name: 'Sand' },
            water: { color: 0x3D85C6, transparent: true, opacity: 0.7, fluid: true },
            bedrock: { color: 0x1A1A1A, name: 'Bedrock' },
            coal_ore: { color: 0x808080, ore: 0x2D2D2D, name: 'Coal Ore' },
            iron_ore: { color: 0x808080, ore: 0xB87E56, name: 'Iron Ore' },
            gold_ore: { color: 0x808080, ore: 0xD4AF37, name: 'Gold Ore' },
            brick: { color: 0xA03020, name: 'Brick' },
            planks: { color: 0xC8A675, name: 'Oak Planks' },
        };

        this.generateInitialChunks();
    }

    chunkKey(chunkX, chunkZ) {
        return `${chunkX},${chunkZ}`;
    }

    blockKey(x, y, z) {
        return `${x},${y},${z}`;
    }

    parseBlockKey(key) {
        const [x, y, z] = key.split(',').map(Number);
        return { x, y, z };
    }

    getChunkCoords(x, z) {
        return {
            chunkX: Math.floor(x / this.chunkSize),
            chunkZ: Math.floor(z / this.chunkSize)
        };
    }

    ensureChunkBlockSet(chunkKey) {
        let blockKeys = this.chunkBlocks.get(chunkKey);
        if (!blockKeys) {
            blockKeys = new Set();
            this.chunkBlocks.set(chunkKey, blockKeys);
        }
        return blockKeys;
    }

    isSolidType(type) {
        const def = this.blockTypes[type];
        return def ? !def.fluid : false;
    }

    textureNoise(x, y, seed) {
        const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
        return n - Math.floor(n);
    }

    hexToRgb(hex) {
        return {
            r: (hex >> 16) & 255,
            g: (hex >> 8) & 255,
            b: hex & 255
        };
    }

    shadeColor(hex, amount) {
        const rgb = this.hexToRgb(hex);
        const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));

        return `rgb(${clamp(rgb.r + amount)}, ${clamp(rgb.g + amount)}, ${clamp(rgb.b + amount)})`;
    }

    paintPaletteTexture(ctx, size, palette, seed, alpha = 1) {
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const noise = this.textureNoise(x, y, seed);
                const color = palette[Math.min(palette.length - 1, Math.floor(noise * palette.length))];
                ctx.fillStyle = alpha === 1 ? this.shadeColor(color, 0) : this.shadeColor(color, 0).replace('rgb', 'rgba').replace(')', `, ${alpha})`);
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    paintTexture(ctx, type, size) {
        const def = this.blockTypes[type];
        const seed = type.length * 17;

        ctx.clearRect(0, 0, size, size);

        switch (type) {
            case 'grass':
                this.paintPaletteTexture(ctx, size, [0x3E6B24, 0x4C7E2C, 0x5B8C35, 0x6C9D3F], seed);
                break;
            case 'dirt':
                this.paintPaletteTexture(ctx, size, [0x6E431D, 0x7A4A22, 0x8B5A2B, 0x9D6832], seed);
                break;
            case 'stone':
                this.paintPaletteTexture(ctx, size, [0x666666, 0x787878, 0x808080, 0x909090], seed);
                break;
            case 'sand':
                this.paintPaletteTexture(ctx, size, [0xD9C67E, 0xE2CF88, 0xE8D894, 0xF0E1A5], seed);
                break;
            case 'bedrock':
                this.paintPaletteTexture(ctx, size, [0x0F0F0F, 0x171717, 0x1A1A1A, 0x242424], seed);
                break;
            case 'coal_ore':
                this.paintPaletteTexture(ctx, size, [0x6C6C6C, 0x808080, 0x8C8C8C], seed);
                ctx.fillStyle = this.shadeColor(0x2D2D2D, 0);
                for (let i = 0; i < 18; i++) {
                    const px = Math.floor(this.textureNoise(i, 2, seed) * size);
                    const py = Math.floor(this.textureNoise(i, 5, seed) * size);
                    ctx.fillRect(px, py, 2, 2);
                }
                break;
            case 'iron_ore':
                this.paintPaletteTexture(ctx, size, [0x6C6C6C, 0x808080, 0x8C8C8C], seed);
                ctx.fillStyle = this.shadeColor(0xB87E56, 0);
                for (let i = 0; i < 16; i++) {
                    const px = Math.floor(this.textureNoise(i, 7, seed) * size);
                    const py = Math.floor(this.textureNoise(i, 11, seed) * size);
                    ctx.fillRect(px, py, 2, 2);
                }
                break;
            case 'gold_ore':
                this.paintPaletteTexture(ctx, size, [0x6C6C6C, 0x808080, 0x8C8C8C], seed);
                ctx.fillStyle = this.shadeColor(0xD4AF37, 0);
                for (let i = 0; i < 14; i++) {
                    const px = Math.floor(this.textureNoise(i, 13, seed) * size);
                    const py = Math.floor(this.textureNoise(i, 17, seed) * size);
                    ctx.fillRect(px, py, 2, 2);
                }
                break;
            case 'wood':
                this.paintPaletteTexture(ctx, size, [0x6D4C16, 0x7B5718, 0x8B6914, 0x9A741C], seed);
                ctx.fillStyle = this.shadeColor(0x5B3E12, 0);
                for (let x = 0; x < size; x += 4) {
                    ctx.fillRect(x, 0, 1, size);
                }
                break;
            case 'planks':
                this.paintPaletteTexture(ctx, size, [0xB88F5D, 0xC09A68, 0xC8A675, 0xD2B181], seed);
                ctx.fillStyle = this.shadeColor(0x8F6B3E, 0);
                for (let y = 0; y < size; y += 4) {
                    ctx.fillRect(0, y, size, 1);
                }
                ctx.fillStyle = this.shadeColor(0x7B5B34, 0);
                for (let x = 2; x < size; x += 6) {
                    ctx.fillRect(x, 0, 1, size);
                }
                break;
            case 'brick':
                ctx.fillStyle = this.shadeColor(0x864030, 0);
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = this.shadeColor(0xA03020, 0);
                for (let y = 1; y < size; y += 4) {
                    const offset = (Math.floor(y / 4) % 2) * 3;
                    for (let x = -offset; x < size; x += 6) {
                        ctx.fillRect(x + 1, y, 5, 3);
                    }
                }
                break;
            case 'cobblestone':
                ctx.fillStyle = this.shadeColor(0x5A5A5A, 0);
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = this.shadeColor(0x808080, 0);
                for (let y = 0; y < size; y += 4) {
                    const offset = (Math.floor(y / 4) % 2) * 2;
                    for (let x = -offset; x < size; x += 5) {
                        ctx.fillRect(x + 1, y + 1, 4, 3);
                    }
                }
                break;
            case 'leaves':
                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
                        const noise = this.textureNoise(x, y, seed);
                        if (noise < 0.18) continue;
                        const color = noise > 0.7 ? 0x62A043 : 0x4E8F36;
                        ctx.fillStyle = this.shadeColor(color, 0);
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
                break;
            case 'water':
                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
                        const ripple = (x + y + Math.floor(this.textureNoise(x, y, seed) * 3)) % 5 === 0;
                        const color = ripple ? 0x6DA8E0 : 0x3D85C6;
                        ctx.fillStyle = `rgba(${this.hexToRgb(color).r}, ${this.hexToRgb(color).g}, ${this.hexToRgb(color).b}, 0.75)`;
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
                break;
            default:
                this.paintPaletteTexture(ctx, size, [def.color - 0x111111, def.color, def.color + 0x111111], seed);
                break;
        }
    }

    getTexture(type) {
        let texture = this.textures.get(type);
        if (texture) return texture;

        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;

        const ctx = canvas.getContext('2d');
        this.paintTexture(ctx, type, canvas.width);

        texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        if (THREE.sRGBEncoding) {
            texture.encoding = THREE.sRGBEncoding;
        }

        texture.needsUpdate = true;
        this.textures.set(type, texture);
        return texture;
    }

    getMaterial(type) {
        let material = this.materials.get(type);
        if (material) return material;

        const def = this.blockTypes[type];
        material = new THREE.MeshLambertMaterial({
            color: 0xFFFFFF,
            map: this.getTexture(type),
            transparent: def.transparent || false,
            opacity: def.opacity || 1,
            alphaTest: type === 'leaves' ? 0.35 : 0,
            depthWrite: !def.transparent || type === 'leaves'
        });

        this.materials.set(type, material);
        return material;
    }

    generateInitialChunks() {
        const initialChunks = [];

        for (let x = -this.renderDistance; x <= this.renderDistance; x++) {
            for (let z = -this.renderDistance; z <= this.renderDistance; z++) {
                const key = this.chunkKey(x, z);
                this.activeChunks.add(key);
                this.generateChunkData(x, z);
                initialChunks.push([x, z]);
            }
        }

        for (let i = 0; i < initialChunks.length; i++) {
            const [chunkX, chunkZ] = initialChunks[i];
            this.rebuildChunk(chunkX, chunkZ);
        }
    }

    generateChunkData(chunkX, chunkZ) {
        const key = this.chunkKey(chunkX, chunkZ);
        if (this.generatedChunks.has(key)) return;

        this.ensureChunkBlockSet(key);

        const seed = chunkX * 5741 + chunkZ * 28657;
        const rand = (x, z, offset = 0) => {
            const n = Math.sin(x * 12.9898 + z * 78.233 + seed + offset) * 43758.5453;
            return n - Math.floor(n);
        };

        const noise2D = (x, z, scale = 0.05) => {
            const ix = Math.floor(x * scale);
            const iz = Math.floor(z * scale);
            const fx = (x * scale) - ix;
            const fz = (z * scale) - iz;

            const a = rand(ix, iz);
            const b = rand(ix + 1, iz);
            const c = rand(ix, iz + 1);
            const d = rand(ix + 1, iz + 1);

            const ux = fx * fx * (3 - 2 * fx);
            const uz = fz * fz * (3 - 2 * fz);

            return a * (1 - ux) * (1 - uz) + b * ux * (1 - uz) + c * (1 - ux) * uz + d * ux * uz;
        };

        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                const worldX = chunkX * this.chunkSize + x;
                const worldZ = chunkZ * this.chunkSize + z;

                const height = Math.floor(noise2D(worldX, worldZ) * 8) + 3;

                for (let y = -5; y <= height; y++) {
                    let blockType;
                    if (y === -5) {
                        blockType = 'bedrock';
                    } else if (y < height - 3) {
                        const oreRand = rand(worldX, worldZ, y * 100);
                        if (oreRand < 0.02) blockType = 'coal_ore';
                        else if (oreRand < 0.025) blockType = 'iron_ore';
                        else if (oreRand < 0.026) blockType = 'gold_ore';
                        else blockType = 'stone';
                    } else if (y < height) {
                        blockType = 'dirt';
                    } else {
                        const sandHeight = Math.floor(noise2D(worldX + 100, worldZ + 100, 0.1) * 3);
                        blockType = sandHeight <= 0 ? 'grass' : 'sand';
                    }

                    this.setBlockData(worldX, y, worldZ, blockType, key);
                }

                const waterLevel = 2;
                if (height < waterLevel) {
                    for (let y = height + 1; y <= waterLevel; y++) {
                        this.setBlockData(worldX, y, worldZ, 'water', key);
                    }
                }

                if (rand(worldX, worldZ, 999) < 0.01 && height >= 3) {
                    this.generateTree(worldX, height + 1, worldZ, rand);
                }
            }
        }

        this.generatedChunks.add(key);
    }

    generateTree(x, y, z, rand) {
        const trunkHeight = 4 + Math.floor(rand(x, z, 2024) * 2);

        for (let ty = 0; ty < trunkHeight; ty++) {
            this.setBlockData(x, y + ty, z, 'wood');
        }

        const leavesStart = y + trunkHeight - 2;
        for (let ly = 0; ly < 3; ly++) {
            const radius = ly === 2 ? 1 : 2;
            for (let lx = -radius; lx <= radius; lx++) {
                for (let lz = -radius; lz <= radius; lz++) {
                    if (lx === 0 && lz === 0 && ly < 2) continue;
                    if (Math.abs(lx) === 2 && Math.abs(lz) === 2) continue;

                    this.setBlockData(x + lx, leavesStart + ly, z + lz, 'leaves');
                }
            }
        }
    }

    setBlockData(x, y, z, type, chunkKey = null) {
        const key = this.blockKey(x, y, z);
        const resolvedChunkKey = chunkKey || this.chunkKey(Math.floor(x / this.chunkSize), Math.floor(z / this.chunkSize));
        const currentType = this.blockData.get(key);

        if (currentType === type) {
            this.ensureChunkBlockSet(resolvedChunkKey).add(key);
            if (this.isSolidType(type)) {
                this.solidBlocks.add(key);
            } else {
                this.solidBlocks.delete(key);
            }
            return false;
        }

        this.blockData.set(key, type);
        this.ensureChunkBlockSet(resolvedChunkKey).add(key);

        if (this.isSolidType(type)) {
            this.solidBlocks.add(key);
        } else {
            this.solidBlocks.delete(key);
        }

        return true;
    }

    isBlockVisible(x, y, z, type) {
        const currentChunkKey = this.chunkKey(Math.floor(x / this.chunkSize), Math.floor(z / this.chunkSize));
        const def = this.blockTypes[type];
        const neighbors = [
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 0],
            [0, -1, 0],
            [0, 0, 1],
            [0, 0, -1]
        ];

        for (let i = 0; i < neighbors.length; i++) {
            const [dx, dy, dz] = neighbors[i];
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;

            const neighborType = this.blockData.get(this.blockKey(nx, ny, nz));
            if (!neighborType) return true;

            const neighborChunkKey = this.chunkKey(Math.floor(nx / this.chunkSize), Math.floor(nz / this.chunkSize));
            if (neighborChunkKey !== currentChunkKey && !this.activeChunks.has(neighborChunkKey)) {
                return true;
            }

            const neighborDef = this.blockTypes[neighborType];
            if (type === 'water') {
                if (neighborType !== 'water') return true;
                continue;
            }

            if (def.transparent) {
                if (!neighborDef.transparent || neighborType !== type) return true;
                continue;
            }

            if (neighborDef.transparent) return true;
        }

        return false;
    }

    removeChunkMesh(chunkKey) {
        const chunk = this.chunks.get(chunkKey);
        if (!chunk) return;

        this.scene.remove(chunk);

        for (let i = 0; i < chunk.children.length; i++) {
            const child = chunk.children[i];
            if (typeof child.dispose === 'function') {
                child.dispose();
            }
        }

        this.chunks.delete(chunkKey);
    }

    rebuildChunk(chunkX, chunkZ) {
        const key = this.chunkKey(chunkX, chunkZ);
        this.removeChunkMesh(key);

        if (!this.activeChunks.has(key)) return;

        const blockKeys = this.chunkBlocks.get(key);
        if (!blockKeys || blockKeys.size === 0) return;

        const baseX = chunkX * this.chunkSize;
        const baseZ = chunkZ * this.chunkSize;
        const instancesByType = new Map();

        for (const blockKey of blockKeys) {
            const type = this.blockData.get(blockKey);
            if (!type) continue;

            const { x, y, z } = this.parseBlockKey(blockKey);
            if (!this.isBlockVisible(x, y, z, type)) continue;

            let positions = instancesByType.get(type);
            if (!positions) {
                positions = [];
                instancesByType.set(type, positions);
            }

            positions.push({ x: x - baseX, y: y, z: z - baseZ });
        }

        if (instancesByType.size === 0) return;

        const chunk = new THREE.Group();
        chunk.position.set(baseX, 0, baseZ);
        chunk.updateMatrix();
        chunk.matrixAutoUpdate = false;

        for (const [type, positions] of instancesByType) {
            const mesh = new THREE.InstancedMesh(this.geometry, this.getMaterial(type), positions.length);
            mesh.userData.blockType = type;
            mesh.userData.instancePositions = positions;
            mesh.userData.chunkBaseX = baseX;
            mesh.userData.chunkBaseZ = baseZ;
            mesh.matrixAutoUpdate = false;

            if (THREE.StaticDrawUsage) {
                mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
            }

            for (let i = 0; i < positions.length; i++) {
                const position = positions[i];
                this.tempMatrix.makeTranslation(position.x + 0.5, position.y + 0.5, position.z + 0.5);
                mesh.setMatrixAt(i, this.tempMatrix);
            }

            mesh.instanceMatrix.needsUpdate = true;
            chunk.add(mesh);
        }

        this.scene.add(chunk);
        this.chunks.set(key, chunk);
    }

    rebuildChunkAndActiveNeighbors(chunkX, chunkZ, includeCenter = true) {
        const offsets = [
            [0, 0],
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
        ];

        for (let i = 0; i < offsets.length; i++) {
            const [dx, dz] = offsets[i];
            const x = chunkX + dx;
            const z = chunkZ + dz;
            const key = this.chunkKey(x, z);
            const shouldRebuild = dx === 0 && dz === 0 ? includeCenter : this.activeChunks.has(key);

            if (!shouldRebuild) continue;
            if (!this.chunkBlocks.has(key) && !this.generatedChunks.has(key)) continue;

            this.rebuildChunk(x, z);
        }
    }

    update(playerX, playerZ) {
        const { chunkX: playerChunkX, chunkZ: playerChunkZ } = this.getChunkCoords(playerX, playerZ);

        if (playerChunkX === this.lastPlayerChunkX && playerChunkZ === this.lastPlayerChunkZ) {
            return;
        }

        this.lastPlayerChunkX = playerChunkX;
        this.lastPlayerChunkZ = playerChunkZ;

        const desiredActiveChunks = new Set();
        const chunksToGenerate = [];
        const chunksToRender = [];

        for (let x = playerChunkX - this.renderDistance; x <= playerChunkX + this.renderDistance; x++) {
            for (let z = playerChunkZ - this.renderDistance; z <= playerChunkZ + this.renderDistance; z++) {
                const key = this.chunkKey(x, z);
                desiredActiveChunks.add(key);

                if (!this.generatedChunks.has(key)) {
                    this.generateChunkData(x, z);
                    chunksToGenerate.push([x, z]);
                }

                if (!this.chunks.has(key)) {
                    chunksToRender.push([x, z]);
                }
            }
        }

        const previousActiveChunks = this.activeChunks;
        this.activeChunks = desiredActiveChunks;

        const chunksToRefresh = new Set();

        for (const key of previousActiveChunks) {
            if (desiredActiveChunks.has(key)) continue;

            this.removeChunkMesh(key);

            const [chunkX, chunkZ] = key.split(',').map(Number);
            const neighborKeys = [
                this.chunkKey(chunkX + 1, chunkZ),
                this.chunkKey(chunkX - 1, chunkZ),
                this.chunkKey(chunkX, chunkZ + 1),
                this.chunkKey(chunkX, chunkZ - 1)
            ];

            for (let i = 0; i < neighborKeys.length; i++) {
                if (desiredActiveChunks.has(neighborKeys[i])) {
                    chunksToRefresh.add(neighborKeys[i]);
                }
            }
        }

        for (let i = 0; i < chunksToGenerate.length; i++) {
            const [chunkX, chunkZ] = chunksToGenerate[i];
            chunksToRefresh.add(this.chunkKey(chunkX, chunkZ));
            chunksToRefresh.add(this.chunkKey(chunkX + 1, chunkZ));
            chunksToRefresh.add(this.chunkKey(chunkX - 1, chunkZ));
            chunksToRefresh.add(this.chunkKey(chunkX, chunkZ + 1));
            chunksToRefresh.add(this.chunkKey(chunkX, chunkZ - 1));
        }

        for (let i = 0; i < chunksToRender.length; i++) {
            const [chunkX, chunkZ] = chunksToRender[i];
            chunksToRefresh.add(this.chunkKey(chunkX, chunkZ));
        }

        for (const key of chunksToRefresh) {
            if (!this.activeChunks.has(key)) continue;

            const [chunkX, chunkZ] = key.split(',').map(Number);
            this.rebuildChunk(chunkX, chunkZ);
        }
    }

    hasSolidBlock(x, y, z) {
        return this.solidBlocks.has(this.blockKey(x, y, z));
    }

    getInteractableObjects(position, reach) {
        const chunkRadius = Math.max(1, Math.ceil(reach / this.chunkSize));
        const { chunkX: playerChunkX, chunkZ: playerChunkZ } = this.getChunkCoords(position.x, position.z);
        const objects = [];

        for (let x = playerChunkX - chunkRadius; x <= playerChunkX + chunkRadius; x++) {
            for (let z = playerChunkZ - chunkRadius; z <= playerChunkZ + chunkRadius; z++) {
                const chunk = this.chunks.get(this.chunkKey(x, z));
                if (!chunk) continue;

                for (let i = 0; i < chunk.children.length; i++) {
                    objects.push(chunk.children[i]);
                }
            }
        }

        return objects;
    }

    getBlockPosition(block, instanceId = null) {
        if (!block) return null;

        if (block.isInstancedMesh) {
            const position = block.userData.instancePositions[instanceId];
            if (!position) return null;

            return {
                x: Math.round(block.userData.chunkBaseX + position.x),
                y: Math.round(position.y),
                z: Math.round(block.userData.chunkBaseZ + position.z)
            };
        }

        if (!block.parent) return null;
        return {
            x: Math.round(block.parent.position.x + block.position.x),
            y: Math.round(block.parent.position.y + block.position.y),
            z: Math.round(block.parent.position.z + block.position.z)
        };
    }

    getBlockPositionFromIntersection(intersection) {
        if (!intersection) return null;
        return this.getBlockPosition(intersection.object, intersection.instanceId);
    }

    removeBlock(block, instanceId = null) {
        const position = this.getBlockPosition(block, instanceId);
        if (!position) return false;

        return this.removeBlockAt(position.x, position.y, position.z);
    }

    addBlock(position, type) {
        const x = Math.round(position.x);
        const y = Math.round(position.y);
        const z = Math.round(position.z);
        const changed = this.setBlockData(x, y, z, type);

        if (!changed) return false;

        const { chunkX, chunkZ } = this.getChunkCoords(x, z);
        const centerKey = this.chunkKey(chunkX, chunkZ);
        this.rebuildChunkAndActiveNeighbors(chunkX, chunkZ, this.activeChunks.has(centerKey));

        return true;
    }

    loadBlocks(blocks) {
        const dirtyChunks = new Set();

        for (const key in blocks) {
            const block = blocks[key];
            const x = Math.round(block.x);
            const y = Math.round(block.y);
            const z = Math.round(block.z);
            if (!this.setBlockData(x, y, z, block.blockType)) continue;

            const { chunkX, chunkZ } = this.getChunkCoords(x, z);
            dirtyChunks.add(this.chunkKey(chunkX, chunkZ));
        }

        for (const key of dirtyChunks) {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            const includeCenter = this.activeChunks.has(key);
            this.rebuildChunkAndActiveNeighbors(chunkX, chunkZ, includeCenter);
        }
    }

    removeBlockAt(x, y, z) {
        const blockX = Math.round(x);
        const blockY = Math.round(y);
        const blockZ = Math.round(z);
        const changed = this.deleteBlockData(blockX, blockY, blockZ);

        if (!changed) return false;

        const { chunkX, chunkZ } = this.getChunkCoords(blockX, blockZ);
        const centerKey = this.chunkKey(chunkX, chunkZ);
        this.rebuildChunkAndActiveNeighbors(chunkX, chunkZ, this.activeChunks.has(centerKey));

        return true;
    }

    deleteBlockData(x, y, z) {
        const key = this.blockKey(x, y, z);
        if (!this.blockData.has(key)) return false;

        this.blockData.delete(key);
        this.solidBlocks.delete(key);

        const chunkKey = this.chunkKey(Math.floor(x / this.chunkSize), Math.floor(z / this.chunkSize));
        const blockKeys = this.chunkBlocks.get(chunkKey);
        if (blockKeys) {
            blockKeys.delete(key);
            if (blockKeys.size === 0 && !this.generatedChunks.has(chunkKey)) {
                this.chunkBlocks.delete(chunkKey);
            }
        }

        return true;
    }
}
