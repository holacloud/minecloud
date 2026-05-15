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
        this.rtxModeEnabled = false;

        this.geometry = new THREE.BoxGeometry(1, 1, 1);
        this.materials = new Map();
        this.textures = new Map();
        this.tempMatrix = new THREE.Matrix4();

        this.lastPlayerChunkX = null;
        this.lastPlayerChunkZ = null;

        this.blockTypes = {
            air: { color: 0x000000, name: 'Air', breakDuration: 0 },
            grass: { color: 0x5B8C35, name: 'Grass Block', top: 0x5B8C35, side: 0x8B5A2B, bottom: 0x5B8C35, breakDuration: 0.35 },
            dirt: { color: 0x8B5A2B, name: 'Dirt', breakDuration: 0.45 },
            stone: { color: 0x808080, name: 'Stone', breakDuration: 0.9 },
            cobblestone: { color: 0x6E6E6E, name: 'Cobblestone', breakDuration: 1 },
            wood: { color: 0x8B6914, name: 'Oak Wood', breakDuration: 0.8 },
            leaves: { color: 0x4E8F36, name: 'Oak Leaves', transparent: true, breakDuration: 0.2 },
            sand: { color: 0xE8D894, name: 'Sand', breakDuration: 0.4 },
            water: { color: 0x3D85C6, transparent: true, opacity: 0.7, fluid: true, breakDuration: 0.15 },
            bedrock: { color: 0x1A1A1A, name: 'Bedrock', unbreakable: true },
            coal_ore: { color: 0x808080, ore: 0x2D2D2D, name: 'Coal Ore', breakDuration: 1.05 },
            iron_ore: { color: 0x808080, ore: 0xB87E56, name: 'Iron Ore', breakDuration: 1.1 },
            gold_ore: { color: 0x808080, ore: 0xD4AF37, name: 'Gold Ore', breakDuration: 1.15 },
            brick: { color: 0xA03020, name: 'Brick', breakDuration: 0.85 },
            planks: { color: 0xC8A675, name: 'Oak Planks', breakDuration: 0.6 },
            bed: { color: 0xC05050, name: 'Bed', breakDuration: 0.55 },
            cactus: { color: 0x3F8D37, name: 'Cactus', breakDuration: 0.45 },
            glass: { color: 0xBFE8F5, name: 'Glass', transparent: true, opacity: 0.42, breakDuration: 0.22 },
            stone_bricks: { color: 0x8D8D8D, name: 'Stone Bricks', breakDuration: 1.05 },
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

    disposeCache(cache) {
        for (const value of cache.values()) {
            if (value && typeof value.dispose === 'function') {
                value.dispose();
            }
        }
        cache.clear();
    }

    setRTXMode(enabled) {
        if (this.rtxModeEnabled === enabled) return;

        this.rtxModeEnabled = enabled;
        this.disposeCache(this.materials);
        this.disposeCache(this.textures);

        for (const key of this.activeChunks) {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            this.rebuildChunk(chunkX, chunkZ);
        }
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

    paintHeightTexture(ctx, type, size) {
        const def = this.blockTypes[type];
        const seed = type.length * 23;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let noise = this.textureNoise(x, y, seed);

                if (type === 'wood' || type === 'planks') {
                    noise = (noise * 0.55) + ((x % 8) / 8) * 0.45;
                } else if (type === 'stone' || type === 'cobblestone' || type.endsWith('_ore')) {
                    noise = (noise * 0.75) + this.textureNoise(x * 0.7, y * 0.7, seed + 7) * 0.25;
                } else if (type === 'grass' || type === 'leaves') {
                    noise = (noise * 0.65) + this.textureNoise(x * 1.2, y * 1.2, seed + 13) * 0.35;
                } else if (type === 'water') {
                    noise = 0.2 + this.textureNoise(x * 0.4, y * 0.4, seed + 19) * 0.12;
                }

                const value = Math.max(0, Math.min(255, Math.round(noise * 255)));
                ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    applyRTXSurfaceDetail(ctx, type, size, seed) {
        const overlay = (strength, colorFn) => {
            ctx.globalAlpha = strength;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const noise = this.textureNoise(x * 1.7, y * 1.7, seed + 101);
                    if (noise < 0.58) continue;
                    ctx.fillStyle = colorFn(noise, x, y);
                    ctx.fillRect(x, y, 1, 1);
                }
            }
            ctx.globalAlpha = 1;
        };

        if (type === 'grass') {
            overlay(0.28, (noise) => noise > 0.82 ? '#78a843' : '#487122');
        } else if (type === 'dirt' || type === 'sand') {
            overlay(0.24, (noise) => noise > 0.82 ? '#d8c087' : '#6d421d');
        } else if (type === 'stone' || type === 'cobblestone') {
            overlay(0.22, (noise) => noise > 0.84 ? '#b7b7b7' : '#4c4c4c');
        } else if (type === 'wood' || type === 'planks') {
            overlay(0.26, (noise, x) => (x % 11) < 2 || noise > 0.85 ? '#a87a34' : '#5c3d12');
        } else if (type === 'water') {
            overlay(0.16, (_noise, x, y) => ((x + y) % 9) < 3 ? '#b9ddff' : '#2d6ca2');
        } else if (type === 'leaves') {
            overlay(0.22, (noise) => noise > 0.8 ? '#77b24f' : '#365f22');
        } else {
            overlay(0.18, (noise) => noise > 0.82 ? '#f0e6d2' : '#2d2d2d');
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
            case 'cactus':
                this.paintPaletteTexture(ctx, size, [0x2F6E29, 0x3A7E31, 0x3F8D37, 0x5AA34A], seed);
                ctx.fillStyle = this.shadeColor(0x2A5D25, 0);
                for (let x = 1; x < size; x += 4) {
                    ctx.fillRect(x, 0, 1, size);
                }
                ctx.fillStyle = this.shadeColor(0x7DBD63, 0);
                for (let y = 1; y < size; y += 5) {
                    ctx.fillRect(0, y, size, 1);
                }
                break;
            case 'bed':
                ctx.fillStyle = this.shadeColor(0xEEE7D2, 0);
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = this.shadeColor(0xC05050, 0);
                ctx.fillRect(0, 0, size, size * 0.48);
                ctx.fillStyle = this.shadeColor(0x6B3F21, 0);
                ctx.fillRect(0, size * 0.7, size, size * 0.18);
                ctx.fillStyle = this.shadeColor(0x8B5A2B, 0);
                ctx.fillRect(0, size * 0.52, size, size * 0.14);
                ctx.fillStyle = this.shadeColor(0xFFF6E0, 0);
                ctx.fillRect(size * 0.1, size * 0.08, size * 0.3, size * 0.18);
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
            case 'stone_bricks':
                ctx.fillStyle = this.shadeColor(0x7B7B7B, 0);
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = this.shadeColor(0x999999, 0);
                for (let y = 1; y < size; y += 5) {
                    const offset = (Math.floor(y / 5) % 2) * 4;
                    for (let x = -offset; x < size; x += 8) {
                        ctx.fillRect(x + 1, y, 7, 4);
                    }
                }
                ctx.fillStyle = this.shadeColor(0x666666, 0);
                for (let y = 0; y < size; y += 5) {
                    ctx.fillRect(0, y, size, 1);
                }
                for (let x = 0; x < size; x += 8) {
                    ctx.fillRect(x, 0, 1, size);
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
            case 'glass':
                ctx.fillStyle = 'rgba(195, 235, 247, 0.38)';
                ctx.fillRect(0, 0, size, size);
                ctx.strokeStyle = 'rgba(230, 250, 255, 0.45)';
                ctx.lineWidth = Math.max(1, size / 18);
                ctx.strokeRect(1, 1, size - 2, size - 2);
                ctx.strokeRect(size * 0.25, size * 0.25, size * 0.5, size * 0.5);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
                ctx.fillRect(size * 0.16, size * 0.12, size * 0.22, size * 0.6);
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

        if (this.rtxModeEnabled) {
            this.applyRTXSurfaceDetail(ctx, type, size, seed);
        }
    }

    getTexture(type, kind = 'albedo') {
        const cacheKey = `${this.rtxModeEnabled ? 'rtx' : 'base'}:${kind}:${type}`;
        let texture = this.textures.get(cacheKey);
        if (texture) return texture;

        const canvas = document.createElement('canvas');
        const textureSize = this.rtxModeEnabled ? 64 : 16;
        canvas.width = textureSize;
        canvas.height = textureSize;

        const ctx = canvas.getContext('2d');
        if (kind === 'height') {
            this.paintHeightTexture(ctx, type, canvas.width);
        } else {
            this.paintTexture(ctx, type, canvas.width);
        }

        texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = this.rtxModeEnabled ? THREE.LinearFilter : THREE.NearestFilter;
        texture.minFilter = this.rtxModeEnabled ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
        texture.generateMipmaps = this.rtxModeEnabled;

        if (kind === 'albedo' && THREE.sRGBEncoding) {
            texture.encoding = THREE.sRGBEncoding;
        }

        texture.needsUpdate = true;
        this.textures.set(cacheKey, texture);
        return texture;
    }

    getRTXMaterialProps(type) {
        switch (type) {
            case 'grass': return { roughness: 0.92, metalness: 0.02, bumpScale: 0.08, envMapIntensity: 0.35 };
            case 'dirt': return { roughness: 0.97, metalness: 0.01, bumpScale: 0.1, envMapIntensity: 0.2 };
            case 'sand': return { roughness: 0.95, metalness: 0.01, bumpScale: 0.06, envMapIntensity: 0.28 };
            case 'stone': return { roughness: 0.82, metalness: 0.05, bumpScale: 0.12, envMapIntensity: 0.45 };
            case 'stone_bricks': return { roughness: 0.8, metalness: 0.05, bumpScale: 0.12, envMapIntensity: 0.46 };
            case 'cobblestone': return { roughness: 0.84, metalness: 0.06, bumpScale: 0.15, envMapIntensity: 0.42 };
            case 'wood': return { roughness: 0.8, metalness: 0.02, bumpScale: 0.09, envMapIntensity: 0.3 };
            case 'planks': return { roughness: 0.74, metalness: 0.02, bumpScale: 0.07, envMapIntensity: 0.34 };
            case 'bed': return { roughness: 0.78, metalness: 0.01, bumpScale: 0.04, envMapIntensity: 0.25 };
            case 'cactus': return { roughness: 0.88, metalness: 0.01, bumpScale: 0.08, envMapIntensity: 0.22 };
            case 'brick': return { roughness: 0.87, metalness: 0.03, bumpScale: 0.09, envMapIntensity: 0.25 };
            case 'glass': return { roughness: 0.14, metalness: 0.08, bumpScale: 0.01, envMapIntensity: 1.05 };
            case 'coal_ore': return { roughness: 0.7, metalness: 0.12, bumpScale: 0.14, envMapIntensity: 0.55 };
            case 'iron_ore': return { roughness: 0.64, metalness: 0.16, bumpScale: 0.14, envMapIntensity: 0.62 };
            case 'gold_ore': return { roughness: 0.5, metalness: 0.32, bumpScale: 0.14, envMapIntensity: 0.8 };
            case 'leaves': return { roughness: 0.94, metalness: 0.01, bumpScale: 0.04, envMapIntensity: 0.18 };
            case 'water': return { roughness: 0.08, metalness: 0.12, bumpScale: 0.02, envMapIntensity: 1.15, emissive: 0x103050 };
            default: return { roughness: 0.86, metalness: 0.03, bumpScale: 0.07, envMapIntensity: 0.28 };
        }
    }

    getMaterial(type) {
        let material = this.materials.get(type);
        if (material) return material;

        const def = this.blockTypes[type];
        if (this.rtxModeEnabled) {
            const props = this.getRTXMaterialProps(type);
            material = new THREE.MeshStandardMaterial({
                color: 0xFFFFFF,
                map: this.getTexture(type, 'albedo'),
                bumpMap: this.getTexture(type, 'height'),
                bumpScale: props.bumpScale,
                roughness: props.roughness,
                metalness: props.metalness,
                envMapIntensity: props.envMapIntensity,
                emissive: props.emissive || 0x000000,
                transparent: def.transparent || false,
                opacity: def.opacity || 1,
                alphaTest: type === 'leaves' ? 0.28 : 0,
                depthWrite: !def.transparent || type === 'leaves'
            });
        } else {
            material = new THREE.MeshLambertMaterial({
                color: 0xFFFFFF,
                map: this.getTexture(type, 'albedo'),
                transparent: def.transparent || false,
                opacity: def.opacity || 1,
                alphaTest: type === 'leaves' ? 0.35 : 0,
                depthWrite: !def.transparent || type === 'leaves'
            });
        }

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

        const getBiomeAt = (worldX, worldZ) => {
            const biomeNoise = noise2D(worldX + 420, worldZ - 310, 0.018);
            const forestNoise = noise2D(worldX - 180, worldZ + 250, 0.03);

            if (biomeNoise < 0.3) return 'desert';
            if (biomeNoise > 0.72) return 'rocky';
            if (forestNoise > 0.58) return 'forest';
            return 'plains';
        };

        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                const worldX = chunkX * this.chunkSize + x;
                const worldZ = chunkZ * this.chunkSize + z;
                const biome = getBiomeAt(worldX, worldZ);

                let height;
                if (biome === 'desert') {
                    height = Math.floor(noise2D(worldX, worldZ) * 5) + 2;
                } else if (biome === 'rocky') {
                    height = Math.floor(noise2D(worldX, worldZ) * 10) + 4;
                } else if (biome === 'forest') {
                    height = Math.floor(noise2D(worldX, worldZ) * 7) + 3;
                } else {
                    height = Math.floor(noise2D(worldX, worldZ) * 8) + 3;
                }

                for (let y = -5; y <= height; y++) {
                    let blockType;
                    if (y === -5) {
                        blockType = 'bedrock';
                    } else if (y < height - 3 || (biome === 'rocky' && y < height - 1)) {
                        const oreRand = rand(worldX, worldZ, y * 100);
                        if (oreRand < 0.02) blockType = 'coal_ore';
                        else if (oreRand < 0.025) blockType = 'iron_ore';
                        else if (oreRand < 0.026) blockType = 'gold_ore';
                        else blockType = 'stone';
                    } else if (biome === 'desert' && y >= height - 2) {
                        blockType = 'sand';
                    } else if (biome === 'rocky' && y === height) {
                        blockType = rand(worldX, worldZ, 1700) < 0.65 ? 'stone' : 'cobblestone';
                    } else if (y < height) {
                        blockType = 'dirt';
                    } else {
                        if (biome === 'desert') {
                            blockType = 'sand';
                        } else if (biome === 'rocky') {
                            blockType = rand(worldX, worldZ, 2200) < 0.2 ? 'cobblestone' : 'stone';
                        } else {
                            const sandHeight = Math.floor(noise2D(worldX + 100, worldZ + 100, 0.1) * 3);
                            blockType = sandHeight <= 0 ? 'grass' : 'sand';
                        }
                    }

                    this.setBlockData(worldX, y, worldZ, blockType, key);
                }

                const waterLevel = 2;
                if (height < waterLevel) {
                    for (let y = height + 1; y <= waterLevel; y++) {
                        this.setBlockData(worldX, y, worldZ, 'water', key);
                    }
                }

                const treeChance = biome === 'forest' ? 0.032 : biome === 'plains' ? 0.012 : biome === 'rocky' ? 0.0025 : 0;
                const cactusChance = biome === 'desert' ? 0.022 : 0;

                if (treeChance > 0 && rand(worldX, worldZ, 999) < treeChance && height >= 3) {
                    this.generateTree(worldX, height + 1, worldZ, rand);
                } else if (cactusChance > 0 && rand(worldX, worldZ, 1499) < cactusChance && height >= 2) {
                    this.generateCactus(worldX, height + 1, worldZ, rand);
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

    generateCactus(x, y, z, rand) {
        const cactusHeight = 2 + Math.floor(rand(x, z, 3030) * 3);
        for (let cy = 0; cy < cactusHeight; cy++) {
            this.setBlockData(x, y + cy, z, 'cactus');
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
            mesh.castShadow = this.rtxModeEnabled && type !== 'water';
            mesh.receiveShadow = this.rtxModeEnabled;

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

    getBlockTypeAt(x, y, z) {
        return this.blockData.get(this.blockKey(Math.round(x), Math.round(y), Math.round(z))) || null;
    }

    getBreakDurationForType(type) {
        if (!type) return null;

        const def = this.blockTypes[type];
        if (!def || def.unbreakable) return null;

        return def.breakDuration ?? 0.5;
    }

    getBlockColorForType(type) {
        const def = this.blockTypes[type];
        return def ? def.color : 0xFFFFFF;
    }

    getDropTypeForBlock(type) {
        switch (type) {
            case 'stone': return 'cobblestone';
            case 'water':
            case 'bedrock':
            case 'air':
                return null;
            default:
                return type;
        }
    }

    createDisplayMesh(type, scale = 0.36) {
        const material = this.getMaterial(type).clone();
        const mesh = new THREE.Mesh(this.geometry, material);
        mesh.scale.setScalar(scale);
        mesh.castShadow = this.rtxModeEnabled && type !== 'water';
        mesh.receiveShadow = this.rtxModeEnabled;
        mesh.userData.blockType = type;
        return mesh;
    }

    getBreakDurationAt(x, y, z) {
        return this.getBreakDurationForType(this.getBlockTypeAt(x, y, z));
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
