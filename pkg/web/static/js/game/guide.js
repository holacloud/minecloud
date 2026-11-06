// The guide: an in-game book of pages written in Markdown. Each page is a file in
// static/guide named ID_XX_TITLE.md (page id, language EN/ES, title); the server lists them
// at /guide/index.json. Public pages are numbered 0, 1, 2...; secret ones have codes of digits
// and capital letters (27A2, UR29) that the reader has to find. Pages link to each other with
// [text](12) or [text](27A2), images are centred, and a page that does not exist yet says so.
// H opens the book where it was left, /guide ID opens that page; inside, ←/→ turn the public
// pages, and the language follows the browser until the reader picks ES or EN. Once a version
// is stable, pages do not change: new topics, or a radically changed creature, get new pages.
// Mixed into Game.prototype; the book is a modal panel (see registerModalPanel).

const GUIDE_CONTENTS_PAGE = '0';
const GUIDE_LANGS = ['ES', 'EN'];
const GUIDE_TEXT = {
    ES: {
        title: 'Guía', contents: 'Índice', goTo: 'Ir a', close: 'Cerrar', page: 'Página', print: 'Imprimir',
        printTitle: 'Abre la guía para imprimir (sin las páginas secretas) en otra pestaña',
        missing: (page) => `La página ${page} aún no existe.`,
        missingHint: 'Quizá se escriba en una próxima versión. Vuelve al índice para ver las que hay.',
        otherLang: 'Esta página aún no está traducida; se muestra en inglés.',
        loading: 'Cargando…', offline: 'No se pudo cargar la guía.'
    },
    EN: {
        title: 'Guide', contents: 'Contents', goTo: 'Go to', close: 'Close', page: 'Page', print: 'Print',
        printTitle: 'Opens the printable guide (without the secret pages) in a new tab',
        missing: (page) => `Page ${page} does not exist yet.`,
        missingHint: 'It may be written in a future version. Go back to the contents to see the pages there are.',
        otherLang: 'This page is not translated yet; it is shown in Spanish.',
        loading: 'Loading…', offline: 'The guide could not be loaded.'
    }
};

