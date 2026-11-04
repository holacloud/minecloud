// Non-cube blocks: shapes (stairs, doors, fences, panes...) and block states.
//
// A block type with `shape: 'stairs'` is meshed and collided as a list of boxes instead of a
// unit cube. A box is [x0, y0, z0, x1, y1, z1] in block units from the cell's minimum corner;
// collision boxes may rise above 1 (fences and gates: 1.5, so animals cannot jump them).
//
// State lives in the block NAME. Every combination of a shape's `states` becomes its own block
// type when the world starts (expandBlockStates):
//
//     oak_stairs                     the item, and the block in its default (first) state
//     oak_stairs:e:bottom            facing east, lower half
//     oak_door:upper:n:left:open     upper half of a door, facing north, hinge left, open
//
// so orientation and open/closed travel through the chunk palettes, the blockPlace messages
// and the saved chunks exactly like any other block. The server needs no list of them, and
// worlds saved before shapes existed load unchanged (no existing name changes). Connections
// to neighbours (fences, panes) are never stored: they are worked out from the four horizontal
// neighbours whenever the block is meshed or collided, so they follow every edit.
//
// Facings are compass directions, n = -z, e = +x, s = +z, w = -x. Shapes are written facing
// north and rotated with rotateShapeBox.
//
// Loaded by the page after extensions.js (registerBlockShape) and before world.js. The pure
// functions here have no THREE dependency, so Node tests can load this file directly.

const SHAPE_FACINGS = ['n', 'e', 's', 'w'];
const SHAPE_DIRECTIONS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const SHAPE_OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };
// Connection mask bits, in SHAPE_FACINGS order.
const SHAPE_MASK = { n: 1, e: 2, s: 4, w: 8 };
const SHAPE_EMPTY = Object.freeze([]);

// Rotates a box written facing north to `facing` (quarter turns about the cell's vertical axis).
function rotateShapeBox(box, facing) {
    const [x0, y0, z0, x1, y1, z1] = box;
    let ax, az, bx, bz;
    switch (facing) {
        case 'e': ax = 1 - z0; az = x0; bx = 1 - z1; bz = x1; break;
        case 's': ax = 1 - x0; az = 1 - z0; bx = 1 - x1; bz = 1 - z1; break;
        case 'w': ax = z0; az = 1 - x0; bx = z1; bz = 1 - x1; break;
        default: return box.slice();
    }
    return [Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz)];
}

function rotateShapeBoxes(boxes, facing) {
    return boxes.map((box) => rotateShapeBox(box, facing));
}

// Dominant horizontal direction of a vector (the way the player looks, a face normal...).
function shapeFacingFromVector(x, z) {
    if (Math.abs(x) > Math.abs(z)) return x > 0 ? 'e' : 'w';
    return z > 0 ? 's' : 'n';
}

function shapeStateCombinations(states) {
    let combos = [{}];
    for (const [key, values] of states || []) {
        const next = [];
        for (const combo of combos) {
            for (const value of values) next.push({ ...combo, [key]: value });
        }
        combos = next;
    }
    return combos;
}

// Block name of `base` in `state`; the default state is the base name itself.
function shapeStateName(base, shape, state) {
    const states = shape.states || [];
    if (states.every(([key, values]) => state[key] === values[0])) return base;
    return [base, ...states.map(([key]) => state[key])].join(':');
}

// Adds one block type per state combination of every shaped block (see the header). Variants
// copy their base, drop the base item, share its materials (unless materialKey says otherwise)
// and point back with `variantOf`, which keeps them out of inventories and recipes.
function expandBlockStates(blockTypes) {
    for (const [base, def] of Object.entries(blockTypes)) {
        if (!def.shape || def.variantOf) continue;
        const shape = BLOCK_SHAPES[def.shape];
        if (!shape) {
            console.warn(`Unknown block shape "${def.shape}" for ${base}`);
            continue;
        }
        for (const state of shapeStateCombinations(shape.states)) {
            const name = shapeStateName(base, shape, state);
            const extra = shape.variant ? shape.variant(state, def) : {};
            const suffix = shape.materialKey ? shape.materialKey(state, def) : null;
            const key = def.materialKey || base;
            const variant = {
                ...def,
                ...extra,
                state,
                materialKey: suffix ? `${key}#${suffix}` : key
            };
            if (name !== base) {
                variant.variantOf = base;
                if (!Object.prototype.hasOwnProperty.call(def, 'dropType')) variant.dropType = base;
            }
            blockTypes[name] = variant;
        }
    }
}

