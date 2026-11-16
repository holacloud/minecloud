// Node tests for what the palaces share (js/game/construction_palace_common.js): the themes and what grows in
// them, the site (levelled, graded to the terrain, dressed with the theme's ground, a road and trees on the
// slope, and refused where it does not fit), the grounds inside a plan, the helpers, and the stock of every
// palace design against what the server takes (stockItems and the limits of pkg/network/construction_stock.go).
// Run with: node --test test/js/construction_palace_common.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const JS = path.join(ROOT, 'pkg', 'web', 'static', 'js');

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
}
class Stub { constructor() { this.attributes = {}; } setAttribute() {} addGroup() {} setIndex() {} computeBoundingBox() {} computeBoundingSphere() {} }

const PALACES = ['andalusi', 'baroque', 'oriental', 'nordic', 'maya', 'volcanic'];

function loadGame() {
    const context = vm.createContext({
        console, Math, Map, Set, Object, Array, Uint8Array, Uint16Array, Int16Array, Int32Array, Float32Array,
        performance: { now: () => 0 },
        THREE: { Vector3, Vector4: Vector3, BoxGeometry: Stub, BufferGeometry: Stub, Float32BufferAttribute: Stub },
        Worker: class { postMessage() {} },
        document: { addEventListener() {} },
        localStorage: { getItem: () => null, setItem() {} },
        requestAnimationFrame: () => 0
    });
    context.window = context;
    for (const file of ['extensions.js', 'gameLang.js', 'chunkStore.js', 'blockShapes.js', 'chunkMesher.js', 'camera.js', 'mobSpecies.js', 'blockTextures.js', 'world.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, file), 'utf8'), context, { filename: file });
    }
    vm.runInContext('class Game {}; function resourcesDrawSprite() { return () => {}; } function resourcesDisplayMesh() { return null; }', context);
    const game = ['block_edits.js', 'joinery.js', 'chemistry.js', 'electricity.js', 'blueprints.js', 'constructions.js', 'furniture.js', 'seating.js', 'storage.js', 'decor.js', 'mirrors.js',
        'smelters.js', 'microbes.js', 'microscope_text.js', 'microscope.js', 'palace_decor.js', 'tabletop.js', 'construction_castle.js', 'construction_palace_common.js', ...PALACES.map((name) => `construction_palace_${name}.js`)];
    for (const file of game) vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, Game, CONSTRUCTION_DESIGNS, constructionPlan, ConstructionBuilder, chunkIndex,
        CONSTRUCTION_PALACE_THEMES, CONSTRUCTION_PALACE_DECOR_REACH, CONSTRUCTION_PALACE_DECOR_HEIGHT, CONSTRUCTION_STOCK_MAX, CONSTRUCTION_STOCK_TOTAL,
        constructionPalaceSite, constructionPalaceGrounds, constructionPalaceTree, constructionPalacePut, constructionPalaceHash, constructionPalacePick,
        constructionPalaceBed, constructionPalaceMirrorZ, constructionPalaceSign, constructionPalaceChest });`, context);
    return context;
}

const ctx = loadGame();

// A flat world of stone with loaded chunks around the origin; ground(x, z) is the height of the top block.
function makeWorld(ground = () => 3, radius = 4) {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    world.getChunkMaterial = (type) => `material:${type}`;
    const stone = world.registry.id('stone');
    for (let cx = -radius; cx < radius; cx++) {
        for (let cz = -radius; cz < radius; cz++) {
            const column = new ctx.ChunkColumn(cx, cz);
            for (let lx = 0; lx < 16; lx++) {
                for (let lz = 0; lz < 16; lz++) {
                    const top = ground(cx * 16 + lx, cz * 16 + lz);
                    for (let y = -16; y <= top; y++) column.blocks[ctx.chunkIndex(lx, y, lz)] = stone;
                }
            }
            world.columns.set(world.chunkKey(cx, cz), column);
        }
    }
    return world;
}

function makeGame(world, { at = { x: 0.5, y: 5.62, z: 0.5 } } = {}) {
    const game = new ctx.Game();
    const messages = [];
    const sent = [];
    Object.assign(game, {
        world,
        creativeMode: true,
        receiveSystemMessage: ({ text }) => messages.push(text),
        cameraController: { eyeHeight: 1.62, getPosition: () => at },
        getInteractionRay: () => ({ direction: new Vector3(0, 0, 1) }),
        network: { connected: true, ws: { bufferedAmount: 0 }, send: (type, payload) => sent.push({ type, payload }) }
    });
    return { game, messages, sent };
}

function run(game, frames = 200000) {
    for (let i = 0; i < frames && (game.constructionJob || game.constructionWaiting || game.constructionScan); i++) game.constructionUpdate(1 / 60);
    assert.ok(!game.constructionJob && !game.constructionWaiting && !game.constructionScan, 'it ends');
}

function surfaceAt(world, x, z, from = 60) {
    for (let y = from; y >= -16; y--) {
        const type = world.getBlockTypeAt(x, y, z);
        if (type && type !== 'water' && !/(leaves|_wood|^wood|cactus|tall_grass|flower)/.test(type)) return y;
    }
    return null;
}

const blocks = makeWorld(() => 3, 1);
const defOf = (type) => blocks.blockTypes[type];
const baseOf = (type) => (defOf(type) && defOf(type).variantOf) || type;
const plain = (value) => JSON.parse(JSON.stringify(value));

// A small palace of each theme for the tests: the site and its grounds, nothing else. Its box is BOX wide,
// GROUND is its ground layer, RIM its rim; the anchor ends up 3 ahead of the player at (0, 0), looking +z.
const BOX = 41;
const GROUND = 4;
const RIM = 12;
const MID = 20;
for (const theme of Object.keys(ctx.CONSTRUCTION_PALACE_THEMES)) {
    ctx.CONSTRUCTION_DESIGNS[`palace_test_${theme}`] = {
        label: `Test ${theme}`, size: [BOX, 24, BOX], foundation: 'dirt', anchorX: MID, groundY: GROUND, rate: 4000,
        start: [MID, GROUND + 1, 1], levels: [],
        site: ctx.constructionPalaceSite({ label: `Test ${theme}`, theme, groundY: GROUND, rim: RIM }),
        generate: (b) => {
            ctx.constructionPalaceGrounds(b, theme, { x0: RIM, z0: RIM, x1: BOX - 1 - RIM, z1: BOX - 1 - RIM, y: GROUND });
            b.set(MID, GROUND + 1, MID, 'stone_bricks');
        }
    };
}
// The box in the world: x from -MID, z from 3.
const toWorld = (lx, lz) => [lx - MID, lz + 3];

test('every theme: its ground, soil, road and decorations are blocks, and each decoration stays within its reach', () => {
    for (const [name, land] of Object.entries(plain(ctx.CONSTRUCTION_PALACE_THEMES))) {
        for (const type of [...land.ground.map(([type]) => type), land.soil, land.road, land.roadStairs]) {
            assert.ok(defOf(type) && !defOf(type).itemOnly, `${name}: ${type}`);
        }
        assert.equal(defOf(land.roadStairs).shape, 'stairs', name);
        assert.ok(land.density > 0 && land.density < 0.2, name);
        for (const [kind] of land.decor) {
            for (let salt = 0; salt < 6; salt++) {
                const cells = [];
                ctx.constructionPalaceTree((x, y, z, type) => cells.push({ x, y, z, type }), kind, 0, 1, 0, salt);
                assert.ok(cells.length > 0, `${name}: ${kind} draws nothing`);
                for (const { x, y, z, type } of cells) {
                    assert.ok(defOf(type) && !defOf(type).itemOnly, `${name}: ${kind} puts ${type}`);
                    assert.ok(Math.max(Math.abs(x), Math.abs(z)) <= ctx.CONSTRUCTION_PALACE_DECOR_REACH, `${name}: ${kind} reaches ${x},${z}`);
                    assert.ok(y >= 0 && y <= ctx.CONSTRUCTION_PALACE_DECOR_HEIGHT, `${name}: ${kind} at height ${y}`);
                }
            }
        }
    }
    assert.throws(() => ctx.constructionPalaceSite({ label: 'x', theme: 'moon', groundY: 4 }), /moon/);
    assert.throws(() => ctx.constructionPalaceTree(() => {}, 'baobab', 0, 0, 0), /baobab/);
});

test('the picker and the hash: the same cell always gets the same, in proportion to the weights', () => {
    const palette = [['stone_bricks', 70], ['stone', 20], ['cobblestone', 10]];
    const counts = { stone_bricks: 0, stone: 0, cobblestone: 0 };
    for (let x = 0; x < 100; x++) {
        for (let z = 0; z < 100; z++) {
            const type = ctx.constructionPalacePick(palette, x, 5, z);
            assert.equal(type, ctx.constructionPalacePick(palette, x, 5, z));
            counts[type]++;
        }
    }
    assert.ok(counts.stone_bricks > 6300 && counts.stone_bricks < 7700, JSON.stringify(counts));
    assert.ok(counts.cobblestone > 600 && counts.cobblestone < 1400, JSON.stringify(counts));
    for (let i = 0; i < 1000; i++) {
        const h = ctx.constructionPalaceHash(i, -i, i * 3, 7);
        assert.ok(h >= 0 && h < 1);
    }
});

test('the site on rolling land: level inside, graded to the terrain at the edge, the theme\'s ground, a road and trees on the slope', () => {
    const roll = (x, z) => Math.round(6 + 3 * Math.sin(x / 9) + 2 * Math.cos(z / 11));
    const world = makeWorld(roll);
    const { game, messages, sent } = makeGame(world, { at: { x: 0.5, y: roll(0, 0) + 2.62, z: 0.5 } });
    game.constructionCommand('build', ['palace_test_desert']);
    run(game);
    assert.ok(sent.length > 1000, messages.join(' | '));
    assert.ok(!messages.some((text) => /Find/.test(text)), messages.join(' | '));
    // Level inside the rim: one height of ground everywhere (a rock of the grounds may stand on it).
    const levels = [];
    for (let lz = RIM; lz < BOX - RIM; lz++) {
        for (let lx = RIM; lx < BOX - RIM; lx++) levels.push(surfaceAt(world, ...toWorld(lx, lz)));
    }
    const level = Math.min(...levels);
    assert.ok(levels.filter((y) => y === level).length > 0.9 * levels.length, `level inside: ${[...new Set(levels)]}`);
    for (let lz = RIM; lz < BOX - RIM; lz++) {
        for (let lx = RIM; lx < BOX - RIM; lx++) assert.ok(['sand', 'sandstone'].includes(world.getBlockTypeAt(...[toWorld(lx, lz)[0], level, toWorld(lx, lz)[1]])), `the ground at ${lx},${lz}`);
    }
    // The outer edge within 2 of the terrain, and no cliff going in.
    for (let lz = 0; lz < BOX; lz += 3) {
        const [x, z] = toWorld(0, lz);
        assert.ok(Math.abs(surfaceAt(world, x, z) - roll(x, z)) <= 2, `edge at ${x},${z}`);
        for (let lx = 0; lx < RIM; lx++) {
            const step = Math.abs(surfaceAt(world, ...toWorld(lx + 1, lz)) - surfaceAt(world, ...toWorld(lx, lz)));
            assert.ok(step <= 3, `a cliff of ${step} at local ${lx},${lz}`);
        }
    }
    // The theme's ground on the rim, the road of cut sandstone and its stairs in front, trees on the slope.
    const tops = new Map();
    const decor = new Set();
    for (let lz = 0; lz < BOX; lz++) {
        for (let lx = 0; lx < BOX; lx++) {
            if (Math.min(lx, lz, BOX - 1 - lx, BOX - 1 - lz) >= RIM) continue;
            const [x, z] = toWorld(lx, lz);
            const y = surfaceAt(world, x, z);
            const type = baseOf(world.getBlockTypeAt(x, y, z));
            tops.set(type, (tops.get(type) || 0) + 1);
            for (let k = 1; k < 12; k++) {
                const over = world.getBlockTypeAt(x, y + k, z);
                if (over) decor.add(baseOf(over));
            }
        }
    }
    assert.ok(tops.get('sand') > 500, JSON.stringify([...tops]));
    assert.ok(tops.get('sandstone') > 50, JSON.stringify([...tops]));
    assert.ok(tops.get('cut_sandstone') > 0 || tops.get('sandstone_stairs') > 0, JSON.stringify([...tops]));
    assert.ok(!tops.has('grass') && !tops.has('stone'), JSON.stringify([...tops]));
    assert.ok([...decor].some((type) => ['jungle_wood', 'cactus', 'acacia_leaves', 'jungle_leaves'].includes(type)), [...decor].join(' '));
    // The road from the player's feet to the level: never more than a step up, nothing on it.
    for (let away = 0; away < RIM; away++) {
        const here = surfaceAt(world, 0, 3 + away);
        const next = surfaceAt(world, 0, 4 + away);
        assert.ok(Math.abs(next - here) <= 1, `the road at ${away}`);
        assert.equal(world.getBlockTypeAt(0, here + 1, 3 + away), null, `something on the road at ${away}`);
    }
});

test('every theme dresses the rim with its own ground and grows its own things there; the grounds inside too', () => {
    const wood = /(_wood|^wood|leaves|cactus|basalt|obsidian|magma_rock|packed_ice|tall_grass|flower|stone|sandstone)$/;
    for (const [theme, land] of Object.entries(plain(ctx.CONSTRUCTION_PALACE_THEMES))) {
        const world = makeWorld(() => 3);
        const { game, messages } = makeGame(world);
        game.constructionCommand('build', [`palace_test_${theme}`]);
        run(game);
        assert.ok(!messages.some((text) => /Find|fit/.test(text)), `${theme}: ${messages.join(' | ')}`);
        const grounds = new Set(land.ground.map(([type]) => type));
        let rimTops = 0;
        let decorated = 0;
        let insideDecor = 0;
        for (let lz = 0; lz < BOX; lz++) {
            for (let lx = 0; lx < BOX; lx++) {
                const [x, z] = toWorld(lx, lz);
                const onRim = Math.min(lx, lz, BOX - 1 - lx, BOX - 1 - lz) < RIM;
                const nearRoad = Math.abs(x) <= 3 && lz < RIM + 2;
                // The level is 3: the ground layer, then what stands on it.
                const top = baseOf(world.getBlockTypeAt(x, 3, z));
                if (onRim && !nearRoad) {
                    assert.ok(grounds.has(top), `${theme}: ${top} on the rim at ${lx},${lz}`);
                    rimTops++;
                }
                const over = world.getBlockTypeAt(x, 4, z);
                if (over && wood.test(baseOf(over))) {
                    if (onRim) decorated++;
                    else if (!(lx === MID && lz === MID)) insideDecor++;
                }
                if (onRim && nearRoad && lz < RIM) assert.equal(over, null, `${theme}: something on the road at ${lx},${lz}`);
            }
        }
        assert.ok(rimTops > 1000, `${theme}: ${rimTops}`);
        assert.ok(decorated > 0, `${theme}: nothing grows on the rim`);
        assert.ok(insideDecor > 0, `${theme}: nothing grows in the grounds`);
    }
});

test('the site refuses a mountain, a lake and too much earth before any block moves', () => {
    const cases = [
        ['a mountain', (x, z) => (z > 20 ? 110 : 3), /mountain|rises|flatter/],
        ['a cliff', (x, z) => (z > 20 ? 45 : 3), /rises|flatter|earth/]
    ];
    for (const [name, ground, pattern] of cases) {
        const world = makeWorld(ground);
        const { game, messages, sent } = makeGame(world, { at: { x: 0.5, y: ground(0, 0) + 2.62, z: 0.5 } });
        game.constructionCommand('build', ['palace_test_plains']);
        run(game);
        assert.equal(sent.length, 0, name);
        assert.ok(messages.some((text) => pattern.test(text)), `${name}: ${messages.join(' | ')}`);
    }
    const world = makeWorld(() => -2);
    const water = world.registry.id('water');
    for (const column of world.columns.values()) {
        for (let lx = 0; lx < 16; lx++) {
            for (let lz = 0; lz < 16; lz++) {
                for (let y = -1; y <= 3; y++) column.blocks[ctx.chunkIndex(lx, y, lz)] = water;
            }
        }
    }
    const { game, messages, sent } = makeGame(world);
    game.constructionCommand('build', ['palace_test_snow']);
    run(game);
    assert.equal(sent.length, 0);
    assert.ok(messages.some((text) => text.includes('mostly water')), messages.join(' | '));
});

test('grounds: the theme\'s ground on the layer asked, nothing where free() says no, trees with room round them', () => {
    const b = new ctx.ConstructionBuilder([30, 20, 30]);
    const free = (x, z) => x < 10 || x > 19;
    ctx.constructionPalaceGrounds(b, 'cherry', { x0: 0, z0: 0, x1: 29, z1: 29, y: 2, free, density: 0.2 });
    const cells = [...b.cells.values()];
    const layer = cells.filter((cell) => cell.y === 2);
    assert.equal(layer.length, 900);
    assert.ok(layer.every((cell) => ['grass', 'moss'].includes(cell.type)));
    const above = cells.filter((cell) => cell.y > 2);
    assert.ok(above.length > 50, `${above.length}`);
    assert.ok(above.some((cell) => cell.type === 'cherry_wood'));
    for (const cell of above) assert.ok(cell.x < 10 + 3 || cell.x > 19 - 3, `${cell.type} at ${cell.x},${cell.z}`);
    const trunks = above.filter((cell) => cell.type === 'cherry_wood' && cell.y === 3);
    for (const trunk of trunks) assert.ok(trunk.x < 10 || trunk.x > 19, `a trunk at ${trunk.x}`);
    const bare = new ctx.ConstructionBuilder([10, 5, 10]);
    ctx.constructionPalaceGrounds(bare, 'jungle', { x0: 0, z0: 0, x1: 9, z1: 9, y: 0, decor: false });
    assert.equal(bare.cells.size, 100);
});

test('the helpers: a bed with its head where asked, mirrors in z, a sign, chests and barrels within the server\'s limits', () => {
    const b = new ctx.ConstructionBuilder([20, 10, 20]);
    ctx.constructionPalaceBed(b, 5, 1, 2, 'n');
    const bed = [...b.cells.values()].filter((cell) => baseOf(cell.type) === 'bed');
    assert.equal(bed.length, 2);
    const head = bed.find((cell) => defOf(cell.type).state.part === 'head');
    assert.deepEqual([head.x, head.y, head.z], [5, 1, 2]);

    const m = new ctx.ConstructionBuilder([20, 10, 20]);
    ctx.constructionPalaceMirrorZ(m, 19, ({ z, facing }) => m.stairs(3, 1, z(2), 'sandstone_stairs', facing('s')));
    const stairs = [...m.cells.values()].sort((a, c) => a.z - c.z);
    assert.deepEqual(stairs.map((cell) => [cell.z, defOf(cell.type).state.facing]), [[2, 's'], [17, 'n']]);

    const s = new ctx.ConstructionBuilder([5, 5, 5]);
    ctx.constructionPalaceSign(s, 1, 1, 1, 'n', 'Hola', 'Hello');
    const [sign] = s.cells.values();
    assert.equal(baseOf(sign.type), 'sign');
    assert.equal(sign.meta.t, 'Hola // Hello');

    const c = new ctx.ConstructionBuilder([10, 5, 10]);
    ctx.constructionPalaceChest(c, 1, 1, 1, 'n', [['candle', 4], ['gold_leaf', 2]]);
    ctx.constructionPalaceChest(c, 3, 1, 1, 'n', [['bread', 8]], 'barrel');
    assert.equal(c.stocks.size, 2);
    assert.equal(baseOf([...c.cells.values()][0].type), 'chest');
    assert.equal([...c.cells.values()][1].type, 'barrel');
    assert.throws(() => ctx.constructionPalaceChest(c, 5, 1, 1, 'n', [['candle', ctx.CONSTRUCTION_STOCK_MAX + 1]]), /stack/);
    assert.throws(() => ctx.constructionPalaceChest(c, 5, 1, 2, 'n', Array.from({ length: 5 }, () => ['candle', 64])), /items/);
    assert.throws(() => ctx.constructionPalaceChest(c, 5, 1, 3, 'n', Array.from({ length: 19 }, () => ['candle', 1]), 'barrel'), /slots/);
    assert.throws(() => ctx.constructionPalaceChest(c, 5, 1, 4, 'n', []), /nothing/);
});

// What the server takes (construction_stock.go): its names and its limits.
const GO = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'construction_stock.go'), 'utf8');
const GO_ITEMS = new Set([...GO.slice(GO.indexOf('range []string{'), GO.indexOf('} {', GO.indexOf('range []string{'))).matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));

test('every palace: a design of its own, on a themed site, whose blocks exist and whose stock the server takes', () => {
    const themes = { andalusi: 'desert', baroque: 'plains', oriental: 'cherry', nordic: 'snow', maya: 'jungle', volcanic: 'volcanic' };
    for (const name of PALACES) {
        const design = ctx.CONSTRUCTION_DESIGNS[`palace_${name}`];
        assert.ok(design, name);
        assert.equal(typeof design.site, 'function', name);
        assert.equal(typeof design.generate, 'function', name);
        assert.ok(Number.isInteger(design.groundY) && design.rate > 0, name);
        assert.ok(fs.readFileSync(path.join(JS, 'game', `construction_palace_${name}.js`), 'utf8').includes(`theme: '${themes[name]}'`), `${name} stands on ${themes[name]}`);
        const plan = ctx.constructionPlan(`palace_${name}`);
        assert.ok(plan.cells.length > 100, name);
        assert.ok(plan.anchorX >= 0 && plan.anchorX < plan.size[0], name);
        for (const type of new Set(plan.cells.map((cell) => cell.type))) {
            assert.ok(defOf(type) && !defOf(type).itemOnly && blocks.registry.ids[type] !== undefined, `${name}: ${type} is not a block`);
        }
        for (const stock of plan.stocks) {
            const where = `${name} at ${stock.x},${stock.y},${stock.z}`;
            const all = [...stock.items, ...stock.freezer];
            assert.ok(all.length > 0, where);
            for (const [type, count] of all) {
                // stockItems is the authority (construction_stock.test.js holds it to the real items, which this VM
                // does not all load): here only no variant of a block, which the server would never stock.
                assert.ok(!(defOf(type) && defOf(type).variantOf), `${where}: ${type} is a variant, not an item`);
                assert.ok(GO_ITEMS.has(type), `${where}: ${type} is not in stockItems (construction_stock.go)`);
                assert.ok(Number.isInteger(count) && count >= 1 && count <= ctx.CONSTRUCTION_STOCK_MAX, `${where}: ${count} ${type}`);
            }
            assert.ok(all.reduce((sum, [, count]) => sum + count, 0) <= ctx.CONSTRUCTION_STOCK_TOTAL, where);
            const cell = plan.cells.find((other) => other.x === stock.x && other.y === stock.y && other.z === stock.z);
            assert.ok(cell && defOf(cell.type).storageSlots, `${where}: no storage there`);
        }
    }
});
