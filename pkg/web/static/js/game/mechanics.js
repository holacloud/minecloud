// Motor-driven mechanics: electric blocks that MOVE other blocks.
// - Motor ram (`motor_ram`) and sticky ram (`sticky_ram`): electric consumers (40 W) with a
//   facing (n, e, s, w, u = up, d = down). Placed, they face the player (look down at the
//   floor and the ram points up). While their network has power they are OUT: they push the
//   line of blocks in front of them one block (up to 12; never bedrock, liquids, electric
//   blocks, doors, beds, crops, signs...) and fill the gap with their arm (`ram_arm`).
//   Without power the arm comes back; the sticky ram also pulls back the block stuck to it.
// - Lift winch (`lift_winch`, 60 W) and lift platform (`lift_platform`): the winch hangs the
//   platform on ropes straight below it (only air between them, up to 48 blocks). Powered, it
//   hoists the platform until it is 2 blocks below the winch (room for a player on it);
//   unpowered, it lowers it until it rests on something. 2.5 blocks a second.
// - The SERVER moves everything (pkg/network/mechanics.go) on the power tick, writes the
//   blocks to the chunks and broadcasts them with blockPlace. State lives in the block NAME:
//   `motor_ram:e:out`, `sticky_ram:u:in`, `ram_arm:e:plain` (js/blockShapes.js states).
//   MECHANICS_KINDS mirrors mechanicsKinds in mechanics.go (test/js/mechanics.test.js checks
//   it); each kind joins ELECTRIC_KINDS as a consumer.
// - Before the blocks of a move, the server sends `mechMove {kind, dir, moved, filled}`. A
//   push or pull carries the local player standing on a moved block, or shoves them out of a
//   filled cell. A lift move tells the platform's new height at once.
// - The platform block itself is invisible in the chunk mesh: a mesh drawn here glides
//   towards the block's real height at the lift's speed, the player collides with (and rides)
//   that mesh instead of the block, and it stays clickable (to break it or build on it).
// Mixed into Game.prototype; hooked through js/extensions.js. Loaded after logic.js.

const MECHANICS_KINDS = {
    motor_ram: { role: 'consumer', watts: 40 },
    sticky_ram: { role: 'consumer', watts: 40 },
    lift_winch: { role: 'consumer', watts: 60 }
};

Object.entries(MECHANICS_KINDS).forEach(([id, kind]) => {
    ELECTRIC_KINDS[id] = kind;
});

const MECH_FACINGS = ['n', 'e', 's', 'w', 'u', 'd'];
const MECH_STEPS = { n: [0, 0, -1], e: [1, 0, 0], s: [0, 0, 1], w: [-1, 0, 0], u: [0, 1, 0], d: [0, -1, 0] };
const MECH_PX = 1 / 16;
// Blocks a second the lift travels (one block every 400 ms on the server).
const MECH_LIFT_SPEED = 2.5;
// Rope between the winch and the platform at the most (as liftMaxRope).
const MECH_LIFT_ROPE = 48;
// How often the chunks near the player are searched for platforms (s), and how far (chunks).
const MECH_LIFT_SCAN = 0.25;
const MECH_LIFT_CHUNKS = 3;

// ---------------------------------------------------------------------------------------
// Pure helpers (also used by test/js/mechanics.test.js)

// Rotates a box written facing north (front at z = 0) to any of the six facings.
function mechRotateBox(box, facing) {
    const [x0, y0, z0, x1, y1, z1] = box;
    if (facing === 'u') return [x0, 1 - z1, y0, x1, 1 - z0, y1];
    if (facing === 'd') return [x0, z0, 1 - y1, x1, z1, 1 - y0];
    return rotateShapeBox(box, facing);
}

