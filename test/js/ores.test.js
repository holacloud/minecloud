// Node tests for the metals of the world: js/terrainGen.js against pkg/terrain, the new blocks, how
// they smelt, what scans for them and the guide. Run with: node --test test/js/ores.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const JS = path.join(STATIC, 'js');
const GUIDE = path.join(STATIC, 'guide');

const ORES = ['coal_ore', 'iron_ore', 'copper_ore', 'tin_ore', 'zinc_ore', 'lead_ore', 'silver_ore', 'gold_ore'];
const NEW_ORES = ['copper_ore', 'tin_ore', 'zinc_ore', 'lead_ore', 'silver_ore'];
const METALS = { copper_ore: 'copper_block', tin_ore: 'element_sn', zinc_ore: 'element_zn', lead_ore: 'element_pb', silver_ore: 'element_ag' };

function loadGenerator() {
    const context = vm.createContext({ Math });
    vm.runInContext(fs.readFileSync(path.join(JS, 'terrainGen.js'), 'utf8'), context);
    vm.runInContext('Object.assign(this, { columnSurface, blockAt, soilDepthAt, groundBlockAt, oreAt, treeAt, isNaturalFossil, WATER_LEVEL, BEDROCK_Y, hash3 })', context);
    return context;
}

// The block of a cell with any fossil taken back to the rock or the soil it lies in, as withoutFossil does in
// pkg/terrain/fossils_test.go: the fingerprints of the ores are older than the fossils and say that not an
// ore moved when they came (test/js/fossils.test.js has the fingerprint of the fossils).
function blockWithoutFossil(generator, x, y, z, surface, soil) {
    const name = generator.blockAt(x, y, z, surface, soil);
    return generator.isNaturalFossil(name) ? generator.groundBlockAt(x, y, z, surface, soil) : name;
}

const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');

test('terrainGen.js makes the same ores as terrain.Generate, block for block', () => {
    const generator = loadGenerator();
    const go = read(ROOT, 'pkg', 'terrain', 'ores_test.go');
    const fingerprint = go.match(/const oreFingerprint = "([0-9a-f]{40})"/)[1];
    const [x0, z0, x1, z1] = go.match(/var oreRegion = \[4\]int\{(-?\d+), (-?\d+), (-?\d+), (-?\d+)\}/).slice(1).map(Number);
    const hash = crypto.createHash('sha1');
    const seen = {};
    for (let x = x0; x < x1; x++) {
        for (let z = z0; z < z1; z++) {
            const surface = generator.columnSurface(x, z);
            const soil = generator.soilDepthAt(x, z, surface);
            for (let y = generator.BEDROCK_Y; y <= surface.height; y++) {
                const name = blockWithoutFossil(generator, x, y, z, surface, soil);
                if (name.endsWith('_ore')) seen[name] = (seen[name] || 0) + 1;
                hash.update(`${name}\n`);
            }
        }
    }
    for (const ore of ORES) assert.ok(seen[ore] > 0, `no ${ore} in the region`);
    assert.equal(hash.digest('hex'), fingerprint);
});

test('from y = 2 up nothing moved when the world went deeper, on this side too', () => {
    const generator = loadGenerator();
    const go = read(ROOT, 'pkg', 'terrain', 'ores_test.go');
    const fingerprint = go.match(/const oreAboveFingerprint = "([0-9a-f]{40})"/)[1];
    const from = Number(go.match(/const oreAboveY = (\d+)/)[1]);
    const [x0, z0, x1, z1] = go.match(/var oreRegion = \[4\]int\{(-?\d+), (-?\d+), (-?\d+), (-?\d+)\}/).slice(1).map(Number);
    const hash = crypto.createHash('sha1');
    for (let x = x0; x < x1; x++) {
        for (let z = z0; z < z1; z++) {
            const surface = generator.columnSurface(x, z);
            const soil = generator.soilDepthAt(x, z, surface);
            for (let y = from; y <= surface.height; y++) hash.update(`${blockWithoutFossil(generator, x, y, z, surface, soil)}\n`);
        }
    }
    assert.equal(hash.digest('hex'), fingerprint);
});

