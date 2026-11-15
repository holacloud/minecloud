// Node tests for the transport network (js/game/portals.js, pkg/network/portals.go): the rule of the
// addresses and their places against the examples of FEAT_TRANSPORT_AND_PORTALS.md, the same numbers as the
// server, the blocks, crossing a portal on a flat world (support/flat_world.js), where a new player appears,
// "/build portals", and what a build tells the clients.
// Run with: node --test test/js/portals.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { ROOT, JS } = require('./support/game.js');
const { EYE, loadFlatGame, makeFlatWorld } = require('./support/flat_world.js');

const ctx = loadFlatGame({ frameUpdates: ['portalsUpdate'] });
const run = (code) => vm.runInContext(code, ctx);
const plain = (code) => JSON.parse(JSON.stringify(run(code)));
const go = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'portals.go'), 'utf8');
const goTest = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'portals_test.go'), 'utf8');

// The examples of the document: east is +x, north is -z.
const EXAMPLES = [
    ['', 0, 0, 0], ['N', 1, 0, 1000], ['NE', 2, 10000, 1000], ['NEN', 3, 10000, 101000],
    ['NENE', 4, 1010000, 101000], ['SOSO', 4, -1010000, -101000], ['OOOO', 4, -1111000, 0]
];

test('the examples of the document, and what is not an address', () => {
    for (const [address, level, east, north] of EXAMPLES) {
        const { x, z } = plain(`portalsPosition(${JSON.stringify(address)})`);
        assert.ok(run(`portalsValid(${JSON.stringify(address)})`), address);
        assert.equal(address.length, level);
        assert.equal(x, east, `${address} east`);
        assert.equal(0 - z, north, `${address} north`);
    }
    for (const bad of ['NS', 'SN', 'EO', 'OE', 'NES', 'SEN', 'NNNNN', 'X', 'n', 'NW', ' N', 'W']) {
        assert.equal(run(`portalsValid(${JSON.stringify(bad)})`), false, bad);
    }
});

test('105 plazas in four levels, never two in one place, each with its 4, 3 or 2 portals: 104, one per plaza but the centre', () => {
    const all = plain('portalsAddresses(PORTALS_MAX_LEVELS)');
    assert.equal(all.length, 105);
    const perLevel = [0, 0, 0, 0, 0];
    for (const address of all) perLevel[address.length]++;
    assert.deepEqual(perLevel, [1, 4, 12, 28, 60]);
    // Every string of up to four letters is listed exactly when it is valid.
    const strings = [''];
    for (let i = 0; i < strings.length; i++) if (strings[i].length < 4) for (const letter of 'NSEO') strings.push(strings[i] + letter);
    assert.equal(strings.length, 341);
    const listed = new Set(all);
    for (const s of strings) assert.equal(listed.has(s), run(`portalsValid(${JSON.stringify(s)})`), s);

    const places = new Set(all.map((address) => { const { x, z } = plain(`portalsPosition(${JSON.stringify(address)})`); return `${x},${z}`; }));
    assert.equal(places.size, 105, 'no two plazas in one place');

    let portals = 0;
    const destinations = new Set();
    for (const address of all) {
        const exits = plain(`portalsExits(${JSON.stringify(address)}, PORTALS_MAX_LEVELS)`);
        const axes = new Set([...address].map((letter) => ('NS'.includes(letter) ? 'ns' : 'eo')));
        const want = address.length === 4 ? 0 : address === '' ? 4 : axes.size === 1 ? 3 : 2;
        assert.equal(exits.length, want, address);
        for (const letter of exits) {
            const to = address + letter;
            assert.ok(listed.has(to), `${address} leads to ${to}`);
            destinations.add(to);
        }
        portals += exits.length;
    }
    assert.equal(portals, 104);
    assert.equal(destinations.size, 104, 'one portal leads to each plaza but the central one');
    assert.ok(!destinations.has(''));
    for (const [address, count] of [['', 4], ['N', 3], ['NN', 3], ['OOO', 3], ['NE', 2], ['NEN', 2], ['NENE', 0]]) {
        assert.equal(run(`portalsExits(${JSON.stringify(address)}, PORTALS_MAX_LEVELS).length`), count, address);
    }
    // A branch never turns back: no portal of N goes further south, none of E further west.
    assert.deepEqual(plain("portalsExits('N', PORTALS_MAX_LEVELS)"), ['N', 'E', 'O']);
    assert.deepEqual(plain("portalsExits('NE', PORTALS_MAX_LEVELS)"), ['N', 'E']);
});

test('every plaza but the central one has the portal back, behind whoever arrives and of the colour they came by', () => {
    const doors = (address) => plain(`portalsDoors(${JSON.stringify(address)}, PORTALS_MAX_LEVELS)`);
    const opposite = { N: 'S', S: 'N', E: 'O', O: 'E' };
    assert.deepEqual(plain('PORTALS_OPPOSITE'), opposite);
    assert.deepEqual(doors(''), ['N', 'E', 'S', 'O'].map((side) => ({ side, to: side, level: 1 })), 'none back from the centre');
    // N: three orange ones on, and the red one on its south edge, back to the centre.
    assert.deepEqual(doors('N'), [{ side: 'N', to: 'NN', level: 2 }, { side: 'E', to: 'NE', level: 2 }, { side: 'O', to: 'NO', level: 2 }, { side: 'S', to: '', level: 1 }]);
    assert.deepEqual(doors('NE'), [{ side: 'N', to: 'NEN', level: 3 }, { side: 'E', to: 'NEE', level: 3 }, { side: 'O', to: 'N', level: 2 }]);
    assert.deepEqual(doors('NENE'), [{ side: 'O', to: 'NEN', level: 4 }], 'the last level has only the one back');
    let backs = 0;
    for (const address of plain('portalsAddresses(PORTALS_MAX_LEVELS)')) {
        const all = doors(address);
        assert.equal(new Set(all.map((door) => door.side)).size, all.length, `${address}: one portal an edge`);
        assert.equal(all.length, run(`portalsExits(${JSON.stringify(address)}, PORTALS_MAX_LEVELS).length`) + (address === '' ? 0 : 1), address);
        if (address === '') continue;
        backs++;
        const back = all.at(-1);
        const last = address.at(-1);
        assert.deepEqual(back, { side: opposite[last], to: address.slice(0, -1), level: address.length }, address);
        // It is the other end of the portal that leads here: crossed there towards `last`, and of one colour.
        const there = doors(back.to).find((door) => door.to === address);
        assert.deepEqual(there, { side: last, to: address, level: back.level }, address);
    }
    assert.equal(backs, 104);
});

