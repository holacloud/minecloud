// What the palaces have in common (/build palace_andalusi, palace_baroque, palace_oriental, palace_nordic,
// palace_maya, palace_volcanic: one file each, construction_palace_<style>.js). Loaded after
// constructions.js, construction_castle.js and palace_decor.js, and before the palaces; it only defines
// functions and tables, and no design.
//
// A palace is a design like the castle (construction_castle.js): a big box with a levelled site whose
// outer `rim` columns are graded down to the terrain, and here the rim and the grounds are dressed for the
// palace's land by a THEME: 'desert', 'plains', 'cherry', 'snow', 'jungle' or 'volcanic'.
//
// API (every name starts with constructionPalace):
//   constructionPalaceSite({ label, theme, groundY, rim, maxEarth, maxRelief, maxWater })
//       A design's `site` (see CONSTRUCTION_DESIGNS in constructions.js): levels the ground at the middle
//       height of the box within reach of the player, grades the last `rim` columns (12) to the terrain with
//       the theme's ground, its soil under it, a road of the theme's paving (with stairs) from the player to
//       the near edge of the level, and trees, shrubs and rocks of the theme on the slope. `groundY` is the
//       design's groundY (its ground layer). Refuses a mountain, too much water or earth, too much relief.
//   constructionPalaceGrounds(b, theme, { x0, z0, x1, z1, y, free, density, salt, decor })
//       Inside the plan: lays the theme's ground on layer y of that rectangle and scatters its plants and
//       trees on it where free(x, z) is true (default: everywhere). density is a share of the columns
//       (the theme's own by default); decor: false lays the ground alone.
//   constructionPalaceTree(put, kind, x, y, z, salt)
//       One tree, shrub or rock standing on (x, y - 1, z): kinds 'oak', 'birch', 'cherry', 'spruce',
//       'jungle', 'palm', 'acacia', 'charred', 'cactus', 'shrub:<leaves>', 'boulder:<block>', 'flowers',
//       'grass', 'ice_spike', 'basalt_column', 'magma_vent'. put(x, y, z, type, soft) places a block; soft
//       (leaves, flowers) must not replace one already there. Reach: 3 columns round (x, z), 12 up at most.
//   constructionPalacePut(b) gives that `put` for a ConstructionBuilder (it skips cells outside the box).
//   constructionPalaceHash(x, y, z, salt) -> [0, 1), the same for the same cell always.
//   constructionPalacePick(palette, x, y, z, salt) -> a type from [[type, weight], ...], fixed per cell:
//       weathered walls (constructionCastleStone, with any palette).
//   constructionPalaceBed(b, x, y, z, facing)  a bed with its head at (x, y, z), `facing` the way the head
//       points; the foot in the cell away from it (as constructionCastleBed).
//   constructionPalaceMirrorZ(b, zSum, draw)  draws draw(m) and its mirror across z = zSum / 2: m.z(z) is
//       the z to use and m.facing(f) the facing (n and s swap). With b.sym inside or outside it, four ways.
//   constructionPalaceSign(b, x, y, z, facing, es, en, mount)  a sign (mount 'post' or 'wall'), Spanish then
//       English, as the castle's.
//   constructionPalaceChest(b, x, y, z, facing, items, kind)  a chest (or 'barrel', which has no facing)
//       and what it holds once built (b.stock): items [[type, count], ...]. Throws when a stack is over
//       CONSTRUCTION_STOCK_MAX, the whole over CONSTRUCTION_STOCK_TOTAL or the stacks over its slots. The
//       names must be in stockItems (pkg/network/construction_stock.go): test/js/construction_palace_common.test.js
//       checks every palace's stock against it.
//
// A palace's file, in short (see construction_palace_andalusi.js and the others):
//   const PALACE_X_SIZE = [W, H, D], PALACE_X_GROUND = 6, PALACE_X_RIM = 12;
//   function constructionPalaceX(b) { ...draws, with grounds, chests... }
//   CONSTRUCTION_DESIGNS.palace_x = { label, size, foundation: 'dirt', anchorX, groundY, rate: 480,
//       start: [anchorX, groundY + 1, 1], levels: [], site: constructionPalaceSite({ label, theme, groundY,
//       rim }), generate: constructionPalaceX };
// The rim is earth only: draw the palace inside it (from x, z = rim to size - 1 - rim).

