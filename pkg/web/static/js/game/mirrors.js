// Mirrors: the wall mirror (`wall_mirror`) and the mirror cube (`mirror`, 'Silver Mirror', made
// in js/game/chemistry.js too). Both show a shiny silver texture from afar, and metal in RTX and
// Ultra, which reflects the sky through the environment map.
// Near one, real reflection: planar passes, as THREE.Reflector does, for one plane or two.
// - Ten times a second (mirrorsPick) the mirror faces within reach are listed from the columns'
//   cached block lists (ChunkColumn.findBlocks: nothing to do where there are no mirrors). Each
//   plane scores the part of the screen its faces cover, with what opaque blocks hide taken off
//   (mirrorRankPlanes), and the plane that covers most is reflected, wherever its nearest cell is.
//   Every face on that plane shares its reflection.
// - A second plane is reflected too when the game has the frame time to spare and it is worth it
//   (mirrorPlaneBudget, MIRROR_SECOND_MIN_COVER): a corner, or two sides of a cube. Two is the hard
//   cap. It refreshes half as often as the first, it drops back to one under load and it stays
//   there for a while. Touch screens only ever reflect one.
// - Mirrors on other planes get a sheen (mirrorsSetSheen): quads that multiply what is under them
//   by a brightness that moves with the view, so they read as polished metal and not as a mirror
//   that broke. One draw call and no pass; it keeps the lighting of the block below it.
// - mirrorsRender, before the frame is drawn: the world seen from the camera reflected in that
//   plane, clipped at the plane (oblique near plane), goes to a small target (MIRROR_TARGET_MAX
//   on its long side, at most half the screen). The local player's avatar is shown for this pass
//   and the first-person hands are hidden. The sun's shadows are not rendered again. A still
//   camera refreshes one frame in three; a slow game (under 25 fps) renders half as often.
// - A mirror seen inside a mirror (mirrorFacingPlane) costs no passes of its own, so two facing
//   ones make the corridor of images at the same hard cap of two planes:
//   * Inside a pass the quads of the other planes are drawn with the image they already have, from
//     this frame or an earlier one (mirrorPassShows). What it shows in them shows them back, so each
//     frame adds one image to the corridor, and each one is a little darker (MIRROR_BOUNCE_DARKEN).
//   * With a second plane to spare, the mirror behind you takes it (`nested`): its camera is the first
//     mirror's reflected in it, so the first image in the corridor is exact. Its quads show only in the
//     first mirror's pass: it is what the screen does not see. Deeper images are the pictures already
//     there, seen from further away: the right size and the right way round, with some parallax wrong.
//   * With one plane (touch screens, under load) the mirror behind you borrows the first mirror's
//     own previous image, at the same place across (`echo`, mirrorEchoMatrix): a corridor still,
//     though what it shows in the facing mirror is the near one's view. That needs a second target
//     for the plane, swapped each frame. Only then: a plane's own quads are never in its own pass, so
//     nothing else can sample a target while it is drawn to.
// - Quads a hair in front of those faces (mirrorsSetQuads) project the target onto themselves.
//   Being opaque and in the normal queue, stained glass in front of them still filters them.
// - The target has the encoding of the frame it is drawn in (sRGB in normal and RTX, linear
//   half-float in Ultra, where the frame is HDR), with the same tone mapping as the main pass, so
//   the quads copy its values as they are and no material has to change program between passes.
// - With no mirror in reach the passes, the quads and the targets (freed after a few seconds) do
//   not exist. Past MIRROR_RANGE, a mirror is its texture and its plane's others its sheen.
// Wall mirrors attach to the wall clicked and stay when it is broken, like the other wall items.
// Mixed into Game.prototype; hooked through js/extensions.js. Loaded after decor.js.

// Blocks from the camera at which a mirror face starts reflecting, and at which its plane's other
// faces still do (and a face still has its sheen).
const MIRROR_RANGE = 14;
const MIRROR_PLANE_RANGE = 20;
// Long side of the reflection in pixels: the hard cap of what a mirror can cost.
const MIRROR_TARGET_MAX = 512;
const MIRROR_TARGET_MAX_TOUCH = 256;
const MIRROR_PICK_EVERY = 0.1;
const MIRROR_MAX_FACES = 256;
// The most planes reflected in a frame, and what a second one must cover of the screen to be worth
// a pass (the first one only has to be seen at all).
const MIRROR_MAX_PLANES = 2;
const MIRROR_MIN_COVER = 0.0002;
const MIRROR_SECOND_MIN_COVER = 0.004;
// The same for a mirror seen in the first one: it is the whole point of standing between two.
const MIRROR_NESTED_MIN_COVER = 0.001;
// Average seconds per frame under which a second plane starts, over which it stops, and how long
// after stopping it may try again (a pass costs frames, so it would come and go otherwise).
const MIRROR_SECOND_START = 1 / 50;
const MIRROR_SECOND_STOP = 1 / 35;
const MIRROR_SECOND_RETRY = 10;
// Faces walked for a clear line of sight each pick, largest on screen first: in all, and per plane
// (a wall of mirrors next door must not use them up).
const MIRROR_SIGHT_CHECKS = 32;
const MIRROR_PLANE_SIGHT_CHECKS = 8;
// The planes in use count this much more (they would flicker otherwise).
const MIRROR_KEEP_FACTOR = 1.4;
// Nothing nearer the eye than this is on screen, for the coverage.
const MIRROR_VIEW_NEAR = 0.05;
// The silver surface of a wall mirror lies this far from its wall; the frames are painted.
const MIRROR_WALL_DEPTH = 1 / 16;
const MIRROR_WALL_FRAME = 1 / 16;
const MIRROR_CUBE_FRAME = 0.08;
// How far in front of the block the quads float (the reflection is clipped a little beyond it).
const MIRROR_QUAD_LIFT = 0.002;
const MIRROR_CLIP_LIFT = 0.01;
const MIRROR_TARGET_IDLE_SECONDS = 5;
// Silver takes a little of the light.
const MIRROR_TINT = [0.92, 0.94, 0.96];
// And a mirror seen in a mirror a little more, as real ones lose some at every bounce.
const MIRROR_BOUNCE_DARKEN = 0.92;