test('bedrock is all of y = -14 and about half of y = -13, with no ore in it', () => {
    const generator = loadGenerator();
    assert.equal(generator.BEDROCK_Y, -14);
    assert.match(read(ROOT, 'pkg', 'terrain', 'climate.go'), /BedrockY\s+= -14\b/);
    assert.match(read(JS, 'terrainGen.js'), /const VEIN_FLOOR = -12;/);
    assert.match(read(ROOT, 'pkg', 'terrain', 'ores.go'), /veinFloor\s+= -12\b/);
    let rough = 0;
    let cells = 0;
    for (let x = -40; x < 40; x++) {
        for (let z = -40; z < 40; z++) {
            const surface = generator.columnSurface(x, z);
            const soil = generator.soilDepthAt(x, z, surface);
            assert.equal(generator.blockAt(x, -14, z, surface, soil), 'bedrock');
            const above = generator.blockAt(x, -13, z, surface, soil);
            assert.equal(above === 'bedrock', generator.hash3(x, -13, z, 5) < 0.5, `${x},${z}`);
            if (above === 'bedrock') rough++;
            else assert.ok(above === 'stone' || above.endsWith('_ore'), above);
            const next = generator.blockAt(x, -12, z, surface, soil);
            assert.ok(next === 'stone' || next.endsWith('_ore'), next);
            cells++;
        }
    }
    assert.ok(rough > cells * 0.4 && rough < cells * 0.6, `${rough} of ${cells}`);
});

test('the rock under the ores is what it always was, on this side too', () => {
    const generator = loadGenerator();
    for (let x = -260; x < -200; x++) {
        for (let z = -60; z < 0; z++) {
            const surface = generator.columnSurface(x, z);
            const soil = generator.soilDepthAt(x, z, surface);
            for (let y = generator.BEDROCK_Y; y <= surface.height; y++) {
                const ground = generator.groundBlockAt(x, y, z, surface, soil);
                assert.ok(!ground.endsWith('_ore'), `${ground} from the rock function`);
                if (ground === 'bedrock') assert.equal(generator.oreAt(x, y, z, surface, soil), '');
            }
        }
    }
});

test('every ore has a colour in the viewer palette, and no two look alike', () => {
    const { blocks } = require(path.join(ROOT, 'tools', 'viewerPalette.js')).buildPalette();
    const colours = ORES.map((ore) => {
        assert.ok(blocks[ore], ore);
        assert.equal(blocks[ore][1], 0, `${ore} is solid`);
        return blocks[ore][0];
    });
    assert.equal(new Set(colours).size, ORES.length);
    const stone = blocks.stone[0];
    const channels = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const far = (a, b) => channels(a).reduce((sum, v, i) => sum + Math.abs(v - channels(b)[i]), 0);
    for (let i = 0; i < ORES.length; i++) {
        assert.ok(far(colours[i], stone) >= 30, `${ORES[i]} is lost in the stone from afar`);
        for (let j = i + 1; j < ORES.length; j++) assert.ok(far(colours[i], colours[j]) >= 20, `${ORES[i]} and ${ORES[j]}`);
    }
    const committed = JSON.parse(read(ROOT, 'pkg', 'web', 'viewer_block_palette.json'));
    for (const ore of ORES) assert.deepEqual(committed[ore], blocks[ore], `${ore}: run node tools/viewerPalette.js`);
});

test('the terrain viewer paints every ore in its own colour', () => {
    const worker = read(JS, 'viewer', 'tileWorker.js');
    const colours = new Set();
    for (const ore of ORES) {
        const found = worker.match(new RegExp(`${ore}: \\[(0x[0-9a-f]+), (0x[0-9a-f]+), (0x[0-9a-f]+)\\]`));
        assert.ok(found, `tiles would paint ${ore} as stone`);
        colours.add(found.slice(1).join());
    }
    assert.equal(colours.size, ORES.length);
});

test('every new ore is a block that breaks and drops as the old ones do, with its own texture', () => {
    const world = read(JS, 'world.js');
    const tinted = new Set();
    for (const ore of ORES) {
        assert.match(world, new RegExp(`${ore}: \\{ color: 0x808080, ore: 0x[0-9A-F]+, name: '[A-Z][a-z]+ Ore', breakDuration: 1\\.\\d+ \\}`), ore);
        const face = world.match(new RegExp(`case '${ore}': return uniform\\(spec\\('(ore\\w*)', (0x[0-9a-f]+)\\)\\)`));
        assert.ok(face, `${ore} has no texture`);
        tinted.add(`${face[1]} ${face[2]}`);
    }
    assert.equal(tinted.size, ORES.length, 'two ores with the same texture');
    const textures = read(JS, 'blockTextures.js');
    for (const pattern of ['ore(s, tint, seed)', 'ore_cubes(s, tint, seed)', 'ore_crystals(s, tint, seed)']) assert.ok(textures.includes(pattern), pattern);
    // They drop themselves: nothing in getDropTypeForBlock turns ore into anything else.
    const at = world.indexOf('getDropTypeForBlock(type, x, y, z) {');
    assert.ok(at > 0, 'getDropTypeForBlock is where it was');
    assert.ok(!world.slice(at, at + 600).includes('_ore'));
});

