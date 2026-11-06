// Node tests for the weather station as a block (js/game/weather.js): placing and breaking through the game's
// own code, what a loading world does to it (the bug that lost stations on reload), its moving parts following
// the world, the rain gauge, and the one-time move out of localStorage.
// Run with: node --test test/js/weather_station.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const print = require(path.join(STATIC, 'js', 'guidePrint.js'));
const tool = require(path.join(ROOT, 'tools', 'viewerPalette.js'));

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
}
class Object3D {
    constructor() { this.position = new Vector3(); this.scale = new Vector3(1, 1, 1); this.rotation = new Vector3(); this.userData = {}; this.children = []; this.visible = true; }
    add(child) { this.children.push(child); }
}
function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}
function canvasStub() {
    const ctx = new Proxy({}, {
        get: (target, key) => (key in target ? target[key] : () => ({ data: new Uint8ClampedArray(4 * 4096), addColorStop() {} })),
        set: (target, key, value) => { target[key] = value; return true; }
    });
    return { width: 16, height: 16, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,' };
}

const storageData = new Map();
function loadGame() {
    const THREE = new Proxy({
        Vector3, Vector2: Vector3, Vector4: Vector3, Group: Object3D, Mesh: class extends Object3D {}

    }, { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const context = vm.createContext({
        console: { ...console, warn() {} }, performance: { now: () => 0 }, THREE, navigator: {}, requestAnimationFrame: () => 0,
        Worker: class { postMessage() {} terminate() {} },
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; } },
        document: { createElement: (tag) => (tag === 'canvas' ? canvasStub() : anyStub()), addEventListener() {}, body: anyStub(), head: anyStub(), getElementById: () => null, querySelector: () => null },
        localStorage: {
            getItem: (key) => storageData.get(key) ?? null,
            setItem: (key, value) => {
                if (context.storageBlocked) throw new Error('blocked');
                storageData.set(key, value);
            },
            removeItem: (key) => storageData.delete(key)
        }
    });
    context.window = context;
    vm.runInContext('class Game {}', context);
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1])
        .filter((src) => !/^(https?:)?\/\//.test(src) && !print.SKIP_SCRIPTS.test(src));
    for (const src of scripts) vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    vm.runInContext(`Object.assign(this, { WorldRenderer, ChunkColumn, Game, BLOCK_SHAPES, BLOCK_BREAK_HANDLERS, ITEM_USE_HANDLERS, ROBOT_NOT_PLACEABLE,
        shapeLinkedCells, blueprintPack, weatherLegacyCells, weatherLegacyOutcome, WEATHER_LEGACY_KEY, WEATHER_LEGACY_MAX });`, context);
    return context;
}
const ctx = loadGame();
const KEY = ctx.WEATHER_LEGACY_KEY;