test('four levels are built: 105 plazas, 104 portals out and 104 back, the last level with only the one back', () => {
    assert.equal(run('PORTALS_LEVELS'), 4);
    assert.equal(run('PORTALS_PLAZAS.length'), 105);
    assert.equal(run('portalsAddresses().reduce((n, a) => n + portalsExits(a).length, 0)'), 104);
    assert.equal(run('portalsAddresses().reduce((n, a) => n + portalsDoors(a).length, 0)'), 208);
    assert.deepEqual(plain("portalsExits('NEN')"), ['N', 'E']);
    assert.deepEqual(plain("portalsDoors('NEN')").at(-1), { side: 'S', to: 'NE', level: 3 });
    assert.equal(run("portalsExits('NENE').length"), 0);
    assert.deepEqual(plain("portalsDoors('NENE')"), [{ side: 'O', to: 'NEN', level: 4 }]);
    assert.equal(run("portalsExits('NE').length"), 2);
    // The legend names the four colours and their jumps.
    assert.match(run("portalsSay('legendColours')"), /(green|verde) 1[.,]000[.,]000/);
});

test('the client and the server say the same numbers', () => {
    const number = (name) => Number(go.match(new RegExp(`\\b${name}\\s+= (\\d+)`))[1]);
    assert.equal(number('portalsLevels'), run('PORTALS_LEVELS'));
    assert.equal(number('portalsMaxLevels'), run('PORTALS_MAX_LEVELS'));
    assert.equal(number('portalsFirstJump'), run('PORTALS_FIRST_JUMP'));
    assert.equal(number('portalsPlazaRadius'), run('PORTALS_PLAZA_RADIUS'));
    assert.equal(number('portalsFrameHalf'), run('PORTALS_FRAME_HALF'));
    assert.equal(number('portalsPaneHeight'), run('PORTALS_PANE_HEIGHT'));
    assert.equal(number('portalsMargin'), run('PORTALS_MARGIN'));
    assert.equal(number('portalsPostOffset'), run('PORTALS_POST_OFFSET'));
    for (const [goName, jsName] of [['portalsPlazaBlock', 'PORTALS_PLAZA_BLOCK'], ['portalsPavingBlock', 'PORTALS_PAVING_BLOCK'],
        ['portalsCompassBlock', 'PORTALS_COMPASS_BLOCK'], ['portalsLegendBlock', 'PORTALS_LEGEND_BLOCK'], ['portalsStarBlock', 'PORTALS_STAR_BLOCK']]) {
        assert.equal(go.match(new RegExp(`${goName}\\s+= "([a-z_]+)"`))[1], run(jsName), goName);
    }
    assert.deepEqual(go.match(/portalsPostCorners = \[\]\[2\]int\{([^\n]*)\}\n/)[1].match(/-?\d+/g).map(Number), plain('PORTALS_POST_CORNERS').flat());
    assert.equal(run('portalsTrimBlock(0)'), 'portal_trim_white');
    assert.equal(run("portalsLetterBlock('O')"), 'portal_letter_o');
    assert.deepEqual(go.match(/portalsColours = \[\]string\{"", ([^}]*)\}/)[1].split(', ').map((s) => JSON.parse(s)),
        plain('PORTALS_COLOURS.slice(1).map(([colour]) => colour)'));
    assert.deepEqual(go.match(/portalsLetters = \[\]byte\{([^}]*)\}/)[1].split(', ').map((s) => s.slice(1, -1)), plain('PORTALS_LETTERS'));
    const steps = Object.fromEntries([...go.match(/portalsSteps\s+= map\[byte\]\[2\]int\{([^\n]*)\}\n/)[1].matchAll(/'(\w)': \{(-?\d), (-?\d)\}/g)]
        .map(([, letter, x, z]) => [letter, [Number(x), Number(z)]]));
    assert.deepEqual(steps, plain('PORTALS_STEPS'));
    const opposite = Object.fromEntries([...go.match(/portalsOpposite = map\[byte\]byte\{([^\n]*)\}\n/)[1].matchAll(/'(\w)': '(\w)'/g)]
        .map(([, letter, across]) => [letter, across]));
    assert.deepEqual(opposite, plain('PORTALS_OPPOSITE'));
    // North is -z and east +x, as the shapes of the blocks say.
    assert.deepEqual(plain('PORTALS_STEPS.N'), plain('SHAPE_DIRECTIONS.n'));
    assert.deepEqual(plain('PORTALS_STEPS.E'), plain('SHAPE_DIRECTIONS.e'));
});

// The compass at the top of the screen (navigationCompassLetter, js/game.js) and the anemometer's points
// (weatherCompass, js/game/weather.js) name the same points as the portals: east is +x, north is -z. A camera
// of yaw `yaw` looks along (0, 0, -1) turned by `yaw` about +y (js/camera.js, the way it walks forward):
// (-sin yaw, 0, -cos yaw).
test('the compass of the screen and the anemometer: looking along +x is east, along -x west, as the portals say', () => {
    // js/game.js is the core and is not loaded here: its rule is taken from the source, and the HUD must use it.
    const core = fs.readFileSync(path.join(JS, 'game.js'), 'utf8');
    run(core.match(/\nfunction navigationCompassLetter\(yaw\) \{\n[^]*?\n\}\n/)[0]);
    assert.match(core, /updateNavigationHUD\(\) \{[^]*?compass\.textContent = navigationCompassLetter\(this\.cameraController\.yaw\);/);
    const looking = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)];
    const steps = plain('PORTALS_STEPS');
    for (const [letter, hud] of [['N', 'N'], ['E', 'E'], ['S', 'S'], ['O', 'W']]) {
        const yaw = run(`portalsYawOf('${letter}')`);
        const [x, z] = looking(yaw);
        assert.ok(Math.abs(x - steps[letter][0]) < 1e-9 && Math.abs(z - steps[letter][1]) < 1e-9, `${letter}: looking ${x}, ${z}`);
        assert.equal(run(`navigationCompassLetter(${yaw})`), hud, letter);
    }
    // Along -z, +x, +z and -x, whatever the turns before, and the nearest point in between.
    for (const [x, z, hud] of [[0, -1, 'N'], [1, 0, 'E'], [0, 1, 'S'], [-1, 0, 'W']]) {
        const yaw = Math.atan2(-x, -z);
        for (const turns of [-2, 0, 3]) assert.equal(run(`navigationCompassLetter(${yaw + turns * 2 * Math.PI})`), hud, `${x},${z} ${turns}`);
        assert.equal(run(`navigationCompassLetter(${yaw + 0.7})`), hud);
        assert.equal(run(`navigationCompassLetter(${yaw - 0.7})`), hud);
    }
    // The anemometer's eight points, from a direction (x, z).
    for (const [x, z, point] of [[0, -1, 'N'], [1, -1, 'NE'], [1, 0, 'E'], [1, 1, 'SE'], [0, 1, 'S'], [-1, 1, 'SW'], [-1, 0, 'W'], [-1, -1, 'NW']]) {
        assert.equal(run(`weatherCompass(${x}, ${z})`), point, `${x},${z}`);
        // And a camera looking that way reads the same letter on the HUD, for the four main ones.
        if (point.length === 1) assert.equal(run(`navigationCompassLetter(${Math.atan2(-x, -z)})`), point);
    }
});

