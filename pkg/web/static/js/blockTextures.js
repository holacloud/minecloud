// Procedural block textures.
//
// Every pattern is a resolution-independent function painted into a pixel buffer, so the
// same design is used for the classic 16px look (quantised, nearest filtered) and for the
// high-resolution RTX mode, where a height field is also produced and turned into a
// normal map. All noise is tileable so textures repeat seamlessly across faces.

class BlockTextureFactory {
    constructor() {
        this.cache = new Map();
    }

    // ---------------------------------------------------------------- noise

    hash(ix, iy, seed) {
        let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul((seed | 0) + 1013, 1274126177);
        h = Math.imul(h ^ (h >>> 13), 1103515245);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }

    // Tileable value noise; x/y are in lattice cells and wrap at `period` cells.
    valueNoise(x, y, period, seed) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = x - ix;
        const fy = y - iy;
        const wrap = (v) => ((v % period) + period) % period;
        const x0 = wrap(ix);
        const x1 = wrap(ix + 1);
        const y0 = wrap(iy);
        const y1 = wrap(iy + 1);
        const ux = fx * fx * (3 - 2 * fx);
        const uy = fy * fy * (3 - 2 * fy);
        const a = this.hash(x0, y0, seed);
        const b = this.hash(x1, y0, seed);
        const c = this.hash(x0, y1, seed);
        const d = this.hash(x1, y1, seed);
        return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    }

    // Fractal noise over normalised coords u,v in [0,1); `cells` is the base frequency.
    fbm(u, v, cells, octaves, seed) {
        let sum = 0;
        let amp = 0.5;
        let norm = 0;
        let freq = cells;
        for (let o = 0; o < octaves; o++) {
            sum += this.valueNoise(u * freq, v * freq, freq, seed + o * 57) * amp;
            norm += amp;
            amp *= 0.5;
            freq *= 2;
        }
        return sum / norm;
    }

    // Anisotropic tileable noise (different frequency per axis).
    stretchedNoise(u, v, cellsX, cellsY, seed) {
        const x = u * cellsX;
        const y = v * cellsY;
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = x - ix;
        const fy = y - iy;
        const wx = (n) => ((n % cellsX) + cellsX) % cellsX;
        const wy = (n) => ((n % cellsY) + cellsY) % cellsY;
        const ux = fx * fx * (3 - 2 * fx);
        const uy = fy * fy * (3 - 2 * fy);
        const a = this.hash(wx(ix), wy(iy), seed);
        const b = this.hash(wx(ix + 1), wy(iy), seed);
        const c = this.hash(wx(ix), wy(iy + 1), seed);
        const d = this.hash(wx(ix + 1), wy(iy + 1), seed);
        return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    }

    // Tileable Worley noise: returns distances to the two nearest feature points and the cell id.
    worley(u, v, cells, seed) {
        const x = u * cells;
        const y = v * cells;
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        let d1 = 9;
        let d2 = 9;
        let id = 0;
        for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
                const cx = ix + ox;
                const cy = iy + oy;
                const wx = ((cx % cells) + cells) % cells;
                const wy = ((cy % cells) + cells) % cells;
                const px = cx + 0.15 + this.hash(wx, wy, seed) * 0.7;
                const py = cy + 0.15 + this.hash(wx, wy, seed + 1) * 0.7;
                const d = Math.hypot(px - x, py - y);
                if (d < d1) {
                    d2 = d1;
                    d1 = d;
                    id = wy * cells + wx;
                } else if (d < d2) {
                    d2 = d;
                }
            }
        }
        return { d1, d2, id };
    }

    // ---------------------------------------------------------------- colour helpers

    rgb(hex) {
        return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    }

    mix(a, b, t) {
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }

    // Multiplicative shade with a gentle hue shift: shadows cooler, highlights warmer.
    shade(c, k) {
        return [
            c[0] * (1 + k) + k * 12,
            c[1] * (1 + k) + k * 6,
            c[2] * (1 + k) - k * 4
        ];
    }

    clamp01(v) {
        return v < 0 ? 0 : v > 1 ? 1 : v;
    }

    // ---------------------------------------------------------------- surface

    createSurface(size, hd) {
        return {
            size,
            hd,
            color: new Float32Array(size * size * 3),
            alpha: new Float32Array(size * size).fill(1),
            height: new Float32Array(size * size).fill(0.5),
            // Shade quantisation for the low-res pixel-art look.
            steps: hd ? 0 : 10
        };
    }

    put(s, x, y, color, height = 0.5, alpha = 1) {
        const i = y * s.size + x;
        s.color[i * 3] = color[0];
        s.color[i * 3 + 1] = color[1];
        s.color[i * 3 + 2] = color[2];
        s.height[i] = height;
        s.alpha[i] = alpha;
    }

    // Shades a base colour by k, quantised in low-res mode so pixels form clean clusters.
    tone(s, base, k) {
        if (s.steps) k = Math.round(k * s.steps) / s.steps;
        return this.shade(base, k);
    }

    each(s, fn) {
        const size = s.size;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                fn(x, y, (x + 0.5) / size, (y + 0.5) / size);
            }
        }
    }

    // ---------------------------------------------------------------- patterns

    patterns() {
        if (this._patterns) return this._patterns;
        const f = this;
        this._patterns = {
            grass_top(s, tint, seed) {
                // Low large-scale contrast: strong blotches would reveal the 1-block tiling.
                const base = f.rgb(0x588c35);
                f.each(s, (x, y, u, v) => {
                    const large = f.fbm(u, v, 4, 3, seed);
                    const blade = f.hash(x, y, seed + 9);
                    const tuft = f.fbm(u, v, 16, 1, seed + 4);
                    const k = (large - 0.5) * 0.16 + (tuft - 0.5) * 0.2 + (blade - 0.5) * 0.24;
                    const c = f.tone(s, f.mix(base, f.rgb(0x6c9c3e), f.clamp01(tuft)), k);
                    f.put(s, x, y, c, 0.3 + blade * 0.4 + tuft * 0.3);
                });
            },

            dirt(s, tint, seed) {
                const base = f.rgb(0x7a5233);
                f.each(s, (x, y, u, v) => {
                    const n = f.fbm(u, v, 4, 3, seed);
                    const grain = f.hash(x, y, seed + 3);
                    let k = (n - 0.5) * 0.5 + (grain - 0.5) * 0.22;
                    let h = n * 0.6 + grain * 0.2;
                    const pebble = f.worley(u, v, 5, seed + 11);
                    if (pebble.d1 < 0.16 && f.hash(pebble.id, 1, seed) > 0.55) {
                        k = 0.18 + (0.16 - pebble.d1) * 0.6;
                        h = 0.8;
                    }
                    f.put(s, x, y, f.tone(s, base, k), h);
                });
            },

            grass_side(s, tint, seed) {
                f.patterns().dirt(s, tint, seed + 5);
                const base = f.rgb(0x588c35);
                const column = Math.max(1, s.size / 16);
                f.each(s, (x, y, u, v) => {
                    const col = Math.floor(x / column);
                    const depth = 0.16 + f.hash(col, 0, seed) * 0.16 + (f.hash(col, 1, seed) > 0.8 ? 0.12 : 0);
                    if (v > depth) {
                        // Soft shadow under the grass lip.
                        if (v < depth + 0.07) {
                            const i = y * s.size + x;
                            s.color[i * 3] *= 0.78;
                            s.color[i * 3 + 1] *= 0.78;
                            s.color[i * 3 + 2] *= 0.8;
                        }
                        return;
                    }
                    const blade = f.hash(x, y, seed + 9);
                    const k = (blade - 0.5) * 0.26 - (v / depth) * 0.16;
                    f.put(s, x, y, f.tone(s, base, k), 0.7 + blade * 0.3);
                });
            },

            stone(s, tint, seed) {
                const base = f.rgb(tint ?? 0x7d7d7f);
                f.each(s, (x, y, u, v) => {
                    const n = f.fbm(u, v, 3, 4, seed);
                    const strata = f.stretchedNoise(u, v, 2, 8, seed + 4);
                    const grain = f.hash(x, y, seed + 2);
                    const crack = Math.abs(f.fbm(u, v, 4, 2, seed + 21) - 0.5);
                    let k = (n - 0.5) * 0.4 + (strata - 0.5) * 0.14 + (grain - 0.5) * 0.12;
                    let h = 0.4 + n * 0.5;
                    if (crack < 0.018) {
                        k -= 0.28;
                        h = 0.1;
                    }
                    f.put(s, x, y, f.tone(s, base, k), h);
                });
            },

            cobblestone(s, tint, seed) {
                const base = f.rgb(tint ?? 0x7a7a7a);
                const mortar = f.shade(base, -0.45);
                f.each(s, (x, y, u, v) => {
                    const w = f.worley(u, v, 4, seed);
                    const edge = w.d2 - w.d1;
                    const stoneTone = (f.hash(w.id, 3, seed) - 0.5) * 0.32;
                    const grain = (f.hash(x, y, seed + 6) - 0.5) * 0.16;
                    if (edge < 0.1) {
                        f.put(s, x, y, f.tone(s, mortar, grain), 0.05);
                        return;
                    }
                    const dome = f.clamp01((edge - 0.1) * 3);
                    const k = stoneTone + grain + dome * 0.14 - 0.06;
                    f.put(s, x, y, f.tone(s, base, k), 0.25 + dome * 0.75);
                });
            },

            sand(s, tint, seed) {
                const base = f.rgb(tint ?? 0xdccb8c);
                f.each(s, (x, y, u, v) => {
                    const n = f.fbm(u, v, 3, 3, seed);
                    const ripple = Math.sin((v + f.fbm(u, v, 2, 2, seed + 8) * 0.35) * Math.PI * 2 * 4) * 0.5 + 0.5;
                    const grain = f.hash(x, y, seed + 1);
                    const k = (n - 0.5) * 0.18 + (ripple - 0.5) * 0.08 + (grain - 0.5) * 0.14;
                    f.put(s, x, y, f.tone(s, base, k), ripple * 0.4 + grain * 0.4);
                });
            },

            bedrock(s, tint, seed) {
                const base = f.rgb(0x3a3a3c);
                f.each(s, (x, y, u, v) => {
                    const w = f.worley(u, v, 5, seed);
                    const n = f.fbm(u, v, 4, 3, seed + 2);
                    const k = (w.d2 - w.d1 < 0.12 ? -0.55 : (f.hash(w.id, 0, seed) - 0.5) * 0.6) + (n - 0.5) * 0.3;
                    f.put(s, x, y, f.tone(s, base, k), w.d2 - w.d1);
                });
            },

            ore(s, tint, seed) {
                f.patterns().stone(s, 0x7d7d7f, seed);
                const ore = f.rgb(tint);
                f.each(s, (x, y, u, v) => {
                    const w = f.worley(u, v, 4, seed + 31);
                    if (f.hash(w.id, 5, seed) < 0.35) return;
                    const blob = 0.18 + f.fbm(u, v, 8, 2, seed + 4) * 0.12;
                    if (w.d1 > blob) return;
                    const t = 1 - w.d1 / blob;
                    const k = -0.15 + t * 0.35 + (f.hash(x, y, seed + 7) - 0.5) * 0.15;
                    f.put(s, x, y, f.tone(s, ore, k), 0.7 + t * 0.3);
                });
            },

            log_side(s, tint, seed) {
                const base = f.shade(f.rgb(tint ?? 0x6b4d2a), -0.18);
                f.each(s, (x, y, u, v) => {
                    const fibre = f.stretchedNoise(u, v, 8, 2, seed);
                    const groove = f.stretchedNoise(u, v, 16, 3, seed + 3);
                    const grain = f.hash(x, y, seed + 1);
                    let k = (fibre - 0.5) * 0.4 + (grain - 0.5) * 0.1;
                    let h = 0.5 + (fibre - 0.5) * 0.6;
                    if (groove < 0.3) {
                        k -= 0.3;
                        h = 0.1;
                    }
                    f.put(s, x, y, f.tone(s, base, k), h);
                });
            },

            log_top(s, tint, seed) {
                const bark = f.shade(f.rgb(tint ?? 0x6b4d2a), -0.18);
                const wood = f.shade(f.rgb(tint ?? 0x6b4d2a), 0.38);
                f.each(s, (x, y, u, v) => {
                    const dx = u - 0.5;
                    const dy = v - 0.5;
                    if (Math.max(Math.abs(dx), Math.abs(dy)) > 0.42) {
                        const k = (f.hash(x, y, seed) - 0.5) * 0.3;
                        f.put(s, x, y, f.tone(s, bark, k), 0.3);
                        return;
                    }
                    const r = Math.hypot(dx, dy) + f.fbm(u, v, 3, 2, seed) * 0.06;
                    const ring = Math.sin(r * Math.PI * 2 * 5) * 0.5 + 0.5;
                    const k = (ring - 0.5) * 0.26 + (f.hash(x, y, seed + 2) - 0.5) * 0.08 - r * 0.25;
                    f.put(s, x, y, f.tone(s, wood, k), 0.5 + ring * 0.2);
                });
            },

            planks(s, tint, seed) {
                const base = f.rgb(tint ?? 0xb48a56);
                const rows = 4;
                f.each(s, (x, y, u, v) => {
                    const row = Math.floor(v * rows);
                    const rowV = v * rows - row;
                    const offset = f.hash(row, 0, seed) * 0.6 + 0.2;
                    const seamU = (u + offset) % 1;
                    const boardTone = (f.hash(row, 1, seed) - 0.5) * 0.18;
                    const grainLine = Math.sin((u * 3 + f.stretchedNoise(u, v, 2, 8, seed + row) * 1.5) * Math.PI * 2 * 3) * 0.5 + 0.5;
                    let k = boardTone + (grainLine - 0.5) * 0.12 + (f.hash(x, y, seed + 4) - 0.5) * 0.06;
                    let h = 0.7 + grainLine * 0.1;
                    const px = 1 / s.size;
                    if (rowV < px * 1.01 * rows) {
                        k = -0.42;
                        h = 0.05;
                    } else if (seamU < px * 1.01) {
                        k = -0.36;
                        h = 0.1;
                    } else if (rowV > 1 - px * rows) {
                        k -= 0.1;
                    }
                    f.put(s, x, y, f.tone(s, base, k), h);
                });
            },

            leaves(s, tint, seed) {
                if (s.hd) {
                    f.paintLeafCanopy(s, f.rgb(tint ?? 0x4a8a34), seed);
                    return;
                }
                const base = f.rgb(tint ?? 0x4a8a34);
                f.each(s, (x, y, u, v) => {
                    const cluster = f.worley(u, v, 5, seed);
                    const n = f.fbm(u, v, 4, 2, seed + 5);
                    const grain = f.hash(x, y, seed + 2);
                    const leaf = 1 - cluster.d1;
                    if (cluster.d1 > 0.62 + n * 0.15 || grain < 0.08) {
                        f.put(s, x, y, f.shade(base, -0.6), 0, 0);
                        return;
                    }
                    const k = (leaf - 0.6) * 0.5 + (grain - 0.5) * 0.18 + (f.hash(cluster.id, 2, seed) - 0.5) * 0.14;
                    f.put(s, x, y, f.tone(s, base, k), leaf);
                });
            },

            brick(s, tint, seed) {
                const base = f.rgb(tint ?? 0x9c4a36);
                const mortar = f.rgb(0xb8ad9c);
                const rows = 4;
                const cols = 2;
                f.each(s, (x, y, u, v) => {
                    const row = Math.floor(v * rows);
                    const shift = row % 2 ? 0.5 / cols : 0;
                    const cu = ((u + shift) * cols) % 1;
                    const cv = v * rows - row;
                    const col = Math.floor(((u + shift) % 1) * cols);
                    const mortarW = Math.max(1 / s.size * cols, 0.06);
                    const mortarH = Math.max(1 / s.size * rows, 0.12);
                    const grain = (f.hash(x, y, seed) - 0.5) * 0.14;
                    if (cv < mortarH || cu < mortarW) {
                        f.put(s, x, y, f.tone(s, mortar, grain - 0.08), 0.1);
                        return;
                    }
                    const brickTone = (f.hash(row * 7 + col, 3, seed) - 0.5) * 0.24;
                    const n = f.fbm(u, v, 6, 2, seed + 1);
                    const edge = Math.min(cu - mortarW, 1 - cu, cv - mortarH, 1 - cv);
                    const k = brickTone + grain + (n - 0.5) * 0.18 + (edge < 0.08 ? -0.08 : 0);
                    f.put(s, x, y, f.tone(s, base, k), 0.6 + Math.min(edge * 3, 0.4));
                });
            },

            stone_bricks(s, tint, seed) {
                const base = f.rgb(tint ?? 0x858587);
                const rows = 2;
                f.each(s, (x, y, u, v) => {
                    const row = Math.floor(v * rows);
                    const shift = row % 2 ? 0.5 : 0;
                    const cu = (u + shift) % 1;
                    const cv = v * rows - row;
                    const px = 1 / s.size;
                    const n = f.fbm(u, v, 4, 3, seed);
                    const grain = (f.hash(x, y, seed) - 0.5) * 0.12;
                    if (cv < px * rows * 1.01 || cu < px * 1.01) {
                        f.put(s, x, y, f.tone(s, base, -0.42), 0.05);
                        return;
                    }
                    const edge = Math.min(cu, 1 - cu, cv / rows, (1 - cv) / rows);
                    const bevel = edge < px * 1.5 ? (cv < 0.5 || cu < 0.5 ? 0.12 : -0.14) : 0;
                    const k = (n - 0.5) * 0.28 + grain + bevel + (f.hash(row, Math.floor(cu * 2), seed) - 0.5) * 0.1;
                    f.put(s, x, y, f.tone(s, base, k), 0.5 + Math.min(edge * 6, 0.5));
                });
            },

            smooth(s, tint, seed) {
                // Polished stone: marble veins, concrete, slate...
                const base = f.rgb(tint ?? 0xb4b4b4);
                f.each(s, (x, y, u, v) => {
                    const n = f.fbm(u, v, 2, 4, seed);
                    const vein = Math.abs(Math.sin((u + v + f.fbm(u, v, 3, 3, seed + 7) * 1.2) * Math.PI * 3));
                    let k = (n - 0.5) * 0.16 + (f.hash(x, y, seed) - 0.5) * 0.05;
                    if (vein < 0.06) k -= 0.14;
                    f.put(s, x, y, f.tone(s, base, k), 0.5 + n * 0.2);
                });
            },

            metal(s, tint, seed) {
                const base = f.rgb(tint ?? 0xc8cdd2);
                f.each(s, (x, y, u, v) => {
                    const brushed = f.stretchedNoise(u, v, 2, 32, seed);
                    const panel = Math.min(u, 1 - u, v, 1 - v);
                    let k = (brushed - 0.5) * 0.14;
                    let h = 0.6;
                    if (panel < 1.5 / s.size) {
                        k = u < 0.5 && v < 0.5 ? 0.18 : -0.22;
                        h = 0.3;
                    }
                    // Rivets in the corners.
                    const cx = Math.min(u, 1 - u);
                    const cy = Math.min(v, 1 - v);
                    if (Math.hypot(cx - 0.12, cy - 0.12) < 0.04) {
                        k = 0.22;
                        h = 0.9;
                    }
                    f.put(s, x, y, f.tone(s, base, k), h);
                });
            },

            wool(s, tint, seed) {
                const base = f.rgb(tint ?? 0xeeeeee);
                f.each(s, (x, y, u, v) => {
                    const n = f.fbm(u, v, 4, 3, seed);
                    const weave = ((x + (y % 2)) % 2) * 0.05;
                    const fluff = f.hash(x, y, seed + 1);
                    const k = (n - 0.5) * 0.24 + weave - 0.025 + (fluff - 0.5) * 0.1;
                    f.put(s, x, y, f.tone(s, base, k), 0.4 + n * 0.4 + fluff * 0.2);
                });
            },

            obsidian(s, tint, seed) {
                const base = f.rgb(0x1c1430);
                f.each(s, (x, y, u, v) => {
                    const w = f.worley(u, v, 3, seed);
                    const n = f.fbm(u, v, 3, 3, seed + 1);
                    let k = (n - 0.5) * 0.5 + (f.hash(w.id, 1, seed) - 0.5) * 0.4;
                    if (w.d2 - w.d1 < 0.05) k += 0.9;
                    f.put(s, x, y, f.tone(s, base, k), w.d2 - w.d1);
                });
            },

            element(s, tint, seed) {
                f.patterns().smooth(s, tint, seed);
                const base = f.rgb(tint);
                f.each(s, (x, y, u, v) => {
                    const edge = Math.min(u, 1 - u, v, 1 - v);
                    if (edge > 0.09) return;
                    const k = edge < 0.035 ? -0.32 : (u < v ? 0.16 : -0.08);
                    f.put(s, x, y, f.tone(s, base, k), edge < 0.035 ? 0.1 : 0.7);
                });
            },

            glass(s, tint, seed) {
                const frame = f.rgb(0xdbeef4);
                const pane = f.rgb(tint ?? 0xbfe8f5);
                f.each(s, (x, y, u, v) => {
                    const edge = Math.min(u, 1 - u, v, 1 - v);
                    const border = Math.max(1 / s.size, 0.06);
                    if (edge < border) {
                        f.put(s, x, y, f.tone(s, frame, u < v ? 0.05 : -0.12), 1, 0.9);
                        return;
                    }
                    const streak = (u + v) % 0.5;
                    const shine = (streak > 0.12 && streak < 0.16) || (streak > 0.19 && streak < 0.2) ? 0.35 : 0;
                    f.put(s, x, y, f.shade(pane, shine), 0.5, shine ? 0.5 : 0.2);
                });
            },

            water(s, tint, seed) {
                if (s.hd) {
                    // Nearly uniform deep colour; realism comes from the wave normals and reflections.
                    const deepHd = f.rgb(0x15506a);
                    const shallowHd = f.rgb(0x2a7487);
                    f.each(s, (x, y, u, v) => {
                        f.put(s, x, y, f.mix(deepHd, shallowHd, f.fbm(u, v, 2, 3, seed) * 0.6), f.waveHeight(u, v, seed), 0.8);
                    });
                    return;
                }
                const deep = f.rgb(0x2a64a8);
                const light = f.rgb(0x5aa0d8);
                f.each(s, (x, y, u, v) => {
                    const w = f.worley(u, v, 3, seed);
                    const n = f.fbm(u, v, 2, 3, seed + 3);
                    const caustic = Math.pow(f.clamp01(1 - (w.d2 - w.d1) * 4), 3);
                    const c = f.mix(deep, light, f.clamp01(n * 0.6 + caustic * 0.6));
                    f.put(s, x, y, c, n * 0.5 + caustic * 0.5, 0.78);
                });
            },

            cactus_side(s, tint, seed) {
                const base = f.rgb(0x3f8a3a);
                const ribs = 4;
                f.each(s, (x, y, u, v) => {
                    const ribU = (u * ribs) % 1;
                    const rib = Math.sin(ribU * Math.PI);
                    let k = (rib - 0.6) * 0.4 + (f.hash(x, y, seed) - 0.5) * 0.08;
                    let h = rib;
                    const spine = f.hash(Math.floor(u * ribs), Math.floor(v * 6), seed + 1);
                    if (Math.abs(ribU - 0.5) < 0.6 / s.size * ribs && Math.abs((v * 6) % 1 - spine * 0.6 - 0.2) < 0.6 / s.size * 6) {
                        f.put(s, x, y, f.rgb(0xe8e2b8), 1);
                        return;
                    }
                    f.put(s, x, y, f.tone(s, base, k), h);
                });
            },

            cactus_top(s, tint, seed) {
                const base = f.rgb(0x4f9a44);
                f.each(s, (x, y, u, v) => {
                    const r = Math.hypot(u - 0.5, v - 0.5);
                    const ring = Math.sin(r * Math.PI * 2 * 3) * 0.5 + 0.5;
                    const edge = Math.min(u, 1 - u, v, 1 - v) < 0.07;
                    const k = edge ? -0.3 : (ring - 0.5) * 0.18 + (f.hash(x, y, seed) - 0.5) * 0.08;
                    f.put(s, x, y, f.tone(s, base, k), edge ? 0.2 : 0.5 + ring * 0.3);
                });
            },

            bed(s, tint, seed) {
                const blanket = f.rgb(0xb8423f);
                const sheet = f.rgb(0xf1ebdc);
                f.each(s, (x, y, u, v) => {
                    const grain = (f.hash(x, y, seed) - 0.5) * 0.08;
                    if (v < 0.3 && u > 0.12 && u < 0.88 && v > 0.06) {
                        f.put(s, x, y, f.tone(s, sheet, grain + (v < 0.1 ? 0.04 : 0)), 0.8);
                    } else if (v < 0.36) {
                        f.put(s, x, y, f.tone(s, sheet, grain - 0.08), 0.6);
                    } else {
                        const quilt = ((Math.floor(u * 4) + Math.floor(v * 5)) % 2) * 0.06;
                        f.put(s, x, y, f.tone(s, blanket, grain + quilt - (v < 0.42 ? 0.15 : 0)), 0.7);
                    }
                });
            },

            sign(s, tint, seed) {
                f.patterns().planks(s, 0xc49a62, seed);
                const board = f.rgb(0xe6cfa4);
                f.each(s, (x, y, u, v) => {
                    if (u < 0.14 || u > 0.86 || v < 0.16 || v > 0.6) return;
                    const line = v > 0.24 && v < 0.54 && ((v * 10) % 1) < 0.25 && u > 0.22 && u < 0.78;
                    f.put(s, x, y, f.tone(s, board, line ? -0.35 : (f.hash(x, y, seed) - 0.5) * 0.06), 0.8);
                });
            },

            sound_block(s, tint, seed) {
                f.patterns().planks(s, 0x5a3f8f, seed);
                f.each(s, (x, y, u, v) => {
                    const r = Math.hypot(u - 0.5, v - 0.5);
                    if (r < 0.3 && r > 0.08) {
                        const ring = ((r * 20) % 1) < 0.5;
                        f.put(s, x, y, f.rgb(ring ? 0x2b1f45 : 0x3a2a5c), ring ? 0.1 : 0.4);
                    } else if (r <= 0.08) {
                        f.put(s, x, y, f.rgb(0xd7c46a), 0.9);
                    }
                });
            },

            // ---- cutout sprites (drawn in normalised coordinates)

            tall_grass(s, tint, seed) {
                const base = f.rgb(0x6aa944);
                f.each(s, (x, y, u, v) => f.put(s, x, y, base, 0, 0));
                if (s.hd) {
                    f.paintGrassBlades(s, base, seed);
                    return;
                }
                const blades = 9;
                for (let i = 0; i < blades; i++) {
                    const x0 = 0.08 + (i / (blades - 1)) * 0.84 + (f.hash(i, 0, seed) - 0.5) * 0.06;
                    const height = 0.45 + f.hash(i, 1, seed) * 0.5;
                    const lean = (f.hash(i, 2, seed) - 0.5) * 0.3;
                    const tone = (f.hash(i, 3, seed) - 0.5) * 0.3;
                    f.each(s, (x, y, u, v) => {
                        const t = (1 - v) / height;
                        if (t < 0 || t > 1) return;
                        const cx = x0 + lean * t * t;
                        const width = 0.045 * (1 - t) + 0.008;
                        if (Math.abs(u - cx) > Math.max(width, 0.5 / s.size)) return;
                        f.put(s, x, y, f.tone(s, base, tone - (1 - t) * 0.25 + t * 0.1), t, 1);
                    });
                }
            },

            flower(s, tint, seed) {
                const stem = f.rgb(0x4f8f37);
                const petal = f.rgb(tint ?? 0xd04848);
                const heart = f.rgb(0xf3d36b);
                if (s.hd) {
                    f.paintFlower(s, stem, petal, heart, seed);
                    return;
                }
                f.each(s, (x, y, u, v) => {
                    f.put(s, x, y, stem, 0, 0);
                    const dx = u - 0.5;
                    const dy = v - 0.3;
                    const r = Math.hypot(dx, dy);
                    if (r < 0.07) {
                        f.put(s, x, y, f.tone(s, heart, (f.hash(x, y, seed) - 0.5) * 0.2), 1, 1);
                        return;
                    }
                    const angle = Math.atan2(dy, dx);
                    const petalR = 0.16 + Math.abs(Math.cos(angle * 2.5)) * 0.08;
                    if (r < petalR) {
                        f.put(s, x, y, f.tone(s, petal, (r / petalR - 0.6) * -0.4), 0.8, 1);
                        return;
                    }
                    if (Math.abs(dx) < Math.max(0.03, 0.6 / s.size) && v > 0.3) {
                        f.put(s, x, y, f.tone(s, stem, -0.1), 0.5, 1);
                        return;
                    }
                    // Two leaves along the stem.
                    const leaf = (cx, cy, dir) => Math.hypot((u - cx) * 1.2, (v - cy - (u - cx) * dir * 0.6) * 2.4) < 0.1;
                    if (leaf(0.38, 0.68, 1) || leaf(0.62, 0.58, -1)) {
                        f.put(s, x, y, f.tone(s, stem, 0.08), 0.6, 1);
                    }
                });
            },

            mushroom(s, tint, seed) {
                const cap = f.rgb(tint ?? 0xb74b43);
                const stem = f.rgb(0xeee2c8);
                const red = (tint ?? 0xb74b43) === 0xb74b43;
                f.each(s, (x, y, u, v) => {
                    f.put(s, x, y, stem, 0, 0);
                    const dx = (u - 0.5) / 0.36;
                    const dy = (v - 0.5) / 0.3;
                    if (dy < 0 && dx * dx + dy * dy < 1) {
                        const spot = red && f.worley(u, v, 4, seed).d1 < 0.12;
                        const k = spot ? 0 : -dy * 0.15 + (f.hash(x, y, seed) - 0.5) * 0.1;
                        f.put(s, x, y, spot ? f.rgb(0xf6efe0) : f.tone(s, cap, k), 1 + dy * 0.5, 1);
                        return;
                    }
                    if (v >= 0.48 && Math.abs(u - 0.5) < 0.1) {
                        f.put(s, x, y, f.tone(s, stem, Math.abs(u - 0.5) < 0.04 ? 0.04 : -0.1), 0.6, 1);
                    }
                });
            },

            torch(s, tint, seed) {
                const stick = f.rgb(0x6b4a2b);
                f.each(s, (x, y, u, v) => {
                    f.put(s, x, y, stick, 0, 0);
                    if (Math.abs(u - 0.5) < 0.07 && v > 0.36) {
                        f.put(s, x, y, f.tone(s, stick, u < 0.5 ? 0.12 : -0.12), 0.5, 1);
                        return;
                    }
                    const dx = (u - 0.5) / 0.15;
                    const dy = (v - 0.28) / 0.2;
                    const r = dx * dx + dy * dy * (dy < 0 ? 0.6 : 1);
                    if (r < 1) {
                        const c = f.mix(f.rgb(0xfff4c0), f.rgb(0xf08a24), f.clamp01(r * 1.1));
                        f.put(s, x, y, c, 1, 1);
                    }
                });
            },

            ladder(s, tint, seed) {
                const wood = f.rgb(0x9b632e);
                f.each(s, (x, y, u, v) => {
                    f.put(s, x, y, wood, 0, 0);
                    const rail = (u > 0.14 && u < 0.28) || (u > 0.72 && u < 0.86);
                    const rungV = (v * 4) % 1;
                    const rung = u > 0.14 && u < 0.86 && rungV > 0.34 && rungV < 0.66;
                    if (!rail && !rung) return;
                    const grain = (f.stretchedNoise(u, v, rail ? 4 : 16, rail ? 16 : 4, seed) - 0.5) * 0.25;
                    const edge = rail ? ((u > 0.14 && u < 0.17) || (u > 0.72 && u < 0.75) ? 0.15 : 0) : (rungV < 0.42 ? 0.12 : rungV > 0.6 ? -0.2 : 0);
                    f.put(s, x, y, f.tone(s, wood, grain + edge), rail ? 0.9 : 0.7, 1);
                });
            },

            spray_paint(s, tint, seed) {
                const base = f.rgb(tint ?? 0xff3bd5);
                f.each(s, (x, y, u, v) => {
                    const r = Math.hypot(u - 0.5, v - 0.5);
                    const a = f.clamp01(1 - r * 2.2 + (f.hash(x, y, seed) - 0.5) * 0.4);
                    f.put(s, x, y, base, a, a > 0.3 ? 1 : 0);
                });
            },

            generic(s, tint, seed) {
                const base = f.rgb(tint ?? 0x999999);
                f.each(s, (x, y, u, v) => {
                    const n = f.fbm(u, v, 3, 3, seed);
                    const k = (n - 0.5) * 0.3 + (f.hash(x, y, seed) - 0.5) * 0.1;
                    f.put(s, x, y, f.tone(s, base, k), n);
                });
            }
        };
        // Patterns from other files (js/extensions.js registerTexturePattern).
        if (typeof TEXTURE_PATTERNS !== 'undefined') {
            Object.entries(TEXTURE_PATTERNS).forEach(([name, pattern]) => {
                this._patterns[name] = (s, tint, seed) => pattern.paint(f, s, tint, seed);
            });
        }
        return this._patterns;
    }

    // ---------------------------------------------------------------- hd vegetation & water

    // Tileable wave height: directional waves with integer wave vectors (so they repeat
    // seamlessly) plus fine fbm ripples.
    waveHeight(u, v, seed) {
        const waves = [[3, 1, 0.32], [-2, 3, 0.24], [5, -2, 0.16], [1, 6, 0.12], [-7, -4, 0.08]];
        let h = 0;
        waves.forEach(([kx, ky, amp], i) => {
            const phase = this.hash(i, 7, seed) * Math.PI * 2;
            h += Math.sin((u * kx + v * ky) * Math.PI * 2 + phase) * amp;
        });
        h += (this.fbm(u, v, 8, 3, seed + 3) - 0.5) * 0.45;
        return this.clamp01(0.5 + h * 0.5);
    }

    // Writes a pixel with wrap-around (so stamped shapes tile seamlessly).
    putWrapped(s, x, y, color, height, alpha) {
        const size = s.size;
        this.put(s, ((x % size) + size) % size, ((y % size) + size) % size, color, height, alpha);
    }

    // Canopy of individually drawn lanceolate leaves: a darker under-layer then lit leaves,
    // each with a gradient, a midrib and darker edges. Uncovered texels stay transparent.
    paintLeafCanopy(s, base, seed) {
        const size = s.size;
        this.each(s, (x, y) => this.put(s, x, y, this.shade(base, -0.55), 0, 0));
        const layers = [{ count: 70, tone: -0.32, height: 0.35 }, { count: 95, tone: 0.02, height: 0.75 }];
        layers.forEach((layer, layerIndex) => {
            for (let i = 0; i < layer.count; i++) {
                const r = (k) => this.hash(i * 13 + layerIndex * 1009, k, seed);
                const cx = r(1) * size;
                const cy = r(2) * size;
                const length = size * (0.07 + r(3) * 0.06);
                const width = length * (0.32 + r(4) * 0.12);
                const angle = r(5) * Math.PI * 2;
                const hue = (r(6) - 0.5) * 0.22;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const reach = Math.ceil(length);
                for (let dy = -reach; dy <= reach; dy++) {
                    for (let dx = -reach; dx <= reach; dx++) {
                        // Leaf-local coordinates: lx along the blade (-1 stem .. 1 tip), ly across.
                        const lx = (dx * cos + dy * sin) / length;
                        const ly = (-dx * sin + dy * cos) / width;
                        if (lx < -1 || lx > 1) continue;
                        const halfWidth = Math.pow(1 - lx * lx, 0.75) * (lx < 0 ? 0.85 : 1);
                        if (Math.abs(ly) > halfWidth) continue;
                        const edge = Math.abs(ly) / Math.max(halfWidth, 0.001);
                        let k = layer.tone + hue + (lx * 0.12) - edge * edge * 0.18;
                        if (Math.abs(ly) < 0.07 && lx < 0.9) k -= 0.14; // midrib
                        if (ly > 0) k += 0.05; // one half catches more light
                        const height = layer.height + (1 - edge) * 0.2;
                        this.putWrapped(s, Math.round(cx + dx), Math.round(cy + dy), this.tone(s, base, k), height, 1);
                    }
                }
            }
        });
    }

    // Dense tuft: curved, tapering blades darker at the base, a few with seed heads.
    paintGrassBlades(s, base, seed) {
        const size = s.size;
        const blades = 28;
        for (let i = 0; i < blades; i++) {
            const r = (k) => this.hash(i, k, seed);
            const rootU = 0.08 + r(1) * 0.84;
            const height = 0.4 + r(2) * 0.58;
            const bend = (r(3) - 0.5) * 0.5;
            const width = 0.018 + r(4) * 0.022;
            const tone = (r(5) - 0.5) * 0.3;
            const steps = Math.ceil(height * size * 2);
            for (let step = 0; step <= steps; step++) {
                const t = step / steps;
                const cu = rootU + bend * t * t;
                const cv = 1 - t * height;
                const halfWidth = Math.max(width * (1 - t * 0.9), 0.6 / size);
                const k = tone - (1 - t) * 0.3 + t * 0.12;
                for (let du = -halfWidth; du <= halfWidth; du += 0.5 / size) {
                    const x = Math.round((cu + du) * size);
                    const y = Math.round(cv * size);
                    if (x < 0 || x >= size || y < 0 || y >= size) continue;
                    const highlight = Math.abs(du) < halfWidth * 0.3 ? 0.06 : 0;
                    this.put(s, x, y, this.tone(s, base, k + highlight), t, 1);
                }
            }
            if (r(6) > 0.82) {
                // Seed head at the tip.
                const tipU = rootU + bend;
                const tipV = 1 - height;
                this.each(s, (x, y, u, v) => {
                    if (Math.hypot((u - tipU) * 2.2, v - tipV - 0.04) < 0.05) this.put(s, x, y, this.tone(s, this.rgb(0xc9b77a), (this.hash(x, y, seed) - 0.5) * 0.2), 1, 1);
                });
            }
        }
    }

    // Flower with five shaped petals (gradient, veins), textured centre, stem and two leaves.
    paintFlower(s, stem, petal, heart, seed) {
        const petals = 5;
        const centerV = 0.3;
        this.each(s, (x, y, u, v) => {
            this.put(s, x, y, stem, 0, 0);
            const dx = u - 0.5;
            const dy = v - centerV;
            const r = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            const petalPhase = Math.abs(Math.cos(angle * petals / 2));
            const petalEdge = 0.075 + 0.17 * Math.pow(petalPhase, 0.6);
            if (r < 0.065) {
                const speck = this.hash(x, y, seed) > 0.75 ? -0.25 : 0;
                this.put(s, x, y, this.tone(s, heart, speck - r * 2), 1, 1);
                return;
            }
            if (r < petalEdge) {
                const t = r / petalEdge;
                const vein = Math.abs(Math.sin(angle * petals * 3)) < 0.12 ? -0.1 : 0;
                this.put(s, x, y, this.tone(s, petal, (t - 0.5) * 0.35 - (1 - petalPhase) * 0.15 + vein), 0.6 + (1 - t) * 0.4, 1);
                return;
            }
            if (Math.abs(dx) < Math.max(0.018, 0.6 / s.size) && v > centerV) {
                this.put(s, x, y, this.tone(s, stem, (dx > 0 ? -0.12 : 0.05)), 0.5, 1);
                return;
            }
            const leaf = (cx, cy, dir) => {
                const lu = (u - cx) * dir;
                const lv = v - cy + lu * 0.55;
                return lu > 0 && lu < 0.2 && Math.abs(lv) < 0.045 * Math.sin(Math.PI * lu / 0.2);
            };
            if (leaf(0.5, 0.7, -1) || leaf(0.5, 0.6, 1)) {
                this.put(s, x, y, this.tone(s, stem, 0.06 + (this.hash(x, y, seed) - 0.5) * 0.06), 0.6, 1);
            }
        });
    }

    // ---------------------------------------------------------------- output

    toCanvas(s) {
        const canvas = document.createElement('canvas');
        canvas.width = s.size;
        canvas.height = s.size;
        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(s.size, s.size);
        const d = image.data;
        for (let i = 0; i < s.size * s.size; i++) {
            d[i * 4] = s.color[i * 3];
            d[i * 4 + 1] = s.color[i * 3 + 1];
            d[i * 4 + 2] = s.color[i * 3 + 2];
            d[i * 4 + 3] = s.alpha[i] * 255;
        }
        ctx.putImageData(image, 0, 0);
        return canvas;
    }

    normalCanvas(s, strength = 2.5) {
        const size = s.size;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(size, size);
        const d = image.data;
        const h = (x, y) => s.height[((y + size) % size) * size + ((x + size) % size)];
        const scale = strength * (size / 64);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = (h(x + 1, y) - h(x - 1, y)) * scale;
                const dy = (h(x, y + 1) - h(x, y - 1)) * scale;
                const len = Math.hypot(dx, dy, 1);
                const i = (y * size + x) * 4;
                d[i] = (-dx / len * 0.5 + 0.5) * 255;
                d[i + 1] = (dy / len * 0.5 + 0.5) * 255;
                d[i + 2] = (1 / len * 0.5 + 0.5) * 255;
                d[i + 3] = 255;
            }
        }
        ctx.putImageData(image, 0, 0);
        return canvas;
    }

    // Roughness from the height field: crevices rough, raised surfaces a bit smoother, with
    // grain so highlights break up like real materials (green channel, as three.js reads it).
    roughnessCanvas(s) {
        const size = s.size;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(size, size);
        const d = image.data;
        for (let i = 0; i < size * size; i++) {
            const grain = this.hash(i % size, Math.floor(i / size), 977) - 0.5;
            const value = this.clamp01(0.62 + (0.5 - s.height[i]) * 0.55 + grain * 0.12) * 255;
            d[i * 4] = value;
            d[i * 4 + 1] = value;
            d[i * 4 + 2] = value;
            d[i * 4 + 3] = 255;
        }
        ctx.putImageData(image, 0, 0);
        return canvas;
    }

    seedFor(pattern, tint) {
        let h = tint || 0;
        for (let i = 0; i < pattern.length; i++) h = Math.imul(h ^ pattern.charCodeAt(i), 16777619);
        return (h >>> 0) % 100000;
    }

    // Returns { albedo: canvas, normal: canvas|null }
    generate(pattern, { tint = null, size = 16, hd = false, label = null } = {}) {
        const key = `${pattern}:${tint}:${size}:${hd ? 1 : 0}:${label || ''}`;
        let result = this.cache.get(key);
        if (result) return result;

        const painter = this.patterns()[pattern] || this.patterns().generic;
        const surface = this.createSurface(size, hd);
        painter(surface, tint, this.seedFor(pattern, tint));

        const albedo = this.toCanvas(surface);
        if (label) this.drawLabel(albedo, label, tint);
        result = {
            albedo,
            // Water's gentle wave heights need a much steeper normal map to read as waves.
            normal: hd ? this.normalCanvas(surface, pattern === 'water' ? 5 : 2.5) : null,
            roughness: hd ? this.roughnessCanvas(surface) : null
        };
        this.cache.set(key, result);
        return result;
    }

    drawLabel(canvas, label, tint) {
        const ctx = canvas.getContext('2d');
        const size = canvas.width;
        const [r, g, b] = this.rgb(tint ?? 0x999999);
        const light = (r * 0.299 + g * 0.587 + b * 0.114) > 140;
        ctx.font = `bold ${Math.round(size * (label.length > 1 ? 0.42 : 0.5))}px "Trebuchet MS", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = light ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
        ctx.fillText(label, size / 2 + size * 0.03, size / 2 + size * 0.05);
        ctx.fillStyle = light ? 'rgba(30,30,34,0.85)' : 'rgba(250,250,245,0.9)';
        ctx.fillText(label, size / 2, size / 2 + size * 0.02);
    }

    // ---------------------------------------------------------------- icons

    // Isometric cube icon from top/left/right face canvases.
    drawCubeIcon(ctx, size, top, left, right) {
        const s = size;
        const cx = s / 2;
        const w = s * 0.43;
        const hTop = w * 0.5;
        const yTop = s * 0.1;
        const drawFace = (img, a, b, c, shade) => {
            // Affine map unit square -> parallelogram a (0,0), b (1,0), c (0,1).
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
            ctx.lineTo(b[0] + c[0] - a[0], b[1] + c[1] - a[1]);
            ctx.lineTo(c[0], c[1]);
            ctx.closePath();
            ctx.clip();
            ctx.setTransform(
                (b[0] - a[0]) / img.width, (b[1] - a[1]) / img.width,
                (c[0] - a[0]) / img.height, (c[1] - a[1]) / img.height,
                a[0], a[1]
            );
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            if (shade) {
                ctx.fillStyle = `rgba(0,0,0,${shade})`;
                ctx.fill();
            }
            ctx.restore();
        };
        const top0 = [cx, yTop];
        const topL = [cx - w, yTop + hTop];
        const topR = [cx + w, yTop + hTop];
        const mid = [cx, yTop + hTop * 2];
        const depth = w * 1.15;
        drawFace(top, topL, top0, mid, 0);
        drawFace(left, topL, mid, [topL[0], topL[1] + depth], 0.22);
        drawFace(right, mid, topR, [mid[0], mid[1] + depth], 0.38);
    }

    drawItemIcon(ctx, size, def) {
        const s = size;
        const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
        const px = (x, y, w, h, color) => {
            ctx.fillStyle = color;
            ctx.fillRect(Math.round(x * s), Math.round(y * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
        };
        const head = hex(def.color);
        const handle = '#7a5129';
        if (def.drawIcon) return def.drawIcon(ctx, s);
        ctx.save();
        if (def.toolType) {
            // Diagonal handle bottom-left to top-right.
            ctx.translate(s / 2, s / 2);
            ctx.rotate(-Math.PI / 4);
            ctx.translate(-s / 2, -s / 2);
            if (def.toolType === 'sword') {
                px(0.44, 0.1, 0.12, 0.56, head);
                px(0.47, 0.1, 0.04, 0.5, 'rgba(255,255,255,0.35)');
                px(0.32, 0.64, 0.36, 0.07, '#4a3524');
                px(0.46, 0.7, 0.08, 0.2, handle);
            } else if (def.toolType === 'shears') {
                px(0.36, 0.14, 0.1, 0.46, head);
                px(0.54, 0.14, 0.1, 0.46, head);
                px(0.3, 0.6, 0.16, 0.2, '#c0392b');
                px(0.54, 0.6, 0.16, 0.2, '#c0392b');
            } else {
                px(0.46, 0.22, 0.08, 0.7, handle);
                if (def.toolType === 'pickaxe') {
                    px(0.18, 0.14, 0.64, 0.1, head);
                    px(0.14, 0.2, 0.08, 0.1, head);
                    px(0.78, 0.2, 0.08, 0.1, head);
                } else if (def.toolType === 'axe') {
                    px(0.5, 0.14, 0.22, 0.28, head);
                    px(0.38, 0.16, 0.12, 0.12, head);
                } else if (def.toolType === 'shovel') {
                    px(0.38, 0.06, 0.24, 0.22, head);
                } else if (def.toolType === 'hoe') {
                    px(0.4, 0.14, 0.32, 0.09, head);
                    px(0.64, 0.14, 0.08, 0.16, head);
                }
            }
        } else if (def.eggSpecies) {
            ctx.fillStyle = head;
            ctx.beginPath();
            ctx.ellipse(s / 2, s * 0.54, s * 0.26, s * 0.34, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                ctx.arc(s * (0.38 + this.hash(i, 0, 3) * 0.26), s * (0.36 + this.hash(i, 1, 3) * 0.4), s * 0.04, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.ellipse(s * 0.42, s * 0.38, s * 0.06, s * 0.1, -0.4, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Sapling
            px(0.47, 0.5, 0.06, 0.4, '#6b4a2b');
            ctx.fillStyle = head;
            [[0.36, 0.42, 0.14], [0.62, 0.36, 0.14], [0.5, 0.24, 0.16]].forEach(([x, y, r]) => {
                ctx.beginPath();
                ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        ctx.restore();
    }
}

window.BlockTextureFactory = BlockTextureFactory;