// Per-world view of the shaped blocks, by registry id, with cached boxes per connection mask.
class BlockShapeSet {
    constructor(blockTypes, registry) {
        this.blockTypes = blockTypes;
        this.registry = registry;
        const count = registry.names.length;
        this.shapes = new Array(count).fill(null);
        this.defs = new Array(count).fill(null);
        // Solid full-height cubes (not shaped): fences and panes join them.
        this.cube = new Uint8Array(count);
        for (let id = 1; id < count; id++) {
            const def = blockTypes[registry.names[id]];
            this.defs[id] = def;
            this.shapes[id] = def && def.shape ? BLOCK_SHAPES[def.shape] || null : null;
            this.cube[id] = !this.shapes[id] && registry.solid[id] && registry.height[id] === 1 ? 1 : 0;
        }
        this.boxCache = new Map();
        this.collisionCache = new Map();
        this.fullBoxes = new Array(count).fill(SHAPE_EMPTY);
        for (let id = 1; id < count; id++) {
            if (registry.solid[id] && !this.shapes[id]) this.fullBoxes[id] = Object.freeze([[0, 0, 0, 1, registry.height[id], 1]]);
        }
    }

    isShaped(id) {
        return this.shapes[id] !== null && this.shapes[id] !== undefined;
    }

    // Which of the four horizontal neighbours (ids in n, e, s, w order) block `id` joins.
    mask(id, n, e, s, w) {
        const shape = this.shapes[id];
        if (!shape || !shape.connects) return 0;
        const def = this.defs[id];
        const neighbours = [n, e, s, w];
        let mask = 0;
        for (let i = 0; i < 4; i++) {
            const other = neighbours[i];
            if (!other) continue;
            if (shape.connects(def, { def: this.defs[other], cube: this.cube[other] === 1 }, SHAPE_FACINGS[i])) {
                mask |= 1 << i;
            }
        }
        return mask;
    }

    boxes(id, mask = 0) {
        const shape = this.shapes[id];
        if (!shape) return this.registry.solid[id] ? this.fullBoxes[id] : [[0, 0, 0, 1, 1, 1]];
        const key = id * 16 + mask;
        let boxes = this.boxCache.get(key);
        if (!boxes) {
            boxes = shape.boxes(this.defs[id].state || {}, mask, this.defs[id]);
            this.boxCache.set(key, boxes);
        }
        return boxes;
    }

    // Boxes that stop players and mobs (empty for blocks you walk through).
    collision(id, mask = 0) {
        if (!this.registry.solid[id]) return SHAPE_EMPTY;
        const shape = this.shapes[id];
        if (!shape) return this.fullBoxes[id];
        const key = id * 16 + mask;
        let boxes = this.collisionCache.get(key);
        if (!boxes) {
            const state = this.defs[id].state || {};
            boxes = shape.collision ? shape.collision(state, mask, this.defs[id]) : shape.boxes(state, mask, this.defs[id]);
            this.collisionCache.set(key, boxes);
        }
        return boxes;
    }

    // Collision height of a shape in its default connections (placement checks, old callers).
    maxHeight(id) {
        let top = 0;
        for (const box of this.collision(id, 0)) top = Math.max(top, box[4]);
        return top;
    }
}

// ---------------------------------------------------------------------------------------
// Inventory icons: boxes drawn in the same isometric view as drawCubeIcon (blockTextures.js).