const GUIDE_CSS = `
#guide-book { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; z-index: 60;
    background: rgba(8, 6, 4, 0.55); }
#guide-book.visible { display: flex; }
#guide-book .guide-cover { position: relative; width: min(860px, calc(100vw - 32px)); height: min(88vh, 980px);
    padding: 18px; background: #5b3a22; image-rendering: pixelated;
    box-shadow: 0 0 0 4px #2c1a0e, 0 0 0 8px #7a5131, 0 0 0 12px #2c1a0e, 0 18px 40px rgba(0, 0, 0, 0.6);
    display: flex; flex-direction: column; }
#guide-book .guide-cover::before { content: ''; position: absolute; bottom: -58px; right: 72px; width: 26px; height: 70px;
    background: #9c2a2a; box-shadow: inset -6px 0 0 #6d1b1b; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%); }
#guide-book .guide-paper { flex: 1; min-height: 0; display: flex; flex-direction: column; background: #f1e3c0;
    box-shadow: inset 0 0 0 4px #d9c493, inset 12px 0 0 #e6d3a6, inset 0 0 60px rgba(120, 84, 40, 0.25); }
#guide-book .guide-head { display: flex; align-items: baseline; gap: 12px; padding: 14px 28px 8px 34px;
    border-bottom: 4px solid #c9b07a; font-family: 'Pixelify Sans', monospace; color: #5b3a22; }
#guide-book .guide-head .guide-book-title { font-size: 26px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#guide-book .guide-head .guide-number { font-size: 22px; color: #8a6a3f; }
#guide-book .guide-lang, #guide-book .guide-close, #guide-book .guide-nav button { font-family: 'Pixelify Sans', monospace;
    font-size: 20px; color: #f1e3c0; background: #6b4528; border: 0; padding: 4px 12px; cursor: pointer;
    box-shadow: inset 0 -4px 0 #3f2716, 0 0 0 2px #2c1a0e; }
#guide-book .guide-lang.active { background: #9c2a2a; box-shadow: inset 0 -4px 0 #6d1b1b, 0 0 0 2px #2c1a0e; }
#guide-book button:hover { filter: brightness(1.15); }
#guide-book button:disabled { opacity: 0.4; cursor: default; filter: none; }
#guide-book .guide-page { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 44px 28px 52px;
    font-family: 'VT323', monospace; font-size: 27px; line-height: 1.25; color: #3a2614; scrollbar-color: #a0804f transparent; }
#guide-book .guide-page h1, #guide-book .guide-page h2, #guide-book .guide-page h3 { font-family: 'Pixelify Sans', monospace;
    color: #5b3a22; line-height: 1.15; margin: 0.9em 0 0.4em; }
#guide-book .guide-page h1 { font-size: 40px; text-align: center; margin-top: 0.2em; }
#guide-book .guide-page h2 { font-size: 31px; border-bottom: 3px dashed #c9b07a; padding-bottom: 4px; }
#guide-book .guide-page h3 { font-size: 27px; }
#guide-book .guide-page p, #guide-book .guide-page ul, #guide-book .guide-page ol { margin: 0.5em 0; }
#guide-book .guide-page ul, #guide-book .guide-page ol { padding-left: 1.3em; }
#guide-book .guide-page ul { list-style: none; }
#guide-book .guide-page ul > li::before { content: '■'; color: #9c2a2a; font-size: 0.6em; display: inline-block;
    width: 1.6em; margin-left: -1.6em; vertical-align: 0.25em; text-align: center; }
#guide-book .guide-page li { margin: 0.2em 0; }
#guide-book .guide-page strong { color: #2a1a0c; }
#guide-book .guide-page em { color: #6b4528; }
#guide-book .guide-page code { font-family: 'VT323', monospace; background: #e3cf9f; padding: 0 6px; color: #5b2d14; }
#guide-book .guide-page a { color: #9c2a2a; text-decoration: none; border-bottom: 2px solid rgba(156, 42, 42, 0.45); cursor: pointer; }
#guide-book .guide-page a:hover { color: #c43a3a; }
#guide-book .guide-page blockquote { margin: 0.7em 0; padding: 6px 16px; background: #e8d6aa; border-left: 6px solid #b08a52; }
#guide-book .guide-page hr { border: 0; border-top: 4px dotted #c9b07a; margin: 1em 0; }
#guide-book .guide-page figure { margin: 0.8em 0; text-align: center; }
#guide-book .guide-page figure img { max-width: 100%; image-rendering: pixelated; box-shadow: 0 0 0 4px #c9b07a; }
#guide-book .guide-page figure img[src^="data:"] { box-shadow: none; width: 220px; }
#guide-book .guide-page p img, #guide-book .guide-page li img, #guide-book .guide-page td img { height: 1.15em;
    vertical-align: -0.22em; image-rendering: pixelated; }
#guide-book .guide-page figcaption { font-size: 22px; color: #7a5a35; }
#guide-book .guide-page table { border-collapse: collapse; margin: 0.6em auto; font-size: 24px; width: 100%; }
#guide-book .guide-page th, #guide-book .guide-page td { border: 2px solid #c9b07a; padding: 3px 10px; text-align: left; vertical-align: top; }
#guide-book .guide-page th { background: #e3cf9f; font-family: 'Pixelify Sans', monospace; font-size: 22px; }
#guide-book .guide-notice { text-align: center; color: #7a5a35; font-size: 23px; background: #e8d6aa; padding: 4px 10px; margin-bottom: 10px; }
#guide-book .guide-missing { text-align: center; margin-top: 18%; }
#guide-book .guide-missing .guide-missing-title { font-family: 'Pixelify Sans', monospace; font-size: 34px; color: #5b3a22; }
#guide-book .guide-nav { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 10px 16px 12px;
    border-top: 4px solid #c9b07a; font-family: 'Pixelify Sans', monospace; font-size: 20px; color: #5b3a22; flex-wrap: wrap; }
#guide-book .guide-nav .guide-print { font-size: 16px; margin-left: 12px; }
#guide-book .guide-nav input { width: 120px; text-transform: uppercase; font-family: 'VT323', monospace; font-size: 24px; text-align: center;
    background: #fbf3dc; border: 0; box-shadow: inset 0 0 0 2px #a0804f; color: #3a2614; padding: 2px 4px; }
@media (max-width: 600px) {
    #guide-book .guide-cover { padding: 10px; height: calc(100vh - 32px); }
    #guide-book .guide-page { padding: 12px 18px 20px 24px; font-size: 23px; }
    #guide-book .guide-page h1 { font-size: 32px; }
    #guide-book .guide-head { padding: 10px 14px 6px 20px; }
}
/* Phones held sideways: the whole book on a short screen. */
@media (max-height: 520px) {
    #guide-book .guide-cover { padding: 8px; height: calc(100vh - 16px); height: calc(100dvh - 16px); }
    #guide-book .guide-cover::before { display: none; }
    #guide-book .guide-head { padding: 6px 14px 4px 20px; }
    #guide-book .guide-head .guide-book-title { font-size: 22px; }
    #guide-book .guide-page { padding: 8px 20px 14px 26px; font-size: 22px; }
    #guide-book .guide-nav { padding: 6px 10px 8px; }
}
`;

