// Writes pkg/web/static/guide/pic/mob_<id>.png and item_<id>.png: the mob portraits and item icons that the
// public topics of the guide show (`![](mob:sheep)`, `![](item:torch)`), drawn once by the game's own engine,
// for the guide's web pages (pkg/web/book.go), which have no script and cannot draw them. The game's book and
// the printable guide keep drawing theirs live.
//     node tools/guidePictures.js                         every picture
//     node tools/guidePictures.js --missing               only those with no file yet (a new topic)
//     node tools/guidePictures.js --only mob:sheep,item:torch   those
// It needs Google Chrome (`google-chrome`, or the program named by the CHROME environment variable) and the
// network for one thing: Three.js, from the address index.html names. test/js/guide_pictures.test.js fails
// while a picture a public topic asks for has no file.
//
// How it works:
// - What to draw: every `mob:` and `item:` picture of the public topics (a numeric id: pkg/web/guide.go), in
//   both languages. What only a secret topic shows is never drawn.
// - It serves pkg/web/static/ on a free port of 127.0.0.1 (never the game's server), plus a page of its own
//   (PICTURES_PAGE) that loads Three.js as index.html does, js/guideEngine.js (the printable guide's painter:
//   the game's scripts over a stub Game) and guidePicturesDraw, which draws a list of pictures and gives back
//   their PNG data URLs.
// - It starts Chrome headless with a throwaway profile and --remote-debugging-port=0, talks to it over the
//   DevTools protocol (Node's own WebSocket, no dependency), and asks for the pictures a few at a time. Chrome
//   runs in a process group of its own, which is ended, and the profile deleted, however the tool ends.
// - Nobody looks at the result, so each picture is judged by numbers (judgePicture): the size the game draws
//   (64 for an item, 200 for a mob), at least 1 % of its pixels painted, not all one colour (nor, for a mob,
//   a shape of one flat colour), and no two mobs with the same pixels (a stage that was not cleared). A refused picture is not written.
// - A file is the bytes Chrome gave. One whose pixels did not change is not rewritten (another Chrome may
//   compress the same picture otherwise), and a file that no public topic asks for any more is removed.
// - It prints how many pictures of each kind, their bytes, the smallest, median and largest share of painted
//   pixels, the five emptiest of each kind and every picture it could not draw with the reason, and exits 1
//   if any picture is missing or refused.

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pngDecode } = require('./png.js');

const ROOT = path.join(__dirname, '..');
const STATIC_DIR = path.join(ROOT, 'pkg', 'web', 'static');
const GUIDE_DIR = path.join(STATIC_DIR, 'guide');
const PICTURES_DIR = path.join(GUIDE_DIR, 'pic');
// The page of this tool, served next to the game's files (it is not one of them).
const PICTURES_PAGE = '/__guide_pictures__.html';
// The size each kind is drawn at: getInventoryIconUrl (js/world.js) and BESTIARY_PORTRAIT_SIZE
// (js/game/bestiary.js).
const PICTURES_SIZE = { item: 64, mob: 200 };
// A picture with fewer painted pixels than this share is blank; a pixel is painted when it is not transparent.
const PICTURES_MIN_PAINTED = 0.01;
const PICTURES_PAINTED_ALPHA = 8;
// How many pictures one evaluation in the browser draws and sends back.
const PICTURES_BATCH = 16;
// What all the pictures may weigh, and the mobs alone (beyond it, ask before shrinking them).
const PICTURES_BUDGET = 5 * 1024 * 1024;
const PICTURES_MOB_BUDGET = 2.5 * 1024 * 1024;

// The file names of the guide's topics (pkg/web/guide.go): a public topic has a numeric id.
const PICTURES_TOPIC_FILE = /^([0-9A-Z]{1,8})_(EN|ES)_(.+)\.md$/;
// A picture of the engine in the Markdown: `![alt](mob:sheep)`, `![alt](item:torch "title")`.
const PICTURES_REFERENCE = /!\[[^\]]*\]\(((?:mob|item):[a-z0-9_]+)(?=[\s)])/g;
// A file of this tool in guide/pic/.
const PICTURES_FILE = /^(mob|item)_([a-z0-9_]+)\.png$/;

