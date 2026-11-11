// What the tests share to run the game's real scripts in a VM: the list of scripts as index.html loads
// them (index.html is the only list there is), a stand-in for whatever the browser gives, and a loader.
// Not a test: `node --test 'test/js/*.test.js'` does not pick this folder up.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..', '..');
const STATIC = path.join(ROOT, 'pkg', 'web', 'static');
const JS = path.join(STATIC, 'js');

// A script of the game, by its path under js/ ('game/crab.js').
const readScript = (file) => fs.readFileSync(path.join(JS, file), 'utf8');

// The scripts of the game in load order, as paths under js/ ('extensions.js', 'game/crab.js'...).
function gameScripts() {
    const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
    return [...html.matchAll(/<script src="js\/([^"]+)"/g)].map((match) => match[1]);
}

// Anything at all: a function, an object, a constructor, a number. For THREE, document and the like
// when the test does not care what they do.
function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}

// Runs in `context`, in the order of the game, the scripts of index.html that `wanted(file, source)` picks.
function loadScripts(context, wanted) {
    for (const file of gameScripts()) {
        const source = readScript(file);
        if (wanted(file, source)) vm.runInContext(source, context, { filename: file });
    }
}

// The tables the mechanics keep per species and per movement, as the game builds them: the core that
// defines them, the files that own a table, and every file that registers a species or a movement
// (js/extensions.js), which is where their rows and traits are said. `extra` names more files to load.
function loadSpeciesTables(context, extra = []) {
    const core = ['extensions.js', 'gameLang.js', 'chunkStore.js', 'blockShapes.js', 'mobSpecies.js'];
    const tables = ['game/bestiary_text.js', 'game/bestiary.js', 'game/resources.js', 'game/taming.js', 'game/traps.js', ...extra];
    vm.runInContext('class Game {}', context);
    context.VoxelModels = { mobBuilders: {}, MOB_SURFACES: {} };
    loadScripts(context, (file, source) => core.includes(file) || tables.includes(file) ||
        (file.startsWith('game/') && /^\s*register(Species|MobBehaviour)\(/m.test(source)));
    delete context.VoxelModels;
    return context;
}

module.exports = { ROOT, STATIC, JS, readScript, gameScripts, anyStub, loadScripts, loadSpeciesTables };