function makeWorld(chunks = [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
    const world = new ctx.WorldRenderer({ add() {}, remove() {} });
    const stone = world.registry.id('stone');
    for (const [cx, cz] of chunks) {
        const column = new ctx.ChunkColumn(cx, cz);
        for (let lx = 0; lx < 16; lx++) {
            for (let lz = 0; lz < 16; lz++) {
                for (let y = -16; y <= 0; y++) column.set(lx, y, lz, stone);
            }
        }
        world.columns.set(world.chunkKey(cx, cz), column);
    }
    return world;
}

function makeGame(world, options = {}) {
    const sent = [];
    const messages = [];
    const pickups = [];
    const inventory = { weather_station: 3 };
    const added = [];
    const removed = [];
    const camera = { position: new Vector3(5, 3, 5), rotation: {} };
    const game = new ctx.Game();
    Object.assign(game, {
        world,
        scene: { add: (object) => added.push(object), remove: (object) => removed.push(object) },
        camera,
        titleScreenOpen: false,
        placeDistance: 6,
        timeOfDay: 0.3, worldDay: 1,
        network: { connected: true, send: (type, payload) => sent.push({ type, payload }) },
        cameraController: { keys: {}, intersectsBoxes: () => false, intersectsBody: () => false },
        hitIndicator: { style: {} },
        isGameplayActive: () => false,
        weatherRenderPanel() {},
        tryUseItemOnMob: () => false, tryMountMob: () => false,
        getSelectedHeldItemType: () => 'weather_station', getSelectedBlockType: () => 'weather_station',
        getInventoryCount: (type) => inventory[type] || 0,
        addInventory: (type) => { inventory[type] = (inventory[type] || 0) + 1; },
        consumeSelectedBlock: () => { inventory.weather_station--; return true; },
        getItemDefinition: () => null,
        getInteractionRay: () => ({ origin: camera.position, reachOrigin: camera.position, direction: { x: 0, y: -0.5, z: -1 } }),
        getLocalPlayerPosition: () => camera.position,
        playPlaceSound() {}, showHitIndicator() {}, playTone() {},
        disposeMiningBlockVisual() {},
        getExpansionBonusDrop: () => null,
        spawnPickup: (type, position, amount) => pickups.push({ type, position, amount }),
        spawnFallingBlockDrop: (type, position) => pickups.push({ type, position, amount: 1 }),
        receiveSystemMessage: ({ text }) => messages.push(text),
        ...options
    });
    return { game, sent, messages, pickups, inventory, added, removed };
}

// A click on the top of block (x, y, z), through the game's own placeBlock with only this file's handler.
function clickTop(game, x, y, z, normal = { x: 0, y: 1, z: 0 }) {
    const hit = { object: { userData: { blockPosition: { x, y, z } } }, faceIndex: 0, point: new Vector3(x + 0.5, y + 1, z + 0.5), face: { normal } };
    game.raycastBlock = () => hit;
    game.placeBlock();
}
function onlyWeatherHandler(run) {
    const saved = ctx.ITEM_USE_HANDLERS.splice(0);
    ctx.ITEM_USE_HANDLERS.push(function (item, hit) { return this.weatherHandleUse(item, hit); });
    try {
        return run();
    } finally {
        ctx.ITEM_USE_HANDLERS.splice(0);
        ctx.ITEM_USE_HANDLERS.push(...saved);
    }
}
const types = (sent, kind) => sent.filter((message) => message.type === kind).map(({ payload }) => payload);

test('it is a real block in two states, that drops the item whichever half you break', () => {
    const world = makeWorld();
    const lower = world.blockTypes.weather_station;
    const upper = world.blockTypes['weather_station:upper'];
    assert.ok(lower && !lower.itemOnly && !lower.variantOf);
    assert.equal(upper.variantOf, 'weather_station');
    assert.equal(world.getDropTypeForBlock('weather_station'), 'weather_station');
    assert.equal(world.getDropTypeForBlock('weather_station:upper'), 'weather_station');
    assert.ok(world.getBreakDurationForType('weather_station') > 0);
    // Names are what the chunks store, so these must never change.
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.BLOCK_SHAPES.weather_station.states)), [['half', ['lower', 'upper']]]);
    // Only the post gets in the way, and it does not block the light.
    for (const type of ['weather_station', 'weather_station:upper']) {
        const boxes = world.shapes.collision(world.registry.id(type));
        assert.deepEqual(boxes.length, 1);
        assert.ok(boxes[0][3] - boxes[0][0] < 0.2);
        assert.ok(world.blockTypes[type].lightPasses);
    }
    // And its boxes stay in their cells, as the mesher wants.
    for (const type of ['weather_station', 'weather_station:upper']) {
        for (const box of world.shapes.boxes(world.registry.id(type))) {
            for (const value of box) assert.ok(value >= 0 && value <= 1, `${type} ${box}`);
        }
    }
    assert.ok(ctx.ROBOT_NOT_PLACEABLE.includes('weather_station'), 'a robot only places one cell');
});

test('placing sends both cells through blockPlace and uses up one item', () => {
    const world = makeWorld();
    const { game, sent, inventory } = makeGame(world);
    onlyWeatherHandler(() => clickTop(game, 3, 0, 3));
    assert.deepEqual(types(sent, 'blockPlace').map((p) => [p.x, p.y, p.z, p.blockType]), [[3, 1, 3, 'weather_station'], [3, 2, 3, 'weather_station:upper']]);
    assert.equal(world.getBlockTypeAt(3, 1, 3), 'weather_station');
    assert.equal(world.getBlockTypeAt(3, 2, 3), 'weather_station:upper');
    assert.equal(inventory.weather_station, 2);
});

