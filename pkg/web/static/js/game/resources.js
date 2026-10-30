// Mob resources: shearing, milking, honey, feathers and scales shed when struck, and loot
// when a creature is defeated. Every resource is an ingredient of at least one recipe
// (food, drinks, armour, torches, building stone). Mixed into Game.prototype; `this` is the
// Game instance. Hooks: registerMobUseHandler (right click), onMobEvent('hit' | 'defeated' |
// 'removed' | 'spawned'), registerItemType and registerGameContent (js/extensions.js).
//
// Item definitions may carry (read by tiny hooks in shared files):
//   drawIcon(ctx, size)               inventory icon (blockTextures.js drawItemIcon)
//   displayMesh(world, type, scale)   pickup / held model (world.js createDisplayMesh)
//   consume(type)                     G key; returns true when handled (survival.js)

// ---------------------------------------------------------------------------------------
// Pixel-art sprites (12x12; '.' is transparent).

const RESOURCE_SPRITES = {
    feather: [
        '..........W.',
        '.........WW.',
        '........WWg.',
        '.......WWgW.',
        '......WWgWW.',
        '.....WWgWW..',
        '....WWgWW...',
        '...WWgWW....',
        '...WgWW.....',
        '..SgW.......',
        '.S..........',
        'S...........'
    ],
    leather: [
        '............',
        '.LL......LL.',
        '.LLLLLLLLLL.',
        '..LLLdLLLL..',
        '..LLLLLLdL..',
        '..LdLLLLLL..',
        '..LLLLLdLL..',
        '..LLLLLLLL..',
        '.LLLdLLLLLL.',
        '.LL..LL..LL.',
        '............',
        '............'
    ],
    fur: [
        '............',
        '...F..F..F..',
        '..FFFFFFFFF.',
        '.FFfFFFfFFF.',
        '.FFFFfFFFfF.',
        '.FfFFFFfFFF.',
        '.FFFFfFFFFF.',
        '.FFfFFFFfFF.',
        '..FFFFFFFF..',
        '...F..F..F..',
        '............',
        '............'
    ],
    honeycomb: [
        '............',
        '...wwwwww...',
        '..wHHwHHHw..',
        '.wHHHwHHHHw.',
        '.wwwwwwwwww.',
        '.wHHwHHHwHw.',
        '.wHHwHHHwHw.',
        '.wwwwwwwwww.',
        '.wHHHwHHHHw.',
        '..wHHwHHHw..',
        '...wwwwww...',
        '............'
    ],
    shell: [
        '............',
        '....SSSS....',
        '..SSrSSrSS..',
        '.SSrSSSSrSS.',
        '.SrSSrrSSrS.',
        '.SrSSrSSSrS.',
        '.SrSSrSSSrS.',
        '..SrSrSSrS..',
        '...SrSSrS...',
        '....SSSS....',
        '.....SS.....',
        '............'
    ],
    scale: [
        '............',
        '....SSSS....',
        '..SSSSSSSS..',
        '.SSHSSSSSSs.',
        '.SHSSSSSSSs.',
        '.SHSSSSSSSs.',
        '.SSSSSSSSSs.',
        '..SSSSSSSs..',
        '...SSSSSs...',
        '....SSSs....',
        '.....ss.....',
        '............'
    ],
    venom_sac: [
        '............',
        '.....tt.....',
        '....tVVt....',
        '...VVVVVV...',
        '..VVHVVVVV..',
        '..VHVVVVVV..',
        '..VVVVVVVV..',
        '..VVVVVVVV..',
        '...VVVVVV...',
        '....VVVV....',
        '......D.....',
        '......D.....'
    ],
    glow_dust: [
        '............',
        '..w.....Y...',
        '.wYw...YwY..',
        '..w.....Y...',
        '.....Y......',
        '....YwY..w..',
        '.....Y..wYw.',
        '..Y......w..',
        '.YwY...Y....',
        '..Y...YwY...',
        '.......Y....',
        '............'
    ],
    shadow_essence: [
        '............',
        '.....PP.....',
        '....PDDP....',
        '...PDDDDP...',
        '...PDwDDP...',
        '..PDDDDDDP..',
        '..PDDDwDDP..',
        '..PDDDDDDP..',
        '...PDDDDP...',
        '....PPPP....',
        '...P....P...',
        '............'
    ],
    fish: [
        '............',
        '............',
        '.....FF.....',
        '...BBBBBB..T',
        '..BBBBBBBBTT',
        '.BEBBBBBBBTT',
        '.BBBBBBBBBTT',
        '..bbbbbbbbTT',
        '...bbbbbb..T',
        '............',
        '............',
        '............'
    ],
    bottle: [
        '....CCCC....',
        '....CCCC....',
        '.....GG.....',
        '.....GG.....',
        '....GLLG....',
        '...GLLLLG...',
        '..GLLHLLLG..',
        '..GLLHLLLG..',
        '..GLLLLLLG..',
        '..GLLLLLLG..',
        '...GLLLLG...',
        '....GGGG....'
    ],
    cheese: [
        '............',
        '............',
        '.........YY.',
        '.......YYYY.',
        '.....YYYYYY.',
        '...YYYYYhYY.',
        '.YYYYYYYYYY.',
        '.YhYYYYYYhY.',
        '.YYYYhYYYYY.',
        '.YYYYYYYYYY.',
        '.oooooooooo.',
        '............'
    ],
    warm_coat: [
        '............',
        '..FFF..FFF..',
        '.LLFFFFFFLL.',
        '.LLLLFFLLLL.',
        'LLLLLLbLLLLL',
        'LL.LLLLLL.LL',
        'LL.LLLbLL.LL',
        'LL.LLLLLL.LL',
        '...LLLbLL...',
        '...LLLLLL...',
        '...LLLLLL...',
        '............'
    ],
    scale_mail: [
        '............',
        '..LL....LL..',
        '.SSSL..LSSS.',
        '.SsSSSSSSsS.',
        '.SSSsSSsSSS.',
        '.SsSSSSSSsS.',
        '..SSsSSsSS..',
        '..SsSSSSsS..',
        '..SSSsSsSS..',
        '..SsSSSSsS..',
        '..SSSSSSSS..',
        '............'
    ],
    feather_cape: [
        '............',
        '...cWWWWc...',
        '...WWWWWW...',
        '..WWgWWgWW..',
        '..WgWWgWWW..',
        '.WWWWgWWgWW.',
        '.WgWWWWgWWW.',
        '.WWWgWWWWgW.',
        'WWgWWWgWWWWW',
        'WWWWgWWWgWWW',
        '.g.g.g.g.g.g',
        '............'
    ]
};

