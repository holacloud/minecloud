// The printable guide (guide-print.html?lang=ES|EN&paper=A5|A4|BOOKLET): every public page of the
// in-game book as a paper book, with a cover, a "how to use this book" sheet and a table of
// contents. Secret pages (non-numeric ids) are never shown, listed or linked.
//
// It is paginated here, not by the browser: every printed page is a sheet <div> of the exact
// paper size (@page margin 0) with its own header and footer, so Chrome and Firefox print the
// same book. The content of each guide page is rendered (same Markdown as the book:
// js/guideMarkdown.js), measured block by block once fonts and pictures are ready, and flowed
// into sheets: figures never split, tables split between rows repeating their header, lists
// between items, and headings stay with what follows. Each guide page starts a new sheet.
// The only numbers printed are sheet numbers (the cover is sheet 1, unnumbered): the contents
// and every link ("→ p. N") point to them; the header shows the in-game page discreetly.
//
// BOOKLET lays the book out in A5 and then imposes it on A4 landscape for saddle-stitched
// booklets: each A4 folio carries four A5 pages (two per side), in the order that makes them
// read straight once the folios of a booklet are printed on both sides, stacked and folded
// in half. The number of folios per booklet is a setting; the last booklet only takes the
// folios it needs, with blank pages at its end.
//
// Mob portraits and item icons are drawn by the game's own code, run here without a game: the
// page loads the scripts index.html loads (except game.js, the network and the book) over a
// stub `class Game {}`, builds a WorldRenderer for the item icons and uses the bestiary's
// portrait stage for the mobs. What cannot be drawn becomes a neat placeholder.
// Wrapped in a function so its names cannot clash with the game scripts it loads.