// The digest of the shapes of '', 'N', 'NE', 'NEN' and 'NENE' over a floor at y = 10, as portalsShapeDigest in
// pkg/network/portals_test.go makes it: the count of cells and an FNV-1a of "x,y,z,name;" for each, in order.
function shapeDigest() {
    let hash = 2166136261;
    let cells = 0;
    for (const address of ['', 'N', 'NE', 'NEN', 'NENE']) {
        for (const [x, y, z, name] of plain(`portalsShape(${JSON.stringify(address)}, 10)`)) {
            cells++;
            for (const byte of Buffer.from(`${x},${y},${z},${name};`)) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
        }
    }
    return `${cells}:${hash.toString(16).padStart(8, '0')}`;
}

test('a plaza: a core of 17 x 17 with its ring of colour and its rose, a margin round it, four posts at its corners, and its portals with their signs', () => {
    const count = (address) => {
        const names = {};
        for (const [, , , name] of plain(`portalsShape(${JSON.stringify(address)}, 10)`)) names[name] = (names[name] || 0) + 1;
        return names;
    };
    const core = 15 * 15 - 1;
    const ring = 16 * 4;
    const margin = 31 * 31 - 17 * 17;
    assert.deepEqual(count(''), {
        portal_compass: 1, portal_plaza: core + 4 * 11, portal_trim_white: ring + 4, portal_paving: margin, portal_legend: 4, portal_star: 4,
        portal_red: 36, portal_letter_n: 1, portal_letter_e: 1, portal_letter_s: 1, portal_letter_o: 1
    });
    assert.deepEqual(count('N'), {
        portal_compass: 1, portal_plaza: core + 4 * 11, portal_trim_red: ring + 4, portal_paving: margin, portal_legend: 4,
        portal_letter_n: 4 + 1, portal_orange: 27, portal_letter_e: 1, portal_letter_o: 1, portal_red: 9, portal_letter_s: 1
    });
    assert.deepEqual(count('NEN'), {
        portal_compass: 1, portal_plaza: core + 3 * 11, portal_trim_yellow: ring + 4, portal_paving: margin, portal_legend: 4,
        portal_letter_n: 8 + 1, portal_letter_e: 4 + 1, portal_green: 18, portal_yellow: 9, portal_letter_s: 1
    });
    assert.deepEqual(count('NENE'), {
        portal_compass: 1, portal_plaza: core + 11, portal_trim_green: ring + 4, portal_paving: margin, portal_legend: 4,
        portal_letter_e: 8, portal_letter_n: 8, portal_green: 9, portal_letter_o: 1
    });
    assert.deepEqual(plain('[1, 2, 3, 4].map(portalsPaneBlock)'), ['portal_red', 'portal_orange', 'portal_yellow', 'portal_green']);
    assert.deepEqual(plain('[0, 1, 2, 3, 4].map(portalsTrimBlock)'), ['portal_trim_white', 'portal_trim_red', 'portal_trim_orange', 'portal_trim_yellow', 'portal_trim_green']);
    // A post of NEN from the floor up, at a corner of the core just inside its ring: the legend, NEN read from
    // the top down, the cap of its colour. Nothing stands over the floor in the middle of the core.
    assert.equal(run('PORTALS_POST_OFFSET'), run('PORTALS_PLAZA_RADIUS') - 1);
    const post = plain("portalsShape('NEN', 10)").filter(([x, , z]) => x === 10000 + 7 && z === -101000 + 7).map(([, y, , name]) => [y, name]);
    assert.deepEqual(post, [[10, 'portal_plaza'], [11, 'portal_legend'], [12, 'portal_letter_n'], [13, 'portal_letter_e'], [14, 'portal_letter_n'], [15, 'portal_trim_yellow']]);
    assert.ok(!plain("portalsShape('NEN', 10)").some(([x, y, z]) => y > 10 && Math.abs(x - 10000) < 7 && Math.abs(z + 101000) < 7), 'the middle is free');
    // The very same cells as the server's, in the same order.
    assert.equal(shapeDigest(), goTest.match(/portalsShapeDigestWant = "([^"]+)"/)[1]);

    // Every pane of every built portal leads where its plaza's address plus its letter says, or back to
    // the address without its last letter, and has the colour of the farther of the two; the sign over it is
    // the letter of its way.
    let panes = 0;
    let back = 0;
    let signs = 0;
    for (const address of plain('portalsAddresses()')) {
        for (const [x, y, z, name] of plain(`portalsShape(${JSON.stringify(address)}, 10)`)) {
            const exit = plain(`portalsExitAt(${x}, ${z})`);
            if (y === 15 && name.startsWith('portal_letter_') && exit) {
                signs++;
                assert.equal(name, `portal_letter_${exit.letter.toLowerCase()}`, `${address} ${x},${z}`);
            }
            if (!/^portal_(red|orange|yellow|green)$/.test(name)) continue;
            panes++;
            assert.ok(exit && exit.from === address, `${address} ${x},${z}`);
            assert.equal(exit.level, Math.max(address.length, exit.to.length));
            if (exit.to.length < address.length) {
                back++;
                assert.equal(exit.to, address.slice(0, -1), `${address} ${x},${z}`);
                assert.notEqual(exit.letter, address.at(-1));
            } else assert.equal(exit.to, address + exit.letter, `${address} ${x},${z}`);
            assert.equal(name, run(`portalsPaneBlock(${exit.level})`));
        }
    }
    assert.equal(panes, 208 * 9);
    assert.equal(back, 104 * 9);
    assert.equal(signs, 208);
    // The south edge of N's core leads back to the centre; the south edge of the last plaza built, to the one
    // before.
    assert.deepEqual(plain('portalsExitAt(0, -992)'), { from: 'N', letter: 'S', to: '', level: 1 });
    assert.deepEqual(plain('portalsExitAt(10000, -100992)'), { from: 'NEN', letter: 'S', to: 'NE', level: 3 });
    assert.deepEqual(plain('portalsExitAt(10000, -101008)'), { from: 'NEN', letter: 'N', to: 'NENN', level: 4 });
    // NENE, of the last level, has the green one back on its west edge.
    assert.deepEqual(plain('portalsExitAt(1009992, -101000)'), { from: 'NENE', letter: 'O', to: 'NEN', level: 4 });
    // Nowhere else: the middle of a plaza, the corner of an edge, an edge of the last level, the margin, the
    // open country.
    assert.equal(run('portalsExitAt(0, -1000)'), null);
    assert.equal(run('portalsExitAt(3, -992)'), null);
    assert.equal(run('portalsExitAt(1010000, -101008)'), null);
    assert.equal(run('portalsExitAt(0, -985)'), null);
    assert.equal(run('portalsExitAt(500, 500)'), null);
    // A plaza holds its margin.
    assert.equal(run('portalsPlazaAt(15, -15)'), '');
    assert.equal(run('portalsPlazaAt(16, 0)'), null);
    assert.equal(run('portalsPlazaAt(-15, -1015)'), 'N');
});

