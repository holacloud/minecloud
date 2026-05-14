class WorldRenderer {
    constructor(scene) {
        this.scene = scene;
        this.chunks = new Map();
        this.chunkSize = 16;
        this.renderDistance = 6;
        
        this.geometry = new THREE.BoxGeometry(1, 1, 1);
        
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
    
    generateInitialChunks() {
        for (let x = -this.renderDistance; x <= this.renderDistance; x++) {
            for (let z = -this.renderDistance; z <= this.renderDistance; z++) {
                this.generateChunk(x, z);
            }
        }
    }
    
    generateChunk(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        if (this.chunks.has(key)) return;
        
        const chunk = new THREE.Group();
        chunk.position.set(chunkX * this.chunkSize, 0, chunkZ * this.chunkSize);
        
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
            
            return a * (1-ux) * (1-uz) + b * ux * (1-uz) + c * (1-ux) * uz + d * ux * uz;
        };
        
        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                const worldX = chunkX * this.chunkSize + x;
                const worldZ = chunkZ * this.chunkSize + z;
                
                let height = Math.floor(noise2D(worldX, worldZ) * 8) + 3;
                
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
                        if (sandHeight <= 0) {
                            blockType = 'grass';
                        } else {
                            blockType = 'sand';
                        }
                    }
                    
                    const block = this.createBlock(blockType);
                    block.position.set(x, y, z);
                    chunk.add(block);
                }
                
                const waterLevel = 2;
                if (height < waterLevel) {
                    for (let y = height + 1; y <= waterLevel; y++) {
                        const waterBlock = this.createBlock('water');
                        waterBlock.position.set(x, y, z);
                        chunk.add(waterBlock);
                    }
                }
                
                if (rand(worldX, worldZ, 999) < 0.01 && height >= 3) {
                    this.generateTree(chunk, x, height + 1, z);
                }
            }
        }
        
        this.scene.add(chunk);
        this.chunks.set(key, chunk);
    }
    
    generateTree(chunk, x, y, z) {
        const trunkHeight = 4 + Math.floor(Math.random() * 2);
        
        for (let ty = 0; ty < trunkHeight; ty++) {
            const wood = this.createBlock('wood');
            wood.position.set(x, y + ty, z);
            chunk.add(wood);
        }
        
        const leavesStart = y + trunkHeight - 2;
        for (let ly = 0; ly < 3; ly++) {
            const radius = ly === 2 ? 1 : 2;
            for (let lx = -radius; lx <= radius; lx++) {
                for (let lz = -radius; lz <= radius; lz++) {
                    if (lx === 0 && lz === 0 && ly < 2) continue;
                    if (Math.abs(lx) === 2 && Math.abs(lz) === 2) continue;
                    
                    const leaf = this.createBlock('leaves');
                    leaf.position.set(x + lx, leavesStart + ly, z + lz);
                    chunk.add(leaf);
                }
            }
        }
    }
    
    createBlock(type) {
        const def = this.blockTypes[type];
        if (!def) return null;
        
        const material = new THREE.MeshLambertMaterial({
            color: def.color,
            transparent: def.transparent || false,
            opacity: def.opacity || 1
        });
        
        const block = new THREE.Mesh(this.geometry, material);
        block.userData.blockType = type;
        return block;
    }
    
    update(playerX, playerZ) {
        const playerChunkX = Math.floor(playerX / this.chunkSize);
        const playerChunkZ = Math.floor(playerZ / this.chunkSize);
        
        for (let x = playerChunkX - this.renderDistance; x <= playerChunkX + this.renderDistance; x++) {
            for (let z = playerChunkZ - this.renderDistance; z <= playerChunkZ + this.renderDistance; z++) {
                this.generateChunk(x, z);
            }
        }
        
        for (const [key, chunk] of this.chunks) {
            const [cx, cz] = key.split(',').map(Number);
            if (Math.abs(cx - playerChunkX) > this.renderDistance + 2 ||
                Math.abs(cz - playerChunkZ) > this.renderDistance + 2) {
                this.scene.remove(chunk);
                this.chunks.delete(key);
            }
        }
    }
    
    getAllBlocks() {
        if (this._cacheValid) return this._cachedBlocks;
        
        const blocks = [];
        for (const chunk of this.chunks.values()) {
            const children = chunk.children;
            for (let i = 0; i < children.length; i++) {
                const block = children[i];
                if (block instanceof THREE.Mesh) {
                    blocks.push(block);
                }
            }
        }
        
        this._cachedBlocks = blocks;
        this._cacheValid = true;
        setTimeout(() => { this._cacheValid = false; }, 100);
        
        return blocks;
    }
    
    removeBlock(block) {
        if (block.parent) {
            block.parent.remove(block);
            block.geometry.dispose();
            block.material.dispose();
        }
    }
    
    addBlock(position, type) {
        const chunkX = Math.floor(position.x / this.chunkSize);
        const chunkZ = Math.floor(position.z / this.chunkSize);
        
        let chunk = this.chunks.get(`${chunkX},${chunkZ}`);
        if (!chunk) {
            chunk = new THREE.Group();
            chunk.position.set(chunkX * this.chunkSize, 0, chunkZ * this.chunkSize);
            this.scene.add(chunk);
            this.chunks.set(`${chunkX},${chunkZ}`, chunk);
        }
        
        const localX = Math.floor(position.x - chunk.position.x);
        const localY = Math.floor(position.y);
        const localZ = Math.floor(position.z - chunk.position.z);
        
        const block = this.createBlock(type);
        block.position.set(localX, localY, localZ);
        chunk.add(block);
        
        return block;
    }
    
    loadBlocks(blocks) {
        for (const key in blocks) {
            const block = blocks[key];
            this.addBlock({ x: block.x, y: block.y, z: block.z }, block.blockType);
        }
    }
    
    getBlockPosition(block) {
        if (!block.parent) return null;
        return {
            x: Math.round(block.parent.position.x + block.position.x),
            y: Math.round(block.parent.position.y + block.position.y),
            z: Math.round(block.parent.position.z + block.position.z)
        };
    }
    
    removeBlockAt(x, y, z) {
        const chunkX = Math.floor(x / this.chunkSize);
        const chunkZ = Math.floor(z / this.chunkSize);
        
        const chunk = this.chunks.get(`${chunkX},${chunkZ}`);
        if (!chunk) return;
        
        const localX = x - chunk.position.x;
        const localY = y - chunk.position.y;
        const localZ = z - chunk.position.z;
        
        for (const child of chunk.children) {
            if (child instanceof THREE.Mesh &&
                Math.round(child.position.x) === localX &&
                Math.round(child.position.y) === localY &&
                Math.round(child.position.z) === localZ) {
                this.removeBlock(child);
                return;
            }
        }
    }
}