// The ram's own cell: the body at the back, and the plate (in) or the rod (out) in front.
function mechRamBoxes(state) {
    const boxes = [[0, 0, 5 * MECH_PX, 1, 1, 1]];
    if (state.arm === 'out') boxes.push([6 * MECH_PX, 6 * MECH_PX, 0, 10 * MECH_PX, 10 * MECH_PX, 5 * MECH_PX]);
    else boxes.push([0, 0, 0, 1, 1, 4 * MECH_PX], [3 * MECH_PX, 3 * MECH_PX, 4 * MECH_PX, 13 * MECH_PX, 13 * MECH_PX, 5 * MECH_PX]);
    return boxes.map((box) => mechRotateBox(box, state.facing));
}

// The arm's cell (in front of an extended ram): the plate at the far side and the rod.
function mechArmBoxes(facing) {
    return [[0, 0, 0, 1, 1, 4 * MECH_PX], [6 * MECH_PX, 6 * MECH_PX, 4 * MECH_PX, 10 * MECH_PX, 10 * MECH_PX, 1]]
        .map((box) => mechRotateBox(box, facing));
}

// A ram faces the player who places it: the opposite of the look, up when looking down.
function mechFacingFromLook(look) {
    const y = look.y || 0;
    if (y < -0.7) return 'u';
    if (y > 0.7) return 'd';
    return SHAPE_OPPOSITE[shapeFacingFromVector(look.x, look.z)];
}

// The platform's drawn height one frame on: towards the real height at the lift's speed
// (faster when far behind, at once when very far: a late join or a teleport).
function mechLiftGlide(shown, target, delta) {
    const diff = target - shown;
    if (Math.abs(diff) > 4) return target;
    const step = MECH_LIFT_SPEED * 1.05 * (Math.abs(diff) > 1.5 ? 1.8 : 1) * delta;
    return Math.abs(diff) <= step ? target : shown + Math.sign(diff) * step;
}

// Whether a body (feet position, radius, height) stands on the cell or is inside it.
function mechOverCell(body, cell) {
    return body.x + body.r > cell[0] && body.x - body.r < cell[0] + 1 &&
        body.z + body.r > cell[2] && body.z - body.r < cell[2] + 1;
}
function mechStandsOn(body, cell) {
    return mechOverCell(body, cell) && Math.abs(body.feet - (cell[1] + 1)) < 0.2;
}
function mechInside(body, cell) {
    return mechOverCell(body, cell) && body.feet < cell[1] + 1 - 0.01 && body.feet + body.height > cell[1] + 0.01;
}

// How a push or pull moves a body: by the move's direction if it stands on a block that moved
// or a moved block (or the arm) now fills part of it; null if it is not touched.
function mechBodyShift(move, body) {
    if (!move || !Array.isArray(move.dir)) return null;
    const touched = (move.moved || []).some((cell) => mechStandsOn(body, cell)) ||
        (move.filled || []).some((cell) => mechInside(body, cell));
    return touched ? move.dir.slice() : null;
}

// ---------------------------------------------------------------------------------------
// Textures

// Ram casing: dark steel with a copper coil band and rivets in the corners.
registerTexturePattern('mech_ram_side', (f, s, tint, seed) => {
    const steel = f.rgb(0x6f7880);
    const copper = f.rgb(0xc87533);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        let color = f.tone(s, steel, (f.stretchedNoise(u, v, 2, 18, seed) - 0.5) * 0.14);
        let h = 0.55;
        if (Math.min(u, 1 - u, v, 1 - v) < 1.5 * px) { color = f.tone(s, steel, -0.22); h = 0.4; }
        if (v > 0.42 && v < 0.62) { color = f.tone(s, copper, (u * 12) % 1 < 0.5 ? 0.12 : -0.08); h = 0.35; }
        for (const [cx, cy] of [[0.14, 0.14], [0.86, 0.14], [0.14, 0.86], [0.86, 0.86]]) {
            if (Math.hypot(u - cx, v - cy) < 0.05) { color = f.tone(s, steel, 0.3); h = 0.9; }
        }
        f.put(s, x, y, color, h);
    });
});

