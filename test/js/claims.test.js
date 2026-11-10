// Node tests for plots on the client (js/game/claims.js), on a stand-in for the page: the border on the ground,
// the notice on walking in, the marker's panel, the checks before acting, what a refusal from the server puts
// back, the admin commands, and every line in ES and EN. The server side is pkg/network/claims_test.go.
// Nothing here runs a browser. Run with: node --test test/js/claims.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const STATIC = path.join(__dirname, '..', '..', 'pkg', 'web', 'static');
const JS = path.join(STATIC, 'js');
const read = (file) => fs.readFileSync(path.join(JS, file), 'utf8');

function fakeElement(tag = 'div') {
    const listeners = {};
    const classes = new Set();
    return {
        tag, id: '', className: '', type: '', textContent: '', hidden: false, style: {}, children: [], listeners,
        classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren() { this.children.length = 0; },
        addEventListener(type, listener) { (listeners[type] = listeners[type] || []).push(listener); },
        click() { for (const listener of listeners.click || []) listener({ stopPropagation() {}, preventDefault() {} }); }
    };
}

// A Game with what claims.js uses of it, the world as a map of blocks, and a network that records.
function fakeGame({ lang = 'ES', creative = false } = {}) {
    const byId = new Map();
    const pauseRow = fakeElement('div');
    const document = {
        querySelector: (selector) => (selector === '#pause-menu .pause-actions-main' ? pauseRow : null),
        body: { appendChild(child) { if (child.id) byId.set(child.id, child); } },
        head: { appendChild() {} },
        pointerLockElement: null,
        getElementById: (id) => byId.get(id) || null,
        createElement: (tag) => fakeElement(tag),
        exitPointerLock() {}
    };
    const store = new Map([['minecloud-guide-lang', lang]]);
    const hooks = { content: [], use: [], modal: [], frame: [], textures: {}, blocks: {} };
    const timers = [];
    const context = vm.createContext({
        console, Math, Number, String, Array, Map, Set, Object, JSON, Promise,
        document, navigator: { language: lang === 'ES' ? 'es-ES' : 'en-GB' },
        performance: { now: () => context.now },
        setTimeout: (fn) => { timers.push(fn); return timers.length; },
        clearTimeout() {},
        window: { localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) } },
        registerTexturePattern: (name, paint) => { hooks.textures[name] = paint; },
        registerBlockType: (id, def) => { hooks.blocks[id] = def; },
        registerGameContent: (hook) => hooks.content.push(hook),
        registerItemUseHandler: (handler) => hooks.use.push(handler),
        registerModalPanel: (panel) => hooks.modal.push(panel),
        registerFrameUpdate: (fn) => hooks.frame.push(fn)
    });
    context.now = 10000;
    vm.runInContext(`class Game {
        initNetwork() { this.initNetworkCalled = true; }
        updateMining() { this.mined = (this.mined || 0) + 1; }
        finishBreakingBlock(position) { this.broken = (this.broken || []).concat([position]); this.world.removeBlockAt(position.x, position.y, position.z); return true; }
        placeBlock() { this.placed = (this.placed || 0) + 1; }
    }`, context);
    vm.runInContext(read('gameLang.js'), context, { filename: 'gameLang.js' });
    vm.runInContext(read('game/claims.js'), context, { filename: 'claims.js' });
    vm.runInContext(`Object.assign(this, { Game, CLAIM_TEXT, claimSay, claimZoneOf, claimZoneName, claimRefusalText, claimBorderSegments,
        claimCorners, claimRectDistance, claimRectsOverlap, claimRectGap, claimHomeSpot, claimChunksOf, setGameLang })`, context);

    const blocks = new Map();
    const world = {
        blockTypes: { stone: {}, oak_door: {}, 'oak_door:upper': { variantOf: 'oak_door' }, claim_marker: {}, feather: { itemOnly: true } },
        getBlockTypeAt: (x, y, z) => blocks.get(`${x},${y},${z}`) || null,
        addBlock: (block) => { blocks.set(`${block.x},${block.y},${block.z}`, block.blockType); return true; },
        removeBlockAt: (x, y, z) => blocks.delete(`${x},${y},${z}`),
        hasSolidBlock: (x, y, z) => (y <= 63 && !blocks.has(`${x},${y},${z}:air`)) || (blocks.has(`${x},${y},${z}`) && blocks.get(`${x},${y},${z}`) !== 'water'),
        getBlockPositionFromIntersection: (hit) => hit.position
    };
    const network = {
        connected: true, sent: [], handlers: new Map(),
        on(type, handler) { (this.handlers.get(type) || this.handlers.set(type, []).get(type)).push(handler); },
        send(type, payload) { this.sent.push([type, JSON.parse(JSON.stringify(payload))]); },
        emit(type, payload) { for (const handler of this.handlers.get(type) || []) handler(payload); }
    };
    const game = new context.Game();
    const position = { x: 0.5, y: 65.6, z: 0.5, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    const camera = { position };
    Object.assign(game, {
        world, network, creativeMode: creative, titleScreenOpen: false, messages: [], inventory: {},
        isBreakInputActive: false, breakDistance: 4.5, placeDistance: 4.5, selected: 'stone', aim: null,
        cameraController: {
            camera, getPosition: () => position, canInteract: () => true, eyeHeight: 1.62, isCrouching: false, settled: 0,
            setPosition(at) { position.set(at.x, at.y, at.z); this.seat = null; this.velocityY = 0; },
            finishSpawnSettling() { this.settled += 1; }
        },
        raycastBlock() { return this.aim; },
        resetMiningTarget() { this.resetCalls = (this.resetCalls || 0) + 1; },
        resetMiningBlockVisual() {},
        stopMining() {},
        tryUseItemOnMob: () => false,
        tryMountMob: () => false,
        getSelectedHeldItemType() { return this.selected; },
        getSelectedBlockType() { return this.selected; },
        addInventory(type, amount) { this.inventory[type] = (this.inventory[type] || 0) + amount; },
        receiveSystemMessage(message) { this.messages.push(message.text); },
        recapturePointerLock() {}
    });
    game.initNetwork();
    const notice = () => {
        const element = document.getElementById('claim-notice');
        return element && element.classList.contains('visible') ? element.textContent : '';
    };
    const frame = () => hooks.frame.forEach((fn) => fn.call(game, 1 / 60));
    const moveTo = (x, z) => { position.x = x; position.z = z; context.now += 2000; };
    return { context, game, network, world, blocks, hooks, document, notice, frame, moveTo, position, pauseRow };
}

