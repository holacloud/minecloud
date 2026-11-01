// Night sky and astronomy.
// - Stars: one THREE.Points dome (background stars, 8 constellations, named stars, the two
//   wandering planets and the comet) that follows the camera, fades in at dusk and turns
//   with the world clock. Everything depends only on timeOfDay and worldDay (from the
//   server) and on a fixed seed, so every player sees the same sky.
// - Shooting stars: scheduled in 5-second slots of the world clock (shared too); comet
//   nights bring a meteor shower.
// - Rare events: a comet every ASTRO_COMET_EVERY nights and a lunar eclipse (red moon)
//   every ASTRO_ECLIPSE_EVERY nights, on a full moon.
// - Telescope (2 glass + 1 copper_block + 2 planks, or 2 iron_ore instead of the copper):
//   right click raises/lowers it. It zooms smoothly, draws the constellation lines, labels
//   what you aim at and shows a small HUD. Watching a rare event through it reveals the
//   secret guide page C0M3T.
// - Star chart (1 leather + 1 feather): carried while you watch a constellation for a moment
//   through the telescope, it charts it (also planets and rare events). Right click opens it.
// - Creative mode only: /sky [comet|eclipse|meteor|off] to preview the rare events locally.
// Mixed into Game.prototype; hooked through js/extensions.js (registerItemType,
// registerGameContent, registerItemUseHandler, registerFrameUpdate, registerModalPanel).

const ASTRO_RADIUS = 400;
const ASTRO_SEED = 0x5741a;
const ASTRO_BACKGROUND_STARS = 1400;
const ASTRO_COMET_EVERY = 13;
const ASTRO_COMET_NIGHT = 6;
const ASTRO_ECLIPSE_EVERY = 24;
const ASTRO_ECLIPSE_NIGHT = 16;
const ASTRO_ECLIPSE_LENGTH = 0.16;
const ASTRO_SECRET_CODE = 'C0M3T';
const ASTRO_ZOOM_FOV = 12;
const ASTRO_CHART_KEY = 'minecloud-star-chart';
const ASTRO_POLE_ELEVATION = 50;

const ASTRO_MOON_PHASES = [
    'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent',
    'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous'
];

// Constellations: centre (lon, dec) on the sky sphere in degrees, and stars as
// [east, north, brightness] offsets in degrees; `name` marks a named star.
const ASTRO_CONSTELLATIONS = [
    {
        id: 'owl', name: 'The Owl', lon: 20, dec: 52,
        text: 'Never sets: it watches the pole all night long, like the owl in its tree.',
        stars: [[-2.5, 3, 1.5, 'Lumen'], [2.5, 3, 1.5, 'Vigil'], [-4, 6.5, 0.7], [4, 6.5, 0.7],
            [0, 0.5, 0.6], [-4.5, -3, 0.6], [4.5, -3, 0.6], [0, -7, 0.65]],
        lines: [[2, 0], [0, 1], [1, 3], [0, 4], [1, 4], [0, 5], [1, 6], [5, 7], [6, 7]]
    },
    {
        id: 'fox_tail', name: "The Fox's Tail", lon: 75, dec: 22,
        text: 'A bushy arc ending in a red ember. Foxes are said to steal its light.',
        stars: [[-9, -4, 0.6], [-6, -1, 0.6], [-3, 1.5, 0.7], [0.5, 3, 0.7], [4, 3, 0.75], [7, 1, 0.8],
            [9, -2, 1.5, 'Ember', 0xff8a5c]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]]
    },
    {
        id: 'wisp_lantern', name: "The Wisp's Lantern", lon: 120, dec: 8,
        text: 'Its heart flickers like a will-o\'-the-wisp. Do not follow it home.',
        stars: [[0, 4, 0.6], [-3, 0, 0.6], [0, -4, 0.6], [3, 0, 0.6], [0, 0, 1.3, 'Wyll', 0xbff7d8, 0.6], [0, 7, 0.5]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 5]]
    },
    {
        id: 'mole_tunnel', name: "The Mole's Tunnel", lon: 165, dec: -12,
        text: 'A zigzag that hugs the horizon, as if it were digging under it.',
        stars: [[-10, 1, 0.6], [-6, -2, 0.55], [-2, 1.5, 0.6], [2, -2, 0.55], [6, 1, 0.6], [10, -1.5, 0.75]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]
    },
    {
        id: 'turtle', name: 'The Great Turtle', lon: 210, dec: 30,
        text: 'The slowest figure in the sky carries the whole night on its shell.',
        stars: [[-4, 2, 0.6], [0, 4, 0.65], [4, 2, 0.6], [4, -2, 0.6], [0, -4, 0.65], [-4, -2, 0.6],
            [0, 0, 1.2, 'Patience', 0xd8ffe0], [7, 0, 0.6], [-6, 4, 0.45], [-6, -4, 0.45], [5.5, 4.5, 0.45], [5.5, -4.5, 0.45]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [2, 7], [3, 7], [0, 8], [5, 9], [2, 10], [3, 11]]
    },
    {
        id: 'golem', name: 'The Storm Golem', lon: 262, dec: 12,
        text: 'A giant with a blue heart. Old miners say it was carved by lightning.',
        stars: [[0, 9, 0.6], [-4, 5, 0.75], [4, 5, 0.75], [0, 3, 1.6, 'Thunderheart', 0x9fc4ff], [-2.5, -2, 0.6],
            [2.5, -2, 0.6], [-6, 0, 0.55], [6, 0, 0.55], [-3, -8, 0.6], [3, -8, 0.6]],
        lines: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 5], [1, 6], [2, 7], [4, 8], [5, 9]]
    },
    {
        id: 'hive', name: 'The Hive', lon: 315, dec: 62,
        text: 'A tight swarm of little stars around a golden queen. It never sets either.',
        stars: [[0, 0, 1.3, 'Queen', 0xffe08a], [-1.6, 0.8, 0.6], [1.4, 1.1, 0.6], [-0.8, -1.5, 0.55],
            [1.2, -1.2, 0.55], [0.2, 2, 0.5], [-2, -0.6, 0.5]],
        lines: [[0, 1], [0, 2], [0, 3], [0, 4], [2, 5], [1, 6]]
    },
    {
        id: 'rabbit', name: 'The Leaping Rabbit', lon: 355, dec: 18,
        text: 'Long ears and a hind leg ready to jump. It rises just when the owl looks away.',
        stars: [[-1, 8, 0.6], [1.5, 8.5, 0.6], [0, 4, 0.7], [-4, 1, 0.6], [-7, 0, 0.75], [0, -1, 0.6],
            [4, -3, 0.55], [-5, -4, 0.55]],
        lines: [[0, 2], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [3, 7]]
    }
];