// The axes of a plane's rectangle, chosen so that (first, second, normal axis) is right-handed.
const MIRROR_PLANE_AXES = [[1, 2], [2, 0], [0, 1]];
const MIRROR_FACINGS = { n: [2, -1], s: [2, 1], e: [0, 1], w: [0, -1] };
// Where a face's line of sight is tested, across its rectangle: its middle and four inner points.
const MIRROR_SIGHT_POINTS = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];

// ---------------------------------------------------------------------------------------
// Pure helpers (also used by test/js/furniture.test.js)

// One reflecting rectangle: normal along `axis` with `sign`, at coordinate `at` of that axis.
function mirrorMakeFace(cell, axis, sign, at, frame) {
    const [first, second] = MIRROR_PLANE_AXES[axis];
    const center = [cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5];
    center[axis] = at;
    return {
        axis, sign, at, center,
        first: [cell[first] + frame, cell[first] + 1 - frame],
        second: [cell[second] + frame, cell[second] + 1 - frame]
    };
}

// The faces of a mirror block `def` at (x, y, z): the six of a cube, or the front of a wall mirror.
function mirrorFacesOf(def, x, y, z) {
    const cell = [x, y, z];
    if (def.mirrorSurface === 'cube') {
        const faces = [];
        for (let axis = 0; axis < 3; axis++) {
            faces.push(mirrorMakeFace(cell, axis, 1, cell[axis] + 1, MIRROR_CUBE_FRAME));
            faces.push(mirrorMakeFace(cell, axis, -1, cell[axis], MIRROR_CUBE_FRAME));
        }
        return faces;
    }
    if (def.mirrorSurface === 'wall') {
        const [axis, sign] = MIRROR_FACINGS[def.state.facing];
        const at = cell[axis] + (sign > 0 ? MIRROR_WALL_DEPTH : 1 - MIRROR_WALL_DEPTH);
        return [mirrorMakeFace(cell, axis, sign, at, MIRROR_WALL_FRAME)];
    }
    return [];
}

function mirrorPlaneKey(face) {
    return `${face.axis}:${face.sign}:${face.at}`;
}

function mirrorFaceDistance(face, eye) {
    return Math.hypot(eye[0] - face.center[0], eye[1] - face.center[1], eye[2] - face.center[2]);
}

// From the eye to the nearest point of the rectangle: what a large face is near by.
function mirrorFaceNearest(face, eye) {
    const [firstAxis, secondAxis] = MIRROR_PLANE_AXES[face.axis];
    const clamp = (value, [low, high]) => Math.max(low, Math.min(high, value));
    return Math.hypot(
        eye[face.axis] - face.at,
        eye[firstAxis] - clamp(eye[firstAxis], face.first),
        eye[secondAxis] - clamp(eye[secondAxis], face.second)
    );
}

// Whether the eye is on a face's silver side.
function mirrorFaceLooksAt(face, eye) {
    return (eye[face.axis] - face.at) * face.sign > 0.02;
}

// What the coverage needs of a camera: eye, unit vectors, and the half-size of the screen at
// distance 1 (the tangents of half the field of view).
function mirrorViewOf(camera) {
    const e = camera.matrixWorld.elements;
    const tanY = Math.tan((camera.fov * Math.PI) / 360);
    return {
        eye: [e[12], e[13], e[14]],
        right: [e[0], e[1], e[2]],
        up: [e[4], e[5], e[6]],
        forward: [-e[8], -e[9], -e[10]],
        tanX: tanY * camera.aspect,
        tanY
    };
}

// Keeps the part of a polygon where inside(point) >= 0 (Sutherland-Hodgman, one edge).
function mirrorClipPolygon(points, inside) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const da = inside(a);
        const db = inside(b);
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) {
            const t = da / (da - db);
            out.push(a.map((value, k) => value + (b[k] - value) * t));
        }
    }
    return out;
}

// How much of the screen a face covers, from 0 to 1: its rectangle in front of the near plane,
// projected, cut by the edges of the screen. Nothing hides it here, that is mirrorFaceSight's part.
function mirrorFaceCover(face, view) {
    if (!mirrorFaceLooksAt(face, view.eye)) return 0;
    const [firstAxis, secondAxis] = MIRROR_PLANE_AXES[face.axis];
    const [a0, a1] = face.first;
    const [b0, b1] = face.second;
    let polygon = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => {
        const d = [0, 0, 0];
        d[face.axis] = face.at - view.eye[face.axis];
        d[firstAxis] = a - view.eye[firstAxis];
        d[secondAxis] = b - view.eye[secondAxis];
        const dot = (v) => d[0] * v[0] + d[1] * v[1] + d[2] * v[2];
        return [dot(view.right), dot(view.up), dot(view.forward)];
    });
    polygon = mirrorClipPolygon(polygon, ([, , z]) => z - MIRROR_VIEW_NEAR);
    if (polygon.length < 3) return 0;
    let screen = polygon.map(([x, y, z]) => [x / (z * view.tanX), y / (z * view.tanY)]);
    for (const inside of [([x]) => 1 - x, ([x]) => 1 + x, ([, y]) => 1 - y, ([, y]) => 1 + y]) {
        screen = mirrorClipPolygon(screen, inside);
        if (screen.length < 3) return 0;
    }
    let twice = 0;
    for (let i = 0; i < screen.length; i++) {
        const [x0, y0] = screen[i];
        const [x1, y1] = screen[(i + 1) % screen.length];
        twice += x0 * y1 - x1 * y0;
    }
    // The screen is 2 by 2 here.
    return Math.abs(twice) / 8;
}

