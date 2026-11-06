// The Glow Block: a decorative cube that shines by itself, in the colour the player picks. It needs
// no power, and it is not realistic: it is simply a block that glows.
// - It does not light the world, and it does not light a microscope. The light engine has a level and
//   no colour, so a red block would throw white light: `glow` lights only its own texture.
// - The colour is part of the block name, like any state, so it travels through chunks, blockPlace,
//   blueprints and /build with no more ado, and every name is a block type from the start. So the
//   colours are a fixed set: 5 colour temperatures and an RGB cube of 6 levels per channel (221 types).
//   A type costs next to nothing until a chunk uses it. Then it costs a material and a texture, kept
//   small by `maxSize`: a plain glowing face needs no 256 pixel maps.
//       glow_block            3000 K, the item, and what breaking any of them gives
//       glow_block:k6500      another temperature
//       glow_block:rgb503     levels 0..5 of red, green and blue
// - A right click opens the panel. It asks the server (glowSet, pkg/network/glow_block.go), which checks
//   the reach, the name and that the block is still there, and tells everyone with a blockPlace.
// - Breaking one gives a plain glow_block: the inventory only knows type and count.
// GLOW_KELVINS and GLOW_LEVELS mirror glowKelvins and glowLevels in glow_block.go (test/js/glow_block.test.js).
// Mixed into Game.prototype; hooked through js/extensions.js.

const GLOW_BLOCK = 'glow_block';
// Colour temperatures, and how a filament or a screen of that temperature looks. The first plain one
// is the block's default.
const GLOW_KELVINS = { 2700: 0xffa957, 3000: 0xffb46b, 4000: 0xffd1a3, 5000: 0xffe4ce, 6500: 0xfffefa };
const GLOW_DEFAULT_KELVIN = 3000;
// How many steps each of red, green and blue has.
const GLOW_LEVELS = 6;
const GLOW_STEP = 255 / (GLOW_LEVELS - 1);
// Blocks away at which the panel closes (the server allows 9), and the fewest ms between changes sent.
const GLOW_CLOSE_DISTANCE = 7;
const GLOW_SEND_EVERY = 120;

// ---------------------------------------------------------------------------------------
// Pure helpers (also used by test/js/glow_block.test.js)

// The nearest level of a channel from 0 to 255.
function glowLevelOf(value) {
    return Math.max(0, Math.min(GLOW_LEVELS - 1, Math.round(Number(value) / GLOW_STEP)));
}

// The block with the colour nearest to this one.
function glowNameOfRgb(red, green, blue) {
    return `${GLOW_BLOCK}:rgb${glowLevelOf(red)}${glowLevelOf(green)}${glowLevelOf(blue)}`;
}

function glowNameOfKelvin(kelvin) {
    return kelvin === GLOW_DEFAULT_KELVIN ? GLOW_BLOCK : `${GLOW_BLOCK}:k${kelvin}`;
}

// What state a name is: { kelvin } or { rgb: [r, g, b] } from 0 to 255; null if it is no glow block.
function glowStateOf(name) {
    if (name === GLOW_BLOCK) return { kelvin: GLOW_DEFAULT_KELVIN };
    const kelvin = String(name).match(/^glow_block:k(\d+)$/);
    if (kelvin && GLOW_KELVINS[kelvin[1]] && Number(kelvin[1]) !== GLOW_DEFAULT_KELVIN) return { kelvin: Number(kelvin[1]) };
    const rgb = String(name).match(/^glow_block:rgb([0-5])([0-5])([0-5])$/);
    if (rgb) return { rgb: [1, 2, 3].map((i) => Math.round(Number(rgb[i]) * GLOW_STEP)) };
    return null;
}

// The colour of a name, as 0xRRGGBB.
function glowColorOf(name) {
    const state = glowStateOf(name);
    if (!state) return null;
    if (state.kelvin) return GLOW_KELVINS[state.kelvin];
    return (state.rgb[0] << 16) | (state.rgb[1] << 8) | state.rgb[2];
}

// Every state's block name.
function glowAllNames() {
    const names = Object.keys(GLOW_KELVINS).map((kelvin) => glowNameOfKelvin(Number(kelvin)));
    for (let r = 0; r < GLOW_LEVELS; r++) {
        for (let g = 0; g < GLOW_LEVELS; g++) {
            for (let b = 0; b < GLOW_LEVELS; b++) names.push(`${GLOW_BLOCK}:rgb${r}${g}${b}`);
        }
    }
    return names;
}

// What the panel says of a state.
function glowDescribe(name) {
    const state = glowStateOf(name);
    if (!state) return '';
    if (state.kelvin) return `${state.kelvin} K`;
    return `R ${state.rgb[0]}  G ${state.rgb[1]}  B ${state.rgb[2]}`;
}