// faces: { top, side, left } canvases (left, optional: the +z face, a piece's front). The view
// looks from +x +z, so the visible faces of each box are its top, its +z face (left) and its +x
// face (right). fit: the shape fills the icon instead of keeping a cube's scale (small things).
function drawShapeIcon(ctx, size, boxes, faces, fit = false) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const project = (x, y, z) => [x - z, (x + z) * 0.5 - y * 1.15];
    for (const [x0, y0, z0, x1, y1, z1] of boxes) {
        for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
            const [px, py] = project(x, y, z);
            minX = Math.min(minX, px); maxX = Math.max(maxX, px);
            minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        }
    }
    // Same scale as a full cube icon (0.86 of the icon wide), smaller if the shape is taller.
    const scale = Math.min(fit ? (size * 0.86) / Math.max(1e-6, maxX - minX) : size * 0.43, (size * 0.94) / Math.max(1e-6, maxY - minY));
    const offsetX = size / 2 - ((minX + maxX) / 2) * scale;
    const offsetY = size / 2 - ((minY + maxY) / 2) * scale;
    const point = (x, y, z) => {
        const [px, py] = project(x, y, z);
        return [offsetX + px * scale, offsetY + py * scale];
    };
    const drawFace = (img, src, a, b, c, shade) => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.lineTo(b[0] + c[0] - a[0], b[1] + c[1] - a[1]);
        ctx.lineTo(c[0], c[1]);
        ctx.closePath();
        ctx.clip();
        const [sx, sy, sw, sh] = src.map((value, i) => value * (i % 2 === 0 ? img.width : img.height));
        const w = Math.max(1e-3, sw);
        const h = Math.max(1e-3, sh);
        ctx.setTransform((b[0] - a[0]) / w, (b[1] - a[1]) / w, (c[0] - a[0]) / h, (c[1] - a[1]) / h, a[0], a[1]);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (shade) {
            ctx.fillStyle = `rgba(0,0,0,${shade})`;
            ctx.fill();
        }
        ctx.restore();
    };
    // Painter's order: far (low x + z, low y) boxes first.
    const ordered = boxes.slice().sort((a, b) => (a[0] + a[3] + a[2] + a[5] + a[1] + a[4]) - (b[0] + b[3] + b[2] + b[5] + b[1] + b[4]));
    const clampV = (v) => Math.min(1, Math.max(0, v));
    for (const [x0, y0, z0, x1, y1, z1] of ordered) {
        const top = Math.min(y1, 1);
        // Top: image x runs towards -z, image y towards +x (as in drawCubeIcon).
        drawFace(faces.top, [1 - z1, x0, z1 - z0, x1 - x0], point(x0, y1, z1), point(x0, y1, z0), point(x1, y1, z1), 0);
        // +z face (left): image x along +x, image y downwards.
        drawFace(faces.left || faces.side, [x0, clampV(1 - top), x1 - x0, Math.max(0.05, top - y0)], point(x0, y1, z1), point(x1, y1, z1), point(x0, y0, z1), 0.22);
        // +x face (right): image x along -z, image y downwards.
        drawFace(faces.side, [1 - z1, clampV(1 - top), z1 - z0, Math.max(0.05, top - y0)], point(x1, y1, z1), point(x1, y1, z0), point(x1, y0, z1), 0.38);
    }
}

// ---------------------------------------------------------------------------------------
// Built-in shapes

const PX = 1 / 16;

// Stairs: a bottom slab plus a half-height step on the side they face (the player walks up
// them facing that way). Upside-down (half: top) when placed against a ceiling or the upper
// half of a wall.
registerBlockShape('stairs', {
    states: [['facing', SHAPE_FACINGS], ['half', ['bottom', 'top']]],
    boxes(state) {
        const boxes = state.half === 'top'
            ? [[0, 0.5, 0, 1, 1, 1], [0, 0, 0, 1, 0.5, 0.5]]
            : [[0, 0, 0, 1, 0.5, 1], [0, 0.5, 0, 1, 1, 0.5]];
        return rotateShapeBoxes(boxes, state.facing);
    },
    place(ctx) {
        const top = ctx.normal.y < -0.5 || (Math.abs(ctx.normal.y) < 0.5 && ctx.hit.y - ctx.y > 0.5);
        return [{ dx: 0, dy: 0, dz: 0, state: { facing: shapeFacingFromVector(ctx.look.x, ctx.look.z), half: top ? 'top' : 'bottom' } }];
    },
    iconState: { facing: 'n', half: 'bottom' }
});

