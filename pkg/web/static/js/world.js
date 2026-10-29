class WorldRenderer {
    constructor(scene) {
        this.scene = scene;
        this.chunks = new Map();
        // Generated terrain, one typed column per chunk. Columns far from the player are
        // dropped and regenerated on demand; player edits live separately in `edits`.
        this.columns = new Map();
        // chunkKey -> Map<column index, block id> (AIR_ID records a removal).
        this.edits = new Map();
        this.generatedChunks = new Set();
        this.chunkBiomes = new Map();
        this.activeChunks = new Set();
        this.signTextByKey = new Map();
        this.signVotesByKey = new Map();
        this.soundBlockStateByKey = new Map();
        this.ladderFacingByKey = new Map();
        this.sprayPaintsByKey = new Map();
        this.chunkSize = CHUNK_SIZE;
        this.renderDistance = 4;
        this.rtxModeEnabled = false;
        // Ultra builds on RTX: larger textures, roughness maps, wind and animated water.
        this.ultraModeEnabled = false;
        this.windUniforms = { windTime: { value: 0 }, windStrength: { value: 0 } };
        // Expanding water rings (x, z, start time, strength), newest overwrite the oldest.
        this.rippleUniforms = { ripples: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -100, 0)) } };
        this.nextRipple = 0;

        this.geometry = new THREE.BoxGeometry(1, 1, 1);
        this.cutoutGeometries = new Map();
        this.materials = new Map();
        // Variants of the block materials that multiply in per-vertex ambient occlusion.
        this.chunkMaterials = new Map();
        this.mesher = new ChunkMesher(this);
        // Chunks waiting to be (re)meshed, drained a few per frame nearest-first.
        this.rebuildQueue = new Set();
        this.rebuildBudgetMs = 6;
        // 0 = torch light invisible (bright day) .. 1 = full strength (night, caves).
        this.blockLightStrength = { value: 0.6 };
        // The torch held by the local player, applied to terrain like placed torches.
        this.heldLightPosition = { value: new THREE.Vector3() };
        this.heldLightStrength = { value: 0 };
        this.hiddenBlock = null;
        this.textures = new Map();
        this.iconCache = new Map();
        this.textureFactory = new BlockTextureFactory();

        this.lastPlayerChunkX = null;
        this.lastPlayerChunkZ = null;

        // Terrain comes from the server: chunks are requested through `chunkSource`
        // (set by the game once the network exists) and decoded off the main thread.
        this.chunkSource = null;
        this.generatingChunks = new Set();
        this.chunkRequestBatch = [];
        this.chunkProcessQueue = [];
        this.isProcessingChunks = false;

        this.chunkDecoder = new Worker('/js/chunkDecoder.js');
        this.chunkDecoder.onmessage = (e) => {
            this.chunkProcessQueue.push(e.data);
            this.processNextChunk();
        };

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
            sound_block: { color: 0x6A4CC2, name: 'Sound Block', breakDuration: 0.55 },
            spray_paint: { color: 0xFF3BD5, name: 'Spray Paint', breakDuration: 0, solid: false },
            ladder: { color: 0xB98548, name: 'Ladder', transparent: true, breakDuration: 0.25, solid: false },
        };
        this.registerExpansionBlockTypes();
        this.registry = new BlockRegistry(this.blockTypes);
        this.chunkDecoder.postMessage({ type: 'init', ids: this.registry.ids });
        // Chunks are requested by update() around the player's actual position.
    }

    registerExpansionBlockTypes() {
        const colors = {
            white: 0xF4F4F0, orange: 0xE88932, magenta: 0xC653C9, light_blue: 0x67A9E8,
            yellow: 0xE6D64C, lime: 0x72C54B, pink: 0xEA7AAE, gray: 0x555B63,
            light_gray: 0xA8ADB2, cyan: 0x2EA7B8, purple: 0x7E4CC2, blue: 0x3558B8,
            brown: 0x7A4A2A, green: 0x3E8A3D, red: 0xB93A32, black: 0x17191D
        };
        const labels = {
            white: 'White', orange: 'Orange', magenta: 'Magenta', light_blue: 'Light Blue', yellow: 'Yellow', lime: 'Lime',
            pink: 'Pink', gray: 'Gray', light_gray: 'Light Gray', cyan: 'Cyan', purple: 'Purple', blue: 'Blue', brown: 'Brown',
            green: 'Green', red: 'Red', black: 'Black'
        };

        for (const [key, color] of Object.entries(colors)) {
            this.blockTypes[`${key}_brick`] = { color, name: `${labels[key]} Brick`, breakDuration: 0.85, category: 'stone' };
            this.blockTypes[`${key}_wool`] = { color, name: `${labels[key]} Wool`, breakDuration: 0.35, category: 'wool' };
        }

        const woods = {
            spruce: [0x5B3B24, 'Spruce'], birch: [0xD8C48F, 'Birch'], jungle: [0xA7673A, 'Jungle'],
            acacia: [0xB85F33, 'Acacia'], dark_oak: [0x3F2818, 'Dark Oak'], cherry: [0xE6A0B6, 'Cherry'],
            maple: [0xC47A2C, 'Maple'], willow: [0x8FA85A, 'Willow']
        };
        for (const [key, [color, label]] of Object.entries(woods)) {
            this.blockTypes[`${key}_wood`] = { color, name: `${label} Wood`, breakDuration: 0.8, category: 'wood' };
            this.blockTypes[`${key}_planks`] = { color: this.lightenHex(color, 0x222222), name: `${label} Planks`, breakDuration: 0.6, category: 'wood' };
            this.blockTypes[`${key}_leaves`] = { color: key === 'cherry' ? 0xEAA3BE : key === 'willow' ? 0x7EA84E : 0x4E8F36, name: `${label} Leaves`, transparent: true, breakDuration: 0.2, category: 'leaves' };
            this.blockTypes[`${key}_sapling`] = { color: this.lightenHex(color, 0x333333), name: `${label} Sapling`, transparent: true, breakDuration: 0.1, solid: false, itemOnly: true, saplingWood: `${key}_wood`, saplingLeaves: `${key}_leaves` };
        }

        const slabSources = ['stone', 'cobblestone', 'brick', 'stone_bricks', 'planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks', 'cherry_planks', 'maple_planks', 'willow_planks'];
        for (const source of slabSources) {
            const def = this.blockTypes[source];
            if (!def) continue;
            this.blockTypes[`${source}_slab`] = { color: def.color, name: `${def.name} Slab`, slabSource: source, height: 0.5, breakDuration: Math.max(0.2, (def.breakDuration || 0.6) * 0.6), category: def.category || (source.includes('planks') ? 'wood' : 'stone') };
        }

        const materials = {
            marble: [0xDAD7D2, 'Marble'], basalt: [0x2D3136, 'Basalt'], slate: [0x46515E, 'Slate'], limestone: [0xCFC5A6, 'Limestone'],
            granite: [0x9B6C5D, 'Granite'], copper_block: [0xB46A3C, 'Copper Block'], iron_block: [0xC8CDD2, 'Iron Block'],
            gold_block: [0xE4B83F, 'Gold Block'], obsidian: [0x171126, 'Obsidian'], concrete: [0xB4B4B4, 'Concrete']
        };
        for (const [key, [color, label]] of Object.entries(materials)) {
            this.blockTypes[key] = { color, name: label, breakDuration: key === 'obsidian' ? 3.5 : 1.0, category: 'stone' };
        }

        const elements = [
            ['h', 'Hydrogen', 0xDCEBFF], ['he', 'Helium', 0xF4D7FF], ['li', 'Lithium', 0xBFA0FF], ['be', 'Beryllium', 0xC8D68B],
            ['b', 'Boron', 0x8D704F], ['c', 'Carbon', 0x242424], ['n', 'Nitrogen', 0x8FB7FF], ['o', 'Oxygen', 0xFF6B6B],
            ['f', 'Fluorine', 0xD2FF65], ['ne', 'Neon', 0xFF7BEA], ['na', 'Sodium', 0xD5C04C], ['mg', 'Magnesium', 0xC9CED6],
            ['al', 'Aluminium', 0xB9C0C9], ['si', 'Silicon', 0x8A8171], ['p', 'Phosphorus', 0xFFB347], ['s', 'Sulfur', 0xE7D84A],
            ['cl', 'Chlorine', 0x9CE36B], ['ar', 'Argon', 0xA8E5FF], ['k', 'Potassium', 0xC0A1FF], ['ca', 'Calcium', 0xDAD6BF],
            ['ti', 'Titanium', 0xAEB8C2], ['cr', 'Chromium', 0x9CA6A8], ['mn', 'Manganese', 0xA78EA8], ['fe', 'Iron Element', 0x9EA4AA],
            ['co', 'Cobalt', 0x3F63B5], ['ni', 'Nickel', 0xB1B985], ['cu', 'Copper Element', 0xB46A3C], ['zn', 'Zinc', 0x9DA9B1],
            ['ag', 'Silver', 0xD8DEE8], ['sn', 'Tin', 0xA6B4B8], ['i', 'Iodine', 0x5B3F7A], ['w', 'Tungsten', 0x5D6872],
            ['pt', 'Platinum', 0xD7D2C4], ['au', 'Gold Element', 0xE4B83F], ['hg', 'Mercury', 0xB7C7D7], ['pb', 'Lead', 0x59616A]
        ];
        for (const [symbol, label, color] of elements) {
            this.blockTypes[`element_${symbol}`] = { color, name: `${label} Block`, breakDuration: 0.9, category: 'element', elementSymbol: symbol.charAt(0).toUpperCase() + symbol.slice(1) };
        }

        const toolMaterials = { wood: 0x8B6914, stone: 0x808080, iron: 0xC8CDD2, gold: 0xE4B83F };
        const toolTypes = ['pickaxe', 'shovel', 'axe', 'sword', 'hoe', 'shears'];
        for (const [material, color] of Object.entries(toolMaterials)) {
            for (const tool of toolTypes) {
                if (tool === 'shears' && material !== 'iron') continue;
                const id = tool === 'shears' ? 'iron_shears' : `${material}_${tool}`;
                this.blockTypes[id] = { color, name: `${this.capitalize(material)} ${this.capitalize(tool)}`, breakDuration: 0, solid: false, itemOnly: true, toolType: tool, toolMaterial: material };
            }
        }

        Object.entries(MOB_SPECIES).forEach(([species, info]) => {
            this.blockTypes[`${species}_egg`] = { color: info.eggColor, name: `${this.capitalize(species.replace('_', ' '))} Egg`, breakDuration: 0, solid: false, itemOnly: true, eggSpecies: species };
        });
    }

    capitalize(value) {
        return String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    lightenHex(color, amount) {
        const r = Math.min(255, ((color >> 16) & 255) + ((amount >> 16) & 255));
        const g = Math.min(255, ((color >> 8) & 255) + ((amount >> 8) & 255));
        const b = Math.min(255, (color & 255) + (amount & 255));
        return (r << 16) | (g << 8) | b;
    }

    offsetHex(color, amount) {
        const r = Math.max(0, Math.min(255, ((color >> 16) & 255) + amount));
        const g = Math.max(0, Math.min(255, ((color >> 8) & 255) + amount));
        const b = Math.max(0, Math.min(255, (color & 255) + amount));
        return (r << 16) | (g << 8) | b;
    }

    createCutoutGeometry(planes) {
        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];

        for (let i = 0; i < planes.length; i++) {
            const plane = planes[i];
            const width = plane.width ?? 1;
            const height = plane.height ?? 1;
            const yOffset = plane.yOffset ?? 0;
            const zOffset = plane.zOffset ?? 0;
            const angle = plane.rotationY ?? 0;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const vertexOffset = positions.length / 3;
            const corners = [
                [-width / 2, -height / 2 + yOffset, zOffset, 0, 0],
                [width / 2, -height / 2 + yOffset, zOffset, 1, 0],
                [width / 2, height / 2 + yOffset, zOffset, 1, 1],
                [-width / 2, height / 2 + yOffset, zOffset, 0, 1],
            ];

            for (let j = 0; j < corners.length; j++) {
                const [x, y, z, u, v] = corners[j];
                positions.push(x * cos + z * sin, y, -x * sin + z * cos);
                // Upward normals light cross-planes like the ground they stand on.
                normals.push(0, 1, 0);
                uvs.push(u, v);
            }

            indices.push(
                vertexOffset, vertexOffset + 1, vertexOffset + 2,
                vertexOffset, vertexOffset + 2, vertexOffset + 3,
                vertexOffset + 2, vertexOffset + 1, vertexOffset,
                vertexOffset + 3, vertexOffset + 2, vertexOffset,
            );
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    }

    getGeometry(type) {
        let geometry = this.cutoutGeometries.get(type);
        if (geometry) return geometry;

        switch (type) {
            case 'tall_grass':
                geometry = this.createCutoutGeometry([
                    { width: 0.78, height: 0.95, rotationY: 0, yOffset: -0.025 },
                    { width: 0.72, height: 0.88, rotationY: Math.PI / 2, yOffset: -0.06 },
                    { width: 0.62, height: 0.82, rotationY: Math.PI / 4, yOffset: -0.09 },
                ]);
                break;
            case 'flower_red':
            case 'flower_yellow':
            case 'mushroom_red':
            case 'mushroom_brown':
                geometry = this.createCutoutGeometry([
                    { width: 0.72, height: 0.82, rotationY: Math.PI / 4, yOffset: -0.09 },
                    { width: 0.72, height: 0.82, rotationY: -Math.PI / 4, yOffset: -0.09 },
                ]);
                break;
            case 'torch':
                geometry = this.createCutoutGeometry([
                    { width: 0.44, height: 0.92, rotationY: Math.PI / 4, yOffset: -0.04 },
                ]);
                break;
            default:
                if (this.blockTypes[type] && this.blockTypes[type].height === 0.5) {
                    // Bottom slab: occupies the lower half of the block when centred on it.
                    geometry = new THREE.BoxGeometry(1, 0.5, 1);
                    geometry.translate(0, -0.25, 0);
                    break;
                }
                return this.geometry;
        }

        this.cutoutGeometries.set(type, geometry);
        return geometry;
    }

    // Plants and torches are drawn as crossed planes instead of cubes.
    isCrossGeometry(type) {
        return ['tall_grass', 'flower_red', 'flower_yellow', 'mushroom_red', 'mushroom_brown', 'torch'].includes(type);
    }

    createDisplayMaterial(color) {
        return this.rtxModeEnabled
            ? new THREE.MeshStandardMaterial({ color, roughness: 0.74, metalness: 0.08 })
            : new THREE.MeshLambertMaterial({ color });
    }

    addDisplayBox(group, color, size, position, rotation = null) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), this.createDisplayMaterial(color));
        mesh.position.set(position[0], position[1], position[2]);
        if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
        mesh.castShadow = this.rtxModeEnabled;
        mesh.receiveShadow = this.rtxModeEnabled;
        mesh.userData.disposeGeometry = true;
        group.add(mesh);
        return mesh;
    }

    createToolDisplayMesh(type, def, scale) {
        const group = new THREE.Group();
        const model = new THREE.Group();
        group.add(model);
        const materialColors = { wood: 0x8B6914, stone: 0x808080, iron: 0xC8CDD2, gold: 0xE4B83F };
        const headColor = materialColors[def.toolMaterial] || def.color;
        const handleColor = def.toolMaterial === 'wood' ? 0x7A4F25 : 0x6B4A2B;

        if (def.toolType === 'sword') {
            this.addDisplayBox(model, handleColor, [0.16, 0.5, 0.16], [0, -0.58, 0]);
            this.addDisplayBox(model, 0xD2B48C, [0.52, 0.12, 0.18], [0, -0.3, 0]);
            this.addDisplayBox(model, headColor, [0.18, 1.2, 0.14], [0, 0.32, 0]);
            this.addDisplayBox(model, headColor, [0.12, 0.18, 0.12], [0, 1.0, 0], [0, 0, Math.PI / 4]);
        } else if (def.toolType === 'pickaxe') {
            this.addDisplayBox(model, handleColor, [0.16, 1.35, 0.16], [0, -0.18, 0], [0, 0, -0.16]);
            this.addDisplayBox(model, headColor, [1.05, 0.18, 0.18], [0, 0.55, 0], [0, Math.PI / 2, 0]);
            this.addDisplayBox(model, headColor, [0.34, 0.16, 0.16], [0, 0.43, -0.5], [-0.55, Math.PI / 2, 0]);
            this.addDisplayBox(model, headColor, [0.34, 0.16, 0.16], [0, 0.43, 0.5], [0.55, Math.PI / 2, 0]);
        } else if (def.toolType === 'axe') {
            this.addDisplayBox(model, handleColor, [0.16, 1.25, 0.16], [0, -0.18, 0], [0, 0, -0.12]);
            this.addDisplayBox(model, headColor, [0.56, 0.48, 0.16], [0.28, 0.52, 0]);
            this.addDisplayBox(model, headColor, [0.34, 0.28, 0.16], [0.52, 0.32, 0], [0, 0, -0.35]);
        } else if (def.toolType === 'shovel') {
            this.addDisplayBox(model, handleColor, [0.14, 1.05, 0.14], [0, -0.28, 0]);
            this.addDisplayBox(model, headColor, [0.46, 0.44, 0.12], [0, 0.46, 0]);
            this.addDisplayBox(model, headColor, [0.24, 0.18, 0.12], [0, 0.78, 0], [0, 0, Math.PI / 4]);
        } else if (def.toolType === 'hoe') {
            this.addDisplayBox(model, handleColor, [0.14, 1.25, 0.14], [0, -0.18, 0], [0, 0, -0.12]);
            this.addDisplayBox(model, headColor, [0.7, 0.16, 0.16], [0.25, 0.54, 0]);
            this.addDisplayBox(model, headColor, [0.16, 0.42, 0.16], [0.55, 0.32, 0]);
        } else if (def.toolType === 'shears') {
            this.addDisplayBox(model, headColor, [0.14, 0.95, 0.12], [-0.16, 0.04, 0], [0, 0, -0.32]);
            this.addDisplayBox(model, headColor, [0.14, 0.95, 0.12], [0.16, 0.04, 0], [0, 0, 0.32]);
            this.addDisplayBox(model, 0x6A7480, [0.2, 0.2, 0.12], [-0.18, -0.48, 0]);
            this.addDisplayBox(model, 0x6A7480, [0.2, 0.2, 0.12], [0.18, -0.48, 0]);
        }

        model.rotation.z = -Math.PI / 4;
        model.position.set(0.52, 0.52, 0);
        group.scale.setScalar(scale * 2.7);
        group.userData.blockType = type;
        return group;
    }

    createEggDisplayMesh(type, def, scale) {
        const geometry = new THREE.SphereGeometry(0.42, 12, 8);
        const mesh = new THREE.Mesh(geometry, this.createDisplayMaterial(def.color));
        mesh.scale.set(scale * 2.04, scale * 2.68, scale * 2.04);
        mesh.castShadow = this.rtxModeEnabled;
        mesh.receiveShadow = this.rtxModeEnabled;
        mesh.userData.disposeGeometry = true;
        mesh.userData.blockType = type;
        return mesh;
    }

    createSaplingDisplayMesh(type, def, scale) {
        const group = new THREE.Group();
        this.addDisplayBox(group, 0x6B4A2B, [0.12, 0.72, 0.12], [0, -0.05, 0]);
        this.addDisplayBox(group, def.color, [0.46, 0.18, 0.16], [-0.18, 0.22, 0], [0, 0, 0.45]);
        this.addDisplayBox(group, def.color, [0.46, 0.18, 0.16], [0.18, 0.36, 0], [0, 0, -0.45]);
        group.scale.setScalar(scale * 2.5);
        group.userData.blockType = type;
        return group;
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

    disposeCache(cache) {
        const disposed = new Set();
        for (const value of cache.values()) {
            for (const item of Array.isArray(value) ? value : [value]) {
                if (!item || disposed.has(item) || typeof item.dispose !== 'function') continue;
                disposed.add(item);
                item.dispose();
            }
        }
        cache.clear();
    }

    setRTXMode(enabled) {
        if (this.rtxModeEnabled === enabled) return;

        this.rtxModeEnabled = enabled;
        this.disposeCache(this.chunkMaterials);
        this.disposeCache(this.materials);
        this.disposeCache(this.textures);
        this.iconCache.clear();

        for (const key of this.activeChunks) {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            this.requestRebuild(chunkX, chunkZ);
        }
    }

    setUltraMode(enabled) {
        if (this.ultraModeEnabled === enabled) return;
        this.ultraModeEnabled = enabled;
        this.windUniforms.windStrength.value = enabled ? 1 : 0;
        this.disposeCache(this.chunkMaterials);
        this.disposeCache(this.materials);
        this.disposeCache(this.textures);
        this.iconCache.clear();
        for (const key of this.activeChunks) {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            this.requestRebuild(chunkX, chunkZ);
        }
    }

    // Starts a ring of ripples on the water at (x, z); strength ~0.3 (wading) .. 1.5 (big splash).
    addRipple(x, z, strength) {
        const ripple = this.rippleUniforms.ripples.value[this.nextRipple];
        ripple.set(x, z, this.windUniforms.windTime.value, strength);
        this.nextRipple = (this.nextRipple + 1) % this.rippleUniforms.ripples.value.length;
    }

    // Per-frame material animation: drives wind (ultra) and water waves (RTX and ultra).
    animateMaterials(time) {
        this.windUniforms.windTime.value = time;
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

    getInventoryIconUrl(type) {
        const cacheKey = `${this.rtxModeEnabled ? 'rtx' : 'base'}:icon:${type}`;
        let icon = this.iconCache.get(cacheKey);
        if (icon) return icon;

        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        const def = this.blockTypes[type] || {};
        const faces = this.getFaceTextureSpecs(type);

        if (def.itemOnly) {
            this.textureFactory.drawItemIcon(ctx, size, def);
        } else if (this.isAlphaCutoutType(type) && type !== 'leaves' && !type.endsWith('_leaves') || type === 'spray_paint') {
            ctx.drawImage(this.generateFaceCanvas(faces.side), size * 0.1, size * 0.1, size * 0.8, size * 0.8);
        } else {
            this.textureFactory.drawCubeIcon(ctx, size, this.generateFaceCanvas(faces.top), this.generateFaceCanvas(faces.side), this.generateFaceCanvas(faces.side));
        }

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

    createLadderMesh(facing) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.92), this.getMaterial('ladder'));
        const offset = 0.492;
        if (facing === 'px') {
            mesh.position.x = -offset;
            mesh.rotation.y = Math.PI / 2;
        } else if (facing === 'nx') {
            mesh.position.x = offset;
            mesh.rotation.y = -Math.PI / 2;
        } else if (facing === 'pz') {
            mesh.position.z = -offset;
        } else {
            mesh.position.z = offset;
            mesh.rotation.y = Math.PI;
        }
        mesh.position.y = 0.5;
        mesh.userData.blockType = 'ladder';
        mesh.userData.ownsGeometry = true;
        return mesh;
    }

    // Which procedural pattern (and tint) each face of a block uses.
    // Returns { top, side, bottom }, each { pattern, tint, label }.
    getFaceTextureSpecs(type) {
        const def = this.blockTypes[type] || {};
        if (def.slabSource) return this.getFaceTextureSpecs(def.slabSource);

        const spec = (pattern, tint = null, label = null) => ({ pattern, tint, label });
        const uniform = (face) => ({ top: face, side: face, bottom: face });
        const category = def.category;

        switch (type) {
            case 'grass': return { top: spec('grass_top'), side: spec('grass_side'), bottom: spec('dirt') };
            case 'wood': return { top: spec('log_top', 0x7a5a32), side: spec('log_side', 0x7a5a32), bottom: spec('log_top', 0x7a5a32) };
            case 'cactus': return { top: spec('cactus_top'), side: spec('cactus_side'), bottom: spec('cactus_top') };
            case 'coal_ore': return uniform(spec('ore', 0x2a2a2c));
            case 'iron_ore': return uniform(spec('ore', 0xd2a27c));
            case 'gold_ore': return uniform(spec('ore', 0xf2cc48));
            case 'planks': return uniform(spec('planks', 0xb48a56));
            case 'leaves': return uniform(spec('leaves', 0x4a8a34));
            case 'brick': return uniform(spec('brick', 0x9c4a36));
            case 'flower_red': return uniform(spec('flower', 0xd04848));
            case 'flower_yellow': return uniform(spec('flower', 0xe8c840));
            case 'mushroom_red': return uniform(spec('mushroom', 0xb74b43));
            case 'mushroom_brown': return uniform(spec('mushroom', 0x8b6540));
            case 'obsidian': return uniform(spec('obsidian'));
            case 'marble': case 'limestone': case 'concrete': case 'slate': case 'basalt': case 'granite':
                return uniform(spec('smooth', def.color));
            case 'copper_block': case 'iron_block': case 'gold_block':
                return uniform(spec('metal', def.color));
            case 'dirt': case 'stone': case 'cobblestone': case 'sand': case 'bedrock': case 'stone_bricks':
            case 'glass': case 'water': case 'bed': case 'sign': case 'sound_block': case 'torch':
            case 'ladder': case 'tall_grass': case 'spray_paint':
                return uniform(spec(type));
        }

        if (def.elementSymbol) return uniform(spec('element', def.color, def.elementSymbol));
        if (type.endsWith('_wood')) return { top: spec('log_top', def.color), side: spec('log_side', def.color), bottom: spec('log_top', def.color) };
        if (type.endsWith('_planks')) return uniform(spec('planks', def.color));
        if (type.endsWith('_leaves')) return uniform(spec('leaves', def.color));
        if (type.endsWith('_brick')) return uniform(spec('brick', def.color));
        if (category === 'wool') return uniform(spec('wool', def.color));
        return uniform(spec('generic', def.color));
    }

    textureSize() {
        if (!this.rtxModeEnabled) return 16;
        return this.ultraModeEnabled ? 256 : 128;
    }

    generateFaceTextures(faceSpec) {
        return this.textureFactory.generate(faceSpec.pattern, {
            tint: faceSpec.tint,
            label: faceSpec.label,
            // Labels (element symbols) need a few more pixels to stay legible.
            size: faceSpec.label ? Math.max(32, this.textureSize()) : this.textureSize(),
            hd: this.rtxModeEnabled
        });
    }

    generateFaceCanvas(faceSpec) {
        return this.generateFaceTextures(faceSpec).albedo;
    }

    getTexture(faceSpec, kind = 'albedo') {
        const cacheKey = `${this.rtxModeEnabled ? 'rtx' : 'base'}:${kind}:${faceSpec.pattern}:${faceSpec.tint}:${faceSpec.label || ''}`;
        let texture = this.textures.get(cacheKey);
        if (texture) return texture;

        const generated = this.generateFaceTextures(faceSpec);
        texture = new THREE.CanvasTexture(generated[kind] || generated.albedo);
        // Sprites must not wrap, or filtering bleeds the bottom row into the top edge.
        const sprite = ['tall_grass', 'flower', 'mushroom', 'torch', 'ladder', 'spray_paint'].includes(faceSpec.pattern);
        texture.wrapS = sprite ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
        texture.wrapT = sprite ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
        texture.magFilter = this.rtxModeEnabled ? THREE.LinearFilter : THREE.NearestFilter;
        texture.minFilter = this.rtxModeEnabled ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
        texture.generateMipmaps = this.rtxModeEnabled;
        texture.anisotropy = this.rtxModeEnabled ? 8 : 1;
        if (kind === 'albedo' && THREE.sRGBEncoding) {
            texture.encoding = THREE.sRGBEncoding;
        }

        texture.needsUpdate = true;
        this.textures.set(cacheKey, texture);
        return texture;
    }

    isAlphaCutoutType(type) {
        return type === 'leaves' || type.endsWith('_leaves') ||
            type === 'tall_grass' || type === 'flower_red' || type === 'flower_yellow' ||
            type === 'mushroom_red' || type === 'mushroom_brown' || type === 'torch' || type === 'ladder';
    }

    getRTXMaterialProps(pattern) {
        switch (pattern) {
            case 'grass_top': case 'grass_side': return { roughness: 0.9, metalness: 0, normalScale: 0.8 };
            case 'dirt': return { roughness: 0.96, metalness: 0, normalScale: 0.9 };
            case 'sand': return { roughness: 0.94, metalness: 0, normalScale: 0.5 };
            case 'stone': case 'ore': return { roughness: 0.78, metalness: 0, normalScale: 1.0 };
            case 'cobblestone': case 'bedrock': return { roughness: 0.84, metalness: 0, normalScale: 1.6 };
            case 'stone_bricks': case 'brick': return { roughness: 0.82, metalness: 0, normalScale: 1.4 };
            case 'log_side': return { roughness: 0.86, metalness: 0, normalScale: 1.4 };
            case 'log_top': case 'planks': case 'sign': case 'sound_block': return { roughness: 0.7, metalness: 0, normalScale: 0.8 };
            case 'leaves': return { roughness: 0.8, metalness: 0, normalScale: 0.8 };
            case 'smooth': case 'element': return { roughness: 0.35, metalness: 0, normalScale: 0.3 };
            case 'metal': return { roughness: 0.32, metalness: 0.85, normalScale: 0.5 };
            case 'obsidian': return { roughness: 0.18, metalness: 0.1, normalScale: 0.6 };
            case 'glass': return { roughness: 0.05, metalness: 0, normalScale: 0.1 };
            case 'water': return { roughness: 0.03, metalness: 0, normalScale: 1, emissive: 0x061a26 };
            case 'wool': return { roughness: 1, metalness: 0, normalScale: 0.6 };
            case 'torch': return { roughness: 0.8, metalness: 0, normalScale: 0.2, emissive: 0x6b3a08 };
            default: return { roughness: 0.85, metalness: 0, normalScale: 0.6 };
        }
    }

    createFaceMaterial(type, faceSpec) {
        const def = this.blockTypes[type] || {};
        const alphaCutout = this.isAlphaCutoutType(type);
        const transparent = Boolean(def.transparent) && !alphaCutout;
        const depthWrite = type === 'water' ? true : (!transparent || alphaCutout);
        const common = {
            map: this.getTexture(faceSpec, 'albedo'),
            transparent,
            opacity: def.opacity || 1,
            alphaTest: alphaCutout ? 0.4 : 0,
            depthWrite,
            side: alphaCutout ? THREE.DoubleSide : THREE.FrontSide
        };

        if (!this.rtxModeEnabled) {
            return new THREE.MeshLambertMaterial(common);
        }

        const props = this.getRTXMaterialProps(faceSpec.pattern);
        // Ultra: deeper normals and per-texel roughness (green channel scales `roughness`).
        const ultra = this.ultraModeEnabled;
        const normalScale = props.normalScale * (ultra ? 1.6 : 1);
        return new THREE.MeshStandardMaterial({
            ...common,
            normalMap: this.getTexture(faceSpec, 'normal'),
            normalScale: new THREE.Vector2(normalScale, normalScale),
            roughnessMap: ultra ? this.getTexture(faceSpec, 'roughness') : null,
            roughness: ultra ? Math.min(1, props.roughness * 1.25) : props.roughness,
            metalness: props.metalness,
            envMapIntensity: props.metalness > 0.5 || props.roughness < 0.2 ? 1 : 0.45,
            emissive: props.emissive || 0x000000,
            emissiveMap: props.emissive ? common.map : null
        });
    }

    // Returns a single material, or an array in BoxGeometry face order
    // (+x, -x, +y, -y, +z, -z) when the block has distinct top/side/bottom faces.
    getMaterial(type) {
        let material = this.materials.get(type);
        if (material) return material;

        const faces = this.getFaceTextureSpecs(type);
        const key = (face) => `${face.pattern}:${face.tint}:${face.label || ''}`;
        if (key(faces.top) === key(faces.side) && key(faces.bottom) === key(faces.side)) {
            material = this.createFaceMaterial(type, faces.side);
        } else {
            const side = this.createFaceMaterial(type, faces.side);
            const top = this.createFaceMaterial(type, faces.top);
            const bottom = key(faces.bottom) === key(faces.top) ? top : this.createFaceMaterial(type, faces.bottom);
            material = [side, side, top, bottom, side, side];
        }

        this.materials.set(type, material);
        return material;
    }

    // Baked voxel lighting for chunk meshes:
    // - `skyLight` scales sun/ambient lighting, so roofs and tunnels get dark;
    // - `blockLight` (torches) and the held torch add warm light on top, independent of the sky.
    addBlockLight(material, foliage = null) {
        const uniforms = {
            blockLightStrength: this.blockLightStrength,
            heldLightPosition: this.heldLightPosition,
            heldLightStrength: this.heldLightStrength,
            ...this.windUniforms,
            ...this.rippleUniforms
        };
        // Wind: a world-position phase keeps neighbouring blocks moving coherently.
        const wind = foliage === 'leaves'
            ? 'transformed.xz += vec2(sin(windTime * 1.7 + windWorld.x * 0.6 + windWorld.y * 0.3), cos(windTime * 1.3 + windWorld.z * 0.6)) * 0.035 * windStrength;'
            : foliage === 'plant'
                ? 'transformed.xz += vec2(sin(windTime * 2.3 + windWorld.x * 0.8), cos(windTime * 1.9 + windWorld.z * 0.8)) * 0.12 * windStrength * clamp(uv.y, 0.0, 1.0);'
                : '';
        // PBR water: two wave samples in world space (no per-block repetition) drifting in
        // different directions, and Fresnel opacity (see-through from above, mirror-like at
        // grazing angles).
        const water = foliage === 'water' && material.isMeshStandardMaterial;
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms);
            if (water) {
                shader.vertexShader = shader.vertexShader
                    // windTime is declared by the shared vertex patch below.
                    .replace('#include <common>', '#include <common>\nvarying vec2 vWaterWorld;')
                    .replace('#include <begin_vertex>', [
                        '#include <begin_vertex>',
                        'vec3 waterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
                        'vWaterWorld = waterWorld.xz;',
                        // Surface-level vertices (top faces and the upper edge of side faces)
                        // swell gently; shared corners keep the surface continuous.
                        'if (fract(waterWorld.y) > 0.8) {',
                        '    transformed.y += (sin(waterWorld.x * 0.9 + windTime * 1.4) + sin(waterWorld.z * 0.7 - windTime * 1.1) + sin((waterWorld.x + waterWorld.z) * 0.45 + windTime * 0.8)) * 0.025;',
                        '}'
                    ].join('\n'));
                shader.fragmentShader = shader.fragmentShader
                    .replace('#include <common>', '#include <common>\nvarying vec2 vWaterWorld;\nuniform float windTime;\nuniform vec4 ripples[8];')
                    .replace('vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;', [
                        'vec2 waveUvA = vWaterWorld * 0.19 + vec2(windTime * 0.035, windTime * 0.022);',
                        'vec2 waveUvB = vWaterWorld * 0.071 + vec2(-windTime * 0.018, windTime * 0.029);',
                        'vec3 mapN = normalize((texture2D(normalMap, waveUvA).xyz * 2.0 - 1.0) + (texture2D(normalMap, waveUvB).xyz * 2.0 - 1.0));',
                        // Ripple rings: a travelling wave front that fades with age and distance.
                        // Tangent space follows the face UVs: +x along u, -z along v.
                        'for (int i = 0; i < 8; i++) {',
                        '    vec4 ripple = ripples[i];',
                        '    float age = windTime - ripple.z;',
                        '    if (ripple.w <= 0.0 || age < 0.0 || age > 4.0) continue;',
                        '    vec2 away = vWaterWorld - ripple.xy;',
                        '    float d = length(away);',
                        '    float front = age * 2.4;',
                        '    float envelope = exp(-abs(d - front) * 1.4) * exp(-age * 1.1) * ripple.w;',
                        '    float wave = cos((d - front) * 7.5) * envelope;',
                        '    vec2 dir = away / max(d, 0.001);',
                        '    mapN.xy += vec2(dir.x, -dir.y) * wave * 1.6;',
                        '}'
                    ].join('\n'))
                    .replace('#include <normal_fragment_maps>', [
                        '#include <normal_fragment_maps>',
                        'float waterFresnel = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);',
                        'diffuseColor.a = mix(0.55, 0.96, waterFresnel);'
                    ].join('\n'));
            }
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', [
                    '#include <common>',
                    'attribute float blockLight;',
                    'attribute float skyLight;',
                    'uniform vec3 heldLightPosition;',
                    'uniform float windTime;',
                    'uniform float windStrength;',
                    'varying float vBlockLight;',
                    'varying float vSkyLight;',
                    'varying float vHeldLight;'
                ].join('\n'))
                .replace('#include <begin_vertex>', [
                    '#include <begin_vertex>',
                    wind ? 'vec3 windWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;' : '',
                    wind,
                    'vBlockLight = blockLight;',
                    'vSkyLight = skyLight;',
                    'float heldDistance = distance((modelMatrix * vec4(transformed, 1.0)).xyz, heldLightPosition);',
                    'vHeldLight = pow(clamp(1.0 - heldDistance / 9.0, 0.0, 1.0), 2.0);'
                ].join('\n'));
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', [
                    '#include <common>',
                    'uniform float blockLightStrength;',
                    'uniform float heldLightStrength;',
                    'varying float vBlockLight;',
                    'varying float vSkyLight;',
                    'varying float vHeldLight;'
                ].join('\n'))
                .replace('#include <aomap_fragment>', [
                    '#include <aomap_fragment>',
                    'float skyFactor = mix(0.04, 1.0, vSkyLight);',
                    'reflectedLight.directDiffuse *= skyFactor;',
                    'reflectedLight.indirectDiffuse *= skyFactor;',
                    'reflectedLight.directSpecular *= skyFactor;',
                    'reflectedLight.indirectSpecular *= skyFactor;'
                ].join('\n'))
                .replace('#include <emissivemap_fragment>', [
                    '#include <emissivemap_fragment>',
                    'float torchLight = max(vBlockLight * blockLightStrength, vHeldLight * heldLightStrength);',
                    'totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.74, 0.45) * torchLight;'
                ].join('\n'));
        };
        material.customProgramCacheKey = () => `voxel-light-${foliage || 'solid'}`;
    }

    setHeldLight(position, active) {
        if (position) this.heldLightPosition.value.copy(position);
        this.heldLightStrength.value = active ? 0.9 : 0;
    }

    setBlockLightStrength(value) {
        this.blockLightStrength.value = value;
    }

    getChunkMaterial(type) {
        let material = this.chunkMaterials.get(type);
        if (material) return material;

        // Leaves sway as a whole; plants bend from the ground up.
        const foliage = type === 'leaves' || type.endsWith('_leaves') ? 'leaves'
            : this.isCrossGeometry(type) && type !== 'torch' ? 'plant'
                : type === 'water' ? 'water' : null;
        const withVertexColors = (base) => {
            const clone = base.clone();
            clone.vertexColors = true;
            this.addBlockLight(clone, foliage);
            return clone;
        };
        const base = this.getMaterial(type);
        if (Array.isArray(base)) {
            // Keep shared entries shared (e.g. the four side faces).
            const clones = new Map();
            material = base.map((entry) => {
                if (!clones.has(entry)) clones.set(entry, withVertexColors(entry));
                return clones.get(entry);
            });
        } else {
            material = withVertexColors(base);
        }

        this.chunkMaterials.set(type, material);
        return material;
    }

    processNextChunk() {
        if (this.isProcessingChunks || this.chunkProcessQueue.length === 0) return;
        this.isProcessingChunks = true;

        requestAnimationFrame(() => {
            if (this.chunkProcessQueue.length === 0) {
                this.isProcessingChunks = false;
                return;
            }

            const { chunkX, chunkZ, blocks, biome } = this.chunkProcessQueue.shift();
            const key = this.chunkKey(chunkX, chunkZ);
            this.generatingChunks.delete(key);

            // The player may have moved away while the worker was busy.
            if (this.isWithinRetention(chunkX, chunkZ)) {
                const column = new ChunkColumn(chunkX, chunkZ, blocks);
                const edits = this.edits.get(key);
                if (edits) {
                    for (const [index, id] of edits) column.blocks[index] = id;
                }
                this.columns.set(key, column);
                this.chunkBiomes.set(key, biome);
                this.generatedChunks.add(key);
                // Neighbours may now hide faces along the shared border.
                this.rebuildChunkAndActiveNeighbors(chunkX, chunkZ, true, true);
            }

            this.isProcessingChunks = false;
            this.processNextChunk();
        });
    }

    generateChunkData(chunkX, chunkZ) {
        const key = this.chunkKey(chunkX, chunkZ);
        if (this.generatedChunks.has(key) || this.generatingChunks.has(key)) return;

        this.generatingChunks.add(key);
        this.chunkRequestBatch.push([chunkX, chunkZ]);
    }

    // source: { connected(): bool, request([[chunkX, chunkZ], ...]), focus(chunkX, chunkZ, radius) }
    setChunkSource(source) {
        this.chunkSource = source;
    }

    flushChunkRequests() {
        if (this.chunkRequestBatch.length === 0 || !this.chunkSource || !this.chunkSource.connected()) return;
        // The server answers nearest-to-focus first, so order does not matter here.
        for (let i = 0; i < this.chunkRequestBatch.length; i += 512) {
            this.chunkSource.request(this.chunkRequestBatch.slice(i, i + 512));
        }
        this.chunkRequestBatch = [];
    }

    // Binary chunk frame from the server.
    receiveChunkFrame(buffer) {
        this.chunkDecoder.postMessage({ type: 'decode', buffer }, [buffer]);
    }

    // After (re)connecting, the server may hold a newer world than what is loaded:
    // drop everything client-side and request it again.
    resetFromServer() {
        for (const key of Array.from(this.chunks.keys())) this.removeChunkMesh(key);
        this.columns.clear();
        this.edits.clear();
        this.generatedChunks.clear();
        this.generatingChunks.clear();
        this.chunkBiomes.clear();
        this.chunkRequestBatch = [];
        this.chunkProcessQueue = [];
        this.rebuildQueue.clear();
        this.activeChunks = new Set();
        this.lastPlayerChunkX = null;
        this.lastPlayerChunkZ = null;
    }

    // Columns are kept a little beyond the render distance so turning around is cheap.
    isWithinRetention(chunkX, chunkZ) {
        if (this.lastPlayerChunkX === null) return true;
        const margin = this.renderDistance + 2;
        return Math.abs(chunkX - this.lastPlayerChunkX) <= margin && Math.abs(chunkZ - this.lastPlayerChunkZ) <= margin;
    }

    getColumnAt(x, z) {
        return this.columns.get(this.chunkKey(floorDiv(x, CHUNK_SIZE), floorDiv(z, CHUNK_SIZE)));
    }

    // Block id at integer world coordinates; AIR_ID when the chunk is not loaded.
    getBlockId(x, y, z) {
        const column = this.getColumnAt(x, z);
        return column ? column.get(localCoord(x), y, localCoord(z)) : AIR_ID;
    }

    // Records a player/persisted change and applies it to the loaded column, if any.
    // Returns true when the visible world changed.
    setEditedBlock(x, y, z, type) {
        if (y < WORLD_MIN_Y || y > WORLD_MAX_Y) return false;
        const id = type ? this.registry.id(type) : AIR_ID;
        const chunkX = floorDiv(x, CHUNK_SIZE);
        const chunkZ = floorDiv(z, CHUNK_SIZE);
        const key = this.chunkKey(chunkX, chunkZ);
        const index = chunkIndex(localCoord(x), y, localCoord(z));

        let edits = this.edits.get(key);
        if (!edits) {
            edits = new Map();
            this.edits.set(key, edits);
        }
        edits.set(index, id);

        const column = this.columns.get(key);
        if (!column || column.blocks[index] === id) return false;
        column.blocks[index] = id;
        column.invalidate();
        return true;
    }

    // Whether a torch is close enough for a change at this block to alter its light.
    hasLightEmitterNear(x, y, z) {
        const torchId = this.registry.id('torch');
        const { chunkX, chunkZ } = this.getChunkCoords(x, z);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const column = this.columns.get(this.chunkKey(chunkX + dx, chunkZ + dz));
                if (!column) continue;
                for (const index of column.getEmitters(torchId)) {
                    const tx = (chunkX + dx) * CHUNK_SIZE + index % CHUNK_SIZE;
                    const tz = (chunkZ + dz) * CHUNK_SIZE + Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE;
                    const ty = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE)) + WORLD_MIN_Y;
                    if (Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(tz - z) <= MAX_BLOCK_LIGHT) return true;
                }
            }
        }
        return false;
    }

    // Rebuilds the chunks affected by a change at (x, z): its own chunk right away, neighbours
    // through the queue only when the block touches them (border faces, AO) or, for light
    // changes, the whole 3x3 neighbourhood a torch can reach.
    rebuildAfterChange(x, z, affectsLight) {
        const { chunkX, chunkZ } = this.getChunkCoords(x, z);
        this.rebuildChunk(chunkX, chunkZ);
        this.rebuildQueue.delete(this.chunkKey(chunkX, chunkZ));

        const lx = localCoord(x);
        const lz = localCoord(z);
        for (const dx of [-1, 0, 1]) {
            for (const dz of [-1, 0, 1]) {
                if (dx === 0 && dz === 0) continue;
                const touchesX = dx === 0 || (dx < 0 ? lx === 0 : lx === CHUNK_SIZE - 1);
                const touchesZ = dz === 0 || (dz < 0 ? lz === 0 : lz === CHUNK_SIZE - 1);
                if (affectsLight || (touchesX && touchesZ)) this.requestRebuild(chunkX + dx, chunkZ + dz);
            }
        }
    }

    requestRebuild(chunkX, chunkZ) {
        const key = this.chunkKey(chunkX, chunkZ);
        if (this.activeChunks.has(key) && this.columns.has(key)) this.rebuildQueue.add(key);
    }

    // Meshes queued chunks nearest to the player first, within a per-frame time budget
    // (always at least one, so the queue keeps draining).
    processRebuildQueue() {
        if (this.rebuildQueue.size === 0) return;
        const start = performance.now();
        const px = this.lastPlayerChunkX ?? 0;
        const pz = this.lastPlayerChunkZ ?? 0;
        const ordered = Array.from(this.rebuildQueue, (key) => {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            return { key, chunkX, chunkZ, distance: Math.max(Math.abs(chunkX - px), Math.abs(chunkZ - pz)) };
        }).sort((a, b) => a.distance - b.distance);

        for (const { key, chunkX, chunkZ } of ordered) {
            if (performance.now() - start > this.rebuildBudgetMs) break;
            this.rebuildQueue.delete(key);
            this.rebuildChunk(chunkX, chunkZ);
        }
    }

    removeChunkMesh(chunkKey) {
        const chunk = this.chunks.get(chunkKey);
        if (!chunk) return;

        this.scene.remove(chunk);

        // Block materials and textures are shared caches; only free what this chunk owns.
        for (let i = 0; i < chunk.children.length; i++) {
            const child = chunk.children[i];
            if (child.isSprite && child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
            if (child.userData.ownsGeometry && child.geometry) {
                child.geometry.dispose();
            }
        }

        this.chunks.delete(chunkKey);
    }

    rebuildChunk(chunkX, chunkZ) {
        const key = this.chunkKey(chunkX, chunkZ);
        this.removeChunkMesh(key);

        if (!this.activeChunks.has(key) || !this.columns.has(key)) return;

        const result = this.mesher.build(chunkX, chunkZ, { hiddenBlock: this.hiddenBlock });
        const baseX = chunkX * this.chunkSize;
        const baseZ = chunkZ * this.chunkSize;
        const chunk = new THREE.Group();
        chunk.position.set(baseX, 0, baseZ);
        chunk.updateMatrix();
        chunk.matrixAutoUpdate = false;

        const solidMesh = ChunkMesher.toMesh(result.buckets);
        if (solidMesh) {
            solidMesh.castShadow = this.rtxModeEnabled;
            solidMesh.receiveShadow = this.rtxModeEnabled;
            chunk.add(solidMesh);
        }

        // Water is its own object so it sorts as a transparent surface.
        const waterMesh = result.water ? ChunkMesher.toMesh([result.water]) : null;
        if (waterMesh) {
            waterMesh.receiveShadow = this.rtxModeEnabled;
            waterMesh.userData.blockType = 'water';
            chunk.add(waterMesh);
        }

        for (const { type, x, y, z } of result.special) {
            const blockKey = this.blockKey(x, y, z);

            if (type === 'sign') {
                const text = this.signTextByKey.get(blockKey);
                if (text) {
                    const sprite = this.createSignLabel(text);
                    sprite.position.set(x - baseX + 0.5, y + 1.15, z - baseZ + 0.5);
                    chunk.add(sprite);
                }
            }

            if (type === 'ladder') {
                const ladder = this.createLadderMesh(this.ladderFacingByKey.get(blockKey) || 'pz');
                ladder.position.x += x - baseX + 0.5;
                ladder.position.y += y;
                ladder.position.z += z - baseZ + 0.5;
                ladder.userData.blockPosition = { x, y, z };
                chunk.add(ladder);
            }
        }

        if (chunk.children.length === 0) return;
        this.scene.add(chunk);
        this.chunks.set(key, chunk);
    }

    // Temporarily leaves one block out of its chunk mesh (used while it is drawn shaking).
    setHiddenBlock(position) {
        const previous = this.hiddenBlock;
        this.hiddenBlock = position ? { x: position.x, y: position.y, z: position.z } : null;
        // Rebuild every chunk whose mesh borders the block (its own and, at edges, neighbours).
        const touched = new Set();
        for (const block of [previous, this.hiddenBlock]) {
            if (!block) continue;
            for (const dx of [-1, 0, 1]) {
                for (const dz of [-1, 0, 1]) {
                    const { chunkX, chunkZ } = this.getChunkCoords(block.x + dx, block.z + dz);
                    touched.add(this.chunkKey(chunkX, chunkZ));
                }
            }
        }
        for (const key of touched) {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            this.rebuildChunk(chunkX, chunkZ);
        }
    }

    rebuildChunkAndActiveNeighbors(chunkX, chunkZ, includeCenter = true, deferred = false) {
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
            if (!this.columns.has(key)) continue;

            if (deferred) this.requestRebuild(x, z);
            else this.rebuildChunk(x, z);
        }
    }

    update(playerX, playerZ) {
        this.processRebuildQueue();
        this.flushChunkRequests();
        const { chunkX: playerChunkX, chunkZ: playerChunkZ } = this.getChunkCoords(playerX, playerZ);

        if (playerChunkX === this.lastPlayerChunkX && playerChunkZ === this.lastPlayerChunkZ) {
            return;
        }

        this.lastPlayerChunkX = playerChunkX;
        this.lastPlayerChunkZ = playerChunkZ;
        // The server serves pending chunks nearest to this point first and forgets requests
        // beyond the retention radius; mirror that so they are requested again on return.
        if (this.chunkSource && this.chunkSource.connected()) {
            this.chunkSource.focus(playerChunkX, playerChunkZ, this.renderDistance + 2);
        }
        for (const key of Array.from(this.generatingChunks)) {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            if (!this.isWithinRetention(chunkX, chunkZ)) this.generatingChunks.delete(key);
        }

        const desiredActiveChunks = new Set();
        const chunksToRender = [];

        for (let x = playerChunkX - this.renderDistance; x <= playerChunkX + this.renderDistance; x++) {
            for (let z = playerChunkZ - this.renderDistance; z <= playerChunkZ + this.renderDistance; z++) {
                const key = this.chunkKey(x, z);
                desiredActiveChunks.add(key);

                if (!this.generatedChunks.has(key)) {
                    this.generateChunkData(x, z);
                    continue;
                }

                if (!this.chunks.has(key)) {
                    chunksToRender.push([x, z]);
                }
            }
        }

        const previousActiveChunks = this.activeChunks;
        this.activeChunks = desiredActiveChunks;

        // Columns stay loaded beyond the render distance, so dropping a mesh never changes
        // its neighbours' faces; only the chunks entering the view need meshing.
        for (const key of previousActiveChunks) {
            if (!desiredActiveChunks.has(key)) this.removeChunkMesh(key);
        }

        // Chunks still generating are meshed (with their neighbours) when the worker replies.
        for (const [chunkX, chunkZ] of chunksToRender) {
            this.requestRebuild(chunkX, chunkZ);
        }

        // Free terrain far away; it is regenerated deterministically (plus edits) on return.
        for (const key of Array.from(this.columns.keys())) {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            if (this.isWithinRetention(chunkX, chunkZ)) continue;
            this.columns.delete(key);
            this.generatedChunks.delete(key);
            this.chunkBiomes.delete(key);
            // The server's copy includes these edits; only in-flight chunks need the overlay.
            this.edits.delete(key);
        }
    }

    // Height of the solid part of a block for collisions (0 when walkable through).
    getCollisionHeight(x, y, z) {
        return this.registry.height[this.getBlockId(Math.round(x), Math.round(y), Math.round(z))];
    }

    hasSolidBlock(x, y, z) {
        return this.registry.solid[this.getBlockId(Math.round(x), Math.round(y), Math.round(z))] === 1;
    }

    getBlockTypeAt(x, y, z) {
        return this.registry.name(this.getBlockId(Math.round(x), Math.round(y), Math.round(z)));
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
        const def = this.blockTypes[type];
        if (def && def.toolType) return this.createToolDisplayMesh(type, def, scale);
        if (def && def.eggSpecies) return this.createEggDisplayMesh(type, def, scale);
        if (def && def.saplingWood) return this.createSaplingDisplayMesh(type, def, scale);

        const shared = this.getMaterial(type);
        const material = Array.isArray(shared) ? shared.map((m) => m.clone()) : shared.clone();
        const mesh = new THREE.Mesh(this.getGeometry(type), material);
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

    getSoundBlockStateAt(x, y, z) {
        return this.soundBlockStateByKey.get(this.blockKey(Math.round(x), Math.round(y), Math.round(z))) || { instrument: 'bell', note: 0 };
    }

    getLadderFacingAt(x, y, z) {
        return this.ladderFacingByKey.get(this.blockKey(Math.round(x), Math.round(y), Math.round(z))) || 'pz';
    }

    sprayPaintKey(x, y, z, face) {
        return `${Math.round(x)},${Math.round(y)},${Math.round(z)},${face}`;
    }

    getSprayPaintMaterial(color) {
        const colors = { green: 0x39ff14, pink: 0xff2bd6, blue: 0x33ccff };
        return new THREE.MeshBasicMaterial({ color: colors[color] || colors.green, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide });
    }

    addSprayPaint(paint) {
        if (!paint || !paint.face) return;
        const key = this.sprayPaintKey(paint.x, paint.y, paint.z, paint.face);
        this.removeSprayPaint(key);

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.82), this.getSprayPaintMaterial(paint.color));
        const offset = 0.506;
        const x = Math.round(paint.x) + 0.5;
        const y = Math.round(paint.y) + 0.5;
        const z = Math.round(paint.z) + 0.5;

        if (paint.face === 'px') {
            mesh.position.set(x + offset, y, z);
            mesh.rotation.y = Math.PI / 2;
        } else if (paint.face === 'nx') {
            mesh.position.set(x - offset, y, z);
            mesh.rotation.y = -Math.PI / 2;
        } else if (paint.face === 'py') {
            mesh.position.set(x, y + offset, z);
            mesh.rotation.x = -Math.PI / 2;
        } else if (paint.face === 'ny') {
            mesh.position.set(x, y - offset, z);
            mesh.rotation.x = Math.PI / 2;
        } else if (paint.face === 'pz') {
            mesh.position.set(x, y, z + offset);
        } else if (paint.face === 'nz') {
            mesh.position.set(x, y, z - offset);
            mesh.rotation.y = Math.PI;
        } else {
            mesh.geometry.dispose();
            mesh.material.dispose();
            return;
        }

        mesh.renderOrder = 80;
        this.scene.add(mesh);
        this.sprayPaintsByKey.set(key, { ...paint, key, mesh });
    }

    removeSprayPaint(key) {
        const paint = this.sprayPaintsByKey.get(key);
        if (!paint) return;
        this.scene.remove(paint.mesh);
        paint.mesh.geometry.dispose();
        paint.mesh.material.dispose();
        this.sprayPaintsByKey.delete(key);
    }

    removeSprayPaintsForBlock(x, y, z) {
        const prefix = `${Math.round(x)},${Math.round(y)},${Math.round(z)},`;
        for (const key of Array.from(this.sprayPaintsByKey.keys())) {
            if (key.startsWith(prefix)) {
                this.removeSprayPaint(key);
            }
        }
    }

    loadSprayPaints(paints) {
        for (const key of Array.from(this.sprayPaintsByKey.keys())) {
            this.removeSprayPaint(key);
        }
        Object.values(paints || {}).forEach((paint) => this.addSprayPaint(paint));
    }

    updateSprayPaints(worldDay, timeOfDay) {
        for (const [key, paint] of Array.from(this.sprayPaintsByKey.entries())) {
            if (worldDay > paint.expiresAtDay || (worldDay === paint.expiresAtDay && timeOfDay >= paint.expiresAtTime)) {
                this.removeSprayPaint(key);
            }
        }
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
                    if (child.userData.isChunkMesh || child.userData.blockPosition) {
                        objects.push(child);
                    }
                }
            }
        }

        return objects;
    }

    getBlockPositionFromIntersection(intersection) {
        if (!intersection || !intersection.object) return null;
        const object = intersection.object;
        if (object.userData.blockPosition) return { ...object.userData.blockPosition };

        const faceBlocks = object.userData.faceBlocks;
        if (!faceBlocks || intersection.faceIndex == null) return null;
        const i = intersection.faceIndex * 3;
        return { x: faceBlocks[i], y: faceBlocks[i + 1], z: faceBlocks[i + 2] };
    }

    addBlock(position, type) {
        const payload = type === undefined && position.blockType ? position : { ...position, blockType: type };
        const x = Math.round(payload.x);
        const y = Math.round(payload.y);
        const z = Math.round(payload.z);
        const previousType = this.getBlockTypeAt(x, y, z);
        const changed = this.setEditedBlock(x, y, z, payload.blockType);
        const key = this.blockKey(x, y, z);
        if (payload.blockType === 'sign' && Object.prototype.hasOwnProperty.call(payload, 'text')) {
            this.signTextByKey.set(key, payload.text || '');
            this.signVotesByKey.set(key, payload.votes || { thumbup: 0, thumbdown: 0, heart: 0, happy: 0, star: 0 });
        } else if (payload.blockType === 'sign' && payload.votes) {
            this.signVotesByKey.set(key, payload.votes);
        } else if (payload.blockType === 'sound_block') {
            this.soundBlockStateByKey.set(key, { instrument: payload.instrument || 'bell', note: Number.isInteger(payload.note) ? payload.note : 0 });
            this.ladderFacingByKey.delete(key);
        } else if (payload.blockType === 'ladder') {
            this.ladderFacingByKey.set(key, payload.facing || 'pz');
            this.signTextByKey.delete(key);
            this.signVotesByKey.delete(key);
            this.soundBlockStateByKey.delete(key);
        } else {
            this.signTextByKey.delete(key);
            this.signVotesByKey.delete(key);
            this.soundBlockStateByKey.delete(key);
            this.ladderFacingByKey.delete(key);
        }

        if (!changed) return false;

        this.rebuildAfterChange(x, z, payload.blockType === 'torch' || previousType === 'torch' || this.hasLightEmitterNear(x, y, z));
        return true;
    }

    loadBlocks(state) {
        const blocks = state && state.blocks ? state.blocks : (state || {});
        const sprayPaints = state && state.sprayPaints ? state.sprayPaints : {};
        const dirtyChunks = new Set();

        // Terrain and plain edits arrive with each chunk; this only restores block metadata.
        for (const key in blocks) {
            const block = blocks[key];
            const x = Math.round(block.x);
            const y = Math.round(block.y);
            const z = Math.round(block.z);
            // Metadata is kept even when the chunk is not loaded yet.
            this.setEditedBlock(x, y, z, block.blockType);

            const blockKey = this.blockKey(x, y, z);
            if (block.blockType === 'sign' && block.text) {
                this.signTextByKey.set(blockKey, block.text);
                this.signVotesByKey.set(blockKey, block.votes || { thumbup: 0, thumbdown: 0, heart: 0, happy: 0, star: 0 });
            } else if (block.blockType === 'sound_block') {
                this.soundBlockStateByKey.set(blockKey, { instrument: block.instrument || 'bell', note: Number.isInteger(block.note) ? block.note : 0 });
            } else if (block.blockType === 'ladder') {
                this.ladderFacingByKey.set(blockKey, block.facing || 'pz');
            } else {
                this.signTextByKey.delete(blockKey);
                this.signVotesByKey.delete(blockKey);
                this.soundBlockStateByKey.delete(blockKey);
                this.ladderFacingByKey.delete(blockKey);
            }

            const { chunkX, chunkZ } = this.getChunkCoords(x, z);
            dirtyChunks.add(this.chunkKey(chunkX, chunkZ));
        }

        for (const key of dirtyChunks) {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            const includeCenter = this.activeChunks.has(key);
            this.rebuildChunkAndActiveNeighbors(chunkX, chunkZ, includeCenter, true);
        }

        this.loadSprayPaints(sprayPaints);
    }

    removeBlockAt(x, y, z) {
        const blockX = Math.round(x);
        const blockY = Math.round(y);
        const blockZ = Math.round(z);
        const previousType = this.getBlockTypeAt(blockX, blockY, blockZ);
        const changed = this.deleteBlockData(blockX, blockY, blockZ);

        if (!changed) return false;

        this.rebuildAfterChange(blockX, blockZ, previousType === 'torch' || this.hasLightEmitterNear(blockX, blockY, blockZ));
        return true;
    }

    // Records the removal as an edit; returns true if a loaded block actually disappeared.
    deleteBlockData(x, y, z) {
        const key = this.blockKey(x, y, z);
        this.signTextByKey.delete(key);
        this.signVotesByKey.delete(key);
        this.soundBlockStateByKey.delete(key);
        this.ladderFacingByKey.delete(key);
        this.removeSprayPaintsForBlock(x, y, z);
        return this.setEditedBlock(x, y, z, null);
    }
}