// The lands. ground: the surface, a palette; soil: under it; road and roadStairs: the way in; decor: what
// grows or lies on it, a palette of kinds of constructionPalaceTree; density: the share of columns with one.
const CONSTRUCTION_PALACE_THEMES = {
    desert: {
        ground: [['sand', 85], ['sandstone', 15]], soil: 'sand', road: 'cut_sandstone', roadStairs: 'sandstone_stairs',
        decor: [['palm', 4], ['cactus', 5], ['shrub:acacia_leaves', 4], ['boulder:sandstone', 2]], density: 0.025
    },
    plains: {
        ground: [['grass', 1]], soil: 'dirt', road: 'cobblestone', roadStairs: 'cobblestone_stairs',
        decor: [['oak', 3], ['birch', 2], ['shrub:leaves', 5], ['flowers', 6], ['grass', 10]], density: 0.05
    },
    cherry: {
        ground: [['grass', 85], ['moss', 15]], soil: 'dirt', road: 'stone_bricks', roadStairs: 'stone_brick_stairs',
        decor: [['cherry', 6], ['shrub:cherry_leaves', 3], ['flowers', 4], ['grass', 8]], density: 0.05
    },
    snow: {
        ground: [['snow_block', 90], ['packed_ice', 4], ['stone', 6]], soil: 'dirt', road: 'cobblestone', roadStairs: 'cobblestone_stairs',
        decor: [['spruce', 7], ['boulder:stone', 2], ['ice_spike', 2]], density: 0.03
    },
    jungle: {
        ground: [['grass', 80], ['moss', 20]], soil: 'dirt', road: 'cobblestone', roadStairs: 'cobblestone_stairs',
        decor: [['jungle', 6], ['shrub:jungle_leaves', 8], ['grass', 12], ['flowers', 2]], density: 0.08
    },
    volcanic: {
        ground: [['basalt', 55], ['cobblestone', 15], ['stone', 12], ['obsidian', 8], ['granite', 6], ['magma_rock', 4]], soil: 'basalt', road: 'basalt', roadStairs: 'stone_brick_stairs',
        decor: [['basalt_column', 4], ['boulder:obsidian', 2], ['magma_vent', 2], ['charred', 1]], density: 0.02
    }
};

// How far round its column a decoration of constructionPalaceTree may reach, and how high.
const CONSTRUCTION_PALACE_DECOR_REACH = 3;
const CONSTRUCTION_PALACE_DECOR_HEIGHT = 12;
// The rim, by default, and the reach of the road up or down (columns of rim it has to climb in).
const CONSTRUCTION_PALACE_RIM = 12;
// Earth a site may move per column of its box, how far above or below the level it may be, and its share
// of water (the castle's numbers).
const CONSTRUCTION_PALACE_EARTH_PER_COLUMN = 7.5;
const CONSTRUCTION_PALACE_MAX_RELIEF = 34;
const CONSTRUCTION_PALACE_MAX_WATER = 0.5;

function constructionPalaceHash(x, y, z, salt = 0) {
    let h = Math.imul(x + 3, 73856093) ^ Math.imul(y + 5, 19349663) ^ Math.imul(z + 7, 83492791) ^ Math.imul(salt + 11, 2654435761);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    return (((h ^ (h >>> 15)) >>> 0) % 100003) / 100003;
}

function constructionPalacePick(palette, x, y, z, salt = 0) {
    let total = 0;
    for (const [, weight] of palette) total += weight;
    let k = constructionPalaceHash(x, y, z, salt) * total;
    for (const [type, weight] of palette) {
        k -= weight;
        if (k < 0) return type;
    }
    return palette[palette.length - 1][0];
}