test('the blocks: nobody breaks them or gets them, the panes are walked into, glow and light', () => {
    const g = makeFlatWorld(ctx);
    const world = g.world;
    const plaza = world.blockTypes.portal_plaza;
    assert.ok(plaza.unbreakable && plaza.dropType === null);
    assert.equal(world.getBreakDurationForType('portal_plaza'), null);
    assert.equal(world.registry.solid[world.registry.id('portal_plaza')], 1);
    for (const [colour, level] of [['red', 1], ['orange', 2], ['yellow', 3], ['green', 4]]) {
        const def = world.blockTypes[`portal_${colour}`];
        const id = world.registry.id(`portal_${colour}`);
        assert.ok(def && def.unbreakable && def.portalLevel === level, colour);
        assert.equal(world.getBreakDurationForType(`portal_${colour}`), null);
        assert.equal(world.registry.solid[id], 0, `${colour}: walked into`);
        assert.ok(world.isLightEmitterType(`portal_${colour}`), `${colour} gives light`);
        assert.ok(def.glow > 0);
    }
    // Colours run as the rainbow does: red, orange, yellow, green.
    const hue = (hex) => {
        const [r, gr, b] = [hex >> 16, (hex >> 8) & 255, hex & 255].map((c) => c / 255);
        const max = Math.max(r, gr, b);
        const min = Math.min(r, gr, b);
        const h = max === r ? ((gr - b) / (max - min)) % 6 : max === gr ? (b - r) / (max - min) + 2 : (r - gr) / (max - min) + 4;
        return (h * 60 + 360) % 360;
    };
    const hues = ['red', 'orange', 'yellow', 'green'].map((colour) => hue(world.blockTypes[`portal_${colour}`].color));
    assert.deepEqual(hues, [...hues].sort((a, b) => a - b));
    assert.ok(hues[0] < 15 && hues[1] > 20 && hues[1] < 45 && hues[2] > 45 && hues[2] < 70 && hues[3] > 90 && hues[3] < 150, String(hues));
    // A refusal of the server for a block of the network has its line, in both languages.
    assert.match(run("claimRefusalText({ reason: 'plaza' })"), /portal/);
    assert.ok(run("CLAIM_TEXT.refusedPlaza.ES") && run("CLAIM_TEXT.refusedPlaza.EN"));
});

// The new blocks: official like the rest, solid, and drawn as they should be read.
test('the rose, the letters, the star, the legend, the paving and the colours: nobody breaks them, and they read the right way', () => {
    const g = makeFlatWorld(ctx);
    const world = g.world;
    const names = ['portal_paving', 'portal_compass', 'portal_legend', 'portal_star', 'portal_letter_n', 'portal_letter_e', 'portal_letter_s',
        'portal_letter_o', 'portal_trim_white', 'portal_trim_red', 'portal_trim_orange', 'portal_trim_yellow', 'portal_trim_green'];
    for (const name of names) {
        const def = world.blockTypes[name];
        assert.ok(def && def.unbreakable && def.dropType === null, name);
        assert.equal(world.getBreakDurationForType(name), null, name);
        assert.equal(world.registry.solid[world.registry.id(name)], 1, `${name} is stood on`);
    }
    // Each plaza colour is the colour of its portals.
    for (const [colour, hex] of plain('PORTALS_COLOURS.slice(1)')) assert.equal(world.blockTypes[`portal_trim_${colour}`].color, hex, colour);

    // The mesher lays a top face's texture with u along +x (east) and v, as the pattern paints it (row 0 at the
    // top of the canvas, which three.js puts at uv v = 1), along +z (south): north is the top row.
    const faces = plain('MESH_FACES');
    const uvs = plain('MESH_FACE_UVS');
    const top = faces.findIndex((face) => face.normal[1] === 1);
    faces[top].corners.forEach((corner, i) => {
        assert.equal(uvs[i][0], corner[0], 'u runs east');
        assert.equal(1 - uvs[i][1], corner[2], 'the painted v runs south');
    });
    for (const [x, z] of [[0, 0], [1, 0], [0, 1], [1, 1]]) assert.deepEqual(plain(`ChunkMesher.boxFaceUV(${top}, ${x}, 1, ${z})`), [x, 1 - z]);
    // So on the rose N is painted at the top, S at the bottom, E on the right and O on the left, and the red arm
    // points north.
    const centre = {};
    for (let i = 0; i < 64; i++) {
        for (let j = 0; j < 64; j++) {
            const ink = run(`portalsCompassInk(${(i + 0.5) / 64}, ${(j + 0.5) / 64})`);
            if (!ink) continue;
            const c = centre[ink] || (centre[ink] = { u: 0, v: 0, n: 0 });
            c.u += (i + 0.5) / 64;
            c.v += (j + 0.5) / 64;
            c.n++;
        }
    }
    const at = (ink) => [centre[ink].u / centre[ink].n, centre[ink].v / centre[ink].n];
    assert.ok(at('N')[1] < 0.2 && Math.abs(at('N')[0] - 0.5) < 0.05, `N at ${at('N')}`);
    assert.ok(at('S')[1] > 0.8 && Math.abs(at('S')[0] - 0.5) < 0.05, `S at ${at('S')}`);
    assert.ok(at('E')[0] > 0.8 && Math.abs(at('E')[1] - 0.5) < 0.05, `E at ${at('E')}`);
    assert.ok(at('O')[0] < 0.2 && Math.abs(at('O')[1] - 0.5) < 0.05, `O at ${at('O')}`);
    assert.ok(at('north')[1] < 0.45 && Math.abs(at('north')[0] - 0.5) < 0.02, `the red arm at ${at('north')}`);
    assert.equal(world.blockTypes.portal_compass.faces.top.minSize, 64);

    // The letters: at 32 pixels, a dot of the glyph is 4 x 4 pixels of ink, so a letter is 20 x 28 of the 32.
    const factory = new (run('BlockTextureFactory'))();
    for (const [glyph, block] of [['n', 'portal_letter_n'], ['e', 'portal_letter_e'], ['s', 'portal_letter_s'], ['o', 'portal_letter_o'], ['i', 'portal_legend'], ['star', 'portal_star']]) {
        const s = factory.createSurface(32, false);
        run('TEXTURE_PATTERNS')[`portal_glyph_${glyph}`].paint(factory, s, null, 1);
        const ink = factory.rgb(run(`PORTALS_GLYPH_LOOKS.${glyph}[1]`));
        let pixels = 0;
        for (let i = 0; i < 32 * 32; i++) if (s.color[i * 3] === ink[0] && s.color[i * 3 + 1] === ink[1] && s.color[i * 3 + 2] === ink[2]) pixels++;
        const dots = plain(`PORTALS_GLYPHS.${glyph}`).join('').split('#').length - 1;
        assert.equal(pixels, dots * 16, glyph);
        assert.equal(world.blockTypes[block].faces.side.pattern, `portal_glyph_${glyph}`);
        assert.equal(world.blockTypes[block].faces.side.minSize, 32);
    }
    const glyphs = plain('PORTALS_GLYPHS');
    assert.equal(new Set(Object.values(glyphs).map((rows) => rows.join('/'))).size, Object.keys(glyphs).length, 'no two glyphs alike');
});

