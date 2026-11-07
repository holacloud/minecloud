// Node tests for what goes on a slide and in the light of the microscope: stains, colour filters and
// dark-field (js/game/microbes.js, js/game/microscope.js). The server's side is in
// pkg/network/microscope_stain_test.go. Nothing here runs a browser.
// Run with: node --test test/js/microscope_stains.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const JS = path.join(STATIC, 'js');
const plain = (value) => JSON.parse(JSON.stringify(value));
const IODINE = 'iodine_tincture';
const BLUE = 'methylene_blue';

function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}

// A 2D context that remembers what was asked of it, and what was set on it.
function recordingContext() {
    const calls = [];
    const target = {
        calls, globalAlpha: 1,
        createLinearGradient: () => ({ addColorStop(_at, color) { calls.push(['stop', color]); } }),
        createRadialGradient: () => ({ addColorStop(_at, color) { calls.push(['stop', color]); } })
    };
    return new Proxy(target, {
        get: (known, key) => (key in known ? known[key] : (...args) => { calls.push([key, ...args]); }),
        set: (known, key, value) => { known[key] = value; calls.push(['set', key, value]); return true; }
    });
}
const painted = (canvas, name) => canvas.calls.filter((call) => call[0] === 'set' && call[1] === name).map((call) => call[2]);
const opCount = (canvas) => canvas.calls.filter((call) => call[0] !== 'set').length;

function balanced(canvas) {
    const count = (name) => canvas.calls.filter(([key]) => key === name).length;
    assert.equal(count('save'), count('restore'));
}

function loadModules() {
    const context = vm.createContext({
        console, Math, performance: { now: () => 0 }, window: { localStorage: { getItem: () => null, setItem() {} } },
        THREE: anyStub(), document: anyStub(), navigator: {}
    });
    context.window.addEventListener = () => {};
    vm.runInContext('class Game {}; function resourcesDrawSprite() { return () => {}; } function resourcesDisplayMesh() { return null; }', context);
    for (const file of ['extensions.js', 'gameLang.js', 'chunkStore.js', 'blockShapes.js', 'mobSpecies.js']) vm.runInContext(fs.readFileSync(path.join(JS, file), 'utf8'), context);
    for (const file of ['bestiary_text.js', 'bestiary.js', 'furniture.js', 'storage.js', 'appliances.js', 'microbes.js', 'microscope_text.js', 'microscope.js']) {
        vm.runInContext(fs.readFileSync(path.join(JS, 'game', file), 'utf8'), context, { filename: file });
    }
    vm.runInContext(`Object.assign(this, { MICRO_SPECIES, MICRO_STAINS, MICRO_SCENERY_STAINS, MICRO_LENS, MicroLens, ITEM_TYPES, GAME_CONTENT_HOOKS, ITEM_USE_HANDLERS, MICROSCOPE_KIT, MICROSCOPE_STAIN_PAGE, MICROSCOPE_LENS_PAGE,
        microParseColor, microStainedColor, microDarkColor, microLens, microPopulate, microScenery, microStep, microUnfold, microDrawOrganism, microDrawPortrait, microDrawSceneryItem,
        microscopeSettle, microscopeRequestItems, microscopeLightFrom, microscopeFilterColor, microscopeFieldTint, microscopeDarkfieldGain, microscopeDarkfieldLine, microscopeDyeContrast, microscopeFilterLine,
        microscopeStainWarning, microscopeRefusalLine, microscopeSlideLine, microscopeDrawField, microscopeScale, Game });`, context);
    return context;
}

const ctx = loadModules();
const SPECIES = Object.keys(ctx.MICRO_SPECIES);
const source = (file) => fs.readFileSync(path.join(JS, 'game', file), 'utf8');

// ---- The tables ----

test('the stains match the server', () => {
    const go = fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'microscope.go'), 'utf8');
    const line = /var microscopeStains = map\[string\]bool\{([^}]*)\}/.exec(go);
    const read = [...line[1].matchAll(/"(\w+)"/g)].map((match) => match[1]);
    assert.deepEqual(read.sort(), Object.keys(ctx.MICRO_STAINS).sort());
    assert.match(fs.readFileSync(path.join(ROOT, 'pkg', 'network', 'websocket.go'), 'utf8'), /"microscopeStain":/);
});

test('every one of the 16 organisms says what each stain does to it', () => {
    assert.equal(SPECIES.length, 16);
    for (const id of SPECIES) {
        for (const stain of Object.keys(ctx.MICRO_STAINS)) {
            const entry = ctx.MICRO_SPECIES[id].stains[stain];
            assert.ok(entry, `${id} ${stain}`);
            assert.equal(entry.tint.length, 3);
            assert.ok(entry.amount > 0 && entry.amount <= 1, `${id} ${stain}`);
            assert.ok(entry.note.length > 20, `${id} ${stain}`);
        }
    }
});

test('the stains do what they really do, organism by organism', () => {
    const having = (stain, part) => SPECIES.filter((id) => ctx.MICRO_SPECIES[id].stains[stain][part]).sort();
    // Iodine: starch only where there is starch; glycogen is not starch.
    assert.deepEqual(having(IODINE, 'starch'), ['plant_cell', 'spirogyra']);
    assert.deepEqual(having(IODINE, 'granules'), ['animal_cell', 'cyanobacteria', 'yeast']);
    assert.deepEqual(having(IODINE, 'clear'), ['euglena'], 'paramylon does not stain');
    assert.ok(!ctx.MICRO_SPECIES.diatom.stains[IODINE].starch);
    assert.ok(!ctx.MICRO_SPECIES.euglena.stains[IODINE].starch);
    // Methylene blue: nuclei, where there are nuclei. Bacteria have none, and nothing here has starch.
    for (const id of ['animal_cell', 'plant_cell', 'spirogyra', 'paramecium', 'amoeba', 'vorticella', 'euglena', 'diatom', 'yeast']) assert.ok(ctx.MICRO_SPECIES[id].stains[BLUE].nucleus, id);
    for (const id of ['cyanobacteria', 'soil_bacteria', 'lactobacillus']) {
        assert.ok(!ctx.MICRO_SPECIES[id].stains[BLUE].nucleus, id);
        assert.ok(ctx.MICRO_SPECIES[id].stains[BLUE].amount >= 0.7, `${id} is blue all over`);
    }
    assert.ok(ctx.MICRO_SPECIES.yeast.stains[BLUE].amount >= 0.7);
    assert.deepEqual(having(BLUE, 'starch'), []);
    assert.deepEqual(having(BLUE, 'spore'), ['soil_bacteria']);
    // What it shows and what it says agree.
    assert.match(ctx.MICRO_SPECIES.spirogyra.stains[IODINE].note, /starch/);
    assert.match(ctx.MICRO_SPECIES.euglena.stains[IODINE].note, /not starch/);
    assert.match(ctx.MICRO_SPECIES.animal_cell.stains[BLUE].note, /dark blue nucleus/);
    // The colours: starch ink is blue-black, the nucleus dark blue, iodine brown.
    const starch = ctx.microParseColor(ctx.MICRO_SPECIES.spirogyra.stains[IODINE].starch);
    assert.ok(starch[2] > starch[0] && starch[0] + starch[1] + starch[2] < 150, 'blue-black');
    const nucleus = ctx.microParseColor(ctx.MICRO_SPECIES.animal_cell.stains[BLUE].nucleus);
    assert.ok(nucleus[2] > nucleus[0] * 2 && nucleus[0] < 60, 'dark blue');
    const brown = ctx.MICRO_SPECIES.yeast.stains[IODINE].tint;
    assert.ok(brown[0] > brown[1] && brown[1] > brown[2], 'yellow-brown');
});

