// Mirrors: the wall mirror (`wall_mirror`) and the mirror cube (`mirror`, 'Silver Mirror', made
// in js/game/chemistry.js too). Both show a shiny silver texture from afar, and metal in RTX and
// Ultra, which reflects the sky through the environment map.
// Near one, real reflection: one planar pass for one plane, as THREE.Reflector does.
// - Ten times a second (mirrorsPick) the mirror faces within reach are listed from the columns'
//   cached block lists (ChunkColumn.findBlocks: nothing to do where there are no mirrors). The
//   nearest face that looks at the camera, in view and not behind an opaque block, picks the plane.
//   Every face on that plane shares its reflection; mirrors on other planes keep their texture.
// - mirrorsRender, before the frame is drawn: the world seen from the camera reflected in that
//   plane, clipped at the plane (oblique near plane), goes to a small target (MIRROR_TARGET_MAX
//   on its long side, at most half the screen). The local player's avatar is shown for this pass
//   and the first-person hands are hidden. The sun's shadows are not rendered again. A still
//   camera refreshes one frame in three; a slow game (under 25 fps) renders half as often.
// - Quads a hair in front of those faces (mirrorsSetQuads) project the target onto themselves.
//   Being opaque and in the normal queue, stained glass in front of them still filters them.
// - The target has the encoding of the frame it is drawn in (sRGB in normal and RTX, linear
//   half-float in Ultra, where the frame is HDR), with the same tone mapping as the main pass, so
//   the quads copy its values as they are and no material has to change program between passes.
// - With no mirror in reach the pass, the quads and the target (freed after a few seconds) do not
//   exist. Past MIRROR_RANGE, a mirror is its texture.
// Wall mirrors attach to the wall clicked and stay when it is broken, like the other wall items.
// Mixed into Game.prototype; hooked through js/extensions.js. Loaded after decor.js.

// Blocks from the camera at which a mirror face starts reflecting, and at which its plane's other
// faces still do.
const MIRROR_RANGE = 14;
const MIRROR_PLANE_RANGE = 20;
// Long side of the reflection in pixels: the hard cap of what a mirror can cost.
const MIRROR_TARGET_MAX = 512;
const MIRROR_TARGET_MAX_TOUCH = 256;
const MIRROR_PICK_EVERY = 0.1;
const MIRROR_MAX_FACES = 256;
// Candidates walked for a clear line of sight each pick, nearest first.
const MIRROR_SIGHT_CHECKS = 8;
// In view: a face closer than this always counts; further away it must be within this cosine of
// the way the camera looks (wider than the screen: a face's centre may be off it, the face not).
const MIRROR_ALWAYS_NEAR = 2.5;
const MIRROR_VIEW_COS = 0.3;
// The current plane is kept unless another one is this much closer (it would flicker otherwise).
const MIRROR_KEEP_BONUS = 1.5;
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

// The axes of a plane's rectangle, chosen so that (first, second, normal axis) is right-handed.
const MIRROR_PLANE_AXES = [[1, 2], [2, 0], [0, 1]];
const MIRROR_FACINGS = { n: [2, -1], s: [2, 1], e: [0, 1], w: [0, -1] };

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

