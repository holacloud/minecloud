// Voxel character models.
//
// Every model is described on a pixel grid (1 unit = 1/16 block by default) so that
// all parts share the same scale and line up exactly. Each part is a pivot Group placed
// at its joint (shoulder, hip, neck...) holding a box offset from that pivot, so
// rotating a part swings it around the joint instead of around its centre.
// All faces of a model are painted into a single texture atlas.

const FACE_ORDER = ['right', 'left', 'top', 'bottom', 'front', 'back'];

function hashNoise(x, y, seed) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
}

function colorToRgb(color) {
    return [(color >> 16) & 255, (color >> 8) & 255, color & 255];
}

function shadeRgb(rgb, amount) {
    // Darker tones drift slightly cooler, lighter ones slightly warmer.
    const k = 1 + amount;
    return [
        Math.max(0, Math.min(255, rgb[0] * k + amount * 10)),
        Math.max(0, Math.min(255, rgb[1] * k + amount * 4)),
        Math.max(0, Math.min(255, rgb[2] * k - amount * 6))
    ];
}

// Paints a single face. Coordinates are in model units; (0,0) is the top-left of the face
// as seen from outside the box.
class FacePainter {
    constructor(data, atlasWidth, x0, y0, w, h, scale, seed) {
        this.data = data;
        this.atlasWidth = atlasWidth;
        this.x0 = x0;
        this.y0 = y0;
        this.w = w;
        this.h = h;
        this.scale = scale;
        this.seed = seed;
    }

    setTexel(tx, ty, rgb) {
        if (tx < 0 || ty < 0 || tx >= this.w * this.scale || ty >= this.h * this.scale) return;
        const i = ((this.y0 + ty) * this.atlasWidth + this.x0 + tx) * 4;
        this.data[i] = rgb[0];
        this.data[i + 1] = rgb[1];
        this.data[i + 2] = rgb[2];
        this.data[i + 3] = 255;
    }

    // Fills a rectangle (model units, fractional allowed) with a colour plus subtle texel noise.
    rect(x, y, w, h, color, noise = 0.05) {
        const rgb = typeof color === 'number' ? colorToRgb(color) : color;
        const s = this.scale;
        const tx0 = Math.round(x * s);
        const ty0 = Math.round(y * s);
        const tx1 = Math.round((x + w) * s);
        const ty1 = Math.round((y + h) * s);
        for (let ty = ty0; ty < ty1; ty++) {
            for (let tx = tx0; tx < tx1; tx++) {
                const n = noise ? (hashNoise(this.x0 + tx, this.y0 + ty, this.seed) - 0.5) * 2 * noise : 0;
                this.setTexel(tx, ty, n ? shadeRgb(rgb, n) : rgb);
            }
        }
    }

    fill(color, noise = 0.05) {
        this.rect(0, 0, this.w, this.h, color, noise);
    }

    // Darkens the outer ring of texels to give each part a soft bevel.
    bevel(amount = 0.1) {
        const tw = this.w * this.scale;
        const th = this.h * this.scale;
        for (let ty = 0; ty < th; ty++) {
            for (let tx = 0; tx < tw; tx++) {
                const edge = tx === 0 || ty === 0 || tx === tw - 1 || ty === th - 1;
                if (!edge) continue;
                const i = ((this.y0 + ty) * this.atlasWidth + this.x0 + tx) * 4;
                const k = ty === 0 ? 1 - amount * 0.4 : 1 - amount;
                this.data[i] *= k;
                this.data[i + 1] *= k;
                this.data[i + 2] *= k;
            }
        }
    }

    // Scatters blotches (spots, patches) of the given colour.
    spots(color, count, minSize, maxSize, seedOffset = 0) {
        for (let i = 0; i < count; i++) {
            const r1 = hashNoise(i, 11, this.seed + seedOffset);
            const r2 = hashNoise(i, 23, this.seed + seedOffset);
            const r3 = hashNoise(i, 37, this.seed + seedOffset);
            const size = minSize + (maxSize - minSize) * r3;
            this.rect(r1 * (this.w - size), r2 * (this.h - size), size, size * (0.7 + r1 * 0.5), color, 0.06);
        }
    }
}

class VoxelModelBuilder {
    constructor({ unit = 1 / 16, texelsPerUnit = 2, seed = 1 } = {}) {
        this.unit = unit;
        this.texelsPerUnit = texelsPerUnit;
        this.seed = seed;
        this.parts = [];
        this.byName = new Map();
    }

    // name:   identifier, returned in build().parts
    // parent: name of the parent part (pivot coordinates are relative to its pivot)
    // pivot:  joint position in units
    // from:   min corner of the box relative to the pivot
    // size:   [w, h, d] in units
    // paint:  { color, noise, bevel, faces: { front(p), top(p), ... , all(p, face) } }
    // rotation: initial rotation of the pivot [x, y, z] in radians
    part(name, { parent = null, pivot = [0, 0, 0], from, size, paint = {}, rotation = null, inflate = 0 }) {
        const part = { name, parent, pivot, from: from || [-size[0] / 2, 0, -size[2] / 2], size, paint, rotation, inflate };
        this.parts.push(part);
        if (name) this.byName.set(name, part);
        return this;
    }

    // Returns [w, h] of a face in units.
    faceSize(size, face) {
        const [w, h, d] = size;
        if (face === 'right' || face === 'left') return [d, h];
        if (face === 'top' || face === 'bottom') return [w, d];
        return [w, h];
    }