// Ana's plot around (100, 64, 100), Beto's around (140, 64, 100), and the spawn zone.
function plots(mineIs = 'Beto') {
    const plot = (id, owner, x) => ({ id, x, y: 64, z: 100, owner, mine: owner === mineIs, minX: x - 8, minZ: 92, maxX: x + 8, maxZ: 108 });
    return { claims: [plot('clm_aa', 'Ana', 100), plot('clm_bb', 'Beto', 140)], spawn: { minX: -16, minZ: -16, maxX: 15, maxZ: 15 }, radius: 8 };
}

test('it listens before the socket opens, and the block and its recipe exist', () => {
    const { game, network, hooks } = fakeGame();
    assert.ok(game.initNetworkCalled);
    for (const type of ['claimList', 'claimRefused', 'claimMade', 'claimAdminResult']) assert.ok(network.handlers.has(type), type);
    assert.ok(hooks.blocks.claim_marker && hooks.blocks.claim_marker.breakDuration > 0);
    const recipes = [];
    hooks.content.forEach((hook) => hook.call(game, { addItem() {}, addRecipe: (...args) => recipes.push(args) }));
    assert.equal(JSON.stringify(recipes.map((r) => [r[0], r[2], r[4].map((i) => i.type).sort()])), JSON.stringify([['claim_marker', 'claim_marker', ['copper_ore', 'stone_bricks']]]));
});

test('zones: spawn, someone else\'s plot, my plot; and what each is called in both languages', () => {
    const { context, game, network } = fakeGame();
    network.emit('claimList', plots());
    assert.equal(context.claimZoneName(game.claimZoneAt(0, 0)), 'Zona de inicio');
    assert.equal(context.claimZoneName(game.claimZoneAt(100.7, 92.1)), 'Parcela de Ana');
    assert.equal(context.claimZoneName(game.claimZoneAt(140, 100)), 'Tu parcela');
    assert.equal(game.claimZoneAt(91.9, 100), null);
    assert.equal(game.claimZoneAt(16, 0), null);
    context.setGameLang('EN');
    assert.equal(context.claimZoneName(game.claimZoneAt(100, 100)), "Ana's plot");
    assert.equal(context.claimZoneName(game.claimZoneAt(-16, 15)), 'Spawn area');
    assert.equal(context.claimZoneName(game.claimZoneAt(148, 108)), 'Your plot');
});

test('the checks: refused in spawn and in someone else\'s plot, never in mine, never for the admin', () => {
    const { game, network } = fakeGame();
    network.emit('claimList', plots());
    assert.deepEqual({ ...game.claimRefusalAt(0, 0) }, { reason: 'spawn' });
    assert.deepEqual({ ...game.claimRefusalAt(100, 100) }, { reason: 'claim', owner: 'Ana' });
    assert.equal(game.claimRefusalAt(140, 100), null);
    assert.equal(game.claimRefusalAt(300, 300), null);
    game.creativeMode = true;
    assert.equal(game.claimRefusalAt(100, 100), null);
    assert.equal(game.claimRefusalAt(0, 0), null);
    game.creativeMode = false;
    assert.equal(game.claimHelperRefusal(100, 100), 'Parcela de Ana: aquí no puedes cambiar nada.');
    assert.equal(game.claimForeignInBox(80, 80, 91, 91), null);
    assert.equal(game.claimForeignInBox(80, 80, 92, 92), 'Parcela de Ana');
    assert.equal(game.claimForeignInBox(130, 95, 135, 99), null, 'my own plot does not count');
    assert.equal(game.claimForeignInBox(10, 10, 20, 20), 'Zona de inicio');
});

test('the border lies on the ground of each edge column, steps where the ground does, and has four corners', () => {
    const { context } = fakeGame();
    const rect = { minX: 0, minZ: 0, maxX: 16, maxZ: 16 };
    const flat = context.claimBorderSegments(rect, () => 64);
    assert.equal(flat.length, 17 * 4, 'one segment per edge column and side');
    for (const s of flat) {
        assert.ok(Math.abs(s[1] - 64.03) < 1e-9 && Math.abs(s[4] - 64.03) < 1e-9);
        const length = Math.hypot(s[3] - s[0], s[5] - s[2]);
        assert.equal(length, 1);
    }
    // The outer edges: x from 0 to 17 and z from 0 to 17.
    const xs = flat.flatMap((s) => [s[0], s[3]]);
    const zs = flat.flatMap((s) => [s[2], s[5]]);
    assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)], [0, 17, 0, 17]);
    // A step: a hill on part of the north edge.
    const hill = context.claimBorderSegments(rect, (x, z) => (z === 0 && x >= 5 && x <= 7 ? 67 : 64));
    const vertical = hill.filter((s) => s[0] === s[3] && s[2] === s[5]);
    assert.equal(vertical.length, 2, 'up and down again');
    assert.equal(JSON.stringify(vertical.map((s) => [s[0], s[1].toFixed(2), s[4].toFixed(2)])), JSON.stringify([[5, '64.03', '67.03'], [8, '67.03', '64.03']]));
    const corners = context.claimCorners(rect);
    assert.equal(JSON.stringify(corners.map((c) => [c.x, c.z])), JSON.stringify([[0, 0], [17, 0], [0, 17], [17, 17]]));
    assert.equal(context.claimRectDistance(rect, 8, 8), 0);
    assert.equal(context.claimRectDistance(rect, 20, 8), 3);
});