test('the C menu smelts each ore with coal, and no recipe went away', () => {
    const smelters = read(JS, 'game', 'smelters.js');
    assert.ok(smelters.includes("addRecipe(`smelt_${ore}`, `Smelt ${name}`, metal, 1, [{ type: ore, amount: 1 }, { type: 'coal_ore', amount: 1 }])"));
    for (const [ore, metal] of Object.entries(METALS)) assert.match(smelters, new RegExp(`\\['${ore}', '${metal}', '`), ore);
    // The recipes the owner is still deciding about.
    const game = read(JS, 'game.js');
    assert.ok(game.includes("addRecipe(`element_${symbol}`, `Synthesize ${symbol.toUpperCase()} Block`, `element_${symbol}`, 1, [{ type: 'stone', amount: 1 }, { type: 'coal_ore', amount: 1 }]);"));
    assert.ok(game.includes("addRecipe(type, `Refine ${this.formatItemName(type)}`, type, 2, [{ type: input, amount: 2 }, { type: 'sand', amount: 1 }]);"));
});

test('the foundry gives more than the menu, and the same as the server', () => {
    const appliances = read(JS, 'game', 'appliances.js');
    const go = read(ROOT, 'pkg', 'network', 'appliances.go');
    for (const [ore, metal] of Object.entries(METALS)) {
        const js = appliances.match(new RegExp(`${ore}: \\{ out: '${metal}', in: 1, yield: (\\d+), seconds: (\\d+) \\}`));
        const server = go.match(new RegExp(`"${ore}":\\s*\\{Out: "${metal}", In: 1, Yield: (\\d+), Seconds: (\\d+)\\}`));
        assert.ok(js && server, ore);
        assert.deepEqual(js.slice(1), server.slice(1), ore);
        assert.ok(Number(js[1]) > 1, `${ore}: the menu gives 1`);
    }
});

test('what looks for natural blocks knows the new ores', () => {
    const beaver = read(JS, 'game', 'beaver.js');
    const natural = beaver.slice(beaver.indexOf('BEAVER_NATURAL_BLOCKS = new Set'), beaver.indexOf(']);', beaver.indexOf('BEAVER_NATURAL_BLOCKS = new Set')));
    for (const ore of ORES) assert.ok(natural.includes(`'${ore}'`), ore);
    assert.match(read(JS, 'game', 'audio.js'), /endsWith\('_ore'\)/);
});

// ---- The guide ----

const page = (id, lang) => {
    const name = fs.readdirSync(GUIDE).find((file) => file.startsWith(`${id}_${lang}_`));
    assert.ok(name, `page ${id} ${lang}`);
    return fs.readFileSync(path.join(GUIDE, name), 'utf8');
};

test('the guide: 248 and 249 in both languages, in the indexes and the catalogue', () => {
    const titles = { 248: { ES: 'Cómo encontrar metales', EN: 'How to find metals' }, 249: { ES: 'Cómo se funden los metales', EN: 'How metals are smelted' } };
    for (const id of [248, 249]) {
        for (const lang of ['ES', 'EN']) {
            assert.match(page(id, lang), new RegExp(`^# ${titles[id][lang]}`), `${id} ${lang}`);
            assert.ok(fs.readdirSync(GUIDE).includes(`${id}_${lang}_${titles[id][lang].replace(/ /g, '_')}.md`));
        }
        assert.match(read(GUIDE, 'README.md'), new RegExp(`^\\| ${id} \\| ${titles[id].ES} \\| ${titles[id].EN} \\|`, 'm'));
    }
    for (const lang of ['ES', 'EN']) {
        for (const from of [0, 48, 53, 59, 115, 235]) assert.match(page(from, lang), /\(248\)/, `${from} ${lang}`);
        assert.match(page(248, lang), /\(249\)/);
        assert.match(page(249, lang), /\(248\)/);
    }
    assert.match(read(ROOT, 'GUIA.md'), /248/);
});