function resourcesDrawSprite(sprite, palette) {
    return (ctx, size) => {
        const cell = size / 12;
        sprite.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const color = palette[row[x]];
                if (color === undefined) continue;
                ctx.fillStyle = typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : color;
                const x0 = Math.round(x * cell);
                const y0 = Math.round(y * cell);
                ctx.fillRect(x0, y0, Math.round((x + 1) * cell) - x0, Math.round((y + 1) * cell) - y0);
            }
        });
    };
}

// Pickups and the held item: the icon on a flat double-sided card, like a dropped sprite.
const resourcesIconTextures = new Map();
const resourcesCardGeometry = typeof THREE !== 'undefined' ? new THREE.PlaneGeometry(1, 1) : null;
function resourcesDisplayMesh(world, type, scale) {
    let texture = resourcesIconTextures.get(type);
    if (!texture) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 48;
        world.blockTypes[type].drawIcon(canvas.getContext('2d'), 48);
        texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        resourcesIconTextures.set(type, texture);
    }
    const material = new THREE.MeshLambertMaterial({ map: texture, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(resourcesCardGeometry, material);
    mesh.scale.setScalar(scale * 2.2);
    mesh.userData.blockType = type;
    return mesh;
}

// What each item is, how it looks and, for consumables, what it does.
//   food      health restored      bottle   returns an empty glass when drunk
//   cures     cures poison         immunity seconds of immunity to poison
//   armour    damage removed from each creature attack while carried
//   fallGuard fraction of fall damage removed while carried
const RESOURCE_ITEMS = {
    feather: { color: 0x9aa7b4, name: 'Feather', sprite: 'feather', palette: { W: 0xf4f1e8, g: 0xbdb7a8, S: 0x6b5a45 } },
    leather: { color: 0x5e3d22, name: 'Leather', sprite: 'leather', palette: { L: 0xa8673a, d: 0x7d4a26 } },
    fur: { color: 0x6b5a48, name: 'Fur', sprite: 'fur', palette: { F: 0xd8c3a0, f: 0xa88e68 } },
    milk: { color: 0x6c8fb0, name: 'Milk Bottle', sprite: 'bottle', palette: { C: 0x8a6034, G: 0xcfe9f2, L: 0xfbfaf2, H: 0xffffff }, food: 2, cures: true, bottle: true },
    honeycomb: { color: 0x8a5a14, name: 'Honeycomb', sprite: 'honeycomb', palette: { w: 0xb87a16, H: 0xffc93a } },
    raw_fish: { color: 0x3e6c8a, name: 'Raw Fish', sprite: 'fish', palette: { B: 0x9ec3d8, b: 0xe9d6cf, E: 0x16181c, T: 0x7aa6c2, F: 0x7aa6c2 }, food: 1 },
    shell: { color: 0x3f7c86, name: 'Shell', sprite: 'shell', palette: { S: 0xf2d8c4, r: 0xd49a82 } },
    scale: { color: 0x2f4f3a, name: 'Scale', sprite: 'scale', palette: { S: 0x7fb069, s: 0x4e7a3e, H: 0xc6e3a8 } },
    venom_sac: { color: 0x3b2a4a, name: 'Venom Sac', sprite: 'venom_sac', palette: { V: 0x9b5fc0, H: 0xd8b4ee, t: 0x6b3f86, D: 0x8fe05a } },
    glow_dust: { color: 0x3a3d1a, name: 'Glow Dust', sprite: 'glow_dust', palette: { Y: 0xe9f55a, w: 0xffffff } },
    shadow_essence: { color: 0x8a7fa0, name: 'Shadow Essence', sprite: 'shadow_essence', palette: { D: 0x1a1420, P: 0x4b3a66, w: 0xb9a6ff } },
    cooked_fish: { color: 0x6a4524, name: 'Cooked Fish', sprite: 'fish', palette: { B: 0xc98b4a, b: 0xe8bb7a, E: 0x2a1a10, T: 0x9a6634, F: 0x9a6634 }, food: 6 },
    honey_bottle: { color: 0x7a5418, name: 'Honey Bottle', sprite: 'bottle', palette: { C: 0x8a6034, G: 0xcfe9f2, L: 0xf2a91c, H: 0xffd977 }, food: 5, bottle: true },
    cheese: { color: 0x7d6a2a, name: 'Cheese', sprite: 'cheese', palette: { Y: 0xf5d35a, h: 0xd8a92e, o: 0xe0b23c }, food: 7 },
    antivenom: { color: 0x2d4a3a, name: 'Antivenom', sprite: 'bottle', palette: { C: 0x8a6034, G: 0xcfe9f2, L: 0x6fd08c, H: 0xc6f5d2 }, food: 1, cures: true, immunity: 180, bottle: true },
    warm_coat: { color: 0x3e2a1a, name: 'Warm Coat', sprite: 'warm_coat', palette: { L: 0x8c5a32, F: 0xe2cfae, b: 0x2a1a10 }, armour: 1, describe: 'while you carry it, creature attacks deal 1 less damage' },
    scale_mail: { color: 0x22382a, name: 'Scale Mail', sprite: 'scale_mail', palette: { S: 0x7fb069, s: 0x4e7a3e, L: 0x8c5a32 }, armour: 2, describe: 'while you carry it, creature attacks deal 2 less damage' },
    feather_cape: { color: 0x6f7f96, name: 'Feather Cape', sprite: 'feather_cape', palette: { W: 0xf4f1e8, g: 0xb8b2a4, c: 0xe4b83f }, fallGuard: 0.6, describe: 'while you carry it, you take much less fall damage' }
};

Object.entries(RESOURCE_ITEMS).forEach(([id, item]) => {
    registerItemType(id, {
        ...item,
        drawIcon: resourcesDrawSprite(RESOURCE_SPRITES[item.sprite], item.palette),
        displayMesh: resourcesDisplayMesh,
        consume(type) { return this.resourcesConsume(type); }
    });
});

registerGameContent(({ addItem, addRecipe }) => {
    Object.keys(RESOURCE_ITEMS).forEach(addItem);
    addRecipe('cook_fish', 'Cook Fish', 'cooked_fish', 1, [{ type: 'raw_fish', amount: 1 }, { type: 'coal_ore', amount: 1 }]);
    addRecipe('honey_bottle', 'Bottle Honey', 'honey_bottle', 1, [{ type: 'honeycomb', amount: 1 }, { type: 'glass', amount: 1 }]);
    addRecipe('cheese', 'Make Cheese', 'cheese', 1, [{ type: 'milk', amount: 2 }]);
    addRecipe('antivenom', 'Brew Antivenom', 'antivenom', 1, [{ type: 'venom_sac', amount: 1 }, { type: 'milk', amount: 1 }]);
    addRecipe('tan_leather', 'Tan Leather', 'leather', 1, [{ type: 'fur', amount: 2 }, { type: 'wood', amount: 1 }]);
    addRecipe('warm_coat', 'Sew Warm Coat', 'warm_coat', 1, [{ type: 'leather', amount: 3 }, { type: 'fur', amount: 2 }]);
    addRecipe('scale_mail', 'Forge Scale Mail', 'scale_mail', 1, [{ type: 'scale', amount: 6 }, { type: 'leather', amount: 2 }]);
    addRecipe('feather_cape', 'Weave Feather Cape', 'feather_cape', 1, [{ type: 'feather', amount: 6 }, { type: 'white_wool', amount: 2 }]);
    addRecipe('feather_bed', 'Build Feather Bed', 'bed', 1, [{ type: 'feather', amount: 4 }, { type: 'white_wool', amount: 2 }, { type: 'planks', amount: 3 }]);
    addRecipe('glow_torch', 'Make Glow Torches', 'torch', 4, [{ type: 'glow_dust', amount: 1 }, { type: 'wood', amount: 1 }]);
    addRecipe('shell_limestone', 'Grind Shells into Limestone', 'limestone', 4, [{ type: 'shell', amount: 1 }, { type: 'sand', amount: 1 }]);
    addRecipe('shadow_obsidian', 'Harden Obsidian with Shadow', 'obsidian', 2, [{ type: 'shadow_essence', amount: 1 }, { type: 'stone', amount: 2 }]);
});

// ---------------------------------------------------------------------------------------
// Loot per species when defeated by the player: [item, min, max, chance].
const RESOURCE_DROPS = {
    sheep: [['white_wool', 1, 2]],
    duck: [['feather', 1, 3]],
    pig: [['leather', 1, 2]],
    giraffe: [['leather', 1, 2]],
    dog: [['fur', 1, 1]],
    cat: [['fur', 1, 1]],
    spider: [['venom_sac', 1, 1, 0.5], ['white_wool', 1, 1, 0.3]],
    cave_monster: [['leather', 1, 3], ['glow_dust', 1, 1, 0.5]],
    macaw: [['feather', 1, 3]],
    fish: [['raw_fish', 1, 1]],
    frog: [['venom_sac', 1, 1, 0.15]],
    turtle: [['shell', 1, 1]],
    camel: [['leather', 1, 2], ['fur', 1, 1, 0.5]],
    lizard: [['scale', 1, 2]],
    scorpion: [['venom_sac', 1, 1], ['shell', 1, 1, 0.25]],
    goat: [['leather', 1, 1], ['fur', 1, 1]],
    horse: [['leather', 1, 2]],
    bee: [['honeycomb', 1, 1, 0.1]],
    firefly: [['glow_dust', 1, 2]],
    shadow: [['shadow_essence', 1, 2]],
    eagle: [['feather', 2, 3]],
    bat: [['leather', 1, 1, 0.5]],
    crab: [['shell', 1, 2]],
    fox: [['fur', 1, 2]],
    rabbit: [['fur', 1, 1]],
    owl: [['feather', 1, 3]],
    vulture: [['feather', 2, 3]], // cannot be defeated today; it sheds feathers when struck
    snake: [['scale', 1, 2], ['venom_sac', 1, 1, 0.6]],
    storm_golem: [['glow_dust', 2, 3], ['iron_ore', 1, 2]],
    wisp: [], // wisp.js drops its own glow_dust when caught
    mole: [['fur', 1, 2]]
};

// Struck but not defeated, some creatures shed something: [item, chance, cooldown seconds].
const RESOURCE_SHEDS = {
    duck: ['feather', 0.4, 8],
    macaw: ['feather', 0.4, 8],
    eagle: ['feather', 0.5, 8],
    owl: ['feather', 0.4, 8],
    vulture: ['feather', 0.4, 8],
    lizard: ['scale', 0.35, 10],
    turtle: ['shell', 0.15, 60],
    firefly: ['glow_dust', 0.3, 20]
};

// Shears trim these for fur (sheep give wool instead).
const RESOURCE_FURRY = ['goat', 'camel', 'horse', 'dog', 'cat', 'fox', 'rabbit', 'mole'];
const RESOURCE_MILKABLE = ['goat', 'camel'];
const RESOURCE_WOOL_REGROW = 150;
const RESOURCE_FUR_REGROW = 120;
const RESOURCE_MILK_REFILL = 60;
const RESOURCE_HIVE_REFILL = 120;
// Birds that now and then drop a feather while they preen.
const RESOURCE_MOLTERS = ['duck', 'macaw', 'owl', 'vulture'];

registerMobUseHandler(function (mob, item) {
    return this.resourcesHarvest(mob, item);
});

registerFrameUpdate(function (delta) {
    this.resourcesUpdate(delta);
});

onMobEvent('hit', function (mob) {
    this.resourcesOnHit(mob);
});

onMobEvent('defeated', function (mob, cause) {
    // Prey taken by a predator leaves nothing; only the player's kills drop loot.
    if (cause && cause !== 'player') return;
    this.resourcesDropLoot(mob);
});

// Shadows never report a defeat: they dissolve and are then removed.
onMobEvent('removed', function (mob) {
    const data = mob.userData;
    if (data.species !== 'shadow' || data.dissolving === undefined || data.resourcesDropped) return;
    if (data.health <= 0) {
        this.resourcesDropLoot(mob);
        return;
    }
    // Chased off by light: sometimes a wisp of it stays behind, if the player was close.
    const player = this.getLocalPlayerPosition();
    if (Math.hypot(player.x - mob.position.x, player.z - mob.position.z) < 16 && Math.random() < 0.5) {
        data.resourcesDropped = true;
        this.resourcesDrop('shadow_essence', 1, mob.position);
    }
});

Object.assign(Game.prototype, {
    resourcesNow() {
        return performance.now() / 1000;
    },

    // A pickup on the ground below `position` (or right there in water / with `inPlace`).
    resourcesDrop(type, amount, position, inPlace = false) {
        if (!type || amount <= 0 || !this.world.blockTypes[type]) return;
        const y = inPlace ? position.y : this.getDropLandingY(position.x, position.z, position.y + 1);
        this.spawnPickup(type, { x: position.x - 0.5, y, z: position.z - 0.5 }, amount);
    },

    resourcesDropLoot(mob) {
        const data = mob.userData;
        if (data.resourcesDropped) return;
        data.resourcesDropped = true;
        const inWater = data.species === 'fish';
        (RESOURCE_DROPS[data.species] || []).forEach(([type, min, max, chance = 1]) => {
            if (Math.random() >= chance) return;
            const amount = min + Math.floor(Math.random() * (max - min + 1));
            this.resourcesDrop(type, amount, mob.position, inWater);
        });
    },

    // Right click on a mob. Returns true when something happened.
    resourcesHarvest(mob, item) {
        const data = mob.userData;
        const species = data.species;
        const now = this.resourcesNow();

        if (data.isHive && data.colony) return this.resourcesTakeHoneycomb(mob, item, now);

        if (item === 'iron_shears' && species === 'sheep') {
            if (data.resourcesShornUntil && now < data.resourcesShornUntil) {
                this.receiveSystemMessage({ text: 'This sheep was shorn recently. Its wool is still growing back' });
                return true;
            }
            data.resourcesShornUntil = now + RESOURCE_WOOL_REGROW;
            this.resourcesApplyShorn(mob, true);
            this.resourcesDrop('white_wool', 1 + Math.floor(Math.random() * 3), mob.position);
            this.resourcesSnip(getMobSpecies('sheep').tone);
            return true;
        }

        if (item === 'iron_shears' && RESOURCE_FURRY.includes(species)) {
            if (data.resourcesTrimmedAt && now - data.resourcesTrimmedAt < RESOURCE_FUR_REGROW) {
                this.receiveSystemMessage({ text: `This ${species.replace('_', ' ')} was trimmed recently` });
                return true;
            }
            data.resourcesTrimmedAt = now;
            this.resourcesDrop('fur', 1, mob.position);
            this.resourcesSnip((getMobSpecies(species) || {}).tone || 300);
            return true;
        }

        if (item === 'glass' && RESOURCE_MILKABLE.includes(species)) {
            if (data.resourcesMilkedAt && now - data.resourcesMilkedAt < RESOURCE_MILK_REFILL) {
                this.receiveSystemMessage({ text: `The ${species} has no milk right now. Try again later` });
                return true;
            }
            if (!this.consumeSelectedBlock()) return false;
            data.resourcesMilkedAt = now;
            this.addInventory('milk', 1);
            this.receiveSystemMessage({ text: `You milked the ${species}` });
            this.playNoiseBurst({ duration: 0.25, volume: 0.02, highpass: 900, lowpass: 3200 });
            this.playTone({ frequency: (getMobSpecies(species) || {}).tone || 300, duration: 0.14, type: 'triangle', volume: 0.015, release: 0.1 });
            return true;
        }
        return false;
    },

    // Honeycomb from a hive: a held torch smokes the bees calm, otherwise they swarm.
    resourcesTakeHoneycomb(hive, item, now) {
        const data = hive.userData;
        if (data.resourcesHarvestedAt && now - data.resourcesHarvestedAt < RESOURCE_HIVE_REFILL) {
            this.receiveSystemMessage({ text: 'The hive has no honeycomb left. Come back later' });
            return true;
        }
        data.resourcesHarvestedAt = now;
        this.resourcesDrop('honeycomb', 1 + Math.floor(Math.random() * 2), hive.position);
        data.shake = 1;
        if (item === 'torch') {
            data.colony.anger = 0;
            this.playNoiseBurst({ duration: 0.6, volume: 0.025, highpass: 500, lowpass: 2500 });
            this.receiveSystemMessage({ text: 'The smoke calms the bees while you take the honeycomb' });
        } else {
            this.provokeColony(hive);
            this.receiveSystemMessage({ text: 'Tip: hold a torch to smoke the bees calm' });
        }
        return true;
    },

    resourcesSnip(tone) {
        this.playNoiseBurst({ duration: 0.05, volume: 0.03, highpass: 2500, lowpass: 7000 });
        setTimeout(() => this.playNoiseBurst({ duration: 0.05, volume: 0.03, highpass: 2500, lowpass: 7000 }), 110);
        this.playTone({ frequency: tone, duration: 0.12, type: 'triangle', volume: 0.015, release: 0.08 });
    },

    // A shorn sheep is slimmer and pinkish grey, without its woolly cap.
    resourcesApplyShorn(mob, shorn) {
        const data = mob.userData;
        const parts = data.modelParts || {};
        const body = parts.body && parts.body.userData.mesh;
        if (!body) return;
        if (shorn) {
            if (data.resourcesShornMesh === body) return;
            data.resourcesShornMesh = body;
            data.resourcesWoolMaterial = body.material;
            const material = body.material.clone();
            material.color = new THREE.Color(0xd9c3bb);
            body.material = material;
            body.scale.set(0.78, 0.9, 0.92);
            if (parts.woolCap) parts.woolCap.visible = false;
        } else {
            if (data.resourcesShornMesh === body && data.resourcesWoolMaterial) {
                body.material.dispose();
                body.material = data.resourcesWoolMaterial;
                body.scale.set(1, 1, 1);
            }
            if (parts.woolCap) parts.woolCap.visible = true;
            data.resourcesShornMesh = null;
            data.resourcesWoolMaterial = null;
        }
    },

    resourcesOnHit(mob) {
        const data = mob.userData;
        // Swatting into a school now and then catches a fish.
        if (data.species === 'fish') {
            if (Math.random() < 0.2) {
                this.emitMobEvent('defeated', mob, 'player');
                this.removeMob(mob);
                this.receiveSystemMessage({ text: 'You caught a fish!' });
            }
            return;
        }
        const shed = RESOURCE_SHEDS[data.species];
        if (!shed) return;
        const [type, chance, cooldown] = shed;
        const now = this.resourcesNow();
        if (data.resourcesShedAt && now - data.resourcesShedAt < cooldown) return;
        if (Math.random() >= chance) return;
        data.resourcesShedAt = now;
        this.resourcesDrop(type, 1, mob.position);
    },

    // Once a second: wool grows back, the shorn look survives model rebuilds, birds molt.
    resourcesUpdate(delta) {
        this.resourcesTickTimer = (this.resourcesTickTimer || 0) - delta;
        if (this.resourcesTickTimer > 0) return;
        this.resourcesTickTimer = 1;
        this.resourcesTick();
    },

    resourcesTick() {
        if (!this.ambientMobs || !this.world) return;
        const now = this.resourcesNow();
        const player = this.getLocalPlayerPosition();
        this.ambientMobs.forEach((mob) => {
            const data = mob.userData;
            if (data.resourcesShornUntil) {
                if (now >= data.resourcesShornUntil) {
                    data.resourcesShornUntil = 0;
                    this.resourcesApplyShorn(mob, false);
                } else {
                    this.resourcesApplyShorn(mob, true);
                }
            }
            if (RESOURCE_MOLTERS.includes(data.species) && Math.random() < 1 / 400 &&
                Math.hypot(player.x - mob.position.x, player.z - mob.position.z) < 24) {
                this.resourcesDrop('feather', 1, mob.position);
            }
        });
    },

    // G key on one of these items: eat or drink it, or learn what a piece of gear does.
    resourcesConsume(type) {
        const def = RESOURCE_ITEMS[type];
        if (!def) return false;
        if (def.describe) {
            this.receiveSystemMessage({ text: `${def.name}: ${def.describe}` });
            return true;
        }
        const poisoned = Boolean(this.poison);
        const useful = this.health < this.maxHealth || (def.cures && poisoned) || def.immunity;
        if (!useful) {
            this.receiveSystemMessage({ text: 'You are already at full health' });
            return true;
        }
        if (!this.consumeSelectedBlock()) return false;
        const healed = Math.min(def.food || 0, this.maxHealth - this.health);
        this.health = Math.min(this.maxHealth, this.health + (def.food || 0));
        this.updateHealthUI();
        const notes = [];
        if (healed > 0) notes.push(`recovered ${healed} health`);
        if (def.cures && poisoned) {
            this.poison = null;
            notes.push('the poison is gone');
        }
        if (def.immunity) {
            this.resourcesPoisonImmuneUntil = this.resourcesNow() + def.immunity;
            notes.push(`venom will not harm you for ${Math.round(def.immunity / 60)} minutes`);
        }
        if (def.bottle) {
            this.addInventory('glass', 1);
            this.playNoiseBurst({ duration: 0.3, volume: 0.018, highpass: 300, lowpass: 1400 });
        } else {
            this.playTone({ frequency: 600, duration: 0.05, type: 'triangle', volume: 0.025, release: 0.05 });
        }
        const verb = def.bottle ? 'drank' : 'ate';
        this.receiveSystemMessage({ text: `You ${verb} ${def.name}${notes.length ? ` and ${notes.join(', ')}` : ''}` });
        return true;
    },

    // Called by applyDamage: carried gear softens blows and falls; antivenom stops poison.
    resourcesAdjustDamage(amount, type) {
        if (amount <= 0) return amount;
        if (type === 'poison') {
            if (this.resourcesPoisonImmuneUntil && this.resourcesNow() < this.resourcesPoisonImmuneUntil) {
                this.poison = null;
                return 0;
            }
            return amount;
        }
        if (type === 'fall') {
            return this.getInventoryCount('feather_cape') > 0 ? Math.floor(amount * (1 - RESOURCE_ITEMS.feather_cape.fallGuard)) : amount;
        }
        if (type === 'mob' && amount > 1) {
            const armour = ['scale_mail', 'warm_coat']
                .filter((type) => this.getInventoryCount(type) > 0)
                .reduce((best, type) => Math.max(best, RESOURCE_ITEMS[type].armour), 0);
            return Math.max(1, amount - armour);
        }
        return amount;
    }
});

registerDamageModifier(function (amount, type) {
    return this.resourcesAdjustDamage(amount, type);
});