// The flat world with the central plaza and the plaza N on it, floors in place of the grass (its top at -1).
function networkBlocks(extra = {}) {
    const blocks = {};
    for (const address of ['', 'N']) {
        for (const [x, y, z, name] of plain(`portalsShape(${JSON.stringify(address)}, -1)`)) blocks[`${x},${y},${z}`] = name;
    }
    return { ...blocks, ...extra };
}

// A flat world for a journey: a clock of its own for the landing, and a stand-in for the mesher that draws
// whatever columns are here and in view after each frame (unless `drawn` says not yet).
function journeyWorld(options) {
    const g = makeFlatWorld(ctx, options);
    g.game.health = 20;
    const clock = { now: 0, drawn: true };
    g.game.portalsNow = () => clock.now;
    g.frames = (count, step = 1000 / 30) => {
        for (let i = 0; i < count; i++) {
            clock.now += step;
            g.frame();
            if (!clock.drawn) continue;
            for (const key of g.world.activeChunks) if (g.world.columns.has(key) && !g.world.chunks.has(key)) g.world.chunks.set(key, { children: [] });
        }
    };
    g.clock = clock;
    return g;
}

test('crossing a portal leaves the player at the centre of the plaza it leads to, facing on, after the effect of its colour', () => {
    // In the pane of the central plaza's north portal (z = -8), walking north.
    const g = journeyWorld({ x: 0.5, z: -7.5, blocks: networkBlocks() });
    g.cameraController.yaw = 0.3;
    assert.equal(g.world.getBlockTypeAt(0, 0, -8), 'portal_red');
    g.frames(1);
    // On the way: held over the plaza, under the effect, with the name of where it goes.
    assert.ok(g.game.portalsLanding !== null, 'on the way');
    const travel = g.game.portalsTravel;
    assert.ok(travel && travel.title === 'Plaza N' && travel.colour === 0xe53935, JSON.stringify(travel));
    assert.match(travel.line, /^1[.,]000 (blocks north|bloques al norte)$/);
    g.frames(8);
    assert.ok(g.game.portalsLanding !== null, 'never shorter than half a second, even with everything drawn');
    g.frames(10);
    const at = g.camera.position;
    assert.ok(Math.abs(at.x - 0.5) < 1e-9 && Math.abs(at.z - -999.5) < 1e-9, `at ${at.x}, ${at.z}`);
    assert.ok(Math.abs(at.y - EYE) < 1e-6, `feet on the rose of N: ${at.y - EYE}`);
    assert.equal(g.world.getBlockTypeAt(0, -1, -1000), 'portal_compass');
    assert.equal(g.cameraController.yaw, 0, 'facing north');
    assert.ok(g.game.portalsLanding === null && g.game.portalsTravel === null, 'arrived, the effect gone');
    assert.equal(run(`portalsPlazaAt(${Math.floor(at.x)}, ${Math.floor(at.z)})`), 'N');
    assert.ok(g.said.some((line) => /^Plaza N: 1[.,]000 (north|al norte)\.$/.test(line)), g.said.join(' | '));
    assert.match(run("portalsWhere('NEN')"), /10[.,]000 .*101[.,]000/);
    // It does not go on by itself: standing at the centre crosses nothing.
    g.frames(30);
    assert.ok(Math.abs(g.camera.position.z - -999.5) < 1e-9);
});

test('the effect stays until the place is drawn, and goes after the longest wait anyway', () => {
    const g = journeyWorld({ x: 0.5, z: -7.5, blocks: networkBlocks() });
    g.clock.drawn = false;
    g.frames(60);
    assert.ok(g.game.portalsLanding !== null && g.game.portalsTravel !== null, 'two seconds and nothing drawn: still on the way');
    assert.ok(g.world.getColumnAt(0, -1000), 'the columns are here, the meshes are not');
    // Drawn, but a neighbour waits for its mesh to be built again: not yet.
    g.clock.drawn = true;
    g.frames(1);
    const key = g.world.chunkKey(1, -63);
    g.world.rebuildQueue.add(key);
    g.frames(1);
    assert.ok(g.game.portalsLanding !== null, 'a rebuild waiting');
    g.world.rebuildQueue.delete(key);
    g.frames(1);
    assert.ok(g.game.portalsLanding === null && g.game.portalsTravel === null, 'drawn: arrived');
    assert.ok(Math.abs(g.camera.position.y - EYE) < 1e-6);

    // Nothing ever comes: after PORTALS_WAIT_MS the effect goes and the camera's own settling takes over.
    const h = journeyWorld({ x: 0.5, z: -7.5, blocks: networkBlocks() });
    h.clock.drawn = false;
    h.frames(1);
    h.frames(1, run('PORTALS_WAIT_MS') + 1);
    assert.ok(h.game.portalsLanding === null && h.game.portalsTravel === null, 'timed out');
    assert.ok(!h.said.some((line) => /Plaza N/.test(line)), 'no arrival said');
});

// A stand-in for the few calls of the document the journey's effect makes: elements that keep their markup,
// their classes and their style properties, and the count of what was made.
function fakeDocument() {
    const made = [];
    const element = (tag) => {
        const props = {};
        const found = {};
        const el = {
            tag, id: '', innerHTML: '', textContent: '', props,
            classList: { names: new Set(), add(name) { this.names.add(name); }, remove(name) { this.names.delete(name); } },
            style: { setProperty(name, value) { props[name] = value; } },
            setAttribute() {}, appendChild() {}, addEventListener() {},
            querySelector: (selector) => found[selector] || (found[selector] = element('found'))
        };
        made.push(el);
        return el;
    };
    return { made, document: { createElement: element, addEventListener() {}, body: { appendChild() {} }, head: { appendChild() {} }, getElementById: () => null, querySelector: () => null } };
}