test('borders are drawn near a plot and taken away far from it', () => {
    const { context, game, network, frame, moveTo } = fakeGame();
    const added = [];
    const removed = [];
    class Thing {
        constructor() { this.position = { set() {} }; this.children = []; }
        add(child) { this.children.push(child); }
        traverse(fn) { fn(this); this.children.forEach((child) => child.traverse ? child.traverse(fn) : fn(child)); }
        dispose() {}
    }
    context.THREE = {
        Group: class extends Thing {},
        BufferGeometry: class { setAttribute(name, attribute) { this.attribute = attribute; } dispose() {} },
        Float32BufferAttribute: class { constructor(points) { this.points = points; } },
        LineBasicMaterial: class { constructor(options) { Object.assign(this, options); } dispose() {} },
        MeshBasicMaterial: class { constructor(options) { Object.assign(this, options); } dispose() {} },
        BoxGeometry: class { dispose() {} },
        LineSegments: class extends Thing { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } },
        Mesh: class extends Thing { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
    };
    game.scene = { add: (group) => added.push(group), remove: (group) => removed.push(group) };
    network.emit('claimList', plots());
    moveTo(300, 300);
    frame();
    assert.equal(added.length, 0, 'nothing near');
    moveTo(85, 100); // 7 blocks west of Ana's plot
    frame();
    assert.equal(added.length, 1);
    const group = added[0];
    const lines = group.children.filter((child) => child instanceof context.THREE.LineSegments);
    const columns = group.children.filter((child) => child instanceof context.THREE.Mesh);
    assert.equal(lines.length, 1, 'only Ana\'s plot is near');
    assert.equal(columns.length, 4);
    assert.equal(lines[0].material.color, 0xffc857, 'someone else\'s plot in amber');
    assert.ok(lines[0].material.opacity > 0.15 && lines[0].material.opacity < 0.55, 'soft');
    assert.ok(lines[0].geometry.attribute.points.every((value, i) => i % 3 !== 1 || value === 64.03), 'on the ground (y 64 is its top)');
    moveTo(300, 300);
    frame();
    assert.deepEqual(removed, [group]);
});

test('walking into a plot says whose it is, once', () => {
    const { game, network, frame, moveTo, notice, context } = fakeGame();
    network.emit('claimList', plots());
    moveTo(60, 100);
    frame();
    assert.equal(notice(), '');
    moveTo(95, 100);
    frame();
    assert.equal(notice(), 'Parcela de Ana');
    context.document.getElementById('claim-notice').classList.remove('visible');
    moveTo(96, 101);
    frame();
    assert.equal(notice(), '', 'not again while inside');
    moveTo(135, 100);
    frame();
    assert.equal(notice(), 'Tu parcela');
    moveTo(0, 0);
    frame();
    assert.equal(notice(), 'Zona de inicio');
    assert.equal(game.claimZoneShown, 'spawn');
});

test('mining, placing and opening in someone else\'s plot stop at once with the reason', () => {
    const { game, network, notice, moveTo, context, blocks } = fakeGame();
    network.emit('claimList', plots());
    moveTo(97, 100);
    game.aim = { position: { x: 99, y: 64, z: 100 }, face: { normal: { x: 0, y: 1, z: 0 } } };
    game.isBreakInputActive = true;
    game.updateMining(0.1);
    assert.equal(game.mined, undefined, 'no mining');
    assert.equal(notice(), 'Parcela de Ana: aquí no puedes cambiar nada.');
    assert.equal(game.finishBreakingBlock({ x: 99, y: 64, z: 100 }), false);
    game.placeBlock();
    assert.equal(game.placed, undefined, 'no placing, no opening');
    // A tool that only looks still works.
    game.selected = 'multimeter';
    game.placeBlock();
    assert.equal(game.placed, 1);
    // And a sign can be read: a right click on it reads it.
    context.isSignBlockType = (type) => type === 'sign';
    blocks.set('99,64,100', 'sign');
    game.selected = 'stone';
    game.placeBlock();
    assert.equal(game.placed, 2);
    game.cameraController.isCrouching = true;
    game.placeBlock();
    assert.equal(game.placed, 2, 'crouching is building against it');
    game.cameraController.isCrouching = false;
    blocks.delete('99,64,100');
    game.placed = 1;
    // Out in the wild everything goes on as before.
    moveTo(60, 60);
    game.aim = { position: { x: 61, y: 64, z: 60 }, face: { normal: { x: 0, y: 1, z: 0 } } };
    game.selected = 'stone';
    game.updateMining(0.1);
    game.placeBlock();
    assert.equal(game.mined, 1);
    assert.equal(game.placed, 2);
    // The admin is never stopped.
    moveTo(97, 100);
    game.creativeMode = true;
    game.aim = { position: { x: 99, y: 64, z: 100 }, face: { normal: { x: 0, y: 1, z: 0 } } };
    game.updateMining(0.1);
    game.placeBlock();
    assert.equal(game.mined, 2);
    assert.equal(game.placed, 3);
});