// Doors: two cells tall (two blocks, linked), a 3-pixel panel on the side nearest the player
// who placed it. Open, the panel swings onto the hinge side and stops blocking the doorway.
const DOOR_THICKNESS = 3 * PX;
registerBlockShape('door', {
    states: [['half', ['lower', 'upper']], ['facing', SHAPE_FACINGS], ['hinge', ['left', 'right']], ['open', ['closed', 'open']]],
    boxes(state) {
        const t = DOOR_THICKNESS;
        let box;
        if (state.open !== 'open') box = [0, 0, 1 - t, 1, 1, 1];
        else box = state.hinge === 'left' ? [0, 0, 0, t, 1, 1] : [1 - t, 0, 0, 1, 1, 1];
        return [rotateShapeBox(box, state.facing)];
    },
    variant(state, def) {
        const faces = def.doorFaces ? def.doorFaces[state.half] : null;
        return faces ? { faces } : {};
    },
    materialKey(state) {
        return state.half;
    },
    place(ctx) {
        if (!ctx.isFree(ctx.x, ctx.y + 1, ctx.z) || !ctx.isSolid(ctx.x, ctx.y - 1, ctx.z)) return null;
        const facing = shapeFacingFromVector(ctx.look.x, ctx.look.z);
        const [fx, fz] = SHAPE_DIRECTIONS[facing];
        // "Right" of a player looking towards `facing`.
        const rx = -fz;
        const rz = fx;
        // Next to another door facing the same way: hinge on the outer side (double doors).
        const doorAt = (x, z) => {
            const def = ctx.defAt(x, ctx.y, z);
            return def && def.shape === 'door' && def.state && def.state.facing === facing ? def : null;
        };
        let hinge;
        if (doorAt(ctx.x - rx, ctx.z - rz)) hinge = 'right';
        else if (doorAt(ctx.x + rx, ctx.z + rz)) hinge = 'left';
        else hinge = (ctx.hit.x - (ctx.x + 0.5)) * rx + (ctx.hit.z - (ctx.z + 0.5)) * rz > 0 ? 'right' : 'left';
        return [
            { dx: 0, dy: 0, dz: 0, state: { half: 'lower', facing, hinge, open: 'closed' } },
            { dx: 0, dy: 1, dz: 0, state: { half: 'upper', facing, hinge, open: 'closed' } }
        ];
    },
    linked(state) {
        return state.half === 'lower' ? [[0, 1, 0]] : [[0, -1, 0]];
    },
    toggle(state) {
        return { ...state, open: state.open === 'open' ? 'closed' : 'open' };
    },
    iconState: { half: 'lower', facing: 'n', hinge: 'left', open: 'closed' }
});

// Trapdoors: a 3-pixel hatch in the bottom or top of the cell, hinged on the `facing` side;
// open, it stands up against that side.
registerBlockShape('trapdoor', {
    states: [['facing', SHAPE_FACINGS], ['half', ['bottom', 'top']], ['open', ['closed', 'open']]],
    boxes(state) {
        const t = DOOR_THICKNESS;
        let box;
        if (state.open === 'open') box = [0, 0, 0, 1, 1, t];
        else box = state.half === 'top' ? [0, 1 - t, 0, 1, 1, 1] : [0, 0, 0, 1, t, 1];
        return [rotateShapeBox(box, state.facing)];
    },
    place(ctx) {
        const horizontal = Math.abs(ctx.normal.y) < 0.5;
        // Against a wall it hinges on the wall; on a floor or ceiling, on the side nearest you.
        const facing = horizontal ? shapeFacingFromVector(-ctx.normal.x, -ctx.normal.z) : shapeFacingFromVector(-ctx.look.x, -ctx.look.z);
        const top = ctx.normal.y < -0.5 || (horizontal && ctx.hit.y - ctx.y > 0.5);
        return [{ dx: 0, dy: 0, dz: 0, state: { facing, half: top ? 'top' : 'bottom', open: 'closed' } }];
    },
    toggle(state) {
        return { ...state, open: state.open === 'open' ? 'closed' : 'open' };
    },
    iconState: { facing: 'n', half: 'bottom', open: 'closed' }
});

// Fences: a post that grows two rails towards every neighbouring fence, gate (in line with it)
// or solid cube. They collide 1.5 blocks high: players and animals cannot jump over them.
const FENCE_POST = [6 * PX, 0, 6 * PX, 10 * PX, 1, 10 * PX];
const FENCE_RAILS_N = [[7 * PX, 6 * PX, 0, 9 * PX, 9 * PX, 6 * PX], [7 * PX, 12 * PX, 0, 9 * PX, 15 * PX, 6 * PX]];
const BARRIER_HEIGHT = 1.5;

