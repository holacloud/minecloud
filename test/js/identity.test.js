// Node tests for the player code in the pause menu (js/game/identity.js), on a stand-in for the page: the code
// shows only when its button is pressed, copies, asks before making a new one, recovers, and says it all in ES and
// EN. The server side is tested in pkg/network/identity_test.go. Nothing here runs a browser.
// Run with: node --test test/js/identity.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const STATIC = path.join(__dirname, '..', '..', 'pkg', 'web', 'static');
const JS = path.join(STATIC, 'js');
const read = (file) => fs.readFileSync(path.join(JS, file), 'utf8');
const html = fs.readFileSync(path.join(STATIC, 'index.html'), 'utf8');
const flush = () => new Promise((resolve) => setImmediate(resolve));

const CODE = 'PATO-ROJO-4821-LUNA';

function fakePage({ lang = 'ES', clipboard = 'ok', execCommand = false } = {}) {
    const elements = new Map();
    const element = (id) => {
        if (!elements.has(id)) {
            const listeners = {};
            elements.set(id, {
                id, textContent: '', value: '', placeholder: '', disabled: false, style: {}, focused: 0,
                // Every box starts hidden, as in index.html.
                hidden: /-box$|-confirm$/.test(id),
                listeners,
                addEventListener(type, listener) { (listeners[type] = listeners[type] || []).push(listener); },
                fire(type, event = {}) { for (const listener of listeners[type] || []) listener({ preventDefault() {}, stopPropagation() { event.stopped = true; }, ...event }); return event; },
                focus() { this.focused++; },
                setAttribute() {}, select() {}, remove() {}
            });
        }
        return elements.get(id);
    };
    const copied = [];
    const document = {
        body: { appendChild() {} },
        getElementById: element,
        createElement: () => element(`made-${elements.size}`)
    };
    if (execCommand) document.execCommand = (command) => { copied.push(`exec:${command}`); return true; };
    const navigator = { language: lang === 'ES' ? 'es-ES' : 'en-GB' };
    if (clipboard === 'ok') navigator.clipboard = { writeText: async (text) => { copied.push(text); } };
    if (clipboard === 'refuse') navigator.clipboard = { writeText: async () => { throw new Error('denied'); } };
    const store = new Map([['minecloud-guide-lang', lang]]);
    const context = vm.createContext({
        console, Math, Promise, document, navigator,
        window: { localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) } }
    });
    vm.runInContext('class Game {}', context);
    vm.runInContext(read('extensions.js'), context, { filename: 'extensions.js' });
    vm.runInContext(read('gameLang.js'), context, { filename: 'gameLang.js' });
    vm.runInContext(read('game/identity.js'), context, { filename: 'identity.js' });
    vm.runInContext('Object.assign(this, { Game, IDENTITY_TEXT, IDENTITY_LABELS, identitySay, identityCodeLooksValid, setGameLang, gameLang })', context);

    const network = {
        connected: true, sent: [], handlers: new Map(),
        on(type, handler) { (this.handlers.get(type) || this.handlers.set(type, []).get(type)).push(handler); },
        send(type, payload) { this.sent.push([type, JSON.parse(JSON.stringify(payload))]); },
        emit(type, payload) { for (const handler of this.handlers.get(type) || []) handler(payload); }
    };
    const game = new context.Game();
    game.network = network;
    // As Game does: listening before the socket opens, and the panel once the game has started.
    vm.runInContext('attachNetworkHandlers', context)(game, network);
    vm.runInContext('runGameInit', context)(game);
    return { context, game, network, el: element, copied };
}

test('the code shows only when its button is pressed, and an answer nobody asked for shows nothing', () => {
    const { game, network, el } = fakePage();
    network.emit('playerIdentity', { playerId: 'plr_00112233445566778899aabbccddeeff' });
    assert.equal(el('identity-player').textContent, 'Jugador n.º DDEEFF');
    assert.equal(el('identity-code-box').hidden, true);
    assert.equal(network.sent.length, 0, 'nothing asks for the code by itself');

    // A code arriving unasked (a stale answer, another tab) is not shown.
    network.emit('identityCode', { code: CODE });
    assert.equal(el('identity-code').textContent, '');
    assert.equal(el('identity-code-box').hidden, true);

    el('identity-show').fire('click');
    assert.deepEqual(network.sent, [['identityCodeShow', {}]]);
    assert.equal(el('identity-code-box').hidden, false);
    assert.equal(el('identity-code').textContent, '');
    assert.equal(el('identity-copy').disabled, true);
    assert.match(el('identity-warning').textContent, /No se lo enseñes a nadie/);
    network.emit('identityCode', { code: CODE });
    assert.equal(el('identity-code').textContent, CODE);
    assert.equal(el('identity-copy').disabled, false);
    assert.equal(el('identity-show').textContent, 'Ocultar el código');

    // Pressing again hides it and forgets it.
    el('identity-show').fire('click');
    assert.equal(el('identity-code-box').hidden, true);
    assert.equal(el('identity-code').textContent, '');
    assert.equal(game.identityCode, '');
    assert.equal(el('identity-show').textContent, 'Mi código de jugador');
});