function constructionPalaceTheme(theme) {
    const found = CONSTRUCTION_PALACE_THEMES[theme];
    if (!found) throw new Error(`No palace theme "${theme}"`);
    return found;
}

// A blob of leaves of radius r round (cx, cy, cz), a little ragged, never on the trunk.
function constructionPalaceCanopy(put, leaves, cx, cy, cz, r, flat, salt) {
    for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
                const d = Math.hypot(dx, dy * (flat ? 1.8 : 1), dz);
                if (d > r + 0.3) continue;
                if (d > r - 0.6 && constructionPalaceHash(cx + dx, cy + dy, cz + dz, salt) < 0.35) continue;
                put(cx + dx, cy + dy, cz + dz, leaves, true);
            }
        }
    }
}

function constructionPalaceTree(put, kind, x, y, z, salt = 0) {
    const roll = (k) => constructionPalaceHash(x, y + k, z, salt);
    const trunk = (type, height) => {
        for (let k = 0; k < height; k++) put(x, y + k, z, type);
    };
    const [what, material] = kind.split(':');
    switch (what) {
        case 'oak':
        case 'birch': {
            const height = 4 + Math.floor(roll(1) * 2);
            trunk(what === 'oak' ? 'wood' : 'birch_wood', height);
            constructionPalaceCanopy(put, what === 'oak' ? 'leaves' : 'birch_leaves', x, y + height, z, 2, false, salt);
            return;
        }
        case 'cherry': {
            const height = 4 + Math.floor(roll(1) * 2);
            trunk('cherry_wood', height);
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                if (roll(dx * 3 + dz + 5) < 0.5) put(x + dx, y + height - 1, z + dz, 'cherry_wood');
            }
            constructionPalaceCanopy(put, 'cherry_leaves', x, y + height, z, 3, true, salt);
            return;
        }
        case 'spruce': {
            const height = 6 + Math.floor(roll(1) * 3);
            trunk('spruce_wood', height);
            for (let k = 2; k <= height; k++) {
                const r = Math.max(0, Math.min(2, Math.floor((height - k) / 2)));
                for (let dz = -r; dz <= r; dz++) {
                    for (let dx = -r; dx <= r; dx++) {
                        if (Math.abs(dx) + Math.abs(dz) <= r + (k % 2 ? 0 : 1) && (dx || dz)) put(x + dx, y + k, z + dz, 'spruce_leaves', true);
                    }
                }
            }
            put(x, y + height, z, 'spruce_leaves', true);
            put(x, y + height + 1, z, 'spruce_leaves', true);
            return;
        }
        case 'jungle': {
            const height = 7 + Math.floor(roll(1) * 3);
            trunk('jungle_wood', height);
            constructionPalaceCanopy(put, 'jungle_leaves', x, y + height, z, 3, true, salt);
            constructionPalaceCanopy(put, 'jungle_leaves', x, y + height - 3, z, 1, false, salt + 1);
            return;
        }
        case 'palm': {
            // A trunk that leans one block on its way up, and fronds out in four directions and four between.
            const height = 5 + Math.floor(roll(1) * 2);
            const [lx, lz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(roll(2) * 4)];
            const lean = Math.floor(height / 2);
            for (let k = 0; k < height; k++) put(x + (k >= lean ? lx : 0), y + k, z + (k >= lean ? lz : 0), 'jungle_wood');
            const [tx, ty, tz] = [x + lx, y + height, z + lz];
            put(tx, ty, tz, 'jungle_leaves', true);
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
                put(tx + dx, ty, tz + dz, 'jungle_leaves', true);
                if (!dx || !dz) put(tx + 2 * dx, ty - 1, tz + 2 * dz, 'jungle_leaves', true);
            }
            return;
        }
        case 'acacia': {
            const height = 4 + Math.floor(roll(1) * 2);
            trunk('acacia_wood', height);
            constructionPalaceCanopy(put, 'acacia_leaves', x, y + height, z, 3, true, salt);
            return;
        }
        case 'charred': {
            const height = 3 + Math.floor(roll(1) * 3);
            trunk('dark_oak_wood', height);
            const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(roll(2) * 4)];
            put(x + dx, y + height - 1, z + dz, 'dark_oak_wood');
            return;
        }
        case 'cactus':
            trunk('cactus', 1 + Math.floor(roll(1) * 3));
            return;
        case 'shrub':
            put(x, y, z, material || 'leaves', true);
            if (roll(1) < 0.5) put(x + (roll(2) < 0.5 ? 1 : -1), y, z, material || 'leaves', true);
            if (roll(3) < 0.3) put(x, y + 1, z, material || 'leaves', true);
            return;
        case 'boulder': {
            const type = material || 'stone';
            put(x, y, z, type);
            if (roll(1) < 0.6) put(x + 1, y, z, type);
            if (roll(2) < 0.6) put(x, y, z + 1, type);
            if (roll(3) < 0.4) put(x, y + 1, z, type);
            return;
        }
        case 'flowers':
            put(x, y, z, roll(1) < 0.5 ? 'flower_red' : 'flower_yellow', true);
            return;
        case 'grass':
            put(x, y, z, 'tall_grass', true);
            return;
        case 'ice_spike': {
            const height = 2 + Math.floor(roll(1) * 4);
            trunk('packed_ice', height);
            if (height > 3) put(x + 1, y, z, 'packed_ice');
            return;
        }
        case 'basalt_column': {
            trunk('basalt', 2 + Math.floor(roll(1) * 4));
            if (roll(2) < 0.5) {
                const [dx, dz] = roll(3) < 0.5 ? [1, 0] : [0, 1];
                for (let k = 0; k < 1 + Math.floor(roll(4) * 3); k++) put(x + dx, y + k, z + dz, 'basalt');
            }
            return;
        }
        case 'magma_vent':
            put(x, y - 1, z, 'magma_rock');
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + dx, y, z + dz, roll(dx * 2 + dz + 4) < 0.5 ? 'obsidian' : 'basalt');
            return;
        default:
            throw new Error(`No palace decoration "${kind}"`);
    }
}

