class WorldRenderer {
    constructor(scene) {
        this.scene = scene;
        this.chunks = new Map();
        this.chunkSize = 16;
        this.renderDistance = 4;
        
        this.geometry = new THREE.BoxGeometry(1, 1, 1);
        
        this.blockTypes = {
            grass: { color: 0x4a7c59, name: 'Grass' },
            dirt: { color: 0x5c4033, name: 'Dirt' },
            stone: { color: 0x3d3d3d, name: 'Stone' },
            wood: { color: 0x8B4513, name: 'Wood' },
            leaves: { color: 0x228B22, name: 'Leaves' },
            sand: { color: 0xC2B280, name: 'Sand' },
            water: { color: 0x3d85c6, transparent: true, opacity: 0.7 }
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
        chunk.position.set(
            chunkX * this.chunkSize,
            0,
            chunkZ * this.chunkSize
        );
        
        const seed = chunkX * 5741 + chunkZ * 28657;
        const pseudoRandom = (x, z) => {
            const n = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453;
            return n - Math.floor(n);
        };
        
        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                const height = Math.floor(pseudoRandom(x, z) * 4);
                
                for (let y = 0; y <= height; y++) {
                    const blockType = y === height ? 'grass' : (y === height - 1 ? 'dirt' : 'stone');
                    const block = this.createBlock(blockType);
                    block.position.set(x, y, z);
                    chunk.add(block);
                }
                
                if (height < 2) {
                    const waterBlock = this.createBlock('water');
                    waterBlock.position.set(x, 1.5, z);
                    chunk.add(waterBlock);
                }
            }
        }
        
        this.scene.add(chunk);
        this.chunks.set(key, chunk);
    }
    
    createBlock(type) {
        const blockDef = this.blockTypes[type];
        const material = new THREE.MeshLambertMaterial({ 
            color: blockDef.color,
            transparent: blockDef.transparent || false,
            opacity: blockDef.opacity || 1
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
            if (Math.abs(cx - playerChunkX) > this.renderDistance + 1 ||
                Math.abs(cz - playerChunkZ) > this.renderDistance + 1) {
                this.scene.remove(chunk);
                this.chunks.delete(key);
            }
        }
    }
    
    getAllBlocks() {
        const blocks = [];
        for (const chunk of this.chunks.values()) {
            for (const block of chunk.children) {
                if (block instanceof THREE.Mesh) {
                    blocks.push(block);
                }
            }
        }
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
        const localY = y;
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