function glowCss(color) {
    return `#${color.toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------------------
// The block

// One colour, with a soft brighter middle and a thin darker edge so that a wall of them reads as blocks.
// The tint is the colour; every state paints the same.
registerTexturePattern('glow_block', (f, s, tint, seed) => {
    const color = f.rgb(tint ?? GLOW_KELVINS[GLOW_DEFAULT_KELVIN]);
    f.each(s, (x, y, u, v) => {
        const r = Math.hypot(u - 0.5, v - 0.5);
        const edge = u < 0.07 || u > 0.93 || v < 0.07 || v > 0.93;
        // Only darker, by multiplying, so that a pure red stays red: f.tone would tint it.
        const m = edge ? 0.72 : 1 - r * 0.2 - f.hash(x, y, seed) * 0.03;
        f.put(s, x, y, color.map((channel) => channel * m), 0.5);
    });
}, { maxSize: 32, rtx: { roughness: 0.4, metalness: 0, normalScale: 0.1 } });

for (const name of glowAllNames()) {
    const color = glowColorOf(name);
    const face = { pattern: GLOW_BLOCK, tint: color };
    registerBlockType(name, {
        color, name: 'Glow Block', breakDuration: 0.25, glow: 1.6,
        faces: { top: face, side: face, bottom: face },
        ...(name === GLOW_BLOCK ? {} : { variantOf: GLOW_BLOCK, dropType: GLOW_BLOCK })
    });
}

registerGameContent(({ addItem, addRecipe }) => {
    addItem(GLOW_BLOCK);
    addRecipe(GLOW_BLOCK, 'Make Glow Block', GLOW_BLOCK, 1, [{ type: 'glass', amount: 1 }, { type: 'torch', amount: 1 }]);
});

// ---------------------------------------------------------------------------------------
// The panel

const GLOW_CSS = `
#glow-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(420px,calc(100vw - 16px));max-height:calc(100% - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom));display:none;flex-direction:column;gap:10px;padding:16px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(8,12,20,.95);color:#fff;font-family:'Consolas',monospace;font-size:13px;z-index:275;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y}
#glow-panel.visible{display:flex}
#glow-panel .glow-head{display:flex;align-items:center;gap:8px}
#glow-panel h3{font-size:16px;margin:0;flex:1}
#glow-panel h4{font-size:12px;margin:2px 0;opacity:.75;font-weight:400}
#glow-panel button{min-width:44px;min-height:40px;padding:0 6px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:700 12px/1.1 'Consolas',monospace;cursor:pointer;touch-action:manipulation}
#glow-panel button.active{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.5)}
#glow-preview{height:72px;border-radius:10px;border:1px solid rgba(255,255,255,.2)}
#glow-value{text-align:center;min-height:16px}
#glow-kelvins{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}
#glow-kelvins button{color:#111;text-shadow:0 0 2px rgba(255,255,255,.7)}
.glow-slider{display:grid;grid-template-columns:16px 1fr 34px;gap:8px;align-items:center}
.glow-slider input{width:100%;height:32px;touch-action:none}
.glow-slider span{text-align:right}
#glow-note{font-size:12px;opacity:.72;line-height:1.35}
`;

Object.assign(Game.prototype, {
    glowTryOpen(position) {
        const type = this.world.getBlockTypeAt(position.x, position.y, position.z);
        if (!type || storageBaseName(type) !== GLOW_BLOCK) return false;
        if (!this.network || !this.network.connected) {
            this.receiveSystemMessage({ text: 'Not connected: its colour is kept on the server' });
            return true;
        }
        this.glowBuildPanel();
        this.glowAt = { x: position.x, y: position.y, z: position.z };
        this.glowName = type;
        this.glowOutgoing = null;
        this.glowOpenedAt = performance.now();
        this.stopMining();
        // Losing the pointer lock would otherwise open the pause menu.
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.glowPanel.classList.add('visible');
        this.glowRender();
        this.updatePointerLockHint();
        return true;
    },

    glowClose() {
        if (!this.glowAt) return;
        this.glowFlush(true);
        this.glowAt = null;
        this.glowPanel.classList.remove('visible');
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        this.recapturePointerLock();
        this.updatePointerLockHint();
    },

    // The colour chosen: on the preview at once, and to the server as often as is reasonable.
    glowChoose(name) {
        if (!this.glowAt || !glowStateOf(name)) return;
        this.glowName = name;
        this.glowOutgoing = name;
        this.glowRender();
        this.glowFlush(false);
    },

    glowFlush(force) {
        if (!this.glowOutgoing || !this.glowAt || !this.network || !this.network.connected) return;
        const now = performance.now();
        if (!force && now - (this.glowSentAt || -Infinity) < GLOW_SEND_EVERY) return;
        this.glowSentAt = now;
        this.network.send('glowSet', { ...this.glowAt, blockType: this.glowOutgoing });
        this.glowOutgoing = null;
    },

    glowUpdate() {
        const at = this.glowAt;
        if (!at) return;
        this.glowFlush(false);
        const block = this.world.getBlockTypeAt(at.x, at.y, at.z);
        const eye = this.cameraController.camera.position;
        const far = Math.hypot(eye.x - at.x - 0.5, eye.y - at.y - 0.5, eye.z - at.z - 0.5) > GLOW_CLOSE_DISTANCE;
        if (!block || storageBaseName(block) !== GLOW_BLOCK || far || !this.network.connected || this.respawnPending) {
            this.glowClose();
            return;
        }
        // Someone else changed it: show that, unless what we chose is still on its way.
        if (block !== this.glowShown && !this.glowOutgoing && performance.now() - (this.glowSentAt || -Infinity) > 600) {
            this.glowShown = block;
            if (block !== this.glowName) {
                this.glowName = block;
                this.glowRender();
            }
        }
    },

    glowBuildPanel() {
        if (this.glowPanel) return;
        const style = document.createElement('style');
        style.textContent = GLOW_CSS;
        document.head.appendChild(style);
        const panel = document.createElement('div');
        panel.id = 'glow-panel';
        const sliders = [['r', 'R'], ['g', 'G'], ['b', 'B']].map(([id, label]) => `
            <label class="glow-slider">${label}<input id="glow-${id}" type="range" min="0" max="255" step="${GLOW_STEP}"><span id="glow-${id}-value"></span></label>`).join('');
        panel.innerHTML = `
            <div class="glow-head"><h3>Glow Block</h3><button class="glow-close" type="button" aria-label="Close">✕</button></div>
            <div id="glow-preview"></div>
            <div id="glow-value"></div>
            <h4>Colour temperature</h4>
            <div id="glow-kelvins">${Object.keys(GLOW_KELVINS).map((kelvin) => `<button type="button" data-kelvin="${kelvin}" style="background:${glowCss(GLOW_KELVINS[kelvin])}">${kelvin} K</button>`).join('')}</div>
            <h4>Colour (${GLOW_LEVELS} steps per channel: it goes to the nearest)</h4>
            ${sliders}
            <div id="glow-note">It glows, but gives no light to what is around it. Broken, it comes back as a plain Glow Block: the colour is not kept.</div>`;
        document.body.appendChild(panel);
        this.glowPanel = panel;
        panel.querySelector('.glow-close').addEventListener('click', () => this.glowClose());
        panel.querySelectorAll('[data-kelvin]').forEach((button) => {
            button.addEventListener('click', () => this.glowChoose(glowNameOfKelvin(Number(button.dataset.kelvin))));
        });
        const fromSliders = () => {
            const [r, g, b] = ['r', 'g', 'b'].map((id) => panel.querySelector(`#glow-${id}`).value);
            this.glowChoose(glowNameOfRgb(r, g, b));
        };
        ['r', 'g', 'b'].forEach((id) => panel.querySelector(`#glow-${id}`).addEventListener('input', fromSliders));
        // Clicks inside the panel must not reach the game (which would try to grab the pointer).
        panel.addEventListener('mousedown', (event) => event.stopPropagation());
        panel.addEventListener('pointerdown', (event) => event.stopPropagation());
        panel.addEventListener('contextmenu', (event) => event.preventDefault());
        // Clicking outside closes it, except the click that opened it and what a phone makes up after a tap.
        document.addEventListener('mousedown', (event) => {
            if (!this.glowAt || performance.now() - this.glowOpenedAt < 150) return;
            if (this.touchControlsEnabled && this.touchIsEmulatedMouse(event)) return;
            this.glowClose();
        });
        // E or Escape close it; nothing reaches the game while it is open.
        document.addEventListener('keydown', (event) => {
            if (!this.glowAt) return;
            event.stopImmediatePropagation();
            if (event.code === 'Escape' || event.code === 'KeyE') {
                event.preventDefault();
                if (!event.repeat) this.glowClose();
            }
        }, true);
    },

    glowRender() {
        const panel = this.glowPanel;
        if (!panel || !this.glowAt) return;
        const name = this.glowName;
        const state = glowStateOf(name);
        const css = glowCss(glowColorOf(name));
        const preview = panel.querySelector('#glow-preview');
        preview.style.background = css;
        preview.style.boxShadow = `0 0 26px ${css}`;
        panel.querySelector('#glow-value').textContent = glowDescribe(name);
        panel.querySelectorAll('[data-kelvin]').forEach((button) => button.classList.toggle('active', Number(button.dataset.kelvin) === state.kelvin));
        // A temperature is not on the sliders: they show its nearest colour.
        const color = glowColorOf(name);
        const values = state.rgb || [(color >> 16) & 255, (color >> 8) & 255, color & 255].map((value) => Math.round(glowLevelOf(value) * GLOW_STEP));
        ['r', 'g', 'b'].forEach((id, i) => {
            panel.querySelector(`#glow-${id}`).value = String(values[i]);
            panel.querySelector(`#glow-${id}-value`).textContent = String(values[i]);
        });
    }
});

registerModalPanel({
    isOpen() { return Boolean(this.glowAt); },
    close() { this.glowClose(); }
});

registerItemUseHandler(function (itemType, hit) {
    if (!hit || this.cameraController.isCrouching) return false;
    const position = this.world.getBlockPositionFromIntersection(hit);
    return Boolean(position) && this.glowTryOpen(position);
});

registerFrameUpdate(function () {
    this.glowUpdate();
});