// Whether the straight line between two points misses every block `opaque(x, y, z)` says is solid.
function mirrorLineClear(opaque, from, to) {
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const steps = Math.ceil(distance / 0.25);
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const x = from[0] + (to[0] - from[0]) * t;
        const y = from[1] + (to[1] - from[1]) * t;
        const z = from[2] + (to[2] - from[2]) * t;
        if (opaque(Math.floor(x), Math.floor(y), Math.floor(z))) return false;
    }
    return true;
}

// How much of a face the eye has a clear line to, from 0 to 1: a block in front of its middle
// leaves the rest of it to be seen.
function mirrorFaceSight(face, eye, opaque) {
    const [firstAxis, secondAxis] = MIRROR_PLANE_AXES[face.axis];
    let clear = 0;
    for (const [a, b] of MIRROR_SIGHT_POINTS) {
        const target = [0, 0, 0];
        target[face.axis] = face.at + face.sign * 0.05;
        target[firstAxis] = face.first[0] + (face.first[1] - face.first[0]) * a;
        target[secondAxis] = face.second[0] + (face.second[1] - face.second[0]) * b;
        if (mirrorLineClear(opaque, eye, target)) clear++;
    }
    return clear / MIRROR_SIGHT_POINTS.length;
}

// The planes worth reflecting, most of the screen first: [{ key, cover, face }], `face` being its
// largest on screen. Only faces in range count. `currentKeys` are the planes in use.
function mirrorRankPlanes(faces, view, currentKeys, opaque) {
    const seen = [];
    for (const face of faces) {
        if (mirrorFaceNearest(face, view.eye) > MIRROR_RANGE) continue;
        const cover = mirrorFaceCover(face, view);
        if (cover > 0) seen.push({ face, cover });
    }
    seen.sort((a, b) => b.cover - a.cover);
    const planes = new Map();
    let checks = 0;
    for (const { face, cover } of seen) {
        const key = mirrorPlaneKey(face);
        let plane = planes.get(key);
        if (!plane) {
            plane = { key, cover: 0, face: null, checks: 0, sight: 0 };
            planes.set(key, plane);
        }
        let sight;
        if (checks < MIRROR_SIGHT_CHECKS && plane.checks < MIRROR_PLANE_SIGHT_CHECKS) {
            sight = mirrorFaceSight(face, view.eye, opaque);
            checks++;
            plane.checks++;
            plane.sight += sight;
        } else {
            // Out of checks: as much of it is taken to be seen as of the plane's larger faces.
            sight = plane.checks ? plane.sight / plane.checks : 0;
        }
        plane.cover += cover * sight;
        if (!plane.face && sight > 0) plane.face = face;
    }
    const score = (plane) => plane.cover * (currentKeys.includes(plane.key) ? MIRROR_KEEP_FACTOR : 1);
    return [...planes.values()]
        .filter((plane) => plane.face && plane.cover >= MIRROR_MIN_COVER)
        .sort((a, b) => score(b) - score(a))
        .map(({ key, cover, face }) => ({ key, cover, face }));
}

// How many planes are reflected this frame ({ planes, wait } goes in and comes back): one until
// frames are short, and back to one for a while as soon as they are not.
function mirrorPlaneBudget(budget, frameTime, delta, touch) {
    if (touch) return { planes: 1, wait: 0 };
    const wait = Math.max(0, budget.wait - delta);
    if (budget.planes > 1) {
        return frameTime > MIRROR_SECOND_STOP ? { planes: 1, wait: MIRROR_SECOND_RETRY } : { planes: budget.planes, wait };
    }
    return wait === 0 && frameTime < MIRROR_SECOND_START ? { planes: MIRROR_MAX_PLANES, wait: 0 } : { planes: 1, wait };
}

// Which of the ranked planes are drawn with `budget` planes.
function mirrorPlanesToDraw(ranked, budget) {
    return ranked.filter((plane, index) => index === 0 || (index < budget && plane.cover >= MIRROR_SECOND_MIN_COVER));
}

// One corner per call, in the order the triangles of the quads use.
function mirrorQuadCorners(face) {
    const [firstAxis, secondAxis] = MIRROR_PLANE_AXES[face.axis];
    const corner = (a, b) => {
        const point = [0, 0, 0];
        point[face.axis] = face.at + face.sign * MIRROR_QUAD_LIFT;
        point[firstAxis] = a;
        point[secondAxis] = b;
        return point;
    };
    const [a0, a1] = face.first;
    const [b0, b1] = face.second;
    const quad = face.sign > 0
        ? [corner(a0, b0), corner(a1, b0), corner(a1, b1), corner(a0, b1)]
        : [corner(a0, b0), corner(a0, b1), corner(a1, b1), corner(a1, b0)];
    return [0, 1, 2, 0, 2, 3].map((index) => quad[index]);
}

// Triangles of the quads, counter-clockwise from the side the faces look at.
function mirrorQuadPositions(faces) {
    const positions = new Float32Array(faces.length * 18);
    let write = 0;
    for (const face of faces) {
        for (const point of mirrorQuadCorners(face)) {
            positions[write++] = point[0];
            positions[write++] = point[1];
            positions[write++] = point[2];
        }
    }
    return positions;
}