const ASTRO_POLE_STAR = { name: 'The Nail', text: 'The star the whole sky turns around. It never moves: sailors and lost miners steer by it.' };

const ASTRO_PLANETS = [
    { id: 'ferro', name: 'Ferro', color: 0xff7a4a, bright: 1.4, size: 4.6, period: 9, lon: 40,
        text: 'A rusty wanderer, the colour of iron ore. It laps the sky every 9 days.' },
    { id: 'aurum', name: 'Aurum', color: 0xffe08a, bright: 1.7, size: 5, period: 31, lon: 200,
        text: 'A slow golden wanderer. It takes 31 days to go round the sky.' }
];

const ASTRO_COMET_POINTS = 36;

const ASTRO_TELESCOPE_SPRITE = [
    '..........GL',
    '.........GLL',
    '........CCG.',
    '.......CcC..',
    '......CcC...',
    '.....CcC....',
    '....BcB.....',
    '...BbB......',
    '..BbB.......',
    '.wBB........',
    '.w.w........',
    'w...w.......'
];
const ASTRO_CHART_SPRITE = [
    '............',
    '.PPPPPPPPPP.',
    '.PNNNNNNNNP.',
    '.PNyNNNNsNP.',
    '.PNNsNNyNNP.',
    '.PNNNsNNNNP.',
    '.PNyNNNsNNP.',
    '.PNNNNyNNNP.',
    '.PNsNNNNNyP.',
    '.PNNNNNNNNP.',
    '.PPPPPPPPPP.',
    '............'
];

const ASTRO_VERTEX_SHADER = `
    attribute vec3 aColor;
    attribute float aSize;
    attribute float aBright;
    attribute float aFlicker;
    attribute float aPhase;
    uniform float uFade;
    uniform float uTime;
    uniform float uZoom;
    uniform float uPixelRatio;
    varying vec3 vColor;
    varying float vBright;
    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vec3 direction = normalize(worldPosition.xyz - cameraPosition);
        float horizon = smoothstep(-0.03, 0.1, direction.y);
        float twinkle = 1.0 + aFlicker * sin(uTime * (1.7 + fract(aPhase * 7.0) * 3.0) + aPhase * 6.2831);
        // Through the telescope faint stars come out.
        float boost = 1.0 + uZoom * (1.6 - min(aBright, 1.0));
        vBright = aBright * twinkle * horizon * uFade * boost;
        vColor = aColor;
        gl_PointSize = vBright > 0.002 ? aSize * uPixelRatio * (1.0 + uZoom * 0.8) : 0.0;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;
const ASTRO_FRAGMENT_SHADER = `
    varying vec3 vColor;
    varying float vBright;
    void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float a = smoothstep(0.5, 0.08, d);
        if (a <= 0.0) discard;
        gl_FragColor = vec4(vColor * vBright, a);
    }
`;

const ASTRO_CSS = `
#astro-vignette { position: fixed; inset: 0; pointer-events: none; z-index: 4; opacity: 0; transition: opacity 0.25s;
    background: radial-gradient(circle at center, rgba(0,0,0,0) 0, rgba(0,0,0,0) 36vmin, rgba(0,0,0,0.55) 41vmin, rgba(0,0,0,0.94) 46vmin); }
#astro-vignette.visible { opacity: 1; }
#astro-vignette::after { content: ''; position: absolute; left: 50%; top: 50%; width: 5vmin; height: 5vmin;
    margin: -2.5vmin 0 0 -2.5vmin; border: 1px solid rgba(190,215,255,0.35); border-radius: 50%; }
#astro-label { position: fixed; pointer-events: none; z-index: 6; color: #cfe0ff; font: 600 13px sans-serif;
    text-shadow: 0 0 4px #000, 0 0 2px #000; transform: translate(-50%, -150%); white-space: nowrap; display: none; }
#astro-hud { position: fixed; left: 50%; bottom: 112px; transform: translateX(-50%); z-index: 6; pointer-events: none;
    min-width: 240px; max-width: min(440px, calc(100vw - 32px)); padding: 8px 14px; border-radius: 8px; display: none;
    background: rgba(8,14,30,0.78); border: 1px solid rgba(150,180,255,0.35); color: #e6eeff; font: 13px sans-serif; text-align: center; }
#astro-hud .astro-title { font-weight: 700; font-size: 15px; color: #fff3c4; }
#astro-hud .astro-kind { color: #9fb6e6; font-size: 12px; margin-top: 1px; }
#astro-hud .astro-text { margin-top: 4px; line-height: 1.35; }
#astro-hud .astro-foot { margin-top: 5px; color: #9fb6e6; font-size: 11px; }
#astro-hud .astro-bar { height: 3px; margin-top: 5px; background: rgba(255,255,255,0.12); border-radius: 2px; overflow: hidden; }
#astro-hud .astro-bar > div { height: 100%; width: 0; background: #ffe08a; }
#astro-chart { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 60; display: none;
    width: min(640px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow-y: auto; box-sizing: border-box;
    padding: 16px; border-radius: 10px; background: #121a33; border: 2px solid #d9c39a; color: #e6eeff; font: 14px sans-serif;
    box-shadow: 0 10px 40px rgba(0,0,0,0.6); }
