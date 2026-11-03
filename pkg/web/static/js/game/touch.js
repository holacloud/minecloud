// Touch controls for phones and tablets: a floating joystick on the left, the world itself as
// the look and action surface (drag to look, tap to use / place, hold still to mine), round
// Mine / Use / Jump / Sneak buttons and a Run toggle, a ☰ menu with every panel a desktop opens
// with a key, and a chat bar for the on-screen keyboard. Every touch is tracked by its pointer
// id, so moving, looking and acting work at the same time. The plain logic (detection, joystick,
// gestures, layout) is in js/touchInput.js. Desktops never get any of this: initTouchControls
// returns early and the CSS only applies under body.touch-ui.
// Mixed into Game.prototype; the menu is a modal panel (see registerModalPanel).

Object.assign(Game.prototype, {
    initTouchControls() {
        const media = (query) => Boolean(window.matchMedia && window.matchMedia(query).matches);
        const param = new URLSearchParams(location.search).get('touch');
        const enabled = shouldUseTouchControls({
            coarse: media('(pointer: coarse)'),
            anyFine: media('(any-pointer: fine)'),
            touchPoints: navigator.maxTouchPoints || ('ontouchstart' in window ? 1 : 0),
            override: param === '1' ? true : param === '0' ? false : null
        });
        if (!enabled) return;

        this.touchControlsEnabled = true;
        this.cameraController.setTouchControlsEnabled(true);
        document.documentElement.classList.add('touch-ui');
        document.body.classList.add('touch-ui');
        this.renderer.domElement.style.touchAction = 'none';

        this.touchLastAt = 0;
        this.touchGestures = new Map();
        this.touchLookPointerId = null;
        this.touchMovePointerId = null;
        this.touchMiningSource = null;
        this.touchSprintLatched = false;
        this.touchSprintPushed = false;
        this.touchSneakHeld = false;
        this.touchLookFactor = 2;
        this.touchMenuOpen = false;
        this.touchWasActive = null;
        this.touchUi = {
            lookZone: document.getElementById('mobile-look-zone'),
            moveZone: document.getElementById('mobile-move-zone'),
            joystick: document.getElementById('mobile-joystick'),
            knob: document.getElementById('mobile-joystick-knob'),
            jump: document.getElementById('mobile-jump'),
            sneak: document.getElementById('mobile-sneak'),
            sprint: document.getElementById('mobile-sprint'),
            mine: document.getElementById('mobile-break'),
            use: document.getElementById('mobile-place'),
            ring: document.getElementById('mobile-mine-ring'),
            menu: document.getElementById('touch-menu')
        };

        this.touchBindJoystick();
        this.touchBindLook();
        this.touchBindButtons();
        this.touchBindMenu();
        this.touchBindChat();
        this.touchAddPanelCloseButtons();
        this.touchPreventBrowserGestures();

        const relayout = () => {
            this.touchApplyLayout();
            this.resetTouchTransientInput();
        };
        window.addEventListener('resize', () => this.touchApplyLayout());
        window.addEventListener('orientationchange', () => setTimeout(relayout, 250));
        if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.touchApplyLayout());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.resetTouchTransientInput();
        });
        this.touchApplyLayout();
        this.resetTouchTransientInput();

        const frame = () => {
            requestAnimationFrame(frame);
            this.touchFrame();
        };
        requestAnimationFrame(frame);
    },

    // A mouse event the browser made up from a touch (they follow taps on buttons and panels).
    // The touch controls handle those touches themselves; a real mouse still works.
    touchIsEmulatedMouse(event) {
        if (event && event.sourceCapabilities && event.sourceCapabilities.firesTouchEvents) return true;
        return performance.now() - (this.touchLastAt || 0) < 1000;
    },

    // Lets go of everything held: joystick, look, jump, sprint push and mining.
    resetTouchTransientInput() {
        if (!this.touchControlsEnabled) return;
        this.touchMovePointerId = null;
        this.touchLookPointerId = null;
        this.touchGestures.clear();
        this.cameraController.setTouchJump(false);
        this.touchResetJoystick();
        if (this.touchSneakHeld) {
            this.touchSneakHeld = false;
            this.cameraController.keys.crouch = false;
        }
        if (this.touchMiningSource !== null) {
            this.touchMiningSource = null;
            this.stopMining();
        }
        (this.touchButtonResets || []).forEach((reset) => reset());
        for (const button of [this.touchUi.jump, this.touchUi.mine, this.touchUi.use, this.touchUi.sneak, this.touchUi.sprint]) {
            button.classList.remove('active');
        }
    },

    // ---- Layout ----

    touchSafeAreaInsets() {
        if (!this.touchInsetProbe) {
            const probe = document.createElement('div');
            probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
                'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
            document.body.appendChild(probe);
            this.touchInsetProbe = probe;
        }
        const style = getComputedStyle(this.touchInsetProbe);
        return {
            top: parseFloat(style.paddingTop) || 0,
            right: parseFloat(style.paddingRight) || 0,
            bottom: parseFloat(style.paddingBottom) || 0,
            left: parseFloat(style.paddingLeft) || 0
        };
    },

    touchApplyLayout() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const layout = computeTouchLayout({ width, height, insets: this.touchSafeAreaInsets() });
        this.touchLayout = layout;
        this.touchLookFactor = touchLookScale(width, height);
        const moveWidth = Math.max(layout.sideLeft + layout.joystick + 24,
            Math.min(width * 0.45, width - layout.sideRight - layout.clusterWidth - 16));
        const vars = {
            '--touch-slot': layout.slot,
            '--touch-hotbar-bottom': layout.hotbarBottom,
            '--touch-controls-bottom': layout.controlsBottom,
            '--touch-joystick': layout.joystick,
            '--touch-button': layout.button,
            '--touch-button-gap': layout.buttonGap,
            '--touch-sprint': layout.sprint,
            '--touch-side-left': layout.sideLeft,
            '--touch-side-right': layout.sideRight,
            '--touch-top': layout.topBar,
            '--touch-top-button': layout.topButton,
            '--touch-chat-top': layout.chatTop,
            '--touch-chat-max': layout.chatMaxHeight,
            '--touch-move-width': moveWidth
        };
        const root = document.documentElement.style;
        for (const [name, value] of Object.entries(vars)) root.setProperty(name, `${value}px`);
    },

    // ---- Every frame ----

    touchFrame() {
        const active = this.isGameplayActive() && !this.photoMode && !this.cinematic;
        const body = document.body;
        if (active !== this.touchWasActive) {
            this.touchWasActive = active;
            body.classList.toggle('touch-paused', !active);
            if (!active) this.resetTouchTransientInput();
        }
        body.classList.toggle('touch-hide-hotbar', !active && !this.inventoryOpen && !this.craftingOpen);
        body.classList.toggle('touch-chat-open', Boolean(this.chatOpen));

        const now = performance.now();
        if (active) {
            for (const [pointerId, gesture] of this.touchGestures) {
                if (gesture.poll(now) === 'hold') this.touchStartBreak(pointerId);
            }
        }

        // Mining progress on the Mine button and around the crosshair.
        const mining = this.isBreakInputActive && this.miningTargetDuration > 0;
        const progress = mining ? Math.min(1, this.miningProgress / this.miningTargetDuration) : 0;
        if (progress !== this.touchShownProgress) {
            this.touchShownProgress = progress;
            this.touchUi.mine.style.setProperty('--mine-progress', progress.toFixed(3));
            this.touchUi.ring.style.setProperty('--mine-progress', progress.toFixed(3));
        }
        this.touchUi.ring.classList.toggle('visible', Boolean(this.isBreakInputActive) && active);

        const controller = this.cameraController;
        // A Sneak left on would sink a flying player for good.
        if (controller.flying && controller.keys.crouch && !this.touchSneakHeld) controller.keys.crouch = false;
        this.touchUi.sneak.classList.toggle('latched', controller.keys.crouch && !this.touchSneakHeld);
        this.touchUi.sprint.classList.toggle('latched', this.touchSprintLatched);
        // Flying (creative): Jump rises and Sneak sinks while held.
        const flying = Boolean(controller.flying);
        if (flying !== this.touchShownFlying) {
            this.touchShownFlying = flying;
            this.touchUi.jump.querySelector('.label').textContent = flying ? 'Up' : 'Jump';
            this.touchUi.sneak.querySelector('.label').textContent = flying ? 'Down' : 'Sneak';
        }
    },

    // ---- Joystick (left side; it moves under the thumb where the touch starts) ----

    touchBindJoystick() {
        const { moveZone, joystick } = this.touchUi;
        const update = (clientX, clientY) => {
            const radius = joystick.offsetWidth * 0.36;
            const vector = touchJoystickVector(clientX - this.touchJoystickCenter.x, clientY - this.touchJoystickCenter.y, radius);
            this.touchUi.knob.style.transform = `translate(calc(-50% + ${vector.knobX}px), calc(-50% + ${vector.knobY}px))`;
            this.cameraController.setMoveInput(vector.x, vector.y);
            // Pushing forward to the edge runs, like the Run toggle.
            this.touchSprintPushed = vector.magnitude > 0.95 && vector.y > 0.4;
            this.touchApplySprint();
            joystick.classList.toggle('sprinting', this.cameraController.touchSprint);
        };

        moveZone.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            if (this.touchMovePointerId !== null || !this.isGameplayActive()) return;
            this.touchMovePointerId = event.pointerId;
            moveZone.setPointerCapture(event.pointerId);
            // Start where the thumb lands, unless it landed on the joystick itself.
            const rect = joystick.getBoundingClientRect();
            const restX = rect.left + rect.width / 2 - (this.touchJoystickOffset ? this.touchJoystickOffset.x : 0);
            const restY = rect.top + rect.height / 2 - (this.touchJoystickOffset ? this.touchJoystickOffset.y : 0);
            let centerX = restX;
            let centerY = restY;
            if (Math.hypot(event.clientX - restX, event.clientY - restY) > rect.width / 2) {
                const half = rect.width / 2;
                const zone = moveZone.getBoundingClientRect();
                // Never further left or lower than its rest place (screen edge, hotbar).
                centerX = Math.max(restX, Math.min(zone.right - half - 4, event.clientX));
                centerY = Math.max(zone.top + half + 4, Math.min(restY, event.clientY));
            }
            this.touchJoystickOffset = { x: centerX - restX, y: centerY - restY };
            joystick.style.transform = `translate(${this.touchJoystickOffset.x}px, ${this.touchJoystickOffset.y}px)`;
            joystick.classList.add('active');
            this.touchJoystickCenter = { x: centerX, y: centerY };
            update(event.clientX, event.clientY);
        });
        moveZone.addEventListener('pointermove', (event) => {
            if (event.pointerId !== this.touchMovePointerId) return;
            event.preventDefault();
            update(event.clientX, event.clientY);
        });
        const release = (event) => {
            if (event.pointerId !== this.touchMovePointerId) return;
            this.touchMovePointerId = null;
            this.touchResetJoystick();
        };
        moveZone.addEventListener('pointerup', release);
        moveZone.addEventListener('pointercancel', release);
        moveZone.addEventListener('lostpointercapture', release);
    },

    touchResetJoystick() {
        const { joystick, knob } = this.touchUi;
        this.cameraController.setMoveInput(0, 0);
        this.touchSprintPushed = false;
        // Running stops with the player, like on a console.
        this.touchSprintLatched = false;
        this.touchApplySprint();
        this.touchJoystickOffset = null;
        joystick.style.transform = '';
        joystick.classList.remove('active', 'sprinting');
        knob.style.transform = 'translate(-50%, -50%)';
    },

    touchApplySprint() {
        this.cameraController.setTouchSprint(this.touchSprintLatched || this.touchSprintPushed);
    },

    // ---- The world: drag to look, tap to use, hold to mine ----

    touchBindLook() {
        const zone = this.touchUi.lookZone;
        zone.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            if (!this.isGameplayActive()) return;
            zone.setPointerCapture(event.pointerId);
            this.touchGestures.set(event.pointerId, new TouchGesture(event.clientX, event.clientY, performance.now()));
            // Only one finger turns the view; others can still tap or hold.
            if (this.touchLookPointerId === null) this.touchLookPointerId = event.pointerId;
        });
        zone.addEventListener('pointermove', (event) => {
            const gesture = this.touchGestures.get(event.pointerId);
            if (!gesture) return;
            event.preventDefault();
            const { dx, dy } = gesture.move(event.clientX, event.clientY);
            if (event.pointerId === this.touchLookPointerId && (dx || dy)) {
                this.cameraController.addLookDelta(dx * this.touchLookFactor, dy * this.touchLookFactor);
            }
        });
        const release = (event, cancelled) => {
            const gesture = this.touchGestures.get(event.pointerId);
            if (!gesture) return;
            this.touchGestures.delete(event.pointerId);
            if (this.touchLookPointerId === event.pointerId) {
                const next = this.touchGestures.keys().next();
                this.touchLookPointerId = next.done ? null : next.value;
            }
            const result = gesture.end(performance.now());
            if (this.touchMiningSource === event.pointerId) {
                this.touchMiningSource = null;
                this.stopMining();
            } else if (result === 'tap' && !cancelled && this.isGameplayActive()) {
                this.touchTapWorld();
            }
        };
        zone.addEventListener('pointerup', (event) => release(event, false));
        zone.addEventListener('pointercancel', (event) => release(event, true));
        zone.addEventListener('lostpointercapture', (event) => release(event, true));
    },

    // A tap on the world: use the held item on a mob or ride it; else hit the mob; else what a
    // right click does (place the block, open a door, use a tool...).
    touchTapWorld() {
        if (this.tryUseItemOnMob() || this.tryMountMob()) return;
        const mob = this.raycastMob(5);
        if (mob) {
            this.interactWithMob(mob);
            return;
        }
        this.placeBlock();
    },

    // What holding the left mouse button does: hit the mob in front once, or mine until released.
    touchStartBreak(source) {
        if (this.touchMiningSource !== null) return;
        const mob = this.raycastMob(5);
        if (mob) {
            this.interactWithMob(mob);
            return;
        }
        this.touchMiningSource = source;
        this.isBreakInputActive = true;
        if (navigator.vibrate && typeof source === 'number') navigator.vibrate(10);
    },

    // ---- Buttons ----

    // Calls press(event) when a finger lands on the button and release() when the last one
    // lifts; each button follows its own fingers, so several work at once.
    touchBindButton(button, press, release = null) {
        const pointers = new Set();
        // Fingers still down when a panel hid the controls are forgotten (resetTouchTransientInput).
        (this.touchButtonResets = this.touchButtonResets || []).push(() => pointers.clear());
        button.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!this.isGameplayActive()) return;
            button.setPointerCapture(event.pointerId);
            pointers.add(event.pointerId);
            button.classList.add('active');
            press(event);
        });
        const lift = (event) => {
            if (!pointers.delete(event.pointerId)) return;
            if (pointers.size > 0) return;
            button.classList.remove('active');
            if (release) release(event);
        };
        button.addEventListener('pointerup', lift);
        button.addEventListener('pointercancel', lift);
        button.addEventListener('lostpointercapture', lift);
        button.addEventListener('contextmenu', (event) => event.preventDefault());
    },

    touchBindButtons() {
        const controller = this.cameraController;
        const { jump, sneak, sprint, mine, use } = this.touchUi;

        this.touchBindButton(jump, () => {
            // A double tap toggles flying in creative mode, like Space.
            controller.pressJump();
            controller.setTouchJump(true);
        }, () => controller.setTouchJump(false));

        // Sneak toggles (so the thumb is free); while flying it sinks only while held, and
        // while riding it gets off.
        this.touchBindButton(sneak, () => {
            if (this.ridingMob) {
                this.dismount();
                return;
            }
            if (controller.flying) {
                this.touchSneakHeld = true;
                controller.keys.crouch = true;
                return;
            }
            controller.keys.crouch = !controller.keys.crouch;
        }, () => {
            if (!this.touchSneakHeld) return;
            this.touchSneakHeld = false;
            controller.keys.crouch = false;
        });

        this.touchBindButton(sprint, () => {
            this.touchSprintLatched = !this.touchSprintLatched;
            this.touchApplySprint();
        });

        this.touchBindButton(mine, () => this.touchStartBreak('button'), () => {
            if (this.touchMiningSource !== 'button') return;
            this.touchMiningSource = null;
            this.stopMining();
        });

        // Exactly a right click.
        this.touchBindButton(use, () => this.placeBlock());
    },

    // ---- The ☰ menu ----

    touchBindMenu() {
        const tap = (element, action) => {
            element.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                event.stopPropagation();
            });
            element.addEventListener('click', (event) => {
                event.preventDefault();
                action();
            });
        };
        tap(document.getElementById('touch-menu-button'), () => this.touchOpenMenu());
        tap(document.getElementById('touch-inventory-button'), () => this.openInventoryPanel());
        tap(document.getElementById('touch-chat-button'), () => this.openChatInput());
        const menu = this.touchUi.menu;
        tap(menu.querySelector('.touch-panel-close'), () => this.touchCloseMenu());
        menu.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
            // A tap on the dimmed background closes the menu.
            if (event.target === menu) this.touchCloseMenu();
        });
        menu.querySelector('.touch-menu-grid').addEventListener('click', (event) => {
            const item = event.target.closest('.touch-menu-item');
            if (!item || !this.touchMenuActions) return;
            const action = this.touchMenuActions[Number(item.dataset.index)];
            this.touchCloseMenu();
            if (action) action.run();
        });
    },

    // The menu entries: [icon, label, run, shown?]. Each one is what a desktop key does.
    touchMenuEntries() {
        const has = (name) => typeof this[name] === 'function';
        const heldBlueprint = this.getSelectedHeldItemType() === 'written_blueprint' && !this.blueprintProjection;
        const voice = document.getElementById('voice-toggle');
        const players = document.body.classList.contains('touch-players');
        return [
            ['🎒', 'Inventory', () => this.openInventoryPanel()],
            ['🔨', 'Crafting', () => this.openCraftingPanel()],
            ['📖', 'Guide', () => this.guideShow(), has('guideShow')],
            ['🐾', 'Bestiary', () => this.bestiaryShow(), has('bestiaryShow')],
            ['💬', 'Chat', () => this.openChatInput()],
            ['📐', 'Blueprints', () => this.blueprintShow(), has('blueprintShow')],
            ['🔄', 'Rotate plan', () => this.blueprintRotatePreview(), heldBlueprint && has('blueprintRotatePreview')],
            // F; with Sneak on it is Shift + F (retunes a sound block).
            ['👆', 'Interact', () => this.interactWithTarget(this.cameraController.keys.crouch)],
            ['🍖', 'Eat / use', () => this.eatSelectedItem()],
            ['📤', 'Drop', () => this.dropSelectedBlock()],
            ['🎥', 'Camera view', () => this.toggleCameraView()],
            ['📷', 'Photo mode', () => this.togglePhotoMode()],
            ['🎬', 'Camera editor', () => this.cinematicOpenPanel(), Boolean(this.creativeMode) && has('cinematicOpenPanel')],
            ['📍', 'Camera key', () => this.cinematicAddKey(), Boolean(this.creativeMode) && has('cinematicAddKey')],
            ['👥', players ? 'Hide players' : 'Players', () => document.body.classList.toggle('touch-players')],
            ['🎙', voice ? voice.textContent : 'Voice', () => voice.click(), Boolean(voice)],
            ['⛶', document.fullscreenElement ? 'Exit full screen' : 'Full screen', () => this.toggleFullscreen().catch(() => {}),
                Boolean(document.documentElement.requestFullscreen)],
            ['⚙', 'Settings', () => this.openPauseMenu()]
        ].filter((entry) => entry[3] === undefined || entry[3]);
    },

    touchOpenMenu() {
        if (this.touchMenuOpen || !this.isGameplayActive()) return;
        const entries = this.touchMenuEntries();
        this.touchMenuActions = entries.map(([, , run]) => ({ run }));
        const grid = this.touchUi.menu.querySelector('.touch-menu-grid');
        grid.innerHTML = '';
        entries.forEach(([icon, label], index) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'touch-menu-item';
            item.dataset.index = index;
            const iconElement = document.createElement('span');
            iconElement.className = 'icon';
            iconElement.textContent = icon;
            item.appendChild(iconElement);
            item.appendChild(document.createTextNode(label));
            grid.appendChild(item);
        });
        this.touchMenuOpen = true;
        this.stopMining();
        this.touchUi.menu.classList.add('visible');
    },

    touchCloseMenu() {
        if (!this.touchMenuOpen) return;
        this.touchMenuOpen = false;
        this.touchUi.menu.classList.remove('visible');
    },

    // ---- Chat: the input with Send and ✕ for the on-screen keyboard ----

    touchBindChat() {
        const input = document.getElementById('chat-input');
        if (!input) return;
        const row = document.createElement('div');
        row.id = 'touch-chat-row';
        input.parentNode.insertBefore(row, input);
        row.appendChild(input);
        input.setAttribute('enterkeyhint', 'send');
        input.setAttribute('autocomplete', 'off');
        input.placeholder = 'Message or /command';

        const addButton = (id, text, action) => {
            const button = document.createElement('button');
            button.id = id;
            button.type = 'button';
            button.textContent = text;
            // Keeps the keyboard up: the input does not lose focus on the press.
            button.addEventListener('pointerdown', (event) => event.preventDefault());
            button.addEventListener('click', (event) => {
                event.preventDefault();
                action();
            });
            row.appendChild(button);
        };
        addButton('touch-chat-send', 'Send', () => this.submitChatMessage());
        addButton('touch-chat-close', '✕', () => this.closeChatInput());
    },

    // Inventory and crafting have no close button on a desktop (E, C or Esc close them).
    touchAddPanelCloseButtons() {
        const add = (panelId, close) => {
            const heading = document.querySelector(`#${panelId} h3`);
            if (!heading) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'touch-panel-close';
            button.setAttribute('aria-label', 'Close');
            button.textContent = '✕';
            button.addEventListener('click', () => close());
            heading.appendChild(button);
        };
        add('inventory-panel', () => this.closeInventoryPanel());
        add('crafting-panel', () => this.closeCraftingPanel());
    },

    // ---- No zooming, pull-to-refresh, long-press menus or text selection while playing ----

    touchPreventBrowserGestures() {
        const editable = (target) => Boolean(target && target.closest && target.closest('input, textarea, select, [contenteditable]'));
        // Inside a scrolling panel a finger scrolls; anywhere else it must not move the page.
        const scrollable = (target) => {
            for (let node = target; node && node !== document.body; node = node.parentElement) {
                if (node.scrollHeight > node.clientHeight + 1) {
                    const overflow = getComputedStyle(node).overflowY;
                    if (overflow === 'auto' || overflow === 'scroll') return true;
                }
            }
            return false;
        };
        const noteTouch = (event) => {
            if (!event.pointerType || event.pointerType === 'touch') this.touchLastAt = performance.now();
        };
        document.addEventListener('pointerdown', noteTouch, true);
        document.addEventListener('pointerup', noteTouch, true);
        document.addEventListener('touchstart', noteTouch, { capture: true, passive: true });
        document.addEventListener('touchmove', (event) => {
            if (event.touches.length > 1 || !scrollable(event.target)) {
                if (event.cancelable) event.preventDefault();
            }
        }, { passive: false });
        for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
            document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
        }
        document.addEventListener('contextmenu', (event) => {
            if (!editable(event.target)) event.preventDefault();
        });
        document.addEventListener('selectstart', (event) => {
            if (!editable(event.target)) event.preventDefault();
        });
        // Photo mode hides every control: a tap brings them back.
        document.addEventListener('pointerdown', (event) => {
            if (!this.photoMode || event.pointerType === 'mouse') return;
            event.preventDefault();
            this.togglePhotoMode();
        }, true);
    }
});

registerModalPanel({
    isOpen() { return Boolean(this.touchMenuOpen); },
    close() { this.touchCloseMenu(); }
});
