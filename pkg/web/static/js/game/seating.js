// Sitting. A right click on a block with `seat` (its height, js/game/furniture.js) sits the
// player down on it: the camera stays at a seated height and they can only look around
// (CameraController.setSeat). Sneak stands up (Shift, or the touch Sneak button). If the seat is
// broken, replaced or moved by a motor ram, the player stands up where it was: it is checked
// every frame, so it does not matter who or what did it. Other players see the seated pose:
// playerMove carries it in `mount` as the key "seat", with the body's yaw in `mountYaw`, which
// no mob species answers to, so older code paths ignore it.
// Mixed into Game.prototype; hooked through js/extensions.js.

// A player's legs, from the hips down (VoxelModels.createPlayer: 12 units of 0.056).
const SEAT_LEG_LENGTH = 0.672;
// The way the player looks when sitting on a block facing this way (CameraController.yaw).
const SEAT_YAW = { n: 0, w: Math.PI / 2, s: Math.PI, e: -Math.PI / 2 };

// Where the eye goes on the seat at cell (x, y, z), seat height `seat`: the hips rest on the seat
// and the feet, which keep the standing eye height below the eye, hang the length of a leg lower.
function seatEyePosition(x, y, z, seat, standingEyeHeight) {
    return { x: x + 0.5, y: y + seat - SEAT_LEG_LENGTH + standingEyeHeight, z: z + 0.5 };
}

// Offsets to try standing on after getting up: in front of the seat, its sides, behind it, on it.
function seatStandOffsets(facing) {
    const [fx, fz] = SHAPE_DIRECTIONS[facing];
    return [[fx, fz], [fz, -fx], [-fz, fx], [-fx, -fz], [0, 0]];
}

Object.assign(Game.prototype, {
    // Returns whether the click was on a seat (even if there was no room to sit).
    seatTrySit(position) {
        const type = this.world.getBlockTypeAt(position.x, position.y, position.z);
        const def = type && this.world.blockTypes[type];
        if (!def || !def.seat) return false;
        if (this.ridingMob) return true;
        const seated = this.seated;
        if (seated && seated.x === position.x && seated.y === position.y && seated.z === position.z) return true;
        const name = this.getBlockDisplayName(def.variantOf || type);
        // The head goes into the cell above.
        if (this.world.registry.fullCube[this.world.getBlockId(position.x, position.y + 1, position.z)]) {
            this.receiveSystemMessage({ text: `There is no room to sit on the ${name} here` });
            return true;
        }
        for (const avatar of this.otherPlayerMeshes.values()) {
            if (typeof avatar.userData.seatYaw === 'number' &&
                Math.hypot(avatar.position.x - position.x - 0.5, avatar.position.z - position.z - 0.5) < 0.5 &&
                Math.abs(avatar.position.y - position.y) < 1) {
                this.receiveSystemMessage({ text: 'Someone is already sitting there' });
                return true;
            }
        }
        const controller = this.cameraController;
        const ray = this.getInteractionRay();
        const facing = (def.state && def.state.facing) || shapeFacingFromVector(ray.direction.x, ray.direction.z);
        controller.setSeat(seatEyePosition(position.x, position.y, position.z, def.seat, controller.standingEyeHeight));
        controller.yaw = SEAT_YAW[facing];
        this.seated = { x: position.x, y: position.y, z: position.z, base: def.variantOf || type, facing, avatarYaw: SEAT_YAW[facing] + Math.PI };
        this.playPlaceSound(type);
        this.receiveSystemMessage({ text: `Sitting on the ${name}: Sneak stands up` });
        return true;
    },

    seatStandUp() {
        const seat = this.seated;
        if (!seat) return;
        this.seated = null;
        const controller = this.cameraController;
        controller.setSeat(null);
        const position = controller.camera.position;
        for (const [dx, dz] of seatStandOffsets(seat.facing)) {
            const x = seat.x + 0.5 + dx;
            const z = seat.z + 0.5 + dz;
            const floor = controller.getFloorY(x, z, seat.y + 1.2);
            if (floor > -50 && Math.abs(floor - seat.y) <= 1.6 && controller.canStandAt(x, z, floor)) {
                position.set(x, floor + controller.eyeHeight, z);
                return;
            }
        }
        // Walled in: up, and gravity and the collisions do the rest.
        position.set(seat.x + 0.5, seat.y + 1 + controller.eyeHeight, seat.z + 0.5);
    },

    // Every frame: the seat must still be there. A teleport (setPosition) ends sitting too.
    seatUpdate() {
        const seat = this.seated;
        if (!seat) return;
        const controller = this.cameraController;
        if (!controller.seat) {
            this.seated = null;
            return;
        }
        const type = this.world.getBlockTypeAt(seat.x, seat.y, seat.z);
        const def = type && this.world.blockTypes[type];
        if (this.respawnPending || !def || (def.variantOf || type) !== seat.base) this.seatStandUp();
    },

    // The avatar has no knees, so the legs reach forward and slightly down from the hips, and
    // the arms rest on them.
    poseSeated(avatar) {
        const parts = avatar.userData.avatarParts;
        if (!parts) return;
        parts.leftLeg.rotation.set(-1.35, 0, 0.04);
        parts.rightLeg.rotation.set(-1.35, 0, -0.04);
        parts.leftArm.rotation.x = -0.75;
        parts.rightArm.rotation.x = -0.75;
    }
});

registerItemUseHandler(function (itemType, hit) {
    if (!hit || this.cameraController.isCrouching) return false;
    const position = this.world.getBlockPositionFromIntersection(hit);
    return Boolean(position) && this.seatTrySit(position);
});

registerFrameUpdate(function () {
    this.seatUpdate();
});
