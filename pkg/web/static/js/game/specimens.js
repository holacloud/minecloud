// The things under the microscope that are not alive: a shaving of wood, grains of sand, a thin section of
// rock, crystals of salt, a feather, a chip on its board... (js/game/microscope.js shows them, js/game/microbes.js
// holds the living). Nothing here touches the game or the page, so it runs on any canvas and under Node.
// - MICRO_SPECIMENS: the items that go on a slide for themselves, each with its kind of drawing and what makes
//   it itself (params). They mirror microscopeSpecimens in pkg/network/microscope_specimens.go
//   (test/js/microscope_specimens.test.js checks both, and that every one is a real item).
// - A specimen is not an organism: it is drawn as one sheet that fills the slide, in micrometres, the same
//   for everyone who looks (the slide's seed). What is seen at each power is just what is that big: rings and
//   vessels at 40x, cells at 400x, their walls at 1000x. Each kind draws only what is at least a pixel or two.
// - It is costly to draw, so it is drawn once into a canvas a little larger than the field, and that canvas is
//   only redrawn when the stage leaves it, or the power, the stain or dark-field change (microDrawSpecimen).
//   Each frame is then one drawImage per layer: cheap on a phone.
// - Thick things (grains of sand, crystals, pollen) lie at more than one depth: each depth is a layer with its
//   own canvas, and the focus picks which is sharp, as it does for the organisms.
// - Stains and dark-field go through the same lens as the organisms (MicroLens, microbes.js): a stain's
//   entry here says how far each kind takes the dye, and which parts stand out (starch: blue-black with iodine;
//   nucleus: dark blue with methylene blue). Minerals, metals and glass take none.
// - What is opaque (metal, ore, a silicon wafer, a mirror's silver) lets no light through: it is black by
//   transmitted light. At 40x the objective stands far enough off for the room's light to show its surface;
//   the closer the lens comes at higher powers, the less of that light gets in (MICRO_SPECIMEN_TOPLIGHT).
//   Metallurgists and geologists use a microscope that lights through the objective itself for that.

// How much of the room's light reaches the top of the slide at each power, for what is opaque.
const MICRO_SPECIMEN_TOPLIGHT = { 40: 0.85, 100: 0.5, 400: 0.1, 1000: 0.02 };

// ---------------------------------------------------------------------------------------
// Small tools

