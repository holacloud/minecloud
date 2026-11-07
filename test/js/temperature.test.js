// Node tests for the temperature model of js/game/weather.js and its port to Go (pkg/network/temperature.go,
// which an incubator and a fermenter read when their power is off). Both sides are checked against the same
// grid of values, pkg/network/testdata/temperature_grid.json: this test against the JS functions, and
// TestTemperatureMatchesTheClient against the Go ones. So if either changes alone, one of them fails.
// To write the grid again from the JS model: TEMPERATURE_WRITE=1 node --test test/js/temperature.test.js
// Run with: node --test test/js/temperature.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const JS = path.join(ROOT, 'pkg', 'web', 'static', 'js');
const GRID = path.join(ROOT, 'pkg', 'network', 'testdata', 'temperature_grid.json');

function anyStub() {
    return new Proxy(function () {}, {
        get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'prototype' ? {} : anyStub()),
        apply: () => anyStub(), construct: () => anyStub(), set: () => true
    });
}

function loadWeather() {
    const context = vm.createContext({ console, Math, performance: { now: () => 0 }, window: {}, document: anyStub(), THREE: anyStub(), navigator: {} });
    vm.runInContext('class Game {}; function resourcesDrawSprite() { return () => {}; } function resourcesDisplayMesh() { return null; }', context);
    vm.runInContext(fs.readFileSync(path.join(JS, 'extensions.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(JS, 'game', 'weather.js'), 'utf8'), context, { filename: 'weather.js' });
    vm.runInContext('Object.assign(this, { weatherClimateOf, weatherLocalTemperature, weatherAirTemperature, WEATHER_BIOME_CLIMATE, WEATHER_CLIMATE_SAMPLES, Game })', context);
    return context;
}

const ctx = loadWeather();

// The grid: sets of biomes for the climate, then temperatures over climates, hours, heights, rain, water
// and cover. Biomes include one the table does not know (it counts as plains) and unknown chunks (null).
const BIOME_SETS = [
    ['plains'], ['desert'], ['forest'], ['rocky'], ['desert', 'plains', null, 'forest', 'rocky'],
    [null, null, null, null, null], ['swamp', 'desert'], ['rocky', 'rocky', 'forest', null, 'desert']
];
const HOURS = [0, 4, 9, 12, 15, 21, 23.5];
const HEIGHTS = [-12, 6, 20, 60];
const RAINS = [0, 0.4, 1];
const PLACES = [[false, 0], [false, 1], [false, 2], [false, 3], [false, 5], [false, 12], [true, 0]];

// rows: [climate (an index into climates), hour, y, rain, in water (0 or 1), cover, °C].
function computeGrid() {
    const climates = BIOME_SETS.map((biomes) => ({ biomes: biomes.map((biome) => biome || ''), climate: { ...ctx.weatherClimateOf(biomes) } }));
    const rows = [];
    climates.slice(0, 5).forEach(({ climate }, index) => {
        for (const hour of HOURS) {
            for (const y of HEIGHTS) {
                for (const rain of RAINS) {
                    for (const [inWater, cover] of PLACES) {
                        rows.push([index, hour, y, rain, inWater ? 1 : 0, cover, ctx.weatherLocalTemperature(climate, hour, y, rain, inWater, cover)]);
                    }
                }
            }
        }
    });
    return JSON.parse(JSON.stringify({ samples: ctx.WEATHER_CLIMATE_SAMPLES, table: ctx.WEATHER_BIOME_CLIMATE, climates, rows }));
}

if (process.env.TEMPERATURE_WRITE) fs.writeFileSync(GRID, `${JSON.stringify(computeGrid())}\n`);

test('the JS model gives the grid the Go model is checked on', () => {
    const saved = JSON.parse(fs.readFileSync(GRID, 'utf8'));
    const now = computeGrid();
    assert.deepEqual(now.samples, saved.samples);
    assert.deepEqual(now.table, saved.table);
    assert.equal(now.climates.length, saved.climates.length);
    now.climates.forEach((entry, i) => {
        assert.deepEqual(entry.biomes, saved.climates[i].biomes);
        assert.ok(Math.abs(entry.climate.day - saved.climates[i].climate.day) < 1e-9, `climate ${i} day`);
        assert.ok(Math.abs(entry.climate.night - saved.climates[i].climate.night) < 1e-9, `climate ${i} night`);
    });
    assert.equal(now.rows.length, saved.rows.length);
    assert.ok(now.rows.length > 2000, `${now.rows.length} rows`);
    now.rows.forEach((row, i) => {
        assert.deepEqual(row.slice(0, 6), saved.rows[i].slice(0, 6), `row ${i}`);
        assert.ok(Math.abs(row[6] - saved.rows[i][6]) < 1e-9, `row ${i}: ${row[6]} vs ${saved.rows[i][6]}`);
    });
});

test('the model says what a thermometer should: day warmer than night, caves steady, water mild', () => {
    const plains = ctx.WEATHER_BIOME_CLIMATE.plains;
    assert.ok(ctx.weatherLocalTemperature(plains, 15, 6, 0, false, 0) > ctx.weatherLocalTemperature(plains, 3, 6, 0, false, 0));
    const caveDay = ctx.weatherLocalTemperature(plains, 15, -10, 0, false, 12);
    const caveNight = ctx.weatherLocalTemperature(plains, 3, -10, 0, false, 12);
    assert.ok(Math.abs(caveDay - caveNight) < 0.01, 'deep under rock, the day does not reach');
    assert.ok(ctx.weatherLocalTemperature(ctx.WEATHER_BIOME_CLIMATE.desert, 3, 6, 0, true, 0) > ctx.weatherLocalTemperature(ctx.WEATHER_BIOME_CLIMATE.desert, 3, 6, 0, false, 0));
    assert.ok(ctx.weatherLocalTemperature(plains, 15, 6, 1, false, 0) < ctx.weatherLocalTemperature(plains, 15, 6, 0, false, 0), 'rain cools');
    assert.deepEqual({ ...ctx.weatherClimateOf([null]) }, { ...plains });
});

test('the thermometer reads through the same functions', () => {
    const source = fs.readFileSync(path.join(JS, 'game', 'weather.js'), 'utf8');
    const method = source.slice(source.indexOf('    weatherTemperature(position'), source.indexOf('    weatherPressure('));
    assert.match(method, /weatherLocalTemperature\(/);
    assert.match(source.slice(source.indexOf('    weatherClimateAt('), source.indexOf('    weatherStationCover(')), /weatherClimateOf\(/);
});