// The normal of each of those vertices.
function mirrorQuadNormals(faces) {
    const normals = new Float32Array(faces.length * 18);
    faces.forEach((face, index) => {
        for (let vertex = 0; vertex < 6; vertex++) normals[index * 18 + vertex * 3 + face.axis] = face.sign;
    });
    return normals;
}

// Size of the target for a screen: at most half of it, and at most `limit` on its long side.
function mirrorTargetSize(width, height, limit) {
    const scale = Math.min(0.5, limit / Math.max(width, height, 1));
    return { width: Math.max(64, Math.floor(width * scale)), height: Math.max(64, Math.floor(height * scale)) };
}

// Frames between two refreshes of the reflection. The second plane takes half of them.
function mirrorRefreshInterval(cameraMoved, slowGame, second = false) {
    const interval = cameraMoved ? 1 : 3;
    return (slowGame ? interval * 2 : interval) * (second ? 2 : 1);
}

// What a camera sees reflected in a face's plane: the eye behind it, the axes turned about it.
function mirrorReflectView(view, face) {
    const turn = (vector) => vector.map((value, axis) => (axis === face.axis ? -value : value));
    const eye = view.eye.slice();
    eye[face.axis] = 2 * face.at - eye[face.axis];
    return { ...view, eye, right: turn(view.right), up: turn(view.up), forward: turn(view.forward) };
}

// The plane that looks back at `face` from in front of it and is best seen in it, as { key, cover,
// face }, or null: the mirror behind you, between two facing mirrors. Not one of the planes in `taken`.
function mirrorFacingPlane(faces, face, view, opaque, taken = []) {
    const inside = mirrorReflectView(view, face);
    const from = face.center.slice();
    from[face.axis] += face.sign * 0.05;
    const planes = new Map();
    for (const other of faces) {
        if (other.axis !== face.axis || other.sign !== -face.sign || (other.at - face.at) * face.sign <= 0) continue;
        const key = mirrorPlaneKey(other);
        if (taken.includes(key)) continue;
        const cover = mirrorFaceCover(other, inside);
        if (cover <= 0) continue;
        let plane = planes.get(key);
        if (!plane) {
            plane = { key, cover: 0, face: null, biggest: 0, checks: 0 };
            planes.set(key, plane);
        }
        if (plane.checks >= MIRROR_PLANE_SIGHT_CHECKS) continue;
        plane.checks++;
        if (mirrorFaceSight(other, from, opaque) <= 0) continue;
        plane.cover += cover;
        if (cover > plane.biggest) {
            plane.biggest = cover;
            plane.face = other;
        }
    }
    let best = null;
    for (const plane of planes.values()) {
        if (plane.face && plane.cover >= MIRROR_MIN_COVER && (!best || plane.cover > best.cover)) best = plane;
    }
    return best && { key: best.key, cover: best.cover, face: best.face };
}

// How that plane is shown: 'nested' with a second plane to spare and enough of it seen (half as
// much if it is in use, or it would flicker), or else 'echo', which costs no pass; null with no plane.
function mirrorFacingMode(facing, budget, direct, wasNested = false) {
    if (!facing) return null;
    const enough = wasNested ? MIRROR_NESTED_MIN_COVER / 2 : MIRROR_NESTED_MIN_COVER;
    return direct < budget && facing.cover >= enough ? 'nested' : 'echo';
}

// The order of the passes: a nested plane before the mirror it is seen in.
function mirrorPassOrder(planes) {
    return [...planes.filter((plane) => plane.nested), ...planes.filter((plane) => !plane.nested)];
}

// The slots whose quads show inside the pass of `rendering`: the others that already have an image.
// Never itself, so no pass reads the target it is drawing to.
function mirrorPassShows(slots, rendering) {
    return slots.filter((slot) => slot !== rendering && slot.plane && slot.target && slot.target !== rendering.target && slot.drawnKey === slot.plane.key);
}

// Column-major matrix that moves a point straight across to the plane of `face`: x and y are what
// parallel mirrors keep, so the image of a facing mirror reads the near one's at the same place.
function mirrorEchoMatrix(face) {
    const elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    elements[face.axis * 5] = 0;
    elements[12 + face.axis] = face.at;
    return elements;
}

// The sum of the geometry of a list of faces, to tell when it changed.
function mirrorFacesSignature(faces) {
    return faces.map((face) => `${mirrorPlaneKey(face)},${face.first[0]},${face.second[0]}`).sort().join(';');
}

// ---------------------------------------------------------------------------------------
// The wall mirror

furnShape('wall_mirror', {
    boxes: [[0, 0, 15, 16, 16, 16]],
    place: furnPlaceOnWall
});

// Silver in a dark frame, with the same sheen as the cube. The frame's width is the quad's margin.
registerTexturePattern('wall_mirror', (f, s, tint, seed) => {
    const silver = f.rgb(0xc9d3dc);
    const frame = f.rgb(0x4a3a2a);
    f.each(s, (x, y, u, v) => {
        if (Math.min(u, 1 - u, v, 1 - v) < MIRROR_WALL_FRAME) {
            f.put(s, x, y, f.tone(s, frame, (f.fbm(u, v, 8, 2, seed) - 0.5) * 0.3), 0.75);
            return;
        }
        const sheen = Math.max(0, 1 - Math.abs(u + v - 0.9) / 0.12) * 0.5 + Math.max(0, 1 - Math.abs(u + v - 1.15) / 0.05) * 0.35;
        f.put(s, x, y, f.mix(f.tone(s, silver, (v - 0.5) * 0.2), [255, 255, 255], sheen), 0.5);
    });
}, { rtx: { roughness: 0.06, metalness: 1, normalScale: 0.05 } });