test('on the slide: starch grains go blue-black with iodine only, and fat and minerals take nothing', () => {
    const { starch } = ctx.MICRO_SCENERY_STAINS;
    assert.ok(starch[IODINE].amount > 0.9);
    assert.ok(starch[BLUE].amount < 0.2);
    assert.ok(!ctx.MICRO_SCENERY_STAINS.fat);
    assert.ok(!ctx.MICRO_SCENERY_STAINS.grains);
    const draw = (stain) => {
        const canvas = recordingContext();
        ctx.microDrawSceneryItem(canvas, { kind: 'starch', rot: 0, size: 0.5, seed: 1 }, 10, 10, 1, { stain });
        return ctx.microParseColor(painted(canvas, 'fillStyle')[0]);
    };
    const [r, g, b] = draw(IODINE);
    assert.ok(b > r && r + g + b < 220, `iodine on starch: ${r},${g},${b}`);
    assert.ok(draw(BLUE)[0] > 180, 'methylene blue leaves it pale');
    assert.equal(plain(draw('')).join(), plain(ctx.microParseColor('rgba(238,232,206,0.72)')).join());
});

// ---- The lens ----

test('colours: parsed, dyed and put on black as they should', () => {
    assert.deepEqual(plain(ctx.microParseColor('rgba(10,20,30,0.5)')), [10, 20, 30, 0.5]);
    assert.deepEqual(plain(ctx.microParseColor('rgb(10,20,30)')), [10, 20, 30, 1]);
    assert.deepEqual(plain(ctx.microParseColor('#ffd9a0')), [255, 217, 160, 1]);
    assert.deepEqual(plain(ctx.microParseColor('#fff')), [255, 255, 255, 1]);
    assert.equal(ctx.microParseColor('not a colour'), null);
    // A dye keeps dark things darker than pale ones, and at amount 0 changes nothing.
    assert.deepEqual(plain(ctx.microStainedColor([10, 20, 30, 0.5], [200, 100, 50], 0)), [10, 20, 30, 0.5]);
    const pale = ctx.microStainedColor([240, 240, 240, 0.5], [100, 150, 220], 1);
    const dark = ctx.microStainedColor([40, 40, 40, 0.5], [100, 150, 220], 1);
    assert.ok(pale[2] > dark[2] && pale[2] > pale[0]);
    assert.ok(pale[3] > 0.5 && pale[3] <= 1);
    // On black, a dark edge comes out bright, and a clear fill faint.
    const edge = ctx.microDarkColor([90, 70, 40, 0.85], true);
    const fill = ctx.microDarkColor([230, 225, 190, 0.5], false);
    assert.ok(Math.min(edge[0], edge[1], edge[2]) > 150 && edge[3] > 0.9);
    assert.ok(fill[3] < 0.1);
    // Pigment glows more than a clear fill.
    assert.ok(ctx.microDarkColor([60, 150, 58, 0.5], false)[3] > fill[3] * 2);
});

test('the lens stands in for everything the drawings ask of a canvas', () => {
    const asked = new Set();
    for (const [, name] of source('microbes.js').matchAll(/\bctx\.([a-zA-Z]+)/g)) asked.add(name);
    const prototype = ctx.MicroLens.prototype;
    for (const name of asked) {
        if (['marking', 'globalCompositeOperation'].includes(name)) continue; // The second only on the real canvas, in a portrait.
        assert.ok(name in prototype, `MicroLens lacks ${name}`);
    }
    assert.ok(asked.size > 15);
});

test('the lens remembers its colours, and its limit does not break it', () => {
    const lens = new ctx.MicroLens();
    const canvas = recordingContext();
    const entry = { tint: [100, 150, 220], amount: 0.5 };
    lens.aim(canvas, entry, false, 0);
    lens.fillStyle = 'rgba(1,2,3,0.5)';
    const first = canvas.fillStyle;
    assert.notEqual(first, 'rgba(1,2,3,0.5)');
    lens.fillStyle = 'rgba(1,2,3,0.5)';
    assert.equal(canvas.fillStyle, first);
    for (let i = 0; i < 1500; i++) lens.strokeStyle = `rgba(${i % 255},2,3,0.5)`;
    assert.ok(lens.books.get(entry)[1].size <= 601);
    // A part marked by the stain is not tinted again; without dark-field it goes through as it is.
    lens.marking = true;
    lens.fillStyle = 'rgba(1,2,3,0.5)';
    assert.equal(canvas.fillStyle, 'rgba(1,2,3,0.5)');
    // Dark-field keeps its thinnest line, and leaves the plain view's alone.
    lens.aim(canvas, null, true, 2);
    lens.lineWidth = 0.5;
    assert.equal(canvas.lineWidth, 2);
    lens.aim(canvas, null, false, 2);
    lens.lineWidth = 0.5;
    assert.equal(canvas.lineWidth, 0.5);
});