test('it wants the top of something solid, and two free cells', () => {
    const world = makeWorld();
    const { game, sent, messages, inventory } = makeGame(world);
    // The side of a block.
    onlyWeatherHandler(() => clickTop(game, 3, 0, 3, { x: 1, y: 0, z: 0 }));
    assert.equal(sent.length, 0);
    assert.match(messages.pop(), /two blocks tall/);
    // A roof right above.
    world.addBlock({ x: 3, y: 2, z: 3, blockType: 'stone' });
    onlyWeatherHandler(() => clickTop(game, 3, 0, 3));
    assert.equal(sent.length, 0);
    world.removeBlockAt(3, 2, 3);
    // In the water.
    world.addBlock({ x: 3, y: 1, z: 3, blockType: 'water' });
    onlyWeatherHandler(() => clickTop(game, 3, 0, 3));
    assert.equal(sent.length, 0);
    world.removeBlockAt(3, 1, 3);
    // On another station: it could not come down with it.
    onlyWeatherHandler(() => clickTop(game, 3, 0, 3));
    sent.length = 0;
    onlyWeatherHandler(() => clickTop(game, 3, 2, 3));
    assert.equal(sent.length, 0);
    assert.equal(inventory.weather_station, 2);
    // A cage: it is no block, so placing would not see it.
    const cage = makeGame(world, { trapsCages: [{ position: new Vector3(6.5, 1, 6.5) }] });
    onlyWeatherHandler(() => clickTop(cage.game, 6, 0, 6));
    assert.equal(cage.sent.length, 0);
    assert.equal(cage.inventory.weather_station, 3);
});

test('breaking either half takes both down, and gives one item to that player only', () => {
    for (const y of [1, 2]) {
        const world = makeWorld();
        const { game, sent, pickups } = makeGame(world);
        onlyWeatherHandler(() => clickTop(game, 3, 0, 3));
        sent.length = 0;
        game.finishBreakingBlock({ x: 3, y, z: 3 });
        assert.equal(world.getBlockTypeAt(3, 1, 3), null);
        assert.equal(world.getBlockTypeAt(3, 2, 3), null);
        assert.deepEqual(types(sent, 'blockBreak').map((p) => p.y).sort(), [1, 2]);
        assert.deepEqual(pickups.map((p) => p.type), ['weather_station']);
    }
});

test('another player breaking it only changes the world here: no item', () => {
    const world = makeWorld();
    const { game, pickups, inventory } = makeGame(world);
    game.weatherUpdate(0.3);
    onlyWeatherHandler(() => clickTop(game, 3, 0, 3));
    game.weatherUpdate(0.3);
    assert.equal(game.weatherStations.length, 1);
    // What network.on('blockBreak') does.
    world.removeBlockAt(3, 1, 3);
    world.removeBlockAt(3, 2, 3);
    game.weatherUpdate(0.3);
    assert.equal(game.weatherStations.length, 0);
    assert.equal(game.weatherTargets.length, 0);
    assert.equal(pickups.length, 0);
    assert.equal(inventory.weather_station, 2);
});

test('it comes down when the block under it is broken, with the item for whoever broke that', () => {
    const world = makeWorld();
    const { game, sent, pickups } = makeGame(world);
    onlyWeatherHandler(() => clickTop(game, 3, 0, 3));
    sent.length = 0;
    game.finishBreakingBlock({ x: 3, y: 0, z: 3 });
    assert.equal(world.getBlockTypeAt(3, 1, 3), null);
    assert.equal(world.getBlockTypeAt(3, 2, 3), null);
    assert.deepEqual(types(sent, 'blockBreak').map((p) => p.y).sort(), [0, 1, 2]);
    assert.equal(pickups.filter((p) => p.type === 'weather_station').length, 1);
    // Breaking anything else near it does not.
    const other = makeGame(makeWorld());
    onlyWeatherHandler(() => clickTop(other.game, 3, 0, 3));
    other.game.finishBreakingBlock({ x: 4, y: 0, z: 3 });
    assert.equal(other.game.world.getBlockTypeAt(3, 1, 3), 'weather_station');
});