test('a marker that would break the rules stays in the inventory, and says why', () => {
    const { game, network, notice, moveTo } = fakeGame();
    network.emit('claimList', plots('nobody'));
    game.selected = 'claim_marker';
    const aimAt = (x, z) => { moveTo(x + 1, z + 1); game.aim = { position: { x, y: 64, z }, face: { normal: { x: 0, y: 1, z: 0 } } }; };
    aimAt(115, 100); // 15 from Ana's marker: the squares overlap
    game.placeBlock();
    assert.equal(game.placed, undefined);
    assert.equal(notice(), 'No cabe: se solapa con la parcela de Ana.');
    aimAt(0, 20);
    game.placeBlock();
    assert.equal(notice(), 'Demasiado cerca de la zona de inicio: aléjate un poco más.');
    aimAt(300, 300);
    game.placeBlock();
    assert.equal(game.placed, 1, 'a free place goes to the server');
    network.emit('claimList', plots('Ana'));
    aimAt(400, 400);
    game.placeBlock();
    assert.equal(game.placed, 1);
    assert.equal(notice(), 'Ya tienes una parcela. Para cambiarla de sitio, rompe antes su mojón.');
});

test('a refusal from the server puts the cells back, gives the item back and says why', () => {
    const { game, network, blocks, notice } = fakeGame({ lang: 'EN' });
    blocks.set('100,65,100', 'stone'); // what the client placed on its own
    network.emit('claimRefused', {
        reason: 'claim', owner: 'Ana', placed: 'stone',
        blocks: [{ x: 100, y: 65, z: 100, blockType: '' }, { x: 101, y: 65, z: 100, blockType: 'oak_door' }]
    });
    assert.equal(blocks.has('100,65,100'), false);
    assert.equal(blocks.get('101,65,100'), 'oak_door');
    assert.deepEqual({ ...game.inventory }, { stone: 1 });
    assert.equal(notice(), "Ana's plot: you can't change anything here.");
    // The upper half of a door, or an item that is no block, gives nothing back; nor in creative.
    network.emit('claimRefused', { reason: 'spawn', placed: 'oak_door:upper', blocks: [] });
    network.emit('claimRefused', { reason: 'spawn', placed: 'feather', blocks: [] });
    game.creativeMode = true;
    network.emit('claimRefused', { reason: 'spawn', placed: 'stone', blocks: [] });
    assert.deepEqual({ ...game.inventory }, { stone: 1 });
    assert.equal(notice(), 'Spawn area: nothing can be changed here.');
    for (const [reason, owner, text] of [['overlap', 'Beto', "It doesn't fit: it overlaps Beto's plot."], ['already', '', 'You already have a plot. To move it, break its marker first.'], ['reach', '', 'Too far: come closer to place the marker.'], ['overlapSpawn', '', 'Too close to the spawn area: move a bit further away.'], ['noPlayer', '', "You can't claim right now: there is no link to your player."]]) {
        game.claimNoticeAt = -Infinity;
        network.emit('claimRefused', { reason, owner, blocks: [] });
        assert.equal(notice(), text, reason);
    }
});

test('the marker\'s panel: only the owner opens it, and removing the plot asks first', () => {
    const { game, network, blocks, hooks, document, notice } = fakeGame();
    network.emit('claimList', plots('Ana'));
    blocks.set('100,64,100', 'claim_marker');
    blocks.set('140,64,100', 'claim_marker');
    const use = (x) => hooks.use.some((handler) => handler.call(game, 'stone', { position: { x, y: 64, z: 100 } }));
    assert.equal(use(140), true);
    assert.equal(notice(), 'Parcela de Beto', 'someone else\'s marker only says whose it is');
    assert.equal(game.claimPanelFor, undefined);
    assert.equal(use(100), true);
    const panel = document.getElementById('claim-panel');
    assert.ok(panel.classList.contains('visible'));
    const text = panel.children.map((child) => child.textContent).join(' | ');
    assert.match(text, /Tu parcela \| Tamaño: 17 × 17 bloques/);
    assert.match(text, /Mojón en X 100, Y 64, Z 100\. \| De X 92 a 108 y de Z 92 a 108\./);
    const [remove, yes, cancel] = panel.children.find((child) => child.className === 'claim-row').children;
    assert.equal(yes.hidden, true);
    remove.click();
    assert.equal(yes.hidden, false, 'it asks');
    cancel.click();
    assert.equal(yes.hidden, true);
    assert.equal(game.broken, undefined);
    // Breaking it by hand opens the same question instead of breaking it.
    game.claimClosePanel();
    assert.equal(game.finishBreakingBlock({ x: 100, y: 64, z: 100 }), false);
    assert.equal(game.claimAsking, true);
    assert.equal(blocks.get('100,64,100'), 'claim_marker');
    yes.click();
    assert.equal(JSON.stringify(game.broken.map((p) => [p.x, p.y, p.z])), '[[100,64,100]]');
    assert.equal(blocks.has('100,64,100'), false);
    assert.equal(game.claimPanelFor, null, 'closed');
    // The server says the plot is gone.
    network.emit('claimList', { claims: [plots('Ana').claims[1]], spawn: plots().spawn, radius: 8 });
    assert.equal(notice(), 'Has quitado tu parcela.');
    assert.equal(hooks.modal[0].isOpen.call(game), false);
});