test('closing the pause menu forgets the code', () => {
    const menus = read('game/menus.js');
    const close = menus.slice(menus.indexOf('closePauseMenu(recapturePointer'), menus.indexOf('onDocumentPointerDown(event) {'));
    assert.match(close, /this\.identityHide\(\)/, 'closePauseMenu calls identityHide');

    const { game, network, el } = fakePage();
    el('identity-show').fire('click');
    network.emit('identityCode', { code: CODE });
    game.identityHide();
    assert.equal(el('identity-code').textContent, '');
    assert.equal(el('identity-code-box').hidden, true);
});

test('copy puts the code on the clipboard, or falls back, or says to write it down', async () => {
    let page = fakePage();
    page.el('identity-show').fire('click');
    page.network.emit('identityCode', { code: CODE });
    page.el('identity-copy').fire('click');
    await flush();
    assert.deepEqual(page.copied, [CODE]);
    assert.equal(page.el('identity-code-status').textContent, 'Copiado.');

    page = fakePage({ clipboard: 'none', execCommand: true });
    page.el('identity-show').fire('click');
    page.network.emit('identityCode', { code: CODE });
    page.el('identity-copy').fire('click');
    await flush();
    assert.deepEqual(page.copied, ['exec:copy']);
    assert.equal(page.el('identity-code-status').textContent, 'Copiado.');

    page = fakePage({ clipboard: 'refuse', lang: 'EN' });
    page.el('identity-show').fire('click');
    page.network.emit('identityCode', { code: CODE });
    page.el('identity-copy').fire('click');
    await flush();
    assert.equal(page.el('identity-code-status').textContent, "Couldn't copy it: write it down by hand.");
});

test('a new code is made only after saying yes', () => {
    const { network, el } = fakePage();
    // Nothing to regenerate before the code is shown.
    el('identity-regenerate').fire('click');
    assert.equal(el('identity-regenerate-confirm').hidden, true);

    el('identity-show').fire('click');
    network.emit('identityCode', { code: CODE });
    el('identity-regenerate').fire('click');
    assert.equal(el('identity-regenerate-confirm').hidden, false);
    assert.match(el('identity-regenerate-ask').textContent, /dejará de servir/);
    assert.equal(network.sent.filter(([type]) => type === 'identityCodeRegenerate').length, 0, 'asking is not doing');

    el('identity-regenerate-no').fire('click');
    assert.equal(el('identity-regenerate-confirm').hidden, true);
    assert.equal(network.sent.filter(([type]) => type === 'identityCodeRegenerate').length, 0);

    el('identity-regenerate').fire('click');
    el('identity-regenerate-yes').fire('click');
    assert.deepEqual(network.sent.at(-1), ['identityCodeRegenerate', {}]);
    network.emit('identityCode', { code: 'GATO-AZUL-0001-SOL', regenerated: true });
    assert.equal(el('identity-code').textContent, 'GATO-AZUL-0001-SOL');
    assert.equal(el('identity-code-status').textContent, 'Código nuevo. El anterior ya no sirve.');
});

test('recovering: a typo does not count as a try, a good answer says the inventory stays', () => {
    const { game, network, el } = fakePage();
    assert.equal(el('identity-recover-box').hidden, true);
    el('identity-recover-open').fire('click');
    assert.equal(el('identity-recover-box').hidden, false);
    assert.equal(el('identity-recover-input').focused, 1);
    assert.match(el('identity-recover-help').textContent, /inventario no viaja/);

    el('identity-recover-input').value = 'pato rojo';
    el('identity-recover-submit').fire('click');
    assert.equal(network.sent.length, 0, 'a malformed code is not sent');
    assert.match(el('identity-recover-status').textContent, /tres palabras y un número/);

    el('identity-recover-input').value = '  pato rojo 4821 luna ';
    const key = el('identity-recover-input').fire('keydown', { key: 'Enter' });
    assert.ok(key.stopped, 'keys typed here never reach the game');
    assert.deepEqual(network.sent, [['identityRecover', { code: 'pato rojo 4821 luna' }]]);
    assert.equal(el('identity-recover-submit').disabled, true);
    // One try at a time.
    el('identity-recover-submit').fire('click');
    assert.equal(network.sent.length, 1);

    network.emit('identityRecoverResult', { ok: false, error: 'invalid' });
    assert.equal(el('identity-recover-status').textContent, 'Ese código no vale.');
    assert.equal(el('identity-recover-submit').disabled, false);

    el('identity-recover-submit').fire('click');
    network.emit('identityRecoverResult', { ok: false, error: 'rate', retryAfter: 120 });
    assert.equal(el('identity-recover-status').textContent, 'Demasiados intentos. Espera 120 s y vuelve a probar.');

    // A code shown before belonged to the old player: it goes.
    el('identity-show').fire('click');
    network.emit('identityCode', { code: CODE });
    el('identity-recover-submit').fire('click');
    network.emit('identityRecoverResult', { ok: true, playerId: 'plr_ffffffffffffffffffffffffff123456' });
    assert.equal(el('identity-recover-status').textContent, 'Hecho: ahora eres ese jugador.');
    assert.equal(el('identity-recover-input').value, '');
    assert.equal(el('identity-code').textContent, '');
    assert.equal(game.stablePlayerId, 'plr_ffffffffffffffffffffffffff123456');
    assert.equal(el('identity-player').textContent, 'Jugador n.º 123456');

    el('identity-recover-cancel').fire('click');
    assert.equal(el('identity-recover-box').hidden, true);
});