test('while travelling, voxels rush past: built once, three faces each, never on the axis, the same every time, in the portal\'s colours', () => {
    const fake = fakeDocument();
    const real = ctx.document;
    ctx.document = fake.document;
    try {
        const g = makeFlatWorld(ctx);
        g.game.portalsTravelShow(plain("portalsTravelText({ from: '', letter: 'N', to: 'N', level: 1 })"));
        g.game.portalsTravelHide();
        g.game.portalsTravelShow(plain("portalsTravelText({ from: 'NEN', letter: 'E', to: 'NENE', level: 4 })"));
        // One element for the effect and one style, whatever the number of crossings.
        const divs = fake.made.filter((el) => el.tag === 'div');
        assert.equal(divs.length, 1, 'built once');
        const travel = divs[0];
        assert.ok(travel.classList.names.has('visible'));
        const html = travel.innerHTML;
        // Under the text, over the rings.
        assert.ok(html.indexOf('portals-ring') < html.indexOf('portals-warp') && html.indexOf('portals-warp') < html.indexOf('portals-title'));
        const voxels = html.split('<div class="portals-voxel ').slice(1);
        assert.equal(voxels.length, run('PORTALS_WARP_VOXELS'));
        assert.equal(voxels.length, 36);
        for (const voxel of voxels) {
            assert.equal(voxel.split('<i ').length - 1, 3, 'three faces');
            assert.match(voxel, /class="portals-front"/);
            assert.match(voxel, /class="portals-side-x" [^>]*rotateY\(-?90deg\)/);
            assert.match(voxel, /class="portals-side-y" [^>]*rotateX\(-?90deg\)/);
            assert.match(voxel, /^portals-v[0-4]"/);
        }
        // The shades of the last portal crossed, a green one: light, the colour, dark and two near white.
        const shade = (i) => travel.props[`--portals-v${i}`];
        assert.equal(shade(1), '#43a047');
        assert.equal(travel.props['--portals-colour'], '#43a047');
        const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
        const sum = (hex) => rgb(hex).reduce((a, b) => a + b, 0);
        assert.ok(sum(shade(0)) > sum(shade(1)) && sum(shade(2)) < sum(shade(1)), [0, 1, 2].map(shade).join(' '));
        for (const i of [3, 4]) assert.ok(rgb(shade(i)).every((c) => c >= 0xc0), shade(i));
        assert.deepEqual(plain('portalsWarpShades(0xe53935)').slice(1, 2), ['#e53935']);
        assert.equal(plain('portalsWarpShades(0x000000)')[2], '#000000');
        assert.equal(plain('portalsWarpShades(0xffffff)')[3], '#ffffff');
    } finally {
        ctx.document = real;
    }

    // The layout: fixed by the seed, and the markup with it.
    const layout = plain('portalsWarpLayout()');
    assert.deepEqual(plain('portalsWarpLayout()'), layout);
    assert.equal(run('portalsWarpMarkup()'), run('portalsWarpMarkup(portalsWarpLayout())'));
    let bars = 0;
    for (const v of layout) {
        const away = Math.hypot(v.x, v.y);
        assert.ok(away - v.size / 2 >= 4 - 1e-9 && away <= 45 + 1e-9, `not on the axis: ${away}`);
        assert.ok(v.size >= 3 && v.size <= 8, `size ${v.size}`);
        assert.ok(v.duration >= 0.6 && v.duration <= 1.5 && v.delay <= 0 && v.delay > -v.duration, `${v.duration} ${v.delay}`);
        assert.equal(v.sideX, v.x > 0 ? 'left' : 'right');
        assert.equal(v.sideY, v.y > 0 ? 'top' : 'bottom');
        assert.ok(Number.isInteger(v.shade) && v.shade >= 0 && v.shade <= 4);
        if (v.length > v.size) {
            bars++;
            assert.ok(v.length / v.size >= 3 && v.length / v.size <= 6, `a bar ${v.length / v.size} times its width`);
        } else assert.equal(v.length, v.size);
    }
    assert.ok(bars >= 4 && bars <= layout.length / 2, `${bars} bars`);
    // All round the axis: voxels in each quarter of the screen.
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) assert.ok(layout.some((v) => Math.sign(v.x) === sx && Math.sign(v.y) === sy), `${sx},${sy}`);

    // Moved by CSS only while the effect is shown, and with reduced motion not there at all.
    const css = run('PORTALS_CSS');
    for (const rule of css.split('\n').filter((line) => /animation:portals-warp/.test(line))) assert.match(rule, /^#portals-travel\.visible /);
    assert.match(css, /@keyframes portals-warp\{0%\{transform:translateZ\(-4500px\)\}100%\{transform:translateZ\(1200px\)\}\}/);
    assert.match(css, /prefers-reduced-motion: reduce\)\{[^\n]*#portals-travel \.portals-warp[^{]*\{display:none\}/);
    assert.match(css, /\.portals-warp\{[^}]*perspective:600px/);
    assert.ok(!/color-mix|filter:|box-shadow/.test(css), 'nothing a modest tablet pays for');
});

test('a journey ends with no landing when the player dies, the connection drops, or /tp or /spawn take them elsewhere', () => {
    const start = () => {
        const g = journeyWorld({ x: 0.5, z: -7.5, blocks: networkBlocks() });
        g.game.network = { connected: true, send() {} };
        g.clock.drawn = false;
        g.frames(2);
        assert.ok(g.game.portalsLanding !== null && g.game.portalsTravel !== null);
        return g;
    };
    const ended = (g, what) => {
        g.frames(1);
        assert.ok(g.game.portalsLanding === null && g.game.portalsTravel === null, what);
        g.clock.drawn = true;
        g.frames(30);
        assert.ok(!g.said.some((line) => /^Plaza N/.test(line)), `${what}: no landing after`);
    };
    let g = start();
    g.game.health = 0;
    ended(g, 'died');
    g = start();
    g.game.network.connected = false;
    ended(g, 'disconnected');
    g = start();
    g.game.creativeMode = true;
    g.game.creativeTeleport('tp', ['40', '60']);
    ended(g, '/tp');
    assert.ok(Math.abs(g.camera.position.x - 40.5) < 1 && Math.abs(g.camera.position.z - 60.5) < 1, `not snapped back: ${g.camera.position.x}, ${g.camera.position.z}`);
    g = start();
    g.game.runChatCommand('/spawn');
    ended(g, '/spawn');
    assert.ok(Math.abs(g.camera.position.z) < 1, `at the spawn point: ${g.camera.position.z}`);
});

test('the portal behind whoever arrives takes them back where they came from, facing away from it', () => {
    // In the pane of the south portal of N (z = -992), the red one, walking south.
    const g = journeyWorld({ x: 0.5, z: -991.5, blocks: networkBlocks() });
    g.cameraController.yaw = 0;
    assert.equal(g.world.getBlockTypeAt(0, 0, -992), 'portal_red');
    assert.equal(g.world.getBlockTypeAt(0, 0, -1008), 'portal_orange');
    g.frames(1);
    assert.equal(g.game.portalsTravel.title, run("portalsSay('travelCentre')"));
    g.frames(20);
    const at = g.camera.position;
    assert.ok(Math.abs(at.x - 0.5) < 1e-9 && Math.abs(at.z - 0.5) < 1e-9, `at ${at.x}, ${at.z}`);
    assert.ok(Math.abs(at.y - EYE) < 1e-6, `feet on the floor of the central plaza: ${at.y - EYE}`);
    assert.equal(g.cameraController.yaw, Math.PI, 'facing south, the north portal behind');
    assert.ok(g.said.some((line) => /^(Central plaza|Plaza central)\.$/.test(line)), g.said.join(' | '));
});

test('somebody built at the centre of the plaza: the player arrives on top, never inside', () => {
    const g = journeyWorld({ x: 0.5, z: -7.5, blocks: networkBlocks({ '0,0,-1000': 'stone', '0,1,-1000': 'stone' }) });
    g.frames(20);
    const at = g.camera.position;
    assert.ok(Math.abs(at.z - -999.5) < 1e-9, `at ${at.x}, ${at.z}`);
    assert.ok(Math.abs(at.y - EYE - 2) < 1e-6, `feet on the blocks built there: ${at.y - EYE}`);
});

test('a right click on the sign over a portal says where it goes; on a post, the legend of the plaza', () => {
    const g = journeyWorld({ x: 0.5, z: 0.5, blocks: networkBlocks() });
    // The sign over the central plaza's north portal, at the middle of its lintel.
    assert.equal(g.world.getBlockTypeAt(0, 4, -8), 'portal_letter_n');
    assert.ok(g.game.portalsRead({ x: 0, y: 4, z: -8 }));
    assert.match(g.said.at(-1), /^(This portal goes north: 1,000 blocks, to plaza N\.|Este portal va al norte: 1\.000 bloques, hasta la plaza N\.)$/);
    // The red one on the south side of N goes back to the centre.
    assert.match(run('portalsSignLine(portalsExitAt(0, -992))'), /south: 1,000 blocks, to the central plaza|sur: 1\.000 bloques, hasta la plaza central/);
    // A post: its legend, its letter.
    const opened = [];
    const open = g.game.portalsLegendOpen;
    g.game.portalsLegendOpen = (address) => opened.push(address);
    assert.ok(g.game.portalsRead({ x: 7, y: 1, z: 7 }), 'the star of the central plaza');
    assert.ok(g.game.portalsRead({ x: -7, y: 0, z: 7 }), 'its legend');
    assert.deepEqual(opened, ['', '']);
    const n = journeyWorld({ x: 0.5, z: -999.5, blocks: networkBlocks() });
    n.game.portalsLegendOpen = (address) => opened.push(address);
    assert.ok(n.game.portalsRead({ x: 7, y: 0, z: -993 }));
    assert.ok(n.game.portalsRead({ x: -7, y: 1, z: -1007 }), 'a letter of a post');
    // The rose where a traveller arrives, ten blocks from the posts, opens it too.
    assert.equal(n.world.getBlockTypeAt(0, -1, -1000), 'portal_compass');
    assert.ok(n.game.portalsRead({ x: 0, y: -1, z: -1000 }), 'the rose');
    assert.deepEqual(opened, ['', '', 'N', 'N', 'N']);
    // Not the floor, nor a pane, nor anything else.
    assert.ok(!g.game.portalsRead({ x: 1, y: -1, z: -1000 }));
    assert.ok(!g.game.portalsRead({ x: 0, y: 0, z: -8 }));
    assert.ok(!g.game.portalsRead({ x: 30, y: -1, z: 30 }));
    // The panel opens and closes (its markup is a stand-in here).
    g.game.portalsLegendOpen = open;
    Object.assign(g.game, { renderer: { domElement: {} }, updatePointerLockHint() {}, recapturePointerLock() {} });
    g.game.portalsLegendOpen('N');
    assert.equal(g.game.portalsLegendAt, 'N');
    g.game.portalsLegendClose();
    assert.ok(g.game.portalsLegendAt === null);
});

test('the legend says where you are, how the portals go, the way back, the posts, the rose and the guide', () => {
    const lines = plain("portalsLegendLines('NE')");
    assert.equal(lines.length, 7);
    assert.match(lines[0], /NE: 10[.,]000 (east|al este), 1[.,]000 (north|al norte)/);
    assert.match(lines[3], /(orange|naranja).*(plaza N|la plaza N)\.$/);
    assert.match(lines[4], /NE/);
    assert.match(lines[6], /306/);
    const centre = plain("portalsLegendLines('')");
    assert.match(centre[0], /0, 0/);
    assert.notEqual(centre[3], lines[3]);
    for (const [key, line] of Object.entries(plain('PORTALS_TEXT'))) assert.ok(line.ES && line.EN, key);
});

test('a new player appears in the central plaza', () => {
    // Where the game puts the camera before anything is known of the player, and where /spawn and dying
    // send one with no bed and no last place.
    const game = fs.readFileSync(path.join(JS, 'game.js'), 'utf8');
    const [, sx, sy, sz] = game.match(/this\.camera\.position\.set\((-?\d+), (-?\d+), (-?\d+)\)/).map(Number);
    assert.equal(run(`portalsPlazaAt(${Math.floor(sx)}, ${Math.floor(sz)})`), '');
    const survival = fs.readFileSync(path.join(JS, 'game', 'survival.js'), 'utf8');
    for (const [, x, z] of survival.matchAll(/\{ x: (-?\d+), y: \d+, z: (-?\d+), yaw: 0, pitch: 0 \}/g)) {
        assert.equal(run(`portalsPlazaAt(${x}, ${z})`), '');
    }
    // Above the central plaza's floor, which the server puts at y = 10 (TestPortalsPlazasRestOnTheGround).
    assert.ok(sy > 12, `the camera starts at y = ${sy}`);
    // And lands on its rose: the camera's own settling, from there.
    const g = makeFlatWorld(ctx, { x: 0.5, z: 0.5, blocks: networkBlocks() });
    g.cameraController.setPosition({ x: sx, y: 20, z: sz, yaw: 0, pitch: 0 });
    for (let i = 0; i < 300 && g.cameraController.spawnSettling; i++) g.cameraController.updatePhysics(1 / 30);
    assert.equal(g.cameraController.spawnSettling, false);
    assert.ok(Math.abs(g.camera.position.y - EYE) < 1e-6, `feet at ${g.camera.position.y - EYE}`);
    assert.equal(g.world.getBlockTypeAt(Math.floor(g.camera.position.x), -1, Math.floor(g.camera.position.z)), 'portal_compass');
});

test('"/build portals" asks the server, only in creative mode, and says what it did', () => {
    const g = makeFlatWorld(ctx);
    const sent = [];
    g.game.network = { connected: true, send: (type, payload) => sent.push([type, payload]) };
    g.game.creativeMode = false;
    g.game.constructionCommand('build', ['portals']);
    assert.equal(sent.length, 0);
    assert.match(g.said.at(-1), /Unknown command/);
    g.game.creativeMode = true;
    g.game.constructionCommand('build', ['portals']);
    assert.deepEqual(sent.map(([type]) => type), ['portalsBuild']);
    g.game.portalsOnBuilt({ plazas: 45, portals: 44, back: 43, levels: 3, changed: 8000 });
    assert.match(g.said.at(-1), /45 plaza/);
    assert.match(g.said.at(-1), /44 portal/);
    assert.match(g.said.at(-1), /43 (back|de vuelta)/);
    g.game.portalsOnBuilt({ error: 'busy' });
    assert.ok(g.said.at(-1).length > 0);
});

test('what a build changed is drawn where the chunks are, and nothing is kept for the rest of the world', () => {
    const g = makeFlatWorld(ctx);
    const world = g.world;
    g.game.portalsApplyCells([[2, -1, 2, 'portal_plaza'], [2, 0, 3, 'portal_red'], [1, -1, 1, ''], [500000, 10, 500000, 'portal_plaza'], ['x', 1, 1, 'stone'], [1, 2]]);
    assert.equal(world.getBlockTypeAt(2, -1, 2), 'portal_plaza');
    assert.equal(world.getBlockTypeAt(2, 0, 3), 'portal_red');
    assert.ok(!world.hasSolidBlock(1, -1, 1), 'air where the server said ""');
    assert.ok(!world.edits.has(world.chunkKey(Math.floor(500000 / 16), Math.floor(500000 / 16))), 'no edit kept for a chunk far away');
});

// ---- Plots keep away from the plazas (pkg/network/claims.go) ----

test('a marker near a plaza is refused here as the server refuses it, with the cases of the Go test', () => {
    const claimsGo = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'claims.go'), 'utf8');
    const claimsGoTest = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'claims_test.go'), 'utf8');
    const plazaGap = Number(/\bclaimPlazaGap\s*=\s*(\d+)/.exec(claimsGo)[1]);
    assert.equal(plazaGap, 5);
    const g = makeFlatWorld(ctx);
    g.game.claimReceiveList({ claims: [], spawn: { minX: -16, minZ: -16, maxX: 15, maxZ: 15 }, radius: 8, gap: 8, plazaGap });
    const refusals = [...claimsGoTest.matchAll(/refused\("([^"]+)", claimPlace\(t, "\w+", (-?\d+), (-?\d+)\), claimReason(\w+), "(\w*)", (\d+)\)/g)];
    const accepted = [...claimsGoTest.matchAll(/claimPlace\(t, "\w+", (-?\d+), (-?\d+)\); r != nil/g)];
    assert.ok(refusals.length >= 7 && accepted.length >= 3, `${refusals.length} refusals and ${accepted.length} places read from claims_test.go`);
    ctx.__plazaGame = g.game;
    for (const [, what, x, z, reason, plaza, distance] of refusals) {
        const got = plain(`__plazaGame.claimMarkerRefusal(${x}, ${z})`);
        const want = reason[0].toLowerCase() + reason.slice(1);
        assert.ok(got, `${what}: refused`);
        assert.equal(got.reason, want, what);
        if (want.endsWith('Plaza')) assert.equal(got.plaza, plaza, `${what}: the plaza`);
        if (want.startsWith('tooClose')) assert.equal(got.distance, Number(distance), `${what}: free columns`);
        if (want === 'tooClosePlaza') assert.equal(got.gap, plazaGap, `${what}: gap`);
    }
    for (const [, x, z] of accepted) {
        assert.ok(run(`__plazaGame.claimMarkerRefusal(${x}, ${z}) === null`), `(${x}, ${z}) goes to the server`);
    }
    // A plaza of the fourth level, nothing built there, and every plaza a footprint of 31 x 31.
    const nene = plain('portalsPosition("NENE")');
    const far = plain(`__plazaGame.claimMarkerRefusal(${nene.x + 15 + 1 + 8 + 2}, ${nene.z})`);
    assert.equal(far.reason, 'tooClosePlaza');
    assert.equal(far.plaza, 'NENE');
    assert.equal(far.distance, 2);
    // Without the gap from the server (it sends none with no spawn zone) the plazas are not checked here.
    g.game.claimReceiveList({ claims: [], radius: 8, gap: 8 });
    assert.ok(run('__plazaGame.claimMarkerRefusal(0, -1000) === null'));
    delete ctx.__plazaGame;
});

