// Sitting. A right click on a block with `seat` (its height, js/game/furniture.js) sits the
// player down on it: the camera stays at a seated height and they can only look around
// (CameraController.setSeat). Sneak stands up (Shift, or the touch Sneak button). If the seat is
// broken, replaced or moved by a motor ram, the player stands up where it was: it is checked
// every frame, so it does not matter who or what did it. Other players see the seated pose:
// playerMove carries it in `mount` as the key "seat", with the body's yaw in `mountYaw`, which
// no mob species answers to, so older code paths ignore it.
// Lying down is sitting on a bed (`lieDown`, the height of its mattress): the same click (or F), the
// same rules to get up, with the camera low at the pillow looking up at the sky, and the key "bed"
// laying the avatar flat for everyone. At night it also asks to sleep (Game.bedTrySleep).
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

// Where the eye goes in the bed at a cell, with its head towards `facing`: over the pillow.
const BED_EYE_TOWARDS_HEAD = 0.25;
const BED_EYE_ABOVE_MATTRESS = 0.33;
// How far the eyes look up on lying down (CameraController.pitch).
const BED_LOOK_UP = 1.1;
// The flat avatar: its back rests this far above the mattress, its feet this far from the eye.
const BED_BODY_ABOVE_MATTRESS = 0.14;
const BED_FEET_FROM_EYE = 1.55;

function bedEyePosition(x, y, z, mattress, facing) {
    const [fx, fz] = SHAPE_DIRECTIONS[facing];
    return { x: x + 0.5 + fx * BED_EYE_TOWARDS_HEAD, y: y + mattress + BED_EYE_ABOVE_MATTRESS, z: z + 0.5 + fz * BED_EYE_TOWARDS_HEAD };
}

// Where a lying avatar's feet go, from the eye and the body's yaw (SEAT_YAW of the way its head lies).
// It is one cell of bed for a body nearly two blocks long: the legs reach past the foot of the bed.
function bedAvatarFeet(eye, yaw) {
    return {
        x: eye.x + Math.sin(yaw) * BED_FEET_FROM_EYE,
        y: eye.y - BED_EYE_ABOVE_MATTRESS + BED_BODY_ABOVE_MATTRESS,
        z: eye.z + Math.cos(yaw) * BED_FEET_FROM_EYE
    };
}

// Offsets to try standing on after getting up: in front of the seat, its sides, behind it, on it.
function seatStandOffsets(facing) {
    const [fx, fz] = SHAPE_DIRECTIONS[facing];
    return [[fx, fz], [fz, -fx], [-fz, fx], [-fx, -fz], [0, 0]];
}

Object.assign(Game.prototype, {
    // Returns whether the click was on a seat or a bed (even if there was no room to sit).
    seatTrySit(position) {
        const type = this.world.getBlockTypeAt(position.x, position.y, position.z);
        const def = type && this.world.blockTypes[type];
        if (!def || !(def.seat || def.lieDown)) return false;
        if (this.ridingMob) return true;
        const seated = this.seated;
        if (seated && seated.x === position.x && seated.y === position.y && seated.z === position.z) {
            if (seated.lying) this.bedTrySleep();
            return true;
        }
        const name = this.getBlockDisplayName(def.variantOf || type);
        // The head goes into the cell above.
        if (this.world.registry.fullCube[this.world.getBlockId(position.x, position.y + 1, position.z)]) {
            this.receiveSystemMessage({ text: `There is no room to ${def.lieDown ? 'lie down' : 'sit'} on the ${name} here` });
            return true;
        }
        for (const avatar of this.otherPlayerMeshes.values()) {
            // Where their eye is tells the cell, wherever a flat body's feet stick out to.
            const eye = avatar.userData.seatEye;
            if (eye && Math.floor(eye.x) === position.x && Math.floor(eye.z) === position.z && Math.abs(eye.y - position.y) < 2) {
                this.receiveSystemMessage({ text: def.lieDown ? 'Someone is already lying there' : 'Someone is already sitting there' });
                return true;
            }
        }
        const controller = this.cameraController;
        if (def.lieDown) {
            const facing = def.state.facing;
            controller.setSeat(bedEyePosition(position.x, position.y, position.z, def.lieDown, facing));
            controller.yaw = SEAT_YAW[SHAPE_OPPOSITE[facing]];
            controller.pitch = BED_LOOK_UP;
            this.seated = { x: position.x, y: position.y, z: position.z, base: def.variantOf || type, facing, avatarYaw: SEAT_YAW[facing], lying: true };
            this.playPlaceSound(type);
            this.receiveSystemMessage({ text: `Lying on the ${name}: Sneak gets up` });
            this.bedTrySleep();
            return true;
        }
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
        if (seat.lying) controller.pitch = 0;
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
    },

    // Flat on its back: the whole avatar turns about its feet, with its head towards where yaw says
    // (the head to local -z, so yaw is applied after the tilt: order YXZ), arms and legs straight.
    poseLying(avatar, yaw, feet) {
        avatar.rotation.order = 'YXZ';
        avatar.rotation.x = -Math.PI / 2;
        avatar.rotation.y = yaw;
        avatar.position.set(feet.x, feet.y, feet.z);
        avatar.userData.lyingFlat = true;
        const parts = avatar.userData.avatarParts;
        if (!parts) return;
        parts.head.rotation.x = 0;
        parts.leftLeg.rotation.set(0, 0, 0.03);
        parts.rightLeg.rotation.set(0, 0, -0.03);
        parts.leftArm.rotation.set(0, 0, 0.12);
        parts.rightArm.rotation.set(0, 0, -0.12);
    },

    // Back on its feet, once it stops lying.
    poseUpright(avatar) {
        if (!avatar.userData.lyingFlat) return;
        avatar.userData.lyingFlat = false;
        avatar.rotation.x = 0;
        avatar.rotation.order = 'XYZ';
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
