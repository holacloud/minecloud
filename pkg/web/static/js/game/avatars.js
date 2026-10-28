// Player avatars: appearance, models, name tags, animation and remote players.
// Mixed into Game.prototype; `this` is the Game instance.

Object.assign(Game.prototype, {
    updateLocalPlayerAvatar(anchor, delta) {
        if (!this.localPlayerAvatar) return;

        const previousPosition = this.localPlayerAvatar.position.clone();
        this.localPlayerAvatar.visible = this.cameraViewMode !== 'first';
        this.localPlayerAvatar.position.set(anchor.x, anchor.y - this.cameraController.eyeHeight, anchor.z);
        this.localPlayerAvatar.rotation.y = this.cameraController.yaw + Math.PI;
        this.applyAvatarHeadPitch(this.localPlayerAvatar, this.cameraController.pitch, 1);
        this.updateAvatarHeldItem(this.localPlayerAvatar, this.getSelectedHeldItemType());
        this.animatePlayerAvatar(this.localPlayerAvatar, previousPosition, delta, false);
        this.localPlayerAvatar.userData.targetAction = this.getCurrentPlayerAction();
        this.applyAvatarAction(this.localPlayerAvatar, delta);
    },

    updateAvatarHeldItem(avatar, type) {
        if (!avatar || !this.world) return;
        if (avatar.userData.heldItemType === type) return;

        const parts = avatar.userData.avatarParts;
        const heldArm = parts && (parts.rightArm || parts.leftArm);
        if (!parts || !heldArm) return;

        if (avatar.userData.heldItemMesh) {
            if (avatar.userData.heldItemMesh.parent) {
                avatar.userData.heldItemMesh.parent.remove(avatar.userData.heldItemMesh);
            }
            this.disposeObject3D(avatar.userData.heldItemMesh);
            avatar.userData.heldItemMesh = null;
        }

        avatar.userData.heldItemType = type;
        if (!type) return;

        const item = this.world.createDisplayMesh(type, 0.18);
        const def = this.world.blockTypes[type];
        // Arm pivots sit at the shoulder; the hand is ~0.6 below it, facing +z.
        if (def && def.itemOnly) {
            item.position.set(0, -0.56, 0.12);
            item.rotation.set(-Math.PI / 2 + 0.3, 0.08, 0.12);
        } else {
            item.position.set(0, -0.62, 0.14);
            item.rotation.set(0.4, 0.2, 0.15);
        }
        item.frustumCulled = false;
        heldArm.add(item);
        avatar.userData.heldItemMesh = item;
    },

    initLocalPlayerAvatar() {
        this.localPlayerAvatar = this.createOtherPlayerAvatar('local', this.playerName, this.playerShirtColor, this.playerHairStyle, this.playerHairColor);
        this.updateAvatarNameTag(this.localPlayerAvatar, this.playerName);
        this.localPlayerAvatar.visible = false;
        this.scene.add(this.localPlayerAvatar);
    },

    hashString(value) {
        let hash = 0;
        for (let i = 0; i < value.length; i++) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    },

    getPlayerAppearance(name, shirtColor = null, hairStyle = 'short', hairColor = null) {
        const key = name || 'Player';
        const hash = this.hashString(key);
        const shirts = [0x2F63C8, 0x7C3AED, 0x0F8A6B, 0xB45309, 0xC2414C, 0x475569];
        const pants = [0x28334D, 0x1F2937, 0x3B2F2F, 0x2A3442, 0x23364B, 0x36302A];
        const hairColors = [0x5B3A29, 0x433125, 0xC7A45B, 0x2B2B2B, 0x9A4A2B, 0xECE2CF];
        const skins = [0xE2B48D, 0xD9A07A, 0xC98B6C, 0xF1C49B, 0xAD6E54];
        const normalizedHairStyle = this.normalizeHairStyle(hairStyle);

        return {
            shirt: shirtColor ? this.parseColorHex(shirtColor, shirts[hash % shirts.length]) : shirts[hash % shirts.length],
            pants: pants[Math.floor(hash / 7) % pants.length],
            hair: hairColor ? this.parseColorHex(hairColor, hairColors[Math.floor(hash / 13) % hairColors.length]) : hairColors[Math.floor(hash / 13) % hairColors.length],
            hairStyle: normalizedHairStyle,
            skin: skins[Math.floor(hash / 17) % skins.length],
            key: `${key}:${shirtColor || ''}:${normalizedHairStyle}:${hairColor || ''}`
        };
    },

    createModelMaterial(texture) {
        return this.rtxModeEnabled
            ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.45 })
            : new THREE.MeshLambertMaterial({ map: texture });
    },

    tagModelMeshes(root, key, value) {
        root.traverse((node) => {
            if (!node.isMesh) return;
            node.userData[key] = value;
            node.castShadow = this.rtxModeEnabled;
            node.receiveShadow = this.rtxModeEnabled;
        });
    },

    createOtherPlayerAvatar(playerId, playerName = 'Player', shirtColor = null, hairStyle = 'short', hairColor = null) {
        const appearance = this.getPlayerAppearance(playerName, shirtColor, hairStyle, hairColor);
        const model = VoxelModels.createPlayer(
            { ...appearance, seed: this.hashString(appearance.key) % 997 },
            (texture) => this.createModelMaterial(texture)
        );
        const group = model.root;
        group.userData.playerId = playerId;
        group.userData.appearanceKey = appearance.key;
        this.tagModelMeshes(group, 'avatarRoot', group);

        const { head, torso, leftArm, rightArm, leftLeg, rightLeg, hair } = model.parts;
        group.userData.avatarParts = { head, torso, leftArm, rightArm, leftLeg, rightLeg, hair };
        group.userData.heldItemMesh = null;
        group.userData.heldItemType = null;
        group.userData.lastPosition = new THREE.Vector3();
        group.userData.targetPosition = new THREE.Vector3();
        group.userData.targetYaw = 0;
        group.userData.targetPitch = 0;
        group.userData.targetAction = '';
        group.userData.currentAction = '';
        group.userData.actionPhase = 0;
        group.userData.walkPhase = 0;
        group.userData.lastStepIndex = 0;
        group.userData.stepDistance = 0;
        group.userData.nameSprite = this.createNameTagSprite('Player');
        group.userData.nameSprite.position.set(0, 2.15, 0);
        group.add(group.userData.nameSprite);
        return group;
    },

    createNameTagSprite(name) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(10, 10, 236, 44);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.strokeRect(10, 10, 236, 44);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name.slice(0, 20), 128, 33);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        if (THREE.sRGBEncoding) {
            texture.encoding = THREE.sRGBEncoding;
        }

        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(1.9, 0.48, 1);
        sprite.renderOrder = 2000;
        return sprite;
    },

    updateAvatarNameTag(avatar, name) {
        if (!avatar) return;

        const safeName = (name || 'Player').slice(0, 20);
        const currentSprite = avatar.userData.nameSprite;
        if (currentSprite && currentSprite.userData.name === safeName) return;

        if (currentSprite) {
            avatar.remove(currentSprite);
            currentSprite.material.map.dispose();
            currentSprite.material.dispose();
        }

        const sprite = this.createNameTagSprite(safeName);
        sprite.position.set(0, 2.15, 0);
        sprite.userData.name = safeName;
        avatar.userData.nameSprite = sprite;
        avatar.add(sprite);
    },

    updateRemotePlayerNames(payload) {
        const activeIds = new Set();
        this.remotePlayerNames.clear();
        payload.players.forEach((player) => {
            activeIds.add(player.id);
            this.remotePlayerNames.set(player.id, player.name);
            const avatar = this.otherPlayerMeshes.get(player.id);
            if (avatar) {
                this.updateAvatarNameTag(avatar, player.name);
            }
        });

        this.updatePlayerCount(activeIds.size);
        if (this.voiceChat) {
            this.voiceChat.syncPlayerList(payload.players);
        }

        for (const [id, avatar] of this.otherPlayerMeshes) {
            if (id === this.network.playerId || activeIds.has(id)) continue;
            this.disposeRemoteAvatar(avatar);
            this.otherPlayerMeshes.delete(id);
            this.remotePlayerNames.delete(id);
        }

        this.decoratePlayerListInteractions();
    },

    decoratePlayerListInteractions() {
        document.querySelectorAll('#player-list li[data-player-id]').forEach((item) => {
            item.classList.toggle('following', item.dataset.playerId === this.followTargetPlayerId);
            item.onclick = () => this.toggleFollowPlayer(item.dataset.playerId);
        });
    },

    toggleFollowPlayer(playerId) {
        if (!playerId || playerId === this.network.playerId) return;
        if (this.followTargetPlayerId === playerId) {
            this.followTargetPlayerId = null;
            if (this.followReturnPosition) {
                this.cameraController.setPosition(this.followReturnPosition);
                if (this.cameraViewMode !== 'first') {
                    this.thirdPersonAnchor = this.camera.position.clone();
                }
                this.followReturnPosition = null;
            }
        } else {
            if (!this.followTargetPlayerId) {
                this.followReturnPosition = this.getLocalPlayerPosition();
            }
            this.followTargetPlayerId = playerId;
        }
        this.decoratePlayerListInteractions();
    },

    updateFollowCamera(delta) {
        if (!this.followTargetPlayerId) return false;

        const avatar = this.otherPlayerMeshes.get(this.followTargetPlayerId);
        if (!avatar) {
            this.followTargetPlayerId = null;
            if (this.followReturnPosition) {
                this.cameraController.setPosition(this.followReturnPosition);
                if (this.cameraViewMode !== 'first') {
                    this.thirdPersonAnchor = this.camera.position.clone();
                }
                this.followReturnPosition = null;
            }
            this.decoratePlayerListInteractions();
            return false;
        }

        this.followCameraAngle += delta * 0.3;
        const distance = 4.5;
        const height = 2.2;
        const targetPos = avatar.position.clone();
        const cameraTarget = new THREE.Vector3(
            targetPos.x - Math.sin(avatar.rotation.y) * distance,
            targetPos.y + height,
            targetPos.z - Math.cos(avatar.rotation.y) * distance
        );
        this.camera.position.lerp(cameraTarget, Math.min(1, delta * 6));
        this.camera.lookAt(targetPos.x, targetPos.y + 1.3, targetPos.z);
        return true;
    },

    updatePlayerCount(count) {
        const countEl = document.getElementById('player-count');
        if (countEl) {
            countEl.textContent = String(count);
        }
    },

    disposeRemoteAvatar(avatar) {
        if (!avatar) return;

        if (this.voiceChat && avatar.userData.playerId) {
            this.voiceChat.removePeer(avatar.userData.playerId);
        }

        if (avatar.userData.modelTexture) {
            avatar.userData.modelTexture.dispose();
        }
        avatar.traverse((node) => {
            if (node instanceof THREE.Mesh && node.userData.disposeGeometry) {
                node.geometry.dispose();
            }
            if (node instanceof THREE.Mesh && node.material) {
                node.material.dispose();
            }
            if (node instanceof THREE.Sprite && node.material) {
                if (node.material.map) {
                    node.material.map.dispose();
                }
                node.material.dispose();
            }
        });
        if (avatar.parent) {
            avatar.parent.remove(avatar);
        } else {
            this.scene.remove(avatar);
        }
    },

    lerpAngle(current, target, alpha) {
        const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
        return current + delta * alpha;
    },

    animatePlayerAvatar(avatar, previousPosition, delta, playFootsteps = true) {
        const parts = avatar.userData.avatarParts;
        if (!parts) return;

        const deltaDistance = previousPosition.distanceTo(avatar.position);
        avatar.userData.walkPhase += Math.min(0.7, deltaDistance * 12);
        avatar.userData.lastPosition.copy(avatar.position);

        const stride = Math.min(0.9, deltaDistance * 30);
        const swing = Math.sin(avatar.userData.walkPhase) * stride;

        parts.leftArm.rotation.x = swing;
        parts.rightArm.rotation.x = -swing;
        // Arms hang slightly away from the torso; actions may override this afterwards.
        parts.leftArm.rotation.z = 0.05;
        parts.rightArm.rotation.z = -0.05;
        parts.leftLeg.rotation.x = -swing;
        parts.rightLeg.rotation.x = swing;

        if (playFootsteps && deltaDistance > 0.002) {
            avatar.userData.stepDistance += deltaDistance;
            if (avatar.userData.stepDistance >= 0.55) {
                avatar.userData.stepDistance = 0;
                const stepBlock = this.world.getBlockTypeAt(Math.round(avatar.position.x), Math.floor(avatar.position.y), Math.round(avatar.position.z)) || 'grass';
                this.playPositionalFootstep(avatar.position, stepBlock);
            }
        }
    },

    normalizePlayerAction(action) {
        return action === 'mine' || action === 'place' ? action : '';
    },

    getCurrentPlayerAction() {
        if (this.isBreakInputActive && this.miningTargetKey !== null) return 'mine';
        if (this.placeActionTimer > 0) return 'place';
        return '';
    },

    updatePlayerActionTimers(delta) {
        this.placeActionTimer = Math.max(0, this.placeActionTimer - delta);
    },

    applyAvatarAction(avatar, delta) {
        const parts = avatar && avatar.userData ? avatar.userData.avatarParts : null;
        if (!parts || !parts.leftArm || !parts.rightArm) return;

        const action = this.normalizePlayerAction(avatar.userData.targetAction);
        if (!action) {
            avatar.userData.currentAction = '';
            avatar.userData.actionPhase = 0;
            return;
        }

        if (avatar.userData.currentAction !== action) {
            avatar.userData.currentAction = action;
            avatar.userData.actionPhase = 0;
        }
        avatar.userData.actionPhase += delta;

        if (action === 'mine') {
            const swing = Math.sin(avatar.userData.actionPhase * 16);
            const strike = Math.abs(swing);
            parts.rightArm.rotation.x = -0.45 - strike * 1.05;
            parts.rightArm.rotation.z = -0.12 + swing * 0.18;
            parts.leftArm.rotation.x = 0.18 + strike * 0.22;
            parts.leftArm.rotation.z = -swing * 0.08;
            return;
        }

        const pulse = Math.sin(Math.min(Math.PI, avatar.userData.actionPhase * 9));
        parts.rightArm.rotation.x = -0.95 * pulse;
        parts.rightArm.rotation.z = -0.28 * pulse;
        parts.leftArm.rotation.x = 0.22 * pulse;
    },

    getAvatarHeadPitch(lookPitch) {
        const pitch = typeof lookPitch === 'number' && Number.isFinite(lookPitch) ? lookPitch : 0;
        return THREE.MathUtils.clamp(-pitch, -Math.PI / 2, Math.PI / 2);
    },

    applyAvatarHeadPitch(avatar, lookPitch, alpha = 1) {
        const parts = avatar && avatar.userData ? avatar.userData.avatarParts : null;
        if (!parts || !parts.head) return;

        const targetPitch = this.getAvatarHeadPitch(lookPitch);
        parts.head.rotation.x = alpha >= 1
            ? targetPitch
            : THREE.MathUtils.lerp(parts.head.rotation.x, targetPitch, alpha);
    },

    updateRemotePlayers(delta) {
        const alpha = Math.min(1, delta * 10);
        for (const avatar of this.otherPlayerMeshes.values()) {
            const previousPosition = avatar.position.clone();
            avatar.position.lerp(avatar.userData.targetPosition, alpha);
            avatar.rotation.y = this.lerpAngle(avatar.rotation.y, avatar.userData.targetYaw, alpha);
            this.applyAvatarHeadPitch(avatar, avatar.userData.targetPitch, alpha);
            this.animatePlayerAvatar(avatar, previousPosition, delta, true);
            this.applyAvatarAction(avatar, delta);
        }
    },

    refreshOtherPlayerAvatarMaterials() {
        const roots = [...this.otherPlayerMeshes.values(), ...this.ambientMobs];
        if (this.localPlayerAvatar) roots.push(this.localPlayerAvatar);
        for (const root of roots) {
            const replaced = new Map();
            root.traverse((node) => {
                if (!node.isMesh || !node.userData.modelMap) return;
                let material = replaced.get(node.material);
                if (!material) {
                    material = this.createModelMaterial(node.userData.modelMap);
                    replaced.set(node.material, material);
                    node.material.dispose();
                }
                node.material = material;
                node.castShadow = this.rtxModeEnabled;
                node.receiveShadow = this.rtxModeEnabled;
            });
        }
    },

    syncOtherPlayerShadows() {
        for (const mesh of this.otherPlayerMeshes.values()) {
            mesh.traverse((node) => {
                if (!(node instanceof THREE.Mesh)) return;
                node.castShadow = this.rtxModeEnabled;
                node.receiveShadow = this.rtxModeEnabled;
            });
        }
    },

    updateOtherPlayer(player) {
        const displayName = player.username || this.remotePlayerNames.get(player.id) || player.id;
        const shirtColor = player.shirtColor || null;
        const hairStyle = this.normalizeHairStyle(player.hairStyle || 'short');
        const hairColor = player.hairColor || null;
        let avatar = this.otherPlayerMeshes.get(player.id);
        if (!avatar) {
            avatar = this.createOtherPlayerAvatar(player.id, displayName, shirtColor, hairStyle, hairColor);
            this.scene.add(avatar);
            this.otherPlayerMeshes.set(player.id, avatar);
        } else if (avatar.userData.appearanceKey !== this.getPlayerAppearance(displayName, shirtColor, hairStyle, hairColor).key) {
            this.disposeRemoteAvatar(avatar);
            avatar = this.createOtherPlayerAvatar(player.id, displayName, shirtColor, hairStyle, hairColor);
            this.scene.add(avatar);
            this.otherPlayerMeshes.set(player.id, avatar);
        }

        this.updateAvatarNameTag(avatar, displayName);
        this.updateAvatarHeldItem(avatar, player.heldItem || null);
        const nextFeetPosition = new THREE.Vector3(player.x, player.y - 1.62, player.z);
        if (!avatar.userData.initialized) {
            avatar.userData.lastPosition.copy(nextFeetPosition);
            avatar.userData.targetPosition.copy(nextFeetPosition);
            avatar.position.copy(nextFeetPosition);
            avatar.rotation.y = player.yaw + Math.PI;
            this.applyAvatarHeadPitch(avatar, player.pitch, 1);
            avatar.userData.initialized = true;
        }

        avatar.userData.targetPosition.copy(nextFeetPosition);
        avatar.userData.targetYaw = player.yaw + Math.PI;
        avatar.userData.targetPitch = typeof player.pitch === 'number' ? player.pitch : 0;
        avatar.userData.targetAction = this.normalizePlayerAction(player.action);
    },

    raycastPlayer(maxDistance) {
        this.raycaster.setFromCamera(this.screenCenter, this.camera);

        const objects = [];
        for (const avatar of this.otherPlayerMeshes.values()) {
            avatar.traverse((node) => {
                if (node instanceof THREE.Mesh) {
                    objects.push(node);
                }
            });
        }

        if (objects.length === 0) return null;

        const intersects = this.raycaster.intersectObjects(objects, true);
        if (intersects.length === 0 || intersects[0].distance > maxDistance) {
            return null;
        }

        let current = intersects[0].object;
        while (current && !current.userData.playerId) {
            current = current.parent;
        }

        if (!current || !current.userData.playerId) return null;

        return {
            playerId: current.userData.playerId,
            intersection: intersects[0]
        };
    }
});