test('admin commands: only in creative, by number from /plots', () => {
    const { game, network } = fakeGame();
    game.claimAdminCommand('plots', []);
    assert.deepEqual(game.messages, ['Unknown command: /plots']);
    game.creativeMode = true;
    game.messages.length = 0;
    game.claimAdminCommand('plots', []);
    assert.deepEqual(network.sent.at(-1), ['claimAdmin', { action: 'list' }]);
    network.emit('claimAdminResult', { ok: true, action: 'list', claims: [{ id: 'clm_aa', owner: 'Ana', ownerId: 'plr_1', x: 100, y: 64, z: 100 }, { id: 'clm_bb', owner: '', ownerId: 'plr_2', x: 1, y: 2, z: 3 }] });
    assert.deepEqual(game.messages, ['1. Ana (plr_1): mojón en 100, 64, 100', '2. sin nombre (plr_2): mojón en 1, 2, 3']);
    game.claimAdminCommand('plot', ['remove', '2']);
    assert.deepEqual(network.sent.at(-1), ['claimAdmin', { action: 'remove', id: 'clm_bb' }]);
    game.claimAdminCommand('plot', ['owner', '1', 'Beto', 'Pérez']);
    assert.deepEqual(network.sent.at(-1), ['claimAdmin', { action: 'owner', id: 'clm_aa', player: 'Beto Pérez' }]);
    game.messages.length = 0;
    game.claimAdminCommand('plot', ['remove', '9']);
    game.claimAdminCommand('plot', ['owner', '1']);
    network.emit('claimAdminResult', { ok: false, error: 'already' });
    assert.deepEqual(game.messages, ['No existe esa parcela: mira /plots.', 'Uso: /plots · /plot remove <n> · /plot owner <n> <jugador>', 'Ese jugador ya tiene una parcela.']);
});