// The back of a ram: steel with the motor's cooling slots.
registerTexturePattern('mech_ram_back', (f, s, tint, seed) => {
    const steel = f.rgb(0x6f7880);
    f.each(s, (x, y, u, v) => {
        let k = (f.hash(x, y, seed) - 0.5) * 0.1;
        if (u > 0.2 && u < 0.8 && (v * 6) % 1 < 0.35 && v > 0.15 && v < 0.85) k -= 0.35;
        f.put(s, x, y, f.tone(s, steel, k), 0.5);
    });
});

// The pushing plate: planks in an iron frame (plain), or glazed with honey (sticky).
function mechPaintPlate(f, s, sticky, seed) {
    const wood = f.rgb(0xa47a4a);
    const iron = f.rgb(0x9aa3ab);
    const honey = f.rgb(0xe8a41c);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        let color = f.tone(s, wood, ((v * 4) % 1 < 0.08 ? -0.25 : 0) + (f.stretchedNoise(u, v, 24, 2, seed) - 0.5) * 0.18);
        let h = 0.5;
        if (sticky) {
            const drip = Math.sin(u * 19 + seed) * 0.06 + Math.sin(u * 7) * 0.04;
            if (v < 0.78 + drip) { color = f.tone(s, honey, 0.25 - Math.hypot(u - 0.4, v - 0.35) * 0.5); h = 0.8; }
        }
        if (Math.min(u, 1 - u, v, 1 - v) < 2 * px) { color = f.tone(s, iron, (f.hash(x, y, seed) - 0.5) * 0.1); h = 0.7; }
        f.put(s, x, y, color, h);
    });
}
registerTexturePattern('mech_ram_front', (f, s, tint, seed) => mechPaintPlate(f, s, false, seed));
registerTexturePattern('mech_ram_front_sticky', (f, s, tint, seed) => mechPaintPlate(f, s, true, seed));

// The arm: polished steel.
registerTexturePattern('mech_arm', (f, s, tint, seed) => {
    const steel = f.rgb(0xc4cbd2);
    f.each(s, (x, y, u, v) => {
        f.put(s, x, y, f.tone(s, steel, (f.stretchedNoise(u, v, 2, 30, seed) - 0.5) * 0.18 + (Math.abs(u - 0.5) < 0.08 ? 0.12 : 0)), 0.7);
    });
});

// Lift winch: a steel frame around a drum wound with rope; the top is a grille.
registerTexturePattern('lift_winch_side', (f, s, tint, seed) => {
    const steel = f.rgb(0x5f6870);
    const rope = f.rgb(0xb89a62);
    const px = 1 / s.size;
    f.each(s, (x, y, u, v) => {
        let color = f.tone(s, steel, (f.hash(x, y, seed) - 0.5) * 0.12);
        let h = 0.5;
        if (u > 0.14 && u < 0.86 && v > 0.22 && v < 0.78) {
            // Rope turns, shaded as a cylinder.
            const turn = (u * 10) % 1;
            color = f.tone(s, rope, 0.18 - Math.abs(v - 0.5) * 0.7 + (turn < 0.2 ? -0.2 : 0));
            h = 0.7;
        }
        if (Math.min(u, 1 - u, v, 1 - v) < 1.5 * px) { color = f.tone(s, steel, -0.25); h = 0.3; }
        if (Math.hypot(u - 0.88, v - 0.1) < 0.05) { color = f.rgb(0xffc23a); h = 0.9; }
        f.put(s, x, y, color, h);
    });
});
registerTexturePattern('lift_winch_top', (f, s, tint, seed) => {
    const steel = f.rgb(0x5f6870);
    f.each(s, (x, y, u, v) => {
        let k = (f.hash(x, y, seed) - 0.5) * 0.1;
        if ((u * 5) % 1 < 0.3 || (v * 5) % 1 < 0.3) k += 0.15;
        f.put(s, x, y, f.tone(s, steel, k), 0.5);
    });
});

