// The game's picture painter, run in a page without the game: mob portraits and item icons drawn by the
// game's own code, for the printable guide (guide-print.html, js/guidePrint.js) and for the pictures of the
// guide's web pages (tools/guidePictures.js, which saves them as files in guide/pic/).
//
// The page that loads this has already loaded Three.js and set up a stub `class Game {}`; guideEngineLoad
// then loads the scripts index.html loads (except game.js, the network and the book), builds a WorldRenderer
// for the item icons and uses the bestiary's portrait stage for the mobs. index.html never loads this file.
// Global names with the guideEngine prefix, since the game's scripts it loads share the same namespace.

// Scripts of index.html that the painter must not run.
const GUIDE_ENGINE_SKIP_SCRIPTS = /(^|\/)(game|websocket|voice|guideMarkdown|guidePrint)\.js$|(^|\/)game\/guide\.js$/;
// If index.html cannot be read: what the icons and portraits need at the very least.
const GUIDE_ENGINE_FALLBACK_SCRIPTS = ['js/extensions.js', 'js/camera.js', 'js/chunkStore.js', 'js/blockShapes.js', 'js/chunkMesher.js',
    'js/models.js', 'js/mobSpecies.js', 'js/blockTextures.js', 'js/world.js', 'js/game/resources.js', 'js/game/bestiary.js', 'js/game/microbes.js'];

// Loads the game's scripts (as index.html lists them) one after the other. A script that
// fails is skipped: only its pictures will be missing.
async function guideEngineLoad() {
    if (typeof THREE === 'undefined') return null;
    let sources = null;
    try {
        const response = await fetch('index.html', { cache: 'no-cache' });
        if (response.ok) {
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            sources = [...doc.querySelectorAll('script[src]')].map((script) => script.getAttribute('src'));
        }
    } catch (_error) {
        sources = null;
    }
    sources = (sources || []).filter((src) => !/^(https?:)?\/\//.test(src) && !GUIDE_ENGINE_SKIP_SCRIPTS.test(src));
    if (!sources.length) sources = GUIDE_ENGINE_FALLBACK_SCRIPTS;
    for (const src of sources) {
        await new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => { console.warn('[guide-engine] could not load', src); resolve(); };
            document.head.appendChild(script);
        });
    }

    const engine = { world: null, portraits: null };
    try {
        if (typeof WorldRenderer === 'function') {
            engine.world = new WorldRenderer(new THREE.Scene());
            // No terrain here: the chunk decoder worker is not needed.
            if (engine.world.chunkDecoder) engine.world.chunkDecoder.terminate();
        }
    } catch (error) {
        console.warn('[guide-engine] no item icons:', error);
        engine.world = null;
    }
    try {
        if (typeof Game === 'function' && typeof Game.prototype.bestiaryRenderPortrait === 'function') {
            engine.portraits = Object.create(Game.prototype);
            engine.portraits.bestiaryTextureCache = new Map();
        }
    } catch (error) {
        console.warn('[guide-engine] no mob portraits:', error);
    }
    return engine;
}

// The data URL of `mob:species` / `item:type`, or null when it cannot be drawn.
function guideEngineDraw(engine, kind, name) {
    if (!engine) return null;
    try {
        if (kind === 'item') {
            return engine.world && engine.world.blockTypes[name] ? engine.world.getInventoryIconUrl(name) : null;
        }
        if (kind === 'model') {
            // What has a model and is not a species (the robot): the game builds it, `<name>PortraitModel`
            // (robotPortraitModel in js/game/robot.js), and the bestiary's stage draws it like a portrait.
            const portraits = engine.portraits;
            const build = portraits && portraits[`${name}PortraitModel`];
            return typeof build === 'function' && typeof portraits.bestiaryRenderObject === 'function'
                ? portraits.bestiaryRenderObject(build.call(portraits)) : null;
        }
        return engine.portraits ? engine.portraits.bestiaryRenderPortrait(name) : null;
    } catch (error) {
        console.warn(`[guide-engine] could not draw ${kind}:${name}`, error);
        return null;
    }
}

// Node (the tests, tools/guidePictures.js) reads the lists; js/guidePrint.js re-exports the skipped scripts.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GUIDE_ENGINE_SKIP_SCRIPTS, GUIDE_ENGINE_FALLBACK_SCRIPTS };
}