test('/build stops before it covers someone else\'s plot, unless forced', () => {
    const source = read('game/constructions.js');
    assert.match(source, /claimForeignInBox\(min\.x, min\.z, min\.x \+ size\[0\] - 1, min\.z \+ size\[2\] - 1\)/);
    assert.match(source, /constructionStart\(what, \(args\[1\] \|\| ''\)\.toLowerCase\(\) === 'force'\)/);
    for (const helper of ['robot.js', 'beaver.js', 'copper_golem.js']) assert.match(read(`game/${helper}`), /claim(Helper)?Refusal(At)?\(/, helper);
});

// ---- Nothing missing ----

test('every line is in both languages, different, with the same placeholders, and used', () => {
    const { context } = fakeGame();
    const source = read('game/claims.js');
    const keys = Object.keys(context.CLAIM_TEXT);
    assert.ok(keys.length > 30, `${keys.length} lines`);
    for (const key of keys) {
        const { ES, EN, ...rest } = context.CLAIM_TEXT[key];
        assert.deepEqual(Object.keys(rest), [], key);
        assert.ok(ES && EN, `${key} in both`);
        assert.notEqual(ES, EN, key);
        const holes = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        assert.deepEqual(holes(ES), holes(EN), `${key} placeholders`);
        assert.ok(source.includes(`'${key}'`) || read('game/constructions.js').includes(`'${key}'`), `${key} is said nowhere`);
    }
    for (const [, key] of source.matchAll(/claimSay\('(\w+)'/g)) assert.ok(context.CLAIM_TEXT[key], `claimSay('${key}') has no line`);
    assert.match(read('game/constructions.js'), /claimSay\('buildBlocked'/);
});

test('it is loaded after building.js, whose methods it wraps, and /plots reaches it', () => {
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(scripts.indexOf('js/game/claims.js') > scripts.indexOf('js/game/building.js'));
    assert.ok(scripts.indexOf('js/game/claims.js') > scripts.indexOf('js/game/constructions.js'));
    assert.match(read('game/social.js'), /case 'plots':\s*case 'plot':\s*this\.claimAdminCommand\(normalized, args\)/);
});

// ---- Going home ----

test('the pause menu has «Ir a mi parcela», in both languages, and /home reaches the same', () => {
    const { context, game, network, pauseRow, notice } = fakeGame();
    const button = pauseRow.children.find((child) => child.id === 'settings-claim-home');
    assert.ok(button, 'the button is in the pause menu');
    assert.equal(button.textContent, 'Ir a mi parcela');
    context.setGameLang('EN');
    assert.equal(button.textContent, 'Go to my plot');
    context.setGameLang('ES');
    let closed = 0;
    game.closePauseMenu = () => { closed += 1; };
    // No plot: it says so and asks nothing.
    network.emit('claimList', plots('nobody'));
    button.click();
    assert.equal(closed, 1);
    assert.equal(network.sent.length, 0);
    assert.equal(notice(), 'No tienes parcela: pon un mojón para reclamar una.');
    network.emit('claimList', plots('Ana'));
    button.click();
    assert.deepEqual(network.sent.at(-1), ['claimHome', {}]);
    assert.match(read('game/social.js'), /case 'home':\s*this\.claimGoHome\(\)/);
    assert.match(read('game/social.js'), /\/spawn, \/home,/);
    network.connected = false;
    game.claimNoticeAt = -Infinity;
    game.claimGoHome();
    assert.equal(notice(), 'Sin conexión: las parcelas las guarda el servidor.');
});

test('going home has a cooldown of 30 s, here and from the server', () => {
    const { context, game, network, notice } = fakeGame({ lang: 'EN' });
    network.emit('claimList', plots('Ana'));
    assert.equal(game.claimGoHome(), true);
    network.emit('claimHomeResult', { ok: true, x: 100, y: 64, z: 100, minX: 92, minZ: 92, maxX: 108, maxZ: 108, cooldown: 30 });
    context.now += 12000;
    assert.equal(game.claimGoHome(), false);
    assert.equal(network.sent.length, 1);
    assert.equal(notice(), 'Wait 18 s to go to your plot again.');
    context.now += 18000;
    assert.equal(game.claimGoHome(), true);
    // The server's own count wins (another tab went home a moment ago).
    network.emit('claimHomeResult', { ok: false, reason: 'wait', wait: 25 });
    assert.equal(notice(), 'Wait 25 s to go to your plot again.');
    context.now += 5000;
    game.claimNoticeAt = -Infinity;
    assert.equal(game.claimGoHome(), false);
    assert.equal(notice(), 'Wait 20 s to go to your plot again.');
    network.emit('claimHomeResult', { ok: false, reason: 'none' });
    assert.equal(notice(), "You don't have a plot: place a claim marker to claim one.");
    game.respawnPending = true;
    context.now += 60000;
    assert.equal(game.claimGoHome(), false);
    assert.equal(notice(), "You can't go to your plot right now.");
});

test('a safe place to land: solid ground under the feet, room for the body, near the marker, inside the plot', () => {
    const { context } = fakeGame();
    const claim = { x: 100, y: 64, z: 100, minX: 92, minZ: 92, maxX: 108, maxZ: 108 };
    const make = (solidCells = new Set(), { liquid = new Set(), unloaded = () => false, ground = 63 } = {}) => ({
        loaded: (x, z) => !unloaded(x, z),
        solid: (x, y, z) => (y <= ground && !solidCells.has(`${x},${y},${z}:air`)) || solidCells.has(`${x},${y},${z}`),
        free: (x, y, z) => !((y <= ground && !solidCells.has(`${x},${y},${z}:air`)) || solidCells.has(`${x},${y},${z}`)) && !liquid.has(`${x},${y},${z}`)
    });
    const spot = (query) => { const s = context.claimHomeSpot(claim, query); return s && [s.x, s.y, s.z]; };
    // Flat ground: right next to the marker, feet on the ground (y 64), in the middle of the cell.
    const flat = spot(make());
    assert.equal(Math.max(Math.abs(flat[0] - 100.5), Math.abs(flat[2] - 100.5)), 1);
    assert.equal(flat[1], 64);
    // Walled in all round at ring 1 (2 high): the next ring.
    const walls = new Set();
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) for (const y of [64, 65]) walls.add(`${100 + dx},${y},${100 + dz}`);
    const out = spot(make(walls));
    assert.equal(Math.max(Math.abs(out[0] - 100.5), Math.abs(out[2] - 100.5)), 2);
    // A one-block-high gap is no room for a body; a roof two blocks up is.
    const low = new Set(walls);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) low.delete(`${100 + dx},64,${100 + dz}`);
    assert.equal(Math.max(Math.abs(spot(make(low))[0] - 100.5), Math.abs(spot(make(low))[2] - 100.5)), 2);
    // Never in water or lava, never over a column whose chunk is not here.
    const pool = new Set();
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) pool.add(`${100 + dx},64,${100 + dz}`);
    const dry = spot(make(new Set(), { liquid: pool }));
    assert.ok(Math.max(Math.abs(dry[0] - 100.5), Math.abs(dry[2] - 100.5)) >= 3 || dry[1] !== 64);
    const half = spot(make(new Set(), { unloaded: (x) => x <= 101 }));
    assert.ok(half[0] > 101);
    // The ground far below the marker (a marker on a tower): down to it, not into the air.
    const deep = spot(make(new Set(['100,63,100', '100,50,100']), { ground: 40 }));
    assert.equal(deep[1], 41);
    // Solid rock all round but a pocket of two cells over the marker: on top of the marker; no pocket: null.
    assert.deepEqual(spot(make(new Set(['100,65,100:air', '100,66,100:air']), { ground: 200 })), [100.5, 65, 100.5]);
    assert.equal(spot(make(new Set(), { ground: 200 })), null);
    // The camera's collisions have the last word (a fence counts as no room).
    const fenced = spot({ ...make(), standable: (x, y, z) => !(x === 101 && z === 100) && !(x === 99) });
    assert.ok(!(fenced[0] === 101.5 && fenced[2] === 100.5) && fenced[0] !== 99.5);
    // Every column it picks is inside the plot, whatever the ground.
    for (let i = 0; i < 20; i++) {
        const blocked = new Set();
        for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) if (Math.random() < 0.7) { blocked.add(`${100 + dx},64,${100 + dz}`); blocked.add(`${100 + dx},65,${100 + dz}`); }
        const s = context.claimHomeSpot(claim, make(blocked));
        if (s) assert.ok(s.x >= 92 && s.x < 109 && s.z >= 92 && s.z < 109 && !(Math.floor(s.x) === 100 && Math.floor(s.z) === 100 && s.y === 64));
    }
    assert.deepEqual(JSON.parse(JSON.stringify(context.claimChunksOf(claim))), [[80, 80], [80, 96], [96, 80], [96, 96]]);
});