test('THE BUG: a world that has not loaded takes nothing down, and sends nothing', () => {
    storageData.clear();
    // The first frame after a reload: no chunk has arrived.
    const empty = makeWorld([]);
    const { game, sent, pickups } = makeGame(empty);
    for (let i = 0; i < 20; i++) game.weatherUpdate(0.1);
    assert.equal(sent.length, 0);
    assert.equal(pickups.length, 0);

    // A station whose column goes out of memory (the player walked away) and comes back.
    const world = makeWorld();
    const far = makeGame(world);
    onlyWeatherHandler(() => clickTop(far.game, 3, 0, 3));
    far.sent.length = 0;
    far.game.weatherUpdate(0.3);
    assert.equal(far.game.weatherStations.length, 1);
    const column = world.columns.get(world.chunkKey(0, 0));
    world.columns.delete(world.chunkKey(0, 0));
    far.game.weatherUpdate(0.3);
    assert.equal(far.game.weatherStations.length, 0, 'the moving parts go with the chunk');
    assert.equal(far.sent.length, 0, 'but nothing is told to anyone');
    assert.equal(far.pickups.length, 0, 'and no item appears');
    world.columns.set(world.chunkKey(0, 0), column);
    far.game.weatherUpdate(0.3);
    assert.equal(far.game.weatherStations.length, 1, 'it is there again');
});

test('the moving parts turn with the wind and the gauge fills in the open, not under a roof', () => {
    const world = makeWorld();
    const { game } = makeGame(world);
    onlyWeatherHandler(() => clickTop(game, 3, 0, 3));
    game.weatherUpdate(0.3);
    const station = game.weatherStations[0];
    assert.deepEqual([station.position.x, station.position.y, station.position.z], [3.5, 1, 3.5]);
    // Its own upper half is no roof.
    assert.equal(game.weatherStationCover(station), 0);
    // The whole shower has fallen.
    game.timeOfDay = 0.5;
    game.rainWindow = { start: 0.1, end: 0.4 };
    game.weatherUpdate(0.1);
    assert.ok(station.water.visible, 'it rained into the gauge');
    const open = Object.fromEntries(game.weatherStationDescribe(station).map(([label, value]) => [label, value]));
    assert.match(open['Rain today'], /[1-9].* mm/);
    assert.ok(open.Temperature && open.Wind && open.Pressure);
    const before = station.cups.rotation.y;
    game.weatherUpdate(0.1);
    assert.notEqual(station.cups.rotation.y, before, 'the cups spin');
    // A real roof.
    world.addBlock({ x: 3, y: 4, z: 3, blockType: 'stone' });
    game.weatherUpdate(0.1);
    assert.equal(station.water.visible, false);
    assert.match(game.weatherStationDescribe(station).find(([label]) => label === 'Rain today')[1], /under a roof/);
});

test('right click reports; Shift + right click builds against it, as on any block', () => {
    const world = makeWorld();
    const { game, sent, messages } = makeGame(world, { getSelectedHeldItemType: () => 'stone', getSelectedBlockType: () => 'stone', getInventoryCount: () => 5 });
    world.addBlock({ x: 3, y: 1, z: 3, blockType: 'weather_station' });
    world.addBlock({ x: 3, y: 2, z: 3, blockType: 'weather_station:upper' });
    game.weatherUpdate(0.3);
    onlyWeatherHandler(() => clickTop(game, 3, 2, 3, { x: 1, y: 0, z: 0 }));
    assert.match(messages.pop(), /^Weather station: /);
    assert.equal(sent.length, 0);
    game.cameraController.keys.crouch = true;
    onlyWeatherHandler(() => clickTop(game, 3, 2, 3, { x: 1, y: 0, z: 0 }));
    assert.equal(world.getBlockTypeAt(4, 2, 3), 'stone');
    assert.equal(world.getBlockTypeAt(3, 2, 3), 'weather_station:upper', 'it was not picked up');
});

test('aiming at it: boxes per cell, with the position of each half', () => {
    const world = makeWorld();
    const { game } = makeGame(world);
    world.addBlock({ x: 3, y: 1, z: 3, blockType: 'weather_station' });
    world.addBlock({ x: 3, y: 2, z: 3, blockType: 'weather_station:upper' });
    game.weatherUpdate(0.3);
    assert.deepEqual(JSON.parse(JSON.stringify(game.weatherTargets.map((target) => target.userData.blockPosition.y))), [1, 2]);
    for (const target of game.weatherTargets) {
        assert.equal(world.getBlockPositionFromIntersection({ object: target }).x, 3);
    }
    const source = fs.readFileSync(path.join(STATIC, 'js', 'game', 'building.js'), 'utf8');
    assert.match(source, /blocks\.push\(\.\.\.this\.weatherTargets\)/);
});