// Whether a camera at `eye` looking along `forward` can see this face's silver side.
function mirrorFaceInView(face, eye, forward) {
    if ((eye[face.axis] - face.at) * face.sign <= 0.02) return false;
    const distance = mirrorFaceDistance(face, eye);
    if (distance > MIRROR_RANGE) return false;
    if (distance < MIRROR_ALWAYS_NEAR) return true;
    const along = (face.center[0] - eye[0]) * forward[0] + (face.center[1] - eye[1]) * forward[1] + (face.center[2] - eye[2]) * forward[2];
    return along >= MIRROR_VIEW_COS * distance;
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

// The face that picks the reflected plane, or null: the nearest one in view with a clear line of
// sight. `currentKey` is the plane reflected until now.
function mirrorPickFace(faces, eye, forward, currentKey, opaque) {
    const ranked = [];
    for (const face of faces) {
        if (!mirrorFaceInView(face, eye, forward)) continue;
        const bonus = mirrorPlaneKey(face) === currentKey ? MIRROR_KEEP_BONUS : 0;
        ranked.push({ face, score: mirrorFaceDistance(face, eye) - bonus });
    }
    ranked.sort((a, b) => a.score - b.score);
    for (const { face } of ranked.slice(0, MIRROR_SIGHT_CHECKS)) {
        const target = face.center.slice();
        target[face.axis] += face.sign * 0.05;
        if (mirrorLineClear(opaque, eye, target)) return face;
    }
    return null;
}

// Triangles of the quads, counter-clockwise from the side the faces look at.
function mirrorQuadPositions(faces) {
    const positions = new Float32Array(faces.length * 18);
    let write = 0;
    for (const face of faces) {
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
        for (const index of [0, 1, 2, 0, 2, 3]) {
            positions[write++] = quad[index][0];
            positions[write++] = quad[index][1];
            positions[write++] = quad[index][2];
        }
    }
    return positions;
}

// Size of the target for a screen: at most half of it, and at most `limit` on its long side.
function mirrorTargetSize(width, height, limit) {
    const scale = Math.min(0.5, limit / Math.max(width, height, 1));
    return { width: Math.max(64, Math.floor(width * scale)), height: Math.max(64, Math.floor(height * scale)) };
}

// Frames between two refreshes of the reflection.
function mirrorRefreshInterval(cameraMoved, slowGame) {
    const interval = cameraMoved ? 1 : 3;
    return slowGame ? interval * 2 : interval;
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
    varying vec4 vReflected;
    void main() {
        gl_FragColor = vec4(texture2DProj(reflection, vReflected).rgb * tint, 1.0);
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

    // Chooses the plane to reflect (see the top) and keeps the quads in step with it.
    mirrorsPick() {
        const camera = this.camera;
        const eye = [camera.position.x, camera.position.y, camera.position.z];
        const faces = this.mirrorsGather(eye);
        if (faces.length === 0) {
            this.mirrorFace = null;
            return;
        }
        const look = camera.getWorldDirection(new THREE.Vector3());
        const registry = this.world.registry;
        const opaque = (x, y, z) => registry.fullCube[this.world.getBlockId(x, y, z)] === 1;
        const previousKey = this.mirrorFace ? mirrorPlaneKey(this.mirrorFace) : null;
        const face = mirrorPickFace(faces, eye, [look.x, look.y, look.z], previousKey, opaque);
        this.mirrorFace = face;
        if (!face) return;
        const key = mirrorPlaneKey(face);
        const onPlane = faces.filter((other) => mirrorPlaneKey(other) === key);
        onPlane.sort((a, b) => mirrorFaceDistance(a, eye) - mirrorFaceDistance(b, eye));
        this.mirrorsSetQuads(onPlane.slice(0, MIRROR_MAX_FACES));
    },

    mirrorsSetQuads(faces) {
        const signature = faces.map((face) => `${mirrorPlaneKey(face)},${face.first[0]},${face.second[0]}`).sort().join(';');
        if (signature === this.mirrorQuadsSignature) return;
        this.mirrorQuadsSignature = signature;
        if (!this.mirrorQuads) this.mirrorsBuildQuads();
        const geometry = this.mirrorQuads.geometry;
        geometry.setAttribute('position', new THREE.BufferAttribute(mirrorQuadPositions(faces), 3));
        geometry.computeBoundingSphere();
    },

    mirrorsBuildQuads() {
        this.mirrorTextureMatrix = new THREE.Matrix4();
        const material = new THREE.ShaderMaterial({
            uniforms: {
                reflection: { value: null },
                textureMatrix: { value: this.mirrorTextureMatrix },
                tint: { value: new THREE.Vector3(...MIRROR_TINT) }
            },
            vertexShader: MIRROR_VERTEX_SHADER,
            fragmentShader: MIRROR_FRAGMENT_SHADER,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
            toneMapped: false
        });
        this.mirrorQuads = new THREE.Mesh(new THREE.BufferGeometry(), material);
        this.mirrorQuads.visible = false;
        // It lives at the origin: its vertices are world positions, which the texture matrix needs.
        this.mirrorQuads.matrixAutoUpdate = false;
        this.scene.add(this.mirrorQuads);
    },

    // The target for the current graphics mode and screen size.
    mirrorsTarget() {
        const renderer = this.renderer;
        const ultra = Boolean(this.ultraModeEnabled && this.ultraTarget);
        const screen = renderer.getDrawingBufferSize(new THREE.Vector2());
        const limit = this.touchControlsEnabled ? MIRROR_TARGET_MAX_TOUCH : MIRROR_TARGET_MAX;
        const { width, height } = mirrorTargetSize(screen.x, screen.y, limit);
        if (this.mirrorTarget && this.mirrorTargetUltra !== ultra) this.mirrorsFreeTarget();
        if (!this.mirrorTarget) {
            this.mirrorTarget = new THREE.WebGLRenderTarget(width, height, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: ultra ? THREE.HalfFloatType : THREE.UnsignedByteType,
                depthBuffer: true
            });
            this.mirrorTarget.texture.generateMipmaps = false;
            this.mirrorTargetUltra = ultra;
            this.mirrorQuads.material.uniforms.reflection.value = this.mirrorTarget.texture;
        } else if (this.mirrorTarget.width !== width || this.mirrorTarget.height !== height) {
            this.mirrorTarget.setSize(width, height);
        }
        this.mirrorTarget.texture.encoding = ultra ? THREE.LinearEncoding : renderer.outputEncoding;
        return this.mirrorTarget;
    },

    mirrorsFreeTarget() {
        if (!this.mirrorTarget) return;
        this.mirrorTarget.dispose();
        this.mirrorTarget = null;
    },

    // The camera on the other side of the plane, and the matrix from world positions to where
    // each one lies in its image. THREE.Reflector's method, with the plane in world coordinates.
    mirrorsAimCamera(face) {
        if (!this.mirrorCamera) this.mirrorCamera = new THREE.PerspectiveCamera();
        const camera = this.camera;
        const virtual = this.mirrorCamera;
        const normal = new THREE.Vector3();
        normal.setComponent(face.axis, face.sign);
        const point = new THREE.Vector3(face.center[0], face.center[1], face.center[2]);
        const position = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
        const rotation = new THREE.Matrix4().extractRotation(camera.matrixWorld);

        virtual.position.copy(point).sub(position).reflect(normal).negate().add(point);
        const lookAt = new THREE.Vector3(0, 0, -1).applyMatrix4(rotation).add(position);
        virtual.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
        virtual.lookAt(point.clone().sub(lookAt).reflect(normal).negate().add(point));
        virtual.near = camera.near;
        virtual.far = camera.far;
        virtual.updateMatrixWorld();
        virtual.projectionMatrix.copy(camera.projectionMatrix);

        this.mirrorTextureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
        this.mirrorTextureMatrix.multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse);

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

    // Draws the reflection with the local player in it and no first-person hands.
    mirrorsDrawReflection(delta, target) {
        const renderer = this.renderer;
        const avatar = this.localPlayerAvatar;
        const hands = [this.firstPersonHand, this.firstPersonLeftHand].filter(Boolean);
        const handsVisible = hands.map((hand) => hand.visible);
        const firstPerson = this.cameraViewMode === 'first' && !this.followTargetPlayerId && !this.cinematic;
        if (avatar && firstPerson && !this.pauseOpen) this.updateLocalPlayerAvatar(this.camera.position, delta);
        const avatarVisible = avatar ? avatar.visible : false;
        const tag = avatar ? avatar.userData.nameSprite : null;
        const tagVisible = tag ? tag.visible : false;
        const shadowUpdate = renderer.shadowMap.autoUpdate;
        const previousTarget = renderer.getRenderTarget();

        hands.forEach((hand) => { hand.visible = false; });
        if (avatar && firstPerson) avatar.visible = true;
        if (tag) tag.visible = false;
        this.mirrorQuads.visible = false;
        renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(target);
        // The depth buffer must be writable to be cleared (as in THREE.Reflector).
        renderer.state.buffers.depth.setMask(true);
        if (renderer.autoClear === false) renderer.clear();
        renderer.render(this.scene, this.mirrorCamera);
        renderer.setRenderTarget(previousTarget);
        renderer.shadowMap.autoUpdate = shadowUpdate;
        if (tag) tag.visible = tagVisible;
        if (avatar) avatar.visible = avatarVisible;
        hands.forEach((hand, i) => { hand.visible = handsVisible[i]; });
        this.mirrorQuads.visible = true;
    },

    // Before each frame is drawn (renderFrame in js/game/ultra.js).
    mirrorsRender(delta) {
        this.mirrorPickWait = (this.mirrorPickWait || 0) - delta;
        if (this.mirrorPickWait <= 0) {
            this.mirrorPickWait = MIRROR_PICK_EVERY;
            this.mirrorsPick();
        }
        const face = this.mirrorFace;
        if (!face) {
            if (this.mirrorQuads) this.mirrorQuads.visible = false;
            this.mirrorDrawnKey = null;
            // The target outlives a glance away from the mirror, not a walk away from it.
            if (this.mirrorTarget) {
                this.mirrorIdleTime = (this.mirrorIdleTime || 0) + delta;
                if (this.mirrorIdleTime >= MIRROR_TARGET_IDLE_SECONDS) this.mirrorsFreeTarget();
            }
            return;
        }
        this.mirrorIdleTime = 0;

        const target = this.mirrorsTarget();
        this.camera.updateMatrixWorld();
        if (!this.mirrorLastCamera) this.mirrorLastCamera = new THREE.Matrix4();
        const moved = !this.mirrorLastCamera.equals(this.camera.matrixWorld);
        this.mirrorLastCamera.copy(this.camera.matrixWorld);
        // A running average of the frame time, for mirrorRefreshInterval.
        this.mirrorFrameTime = (this.mirrorFrameTime ?? delta) * 0.95 + delta * 0.05;
        const key = mirrorPlaneKey(face);
        this.mirrorFramesWaited = (this.mirrorFramesWaited || 0) + 1;
        const interval = mirrorRefreshInterval(moved, this.mirrorFrameTime > 1 / 25);
        if (key === this.mirrorDrawnKey && target === this.mirrorDrawnTarget && this.mirrorFramesWaited < interval) return;
        this.mirrorFramesWaited = 0;
        this.mirrorDrawnKey = key;
        this.mirrorDrawnTarget = target;
        this.mirrorsAimCamera(face);
        this.mirrorsDrawReflection(delta, target);
    }
});