test('going home: off the horse or the chair first, held over the marker until its chunks come, then on the ground', () => {
    const { game, network, world, position, notice, frame, context } = fakeGame();
    network.emit('claimList', plots('Ana'));
    const loaded = new Set();
    world.getColumnAt = (x, z) => loaded.has(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) || null;
    world.getBlockTypeAt = () => null;
    const calls = [];
    game.ridingMob = { userData: {} };
    game.dismount = function () { calls.push('dismount'); this.ridingMob = null; };
    game.seated = { x: 0, y: 0, z: 0 };
    game.seatStandUp = function () { calls.push('stand'); this.seated = null; };
    position.set(-500, 80, 700);
    game.claimGoHome();
    network.emit('claimHomeResult', { ok: true, x: 100, y: 64, z: 100, minX: 92, minZ: 92, maxX: 108, maxZ: 108, cooldown: 30 });
    assert.deepEqual(calls, ['dismount', 'stand']);
    assert.equal(notice(), 'Yendo a tu parcela…');
    // No chunk yet: held over the marker, however the physics moved them.
    assert.deepEqual([position.x, position.z], [100.5, 100.5]);
    const held = position.y;
    position.y -= 30;
    frame();
    assert.equal(position.y, held, 'never falls into an unloaded chunk');
    // Some chunks are here, not all: still held (for a while).
    loaded.add('6,6');
    frame();
    assert.equal(position.y, held);
    for (const key of ['5,5', '5,6', '6,5']) loaded.add(key);
    frame();
    assert.equal(game.claimHomeLanding, null);
    assert.equal(position.y, 64 + 1.62, 'feet on the ground');
    assert.equal(Math.max(Math.abs(position.x - 100.5), Math.abs(position.z - 100.5)), 1);
    assert.equal(game.cameraController.settled, 1);
    assert.equal(notice(), 'Estás en tu parcela.');
    // The marker's chunk alone, for long enough: it lands on what has arrived.
    context.now += 30000;
    loaded.clear();
    loaded.add('6,6');
    game.claimGoHome();
    network.emit('claimHomeResult', { ok: true, x: 100, y: 64, z: 100, minX: 92, minZ: 92, maxX: 108, maxZ: 108 });
    frame();
    assert.ok(game.claimHomeLanding);
    context.now += 9000;
    frame();
    assert.equal(game.claimHomeLanding, null);
    assert.ok(position.x >= 96 && position.z >= 96, 'only on loaded columns');
});

// ---- Guests ----

test('a guest builds in the plot like its owner, but not the marker; the border is violet', () => {
    const { context, game, network, blocks, hooks, notice } = fakeGame();
    const list = plots('nobody');
    list.claims[0].guest = true; // Ana's: I am her guest
    network.emit('claimList', list);
    assert.equal(game.claimRefusalAt(100, 100), null);
    assert.deepEqual({ ...game.claimRefusalAt(140, 100) }, { reason: 'claim', owner: 'Beto' });
    assert.equal(game.claimForeignInBox(95, 95, 99, 99), null, 'a guest\'s plot does not count as foreign');
    assert.equal(context.claimZoneName(game.claimZoneAt(100, 100)), 'Parcela de Ana (eres invitado)');
    // The marker: refused, says why, nothing broken; a right click only says whose it is.
    blocks.set('100,64,100', 'claim_marker');
    assert.equal(game.finishBreakingBlock({ x: 100, y: 64, z: 100 }), false);
    assert.equal(blocks.get('100,64,100'), 'claim_marker');
    assert.equal(notice(), 'Solo Ana puede quitar su mojón: tú eres invitado.');
    assert.equal(game.claimAsking, undefined);
    game.claimNoticeAt = -Infinity;
    assert.equal(hooks.use.some((handler) => handler.call(game, 'stone', { position: { x: 100, y: 64, z: 100 } })), true);
    assert.equal(game.claimPanelFor, undefined, 'no panel for a guest');
    assert.equal(notice(), 'Parcela de Ana (eres invitado)');
    // Anything else in the plot breaks.
    blocks.set('101,64,100', 'stone');
    assert.equal(game.finishBreakingBlock({ x: 101, y: 64, z: 100 }), true);
    // The server's refusal reads the same in English.
    context.setGameLang('EN');
    game.claimNoticeAt = -Infinity;
    network.emit('claimRefused', { reason: 'ownerOnly', owner: 'Ana', blocks: [] });
    assert.equal(notice(), 'Only Ana can remove their marker: you are a guest.');
    assert.equal(context.CLAIM_COLORS === undefined, true);
    assert.match(read('game/claims.js'), /guest: 0xc39bff/);
    assert.match(read('game/claims.js'), /claim\.mine \? CLAIM_COLORS\.mine : claim\.guest \? CLAIM_COLORS\.guest : CLAIM_COLORS\.other/);
});