// The `put` of constructionPalaceTree for a builder: inside the box only; soft blocks only where nothing is.
function constructionPalacePut(b) {
    const [w, h, d] = b.size;
    return (x, y, z, type, soft) => {
        if (x < 0 || x >= w || y < 0 || y >= h || z < 0 || z >= d) return;
        const fx = b.flipped ? w - 1 - x : x;
        if (soft && b.cells.has((y * d + z) * w + fx)) return;
        b.set(x, y, z, type);
    };
}

function constructionPalaceGrounds(b, theme, { x0, z0, x1, z1, y, free = () => true, density, salt = 0, decor = true }) {
    const land = constructionPalaceTheme(theme);
    const put = constructionPalacePut(b);
    const share = density === undefined ? land.density : density;
    const reach = CONSTRUCTION_PALACE_DECOR_REACH;
    for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) b.set(x, y, z, constructionPalacePick(land.ground, x, y, z, salt));
    }
    if (!decor) return;
    for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
            if (constructionPalaceHash(x, y, z, salt + 17) >= share || !free(x, z)) continue;
            const kind = constructionPalacePick(land.decor, x, y, z, salt + 29);
            // A tree needs room round it; a flower or a tuft of grass does not.
            const small = /^(flowers|grass|cactus|shrub)/.test(kind);
            const room = small ? 0 : reach;
            let fits = x - room >= x0 && x + room <= x1 && z - room >= z0 && z + room <= z1;
            for (let dz = -room; fits && dz <= room; dz++) {
                for (let dx = -room; fits && dx <= room; dx++) fits = free(x + dx, z + dz);
            }
            if (fits) constructionPalaceTree(put, kind, x, y + 1, z, salt);
        }
    }
}

function constructionPalaceBed(b, x, y, z, facing) {
    const [dx, dz] = SHAPE_DIRECTIONS[facing];
    b.bed(x - dx, y, z - dz, facing);
}

function constructionPalaceMirrorZ(b, zSum, draw) {
    draw({ z: (z) => z, facing: (f) => f });
    draw({ z: (z) => zSum - z, facing: (f) => (f === 'n' ? 's' : f === 's' ? 'n' : f) });
}