Object.assign(Game.prototype, {
    guideInstall() {
        if (this.guideInstalled) return;
        this.guideInstalled = true;
        this.guideOpen = false;
        this.guideIndex = null;
        this.guideCache = new Map();
        this.guideHistory = [];
        this.guideLang = this.guideLoadSetting('minecloud-guide-lang') || (/^es\b/i.test(navigator.language || '') ? 'ES' : 'EN');
        if (!GUIDE_LANGS.includes(this.guideLang)) this.guideLang = 'EN';
        this.guidePage = this.guidePageId(this.guideLoadSetting('minecloud-guide-page')) || GUIDE_CONTENTS_PAGE;

        const fonts = document.createElement('link');
        fonts.rel = 'stylesheet';
        fonts.href = 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600&family=VT323&display=swap';
        document.head.appendChild(fonts);
        const style = document.createElement('style');
        style.textContent = GUIDE_CSS;
        document.head.appendChild(style);
        this.guideBuildBook();
        window.addEventListener('keydown', (event) => this.guideOnKeyDown(event), true);
        this.guideAddPauseButton();
    },

    guideLoadSetting(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (_error) {
            return null;
        }
    },

    guideSaveSetting(key, value) {
        try {
            window.localStorage.setItem(key, String(value));
        } catch (_error) {
            // Private mode or blocked storage: the book just forgets.
        }
    },

    guideBuildBook() {
        const book = document.createElement('div');
        book.id = 'guide-book';
        book.innerHTML = `
            <div class="guide-cover">
                <div class="guide-paper">
                    <div class="guide-head">
                        <span class="guide-book-title"></span>
                        <span class="guide-number"></span>
                        ${GUIDE_LANGS.map((lang) => `<button class="guide-lang" type="button" data-lang="${lang}">${lang}</button>`).join('')}
                        <button class="guide-close" type="button">✕</button>
                    </div>
                    <div class="guide-page"></div>
                    <div class="guide-nav">
                        <button class="guide-prev" type="button">◀</button>
                        <button class="guide-contents" type="button"></button>
                        <label><span class="guide-goto-label"></span> <input class="guide-goto" type="text" maxlength="8" autocomplete="off" spellcheck="false"></label>
                        <button class="guide-next" type="button">▶</button>
                        <button class="guide-print" type="button"></button>
                    </div>
                </div>
            </div>`;
        const cover = book.querySelector('.guide-cover');
        // Clicks inside the book stay in the book; a click outside closes it.
        cover.addEventListener('mousedown', (event) => event.stopPropagation());
        cover.addEventListener('pointerdown', (event) => event.stopPropagation());
        book.addEventListener('mousedown', () => this.guideClose());
        book.querySelector('.guide-close').addEventListener('click', () => this.guideClose());
        book.querySelector('.guide-prev').addEventListener('click', () => this.guideTurn(-1));
        book.querySelector('.guide-next').addEventListener('click', () => this.guideTurn(1));
        book.querySelector('.guide-contents').addEventListener('click', () => this.guideGo(GUIDE_CONTENTS_PAGE));
        // The printable guide (guide-print.html, js/guidePrint.js) in a new tab.
        book.querySelector('.guide-print').addEventListener('click', () => {
            window.open(`guide-print.html?lang=${encodeURIComponent(this.guideLang)}`, '_blank', 'noopener');
        });
        book.querySelectorAll('.guide-lang').forEach((button) => {
            button.addEventListener('click', () => this.guideSetLang(button.dataset.lang));
        });
        book.querySelector('.guide-page').addEventListener('click', (event) => {
            const link = event.target.closest('a[data-page]');
            if (!link) return;
            event.preventDefault();
            this.guideGo(link.dataset.page);
        });
        document.body.appendChild(book);
        this.guideBook = book;
    },

    guideAddPauseButton() {
        const row = document.querySelector('#pause-menu .pause-actions-main');
        if (!row || document.getElementById('settings-guide')) return;
        const button = document.createElement('button');
        button.id = 'settings-guide';
        button.type = 'button';
        button.textContent = 'Guide (H)';
        button.addEventListener('click', () => {
            this.closePauseMenu(false);
            this.guideShow();
        });
        row.appendChild(button);
    },

    guideOnKeyDown(event) {
        if (this.guideOpen) {
            const typing = event.target && event.target.classList && event.target.classList.contains('guide-goto');
            // This listener runs before the input's own, so the "go to" box is handled here.
            if (typing && (event.code === 'Enter' || event.code === 'NumpadEnter' || (event.key === 'Enter' && !event.code))) {
                const page = this.guidePageId(event.target.value);
                event.target.value = '';
                event.target.blur();
                if (page) this.guideGo(page);
            } else if (!event.repeat && (event.code === 'Escape' || (event.code === 'KeyH' && !typing))) this.guideClose();
            else if (!typing && event.code === 'ArrowLeft') this.guideTurn(-1);
            else if (!typing && event.code === 'ArrowRight') this.guideTurn(1);
            // Nothing else reaches the game while the book is open (key releases still do).
            if (!typing || event.code === 'Escape') event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        if (event.code !== 'KeyH' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
        const target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        if (!this.isGameplayActive() || this.photoMode) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.guideShow();
    },

    // A page id as typed or linked: numbers without leading zeros, codes in capitals; null if
    // it cannot be an id.
    guidePageId(raw) {
        return guidePageIdOf(raw);
    },

    // Opens the book at page `id`, or where it was left.
    guideShow(id = null) {
        const page = this.guidePageId(id);
        if (page) this.guidePage = page;
        if (!this.guideOpen) {
            this.guideOpen = true;
            this.stopMining();
            this.closeChatInput();
            // Losing the pointer lock would otherwise open the pause menu.
            this.suppressPointerLockPauseUntil = performance.now() + 1000;
            if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
            this.guideBook.classList.add('visible');
            this.updatePointerLockHint();
            this.guidePageTurnSound(0.8);
        }
        this.guideRender();
    },

    guideClose() {
        if (!this.guideOpen) return;
        this.guideOpen = false;
        this.guideBook.classList.remove('visible');
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        this.recapturePointerLock();
        this.updatePointerLockHint();
        this.guidePageTurnSound(0.6);
    },

    guideGo(id) {
        const page = this.guidePageId(id);
        if (!page || page === this.guidePage) return;
        this.guidePage = page;
        this.guidePageTurnSound(1);
        this.guideRender();
    },

    // The previous / next public page that exists, in either language. Secret pages are only
    // reached by their code.
    guideTurn(direction) {
        const target = this.guideNeighbour(direction);
        if (target !== undefined) this.guideGo(target);
    },

    guideNeighbour(direction) {
        if (!/^\d+$/.test(this.guidePage)) return undefined;
        const current = Number(this.guidePage);
        const numbers = this.guidePublicPages();
        const target = direction < 0 ? numbers.filter((page) => page < current).pop() : numbers.find((page) => page > current);
        return target === undefined ? undefined : String(target);
    },

    guideSetLang(lang) {
        if (!GUIDE_LANGS.includes(lang) || lang === this.guideLang) return;
        this.guideLang = lang;
        this.guideSaveSetting('minecloud-guide-lang', lang);
        this.guideRender();
    },

    guidePublicPages() {
        return [...new Set((this.guideIndex || []).filter((entry) => !entry.secret).map((entry) => Number(entry.page)))].sort((a, b) => a - b);
    },

    async guideLoadIndex() {
        if (this.guideIndex) return this.guideIndex;
        if (!this.guideIndexRequest) {
            this.guideIndexRequest = fetch('guide/index.json', { cache: 'no-cache' })
                .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.status))))
                .then((pages) => { this.guideIndex = Array.isArray(pages) ? pages : []; return this.guideIndex; })
                .finally(() => { this.guideIndexRequest = null; });
        }
        return this.guideIndexRequest;
    },

    async guideLoadPage(entry) {
        if (this.guideCache.has(entry.path)) return this.guideCache.get(entry.path);
        const response = await fetch(entry.path.split('/').map(encodeURIComponent).join('/'));
        if (!response.ok) throw new Error(response.status);
        const html = this.guideMarkdown(await response.text());
        this.guideCache.set(entry.path, html);
        return html;
    },

    async guideRender() {
        const book = this.guideBook;
        const text = GUIDE_TEXT[this.guideLang];
        const page = this.guidePage;
        const view = book.querySelector('.guide-page');
        this.guideSaveSetting('minecloud-guide-page', page);
        book.querySelector('.guide-number').textContent = `${text.page} ${page}`;
        book.querySelector('.guide-contents').textContent = text.contents;
        book.querySelector('.guide-goto-label').textContent = text.goTo;
        book.querySelector('.guide-print').textContent = `🖨 ${text.print}`;
        book.querySelector('.guide-print').title = text.printTitle;
        book.querySelector('.guide-close').title = text.close;
        book.querySelectorAll('.guide-lang').forEach((button) => button.classList.toggle('active', button.dataset.lang === this.guideLang));

        let index;
        try {
            index = await this.guideLoadIndex();
        } catch (_error) {
            book.querySelector('.guide-book-title').textContent = text.title;
            view.innerHTML = `<div class="guide-missing"><div class="guide-missing-title">${text.offline}</div></div>`;
            return;
        }
        if (page !== this.guidePage) return;
        book.querySelector('.guide-prev').disabled = this.guideNeighbour(-1) === undefined;
        book.querySelector('.guide-next').disabled = this.guideNeighbour(1) === undefined;

        const entries = index.filter((entry) => entry.page === page);
        const entry = entries.find((candidate) => candidate.lang === this.guideLang) || entries[0];
        if (!entry) {
            book.querySelector('.guide-book-title').textContent = text.title;
            view.innerHTML = `<div class="guide-missing"><div class="guide-missing-title">${text.missing(page)}</div><p>${text.missingHint}</p></div>`;
            view.scrollTop = 0;
            return;
        }
        book.querySelector('.guide-book-title').textContent = entry.title;
        view.innerHTML = `<div class="guide-notice">${text.loading}</div>`;
        try {
            const html = await this.guideLoadPage(entry);
            if (page !== this.guidePage) return;
            const notice = entry.lang !== this.guideLang ? `<div class="guide-notice">${text.otherLang}</div>` : '';
            view.innerHTML = notice + html;
        } catch (_error) {
            view.innerHTML = `<div class="guide-missing"><div class="guide-missing-title">${text.offline}</div></div>`;
        }
        view.scrollTop = 0;
    },

    // A soft papery flick.
    guidePageTurnSound(loudness) {
        this.playNoiseBurst({ duration: 0.09, volume: 0.02 * loudness, highpass: 1800, lowpass: 6000 });
    },

    // ---------------------------------------------------------------------------------------
    // Markdown: the shared renderer of js/guideMarkdown.js (also used by the printable guide).
    // ---------------------------------------------------------------------------------------

    guideMarkdown(source) {
        if (!this.guideRenderer) this.guideRenderer = createGuideMarkdown({ assetUrl: (src) => this.guideAssetUrl(src) });
        return this.guideRenderer.markdown(source);
    },

    // Images live next to the pages (`img/foo.png` is guide/img/foo.png); `mob:sheep` is the
    // bestiary portrait of a species, or of an organism of the microscope, and `item:torch` the
    // inventory icon of an item.
    guideAssetUrl(src) {
        const special = src.match(/^(mob|item):([a-z0-9_]+)$/);
        if (special && special[1] === 'item') {
            return this.world && this.world.blockTypes[special[2]] ? this.world.getInventoryIconUrl(special[2]) : '';
        }
        if (special) {
            if (!this.bestiaryPortraits || !(getMobSpecies(special[2]) || this.bestiaryOrganism(special[2]))) return '';
            if (!this.bestiaryPortraits.has(special[2])) this.bestiaryPortraits.set(special[2], this.bestiaryRenderPortrait(special[2]));
            return this.bestiaryPortraits.get(special[2]) || '';
        }
        return guideAssetPath(src);
    },

    guideEscape(text) {
        return guideEscapeHtml(text);
    }
});

registerModalPanel({
    isOpen() { return Boolean(this.guideOpen); },
    close() { this.guideClose(); }
});

registerGameContent(function () { this.guideInstall(); });
