class WorldRenderer {
    constructor(scene) {
        this.scene = scene;
        this.chunks = new Map();
        this.chunkBlocks = new Map();
        this.generatedChunks = new Set();
        this.activeChunks = new Set();
        this.blockData = new Map();
        this.signTextByKey = new Map();
        this.signVotesByKey = new Map();
        this.solidBlocks = new Set();
        this.chunkSize = 16;
        this.renderDistance = 4;
        this.rtxModeEnabled = false;

        this.geometry = new THREE.BoxGeometry(1, 1, 1);
        this.waterSurfaceGeometry = new THREE.PlaneGeometry(1, 1);
        this.waterSurfaceGeometry.rotateX(-Math.PI / 2);
        this.materials = new Map();
        this.textures = new Map();
        this.iconCache = new Map();
        this.textureLoader = new THREE.TextureLoader();
        this.rtxAssetTextures = new Set(['grass', 'dirt', 'stone', 'sand', 'wood', 'planks', 'brick', 'glass', 'water', 'leaves']);
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
            tall_grass: { color: 0x76B54E, name: 'Tall Grass', transparent: true, breakDuration: 0.12, solid: false },
            flower_red: { color: 0xC94040, name: 'Red Flower', transparent: true, breakDuration: 0.1, solid: false },
            flower_yellow: { color: 0xD8C245, name: 'Yellow Flower', transparent: true, breakDuration: 0.1, solid: false },
            mushroom_red: { color: 0xB74B43, name: 'Red Mushroom', transparent: true, breakDuration: 0.08, solid: false },
            mushroom_brown: { color: 0x8A6541, name: 'Brown Mushroom', transparent: true, breakDuration: 0.08, solid: false },
            sand: { color: 0xE8D894, name: 'Sand', breakDuration: 0.4 },
            water: { color: 0x3D85C6, transparent: true, opacity: 0.7, fluid: true, breakDuration: 0.15 },
            bedrock: { color: 0x1A1A1A, name: 'Bedrock', unbreakable: true },
            coal_ore: { color: 0x808080, ore: 0x2D2D2D, name: 'Coal Ore', breakDuration: 1.05 },
            iron_ore: { color: 0x808080, ore: 0xB87E56, name: 'Iron Ore', breakDuration: 1.1 },
            gold_ore: { color: 0x808080, ore: 0xD4AF37, name: 'Gold Ore', breakDuration: 1.15 },
            brick: { color: 0xA03020, name: 'Brick', breakDuration: 0.85 },
            planks: { color: 0xC8A675, name: 'Oak Planks', breakDuration: 0.6 },
            bed: { color: 0xC05050, name: 'Bed', breakDuration: 0.55 },
            sign: { color: 0xB78A55, name: 'Sign', breakDuration: 0.35 },
            cactus: { color: 0x3F8D37, name: 'Cactus', breakDuration: 0.45 },
            glass: { color: 0xBFE8F5, name: 'Glass', transparent: true, opacity: 0.42, breakDuration: 0.22 },
            stone_bricks: { color: 0x8D8D8D, name: 'Stone Bricks', breakDuration: 1.05 },
            torch: { color: 0xE7B94B, name: 'Torch', transparent: true, breakDuration: 0.1, solid: false },
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
        this.iconCache.clear();

        for (const key of this.activeChunks) {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            this.rebuildChunk(chunkX, chunkZ);
        }
    }

    setRenderDistance(distance, playerPosition = null) {
        const nextDistance = Math.max(2, Math.min(7, Math.round(distance)));
        if (this.renderDistance === nextDistance) return;

        this.renderDistance = nextDistance;
        this.lastPlayerChunkX = null;
        this.lastPlayerChunkZ = null;

        if (playerPosition) {
            this.update(playerPosition.x, playerPosition.z);
        }
    }

    getAssetTexture(type) {
        const cacheKey = `asset:${type}`;
        let texture = this.textures.get(cacheKey);
        if (texture) return texture;

        texture = this.textureLoader.load(`textures/rtx/${type}.svg`);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = 4;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        if (THREE.sRGBEncoding) {
            texture.encoding = THREE.sRGBEncoding;
        }
        this.textures.set(cacheKey, texture);
        return texture;
    }

