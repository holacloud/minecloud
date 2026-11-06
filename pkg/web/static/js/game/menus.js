// Title screen, appearance editor, pause menu and settings, and what Escape and the pointer lock do.
// Mixed into Game.prototype; `this` is the Game instance.
// Escape, and what a browser allows:
// - While the pointer is locked the browser keeps Escape to itself to free the pointer, and a page cannot
//   stop it. So it can only close a menu if opening the menu has freed the pointer; every menu does, and
//   nothing may leave it locked with one open (releasePointerForMenu, each frame).
// - Then Escape reaches the page, and one listener, the first of all, closes the top menu (escapeOnKeyDown),
//   whatever has the focus and whatever the panels do with their keys.
// - The pointer can come back with no gesture because the page itself let it go. That only works after
//   exitPointerLock: if the player pressed Escape in play (which opens the pause menu), the browser wants a
//   click, so the request fails and "Click to play" shows, with no pause menu by surprise.
// - The pointer waits until Escape is released: some browsers free it when the key comes up or repeats, and
//   would take back a pointer locked in the meantime (recapturePointerLock).
// - In fullscreen a browser may let the page keep Escape (Keyboard Lock, Chromium only, over HTTPS), and
//   then it does everything here, also in play; holding it leaves fullscreen.

// How long the pointer waits for Escape to come up, if it never hears that it did (milliseconds).
const MENU_ESCAPE_HELD_MS = 1500;
// How long an answer to a lock request can take before it is taken for lost, and for browsers that give none.
const MENU_LOCK_ANSWER_MS = 3000;
const MENU_LOCK_NO_PROMISE_MS = 300;

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
        const ultraToggle = document.getElementById('settings-ultra-toggle');
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

        document.addEventListener('fullscreenchange', () => {
            this.updateSettingsUI();
            this.syncKeyboardLock();
        });

        // The game's language: the same setting as the guide's selector, each following the other.
        const languageSelect = document.getElementById('settings-language');
        if (languageSelect) {
            languageSelect.value = gameLang();
            languageSelect.addEventListener('change', () => setGameLang(languageSelect.value));
            onGameLangChange((lang) => { languageSelect.value = lang; });
        }

        rtxToggle.addEventListener('click', () => this.toggleRTXMode());
        if (ultraToggle) ultraToggle.addEventListener('click', () => this.toggleUltraMode());
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
        const ultraToggle = document.getElementById('settings-ultra-toggle');
        if (ultraToggle) ultraToggle.textContent = this.ultraModeEnabled ? 'Disable Ultra' : 'Enable Ultra';
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

    // In fullscreen, Chromium can leave Escape to the page. Elsewhere there is no such thing.
    syncKeyboardLock() {
        const keyboard = typeof navigator === 'object' && navigator ? navigator.keyboard : null;
        if (!keyboard || typeof keyboard.lock !== 'function') return;
        if (!document.fullscreenElement) {
            keyboard.unlock();
            return;
        }
        const request = keyboard.lock(['Escape']);
        // Refused (not over HTTPS...): Escape just stays the browser's.
        if (request && typeof request.catch === 'function') request.catch(() => {});
    },

    openPauseMenu() {
        const menu = document.getElementById('pause-menu');
        if (!menu) return;

        // Photo mode hides this menu: it would be open and unseen.
        if (this.photoMode && !this.cinematic) this.togglePhotoMode();
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
            // The touch chat's send and close buttons (js/game/touch.js).
            document.getElementById('touch-chat-row'),
            document.getElementById('chat-log'),
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
    },

    // True while the player is in the world with no menu or overlay open.
    isGameplayActive() {
        return !this.titleScreenOpen && !this.appearanceMenuOpen && !this.chatOpen && !this.craftingOpen &&
            !this.pauseOpen && !this.signReaderOpen && !this.inventoryOpen && !this.respawnPending &&
            !this.getOpenModalPanel();
    },

    getOpenModalPanel() {
        return MODAL_PANELS.find((panel) => panel.isOpen.call(this)) || null;
    },

    // The only place that asks for pointer lock: one request at a time, and a visible
    // "click to play" hint whenever the browser refuses or the lock is lost.
    requestPointerLockOnce() {
        const canvas = this.renderer.domElement;
        if (this.pointerLockPending || document.pointerLockElement === canvas || this.getOpenModalPanel()) return;
        this.pointerLockPending = true;
        let waiting = null;
        const done = () => {
            clearTimeout(waiting);
            this.pointerLockPending = false;
            this.updatePointerLockHint();
        };
        try {
            const request = canvas.requestPointerLock();
            if (request && typeof request.then === 'function') {
                // Browsers refuse without a fresh gesture or for ~1 s after Esc; the hint asks for a click.
                request.then(done, done);
                waiting = setTimeout(done, MENU_LOCK_ANSWER_MS);
            } else {
                waiting = setTimeout(done, MENU_LOCK_NO_PROMISE_MS);
            }
        } catch (_error) {
            done();
        }
    },

    // The pointer was locked, or lost. A lock that lands on an open menu goes back: with it the browser would
    // keep Escape. Lost with nothing to explain it, the player has pressed Escape in play: that is the pause menu.
    onPointerLockChange() {
        this.updatePointerLockHint();
        if (document.pointerLockElement === this.renderer.domElement) {
            if (this.isMenuOpen()) {
                this.releasePointerForMenu();
                return;
            }
            // A focused button or slider would swallow Space/arrow keys while playing.
            if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
            return;
        }
        this.stopMining();
        if (performance.now() < this.suppressPointerLockPauseUntil) return;
        if (!this.titleScreenOpen && !this.pauseOpen && !this.chatOpen && !this.craftingOpen && !this.signReaderOpen && !this.inventoryOpen && !this.respawnPending && !this.getOpenModalPanel()) {
            this.openPauseMenu();
        }
    },

    releasePointerForMenu() {
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        document.exitPointerLock();
    },

    // Any window of the game that Escape would close.
    isMenuOpen() {
        return Boolean(this.appearanceMenuOpen || this.chatOpen || this.signReaderOpen || this.inventoryOpen || this.craftingOpen || this.pauseOpen || this.getOpenModalPanel());
    },

    // The first listener of all, in the capture phase of the window: with a menu open, Escape is for it, and
    // nothing else hears it, whether a field has the focus or a panel keeps its keys to itself.
    escapeInstall() {
        window.addEventListener('keydown', (event) => this.escapeOnKeyDown(event), true);
        window.addEventListener('keyup', (event) => {
            if (event.code === 'Escape' || event.key === 'Escape') this.escapeReleased();
        }, true);
        window.addEventListener('blur', () => this.escapeReleased());
    },

    escapeOnKeyDown(event) {
        if (event.code !== 'Escape' && event.key !== 'Escape') return;
        this.escapeHeld = true;
        if (!this.isMenuOpen()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) this.closeActiveMenuFromEscape();
    },

    // Escape is up: the pointer that was waiting for it can come back.
    escapeReleased() {
        this.escapeHeld = false;
        clearTimeout(this.relockTimer);
        const relock = this.relockAfterEscape;
        this.relockAfterEscape = null;
        if (relock) relock();
    },

    updatePointerLockHint() {
        if (!this.pointerLockHint) {
            const hint = document.createElement('div');
            hint.id = 'pointer-lock-hint';
            hint.textContent = 'Click to play';
            hint.style.cssText = 'position:fixed;left:50%;top:58%;transform:translateX(-50%);padding:8px 16px;' +
                'border-radius:8px;background:rgba(0,0,0,0.55);color:#fff;font:600 14px system-ui,sans-serif;' +
                'pointer-events:none;z-index:50;display:none';
            document.body.appendChild(hint);
            this.pointerLockHint = hint;
        }
        const locked = document.pointerLockElement === this.renderer.domElement;
        const show = !locked && !this.pointerLockPending && !this.relockAfterEscape && !this.touchControlsEnabled && this.isGameplayActive();
        const display = show ? 'block' : 'none';
        if (this.pointerLockHint.style.display !== display) this.pointerLockHint.style.display = display;
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
        if (this.touchControlsEnabled || !this.isGameplayActive()) return;
        if (document.pointerLockElement === this.renderer.domElement) return;

        const requestPointer = () => {
            if (!this.touchControlsEnabled && this.isGameplayActive()) this.requestPointerLockOnce();
        };

        if (this.escapeHeld) {
            this.relockAfterEscape = requestPointer;
            clearTimeout(this.relockTimer);
            this.relockTimer = setTimeout(() => this.escapeReleased(), MENU_ESCAPE_HELD_MS);
        } else if (defer) {
            setTimeout(requestPointer, 0);
        } else {
            requestPointer();
        }
    },

    closeActiveMenuFromEscape() {
        const closed = this.closeTopMenu();
        // A search box left with the focus in a panel that is gone would keep every key to itself.
        if (closed && !this.isMenuOpen() && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        return closed;
    },

    closeTopMenu() {
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
        const panel = this.getOpenModalPanel();
        if (panel) {
            if (!panel.escape || !panel.escape.call(this)) panel.close.call(this);
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

// While any window is open, the floating HUD (health, block inspector, hotbar...) drops behind it.
registerFrameUpdate(function () {
    const open = Boolean(this.inventoryOpen || this.craftingOpen || this.pauseOpen || this.signReaderOpen ||
        this.appearanceMenuOpen || this.getOpenModalPanel());
    // Whatever way it came about (a lock that was on its way when the menu opened...), a menu never stays
    // open with the pointer locked: Escape would not reach it.
    if (document.pointerLockElement === this.renderer.domElement && this.isMenuOpen()) this.releasePointerForMenu();
    if (open !== this.windowOpenClass) {
        this.windowOpenClass = open;
        document.body.classList.toggle('window-open', open);
    }
});
