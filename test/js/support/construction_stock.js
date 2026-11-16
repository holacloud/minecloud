// What every design's storage must hold, for the tests of the buildings that stock theirs (constructions.test.js,
// construction_castle.test.js, construction_library.test.js, construction_apartments.test.js): every chest,
// barrel, wardrobe, fridge and chest freezer has a stock of at least two kinds, each one an item the server takes
// (stockItems in pkg/network/construction_stock.go), within its limits and the slots of the block, and nothing
// in a fridge or freezer that would change in there (/build undo must know what is still inside).
// The tables are read from the sources, so that this needs no VM of its own.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

const GO = read('pkg', 'network', 'construction_stock.go');
const GO_LIST = GO.slice(GO.indexOf('range []string{'), GO.indexOf('} {', GO.indexOf('range []string{')));
const STOCK_ITEMS = new Set([...GO_LIST.matchAll(/"([a-z0-9_]+)"/g)].map((match) => match[1]));
const goConst = (name) => Number(GO.match(new RegExp(`${name}\\s*=\\s*(\\d+)`))[1]);
const STOCK_MAX = goConst('stockMaxStack');
const STOCK_TOTAL = goConst('stockMaxItems');

const objectLiteral = (source, name) => JSON.parse(source.match(new RegExp(`const ${name} = (\\{[^}]*\\})`))[1].replace(/([a-z_]+):/g, '"$1":').replace(/'/g, '"'));
const STORAGE = read('pkg', 'web', 'static', 'js', 'game', 'storage.js');
const APPLIANCES = read('pkg', 'web', 'static', 'js', 'game', 'appliances.js');
const SLOTS = objectLiteral(STORAGE, 'STORAGE_KINDS');
const FREEZER_SLOTS = objectLiteral(STORAGE, 'STORAGE_FREEZERS');
const CHILL = objectLiteral(APPLIANCES, 'APPLIANCE_CHILL');
const FREEZE = objectLiteral(APPLIANCES, 'APPLIANCE_FREEZE');

const STOCKED_KINDS = ['chest', 'barrel', 'wardrobe', 'fridge', 'chest_freezer'];

// Checks the plan's stock; returns how many storage blocks it has and the total of each item over all of them.
function constructionStockCheck(plan, baseOf, stateOf) {
    const stocks = new Map(plan.stocks.map((stock) => [`${stock.x},${stock.y},${stock.z}`, stock]));
    const kindAt = new Map();
    for (const cell of plan.cells) {
        const base = baseOf(cell.type);
        if (!SLOTS[base] || stateOf(cell.type).half === 'upper') continue;
        kindAt.set(`${cell.x},${cell.y},${cell.z}`, base);
    }
    let storage = 0;
    for (const [where, kind] of kindAt) {
        if (!STOCKED_KINDS.includes(kind)) continue;
        storage++;
        const stock = stocks.get(where);
        assert.ok(stock, `${plan.name}: an empty ${kind} at ${where}`);
        assert.ok(stock.items.length >= 2, `${plan.name}: only one kind in the ${kind} at ${where}`);
    }
    const totals = new Map();
    for (const [where, stock] of stocks) {
        const kind = kindAt.get(where);
        assert.ok(kind, `${plan.name}: a stock with no storage under it at ${where}`);
        assert.ok(STOCKED_KINDS.includes(kind), `${plan.name}: a stock in the ${kind} at ${where}`);
        assert.ok(stock.items.length <= SLOTS[kind], `${plan.name}: ${stock.items.length} stacks in the ${kind} at ${where}`);
        assert.ok(stock.freezer.length <= (FREEZER_SLOTS[kind] || 0), `${plan.name}: no freezer in the ${kind} at ${where}`);
        let total = 0;
        const seen = new Set();
        for (const [type, count] of [...stock.items, ...stock.freezer]) {
            assert.ok(STOCK_ITEMS.has(type), `${plan.name} at ${where}: ${type} is not in stockItems (construction_stock.go)`);
            assert.ok(Number.isInteger(count) && count >= 1 && count <= STOCK_MAX, `${plan.name} at ${where}: ${count} ${type}`);
            total += count;
            totals.set(type, (totals.get(type) || 0) + count);
        }
        for (const [type] of stock.items) {
            assert.ok(!seen.has(type), `${plan.name} at ${where}: two stacks of ${type}`);
            seen.add(type);
        }
        assert.ok(total <= STOCK_TOTAL, `${plan.name} at ${where}: ${total} items`);
        if (kind === 'fridge') for (const [type] of stock.items) assert.ok(!CHILL[type], `${plan.name} at ${where}: ${type} would chill`);
        const frozen = kind === 'chest_freezer' ? stock.items : stock.freezer;
        for (const [type] of frozen) assert.ok(!FREEZE[type], `${plan.name} at ${where}: ${type} would freeze`);
    }
    return { storage, totals };
}

module.exports = { constructionStockCheck };