    getInventoryIconUrl(type) {
        const cacheKey = `${this.rtxModeEnabled ? 'rtx' : 'base'}:icon:${type}`;
        let icon = this.iconCache.get(cacheKey);
        if (icon) return icon;

        if (this.rtxModeEnabled && this.rtxAssetTextures.has(type)) {
            icon = `textures/rtx/${type}.svg`;
            this.iconCache.set(cacheKey, icon);
            return icon;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        this.paintTexture(ctx, type, canvas.width);
        icon = canvas.toDataURL();
        this.iconCache.set(cacheKey, icon);
        return icon;
    }

    wrapSignText(text, maxLineLength = 24, maxLines = 6) {
        const words = text.replace(/\r/g, '').split(/\s+/).filter(Boolean);
        const lines = [];
        let current = '';

        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length <= maxLineLength) {
                current = candidate;
                continue;
            }

            if (current) {
                lines.push(current);
            }

            if (word.length <= maxLineLength) {
                current = word;
            } else {
                for (let i = 0; i < word.length; i += maxLineLength) {
                    lines.push(word.slice(i, i + maxLineLength));
                    if (lines.length >= maxLines) {
                        return lines.slice(0, maxLines);
                    }
                }
                current = '';
            }

            if (lines.length >= maxLines) {
                return lines.slice(0, maxLines);
            }
        }

        if (current && lines.length < maxLines) {
            lines.push(current);
        }

