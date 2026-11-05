// Generates pkg/web/viewer_block_palette.json: what the terrain viewer and its server endpoints
// need to know about every block type, taken from the game's own definitions, so nothing is
// copied by hand. Run it after adding or repainting a block:
//     node tools/viewerPalette.js
// test/js/viewerPalette.test.js fails while the committed file is out of date.
//
// Every script of index.html runs in one VM context with small stand-ins for the browser, as the
// Node tests do, and the colour of a block is the average of the texture on its top face: the
// painters fill plain arrays, so no canvas is needed. Each entry is [rgb, flags]:
//     1  see-through: not solid and not a fluid (plants, torches, ladders), so a look from above
//        goes past it and it never counts as the top of a column
//     2  fluid
// States of a block ("oak_door:n:closed") are listed only where they differ from the base name.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const OUTPUT = path.join(ROOT, 'pkg', 'web', 'viewer_block_palette.json');
const { SKIP_SCRIPTS } = require(path.join(STATIC, 'js', 'guidePrint.js'));

const FLAG_SEE_THROUGH = 1;
const FLAG_FLUID = 2;

function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}

function canvasStub() {
    const ctx = new Proxy({}, {
        get: (target, key) => (key in target ? target[key] : () => ({ data: new Uint8ClampedArray(4 * 4096), addColorStop() {}, width: 0 })),
        set: (target, key, value) => { target[key] = value; return true; }
    });
    return { width: 16, height: 16, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,' };
}

function loadWorld() {
    const THREE = new Proxy({}, { get: (known, key) => (key in known ? known[key] : anyStub()) });
    const context = vm.createContext({
        console: { ...console, warn() {} }, performance: { now: () => 0 }, THREE, navigator: {},
        requestAnimationFrame: () => 0, Worker: class { postMessage() {} terminate() {} },
        ImageData: class { constructor(w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; } },
        document: { createElement: (tag) => (tag === 'canvas' ? canvasStub() : anyStub()), addEventListener() {}, body: anyStub(), head: anyStub(), getElementById: () => null, querySelector: () => null },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
    });
    context.window = context;
    vm.runInContext('class Game {}', context);
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1])
        .filter((src) => !/^(https?:)?\/\//.test(src) && !SKIP_SCRIPTS.test(src));
    for (const src of scripts) {
        vm.runInContext(fs.readFileSync(path.join(STATIC, src), 'utf8'), context, { filename: src });
    }
    return vm.runInContext('new WorldRenderer({ add() {}, remove() {} })', context);
}

// The average colour of a face's texture, counting each pixel by how opaque it is.
function faceColor(world, spec, fallback) {
    const factory = world.textureFactory;
    const painter = factory.patterns()[spec.pattern] || factory.patterns().generic;
    const surface = factory.createSurface(16, false);
    painter(surface, spec.tint, factory.seedFor(spec.pattern, spec.tint));
    let weight = 0;
    const sum = [0, 0, 0];
    for (let i = 0; i < surface.size * surface.size; i++) {
        const alpha = surface.alpha[i];
        weight += alpha;
        for (let c = 0; c < 3; c++) sum[c] += surface.color[i * 3 + c] * alpha;
    }
    if (weight === 0) return fallback;
    const channel = (value) => Math.max(0, Math.min(255, Math.round(value / weight)));
    return (channel(sum[0]) << 16) | (channel(sum[1]) << 8) | channel(sum[2]);
}

function entryFor(world, name) {
    const def = world.blockTypes[name];
    const id = world.registry.ids[name];
    const flags = world.registry.fluid[id] ? FLAG_FLUID : world.registry.solid[id] ? 0 : FLAG_SEE_THROUGH;
    return [faceColor(world, world.getFaceTextureSpecs(name).top, def.color || 0x808080), flags];
}

function buildPalette() {
    const world = loadWorld();
    const names = Array.from(world.registry.names).filter((name) => name !== 'air');
    const blocks = {};
    for (const name of [...names].sort()) {
        const entry = entryFor(world, name);
        const base = name.split(':')[0];
        if (base !== name && blocks[base] && blocks[base][0] === entry[0] && blocks[base][1] === entry[1]) continue;
        blocks[name] = entry;
    }
    return { names, blocks };
}

// One block per line, so a change reads well in a diff.
function formatPalette(blocks) {
    const lines = Object.keys(blocks).sort().map((name) => `    ${JSON.stringify(name)}: [${blocks[name][0]}, ${blocks[name][1]}]`);
    return `{\n${lines.join(',\n')}\n}\n`;
}

module.exports = { buildPalette, formatPalette, OUTPUT, FLAG_SEE_THROUGH, FLAG_FLUID };

if (require.main === module) {
    const { names, blocks } = buildPalette();
    fs.writeFileSync(OUTPUT, formatPalette(blocks));
    console.log(`${Object.keys(blocks).length} entries for ${names.length} block types: ${path.relative(ROOT, OUTPUT)}`);
}
