class WorldRenderer {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.dataOnly = !!options.dataOnly;
        this.chunks = new Map();
        this.chunkBlocks = new Map();
        this.generatedChunks = new Set();
        this.activeChunks = new Set();
        this.blockData = new Map();
        this.signTextByKey = new Map();
        this.signVotesByKey = new Map();
        this.soundBlockStateByKey = new Map();
        this.ladderFacingByKey = new Map();
        this.sprayPaintsByKey = new Map();
        this.solidBlocks = new Set();
        this.removedBlockKeys = new Set();
        this.userModifiedBlocks = new Set();
        this.chunkSize = 16;
        this.renderDistance = options.renderDistance ?? 4;
        this.rtxModeEnabled = false;

        this.geometry = new THREE.BoxGeometry(1, 1, 1);
        this.waterSurfaceGeometry = new THREE.PlaneGeometry(1, 1);
        this.waterSurfaceGeometry.rotateX(-Math.PI / 2);
        this.cutoutGeometries = new Map();
        this.materials = new Map();
        this.textures = new Map();
        this.iconCache = new Map();
        this.textureLoader = new THREE.TextureLoader();
        this.rtxAssetTextures = new Set(['grass', 'dirt', 'stone', 'sand', 'wood', 'planks', 'brick', 'glass', 'water', 'leaves']);
        this.tempMatrix = new THREE.Matrix4();
        this.worldSeed = 1337;

        this.lastPlayerChunkX = null;
        this.lastPlayerChunkZ = null;

        this.generatingChunks = new Set();
        this.chunkProcessQueue = [];
        this.isProcessingChunks = false;

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
            ice: { color: 0xA9D8F5, name: 'Ice', transparent: true, opacity: 0.72, breakDuration: 0.35 },
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

        if (!this.dataOnly) {
            this.generateInitialChunks();
        }
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
            this.blockTypes[`${source}_slab`] = { color: def.color, name: `${def.name} Slab`, breakDuration: Math.max(0.2, (def.breakDuration || 0.6) * 0.6), category: def.category || (source.includes('planks') ? 'wood' : 'stone') };
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
            this.blockTypes[`element_${symbol}`] = { color, name: `${label} Block`, breakDuration: 0.9, category: 'element' };
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