#astro-chart.visible { display: block; }
#astro-chart .astro-chart-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
#astro-chart h3 { margin: 0; color: #f3e2b8; flex: 1; }
#astro-chart button { background: #2a3760; color: #fff; border: 1px solid #5a6fae; border-radius: 6px; padding: 5px 12px; cursor: pointer; }
#astro-chart .astro-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin: 12px 0; }
#astro-chart .astro-card { background: #0b1126; border: 1px solid #2c3a66; border-radius: 8px; padding: 6px; text-align: center; font-size: 12px; }
#astro-chart .astro-card canvas { width: 100%; height: auto; display: block; }
#astro-chart .astro-card.unknown { color: #6a7aa6; }
#astro-chart h4 { margin: 10px 0 4px; color: #f3e2b8; font-size: 14px; }
#astro-chart ul { margin: 0; padding-left: 18px; }
#astro-chart .astro-note { color: #9fb6e6; font-size: 12px; margin-top: 8px; }
`;

function astroRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// A number in [0, 1) that only depends on n and salt (same for every player).
function astroHash(n, salt) {
    return astroRandom((Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b) ^ ASTRO_SEED) >>> 0)();
}

// Unit vector on the sky sphere (pole = +Y).
function astroSkyDir(lonDeg, decDeg) {
    const lon = THREE.MathUtils.degToRad(lonDeg);
    const dec = THREE.MathUtils.degToRad(decDeg);
    return new THREE.Vector3(Math.cos(dec) * Math.cos(lon), Math.sin(dec), Math.cos(dec) * Math.sin(lon));
}

// A point dx degrees east and dy degrees north of `centre` (a unit vector).
function astroOffsetDir(centre, dxDeg, dyDeg) {
    const pole = new THREE.Vector3(0, 1, 0);
    const east = new THREE.Vector3().crossVectors(pole, centre);
    if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
    east.normalize();
    const north = new THREE.Vector3().crossVectors(centre, east).normalize();
    return centre.clone()
        .addScaledVector(east, Math.tan(THREE.MathUtils.degToRad(dxDeg)))
        .addScaledVector(north, Math.tan(THREE.MathUtils.degToRad(dyDeg)))
        .normalize();
}

// The night a moment belongs to. A world day starts at dawn (timeOfDay 0, 06:00), so its
// night (timeOfDay 0.5-1, 18:00-06:00, darkest at 0.75) belongs wholly to it: night N is day N.
function astroNightIndex(worldDay, _timeOfDay) {
    return worldDay;
}

function astroIsCometNight(night) {
    return ((night % ASTRO_COMET_EVERY) + ASTRO_COMET_EVERY) % ASTRO_COMET_EVERY === ASTRO_COMET_NIGHT;
}

function astroIsEclipseNight(night) {
    return ((night % ASTRO_ECLIPSE_EVERY) + ASTRO_ECLIPSE_EVERY) % ASTRO_ECLIPSE_EVERY === ASTRO_ECLIPSE_NIGHT;
}

function astroNightsUntil(night, every, offset) {
    return (((offset - night) % every) + every) % every;
}

registerItemType('telescope', {
    color: 0xb46a3c,
    name: 'Telescope',
    drawIcon: resourcesDrawSprite(ASTRO_TELESCOPE_SPRITE, {
        G: 0x8fd3ff, L: 0xdff4ff, C: 0xb46a3c, c: 0xe0935a, B: 0x7a4423, b: 0xa45a30, w: 0x8a6a3a
    }),
    displayMesh: resourcesDisplayMesh
});
registerItemType('star_chart', {
    color: 0x1d2a4f,
    name: 'Star Chart',
    drawIcon: resourcesDrawSprite(ASTRO_CHART_SPRITE, { P: 0xd9c39a, N: 0x1d2a4f, y: 0xffe9a0, s: 0x8fb4ff }),
    displayMesh: resourcesDisplayMesh
});

registerGameContent(function ({ addRecipe }) {
    addRecipe('telescope', 'Craft Telescope', 'telescope', 1,
        [{ type: 'glass', amount: 2 }, { type: 'copper_block', amount: 1 }, { type: 'planks', amount: 2 }]);
    addRecipe('telescope_iron', 'Craft Telescope (Iron)', 'telescope', 1,
        [{ type: 'glass', amount: 2 }, { type: 'iron_ore', amount: 2 }, { type: 'planks', amount: 2 }]);
    addRecipe('star_chart', 'Draw Star Chart', 'star_chart', 1,
        [{ type: 'leather', amount: 1 }, { type: 'feather', amount: 1 }]);
    this.astroLoadChart();
});

registerItemUseHandler(function (item) {
    if (item === 'telescope') {
        this.astroToggleTelescope();
        return true;
    }
    if (item === 'star_chart') {
        this.astroChartShow();
        return true;
    }
    return false;
});

registerModalPanel({
    isOpen() { return Boolean(this.astroChartOpen); },
    close() { this.astroChartClose(); }
});

registerFrameUpdate(function (delta) {
    this.astroUpdate(delta);
});

// Creative mode only: /sky previews the rare events in this browser. Wrapped once the game
// starts, because social.js (which defines the chat commands) loads after this file.
registerGameContent(function () {
    if (Game.prototype.astroChatWrapped) return;
    Game.prototype.astroChatWrapped = true;
    const runChatCommand = Game.prototype.runChatCommand;
    Game.prototype.runChatCommand = function (commandLine) {
        const [command, ...args] = commandLine.slice(1).split(/\s+/);
        if (command.toLowerCase() === 'sky' && this.creativeMode && this.astroBuilt) {
            this.astroSkyCommand((args[0] || '').toLowerCase());
            return;
        }
        runChatCommand.call(this, commandLine);
    };
});

Object.assign(Game.prototype, {
    // ---- Building the sky ----

    astroBuild() {
        this.astroBuilt = true;
        const random = astroRandom(ASTRO_SEED);
        const positions = [];
        const colors = [];
        const sizes = [];
        const brights = [];
        const flickers = [];
        const phases = [];
        const push = (dir, color, size, bright, flicker) => {
            positions.push(dir.x * ASTRO_RADIUS, dir.y * ASTRO_RADIUS, dir.z * ASTRO_RADIUS);
            const c = new THREE.Color(color);
            colors.push(c.r, c.g, c.b);
            sizes.push(size);
            brights.push(bright);
            flickers.push(flicker);
            phases.push(random());
            return positions.length / 3 - 1;
        };

        const tints = [0xffffff, 0xdfe8ff, 0xc8d8ff, 0xfff1d8, 0xffe0c0];
        for (let i = 0; i < ASTRO_BACKGROUND_STARS; i++) {
            const y = random() * 2 - 1;
            const angle = random() * Math.PI * 2;
            const r = Math.sqrt(1 - y * y);
            const dir = new THREE.Vector3(r * Math.cos(angle), y, r * Math.sin(angle));
            const magnitude = Math.pow(random(), 3);
            push(dir, tints[Math.floor(random() * tints.length)], 1.2 + magnitude * 1.4, 0.22 + magnitude * 0.7, 0.15);
        }

        // Named objects the telescope can point at: { name, kind, text, dir (sky space), constellation }.
        this.astroNamedStars = [];
        this.astroNamedStars.push({ name: ASTRO_POLE_STAR.name, kind: 'Pole star', text: ASTRO_POLE_STAR.text, dir: new THREE.Vector3(0, 1, 0) });
        push(new THREE.Vector3(0, 1, 0), 0xf4f6ff, 3.6, 1.3, 0.08);

        const linePositions = [];
        this.astroConstellations = ASTRO_CONSTELLATIONS.map((constellation) => {
            const centre = astroSkyDir(constellation.lon, constellation.dec);
            const dirs = constellation.stars.map(([dx, dy, bright, name, color, flicker]) => {
                const dir = astroOffsetDir(centre, dx, dy);
                push(dir, color || 0xf2f5ff, name ? 3.4 : 2.3 + bright, name ? bright : 0.55 + bright * 0.5, flicker || 0.1);
                if (name) {
                    this.astroNamedStars.push({ name, kind: `Star in ${constellation.name}`, text: constellation.text, dir, constellation });
                }
                return dir;
            });
            constellation.lines.forEach(([a, b]) => {
                linePositions.push(dirs[a].x, dirs[a].y, dirs[a].z, dirs[b].x, dirs[b].y, dirs[b].z);
            });
            const middle = dirs.reduce((sum, dir) => sum.add(dir), new THREE.Vector3()).normalize();
            return { ...constellation, dirs, middle };
        });

        this.astroPlanetIndex = ASTRO_PLANETS.map((planet) => push(new THREE.Vector3(1, 0, 0), planet.color, planet.size, planet.bright, 0.02));
        this.astroCometIndex = positions.length / 3;
        for (let i = 0; i < ASTRO_COMET_POINTS; i++) {
            push(new THREE.Vector3(1, 0, 0), i === 0 ? 0xe4f8ff : 0x9fd8ff, i === 0 ? 5.5 : 3.4 - 2 * i / ASTRO_COMET_POINTS, 0, 0.05);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
        geometry.setAttribute('aBright', new THREE.Float32BufferAttribute(brights, 1));
        geometry.setAttribute('aFlicker', new THREE.Float32BufferAttribute(flickers, 1));
        geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
        this.astroStarUniforms = {
            uFade: { value: 0 },
            uTime: { value: 0 },
            uZoom: { value: 0 },
            uPixelRatio: { value: 1 }
        };
        const material = new THREE.ShaderMaterial({
            uniforms: this.astroStarUniforms,
            vertexShader: ASTRO_VERTEX_SHADER,
            fragmentShader: ASTRO_FRAGMENT_SHADER,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        this.astroStars = new THREE.Points(geometry, material);
        this.astroStars.frustumCulled = false;

        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions.map((v) => v * (ASTRO_RADIUS - 1)), 3));
        this.astroLines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({
            color: 0x8fb4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
        }));
        this.astroLines.frustumCulled = false;
        this.astroLines.visible = false;

        this.astroDome = new THREE.Group();
        this.astroDome.add(this.astroStars);
        this.astroDome.add(this.astroLines);
        this.astroDome.renderOrder = 1;
        this.scene.add(this.astroDome);

        const meteorGeometry = new THREE.BufferGeometry();
        meteorGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
        meteorGeometry.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 0, 0, 0], 3));
        this.astroMeteor = new THREE.Line(meteorGeometry, new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
        }));
        this.astroMeteor.frustumCulled = false;
        this.astroMeteor.visible = false;
        this.scene.add(this.astroMeteor);

        const poleWorld = new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(ASTRO_POLE_ELEVATION)), -Math.cos(THREE.MathUtils.degToRad(ASTRO_POLE_ELEVATION)));
        this.astroTilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), poleWorld);
        this.astroSpin = new THREE.Quaternion();
        this.astroInverse = new THREE.Quaternion();
        this.astroNight = null;
        this.astroBuildHud();
    },

    astroBuildHud() {
        const style = document.createElement('style');
        style.textContent = ASTRO_CSS;
        document.head.appendChild(style);
        this.astroVignette = document.createElement('div');
        this.astroVignette.id = 'astro-vignette';
        this.astroLabel = document.createElement('div');
        this.astroLabel.id = 'astro-label';
        this.astroHud = document.createElement('div');
        this.astroHud.id = 'astro-hud';
        document.body.appendChild(this.astroVignette);
        document.body.appendChild(this.astroLabel);
        document.body.appendChild(this.astroHud);
    },

    // ---- Every frame ----

    astroUpdate(delta) {
        if (!this.scene || !this.camera) return;
        if (!this.astroBuilt) this.astroBuild();

        const worldDay = this.worldDay || 0;
        const timeOfDay = this.timeOfDay || 0;
        const days = worldDay + timeOfDay;
        const night = astroNightIndex(worldDay, timeOfDay);
        if (night !== this.astroNight) this.astroOnNewNight(night);

        // Stars come out once the sun is a little below the horizon; rain hides them.
        const sunHeight = typeof this.sunHeight === 'number' ? this.sunHeight : -1;
        let fade = THREE.MathUtils.clamp((-sunHeight - 0.04) / 0.32, 0, 1);
        if (this.weatherState === 'rain') fade *= 0.1;
        this.astroFade = fade;

        // The sky turns once a day plus a little more, so each night shows it a bit further on.
        const spin = -Math.PI * 2 * days * (28 / 27);
        this.astroSpin.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin);
        this.astroDome.quaternion.copy(this.astroTilt).multiply(this.astroSpin);
        this.astroInverse.copy(this.astroDome.quaternion).invert();
        this.astroDome.position.copy(this.camera.position);
        this.astroDome.visible = fade > 0.002;

        this.astroPlanetTimer = (this.astroPlanetTimer || 0) - delta;
        if (this.astroPlanetTimer <= 0) {
            this.astroPlanetTimer = 1;
            this.astroUpdatePlanets(days);
        }

        const zoom = this.astroUpdateZoom(delta);
        const uniforms = this.astroStarUniforms;
        uniforms.uFade.value = fade;
        uniforms.uTime.value = (uniforms.uTime.value + delta) % 1000;
        uniforms.uZoom.value = zoom;
        uniforms.uPixelRatio.value = this.renderer ? this.renderer.getPixelRatio() : 1;
        this.astroLines.material.opacity = 0.3 * zoom * fade;
        this.astroLines.visible = this.astroLines.material.opacity > 0.01;

        this.astroUpdateMeteor(days, night, fade);
        this.astroUpdateEclipse(night, timeOfDay);
        this.astroUpdateTelescope(delta, zoom);
    },

    astroOnNewNight(night) {
        if (!this.astroStars) return;
        this.astroNight = night;
        this.astroRevealedTonight = false;
        this.astroCometTonight = astroIsCometNight(night) || this.astroForceComet === true;
        const attribute = this.astroStars.geometry.attributes;
        const position = attribute.position;
        const bright = attribute.aBright;
        const head = astroSkyDir(astroHash(night, 1) * 360, 18 + astroHash(night, 2) * 36);
        const angle = astroHash(night, 3) * Math.PI * 2;
        const length = 14;
        this.astroCometDir = head;
        for (let i = 0; i < ASTRO_COMET_POINTS; i++) {
            const index = this.astroCometIndex + i;
            const t = i / ASTRO_COMET_POINTS;
            const spread = (astroHash(i, 7) - 0.5) * t * 3;
            const along = t * length;
            const dir = i === 0 ? head : astroOffsetDir(head,
                Math.cos(angle) * along - Math.sin(angle) * spread,
                Math.sin(angle) * along + Math.cos(angle) * spread);
            position.setXYZ(index, dir.x * ASTRO_RADIUS, dir.y * ASTRO_RADIUS, dir.z * ASTRO_RADIUS);
            bright.setX(index, this.astroCometTonight ? (i === 0 ? 1.9 : 0.95 * Math.pow(1 - t, 1.5)) : 0);
        }
        position.needsUpdate = true;
        bright.needsUpdate = true;
    },

    // The planets ride the ecliptic, a circle tilted 23 degrees from the sky's equator.
    astroPlanetDir(planet, days) {
        const lon = THREE.MathUtils.degToRad(planet.lon) + Math.PI * 2 * days / planet.period;
        const tilt = THREE.MathUtils.degToRad(23);
        return new THREE.Vector3(Math.cos(lon), -Math.sin(lon) * Math.sin(tilt), Math.sin(lon) * Math.cos(tilt));
    },

    astroUpdatePlanets(days) {
        const position = this.astroStars.geometry.attributes.position;
        this.astroPlanetDirs = ASTRO_PLANETS.map((planet, i) => {
            const dir = this.astroPlanetDir(planet, days);
            position.setXYZ(this.astroPlanetIndex[i], dir.x * ASTRO_RADIUS, dir.y * ASTRO_RADIUS, dir.z * ASTRO_RADIUS);
            return dir;
        });
        position.needsUpdate = true;
    },

    // Shooting stars in 5-second slots of the shared clock: same ones for everybody.
    astroUpdateMeteor(days, night, fade) {
        const slotLength = 5 / 240;
        const slot = Math.floor(days / slotLength);
        const chance = this.astroCometTonight ? 0.35 : 0.13;
        const forced = this.astroForcedMeteor && performance.now() < this.astroForcedMeteor.until;
        let progress = -1;
        let seed = slot;
        if (forced) {
            progress = 1 - (this.astroForcedMeteor.until - performance.now()) / 900;
            seed = this.astroForcedMeteor.seed;
        } else if (fade > 0.5 && this.weatherState !== 'rain' && astroHash(slot, 11) < chance) {
            const start = astroHash(slot, 12) * 3.5;
            progress = ((days / slotLength - slot) * 5 - start) / 0.9;
        }
        if (progress < 0 || progress > 1) {
            this.astroMeteor.visible = false;
            return;
        }
        const azimuth = astroHash(seed, 13) * Math.PI * 2;
        const elevation = THREE.MathUtils.degToRad(28 + astroHash(seed, 14) * 40);
        const start = new THREE.Vector3(Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth));
        const heading = azimuth + (astroHash(seed, 15) - 0.5) * 2.4;
        const travel = new THREE.Vector3(Math.cos(heading) * 0.35, -0.22, Math.sin(heading) * 0.35);
        const head = start.clone().addScaledVector(travel, progress).normalize().multiplyScalar(ASTRO_RADIUS - 5);
        const tail = start.clone().addScaledVector(travel, Math.max(0, progress - 0.28)).normalize().multiplyScalar(ASTRO_RADIUS - 5);
        const position = this.astroMeteor.geometry.attributes.position;
        position.setXYZ(0, head.x, head.y, head.z);
        position.setXYZ(1, tail.x, tail.y, tail.z);
        position.needsUpdate = true;
        this.astroMeteor.position.copy(this.camera.position);
        this.astroMeteor.material.opacity = Math.sin(progress * Math.PI) * Math.max(fade, forced ? 1 : 0);
        this.astroMeteor.visible = true;
    },

    // 0 outside an eclipse, rising to 1 at totality. The eclipse is centred on midnight
    // (timeOfDay 0.75), on the full moon, while the moon is high.
    astroEclipseDepth(night, timeOfDay) {
        if (this.astroForceEclipse) return 1;
        const start = 0.75 - ASTRO_ECLIPSE_LENGTH / 2;
        if (!astroIsEclipseNight(night) || timeOfDay < start || timeOfDay > start + ASTRO_ECLIPSE_LENGTH) return 0;
        return Math.sin((timeOfDay - start) / ASTRO_ECLIPSE_LENGTH * Math.PI);
    },

    astroUpdateEclipse(night, timeOfDay) {
        if (!this.moonCube) return;
        const depth = this.astroEclipseDepth(night, timeOfDay);
        this.astroEclipse = depth;
        if (depth <= 0 && !this.astroMoonTinted) return;
        const tint = THREE.MathUtils.smoothstep(depth, 0, 0.8);
        const color = new THREE.Color(0xffffff).lerp(new THREE.Color(0xa3301c), tint);
        this.moonCube.material.forEach((material) => material.color.copy(color));
        this.astroMoonTinted = depth > 0;
    },

    // ---- Telescope ----

    astroToggleTelescope() {
        this.astroZoomed = !this.astroZoomed;
        this.playTone({ frequency: this.astroZoomed ? 660 : 520, duration: 0.06, type: 'triangle', volume: 0.016, release: 0.08 });
        this.placeActionTimer = 0.25;
    },

    // Smooth narrow field of view while the telescope is raised; returns 0..1.
    astroUpdateZoom(delta) {
        if (this.astroZoomed && (this.getSelectedHeldItemType() !== 'telescope' || !this.isGameplayActive() ||
            this.respawnPending || this.cameraViewMode !== 'first')) {
            this.astroZoomed = false;
        }
        const base = this.fovSetting || 75;
        const target = this.astroZoomed ? ASTRO_ZOOM_FOV : base;
        if (!this.astroZoomed && !this.astroFovActive) return 0;
        if (!this.astroFovActive) {
            this.astroFovActive = true;
            this.astroBaseLookSpeed = this.cameraController.lookSpeed;
        }
        const fov = this.camera.fov + (target - this.camera.fov) * Math.min(1, delta * 7);
        const done = !this.astroZoomed && Math.abs(fov - base) < 0.3;
        this.camera.fov = done ? base : fov;
        this.camera.updateProjectionMatrix();
        const zoom = THREE.MathUtils.clamp((base - this.camera.fov) / (base - ASTRO_ZOOM_FOV), 0, 1);
        // Slower mouse look while zoomed, and no giant hand in front of the lens.
        this.cameraController.lookSpeed = this.astroBaseLookSpeed * (this.camera.fov / base);
        const handVisible = zoom < 0.15;
        if (this.firstPersonHand && !handVisible) this.firstPersonHand.visible = false;
        if (this.firstPersonLeftHand && !handVisible) this.firstPersonLeftHand.visible = false;
        if (handVisible && this.astroHandHidden) this.updateFirstPersonHandVisibility();
        this.astroHandHidden = !handVisible;
        if (done) {
            this.astroFovActive = false;
            this.cameraController.lookSpeed = this.astroBaseLookSpeed;
            this.updateFirstPersonHandVisibility();
            this.astroHandHidden = false;
        }
        return done ? 0 : zoom;
    },

    astroMoonPhase() {
        return ((((this.worldDay || 0) % 8) + 8) % 8);
    },

    // What the telescope is aimed at: { name, kind, text, dir (world), id, type } or null.
    astroFindTarget(view) {
        if (view.y < -0.02) return null;
        if (this.sunDirection && (this.daylight || 0) > 0.02 && view.angleTo(this.sunDirection) < THREE.MathUtils.degToRad(7)) {
            return { type: 'sun' };
        }
        if (this.moonCube && this.moonCube.visible) {
            const moonDir = this.moonCube.position.clone().sub(this.camera.position).normalize();
            if (view.angleTo(moonDir) < THREE.MathUtils.degToRad(5)) {
                const phase = this.astroMoonPhase();
                const red = (this.astroEclipse || 0) > 0.05;
                return {
                    type: 'moon', id: 'moon', name: red ? 'The Red Moon' : 'The Moon',
                    kind: red ? 'Lunar eclipse' : ASTRO_MOON_PHASES[phase],
                    text: red
                        ? 'The world\'s shadow is crossing the moon and turning it the colour of rust.'
                        : 'Close enough to count its craters: an eagle would need a week to fly there.',
                    world: moonDir
                };
            }
        }
        if ((this.astroFade || 0) < 0.2) return null;
        const local = view.clone().applyQuaternion(this.astroInverse);
        const toWorld = (dir) => dir.clone().applyQuaternion(this.astroDome.quaternion);
        const within = (dir, degrees) => local.angleTo(dir) < THREE.MathUtils.degToRad(degrees);
        const visible = (dir) => toWorld(dir).y > 0.03;

        if (this.astroCometTonight && within(this.astroCometDir, 5) && visible(this.astroCometDir)) {
            return { type: 'comet', id: 'comet', name: 'The Comet', kind: 'A visitor, tonight only',
                text: 'A ball of ice with a tail millions of blocks long. It comes back every 13 nights.', world: toWorld(this.astroCometDir) };
        }
        for (let i = 0; i < ASTRO_PLANETS.length; i++) {
            const dir = this.astroPlanetDirs && this.astroPlanetDirs[i];
            if (dir && within(dir, 3) && visible(dir)) {
                const planet = ASTRO_PLANETS[i];
                return { type: 'planet', id: planet.id, name: planet.name, kind: 'Wandering planet', text: planet.text, world: toWorld(dir) };
            }
        }
        for (const star of this.astroNamedStars) {
            if (within(star.dir, 2.5) && visible(star.dir)) {
                return { type: 'star', id: star.constellation ? star.constellation.id : 'nail', name: star.name, kind: star.kind,
                    text: star.text, world: toWorld(star.dir), constellation: star.constellation };
            }
        }
        let best = null;
        let bestAngle = THREE.MathUtils.degToRad(9);
        this.astroConstellations.forEach((constellation) => {
            constellation.dirs.forEach((dir) => {
                const angle = local.angleTo(dir);
                if (angle < bestAngle) {
                    bestAngle = angle;
                    best = constellation;
                }
            });
        });
        if (best && visible(best.middle)) {
            return { type: 'constellation', id: best.id, name: best.name, kind: `Constellation, ${best.dirs.length} stars`,
                text: best.text, world: toWorld(best.middle), constellation: best };
        }
        return null;
    },

    astroUpdateTelescope(delta, zoom) {
        const active = zoom > 0.6 && this.astroZoomed;
        this.astroVignette.classList.toggle('visible', zoom > 0.4);
        if (!active) {
            this.astroHud.style.display = 'none';
            this.astroLabel.style.display = 'none';
            this.astroGaze = null;
            return;
        }
        const view = new THREE.Vector3();
        this.camera.getWorldDirection(view);
        const target = this.astroFindTarget(view);
        if (target && target.type === 'sun') {
            this.astroZoomed = false;
            this.receiveSystemMessage({ text: 'Ouch! Never look at the sun through a telescope' });
            return;
        }
        const key = target ? `${target.type}:${target.id}` : null;
        if (!this.astroGaze || this.astroGaze.key !== key) this.astroGaze = { key, time: 0 };
        this.astroGaze.time += delta;
        this.astroObserve(target, this.astroGaze.time);

        const phase = ASTRO_MOON_PHASES[this.astroMoonPhase()];
        const foot = `Moon tonight: ${phase} · ×${Math.round((this.fovSetting || 75) / this.camera.fov)}`;
        if (!target) {
            const hint = (this.astroFade || 0) < 0.2 ? 'Too bright for stars: wait for the night' : 'Aim at a star, a planet or the moon';
            this.astroHud.innerHTML = `<div class="astro-kind">${hint}</div><div class="astro-foot">${foot}</div>`;
            this.astroHud.style.display = 'block';
            this.astroLabel.style.display = 'none';
            return;
        }
        let progress = '';
        const chartable = this.astroChartId(target);
        if (chartable) {
            if (this.astroChartHas(chartable)) {
                progress = '<div class="astro-foot">✓ In your star chart</div>';
            } else if (this.getInventoryCount('star_chart') > 0) {
                const fraction = Math.min(1, this.astroGaze.time / 1.5);
                progress = `<div class="astro-bar"><div style="width:${Math.round(fraction * 100)}%"></div></div>`;
            } else {
                progress = '<div class="astro-foot">Carry a star chart to record it</div>';
            }
        }
        this.astroHud.innerHTML = `<div class="astro-title">${target.name}</div><div class="astro-kind">${target.kind}</div>` +
            `<div class="astro-text">${target.text}</div>${progress}<div class="astro-foot">${foot}</div>`;
        this.astroHud.style.display = 'block';

        const label = target.constellation ? target.constellation.name : target.name;
        const screen = this.camera.position.clone().addScaledVector(target.world, 100).project(this.camera);
        if (screen.z < 1 && Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1) {
            this.astroLabel.textContent = label;
            this.astroLabel.style.left = `${(screen.x + 1) * 50}%`;
            this.astroLabel.style.top = `${(1 - screen.y) * 50}%`;
            this.astroLabel.style.display = 'block';
        } else {
            this.astroLabel.style.display = 'none';
        }
    },

    // Chart entries: constellations, planets, the comet and the red moon.
    astroChartId(target) {
        if (!target) return null;
        if (target.type === 'constellation' || (target.type === 'star' && target.constellation)) return target.constellation.id;
        if (target.type === 'planet' || target.type === 'comet') return target.id;
        if (target.type === 'moon' && (this.astroEclipse || 0) > 0.6) return 'eclipse';
        return null;
    },

    astroObserve(target, time) {
        const rare = target && (target.type === 'comet' || (target.type === 'moon' && (this.astroEclipse || 0) > 0.6));
        if (rare && time > 2 && !this.astroRevealedTonight) {
            this.astroRevealedTonight = true;
            const text = target.type === 'comet'
                ? `Through the eyepiece, letters glow in the comet's tail: ${ASTRO_SECRET_CODE}`
                : `Across the red moon, the shadow spells: ${ASTRO_SECRET_CODE}`;
            setTimeout(() => this.receiveSystemMessage({ text }), 600);
            [523, 659, 784, 1046].forEach((frequency, index) => {
                setTimeout(() => this.playTone({ frequency, duration: 0.18, type: 'sine', volume: 0.02, attack: 0.01, release: 0.4 }), index * 140);
            });
        }
        const id = this.astroChartId(target);
        if (!id || time < 1.5 || this.astroChartHas(id) || this.getInventoryCount('star_chart') <= 0) return;
        this.astroChart[id] = this.worldDay || 0;
        this.astroSaveChart();
        const count = ASTRO_CONSTELLATIONS.filter((constellation) => this.astroChart[constellation.id] !== undefined).length;
        const constellation = ASTRO_CONSTELLATIONS.find((entry) => entry.id === id);
        const text = constellation
            ? `Charted ${constellation.name} (${count} / ${ASTRO_CONSTELLATIONS.length} constellations)`
            : `Charted ${target.name}`;
        this.receiveSystemMessage({ text });
        if (constellation && count === ASTRO_CONSTELLATIONS.length) {
            setTimeout(() => this.receiveSystemMessage({ text: 'Your star chart is complete: every constellation is drawn' }), 1200);
        }
        [784, 988].forEach((frequency, index) => {
            setTimeout(() => this.playTone({ frequency, duration: 0.12, type: 'sine', volume: 0.018, release: 0.25 }), index * 100);
        });
    },

    // ---- Star chart ----

    astroLoadChart() {
        this.astroChart = {};
        try {
            const saved = JSON.parse(window.localStorage.getItem(ASTRO_CHART_KEY) || '{}');
            if (saved && typeof saved === 'object') this.astroChart = saved;
        } catch (_error) {
            this.astroChart = {};
        }
    },

    astroSaveChart() {
        try {
            window.localStorage.setItem(ASTRO_CHART_KEY, JSON.stringify(this.astroChart));
        } catch (_error) {
            // Storage blocked: the chart lasts until the page reloads.
        }
    },

    astroChartHas(id) {
        return Boolean(this.astroChart) && this.astroChart[id] !== undefined;
    },

    astroBuildChartPanel() {
        const panel = document.createElement('div');
        panel.id = 'astro-chart';
        panel.addEventListener('mousedown', (event) => event.stopPropagation());
        panel.addEventListener('pointerdown', (event) => event.stopPropagation());
        panel.addEventListener('click', (event) => {
            if (event.target && event.target.classList.contains('astro-close')) this.astroChartClose();
        });
        document.body.appendChild(panel);
        this.astroChartPanel = panel;
        document.addEventListener('mousedown', () => { if (this.astroChartOpen) this.astroChartClose(); });
        window.addEventListener('keydown', (event) => {
            if (!this.astroChartOpen) return;
            if (event.code === 'Escape' && !event.repeat) this.astroChartClose();
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);
    },

    astroChartShow() {
        if (this.astroChartOpen) return;
        if (!this.astroChartPanel) this.astroBuildChartPanel();
        this.astroZoomed = false;
        this.astroChartOpen = true;
        this.stopMining();
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.astroChartRender();
        this.astroChartPanel.classList.add('visible');
        this.updatePointerLockHint();
        this.playNoiseBurst({ duration: 0.18, volume: 0.016, highpass: 1200, lowpass: 5000 });
    },

    astroChartClose() {
        if (!this.astroChartOpen) return;
        this.astroChartOpen = false;
        this.astroChartPanel.classList.remove('visible');
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        this.recapturePointerLock();
        this.updatePointerLockHint();
    },

    astroChartRender() {
        const charted = ASTRO_CONSTELLATIONS.filter((constellation) => this.astroChartHas(constellation.id));
        const night = astroNightIndex(this.worldDay || 0, this.timeOfDay || 0);
        const cards = ASTRO_CONSTELLATIONS.map((constellation) => {
            const known = this.astroChartHas(constellation.id);
            return `<div class="astro-card${known ? '' : ' unknown'}"><canvas width="140" height="110" data-id="${constellation.id}"></canvas>` +
                `<div>${known ? `<b>${constellation.name}</b>` : '???'}</div></div>`;
        }).join('');
        const sights = [
            ...ASTRO_PLANETS.map((planet) => this.astroChartHas(planet.id) ? `${planet.name}: ${planet.text}` : 'An unknown wanderer'),
            this.astroChartHas('comet') ? `The Comet: it returns every ${ASTRO_COMET_EVERY} nights; next in ${astroNightsUntil(night + 1, ASTRO_COMET_EVERY, ASTRO_COMET_NIGHT) + 1} nights` : 'A visitor with a long tail: not seen yet',
            this.astroChartHas('eclipse') ? `The Red Moon: every ${ASTRO_ECLIPSE_EVERY} nights, after midnight; next in ${astroNightsUntil(night + 1, ASTRO_ECLIPSE_EVERY, ASTRO_ECLIPSE_NIGHT) + 1} nights` : 'A moon the colour of rust: not seen yet'
        ].map((line) => `<li>${line}</li>`).join('');
        this.astroChartPanel.innerHTML = `
            <div class="astro-chart-head">
                <h3>Star chart</h3>
                <div><b>${charted.length}</b> / ${ASTRO_CONSTELLATIONS.length} constellations</div>
                <button class="astro-close" type="button">Close</button>
            </div>
            <div class="astro-grid">${cards}</div>
            <h4>Wanderers and rare sights</h4>
            <ul>${sights}</ul>
            <div class="astro-note">Tonight: ${ASTRO_MOON_PHASES[this.astroMoonPhase()]}. Raise a telescope (right click) and hold a
            constellation in view for a moment to chart it. Guide: /guide 132</div>`;
        this.astroChartPanel.querySelectorAll('canvas').forEach((canvas) => {
            const constellation = ASTRO_CONSTELLATIONS.find((entry) => entry.id === canvas.dataset.id);
            this.astroDrawConstellation(canvas, constellation, this.astroChartHas(constellation.id));
        });
    },

    astroDrawConstellation(canvas, constellation, known) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0b1126';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const xs = constellation.stars.map((star) => star[0]);
        const ys = constellation.stars.map((star) => star[1]);
        const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 4);
        const scale = (Math.min(canvas.width, canvas.height) - 24) / span;
        const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
        const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
        // East is drawn to the left, as on a real sky map seen from below.
        const point = ([x, y]) => [canvas.width / 2 - (x - cx) * scale, canvas.height / 2 - (y - cy) * scale];
        if (known) {
            ctx.strokeStyle = 'rgba(143,180,255,0.55)';
            ctx.lineWidth = 1;
            constellation.lines.forEach(([a, b]) => {
                const [ax, ay] = point(constellation.stars[a]);
                const [bx, by] = point(constellation.stars[b]);
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(bx, by);
                ctx.stroke();
            });
        }
        constellation.stars.forEach((star) => {
            const [x, y] = point(star);
            ctx.fillStyle = known ? (star[4] ? `#${star[4].toString(16).padStart(6, '0')}` : '#f2f5ff') : '#3a4670';
            ctx.beginPath();
            ctx.arc(x, y, known ? 1.2 + star[2] * 1.4 : 1.5, 0, Math.PI * 2);
            ctx.fill();
            if (known && star[3]) {
                ctx.fillStyle = '#9fb6e6';
                ctx.font = '9px sans-serif';
                ctx.fillText(star[3], x + 4, y - 3);
            }
        });
    },

    // ---- Creative preview ----

    astroSkyCommand(argument) {
        const night = astroNightIndex(this.worldDay || 0, this.timeOfDay || 0);
        if (argument === 'comet') {
            this.astroForceComet = !this.astroForceComet;
            this.astroOnNewNight(night);
            this.receiveSystemMessage({ text: `Comet preview ${this.astroForceComet ? 'on' : 'off'} (only in this browser)` });
        } else if (argument === 'eclipse') {
            this.astroForceEclipse = !this.astroForceEclipse;
            this.receiveSystemMessage({ text: `Red moon preview ${this.astroForceEclipse ? 'on' : 'off'} (only in this browser)` });
        } else if (argument === 'meteor') {
            this.astroForcedMeteor = { until: performance.now() + 900, seed: Math.floor(Math.random() * 100000) };
        } else if (argument === 'off') {
            this.astroForceComet = false;
            this.astroForceEclipse = false;
            this.astroOnNewNight(night);
            this.receiveSystemMessage({ text: 'Sky previews off' });
        } else {
            const comet = astroNightsUntil(night, ASTRO_COMET_EVERY, ASTRO_COMET_NIGHT);
            const eclipse = astroNightsUntil(night, ASTRO_ECLIPSE_EVERY, ASTRO_ECLIPSE_NIGHT);
            this.receiveSystemMessage({
                text: `Night ${night}, ${ASTRO_MOON_PHASES[this.astroMoonPhase()]}. Comet ${comet === 0 ? 'tonight' : `in ${comet} nights`}, ` +
                    `red moon ${eclipse === 0 ? 'tonight' : `in ${eclipse} nights`}. /sky comet|eclipse|meteor|off`
            });
        }
    }
});