function spHash(x, y, s) {
    let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function spRng(x, y, s) {
    return microRng(Math.floor(spHash(x, y, s) * 4294967296));
}

function C(r, g, b, a = 1) {
    return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${Math.round(a * 1000) / 1000})`;
}

// A colour seen by the room's light on an opaque surface: black where none gets in.
function spLit(A, r, g, b, a = 0.97) {
    const lit = A.lit;
    return C(10 + (r - 10) * lit, 9 + (g - 9) * lit, 8 + (b - 8) * lit, a);
}

// A line at least about a pixel wide, in micrometres.
function spW(A, microns) {
    return Math.max(microns, A.px * 0.9);
}

// Every cell of a grid that touches the area (with a margin), each with its own random numbers.
function spEach(A, cell, margin, salt, fn) {
    const i0 = Math.floor((A.x0 - margin) / cell);
    const i1 = Math.floor((A.x1 + margin) / cell);
    const j0 = Math.floor((A.y0 - margin) / cell);
    const j1 = Math.floor((A.y1 + margin) / cell);
    for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) fn(i, j, spRng(i, j, A.seed + salt));
    }
}

function spPoly(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
}

function spLine(ctx, x0, y0, x1, y1) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
}

// A rounded blob of radius r around (x, y), n points, lumpy by `rough`.
function spBlob(random, x, y, r, n = 9, rough = 0.25, stretch = 1, turn = 0) {
    const points = [];
    for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const reach = r * (1 - rough / 2 + random() * rough);
        const px = Math.cos(angle) * reach * stretch;
        const py = Math.sin(angle) * reach;
        points.push([x + px * Math.cos(turn) - py * Math.sin(turn), y + px * Math.sin(turn) + py * Math.cos(turn)]);
    }
    return points;
}

// An angular fragment: few corners, sharp.
function spShard(random, x, y, r, n = 6, turn = 0) {
    const points = [];
    for (let i = 0; i < n; i++) {
        const angle = turn + ((i + random() * 0.6) / n) * Math.PI * 2;
        const reach = r * (0.55 + random() * 0.55);
        points.push([x + Math.cos(angle) * reach, y + Math.sin(angle) * reach]);
    }
    return points;
}

// A rectangle turned by `turn` around its centre.
function spBox(x, y, w, h, turn) {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
}

// A watertight mosaic of grains, like the crystals of a rock or a metal: rows of six-cornered cells whose
// corners are shared and jittered. fn(points, i, j, random, cx, cy) paints each.
function spMosaic(A, cell, salt, fn) {
    const corner = (j, h) => [h * cell / 2 + (spHash(h, j, A.seed + salt) - 0.5) * cell * 0.42, j * cell + (spHash(h, j, A.seed + salt + 7) - 0.5) * cell * 0.42];
    const j0 = Math.floor(A.y0 / cell) - 1;
    const j1 = Math.floor(A.y1 / cell) + 1;
    for (let j = j0; j <= j1; j++) {
        const shift = j & 1;
        const i0 = Math.floor((A.x0 / cell) - 1.5);
        const i1 = Math.floor(A.x1 / cell) + 1;
        for (let i = i0; i <= i1; i++) {
            const h = 2 * i + shift;
            const points = [corner(j, h), corner(j, h + 1), corner(j, h + 2), corner(j + 1, h + 2), corner(j + 1, h + 1), corner(j + 1, h)];
            let cx = 0;
            let cy = 0;
            for (const [px, py] of points) {
                cx += px / 6;
                cy += py / 6;
            }
            fn(points, i, j, spRng(i, j, A.seed + salt + 3), cx, cy);
        }
    }
}

// Parallel lines across a grain, clipped to it: cleavage, twins, striations.
function spHatch(ctx, A, points, cx, cy, turn, spacing, color, width, reach) {
    if (spacing * A.k < 3) return;
    ctx.save();
    spPoly(ctx, points);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = spW(A, width);
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    ctx.beginPath();
    for (let d = -reach; d <= reach; d += spacing) {
        ctx.moveTo(cx - c * reach - s * d, cy - s * reach + c * d);
        ctx.lineTo(cx + c * reach - s * d, cy + s * reach + c * d);
    }
    ctx.stroke();
    ctx.restore();
}

// A long fibre along a smooth path: its body, its edges, and what its surface shows (cuticle scales of wool
// and hair, pits of a paper fibre). path: [x, y] points; width in micrometres.
function spFibre(ctx, A, path, width, body, edge, scales) {
    if (width * A.k < 4) {
        ctx.strokeStyle = edge;
        ctx.lineWidth = spW(A, width);
        microCurve(ctx, path);
        ctx.stroke();
        return;
    }
    ctx.strokeStyle = edge;
    ctx.lineWidth = width;
    microCurve(ctx, path);
    ctx.stroke();
    ctx.strokeStyle = body;
    ctx.lineWidth = Math.max(width - 2 * spW(A, Math.max(1, width * 0.08)), width * 0.6);
    microCurve(ctx, path);
    ctx.stroke();
    if (!scales || scales.step * A.k < 4) return;
    // Short marks across the fibre, every step, a little irregular.
    ctx.strokeStyle = scales.color;
    ctx.lineWidth = spW(A, 0.6);
    ctx.beginPath();
    let carry = 0;
    for (let n = 1; n < path.length; n++) {
        const [ax, ay] = path[n - 1];
        const [bx, by] = path[n];
        const length = Math.hypot(bx - ax, by - ay);
        if (length <= 0) continue;
        const nx = -(by - ay) / length;
        const ny = (bx - ax) / length;
        for (let d = scales.step - carry; d < length; d += scales.step) {
            const t = d / length;
            const x = ax + (bx - ax) * t;
            const y = ay + (by - ay) * t;
            if (x < A.x0 - width || x > A.x1 + width || y < A.y0 - width || y > A.y1 + width) continue;
            const r = width * 0.46;
            const lean = scales.lean * width * (0.5 + 0.5 * Math.sin(x * 0.37 + y * 0.21));
            ctx.moveTo(x + nx * r, y + ny * r);
            ctx.quadraticCurveTo(x + (bx - ax) / length * lean, y + (by - ay) / length * lean, x - nx * r, y - ny * r);
        }
        carry = (carry + length) % scales.step;
    }
    ctx.stroke();
}

// A path that wanders from (x, y) in direction `turn` for `length`, in steps.
function spWander(random, x, y, turn, length, step, bend) {
    const path = [[x, y]];
    let angle = turn;
    for (let d = 0; d < length; d += step) {
        angle += (random() - 0.5) * bend;
        x += Math.cos(angle) * step;
        y += Math.sin(angle) * step;
        path.push([x, y]);
    }
    return path;
}

// Starch grains, painted in their stain's colour if iodine is on the slide.
function spStarch(ctx, A, x, y, r, rough, random) {
    microOval(ctx, x, y, r, r * (0.75 + random() * 0.25), random() * Math.PI);
    if (A.marks && A.marks.starch) {
        microMarkFill(ctx, A.marks.starch);
    } else {
        microFill(ctx, 'rgba(240,236,214,0.8)');
        if (r * A.k > 2) microStroke(ctx, 'rgba(120,110,80,0.6)', spW(A, Math.min(1, r * 0.12)));
        // The hilum and the rings of growth, seen when it is big enough.
        if (r * A.k > 10 && !rough) {
            microOval(ctx, x, y, r * 0.45, r * 0.32);
            microStroke(ctx, 'rgba(120,110,80,0.35)', spW(A, 0.4));
        }
    }
}

// A nucleus methylene blue shows; nothing otherwise.
function spNucleus(ctx, A, x, y, rx, ry, turn = 0) {
    if (!A.marks || !A.marks.nucleus) return;
    microOval(ctx, x, y, rx, ry, turn);
    microMarkFill(ctx, A.marks.nucleus);
}

// An empty space (a cell's hollow, a pore, a bubble): a stain has nothing there to colour.
function spClear(ctx, A, color) {
    if (A.marks) microMarkFill(ctx, color);
    else microFill(ctx, color);
}

// The same for a fill style set now and filled later.
function spClearStyle(ctx, A, color) {
    if (A.marks) ctx.marking = true;
    ctx.fillStyle = color;
    if (A.marks) ctx.marking = false;
}

// The background of the whole area.
function spGround(ctx, A, color) {
    ctx.fillStyle = color;
    ctx.fillRect(A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0);
}

// ---------------------------------------------------------------------------------------
// Wood: a shaving cut across the grain (a transverse section). Rings run up and down the field, the rays
// across it, from the pith outwards.

function spWood(ctx, A, p) {
    const { k } = A;
    const ring = p.ring;
    const wobble = (y) => Math.sin(y / 2300 + A.seed * 0.01) * 180 + Math.sin(y / 700 + 2) * 30;
    // Where in its ring a place is: 0 earlywood at the start, 1 the last latewood.
    const inRing = (u) => (ring ? ((u % ring) + ring) % ring / ring : 0.5);
    const late = (t) => (p.type === 'tropical' ? 0 : microClamp01((t - p.lateFrom) / (1 - p.lateFrom)));
    spGround(ctx, A, p.ground);
    const cellPx = p.cell * k;
    // Too small to see one by one: the rings are bands of denser latewood.
    if (ring && cellPx < 7) {
        ctx.fillStyle = p.lateBand;
        const step = 120;
        for (let n = Math.floor((A.x0 - 400) / ring); n <= Math.ceil((A.x1 + 400) / ring); n++) {
            const from = n * ring + ring * p.lateFrom;
            const to = (n + 1) * ring;
            ctx.beginPath();
            const ys = [];
            for (let y = A.y0 - step; y <= A.y1 + step; y += step) ys.push(y);
            ys.forEach((y, i) => (i ? ctx.lineTo(from - wobble(y), y) : ctx.moveTo(from - wobble(y), y)));
            for (let i = ys.length - 1; i >= 0; i--) ctx.lineTo(to - wobble(ys[i]), ys[i]);
            ctx.closePath();
            ctx.fill();
            // The boundary: the last row of latewood against the next spring's wide cells.
            ctx.strokeStyle = p.boundary;
            ctx.lineWidth = spW(A, 14);
            ctx.beginPath();
            ys.forEach((y, i) => (i ? ctx.lineTo(to - wobble(y), y) : ctx.moveTo(to - wobble(y), y)));
            ctx.stroke();
        }
    }
    if (cellPx >= 7) {
        // One cell at a time: the wall is the ground, the open inside (lumen) is painted over it.
        const rowH = p.cell * 0.95;
        for (let j = Math.floor(A.y0 / rowH) - 1; j <= A.y1 / rowH + 1; j++) {
            const y = j * rowH;
            const shift = wobble(y);
            const rowRandom = spRng(j, 77, A.seed);
            let u = Math.floor((A.x0 + shift - 60) / (ring || 2000)) * (ring || 2000) + rowRandom() * 4;
            const stop = A.x1 + shift + 60;
            spClearStyle(ctx, A, p.lumen);
            ctx.beginPath();
            while (u < stop) {
                const t = inRing(u);
                const lw = late(t);
                const width = p.cell * (p.type === 'conifer' ? 1.15 - lw * 0.7 : 1 - lw * 0.35) * (0.85 + rowRandom() * 0.3);
                const wall = p.wall * (1 + lw * (p.type === 'conifer' ? 2.2 : 1));
                if (u + width > A.x0 + shift - 40) {
                    const x = u - shift;
                    const h = rowH - wall;
                    ctx.rect(x + wall / 2, y + wall / 2 + (j & 1 ? rowRandom() * 3 : 0), Math.max(width - wall, 0.5), Math.max(h, 0.5));
                }
                u += width;
            }
            ctx.fill();
        }
        // The thin line between two cells (the middle lamella), only seen at the highest power.
        if (cellPx > 60) {
            ctx.strokeStyle = p.lamella;
            ctx.lineWidth = spW(A, 0.5);
            for (let j = Math.floor(A.y0 / rowH) - 1; j <= A.y1 / rowH + 1; j++) {
                ctx.beginPath();
                ctx.moveTo(A.x0, j * rowH);
                ctx.lineTo(A.x1, j * rowH);
                ctx.stroke();
            }
        }
    }
    // Rays: ribbons of living cells that run from the pith outwards, across the rings.
    const raySpace = p.raySpace;
    // Each ray is long, crossing many rings, and stops here and there where a new one begins.
    const raySegment = 1600;
    spEach(A, raySegment, raySegment, 11, (i, j0, cellRandom) => {
      for (let j = j0 * Math.round(raySegment / raySpace); j < (j0 + 1) * Math.round(raySegment / raySpace); j++) {
        const random = spRng(i, j, A.seed + 12);
        const y = j * raySpace + random() * raySpace * 0.6;
        const broad = p.broadRay && random() < p.broadRay;
        const width = broad ? 160 + random() * 120 : p.rayWidth * (0.8 + random() * 0.4);
        const x0 = i * raySegment + random() * raySegment * 0.3;
        const length = raySegment * (0.6 + random() * 0.7);
        if (random() < 0.25 && !broad) continue;
        if (width * k < 0.7) continue;
        const shift = wobble(y);
        ctx.fillStyle = broad ? p.broadColor : p.ray;
        ctx.fillRect(x0 - shift, y - width / 2, length, width);
        // Its cells, long the way the ray runs; in sapwood, iodine finds their stored starch.
        if (p.rayCell * k > 8) {
            ctx.strokeStyle = p.boundary;
            ctx.lineWidth = spW(A, 0.8);
            const rows = Math.max(1, Math.round(width / 14));
            ctx.beginPath();
            for (let r = 0; r <= rows; r++) {
                ctx.moveTo(x0 - shift, y - width / 2 + (r * width) / rows);
                ctx.lineTo(x0 - shift + length, y - width / 2 + (r * width) / rows);
            }
            for (let x = x0; x < x0 + length; x += p.rayCell) {
                ctx.moveTo(x - shift, y - width / 2);
                ctx.lineTo(x - shift, y + width / 2);
            }
            ctx.stroke();
            if (A.marks && A.marks.starch && random() < 0.7) {
                for (let x = x0 + 6; x < x0 + length; x += 5 + random() * 6) {
                    microOval(ctx, x - shift, y + (random() - 0.5) * width * 0.8, 1.6, 1.4);
                    microMarkFill(ctx, A.marks.starch);
                }
            }
        }
      }
    });
    // Vessels (pores) of a hardwood: open tubes that carried the water.
    if (p.type !== 'conifer') {
        spEach(A, p.vSpace, 300, 21, (i, j, random) => {
            const ux = i * p.vSpace + random() * p.vSpace;
            const y = j * p.vSpace + random() * p.vSpace;
            const t = inRing(ux);
            let d;
            if (p.type === 'ring') {
                if (t < 0.16) d = p.vessel * (0.75 + random() * 0.5);
                else if (random() < 0.35) d = p.vessel * 0.22 * (0.7 + random() * 0.6);
                else return;
            } else if (p.type === 'semi') {
                d = p.vessel * (1.1 - t * 0.6) * (0.7 + random() * 0.5);
                if (random() < t * 0.5) return;
            } else {
                d = p.vessel * (0.7 + random() * 0.6);
                if (random() < p.vEmpty) return;
            }
            const many = p.type === 'ring' && t < 0.16 ? 1 : random() < p.multiple ? 2 + Math.floor(random() * 2) : 1;
            for (let m = 0; m < many; m++) {
                const x = ux - wobble(y) + m * d * 0.82;
                const r = d / 2;
                if (r * k < 0.8) continue;
                if (p.paren === 'aliform' || p.paren === 'halo') {
                    // Parenchyma round the vessel, drawn out in wings sideways in acacia.
                    microOval(ctx, x, y, r * (p.paren === 'aliform' ? 1.7 : 1.45), r * (p.paren === 'aliform' ? 2.6 : 1.45));
                    microFill(ctx, p.paren === 'aliform' ? p.parenColor : p.parenColor);
                }
                microOval(ctx, x, y, r, r * (0.85 + random() * 0.2));
                spClear(ctx, A, p.vesselLumen);
                microStroke(ctx, p.vesselWall, spW(A, Math.max(3, r * 0.08)));
                // Tyloses: bubbles of the neighbouring cells that grow in and block old vessels of oak.
                if (p.tyloses && r * k > 25 && random() < 0.6) {
                    ctx.strokeStyle = p.lamella;
                    ctx.lineWidth = spW(A, 1.2);
                    for (let b = 0; b < 4; b++) {
                        const a = random() * Math.PI * 2;
                        ctx.beginPath();
                        ctx.arc(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.45, a + 1.9, a + 4.4);
                        ctx.stroke();
                    }
                }
            }
        });
        // Bands of parenchyma across a tropical wood with no seasons to make rings.
        if (p.paren === 'bands' && 8 * k > 0.7) {
            ctx.strokeStyle = p.parenColor;
            ctx.lineWidth = spW(A, 10);
            spEach(A, 420, 0, 31, (i, j, random) => {
                const x = i * 420 + random() * 300;
                ctx.beginPath();
                ctx.moveTo(x - wobble(j * 420), j * 420);
                ctx.lineTo(x - wobble(j * 420 + 420) + (random() - 0.5) * 40, j * 420 + 420);
                ctx.stroke();
            });
        }
    } else if (p.resin) {
        // Resin canals of a spruce: a hole lined with small cells that pour out the resin.
        spEach(A, 900, 100, 41, (i, j, random) => {
            if (random() > 0.5) return;
            let x = i * 900 + random() * 900;
            const y = j * 900 + random() * 900;
            if (ring) x = Math.floor(x / ring) * ring + ring * (0.75 + random() * 0.2);
            x -= wobble(y);
            const r = 30 + random() * 20;
            if (r * k < 1) return;
            microOval(ctx, x, y, r * 2, r * 2);
            microFill(ctx, p.lateBand);
            if (r * k > 6) {
                for (let n = 0; n < 9; n++) {
                    const a = (n / 9) * Math.PI * 2;
                    microOval(ctx, x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35, r * 0.45, r * 0.4, a);
                    microFill(ctx, p.lumen);
                    microStroke(ctx, p.boundary, spW(A, 1));
                }
            }
            microOval(ctx, x, y, r * 0.9, r * 0.9);
            microFill(ctx, 'rgba(250,236,170,0.85)');
            microStroke(ctx, p.boundary, spW(A, 1.5));
        });
    }
}

// ---------------------------------------------------------------------------------------
// Grains and crystals on the slide: one per cell of a grid at most, at the depth of its layer.

// Sand: rounded grains of quartz, some feldspar, a few dark grains of magnetite, flakes of mica, bits of shell.
function spSand(ctx, A) {
    const cell = 620;
    spEach(A, cell, 600, 51 + A.layer * 13, (i, j, random) => {
        if (random() < 0.25) return;
        const x = i * cell + random() * cell;
        const y = j * cell + random() * cell;
        const roll = random();
        const r = (roll < 0.06 ? 60 : 130) + random() * (roll < 0.06 ? 50 : 210);
        const turn = random() * Math.PI;
        if (r * A.k < 1) return;
        if (roll < 0.06) {
            // Magnetite: opaque, black by the light from below; it would jump to a magnet.
            spPoly(ctx, spShard(random, x, y, r, 7, turn));
            microFill(ctx, spLit(A, 70, 70, 76));
            return;
        }
        const points = spBlob(random, x, y, r, 11, roll < 0.7 ? 0.18 : 0.32, 0.85 + random() * 0.35, turn);
        microSmooth(ctx, points);
        if (roll < 0.7) {
            // Quartz: clear as glass, so mostly its rim shows; frosted by wind or polished by water.
            microFill(ctx, 'rgba(236,236,222,0.32)');
            microStroke(ctx, 'rgba(70,66,52,0.75)', spW(A, Math.max(4, r * 0.035)));
            if (r * A.k > 20) {
                microSmooth(ctx, spBlob(random, x - r * 0.1, y - r * 0.1, r * 0.82, 9, 0.15, 1, turn));
                microStroke(ctx, 'rgba(255,255,250,0.5)', spW(A, r * 0.03));
                // Cracks, and trails of tiny fluid inclusions trapped as the crystal grew.
                ctx.strokeStyle = 'rgba(90,86,70,0.45)';
                ctx.lineWidth = spW(A, 1.2);
                microCurve(ctx, spWander(random, x - r * 0.5, y, turn, r, r * 0.2, 0.8));
                ctx.stroke();
                if (r * A.k > 60) {
                    ctx.fillStyle = 'rgba(60,56,44,0.6)';
                    for (let n = 0; n < 24; n++) {
                        const t = n / 24;
                        microOval(ctx, x + (t - 0.5) * r, y + Math.sin(t * 6 + turn) * r * 0.2 + r * 0.25, 1.5 + random() * 2, 1.2 + random());
                        ctx.fill();
                    }
                }
            }
        } else if (roll < 0.86) {
            // Feldspar: cloudy, with straight cleavage cracks.
            microFill(ctx, 'rgba(226,206,176,0.55)');
            microStroke(ctx, 'rgba(90,72,48,0.75)', spW(A, Math.max(4, r * 0.035)));
            spHatch(ctx, A, points, x, y, turn + 0.3, r * 0.22, 'rgba(110,90,60,0.35)', 1.2, r * 1.4);
        } else if (roll < 0.94) {
            // Mica: a thin flat flake, golden, very clear.
            spPoly(ctx, spShard(random, x, y, r * 0.8, 6, turn));
            microFill(ctx, 'rgba(226,200,120,0.3)');
            microStroke(ctx, 'rgba(150,120,50,0.55)', spW(A, 2));
        } else {
            // A bit of shell, worn by the waves, with its growth lines.
            microFill(ctx, 'rgba(246,240,226,0.65)');
            microStroke(ctx, 'rgba(120,108,86,0.7)', spW(A, 3));
            spHatch(ctx, A, points, x, y, turn, r * 0.12, 'rgba(150,130,100,0.35)', 1, r * 1.4);
        }
    });
}

// Crystals of a salt, a mineral or an element, scattered on the slide. p.shape says their habit.
function spCrystals(ctx, A, p) {
    // A powder seen from far off: its clumps blur into bigger ones; fewer, larger, cheaper to draw.
    const far = p.shape === 'powder' && p.size * A.k < 6;
    const cell = far ? p.cell * 3 : p.cell;
    const opaque = p.opaque;
    spEach(A, cell, cell, 61 + A.layer * 17, (i, j, random) => {
        if (random() < p.empty) return;
        const x = i * cell + random() * cell;
        const y = j * cell + random() * cell;
        let r = p.size * (far ? 2.2 : 1) * (0.35 + random() * 0.85);
        const turn = random() * Math.PI * 2;
        if (A.dissolved) r *= 0.72;
        if (r * A.k < 0.7) return;
        const fill = opaque ? spLit(A, ...p.surface) : p.fill;
        const edge = opaque ? C(0, 0, 0, 0.95) : p.edge;
        const width = spW(A, Math.max(2, r * 0.05));
        let points;
        switch (p.shape) {
            case 'cube': {
                // Lying on a face, a cube is a square; some grew as hoppers, stepped in towards the middle.
                const side = r * 1.5;
                points = spBox(x, y, side, side * (0.92 + random() * 0.16), turn);
                if (A.dissolved) {
                    microSmooth(ctx, points);
                } else {
                    spPoly(ctx, points);
                }
                microFill(ctx, fill);
                microStroke(ctx, edge, width);
                if (!A.dissolved && side * A.k > 14) {
                    if (p.hopper && random() < 0.4) {
                        for (let s = 0.75; s > 0.1; s -= 0.2) {
                            spPoly(ctx, spBox(x, y, side * s, side * s, turn));
                            microStroke(ctx, p.inner, spW(A, side * 0.012));
                        }
                    } else if (p.striated) {
                        spHatch(ctx, A, points, x, y, turn + (random() < 0.5 ? 0 : Math.PI / 2), side * 0.06, opaque ? spLit(A, 120, 100, 50, 0.8) : p.inner, side * 0.01, side);
                    } else {
                        spPoly(ctx, spBox(x + side * 0.08, y - side * 0.08, side * 0.8, side * 0.8, turn));
                        microStroke(ctx, p.inner, spW(A, side * 0.015));
                    }
                }
                break;
            }
            case 'prism': {
                // A slanted prism or tablet: a parallelogram, thicker (darker) towards the middle if coloured.
                const w = r * (1.6 + random());
                const h = r * (0.6 + random() * 0.5);
                const slant = h * (0.4 + random() * 0.3);
                const c = Math.cos(turn);
                const s = Math.sin(turn);
                points = [[-w / 2 + slant, -h / 2], [w / 2 + slant, -h / 2], [w / 2 - slant, h / 2], [-w / 2 - slant, h / 2]].map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
                if (A.dissolved) microSmooth(ctx, points); else spPoly(ctx, points);
                microFill(ctx, fill);
                microStroke(ctx, edge, width);
                if (p.inner && !A.dissolved && w * A.k > 14) {
                    spPoly(ctx, points.map(([px, py]) => [x + (px - x) * 0.6, y + (py - y) * 0.6]));
                    microFill(ctx, p.inner);
                }
                break;
            }
            case 'bipyramid': {
                // Seen from above, an orthorhombic bipyramid is a rhomb, with its edges meeting in the middle.
                const w = r * 1.5;
                const h = r * (0.9 + random() * 0.3);
                points = spBox(x, y, w, h, turn).map((_, n) => {
                    const a = turn + (n * Math.PI) / 2;
                    const reach = n % 2 ? h : w;
                    return [x + Math.cos(a) * reach * 0.7, y + Math.sin(a) * reach * 0.7];
                });
                spPoly(ctx, points);
                microFill(ctx, fill);
                microStroke(ctx, edge, width);
                if (w * A.k > 12) {
                    ctx.strokeStyle = p.inner;
                    ctx.lineWidth = spW(A, r * 0.02);
                    ctx.beginPath();
                    ctx.moveTo(points[0][0], points[0][1]);
                    ctx.lineTo(points[2][0], points[2][1]);
                    ctx.moveTo(points[1][0], points[1][1]);
                    ctx.lineTo(points[3][0], points[3][1]);
                    ctx.stroke();
                }
                break;
            }
            case 'plate': {
                // Flat flakes: rhombic plates of iodine, six-sided flakes of graphite.
                points = spShard(random, x, y, r, p.corners || 6, turn);
                spPoly(ctx, points);
                microFill(ctx, fill);
                microStroke(ctx, edge, width);
                if (opaque && r * A.k > 10) {
                    // A step where a few layers broke off the top, catching the light.
                    spPoly(ctx, points.map(([px, py]) => [x + (px - x) * 0.55 + r * 0.1, y + (py - y) * 0.55]));
                    microStroke(ctx, spLit(A, ...p.surface.map((v) => Math.min(255, v + 50)), 0.8), spW(A, r * 0.02));
                }
                break;
            }
            case 'cleaved': {
                // Fragments broken along cleavage planes: straight edges at fixed angles, purple bands of colour.
                points = spShard(random, x, y, r, 3 + Math.floor(random() * 2), turn);
                spPoly(ctx, points);
                microFill(ctx, fill);
                microStroke(ctx, edge, width);
                if (r * A.k > 10) {
                    spHatch(ctx, A, points, x, y, turn + 0.4, r * 0.28, p.inner, r * 0.07, r * 1.6);
                    if (r * A.k > 50) spHatch(ctx, A, points, x, y, turn + 1.45, r * 0.5, 'rgba(110,80,130,0.35)', 0.8, r * 1.6);
                }
                break;
            }
            case 'shard': {
                // Broken pieces with curved (conchoidal) fracture, as glass breaks: silicon, boron.
                points = spShard(random, x, y, r, 6, turn);
                spPoly(ctx, points);
                microFill(ctx, fill);
                microStroke(ctx, edge, width);
                if (opaque && r * A.k > 12) {
                    ctx.strokeStyle = spLit(A, ...p.surface.map((v) => Math.min(255, v + 60)), 0.7);
                    ctx.lineWidth = spW(A, r * 0.02);
                    for (let n = 1; n < 4; n++) {
                        ctx.beginPath();
                        ctx.arc(x, y, r * 0.15 * n, turn, turn + 1.3);
                        ctx.stroke();
                    }
                }
                break;
            }
            default: {
                // A powder: grains far smaller than anything else here, in loose clumps.
                const clump = r;
                const grains = Math.min(A.k < 1 ? 14 : 40, Math.round(clump / p.grain) * 3 + 4);
                ctx.fillStyle = p.fill;
                if (p.grain * A.k < 1.2) {
                    microSmooth(ctx, spBlob(random, x, y, clump, 9, 0.5));
                    microFill(ctx, p.haze);
                    break;
                }
                for (let n = 0; n < grains; n++) {
                    const [gx, gy] = microInDisc(random, clump);
                    const g = p.grain * (0.4 + random() * 1.2);
                    spPoly(ctx, spShard(random, x + gx, y + gy, g, 5, random() * 6));
                    ctx.fill();
                    if (g * A.k > 5) microStroke(ctx, p.edge, spW(A, 0.4));
                }
            }
        }
    });
}

// Ice: one slab of crystals that grew into each other, clear, their boundaries and trapped air the only marks.
function spIce(ctx, A) {
    spGround(ctx, A, 'rgba(236,244,250,0.12)');
    spMosaic(A, 1500, 71, (points) => {
        spPoly(ctx, points);
        microStroke(ctx, 'rgba(120,140,160,0.45)', spW(A, 3));
    });
    // Bubbles: dark rims, because light bends away at their edge, and a bright middle.
    spEach(A, 260, 300, 73, (i, j, random) => {
        if (random() < 0.55) return;
        const many = random() < 0.15 ? 12 : 1;
        for (let n = 0; n < many; n++) {
            const x = i * 260 + random() * 260 + (many > 1 ? (random() - 0.5) * 120 : 0);
            const y = j * 260 + random() * 260 + (many > 1 ? (random() - 0.5) * 120 : 0);
            const r = many > 1 ? 4 + random() * 10 : 15 + random() * 90;
            if (r * A.k < 0.8) continue;
            microOval(ctx, x, y, r, r * (0.85 + random() * 0.3));
            microFill(ctx, 'rgba(250,252,255,0.5)');
            microStroke(ctx, 'rgba(30,40,52,0.85)', spW(A, r * 0.28));
        }
    });
}

// ---------------------------------------------------------------------------------------
// Rocks: a thin section, a slice ground to 30 micrometres so that most minerals let light through.

const SP_MINERALS = {
    quartz: { fill: 'rgba(244,244,236,0.12)', edge: 'rgba(110,108,96,0.5)' },
    feldspar: { fill: 'rgba(222,212,196,0.42)', edge: 'rgba(110,100,84,0.55)', dust: 'rgba(150,130,110,0.4)', cleave: 'rgba(120,108,90,0.3)' },
    plagioclase: { fill: 'rgba(230,226,214,0.32)', edge: 'rgba(110,100,84,0.55)', dust: 'rgba(150,140,120,0.35)' },
    biotite: { fill: 'rgba(120,74,30,0.78)', edge: 'rgba(60,36,16,0.8)', cleave: 'rgba(50,28,10,0.55)' },
    muscovite: { fill: 'rgba(236,232,210,0.25)', edge: 'rgba(110,104,80,0.6)', cleave: 'rgba(120,112,90,0.45)' },
    hornblende: { fill: 'rgba(110,130,72,0.62)', edge: 'rgba(50,62,30,0.8)', cleave: 'rgba(40,52,24,0.28)' },
    calcite: { fill: 'rgba(240,238,228,0.2)', edge: 'rgba(120,116,100,0.55)', cleave: 'rgba(130,124,106,0.45)' },
    opaque: { fill: 'rgba(14,12,12,0.96)', edge: 'rgba(0,0,0,1)' }
};

function spMineral(ctx, A, points, cx, cy, random, name, size) {
    const m = SP_MINERALS[name];
    spPoly(ctx, points);
    microFill(ctx, name === 'opaque' ? spLit(A, 80, 78, 76) : m.fill);
    microStroke(ctx, m.edge, spW(A, Math.max(1.5, size * 0.012)));
    const turn = random() * Math.PI;
    if (m.dust && size * A.k > 6) {
        // Cloudy: the feldspar is turning to clay, in tiny specks.
        ctx.fillStyle = m.dust;
        const n = Math.min(40, Math.round(size * A.k / 3));
        for (let d = 0; d < n; d++) {
            const [dx, dy] = microInDisc(random, size * 0.4);
            microOval(ctx, cx + dx, cy + dy, Math.max(1.5, A.px * 0.8), Math.max(1.2, A.px * 0.7));
            ctx.fill();
        }
    }
    if (m.cleave) spHatch(ctx, A, points, cx, cy, turn, name === 'biotite' || name === 'muscovite' ? size * 0.05 : size * 0.12, m.cleave, 1, size);
    if (name === 'hornblende' || name === 'calcite') spHatch(ctx, A, points, cx, cy, turn + (name === 'calcite' ? 1.31 : 0.98), size * 0.14, m.cleave, 0.8, size);
    if (name === 'biotite' && size * A.k > 30 && random() < 0.5) {
        // A pleochroic halo: a dark ring burned into the mica by a speck of radioactive zircon.
        const r = 20;
        microOval(ctx, cx + (random() - 0.5) * size * 0.3, cy, r, r);
        microFill(ctx, 'rgba(40,20,6,0.6)');
    }
    if (name === 'quartz' && size * A.k > 40) {
        // Trails of fluid inclusions across a quartz.
        ctx.fillStyle = 'rgba(80,80,70,0.55)';
        const angle = random() * Math.PI;
        for (let d = -size * 0.4; d < size * 0.4; d += size * 0.03) {
            microOval(ctx, cx + Math.cos(angle) * d, cy + Math.sin(angle) * d + Math.sin(d * 0.05) * 6, 1.4, 1.1);
            ctx.fill();
        }
    }
}

function spPick(random, table) {
    let roll = random();
    for (const [name, share] of table) {
        roll -= share;
        if (roll <= 0) return name;
    }
    return table[table.length - 1][0];
}

function spRock(ctx, A, p) {
    switch (p.rock) {
        case 'basalt': return spBasalt(ctx, A);
        case 'slate': return spSlate(ctx, A);
        case 'limestone': return spLimestone(ctx, A);
        case 'concrete': return spConcrete(ctx, A);
        case 'brick': return spBrick(ctx, A);
        default: break;
    }
    const mix = p.rock === 'granite'
        ? [['quartz', 0.32], ['feldspar', 0.3], ['plagioclase', 0.24], ['biotite', 0.09], ['muscovite', 0.03], ['opaque', 0.02]]
        : p.rock === 'marble' ? [['calcite', 0.99], ['opaque', 0.01]]
            : [['plagioclase', 0.42], ['quartz', 0.2], ['hornblende', 0.16], ['biotite', 0.1], ['feldspar', 0.09], ['opaque', 0.03]];
    const cell = p.grain;
    spMosaic(A, cell, 81, (points, i, j, random, cx, cy) => {
        const name = spPick(random, mix);
        // Opaque grains are small: a speck inside a clear grain rather than a whole cell.
        if (name === 'opaque') {
            spMineral(ctx, A, points, cx, cy, random, 'quartz', cell);
            spPoly(ctx, spShard(random, cx, cy, cell * 0.18, 5));
            microFill(ctx, spLit(A, 80, 78, 76));
            return;
        }
        spMineral(ctx, A, points, cx, cy, random, name, cell);
        // Calcite in marble: thin twin bands, which show far better between crossed polarisers.
        if (name === 'calcite' && random() < 0.4) spHatch(ctx, A, points, cx, cy, random() * Math.PI, cell * 0.07, 'rgba(150,146,130,0.25)', cell * 0.02, cell);
    });
    if (p.cracked) {
        // Cobblestone: the same stone, broken, its cracks filled with fine dust.
        ctx.strokeStyle = 'rgba(70,62,50,0.8)';
        spEach(A, 1400, 1400, 87, (i, j, random) => {
            ctx.lineWidth = spW(A, 8 + random() * 30);
            microCurve(ctx, spWander(random, i * 1400, j * 1400 + random() * 1400, random() * Math.PI * 2, 2400, 160, 0.9));
            ctx.stroke();
        });
    }
}

function spBasalt(ctx, A) {
    // A brown glassy groundmass, packed with laths of plagioclase, grains of pyroxene and specks of magnetite.
    spGround(ctx, A, 'rgba(150,120,82,0.6)');
    const lath = 110;
    spEach(A, 70, 200, 91, (i, j, random) => {
        const x = i * 70 + random() * 70;
        const y = j * 70 + random() * 70;
        const turn = random() * Math.PI;
        const roll = random();
        if (roll < 0.5) {
            if (lath * A.k < 1.5) return;
            spPoly(ctx, spBox(x, y, lath * (0.6 + random()), 18 + random() * 14, turn));
            microFill(ctx, 'rgba(240,238,228,0.75)');
            if (lath * A.k > 12) microStroke(ctx, 'rgba(90,80,60,0.6)', spW(A, 1));
        } else if (roll < 0.8) {
            if (40 * A.k < 1.2) return;
            spPoly(ctx, spShard(random, x, y, 18 + random() * 16, 6, turn));
            microFill(ctx, 'rgba(196,172,120,0.75)');
            if (40 * A.k > 12) microStroke(ctx, 'rgba(110,90,50,0.7)', spW(A, 1));
        } else if (roll < 0.9) {
            const s = 8 + random() * 14;
            if (s * A.k < 0.8) return;
            spPoly(ctx, spBox(x, y, s, s, turn));
            microFill(ctx, spLit(A, 70, 70, 74));
        }
    });
    // Phenocrysts of olivine, cracked, some turning red-brown at their rims; and round gas bubbles (vesicles).
    spEach(A, 1100, 600, 93, (i, j, random) => {
        const x = i * 1100 + random() * 1100;
        const y = j * 1100 + random() * 1100;
        const r = 160 + random() * 260;
        if (random() < 0.5) {
            const points = spShard(random, x, y, r, 7, random() * 6);
            spPoly(ctx, points);
            microFill(ctx, 'rgba(232,236,214,0.85)');
            microStroke(ctx, 'rgba(150,80,30,0.8)', spW(A, r * 0.08));
            ctx.strokeStyle = 'rgba(80,76,60,0.7)';
            ctx.lineWidth = spW(A, 2);
            for (let n = 0; n < 4; n++) {
                microCurve(ctx, spWander(random, x + (random() - 0.5) * r, y + (random() - 0.5) * r, random() * 6, r, r / 4, 1.2));
                ctx.stroke();
            }
        } else if (random() < 0.7) {
            microOval(ctx, x, y, r * 0.7, r * 0.6);
            microFill(ctx, 'rgba(250,250,246,0.95)');
            microStroke(ctx, 'rgba(60,50,40,0.85)', spW(A, 4));
        }
    });
}

function spSlate(ctx, A) {
    // Clay turned to mica by pressure: flakes far too small to see one by one at 40x, all lying the same way.
    spGround(ctx, A, 'rgba(96,100,104,0.82)');
    ctx.strokeStyle = 'rgba(60,62,66,0.5)';
    spEach(A, 90, 0, 101, (i, j, random) => {
        if (6 * A.k < 0.5) return;
        const y = j * 90 + random() * 90;
        ctx.lineWidth = spW(A, 6 + random() * 18);
        spLine(ctx, i * 90 - 200, y, i * 90 + 200 + random() * 300, y + (random() - 0.5) * 12);
        ctx.stroke();
    });
    if (A.k > 0.9) {
        // The flakes themselves: pale mica and green chlorite, dashes all lying flat.
        spEach(A, 9, 0, 103, (i, j, random) => {
            const roll = random();
            ctx.fillStyle = roll < 0.45 ? 'rgba(214,212,196,0.7)' : roll < 0.7 ? 'rgba(150,176,130,0.7)' : roll < 0.8 ? 'rgba(236,236,230,0.6)' : 'rgba(30,30,30,0.7)';
            const w = 6 + random() * 9;
            ctx.fillRect(i * 9 + random() * 4, j * 9 + random() * 6, w, 1.2 + random() * 1.6);
        });
    }
    // Cubes of pyrite, black by transmitted light, with fringes of quartz fibres grown in their pressure shadow.
    spEach(A, 1300, 400, 105, (i, j, random) => {
        if (random() < 0.5) return;
        const x = i * 1300 + random() * 1300;
        const y = j * 1300 + random() * 1300;
        const s = 60 + random() * 220;
        spPoly(ctx, [[x - s * 1.6, y], [x - s / 2, y - s / 2], [x + s / 2, y - s / 2], [x + s * 1.6, y], [x + s / 2, y + s / 2], [x - s / 2, y + s / 2]]);
        microFill(ctx, 'rgba(236,236,226,0.75)');
        spPoly(ctx, spBox(x, y, s, s, 0.05));
        microFill(ctx, spLit(A, 200, 180, 90));
    });
}

function spLimestone(ctx, A) {
    // Fine lime mud (micrite), with what lived in the sea in it: shells, foraminifera, ooids, crinoid plates.
    spGround(ctx, A, 'rgba(176,164,140,0.72)');
    if (A.k > 1.2) {
        spEach(A, 6, 0, 111, (i, j, random) => {
            if (random() < 0.5) return;
            ctx.fillStyle = random() < 0.5 ? 'rgba(120,110,90,0.5)' : 'rgba(220,212,196,0.5)';
            ctx.fillRect(i * 6 + random() * 4, j * 6 + random() * 4, 1.5 + random() * 2, 1.5 + random() * 2);
        });
    }
    spEach(A, 520, 700, 113, (i, j, random) => {
        const x = i * 520 + random() * 520;
        const y = j * 520 + random() * 520;
        const roll = random();
        const turn = random() * Math.PI * 2;
        if (roll < 0.3) {
            // An ooid: rings of calcite laid round a grain as it rolled on a warm shallow sea floor.
            const r = 160 + random() * 160;
            for (let n = 0; n < 7; n++) {
                microOval(ctx, x, y, r * (1 - n * 0.13), r * (1 - n * 0.13) * 0.92);
                microFill(ctx, n % 2 ? 'rgba(210,196,166,0.6)' : 'rgba(188,172,140,0.6)');
            }
            microOval(ctx, x, y, r, r * 0.92);
            microStroke(ctx, 'rgba(110,96,70,0.7)', spW(A, 3));
        } else if (roll < 0.55) {
            // A broken shell: a curved band with fine fibres across it.
            const r = 300 + random() * 300;
            ctx.strokeStyle = 'rgba(236,230,214,0.9)';
            ctx.lineWidth = spW(A, 40 + random() * 30);
            ctx.beginPath();
            ctx.arc(x, y, r, turn, turn + 1.4 + random());
            ctx.stroke();
            ctx.strokeStyle = 'rgba(120,108,84,0.7)';
            ctx.lineWidth = spW(A, 2);
            ctx.stroke();
        } else if (roll < 0.75) {
            // A foraminifer: a single-celled animal's shell of chambers, spiralling out.
            let r = 18;
            let a = turn;
            for (let n = 0; n < 11; n++) {
                const d = 22 + n * 13;
                const cx = x + Math.cos(a) * d;
                const cy = y + Math.sin(a) * d;
                microOval(ctx, cx, cy, r, r * 0.85, a);
                microFill(ctx, 'rgba(244,240,228,0.8)');
                microStroke(ctx, 'rgba(110,96,70,0.8)', spW(A, 3));
                a += 0.62;
                r *= 1.12;
            }
        } else if (roll < 0.88) {
            // A crinoid plate: one crystal of calcite riddled with fine pores, a dusty disc.
            const r = 180 + random() * 120;
            microOval(ctx, x, y, r, r * 0.9);
            microFill(ctx, 'rgba(226,218,200,0.75)');
            microStroke(ctx, 'rgba(110,96,70,0.7)', spW(A, 3));
            if (A.k > 0.3) {
                ctx.fillStyle = 'rgba(120,104,80,0.5)';
                for (let n = 0; n < 60; n++) {
                    const [dx, dy] = microInDisc(random, r * 0.9);
                    microOval(ctx, x + dx, y + dy, 5, 5);
                    ctx.fill();
                }
            }
        } else {
            // Clear calcite cement (sparite) that filled a hollow later.
            const points = spBlob(random, x, y, 220 + random() * 120, 8, 0.4);
            microSmooth(ctx, points);
            microFill(ctx, 'rgba(244,242,234,0.85)');
            spHatch(ctx, A, points, x, y, turn, 70, 'rgba(140,130,110,0.4)', 2, 400);
        }
    });
}

function spConcrete(ctx, A) {
    // Cement paste, grey and fine; sand and stone set in it; round air voids; a few unreacted cement grains.
    spGround(ctx, A, 'rgba(150,146,134,0.82)');
    if (A.k > 1.2) {
        // The paste close up: a fine grain of hydrated cement, lighter and darker.
        spEach(A, 5, 0, 125, (i, j, random) => {
            if (random() < 0.5) return;
            ctx.fillStyle = random() < 0.5 ? 'rgba(110,106,96,0.55)' : 'rgba(196,192,182,0.5)';
            ctx.fillRect(i * 5 + random() * 3, j * 5 + random() * 3, 1 + random() * 2, 1 + random() * 2);
        });
    }
    spEach(A, 2600, 1500, 121, (i, j, random) => {
        if (random() < 0.4) return;
        const x = i * 2600 + random() * 2600;
        const y = j * 2600 + random() * 2600;
        const points = spShard(random, x, y, 600 + random() * 700, 7, random() * 6);
        spPoly(ctx, points);
        microFill(ctx, 'rgba(208,204,194,0.85)');
        microStroke(ctx, 'rgba(70,66,58,0.8)', spW(A, 8));
        spMosaicInside(ctx, A, points, x, y, random);
    });
    spEach(A, 300, 200, 123, (i, j, random) => {
        const x = i * 300 + random() * 300;
        const y = j * 300 + random() * 300;
        const roll = random();
        if (roll < 0.35) {
            const r = 40 + random() * 110;
            microSmooth(ctx, spBlob(random, x, y, r, 8, 0.4));
            microFill(ctx, 'rgba(240,240,232,0.6)');
            microStroke(ctx, 'rgba(70,66,58,0.75)', spW(A, 3));
        } else if (roll < 0.5) {
            const r = 20 + random() * 140;
            microOval(ctx, x, y, r, r);
            microFill(ctx, 'rgba(252,252,250,0.95)');
            microStroke(ctx, 'rgba(50,48,44,0.85)', spW(A, Math.max(2, r * 0.06)));
        } else if (roll < 0.75 && 30 * A.k > 1) {
            const r = 8 + random() * 22;
            spPoly(ctx, spShard(random, x, y, r, 5, random() * 6));
            microFill(ctx, 'rgba(120,96,60,0.85)');
            if (r * A.k > 12) {
                microOval(ctx, x, y, r * 0.3, r * 0.2);
                microFill(ctx, 'rgba(40,30,20,0.8)');
            }
        }
    });
}

// The crystals inside a piece of stone set in concrete: a quick mosaic clipped to it.
function spMosaicInside(ctx, A, points, x, y, random) {
    if (A.k < 0.12) return;
    ctx.save();
    spPoly(ctx, points);
    ctx.clip();
    ctx.strokeStyle = 'rgba(120,116,104,0.5)';
    ctx.lineWidth = spW(A, 2);
    for (let n = 0; n < 14; n++) {
        microCurve(ctx, spWander(random, x + (random() - 0.5) * 1200, y + (random() - 0.5) * 1200, random() * 6, 900, 120, 1.4));
        ctx.stroke();
    }
    ctx.restore();
}

function spBrick(ctx, A) {
    // Fired clay: red with fine hematite, grains of quartz it kept, and pores where water and gas left.
    spGround(ctx, A, 'rgba(158,70,40,0.85)');
    if (A.k > 1.2) {
        spEach(A, 5, 0, 131, (i, j, random) => {
            if (random() < 0.5) return;
            ctx.fillStyle = random() < 0.6 ? 'rgba(110,40,20,0.6)' : 'rgba(200,110,70,0.5)';
            ctx.fillRect(i * 5 + random() * 3, j * 5 + random() * 3, 1 + random() * 2, 1 + random() * 2);
        });
    }
    spEach(A, 260, 200, 133, (i, j, random) => {
        const x = i * 260 + random() * 260;
        const y = j * 260 + random() * 260;
        const roll = random();
        if (roll < 0.4) {
            const r = 25 + random() * 110;
            spPoly(ctx, spShard(random, x, y, r, 6, random() * 6));
            microFill(ctx, 'rgba(244,236,220,0.65)');
            microStroke(ctx, 'rgba(80,40,24,0.7)', spW(A, 2));
        } else if (roll < 0.62) {
            const r = 30 + random() * 160;
            microSmooth(ctx, spBlob(random, x, y, r, 8, 0.5, 2.2, random() * 0.5));
            microFill(ctx, 'rgba(250,246,240,0.9)');
            microStroke(ctx, 'rgba(70,30,18,0.85)', spW(A, 3));
        } else if (roll < 0.7) {
            const r = 10 + random() * 30;
            microOval(ctx, x, y, r, r);
            microFill(ctx, spLit(A, 60, 50, 46));
        }
    });
}

// Obsidian: volcanic glass, cooled too fast to make crystals. Clear, banded by flow, sprinkled with
// microlites (tiny needles of crystal that just began) and hair-like trichites.
function spObsidian(ctx, A) {
    spGround(ctx, A, 'rgba(150,140,128,0.32)');
    const band = (y) => y + Math.sin(y / 900) * 200;
    ctx.fillStyle = 'rgba(90,80,70,0.25)';
    spEach(A, 500, 0, 141, (i, j, random) => {
        if (random() < 0.5) return;
        const y = j * 500 + random() * 400;
        ctx.beginPath();
        const ys = [];
        for (let x = A.x0 - 200; x <= A.x1 + 200; x += 150) ys.push(x);
        const h = 30 + random() * 160;
        ys.forEach((x, n) => (n ? ctx.lineTo(x, band(y + Math.sin(x / 700) * 120)) : ctx.moveTo(x, band(y + Math.sin(x / 700) * 120))));
        for (let n = ys.length - 1; n >= 0; n--) ctx.lineTo(ys[n], band(y + h + Math.sin(ys[n] / 700) * 120));
        ctx.closePath();
        ctx.fill();
    });
    if (A.k > 0.3) {
        ctx.strokeStyle = 'rgba(30,28,24,0.8)';
        spEach(A, 40, 40, 143, (i, j, random) => {
            if (random() < 0.55) return;
            const x = i * 40 + random() * 40;
            const y = j * 40 + random() * 40;
            const length = 8 + random() * 30;
            const turn = Math.sin(x / 700) * 0.25 + (random() - 0.5) * 0.3;
            ctx.lineWidth = spW(A, 1 + random() * 1.5);
            spLine(ctx, x, y, x + Math.cos(turn) * length, y + Math.sin(turn) * length);
            ctx.stroke();
        });
    }
    ctx.strokeStyle = 'rgba(20,18,16,0.7)';
    spEach(A, 400, 300, 145, (i, j, random) => {
        if (random() < 0.7) return;
        ctx.lineWidth = spW(A, 2);
        microCurve(ctx, spWander(random, i * 400 + random() * 400, j * 400 + random() * 400, random() * 6, 200, 25, 1.4));
        ctx.stroke();
    });
}

// Coal: a thin section of plants turned to stone. Bands of vitrinite (wood, red-orange where thin enough),
// yellow spores and leaf cuticles, black fusinite (charcoal, its cells still in rows), and black pyrite.
function spCoal(ctx, A) {
    spGround(ctx, A, 'rgba(150,60,24,0.85)');
    const bandY = (j) => j * 300;
    spEach(A, 300, 0, 151, (i, j, random) => {
        if (i !== Math.floor(A.x0 / 300)) return;
        const roll = random();
        const y = bandY(j);
        const h = 60 + random() * 240;
        ctx.fillStyle = roll < 0.35 ? 'rgba(178,84,30,0.6)' : roll < 0.5 ? 'rgba(120,40,16,0.7)' : roll < 0.62 ? spLit(A, 120, 120, 120) : 'rgba(0,0,0,0)';
        ctx.fillRect(A.x0, y, A.x1 - A.x0, h);
        if (roll >= 0.5 && roll < 0.62 && 20 * A.k > 3) {
            // Fusinite: arcs of empty cells, crushed charcoal.
            ctx.fillStyle = 'rgba(220,200,160,0.5)';
            for (let x = A.x0 - (A.x0 % 26); x < A.x1; x += 26) {
                for (let yy = y + 8; yy < y + h - 8; yy += 22) {
                    microOval(ctx, x + Math.sin(yy * 0.05) * 6, yy, 8, 6);
                    ctx.fill();
                }
            }
        }
    });
    // Ghosts of wood cells inside the vitrinite.
    if (A.k > 0.35) {
        ctx.strokeStyle = 'rgba(110,40,14,0.45)';
        ctx.lineWidth = spW(A, 2);
        spEach(A, 600, 0, 153, (i, j, random) => {
            if (random() < 0.6) return;
            for (let n = 0; n < 10; n++) {
                ctx.strokeRect(i * 600 + n * 30, j * 600 + random() * 40, 26, 20);
            }
        });
    }
    // Spores, squashed flat: yellow lenses with a dark line through, and serrated yellow cuticles.
    spEach(A, 180, 100, 155, (i, j, random) => {
        if (random() < 0.5) return;
        const x = i * 180 + random() * 180;
        const y = j * 180 + random() * 180;
        const w = 40 + random() * 90;
        if (w * A.k < 1.5) return;
        microOval(ctx, x, y, w, w * 0.16);
        microFill(ctx, 'rgba(250,210,60,0.9)');
        if (w * A.k > 14) {
            spLine(ctx, x - w * 0.8, y, x + w * 0.8, y);
            microStroke(ctx, 'rgba(120,70,10,0.8)', spW(A, 1.5));
        }
    });
    spEach(A, 1100, 300, 157, (i, j, random) => {
        if (random() < 0.6) return;
        const x = i * 1100 + random() * 1100;
        const y = j * 1100 + random() * 1100;
        // Pyrite in raspberry-like clusters (framboids), black.
        for (let n = 0; n < 14; n++) {
            const [dx, dy] = microInDisc(random, 22);
            microOval(ctx, x + dx, y + dy, 4, 4);
            microFill(ctx, spLit(A, 210, 190, 100));
        }
    });
}

// ---------------------------------------------------------------------------------------
// Ores: a thin section of quartz or calcite with the ore mineral in it. Most ore minerals are opaque,
// black by light from below; a few let red, yellow or green light through.

function spOre(ctx, A, p) {
    spMosaic(A, 700, 161, (points, i, j, random, cx, cy) => {
        spMineral(ctx, A, points, cx, cy, random, p.gangue || 'quartz', 700);
    });
    spEach(A, p.cell, p.cell, 163, (i, j, random) => {
        if (random() < p.empty) return;
        const x = i * p.cell + random() * p.cell;
        const y = j * p.cell + random() * p.cell;
        const m = p.minerals[Math.floor(random() * p.minerals.length)];
        const r = m.size * (0.4 + random() * 0.8);
        const turn = random() * Math.PI;
        if (r * A.k < 0.7) return;
        let points;
        if (m.habit === 'cube') points = spBox(x, y, r * 1.4, r * 1.4, turn);
        else if (m.habit === 'flake') points = spBox(x, y, r * 2.4, r * 0.35, turn);
        else if (m.habit === 'wire') {
            // Native silver grows in wires and branching dendrites.
            ctx.strokeStyle = spLit(A, ...m.surface);
            ctx.lineWidth = spW(A, r * 0.08);
            ctx.lineCap = 'round';
            for (let n = 0; n < 5; n++) {
                microCurve(ctx, spWander(random, x, y, turn + n * 1.2, r * 2, r * 0.25, 1));
                ctx.stroke();
            }
            return;
        } else if (m.habit === 'botryoidal') {
            // Malachite: rounded masses of green bands, laid down layer on layer.
            for (let n = 0; n < 6; n++) {
                microOval(ctx, x, y, r * (1 - n * 0.15), r * (1 - n * 0.15) * 0.9);
                microFill(ctx, n % 2 ? m.fill : m.fill2);
            }
            microOval(ctx, x, y, r, r * 0.9);
            microStroke(ctx, m.edge, spW(A, 2));
            return;
        } else points = spShard(random, x, y, r, 7, turn);
        spPoly(ctx, points);
        if (m.translucent) {
            microFill(ctx, m.fill);
            microStroke(ctx, m.edge, spW(A, Math.max(2, r * 0.05)));
            // Bands of colour where the iron content changed as the crystal grew.
            if (m.zoned) spHatch(ctx, A, points, x, y, turn, r * 0.2, m.zoned, r * 0.06, r * 1.5);
        } else {
            microFill(ctx, spLit(A, ...m.surface));
            if (m.redEdge && r * A.k > 4) {
                // Hematite: where a flake thins out it lets through deep red light.
                microStroke(ctx, 'rgba(150,20,10,0.75)', spW(A, r * 0.08));
            }
            if (m.pits && r * A.k > 30) {
                // Galena's cubic cleavage leaves triangular pits on a polished face.
                ctx.fillStyle = spLit(A, 30, 30, 34);
                for (let n = 0; n < 6; n++) {
                    const [dx, dy] = microInDisc(random, r * 0.5);
                    const s = r * 0.08;
                    spPoly(ctx, [[x + dx, y + dy - s], [x + dx + s, y + dy + s * 0.7], [x + dx - s, y + dy + s * 0.7]]);
                    ctx.fill();
                }
            }
        }
    });
}

// ---------------------------------------------------------------------------------------
// Metals, polished and etched with a weak acid: the acid eats each crystal (grain) a little differently, so
// grains show up lighter and darker. All of it only by the room's light: a metal is opaque.

function spMetal(ctx, A, p) {
    const [r0, g0, b0] = p.surface;
    if (p.structure === 'widmanstatten') return spWidmanstatten(ctx, A, p);
    if (p.structure === 'dendrites') {
        spGround(ctx, A, spLit(A, r0 * 0.85, g0 * 0.85, b0 * 0.85));
        // Cored dendrites: the first copper-rich arms froze first, the tin-rich rest last between them.
        ctx.strokeStyle = spLit(A, r0 * 1.08, g0 * 1.05, b0);
        spEach(A, 500, 500, 171, (i, j, random) => {
            const x = i * 500 + random() * 500;
            const y = j * 500 + random() * 500;
            const turn = random() * Math.PI;
            ctx.lineWidth = spW(A, 18);
            for (let arm = 0; arm < 4; arm++) {
                const a = turn + (arm * Math.PI) / 2;
                spLine(ctx, x, y, x + Math.cos(a) * 260, y + Math.sin(a) * 260);
                ctx.stroke();
                for (let n = 40; n < 260; n += 45) {
                    const bx = x + Math.cos(a) * n;
                    const by = y + Math.sin(a) * n;
                    const side = (130 - n * 0.4);
                    spLine(ctx, bx, by, bx + Math.cos(a + Math.PI / 2) * side, by + Math.sin(a + Math.PI / 2) * side);
                    ctx.stroke();
                    spLine(ctx, bx, by, bx - Math.cos(a + Math.PI / 2) * side, by - Math.sin(a + Math.PI / 2) * side);
                    ctx.stroke();
                }
            }
        });
        return;
    }
    if (p.grain * A.k < 12) {
        // Grains too small to tell at this power: a fine mottle of light and dark.
        spGround(ctx, A, spLit(A, r0 * 0.85, g0 * 0.85, b0 * 0.85));
        spEach(A, 60, 0, 177, (i, j, random) => {
            if (random() < 0.5) return;
            const tone = (p.pearlite ? 0.45 : 0.7) + random() * 0.45;
            ctx.fillStyle = spLit(A, Math.min(255, r0 * tone), Math.min(255, g0 * tone), Math.min(255, b0 * tone), 0.7);
            ctx.fillRect(i * 60 + random() * 30, j * 60 + random() * 30, 20 + random() * 30, 20 + random() * 30);
        });
        return;
    }
    spMosaic(A, p.grain, 173, (points, i, j, random, cx, cy) => {
        const tone = 0.72 + random() * 0.4;
        spPoly(ctx, points);
        microFill(ctx, spLit(A, Math.min(255, r0 * tone), Math.min(255, g0 * tone), Math.min(255, b0 * tone)));
        microStroke(ctx, spLit(A, r0 * 0.35, g0 * 0.35, b0 * 0.35), spW(A, Math.max(1, p.grain * 0.015)));
        if (p.twins && p.grain * A.k > 15 && random() < 0.55) {
            // Annealing twins: straight-sided bands across a grain, a mark of metals like copper and brass.
            const turn = random() * Math.PI;
            const t2 = 0.8 + random() * 0.4;
            ctx.save();
            spPoly(ctx, points);
            ctx.clip();
            const c = Math.cos(turn);
            const s = Math.sin(turn);
            const off = (random() - 0.5) * p.grain * 0.4;
            const w = p.grain * (0.1 + random() * 0.15);
            spPoly(ctx, [[cx - c * p.grain - s * off, cy - s * p.grain + c * off], [cx + c * p.grain - s * off, cy + s * p.grain + c * off],
                [cx + c * p.grain - s * (off + w), cy + s * p.grain + c * (off + w)], [cx - c * p.grain - s * (off + w), cy - s * p.grain + c * (off + w)]]);
            microFill(ctx, spLit(A, Math.min(255, r0 * tone * t2), Math.min(255, g0 * tone * t2), Math.min(255, b0 * tone * t2)));
            ctx.restore();
        }
        if (p.lenses && random() < 0.4) {
            // Deformation twins of zinc and magnesium: thin lenses, sharp at both ends.
            const turn = random() * Math.PI;
            const length = p.grain * 0.6;
            const c = Math.cos(turn);
            const s = Math.sin(turn);
            spPoly(ctx, [[cx - c * length, cy - s * length], [cx - s * length * 0.06, cy + c * length * 0.06], [cx + c * length, cy + s * length], [cx + s * length * 0.06, cy - c * length * 0.06]]);
            microFill(ctx, spLit(A, r0 * tone * 0.7, g0 * tone * 0.7, b0 * tone * 0.7));
        }
        if (p.pearlite && random() < 0.5) {
            // Pearlite: plates of iron carbide and iron, too fine for this light; a darker grain.
            spPoly(ctx, points);
            microFill(ctx, spLit(A, r0 * 0.5, g0 * 0.5, b0 * 0.5, 0.7));
        }
    });
    // Scratches from the polishing.
    if (A.k < 0.8) {
        ctx.strokeStyle = spLit(A, r0 * 1.1, g0 * 1.1, b0 * 1.1, 0.4);
        spEach(A, 1500, 1500, 175, (i, j, random) => {
            ctx.lineWidth = spW(A, 3);
            const x = i * 1500 + random() * 1500;
            const y = j * 1500 + random() * 1500;
            const turn = random() * Math.PI;
            spLine(ctx, x, y, x + Math.cos(turn) * 2500, y + Math.sin(turn) * 2500);
            ctx.stroke();
        });
    }
}

function spWidmanstatten(ctx, A, p) {
    // Iron from space: plates of kamacite crossing at 60 degrees, edged with thin bright taenite, which etches
    // less; the fields between them are fine mixtures (plessite). Seen even by eye on an etched slice.
    const [r0, g0, b0] = p.surface;
    spGround(ctx, A, spLit(A, r0 * 0.7, g0 * 0.7, b0 * 0.7));
    const band = 520;
    for (let set = 0; set < 3; set++) {
        const turn = (set * Math.PI) / 3 + 0.2;
        const c = Math.cos(turn);
        const s = Math.sin(turn);
        spEach(A, band, 0, 181 + set, (i, j, random) => {
            if (j !== 0 || random() < 0.3) return;
            const d = i * band + random() * band * 0.5;
            const width = 120 + random() * 160;
            const reach = 8000;
            const x = -s * d;
            const y = c * d;
            const points = [[x - c * reach, y - s * reach], [x + c * reach, y + s * reach], [x + c * reach - s * width, y + s * reach + c * width], [x - c * reach - s * width, y - s * reach + c * width]];
            spPoly(ctx, points);
            const tone = 0.9 + random() * 0.2;
            microFill(ctx, spLit(A, r0 * tone, g0 * tone, b0 * tone, 0.8));
            microStroke(ctx, spLit(A, 245, 245, 240), spW(A, 10));
        });
    }
}

// Gold leaf: gold beaten so thin (about a tenth of a micrometre) that light passes, and comes out green.
function spGoldLeaf(ctx, A) {
    spGround(ctx, A, 'rgba(78,150,104,0.7)');
    // Wrinkles and folds where two layers overlap: darker; tears: bright holes.
    ctx.strokeStyle = 'rgba(30,80,50,0.55)';
    spEach(A, 500, 500, 191, (i, j, random) => {
        ctx.lineWidth = spW(A, 6 + random() * 40);
        microCurve(ctx, spWander(random, i * 500 + random() * 500, j * 500 + random() * 500, random() * 6, 900, 90, 0.8));
        ctx.stroke();
    });
    spEach(A, 300, 200, 193, (i, j, random) => {
        if (random() < 0.6) return;
        const r = 3 + random() * (random() < 0.2 ? 120 : 20);
        if (r * A.k < 0.7) return;
        microSmooth(ctx, spBlob(random, i * 300 + random() * 300, j * 300 + random() * 300, r, 8, 0.6));
        microFill(ctx, 'rgba(250,252,246,0.95)');
        microStroke(ctx, 'rgba(40,90,60,0.6)', spW(A, 1.5));
    });
}

// ---------------------------------------------------------------------------------------
// Gems: a slice of a single crystal of corundum, red with a little chromium (ruby) or blue with iron and
// titanium (sapphire). Inside, needles of rutile ("silk") lie in three directions 60 degrees apart.

function spGem(ctx, A, p) {
    spGround(ctx, A, p.body);
    // Straight bands of colour, set by the crystal's hexagonal faces as it grew.
    ctx.fillStyle = p.band;
    spEach(A, 600, 0, 201, (i, j, random) => {
        if (i !== Math.floor(A.x0 / 600) || random() < 0.4) return;
        const y = j * 600;
        const h = 60 + random() * 200;
        spPoly(ctx, [[A.x0 - 1000, y], [A.x1 + 1000, y + (A.x1 - A.x0 + 2000) * 0.577], [A.x1 + 1000, y + h + (A.x1 - A.x0 + 2000) * 0.577], [A.x0 - 1000, y + h]]);
        ctx.fill();
    });
    // Silk.
    spEach(A, 60, 60, 203, (i, j, random) => {
        if (random() < 0.45) return;
        const x = i * 60 + random() * 60;
        const y = j * 60 + random() * 60;
        const turn = Math.floor(random() * 3) * (Math.PI / 3) + 0.1;
        const length = 15 + random() * (random() < 0.15 ? 220 : 60);
        if (length * A.k < 2) return;
        ctx.strokeStyle = random() < 0.5 ? 'rgba(250,246,236,0.75)' : 'rgba(40,30,30,0.55)';
        ctx.lineWidth = spW(A, 0.8 + random() * 1.2);
        spLine(ctx, x, y, x + Math.cos(turn) * length, y + Math.sin(turn) * length);
        ctx.stroke();
    });
    // A "fingerprint": a healed crack, a curved sheet of tiny drops of fluid.
    spEach(A, 1400, 600, 205, (i, j, random) => {
        if (random() < 0.5) return;
        const cx = i * 1400 + random() * 1400;
        const cy = j * 1400 + random() * 1400;
        ctx.fillStyle = 'rgba(40,30,30,0.6)';
        for (let n = 0; n < 140; n++) {
            const a = random() * Math.PI * 2;
            const d = Math.sqrt(random()) * 420;
            const x = cx + Math.cos(a) * d;
            const y = cy + Math.sin(a) * d * 0.5 + Math.sin(d / 40) * 20;
            const r = 2 + random() * 5;
            if (r * A.k < 0.5) continue;
            microOval(ctx, x, y, r, r * 0.7, a);
            ctx.fill();
        }
    });
}

// ---------------------------------------------------------------------------------------
// Fibres: carpets and curtains, yarns of wool made of fibres with overlapping scales.

function spWeave(ctx, A, p) {
    const yarn = 420;
    const fibre = 24;
    const [r0, g0, b0] = p.dye;
    const body = C(r0, g0, b0, 0.55);
    const edge = C(r0 * 0.55, g0 * 0.55, b0 * 0.55, 0.8);
    const scales = { step: 9, color: C(r0 * 0.45, g0 * 0.45, b0 * 0.45, 0.55), lean: 0.35 };
    // The yarns, under and over: warp (up and down) on one layer, weft (across) on the other.
    const vertical = (A.layer === 0) === (p.weave === 'plain');
    const lineOf = (n) => n * yarn * 1.15;
    const lo = Math.floor(((vertical ? A.x0 : A.y0) - yarn) / (yarn * 1.15));
    const hi = Math.ceil(((vertical ? A.x1 : A.y1) + yarn) / (yarn * 1.15));
    for (let n = lo; n <= hi; n++) {
        const random = spRng(n, A.layer, A.seed + 211);
        const centre = lineOf(n) + (p.weave === 'pile' ? random() * 200 : 0);
        if (fibre * A.k < 2) {
            // Too small to tell fibres: the yarn is a band, its twist a few slanting lines.
            ctx.fillStyle = C(r0, g0, b0, 0.5);
            if (vertical) ctx.fillRect(centre - yarn / 2, A.y0, yarn, A.y1 - A.y0);
            else ctx.fillRect(A.x0, centre - yarn / 2, A.x1 - A.x0, yarn);
            ctx.strokeStyle = edge;
            ctx.lineWidth = spW(A, 8);
            const from = vertical ? A.y0 : A.x0;
            const to = vertical ? A.y1 : A.x1;
            ctx.beginPath();
            for (let d = Math.floor(from / 120) * 120; d < to; d += 120) {
                if (vertical) {
                    ctx.moveTo(centre - yarn / 2, d);
                    ctx.lineTo(centre + yarn / 2, d + 90);
                } else {
                    ctx.moveTo(d, centre - yarn / 2);
                    ctx.lineTo(d + 90, centre + yarn / 2);
                }
            }
            ctx.stroke();
            continue;
        }
        // Each fibre twists round the yarn: a gentle wave across it, and some stray ends.
        const count = fibre * A.k < 6 ? 7 : 14;
        for (let f = 0; f < count; f++) {
            const offset = (f / count - 0.5) * yarn * 0.9;
            const phase = random() * Math.PI * 2;
            const path = [];
            const from = (vertical ? A.y0 : A.x0) - 200;
            const to = (vertical ? A.y1 : A.x1) + 200;
            for (let d = from; d <= to; d += fibre * A.k < 6 ? 60 : 30) {
                const across = offset + Math.sin(d / 260 + phase) * yarn * 0.12 + Math.sin(d / 47 + phase * 3) * 3;
                path.push(vertical ? [centre + across, d] : [d, centre + across]);
            }
            spFibre(ctx, A, path, fibre * (0.8 + random() * 0.4), body, edge, scales);
        }
    }
}

// Hair from fur: thick guard hairs with a dark ladder of air in their medulla, and fine underfur.
function spHair(ctx, A) {
    spEach(A, 380, 600, 221 + A.layer * 5, (i, j, random) => {
        if (random() < 0.45) return;
        const guard = random() < 0.45;
        const width = guard ? 70 + random() * 40 : 14 + random() * 8;
        const path = spWander(random, i * 380 + random() * 380 - 1200, j * 380 + random() * 380, random() * 0.5 - 0.25, 2800, 60, 0.12);
        const tone = 0.6 + random() * 0.6;
        const body = C(176 * tone, 130 * tone, 86 * tone, 0.6);
        const edge = C(90 * tone, 60 * tone, 36 * tone, 0.85);
        spFibre(ctx, A, path, width, body, edge, { step: guard ? 12 : 7, color: C(80, 56, 34, 0.55), lean: 0.5 });
        if (guard && width * A.k > 6) {
            // The medulla: cells with air in them, dark by transmitted light.
            ctx.strokeStyle = 'rgba(40,28,18,0.75)';
            ctx.lineWidth = width * 0.33;
            microCurve(ctx, path);
            ctx.stroke();
            if (width * A.k > 40) {
                ctx.strokeStyle = 'rgba(200,170,130,0.6)';
                ctx.lineWidth = spW(A, 3);
                ctx.beginPath();
                for (let n = 1; n < path.length; n++) {
                    const [x, y] = path[n];
                    const [px, py] = path[n - 1];
                    const l = Math.hypot(x - px, y - py) || 1;
                    ctx.moveTo(x - ((y - py) / l) * width * 0.16, y + ((x - px) / l) * width * 0.16);
                    ctx.lineTo(x + ((y - py) / l) * width * 0.16, y - ((x - px) / l) * width * 0.16);
                }
                ctx.stroke();
            }
            // Pigment: grains of melanin in the cortex.
            if (width * A.k > 25) {
                ctx.fillStyle = 'rgba(60,36,20,0.6)';
                for (const [x, y] of path) {
                    for (let n = 0; n < 3; n++) {
                        microOval(ctx, x + (random() - 0.5) * width * 0.8, y + (random() - 0.5) * width * 0.4, 1.2, 0.8);
                        ctx.fill();
                    }
                }
            }
        }
    });
}

// A feather's vane: the barbs from the shaft, and from each barb the barbules, the far ones with hooklets that
// catch on the next barb's barbules and zip the vane shut.
function spFeather(ctx, A) {
    const shaftY = -1500;
    const barbGap = 140;
    if (A.layer === 0) {
        ctx.fillStyle = 'rgba(214,200,170,0.85)';
        ctx.fillRect(A.x0, shaftY - 260, A.x1 - A.x0, 520);
        ctx.strokeStyle = 'rgba(110,94,66,0.8)';
        ctx.lineWidth = spW(A, 8);
        spLine(ctx, A.x0, shaftY - 260, A.x1, shaftY - 260);
        ctx.stroke();
        spLine(ctx, A.x0, shaftY + 260, A.x1, shaftY + 260);
        ctx.stroke();
    }
    const slope = 0.85;
    for (const side of [-1, 1]) {
        const lo = Math.floor((A.x0 - 4000) / barbGap);
        const hi = Math.ceil((A.x1 + 200) / barbGap);
        for (let n = lo; n <= hi; n++) {
            const x0 = n * barbGap;
            const y0 = shaftY + side * 260;
            const length = 4000;
            const x1 = x0 + length;
            const y1 = y0 + side * length * slope;
            if (Math.max(x0, x1) < A.x0 - 300 || Math.min(x0, x1) > A.x1 + 300) continue;
            if (A.layer === 0) {
                ctx.strokeStyle = 'rgba(120,96,64,0.85)';
                ctx.lineWidth = spW(A, 26);
                spLine(ctx, x0, y0, x1, y1);
                ctx.stroke();
                continue;
            }
            // Barbules: about every 12 micrometres along each barb, slanting out from it.
            if (12 * A.k < 2.5) continue;
            const along = Math.hypot(length, length * slope);
            const ux = length / along;
            const uy = (side * length * slope) / along;
            ctx.strokeStyle = 'rgba(96,76,50,0.7)';
            ctx.lineWidth = spW(A, 2.5);
            ctx.beginPath();
            const step = 12;
            const tMin = Math.max(0, ((A.x0 - 200) - x0) / ux);
            const tMax = Math.min(along, ((A.x1 + 200) - x0) / ux);
            for (let t = Math.floor(tMin / step) * step; t < tMax; t += step) {
                const bx = x0 + ux * t;
                const by = y0 + uy * t;
                if (by < A.y0 - 200 || by > A.y1 + 200) continue;
                for (const way of [1, -1]) {
                    const angle = Math.atan2(uy, ux) + way * 0.75;
                    const ex = bx + Math.cos(angle) * 95;
                    const ey = by + Math.sin(angle) * 95;
                    ctx.moveTo(bx, by);
                    ctx.lineTo(ex, ey);
                    // Hooklets on the barbules that point away from the shaft.
                    if (way === 1 && 4 * A.k > 3) {
                        for (let h = 0.55; h < 1; h += 0.12) {
                            const hx = bx + (ex - bx) * h;
                            const hy = by + (ey - by) * h;
                            ctx.moveTo(hx, hy);
                            ctx.quadraticCurveTo(hx + uy * 4, hy - ux * 4, hx + ux * 2 + uy * 6, hy + uy * 2 - ux * 6);
                        }
                    }
                }
            }
            ctx.stroke();
        }
    }
}

// Leather: the grain side, with the mouths of the hair follicles; below it the weave of collagen bundles.
function spLeather(ctx, A) {
    if (A.layer === 1) {
        spGround(ctx, A, 'rgba(150,96,56,0.6)');
        spEach(A, 180, 300, 231, (i, j, random) => {
            const path = spWander(random, i * 180 + random() * 180, j * 180 + random() * 180, random() * 6, 500, 50, 1.1);
            spFibre(ctx, A, path, 40 + random() * 30, 'rgba(176,120,72,0.6)', 'rgba(90,54,26,0.7)', null);
            if (A.k > 1.2) {
                // Each bundle is many fibrils: fine lines along it.
                ctx.strokeStyle = 'rgba(110,70,40,0.5)';
                ctx.lineWidth = spW(A, 0.6);
                for (let f = -2; f <= 2; f++) {
                    microCurve(ctx, path.map(([x, y]) => [x + f * 5, y + f * 5]));
                    ctx.stroke();
                }
            }
        });
        return;
    }
    spEach(A, 400, 200, 233, (i, j, random) => {
        // Follicles come in small groups in many hides.
        const cx = i * 400 + random() * 400;
        const cy = j * 400 + random() * 400;
        const many = 1 + Math.floor(random() * 3);
        for (let n = 0; n < many; n++) {
            const r = 25 + random() * 45;
            if (r * A.k < 0.8) continue;
            microSmooth(ctx, spBlob(random, cx + n * r * 2.2, cy + (random() - 0.5) * r, r, 8, 0.3, 1.2));
            microFill(ctx, 'rgba(60,34,16,0.85)');
        }
    });
    if (A.k > 0.3) {
        ctx.strokeStyle = 'rgba(100,60,30,0.35)';
        spEach(A, 120, 120, 235, (i, j, random) => {
            ctx.lineWidth = spW(A, 2);
            microCurve(ctx, spWander(random, i * 120, j * 120, random() * 6, 200, 40, 1.5));
            ctx.stroke();
        });
    }
}

// A reptile's scale: keratin. The outlines of the big scales, and inside each the prints of the flat dead
// cells that made its outer layer, with fine teeth along their edges.
function spScale(ctx, A) {
    spGround(ctx, A, 'rgba(200,206,170,0.4)');
    const big = 1600;
    spEach(A, big, big, 241, (i, j, random) => {
        const x = i * big + (j & 1 ? big / 2 : 0);
        const y = j * big * 0.6;
        microOval(ctx, x, y, big * 0.62, big * 0.42);
        microFill(ctx, random() < 0.3 ? 'rgba(80,90,50,0.35)' : 'rgba(210,214,176,0.35)');
        microStroke(ctx, 'rgba(90,96,60,0.7)', spW(A, 12));
    });
    if (A.k > 0.7) {
        spMosaic(A, 22, 243, (points, i, j, random) => {
            spPoly(ctx, points);
            microStroke(ctx, 'rgba(110,116,80,0.5)', spW(A, 0.9));
            if (A.k > 2.5) {
                ctx.strokeStyle = 'rgba(110,116,80,0.45)';
                ctx.lineWidth = spW(A, 0.4);
                ctx.beginPath();
                const [ax, ay] = points[3];
                const [bx, by] = points[5];
                for (let t = 0; t <= 1; t += 0.2) {
                    const x = ax + (bx - ax) * t;
                    const y = ay + (by - ay) * t;
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + 1.5, y - 2.5);
                }
                ctx.stroke();
            }
            // Melanin, in some cells.
            if (random() < 0.15) {
                spPoly(ctx, points);
                microFill(ctx, 'rgba(60,50,30,0.25)');
            }
        });
    }
}

// A shell in thin section: an outer layer of prisms of calcite, an inner one of nacre in thin sheets.
function spShell(ctx, A) {
    const split = 200;
    spGround(ctx, A, 'rgba(236,228,206,0.55)');
    // Prisms: columns standing across the shell, each a crystal wrapped in a film of protein.
    if (A.x0 < split) {
        ctx.fillStyle = 'rgba(214,190,150,0.6)';
        ctx.fillRect(A.x0, A.y0, Math.min(split, A.x1) - A.x0, A.y1 - A.y0);
        if (40 * A.k > 3) {
            ctx.strokeStyle = 'rgba(120,90,50,0.7)';
            ctx.lineWidth = spW(A, 2);
            ctx.beginPath();
            for (let y = Math.floor(A.y0 / 40) * 40; y < A.y1; y += 40) {
                const wob = Math.sin(y * 0.11) * 6;
                ctx.moveTo(A.x0, y + wob);
                ctx.lineTo(Math.min(split, A.x1), y + wob * 0.3);
            }
            ctx.stroke();
        }
    }
    // Nacre: sheets about half a micrometre thick, at the edge of what light can show; growth lines are clear.
    if (A.x1 > split) {
        const from = Math.max(split, A.x0);
        ctx.strokeStyle = 'rgba(150,140,120,0.45)';
        ctx.lineWidth = spW(A, 3);
        ctx.beginPath();
        for (let x = Math.ceil(from / 90) * 90; x < A.x1; x += 90) {
            ctx.moveTo(x, A.y0);
            ctx.lineTo(x + Math.sin(x) * 20, A.y1);
        }
        ctx.stroke();
        if (A.k > 2.5) {
            ctx.strokeStyle = 'rgba(170,160,140,0.35)';
            ctx.lineWidth = spW(A, 0.3);
            ctx.beginPath();
            for (let x = Math.ceil(from / 0.9) * 0.9; x < A.x1; x += 0.9) {
                ctx.moveTo(x, A.y0);
                ctx.lineTo(x, A.y1);
            }
            ctx.stroke();
        }
    }
    ctx.strokeStyle = 'rgba(90,70,40,0.85)';
    ctx.lineWidth = spW(A, 6);
    spLine(ctx, split, A.y0, split, A.y1);
    ctx.stroke();
}

// Paper: a felt of flattened wood fibres, sometimes stained blue by the Prussian blue of a blueprint.
function spPaper(ctx, A, p) {
    spGround(ctx, A, p.ground);
    const blue = p.ink === 'prussian';
    // At 40x the two layers of fibres are one felt: the lower one adds nothing to see.
    if (A.layer === 1 && A.k < 0.6) return spPaperMarks(ctx, A, p);
    spEach(A, 170, 600, 251 + A.layer * 3, (i, j, random) => {
        const path = spWander(random, i * 170 + random() * 170, j * 170 + random() * 170, random() * Math.PI * 2, 700 + random() * 900, A.k < 0.6 ? 120 : 60, 0.35);
        const inkHere = blue && !(p.lines && spInkLine(path[0][0], path[0][1]));
        const body = inkHere ? 'rgba(70,110,190,0.42)' : 'rgba(246,242,228,0.55)';
        const edge = inkHere ? 'rgba(30,60,140,0.65)' : 'rgba(150,140,110,0.6)';
        spFibre(ctx, A, path, 26 + random() * 16, body, edge, { step: 18, color: inkHere ? 'rgba(30,60,140,0.4)' : 'rgba(150,140,110,0.4)', lean: 0.1 });
    });
    spPaperMarks(ctx, A, p);
}

// What lies on the fibres: pigment, ink, pencil, and starch if iodine found it.
function spPaperMarks(ctx, A, p) {
    const blue = p.ink === 'prussian';
    if (blue && A.k > 0.8) {
        // The pigment itself: tiny blue grains in and on the fibres.
        spEach(A, 14, 0, 257, (i, j, random) => {
            if (random() < 0.6 || (p.lines && spInkLine(i * 14, j * 14))) return;
            microOval(ctx, i * 14 + random() * 14, j * 14 + random() * 14, 1.2, 1);
            microFill(ctx, 'rgba(14,40,120,0.8)');
        });
    }
    if (p.ink === 'black') {
        // Ink lines of a chart: black particles sitting among the fibres.
        spEach(A, 700, 100, 259, (i, j, random) => {
            ctx.strokeStyle = 'rgba(20,20,24,0.8)';
            ctx.lineWidth = spW(A, 60 + random() * 80);
            const x = i * 700 + random() * 700;
            spLine(ctx, x, j * 700, x + (random() - 0.5) * 600, j * 700 + 700);
            ctx.stroke();
        });
    } else if (p.ink === 'pencil') {
        // Pencil: flakes of graphite smeared along the fibres, shiny grey.
        spEach(A, 90, 0, 261, (i, j, random) => {
            if (Math.abs(((j * 90) % 1200) - 600) > 140 || random() < 0.3) return;
            spPoly(ctx, spShard(random, i * 90 + random() * 90, j * 90 + random() * 90, 6 + random() * 12, 5, 0));
            microFill(ctx, 'rgba(70,72,78,0.75)');
        });
    }
    if (A.marks && A.marks.starch) {
        // Starch sizing in ordinary paper: iodine shows it in dark patches. Banknote paper has none.
        spEach(A, 300, 100, 263, (i, j, random) => {
            if (random() < 0.5) return;
            microSmooth(ctx, spBlob(random, i * 300 + random() * 300, j * 300 + random() * 300, 40 + random() * 120, 8, 0.6));
            microMarkFill(ctx, A.marks.starch);
        });
    }
}

// Where the drawing's lines of a blueprint are, which stayed white.
function spInkLine(x, y) {
    return Math.abs(((x % 900) + 900) % 900 - 450) < 70 || Math.abs(((y % 1300) + 1300) % 1300 - 650) < 50;
}

// ---------------------------------------------------------------------------------------
// Electronics

// A circuit board: glass-fibre cloth in epoxy, green solder mask, copper tracks and the parts soldered on.
function spCircuit(ctx, A, p) {
    spGround(ctx, A, 'rgba(120,170,96,0.55)');
    // The glass cloth: bundles of fine glass filaments woven over and under, seen through the resin.
    const bundle = 420;
    ctx.fillStyle = 'rgba(210,226,186,0.35)';
    for (let x = Math.floor(A.x0 / bundle) * bundle; x < A.x1; x += bundle) ctx.fillRect(x, A.y0, bundle * 0.7, A.y1 - A.y0);
    for (let y = Math.floor(A.y0 / bundle) * bundle; y < A.y1; y += bundle) ctx.fillRect(A.x0, y, A.x1 - A.x0, bundle * 0.7);
    if (7 * A.k > 2) {
        // Each bundle is hundreds of filaments a few micrometres thick.
        ctx.strokeStyle = 'rgba(90,130,80,0.35)';
        ctx.lineWidth = spW(A, 0.8);
        ctx.beginPath();
        for (let x = Math.floor(A.x0 / bundle) * bundle; x < A.x1; x += bundle) {
            for (let f = 0; f < bundle * 0.7; f += 7) {
                ctx.moveTo(x + f, A.y0);
                ctx.lineTo(x + f, A.y1);
            }
        }
        ctx.stroke();
    }
    if (p.chip === 'comb') {
        // A rain sensor: two combs of copper whose fingers interlock; a drop between them closes the circuit.
        const pitch = 1000;
        for (let y = Math.floor(A.y0 / pitch) * pitch; y < A.y1 + pitch; y += pitch) {
            ctx.fillStyle = spLit(A, 214, 150, 90);
            ctx.fillRect(A.x0, y, A.x1 - A.x0, 420);
        }
        return;
    }
    if (p.chip === 'ldr') {
        // A light sensor: a white ceramic disc with a zigzag pair of electrodes, and a film of cadmium sulphide
        // between them that conducts better the more light falls on it.
        ctx.fillStyle = spLit(A, 236, 232, 220);
        microOval(ctx, 0, 0, 2400, 2400);
        ctx.fill();
        ctx.fillStyle = 'rgba(214,120,40,0.85)';
        ctx.fillRect(-1900, -1700, 3800, 3400);
        ctx.strokeStyle = spLit(A, 200, 200, 196);
        ctx.lineWidth = spW(A, 120);
        ctx.beginPath();
        for (let x = -1800, n = 0; x <= 1800; x += 300, n++) {
            ctx.moveTo(x, n % 2 ? -1800 : -1500);
            ctx.lineTo(x, n % 2 ? 1500 : 1800);
        }
        ctx.stroke();
        return;
    }
    // A logic gate: tracks, pads, the chip and a few tiny resistors.
    ctx.strokeStyle = spLit(A, 210, 140, 80);
    ctx.lineCap = 'round';
    spEach(A, 900, 900, 271, (i, j, random) => {
        ctx.lineWidth = spW(A, 160 + random() * 140);
        const x = i * 900;
        const y = j * 900 + random() * 900;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const midX = x + 300 + random() * 500;
        ctx.lineTo(midX, y);
        ctx.lineTo(midX + 200, y + (random() < 0.5 ? 200 : -200));
        ctx.lineTo(x + 1800, y + (random() < 0.5 ? 200 : -200));
        ctx.stroke();
        if (random() < 0.4) {
            microOval(ctx, x, y, 350, 350);
            microFill(ctx, spLit(A, 220, 214, 200));
            microOval(ctx, x, y, 140, 140);
            microFill(ctx, 'rgba(250,252,250,0.95)');
        }
    });
    // The chip: black epoxy, opaque; legs of tinned copper on both sides.
    const chipX = 2600;
    ctx.fillStyle = spLit(A, 40, 40, 44);
    ctx.fillRect(chipX - 1800, -2600, 3600, 5200);
    ctx.fillStyle = spLit(A, 214, 214, 210);
    for (let y = -2300; y <= 2300; y += 1270) {
        ctx.fillRect(chipX - 2600, y - 220, 800, 440);
        ctx.fillRect(chipX + 1800, y - 220, 800, 440);
    }
    if (A.lit > 0.3) {
        ctx.fillStyle = spLit(A, 200, 200, 200, 0.6);
        microOval(ctx, chipX - 1300, -2100, 160, 160);
        ctx.fill();
    }
    // Two tiny resistors (0.6 mm long): a black top on a white ceramic body, silver ends.
    for (const [x, y] of [[-300, 500], [-1400, -900]]) {
        ctx.fillStyle = spLit(A, 220, 220, 214);
        ctx.fillRect(x - 300, y - 150, 600, 300);
        ctx.fillStyle = spLit(A, 30, 30, 30);
        ctx.fillRect(x - 180, y - 150, 360, 300);
    }
}

// A solar cell: a silicon wafer, opaque, blue under its anti-reflection coat, with fine silver fingers.
function spSolar(ctx, A) {
    spGround(ctx, A, spLit(A, 30, 46, 110));
    if (5 * A.k > 12) {
        // Its surface is etched into tiny pyramids a few micrometres across, which trap the light.
        spEach(A, 5, 0, 281, (i, j, random) => {
            if (random() < 0.5) return;
            const x = i * 5 + random() * 3;
            const y = j * 5 + random() * 3;
            const s = 1.5 + random() * 2.5;
            spPoly(ctx, [[x, y - s], [x + s, y], [x, y + s], [x - s, y]]);
            microFill(ctx, spLit(A, 70, 96, 170, 0.8));
        });
    } else if (5 * A.k > 1.5) {
        // Smaller than a few pixels: only a glitter where a face happens to catch the light.
        spEach(A, 14, 0, 283, (i, j, random) => {
            if (random() < 0.6) return;
            ctx.fillStyle = spLit(A, 80, 110, 190, 0.7);
            ctx.fillRect(i * 14 + random() * 10, j * 14 + random() * 10, 3, 3);
        });
    }
    ctx.fillStyle = spLit(A, 214, 216, 220);
    for (let x = Math.floor(A.x0 / 1700) * 1700; x < A.x1; x += 1700) ctx.fillRect(x, A.y0, 70, A.y1 - A.y0);
    for (let y = Math.floor(A.y0 / 9000) * 9000 + 4000; y < A.y1; y += 9000) ctx.fillRect(A.x0, y, A.x1 - A.x0, 1300);
}

// The filament of a light bulb: tungsten wire wound in a coil, and the coil wound again (a coiled coil).
// Against the light it is a black silhouette.
function spFilament(ctx, A) {
    const wire = 22;
    const R2 = 340;
    const P2 = 560;
    const r1 = 55;
    const p1 = 64;
    const turnsPer = P2 / p1;
    ctx.strokeStyle = 'rgba(14,12,10,0.95)';
    ctx.lineWidth = spW(A, wire);
    ctx.lineJoin = 'round';
    const steps = Math.max(8, Math.min(48, Math.round(p1 * A.k / 2)));
    const from = Math.floor((A.x0 - 800) / P2) * P2;
    const to = A.x1 + 800;
    ctx.beginPath();
    let first = true;
    for (let s = from; s <= to; s += p1 / steps) {
        const t = (s / P2) * Math.PI * 2;
        const t1 = t * turnsPer;
        // Centre of the primary coil travels round the big helix; the wire turns round that centre.
        const cx = s;
        const cy = Math.sin(t) * R2;
        const x = cx + Math.cos(t1) * r1 * 0.4;
        const y = cy + Math.sin(t1) * r1;
        if (first) {
            ctx.moveTo(x, y);
            first = false;
        } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (A.lit > 0.05 && wire * A.k > 30) {
        // Lines along the wire from the dies it was drawn through, seen by the room's light.
        ctx.strokeStyle = spLit(A, 160, 160, 160, 0.5);
        ctx.lineWidth = spW(A, 0.6);
        ctx.stroke();
    }
}

// Copper wire: strands of copper twisted together in a clear coat of plastic, side on.
function spWire(ctx, A) {
    ctx.fillStyle = 'rgba(200,60,40,0.3)';
    ctx.fillRect(A.x0, -900, A.x1 - A.x0, 1800);
    for (let n = -3; n <= 3; n++) {
        const y = n * 220;
        ctx.fillStyle = spLit(A, 214, 132, 80);
        ctx.fillRect(A.x0, y - 100, A.x1 - A.x0, 200);
        ctx.strokeStyle = spLit(A, 120, 70, 40);
        ctx.lineWidth = spW(A, 10);
        ctx.beginPath();
        for (let x = Math.floor(A.x0 / 500) * 500 + n * 70; x < A.x1; x += 500) {
            ctx.moveTo(x, y - 100);
            ctx.lineTo(x + 120, y + 100);
        }
        ctx.stroke();
        if (A.lit > 0.3) {
            // The scratches of drawing the wire, along it.
            ctx.strokeStyle = spLit(A, 250, 190, 140, 0.5);
            ctx.lineWidth = spW(A, 4);
            spLine(ctx, A.x0, y - 40, A.x1, y - 40);
            ctx.stroke();
        }
    }
}

// A mirror: glass with a silver film a tenth of a micrometre thick, then copper and paint behind. Not a ray
// gets through, except at a scratch or a pinhole in the silver.
function spMirror(ctx, A) {
    spGround(ctx, A, spLit(A, 226, 228, 232));
    spEach(A, 200, 100, 291, (i, j, random) => {
        if (random() < 0.65) return;
        const r = 1 + random() * (random() < 0.1 ? 25 : 5);
        microOval(ctx, i * 200 + random() * 200, j * 200 + random() * 200, Math.max(r, A.px * 0.8), Math.max(r, A.px * 0.8));
        microFill(ctx, 'rgba(255,252,236,0.95)');
    });
    ctx.strokeStyle = 'rgba(255,252,236,0.9)';
    spEach(A, 1600, 1600, 293, (i, j, random) => {
        if (random() < 0.5) return;
        ctx.lineWidth = spW(A, 2 + random() * 6);
        microCurve(ctx, spWander(random, i * 1600, j * 1600, random() * 6, 2500, 400, 0.25));
        ctx.stroke();
    });
}

// Glass: nothing. It is amorphous: no grains, no cells, no crystals, only a few bubbles (seeds), the dust on
// its surface and a scratch.
function spGlass(ctx, A, p) {
    if (A.layer === 0) {
        spGround(ctx, A, p.tint);
        spEach(A, 1800, 300, 301, (i, j, random) => {
            if (random() < 0.6) return;
            const r = 10 + random() * 60;
            microOval(ctx, i * 1800 + random() * 1800, j * 1800 + random() * 1800, r * 1.6, r);
            microFill(ctx, 'rgba(255,255,255,0.4)');
            microStroke(ctx, 'rgba(40,40,40,0.75)', spW(A, r * 0.2));
        });
        return;
    }
    spEach(A, 380, 200, 303, (i, j, random) => {
        if (random() < 0.5) return;
        const x = i * 380 + random() * 380;
        const y = j * 380 + random() * 380;
        if (random() < 0.85) {
            const r = 2 + random() * 9;
            if (r * A.k < 0.6) return;
            spPoly(ctx, spShard(random, x, y, r, 5, random() * 6));
            microFill(ctx, 'rgba(90,80,64,0.6)');
        } else {
            ctx.strokeStyle = 'rgba(120,120,120,0.35)';
            ctx.lineWidth = spW(A, 1.5);
            spLine(ctx, x, y, x + 900, y + (random() - 0.5) * 400);
            ctx.stroke();
        }
    });
}

// ---------------------------------------------------------------------------------------
// Food and plants

// Bread: a foam. The holes left by the gas of the yeast, and walls of gluten full of swollen starch grains.
function spBread(ctx, A) {
    spGround(ctx, A, 'rgba(226,206,160,0.6)');
    spEach(A, 520, 900, 311, (i, j, random) => {
        const x = i * 520 + random() * 520;
        const y = j * 520 + random() * 520;
        const r = 120 + random() * (random() < 0.15 ? 700 : 260);
        if (r * A.k < 0.8) return;
        microSmooth(ctx, spBlob(random, x, y, r, 10, 0.35, 0.8 + random() * 0.5, random() * 3));
        spClear(ctx, A, 'rgba(252,250,244,0.92)');
        microStroke(ctx, 'rgba(150,120,70,0.6)', spW(A, Math.max(3, r * 0.03)));
    });
    // Starch, swollen and buckled by baking; small grains whole.
    if (25 * A.k > 5) {
        spEach(A, 40, 0, 313, (i, j, random) => {
            if (random() < 0.45) return;
            const big = random() < 0.6;
            const r = big ? 10 + random() * 10 : 2.5 + random() * 3;
            spStarch(ctx, A, i * 40 + random() * 40, j * 40 + random() * 40, r, big, random);
        });
    }
}

// A grain of wheat cut through: the bran, one row of aleurone cells, then the floury endosperm packed with
// starch: big lens-shaped grains and small round ones.
function spSeed(ctx, A) {
    spGround(ctx, A, 'rgba(232,222,196,0.5)');
    const bran = -900;
    if (A.x0 < bran) {
        ctx.fillStyle = 'rgba(166,110,56,0.8)';
        ctx.fillRect(A.x0, A.y0, Math.min(bran - 70, A.x1) - A.x0, A.y1 - A.y0);
        if (A.k > 0.3) {
            ctx.strokeStyle = 'rgba(100,60,24,0.6)';
            ctx.lineWidth = spW(A, 2);
            ctx.beginPath();
            for (let y = Math.floor(A.y0 / 18) * 18; y < A.y1; y += 18) {
                ctx.moveTo(A.x0, y);
                ctx.lineTo(bran - 70, y);
            }
            ctx.stroke();
        }
    }
    // Aleurone: square cells with thick walls and dense protein.
    if (A.x0 < bran + 60 && A.x1 > bran - 70) {
        for (let y = Math.floor(A.y0 / 55) * 55; y < A.y1; y += 55) {
            ctx.fillStyle = 'rgba(176,150,96,0.85)';
            ctx.fillRect(bran - 66, y + 3, 60, 49);
            if (A.k > 0.6) {
                ctx.fillStyle = 'rgba(200,180,130,0.9)';
                ctx.fillRect(bran - 58, y + 10, 44, 35);
                spNucleus(ctx, A, bran - 36, y + 27, 7, 7);
            }
        }
    }
    // Endosperm cells, packed.
    const right = { ...A, x0: Math.max(A.x0, bran) };
    if (right.x1 <= right.x0) return;
    spMosaic(right, 130, 321, (points) => {
        spPoly(ctx, points);
        microStroke(ctx, 'rgba(150,130,90,0.6)', spW(A, 2));
    });
    if (15 * A.k > 4) {
        spEach(right, 22, 0, 323, (i, j, random) => {
            if (i * 22 < bran) return;
            const big = random() < 0.4;
            spStarch(ctx, A, i * 22 + random() * 22, j * 22 + random() * 22, big ? 8 + random() * 7 : 2 + random() * 2.5, false, random);
        });
    }
}

// Honey: what the bees brought with the nectar, in a clear amber syrup: pollen of many plants, and if it
// has set, the crystals of glucose that make it go solid.
function spHoney(ctx, A) {
    if (A.layer === 0) spGround(ctx, A, 'rgba(230,170,50,0.28)');
    spEach(A, 90, 60, 331 + A.layer * 7, (i, j, random) => {
        if (random() < 0.45) return;
        const x = i * 90 + random() * 90;
        const y = j * 90 + random() * 90;
        const roll = random();
        const r = 10 + random() * 18;
        if (r * A.k < 1) return;
        const coat = 'rgba(214,170,70,0.75)';
        const line = 'rgba(120,80,20,0.85)';
        microOval(ctx, x, y, r, roll < 0.5 ? r * 0.7 : r);
        if (A.marks && A.marks.pollen) microMarkFill(ctx, A.marks.pollen); else microFill(ctx, coat);
        microStroke(ctx, line, spW(A, Math.max(1, r * 0.1)));
        if (r * A.k < 6) return;
        if (roll < 0.5) {
            // Three furrows, the commonest kind of pollen among flowering plants.
            ctx.strokeStyle = line;
            ctx.lineWidth = spW(A, r * 0.08);
            for (const off of [-0.45, 0, 0.45]) {
                spLine(ctx, x + off * r, y - r * 0.5, x + off * r, y + r * 0.5);
                ctx.stroke();
            }
        } else if (roll < 0.8) {
            // Spines, like those of the daisy family.
            ctx.strokeStyle = line;
            ctx.lineWidth = spW(A, r * 0.07);
            ctx.beginPath();
            for (let n = 0; n < 16; n++) {
                const a = (n / 16) * Math.PI * 2;
                ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
                ctx.lineTo(x + Math.cos(a) * r * 1.22, y + Math.sin(a) * r * 1.22);
            }
            ctx.stroke();
        } else {
            // A net on its surface.
            spHatch(ctx, A, spBox(x, y, r * 1.4, r * 1.4, 0), x, y, 0.7, r * 0.25, line, r * 0.04, r);
            spHatch(ctx, A, spBox(x, y, r * 1.4, r * 1.4, 0), x, y, 2.3, r * 0.25, line, r * 0.04, r);
        }
    });
    if (A.layer === 1) {
        // Glucose crystals: clusters of fine needles and plates.
        spEach(A, 500, 200, 337, (i, j, random) => {
            if (random() < 0.5) return;
            const x = i * 500 + random() * 500;
            const y = j * 500 + random() * 500;
            for (let n = 0; n < 12; n++) {
                const turn = random() * Math.PI * 2;
                const l = 30 + random() * 80;
                spPoly(ctx, spBox(x + Math.cos(turn) * l / 2, y + Math.sin(turn) * l / 2, l, 6 + random() * 8, turn));
                microFill(ctx, 'rgba(252,246,226,0.6)');
                microStroke(ctx, 'rgba(150,110,40,0.6)', spW(A, 1));
            }
        });
    }
}

// Fish muscle, cooked: long fibres side by side, banded across (each band a sarcomere, two micrometres or so),
// their nuclei along the edges; cooking has shrunk them apart and broken the bands in places.
function spMuscle(ctx, A, p) {
    const fibre = 80;
    for (let y = Math.floor(A.y0 / fibre) * fibre; y < A.y1 + fibre; y += fibre) {
        const random = spRng(0, Math.round(y / fibre), A.seed + 341);
        const gap = 6 + random() * 12;
        const top = y + gap / 2;
        const h = fibre - gap;
        ctx.fillStyle = 'rgba(232,216,196,0.75)';
        ctx.fillRect(A.x0, top, A.x1 - A.x0, h);
        ctx.strokeStyle = 'rgba(140,110,80,0.7)';
        ctx.lineWidth = spW(A, 1.5);
        ctx.strokeRect(A.x0 - 10, top, A.x1 - A.x0 + 20, h);
        if (2.3 * A.k > 3) {
            ctx.strokeStyle = 'rgba(150,120,90,0.55)';
            ctx.lineWidth = 2.3 * 0.45;
            ctx.beginPath();
            for (let x = Math.floor(A.x0 / 2.3) * 2.3; x < A.x1; x += 2.3) {
                if (Math.sin(x * 0.013 + y) > 0.92) continue;
                ctx.moveTo(x, top);
                ctx.lineTo(x + Math.sin(y) * 2, top + h);
            }
            ctx.stroke();
        } else if (A.k > 0.6) {
            // At 100x the bands blur into a faint sheen; breaks from cooking show as cross lines.
            ctx.strokeStyle = 'rgba(150,120,90,0.4)';
            ctx.lineWidth = spW(A, 3);
            ctx.beginPath();
            for (let x = Math.floor(A.x0 / 120) * 120; x < A.x1; x += 120 + random() * 80) {
                ctx.moveTo(x, top);
                ctx.lineTo(x + 6, top + h);
            }
            ctx.stroke();
        }
        // Nuclei, just under the edge of each fibre.
        for (let x = Math.floor(A.x0 / 90) * 90; x < A.x1; x += 90) {
            const nx = x + random() * 60;
            const ny = random() < 0.5 ? top + 4 : top + h - 4;
            if (A.marks && A.marks.nucleus) spNucleus(ctx, A, nx, ny, 7, 2.2);
            else if (A.k > 1.2) {
                microOval(ctx, nx, ny, 7, 2.2);
                microFill(ctx, 'rgba(170,140,110,0.5)');
            }
        }
    }
    if (p.salted) {
        spCrystals(ctx, A, MICRO_SPECIMENS.salt.params);
    }
}

// Plant epidermis and what lies under it. p.plant: cactus, moss, grass.
function spPlant(ctx, A, p) {
    if (p.plant === 'moss') return spMoss(ctx, A);
    if (p.plant === 'grass') return spGrass(ctx, A);
    // Cactus: small many-sided epidermal cells under a thick waxy cuticle, stomata here and there; deeper,
    // big cells of the green cortex with star-shaped crystals of calcium oxalate (druses).
    if (A.layer === 0) {
        spGround(ctx, A, 'rgba(196,220,170,0.4)');
        if (34 * A.k < 6) return;
        spMosaic(A, 34, 351, (points, i, j, random, cx, cy) => {
            spPoly(ctx, points);
            microStroke(ctx, 'rgba(90,120,60,0.6)', spW(A, 1.6));
            spNucleus(ctx, A, cx, cy, 4, 4);
            if (random() < 0.1) {
                microOval(ctx, cx, cy, 14, 9, random() * 3);
                microFill(ctx, 'rgba(110,150,70,0.7)');
                microOval(ctx, cx, cy, 8, 2, 0);
                microFill(ctx, 'rgba(240,246,220,0.9)');
            }
        });
        return;
    }
    spGround(ctx, A, 'rgba(120,170,80,0.35)');
    spMosaic(A, 120, 353, (points, i, j, random, cx, cy) => {
        spPoly(ctx, points);
        microStroke(ctx, 'rgba(70,110,40,0.5)', spW(A, 2));
        if (A.k > 0.6) {
            for (let n = 0; n < 12; n++) {
                const [dx, dy] = microInDisc(random, 45);
                microOval(ctx, cx + dx, cy + dy, 3.5, 2.5, random() * 3);
                microFill(ctx, 'rgba(60,140,40,0.75)');
                if (A.marks && A.marks.starch && random() < 0.6) {
                    microOval(ctx, cx + dx, cy + dy, 1.4, 1.2);
                    microMarkFill(ctx, A.marks.starch);
                }
            }
        }
        if (random() < 0.12) {
            const r = 14 + random() * 14;
            ctx.strokeStyle = 'rgba(40,40,30,0.8)';
            ctx.lineWidth = spW(A, 3);
            ctx.beginPath();
            for (let n = 0; n < 10; n++) {
                const a = (n / 10) * Math.PI * 2 + random() * 0.3;
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            }
            ctx.stroke();
            microOval(ctx, cx, cy, r * 0.5, r * 0.5);
            microFill(ctx, 'rgba(230,230,220,0.85)');
        }
    });
}

// Moss: little leaves one cell thick, every cell full of chloroplasts, a midrib of narrow cells down the middle.
function spMoss(ctx, A) {
    spEach(A, 900, 1700, 361 + A.layer * 5, (i, j, random) => {
        if (random() < 0.2) return;
        const cx = i * 900 + random() * 500;
        const cy = j * 900 + random() * 500;
        const turn = random() * Math.PI * 2;
        const length = 1100 + random() * 600;
        const width = 300 + random() * 120;
        const c = Math.cos(turn);
        const s = Math.sin(turn);
        // A leaf wholly outside the area costs nothing.
        const mx = cx + (c * length) / 2;
        const my = cy + (s * length) / 2;
        if (mx < A.x0 - length / 2 || mx > A.x1 + length / 2 || my < A.y0 - length / 2 || my > A.y1 + length / 2) return;
        const leaf = [];
        for (let n = 0; n <= 20; n++) {
            const t = n / 20;
            const half = width / 2 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7;
            leaf.push([t * length, half]);
        }
        for (let n = 20; n >= 0; n--) leaf.push([leaf[n][0], -leaf[n][1]]);
        const points = leaf.map(([u, v]) => [cx + u * c - v * s, cy + u * s + v * c]);
        spPoly(ctx, points);
        microFill(ctx, 'rgba(120,180,70,0.45)');
        microStroke(ctx, 'rgba(60,110,30,0.7)', spW(A, 3));
        ctx.save();
        spPoly(ctx, points);
        ctx.clip();
        if (15 * A.k > 3) {
            // The cells, in rows along the leaf.
            const cw = 38;
            const ch = 15;
            for (let u = 0; u < length; u += cw) {
                for (let v = -width / 2; v < width / 2; v += ch) {
                    const ox = cx + (u + (Math.round(v / ch) & 1 ? cw / 2 : 0)) * c - v * s;
                    const oy = cy + (u + (Math.round(v / ch) & 1 ? cw / 2 : 0)) * s + v * c;
                    if (ox < A.x0 - cw || ox > A.x1 + cw || oy < A.y0 - cw || oy > A.y1 + cw) continue;
                    const narrow = Math.abs(v) < 22;
                    spPoly(ctx, spBox(ox, oy, narrow ? cw * 1.5 : cw, narrow ? ch * 0.55 : ch, turn));
                    microStroke(ctx, 'rgba(60,100,30,0.65)', spW(A, 1));
                    if (!narrow && 3 * A.k > 2) {
                        const r = spRng(Math.round(u), Math.round(v), A.seed);
                        for (let n = 0; n < 6; n++) {
                            const px = ox + (r() - 0.5) * cw * 0.7 * c - (r() - 0.5) * ch * 0.6 * s;
                            const py = oy + (r() - 0.5) * cw * 0.7 * s + (r() - 0.5) * ch * 0.6 * c;
                            microOval(ctx, px, py, 2.3, 1.8, r() * 3);
                            microFill(ctx, 'rgba(40,140,30,0.85)');
                            if (A.marks && A.marks.starch && n < 3) {
                                microOval(ctx, px, py, 0.9, 0.8);
                                microMarkFill(ctx, A.marks.starch);
                            }
                        }
                        spNucleus(ctx, A, ox, oy, 3, 2.4, turn);
                    }
                }
            }
        }
        ctx.restore();
    });
}

// A grass leaf: long cells in rows with wavy walls, short silica cells over the veins with dumbbell-shaped
// bodies of silica, and rows of stomata.
function spGrass(ctx, A) {
    spGround(ctx, A, 'rgba(160,200,120,0.35)');
    const row = 22;
    for (let y = Math.floor(A.y0 / row) * row; y < A.y1 + row; y += row) {
        const r = spRng(0, Math.round(y / row), A.seed + 371);
        const band = ((Math.round(y / row) % 14) + 14) % 14;
        const vein = band < 2;
        ctx.fillStyle = vein ? 'rgba(120,170,80,0.45)' : 'rgba(0,0,0,0)';
        if (vein) ctx.fillRect(A.x0, y, A.x1 - A.x0, row);
        if (row * A.k < 3) continue;
        ctx.strokeStyle = 'rgba(80,120,50,0.6)';
        ctx.lineWidth = spW(A, 1.2);
        spLine(ctx, A.x0, y, A.x1, y);
        ctx.stroke();
        let x = Math.floor(A.x0 / 400) * 400 - r() * 100;
        while (x < A.x1) {
            const stoma = band === 6 && r() < 0.35;
            const w = vein ? (r() < 0.5 ? 18 : 90) : stoma ? 40 : 110 + r() * 80;
            // A wavy wall between neighbours.
            ctx.beginPath();
            ctx.moveTo(x, y);
            for (let t = 1; t <= 4; t++) ctx.lineTo(x + (t % 2 ? 3 : -3), y + (row * t) / 4);
            ctx.stroke();
            if (vein && w < 30 && 12 * A.k > 4) {
                // A silica body, shaped like a dumbbell.
                microOval(ctx, x + 5, y + row / 2, 4, 5);
                microFill(ctx, 'rgba(236,240,226,0.9)');
                microOval(ctx, x + 13, y + row / 2, 4, 5);
                microFill(ctx, 'rgba(236,240,226,0.9)');
                ctx.fillRect(x + 6, y + row / 2 - 1.5, 6, 3);
            }
            if (stoma && 20 * A.k > 4) {
                microOval(ctx, x + w / 2, y + row / 2, w * 0.42, row * 0.4);
                microFill(ctx, 'rgba(100,150,60,0.7)');
                spLine(ctx, x + w * 0.2, y + row / 2, x + w * 0.8, y + row / 2);
                microStroke(ctx, 'rgba(30,50,20,0.8)', spW(A, 1.2));
            } else if (!vein) spNucleus(ctx, A, x + w / 2, y + row / 2, 5, 3);
            x += w;
        }
    }
}

// ---------------------------------------------------------------------------------------
// The catalogue

// How each kind takes each stain: tint and amount for the lens, and the parts that stand out. Minerals,
// metals and glass take nothing: there is nothing in them for the dye to hold on to.
const SP_IODINE = [204, 150, 58];
const SP_BLUE = [98, 152, 218];
const SP_STARCH = 'rgba(26,20,60,0.96)';
const SP_NUCLEUS = 'rgba(22,42,130,0.94)';
const SP_NONE = { tint: SP_IODINE, amount: 0 };
const SP_NONE_BLUE = { tint: SP_BLUE, amount: 0 };
const SP_STAINS = {
    none: { iodine_tincture: SP_NONE, methylene_blue: SP_NONE_BLUE },
    soluble: { iodine_tincture: { tint: SP_IODINE, amount: 0, dissolve: true }, methylene_blue: { tint: SP_BLUE, amount: 0, dissolve: true } },
    wood: { iodine_tincture: { tint: SP_IODINE, amount: 0.35, starch: SP_STARCH }, methylene_blue: { tint: SP_BLUE, amount: 0.55 } },
    starch: { iodine_tincture: { tint: SP_IODINE, amount: 0.5, starch: SP_STARCH }, methylene_blue: { tint: SP_BLUE, amount: 0.3, nucleus: SP_NUCLEUS } },
    baked: { iodine_tincture: { tint: SP_IODINE, amount: 0.5, starch: SP_STARCH }, methylene_blue: { tint: SP_BLUE, amount: 0.3 } },
    plant: { iodine_tincture: { tint: SP_IODINE, amount: 0.4, starch: SP_STARCH }, methylene_blue: { tint: SP_BLUE, amount: 0.35, nucleus: SP_NUCLEUS } },
    protein: { iodine_tincture: { tint: SP_IODINE, amount: 0.5 }, methylene_blue: { tint: SP_BLUE, amount: 0.45 } },
    muscle: { iodine_tincture: { tint: SP_IODINE, amount: 0.55 }, methylene_blue: { tint: SP_BLUE, amount: 0.35, nucleus: SP_NUCLEUS } },
    paper: { iodine_tincture: { tint: SP_IODINE, amount: 0.3, starch: SP_STARCH }, methylene_blue: { tint: SP_BLUE, amount: 0.4 } },
    honey: { iodine_tincture: { tint: SP_IODINE, amount: 0.3, pollen: 'rgba(190,120,40,0.85)' }, methylene_blue: { tint: SP_BLUE, amount: 0.25, pollen: 'rgba(110,130,190,0.8)' } },
    circuit: { iodine_tincture: { tint: SP_IODINE, amount: 0.05 }, methylene_blue: { tint: SP_BLUE, amount: 0.05 } }
};

// kind: draw (the function), layers (the depth of each), stain (in SP_STAINS), opaque (lit from above).
const MICRO_SPECIMEN_KINDS = {
    wood: { draw: spWood, layers: [0.5], stain: 'wood' },
    sand: { draw: spSand, layers: [0.38, 0.5, 0.62], stain: 'none' },
    crystals: { draw: spCrystals, layers: [0.42, 0.56], stain: 'none' },
    ice: { draw: spIce, layers: [0.5], stain: 'none' },
    rock: { draw: spRock, layers: [0.5], stain: 'none' },
    obsidian: { draw: spObsidian, layers: [0.5], stain: 'none' },
    coal: { draw: spCoal, layers: [0.5], stain: 'none' },
    ore: { draw: spOre, layers: [0.5], stain: 'none' },
    metal: { draw: spMetal, layers: [0.5], stain: 'none', opaque: true },
    gold_leaf: { draw: spGoldLeaf, layers: [0.5], stain: 'none' },
    gem: { draw: spGem, layers: [0.5], stain: 'none' },
    weave: { draw: spWeave, layers: [0.45, 0.55], stain: 'protein' },
    hair: { draw: spHair, layers: [0.42, 0.58], stain: 'protein' },
    feather: { draw: spFeather, layers: [0.5, 0.5], stain: 'protein' },
    leather: { draw: spLeather, layers: [0.45, 0.6], stain: 'protein' },
    scale: { draw: spScale, layers: [0.5], stain: 'protein' },
    shell: { draw: spShell, layers: [0.5], stain: 'none' },
    paper: { draw: spPaper, layers: [0.46, 0.54], stain: 'paper' },
    circuit: { draw: spCircuit, layers: [0.5], stain: 'circuit', opaque: true },
    solar: { draw: spSolar, layers: [0.5], stain: 'none', opaque: true },
    filament: { draw: spFilament, layers: [0.5], stain: 'none', opaque: true },
    wire: { draw: spWire, layers: [0.5], stain: 'none', opaque: true },
    mirror: { draw: spMirror, layers: [0.5], stain: 'none', opaque: true },
    glass: { draw: spGlass, layers: [0.5, 0.44], stain: 'none' },
    bread: { draw: spBread, layers: [0.5], stain: 'baked' },
    seed: { draw: spSeed, layers: [0.5], stain: 'starch' },
    honey: { draw: spHoney, layers: [0.42, 0.58], stain: 'honey' },
    muscle: { draw: spMuscle, layers: [0.5], stain: 'muscle' },
    plant: { draw: spPlant, layers: [0.42, 0.6], stain: 'plant' }
};

// The woods: ring = width of a year's ring (0: none), vessel = diameter of the vessels (pores).
const SP_WOOD_BASE = {
    ground: 'rgba(196,158,104,0.85)', lumen: 'rgba(248,242,224,0.9)', lateBand: 'rgba(150,104,56,0.55)', boundary: 'rgba(110,70,30,0.8)',
    lamella: 'rgba(120,80,36,0.8)', ray: 'rgba(206,170,116,0.6)', broadColor: 'rgba(214,176,120,0.92)', vesselLumen: 'rgba(250,248,238,0.96)',
    vesselWall: 'rgba(120,80,36,0.85)', parenColor: 'rgba(236,222,186,0.9)', cell: 20, wall: 3, lateFrom: 0.6, raySpace: 140, rayWidth: 16,
    rayCell: 36, vSpace: 260, multiple: 0.3, vEmpty: 0.4
};
function spWoodParams(extra) {
    return { ...SP_WOOD_BASE, ...extra };
}
const SP_WOODS = {
    oak: spWoodParams({ type: 'ring', ring: 1500, vessel: 260, vSpace: 200, broadRay: 0.06, tyloses: true, lateFrom: 0.2 }),
    dark_oak: spWoodParams({ type: 'ring', ring: 1100, vessel: 240, vSpace: 200, broadRay: 0.06, tyloses: true, lateFrom: 0.2, ground: 'rgba(150,104,60,0.88)', ray: 'rgba(176,130,80,0.85)' }),
    spruce: spWoodParams({ type: 'conifer', ring: 1700, cell: 32, wall: 2.5, lateFrom: 0.72, resin: true, raySpace: 120, rayWidth: 14, ground: 'rgba(214,184,130,0.85)' }),
    birch: spWoodParams({ type: 'diffuse', ring: 1800, vessel: 80, vSpace: 230, multiple: 0.45, ground: 'rgba(214,190,150,0.85)', rayWidth: 14 }),
    maple: spWoodParams({ type: 'diffuse', ring: 1900, vessel: 60, vSpace: 200, multiple: 0.4, ground: 'rgba(220,196,154,0.85)', rayWidth: 22 }),
    willow: spWoodParams({ type: 'diffuse', ring: 2200, vessel: 90, vSpace: 200, multiple: 0.5, ground: 'rgba(212,188,150,0.85)', rayWidth: 12 }),
    cherry: spWoodParams({ type: 'semi', ring: 1600, vessel: 70, vSpace: 190, multiple: 0.5, ground: 'rgba(196,130,90,0.85)' }),
    acacia: spWoodParams({ type: 'diffuse', ring: 2400, vessel: 150, vSpace: 380, multiple: 0.2, vEmpty: 0.5, paren: 'aliform', ground: 'rgba(176,130,70,0.88)' }),
    jungle: spWoodParams({ type: 'tropical', ring: 0, vessel: 220, vSpace: 520, multiple: 0.15, vEmpty: 0.45, paren: 'bands', ground: 'rgba(170,110,70,0.88)', parenColor: 'rgba(230,206,160,0.85)' })
};

const SP_COLORS = {
    white: [236, 236, 230], light_gray: [180, 180, 176], gray: [110, 110, 112], black: [46, 46, 50], brown: [130, 86, 50], red: [196, 50, 44],
    orange: [230, 128, 40], yellow: [232, 206, 60], lime: [130, 200, 60], green: [70, 120, 50], cyan: [40, 150, 160], light_blue: [110, 170, 226],
    blue: [50, 76, 190], purple: [130, 60, 176], magenta: [200, 70, 180], pink: [236, 140, 170]
};

// Metal: surface colour by the room's light, grain size, and what the etch shows.
function spMetalParams(surface, grain, extra = {}) {
    return { surface, grain, ...extra };
}

// Each specimen: kind, look (its text in specimens_text.js), params.
const MICRO_SPECIMENS = {};
function spAdd(ids, kind, look, params = {}) {
    for (const id of [].concat(ids)) MICRO_SPECIMENS[id] = { kind, look, params };
}

for (const wood of Object.keys(SP_WOODS)) {
    const block = wood === 'oak' ? 'wood' : `${wood}_wood`;
    const planks = wood === 'oak' ? 'planks' : `${wood}_planks`;
    spAdd([block, planks], 'wood', `wood_${wood}`, SP_WOODS[wood]);
}
spAdd('sand', 'sand', 'sand');
for (const [color, dye] of Object.entries(SP_COLORS)) {
    spAdd(`${color}_carpet`, 'weave', 'carpet', { dye, weave: 'pile' });
    spAdd(`${color}_curtain`, 'weave', 'curtain', { dye, weave: 'plain' });
}
spAdd(['stone', 'stone_bricks'], 'rock', 'stone', { rock: 'stone', grain: 280 });
spAdd('cobblestone', 'rock', 'cobblestone', { rock: 'stone', grain: 280, cracked: true });
spAdd('granite', 'rock', 'granite', { rock: 'granite', grain: 900 });
spAdd('marble', 'rock', 'marble', { rock: 'marble', grain: 420 });
spAdd('basalt', 'rock', 'basalt', { rock: 'basalt' });
spAdd('slate', 'rock', 'slate', { rock: 'slate' });
spAdd('limestone', 'rock', 'limestone', { rock: 'limestone' });
spAdd('concrete', 'rock', 'concrete', { rock: 'concrete' });
spAdd('brick', 'rock', 'brick', { rock: 'brick' });
spAdd('obsidian', 'obsidian', 'obsidian');
spAdd('coal_ore', 'coal', 'coal');

const SP_ORE = {
    magnetite: { size: 160, habit: 'grain', surface: [130, 130, 136] },
    hematite: { size: 180, habit: 'flake', surface: [150, 150, 160], redEdge: true },
    gold: { size: 40, habit: 'grain', surface: [250, 210, 80] },
    pyrite: { size: 120, habit: 'cube', surface: [220, 200, 110] },
    chalcopyrite: { size: 200, habit: 'grain', surface: [230, 200, 80] },
    malachite: { size: 320, habit: 'botryoidal', translucent: true, fill: 'rgba(60,160,90,0.8)', fill2: 'rgba(30,110,60,0.8)', edge: 'rgba(20,70,40,0.8)' },
    cassiterite: { size: 240, habit: 'grain', translucent: true, fill: 'rgba(160,96,50,0.8)', edge: 'rgba(60,30,10,0.9)', zoned: 'rgba(120,60,20,0.5)' },
    sphalerite: { size: 280, habit: 'grain', translucent: true, fill: 'rgba(200,140,50,0.75)', edge: 'rgba(90,50,10,0.9)', zoned: 'rgba(160,70,20,0.45)' },
    galena: { size: 260, habit: 'cube', surface: [176, 180, 190], pits: true },
    silver: { size: 260, habit: 'wire', surface: [236, 236, 236] }
};
spAdd('iron_ore', 'ore', 'iron_ore', { cell: 300, empty: 0.2, minerals: [SP_ORE.magnetite, SP_ORE.hematite, SP_ORE.hematite] });
spAdd('gold_ore', 'ore', 'gold_ore', { cell: 300, empty: 0.4, minerals: [SP_ORE.gold, SP_ORE.gold, SP_ORE.pyrite] });
spAdd('copper_ore', 'ore', 'copper_ore', { cell: 420, empty: 0.25, minerals: [SP_ORE.chalcopyrite, SP_ORE.malachite] });
spAdd('tin_ore', 'ore', 'tin_ore', { cell: 380, empty: 0.2, minerals: [SP_ORE.cassiterite] });
spAdd('zinc_ore', 'ore', 'zinc_ore', { cell: 380, empty: 0.2, minerals: [SP_ORE.sphalerite, SP_ORE.sphalerite, SP_ORE.galena] });
spAdd('lead_ore', 'ore', 'lead_ore', { cell: 380, empty: 0.2, minerals: [SP_ORE.galena, SP_ORE.galena, SP_ORE.sphalerite] });
spAdd('silver_ore', 'ore', 'silver_ore', { cell: 450, empty: 0.3, gangue: 'calcite', minerals: [SP_ORE.silver] });

spAdd(['iron_block', 'element_fe'], 'metal', 'iron', spMetalParams([176, 178, 182], 60));
spAdd('steel_ingot', 'metal', 'steel', spMetalParams([170, 172, 176], 45, { pearlite: true }));
spAdd('meteoric_iron', 'metal', 'meteoric', spMetalParams([186, 188, 192], 0, { structure: 'widmanstatten' }));
spAdd('bronze_ingot', 'metal', 'bronze', spMetalParams([200, 140, 80], 0, { structure: 'dendrites' }));
spAdd('brass_ingot', 'metal', 'brass', spMetalParams([226, 190, 100], 90, { twins: true }));
spAdd(['copper_block', 'element_cu'], 'metal', 'copper', spMetalParams([214, 128, 86], 80, { twins: true }));
spAdd(['gold_block', 'element_au'], 'metal', 'gold', spMetalParams([236, 196, 80], 100, { twins: true }));
spAdd('element_ag', 'metal', 'silver', spMetalParams([226, 226, 222], 90, { twins: true }));
spAdd(['element_ni', 'element_pt'], 'metal', 'fcc', spMetalParams([200, 198, 190], 70, { twins: true }));
spAdd('element_al', 'metal', 'aluminium', spMetalParams([210, 212, 216], 120));
spAdd(['element_zn', 'element_mg', 'element_ti', 'element_co', 'element_be'], 'metal', 'hcp', spMetalParams([190, 196, 204], 180, { lenses: true }));
spAdd(['element_cr', 'element_mn', 'element_w', 'element_sn', 'element_pb'], 'metal', 'metal', spMetalParams([186, 188, 192], 70));
spAdd('gold_leaf', 'gold_leaf', 'gold_leaf');

const SP_CLEAR_EDGE = 'rgba(60,60,56,0.85)';
spAdd('salt', 'crystals', 'salt', { stain: 'soluble', shape: 'cube', cell: 360, size: 150, empty: 0.15, fill: 'rgba(250,250,246,0.25)', edge: SP_CLEAR_EDGE, inner: 'rgba(110,110,104,0.5)', hopper: true });
spAdd('baking_soda', 'crystals', 'baking_soda', { stain: 'soluble', shape: 'prism', cell: 90, size: 40, empty: 0.1, fill: 'rgba(250,250,246,0.35)', edge: SP_CLEAR_EDGE });
spAdd('copper_sulfate', 'crystals', 'copper_sulfate', { stain: 'soluble', shape: 'prism', cell: 480, size: 220, empty: 0.15, fill: 'rgba(80,150,230,0.55)', edge: 'rgba(20,50,120,0.85)', inner: 'rgba(30,90,200,0.45)' });
spAdd('element_s', 'crystals', 'sulfur', { shape: 'bipyramid', cell: 450, size: 190, empty: 0.15, fill: 'rgba(240,220,60,0.7)', edge: 'rgba(130,110,10,0.85)', inner: 'rgba(180,150,20,0.6)' });
spAdd('element_i', 'crystals', 'iodine', { shape: 'plate', corners: 4, cell: 420, size: 170, empty: 0.15, opaque: true, surface: [96, 70, 120] });
spAdd('fluorite', 'crystals', 'fluorite', { shape: 'cleaved', cell: 480, size: 230, empty: 0.15, fill: 'rgba(200,170,236,0.5)', edge: 'rgba(80,50,110,0.85)', inner: 'rgba(150,100,200,0.35)' });
spAdd('quicklime', 'crystals', 'quicklime', { shape: 'powder', cell: 110, size: 60, empty: 0.1, grain: 6, fill: 'rgba(206,200,184,0.9)', edge: 'rgba(100,96,84,0.8)', haze: 'rgba(200,196,184,0.55)' });
spAdd('rust_pigment', 'crystals', 'rust_pigment', { shape: 'powder', cell: 60, size: 26, empty: 0.15, grain: 0.8, fill: 'rgba(170,60,30,0.85)', edge: 'rgba(90,30,10,0.7)', haze: 'rgba(170,70,40,0.6)' });
spAdd('pyrite', 'crystals', 'pyrite', { shape: 'cube', cell: 600, size: 200, empty: 0.25, opaque: true, surface: [214, 190, 100], striated: true });
spAdd('element_c', 'crystals', 'graphite', { shape: 'plate', corners: 6, cell: 360, size: 120, empty: 0.25, opaque: true, surface: [120, 122, 128] });
spAdd('element_si', 'crystals', 'silicon', { shape: 'shard', cell: 600, size: 220, empty: 0.25, opaque: true, surface: [120, 130, 150] });
spAdd('element_b', 'crystals', 'boron', { shape: 'shard', cell: 300, size: 90, empty: 0.25, opaque: true, surface: [70, 66, 62] });
spAdd('ice', 'ice', 'ice');
spAdd('ruby', 'gem', 'ruby', { body: 'rgba(214,40,70,0.55)', band: 'rgba(180,20,50,0.25)' });
spAdd('sapphire', 'gem', 'sapphire', { body: 'rgba(40,70,190,0.5)', band: 'rgba(20,40,150,0.25)' });

spAdd(['glass', 'glass_pane'], 'glass', 'glass', { tint: 'rgba(230,240,240,0.08)' });
spAdd('cobalt_glass', 'glass', 'cobalt_glass', { tint: 'rgba(40,70,200,0.5)' });
for (const [color, [r, g, b]] of Object.entries(SP_COLORS)) {
    spAdd([`${color}_stained_glass`, `${color}_stained_glass_pane`], 'glass', 'stained_glass', { tint: C(r, g, b, 0.42) });
}

spAdd(['and_gate', 'or_gate', 'xor_gate', 'not_gate', 'delay_gate', 'latch'], 'circuit', 'gate', { chip: 'logic' });
spAdd('rain_sensor', 'circuit', 'rain_sensor', { chip: 'comb' });
spAdd('daylight_sensor', 'circuit', 'daylight_sensor', { chip: 'ldr' });
spAdd(['solar_cell', 'solar_panel'], 'solar', 'solar');
spAdd('light_bulb', 'filament', 'filament');
spAdd('copper_wire', 'wire', 'copper_wire');
spAdd(['mirror', 'wall_mirror'], 'mirror', 'mirror');

spAdd('bread', 'bread', 'bread');
spAdd('wheat_seeds', 'seed', 'wheat_seeds');
spAdd('honey_bottle', 'honey', 'honey');
spAdd('cooked_fish', 'muscle', 'cooked_fish');
spAdd('salted_fish', 'muscle', 'salted_fish', { salted: true });
spAdd('cactus', 'plant', 'cactus', { plant: 'cactus' });
spAdd('moss', 'plant', 'moss', { plant: 'moss' });
spAdd(['tall_grass', 'grass'], 'plant', 'grass', { plant: 'grass' });
spAdd('feather', 'feather', 'feather');
spAdd('fur', 'hair', 'fur');
spAdd('leather', 'leather', 'leather');
spAdd('scale', 'scale', 'scale');
spAdd('shell', 'shell', 'shell');
spAdd('blueprint', 'paper', 'blueprint', { ink: 'prussian', ground: 'rgba(250,248,240,0.2)' });
spAdd('written_blueprint', 'paper', 'written_blueprint', { ink: 'prussian', lines: true, ground: 'rgba(250,248,240,0.2)' });
spAdd('star_chart', 'paper', 'star_chart', { ink: 'black', ground: 'rgba(240,226,190,0.3)' });
spAdd('breeding_notebook', 'paper', 'notebook', { ink: 'pencil', ground: 'rgba(250,248,240,0.2)' });

// ---------------------------------------------------------------------------------------
// On the slide

// Whether this item goes on a slide as a specimen.
function microSpecimenOf(source) {
    return Object.prototype.hasOwnProperty.call(MICRO_SPECIMENS, source) ? MICRO_SPECIMENS[source] : null;
}

// What a stain does to this specimen: the lens's entry, or null if it takes none.
function microSpecimenStain(source, stain) {
    const spec = microSpecimenOf(source);
    if (!spec || !stain) return null;
    const entry = SP_STAINS[microSpecimenStainClass(source)][stain];
    return entry || null;
}

// Which row of SP_STAINS a specimen follows: its own (a salt that dissolves), or its kind's.
function microSpecimenStainClass(source) {
    const spec = microSpecimenOf(source);
    return spec.params.stain || MICRO_SPECIMEN_KINDS[spec.kind].stain;
}

// The scenery of a specimen's slide: one item per layer, which microscopeDrawField hands to microDrawSpecimen.
function microSpecimenScenery(source, seed) {
    const spec = microSpecimenOf(source);
    if (!spec) return [];
    return MICRO_SPECIMEN_KINDS[spec.kind].layers.map((depth, layer) => ({ kind: 'specimen', specimen: source, layer, depth, x: 0, y: 0, rot: 0, seed: seed >>> 0, size: 1 }));
}

// Where to get a canvas to draw into; the off-browser contact sheet sets its own.
let microSpecimenCanvasMaker = (width, height) => {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
};

// The canvas of each layer, kept from frame to frame.
const MICRO_SPECIMEN_CACHE = [];

// Draws a specimen's layer into `ctx` the way a stretch of the slide looks: in micrometres from x0,y0 at `scale`
// pixels each. Used for the cached canvas and for pictures (the guide's contact sheet). look: power, stain, dark.
function microPaintSpecimen(ctx, source, layer, seed, x0, y0, x1, y1, scale, look = {}) {
    const spec = microSpecimenOf(source);
    if (!spec) return;
    const kind = MICRO_SPECIMEN_KINDS[spec.kind];
    const entry = look.stain ? microSpecimenStain(source, look.stain) : null;
    const tinted = entry && (entry.amount > 0 || entry.starch || entry.nucleus || entry.pollen) ? entry : null;
    const lens = tinted || look.dark ? microLens(ctx, tinted, look.dark, 0.9 / scale) : ctx;
    const power = look.power || 40;
    const A = {
        x0, y0, x1, y1, k: scale, px: 1 / scale, seed: seed >>> 0, layer, power, marks: tinted, dark: Boolean(look.dark),
        lit: MICRO_SPECIMEN_TOPLIGHT[power] ?? 0.5, dissolved: Boolean(entry && entry.dissolve)
    };
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-x0, -y0);
    kind.draw(lens, A, spec.params);
    ctx.restore();
}

// One layer of a specimen on the field. item: from microSpecimenScenery. view: as microscopeDrawField has it.
function microDrawSpecimen(target, item, view) {
    const { radius, scale, power } = view;
    const half = radius / scale;
    const margin = half * 0.4;
    const key = `${item.specimen}|${item.seed}|${power}|${radius}|${view.stain || ''}|${view.dark > 0 ? 1 : 0}`;
    let cache = MICRO_SPECIMEN_CACHE[item.layer];
    const stageX = view.stageX;
    const stageY = view.stageY;
    const inside = cache && cache.key === key && stageX - half >= cache.x0 && stageX + half <= cache.x1 && stageY - half >= cache.y0 && stageY + half <= cache.y1;
    if (!inside) {
        const size = Math.ceil((half + margin) * 2 * scale);
        if (!cache) cache = MICRO_SPECIMEN_CACHE[item.layer] = { canvas: microSpecimenCanvasMaker(size, size) };
        if (cache.canvas.width !== size || cache.canvas.height !== size) {
            cache.canvas.width = size;
            cache.canvas.height = size;
        }
        cache.key = key;
        cache.x0 = stageX - half - margin;
        cache.y0 = stageY - half - margin;
        cache.x1 = cache.x0 + size / scale;
        cache.y1 = cache.y0 + size / scale;
        const ctx = cache.canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, size, size);
        microPaintSpecimen(ctx, item.specimen, item.layer, item.seed, cache.x0, cache.y0, cache.x1, cache.y1, scale, { power, stain: view.stain, dark: view.dark > 0 });
    }
    target.drawImage(cache.canvas, radius + (cache.x0 - stageX) * scale, radius + (cache.y0 - stageY) * scale);
}