    packAtlas() {
        const s = this.texelsPerUnit;
        const rects = [];
        for (const part of this.parts) {
            part.atlas = {};
            for (const face of FACE_ORDER) {
                const [fw, fh] = this.faceSize(part.size, face);
                const rect = { part, face, w: Math.max(1, Math.ceil(fw * s)), h: Math.max(1, Math.ceil(fh * s)) };
                part.atlas[face] = rect;
                rects.push(rect);
            }
        }

        const area = rects.reduce((sum, r) => sum + (r.w + 1) * (r.h + 1), 0);
        let width = 64;
        while (width * width < area * 1.3) width *= 2;

        rects.sort((a, b) => b.h - a.h);
        let x = 0;
        let y = 0;
        let rowHeight = 0;
        for (const rect of rects) {
            if (x + rect.w > width) {
                x = 0;
                y += rowHeight + 1;
                rowHeight = 0;
            }
            rect.x = x;
            rect.y = y;
            x += rect.w + 1;
            rowHeight = Math.max(rowHeight, rect.h);
        }
        let height = 64;
        while (height < y + rowHeight) height *= 2;
        return { width, height };
    }

    paintAtlas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(width, height);

        this.parts.forEach((part, partIndex) => {
            const paint = part.paint;
            for (const face of FACE_ORDER) {
                const rect = part.atlas[face];
                const [fw, fh] = this.faceSize(part.size, face);
                const painter = new FacePainter(image.data, width, rect.x, rect.y, fw, fh, this.texelsPerUnit, this.seed * 31 + partIndex * 7);
                painter.fill(paint.color ?? 0xff00ff, paint.noise ?? 0.05);
                if (paint.all) paint.all(painter, face);
                if (paint.faces && paint.faces[face]) paint.faces[face](painter);
                if (paint.bevel !== 0) painter.bevel(paint.bevel ?? 0.1);
            }
        });

        ctx.putImageData(image, 0, 0);
        return canvas;
    }

    createGeometry(part, atlasWidth, atlasHeight) {
        const u = this.unit;
        const [w, h, d] = part.size;
        const inflate = part.inflate * u;
        const geometry = new THREE.BoxGeometry(w * u + inflate * 2, h * u + inflate * 2, d * u + inflate * 2);
        geometry.translate(
            (part.from[0] + w / 2) * u,
            (part.from[1] + h / 2) * u,
            (part.from[2] + d / 2) * u
        );

        // BoxGeometry emits 4 vertices per face in FACE_ORDER with uvs (0,1) (1,1) (0,0) (1,0).
        const uv = geometry.attributes.uv;
        FACE_ORDER.forEach((face, faceIndex) => {
            const rect = part.atlas[face];
            for (let v = 0; v < 4; v++) {
                const index = faceIndex * 4 + v;
                const fu = uv.getX(index);
                const fv = uv.getY(index);
                uv.setXY(
                    index,
                    (rect.x + fu * rect.w) / atlasWidth,
                    1 - (rect.y + (1 - fv) * rect.h) / atlasHeight
                );
            }
        });
        uv.needsUpdate = true;
        return geometry;
    }

    // createMaterial(texture) -> THREE.Material
    build(createMaterial, { textureCache = null, cacheKey = null } = {}) {
        const { width, height } = this.packAtlas();

        let texture = textureCache && cacheKey ? textureCache.get(cacheKey) : null;
        if (!texture) {
            texture = new THREE.CanvasTexture(this.paintAtlas(width, height));
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            texture.generateMipmaps = false;
            if (THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
            texture.userData = { shared: Boolean(textureCache && cacheKey) };
            if (textureCache && cacheKey) textureCache.set(cacheKey, texture);
        }

        const root = new THREE.Group();
        const parts = {};
        const material = createMaterial(texture);
        const u = this.unit;

        for (const part of this.parts) {
            const pivot = new THREE.Group();
            pivot.position.set(part.pivot[0] * u, part.pivot[1] * u, part.pivot[2] * u);
            if (part.rotation) pivot.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
            pivot.userData.baseRotation = pivot.rotation.clone();

            const mesh = new THREE.Mesh(this.createGeometry(part, width, height), material);
            mesh.userData.modelMap = texture;
            mesh.userData.disposeGeometry = true;
            pivot.add(mesh);
            pivot.userData.mesh = mesh;

            const parentPart = part.parent ? parts[part.parent] : null;
            (parentPart || root).add(pivot);
            if (part.name) parts[part.name] = pivot;
        }

        root.userData.modelTexture = texture;
        root.userData.modelHeight = Math.max(...this.parts.map((part) => this.absoluteTop(part))) * u;
        return { root, parts, texture, material };
    }

    absoluteTop(part) {
        let y = part.pivot[1] + part.from[1] + part.size[1];
        let parent = part.parent ? this.byName.get(part.parent) : null;
        while (parent) {
            y += parent.pivot[1];
            parent = parent.parent ? this.byName.get(parent.parent) : null;
        }
        return y;
    }
}

// ---------------------------------------------------------------------------
// Model catalogue
// ---------------------------------------------------------------------------