test('a build refused for plots on plazas says so in the chat, whose plot and where, in both languages', () => {
    const g = makeFlatWorld(ctx);
    const lang = run('gameLang()');
    const payload = { error: 'plots', count: 13, plots: [{ plaza: 'N', owner: 'Ana', x: 20, y: 70, z: -995 }, { plaza: '', owner: '', x: 1, y: 2, z: 3 }] };
    try {
        run('setGameLang("ES")');
        g.said.length = 0;
        g.game.portalsOnBuilt(payload);
        assert.deepEqual([...g.said], [
            'Red de portales: no se ha construido nada, porque hay parcelas sobre plazas de la red.',
            'Ana tiene una parcela sobre la plaza N, con el mojón en 20, 70, -995.',
            'Alguien sin nombre tiene una parcela sobre la plaza central, con el mojón en 1, 2, 3.',
            'Parcelas que no caben en esta lista: 11.',
            'Cada una tiene que desaparecer antes de volver a intentarlo: que su dueño rompa el mojón, o quítala con /plots y /plot remove.'
        ]);
        run('setGameLang("EN")');
        g.said.length = 0;
        g.game.portalsOnBuilt({ ...payload, count: 2 });
        assert.deepEqual([...g.said], [
            'Portal network: nothing was built, because there are plots on plazas of the network.',
            'Ana has a plot on plaza N, with its marker at 20, 70, -995.',
            'Somebody with no name has a plot on the central plaza, with its marker at 1, 2, 3.',
            'Each one has to go before trying again: its owner breaks the marker, or remove it with /plots and /plot remove.'
        ]);
    } finally {
        run(`setGameLang(${JSON.stringify(lang)})`);
    }
    // The server sends what the client reads.
    assert.match(go, /"error": "plots", "plots": blockers, "count": count/);
    assert.match(go, /Plaza string `json:"plaza"`/);
});