(function () {
    'use strict';

    const LANGS = ['ES', 'EN'];
    const PAPERS = ['A5', 'A4', 'BOOKLET'];
    const FOLIOS_DEFAULT = 6;
    const FOLIOS_MAX = 15;
    const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    // Sheet-number placeholder while measuring: as wide as the widest real number.
    const NUMBER_PLACEHOLDER = '000';
    // Scripts of index.html that the printable guide must not run.
    const SKIP_SCRIPTS = /(^|\/)(game|websocket|voice|guideMarkdown|guidePrint)\.js$|(^|\/)game\/guide\.js$/;
    // If index.html cannot be read: what the icons and portraits need at the very least.
    const FALLBACK_SCRIPTS = ['js/extensions.js', 'js/camera.js', 'js/chunkStore.js', 'js/blockShapes.js', 'js/chunkMesher.js',
        'js/models.js', 'js/mobSpecies.js', 'js/blockTextures.js', 'js/world.js', 'js/game/resources.js', 'js/game/bestiary.js', 'js/game/microbes.js'];

    const TEXT = {
        ES: {
            book: 'Guía de MineCloud', subtitle: 'El libro de campo del mundo de MineCloud',
            edition: (date, count) => `Edición en papel · ${date} · ${count} páginas de la guía`,
            contents: 'Índice', inGame: (id) => `Guía nº ${id}`, otherLang: 'Esta página aún no está traducida; se muestra en inglés.',
            more: 'Más páginas', print: 'Imprimir', inkSaver: 'Ahorrar tinta', pixelFont: 'Fuente pixel', clearFont: 'Fuente clara',
            paper: 'Papel', booklet: 'Librillos A4', folios: 'Folios por librillo', longEdge: 'Volteo por borde largo',
            introTitle: 'Cómo usar este libro',
            intro: (count, paper) => `
                <h1>Cómo usar este libro</h1>
                <p>Este libro reúne las <strong>${count} páginas</strong> de la guía que hay dentro del juego, en el mismo orden:
                lo básico, los mobs, los objetos, las curiosidades y la ciencia de MineCloud.</p>
                <h2>Los números</h2>
                <ul>
                <li>El número <strong>al pie de cada hoja</strong> es el único número del libro. El <strong>índice</strong> y los
                enlaces, como <strong>→ p. 12</strong>, te llevan a esas hojas.</li>
                <li>Arriba, junto al título, verás en pequeño <strong>«Guía nº 34»</strong>: es el número de esa página en el libro
                del juego. Para leerla allí, pulsa <strong>H</strong> y escribe 34 en <strong>Ir a</strong>, o escribe
                <code>/guide 34</code> en el chat.</li>
                </ul>
                <h2>El papel</h2>
                ${paper === 'BOOKLET' ? `<p>Esta copia está maquetada en <strong>librillos</strong>: cada folio A4, impreso por las
                dos caras, lleva cuatro páginas A5. Apila los folios de cada librillo en orden, dóblalos por la mitad y grápalos
                por el doblez: las páginas quedan seguidas. Luego pon un librillo detrás de otro.</p>` : `<p>Esta copia está maquetada
                en <strong>${paper}</strong>. El tamaño <strong>A5</strong> es el de un libro de bolsillo: imprime en hojas A5, o
                elige <strong>Librillos A4</strong> para imprimir en A4 y doblar. Con <strong>A4</strong> las hojas son más grandes
                y hay menos.</p>`}
                <h2>Lo que no está</h2>
                <p>Las <strong>páginas secretas</strong> no se imprimen: se esconden tras códigos y hay que encontrarlas jugando.
                Y el juego sigue creciendo: el libro del juego (tecla <strong>H</strong>) siempre tiene las páginas más nuevas.</p>`,
            loadingEngine: 'Preparando el dibujante de imágenes…', loadingPages: (done, total) => `Cargando páginas: ${done} / ${total}`,
            drawing: (done, total) => `Dibujando imágenes: ${done} / ${total}`, waiting: 'Esperando a las imágenes y las fuentes…',
            paginating: (done, total) => `Maquetando: ${done} / ${total}`,
            ready: (sheets, paper) => `Listo: ${sheets} páginas en ${paper}. Pulsa Imprimir y elige papel ${paper}, márgenes «Ninguno» y escala 100 %.`,
            readyBooklet: (pages, folios, total, longEdge) => `Listo: ${pages} páginas A5 en ${folios.length} librillos (folios: ${folios.join(', ')}), ${total} folios A4. ` +
                `Pulsa Imprimir y elige papel A4 horizontal, a doble cara con volteo por el borde ${longEdge ? 'largo' : 'corto'}, márgenes «Ninguno» y escala 100 %. ` +
                'Dobla cada librillo por la mitad con sus folios en el orden impreso.',
            bookletLabel: (booklet, count, folio, folios, back) => `Librillo ${booklet} de ${count} · folio ${folio} de ${folios} · cara ${back ? 'trasera' : 'delantera'}`,
            partial: (missing) => `${missing} imágenes no se pudieron dibujar y salen como un hueco.`,
            offline: 'No se pudo cargar la guía. ¿Está el servidor en marcha?', noEngine: 'Sin motor 3D: los dibujos de mobs y objetos saldrán como huecos.'
        },
        EN: {
            book: 'The MineCloud Guide', subtitle: 'The field book of the world of MineCloud',
            edition: (date, count) => `Paper edition · ${date} · ${count} guide pages`,
            contents: 'Contents', inGame: (id) => `In-game page ${id}`, otherLang: 'This page is not translated yet; it is shown in Spanish.',
            more: 'More pages', print: 'Print', inkSaver: 'Ink saver', pixelFont: 'Pixel font', clearFont: 'Clear font',
            paper: 'Paper', booklet: 'A4 booklets', folios: 'Folios per booklet', longEdge: 'Flip on long edge',
            introTitle: 'How to use this book',
            intro: (count, paper) => `
                <h1>How to use this book</h1>
                <p>This book gathers the <strong>${count} pages</strong> of the guide inside the game, in the same order: the basics,
                the mobs, the items, the curiosities and the science of MineCloud.</p>
                <h2>The numbers</h2>
                <ul>
                <li>The number <strong>at the foot of each sheet</strong> is the only number in this book. The
                <strong>contents</strong> and the links, like <strong>→ p. 12</strong>, take you to those sheets.</li>
                <li>At the top, next to the title, a small <strong>"In-game page 34"</strong> is the number of that page in the book
                inside the game. To read it there, press <strong>H</strong> and type 34 in <strong>Go to</strong>, or type
                <code>/guide 34</code> in the chat.</li>
                </ul>
                <h2>The paper</h2>
                ${paper === 'BOOKLET' ? `<p>This copy is laid out in <strong>booklets</strong>: each A4 folio, printed on both
                sides, carries four A5 pages. Stack the folios of each booklet in order, fold them in half and staple them along the
                fold: the pages follow on. Then put one booklet after another.</p>` : `<p>This copy is laid out for
                <strong>${paper}</strong>. <strong>A5</strong> is pocket-book size: print on A5 sheets, or choose <strong>A4
                booklets</strong> to print on A4 and fold. With <strong>A4</strong> the sheets are bigger and fewer.</p>`}
                <h2>What is missing</h2>
                <p><strong>Secret pages</strong> are not printed: they hide behind codes and you have to find them by playing. And the
                game keeps growing: the book inside the game (key <strong>H</strong>) always has the newest pages.</p>`,
            loadingEngine: 'Getting the picture painter ready…', loadingPages: (done, total) => `Loading pages: ${done} / ${total}`,
            drawing: (done, total) => `Drawing pictures: ${done} / ${total}`, waiting: 'Waiting for pictures and fonts…',
            paginating: (done, total) => `Laying out: ${done} / ${total}`,
            ready: (sheets, paper) => `Ready: ${sheets} pages in ${paper}. Press Print and choose ${paper} paper, margins "None" and scale 100%.`,
            readyBooklet: (pages, folios, total, longEdge) => `Ready: ${pages} A5 pages in ${folios.length} booklets (folios: ${folios.join(', ')}), ${total} A4 folios. ` +
                `Press Print and choose A4 landscape, two-sided with ${longEdge ? 'long' : 'short'}-edge flip, margins "None" and scale 100%. ` +
                'Fold each booklet in half with its folios in the printed order.',
            bookletLabel: (booklet, count, folio, folios, back) => `Booklet ${booklet} of ${count} · folio ${folio} of ${folios} · ${back ? 'back' : 'front'}`,
            partial: (missing) => `${missing} pictures could not be drawn and show as a blank.`,
            offline: 'The guide could not be loaded. Is the server running?', noEngine: 'No 3D engine: mob and item pictures will show as blanks.'
        }
    };

    // Sections of the table of contents (public page ranges, inclusive). Pages outside every
    // range are grouped under "More pages", so new pages always appear.
    const SECTIONS = [
        [0, 15, 'Lo básico', 'The basics'],
        [16, 47, 'Mobs', 'Mobs'],
        [48, 97, 'Objetos', 'Items'],
        [98, 106, 'Curiosidades', 'Curiosities'],
        [107, 111, 'Cultivos', 'Farming'],
        [112, 114, 'Tiempo y meteorología', 'Weather'],
        [115, 129, 'Química', 'Chemistry'],
        [130, 131, 'Genética', 'Genetics'],
        [132, 134, 'Astronomía', 'Astronomy'],
        [135, 138, 'Hormigas y castores', 'Ants and beavers'],
        [139, 174, 'Los elementos químicos', 'The chemical elements'],
        [175, 190, 'Química: más descubrimientos', 'Chemistry: more discoveries'],
        [191, 195, 'Planos y robot programable', 'Blueprints and the programmable robot'],
        [196, 199, 'Bloques de construcción', 'Building blocks'],
        [200, 206, 'Electricidad', 'Electricity'],
        [207, 212, 'Lógica y sensores', 'Logic and sensors'],
        [213, 214, 'La anguila eléctrica', 'The electric eel'],
        [215, 216, 'El golem de cobre', 'The copper golem'],
        [217, 220, 'Máquinas y energía', 'Machines and power'],
        [223, 234, 'Muebles', 'Furniture'],
        [235, 236, 'El taller: fundición y horno de arco', 'The workshop: foundry and arc furnace'],
        [237, 244, 'El mundo pequeño', 'The small world'],
        [245, 245, 'Bloque luminoso', 'Glow block']
    ];

    // ---------------------------------------------------------------- pure helpers (tested)

    // The public pages of the index, numerically, one entry each: the one in `lang`, or the
    // other language when it is missing. Secret pages are dropped here and never seen again.
    function publicPages(index, lang) {
        const byPage = new Map();
        for (const entry of Array.isArray(index) ? index : []) {
            if (!entry || entry.secret || !/^\d{1,8}$/.test(String(entry.page))) continue;
            const id = String(Number(entry.page));
            const current = byPage.get(id);
            if (!current || (entry.lang === lang && current.lang !== lang)) byPage.set(id, entry);
        }
        return [...byPage.entries()]
            .map(([id, entry]) => ({ id, number: Number(id), title: entry.title, path: entry.path, lang: entry.lang, fallback: entry.lang !== lang }))
            .sort((a, b) => a.number - b.number);
    }

    function sectionsFor(pages, lang) {
        const sections = [];
        for (const page of pages) {
            const range = SECTIONS.find(([from, to]) => page.number >= from && page.number <= to);
            const key = range ? `${range[0]}` : 'more';
            const last = sections[sections.length - 1];
            if (last && last.key === key) {
                last.pages.push(page);
                continue;
            }
            const title = range ? (lang === 'ES' ? range[2] : range[3]) : TEXT[lang].more;
            sections.push({ key, title, pages: [page] });
        }
        return sections;
    }

    // Pagination. A block is { height } (atomic: paragraphs, figures, quotes...), plus
    // keepWithNext for headings, or splittable: a table { chrome, head, rows: [heights] } or a
    // list { chrome, items: [heights] }, where chrome is what the block adds around its rows or
    // items (margins, borders). Returns the sheets of one chapter: arrays of pieces
    // { block, from, to } (from/to: the rows or items of a splittable block on that sheet).
    function splitParts(block) {
        const parts = block.rows || block.items;
        return parts && parts.length ? parts : null;
    }

    // The least room block i needs on a sheet: its first row or item if it splits, all of it
    // otherwise; a heading needs itself plus the least of what follows.
    function leastNeed(blocks, i) {
        let need = 0;
        while (i < blocks.length && blocks[i].keepWithNext) need += blocks[i++].height;
        if (i >= blocks.length) return need;
        const block = blocks[i];
        const parts = splitParts(block);
        if (!parts) return need + block.height;
        return need + (block.chrome || 0) + (block.rows ? block.head || 0 : 0) + parts[0];
    }

    function paginateChapter(blocks, pageHeight) {
        const sheets = [[]];
        let used = 0;
        const fresh = () => {
            if (sheets[sheets.length - 1].length) sheets.push([]);
            used = 0;
        };
        const place = (piece, height) => {
            sheets[sheets.length - 1].push(piece);
            used += height;
        };
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const parts = splitParts(block);
            if (parts) {
                const fixed = (block.chrome || 0) + (block.rows ? block.head || 0 : 0);
                let from = 0;
                while (from < parts.length) {
                    let to = from;
                    let height = fixed;
                    while (to < parts.length && used + height + parts[to] <= pageHeight) height += parts[to++];
                    if (to === from) {
                        if (used > 0) {
                            fresh();
                            continue;
                        }
                        height += parts[to++]; // a single row taller than a sheet: it has to go somewhere
                    }
                    place({ block: i, from, to }, height);
                    from = to;
                    if (from < parts.length) fresh();
                }
                continue;
            }
            const need = block.keepWithNext ? leastNeed(blocks, i) : block.height;
            // A heading that cannot keep its company even on a fresh sheet just needs to fit itself.
            const tooTall = need > pageHeight ? used + block.height > pageHeight : used + need > pageHeight;
            if (used > 0 && tooTall) fresh();
            place({ block: i }, block.height);
        }
        return sheets;
    }

    // The whole book after `before` sheets (the cover): every chapter starts a sheet. Returns
    // { sheets: [{ chapter, pieces, number }], starts: [first sheet number of each chapter] }.
    function paginate(chapters, pageHeight, before = 1) {
        const sheets = [];
        const starts = [];
        chapters.forEach((chapter, index) => {
            starts.push(before + sheets.length + 1);
            for (const pieces of paginateChapter(chapter.blocks, pageHeight)) {
                sheets.push({ chapter: index, pieces, number: before + sheets.length + 1 });
            }
        });
        return { sheets, starts };
    }

    // Saddle-stitch imposition of `pageCount` pages (0-based) in booklets of `folios` folios.
    // Each folio has a front and a back side with a left and a right page (null: blank). For
    // a booklet of n folios starting at page b, folio i carries b+4n-1-2i | b+2i on the front
    // and b+2i+1 | b+4n-2-2i on the back: stacked and folded, they read b, b+1, ... in order.
    // The last booklet takes only the folios it needs.
    function bookletImposition(pageCount, folios) {
        const booklets = [];
        let base = 0;
        while (base < pageCount) {
            const n = Math.min(folios, Math.ceil((pageCount - base) / 4));
            const page = (k) => (base + k < pageCount ? base + k : null);
            const sides = [];
            for (let i = 0; i < n; i++) {
                sides.push({ folio: i, back: false, left: page(4 * n - 1 - 2 * i), right: page(2 * i) });
                sides.push({ folio: i, back: true, left: page(2 * i + 1), right: page(4 * n - 2 - 2 * i) });
            }
            booklets.push({ first: base, folios: n, sides });
            base += 4 * n;
        }
        return booklets;
    }

    function escapeHtml(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // A dashed frame with a question mark, for a picture that could not be drawn.
    function placeholderUrl() {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="3" y="3" width="58" height="58" rx="4" fill="none" stroke="#a0804f" stroke-width="3" stroke-dasharray="7 5"/><text x="32" y="44" font-family="monospace" font-size="34" text-anchor="middle" fill="#a0804f">?</text></svg>';
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }

    const api = { publicPages, sectionsFor, paginateChapter, paginate, bookletImposition, SECTIONS, TEXT, SKIP_SCRIPTS };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
        return;
    }

    // ---------------------------------------------------------------- settings

    function loadSetting(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (_error) {
            return null;
        }
    }

    function saveSetting(key, value) {
        try {
            window.localStorage.setItem(key, String(value));
        } catch (_error) {
            // Private mode or blocked storage: the choice is just not remembered.
        }
    }

    function initialChoice(param, storageKey, options, fallback) {
        const fromUrl = (new URLSearchParams(window.location.search).get(param) || '').toUpperCase();
        if (options.includes(fromUrl)) return fromUrl;
        const saved = loadSetting(storageKey);
        return options.includes(saved) ? saved : fallback;
    }

    function initialFolios() {
        const fromUrl = Number(new URLSearchParams(window.location.search).get('folios'));
        const value = Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : Number(loadSetting('minecloud-guide-print-folios'));
        return Number.isInteger(value) && value >= 1 && value <= FOLIOS_MAX ? value : FOLIOS_DEFAULT;
    }

    const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

    // ---------------------------------------------------------------- the picture painter

    // Loads the game's scripts (as index.html lists them) one after the other. A script that
    // fails is skipped: only its pictures will be missing.
    async function loadEngine() {
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
        sources = (sources || []).filter((src) => !/^(https?:)?\/\//.test(src) && !SKIP_SCRIPTS.test(src));
        if (!sources.length) sources = FALLBACK_SCRIPTS;
        for (const src of sources) {
            await new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                script.onerror = () => { console.warn('[guide-print] could not load', src); resolve(); };
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
            console.warn('[guide-print] no item icons:', error);
            engine.world = null;
        }
        try {
            if (typeof Game === 'function' && typeof Game.prototype.bestiaryRenderPortrait === 'function') {
                engine.portraits = Object.create(Game.prototype);
                engine.portraits.bestiaryTextureCache = new Map();
            }
        } catch (error) {
            console.warn('[guide-print] no mob portraits:', error);
        }
        return engine;
    }

    // The data URL of `mob:species` / `item:type`, or null when it cannot be drawn.
    function drawAsset(engine, kind, name) {
        if (!engine) return null;
        try {
            if (kind === 'item') {
                return engine.world && engine.world.blockTypes[name] ? engine.world.getInventoryIconUrl(name) : null;
            }
            return engine.portraits ? engine.portraits.bestiaryRenderPortrait(name) : null;
        } catch (error) {
            console.warn(`[guide-print] could not draw ${kind}:${name}`, error);
            return null;
        }
    }

    // ---------------------------------------------------------------- the book

    const state = {
        lang: initialChoice('lang', 'minecloud-guide-lang', LANGS, /^es\b/i.test(navigator.language || '') ? 'ES' : 'EN'),
        paper: initialChoice('paper', 'minecloud-guide-print-paper', PAPERS, 'A5'),
        folios: initialFolios(),
        longEdge: loadSetting('minecloud-guide-print-long-edge') === '1',
        build: 0,
        engine: undefined,
        enginePromise: null,
        index: null,
        sources: new Map(),
        drawn: new Map(),
        placeholder: placeholderUrl()
    };

    const elements = {};

    function setStatus(text, progress = null) {
        elements.status.textContent = text;
        elements.progress.hidden = progress === null;
        if (progress !== null) elements.progress.value = progress;
    }

    function applySettings() {
        const text = TEXT[state.lang];
        const root = document.documentElement;
        root.lang = state.lang.toLowerCase();
        const booklet = state.paper === 'BOOKLET';
        root.classList.toggle('gp-a4', state.paper === 'A4');
        root.classList.toggle('gp-a5', state.paper !== 'A4');
        root.classList.toggle('gp-booklet', booklet);
        document.getElementById('gp-page-style').textContent = booklet
            ? '@page { size: A4 landscape; margin: 0; }'
            : `@page { size: ${state.paper} portrait; margin: 0; }`;
        document.title = text.book;
        elements.print.textContent = `🖨 ${text.print}`;
        elements.inkLabel.textContent = text.inkSaver;
        elements.paperLabel.textContent = text.paper;
        elements.foliosLabel.textContent = text.folios;
        elements.longEdgeLabel.textContent = text.longEdge;
        elements.folios.value = String(state.folios);
        elements.longEdge.checked = state.longEdge;
        elements.bookletOptions.hidden = !booklet;
        const pixel = root.classList.contains('gp-pixel');
        elements.fonts.forEach((button) => {
            button.textContent = button.dataset.pixel === '1' ? text.pixelFont : text.clearFont;
            button.classList.toggle('active', (button.dataset.pixel === '1') === pixel);
        });
        elements.langs.forEach((button) => button.classList.toggle('active', button.dataset.lang === state.lang));
        elements.papers.forEach((button) => {
            if (button.dataset.paper === 'BOOKLET') button.textContent = text.booklet;
            button.classList.toggle('active', button.dataset.paper === state.paper);
        });
    }

    async function loadIndex() {
        if (state.index) return state.index;
        const response = await fetch('guide/index.json', { cache: 'no-cache' });
        if (!response.ok) throw new Error(response.status);
        const pages = await response.json();
        state.index = Array.isArray(pages) ? pages : [];
        return state.index;
    }

    async function loadSources(pages, build) {
        let done = 0;
        const queue = pages.filter((page) => !state.sources.has(page.path));
        const total = queue.length;
        const worker = async () => {
            while (queue.length && build === state.build) {
                const page = queue.shift();
                try {
                    const response = await fetch(page.path.split('/').map(encodeURIComponent).join('/'));
                    state.sources.set(page.path, response.ok ? await response.text() : null);
                } catch (_error) {
                    state.sources.set(page.path, null);
                }
                done++;
                if (build === state.build) setStatus(TEXT[state.lang].loadingPages(done, total), total ? done / total : 1);
            }
        };
        await Promise.all(Array.from({ length: 6 }, worker));
    }

    // A chapter's flowing content as a detached element, from trusted HTML.
    function flowFrom(html) {
        const template = document.createElement('template');
        template.innerHTML = html;
        const flow = document.createElement('div');
        flow.appendChild(template.content);
        return flow;
    }

    // One guide page's content: its Markdown with links pointing at the sheets and the
    // pictures marked to be drawn.
    function guideFlow(page, renderer, publicIds) {
        const text = TEXT[state.lang];
        const source = state.sources.get(page.path);
        let html;
        try {
            html = source === null || source === undefined ? `<p class="gp-notice">${escapeHtml(text.offline)}</p>` : renderer.markdown(source);
        } catch (error) {
            console.warn('[guide-print] could not render page', page.id, error);
            html = `<p class="gp-notice">${escapeHtml(text.offline)}</p>`;
        }
        // A template keeps the images inert until their sources are fixed below.
        const template = document.createElement('template');
        template.innerHTML = (page.fallback ? `<p class="gp-notice">${escapeHtml(text.otherLang)}</p>` : '') + html;
        const content = template.content;
        content.querySelectorAll('a[data-page]').forEach((link) => {
            const id = link.dataset.page;
            if (publicIds.has(id)) {
                link.href = `#gp-${id}`;
                link.classList.add('gp-link');
                link.dataset.target = id;
                link.dataset.sheet = NUMBER_PLACEHOLDER;
            } else {
                // A secret (or missing) page: keep the words, never the code.
                link.replaceWith(...link.childNodes);
            }
        });
        content.querySelectorAll('img').forEach((img) => {
            const src = img.getAttribute('src') || '';
            const special = src.match(/^(mob|item):([a-z0-9_]+)$/);
            const figure = img.closest('figure');
            if (special) {
                img.dataset.asset = src;
                img.src = BLANK;
                img.classList.add('gp-pending', `gp-${special[1]}`);
                if (figure) figure.classList.add(`gp-figure-${special[1]}`);
            } else if (/^(mob|item):/.test(src) || !src) {
                img.src = state.placeholder;
                img.classList.add('gp-missing');
            } else {
                img.addEventListener('error', () => {
                    img.src = state.placeholder;
                    img.classList.add('gp-missing');
                }, { once: true });
            }
        });
        const flow = document.createElement('div');
        flow.appendChild(content);
        return flow;
    }

    function tocFlow(pages) {
        const text = TEXT[state.lang];
        const sections = sectionsFor(pages, state.lang).map((section) => {
            const items = section.pages.map((page) => `<li><a href="#gp-${page.id}"><span class="gp-toc-title">${escapeHtml(page.title)}</span><span class="gp-toc-dots"></span><span class="gp-toc-num" data-target="${page.id}">${NUMBER_PLACEHOLDER}</span></a></li>`).join('');
            return `<h2>${escapeHtml(section.title)}</h2><ul class="gp-toc-list">${items}</ul>`;
        }).join('');
        return flowFrom(`<h1>${escapeHtml(text.contents)}</h1>${sections}`);
    }

    function coverSheet(pages) {
        const text = TEXT[state.lang];
        const date = new Date().toLocaleDateString(state.lang === 'ES' ? 'es-ES' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
        const sheet = document.createElement('div');
        sheet.className = 'gp-sheet gp-cover';
        sheet.innerHTML = `<div class="gp-cover-frame">
                <h1>${escapeHtml(text.book)}</h1>
                <img src="guide/img/book.png" alt="">
                <p class="gp-subtitle">${escapeHtml(text.subtitle)}</p>
                <p class="gp-edition">${escapeHtml(text.edition(date, pages.length))}</p>
            </div>`;
        return sheet;
    }

    function emptySheet(title, inGameId) {
        const sheet = document.createElement('div');
        sheet.className = 'gp-sheet';
        sheet.innerHTML = '<div class="gp-head"><span class="gp-head-title"></span><span class="gp-head-id"></span></div><div class="gp-sheet-body"></div><div class="gp-foot"></div>';
        sheet.querySelector('.gp-head-title').textContent = title;
        if (inGameId !== null) sheet.querySelector('.gp-head-id').textContent = TEXT[state.lang].inGame(inGameId);
        return sheet;
    }

    // Draws the mob and item pictures of the chapters, a slice at a time.
    async function drawPictures(images, build) {
        const text = TEXT[state.lang];
        let missing = 0;
        let sliceStart = performance.now();
        for (let i = 0; i < images.length; i++) {
            if (build !== state.build) return null;
            const img = images[i];
            const key = img.dataset.asset;
            if (!state.drawn.has(key)) {
                const [kind, name] = key.split(':');
                state.drawn.set(key, drawAsset(state.engine, kind, name));
            }
            const url = state.drawn.get(key);
            img.src = url || state.placeholder;
            img.classList.remove('gp-pending');
            if (!url) {
                img.classList.add('gp-missing');
                missing++;
            }
            // Keep the browser responsive: give it a frame every ~30 ms of drawing.
            if (performance.now() - sliceStart > 30) {
                setStatus(text.drawing(i + 1, images.length), (i + 1) / images.length);
                await nextFrame();
                sliceStart = performance.now();
            }
        }
        return missing;
    }

    // Measuring needs the real fonts: ask for them explicitly (a font nobody has used yet is
    // not loading, so document.fonts.ready alone would not wait for it).
    async function waitForImagesAndFonts(images) {
        const settle = (img) => (img.complete ? Promise.resolve() : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
        }));
        const fonts = document.fonts
            ? Promise.all(['16px "Atkinson Hyperlegible"', 'bold 16px "Atkinson Hyperlegible"', 'italic 16px "Atkinson Hyperlegible"',
                '16px "Pixelify Sans"', '600 16px "Pixelify Sans"', '16px "VT323"'].map((font) => document.fonts.load(font).catch(() => null)))
                .then(() => document.fonts.ready)
            : Promise.resolve();
        const timeout = new Promise((resolve) => setTimeout(resolve, 15000));
        await Promise.race([Promise.all([...images.map(settle), fonts]), timeout]);
    }

    // The block list of a flow laid out in the measuring sheet (see paginate).
    function measureFlow(body, flow) {
        body.replaceChildren(...flow.childNodes);
        const nodes = [...body.children];
        const bottom = body.getBoundingClientRect().bottom;
        const tops = nodes.map((node) => node.getBoundingClientRect().top);
        const blocks = nodes.map((node, i) => {
            const height = (i + 1 < nodes.length ? tops[i + 1] : bottom) - tops[i];
            const block = { height };
            if (/^H[1-6]$/.test(node.tagName)) block.keepWithNext = true;
            if (node.tagName === 'TABLE' && node.tBodies.length) {
                const rows = [...node.tBodies[0].rows];
                block.rows = rows.map((row) => row.getBoundingClientRect().height);
                block.head = node.tHead ? node.tHead.getBoundingClientRect().height : 0;
                block.chrome = Math.max(0, height - block.head - block.rows.reduce((a, b) => a + b, 0));
            } else if (node.tagName === 'UL' || node.tagName === 'OL') {
                const items = [...node.children].filter((child) => child.tagName === 'LI');
                const itemTops = items.map((item) => item.getBoundingClientRect().top);
                const listBottom = node.getBoundingClientRect().bottom;
                block.items = items.map((item, k) => (k + 1 < items.length ? itemTops[k + 1] : listBottom) - itemTops[k]);
                block.chrome = Math.max(0, height - block.items.reduce((a, b) => a + b, 0));
            }
            return block;
        });
        return { nodes, blocks };
    }

    // A copy of a block for one sheet: only its rows or items `from`..`to` when it splits.
    function pieceNode(node, piece) {
        const copy = node.cloneNode(true);
        if (piece.from === undefined) return copy;
        if (node.tagName === 'TABLE') {
            const rows = [...copy.tBodies[0].rows];
            if (piece.from === 0 && piece.to === rows.length) return copy;
            rows.forEach((row, k) => { if (k < piece.from || k >= piece.to) row.remove(); });
        } else {
            const items = [...copy.children].filter((child) => child.tagName === 'LI');
            if (piece.from === 0 && piece.to === items.length) return copy;
            items.forEach((item, k) => { if (k < piece.from || k >= piece.to) item.remove(); });
            if (copy.tagName === 'OL') copy.start = (node.start || 1) + piece.from;
        }
        if (piece.from > 0) copy.classList.add('gp-continued');
        return copy;
    }

    async function build() {
        const buildId = ++state.build;
        const text = TEXT[state.lang];
        elements.print.disabled = true;
        applySettings();

        let index;
        try {
            index = await loadIndex();
        } catch (_error) {
            setStatus(text.offline, null);
            return;
        }
        if (buildId !== state.build) return;
        const pages = publicPages(index, state.lang);
        const publicIds = new Set(pages.map((page) => page.id));
        await loadSources(pages, buildId);
        if (buildId !== state.build) return;

        // The chapters: the intro, the contents and one per guide page.
        const renderer = createGuideMarkdown();
        const chapters = [
            { title: text.introTitle, inGame: null, anchor: 'gp-intro', flow: flowFrom(text.intro(pages.length, state.paper)) },
            { title: text.contents, inGame: null, anchor: 'gp-contents', flow: tocFlow(pages) },
            ...pages.map((page) => ({ title: page.title, inGame: page.id, anchor: `gp-${page.id}`, flow: guideFlow(page, renderer, publicIds) }))
        ];

        if (state.engine === undefined) {
            setStatus(text.loadingEngine, null);
            if (!state.enginePromise) {
                state.enginePromise = loadEngine().catch((error) => {
                    console.warn('[guide-print] engine failed', error);
                    return null;
                });
            }
            state.engine = await state.enginePromise;
            if (buildId !== state.build) return;
        }
        const pending = chapters.flatMap((chapter) => [...chapter.flow.querySelectorAll('img.gp-pending')]);
        const missing = await drawPictures(pending, buildId);
        if (missing === null) return;
        setStatus(text.waiting, null);
        await waitForImagesAndFonts(chapters.flatMap((chapter) => [...chapter.flow.querySelectorAll('img')]));
        if (buildId !== state.build) return;

        // Measure in an invisible sheet of the same size; a second one gives the room per sheet.
        const host = document.getElementById('gp-measure');
        host.replaceChildren();
        const sample = emptySheet('x', '0');
        sample.querySelector('.gp-foot').textContent = '0';
        const measurer = emptySheet('x', '0');
        measurer.classList.add('gp-measuring');
        host.append(sample, measurer);
        const pageHeight = sample.querySelector('.gp-sheet-body').clientHeight - 4; // the printed sheet is 0.5 mm shorter
        const measureBody = measurer.querySelector('.gp-sheet-body');

        const book = document.createDocumentFragment();
        book.appendChild(coverSheet(pages));
        let sheetNumber = 1;
        const starts = new Map();
        let sliceStart = performance.now();
        for (let c = 0; c < chapters.length; c++) {
            const chapter = chapters[c];
            const { nodes, blocks } = measureFlow(measureBody, chapter.flow);
            const sheets = paginateChapter(blocks, pageHeight);
            starts.set(chapter.anchor, sheetNumber + 1);
            sheets.forEach((pieces, k) => {
                sheetNumber++;
                const sheet = emptySheet(chapter.title, chapter.inGame);
                if (k === 0) sheet.id = chapter.anchor;
                sheet.querySelector('.gp-foot').textContent = String(sheetNumber);
                const body = sheet.querySelector('.gp-sheet-body');
                for (const piece of pieces) body.appendChild(pieceNode(nodes[piece.block], piece));
                book.appendChild(sheet);
            });
            if (performance.now() - sliceStart > 30) {
                setStatus(text.paginating(c + 1, chapters.length), (c + 1) / chapters.length);
                await nextFrame();
                if (buildId !== state.build) return;
                sliceStart = performance.now();
            }
        }
        host.replaceChildren();

        // One numbering: the contents and the links point at the sheet where a page starts.
        book.querySelectorAll('.gp-toc-num').forEach((num) => { num.textContent = String(starts.get(`gp-${num.dataset.target}`) || '?'); });
        book.querySelectorAll('a.gp-link').forEach((link) => { link.dataset.sheet = String(starts.get(`gp-${link.dataset.target}`) || '?'); });
        if (state.paper === 'BOOKLET') elements.book.replaceChildren(imposeBooklets([...book.children]));
        else elements.book.replaceChildren(book);

        const overflowing = [...elements.book.querySelectorAll('.gp-sheet-body')].filter((body) => body.scrollHeight > body.clientHeight + 2);
        if (overflowing.length) console.warn('[guide-print] sheets whose content overflows:', overflowing.map((body) => body.parentNode.querySelector('.gp-foot').textContent));
        elements.print.disabled = false;
        const notes = [state.paper === 'BOOKLET'
            ? text.readyBooklet(sheetNumber, bookletImposition(sheetNumber, state.folios).map((b) => b.folios),
                Math.ceil(sheetNumber / 4), state.longEdge)
            : text.ready(sheetNumber, state.paper)];
        if (!state.engine) notes.push(text.noEngine);
        else if (missing) notes.push(text.partial(missing));
        setStatus(notes.join(' '), null);
    }

    // The A5 sheets, two by two on A4 landscape sides in booklet order (bookletImposition).
    // With a long-edge flip the backs are turned upside down, so they still come out upright.
    function imposeBooklets(sheets) {
        const text = TEXT[state.lang];
        const booklets = bookletImposition(sheets.length, state.folios);
        const out = document.createDocumentFragment();
        const slot = (index) => {
            if (index !== null) return sheets[index];
            const blank = document.createElement('div');
            blank.className = 'gp-sheet gp-blank';
            return blank;
        };
        booklets.forEach((booklet, b) => {
            for (const side of booklet.sides) {
                const label = document.createElement('div');
                label.className = 'gp-spread-label';
                label.textContent = text.bookletLabel(b + 1, booklets.length, side.folio + 1, booklet.folios, side.back);
                const spread = document.createElement('div');
                spread.className = 'gp-spread';
                spread.classList.toggle('gp-turned', side.back && state.longEdge);
                spread.append(slot(side.left), slot(side.right));
                out.append(label, spread);
            }
        });
        return out;
    }

    function setUrlParam(key, value) {
        const url = new URL(window.location.href);
        url.searchParams.set(key, value);
        window.history.replaceState(null, '', url);
    }

    function setLang(lang) {
        if (!LANGS.includes(lang) || lang === state.lang) return;
        state.lang = lang;
        saveSetting('minecloud-guide-lang', lang);
        setUrlParam('lang', lang);
        build();
    }

    function setPaper(paper) {
        if (!PAPERS.includes(paper) || paper === state.paper) return;
        state.paper = paper;
        saveSetting('minecloud-guide-print-paper', paper);
        setUrlParam('paper', paper);
        build();
    }

    function setFolios(value) {
        const folios = Math.max(1, Math.min(FOLIOS_MAX, Math.round(Number(value)) || FOLIOS_DEFAULT));
        if (folios === state.folios) {
            elements.folios.value = String(folios);
            return;
        }
        state.folios = folios;
        saveSetting('minecloud-guide-print-folios', folios);
        setUrlParam('folios', folios);
        build();
    }

    function setLongEdge(on) {
        state.longEdge = on;
        saveSetting('minecloud-guide-print-long-edge', on ? '1' : '0');
        build();
    }

    function setInkSaver(on) {
        document.documentElement.classList.toggle('gp-parchment', !on);
        saveSetting('minecloud-guide-print-ink', on ? '1' : '0');
    }

    function setPixelFont(on) {
        document.documentElement.classList.toggle('gp-pixel', on);
        saveSetting('minecloud-guide-print-pixel', on ? '1' : '0');
    }

    function start() {
        elements.book = document.getElementById('gp-book');
        elements.status = document.getElementById('gp-status');
        elements.progress = document.getElementById('gp-progress');
        elements.print = document.getElementById('gp-print');
        elements.ink = document.getElementById('gp-ink');
        elements.inkLabel = document.getElementById('gp-ink-label');
        elements.paperLabel = document.getElementById('gp-paper-label');
        elements.fonts = [...document.querySelectorAll('.gp-font')];
        elements.langs = [...document.querySelectorAll('.gp-lang')];
        elements.papers = [...document.querySelectorAll('.gp-paper')];
        elements.bookletOptions = document.getElementById('gp-booklet-options');
        elements.folios = document.getElementById('gp-folios');
        elements.foliosLabel = document.getElementById('gp-folios-label');
        elements.longEdge = document.getElementById('gp-long-edge');
        elements.longEdgeLabel = document.getElementById('gp-long-edge-label');

        const ink = loadSetting('minecloud-guide-print-ink') !== '0';
        elements.ink.checked = ink;
        setInkSaver(ink);
        setPixelFont(loadSetting('minecloud-guide-print-pixel') === '1');

        elements.langs.forEach((button) => button.addEventListener('click', () => setLang(button.dataset.lang)));
        elements.papers.forEach((button) => button.addEventListener('click', () => setPaper(button.dataset.paper)));
        elements.folios.addEventListener('change', () => setFolios(elements.folios.value));
        elements.longEdge.addEventListener('change', () => setLongEdge(elements.longEdge.checked));
        // Every setting re-paginates: colours too, so what is printed is what was measured.
        elements.ink.addEventListener('change', () => {
            setInkSaver(elements.ink.checked);
            build();
        });
        elements.fonts.forEach((button) => button.addEventListener('click', () => {
            const pixel = button.dataset.pixel === '1';
            if (pixel === document.documentElement.classList.contains('gp-pixel')) return;
            setPixelFont(pixel);
            build();
        }));
        elements.print.addEventListener('click', () => window.print());
        build();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