test('the marker\'s panel lists the guests by name, removes them by key and invites connected players by page id', () => {
    const { game, network, blocks, hooks, document, notice } = fakeGame();
    network.playerId = 'page_me';
    const list = plots('Ana');
    list.claims[0].guests = [{ key: 'k1', name: 'Beto', online: true }, { key: 'k2', name: 'Cris' }];
    network.emit('claimList', list);
    network.emit('playerList', { players: [{ id: 'page_me', name: 'Ana' }, { id: 'page_b', name: 'Beto' }, { id: 'page_d', name: 'Dani' }, { id: 'page_x', name: '  ' }] });
    blocks.set('100,64,100', 'claim_marker');
    hooks.use.some((handler) => handler.call(game, 'stone', { position: { x: 100, y: 64, z: 100 } }));
    const panel = document.getElementById('claim-panel');
    const part = (className) => panel.children.find((child) => child.className === className);
    const guests = part('claim-guests');
    assert.deepEqual(guests.children.map((row) => row.children[0].textContent), ['Beto · conectado', 'Cris'], 'an offline guest is still there');
    const invite = part('claim-invite');
    assert.deepEqual(invite.children.map((button) => button.textContent), ['Invitar a Dani'], 'not myself, not a guest, not a blank name');
    guests.children[1].children[1].click();
    assert.deepEqual(network.sent.at(-1), ['claimGuest', { action: 'remove', key: 'k2' }]);
    invite.children[0].click();
    assert.deepEqual(network.sent.at(-1), ['claimGuest', { action: 'add', player: 'page_d' }]);
    assert.ok(!JSON.stringify(network.sent).includes('plr_'), 'never a player id');
    // The answers.
    network.emit('claimGuestResult', { action: 'add', ok: true, name: 'Dani' });
    assert.equal(notice(), 'Has invitado a Dani a tu parcela.');
    network.emit('claimGuestResult', { action: 'remove', ok: true, name: 'Cris' });
    assert.equal(notice(), 'Cris ya no es invitado de tu parcela.');
    for (const [error, text] of [['player', 'Ese jugador ya no está conectado.'], ['full', 'Tu parcela ya tiene todos los invitados que caben.'], ['self', 'No puedes invitarte a ti mismo.'], ['none', 'Solo el dueño de una parcela puede invitar.'], ['unknown', 'Ese invitado ya no estaba en la lista.']]) {
        game.claimNoticeAt = -Infinity;
        network.emit('claimGuestResult', { action: 'add', ok: false, error });
        assert.equal(notice(), text, error);
    }
    // A new list redraws the panel: Dani is a guest now, and nobody else is left to invite.
    list.claims[0].guests = [{ key: 'k1', name: 'Beto', online: true }, { key: 'k3', name: 'Dani', online: true }];
    network.emit('claimList', list);
    assert.deepEqual(part('claim-guests').children.map((row) => row.children[0].textContent), ['Beto · conectado', 'Dani · conectado']);
    assert.equal(part('claim-invite').children.length, 0);
    assert.ok(panel.children.some((child) => child.textContent === 'No hay nadie más conectado para invitar.'));
    // No guests at all.
    list.claims[0].guests = undefined;
    network.emit('claimList', list);
    assert.equal(part('claim-guests').children[0].textContent, 'Nadie invitado todavía.');
});

test('the admin may open someone else\'s panel, but the guests are the owner\'s to manage', () => {
    const { game, network, blocks, hooks, document } = fakeGame({ creative: true });
    network.emit('claimList', plots('nobody'));
    blocks.set('100,64,100', 'claim_marker');
    hooks.use.some((handler) => handler.call(game, 'stone', { position: { x: 100, y: 64, z: 100 } }));
    const panel = document.getElementById('claim-panel');
    assert.ok(panel.classList.contains('visible'));
    assert.equal(panel.children.find((child) => child.className === 'claim-guests').hidden, true);
    assert.equal(panel.children.find((child) => child.className === 'claim-invite').hidden, true);
});

// ---- The gap between plots ----

test('a new plot keeps 8 free blocks from any other and from the spawn area, and says how far it is', () => {
    const { context, game, network, notice, moveTo } = fakeGame();
    const list = plots('nobody');
    list.gap = 8;
    network.emit('claimList', list);
    assert.equal(game.claimState.gap, 8);
    game.selected = 'claim_marker';
    const aimAt = (x, z) => { moveTo(x + 1, z + 1); game.aim = { position: { x, y: 64, z }, face: { normal: { x: 0, y: 1, z: 0 } } }; };
    // Ana's plot ends at x 108; Beto's starts at 132.
    aimAt(119, 100); // the marker goes on top of (119, 64, 100): its plot from x 111
    game.placeBlock();
    assert.equal(game.placed, undefined);
    assert.equal(notice(), 'Demasiado cerca de la parcela de Ana: entre las dos quedarían 2 bloques libres y hacen falta 8.');
    // Between Ana's (x 92..108) and Beto's (x 132..148): the nearest is named.
    game.claimNoticeAt = -Infinity;
    aimAt(127, 120);
    game.placeBlock();
    assert.equal(notice(), 'Demasiado cerca de la parcela de Beto: entre las dos quedarían 3 bloques libres y hacen falta 8.');
    game.claimNoticeAt = -Infinity;
    aimAt(28, 0);
    game.placeBlock();
    assert.equal(notice(), 'Demasiado cerca de la zona de inicio: quedarían 4 bloques libres hasta ella y hacen falta 8.');
    aimAt(32, 0);
    game.placeBlock();
    assert.equal(game.placed, 1, '8 free columns from the spawn area go to the server');
    // The server's refusals read the same, in both languages; a missing distance is 0.
    context.setGameLang('EN');
    game.claimNoticeAt = -Infinity;
    network.emit('claimRefused', { reason: 'tooClose', owner: 'Ana', gap: 8, blocks: [] });
    assert.equal(notice(), "Too close to Ana's plot: there would be 0 free blocks between them and 8 are needed.");
    network.emit('claimRefused', { reason: 'tooCloseSpawn', distance: 5, gap: 8, blocks: [] });
    assert.equal(notice(), 'Too close to the spawn area: there would be 5 free blocks up to it and 8 are needed.');
    // The same count as the server's gapTo.
    const a = { minX: 0, minZ: 0, maxX: 16, maxZ: 16 };
    for (const [b, want] of [[{ minX: 17, minZ: 0, maxX: 33, maxZ: 16 }, 0], [{ minX: 25, minZ: 5, maxX: 41, maxZ: 21 }, 8], [{ minX: 20, minZ: 20, maxX: 36, maxZ: 36 }, 3], [{ minX: 10, minZ: 10, maxX: 26, maxZ: 26 }, -7]]) {
        assert.equal(context.claimRectGap(a, b), want);
        assert.equal(context.claimRectGap(b, a), want);
    }
});