function constructionPalaceSign(b, x, y, z, facing, es, en, mount = 'post') {
    b.set(x, y, z, shapeStateName('sign', BLOCK_SHAPES.sign, { facing: b.facing(facing), mount }), { t: `${es} // ${en}` });
}

// Checks a stock against the limits the server keeps (construction_stock.go); throws with the reason.
function constructionPalaceStockCheck(items, slots) {
    if (!Array.isArray(items) || items.length === 0) throw new Error('A stock with nothing in it');
    if (items.length > slots) throw new Error(`${items.length} stacks in ${slots} slots`);
    let total = 0;
    for (const [type, count] of items) {
        if (typeof type !== 'string' || !Number.isInteger(count) || count < 1 || count > CONSTRUCTION_STOCK_MAX) throw new Error(`A stack of ${count} ${type}`);
        total += count;
    }
    if (total > CONSTRUCTION_STOCK_TOTAL) throw new Error(`${total} items in one block`);
}

function constructionPalaceChest(b, x, y, z, facing, items, kind = 'chest') {
    const slots = (typeof STORAGE_KINDS === 'object' && STORAGE_KINDS[kind]) || 27;
    constructionPalaceStockCheck(items, slots);
    if (kind === 'barrel') b.set(x, y, z, 'barrel');
    else b.shaped(x, y, z, kind, kind, { facing: b.facing(facing) });
    b.stock(x, y, z, items);
}