// Lift platform: planks in a steel frame with yellow and black warning stripes on the rim.
registerTexturePattern('lift_platform_top', (f, s, tint, seed) => {
    const wood = f.rgb(0x9c7448);
    const yellow = f.rgb(0xf2c230);
    const black = f.rgb(0x2a2a2c);
    f.each(s, (x, y, u, v) => {
        const rim = Math.min(u, 1 - u, v, 1 - v);
        if (rim < 0.12) {
            const stripe = ((u + v) * 5) % 1 < 0.5;
            f.put(s, x, y, f.tone(s, stripe ? yellow : black, (f.hash(x, y, seed) - 0.5) * 0.1), 0.7);
            return;
        }
        f.put(s, x, y, f.tone(s, wood, ((u * 4) % 1 < 0.06 ? -0.25 : 0) + (f.stretchedNoise(u, v, 2, 24, seed) - 0.5) * 0.16), 0.5);
    });
});
registerTexturePattern('lift_platform_side', (f, s, tint, seed) => {
    const steel = f.rgb(0x7d868e);
    f.each(s, (x, y, u, v) => {
        let k = (f.stretchedNoise(u, v, 2, 16, seed) - 0.5) * 0.14;
        if (v < 0.12 || v > 0.88) k -= 0.2;
        if (Math.abs(((u * 4) % 1) - 0.5) < 0.06) k += 0.2;
        f.put(s, x, y, f.tone(s, steel, k), 0.6);
    });
});

// ---------------------------------------------------------------------------------------
// Shapes and blocks

registerBlockShape('mech_ram', {
    states: [['facing', MECH_FACINGS], ['arm', ['in', 'out']]],
    boxes(state) {
        return mechRamBoxes(state);
    },
    collision() {
        return [[0, 0, 0, 1, 1, 1]];
    },
    // The plate shows on top or bottom for vertical rams; horizontal ones wear the casing.
    variant(state, def) {
        const front = def.sticky ? 'mech_ram_front_sticky' : 'mech_ram_front';
        if (state.facing === 'u') return { faces: { top: front, side: 'mech_ram_side', bottom: 'mech_ram_back' } };
        if (state.facing === 'd') return { faces: { top: 'mech_ram_back', side: 'mech_ram_side', bottom: front } };
        return { faces: { top: 'mech_ram_side', side: 'mech_ram_side', bottom: 'mech_ram_side' } };
    },
    materialKey(state) {
        return state.facing === 'u' || state.facing === 'd' ? state.facing : 'h';
    },
    place(ctx) {
        return [{ dx: 0, dy: 0, dz: 0, state: { facing: mechFacingFromLook(ctx.look), arm: 'in' } }];
    },
    iconState: { facing: 'u', arm: 'in' }
});

// The arm has no item: its block types (every facing, plain or sticky) are registered one by
// one with their state, as variants of the ram (out of inventories, dropping nothing).
registerBlockShape('mech_arm', {
    boxes(state) {
        return mechArmBoxes(state.facing || 'n');
    }
});

// The platform is drawn by Game.mechanicsUpdate (a gliding mesh), so its cell draws nothing.
registerBlockShape('mech_platform', {
    boxes() {
        return [];
    },
    collision() {
        return [[0, 0, 0, 1, 1, 1]];
    }
});

function mechDrawRamIcon(sticky) {
    return (ctx, size, world) => {
        const spec = (pattern) => ({ pattern, tint: null, label: null });
        drawShapeIcon(ctx, size, mechRamBoxes({ facing: 'u', arm: 'in' }), {
            top: world.generateFaceCanvas(spec(sticky ? 'mech_ram_front_sticky' : 'mech_ram_front')),
            side: world.generateFaceCanvas(spec('mech_ram_side'))
        });
    };
}

