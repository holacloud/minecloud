// Node tests for pkg/web/viewer_block_palette.json, written by tools/viewerPalette.js from the game's
// block definitions: it must stay complete and up to date, or far colours quietly go grey.
// Run with: node --test test/js/viewerPalette.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tool = require(path.join(__dirname, '..', '..', 'tools', 'viewerPalette.js'));

const committed = JSON.parse(fs.readFileSync(tool.OUTPUT, 'utf8'));
const generated = tool.buildPalette();

function entry(palette, name) {
    return palette[name] || palette[name.split(':')[0]];
}

test('the committed palette is what the generator writes (node tools/viewerPalette.js)', () => {
    assert.equal(fs.readFileSync(tool.OUTPUT, 'utf8'), tool.formatPalette(generated.blocks));
});

test('every block of the game has an entry, states through their base name', () => {
    assert.ok(generated.names.length > 500, `${generated.names.length} block types`);
    for (const name of generated.names) assert.ok(entry(committed, name), `no entry for ${name}`);
});

test('a state with its own entry is really different from its base', () => {
    for (const [name, value] of Object.entries(committed)) {
        if (!name.includes(':')) continue;
        const base = committed[name.split(':')[0]];
        if (base) assert.notDeepEqual(value, base, name);
    }
});

test('colours are plain rgb and flags are known', () => {
    for (const [name, [color, flags]] of Object.entries(committed)) {
        assert.ok(Number.isInteger(color) && color >= 0 && color <= 0xffffff, `${name} colour ${color}`);
        assert.ok([0, tool.FLAG_SEE_THROUGH, tool.FLAG_FLUID].includes(flags), `${name} flags ${flags}`);
    }
});

test('what a look from above stops at', () => {
    for (const name of ['stone', 'grass', 'leaves', 'glass', 'stone_bricks', 'slate']) assert.equal(committed[name][1], 0, name);
    assert.equal(committed.water[1], tool.FLAG_FLUID);
    for (const name of ['tall_grass', 'flower_red', 'torch', 'ladder']) assert.equal(committed[name][1], tool.FLAG_SEE_THROUGH, name);
});

test('colours look like the block', () => {
    const channels = (name) => {
        const [color] = committed[name];
        return [(color >> 16) & 255, (color >> 8) & 255, color & 255];
    };
    const [gr, gg, gb] = channels('grass');
    assert.ok(gg > gr && gg > gb, 'grass is green');
    const [wr, , wb] = channels('water');
    assert.ok(wb > wr, 'water is blue');
    const [rr, rg] = channels('red_wool');
    assert.ok(rr > rg * 2, 'red wool is red');
    const [sr, sg, sb] = channels('stone');
    assert.ok(Math.abs(sr - sb) < 20 && Math.abs(sr - sg) < 20, 'stone is grey');
});