test('blueprints take it: it is two ordinary cells', () => {
    const packed = ctx.blueprintPack([1, 2, 1], [{ x: 0, y: 0, z: 0, type: 'weather_station' }, { x: 0, y: 1, z: 0, type: 'weather_station:upper' }]);
    assert.ok(packed.palette.includes('weather_station') && packed.palette.includes('weather_station:upper'));
});

// ---- The move out of localStorage -------------------------------------------------------

function legacyGame(world, saved, options) {
    storageData.clear();
    if (saved !== undefined) storageData.set(KEY, typeof saved === 'string' ? saved : JSON.stringify(saved));
    return makeGame(world, options);
}

test('old entries become cells: on a slab goes above it, a cell counts once, nonsense is out', () => {
    const cells = (saved) => JSON.parse(JSON.stringify(ctx.weatherLegacyCells(saved)));
    assert.deepEqual(cells([{ x: 3.5, y: 1, z: 3.5 }]), [{ x: 3, y: 1, z: 3 }]);
    assert.deepEqual(cells([{ x: -3.5, y: 10.5, z: -0.5 }]), [{ x: -4, y: 11, z: -1 }]);
    assert.deepEqual(cells([{ x: 3.5, y: 1, z: 3.5 }, { x: 3.52, y: 1, z: 3.48 }]), [{ x: 3, y: 1, z: 3 }]);
    for (const bad of ['nope', 7, null, {}, [null], [{ x: 'a', y: 1, z: 1 }], [{ x: 1, y: 1e9, z: 1 }], [{ x: 1e12, y: 1, z: 1 }], [{ x: NaN, y: 1, z: 1 }], [{ x: 1, y: -500, z: 1 }]]) {
        assert.deepEqual(cells(bad), [], JSON.stringify(bad));
    }
    const many = Array.from({ length: 500 }, (_, i) => ({ x: i + 0.5, y: 1, z: 0.5 }));
    assert.equal(cells(many).length, ctx.WEATHER_LEGACY_MAX);
});

test('an old station becomes a block through plain blockPlace, without using an item, and the key goes', () => {
    const world = makeWorld();
    const { game, sent, inventory } = legacyGame(world, [{ x: 3.5, y: 1, z: 3.5 }]);
    game.weatherUpdate(1.1);
    assert.deepEqual(types(sent, 'blockPlace').map((p) => [p.x, p.y, p.z, p.blockType]), [[3, 1, 3, 'weather_station'], [3, 2, 3, 'weather_station:upper']]);
    assert.deepEqual(sent.map((message) => message.type), ['blockPlace', 'blockPlace'], 'no other message exists for this');
    assert.equal(world.getBlockTypeAt(3, 1, 3), 'weather_station');
    assert.equal(storageData.has(KEY), false);
    assert.equal(inventory.weather_station, 3);
    // Once.
    sent.length = 0;
    world.removeBlockAt(3, 1, 3);
    world.removeBlockAt(3, 2, 3);
    game.weatherUpdate(2);
    assert.equal(sent.length, 0);
});

test('it waits for the player: not on the title screen, not offline, not before the chunk', () => {
    const world = makeWorld();
    const title = legacyGame(world, [{ x: 3.5, y: 1, z: 3.5 }], { titleScreenOpen: true });
    title.game.weatherUpdate(2);
    assert.equal(title.sent.length, 0);
    assert.ok(storageData.has(KEY));
    const offline = legacyGame(world, [{ x: 3.5, y: 1, z: 3.5 }]);
    offline.game.network.connected = false;
    offline.game.weatherUpdate(2);
    assert.equal(offline.sent.length, 0);
    assert.ok(storageData.has(KEY));

    // One here, one in a chunk far away: that one stays, and the key with it, until the chunk comes.
    const here = legacyGame(world, [{ x: 3.5, y: 1, z: 3.5 }, { x: 500.5, y: 1, z: 500.5 }]);
    here.game.weatherUpdate(2);
    assert.equal(types(here.sent, 'blockPlace').length, 2);
    assert.deepEqual(JSON.parse(storageData.get(KEY)), [{ x: 500.5, y: 1, z: 500.5 }]);
    here.sent.length = 0;
    here.game.weatherUpdate(2);
    assert.equal(here.sent.length, 0, 'the first is not placed twice');
    const stone = world.registry.id('stone');
    const column = new ctx.ChunkColumn(31, 31);
    for (let lx = 0; lx < 16; lx++) for (let lz = 0; lz < 16; lz++) column.set(lx, 0, lz, stone);
    world.columns.set(world.chunkKey(31, 31), column);
    here.game.weatherUpdate(2);
    assert.equal(types(here.sent, 'blockPlace').length, 2);
    assert.equal(storageData.has(KEY), false);
});