        const animals = ['sheep', 'duck', 'pig', 'giraffe', 'dog', 'cat', 'spider', 'cave_monster', 'macaw'];
        const eggColors = [0xF1EFE6, 0xF4F0D8, 0xD89AA3, 0xF4A12C, 0xC89058, 0xF2C36B, 0x24192C, 0x477599, 0x24B45A];
        animals.forEach((species, index) => {
            this.blockTypes[`${species}_egg`] = { color: eggColors[index], name: `${this.capitalize(species.replace('_', ' '))} Egg`, breakDuration: 0, solid: false, itemOnly: true, eggSpecies: species };
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

    getTerrainConfig() {
        if (this.terrainConfig) return this.terrainConfig;
        this.terrainConfig = {
            seaLevel: 5,
            beachBand: 2.2,
            rockSlope: 0.46,
            continentalScale: 2200,
            erosionScale: 900,
            climateScale: 520,
            biomeScale: 420,
            detailScale: 256,
            continentalWeight: 12,
            erosionWeight: 4,
            hillsWeight: 5,
            detailWeight: 1.35,
            mountainWeight: 32,
            riverScale: 900,
            riverWidth: 0.08,
            lakeScale: 420,
            minWorldY: -59,
            bedrockThickness: 2,
            caveStartDepth: 8,
            caveMaxDepth: 64
        };
        return this.terrainConfig;
    }

    getBiomeDefinitions() {
        if (this.biomeDefinitions) return this.biomeDefinitions;
        this.biomeDefinitions = {
            deep_ocean: { label: 'Deep Ocean', color: 0x1D4F86, temp: 0.48, humidity: 0.72, continentalness: 0.04, erosion: 0.65, minHeight: -20, maxHeight: 2, top: 'sand', filler: 'sand', sub: 'stone', treeChance: 0, decorChance: 0 },
            ocean: { label: 'Ocean', color: 0x2F6FAE, temp: 0.5, humidity: 0.7, continentalness: 0.18, erosion: 0.7, minHeight: -12, maxHeight: 5, top: 'sand', filler: 'sand', sub: 'stone', treeChance: 0, decorChance: 0 },
            beach: { label: 'Beach', color: 0xE5CD8A, temp: 0.58, humidity: 0.46, continentalness: 0.34, erosion: 0.72, minHeight: 3, maxHeight: 8, top: 'sand', filler: 'sand', sub: 'stone', treeChance: 0.001, decorChance: 0.006, trees: ['acacia_wood', 'birch_wood'] },
            plains: { label: 'Plains', color: 0x74A94D, temp: 0.55, humidity: 0.42, continentalness: 0.56, erosion: 0.72, minHeight: 4, maxHeight: 18, top: 'grass', filler: 'dirt', sub: 'stone', treeChance: 0.01, decorChance: 0.085, trees: ['wood', 'birch_wood', 'maple_wood'] },
            forest: { label: 'Forest', color: 0x2F7B3B, temp: 0.52, humidity: 0.68, continentalness: 0.58, erosion: 0.58, minHeight: 4, maxHeight: 22, top: 'grass', filler: 'dirt', sub: 'stone', treeChance: 0.04, decorChance: 0.075, trees: ['wood', 'birch_wood', 'dark_oak_wood', 'cherry_wood', 'maple_wood'] },
            light_forest: { label: 'Light Forest', color: 0x4F9745, temp: 0.58, humidity: 0.58, continentalness: 0.54, erosion: 0.68, minHeight: 4, maxHeight: 20, top: 'grass', filler: 'dirt', sub: 'stone', treeChance: 0.024, decorChance: 0.09, trees: ['birch_wood', 'wood', 'maple_wood'] },
            dark_forest: { label: 'Dark Forest', color: 0x204C2D, temp: 0.44, humidity: 0.78, continentalness: 0.62, erosion: 0.48, minHeight: 4, maxHeight: 22, top: 'grass', filler: 'dirt', sub: 'stone', treeChance: 0.05, decorChance: 0.07, trees: ['dark_oak_wood', 'spruce_wood'] },
            taiga: { label: 'Taiga', color: 0x3E6E55, temp: 0.28, humidity: 0.58, continentalness: 0.6, erosion: 0.55, minHeight: 5, maxHeight: 24, top: 'grass', filler: 'dirt', sub: 'stone', treeChance: 0.036, decorChance: 0.04, trees: ['spruce_wood', 'birch_wood'] },
            snowy_taiga: { label: 'Snowy Taiga', color: 0xB7D4CF, temp: 0.14, humidity: 0.58, continentalness: 0.62, erosion: 0.5, minHeight: 5, maxHeight: 24, top: 'white_wool', filler: 'dirt', sub: 'stone', treeChance: 0.032, decorChance: 0.022, trees: ['spruce_wood'] },
            snowy_plains: { label: 'Snowy Plains', color: 0xDDE8E6, temp: 0.12, humidity: 0.36, continentalness: 0.55, erosion: 0.72, minHeight: 4, maxHeight: 18, top: 'white_wool', filler: 'dirt', sub: 'stone', treeChance: 0.004, decorChance: 0.018, trees: ['spruce_wood'] },
            desert: { label: 'Desert', color: 0xD8BD6D, temp: 0.9, humidity: 0.14, continentalness: 0.6, erosion: 0.62, minHeight: 4, maxHeight: 20, top: 'sand', filler: 'sand', sub: 'stone', treeChance: 0, decorChance: 0.012, cactusChance: 0.028 },
            savanna: { label: 'Savanna', color: 0xB4A64D, temp: 0.82, humidity: 0.34, continentalness: 0.58, erosion: 0.62, minHeight: 4, maxHeight: 22, top: 'grass', filler: 'dirt', sub: 'stone', treeChance: 0.012, decorChance: 0.05, trees: ['acacia_wood'] },
            badlands: { label: 'Badlands', color: 0xB96B3A, temp: 0.82, humidity: 0.18, continentalness: 0.72, erosion: 0.24, minHeight: 8, maxHeight: 30, top: 'orange_brick', filler: 'red_brick', sub: 'stone', treeChance: 0.001, decorChance: 0.006, cactusChance: 0.012 },
            jungle: { label: 'Jungle', color: 0x207F3B, temp: 0.82, humidity: 0.86, continentalness: 0.62, erosion: 0.46, minHeight: 4, maxHeight: 24, top: 'grass', filler: 'dirt', sub: 'stone', treeChance: 0.055, decorChance: 0.11, trees: ['jungle_wood', 'willow_wood'] },
            swamp: { label: 'Swamp', color: 0x4E6F3B, temp: 0.62, humidity: 0.9, continentalness: 0.42, erosion: 0.82, minHeight: 2, maxHeight: 9, top: 'grass', filler: 'dirt', sub: 'stone', treeChance: 0.026, decorChance: 0.1, trees: ['willow_wood', 'dark_oak_wood'] },
            meadow: { label: 'Meadow', color: 0x8CBF67, temp: 0.42, humidity: 0.5, continentalness: 0.66, erosion: 0.5, minHeight: 10, maxHeight: 26, top: 'grass', filler: 'dirt', sub: 'stone', treeChance: 0.006, decorChance: 0.12, trees: ['birch_wood', 'cherry_wood'] },
            mountains: { label: 'Mountains', color: 0x7E9184, temp: 0.34, humidity: 0.44, continentalness: 0.72, erosion: 0.18, minHeight: 16, maxHeight: 42, top: 'stone', filler: 'cobblestone', sub: 'stone', treeChance: 0.006, decorChance: 0.018, trees: ['spruce_wood'] },
            snowy_mountains: { label: 'Snowy Mountains', color: 0xD8E5E8, temp: 0.14, humidity: 0.42, continentalness: 0.7, erosion: 0.2, minHeight: 15, maxHeight: 44, top: 'white_wool', filler: 'stone', sub: 'stone', treeChance: 0.003, decorChance: 0.01, trees: ['spruce_wood'] },
            stony_peaks: { label: 'Stony Peaks', color: 0x8A8D8F, temp: 0.5, humidity: 0.24, continentalness: 0.78, erosion: 0.12, minHeight: 18, maxHeight: 46, top: 'stone', filler: 'cobblestone', sub: 'stone', treeChance: 0, decorChance: 0.006 }
        };
        return this.biomeDefinitions;
    }

    seededRand(x, z, offset = 0) {
        const n = Math.sin(x * 12.9898 + z * 78.233 + this.worldSeed + offset) * 43758.5453;
        return n - Math.floor(n);
    }

    smoothstep(edge0, edge1, value) {
        const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    noise2D(x, z, scale = 0.05) {
        const ix = Math.floor(x * scale);
        const iz = Math.floor(z * scale);
        const fx = (x * scale) - ix;
        const fz = (z * scale) - iz;
        const a = this.seededRand(ix, iz);
        const b = this.seededRand(ix + 1, iz);
        const c = this.seededRand(ix, iz + 1);
        const d = this.seededRand(ix + 1, iz + 1);
        const ux = fx * fx * (3 - 2 * fx);
        const uz = fz * fz * (3 - 2 * fz);
        return a * (1 - ux) * (1 - uz) + b * ux * (1 - uz) + c * (1 - ux) * uz + d * ux * uz;
    }

    getClimateAt(worldX, worldZ) {
        const cfg = this.getTerrainConfig();
        const warpX = (this.noise2D(worldX + 9000, worldZ - 3000, 1 / 760) - 0.5) * 120;
        const warpZ = (this.noise2D(worldX - 4000, worldZ + 7400, 1 / 760) - 0.5) * 120;
        const x = worldX + warpX;
        const z = worldZ + warpZ;
        return {
            continentalness: this.noise2D(x + 8100, z - 4400, 1 / cfg.continentalScale),
            erosion: this.noise2D(x - 2200, z + 1600, 1 / cfg.erosionScale),
            temperature: this.noise2D(x + 1400, z - 200, 1 / cfg.climateScale),
            humidity: this.noise2D(x - 930, z + 1180, 1 / cfg.climateScale),
            weirdness: this.noise2D(x + 5200, z - 3100, 1 / cfg.biomeScale),
            river: this.sampleRiver(worldX, worldZ),
            lake: this.sampleLake(worldX, worldZ)
        };
    }

    sampleRiver(worldX, worldZ) {
        const cfg = this.getTerrainConfig();
        const riverA = Math.abs(this.noise2D(worldX + 5200, worldZ - 3100, 1 / cfg.riverScale) - 0.5) * 2;
        const riverB = Math.abs(this.noise2D(worldX - 2800, worldZ + 6100, 1 / (cfg.riverScale * 1.35)) - 0.5) * 2;
        const main = 1 - this.smoothstep(cfg.riverWidth, cfg.riverWidth + 0.16, Math.min(riverA, riverB));
        const tributary = 1 - this.smoothstep(cfg.riverWidth * 0.55, cfg.riverWidth + 0.1, Math.max(0, Math.min(riverA, riverB) - 0.04));
        return Math.max(main, tributary * 0.55);
    }

    sampleLake(worldX, worldZ) {
        const cfg = this.getTerrainConfig();
        const basin = this.noise2D(worldX - 620, worldZ + 910, 1 / cfg.lakeScale);
        const roundness = this.noise2D(worldX + 1800, worldZ - 1900, 1 / 180);
        return this.smoothstep(0.76, 0.93, basin) * this.smoothstep(0.35, 0.72, roundness);
    }

    scoreBiome(def, climate) {
        const tempScore = 1 - Math.abs(climate.temperature - def.temp);
        const humidityScore = 1 - Math.abs(climate.humidity - def.humidity);
        const continentalScore = 1 - Math.abs(climate.continentalness - def.continentalness);
        const erosionScore = 1 - Math.abs(climate.erosion - def.erosion);
        return Math.max(0.001, Math.pow(Math.max(0, tempScore * 0.28 + humidityScore * 0.24 + continentalScore * 0.3 + erosionScore * 0.18), 3));
    }

    sampleClimate(worldX, worldZ) {
        return this.getClimateAt(worldX, worldZ);
    }

    sampleHeight(worldX, worldZ, climate) {
        const cfg = this.getTerrainConfig();
        const continentalCurve = (climate.continentalness - 0.44) * cfg.continentalWeight;
        const oceanShelf = climate.continentalness < 0.28 ? (0.28 - climate.continentalness) * -34 : 0;
        const coastLift = this.smoothstep(0.28, 0.42, climate.continentalness) * 3;
        const largeLandVariation = (this.noise2D(worldX - 1700, worldZ + 900, 1 / 1800) - 0.5) * 8;
        const hills = (this.noise2D(worldX + 2300, worldZ - 1300, 1 / 360) - 0.5) * cfg.hillsWeight * climate.erosion;
        const mountainMask = this.smoothstep(0.34, 0.54, climate.continentalness) * this.smoothstep(0.0, 0.72, 1 - climate.erosion) * this.smoothstep(0.28, 0.48, climate.weirdness);
        const ridgeNoise = 1 - Math.abs(this.noise2D(worldX + 2900, worldZ + 3700, 1 / 460) - 0.5) * 2;
        const mountainRidge = Math.pow(ridgeNoise, 0.92);
        const cliffNoise = 1 - Math.abs(this.noise2D(worldX - 9400, worldZ + 2700, 1 / 180) - 0.5) * 2;
        const cliffs = Math.pow(cliffNoise, 4.4) * this.smoothstep(0.42, 0.78, ridgeNoise) * mountainMask * 36;
        const mountains = mountainRidge * mountainMask * 76 + cliffs;
        const valleyMask = 1 - this.smoothstep(0.12, 0.42, Math.abs(this.noise2D(worldX - 6300, worldZ - 2800, 1 / 760) - 0.5) * 2);
        const valleys = valleyMask * (0.35 + (1 - climate.erosion) * 0.65) * -6;
        const riverCut = climate.river * (6 + (1 - climate.erosion) * 5);
        const lakeCut = climate.lake * 5.5;
        const detail = (this.noise2D(worldX + 120, worldZ - 480, 1 / cfg.detailScale) - 0.5) * cfg.detailWeight;
        const spawnDistance = Math.sqrt(worldX * worldX + worldZ * worldZ);
        const spawnLift = (1 - this.smoothstep(90, 340, spawnDistance)) * 18;
        const spawnCalm = (1 - this.smoothstep(120, 360, spawnDistance)) * -Math.abs(detail) * 0.8;
        return cfg.seaLevel + continentalCurve + oceanShelf + coastLift + largeLandVariation + hills + mountains + valleys + detail + spawnLift + spawnCalm - riverCut - lakeCut;
    }

    sampleSlope(worldX, worldZ, climate = null) {
        const c = climate || this.sampleClimate(worldX, worldZ);
        const here = this.sampleHeight(worldX, worldZ, c);
        const dx = this.sampleHeight(worldX + 4, worldZ, this.sampleClimate(worldX + 4, worldZ)) - here;
        const dz = this.sampleHeight(worldX, worldZ + 4, this.sampleClimate(worldX, worldZ + 4)) - here;
        return Math.min(1, Math.sqrt(dx * dx + dz * dz) / 10);
    }

    pickBiome(climate, height, slope) {
        const cfg = this.getTerrainConfig();
        const defs = this.getBiomeDefinitions();
        if (height < cfg.seaLevel - 7) return 'deep_ocean';
        if (height < cfg.seaLevel - 0.6) return 'ocean';
        if (Math.abs(height - cfg.seaLevel) <= cfg.beachBand && climate.continentalness < 0.52) return 'beach';
        if (climate.lake > 0.65 && climate.humidity > 0.58 && height < cfg.seaLevel + 4) return climate.temperature < 0.22 ? 'snowy_plains' : 'swamp';
        if (climate.weirdness > 0.66 && climate.continentalness > 0.46 && climate.erosion < 0.55) return climate.temperature < 0.24 ? 'snowy_mountains' : climate.humidity < 0.34 ? 'stony_peaks' : 'mountains';
        if (height > cfg.seaLevel + 14 && climate.temperature < 0.22) return 'snowy_mountains';
        if (height > cfg.seaLevel + 16 && climate.humidity < 0.38) return 'stony_peaks';
        if (height > cfg.seaLevel + 10 || slope > 0.45) return climate.temperature < 0.32 ? 'snowy_mountains' : 'mountains';
        if (climate.humidity > 0.82 && height < cfg.seaLevel + 5) return 'swamp';

        let best = 'plains';
        let bestScore = Infinity;
        for (const [name, def] of Object.entries(defs)) {
            if (['deep_ocean', 'ocean', 'beach', 'mountains', 'snowy_mountains', 'stony_peaks'].includes(name)) continue;
            let score = Math.abs(climate.temperature - def.temp) * 1.15 +
                Math.abs(climate.humidity - def.humidity) +
                Math.abs(climate.continentalness - def.continentalness) * 0.55 +
                Math.abs(climate.erosion - def.erosion) * 0.35;
            if (height < def.minHeight || height > def.maxHeight) score += 0.45;
            if (score < bestScore) {
                best = name;
                bestScore = score;
            }
        }
        return best;
    }

    pickSurfaceBlock(biome, height, slope, climate) {
        const cfg = this.getTerrainConfig();
        const def = this.getBiomeDefinitions()[biome];
        if (height < cfg.seaLevel) return climate.temperature < 0.18 ? 'ice' : 'water';
        if (Math.abs(height - cfg.seaLevel) <= cfg.beachBand) {
            if (biome.startsWith('snowy')) return 'white_wool';
            return biome === 'badlands' ? 'orange_brick' : 'sand';
        }
        if (slope > cfg.rockSlope) {
            return biome.startsWith('snowy') ? 'white_wool' : 'stone';
        }
        if (!def) return 'grass';
        return def.top;
    }

    sampleTerrainAt(worldX, worldZ) {
        const climate = this.sampleClimate(worldX, worldZ);
        const heightFloat = this.sampleHeight(worldX, worldZ, climate);
        const slope = this.sampleSlope(worldX, worldZ, climate);
        const biome = this.pickBiome(climate, heightFloat, slope);
        const surfaceBlock = this.pickSurfaceBlock(biome, heightFloat, slope, climate);
        const def = this.getBiomeDefinitions()[biome];
        return {
            x: worldX,
            z: worldZ,
            climate,
            heightFloat,
            height: Math.floor(heightFloat),
            slope,
            biome,
            label: def ? def.label : biome,
            def,
            waterLevel: this.getTerrainConfig().seaLevel,
            waterCarve: surfaceBlock === 'water' ? 1 : 0,
            surfaceBlock
        };
    }

    isCaveAt(worldX, y, worldZ, surfaceHeight) {
        const cfg = this.getTerrainConfig();
        if (y >= surfaceHeight - cfg.caveStartDepth) return false;
        if (y <= cfg.minWorldY + cfg.bedrockThickness) return false;

        const depth = surfaceHeight - y;
        const depthMask = this.smoothstep(cfg.caveStartDepth, cfg.caveStartDepth + 8, depth) * (1 - this.smoothstep(cfg.caveMaxDepth - 6, cfg.caveMaxDepth, depth));
        const levelMask = Math.max(
            1 - this.smoothstep(8, 18, Math.abs(depth - 18)),
            1 - this.smoothstep(10, 22, Math.abs(depth - 36)),
            1 - this.smoothstep(12, 26, Math.abs(depth - 54))
        );
        const tunnelA = Math.abs(this.noise2D(worldX + y * 17 + 4100, worldZ - y * 13 - 2200, 1 / 72) - 0.5) * 2;
        const tunnelB = Math.abs(this.noise2D(worldX - y * 11 - 7600, worldZ + y * 19 + 3300, 1 / 110) - 0.5) * 2;
        const tunnelC = Math.abs(this.noise2D(worldX + y * 29 + 1200, worldZ + y * 31 - 8800, 1 / 46) - 0.5) * 2;
        const chamber = this.noise2D(worldX + y * 23 + 9100, worldZ - y * 7 - 5100, 1 / 86);
        const chamberShape = this.noise2D(worldX - y * 5 + 3300, worldZ + y * 9 - 1700, 1 / 38);
        const tunnel = Math.min(tunnelA, tunnelB, tunnelC);
        return depthMask > 0 && levelMask > 0.15 && (tunnel < 0.11 + levelMask * 0.04 || (tunnel < 0.3 && chamber > 0.66 && chamberShape > 0.55));
    }

    getProceduralBlockTypeAt(worldX, y, worldZ, profile = null) {
        profile = profile || this.sampleTerrainAt(worldX, worldZ);
        const cfg = this.getTerrainConfig();
        const height = Math.max(cfg.minWorldY + cfg.bedrockThickness + 1, profile.height);
        const waterLevel = profile.waterLevel;
        const biomeDef = profile.def;
        if (y > height && y <= waterLevel) return y === waterLevel && profile.climate.temperature < 0.18 ? 'ice' : 'water';
        if (y > height) return null;
        if (y <= cfg.minWorldY + cfg.bedrockThickness - 1) return 'bedrock';
        if (this.isCaveAt(worldX, y, worldZ, height)) return null;
        if (y < height - 3 || (profile.slope > 0.5 && y < height - 1)) {
            const oreRand = this.seededRand(worldX, worldZ, y * 100);
            if (oreRand < 0.02) return 'coal_ore';
            if (oreRand < 0.025) return 'iron_ore';
            if (oreRand < 0.026) return 'gold_ore';
            return biomeDef.sub;
        }
        if (y === height) {
            if (profile.surfaceBlock === 'stone' && biomeDef.filler === 'cobblestone') {
                return this.seededRand(worldX, worldZ, 1700) < 0.65 ? 'stone' : 'cobblestone';
            }
            return profile.surfaceBlock === 'water' || profile.surfaceBlock === 'ice' ? biomeDef.top : profile.surfaceBlock;
        }
        return biomeDef.filler;
    }

    getBiomeProfileAt(worldX, worldZ) {
        return this.sampleTerrainAt(worldX, worldZ);
    }

    getBiomeEnvironmentAt(worldX, worldZ) {
        const profile = this.sampleTerrainAt(worldX, worldZ);
        const env = { gravityScale: 1, breakMultiplier: 1, precipitation: 'normal', plantGrowthMultiplier: 1 };
        if (profile.biome === 'snowy_plains' || profile.biome === 'snowy_taiga' || profile.biome === 'snowy_mountains') {
            env.precipitation = 'snow';
            env.gravityScale = profile.biome === 'snowy_mountains' ? 0.82 : 0.92;
            env.breakMultiplier = 1.18;
            env.plantGrowthMultiplier = 0.35;
        } else if (profile.biome === 'jungle' || profile.biome === 'swamp') {
            env.precipitation = 'rain';
            env.gravityScale = 1.04;
            env.breakMultiplier = 0.9;
            env.plantGrowthMultiplier = 1.8;
        } else if (profile.biome === 'badlands' || profile.biome === 'desert') {
            env.precipitation = 'dry';
            env.breakMultiplier = 1.1;
            env.plantGrowthMultiplier = 0.45;
        } else if (profile.biome === 'mountains' || profile.biome === 'stony_peaks') {
            env.gravityScale = 0.86;
            env.breakMultiplier = 1.25;
            env.plantGrowthMultiplier = 0.65;
        } else if (profile.biome === 'meadow' || profile.biome === 'forest' || profile.biome === 'light_forest') {
            env.plantGrowthMultiplier = 1.25;
        }
        return { ...env, profile };
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
                normals.push(sin, 0, cos);
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
                return this.geometry;
        }

        this.cutoutGeometries.set(type, geometry);
        return geometry;
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
        return mesh;
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
        const patternType = this.getTexturePatternType(type);
        const seed = type.length * 23;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let noise = this.textureNoise(x, y, seed);

                if (patternType === 'wood' || patternType === 'planks') {
                    noise = (noise * 0.38) + ((Math.sin((x / size) * Math.PI * 8) * 0.5 + 0.5) * 0.48) + ((y % 6) / 6) * 0.08;
                } else if (patternType === 'stone' || patternType === 'cobblestone' || patternType.endsWith('_ore')) {
                    noise = (noise * 0.55) + this.textureNoise(x * 0.7, y * 0.7, seed + 7) * 0.25 + this.textureNoise(x * 0.18, y * 0.18, seed + 17) * 0.2;
                } else if (patternType === 'grass' || patternType === 'leaves') {
                    noise = (noise * 0.46) + this.textureNoise(x * 1.2, y * 1.2, seed + 13) * 0.3 + ((1 - y / size) * 0.24);
                } else if (patternType === 'sand') {
                    noise = (noise * 0.5) + ((Math.sin((x / size) * Math.PI * 10 + y * 0.15) * 0.5 + 0.5) * 0.22) + this.textureNoise(x * 0.9, y * 0.9, seed + 31) * 0.28;
                } else if (patternType === 'brick' || patternType === 'stone_bricks') {
                    noise = (noise * 0.42) + ((x % 8) / 8) * 0.12 + ((y % 5) / 5) * 0.16 + this.textureNoise(x * 0.4, y * 0.4, seed + 21) * 0.3;
                } else if (patternType === 'glass') {
                    noise = 0.18 + this.textureNoise(x * 0.2, y * 0.2, seed + 11) * 0.08 + ((x + y) % 13) / 13 * 0.04;
                } else if (patternType === 'water') {
                    noise = 0.15 + this.textureNoise(x * 0.4, y * 0.4, seed + 19) * 0.1 + ((Math.sin((x + y) * 0.25) * 0.5 + 0.5) * 0.07);
                } else if (patternType === 'bed') {
                    noise = (y < size * 0.48 ? 0.45 : 0.72) + this.textureNoise(x * 0.6, y * 0.6, seed + 15) * 0.12;
                } else if (patternType === 'cactus') {
                    noise = (noise * 0.38) + ((x % 5) / 5) * 0.42 + ((y % 7) / 7) * 0.08;
                }

                const value = Math.max(0, Math.min(255, Math.round(noise * 255)));
                ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    applyRTXSurfaceDetail(ctx, type, size, seed) {
        type = this.getTexturePatternType(type);
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
        } else if (type === 'ladder') {
            ctx.clearRect(0, 0, size, size);
            const railWidth = Math.max(5, Math.round(size * 0.12));
            const rungHeight = Math.max(5, Math.round(size * 0.085));
            const leftRail = Math.round(size * 0.18);
            const rightRail = Math.round(size * 0.7);
            const rungLeft = Math.round(size * 0.18);
            const rungWidth = Math.round(size * 0.64);
            ctx.fillStyle = '#5f3518';
            ctx.fillRect(leftRail - 2, 0, railWidth + 4, size);
            ctx.fillRect(rightRail - 2, 0, railWidth + 4, size);
            ctx.fillStyle = '#9b632e';
            ctx.fillRect(leftRail, 0, railWidth, size);
            ctx.fillRect(rightRail, 0, railWidth, size);
            ctx.fillStyle = '#d49a55';
            ctx.fillRect(leftRail + 2, 0, 2, size);
            ctx.fillRect(rightRail + 2, 0, 2, size);
            for (let y = Math.round(size * 0.16); y < size * 0.9; y += Math.round(size * 0.22)) {
                ctx.fillStyle = '#5f3518';
                ctx.fillRect(rungLeft - 2, y + 2, rungWidth + 4, rungHeight + 2);
                ctx.fillStyle = '#9b632e';
                ctx.fillRect(rungLeft, y, rungWidth, rungHeight);
                ctx.fillStyle = '#d49a55';
                ctx.fillRect(rungLeft + 2, y, rungWidth - 4, 2);
            }
        } else {
            overlay(0.14, (noise) => noise > 0.82 ? '#f0e6d2' : '#2d2d2d', 0.58, 1);
        }
    }

    paintTexture(ctx, type, size) {
        const def = this.blockTypes[type];
        const patternType = this.getTexturePatternType(type);
        const seed = type.length * 17;

        ctx.clearRect(0, 0, size, size);

        if (patternType !== type) {
            if (patternType === 'leaves' && type.endsWith('_leaves')) {
                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
                        const noise = this.textureNoise(x, y, seed);
                        if (noise < 0.18) continue;
                        const color = noise > 0.7 ? this.offsetHex(def.color, 26) : def.color;
                        ctx.fillStyle = this.shadeColor(color, 0);
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
                return;
            }
            this.paintPaletteTexture(ctx, size, [this.offsetHex(def.color, -24), def.color, this.offsetHex(def.color, 24)], seed, def.transparent ? 0.82 : 1);
            ctx.fillStyle = this.shadeColor(this.offsetHex(def.color, -42), 0);
            if (patternType === 'brick' || patternType === 'stone_bricks') {
                for (let y = 0; y < size; y += 5) ctx.fillRect(0, y, size, 1);
                for (let y = 1; y < size; y += 5) {
                    const offset = (Math.floor(y / 5) % 2) * 4;
                    for (let x = -offset; x < size; x += 8) ctx.fillRect(x, y, 1, 4);
                }
            } else if (patternType === 'wood') {
                for (let x = 2; x < size; x += 5) ctx.fillRect(x, 0, 1, size);
            } else if (patternType === 'planks') {
                for (let y = 0; y < size; y += 4) ctx.fillRect(0, y, size, 1);
                for (let x = 2; x < size; x += 6) ctx.fillRect(x, 0, 1, size);
            }
            return;
        }

        switch (patternType) {
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
            case 'ladder': {
                ctx.fillStyle = 'rgba(0,0,0,0)';
                ctx.fillRect(0, 0, size, size);

                const railWidth = Math.max(2, Math.round(size * 0.13));
                const rungHeight = Math.max(2, Math.round(size * 0.1));
                const leftRail = Math.round(size * 0.18);
                const rightRail = Math.round(size * 0.69);
                const rungLeft = Math.round(size * 0.18);
                const rungWidth = Math.round(size * 0.64);
                const wood = '#9b632e';
                const light = '#d49a55';
                const dark = '#5f3518';

                ctx.fillStyle = dark;
                ctx.fillRect(leftRail - 1, 1, railWidth + 2, size - 2);
                ctx.fillRect(rightRail - 1, 1, railWidth + 2, size - 2);
                ctx.fillStyle = wood;
                ctx.fillRect(leftRail, 0, railWidth, size);
                ctx.fillRect(rightRail, 0, railWidth, size);
                ctx.fillStyle = light;
                ctx.fillRect(leftRail + 1, 0, 1, size);
                ctx.fillRect(rightRail + 1, 0, 1, size);

                for (let y = Math.round(size * 0.16); y < size * 0.9; y += Math.round(size * 0.22)) {
                    ctx.fillStyle = dark;
                    ctx.fillRect(rungLeft - 1, y + 1, rungWidth + 2, rungHeight + 1);
                    ctx.fillStyle = wood;
                    ctx.fillRect(rungLeft, y, rungWidth, rungHeight);
                    ctx.fillStyle = light;
                    ctx.fillRect(rungLeft + 1, y, rungWidth - 2, 1);
                }
                break;
            }
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

    getTexturePatternType(type) {
        const def = this.blockTypes[type];
        if (!def) return type;
        if (type.endsWith('_brick')) return 'brick';
        if (type.endsWith('_wool')) return 'leaves';
        if (type.endsWith('_planks') || type.endsWith('_planks_slab')) return 'planks';
        if (type.endsWith('_wood')) return 'wood';
        if (type.endsWith('_leaves')) return 'leaves';
        if (type.endsWith('_slab')) return type.includes('planks') ? 'planks' : 'stone_bricks';
        if (type.startsWith('element_')) return 'stone_bricks';
        return type;
    }

    isAlphaCutoutType(type) {
        return type === 'leaves' || type.endsWith('_leaves') ||
            type === 'tall_grass' || type === 'flower_red' || type === 'flower_yellow' ||
            type === 'mushroom_red' || type === 'mushroom_brown' || type === 'torch' || type === 'ladder';
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

        const def = this.blockTypes[type] || {};
        const alphaCutout = this.isAlphaCutoutType(type);
        const transparent = Boolean(def.transparent) && !alphaCutout;
        const depthWrite = type === 'water' ? true : (!transparent || alphaCutout);
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
                transparent,
                opacity: def.opacity || 1,
                alphaTest: alphaCutout ? 0.28 : 0,
                depthWrite,
                side: alphaCutout ? THREE.DoubleSide : THREE.FrontSide
            });
        } else {
            material = new THREE.MeshLambertMaterial({
                color: 0xFFFFFF,
                map: this.getTexture(type, 'albedo'),
                transparent,
                opacity: def.opacity || 1,
                alphaTest: alphaCutout ? 0.35 : 0,
                depthWrite,
                side: alphaCutout ? THREE.DoubleSide : THREE.FrontSide
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
            }
        }
    }

    processNextChunk() {
        if (this.isProcessingChunks || this.chunkProcessQueue.length === 0) return;
        this.isProcessingChunks = true;
        
        requestAnimationFrame(() => {
            if (this.chunkProcessQueue.length === 0) {
                this.isProcessingChunks = false;
                return;
            }
            
            const { chunkX, chunkZ, blocks } = this.chunkProcessQueue.shift();
            const key = this.chunkKey(chunkX, chunkZ);
            
            for (let i = 0; i < blocks.length; i += 4) {
                this.setBlockData(blocks[i], blocks[i+1], blocks[i+2], blocks[i+3], key);
            }
            this.generatedChunks.add(key);
            this.generatingChunks.delete(key);
            this.rebuildChunk(chunkX, chunkZ);
            
            this.isProcessingChunks = false;
            this.processNextChunk();
        });
    }

    generateChunkData(chunkX, chunkZ) {
        const key = this.chunkKey(chunkX, chunkZ);
        if (this.generatedChunks.has(key) || this.generatingChunks.has(key)) return;

        this.generatingChunks.add(key);
        this.ensureChunkBlockSet(key);
        
        const worldX = chunkX * this.chunkSize;
        const worldZ = chunkZ * this.chunkSize;

        fetch(`/api/terrain/tile?x=${worldX}&z=${worldZ}&size=${this.chunkSize}&step=1&clipY=256&mode=full`, { cache: 'no-store' })
            .then(res => res.json())
            .then(data => {
                const blocks = [];
                if (data && data.types) {
                    for (let i = 0; i < data.types.length; i++) {
                        const bx = data.x[i];
                        const by = data.y[i];
                        const bz = data.z[i];
                        if (bx >= worldX + this.chunkSize || bz >= worldZ + this.chunkSize) continue;
                        
                        const type = data.palette[data.types[i]];
                        if (type && type !== 'air') {
                            blocks.push(bx, by, bz, type);
                        }
                    }
                }
                this.chunkProcessQueue.push({ chunkX, chunkZ, blocks });
                this.processNextChunk();
            })
            .catch(err => {
                console.error("Failed to load chunk terrain:", err);
                this.generatingChunks.delete(key);
            });
    }

    generateTree(x, y, z, rand, woodType = 'wood') {
        const leavesType = woodType === 'wood' ? 'leaves' : woodType.replace('_wood', '_leaves');
        const trunkHeight = 4 + Math.floor(rand(x, z, 2024) * (woodType === 'dark_oak_wood' ? 3 : 2));

        for (let ty = 0; ty < trunkHeight; ty++) {
            this.setBlockData(x, y + ty, z, woodType);
        }

        const leavesStart = y + trunkHeight - 2;
        for (let ly = 0; ly < 3; ly++) {
            const radius = ly === 2 ? 1 : 2;
            for (let lx = -radius; lx <= radius; lx++) {
                for (let lz = -radius; lz <= radius; lz++) {
                    if (lx === 0 && lz === 0 && ly < 2) continue;
                    if (Math.abs(lx) === 2 && Math.abs(lz) === 2) continue;

                    this.setBlockData(x + lx, leavesStart + ly, z + lz, leavesType);
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

    setBlockData(x, y, z, type, chunkKey = null, options = {}) {
        const key = this.blockKey(x, y, z);
        const resolvedChunkKey = chunkKey || this.chunkKey(Math.floor(x / this.chunkSize), Math.floor(z / this.chunkSize));
        const currentType = this.blockData.get(key);

        if (this.removedBlockKeys.has(key) && !options.persisted && !options.playerChange) {
            return false;
        }

        if (options.persisted || options.playerChange) {
            this.removedBlockKeys.delete(key);
            this.userModifiedBlocks.add(key);
        } else if (this.userModifiedBlocks.has(key)) {
            return false;
        }

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
            if (type === 'ladder') continue;
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
            const mesh = new THREE.InstancedMesh(this.getGeometry(type), this.getMaterial(type), positions.length);
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

            if (type === 'ladder') {
                const ladder = this.createLadderMesh(this.ladderFacingByKey.get(blockKey) || 'pz');
                ladder.position.x += x - baseX + 0.5;
                ladder.position.y += y;
                ladder.position.z += z - baseZ + 0.5;
                chunk.add(ladder);
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
        const def = this.blockTypes[type];
        if (def && def.toolType) return this.createToolDisplayMesh(type, def, scale);
        if (def && def.eggSpecies) return this.createEggDisplayMesh(type, def, scale);
        if (def && def.saplingWood) return this.createSaplingDisplayMesh(type, def, scale);

        const material = this.getMaterial(type).clone();
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
        const duration = this.getBreakDurationForType(this.getBlockTypeAt(x, y, z));
        if (!duration) return duration;
        const env = this.getBiomeEnvironmentAt(x, z);
        return duration * env.breakMultiplier;
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
        const changed = this.setBlockData(x, y, z, payload.blockType, null, { playerChange: true });
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

        const { chunkX, chunkZ } = this.getChunkCoords(x, z);
        const centerKey = this.chunkKey(chunkX, chunkZ);
        this.rebuildChunkAndActiveNeighbors(chunkX, chunkZ, this.activeChunks.has(centerKey));

        return true;
    }

    loadBlocks(state) {
        const blocks = state && state.blocks ? state.blocks : (state || {});
        const removedBlocks = state && state.removedBlocks ? state.removedBlocks : {};
        const sprayPaints = state && state.sprayPaints ? state.sprayPaints : {};
        const chunkedBlocks = state && state.chunkedBlocks ? state.chunkedBlocks : {};
        const dirtyChunks = new Set();

        for (const chunkKey in chunkedBlocks) {
            const chunk = chunkedBlocks[chunkKey];
            const [cx, cy, cz] = chunkKey.split(',').map(Number);
            const palette = chunk.palette;
            const binaryString = atob(chunk.blocks);
            
            let outIdx = 0;
            for (let i = 0; i < binaryString.length; i += 2) {
                const count = binaryString.charCodeAt(i);
                const val = binaryString.charCodeAt(i + 1);
                
                if (val === 0) {
                    outIdx += count;
                    continue;
                }
                
                for (let j = 0; j < count; j++) {
                    const idx = outIdx++;
                    const y = Math.floor(idx / 1024);
                    const z = Math.floor((idx % 1024) / 32);
                    const x = idx % 32;
                    
                    const worldX = cx * 32 + x;
                    const worldY = cy * 32 + y;
                    const worldZ = cz * 32 + z;
                    
                    if (val === 1) {
                        this.removedBlockKeys.add(this.blockKey(worldX, worldY, worldZ));
                        this.deleteBlockData(worldX, worldY, worldZ, false);
                    } else if (val >= 2) {
                        const type = palette[val - 2];
                        this.setBlockData(worldX, worldY, worldZ, type, null, { persisted: true });
                    }
                }
            }
            dirtyChunks.add(this.chunkKey(cx * 2, cz * 2));
            dirtyChunks.add(this.chunkKey(cx * 2 + 1, cz * 2));
            dirtyChunks.add(this.chunkKey(cx * 2, cz * 2 + 1));
            dirtyChunks.add(this.chunkKey(cx * 2 + 1, cz * 2 + 1));
        }

        for (const key in removedBlocks) {
            if (!removedBlocks[key]) continue;
            this.removedBlockKeys.add(key);
            const { x, y, z } = this.parseBlockKey(key);
            this.deleteBlockData(x, y, z, false);
            const { chunkX, chunkZ } = this.getChunkCoords(x, z);
            dirtyChunks.add(this.chunkKey(chunkX, chunkZ));
        }

        for (const key in blocks) {
            const block = blocks[key];
            const x = Math.round(block.x);
            const y = Math.round(block.y);
            const z = Math.round(block.z);
            if (!this.setBlockData(x, y, z, block.blockType, null, { persisted: true })) continue;

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
            this.rebuildChunkAndActiveNeighbors(chunkX, chunkZ, includeCenter);
        }

        if (!this.dataOnly) {
            this.loadSprayPaints(sprayPaints);
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

    deleteBlockData(x, y, z, recordRemoval = true) {
        const key = this.blockKey(x, y, z);
        if (!this.blockData.has(key)) return false;

        if (recordRemoval) {
            this.removedBlockKeys.add(key);
            this.userModifiedBlocks.delete(key);
        }

        this.blockData.delete(key);
        this.signTextByKey.delete(key);
        this.signVotesByKey.delete(key);
        this.soundBlockStateByKey.delete(key);
        this.ladderFacingByKey.delete(key);
        this.removeSprayPaintsForBlock(x, y, z);
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
