// Title screen, appearance editor, pause menu and settings.
// Mixed into Game.prototype; `this` is the Game instance.

Object.assign(Game.prototype, {
    getHairStyles() {
        return ['short', 'long', 'bob', 'ponytail', 'pixie', 'mohawk', 'sidepart', 'bald'];
    },

    getHairStyleLabel(style) {
        const labels = {
            short: 'Short',
            long: 'Long',
            bob: 'Bob',
            ponytail: 'Ponytail',
            pixie: 'Pixie',
            mohawk: 'Mohawk',
            sidepart: 'Side part',
            bald: 'Bald'
        };
        return labels[style] || labels.short;
    },

    normalizeHairStyle(style) {
        return this.getHairStyles().includes(style) ? style : 'short';
    },

    initTitleScreen() {
        const continueButton = document.getElementById('title-continue');
        const appearanceButton = document.getElementById('title-appearance');
        const appearanceCloseButton = document.getElementById('appearance-close');
        const appearanceSaveButton = document.getElementById('appearance-save');
        const nameInput = document.getElementById('appearance-name');
        const shirtColorInput = document.getElementById('appearance-shirt-color');
        const hairStyleSelect = document.getElementById('appearance-hair-style');
        const hairColorInput = document.getElementById('appearance-hair-color');
        if (continueButton) {
            continueButton.addEventListener('click', () => {
                this.titleScreenOpen = false;
                this.appearanceMenuOpen = false;
                this.updateTitleScreen();
                this.recapturePointerLockFromGesture();
            });
        }

        this.appearanceDraft = {
            name: this.playerName,
            shirtColor: this.playerShirtColor,
            hairStyle: this.playerHairStyle,
            hairColor: this.playerHairColor
        };
        if (hairStyleSelect) {
            hairStyleSelect.innerHTML = '';
            this.getHairStyles().forEach((style) => {
                const option = document.createElement('option');
                option.value = style;
                option.textContent = this.getHairStyleLabel(style);
                hairStyleSelect.appendChild(option);
            });
        }

        const syncDraft = () => {
            this.appearanceDraft = {
                name: ((nameInput && nameInput.value) || this.playerName).trim().slice(0, 20) || 'Player',
                shirtColor: (shirtColorInput && shirtColorInput.value) || this.playerShirtColor,
                hairStyle: this.normalizeHairStyle((hairStyleSelect && hairStyleSelect.value) || this.playerHairStyle),
                hairColor: (hairColorInput && hairColorInput.value) || this.playerHairColor
            };
            this.updateAppearancePreview();
        };

        [nameInput, shirtColorInput, hairStyleSelect, hairColorInput].forEach((control) => {
            if (!control) return;
            control.addEventListener('input', syncDraft);
            control.addEventListener('change', syncDraft);
        });

        if (appearanceButton) {
            appearanceButton.addEventListener('click', () => {
                this.appearanceMenuOpen = true;
                this.updateAppearanceControls();
                this.updateTitleScreen();
                this.initAppearancePreview();
                this.updateAppearancePreview(true);
            });
        }

        if (appearanceCloseButton) {
            appearanceCloseButton.addEventListener('click', () => {
                this.appearanceMenuOpen = false;
                this.updateTitleScreen();
            });
        }

        if (appearanceSaveButton) {
            appearanceSaveButton.addEventListener('click', () => {
                syncDraft();
                this.applyAppearanceDraft();
            });
        }

        this.updateAppearanceControls();
    },

    applyAppearanceDraft() {
        if (!this.appearanceDraft) return;

        this.playerName = this.appearanceDraft.name;
        this.playerShirtColor = this.appearanceDraft.shirtColor;
        this.playerHairStyle = this.appearanceDraft.hairStyle;
        this.playerHairColor = this.appearanceDraft.hairColor;

        window.localStorage.setItem('minecloud-player-name', this.playerName);
        window.localStorage.setItem('minecloud-shirt-color', this.playerShirtColor);
        window.localStorage.setItem('minecloud-hair-style', this.playerHairStyle);
        window.localStorage.setItem('minecloud-hair-color', this.playerHairColor);

        if (this.network) {
            this.network.setUsername(this.playerName);
            this.network.setShirtColor(this.playerShirtColor);
            this.network.setHair(this.playerHairStyle, this.playerHairColor);
        }

        if (this.localPlayerAvatar) {
            this.disposeRemoteAvatar(this.localPlayerAvatar);
        }
        this.initLocalPlayerAvatar();
        this.appearanceMenuOpen = false;
        this.updateTitleScreen();
    },

    updateAppearanceControls() {
        const nameInput = document.getElementById('appearance-name');
        const shirtColorInput = document.getElementById('appearance-shirt-color');
        const hairStyleSelect = document.getElementById('appearance-hair-style');
        const hairColorInput = document.getElementById('appearance-hair-color');
        if (!this.appearanceDraft) return;

        if (nameInput) nameInput.value = this.appearanceDraft.name;
        if (shirtColorInput) shirtColorInput.value = this.appearanceDraft.shirtColor;
        if (hairStyleSelect) hairStyleSelect.value = this.appearanceDraft.hairStyle;
        if (hairColorInput) hairColorInput.value = this.appearanceDraft.hairColor;
    },

    initAppearancePreview() {
        if (this.appearancePreviewRenderer || typeof THREE === 'undefined') return;

        const host = document.getElementById('appearance-preview');
        if (!host) return;

        this.appearancePreviewScene = new THREE.Scene();
        this.appearancePreviewScene.background = new THREE.Color(0x101827);
        this.appearancePreviewCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
        this.appearancePreviewCamera.position.set(0, 1.05, 4.2);
        this.appearancePreviewCamera.lookAt(0, 0.75, 0);
        this.appearancePreviewScene.add(new THREE.AmbientLight(0xffffff, 0.75));
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.95);
        keyLight.position.set(2.5, 4, 3);
        this.appearancePreviewScene.add(keyLight);

        this.appearancePreviewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.appearancePreviewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        host.innerHTML = '';
        host.appendChild(this.appearancePreviewRenderer.domElement);
        this.resizeAppearancePreview();
    },

    resizeAppearancePreview() {
        const host = document.getElementById('appearance-preview');
        if (!host || !this.appearancePreviewRenderer || !this.appearancePreviewCamera) return;

        const width = Math.max(180, host.clientWidth || 260);
        const height = Math.max(220, host.clientHeight || 320);
        this.appearancePreviewRenderer.setSize(width, height, false);
        this.appearancePreviewCamera.aspect = width / height;
        this.appearancePreviewCamera.updateProjectionMatrix();
    },

    updateAppearancePreview(force = false) {
        if (!this.appearancePreviewScene || !this.appearanceDraft) return;

        const key = `${this.appearanceDraft.name}:${this.appearanceDraft.shirtColor}:${this.appearanceDraft.hairStyle}:${this.appearanceDraft.hairColor}`;
        if (!force && key === this.appearancePreviewKey) return;

        if (this.appearancePreviewAvatar) {
            this.disposeRemoteAvatar(this.appearancePreviewAvatar);
            this.appearancePreviewAvatar = null;
        }

        this.appearancePreviewAvatar = this.createOtherPlayerAvatar('appearance-preview', this.appearanceDraft.name, this.appearanceDraft.shirtColor, this.appearanceDraft.hairStyle, this.appearanceDraft.hairColor);
        this.appearancePreviewAvatar.position.set(0, -0.9, 0);
        this.appearancePreviewScene.add(this.appearancePreviewAvatar);
        this.appearancePreviewKey = key;
    },

    renderAppearancePreview(delta) {
        if (!this.appearanceMenuOpen || !this.appearancePreviewRenderer || !this.appearancePreviewScene || !this.appearancePreviewCamera) return;

        this.resizeAppearancePreview();
        if (this.appearancePreviewAvatar) {
            this.appearancePreviewAvatar.rotation.y += delta * 0.8;
        }
        this.appearancePreviewRenderer.render(this.appearancePreviewScene, this.appearancePreviewCamera);
    },

    updateTitleScreen() {
        const titleScreen = document.getElementById('title-screen');
        if (!titleScreen) return;

        titleScreen.classList.toggle('visible', this.titleScreenOpen);
        const appearancePanel = document.getElementById('appearance-panel');
        if (appearancePanel) {
            appearancePanel.classList.toggle('visible', (this.titleScreenOpen || this.pauseOpen) && this.appearanceMenuOpen);
        }
        document.body.classList.toggle('title-screen-active', this.titleScreenOpen);
        this.updateFirstPersonHandVisibility();
    },

    updateTitleScreenCamera(delta) {
        this.titleCameraAngle += delta * 0.12;
        const radius = 14;
        const focus = this.lastSafePosition || this.respawnPoint || { x: 0, y: 20, z: 0 };
        const focusY = Math.max(5, focus.y);
        this.camera.position.set(
            focus.x + Math.cos(this.titleCameraAngle) * radius,
            focusY + 5 + Math.sin(this.titleCameraAngle * 0.45) * 1.8,
            focus.z + Math.sin(this.titleCameraAngle) * radius
        );
        this.camera.lookAt(focus.x, focusY + 1.5, focus.z);
    },

    initPauseMenu() {
        const sensitivityInput = document.getElementById('settings-sensitivity');
        const volumeInput = document.getElementById('settings-volume');
        const renderDistanceInput = document.getElementById('settings-render-distance');
        const fovInput = document.getElementById('settings-fov');
        const rtxToggle = document.getElementById('settings-rtx-toggle');
        const fullscreenToggle = document.getElementById('settings-fullscreen-toggle');
        const appearanceButton = document.getElementById('settings-appearance');
        const resumeButton = document.getElementById('settings-resume');

        if (!sensitivityInput || !volumeInput || !renderDistanceInput || !fovInput || !rtxToggle || !fullscreenToggle || !appearanceButton || !resumeButton) return;

        sensitivityInput.value = this.mouseSensitivity.toFixed(2);
        volumeInput.value = this.masterVolume.toFixed(2);
        renderDistanceInput.value = String(this.renderDistanceSetting);
        fovInput.value = String(this.fovSetting);

        sensitivityInput.addEventListener('input', () => {
            this.mouseSensitivity = parseFloat(sensitivityInput.value);
            this.applyLookSensitivity();
            this.updateSettingsUI();
            this.saveSettings();
        });

        volumeInput.addEventListener('input', () => {
            this.masterVolume = parseFloat(volumeInput.value);
            this.updateSettingsUI();
            this.saveSettings();
        });

        renderDistanceInput.addEventListener('input', () => {
            this.renderDistanceSetting = parseInt(renderDistanceInput.value, 10);
            this.world.setRenderDistance(this.renderDistanceSetting, this.camera.position);
            this.updateSettingsUI();
            this.saveSettings();
        });

        fovInput.addEventListener('input', () => {
            this.fovSetting = parseInt(fovInput.value, 10);
            this.applyFovSetting();
            this.updateSettingsUI();
            this.saveSettings();
        });

        document.addEventListener('fullscreenchange', () => this.updateSettingsUI());

        rtxToggle.addEventListener('click', () => this.toggleRTXMode());
        fullscreenToggle.addEventListener('click', () => this.toggleFullscreen());
        appearanceButton.addEventListener('click', () => this.openAppearanceEditorFromPause());
        resumeButton.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            this.closePauseMenu();
        });
        resumeButton.addEventListener('click', () => this.closePauseMenu());
        document.addEventListener('pointerdown', (event) => this.onDocumentPointerDown(event));

        this.updateSettingsUI();
    },

    updateSettingsUI() {
        const sensitivityValue = document.getElementById('settings-sensitivity-value');
        const volumeValue = document.getElementById('settings-volume-value');
        const renderDistanceValue = document.getElementById('settings-render-distance-value');
        const fovValue = document.getElementById('settings-fov-value');
        const rtxToggle = document.getElementById('settings-rtx-toggle');
        const fullscreenToggle = document.getElementById('settings-fullscreen-toggle');
        const sensitivityInput = document.getElementById('settings-sensitivity');
        const volumeInput = document.getElementById('settings-volume');
        const renderDistanceInput = document.getElementById('settings-render-distance');
        const fovInput = document.getElementById('settings-fov');

        if (sensitivityValue) sensitivityValue.textContent = this.mouseSensitivity.toFixed(2);
        if (volumeValue) volumeValue.textContent = `${Math.round(this.masterVolume * 100)}%`;
        if (renderDistanceValue) renderDistanceValue.textContent = String(this.renderDistanceSetting);
        if (fovValue) fovValue.textContent = String(this.fovSetting);
        if (rtxToggle) rtxToggle.textContent = this.rtxModeEnabled ? 'Disable RTX' : 'Enable RTX';
        if (fullscreenToggle) fullscreenToggle.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Enter Fullscreen';
        if (sensitivityInput) sensitivityInput.value = this.mouseSensitivity.toFixed(2);
        if (volumeInput) volumeInput.value = this.masterVolume.toFixed(2);
        if (renderDistanceInput) renderDistanceInput.value = String(this.renderDistanceSetting);
        if (fovInput) fovInput.value = String(this.fovSetting);
    },

    applyFovSetting() {
        if (!this.camera) return;
        this.camera.fov = this.fovSetting;
        this.camera.updateProjectionMatrix();
    },

    async toggleFullscreen() {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
        } else {
            await document.documentElement.requestFullscreen();
        }
        this.updateSettingsUI();
    },

    applyLookSensitivity() {
        if (this.cameraController) {
            this.cameraController.setLookSpeed(0.002 * this.mouseSensitivity);
        }
    },

    openPauseMenu() {
        const menu = document.getElementById('pause-menu');
        if (!menu) return;

        this.pauseOpen = true;
        this.stopMining();
        this.closeChatInput();
        if (this.craftingOpen) {
            this.toggleCraftingPanel();
        }
        if (document.pointerLockElement === this.renderer.domElement) {
            document.exitPointerLock();
        }
        menu.classList.add('visible');
        this.updateSettingsUI();
    },

    closePauseMenu(recapturePointer = true) {
        const menu = document.getElementById('pause-menu');
        if (!menu) return;

        this.pauseOpen = false;
        menu.classList.remove('visible');
        this.updateSettingsUI();
        if (recapturePointer) {
            this.recapturePointerLockFromGesture();
        }
    },

    onDocumentPointerDown(event) {
        if (!this.pauseOpen && !this.appearanceMenuOpen && !this.chatOpen && !this.signReaderOpen && !this.inventoryOpen && !this.craftingOpen) return;

        const windows = [
            document.getElementById('appearance-panel'),
            document.getElementById('pause-menu'),
            document.getElementById('chat-input'),
            document.getElementById('sign-reader'),
            document.getElementById('inventory-panel'),
            document.getElementById('crafting-panel'),
            document.getElementById('voice-toggle'),
            document.getElementById('player-list-container')
        ].filter(Boolean);

        if (windows.some((panel) => panel.contains(event.target))) return;

        event.preventDefault();
        this.closeActiveMenuFromEscape();
    },

    recapturePointerLockFromGesture() {
        this.recapturePointerLock(false);
        window.addEventListener('pointerup', () => this.recapturePointerLock(false), { once: true });
    },

    openAppearanceEditorFromPause() {
        this.appearanceMenuOpen = true;
        this.updateAppearanceControls();
        this.updateTitleScreen();
        this.initAppearancePreview();
        this.updateAppearancePreview(true);
    },

    togglePauseMenu() {
        if (this.pauseOpen) {
            this.closePauseMenu();
        } else {
            this.openPauseMenu();
        }
    },

    recapturePointerLock(defer = true) {
        if (this.touchControlsEnabled) return;
        if (this.titleScreenOpen || this.chatOpen || this.craftingOpen || this.pauseOpen || this.signReaderOpen || this.inventoryOpen || this.respawnPending) {
            return;
        }
        if (document.pointerLockElement === this.renderer.domElement) return;

        const requestPointer = () => {
            if (!this.touchControlsEnabled && !this.titleScreenOpen && !this.chatOpen && !this.craftingOpen && !this.pauseOpen && !this.signReaderOpen && !this.inventoryOpen && !this.respawnPending) {
                const request = this.renderer.domElement.requestPointerLock();
                if (request && typeof request.catch === 'function') {
                    // Browsers refuse the lock without a fresh gesture or right after Esc; the next click retries.
                    request.catch(() => {});
                }
            }
        };

        if (defer) {
            setTimeout(requestPointer, 0);
        } else {
            requestPointer();
        }
    },

    closeActiveMenuFromEscape() {
        this.suppressPointerLockPauseUntil = performance.now() + 250;

        if (this.appearanceMenuOpen) {
            this.appearanceMenuOpen = false;
            this.updateTitleScreen();
            return true;
        }
        if (this.chatOpen) {
            this.closeChatInput();
            return true;
        }
        if (this.signReaderOpen) {
            this.closeSignReader();
            return true;
        }
        if (this.inventoryOpen) {
            this.closeInventoryPanel();
            return true;
        }
        if (this.craftingOpen) {
            this.closeCraftingPanel();
            return true;
        }
        if (this.pauseOpen) {
            this.closePauseMenu();
            return true;
        }

        this.suppressPointerLockPauseUntil = 0;
        return false;
    }
});