test('no duplicates: a station already there, a second tab, a second player', () => {
    const world = makeWorld();
    world.addBlock({ x: 3, y: 1, z: 3, blockType: 'weather_station' });
    world.addBlock({ x: 3, y: 2, z: 3, blockType: 'weather_station:upper' });
    const { game, sent, inventory } = legacyGame(world, [{ x: 3.5, y: 1, z: 3.5 }, { x: 3.5, y: 1, z: 3.5 }]);
    game.weatherUpdate(2);
    assert.equal(sent.length, 0);
    assert.equal(inventory.weather_station, 3, 'nothing back either: it stands there');
    assert.equal(storageData.has(KEY), false);
});

test('what no longer fits goes back to the inventory, and overwrites nothing', () => {
    const cases = [
        (w) => w.addBlock({ x: 3, y: 1, z: 3, blockType: 'stone' }),
        (w) => w.addBlock({ x: 3, y: 2, z: 3, blockType: 'stone' }),
        (w) => w.removeBlockAt(3, 0, 3)
    ];
    for (const change of cases) {
        const world = makeWorld();
        change(world);
        const { game, sent, inventory, messages } = legacyGame(world, [{ x: 3.5, y: 1, z: 3.5 }]);
        game.weatherUpdate(2);
        assert.equal(sent.length, 0);
        assert.equal(inventory.weather_station, 4);
        assert.match(messages.pop(), /back in your inventory/);
        assert.equal(storageData.has(KEY), false);
    }
});

test('a small plant gives way, as when placing by hand', () => {
    const world = makeWorld();
    world.addBlock({ x: 3, y: 1, z: 3, blockType: 'tall_grass' });
    const { game } = legacyGame(world, [{ x: 3.5, y: 1, z: 3.5 }]);
    game.weatherUpdate(2);
    assert.equal(world.getBlockTypeAt(3, 1, 3), 'weather_station');
});

test('a damaged key or an empty one is simply removed', () => {
    for (const saved of ['{not json', '[]', '"x"', '[{"x":"a"}]']) {
        const world = makeWorld();
        const { game, sent, messages } = legacyGame(world, saved);
        game.weatherUpdate(2);
        assert.equal(sent.length, 0);
        assert.equal(messages.length, 0);
        assert.equal(storageData.has(KEY), false, saved);
    }
});

test('with a browser that will not write, nothing happens, so nothing can repeat', () => {
    const world = makeWorld();
    const { game, sent, inventory } = legacyGame(world, [{ x: 3.5, y: 1, z: 3.5 }, { x: 500.5, y: 1, z: 500.5 }]);
    ctx.storageBlocked = true;
    try {
        game.weatherUpdate(2);
    } finally {
        ctx.storageBlocked = false;
    }
    assert.equal(sent.length, 0);
    assert.equal(inventory.weather_station, 3);
});

test('nothing writes the old key any more, and the server needs no new message', () => {
    const source = fs.readFileSync(path.join(STATIC, 'js', 'game', 'weather.js'), 'utf8');
    assert.ok(!/weatherSave|weatherRestore/.test(source));
    const go = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'websocket.go'), 'utf8');
    assert.ok(!/weather/i.test(go));
});

test('the viewer palette knows it, and the guide says what it does now', () => {
    const palette = tool.buildPalette();
    assert.ok(palette.blocks.weather_station, 'palette');
    for (const name of ['112_ES_Estación_meteorológica.md', '112_EN_Weather_station.md']) {
        const page = fs.readFileSync(path.join(STATIC, 'guide', name), 'utf8');
        assert.ok(!/navegador\*\*: los dem|in your browser\*\*: other/.test(page), name);
        assert.ok(/servidor|server/.test(page), name);
    }
    assert.ok(!/estación[^\n]*Se guarda en el navegador/i.test(fs.readFileSync(path.join(ROOT, 'GUIA.md'), 'utf8').replace(/\n\s+/g, ' ')));
});