        return lines.slice(0, maxLines);
    }

    createSignLabel(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(28, 18, 10, 0.88)';
        ctx.fillRect(22, 26, 468, 204);
        ctx.strokeStyle = 'rgba(238, 215, 171, 0.55)';
        ctx.lineWidth = 8;
        ctx.strokeRect(22, 26, 468, 204);
        ctx.fillStyle = '#f6e4bd';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const lines = this.wrapSignText(text, 26, 6);
        const startY = 64;
        lines.forEach((line, index) => {
            ctx.fillText(line, 256, startY + index * 30);
        });

        const texture = new THREE.CanvasTexture(canvas);
        if (THREE.sRGBEncoding) {
            texture.encoding = THREE.sRGBEncoding;
        }
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(1.6, 0.8, 1);
        sprite.renderOrder = 120;
        sprite.userData.isSignLabel = true;
        return sprite;
    }

    createTorchLight() {
        const light = new THREE.PointLight(0xffd38a, this.rtxModeEnabled ? 3.4 : 2.2, this.rtxModeEnabled ? 16 : 13, 2);
        light.castShadow = false;
        return light;
    }

    isSolidType(type) {
        const def = this.blockTypes[type];
        return def ? !def.fluid && def.solid !== false : false;
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
        const seed = type.length * 23;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let noise = this.textureNoise(x, y, seed);

                if (type === 'wood' || type === 'planks') {
                    noise = (noise * 0.38) + ((Math.sin((x / size) * Math.PI * 8) * 0.5 + 0.5) * 0.48) + ((y % 6) / 6) * 0.08;
                } else if (type === 'stone' || type === 'cobblestone' || type.endsWith('_ore')) {
                    noise = (noise * 0.55) + this.textureNoise(x * 0.7, y * 0.7, seed + 7) * 0.25 + this.textureNoise(x * 0.18, y * 0.18, seed + 17) * 0.2;
                } else if (type === 'grass' || type === 'leaves') {
                    noise = (noise * 0.46) + this.textureNoise(x * 1.2, y * 1.2, seed + 13) * 0.3 + ((1 - y / size) * 0.24);
                } else if (type === 'sand') {
                    noise = (noise * 0.5) + ((Math.sin((x / size) * Math.PI * 10 + y * 0.15) * 0.5 + 0.5) * 0.22) + this.textureNoise(x * 0.9, y * 0.9, seed + 31) * 0.28;
                } else if (type === 'brick' || type === 'stone_bricks') {
                    noise = (noise * 0.42) + ((x % 8) / 8) * 0.12 + ((y % 5) / 5) * 0.16 + this.textureNoise(x * 0.4, y * 0.4, seed + 21) * 0.3;
                } else if (type === 'glass') {
                    noise = 0.18 + this.textureNoise(x * 0.2, y * 0.2, seed + 11) * 0.08 + ((x + y) % 13) / 13 * 0.04;
                } else if (type === 'water') {
                    noise = 0.15 + this.textureNoise(x * 0.4, y * 0.4, seed + 19) * 0.1 + ((Math.sin((x + y) * 0.25) * 0.5 + 0.5) * 0.07);
                } else if (type === 'bed') {
                    noise = (y < size * 0.48 ? 0.45 : 0.72) + this.textureNoise(x * 0.6, y * 0.6, seed + 15) * 0.12;
                } else if (type === 'cactus') {
                    noise = (noise * 0.38) + ((x % 5) / 5) * 0.42 + ((y % 7) / 7) * 0.08;
                }

                const value = Math.max(0, Math.min(255, Math.round(noise * 255)));
                ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    applyRTXSurfaceDetail(ctx, type, size, seed) {
        const overlay = (strength, colorFn, threshold = 0.58, scale = 1.7) => {
            ctx.globalAlpha = strength;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const noise = this.textureNoise(x * scale, y * scale, seed + 101);
                    if (noise < threshold) continue;
                    ctx.fillStyle = colorFn(noise, x, y);
                    ctx.fillRect(x, y, 1, 1);
                }
            }
            ctx.globalAlpha = 1;
        };

        const linePass = (strength, spacing, colorFn, vertical = true, wave = 0) => {
            ctx.globalAlpha = strength;
            if (vertical) {
                for (let x = 0; x < size; x += spacing) {
                    for (let y = 0; y < size; y++) {
                        const xx = Math.max(0, Math.min(size - 1, Math.round(x + Math.sin(y * 0.18 + x * 0.07) * wave)));
                        ctx.fillStyle = colorFn(xx, y);
                        ctx.fillRect(xx, y, 1, 1);
                    }
                }
            } else {
                for (let y = 0; y < size; y += spacing) {
                    for (let x = 0; x < size; x++) {
                        const yy = Math.max(0, Math.min(size - 1, Math.round(y + Math.sin(x * 0.18 + y * 0.09) * wave)));
                        ctx.fillStyle = colorFn(x, yy);
                        ctx.fillRect(x, yy, 1, 1);
                    }
                }
            }
            ctx.globalAlpha = 1;
        };

        if (type === 'grass') {
            overlay(0.18, (_noise, _x, y) => y < size * 0.45 ? '#8fbe52' : '#4f7627', 0.48, 1.35);
            linePass(0.12, Math.max(2, Math.floor(size / 20)), (_x, _y) => '#5f8f30', false, 1);
        } else if (type === 'dirt' || type === 'sand') {
            if (type === 'sand') {
                overlay(0.16, (noise) => noise > 0.8 ? '#f3e6b0' : '#cdb46e', 0.5, 0.95);
                linePass(0.1, Math.max(3, Math.floor(size / 16)), (_x, _y) => '#dec98a', false, 1.4);
            } else {
                overlay(0.18, (noise) => noise > 0.8 ? '#a46d38' : '#5d3417', 0.54, 1.1);
            }
        } else if (type === 'stone' || type === 'cobblestone') {
            overlay(0.16, (noise) => noise > 0.82 ? '#bdbdbd' : '#4f4f4f', 0.52, 1);
            overlay(0.1, (noise, x, y) => (x + y) % 17 < 3 ? '#8d8d8d' : '#595959', 0.62, 0.55);
        } else if (type === 'wood' || type === 'planks') {
            overlay(0.14, (noise) => noise > 0.84 ? '#b8874d' : '#5f3d12', 0.55, 0.9);
            linePass(0.16, Math.max(3, Math.floor(size / 18)), (x, _y) => x % 14 < 2 ? '#4a2e12' : '#a06d34', true, 0.9);
        } else if (type === 'water') {
            overlay(0.1, (_noise, x, y) => ((x + y) % 13) < 4 ? '#cbe6ff' : '#275d93', 0.5, 0.7);
            linePass(0.07, Math.max(4, Math.floor(size / 14)), (_x, _y) => '#d8efff', false, 1.8);
        } else if (type === 'leaves') {
            overlay(0.18, (noise) => noise > 0.8 ? '#7fb656' : '#355c24', 0.5, 1.25);
        } else if (type === 'brick' || type === 'stone_bricks') {
            overlay(0.12, (noise) => noise > 0.82 ? '#d9cdb5' : '#5e5e5e', 0.58, 0.8);
            linePass(0.08, type === 'brick' ? Math.max(4, Math.floor(size / 12)) : Math.max(5, Math.floor(size / 11)), (_x, _y) => type === 'brick' ? '#5e2f27' : '#5d5d5d', false, 0);
        } else if (type === 'glass') {
            overlay(0.08, (_noise, x, y) => (x + y) % 21 < 2 ? '#ffffff' : '#9dd7f4', 0.64, 0.45);
            linePass(0.06, Math.max(7, Math.floor(size / 10)), (_x, _y) => '#dff7ff', true, 0);
        } else if (type === 'bed') {
            overlay(0.1, (_noise, _x, y) => y < size * 0.5 ? '#8a3030' : '#f4eee1', 0.56, 1);
        } else if (type === 'cactus') {
            linePass(0.18, Math.max(3, Math.floor(size / 16)), (_x, _y) => '#275f25', true, 0.2);
            overlay(0.08, (_noise) => '#82c469', 0.74, 0.8);
        } else {
            overlay(0.14, (noise) => noise > 0.82 ? '#f0e6d2' : '#2d2d2d', 0.58, 1);
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
            case 'tall_grass':
                ctx.fillStyle = 'rgba(0,0,0,0)';
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = '#74b64b';
                for (let i = 0; i < 7; i++) {
                    const px = 2 + i * 2;
                    const height = 6 + (i % 3) * 3;
                    ctx.fillRect(px, size - height, 2, height);
                }
                break;
            case 'flower_red':
                ctx.fillStyle = 'rgba(0,0,0,0)';
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = '#4d8f37';
                ctx.fillRect(size * 0.45, size * 0.35, size * 0.1, size * 0.65);
                ctx.fillStyle = '#cc4747';
                ctx.fillRect(size * 0.2, size * 0.08, size * 0.6, size * 0.24);
                ctx.fillRect(size * 0.36, 0, size * 0.28, size * 0.44);
                break;
            case 'flower_yellow':
                ctx.fillStyle = 'rgba(0,0,0,0)';
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = '#4d8f37';
                ctx.fillRect(size * 0.45, size * 0.35, size * 0.1, size * 0.65);
                ctx.fillStyle = '#e3cf5b';
                ctx.fillRect(size * 0.2, size * 0.08, size * 0.6, size * 0.24);
                ctx.fillRect(size * 0.36, 0, size * 0.28, size * 0.44);
                break;
            case 'mushroom_red':
                ctx.fillStyle = 'rgba(0,0,0,0)';
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = '#f4e7cf';
                ctx.fillRect(size * 0.43, size * 0.4, size * 0.14, size * 0.6);
                ctx.fillStyle = '#bf4a42';
                ctx.fillRect(size * 0.18, size * 0.08, size * 0.64, size * 0.34);
                ctx.fillStyle = '#f4e7cf';
                ctx.fillRect(size * 0.3, size * 0.18, size * 0.12, size * 0.08);
                ctx.fillRect(size * 0.58, size * 0.16, size * 0.1, size * 0.08);
                break;
            case 'mushroom_brown':
                ctx.fillStyle = 'rgba(0,0,0,0)';
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = '#f4e7cf';
                ctx.fillRect(size * 0.43, size * 0.4, size * 0.14, size * 0.6);
                ctx.fillStyle = '#8b6540';
                ctx.fillRect(size * 0.18, size * 0.08, size * 0.64, size * 0.34);
                break;
            case 'torch':
                ctx.fillStyle = 'rgba(0,0,0,0)';
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = '#6b4a2b';
                ctx.fillRect(size * 0.44, size * 0.28, size * 0.12, size * 0.7);
                ctx.fillStyle = '#f4c54d';
                ctx.fillRect(size * 0.34, size * 0.06, size * 0.32, size * 0.28);
                ctx.fillStyle = '#fff0a6';
                ctx.fillRect(size * 0.4, 0, size * 0.2, size * 0.12);
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
            case 'sign':
                ctx.fillStyle = this.shadeColor(0xC79A62, 0);
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = this.shadeColor(0x8A5E2F, 0);
                for (let y = 0; y < size; y += 5) {
                    ctx.fillRect(0, y, size, 1);
                }
                ctx.fillStyle = this.shadeColor(0x6D4820, 0);
                ctx.fillRect(size * 0.45, size * 0.65, size * 0.1, size * 0.35);
                ctx.fillStyle = this.shadeColor(0xEAD4AF, 0);
                ctx.fillRect(size * 0.14, size * 0.16, size * 0.72, size * 0.28);
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
        const textureSize = this.rtxModeEnabled ? 96 : 16;
        canvas.width = textureSize;
        canvas.height = textureSize;

        const ctx = canvas.getContext('2d');
        if (kind === 'height') {
            this.paintHeightTexture(ctx, type, canvas.width);
        } else if (this.rtxModeEnabled && kind === 'albedo' && this.rtxAssetTextures.has(type)) {
            return this.getAssetTexture(type);
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
            case 'tall_grass': return { roughness: 0.95, metalness: 0.01, bumpScale: 0.03, envMapIntensity: 0.18 };
            case 'flower_red':
            case 'flower_yellow':
            case 'mushroom_red':
            case 'mushroom_brown':
            case 'torch':
                return { roughness: 0.9, metalness: 0.01, bumpScale: 0.02, envMapIntensity: 0.16 };
            case 'dirt': return { roughness: 0.97, metalness: 0.01, bumpScale: 0.1, envMapIntensity: 0.2 };
            case 'sand': return { roughness: 0.95, metalness: 0.01, bumpScale: 0.06, envMapIntensity: 0.28 };
            case 'stone': return { roughness: 0.82, metalness: 0.05, bumpScale: 0.12, envMapIntensity: 0.45 };
            case 'stone_bricks': return { roughness: 0.8, metalness: 0.05, bumpScale: 0.12, envMapIntensity: 0.46 };
            case 'cobblestone': return { roughness: 0.84, metalness: 0.06, bumpScale: 0.15, envMapIntensity: 0.42 };
            case 'wood': return { roughness: 0.8, metalness: 0.02, bumpScale: 0.09, envMapIntensity: 0.3 };
            case 'planks': return { roughness: 0.74, metalness: 0.02, bumpScale: 0.07, envMapIntensity: 0.34 };
            case 'bed': return { roughness: 0.78, metalness: 0.01, bumpScale: 0.04, envMapIntensity: 0.25 };
            case 'sign': return { roughness: 0.8, metalness: 0.01, bumpScale: 0.06, envMapIntensity: 0.2 };
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
        const alphaCutoutTypes = new Set(['leaves', 'tall_grass', 'flower_red', 'flower_yellow', 'mushroom_red', 'mushroom_brown', 'torch']);
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
                alphaTest: alphaCutoutTypes.has(type) ? 0.28 : 0,
                depthWrite: !def.transparent || alphaCutoutTypes.has(type)
            });
        } else {
            material = new THREE.MeshLambertMaterial({
                color: 0xFFFFFF,
                map: this.getTexture(type, 'albedo'),
                transparent: def.transparent || false,
                opacity: def.opacity || 1,
                alphaTest: alphaCutoutTypes.has(type) ? 0.35 : 0,
                depthWrite: !def.transparent || alphaCutoutTypes.has(type)
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
                const waterLevel = 5;
                const lakeNoise = noise2D(worldX - 620, worldZ + 910, 0.022);

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

                if (biome !== 'rocky' && lakeNoise > 0.68) {
                    const lakeDepth = 1 + Math.floor((lakeNoise - 0.68) * 18);
                    height = Math.min(height, waterLevel - lakeDepth);
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

                if (height < waterLevel) {
                    for (let y = height + 1; y <= waterLevel; y++) {
                        this.setBlockData(worldX, y, worldZ, 'water', key);
                    }
                }

                const treeChance = biome === 'forest' ? 0.032 : biome === 'plains' ? 0.012 : biome === 'rocky' ? 0.0025 : 0;
                const cactusChance = biome === 'desert' ? 0.022 : 0;
                const decorRoll = rand(worldX, worldZ, 2048);

                if (treeChance > 0 && rand(worldX, worldZ, 999) < treeChance && height >= 3) {
                    this.generateTree(worldX, height + 1, worldZ, rand);
                } else if (cactusChance > 0 && rand(worldX, worldZ, 1499) < cactusChance && height >= 2) {
                    this.generateCactus(worldX, height + 1, worldZ, rand);
                } else if (biome === 'forest' && decorRoll < 0.06) {
                    const plantType = decorRoll < 0.02 ? 'mushroom_red' : decorRoll < 0.035 ? 'mushroom_brown' : decorRoll < 0.048 ? 'flower_red' : decorRoll < 0.055 ? 'flower_yellow' : 'tall_grass';
                    this.generateDecorPlant(worldX, height + 1, worldZ, plantType);
                } else if (biome === 'plains' && decorRoll < 0.08) {
                    const plantType = decorRoll < 0.02 ? 'flower_red' : decorRoll < 0.038 ? 'flower_yellow' : 'tall_grass';
                    this.generateDecorPlant(worldX, height + 1, worldZ, plantType);
                } else if (biome === 'rocky' && decorRoll < 0.018) {
                    this.generateDecorPlant(worldX, height + 1, worldZ, rand(worldX, worldZ, 1888) < 0.5 ? 'mushroom_brown' : 'tall_grass');
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

    generateDecorPlant(x, y, z, type) {
        this.setBlockData(x, y, z, type);
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
            if (child.material) {
                if (child.material.map) {
                    child.material.map.dispose();
                }
                if (typeof child.material.dispose === 'function') {
                    child.material.dispose();
                }
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
        const waterSurfacePositions = [];

        for (const blockKey of blockKeys) {
            const type = this.blockData.get(blockKey);
            if (!type) continue;

            const { x, y, z } = this.parseBlockKey(blockKey);
            if (type === 'water') {
                const aboveType = this.blockData.get(this.blockKey(x, y + 1, z));
                if (aboveType !== 'water') {
                    waterSurfacePositions.push({ x: x - baseX, y: y + 0.5, z: z - baseZ });
                }
                continue;
            }
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

        if (waterSurfacePositions.length > 0) {
            const waterMesh = new THREE.InstancedMesh(this.waterSurfaceGeometry, this.getMaterial('water'), waterSurfacePositions.length);
            waterMesh.userData.blockType = 'water';
            waterMesh.userData.instancePositions = waterSurfacePositions;
            waterMesh.userData.chunkBaseX = baseX;
            waterMesh.userData.chunkBaseZ = baseZ;
            waterMesh.matrixAutoUpdate = false;
            for (let i = 0; i < waterSurfacePositions.length; i++) {
                const position = waterSurfacePositions[i];
                this.tempMatrix.makeTranslation(position.x + 0.5, position.y, position.z + 0.5);
                waterMesh.setMatrixAt(i, this.tempMatrix);
            }
            waterMesh.instanceMatrix.needsUpdate = true;
            chunk.add(waterMesh);
        }

        for (const blockKey of blockKeys) {
            const type = this.blockData.get(blockKey);
            const { x, y, z } = this.parseBlockKey(blockKey);

            if (type === 'sign') {
                const text = this.signTextByKey.get(blockKey);
                if (text) {
                    const sprite = this.createSignLabel(text);
                    sprite.position.set(x - baseX + 0.5, y + 1.15, z - baseZ + 0.5);
                    chunk.add(sprite);
                }
            }

            if (type === 'torch') {
                const torchLight = this.createTorchLight();
                torchLight.position.set(x - baseX + 0.5, y + 0.9, z - baseZ + 0.5);
                chunk.add(torchLight);
            }
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

    getSignTextAt(x, y, z) {
        return this.signTextByKey.get(this.blockKey(Math.round(x), Math.round(y), Math.round(z))) || '';
    }

    getSignVotesAt(x, y, z) {
        return this.signVotesByKey.get(this.blockKey(Math.round(x), Math.round(y), Math.round(z))) || { thumbup: 0, thumbdown: 0, heart: 0, happy: 0, star: 0 };
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
                    const child = chunk.children[i];
                    if (child.isInstancedMesh) {
                        objects.push(child);
                    }
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
        const payload = type === undefined && position.blockType ? position : { ...position, blockType: type };
        const x = Math.round(payload.x);
        const y = Math.round(payload.y);
        const z = Math.round(payload.z);
        const changed = this.setBlockData(x, y, z, payload.blockType);
        const key = this.blockKey(x, y, z);
        if (payload.blockType === 'sign' && Object.prototype.hasOwnProperty.call(payload, 'text')) {
            this.signTextByKey.set(key, payload.text || '');
            this.signVotesByKey.set(key, payload.votes || { thumbup: 0, thumbdown: 0, heart: 0, happy: 0, star: 0 });
        } else if (payload.blockType === 'sign' && payload.votes) {
            this.signVotesByKey.set(key, payload.votes);
        } else {
            this.signTextByKey.delete(key);
            this.signVotesByKey.delete(key);
        }

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

            const blockKey = this.blockKey(x, y, z);
            if (block.blockType === 'sign' && block.text) {
                this.signTextByKey.set(blockKey, block.text);
                this.signVotesByKey.set(blockKey, block.votes || { thumbup: 0, thumbdown: 0, heart: 0, happy: 0, star: 0 });
            } else {
                this.signTextByKey.delete(blockKey);
                this.signVotesByKey.delete(blockKey);
            }

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
        this.signTextByKey.delete(key);
        this.signVotesByKey.delete(key);
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