// Whether a file of static/guide is a public topic (a numeric id), as ListGuideTopics says.
function isPublicTopicFile(name) {
    const match = PICTURES_TOPIC_FILE.exec(name);
    return Boolean(match) && /^[0-9]+$/.test(match[1]);
}

// The `mob:` and `item:` pictures one topic's Markdown shows, in order of appearance, without repeats.
function referencesOf(markdown) {
    const found = new Set();
    for (const match of String(markdown).matchAll(PICTURES_REFERENCE)) found.add(match[1]);
    return [...found];
}

// Every picture the public topics of a guide folder show, sorted, each with the topics that show it.
function collectReferences(guideDir = GUIDE_DIR) {
    const topics = new Map();
    for (const name of fs.readdirSync(guideDir).sort()) {
        if (!isPublicTopicFile(name)) continue;
        for (const ref of referencesOf(fs.readFileSync(path.join(guideDir, name), 'utf8'))) {
            if (!topics.has(ref)) topics.set(ref, []);
            topics.get(ref).push(name);
        }
    }
    return new Map([...topics.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

// `mob:sheep` -> 'mob_sheep.png' (and back, pictureRefOf), or null for what is not a picture of the engine.
function pictureFileName(ref) {
    const match = /^(mob|item):([a-z0-9_]+)$/.exec(ref);
    return match ? `${match[1]}_${match[2]}.png` : null;
}

function pictureRefOf(fileName) {
    const match = PICTURES_FILE.exec(fileName);
    return match ? `${match[1]}:${match[2]}` : null;
}

// The numbers of a picture: its size, the share of painted pixels, how many colours it has, and its painted
// pixels alone (each counted up to a few), and a digest of its pixels. Never throws: a file that cannot be read says so in `error`.
function measurePicture(bytes) {
    let image;
    try {
        image = pngDecode(Buffer.from(bytes));
    } catch (error) {
        return { error: `not a PNG that can be read (${error.message})` };
    }
    const { width, height, rgba } = image;
    let painted = 0;
    const colours = new Set();
    const paintColours = new Set();
    for (let i = 0; i < width * height; i++) {
        const o = i * 4;
        const colour = rgba[o + 3] === 0 ? 0 : ((rgba[o] << 24) | (rgba[o + 1] << 16) | (rgba[o + 2] << 8) | rgba[o + 3]) >>> 0;
        if (colours.size < 4) colours.add(colour);
        if (rgba[o + 3] < PICTURES_PAINTED_ALPHA) continue;
        painted++;
        if (paintColours.size < 4) paintColours.add(colour);
    }
    const digest = crypto.createHash('sha1').update(`${width}x${height}:`).update(rgba).digest('hex');
    return { width, height, painted: painted / (width * height), colours: colours.size, paintColours: paintColours.size, digest };
}

// Whether a picture of a kind ('mob', 'item') is good enough to show: null when it is, else the reason.
function judgePicture(kind, measure) {
    if (measure.error) return measure.error;
    const size = PICTURES_SIZE[kind];
    if (measure.width !== size || measure.height !== size) return `${measure.width}x${measure.height}, not ${size}x${size}`;
    if (measure.painted < PICTURES_MIN_PAINTED) return `blank: ${(measure.painted * 100).toFixed(2)} % of its pixels painted`;
    if (measure.colours < 2) return 'all one colour';
    // A model on the lit stage is always shaded; one flat colour is a stage without light. (An item may be
    // one flat colour: the spray paint's icon is a pink blot.)
    if (kind === 'mob' && measure.paintColours < 2) return 'a shape of one flat colour';
    return null;
}

// ---------------------------------------------------------------- the browser's side

// The tool's page: Three.js as index.html loads it, the painter, and the function the tool calls.
function picturesPageHtml(threeUrl) {
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>Guide pictures</title></head>
<body>
<script src="${threeUrl}"></script>
<script src="js/guideMarkdown.js"></script>
<script>
    // As guide-print.html: the game's scripts mix their methods into Game.prototype; here there is no game.
    class Game {}
</script>
<script src="js/guideEngine.js"></script>
<script>
    let guidePicturesEngine = null;
    // Loads the painter once; says what it has (and whether WebGL started, which the mobs need).
    async function guidePicturesStart() {
        if (typeof THREE === 'undefined') return { three: false };
        guidePicturesEngine = await guideEngineLoad();
        const engine = guidePicturesEngine || {};
        let webgl = false;
        try {
            const stage = engine.portraits && engine.portraits.bestiaryStage();
            webgl = Boolean(stage && !stage.failed && stage.renderer.getContext());
        } catch (_error) {
            webgl = false;
        }
        return { three: true, world: Boolean(engine.world), portraits: Boolean(engine.portraits), webgl };
    }
    // Draws each picture ('mob:sheep'): its data URL, or null and what the painter said about it.
    function guidePicturesDraw(refs) {
        return refs.map((ref) => {
            const said = [];
            const warn = console.warn;
            console.warn = (...args) => { said.push(args.map((arg) => (arg && arg.message) || String(arg)).join(' ')); };
            let url = null;
            try {
                const [kind, name] = ref.split(':');
                if (kind === 'mob' && guidePicturesEngine && guidePicturesEngine.portraits && typeof getMobSpecies === 'function'
                    && !getMobSpecies(name) && !guidePicturesEngine.portraits.bestiaryOrganism(name)) {
                    said.push('no such species or organism');
                } else if (kind === 'item' && guidePicturesEngine && guidePicturesEngine.world && !guidePicturesEngine.world.blockTypes[name]) {
                    said.push('no such item or block');
                } else {
                    url = guideEngineDraw(guidePicturesEngine, kind, name);
                }
            } catch (error) {
                said.push(String(error && error.message || error));
            } finally {
                console.warn = warn;
            }
            return { ref, url: typeof url === 'string' && url.startsWith('data:image/png;base64,') ? url : null, said: said.join('; ').slice(0, 300) };
        });
    }
</script>
</body></html>
`;
}

// ---------------------------------------------------------------- the files server

const PICTURES_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
    '.css': 'text/css', '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8',
    '.woff2': 'font/woff2', '.wasm': 'application/wasm' };

// Serves pkg/web/static/ and the tool's page on 127.0.0.1, on a port the system gives.
function startServer(pageHtml) {
    const server = http.createServer((request, response) => {
        const address = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (address === PICTURES_PAGE) {
            response.writeHead(200, { 'Content-Type': PICTURES_TYPES['.html'] });
            response.end(pageHtml);
            return;
        }
        const file = path.join(STATIC_DIR, path.normalize(address === '/' ? '/index.html' : address));
        if (!file.startsWith(STATIC_DIR + path.sep)) {
            response.writeHead(403);
            response.end();
            return;
        }
        fs.readFile(file, (error, data) => {
            if (error) {
                response.writeHead(404);
                response.end();
                return;
            }
            response.writeHead(200, { 'Content-Type': PICTURES_TYPES[path.extname(file)] || 'application/octet-stream' });
            response.end(data);
        });
    });
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

// ---------------------------------------------------------------- Chrome

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Starts headless Chrome (software WebGL) in a process group of its own; `close` ends that group and deletes
// the profile, and is safe to call more than once.
async function startChrome() {
    const program = process.env.CHROME || 'google-chrome';
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'minecloud-guide-pictures-'));
    const chrome = spawn(program, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
        '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-component-update',
        '--mute-audio', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio: 'ignore', detached: true });
    let exited = false;
    chrome.on('exit', () => { exited = true; });
    let spawnError = null;
    chrome.on('error', (error) => { spawnError = error; });
    let closed = false;
    const close = async () => {
        if (closed) return;
        closed = true;
        for (const [signal, wait] of [['SIGTERM', 3000], ['SIGKILL', 2000]]) {
            if (exited || !chrome.pid) break;
            try { process.kill(-chrome.pid, signal); } catch (_error) { /* already gone */ }
            for (let waited = 0; waited < wait && !exited; waited += 100) await sleep(100);
        }
        // Chrome's helpers may outlive their parent for a moment: the group goes too.
        if (chrome.pid) try { process.kill(-chrome.pid, 'SIGKILL'); } catch (_error) { /* none left */ }
        fs.rmSync(profile, { recursive: true, force: true });
    };
    // Chrome writes its port in the profile (with --remote-debugging-port=0 it picks a free one).
    let endpoint = null;
    for (let i = 0; i < 150 && !endpoint && !exited && !spawnError; i++) {
        await sleep(100);
        try {
            const [port, socketPath] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split('\n');
            if (port && socketPath) endpoint = `ws://127.0.0.1:${port}${socketPath}`;
        } catch (_error) { /* not up yet */ }
    }
    if (!endpoint) {
        await close();
        throw new Error(spawnError ? `could not start ${program}: ${spawnError.message}` : `${program} did not start in 15 s`);
    }
    return { endpoint, close, pid: chrome.pid, profile };
}

// A DevTools connection: `send` a command (to a session), with a time limit so nothing waits for ever.
async function connect(endpoint) {
    const socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error('no DevTools connection')); });
    let nextId = 1;
    const waiting = new Map();
    const heard = [];
    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id && waiting.has(message.id)) {
            const { resolve, reject } = waiting.get(message.id);
            waiting.delete(message.id);
            if (message.error) reject(new Error(message.error.message));
            else resolve(message.result);
        } else if (message.method === 'Runtime.exceptionThrown') {
            const details = message.params.exceptionDetails;
            heard.push(`${details.exception ? details.exception.description : details.text} (${details.url || ''}:${details.lineNumber})`.slice(0, 300));
        }
    };
    const send = (method, params = {}, sessionId = undefined, seconds = 60) => new Promise((resolve, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`no answer to ${method} in ${seconds} s`)); }, seconds * 1000);
        waiting.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
        socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
    return { send, heard, close: () => { try { socket.close(); } catch (_error) { /* closing anyway */ } } };
}