function shapeGateAxisJoins(otherDef, dir) {
    // A gate facing north or south spans east-west, so it joins neighbours to its east or west.
    if (!otherDef || otherDef.shape !== 'fence_gate' || !otherDef.state) return false;
    const gateAlongX = otherDef.state.facing === 'n' || otherDef.state.facing === 's';
    return gateAlongX ? dir === 'e' || dir === 'w' : dir === 'n' || dir === 's';
}

registerBlockShape('fence', {
    boxes(state, mask) {
        const boxes = [FENCE_POST.slice()];
        SHAPE_FACINGS.forEach((dir) => {
            if (mask & SHAPE_MASK[dir]) boxes.push(...rotateShapeBoxes(FENCE_RAILS_N, dir));
        });
        return boxes;
    },
    collision(state, mask) {
        const boxes = [[6 * PX, 0, 6 * PX, 10 * PX, BARRIER_HEIGHT, 10 * PX]];
        SHAPE_FACINGS.forEach((dir) => {
            if (mask & SHAPE_MASK[dir]) boxes.push(rotateShapeBox([6 * PX, 0, 0, 10 * PX, BARRIER_HEIGHT, 6 * PX], dir));
        });
        return boxes;
    },
    connects(def, other, dir) {
        return Boolean(other.cube || (other.def && other.def.shape === 'fence') || shapeGateAxisJoins(other.def, dir));
    },
    iconMask: SHAPE_MASK.e | SHAPE_MASK.w
});

// Fence gates: a gate in line with the fence, opening away from the player (it swings to the
// far side whichever side you open it from). Closed it is a 1.5-high barrier; open, nothing.
registerBlockShape('fence_gate', {
    states: [['facing', SHAPE_FACINGS], ['open', ['closed', 'open']]],
    boxes(state) {
        const posts = [[0, 5 * PX, 7 * PX, 2 * PX, 1, 9 * PX], [14 * PX, 5 * PX, 7 * PX, 1, 1, 9 * PX]];
        let leaves;
        if (state.open === 'open') {
            leaves = [];
            for (const [x0, x1] of [[0, 2 * PX], [14 * PX, 1]]) {
                leaves.push([x0, 6 * PX, 3 * PX, x1, 9 * PX, 7 * PX], [x0, 12 * PX, 3 * PX, x1, 15 * PX, 7 * PX], [x0, 6 * PX, 1 * PX, x1, 15 * PX, 3 * PX]);
            }
        } else {
            leaves = [
                [2 * PX, 6 * PX, 7 * PX, 14 * PX, 9 * PX, 9 * PX],
                [2 * PX, 12 * PX, 7 * PX, 14 * PX, 15 * PX, 9 * PX],
                [6 * PX, 9 * PX, 7 * PX, 7 * PX, 12 * PX, 9 * PX],
                [9 * PX, 9 * PX, 7 * PX, 10 * PX, 12 * PX, 9 * PX]
            ];
        }
        return rotateShapeBoxes([...posts, ...leaves], state.facing);
    },
    collision(state) {
        if (state.open === 'open') return [];
        return [rotateShapeBox([0, 0, 6 * PX, 1, BARRIER_HEIGHT, 10 * PX], state.facing)];
    },
    variant(state) {
        // Open gates are walked through (and do not count as a wall for mobs).
        return state.open === 'open' ? { solid: false } : {};
    },
    place(ctx) {
        return [{ dx: 0, dy: 0, dz: 0, state: { facing: shapeFacingFromVector(ctx.look.x, ctx.look.z), open: 'closed' } }];
    },
    toggle(state, ctx) {
        if (state.open === 'open') return { ...state, open: 'closed' };
        // Opening from the far side flips it, so it always swings away from the player.
        const [fx, fz] = SHAPE_DIRECTIONS[state.facing];
        const away = ctx && ctx.look && fx * ctx.look.x + fz * ctx.look.z < 0;
        return { facing: away ? SHAPE_OPPOSITE[state.facing] : state.facing, open: 'open' };
    },
    iconState: { facing: 'n', open: 'closed' }
});

// Signs: a post with a small board on it, or against a wall the board alone (clicking a block's
// side). They look at the player who places them. Only the post stops you. The text goes on a
// bigger board of its own, drawn when the chunk is (WorldRenderer.createSignLabel). The text is kept
// by position; its first state is the plain name `sign`, which is what saved worlds have.
function isSignBlockType(type) {
    return type === 'sign' || (typeof type === 'string' && type.startsWith('sign:'));
}