function mechDrawPlatformIcon(ctx, size, world) {
    const faces = world.getFaceTextureSpecs('lift_platform');
    const side = world.generateFaceCanvas(faces.side);
    world.textureFactory.drawCubeIcon(ctx, size, world.generateFaceCanvas(faces.top), side, side);
}

// Held in the hand or dropped: a plain textured cube (the block's own shape is empty).
function mechPlatformDisplayMesh(world, type, scale) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), world.getMaterial(type));
    mesh.scale.setScalar(scale);
    mesh.userData.blockType = type;
    return mesh;
}

[['motor_ram', 'Motor Ram', false], ['sticky_ram', 'Sticky Ram', true]].forEach(([id, name, sticky]) => {
    registerBlockType(id, {
        color: 0x6F7880, name, shape: 'mech_ram', breakDuration: 0.6, category: 'electric', electric: true,
        lightPasses: true, sticky, drawBlockIcon: mechDrawRamIcon(sticky),
        faces: { top: 'mech_ram_side', side: 'mech_ram_side', bottom: 'mech_ram_side' }
    });
});
for (const facing of MECH_FACINGS) {
    for (const grip of ['plain', 'sticky']) {
        registerBlockType(`ram_arm:${facing}:${grip}`, {
            color: 0xC4CBD2, name: 'Ram Arm', shape: 'mech_arm', breakDuration: 0.6, lightPasses: true,
            state: { facing, grip }, variantOf: grip === 'sticky' ? 'sticky_ram' : 'motor_ram', dropType: null,
            materialKey: 'ram_arm',
            faces: { top: 'mech_arm', side: 'mech_arm', bottom: 'mech_arm' }
        });
    }
}
registerBlockType('lift_winch', {
    color: 0x5F6870, name: 'Lift Winch', breakDuration: 0.7, category: 'electric', electric: true,
    faces: { top: 'lift_winch_top', side: 'lift_winch_side', bottom: 'lift_winch_top' }
});
registerBlockType('lift_platform', {
    color: 0x9C7448, name: 'Lift Platform', shape: 'mech_platform', breakDuration: 0.5, lightPasses: true,
    category: 'electric', faces: { top: 'lift_platform_top', side: 'lift_platform_side', bottom: 'lift_platform_side' },
    drawBlockIcon: mechDrawPlatformIcon, displayMesh: mechPlatformDisplayMesh
});

// ---------------------------------------------------------------------------------------
// Recipes: a motor does the work; iron, planks and copper around it.

registerGameContent(function ({ addRecipe }) {
    addRecipe('motor_ram', 'Build Motor Ram', 'motor_ram', 1, [{ type: 'electric_motor', amount: 1 }, { type: 'iron_ore', amount: 2 }, { type: 'planks', amount: 2 }]);
    addRecipe('sticky_ram', 'Build Sticky Ram (Honey)', 'sticky_ram', 1, [{ type: 'motor_ram', amount: 1 }, { type: 'honey_bottle', amount: 1 }]);
    addRecipe('lift_winch', 'Build Lift Winch', 'lift_winch', 1, [{ type: 'electric_motor', amount: 1 }, { type: 'iron_ore', amount: 3 }, { type: 'copper_wire', amount: 4 }]);
    addRecipe('lift_platform', 'Build Lift Platforms', 'lift_platform', 2, [{ type: 'planks', amount: 4 }, { type: 'iron_ore', amount: 1 }]);
});

// ---------------------------------------------------------------------------------------
// The client: moving players with the blocks, and the gliding lift platforms

registerFrameUpdate(function (delta) {
    this.mechanicsUpdate(delta);
});

