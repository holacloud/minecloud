// Node tests for the pointer lock: whatever frees the pointer on purpose must not open the pause
// menu, which is what losing the lock means otherwise (onPointerLockChange in js/game/menus.js).
// Reads the sources: every document.exitPointerLock() is checked, including the ones to come.
// Run with: node --test test/js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const JS = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js');

function sources(dir = JS) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) return sources(file);
        return entry.name.endsWith('.js') ? [{ file: path.relative(JS, file), text: fs.readFileSync(file, 'utf8') }] : [];
    });
}

// The state flags that keep the listener from opening the pause menu.
function listenerFlags() {
    const menus = fs.readFileSync(path.join(JS, 'game', 'menus.js'), 'utf8');
    const start = menus.indexOf('    onPointerLockChange() {');
    const listener = menus.slice(start, menus.indexOf('this.openPauseMenu();', start));
    return { listener, flags: new Set([...listener.matchAll(/!this\.(\w+)/g)].map((match) => match[1])) };
}

// The method around a position: from the last line opening one, at the indent of Object.assign's
// members or of a class's, to the position.
function methodBefore(text, index) {
    const lines = text.slice(0, index).split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        if (/^ {4}\w+\(.*\) \{$/.test(lines[i])) return lines.slice(i).join('\n');
    }
    return text.slice(0, index);
}

test('every exit of the pointer lock says why, or the pause menu opens', () => {
    const { flags } = listenerFlags();
    let found = 0;
    for (const { file, text } of sources()) {
        for (const match of text.matchAll(/document\.exitPointerLock\(\)/g)) {
            found++;
            const method = methodBefore(text, match.index);
            const suppressed = /this\.suppressPointerLockPauseUntil = performance\.now\(\) \+ 1000/.test(method);
            const flagged = [...method.matchAll(/this\.(\w+) = true/g)].some(([, flag]) => flags.has(flag));
            assert.ok(suppressed || flagged, `${file}: this exit opens the pause menu:\n${method}`);
        }
    }
    assert.ok(found >= 15, `only ${found} exits found: has the code moved?`);
});

test('a modal panel that frees the pointer closes the way the others do', () => {
    const { listener } = listenerFlags();
    assert.match(listener, /this\.suppressPointerLockPauseUntil/);
    assert.match(listener, /!this\.getOpenModalPanel\(\)/, 'an open panel never turns into the pause menu');
    const panels = sources().filter(({ text }) => /registerModalPanel\(/.test(text) && /document\.exitPointerLock\(\)/.test(text));
    assert.ok(panels.some(({ file }) => file.endsWith('storage.js')), 'the storage panel is checked');
    for (const { file, text } of panels) {
        assert.match(text, /suppressPointerLockPauseUntil = performance\.now\(\) \+ 250;[^}]*this\.recapturePointerLock\(\)/, `${file}: closing gets the pointer back`);
    }
});

test('the box that asks for a sign text, which may free the pointer, does not open the pause menu', () => {
    const social = fs.readFileSync(path.join(JS, 'game', 'social.js'), 'utf8');
    const method = social.slice(social.indexOf('promptSignText() {'), social.indexOf('onChatKeyDown(event)'));
    assert.ok(method.indexOf('window.prompt') < method.indexOf('suppressPointerLockPauseUntil'), 'after the dialog: it blocks the page');
    assert.match(method, /recapturePointerLock\(\)/);
});