const VoxelModels = {
    // Humanoid player, 32 units tall at 0.056 blocks per unit (~1.8 blocks).
    PLAYER_UNIT: 0.056,

    createPlayer(appearance, createMaterial) {
        const b = new VoxelModelBuilder({ unit: this.PLAYER_UNIT, texelsPerUnit: 2, seed: appearance.seed || 7 });
        const skin = appearance.skin;
        const hair = appearance.hair;
        const shirt = appearance.shirt;
        const pants = appearance.pants;
        const shoes = 0x2a2420;
        const style = appearance.hairStyle;
        const skinDark = shadeRgb(colorToRgb(skin), -0.18);
        const shirtDark = shadeRgb(colorToRgb(shirt), -0.2);
        const shirtLight = shadeRgb(colorToRgb(shirt), 0.12);
        const skinRgb = colorToRgb(skin);
        const blush = [Math.min(255, skinRgb[0] + 14), skinRgb[1] * 0.88, skinRgb[2] * 0.88];

        const longHair = style === 'long' || style === 'bob';
        const hairOnSides = style !== 'bald' && style !== 'mohawk';

        // Head 8x8x8, pivot at the neck.
        b.part('head', {
            pivot: [0, 24, 0],
            from: [-4, 0, -4],
            size: [8, 8, 8],
            paint: {
                color: skin,
                noise: 0.035,
                faces: {
                    front: (p) => {
                        // Eyes, brows, mouth and a hint of cheeks.
                        p.rect(1.5, 4, 2, 1.5, 0xffffff, 0);
                        p.rect(4.5, 4, 2, 1.5, 0xffffff, 0);
                        p.rect(2.5, 4, 1, 1.5, appearance.eyes || 0x3b2a20, 0);
                        p.rect(4.5, 4, 1, 1.5, appearance.eyes || 0x3b2a20, 0);
                        p.rect(1.5, 3, 2, 0.5, hairOnSides || style === 'mohawk' ? hair : skinDark, 0);
                        p.rect(4.5, 3, 2, 0.5, hairOnSides || style === 'mohawk' ? hair : skinDark, 0);
                        p.rect(3.5, 5.5, 1, 1, skinDark, 0);
                        p.rect(3, 6.5, 2, 0.5, 0x8a4a3a, 0);
                        p.rect(1, 6, 1, 0.5, blush, 0);
                        p.rect(6, 6, 1, 0.5, blush, 0);
                        if (style === 'bald') return;
                        if (style === 'mohawk') {
                            p.rect(3, 0, 2, 1, hair, 0.08);
                            return;
                        }
                        // Fringe
                        p.rect(0, 0, 8, 1.5, hair, 0.08);
                        if (style === 'sidepart') p.rect(0, 1.5, 4.5, 1, hair, 0.08);
                        // Sideburns / locks framing the face.
                        const lockHeight = longHair || style === 'ponytail' ? 4.5 : style === 'pixie' || style === 'short' ? 1.5 : 0;
                        if (lockHeight) {
                            p.rect(0, 1.5, 1, lockHeight, hair, 0.08);
                            p.rect(7, 1.5, 1, lockHeight, hair, 0.08);
                        }
                    },
                    top: (p) => { if (style !== 'bald' && style !== 'mohawk') p.fill(hair, 0.1); },
                    back: (p) => {
                        if (style === 'bald' || style === 'mohawk') return;
                        p.rect(0, 0, 8, longHair || style === 'ponytail' ? 8 : 5, hair, 0.1);
                    },
                    left: (p) => {
                        if (!hairOnSides) { p.rect(3.5, 3.5, 1, 1.5, skinDark, 0); return; }
                        p.rect(0, 0, 8, 2.5, hair, 0.1);
                        p.rect(0, 2.5, longHair ? 8 : 4, longHair ? 5.5 : 2.5, hair, 0.1);
                        p.rect(4.5, 3.5, 1, 1.5, skinDark, 0);
                    },
                    right: (p) => {
                        if (!hairOnSides) { p.rect(3.5, 3.5, 1, 1.5, skinDark, 0); return; }
                        p.rect(0, 0, 8, 2.5, hair, 0.1);
                        p.rect(longHair ? 0 : 4, 2.5, longHair ? 8 : 4, longHair ? 5.5 : 2.5, hair, 0.1);
                        p.rect(2.5, 3.5, 1, 1.5, skinDark, 0);
                    }
                }
            }
        });

        // Hair volumes, pixel aligned to the head.
        const hairPaint = { color: hair, noise: 0.1, bevel: 0.14 };
        if (style === 'mohawk') {
            b.part('hairCrest', { parent: 'head', pivot: [0, 8, 0], from: [-1, 0, -4.5], size: [2, 2.5, 9], paint: hairPaint });
        } else if (style === 'ponytail') {
            b.part('hairTie', { parent: 'head', pivot: [0, 5, -4], from: [-1.5, -1.5, -1.5], size: [3, 3, 1.5], paint: { color: 0xc23b55, noise: 0.04 } });
            b.part('hairTail', { parent: 'head', pivot: [0, 4.5, -5.5], from: [-1, -6, -2], size: [2, 7, 2], paint: hairPaint, rotation: [0.25, 0, 0] });
        } else if (style === 'long') {
            b.part('hairBack', { parent: 'head', pivot: [0, 0, -4], from: [-4.25, -4, -0.75], size: [8.5, 12, 1], paint: hairPaint });
        } else if (style === 'bob') {
            b.part('hairBack', { parent: 'head', pivot: [0, 1, -4], from: [-4.25, -1, -0.75], size: [8.5, 8, 1], paint: hairPaint });
        }
        if (style !== 'bald' && style !== 'mohawk') {
            // Thin cap so the hairline reads as volume, not just paint.
            b.part('hairCap', { parent: 'head', pivot: [0, 8, 0], from: [-4.25, -0.75, -4.25], size: [8.5, 1.25, 8.5], paint: hairPaint });
        }

        // Torso 8x12x4
        b.part('torso', {
            pivot: [0, 12, 0],
            from: [-4, 0, -2],
            size: [8, 12, 4],
            paint: {
                color: shirt,
                noise: 0.05,
                faces: {
                    front: (p) => {
                        p.rect(3, 0, 2, 1.5, skin, 0.03);
                        p.rect(2.5, 0, 0.5, 1.5, shirtDark, 0);
                        p.rect(5, 0, 0.5, 1.5, shirtDark, 0);
                        p.rect(0, 10.5, 8, 1.5, 0x3a2a1e, 0.05);
                        p.rect(3.5, 10.5, 1, 1.5, 0xc9a24a, 0);
                        p.rect(1, 3, 1, 6, shirtLight, 0);
                    },
                    back: (p) => p.rect(0, 10.5, 8, 1.5, 0x3a2a1e, 0.05),
                    left: (p) => p.rect(0, 10.5, 4, 1.5, 0x3a2a1e, 0.05),
                    right: (p) => p.rect(0, 10.5, 4, 1.5, 0x3a2a1e, 0.05),
                    bottom: (p) => p.fill(pants, 0.05)
                }
            }
        });

        // Arms 3x12x3, pivot at the shoulder. Sleeves cover the upper 5 units.
        const armPaint = {
            color: skin,
            noise: 0.035,
            all: (p, face) => {
                if (face === 'top') { p.fill(shirt, 0.05); return; }
                if (face === 'bottom') { p.fill(skinDark, 0.03); return; }
                p.rect(0, 0, p.w, 5, shirt, 0.05);
                p.rect(0, 4.5, p.w, 0.5, shirtDark, 0);
            }
        };
        b.part('rightArm', { pivot: [-5.5, 22.5, 0], from: [-1.5, -10.5, -1.5], size: [3, 12, 3], paint: armPaint });
        b.part('leftArm', { pivot: [5.5, 22.5, 0], from: [-1.5, -10.5, -1.5], size: [3, 12, 3], paint: armPaint });

        // Legs 4x12x4, pivot at the hip, shoes on the lower 2 units.
        const legPaint = {
            color: pants,
            noise: 0.06,
            all: (p, face) => {
                if (face === 'bottom') { p.fill(shoes, 0.04); return; }
                if (face === 'top') return;
                p.rect(0, 10, p.w, 2, shoes, 0.04);
                if (face === 'front') p.rect(0, 10, p.w, 0.5, 0x4a3e36, 0);
            }
        };
        b.part('rightLeg', { pivot: [-2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4], paint: legPaint });
        b.part('leftLeg', { pivot: [2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4], paint: legPaint });

        const model = b.build(createMaterial);
        const hairGroup = new THREE.Group();
        hairGroup.userData.avatarHair = true;
        model.parts.head.add(hairGroup);
        model.parts.hair = hairGroup;
        return model;
    },

    // Mobs face +z. Legs are pivoted at the hip and swing around x.
    createMob(species, createMaterial, textureCache, variant = 0) {
        const builder = this.mobBuilders[species] || this.mobBuilders.pig;
        const b = new VoxelModelBuilder({ unit: 1 / 16, texelsPerUnit: 2, seed: species.length * 13 + variant });
        const rig = builder.call(this, b, variant) || {};
        const model = b.build(createMaterial, { textureCache, cacheKey: `${species}:${variant}` });
        const pick = (names) => (names || []).map((name) => model.parts[name]).filter(Boolean);
        return {
            root: model.root,
            parts: model.parts,
            legs: pick(rig.legs),
            arms: pick(rig.arms),
            wings: pick(rig.wings),
            tail: pick(rig.tail),
            head: rig.head ? model.parts[rig.head] : null,
            legAxis: rig.legAxis || 'x',
            height: model.root.userData.modelHeight
        };
    },

    eyes(p, y, inset, color = 0x15110e, size = 1, highlight = true) {
        p.rect(inset, y, size, size, color, 0);
        p.rect(p.w - inset - size, y, size, size, color, 0);
        if (highlight && size >= 1) {
            p.rect(inset, y, 0.5, 0.5, 0xffffff, 0);
            p.rect(p.w - inset - size, y, 0.5, 0.5, 0xffffff, 0);
        }
    },

    quadLegs(b, { color, size, hipY, x, zFront, zBack, paint }) {
        const legPaint = paint || { color, noise: 0.06 };
        const [w, h, d] = size;
        b.part('legFL', { parent: 'body', pivot: [x, hipY, zFront], from: [-w / 2, -h, -d / 2], size, paint: legPaint });
        b.part('legFR', { parent: 'body', pivot: [-x, hipY, zFront], from: [-w / 2, -h, -d / 2], size, paint: legPaint });
        b.part('legBL', { parent: 'body', pivot: [x, hipY, zBack], from: [-w / 2, -h, -d / 2], size, paint: legPaint });
        b.part('legBR', { parent: 'body', pivot: [-x, hipY, zBack], from: [-w / 2, -h, -d / 2], size, paint: legPaint });
        return ['legFL', 'legFR', 'legBL', 'legBR'];
    },

    mobBuilders: {
        sheep(b) {
            const wool = 0xeeebe1;
            const woolPaint = { color: wool, noise: 0.09, all: (p) => p.spots(0xdcd8cc, 10, 1, 2) };
            b.part('body', { pivot: [0, 0, 0], from: [-5, 6, -7], size: [10, 8, 14], paint: woolPaint });
            b.part('head', {
                parent: 'body', pivot: [0, 12, 6], from: [-3, -3, 0], size: [6, 6, 6],
                paint: {
                    color: 0x2d2a28, noise: 0.05,
                    faces: { front: (p) => { VoxelModels.eyes(p, 2, 0.5, 0xf2eee6, 1, false); p.rect(0.5, 2, 0.5, 1, 0x15110e, 0); p.rect(5, 2, 0.5, 1, 0x15110e, 0); p.rect(2, 4.5, 2, 0.5, 0x5b4f4a, 0); } }
                }
            });
            b.part('woolCap', { parent: 'head', pivot: [0, 3, 0], from: [-3.5, -0.5, 0.5], size: [7, 2, 4], paint: woolPaint });
            b.part('earL', { parent: 'head', pivot: [3, 2, 3], from: [0, -1, -1], size: [2, 1, 2], paint: { color: 0x2d2a28 }, rotation: [0, 0, -0.4] });
            b.part('earR', { parent: 'head', pivot: [-3, 2, 3], from: [-2, -1, -1], size: [2, 1, 2], paint: { color: 0x2d2a28 }, rotation: [0, 0, 0.4] });
            const legs = VoxelModels.quadLegs(b, {
                size: [3, 6, 3], hipY: 7, x: 3, zFront: 4.5, zBack: -4.5,
                paint: { color: 0x3a3532, noise: 0.05, all: (p, face) => { if (face !== 'top' && face !== 'bottom') p.rect(0, 0, p.w, 1.5, wool, 0.08); } }
            });
            return { legs, head: 'head' };
        },

        pig(b) {
            const pink = 0xe7a3a6;
            b.part('body', { pivot: [0, 0, 0], from: [-5, 5, -7], size: [10, 8, 14], paint: { color: pink, noise: 0.05, faces: { top: (p) => p.spots(0xd88e93, 4, 1, 2) } } });
            b.part('head', {
                parent: 'body', pivot: [0, 10, 7], from: [-4, -3, -1], size: [8, 7, 6],
                paint: { color: pink, noise: 0.04, faces: { front: (p) => { VoxelModels.eyes(p, 2, 1, 0x15110e, 1); } } }
            });
            b.part('snout', {
                parent: 'head', pivot: [0, 0, 5], from: [-2, -1, 0], size: [4, 3, 1.5],
                paint: { color: 0xf0b6b8, noise: 0.03, faces: { front: (p) => { p.rect(0.5, 1, 1, 1, 0x9a5a5e, 0); p.rect(2.5, 1, 1, 1, 0x9a5a5e, 0); } } }
            });
            b.part('earL', { parent: 'head', pivot: [3, 4, 2], from: [-1, 0, -1], size: [2, 2, 1], paint: { color: 0xd88e93 }, rotation: [0.3, 0, -0.3] });
            b.part('earR', { parent: 'head', pivot: [-3, 4, 2], from: [-1, 0, -1], size: [2, 2, 1], paint: { color: 0xd88e93 }, rotation: [0.3, 0, 0.3] });
            b.part('tail', { parent: 'body', pivot: [0, 11, -7], from: [-0.5, -0.5, -1.5], size: [1, 1, 1.5], paint: { color: 0xd88e93 }, rotation: [-0.6, 0, 0] });
            const legs = VoxelModels.quadLegs(b, {
                size: [3, 5, 3], hipY: 6, x: 3, zFront: 4.5, zBack: -4.5,
                paint: { color: pink, noise: 0.05, all: (p, face) => { if (face !== 'top' && face !== 'bottom') p.rect(0, 4, p.w, 1, 0x6e4a46, 0.04); } }
            });
            return { legs, head: 'head', tail: ['tail'] };
        },

        duck(b) {
            const white = 0xf3efdc;
            b.part('body', { pivot: [0, 0, 0], from: [-3, 3, -4], size: [6, 5, 8], paint: { color: white, noise: 0.05, faces: { top: (p) => p.rect(0, 5, 6, 3, 0xe4dfc8, 0.05) } } });
            b.part('tailFeathers', { parent: 'body', pivot: [0, 7, -4], from: [-2, -1, -2], size: [4, 2, 2], paint: { color: 0xe4dfc8 }, rotation: [0.5, 0, 0] });
            b.part('wingL', { parent: 'body', pivot: [3, 7, 1], from: [0, -3, -3.5], size: [1, 3, 6], paint: { color: 0xe4dfc8, noise: 0.06 } });
            b.part('wingR', { parent: 'body', pivot: [-3, 7, 1], from: [-1, -3, -3.5], size: [1, 3, 6], paint: { color: 0xe4dfc8, noise: 0.06 } });
            b.part('head', {
                parent: 'body', pivot: [0, 7, 3], from: [-2, 0, -1], size: [4, 5, 4],
                paint: { color: white, noise: 0.04, faces: { left: (p) => p.rect(2, 1.5, 1, 1, 0x15110e, 0), right: (p) => p.rect(1, 1.5, 1, 1, 0x15110e, 0) } }
            });
            b.part('bill', { parent: 'head', pivot: [0, 1.5, 3], from: [-1.5, -0.5, 0], size: [3, 1, 2.5], paint: { color: 0xe8a33b, noise: 0.03 } });
            const legPaint = { color: 0xe8a33b, noise: 0.03 };
            b.part('legL', { parent: 'body', pivot: [1.5, 3, 0], from: [-0.5, -3, -0.5], size: [1, 3, 1], paint: legPaint });
            b.part('legR', { parent: 'body', pivot: [-1.5, 3, 0], from: [-0.5, -3, -0.5], size: [1, 3, 1], paint: legPaint });
            b.part('footL', { parent: 'legL', pivot: [0, -3, 0], from: [-1, 0, -0.5], size: [2, 0.5, 2.5], paint: legPaint });
            b.part('footR', { parent: 'legR', pivot: [0, -3, 0], from: [-1, 0, -0.5], size: [2, 0.5, 2.5], paint: legPaint });
            return { legs: ['legL', 'legR'], wings: ['wingL', 'wingR'], head: 'head' };
        },

        dog(b) {
            const fur = 0xc8955c;
            const light = 0xe2bb88;
            const dark = 0x6e4628;
            b.part('body', {
                pivot: [0, 0, 0], from: [-3, 6, -5], size: [6, 6, 11],
                paint: { color: fur, noise: 0.06, faces: { bottom: (p) => p.fill(light, 0.05), top: (p) => p.rect(1, 0, 4, 11, shadeRgb(colorToRgb(fur), -0.08), 0.06) } }
            });
            b.part('collar', { parent: 'body', pivot: [0, 9, 5], from: [-3.25, -2.5, -1.25], size: [6.5, 5, 1.25], paint: { color: 0xc23b3b, noise: 0.02 } });
            b.part('head', {
                parent: 'body', pivot: [0, 11, 6], from: [-3, -2, -1], size: [6, 6, 5],
                paint: { color: fur, noise: 0.05, faces: { front: (p) => { VoxelModels.eyes(p, 2, 1, 0x15110e, 1); p.rect(2, 0.5, 2, 1, light, 0.03); } } }
            });
            b.part('snout', {
                parent: 'head', pivot: [0, -1, 4], from: [-1.5, -1, 0], size: [3, 3, 3],
                paint: { color: light, noise: 0.04, faces: { front: (p) => p.rect(1, 0, 1, 1, 0x1a1412, 0), top: (p) => p.rect(1, 2, 1, 1, 0x1a1412, 0) } }
            });
            b.part('earL', { parent: 'head', pivot: [3, 4, 1], from: [-0.5, -3, -1], size: [1, 3, 2], paint: { color: dark }, rotation: [0, 0, 0.25] });
            b.part('earR', { parent: 'head', pivot: [-3, 4, 1], from: [-0.5, -3, -1], size: [1, 3, 2], paint: { color: dark }, rotation: [0, 0, -0.25] });
            b.part('tail', { parent: 'body', pivot: [0, 11, -5], from: [-1, -1, -6], size: [2, 2, 6], paint: { color: fur, noise: 0.06, faces: { back: (p) => p.fill(light) } }, rotation: [0.7, 0, 0] });
            const legs = VoxelModels.quadLegs(b, {
                size: [2, 6, 2], hipY: 7, x: 1.75, zFront: 3.5, zBack: -3.5,
                paint: { color: fur, noise: 0.06, all: (p, face) => { if (face !== 'top') p.rect(0, 5, p.w, 1, light, 0.04); } }
            });
            return { legs, head: 'head', tail: ['tail'] };
        },

        cat(b, variant) {
            const palettes = [
                { fur: 0xf2c36b, belly: 0xfff0d0, stripe: 0xd48333, collar: 0xe84f7a },
                { fur: 0x7b6a5a, belly: 0xf2eee7, stripe: 0x4f443a, collar: 0x64b5f6 },
                { fur: 0xf5f1e7, belly: 0xffffff, stripe: 0xd7c7a7, collar: 0xf2c94c }
            ];
            const c = palettes[variant % palettes.length];
            const stripes = (p) => { for (let i = 1; i < p.h; i += 2.5) p.rect(0, i, p.w, 0.75, c.stripe, 0.04); };
            b.part('body', {
                pivot: [0, 0, 0], from: [-2, 5, -5], size: [4, 4, 10],
                paint: { color: c.fur, noise: 0.05, faces: { bottom: (p) => p.fill(c.belly), top: (p) => { for (let z = 1; z < 10; z += 2.5) p.rect(0, z, 4, 0.75, c.stripe, 0.04); }, left: (p) => { for (let z = 1.5; z < 10; z += 2.5) p.rect(z, 0, 0.75, 2.5, c.stripe, 0.04); }, right: (p) => { for (let z = 1.5; z < 10; z += 2.5) p.rect(z, 0, 0.75, 2.5, c.stripe, 0.04); } } }
            });
            b.part('collar', { parent: 'body', pivot: [0, 7, 5], from: [-2.25, -2.25, -1], size: [4.5, 4.5, 1], paint: { color: c.collar, noise: 0.02 } });
            b.part('head', {
                parent: 'body', pivot: [0, 8, 5], from: [-2.5, -1.5, 0], size: [5, 4, 4],
                paint: {
                    color: c.fur, noise: 0.04,
                    faces: {
                        front: (p) => { p.rect(0.5, 1, 1.5, 1, 0x7ccf6a, 0); p.rect(3, 1, 1.5, 1, 0x7ccf6a, 0); p.rect(1, 1, 0.5, 1, 0x15110e, 0); p.rect(3.5, 1, 0.5, 1, 0x15110e, 0); p.rect(1.5, 2, 2, 2, c.belly, 0.02); p.rect(2, 2, 1, 0.5, 0xff8aae, 0); },
                        top: stripes
                    }
                }
            });
            b.part('earL', { parent: 'head', pivot: [1.5, 2.5, 1.5], from: [-0.5, 0, -0.5], size: [1.5, 1.5, 1], paint: { color: c.fur, faces: { front: (p) => p.rect(0.5, 0.5, 0.5, 1, 0xffb6c8, 0) } } });
            b.part('earR', { parent: 'head', pivot: [-1.5, 2.5, 1.5], from: [-1, 0, -0.5], size: [1.5, 1.5, 1], paint: { color: c.fur, faces: { front: (p) => p.rect(0.5, 0.5, 0.5, 1, 0xffb6c8, 0) } } });
            b.part('tail', { parent: 'body', pivot: [0, 8.5, -5], from: [-0.5, -0.5, -5], size: [1, 1, 5], paint: { color: c.fur, noise: 0.05, all: stripes }, rotation: [0.9, 0, 0] });
            b.part('tailTip', { parent: 'tail', pivot: [0, 0, -5], from: [-0.5, -0.5, -4], size: [1, 1, 4], paint: { color: c.fur, noise: 0.05, faces: { back: (p) => p.fill(c.stripe) } }, rotation: [-0.6, 0, 0] });
            const legs = VoxelModels.quadLegs(b, {
                size: [1.5, 5, 1.5], hipY: 5.5, x: 1.25, zFront: 3.5, zBack: -3.5,
                paint: { color: c.fur, noise: 0.05, all: (p, face) => { if (face !== 'top') p.rect(0, 4, p.w, 1, c.belly, 0.02); } }
            });
            return { legs, head: 'head', tail: ['tail', 'tailTip'] };
        },

        giraffe(b) {
            const coat = 0xf2b450;
            const spot = 0x8b4a1d;
            const spotted = { color: coat, noise: 0.05, all: (p) => p.spots(spot, Math.ceil(p.w * p.h / 12), 1.5, 3, 5) };
            b.part('body', { pivot: [0, 0, 0], from: [-4.5, 22, -8], size: [9, 10, 16], paint: spotted });
            b.part('neck', { parent: 'body', pivot: [0, 29, 6], from: [-2, 0, -2], size: [4, 24, 4], paint: spotted, rotation: [0.28, 0, 0] });
            b.part('mane', { parent: 'neck', pivot: [0, 2, -2], from: [-0.75, 0, -1], size: [1.5, 22, 1], paint: { color: 0x7a3e16, noise: 0.06 } });
            b.part('head', {
                parent: 'neck', pivot: [0, 24, 0], from: [-2.5, -1, -2], size: [5, 5, 9],
                paint: { color: coat, noise: 0.05, faces: { left: (p) => p.rect(2.5, 1.5, 1, 1, 0x1f160f, 0), right: (p) => p.rect(5.5, 1.5, 1, 1, 0x1f160f, 0), front: (p) => { p.fill(0xe8c48a, 0.03); p.rect(1, 2, 1, 1, 0x6d3a1a, 0); p.rect(3, 2, 1, 1, 0x6d3a1a, 0); } } },
                rotation: [-0.28, 0, 0]
            });
            const horn = { color: 0xc87821, noise: 0.04, faces: { top: (p) => p.fill(0x4a2a12) } };
            b.part('hornL', { parent: 'head', pivot: [1.25, 4, -0.5], from: [-0.5, 0, -0.5], size: [1, 3, 1], paint: horn });
            b.part('hornR', { parent: 'head', pivot: [-1.25, 4, -0.5], from: [-0.5, 0, -0.5], size: [1, 3, 1], paint: horn });
            b.part('earL', { parent: 'head', pivot: [2.5, 3, -1], from: [0, -0.5, -0.5], size: [2, 1, 1.5], paint: { color: coat }, rotation: [0, 0, -0.3] });
            b.part('earR', { parent: 'head', pivot: [-2.5, 3, -1], from: [-2, -0.5, -0.5], size: [2, 1, 1.5], paint: { color: coat }, rotation: [0, 0, 0.3] });
            b.part('tail', { parent: 'body', pivot: [0, 31, -8], from: [-0.5, -9, -1], size: [1, 9, 1], paint: { color: coat, faces: { bottom: (p) => p.fill(0x3b2412) } }, rotation: [-0.2, 0, 0] });
            const legs = VoxelModels.quadLegs(b, {
                size: [3, 22, 3], hipY: 22, x: 3, zFront: 6, zBack: -6,
                paint: { color: coat, noise: 0.05, all: (p, face) => { if (face === 'top') return; p.spots(spot, 3, 1, 2, 9); p.rect(0, 21, p.w, 1, 0x3b2412, 0.03); } }
            });
            return { legs, head: 'head', tail: ['tail'] };
        },

        macaw(b, variant) {
            const palettes = [
                { body: 0x24b45a, wing: 0x178f48, head: 0xffd43b, tail: 0x1f7ae0 },
                { body: 0xffd43b, wing: 0xff8c1a, head: 0x24b45a, tail: 0x1f7ae0 },
                { body: 0xe3362d, wing: 0xffd43b, head: 0x1f7ae0, tail: 0x24b45a },
                { body: 0x1f7ae0, wing: 0x174cbf, head: 0xffd43b, tail: 0xe3362d }
            ];
            const c = palettes[variant % palettes.length];
            b.part('body', { pivot: [0, 0, 0], from: [-2.5, 3, -3], size: [5, 6, 6], paint: { color: c.body, noise: 0.06 }, rotation: [-0.25, 0, 0] });
            b.part('head', {
                parent: 'body', pivot: [0, 9, 1], from: [-2, 0, -2], size: [4, 4, 4],
                paint: { color: c.head, noise: 0.05, all: (p, face) => { if (face === 'left' || face === 'right') { p.rect(1, 1, 2, 1.5, 0xf6f1e6, 0); p.rect(1.5, 1.25, 1, 1, 0x15110e, 0); } } }
            });
            b.part('beak', { parent: 'head', pivot: [0, 1.5, 2], from: [-1, -1.5, 0], size: [2, 3, 2], paint: { color: 0x2a2522, noise: 0.03, faces: { top: (p) => p.fill(0xf2ece0) } }, rotation: [0.3, 0, 0] });
            const wingPaint = { color: c.wing, noise: 0.06, all: (p, face) => { if (face === 'left' || face === 'right') p.rect(0, p.h - 1.5, p.w, 1.5, c.tail, 0.05); } };
            b.part('wingL', { parent: 'body', pivot: [2.5, 8, 0], from: [0, -5, -3], size: [1, 5, 6], paint: wingPaint });
            b.part('wingR', { parent: 'body', pivot: [-2.5, 8, 0], from: [-1, -5, -3], size: [1, 5, 6], paint: wingPaint });
            b.part('tail', { parent: 'body', pivot: [0, 4, -3], from: [-1.5, -0.5, -8], size: [3, 1, 8], paint: { color: c.tail, noise: 0.05 }, rotation: [-0.5, 0, 0] });
            const legPaint = { color: 0x5a5049, noise: 0.03 };
            b.part('legL', { parent: 'body', pivot: [1, 3, 0], from: [-0.5, -3, -0.5], size: [1, 3, 1], paint: legPaint });
            b.part('legR', { parent: 'body', pivot: [-1, 3, 0], from: [-0.5, -3, -0.5], size: [1, 3, 1], paint: legPaint });
            return { legs: ['legL', 'legR'], wings: ['wingL', 'wingR'], head: 'head', tail: ['tail'] };
        },

        spider(b) {
            const body = 0x231a2b;
            const hair = 0x352a40;
            b.part('abdomen', {
                pivot: [0, 0, 0], from: [-5, 4, -11], size: [10, 8, 10],
                paint: { color: body, noise: 0.08, faces: { top: (p) => { p.rect(4, 2, 2, 6, 0x6b2133, 0.05); p.rect(3, 4, 4, 1, 0x6b2133, 0.05); } } }
            });
            b.part('body', { pivot: [0, 0, 0], from: [-3.5, 4, -1], size: [7, 5, 6], paint: { color: hair, noise: 0.08 } });
            b.part('head', {
                parent: 'body', pivot: [0, 6.5, 5], from: [-3, -2.5, 0], size: [6, 5, 4],
                paint: {
                    color: body, noise: 0.06,
                    faces: { front: (p) => { p.rect(1, 1, 1, 1, 0xe03b3b, 0); p.rect(4, 1, 1, 1, 0xe03b3b, 0); p.rect(0.5, 2.5, 1, 1, 0xe03b3b, 0); p.rect(4.5, 2.5, 1, 1, 0xe03b3b, 0); p.rect(2, 2, 2, 1, 0xff6b5b, 0); p.rect(2, 4, 0.5, 1, 0xd9d2c4, 0); p.rect(3.5, 4, 0.5, 1, 0xd9d2c4, 0); } }
                }
            });
            const legPaint = { color: 0x16111b, noise: 0.06, bevel: 0.05 };
            const legs = [];
            for (let i = 0; i < 4; i++) {
                const z = 4 - i * 2;
                const spread = 0.45 - i * 0.3;
                b.part(`legL${i}`, { parent: 'body', pivot: [3.5, 7, z], from: [0, -1, -0.75], size: [12, 1.5, 1.5], paint: legPaint, rotation: [0, spread, -0.45] });
                b.part(`legR${i}`, { parent: 'body', pivot: [-3.5, 7, z], from: [-12, -1, -0.75], size: [12, 1.5, 1.5], paint: legPaint, rotation: [0, -spread, 0.45] });
                legs.push(`legL${i}`, `legR${i}`);
            }
            return { legs, head: 'head', legAxis: 'y' };
        },

        cave_monster(b) {
            const skin = 0x2f5270;
            const dark = 0x1d3449;
            const glow = 0xa7f3d0;
            b.part('body', {
                pivot: [0, 10, 0], from: [-6, 0, -3.5], size: [12, 16, 7],
                paint: { color: skin, noise: 0.08, all: (p) => p.spots(dark, 6, 1.5, 3, 3), faces: { front: (p) => { p.rect(3, 4, 6, 7, 0x3e6a8c, 0.06); } } }
            });
            b.part('head', {
                parent: 'body', pivot: [0, 16, 0.5], from: [-5, 0, -4], size: [10, 8, 8],
                paint: {
                    color: 0x477599, noise: 0.07,
                    faces: { front: (p) => { p.rect(1.5, 3, 2.5, 1.5, glow, 0); p.rect(6, 3, 2.5, 1.5, glow, 0); p.rect(2, 3.25, 1, 1, 0xffffff, 0); p.rect(6.5, 3.25, 1, 1, 0xffffff, 0); p.rect(2.5, 5.5, 5, 1.5, 0x10202e, 0); p.rect(3, 5.5, 1, 0.75, 0xe8e2d0, 0); p.rect(6, 5.5, 1, 0.75, 0xe8e2d0, 0); } }
                }
            });
            const horn = { color: 0x8ecae6, noise: 0.04, faces: { top: (p) => p.fill(0xd6f1ff) } };
            b.part('hornL', { parent: 'head', pivot: [3.5, 8, 0], from: [-1, 0, -1], size: [2, 3, 2], paint: horn, rotation: [0, 0, -0.35] });
            b.part('hornR', { parent: 'head', pivot: [-3.5, 8, 0], from: [-1, 0, -1], size: [2, 3, 2], paint: horn, rotation: [0, 0, 0.35] });
            const armPaint = { color: skin, noise: 0.08, all: (p, face) => { if (face !== 'top') p.rect(0, p.h - 2, p.w, 2, dark, 0.06); } };
            b.part('armL', { parent: 'body', pivot: [7.5, 14, 0], from: [-1.5, -16, -2], size: [4, 16, 4], paint: armPaint });
            b.part('armR', { parent: 'body', pivot: [-7.5, 14, 0], from: [-2.5, -16, -2], size: [4, 16, 4], paint: armPaint });
            const legPaint = { color: dark, noise: 0.07 };
            b.part('legL', { pivot: [3, 10, 0], from: [-2.5, -10, -2.5], size: [5, 10, 5], paint: legPaint });
            b.part('legR', { pivot: [-3, 10, 0], from: [-2.5, -10, -2.5], size: [5, 10, 5], paint: legPaint });
            return { legs: ['legL', 'legR'], arms: ['armL', 'armR'], head: 'head' };
        }
    }
};

window.VoxelModelBuilder = VoxelModelBuilder;
window.VoxelModels = VoxelModels;