test('every organism draws stained and on black, in any state, and its numbers stay real', () => {
    const states = [{}, { fate: 'dead' }, { fate: 'cyst' }, { seed: 999, variant: 3 }, { unfold: 0 }, { unfold: 0.4, gut: 1 }, { spring: 1 }];
    for (const id of SPECIES) {
        for (const look of [{ stain: IODINE }, { stain: BLUE }, { dark: true }, { stain: IODINE, dark: true }, { stain: BLUE, dark: true }]) {
            for (const st of states) {
                for (const px of [1, 30, 400]) {
                    const canvas = recordingContext();
                    ctx.microDrawOrganism(canvas, id, 50, 50, px, 0.7, 3.2, { ...st, ...look });
                    balanced(canvas);
                    for (const [name, ...args] of canvas.calls) {
                        for (const arg of args) {
                            if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${id} ${name} ${JSON.stringify({ ...st, ...look })}`);
                        }
                    }
                }
            }
        }
        // The portrait too, for the panel.
        for (const st of [{ stain: IODINE }, { stain: BLUE }, { dark: true }]) {
            const canvas = recordingContext();
            ctx.microDrawPortrait(canvas, id, 84, 84, 1.3, st);
            balanced(canvas);
        }
    }
});

test('with no stain and no dark-field, drawings are exactly what they were', () => {
    const canvas = recordingContext();
    ctx.microDrawOrganism(canvas, 'spirogyra', 50, 50, 200, 0, 1, { still: true });
    const fills = painted(canvas, 'fillStyle');
    assert.ok(fills.includes('rgba(218,248,196,0.92)'), 'the pale pyrenoids');
    for (const id of SPECIES) {
        const plainCanvas = recordingContext();
        ctx.microDrawOrganism(plainCanvas, id, 50, 50, 200, 0, 1, { still: true, seed: 3, variant: 3 });
        assert.ok(!painted(plainCanvas, 'marking').length, `${id} touches nothing of the lens`);
    }
});

test('what a stain reveals is really drawn, and what it should not show is not', () => {
    const fills = (id, stain, st = {}) => {
        const canvas = recordingContext();
        ctx.microDrawOrganism(canvas, id, 50, 50, 300, 0, 1, { seed: 3, variant: 3, stain, ...st });
        return [...painted(canvas, 'fillStyle'), ...painted(canvas, 'strokeStyle')];
    };
    const mark = (id, stain, part) => ctx.MICRO_SPECIES[id].stains[stain][part];
    for (const id of SPECIES) {
        for (const stain of Object.keys(ctx.MICRO_STAINS)) {
            const entry = ctx.MICRO_SPECIES[id].stains[stain];
            const shown = fills(id, stain);
            for (const part of ['nucleus', 'nucleolus', 'starch', 'granules', 'clear', 'spore', 'cilia', 'flagellum', 'strands']) {
                if (entry[part]) assert.ok(shown.includes(entry[part]), `${id} ${stain} does not draw its ${part}`);
            }
        }
    }
    // Only the spirogyra's stained pyrenoids replace the pale ones.
    assert.ok(!fills('spirogyra', IODINE).includes('rgba(218,248,196,0.92)'));
    assert.ok(fills('spirogyra', BLUE).length > 0 && !fills('spirogyra', BLUE).includes(mark('spirogyra', IODINE, 'starch')));
    // A rod's whip is not seen on a stained slide. Its path has a point at x = 92.
    const rod = (stain) => {
        const canvas = recordingContext();
        ctx.microDrawOrganism(canvas, 'soil_bacteria', 50, 50, 300, 0, 1, { seed: 3, variant: 1, stain });
        return canvas.calls.filter(([name, x]) => name === 'lineTo' && x > 80).length;
    };
    assert.equal(rod(''), 1);
    assert.equal(rod(BLUE), 0);
    // Only some rods hold a spore.
    assert.ok(fills('soil_bacteria', BLUE, { variant: 3 }).includes(mark('soil_bacteria', BLUE, 'spore')));
    assert.ok(!fills('soil_bacteria', BLUE, { variant: 1 }).includes(mark('soil_bacteria', BLUE, 'spore')));
    // A stained dead thing is not washed out, an unstained one is.
    const faded = (st) => {
        const canvas = recordingContext();
        ctx.microDrawOrganism(canvas, 'animal_cell', 50, 50, 300, 0, 1, { fate: 'dead', ...st });
        return painted(canvas, 'globalAlpha').some((value) => value < 1);
    };
    assert.equal(faded({}), true);
    assert.equal(faded({ stain: BLUE }), false);
});

test('on black, what is too small to draw is a bright point', () => {
    const canvas = recordingContext();
    ctx.microDrawOrganism(canvas, 'soil_bacteria', 50, 50, 1, 0, 1, { dark: true });
    const [r, g, b] = ctx.microParseColor(painted(canvas, 'fillStyle').pop());
    assert.ok(Math.min(r, g, b) > 200);
    const plainCanvas = recordingContext();
    ctx.microDrawOrganism(plainCanvas, 'soil_bacteria', 50, 50, 1, 0, 1, {});
    assert.equal(painted(plainCanvas, 'fillStyle').pop(), ctx.MICRO_SPECIES.soil_bacteria.dot);
});

// ---- A fixed slide ----

test('a stained slide: nothing moves, and it stays as the stain found it', () => {
    const organisms = ctx.microPopulate('sample_forest_lake_c', 7, 0);
    const moss = ctx.microPopulate('sample_moss_a', 7, 2);
    const all = [...organisms, ...moss];
    const before = plain(all.map(({ x, y, rot, phase }) => ({ x, y, rot, phase })));
    const world = { age: 30, woke: -1, revived: false, organisms: all, stain: IODINE };
    for (let i = 0; i < 100; i++) for (const org of all) ctx.microStep(org, 0.1, world);
    assert.deepEqual(plain(all.map(({ x, y, rot, phase }) => ({ x, y, rot, phase }))), before);
    const tardigrade = moss.find((org) => org.species === 'tardigrade');
    assert.equal(tardigrade.action, 'fixed');
    assert.equal(tardigrade.unfold, 1);
    assert.equal(tardigrade.stylet, 0);
    assert.equal(organisms.find((org) => org.species === 'vorticella').spring, 1, 'its stalk stays coiled');
    // Stained dry, it stays a tun.
    ctx.microStep(tardigrade, 0.1, { age: 300, woke: -1, organisms: all, stain: BLUE });
    assert.equal(tardigrade.action, 'tun');
    assert.equal(tardigrade.unfold, 0);
    // Without a stain they go on as before.
    const free = ctx.microPopulate('sample_plains_lake_a', 7, 0);
    const start = free[0].x;
    for (let i = 0; i < 20; i++) for (const org of free) ctx.microStep(org, 0.1, { age: 1, woke: -1, organisms: free });
    assert.notEqual(free[0].x, start);
});

test('what a stain costs is said in words, before and after', () => {
    for (const stain of Object.keys(ctx.MICRO_STAINS)) {
        const warning = ctx.microscopeStainWarning(stain);
        assert.match(warning, /stops moving/);
        assert.match(warning, /drawn off/);
        assert.match(warning, /tardigrade/);
        assert.match(warning, /come back with a drop/);
    }
    assert.match(ctx.microscopeSlideLine({ stain: BLUE }, 30), /Methylene Blue.*fixed/);
    assert.match(ctx.microscopeRefusalLine('capture', 'stained'), /dead/);
    assert.match(ctx.microscopeRefusalLine('stain', 'stained'), /one to a slide/);
    assert.match(ctx.microscopeRefusalLine('stain', 'gone'), /no longer on the stage/);
});

test('a stain request: the bottle goes, its glass comes back, and a refusal returns the bottle', () => {
    const pending = ctx.microscopeRequestItems('stain', IODINE);
    assert.deepEqual(plain(pending), { took: { iodine_tincture: 1 }, gives: { glass: 1 } });
    assert.deepEqual(plain(ctx.microscopeSettle(pending, { amount: 1, type: IODINE })), { glass: 1 });
    assert.deepEqual(plain(ctx.microscopeSettle(pending, { amount: 0, reason: 'stained' })), { iodine_tincture: 1 });
});

// ---- Filters ----

const decorGlass = () => {
    const text = source('decor.js');
    const table = text.slice(text.indexOf('const DECOR_GLASS'), text.indexOf('];', text.indexOf('const DECOR_GLASS')));
    return [...table.matchAll(/\['([a-z_]+)', 0x([0-9a-f]{6})/g)].map(([, name, hex]) => [name, parseInt(hex, 16)]);
};

test('which glass is a filter', () => {
    const glass = decorGlass();
    assert.equal(glass.length, 16);
    assert.match(source('decor.js'), /_stained_glass`, \{\n\s+color: filter, name: `\$\{label\} Stained Glass`, transparent: true, filterGlass: true/);
    assert.match(source('decor.js'), /_stained_glass_pane`, \{\n\s+color: filter, .*filterGlass: true/);
    assert.match(source('chemistry.js'), /registerBlockType\('cobalt_glass', \{\n\s+color: 0x2a4fd0/);
    const blocks = { cobalt_glass: { color: 0x2a4fd0 }, glass: { color: 0xcccccc }, glass_pane: { color: 0xcccccc }, stone: { color: 0x808080 }, weird: { filterGlass: true } };
    for (const [name, color] of glass) {
        blocks[`${name}_stained_glass`] = { color, filterGlass: true };
        blocks[`${name}_stained_glass_pane`] = { color, filterGlass: true };
    }
    assert.deepEqual(plain(ctx.microscopeFilterColor('cobalt_glass', blocks)), [0x2a, 0x4f, 0xd0]);
    assert.deepEqual(plain(ctx.microscopeFilterColor('red_stained_glass', blocks)), [0xf2, 0x52, 0x44]);
    assert.deepEqual(plain(ctx.microscopeFilterColor('red_stained_glass_pane', blocks)), [0xf2, 0x52, 0x44]);
    for (const [name] of glass) assert.ok(ctx.microscopeFilterColor(`${name}_stained_glass`, blocks), name);
    for (const type of ['glass', 'glass_pane', 'stone', 'weird', 'nothing']) assert.equal(ctx.microscopeFilterColor(type, blocks), null, type);
});

test('a filter multiplies the colour of the light, sun or lamp', () => {
    assert.equal(ctx.microscopeFieldTint('sun', null), null);
    assert.equal(ctx.microscopeFieldTint(null, null), null);
    assert.deepEqual(plain(ctx.microscopeFieldTint('lamp', null)), [255, 217, 160]);
    assert.deepEqual(plain(ctx.microscopeFieldTint('sun', [42, 79, 208])), [42, 79, 208]);
    assert.deepEqual(plain(ctx.microscopeFieldTint('lamp', [42, 79, 208])), [42, 67, 131]);
    // Through a white filter a lamp is a lamp; through a black one nothing passes.
    assert.deepEqual(plain(ctx.microscopeFieldTint('lamp', [255, 255, 255])), [255, 217, 160]);
    assert.deepEqual(plain(ctx.microscopeFieldTint('sun', [0, 0, 0])), [0, 0, 0]);
    // A pale blue glass brings a flame nearer to white: its red and blue end up closer.
    const lamp = ctx.microscopeFieldTint('lamp', null);
    const corrected = ctx.microscopeFieldTint('lamp', [0x86, 0xc8, 0xff]);
    assert.ok(Math.abs(corrected[0] - corrected[2]) < Math.abs(lamp[0] - lamp[2]));
});

test('a filter of the opposite colour makes a dye stand out, one of its own colour fades it', () => {
    const white = [255, 255, 255];
    const orange = [0xff, 0xa3, 0x4a];
    const blue = [0x52, 0x72, 0xff];
    const dye = (stain) => ctx.MICRO_STAINS[stain].dye;
    assert.ok(ctx.microscopeDyeContrast(dye(BLUE), orange) > ctx.microscopeDyeContrast(dye(BLUE), white));
    assert.ok(ctx.microscopeDyeContrast(dye(BLUE), blue) < ctx.microscopeDyeContrast(dye(BLUE), white));
    assert.ok(ctx.microscopeDyeContrast(dye(IODINE), blue) > ctx.microscopeDyeContrast(dye(IODINE), white));
    assert.equal(ctx.microscopeDyeContrast(dye(BLUE), [0, 0, 0]), 0);
    assert.match(ctx.microscopeFilterLine('Orange', orange, BLUE), /stands out more/);
    assert.match(ctx.microscopeFilterLine('Blue', blue, BLUE), /fades/);
    assert.match(ctx.microscopeFilterLine('Blue', blue, IODINE), /stands out more/);
    assert.match(ctx.microscopeFilterLine('Blue', blue, ''), /only its own colour/);
});

// ---- Dark-field ----

test('dark-field needs strong light: poor with a bulb, good with a lamp or the sun', () => {
    const level = (daylight, open, lamp) => ctx.microscopeLightFrom(daylight, open, lamp).level;
    const bulb = level(0, false, { level: 7, name: 'Light Bulb' });
    assert.equal(bulb, 0.7);
    const candle = level(0, false, { level: 9, name: 'Candle' });
    const tableLamp = level(0, false, { level: 12, name: 'Table Lamp' });
    const lamp = level(0, false, { level: 14, name: 'Electric Lamp' });
    const noon = level(1, true, null);
    const dawn = level(0.3, true, null);
    const gain = ctx.microscopeDarkfieldGain;
    assert.ok(gain(bulb) < 0.4, `bulb ${gain(bulb)}`);
    assert.ok(gain(dawn) < 0.4, `dawn ${gain(dawn)}`);
    assert.ok(gain(candle) > gain(bulb) && gain(candle) < 0.8, `candle ${gain(candle)}`);
    assert.ok(gain(tableLamp) >= 0.8, `table lamp ${gain(tableLamp)}`);
    assert.equal(gain(lamp), 1);
    assert.equal(gain(noon), 1);
    // A plain field with a bulb is far brighter than dark-field with the same bulb.
    assert.ok(bulb > gain(bulb) * 2);
    // In order, and nothing at all with no light.
    let last = 0;
    for (let l = 0.45; l <= 1; l += 0.01) {
        assert.ok(gain(l) >= last);
        last = gain(l);
    }
    assert.ok(gain(0.45) > 0, 'a faint image, not none');
    assert.equal(gain(0), 0);
    assert.equal(gain(undefined), 0);
    // And the panel says so.
    assert.match(ctx.microscopeDarkfieldLine({ source: 'lamp', level: bulb, name: 'Light Bulb' }), /very dim.*light bulb/);
    assert.match(ctx.microscopeDarkfieldLine({ source: 'lamp', level: candle, name: 'Candle' }), /faint.*candle/);
    assert.match(ctx.microscopeDarkfieldLine({ source: 'sun', level: noon, name: 'daylight' }), /bright edges.*daylight/);
    assert.match(ctx.microscopeDarkfieldLine({ source: null, level: 0, name: '' }), /no light/);
});

function fieldCanvases() {
    const buffer = (size) => {
        const canvas = recordingContext();
        return { ctx: canvas, canvas: { width: size, height: size } };
    };
    return [recordingContext(), buffer(174), buffer(87)];
}

function drawField(sourceId, view) {
    const [main, soft, softer] = fieldCanvases();
    const organisms = ctx.microPopulate(sourceId, 42, 2);
    const scenery = ctx.microScenery(sourceId, 42);
    const radius = 260;
    ctx.microscopeDrawField(main, soft, softer, {
        radius, power: 100, scale: ctx.microscopeScale(100, radius), stageX: 0, stageY: 0, focus: 0.5, light: { source: 'sun', level: 1, name: 'daylight' }, t: 3, age: 10, revived: false, selected: null, ...view
    }, organisms, scenery);
    return { main, soft, softer };
}

test('the field on dark-field: black, added up, dimmed by the gain, and with no ctx.filter anywhere', () => {
    const lit = drawField('sample_plains_lake_a', {});
    assert.ok(!painted(lit.main, 'globalCompositeOperation').includes('lighter'));
    const dark = drawField('sample_plains_lake_a', { dark: 1 });
    assert.ok(painted(dark.main, 'fillStyle').includes('#000'));
    assert.ok(painted(dark.main, 'globalCompositeOperation').includes('lighter'));
    assert.equal(painted(dark.main, 'globalCompositeOperation').pop(), 'source-over');
    assert.ok(!painted(dark.main, 'fillStyle').some((style) => /rgba\(0,0,0,0\.[1-9]/.test(style)), 'full gain, no veil');
    const dim = drawField('sample_plains_lake_a', { dark: 0.3 });
    assert.ok(painted(dim.main, 'fillStyle').includes('rgba(0,0,0,0.7)'));
    // The ruler can be read on black.
    assert.ok(painted(dark.main, 'fillStyle').includes('rgba(226,230,236,0.8)'));
    for (const canvas of [dark.main, dark.soft.ctx, dark.softer.ctx, lit.main]) assert.deepEqual(painted(canvas, 'filter'), []);
    assert.ok(!/\.filter\s*=/.test(source('microscope.js')), 'blur stays what it was: small layers stretched');
    assert.ok(!/ctx\.filter/.test(source('microbes.js')));
});

test('the field: one multiply for lamp and filter together', () => {
    const multiplied = (view) => {
        const { main } = drawField('dirt', view);
        const out = [];
        main.calls.forEach((call, i) => {
            if (call[0] === 'set' && call[1] === 'globalCompositeOperation' && call[2] === 'multiply') out.push(main.calls[i + 1][2]);
        });
        return out;
    };
    assert.deepEqual(multiplied({}), []);
    assert.deepEqual(multiplied({ light: { source: 'lamp', level: 0.9, name: 'x' } }), ['rgb(255,217,160)']);
    assert.deepEqual(multiplied({ tint: [42, 79, 208] }), ['rgb(42,79,208)']);
    assert.deepEqual(multiplied({ light: { source: 'lamp', level: 0.9, name: 'x' }, tint: [42, 67, 131] }), ['rgb(42,67,131)']);
});

test('the field: a stained slide is the same frame whatever the clock says', () => {
    const frame = (t, stain) => {
        const { main } = drawField('sample_plains_lake_a', { t, stain });
        return JSON.stringify(main.calls);
    };
    assert.equal(frame(1, BLUE), frame(9, BLUE));
    assert.notEqual(frame(1, ''), frame(9, ''));
});

// Cost in the drawing: a stained or dark frame asks the canvas for about what a plain one does. The time
// it takes in JS is measured apart; this keeps the number of calls from creeping up.
test('stains and dark-field add next to nothing to what a frame asks of the canvas', () => {
    for (const sourceId of ['sample_plains_lake_a', 'sample_forest_lake_b', 'dirt', 'wheat', 'cheek']) {
        const total = (view) => {
            const { main, soft, softer } = drawField(sourceId, view);
            return opCount(main) + opCount(soft.ctx) + opCount(softer.ctx);
        };
        const base = total({});
        assert.ok(total({ dark: 1 }) <= base * 1.05, `${sourceId} dark`);
        for (const stain of [IODINE, BLUE]) assert.ok(total({ stain, dark: 0 }) <= base * 2, `${sourceId} ${stain}`);
    }
});

// ---- Items ----

test('the new items, their recipes, the inventory and the kit', () => {
    const recipes = {};
    const items = new Set();
    for (const hook of ctx.GAME_CONTENT_HOOKS) {
        hook.call(new Proxy({}, { get: () => () => {}, set: () => true }), {
            addItem: (type) => items.add(type),
            addRecipe: (id, name, output, amount, inputs) => { recipes[id] = { output, amount, inputs: Object.fromEntries(plain(inputs).map(({ type, amount: count }) => [type, count])) }; }
        });
    }
    assert.deepEqual(plain(recipes.methylene_blue), { output: BLUE, amount: 1, inputs: { coal_ore: 1, element_s: 1, water_flask: 1 } });
    assert.deepEqual(plain(recipes.darkfield_stop), { output: 'darkfield_stop', amount: 1, inputs: { glass_slide: 1, coal_ore: 1 } });
    for (const id of [BLUE, 'darkfield_stop']) {
        assert.ok(items.has(id), id);
        assert.ok(ctx.ITEM_TYPES[id], id);
    }
    assert.equal(ctx.ITEM_TYPES.methylene_blue.name, 'Methylene Blue');
    assert.equal(ctx.ITEM_TYPES.darkfield_stop.name, 'Dark-field Stop');
    assert.ok(!ctx.ITEM_TYPES.methylene_blue.consume, 'not a drink');
    const kit = new Map(ctx.MICROSCOPE_KIT);
    for (const id of [IODINE, BLUE, 'darkfield_stop', 'cobalt_glass', 'red_stained_glass', 'orange_stained_glass', 'green_stained_glass', 'light_blue_stained_glass', 'wheat']) assert.ok(kit.get(id) > 0, id);
    const glass = new Set(decorGlass().map(([name]) => name));
    for (const id of kit.keys()) {
        if (id.endsWith('_stained_glass')) assert.ok(glass.has(id.replace('_stained_glass', '')), id);
    }
    // The bottle the iodine comes in is still the lab's: its recipe is where it was.
    assert.match(source('chemistry.js'), /type: 'iodine_tincture', amount: 1/);
});

// ---- The panel ----

function fakeElement() {
    const listeners = {};
    const found = new Map();
    const element = {
        style: {}, dataset: {}, width: 520, height: 520, value: '50', textContent: '', innerHTML: '', title: '', disabled: false, children: [],
        classes: new Set(),
        classList: {
            add: (...names) => names.forEach((name) => element.classes.add(name)),
            remove: (...names) => names.forEach((name) => element.classes.delete(name)),
            toggle: (name, on) => (on ? element.classes.add(name) : element.classes.delete(name))
        },
        appendChild(child) { element.children.push(child); return child; },
        addEventListener(type, listener) { (listeners[type] = listeners[type] || []).push(listener); },
        fire(type, event = {}) { for (const listener of listeners[type] || []) listener({ preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...event }); },
        querySelector(selector) {
            if (!found.has(selector)) found.set(selector, fakeElement());
            return found.get(selector);
        },
        querySelectorAll() { return []; },
        getContext() { return element.context || (element.context = recordingContext()); },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 520, height: 520 }),
        setPointerCapture() {}
    };
    return element;
}

function panelGame(carried = {}) {
    ctx.document = {
        pointerLockElement: null, head: fakeElement(), body: fakeElement(), exitPointerLock() {},
        createElement: () => fakeElement(), addEventListener() {}
    };
    const blocks = new Map([['0,1,0', 'microscope:e']]);
    const game = Object.create(ctx.Game.prototype);
    const counts = { test_tube: 3, glass_slide: 2, micropipette: 1, water_flask: 1, glass: 0, [IODINE]: 2, [BLUE]: 1, ...carried };
    const network = {
        connected: true, sent: [], handlers: {},
        on(type, listener) { (this.handlers[type] = this.handlers[type] || []).push(listener); },
        send(type, payload) { this.sent.push([type, plain(payload)]); },
        last() { return this.sent[this.sent.length - 1]; },
        deliver(type, payload) { for (const listener of this.handlers[type] || []) listener(payload); }
    };
    Object.assign(game, {
        network, daylight: 1, inventory: Object.keys(counts), inventoryCounts: counts, said: [],
        cameraController: { isCrouching: false, camera: { position: { x: 1, y: 2, z: 1 } } },
        renderer: { domElement: {} },
        world: {
            blockTypes: {
                'microscope:e': { variantOf: 'microscope' }, glass: {}, test_tube: {}, glass_slide: {}, water_flask: {}, [IODINE]: {}, [BLUE]: {}, darkfield_stop: {}, tardigrade_tube: {},
                cobalt_glass: { color: 0x2a4fd0 }, red_stained_glass: { color: 0xf25244, filterGlass: true }, red_stained_glass_pane: { color: 0xf25244, filterGlass: true }
            },
            registry: { solid: [0, 1], transparent: [0, 0], lightLevel: { 7: 9 }, id: () => 7 },
            getBlockTypeAt: (x, y, z) => blocks.get(`${x},${y},${z}`) || null,
            getBlockId: () => 0,
            isLightEmitterType: () => false,
            getBlockPositionFromIntersection: () => ({ x: 0, y: 1, z: 0 }),
            getInventoryIconUrl: () => 'icon.png'
        },
        getInventoryCount: (type) => counts[type] || 0,
        addInventory(type, amount = 1) { counts[type] = (counts[type] || 0) + amount; },
        getBlockDisplayName: (type) => type,
        receiveSystemMessage: (message) => game.said.push(message.text),
        updateHotbarCounts() {}, refreshHeldItemMesh() {}, renderCraftingPanel() {}, renderInventoryPanel() {}, saveInventoryState() {},
        playTone() {}, playPickupSound() {}, playPlaceSound() {}, showHitIndicator() {}, stopMining() {}, recapturePointerLock() {}, updatePointerLockHint() {},
        isGameplayActive: () => true, carriedLampNear: () => null
    });
    ctx.window.devicePixelRatio = 1;
    game.microscopeIdentified = () => {};
    game.microscopeLoadPending();
    game.microscopeUpdate(0.016);
    ctx.ITEM_USE_HANDLERS[0].call(game, null, {});
    slide(game, { source: 'cheek' });
    return game;
}

function slide(game, prep) {
    game.network.deliver('storageContents', {
        x: 0, y: 1, z: 0, capacity: 1, slots: prep ? [{ type: 'glass_slide', count: 1 }] : [{}], rev: (game.microscopeRev || 0) + 1,
        ...(prep ? { microscope: { seed: 42, age: 1, woke: -1, tardigrades: 1, ...prep } } : {})
    });
}
const answer = (game, reqId, outcome) => game.network.deliver('storageResult', { reqId, ...outcome });

test('the panel: it asks first and says why, and only then spends the bottle', () => {
    const game = panelGame();
    const panel = game.microscopePanel;
    slide(game, { source: 'sample_moss_a' });
    assert.notEqual(panel.querySelector('.micro-stain').style.display, 'none');
    assert.ok(!panel.querySelector('#micro-pop-stain').classes.has('visible'), 'closed until asked for');
    panel.querySelector('.micro-stain').fire('click');
    assert.ok(panel.querySelector('#micro-pop-stain').classes.has('visible'));
    assert.equal(panel.querySelector('#micro-stain-confirm').style.display, 'none');
    assert.match(panel.querySelector('.micro-stain-methylene_blue').querySelector('.micro-choice-name').textContent, /Methylene Blue \(1\)/);

    panel.querySelector(`.micro-stain-${BLUE}`).fire('click');
    assert.equal(game.getInventoryCount(BLUE), 1, 'asking costs nothing');
    assert.ok(!game.network.sent.some(([type]) => type === 'microscopeStain'));
    assert.equal(panel.querySelector('#micro-stain-confirm').style.display, '');
    const warn = panel.querySelector('#micro-stain-warn').textContent;
    assert.match(warn, /Nuclei/);
    assert.match(warn, /will not come back with a drop/);

    // It can be taken back.
    panel.querySelector('.micro-stain-no').fire('click');
    assert.equal(game.microscopeStainAsked, null);
    assert.equal(game.getInventoryCount(BLUE), 1);
    assert.ok(panel.querySelector('#micro-pop-stain').classes.has('visible'), 'the choice is still there');

    panel.querySelector(`.micro-stain-${BLUE}`).fire('click');
    panel.querySelector('.micro-stain-yes').fire('click');
    assert.ok(!panel.querySelector('#micro-pop-stain').classes.has('visible'));
    assert.equal(game.getInventoryCount(BLUE), 0);
    const [type, payload] = game.network.last();
    assert.equal(type, 'microscopeStain');
    assert.equal(payload.source, BLUE);
    assert.deepEqual([payload.x, payload.y, payload.z], [0, 1, 0]);
    assert.equal(game.getInventoryCount('glass'), 0);
    answer(game, payload.reqId, { amount: 1, type: BLUE });
    assert.equal(game.getInventoryCount('glass'), 1, 'the glass comes back');
    assert.equal(game.getInventoryCount(BLUE), 0);
});

test('the panel: a refused stain gives the bottle back and says why; none carried, says where from', () => {
    const game = panelGame({ [BLUE]: 0 });
    const panel = game.microscopePanel;
    slide(game, { source: 'cheek' });
    game.microscopeAskStain(IODINE);
    game.microscopeApplyStain();
    assert.equal(game.getInventoryCount(IODINE), 1);
    answer(game, game.network.last()[1].reqId, { amount: 0, reason: 'stained' });
    assert.equal(game.getInventoryCount(IODINE), 2);
    assert.equal(game.getInventoryCount('glass'), 0);
    assert.match(panel.querySelector('#micro-note').textContent, /one to a slide/);

    game.microscopeAskStain(BLUE);
    assert.equal(game.microscopeStainAsked, null);
    assert.match(panel.querySelector('#micro-note').textContent, /C menu/);
    // In the popover, only what the player has.
    panel.querySelector('.micro-stain').fire('click');
    assert.equal(panel.querySelector(`.micro-stain-${BLUE}`).style.display, 'none');
    assert.equal(panel.querySelector(`.micro-stain-${IODINE}`).style.display, '');
    game.microscopeClosePop();
    game.microscopeAskStain('water_flask');
    assert.equal(game.microscopeStainAsked, null);
});

test('the panel: on a slide already stained, there is no staining', () => {
    const game = panelGame();
    const panel = game.microscopePanel;
    slide(game, { source: 'cheek', stain: BLUE });
    assert.ok(panel.querySelector('.micro-stain').classes.has('off'));
    assert.match(panel.querySelector('.micro-stain').title, /one to a slide/);
    panel.querySelector('.micro-stain').fire('click');
    assert.ok(!panel.querySelector('#micro-pop-stain').classes.has('visible'), 'no popover for it');
    game.microscopeAskStain(IODINE);
    assert.equal(game.microscopeStainAsked, null);
    // Someone else stains it while this viewer is deciding: the question goes away, and no bottle is spent.
    const other = panelGame();
    slide(other, { source: 'cheek' });
    other.microscopeAskStain(IODINE);
    slide(other, { source: 'cheek', stain: BLUE });
    assert.equal(other.microscopeStainAsked, null);
    other.microscopeApplyStain();
    assert.equal(other.getInventoryCount(IODINE), 2);
});

test('the panel: a stained slide, for anyone looking, cannot be drawn from or revived', () => {
    const game = panelGame();
    const panel = game.microscopePanel;
    slide(game, { source: 'tardigrade_tube' });
    game.microscopeSelected = game.microscopeOrganisms[0];
    game.microscopeRenderControls();
    assert.ok(!panel.querySelector('.micro-capture').classes.has('off'));
    assert.notEqual(panel.querySelector('.micro-stain').style.display, 'none');
    assert.notEqual(panel.querySelector('.micro-drop').style.display, 'none');
    const sent = () => game.network.sent.length;

    // Another player's stain arrives through the same contents.
    slide(game, { source: 'tardigrade_tube', stain: IODINE, age: 40 });
    assert.equal(game.microscopeOrganisms.length, 1, 'the same organisms, stopped');
    assert.ok(panel.querySelector('.micro-capture').classes.has('off'));
    assert.match(panel.querySelector('.micro-capture').title, /Stained/);
    assert.ok(panel.querySelector('.micro-drop').classes.has('off'));
    assert.match(panel.querySelector('.micro-drop').title, /Stained/);
    assert.match(panel.querySelector('#micro-slide-line').textContent, /Iodine Tincture.*fixed/);
    assert.match(panel.querySelector('.micro-state').textContent, /no drop will bring/);

    // Even if the buttons were pressed, nothing is taken out or sent.
    const before = sent();
    game.microscopeSend('microscopeDrop', 'drop');
    game.microscopeSend('microscopeCapture', 'capture');
    assert.equal(sent(), before);
    assert.equal(game.getInventoryCount('water_flask'), 1);
    assert.equal(game.getInventoryCount('test_tube'), 3);
    assert.match(panel.querySelector('#micro-note').textContent, /stained/);

    // The clock has stopped: it reads the same however long it has been.
    assert.equal(game.microscopeAge(), 40);
    assert.equal(game.microscopeWoke(), -1);
    game.microscopeFrameLeft = 0;
    game.microscopeUpdate(0.1);
    assert.equal(game.microscopeOrganisms[0].action, 'fixed');
    assert.equal(game.microscopeView({ age: 40, revived: false, stain: IODINE }).stain, IODINE);

    // A slide off and a new one on: clean again.
    slide(game, { source: 'sample_moss_a', seed: 77 });
    assert.equal(game.microscopeStain(), '');
    assert.ok(!panel.querySelector('.micro-stain').classes.has('off'));
});

test('the panel: each viewer has their own filter and stop, from what they carry, and nothing is sent or spent', () => {
    const game = panelGame({ cobalt_glass: 1, red_stained_glass: 2, red_stained_glass_pane: 1, stone: 3, darkfield_stop: 1 });
    const panel = game.microscopePanel;
    slide(game, { source: 'cheek' });
    const sent = game.network.sent.length;

    assert.deepEqual(plain(game.microscopeFilterChoices()), ['cobalt_glass', 'red_stained_glass', 'red_stained_glass_pane']);
    assert.ok(!panel.querySelector('.micro-filter').classes.has('active'));
    panel.querySelector('.micro-filter').fire('click');
    const pop = panel.querySelector('#micro-pop-filter');
    const list = panel.querySelector('#micro-filters');
    assert.ok(pop.classes.has('visible'));
    list.children = [];
    game.microscopeRenderControls();
    assert.equal(list.children.length, 4, 'None, and the three it carries');
    list.children[1].fire('click');
    assert.equal(game.microscopeFilter.type, 'cobalt_glass');
    assert.ok(!pop.classes.has('visible'));
    assert.ok(panel.querySelector('.micro-filter').classes.has('active'));
    assert.match(panel.querySelector('.micro-filter').title, /cobalt_glass/);
    assert.match(panel.querySelector('#micro-tool-line').textContent, /only its own colour/);
    assert.deepEqual(plain(game.microscopeView({ age: 1, revived: false, stain: '' }).tint), [0x2a, 0x4f, 0xd0]);
    game.microscopeSetFilter('stone');
    assert.equal(game.microscopeFilter.type, 'cobalt_glass', 'not a filter');
    game.microscopeSetFilter(null);
    assert.equal(game.microscopeFilter, null);
    assert.equal(game.microscopeView({ age: 1, revived: false, stain: '' }).tint, null);

    game.microscopeSetFilter('red_stained_glass');
    panel.querySelector('.micro-dark').fire('click');
    assert.equal(game.microscopeDark, true);
    assert.ok(panel.querySelector('.micro-dark').classes.has('active'));
    assert.match(panel.querySelector('.micro-dark').title, /on/);
    assert.match(panel.querySelector('#micro-tool-line').textContent, /Dark-field/);
    assert.equal(game.microscopeView({ age: 1, revived: false, stain: '' }).dark, 1);

    // Nothing has been spent, nothing has gone to the server, and nothing is written down.
    assert.equal(game.getInventoryCount('red_stained_glass'), 2);
    assert.equal(game.getInventoryCount('darkfield_stop'), 1);
    assert.equal(game.network.sent.length, sent);

    // What leaves the inventory leaves the light.
    game.inventoryCounts.red_stained_glass = 0;
    game.inventoryCounts.darkfield_stop = 0;
    game.microscopeInventoryChanged();
    assert.equal(game.microscopeFilter, null);
    assert.equal(game.microscopeDark, false);
    assert.equal(game.microscopeView({ age: 1, revived: false, stain: '' }).dark, 0);
});

test('the panel: dark-field without the stop says what it needs; with a bulb, says it is poor', () => {
    const game = panelGame();
    const panel = game.microscopePanel;
    panel.querySelector('.micro-dark').fire('click');
    assert.ok(!game.microscopeDark);
    assert.match(panel.querySelector('#micro-note').textContent, /Dark-field Stop/);
    assert.ok(!/Dark-field/.test(panel.querySelector('#micro-tool-line').textContent));

    const lit = panelGame({ darkfield_stop: 1 });
    lit.microscopeToggleDark();
    lit.microscopeLight = lit.microscopeLight && { source: 'lamp', level: 0.7, name: 'Light Bulb' };
    lit.microscopeRenderLines();
    assert.match(lit.microscopePanel.querySelector('#micro-tool-line').textContent, /very dim/);
    assert.ok(lit.microscopeView({ age: 1, revived: false, stain: '' }).dark < 0.4);
});

test('the panel: its portrait follows the stain and the dark field', () => {
    const game = panelGame({ darkfield_stop: 1 });
    const panel = game.microscopePanel;
    slide(game, { source: 'cheek' });
    game.microscopeSelected = game.microscopeOrganisms[0];
    game.microscopeRenderControls();
    const portrait = panel.querySelector('#micro-portrait').getContext();
    const count = () => portrait.calls.length;
    const first = count();
    game.microscopeRenderControls();
    assert.equal(count(), first, 'not redrawn for nothing');
    slide(game, { source: 'cheek', stain: BLUE });
    assert.ok(count() > first);
    assert.match(panel.querySelector('.micro-state').textContent, /dark blue nucleus/);
});

test('the panel is usable by touch: every control is a button a finger can hit, and a grey one still answers', () => {
    const text = source('microscope.js');
    for (const name of ['micro-stain-yes', 'micro-stain-no']) assert.match(text, new RegExp(`<button type="button" class="${name}"`), name);
    assert.match(text, /<button type="button" class="micro-tool micro-\$\{name\}">/);
    assert.match(text, /\.micro-pop \.micro-row button\{flex:1 1 auto;min-height:40px\}/);
    assert.match(text, /#microscope-panel \.micro-choice\{[^}]*min-height:40px/);
    assert.doesNotMatch(text, /\.disabled\s*=/, 'a disabled button says nothing on a touch screen');
});

test('the popovers: one at a time, above its icon, and Escape closes it before the panel', () => {
    const game = panelGame({ cobalt_glass: 1 });
    const panel = game.microscopePanel;
    slide(game, { source: 'cheek' });
    const stain = panel.querySelector('#micro-pop-stain');
    const filter = panel.querySelector('#micro-pop-filter');
    panel.querySelector('.micro-stain').fire('click');
    assert.ok(stain.classes.has('visible'));
    panel.querySelector('.micro-filter').fire('click');
    assert.ok(!stain.classes.has('visible') && filter.classes.has('visible'), 'the other one closes');
    panel.querySelector('.micro-filter').fire('click');
    assert.ok(!filter.classes.has('visible'), 'its icon closes it');
    // Choosing and leaving forgets the question.
    panel.querySelector(`.micro-stain-${BLUE}`).fire('click');
    assert.equal(game.microscopeStainAsked, BLUE);
    assert.equal(game.microscopeEscape(), true);
    assert.equal(game.microscopeStainAsked, null);
    assert.ok(!stain.classes.has('visible'));
    assert.ok(game.microscopeAt, 'the panel is still there');
    assert.equal(game.microscopeEscape(), false, 'and now there is nothing to close but it');
    // A touch on the field closes it too.
    panel.querySelector('.micro-filter').fire('click');
    panel.querySelector('#micro-field').fire('pointerdown', { pointerId: 1, clientX: 1, clientY: 1 });
    assert.ok(!filter.classes.has('visible'));
});

// ---- The guide ----

const GUIDE = path.join(STATIC, 'guide');
const guideNames = fs.readdirSync(GUIDE);
const guidePage = (page, lang) => {
    const name = guideNames.find((candidate) => candidate.startsWith(`${page}_${lang}_`));
    assert.ok(name, `page ${page} ${lang}`);
    return fs.readFileSync(path.join(GUIDE, name), 'utf8');
};

test('the guide: 246 and 247 in both languages, linked, and in the printed book', () => {
    const titles = { 246: { ES: 'Tinciones', EN: 'Stains' }, 247: { ES: 'Filtros y campo oscuro', EN: 'Filters and dark-field' } };
    const print = require(path.join(JS, 'guidePrint.js'));
    const readme = fs.readFileSync(path.join(GUIDE, 'README.md'), 'utf8');
    for (const page of [246, 247]) {
        for (const lang of ['ES', 'EN']) {
            const text = guidePage(page, lang);
            assert.equal(text.split('\n')[0], `# ${titles[page][lang]}`);
            for (const other of [0, 48, 238]) assert.match(guidePage(other, lang), new RegExp(`\\(${page}\\)`), `${other} ${lang} links to ${page}`);
            for (const [, target] of text.matchAll(/\]\((\d+)\)/g)) assert.ok(guideNames.some((name) => name.startsWith(`${target}_${lang}_`)), `${page} ${lang} links to ${target}`);
            for (const [, species] of text.matchAll(/\(mob:([a-z0-9_]+)\)/g)) assert.ok(ctx.MICRO_SPECIES[species], species);
            assert.match(text, lang === 'EN' ? /\*\*True:\*\*/ : /\*\*Es verdad:\*\*/);
            assert.match(text, lang === 'EN' ? /\*\*Simplified in the game:\*\*/ : /\*\*Lo simplifica el juego:\*\*/);
        }
        assert.ok(print.SECTIONS.some(([from, to]) => page >= from && page <= to), `section for ${page}`);
        assert.match(readme, new RegExp(`^\\| ${page} \\|`, 'm'));
    }
    assert.equal(ctx.MICROSCOPE_STAIN_PAGE, 246);
    assert.equal(ctx.MICROSCOPE_LENS_PAGE, 247);
    const guia = fs.readFileSync(path.join(ROOT, 'GUIA.md'), 'utf8');
    assert.match(guia, /^### Tinciones, filtros y campo oscuro$/m);
    assert.match(guia, /`methylene_blue` \| 1 `coal_ore` \+ 1 `element_s` \+ 1 `water_flask`/);
    assert.match(guia, /`darkfield_stop` \| 1 `glass_slide` \+ 1 `coal_ore`/);
});

test('the guide says what the game does, and that a stain does not always kill', () => {
    for (const lang of ['ES', 'EN']) {
        const stains = guidePage(246, lang);
        for (const id of SPECIES) assert.ok(stains.includes(`(mob:${id})`), `${id} in the table ${lang}`);
        assert.match(stains, /1 `coal_ore` \+ 1 `element_s` \+ 1 `water_flask`/);
        assert.match(stains, lang === 'EN' ? /vital stains/ : /tinciones vitales/);
        assert.match(stains, lang === 'EN' ? /one stain to a slide/ : /un tinte por portaobjetos/);
        assert.match(stains, lang === 'EN' ? /drop of water brings nothing back/i : /gota de agua no devuelve nada/i);
        const light = guidePage(247, lang);
        assert.match(light, /1 `glass_slide` \+ 1 `coal_ore`/);
        assert.match(light, /`cobalt_glass`/);
        // Words, not a formula, for what the recipe stands for: the only formula is the real one.
        assert.equal([...stains.matchAll(/C₁₆H₁₈ClN₃S/g)].length, 1);
    }
});