Object.assign(Game.prototype, {
    mechanicsUpdate(delta) {
        if (!this.world || !this.world.registry || !this.scene || !this.cameraController) return;
        this.mechanicsHook();
        if (!this.mechCars) this.mechCars = new Map();
        this.mechScanTimer = (this.mechScanTimer || 0) - delta;
        if (this.mechScanTimer <= 0) {
            this.mechScanTimer = MECH_LIFT_SCAN;
            this.mechanicsScanLifts();
        }
        if (this.mechCars.size === 0) return;
        const cc = this.cameraController;
        const position = cc.camera.position;
        const feet = position.y - (cc.stepSmoothing || 0) - cc.eyeHeight;
        const body = { x: position.x, z: position.z, r: cc.collisionRadius };
        for (const car of this.mechCars.values()) {
            const before = car.shown;
            car.shown = mechLiftGlide(car.shown, car.y, delta);
            const moved = car.shown - before;
            car.mesh.position.y = car.shown + 0.5;
            car.mesh.userData.blockPosition = { x: car.x, y: car.y, z: car.z };
            this.mechanicsPlaceRopes(car);
            if (moved === 0 || cc.flying || !mechOverCell(body, [car.x, 0, car.z])) continue;
            // The rider: feet on the platform (or a little under it while it rises), not jumping.
            const top = before + 1;
            if (feet < top - 0.6 || feet > top + 0.15 || cc.velocityY > 0.5) continue;
            position.y += car.shown + 1 - feet;
            cc.velocityY = 0;
            cc.onGround = true;
        }
    },

    // Once per world: listen to mechMove, let the player collide with the gliding platforms,
    // and let clicks reach them.
    mechanicsHook() {
        if (this.network && !this.mechListening) {
            this.mechListening = true;
            this.network.on('mechMove', (move) => this.mechanicsOnMove(move));
        }
        const cc = this.cameraController;
        if (cc.collisionBoxGetter && cc.mechWrapped !== cc.collisionBoxGetter) {
            const base = cc.collisionBoxGetter;
            const wrapped = (x, y, z) => this.mechanicsCollision(base, x, y, z);
            cc.setCollisionBoxGetter(wrapped);
            cc.mechWrapped = wrapped;
        }
        const world = this.world;
        if (!world.mechWrapped) {
            world.mechWrapped = true;
            const base = world.getInteractableObjects.bind(world);
            world.getInteractableObjects = (position, reach) => {
                const objects = base(position, reach);
                if (this.mechCars) {
                    for (const car of this.mechCars.values()) objects.push(car.mesh);
                }
                return objects;
            };
        }
    },

    // Collision boxes for the player: a platform's real cell is empty (also the cell it is
    // leaving, until its blockPlace arrives), and the cells its gliding mesh overlaps hold the
    // part of it they contain.
    mechanicsCollision(base, x, y, z) {
        const boxes = base(x, y, z);
        const car = this.mechCars && this.mechCars.get(`${x},${z}`);
        if (!car) return boxes;
        let out = boxes;
        if (Math.abs(y - car.y) <= 1 && this.world.getBlockTypeAt(x, y, z) === 'lift_platform') out = [];
        const bottom = car.shown - y;
        if (bottom > -1 && bottom < 1) out = [...out, [0, Math.max(0, bottom), 0, 1, Math.min(1, bottom + 1), 1]];
        return out;
    },

    mechanicsOnMove(move) {
        if (!move || !Array.isArray(move.moved) || !Array.isArray(move.filled)) return;
        if (move.kind === 'lift') {
            const [x, y, z] = move.moved[0] || [];
            const car = this.mechCars && this.mechCars.get(`${x},${z}`);
            if (car && car.y === y && move.filled[0]) car.y = move.filled[0][1];
            return;
        }
        const cc = this.cameraController;
        const position = cc.camera.position;
        const feet = position.y - (cc.stepSmoothing || 0) - cc.eyeHeight;
        const shift = mechBodyShift(move, { x: position.x, z: position.z, feet, r: cc.collisionRadius, height: cc.bodyHeight });
        if (shift) {
            position.x += shift[0];
            position.y += shift[1];
            position.z += shift[2];
            // A lift up is eased into view like a step up.
            if (shift[1] > 0) cc.stepSmoothing = Math.max(-0.6, (cc.stepSmoothing || 0) - shift[1]);
            cc.velocityY = Math.max(0, cc.velocityY);
        }
        // A thump near the player.
        const cell = move.filled[0];
        if (cell && Math.hypot(cell[0] + 0.5 - position.x, cell[1] + 0.5 - position.y, cell[2] + 0.5 - position.z) < 24) {
            this.playNoiseBurst({ duration: 0.12, volume: 0.03, highpass: 120, lowpass: 900 });
            this.playTone({ frequency: move.kind === 'push' ? 110 : 80, endFrequency: 60, duration: 0.15, type: 'square', volume: 0.012 });
        }
    },

    // Finds the platforms near the player and keeps one gliding mesh (with ropes) each.
    mechanicsScanLifts() {
        const world = this.world;
        const id = world.registry.id('lift_platform');
        if (!id) return;
        const { chunkX, chunkZ } = world.getChunkCoords(Math.floor(this.camera.position.x), Math.floor(this.camera.position.z));
        const seen = new Set();
        for (let dx = -MECH_LIFT_CHUNKS; dx <= MECH_LIFT_CHUNKS; dx++) {
            for (let dz = -MECH_LIFT_CHUNKS; dz <= MECH_LIFT_CHUNKS; dz++) {
                const key = world.chunkKey(chunkX + dx, chunkZ + dz);
                const column = world.columns.get(key);
                if (!column) continue;
                for (const index of column.findBlocks(id, 'mechLifts')) {
                    const x = (chunkX + dx) * CHUNK_SIZE + index % CHUNK_SIZE;
                    const z = (chunkZ + dz) * CHUNK_SIZE + Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE;
                    const y = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE)) + WORLD_MIN_Y;
                    const carKey = `${x},${z}`;
                    seen.add(carKey);
                    let car = this.mechCars.get(carKey);
                    if (!car) {
                        car = this.mechanicsCreateCar(x, y, z);
                        this.mechCars.set(carKey, car);
                    }
                    car.y = y;
                    car.winchY = null;
                    for (let up = y + 1; up <= y + MECH_LIFT_ROPE + 1; up++) {
                        const type = world.getBlockTypeAt(x, up, z);
                        if (!type) continue;
                        if (type === 'lift_winch') car.winchY = up;
                        break;
                    }
                }
            }
        }
        for (const [key, car] of this.mechCars) {
            if (seen.has(key)) continue;
            this.scene.remove(car.group);
            this.mechCars.delete(key);
        }
    },

    mechanicsCreateCar(x, y, z) {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.world.getMaterial('lift_platform'));
        mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
        mesh.castShadow = Boolean(this.rtxModeEnabled);
        mesh.receiveShadow = Boolean(this.rtxModeEnabled);
        mesh.userData.blockPosition = { x, y, z };
        group.add(mesh);
        // Four ropes from the corners of the platform up to the winch.
        if (!this.mechRopeMaterial) this.mechRopeMaterial = new THREE.MeshLambertMaterial({ color: 0xb89a62 });
        if (!this.mechRopeGeometry) this.mechRopeGeometry = new THREE.BoxGeometry(1, 1, 1);
        const ropes = [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].map(([ox, oz]) => {
            const rope = new THREE.Mesh(this.mechRopeGeometry, this.mechRopeMaterial);
            rope.position.set(x + ox, y, z + oz);
            rope.visible = false;
            group.add(rope);
            return rope;
        });
        this.scene.add(group);
        return { x, y, z, shown: y, group, mesh, ropes, winchY: null };
    },

    mechanicsPlaceRopes(car) {
        const length = car.winchY === null ? 0 : car.winchY - (car.shown + 1);
        for (const rope of car.ropes) {
            rope.visible = length > 0.05;
            if (!rope.visible) continue;
            rope.scale.set(0.045, length, 0.045);
            rope.position.y = car.shown + 1 + length / 2;
        }
    }
});