// The site: as constructionCastleSite, for any box, rim and theme (see the header).
function constructionPalaceSite({ label, theme, groundY, rim = CONSTRUCTION_PALACE_RIM, maxEarth, maxRelief = CONSTRUCTION_PALACE_MAX_RELIEF, maxWater = CONSTRUCTION_PALACE_MAX_WATER }) {
    const land = constructionPalaceTheme(theme);
    return function* constructionPalaceSiteSteps({ readType, blockTypes, min, size, turns, anchor, fromY }) {
        const [w, h, d] = size;
        const earthLimit = maxEarth === undefined ? Math.round(CONSTRUCTION_PALACE_EARTH_PER_COLUMN * w * d) : maxEarth;
        const scanTop = Math.min(WORLD_MAX_Y, fromY + 80);
        const heights = new Int16Array(w * d);
        const counts = new Map();
        let waterColumns = 0;
        for (let z = 0; z < d; z++) {
            for (let x = 0; x < w; x++) {
                let y = scanTop;
                let type = null;
                for (; y >= WORLD_MIN_Y; y--) {
                    type = readType(min.x + x, y, min.z + z);
                    if (type === 'water' || constructionIsGround(type, blockTypes)) break;
                }
                if (y === scanTop && type !== 'water') return { refuse: `${label}: there is a mountain in the way. Find open ground` };
                heights[z * w + x] = y;
                if (type === 'water') waterColumns++;
                counts.set(y, (counts.get(y) || 0) + 1);
            }
            yield;
        }
        if (waterColumns > maxWater * w * d) return { refuse: `${label}: this is mostly water (${Math.round((100 * waterColumns) / (w * d))} %). Find a shore, or dry ground` };

        const anchorGround = constructionFindGround(readType, anchor.x, anchor.z, fromY, blockTypes);
        if (anchorGround === null) return { refuse: `${label}: there is no ground ahead of you` };
        let seen = 0;
        let middle = anchorGround;
        for (const y of [...counts.keys()].sort((a, b) => a - b)) {
            seen += counts.get(y);
            if (seen * 2 >= w * d) {
                middle = y;
                break;
            }
        }
        // The road climbs one a column at most.
        const reach = rim - 2;
        const level = Math.max(anchorGround - reach, Math.min(anchorGround + reach, middle));
        const baseY = level - groundY;

        let earth = 0;
        let relief = 0;
        for (let i = 0; i < heights.length; i++) {
            earth += Math.abs(heights[i] - level);
            relief = Math.max(relief, Math.abs(heights[i] - level));
        }
        if (relief > maxRelief) return { refuse: `${label}: the land here rises or falls ${relief} blocks from the palace's level. Find flatter ground` };
        if (earth > earthLimit) return { refuse: `${label}: levelling this site means moving ${earth} blocks of earth. Find flatter ground` };

        const [fx, fz] = SHAPE_DIRECTIONS[CONSTRUCTION_FACINGS[(CONSTRUCTION_FACINGS.indexOf('s') + turns) % 4]];
        const stairs = (facing) => constructionTurnType(shapeStateName(land.roadStairs, BLOCK_SHAPES.stairs, { facing, half: 'bottom' }), turns, blockTypes);
        const roadTop = (z) => Math.round(anchorGround + ((level - anchorGround) * (z + 1)) / (rim + 1));
        // In local terms: how far in from the near edge, and across its middle.
        const awayOf = (x, z) => fx * (x - anchor.x) + fz * (z - anchor.z);
        const acrossOf = (x, z) => fz * (x - anchor.x) - fx * (z - anchor.z);
        const rimOf = (lx, lz) => Math.min(lx, w - 1 - lx, lz, d - 1 - lz);
        const onRoad = (x, z, margin) => {
            const away = awayOf(x, z);
            return away >= -margin && away < rim + margin && Math.abs(acrossOf(x, z)) <= 2 + margin;
        };
        // The height of the rim's surface, column by column (the road's own is roadTop).
        const tops = new Int16Array(w * d);
        for (let lz = 0; lz < d; lz++) {
            for (let lx = 0; lx < w; lx++) {
                const r = rimOf(lx, lz);
                if (r >= rim) continue;
                const ground = heights[lz * w + lx];
                tops[lz * w + lx] = Math.round(level + ((ground - level) * (rim - r)) / (rim + 1));
            }
        }
        yield;
        // What grows on the slope: kept by column, and only where it stands over that column's surface and
        // under the top of the box.
        const above = new Map();
        const put = (lx, y, lz, type, soft) => {
            if (lx < 0 || lx >= w || lz < 0 || lz >= d || rimOf(lx, lz) >= rim) return;
            if (y <= tops[lz * w + lx] || y >= baseY + h) return;
            const key = lz * w + lx;
            if (!above.has(key)) above.set(key, new Map());
            const column = above.get(key);
            if (soft && column.has(y)) return;
            column.set(y, type);
        };
        const room = CONSTRUCTION_PALACE_DECOR_REACH;
        for (let lz = 0; lz < d; lz++) {
            for (let lx = 0; lx < w; lx++) {
                const r = rimOf(lx, lz);
                if (r < room || r > rim - room - 1) continue;
                const [x, z] = [min.x + lx, min.z + lz];
                if (onRoad(x, z, room) || constructionPalaceHash(x, 0, z, 41) >= land.density) continue;
                constructionPalaceTree(put, constructionPalacePick(land.decor, x, 0, z, 43), lx, tops[lz * w + lx] + 1, lz, 47);
            }
        }
        // Nothing on the road, nor right beside it.
        for (const key of [...above.keys()]) {
            const [lx, lz] = [key % w, Math.floor(key / w)];
            if (onRoad(min.x + lx, min.z + lz, 1)) above.delete(key);
        }

        const grade = (x, z) => {
            const lx = x - min.x;
            const lz = z - min.z;
            if (rimOf(lx, lz) >= rim) return null;
            const away = awayOf(x, z);
            if (away >= 0 && away < rim && Math.abs(acrossOf(x, z)) <= 2) {
                const top = roadTop(away);
                const up = roadTop(away - 1) < top;
                const down = roadTop(away + 1) < top;
                return { top, type: up ? stairs('s') : down ? stairs('n') : land.road, keep: false, soil: land.soil };
            }
            const top = tops[lz * w + lx];
            return { top, type: constructionPalacePick(land.ground, x, top, z, 53), keep: false, soil: land.soil, above: above.get(lz * w + lx) };
        };
        return { baseY, grade };
    };
}