registerBlockShape('sign', {
    states: [['facing', SHAPE_FACINGS], ['mount', ['post', 'wall']]],
    boxes(state) {
        const boxes = state.mount === 'wall'
            ? [[PX, 4 * PX, 15 * PX, 15 * PX, 12 * PX, 1]]
            : [[7 * PX, 0, 7 * PX, 9 * PX, 1, 9 * PX], [PX, 8 * PX, 7 * PX, 15 * PX, 15.5 * PX, 9 * PX]];
        return rotateShapeBoxes(boxes, state.facing);
    },
    collision(state) {
        return state.mount === 'wall' ? [] : [[6.5 * PX, 0, 6.5 * PX, 9.5 * PX, 1, 9.5 * PX]];
    },
    variant(state) {
        return state.mount === 'wall' ? { solid: false } : {};
    },
    place(ctx) {
        if (Math.abs(ctx.normal.y) < 0.5) {
            return [{ dx: 0, dy: 0, dz: 0, state: { facing: shapeFacingFromVector(ctx.normal.x, ctx.normal.z), mount: 'wall' } }];
        }
        return [{ dx: 0, dy: 0, dz: 0, state: { facing: shapeFacingFromVector(-ctx.look.x, -ctx.look.z), mount: 'post' } }];
    },
    iconState: { facing: 's', mount: 'post' }
});

// Beds: legs, a frame, a mattress and a pillow at the head, in one cell, the head away from the
// player who places it (`facing` is the way the head lies; the plain name `bed`, what saved worlds
// have, looks north). You stand on the mattress. Lying down is js/game/seating.js (`lieDown`).
function isBedBlockType(type) {
    return type === 'bed' || (typeof type === 'string' && type.startsWith('bed:'));
}

registerBlockShape('bed', {
    states: [['facing', SHAPE_FACINGS]],
    boxes(state) {
        return rotateShapeBoxes([
            [PX, 0, PX, 3 * PX, 2 * PX, 3 * PX], [13 * PX, 0, PX, 15 * PX, 2 * PX, 3 * PX],
            [PX, 0, 13 * PX, 3 * PX, 2 * PX, 15 * PX], [13 * PX, 0, 13 * PX, 15 * PX, 2 * PX, 15 * PX],
            [0, 2 * PX, 0, 1, 4 * PX, 1],
            [PX, 4 * PX, PX / 2, 15 * PX, 9 * PX, 15.5 * PX],
            [3 * PX, 9 * PX, PX, 13 * PX, 11 * PX, 5.5 * PX]
        ], state.facing);
    },
    collision: () => [[0, 0, 0, 1, 9 * PX, 1]],
    // A top does not turn with its box, so each way has its own, with the pillow at the head.
    variant: (state, def) => ({ faces: { ...def.faces, top: `bed_top_${state.facing}` } }),
    materialKey: (state) => state.facing,
    place: (ctx) => [{ dx: 0, dy: 0, dz: 0, state: { facing: shapeFacingFromVector(ctx.look.x, ctx.look.z) } }],
    iconState: { facing: 'n' }
});

// Panes (glass panes, iron bars): a 2-pixel sheet that joins neighbouring panes and solid
// cubes. A pane with one neighbour runs straight through; on its own it shows as a cross.
const PANE_POST = [7 * PX, 0, 7 * PX, 9 * PX, 1, 9 * PX];
const PANE_ARM_N = [7 * PX, 0, 0, 9 * PX, 1, 7 * PX];
registerBlockShape('pane', {
    boxes(state, mask) {
        let joined = mask;
        if (joined === 0) joined = 15;
        else if (joined === SHAPE_MASK.n || joined === SHAPE_MASK.s) joined = SHAPE_MASK.n | SHAPE_MASK.s;
        else if (joined === SHAPE_MASK.e || joined === SHAPE_MASK.w) joined = SHAPE_MASK.e | SHAPE_MASK.w;
        const boxes = [PANE_POST.slice()];
        SHAPE_FACINGS.forEach((dir) => {
            if (joined & SHAPE_MASK[dir]) boxes.push(rotateShapeBox(PANE_ARM_N, dir));
        });
        return boxes;
    },
    connects(def, other) {
        return Boolean(other.cube || (other.def && other.def.shape === 'pane'));
    },
    iconMask: SHAPE_MASK.e | SHAPE_MASK.w
});