// Opens the tool's page in a new tab and gives a function that evaluates an expression there (awaiting it).
async function openPage(devtools, url) {
    const { targetId } = await devtools.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true });
    await devtools.send('Runtime.enable', {}, sessionId);
    await devtools.send('Page.enable', {}, sessionId);
    await devtools.send('Page.navigate', { url }, sessionId);
    const evaluate = async (expression, seconds = 120) => {
        const result = await devtools.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId, seconds);
        if (result.exceptionDetails) {
            const details = result.exceptionDetails;
            throw new Error(`${expression.slice(0, 60)}: ${details.exception ? details.exception.description : details.text}`);
        }
        return result.result.value;
    };
    for (let i = 0; i < 120; i++) {
        if (await evaluate(`document.readyState === 'complete' && typeof guidePicturesDraw === 'function'`, 10)) return evaluate;
        await sleep(250);
    }
    throw new Error('the page of the pictures did not load in 30 s');
}

// ---------------------------------------------------------------- the run

function parseArgs(argv) {
    const options = { missing: false, only: null };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--missing') options.missing = true;
        else if (argv[i] === '--only' && argv[i + 1]) options.only = argv[++i].split(',').map((ref) => ref.trim()).filter(Boolean);
        else if (argv[i].startsWith('--only=')) options.only = argv[i].slice(7).split(',').map((ref) => ref.trim()).filter(Boolean);
        else throw new Error(`unknown argument ${argv[i]} (use --missing or --only mob:sheep,item:torch)`);
    }
    return options;
}

