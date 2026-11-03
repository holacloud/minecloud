// Node tests for the copper golem's plain logic (js/game/copper_golem.js): patina stages,
// charge, power blocks, modes, its load and cleaning saved golems.
// Run with: node --test test/js

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { COPPER_GOLEM, COPPER_GOLEM_LOGIC: L, COPPER_GOLEM_MODES } = require(path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js', 'game', 'copper_golem.js'));

test('patina goes orange, brown, patchy, green after 1, 3 and 6 game days', () => {
    assert.equal(L.patinaStage(0), 0);
    assert.equal(L.patinaStage(0.99), 0);
    assert.equal(L.patinaStage(1), 1);
    assert.equal(L.patinaStage(3), 2);
    assert.equal(L.patinaStage(5.9), 2);
    assert.equal(L.patinaStage(6), 3);
    assert.equal(L.patinaStage(100), 3);
    for (let stage = 0; stage <= 3; stage++) {
        assert.equal(L.patinaStage(L.stageStart(stage) / COPPER_GOLEM.dayLength), stage);
    }
});

test('wax stops the patina; rain or water speeds it up', () => {
    assert.equal(L.weather(10, 5, { waxed: true, wet: true }), 10);
    assert.equal(L.weather(10, 5), 15);
    assert.equal(L.weather(10, 5, { wet: true }), 10 + 5 * COPPER_GOLEM.wetFactor);
});

test('a full charge lasts one game day of work', () => {
    let charge = 1;
    for (let t = 0; t < COPPER_GOLEM.dayLength - 1; t++) charge = L.charge(charge, 1, { busy: true });
    assert.ok(charge > 0 && charge < 0.01);
    assert.equal(L.charge(charge, 2, { busy: true }), 0);
    // Idle it lasts much longer; asleep it uses nothing; next to power it fills up.
    assert.ok(L.charge(1, 240) > 0.75);
    assert.equal(L.charge(0.5, 100, { asleep: true }), 0.5);
    assert.equal(L.charge(0.5, 1000, { charging: true }), 1);
});

test('power blocks: charged batteries and switched-on blocks', () => {
    assert.equal(L.isPowerBlock('battery_block'), false);
    assert.equal(L.isPowerBlock('battery_block:1'), true);
    assert.equal(L.isPowerBlock('battery_block:4'), true);
    assert.equal(L.isPowerBlock('electric_lamp:on'), true);
    assert.equal(L.isPowerBlock('electric_lamp'), false);
    assert.equal(L.isPowerBlock('oak_door:lower:n:left:open'), false);
    assert.equal(L.isPowerBlock(null), false);
});

test('modes cycle follow, stay, work', () => {
    assert.deepEqual(COPPER_GOLEM_MODES, ['follow', 'stay', 'work']);
    assert.equal(L.nextMode('follow'), 'stay');
    assert.equal(L.nextMode('stay'), 'work');
    assert.equal(L.nextMode('work'), 'follow');
    assert.equal(L.nextMode('nonsense'), 'follow');
});

test('buttons and levers are pressable, doors are not', () => {
    assert.ok(L.isPressable('lever'));
    assert.ok(L.isPressable('push_button:on'));
    assert.ok(L.isPressable('oak_button'));
    assert.ok(!L.isPressable('oak_door:lower:n:left:closed'));
});

test('its load holds a few kinds of items', () => {
    const load = [];
    assert.ok(L.carry(load, 'dirt', 2));
    assert.ok(L.carry(load, 'dirt', 3));
    assert.deepEqual(load, [{ type: 'dirt', amount: 5 }]);
    for (let i = 1; i < COPPER_GOLEM.carryStacks; i++) assert.ok(L.carry(load, `item_${i}`, 1));
    assert.equal(L.carry(load, 'one_more', 1), false);
    assert.ok(L.carry(load, 'dirt', 1));
});

test('saved golems are cleaned', () => {
    assert.equal(L.clean(null), null);
    assert.equal(L.clean({ x: 1, y: 'a', z: 2 }), null);
    const golem = L.clean({ x: 1, y: 2, z: 3, mode: 'dance', charge: 7, patina: -4, waxed: 1,
        base: { x: 1, y: 2 }, carry: [{ type: 'dirt', amount: 3.7 }, { type: '<script>', amount: 1 }, null] });
    assert.equal(golem.mode, 'follow');
    assert.equal(golem.charge, 1);
    assert.equal(golem.patina, 0);
    assert.equal(golem.waxed, true);
    assert.equal(golem.base, null);
    assert.deepEqual(golem.carry, [{ type: 'dirt', amount: 3 }]);
});