test('offline, nothing is sent and the page says so', () => {
    const { network, el } = fakePage({ lang: 'EN' });
    network.connected = false;
    el('identity-show').fire('click');
    assert.equal(el('identity-code-status').textContent, 'No connection to the server.');
    el('identity-recover-input').value = CODE;
    el('identity-recover-submit').fire('click');
    assert.equal(el('identity-recover-status').textContent, 'No connection to the server.');
    assert.equal(network.sent.length, 0);
});

test('what a code looks like', () => {
    const { context } = fakePage();
    for (const ok of [CODE, 'pato-rojo-4821-luna', 'León Azúcar 0007 Búho', ' PATO.ROJO.4821.LUNA ']) assert.ok(context.identityCodeLooksValid(ok), ok);
    for (const bad of ['', 'PATO-ROJO-4821', 'PATO-ROJO-LUNA-4821', 'PATO-ROJO-482-LUNA', 'PATO-ROJO-4821-LUNA-SOL', 'PATOLARGO-ROJO-4821-LUNA']) {
        assert.ok(!context.identityCodeLooksValid(bad), bad);
    }
});

test('every line is in Spanish and in English, and the panel follows the language', () => {
    const { context, el } = fakePage();
    for (const [key, line] of Object.entries(context.IDENTITY_TEXT)) {
        for (const lang of ['ES', 'EN']) assert.ok(typeof line[lang] === 'string' && line[lang].trim(), `${key} has no ${lang}`);
        assert.deepEqual(Object.keys(line).sort(), ['EN', 'ES'], `${key} has only ES and EN`);
    }
    // Every key the code says exists, and every labelled element is in the pause menu.
    const source = read('game/identity.js');
    for (const [, key] of source.matchAll(/identitySay\('(\w+)'/g)) assert.ok(context.IDENTITY_TEXT[key], `identitySay('${key}') has no line`);
    for (const [id, key] of Object.entries(context.IDENTITY_LABELS)) {
        assert.ok(context.IDENTITY_TEXT[key], `${id}: ${key}`);
        assert.ok(html.includes(`id="${id}"`), `${id} is in index.html`);
    }
    // The elements carry no text of their own in the page: all of it comes from the table.
    const section = html.slice(html.indexOf('id="identity-section"'), html.indexOf('<div class="pause-actions">'));
    assert.doesNotMatch(section.replace(/<!--[\s\S]*?-->/g, ''), />[^<\s][^<]*</, 'no text written into index.html');
    assert.ok(html.includes('src="js/game/identity.js"'));

    assert.equal(el('identity-show').textContent, 'Mi código de jugador');
    assert.equal(el('identity-recover-open').textContent, 'Ya tengo un código');
    context.setGameLang('EN');
    assert.equal(el('identity-show').textContent, 'My player code');
    assert.equal(el('identity-recover-open').textContent, 'I already have a code');
    assert.equal(el('identity-player').textContent, 'Player not connected');
});

test('the network client remembers its stable player apart from the page id', () => {
    const source = read('websocket.js');
    const context = vm.createContext({ console, Map, Math, JSON, window: {} });
    const client = vm.runInContext(`${source}\nnew NetworkClient();`, context);
    const heard = [];
    client.on('playerIdentity', (payload) => heard.push(payload));
    const pageId = client.playerId;
    client.handleMessage({ type: 'playerIdentity', payload: { playerId: 'plr_abc' } });
    assert.equal(client.stablePlayerId, 'plr_abc');
    assert.equal(client.playerId, pageId);
    assert.deepEqual(heard.map((p) => p.playerId), ['plr_abc']);
});