const percent = (share) => `${(share * 100).toFixed(1)} %`;
const kilobytes = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

// The summary of the pictures on disk that the topics ask for, by kind; returns the problems it found.
function report(references, refused, failed) {
    const problems = [];
    const byKind = { mob: [], item: [] };
    const mobDigests = new Map();
    for (const ref of references.keys()) {
        const kind = ref.split(':')[0];
        const file = path.join(PICTURES_DIR, pictureFileName(ref));
        if (!fs.existsSync(file)) {
            if (!refused.has(ref) && !failed.has(ref)) problems.push(`${ref}: no file`);
            continue;
        }
        const bytes = fs.readFileSync(file);
        const measure = measurePicture(bytes);
        const reason = judgePicture(kind, measure);
        if (reason) problems.push(`${ref}: the file on disk is refused: ${reason}`);
        if (kind === 'mob' && measure.digest) {
            if (mobDigests.has(measure.digest)) problems.push(`${ref}: the same pixels as ${mobDigests.get(measure.digest)}`);
            else mobDigests.set(measure.digest, ref);
        }
        byKind[kind].push({ ref, bytes: bytes.length, painted: measure.painted || 0 });
    }
    let total = 0;
    for (const kind of ['mob', 'item']) {
        const list = byKind[kind];
        const bytes = list.reduce((sum, entry) => sum + entry.bytes, 0);
        total += bytes;
        const shares = list.map((entry) => entry.painted).sort((a, b) => a - b);
        console.log(`${kind}s: ${list.length} files, ${kilobytes(bytes)}, mean ${kilobytes(list.length ? bytes / list.length : 0)}` +
            (shares.length ? `; painted: smallest ${percent(shares[0])}, median ${percent(shares[Math.floor(shares.length / 2)])}, largest ${percent(shares[shares.length - 1])}` : ''));
        const emptiest = list.slice().sort((a, b) => a.painted - b.painted).slice(0, 5);
        if (emptiest.length) console.log(`  emptiest: ${emptiest.map((entry) => `${entry.ref} ${percent(entry.painted)}`).join(', ')}`);
        if (kind === 'mob' && bytes > PICTURES_MOB_BUDGET) console.log(`  the mobs weigh ${kilobytes(bytes)}, over the ${kilobytes(PICTURES_MOB_BUDGET)} meant for them`);
    }
    console.log(`total: ${kilobytes(total)} of a budget of ${kilobytes(PICTURES_BUDGET)}`);
    if (total > PICTURES_BUDGET) problems.push(`the pictures weigh ${kilobytes(total)}, over the budget`);
    for (const [ref, reason] of failed) problems.push(`${ref}: could not be drawn: ${reason}`);
    for (const [ref, reason] of refused) problems.push(`${ref}: refused: ${reason}`);
    return problems;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const started = Date.now();
    const references = collectReferences();
    fs.mkdirSync(PICTURES_DIR, { recursive: true });
    let wanted = [...references.keys()];
    if (options.only) {
        const unknown = options.only.filter((ref) => !references.has(ref));
        if (unknown.length) throw new Error(`no public topic shows ${unknown.join(', ')}`);
        wanted = options.only;
    } else if (options.missing) {
        wanted = wanted.filter((ref) => !fs.existsSync(path.join(PICTURES_DIR, pictureFileName(ref))));
    }
    console.log(`${references.size} pictures in the public topics (${[...references.keys()].filter((ref) => ref.startsWith('mob:')).length} mobs); drawing ${wanted.length}`);

    const refused = new Map();
    const failed = new Map();
    let written = 0;
    let unchanged = 0;
    if (wanted.length) {
        const index = fs.readFileSync(path.join(STATIC_DIR, 'index.html'), 'utf8');
        const three = /<script src="(https:\/\/[^"]*three[^"]*\.js)"><\/script>/.exec(index);
        if (!three) throw new Error('index.html names no Three.js');
        let server = null;
        let chrome = null;
        let devtools = null;
        const cleanUp = async () => {
            if (devtools) devtools.close();
            if (chrome) await chrome.close();
            if (server) server.close();
        };
        const onSignal = (signal) => {
            console.error(`\n${signal}: ending Chrome`);
            cleanUp().finally(() => process.exit(130));
        };
        process.once('SIGINT', onSignal);
        process.once('SIGTERM', onSignal);
        try {
            server = await startServer(picturesPageHtml(three[1]));
            chrome = await startChrome();
            devtools = await connect(chrome.endpoint);
            const evaluate = await openPage(devtools, `http://127.0.0.1:${server.address().port}${PICTURES_PAGE}`);
            const engine = await evaluate('guidePicturesStart()', 300);
            console.log(`painter: Three.js ${engine.three ? 'loaded' : 'NOT LOADED'}, item icons ${engine.world ? 'yes' : 'NO'}, ` +
                `mob portraits ${engine.portraits ? 'yes' : 'NO'}, WebGL ${engine.webgl ? 'started' : 'COULD NOT START'}`);
            if (!engine.three) throw new Error('Three.js did not load (it comes from the network)');
            if (devtools.heard.length) console.log(`errors in the page while loading the game's scripts:\n  ${devtools.heard.slice(0, 10).join('\n  ')}`);
            const mobDigests = new Map();
            // Mobs not drawn now keep their files: a new one must not repeat their pixels either.
            for (const ref of references.keys()) {
                const file = path.join(PICTURES_DIR, pictureFileName(ref));
                if (ref.startsWith('mob:') && !wanted.includes(ref) && fs.existsSync(file)) {
                    const measure = measurePicture(fs.readFileSync(file));
                    if (measure.digest) mobDigests.set(measure.digest, ref);
                }
            }
            for (let i = 0; i < wanted.length; i += PICTURES_BATCH) {
                const batch = wanted.slice(i, i + PICTURES_BATCH);
                const results = await evaluate(`guidePicturesDraw(${JSON.stringify(batch)})`, 300);
                for (const { ref, url, said } of results) {
                    const kind = ref.split(':')[0];
                    if (!url) {
                        let reason = said || 'the painter gave nothing';
                        if (kind === 'mob' && !engine.webgl && !said) reason = 'WebGL could not start';
                        failed.set(ref, reason);
                        continue;
                    }
                    const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
                    const measure = measurePicture(bytes);
                    let reason = judgePicture(kind, measure);
                    if (!reason && kind === 'mob') {
                        const twin = mobDigests.get(measure.digest);
                        if (twin) {
                            reason = `the same pixels as ${twin}`;
                            refused.set(twin, `the same pixels as ${ref}`);
                        } else {
                            mobDigests.set(measure.digest, ref);
                        }
                    }
                    if (reason) {
                        refused.set(ref, reason);
                        continue;
                    }
                    const file = path.join(PICTURES_DIR, pictureFileName(ref));
                    if (fs.existsSync(file) && measurePicture(fs.readFileSync(file)).digest === measure.digest) {
                        unchanged++;
                        continue;
                    }
                    fs.writeFileSync(file, bytes);
                    written++;
                }
                process.stdout.write(`\rdrawn ${Math.min(i + PICTURES_BATCH, wanted.length)} of ${wanted.length}`);
            }
            process.stdout.write('\n');
        } finally {
            await cleanUp();
            process.removeListener('SIGINT', onSignal);
            process.removeListener('SIGTERM', onSignal);
        }
    }

    // What no public topic asks for any more goes.
    let removed = 0;
    for (const name of fs.readdirSync(PICTURES_DIR)) {
        const ref = pictureRefOf(name);
        if (ref && !references.has(ref)) {
            fs.rmSync(path.join(PICTURES_DIR, name));
            removed++;
        }
    }
    console.log(`written ${written}, unchanged ${unchanged}, removed ${removed}, in ${((Date.now() - started) / 1000).toFixed(0)} s`);
    const problems = report(references, refused, failed);
    if (problems.length) {
        console.log(`${problems.length} problems:\n  ${problems.join('\n  ')}`);
        process.exitCode = 1;
    }
}

module.exports = {
    PICTURES_SIZE, PICTURES_MIN_PAINTED, PICTURES_BUDGET, PICTURES_MOB_BUDGET, PICTURES_DIR, PICTURES_FILE,
    isPublicTopicFile, referencesOf, collectReferences, pictureFileName, pictureRefOf, measurePicture, judgePicture, picturesPageHtml
};

if (require.main === module) {
    main().catch((error) => {
        console.error(`guidePictures: ${error.message}`);
        process.exitCode = 1;
    });
}
