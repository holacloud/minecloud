// The layout of the microscope's panel, worked out from its own CSS, since nothing here runs a browser:
// how wide the description's column comes out at common screens, and whether the longest description fits.
// How it really looks is tested in the game.
// Run with: node --test test/js/microscope_layout.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const JS = path.join(__dirname, '..', '..', 'pkg', 'web', 'static', 'js', 'game');
const source = fs.readFileSync(path.join(JS, 'microscope.js'), 'utf8');
const css = source.slice(source.indexOf('const MICROSCOPE_CSS = `'), source.indexOf('`;', source.indexOf('const MICROSCOPE_CSS = `')));
const WIDE = '@media (min-aspect-ratio:5/4){';
const narrowCss = css.slice(0, css.indexOf('/* Wide screens'));
const wideCss = css.slice(css.indexOf(WIDE), css.indexOf('/* With height to spare'));

// One number out of the CSS, so that changing the CSS changes these sums.
function px(sheet, pattern) {
    const found = sheet.match(pattern);
    assert.ok(found, `not in the CSS: ${pattern}`);
    return Number(found[1]);
}

const PANEL = {
    inset: px(narrowCss, /inset:max\((\d+)px/),
    padding: px(narrowCss, /#microscope-panel\{[^}]*padding:(\d+)px/),
    border: px(narrowCss, /#microscope-panel\{[^}]*border:(\d+)px/),
    maxHeight: px(narrowCss, /#microscope-panel\{[^}]*max-height:(\d+)px/),
    maxWidth: px(wideCss, /#microscope-panel\{max-width:(\d+)px/),
    gap: px(narrowCss, /#microscope-panel\{[^}]*gap:(\d+)px/),
    head: px(narrowCss, /\.micro-close\{min-width:\d+px;min-height:(\d+)px/),
    columnGap: px(wideCss, /\.micro-body\{[^}]*column-gap:(\d+)px/),
    columnLeast: px(wideCss, /min\((\d+)px,\d+cqw\)/),
    columnShare: px(wideCss, /min\(\d+px,(\d+)cqw\)/) / 100,
    powers: px(narrowCss, /#micro-powers button\{[^}]*min-height:(\d+)px/),
    opticsGap: px(narrowCss, /\.micro-optics\{[^}]*gap:(\d+)px/),
    focus: px(narrowCss, /#micro-focus\{[^}]*height:(\d+)px/),
    tool: px(narrowCss, /\.micro-tool\{[^}]*min-height:(\d+)px/),
    controlsGap: px(wideCss, /\.micro-bottom\{[^}]*gap:(\d+)px/),
    ring: 14 // What #micro-field takes off the stage for the ring around it.
};

// The arrangement on a wide screen, in CSS pixels, with no safe areas.
function wideLayout(screenWidth, screenHeight) {
    const edge = 2 * (PANEL.padding + PANEL.border);
    const width = Math.min(screenWidth - 2 * PANEL.inset, PANEL.maxWidth) - edge;
    const height = Math.min(screenHeight - 2 * PANEL.inset, PANEL.maxHeight) - edge;
    const body = height - PANEL.head - PANEL.gap;
    const stage = Math.min(body, width - Math.min(PANEL.columnLeast, PANEL.columnShare * width) - PANEL.columnGap);
    const controls = PANEL.powers + PANEL.opticsGap + PANEL.focus + PANEL.controlsGap + PANEL.tool;
    return { field: stage - PANEL.ring, column: width - stage - PANEL.columnGap, description: body - controls - PANEL.controlsGap };
}

// The longest thing said of any organism in either language.
function longest(key) {
    const lengths = ['microbes.js', 'microscope_text.js'].flatMap((file) => {
        const text = fs.readFileSync(path.join(JS, file), 'utf8');
        return [...text.matchAll(new RegExp(`\\b${key}: '((?:[^'\\\\]|\\\\.)*)'`, 'g'))].map((found) => found[1].length);
    });
    assert.ok(lengths.length > 0, key);
    return Math.max(...lengths);
}

// How tall the longest description is, at the sizes of the second @media. Consolas is 0.55em wide.
function tallestDescription(column) {
    const lines = (chars, width, size) => Math.ceil(chars / Math.floor(width / (size * 0.55)));
    const text = column - 16;
    const beside = text - 96 - 36 - 2 * 10;
    const meta = longest('size') + longest('where') + 4;
    const head = Math.max(96, 17 * 1.42 + lines(meta, beside, 12.5) * 12.5 * 1.42);
    const body = (lines(longest('fact'), text, 14) + lines(longest('(?:iodine_tincture|methylene_blue)'), text, 14)) * 14 * 1.42;
    const slideLine = 2 * 13 * 1.25 + 6;
    return Math.ceil(head + 4 + 12 + body + 12 + slideLine + 6);
}

const COMMON = [[1920, 1080, 480], [1366, 768, 480], [1280, 720, 480], [1024, 768, 340]];

for (const [width, height, least] of COMMON) {
    test(`at ${width}x${height} the column is generous and the longest description fits`, (t) => {
        const layout = wideLayout(width, height);
        const tallest = tallestDescription(layout.column);
        t.diagnostic(`field ${layout.field}px, column ${layout.column}px, room ${layout.description}px high, longest description ${tallest}px`);
        assert.ok(layout.column >= least, `column ${layout.column}`);
        assert.ok(layout.field >= 500, `field ${layout.field}`);
        assert.ok(tallest <= layout.description, `${tallest} in ${layout.description}`);
    });
}

test('a phone on its side still has a field and a usable column', (t) => {
    for (const [width, height] of [[844, 390], [667, 375], [568, 320]]) {
        const layout = wideLayout(width, height);
        t.diagnostic(`${width}x${height}: field ${layout.field}px, column ${layout.column}px, room ${layout.description}px high`);
        assert.ok(layout.column >= 240, `${width}: column ${layout.column}`);
        assert.ok(layout.field >= 200, `${width}: field ${layout.field}`);
        assert.ok(layout.description >= 100, `${width}: room ${layout.description}`);
    }
});

test('the wide arrangement is only for wide screens, and the panel itself never scrolls', () => {
    // Narrow: one column, the info over the bottom of the field and the controls under it.
    assert.match(narrowCss, /\.micro-body\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
    assert.match(narrowCss, /\.micro-stage\{grid-area:1\/1;/);
    assert.match(narrowCss, /#micro-readout\{grid-area:1\/1;/);
    assert.match(narrowCss, /\.micro-bottom\{grid-area:2\/1;/);
    assert.match(narrowCss, /#micro-info\{position:absolute;left:0;right:0;bottom:0;[^}]*max-height:46%;overflow-y:auto/);
    assert.match(narrowCss, /#micro-hint\{display:none\}/);
    assert.match(narrowCss, /#microscope-panel\{position:fixed;[^}]*overflow:hidden/);
    // Wide: the field on the left and the rest beside it.
    assert.match(wideCss, /\.micro-stage\{grid-area:1\/1\/3\/2;width:min\(100cqh,/);
    assert.match(wideCss, /#micro-readout\{grid-area:1\/2;[^}]*overflow-y:auto/);
    assert.match(wideCss, /\.micro-bottom\{grid-area:2\/2;flex-direction:column/);
});

test('the markup: the powers right above the focus, then the icon bar, all out of the field', () => {
    const html = source.slice(source.indexOf('<div class="micro-body">'), source.indexOf('</div>`;', source.indexOf('<div class="micro-body">')));
    const order = ['micro-stage', 'micro-field', 'micro-readout', 'micro-lines', 'micro-hint', 'micro-info', 'micro-bottom', 'micro-powers', 'micro-focus', 'micro-bar'];
    const places = order.map((name) => html.indexOf(name));
    assert.ok(places.every((place) => place >= 0), order.join(' '));
    assert.deepEqual(places, [...places].sort((a, b) => a - b), 'in this order');
    assert.equal(/style="flex/.test(html), false, 'its CSS is in the sheet, where the media queries can change it');
});