furnBlock('wall_mirror', {
    color: 0xC9D3DC, name: 'Wall Mirror', shape: 'wall_mirror', breakDuration: 0.25, category: 'stone', solid: false, mirrorSurface: 'wall',
    faces: { top: 'painting_back', side: 'painting_back', front: { pattern: 'wall_mirror', minSize: 32 } }
});

registerGameContent(function ({ addRecipe }) {
    // The silver of the chemistry bench's recipe, without the bench: same materials, same two mirrors.
    addRecipe('mirror', 'Silver a Mirror', 'mirror', 2, [{ type: 'glass', amount: 1 }, { type: 'element_ag', amount: 1 }]);
    addRecipe('wall_mirror', 'Frame Wall Mirrors', 'wall_mirror', 2, [{ type: 'mirror', amount: 1 }, { type: 'planks', amount: 1 }]);
});

// ---------------------------------------------------------------------------------------
// Reflection

const MIRROR_VERTEX_SHADER = `
    uniform mat4 textureMatrix;
    varying vec4 vReflected;
    void main() {
        vReflected = textureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

// No tone mapping or encoding here: the target already has the values of the frame (see the top).
const MIRROR_FRAGMENT_SHADER = `
    uniform sampler2D reflection;
    uniform vec3 tint;
    uniform float bounce;
    varying vec4 vReflected;
    void main() {
        gl_FragColor = vec4(texture2DProj(reflection, vReflected).rgb * tint * bounce, 1.0);
    }