test('the guide puts the bottom of the world where the generator does', () => {
    const { BEDROCK_Y } = loadGenerator();
    const height = `−${-BEDROCK_Y}`;
    for (const lang of ['ES', 'EN']) {
        for (const id of [50, 99, 248]) {
            const text = page(id, lang);
            assert.ok(text.includes(`**y = ${height}**`) || text.includes(`**${height}**`), `${id} ${lang}`);
            assert.ok(text.includes('−5'), `${id} ${lang}: land already explored keeps the old floor`);
            assert.ok(!text.includes('**y = −5**') && !text.includes('**−5**'), `${id} ${lang}: the old floor as if it were the floor`);
        }
    }
    assert.ok(read(ROOT, 'GUIA.md').includes(`y = ${height}`));
});

test('the guide says what the generator and the foundry do', () => {
    const appliances = read(JS, 'game', 'appliances.js');
    for (const lang of ['ES', 'EN']) {
        const find = page(248, lang);
        const smelt = page(249, lang);
        for (const ore of ORES) assert.match(find, new RegExp(`item:${ore}`), `${lang} ${ore}`);
        for (const [ore, metal] of Object.entries(METALS)) {
            const recipe = appliances.match(new RegExp(`${ore}: \\{ out: '${metal}', in: 1, yield: (\\d+), seconds: (\\d+) \\}`));
            const row = new RegExp(`1 \`${ore}\`.*\\*\\*${recipe[1]}\\*\\* \`${metal}\`.*\\b${recipe[2]} s.*1 \`${ore}\` \\+ 1 \`coal_ore\``);
            assert.match(smelt, row, `${lang} ${ore}`);
        }
        // Each metal's own page says where its ore is, and sends the reader to the page on finding it.
        for (const [id, ore] of [[165, 'copper_ore'], [166, 'zinc_ore'], [167, 'silver_ore'], [168, 'tin_ore'], [174, 'lead_ore']]) {
            const metalPage = page(id, lang);
            assert.match(metalPage, new RegExp(`\`${ore}\``), `${id} ${lang}`);
            assert.match(metalPage, /\(248\)/, `${id} ${lang}`);
            assert.match(metalPage, /\(235\)/, `${id} ${lang}`);
            // The old way stays, and is still said.
            assert.match(metalPage, /1 `stone` \+ 1 `coal_ore`/, `${id} ${lang}`);
        }
    }
    assert.doesNotMatch(page(59, 'ES'), /Ninguno aparece en el mundo/);
    assert.doesNotMatch(page(59, 'EN'), /None of them appear in the world|None of them is found/);
    // The old rule of the ores is gone from the page on ores.
    assert.doesNotMatch(page(53, 'ES'), /~1,8 %/);
    assert.doesNotMatch(page(53, 'EN'), /~1\.8 %/);
});

test('the guide says mined copper, iron and gold serve the lab, and no longer that they do not', () => {
    const conversions = { 165: ['copper_block', 'element_cu', 'CU from Copper Block'], 162: ['iron_block', 'element_fe', 'FE from Iron Block'], 172: ['gold_block', 'element_au', 'AU from Gold Block'] };
    const guia = read(ROOT, 'GUIA.md');
    for (const lang of ['ES', 'EN']) {
        for (const [id, [block, element, recipe]] of Object.entries(conversions)) {
            assert.ok(page(id, lang).includes(`| 1 \`${element}\` (*Extract ${recipe}*) | 1 \`${block}\` |`), `${id} ${lang}`);
            assert.ok(page(249, lang).includes(`1 \`${block}\``) && page(249, lang).includes(`1 \`${element}\``), `249 ${lang} ${block}`);
            assert.ok(page(60, lang).includes(`1 \`${block}\``), `60 ${lang} ${block}`);
        }
        assert.match(page(248, lang), /\(117\)/, `248 ${lang}`);
        assert.match(page(59, lang), /\(117\)/, `59 ${lang}`);
    }
    for (const stale of [page(165, 'ES'), page(249, 'ES')]) assert.doesNotMatch(stale, /no lo acepta/);
    for (const stale of [page(165, 'EN'), page(249, 'EN')]) assert.doesNotMatch(stale, /does not take it/);
    for (const [id, lang, stale] of [[162, 'ES', /no en este bloque/], [172, 'ES', /no en este bloque/], [162, 'EN', /not into this block/], [172, 'EN', /not into this block/]]) {
        assert.doesNotMatch(page(id, lang), stale, `${id} ${lang}`);
    }
    for (const [, [block, element]] of Object.entries(conversions)) assert.ok(guia.includes(`| 1 \`${element}\` | 1 \`${block}\` |`), block);
});

test('the page on finding metals warns that lead is poisonous', () => {
    assert.match(page(248, 'ES'), /plomo es tóxico/i);
    assert.match(page(248, 'EN'), /lead is toxic/i);
});