`;

const MIRROR_SHEEN_VERTEX_SHADER = `
    varying vec3 vPosition;
    varying vec3 vFaceNormal;
    void main() {
        vPosition = position;
        vFaceNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

// The output multiplies what is there, times two (see the blending), so 0.5 changes nothing: light
// from above where the view bounces upwards, dark below, and a soft streak that slides as you move.
const MIRROR_SHEEN_FRAGMENT_SHADER = `
    varying vec3 vPosition;
    varying vec3 vFaceNormal;
    void main() {
        vec3 bounce = reflect(normalize(vPosition - cameraPosition), normalize(vFaceNormal));
        float sky = smoothstep(-0.35, 0.65, bounce.y);
        float streak = smoothstep(0.82, 1.0, sin((bounce.x + bounce.z) * 7.0 + bounce.y * 3.0));
        gl_FragColor = vec4(vec3(0.38 + 0.2 * sky + 0.12 * streak), 1.0);
    }
`;

Object.assign(Game.prototype, {
    // A flag per block id, for ChunkColumn.findBlocks.
    mirrorsFlags() {
        const registry = this.world.registry;
        if (!registry.mirrorFlags) {
            registry.mirrorFlags = new Uint8Array(registry.names.length);
            for (let id = 1; id < registry.names.length; id++) {
                registry.mirrorFlags[id] = this.world.blockTypes[registry.names[id]].mirrorSurface ? 1 : 0;
            }
        }
        return registry.mirrorFlags;
    },

    // The mirror faces around `eye` that nothing covers, as an array of mirrorMakeFace results.
    mirrorsGather(eye) {
        const world = this.world;
        const registry = world.registry;
        const flags = this.mirrorsFlags();
        const size = world.chunkSize;
        const faces = [];
        const lowX = Math.floor((eye[0] - MIRROR_PLANE_RANGE) / size);
        const highX = Math.floor((eye[0] + MIRROR_PLANE_RANGE) / size);
        const lowZ = Math.floor((eye[2] - MIRROR_PLANE_RANGE) / size);
        const highZ = Math.floor((eye[2] + MIRROR_PLANE_RANGE) / size);
        for (let chunkX = lowX; chunkX <= highX; chunkX++) {
            for (let chunkZ = lowZ; chunkZ <= highZ; chunkZ++) {
                const column = world.columns.get(world.chunkKey(chunkX, chunkZ));
                if (!column) continue;
                for (const index of column.findBlocks(flags, 'mirror')) {
                    const x = chunkX * size + index % CHUNK_SIZE;
                    const z = chunkZ * size + Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE;
                    const y = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE)) + WORLD_MIN_Y;
                    const def = world.blockTypes[registry.names[column.blocks[index]]];
                    for (const face of mirrorFacesOf(def, x, y, z)) {
                        if (mirrorFaceDistance(face, eye) > MIRROR_PLANE_RANGE) continue;
                        if (def.mirrorSurface === 'cube') {
                            const next = [x, y, z];
                            next[face.axis] += face.sign;
                            if (registry.fullCube[world.getBlockId(next[0], next[1], next[2])]) continue;
                        }
                        faces.push(face);
                    }
                }
            }
        }
        return faces;
    },

    // Chooses the planes to reflect (see the top) and keeps the quads in step with them.
    mirrorsPick() {
        const camera = this.camera;
        camera.updateMatrixWorld();
        const view = mirrorViewOf(camera);
        const eye = view.eye;
        const faces = this.mirrorsGather(eye);
        if (faces.length === 0) {
            this.mirrorPlanes = [];
            this.mirrorEchoPlane = null;
            if (this.mirrorSheen) this.mirrorsSetSheen([]);
            return;
        }
        const registry = this.world.registry;
        const opaque = (x, y, z) => registry.fullCube[this.world.getBlockId(x, y, z)] === 1;
        const previous = (this.mirrorPlanes || []).map((plane) => plane.key);
        const budget = this.mirrorBudget ? this.mirrorBudget.planes : 1;
        const chosen = mirrorPlanesToDraw(mirrorRankPlanes(faces, view, previous, opaque), budget);
        const nearest = (a, b) => mirrorFaceDistance(a, eye) - mirrorFaceDistance(b, eye);
        const planeOf = ({ key, face }) => ({
            key, face,
            faces: faces.filter((other) => mirrorPlaneKey(other) === key).sort(nearest).slice(0, MIRROR_MAX_FACES)
        });
        const wasNested = (this.mirrorPlanes || []).find((plane) => plane.nested);
        this.mirrorPlanes = chosen.map(planeOf);
        // The mirror that looks back at the first one (see the top).
        const facing = chosen.length ? mirrorFacingPlane(faces, chosen[0].face, view, opaque, chosen.map((plane) => plane.key)) : null;
        const mode = mirrorFacingMode(facing, budget, chosen.length, Boolean(wasNested && facing && wasNested.key === facing.key));
        if (mode === 'nested') this.mirrorPlanes.push({ ...planeOf(facing), nested: true, parentKey: chosen[0].key });
        this.mirrorEchoPlane = mode === 'echo' ? planeOf(facing) : null;
        if (this.mirrorEchoPlane) {
            if (!this.mirrorEcho) {
                this.mirrorEcho = {};
                this.mirrorsBuildQuads(this.mirrorEcho);
            }
            this.mirrorsSetQuads(this.mirrorEcho, this.mirrorEchoPlane.faces);
        }
        this.mirrorsAssignSlots();
        // What does not reflect shines, if it looks this way.
        const keys = chosen.map((plane) => plane.key);
        this.mirrorsSetSheen(faces.filter((face) => mirrorFaceLooksAt(face, eye) && !keys.includes(mirrorPlaneKey(face))).sort(nearest).slice(0, MIRROR_MAX_FACES));
    },

    // Every plane keeps the slot (quads, target) it already has, so swapping ranks draws nothing new.
    mirrorsAssignSlots() {
        if (!this.mirrorSlots) this.mirrorSlots = Array.from({ length: MIRROR_MAX_PLANES }, () => ({ plane: null, drawnKey: null }));
        const slots = this.mirrorSlots;
        const planes = this.mirrorPlanes;
        for (const slot of slots) slot.plane = planes.find((plane) => plane.key === slot.drawnKey) || null;
        for (const plane of planes) {
            if (slots.some((slot) => slot.plane === plane)) continue;
            slots.find((slot) => !slot.plane).plane = plane;
        }
        for (const slot of slots) {
            if (slot.plane) this.mirrorsSetQuads(slot, slot.plane.faces);
        }
    },

    mirrorsSetQuads(slot, faces) {
        const signature = mirrorFacesSignature(faces);
        if (signature === slot.signature) return;
        slot.signature = signature;
        if (!slot.quads) this.mirrorsBuildQuads(slot);
        const geometry = slot.quads.geometry;
        // Frees the old buffers: setAttribute alone leaves them on the GPU.
        geometry.dispose();
        geometry.setAttribute('position', new THREE.BufferAttribute(mirrorQuadPositions(faces), 3));
        geometry.computeBoundingSphere();
    },

    mirrorsBuildQuads(slot) {
        slot.textureMatrix = new THREE.Matrix4();
        const material = new THREE.ShaderMaterial({
            uniforms: {
                reflection: { value: null },
                textureMatrix: { value: slot.textureMatrix },
                tint: { value: new THREE.Vector3(...MIRROR_TINT) },
                bounce: { value: 1 }
            },
            vertexShader: MIRROR_VERTEX_SHADER,
            fragmentShader: MIRROR_FRAGMENT_SHADER,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
            toneMapped: false
        });
        slot.quads = new THREE.Mesh(new THREE.BufferGeometry(), material);
        slot.quads.visible = false;
        // It lives at the origin: its vertices are world positions, which the texture matrix needs.
        slot.quads.matrixAutoUpdate = false;
        this.scene.add(slot.quads);
    },

    mirrorsBuildSheen() {
        const material = new THREE.ShaderMaterial({
            vertexShader: MIRROR_SHEEN_VERTEX_SHADER,
            fragmentShader: MIRROR_SHEEN_FRAGMENT_SHADER,
            transparent: true,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.DstColorFactor,
            blendDst: THREE.SrcColorFactor,
            blendSrcAlpha: THREE.ZeroFactor,
            blendDstAlpha: THREE.OneFactor,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
            toneMapped: false
        });
        this.mirrorSheen = new THREE.Mesh(new THREE.BufferGeometry(), material);
        this.mirrorSheen.matrixAutoUpdate = false;
        this.scene.add(this.mirrorSheen);
    },

    // The shine of the faces that do not reflect: multiplies what is under it by twice its output.
    mirrorsSetSheen(faces) {
        if (faces.length === 0 && !this.mirrorSheen) return;
        if (!this.mirrorSheen) this.mirrorsBuildSheen();
        this.mirrorSheen.visible = faces.length > 0;
        const signature = mirrorFacesSignature(faces);
        if (signature === this.mirrorSheenSignature) return;
        this.mirrorSheenSignature = signature;
        const geometry = this.mirrorSheen.geometry;
        geometry.dispose();
        geometry.setAttribute('position', new THREE.BufferAttribute(mirrorQuadPositions(faces), 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(mirrorQuadNormals(faces), 3));
        geometry.computeBoundingSphere();
    },

    // A slot's target for the current graphics mode and screen size.
    mirrorsTarget(slot) {
        const renderer = this.renderer;
        const ultra = Boolean(this.ultraModeEnabled && this.ultraTarget);
        const screen = renderer.getDrawingBufferSize(new THREE.Vector2());
        const limit = this.touchControlsEnabled ? MIRROR_TARGET_MAX_TOUCH : MIRROR_TARGET_MAX;
        const { width, height } = mirrorTargetSize(screen.x, screen.y, limit);
        if (slot.target && slot.targetUltra !== ultra) this.mirrorsFreeTarget(slot);
        if (!slot.target) {
            slot.target = this.mirrorsNewTarget(width, height, ultra);
            slot.targetUltra = ultra;
            slot.quads.material.uniforms.reflection.value = slot.target.texture;
        } else if (slot.target.width !== width || slot.target.height !== height) {
            slot.target.setSize(width, height);
        }
        slot.target.texture.encoding = ultra ? THREE.LinearEncoding : renderer.outputEncoding;
        return slot.target;
    },

    mirrorsNewTarget(width, height, ultra) {
        const target = new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: ultra ? THREE.HalfFloatType : THREE.UnsignedByteType,
            depthBuffer: true
        });
        target.texture.generateMipmaps = false;
        return target;
    },

    // The second target of a plane whose echo reads its last image while it draws the next.
    mirrorsBackTarget(slot) {
        const { target } = slot;
        if (!slot.backTarget) slot.backTarget = this.mirrorsNewTarget(target.width, target.height, slot.targetUltra);
        else if (slot.backTarget.width !== target.width || slot.backTarget.height !== target.height) slot.backTarget.setSize(target.width, target.height);
        slot.backTarget.texture.encoding = target.texture.encoding;
        return slot.backTarget;
    },

    mirrorsFreeBackTarget(slot) {
        if (!slot.backTarget) return;
        slot.backTarget.dispose();
        slot.backTarget = null;
    },

    mirrorsFreeTarget(slot) {
        this.mirrorsFreeBackTarget(slot);
        if (!slot.target) return;
        slot.target.dispose();
        slot.target = null;
    },

    // The camera `virtual` on the other side of the plane from the camera `source` (the player's, or
    // for a nested plane another mirror's), and the matrix from world positions to where each one
    // lies in its image. THREE.Reflector's method, with the plane in world coordinates.
    mirrorsAimCamera(face, textureMatrix, source, virtual) {
        const camera = source;
        const normal = new THREE.Vector3();
        normal.setComponent(face.axis, face.sign);
        const point = new THREE.Vector3(face.center[0], face.center[1], face.center[2]);
        const position = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
        const rotation = new THREE.Matrix4().extractRotation(camera.matrixWorld);

        virtual.position.copy(point).sub(position).reflect(normal).negate().add(point);
        const lookAt = new THREE.Vector3(0, 0, -1).applyMatrix4(rotation).add(position);
        virtual.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
        virtual.lookAt(point.clone().sub(lookAt).reflect(normal).negate().add(point));
        // The player's lens: a mirror's own has the oblique near plane of its own pass in it.
        virtual.near = this.camera.near;
        virtual.far = this.camera.far;
        virtual.updateMatrixWorld();
        virtual.projectionMatrix.copy(this.camera.projectionMatrix);

        textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
        textureMatrix.multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse);

        // The near plane becomes the mirror's own (terathon.com/lengyel/Lengyel-Oblique.pdf): what
        // is behind the mirror must not appear in it.
        const clipPoint = point.clone().addScaledVector(normal, MIRROR_CLIP_LIFT);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, clipPoint).applyMatrix4(virtual.matrixWorldInverse);
        const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
        const matrix = virtual.projectionMatrix.elements;
        const q = new THREE.Vector4(
            (Math.sign(clip.x) + matrix[8]) / matrix[0],
            (Math.sign(clip.y) + matrix[9]) / matrix[5],
            -1,
            (1 + matrix[10]) / matrix[14]
        );
        clip.multiplyScalar(2 / clip.dot(q));
        matrix[2] = clip.x;
        matrix[6] = clip.y;
        matrix[10] = clip.z + 1;
        matrix[14] = clip.w;
    },

    // What an echo reads: the image of the plane `face`, at the same place across from where it is.
    mirrorsAimEcho(echo, slot, face) {
        echo.textureMatrix.copy(slot.textureMatrix).multiply(new THREE.Matrix4().fromArray(mirrorEchoMatrix(face)));
        echo.quads.material.uniforms.reflection.value = slot.target.texture;
    },

    // Draws a reflection with the local player in it, no first-person hands and no mirrors shining,
    // but the quads in `shown`, a bounce darker: the mirrors that can be seen in this one.
    mirrorsDrawReflection(delta, target, updateAvatar, camera, shown = []) {
        const renderer = this.renderer;
        const avatar = this.localPlayerAvatar;
        const hands = [this.firstPersonHand, this.firstPersonLeftHand].filter(Boolean);
        const handsVisible = hands.map((hand) => hand.visible);
        const firstPerson = this.cameraViewMode === 'first' && !this.followTargetPlayerId && !this.cinematic;
        if (updateAvatar && avatar && firstPerson && !this.pauseOpen) this.updateLocalPlayerAvatar(this.camera.position, delta);
        const avatarVisible = avatar ? avatar.visible : false;
        const tag = avatar ? avatar.userData.nameSprite : null;
        const tagVisible = tag ? tag.visible : false;
        const shadowUpdate = renderer.shadowMap.autoUpdate;
        const previousTarget = renderer.getRenderTarget();
        const meshes = [...this.mirrorSlots.map((slot) => slot.quads), this.mirrorEcho && this.mirrorEcho.quads, this.mirrorSheen].filter(Boolean);
        const meshesVisible = meshes.map((mesh) => mesh.visible);

        hands.forEach((hand) => { hand.visible = false; });
        if (avatar && firstPerson) avatar.visible = true;
        if (tag) tag.visible = false;
        meshes.forEach((mesh) => { mesh.visible = false; });
        shown.forEach((mesh) => {
            mesh.visible = true;
            mesh.material.uniforms.bounce.value = MIRROR_BOUNCE_DARKEN;
        });
        renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(target);
        // The depth buffer must be writable to be cleared (as in THREE.Reflector).
        renderer.state.buffers.depth.setMask(true);
        if (renderer.autoClear === false) renderer.clear();
        renderer.render(this.scene, camera);
        renderer.setRenderTarget(previousTarget);
        shown.forEach((mesh) => { mesh.material.uniforms.bounce.value = 1; });
        renderer.shadowMap.autoUpdate = shadowUpdate;
        if (tag) tag.visible = tagVisible;
        if (avatar) avatar.visible = avatarVisible;
        hands.forEach((hand, i) => { hand.visible = handsVisible[i]; });
        meshes.forEach((mesh, i) => { mesh.visible = meshesVisible[i]; });
    },

    // Before each frame is drawn (renderFrame in js/game/ultra.js).
    mirrorsRender(delta) {
        // A running average of the frame time, while there is something to spend it on.
        const active = this.mirrorPlanes && this.mirrorPlanes.length > 0;
        this.mirrorFrameTime = active ? (this.mirrorFrameTime ?? delta) * 0.95 + delta * 0.05 : undefined;
        if (active) this.mirrorBudget = mirrorPlaneBudget(this.mirrorBudget || { planes: 1, wait: 1 }, this.mirrorFrameTime, delta, this.touchControlsEnabled);
        this.mirrorPickWait = (this.mirrorPickWait || 0) - delta;
        if (this.mirrorPickWait <= 0) {
            this.mirrorPickWait = MIRROR_PICK_EVERY;
            this.mirrorsPick();
        }
        if (!this.mirrorSlots) return;

        const planes = this.mirrorPlanes;
        let moved = false;
        if (planes.length > 0) {
            this.camera.updateMatrixWorld();
            if (!this.mirrorLastCamera) this.mirrorLastCamera = new THREE.Matrix4();
            moved = !this.mirrorLastCamera.equals(this.camera.matrixWorld);
            this.mirrorLastCamera.copy(this.camera.matrixWorld);
        }
        const slow = this.mirrorFrameTime > 1 / 25;
        let updateAvatar = true;
        for (const slot of this.mirrorSlots) {
            if (slot.plane && planes.includes(slot.plane)) {
                slot.idle = 0;
                continue;
            }
            if (slot.quads) slot.quads.visible = false;
            slot.plane = null;
            slot.drawnKey = null;
            // The target outlives a glance away from the mirror, not a walk away from it.
            if (slot.target) {
                slot.idle = (slot.idle || 0) + delta;
                if (slot.idle >= MIRROR_TARGET_IDLE_SECONDS) this.mirrorsFreeTarget(slot);
            }
        }
        const slotOf = (plane) => this.mirrorSlots.find((slot) => slot.plane === plane);
        for (const plane of mirrorPassOrder(planes)) {
            const slot = slotOf(plane);
            if (!slot) continue;
            const target = this.mirrorsTarget(slot);
            slot.framesWaited = (slot.framesWaited || 0) + 1;
            const interval = mirrorRefreshInterval(moved, slow, plane !== planes[0]);
            const nested = Boolean(plane.nested);
            const fresh = plane.key === slot.drawnKey && target === slot.drawnTarget && nested === slot.drawnNested;
            if (fresh && slot.framesWaited < interval) continue;
            slot.framesWaited = 0;
            if (!slot.camera) slot.camera = new THREE.PerspectiveCamera();
            let source = this.camera;
            if (nested) {
                // Its camera comes from the first mirror's, which aims here too: its image stays as it
                // is, and its matrix with it, until its own pass.
                const parent = slotOf(planes[0]);
                if (!parent.camera) parent.camera = new THREE.PerspectiveCamera();
                if (!this.mirrorSpareMatrix) this.mirrorSpareMatrix = new THREE.Matrix4();
                this.mirrorsAimCamera(parent.plane.face, this.mirrorSpareMatrix, this.camera, parent.camera);
                source = parent.camera;
            }
            this.mirrorsAimCamera(plane.face, slot.textureMatrix, source, slot.camera);
            const shown = mirrorPassShows(this.mirrorSlots, slot).map((other) => other.quads);
            // The mirror behind you with no plane for it: the last image of this one, into a new one.
            const echo = plane === planes[0] ? this.mirrorEchoPlane : null;
            let drawTo = target;
            if (echo) {
                drawTo = this.mirrorsBackTarget(slot);
                if (fresh) {
                    this.mirrorsAimEcho(this.mirrorEcho, slot, plane.face);
                    shown.push(this.mirrorEcho.quads);
                }
            } else {
                this.mirrorsFreeBackTarget(slot);
            }
            this.mirrorsDrawReflection(delta, drawTo, updateAvatar, slot.camera, shown);
            if (echo) {
                slot.backTarget = target;
                slot.target = drawTo;
                slot.quads.material.uniforms.reflection.value = drawTo.texture;
            }
            slot.drawnKey = plane.key;
            slot.drawnTarget = slot.target;
            slot.drawnNested = nested;
            updateAvatar = false;
            // A nested plane is not on the screen: it is only seen in the first mirror's pass.
            slot.quads.visible = !nested;
        }
    }
});
